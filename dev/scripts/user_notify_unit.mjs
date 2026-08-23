import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const userNotify = require('../../functions/userNotify.js');

function mockDb(existing = new Set()) {
  const store = new Map([...existing].map((id) => [id, { exists: true }]));
  return {
    collection(name) {
      assert.equal(name, 'users');
      return {
        doc(uid) {
          return {
            collection(sub) {
              assert.equal(sub, 'notifications');
              return {
                doc(id) {
                  return {
                    async get() {
                      return store.has(id) ? { exists: true } : { exists: false };
                    },
                    async set(payload) {
                      store.set(id, payload);
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

const FieldValue = { serverTimestamp: () => ({ _ts: true }) };

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('PASS', name);
}

await check('payment_complete_idempotent', async () => {
  const db = mockDb();
  const a = await userNotify.notifyPaymentComplete(db, FieldValue, {
    uid: 'u1', paymentId: 'pay_1', productId: 'PASS_30D', amount: 29900, currency: 'KRW'
  });
  const b = await userNotify.notifyPaymentComplete(db, FieldValue, {
    uid: 'u1', paymentId: 'pay_1', productId: 'PASS_30D', amount: 29900, currency: 'KRW'
  });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
});

await check('payment_cancel_idempotent', async () => {
  const db = mockDb();
  const a = await userNotify.notifyPaymentRefund(db, FieldValue, {
    uid: 'u1', paymentId: 'pay_2', productId: 'LIFETIME', status: 'refunded', licenseRevoked: true
  });
  const b = await userNotify.notifyPaymentRefund(db, FieldValue, {
    uid: 'u1', paymentId: 'pay_2', productId: 'LIFETIME', status: 'refunded', licenseRevoked: true
  });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
});

await check('refund_review_separate_id', async () => {
  const db = mockDb(['payment_cancel_pay3']);
  const r = await userNotify.notifyPaymentRefund(db, FieldValue, {
    uid: 'u1', paymentId: 'pay_3', productId: 'PASS_7D', status: 'refund_review_required'
  });
  assert.equal(r.created, true);
  assert.equal(r.id, 'refund_review_pay_3');
});

console.log(`\n${passed}/${passed} PASS`);
