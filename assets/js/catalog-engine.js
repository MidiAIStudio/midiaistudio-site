/**
 * Canonical product / discount / quote math (browser).
 * Charge amounts are still verified by Cloud Functions.
 */
export const QUOTE_TTL_MINUTES = 20;
export const PRICE_CHANGE_WARN_RATIO = 0.30;
export const CREDIT_CHANGE_WARN_RATIO = 5;
export const LIFETIME_DOC_ID = 'lifetime';
export const CANONICAL_IDS = ['CREDIT_5', 'CREDIT_30', 'CREDIT_100', 'PASS_7D', 'PASS_30D', 'PASS_90D', 'LIFETIME'];
export const PASS_DURATION_DAYS = { PASS_7D: 7, PASS_30D: 30, PASS_90D: 90 };
export const PASS_PRODUCT_IDS = ['PASS_7D', 'PASS_30D', 'PASS_90D'];

const LEGACY_ALIASES = {
  POINT_5: 'CREDIT_5',
  POINT_30: 'CREDIT_30',
  POINT_100: 'CREDIT_100',
  lifetime: 'LIFETIME',
  LIFETIME: 'LIFETIME'
};

export function emptyDiscount() {
  return { enabled: false, type: 'percent', value: 0, startsAt: '', endsAt: '' };
}

export const SEED_PRODUCTS = [
  {
    productId: 'CREDIT_5',
    type: 'credit_pack',
    nameKo: '5 Credits',
    nameEn: '5 Credits',
    nameJa: '5 Credits',
    descriptionKo: '소량 / 첫 구매',
    descriptionEn: 'Small pack / first purchase',
    descriptionJa: '少量 / はじめて',
    creditAmount: 5,
    entitlement: 'credits',
    listPriceKrw: 6500,
    listPriceUsd: null,
    status: 'paused',
    sortOrder: 1,
    badge: '',
    packSavePercent: null,
    productVersion: 1,
    orderNameKo: 'MidiAI Studio 5 크레딧',
    orderNameEn: 'MidiAI Studio 5 Credits',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'CREDIT_30',
    type: 'credit_pack',
    nameKo: '30 Credits',
    nameEn: '30 Credits',
    nameJa: '30 Credits',
    descriptionKo: '추천',
    descriptionEn: 'Recommended',
    descriptionJa: 'おすすめ',
    creditAmount: 30,
    entitlement: 'credits',
    listPriceKrw: 35000,
    listPriceUsd: null,
    status: 'paused',
    sortOrder: 2,
    badge: 'recommended',
    packSavePercent: null,
    productVersion: 1,
    orderNameKo: 'MidiAI Studio 30 크레딧',
    orderNameEn: 'MidiAI Studio 30 Credits',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'CREDIT_100',
    type: 'credit_pack',
    nameKo: '100 Credits',
    nameEn: '100 Credits',
    nameJa: '100 Credits',
    descriptionKo: '대량',
    descriptionEn: 'Bulk pack',
    descriptionJa: 'まとめ買い',
    creditAmount: 100,
    entitlement: 'credits',
    listPriceKrw: 105000,
    listPriceUsd: null,
    status: 'paused',
    sortOrder: 3,
    badge: 'best',
    packSavePercent: 19,
    productVersion: 1,
    orderNameKo: 'MidiAI Studio 100 크레딧',
    orderNameEn: 'MidiAI Studio 100 Credits',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'PASS_7D',
    type: 'full_pass',
    nameKo: '7일 Full',
    nameEn: '7-Day Full Pass',
    nameJa: '7日 Full',
    descriptionKo: '7일 동안 모든 Full 기능을 제한 없이 이용',
    descriptionEn: 'Unlimited Full features for 7 days',
    descriptionJa: '7日間すべてのFull機能を制限なく利用',
    creditAmount: 0,
    entitlement: 'full_pass',
    durationDays: 7,
    listPriceKrw: 7900,
    listPriceUsd: null,
    status: 'active',
    sortOrder: 5,
    badge: '',
    packSavePercent: null,
    productVersion: 1,
    orderNameKo: 'MidiAI Studio 7일 Full 이용권',
    orderNameEn: 'MidiAI Studio 7-Day Full Pass',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'PASS_30D',
    type: 'full_pass',
    nameKo: '30일 Full',
    nameEn: '30-Day Full Pass',
    nameJa: '30日 Full',
    descriptionKo: '30일 동안 모든 Full 기능을 제한 없이 이용',
    descriptionEn: 'Unlimited Full features for 30 days',
    descriptionJa: '30日間すべてのFull機能を制限なく利用',
    creditAmount: 0,
    entitlement: 'full_pass',
    durationDays: 30,
    listPriceKrw: 19900,
    listPriceUsd: null,
    status: 'active',
    sortOrder: 6,
    badge: 'recommended',
    packSavePercent: null,
    productVersion: 1,
    orderNameKo: 'MidiAI Studio 30일 Full 이용권',
    orderNameEn: 'MidiAI Studio 30-Day Full Pass',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'PASS_90D',
    type: 'full_pass',
    nameKo: '90일 Full',
    nameEn: '90-Day Full Pass',
    nameJa: '90日 Full',
    descriptionKo: '90일 동안 모든 Full 기능을 제한 없이 이용',
    descriptionEn: 'Unlimited Full features for 90 days',
    descriptionJa: '90日間すべてのFull機能を制限なく利用',
    creditAmount: 0,
    entitlement: 'full_pass',
    durationDays: 90,
    listPriceKrw: 49900,
    listPriceUsd: null,
    status: 'active',
    sortOrder: 7,
    badge: '',
    packSavePercent: 16,
    productVersion: 1,
    orderNameKo: 'MidiAI Studio 90일 Full 이용권',
    orderNameEn: 'MidiAI Studio 90-Day Full Pass',
    productDiscount: emptyDiscount()
  },
  {
    productId: 'LIFETIME',
    docId: LIFETIME_DOC_ID,
    type: 'lifetime',
    nameKo: 'Lifetime Full',
    nameEn: 'Lifetime Full',
    nameJa: 'Lifetime Full',
    descriptionKo: '영구 Full 이용 · 변환 횟수 제한 없음',
    descriptionEn: 'Lifetime Full access · unlimited conversions',
    descriptionJa: '永久Full利用 · 変換回数制限なし',
    creditAmount: 0,
    entitlement: 'lifetime',
    listPriceKrw: 129000,
    listPriceUsd: 89,
    status: 'active',
    sortOrder: 4,
    badge: '',
    packSavePercent: null,
    productVersion: 1,
    orderNameKo: 'MidiAI Studio Lifetime License',
    orderNameEn: 'MidiAI Studio Lifetime License',
    productDiscount: emptyDiscount()
  }
];

