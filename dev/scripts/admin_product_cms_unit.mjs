/**
 * Local unit checks for Dynamic Catalog + validation (no Firestore writes).
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

// Load browser catalog-engine via dynamic import is ESM — duplicate critical checks via functions copy.
const catalogEngine = require(join(root, 'functions/catalogEngine.js'));
const passEntitlement = require(join(root, 'functions/passEntitlement.js'));

// Browser validateProductFields — evaluate by importing? catalog-engine is ESM.
const { pathToFileURL } = await import('url');
const browser = await import(pathToFileURL(join(root, 'assets/js/catalog-engine.js')).href);
const storefront = await import(pathToFileURL(join(root, 'assets/js/storefront-render.js')).href);
const pricingMod = await import(pathToFileURL(join(root, 'assets/js/pricing.js')).href);
const creditCatalog = await import(pathToFileURL(join(root, 'assets/js/credit-catalog.js')).href);
const creditPurchase = require(join(root, 'functions/creditPurchase.js'));

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, pass: true });
    console.log('PASS', name);
  } catch (e) {
    checks.push({ name, pass: false, detail: e.message });
    console.log('FAIL', name, e.message);
  }
}

check('server_isPass_TEST', () => assert.equal(catalogEngine.isPassProductId('TEST_PASS_ADMIN_E2E'), true));
check('server_isLicense_TEST', () => assert.equal(catalogEngine.isLicenseProductId('TEST_PASS_ADMIN_E2E'), true));
check('pass_bundle_savings_22', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, nameKo: '30일 Full' },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900, nameKo: '90일 Full', savingsReferenceProductId: 'PASS_30D' }
  ];
  const s = browser.computePassBundleSavings(catalog[1], catalog);
  assert.equal(s.ok, true);
  assert.equal(s.quantity, 3);
  assert.equal(s.comparisonPrice, 89700);
  assert.equal(s.savingAmount, 19800);
  assert.equal(s.savingPercent, 22);
  assert.match(browser.formatPassBundleSavingsLabel(s, 'ko'), /약 22% 절약/);
});
check('pass_bundle_savings_11', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900 },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 79900 }
  ];
  const s = browser.computePassBundleSavings(catalog[1], catalog);
  assert.equal(s.savingPercent, 11);
});
check('pass_bundle_hidden_equal', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900 },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 89700 }
  ];
  assert.equal(browser.computePassBundleSavings(catalog[1], catalog), null);
});
check('pass_bundle_hidden_more_expensive', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900 },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 95000 }
  ];
  assert.equal(browser.computePassBundleSavings(catalog[1], catalog), null);
});
check('pass_bundle_30_vs_7_hidden', () => {
  const catalog = [
    { productId: 'PASS_7D', type: 'full_pass', durationDays: 7, listPriceKrw: 9900 },
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900 }
  ];
  assert.equal(browser.computePassBundleSavings(catalog[1], catalog), null);
});
check('pass_bundle_7d_hidden', () => {
  const catalog = [
    { productId: 'PASS_7D', type: 'full_pass', durationDays: 7, listPriceKrw: 9900 },
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900 }
  ];
  assert.equal(browser.computePassBundleSavings(catalog[0], catalog), null);
});
check('pass_ignores_stale_packSavePercent', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900 },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900, packSavePercent: 16 }
  ];
  const view = browser.publicProductView(catalog[1], [], new Date(), 'ko', null, catalog);
  assert.equal(view.savePercent, 22);
  assert.match(view.savingsLabel, /22%/);
  assert.equal(browser.packSavingsPercent(catalog[1], 1300), null);
});
check('pass_promo_separate_from_bundle', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, status: 'active' },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900, status: 'active' }
  ];
  const promos = [{
    enabled: true,
    archived: false,
    type: 'percent',
    value: 10,
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2099-01-01T00:00:00.000Z',
    productIds: ['PASS_90D']
  }];
  const view = browser.publicProductView(catalog[1], promos, new Date(), 'ko', null, catalog);
  assert.equal(view.savePercent, 22);
  assert.equal(view.discountPercent, 10);
  assert.notEqual(view.savePercent + view.discountPercent, view.discountPercent);
  assert.equal(view.effectivePrice, 62910);
});
check('promo_none_regular_price', () => {
  const p = { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, status: 'active' };
  const charge = browser.computeCharge(p, [], new Date());
  assert.equal(charge.ok, true);
  assert.equal(charge.effectivePrice, 29900);
  assert.equal(charge.discount, null);
});
check('promo_30pct_20930', () => {
  const p = { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, status: 'active' };
  const promos = [{
    enabled: true,
    archived: false,
    type: 'percent',
    value: 30,
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2099-01-01T00:00:00.000Z',
    productIds: ['PASS_30D']
  }];
  const charge = browser.computeCharge(p, promos, new Date());
  assert.equal(charge.effectivePrice, 20930);
  assert.equal(charge.discountPercent, 30);
});
check('stale_product_discount_ignored', () => {
  const p = {
    productId: 'PASS_30D',
    type: 'full_pass',
    durationDays: 30,
    listPriceKrw: 29900,
    status: 'active',
    productDiscount: {
      enabled: true,
      type: 'percent',
      value: 30,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2099-01-01T00:00:00.000Z'
    }
  };
  const charge = browser.computeCharge(p, [], new Date());
  assert.equal(charge.effectivePrice, 29900);
  assert.equal(charge.discount, null);
});
check('promo_90d_30pct_bundle_separate', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, status: 'active' },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900, status: 'active' }
  ];
  const promos = [{
    enabled: true,
    archived: false,
    type: 'percent',
    value: 30,
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2099-01-01T00:00:00.000Z',
    productIds: ['PASS_90D']
  }];
  const view = browser.publicProductView(catalog[1], promos, new Date(), 'ko', null, catalog);
  assert.equal(view.savePercent, 22);
  assert.equal(view.discountPercent, 30);
  assert.equal(view.effectivePrice, 48930);
});
check('validate_reject_product_discount_enabled', () => {
  const errs = browser.validateProductFields({
    productId: 'PASS_30D',
    type: 'full_pass',
    durationDays: 30,
    listPriceKrw: 29900,
    productDiscount: {
      enabled: true,
      type: 'percent',
      value: 10,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-02-01T00:00:00.000Z'
    }
  });
  assert.ok(errs.some((e) => /프로모션/.test(e)));
});
check('storefront_card_renders_discount', () => {
  const html = storefront.renderProductCard({
    productId: 'PASS_30D',
    type: 'full_pass',
    status: 'active',
    nameKo: '30일 Full',
    listPriceKrw: 29900,
    effectivePrice: 20930,
    discountPercent: 30,
    discountEndsAt: '2026-07-31T14:59:59.000Z',
    durationDays: 30,
    saleOk: true
  }, { lang: 'ko', preview: true });
  assert.match(html, /20,930원/);
  assert.match(html, /30% OFF/);
  assert.match(html, /7월 31일까지/);
  assert.match(html, /disabled/);
});
check('force_promo_preview_window', () => {
  const forced = storefront.forcePromoWindowForPreview({
    enabled: true,
    type: 'percent',
    value: 30,
    startsAt: '2099-01-01T00:00:00.000Z',
    endsAt: '2099-02-01T00:00:00.000Z',
    productIds: ['PASS_30D']
  });
  const p = { productId: 'PASS_30D', type: 'full_pass', listPriceKrw: 29900, status: 'active' };
  const charge = browser.computeCharge(p, [forced], new Date());
  assert.equal(charge.effectivePrice, 20930);
});
check('preview_ignores_stale_product_discount', () => {
  const p = {
    productId: 'PASS_30D',
    type: 'full_pass',
    listPriceKrw: 29900,
    status: 'active',
    productDiscount: {
      enabled: true, type: 'percent', value: 50,
      startsAt: '2020-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z'
    }
  };
  const promos = [{
    enabled: true, archived: false, type: 'percent', value: 10,
    startsAt: '2020-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z',
    productIds: ['PASS_30D']
  }];
  const charge = browser.computeCharge(p, promos, new Date());
  assert.equal(charge.effectivePrice, 26910);
  assert.equal(charge.discountPercent, 10);
});
check('server_stale_product_discount_ignored', () => {
  const p = {
    productId: 'PASS_30D',
    listPriceKrw: 29900,
    productDiscount: {
      enabled: true,
      type: 'percent',
      value: 30,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2099-01-01T00:00:00.000Z'
    }
  };
  const charge = catalogEngine.computeCharge(p, [], new Date());
  assert.equal(charge.effectivePrice, 29900);
});
check('resolve_promo_multi_products', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, nameKo: '30일 Full', status: 'active' },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900, nameKo: '90일 Full', status: 'active' },
    { productId: 'LIFETIME', type: 'lifetime', listPriceKrw: 130000, nameKo: 'Lifetime', status: 'active' }
  ];
  const promo = {
    enabled: true,
    type: 'percent',
    value: 30,
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2099-01-01T00:00:00.000Z',
    productIds: ['PASS_30D', 'PASS_90D']
  };
  const resolved = browser.resolvePromotionProducts(promo, catalog, { lang: 'ko' });
  assert.equal(resolved.products.length, 2);
  assert.equal(resolved.products[0].name, '30일 Full');
  assert.equal(resolved.products[0].salePriceKrw, 20930);
  assert.equal(resolved.products[1].name, '90일 Full');
  assert.equal(resolved.products[1].salePriceKrw, 48930);
});
check('resolve_promo_popup_caps_at_3', () => {
  const catalog = [
    { productId: 'PASS_7D', type: 'full_pass', durationDays: 7, listPriceKrw: 9900, nameKo: '7일 Full', status: 'active' },
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, nameKo: '30일 Full', status: 'active' },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900, nameKo: '90일 Full', status: 'active' },
    { productId: 'LIFETIME', type: 'lifetime', listPriceKrw: 130000, nameKo: 'Lifetime', status: 'active' }
  ];
  const promo = {
    enabled: true, type: 'percent', value: 10,
    startsAt: '2020-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z',
    productIds: ['PASS_7D', 'PASS_30D', 'PASS_90D', 'LIFETIME']
  };
  const resolved = browser.resolvePromotionProducts(promo, catalog, { lang: 'ko', maxVisible: 3 });
  assert.equal(resolved.visible.length, 3);
  assert.equal(resolved.hiddenCount, 1);
});
check('popup_html_shows_both_product_names', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900, nameKo: '30일 Full', status: 'active' },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900, nameKo: '90일 Full', status: 'active' }
  ];
  const promo = {
    enabled: true, type: 'percent', value: 30,
    nameKo: '이벤트', popupTitleKo: '기간제 상품 출시 이벤트',
    popupBodyKo: '', popupCtaKo: '할인 상품 보기',
    startsAt: '2020-01-01T00:00:00.000Z', endsAt: '2026-08-30T00:00:00.000Z',
    productIds: ['PASS_30D', 'PASS_90D']
  };
  const resolved = storefront.resolvePromotionProducts(promo, catalog, { lang: 'ko', maxVisible: 3 });
  const copy = storefront.buildPromotionPopupCopy(promo, {}, 'ko', resolved);
  const html = storefront.renderPromotionPopupHtml(copy, { preview: true });
  assert.match(html, /30일 Full/);
  assert.match(html, /90일 Full/);
  assert.match(html, /20,930원/);
  assert.match(html, /48,930원/);
  assert.doesNotMatch(html, /sale-promo-lead/); // empty body hidden
});
check('isPromoPopupActive_promotions_only', () => {
  const cache = pricingMod.getPricingCache();
  const prevPromos = cache.promotions;
  const prevPromo = cache.promo;
  try {
    cache.promotions = [];
    cache.promo = {
      enabled: true,
      popupEnabled: true,
      popupStartsAt: '2020-01-01',
      popupEndsAt: '2099-12-31'
    };
    assert.equal(pricingMod.isPromoPopupActive(new Date('2026-08-23')), false);
    cache.promotions = [{
      enabled: true,
      archived: false,
      homepagePopupEnabled: true,
      startsAt: '2020-01-01T00:00:00.000Z',
      endsAt: '2099-01-01T00:00:00.000Z',
      productIds: ['PASS_30D']
    }];
    assert.equal(pricingMod.isPromoPopupActive(new Date('2026-08-23')), true);
  } finally {
    cache.promotions = prevPromos;
    cache.promo = prevPromo;
  }
});
check('popup_html_uses_shared_renderer', () => {
  const copy = storefront.buildPromotionPopupCopy({
    nameKo: '여름 할인',
    popupTitleKo: '여름 특별 할인',
    popupBodyKo: '기간 한정',
    popupCtaKo: '지금 구매하기',
    endsAt: '2026-08-30T00:00:00.000Z',
    productIds: ['PASS_30D']
  }, { was: '29,900원', now: '20,930원', discountPercent: 30 }, 'ko');
  const html = storefront.renderPromotionPopupHtml(copy, { preview: true });
  assert.match(html, /여름 특별 할인/);
  assert.match(html, /disabled/);
});
check('pass_bundle_labels_i18n', () => {
  const catalog = [
    { productId: 'PASS_30D', type: 'full_pass', durationDays: 30, listPriceKrw: 29900 },
    { productId: 'PASS_90D', type: 'full_pass', durationDays: 90, listPriceKrw: 69900 }
  ];
  const s = browser.computePassBundleSavings(catalog[1], catalog);
  assert.match(browser.formatPassBundleSavingsLabel(s, 'en'), /Save about 22%/);
  assert.match(browser.formatPassBundleSavingsLabel(s, 'ja'), /約22%お得/);
});
check('assert_save_target_ok', () => {
  const r = browser.assertSaveTargetInvariant({
    selectedDocId: 'PASS_7D',
    draftProductId: 'PASS_7D',
    formProductId: 'PASS_7D',
    saveDocId: 'PASS_7D'
  });
  assert.equal(r.ok, true);
  assert.equal(r.docId, 'PASS_7D');
});
check('assert_save_target_lifetime_doc', () => {
  const r = browser.assertSaveTargetInvariant({
    selectedDocId: 'lifetime',
    draftProductId: 'LIFETIME',
    formProductId: 'LIFETIME',
    saveDocId: 'lifetime'
  });
  assert.equal(r.ok, true);
  assert.equal(r.docId, 'lifetime');
});
check('assert_save_target_rejects_cross_product', () => {
  const r = browser.assertSaveTargetInvariant({
    selectedDocId: 'PASS_7D',
    draftProductId: 'PASS_7D',
    formProductId: 'PASS_30D',
    saveDocId: 'PASS_7D'
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'draft_form_product_mismatch');
});
check('assert_save_target_rejects_wrong_save_doc', () => {
  const r = browser.assertSaveTargetInvariant({
    selectedDocId: 'PASS_30D',
    draftProductId: 'PASS_30D',
    formProductId: 'PASS_30D',
    saveDocId: 'PASS_7D'
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'save_doc_mismatch');
});
check('assert_save_target_rejects_selected_mismatch', () => {
  const r = browser.assertSaveTargetInvariant({
    selectedDocId: 'PASS_90D',
    draftProductId: 'PASS_7D',
    formProductId: 'PASS_7D',
    saveDocId: 'PASS_7D'
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'selected_doc_mismatch');
});
check('findCatalogProduct_by_doc_id', () => {
  const rows = [
    { productId: 'LIFETIME', docId: 'lifetime', type: 'lifetime', nameKo: 'Lifetime Full' },
    { productId: 'PASS_90D', docId: 'PASS_90D', type: 'full_pass', nameKo: '90일 Full' }
  ];
  assert.equal(browser.findCatalogProduct(rows, 'lifetime')?.productId, 'LIFETIME');
  assert.equal(browser.findCatalogProduct(rows, 'PASS_90D')?.docId, 'PASS_90D');
});
check('findCatalogProduct_not_by_name', () => {
  const rows = [{ productId: 'LIFETIME', docId: 'lifetime', nameKo: '60일 Full', type: 'lifetime' }];
  assert.equal(browser.findCatalogProduct(rows, '60일 Full'), null);
});
check('edit_target_mismatch_detected', () => {
  const msg = browser.editTargetMismatchMessage('PASS_30D', 'LIFETIME');
  assert.match(msg, /불일치/);
});
check('edit_target_match_ok', () => {
  assert.equal(browser.editTargetMismatchMessage('PASS_30D', 'PASS_30D'), '');
});
check('hydrate_existing_doc_skips_seed_name', () => {
  const h = browser.hydrateLegacyProduct({
    id: 'lifetime',
    productId: 'LIFETIME',
    type: 'lifetime',
    nameKo: '60일 Full',
    listPriceKrw: 69000,
    updatedAt: { seconds: 1 }
  });
  assert.equal(h.nameKo, '60일 Full');
  assert.equal(h.docId, 'lifetime');
  assert.equal(h.type, 'lifetime');
  assert.equal(h.listPriceKrw, 69000);
});
check('hydrate_missing_doc_uses_seed', () => {
  const h = browser.hydrateLegacyProduct({ id: 'PASS_7D', productId: 'PASS_7D', type: 'full_pass' });
  assert.equal(h.nameKo, '7일 Full');
  assert.equal(h.durationDays, 7);
});
check('bump_version_price', () => {
  assert.equal(browser.bumpVersion({ productVersion: 2 }, { priceChanged: true }), 3);
});
check('bump_version_status_only', () => {
  assert.equal(browser.bumpVersion({ productVersion: 2 }, { priceChanged: false, durationChanged: false, nameChanged: false }), 2);
});
check('compute_charge_archived', () => {
  const charge = browser.computeCharge({ productId: 'PASS_90D', type: 'full_pass', listPriceKrw: 49900, status: 'archived' });
  assert.equal(charge.ok, false);
  assert.equal(charge.code, 'SALE_DISABLED');
});
check('compute_charge_paused', () => {
  const charge = browser.computeCharge({ productId: 'PASS_7D', type: 'full_pass', listPriceKrw: 7900, status: 'paused' });
  assert.equal(charge.ok, false);
});
check('firestore_doc_id_lifetime', () => {
  assert.equal(browser.firestoreDocId('LIFETIME'), 'lifetime');
  assert.equal(browser.firestoreDocId('PASS_30D'), 'PASS_30D');
});
check('server_canon_duration_prefers_catalog', () => assert.equal(passEntitlement.passDurationDays('PASS_7D', 30), 30));
check('server_canon_duration_fallback', () => assert.equal(passEntitlement.passDurationDays('PASS_7D', 0), 7));
check('server_custom_duration', () => assert.equal(passEntitlement.passDurationDays('TEST_PASS_ADMIN_E2E', 14), 14));
check('browser_isPass_TEST', () => assert.equal(browser.isPassProductId('TEST_PASS_ADMIN_E2E'), true));
check('browser_isCanonical_only_seed', () => {
  assert.equal(browser.isCanonicalPassProductId('PASS_7D'), true);
  assert.equal(browser.isCanonicalPassProductId('TEST_PASS_ADMIN_E2E'), false);
});
check('validate_accept_TEST_create', () => {
  const errs = browser.validateProductFields({
    productId: 'TEST_PASS_ADMIN_E2E',
    type: 'full_pass',
    durationDays: 14,
    listPriceKrw: 12345,
    creditAmount: 0
  }, { isNew: true });
  assert.deepEqual(errs, []);
});
check('validate_reject_dup_format_ok_PASS_30D_id', () => {
  // format ok — duplicate checked by admin UI separately
  const errs = browser.validateProductFields({
    productId: 'PASS_30D',
    type: 'full_pass',
    durationDays: 30,
    listPriceKrw: 19900
  }, { isNew: true });
  assert.deepEqual(errs, []);
});
check('validate_reject_negative_price', () => {
  const errs = browser.validateProductFields({
    productId: 'TEST_PASS_ADMIN_E2E',
    type: 'full_pass',
    durationDays: 14,
    listPriceKrw: -100
  }, { isNew: true });
  assert.ok(errs.some((e) => /정가/.test(e)));
});
check('validate_reject_zero_price', () => {
  const errs = browser.validateProductFields({
    productId: 'TEST_PASS_ADMIN_E2E',
    type: 'full_pass',
    durationDays: 14,
    listPriceKrw: 0
  }, { isNew: true });
  assert.ok(errs.some((e) => /정가/.test(e)));
});
check('validate_reject_nan_price', () => {
  const errs = browser.validateProductFields({
    productId: 'TEST_PASS_ADMIN_E2E',
    type: 'full_pass',
    durationDays: 14,
    listPriceKrw: 'abc'
  }, { isNew: true });
  assert.ok(errs.length > 0);
});
check('validate_reject_huge_price', () => {
  const errs = browser.validateProductFields({
    productId: 'TEST_PASS_ADMIN_E2E',
    type: 'full_pass',
    durationDays: 14,
    listPriceKrw: 999999999999
  }, { isNew: true });
  assert.ok(errs.some((e) => /이하/.test(e)));
});
check('validate_reject_duration_0', () => {
  const errs = browser.validateProductFields({
    productId: 'TEST_PASS_X',
    type: 'full_pass',
    durationDays: 0,
    listPriceKrw: 1000
  }, { isNew: true });
  assert.ok(errs.some((e) => /기간/.test(e)));
});
check('validate_allow_canon_duration_change', () => {
  const errs = browser.validateProductFields({
    productId: 'PASS_7D',
    type: 'full_pass',
    durationDays: 30,
    listPriceKrw: 29900,
    nameKo: '1개월 Full'
  }, { isNew: false });
  assert.deepEqual(errs, []);
});
check('refund_uses_grant_days_not_catalog', () => {
  const T = Date.parse('2026-08-01T00:00:00.000Z');
  const DAY = passEntitlement.DAY_MS;
  const grants = [{
    paymentId: 'old7',
    productId: 'PASS_7D',
    kind: 'pass',
    durationDays: 7,
    grantedAt: { seconds: Math.floor(T / 1000) },
    status: 'active'
  }];
  assert.equal(passEntitlement.passDurationDays('PASS_7D', 30), 30);
  assert.equal(passEntitlement.passDurationDays('PASS_7D', grants[0].durationDays), 7);
  const r = passEntitlement.recomputePeriodEntitlementFromGrants(grants, new Date(T + 2 * DAY));
  assert.equal(r.plan, 'period');
  assert.equal(r.expiresAt.getTime(), T + 7 * DAY);
});
check('seed_delete_protected_ids', () => {
  assert.equal(browser.isSeedProduct('PASS_7D'), true);
  assert.equal(browser.isSeedProduct('TEST_PASS_ADMIN_E2E'), false);
});
check('delete_lifetime_system_required', () => {
  const r = browser.evaluateProductDeletable({ productId: 'LIFETIME', type: 'lifetime' }, { orderCount: 0, creditCount: 0 });
  assert.equal(r.deletable, false);
  assert.equal(r.reason, 'system_required');
});
check('delete_credit_no_history', () => {
  const r = browser.evaluateProductDeletable({ productId: 'CREDIT_5', type: 'credit_pack' }, { orderCount: 0, creditCount: 0 });
  assert.equal(r.deletable, true);
  assert.equal(r.reason, 'no_history');
});
check('delete_pass_no_history', () => {
  const r = browser.evaluateProductDeletable({ productId: 'PASS_7D', type: 'full_pass' }, { orderCount: 0, creditCount: 0 });
  assert.equal(r.deletable, true);
});
check('delete_blocked_payment_history', () => {
  const r = browser.evaluateProductDeletable({ productId: 'CREDIT_30', type: 'credit_pack' }, { orderCount: 2, creditCount: 0 });
  assert.equal(r.deletable, false);
  assert.equal(r.reason, 'payment_history');
});
check('delete_blocked_credit_grant', () => {
  const r = browser.evaluateProductDeletable({ productId: 'TEST_CREDIT', type: 'credit_pack' }, { orderCount: 0, creditCount: 1 });
  assert.equal(r.deletable, false);
  assert.equal(r.reason, 'credit_grant_history');
});
check('delete_seed_not_auto_blocked', () => {
  const r = browser.evaluateProductDeletable({ productId: 'CREDIT_100', type: 'credit_pack', hasPurchases: false }, { orderCount: 0, creditCount: 0 });
  assert.equal(r.deletable, true);
});
check('reorder_sort_orders_lifetime_doc', () => {
  const rows = browser.sortOrdersFromProductIds(['LIFETIME', 'PASS_30D', 'PASS_90D', 'PASS_7D', 'CREDIT_10']);
  assert.equal(rows[0].productId, 'LIFETIME');
  assert.equal(rows[0].docId, 'lifetime');
  assert.equal(rows[0].sortOrder, 1);
  assert.equal(rows[1].productId, 'PASS_30D');
  assert.equal(rows[1].docId, 'PASS_30D');
  assert.equal(rows[4].sortOrder, 5);
});
check('reorder_never_uses_index_as_doc', () => {
  const rows = browser.sortOrdersFromProductIds(['PASS_90D', 'LIFETIME']);
  assert.equal(rows[0].docId, 'PASS_90D');
  assert.equal(rows[1].docId, 'lifetime');
  assert.notEqual(rows[0].docId, '0');
});
check('reorder_preserves_name_price_duration', () => {
  const catalog = [
    { productId: 'PASS_30D', nameKo: '30일 Full', listPriceKrw: 19900, durationDays: 30, type: 'full_pass', sortOrder: 1 },
    { productId: 'LIFETIME', nameKo: 'Lifetime', listPriceKrw: 129000, durationDays: 0, type: 'lifetime', sortOrder: 5 }
  ];
  const next = browser.applyLocalProductReorder(catalog, ['LIFETIME', 'PASS_30D']);
  assert.equal(next[0].productId, 'LIFETIME');
  assert.equal(next[0].sortOrder, 1);
  assert.equal(next[0].listPriceKrw, 129000);
  assert.equal(next[0].nameKo, 'Lifetime');
  assert.equal(next[1].durationDays, 30);
  assert.equal(next[1].listPriceKrw, 19900);
});
check('reorder_normalizes_holes', () => {
  const catalog = [
    { productId: 'PASS_30D', sortOrder: 1 },
    { productId: 'PASS_90D', sortOrder: 2 },
    { productId: 'LIFETIME', sortOrder: 5 },
    { productId: 'PASS_7D', sortOrder: 7 },
    { productId: 'CREDIT_10', sortOrder: 10 }
  ];
  const next = browser.applyLocalProductReorder(catalog, ['LIFETIME', 'PASS_30D', 'PASS_90D', 'PASS_7D', 'CREDIT_10']);
  assert.deepEqual(next.map((p) => p.sortOrder), [1, 2, 3, 4, 5]);
  assert.deepEqual(next.map((p) => p.productId), ['LIFETIME', 'PASS_30D', 'PASS_90D', 'PASS_7D', 'CREDIT_10']);
});
check('next_sort_order_is_max_plus_one', () => {
  assert.equal(browser.nextProductSortOrder([{ sortOrder: 1 }, { sortOrder: 10 }]), 11);
});
check('move_product_id_up_down', () => {
  const ids = ['PASS_30D', 'PASS_90D', 'LIFETIME'];
  assert.deepEqual(browser.moveProductIdInOrder(ids, 'LIFETIME', -2), ['LIFETIME', 'PASS_30D', 'PASS_90D']);
  assert.deepEqual(browser.moveProductIdInOrder(ids, 'PASS_30D', 1), ['PASS_90D', 'PASS_30D', 'LIFETIME']);
});
check('purchase_catalog_includes_credit_pack', () => {
  assert.equal(browser.isPurchaseCatalogProduct({ productId: 'CREDIT_10', type: 'credit_pack' }), true);
  assert.equal(browser.isPurchaseCatalogProduct({ productId: 'PASS_30D', type: 'full_pass' }), true);
  assert.equal(browser.isPurchaseCatalogProduct({ productId: 'LIFETIME', type: 'lifetime' }), true);
  assert.equal(browser.isCreditProductId('CREDIT_10'), true);
});
check('overlay_inserts_unsaved_credit', () => {
  const saved = [
    { productId: 'PASS_30D', type: 'full_pass', nameKo: '30일 Full', listPriceKrw: 29900, status: 'active', sortOrder: 1 }
  ];
  const draft = {
    productId: 'CREDIT_10',
    type: 'credit_pack',
    nameKo: 'Credit 10',
    creditAmount: 10,
    listPriceKrw: 7900,
    status: 'active',
    sortOrder: 2
  };
  const catalog = browser.overlayCatalogDraft(saved, draft);
  const visible = catalog.filter((p) => browser.isPurchaseCatalogProduct(p));
  const credit = visible.find((p) => p.productId === 'CREDIT_10');
  assert.ok(credit, 'unsaved CREDIT_10 must appear in preview catalog');
  assert.equal(credit.listPriceKrw, 7900);
  assert.equal(credit.creditAmount, 10);
  assert.equal(saved.length, 1, 'overlay must not mutate saved catalog');
});
check('overlay_edits_credit_fields_live', () => {
  const saved = [{
    productId: 'CREDIT_10',
    type: 'credit_pack',
    nameKo: 'Credit 10',
    creditAmount: 10,
    listPriceKrw: 7900,
    status: 'active',
    badge: ''
  }];
  const next = browser.overlayCatalogDraft(saved, {
    ...saved[0],
    nameKo: 'Credit 10 Pack',
    creditAmount: 12,
    listPriceKrw: 8900,
    badge: 'recommended'
  });
  assert.equal(next[0].nameKo, 'Credit 10 Pack');
  assert.equal(next[0].creditAmount, 12);
  assert.equal(next[0].listPriceKrw, 8900);
  assert.equal(next[0].badge, 'recommended');
});
check('preview_credit_card_matches_storefront', () => {
  const product = {
    productId: 'CREDIT_10',
    type: 'credit_pack',
    nameKo: 'Credit 10',
    creditAmount: 10,
    listPriceKrw: 7900,
    status: 'active'
  };
  const view = browser.publicProductView(product, [], new Date(), 'ko', null, [product]);
  const html = storefront.renderProductCard(view, { lang: 'ko', preview: true });
  assert.match(html, /Credit 10/);
  assert.match(html, /10 Credits/);
  assert.match(html, /7,900원/);
  assert.match(html, /1 크레딧 = 1회 변환/);
  assert.match(html, /구매하기/);
  assert.doesNotMatch(html, /0일 Full/);
  assert.doesNotMatch(html, /변환 횟수 제한 없음/);
});
check('storefront_sellable_follows_catalog_status', () => {
  const active = { productId: 'CREDIT_10', type: 'credit_pack', status: 'active', creditAmount: 10, listPriceKrw: 7900 };
  const paused = { ...active, status: 'paused' };
  const archived = { ...active, status: 'archived' };
  assert.equal(browser.isStorefrontSellableProduct(active), true);
  assert.equal(browser.isStorefrontSellableProduct(paused), false);
  assert.equal(browser.isStorefrontSellableProduct(archived), false);
  assert.equal(browser.isCreditProductId('CREDIT_10'), true);
  assert.equal(browser.isCreditProductId('LIFETIME'), false);
});
check('public_credit_catalog_only_active_dynamic_skus', () => {
  const products = [
    { productId: 'CREDIT_10', type: 'credit_pack', status: 'active', credits: 10, krw: 7900, sortOrder: 1 },
    { productId: 'CREDIT_5', type: 'credit_pack', status: 'paused', credits: 5, krw: 6500, sortOrder: 2 },
    { productId: 'CREDIT_100', type: 'credit_pack', status: 'archived', credits: 100, krw: 105000, sortOrder: 3 }
  ];
  const live = creditCatalog.applyPublicCreditCatalog(products);
  assert.equal(live.some((p) => p.productId === 'CREDIT_10'), true);
  assert.equal(live.some((p) => p.productId === 'CREDIT_5'), false);
  assert.equal(live.some((p) => p.productId === 'CREDIT_100'), false);
  assert.equal(creditCatalog.isCreditPackId('CREDIT_10'), true);
});
check('server_credit_id_and_hydrate_aliases', () => {
  assert.equal(catalogEngine.isCreditProductId('CREDIT_10'), true);
  assert.equal(catalogEngine.isCreditProductId('CREDIT_0'), false);
  assert.equal(catalogEngine.isCreditProductId('CREDIT_1234567'), false);
  assert.equal(catalogEngine.isLicenseProductId('CREDIT_10'), false);
  const hydrated = catalogEngine.hydrateProduct('CREDIT_10', {
    productId: 'CREDIT_10',
    type: 'credit_pack',
    creditAmount: 10,
    listPriceKrw: 7900,
    status: 'active',
    nameKo: 'Credit 10'
  });
  assert.equal(hydrated.creditAmount, 10);
  assert.equal(hydrated.listPriceKrw, 7900);
  assert.equal(hydrated.status, 'active');
  const paused = catalogEngine.hydrateProduct('CREDIT_10', { status: 'paused', creditAmount: 10, listPriceKrw: 7900 });
  assert.equal(paused.status, 'paused');
  const charge = catalogEngine.computeCharge(hydrated, [], new Date(), 'KRW');
  assert.equal(charge.ok, true);
  assert.equal(charge.effectivePrice, 7900);
  assert.equal(charge.creditAmount, 10);
});
check('credit_kill_switch_reads_env', () => {
  const prev = process.env.CREDIT_SALES_KILL_SWITCH;
  process.env.CREDIT_SALES_KILL_SWITCH = 'true';
  assert.equal(creditPurchase.creditSalesKillSwitchOn(), true);
  process.env.CREDIT_SALES_KILL_SWITCH = 'false';
  assert.equal(creditPurchase.creditSalesKillSwitchOn(), false);
  if (prev == null) delete process.env.CREDIT_SALES_KILL_SWITCH;
  else process.env.CREDIT_SALES_KILL_SWITCH = prev;
});
check('firestore_lifetime_doc_id_unchanged', () => {
  assert.equal(browser.firestoreDocId('LIFETIME'), 'lifetime');
  assert.equal(browser.firestoreDocId('CREDIT_10'), 'CREDIT_10');
});

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exitCode = 1;
