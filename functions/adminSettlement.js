/**
 * Ledger-based estimated settlement (contract projection).
 * PortOne PG settlement API is NOT used. No scraping.
 * Projection is read-time only — never stamped onto order docs.
 */

'use strict';

const adminPush = require('./adminPush');
const holidays = require('./koreanHolidays');
const businessDays = require('./businessDays');

const SETTINGS_COL = 'adminSettlementSettings';
const SETTINGS_DOC = 'default';
const LOOKBACK_DAYS = 180;

const DEFAULT_SETTINGS = {
  enabled: true,
  provider: 'kakaopay',
  settlementType: 'business_days',
  businessDays: 7,
  feeRatePercent: 3.2,
  feeVatRatePercent: 10.0,
  excludeWeekends: true,
  excludeKoreanHolidays: true,
  excludedDates: [],
  label: '카카오페이',
  notes: '',
  effectiveFrom: '',
  rateHistory: []
};

const STATUS = {
  UPCOMING: 'UPCOMING',
  PAST_EXPECTED: 'PAST_EXPECTED',
  ADJUSTMENT: 'ADJUSTMENT',
  CANCELLED_BEFORE_SETTLEMENT: 'CANCELLED_BEFORE_SETTLEMENT'
};

const LABELS = {
  UPCOMING: '정산 예정',
  PAST_EXPECTED: '정산 완료',
  ADJUSTMENT: '정산 조정',
  CANCELLED_BEFORE_SETTLEMENT: '정산 제외'
};

const ADJUSTMENT_NOTE = 'PG 정산 반영일 확인 필요';

