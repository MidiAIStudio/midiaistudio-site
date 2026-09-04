/**
 * Shared storefront HTML for purchase cards + homepage promo popup.
 * Used by purchase.html (app.js) and admin live preview (pricing-admin.js).
 */
import {
  formatKrw,
  formatUsd,
  krwToUsd,
  getCatalogFxRate,
  localizePromo,
  formatPromoUntilLabel,
  resolvePromotionProducts,
  promotionTargetIds,
  isCreditProductId
} from './catalog-engine.js?v=admin-preview-draft-2';

export { resolvePromotionProducts, promotionTargetIds, formatPromoUntilLabel };

export function escHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

function cardPriceCopy(view, lang) {
  const list = Number(view?.listPriceKrw || view?.basePrice || view?.krw || 0);
  const sale = Number(view?.effectivePrice != null ? view.effectivePrice : (view?.krw != null ? view.krw : list));
  if (lang !== 'en' && lang !== 'ja') {
    return { listText: formatKrw(list), saleText: formatKrw(sale), note: '' };
  }
  const note = lang === 'ja' ? '韓国価格を基準に自動換算' : 'Automatically converted from the KRW price';
  const rate = Number(getCatalogFxRate());
  let usdSale = view?.usd != null ? Number(view.usd) : null;
  let usdList = view?.usdList != null ? Number(view.usdList) : null;
  if ((!Number.isFinite(usdSale) || !Number.isFinite(usdList)) && Number.isFinite(rate) && rate > 0) {
    if (!Number.isFinite(usdList)) usdList = krwToUsd(list, rate);
    if (!Number.isFinite(usdSale)) usdSale = krwToUsd(sale, rate);
  }
  if (!Number.isFinite(usdSale) && !Number.isFinite(usdList)) {
    return {
      listText: '',
      saleText: lang === 'ja' ? '為替を読み込めません' : 'Exchange rate unavailable',
      note
    };
  }
  return {
    listText: Number.isFinite(usdList) ? formatUsd(usdList) : '',
    saleText: formatUsd(Number.isFinite(usdSale) ? usdSale : usdList),
    note
  };
}

export function purchaseCardFeaturesHtml(rows) {
  return `<ul class="purchase-plan-features">${(rows || []).map((row) => {
    const label = Array.isArray(row) ? row[0] : (row.label || '');
    const value = Array.isArray(row) ? row[1] : (row.value || '');
    return `<li><span>${escHtml(label)}</span><strong>${escHtml(value)}</strong></li>`;
  }).join('')}</ul>`;
}

export function storefrontUiCopy(lang = 'ko') {
  if (lang === 'en') {
    return {
      recommended: 'Recommended',
      buy: 'Buy',
      paused: 'This product is not currently for sale.',
      archived: 'Archived — hidden on the real purchase page',
      btnPaused: 'Unavailable',
      passFeatures: [
        ['Conversions', 'Unlimited'],
        ['Full features', 'Included'],
        ['Auto-renewal', 'None']
      ],
      lifeFeatures: [
        ['AI conversion', 'Unlimited'],
        ['Full features', 'Included'],
        ['Term', 'No expiry'],
        ['Auto-renewal', 'None']
      ],
      unitPass: (days) => `${days}-day Full Pass · one-time`,
      unitLife: 'Lifetime Full · one-time',
      unitCredit: '1 Credit = 1 Conversion',
      creditFeatures: [
        ['AI conversion', '1 Credit = 1 Conversion'],
        ['Term', 'No expiry'],
        ['Full pass', 'Not required']
      ],
      hideToday: "Don't show again",
      close: 'Close',
      defaultCta: 'See pricing'
    };
  }
  if (lang === 'ja') {
    return {
      recommended: 'おすすめ',
      buy: '購入',
      paused: '現在販売していない商品です。',
      archived: '保管商品 — 実際の購入ページでは非表示',
      btnPaused: '販売停止',
      passFeatures: [
        ['変換回数', '制限なし'],
        ['Full機能', '利用可'],
        ['自動更新', 'なし']
      ],
      lifeFeatures: [
        ['AI変換', '無制限'],
        ['Full機能', '利用可'],
        ['利用期間', '期限なし'],
        ['自動更新', 'なし']
      ],
      unitPass: (days) => `${days}日 Full 利用権 · 1回払い`,
      unitLife: 'Lifetime Full · 1回払い',
      unitCredit: '1クレジット = 1回変換',
      creditFeatures: [
        ['AI変換', '1クレジット = 1回変換'],
        ['利用期間', '制限なし'],
        ['Full利用権', '不要']
      ],
      hideToday: '表示しない',
      close: '閉じる',
      defaultCta: '料金を見る'
    };
  }
  return {
    recommended: '추천',
    buy: '구매하기',
    paused: '현재 판매하지 않는 상품입니다.',
    archived: '보관 상품 — 실제 구매 페이지에서는 숨겨짐',
    btnPaused: '판매중지',
    passFeatures: [
      ['변환 횟수', '제한 없음'],
      ['Full 기능', '이용 가능'],
      ['자동결제', '없음']
    ],
    lifeFeatures: [
      ['AI 변환', '무제한'],
      ['Full 기능', '이용 가능'],
      ['이용기간', '기간 제한 없음'],
      ['자동결제', '없음']
    ],
    unitPass: (days) => `${days}일 Full 이용권 · 1회 결제`,
    unitLife: 'Lifetime Full · 1회 결제',
    unitCredit: '1 크레딧 = 1회 변환',
    creditFeatures: [
      ['AI 변환', '1 크레딧 = 1회'],
      ['사용 기간', '제한 없음'],
      ['Full 이용권', '없이 사용 가능']
    ],
    hideToday: '다시 보지 않기',
    close: '닫기',
    defaultCta: '가격 보기'
  };
}

