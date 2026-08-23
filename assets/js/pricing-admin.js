/**
 * Admin: Credit + Pass (기간 이용권) + Lifetime catalog, discounts, and promotions.
 */
import {
  SEED_PRODUCTS,
  bumpVersion,
  canonicalPassDurationDays,
  computeCharge,
  creditChangeWarning,
  emptyDiscount,
  findDiscountConflicts,
  firestoreDocId,
  formatKrw,
  fromDatetimeLocalValue,
  hydrateLegacyProduct,
  isCanonicalPassProductId,
  isPassProductId,
  isSeedProduct,
  normalizeProductId,
  priceChangeWarning,
  productTypeLabel,
  toDatetimeLocalValue,
  unitPrice,
  validateProductFields,
  validatePromotionFields,
  windowStatus
} from './catalog-engine.js?v=dyn-catalog-1';
import { writeAdminAuditLog } from './admin-user-logs.js?v=admin-logs-detail-1';
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
let selectedPromoId = null;
let draft = null;
let promoDraft = null;
let booted = false;
let loading = false;
let pane = 'products';

function $(id) { return document.getElementById(id); }

function isCreditCatalogProduct(p) {
  if (!p) return false;
  const id = normalizeProductId(p.productId || p.id);
  return p.type === 'credit_pack' || id.startsWith('CREDIT_') || id.startsWith('POINT_');
}

