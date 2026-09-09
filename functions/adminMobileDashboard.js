/**
 * MidiAI Admin mobile dashboard — HTTPS read APIs for Android.
 * Reuses adminDevices deviceSecret auth. Does not rewrite payment / license / PASS logic.
 * Source of truth: orders (PortOne + PayPal). creditPurchases / pointPurchases only when
 * that paymentId is not already on an order (PortOne Credit packs).
 */

'use strict';

const adminPush = require('./adminPush');
const adminSettlement = require('./adminSettlement');

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
  'complete',
  'paid',
  'verified',
  'license_issued',
  'partially_refunded',
  'refunded',
  'refund_review_required',
  'credited',
  'success',
  'succeeded',
  'successful',
  'approved'
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
  return row.completedAt || row.issuedAt || row.verifiedAt || row.paidAt || row.approvedAt || row.createdAt || null;
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
  const canonical = canonicalStatus(row);
  if (canonical === 'partially_refunded') return 'partial';
  if (canonical === 'refunded' || canonical === 'cancelled') return 'refunded';
  return 'none';
}

function canonicalStatus(row) {
  const st = statusOf(row);
  if (st === 'failed') return 'failed';
  if (st === 'created' || st === 'pending' || st === 'pay_pending') return 'pending';
  if (st === 'cancelled' || st === 'canceled') return 'cancelled';
  const gross = amountKrw(row);
  const refunded = refundAmountOf(row);
  if (st === 'partially_refunded' || (refunded > 0 && gross > 0 && refunded < gross)) {
    return 'partially_refunded';
  }
  if (st === 'refunded' || st === 'refund_review_required' || (refunded > 0 && refunded >= gross && gross > 0)) {
    return 'refunded';
  }
  if (PAID_STATUS.has(st) || wasSuccessfulPayment(row)) return 'paid';
  return 'pending';
}

function displayProduct(row) {
  const id = String((row && (row.productId || row.productCanonicalId)) || '').toUpperCase();
  const raw = String((row && (row.productName || row.orderName || row.product)) || '').trim();
  const blob = `${id} ${raw}`.toLowerCase();
  if (id === 'LIFETIME' || /lifetime/.test(blob)) return '평생 이용권';
  if (id === 'PASS_90D' || /90\s*일/.test(blob) || /90\s*day/.test(blob)) return '90일 PASS';
  if (id === 'PASS_30D' || /30\s*일/.test(blob) || /30\s*day/.test(blob) || /30일 full/.test(blob)) {
    return '30일 PASS';
  }
  if (id === 'PASS_7D' || /7\s*일/.test(blob) || /7\s*day/.test(blob) || /7일 full/.test(blob)) {
    return '7일 PASS';
  }
  if (id.indexOf('CREDIT') === 0 || /credit|크레딧|포인트/.test(blob)) {
    return raw || '크레딧';
  }
  if (raw) return raw;
  const plan = String((row && row.plan) || '').toLowerCase();
  if (plan === 'lifetime') return '평생 이용권';
  if (plan === 'period') return 'PASS';
  if (plan === 'credits') return '크레딧';
  return String((row && row.productId) || 'MidiAI Studio');
}

function matchesPaymentFilter(status, filter) {
  const f = String(filter || 'paid').toLowerCase();
  if (f === 'all') {
    return status === 'paid' || status === 'partially_refunded' || status === 'refunded'
      || status === 'cancelled' || status === 'failed';
  }
  if (f === 'refund' || f === 'refunds') {
    return status === 'partially_refunded' || status === 'refunded';
  }
  if (f === 'failed') return status === 'failed';
  if (f === 'cancelled' || f === 'canceled' || f === 'cancel') return status === 'cancelled';
  return status === 'paid';
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
  const method = String((row && (row.paymentMethod || row.method || row.pgProvider)) || '').toLowerCase();
  if (method.indexOf('kakao') >= 0) return 'kakaopay';
  const p = String((row && row.provider) || '').trim().toLowerCase();
  if (p.indexOf('kakao') >= 0) return 'kakaopay';
  if (p === 'paypal' || (row && (row.paypalOrderId || row.paypalCaptureId))) return 'paypal';
  if (p === 'portone' || p === 'iamport') return 'portone';
  if (p) return p;
  if (row && (row.portonePaymentId || row.portoneTransactionId)) return 'portone';
  return 'portone';
}

