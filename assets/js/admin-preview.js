const $ = (id) => document.getElementById(id);

const VIEWS = {
  home: 'adminHomeSection',
  crm: 'adminCrm',
  payments: 'adminPaymentsSection',
  tickets: 'adminTicketsSection',
  logs: 'adminLogsSection',
  pricing: 'adminPricingSection',
  content: 'adminContentSection'
};
const TITLES = {
  home: '홈',
  crm: '회원 관리',
  payments: '결제 내역',
  tickets: '문의 관리',
  logs: '로그',
  pricing: '가격·상품',
  content: '공지·콘텐츠'
};
const CRM_TITLES = { members: '회원 관리', license: '라이선스 현황', orders: '사용자별 주문' };
const PREVIEW_TODAY = '2026-08-19';
const LOG_TABS = [
  ['all', '전체'],
  ['license', '라이선스'],
  ['admin', '관리자 작업'],
  ['message', '쪽지'],
  ['payment', '결제'],
  ['app', '앱'],
  ['hwid', 'HWID/기기'],
  ['ticket', '문의']
];
const ADMIN_LOG_CATS = new Set(['license', 'admin', 'message', 'hwid']);

/** Preview mock adapter — derived only from this file, not production schema. */
const MEMBERS = [
  { uid: 'u_preview_01', name: 'M44 Praesepe', email: 'praesepe@example.com', role: 'admin', plan: 'lifetime', licenseStatus: 'active', activity: 'online', country: '🇰🇷 대한민국', seen: '방금', orders: 3, tickets: 1, fav: true, joined: '2026.03.12', startsAt: '2026-03-12', expiresAt: '', licenseMemo: 'VIP / 원격지원 완료', issuedBy: '관리자', changedAt: '2026.08.18' },
  { uid: 'u_preview_02', name: 'Nova Lyrae', email: 'nova.lyrae@example.com', role: 'user', plan: 'trial', licenseStatus: 'active', activity: 'active', country: '🇯🇵 일본', seen: '12분 전', orders: 0, tickets: 2, fav: false, joined: '2026.08.01', startsAt: '2026-08-01', expiresAt: '', licenseMemo: '', issuedBy: '시스템', changedAt: '2026.08.01' },
  { uid: 'u_preview_03', name: 'Orion Belt', email: 'orion.belt@example.net', role: 'user', plan: 'period', licenseStatus: 'active', activity: 'idle', country: '🇺🇸 미국', seen: '3일 전', orders: 2, tickets: 0, fav: false, joined: '2026.07.18', startsAt: '2026-07-18', expiresAt: '2026-09-18', licenseMemo: 'PayPal 기간제 30일', issuedBy: '결제', changedAt: '2026.08.09' },
  { uid: 'u_preview_04', name: 'Vega Prime', email: 'vega.prime@example.com', role: 'user', plan: 'lifetime', licenseStatus: 'active', activity: 'offline', country: '🇰🇷 대한민국', seen: '18일 전', orders: 1, tickets: 0, fav: true, joined: '2026.05.04', startsAt: '2026-05-04', expiresAt: '', licenseMemo: '', issuedBy: 'PayPal', changedAt: '2026.05.04' },
  { uid: 'u_preview_05', name: 'Altair Note', email: 'altair.note@example.org', role: 'user', plan: 'trial', licenseStatus: 'active', activity: 'offline', country: '', seen: '32일 전', orders: 0, tickets: 1, fav: false, joined: '2026.06.22', startsAt: '2026-06-22', expiresAt: '', licenseMemo: '', issuedBy: '시스템', changedAt: '2026.06.22' },
  { uid: 'u_preview_06', name: 'Deneb Keys', email: 'deneb.keys@example.com', role: 'user', plan: 'period', licenseStatus: 'active', activity: 'active', country: '🇩🇪 독일', seen: '1시간 전', orders: 4, tickets: 3, fav: false, joined: '2026.08.14', startsAt: '2026-08-14', expiresAt: '2026-09-13', licenseMemo: '체험판 업그레이드 대기', issuedBy: '관리자', changedAt: '2026.08.14' }
];

const ORDERS = [
  { id: 'ord_88101', uid: 'u_preview_01', email: 'praesepe@example.com', product: 'Lifetime', method: 'PortOne', amount: '130,000 KRW', amountKrw: 130000, status: '결제완료', date: '2026.08.19', when: '08.19 09:03', isToday: true },
  { id: 'ord_88021', uid: 'u_preview_01', email: 'praesepe@example.com', product: 'Lifetime', method: 'PortOne', amount: '89,000 KRW', amountKrw: 89000, status: '결제완료', date: '2026.08.12', when: '08.12 09:18', isToday: false },
  { id: 'ord_88018', uid: 'u_preview_03', email: 'orion.belt@example.net', product: '기간제', method: 'PayPal', amount: '59.00 USD', amountKrw: 0, status: '결제완료', date: '2026.08.09', when: '08.09 16:40', isToday: false },
  { id: 'ord_87990', uid: 'u_preview_06', email: 'deneb.keys@example.com', product: '체험판 업그레이드', method: 'PortOne', amount: '29,000 KRW', amountKrw: 29000, status: '대기', date: '2026.08.04', when: '08.04 11:22', isToday: false },
  { id: 'ord_87911', uid: 'u_preview_04', email: 'vega.prime@example.com', product: 'Lifetime', method: 'PayPal', amount: '59.00 USD', amountKrw: 0, status: '환불', date: '2026.07.22', when: '07.22 13:05', isToday: false }
];

const TICKETS = [
  { id: 't_1004', type: '결제', title: 'PayPal 중복 결제', user: 'orion.belt@example.net', uid: 'u_preview_03', status: 'open', when: '08.19 10:12' },
  { id: 't_1001', type: '결제', title: '라이선스 미지급 문의', user: 'praesepe@example.com', uid: 'u_preview_01', status: 'open', when: '08.18 21:40' },
  { id: 't_1002', type: '앱', title: 'HWID 초기화 요청', user: 'nova.lyrae@example.com', uid: 'u_preview_02', status: 'answered', when: '08.16 15:01' },
  { id: 't_1003', type: '기타', title: 'MIDI 내보내기 오류', user: 'deneb.keys@example.com', uid: 'u_preview_06', status: 'closed', when: '08.02 19:08' }
];