function isCreditView(view) {
  const type = String(view?.type || '');
  if (type === 'credit_pack' || type === 'credits') return true;
  return isCreditProductId(view?.productId || '');
}

function creditUsesLine(view) {
  const n = Number(view?.creditAmount || view?.credits || 0);
  return `${n} Credits`;
}

function productTitle(view, lang) {
  const days = Number(view?.durationDays || 0);
  if (lang === 'en') return view?.nameEn || (days ? `${days}-Day Full` : (view?.nameKo || view?.productId || ''));
  if (lang === 'ja') return view?.nameJa || (days ? `${days}日 Full` : (view?.nameKo || view?.productId || ''));
  return view?.nameKo || (days ? `${days}일 Full` : (view?.productId || ''));
}

function productUses(view, lang) {
  if (isCreditView(view)) {
    const extra = lang === 'en'
      ? String(view?.descriptionEn || '').trim()
      : lang === 'ja'
        ? String(view?.descriptionJa || '').trim()
        : String(view?.descriptionKo || '').trim();
    const amount = creditUsesLine(view);
    return extra ? `${amount} · ${extra}` : amount;
  }
  if (lang === 'en') {
    return view?.descriptionEn || 'Unlimited conversions · Full features · No auto-renewal';
  }
  if (lang === 'ja') {
    return view?.descriptionJa || '変換回数制限なし · Full機能 · 自動更新なし';
  }
  return view?.descriptionKo || '변환 횟수 제한 없음 · Full 기능 이용 · 자동결제 없음';
}

/**
 * @param {object} view publicProductView-shaped object
 * @param {object} options
 */