function httpError(status, message) {
  return adminPush.httpError(status, message);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(num(value, fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampPercent(value, fallback) {
  const n = num(value, fallback);
  if (!Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return Math.round(n * 100) / 100;
}

function uniqYmd(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const ymd = String(raw || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || seen.has(ymd)) return;
    seen.add(ymd);
    out.push(ymd);
  });
  out.sort();
  return out;
}

function normalizeRateHistory(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows.map((row) => ({
    effectiveFrom: String((row && row.effectiveFrom) || '').trim(),
    feeRatePercent: clampPercent(row && row.feeRatePercent, DEFAULT_SETTINGS.feeRatePercent),
    feeVatRatePercent: clampPercent(row && row.feeVatRatePercent, DEFAULT_SETTINGS.feeVatRatePercent)
  })).filter((row) => row.effectiveFrom);
}

function normalizeSettings(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: data.enabled !== false,
    provider: String(data.provider || DEFAULT_SETTINGS.provider).trim() || DEFAULT_SETTINGS.provider,
    settlementType: String(data.settlementType || DEFAULT_SETTINGS.settlementType).trim()
      || DEFAULT_SETTINGS.settlementType,
    businessDays: clampInt(data.businessDays, 1, 60, DEFAULT_SETTINGS.businessDays),
    feeRatePercent: clampPercent(data.feeRatePercent, DEFAULT_SETTINGS.feeRatePercent),
    feeVatRatePercent: clampPercent(data.feeVatRatePercent, DEFAULT_SETTINGS.feeVatRatePercent),
    excludeWeekends: data.excludeWeekends !== false,
    excludeKoreanHolidays: data.excludeKoreanHolidays !== false,
    excludedDates: uniqYmd(data.excludedDates),
    label: String(data.label || DEFAULT_SETTINGS.label).trim() || DEFAULT_SETTINGS.label,
    notes: String(data.notes || '').trim(),
    effectiveFrom: String(data.effectiveFrom || '').trim(),
    rateHistory: normalizeRateHistory(data.rateHistory),
    updatedAt: data.updatedAt || null,
    updatedBy: String(data.updatedBy || '').trim()
  };
}

function publicSettings(settings) {
  return {
    enabled: settings.enabled !== false,
    provider: settings.provider,
    settlementType: settings.settlementType,
    businessDays: settings.businessDays,
    feeRatePercent: settings.feeRatePercent,
    feeVatRatePercent: settings.feeVatRatePercent,
    excludeWeekends: settings.excludeWeekends !== false,
    excludeKoreanHolidays: settings.excludeKoreanHolidays !== false,
    excludedDates: settings.excludedDates.slice(),
    label: settings.label,
    notes: settings.notes,
    effectiveFrom: settings.effectiveFrom || undefined
  };
}

/**
 * Read-time fee versioning. A later fee change does not apply to older paidAt
 * values unless that version's effectiveFrom is on/before the payment's KST date.
 */
function resolveFeeRates(settings, paidAt, helpers) {
  const normalized = normalizeSettings(settings);
  const paidYmd = paidAtYmd(paidAt, helpers);
  const versions = normalized.rateHistory.slice();
  versions.push({
    effectiveFrom: normalized.effectiveFrom || '1970-01-01',
    feeRatePercent: normalized.feeRatePercent,
    feeVatRatePercent: normalized.feeVatRatePercent
  });
  versions.sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  let chosen = {
    feeRatePercent: DEFAULT_SETTINGS.feeRatePercent,
    feeVatRatePercent: DEFAULT_SETTINGS.feeVatRatePercent,
    effectiveFrom: ''
  };
  versions.forEach((row) => {
    const from = String(row.effectiveFrom || '1970-01-01');
    if (!paidYmd || from <= paidYmd) {
      chosen = {
        feeRatePercent: row.feeRatePercent,
        feeVatRatePercent: row.feeVatRatePercent,
        effectiveFrom: from === '1970-01-01' ? '' : from
      };
    }
  });
  return chosen;
}

function paidAtYmd(paidAt, helpers) {
  const ms = helpers.tsMs(paidAt);
  if (!ms) return '';
  const parts = helpers.kstParts(new Date(ms));
  return helpers.formatYmd(parts.year, parts.month, parts.day);
}

function ymdOf(value, helpers) {
  const ms = helpers.tsMs(value);
  if (!ms) return '';
  const parts = helpers.kstParts(new Date(ms));
  return helpers.formatYmd(parts.year, parts.month, parts.day);
}

function weekdayUtc(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWeekendYmd(year, month, day) {
  return businessDays.isWeekendYmd(year, month, day);
}

function isExcludedDay(year, month, day, settings) {
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return businessDays.isNonBusinessDay(ymd, settings);
}

/**
 * Count starts the NEXT KST calendar day after paidAt's KST date.
 * Uses calendar-day increments, not +24h timestamp loops.
 * Only used when PortOne has not provided an actual settlementDate.
 */
function addBusinessDaysKst(date, days, settings, helpers) {
  const ymd = paidAtYmd(date, helpers);
  if (!ymd) return '';
  return businessDays.addBusinessDays(ymd, days, settings, DEFAULT_SETTINGS.businessDays);
}

function ymdFromRaw(raw, helpers) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const m = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return ymdOf(raw, helpers);
}

/**
 * PortOne-imported actual settlement date wins. Calculated dates never overwrite it.
 */
function portoneSettlementDateOf(row, helpers) {
  if (!row || typeof row !== 'object') return '';
  const source = String(row.settlementDateSource || '').toLowerCase();
  const fromNamed = ymdFromRaw(
    row.portoneSettlementDate || row.pgSettlementDate || row.actualSettlementDate,
    helpers
  );
  if (fromNamed) return fromNamed;
  if (source === 'portone' || source === 'pg') {
    return ymdFromRaw(row.settlementDate, helpers);
  }
  if (!source && row.settlementDate && !row.expectedSettlementDate) {
    return ymdFromRaw(row.settlementDate, helpers);
  }
  return '';
}

function settlementUiOf(settlementYmd, todayYmd) {
  if (!settlementYmd) {
    return { code: 'UNKNOWN', label: '', dDay: null, tone: 'neutral' };
  }
  const n = businessDays.countCalendarDays(todayYmd, settlementYmd);
  if (n < 0) {
    return { code: 'SETTLED', label: '정산 완료', dDay: 0, tone: 'success' };
  }
  if (n === 0) {
    return { code: 'DDAY', label: '정산 D-Day', dDay: 0, tone: 'dday' };
  }
  return {
    code: 'DN',
    label: `정산 D-${n}`,
    dDay: n,
    tone: n >= 4 ? 'accent' : 'warning'
  };
}

/** KRW integer. percent is applied with milli-percent integers to avoid float residue. */
function roundCurrency(value) {
  return Math.round(num(value, 0));
}

function applyPercent(amount, percent) {
  const base = roundCurrency(amount);
  const milli = Math.round(num(percent, 0) * 1000);
  if (!base || !milli) return 0;
  return Math.round((base * milli) / 100000);
}

function computeFees(settlementBase, feeRatePercent, feeVatRatePercent) {
  const base = Math.max(0, roundCurrency(settlementBase));
  const fee = applyPercent(base, feeRatePercent);
  const feeVat = applyPercent(fee, feeVatRatePercent);
  return {
    settlementBase: base,
    fee,
    feeVat,
    expectedSettlementAmount: base - fee - feeVat
  };
}

function labelOf(status) {
  return LABELS[status] || LABELS.UPCOMING;
}

function compareYmd(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function eligibleForSettlement(row, helpers) {
  if (!row || helpers.isTestPayment(row)) return false;
  const status = helpers.canonicalStatus(row);
  if (status === 'failed' || status === 'pending') return false;
  return helpers.wasSuccessfulPayment(row);
}

function projectPayment(id, row, settings, helpers, todayYmd) {
  const paidAt = helpers.paidAtOf(row);
  const paidYmd = ymdOf(paidAt, helpers);
  if (!paidYmd) return null;
  const rates = resolveFeeRates(settings, paidAt, helpers);
  const portoneDate = portoneSettlementDateOf(row, helpers);
  const settlementDateSource = portoneDate ? 'portone' : 'calculated';
  const expectedDate = portoneDate || addBusinessDaysKst(paidAt, settings.businessDays, settings, helpers);
  if (!expectedDate) return null;

  const mapped = helpers.mapPayment(id, row);
  const gross = mapped.grossAmount;
  const refundAmount = mapped.refundAmount;
  const paymentStatus = mapped.status;
  const refundYmd = ymdOf(helpers.refundAtOf(row), helpers);
  const fullExit = paymentStatus === 'refunded' || paymentStatus === 'cancelled'
    || (refundAmount > 0 && refundAmount >= gross && gross > 0);
  const refundBefore = !!(refundYmd && refundAmount > 0 && compareYmd(refundYmd, expectedDate) < 0);
  const refundAfter = !!(refundYmd && refundAmount > 0 && compareYmd(refundYmd, expectedDate) >= 0);

  let settlementBase = gross;
  let lineStatus = compareYmd(expectedDate, todayYmd) >= 0 ? STATUS.UPCOMING : STATUS.PAST_EXPECTED;

  if (fullExit && refundBefore) {
    settlementBase = 0;
    lineStatus = STATUS.CANCELLED_BEFORE_SETTLEMENT;
  } else if (refundBefore && refundAmount > 0 && refundAmount < gross) {
    settlementBase = Math.max(0, gross - refundAmount);
  }

  const ui = lineStatus === STATUS.CANCELLED_BEFORE_SETTLEMENT
    ? { code: 'CANCELLED', label: LABELS.CANCELLED_BEFORE_SETTLEMENT, dDay: null, tone: 'neutral' }
    : settlementUiOf(expectedDate, todayYmd);
  const fees = computeFees(settlementBase, rates.feeRatePercent, rates.feeVatRatePercent);
  const payment = {
    paymentId: mapped.paymentId,
    product: mapped.product,
    provider: mapped.provider,
    status: paymentStatus,
    estimateStatus: lineStatus,
    uiStatus: ui.code,
    label: ui.label,
    dDay: ui.dDay,
    tone: ui.tone,
    paidAt: mapped.paidAt,
    refundedAt: mapped.refundedAt,
    grossAmount: gross,
    refundAmount,
    netAmount: mapped.netAmount,
    settlementBase: fees.settlementBase,
    fee: fees.fee,
    feeVat: fees.feeVat,
    expectedSettlementAmount: fees.expectedSettlementAmount,
    expectedSettlementDate: expectedDate,
    settlementDate: expectedDate,
    settlementDateSource,
    isEstimate: settlementDateSource !== 'portone'
  };

  let adjustment = null;
  if (refundAfter && refundAmount > 0 && lineStatus !== STATUS.CANCELLED_BEFORE_SETTLEMENT) {
    const adjFees = computeFees(refundAmount, rates.feeRatePercent, rates.feeVatRatePercent);
    adjustment = {
      paymentId: mapped.paymentId,
      product: mapped.product,
      provider: mapped.provider,
      status: STATUS.ADJUSTMENT,
      estimateStatus: STATUS.ADJUSTMENT,
      label: LABELS.ADJUSTMENT,
      note: ADJUSTMENT_NOTE,
      paidAt: mapped.paidAt,
      refundedAt: mapped.refundedAt,
      grossAmount: -refundAmount,
      refundAmount,
      settlementBase: -adjFees.settlementBase,
      fee: -adjFees.fee,
      feeVat: -adjFees.feeVat,
      expectedSettlementAmount: -adjFees.expectedSettlementAmount,
      expectedSettlementDate: null,
      settlementDate: null,
      settlementDateSource: settlementDateSource,
      isEstimate: true
    };
  }

  return { payment, adjustment, expectedDate, lineStatus };
}

function emptyGroup(date, status) {
  return {
    date: date || null,
    status,
    label: labelOf(status),
    paymentCount: 0,
    grossAmount: 0,
    fee: 0,
    feeVat: 0,
    expectedSettlementAmount: 0,
    isEstimate: true,
    payments: []
  };
}

function addToGroup(group, payment) {
  group.paymentCount += 1;
  group.grossAmount += num(payment.settlementBase);
  group.fee += num(payment.fee);
  group.feeVat += num(payment.feeVat);
  group.expectedSettlementAmount += num(payment.expectedSettlementAmount);
  group.payments.push(payment);
}

function summarizeGroup(group, todayYmd, settings) {
  const out = {
    date: group.date,
    status: group.status,
    label: group.label,
    paymentCount: group.paymentCount,
    grossAmount: group.grossAmount,
    fee: group.fee,
    feeVat: group.feeVat,
    expectedSettlementAmount: group.expectedSettlementAmount,
    isEstimate: true,
    payments: group.payments.slice()
  };
  if (group.status === STATUS.ADJUSTMENT) {
    out.date = null;
    out.note = ADJUSTMENT_NOTE;
    out.label = LABELS.ADJUSTMENT;
    out.uiStatus = 'ADJUSTMENT';
  } else if (group.date) {
    const ui = settlementUiOf(group.date, todayYmd);
    out.label = ui.label;
    out.uiStatus = ui.code;
    out.dDay = ui.dDay;
    out.tone = ui.tone;
  }
  return out;
}

function nextSettlementPreview(group) {
  if (!group) return null;
  return {
    date: group.date,
    paymentCount: group.paymentCount,
    grossAmount: group.grossAmount,
    fee: group.fee,
    feeVat: group.feeVat,
    expectedSettlementAmount: group.expectedSettlementAmount
  };
}

function buildSettlementDashboard({ rows, settings, settingsSource, now, helpers }) {
  const today = helpers.kstParts(now);
  const todayYmd = helpers.formatYmd(today.year, today.month, today.day);
  const upcomingMap = new Map();
  const pastMap = new Map();
  const adjustments = [];

  (rows || []).forEach((item) => {
    if (!eligibleForSettlement(item.row, helpers)) return;
    const projected = projectPayment(item.id, item.row, settings, helpers, todayYmd);
    if (!projected) return;
    const { payment, adjustment, expectedDate, lineStatus } = projected;
    if (lineStatus === STATUS.CANCELLED_BEFORE_SETTLEMENT) {
      const key = expectedDate;
      if (!pastMap.has(key) && !upcomingMap.has(key)) {
        const bucket = compareYmd(expectedDate, todayYmd) >= 0 ? upcomingMap : pastMap;
        const status = compareYmd(expectedDate, todayYmd) >= 0 ? STATUS.UPCOMING : STATUS.PAST_EXPECTED;
        bucket.set(key, emptyGroup(expectedDate, status));
      }
      const group = upcomingMap.get(key) || pastMap.get(key);
      addToGroup(group, payment);
    } else if (compareYmd(expectedDate, todayYmd) >= 0) {
      if (!upcomingMap.has(expectedDate)) upcomingMap.set(expectedDate, emptyGroup(expectedDate, STATUS.UPCOMING));
      addToGroup(upcomingMap.get(expectedDate), payment);
    } else {
      if (!pastMap.has(expectedDate)) pastMap.set(expectedDate, emptyGroup(expectedDate, STATUS.PAST_EXPECTED));
      addToGroup(pastMap.get(expectedDate), payment);
    }
    if (adjustment) adjustments.push(adjustment);
  });

  const upcoming = Array.from(upcomingMap.values())
    .map((group) => summarizeGroup(group, todayYmd, settings))
    .sort((a, b) => compareYmd(a.date, b.date));
  const pastExpected = Array.from(pastMap.values())
    .map((group) => summarizeGroup(group, todayYmd, settings))
    .sort((a, b) => compareYmd(b.date, a.date));
  const adjustmentGroup = adjustments.length
    ? summarizeGroup(adjustments.reduce((group, row) => {
      addToGroup(group, row);
      return group;
    }, emptyGroup(null, STATUS.ADJUSTMENT)), todayYmd, settings)
    : null;

  const nextGroup = upcoming.find((g) => g.expectedSettlementAmount > 0 || g.payments.some((p) => p.estimateStatus === STATUS.UPCOMING))
    || upcoming[0]
    || null;

  return {
    settlementDataAvailable: true,
    isEstimate: true,
    calculationMethod: 'contract_projection',
    settings: publicSettings(settings),
    settingsSource,
    nextSettlement: nextSettlementPreview(nextGroup),
    upcoming,
    pastExpected,
    adjustments: adjustmentGroup ? [adjustmentGroup] : [],
    generatedAt: now.toISOString(),
    holidaySource: holidays.HOLIDAY_SOURCE
  };
}

function estimateForPayment(id, row, settings, helpers, now) {
  const today = helpers.kstParts(now || new Date());
  const todayYmd = helpers.formatYmd(today.year, today.month, today.day);
  if (!eligibleForSettlement(row, helpers)) {
    return {
      isEstimate: true,
      status: null,
      label: null,
      expectedSettlementDate: null,
      settlementBase: 0,
      fee: 0,
      feeVat: 0,
      expectedSettlementAmount: 0,
      excluded: true
    };
  }
  const projected = projectPayment(id, row, settings, helpers, todayYmd);
  if (!projected) {
    return {
      isEstimate: true,
      status: null,
      label: null,
      expectedSettlementDate: null,
      settlementBase: 0,
      fee: 0,
      feeVat: 0,
      expectedSettlementAmount: 0
    };
  }
  const p = projected.payment;
  return {
    isEstimate: p.isEstimate !== false,
    status: p.estimateStatus,
    uiStatus: p.uiStatus,
    label: p.label,
    dDay: p.dDay,
    tone: p.tone,
    settlementDateSource: p.settlementDateSource,
    expectedSettlementDate: p.expectedSettlementDate,
    settlementDate: p.settlementDate,
    settlementBase: p.settlementBase,
    fee: p.fee,
    feeVat: p.feeVat,
    expectedSettlementAmount: p.expectedSettlementAmount,
    adjustment: projected.adjustment
      ? {
        status: STATUS.ADJUSTMENT,
        label: LABELS.ADJUSTMENT,
        note: ADJUSTMENT_NOTE,
        settlementBase: projected.adjustment.settlementBase,
        fee: projected.adjustment.fee,
        feeVat: projected.adjustment.feeVat,
        expectedSettlementAmount: projected.adjustment.expectedSettlementAmount
      }
      : null
  };
}

function homeSettlementPreview(full) {
  const next = full && full.nextSettlement;
  const upcomingExists = !!(next && next.date && num(next.expectedSettlementAmount) > 0);
  return {
    settlementDataAvailable: true,
    isEstimate: true,
    calculationMethod: 'contract_projection',
    nextSettlement: upcomingExists ? next : null,
    settings: full.settings,
    settingsSource: full.settingsSource
  };
}

async function loadSettings(db) {
  const snap = await db.collection(SETTINGS_COL).doc(SETTINGS_DOC).get();
  if (!snap.exists) {
    return { settings: normalizeSettings(DEFAULT_SETTINGS), settingsSource: 'default' };
  }
  return { settings: normalizeSettings(snap.data() || {}), settingsSource: 'configured' };
}

async function saveSettings(db, body, uid, now) {
  const current = await loadSettings(db);
  const prev = current.settings;
  const next = normalizeSettings(Object.assign({}, prev, body || {}));
  const today = now || new Date();
  const dash = require('./adminMobileDashboard');
  const parts = dash.kstParts(today);
  const todayYmd = dash.formatYmd(parts.year, parts.month, parts.day);
  const ratesChanged = prev.feeRatePercent !== next.feeRatePercent
    || prev.feeVatRatePercent !== next.feeVatRatePercent;
  if (ratesChanged) {
    const history = prev.rateHistory.slice();
    if (prev.effectiveFrom) {
      history.push({
        effectiveFrom: prev.effectiveFrom,
        feeRatePercent: prev.feeRatePercent,
        feeVatRatePercent: prev.feeVatRatePercent
      });
    }
    next.rateHistory = normalizeRateHistory(history);
    next.effectiveFrom = String((body && body.effectiveFrom) || todayYmd);
  } else {
    next.effectiveFrom = String((body && body.effectiveFrom) || prev.effectiveFrom || todayYmd);
    next.rateHistory = prev.rateHistory.slice();
  }
  const admin = require('firebase-admin');
  const stored = {
    enabled: next.enabled,
    provider: next.provider,
    settlementType: next.settlementType,
    businessDays: next.businessDays,
    feeRatePercent: next.feeRatePercent,
    feeVatRatePercent: next.feeVatRatePercent,
    excludeWeekends: next.excludeWeekends,
    excludeKoreanHolidays: next.excludeKoreanHolidays,
    excludedDates: next.excludedDates,
    label: next.label,
    notes: next.notes,
    effectiveFrom: next.effectiveFrom,
    rateHistory: next.rateHistory,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: String(uid || '')
  };
  await db.collection(SETTINGS_COL).doc(SETTINGS_DOC).set(stored, { merge: true });
  return { settings: next, settingsSource: 'configured' };
}

async function manageAdminSettlementSettings(body, uid, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  const action = String((body && body.action) || 'get').toLowerCase();
  if (action === 'get' || action === 'overview') {
    const loaded = await loadSettings(db);
    return {
      settings: publicSettings(loaded.settings),
      settingsSource: loaded.settingsSource,
      holidaySource: holidays.HOLIDAY_SOURCE
    };
  }
  if (action === 'save' || action === 'update') {
    const saved = await saveSettings(db, body, uid, (deps && deps.now) || new Date());
    return {
      settings: publicSettings(saved.settings),
      settingsSource: saved.settingsSource,
      holidaySource: holidays.HOLIDAY_SOURCE
    };
  }
  throw httpError(400, '알 수 없는 작업입니다.');
}

function createHandlers({ cors, requireAdmin }) {
  return {
    manageAdminSettlementSettings: adminPush.wrapHttp(
      cors,
      (body, uid) => manageAdminSettlementSettings(body, uid),
      { requireAdmin }
    )
  };
}

module.exports = {
  SETTINGS_COL,
  SETTINGS_DOC,
  LOOKBACK_DAYS,
  DEFAULT_SETTINGS,
  STATUS,
  LABELS,
  ADJUSTMENT_NOTE,
  HOLIDAY_SOURCE: holidays.HOLIDAY_SOURCE,
  normalizeSettings,
  publicSettings,
  resolveFeeRates,
  addBusinessDaysKst,
  portoneSettlementDateOf,
  settlementUiOf,
  isExcludedDay,
  isWeekendYmd,
  roundCurrency,
  applyPercent,
  computeFees,
  projectPayment,
  buildSettlementDashboard,
  estimateForPayment,
  homeSettlementPreview,
  loadSettings,
  saveSettings,
  manageAdminSettlementSettings,
  createHandlers
};