const LOGS = [
  { uid: 'u_preview_01', cat: 'app', action: '앱 로그인', summary: 'Windows App', actor: 'user', when: '08.19 08:44', day: 'today' },
  { uid: 'u_preview_01', cat: 'license', action: 'Lifetime 지급', summary: 'trial → lifetime', actor: 'admin', when: '08.18 21:12', day: '7d' },
  { uid: 'u_preview_02', cat: 'hwid', action: 'HWID 초기화', summary: '기기 바인딩 해제', actor: 'admin', when: '08.17 14:03', day: '7d' },
  { uid: 'u_preview_01', cat: 'message', action: '쪽지 발송', summary: '원격지원 안내', actor: 'admin', when: '08.16 11:40', day: '7d' },
  { uid: 'u_preview_02', cat: 'ticket', action: '문의 답변', summary: 'HWID 초기화 요청', actor: 'admin', when: '08.16 15:01', day: '7d' },
  { uid: 'u_preview_01', cat: 'payment', action: '주문 확인', summary: 'ord_88021 결제완료', actor: 'system', when: '08.12 09:18', day: '30d' },
  { uid: 'u_preview_01', cat: 'admin', action: '권한 변경', summary: 'user → admin', actor: 'admin', when: '08.10 18:22', day: '30d' },
  { uid: 'u_preview_03', cat: 'admin', action: '사용자 차단', summary: 'banned', actor: 'admin', when: '08.08 12:10', day: '30d' }
];

let selectedUid = '';
let selected = new Set();
let logTab = 'all';
let logUid = '';
let crmMode = 'members';
let preferredDetailTab = 'overview';

function memberByUid(uid) {
  return MEMBERS.find((u) => u.uid === uid) || null;
}
function memberByEmail(email) {
  return MEMBERS.find((u) => u.email === email) || null;
}
function previewNotice(msg) {
  const el = $('adminSaveMsg');
  if (!el) return alert(msg);
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(previewNotice._t);
  previewNotice._t = setTimeout(() => el.classList.add('hidden'), 2400);
}
function planBadge(plan) {
  const map = { lifetime: '평생', trial: '체험판', period: '기간제' };
  return `<span class="crm-badge is-${plan}"><i></i>${map[plan] || plan}</span>`;
}
function licenseBadge(u) {
  if (u?.licenseStatus === 'banned') return `<span class="crm-badge is-banned"><i></i>정지</span>`;
  return planBadge(u?.plan);
}
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
function fmtDot(iso) {
  if (!iso) return '-';
  return iso.replace(/-/g, '.');
}
function setSaveEnabled(on) {
  const save = $('adminCrmFloatSave');
  if (!save) return;
  save.hidden = !selectedUid;
  save.disabled = !on;
  save.classList.toggle('is-disabled', !on);
}
function syncLicenseDatesToPlan() {
  const plan = $('adminLicensePlan')?.value;
  if (plan === 'trial' || plan === 'lifetime') {
    if ($('adminLicenseStartsAt')) $('adminLicenseStartsAt').value = '';
    if ($('adminLicenseExpiresAt')) $('adminLicenseExpiresAt').value = '';
  } else if (plan === 'period') {
    if ($('adminLicenseStartsAt') && !$('adminLicenseStartsAt').value) $('adminLicenseStartsAt').value = PREVIEW_TODAY;
    if ($('adminLicenseExpiresAt') && !$('adminLicenseExpiresAt').value) $('adminLicenseExpiresAt').value = addDays(PREVIEW_TODAY, 30);
  }
}
function applyPreviewLicense(patch, { tab = 'license', notice } = {}) {
  const u = memberByUid(selectedUid);
  if (!u) return;
  Object.assign(u, patch);
  u.changedAt = fmtDot(PREVIEW_TODAY);
  u.issuedBy = patch.issuedBy || '관리자';
  openDetail(selectedUid, { tab });
  setSaveEnabled(false);
  previewNotice(notice || '미리보기 — 실제 라이선스 데이터는 변경되지 않습니다');
}
function roleBadge(role) {
  return `<span class="crm-role is-${role}">${role === 'admin' ? '관리자' : '사용자'}</span>`;
}
function activityBadge(a) {
  const map = { online: '온라인', active: '활성', idle: '대기', offline: '오프라인' };
  return `<span class="crm-activity is-${a}"><i></i>${map[a] || a}</span>`;
}
function payStatusBadge(status) {
  const on = status === '결제완료' ? 'is-active' : status === '환불' ? 'is-banned' : 'is-loading';
  return `<span class="crm-badge ${on}"><i></i>${status}</span>`;
}
function ticketStatusBadge(status) {
  const map = { open: ['is-trial', '미답변'], answered: ['is-active', '답변 완료'], closed: ['is-none', '종료'] };
  const [cls, label] = map[status] || ['is-none', status];
  return `<span class="crm-badge ${cls}"><i></i>${label}</span>`;
}
function dashEmpty(text) {
  return `<p class="admin-dash-empty">${text}</p>`;
}

