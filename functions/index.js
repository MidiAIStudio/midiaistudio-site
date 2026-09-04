const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');

admin.initializeApp();
const db = admin.firestore();
const catalogEngine = require('./catalogEngine');
const fxRate = require('./fxRate');
const passEntitlement = require('./passEntitlement');
const portoneRefundSync = require('./portoneRefundSync');
const userNotify = require('./userNotify');
const paypalCurrency = require('./paypalCurrency');

/** Discord webhooks — set via Secret Manager / `firebase functions:secrets:set` */
const discordInquiryWebhook = defineSecret('DISCORD_INQUIRY_WEBHOOK');
const discordPaymentWebhook = defineSecret('DISCORD_PAYMENT_WEBHOOK');
const gmailUser = defineSecret('GMAIL_USER');
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');
/** Support AI LLM — Secret Manager; bound only on supportAi* HTTPS functions */
const openaiApiKey = defineSecret('OPENAI_API_KEY');
/** Kakao OAuth (admin Talk notify prep) — Secret Manager; bound only on kakaoOAuthCallback */
const kakaoRestApiKey = defineSecret('KAKAO_REST_API_KEY');
const kakaoClientSecret = defineSecret('KAKAO_CLIENT_SECRET');

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
    origin.startsWith('http://127.0.0.1:') ||
    /^https:\/\/midiaistudio(--[a-z0-9-]+)?\.web\.app$/i.test(origin) ||
    /^https:\/\/midiaistudio(--[a-z0-9-]+)?\.firebaseapp\.com$/i.test(origin)
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

async function requireAdmin(req) {
  const user = await requireUser(req);
  const snap = await db.collection('users').doc(user.uid).get();
  const role = String((snap.data() || {}).role || '').toLowerCase();
  if (role !== 'admin' && role !== 'developer' && role !== 'staff') {
    throw Object.assign(new Error('관리자만 사용할 수 있습니다.'), { status: 403 });
  }
  return user;
}

