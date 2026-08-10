const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();

/** Discord webhooks — set via Secret Manager / `firebase functions:secrets:set` */
const discordInquiryWebhook = defineSecret('DISCORD_INQUIRY_WEBHOOK');
const discordPaymentWebhook = defineSecret('DISCORD_PAYMENT_WEBHOOK');

function cfg(name, fallback = '') {
  return process.env[name] || fallback;
}

function paypalBaseUrl() {
  return cfg('PAYPAL_ENV', 'live') === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

function cors(req, res, methods = 'POST, OPTIONS') {
  const allowedOrigins = [
    cfg('APP_ORIGIN', 'https://midiaistudio.web.app'),
    'https://midiaistudio.web.app',
    'https://midiaistudio.firebaseapp.com',
    'https://midiaistudio.com',
    'https://www.midiaistudio.com',
    'https://midiaistudio.github.io'
  ];

  const origin = req.headers.origin || '';

  const allowOrigin =
    allowedOrigins.includes(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
      ? origin
      : allowedOrigins[0];

  res.set('Access-Control-Allow-Origin', allowOrigin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', methods);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }

  return false;
}

async function requireUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw Object.assign(new Error('Google 로그인이 필요합니다.'), { status: 401 });
  return admin.auth().verifyIdToken(token);
}

async function paypalAccessToken() {
  const clientId = cfg('PAYPAL_CLIENT_ID');
  const secret = cfg('PAYPAL_CLIENT_SECRET');
  if (!clientId || !secret) throw new Error('PayPal Client ID/Secret 환경변수가 없습니다.');
  const basic = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || 'PayPal access token failed');
  return data.access_token;
}

const DEFAULT_PRODUCT_DOC = 'lifetime';

function envPayPalFallback() {
  return {
    plan: cfg('PAYPAL_PLAN', 'lifetime'),
    amount: cfg('PAYPAL_PRICE_VALUE', '89.00'),
    currency: cfg('PAYPAL_CURRENCY', 'USD'),
    productDocId: DEFAULT_PRODUCT_DOC,
    productName: 'Lifetime License',
    region: 'Global',
    pricingVersion: 0,
    status: 'active'
  };
}

function envKrFallback() {
  return {
    plan: cfg('PORTONE_PLAN', cfg('PAYPAL_PLAN', 'lifetime')),
    amount: Number(cfg('PORTONE_KR_AMOUNT', '130000')),
    currency: String(cfg('PORTONE_KR_CURRENCY', 'KRW')).toUpperCase().replace(/^CURRENCY_/, ''),
    productId: cfg('PORTONE_PRODUCT_ID', 'midiai-lifetime'),
    orderName: cfg('PORTONE_ORDER_NAME', 'MidiAI Studio Lifetime License'),
    allowedOrderNames: [
      cfg('PORTONE_ORDER_NAME', 'MidiAI Studio Lifetime License'),
      'MidiAI Studio Lifetime 디지털 라이선스'
    ],
    productDocId: DEFAULT_PRODUCT_DOC,
    productName: 'Lifetime License',
    region: 'KR',
    pricingVersion: 0,
    status: 'active'
  };
}

function formatChargeAmount(salePrice, currency) {
  const cur = String(currency || 'USD').toUpperCase();
  const n = Number(salePrice);
  if (!Number.isFinite(n)) throw new Error('판매가가 올바르지 않습니다.');
  if (cur === 'JPY' || cur === 'KRW') return String(Math.round(n));
  return n.toFixed(2);
}

/**
 * Load product + region pricing from Firestore (Admin SDK).
 * Never trusts client-sent amounts. Falls back to env if doc missing.
 */
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inDateRange(start, end, now = new Date()) {
  const k = dayKey(now);
  if (start && k < String(start)) return false;
  if (end && k > String(end)) return false;
  return true;
}

async function isDiscountCampaignActiveServer() {
  try {
    const snap = await db.collection('pricingConfig').doc('main').get();
    const promo = snap.exists ? (snap.data() || {}).promo : null;
    if (!promo || promo.enabled !== true) return false;
    return inDateRange(promo.discountStartsAt || '', promo.discountEndsAt || '');
  } catch (e) {
    console.warn('promo check failed', e);
    return false;
  }
}

async function loadRegionCharge(regionCode, productDocId = DEFAULT_PRODUCT_DOC) {
  const snap = await db.collection('products').doc(productDocId).get();
  if (!snap.exists) {
    return regionCode === 'KR' ? envKrFallback() : envPayPalFallback();
  }
  const data = snap.data() || {};
  if (data.status === 'paused') {
    const err = new Error('현재 일시 판매중지된 상품입니다.');
    err.status = 403;
    err.code = 'PRODUCT_PAUSED';
    throw err;
  }
  const regions = data.regions || {};
  const region = regions[regionCode] || (regionCode === 'KR' ? null : regions.Global) || regions.KR;
  if (!region) {
    return regionCode === 'KR' ? envKrFallback() : envPayPalFallback();
  }
  const currency = String(region.currency || (regionCode === 'KR' ? 'KRW' : 'USD')).toUpperCase();
  const listPrice = Number(region.listPrice);
  const rawSale = Number(region.salePrice);
  const campaignOn = await isDiscountCampaignActiveServer();
  const salePrice = campaignOn && Number.isFinite(rawSale) && rawSale > 0
    ? rawSale
    : (Number.isFinite(listPrice) && listPrice > 0 ? listPrice : rawSale);
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    return regionCode === 'KR' ? envKrFallback() : envPayPalFallback();
  }
  const orderName = region.orderName || data.name || 'MidiAI Studio Lifetime License';
  const productId = region.portoneProductId || cfg('PORTONE_PRODUCT_ID', productDocId);
  const base = {
    plan: data.plan || 'lifetime',
    productDocId,
    productName: data.name || 'Lifetime License',
    region: regionCode,
    pricingVersion: Number(data.pricingVersion) || 1,
    status: data.status || 'active',
    listPrice: Number.isFinite(listPrice) && listPrice > 0 ? listPrice : salePrice,
    payment: region.payment || (regionCode === 'KR' ? 'portone' : 'paypal'),
    orderName,
    currency
  };
  if (regionCode === 'KR' || region.payment === 'portone') {
    return {
      ...base,
      amount: Math.round(salePrice),
      productId,
      allowedOrderNames: Array.from(new Set([
        orderName,
        'MidiAI Studio Lifetime License',
        'MidiAI Studio Lifetime 디지털 라이선스',
        cfg('PORTONE_ORDER_NAME', orderName)
      ]))
    };
  }
  return {
    ...base,
    amount: formatChargeAmount(salePrice, currency),
    productId
  };
}

