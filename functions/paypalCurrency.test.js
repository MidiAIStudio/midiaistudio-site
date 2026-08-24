'use strict';

const assert = require('assert');
const {
  regionChargeCurrency,
  isPortOneRegion,
  paypalCurrencyErrorMessage,
  usdQuoteFromCharge
} = require('./paypalCurrency');

assert.strictEqual(regionChargeCurrency('KR'), 'KRW');
assert.strictEqual(regionChargeCurrency('Global'), 'USD');
assert.strictEqual(regionChargeCurrency('US'), 'USD');
assert.strictEqual(isPortOneRegion('KR'), true);
assert.strictEqual(isPortOneRegion('Global'), false);

const bad = usdQuoteFromCharge({ currency: 'KRW', amount: 20930, payAmountUsd: 14.95 });
assert.strictEqual(bad.ok, false);
assert.strictEqual(bad.code, 'QUOTE_CURRENCY');

const ok = usdQuoteFromCharge({ currency: 'USD', amount: '14.95', payAmountUsd: 14.95 });
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.currency, 'USD');
assert.strictEqual(ok.payAmountUsd, 14.95);

assert.ok(paypalCurrencyErrorMessage('en').includes('PayPal payment currency'));
assert.ok(paypalCurrencyErrorMessage('ja').includes('通貨'));
assert.ok(paypalCurrencyErrorMessage('ko').includes('통화'));

console.log('ok paypalCurrency');