async function applyPortOneRefundSync(paymentId, source, actorUid) {
  const payment = await fetchPortOnePayment(paymentId);
  const result = await portoneRefundSync.syncPortOnePayment({
    db,
    FieldValue: admin.firestore.FieldValue,
    Timestamp: admin.firestore.Timestamp,
    paymentId,
    payment,
    source,
    actorUid
  });
  if (result && result.ok !== false && !result.skipped) {
    try {
      await userNotify.maybeNotifyFromRefundSync(db, admin.firestore.FieldValue, result);
    } catch (notifErr) {
      console.warn('applyPortOneRefundSync notify', notifErr && notifErr.message);
    }
  }
  return result;
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
    amount: Number(cfg('PORTONE_KR_AMOUNT', '129000')),
    currency: String(cfg('PORTONE_KR_CURRENCY', 'KRW')).toUpperCase().replace(/^CURRENCY_/, ''),
    productId: cfg('PORTONE_PRODUCT_ID', 'midiai-lifetime'),
    productCanonicalId: 'LIFETIME',
    productType: 'lifetime',
    entitlement: 'lifetime',
    durationDays: 0,
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

async function loadPromotions() {
  try {
    const snap = await db.collection('promotions').get();
    return snap.docs.map((d) => ({ id: d.id, promotionId: d.id, ...d.data() }));
  } catch (e) {
    console.warn('promotions load failed', e);
    return [];
  }
}

async function isDiscountCampaignActiveServer() {
  try {
    const snap = await db.collection('pricingConfig').doc('main').get();
    const promo = snap.exists ? (snap.data() || {}).promo : null;
    if (!promo || promo.enabled !== true) return false;
    return catalogEngine.isWindowActive(true, promo.discountStartsAt || '', promo.discountEndsAt || '');
  } catch (e) {
    console.warn('promo check failed', e);
    return false;
  }
}

async function loadRegionCharge(regionCode, productDocId = DEFAULT_PRODUCT_DOC) {
  const snap = await db.collection('products').doc(productDocId).get();
  let data = {};
  let hydrated;
  if (!snap.exists) {
    const seed = catalogEngine.seedById(productDocId) || catalogEngine.seedById(catalogEngine.normalizeProductId(productDocId));
    if (seed && (seed.type === 'full_pass' || catalogEngine.isPassProductId(seed.productId))) {
      hydrated = catalogEngine.hydrateProduct(seed.productId, seed);
      data = seed;
    } else if (regionCode === 'KR' && (productDocId === DEFAULT_PRODUCT_DOC || catalogEngine.normalizeProductId(productDocId) === 'LIFETIME')) {
      return envKrFallback();
    } else if (regionCode !== 'KR') {
      const lifeSeed = catalogEngine.seedById('LIFETIME') || catalogEngine.seedById(productDocId);
      if (lifeSeed) {
        hydrated = catalogEngine.hydrateProduct(lifeSeed.productId || 'LIFETIME', lifeSeed);
        data = lifeSeed;
      } else {
        const err = new Error('상품을 찾을 수 없습니다.');
        err.status = 404;
        err.code = 'PRODUCT_NOT_FOUND';
        throw err;
      }
    } else {
      const err = new Error('상품을 찾을 수 없습니다.');
      err.status = 404;
      err.code = 'PRODUCT_NOT_FOUND';
      throw err;
    }
  } else {
    data = snap.data() || {};
    hydrated = catalogEngine.hydrateProduct(snap.id, data);
  }
  if (hydrated.status === 'paused' || hydrated.status === 'paused'
      || hydrated.status === 'archived' || hydrated.status === 'archived') {
    const err = new Error('현재 일시 판매중지된 상품입니다.');
    err.status = 403;
    err.code = 'SALE_DISABLED';
    throw err;
  }
  const promotions = await loadPromotions();
  const currencyWanted = paypalCurrency.regionChargeCurrency(regionCode);
  let fxMeta = null;
  let charge;
  if (currencyWanted === 'USD') {
    fxMeta = await fxRate.getUsdKrwRate(db);
    if (!fxMeta.ok) {
      const err = new Error(fxMeta.message || fxRate.FX_UNAVAILABLE_MESSAGE);
      err.status = 503;
      err.code = 'FX_UNAVAILABLE';
      throw err;
    }
    charge = catalogEngine.computeCharge(hydrated, promotions, new Date(), 'USD', { fxRate: fxMeta.rate });
  } else {
    charge = catalogEngine.computeCharge(hydrated, promotions, new Date(), 'KRW');
  }
  const regions = data.regions || {};
  const region = regions[regionCode] || (regionCode === 'KR' ? null : regions.Global) || regions.KR || {};
  if (charge.ok && !charge.discount && currencyWanted === 'KRW') {
    const campaignOn = await isDiscountCampaignActiveServer();
    // Authoritative list = Firestore listPriceKrw (hydrated). Do not let a stale
    // regions.KR.listPrice win over an admin-updated catalog price.
    const authList = Number(hydrated.listPriceKrw);
    const regionList = Number(region.listPrice);
    const rawSale = Number(region.salePrice);
    const listAligned = !Number.isFinite(regionList) || regionList <= 0
      || (Number.isFinite(authList) && authList > 0 && regionList === authList);
    const listPrice = Number.isFinite(authList) && authList > 0
      ? authList
      : (Number.isFinite(regionList) && regionList > 0 ? regionList : NaN);
    if (
      campaignOn
      && listAligned
      && Number.isFinite(rawSale)
      && rawSale > 0
      && Number.isFinite(listPrice)
      && rawSale < listPrice
    ) {
      charge.effectivePrice = Math.round(rawSale);
      charge.basePrice = listPrice;
      charge.discount = { source: 'legacy_promo' };
      charge.discountPercent = catalogEngine.displayDiscountPercent(charge.basePrice, charge.effectivePrice);
    }
  }
  if (!charge.ok || !Number.isFinite(Number(charge.effectivePrice)) || Number(charge.effectivePrice) <= 0) {
    if (charge && charge.code === 'FX_UNAVAILABLE') {
      const err = new Error(fxRate.FX_UNAVAILABLE_MESSAGE);
      err.status = 503;
      err.code = 'FX_UNAVAILABLE';
      throw err;
    }
    // Existing Firestore docs must not silently fall back to env Lifetime amount.
    if (snap.exists) {
      const err = new Error('상품 가격을 계산할 수 없습니다. Admin catalog의 listPriceKrw를 확인하세요.');
      err.status = 500;
      err.code = 'PRICE_INVALID';
      throw err;
    }
    if (regionCode === 'KR') return envKrFallback();
    const err = new Error('상품 가격을 계산할 수 없습니다.');
    err.status = 500;
    err.code = 'PRICE_INVALID';
    throw err;
  }
  const currency = currencyWanted;
  const orderName = region.orderName || hydrated.orderNameKo || data.name || data.orderNameKo || 'MidiAI Studio Lifetime License';
  const productId = region.portoneProductId || cfg('PORTONE_PRODUCT_ID', productDocId);
  const salePrice = charge.effectivePrice;
  const listPrice = charge.basePrice;
  const base = {
    plan: data.plan || (hydrated.type === 'full_pass' ? 'period' : 'lifetime'),
    productDocId,
    productCanonicalId: hydrated.productId || catalogEngine.normalizeProductId(productDocId),
    productType: hydrated.type || 'lifetime',
    entitlement: hydrated.entitlement || (hydrated.type === 'full_pass' ? 'full_pass' : 'lifetime'),
    durationDays: hydrated.type === 'full_pass'
      ? passEntitlement.passDurationDays(hydrated.productId, hydrated.durationDays)
      : 0,
    productName: data.name || hydrated.nameKo || hydrated.orderNameKo || 'Lifetime License',
    region: regionCode,
    pricingVersion: Number(charge.productVersion) || 1,
    status: hydrated.status || 'active',
    listPrice,
    payment: paypalCurrency.isPortOneRegion(regionCode) ? 'portone' : 'paypal',
    orderName,
    currency,
    discountPercent: charge.discountPercent || 0,
    promotionId: (charge.discount && charge.discount.promotionId) || charge.promotionId || '',
    listPriceKrw: Number(charge.listPriceKrw || hydrated.listPriceKrw || 0),
    effectivePriceKrw: Number(charge.effectivePriceKrw || (currencyWanted === 'KRW' ? salePrice : 0)),
    creditAmount: Number(hydrated.creditAmount || charge.creditAmount || 0),
    fxRate: fxMeta ? fxMeta.rate : null,
    fxSource: fxMeta ? fxMeta.source : '',
    fxFetchedAt: fxMeta ? fxMeta.fetchedAt : '',
    fxCache: fxMeta ? fxMeta.cache : ''
  };
  if (paypalCurrency.isPortOneRegion(regionCode)) {
    return {
      ...base,
      amount: Math.round(salePrice),
      payAmountUsd: null,
      productId,
      allowedOrderNames: Array.from(new Set([
        orderName,
        hydrated.orderNameKo,
        hydrated.orderNameEn,
        hydrated.nameKo,
        hydrated.nameEn,
        hydrated.nameJa,
        data.orderNameKo,
        data.orderNameEn,
        data.nameKo,
        data.nameEn,
        'MidiAI Studio Lifetime License',
        'MidiAI Studio Lifetime 디지털 라이선스',
        cfg('PORTONE_ORDER_NAME', orderName)
      ].filter(Boolean)))
    };
  }
  const payAmountUsd = Number(charge.payAmountUsd != null ? charge.payAmountUsd : salePrice);
  const krwAnchor = Number(charge.effectivePriceKrw || hydrated.listPriceKrw || 0);
  if (
    Number.isFinite(krwAnchor)
    && krwAnchor >= 100
    && Number.isFinite(payAmountUsd)
    && Math.abs(payAmountUsd - krwAnchor) < 0.011
  ) {
    const err = new Error(paypalCurrency.paypalCurrencyErrorMessage('ko'));
    err.status = 400;
    err.code = 'QUOTE_CURRENCY';
    throw err;
  }
  return {
    ...base,
    currency: 'USD',
    payment: 'paypal',
    amount: formatChargeAmount(payAmountUsd, 'USD'),
    payAmountUsd,
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
 * Body: { paymentId, productId? } — productId may be LIFETIME, PASS_7D/30D/90D,
 * or legacy PortOne SKU (midiai-lifetime).
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
    const rawPid = String(productId || 'LIFETIME').trim();
    let pid = catalogEngine.normalizeProductId(rawPid);
    if (!catalogEngine.isLicenseProductId(pid)) {
      // Legacy PortOne Lifetime channel SKU from older clients.
      if (rawPid === 'midiai-lifetime' || /^midiai[-_]?lifetime$/i.test(rawPid)) {
        pid = 'LIFETIME';
      }
    }
    if (!catalogEngine.isLicenseProductId(pid)) {
      return res.status(400).json({
        ok: false,
        eligible: false,
        code: 'PRODUCT_MISMATCH',
        message: '상품 정보가 일치하지 않습니다.'
      });
    }
    let product;
    try {
      product = await loadRegionCharge('KR', catalogEngine.firestoreDocId(pid));
    } catch (prodErr) {
      return res.status(prodErr.status || 400).json({
        ok: false,
        eligible: false,
        code: prodErr.code || 'PRODUCT_UNAVAILABLE',
        message: prodErr.message || '상품을 구매할 수 없습니다.'
      });
    }
    const canonicalPid = catalogEngine.normalizeProductId(product.productCanonicalId || pid);

    const license = await readUserLicense(user.uid);
    if (isActiveLifetimeLicense(license)) {
      return res.json({
        ok: true,
        eligible: false,
        hasLifetime: true,
        code: 'LIFETIME_ALREADY_OWNED',
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
        // Prefer canonical catalog id for quotes; PortOne channel SKU stays in productId for Lifetime.
        productId: catalogEngine.isPassProductId(canonicalPid)
          ? canonicalPid
          : (product.productId || canonicalPid),
        productCanonicalId: canonicalPid,
        productDocId: product.productDocId,
        entitlement: product.entitlement || (catalogEngine.isPassProductId(canonicalPid) ? 'full_pass' : 'lifetime'),
        durationDays: catalogEngine.isPassProductId(canonicalPid)
          ? passEntitlement.passDurationDays(canonicalPid, product.durationDays)
          : 0
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

exports.createPurchaseQuote = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    const productKey = String((req.body || {}).productId || 'LIFETIME');
    const pid = catalogEngine.normalizeProductId(productKey);
    if (!catalogEngine.isLicenseProductId(pid)) {
      return res.status(400).json({
        ok: false,
        code: 'USE_CREDIT_QUOTE',
        message: 'Credit quotes are created by createCreditPurchaseQuote.'
      });
    }
    const license = await readUserLicense(user.uid);
    if (isActiveLifetimeLicense(license)) {
      return res.status(403).json({
        ok: false,
        code: 'LIFETIME_ALREADY_OWNED',
        message: '이미 Lifetime 라이선스를 보유하고 있습니다.'
      });
    }
    const docId = catalogEngine.firestoreDocId(pid);
    const currencyWanted = String((req.body || {}).currency || 'KRW').toUpperCase() === 'USD' ? 'USD' : 'KRW';
    const product = await loadRegionCharge(currencyWanted === 'USD' ? 'Global' : 'KR', docId);
    // Never trust client durationDays — catalog/seed only.
    const durationDays = catalogEngine.isPassProductId(pid)
      ? passEntitlement.passDurationDays(pid, product.durationDays)
      : 0;
    const now = new Date();
    const expires = catalogEngine.quoteExpiry(now);
    const quoteRef = db.collection('purchaseQuotes').doc();
    const isUsd = currencyWanted === 'USD';
    if (isUsd) {
      const usd = paypalCurrency.usdQuoteFromCharge(product);
      if (!usd.ok) {
        return res.status(400).json({
          ok: false,
          code: usd.code || 'QUOTE_CURRENCY',
          message: paypalCurrency.paypalCurrencyErrorMessage(paypalCurrency.requestUiLang(req))
        });
      }
      const krw = Number(product.effectivePriceKrw || product.listPriceKrw || 0);
      if (Number.isFinite(krw) && krw >= 100 && Math.abs(usd.payAmountUsd - krw) < 0.011) {
        return res.status(400).json({
          ok: false,
          code: 'QUOTE_CURRENCY',
          message: paypalCurrency.paypalCurrencyErrorMessage(paypalCurrency.requestUiLang(req))
        });
      }
    }
    const payAmountUsd = isUsd
      ? Number(product.payAmountUsd != null ? product.payAmountUsd : product.amount)
      : null;
    const quote = {
      quoteId: quoteRef.id,
      uid: user.uid,
      productId: pid,
      productVersion: Number(product.pricingVersion || 1),
      pricingVersion: Number(product.pricingVersion || 1),
      basePrice: product.listPrice,
      discountType: product.discountPercent ? 'percent' : '',
      discountValue: product.discountPercent || 0,
      finalPrice: isUsd ? payAmountUsd : Number(product.amount),
      currency: isUsd ? 'USD' : 'KRW',
      listPriceKrw: Number(product.listPriceKrw || (isUsd ? 0 : product.listPrice) || 0),
      effectivePriceKrw: Number(product.effectivePriceKrw || (isUsd ? 0 : product.amount) || 0),
      fxRate: isUsd ? Number(product.fxRate || 0) : null,
      fxSource: isUsd ? (product.fxSource || '') : '',
      fxFetchedAt: isUsd ? (product.fxFetchedAt || '') : '',
      payAmountUsd: isUsd ? payAmountUsd : null,
      creditAmount: 0,
      entitlement: product.entitlement || (catalogEngine.isPassProductId(pid) ? 'full_pass' : 'lifetime'),
      durationDays,
      promotionId: product.promotionId || '',
      status: 'open',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expires
    };
    await quoteRef.set(quote);
    return res.json({ ok: true, ...quote, quoteId: quoteRef.id, expiresAt: expires.toISOString() });
  } catch (err) {
    return res.status(err.status || 400).json({
      ok: false,
      code: err.code || 'QUOTE_FAILED',
      message: err.message || 'Quote failed.'
    });
  }
});

const creditPurchase = require('./creditPurchase');
const creditHandlers = creditPurchase.createHandlers({
  db,
  admin,
  cors,
  requireUser,
  loadRegionCharge,
  fetchPortOnePayment,
  parsePortOneCustomData,
  normalizeCurrency,
  catalogEngine,
  userNotify
});
exports.createCreditPurchaseQuote = functions.https.onRequest(creditHandlers.createCreditPurchaseQuote);
exports.creditPortOnePurchase = functions.https.onRequest(creditHandlers.creditPortOnePurchase);
exports.creditPortOnePointPurchase = functions.https.onRequest(creditHandlers.creditPortOnePurchase);
// Wallet read / ledger: Python codebase owns getCreditBalance, getPointBalance,
// listCreditLedger, listPointLedger and the Credit V2 twins (*V2).
// Do not re-export those names here. Admin grant/purchase write creditWalletsV2.

const functionsV1Https = require('firebase-functions/v1');
const adminCredits = require('./adminCredits');
const adminCreditHandlers = adminCredits.createHandlers({
  db,
  admin,
  cors,
  requireAdmin,
  userNotify
});
exports.adminGrantCredits = functions.https.onRequest(adminCreditHandlers.adminGrantCredits);
exports.adminGrantPoints = functions.https.onRequest(adminCreditHandlers.adminGrantPoints);
exports.adminDeductCredits = functions.https.onRequest(adminCreditHandlers.adminDeductCredits);
exports.adminDeductPoints = functions.https.onRequest(adminCreditHandlers.adminDeductPoints);
exports.adminCreditOverview = functions.https.onRequest(adminCreditHandlers.adminCreditOverview);
exports.adminPointOverview = functions.https.onRequest(adminCreditHandlers.adminPointOverview);
exports.grantBulkCredits = functionsV1Https
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(adminCreditHandlers.grantBulkCredits);

const creditLedgerSideEffects = require('./creditLedgerSideEffects');

function createGmailSender() {
  const user = String(process.env.GMAIL_USER || '').trim();
  const passRaw = String(process.env.GMAIL_APP_PASSWORD || '');
  const pass = passRaw.replace(/\s+/g, '');
  console.info('gmail.sender.config', {
    userConfigured: Boolean(user),
    passConfigured: Boolean(pass),
    passLength: pass.length,
    passHadWhitespace: /\s/.test(passRaw)
  });
  if (!user || !pass) return null;
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: { user, pass }
  });
  async function sendMail({ to, subject, text, html }) {
    await transporter.sendMail({
      from: `"MidiAI Studio" <${user}>`,
      to,
      subject,
      text,
      html
    });
  }
  sendMail.verify = async function verifyGmail() {
    await transporter.verify();
  };
  return sendMail;
}

const adminBulkEmail = require('./adminBulkEmail');
const adminScheduledEmail = require('./adminScheduledEmail');
exports.sendAdminBulkEmail = functionsV1Https
  .runWith({
    secrets: [gmailUser, gmailAppPassword],
    timeoutSeconds: 540,
    memory: '256MB'
  })
  .https.onRequest((req, res) => {
    const handlers = adminBulkEmail.createHandlers({
      db,
      admin,
      cors,
      requireAdmin,
      sendMail: createGmailSender()
    });
    return handlers.sendAdminBulkEmail(req, res);
  });
exports.adminScheduledEmail = functionsV1Https
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest((req, res) => {
    const handlers = adminScheduledEmail.createHandlers({
      db,
      admin,
      cors,
      requireAdmin,
      Timestamp: admin.firestore.Timestamp
    });
    return handlers.adminScheduledEmail(req, res);
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
    const body = req.body || {};
    const quoteId = String(body.quoteId || '').trim();
    const requestedPid = catalogEngine.normalizeProductId(body.productId || '');
    if (!quoteId) {
      return res.status(400).json({
        ok: false,
        code: 'QUOTE_REQUIRED',
        message: '결제 견적이 필요합니다. 구매 창을 닫은 뒤 다시 시도해 주세요.'
      });
    }
    const quoteSnap = await db.collection('purchaseQuotes').doc(quoteId).get();
    if (!quoteSnap.exists) {
      return res.status(400).json({
        ok: false,
        code: 'QUOTE_MISSING',
        message: '결제 견적을 찾을 수 없습니다. 다시 시도해 주세요.'
      });
    }
    const quote = { quoteId: quoteSnap.id, ...quoteSnap.data() };
    const quotePid = catalogEngine.normalizeProductId(quote.productId || requestedPid || 'LIFETIME');
    const isCreditQuote = catalogEngine.isCreditProductId(quotePid)
      || Number(quote.creditAmount) > 0
      || quote.type === 'credit_pack';
    const existingLicense = await readUserLicense(user.uid);
    if (!isCreditQuote && isActiveLifetimeLicense(existingLicense)) {
      return res.status(403).json({
        ok: false,
        eligible: false,
        hasLifetime: true,
        code: 'LIFETIME_ALREADY_OWNED',
        message: '이미 Lifetime 라이선스를 보유하고 있습니다. 추가 결제는 필요하지 않습니다.'
      });
    }
    const quoteCheck = catalogEngine.quoteIsValid(quote, { uid: user.uid, productId: quotePid });
    if (!quoteCheck.ok) {
      return res.status(400).json({
        ok: false,
        code: quoteCheck.code || 'QUOTE_INVALID',
        message: '결제 견적이 만료되었거나 유효하지 않습니다. 다시 시도해 주세요.'
      });
    }
    if (String(quote.currency || '').toUpperCase() !== 'USD') {
      return res.status(400).json({
        ok: false,
        code: 'QUOTE_CURRENCY',
        message: paypalCurrency.paypalCurrencyErrorMessage(paypalCurrency.requestUiLang(req))
      });
    }
    const payUsd = Number(quote.payAmountUsd != null ? quote.payAmountUsd : quote.finalPrice);
    if (!Number.isFinite(payUsd) || payUsd <= 0) {
      return res.status(400).json({ ok: false, code: 'QUOTE_AMOUNT', message: '결제 금액이 올바르지 않습니다.' });
    }
    const amountValue = fxRate.formatUsd(payUsd).replace('$', '') || Number(payUsd).toFixed(2);
    const accessToken = await paypalAccessToken();
    const orderRef = db.collection('orders').doc();
    const payload = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: orderRef.id,
        custom_id: user.uid,
        description: isCreditQuote
          ? `MidiAI Studio ${quotePid} credits`
          : `MidiAI Studio ${quotePid} license`,
        amount: {
          currency_code: 'USD',
          value: amountValue
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
      quoteId,
      amount: Number(amountValue),
      currency: 'USD',
      plan: isCreditQuote ? 'credits' : (catalogEngine.isPassProductId(quotePid) ? 'period' : 'lifetime'),
      productId: quotePid,
      productCanonicalId: quotePid,
      productName: quotePid,
      productType: isCreditQuote ? 'credit_pack' : 'license',
      creditAmount: isCreditQuote ? Math.round(Number(quote.creditAmount || 0)) : 0,
      region: 'Global',
      pricingVersion: Number(quote.pricingVersion || quote.productVersion || 0),
      listPriceKrw: Number(quote.listPriceKrw || 0),
      effectivePriceKrw: Number(quote.effectivePriceKrw || 0),
      fxRate: Number(quote.fxRate || 0),
      fxSource: quote.fxSource || '',
      fxFetchedAt: quote.fxFetchedAt || '',
      payAmountUsd: Number(amountValue),
      chargedUsd: Number(amountValue),
      promotionId: quote.promotionId || '',
      provider: 'paypal',
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ ok: true, id: data.id, orderDocId: orderRef.id, amount: amountValue, currency: 'USD' });
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
    const expectedUsd = Number(existing.payAmountUsd != null ? existing.payAmountUsd : existing.amount);
    const expectedCurrency = String(existing.currency || 'USD').toUpperCase();
    const quoteId = String(existing.quoteId || '').trim();
    if (quoteId) {
      const quoteSnap = await db.collection('purchaseQuotes').doc(quoteId).get();
      if (!quoteSnap.exists) {
        return res.status(400).json({ ok: false, code: 'QUOTE_MISSING', message: '결제 견적을 찾을 수 없습니다.' });
      }
      const quote = { quoteId: quoteSnap.id, ...quoteSnap.data() };
      const qPid = catalogEngine.normalizeProductId(quote.productId || existing.productId);
      const qCheck = catalogEngine.quoteIsValid(quote, { uid: user.uid, productId: qPid });
      if (!qCheck.ok && quote.status !== 'used') {
        return res.status(400).json({
          ok: false,
          code: qCheck.code || 'QUOTE_INVALID',
          message: '결제 견적이 만료되었거나 유효하지 않습니다.'
        });
      }
      if (String(quote.uid || '') !== String(user.uid)) {
        return res.status(403).json({ ok: false, code: 'QUOTE_UID_MISMATCH', message: '결제 견적 사용자가 일치하지 않습니다.' });
      }
      if (String(quote.currency || '').toUpperCase() !== 'USD') {
        return res.status(400).json({
          ok: false,
          code: 'QUOTE_CURRENCY',
          message: paypalCurrency.paypalCurrencyErrorMessage(paypalCurrency.requestUiLang(req))
        });
      }
      const quoteUsd = Number(quote.payAmountUsd != null ? quote.payAmountUsd : quote.finalPrice);
      if (!fxRate.usdAmountsEqual(quoteUsd, expectedUsd)) {
        return res.status(400).json({ ok: false, code: 'QUOTE_AMOUNT_MISMATCH', message: '견적 금액이 주문과 일치하지 않습니다.' });
      }
    }
    if (String(paidCurrency || '').toUpperCase() !== expectedCurrency || !fxRate.usdAmountsEqual(paidValue, expectedUsd)) {
      return res.status(400).json({
        ok: false,
        message: '결제 금액 또는 통화가 일치하지 않습니다.',
        detail: { paidValue, paidCurrency, expectedUsd, expectedCurrency }
      });
    }

    const pid = catalogEngine.normalizeProductId(existing.productCanonicalId || existing.productId || 'LIFETIME');
    const isCreditOrder = catalogEngine.isCreditProductId(pid)
      || Number(existing.creditAmount) > 0
      || existing.plan === 'credits'
      || existing.productType === 'credit_pack';

    if (isCreditOrder) {
      const creditAmount = Math.round(Number(existing.creditAmount || 0));
      if (!(creditAmount > 0)) {
        return res.status(400).json({ ok: false, code: 'CREDIT_AMOUNT_INVALID', message: 'Credit 지급량이 올바르지 않습니다.' });
      }
      const granted = await creditHandlers.grantPayPalCredits({
        uid: user.uid,
        paymentId: orderId,
        productId: pid,
        creditAmount,
        amount: Number(expectedUsd),
        currency: 'USD',
        quoteId,
        email: user.email || existing.email || '',
        orderName: existing.productName || pid
      });
      try {
        await userNotify.notifyCreditGranted(db, admin.firestore.FieldValue, {
          uid: user.uid,
          paymentId: orderId,
          productId: pid,
          creditAmount,
          amount: Number(expectedUsd),
          currency: 'USD'
        });
      } catch (notifErr) {
        console.warn('capturePayPalOrder credit notify', notifErr && notifErr.message);
      }
      await orderDoc.ref.set({
        status: 'completed',
        licenseIssued: false,
        creditsGranted: true,
        creditAmount,
        balanceAfter: granted.balance,
        paypalCaptureId: capture.id || '',
        payerEmail: data.payer?.email_address || '',
        chargedUsd: Number(paidValue),
        chargedCurrency: String(paidCurrency || 'USD').toUpperCase(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        rawStatus: data.status
      }, { merge: true });
      if (quoteId) {
        await db.collection('purchaseQuotes').doc(quoteId).set({
          status: 'used',
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          paypalOrderId: orderId,
          paypalCaptureId: capture.id || ''
        }, { merge: true });
      }
      return res.json({
        ok: true,
        orderId,
        captureId: capture.id || '',
        licenseGranted: false,
        credits: creditAmount,
        creditedPoints: creditAmount,
        points: creditAmount,
        creditAmount,
        balance: granted.balance,
        amount: Number(expectedUsd),
        currency: 'USD',
        email: user.email || existing.email || ''
      });
    }

    const isPass = catalogEngine.isPassProductId(pid);
    const licenseRef = db.collection('licenses').doc(user.uid);
    const licenseSnap = await licenseRef.get();
    const licenseData = licenseSnap.exists ? licenseSnap.data() : null;
    let licensePayload;
    if (isPass) {
      const durationDays = passEntitlement.passDurationDays(pid, existing.durationDays);
      licensePayload = passEntitlement.buildPassLicensePayload({
        user: { uid: user.uid, email: user.email || existing.email || '', name: user.name || '' },
        passProductId: pid,
        durationDays,
        existingLicense: licenseData,
        method: 'paypal',
        memo: `PayPal 자동 지급 · order ${orderId}`,
        extra: {
          paypalOrderId: orderId,
          paypalCaptureId: capture.id || '',
          lastPurchaseProductId: pid,
          lastPurchaseEvent: 'PASS_PURCHASE'
        },
        FieldValue: admin.firestore.FieldValue,
        Timestamp: admin.firestore.Timestamp
      });
    } else {
      licensePayload = lifetimeLicensePayload({
        user: { email: user.email || existing.email || '', name: user.name || '' },
        plan: 'lifetime',
        method: 'paypal',
        memo: `PayPal 자동 지급 · order ${orderId}`,
        extra: {
          paypalOrderId: orderId,
          paypalCaptureId: capture.id || '',
          passProductId: admin.firestore.FieldValue.delete(),
          expiresAt: admin.firestore.FieldValue.delete(),
          startsAt: admin.firestore.FieldValue.delete(),
          expireReason: admin.firestore.FieldValue.delete()
        }
      });
    }

    const batch = db.batch();
    batch.set(orderDoc.ref, {
      status: 'completed',
      licenseIssued: true,
      paypalCaptureId: capture.id || '',
      payerEmail: data.payer?.email_address || '',
      payerName: [data.payer?.name?.surname, data.payer?.name?.given_name].filter(Boolean).join(' '),
      chargedUsd: Number(paidValue),
      chargedCurrency: String(paidCurrency || 'USD').toUpperCase(),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      rawStatus: data.status
    }, { merge: true });
    batch.set(licenseRef, licensePayload, { merge: true });
    if (quoteId) {
      batch.set(db.collection('purchaseQuotes').doc(quoteId), {
        status: 'used',
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        paypalOrderId: orderId,
        paypalCaptureId: capture.id || ''
      }, { merge: true });
    }
    await batch.commit();

    return res.json({ ok: true, orderId, captureId: capture.id || '', licenseGranted: true });
  } catch (err) {
    console.error('capturePayPalOrder', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'capturePayPalOrder failed' });
  }
});