/** @deprecated sync name kept as async wrapper — PayPal Global region */
async function serverProduct() {
  return loadRegionCharge('Global', DEFAULT_PRODUCT_DOC);
}

/** KakaoPay / PortOne KR — Firestore salePrice (never trust client). */
async function serverKrProduct() {
  return loadRegionCharge('KR', DEFAULT_PRODUCT_DOC);
}

function normalizeCurrency(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/^CURRENCY_/, '')
    .trim();
}

function parsePortOneCustomData(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * Shared lifetime license write — same fields PayPal uses so the desktop app
 * keeps reading licenses/{uid}.licensed + status === 'active'.
 */
function lifetimeLicensePayload({ user, plan, method, memo, extra = {} }) {
  return {
    email: user.email || '',
    displayName: user.name || user.displayName || '',
    licensed: true,
    plan: plan || 'lifetime',
    status: 'active',
    method,
    memo: memo || '',
    ...extra,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function fetchPortOnePayment(paymentId) {
  const secret = cfg('PORTONE_API_SECRET');
  if (!secret) {
    throw Object.assign(new Error('PORTONE_API_SECRET 환경변수가 없습니다.'), { status: 500 });
  }
  const storeId = cfg('PORTONE_STORE_ID', '');
  const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}${qs}`, {
    method: 'GET',
    headers: {
      Authorization: `PortOne ${secret}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.type || `PortOne 결제 조회 실패 (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status === 404 ? 404 : 400, detail: data });
  }
  return data;
}

function licenseTsMs(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e12 ? v : v * 1000;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') {
    const t = v.toDate().getTime();
    return Number.isFinite(t) ? t : 0;
  }
  const sec = Number(v?.seconds || v?._seconds || 0);
  return sec ? sec * 1000 : 0;
}

function licenseDateBoundsActive(data, nowMs = Date.now()) {
  if (!data) return false;
  const startMs = licenseTsMs(data.startsAt);
  const endMs = licenseTsMs(data.expiresAt);
  if (startMs && nowMs < startMs) return false;
  if (endMs && nowMs > endMs) return false;
  return true;
}

/** Active full license (any plan) within optional startsAt~expiresAt window. */
function isLicenseCurrentlyActive(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.licensed !== true) return false;
  if (String(data.status || '').toLowerCase() !== 'active') return false;
  return licenseDateBoundsActive(data);
}

function isActiveLifetimeLicense(data) {
  if (!isLicenseCurrentlyActive(data)) return false;
  if (String(data.plan || '').toLowerCase() !== 'lifetime') return false;
  // Lifetime means unlimited — timed grants must not count as lifetime
  if (licenseTsMs(data.expiresAt)) return false;
  return true;
}

async function readUserLicense(uid) {
  const snap = await db.collection('licenses').doc(uid).get();
  return snap.exists ? (snap.data() || {}) : null;
}

async function cancelPortOnePayment(paymentId, reason, amount) {
  const secret = cfg('PORTONE_API_SECRET');
  if (!secret) {
    throw Object.assign(new Error('PORTONE_API_SECRET 환경변수가 없습니다.'), { status: 500 });
  }
  const body = { reason: reason || 'Duplicate lifetime license purchase' };
  if (Number.isFinite(Number(amount))) {
    body.amount = Number(amount);
    body.currentCancellableAmount = Number(amount);
  }
  const storeId = cfg('PORTONE_STORE_ID', '');
  if (storeId) body.storeId = storeId;

  const res = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `PortOne ${secret}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.type || `PortOne 결제 취소 실패 (${res.status})`;
    throw Object.assign(new Error(msg), { status: 400, detail: data });
  }
  return data;
}

const PURCHASE_LOCK_TTL_MS = 15 * 60 * 1000;

async function acquirePurchaseLock(uid, paymentId) {
  const lockRef = db.collection('purchaseLocks').doc(uid);
  const nowMs = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (snap.exists) {
      const d = snap.data() || {};
      const expiresAtMs = Number(d.expiresAtMs || 0);
      const active = d.status === 'pending' && expiresAtMs > nowMs;
      if (active && d.paymentId && d.paymentId !== paymentId) {
        throw Object.assign(new Error('이미 진행 중인 결제가 있습니다. 잠시 후 다시 시도해 주세요.'), {
          status: 409,
          code: 'PURCHASE_IN_PROGRESS'
        });
      }
    }
    tx.set(lockRef, {
      uid,
      paymentId,
      status: 'pending',
      createdAtMs: nowMs,
      expiresAtMs: nowMs + PURCHASE_LOCK_TTL_MS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function releasePurchaseLock(uid, paymentId, finalStatus = 'released') {
  const lockRef = db.collection('purchaseLocks').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) return;
    const d = snap.data() || {};
    if (paymentId && d.paymentId && d.paymentId !== paymentId) return;
    tx.set(lockRef, {
      status: finalStatus,
      releasedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

/**
 * Pre-check before opening PortOne checkout.
 * Auth uid only — never trusts client license flags.
 * Body: { paymentId, productId? }
 */
exports.checkPurchaseEligibility = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    if (!user.uid) {
      return res.status(401).json({ ok: false, message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    }
    const { paymentId, productId } = req.body || {};
    let product;
    try {
      product = await serverKrProduct();
    } catch (prodErr) {
      return res.status(prodErr.status || 400).json({
        ok: false,
        eligible: false,
        code: prodErr.code || 'PRODUCT_UNAVAILABLE',
        message: prodErr.message || '상품을 구매할 수 없습니다.'
      });
    }
    if (productId && productId !== product.productId) {
      return res.status(400).json({ ok: false, eligible: false, message: '상품 정보가 일치하지 않습니다.' });
    }

    const license = await readUserLicense(user.uid);
    if (isActiveLifetimeLicense(license)) {
      return res.json({
        ok: true,
        eligible: false,
        hasLifetime: true,
        plan: license.plan || 'lifetime',
        status: license.status || 'active',
        message: '이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.'
      });
    }

    if (paymentId) {
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(String(paymentId))) {
        return res.status(400).json({ ok: false, eligible: false, message: 'paymentId 형식이 올바르지 않습니다.' });
      }
      try {
        await acquirePurchaseLock(user.uid, String(paymentId));
      } catch (lockErr) {
        return res.status(lockErr.status || 409).json({
          ok: false,
          eligible: false,
          code: lockErr.code || 'PURCHASE_IN_PROGRESS',
          message: lockErr.message || '이미 진행 중인 결제가 있습니다.'
        });
      }
    }

    return res.json({
      ok: true,
      eligible: true,
      hasLifetime: false,
      paymentId: paymentId || null,
      message: '구매 가능',
      pricing: {
        amount: product.amount,
        currency: product.currency,
        orderName: product.orderName,
        productId: product.productId,
        productDocId: product.productDocId,
        region: product.region,
        pricingVersion: product.pricingVersion,
        listPrice: product.listPrice
      }
    });
  } catch (err) {
    console.error('checkPurchaseEligibility', err);
    return res.status(err.status || 500).json({
      ok: false,
      eligible: false,
      message: err.message || '구매 가능 여부 확인에 실패했습니다.'
    });
  }
});

/**
 * Release purchase lock after cancel/close (optional client call).
 * Body: { paymentId? }
 */
exports.releasePurchaseLock = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    const { paymentId } = req.body || {};
    await releasePurchaseLock(user.uid, paymentId || null, 'released');
    return res.json({ ok: true });
  } catch (err) {
    console.error('releasePurchaseLock', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'lock release failed' });
  }
});

