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
  content: '공지·콘텐츠'
};

const CRM_TITLES = {
  members: '회원',
  license: '라이선스',
  orders: '주문'
};

const VIEW_LEADS = {
  home: '운영 현황을 한눈에 보고 주요 관리 화면으로 이동합니다.',
  payments: '전체 결제·주문 내역입니다. 행을 누르면 해당 회원 상세가 열립니다.',
  tickets: '사용자 문의를 조회하고 답변 상태를 관리합니다.',
  logs: '사용자를 선택한 뒤 탭으로 관련 이력을 조회합니다.',
  pricing: 'Region별 정가·판매가와 할인·팝업을 관리합니다.',
  content: '공지·패치노트·FAQ와 회원 쪽지 경로입니다.'
};

const CRM_LEADS = {
  members: '회원을 검색하고 상세·일괄 작업을 수행합니다.',
  license: '회원별 라이선스 현황입니다. 변경·지급 기록은 로그 → 라이선스에서 확인합니다.',
  orders: '회원별 주문 여부입니다. 전체 결제는 결제 메뉴에서 봅니다.'
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

export function showAdminView(view, opts = {}) {
  const next = VIEW_SECTIONS[view] ? view : 'crm';
  const crmMode = next === 'crm'
    ? normalizeCrmMode(opts.crmMode, opts.detailTab)
    : (document.body.dataset.crmMode || 'members');
  Object.entries(VIEW_SECTIONS).forEach(([key, id]) => {
    const el = $(id);
    if (el) el.hidden = key !== next;
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

  if (next === 'logs') {
    import('./admin-user-logs.js?v=admin-ia-1').then((m) => {
      m.showAdminUserLogsPanel?.(true);
      if (opts.logsTab) m.setAdminLogsTab?.(opts.logsTab);
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
    crm?.classList.remove('is-detail-open');
  }
  setSidebarActive(next, next === 'crm' ? crmMode : undefined, opts.source);
  try {
    const hash = new URLSearchParams();
    hash.set('view', next);
    if (opts.logsTab) hash.set('log', opts.logsTab);
    if (opts.ticketStatus && opts.ticketStatus !== 'all') hash.set('ticket', opts.ticketStatus);
    if (next === 'crm' && crmMode && crmMode !== 'members') hash.set('crm', crmMode);
    history.replaceState(null, '', `#${hash.toString()}`);
  } catch (_) {}
}

function bindConsole() {
  if (document.body.dataset.adminConsoleBound) return;
  document.body.dataset.adminConsoleBound = '1';
  window.__midiaiShowAdminView = showAdminView;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-admin-nav]');
    if (btn && !btn.hasAttribute('data-admin-tab')) {
      e.preventDefault();
      showAdminView(btn.getAttribute('data-admin-nav'), {
        logsTab: btn.getAttribute('data-logs-tab') || undefined,
        ticketStatus: btn.getAttribute('data-ticket-status') || undefined,
        closeDetail: btn.getAttribute('data-admin-close-detail') === '1',
        crmMode: btn.getAttribute('data-crm-mode') || undefined,
        detailTab: btn.getAttribute('data-crm-detail-tab') || undefined,
        source: btn
      });
      document.body.classList.remove('admin-sidebar-open');
    }
  });

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
    ticketStatus: params.get('ticket') || undefined,
    crmMode: params.get('crm') || undefined,
    detailTab: params.get('crm') === 'license' ? 'license' : undefined
  });
  window.addEventListener('hashchange', () => {
    const next = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    showAdminView(next.get('view') || 'home', {
      logsTab: next.get('log') || undefined,
      ticketStatus: next.get('ticket') || undefined,
      crmMode: next.get('crm') || undefined,
      detailTab: next.get('crm') === 'license' ? 'license' : undefined
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindConsole);
} else {
  bindConsole();
}
