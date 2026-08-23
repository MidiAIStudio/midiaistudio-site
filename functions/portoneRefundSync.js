/**
 * PortOne cancel/refund sync.
 * Webhook bodies are never trusted for money or entitlements — payment is re-fetched.
 * Credit reclaim never drives wallet balance below 0.
 * Lifetime / pass: no automatic license revoke (admin review).
 */
'use strict';

const crypto = require('crypto');
const catalogEngine = require('./catalogEngine');

const EVENT_COLLECTION = 'portoneRefundEvents';
const WEBHOOK_COLLECTION = 'portoneWebhookDeliveries';

const PAID_LIKE = new Set(['completed', 'paid', 'verified', 'license_issued']);
const KEEP_STATUS = new Set(['duplicate_refunded', 'duplicate_refund_failed']);

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function header(headers, name) {
  if (!headers) return '';
  const want = String(name).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() === want) return String(headers[key] || '');
  }
  return '';
}

function webhookSecretKey(secret) {
  const raw = String(secret || '').trim();
  if (!raw) return null;
  if (raw.startsWith('whsec_')) {
    try { return Buffer.from(raw.slice(6), 'base64'); } catch (_) { /* ignore */ }
  }
  return Buffer.from(raw, 'utf8');
}

function hashesEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return ha.length === hb.length && crypto.timingSafeEqual(ha, hb);
}

function verifyPortOneWebhookSignature(rawBody, headers, secret) {
  const sec = String(secret || '').trim();
  if (!sec) return { ok: true, skipped: true };
  const id = header(headers, 'webhook-id');
  const ts = header(headers, 'webhook-timestamp');
  const sig = header(headers, 'webhook-signature');
  if (!id || !ts || !sig) return { ok: false, reason: 'missing_headers' };
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 600) {
    return { ok: false, reason: 'timestamp' };
  }
  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const expected = crypto
    .createHmac('sha256', webhookSecretKey(sec))
    .update(`${id}.${ts}.${payload}`)
    .digest('base64');
  const parts = String(sig).split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const comma = part.indexOf(',');
    const ver = comma >= 0 ? part.slice(0, comma) : 'v1';
    const value = comma >= 0 ? part.slice(comma + 1) : part;
    if (ver && ver !== 'v1') continue;
    if (value && hashesEqual(expected, value)) return { ok: true, webhookId: id };
  }
  return { ok: false, reason: 'bad_signature' };
}

function extractPaymentIdFromWebhook(body) {
  if (!body || typeof body !== 'object') return '';
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  return String(data.paymentId || body.paymentId || body.merchant_uid || '').trim();
}

function extractWebhookType(body) {
  return String((body && (body.type || body.eventType || body.event)) || '').trim();
}

function parsePortOneAmounts(payment) {
  const amount = (payment && payment.amount) || {};
  const total = num(amount.total, 0);
  const paid = num(amount.paid, total);
  const cancelled = num(amount.cancelled != null ? amount.cancelled : amount.canceled, 0);
  const list = Array.isArray(payment && payment.cancellations)
    ? payment.cancellations
    : (Array.isArray(payment && payment.cancels) ? payment.cancels : []);
  const ok = list.filter((c) => {
    const st = String((c && c.status) || '').toUpperCase();
    return !st || st === 'SUCCEEDED' || st === 'SUCCESS' || st === 'COMPLETED';
  });
  const cancellationIds = ok
    .map((c) => String((c && (c.id || c.cancellationId || c.pgCancellationId)) || '').trim())
    .filter(Boolean);
  let cancelledAt = '';
  for (const c of ok) {
    const t = (c && (c.cancelledAt || c.canceledAt || c.requestedAt)) || '';
    if (t) cancelledAt = t;
  }
  if (!cancelledAt) cancelledAt = (payment && (payment.cancelledAt || payment.canceledAt)) || '';
  return { total, paid, cancelled, refunded: cancelled, cancellationIds, cancelledAt };
}

function mapProviderStatus(providerStatus, amounts, previousStatus) {
  const st = String(providerStatus || '').toUpperCase().replace(/^PAYMENT_STATUS_/, '');
  const paid = num(amounts && amounts.paid, 0);
  const cancelled = num(amounts && amounts.cancelled, 0);
  const prev = String(previousStatus || '').toLowerCase();
  if (KEEP_STATUS.has(prev)) return prev;
  if (prev === 'refund_review_required') return 'refund_review_required';
  if (st === 'PARTIAL_CANCELLED' || st === 'PARTIAL_CANCELED' || (paid > 0 && cancelled > 0)) {
    return 'partially_refunded';
  }
  if (st === 'CANCELLED' || st === 'CANCELED' || (paid <= 0 && cancelled > 0)) {
    return PAID_LIKE.has(prev) || prev === 'completed' ? 'refunded' : 'cancelled';
  }
  if (st === 'PAID' || st === 'PAY_PENDING' || st === 'PENDING' || st === 'VIRTUAL_ACCOUNT_ISSUED') {
    if (prev === 'completed') return 'completed';
    if (PAID_LIKE.has(prev)) return prev;
    return 'paid';
  }
  if (st === 'FAILED') return PAID_LIKE.has(prev) ? prev : 'failed';
  return prev || String(providerStatus || 'paid').toLowerCase();
}

