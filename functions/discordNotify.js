/**
 * Discord admin notifications via webhook secrets.
 * Secrets (never commit real values):
 *   DISCORD_INQUIRY_WEBHOOK
 *   DISCORD_PAYMENT_WEBHOOK
 */

const admin = require('firebase-admin');

const INQUIRY_COLOR = 0x3b82f6; // blue
const PAYMENT_COLOR = 0x22c55e; // green
const FOOTER_TEXT = 'MidiAI Studio';

const TICKET_CATEGORY_LABELS = {
  login: '로그인/계정',
  license: '라이선스',
  payment: '결제/환불',
  bug: '오류/버그',
  feature: '기능 문의',
  other: '기타'
};

function env(name) {
  // defineSecret injects process.env[NAME] when bound via function secrets.
  // Prefer that; fall back to .value() only if a SecretParam object is reachable.
  return String(process.env[name] || '').trim();
}

function truncate(text, max = 500) {
  const s = String(text || '').trim();
  if (s.length <= max) return s || '-';
  return `${s.slice(0, max)}...`;
}

function fmtWhen(value) {
  try {
    if (!value) return new Date().toISOString();
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value._seconds != null) return new Date(value._seconds * 1000).toISOString();
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  } catch (_) { /* ignore */ }
  return new Date().toISOString();
}

function ticketCategoryLabel(category) {
  const key = String(category || '').trim();
  return TICKET_CATEGORY_LABELS[key] || key || '기타';
}

function paymentProviderLabel(order) {
  const provider = String(order.provider || '').toLowerCase();
  const method = String(order.paymentMethod || order.method || '').toLowerCase();
  if (provider === 'paypal' || method === 'paypal') return 'PayPal';
  if (method === 'kakaopay' || provider === 'portone') return 'KakaoPay (PortOne)';
  return provider || method || '-';
}

function formatAmount(order) {
  const amount = order.amount ?? order.paidAmount;
  const currency = order.currency || '';
  if (amount == null || amount === '') return '-';
  const num = Number(amount);
  const value = Number.isFinite(num) ? num.toLocaleString('en-US') : String(amount);
  return currency ? `${value} ${currency}` : value;
}

/**
 * Claim notification slot after a successful Discord post.
 * Returns true once per document so retries stay possible until success.
 */
async function claimDiscordNotify(ref) {
  const db = admin.firestore();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (data.discordNotified === true) return false;
    tx.set(ref, {
      discordNotified: true,
      discordNotifiedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  });
}

async function alreadyNotified(ref) {
  const snap = await ref.get();
  return !!(snap.exists && snap.data()?.discordNotified === true);
}

/**
 * POST Discord webhook embed. Never logs the webhook URL.
 */
async function postDiscordWebhook(webhookUrl, embed) {
  if (!webhookUrl) {
    console.warn('Discord webhook secret missing; skip notify');
    return false;
  }
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i.test(webhookUrl)) {
    console.error('Discord webhook secret is not a valid Discord webhook URL shape');
    return false;
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'MidiAI Studio',
      embeds: [embed]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Discord webhook failed', {
      status: res.status,
      body: String(body).slice(0, 300)
    });
    return false;
  }
  return true;
}

function buildInquiryEmbed(ticketId, data) {
  const createdAt = fmtWhen(data.createdAt);
  return {
    title: '📩 새로운 문의',
    color: INQUIRY_COLOR,
    fields: [
      { name: '제목', value: truncate(data.title || '(제목 없음)', 200), inline: false },
      { name: '작성자', value: truncate(data.displayName || data.name || '-', 100), inline: true },
      { name: '이메일', value: truncate(data.email || '-', 120), inline: true },
      { name: '문의 유형', value: ticketCategoryLabel(data.category), inline: true },
      { name: '내용', value: truncate(data.content || '-', 500), inline: false },
      { name: '작성시간', value: createdAt, inline: true },
      { name: 'Ticket ID', value: `\`${ticketId}\``, inline: true }
    ],
    description: '관리자 페이지에서 확인해주세요.',
    footer: { text: FOOTER_TEXT },
    timestamp: createdAt
  };
}

function buildPaymentEmbed(orderId, data) {
  const paidAt = fmtWhen(data.completedAt || data.issuedAt || data.verifiedAt || data.updatedAt);
  const product = data.productName
    || (data.plan === 'lifetime' ? 'MidiAI Studio Lifetime' : `MidiAI Studio ${data.plan || ''}`.trim())
    || 'MidiAI Studio License';
  return {
    title: '💳 신규 결제 완료',
    color: PAYMENT_COLOR,
    fields: [
      { name: '상품', value: truncate(product, 120), inline: false },
      { name: '구매자', value: truncate(data.payerName || data.displayName || data.name || '-', 100), inline: true },
      { name: 'Google 계정', value: truncate(data.email || data.payerEmail || '-', 120), inline: true },
      { name: 'UID', value: `\`${data.uid || '-'}\``, inline: false },
      { name: '금액', value: formatAmount(data), inline: true },
      { name: '결제수단', value: paymentProviderLabel(data), inline: true },
      { name: '주문번호', value: `\`${orderId}\``, inline: false },
      { name: '결제시간', value: paidAt, inline: true },
      { name: '라이선스 지급', value: '✅ 완료', inline: true }
    ],
    footer: { text: FOOTER_TEXT },
    timestamp: paidAt
  };
}

function isLicenseGrantedOrder(data) {
  if (!data || typeof data !== 'object') return false;
  if (String(data.status || '') !== 'completed') return false;
  // PortOne path sets licenseIssued; PayPal path also sets it after this change.
  if (data.licenseIssued === true) return true;
  // Legacy PayPal docs may only have status=completed after license batch write.
  if (String(data.provider || '').toLowerCase() === 'paypal' && data.paypalCaptureId) return true;
  return false;
}

async function notifyInquiryCreated(ticketId, data, ref) {
  const webhook = env('DISCORD_INQUIRY_WEBHOOK');
  if (!webhook) {
    console.warn('DISCORD_INQUIRY_WEBHOOK not set; inquiry notify skipped', { ticketId });
    return false;
  }
  try {
    if (await alreadyNotified(ref)) return true;
    const ok = await postDiscordWebhook(webhook, buildInquiryEmbed(ticketId, data || {}));
    if (!ok) return false;
    await claimDiscordNotify(ref);
    console.log('Discord inquiry notify sent', { ticketId });
    return true;
  } catch (err) {
    console.error('notifyInquiryCreated failed', {
      ticketId,
      message: err && err.message ? err.message : String(err)
    });
    return false;
  }
}

async function notifyPaymentCompleted(orderId, data, ref) {
  if (!isLicenseGrantedOrder(data)) return false;
  const webhook = env('DISCORD_PAYMENT_WEBHOOK');
  if (!webhook) {
    console.warn('DISCORD_PAYMENT_WEBHOOK not set; payment notify skipped', { orderId });
    return false;
  }
  try {
    if (await alreadyNotified(ref)) return true;
    const ok = await postDiscordWebhook(webhook, buildPaymentEmbed(orderId, data || {}));
    if (!ok) return false;
    await claimDiscordNotify(ref);
    console.log('Discord payment notify sent', { orderId });
    return true;
  } catch (err) {
    console.error('notifyPaymentCompleted failed', {
      orderId,
      message: err && err.message ? err.message : String(err)
    });
    return false;
  }
}

module.exports = {
  notifyInquiryCreated,
  notifyPaymentCompleted,
  isLicenseGrantedOrder,
  claimDiscordNotify,
  buildInquiryEmbed,
  buildPaymentEmbed
};