exports.createPayPalOrder = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    let product;
    try {
      product = await serverProduct();
    } catch (prodErr) {
      return res.status(prodErr.status || 400).json({
        ok: false,
        code: prodErr.code || 'PRODUCT_UNAVAILABLE',
        message: prodErr.message || '상품을 구매할 수 없습니다.'
      });
    }
    const accessToken = await paypalAccessToken();
    const orderRef = db.collection('orders').doc();
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: orderRef.id,
        custom_id: user.uid,
        description: `MidiAI Studio ${product.plan} license`,
        amount: {
          currency_code: product.currency,
          value: String(product.amount)
        }
      }],
      application_context: {
        brand_name: 'MidiAI Studio',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW'
      }
    };
    const pp = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': orderRef.id
      },
      body: JSON.stringify(payload)
    });
    const data = await pp.json().catch(() => ({}));
    if (!pp.ok) return res.status(400).json({ ok: false, message: data.message || data.name || 'PayPal 주문 생성 실패', detail: data });

    await orderRef.set({
      uid: user.uid,
      email: user.email || '',
      paypalOrderId: data.id,
      amount: Number(product.amount),
      currency: product.currency,
      plan: product.plan,
      productId: product.productDocId || DEFAULT_PRODUCT_DOC,
      productName: product.productName || 'Lifetime License',
      region: product.region || 'Global',
      pricingVersion: product.pricingVersion || 0,
      provider: 'paypal',
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ ok: true, id: data.id, orderDocId: orderRef.id });
  } catch (err) {
    console.error('createPayPalOrder', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'createPayPalOrder failed' });
  }
});

