'use strict';

const assert = require('assert');
const creditWalletV2 = require('./creditWalletV2');

const FieldValue = { serverTimestamp: () => new Date('2026-08-24T00:00:00.000Z') };

function memoryDb() {
  const store = new Map();
  function docRef(path) {
    return {
      id: path.split('/').pop(),
      path,
      async get() {
        const v = store.get(path);
        return { exists: v != null, data: () => (v ? { ...v } : undefined) };
      },
      async set(data, opts) {
        const prev = store.get(path) || {};
        store.set(path, opts && opts.merge ? { ...prev, ...data } : { ...data });
      }
    };
  }
  return {
    _store: store,
    collection(name) {
      return {
        doc(id) { return docRef(`${name}/${id || 'auto'}`); }
      };
    },
    async runTransaction(fn) {
      return fn({
        get: (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts)
      });
    }
  };
}

(async () => {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@b.c' });

  // Missing V2 wallet → grant starts at 0
  const a = await creditWalletV2.applyWalletCreditDeltaV2(db, FieldValue, {
    uid: 'u1',
    delta: 10,
    ledger: { type: 'admin_grant', displayTitle: 'admin +10' }
  });
  assert.strictEqual(a.prev, 0);
  assert.strictEqual(a.balance, 10);
  assert.strictEqual(a.creditSystemVersion, 2);

  const wallet = await db.collection('creditWalletsV2').doc('u1').get();
  assert.strictEqual(wallet.data().balance, 10);
  assert.strictEqual(wallet.data().schemaVersion, 2);

  // Isolation: V1 wallet untouched / absent
  const v1 = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(v1.exists, false);
  const user = await db.collection('users').doc('u1').get();
  assert.strictEqual(user.data().creditBalance, undefined);

  // Deduct
  const b = await creditWalletV2.applyWalletCreditDeltaV2(db, FieldValue, {
    uid: 'u1',
    delta: -3,
    ledger: { type: 'admin_deduct' }
  });
  assert.strictEqual(b.balance, 7);

  // Idempotent ledgerId
  const once = await creditWalletV2.applyWalletCreditDeltaV2(db, FieldValue, {
    uid: 'u1',
    delta: 5,
    ledgerId: 'pay_once',
    ledger: { type: 'purchase' }
  });
  assert.strictEqual(once.alreadyApplied, false);
  assert.strictEqual(once.balance, 12);
  const dup = await creditWalletV2.applyWalletCreditDeltaV2(db, FieldValue, {
    uid: 'u1',
    delta: 5,
    ledgerId: 'pay_once',
    ledger: { type: 'purchase' }
  });
  assert.strictEqual(dup.alreadyApplied, true);
  assert.strictEqual(dup.balance, 12);

  // V1 seed does not affect V2 read
  await db.collection('creditWallets').doc('u2').set({ balance: 100, creditBalance: 100 });
  await db.collection('users').doc('u2').set({ creditBalance: 100 });
  const grant2 = await creditWalletV2.applyWalletCreditDeltaV2(db, FieldValue, {
    uid: 'u2',
    delta: 10,
    ledger: { type: 'admin_grant' }
  });
  assert.strictEqual(grant2.prev, 0);
  assert.strictEqual(grant2.balance, 10);
  const v1u2 = await db.collection('creditWallets').doc('u2').get();
  assert.strictEqual(v1u2.data().balance, 100);

  console.log('ok creditWalletV2 isolation + idempotency');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
