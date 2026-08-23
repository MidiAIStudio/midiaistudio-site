'use strict';

const LIFETIME_DOC_ID = 'lifetime';
const QUOTE_TTL_MINUTES = 20;
const PASS_DURATION_DAYS = {
  PASS_7D: 7,
  PASS_30D: 30,
  PASS_90D: 90
};

function emptyDiscount() {
  return { enabled: false, type: 'percent', value: 0, startsAt: '', endsAt: '' };
}

function normalizeProductId(productId) {
  const key = String(productId || '').trim();
  const aliases = {
    POINT_5: 'CREDIT_5',
    POINT_30: 'CREDIT_30',
    POINT_100: 'CREDIT_100',
    lifetime: 'LIFETIME',
    LIFETIME: 'LIFETIME'
  };
  if (aliases[key]) return aliases[key];
  const upper = key.toUpperCase();
  if (aliases[upper]) return aliases[upper];
  if (key === LIFETIME_DOC_ID || upper === 'LIFETIME') return 'LIFETIME';
  return upper;
}

function isPassProductId(productId) {
  const pid = normalizeProductId(productId);
  if (Object.prototype.hasOwnProperty.call(PASS_DURATION_DAYS, pid)) return true;
  if (/^PASS_[A-Z0-9_]+$/.test(pid)) return true;
  if (/^TEST_[A-Z0-9_]+$/.test(pid)) return true;
  return false;
}

function isCanonicalPassProductId(productId) {
  return Object.prototype.hasOwnProperty.call(PASS_DURATION_DAYS, normalizeProductId(productId));
}

function isLicenseProductId(productId) {
  const pid = normalizeProductId(productId);
  return pid === 'LIFETIME' || isPassProductId(pid);
}

function firestoreDocId(productId) {
  const pid = normalizeProductId(productId);
  if (pid === 'LIFETIME') return LIFETIME_DOC_ID;
  return pid;
}

function parseTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === 'function') {
    try { return value.toDate(); } catch (_) { /* ignore */ }
  }
  if (typeof value === 'object' && (value.seconds != null || value._seconds != null)) {
    return new Date(Number(value.seconds || value._seconds) * 1000);
  }
  const dt = new Date(String(value));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isWindowActive(enabled, startsAt, endsAt, now = new Date()) {
  if (!enabled) return false;
  const start = parseTime(startsAt);
  const end = parseTime(endsAt);
  if (start && now < start) return false;
  if (end && now >= end) return false;
  return true;
}

function applyDiscount(basePrice, discountType, value) {
  const base = Math.round(Number(basePrice) || 0);
  const kind = String(discountType || 'percent').toLowerCase();
  const amount = Number(value);
  if (!base || !Number.isFinite(amount) || amount <= 0) return base;
  let sale = base;
  if (kind === 'percent' || kind === 'rate' || kind === 'pct') {
    if (amount >= 100) return base;
    sale = Math.round(base * (100 - amount) / 100);
  } else if (kind === 'amount' || kind === 'fixed' || kind === 'flat') {
    if (amount >= base) return base;
    sale = Math.round(base - amount);
  } else return base;
  return Math.max(1, Math.min(sale, base - 1));
}

function displayDiscountPercent(basePrice, salePrice) {
  const base = Number(basePrice) || 0;
  const sale = Number(salePrice) || 0;
  if (!base || !sale || sale >= base) return 0;
  return Math.round((1 - sale / base) * 100);
}

function productTargets(promo, productId) {
  const pid = normalizeProductId(productId);
  return (promo?.productIds || []).some((item) => normalizeProductId(item) === pid);
}

