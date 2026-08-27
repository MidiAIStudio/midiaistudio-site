/**
 * Admin: Credit + Pass (기간 이용권) + Lifetime catalog, discounts, and promotions.
 */
import {
  SEED_PRODUCTS,
  bumpVersion,
  canonicalPassDurationDays,
  computeCharge,
  computePassBundleSavings,
  creditChangeWarning,
  assertSaveTargetInvariant,
  editTargetMismatchMessage,
  emptyDiscount,
  findCatalogProduct,
  findActivePromotionForProduct,
  findDiscountConflicts,
  firestoreDocId,
  sortOrdersFromProductIds,
  applyLocalProductReorder,
  nextProductSortOrder,
  moveProductIdInOrder,
  formatKrw,
  formatUsd,
  setCatalogFxRate,
  getCatalogFxRate,
  krwToUsd,
  formatPassBundleSavingsLabel,
  formatPromoDateRange,
  fromDatetimeLocalValue,
  hydrateLegacyProduct,
  evaluateProductDeletable,
  isCanonicalPassProductId,
  isPassProductId,
  normalizeProductId,
  priceChangeWarning,
  productTypeLabel,
  promoWindowLabel,
  resolvePassSavingsReferenceId,
  toDatetimeLocalValue,
  unitPrice,
  validateProductFields,
  validatePromotionFields,
  windowStatus,
  publicProductView,
  isWindowActive,
  resolvePromotionProducts,
  promotionTargetIds,
  isCreditProductId,
  isPurchaseCatalogProduct,
  overlayCatalogDraft,
  starterUnitFromProducts
} from './catalog-engine.js?v=admin-preview-draft-2';
import {
  renderProductCard,
  renderPromotionPopupHtml,
  buildPromotionPopupCopy,
  forcePromoWindowForPreview,
  storefrontUiCopy,
  PROMO_POPUP_MAX_VISIBLE
} from './storefront-render.js?v=admin-preview-draft-2';
import { writeAdminAuditLog } from './admin-user-logs.js?v=credit-ledger-tab-1';
import { getFirebase, waitForAdmin } from './visual-cms.js?v=pricing-cms-2';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let db = null;
let fs = null;
let isAdmin = false;
let products = [];
let promotions = [];
let selectedId = null;
let selectedDocId = null;
let selectedPromoId = null;
let draft = null;
let promoDraft = null;
let booted = false;
let loading = false;
let pane = 'products';
let deletedProductIds = new Set();
let purchaseHistoryByProduct = {};
let previewLang = 'ko';
let previewView = 'purchase';
let previewDevice = 'desktop';
let previewTimer = null;
let previewHighlightKey = '';
let previewBaselineProduct = null;
let previewBaselinePromo = null;
let adminFxMeta = null;
let lastSavedProducts = [];
let persistReorderRunning = false;
let pendingReorderIds = null;
let ignoreListClickUntil = 0;
let dragState = null;
let reorderStatusTimer = null;

function $(id) { return document.getElementById(id); }

function functionsBaseUrl() {
  return String((window.MIDIAI_CONFIG || window.MIDIAI_CONFIG || {}).functionsBaseUrl || '').replace(/\/$/, '');
}

function formatFxStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function refreshAdminFx() {
  try {
    const base = functionsBaseUrl();
    if (!base || base.includes('PASTE_')) {
      adminFxMeta = { ok: false };
      setCatalogFxRate(null);
      return;
    }
    const res = await fetch(`${base}/getPublicFxRate`);
    const data = await res.json().catch(() => ({}));
    if (data && data.ok && Number(data.rate) > 0) {
      setCatalogFxRate(data.rate);
      adminFxMeta = data;
    } else {
      adminFxMeta = { ok: false, message: data?.message || '' };
      setCatalogFxRate(null);
    }
  } catch (err) {
    console.warn('admin fx', err);
    adminFxMeta = { ok: false };
    setCatalogFxRate(null);
  }
  updateUsdPreview();
}

function updateUsdPreview() {
  const amountEl = $('draftUsdPreviewAmount');
  const promoEl = $('draftUsdPreviewPromo');
  const rateEl = $('draftUsdRateLine');
  const hintEl = $('draftUsdHint');
  const krw = Number(draft?.listPriceKrw || $('draftPriceKrw')?.value || 0);
  const rate = Number(getCatalogFxRate());
  const fxOk = Number.isFinite(rate) && rate > 0;
  if (rateEl) {
    rateEl.textContent = fxOk
      ? `현재 환율 1 USD = ${Math.round(rate).toLocaleString('ko-KR')} KRW${adminFxMeta?.fetchedAt ? ` · 마지막 갱신 ${formatFxStamp(adminFxMeta.fetchedAt)}` : ''} (자동 계산)`
      : '환율 정보를 불러오지 못했습니다.';
  }
  if (!draft) {
    if (amountEl) amountEl.textContent = '—';
    if (promoEl) promoEl.hidden = true;
    return;
  }
  const now = new Date();
  const krwCharge = computeCharge(draft, promotions, now, 'KRW');
  const usdCharge = computeCharge(draft, promotions, now, 'USD');
  if (!fxOk || !usdCharge.ok) {
    if (amountEl) amountEl.textContent = '—';
    if (promoEl) {
      promoEl.hidden = false;
      promoEl.textContent = '환율 정보를 불러오지 못했습니다.';
    }
    if (hintEl) hintEl.textContent = 'KRW 가격은 저장할 수 있습니다. PayPal 판매는 환율이 복구되면 가능합니다.';
    return;
  }
  const discounted = krwCharge.ok && Number(krwCharge.effectivePrice) < Number(krwCharge.basePrice);
  if (amountEl) amountEl.textContent = formatUsd(usdCharge.effectivePrice);
  if (promoEl) {
    if (discounted) {
      promoEl.hidden = false;
      promoEl.textContent = `정가 ${formatKrw(krwCharge.basePrice)} / ${formatUsd(usdCharge.basePrice)} → 할인가 ${formatKrw(krwCharge.effectivePrice)} / ${formatUsd(usdCharge.effectivePrice)}`;
    } else {
      promoEl.hidden = true;
      promoEl.textContent = '';
    }
  }
  if (hintEl) {
    hintEl.textContent = Number(krw) > 0
      ? 'PayPal 판매 가능 · 현재 환율 기준 자동 계산. 실제 결제액은 Quote에서 확정됩니다.'
      : 'KR 정가를 입력하면 해외 가격이 자동 계산됩니다.';
  }
}

function dedupeProducts(rows) {
  const byDoc = new Map();
  for (const row of rows || []) {
    const docId = String(row?.docId || firestoreDocId(row?.productId)).trim();
    if (!docId) continue;
    const prev = byDoc.get(docId);
    if (!prev || Number(row?.updatedAt?.seconds || row?.updatedAt?._seconds || 0)
      >= Number(prev?.updatedAt?.seconds || prev?.updatedAt?._seconds || 0)) {
      byDoc.set(docId, { ...row, docId });
    }
  }
  return [...byDoc.values()];
}

function productDeleteEval(p) {
  if (!p) return { deletable: false, reason: 'missing', message: '' };
  const pid = normalizeProductId(p.productId || p.id);
  const history = p._history || purchaseHistoryByProduct[pid] || { orderCount: 0, creditCount: 0 };
  return evaluateProductDeletable(p, history);
}

function canDeleteCatalogProduct(p) {
  return productDeleteEval(p).deletable;
}

function deleteBlockMessage(reason) {
  if (reason === 'system_required') {
    return '시스템 필수 상품은 삭제할 수 없습니다.';
  }
  if (reason === 'credit_grant_history') {
    return 'Credit 지급 기록이 있는 상품은 삭제할 수 없습니다. 판매를 중단하려면 \'보관\'을 사용하세요.';
  }
  return '결제 기록이 있는 상품은 삭제할 수 없습니다. 판매를 중단하려면 \'보관\'을 사용하세요.';
}

function orderHistoryProductId(data) {
  const canonical = normalizeProductId(data?.productCanonicalId || '');
  if (canonical && purchaseHistoryByProduct[canonical] != null) return canonical;
  const raw = String(data?.productId || '').trim();
  if (raw) {
    const pid = normalizeProductId(raw);
    if (purchaseHistoryByProduct[pid] != null) return pid;
    if (/lifetime/i.test(raw)) return 'LIFETIME';
  }
  return canonical || normalizeProductId(raw) || null;
}

async function loadPurchaseHistory() {
  purchaseHistoryByProduct = {};
  for (const p of products) {
    const pid = normalizeProductId(p.productId);
    purchaseHistoryByProduct[pid] = { orderCount: 0, creditCount: 0 };
  }
  if (!db || !fs) return;
  const { collection, getDocs, doc, getDoc } = fs;
  try {
    const cfgSnap = await getDoc(doc(db, 'pricingConfig', 'main'));
    const rawDeleted = cfgSnap.exists?.() ? (cfgSnap.data()?.deletedProductIds || []) : [];
    deletedProductIds = new Set(rawDeleted.map((id) => normalizeProductId(id)));
  } catch (e) {
    console.warn('deletedProductIds', e);
    deletedProductIds = new Set();
  }
  try {
    const orderSnap = await getDocs(collection(db, 'orders'));
    for (const d of orderSnap.docs) {
      const pid = orderHistoryProductId(d.data());
      if (pid && purchaseHistoryByProduct[pid]) purchaseHistoryByProduct[pid].orderCount += 1;
    }
  } catch (e) {
    console.warn('order history scan', e);
  }
  try {
    const cpSnap = await getDocs(collection(db, 'creditPurchases'));
    for (const d of cpSnap.docs) {
      const pid = normalizeProductId(d.data()?.productId || '');
      if (pid && purchaseHistoryByProduct[pid]) purchaseHistoryByProduct[pid].creditCount += 1;
    }
  } catch (e) {
    console.warn('creditPurchases history scan', e);
  }
  for (const p of products) {
    const pid = normalizeProductId(p.productId);
    p._history = purchaseHistoryByProduct[pid] || { orderCount: 0, creditCount: 0 };
    if (p._history.orderCount > 0) p.hasPurchases = true;
  }
}