function productOf(row) {
  return displayProduct(row);
}

function emailOf(row) {
  return String((row && (row.email || row.payerEmail)) || '').trim();
}

function mapPayment(id, row, opts) {
  const data = row || {};
  const paymentId = paymentIdOf(id, data);
  const paidAt = paidAtOf(data);
  const refundAt = refundAtOf(data);
  const currency = String(data.currency || CURRENCY).toUpperCase() || CURRENCY;
  const gross = amountKrw(data);
  const refunded = refundAmountOf(data);
  const net = Math.max(0, gross - refunded);
  const status = canonicalStatus(data);
  const out = {
    paymentId,
    provider: providerOf(data),
    product: productOf(data),
    status,
    grossAmount: gross,
    refundAmount: refunded,
    netAmount: net,
    amount: gross,
    currency,
    emailMasked: adminPush.maskEmail(emailOf(data)),
    displayName: adminPush.personName(data, data.uid),
    paidAt: toIso(paidAt) || undefined,
    refundedAt: toIso(refundAt) || undefined,
    refundedAmount: refunded,
    adminUrl: PAYMENT_URL
  };
  if (opts && opts.detail) {
    out.refundStatus = refundStatusOf(data);
    if (opts.events) out.events = opts.events;
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
    displayName: adminPush.personName(data, data.uid),
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
  const snaps = await Promise.all([
    queryTimeRange(db, 'orders', 'completedAt', start, end, AGG_LIMIT),
    queryTimeRange(db, 'orders', 'paidAt', start, end, AGG_LIMIT),
    queryTimeRange(db, 'orders', 'approvedAt', start, end, AGG_LIMIT),
    queryTimeRange(db, 'orders', 'createdAt', start, end, AGG_LIMIT),
    queryTimeRange(db, 'creditPurchases', 'createdAt', start, end, AGG_LIMIT),
    queryTimeRange(db, 'pointPurchases', 'createdAt', start, end, AGG_LIMIT)
  ]);
  snaps.forEach((snap) => collectFromSnap(snap, seen, out));
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
    grossRevenue: revenue,
    netRevenue: revenue - refundAmount,
    payments: paidRows.length,
    refundAmount,
    refunds: refundRows.length
  };
  if (extras && extras.inquiries != null) out.inquiries = extras.inquiries;
  if (extras && extras.critical != null) out.critical = extras.critical;
  return out;
}

function settlementUnavailable() {
  return {
    settlementDataAvailable: false,
    reason: 'PG 정산 데이터 연동 필요',
    nextSettlement: null,
    recentSettlements: []
  };
}

function settlementHelpers() {
  return {
    tsMs,
    kstParts,
    addCalendarDay,
    formatYmd,
    paidAtOf,
    refundAtOf,
    mapPayment,
    wasSuccessfulPayment,
    isTestPayment,
    canonicalStatus,
    paymentIdOf
  };
}

function lookbackStart(now) {
  const parts = kstParts(now);
  const start = addCalendarDay(parts.year, parts.month, parts.day, -adminSettlement.LOOKBACK_DAYS);
  return new Date(zonedLocalToUtcMs(start.year, start.month, start.day, 0, 0, 0, TZ));
}

async function loadSettlementRows(db, now) {
  const start = lookbackStart(now);
  const endParts = addCalendarDay(kstParts(now).year, kstParts(now).month, kstParts(now).day, 1);
  const end = new Date(zonedLocalToUtcMs(endParts.year, endParts.month, endParts.day, 0, 0, 0, TZ));
  const [paidRows, refundRows] = await Promise.all([
    loadPaidInRange(db, start, end),
    loadRefundsInRange(db, start, end)
  ]);
  return mergeRefundParents(db, paidRows, refundRows);
}