const PRODUCT_ID_RE = /^(CREDIT_[1-9][0-9]{0,5}|PASS_(7|30|90)D|LIFETIME)$/i;

export function normalizeProductId(productId) {
  const key = String(productId || '').trim();
  if (LEGACY_ALIASES[key]) return LEGACY_ALIASES[key];
  const upper = key.toUpperCase();
  if (LEGACY_ALIASES[upper]) return LEGACY_ALIASES[upper];
  if (key === LIFETIME_DOC_ID || upper === 'LIFETIME') return 'LIFETIME';
  return upper;
}


export function isPassProductId(productId) {
  const pid = normalizeProductId(productId);
  return Object.prototype.hasOwnProperty.call(PASS_DURATION_DAYS, pid);
}

export function isLicenseProductId(productId) {
  const pid = normalizeProductId(productId);
  return pid === 'LIFETIME' || isPassProductId(pid);
}

export function getPassProductsFromCatalog(catalogProducts = []) {
  const fromLive = (catalogProducts || []).filter(
    (p) => p && (p.type === 'full_pass' || isPassProductId(p.productId || p.id))
  );
  if (fromLive.length) {
    return fromLive.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  }
  return SEED_PRODUCTS.filter((p) => p.type === 'full_pass');
}


export function firestoreDocId(productId) {
  const pid = normalizeProductId(productId);
  return pid === 'LIFETIME' ? LIFETIME_DOC_ID : pid;
}