function showView(view, opts = {}) {
  const next = VIEWS[view] ? view : 'crm';
  Object.entries(VIEWS).forEach(([key, id]) => {
    const el = $(id);
    if (el) el.hidden = key !== next;
  });
  if (next === 'crm') {
    if (opts.crmMode) crmMode = opts.crmMode;
    else if (opts.detailTab === 'license') crmMode = 'license';
    else crmMode = 'members';
    if (opts.detailTab) preferredDetailTab = opts.detailTab;
    else if (crmMode === 'license') preferredDetailTab = 'license';
    else preferredDetailTab = 'overview';
    if ($('adminConsoleTitle')) $('adminConsoleTitle').textContent = CRM_TITLES[crmMode] || TITLES.crm;
  } else if ($('adminConsoleTitle')) {
    $('adminConsoleTitle').textContent = TITLES[next];
  }
  document.body.dataset.adminView = next;
  if (next === 'crm' && opts.closeDetail) closeDetail();
  else if (next === 'crm' && crmMode === 'license') {
    const uid = selectedUid || MEMBERS.find((u) => u.plan === 'period')?.uid || MEMBERS[0]?.uid;
    if (uid) openDetail(uid, { tab: 'license' });
  }
  if (next === 'tickets' && opts.ticketStatus && $('adminTicketStatus')) {
    $('adminTicketStatus').value = opts.ticketStatus;
    renderTickets();
  }
  if (next === 'logs') {
    if (opts.logsTab) logTab = opts.logsTab;
    if (opts.uid) logUid = opts.uid;
    renderLogs();
  }
  const sidebarBtns = [...document.querySelectorAll('.admin-sidebar [data-admin-nav]')];
  let target = opts.source?.closest?.('.admin-sidebar [data-admin-nav]') || null;
  if (!target) {
    target = sidebarBtns.find((btn) => {
      if (btn.getAttribute('data-admin-nav') !== next) return false;
      if (next === 'logs') return (btn.getAttribute('data-logs-tab') || 'all') === (opts.logsTab || logTab || 'all');
      if (next === 'tickets') return (btn.getAttribute('data-ticket-status') || 'all') === (opts.ticketStatus || $('adminTicketStatus')?.value || 'all');
      if (next === 'crm') {
        const mode = btn.getAttribute('data-crm-mode') || 'members';
        return mode === crmMode;
      }
      return true;
    });
  }
  sidebarBtns.forEach((btn) => btn.classList.toggle('is-active', btn === target));
  const hash = new URLSearchParams();
  hash.set('view', next);
  if (opts.logsTab) hash.set('log', opts.logsTab);
  if (opts.uid) hash.set('uid', opts.uid);
  if (opts.ticketStatus && opts.ticketStatus !== 'all') hash.set('ticket', opts.ticketStatus);
  if (next === 'crm' && crmMode === 'license') hash.set('crm', 'license');
  history.replaceState(null, '', `#${hash}`);
}

function crmStatsHtml() {
  const card = (key, n, label) => `<button type="button" class="crm-stat" data-crm-stat="${key}"><b>${n}</b><span>${label}</span></button>`;
  const nowActive = MEMBERS.filter((u) => u.activity === 'online' || u.activity === 'active').length;
  return [
    card('all', MEMBERS.length, '전체 회원'),
    card('active', nowActive, '활성'),
    card('lifetime', MEMBERS.filter((u) => u.plan === 'lifetime').length, '평생'),
    card('trial', MEMBERS.filter((u) => u.plan === 'trial').length, '체험판'),
    card('today', 0, '오늘 가입'),
    card('idle7', MEMBERS.filter((u) => u.seen.includes('일 전') && parseInt(u.seen, 10) >= 7).length, '7일 미접속'),
    card('idle30', MEMBERS.filter((u) => u.seen.includes('일 전') && parseInt(u.seen, 10) >= 30).length, '30일 미접속'),
    card('filtered', MEMBERS.length, '필터 결과')
  ].join('');
}

function dashKpiHtml() {
  // derived mock: MEMBERS.length / activity / plan / joined-today(none) · ORDERS.isToday · TICKETS.status=open
  const todayOrders = ORDERS.filter((o) => o.isToday);
  const todayKrw = todayOrders.reduce((s, o) => s + (o.amountKrw || 0), 0);
  const openTickets = TICKETS.filter((t) => t.status === 'open').length;
  const online = MEMBERS.filter((u) => u.activity === 'online').length;
  const active = MEMBERS.filter((u) => u.activity === 'online' || u.activity === 'active').length;
  const card = (key, n, label, extra) => `<button type="button" class="crm-stat" data-dash-kpi="${key}"><b>${n}</b><span>${label}</span>${extra ? `<em>${extra}</em>` : ''}</button>`;
  return [
    card('all', MEMBERS.length, '전체 회원'),
    card('active', active, '활성 회원'),
    card('lifetime', MEMBERS.filter((u) => u.plan === 'lifetime').length, '평생'),
    card('trial', MEMBERS.filter((u) => u.plan === 'trial').length, '체험판'),
    card('today', 0, '오늘 가입'),
    card('pay-today', `${todayOrders.length}건`, '오늘 결제', todayKrw ? `${todayKrw.toLocaleString('ko-KR')} KRW` : ''),
    card('tickets-open', openTickets, '미답변 문의'),
    card('online', online, '현재 온라인')
  ].join('');
}