async function buildSettlementPayload(db, now) {
  const loaded = await adminSettlement.loadSettings(db);
  const rows = await loadSettlementRows(db, now);
  return adminSettlement.buildSettlementDashboard({
    rows,
    settings: loaded.settings,
    settingsSource: loaded.settingsSource,
    now,
    helpers: settlementHelpers()
  });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseYmd(raw) {
  const m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function kstInclusiveRange(fromYmd, toYmd) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (!from || !to) throw httpError(400, 'from/to는 YYYY-MM-DD 형식이어야 합니다.');
  const start = new Date(zonedLocalToUtcMs(from.year, from.month, from.day, 0, 0, 0, TZ));
  const nxt = addCalendarDay(to.year, to.month, to.day, 1);
  const end = new Date(zonedLocalToUtcMs(nxt.year, nxt.month, nxt.day, 0, 0, 0, TZ));
  if (end.getTime() <= start.getTime()) throw httpError(400, '날짜 범위가 올바르지 않습니다.');
  const maxMs = 400 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxMs) throw httpError(400, '조회 기간이 너무 깁니다.');
  return {
    start,
    end,
    from: formatYmd(from.year, from.month, from.day),
    to: formatYmd(to.year, to.month, to.day)
  };
}

function encodeCursor(ms, id) {
  return Buffer.from(JSON.stringify({ t: ms, id: String(id || '') }), 'utf8').toString('base64url');
}

function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    const t = num(parsed && parsed.t, 0);
    const id = String((parsed && parsed.id) || '');
    if (!t) return null;
    return { t, id };
  } catch (_) {
    return null;
  }
}