export function isSeedProduct(productId) {
  return CANONICAL_IDS.includes(normalizeProductId(productId));
}

export function parseTime(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value?.toDate === 'function') {
    try { return value.toDate(); } catch (_) { /* ignore */ }
  }
  if (typeof value === 'object' && (value.seconds != null || value._seconds != null)) {
    return new Date(Number(value.seconds || value._seconds) * 1000);
  }
  const text = String(value).trim();
  if (!text) return null;
  const dt = new Date(text);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function windowStatus(enabled, startsAt, endsAt, now = new Date()) {
  if (!enabled) return 'inactive';
  const start = parseTime(startsAt);
  const end = parseTime(endsAt);
  if (start && now < start) return 'scheduled';
  if (end && now >= end) return 'ended';
  return 'active';
}

export function isWindowActive(enabled, startsAt, endsAt, now = new Date()) {
  return windowStatus(enabled, startsAt, endsAt, now) === 'active';
}

export function applyDiscount(basePrice, discountType, value) {
  const base = Math.round(Number(basePrice) || 0);
  const kind = String(discountType || 'percent').toLowerCase();
  const amount = Number(value);
  if (!base || !Number.isFinite(amount) || amount <= 0) return base;
  let sale = base;
  if (kind === 'percent' || kind === 'rate' || kind === 'pct') {
    if (amount >= 100) return base;
    sale = Math.round(base * (100 - amount) / 100);
  } else if (kind === 'amount' || kind === 'fixed' || kind === 'flat') {
    if (amount >= base) return base;
    sale = Math.round(base - amount);
  } else {
    return base;
  }
  return Math.max(1, Math.min(sale, base - 1));
}

export function displayDiscountPercent(basePrice, salePrice) {
  const base = Number(basePrice) || 0;
  const sale = Number(salePrice) || 0;
  if (!base || !sale || sale >= base) return 0;
  return Math.round((1 - sale / base) * 100);
}

export function unitPrice(price, credits) {
  const c = Number(credits) || 0;
  if (c <= 0) return null;
  return Math.round(Number(price) / c);
}

export function packSavingsPercent(product, starterUnit) {
  if (product?.packSavePercent != null && product.packSavePercent !== '') {
    return Number(product.packSavePercent);
  }
  const credits = Number(product?.creditAmount) || 0;
  const price = Number(product?.listPriceKrw) || 0;
  if (!starterUnit || credits <= 0 || price <= 0) return null;
  const unit = price / credits;
  if (unit >= starterUnit) return null;
  return Math.round((1 - unit / starterUnit) * 100);
}

export function productTargets(promo, productId) {
  const pid = normalizeProductId(productId);
  const ids = promo?.productIds || [];
  return ids.some((item) => normalizeProductId(item) === pid);
}

function discountSpecForProduct(promo, productId, currency = 'KRW') {
  const pid = normalizeProductId(productId);
  const overrides = promo?.productOverrides || {};
  const override = overrides[pid] || overrides[productId] || {};
  if (String(currency).toUpperCase() === 'USD') {
    const usd = override.usd || (promo?.usdEnabled === true
      ? { type: promo.usdType || promo.type, value: promo.usdValue }
      : null);
    if (!usd) return null;
    return {
      type: usd.type || 'percent',
      value: usd.value,
      promotionId: promo.promotionId || promo.id,
      source: 'promotion'
    };
  }
  return {
    type: override.type || promo.type || 'percent',
    value: override.value != null ? override.value : promo.value,
    promotionId: promo.promotionId || promo.id,
    source: 'promotion'
  };
}

function productDiscountCandidate(product, currency, now) {
  let raw = product?.productDiscount || {};
  if (String(currency).toUpperCase() === 'USD') {
    raw = product?.productDiscountUsd || {};
    if (raw.enabled !== true) return null;
  } else if (raw.enabled !== true) return null;
  if (!isWindowActive(true, raw.startsAt, raw.endsAt, now)) return null;
  return {
    type: raw.type || 'percent',
    value: raw.value,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    source: 'product',
    promotionId: ''
  };
}

