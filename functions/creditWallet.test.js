'use strict';

const assert = require('assert');
const creditWallet = require('./creditWallet');

const FieldValue = { serverTimestamp: () => new Date('2026-08-24T00:00:00.000Z') };

function memoryDb() {
  const store = new Map();
  function docRef(path) {
    return {
      id: path.split('/').pop(),
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
  await db.collection('users').doc('u1').set({ creditBalance: 5 });
  const a = await creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid: 'u1',
    delta: 10,
    ledger: { type: 'admin_grant', displayTitle: 'admin +10' }
  });
  assert.strictEqual(a.prev, 5);
  assert.strictEqual(a.balance, 15);
  const b = await creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid: 'u1',
    delta: 10,
    ledger: { type: 'admin_bulk_credit', displayTitle: 'bulk +10' }
  });
  assert.strictEqual(b.balance, 25);
  const again = await creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid: 'u1',
    delta: 10,
    ledgerId: 'led_once',
    ledger: { type: 'admin_grant' }
  });
  assert.strictEqual(again.alreadyApplied, false);
  const dup = await creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid: 'u1',
    delta: 10,
    ledgerId: 'led_once',
    ledger: { type: 'admin_grant' }
  });
  assert.strictEqual(dup.alreadyApplied, true);
  assert.strictEqual(dup.balance, 35);
  try {
    await creditWallet.applyWalletCreditDelta(db, FieldValue, { uid: 'missing', delta: 1, ledger: {} });
    assert.fail('expected missing user');
  } catch (e) {
    assert.strictEqual(e.code, 'UID_INVALID');
  }
  console.log('ok creditWallet canonical 5+10=15 then +10=25');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
