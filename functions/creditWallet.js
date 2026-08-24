'use strict';

/**
 * Canonical Credit wallet mutation.
 * SoT: creditWallets/{uid}.balance | creditBalance
 * Mirror: users/{uid}.creditBalance
 * History: creditLedger
 *
 * Purchase (creditPurchase.grantCredits) and admin grant/deduct/bulk
 * must use this helper so wallet schema cannot drift.
 */

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function readBalance(wd, ud) {
  const n = Number(
    wd && wd.balance != null ? wd.balance
      : (wd && wd.creditBalance != null ? wd.creditBalance
        : (ud && ud.creditBalance != null ? ud.creditBalance : 0))
  );
  return Number.isFinite(n) ? n : 0;
}

function writeWalletLedger(tx, {
  walletRef,
  userRef,
  ledgerRef,
  uid,
  prev,
  delta,
  FieldValue,
  ledger
}) {
  const next = prev + delta;
  if (next < 0) {
    throw httpError(400, 'INSUFFICIENT_CREDITS', '잔액이 부족합니다.');
  }
  tx.set(walletRef, {
    uid,
    balance: next,
    creditBalance: next,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  tx.set(userRef, {
    creditBalance: next,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  tx.set(ledgerRef, {
    uid,
    createdAt: FieldValue.serverTimestamp(),
    amount: delta,
    creditAmount: delta,
    ...(ledger || {})
  });
  return next;
}

async function applyWalletCreditDelta(db, FieldValue, {
  uid,
  delta,
  ledger,
  ledgerId,
  requireUserExists = true
}) {
  const walletRef = db.collection('creditWallets').doc(uid);
  const userRef = db.collection('users').doc(uid);
  const ledgerRef = ledgerId
    ? db.collection('creditLedger').doc(String(ledgerId))
    : db.collection('creditLedger').doc();
  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (requireUserExists && !userSnap.exists) {
      throw httpError(404, 'UID_INVALID', '사용자를 찾을 수 없습니다.');
    }
    const walletSnap = await tx.get(walletRef);
    const wd = walletSnap.exists ? (walletSnap.data() || {}) : {};
    const ud = userSnap.exists ? (userSnap.data() || {}) : {};
    const prev = readBalance(wd, ud);
    const next = writeWalletLedger(tx, {
      walletRef,
      userRef,
      ledgerRef,
      uid,
      prev,
      delta,
      FieldValue,
      ledger
    });
    return { prev, balance: next };
  });
}

module.exports = {
  readBalance,
  writeWalletLedger,
  applyWalletCreditDelta
};
