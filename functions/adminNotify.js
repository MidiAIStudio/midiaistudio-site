/**
 * Admin operational alerts → Kakao Talk "나와의 채팅".
 * Side-effect only: failures must never fail payment / inquiry business paths.
 * Never logs tokens, secrets, or webhook credentials.
 */

const admin = require('firebase-admin');
const { notifyAdmin } = require('./kakaoAdminNotify');

const TICKET_CATEGORY_LABELS = {
  login: '로그인/계정',
  license: '라이선스',
  payment: '결제/환불',
  bug: '오류/버그',
  feature: '기능 문의',
  other: '기타'
};

function truncate(text, max = 80) {
  const s = String(text || '').trim();
  if (s.length <= max) return s || '-';
  return `${s.slice(0, max)}...`;
}

function toDate(value) {
  try {
    if (!value) return new Date();
    if (typeof value.toDate === 'function') return value.toDate();
    if (value._seconds != null) return new Date(value._seconds * 1000);
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
  } catch (_) { /* ignore */ }
  return new Date();
}

/** Format timestamp in Asia/Seoul without exposing raw credentials. */
function formatKst(value) {
  return toDate(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function safeUserLabel(data) {
  const email = String(data.email || data.payerEmail || '').trim();
  if (email) return truncate(email, 60);
  const name = String(data.displayName || data.payerName || data.name || '').trim();
  if (name) return truncate(name, 40);
  const uid = String(data.uid || '').trim();
  if (uid) return `uid:${uid.slice(0, 12)}`;
  return '-';
}

function formatAmount(order) {
  const amount = order.amount ?? order.paidAmount;
  const currency = order.currency || '';
  if (amount == null || amount === '') return '-';
  const num = Number(amount);
  const value = Number.isFinite(num) ? num.toLocaleString('en-US') : String(amount);
  return currency ? `${value} ${currency}` : value;
}

function productLabel(order) {
  return truncate(
    order.productName
      || (order.plan === 'lifetime' ? 'MidiAI Studio Lifetime' : `MidiAI Studio ${order.plan || ''}`.trim())
      || 'MidiAI Studio License',
    80
  );
}

function ticketCategoryLabel(category) {
  const key = String(category || '').trim();
  return TICKET_CATEGORY_LABELS[key] || key || '기타';
}

function isLicenseGrantedOrder(data) {
  if (!data || typeof data !== 'object') return false;
  if (String(data.status || '') !== 'completed') return false;
  if (data.licenseIssued === true) return true;
  if (String(data.provider || '').toLowerCase() === 'paypal' && data.paypalCaptureId) return true;
  return false;
}

function buildPaymentAlert(orderId, data) {
  const order = data || {};
  const title = '💳 MidiAI Studio 결제 완료';
  const message = [
    `상품: ${productLabel(order)}`,
    `금액: ${formatAmount(order)}`,
    `사용자: ${safeUserLabel(order)}`,
    `결제시간: ${formatKst(order.completedAt || order.issuedAt || order.verifiedAt || order.updatedAt)}`
  ].join('\n');
  return { type: 'payment', title, message, orderId: String(orderId || '') };
}

function buildInquiryAlert(ticketId, data) {
  const ticket = data || {};
  const title = '📩 MidiAI Studio 새 문의';
  const subject = truncate(ticket.title || '(제목 없음)', 60);
  const message = [
    `제목: ${subject}`,
    `사용자: ${safeUserLabel(ticket)}`,
    `유형: ${ticketCategoryLabel(ticket.category)}`,
    `등록시간: ${formatKst(ticket.createdAt || ticket.updatedAt)}`
  ].join('\n');
  return { type: 'inquiry', title, message, ticketId: String(ticketId || '') };
}

/**
 * Claim after successful Kakao send.
 * IMPORTANT: Do NOT reuse supportTickets.adminNotified — that flag is for admin UI toasts
 * (client/supportAi set it false on handoff; admin console sets it true when toast shown).
 * Idempotency uses kakaoAlertSent (+ legacy discordNotified).
 */
async function claimAdminNotify(ref) {
  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (data.kakaoAlertSent === true || data.discordNotified === true) return false;
    tx.set(ref, {
      kakaoAlertSent: true,
      kakaoAlertSentAt: admin.firestore.FieldValue.serverTimestamp(),
      adminNotifyChannel: 'kakao'
    }, { merge: true });
    return true;
  });
}

async function alreadyNotified(ref) {
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  return data.kakaoAlertSent === true || data.discordNotified === true;
}

function logAdmin(stage, fields) {
  // console.log is reliably captured on Gen1 Firestore triggers.
  console.log(JSON.stringify({ tag: '[ADMIN_NOTIFY]', stage, ...fields }));
}

/**
 * Inquiry admin alert. Never throws to caller — returns false on failure.
 */
async function notifyInquiryCreated(ticketId, data, ref, deps = {}) {
  const send = deps.notifyAdmin || notifyAdmin;
  const db = deps.db || admin.firestore();
  const FieldValue = deps.FieldValue || admin.firestore.FieldValue;
  try {
    if (await alreadyNotified(ref)) {
      logAdmin('inquiry_skip_already_sent', { ticketId: String(ticketId || '') });
      return true;
    }
    const alert = buildInquiryAlert(ticketId, data || {});
    await send(db, FieldValue, {
      type: alert.type,
      title: alert.title,
      message: alert.message
    });
    const claimed = await claimAdminNotify(ref);
    logAdmin('inquiry_sent', {
      ticketId: String(ticketId || ''),
      claimed: !!claimed
    });
    return true;
  } catch (err) {
    logAdmin('inquiry_failed', {
      ticketId: String(ticketId || ''),
      message: err && err.message ? err.message : String(err),
      kakaoStage: err && err.stage ? err.stage : null,
      kakaoCode: err && err.kakaoCode != null ? err.kakaoCode : null
    });
    return false;
  }
}

/**
 * Payment admin alert. Never throws to caller — returns false on failure.
 */
async function notifyPaymentCompleted(orderId, data, ref, deps = {}) {
  if (!isLicenseGrantedOrder(data)) return false;
  const send = deps.notifyAdmin || notifyAdmin;
  const db = deps.db || admin.firestore();
  const FieldValue = deps.FieldValue || admin.firestore.FieldValue;
  try {
    if (await alreadyNotified(ref)) {
      logAdmin('payment_skip_already_sent', { orderId: String(orderId || '') });
      return true;
    }
    const alert = buildPaymentAlert(orderId, data || {});
    await send(db, FieldValue, {
      type: alert.type,
      title: alert.title,
      message: alert.message
    });
    const claimed = await claimAdminNotify(ref);
    logAdmin('payment_sent', {
      orderId: String(orderId || ''),
      claimed: !!claimed
    });
    return true;
  } catch (err) {
    logAdmin('payment_failed', {
      orderId: String(orderId || ''),
      message: err && err.message ? err.message : String(err),
      kakaoStage: err && err.stage ? err.stage : null,
      kakaoCode: err && err.kakaoCode != null ? err.kakaoCode : null
    });
    return false;
  }
}

module.exports = {
  notifyInquiryCreated,
  notifyPaymentCompleted,
  isLicenseGrantedOrder,
  claimAdminNotify,
  alreadyNotified,
  buildPaymentAlert,
  buildInquiryAlert,
  formatKst,
  formatAmount,
  safeUserLabel,
  productLabel
};