exports.capturePayPalOrder = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ ok: false, message: 'orderId가 없습니다.' });
    let product;
    try {
      product = await serverProduct();
    } catch (prodErr) {
      return res.status(prodErr.status || 400).json({
        ok: false,
        code: prodErr.code || 'PRODUCT_UNAVAILABLE',
        message: prodErr.message || '상품을 구매할 수 없습니다.'
      });
    }
    const accessToken = await paypalAccessToken();

    const orderQuery = await db.collection('orders')
      .where('paypalOrderId', '==', orderId)
      .where('uid', '==', user.uid)
      .limit(1)
      .get();
    if (orderQuery.empty) return res.status(404).json({ ok: false, message: '주문 정보를 찾을 수 없습니다.' });
    const orderDoc = orderQuery.docs[0];
    const existing = orderDoc.data();
    if (existing.status === 'completed') {
      return res.json({ ok: true, alreadyCompleted: true });
    }

    const pp = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `capture-${orderId}`
      }
    });
    const data = await pp.json().catch(() => ({}));
    if (!pp.ok) return res.status(400).json({ ok: false, message: data.message || data.name || 'PayPal 캡처 실패', detail: data });
    if (data.status !== 'COMPLETED') return res.status(400).json({ ok: false, message: `결제가 완료 상태가 아닙니다: ${data.status}`, detail: data });

    const capture = data.purchase_units?.[0]?.payments?.captures?.[0] || {};
    const paidValue = capture.amount?.value || data.purchase_units?.[0]?.amount?.value;
    const paidCurrency = capture.amount?.currency_code || data.purchase_units?.[0]?.amount?.currency_code;
    if (String(paidCurrency) !== String(product.currency) || Number(paidValue) < Number(product.amount)) {
      return res.status(400).json({ ok: false, message: '결제 금액 또는 통화가 일치하지 않습니다.', detail: { paidValue, paidCurrency, expected: product } });
    }

    const batch = db.batch();
    batch.set(orderDoc.ref, {
      status: 'completed',
      licenseIssued: true,
      paypalCaptureId: capture.id || '',
      payerEmail: data.payer?.email_address || '',
      payerName: [data.payer?.name?.surname, data.payer?.name?.given_name].filter(Boolean).join(' '),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      rawStatus: data.status
    }, { merge: true });
    batch.set(
      db.collection('licenses').doc(user.uid),
      lifetimeLicensePayload({
        user: { email: user.email || existing.email || '', name: user.name || '' },
        plan: product.plan,
        method: 'paypal',
        memo: `PayPal 자동 지급 · order ${orderId}`,
        extra: {
          paypalOrderId: orderId,
          paypalCaptureId: capture.id || ''
        }
      }),
      { merge: true }
    );
    await batch.commit();

    return res.json({ ok: true, orderId, captureId: capture.id || '', licenseGranted: true });
  } catch (err) {
    console.error('capturePayPalOrder', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'capturePayPalOrder failed' });
  }
});

/**
 * Verify PortOne (KakaoPay test/live) payment server-side and issue licenses/{uid}
 * using the same schema as PayPal. Client must never write licenses.
 *
 * Body: { paymentId, productId? }
 * Auth: Bearer Firebase ID token
 */