function applyCursor(list, cursor, limit) {
  let rows = list.slice();
  if (cursor) {
    rows = rows.filter((item) => {
      const ms = tsMs(paidAtOf(item.row)) || tsMs(refundAtOf(item.row));
      if (ms < cursor.t) return true;
      if (ms > cursor.t) return false;
      return String(paymentIdOf(item.id, item.row)) < cursor.id;
    });
  }
  const slice = rows.slice(0, limit);
  const last = slice[slice.length - 1];
  const nextCursor = slice.length === limit && last
    ? encodeCursor(tsMs(paidAtOf(last.row)) || tsMs(refundAtOf(last.row)), paymentIdOf(last.id, last.row))
    : null;
  return { items: slice, nextCursor };
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

async function loadPaymentEvents(db, paymentId, row) {
  const events = [];
  const paidAt = paidAtOf(row);
  if (paidAt) {
    events.push({
      type: 'paid',
      at: toIso(paidAt),
      amount: amountKrw(row)
    });
  }
  const snap = await safeQuery(() => db.collection('portoneRefundEvents')
    .where('paymentId', '==', String(paymentId || ''))
    .limit(20)
    .get());
  const related = docsOf(snap).slice().sort((a, b) => (
    tsMs((a.data() || {}).createdAt) - tsMs((b.data() || {}).createdAt)
  ));
  if (related.length) {
    related.forEach((doc) => {
      const data = doc.data() || {};
      const amt = refundAmountOf(data) || amountKrw(data);
      events.push({
        type: amt > 0 && amt < amountKrw(row) ? 'partially_refunded' : 'refunded',
        at: toIso(data.createdAt || data.refundAt) || undefined,
        amount: amt
      });
    });
  } else {
    const refundAt = refundAtOf(row);
    const refunded = refundAmountOf(row);
    if (refundAt && refunded > 0) {
      events.push({
        type: canonicalStatus(row) === 'partially_refunded' ? 'partially_refunded' : 'refunded',
        at: toIso(refundAt),
        amount: refunded
      });
    }
  }
  return events;
}

async function mergeRefundParents(db, paidRows, refundRows) {
  const byId = new Map();
  for (const item of paidRows) {
    byId.set(paymentIdOf(item.id, item.row), item);
  }
  for (const item of refundRows) {
    const pid = paymentIdOf(item.id, item.row);
    if (!pid || byId.has(pid)) continue;
    const found = await findPaymentRecord(db, pid);
    if (found && wasSuccessfulPayment(found.row)) {
      byId.set(pid, found);
    } else {
      byId.set(pid, { id: pid, row: item.row });
    }
  }
  return Array.from(byId.values());
}

function countFirstPurchases(todayPaid, signupSnap) {
  const signupIds = new Set(docsOf(signupSnap).map((doc) => doc.id));
  if (!signupIds.size) return 0;
  const buyers = new Set();
  for (const item of todayPaid || []) {
    const row = item && item.row ? item.row : {};
    const uid = String(row.uid || row.userId || '').trim();
    if (uid && signupIds.has(uid)) buyers.add(uid);
  }
  return buyers.size;
}

async function getAdminMobileDashboard(body, deps) {
  const firestore = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(firestore, body);
  const now = (deps && deps.now) || new Date();
  const bounds = kstBounds(now);
  const limit = clampLimit(body && body.limit);

  const extraSnapsP = require('./adminMobileOps').fetchHomeExtraSnaps(firestore, bounds, now);
  const settlementP = buildSettlementPayload(firestore, now);
  const [todayPaid, monthPaid, todayRefunds, monthRefunds, inquiries, critical, recentPayments, extraSnaps, settlementFull] = await Promise.all([
    loadPaidInRange(firestore, bounds.todayStart, bounds.todayEnd),
    loadPaidInRange(firestore, bounds.monthStart, bounds.monthEnd),
    loadRefundsInRange(firestore, bounds.todayStart, bounds.todayEnd),
    loadRefundsInRange(firestore, bounds.monthStart, bounds.monthEnd),
    loadInquiries(firestore, bounds.todayStart, bounds.todayEnd, limit),
    loadCritical(firestore, bounds.todayStart, bounds.todayEnd, limit),
    loadRecentPayments(firestore, limit),
    extraSnapsP,
    settlementP
  ]);
  let homeExtras = {
    todaySignups: 0,
    activeLicenses: 0,
    attention: [],
    activity: []
  };
  try {
    homeExtras = require('./adminMobileOps').assembleHomeExtras(extraSnaps, {
      recentPayments,
      recentInquiries: inquiries.recent,
      recentCritical: critical.recent,
      todayRefunds: todayRefunds.length,
      firstPurchasesToday: countFirstPurchases(todayPaid, extraSnaps && extraSnaps.signupSnap)
    });
  } catch (_) { /* extras are best-effort */ }

  const today = summarize(todayPaid, todayRefunds, {
    inquiries: inquiries.todayCount,
    critical: critical.todayCount
  });
  const month = summarize(monthPaid, monthRefunds);
  const settlement = adminSettlement.homeSettlementPreview(settlementFull);
  const next = settlement && settlement.nextSettlement;
  const command = {
    netRevenueToday: today.netRevenue || 0,
    paymentsToday: today.payments || 0,
    refundsToday: today.refunds || 0,
    newMembersToday: homeExtras.todaySignups || 0,
    firstPurchasesToday: homeExtras.firstPurchasesToday || 0,
    waitingInquiryCount: homeExtras.waitingInquiryCount || 0,
    criticalOpenCount: homeExtras.criticalOpenCount || 0,
    actionRequiredCount: homeExtras.actionRequiredCount || 0,
    nextSettlementDate: (next && next.date) || '',
    nextSettlementAmount: next ? Number(next.expectedSettlementAmount || 0) : 0
  };
  const generatedAt = now.toISOString();
  return redactPaymentJson({
    today,
    month,
    currency: CURRENCY,
    generatedAt,
    netRevenue: {
      today: today.netRevenue,
      month: month.netRevenue
    },
    settlement,
    settlementDataAvailable: true,
    isEstimate: true,
    recentPayments,
    recentInquiries: inquiries.recent,
    recentCritical: critical.recent,
    todaySignups: homeExtras.todaySignups || 0,
    activeLicenses: homeExtras.activeLicenses || 0,
    licenseStats: homeExtras.licenseStats || null,
    activeLicensesCapped: false,
    attention: homeExtras.attention || [],
    activity: homeExtras.activity || [],
    recentMembers: Array.isArray(homeExtras.recentMembers)
      ? homeExtras.recentMembers.slice(0, 5)
      : [],
    command
  });
}

async function getAdminSalesReport(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const now = (deps && deps.now) || new Date();
  const bounds = kstBounds(now);
  const from = (body && body.from) || formatYmd(bounds.year, bounds.month, bounds.day);
  const to = (body && body.to) || from;
  const range = kstInclusiveRange(from, to);
  const statusFilter = String((body && body.status) || 'paid').toLowerCase();
  const limit = clampLimit(body && body.limit);
  const cursor = decodeCursor(body && body.cursor);

  const [paidRows, refundRows, failedSnap] = await Promise.all([
    loadPaidInRange(db, range.start, range.end),
    loadRefundsInRange(db, range.start, range.end),
    statusFilter === 'failed' || statusFilter === 'all'
      ? safeQuery(() => db.collection('orders').where('status', '==', 'failed').limit(80).get())
      : Promise.resolve({ docs: [] })
  ]);
  const summary = summarize(paidRows, refundRows);
  const merged = await mergeRefundParents(db, paidRows, refundRows);
  const failedRows = docsOf(failedSnap).map((doc) => ({ id: doc.id, row: doc.data() || {} }))
    .filter((item) => inRange(paidAtOf(item.row) || item.row.createdAt || item.row.updatedAt, range.start, range.end));
  const listSource = statusFilter === 'failed' ? failedRows : merged.concat(statusFilter === 'all' ? failedRows : []);
  const productFilter = String((body && (body.product || body.productId)) || '').trim().toLowerCase();
  const sort = String((body && body.sort) || 'newest').toLowerCase();
  const filtered = listSource
    .filter((item) => matchesPaymentFilter(canonicalStatus(item.row), statusFilter))
    .filter((item) => {
      if (!productFilter || productFilter === 'all') return true;
      const label = displayProduct(item.row).toLowerCase();
      const pid = String((item.row && item.row.productId) || '').toLowerCase();
      return label.indexOf(productFilter) >= 0 || pid.indexOf(productFilter) >= 0;
    })
    .sort((a, b) => {
      const amountA = amountKrw(a.row);
      const amountB = amountKrw(b.row);
      if (sort === 'oldest') {
        return (tsMs(paidAtOf(a.row)) || tsMs(refundAtOf(a.row))) - (tsMs(paidAtOf(b.row)) || tsMs(refundAtOf(b.row)));
      }
      if (sort === 'amount_desc') return amountB - amountA;
      if (sort === 'amount_asc') return amountA - amountB;
      const d = (tsMs(paidAtOf(b.row)) || tsMs(refundAtOf(b.row))) - (tsMs(paidAtOf(a.row)) || tsMs(refundAtOf(a.row)));
      if (d) return d;
      return String(paymentIdOf(b.id, b.row)).localeCompare(String(paymentIdOf(a.id, a.row)));
    });
  const page = applyCursor(filtered, cursor, limit);
  const statusOut = statusFilter === 'refund' || statusFilter === 'refunds' ? 'refund'
    : (statusFilter === 'failed' ? 'failed' : (statusFilter === 'all' ? 'all' : 'paid'));
  return redactPaymentJson({
    period: { from: range.from, to: range.to },
    summary: {
      grossRevenue: summary.grossRevenue,
      refundAmount: summary.refundAmount,
      netRevenue: summary.netRevenue,
      paidCount: summary.payments,
      refundCount: summary.refunds,
      currency: CURRENCY
    },
    status: statusOut,
    payments: page.items.map((item) => mapPayment(item.id, item.row)),
    nextCursor: page.nextCursor
  });
}

function flattenSettlementPayments(full) {
  const out = [];
  const seen = new Set();
  const groups = [].concat((full && full.upcoming) || [], (full && full.pastExpected) || []);
  groups.forEach((group) => {
    (group.payments || []).forEach((payment) => {
      const id = String((payment && payment.paymentId) || '');
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      out.push(payment);
    });
  });
  out.sort((a, b) => String((b && b.paidAt) || '').localeCompare(String((a && a.paidAt) || '')));
  return out;
}

function settlementRecon(paidRows, refundRows, payments) {
  let paidAmount = 0;
  (paidRows || []).forEach((item) => {
    paidAmount += amountKrw(item.row);
  });
  let refundAmount = 0;
  (refundRows || []).forEach((item) => {
    refundAmount += num(item.refundedAmount);
  });
  let settlementCount = 0;
  let settlementAmount = 0;
  let cancelledCount = 0;
  (payments || []).forEach((p) => {
    if (p.estimateStatus === 'CANCELLED_BEFORE_SETTLEMENT' || p.status === 'cancelled' || p.status === 'refunded') {
      if (p.estimateStatus === 'CANCELLED_BEFORE_SETTLEMENT' || p.status === 'cancelled') cancelledCount += 1;
    }
    if (p.estimateStatus === 'CANCELLED_BEFORE_SETTLEMENT') return;
    if (num(p.settlementBase) <= 0) return;
    settlementCount += 1;
    settlementAmount += num(p.expectedSettlementAmount);
  });
  return {
    paidCount: (paidRows || []).length,
    paidAmount,
    refundCount: (refundRows || []).length,
    refundAmount,
    cancelledCount,
    settlementCount,
    settlementAmount
  };
}

async function getAdminSettlementDashboard(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const now = (deps && deps.now) || new Date();
  const loaded = await adminSettlement.loadSettings(db);
  let start;
  let end;
  let period = null;
  if (body && body.from && body.to) {
    const range = kstInclusiveRange(body.from, body.to);
    start = range.start;
    end = range.end;
    period = { from: range.from, to: range.to };
  } else {
    start = lookbackStart(now);
    const endParts = addCalendarDay(kstParts(now).year, kstParts(now).month, kstParts(now).day, 1);
    end = new Date(zonedLocalToUtcMs(endParts.year, endParts.month, endParts.day, 0, 0, 0, TZ));
  }
  const [paidRows, refundRows] = await Promise.all([
    loadPaidInRange(db, start, end),
    loadRefundsInRange(db, start, end)
  ]);
  const rows = await mergeRefundParents(db, paidRows, refundRows);
  const full = adminSettlement.buildSettlementDashboard({
    rows,
    settings: loaded.settings,
    settingsSource: loaded.settingsSource,
    now,
    helpers: settlementHelpers()
  });
  const payments = flattenSettlementPayments(full);
  const recon = settlementRecon(paidRows, refundRows, payments);
  return redactPaymentJson(Object.assign({}, full, { period, payments, recon }));
}

async function getAdminPaymentDetail(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const paymentId = String((body && body.paymentId) || '').trim();
  if (!paymentId) throw httpError(400, 'paymentId가 없습니다.');
  const found = await findPaymentRecord(db, paymentId);
  if (!found) throw httpError(404, '결제 정보를 찾을 수 없습니다.');
  const events = await loadPaymentEvents(db, paymentIdOf(found.id, found.row), found.row);
  const payment = mapPayment(found.id, found.row, { detail: true, events });
  const now = (deps && deps.now) || new Date();
  const loaded = await adminSettlement.loadSettings(db);
  const estimatedSettlement = adminSettlement.estimateForPayment(
    found.id,
    found.row,
    loaded.settings,
    settlementHelpers(),
    now
  );
  payment.estimatedSettlement = estimatedSettlement;
  return redactPaymentJson(Object.assign({ payment, estimatedSettlement }, payment));
}

function createHandlers({ cors }) {
  return {
    getAdminMobileDashboard: adminPush.wrapHttp(cors, (body) => getAdminMobileDashboard(body)),
    getAdminPaymentDetail: adminPush.wrapHttp(cors, (body) => getAdminPaymentDetail(body)),
    getAdminSalesReport: adminPush.wrapHttp(cors, (body) => getAdminSalesReport(body)),
    getAdminSettlementDashboard: adminPush.wrapHttp(cors, (body) => getAdminSettlementDashboard(body))
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
  canonicalStatus,
  displayProduct,
  matchesPaymentFilter,
  kstInclusiveRange,
  formatYmd,
  parseYmd,
  addCalendarDay,
  paidAtOf,
  refundAtOf,
  settlementUnavailable,
  buildSettlementPayload,
  getAdminMobileDashboard,
  getAdminPaymentDetail,
  getAdminSalesReport,
  getAdminSettlementDashboard,
  flattenSettlementPayments,
  loadPaidInRange,
  findPaymentRecord,
  createHandlers,
  clampLimit
};