export function pickEffectiveDiscount(product, promotions = [], now = new Date(), currency = 'KRW') {
  const pid = normalizeProductId(product?.productId || product?.id);
  const candidates = [];
  const own = productDiscountCandidate(product, currency, now);
  if (own) candidates.push(own);
  for (const promo of promotions || []) {
    if (promo.archived === true || promo.enabled !== true) continue;
    if (!productTargets(promo, pid)) continue;
    if (!isWindowActive(true, promo.startsAt, promo.endsAt, now)) continue;
    const spec = discountSpecForProduct(promo, pid, currency);
    if (!spec || spec.value == null || spec.value === '' || Number(spec.value) === 0) continue;
    candidates.push({ ...spec, startsAt: promo.startsAt, endsAt: promo.endsAt });
  }
  if (!candidates.length) return { chosen: null, candidates };
  candidates.sort((a, b) => {
    const rankA = a.source === 'product' ? 0 : 1;
    const rankB = b.source === 'product' ? 0 : 1;
    if (rankA !== rankB) return rankA - rankB;
    const sa = parseTime(a.startsAt)?.getTime() || 0;
    const sb = parseTime(b.startsAt)?.getTime() || 0;
    if (sa !== sb) return sa - sb;
    return String(a.promotionId || '').localeCompare(String(b.promotionId || ''));
  });
  return { chosen: candidates[0], candidates };
}

export function computeCharge(product, promotions = [], now = new Date(), currency = 'KRW') {
  const cur = String(currency || 'KRW').toUpperCase();
  const status = String(product?.status || 'active');
  if (status === 'paused' || status === 'archived' || status === 'disabled') {
    return {
      ok: false,
      code: 'SALE_DISABLED',
      basePrice: cur === 'USD' ? product?.listPriceUsd : Number(product?.listPriceKrw || 0),
      effectivePrice: null,
      currency: cur,
      status
    };
  }
  if (cur === 'USD') {
    if (product?.listPriceUsd == null || product.listPriceUsd === '') {
      return { ok: false, code: 'USD_UNSET', currency: 'USD', paypalEnabled: false };
    }
    const base = Number(product.listPriceUsd);
    const { chosen, candidates } = pickEffectiveDiscount(product, promotions, now, 'USD');
    let sale = base;
    if (chosen) {
      const kind = String(chosen.type || 'percent').toLowerCase();
      if (kind === 'amount' || kind === 'fixed' || kind === 'flat') {
        sale = Math.max(0.01, Math.round((base - Number(chosen.value || 0)) * 100) / 100);
      } else {
        sale = Math.round(base * (100 - Number(chosen.value || 0)) / 100 * 100) / 100;
      }
    }
    return {
      ok: true,
      basePrice: base,
      effectivePrice: sale,
      currency: 'USD',
      discount: chosen,
      discountPercent: chosen ? displayDiscountPercent(Math.round(base * 100), Math.round(sale * 100)) : 0,
      discountEndsAt: chosen?.endsAt || '',
      stacked: candidates.length > 1,
      paypalEnabled: true,
      productVersion: Number(product.productVersion || product.pricingVersion || 1),
      creditAmount: Number(product.creditAmount || 0),
      entitlement: product.entitlement || product.type
    };
  }
  const base = Math.round(Number(product?.listPriceKrw || 0));
  const { chosen, candidates } = pickEffectiveDiscount(product, promotions, now, 'KRW');
  const sale = chosen ? applyDiscount(base, chosen.type, chosen.value) : base;
  const credits = Number(product?.creditAmount || 0);
  return {
    ok: true,
    basePrice: base,
    effectivePrice: sale,
    currency: 'KRW',
    discount: chosen,
    discountPercent: chosen ? displayDiscountPercent(base, sale) : 0,
    discountEndsAt: chosen?.endsAt || '',
    stacked: candidates.length > 1,
    paypalEnabled: product?.listPriceUsd != null && product.listPriceUsd !== '',
    productVersion: Number(product?.productVersion || product?.pricingVersion || 1),
    creditAmount: credits,
    entitlement: product?.entitlement || product?.type,
    unitPrice: unitPrice(sale, credits),
    listUnitPrice: unitPrice(base, credits)
  };
}