export function renderProductCard(view, options = {}) {
  const lang = options.lang || 'ko';
  const ui = options.ui || storefrontUiCopy(lang);
  const pid = String(view?.productId || '');
  const isLife = pid === 'LIFETIME' || view?.type === 'lifetime';
  const isCredit = !isLife && isCreditView(view);
  const status = String(view?.status || 'active');
  const selected = !!options.selected;
  const locked = !!options.locked;
  const previewMode = options.preview === true;
  const buyDisabled = previewMode || locked || options.buyDisabled === true
    || status === 'paused' || status === 'archived';

  if (previewMode && status === 'archived') {
    return `<article class="purchase-plan-card is-preview-archived" data-purchase-id="${escHtml(pid)}" data-preview-hl="card" role="listitem">
      <div class="purchase-plan-head"><h3 data-preview-hl="title">${escHtml(productTitle(view, lang))}</h3></div>
      <p class="purchase-plan-uses pricing-preview-archived-note" data-preview-hl="status">[${escHtml(ui.archived)}]</p>
      <div class="purchase-plan-price-block" data-preview-hl="price">
        <div class="purchase-plan-price-was purchase-plan-price-was-spacer" aria-hidden="true">&nbsp;</div>
        <div class="purchase-plan-price-row"><div class="purchase-plan-price">${escHtml(cardPriceCopy(view, lang).saleText)}</div></div>
      </div>
      <button type="button" class="purchase-plan-buy" disabled aria-disabled="true">${escHtml(ui.btnPaused)}</button>
    </article>`;
  }

  const list = Number(view?.listPriceKrw || view?.basePrice || view?.krw || 0);
  const sale = Number(view?.effectivePrice != null ? view.effectivePrice : (view?.krw != null ? view.krw : list));
  const saleOk = view?.saleOk !== false && status === 'active';
  const discounted = saleOk && Number(view?.discountPercent || 0) > 0 && sale < list;
  const days = Number(view?.durationDays || 0);
  const isRecommended = view?.badge === 'recommended' || !!view?.popular;
  const title = isLife
    ? (lang === 'en' ? (view?.nameEn || 'Lifetime') : lang === 'ja' ? (view?.nameJa || 'Lifetime') : (view?.nameKo || 'Lifetime'))
    : productTitle(view, lang);
  const uses = isLife
    ? (lang === 'en'
      ? (view?.descriptionEn || 'Unlimited AI conversion · Full features · No expiry')
      : lang === 'ja'
        ? (view?.descriptionJa || 'AI変換無制限 · Full機能 · 期限なし')
        : (view?.descriptionKo || 'AI 변환 무제한 · Full 기능 · 기간 제한 없음'))
    : productUses(view, lang);

  // Bundle savings only when not showing event discount (never combine %).
  const packSave = (!discounted && (view?.savingsLabel || view?.savePercent))
    ? `<span class="purchase-plan-save" data-preview-hl="savings">${escHtml(
      view.savingsLabel
      || (lang === 'en'
        ? `Save about ${view.savePercent}% vs. shorter passes`
        : (lang === 'ja'
          ? `約${view.savePercent}%お得`
          : `약 ${view.savePercent}% 절약`))
    )}</span>`
    : `<span class="purchase-plan-save" aria-hidden="true"></span>`;

  const eventOff = discounted
    ? `<span class="purchase-plan-off-pill" data-preview-hl="discount">${escHtml(String(view.discountPercent))}% OFF</span>`
    : '';

  const discountUntil = options.discountUntil
    || (view?.discountEndsAt ? formatPromoUntilLabel(view.discountEndsAt, lang) : '');
  const untilHtml = discounted && discountUntil
    ? `<p class="purchase-plan-discount-until" data-preview-hl="discount-until">${escHtml(discountUntil)}</p>`
    : '';

  const prices = cardPriceCopy(view, lang);
  const fxNoteHtml = prices.note
    ? `<p class="purchase-plan-fx-note">${escHtml(prices.note)}</p>`
    : '';
  const priceHtml = discounted
    ? `<div class="purchase-plan-price-block" data-preview-hl="price">
        <div class="purchase-plan-price-was">${escHtml(prices.listText)}</div>
        <div class="purchase-plan-price-row">
          <div class="purchase-plan-price purchase-plan-price-now">${escHtml(prices.saleText)}</div>
          ${eventOff}
        </div>
        ${fxNoteHtml}
      </div>`
    : `<div class="purchase-plan-price-block" data-preview-hl="price">
        <div class="purchase-plan-price-was purchase-plan-price-was-spacer" aria-hidden="true">&nbsp;</div>
        <div class="purchase-plan-price-row">
          <div class="purchase-plan-price">${escHtml(prices.saleText)}</div>
        </div>
        ${fxNoteHtml}
      </div>`;

  const badgeHtml = isRecommended
    ? `<span class="purchase-plan-badge is-rec" data-preview-hl="badge">${escHtml(ui.recommended)}</span>`
    : (view?.badge === 'popular'
      ? `<span class="purchase-plan-badge is-rec" data-preview-hl="badge">${escHtml(lang === 'en' ? 'Popular' : lang === 'ja' ? '人気' : '인기')}</span>`
      : (view?.badge === 'best'
        ? `<span class="purchase-plan-badge is-best" data-preview-hl="badge">Best Value</span>`
        : ''));

  const unit = isLife
    ? ui.unitLife
    : (isCredit ? (ui.unitCredit || '1 Credit = 1 Conversion') : ui.unitPass(days || 0));
  const features = options.features
    || (isLife ? ui.lifeFeatures : (isCredit ? (ui.creditFeatures || []) : ui.passFeatures));
  const btnLabel = options.buyLabel
    || (status === 'paused' ? ui.btnPaused : ui.buy);

  const cardMods = [
    selected ? ' is-selected' : '',
    isRecommended ? ' is-recommended' : '',
    locked ? ' is-locked' : '',
    status === 'paused' ? ' is-preview-paused' : '',
    previewMode ? ' is-preview' : '',
    options.extraClass ? ` ${String(options.extraClass).trim()}` : ''
  ].join('');

  const pausedNote = (previewMode && status === 'paused')
    ? `<p class="purchase-plan-uses pricing-preview-paused-note" data-preview-hl="status">${escHtml(ui.paused)}</p>`
    : `<p class="purchase-plan-uses" data-preview-hl="desc">${escHtml(uses)}</p>`;

  return `<article class="purchase-plan-card${cardMods}" data-purchase-id="${escHtml(pid)}" data-preview-hl="card" role="listitem" ${buyDisabled ? 'aria-disabled="true"' : ''}>
    <div class="purchase-plan-head">
      <h3 data-preview-hl="title">${escHtml(title)}</h3>
      ${badgeHtml}
    </div>
    ${pausedNote}
    ${priceHtml}
    ${untilHtml}
    <p class="purchase-plan-unit" data-preview-hl="unit">${escHtml(unit)}</p>
    ${packSave}
    ${purchaseCardFeaturesHtml(features)}
    <button type="button" class="purchase-plan-buy" data-purchase-buy="${escHtml(pid)}" ${buyDisabled ? 'disabled aria-disabled="true"' : ''}>${escHtml(btnLabel)}</button>
  </article>`;
}

