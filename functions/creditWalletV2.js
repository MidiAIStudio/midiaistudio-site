'use strict';

/**
 * Credit V2 wallet mutation — physically isolated from V1.
 *
 * AUTHORITATIVE:
 *   creditWalletsV2/{uid}.balance — single wallet (all conversions including Mirelo Business)
 *   creditWalletsV2/{uid}.mireloBalance — legacy field (read-only; new writes use general)
 * LEDGER: creditLedgerV2
 *
 * NEVER writes:
 *   creditWallets, creditWallets.creditBalance, users.creditBalance
 */

const CREDIT_SYSTEM_VERSION = 2;
const SCHEMA_VERSION = 2;
const WALLET_POOL_GENERAL = 'general';
const WALLET_POOL_MIRELO = 'mirelo';

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function readBalanceV2(wd) {
  const n = Number(wd && wd.balance != null ? wd.balance : 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function readMireloBalanceV2(wd) {
  const n = Number(wd && wd.mireloBalance != null ? wd.mireloBalance : 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizePool(pool) {
  // Unified wallet: all new deltas hit general balance. mirelo pool is legacy-only.
  void pool;
  return WALLET_POOL_GENERAL;
}

function writeWalletLedgerV2(tx, {
  walletRef,
  ledgerRef,
  uid,
  prev,
  delta,
  FieldValue,
  ledger,
  walletPool
}) {
  const next = prev + delta;
  if (next < 0) {
    throw httpError(400, 'INSUFFICIENT_CREDITS', '잔액이 부족합니다.');
  }
  const pool = normalizePool(walletPool);
  const patch = {
    uid,
    schemaVersion: SCHEMA_VERSION,
    creditSystemVersion: CREDIT_SYSTEM_VERSION,
    updatedAt: FieldValue.serverTimestamp(),
    balance: next
  };
  tx.set(walletRef, patch, { merge: true });
  // Intentionally NO users.creditBalance / creditWallets V1 mirror.
  tx.set(ledgerRef, {
    uid,
    createdAt: FieldValue.serverTimestamp(),
    amount: delta,
    creditAmount: delta,
    creditSystemVersion: CREDIT_SYSTEM_VERSION,
    walletPool: pool,
    ...(ledger || {}),
    balanceBefore: prev,
    balanceAfter: next
  });
  return next;
}

async function applyWalletCreditDeltaV2(db, FieldValue, {
  uid,
  delta,
  ledger,
  ledgerId,
  requireUserExists = true,
  walletPool = WALLET_POOL_GENERAL
}) {
  const pool = normalizePool(walletPool);
  const walletRef = db.collection('creditWalletsV2').doc(uid);
  const userRef = db.collection('users').doc(uid);
  const ledgerRef = ledgerId
    ? db.collection('creditLedgerV2').doc(String(ledgerId))
    : db.collection('creditLedgerV2').doc();
  return db.runTransaction(async (tx) => {
    if (requireUserExists) {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw httpError(404, 'UID_INVALID', '사용자를 찾을 수 없습니다.');
      }
    }
    const walletSnap = await tx.get(walletRef);
    const wd = walletSnap.exists ? (walletSnap.data() || {}) : {};
    const prev = readBalanceV2(wd);
    if (ledgerId) {
      const ledSnap = await tx.get(ledgerRef);
      if (ledSnap.exists) {
        return {
          prev,
          balance: prev,
          mireloBalance: readMireloBalanceV2(wd),
          walletPool: pool,
          alreadyApplied: true,
          ledgerId: ledgerRef.id,
          creditSystemVersion: CREDIT_SYSTEM_VERSION
        };
      }
    }
    const next = writeWalletLedgerV2(tx, {
      walletRef,
      ledgerRef,
      uid,
      prev,
      delta,
      FieldValue,
      ledger: { ...(ledger || {}), walletPool: pool },
      walletPool: pool
    });
    return {
      prev,
      balance: next,
      mireloBalance: readMireloBalanceV2(wd),
      walletPool: pool,
      alreadyApplied: false,
      ledgerId: ledgerRef.id,
      creditSystemVersion: CREDIT_SYSTEM_VERSION
    };
  });
}

module.exports = {
  CREDIT_SYSTEM_VERSION,
  SCHEMA_VERSION,
  WALLET_POOL_GENERAL,
  WALLET_POOL_MIRELO,
  readBalanceV2,
  readMireloBalanceV2,
  writeWalletLedgerV2,
  applyWalletCreditDeltaV2
};