export function overlappingWindows(aStart, aEnd, bStart, bEnd) {
  const a0 = parseTime(aStart);
  const a1 = parseTime(aEnd);
  const b0 = parseTime(bStart);
  const b1 = parseTime(bEnd);
  if (!a0 || !a1 || !b0 || !b1) return true;
  return a0 < b1 && b0 < a1;
}

export function findDiscountConflicts(products, promotions, ignorePromotionId = '') {
  const conflicts = [];
  const live = (promotions || []).filter((p) => (
    p.enabled === true
    && p.archived !== true
    && normalizeProductId(p.promotionId || p.id) !== normalizeProductId(ignorePromotionId)
    && ['scheduled', 'active'].includes(windowStatus(true, p.startsAt, p.endsAt))
  ));
  for (const product of products || []) {
    const pid = normalizeProductId(product.productId || product.id);
    const windows = [];
    const pd = product.productDiscount || {};
    if (pd.enabled === true && ['scheduled', 'active'].includes(windowStatus(true, pd.startsAt, pd.endsAt))) {
      windows.push(['product', pd.startsAt, pd.endsAt]);
    }
    for (const promo of live.filter((p) => productTargets(p, pid))) {
      windows.push([String(promo.promotionId || promo.id || 'promo'), promo.startsAt, promo.endsAt]);
    }
    for (let i = 0; i < windows.length; i += 1) {
      for (let j = i + 1; j < windows.length; j += 1) {
        if (overlappingWindows(windows[i][1], windows[i][2], windows[j][1], windows[j][2])) {
          conflicts.push({ productId: pid, left: windows[i][0], right: windows[j][0], code: 'CONFLICT' });
        }
      }
    }
  }
  return conflicts;
}

function validateDiscount(disc, basePrice) {
  const errors = [];
  const kind = String(disc?.type || 'percent').toLowerCase();
  const value = Number(disc?.value || 0);
  if (kind === 'percent' || kind === 'rate' || kind === 'pct') {
    if (!(value > 0 && value < 100)) errors.push('정률 할인은 0% 초과 100% 미만이어야 합니다.');
  } else if (kind === 'amount' || kind === 'fixed' || kind === 'flat') {
    if (!(value > 0 && value < Number(basePrice || 0))) errors.push('정액 할인은 0원 초과 정가 미만이어야 합니다.');
  } else {
    errors.push('할인 방식이 올바르지 않습니다.');
  }
  const start = parseTime(disc?.startsAt);
  const end = parseTime(disc?.endsAt);
  if (!start || !end) errors.push('할인 시작/종료 일시가 필요합니다.');
  else if (end <= start) errors.push('할인 종료는 시작보다 뒤여야 합니다.');
  return errors;
}

