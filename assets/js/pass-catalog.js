/**
 * Display catalog for one-time Full Pass products (not subscriptions).
 * Prices are verified by Cloud Functions; this file is UI-only.
 *
 * Purchase UI must not paint SEED prices first (avoids 7,900 → 9,900 flash).
 * cache starts empty (`pending`) until Firestore / public catalog hydrates.
 */
import {
  SEED_PRODUCTS,
  PASS_DURATION_DAYS,
  PASS_PRODUCT_IDS,
  isPassProductId,
  normalizeProductId,
  getPassProductsFromCatalog,
  computePassBundleSavings,
  formatPassBundleSavingsLabel
} from './catalog-engine.js?v=promo-multi-popup-1';

export { isPassProductId, PASS_PRODUCT_IDS, PASS_DURATION_DAYS };

export const FALLBACK_PASS_PRODUCTS = SEED_PRODUCTS
  .filter((p) => p.type === 'full_pass')
  .map((p) => {
    const passes = SEED_PRODUCTS.filter((x) => x.type === 'full_pass');
    const bundle = computePassBundleSavings(p, passes);
    return {
      productId: p.productId,
      type: 'full_pass',
      entitlement: 'full_pass',
      durationDays: p.durationDays,
      nameKo: p.nameKo,
      nameEn: p.nameEn,
      nameJa: p.nameJa,
      descriptionKo: p.descriptionKo,
      descriptionEn: p.descriptionEn,
      krw: p.listPriceKrw,
      listPriceKrw: p.listPriceKrw,
      effectivePrice: p.listPriceKrw,
      badge: p.badge || '',
      popular: p.badge === 'recommended',
      savePercent: bundle?.savingPercent || null,
      savingsLabel: bundle ? formatPassBundleSavingsLabel(bundle, 'ko') : '',
      bundleSavings: bundle || null,
      sortOrder: p.sortOrder || 0,
      orderNameKo: p.orderNameKo,
      orderNameEn: p.orderNameEn,
      status: 'active',
      saleOk: true
    };
  });

/** Empty until public/Firestore catalog loads — never show seed prices on first paint. */
let cache = [];
let cacheSource = 'pending';

function isOnSalePass(product) {
  const status = String(product?.status || 'active');
  if (status === 'paused' || status === 'archived' || status === 'disabled') return false;
  if (product?.saleOk === false) return false;
  const id = product?.productId;
  return isPassProductId(id)
    || product?.type === 'full_pass'
    || product?.entitlement === 'full_pass';
}

export function getPassCatalogSource() {
  return cacheSource;
}

export function isPassCatalogReady() {
  return cacheSource === 'firestore' || cacheSource === 'seed_fallback';
}

export function getPassProducts() {
  return cache.filter((p) => isOnSalePass(p)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function getPassProduct(productId) {
  const id = normalizeProductId(productId);
  const packs = getPassProducts();
  return packs.find((p) => p.productId === id) || packs.find((p) => p.popular) || packs[0];
}

export function passDurationDays(product) {
  const n = Number(product?.durationDays);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  const id = normalizeProductId(product?.productId);
  if (Object.prototype.hasOwnProperty.call(PASS_DURATION_DAYS, id)) {
    return PASS_DURATION_DAYS[id];
  }
  return 0;
}

export function useSeedPassFallback(reason = 'unknown') {
  console.warn('CATALOG_FALLBACK_USED', { reason, source: 'seed_fallback' });
  cache = FALLBACK_PASS_PRODUCTS.map((p) => ({ ...p }));
  cacheSource = 'seed_fallback';
  return getPassProducts();
}

export function applyPublicPassCatalog(products = []) {
  const mapped = (products || [])
    .filter((p) => {
      const id = p.productId || p.id;
      return isPassProductId(id)
        || p.type === 'full_pass'
        || p.entitlement === 'full_pass';
    })
    .map((p) => {
      const productId = normalizeProductId(p.productId || p.id);
      const list = Number(p.listPriceKrw || p.krw || 0);
      const sale = Number(p.effectivePrice != null ? p.effectivePrice : list);
      return {
        productId,
        type: 'full_pass',
        entitlement: 'full_pass',
        durationDays: passDurationDays(p),
        nameKo: p.nameKo || p.name || productId,
        nameEn: p.nameEn || p.name || productId,
        nameJa: p.nameJa || p.name || productId,
        descriptionKo: p.descriptionKo || '',
        descriptionEn: p.descriptionEn || '',
        descriptionJa: p.descriptionJa || '',
        krw: sale,
        listPriceKrw: list,
        effectivePrice: sale,
        discountPercent: Number(p.discountPercent || 0),
        discountEndsAt: p.discountEndsAt || '',
        badge: p.badge || '',
        popular: p.badge === 'recommended' || !!p.popular,
        savePercent: p.savePercent != null ? p.savePercent : null,
        savingsLabel: p.savingsLabel || '',
        bundleSavings: p.bundleSavings || null,
        sortOrder: Number(p.sortOrder || 0),
        orderNameKo: p.orderNameKo || '',
        orderNameEn: p.orderNameEn || '',
        status: p.status || 'active',
        saleOk: p.saleOk !== false
      };
    });
  if (mapped.length) {
    cache = mapped;
    cacheSource = 'firestore';
  } else if (cacheSource === 'pending' || !cache.length) {
    useSeedPassFallback('applyPublicPassCatalog_empty');
  } else {
    console.warn('CATALOG_FALLBACK_USED', { reason: 'applyPublicPassCatalog_empty_keep', source: cacheSource });
  }
  return getPassProducts();
}

export function hydratePassCatalogFromPublic(payload) {
  const list = payload?.passes || getPassProductsFromCatalog(payload?.catalog || []);
  return applyPublicPassCatalog(list);
}