function isCreditProductId(productId) {
  const pid = catalogEngine.normalizeProductId(productId);
  return pid.startsWith('CREDIT_') || pid.startsWith('POINT_');
}

function creditGrantFromOrder(order) {
  if (!order) return 0;
  const direct = num(
    order.creditsGranted ?? order.creditAmount ?? order.credits ?? order.pointsGranted ?? order.points,
    0
  );
  if (direct > 0) return Math.round(direct);
  const m = String(order.productId || '').match(/^(?:CREDIT|POINT)_(\d+)$/i);
  return m ? Number(m[1]) : 0;
}

function isCreditOrder(order) {
  if (!order) return false;
  if (isCreditProductId(order.productId)) return true;
  const ent = String(order.entitlement || order.plan || order.kind || '').toLowerCase();
  if (ent === 'credits' || ent === 'credit' || ent === 'points' || ent === 'point') return true;
  return creditGrantFromOrder(order) > 0;
}

function isLicenseOrder(order) {
  if (!order) return false;
  if (catalogEngine.isLicenseProductId(order.productId)) return true;
  const plan = String(order.plan || order.kind || '').toLowerCase();
  return plan === 'lifetime' || plan === 'period' || plan === 'pass' || plan === 'full_pass';
}

function decideCreditReclaim({
  grantAmount,
  unusedBalance,
  alreadyReclaimed = 0,
  cancelledAmount = 0,
  originalAmount = 0,
  isFullCancel = true
}) {
  const grant = Math.max(0, Math.round(num(grantAmount, 0)));
  const done = Math.max(0, Math.round(num(alreadyReclaimed, 0)));
  const remainingGrant = Math.max(0, grant - done);
  if (remainingGrant <= 0) return { action: 'none', reclaim: 0, reason: 'already_reclaimed' };
  let want = remainingGrant;
  if (!isFullCancel) {
    const orig = num(originalAmount, 0);
    const canc = num(cancelledAmount, 0);
    if (orig > 0) want = Math.max(0, Math.floor((grant * canc) / orig) - done);
  }
  want = Math.min(remainingGrant, Math.max(0, Math.round(want)));
  if (want <= 0) return { action: 'none', reclaim: 0, reason: 'nothing_due' };
  if (unusedBalance == null || !Number.isFinite(Number(unusedBalance))) {
    return { action: 'review', reclaim: 0, reason: 'unknown_balance', requested: want };
  }
  const bal = Math.max(0, Math.round(Number(unusedBalance)));
  if (bal >= want) return { action: 'reclaim', reclaim: want, reason: 'unused_sufficient' };
  return {
    action: 'review',
    reclaim: 0,
    reason: 'insufficient_unused',
    unusedBalance: bal,
    requested: want
  };
}

function cancellationEventIds(paymentId, amounts) {
  const pid = String(paymentId || '').trim();
  const ids = Array.from(new Set(((amounts && amounts.cancellationIds) || []).filter(Boolean)));
  if (ids.length) return ids.map((id) => pid + '_' + id);
  if (num(amounts && amounts.cancelled, 0) > 0) return [pid + '_amt_' + num(amounts.cancelled, 0)];
  return [];
}

function uniqueRefs(refs) {
  const seen = new Set();
  const out = [];
  for (const ref of refs) {
    if (!ref || !ref.path) continue;
    if (seen.has(ref.path)) continue;
    seen.add(ref.path);
    out.push(ref);
  }
  return out;
}

async function findOrderRefs(db, paymentId) {
  const pid = String(paymentId || '').trim();
  if (!pid) return [];
  const refs = [
    db.collection('orders').doc(pid),
    db.collection('creditPurchases').doc(pid),
    db.collection('pointPurchases').doc(pid)
  ];
  const queries = [
    ['orders', 'paymentId'],
    ['orders', 'portonePaymentId'],
    ['orders', 'providerPaymentId'],
    ['creditPurchases', 'paymentId'],
    ['pointPurchases', 'paymentId']
  ];
  for (const pair of queries) {
    const col = pair[0];
    const field = pair[1];
    try {
      const snap = await db.collection(col).where(field, '==', pid).limit(5).get();
      snap.docs.forEach((d) => refs.push(d.ref));
    } catch (err) {
      console.warn('portoneRefundSync query', col, field, err && err.message);
    }
  }
  return uniqueRefs(refs);
}