export function validateProductFields(payload, { isNew = false } = {}) {
  const errors = [];
  const pid = String(payload?.productId || '').trim();
  if (isNew) {
    if (!pid) errors.push('상품 ID가 필요합니다.');
    else if (!PRODUCT_ID_RE.test(pid)) {
      errors.push('상품 ID는 CREDIT_숫자, PASS_7D/30D/90D 또는 LIFETIME 형식이어야 합니다.');
    }
  }
  const ptype = String(payload?.type || '').trim();
  const isPass = ptype === 'full_pass' || isPassProductId(pid);
  const isLife = ptype === 'lifetime' || pid === 'LIFETIME';
  const isCredit = ptype === 'credit_pack';

  if (!isPass && !isLife && !isCredit) {
    errors.push('상품 유형은 Credit Pack, 기간 이용권(full_pass) 또는 Lifetime만 가능합니다.');
  }

  if (isCredit) {
    if (!(Number(payload?.creditAmount) > 0)) errors.push('Credit 지급량은 1 이상 정수여야 합니다.');
    if (Number(payload?.durationDays || 0) > 0) errors.push('Credit 상품에는 이용 기간을 설정할 수 없습니다.');
  }

  if (isPass) {
    const days = Number(payload?.durationDays || 0);
    if (!(days > 0)) errors.push('기간 이용권은 이용 기간(일)이 1 이상이어야 합니다.');
    if (Number(payload?.creditAmount || 0) > 0) errors.push('기간 이용권에는 Credit 지급량을 설정할 수 없습니다.');
    const canon = PASS_DURATION_DAYS[normalizeProductId(pid)];
    if (canon != null && days !== canon) {
      errors.push(`${normalizeProductId(pid)}의 이용 기간은 ${canon}일로 고정되어 있습니다. 기간을 바꾸려면 새 Product ID를 만드세요.`);
    }
  }

  if (isLife) {
    if (Number(payload?.durationDays || 0) > 0) errors.push('Lifetime에는 이용 기간을 설정할 수 없습니다.');
    if (Number(payload?.creditAmount || 0) > 0) errors.push('Lifetime에는 Credit 지급량을 설정할 수 없습니다.');
  }

  const price = Number(payload?.listPriceKrw || 0);
  if (!(price > 0)) errors.push('정가는 1원 이상이어야 합니다.');
  if (payload?.listPriceUsd != null && payload.listPriceUsd !== '') {
    if (!(Number(payload.listPriceUsd) > 0)) errors.push('USD 가격은 0보다 커야 합니다.');
  }
  const disc = payload?.productDiscount || {};
  if (disc.enabled === true) errors.push(...validateDiscount(disc, price));
  return errors;
}

export function validatePromotionFields(payload, products) {
  const errors = [];
  if (!String(payload?.nameKo || payload?.name || '').trim()) errors.push('이벤트명이 필요합니다.');
  const ids = payload?.productIds || [];
  if (!ids.length) errors.push('대상 상품을 하나 이상 선택하세요.');
  const known = new Set((products || []).map((p) => normalizeProductId(p.productId || p.id)));
  ids.forEach((item) => {
    if (!known.has(normalizeProductId(item))) errors.push(`알 수 없는 대상 상품: ${item}`);
  });
  const kind = String(payload?.type || 'percent').toLowerCase();
  const value = Number(payload?.value || 0);
  if (kind === 'percent' || kind === 'rate' || kind === 'pct') {
    if (!(value > 0 && value < 100)) errors.push('정률 할인은 0% 초과 100% 미만이어야 합니다.');
  } else if (kind === 'amount' || kind === 'fixed' || kind === 'flat') {
    if (!(value > 0)) errors.push('정액 할인은 0원보다 커야 합니다.');
    ids.forEach((item) => {
      const prod = (products || []).find((p) => normalizeProductId(p.productId || p.id) === normalizeProductId(item));
      if (prod && value >= Number(prod.listPriceKrw || 0)) errors.push(`${item} 정액 할인이 정가 이상입니다.`);
    });
  } else {
    errors.push('할인 방식이 올바르지 않습니다.');
  }
  const start = parseTime(payload?.startsAt);
  const end = parseTime(payload?.endsAt);
  if (!start || !end) errors.push('이벤트 시작/종료 일시가 필요합니다.');
  else if (end <= start) errors.push('이벤트 종료는 시작보다 뒤여야 합니다.');
  const overrides = payload?.productOverrides || {};
  Object.entries(overrides).forEach(([pid, spec]) => {
    const prod = (products || []).find((p) => normalizeProductId(p.productId || p.id) === normalizeProductId(pid));
    if (!prod) return;
    errors.push(...validateDiscount({ enabled: true, ...spec, startsAt: payload.startsAt, endsAt: payload.endsAt }, Number(prod.listPriceKrw || 0)));
  });
  return errors;
}

export function priceChangeWarning(oldPrice, newPrice) {
  const oldN = Number(oldPrice);
  const newN = Number(newPrice);
  if (!(oldN > 0) || !Number.isFinite(newN)) return '';
  const ratio = Math.abs(newN - oldN) / oldN;
  if (ratio >= PRICE_CHANGE_WARN_RATIO) return `가격이 ${Math.round(ratio * 100)}% 변경됩니다. 저장하시겠습니까?`;
  return '';
}

