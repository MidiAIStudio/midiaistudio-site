/**
 * Offline SoT checks: hydrate/seed must not overwrite existing Firestore prices.
 * Run: node scripts/check_price_sot.js
 */
const path = require('path');
const catalog = require(path.join(__dirname, '..', 'functions', 'catalogEngine.js'));

let failed = 0;
function ok(label) {
  console.log('PASS', label);
}
function fail(label, detail) {
  failed += 1;
  console.error('FAIL', label, detail || '');
}

// 1) Existing doc price preserved (admin edit)
{
  const h = catalog.hydrateProduct('PASS_30D', {
    productId: 'PASS_30D',
    type: 'full_pass',
    listPriceKrw: 21900,
    status: 'active',
    durationDays: 30
  });
  if (h.listPriceKrw === 21900) ok('hydrate keeps admin PASS_30D 21900');
  else fail('hydrate overwrote PASS_30D', h.listPriceKrw);
}

// 2) KR region only (legacy admin write) still authoritative
{
  const h = catalog.hydrateProduct('PASS_7D', {
    productId: 'PASS_7D',
    type: 'full_pass',
    regions: { KR: { listPrice: 8900, salePrice: 8900, currency: 'KRW' } }
  });
  if (h.listPriceKrw === 8900) ok('hydrate uses regions.KR when listPriceKrw missing');
  else fail('hydrate KR region', h.listPriceKrw);
}

// 3) Missing price falls back to seed (create path only)
{
  const h = catalog.hydrateProduct('PASS_90D', {
    productId: 'PASS_90D',
    type: 'full_pass'
  });
  if (h.listPriceKrw === 49900) ok('hydrate missing price → seed 49900');
  else fail('hydrate seed fallback', h.listPriceKrw);
}

// 4) Lifetime must NOT force 130000 → 129000
{
  const h = catalog.hydrateProduct('lifetime', {
    productId: 'LIFETIME',
    type: 'lifetime',
    listPriceKrw: 130000,
    plan: 'lifetime'
  });
  if (h.listPriceKrw === 130000) ok('hydrate keeps legacy Lifetime 130000');
  else fail('hydrate forced Lifetime rewrite', h.listPriceKrw);
}

// 5) Lifetime admin edit 125000 preserved
{
  const h = catalog.hydrateProduct('lifetime', {
    productId: 'LIFETIME',
    listPriceKrw: 125000
  });
  if (h.listPriceKrw === 125000) ok('hydrate keeps Lifetime 125000');
  else fail('hydrate Lifetime 125000', h.listPriceKrw);
}

// 6) computeCharge uses listPriceKrw (not seed)
{
  const product = catalog.hydrateProduct('PASS_30D', {
    productId: 'PASS_30D',
    type: 'full_pass',
    listPriceKrw: 21900,
    status: 'active'
  });
  const charge = catalog.computeCharge(product, [], new Date(), 'KRW');
  if (charge.ok && charge.effectivePrice === 21900 && charge.basePrice === 21900) {
    ok('computeCharge uses Firestore listPriceKrw 21900');
  } else {
    fail('computeCharge', charge);
  }
}

// 7) Seed constants only (document create defaults) — not production SoT
{
  const seed = catalog.seedById('PASS_30D');
  if (seed && seed.listPriceKrw === 19900) ok('seed PASS_30D default 19900 (create-only)');
  else fail('seed PASS_30D', seed && seed.listPriceKrw);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll price SoT checks passed');
process.exit(0);