function renderDashboard() {
  $('adminHomeStats') && ($('adminHomeStats').innerHTML = dashKpiHtml());
  const payRows = ORDERS.slice(0, 5);
  $('dashPaymentsBody') && ($('dashPaymentsBody').innerHTML = payRows.length
    ? `<table class="admin-table admin-dash-table"><thead><tr><th>사용자</th><th>상품</th><th>금액</th><th>상태</th><th>시각</th></tr></thead><tbody>${payRows.map((o) => {
      const u = memberByUid(o.uid);
      return `<tr data-pay-uid="${o.uid}"><td>${u?.name || o.email}</td><td>${o.product}</td><td>${o.amount}</td><td>${payStatusBadge(o.status)}</td><td>${o.when}</td></tr>`;
    }).join('')}</tbody></table>`
    : dashEmpty('아직 결제 내역이 없습니다.'));
  const tktRows = TICKETS.slice(0, 5);
  $('dashTicketsBody') && ($('dashTicketsBody').innerHTML = tktRows.length
    ? `<table class="admin-table admin-dash-table"><thead><tr><th>사용자</th><th>제목</th><th>유형</th><th>상태</th><th>시각</th></tr></thead><tbody>${tktRows.map((t) => {
      const u = memberByUid(t.uid) || memberByEmail(t.user);
      return `<tr data-dash-ticket="${t.status}"><td>${u?.name || t.user}</td><td>${t.title}</td><td>${t.type}</td><td>${ticketStatusBadge(t.status)}</td><td>${t.when}</td></tr>`;
    }).join('')}</tbody></table>`
    : dashEmpty('새로운 문의가 없습니다.'));
  const recentUsers = [...MEMBERS].sort((a, b) => String(b.joined).localeCompare(String(a.joined))).slice(0, 5);
  $('dashUsersBody') && ($('dashUsersBody').innerHTML = recentUsers.length
    ? `<div class="admin-dash-user-list">${recentUsers.map((u) => `
      <button type="button" class="admin-dash-user" data-admin-uid="${u.uid}">
        <span class="admin-crm-card-avatar is-fallback">${u.name.slice(0, 1)}</span>
        <span class="admin-dash-user-main">
          <b>${u.name}</b>
          <small>${u.email}</small>
          <span class="admin-dash-user-meta">${roleBadge(u.role)} ${planBadge(u.plan)}${u.country ? ` <em>${u.country}</em>` : ''} ${activityBadge(u.activity)}</span>
        </span>
      </button>`).join('')}</div>`
    : dashEmpty('최근 가입 회원이 없습니다.'));
  const adminRows = LOGS.filter((r) => ADMIN_LOG_CATS.has(r.cat)).slice(0, 5);
  $('dashAdminBody') && ($('dashAdminBody').innerHTML = adminRows.length
    ? `<table class="admin-table admin-dash-table"><thead><tr><th>시각</th><th>대상</th><th>작업</th><th>수행자</th></tr></thead><tbody>${adminRows.map((r) => {
      const u = memberByUid(r.uid);
      return `<tr data-dash-log-uid="${r.uid}"><td>${r.when}</td><td>${u?.name || r.uid}</td><td>${r.action}</td><td>${r.actor}</td></tr>`;
    }).join('')}</tbody></table>`
    : dashEmpty('최근 관리자 작업이 없습니다.'));
}