exports.verifyPortOnePaymentAndIssueLicense = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  let authUid = '';
  try {
    const user = await requireUser(req);
    authUid = user.uid || '';
    if (!user.uid) {
      return res.status(401).json({ ok: false, message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' });
    }

    const { paymentId, productId } = req.body || {};
    if (!paymentId || typeof paymentId !== 'string') {
      return res.status(400).json({ ok: false, message: 'paymentId가 없습니다.' });
    }
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(paymentId)) {
      return res.status(400).json({ ok: false, message: 'paymentId 형식이 올바르지 않습니다.' });
    }

    let product;
    try {
      product = await serverKrProduct();
    } catch (prodErr) {
      return res.status(prodErr.status || 400).json({
        ok: false,
        code: prodErr.code || 'PRODUCT_UNAVAILABLE',
        message: prodErr.message || '상품을 구매할 수 없습니다.'
      });
    }
    if (productId && productId !== product.productId) {
      return res.status(400).json({ ok: false, message: '상품 정보가 일치하지 않습니다.' });
    }

    const environment = cfg('PORTONE_ENVIRONMENT', 'test');
    const orderRef = db.collection('orders').doc(paymentId);
    const licenseRef = db.collection('licenses').doc(user.uid);

    // Idempotent fast-path before calling PortOne
    const existingSnap = await orderRef.get();
    if (existingSnap.exists) {
      const existing = existingSnap.data() || {};
      if (existing.uid && existing.uid !== user.uid) {
        return res.status(403).json({
          ok: false,
          message: '이미 다른 계정에서 처리된 결제입니다.',
          paymentId
        });
      }
      if (
        existing.status === 'completed' &&
        existing.verificationStatus === 'verified' &&
        existing.licenseIssued === true
      ) {
        await releasePurchaseLock(user.uid, paymentId, 'completed').catch(() => {});
        return res.json({
          ok: true,
          alreadyCompleted: true,
          paymentId,
          licenseGranted: true,
          email: user.email || existing.email || '',
          amount: existing.amount || product.amount,
          currency: existing.currency || product.currency,
          paymentMethod: existing.paymentMethod || 'kakaopay',
          environment: existing.environment || environment
        });
      }
      if (existing.status === 'duplicate_refunded') {
        await releasePurchaseLock(user.uid, paymentId, 'released').catch(() => {});
        return res.json({
          ok: false,
          alreadyCompleted: true,
          duplicate: true,
          refunded: true,
          paymentId,
          licenseGranted: false,
          code: 'DUPLICATE_LICENSE',
          message: '이미 Lifetime 라이선스를 보유하고 있어 중복 결제가 자동 취소되었습니다.'
        });
      }
      if (existing.status === 'duplicate_refund_failed') {
        await releasePurchaseLock(user.uid, paymentId, 'released').catch(() => {});
        return res.status(409).json({
          ok: false,
          alreadyCompleted: true,
          duplicate: true,
          refunded: false,
          paymentId,
          licenseGranted: false,
          code: 'DUPLICATE_REFUND_FAILED',
          message: '이미 Lifetime 라이선스가 있습니다. 중복 결제 자동 취소에 실패해 관리자 확인이 필요합니다.'
        });
      }
    }

    const payment = await fetchPortOnePayment(paymentId);
    const status = String(payment.status || '');
    if (status !== 'PAID') {
      // Already cancelled duplicate path may re-check
      if (status === 'CANCELLED' || status === 'PARTIAL_CANCELLED') {
        const existingAfter = (await orderRef.get()).data() || {};
        if (existingAfter.status === 'duplicate_refunded') {
          await releasePurchaseLock(user.uid, paymentId, 'released').catch(() => {});
          return res.json({
            ok: false,
            duplicate: true,
            refunded: true,
            paymentId,
            licenseGranted: false,
            code: 'DUPLICATE_LICENSE',
            message: '이미 Lifetime 라이선스를 보유하고 있어 중복 결제가 자동 취소되었습니다.'
          });
        }
      }
      return res.status(400).json({
        ok: false,
        message: status === 'CANCELLED' || status === 'PARTIAL_CANCELLED'
          ? '결제가 취소되었습니다.'
          : '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'PAYMENT_NOT_PAID'
      });
    }

    const paidAmount = Number(payment.amount?.total);
    const paidCurrency = normalizeCurrency(payment.currency);
    if (!Number.isFinite(paidAmount) || paidAmount !== Number(product.amount)) {
      console.warn('PortOne amount mismatch', {
        paymentId,
        paidAmount,
        expected: product.amount,
        uid: String(user.uid).slice(0, 6)
      });
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'AMOUNT_MISMATCH'
      });
    }
    if (paidCurrency !== product.currency) {
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'CURRENCY_MISMATCH'
      });
    }

    const orderName = String(payment.orderName || '');
    if (!product.allowedOrderNames.includes(orderName)) {
      console.warn('PortOne orderName mismatch', { paymentId, orderName });
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'ORDER_NAME_MISMATCH'
      });
    }

    const custom = parsePortOneCustomData(payment.customData);
    if (custom.productId && custom.productId !== product.productId) {
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'PRODUCT_MISMATCH'
      });
    }
    // Client may include uid in customData; never trust it for issuance.
    if (custom.uid && custom.uid !== user.uid) {
      console.warn('PortOne customData uid differs from auth uid', {
        paymentId,
        authUid: String(user.uid).slice(0, 6)
      });
    }

    const configuredStoreId = cfg('PORTONE_STORE_ID', '');
    if (configuredStoreId && payment.storeId && payment.storeId !== configuredStoreId) {
      return res.status(400).json({
        ok: false,
        message: '결제 확인 중 오류가 발생했습니다.',
        paymentId,
        code: 'STORE_MISMATCH'
      });
    }

    // Duplicate lifetime guard — never overwrite an existing active lifetime license.
    const existingLicense = await readUserLicense(user.uid);
    if (isActiveLifetimeLicense(existingLicense)) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      let cancelResult = null;
      let cancelError = null;
      try {
        cancelResult = await cancelPortOnePayment(
          paymentId,
          'Duplicate lifetime license — automatic full refund',
          paidAmount
        );
      } catch (cancelErr) {
        cancelError = {
          message: cancelErr.message || 'cancel failed',
          detail: cancelErr.detail || null
        };
        console.error('duplicate lifetime cancel failed', {
          paymentId,
          uid: String(user.uid).slice(0, 6),
          cancelError
        });
      }

      const refundOk = !cancelError;
      await orderRef.set({
        paymentId,
        uid: user.uid,
        email: user.email || '',
        provider: 'portone',
        paymentMethod: 'kakaopay',
        environment,
        productId: product.productId,
        orderName,
        amount: product.amount,
        currency: product.currency,
        plan: product.plan,
        status: refundOk ? 'duplicate_refunded' : 'duplicate_refund_failed',
        verificationStatus: 'verified_duplicate',
        licenseIssued: false,
        existingLicenseUid: user.uid,
        existingLicensePlan: existingLicense.plan || 'lifetime',
        existingLicenseStatus: existingLicense.status || 'active',
        portoneTransactionId: payment.transactionId || '',
        rawStatus: payment.status || status,
        refundReason: 'duplicate_lifetime',
        refundAt: now,
        refundResult: refundOk
          ? {
              cancellationId: cancelResult?.cancellation?.id || cancelResult?.cancellation?.pgCancellationId || '',
              status: cancelResult?.cancellation?.status || 'SUCCEEDED'
            }
          : null,
        refundError: cancelError,
        createdAt: existingSnap.exists ? (existingSnap.data().createdAt || now) : now,
        updatedAt: now
      }, { merge: true });

      // Do NOT touch licenses/{uid}
      await releasePurchaseLock(user.uid, paymentId, 'released').catch(() => {});

      if (refundOk) {
        return res.json({
          ok: false,
          duplicate: true,
          refunded: true,
          paymentId,
          licenseGranted: false,
          code: 'DUPLICATE_LICENSE',
          message: '이미 Lifetime 라이선스를 보유하고 있어 중복 결제가 자동 취소(전액 환불)되었습니다.'
        });
      }
      return res.status(409).json({
        ok: false,
        duplicate: true,
        refunded: false,
        paymentId,
        licenseGranted: false,
        code: 'DUPLICATE_REFUND_FAILED',
        message: '이미 Lifetime 라이선스가 있습니다. 중복 결제 자동 취소에 실패해 관리자 확인이 필요합니다. paymentId를 보관해 주세요.'
      });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    let issued = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      const licenseSnap = await tx.get(licenseRef);
      const licenseData = licenseSnap.exists ? (licenseSnap.data() || {}) : null;

      // Re-check inside transaction to avoid race with concurrent verify calls.
      if (isActiveLifetimeLicense(licenseData)) {
        throw Object.assign(new Error('DUPLICATE_LICENSE_RACE'), {
          status: 409,
          code: 'DUPLICATE_LICENSE_RACE'
        });
      }

      if (snap.exists) {
        const existing = snap.data() || {};
        if (existing.uid && existing.uid !== user.uid) {
          throw Object.assign(new Error('이미 다른 계정에서 처리된 결제입니다.'), { status: 403 });
        }
        if (
          existing.status === 'completed' &&
          existing.verificationStatus === 'verified' &&
          existing.licenseIssued === true
        ) {
          issued = false;
          return;
        }
      }

      tx.set(orderRef, {
        paymentId,
        uid: user.uid,
        email: user.email || '',
        provider: 'portone',
        paymentMethod: 'kakaopay',
        environment,
        productId: product.productId,
        productDocId: product.productDocId || DEFAULT_PRODUCT_DOC,
        productName: product.productName || 'Lifetime License',
        region: product.region || 'KR',
        pricingVersion: product.pricingVersion || 0,
        orderName,
        amount: product.amount,
        currency: product.currency,
        plan: product.plan,
        status: 'completed',
        verificationStatus: 'verified',
        licenseIssued: true,
        portoneTransactionId: payment.transactionId || '',
        rawStatus: status,
        createdAt: snap.exists ? (snap.data().createdAt || now) : now,
        verifiedAt: now,
        issuedAt: now,
        completedAt: now,
        updatedAt: now
      }, { merge: true });

      tx.set(
        licenseRef,
        lifetimeLicensePayload({
          user,
          plan: product.plan,
          method: 'kakaopay',
          memo: `KakaoPay 자동 지급 · payment ${paymentId}`,
          extra: {
            portonePaymentId: paymentId,
            portoneTransactionId: payment.transactionId || ''
          }
        }),
        { merge: true }
      );
      issued = true;
    });

    console.log('TEST PAYMENT verified', {
      paymentId,
      uid: String(user.uid).slice(0, 6),
      environment,
      issued
    });

    await releasePurchaseLock(user.uid, paymentId, 'completed').catch(() => {});

    return res.json({
      ok: true,
      paymentId,
      alreadyCompleted: !issued,
      licenseGranted: true,
      email: user.email || '',
      amount: product.amount,
      currency: product.currency,
      paymentMethod: 'kakaopay',
      environment,
      plan: product.plan
    });
  } catch (err) {
    console.error('verifyPortOnePaymentAndIssueLicense', err);
    if (err.code === 'DUPLICATE_LICENSE_RACE') {
      // Concurrent verify: another payment already issued the license. Cancel this one.
      const racePaymentId = String((req.body && req.body.paymentId) || '').trim();
      const product = await serverKrProduct().catch(() => envKrFallback());
      const environment = cfg('PORTONE_ENVIRONMENT', 'test');
      let cancelError = null;
      let cancelResult = null;
      try {
        cancelResult = await cancelPortOnePayment(
          racePaymentId,
          'Duplicate lifetime license race — automatic full refund',
          product.amount
        );
      } catch (cancelErr) {
        cancelError = {
          message: cancelErr.message || 'cancel failed',
          detail: cancelErr.detail || null
        };
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      const refundOk = !cancelError;
      if (racePaymentId) {
        await db.collection('orders').doc(racePaymentId).set({
          paymentId: racePaymentId,
          uid: authUid,
          provider: 'portone',
          paymentMethod: 'kakaopay',
          environment,
          productId: product.productId,
          amount: product.amount,
          currency: product.currency,
          plan: product.plan,
          status: refundOk ? 'duplicate_refunded' : 'duplicate_refund_failed',
          verificationStatus: 'verified_duplicate',
          licenseIssued: false,
          existingLicenseUid: authUid,
          refundReason: 'duplicate_lifetime_race',
          refundAt: now,
          refundResult: refundOk
            ? {
                cancellationId: cancelResult?.cancellation?.id || '',
                status: cancelResult?.cancellation?.status || 'SUCCEEDED'
              }
            : null,
          refundError: cancelError,
          updatedAt: now,
          createdAt: now
        }, { merge: true });
        if (authUid) {
          await releasePurchaseLock(authUid, racePaymentId, 'released').catch(() => {});
        }
      }
      if (refundOk) {
        return res.json({
          ok: false,
          duplicate: true,
          refunded: true,
          paymentId: racePaymentId || undefined,
          licenseGranted: false,
          code: 'DUPLICATE_LICENSE',
          message: '이미 Lifetime 라이선스를 보유하고 있어 중복 결제가 자동 취소(전액 환불)되었습니다.'
        });
      }
      return res.status(409).json({
        ok: false,
        duplicate: true,
        refunded: false,
        paymentId: racePaymentId || undefined,
        licenseGranted: false,
        code: 'DUPLICATE_REFUND_FAILED',
        message: '이미 Lifetime 라이선스가 있습니다. 중복 결제 자동 취소에 실패해 관리자 확인이 필요합니다.'
      });
    }
    const status = err.status || 500;
    const userMessage =
      status === 401
        ? '로그인이 만료되었습니다. 다시 로그인해 주세요.'
        : status === 403
          ? err.message
          : status === 404
            ? '결제 확인 중 오류가 발생했습니다.'
            : '결제는 완료되었으나 라이선스 확인이 필요합니다.';
    return res.status(status).json({
      ok: false,
      message: userMessage,
      paymentId: (req.body && req.body.paymentId) || undefined
    });
  }
});