// capturePayPalCreditOrder / capturePayPalPointOrder are Python-owned
// (credit PayPal). Do not alias them to license capturePayPalOrder.

/** Public cached FX for catalog/admin preview. Never accepts a client rate. */
exports.getPublicFxRate = functions.https.onRequest(async (req, res) => {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'GET only' });
  try {
    const fx = await fxRate.getUsdKrwRate(db);
    if (!fx.ok) {
      return res.status(503).json({
        ok: false,
        code: 'FX_UNAVAILABLE',
        message: fx.message || fxRate.FX_UNAVAILABLE_MESSAGE
      });
    }
    return res.json({
      ok: true,
      rate: fx.rate,
      source: fx.source,
      fetchedAt: fx.fetchedAt,
      cache: fx.cache
    });
  } catch (err) {
    console.error('getPublicFxRate', err);
    return res.status(503).json({
      ok: false,
      code: 'FX_UNAVAILABLE',
      message: fxRate.FX_UNAVAILABLE_MESSAGE
    });
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

    const { paymentId, productId, quoteId } = req.body || {};
    if (!paymentId || typeof paymentId !== 'string') {
      return res.status(400).json({ ok: false, message: 'paymentId가 없습니다.' });
    }
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(paymentId)) {
      return res.status(400).json({ ok: false, message: 'paymentId 형식이 올바르지 않습니다.' });
    }

    const requestedPid = catalogEngine.normalizeProductId(productId || 'LIFETIME');
    if (!catalogEngine.isLicenseProductId(requestedPid)) {
      return res.status(400).json({
        ok: false,
        code: 'USE_CREDIT_PURCHASE',
        message: 'Credit 상품은 creditPortOnePurchase를 사용하세요.'
      });
    }
    let product;
    try {
      product = await loadRegionCharge('KR', catalogEngine.firestoreDocId(requestedPid));
    } catch (prodErr) {
      return res.status(prodErr.status || 400).json({
        ok: false,
        code: prodErr.code || 'PRODUCT_UNAVAILABLE',
        message: prodErr.message || '상품을 구매할 수 없습니다.'
      });
    }
    const canonicalPid = catalogEngine.normalizeProductId(product.productCanonicalId || requestedPid);
    if (productId && catalogEngine.normalizeProductId(productId) !== canonicalPid
        && String(productId) !== String(product.productId || '')) {
      // Allow legacy PortOne channel productId (midiai-lifetime) for LIFETIME only.
      if (!(canonicalPid === 'LIFETIME' && String(productId) === String(product.productId || ''))) {
        return res.status(400).json({ ok: false, message: '상품 정보가 일치하지 않습니다.' });
      }
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
    let expectedAmount = Number(product.amount);
    const customForQuote = parsePortOneCustomData(payment.customData);
    const boundQuoteId = String(quoteId || customForQuote.quoteId || '');
    if (boundQuoteId) {
      const quoteSnap = await db.collection('purchaseQuotes').doc(boundQuoteId).get();
      if (quoteSnap.exists) {
        const quote = { id: quoteSnap.id, ...quoteSnap.data() };
        const valid = catalogEngine.quoteIsValid(quote, { uid: user.uid, productId: canonicalPid });
        if (valid.ok && Number(quote.finalPrice) > 0) {
          expectedAmount = Number(quote.finalPrice);
          product.amount = expectedAmount;
          product.pricingVersion = Number(quote.productVersion || product.pricingVersion);
        }
      }
    }
    if (!Number.isFinite(paidAmount) || paidAmount !== expectedAmount) {
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
    if (custom.productId) {
      const customPid = catalogEngine.normalizeProductId(custom.productId);
      const okCustom = customPid === canonicalPid
        || String(custom.productId) === String(product.productId || '')
        || (canonicalPid === 'LIFETIME' && String(custom.productId).toLowerCase().includes('lifetime'));
      if (!okCustom && catalogEngine.isLicenseProductId(customPid) && customPid !== canonicalPid) {
        return res.status(400).json({
          ok: false,
          message: '결제 확인 중 오류가 발생했습니다.',
          paymentId,
          code: 'PRODUCT_MISMATCH'
        });
      }
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
    // Lifetime holders also must not buy PASS (auto-refund).
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
    let passExtended = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      const licenseSnap = await tx.get(licenseRef);
      const licenseData = licenseSnap.exists ? (licenseSnap.data() || {}) : null;
      const grantRef = db.collection('entitlementGrants').doc(paymentId);
      const grantSnap = await tx.get(grantRef);

      // Re-check inside transaction to avoid race with concurrent verify calls.
      if (isActiveLifetimeLicense(licenseData)) {
        throw Object.assign(new Error('DUPLICATE_LICENSE_RACE'), {
          status: 409,
          code: 'DUPLICATE_LICENSE_RACE'
        });
      }

      if (grantSnap.exists) {
        const grant = grantSnap.data() || {};
        if (grant.uid && grant.uid !== user.uid) {
          throw Object.assign(new Error('이미 다른 계정에서 처리된 결제입니다.'), { status: 403 });
        }
        // Same payment already granted — do not extend again (idempotent).
        issued = false;
        return;
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

      const isPass = catalogEngine.isPassProductId(canonicalPid);
      let licensePayload;
      let durationDays = 0;
      if (isPass) {
        durationDays = passEntitlement.passDurationDays(canonicalPid, product.durationDays);
        const extending = !!(licenseData && passEntitlement.licenseTsMs(licenseData.expiresAt) > Date.now()
          && String(licenseData.plan || '').toLowerCase() !== 'lifetime');
        passExtended = extending;
        licensePayload = passEntitlement.buildPassLicensePayload({
          user,
          passProductId: canonicalPid,
          durationDays,
          existingLicense: licenseData,
          method: 'kakaopay',
          memo: `${extending ? 'PASS_EXTENDED' : 'PASS_PURCHASE'} · KakaoPay · payment ${paymentId}`,
          extra: {
            portonePaymentId: paymentId,
            portoneTransactionId: payment.transactionId || '',
            lastPurchaseProductId: canonicalPid,
            lastPurchaseEvent: extending ? 'PASS_EXTENDED' : 'PASS_PURCHASE'
          },
          FieldValue: admin.firestore.FieldValue,
          Timestamp: admin.firestore.Timestamp
        });
      } else {
        licensePayload = lifetimeLicensePayload({
          user,
          plan: product.plan || 'lifetime',
          method: 'kakaopay',
          memo: `KakaoPay 자동 지급 · payment ${paymentId}`,
          extra: {
            portonePaymentId: paymentId,
            portoneTransactionId: payment.transactionId || '',
            // Clear timed pass fields on Lifetime purchase
            passProductId: admin.firestore.FieldValue.delete(),
            expiresAt: admin.firestore.FieldValue.delete(),
            startsAt: admin.firestore.FieldValue.delete(),
            expireReason: admin.firestore.FieldValue.delete()
          }
        });
      }
      tx.set(orderRef, {
        paymentId,
        uid: user.uid,
        email: user.email || '',
        provider: 'portone',
        paymentMethod: 'kakaopay',
        environment,
        productId: canonicalPid,
        productDocId: product.productDocId || catalogEngine.firestoreDocId(canonicalPid),
        productName: product.productName || canonicalPid,
        region: product.region || 'KR',
        pricingVersion: product.pricingVersion || 0,
        orderName,
        amount: product.amount,
        currency: product.currency,
        plan: isPass ? 'period' : (product.plan || 'lifetime'),
        durationDays: isPass ? durationDays : 0,
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

      tx.set(licenseRef, licensePayload, { merge: true });
      tx.set(grantRef, {
        paymentId,
        uid: user.uid,
        productId: canonicalPid,
        kind: isPass ? 'pass' : 'lifetime',
        durationDays: isPass ? durationDays : 0,
        amount: product.amount,
        currency: product.currency,
        grantedAt: now,
        revokedAt: null,
        status: 'active',
        sourcePaymentId: paymentId,
        expiresAtAfterGrant: isPass ? licensePayload.expiresAt : null,
        previousExpiresAt: isPass && licenseData && licenseData.expiresAt
          ? licenseData.expiresAt
          : null,
        previousPlan: licenseData ? String(licenseData.plan || '') : ''
      }, { merge: true });
      issued = true;
    });

    console.log('TEST PAYMENT verified', {
      paymentId,
      uid: String(user.uid).slice(0, 6),
      environment,
      issued
    });

    await releasePurchaseLock(user.uid, paymentId, 'completed').catch(() => {});

    if (issued) {
      try {
        const extending = catalogEngine.isPassProductId(canonicalPid)
          && String(licensePayload?.lastPurchaseEvent || '').includes('EXTENDED');
        await userNotify.notifyPaymentComplete(db, admin.firestore.FieldValue, {
          uid: user.uid,
          paymentId,
          productId: canonicalPid,
          productName: product.productName || orderName,
          amount: product.amount,
          currency: product.currency,
          plan: catalogEngine.isPassProductId(canonicalPid) ? 'period' : (product.plan || 'lifetime'),
          extended: passExtended
        });
      } catch (notifErr) {
        console.warn('verifyPortOnePayment notify', notifErr && notifErr.message);
      }
    }

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
      plan: catalogEngine.isPassProductId(canonicalPid) ? 'period' : (product.plan || 'lifetime'),
      productId: canonicalPid
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
    let batchCount = 0;
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      // Never convert lifetime to trial.
      if (String(data.plan || '').toLowerCase() === 'lifetime') return;
      const patch = {
        plan: 'trial',
        licensed: true,
        status: 'active',
        startsAt: admin.firestore.FieldValue.delete(),
        expiresAt: admin.firestore.FieldValue.delete(),
        passProductId: admin.firestore.FieldValue.delete(),
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expireReason: 'auto_period_to_trial'
      };
      batch.set(docSnap.ref, patch, { merge: true });
      batchCount += 1;
    });
    if (batchCount) await batch.commit();
    expired += batchCount;
    // Lifetime rows with expiresAt would otherwise loop forever.
    if (!batchCount || snap.size < 400) break;
  }
  console.log('expireTimedLicenses done', { convertedToTrial: expired });
  return null;
});

