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

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exitCode = 1;
