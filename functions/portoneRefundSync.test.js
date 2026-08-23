/**
 * PortOne refund sync unit tests (no Firestore / network).
 * Run: node portoneRefundSync.test.js
 */
'use strict';

const assert = require('assert');
const m = require('./portoneRefundSync');

function testAmounts() {
  const a = m.parsePortOneAmounts({
    status: 'CANCELLED',
    amount: { total: 9900, paid: 0, cancelled: 9900 },
    cancellations: [{ id: 'c1', status: 'SUCCEEDED', cancelledAt: '2026-08-23T01:00:00Z' }]
  });
  assert.strictEqual(a.paid, 0);
  assert.strictEqual(a.cancelled, 9900);
  assert.strictEqual(a.refunded, 9900);
  assert.deepStrictEqual(a.cancellationIds, ['c1']);

  const sparse = m.parsePortOneAmounts({
    status: 'CANCELLED',
    amount: { total: 9900 }
  });
  assert.strictEqual(sparse.paid, 0);
  assert.strictEqual(sparse.cancelled, 9900);

  // Real PortOne full-cancel shape: paid still shows original until normalized.
  const liveShape = m.parsePortOneAmounts({
    status: 'CANCELLED',
    amount: { total: 9900, paid: 9900, cancelled: 9900 }
  });
  assert.strictEqual(liveShape.paid, 0);
  assert.strictEqual(liveShape.cancelled, 9900);
  console.log('ok amounts');
}

function testStatusMap() {
  assert.strictEqual(m.mapProviderStatus('PAID', { paid: 35000, cancelled: 0 }, 'completed'), 'completed');
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 35000 }, 'completed'), 'refunded');
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 35000 }, 'pending'), 'cancelled');
  assert.strictEqual(m.mapProviderStatus('PARTIAL_CANCELLED', { paid: 10000, cancelled: 25000 }, 'completed'), 'partially_refunded');
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 35000 }, 'duplicate_refunded'), 'duplicate_refunded');
  // Past review can upgrade to refunded when provider still shows full cancel.
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 129000 }, 'refund_review_required'), 'refunded');
  console.log('ok status map');
}

function testCreditReclaim() {
  const unused = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: 35, isFullCancel: true });
  assert.strictEqual(unused.action, 'reclaim');
  assert.strictEqual(unused.reclaim, 30);

  const used = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: 5, isFullCancel: true });
  assert.strictEqual(used.action, 'review');
  assert.strictEqual(used.reclaim, 0);

  const zero = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: 0, isFullCancel: true });
  assert.strictEqual(zero.action, 'review');
  assert.strictEqual(zero.reclaim, 0);

  const unknown = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: null, isFullCancel: true });
  assert.strictEqual(unknown.action, 'review');

  const idem = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: 30, alreadyReclaimed: 30, isFullCancel: true });
  assert.strictEqual(idem.action, 'none');

  const partial = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: 30, isFullCancel: false });
  assert.strictEqual(partial.action, 'review');
  assert.strictEqual(partial.reason, 'partial_cancel_no_auto_reclaim');
  console.log('ok credit reclaim');
}

