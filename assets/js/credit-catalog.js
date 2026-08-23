/**
 * Display catalog for one-time credit packs.
 * Charge amounts are verified by Cloud Functions; this file is UI-only.
 * Official list prices are KRW. Do not derive USD from KRW.
 */

export const ACTIVE_CREDIT_IDS = ['CREDIT_5', 'CREDIT_30', 'CREDIT_100'];
export const ACTIVE_POINT_IDS = ACTIVE_CREDIT_IDS;

const PRODUCT_ALIASES = {
  POINT_5: 'CREDIT_5',
  POINT_30: 'CREDIT_30',
  POINT_100: 'CREDIT_100'
};

export const FALLBACK_CREDIT_PRODUCTS = [
  {
    productId: 'CREDIT_5',
    credits: 5,
    points: 5,
    krw: 6500,
    perUseKrw: 1300,
    perUseApprox: false,
    savePercent: null,
    position: 'starter',
    status: 'paused',
    orderNameKo: 'MidiAI Studio 5 크레딧',
    orderNameEn: 'MidiAI Studio 5 Credits',
    taglineKo: '소량 / 첫 구매',
    taglineEn: 'Small pack / first purchase',
    popular: false
  },
  {
    productId: 'CREDIT_30',
    credits: 30,
    points: 30,
    krw: 35000,
    perUseKrw: 1167,
    perUseApprox: true,
    savePercent: null,
    position: 'recommended',
    status: 'paused',
    orderNameKo: 'MidiAI Studio 30 크레딧',
    orderNameEn: 'MidiAI Studio 30 Credits',
    taglineKo: '추천',
    taglineEn: 'Recommended',
    popular: true
  },
  {
    productId: 'CREDIT_100',
    credits: 100,
    points: 100,
    krw: 105000,
    perUseKrw: 1050,
    perUseApprox: false,
    savePercent: 19,
    position: 'bulk',
    status: 'paused',
    orderNameKo: 'MidiAI Studio 100 크레딧',
    orderNameEn: 'MidiAI Studio 100 Credits',
    taglineKo: '대량',
    taglineEn: 'Bulk pack',
    popular: false
  }
];

export const FALLBACK_POINT_PRODUCTS = FALLBACK_CREDIT_PRODUCTS;

let cache = FALLBACK_CREDIT_PRODUCTS.map((p) => ({ ...p }));

export function normalizeCreditProductId(id) {
  const key = String(id || '').trim().toUpperCase();
  return PRODUCT_ALIASES[key] || key;
}

function isCreditPackId(id) {
  const key = normalizeCreditProductId(id);
  if (key === 'CREDIT_10' || key === 'POINT_10' || key === 'LIFETIME') return false;
  return key.startsWith('CREDIT_');
}

function isOnSalePack(product) {
  const status = String(product?.status || 'active');
  if (status === 'paused' || status === 'archived' || status === 'disabled') return false;
  if (product?.saleOk === false) return false;
  return isCreditPackId(product?.productId);
}

export function packCredits(product) {
  return Number(product?.credits || product?.points || 0);
}

export function getCreditProducts() {
  return cache.filter((p) => isOnSalePack(p)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function getPointProducts() {
  return getCreditProducts();
}

export function getCreditProduct(productId) {
  const id = normalizeCreditProductId(productId);
  const packs = getCreditProducts();
  return packs.find((p) => p.productId === id) || packs.find((p) => p.popular) || packs[0];
}

export function getPointProduct(productId) {
  return getCreditProduct(productId);
}

export function formatKrw(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

export function formatCreditPrice(product) {
  return formatKrw(product?.krw);
}

export function formatPointPrice(product) {
  return formatCreditPrice(product);
}

export function creditOrderName(product, lang) {
  if (lang === 'ko') return product.orderNameKo || product.orderNameEn;
  return product.orderNameEn || product.orderNameKo;
}

export function pointOrderName(product, lang) {
  return creditOrderName(product, lang);
}

export function creditTagline(product, lang) {
  const id = normalizeCreditProductId(product?.productId);
  if (lang === 'ko') return product.taglineKo || product.taglineEn;
  if (lang === 'ja') {
    if (id === 'CREDIT_5') return '少量 / はじめて';
    if (id === 'CREDIT_30') return 'おすすめ';
    return 'まとめ買い';
  }
  return product.taglineEn || product.taglineKo;
}

export function pointTagline(product, lang) {
  return creditTagline(product, lang);
}

async function fetchCatalog(base, name) {
  const res = await fetch(`${base}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function loadCreditProducts(functionsBaseUrl) {
  const base = String(functionsBaseUrl || '').replace(/\/$/, '');
  if (!base || base.includes('PASTE_')) return getCreditProducts();
  try {
    let data = null;
    try {
      data = await fetchCatalog(base, 'getCreditProducts');
    } catch (_) {
      data = await fetchCatalog(base, 'getPointProducts');
    }
    if (data?.ok && Array.isArray(data.products) && data.products.length) {
      const mapped = data.products
        .map((p) => ({ ...p, productId: normalizeCreditProductId(p.productId) }))
        .filter((p) => isOnSalePack(p));
      if (mapped.length) {
        cache = mapped.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      }
    }
    if (data?.lifetime) {
      try { window.__midiaiLifetimeCatalog = data.lifetime; } catch (_) { /* ignore */ }
    }
    // Pass prices for purchase UI (Firestore SoT via getPublicCatalog).
    if (Array.isArray(data?.passes) && data.passes.length) {
      try { window.__midiaiPassCatalog = data.passes; } catch (_) { /* ignore */ }
    } else if (Array.isArray(data?.catalog) && data.catalog.length) {
      const passes = data.catalog.filter((p) => String(p?.productId || '').toUpperCase().startsWith('PASS_'));
      if (passes.length) {
        try { window.__midiaiPassCatalog = passes; } catch (_) { /* ignore */ }
      }
    }
    if (Array.isArray(data?.promotions)) {
      try { window.__midiaiPromotions = data.promotions; } catch (_) { /* ignore */ }
    }
  } catch (_) {
    cache = FALLBACK_CREDIT_PRODUCTS.map((p) => ({ ...p }));
  }
  return getCreditProducts();
}

export function applyPublicCreditCatalog(products) {
  if (!Array.isArray(products) || !products.length) return getCreditProducts();
  const mapped = products
    .map((p) => ({ ...p, productId: normalizeCreditProductId(p.productId) }))
    .filter((p) => isOnSalePack(p));
  if (mapped.length) {
    cache = mapped.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }
  return getCreditProducts();
}

export async function loadPointProducts(functionsBaseUrl) {
  return loadCreditProducts(functionsBaseUrl);
}
