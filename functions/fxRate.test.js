'use strict';

const assert = require('assert');
const fx = require('./fxRate');
const catalogEngine = require('./catalogEngine');

function testRounding() {
  assert.strictEqual(fx.krwToUsd(20930, 1400), 14.95);
  assert.strictEqual(fx.krwToUsd(29900, 1400), 21.36);
  assert.strictEqual(fx.krwToUsd(130000, 1400), 92.86);
  assert.strictEqual(fx.krwToUsd(19900, 1400), 14.21);
  assert.ok(fx.usdAmountsMatch('14.95', 14.95));
  console.log('ok rounding');
}

function testChargeUsesEffectiveKrw() {
  const product = {
    productId: 'PASS_30D',
    type: 'full_pass',
    listPriceKrw: 29900,
    listPriceUsd: 91,
    status: 'active',
    productVersion: 1
  };
  const promo = [{
    enabled: true,
    productIds: ['PASS_30D'],
    type: 'percent',
    value: 30,
    startsAt: '2020-01-01T00:00:00.000Z',
    endsAt: '2099-01-01T00:00:00.000Z',
    promotionId: 'p30'
  }];
  const now = new Date('2026-08-23T00:00:00.000Z');
  const krw = catalogEngine.computeCharge(product, promo, now, 'KRW');
  assert.strictEqual(krw.ok, true);
  assert.strictEqual(krw.effectivePrice, 20930);
  const usd = catalogEngine.computeCharge(product, promo, now, 'USD', { fxRate: 1400 });
  assert.strictEqual(usd.ok, true);
  assert.strictEqual(usd.effectivePrice, 14.95);
  assert.strictEqual(usd.basePrice, 21.36);
  assert.strictEqual(usd.listPriceKrw, 29900);
  assert.strictEqual(usd.effectivePriceKrw, 20930);
  assert.notStrictEqual(usd.effectivePrice, 91);
  assert.notStrictEqual(usd.effectivePrice, fx.krwToUsd(29900, 1400) * 0.7);

  const life = catalogEngine.computeCharge({
    productId: 'LIFETIME',
    listPriceKrw: 130000,
    listPriceUsd: 91,
    status: 'active'
  }, [], now, 'USD', { fxRate: 1400 });
  assert.strictEqual(life.effectivePrice, 92.86);

  const noFx = catalogEngine.computeCharge(product, [], now, 'USD', {});
  assert.strictEqual(noFx.ok, false);
  assert.strictEqual(noFx.code, 'FX_UNAVAILABLE');
  console.log('ok charge krw sot');
}

function testQuoteSnapshotStable() {
  const now = new Date('2026-08-23T00:00:00.000Z');
  const product = { productId: 'PASS_30D', listPriceKrw: 20930, status: 'active' };
  const a = catalogEngine.computeCharge(product, [], now, 'USD', { fxRate: 1400 });
  const b = catalogEngine.computeCharge(product, [], now, 'USD', { fxRate: 1500 });
  assert.strictEqual(a.effectivePrice, 14.95);
  assert.ok(b.effectivePrice !== a.effectivePrice);
  const quoteUsd = a.payAmountUsd;
  assert.strictEqual(quoteUsd, 14.95);
  assert.ok(fx.usdAmountsMatch(quoteUsd, a.effectivePrice));
  console.log('ok quote snapshot');
}

async function testCacheFallback() {
  const store = { rate: 1400, source: 'open.er-api.com', fetchedAt: new Date('2026-08-01T00:00:00.000Z').toISOString() };
  const db = {
    collection() {
      return {
        doc() {
          return {
            async get() { return { exists: true, data: () => store }; },
            async set() { /* ignore */ }
          };
        }
      };
    }
  };
  const failFetch = async () => { throw new Error('network down'); };
  const now = new Date('2026-08-23T00:00:00.000Z');
  const stale = await fx.getUsdKrwRate(db, { now, fetchImpl: failFetch });
  assert.strictEqual(stale.ok, true);
  assert.strictEqual(stale.rate, 1400);
  assert.strictEqual(stale.cache, 'stale');

  const emptyDb = {
    collection() {
      return {
        doc() {
          return {
            async get() { return { exists: false, data: () => ({}) }; },
            async set() { /* ignore */ }
          };
        }
      };
    }
  };
  const none = await fx.getUsdKrwRate(emptyDb, { now, fetchImpl: failFetch });
  assert.strictEqual(none.ok, false);
  assert.strictEqual(none.code, 'FX_UNAVAILABLE');

  const injected = await fx.getUsdKrwRate(emptyDb, { now, injectRate: 1400 });
  assert.strictEqual(injected.ok, true);
  assert.strictEqual(injected.rate, 1400);
  console.log('ok fx cache fallback');
}

function testQuoteTtl() {
  const now = new Date('2026-08-23T12:00:00.000Z');
  const quote = {
    uid: 'u1',
    productId: 'PASS_30D',
    status: 'open',
    expiresAt: new Date('2026-08-23T11:00:00.000Z')
  };
  const expired = catalogEngine.quoteIsValid(quote, { uid: 'u1', productId: 'PASS_30D', now });
  assert.strictEqual(expired.ok, false);
  const open = catalogEngine.quoteIsValid({
    ...quote,
    expiresAt: new Date('2026-08-23T12:20:00.000Z')
  }, { uid: 'u1', productId: 'PASS_30D', now });
  assert.strictEqual(open.ok, true);
  console.log('ok quote ttl');
}

(async () => {
  testRounding();
  testChargeUsesEffectiveKrw();
  testQuoteSnapshotStable();
  testQuoteTtl();
  await testCacheFallback();
  console.log('all fxRate tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