function pickEffectiveDiscount(product, promotions = [], now = new Date(), currency = 'KRW') {
  const pid = normalizeProductId(product?.productId || product?.id);
  const candidates = [];
  let raw = product?.productDiscount || {};
  if (String(currency).toUpperCase() === 'USD') raw = product?.productDiscountUsd || {};
  if (raw && raw.enabled === true && isWindowActive(true, raw.startsAt, raw.endsAt, now)) {
    candidates.push({
      source: 'product',
      type: raw.type || 'percent',
      value: Number(raw.value) || 0,
      endsAt: raw.endsAt || '',
      promotionId: ''
    });
  }
  for (const promo of promotions || []) {
    if (!productTargets(promo, pid)) continue;
    if (!isWindowActive(promo.enabled !== false, promo.startsAt, promo.endsAt, now)) continue;
    candidates.push({
      source: 'promo',
      type: promo.type || promo.discountType || 'percent',
      value: Number(promo.value != null ? promo.value : promo.discountValue) || 0,
      endsAt: promo.endsAt || '',
      promotionId: promo.promotionId || promo.id || ''
    });
  }
  if (!candidates.length) return { chosen: null };
  candidates.sort((a, b) => Number(b.value) - Number(a.value));
  return { chosen: candidates[0] };
}

function computeCharge(product, promotions = [], now = new Date(), currencyWanted = 'KRW') {
  if (String(currencyWanted).toUpperCase() === 'USD') {
    const base = Number(product?.listPriceUsd);
    if (!Number.isFinite(base) || base <= 0) {
      return { ok: false, code: 'USD_UNSET' };
    }
    const { chosen } = pickEffectiveDiscount(product, promotions, now, 'USD');
    const sale = chosen ? applyDiscount(base, chosen.type, chosen.value) : base;
    return {
      ok: true,
      basePrice: base,
      effectivePrice: sale,
      currency: 'USD',
      discount: chosen,
      discountPercent: chosen ? displayDiscountPercent(Math.round(base * 100), Math.round(sale * 100)) : 0,
      productVersion: Number(product.productVersion || product.pricingVersion || 1)
    };
  }
  const base = Math.round(Number(product?.listPriceKrw || 0));
  const { chosen } = pickEffectiveDiscount(product, promotions, now, 'KRW');
  const sale = chosen ? applyDiscount(base, chosen.type, chosen.value) : base;
  return {
    ok: true,
    basePrice: base,
    effectivePrice: sale,
    currency: 'KRW',
    discount: chosen,
    discountPercent: chosen ? displayDiscountPercent(base, sale) : 0,
    discountEndsAt: chosen?.endsAt || '',
    productVersion: Number(product?.productVersion || product?.pricingVersion || 1),
    creditAmount: Number(product?.creditAmount || 0)
  };
}

const SEED_PRODUCTS = [
  {
    productId: 'PASS_7D',
    type: 'full_pass',
    nameKo: '7일 Full',
    nameEn: '7-Day Full Pass',
    creditAmount: 0,
    entitlement: 'full_pass',
    durationDays: 7,
    listPriceKrw: 7900,
    status: 'active',
    sortOrder: 5,
    badge: '',
    orderNameKo: 'MidiAI Studio 7일 Full 이용권',
    orderNameEn: 'MidiAI Studio 7-Day Full Pass',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'PASS_30D',
    type: 'full_pass',
    nameKo: '30일 Full',
    nameEn: '30-Day Full Pass',
    creditAmount: 0,
    entitlement: 'full_pass',
    durationDays: 30,
    listPriceKrw: 19900,
    status: 'active',
    sortOrder: 6,
    badge: 'recommended',
    orderNameKo: 'MidiAI Studio 30일 Full 이용권',
    orderNameEn: 'MidiAI Studio 30-Day Full Pass',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'PASS_90D',
    type: 'full_pass',
    nameKo: '90일 Full',
    nameEn: '90-Day Full Pass',
    creditAmount: 0,
    entitlement: 'full_pass',
    durationDays: 90,
    listPriceKrw: 49900,
    status: 'active',
    sortOrder: 7,
    badge: '',
    packSavePercent: null,
    savingsReferenceProductId: 'PASS_30D',
    orderNameKo: 'MidiAI Studio 90일 Full 이용권',
    orderNameEn: 'MidiAI Studio 90-Day Full Pass',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'LIFETIME',
    docId: LIFETIME_DOC_ID,
    type: 'lifetime',
    nameKo: 'Lifetime Full',
    nameEn: 'Lifetime Full',
    creditAmount: 0,
    entitlement: 'lifetime',
    listPriceKrw: 129000,
    listPriceUsd: 89,
    status: 'active',
    sortOrder: 8,
    badge: '',
    orderNameKo: 'MidiAI Studio Lifetime Full',
    orderNameEn: 'MidiAI Studio Lifetime Full',
    productDiscount: emptyDiscount()
  }
];