async function recordCatalogDeletion(productId) {
  const pid = normalizeProductId(productId);
  const { doc, setDoc, serverTimestamp, arrayUnion } = fs;
  await setDoc(doc(db, 'pricingConfig', 'main'), {
    deletedProductIds: arrayUnion(pid),
    updatedAt: serverTimestamp()
  }, { merge: true });
  deletedProductIds.add(pid);
}

function flash(msg, ok = true) {
  const el = $('pricingSaveMsg');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
  el.classList.toggle('is-ok', !!ok);
  el.classList.toggle('is-err', !ok);
}

export function initPricingAdmin(api = {}) {
  if (api.db) db = api.db;
  if (api.firestoreApi) fs = api.firestoreApi;
  if (api.isAdmin != null) isAdmin = !!api.isAdmin;
  ensureBoot();
  if (isAdmin && db && fs) loadAll().catch((e) => console.error(e));
  else bootstrapSelf();
}

export function setPricingAdminAuth({ isAdmin: admin, db: nextDb, firestoreApi }) {
  isAdmin = !!admin;
  if (nextDb) db = nextDb;
  if (firestoreApi) fs = firestoreApi;
  ensureBoot();
  if (isAdmin && db) loadAll().catch((e) => console.error(e));
}

async function bootstrapSelf() {
  if ((location.pathname.split('/').pop() || '') !== 'admin.html') return;
  ensureBoot();
  setListStatus('<p class="muted">권한·Firestore 연결 중…</p>');
  try {
    const fb = await getFirebase();
    db = fb.db;
    fs = fb.fs;
    const { isAdmin: admin } = await waitForAdmin();
    isAdmin = admin;
    if (!isAdmin) {
      setListStatus('<p class="muted">관리자 계정으로 로그인한 뒤 다시 열어주세요.</p>');
      return;
    }
    await loadAll();
  } catch (e) {
    console.error('pricing-admin bootstrap', e);
    setListStatus(`<p class="muted">초기화 실패: ${esc(e.message || e)}</p>`);
  }
}

function ensureBoot() {
  if (booted) return;
  bindTabs();
  bindUi();
  booted = true;
}

function bindTabs() {
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    if (btn.hasAttribute('data-admin-nav')) return;
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-admin-tab');
      if (typeof window.__midiaiShowAdminView === 'function') {
        window.__midiaiShowAdminView(tab, {
          logsTab: btn.getAttribute('data-logs-tab') || undefined,
          ticketStatus: btn.getAttribute('data-ticket-status') || undefined,
          closeDetail: btn.getAttribute('data-admin-close-detail') === '1',
          crmMode: btn.getAttribute('data-crm-mode') || undefined,
          detailTab: btn.getAttribute('data-crm-detail-tab') || undefined,
          source: btn
        });
        if (tab === 'pricing' && !products.length) loadAll().catch(console.error);
      }
    });
  });
}

function bindUi() {
  const bind = (id, fn, evt = 'click') => {
    const el = $(id);
    if (!el || el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener(evt, fn);
  };
  document.querySelectorAll('[data-pricing-pane]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => setPane(btn.getAttribute('data-pricing-pane')));
  });
  bind('pricingAddProduct', () => openAddModal());
  bind('pricingSaveBtn', () => saveDraft().catch((e) => flash(e.message || e, false)));
  bind('pricingCancelBtn', () => {
    if (selectedDocId || selectedId) selectProduct(selectedDocId || selectedId);
  });
  bind('pricingCloneBtn', () => cloneProduct().catch((e) => flash(e.message || e, false)));
  bind('pricingArchiveBtn', () => archiveProduct().catch((e) => flash(e.message || e, false)));
  bind('pricingDeleteBtn', () => deleteProduct().catch((e) => flash(e.message || e, false)));
  bind('pricingAddPromo', () => startNewPromo());
  bind('pricingAddPromoInline', () => startNewPromo());
  bind('pricingPromoEmptyCreate', () => startNewPromo());
  bind('draftViewPromoBtn', () => {
    if (draft?.productId) openPromotionForProduct(draft.productId);
    else setPane('promos');
  });
  bind('pricingSavePromoBtn', () => savePromo().catch((e) => flash(e.message || e, false)));
  bind('pricingClonePromoBtn', () => clonePromo().catch((e) => flash(e.message || e, false)));
  bind('pricingArchivePromoBtn', () => archivePromo().catch((e) => flash(e.message || e, false)));
  bind('pricingCreateConfirm', () => createProductFromModal().catch((e) => flash(e.message || e, false)));
  bind('pricingCreateCancel', () => closeAddModal());
  bind('newProductType', () => syncCreateModalFields(), 'change');
  ['draftNameKo', 'draftNameEn', 'draftNameJa', 'draftCredits', 'draftDurationDays', 'draftPriceKrw',
    'draftStatus', 'draftBadge', 'draftDescKo', 'draftDescEn', 'draftDescJa'
  ].forEach((id) => bind(id, () => syncDraftFromForm(), 'input'));
  ['draftStatus', 'draftBadge'].forEach((id) => bind(id, () => syncDraftFromForm(), 'change'));
  ['promoNameKo', 'promoNameEn', 'promoNameJa', 'promoValue', 'promoStart', 'promoEnd',
    'promoPopupTitleKo', 'promoPopupTitleEn', 'promoPopupTitleJa', 'promoPopupBodyKo', 'promoPopupBodyEn', 'promoPopupBodyJa',
    'promoPopupCtaKo', 'promoPopupCtaEn', 'promoPopupCtaJa', 'promoCtaUrl'
  ].forEach((id) => bind(id, () => {
    renderPromoPreview();
    scheduleLivePreview(document.activeElement?.getAttribute?.('data-preview-field') || '');
  }, 'input'));
  ['promoEnabledFlag', 'promoType', 'promoPopupEnabled'].forEach((id) => bind(id, () => {
    renderPromoPreview();
    scheduleLivePreview(document.activeElement?.getAttribute?.('data-preview-field') || 'discount');
  }, 'change'));
  document.querySelectorAll('[data-preview-view]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      previewView = btn.getAttribute('data-preview-view') === 'popup' ? 'popup' : 'purchase';
      syncPreviewToolbar();
      renderLivePreview();
    });
  });
  document.querySelectorAll('[data-preview-lang]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      previewLang = btn.getAttribute('data-preview-lang') || 'ko';
      syncPreviewToolbar();
      renderLivePreview();
    });
  });
  document.querySelectorAll('[data-preview-device]').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      previewDevice = btn.getAttribute('data-preview-device') === 'mobile' ? 'mobile' : 'desktop';
      syncPreviewToolbar();
      renderLivePreview();
    });
  });
  // Field-level highlight while typing
  document.querySelectorAll('[data-preview-field]').forEach((el) => {
    if (el.dataset.hlBound === '1') return;
    el.dataset.hlBound = '1';
    el.addEventListener('focus', () => {
      previewHighlightKey = el.getAttribute('data-preview-field') || '';
    });
    el.addEventListener('input', () => {
      previewHighlightKey = el.getAttribute('data-preview-field') || '';
    });
  });
  bindProductListEvents();
}

function syncPreviewToolbar() {
  document.querySelectorAll('[data-preview-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-preview-view') === previewView);
  });
  document.querySelectorAll('[data-preview-lang]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-preview-lang') === previewLang);
  });
  document.querySelectorAll('[data-preview-device]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-preview-device') === previewDevice);
  });
  const stage = $('pricingPreviewStage');
  if (stage) {
    stage.classList.toggle('is-desktop', previewDevice === 'desktop');
    stage.classList.toggle('is-mobile', previewDevice === 'mobile');
  }
  const purchase = $('pricingPreviewPurchase');
  const popupHost = $('pricingPreviewPopupHost');
  if (purchase) purchase.hidden = previewView !== 'purchase';
  if (popupHost) popupHost.hidden = previewView !== 'popup';
}

function scheduleLivePreview(highlightKey = '') {
  if (highlightKey) previewHighlightKey = highlightKey;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    renderLivePreview();
  }, 80);
}

function snapshotComparableProduct(p) {
  if (!p) return '';
  return JSON.stringify({
    productId: normalizeProductId(p.productId),
    nameKo: p.nameKo || '',
    nameEn: p.nameEn || '',
    nameJa: p.nameJa || '',
    descriptionKo: p.descriptionKo || '',
    descriptionEn: p.descriptionEn || '',
    descriptionJa: p.descriptionJa || '',
    listPriceKrw: Number(p.listPriceKrw || 0),
    listPriceUsd: p.listPriceUsd == null ? null : Number(p.listPriceUsd),
    status: p.status || 'active',
    sortOrder: Number(p.sortOrder || 0),
    badge: p.badge || '',
    durationDays: Number(p.durationDays || 0),
    creditAmount: Number(p.creditAmount || 0)
  });
}

function snapshotComparablePromo(p) {
  if (!p) return '';
  return JSON.stringify({
    id: p.id || '',
    nameKo: p.nameKo || '',
    nameEn: p.nameEn || '',
    nameJa: p.nameJa || '',
    enabled: p.enabled === true,
    type: p.type || 'percent',
    value: Number(p.value || 0),
    startsAt: p.startsAt || '',
    endsAt: p.endsAt || '',
    productIds: [...(p.productIds || [])].map(normalizeProductId).sort(),
    homepagePopupEnabled: p.homepagePopupEnabled === true,
    popupTitleKo: p.popupTitleKo || '',
    popupTitleEn: p.popupTitleEn || '',
    popupTitleJa: p.popupTitleJa || '',
    popupBodyKo: p.popupBodyKo || '',
    popupBodyEn: p.popupBodyEn || '',
    popupBodyJa: p.popupBodyJa || '',
    popupCtaKo: p.popupCtaKo || '',
    popupCtaEn: p.popupCtaEn || '',
    popupCtaJa: p.popupCtaJa || '',
    ctaUrl: p.ctaUrl || ''
  });
}

function updatePreviewSaveState() {
  const el = $('pricingPreviewSaveState');
  if (!el) return;
  let dirty = false;
  if (pane === 'products' && draft) {
    dirty = snapshotComparableProduct(draft) !== snapshotComparableProduct(previewBaselineProduct);
  } else if (pane === 'promos' && promoDraft) {
    dirty = snapshotComparablePromo(promoDraft) !== snapshotComparablePromo(previewBaselinePromo);
  }
  el.classList.toggle('is-saved', !dirty);
  el.classList.toggle('is-dirty', dirty);
  el.textContent = dirty ? '● 저장되지 않은 변경' : '✓ 저장된 상태';
}