/**
 * Build homepage sale promo copy object (shared with admin preview).
 * Prefer passing `resolved` from resolvePromotionProducts(catalog).
 * Legacy single priceCtx still accepted for fallback / old callers.
 */
export function buildPromotionPopupCopy(promo, priceCtx = {}, lang = 'ko', resolved = null) {
  const ui = storefrontUiCopy(lang);
  if (!promo) {
    return {
      badge: 'Sale',
      title: '',
      lead: '',
      until: '',
      was: priceCtx.was || '',
      now: priceCtx.now || '',
      products: [],
      hiddenCount: 0,
      cta: ui.defaultCta,
      href: './purchase.html',
      hideToday: ui.hideToday,
      close: ui.close,
      moreLabel: '',
      promo: null
    };
  }
  const ends = promo._originalEndsAt || promo.endsAt || '';
  let until = localizePromo(promo, 'badge', lang);
  if (!until && ends) until = formatPromoUntilLabel(ends, lang);

  const products = Array.isArray(resolved?.visible)
    ? resolved.visible
    : (Array.isArray(resolved?.products) ? resolved.products : []);
  const hiddenCount = Number(resolved?.hiddenCount || 0);
  const disc = Number(
    resolved?.discountPercent
    || priceCtx.discountPercent
    || (String(promo.type || '').toLowerCase() === 'percent' ? promo.value : 0)
    || 0
  );
  if (!until && disc > 0) {
    until = lang === 'en' ? `${disc}% OFF` : lang === 'ja' ? `${disc}% OFF` : `${disc}% 할인`;
  }

  const first = products[0];
  const was = first?.listLabel || priceCtx.was || '';
  const nowPrice = first?.saleLabel || priceCtx.now || '';

  const moreLabel = hiddenCount > 0
    ? (lang === 'en'
      ? `+ ${hiddenCount} more discounted product${hiddenCount > 1 ? 's' : ''}`
      : lang === 'ja'
        ? `ほか${hiddenCount}件の割引商品`
        : `외 ${hiddenCount}개 할인 상품`)
    : '';

  const defaultCta = products.length > 1
    ? (lang === 'en' ? 'See discounted products' : lang === 'ja' ? '割引商品を見る' : '할인 상품 보기')
    : ui.defaultCta;

  return {
    badge: localizePromo(promo, 'badge', lang) || (disc > 0 ? `${disc}% OFF` : 'Sale'),
    title: localizePromo(promo, 'popupTitle', lang) || localizePromo(promo, 'name', lang),
    lead: localizePromo(promo, 'popupBody', lang),
    until: until || '',
    was,
    now: nowPrice,
    products,
    hiddenCount,
    moreLabel,
    cta: localizePromo(promo, 'popupCta', lang) || defaultCta,
    href: promo.ctaUrl || './purchase.html',
    hideToday: ui.hideToday,
    close: ui.close,
    promo
  };
}

function renderPromoProductRows(products = [], options = {}) {
  const count = products.length;
  if (!count) return '';
  const single = count === 1 && !options.forceCompact;
  if (single) {
    const p = products[0];
    return `<div class="sale-promo-products is-single" data-preview-hl="popup-price">
      <div class="sale-promo-product-name" data-preview-hl="popup-product-name">${escHtml(p.name)}</div>
      <div class="sale-promo-price-box">
        <div class="sale-promo-was">${escHtml(p.listLabel)}</div>
        <div class="sale-promo-now"><strong>${escHtml(p.saleLabel)}</strong></div>
      </div>
    </div>`;
  }
  return `<div class="sale-promo-products is-multi" data-preview-hl="popup-price">
    ${products.map((p) => `<div class="sale-promo-product-row" data-product-id="${escHtml(p.productId)}">
      <div class="sale-promo-product-name">${escHtml(p.name)}</div>
      <div class="sale-promo-product-prices">
        <span class="sale-promo-was">${escHtml(p.listLabel)}</span>
        <span class="sale-promo-arrow" aria-hidden="true">→</span>
        <strong class="sale-promo-sale">${escHtml(p.saleLabel)}</strong>
      </div>
    </div>`).join('')}
  </div>`;
}

