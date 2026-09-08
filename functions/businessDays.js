/**
 * Korea business-day calculator for settlementDate (D+N).
 * Weekends + 대한민국 법정공휴일/대체공휴일 (koreanHolidays.js).
 * Does not move an already-provided PortOne settlementDate.
 * UI D-N after a date is fixed uses countCalendarDays, not this skip logic.
 */

'use strict';

const holidays = require('./koreanHolidays');

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

function addCalendarDay(year, month, day, delta) {
  const dt = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function weekdayUtc(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWeekendYmd(year, month, day) {
  const dow = weekdayUtc(year, month, day);
  return dow === 0 || dow === 6;
}

function optionsOf(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const excluded = Array.isArray(data.excludedDates) ? data.excludedDates : [];
  return {
    excludeWeekends: data.excludeWeekends !== false,
    excludeKoreanHolidays: data.excludeKoreanHolidays !== false,
    excludedDates: excluded.map((d) => String(d || '').trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  };
}

function isNonBusinessDay(ymd, options) {
  const parsed = parseYmd(ymd);
  if (!parsed) return false;
  const opts = optionsOf(options);
  if (opts.excludeWeekends && isWeekendYmd(parsed.year, parsed.month, parsed.day)) return true;
  if (opts.excludeKoreanHolidays && holidays.isKoreanHoliday(ymd)) return true;
  if (opts.excludedDates.indexOf(ymd) >= 0) return true;
  return false;
}

function clampBusinessDays(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(60, n);
}

/**
 * Count starts the NEXT calendar day after startYmd.
 */
function addBusinessDays(startYmd, businessDays, options, fallbackDays) {
  const parsed = parseYmd(startYmd);
  if (!parsed) return '';
  const days = clampBusinessDays(businessDays, fallbackDays || 7);
  let cursor = addCalendarDay(parsed.year, parsed.month, parsed.day, 1);
  let counted = 0;
  let guard = 0;
  while (counted < days && guard < 800) {
    const ymd = formatYmd(cursor.year, cursor.month, cursor.day);
    if (!isNonBusinessDay(ymd, options)) {
      counted += 1;
      if (counted >= days) return ymd;
    }
    cursor = addCalendarDay(cursor.year, cursor.month, cursor.day, 1);
    guard += 1;
  }
  return formatYmd(cursor.year, cursor.month, cursor.day);
}

/**
 * Business days in (fromYmd, toYmd]. Used when producing settlementDate.
 * Does not rewrite toYmd even if it falls on a weekend/holiday.
 */
function countBusinessDaysExclusiveStart(fromYmd, toYmd, options) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (!from || !to) return 0;
  if (String(fromYmd) >= String(toYmd)) return 0;
  let cursor = addCalendarDay(from.year, from.month, from.day, 1);
  let counted = 0;
  let guard = 0;
  while (formatYmd(cursor.year, cursor.month, cursor.day) <= String(toYmd) && guard < 800) {
    const ymd = formatYmd(cursor.year, cursor.month, cursor.day);
    if (!isNonBusinessDay(ymd, options)) counted += 1;
    cursor = addCalendarDay(cursor.year, cursor.month, cursor.day, 1);
    guard += 1;
  }
  return counted;
}

/**
 * Calendar day difference, equivalent to ChronoUnit.DAYS.between(from, to).
 * Does not skip weekends or holidays. Use for UI D-N after settlementDate is final.
 */
function countCalendarDays(fromYmd, toYmd) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (!from || !to) return 0;
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86400000);
}

function compareYmd(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

module.exports = {
  HOLIDAY_SOURCE: holidays.HOLIDAY_SOURCE,
  formatYmd,
  parseYmd,
  addCalendarDay,
  isWeekendYmd,
  isNonBusinessDay,
  addBusinessDays,
  countBusinessDaysExclusiveStart,
  countCalendarDays,
  compareYmd
};