function buildPreviewCatalog() {
  return overlayCatalogDraft(products, draft);
}

function buildPreviewPromotions({ forceDraftPromo = false } = {}) {
  const now = new Date();
  let list = (promotions || []).map((p) => ({ ...p }));
  if (promoDraft && (forceDraftPromo || pane === 'promos')) {
    const draftId = promoDraft.id || '';
    list = list.filter((p) => !draftId || p.id !== draftId);
    const forced = forcePromoWindowForPreview(promoDraft, now);
    if (forced && promoDraft.enabled !== false) {
      const targets = new Set((forced.productIds || []).map(normalizeProductId));
      // Drop overlapping live promos on same targets so draft is the clear SoT in preview.
      list = list.filter((p) => {
        if (p.archived === true || p.enabled !== true) return true;
        if (!isWindowActive(true, p.startsAt, p.endsAt, now)
          && windowStatus(true, p.startsAt, p.endsAt, now) !== 'scheduled') {
          return true;
        }
        const overlap = (p.productIds || []).some((id) => targets.has(normalizeProductId(id)));
        return !overlap;
      });
      list.push(forced);
    }
  }
  return list;
}

function renderLivePreview() {
  const purchaseRoot = $('pricingPreviewPurchase');
  const popupRoot = $('pricingPreviewPopup');
  if (!purchaseRoot && !popupRoot) return;
  syncPreviewToolbar();
  updatePreviewSaveState();

  const catalog = buildPreviewCatalog();
  const forceDraft = pane === 'promos' && !!promoDraft;
  const promoList = buildPreviewPromotions({ forceDraftPromo: forceDraft });
  const banner = $('pricingPreviewBanner');
  if (banner) {
    const show = forceDraft && promoDraft;
    banner.hidden = !show;
    if (show) {
      const st = windowStatus(promoDraft.enabled === true, promoDraft.startsAt, promoDraft.endsAt);
      banner.textContent = st === 'active'
        ? '● 편집 중 프로모션 미리보기'
        : '● 편집 중 프로모션 미리보기 (이 프로모션 적용 시)';
    }
  }

  const storefrontProducts = catalog.filter((p) => isPurchaseCatalogProduct(p)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
    || String(a.productId).localeCompare(String(b.productId)));

  // Preview ignores CREDIT_PURCHASE_ENABLED — show sellable draft cards including Credit packs.
  const starterUnit = starterUnitFromProducts(catalog);
  const views = storefrontProducts.map((p) => {
    const view = publicProductView(p, promoList, new Date(), previewLang, starterUnit, catalog);
    // publicProductView uses computeCharge which nulls price when paused — restore list for preview display.
    if (String(p.status) === 'paused' || String(p.status) === 'archived') {
      view.listPriceKrw = Number(p.listPriceKrw || 0);
      view.effectivePrice = Number(p.listPriceKrw || 0);
      view.krw = view.effectivePrice;
      view.saleOk = false;
      view.status = p.status;
    }
    return view;
  });

  // Purchase grid: show active + currently edited (even if paused/archived). Hide other archived.
  const editPid = draft?.productId ? normalizeProductId(draft.productId) : '';
  const visible = views.filter((v) => {
    if (v.status === 'archived' && normalizeProductId(v.productId) !== editPid) return false;
    if (v.status === 'paused' && normalizeProductId(v.productId) !== editPid) {
      // Still show other paused? Spec: 판매중지 shows message for that product. Others stay hidden from storefront.
      return false;
    }
    return v.status === 'active' || normalizeProductId(v.productId) === editPid;
  });

  if (purchaseRoot) {
    const ui = storefrontUiCopy(previewLang);
    purchaseRoot.innerHTML = visible.map((v) => renderProductCard(v, {
      lang: previewLang,
      preview: true,
      selected: editPid && normalizeProductId(v.productId) === editPid,
      ui
    })).join('') || '<p class="muted">미리볼 판매 상품이 없습니다.</p>';
  }

  if (popupRoot) {
    const srcPromo = forceDraft && promoDraft
      ? forcePromoWindowForPreview(promoDraft)
      : (promoList.find((p) => p.homepagePopupEnabled === true && p.enabled === true) || null);
    if (!srcPromo || (forceDraft && promoDraft && promoDraft.homepagePopupEnabled !== true && pane === 'promos')) {
      const off = promoDraft && pane === 'promos' && promoDraft.homepagePopupEnabled !== true;
      popupRoot.innerHTML = off
        ? '<p class="muted pricing-preview-popup-off">홈 팝업 표시가 꺼져 있습니다.</p>'
        : '<p class="muted pricing-preview-popup-off">표시할 홈 팝업 프로모션이 없습니다.</p>';
    } else {
      const resolved = resolvePromotionProducts(srcPromo, catalog, {
        lang: previewLang,
        now: new Date(),
        maxVisible: PROMO_POPUP_MAX_VISIBLE,
        forceActive: true
      });
      const copy = buildPromotionPopupCopy(srcPromo, {
        discountPercent: resolved.discountPercent
      }, previewLang, resolved);
      popupRoot.innerHTML = renderPromotionPopupHtml(copy, { preview: true, showHideToday: false });
    }
  }

  if (previewHighlightKey) {
    flashPreviewHighlight(previewHighlightKey);
  }
}

function flashPreviewHighlight(key) {
  const stage = $('pricingPreviewStage');
  if (!stage || !key) return;
  stage.querySelectorAll('.is-preview-hl').forEach((el) => el.classList.remove('is-preview-hl'));
  stage.querySelectorAll(`[data-preview-hl="${key}"]`).forEach((el) => {
    el.classList.add('is-preview-hl');
    setTimeout(() => el.classList.remove('is-preview-hl'), 700);
  });
}

function setPane(next) {
  pane = next === 'promos' ? 'promos' : 'products';
  document.querySelectorAll('[data-pricing-pane]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-pricing-pane') === pane);
  });
  const productsPane = $('pricingProductsPane');
  const promosPane = $('pricingPromosPane');
  if (productsPane) productsPane.hidden = pane !== 'products';
  if (promosPane) promosPane.hidden = pane !== 'promos';
  scheduleLivePreview();
}

function setListStatus(html) {
  const root = $('pricingProductList');
  if (root) root.innerHTML = html;
}

async function audit(action, summary, before, after) {
  try {
    await writeAdminAuditLog({
      targetUserId: 'catalog',
      category: 'pricing',
      action,
      summary,
      before: before || null,
      after: after || null
    });
  } catch (e) {
    console.warn('pricing audit', e);
  }
}