function renderMembers() {
  const q = ($('adminUserSearch')?.value || '').trim().toLowerCase();
  const plan = $('adminUserLicenseStatus')?.value || 'all';
  const ord = $('adminCrmFilterOrders')?.value || 'all';
  const tkt = $('adminCrmFilterTickets')?.value || 'all';
  const rows = MEMBERS.filter((u) => {
    if (plan === 'favorites' && !u.fav) return false;
    if (plan !== 'all' && plan !== 'favorites' && u.plan !== plan) return false;
    if (ord === 'has' && !u.orders) return false;
    if (ord === 'none' && u.orders) return false;
    if (tkt === 'has' && !u.tickets) return false;
    if (tkt === 'none' && u.tickets) return false;
    const hay = [u.name, u.email, u.uid, 'hwid-preview'].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  $('adminUserCount') && ($('adminUserCount').textContent = `${rows.length} / ${MEMBERS.length}`);
  const box = $('adminUserList');
  if (!box) return;
  box.innerHTML = `<div class="admin-table-wrap admin-console-table-wrap"><table class="admin-table admin-member-table"><thead><tr>
    <th class="admin-col-check"></th><th>사용자</th><th>이메일</th><th>권한</th><th>라이선스</th><th>상태</th><th>국가</th><th>최근 접속</th><th>주문</th><th>문의</th>
  </tr></thead><tbody>${rows.map((u) => `
    <tr class="admin-crm-member-row${selectedUid === u.uid ? ' is-selected' : ''}" data-admin-uid="${u.uid}">
      <td><label class="admin-crm-check" onclick="event.stopPropagation()"><input type="checkbox" data-crm-check="${u.uid}" ${selected.has(u.uid) ? 'checked' : ''}></label></td>
      <td class="admin-member-user"><span class="admin-crm-card-avatar is-fallback">${u.name.slice(0, 1)}</span><span><b>${u.fav ? '<span class="crm-fav-mark">★</span>' : ''}${u.name}</b></span></td>
      <td class="admin-member-email" title="${u.email}">${u.email}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${licenseBadge(u)}</td>
      <td>${activityBadge(u.activity)}</td>
      <td class="admin-member-country">${u.country || '-'}</td>
      <td>${u.seen}</td>
      <td>${u.orders}</td>
      <td>${u.tickets}</td>
    </tr>`).join('')}</tbody></table></div>`;
  const pager = $('adminCrmPager');
  if (pager) {
    pager.hidden = false;
    pager.innerHTML = `<button type="button" class="ghost mini-btn" disabled>이전</button><span class="admin-crm-pager-info">1 / 1</span><button type="button" class="ghost mini-btn" disabled>다음</button><span class="admin-crm-pager-info muted">1–${rows.length} · ${rows.length}명</span>`;
  }
}

function openDetail(uid, opts = {}) {
  const u = memberByUid(uid);
  if (!u) return;
  selectedUid = uid;
  const body = $('adminCrmDetailBody');
  $('adminCrm')?.classList.add('is-detail-open');
  $('adminCrmEmpty')?.classList.add('is-hidden');
  body?.classList.remove('is-hidden');
  body?.classList.add('is-fading');
  $('adminCrmName') && ($('adminCrmName').textContent = u.name);
  $('adminCrmEmail') && ($('adminCrmEmail').textContent = u.email);
  $('adminCrmUid') && ($('adminCrmUid').textContent = `UID ${u.uid}`);
  $('adminCrmRoleBadge') && ($('adminCrmRoleBadge').innerHTML = roleBadge(u.role));
  $('adminCrmHeaderLicense') && ($('adminCrmHeaderLicense').innerHTML = licenseBadge(u));
  $('adminCrmLicenseBadge') && ($('adminCrmLicenseBadge').innerHTML = licenseBadge(u));
  $('adminCrmHeaderMeta') && ($('adminCrmHeaderMeta').innerHTML = `<span><em>가입</em> ${u.joined}</span><span><em>최근 로그인</em> ${u.seen}</span><span>${activityBadge(u.activity)}</span>`);
  $('adminCrmFavBtn') && ($('adminCrmFavBtn').textContent = u.fav ? '★' : '☆');
  $('adminUserRole') && ($('adminUserRole').value = u.role);
  $('adminLicenseUid') && ($('adminLicenseUid').value = u.uid);
  $('adminLicensePlan') && ($('adminLicensePlan').value = u.plan);
  $('adminLicenseStartsAt') && ($('adminLicenseStartsAt').value = u.plan === 'period' ? (u.startsAt || '') : '');
  $('adminLicenseExpiresAt') && ($('adminLicenseExpiresAt').value = u.plan === 'period' ? (u.expiresAt || '') : '');
  $('adminLicenseMemo') && ($('adminLicenseMemo').value = u.licenseMemo || '');
  $('adminCrmLicenseMeta') && ($('adminCrmLicenseMeta').innerHTML = `<span class="crm-chip"><em>유형</em>${u.plan}</span><span class="crm-chip"><em>상태</em>${u.licenseStatus === 'banned' ? '정지' : '활성'}</span><span class="crm-chip"><em>시작</em>${u.startsAt ? fmtDot(u.startsAt) : u.joined}</span><span class="crm-chip"><em>만료</em>${u.plan === 'lifetime' ? '없음' : (u.expiresAt ? fmtDot(u.expiresAt) : '-')}</span><span class="crm-chip"><em>변경</em>${u.changedAt || '-'}</span><span class="crm-chip"><em>발급</em>${u.issuedBy || '-'}</span>`);
  $('adminCrmSummary') && ($('adminCrmSummary').innerHTML = `
    <button type="button" class="admin-crm-summary-card" data-crm-action="orders"><span>주문 <b>${u.orders}</b></span><small>최근 2026.08.19 · 130,000 KRW</small></button>
    <button type="button" class="admin-crm-summary-card" data-crm-action="tickets"><span>문의 <b>${u.tickets}</b></span><small>최근 2026.08.18</small></button>
    <div class="admin-crm-summary-card"><span>활동 ${activityBadge(u.activity)}</span><small>${u.seen}</small></div>`);
  $('adminCrmHwidBox') && ($('adminCrmHwidBox').innerHTML = `
    <div class="admin-crm-hwid-inline"><span class="admin-crm-hwid-label">HWID</span><code class="mono admin-crm-hwid-value">ABCD-****-****-12F9</code></div>
    <div class="admin-crm-hwid-actions">
      <button type="button" class="secondary mini-btn" data-crm-action="hwid-reveal">보기</button>
      <button type="button" class="secondary mini-btn" data-crm-action="hwid-copy">복사</button>
      <button type="button" class="secondary mini-btn danger-btn" data-crm-action="hwid-reset">초기화</button>
    </div>`);
  $('adminCrmAccessBox') && ($('adminCrmAccessBox').innerHTML = `<dl class="admin-crm-access-list">
    <div><dt>국가</dt><dd>${u.country || '국가 정보 없음'}</dd></div>
    <div><dt>지역</dt><dd>${u.country ? 'Seoul' : '-'}</dd></div>
    <div><dt>최근 접속</dt><dd>2026.08.19 10:31</dd></div>
    <div><dt>IP</dt><dd>123.45.***.***</dd></div>
    <div><dt>언어</dt><dd>ko-KR</dd></div>
    <div><dt>접속 환경</dt><dd>MidiAI Studio App</dd></div>
  </dl>`);
  const orders = ORDERS.filter((o) => o.uid === uid);
  $('adminCrmOrders') && ($('adminCrmOrders').innerHTML = `<table class="admin-table crm-mini-table"><thead><tr><th>주문번호</th><th>수단</th><th>금액</th><th>날짜</th><th>상태</th></tr></thead><tbody>${orders.length ? orders.map((o) => `<tr><td class="mono">${o.id}</td><td>${o.method}</td><td>${o.amount}</td><td>${o.date}</td><td>${o.status}</td></tr>`).join('') : '<tr><td colspan="5">주문 없음</td></tr>'}</tbody></table>`);
  $('adminCrmTickets') && ($('adminCrmTickets').innerHTML = TICKETS.filter((t) => t.uid === uid).map((t) => `<a class="admin-crm-ticket-row" href="#"><b>${t.title}</b><span>${t.status}</span><span>${t.when}</span></a>`).join('') || '<p class="muted small">문의 없음</p>');
  $('adminCrmPostsCount') && ($('adminCrmPostsCount').textContent = '2건');
  $('adminCrmPosts') && ($('adminCrmPosts').innerHTML = `<div class="admin-crm-post-row"><label class="admin-crm-check"><input type="checkbox"></label><a class="admin-crm-post-main" href="./board.html"><b>변환 결과 공유합니다</b><span class="admin-crm-post-meta">자유게시판 · 2026.08.11</span></a></div>
    <div class="admin-crm-post-row"><label class="admin-crm-check"><input type="checkbox"></label><a class="admin-crm-post-main" href="./board.html"><b>HWID 문의 후기</b><span class="admin-crm-post-meta">자유게시판 · 2026.07.30</span></a></div>`);
  $('adminCrmUserMemo') && ($('adminCrmUserMemo').value = 'VIP / 원격지원 완료 (미리보기)');
  $('adminCrmMemoHistory') && ($('adminCrmMemoHistory').innerHTML = '<div class="admin-crm-memo-hist-list"><div class="admin-crm-memo-hist-item"><time>2일 전</time><span>원격지원 완료</span></div></div>');
  $('adminCrmTimeline') && ($('adminCrmTimeline').innerHTML = '<div class="admin-crm-timeline-item"><span class="admin-crm-timeline-dot"></span><div><b>Lifetime 지급</b><time>2026.08.18</time><span>관리자 지급</span></div></div><div class="admin-crm-timeline-item"><span class="admin-crm-timeline-dot"></span><div><b>가입</b><time>' + u.joined + '</time><span>Google</span></div></div>');
  $('adminCrmRecentFeed') && ($('adminCrmRecentFeed').innerHTML = '<div class="admin-crm-feed-item"><time>21:12</time><b>라이선스 지급</b><span>lifetime</span></div><div class="admin-crm-feed-item"><time>14:03</time><b>HWID 초기화</b></div>');
  $('adminCrmUsage') && ($('adminCrmUsage').innerHTML = '<p class="muted small">FULL 변환 12회 · 미리보기 목업</p>');
  const save = $('adminCrmFloatSave');
  if (save) { save.hidden = false; save.disabled = true; save.classList.add('is-disabled'); }
  setDetailTab(opts.tab || preferredDetailTab || 'overview');
  renderMembers();
}

function closeDetail() {
  selectedUid = '';
  $('adminCrm')?.classList.remove('is-detail-open');
  $('adminCrmEmpty')?.classList.remove('is-hidden');
  $('adminCrmDetailBody')?.classList.add('is-hidden');
  const save = $('adminCrmFloatSave');
  if (save) save.hidden = true;
  renderMembers();
}

function setDetailTab(tab) {
  const body = $('adminCrmDetailBody');
  if (body) body.dataset.tab = tab;
  document.querySelectorAll('#adminCrmDetailTabs [data-crm-detail-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-crm-detail-tab') === tab);
  });
}