/**
 * Dispatch due admin scheduled bulk emails.
 * Claim is transactional; recipient sends reuse sendAdminBulkEmail doneUids.
 * Interval is 1 minute — UI does not promise second-level accuracy.
 */
exports.processAdminScheduledEmails = onSchedule({
  schedule: 'every 1 minutes',
  timeZone: 'Asia/Seoul',
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '256MiB',
  secrets: [gmailUser, gmailAppPassword]
}, async () => {
  const bulk = adminBulkEmail.createHandlers({
    db,
    admin,
    cors,
    requireAdmin,
    sendMail: createGmailSender()
  });
  const scheduled = adminScheduledEmail.createHandlers({
    db,
    admin,
    cors,
    requireAdmin,
    executeBulkEmail: bulk.executeAdminBulkEmail,
    ensureMailReady: bulk.ensureMailReady,
    Timestamp: admin.firestore.Timestamp
  });
  const out = await scheduled.processDueScheduledEmails();
  console.log('processAdminScheduledEmails', out);
  return null;
});

/**
 * Resume queued/expired-lease admin bulk credit grants.
 * onCreate starts work immediately; this tick recovers timeouts.
 */
exports.processAdminBulkCredits = onSchedule({
  schedule: 'every 1 minutes',
  timeZone: 'Asia/Seoul',
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '256MiB'
}, async () => {
  const out = await adminCreditHandlers.processDueBulkCreditGrants();
  console.log('processAdminBulkCredits', out);
  return null;
});

