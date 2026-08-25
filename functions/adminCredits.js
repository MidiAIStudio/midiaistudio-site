'use strict';

/**
 * Admin credit grant/deduct against the existing Credit SoT:
 *   creditWallets/{uid}.balance | creditBalance
 *   users/{uid}.creditBalance
 *   creditLedger
 * Client never writes these collections (Firestore rules: write false).
 */

const creditWallet = require('./creditWallet');

const MAX_GRANT = 10000;
const MAX_BULK_RECIPIENTS = 400;
const OP_ID_RE = /^[a-zA-Z0-9_-]{8,80}$/;
const BULK_LEASE_MS = 12 * 60 * 1000;
const MAX_BULK_OPS_PER_TICK = 1;

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function uniqueUids(raw) {
  const out = [];
  const seen = new Set();
  (Array.isArray(raw) ? raw : []).forEach((v) => {
    const uid = String(v || '').trim();
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    out.push(uid);
  });
  return out;
}

function parsePositiveInt(value, { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (allowZero ? n < 0 : n <= 0) return null;
  return n;
}

function validateOperationId(operationId) {
  const id = String(operationId || '').trim();
  if (!OP_ID_RE.test(id)) {
    throw httpError(400, 'OPERATION_ID_INVALID', 'operationId가 올바르지 않습니다.');
  }
  return id;
}

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value._millis === 'number') return value._millis;
  if (value && typeof value._seconds === 'number') return value._seconds * 1000;
  return 0;
}

function stampFromMillis(Timestamp, ms) {
  if (Timestamp && typeof Timestamp.fromMillis === 'function') {
    return Timestamp.fromMillis(ms);
  }
  return { _millis: ms, toMillis: () => ms };
}

function publicBulkCreditOp(operationId, d, extra) {
  const done = Array.isArray(d.doneUids) ? d.doneUids : [];
  const failed = Array.isArray(d.failed) ? d.failed : [];
  const requested = Number(d.requested || (Array.isArray(d.recipientUids) ? d.recipientUids.length : 0));
  const success = d.successCount != null ? Number(d.successCount) : done.length;
  const failureCount = d.failureCount != null ? Number(d.failureCount) : failed.length;
  const amount = Number(d.amount || 0);
  return {
    ok: true,
    operationId,
    status: d.status || '',
    requested,
    success,
    failed: failureCount,
    failures: failed.slice(0, 50),
    amountPerUser: amount,
    totalCredits: success * amount,
    balances: d.balances && typeof d.balances === 'object' ? d.balances : {},
    ...(extra || {})
  };
}

async function applyCreditDelta(db, FieldValue, {
  uid,
  amount,
  type,
  reason,
  adminUid,
  operationId,
  ledgerId,
  origin
}) {
  const sign = amount > 0 ? '+' : '';
  const title = reason
    ? `${reason} (${sign}${amount})`
    : (amount > 0 ? `관리자 크레딧 지급 ${sign}${amount}` : `관리자 크레딧 회수 ${amount}`);
  return creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid,
    delta: amount,
    ledgerId,
    requireUserExists: true,
    ledger: {
      type,
      reason: reason || '',
      adminUid: adminUid || '',
      operationId: operationId || '',
      displayTitle: title,
      origin: origin || 'site_admin'
    }
  });
}

async function claimBulkOperation(db, FieldValue, opRef, payload) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(opRef);
    if (!snap.exists) {
      tx.set(opRef, {
        ...payload,
        status: 'IN_PROGRESS',
        doneUids: [],
        sendingUids: [],
        failed: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
      return { status: 'NEW', doneUids: [], sendingUids: [], failed: [] };
    }
    const d = snap.data() || {};
    if (d.status === 'COMPLETED') {
      return { status: 'ALREADY_COMPLETED', data: d };
    }
    return {
      status: 'RESUME',
      doneUids: Array.isArray(d.doneUids) ? d.doneUids : [],
      sendingUids: Array.isArray(d.sendingUids) ? d.sendingUids : [],
      failed: Array.isArray(d.failed) ? d.failed : []
    };
  });
}