async function readWallet(tx, db, uid) {
  const creditRef = db.collection('creditWallets').doc(uid);
  const pointRef = db.collection('pointWallets').doc(uid);
  const userRef = db.collection('users').doc(uid);
  const creditSnap = await tx.get(creditRef);
  if (creditSnap.exists) {
    const d = creditSnap.data() || {};
    return { ref: creditRef, balance: num(d.balance != null ? d.balance : d.creditBalance, 0), kind: 'credit' };
  }
  const pointSnap = await tx.get(pointRef);
  if (pointSnap.exists) {
    const d = pointSnap.data() || {};
    return { ref: pointRef, balance: num(d.balance != null ? d.balance : d.pointBalance, 0), kind: 'point' };
  }
  const userSnap = await tx.get(userRef);
  if (userSnap.exists && userSnap.data() && userSnap.data().creditBalance != null) {
    return { ref: userRef, balance: num(userSnap.data().creditBalance, 0), kind: 'user' };
  }
  return { ref: creditRef, balance: null, kind: 'missing' };
}

function buildSnapshotPatch(paymentId, payment, amounts, status, providerStatus, source, FieldValue) {
  const patch = {
    status,
    providerStatus: String(providerStatus || (payment && payment.status) || ''),
    paidAmount: num(amounts.paid, 0),
    cancelledAmount: num(amounts.cancelled, 0),
    refundedAmount: num(amounts.refunded, amounts.cancelled),
    providerPaymentId: paymentId,
    paymentId,
    lastSyncedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    refundSyncSource: source || 'portone'
  };
  if (amounts.cancelledAt) {
    patch.cancelledAt = amounts.cancelledAt;
    patch.refundedAt = amounts.cancelledAt;
  }
  if (payment && payment.transactionId) patch.portoneTransactionId = payment.transactionId;
  return patch;
}