const {
  notifyInquiryCreated,
  notifyPaymentCompleted,
  isLicenseGrantedOrder
} = require('./discordNotify');
const SUPPORT_AI_WAITING_MODE = 'waiting_human';
const { broadcastPublishedContent } = require('./broadcastNotify');

const functionsV1 = require('firebase-functions/v1');
const { createLicenseIfAbsent } = require('./licenseProvision');

/**
 * Ensure every users/{uid} has licenses/{uid} (create-if-absent only).
 * Never overwrites existing license docs — lifetime/trial/period stay intact.
 */
exports.ensureTrialLicenseOnUserWrite = functionsV1
  .runWith({ timeoutSeconds: 30, memory: '256MB' })
  .firestore.document('users/{uid}')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    if (!change.after.exists) return null;
    try {
      await createLicenseIfAbsent(
        db,
        uid,
        change.after.data() || {},
        admin.firestore.FieldValue
      );
    } catch (err) {
      console.error('ensureTrialLicenseOnUserWrite', {
        uid,
        message: err && err.message ? err.message : String(err)
      });
    }
    return null;
  });

/**
 * Admin credit notify/audit — durable, off the grant HTTP path.
 * Ignores conversion/purchase ledgers and non-site origins.
 */
exports.onCreditLedgerCreated = functionsV1
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .firestore.document('creditLedger/{ledgerId}')
  .onCreate(async (snap, context) => {
    const ledgerId = context.params.ledgerId;
    try {
      const out = await creditLedgerSideEffects.processCreditLedgerCreated({
        db,
        admin,
        userNotify,
        ledgerId,
        data: snap.data() || {}
      });
      if (out && !out.skipped) {
        console.info('onCreditLedgerCreated', { ledgerId, notified: out.notified, audited: out.audited });
      }
    } catch (err) {
      console.error('onCreditLedgerCreated', {
        ledgerId,
        message: err && err.message ? err.message : String(err)
      });
      throw err;
    }
    return null;
  });

