/**
 * Admin: 가격 및 상품 설정
 */
import {
  DEFAULT_PRODUCT_ID,
  FALLBACK_PRODUCT,
  FALLBACK_LANG_MAP,
  discountPercent,
  formatMoney
} from './pricing.js?v=pricing-cms-1';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let db = null;
let fs = null;
let isAdmin = false;
let products = [];
let langMap = { ...FALLBACK_LANG_MAP };
let selectedId = null;
let draft = null;

function $(id) { return document.getElementById(id); }

let booted = false;

export function initPricingAdmin(api) {
  db = api.db;
  fs = api.firestoreApi;
  isAdmin = !!api.isAdmin;
  if (!booted) {
    bindTabs();
    bindEditor();
    booted = true;
  }
  if (isAdmin) loadAll().catch(console.error);
}

// Tabs work even before auth resolves
if ((location.pathname.split('/').pop() || '') === 'admin.html') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindTabs(); bindEditor(); booted = true; });
  } else {
    bindTabs();
    bindEditor();
    booted = true;
  }
}

export function setPricingAdminAuth({ isAdmin: admin, db: nextDb, firestoreApi }) {
  isAdmin = !!admin;
  if (nextDb) db = nextDb;
  if (firestoreApi) fs = firestoreApi;
  if (isAdmin && db) loadAll().catch(console.error);
}