async function verifyPayPalWebhook(req) {
  const webhookId = cfg('PAYPAL_WEBHOOK_ID');
  if (!webhookId) return { ok: false, skipped: true, reason: 'PAYPAL_WEBHOOK_ID not configured' };
  const accessToken = await paypalAccessToken();
  const payload = {
    auth_algo: req.headers['paypal-auth-algo'],
    cert_url: req.headers['paypal-cert-url'],
    transmission_id: req.headers['paypal-transmission-id'],
    transmission_sig: req.headers['paypal-transmission-sig'],
    transmission_time: req.headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: req.body
  };
  const pp = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await pp.json().catch(() => ({}));
  return { ok: data.verification_status === 'SUCCESS', detail: data };
}

exports.paypalWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  try {
    const verification = await verifyPayPalWebhook(req);
    if (!verification.ok) {
      console.warn('PayPal webhook verification failed/skipped', verification);
      if (!verification.skipped) return res.status(400).send('invalid webhook signature');
    }
    const event = req.body || {};
    const type = event.event_type || '';
    const resource = event.resource || {};
    const captureId = resource.id || resource.supplementary_data?.related_ids?.capture_id || '';

    if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'].includes(type)) {
      const q = await db.collection('orders').where('paypalCaptureId', '==', captureId).limit(1).get();
      if (!q.empty) {
        const order = q.docs[0];
        const uid = order.data().uid;
        await db.runTransaction(async tx => {
          tx.set(order.ref, { status: 'refunded', refundEventType: type, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          if (uid) tx.set(db.collection('licenses').doc(uid), { status: 'refunded', licensed: false, updatedAt: admin.firestore.FieldValue.serverTimestamp(), memo: `PayPal ${type}` }, { merge: true });
        });
      }
    }
    return res.status(200).send('ok');
  } catch (err) {
    console.error('paypalWebhook', err);
    return res.status(500).send(err.message || 'webhook error');
  }
});

