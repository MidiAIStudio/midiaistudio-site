/**
 * Idempotent user inbox notifications (users/{uid}/notifications).
 * Server-only — Admin SDK bypasses Firestore rules.
 */
'use strict';

const BRAND = 'MidiAI Studio';

const PRODUCT_LABELS = {
  PASS_7D: '7일 Full',
  PASS_30D: '30일 Full',
  PASS_90D: '90일 Full',
  LIFETIME: 'Lifetime Full'
};

function productLabel(productId, fallback = '') {
  const pid = String(productId || '').toUpperCase();
  return PRODUCT_LABELS[pid] || fallback || pid || '이용권';
}

function moneyLabel(amount, currency = 'KRW') {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (String(currency || '').toUpperCase() === 'USD') {
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

/**
 * @returns {Promise<{created: boolean, id: string}>}
 */
async function writeUserNotification(db, FieldValue, uid, notifId, payload) {
  if (!uid || !notifId) return { created: false, id: '' };
  const id = String(notifId).slice(0, 140);
  const ref = db.collection('users').doc(uid).collection('notifications').doc(id);
  const snap = await ref.get();
  if (snap.exists) return { created: false, id };
  await ref.set({
    read: false,
    actorUid: payload.actorUid || 'system',
    actorName: payload.actorName || BRAND,
    createdAt: FieldValue.serverTimestamp(),
    category: payload.category || '',
    targetUrl: payload.targetUrl || '',
    ...payload
  });
  return { created: true, id };
}

async function notifyPaymentComplete(db, FieldValue, {
  uid,
  paymentId,
  productId,
  productName,
  amount,
  currency,
  plan,
  extended
}) {
  if (!uid || !paymentId) return { created: false };
  const label = productLabel(productId, productName);
  const amt = moneyLabel(amount, currency);
  const notifId = `payment_complete_${paymentId}`;
  const postTitle = extended ? '기간권 연장 완료' : '결제 완료';
  const preview = [
    `${label} ${extended ? '이용권이 연장되었습니다.' : '결제가 완료되었습니다.'}`,
    amt ? `(${amt})` : ''
  ].filter(Boolean).join(' ').slice(0, 160);
  return writeUserNotification(db, FieldValue, uid, notifId, {
    type: 'payment_complete',
    sourceType: 'payment_complete',
    sourceId: paymentId,
    paymentId,
    category: 'payment',
    plan: plan || '',
    postTitle,
    preview,
    targetUrl: '/account.html#orders'
  });
}

async function notifyPaymentRefund(db, FieldValue, {
  uid,
  paymentId,
  productId,
  productName,
  status,
  refundedAmount,
  currency,
  licenseRevoked,
  partial
}) {
  if (!uid || !paymentId) return { created: false };
  const label = productLabel(productId, productName);
  const st = String(status || '').toLowerCase();
  const isReview = st === 'refund_review_required';
  const isPartial = partial || st === 'partially_refunded';

  if (isReview) {
    return writeUserNotification(db, FieldValue, uid, `refund_review_${paymentId}`, {
      type: 'license_change',
      sourceType: 'refund_review',
      sourceId: paymentId,
      paymentId,
      category: 'payment',
      status: 'review',
      postTitle: '환불 검토 필요',
      preview: `${label} 환불 처리 중 추가 확인이 필요합니다.`.slice(0, 160),
      targetUrl: '/account.html#orders'
    });
  }

  const notifId = isPartial ? `payment_partial_refund_${paymentId}` : `payment_cancel_${paymentId}`;
  const postTitle = isPartial ? '부분 환불 완료' : '결제 취소 완료';
  const parts = [
    isPartial
      ? `${label} 결제에 부분 환불이 적용되었습니다.`
      : `${label} 결제가 취소되었습니다.`
  ];
  const refundLabel = moneyLabel(refundedAmount, currency);
  if (refundLabel) parts.push(`환불 ${refundLabel}`);
  if (licenseRevoked) parts.push('해당 라이선스가 종료되었습니다.');

  return writeUserNotification(db, FieldValue, uid, notifId, {
    type: 'license_change',
    sourceType: isPartial ? 'payment_partial_refund' : 'payment_cancel',
    sourceId: paymentId,
    paymentId,
    category: 'payment',
    status: licenseRevoked ? 'revoked' : st,
    postTitle,
    preview: parts.join(' ').slice(0, 160),
    targetUrl: '/account.html#orders'
  });
}

/**
 * After PortOne refund sync — idempotent payment/refund inbox entry.
 */
async function maybeNotifyFromRefundSync(db, FieldValue, syncResult) {
  if (!syncResult || syncResult.skipped || !syncResult.uid) return { created: false };
  const st = String(syncResult.status || '').toLowerCase();
  const notifyStatuses = new Set([
    'refunded', 'cancelled', 'canceled', 'partially_refunded', 'refund_review_required'
  ]);
  if (!notifyStatuses.has(st)) return { created: false };

  const entitlement = syncResult.entitlement || {};
  const licenseRevoked = syncResult.licenseRevoked === true
    || ['revoke_pass', 'revoke_lifetime', 'revoke_grant_only'].includes(entitlement.action)
    || entitlement.licenseAction === 'converted_to_trial';

  return notifyPaymentRefund(db, FieldValue, {
    uid: syncResult.uid,
    paymentId: syncResult.paymentId,
    productId: syncResult.productId,
    productName: syncResult.productName,
    status: st,
    refundedAmount: syncResult.refundedAmount,
    currency: syncResult.currency,
    licenseRevoked,
    partial: st === 'partially_refunded'
  });
}

module.exports = {
  writeUserNotification,
  notifyPaymentComplete,
  notifyPaymentRefund,
  maybeNotifyFromRefundSync,
  productLabel
};