function canDeleteCatalogProduct(p) {
  if (!p) return false;
  if (isCreditCatalogProduct(p)) return true;
  return !isSeedProduct(p.productId) && p.hasPurchases !== true;
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
  bind('pricingCancelBtn', () => { if (selectedId) selectProduct(selectedId); });
  bind('pricingCloneBtn', () => cloneProduct().catch((e) => flash(e.message || e, false)));
  bind('pricingArchiveBtn', () => archiveProduct().catch((e) => flash(e.message || e, false)));
  bind('pricingDeleteBtn', () => deleteProduct().catch((e) => flash(e.message || e, false)));
  bind('pricingAddPromo', () => startNewPromo());
  bind('pricingSavePromoBtn', () => savePromo().catch((e) => flash(e.message || e, false)));
  bind('pricingClonePromoBtn', () => clonePromo().catch((e) => flash(e.message || e, false)));
  bind('pricingArchivePromoBtn', () => archivePromo().catch((e) => flash(e.message || e, false)));
  bind('pricingCreateConfirm', () => createProductFromModal().catch((e) => flash(e.message || e, false)));
  bind('pricingCreateCancel', () => closeAddModal());
  bind('newProductType', () => syncCreateModalFields(), 'change');
  ['draftNameKo', 'draftNameEn', 'draftNameJa', 'draftCredits', 'draftDurationDays', 'draftPriceKrw', 'draftPriceUsd',
    'draftStatus', 'draftSort', 'draftBadge', 'draftDescKo', 'draftDescEn', 'draftDescJa',
    'draftDiscEnabled', 'draftDiscType', 'draftDiscValue', 'draftDiscStart', 'draftDiscEnd'
  ].forEach((id) => bind(id, () => syncDraftFromForm(), 'input'));
  ['draftDiscEnabled', 'draftDiscType', 'draftStatus', 'draftBadge'].forEach((id) => bind(id, () => syncDraftFromForm(), 'change'));
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
  const snap = await getDocs(collection(db, 'products'));
  const existing = new Set(snap.docs.map((d) => normalizeProductId(d.id)));
  for (const seed of SEED_PRODUCTS) {
    if (seed.type === 'credit_pack') continue;
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
  // CREDIT_* sales pause only (ledger/engine kept).
  for (const creditId of ['CREDIT_5', 'CREDIT_30', 'CREDIT_100']) {
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

async function loadAll() {
  if (loading || !db || !fs || !isAdmin) return;
  loading = true;
  setListStatus('<p class="muted">불러오는 중…</p>');
  try {
    try { await ensureSeed(); } catch (e) { console.warn('catalog seed', e); }
    const { collection, getDocs } = fs;
    const prodSnap = await getDocs(collection(db, 'products'));
    products = prodSnap.docs
      .map((d) => hydrateLegacyProduct({ id: d.id, ...d.data() }))
      .filter((p) => !['POINT_5', 'POINT_30', 'POINT_100'].includes(p.productId))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.productId).localeCompare(b.productId));
    try {
      const promoSnap = await getDocs(collection(db, 'promotions'));
      promotions = promoSnap.docs.map((d) => ({ id: d.id, promotionId: d.id, ...d.data() }))
        .sort((a, b) => String(b.startsAt || '').localeCompare(String(a.startsAt || '')));
    } catch (e) {
      promotions = [];
      console.warn('promotions', e);
    }
    renderSummary();
    renderList();
    renderPromoList();
    if (!selectedId && products[0]) selectProduct(products[0].productId);
    else if (selectedId) selectProduct(selectedId);
    if (!selectedPromoId && promotions[0]) selectPromo(promotions[0].id);
  } catch (e) {
    setListStatus(`<p class="muted">불러오기 실패: ${esc(e.message || e)}</p>`);
  } finally {
    loading = false;
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

function discountEndsLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}월 ${d.getDate()}일까지`;
}

function renderList() {
  const root = $('pricingProductList');
  if (!root) return;
  if (!products.length) {
    root.innerHTML = '<p class="muted">상품이 없습니다.</p>';
    return;
  }
  root.innerHTML = products.map((p) => {
    const charge = computeCharge(p, promotions);
    const active = selectedId === p.productId ? ' is-active' : '';
    const status = p.status === 'active' ? '판매중' : p.status === 'paused' ? '중지' : '보관';
    const list = formatKrw(p.listPriceKrw);
    const sale = charge.ok ? formatKrw(charge.effectivePrice) : '-';
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
    const bits = [];
    if (discounted) bits.push(discountLabel(p));
    else if (p.type === 'credit_pack' && p.packSavePercent) bits.push(`약 ${p.packSavePercent}% 절약`);
    else if ((p.type === 'full_pass' || isPassProductId(p.productId)) && p.packSavePercent) {
      bits.push(`약 ${p.packSavePercent}% 절약`);
    }
    const badge = badgeLabel(p.badge);
    if (badge) bits.push(badge);
    return `<button type="button" class="pricing-product-item${active}" data-product-id="${esc(p.productId)}">
      <span class="pricing-product-item-top"><strong>${esc(p.nameKo || p.productId)}</strong><span class="badge">${esc(status)}</span></span>
      <span class="pricing-product-item-main">${line2}</span>
      ${bits.length ? `<span class="muted small">${esc(bits.join(' · '))}</span>` : ''}
      <span class="muted small pricing-product-item-id">${esc(p.productId)}</span>
    </button>`;
  }).join('');
  root.querySelectorAll('[data-product-id]').forEach((btn) => {
    btn.addEventListener('click', () => selectProduct(btn.getAttribute('data-product-id')));
  });
}

function selectProduct(id) {
  selectedId = normalizeProductId(id);
  const product = products.find((p) => p.productId === selectedId);
  if (!product) return;
  draft = JSON.parse(JSON.stringify(product));
  renderList();
  renderEditor();
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
    durationInput.disabled = isCanonicalPassProductId(draft.productId);
    durationInput.readOnly = isCanonicalPassProductId(draft.productId);
  }
  fill('draftPriceKrw', draft.listPriceKrw);
  fill('draftPriceUsd', draft.listPriceUsd == null ? '' : draft.listPriceUsd);
  fill('draftStatus', draft.status || 'active');
  fill('draftSort', draft.sortOrder || 0);
  fill('draftBadge', draft.badge || '');
  fill('draftDescKo', draft.descriptionKo || '');
  fill('draftDescEn', draft.descriptionEn || '');
  fill('draftDescJa', draft.descriptionJa || '');
  const disc = draft.productDiscount || emptyDiscount();
  check('draftDiscEnabled', disc.enabled === true);
  fill('draftDiscType', disc.type || 'percent');
  fill('draftDiscValue', disc.value || '');
  fill('draftDiscStart', toDatetimeLocalValue(disc.startsAt));
  fill('draftDiscEnd', toDatetimeLocalValue(disc.endsAt));
  updateDiscValueLabel(disc.type || 'percent');
  updateDiscountVisibility(disc.enabled === true);
  const usdHint = $('draftUsdHint');
  if (usdHint) {
    if (isPass) {
      usdHint.textContent = draft.listPriceUsd != null && draft.listPriceUsd !== ''
        ? 'USD 설정됨 · 해외(PayPal) PASS 판매는 아직 미사용'
        : 'USD 미설정 · 해외 판매 미사용 (KR PortOne만)';
    } else {
      usdHint.textContent = draft.listPriceUsd != null && draft.listPriceUsd !== ''
        ? 'PayPal 판매 가능'
        : 'USD 미설정 · PayPal 판매 안 함';
    }
  }
  const del = $('pricingDeleteBtn');
  if (del) del.hidden = !canDeleteCatalogProduct(draft);
  renderPreview();
}

function updateDiscValueLabel(type) {
  const title = $('draftDiscValueTitle');
  const unit = $('draftDiscValueUnit');
  const amount = type === 'amount';
  if (title) title.textContent = amount ? '할인금액' : '할인율';
  if (unit) unit.textContent = amount ? '원' : '%';
}

function updateDiscountVisibility(enabled) {
  const fields = $('draftDiscFields');
  const offNote = $('draftDiscOffNote');
  if (fields) fields.hidden = !enabled;
  if (offNote) offNote.hidden = !!enabled;
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
    if (isCanonicalPassProductId(draft.productId)) {
      draft.durationDays = canonicalPassDurationDays(draft.productId);
    } else {
      draft.durationDays = Number($('draftDurationDays')?.value || 0);
    }
    draft.entitlement = 'full_pass';
  } else {
    draft.durationDays = 0;
  }
  if (isLife) draft.entitlement = 'lifetime';
  if (isCreditType(draft)) draft.entitlement = 'credits';
  draft.listPriceKrw = Number($('draftPriceKrw')?.value || 0);
  const usd = $('draftPriceUsd')?.value;
  draft.listPriceUsd = usd === '' ? null : Number(usd);
  draft.status = $('draftStatus')?.value || 'active';
  draft.sortOrder = Number($('draftSort')?.value || 0);
  draft.badge = $('draftBadge')?.value || '';
  draft.descriptionKo = $('draftDescKo')?.value || '';
  draft.descriptionEn = $('draftDescEn')?.value || '';
  draft.descriptionJa = $('draftDescJa')?.value || '';
  const discType = $('draftDiscType')?.value || 'percent';
  draft.productDiscount = {
    enabled: !!$('draftDiscEnabled')?.checked,
    type: discType,
    value: Number($('draftDiscValue')?.value || 0),
    startsAt: fromDatetimeLocalValue($('draftDiscStart')?.value),
    endsAt: fromDatetimeLocalValue($('draftDiscEnd')?.value)
  };
  updateDiscValueLabel(discType);
  updateDiscountVisibility(draft.productDiscount.enabled === true);
  const usdHint = $('draftUsdHint');
  if (usdHint) {
    if (isPass) {
      usdHint.textContent = draft.listPriceUsd != null && !Number.isNaN(draft.listPriceUsd)
        ? 'USD 설정됨 · 해외(PayPal) PASS 판매는 아직 미사용'
        : 'USD 미설정 · 해외 판매 미사용 (KR PortOne만)';
    } else {
      usdHint.textContent = draft.listPriceUsd != null && !Number.isNaN(draft.listPriceUsd)
        ? 'PayPal 판매 가능'
        : 'USD 미설정 · PayPal 판매 안 함';
    }
  }
  renderPreview();
}

function isCreditType(p) {
  if (!p) return false;
  if (p.type === 'lifetime' || p.type === 'full_pass' || isPassProductId(p.productId)) return false;
  return true;
}

function renderPreview() {
  if (!draft) return;
  const charge = computeCharge(draft, promotions);
  const setT = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  setT('previewList', formatKrw(charge.basePrice));
  setT('previewSale', charge.ok ? formatKrw(charge.effectivePrice) : (charge.code || '-'));
  if (charge.discount && charge.discountPercent) {
    const until = discountEndsLabel(charge.discountEndsAt || draft.productDiscount?.endsAt);
    const kind = charge.discount.type === 'amount'
      ? `${Number(charge.discount.value).toLocaleString('ko-KR')}원 할인`
      : `${charge.discountPercent}% 할인`;
    setT('previewPct', until ? `${kind} · ${until}` : kind);
  } else {
    setT('previewPct', '할인 없음');
  }
  if (draft.type === 'credit_pack') {
    const saleUnit = unitPrice(charge.effectivePrice, draft.creditAmount);
    setT('previewUnit', saleUnit ? `1 Credit 약 ${saleUnit.toLocaleString('ko-KR')}원` : '');
  } else if (draft.type === 'full_pass' || isPassProductId(draft.productId)) {
    const days = Number(draft.durationDays || canonicalPassDurationDays(draft.productId) || 0);
    setT('previewUnit', days > 0
      ? `${days}일 Full · 변환 횟수 제한 없음 · 자동결제 없음`
      : '기간 Full · 변환 횟수 제한 없음');
  } else {
    setT('previewUnit', 'Lifetime Full · 영구 이용 · 자동결제 없음');
  }
  setT('previewSaleUnit', '');
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
  const errors = validateProductFields(draft, { isNew: false });
  if (errors.length) throw new Error(errors[0]);
  const current = products.find((p) => p.productId === draft.productId) || {};
  const nextProducts = products.map((p) => (p.productId === draft.productId ? draft : p));
  const conflicts = findDiscountConflicts(nextProducts, promotions);
  if (conflicts.length) throw new Error(`CONFLICT: ${conflicts[0].productId}에 할인이 겹칩니다.`);
  const warnPrice = priceChangeWarning(current.listPriceKrw, draft.listPriceKrw);
  const warnCredits = draft.type === 'credit_pack'
    ? creditChangeWarning(current.creditAmount, draft.creditAmount)
    : '';
  const warn = warnPrice || warnCredits;
  if (warn && !window.confirm(warn)) {
    flash('저장이 취소되었습니다.', false);
    return;
  }
  const version = bumpVersion(current, {
    priceChanged: Number(current.listPriceKrw) !== Number(draft.listPriceKrw),
    creditsChanged: draft.type === 'credit_pack'
      && Number(current.creditAmount) !== Number(draft.creditAmount)
  });
  const { doc, setDoc, serverTimestamp } = fs;
  const docId = firestoreDocId(draft.productId);
  const isPass = draft.type === 'full_pass' || isPassProductId(draft.productId);
  const isLife = draft.type === 'lifetime';
  const payload = {
    productId: draft.productId,
    type: isPass ? 'full_pass' : (isLife ? 'lifetime' : 'credit_pack'),
    nameKo: draft.nameKo,
    nameEn: draft.nameEn,
    nameJa: draft.nameJa,
    name: draft.nameKo || draft.nameEn,
    descriptionKo: draft.descriptionKo,
    descriptionEn: draft.descriptionEn,
    descriptionJa: draft.descriptionJa,
    creditAmount: isPass || isLife ? 0 : Number(draft.creditAmount),
    durationDays: isPass
      ? (isCanonicalPassProductId(draft.productId)
        ? canonicalPassDurationDays(draft.productId)
        : Number(draft.durationDays || 0))
      : 0,
    entitlement: isLife ? 'lifetime' : (isPass ? 'full_pass' : 'credits'),
    listPriceKrw: Number(draft.listPriceKrw),
    listPriceUsd: draft.listPriceUsd,
    status: draft.status,
    sortOrder: Number(draft.sortOrder),
    order: Number(draft.sortOrder),
    badge: draft.badge,
    packSavePercent: draft.packSavePercent ?? null,
    productVersion: version,
    pricingVersion: version,
    productDiscount: draft.productDiscount,
    plan: isLife ? 'lifetime' : (isPass ? 'period' : 'credits'),
    updatedAt: serverTimestamp()
  };
  if (isLife || isPass) {
    const prevRegions = draft.regions || {};
    const prevKr = prevRegions.KR || {};
    const price = Number(draft.listPriceKrw);
    payload.regions = {
      ...prevRegions,
      KR: {
        ...prevKr,
        payment: prevKr.payment || 'portone',
        currency: 'KRW',
        listPrice: price,
        salePrice: price,
        orderName: draft.orderNameKo
          || prevKr.orderName
          || (isLife ? 'MidiAI Studio Lifetime Full' : (draft.nameKo || draft.productId)),
        portoneProductId: prevKr.portoneProductId || (isLife ? 'midiai-lifetime' : draft.productId)
      }
    };
    if (isLife) {
      const prevGlobal = prevRegions.Global || {};
      payload.regions.Global = {
        ...prevGlobal,
        payment: 'paypal',
        currency: 'USD',
        listPrice: draft.listPriceUsd != null ? Number(draft.listPriceUsd) : (prevGlobal.listPrice != null ? Number(prevGlobal.listPrice) : 89),
        salePrice: draft.listPriceUsd != null ? Number(draft.listPriceUsd) : (prevGlobal.salePrice != null ? Number(prevGlobal.salePrice) : 89),
        orderName: draft.orderNameEn || prevGlobal.orderName || 'MidiAI Studio Lifetime Full'
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
  flash(`${draft.productId} · ${formatKrw(expectedPrice)} 저장 완료 (구매 페이지 새로고침 후 반영)`);
  await loadAll();
  const refreshed = products.find((p) => p.productId === draft.productId);
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
    ? (isCanonicalPassProductId(productId)
      ? canonicalPassDurationDays(productId)
      : Number($('newProductDuration')?.value || 0))
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
    sortOrder: products.length + 1,
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
  if (!draft || !canDeleteCatalogProduct(draft)) {
    throw new Error('기본 이용권(기간제/Lifetime)은 삭제할 수 없습니다. 판매중지/보관만 가능합니다.');
  }
  const extra = draft.hasPurchases
    ? '\n결제 기록은 유지되고, 판매 목록에서만 제거됩니다.'
    : '';
  if (!window.confirm(`${draft.productId} 상품을 삭제할까요?${extra}`)) return;
  const { doc, deleteDoc } = fs;
  await deleteDoc(doc(db, 'products', firestoreDocId(draft.productId)));
  await audit('product_delete', `${draft.productId} 삭제`, draft, null);
  selectedId = null;
  flash('상품을 삭제했습니다.');
  await loadAll();
}

function promoStatus(p) {
  return windowStatus(p.enabled === true && p.archived !== true, p.startsAt, p.endsAt);
}

function renderPromoList() {
  const root = $('pricingPromoList');
  if (!root) return;
  if (!promotions.length) {
    root.innerHTML = '<p class="muted">이벤트가 없습니다.</p>';
    return;
  }
  root.innerHTML = promotions.map((p) => {
    const st = promoStatus(p);
    const targets = (p.productIds || []).join(' / ') || '-';
    const disc = p.type === 'amount' ? `${Number(p.value || 0).toLocaleString('ko-KR')}원` : `${p.value}%`;
    const active = selectedPromoId === p.id ? ' is-active' : '';
    return `<button type="button" class="pricing-product-item${active}" data-promo-id="${esc(p.id)}">
      <span class="pricing-product-item-top"><strong>${esc(p.nameKo || p.promotionId || p.id)}</strong><span class="badge">${esc(st)}</span></span>
      <span class="muted small">${esc(targets)}</span>
      <span class="muted small">${esc(disc)} · ${esc(String(p.startsAt || '').slice(0, 16))} ~ ${esc(String(p.endsAt || '').slice(0, 16))}</span>
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
  renderPromoList();
  renderPromoEditor();
  setPane('promos');
}

function selectPromo(id) {
  selectedPromoId = id;
  const found = promotions.find((p) => p.id === id);
  promoDraft = found ? JSON.parse(JSON.stringify(found)) : emptyPromo();
  renderPromoList();
  renderPromoEditor();
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
    box.innerHTML = products.map((p) => `<label class="pricing-check"><input type="checkbox" data-promo-target="${esc(p.productId)}" ${selected.has(p.productId) ? 'checked' : ''}> ${esc(p.nameKo || p.productId)}</label>`).join('');
  }
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

if ((location.pathname.split('/').pop() || '') === 'admin.html') {
  initPricingAdmin();
}
