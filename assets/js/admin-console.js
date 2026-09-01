const $ = (id) => document.getElementById(id);

const VIEW_SECTIONS = {
  home: 'adminHomeSection',
  crm: 'adminCrm',
  payments: 'adminPaymentsSection',
  tickets: 'adminTicketsSection',
  logs: 'adminLogsSection',
  pricing: 'adminPricingSection',
  content: 'adminContentSection'
};

const VIEW_TITLES = {
  home: '홈',
  crm: '회원',
  payments: '결제',
  tickets: '문의 관리',
  logs: '로그',
  pricing: '가격·상품',
  content: '콘텐츠'
};

const CRM_TITLES = {
  members: '회원',
  license: '라이선스',
  orders: '결제'
};

const VIEW_LEADS = {
  home: '운영 현황을 한눈에 보고 주요 관리 화면으로 이동합니다.',
  payments: '주문 [상세]에서 PortOne 상태 동기화·결제 취소를 처리합니다.',
  tickets: '사용자 문의를 조회하고 답변 상태를 관리합니다.',
  logs: '회원별 라이선스·결제·문의·앱 사용 이력을 조회합니다.',
  pricing: 'Region별 정가·판매가와 할인·팝업을 관리합니다.',
  content: '공지·패치노트·FAQ·자유게시판을 한 화면에서 조회하고 관리합니다.'
};

const CRM_LEADS = {
  members: '회원을 검색하고 계정 상태와 주요 정보를 확인합니다.',
  license: '회원별 라이선스 상태를 확인하고 지급·변경·만료를 관리합니다.',
  orders: '주문 [상세]에서 PortOne 상태 동기화·결제 취소를 처리합니다.'
};

function normalizeCrmMode(mode, detailTab) {
  if (mode === 'license' || mode === 'orders' || mode === 'members') return mode;
  if (detailTab === 'license') return 'license';
  return 'members';
}

function matchSidebarButton(btn, view, crmMode) {
  if (btn.getAttribute('data-admin-nav') !== view) return false;
  if (view === 'crm') {
    return (btn.getAttribute('data-crm-mode') || 'members') === (crmMode || 'members');
  }
  return true;
}

function setSidebarActive(view, crmMode, sourceBtn) {
  const sidebarBtns = [...document.querySelectorAll('.admin-sidebar [data-admin-nav]')];
  let target = sourceBtn?.closest?.('.admin-sidebar [data-admin-nav]') || null;
  if (!target) {
    target = sidebarBtns.find((btn) => matchSidebarButton(btn, view, crmMode)) || null;
  }
  sidebarBtns.forEach((btn) => {
    const on = btn === target;
    btn.classList.toggle('is-active', on);
    btn.classList.toggle('active', on);
  });
}

function setPagehead(view, crmMode) {
  const title = $('adminConsoleTitle');
  const lead = $('adminConsoleLead');
  if (title) {
    title.textContent = view === 'crm'
      ? (CRM_TITLES[crmMode] || VIEW_TITLES.crm)
      : (VIEW_TITLES[view] || '관리자');
  }
  if (lead) {
    lead.textContent = view === 'crm'
      ? (CRM_LEADS[crmMode] || CRM_LEADS.members)
      : (VIEW_LEADS[view] || '');
  }
}

function renderAdminPageWorkTabs(view, crmMode) {
  const slot = $('adminWorkTabsSlot');
  if (!slot) return;
  if (view === 'crm' && crmMode === 'license') {
    const page = document.body.dataset.licensePage || 'status';
    slot.hidden = false;
    slot.innerHTML = `<div class="admin-page-tabs admin-page-tabs-inline" role="tablist" aria-label="라이선스 화면">
      <button type="button" class="admin-page-tab${page !== 'history' ? ' is-active' : ''}" data-license-page="status">현황</button>
      <button type="button" class="admin-page-tab${page === 'history' ? ' is-active' : ''}" data-license-page="history">변경/지급 기록</button>
    </div>`;
    return;
  }
  slot.hidden = true;
  slot.innerHTML = '';
}

export function showAdminView(view, opts = {}) {
  if (view === 'payments') {
    applyAdminView('crm', { ...opts, crmMode: 'orders', closeDetail: opts.closeDetail !== false });
    return;
  }
  const next = VIEW_SECTIONS[view] ? view : 'crm';
  applyAdminView(next, opts);
}

