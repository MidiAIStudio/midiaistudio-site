'use strict';

/** Checkout region → charge currency. Catalog KRW is SoT; USD is FX-derived. */
function regionChargeCurrency(regionCode) {
  return String(regionCode || '').toUpperCase() === 'KR' ? 'KRW' : 'USD';
}

function isPortOneRegion(regionCode) {
  return regionChargeCurrency(regionCode) === 'KRW';
}

function paypalCurrencyErrorMessage(lang) {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('en')) return 'The PayPal payment currency is invalid.';
  if (l.startsWith('ja')) return 'PayPal決済通貨が正しくありません。';
  return 'PayPal 결제 통화가 올바르지 않습니다.';
}

function requestUiLang(req) {
  const al = String((req && req.headers && (req.headers['accept-language'] || req.headers['Accept-Language'])) || '');
  if (/^ja\b|ja[-_]/i.test(al)) return 'ja';
  if (/^en\b|en[-_]/i.test(al)) return 'en';
  return 'ko';
}

/**
 * Quote currency follows the requested checkout currency, not catalog region.currency
 * or legacy priceUsd fields.
 */
function usdQuoteFromCharge(product) {
  const cur = String((product && product.currency) || '').toUpperCase();
  if (cur !== 'USD') {
    return { ok: false, code: 'QUOTE_CURRENCY' };
  }
  const payUsd = Number(
    product.payAmountUsd != null ? product.payAmountUsd : product.amount
  );
  if (!Number.isFinite(payUsd) || payUsd <= 0) {
    return { ok: false, code: 'QUOTE_AMOUNT' };
  }
  return {
    ok: true,
    currency: 'USD',
    finalPrice: payUsd,
    payAmountUsd: payUsd
  };
}

module.exports = {
  regionChargeCurrency,
  isPortOneRegion,
  paypalCurrencyErrorMessage,
  requestUiLang,
  usdQuoteFromCharge
};