function seedById(productId) {
  const pid = normalizeProductId(productId);
  return SEED_PRODUCTS.find((p) => p.productId === pid) || null;
}

function hydrateProduct(docId, data) {
  const raw = data || {};
  const pid = normalizeProductId(raw.productId || docId);
  const seed = seedById(pid) || {};
  const regions = raw.regions || {};
  const kr = regions.KR || {};
  const glob = regions.Global || {};
  const type = raw.type || seed.type || (pid === 'LIFETIME' ? 'lifetime' : (isPassProductId(pid) ? 'full_pass' : 'credit_pack'));
  const listPriceKrwRaw = (raw.listPriceKrw != null && raw.listPriceKrw !== '')
    ? Number(raw.listPriceKrw)
    : (kr.listPrice != null && kr.listPrice !== ''
      ? Number(kr.listPrice)
      : Number(seed.listPriceKrw != null ? seed.listPriceKrw : 0));
  // Firestore is SoT for prices — do not force-correct admin-edited amounts.
  const listPriceKrw = Number.isFinite(listPriceKrwRaw) ? listPriceKrwRaw : 0;
  const durationDays = Number(
    raw.durationDays != null ? raw.durationDays : (seed.durationDays != null ? seed.durationDays : (PASS_DURATION_DAYS[pid] || 0))
  );
  return {
    ...seed,
    ...raw,
    productId: pid,
    docId: pid === 'LIFETIME' ? LIFETIME_DOC_ID : docId,
    type,
    creditAmount: Number(raw.creditAmount != null ? raw.creditAmount : (seed.creditAmount || 0)),
    entitlement: raw.entitlement || seed.entitlement || (type === 'lifetime' ? 'lifetime' : (type === 'full_pass' ? 'full_pass' : 'credits')),
    durationDays: type === 'full_pass' ? durationDays : (raw.durationDays || seed.durationDays || null),
    listPriceKrw,
    listPriceUsd: raw.listPriceUsd != null ? raw.listPriceUsd : (glob.listPrice != null ? glob.listPrice : (seed.listPriceUsd != null ? seed.listPriceUsd : (pid === 'LIFETIME' ? 89 : null))),
    status: raw.status || seed.status || 'active',
    productVersion: Number(raw.productVersion || raw.pricingVersion || seed.productVersion || 1),
    orderNameKo: raw.orderNameKo || seed.orderNameKo || '',
    orderNameEn: raw.orderNameEn || seed.orderNameEn || '',
    productDiscount: { ...emptyDiscount(), ...(seed.productDiscount || {}), ...(raw.productDiscount || {}) },
    regions
  };
}

function quoteExpiry(now = new Date()) {
  return new Date(now.getTime() + QUOTE_TTL_MINUTES * 60 * 1000);
}

function quoteIsValid(quote, { uid, productId, now = new Date() }) {
  if (!quote) return { ok: false, code: 'QUOTE_MISSING' };
  if (String(quote.uid || '') !== String(uid || '')) return { ok: false, code: 'QUOTE_UID_MISMATCH' };
  if (normalizeProductId(quote.productId) !== normalizeProductId(productId)) {
    return { ok: false, code: 'QUOTE_PRODUCT_MISMATCH' };
  }
  if (String(quote.status || 'open') !== 'open') return { ok: false, code: 'QUOTE_INVALID' };
  const expires = parseTime(quote.expiresAt);
  if (expires && now > expires) {
    return { ok: false, code: 'QUOTE_EXPIRED' };
  }
  return { ok: true };
}

module.exports = {
  LIFETIME_DOC_ID,
  QUOTE_TTL_MINUTES,
  PASS_DURATION_DAYS,
  SEED_PRODUCTS,
  normalizeProductId,
  isPassProductId,
  isCanonicalPassProductId,
  isLicenseProductId,
  firestoreDocId,
  applyDiscount,
  computeCharge,
  hydrateProduct,
  seedById,
  isWindowActive,
  quoteExpiry,
  quoteIsValid,
  displayDiscountPercent
};
