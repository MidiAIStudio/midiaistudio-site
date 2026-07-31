/**
 * Central pricing loader — Firestore `products` + `pricingConfig`.
 * Display only; Cloud Functions remain source of truth for charge amounts.
 */

const DEFAULT_PRODUCT_ID = 'lifetime';

const FALLBACK_PRODUCT = {
  id: DEFAULT_PRODUCT_ID,
  name: 'Lifetime License',
  status: 'active',
  badge: 'Final Sale',
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

/** Site-wide discount campaign + popup (pricingConfig/main.promo) */
const FALLBACK_PROMO = {
  enabled: true,
  discountStartsAt: '2026-07-01',
  discountEndsAt: '2026-07-31',
  badgeEnabled: true,
  badgeKo: '7월 31일까지',
  badgeEn: 'Until July 31',
  badgeJa: '7月31日まで',
  popupEnabled: true,
  popupStartsAt: '2026-07-01',
  popupEndsAt: '2026-07-31',
  popupTitleKo: 'Lifetime 라이선스 할인',
  popupTitleEn: 'Lifetime License Discount',
  popupTitleJa: 'Lifetimeライセンス割引',
  popupBodyKo: '7월 31일까지 MidiAI Studio Lifetime을 특별가로 구매할 수 있습니다.',
  popupBodyEn: 'Get MidiAI Studio Lifetime at a special price until July 31.',
  popupBodyJa: '7月31日まで、MidiAI Studio Lifetimeをお得な価格でご購入いただけます。',
  popupCtaKo: '라이선스 구매',
  popupCtaEn: 'Buy license',
  popupCtaJa: 'ライセンス購入'
};

let cache = {
  products: [FALLBACK_PRODUCT],
  langRegionMap: { ...FALLBACK_LANG_MAP },
  defaultProductId: DEFAULT_PRODUCT_ID,
  promo: { ...FALLBACK_PROMO },
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
    return `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const fixed = n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `$${fixed}`;
}

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inDateRange(start, end, now = new Date()) {
  const k = dayKey(now);
  if (start && k < String(start)) return false;
  if (end && k > String(end)) return false;
  return true;
}

function normalizePromo(raw) {
  const p = { ...FALLBACK_PROMO, ...(raw && typeof raw === 'object' ? raw : {}) };
  p.enabled = p.enabled !== false;
  p.badgeEnabled = p.badgeEnabled !== false;
  p.popupEnabled = !!p.popupEnabled;
  return p;
}

export function getPromoConfig() {
  return cache.promo || FALLBACK_PROMO;
}

/** Discount period for badges / until pills */
export function isDiscountCampaignActive(now = new Date()) {
  const p = getPromoConfig();
  if (!p.enabled) return false;
  return inDateRange(p.discountStartsAt, p.discountEndsAt, now);
}

/** Home sale popup window (can differ from discount period) */
export function isPromoPopupActive(now = new Date()) {
  const p = getPromoConfig();
  if (!p.popupEnabled) return false;
  const start = p.popupStartsAt || p.discountStartsAt;
  const end = p.popupEndsAt || p.discountEndsAt;
  return inDateRange(start, end, now);
}

export function promoLocalized(fieldBase, lang = 'ko') {
  const p = getPromoConfig();
  const suffix = lang === 'en' ? 'En' : lang === 'ja' ? 'Ja' : 'Ko';
  const v = p[`${fieldBase}${suffix}`];
  if (v) return String(v);
  return String(p[`${fieldBase}Ko`] || p[`${fieldBase}En`] || '');
}

export function promoBadgeText(lang = 'ko') {
  const p = getPromoConfig();
  if (!p.badgeEnabled || !isDiscountCampaignActive()) return '';
  return promoLocalized('badge', lang);
}

export function promoPopupCopy(lang = 'ko', priceCtx = null) {
  const p = getPromoConfig();
  const was = priceCtx?.displayList || '';
  const now = priceCtx?.displaySale || '';
  const badge = priceCtx?.badge || promoBadgeText(lang) || 'Sale';
  const until = promoBadgeText(lang) || promoLocalized('badge', lang);
  return {
    badge,
    title: promoLocalized('popupTitle', lang),
    lead: promoLocalized('popupBody', lang),
    until,
    was,
    now,
    cta: promoLocalized('popupCta', lang),
    hideToday: lang === 'en' ? "Don't show again today" : lang === 'ja' ? '今日は表示しない' : '오늘 하루 보지 않기',
    close: lang === 'en' ? 'Close' : lang === 'ja' ? '閉じる' : '닫기'
  };
}

/** Checkout helpers for purchase page */
export function checkoutContext(lang, preferKoreanPath = false) {
  const region = preferKoreanPath ? 'KR' : resolveRegionForLang(lang);
  const product = getDefaultProduct();
  const rp = getRegionPricing(product, region);
  const list = Number(rp.listPrice);
  const sale = Number(rp.salePrice);
  const discountOn = isDiscountCampaignActive();
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
    discountCampaignActive: discountOn,
    saleUntil: promoBadgeText(lang),
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
      if (cfg.promo) cache.promo = normalizePromo(cfg.promo);
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

export { DEFAULT_PRODUCT_ID, FALLBACK_PRODUCT, FALLBACK_LANG_MAP, FALLBACK_PROMO };