function renderPayments() {
  const q = ($('adminPaymentsSearch')?.value || '').trim().toLowerCase();
  const rows = ORDERS.filter((o) => !q || [o.id, o.uid, o.email, o.product].join(' ').toLowerCase().includes(q));
  $('adminPaymentsCount') && ($('adminPaymentsCount').textContent = `${rows.length} / ${ORDERS.length}`);
  const box = $('adminPaymentsList');
  if (!box) return;
  box.innerHTML = `<table class="admin-table admin-payments-table"><thead><tr><th>주문번호</th><th>사용자</th><th>상품</th><th>수단</th><th>금액</th><th>상태</th><th>결제일</th></tr></thead><tbody>${rows.map((o) => `<tr data-pay-uid="${o.uid}"><td class="mono">${o.id}</td><td>${o.email}</td><td>${o.product}</td><td>${o.method}</td><td>${o.amount}</td><td>${o.status}</td><td>${o.date}</td></tr>`).join('')}</tbody></table>`;
}

function renderTickets() {
  const q = ($('adminTicketSearch')?.value || '').trim().toLowerCase();
  const st = $('adminTicketStatus')?.value || 'all';
  const rows = TICKETS.filter((t) => (st === 'all' || t.status === st) && (!q || [t.title, t.user].join(' ').toLowerCase().includes(q)));
  $('adminTicketCount') && ($('adminTicketCount').textContent = `${rows.length} / ${TICKETS.length}`);
  const box = $('adminTicketList');
  if (!box) return;
  box.innerHTML = `<table class="admin-table"><thead><tr><th></th><th>유형</th><th>제목</th><th>사용자</th><th>상태</th><th>수정일</th></tr></thead><tbody>${rows.map((t) => `<tr><td></td><td>${t.type}</td><td><b>${t.title}</b></td><td>${t.user}</td><td>${ticketStatusBadge(t.status)}</td><td>${t.when}</td></tr>`).join('')}</tbody></table>`;
}

function fillLogUserSelect(filter) {
  const sel = $('adminLogsUserSelect');
  if (!sel) return;
  const q = String(filter || '').trim().toLowerCase();
  const list = MEMBERS.filter((u) => !q || [u.name, u.email, u.uid].join(' ').toLowerCase().includes(q));
  const cur = logUid;
  if (cur && !list.some((u) => u.uid === cur)) {
    const extra = memberByUid(cur);
    if (extra) list.unshift(extra);
  }
  sel.innerHTML = `<option value="">사용자 선택</option>` + list.map((u) => `<option value="${u.uid}" ${u.uid === cur ? 'selected' : ''}>${u.name} · ${u.email}</option>`).join('');
}

function renderLogs() {
  fillLogUserSelect($('adminLogsUserSearch')?.value || '');
  if ($('adminLogsUserSelect') && logUid) $('adminLogsUserSelect').value = logUid;
  const tabs = $('adminLogsTabs');
  if (tabs) {
    tabs.innerHTML = LOG_TABS.map(([id, label]) => `<button type="button" class="admin-logs-tab${logTab === id ? ' is-active' : ''}" data-log-tab="${id}">${label}</button>`).join('');
  }
  const u = memberByUid(logUid);
  const selectedBox = $('adminLogsSelected');
  if (selectedBox) {
    selectedBox.innerHTML = u
      ? `<div class="admin-logs-identity">
          <span class="admin-crm-card-avatar is-fallback">${u.name.slice(0, 1)}</span>
          <div>
            <div class="admin-logs-identity-top"><b>${u.name}</b> ${roleBadge(u.role)} ${planBadge(u.plan)} ${activityBadge(u.activity)}</div>
            <small>${u.email}</small>
            <span class="muted small">${[u.country, u.seen ? `최근 접속 ${u.seen}` : ''].filter(Boolean).join(' · ')}</span>
          </div>
        </div>`
      : `<p class="muted">사용자를 선택하면 로그가 표시됩니다.</p>`;
  }
  const q = ($('adminLogsTableSearch')?.value || '').trim().toLowerCase();
  const range = $('adminLogsDateFilter')?.value || 'all';
  const rows = LOGS.filter((r) => {
    if (!logUid) return false;
    if (r.uid !== logUid) return false;
    if (logTab !== 'all' && r.cat !== logTab) return false;
    if (range === 'today' && r.day !== 'today') return false;
    if (range === '7d' && !(r.day === 'today' || r.day === '7d')) return false;
    if (range === '30d' && r.day === 'older') return false;
    const hay = [r.action, r.summary, r.cat, r.actor].join(' ').toLowerCase();
    return !q || hay.includes(q);
  });
  $('adminLogsTableMeta') && ($('adminLogsTableMeta').textContent = logUid ? `${rows.length}건 · 미리보기` : '');
  $('adminLogsTableHead') && ($('adminLogsTableHead').innerHTML = '<tr><th>시각</th><th>종류</th><th>작업</th><th>내용</th><th>수행자</th></tr>');
  $('adminLogsTableBody') && ($('adminLogsTableBody').innerHTML = rows.map((r) => {
    const catLabel = (LOG_TABS.find(([id]) => id === r.cat) || [r.cat, r.cat])[1];
    return `<tr><td>${r.when}</td><td>${catLabel}</td><td>${r.action}</td><td>${r.summary}</td><td>${r.actor}</td></tr>`;
  }).join(''));
  const empty = $('adminLogsEmpty');
  if (empty) {
    empty.hidden = !!(logUid && rows.length);
    empty.textContent = !logUid ? '사용자를 선택하면 로그가 표시됩니다.' : '해당하는 로그가 없습니다.';
  }
}