export function creditChangeWarning(oldAmount, newAmount) {
  const oldN = Number(oldAmount);
  const newN = Number(newAmount);
  if (!(oldN > 0) || !Number.isFinite(newN)) return '';
  if (newN <= 0) return 'Credit 지급량이 0입니다. 저장하시겠습니까?';
  if (newN >= oldN * CREDIT_CHANGE_WARN_RATIO || newN * CREDIT_CHANGE_WARN_RATIO <= oldN) {
    return `Credit 지급량이 ${oldN} → ${newN}으로 크게 바뀝니다. 저장하시겠습니까?`;
  }
  return '';
}

export function bumpVersion(product, { priceChanged, creditsChanged }) {
  const current = Number(product?.productVersion || product?.pricingVersion || 1);
  return (priceChanged || creditsChanged) ? current + 1 : current;
}

export function starterUnitFromProducts(products) {
  const five = (products || []).find((p) => normalizeProductId(p.productId || p.id) === 'CREDIT_5');
  if (!five) return 1300;
  return unitPrice(Number(five.listPriceKrw || 0), Number(five.creditAmount || 0));
}

export function publicProductView(product, promotions = [], now = new Date(), lang = 'ko', starterUnit = null) {
  const charge = computeCharge(product, promotions, now, 'KRW');
  const credits = Number(product?.creditAmount || 0);
  const badge = String(product?.badge || '');
  const suffix = lang === 'en' ? 'En' : lang === 'ja' ? 'Ja' : 'Ko';
  const name = product?.[`name${suffix}`] || product?.nameKo || product?.nameEn || '';
  const pid = normalizeProductId(product?.productId || product?.id);
  const type = product?.type || (isPassProductId(pid) ? 'full_pass' : (pid === 'LIFETIME' ? 'lifetime' : 'credit_pack'));
  const durationDays = Number(
    product?.durationDays != null
      ? product.durationDays
      : (PASS_DURATION_DAYS[pid] || 0)
  );
  return {
    productId: pid,
    type,
    name,
    credits,
    points: credits,
    creditAmount: credits,
    durationDays,
    entitlement: product?.entitlement || (type === 'full_pass' ? 'full_pass' : type),
    krw: charge.effectivePrice,
    listPriceKrw: charge.basePrice,
    basePrice: charge.basePrice,
    effectivePrice: charge.effectivePrice,
    discountPercent: charge.discountPercent || 0,
    discountEndsAt: charge.discountEndsAt || '',
    discountType: charge.discount?.type || '',
    discountValue: charge.discount?.value,
    promotionId: charge.discount?.promotionId || '',
    perUseKrw: charge.unitPrice,
    perUseApprox: !!(charge.unitPrice && credits && (Number(charge.effectivePrice) % credits !== 0)),
    savePercent: packSavingsPercent(product, starterUnit),
    badge,
    popular: ['recommended', 'popular', 'best'].includes(badge) || product?.popular === true,
    sortOrder: Number(product?.sortOrder || product?.order || 0),
    status: product?.status || 'active',
    productVersion: charge.productVersion || 1,
    orderNameKo: product?.orderNameKo || '',
    orderNameEn: product?.orderNameEn || '',
    usd: product?.listPriceUsd,
    paypalEnabled: !!charge.paypalEnabled,
    saleOk: charge.ok === true,
    saleCode: charge.code || ''
  };
}

export function activeHomepagePromotions(promotions, { now = new Date(), lifetimeOwned = false } = {}) {
  return (promotions || []).filter((promo) => {
    if (promo.enabled !== true || promo.archived === true || promo.homepagePopupEnabled !== true) return false;
    if (!isWindowActive(true, promo.startsAt, promo.endsAt, now)) return false;
    if (lifetimeOwned) return false;
    return true;
  });
}

