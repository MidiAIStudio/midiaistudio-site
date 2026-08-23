/**
 * Central pricing loader — Firestore `products` + `pricingConfig`.
 * Display only; Cloud Functions remain source of truth for charge amounts.
 */

import { computeCharge, hydrateLegacyProduct, activeHomepagePromotions } from './catalog-engine.js?v=product-mapping-forensic-1';

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
      listPrice: 129000,
      salePrice: 129000,
      orderName: 'MidiAI Studio Lifetime License',
      portoneProductId: 'midiai-lifetime'
    },
    Global: {
      payment: 'paypal',
      currency: 'USD',
      listPrice: 89,
      salePrice: 89,
      orderName: 'MidiAI Studio Lifetime License'
    }
  }
};

const FALLBACK_LANG_MAP = { ko: 'KR', en: 'Global', ja: 'Global' };

/** Site-wide discount campaign + popup (pricingConfig/main.promo) */
const FALLBACK_PROMO = {
  enabled: false,
  discountStartsAt: '',
  discountEndsAt: '',
  badgeEnabled: false,
  badgeKo: '7월 31일까지',
  badgeEn: 'Until July 31',
  badgeJa: '7月31日まで',
  popupEnabled: false,
  popupStartsAt: '',
  popupEndsAt: '',
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
  promotions: [],
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
  // Explicit booleans only — missing/null must not default to "on"
  p.enabled = p.enabled === true;
  p.badgeEnabled = p.badgeEnabled === true;
  p.popupEnabled = p.popupEnabled === true;
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
  if (activeHomepagePromotions(cache.promotions || [], { now }).length) return true;
  const p = getPromoConfig();
  if (!p.popupEnabled) return false;
  const start = p.popupStartsAt || p.discountStartsAt;
  const end = p.popupEndsAt || p.discountEndsAt;
  return inDateRange(start, end, now);
}

export function getActiveHomepagePromotions(lifetimeOwned = false, now = new Date()) {
  return activeHomepagePromotions(cache.promotions || [], { now, lifetimeOwned });
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
  const hydrated = hydrateLegacyProduct(product);
  const rp = getRegionPricing(product, region);
  const list = Number(hydrated.listPriceKrw || rp.listPrice);
  const rawSale = Number(rp.salePrice);
  const discountOn = isDiscountCampaignActive();
  const catalogCharge = computeCharge(hydrated, cache.promotions || [], new Date(), region === 'KR' ? 'KRW' : 'USD');
  let sale = catalogCharge.ok ? catalogCharge.effectivePrice : (Number.isFinite(list) && list > 0 ? list : rawSale);
  let discount = catalogCharge.discountPercent || 0;
  if (!catalogCharge.discount && discountOn && Number.isFinite(rawSale) && rawSale > 0 && rawSale < list) {
    sale = rawSale;
    discount = Math.round((1 - sale / list) * 100);
  }
  return {
    product,
    region,
    payment: rp.payment || (region === 'KR' ? 'portone' : 'paypal'),
    currency: rp.currency || (region === 'KR' ? 'KRW' : 'USD'),
    listPrice: list,
    salePrice: sale,
    displaySale: formatMoney(sale, rp.currency, lang),
    displayList: formatMoney(list, rp.currency, lang),
    discount: discount,
    discountCampaignActive: discount > 0,
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

export async function ensurePricing(db, firestoreApi, { force = false } = {}) {
  if (!db || !firestoreApi?.collection) {
    console.warn('CATALOG_FALLBACK_USED', { reason: 'no_firestore' });
    return cache;
  }
  const { collection, getDocs, doc, getDoc } = firestoreApi;
  try {
    const [prodSnap, cfgSnap, promoSnap] = await Promise.all([
      getDocs(collection(db, 'products')),
      getDoc(doc(db, 'pricingConfig', 'main')).catch(() => null),
      getDocs(collection(db, 'promotions')).catch(() => null)
    ]);
    const products = prodSnap.docs
      .map((d) => hydrateLegacyProduct({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.sortOrder || a.order || 0) - (b.sortOrder || b.order || 0));
    if (products.length) cache.products = products;
    else console.warn('CATALOG_FALLBACK_USED', { reason: 'empty_products_collection' });
    if (promoSnap?.docs) {
      cache.promotions = promoSnap.docs.map((d) => ({ id: d.id, promotionId: d.id, ...d.data() }));
    }
    if (cfgSnap?.exists?.()) {
      const cfg = cfgSnap.data() || {};
      if (cfg.langRegionMap) cache.langRegionMap = { ...FALLBACK_LANG_MAP, ...cfg.langRegionMap };
      if (cfg.defaultProductId) cache.defaultProductId = cfg.defaultProductId;
      if (cfg.promo) cache.promo = normalizePromo(cfg.promo);
    }
    cache.loaded = true;
    cache.loadedAt = Date.now();
    cache.forceToken = force ? Date.now() : cache.forceToken;
  } catch (e) {
    console.warn('CATALOG_FALLBACK_USED', { reason: 'ensurePricing_error', error: String(e?.message || e) });
    console.warn('ensurePricing fallback', e);
  }
  return cache;
}

export function invalidatePricingCache() {
  cache.loaded = false;
  cache.loadedAt = 0;
}

export function seedProductPayload() {
  return {
    ...FALLBACK_PRODUCT,
    createdAt: null,
    updatedAt: null
  };
}

export { DEFAULT_PRODUCT_ID, FALLBACK_PRODUCT, FALLBACK_LANG_MAP, FALLBACK_PROMO };
