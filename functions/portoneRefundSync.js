/**
 * PortOne cancel/refund sync.
 * Webhook bodies are never trusted for money or entitlements — payment is re-fetched.
 * Credit reclaim never drives wallet balance below 0.
 * Period (pass) full cancel: revoke only the grant tied to this paymentId.
 * Lifetime: revoke only when license is still bound to this payment; else review.
 * Partial cancel: never auto-revoke entitlements.
 */
'use strict';

const crypto = require('crypto');
const catalogEngine = require('./catalogEngine');
const passEntitlement = require('./passEntitlement');

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
  let paid = num(amount.paid, total);
  let cancelled = num(amount.cancelled != null ? amount.cancelled : amount.canceled, 0);
  const st = String((payment && payment.status) || '').toUpperCase().replace(/^PAYMENT_STATUS_/, '');
  // PortOne full cancel: status CANCELLED but amount fields may be sparse.
  if ((st === 'CANCELLED' || st === 'CANCELED') && cancelled <= 0 && total > 0) {
    cancelled = total;
    paid = 0;
  }
  if ((st === 'CANCELLED' || st === 'CANCELED') && paid > 0 && cancelled >= paid) {
    paid = 0;
  }
  const list = Array.isArray(payment && payment.cancellations)
    ? payment.cancellations
    : (Array.isArray(payment && payment.cancels) ? payment.cancels : []);
  const ok = list.filter((c) => {
    const cst = String((c && c.status) || '').toUpperCase();
    return !cst || cst === 'SUCCEEDED' || cst === 'SUCCESS' || cst === 'COMPLETED';
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
  // Do not permanently lock refund_review_required — later sync may complete revoke.
  if (st === 'PARTIAL_CANCELLED' || st === 'PARTIAL_CANCELED' || (paid > 0 && cancelled > 0)) {
    return 'partially_refunded';
  }
  if (st === 'CANCELLED' || st === 'CANCELED' || (paid <= 0 && cancelled > 0)) {
    return PAID_LIKE.has(prev) || prev === 'completed' || prev === 'refund_review_required'
      ? 'refunded'
      : 'cancelled';
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
  isFullCancel = true
}) {
  const grant = Math.max(0, Math.round(num(grantAmount, 0)));
  const done = Math.max(0, Math.round(num(alreadyReclaimed, 0)));
  const remainingGrant = Math.max(0, grant - done);
  if (remainingGrant <= 0) return { action: 'none', reclaim: 0, reason: 'already_reclaimed' };
  if (!isFullCancel) {
    return {
      action: 'review',
      reclaim: 0,
      reason: 'partial_cancel_no_auto_reclaim',
      requested: remainingGrant
    };
  }
  if (unusedBalance == null || !Number.isFinite(Number(unusedBalance))) {
    return { action: 'review', reclaim: 0, reason: 'unknown_balance', requested: remainingGrant };
  }
  const bal = Math.max(0, Math.round(Number(unusedBalance)));
  if (bal >= remainingGrant) {
    return { action: 'reclaim', reclaim: remainingGrant, reason: 'unused_sufficient' };
  }
  return {
    action: 'review',
    reclaim: 0,
    reason: 'insufficient_unused',
    unusedBalance: bal,
    requested: remainingGrant
  };
}

/**
 * Decide how to revoke the entitlement tied to this payment only.
 * Never wipes all user licenses — only grant for this paymentId.
 */
function decideLicenseRevoke({
  grant,
  order,
  license,
  paymentId,
  isFullCancel,
  isPartial
}) {
  if (isPartial) {
    return { action: 'review', reason: 'partial_cancel_no_auto_revoke' };
  }
  if (!isFullCancel) {
    return { action: 'none', reason: 'not_cancelled' };
  }

  const productId = catalogEngine.normalizeProductId(
    (grant && grant.productId) || (order && order.productId) || ''
  );
  const kind = String((grant && grant.kind) || '').toLowerCase()
    || (productId === 'LIFETIME' ? 'lifetime' : (catalogEngine.isPassProductId(productId) ? 'pass' : ''));
  const durationDays = Math.max(
    0,
    Math.floor(num(
      (grant && grant.durationDays) != null ? grant.durationDays : (order && order.durationDays),
      passEntitlement.passDurationDays(productId, 0)
    ))
  );
  const licPlan = String((license && license.plan) || '').toLowerCase();
  const licPay = String(
    (license && (license.portonePaymentId || license.paymentId || license.lastPortonePaymentId)) || ''
  ).trim();

  const grantAlreadyRevoked = !!(grant && (grant.status === 'revoked' || grant.revokedAt));
  const orderAlreadyRevoked = !!(order && (order.licenseRevoked === true || order.entitlementStatus === 'revoked'));

  // Order/grant already marked revoked, but licenses/{uid} still looks like an active period.
  // Force grant-based recompute so UI/materialized state cannot stay on "7일 Full".
  if ((grantAlreadyRevoked || orderAlreadyRevoked) && stalePeriodMaterialization(license)) {
    if (licPlan === 'lifetime') {
      return {
        action: 'revoke_grant_only',
        reason: 'stale_pass_while_lifetime',
        productId,
        durationDays
      };
    }
    return {
      action: 'revoke_pass',
      reason: 'reconcile_stale_period_license',
      productId,
      durationDays
    };
  }

  if (grantAlreadyRevoked) {
    return { action: 'none', reason: 'already_revoked' };
  }
  if (orderAlreadyRevoked) {
    return { action: 'none', reason: 'already_revoked_on_order' };
  }

  if (kind === 'lifetime' || productId === 'LIFETIME') {
    // Safe auto-revoke only when the live license is still bound to this payment.
    if (licPlan === 'lifetime' && licPay && licPay === String(paymentId)) {
      return {
        action: 'revoke_lifetime',
        reason: 'lifetime_tied_to_payment',
        productId
      };
    }
    return { action: 'review', reason: 'lifetime_ambiguous', productId };
  }

  if (kind === 'pass' || catalogEngine.isPassProductId(productId) || String((order && order.plan) || '') === 'period') {
    // Never touch a current Lifetime license when refunding a pass payment.
    if (licPlan === 'lifetime') {
      return {
        action: 'revoke_grant_only',
        reason: 'pass_refund_while_lifetime_active',
        productId,
        durationDays
      };
    }
    return {
      action: 'revoke_pass',
      reason: 'pass_full_cancel',
      productId,
      durationDays
    };
  }

  return { action: 'review', reason: 'unknown_grant_kind', productId };
}

/** True when licenses/{uid} still presents as a paid period after grant revoke. */
function stalePeriodMaterialization(license) {
  if (!license) return false;
  const plan = String(license.plan || '').toLowerCase();
  if (plan === 'lifetime') return false;
  if (['period', 'monthly', 'yearly', 'annual', 'subscription', 'pass', 'full_pass'].includes(plan)) {
    return true;
  }
  if (license.passProductId && plan !== 'trial') return true;
  const endMs = passEntitlement.licenseTsMs(license.expiresAt);
  if (plan === 'trial' && endMs > Date.now()) return true;
  return false;
}

function buildTrialLicensePatch(FieldValue, extra = {}) {
  return Object.assign({
    licensed: true,
    plan: 'trial',
    status: 'active',
    startsAt: FieldValue.delete(),
    expiresAt: FieldValue.delete(),
    passProductId: FieldValue.delete(),
    expireReason: FieldValue.delete(),
    expiredAt: FieldValue.delete(),
    revokedAt: FieldValue.serverTimestamp(),
    revokeReason: 'portone_full_cancel',
    updatedAt: FieldValue.serverTimestamp()
  }, extra);
}

function buildPassShortenPatch(FieldValue, nextExpiresMs, grant, extra = {}) {
  if (nextExpiresMs <= Date.now()) {
    return buildTrialLicensePatch(FieldValue, extra);
  }
  return Object.assign({
    licensed: true,
    plan: 'period',
    status: 'active',
    expiresAt: new Date(nextExpiresMs),
    updatedAt: FieldValue.serverTimestamp(),
    lastRevokePaymentId: String((grant && grant.paymentId) || ''),
    lastRevokeReason: 'portone_full_cancel'
  }, extra);
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
  Timestamp,
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
  const grantRef = db.collection('entitlementGrants').doc(pid);

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
    let licenseSnap = null;
    let grantSnap = null;
    let userGrantsSnap = null;

    if (uid) {
      licenseSnap = await tx.get(db.collection('licenses').doc(uid));
    }
    grantSnap = await tx.get(grantRef);

    const shouldTouchEntitlement =
      (isFullCancel || isPartial)
      && !KEEP_STATUS.has(prevStatus.toLowerCase());

    if (shouldTouchEntitlement && isCreditOrder(primary) && uid) {
      walletInfo = await readWallet(tx, db, uid);
      const decision = decideCreditReclaim({
        grantAmount: creditGrantFromOrder(primary),
        unusedBalance: walletInfo.balance,
        alreadyReclaimed: num(primary.creditsReclaimed, 0),
        isFullCancel
      });
      entitlement = {
        kind: 'credit',
        action: decision.action,
        reclaim: decision.reclaim,
        reason: decision.reason
      };
      if (decision.action === 'review') nextStatus = 'refund_review_required';
    } else if (shouldTouchEntitlement && isLicenseOrder(primary)) {
      const grant = grantSnap.exists ? (grantSnap.data() || {}) : null;
      const license = licenseSnap && licenseSnap.exists ? (licenseSnap.data() || {}) : null;
      const decision = decideLicenseRevoke({
        grant,
        order: primary,
        license,
        paymentId: pid,
        isFullCancel,
        isPartial
      });
      entitlement = {
        kind: 'license',
        action: decision.action,
        reason: decision.reason,
        productId: decision.productId || '',
        durationDays: decision.durationDays || 0
      };
      if (decision.action === 'review') nextStatus = 'refund_review_required';
      if (uid && (decision.action === 'revoke_pass' || decision.action === 'revoke_grant_only')) {
        userGrantsSnap = await tx.get(
          db.collection('entitlementGrants').where('uid', '==', uid)
        );
      }
    }

    // --- Credit reclaim (idempotent via creditsReclaimed + ledger doc id) ---
    if (entitlement.action === 'reclaim' && walletInfo.ref && uid && entitlement.reclaim > 0) {
      const nextBal = Math.max(0, num(walletInfo.balance, 0) - entitlement.reclaim);
      const walletPatch = { updatedAt: FieldValue.serverTimestamp() };
      if (walletInfo.kind === 'user') {
        walletPatch.creditBalance = nextBal;
      } else {
        walletPatch.balance = nextBal;
        if (walletInfo.kind === 'credit') walletPatch.creditBalance = nextBal;
      }
      tx.set(walletInfo.ref, walletPatch, { merge: true });
      if (walletInfo.kind === 'credit' && uid) {
        tx.set(db.collection('users').doc(uid), {
          creditBalance: nextBal,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
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

    // --- License / grant revoke (idempotent via grant.revokedAt) ---
    if (entitlement.kind === 'license' && uid) {
      const grant = grantSnap.exists ? (grantSnap.data() || {}) : {};
      const license = licenseSnap && licenseSnap.exists ? (licenseSnap.data() || {}) : {};
      const act = entitlement.action;

      if (act === 'revoke_pass' || act === 'revoke_grant_only' || act === 'revoke_lifetime') {
        tx.set(grantRef, {
          paymentId: pid,
          uid,
          productId: entitlement.productId || grant.productId || primary.productId || '',
          kind: grant.kind || (entitlement.action === 'revoke_lifetime' ? 'lifetime' : 'pass'),
          durationDays: entitlement.durationDays || grant.durationDays || primary.durationDays || 0,
          status: 'revoked',
          revokedAt: FieldValue.serverTimestamp(),
          revokeReason: 'portone_full_cancel',
          revokeSource: source,
          sourcePaymentId: pid,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      if (act === 'revoke_pass' && licenseSnap && licenseSnap.exists) {
        const grantDocs = userGrantsSnap ? userGrantsSnap.docs : [];
        const grantsForRecompute = grantDocs.map((d) => {
          const data = d.data() || {};
          if (d.id === pid) {
            return Object.assign({ paymentId: d.id, sourcePaymentId: d.id }, data, { status: 'revoked' });
          }
          return Object.assign({ paymentId: d.id, sourcePaymentId: d.id }, data);
        });
        if (!grantsForRecompute.length && grantSnap.exists) {
          grantsForRecompute.push(Object.assign(
            { paymentId: pid, sourcePaymentId: pid },
            grantSnap.data() || {},
            { status: 'revoked' }
          ));
        }

        const recomputed = passEntitlement.recomputePeriodEntitlementFromGrants(
          grantsForRecompute,
          new Date()
        );
        const extra = {
          lastRevokePaymentId: pid,
          lastRevokeReason: 'portone_full_cancel'
        };
        if (String(license.portonePaymentId || '') === pid) {
          extra.portonePaymentId = FieldValue.delete();
        }

        if (recomputed.needsReview) {
          entitlement.licenseAction = 'refund_review_required';
          nextStatus = 'refund_review_required';
          tx.set(grantRef, {
            paymentId: pid,
            uid,
            refundReviewRequired: true,
            refundReviewReason: recomputed.reason || 'pass_recompute_review',
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
        } else if (recomputed.plan === 'trial') {
          tx.set(
            db.collection('licenses').doc(uid),
            buildTrialLicensePatch(FieldValue, extra),
            { merge: true }
          );
          entitlement.licenseAction = 'converted_to_trial';
        } else {
          const patch = passEntitlement.buildPeriodLicensePatchFromRecompute(recomputed, {
            FieldValue,
            Timestamp,
            extra
          });
          if (patch) {
            tx.set(db.collection('licenses').doc(uid), patch, { merge: true });
            entitlement.licenseAction = 'recomputed';
          } else {
            entitlement.licenseAction = 'refund_review_required';
            nextStatus = 'refund_review_required';
          }
        }
      } else if (act === 'revoke_lifetime' && licenseSnap && licenseSnap.exists) {
        tx.set(
          db.collection('licenses').doc(uid),
          buildTrialLicensePatch(FieldValue, {
            portonePaymentId: FieldValue.delete(),
            method: 'portone_refund'
          }),
          { merge: true }
        );
        entitlement.licenseAction = 'converted_to_trial';
      } else if (act === 'revoke_grant_only') {
        entitlement.licenseAction = 'grant_revoked_license_untouched';
      } else if (act === 'review') {
        tx.set(grantRef, {
          paymentId: pid,
          uid,
          refundReviewRequired: true,
          refundReviewReason: entitlement.reason || 'portone_cancel_review',
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
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
      const revokedActs = new Set(['revoke_pass', 'revoke_lifetime', 'revoke_grant_only']);
      const alreadyRevoked = entitlement.action === 'none'
        && entitlement.reason
        && String(entitlement.reason).startsWith('already_revoked');
      const revoked = revokedActs.has(entitlement.action) || alreadyRevoked;
      patchBase.licenseRevoked = !!revoked && entitlement.action !== 'review';
      patchBase.licenseRefundReview = entitlement.action === 'review';
      patchBase.entitlementStatus =
        entitlement.action === 'review'
          ? 'refund_review_required'
          : (revoked ? 'revoked' : String(entitlement.action || ''));
      patchBase.licenseRevokeReason = entitlement.reason || '';
      if (entitlement.licenseAction) patchBase.licenseRevokeAction = entitlement.licenseAction;
      if (entitlement.action === 'revoke_pass') {
        if (entitlement.licenseAction === 'converted_to_trial' || entitlement.licenseAction === 'recomputed') {
          patchBase.licenseRecomputeStatus = 'ok';
          patchBase.entitlementSyncStatus = 'ok';
        } else if (entitlement.licenseAction === 'refund_review_required') {
          patchBase.licenseRecomputeStatus = 'failed';
          patchBase.entitlementSyncStatus = 'review';
        } else {
          patchBase.licenseRecomputeStatus = 'pending';
          patchBase.entitlementSyncStatus = 'pending';
        }
      } else if (alreadyRevoked) {
        patchBase.licenseRecomputeStatus = 'ok';
        patchBase.entitlementSyncStatus = 'ok';
      }
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
      duplicateEvent: newEvents.length === 0 && eventIds.length > 0,
      uid,
      productId: String(primary.productId || ''),
      productName: String(primary.productName || primary.orderName || ''),
      currency: String(primary.currency || 'KRW'),
      licenseRevoked: !!(patchBase.licenseRevoked)
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

/**
 * Pick PortOne orders that still look paid / partially refunded and are stale for reconcile.
 */
function shouldReconcileOrder(order, nowMs = Date.now(), staleMs = 6 * 60 * 60 * 1000) {
  if (!order) return false;
  const provider = String(order.provider || '').toLowerCase();
  const method = String(order.paymentMethod || order.method || '').toLowerCase();
  const isPortOne = provider === 'portone' || method.includes('kakao') || !!order.portonePaymentId
    || (!!order.paymentId && !order.paypalOrderId && !order.paypalCaptureId);
  if (!isPortOne) return false;
  const status = String(order.status || '').toLowerCase();
  const candidates = new Set([
    'completed', 'paid', 'verified', 'license_issued',
    'partially_refunded', 'refund_review_required'
  ]);
  // Money already marked refunded but entitlement not revoked — still needs pipeline.
  const needsEntitlementFix =
    (status === 'refunded' || status === 'cancelled' || status === 'canceled')
    && order.licenseIssued === true
    && (
      order.licenseRevoked !== true
      || order.entitlementStatus !== 'revoked'
      || order.licenseRecomputeStatus === 'failed'
      || order.licenseRecomputeStatus === 'pending'
      || String(order.licenseRevokeReason || '') === 'reconcile_stale_period_license'
    );
  if (!candidates.has(status) && !needsEntitlementFix) return false;
  if (KEEP_STATUS.has(status)) return false;
  const last = passEntitlement.licenseTsMs(order.lastSyncedAt);
  if (!last) return true;
  // Entitlement-fix candidates re-check sooner even if recently synced under old policy.
  if (needsEntitlementFix) return (nowMs - last) >= Math.min(staleMs, 30 * 60 * 1000);
  return (nowMs - last) >= staleMs;
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
  decideLicenseRevoke,
  stalePeriodMaterialization,
  cancellationEventIds,
  findOrderRefs,
  syncPortOnePayment,
  recordWebhookDelivery,
  shouldReconcileOrder,
  buildTrialLicensePatch,
  buildPassShortenPatch
};