// Board MIDI/file proxy — browser CORS 우회용 (미리듣기)
exports.boardFileProxy = functions.https.onRequest(async (req, res) => {
  // Public board attachments: allow any browser origin
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  try {
    const path = String(req.query.path || '').trim();
    if (!path || !path.startsWith('board/') || path.includes('..') || path.includes('\\')) {
      res.status(400).send('Invalid path');
      return;
    }
    const bucketName = cfg('STORAGE_BUCKET', '') || admin.app().options.storageBucket || '';
    const bucket = bucketName ? admin.storage().bucket(bucketName) : admin.storage().bucket();
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send('File not found');
      return;
    }
    const [buf] = await file.download();
    let contentType = 'application/octet-stream';
    try {
      const [meta] = await file.getMetadata();
      contentType = meta.contentType || contentType;
    } catch (_) {}
    if (/\.(mid|midi)$/i.test(path)) contentType = 'audio/midi';
    if (/\.wav$/i.test(path)) contentType = 'audio/wav';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buf);
  } catch (err) {
    console.error('boardFileProxy', err);
    res.status(500).send(err.message || 'proxy error');
  }
});

const { onSchedule } = require('firebase-functions/v2/scheduler');

/**
 * When a timed license reaches expiresAt, keep status active and
 * convert plan to trial (clear date bounds) instead of status=expired.
 */
