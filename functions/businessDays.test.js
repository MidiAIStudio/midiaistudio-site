'use strict';

const assert = require('assert');
const days = require('./businessDays');

const DEFAULT = { excludeWeekends: true, excludeKoreanHolidays: true, excludedDates: [] };

function testAddBusinessDaysSaturdayToSep15() {
  assert.strictEqual(days.addBusinessDays('2026-09-05', 7, DEFAULT), '2026-09-15');
  console.log('ok addBusinessDays Saturday 09/05 + 7 → 09/15');
}

function testWeekendSkip() {
  assert.strictEqual(days.addBusinessDays('2026-09-04', 1, DEFAULT), '2026-09-07');
  assert.strictEqual(
    days.addBusinessDays('2026-09-04', 1, { excludeWeekends: false, excludeKoreanHolidays: false }),
    '2026-09-05'
  );
  console.log('ok weekend skip');
}

function testCountFridayToMondayIs1() {
  assert.strictEqual(days.countBusinessDaysExclusiveStart('2026-09-11', '2026-09-14', DEFAULT), 1);
  assert.strictEqual(days.countBusinessDaysExclusiveStart('2026-09-12', '2026-09-14', DEFAULT), 1);
  assert.strictEqual(days.countBusinessDaysExclusiveStart('2026-09-13', '2026-09-14', DEFAULT), 1);
  assert.strictEqual(days.countBusinessDaysExclusiveStart('2026-09-14', '2026-09-14', DEFAULT), 0);
  console.log('ok Fri/Sat/Sun → Mon D-1 count');
}

function testCountSep9ToSep15Is4() {
  assert.strictEqual(days.countBusinessDaysExclusiveStart('2026-09-09', '2026-09-15', DEFAULT), 4);
  console.log('ok 09/09 → 09/15 business-day count stays 4 (settlementDate math)');
}

function testCalendarDaysForUiDn() {
  assert.strictEqual(days.countCalendarDays('2026-09-09', '2026-09-15'), 6);
  assert.strictEqual(days.countCalendarDays('2026-09-12', '2026-09-15'), 3);
  assert.strictEqual(days.countCalendarDays('2026-09-14', '2026-09-15'), 1);
  assert.strictEqual(days.countCalendarDays('2026-09-15', '2026-09-15'), 0);
  assert.strictEqual(days.countCalendarDays('2026-09-16', '2026-09-15'), -1);
  assert.strictEqual(days.countCalendarDays('2026-09-11', '2026-09-14'), 3);
  assert.strictEqual(days.countCalendarDays('2026-09-12', '2026-09-14'), 2);
  assert.strictEqual(days.countCalendarDays('2026-09-13', '2026-09-14'), 1);
  console.log('ok UI D-N uses calendar days including weekends');
}

function testChuseokHoliday() {
  assert.strictEqual(days.isNonBusinessDay('2026-09-24', DEFAULT), true);
  assert.strictEqual(days.isNonBusinessDay('2026-09-25', DEFAULT), true);
  assert.strictEqual(days.countBusinessDaysExclusiveStart('2026-09-23', '2026-09-28', DEFAULT), 1);
  console.log('ok Chuseok holidays skipped when producing settlementDate');
}

function testPortoneWeekendDateNotMoved() {
  assert.strictEqual(days.addBusinessDays('2026-09-04', 1, DEFAULT), '2026-09-07');
  assert.ok(days.isNonBusinessDay('2026-09-05', DEFAULT));
  console.log('ok calculated dates skip weekends; caller must not rewrite PortOne dates');
}

testAddBusinessDaysSaturdayToSep15();
testWeekendSkip();
testCountFridayToMondayIs1();
testCountSep9ToSep15Is4();
testCalendarDaysForUiDn();
testChuseokHoliday();
testPortoneWeekendDateNotMoved();
console.log('all businessDays tests passed');
