/**
 * Central pricing loader — Firestore `products` + `pricingConfig`.
 * Display only; Cloud Functions remain source of truth for charge amounts.
 */

const DEFAULT_PRODUCT_ID = 'lifetime';

const FALLBACK_PRODUCT = {
  id: DEFAULT_PRODUCT_ID,
  name: 'Lifetime License',
  status: 'active',
  badge: 'Best Seller',
  promoText: 'Launch Discount',
  buttonText: 'Buy Now',
  order: 1,
  plan: 'lifetime',
  pricingVersion: 1,
  regions: {
    KR: {
      payment: 'portone',
      currency: 'KRW',
      listPrice: 130000,
      salePrice: 90000,
      orderName: 'MidiAI Studio Lifetime License',
      portoneProductId: 'midiai-lifetime'
    },
    Global: {
      payment: 'paypal',
      currency: 'USD',
      listPrice: 89,
      salePrice: 65,
      orderName: 'MidiAI Studio Lifetime License'
    }
  }
};

const FALLBACK_LANG_MAP = { ko: 'KR', en: 'Global', ja: 'Global' };

let cache = {
  products: [FALLBACK_PRODUCT],
  langRegionMap: { ...FALLBACK_LANG_MAP },
  defaultProductId: DEFAULT_PRODUCT_ID,
  loaded: false
};

export function getPricingCache() {
  return cache;
}

export function resolveRegionForLang(lang) {
  const map = cache.langRegionMap || FALLBACK_LANG_MAP;
  return map[lang] || map.en || 'Global';
}

export function getDefaultProduct() {
  const id = cache.defaultProductId || DEFAULT_PRODUCT_ID;
  return cache.products.find((p) => p.id === id) || cache.products[0] || FALLBACK_PRODUCT;
}

export function getProductById(id) {
  return cache.products.find((p) => p.id === id) || getDefaultProduct();
}

export function getRegionPricing(product, regionCode) {
  const regions = product?.regions || {};
  return regions[regionCode] || regions.Global || regions.KR || FALLBACK_PRODUCT.regions.Global;
}

export function discountPercent(listPrice, salePrice) {
  const list = Number(listPrice);
  const sale = Number(salePrice);
  if (!list || !sale || sale >= list) return 0;
  return Math.round((1 - sale / list) * 100);
}

export function formatMoney(amount, currency, lang = 'ko') {
  const n = Number(amount);
  const cur = String(currency || 'USD').toUpperCase();
  if (!Number.isFinite(n)) return '';
  if (cur === 'KRW') {
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  }
  if (cur === 'JPY') {
    return `¥${Math.round(n).toLocaleString('ja-JP')}`;
  }
  if (cur === 'EUR') {
    return `€${n.toLocaleString(lang === 'en' ? 'en-US' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  // USD default
  const fixed = n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `$${fixed}`;
}

/** Checkout helpers for purchase page */
export function checkoutContext(lang, preferKoreanPath = false) {
  const region = preferKoreanPath ? 'KR' : resolveRegionForLang(lang);
  const product = getDefaultProduct();
  const rp = getRegionPricing(product, region);
  const list = Number(rp.listPrice);
  const sale = Number(rp.salePrice);
  return {
    product,
    region,
    payment: rp.payment || (region === 'KR' ? 'portone' : 'paypal'),
    currency: rp.currency || (region === 'KR' ? 'KRW' : 'USD'),
    listPrice: list,
    salePrice: sale,
    displaySale: formatMoney(sale, rp.currency, lang),
    displayList: formatMoney(list, rp.currency, lang),
    discount: discountPercent(list, sale),
    orderName: rp.orderName || product.name || 'MidiAI Studio Lifetime License',
    portoneProductId: rp.portoneProductId || product.id || 'midiai-lifetime',
    status: product.status || 'active',
    pricingVersion: product.pricingVersion || 1,
    badge: product.badge || '',
    promoText: product.promoText || '',
    buttonText: product.buttonText || 'Buy Now',
    name: product.name || 'Lifetime License',
    plan: product.plan || 'lifetime'
  };
}

export function isSelling(product = getDefaultProduct()) {
  return (product?.status || 'active') === 'active';
}

export async function ensurePricing(db, firestoreApi) {
  if (!db || !firestoreApi?.collection) return cache;
  const { collection, getDocs, doc, getDoc } = firestoreApi;
  try {
    const [prodSnap, cfgSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDoc(doc(db, 'pricingConfig', 'main')).catch(() => null)
    ]);
    const products = prodSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    if (products.length) cache.products = products;
    if (cfgSnap?.exists?.()) {
      const cfg = cfgSnap.data() || {};
      if (cfg.langRegionMap) cache.langRegionMap = { ...FALLBACK_LANG_MAP, ...cfg.langRegionMap };
      if (cfg.defaultProductId) cache.defaultProductId = cfg.defaultProductId;
    }
    cache.loaded = true;
  } catch (e) {
    console.warn('ensurePricing fallback', e);
  }
  return cache;
}

export function seedProductPayload() {
  return {
    ...FALLBACK_PRODUCT,
    createdAt: null,
    updatedAt: null
  };
}

export { DEFAULT_PRODUCT_ID, FALLBACK_PRODUCT, FALLBACK_LANG_MAP };
