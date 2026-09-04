/**
 * Admin sidebar navigation — classic script (not a module).
 * Runs even if app.js / admin-console.js fail to load.
 */
(function () {
  var SECTIONS = {
    home: 'adminHomeSection',
    crm: 'adminCrm',
    payments: 'adminPaymentsSection',
    tickets: 'adminTicketsSection',
    logs: 'adminLogsSection',
    pricing: 'adminPricingSection',
    content: 'adminContentSection'
  };
  var TITLES = {
    home: '홈',
    crm: '회원',
    payments: '결제',
    tickets: '문의 관리',
    logs: '로그',
    pricing: '가격·상품',
    content: '콘텐츠'
  };
  var CRM_TITLES = { members: '회원', license: '라이선스', orders: '결제' };

  function $(id) { return document.getElementById(id); }

  function closestNav(el) {
    if (!el) return null;
    if (el.nodeType !== 1) el = el.parentElement;
    return el && el.closest ? el.closest('[data-admin-nav]') : null;
  }

  function optsFromBtn(btn) {
    return {
      logsTab: btn.getAttribute('data-logs-tab') || undefined,
      ticketStatus: btn.getAttribute('data-ticket-status') || undefined,
      closeDetail: btn.getAttribute('data-admin-close-detail') === '1',
      crmMode: btn.getAttribute('data-crm-mode') || undefined,
      detailTab: btn.getAttribute('data-crm-detail-tab') || undefined,
      source: btn
    };
  }

  function basicShow(view, opts) {
    opts = opts || {};
    var next = SECTIONS[view] ? view : 'home';
    var crmMode = next === 'crm'
      ? (opts.crmMode || opts.detailTab || 'members')
      : undefined;
    if (crmMode === 'license' || crmMode === 'orders' || crmMode === 'members') {
      /* keep */
    } else if (opts.detailTab === 'license') {
      crmMode = 'license';
    } else if (next === 'crm') {
      crmMode = 'members';
    }
    var licenseHistory = next === 'crm' && crmMode === 'license' && (opts.licensePage || '') === 'history';
    Object.keys(SECTIONS).forEach(function (key) {
      var el = $(SECTIONS[key]);
      if (!el) return;
      el.hidden = licenseHistory ? key !== 'logs' : key !== next;
    });
    document.body.setAttribute('data-admin-view', next);
    if (next === 'crm' && crmMode) document.body.setAttribute('data-crm-mode', crmMode);
    else document.body.removeAttribute('data-crm-mode');
    if (licenseHistory) document.body.setAttribute('data-license-page', 'history');
    else if (next === 'crm' && crmMode === 'license') document.body.setAttribute('data-license-page', 'status');
    else document.body.removeAttribute('data-license-page');
    var title = $('adminConsoleTitle');
    if (title) {
      title.textContent = next === 'crm' ? (CRM_TITLES[crmMode] || TITLES.crm) : (TITLES[next] || '관리자');
    }
    var sidebarBtns = document.querySelectorAll('.admin-sidebar [data-admin-nav]');
    var source = opts.source && opts.source.closest ? opts.source.closest('.admin-sidebar [data-admin-nav]') : null;
    Array.prototype.forEach.call(sidebarBtns, function (btn) {
      var on = source ? btn === source : (
        btn.getAttribute('data-admin-nav') === next &&
        (next !== 'crm' || (btn.getAttribute('data-crm-mode') || 'members') === (crmMode || 'members'))
      );
      btn.classList.toggle('is-active', on);
      btn.classList.toggle('active', on);
    });
    try {
      var hash = new URLSearchParams();
      hash.set('view', licenseHistory ? 'crm' : next);
      if (next === 'crm' && crmMode && crmMode !== 'members') hash.set('crm', crmMode);
      if (licenseHistory) {
        hash.set('crm', 'license');
        hash.set('lic', 'history');
      }
      history.replaceState(null, '', '#' + hash.toString());
    } catch (_) {}
  }

  function show(view, opts) {
    opts = opts || {};
    try { if (typeof window.__midiaiHideAdminFlash === 'function') window.__midiaiHideAdminFlash(); } catch (_) {}
    if (view === 'payments') {
      view = 'crm';
      opts.crmMode = opts.crmMode || 'orders';
      if (opts.closeDetail == null) opts.closeDetail = true;
    }
    var core = window.__midiaiShowAdminViewCore;
    if (typeof core === 'function') {
      core(view, opts || {});
      return;
    }
    basicShow(view, opts);
  }

  window.__midiaiShowAdminView = show;

  function closestLicenseTab(el) {
    if (!el) return null;
    if (el.nodeType !== 1) el = el.parentElement;
    var tab = el && el.closest ? el.closest('button[data-license-page], .admin-page-tab[data-license-page]') : null;
    if (!tab || tab === document.body || tab === document.documentElement) return null;
    var page = tab.getAttribute('data-license-page');
    if (page !== 'status' && page !== 'history') return null;
    return tab;
  }

  function onClick(e) {
    var btn = closestNav(e.target);
    if (btn) {
      e.preventDefault();
      show(btn.getAttribute('data-admin-nav'), optsFromBtn(btn));
      document.body.classList.remove('admin-sidebar-open');
      return;
    }
    var licenseBtn = closestLicenseTab(e.target);
    if (licenseBtn) {
      e.preventDefault();
      show('crm', {
        crmMode: 'license',
        licensePage: licenseBtn.getAttribute('data-license-page') || 'status'
      });
    }
  }

  document.addEventListener('click', onClick, true);

  function readThemePref() {
    try {
      var v = String(localStorage.getItem('midiai_theme') || '').toLowerCase();
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch (_) {}
    return 'system';
  }

  function applyThemePref(pref) {
    var preference = pref === 'light' || pref === 'dark' || pref === 'system' ? pref : 'system';
    var effective = preference;
    if (preference === 'system') {
      try {
        effective = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
      } catch (_) {
        effective = 'dark';
      }
    }
    try { localStorage.setItem('midiai_theme', preference); } catch (_) {}
    document.documentElement.setAttribute('data-theme-preference', preference);
    document.documentElement.setAttribute('data-theme', effective);
    document.documentElement.style.colorScheme = effective;
    try {
      window.dispatchEvent(new CustomEvent('midiai:theme', {
        detail: { preference: preference, effective: effective }
      }));
    } catch (_) {}
    return preference;
  }

  function bindAdminThemeSelect() {
    var sel = $('adminThemeSelect');
    if (!sel || sel.dataset.themeBound === '1') return;
    sel.dataset.themeBound = '1';
    sel.value = readThemePref();
    sel.addEventListener('change', function () {
      applyThemePref(sel.value);
    });
    window.addEventListener('midiai:theme', function (e) {
      var pref = (e && e.detail && e.detail.preference) || readThemePref();
      if (sel.value !== pref) sel.value = pref;
    });
  }

  bindAdminThemeSelect();
})();