function applyAdminView(next, opts = {}) {
  try { window.__midiaiHideAdminFlash?.(); } catch (_) {}
  try { window.__midiaiCloseAdminCrmOrderDrawer?.(); } catch (_) {}
  const crmMode = next === 'crm'
    ? normalizeCrmMode(opts.crmMode, opts.detailTab)
    : (document.body.dataset.crmMode || 'members');
  if (next === 'crm' && crmMode === 'license') {
    document.body.dataset.licensePage = opts.licensePage || 'status';
  } else {
    delete document.body.dataset.licensePage;
  }
  const licenseHistory = next === 'crm' && crmMode === 'license' && document.body.dataset.licensePage === 'history';
  Object.entries(VIEW_SECTIONS).forEach(([key, id]) => {
    const el = $(id);
    if (!el) return;
    if (licenseHistory) el.hidden = key !== 'logs';
    else el.hidden = key !== next;
  });
  document.body.dataset.adminView = next;
  if (next === 'crm') {
    document.body.dataset.crmMode = crmMode;
    document.body.dataset.crmDetailTab = crmMode === 'license'
      ? 'license'
      : crmMode === 'orders'
        ? 'payments'
        : 'overview';
  }
  setPagehead(next, next === 'crm' ? crmMode : undefined);
  renderAdminPageWorkTabs(next, next === 'crm' ? crmMode : undefined);
  if (licenseHistory) {
    const lead = $('adminConsoleLead');
    if (lead) lead.textContent = '기존 라이선스 로그에서 변경·지급 기록을 확인합니다.';
  }

  if (next === 'logs' || licenseHistory) {
    import('./admin-user-logs.js?v=credit-ledger-v2-3').then((m) => {
      m.showAdminUserLogsPanel?.(true);
      m.setAdminLogsTab?.(opts.logsTab || (licenseHistory ? 'license' : 'all'));
      if (opts.uid) m.selectAdminLogsUser?.(opts.uid);
    }).catch(console.error);
  }
  if (next === 'tickets' && opts.ticketStatus && $('adminTicketStatus')) {
    $('adminTicketStatus').value = opts.ticketStatus;
    $('adminTicketStatus').dispatchEvent(new Event('change'));
  }
  if (next === 'tickets' && opts.ticketQuery && $('adminTicketSearch')) {
    $('adminTicketSearch').value = opts.ticketQuery;
    $('adminTicketSearch').dispatchEvent(new Event('input'));
  }
  if (next === 'crm' && opts.closeDetail) {
    document.querySelector('[data-crm-action="back-list"]')?.click();
    const crm = $('adminCrm');
    crm?.classList.remove('is-detail-open', 'is-row-expand');
  }
  setSidebarActive(licenseHistory ? 'crm' : next, next === 'crm' || licenseHistory ? crmMode : undefined, opts.source);
  if (next === 'crm') {
    try { window.__midiaiOnAdminCrmMode?.(crmMode, opts); } catch (_) {}
  }
  if (next === 'content') {
    const cmsTab = opts.cmsTab || document.body.dataset.cmsTab;
    try { window.__midiaiOnAdminCms?.(cmsTab, { cmsId: opts.cmsId }); } catch (_) {}
  } else {
    try { window.__midiaiOnAdminCms?.('', { close: true }); } catch (_) {}
  }
  try {
    const hash = new URLSearchParams();
    hash.set('view', licenseHistory ? 'crm' : next);
    if (opts.logsTab) hash.set('log', opts.logsTab);
    if (licenseHistory) hash.set('log', 'license');
    if (opts.uid) hash.set('uid', opts.uid);
    if (opts.ticketStatus && opts.ticketStatus !== 'all') hash.set('ticket', opts.ticketStatus);
    if ((next === 'crm' || licenseHistory) && crmMode && crmMode !== 'members') hash.set('crm', crmMode);
    if (licenseHistory) hash.set('lic', 'history');
    const cmsTab = opts.cmsTab || document.body.dataset.cmsTab;
    if (next === 'content' && cmsTab && cmsTab !== 'notices') hash.set('cms', cmsTab);
    if (next === 'content' && opts.cmsId) hash.set('post', opts.cmsId);
    history.replaceState(null, '', `#${hash.toString()}`);
  } catch (_) {}
}

function bindConsole() {
  if (document.body.dataset.adminConsoleBound) return;
  document.body.dataset.adminConsoleBound = '1';
  window.__midiaiShowAdminViewCore = showAdminView;
  window.__midiaiShowAdminView = showAdminView;

  $('adminSidebarToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.body.classList.toggle('admin-sidebar-open');
  });
  $('adminConsoleBackdrop')?.addEventListener('click', () => {
    document.body.classList.remove('admin-sidebar-open');
  });

  const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const initial = params.get('view') || 'home';
  showAdminView(initial, {
    logsTab: params.get('log') || undefined,
    uid: params.get('uid') || undefined,
    ticketStatus: params.get('ticket') || undefined,
    crmMode: params.get('crm') || undefined,
    detailTab: params.get('crm') === 'license' ? 'license' : undefined,
    licensePage: params.get('lic') === 'history' ? 'history' : (params.get('crm') === 'license' ? 'status' : undefined),
    cmsTab: params.get('cms') || undefined,
    cmsId: params.get('post') || undefined
  });
  window.addEventListener('hashchange', () => {
    const next = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      showAdminView(next.get('view') || 'home', {
      logsTab: next.get('log') || undefined,
      uid: next.get('uid') || undefined,
      ticketStatus: next.get('ticket') || undefined,
      crmMode: next.get('crm') || undefined,
      detailTab: next.get('crm') === 'license' ? 'license' : undefined,
      licensePage: next.get('lic') === 'history' ? 'history' : (next.get('crm') === 'license' ? 'status' : undefined),
      cmsTab: next.get('cms') || undefined,
      cmsId: next.get('post') || undefined
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindConsole);
} else {
  bindConsole();
}