function createHandlers({ db, admin, cors, requireAdmin, userNotify }) {
  const FieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;

  async function adminGrantOrDeduct(req, res, sign) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    const t0 = Date.now();
    try {
      const adminUser = await requireAdmin(req);
      const tAuth = Date.now();
      const body = req.body || {};
      const targetUid = String(body.targetUid || body.uid || '').trim();
      const amount = parsePositiveInt(body.amount);
      const reason = String(body.reason || '').trim().slice(0, 200);
      if (!targetUid) throw httpError(400, 'UID_REQUIRED', '대상 사용자가 없습니다.');
      if (amount == null) throw httpError(400, 'AMOUNT_INVALID', '지급/회수 수량은 1 이상의 정수여야 합니다.');
      if (amount > MAX_GRANT) throw httpError(400, 'AMOUNT_TOO_LARGE', `최대 ${MAX_GRANT} Credits까지 가능합니다.`);
      const delta = sign > 0 ? amount : -amount;
      const type = sign > 0 ? 'admin_grant' : 'admin_deduct';
      const result = await applyCreditDelta(db, FieldValue, {
        uid: targetUid,
        amount: delta,
        type,
        reason,
        adminUid: adminUser.uid,
        origin: 'site_admin'
      });
      const tTxn = Date.now();
      console.info('adminGrantCredits.timing', {
        sign,
        authMs: tAuth - t0,
        txnMs: tTxn - tAuth,
        totalMs: tTxn - t0
      });
      return res.json({
        ok: true,
        uid: targetUid,
        balance: result.balance,
        amount: delta,
        ledgerId: result.ledgerId || ''
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'CREDIT_ADJUST_FAILED',
        message: err.message || '크레딧 처리에 실패했습니다.'
      });
    }
  }

  async function adminGrantCredits(req, res) {
    return adminGrantOrDeduct(req, res, 1);
  }
  async function adminDeductCredits(req, res) {
    return adminGrantOrDeduct(req, res, -1);
  }

  async function adminCreditOverview(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      await requireAdmin(req);
      const targetUid = String((req.body || {}).targetUid || (req.body || {}).uid || '').trim();
      if (!targetUid) throw httpError(400, 'UID_REQUIRED', '대상 사용자가 없습니다.');
      const walletSnap = await db.collection('creditWallets').doc(targetUid).get();
      const userSnap = await db.collection('users').doc(targetUid).get();
      const wd = walletSnap.exists ? (walletSnap.data() || {}) : {};
      const ud = userSnap.exists ? (userSnap.data() || {}) : {};
      const balance = creditWallet.readBalance(wd, ud);
      let ledgerSnap;
      try {
        ledgerSnap = await db.collection('creditLedger')
          .where('uid', '==', targetUid)
          .orderBy('createdAt', 'desc')
          .limit(40)
          .get();
      } catch (_) {
        ledgerSnap = await db.collection('creditLedger').where('uid', '==', targetUid).limit(40).get();
      }
      const ledger = ledgerSnap.docs.map((d) => {
        const row = d.data() || {};
        return {
          id: d.id,
          type: row.type || '',
          amount: Number(row.amount || row.creditAmount || 0),
          displayTitle: row.displayTitle || '',
          reason: row.reason || '',
          createdAt: row.createdAt || null
        };
      });
      let purchasedTotal = 0;
      let consumedTotal = 0;
      let grantedTotal = 0;
      let deductedTotal = 0;
      ledger.forEach((row) => {
        const t = String(row.type || '');
        const n = Number(row.amount || 0);
        if (t === 'purchase') purchasedTotal += n;
        else if (t === 'admin_grant' || t === 'admin_bulk_credit') grantedTotal += n;
        else if (t === 'admin_deduct' || t === 'refund') deductedTotal += Math.abs(n);
        else if (n < 0) consumedTotal += Math.abs(n);
      });
      let purchases = [];
      try {
        const pSnap = await db.collection('creditPurchases').where('uid', '==', targetUid).limit(8).get();
        purchases = pSnap.docs.map((d) => {
          const row = d.data() || {};
          return {
            id: d.id,
            productId: row.productId || '',
            credits: row.creditAmount || row.credits,
            points: row.creditAmount || row.points,
            provider: row.provider || ''
          };
        });
      } catch (_) { /* optional */ }
      return res.json({
        ok: true,
        uid: targetUid,
        balance,
        purchasedTotal,
        consumedTotal,
        grantedTotal,
        deductedTotal,
        ledger: ledger.slice(0, 12),
        purchases,
        jobs: []
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        message: err.message || '크레딧 조회에 실패했습니다.'
      });
    }
  }

  async function enqueueBulkCredit(opRef, payload, nowMs) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(opRef);
      if (!snap.exists) {
        tx.set(opRef, {
          ...payload,
          status: 'QUEUED',
          doneUids: [],
          failed: [],
          balances: {},
          leaseUntil: stampFromMillis(Timestamp, 0),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        return { status: 'NEW', doneUids: [], failed: [], data: payload };
      }
      const d = snap.data() || {};
      if (d.status === 'COMPLETED') {
        return { status: 'ALREADY_COMPLETED', data: d };
      }
      return {
        status: 'ACCEPTED',
        data: d,
        doneUids: Array.isArray(d.doneUids) ? d.doneUids : [],
        failed: Array.isArray(d.failed) ? d.failed : []
      };
    });
  }

  async function claimBulkCreditLease(opRef, nowMs) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(opRef);
      if (!snap.exists) return { status: 'MISSING' };
      const d = snap.data() || {};
      if (d.type !== 'CREDIT_GRANT') return { status: 'SKIP' };
      if (d.status === 'COMPLETED') return { status: 'ALREADY_COMPLETED', data: d };
      if (d.status === 'IN_PROGRESS' && toMillis(d.leaseUntil) > nowMs) {
        return { status: 'LEASED', data: d };
      }
      tx.set(opRef, {
        status: 'IN_PROGRESS',
        leaseUntil: stampFromMillis(Timestamp, nowMs + BULK_LEASE_MS),
        startedAt: d.startedAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return {
        status: 'CLAIMED',
        data: d,
        doneUids: Array.isArray(d.doneUids) ? d.doneUids : [],
        failed: Array.isArray(d.failed) ? d.failed : [],
        recipientUids: Array.isArray(d.recipientUids) ? d.recipientUids : [],
        amount: Number(d.amount || 0),
        reason: String(d.reason || ''),
        adminUid: String(d.adminUid || '')
      };
    });
  }

  async function processBulkCreditOperation(operationId, nowMs = Date.now()) {
    const opRef = db.collection('adminBulkOperations').doc(String(operationId));
    const claim = await claimBulkCreditLease(opRef, nowMs);
    if (claim.status !== 'CLAIMED') return claim;

    const uids = uniqueUids(claim.recipientUids);
    const done = new Set(claim.doneUids || []);
    const failed = Array.isArray(claim.failed) ? claim.failed.slice() : [];
    const balances = Object.assign({}, (claim.data && claim.data.balances) || {});
    const amount = claim.amount;
    const reason = claim.reason;
    const adminUid = claim.adminUid;

    for (const uid of uids) {
      if (done.has(uid)) continue;
      try {
        const result = await applyCreditDelta(db, FieldValue, {
          uid,
          amount,
          type: 'admin_bulk_credit',
          reason,
          adminUid,
          operationId,
          ledgerId: `bulk_${operationId}_${uid}`.slice(0, 700),
          origin: 'site_admin_bulk'
        });
        done.add(uid);
        balances[uid] = result.balance;
      } catch (err) {
        failed.push({
          uid,
          code: err.code || 'GRANT_FAILED',
          message: err.message || '지급 실패'
        });
      }
      await opRef.set({
        doneUids: [...done],
        failed,
        balances,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    const successCount = done.size;
    const failureCount = failed.length;
    await opRef.set({
      status: 'COMPLETED',
      type: 'CREDIT_GRANT',
      successCount,
      failureCount,
      requested: uids.length,
      amount,
      reason,
      adminUid,
      balances,
      leaseUntil: stampFromMillis(Timestamp, nowMs + (10 * 365 * 24 * 60 * 60 * 1000)),
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    try {
      const auditId = `bulk_credit_${String(operationId).slice(0, 100)}`;
      const auditRef = db.collection('adminAuditLogs').doc(auditId);
      const existing = await auditRef.get();
      if (!existing.exists) {
        await auditRef.set({
          timestamp: FieldValue.serverTimestamp(),
          targetUserId: uids[0] || 'bulk',
          category: 'credit',
          action: 'ADMIN_BULK_CREDIT_GRANT',
          actorId: adminUid,
          actorEmail: '',
          actorType: 'admin',
          result: failureCount ? 'partial' : 'success',
          summary: `${uids.length}명 × ${amount} Credits · 총 ${successCount * amount} Credits 지급`,
          metadata: {
            operationId,
            recipientCount: uids.length,
            amountPerUser: amount,
            totalCredits: successCount * amount,
            successCount,
            failureCount,
            reason
          }
        });
      }
    } catch (err) {
      console.warn('grantBulkCredits audit', err && err.message);
    }

    return {
      status: 'COMPLETED',
      data: {
        status: 'COMPLETED',
        requested: uids.length,
        successCount,
        failureCount,
        failed,
        amount,
        balances
      }
    };
  }

  async function processDueBulkCreditGrants(nowMs = Date.now()) {
    const processed = [];
    const seen = new Set();
    async function collect(status) {
      try {
        const snap = await db.collection('adminBulkOperations')
          .where('status', '==', status)
          .limit(8)
          .get();
        return snap.docs || [];
      } catch (err) {
        console.warn('processDueBulkCreditGrants query', err && err.message);
        return [];
      }
    }
    const docs = [...await collect('QUEUED'), ...await collect('IN_PROGRESS')];
    for (const docSnap of docs) {
      if (processed.length >= MAX_BULK_OPS_PER_TICK) break;
      const id = docSnap.id;
      if (seen.has(id)) continue;
      seen.add(id);
      const d = docSnap.data() || {};
      if (d.type !== 'CREDIT_GRANT') continue;
      if (d.status === 'IN_PROGRESS' && toMillis(d.leaseUntil) > nowMs) continue;
      const out = await processBulkCreditOperation(id, nowMs);
      processed.push({ operationId: id, status: out.status });
    }
    return { processed };
  }

  async function grantBulkCredits(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const adminUser = await requireAdmin(req);
      const body = req.body || {};
      const operationId = validateOperationId(body.operationId);
      const opRef = db.collection('adminBulkOperations').doc(operationId);
      const isPoll = body.poll === true || String(body.action || '').toLowerCase() === 'status';

      if (isPoll) {
        const snap = await opRef.get();
        if (!snap.exists) throw httpError(404, 'OPERATION_NOT_FOUND', '일괄 지급 작업을 찾을 수 없습니다.');
        return res.json(publicBulkCreditOp(operationId, snap.data() || {}, { accepted: true }));
      }

      const amount = parsePositiveInt(body.amount);
      const reason = String(body.reason || '').trim().slice(0, 200);
      const uids = uniqueUids(body.recipientUids);
      if (amount == null) throw httpError(400, 'AMOUNT_INVALID', '지급량은 1 이상의 정수여야 합니다.');
      if (amount > MAX_GRANT) throw httpError(400, 'AMOUNT_TOO_LARGE', `1인당 최대 ${MAX_GRANT} Credits까지 가능합니다.`);
      if (!uids.length) throw httpError(400, 'RECIPIENTS_REQUIRED', '지급 대상이 없습니다.');
      if (uids.length > MAX_BULK_RECIPIENTS) {
        throw httpError(400, 'TOO_MANY_RECIPIENTS', `한 번에 최대 ${MAX_BULK_RECIPIENTS}명까지 지급할 수 있습니다.`);
      }

      const claim = await enqueueBulkCredit(opRef, {
        type: 'CREDIT_GRANT',
        adminUid: adminUser.uid,
        amount,
        reason,
        requested: uids.length,
        recipientUids: uids
      }, Date.now());

      if (claim.status === 'ALREADY_COMPLETED') {
        return res.json(publicBulkCreditOp(operationId, claim.data || {}, { code: 'ALREADY_COMPLETED', accepted: true }));
      }

      const d = claim.data || {};
      return res.json(publicBulkCreditOp(operationId, {
        status: d.status || (claim.status === 'NEW' ? 'QUEUED' : d.status),
        requested: uids.length,
        doneUids: claim.doneUids || d.doneUids || [],
        failed: claim.failed || d.failed || [],
        amount,
        balances: d.balances || {}
      }, {
        accepted: true,
        code: claim.status === 'NEW' ? 'QUEUED' : 'ACCEPTED'
      }));
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'BULK_CREDIT_FAILED',
        message: err.message || '일괄 크레딧 지급에 실패했습니다.'
      });
    }
  }

  return {
    adminGrantCredits,
    adminDeductCredits,
    adminGrantPoints: adminGrantCredits,
    adminDeductPoints: adminDeductCredits,
    adminCreditOverview,
    adminPointOverview: adminCreditOverview,
    grantBulkCredits,
    processBulkCreditOperation,
    processDueBulkCreditGrants,
    claimBulkCreditLease
  };
}

module.exports = {
  createHandlers,
  uniqueUids,
  parsePositiveInt,
  validateOperationId,
  applyCreditDelta,
  claimBulkOperation,
  readBalance: creditWallet.readBalance,
  MAX_GRANT,
  MAX_BULK_RECIPIENTS
};