/**
 * @param {object} copy from buildPromotionPopupCopy
 * @param {object} options { preview, ctaDisabled, purchaseHref, showHideToday }
 */
export function renderPromotionPopupHtml(copy, options = {}) {
  const t = copy || {};
  const preview = options.preview === true;
  const href = options.purchaseHref || t.href || './purchase.html';
  const ctaDisabled = preview || options.ctaDisabled === true;
  const showHide = options.showHideToday !== false && !preview;
  const ctaHtml = ctaDisabled
    ? `<button type="button" class="primary" disabled aria-disabled="true" data-preview-hl="popup-cta">${escHtml(t.cta || '')}</button>`
    : `<a class="primary" href="${escHtml(href)}" data-preview-hl="popup-cta">${escHtml(t.cta || '')}</a>`;
  const hideHtml = showHide
    ? `<div class="sale-promo-meta">
        <label class="sale-promo-hide"><input type="checkbox" id="salePromoHideToday"> ${escHtml(t.hideToday || '')}</label>
        <button type="button" class="sale-promo-close-link" data-close>${escHtml(t.close || '')}</button>
      </div>`
    : `<div class="sale-promo-meta">
        <button type="button" class="sale-promo-close-link" disabled>${escHtml(t.close || '')}</button>
      </div>`;

  const lead = String(t.lead || '').trim();
  const leadHtml = lead
    ? `<p class="sale-promo-lead" data-preview-hl="popup-body">${escHtml(lead)}</p>`
    : '';

  const products = Array.isArray(t.products) ? t.products : [];
  let productsHtml = '';
  if (products.length) {
    productsHtml = renderPromoProductRows(products, { forceCompact: products.length > 1 });
  } else if (t.was || t.now) {
    // Legacy single-price fallback (no catalog resolution available)
    productsHtml = `<div class="sale-promo-price-box" data-preview-hl="popup-price">
      <div class="sale-promo-was">${escHtml(t.was || '')}</div>
      <div class="sale-promo-now"><strong>${escHtml(t.now || '')}</strong></div>
    </div>`;
  }

  const moreHtml = t.moreLabel
    ? `<p class="sale-promo-more">${escHtml(t.moreLabel)}</p>`
    : '';
  const untilHtml = t.until
    ? `<p class="sale-promo-until" data-preview-hl="popup-until">${escHtml(t.until)}</p>`
    : '';

  return `<div class="sale-promo-backdrop${preview ? ' is-open is-preview' : ''}" role="dialog" aria-modal="true" aria-label="${escHtml(t.title || '')}">
    <div class="sale-promo-modal">
      <button type="button" class="sale-promo-x" aria-label="${escHtml(t.close || '')}" ${preview ? 'disabled' : ''}>×</button>
      <span class="sale-promo-badge" data-preview-hl="popup-badge">${escHtml(t.badge || '')}</span>
      <h2 class="sale-promo-title" data-preview-hl="popup-title">${escHtml(t.title || '')}</h2>
      ${leadHtml}
      ${productsHtml}
      ${moreHtml}
      ${untilHtml}
      <div class="sale-promo-actions">
        ${ctaHtml}
        ${hideHtml}
      </div>
    </div>
  </div>`;
}

/**
 * Force a draft promotion into an active window for admin "apply-when" preview only.
 * Does not mutate the original draft.
 */
export function forcePromoWindowForPreview(promo, now = new Date()) {
  if (!promo) return null;
  const clone = { ...promo };
  clone.enabled = true;
  clone.archived = false;
  clone._originalStartsAt = promo.startsAt;
  clone._originalEndsAt = promo.endsAt;
  clone._previewForced = true;
  clone.startsAt = new Date(now.getTime() - 60_000).toISOString();
  const end = promo.endsAt ? new Date(promo.endsAt) : null;
  if (!end || Number.isNaN(end.getTime()) || end <= now) {
    clone.endsAt = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  }
  return clone;
}

/** Max products shown in popup before "+ N more". */
export const PROMO_POPUP_MAX_VISIBLE = 3;
