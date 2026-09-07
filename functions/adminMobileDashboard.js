/**
 * MidiAI Admin mobile dashboard — HTTPS read APIs for Android.
 * Reuses adminDevices deviceSecret auth. Does not rewrite payment / license / PASS logic.
 * Source of truth: orders (PortOne + PayPal). creditPurchases / pointPurchases only when
 * that paymentId is not already on an order (PortOne Credit packs).
 */

'use strict';

const adminPush = require('./adminPush');

const TZ = 'Asia/Seoul';
const CURRENCY = 'KRW';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const AGG_LIMIT = 500;
const LOG_SCAN = 80;

const PAYMENT_URL = 'https://midiaistudio.com/admin.html#view=crm&crm=orders';
const INQUIRY_URL = 'https://midiaistudio.com/admin.html#view=support';
const CRITICAL_URL = 'https://midiaistudio.com/admin.html#view=logs';

const PAID_STATUS = new Set([
  'completed',
  'paid',
  'verified',
  'license_issued',
  'partially_refunded',
  'refunded',
  'refund_review_required',
  'credited'
]);

const EXCLUDE_STATUS = new Set([
  'created',
  'failed',
  'pending',
  'pay_pending',
  'duplicate_refunded',
  'duplicate_refund_failed'
]);

function httpError(status, message) {
  return adminPush.httpError(status, message);
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function tsMs(value) {
  if (value == null || value === '') return 0;
  if (typeof value.toMillis === 'function') {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value.toDate === 'function') {
    const d = value.toDate();
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  }
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor(num(value.nanoseconds, 0) / 1e6);
  }
  if (typeof value._seconds === 'number') {
    return value._seconds * 1000;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value < 1e12 ? value * 1000 : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function inRange(value, start, end) {
  const ms = tsMs(value);
  return ms >= start.getTime() && ms < end.getTime();
}

function toIso(value) {
  const ms = tsMs(value);
  return ms ? new Date(ms).toISOString() : '';
}

function tzOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = {};
  dtf.formatToParts(new Date(utcMs)).forEach((p) => {
    if (p.type !== 'literal') parts[p.type] = p.value;
  });
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
}

function zonedLocalToUtcMs(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = utcGuess - tzOffsetMs(utcGuess, timeZone);
  return utcGuess - tzOffsetMs(first, timeZone);
}

function kstParts(now) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = {};
  dtf.formatToParts(now).forEach((p) => {
    if (p.type !== 'literal') parts[p.type] = p.value;
  });
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

function addCalendarDay(year, month, day, delta) {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function kstBounds(now = new Date()) {
  const { year, month, day } = kstParts(now);
  const todayStart = new Date(zonedLocalToUtcMs(year, month, day, 0, 0, 0, TZ));
  const nxt = addCalendarDay(year, month, day, 1);
  const todayEnd = new Date(zonedLocalToUtcMs(nxt.year, nxt.month, nxt.day, 0, 0, 0, TZ));
  const monthStart = new Date(zonedLocalToUtcMs(year, month, 1, 0, 0, 0, TZ));
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const monthEnd = new Date(zonedLocalToUtcMs(nextMonth.year, nextMonth.month, 1, 0, 0, 0, TZ));
  return { todayStart, todayEnd, monthStart, monthEnd, year, month, day };
}

function isTestPayment(row) {
  const env = String((row && (row.environment || row.mode || row.env)) || '').toLowerCase();
  if (env === 'test' || env === 'sandbox') return true;
  if (row && (row.test === true || row.isTest === true || row.sandbox === true)) return true;
  return false;
}

function statusOf(row) {
  return String((row && row.status) || '').toLowerCase();
}

function wasSuccessfulPayment(row) {
  if (!row || typeof row !== 'object') return false;
  if (isTestPayment(row)) return false;
  const st = statusOf(row);
  if (EXCLUDE_STATUS.has(st)) return false;
  if (row.granted === true || row.creditsGranted === true || row.licenseIssued === true) {
    return st !== 'duplicate_refunded' && st !== 'duplicate_refund_failed';
  }
  if (PAID_STATUS.has(st)) return true;
  if (st === 'cancelled' || st === 'canceled') {
    return !!(row.completedAt || row.issuedAt || row.verifiedAt || row.paidAt
      || num(row.refundedAmount || row.cancelledAmount) > 0);
  }
  return false;
}

function paidAtOf(row) {
  return row.completedAt || row.issuedAt || row.verifiedAt || row.paidAt || row.createdAt || null;
}

function refundAtOf(row) {
  return row.refundAt || row.refundedAt || row.cancelledAt || row.canceledAt || null;
}

function amountRaw(row) {
  const v = row.amount != null ? row.amount : row.paidAmount;
  return num(v, 0);
}

function amountKrw(row, raw) {
  const amount = raw != null ? num(raw, 0) : amountRaw(row);
  const currency = String((row && row.currency) || CURRENCY).toUpperCase();
  if (currency === 'KRW' || currency === '원' || !currency) return Math.round(amount);
  if (currency === 'USD') {
    const stored = num(row.effectivePriceKrw || row.listPriceKrw, 0);
    if (stored > 0) return Math.round(stored);
    const fx = num(row.fxRate, 0);
    if (fx > 0) return Math.round(amount * fx);
  }
  return Math.round(amount);
}

function refundAmountOf(row) {
  const explicit = num(row.refundedAmount != null ? row.refundedAmount : row.cancelledAmount, 0);
  if (explicit > 0) return amountKrw(row, explicit);
  const st = statusOf(row);
  if (st === 'refunded' || st === 'cancelled' || st === 'canceled') return amountKrw(row);
  return 0;
}

function refundStatusOf(row) {
  const st = statusOf(row);
  const refunded = refundAmountOf(row);
  const paid = amountKrw(row);
  if (st === 'partially_refunded' || (refunded > 0 && paid > 0 && refunded < paid)) return 'partial';
  if (st === 'refunded' || st === 'cancelled' || st === 'canceled' || refunded > 0) return 'refunded';
  return 'none';
}

function paymentIdOf(id, row) {
  return String((row && (row.paymentId || row.paypalOrderId || row.providerPaymentId || row.portonePaymentId)) || id || '').trim();
}

function dedupKeys(id, row) {
  const keys = [
    paymentIdOf(id, row),
    String(id || '').trim(),
    String((row && row.paypalOrderId) || '').trim(),
    String((row && row.paypalCaptureId) || '').trim(),
    String((row && row.portonePaymentId) || '').trim(),
    String((row && row.providerPaymentId) || '').trim()
  ];
  return keys.filter(Boolean);
}

function providerOf(row) {
  const p = String((row && row.provider) || '').trim();
  if (p) return p;
  if (row && (row.paypalOrderId || row.paypalCaptureId)) return 'paypal';
  if (row && (row.portonePaymentId || row.portoneTransactionId || row.paymentMethod === 'kakaopay')) return 'portone';
  return '';
}

function productOf(row) {
  const name = String((row && (row.productName || row.orderName || row.product)) || '').trim();
  if (name) return name;
  const plan = String((row && row.plan) || '').toLowerCase();
  if (plan === 'lifetime') return 'Lifetime';
  if (plan === 'period') return 'PASS';
  if (plan === 'credits') return 'Credits';
  return String((row && row.productId) || 'MidiAI Studio');
}

function emailOf(row) {
  return String((row && (row.email || row.payerEmail)) || '').trim();
}

function mapPayment(id, row, opts) {
  const data = row || {};
  const paymentId = paymentIdOf(id, data);
  const paidAt = paidAtOf(data);
  const currency = String(data.currency || CURRENCY).toUpperCase() || CURRENCY;
  const out = {
    paymentId,
    provider: providerOf(data),
    product: productOf(data),
    amount: Math.round(amountRaw(data)),
    currency,
    status: String(data.status || ''),
    emailMasked: adminPush.maskEmail(emailOf(data)),
    paidAt: toIso(paidAt) || undefined,
    refundedAmount: Math.round(num(data.refundedAmount != null ? data.refundedAmount : data.cancelledAmount, 0)),
    adminUrl: PAYMENT_URL
  };
  if (opts && opts.detail) {
    out.refundStatus = refundStatusOf(data);
  }
  return out;
}

function mapInquiry(id, row) {
  const data = row || {};
  return {
    inquiryId: String(id || ''),
    title: String(data.title || data.subject || '').trim() || '(제목 없음)',
    category: String(data.category || '').trim(),
    emailMasked: adminPush.maskEmail(data.email || data.payerEmail),
    status: String(data.conversationMode || data.status || ''),
    createdAt: toIso(data.humanRequestedAt || data.createdAt) || undefined,
    adminUrl: INQUIRY_URL
  };
}

function mapCritical(id, row) {
  const data = row || {};
  const summary = String(data.summary || data.body || data.message || data.title || '').slice(0, 180);
  return {
    eventId: String(id || ''),
    title: String(data.title || '중요 시스템 알림').slice(0, 80),
    summary,
    timestamp: toIso(data.createdAt || data.timestamp) || undefined,
    adminUrl: CRITICAL_URL
  };
}

async function assertApprovedDevice(db, body) {
  const found = await adminPush.assertDevice(db, body);
  const status = String((found.data && found.data.status) || '');
  if (status !== 'approved' || !found.data || found.data.enabled !== true) {
    throw httpError(403, '승인된 기기만 이용할 수 있습니다.');
  }
  try {
    const admin = require('firebase-admin');
    await found.ref.set({ lastSeenAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (_) { /* lastSeen is best-effort */ }
  return found;
}

async function safeQuery(run) {
  try {
    return await run();
  } catch (err) {
    console.warn('adminMobileDashboard query', err && err.message ? err.message : err);
    return { docs: [], empty: true };
  }
}

function docsOf(snap) {
  return (snap && snap.docs) || [];
}

async function queryTimeRange(db, col, field, start, end, limit) {
  return safeQuery(() => db.collection(col)
    .where(field, '>=', start)
    .where(field, '<', end)
    .orderBy(field, 'desc')
    .limit(limit || AGG_LIMIT)
    .get());
}

async function queryRecent(db, col, field, limit) {
  return safeQuery(() => db.collection(col)
    .orderBy(field, 'desc')
    .limit(limit || DEFAULT_LIMIT)
    .get());
}

function rememberKeys(seen, id, row) {
  const keys = dedupKeys(id, row);
  for (const key of keys) {
    if (seen.has(key)) return true;
  }
  keys.forEach((key) => seen.add(key));
  return false;
}

function collectFromSnap(snap, seen, out) {
  for (const doc of docsOf(snap)) {
    const row = Object.assign({}, doc.data() || {});
    if (rememberKeys(seen, doc.id, row)) continue;
    out.push({ id: doc.id, row });
  }
}

async function loadPaidInRange(db, start, end) {
  const seen = new Set();
  const out = [];
  const orderSnap = await queryTimeRange(db, 'orders', 'completedAt', start, end, AGG_LIMIT);
  collectFromSnap(orderSnap, seen, out);
  const creditSnap = await queryTimeRange(db, 'creditPurchases', 'createdAt', start, end, AGG_LIMIT);
  collectFromSnap(creditSnap, seen, out);
  const pointSnap = await queryTimeRange(db, 'pointPurchases', 'createdAt', start, end, AGG_LIMIT);
  collectFromSnap(pointSnap, seen, out);
  return out.filter((item) => wasSuccessfulPayment(item.row) && inRange(paidAtOf(item.row), start, end));
}

async function loadRefundsInRange(db, start, end) {
  const seen = new Set();
  const out = [];

  const eventSnap = await queryTimeRange(db, 'portoneRefundEvents', 'createdAt', start, end, AGG_LIMIT);
  for (const doc of docsOf(eventSnap)) {
    const row = doc.data() || {};
    const pid = String(row.paymentId || doc.id || '').trim();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    out.push({
      id: pid,
      row,
      refundedAmount: refundAmountOf(row)
    });
  }

  const statuses = ['refunded', 'partially_refunded', 'cancelled', 'canceled'];
  for (const status of statuses) {
    let snap = await safeQuery(() => db.collection('orders')
      .where('status', '==', status)
      .where('updatedAt', '>=', start)
      .where('updatedAt', '<', end)
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get());
    if (!docsOf(snap).length) {
      snap = await safeQuery(() => db.collection('orders').where('status', '==', status).limit(80).get());
    }
    for (const doc of docsOf(snap)) {
      const row = doc.data() || {};
      if (isTestPayment(row)) continue;
      const st = statusOf(row);
      if (st === 'duplicate_refunded' || st === 'duplicate_refund_failed') continue;
      const when = refundAtOf(row) || row.updatedAt;
      if (!inRange(when, start, end)) continue;
      const pid = paymentIdOf(doc.id, row);
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      out.push({ id: pid, row, refundedAmount: refundAmountOf(row) });
    }
  }
  return out.filter((item) => item.refundedAmount > 0);
}

function summarize(paidRows, refundRows, extras) {
  let revenue = 0;
  for (const item of paidRows) revenue += amountKrw(item.row);
  let refundAmount = 0;
  for (const item of refundRows) refundAmount += item.refundedAmount;
  const out = {
    revenue,
    payments: paidRows.length,
    refundAmount,
    refunds: refundRows.length
  };
  if (extras && extras.inquiries != null) out.inquiries = extras.inquiries;
  if (extras && extras.critical != null) out.critical = extras.critical;
  return out;
}

function isHumanInquiry(row) {
  const mode = String((row && row.conversationMode) || '').toLowerCase();
  return mode === 'waiting_human' || mode === 'human' || !!(row && row.humanRequestedAt);
}

async function loadInquiries(db, todayStart, todayEnd, limit) {
  const seen = new Set();
  const recent = [];
  const today = [];

  const humanRecent = await queryRecent(db, 'supportTickets', 'humanRequestedAt', Math.max(limit, 40));
  const createdRecent = await queryRecent(db, 'supportTickets', 'createdAt', Math.max(limit, 40));
  const humanToday = await queryTimeRange(db, 'supportTickets', 'humanRequestedAt', todayStart, todayEnd, AGG_LIMIT);
  const createdToday = await queryTimeRange(db, 'supportTickets', 'createdAt', todayStart, todayEnd, AGG_LIMIT);
  const todayIds = new Set();

  function consider(doc) {
    const row = doc.data() || {};
    if (!isHumanInquiry(row)) return;
    const when = row.humanRequestedAt || row.createdAt;
    if (inRange(when, todayStart, todayEnd) && !todayIds.has(doc.id)) {
      todayIds.add(doc.id);
      today.push({ id: doc.id, row });
    }
    if (seen.has(doc.id)) return;
    seen.add(doc.id);
    recent.push({ id: doc.id, row });
  }

  docsOf(humanRecent).forEach(consider);
  docsOf(createdRecent).forEach(consider);
  docsOf(humanToday).forEach(consider);
  docsOf(createdToday).forEach(consider);

  recent.sort((a, b) => tsMs(b.row.humanRequestedAt || b.row.createdAt) - tsMs(a.row.humanRequestedAt || a.row.createdAt));
  return {
    todayCount: today.length,
    recent: recent.slice(0, limit).map((item) => mapInquiry(item.id, item.row))
  };
}

async function loadCritical(db, todayStart, todayEnd, limit) {
  let snap = await safeQuery(() => db.collection('adminPushLogs')
    .where('type', '==', 'critical')
    .orderBy('createdAt', 'desc')
    .limit(Math.max(limit, LOG_SCAN))
    .get());
  if (!docsOf(snap).length) {
    snap = await queryRecent(db, 'adminPushLogs', 'createdAt', LOG_SCAN);
  }
  const rows = docsOf(snap)
    .map((doc) => ({ id: doc.id, row: doc.data() || {} }))
    .filter((item) => String(item.row.type || '') === 'critical');
  rows.sort((a, b) => tsMs(b.row.createdAt) - tsMs(a.row.createdAt));
  const todayCount = rows.filter((item) => inRange(item.row.createdAt, todayStart, todayEnd)).length;
  return {
    todayCount,
    recent: rows.slice(0, limit).map((item) => mapCritical(item.id, item.row))
  };
}

async function loadRecentPayments(db, limit) {
  const seen = new Set();
  const out = [];
  const orderSnap = await queryRecent(db, 'orders', 'completedAt', Math.max(limit, 40));
  collectFromSnap(orderSnap, seen, out);
  const creditSnap = await queryRecent(db, 'creditPurchases', 'createdAt', Math.max(limit, 40));
  collectFromSnap(creditSnap, seen, out);
  const pointSnap = await queryRecent(db, 'pointPurchases', 'createdAt', Math.max(limit, 40));
  collectFromSnap(pointSnap, seen, out);
  return out
    .filter((item) => wasSuccessfulPayment(item.row))
    .sort((a, b) => tsMs(paidAtOf(b.row)) - tsMs(paidAtOf(a.row)))
    .slice(0, limit)
    .map((item) => mapPayment(item.id, item.row));
}

async function findPaymentRecord(db, paymentId) {
  const pid = String(paymentId || '').trim();
  if (!pid) return null;
  const direct = [
    ['orders', pid],
    ['creditPurchases', pid],
    ['pointPurchases', pid]
  ];
  for (const pair of direct) {
    const snap = await db.collection(pair[0]).doc(pair[1]).get();
    if (snap.exists) return { id: snap.id, row: snap.data() || {}, source: pair[0] };
  }
  const lookups = [
    ['orders', 'paymentId'],
    ['orders', 'paypalOrderId'],
    ['orders', 'paypalCaptureId'],
    ['orders', 'portonePaymentId'],
    ['orders', 'providerPaymentId'],
    ['creditPurchases', 'paymentId'],
    ['pointPurchases', 'paymentId']
  ];
  for (const pair of lookups) {
    const snap = await safeQuery(() => db.collection(pair[0]).where(pair[1], '==', pid).limit(1).get());
    const doc = docsOf(snap)[0];
    if (doc) return { id: doc.id, row: doc.data() || {}, source: pair[0] };
  }
  return null;
}

function redactPaymentJson(payload) {
  return payload;
}

async function getAdminMobileDashboard(body, deps) {
  const firestore = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(firestore, body);
  const now = (deps && deps.now) || new Date();
  const bounds = kstBounds(now);
  const limit = clampLimit(body && body.limit);

  const [todayPaid, monthPaid, todayRefunds, monthRefunds, inquiries, critical, recentPayments] = await Promise.all([
    loadPaidInRange(firestore, bounds.todayStart, bounds.todayEnd),
    loadPaidInRange(firestore, bounds.monthStart, bounds.monthEnd),
    loadRefundsInRange(firestore, bounds.todayStart, bounds.todayEnd),
    loadRefundsInRange(firestore, bounds.monthStart, bounds.monthEnd),
    loadInquiries(firestore, bounds.todayStart, bounds.todayEnd, limit),
    loadCritical(firestore, bounds.todayStart, bounds.todayEnd, limit),
    loadRecentPayments(firestore, limit)
  ]);

  const today = summarize(todayPaid, todayRefunds, {
    inquiries: inquiries.todayCount,
    critical: critical.todayCount
  });
  const month = summarize(monthPaid, monthRefunds);

  const generatedAt = now.toISOString();
  return redactPaymentJson({
    today,
    month,
    currency: CURRENCY,
    generatedAt,
    netRevenue: {
      today: today.revenue - today.refundAmount,
      month: month.revenue - month.refundAmount
    },
    recentPayments,
    recentInquiries: inquiries.recent,
    recentCritical: critical.recent
  });
}

async function getAdminPaymentDetail(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const paymentId = String((body && body.paymentId) || '').trim();
  if (!paymentId) throw httpError(400, 'paymentId가 없습니다.');
  const found = await findPaymentRecord(db, paymentId);
  if (!found) throw httpError(404, '결제 정보를 찾을 수 없습니다.');
  const payment = mapPayment(found.id, found.row, { detail: true });
  return redactPaymentJson(Object.assign({ payment }, payment));
}

function createHandlers({ cors }) {
  return {
    getAdminMobileDashboard: adminPush.wrapHttp(cors, (body) => getAdminMobileDashboard(body)),
    getAdminPaymentDetail: adminPush.wrapHttp(cors, (body) => getAdminPaymentDetail(body))
  };
}

module.exports = {
  TZ,
  CURRENCY,
  PAYMENT_URL,
  INQUIRY_URL,
  CRITICAL_URL,
  kstBounds,
  zonedLocalToUtcMs,
  tzOffsetMs,
  kstParts,
  tsMs,
  wasSuccessfulPayment,
  isTestPayment,
  amountKrw,
  refundAmountOf,
  refundStatusOf,
  paymentIdOf,
  dedupKeys,
  mapPayment,
  mapInquiry,
  mapCritical,
  summarize,
  getAdminMobileDashboard,
  getAdminPaymentDetail,
  findPaymentRecord,
  createHandlers,
  clampLimit
};
