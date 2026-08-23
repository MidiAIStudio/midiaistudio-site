/**
 * Period pass stacking + grant recompute tests.
 * Run: node passEntitlement.test.js
 */
'use strict';

const assert = require('assert');
const pe = require('./passEntitlement');

const T = Date.parse('2026-08-23T00:00:00.000Z');
const DAY = pe.DAY_MS;

function ts(ms) {
  return { seconds: Math.floor(ms / 1000) };
}

function grant(paymentId, productId, grantedAtMs, durationDays, overrides = {}) {
  return Object.assign({
    paymentId,
    sourcePaymentId: paymentId,
    uid: 'u1',
    productId,
    kind: 'pass',
    durationDays,
    grantedAt: ts(grantedAtMs),
    status: 'active'
  }, overrides);
}

function revoked(g) {
  return Object.assign({}, g, { status: 'revoked', revokedAt: ts(Date.now()) });
}

function testPurchaseStacking() {
  const now = new Date(T);

  // CASE A — 7-day solo
  const aEnd = pe.computePassExpiresAt(null, 7, now);
  assert.strictEqual(aEnd.getTime(), T + 7 * DAY);

  // CASE B — 7 + 30 while active
  const lic7 = { plan: 'period', licensed: true, status: 'active', expiresAt: ts(T + 7 * DAY), startsAt: ts(T) };
  const bEnd = pe.computePassExpiresAt(lic7, 30, new Date(T + 2 * DAY));
  assert.strictEqual(bEnd.getTime(), T + 37 * DAY);

  const payloadB = pe.buildPassLicensePayload({
    user: { email: 'a@b.c' },
    passProductId: 'PASS_30D',
    durationDays: 30,
    existingLicense: lic7,
    FieldValue: { delete: () => null, serverTimestamp: () => ts(T) },
    Timestamp: { fromDate: (d) => ts(d.getTime()) }
  });
  assert.strictEqual(pe.licenseTsMs(payloadB.startsAt), T);

  // CASE C — 7 + 30 + 90
  const lic37 = { plan: 'period', licensed: true, status: 'active', expiresAt: ts(T + 37 * DAY), startsAt: ts(T) };
  const cEnd = pe.computePassExpiresAt(lic37, 90, new Date(T + 5 * DAY));
  assert.strictEqual(cEnd.getTime(), T + 127 * DAY);

  // CASE D — expired repurchase
  const expiredLic = { plan: 'period', licensed: true, status: 'active', expiresAt: ts(T + 7 * DAY), startsAt: ts(T) };
  const repEnd = pe.computePassExpiresAt(expiredLic, 30, new Date(T + 20 * DAY));
  assert.strictEqual(repEnd.getTime(), T + 50 * DAY);

  // CASE E — 30 + 7
  const lic30 = { plan: 'period', licensed: true, status: 'active', expiresAt: ts(T + 30 * DAY), startsAt: ts(T) };
  const eEnd = pe.computePassExpiresAt(lic30, 7, new Date(T + 5 * DAY));
  assert.strictEqual(eEnd.getTime(), T + 37 * DAY);

  console.log('ok purchase stacking');
}

function testRecomputeCases() {
  // CASE A — within active window
  let r = pe.recomputePeriodEntitlementFromGrants([grant('a', 'PASS_7D', T, 7)], new Date(T + 5 * DAY));
  assert.strictEqual(r.plan, 'period');
  assert.strictEqual(r.startsAt.getTime(), T);
  assert.strictEqual(r.expiresAt.getTime(), T + 7 * DAY);

  const now = new Date(T + 10 * DAY);

  // CASE B
  r = pe.recomputePeriodEntitlementFromGrants([
    grant('a', 'PASS_7D', T, 7),
    grant('b', 'PASS_30D', T + 2 * DAY, 30)
  ], now);
  assert.strictEqual(r.startsAt.getTime(), T);
  assert.strictEqual(r.expiresAt.getTime(), T + 37 * DAY);

  // CASE C
  r = pe.recomputePeriodEntitlementFromGrants([
    grant('a', 'PASS_7D', T, 7),
    grant('b', 'PASS_30D', T + 2 * DAY, 30),
    grant('c', 'PASS_90D', T + 5 * DAY, 90)
  ], now);
  assert.strictEqual(r.startsAt.getTime(), T);
  assert.strictEqual(r.expiresAt.getTime(), T + 127 * DAY);

  // CASE D — expired then new purchase
  r = pe.recomputePeriodEntitlementFromGrants([
    grant('old', 'PASS_7D', T - 30 * DAY, 7),
    grant('new', 'PASS_30D', T + 20 * DAY, 30)
  ], new Date(T + 25 * DAY));
  assert.strictEqual(r.startsAt.getTime(), T + 20 * DAY);
  assert.strictEqual(r.expiresAt.getTime(), T + 50 * DAY);

  // CASE E — 30 + 7
  r = pe.recomputePeriodEntitlementFromGrants([
    grant('a', 'PASS_30D', T, 30),
    grant('b', 'PASS_7D', T + 5 * DAY, 7)
  ], now);
  assert.strictEqual(r.expiresAt.getTime(), T + 37 * DAY);

  console.log('ok recompute purchase cases');
}

