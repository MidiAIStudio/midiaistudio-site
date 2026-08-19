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
  crm: '회원 관리',
  payments: '결제 내역',
  tickets: '문의 관리',
  logs: '로그',
  pricing: '가격·상품',
  content: '공지·콘텐츠'
};

function matchSidebarButton(btn, view, logsTab, ticketStatus) {
  if (btn.getAttribute('data-admin-nav') !== view) return false;
  if (view === 'logs') return (btn.getAttribute('data-logs-tab') || 'all') === String(logsTab || 'all');
  if (view === 'tickets') return (btn.getAttribute('data-ticket-status') || 'all') === String(ticketStatus || 'all');
  return true;
}

function setSidebarActive(view, logsTab, ticketStatus, sourceBtn) {
  const sidebarBtns = [...document.querySelectorAll('.admin-sidebar [data-admin-nav]')];
  let target = sourceBtn?.closest?.('.admin-sidebar [data-admin-nav]') || null;
  if (!target) {
    target = sidebarBtns.find((btn) => matchSidebarButton(btn, view, logsTab, ticketStatus)) || null;
  }
  sidebarBtns.forEach((btn) => {
    const on = btn === target;
    btn.classList.toggle('is-active', on);
    btn.classList.toggle('active', on);
  });
}

export function showAdminView(view, opts = {}) {
  const next = VIEW_SECTIONS[view] ? view : 'crm';
  Object.entries(VIEW_SECTIONS).forEach(([key, id]) => {
    const el = $(id);
    if (el) el.hidden = key !== next;
  });
  const title = $('adminConsoleTitle');
  if (title) title.textContent = VIEW_TITLES[next] || '관리자';
  document.body.dataset.adminView = next;

  if (next === 'logs') {
    import('./admin-user-logs.js?v=admin-console-2').then((m) => {
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
  setSidebarActive(next, opts.logsTab || 'all', opts.ticketStatus || $('adminTicketStatus')?.value || 'all', opts.source);
  try {
    const hash = new URLSearchParams();
    hash.set('view', next);
    if (opts.logsTab) hash.set('log', opts.logsTab);
    if (opts.ticketStatus && opts.ticketStatus !== 'all') hash.set('ticket', opts.ticketStatus);
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
    ticketStatus: params.get('ticket') || undefined
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindConsole);
} else {
  bindConsole();
}