export function localizePromo(promo, field, lang) {
  const suffix = lang === 'en' ? 'En' : lang === 'ja' ? 'Ja' : 'Ko';
  return String(promo?.[`${field}${suffix}`] || promo?.[`${field}Ko`] || promo?.[`${field}En`] || '');
}

export function formatKrw(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

export function toDatetimeLocalValue(value) {
  const dt = parseTime(value);
  if (!dt) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function fromDatetimeLocalValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString();
}

export function hydrateLegacyProduct(doc) {
  const id = normalizeProductId(doc?.id || doc?.productId);
  const seed = SEED_PRODUCTS.find((p) => p.productId === id) || {};
  const regions = doc?.regions || {};
  const kr = regions.KR || {};
  const global = regions.Global || {};
  let type = doc?.type || seed.type || (id === 'LIFETIME' ? 'lifetime' : (isPassProductId(id) ? 'full_pass' : 'credit_pack'));
  if (isPassProductId(id)) type = 'full_pass';
  if (id === 'LIFETIME') type = 'lifetime';
  const listPriceKrwRaw = (doc?.listPriceKrw != null && doc.listPriceKrw !== '')
    ? Number(doc.listPriceKrw)
    : (kr.listPrice != null && kr.listPrice !== ''
      ? Number(kr.listPrice)
      : Number(seed.listPriceKrw || 0));
  const listPriceKrw = Number.isFinite(listPriceKrwRaw) ? listPriceKrwRaw : 0;
  const durationDays = Number(
    doc?.durationDays != null
      ? doc.durationDays
      : (seed.durationDays != null ? seed.durationDays : (PASS_DURATION_DAYS[id] || 0))
  );
  let entitlement = doc?.entitlement || seed.entitlement;
  if (type === 'lifetime') entitlement = 'lifetime';
  else if (type === 'full_pass') entitlement = 'full_pass';
  else entitlement = entitlement || 'credits';
  return {
    ...seed,
    ...doc,
    productId: id,
    docId: id === 'LIFETIME' ? LIFETIME_DOC_ID : (doc?.id || id),
    type,
    nameKo: doc?.nameKo || (typeof doc?.name === 'string' ? doc.name : seed.nameKo),
    nameEn: doc?.nameEn || seed.nameEn,
    nameJa: doc?.nameJa || seed.nameJa,
    creditAmount: type === 'credit_pack' ? Number(doc?.creditAmount ?? seed.creditAmount ?? 0) : 0,
    durationDays: type === 'full_pass' ? durationDays : 0,
    entitlement,
    listPriceKrw,
    listPriceUsd: doc?.listPriceUsd != null ? doc.listPriceUsd : (global.listPrice != null ? global.listPrice : seed.listPriceUsd),
    status: doc?.status || 'active',
    sortOrder: Number(doc?.sortOrder ?? doc?.order ?? seed.sortOrder ?? 0),
    badge: doc?.badge || seed.badge || '',
    packSavePercent: doc?.packSavePercent != null ? doc.packSavePercent : seed.packSavePercent,
    productVersion: Number(doc?.productVersion || doc?.pricingVersion || seed.productVersion || 1),
    productDiscount: { ...emptyDiscount(), ...(doc?.productDiscount || {}) },
    regions: regions,
    hasPurchases: doc?.hasPurchases === true
  };
}

/** UI label for admin product type (not the raw internal type). */
export function productTypeLabel(typeOrProduct) {
  const raw = typeof typeOrProduct === 'string' ? typeOrProduct : (typeOrProduct?.type || '');
  const pid = typeof typeOrProduct === 'object' ? normalizeProductId(typeOrProduct?.productId || '') : '';
  if (raw === 'lifetime' || pid === 'LIFETIME') return 'Lifetime';
  if (raw === 'full_pass' || isPassProductId(pid)) return '기간 이용권';
  return 'Credit';
}

export function isCanonicalPassProductId(productId) {
  const pid = normalizeProductId(productId);
  return Object.prototype.hasOwnProperty.call(PASS_DURATION_DAYS, pid);
}

export function canonicalPassDurationDays(productId) {
  const pid = normalizeProductId(productId);
  return PASS_DURATION_DAYS[pid] || 0;
}