function bindTabs() {
  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-admin-tab');
      document.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      const crm = $('adminCrm');
      const pricing = $('adminPricingSection');
      const tickets = $('adminTicketsSection');
      if (crm) crm.hidden = tab !== 'crm';
      if (pricing) pricing.hidden = tab !== 'pricing';
      if (tickets) tickets.hidden = tab !== 'tickets' && tab !== 'crm';
      // CRM tab shows tickets below as before
      if (tab === 'crm' && tickets) tickets.hidden = false;
      if (tab === 'pricing' && tickets) tickets.hidden = true;
      if (tab === 'tickets') {
        if (crm) crm.hidden = true;
        if (pricing) pricing.hidden = true;
        if (tickets) tickets.hidden = false;
        tickets?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

function bindEditor() {
  $('pricingAddProduct')?.addEventListener('click', () => addProduct());
  $('pricingSaveBtn')?.addEventListener('click', () => saveDraft().catch((e) => alert(e.message || e)));
  $('pricingAddRegion')?.addEventListener('click', () => addRegionRow());
  $('pricingSaveLangMap')?.addEventListener('click', () => saveLangMap().catch((e) => alert(e.message || e)));
}

async function ensureSeed() {
  const { collection, getDocs, doc, setDoc, serverTimestamp } = fs;
  const snap = await getDocs(collection(db, 'products'));
  if (!snap.empty) return;
  const payload = {
    name: FALLBACK_PRODUCT.name,
    status: 'active',
    badge: FALLBACK_PRODUCT.badge,
    promoText: FALLBACK_PRODUCT.promoText,
    buttonText: FALLBACK_PRODUCT.buttonText,
    order: 1,
    plan: 'lifetime',
    pricingVersion: 1,
    regions: FALLBACK_PRODUCT.regions,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'products', DEFAULT_PRODUCT_ID), payload);
  await setDoc(doc(db, 'pricingConfig', 'main'), {
    defaultProductId: DEFAULT_PRODUCT_ID,
    langRegionMap: FALLBACK_LANG_MAP,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function loadAll() {
  if (!db || !fs || !isAdmin) return;
  await ensureSeed();
  const { collection, getDocs, doc, getDoc } = fs;
  const snap = await getDocs(collection(db, 'products'));
  products = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const cfg = await getDoc(doc(db, 'pricingConfig', 'main'));
  if (cfg.exists()) {
    const data = cfg.data() || {};
    langMap = { ...FALLBACK_LANG_MAP, ...(data.langRegionMap || {}) };
  }
  renderList();
  renderLangMap();
  if (!selectedId && products[0]) selectProduct(products[0].id);
  else if (selectedId) selectProduct(selectedId);
}

function renderList() {
  const root = $('pricingProductList');
  if (!root) return;
  if (!products.length) {
    root.innerHTML = '<p class="muted">상품이 없습니다.</p>';
    return;
  }
  root.innerHTML = products.map((p) => {
    const kr = p.regions?.KR;
    const gl = p.regions?.Global;
    const active = p.id === selectedId ? ' is-active' : '';
    const status = p.status === 'active' ? '판매중' : '판매중지';
    return `<button type="button" class="pricing-product-item${active}" data-product-id="${esc(p.id)}">
      <strong>${esc(p.name || p.id)}</strong>
      <span class="muted">${esc(status)} · 정렬 ${esc(p.order ?? 0)}</span>
      <span class="mono small">${kr ? `KRW ${Number(kr.salePrice).toLocaleString('ko-KR')}` : '-'} · ${gl ? `USD ${gl.salePrice}` : '-'}</span>
    </button>`;
  }).join('');
  root.querySelectorAll('[data-product-id]').forEach((btn) => {
    btn.addEventListener('click', () => selectProduct(btn.getAttribute('data-product-id')));
  });
}

function selectProduct(id) {
  selectedId = id;
  const p = products.find((x) => x.id === id);
  if (!p) return;
  draft = JSON.parse(JSON.stringify(p));
  renderList();
  renderEditor();
}

function renderLangMap() {
  const ko = $('pricingLangKo');
  const en = $('pricingLangEn');
  const ja = $('pricingLangJa');
  if (ko) ko.value = langMap.ko || 'KR';
  if (en) en.value = langMap.en || 'Global';
  if (ja) ja.value = langMap.ja || 'Global';
}

function renderEditor() {
  const root = $('pricingEditor');
  if (!root || !draft) {
    if (root) root.innerHTML = '<p class="muted">왼쪽에서 상품을 선택하세요.</p>';
    return;
  }
  const regions = draft.regions || {};
  const regionKeys = Object.keys(regions);
  root.innerHTML = `
    <div class="pricing-editor-head">
      <h3>${esc(draft.name || draft.id)}</h3>
      <p class="muted mono">ID: ${esc(draft.id)} · pricingVersion: ${esc(draft.pricingVersion || 1)}</p>
    </div>
    <div class="pricing-form-grid">
      <label>상품명 <input id="pfName" type="text" value="${esc(draft.name || '')}"></label>
      <label>판매 상태
        <select id="pfStatus">
          <option value="active" ${draft.status === 'active' ? 'selected' : ''}>판매중</option>
          <option value="paused" ${draft.status === 'paused' ? 'selected' : ''}>판매중지</option>
        </select>
      </label>
      <label>대표 Badge <input id="pfBadge" type="text" value="${esc(draft.badge || '')}"></label>
      <label>프로모션 문구 <input id="pfPromo" type="text" value="${esc(draft.promoText || '')}"></label>
      <label>버튼 문구 <input id="pfButton" type="text" value="${esc(draft.buttonText || '')}"></label>
      <label>정렬순서 <input id="pfOrder" type="number" value="${esc(draft.order ?? 1)}"></label>
      <label>Plan <input id="pfPlan" type="text" value="${esc(draft.plan || 'lifetime')}"></label>
    </div>
    <h4 class="pricing-subhead">국가/판매영역별 가격</h4>
    <div id="pricingRegionRows" class="pricing-region-rows"></div>
  `;
  const rows = $('pricingRegionRows');
  regionKeys.forEach((code) => rows.appendChild(regionRowEl(code, regions[code])));
  wireDraftInputs();
}

function regionRowEl(code, data = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'pricing-region-card';
  wrap.dataset.region = code;
  const list = Number(data.listPrice || 0);
  const sale = Number(data.salePrice || 0);
  const disc = discountPercent(list, sale);
  wrap.innerHTML = `
    <div class="pricing-region-head">
      <strong>[${esc(code)}]</strong>
      <span class="muted">자동 할인 ${disc}%</span>
      <button type="button" class="ghost mini-btn" data-remove-region="${esc(code)}">영역 삭제</button>
    </div>
    <div class="pricing-form-grid">
      <label>결제
        <select data-rf="payment">
          <option value="portone" ${data.payment === 'portone' ? 'selected' : ''}>PortOne</option>
          <option value="paypal" ${data.payment === 'paypal' ? 'selected' : ''}>PayPal</option>
          <option value="stripe" ${data.payment === 'stripe' ? 'selected' : ''}>Stripe</option>
        </select>
      </label>
      <label>통화 <input data-rf="currency" type="text" value="${esc(data.currency || '')}" placeholder="KRW / USD / JPY"></label>
      <label>정가 <input data-rf="listPrice" type="number" step="any" value="${esc(data.listPrice ?? '')}"></label>
      <label>판매가 <input data-rf="salePrice" type="number" step="any" value="${esc(data.salePrice ?? '')}"></label>
      <label>주문 표시명 <input data-rf="orderName" type="text" value="${esc(data.orderName || '')}"></label>
      <label>PortOne productId <input data-rf="portoneProductId" type="text" value="${esc(data.portoneProductId || '')}"></label>
    </div>
    <p class="muted small">미리보기: 정가 ${esc(formatMoney(list, data.currency))} → 판매가 <strong>${esc(formatMoney(sale, data.currency))}</strong></p>
  `;
  wrap.querySelector('[data-remove-region]')?.addEventListener('click', () => {
    if (!confirm(`[${code}] 영역을 삭제할까요?`)) return;
    delete draft.regions[code];
    renderEditor();
  });
  wrap.querySelectorAll('[data-rf]').forEach((input) => {
    input.addEventListener('input', () => collectRegion(code, wrap));
    input.addEventListener('change', () => {
      collectRegion(code, wrap);
      renderEditor();
    });
  });
  return wrap;
}

function collectRegion(code, wrap) {
  if (!draft.regions) draft.regions = {};
  const get = (k) => wrap.querySelector(`[data-rf="${k}"]`);
  draft.regions[code] = {
    payment: get('payment')?.value || 'paypal',
    currency: (get('currency')?.value || 'USD').toUpperCase(),
    listPrice: Number(get('listPrice')?.value || 0),
    salePrice: Number(get('salePrice')?.value || 0),
    orderName: get('orderName')?.value || '',
    portoneProductId: get('portoneProductId')?.value || ''
  };
}

function wireDraftInputs() {
  const bind = (id, key, cast = (v) => v) => {
    $(id)?.addEventListener('input', (e) => { draft[key] = cast(e.target.value); });
  };
  bind('pfName', 'name');
  bind('pfBadge', 'badge');
  bind('pfPromo', 'promoText');
  bind('pfButton', 'buttonText');
  bind('pfPlan', 'plan');
  bind('pfOrder', 'order', (v) => Number(v) || 0);
  $('pfStatus')?.addEventListener('change', (e) => { draft.status = e.target.value; });
}

function collectDraftFromForm() {
  if (!draft) return;
  draft.name = $('pfName')?.value?.trim() || draft.name;
  draft.status = $('pfStatus')?.value || draft.status;
  draft.badge = $('pfBadge')?.value || '';
  draft.promoText = $('pfPromo')?.value || '';
  draft.buttonText = $('pfButton')?.value || '';
  draft.plan = $('pfPlan')?.value || 'lifetime';
  draft.order = Number($('pfOrder')?.value || 0);
  document.querySelectorAll('#pricingRegionRows .pricing-region-card').forEach((wrap) => {
    collectRegion(wrap.dataset.region, wrap);
  });
}

function addRegionRow() {
  if (!draft) return;
  const code = prompt('Region 코드 (예: JP, EU, US)', 'JP');
  if (!code) return;
  const key = code.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(key)) {
    alert('Region 코드 형식이 올바르지 않습니다.');
    return;
  }
  if (!draft.regions) draft.regions = {};
  if (draft.regions[key]) {
    alert('이미 있는 Region입니다.');
    return;
  }
  draft.regions[key] = {
    payment: 'paypal',
    currency: key === 'JP' ? 'JPY' : 'USD',
    listPrice: 0,
    salePrice: 0,
    orderName: draft.name || '',
    portoneProductId: ''
  };
  renderEditor();
}

async function addProduct() {
  const id = prompt('새 상품 ID (영문-케밥)', 'pro-plan');
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    alert('상품 ID 형식이 올바르지 않습니다.');
    return;
  }
  const { doc, getDoc, setDoc, serverTimestamp } = fs;
  const ref = doc(db, 'products', id);
  if ((await getDoc(ref)).exists()) {
    alert('이미 존재하는 상품 ID입니다.');
    return;
  }
  await setDoc(ref, {
    name: 'New Product',
    status: 'paused',
    badge: '',
    promoText: '',
    buttonText: 'Buy Now',
    order: (products[products.length - 1]?.order || 0) + 10,
    plan: id,
    pricingVersion: 1,
    regions: {
      KR: { payment: 'portone', currency: 'KRW', listPrice: 0, salePrice: 0, orderName: 'New Product', portoneProductId: id },
      Global: { payment: 'paypal', currency: 'USD', listPrice: 0, salePrice: 0, orderName: 'New Product' }
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await loadAll();
  selectProduct(id);
}

async function saveDraft() {
  if (!draft || !isAdmin) return;
  collectDraftFromForm();
  if (!draft.regions || !Object.keys(draft.regions).length) {
    alert('판매 영역이 하나 이상 필요합니다.');
    return;
  }
  for (const [code, r] of Object.entries(draft.regions)) {
    if (!r.currency || !Number.isFinite(Number(r.salePrice))) {
      alert(`[${code}] 통화와 판매가를 확인하세요.`);
      return;
    }
  }
  const { doc, setDoc, serverTimestamp, increment } = fs;
  const payload = {
    name: draft.name,
    status: draft.status === 'paused' ? 'paused' : 'active',
    badge: draft.badge || '',
    promoText: draft.promoText || '',
    buttonText: draft.buttonText || 'Buy Now',
    order: Number(draft.order) || 0,
    plan: draft.plan || 'lifetime',
    regions: draft.regions,
    pricingVersion: increment(1),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'products', draft.id), payload, { merge: true });
  const msg = $('pricingSaveMsg');
  if (msg) {
    msg.textContent = '✓ 저장 완료 — 홈/구매/결제에 즉시 반영됩니다.';
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 4000);
  }
  await loadAll();
}

async function saveLangMap() {
  langMap = {
    ko: $('pricingLangKo')?.value?.trim() || 'KR',
    en: $('pricingLangEn')?.value?.trim() || 'Global',
    ja: $('pricingLangJa')?.value?.trim() || 'Global'
  };
  const { doc, setDoc, serverTimestamp } = fs;
  await setDoc(doc(db, 'pricingConfig', 'main'), {
    langRegionMap: langMap,
    defaultProductId: DEFAULT_PRODUCT_ID,
    updatedAt: serverTimestamp()
  }, { merge: true });
  alert('언어 → Region 매핑이 저장되었습니다.');
}