function testLicenseRevoke() {
  const passFull = m.decideLicenseRevoke({
    grant: { kind: 'pass', productId: 'PASS_7D', durationDays: 7, status: 'active' },
    order: { productId: 'PASS_7D', plan: 'period', durationDays: 7 },
    license: { plan: 'period', expiresAt: { seconds: Math.floor(Date.now() / 1000) + 7 * 86400 }, portonePaymentId: 'pay_a' },
    paymentId: 'pay_a',
    isFullCancel: true,
    isPartial: false
  });
  assert.strictEqual(passFull.action, 'revoke_pass');

  const already = m.decideLicenseRevoke({
    grant: { kind: 'pass', productId: 'PASS_7D', status: 'revoked', revokedAt: 'x' },
    order: { productId: 'PASS_7D', licenseRevoked: true, entitlementStatus: 'revoked' },
    license: { plan: 'period', passProductId: 'PASS_7D', expiresAt: { seconds: Math.floor(Date.now() / 1000) + 7 * 86400 } },
    paymentId: 'pay_a',
    isFullCancel: true,
    isPartial: false
  });
  assert.strictEqual(already.action, 'revoke_pass');
  assert.strictEqual(already.reason, 'reconcile_stale_period_license');

  const alreadyClean = m.decideLicenseRevoke({
    grant: { kind: 'pass', productId: 'PASS_7D', status: 'revoked', revokedAt: 'x' },
    order: { productId: 'PASS_7D', licenseRevoked: true, entitlementStatus: 'revoked' },
    license: { plan: 'trial', status: 'active' },
    paymentId: 'pay_a',
    isFullCancel: true,
    isPartial: false
  });
  assert.strictEqual(alreadyClean.action, 'none');

  assert.strictEqual(m.stalePeriodMaterialization({ plan: 'period', passProductId: 'PASS_7D' }), true);
  assert.strictEqual(m.stalePeriodMaterialization({ plan: 'trial' }), false);
  assert.strictEqual(m.stalePeriodMaterialization({ plan: 'lifetime' }), false);

  const partial = m.decideLicenseRevoke({
    grant: { kind: 'pass', productId: 'PASS_7D', status: 'active' },
    order: { productId: 'PASS_7D' },
    license: { plan: 'period' },
    paymentId: 'pay_a',
    isFullCancel: false,
    isPartial: true
  });
  assert.strictEqual(partial.action, 'review');
  assert.strictEqual(partial.reason, 'partial_cancel_no_auto_revoke');

  const lifeSafe = m.decideLicenseRevoke({
    grant: { kind: 'lifetime', productId: 'LIFETIME', status: 'active' },
    order: { productId: 'LIFETIME', plan: 'lifetime' },
    license: { plan: 'lifetime', portonePaymentId: 'pay_life' },
    paymentId: 'pay_life',
    isFullCancel: true,
    isPartial: false
  });
  assert.strictEqual(lifeSafe.action, 'revoke_lifetime');

  const lifeAmbiguous = m.decideLicenseRevoke({
    grant: { kind: 'lifetime', productId: 'LIFETIME', status: 'active' },
    order: { productId: 'LIFETIME' },
    license: { plan: 'lifetime', portonePaymentId: 'other_pay' },
    paymentId: 'pay_life',
    isFullCancel: true,
    isPartial: false
  });
  assert.strictEqual(lifeAmbiguous.action, 'review');

  const passWhileLife = m.decideLicenseRevoke({
    grant: { kind: 'pass', productId: 'PASS_7D', durationDays: 7, status: 'active' },
    order: { productId: 'PASS_7D' },
    license: { plan: 'lifetime', portonePaymentId: 'life_pay' },
    paymentId: 'pay_7',
    isFullCancel: true,
    isPartial: false
  });
  assert.strictEqual(passWhileLife.action, 'revoke_grant_only');
  console.log('ok license revoke');
}

function testProductDetect() {
  assert.strictEqual(m.isCreditOrder({ productId: 'CREDIT_30' }), true);
  assert.strictEqual(m.creditGrantFromOrder({ productId: 'CREDIT_30' }), 30);
  assert.strictEqual(m.isLicenseOrder({ productId: 'LIFETIME' }), true);
  assert.strictEqual(m.isLicenseOrder({ productId: 'PASS_30D' }), true);
  assert.strictEqual(m.isCreditOrder({ productId: 'LIFETIME' }), false);
  console.log('ok product detect');
}

function testWebhookExtract() {
  assert.strictEqual(m.extractPaymentIdFromWebhook({
    type: 'Transaction.Cancelled',
    data: { paymentId: 'pay_abc' }
  }), 'pay_abc');
  const ids = m.cancellationEventIds('pay_abc', { cancellationIds: ['c1', 'c1'] });
  assert.deepStrictEqual(ids, ['pay_abc_c1']);
  const skip = m.verifyPortOneWebhookSignature('{}', {}, '');
  assert.strictEqual(skip.ok, true);
  assert.strictEqual(skip.skipped, true);
  const ts = String(Math.floor(Date.now() / 1000));
  const bad = m.verifyPortOneWebhookSignature('{}', {
    'webhook-id': '1',
    'webhook-timestamp': ts,
    'webhook-signature': 'v1,nope'
  }, 'whsec_dGVzdA');
  assert.strictEqual(bad.ok, false);
  console.log('ok webhook extract');
}

function testNoNegativeBalance() {
  for (const bal of [0, 1, 5, 29, 30, 100]) {
    const d = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: bal, isFullCancel: true });
    assert.ok(bal - d.reclaim >= 0, 'negative ' + bal);
  }
  console.log('ok no negative balance');
}

function testReconcileFilter() {
  assert.strictEqual(m.shouldReconcileOrder({
    provider: 'portone',
    status: 'completed',
    paymentId: 'x'
  }), true);
  assert.strictEqual(m.shouldReconcileOrder({
    provider: 'portone',
    status: 'refunded',
    paymentId: 'x',
    licenseIssued: true,
    licenseRevoked: false
  }), true);
  assert.strictEqual(m.shouldReconcileOrder({
    provider: 'portone',
    status: 'refunded',
    paymentId: 'x',
    licenseIssued: true,
    licenseRevoked: true,
    entitlementStatus: 'revoked',
    lastSyncedAt: { seconds: Math.floor(Date.now() / 1000) }
  }), false);
  assert.strictEqual(m.shouldReconcileOrder({
    paypalOrderId: 'P',
    status: 'completed'
  }), false);
  console.log('ok reconcile filter');
}

testAmounts();
testStatusMap();
testCreditReclaim();
testLicenseRevoke();
testProductDetect();
testWebhookExtract();
testNoNegativeBalance();
testReconcileFilter();
console.log('all portoneRefundSync tests passed');