exports.expireTimedLicenses = onSchedule({
  schedule: 'every 60 minutes',
  timeZone: 'Asia/Seoul',
}, async () => {
  const now = admin.firestore.Timestamp.now();
  let expired = 0;
  while (true) {
    const snap = await db.collection('licenses')
      .where('status', '==', 'active')
      .where('expiresAt', '<=', now)
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((docSnap) => {
      const patch = {
        plan: 'trial',
        licensed: true,
        status: 'active',
        startsAt: admin.firestore.FieldValue.delete(),
        expiresAt: admin.firestore.FieldValue.delete(),
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireReason: 'auto_period_to_trial'
      };
      batch.set(docSnap.ref, patch, { merge: true });
    });
    await batch.commit();
    expired += snap.size;
    if (snap.size < 400) break;
  }
  console.log('expireTimedLicenses done', { convertedToTrial: expired });
  return null;
});

const {
  notifyInquiryCreated,
  notifyPaymentCompleted,
  isLicenseGrantedOrder
} = require('./discordNotify');
const { broadcastPublishedContent } = require('./broadcastNotify');

const functionsV1 = require('firebase-functions/v1');

/**
 * Ensure every users/{uid} has licenses/{uid}.
 * Covers new Google signups and heals accounts that missed trial create
 * after licenses writes were restricted to admin/Functions.
 */
exports.ensureTrialLicenseOnUserWrite = functionsV1
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .firestore.document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    if (!change.after.exists) return null;
    try {
      const licenseRef = db.collection('licenses').doc(uid);
      const licSnap = await licenseRef.get();
      if (licSnap.exists) return null;

      const user = change.after.data() || {};
      const role = String(user.role || 'user').toLowerCase().trim();
      const isAdminRole = role === 'admin' || role === 'developer' || role === 'staff';
      const now = admin.firestore.FieldValue.serverTimestamp();
      const payload = isAdminRole
        ? {
            licensed: true,
            plan: 'lifetime',
            status: 'active',
            method: 'admin',
            createdAt: now,
            updatedAt: now
          }
        : {
            licensed: true,
            plan: 'trial',
            status: 'active',
            method: 'signup',
            createdAt: now,
            updatedAt: now
          };
      await licenseRef.set(payload, { merge: true });
    } catch (err) {
      console.error('ensureTrialLicenseOnUserWrite', {
        uid,
        message: err && err.message ? err.message : String(err)
      });
    }
    return null;
  });

/**
 * New 1:1 support ticket → Discord inquiry channel.
 * Uses DISCORD_INQUIRY_WEBHOOK secret. Never blocks the client create path.
 */
exports.notifyDiscordOnInquiryCreate = functionsV1
  .runWith({ secrets: [discordInquiryWebhook], timeoutSeconds: 30, memory: '256MB' })
  .firestore.document('supportTickets/{ticketId}')
  .onCreate(async (snap, context) => {
    const ticketId = context.params.ticketId;
    try {
      await notifyInquiryCreated(ticketId, snap.data() || {}, snap.ref);
    } catch (err) {
      console.error('notifyDiscordOnInquiryCreate', {
        ticketId,
        message: err && err.message ? err.message : String(err)
      });
    }
    return null;
  });

/**
 * Order completed + license issued → Discord payment channel.
 * Uses DISCORD_PAYMENT_WEBHOOK secret. Ignores created/cancelled/failed orders.
 */
exports.notifyDiscordOnOrderCompleted = functionsV1
  .runWith({ secrets: [discordPaymentWebhook], timeoutSeconds: 30, memory: '256MB' })
  .firestore.document('orders/{orderId}')
  .onWrite(async (change, context) => {
    const orderId = context.params.orderId;
    try {
      if (!change.after.exists) return null;
      const after = change.after.data() || {};
      if (after.discordNotified === true) return null;
      if (!isLicenseGrantedOrder(after)) return null;
      await notifyPaymentCompleted(orderId, after, change.after.ref);
    } catch (err) {
      console.error('notifyDiscordOnOrderCompleted', {
        orderId,
        message: err && err.message ? err.message : String(err)
      });
    }
    return null;
  });

/**
 * Visible announcement / patch note → fan-out user inbox notifications.
 * Runs once per document (userNotified claim). Idempotent notification IDs.
 */
async function onPublishedContentWrite(type, change, context) {
  if (!change.after.exists) return null;
  const after = change.after.data() || {};
  if (after.visible !== true) return null;
  if (after.userNotified === true) return null;
  try {
    await broadcastPublishedContent(type, context.params.postId, after, change.after.ref);
  } catch (err) {
    console.error(`notifyUsersOn${type}`, {
      postId: context.params.postId,
      message: err && err.message ? err.message : String(err)
    });
  }
  return null;
}

exports.notifyUsersOnAnnouncement = functionsV1
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .firestore.document('announcements/{postId}')
  .onWrite((change, context) => onPublishedContentWrite('notice', change, context));

exports.notifyUsersOnPatchNote = functionsV1
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .firestore.document('patchNotes/{postId}')
  .onWrite((change, context) => onPublishedContentWrite('patch_note', change, context));