/** Credit V2 admin grant/deduct notify+audit — off Python/Node HTTP critical path. */
exports.onCreditLedgerV2Created = functionsV1
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .firestore.document('creditLedgerV2/{ledgerId}')
  .onCreate(async (snap, context) => {
    const ledgerId = context.params.ledgerId;
    try {
      const out = await creditLedgerSideEffects.processCreditLedgerCreated({
        db,
        admin,
        userNotify,
        ledgerId,
        data: snap.data() || {}
      });
      if (out && !out.skipped) {
        console.info('onCreditLedgerV2Created', { ledgerId, notified: out.notified, audited: out.audited });
      }
    } catch (err) {
      console.error('onCreditLedgerV2Created', {
        ledgerId,
        message: err && err.message ? err.message : String(err)
      });
      throw err;
    }
    return null;
  });

/**
 * Start queued bulk credit grants as soon as the operation doc is created.
 */
exports.onAdminBulkCreditQueued = functionsV1
  .runWith({ timeoutSeconds: 540, memory: '256MB' })
  .firestore.document('adminBulkOperations/{opId}')
  .onCreate(async (snap, context) => {
    const d = snap.data() || {};
    if (d.type !== 'CREDIT_GRANT' && d.type !== 'CREDIT_DEDUCT') return null;
    try {
      const out = await adminCreditHandlers.processBulkCreditOperation(context.params.opId);
      console.info('onAdminBulkCreditQueued', { opId: context.params.opId, status: out && out.status });
    } catch (err) {
      console.error('onAdminBulkCreditQueued', {
        opId: context.params.opId,
        message: err && err.message ? err.message : String(err)
      });
      throw err;
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
      // Most AI-chat tickets are created in MODE.AI.
      // Only notify Discord when the ticket is already in counselor-request mode.
      const data = snap.data() || {};
      if (data.conversationMode !== SUPPORT_AI_WAITING_MODE) return null;
      await notifyInquiryCreated(ticketId, data, snap.ref);
    } catch (err) {
      console.error('notifyDiscordOnInquiryCreate', {
        ticketId,
        message: err && err.message ? err.message : String(err)
      });
    }
    return null;
  });

/**
 * AI-chat에서 "상담사 연결 요청" 시점 알림.
 * supportTickets/{ticketId}의 conversationMode가 waiting_human로 바뀔 때만 전송.
 */
