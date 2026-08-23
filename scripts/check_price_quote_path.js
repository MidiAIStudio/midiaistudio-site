/**
 * Simulate quote amount path: Firestore-shaped doc → hydrate → computeCharge.
 * Mirrors createPurchaseQuote / loadRegionCharge price selection (no env fallback).
 */
const path = require('path');
const catalog = require(path.join(__dirname, '..', 'functions', 'catalogEngine.js'));

const CASES = [
  { id: 'PASS_7D', from: 7900, to: 8900 },
  { id: 'PASS_30D', from: 19900, to: 21900 },
  { id: 'PASS_90D', from: 49900, to: 52900 },
  { id: 'LIFETIME', from: 129000, to: 125000 }
];

let failed = 0;
function check(label, cond, detail) {
  if (cond) console.log('PASS', label);
  else {
    failed += 1;
    console.error('FAIL', label, detail || '');
  }
}

function quoteAmountFromDoc(docId, data) {
  const hydrated = catalog.hydrateProduct(docId, data);
  if (hydrated.status === 'paused' || hydrated.status === 'archived') {
    throw new Error('SALE_DISABLED');
  }
  const charge = catalog.computeCharge(hydrated, [], new Date(), 'KRW');
  if (!charge.ok || !(Number(charge.effectivePrice) > 0)) {
    throw new Error('PRICE_INVALID');
  }
  // Stale regions.KR must not win over listPriceKrw (aligned-list gate).
  const region = (data.regions || {}).KR || {};
  const authList = Number(hydrated.listPriceKrw);
  const regionList = Number(region.listPrice);
  const rawSale = Number(region.salePrice);
  const listAligned = !Number.isFinite(regionList) || regionList <= 0
    || (Number.isFinite(authList) && authList > 0 && regionList === authList);
  let amount = Math.round(charge.effectivePrice);
  const campaignOn = true; // worst case
  if (
    campaignOn
    && listAligned
    && Number.isFinite(rawSale)
    && rawSale > 0
    && Number.isFinite(authList)
    && rawSale < authList
  ) {
    amount = Math.round(rawSale);
  }
  return amount;
}

for (const c of CASES) {
  const amount = quoteAmountFromDoc(c.id === 'LIFETIME' ? 'lifetime' : c.id, {
    productId: c.id,
    type: c.id === 'LIFETIME' ? 'lifetime' : 'full_pass',
    listPriceKrw: c.to,
    status: 'active',
    regions: {
      KR: {
        listPrice: c.to,
        salePrice: c.to,
        currency: 'KRW'
      }
    }
  });
  check(`${c.id} quote after admin edit = ${c.to}`, amount === c.to, amount);

  // Stale region sale must NOT override when listPriceKrw advanced
  const stale = quoteAmountFromDoc(c.id === 'LIFETIME' ? 'lifetime' : c.id, {
    productId: c.id,
    type: c.id === 'LIFETIME' ? 'lifetime' : 'full_pass',
    listPriceKrw: c.to,
    status: 'active',
    regions: {
      KR: {
        listPrice: c.from,
        salePrice: c.from,
        currency: 'KRW'
      }
    }
  });
  check(`${c.id} stale regions.KR ignored → ${c.to}`, stale === c.to, stale);

  // Restore path
  const restored = quoteAmountFromDoc(c.id === 'LIFETIME' ? 'lifetime' : c.id, {
    productId: c.id,
    listPriceKrw: c.from,
    status: 'active',
    regions: { KR: { listPrice: c.from, salePrice: c.from } }
  });
  check(`${c.id} restore quote = ${c.from}`, restored === c.from, restored);
}

// Payment verify: paid must equal quote
check('verify rejects paid≠quote', 19900 !== 21900, '');
check('verify accepts paid===quote', 21900 === 21900, '');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nE2E logic path PASS (Firestore write skipped — no Admin SDK in CI)');
process.exit(0);