async function syncPortOnePayment({
  db,
  FieldValue,
  paymentId,
  payment,
  source = 'unknown',
  actorUid = ''
}) {
  const pid = String(paymentId || '').trim();
  if (!pid) {
    const err = new Error('paymentId가 없습니다.');
    err.status = 400;
    throw err;
  }
  const amounts = parsePortOneAmounts(payment || {});
  const providerStatus = String((payment && payment.status) || '');
  const eventIds = cancellationEventIds(pid, amounts);
  const orderRefs = await findOrderRefs(db, pid);

  const result = await db.runTransaction(async (tx) => {
    const orderSnaps = await Promise.all(orderRefs.map((ref) => tx.get(ref)));
    const present = orderSnaps.filter((s) => s.exists);
    if (!present.length) {
      return { skipped: true, reason: 'ORDER_NOT_FOUND', paymentId: pid, providerStatus };
    }

    const eventSnaps = [];
    for (const eventId of eventIds) {
      eventSnaps.push({
        id: eventId,
        snap: await tx.get(db.collection(EVENT_COLLECTION).doc(eventId))
      });
    }
    const newEvents = eventSnaps.filter((e) => !e.snap.exists);

    const primary = present[0].data() || {};
    const uid = String(primary.uid || primary.userId || '');
    const prevStatus = String(primary.status || '');
    let nextStatus = mapProviderStatus(providerStatus, amounts, prevStatus);
    const isFullCancel = num(amounts.paid, 0) <= 0 && num(amounts.cancelled, 0) > 0;
    const isPartial = num(amounts.paid, 0) > 0 && num(amounts.cancelled, 0) > 0;

    let entitlement = { kind: 'none', action: 'none' };
    let walletInfo = { balance: null, ref: null, kind: '' };

    const applyEntitlement =
      newEvents.length > 0
      && (isFullCancel || isPartial)
      && !KEEP_STATUS.has(prevStatus.toLowerCase())
      && prevStatus.toLowerCase() !== 'refund_review_required';

    if (applyEntitlement && isCreditOrder(primary) && uid) {
      walletInfo = await readWallet(tx, db, uid);
      const decision = decideCreditReclaim({
        grantAmount: creditGrantFromOrder(primary),
        unusedBalance: walletInfo.balance,
        alreadyReclaimed: num(primary.creditsReclaimed, 0),
        cancelledAmount: amounts.cancelled,
        originalAmount: num(primary.amount, amounts.total),
        isFullCancel
      });
      entitlement = { kind: 'credit', action: decision.action, reclaim: decision.reclaim, reason: decision.reason };
      if (decision.action === 'review') nextStatus = 'refund_review_required';
    } else if (applyEntitlement && isLicenseOrder(primary)) {
      entitlement = { kind: 'license', action: 'review', reason: 'no_auto_revoke' };
      nextStatus = 'refund_review_required';
      if (uid) await tx.get(db.collection('licenses').doc(uid));
      await tx.get(db.collection('entitlementGrants').doc(pid));
    }

    if (entitlement.action === 'reclaim' && walletInfo.ref && uid && entitlement.reclaim > 0) {
      const nextBal = Math.max(0, num(walletInfo.balance, 0) - entitlement.reclaim);
      const walletPatch = { updatedAt: FieldValue.serverTimestamp() };
      if (walletInfo.kind === 'user') walletPatch.creditBalance = nextBal;
      else walletPatch.balance = nextBal;
      tx.set(walletInfo.ref, walletPatch, { merge: true });
      const ledgerCol = walletInfo.kind === 'point' ? 'pointLedger' : 'creditLedger';
      tx.set(db.collection(ledgerCol).doc('refund_' + (eventIds[0] || pid)), {
        uid,
        amount: -Math.abs(entitlement.reclaim),
        type: 'purchase_cancel_reclaim',
        title: '결제 취소 회수',
        paymentId: pid,
        createdAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    if (entitlement.kind === 'license') {
      tx.set(db.collection('entitlementGrants').doc(pid), {
        refundReviewRequired: true,
        refundReviewReason: 'portone_cancel_no_auto_revoke',
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }

    const patchBase = buildSnapshotPatch(
      pid, payment, amounts, nextStatus, providerStatus, source, FieldValue
    );
    if (actorUid) patchBase.refundSyncedBy = actorUid;
    if (entitlement.kind === 'credit') {
      patchBase.creditsReclaimStatus = entitlement.action;
      patchBase.creditsReclaimReason = entitlement.reason || '';
      if (entitlement.reclaim) patchBase.creditsReclaimed = FieldValue.increment(entitlement.reclaim);
    }
    if (entitlement.kind === 'license') {
      patchBase.licenseRevoked = false;
      patchBase.licenseRefundReview = true;
    }
    if ((isFullCancel || isPartial) && amounts.cancelledAt) {
      patchBase.refundAt = amounts.cancelledAt;
      patchBase.refundReason = primary.refundReason || 'portone_provider_cancel';
    }

    for (const snap of present) {
      const prev = snap.data() || {};
      const docPatch = Object.assign({}, patchBase);
      if (KEEP_STATUS.has(String(prev.status || '').toLowerCase())) docPatch.status = prev.status;
      if (!prev.paymentId) docPatch.paymentId = pid;
      tx.set(snap.ref, docPatch, { merge: true });
    }

    const now = FieldValue.serverTimestamp();
    for (const ev of newEvents) {
      tx.set(db.collection(EVENT_COLLECTION).doc(ev.id), {
        paymentId: pid,
        uid: uid || '',
        source,
        status: nextStatus,
        cancelledAmount: amounts.cancelled,
        refundedAmount: amounts.refunded,
        entitlement,
        createdAt: now
      }, { merge: true });
    }

    return {
      skipped: false,
      paymentId: pid,
      status: nextStatus,
      providerStatus,
      paidAmount: amounts.paid,
      cancelledAmount: amounts.cancelled,
      refundedAmount: amounts.refunded,
      cancelledAt: amounts.cancelledAt || null,
      entitlement,
      ordersUpdated: present.length,
      eventsApplied: newEvents.length,
      duplicateEvent: newEvents.length === 0 && eventIds.length > 0
    };
  });

  return Object.assign({ ok: true }, result);
}

async function recordWebhookDelivery(db, FieldValue, webhookId, payload) {
  const id = String(webhookId || '').trim();
  if (!id) return { duplicate: false };
  const ref = db.collection(WEBHOOK_COLLECTION).doc(id.slice(0, 700));
  const snap = await ref.get();
  if (snap.exists) return { duplicate: true };
  await ref.set({
    receivedAt: FieldValue.serverTimestamp(),
    type: extractWebhookType(payload),
    paymentId: extractPaymentIdFromWebhook(payload)
  }, { merge: true });
  return { duplicate: false };
}

module.exports = {
  EVENT_COLLECTION,
  WEBHOOK_COLLECTION,
  verifyPortOneWebhookSignature,
  extractPaymentIdFromWebhook,
  extractWebhookType,
  parsePortOneAmounts,
  mapProviderStatus,
  isCreditProductId,
  isCreditOrder,
  isLicenseOrder,
  creditGrantFromOrder,
  decideCreditReclaim,
  cancellationEventIds,
  findOrderRefs,
  syncPortOnePayment,
  recordWebhookDelivery
};