exports.notifyDiscordOnHumanRequest = functionsV1
  .runWith({ secrets: [discordInquiryWebhook], timeoutSeconds: 30, memory: '256MB' })
  .firestore.document('supportTickets/{ticketId}')
  .onUpdate(async (change, context) => {
    const ticketId = context.params.ticketId;
    try {
      if (!change.after.exists) return null;
      const before = change.before.data() || {};
      const after = change.after.data() || {};

      // Only trigger on conversationMode transition to counselor-request mode.
      if (before.conversationMode === after.conversationMode) return null;
      if (after.conversationMode !== SUPPORT_AI_WAITING_MODE) return null;

      // Idempotency: notifyInquiryCreated() uses discordNotified flag on the doc.
      await notifyInquiryCreated(ticketId, after, change.after.ref);
    } catch (err) {
      console.error('notifyDiscordOnHumanRequest', {
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

const { recordUserAccessInfo } = require('./accessInfo');

/**
 * Record Geo-IP access metadata after login / session start.
 * Client must NOT send IP. Country is derived on the server.
 * Response never includes the raw IP.
 */
exports.recordAccessInfo = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const user = await requireUser(req);
    const result = await recordUserAccessInfo(db, admin, user, req);
    return res.json({ ok: true, updated: !!result.updated, throttled: !!result.throttled });
  } catch (err) {
    const status = err.status || 500;
    console.error('recordAccessInfo', err && err.message ? err.message : err);
    return res.status(status).json({
      ok: false,
      message: err.message || 'recordAccessInfo failed'
    });
  }
});

/**
 * Support chat AI reply + handoff summary.
 * OPENAI_API_KEY from Secret Manager (bound below; Gen2 HTTPS — must stay v2 to match Production).
 * Optional GEMINI_API_KEY / GOOGLE_AI_API_KEY via env still preferred if present.
 * Without keys, keyword RAG template answers still work.
 */
const { onRequest: onRequestV2 } = require('firebase-functions/v2/https');
const { createSupportAiHandlers } = require('./supportAi');
const supportAiHandlers = createSupportAiHandlers({ db, cors, requireUser });
exports.supportAiReply = onRequestV2(
  {
    secrets: [openaiApiKey],
    timeoutSeconds: 60,
    memory: '256MiB'
  },
  supportAiHandlers.supportAiReply
);
exports.supportAiHandoffSummary = onRequestV2(
  {
    secrets: [openaiApiKey],
    timeoutSeconds: 60,
    memory: '256MiB'
  },
  supportAiHandlers.supportAiHandoffSummary
);

/**
 * Kakao Login OAuth redirect callback for future admin "나와의 채팅" notifications.
 * Does not replace Discord webhooks. Does not change payment/inquiry production notify paths.
 * Secrets: KAKAO_REST_API_KEY (required), KAKAO_CLIENT_SECRET (optional if enabled in Kakao console).
 * Refresh token stored in Firestore systemPrivate/kakaoAdminOAuth (client read/write denied).
 */
const { createKakaoOAuthCallbackHandler } = require('./kakaoOAuth');
exports.kakaoOAuthCallback = onRequestV2(
  {
    region: 'us-central1',
    secrets: [kakaoRestApiKey, kakaoClientSecret],
    timeoutSeconds: 30,
    memory: '256MiB'
  },
  createKakaoOAuthCallbackHandler({
    db,
    FieldValue: admin.firestore.FieldValue
  })
);

/**
 * PortOne webhook. Signature is checked when PORTONE_WEBHOOK_SECRET is set.
 * Payment status is always re-fetched from PortOne — the body is never trusted.
 */
exports.portoneWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).send('POST only');
  try {
    const raw = req.rawBody || Buffer.from(
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
    );
    const secret = cfg('PORTONE_WEBHOOK_SECRET');
    const verified = portoneRefundSync.verifyPortOneWebhookSignature(raw, req.headers, secret);
    if (!verified.ok) {
      console.warn('portoneWebhook signature rejected', verified.reason);
      return res.status(401).send('invalid signature');
    }
    if (verified.skipped) {
      console.warn('portoneWebhook: PORTONE_WEBHOOK_SECRET unset; relying on PortOne API re-fetch');
    }
    const payload = (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body))
      ? req.body
      : JSON.parse(String(raw || '{}') || '{}');
    const paymentId = portoneRefundSync.extractPaymentIdFromWebhook(payload);
    if (!paymentId) {
      console.warn('portoneWebhook missing paymentId', portoneRefundSync.extractWebhookType(payload));
      return res.status(200).json({ ok: true, ignored: true });
    }
    const webhookId = String(
      req.headers['webhook-id'] || req.headers['Webhook-Id'] || verified.webhookId || ''
    ).trim();
    await portoneRefundSync.recordWebhookDelivery(
      db,
      admin.firestore.FieldValue,
      webhookId || ('body_' + paymentId),
      payload
    );
    const result = await applyPortOneRefundSync(paymentId, 'webhook', '');
    return res.status(200).json({ ok: true, paymentId, result });
  } catch (err) {
    console.error('portoneWebhook', err && err.message ? err.message : err);
    const status = err.status === 404 ? 200 : (err.status || 500);
    if (status === 200) return res.status(200).json({ ok: true, skipped: true, message: err.message || 'not found' });
    return res.status(status).send(err.message || 'webhook error');
  }
});

/**
 * Admin: re-fetch PortOne payment and sync order / credit / license revoke.
 * Client cannot send secret, amount, uid, or status overrides.
 */
exports.syncPortOnePaymentStatus = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const adminUser = await requireAdmin(req);
    const paymentId = String((req.body || {}).paymentId || (req.body || {}).orderId || '').trim();
    if (!paymentId) {
      return res.status(400).json({ ok: false, message: 'paymentId가 없습니다.' });
    }
    const result = await applyPortOneRefundSync(paymentId, 'admin', adminUser.uid);
    return res.json(result);
  } catch (err) {
    console.error('syncPortOnePaymentStatus', err && err.message ? err.message : err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'PortOne 상태 동기화에 실패했습니다.'
    });
  }
});

/**
 * Admin full-cancel PortOne payment from MidiAI console.
 * Body: { paymentId, reason? } only — amount/uid/product from server + PortOne.
 * Then runs the same applyPortOneRefundSync pipeline as webhook/manual sync.
 */