function renderPricingMock() {
  const list = $('pricingProductList');
  if (list) list.innerHTML = '<button type="button" class="pricing-product-item is-active"><b>MidiAI Studio License</b><small>KR · Global</small></button>';
  const editor = $('pricingEditor');
  if (editor) editor.innerHTML = '<p class="muted">미리보기입니다. 실제 상품 저장은 관리자 로그인 후 <code>admin.html</code>에서 합니다.</p>';
}

function bind() {
  document.documentElement.classList.add('sidebar-ready');
  $('admin')?.classList.remove('admin-locked');
  $('adminCrmStats') && ($('adminCrmStats').innerHTML = crmStatsHtml());
  renderDashboard();
  renderMembers();
  renderPayments();
  renderTickets();
  renderLogs();
  renderPricingMock();

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-admin-nav]');
    if (nav) {
      e.preventDefault();
      showView(nav.getAttribute('data-admin-nav'), {
        logsTab: nav.getAttribute('data-logs-tab') || undefined,
        ticketStatus: nav.getAttribute('data-ticket-status') || undefined,
        closeDetail: nav.getAttribute('data-admin-close-detail') === '1',
        crmMode: nav.getAttribute('data-crm-mode') || undefined,
        detailTab: nav.getAttribute('data-crm-detail-tab') || undefined,
        source: nav
      });
      document.body.classList.remove('admin-sidebar-open');
    }
    const dashKpi = e.target.closest('[data-dash-kpi]');
    if (dashKpi) {
      const key = dashKpi.getAttribute('data-dash-kpi');
      if (key === 'pay-today') showView('payments');
      else if (key === 'tickets-open') showView('tickets', { ticketStatus: 'open' });
      else {
        showView('crm');
        if (['trial', 'lifetime', 'period'].includes(key) && $('adminUserLicenseStatus')) $('adminUserLicenseStatus').value = key;
        else if ($('adminUserLicenseStatus')) $('adminUserLicenseStatus').value = 'all';
        renderMembers();
      }
    }
    const stat = e.target.closest('#adminCrmStats [data-crm-stat]');
    if (stat) {
      showView('crm');
      const key = stat.getAttribute('data-crm-stat');
      if (['trial', 'lifetime', 'period'].includes(key) && $('adminUserLicenseStatus')) $('adminUserLicenseStatus').value = key;
      renderMembers();
    }
    const dashUser = e.target.closest('.admin-dash-user[data-admin-uid]');
    if (dashUser) {
      showView('crm');
      openDetail(dashUser.getAttribute('data-admin-uid'));
    }
    const dashLog = e.target.closest('[data-dash-log-uid]');
    if (dashLog) showView('logs', { logsTab: 'admin', uid: dashLog.getAttribute('data-dash-log-uid') });
    const dashTicket = e.target.closest('[data-dash-ticket]');
    if (dashTicket) showView('tickets', { ticketStatus: dashTicket.getAttribute('data-dash-ticket') === 'open' ? 'open' : 'all' });
    const row = e.target.closest('#adminUserList [data-admin-uid]');
    if (row && !e.target.closest('[data-crm-check]')) openDetail(row.getAttribute('data-admin-uid'));
    const check = e.target.closest('[data-crm-check]');
    if (check) {
      const uid = check.getAttribute('data-crm-check');
      if (check.checked) selected.add(uid); else selected.delete(uid);
      const bar = $('adminCrmBulkbar');
      if (bar) bar.hidden = selected.size === 0;
      $('adminCrmBulkCount') && ($('adminCrmBulkCount').textContent = `${selected.size}명 선택`);
    }
    const tab = e.target.closest('[data-crm-detail-tab]');
    if (tab) setDetailTab(tab.getAttribute('data-crm-detail-tab'));
    const action = e.target.closest('[data-crm-action],[data-bulk]');
    if (action) {
      const act = action.getAttribute('data-crm-action') || action.getAttribute('data-bulk');
      if (act === 'back-list') closeDetail();
      else if (act === 'orders' || act === 'orders-more') setDetailTab('payments');
      else if (act === 'tickets') setDetailTab('tickets');
      else if (act === 'tickets-tab') showView('tickets');
      else if (act === 'open-logs') showView('logs', { logsTab: 'all', uid: selectedUid });
      else if (act === 'close-order-drawer') $('adminCrmOrderDrawer') && ($('adminCrmOrderDrawer').hidden = true);
      else if (act === 'hwid-reveal') {
        const code = document.querySelector('.admin-crm-hwid-value');
        if (code) code.textContent = 'ABCD-77E2-91C0-12F9';
        previewNotice('미리보기 — HWID 표시');
      }
      else if (act === 'grant-trial') {
        applyPreviewLicense({ plan: 'trial', licenseStatus: 'active', startsAt: PREVIEW_TODAY, expiresAt: '', issuedBy: '관리자' }, { notice: '미리보기 — 체험판 지급 (실제 데이터 변경 없음)' });
      }
      else if (act === 'grant-lifetime') {
        applyPreviewLicense({ plan: 'lifetime', licenseStatus: 'active', startsAt: '', expiresAt: '', issuedBy: '관리자' }, { notice: '미리보기 — 평생 지급 (실제 데이터 변경 없음)' });
      }
      else if (act === 'grant-timed') {
        setDetailTab('license');
        if ($('adminLicensePlan')) $('adminLicensePlan').value = 'period';
        if ($('adminLicenseStartsAt')) $('adminLicenseStartsAt').value = PREVIEW_TODAY;
        if ($('adminLicenseExpiresAt')) $('adminLicenseExpiresAt').value = addDays(PREVIEW_TODAY, 30);
        setSaveEnabled(true);
        previewNotice('기간제 Type · 시작일·만료일 확인 후 Save Changes로 저장하세요');
      }
      else if (act === 'activate') {
        applyPreviewLicense({ licenseStatus: 'active' }, { notice: '미리보기 — 라이선스 활성화 (실제 데이터 변경 없음)' });
      }
      else if (act === 'hwid-copy') previewNotice('미리보기 — 클립보드에 복사하지 않고 안내만 표시');
      else if (['hwid-reset', 'delete', 'ban', 'app-message', 'posts-delete-selected', 'posts-delete-all'].includes(act)) {
        if (act === 'ban') applyPreviewLicense({ licenseStatus: 'banned' }, { notice: '미리보기 — 라이선스 정지 (실제 데이터 변경 없음)' });
        else previewNotice('미리보기 — 실제 데이터는 변경되지 않습니다');
      }
    }
    const pay = e.target.closest('[data-pay-uid]');
    if (pay && !e.target.closest('[data-admin-nav]')) {
      showView('crm');
      openDetail(pay.getAttribute('data-pay-uid'));
      setDetailTab('payments');
    }
    const logTabBtn = e.target.closest('[data-log-tab]');
    if (logTabBtn) {
      logTab = logTabBtn.getAttribute('data-log-tab');
      renderLogs();
    }
    if (e.target.closest('#adminLogsRefreshBtn')) renderLogs();
    const saveBtn = e.target.closest('#adminCrmFloatSave');
    if (saveBtn && !saveBtn.disabled) {
      const u = memberByUid(selectedUid);
      if (u) {
        const plan = $('adminLicensePlan')?.value || u.plan;
        applyPreviewLicense({
          role: $('adminUserRole')?.value || u.role,
          plan,
          startsAt: plan === 'period' ? ($('adminLicenseStartsAt')?.value || '') : '',
          expiresAt: plan === 'period' ? ($('adminLicenseExpiresAt')?.value || '') : '',
          licenseMemo: $('adminLicenseMemo')?.value || '',
          licenseStatus: u.licenseStatus === 'banned' ? 'banned' : 'active'
        }, { tab: 'license', notice: '미리보기 — 라이선스 저장 (실제 데이터 변경 없음)' });
      }
    }
  });

  ['adminUserSearch', 'adminPaymentsSearch', 'adminTicketSearch', 'adminLogsTableSearch', 'adminLogsUserSearch'].forEach((id) => {
    $(id)?.addEventListener('input', () => {
      if (id === 'adminUserSearch') renderMembers();
      if (id === 'adminPaymentsSearch') renderPayments();
      if (id === 'adminTicketSearch') renderTickets();
      if (id === 'adminLogsTableSearch') renderLogs();
      if (id === 'adminLogsUserSearch') fillLogUserSelect($('adminLogsUserSearch').value);
    });
  });
  ['adminUserLicenseStatus', 'adminUserSort', 'adminCrmFilterOrders', 'adminCrmFilterTickets', 'adminTicketStatus', 'adminLogsDateFilter', 'adminLogsUserSelect', 'adminLicensePlan', 'adminUserRole', 'adminLicenseStartsAt', 'adminLicenseExpiresAt'].forEach((id) => {
    $(id)?.addEventListener('change', () => {
      if (id === 'adminTicketStatus') renderTickets();
      else if (id === 'adminLogsDateFilter') renderLogs();
      else if (id === 'adminLogsUserSelect') {
        logUid = $('adminLogsUserSelect').value;
        renderLogs();
      }
      else if (id === 'adminLicensePlan') {
        syncLicenseDatesToPlan();
        setSaveEnabled(true);
      }
      else if (['adminUserRole', 'adminLicenseStartsAt', 'adminLicenseExpiresAt'].includes(id)) {
        const startVal = $('adminLicenseStartsAt')?.value || '';
        const endVal = $('adminLicenseExpiresAt')?.value || '';
        if ((startVal || endVal) && $('adminLicensePlan') && $('adminLicensePlan').value !== 'period') {
          $('adminLicensePlan').value = 'period';
        }
        setSaveEnabled(true);
      }
      else renderMembers();
    });
  });
  $('adminLicenseMemo')?.addEventListener('input', () => setSaveEnabled(true));
  $('adminSidebarToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.body.classList.toggle('admin-sidebar-open');
  });
  $('adminConsoleBackdrop')?.addEventListener('click', () => document.body.classList.remove('admin-sidebar-open'));
  $('adminCrmUsageToggle')?.addEventListener('click', () => {
    const body = $('adminCrmUsage');
    const open = body?.hidden;
    if (body) body.hidden = !open;
    $('adminCrmUsageHint') && ($('adminCrmUsageHint').textContent = open ? '접기' : '펼치기');
  });
  $('adminCrmSelectAll')?.addEventListener('change', (e) => {
    if (e.target.checked) MEMBERS.forEach((u) => selected.add(u.uid));
    else selected.clear();
    const bar = $('adminCrmBulkbar');
    if (bar) bar.hidden = selected.size === 0;
    $('adminCrmBulkCount') && ($('adminCrmBulkCount').textContent = `${selected.size}명 선택`);
    renderMembers();
  });

  const params = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  showView(params.get('view') || 'home', {
    logsTab: params.get('log') || undefined,
    ticketStatus: params.get('ticket') || undefined,
    uid: params.get('uid') || undefined,
    crmMode: params.get('crm') || undefined,
    detailTab: params.get('crm') === 'license' ? 'license' : undefined
  });
}

document.addEventListener('DOMContentLoaded', bind);
