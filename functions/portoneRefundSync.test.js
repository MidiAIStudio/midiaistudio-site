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
    amount: { total: 35000, paid: 0, cancelled: 35000 },
    cancellations: [{ id: 'c1', status: 'SUCCEEDED', cancelledAt: '2026-08-23T01:00:00Z' }]
  });
  assert.strictEqual(a.paid, 0);
  assert.strictEqual(a.cancelled, 35000);
  assert.strictEqual(a.refunded, 35000);
  assert.deepStrictEqual(a.cancellationIds, ['c1']);
  console.log('ok amounts');
}

function testStatusMap() {
  assert.strictEqual(m.mapProviderStatus('PAID', { paid: 35000, cancelled: 0 }, 'completed'), 'completed');
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 35000 }, 'completed'), 'refunded');
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 35000 }, 'pending'), 'cancelled');
  assert.strictEqual(m.mapProviderStatus('PARTIAL_CANCELLED', { paid: 10000, cancelled: 25000 }, 'completed'), 'partially_refunded');
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 35000 }, 'duplicate_refunded'), 'duplicate_refunded');
  assert.strictEqual(m.mapProviderStatus('CANCELLED', { paid: 0, cancelled: 129000 }, 'refund_review_required'), 'refund_review_required');
  console.log('ok status map');
}

function testCreditReclaim() {
  const unused = m.decideCreditReclaim({ grantAmount: 30, unusedBalance: 30, isFullCancel: true });
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
  console.log('ok credit reclaim');
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

testAmounts();
testStatusMap();
testCreditReclaim();
testProductDetect();
testWebhookExtract();
testNoNegativeBalance();
console.log('all portoneRefundSync tests passed');