exports.adminCancelPortOnePayment = functions.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
  try {
    const adminUser = await requireAdmin(req);
    const paymentId = String((req.body || {}).paymentId || '').trim();
    const reason = String((req.body || {}).reason || '고객 요청').trim().slice(0, 200) || '고객 요청';
    if (!paymentId) {
      return res.status(400).json({ ok: false, message: 'paymentId가 없습니다.' });
    }

    // Ignore client amount/uid/product spoof fields entirely.
    const orderRefs = await portoneRefundSync.findOrderRefs(db, paymentId);
    let orderSnap = null;
    for (const ref of orderRefs) {
      const s = await ref.get();
      if (s.exists) { orderSnap = s; break; }
    }
    if (!orderSnap) {
      return res.status(404).json({ ok: false, message: '주문을 찾을 수 없습니다.', code: 'ORDER_NOT_FOUND' });
    }
    const order = orderSnap.data() || {};
    const orderUid = String(order.uid || order.userId || '');
    const productId = String(order.productId || '');
    const amount = Number(order.amount);
    const currency = String(order.currency || 'KRW');
    const prevStatus = String(order.status || '').toLowerCase();

    if (order.paypalOrderId || order.paypalCaptureId) {
      return res.status(400).json({ ok: false, message: 'PayPal 결제는 이 메뉴에서 취소할 수 없습니다.', code: 'NOT_PORTONE' });
    }

    let providerPayment;
    try {
      providerPayment = await fetchPortOnePayment(paymentId);
    } catch (err) {
      return res.status(err.status || 502).json({
        ok: false,
        code: 'PROVIDER_LOOKUP_FAILED',
        message: err.message || 'PortOne 결제 조회에 실패했습니다. 내부 상태는 변경하지 않았습니다.'
      });
    }

    const amountsBefore = portoneRefundSync.parsePortOneAmounts(providerPayment);
    const providerStatus = String(providerPayment.status || '').toUpperCase().replace(/^PAYMENT_STATUS_/, '');
    const isFullCancelAlready = amountsBefore.paid <= 0 && amountsBefore.cancelled > 0
      || providerStatus === 'CANCELLED' || providerStatus === 'CANCELED';
    const isPartial = amountsBefore.paid > 0 && amountsBefore.cancelled > 0
      || providerStatus === 'PARTIAL_CANCELLED' || providerStatus === 'PARTIAL_CANCELED';
    const isPaid = providerStatus === 'PAID'
      || (amountsBefore.paid > 0 && amountsBefore.cancelled <= 0 && !isFullCancelAlready);

    let cancelCalled = false;
    let cancelResult = null;
    let path = 'unknown';

    if (isPartial && !isFullCancelAlready) {
      path = 'partial_existing';
      const sync = await applyPortOneRefundSync(paymentId, 'admin_cancel_partial', adminUser.uid);
      return res.json({
        ok: true,
        path,
        cancelCalled: false,
        message: 'PortOne에서 부분취소된 결제입니다. 전액취소는 실행하지 않았습니다.',
        status: sync.status,
        providerStatus: sync.providerStatus,
        refundedAmount: sync.refundedAmount,
        cancelledAmount: sync.cancelledAmount,
        entitlement: sync.entitlement,
        sync
      });
    }

    if (isFullCancelAlready) {
      path = 'already_cancelled';
    } else if (isPaid) {
      path = 'cancel_then_sync';
      const cancelAmount = Number.isFinite(amount) && amount > 0
        ? amount
        : (amountsBefore.paid > 0 ? amountsBefore.paid : amountsBefore.total);
      try {
        cancelResult = await cancelPortOnePayment(paymentId, reason, cancelAmount);
        cancelCalled = true;
      } catch (err) {
        // Race: webhook/console already cancelled — treat as already cancelled if re-fetch says so.
        let again;
        try { again = await fetchPortOnePayment(paymentId); } catch (_) { again = null; }
        const am = again ? portoneRefundSync.parsePortOneAmounts(again) : null;
        const st = String((again && again.status) || '').toUpperCase();
        if (am && (am.paid <= 0 && am.cancelled > 0 || st === 'CANCELLED' || st === 'CANCELED')) {
          path = 'already_cancelled_race';
          providerPayment = again;
        } else {
          return res.status(400).json({
            ok: false,
            code: 'PROVIDER_CANCEL_FAILED',
            message: err.message || 'PortOne 결제 취소에 실패했습니다.',
            cancelCalled: true
          });
        }
      }
      if (cancelCalled) {
        try {
          providerPayment = await fetchPortOnePayment(paymentId);
        } catch (err) {
          return res.status(502).json({
            ok: false,
            code: 'PROVIDER_CANCELLED_VERIFY_FAILED',
            message: 'PortOne 결제는 취소 요청되었으나 재조회에 실패했습니다. [PortOne 상태 동기화]로 내부 상태를 맞춰 주세요.',
            cancelCalled: true,
            portoneCancelOk: true
          });
        }
        const verify = portoneRefundSync.parsePortOneAmounts(providerPayment);
        const vst = String(providerPayment.status || '').toUpperCase();
        const verifiedFull = (verify.paid <= 0 && verify.cancelled > 0)
          || vst === 'CANCELLED' || vst === 'CANCELED';
        if (!verifiedFull) {
          return res.status(409).json({
            ok: false,
            code: 'PROVIDER_CANCEL_NOT_CONFIRMED',
            message: 'PortOne 취소 후 전액취소 상태를 확인하지 못했습니다. [PortOne 상태 동기화]를 실행해 주세요.',
            cancelCalled: true,
            providerStatus: vst,
            paidAmount: verify.paid,
            cancelledAmount: verify.cancelled
          });
        }
      }
    } else {
      return res.status(409).json({
        ok: false,
        code: 'PROVIDER_NOT_CANCELLABLE',
        message: `PortOne 상태가 취소 가능한 PAID가 아닙니다 (${providerStatus || 'unknown'}).`,
        providerStatus
      });
    }

    let sync;
    try {
      sync = await applyPortOneRefundSync(paymentId, 'admin_cancel', adminUser.uid);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_SYNC_FAILED',
        message: cancelCalled
          ? 'PortOne 결제는 취소되었으나 내부 상태 동기화에 실패했습니다. [PortOne 상태 동기화]를 실행해 주세요.'
          : (err.message || '내부 동기화에 실패했습니다.'),
        cancelCalled,
        portoneCancelOk: !!cancelCalled
      });
    }

    const entitlement = sync.entitlement || {};
    const licenseRevoked = entitlement.kind === 'license' && (
      ['revoke_pass', 'revoke_lifetime', 'revoke_grant_only'].includes(entitlement.action)
      || (entitlement.action === 'none' && String(entitlement.reason || '').startsWith('already_revoked'))
    );

    // Audit (Admin SDK — no secrets)
    try {
      await db.collection('adminAuditLogs').add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        targetUserId: orderUid || '',
        category: 'payment',
        action: 'portone_payment_cancelled',
        actorId: adminUser.uid,
        actorEmail: adminUser.email || '',
        result: 'ok',
        summary: `${productId || 'payment'} 전액취소 · ${Number(sync.refundedAmount || amount || 0).toLocaleString('ko-KR')} ${currency}`,
        before: { status: prevStatus, providerStatus },
        after: {
          status: sync.status,
          providerStatus: sync.providerStatus,
          refundedAmount: sync.refundedAmount,
          path,
          cancelCalled,
          licenseRevoked,
          entitlementAction: entitlement.action || '',
          reason
        },
        paymentId,
        productId
      });
    } catch (auditErr) {
      console.warn('adminCancelPortOnePayment audit', auditErr && auditErr.message);
    }

    // User notification (idempotent per payment — shared with webhook/reconcile)
    if (orderUid && (licenseRevoked || sync.status === 'refunded' || sync.status === 'cancelled' || sync.status === 'partially_refunded' || sync.status === 'refund_review_required')) {
      try {
        await userNotify.notifyPaymentRefund(db, admin.firestore.FieldValue, {
          uid: orderUid,
          paymentId,
          productId,
          productName: order.productName || order.orderName || productId,
          status: sync.status,
          refundedAmount: sync.refundedAmount != null ? sync.refundedAmount : amount,
          currency,
          licenseRevoked,
          partial: sync.status === 'partially_refunded'
        });
      } catch (notifErr) {
        console.warn('adminCancelPortOnePayment notify', notifErr && notifErr.message);
      }
    }

    const msg = path === 'already_cancelled' || path === 'already_cancelled_race'
      ? (licenseRevoked
        ? '이미 PortOne에서 취소된 결제입니다. 내부 상태와 라이선스를 보정했습니다.'
        : '이미 PortOne에서 취소된 결제입니다. 내부 결제 상태를 보정했습니다.')
      : (licenseRevoked
        ? '결제가 전액 취소되었습니다. 해당 결제로 지급된 라이선스도 회수되었습니다.'
        : '결제가 전액 취소되었습니다.');

    return res.json({
      ok: true,
      path,
      cancelCalled,
      message: msg,
      paymentId,
      status: sync.status,
      providerStatus: sync.providerStatus,
      paidAmount: sync.paidAmount,
      refundedAmount: sync.refundedAmount,
      cancelledAmount: sync.cancelledAmount,
      cancelledAt: sync.cancelledAt,
      entitlement: sync.entitlement,
      licenseRevoked,
      productId,
      amount: Number.isFinite(amount) ? amount : null,
      currency,
      reason
    });
  } catch (err) {
    console.error('adminCancelPortOnePayment', err && err.message ? err.message : err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || '결제 취소에 실패했습니다.'
    });
  }
});

/**
 * Webhook-miss safety net: re-check recent PortOne paid / review orders.
 * Uses the same applyPortOneRefundSync pipeline as webhook + manual sync.
 */
exports.reconcilePortOnePayments = onSchedule({
  schedule: 'every 12 hours',
  timeZone: 'Asia/Seoul'
}, async () => {
  const nowMs = Date.now();
  const since = admin.firestore.Timestamp.fromDate(
    new Date(nowMs - 30 * 24 * 60 * 60 * 1000)
  );
  const statuses = [
    'completed', 'paid', 'verified', 'license_issued',
    'partially_refunded', 'refund_review_required',
    'refunded', 'cancelled'
  ];
  const seen = new Set();
  let checked = 0;
  let synced = 0;
  let errors = 0;
  for (const status of statuses) {
    let snap;
    try {
      snap = await db.collection('orders')
        .where('status', '==', status)
        .where('createdAt', '>=', since)
        .limit(40)
        .get();
    } catch (err) {
      // Fallback without createdAt composite index.
      try {
        snap = await db.collection('orders').where('status', '==', status).limit(40).get();
      } catch (err2) {
        console.warn('reconcilePortOnePayments query', status, err2 && err2.message);
        continue;
      }
    }
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const paymentId = String(data.paymentId || doc.id || '').trim();
      if (!paymentId || seen.has(paymentId)) continue;
      if (!portoneRefundSync.shouldReconcileOrder({ ...data, paymentId }, nowMs)) continue;
      // Skip clearly non-PortOne (PayPal) rows.
      if (data.paypalOrderId || data.paypalCaptureId) continue;
      seen.add(paymentId);
      checked += 1;
      try {
        await applyPortOneRefundSync(paymentId, 'reconcile', '');
        synced += 1;
      } catch (err) {
        errors += 1;
        console.warn('reconcilePortOnePayments sync', paymentId.slice(0, 8), err && err.message);
      }
    }
  }
  console.log('reconcilePortOnePayments done', { checked, synced, errors, unique: seen.size });
  return null;
});