function testRefundRecompute() {
  const grants = [
    grant('a', 'PASS_7D', T, 7),
    grant('b', 'PASS_30D', T + 2 * DAY, 30),
    grant('c', 'PASS_90D', T + 3 * DAY, 90)
  ];
  const now = new Date(T + 6 * DAY);

  let r = pe.recomputePeriodEntitlementFromGrants([revoked(grants[0]), grants[1], grants[2]], now);
  assert.strictEqual(r.expiresAt.getTime(), T + 122 * DAY, 'refund first: B+C = 120d from B start');

  r = pe.recomputePeriodEntitlementFromGrants([grants[0], revoked(grants[1]), grants[2]], now);
  assert.strictEqual(r.expiresAt.getTime(), T + 97 * DAY, 'refund middle B: A+C');

  r = pe.recomputePeriodEntitlementFromGrants([grants[0], grants[1], revoked(grants[2])], now);
  assert.strictEqual(r.expiresAt.getTime(), T + 37 * DAY, 'refund last C: A+B');

  r = pe.recomputePeriodEntitlementFromGrants([revoked(grants[0]), revoked(grants[1]), grants[2]], now);
  assert.strictEqual(r.expiresAt.getTime(), T + 93 * DAY, 'refund A+B: C only');

  r = pe.recomputePeriodEntitlementFromGrants([grants[0], revoked(grants[1]), revoked(grants[2])], now);
  assert.strictEqual(r.plan, 'period');
  assert.strictEqual(r.expiresAt.getTime(), T + 7 * DAY, 'refund B+C: A only');

  r = pe.recomputePeriodEntitlementFromGrants(
    [revoked(grants[0]), revoked(grants[1]), revoked(grants[2])],
    now
  );
  assert.strictEqual(r.plan, 'trial', 'refund all → trial');

  console.log('ok refund recompute');
}

function testSubtractionCounterexample() {
  const grants = [
    grant('a', 'PASS_7D', T, 7),
    grant('b', 'PASS_30D', T + 2 * DAY, 30),
    grant('c', 'PASS_90D', T + 3 * DAY, 90)
  ];
  const now = new Date(T + 6 * DAY);
  const currentEnd = T + 127 * DAY;
  const subtractEnd = currentEnd - 7 * DAY;
  const r = pe.recomputePeriodEntitlementFromGrants([revoked(grants[0]), grants[1], grants[2]], now);
  assert.notStrictEqual(subtractEnd, r.expiresAt.getTime(), 'simple subtraction must differ');
  assert.strictEqual(r.expiresAt.getTime(), T + 122 * DAY);
  console.log('ok subtraction counterexample');
}

function testExpiredGrantChain() {
  const r = pe.recomputePeriodEntitlementFromGrants([
    grant('old', 'PASS_7D', T - 40 * DAY, 7),
    grant('new', 'PASS_30D', T, 30)
  ], new Date(T + 5 * DAY));
  assert.strictEqual(r.startsAt.getTime(), T);
  assert.strictEqual(r.expiresAt.getTime(), T + 30 * DAY);
  console.log('ok expired grant chain');
}

function testPurchaseMatchesRecompute() {
  let license = null;
  const purchases = [
    { id: 'a', pid: 'PASS_7D', at: T, days: 7 },
    { id: 'b', pid: 'PASS_30D', at: T + 2 * DAY, days: 30 },
    { id: 'c', pid: 'PASS_90D', at: T + 5 * DAY, days: 90 }
  ];
  const grantList = [];
  for (const p of purchases) {
    const end = pe.computePassExpiresAt(license, p.days, new Date(p.at));
    const wasActive = license && pe.licenseTsMs(license.expiresAt) > p.at;
    license = {
      plan: 'period',
      licensed: true,
      status: 'active',
      startsAt: wasActive && license.startsAt ? license.startsAt : ts(p.at),
      expiresAt: ts(end.getTime())
    };
    grantList.push(grant(p.id, p.pid, p.at, p.days));
  }
  const r = pe.recomputePeriodEntitlementFromGrants(grantList, new Date(T + 10 * DAY));
  assert.strictEqual(pe.licenseTsMs(license.startsAt), r.startsAt.getTime());
  assert.strictEqual(pe.licenseTsMs(license.expiresAt), r.expiresAt.getTime());
  console.log('ok purchase matches recompute');
}

function testTimezoneDisplay() {
  const kstMidnight = Date.parse('2026-08-22T15:00:00.000Z'); // 2026-08-23 KST
  const d = new Date(kstMidnight);
  const localY = d.getFullYear();
  const localM = d.getMonth() + 1;
  const localD = d.getDate();
  assert.ok(localY === 2026 && localM === 8 && (localD === 22 || localD === 23));
  console.log('ok timezone display sanity');
}

function testCatalogPrefersGrantDays() {
  // Catalog ID PASS_7D with grant.durationDays=7 must not become 30 after catalog edit.
  const T = Date.parse('2026-08-01T00:00:00.000Z');
  assert.strictEqual(pe.passDurationDays('PASS_7D', 30), 30);
  assert.strictEqual(pe.passDurationDays('PASS_7D', 7), 7);
  const r = pe.recomputePeriodEntitlementFromGrants([
    grant('a', 'PASS_7D', T, 7)
  ], new Date(T + 2 * pe.DAY_MS));
  assert.strictEqual(r.expiresAt.getTime(), T + 7 * pe.DAY_MS);
  console.log('ok catalog prefers grant days');
}

testPurchaseStacking();
testRecomputeCases();
testRefundRecompute();
testSubtractionCounterexample();
testExpiredGrantChain();
testPurchaseMatchesRecompute();
testTimezoneDisplay();
testCatalogPrefersGrantDays();
console.log('all passEntitlement tests passed');