async function ensureSeed() {
  const { collection, getDocs, doc, setDoc, serverTimestamp, getDoc } = fs;
  const cfgSnap = await getDoc(doc(db, 'pricingConfig', 'main'));
  const tombstones = new Set(
    (cfgSnap.exists?.() ? (cfgSnap.data()?.deletedProductIds || []) : []).map((id) => normalizeProductId(id))
  );
  deletedProductIds = tombstones;
  const snap = await getDocs(collection(db, 'products'));
  const existing = new Set(snap.docs.map((d) => normalizeProductId(d.id)));
  for (const seed of SEED_PRODUCTS) {
    if (seed.type === 'credit_pack') continue;
    const pid = normalizeProductId(seed.productId);
    if (tombstones.has(pid)) continue;
    const docId = firestoreDocId(seed.productId);
    if (existing.has(seed.productId) || snap.docs.some((d) => d.id === docId)) continue;
    const payload = {
      ...seed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      hasPurchases: false
    };
    if (seed.productId === 'LIFETIME') {
      payload.plan = 'lifetime';
      payload.name = 'Lifetime License';
      payload.order = seed.sortOrder;
      payload.listPriceKrw = 129000;
      payload.regions = {
        KR: {
          payment: 'portone',
          currency: 'KRW',
          listPrice: 129000,
          salePrice: 129000,
          orderName: 'MidiAI Studio Lifetime License',
          portoneProductId: 'midiai-lifetime'
        },
        Global: {
          payment: 'paypal',
          currency: 'USD',
          listPrice: 89,
          salePrice: 89,
          orderName: 'MidiAI Studio Lifetime License'
        }
      };
    }
    await setDoc(doc(db, 'products', docId), payload, { merge: true });
  }
  // Existing product prices are never rewritten here (Firestore is SoT).
  // CREDIT_* sales pause only (ledger/engine kept). Skip admin-deleted credits.
  for (const creditId of ['CREDIT_5', 'CREDIT_30', 'CREDIT_100']) {
    if (tombstones.has(creditId)) continue;
    try {
      const ref = doc(db, 'products', firestoreDocId(creditId));
      const snapDoc = await getDoc(ref);
      if (!snapDoc.exists()) continue;
      const status = String(snapDoc.data()?.status || 'active');
      if (status === 'active') {
        await setDoc(ref, { status: 'paused', updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch (e) {
      console.warn('credit pause', creditId, e);
    }
  }
  const cfg = await getDoc(doc(db, 'pricingConfig', 'main'));
  if (!cfg.exists()) {
    await setDoc(doc(db, 'pricingConfig', 'main'), {
      defaultProductId: 'lifetime',
      langRegionMap: { ko: 'KR', en: 'Global', ja: 'Global' },
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}

async function migrateStaleProductDiscounts() {
  if (!db || !fs) return;
  const { doc, setDoc, collection, addDoc, serverTimestamp } = fs;
  let migrated = 0;
  for (const p of products) {
    const pd = p.productDiscount || {};
    if (pd.enabled !== true) continue;
    const pid = normalizeProductId(p.productId);
    const st = windowStatus(true, pd.startsAt, pd.endsAt);
    const docId = p.docId || firestoreDocId(pid);
    if (st === 'ended') {
      await setDoc(doc(db, 'products', docId), {
        productDiscount: emptyDiscount(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      p.productDiscount = emptyDiscount();
      continue;
    }
    const duplicate = promotions.find((pr) => (
      pr.archived !== true
      && pr.enabled === true
      && (pr.productIds || []).some((item) => normalizeProductId(item) === pid)
      && String(pr.type || 'percent') === String(pd.type || 'percent')
      && Number(pr.value) === Number(pd.value)
      && String(pr.startsAt || '') === String(pd.startsAt || '')
      && String(pr.endsAt || '') === String(pd.endsAt || '')
    ));
    if (!duplicate) {
      const label = `${p.nameKo || pid} 할인 (마이그레이션)`;
      await addDoc(collection(db, 'promotions'), {
        nameKo: label,
        nameEn: label,
        nameJa: label,
        enabled: true,
        archived: false,
        type: pd.type || 'percent',
        value: Number(pd.value || 0),
        productIds: [pid],
        productOverrides: {},
        startsAt: pd.startsAt || new Date().toISOString(),
        endsAt: pd.endsAt || new Date(Date.now() + 7 * 86400000).toISOString(),
        homepagePopupEnabled: false,
        version: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      migrated += 1;
    }
    await setDoc(doc(db, 'products', docId), {
      productDiscount: emptyDiscount(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    p.productDiscount = emptyDiscount();
  }
  if (migrated > 0) {
    const { collection, getDocs } = fs;
    const promoSnap = await getDocs(collection(db, 'promotions'));
    promotions = promoSnap.docs.map((d) => ({ id: d.id, promotionId: d.id, ...d.data() }))
      .sort((a, b) => String(b.startsAt || '').localeCompare(String(a.startsAt || '')));
  }
}

async function loadAll() {
  if (loading || !db || !fs || !isAdmin) return;
  loading = true;
  setListStatus('<p class="muted">불러오는 중…</p>');
  try {
    try { await ensureSeed(); } catch (e) { console.warn('catalog seed', e); }
    await refreshAdminFx();
    const { collection, getDocs } = fs;
    const prodSnap = await getDocs(collection(db, 'products'));
    products = dedupeProducts(prodSnap.docs
      .map((d) => hydrateLegacyProduct({ id: d.id, ...d.data() }))
      .filter((p) => !['POINT_5', 'POINT_30', 'POINT_100'].includes(p.productId)))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.productId).localeCompare(b.productId));
    lastSavedProducts = products.map((p) => ({ ...p }));
    await loadPurchaseHistory();
    try {
      const promoSnap = await getDocs(collection(db, 'promotions'));
      promotions = promoSnap.docs.map((d) => ({ id: d.id, promotionId: d.id, ...d.data() }))
        .sort((a, b) => String(b.startsAt || '').localeCompare(String(a.startsAt || '')));
    } catch (e) {
      promotions = [];
      console.warn('promotions', e);
    }
    try {
      await migrateStaleProductDiscounts();
    } catch (e) {
      console.warn('product discount migration', e);
    }
    renderSummary();
    renderList();
    renderPromoList();
    if (!selectedDocId && !selectedId && products[0]) selectProduct(products[0].docId || products[0].productId);
    else if (selectedDocId || selectedId) selectProduct(selectedDocId || selectedId);
    if (selectedPromoId && promotions.find((p) => p.id === selectedPromoId)) {
      selectPromo(selectedPromoId);
    } else if (promoDraft && !promoDraft.id) {
      renderPromoEditor();
    } else {
      selectedPromoId = '';
      promoDraft = null;
      renderPromoEditor();
    }
  } catch (e) {
    setListStatus(`<p class="muted">불러오기 실패: ${esc(e.message || e)}</p>`);
  } finally {
    loading = false;
    scheduleLivePreview();
  }
}

function renderSummary() {
  const now = new Date();
  const live = products.filter((p) => p.status === 'active');
  const onSale = live.filter((p) => computeCharge(p, promotions, now).discount);
  const scheduled = promotions.filter((p) => windowStatus(p.enabled === true, p.startsAt, p.endsAt, now) === 'scheduled');
  const set = (id, n) => { const el = $(id); if (el) el.textContent = String(n); };
  set('pricingStatTotal', products.length);
  set('pricingStatLive', live.length);
  set('pricingStatDiscount', onSale.length);
  set('pricingStatScheduled', scheduled.length);
}

function discountLabel(product) {
  const charge = computeCharge(product, promotions);
  if (!charge.ok) return product.status === 'paused' ? '판매중지' : '보관';
  if (!charge.discount || !charge.discountPercent) return '정가';
  const kind = charge.discount.type === 'amount' ? `${Number(charge.discount.value).toLocaleString('ko-KR')}원` : `${charge.discountPercent}%`;
  return `${kind} 할인`;
}

function badgeLabel(badge) {
  if (badge === 'recommended') return '추천';
  if (badge === 'popular') return '인기';
  if (badge === 'best') return 'Best Value';
  return '';
}


function cloneProductList(list) {
  return (list || []).map((p) => ({ ...p }));
}

function setReorderStatus(kind) {
  const el = $('pricingReorderStatus');
  if (!el) return;
  if (reorderStatusTimer) {
    clearTimeout(reorderStatusTimer);
    reorderStatusTimer = null;
  }
  if (!kind) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'pricing-reorder-status';
    return;
  }
  el.hidden = false;
  if (kind === 'saving') {
    el.className = 'pricing-reorder-status is-saving';
    el.textContent = '● 순서 저장 중...';
  } else if (kind === 'saved') {
    el.className = 'pricing-reorder-status is-saved';
    el.textContent = '✓ 순서 저장됨';
    reorderStatusTimer = setTimeout(() => setReorderStatus(''), 1800);
  }
}

function syncDraftSortFromProducts() {
  if (!draft) return;
  const row = findCatalogProduct(products, draft.productId);
  if (!row) return;
  draft.sortOrder = Number(row.sortOrder || 0);
  if (previewBaselineProduct && normalizeProductId(previewBaselineProduct.productId) === normalizeProductId(draft.productId)) {
    previewBaselineProduct.sortOrder = draft.sortOrder;
  }
}

function needsSortNormalize(list) {
  return (list || []).some((p, i) => Number(p.sortOrder) !== i + 1);
}

async function persistProductOrder(productIds) {
  if (!isAdmin) throw new Error('관리자 권한이 없습니다.');
  if (!db || !fs) throw new Error('Firestore가 연결되지 않았습니다.');
  const rows = sortOrdersFromProductIds(productIds);
  if (!rows.length) throw new Error('정렬할 상품이 없습니다.');
  const { doc, writeBatch, updateDoc } = fs;
  const payloadOf = (sortOrder) => ({ sortOrder, order: sortOrder });
  if (typeof writeBatch === 'function') {
    const batch = writeBatch(db);
    for (const row of rows) {
      batch.update(doc(db, 'products', row.docId), payloadOf(row.sortOrder));
    }
    await batch.commit();
    return;
  }
  if (typeof updateDoc !== 'function') throw new Error('상품 순서 저장 API를 사용할 수 없습니다.');
  await Promise.all(rows.map((row) => updateDoc(doc(db, 'products', row.docId), payloadOf(row.sortOrder))));
}

async function flushProductReorder() {
  if (persistReorderRunning) return;
  persistReorderRunning = true;
  setReorderStatus('saving');
  try {
    while (pendingReorderIds) {
      const ids = pendingReorderIds;
      pendingReorderIds = null;
      await persistProductOrder(ids);
      lastSavedProducts = applyLocalProductReorder(lastSavedProducts, ids);
    }
    lastSavedProducts = cloneProductList(products);
    setReorderStatus('saved');
  } catch (err) {
    console.error('reorderProducts', err);
    pendingReorderIds = null;
    products = cloneProductList(lastSavedProducts);
    syncDraftSortFromProducts();
    renderList();
    scheduleLivePreview();
    setReorderStatus('');
    flash('상품 순서 저장에 실패했습니다.', false);
  } finally {
    persistReorderRunning = false;
    if (pendingReorderIds) flushProductReorder();
  }
}

function commitProductReorder(orderedIds) {
  const nextIds = (orderedIds || []).map((id) => normalizeProductId(id)).filter(Boolean);
  const currentIds = products.map((p) => normalizeProductId(p.productId));
  const sameOrder = currentIds.length === nextIds.length && currentIds.every((id, i) => id === nextIds[i]);
  if (sameOrder && !needsSortNormalize(products)) return;
  products = applyLocalProductReorder(products, nextIds);
  syncDraftSortFromProducts();
  renderList();
  scheduleLivePreview();
  pendingReorderIds = products.map((p) => p.productId);
  flushProductReorder();
}

function moveProductBy(productId, delta) {
  const next = moveProductIdInOrder(products.map((p) => p.productId), productId, delta);
  commitProductReorder(next);
}

function listItemEls(root) {
  return [...root.querySelectorAll('.pricing-product-item')];
}

function hideDropIndicator(root) {
  const el = root?.querySelector('.pricing-drop-indicator');
  if (el) el.hidden = true;
}

function positionDropIndicator(root, items, insertIndex) {
  const el = root.querySelector('.pricing-drop-indicator');
  if (!el || !items.length) return;
  const listRect = root.getBoundingClientRect();
  let y;
  if (insertIndex <= 0) y = items[0].getBoundingClientRect().top - listRect.top;
  else if (insertIndex >= items.length) {
    const last = items[items.length - 1].getBoundingClientRect();
    y = last.bottom - listRect.top;
  } else {
    y = items[insertIndex].getBoundingClientRect().top - listRect.top;
  }
  el.style.top = `${Math.max(0, y - 1)}px`;
  el.hidden = false;
}

function startProductDrag(e, item) {
  const root = $('pricingProductList');
  if (!root) return;
  const items = listItemEls(root);
  const fromIndex = items.indexOf(item);
  if (fromIndex < 0) return;
  const handle = item.querySelector('[data-drag-handle]');
  try { handle?.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  dragState = {
    pointerId: e.pointerId,
    fromIndex,
    startY: e.clientY,
    moved: false,
    insertIndex: fromIndex,
    item
  };
  const onMove = (ev) => {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    if (Math.abs(ev.clientY - dragState.startY) > 4) dragState.moved = true;
    if (!dragState.moved) return;
    item.classList.add('is-dragging');
    root.classList.add('is-reordering');
    const liveItems = listItemEls(root);
    let insert = liveItems.length;
    for (let i = 0; i < liveItems.length; i++) {
      const r = liveItems[i].getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) {
        insert = i;
        break;
      }
    }
    dragState.insertIndex = insert;
    positionDropIndicator(root, liveItems, insert);
  };
  const onUp = (ev) => {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    try { handle?.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    const { fromIndex, insertIndex, moved } = dragState;
    hideDropIndicator(root);
    item.classList.remove('is-dragging');
    root.classList.remove('is-reordering');
    dragState = null;
    if (!moved) return;
    ignoreListClickUntil = Date.now() + 400;
    let to = insertIndex;
    if (to > fromIndex) to -= 1;
    to = Math.max(0, Math.min(products.length - 1, to));
    const ids = products.map((p) => p.productId);
    if (to !== fromIndex) {
      const [movedId] = ids.splice(fromIndex, 1);
      ids.splice(to, 0, movedId);
    }
    commitProductReorder(ids);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

function bindProductListEvents() {
  const root = $('pricingProductList');
  if (!root || root.dataset.reorderBound === '1') return;
  root.dataset.reorderBound = '1';
  root.addEventListener('click', (e) => {
    if (Date.now() < ignoreListClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.target.closest('[data-drag-handle]')) {
      e.preventDefault();
      return;
    }
    const item = e.target.closest('[data-doc-id]');
    if (!item || !root.contains(item)) return;
    const pid = item.getAttribute('data-product-id');
    if (e.target.closest('[data-move-up]')) {
      e.preventDefault();
      moveProductBy(pid, -1);
      return;
    }
    if (e.target.closest('[data-move-down]')) {
      e.preventDefault();
      moveProductBy(pid, 1);
      return;
    }
    if (e.target.closest('[data-select-product]')) {
      selectProduct(item.getAttribute('data-doc-id') || pid);
    }
  });
  root.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    const item = handle.closest('[data-doc-id]');
    if (!item) return;
    e.preventDefault();
    startProductDrag(e, item);
  });
  root.addEventListener('keydown', (e) => {
    const item = e.target.closest('[data-doc-id]');
    if (!item) return;
    const pid = item.getAttribute('data-product-id');
    const onHandle = e.target.closest('[data-drag-handle], [data-move-up], [data-move-down]');
    if (!onHandle) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveProductBy(pid, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveProductBy(pid, 1);
    }
  });
}

function renderList() {
  const root = $('pricingProductList');
  if (!root) return;
  if (!products.length) {
    root.innerHTML = '<p class="muted">상품이 없습니다.</p>';
    return;
  }
  root.innerHTML = products.map((p, index) => {
    const charge = computeCharge(p, promotions);
    const active = (selectedDocId && p.docId === selectedDocId) || selectedId === p.productId ? ' is-active' : '';
    const status = p.status === 'active' ? '판매중' : p.status === 'paused' ? '중지' : '보관';
    const list = formatKrw(p.listPriceKrw);
    const sale = charge.ok ? formatKrw(charge.effectivePrice) : '-';
    const usdCharge = computeCharge(p, promotions, new Date(), 'USD');
    const usdBit = usdCharge.ok ? ` <span class="muted small">≈ ${esc(formatUsd(usdCharge.effectivePrice))}</span>` : '';
    const discounted = !!(charge.ok && charge.discount && Number(charge.effectivePrice) < Number(charge.basePrice));
    let line2 = '';
    if (p.type === 'lifetime') {
      line2 = discounted ? `Lifetime Full · ${esc(list)} → ${esc(sale)}` : `Lifetime Full · ${esc(list)}`;
    } else if (p.type === 'full_pass' || isPassProductId(p.productId)) {
      const days = Number(p.durationDays || canonicalPassDurationDays(p.productId) || 0);
      const kind = days > 0 ? `${days}일 Full` : '기간 Full';
      line2 = discounted ? `${esc(kind)} · ${esc(list)} → ${esc(sale)}` : `${esc(kind)} · ${esc(list)}`;
    } else if (p.type === 'credit_pack') {
      const credits = `+${p.creditAmount} Credits`;
      line2 = discounted
        ? `${esc(credits)} · ${esc(list)} → ${esc(sale)}`
        : `${esc(credits)} · ${esc(list)}`;
    } else {
      line2 = discounted ? `${esc(list)} → ${esc(sale)}` : esc(list);
    }
    if (usdBit) line2 += usdBit;
    const bits = [];
    if (discounted) bits.push(discountLabel(p));
    else if (p.type === 'credit_pack' && p.packSavePercent) bits.push(`약 ${p.packSavePercent}% 절약`);
    else if (p.type === 'full_pass' || isPassProductId(p.productId)) {
      const bundle = computePassBundleSavings(p, products);
      if (bundle?.ok) bits.push(formatPassBundleSavingsLabel(bundle, 'ko'));
    }
    const badge = badgeLabel(p.badge);
    if (badge) bits.push(badge);
    const delEval = productDeleteEval(p);
    const deleteHint = delEval.deletable
      ? ''
      : `<span class="muted small pricing-product-delete-hint">${esc(delEval.message)}</span>`;
    const upDisabled = index === 0 ? ' disabled' : '';
    const downDisabled = index === products.length - 1 ? ' disabled' : '';
    return `<div class="pricing-product-item${active}" data-product-id="${esc(p.productId)}" data-doc-id="${esc(p.docId || firestoreDocId(p.productId))}">
      <button type="button" class="pricing-drag-handle" data-drag-handle aria-label="드래그하여 순서 변경" title="드래그하여 순서 변경">
        <span aria-hidden="true">⠿</span>
      </button>
      <button type="button" class="pricing-product-item-body" data-select-product>
        <span class="pricing-product-item-top"><strong>${esc(p.nameKo || p.productId)}</strong><span class="badge">${esc(status)}</span></span>
        <span class="pricing-product-item-main">${line2}</span>
        ${bits.length ? `<span class="muted small">${esc(bits.join(' · '))}</span>` : ''}
        ${deleteHint}
        <span class="muted small pricing-product-item-id">${esc(p.productId)}</span>
      </button>
      <span class="pricing-reorder-btns">
        <button type="button" class="pricing-reorder-btn" data-move-up aria-label="위로 이동"${upDisabled}>↑</button>
        <button type="button" class="pricing-reorder-btn" data-move-down aria-label="아래로 이동"${downDisabled}>↓</button>
      </span>
    </div>`;
  }).join('') + '<div class="pricing-drop-indicator" hidden></div>';
}

function selectProduct(key) {
  const product = findCatalogProduct(products, key);
  if (!product) {
    flash('선택한 상품을 찾을 수 없습니다. 목록을 새로고침하세요.', false);
    return;
  }
  selectedDocId = product.docId || firestoreDocId(product.productId);
  selectedId = normalizeProductId(product.productId);
  draft = JSON.parse(JSON.stringify(product));
  previewBaselineProduct = JSON.parse(JSON.stringify(product));
  renderList();
  renderEditor();
  scheduleLivePreview();
}

function fill(id, value) {
  const el = $(id);
  if (el) el.value = value == null ? '' : String(value);
}

function check(id, on) {
  const el = $(id);
  if (el) el.checked = !!on;
}

function renderEditor() {
  const root = $('pricingEditor');
  if (!root || !draft) return;
  $('pricingEditorEmpty') && ($('pricingEditorEmpty').hidden = true);
  $('pricingEditorForm') && ($('pricingEditorForm').hidden = false);
  const isLife = draft.type === 'lifetime';
  const isPass = draft.type === 'full_pass' || isPassProductId(draft.productId);
  const isCredit = !isLife && !isPass;
  fill('draftProductId', draft.productId);
  fill('draftType', productTypeLabel(draft));
  fill('draftInternalType', draft.type || (isLife ? 'lifetime' : (isPass ? 'full_pass' : 'credit_pack')));
  fill('draftProductVersion', draft.productVersion || draft.pricingVersion || 1);
  fill('draftNameKo', draft.nameKo || '');
  fill('draftNameKoDisplay', draft.nameKo || '');
  fill('draftNameEn', draft.nameEn || '');
  fill('draftNameJa', draft.nameJa || '');
  fill('draftCredits', isCredit ? draft.creditAmount : '');
  const days = Number(
    draft.durationDays
    || canonicalPassDurationDays(draft.productId)
    || 0
  );
  fill('draftDurationDays', isPass ? days : '');
  fill('draftDurationEntitlement', isPass ? 'Full' : '');
  fill('draftEntitlement', isLife ? 'Lifetime' : (isPass ? 'Full' : ''));
  fill('draftAdvancedDuration', isPass ? days : '');
  fill('draftAdvancedEntitlement', draft.entitlement || (isLife ? 'lifetime' : (isPass ? 'full_pass' : 'credits')));

  const creditsWrap = $('draftCreditsWrap');
  const durationWrap = $('draftDurationWrap');
  const durationEntWrap = $('draftDurationEntitlementWrap');
  const entitlementWrap = $('draftEntitlementWrap');
  if (creditsWrap) creditsWrap.hidden = !isCredit;
  if (durationWrap) durationWrap.hidden = !isPass;
  if (durationEntWrap) durationEntWrap.hidden = !isPass;
  if (entitlementWrap) entitlementWrap.hidden = !isLife;
  const creditsInput = $('draftCredits');
  if (creditsInput) creditsInput.disabled = !isCredit;
  const durationInput = $('draftDurationDays');
  if (durationInput) {
    durationInput.disabled = !isPass;
    durationInput.readOnly = !isPass;
  }
  fill('draftPriceKrw', draft.listPriceKrw);
  fill('draftStatus', draft.status || 'active');
  fill('draftBadge', draft.badge || '');
  fill('draftDescKo', draft.descriptionKo || '');
  fill('draftDescEn', draft.descriptionEn || '');
  fill('draftDescJa', draft.descriptionJa || '');
  updateUsdPreview();
  const del = $('pricingDeleteBtn');
  const delHint = $('pricingDeleteHint');
  const delEval = productDeleteEval(draft);
  if (del) {
    del.hidden = false;
    del.disabled = !delEval.deletable;
  }
  if (delHint) {
    delHint.textContent = delEval.deletable ? '' : delEval.message;
    delHint.hidden = delEval.deletable;
  }
  renderActivePromotion();
  renderPassSavingsCompare();
}

function renderActivePromotion() {
  const body = $('draftActivePromoBody');
  if (!body || !draft) return;
  const now = new Date();
  const promo = findActivePromotionForProduct(draft.productId, promotions, now);
  if (!promo) {
    body.innerHTML = '<p class="muted">현재 적용 중인 프로모션이 없습니다.</p>';
    return;
  }
  const charge = computeCharge(draft, promotions, now);
  const st = promoWindowLabel(promo, now);
  const discLabel = promo.type === 'amount'
    ? `${Number(promo.value || 0).toLocaleString('ko-KR')}원 할인`
    : `${charge.discountPercent || promo.value}% 할인`;
  const usdCharge = computeCharge(draft, promotions, now, 'USD');
  const usdLine = usdCharge.ok
    ? ` / ${formatUsd(usdCharge.basePrice)} → ${formatUsd(usdCharge.effectivePrice)}`
    : '';
  body.innerHTML = `<div class="pricing-active-promo-card">
    <div class="pricing-active-promo-head"><strong>${esc(promo.nameKo || promo.id)}</strong><span class="badge">${esc(st)}</span></div>
    <p class="pricing-active-promo-disc">${esc(discLabel)}</p>
    <p class="pricing-active-promo-price">${esc(formatKrw(charge.basePrice))} → ${esc(formatKrw(charge.effectivePrice))}${esc(usdLine)}</p>
    <p class="muted small">${esc(formatPromoDateRange(promo.startsAt, promo.endsAt))}</p>
  </div>`;
}

function openPromotionForProduct(productId) {
  const pid = normalizeProductId(productId);
  const now = new Date();
  const match = promotions.find((p) => {
    if (p.archived === true) return false;
    const targets = (p.productIds || []).map(normalizeProductId);
    if (!targets.includes(pid)) return false;
    const st = windowStatus(p.enabled === true, p.startsAt, p.endsAt, now);
    return st === 'active' || st === 'scheduled';
  });
  setPane('promos');
  if (match) selectPromo(match.id);
  else {
    selectedPromoId = '';
    promoDraft = null;
    renderPromoList();
    renderPromoEditor();
  }
}

function syncDraftFromForm() {
  if (!draft) return;
  draft.nameKo = $('draftNameKo')?.value || '';
  fill('draftNameKoDisplay', draft.nameKo);
  draft.nameEn = $('draftNameEn')?.value || '';
  draft.nameJa = $('draftNameJa')?.value || '';
  const isLife = draft.type === 'lifetime';
  const isPass = draft.type === 'full_pass' || isPassProductId(draft.productId);
  if (isCreditType(draft)) draft.creditAmount = Number($('draftCredits')?.value || 0);
  else draft.creditAmount = 0;
  if (isPass) {
    draft.durationDays = Number($('draftDurationDays')?.value || 0);
    draft.entitlement = 'full_pass';
  } else {
    draft.durationDays = 0;
  }
  if (isLife) draft.entitlement = 'lifetime';
  if (isCreditType(draft)) draft.entitlement = 'credits';
  draft.listPriceKrw = Number($('draftPriceKrw')?.value || 0);
  draft.status = $('draftStatus')?.value || 'active';
  draft.badge = $('draftBadge')?.value || '';
  draft.descriptionKo = $('draftDescKo')?.value || '';
  draft.descriptionEn = $('draftDescEn')?.value || '';
  draft.descriptionJa = $('draftDescJa')?.value || '';
  draft.productDiscount = emptyDiscount();
  updateUsdPreview();
  renderActivePromotion();
  renderPassSavingsCompare();
  scheduleLivePreview(document.activeElement?.getAttribute?.('data-preview-field') || '');
}

function isCreditType(p) {
  if (!p) return false;
  if (p.type === 'lifetime' || p.type === 'full_pass' || isPassProductId(p.productId)) return false;
  return true;
}

function renderPassSavingsCompare() {
  const wrap = $('draftPassSavingsWrap');
  if (!wrap) return;
  if (!draft) {
    wrap.hidden = true;
    return;
  }
  const isPass = draft.type === 'full_pass' || isPassProductId(draft.productId);
  if (!isPass) {
    wrap.hidden = true;
    return;
  }
  // Live catalog: use other products' persisted prices + current draft price/duration.
  const catalogForCalc = products.map((p) => (
    normalizeProductId(p.productId) === normalizeProductId(draft.productId)
      ? { ...p, ...draft, listPriceKrw: draft.listPriceKrw, durationDays: draft.durationDays }
      : p
  ));
  if (!catalogForCalc.some((p) => normalizeProductId(p.productId) === normalizeProductId(draft.productId))) {
    catalogForCalc.push({ ...draft });
  }
  const probe = {
    ...draft,
    savingsReferenceProductId: draft.savingsReferenceProductId || resolvePassSavingsReferenceId(draft)
  };
  const savings = computePassBundleSavings(probe, catalogForCalc);
  wrap.hidden = false;
  const setT = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  if (!savings?.ok) {
    setT('draftSaveRefName', '-');
    setT('draftSaveQty', '-');
    setT('draftSaveCompare', '-');
    setT('draftSaveCurrent', formatKrw(draft.listPriceKrw));
    setT('draftSaveAmount', '-');
    setT('draftSavePercent', '절약 없음 (표시 안 함)');
    setT('draftSaveHint', '판매 중인 더 작은 Credit 팩 단가 대비로만 표시됩니다. 기준 팩이 판매 중이 아니면 숨깁니다.');
    return;
  }
  setT('draftSaveRefName', savings.referenceNameKo || savings.referenceProductId);
  setT('draftSaveQty', `${savings.quantity}회`);
  setT('draftSaveCompare', formatKrw(savings.comparisonPrice));
  setT('draftSaveCurrent', formatKrw(savings.currentPrice));
  setT('draftSaveAmount', formatKrw(savings.savingAmount));
  setT('draftSavePercent', `약 ${savings.savingPercent}%`);
  setT('draftSaveHint', formatPassBundleSavingsLabel(savings, 'ko') + ' · 자동 계산 (직접 입력 불가)');
}

async function saveDraft() {
  if (!draft) {
    flash('저장할 상품이 없습니다. 왼쪽에서 상품을 선택하세요.', false);
    return;
  }
  if (!isAdmin) {
    flash('관리자 권한이 없어 저장할 수 없습니다. 관리자 계정으로 다시 로그인하세요.', false);
    return;
  }
  if (!db || !fs) {
    flash('Firestore가 아직 연결되지 않았습니다. 잠시 후 다시 시도하세요.', false);
    return;
  }
  syncDraftFromForm();
  // Immutable identity: never derive save target from sortOrder / list index / display name.
  const formProductId = normalizeProductId($('draftProductId')?.value || '');
  if (!formProductId) throw new Error('상품 저장 실패: 폼 상품 ID가 비어 있습니다.');
  const priorDraftPid = normalizeProductId(draft.productId);
  const mismatch = editTargetMismatchMessage(priorDraftPid, formProductId);
  if (mismatch) throw new Error(`상품 저장 실패: ${mismatch}`);
  draft.productId = formProductId;
  const docId = firestoreDocId(formProductId);
  const invariant = assertSaveTargetInvariant({
    selectedDocId: selectedDocId || docId,
    draftProductId: draft.productId,
    formProductId,
    saveDocId: docId
  });
  if (!invariant.ok) {
    console.error('SAVE_TARGET_INVARIANT', invariant);
    throw new Error(`상품 저장 실패: target invariant (${invariant.reason})`);
  }
  selectedDocId = docId;
  selectedId = formProductId;
  const errors = validateProductFields(draft, { isNew: false });
  if (errors.length) throw new Error(`상품 저장 실패: ${errors[0]}`);
  const current = findCatalogProduct(products, docId) || {};
  if (normalizeProductId(current.productId || '') && normalizeProductId(current.productId) !== formProductId) {
    throw new Error(`상품 저장 실패: catalog row mismatch (${current.productId} ≠ ${formProductId})`);
  }
  const nextProducts = products.map((p) => (normalizeProductId(p.productId) === formProductId ? draft : p));
  const conflicts = findDiscountConflicts(nextProducts, promotions);
  if (conflicts.length) throw new Error(`CONFLICT: ${conflicts[0].productId}에 할인이 겹칩니다.`);
  const warnPrice = priceChangeWarning(current.listPriceKrw, draft.listPriceKrw);
  const warnCredits = draft.type === 'credit_pack'
    ? creditChangeWarning(current.creditAmount, draft.creditAmount)
    : '';
  const curDays = Number(current.durationDays || 0);
  const nextDays = Number(draft.durationDays || 0);
  const warnDuration = (isPassProductId(draft.productId) || draft.type === 'full_pass')
    && curDays > 0 && nextDays > 0 && curDays !== nextDays
    ? `이용 기간이 ${curDays}일 → ${nextDays}일로 변경됩니다.\n이미 구매한 사용자의 남은 기간은 변경되지 않으며, 이후 신규 구매에만 적용됩니다.`
    : '';
  const warn = warnPrice || warnCredits || warnDuration;
  if (warn && !window.confirm(warn)) {
    flash('저장이 취소되었습니다.', false);
    return;
  }
  // Type/entitlement locked from catalog row (or productId), not from editable name fields.
  const lockedType = current.type
    || (formProductId === 'LIFETIME' ? 'lifetime' : (isPassProductId(formProductId) ? 'full_pass' : 'credit_pack'));
  draft.type = lockedType;
  const isPass = lockedType === 'full_pass' || isPassProductId(formProductId);
  const isLife = lockedType === 'lifetime' || formProductId === 'LIFETIME';
  const version = bumpVersion(current, {
    priceChanged: Number(current.listPriceKrw) !== Number(draft.listPriceKrw),
    creditsChanged: draft.type === 'credit_pack'
      && Number(current.creditAmount) !== Number(draft.creditAmount),
    durationChanged: isPass
      && Number(current.durationDays || 0) !== Number(draft.durationDays || 0),
    nameChanged: String(current.nameKo || '') !== String(draft.nameKo || '')
      || String(current.nameEn || '') !== String(draft.nameEn || '')
      || String(current.nameJa || '') !== String(draft.nameJa || '')
  });
  const { doc, setDoc, serverTimestamp } = fs;
  const payload = {
    productId: formProductId,
    type: isPass ? 'full_pass' : (isLife ? 'lifetime' : 'credit_pack'),
    nameKo: draft.nameKo,
    nameEn: draft.nameEn,
    nameJa: draft.nameJa,
    name: draft.nameKo || draft.nameEn,
    descriptionKo: draft.descriptionKo,
    descriptionEn: draft.descriptionEn,
    descriptionJa: draft.descriptionJa,
    creditAmount: isPass || isLife ? 0 : Number(draft.creditAmount),
    durationDays: isPass ? Math.max(0, Math.floor(Number(draft.durationDays) || 0)) : 0,
    entitlement: isLife ? 'lifetime' : (isPass ? 'full_pass' : 'credits'),
    listPriceKrw: Number(draft.listPriceKrw),
    status: draft.status,
    sortOrder: Number(draft.sortOrder),
    order: Number(draft.sortOrder),
    badge: draft.badge,
    // Pass bundle savings are runtime-derived — never persist stale packSavePercent.
    packSavePercent: isPass || isLife ? null : (draft.packSavePercent ?? null),
    savingsReferenceProductId: isPass
      ? (draft.savingsReferenceProductId || resolvePassSavingsReferenceId(draft) || 'PASS_30D')
      : null,
    productVersion: version,
    pricingVersion: version,
    productDiscount: emptyDiscount(),
    plan: isLife ? 'lifetime' : (isPass ? 'period' : 'credits'),
    updatedAt: serverTimestamp()
  };
  if (isLife || isPass) {
    const prevRegions = draft.regions || {};
    const prevKr = prevRegions.KR || {};
    const price = Number(draft.listPriceKrw);
    // Prefer current display name for new PortOne orderName (do not keep stale seed names).
    const krOrderName = draft.orderNameKo
      || draft.nameKo
      || prevKr.orderName
      || (isLife ? 'MidiAI Studio Lifetime Full' : draft.productId);
    payload.regions = {
      ...prevRegions,
      KR: {
        ...prevKr,
        payment: prevKr.payment || 'portone',
        currency: 'KRW',
        listPrice: price,
        salePrice: price,
        orderName: krOrderName,
        portoneProductId: prevKr.portoneProductId || (isLife ? 'midiai-lifetime' : draft.productId)
      }
    };
    if (isLife) {
      const prevGlobal = prevRegions.Global || {};
      payload.regions.Global = {
        ...prevGlobal,
        payment: 'paypal',
        currency: 'USD',
        orderName: draft.orderNameEn || draft.nameEn || prevGlobal.orderName || 'MidiAI Studio Lifetime Full'
      };
      payload.plan = 'lifetime';
      payload.name = draft.nameKo || draft.nameEn || 'Lifetime Full';
    }
  }
  const expectedPrice = Number(draft.listPriceKrw);
  await setDoc(doc(db, 'products', docId), payload, { merge: true });
  const { getDoc } = fs;
  const verifySnap = await getDoc(doc(db, 'products', docId));
  if (!verifySnap.exists()) {
    throw new Error('저장 검증 실패: Firestore 문서를 읽을 수 없습니다.');
  }
  const saved = verifySnap.data() || {};
  const savedPid = normalizeProductId(saved.productId || docId);
  if (savedPid !== formProductId) {
    throw new Error(`저장 검증 실패: Firestore productId=${savedPid} / expected=${formProductId}`);
  }
  const savedPrice = Number(
    saved.listPriceKrw != null
      ? saved.listPriceKrw
      : ((saved.regions || {}).KR || {}).listPrice
  );
  if (!Number.isFinite(savedPrice) || savedPrice !== expectedPrice) {
    throw new Error(`저장 검증 실패: 요청 ${expectedPrice}원 / Firestore ${savedPrice}원`);
  }
  const savedKr = saved.regions?.KR || {};
  const regionList = Number(savedKr.listPrice);
  if (
    (draft.type === 'full_pass' || draft.type === 'lifetime' || isPassProductId(draft.productId))
    && Number.isFinite(regionList)
    && regionList > 0
    && regionList !== expectedPrice
  ) {
    throw new Error(`저장 검증 실패: regions.KR.listPrice=${regionList} / listPriceKrw=${expectedPrice}`);
  }
  await audit('product_update', `${draft.productId} 저장`, {
    price: current.listPriceKrw, credits: current.creditAmount, version: current.productVersion
  }, { price: draft.listPriceKrw, credits: draft.creditAmount, version });
  flash('상품이 저장되었습니다.');
  previewBaselineProduct = draft ? JSON.parse(JSON.stringify(draft)) : null;
  updatePreviewSaveState();
  scheduleLivePreview();
  await loadAll();
  selectProduct(docId);
  const refreshed = findCatalogProduct(products, docId);
  if (refreshed && Number(refreshed.listPriceKrw) !== expectedPrice) {
    flash(`저장은 됐지만 목록 갱신이 ${formatKrw(refreshed.listPriceKrw)}입니다. 페이지를 새로고침하세요.`, false);
  }
}

function openAddModal() {
  const modal = $('pricingCreateModal');
  if (modal) modal.hidden = false;
  syncCreateModalFields();
}

function closeAddModal() {
  const modal = $('pricingCreateModal');
  if (modal) modal.hidden = true;
}

async function createProductFromModal() {
  const type = $('newProductType')?.value || 'credit_pack';
  const productId = normalizeProductId($('newProductId')?.value || '');
  const nameKo = $('newProductName')?.value || '';
  const credits = Number($('newProductCredits')?.value || 0);
  const durationDays = type === 'full_pass'
    ? Number($('newProductDuration')?.value || canonicalPassDurationDays(productId) || 0)
    : 0;
  const price = Number($('newProductPrice')?.value || 0);
  const payload = {
    productId,
    type,
    nameKo,
    nameEn: nameKo,
    nameJa: nameKo,
    creditAmount: type === 'credit_pack' ? credits : 0,
    durationDays: type === 'full_pass' ? durationDays : 0,
    entitlement: type === 'lifetime' ? 'lifetime' : (type === 'full_pass' ? 'full_pass' : 'credits'),
    listPriceKrw: price,
    status: 'active',
    sortOrder: nextProductSortOrder(products),
    badge: type === 'full_pass' && productId === 'PASS_30D' ? 'recommended' : '',
    productVersion: 1,
    productDiscount: emptyDiscount(),
    plan: type === 'lifetime' ? 'lifetime' : (type === 'full_pass' ? 'period' : 'credits')
  };
  if (type === 'full_pass' || type === 'lifetime') {
    payload.regions = {
      KR: {
        payment: 'portone',
        currency: 'KRW',
        listPrice: price,
        salePrice: price,
        orderName: nameKo || productId,
        portoneProductId: type === 'lifetime' ? 'midiai-lifetime' : productId
      }
    };
  }
  const errors = validateProductFields(payload, { isNew: true });
  if (products.some((p) => p.productId === productId)) errors.push('이미 존재하는 상품 ID입니다.');
  if (errors.length) throw new Error(errors[0]);
  const { doc, setDoc, serverTimestamp } = fs;
  await setDoc(doc(db, 'products', firestoreDocId(productId)), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    hasPurchases: false
  });
  await audit('product_create', `${productId} 생성`, null, payload);
  closeAddModal();
  flash('상품을 추가했습니다.');
  await loadAll();
  selectProduct(productId);
}

function syncCreateModalFields() {
  const type = $('newProductType')?.value || 'credit_pack';
  const creditsWrap = $('newProductCreditsWrap');
  const durationWrap = $('newProductDurationWrap');
  if (creditsWrap) creditsWrap.hidden = type !== 'credit_pack';
  if (durationWrap) durationWrap.hidden = type !== 'full_pass';
  const idInput = $('newProductId');
  if (idInput && type === 'full_pass' && !String(idInput.value || '').trim()) {
    idInput.placeholder = 'PASS_60D';
  }
}

async function cloneProduct() {
  if (!draft) return;
  const nextId = window.prompt('복제할 새 상품 ID', `${draft.productId}_COPY`);
  if (!nextId) return;
  $('newProductType').value = draft.type;
  $('newProductId').value = nextId;
  $('newProductName').value = draft.nameKo;
  $('newProductCredits').value = draft.creditAmount;
  $('newProductPrice').value = draft.listPriceKrw;
  await createProductFromModal();
}

async function archiveProduct() {
  if (!draft) return;
  draft.status = 'archived';
  fill('draftStatus', 'archived');
  await saveDraft();
}

async function deleteProduct() {
  const delEval = productDeleteEval(draft);
  if (!draft || !delEval.deletable) {
    throw new Error(deleteBlockMessage(delEval.reason));
  }
  if (!window.confirm('이 상품을 삭제하시겠습니까?\n삭제된 상품은 가격표와 판매 목록에서 제거됩니다.')) return;
  const { doc, deleteDoc } = fs;
  await recordCatalogDeletion(draft.productId);
  await deleteDoc(doc(db, 'products', firestoreDocId(draft.productId)));
  await audit('product_delete', `${draft.productId} 삭제`, draft, null);
  selectedId = null;
  selectedDocId = null;
  flash('상품을 삭제했습니다.');
  await loadAll();
}

function promoStatus(p) {
  return windowStatus(p.enabled === true && p.archived !== true, p.startsAt, p.endsAt);
}

function promoTargetNames(p) {
  return (p.productIds || []).map((id) => {
    const prod = products.find((x) => normalizeProductId(x.productId) === normalizeProductId(id));
    return prod?.nameKo || id;
  }).join(' · ') || '-';
}

function promoListSort(a, b) {
  const rank = { active: 0, scheduled: 1, ended: 2, disabled: 3 };
  const ra = rank[promoStatus(a)] ?? 4;
  const rb = rank[promoStatus(b)] ?? 4;
  if (ra !== rb) return ra - rb;
  return String(b.startsAt || '').localeCompare(String(a.startsAt || ''));
}

function formatPromoListDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderPromoList() {
  const root = $('pricingPromoList');
  if (!root) return;
  if (!promotions.length) {
    root.innerHTML = '<p class="muted">이벤트가 없습니다.</p>';
    return;
  }
  const rows = [...promotions].sort(promoListSort);
  root.innerHTML = rows.map((p) => {
    const st = promoWindowLabel(p);
    const targets = promoTargetNames(p);
    const disc = p.type === 'amount' ? `${Number(p.value || 0).toLocaleString('ko-KR')}원` : `${p.value}%`;
    const active = selectedPromoId === p.id ? ' is-active' : '';
    const range = `${formatPromoListDate(p.startsAt)} ~ ${formatPromoListDate(p.endsAt)}`;
    return `<button type="button" class="pricing-product-item${active}" data-promo-id="${esc(p.id)}">
      <span class="pricing-product-item-top"><strong>${esc(p.nameKo || p.promotionId || p.id)}</strong><span class="badge">${esc(st)}</span></span>
      <span class="pricing-product-item-main">${esc(disc)} · ${esc(targets)}</span>
      <span class="muted small">${esc(range)}</span>
      <span class="muted small">팝업 ${p.homepagePopupEnabled ? 'ON' : 'OFF'}</span>
    </button>`;
  }).join('');
  root.querySelectorAll('[data-promo-id]').forEach((btn) => {
    btn.addEventListener('click', () => selectPromo(btn.getAttribute('data-promo-id')));
  });
}

function emptyPromo() {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: '',
    promotionId: '',
    nameKo: '',
    nameEn: '',
    nameJa: '',
    enabled: true,
    archived: false,
    type: 'percent',
    value: 10,
    productIds: [],
    productOverrides: {},
    startsAt: now.toISOString(),
    endsAt: end.toISOString(),
    homepagePopupEnabled: false,
    popupTitleKo: '',
    popupTitleEn: '',
    popupTitleJa: '',
    popupBodyKo: '',
    popupBodyEn: '',
    popupBodyJa: '',
    popupCtaKo: '가격 보기',
    popupCtaEn: 'See pricing',
    popupCtaJa: '料金を見る',
    ctaUrl: './purchase.html',
    badgeKo: '',
    badgeEn: '',
    badgeJa: '',
    version: 1
  };
}

function startNewPromo() {
  promoDraft = emptyPromo();
  selectedPromoId = '';
  previewBaselinePromo = emptyPromo();
  previewBaselinePromo.enabled = true;
  renderPromoList();
  renderPromoEditor();
  setPane('promos');
  scheduleLivePreview();
}

function selectPromo(id) {
  selectedPromoId = id;
  const found = promotions.find((p) => p.id === id);
  promoDraft = found ? JSON.parse(JSON.stringify(found)) : emptyPromo();
  previewBaselinePromo = found ? JSON.parse(JSON.stringify(found)) : null;
  renderPromoList();
  renderPromoEditor();
  scheduleLivePreview();
}

function renderPromoEditor() {
  const empty = $('pricingPromoEmpty');
  const form = $('pricingPromoForm');
  if (!promoDraft) {
    if (empty) empty.hidden = false;
    if (form) form.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  if (form) form.hidden = false;
  fill('promoNameKo', promoDraft.nameKo || '');
  fill('promoNameEn', promoDraft.nameEn || '');
  fill('promoNameJa', promoDraft.nameJa || '');
  check('promoEnabledFlag', promoDraft.enabled === true);
  fill('promoType', promoDraft.type || 'percent');
  fill('promoValue', promoDraft.value || '');
  fill('promoStart', toDatetimeLocalValue(promoDraft.startsAt));
  fill('promoEnd', toDatetimeLocalValue(promoDraft.endsAt));
  check('promoPopupEnabled', promoDraft.homepagePopupEnabled === true);
  fill('promoPopupTitleKo', promoDraft.popupTitleKo || '');
  fill('promoPopupTitleEn', promoDraft.popupTitleEn || '');
  fill('promoPopupTitleJa', promoDraft.popupTitleJa || '');
  fill('promoPopupBodyKo', promoDraft.popupBodyKo || '');
  fill('promoPopupBodyEn', promoDraft.popupBodyEn || '');
  fill('promoPopupBodyJa', promoDraft.popupBodyJa || '');
  fill('promoPopupCtaKo', promoDraft.popupCtaKo || '');
  fill('promoPopupCtaEn', promoDraft.popupCtaEn || '');
  fill('promoPopupCtaJa', promoDraft.popupCtaJa || '');
  fill('promoCtaUrl', promoDraft.ctaUrl || './purchase.html');
  const box = $('promoProductTargets');
  if (box) {
    const selected = new Set((promoDraft.productIds || []).map(normalizeProductId));
    box.innerHTML = products
      .filter((p) => p.status !== 'archived')
      .map((p) => `<label class="pricing-check"><input type="checkbox" data-promo-target="${esc(p.productId)}" ${selected.has(normalizeProductId(p.productId)) ? 'checked' : ''}> ${esc(p.nameKo || p.productId)}</label>`)
      .join('');
    box.querySelectorAll('[data-promo-target]').forEach((el) => {
      el.addEventListener('change', () => {
        renderPromoPreview();
        scheduleLivePreview('discount');
      });
    });
  }
  renderPromoPreview();
  scheduleLivePreview();
}

function renderPromoPreview() {
  const body = $('promoPreviewBody');
  if (!body || !promoDraft) return;
  readPromoForm();
  const targets = promotionTargetIds(promoDraft);
  const value = Number(promoDraft.value || 0);
  if (!targets.length || !(value > 0)) {
    body.innerHTML = '<p class="muted">대상 상품과 할인 값을 선택하면 미리보기가 표시됩니다.</p>';
    scheduleLivePreview();
    return;
  }
  const catalog = buildPreviewCatalog();
  const resolved = resolvePromotionProducts(promoDraft, catalog, {
    lang: 'ko',
    forceActive: true,
    maxVisible: Infinity
  });
  const head = resolved.discountType === 'amount'
    ? `${Number(resolved.discountValue || 0).toLocaleString('ko-KR')}원 할인`
    : `${resolved.discountPercent || value}% 할인`;
  const countLine = `<p class="muted small">대상 상품 ${resolved.products.length}개</p>`;
  const lines = resolved.products.map((p) => (
    `<div class="pricing-disc-preview-row"><span>${esc(p.name)}</span><strong>${esc(p.listLabel)} → ${esc(p.saleLabel)}</strong></div>`
  )).join('');
  body.innerHTML = `${countLine}<p class="pricing-active-promo-disc">${esc(head)}</p>${lines || '<p class="muted">대상 상품을 찾을 수 없습니다.</p>'}`;
  scheduleLivePreview();
}

function readPromoForm() {
  if (!promoDraft) promoDraft = emptyPromo();
  promoDraft.nameKo = $('promoNameKo')?.value || '';
  promoDraft.nameEn = $('promoNameEn')?.value || promoDraft.nameKo;
  promoDraft.nameJa = $('promoNameJa')?.value || promoDraft.nameKo;
  promoDraft.enabled = !!$('promoEnabledFlag')?.checked;
  promoDraft.type = $('promoType')?.value || 'percent';
  promoDraft.value = Number($('promoValue')?.value || 0);
  promoDraft.startsAt = fromDatetimeLocalValue($('promoStart')?.value);
  promoDraft.endsAt = fromDatetimeLocalValue($('promoEnd')?.value);
  promoDraft.homepagePopupEnabled = !!$('promoPopupEnabled')?.checked;
  promoDraft.popupTitleKo = $('promoPopupTitleKo')?.value || '';
  promoDraft.popupTitleEn = $('promoPopupTitleEn')?.value || '';
  promoDraft.popupTitleJa = $('promoPopupTitleJa')?.value || '';
  promoDraft.popupBodyKo = $('promoPopupBodyKo')?.value || '';
  promoDraft.popupBodyEn = $('promoPopupBodyEn')?.value || '';
  promoDraft.popupBodyJa = $('promoPopupBodyJa')?.value || '';
  promoDraft.popupCtaKo = $('promoPopupCtaKo')?.value || '';
  promoDraft.popupCtaEn = $('promoPopupCtaEn')?.value || '';
  promoDraft.popupCtaJa = $('promoPopupCtaJa')?.value || '';
  promoDraft.ctaUrl = $('promoCtaUrl')?.value || './purchase.html';
  promoDraft.productIds = [...document.querySelectorAll('[data-promo-target]:checked')].map((el) => el.getAttribute('data-promo-target'));
  return promoDraft;
}

async function savePromo() {
  const payload = readPromoForm();
  const errors = validatePromotionFields(payload, products);
  if (errors.length) throw new Error(errors[0]);
  const nextList = promotions.filter((p) => p.id !== payload.id).concat([payload]);
  const conflicts = findDiscountConflicts(products, nextList, payload.id);
  if (conflicts.length) throw new Error(`CONFLICT: ${conflicts[0].productId} 기간이 겹칩니다. 저장하지 않았습니다.`);
  const { collection, doc, setDoc, addDoc, serverTimestamp } = fs;
  const data = { ...payload, updatedAt: serverTimestamp(), archived: false };
  delete data.id;
  if (payload.id) {
    data.version = Number(payload.version || 1) + 1;
    await setDoc(doc(db, 'promotions', payload.id), data, { merge: true });
  } else {
    data.createdAt = serverTimestamp();
    data.version = 1;
    const ref = await addDoc(collection(db, 'promotions'), data);
    selectedPromoId = ref.id;
  }
  await audit('promotion_save', `${payload.nameKo} ${payload.productIds.join(',')} ${payload.value}${payload.type === 'percent' ? '%' : '원'}`, null, {
    startsAt: payload.startsAt, endsAt: payload.endsAt, productIds: payload.productIds
  });
  flash('이벤트를 저장했습니다.');
  previewBaselinePromo = promoDraft ? JSON.parse(JSON.stringify(promoDraft)) : null;
  updatePreviewSaveState();
  await loadAll();
}

async function clonePromo() {
  if (!promoDraft) return;
  const copy = { ...readPromoForm(), id: '', promotionId: '', nameKo: `${promoDraft.nameKo} 복제` };
  promoDraft = copy;
  selectedPromoId = '';
  renderPromoEditor();
  flash('복제본을 편집한 뒤 저장하세요.');
}

async function archivePromo() {
  if (!promoDraft?.id) return;
  const { doc, setDoc, serverTimestamp } = fs;
  await setDoc(doc(db, 'promotions', promoDraft.id), {
    archived: true,
    enabled: false,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await audit('promotion_archive', `${promoDraft.nameKo} 보관`, promoDraft, { archived: true });
  flash('이벤트를 보관했습니다.');
  await loadAll();
}

const pricingAdminApi = {
  initPricingAdmin,
  setPricingAdminAuth,
  openPromotionForProduct,
  selectPromotion: selectPromo,
  setPricingPane: setPane
};
if (typeof window !== 'undefined') window.__midiaiPricingAdmin = pricingAdminApi;

if ((location.pathname.split('/').pop() || '') === 'admin.html') {
  initPricingAdmin();
}
