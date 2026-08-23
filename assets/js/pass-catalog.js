/**
 * Display catalog for one-time Full Pass products (not subscriptions).
 * Prices are verified by Cloud Functions; this file is UI-only.
 */
import {
  SEED_PRODUCTS,
  PASS_DURATION_DAYS,
  PASS_PRODUCT_IDS,
  isPassProductId,
  normalizeProductId,
  getPassProductsFromCatalog
} from './catalog-engine.js?v=price-sot-1';

export { isPassProductId, PASS_PRODUCT_IDS, PASS_DURATION_DAYS };

export const FALLBACK_PASS_PRODUCTS = SEED_PRODUCTS
  .filter((p) => p.type === 'full_pass')
  .map((p) => ({
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
    savePercent: p.packSavePercent || null,
    sortOrder: p.sortOrder || 0,
    orderNameKo: p.orderNameKo,
    orderNameEn: p.orderNameEn,
    status: 'active',
    saleOk: true
  }));

let cache = FALLBACK_PASS_PRODUCTS.map((p) => ({ ...p }));
let cacheSource = 'seed_fallback';

function isOnSalePass(product) {
  const status = String(product?.status || 'active');
  if (status === 'paused' || status === 'archived' || status === 'disabled') return false;
  if (product?.saleOk === false) return false;
  return isPassProductId(product?.productId);
}

export function getPassCatalogSource() {
  return cacheSource;
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
  const id = normalizeProductId(product?.productId);
  const n = Number(product?.durationDays);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return PASS_DURATION_DAYS[id] || 0;
}

export function applyPublicPassCatalog(products = []) {
  const mapped = (products || [])
    .filter((p) => isPassProductId(p.productId || p.id))
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
        krw: sale,
        listPriceKrw: list,
        effectivePrice: sale,
        discountPercent: Number(p.discountPercent || 0),
        badge: p.badge || '',
        popular: p.badge === 'recommended' || !!p.popular,
        savePercent: p.savePercent != null ? p.savePercent : (p.packSavePercent || null),
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
  } else {
    console.warn('CATALOG_FALLBACK_USED', { reason: 'applyPublicPassCatalog_empty', source: cacheSource });
  }
  return getPassProducts();
}

export function hydratePassCatalogFromPublic(payload) {
  const list = payload?.passes || getPassProductsFromCatalog(payload?.catalog || []);
  return applyPublicPassCatalog(list);
}
