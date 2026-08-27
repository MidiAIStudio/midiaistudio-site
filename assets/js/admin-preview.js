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
  crm: '회원',
  payments: '결제',
  tickets: '문의 관리',
  logs: '로그',
  pricing: '가격·상품',
  content: '콘텐츠'
};
const CRM_TITLES = { members: '회원', license: '라이선스', orders: '결제' };
const VIEW_LEADS = {
  home: '운영 현황을 한눈에 보고 주요 관리 화면으로 이동합니다.',
  payments: '주문자별로 묶어 주문·결제를 확인하고 삭제합니다.',
  tickets: '사용자 문의를 조회하고 답변 상태를 관리합니다.',
  logs: '사용자를 선택한 뒤 탭으로 관련 이력을 조회합니다.',
  pricing: '상품, Credit 지급량, 가격, 할인 및 프로모션을 관리합니다.',
  content: '공지·패치노트·FAQ·자유게시판을 한 화면에서 조회하고 관리합니다.'
};
const CRM_LEADS = {
  members: '회원을 검색하고 계정 상태와 주요 정보를 확인합니다.',
  license: '회원별 라이선스 상태를 확인하고 지급·변경·만료를 관리합니다.',
  orders: '주문자별로 묶어 주문·결제를 확인하고 삭제합니다.'
};
const PREVIEW_TODAY = '2026-08-19';
const LOG_TABS = [
  ['all', '전체'],
  ['license', '라이선스'],
  ['admin', '관리자 작업'],
  ['message', '쪽지/알림'],
  ['payment', '결제'],
  ['credit', '크레딧 사용내역'],
  ['app', '앱 사용'],
  ['hwid', 'HWID/기기'],
  ['ticket', '문의']
];
const ADMIN_LOG_CATS = new Set(['license', 'admin', 'message', 'hwid']);

/** Preview mock adapter — derived only from this file, not production schema. */
const MEMBERS = [
  { uid: 'u_preview_01', name: 'M44 Praesepe', email: 'praesepe@example.com', role: 'admin', plan: 'lifetime', licenseStatus: 'active', activity: 'online', country: '🇰🇷 대한민국', seen: '방금', orders: 3, tickets: 1, fav: true, joined: '2026.03.12', startsAt: '2026-03-12', expiresAt: '', licenseMemo: 'VIP / 원격지원 완료', issuedBy: '관리자', changedAt: '2026.08.18', credits: 12, hwid: 'A91C-77E2-91C0-12F9' },
  { uid: 'u_preview_02', name: 'Nova Lyrae', email: 'nova.lyrae@example.com', role: 'user', plan: 'trial', licenseStatus: 'active', activity: 'active', country: '🇯🇵 일본', seen: '12분 전', orders: 0, tickets: 2, fav: false, joined: '2026.08.01', startsAt: '2026-08-01', expiresAt: '', licenseMemo: '', issuedBy: '시스템', changedAt: '2026.08.01', credits: 3, hwid: 'B204-11AA-44B1-90C2' },
  { uid: 'u_preview_03', name: 'Orion Belt', email: 'orion.belt@example.net', role: 'user', plan: 'period', licenseStatus: 'active', activity: 'idle', country: '🇺🇸 미국', seen: '3일 전', orders: 2, tickets: 0, fav: false, joined: '2026.07.18', startsAt: '2026-07-18', expiresAt: '2026-09-18', licenseMemo: 'PayPal 기간제 30일', issuedBy: '결제', changedAt: '2026.08.09', credits: 8, hwid: 'C8F0-33D1-78E4-21AB' },
  { uid: 'u_preview_04', name: 'Vega Prime', email: 'vega.prime@example.com', role: 'user', plan: 'lifetime', licenseStatus: 'active', activity: 'offline', country: '🇰🇷 대한민국', seen: '18일 전', orders: 1, tickets: 0, fav: true, joined: '2026.05.04', startsAt: '2026-05-04', expiresAt: '', licenseMemo: '', issuedBy: 'PayPal', changedAt: '2026.05.04', credits: 20, hwid: 'D17B-90C8-12A0-55E1' },
  { uid: 'u_preview_05', name: 'Altair Note', email: 'altair.note@example.org', role: 'user', plan: 'period', licenseStatus: 'expired', activity: 'offline', country: '', seen: '32일 전', orders: 0, tickets: 1, fav: false, joined: '2026.06.22', startsAt: '2026-06-22', expiresAt: '2026-08-10', licenseMemo: '', issuedBy: '시스템', changedAt: '2026.08.10', credits: 0, hwid: '' },
  { uid: 'u_preview_06', name: 'Deneb Keys', email: 'deneb.keys@example.com', role: 'user', plan: 'period', licenseStatus: 'active', activity: 'active', country: '🇩🇪 독일', seen: '1시간 전', orders: 4, tickets: 3, fav: false, joined: '2026.08.14', startsAt: '2026-08-14', expiresAt: '2026-09-13', licenseMemo: '체험판 업그레이드 대기', issuedBy: '관리자', changedAt: '2026.08.14', credits: 5, hwid: 'E44A-62B9-03F7-88D0' }
];

const ORDERS = [
  { id: 'ord_88101', uid: 'u_preview_01', email: 'praesepe@example.com', product: 'Lifetime', method: 'PortOne', amount: '129,000 KRW', amountKrw: 129000, currency: 'KRW', status: '결제완료', date: '2026.08.19', when: '08.19 09:03', isToday: true },
  { id: 'ord_88021', uid: 'u_preview_01', email: 'praesepe@example.com', product: 'Lifetime', method: 'PortOne', amount: '89,000 KRW', amountKrw: 89000, currency: 'KRW', status: '결제완료', date: '2026.08.12', when: '08.12 09:18', isToday: false },
  { id: 'ord_88018', uid: 'u_preview_03', email: 'orion.belt@example.net', product: '기간제', method: 'PayPal', amount: '59.00 USD', amountKrw: 0, currency: 'USD', status: '결제완료', date: '2026.08.09', when: '08.09 16:40', isToday: false },
  { id: 'ord_87990', uid: 'u_preview_06', email: 'deneb.keys@example.com', product: '체험판 업그레이드', method: 'PortOne', amount: '29,000 KRW', amountKrw: 29000, currency: 'KRW', status: '대기', date: '2026.08.04', when: '08.04 11:22', isToday: false },
  { id: 'ord_87950', uid: 'u_preview_02', email: 'nova.lyrae@example.com', product: 'Lifetime', method: 'PortOne', amount: '129,000 KRW', amountKrw: 129000, currency: 'KRW', status: '결제실패', date: '2026.08.03', when: '08.03 19:11', isToday: false },
  { id: 'ord_87911', uid: 'u_preview_04', email: 'vega.prime@example.com', product: 'Lifetime', method: 'PayPal', amount: '59.00 USD', amountKrw: 0, currency: 'USD', status: '환불', date: '2026.07.22', when: '07.22 13:05', isToday: false, refund: '2026.07.24' }
];

const TICKETS = [
  { id: 't_1004', type: '결제', title: 'PayPal 중복 결제', user: 'orion.belt@example.net', uid: 'u_preview_03', status: 'open', when: '08.19 10:12', day: 'today' },
  { id: 't_1001', type: '결제', title: '라이선스 미지급 문의', user: 'praesepe@example.com', uid: 'u_preview_01', status: 'open', when: '08.18 21:40', day: '7d' },
  { id: 't_1002', type: '앱', title: 'HWID 초기화 요청', user: 'nova.lyrae@example.com', uid: 'u_preview_02', status: 'answered', when: '08.16 15:01', day: '7d' },
  { id: 't_1003', type: '기타', title: 'MIDI 내보내기 오류', user: 'deneb.keys@example.com', uid: 'u_preview_06', status: 'closed', when: '08.02 19:08', day: '30d' }
];

const CMS = {
  notices: [
    { id: 'n1', title: 'MidiAI Studio 1.4 출시', content: 'Windows 앱 1.4가 배포되었습니다.', author: 'MidiAI Studio', createdAt: '2026.08.12', updatedAt: '2026.08.18', visible: true, pinned: true },
    { id: 'n2', title: '결제 점검 안내', content: 'PayPal 점검이 완료되었습니다.', author: 'MidiAI Studio', createdAt: '2026.07.20', updatedAt: '2026.07.20', visible: true, pinned: false }
  ],
  patches: [
    { id: 'p1', title: '앱 안정성 개선', content: '- 변환 실패 시 재시도\n- HWID 바인딩 로그', author: 'MidiAI Studio', createdAt: '2026.08.18', updatedAt: '2026.08.18', visible: true, pinned: false, type: 'APP', version: '1.4.0' },
    { id: 'p2', title: '웹 콘솔 밀도 조정', content: '관리자 콘솔 테이블 밀도를 낮췄습니다.', author: 'MidiAI Studio', createdAt: '2026.08.10', updatedAt: '2026.08.10', visible: true, pinned: false, type: 'WEB', version: '' }
  ],
  faq: [
    { id: 'f1', question: '체험판은 몇 일인가요?', answer: '기본 체험판 기간은 라이선스 정책에 따릅니다.', author: 'MidiAI Studio', createdAt: '2026.06.02', updatedAt: '2026.08.01', visible: true, pinned: false, order: 1 },
    { id: 'f2', question: 'HWID 변경은 어떻게 하나요?', answer: '문의 또는 관리자 초기화로 처리합니다.', author: 'MidiAI Studio', createdAt: '2026.06.02', updatedAt: '2026.06.02', visible: true, pinned: false, order: 2 }
  ],
  board: [
    { id: 'b1', title: '변환 결과 공유합니다', content: 'YouTube 피아노 커버를 MIDI로 변환했습니다.', author: 'Nova Lyrae', createdAt: '2026.08.16', updatedAt: '2026.08.16', visible: true, pinned: true, views: 42, comments: 3 },
    { id: 'b2', title: '환불 문의 전에 확인할 점', content: '결제 내역 캡처를 첨부해 주세요.', author: 'Orion Belt', createdAt: '2026.08.04', updatedAt: '2026.08.05', visible: false, pinned: false, views: 11, comments: 1 }
  ]
};

const LOGS = [
  { uid: 'u_preview_01', cat: 'app', action: '앱 로그인', summary: 'Windows App', actor: 'user', when: '08.19 08:44', day: 'today' },
  { uid: 'u_preview_01', cat: 'credit', action: 'AI 변환', summary: 'YouTube → MIDI · -1', actor: 'user', when: '08.19 09:12', day: 'today' },
  { uid: 'u_preview_01', cat: 'credit', action: '관리자 크레딧 지급', summary: '보너스 · +5', actor: 'admin', when: '08.18 21:20', day: '7d' },
  { uid: 'u_preview_01', cat: 'credit', action: '크레딧 구매', summary: 'Credit 구매 +10', actor: 'user', when: '08.12 09:20', day: '30d' },
  { uid: 'u_preview_03', cat: 'credit', action: '관리자 크레딧 회수', summary: '회수 · -3', actor: 'admin', when: '08.09 16:50', day: '30d' },
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
let memberStatKey = 'all';
let memberQuickFilter = '';
let preferredDetailTab = 'overview';
let licensePage = 'status';
let licenseTab = 'all';
let licenseOpen = '';
let orderTab = 'all';
let cmsTab = 'notices';
let cmsStatusApplied = 'all';
let cmsDrawer = { mode: 'view', id: '' };

function memberByUid(uid) {
  return MEMBERS.find((u) => u.uid === uid) || null;
}
function memberByEmail(email) {
  return MEMBERS.find((u) => u.email === email) || null;
}
function idPairHtml(uid, hwid) {
  return `<span class="admin-id-pair"><span class="admin-id-item">UID <code class="mono">${uid || '-'}</code></span><span class="admin-id-item">HWID <code class="mono">${hwid || '(없음)'}</code></span></span>`;
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
  if (u?.licenseStatus === 'expired') return `<span class="crm-badge is-expired"><i></i>만료</span>`;
  return planBadge(u?.plan);
}
function licenseStatusBadge(u) {
  if (u?.licenseStatus === 'banned') return `<span class="crm-badge is-banned"><i></i>차단</span>`;
  if (u?.licenseStatus === 'expired') return `<span class="crm-badge is-expired"><i></i>만료</span>`;
  return `<span class="crm-badge is-lifetime"><i></i>활성</span>`;
}
function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const end = new Date(y, m - 1, d).getTime();
  const today = new Date(2026, 7, 19).getTime();
  return (end - today) / 86400000;
}
function isExpiring(u, days = 30) {
  return u.plan === 'period' && u.licenseStatus === 'active' && daysUntil(u.expiresAt) != null && daysUntil(u.expiresAt) >= 0 && daysUntil(u.expiresAt) <= days;
}
function orderGroup(status) {
  if (status === '결제완료') return 'paid';
  if (status === '결제실패') return 'failed';
  if (status === '환불' || status === '취소') return 'refund';
  if (status === '대기') return 'pending';
  return 'other';
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
function applyPreviewLicense(patch, { tab = 'license', notice, uid } = {}) {
  const target = uid || selectedUid;
  const u = memberByUid(target);
  if (!u) return;
  Object.assign(u, patch);
  u.changedAt = fmtDot(PREVIEW_TODAY);
  u.issuedBy = patch.issuedBy || '관리자';
  if (crmMode === 'license') {
    licenseOpen = target;
    renderCrmWork();
  } else {
    openDetail(target, { tab, forceOpen: true });
  }
  setSaveEnabled(false);
  previewNotice(notice || '미리보기 — 실제 라이선스 데이터는 변경되지 않습니다');
}
function previewAdjustLicenseCredits(btn, sign) {
  const wrap = btn.closest('.admin-license-expand-inner');
  const uid = btn.getAttribute(sign > 0 ? 'data-license-credit-grant' : 'data-license-credit-deduct') || wrap?.getAttribute('data-license-uid');
  const u = memberByUid(uid);
  if (!u) return;
  const amountEl = wrap?.querySelector('[data-lic-credit-amount]');
  const quick = Number(btn.getAttribute('data-amount') || 0);
  if (Number.isInteger(quick) && quick > 0 && amountEl) amountEl.value = String(quick);
  const amount = Number(amountEl?.value || 0);
  if (!Number.isInteger(amount) || amount <= 0) {
    previewNotice('지급/회수 수량을 입력하세요');
    return;
  }
  const next = Math.max(0, Number(u.credits || 0) + (sign > 0 ? amount : -amount));
  u.credits = next;
  licenseOpen = uid;
  renderCrmWork();
  previewNotice(`미리보기 — 크레딧 ${sign > 0 ? '지급' : '회수'} ${amount} (잔액 ${next}, 실제 데이터 변경 없음)`);
}
function openPreviewBulkCredits() {
  if (crmMode !== 'license') return;
  const uids = [...selected];
  if (!uids.length) {
    previewNotice('지급/회수 대상이 없습니다');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'edit-modal-backdrop';
  overlay.innerHTML = `<form class="edit-modal admin-bulk-compact admin-bulk-credit-modal" novalidate>
    <div class="edit-modal-head">
      <div class="edit-modal-head-copy"><h3>크레딧 일괄 지급/회수 · ${uids.length}명</h3></div>
      <button type="button" class="edit-modal-x" data-cancel aria-label="close">×</button>
    </div>
    <div class="edit-modal-body">
      <div class="edit-field edit-field-segment" data-field="mode">
        <span hidden>모드</span>
        <div class="edit-segment" role="radiogroup" aria-label="지급/회수">
          <label class="edit-segment-opt"><input type="radio" name="mode" value="grant" checked><span>지급</span></label>
          <label class="edit-segment-opt"><input type="radio" name="mode" value="deduct"><span>회수</span></label>
        </div>
      </div>
      <label class="edit-field" data-field="amount"><span>지급 크레딧</span><input type="number" name="amount" min="1" step="1" value="1" required></label>
      <div class="admin-bulk-credit-quick">
        <div class="admin-crm-points-quick" data-bulk-credit-quick="grant" role="group" aria-label="빠른 지급">
          <button type="button" class="secondary mini-btn" data-bulk-credit-amount="1">+1</button>
          <button type="button" class="secondary mini-btn" data-bulk-credit-amount="3">+3</button>
          <button type="button" class="secondary mini-btn" data-bulk-credit-amount="5">+5</button>
          <button type="button" class="secondary mini-btn" data-bulk-credit-amount="10">+10</button>
        </div>
        <div class="admin-crm-points-quick" data-bulk-credit-quick="deduct" hidden role="group" aria-label="빠른 회수">
          <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="1">-1</button>
          <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="3">-3</button>
          <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="5">-5</button>
          <button type="button" class="secondary mini-btn danger-btn" data-bulk-credit-amount="10">-10</button>
        </div>
      </div>
      <label class="edit-field" data-field="reason"><span>지급 사유</span><input type="text" name="reason" placeholder="이벤트/보상 사유 입력"></label>
    </div>
    <div class="edit-modal-actions">
      <button type="button" class="secondary" data-cancel>취소</button>
      <button type="submit" class="primary">지급</button>
    </div>
  </form>`;
  const form = overlay.querySelector('form');
  const amountInput = form.querySelector('[name="amount"]');
  const reasonInput = form.querySelector('[name="reason"]');
  const submit = form.querySelector('[type="submit"]');
  const amountLabel = form.querySelector('[data-field="amount"] > span');
  const reasonLabel = form.querySelector('[data-field="reason"] > span');
  const currentMode = () => String(form.querySelector('[name="mode"]:checked')?.value || 'grant');
  const syncMode = () => {
    const deduct = currentMode() === 'deduct';
    const verb = deduct ? '회수' : '지급';
    if (amountLabel) amountLabel.textContent = `${verb} 크레딧`;
    if (reasonLabel) reasonLabel.textContent = `${verb} 사유`;
    if (reasonInput) reasonInput.placeholder = deduct ? '회수 사유 입력' : '이벤트/보상 사유 입력';
    if (submit) {
      submit.textContent = verb;
      submit.classList.toggle('danger-btn', deduct);
    }
    form.querySelector('[data-bulk-credit-quick="grant"]')?.toggleAttribute('hidden', deduct);
    form.querySelector('[data-bulk-credit-quick="deduct"]')?.toggleAttribute('hidden', !deduct);
  };
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', close));
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bulk-credit-amount]');
    if (!btn) return;
    e.preventDefault();
    amountInput.value = String(btn.getAttribute('data-bulk-credit-amount') || '1');
  });
  form.addEventListener('change', (e) => { if (e.target?.name === 'mode') syncMode(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const deduct = currentMode() === 'deduct';
    const verb = deduct ? '회수' : '지급';
    const amount = Number(amountInput.value || 0);
    if (!Number.isInteger(amount) || amount <= 0) {
      previewNotice(`${verb} 크레딧은 1 이상의 정수여야 합니다`);
      return;
    }
    let ok = 0;
    uids.forEach((uid) => {
      const u = memberByUid(uid);
      if (!u) return;
      const next = Math.max(0, Number(u.credits || 0) + (deduct ? -amount : amount));
      u.credits = next;
      ok++;
    });
    close();
    renderCrmWork();
    previewNotice(`미리보기 — 크레딧 ${verb} ${amount} × ${ok}명 (실제 데이터 변경 없음)`);
  });
  document.body.appendChild(overlay);
  syncMode();
  setTimeout(() => amountInput?.focus(), 40);
}
function roleBadge(role) {
  return `<span class="crm-role is-${role}">${role === 'admin' ? '관리자' : '사용자'}</span>`;
}
function activityBadge(a) {
  const map = { online: '온라인', active: '활성', idle: '대기', offline: '오프라인' };
  return `<span class="crm-activity is-${a}"><i></i>${map[a] || a}</span>`;
}
function payStatusBadge(status) {
  const on = status === '결제완료' ? 'is-lifetime' : status === '환불' ? 'is-expired' : status === '결제실패' ? 'is-banned' : 'is-period';
  return `<span class="crm-badge ${on}"><i></i>${status}</span>`;
}
function ticketStatusBadge(status) {
  const map = { open: ['is-trial', '미답변'], answered: ['is-active', '답변완료'], closed: ['is-none', '종료'] };
  const [cls, label] = map[status] || ['is-none', status];
  return `<span class="crm-badge ${cls}"><i></i>${label}</span>`;
}
function dashEmpty(text) {
  return `<p class="admin-dash-empty">${text}</p>`;
}

function showView(view, opts = {}) {
  if (view === 'payments') {
    view = 'crm';
    opts = { ...opts, crmMode: opts.crmMode || 'orders', closeDetail: opts.closeDetail !== false };
  }
  const next = VIEWS[view] ? view : 'crm';
  if (next === 'crm') {
    if (opts.crmMode) crmMode = opts.crmMode;
    else if (opts.detailTab === 'license') crmMode = 'license';
    else if (!opts.keepCrmMode) crmMode = 'members';
    if (crmMode === 'license') licensePage = opts.licensePage || 'status';
    else licensePage = 'status';
    if (opts.detailTab) preferredDetailTab = opts.detailTab;
    else if (crmMode === 'license') preferredDetailTab = 'license';
    else if (crmMode === 'orders') preferredDetailTab = 'payments';
    else preferredDetailTab = 'overview';
    if ($('adminConsoleTitle')) $('adminConsoleTitle').textContent = CRM_TITLES[crmMode] || TITLES.crm;
    if ($('adminConsoleLead')) $('adminConsoleLead').textContent = CRM_LEADS[crmMode] || CRM_LEADS.members;
  } else if ($('adminConsoleTitle')) {
    $('adminConsoleTitle').textContent = TITLES[next];
    if ($('adminConsoleLead')) $('adminConsoleLead').textContent = VIEW_LEADS[next] || '';
  }
  const licenseHistory = next === 'crm' && crmMode === 'license' && licensePage === 'history';
  Object.entries(VIEWS).forEach(([key, id]) => {
    const el = $(id);
    if (!el) return;
    if (licenseHistory) el.hidden = key !== 'logs';
    else el.hidden = key !== next;
  });
  document.body.dataset.adminView = next;
  document.body.dataset.crmMode = crmMode;
  renderPageWorkTabs();
  if (licenseHistory) {
    if ($('adminConsoleLead')) $('adminConsoleLead').textContent = '기존 라이선스 로그에서 변경·지급 기록을 확인합니다.';
    logTab = 'license';
    renderLogs();
  }
  closePreviewOrderDrawer();
  if (next === 'crm' && opts.closeDetail) closeDetail();
  if (next === 'tickets') {
    if (opts.ticketStatus && $('adminTicketStatus')) $('adminTicketStatus').value = opts.ticketStatus;
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
      if (btn.getAttribute('data-admin-nav') !== (licenseHistory ? 'crm' : next)) return false;
      if (next === 'crm' || licenseHistory) {
        const mode = btn.getAttribute('data-crm-mode') || 'members';
        return mode === crmMode;
      }
      return true;
    });
  }
  sidebarBtns.forEach((btn) => btn.classList.toggle('is-active', btn === target));
  const hash = new URLSearchParams();
  hash.set('view', licenseHistory ? 'crm' : next);
  if (opts.logsTab) hash.set('log', opts.logsTab);
  if (licenseHistory) hash.set('log', 'license');
  if (opts.uid) hash.set('uid', opts.uid);
  if (opts.ticketStatus && opts.ticketStatus !== 'all') hash.set('ticket', opts.ticketStatus);
  if ((next === 'crm' || licenseHistory) && crmMode && crmMode !== 'members') hash.set('crm', crmMode);
  if (licenseHistory) hash.set('lic', 'history');
  if (next === 'content' && cmsTab && cmsTab !== 'notices') hash.set('cms', cmsTab);
  if (next === 'content' && opts.cmsId) hash.set('post', opts.cmsId);
  history.replaceState(null, '', `#${hash}`);
  if (next === 'crm' && !licenseHistory) renderCrmWork();
  if (next === 'content') {
    if (opts.cmsTab) cmsTab = opts.cmsTab;
    renderCms();
    if (opts.cmsId) openCmsDrawer(opts.cmsId, 'view');
    else closeCmsDrawer();
  } else closeCmsDrawer();
}

function renderPageWorkTabs() {
  const slot = $('adminWorkTabsSlot');
  if (!slot) return;
  if (crmMode === 'license' && (document.body.dataset.adminView === 'crm' || licensePage === 'history')) {
    slot.hidden = false;
    slot.innerHTML = `<div class="admin-page-tabs admin-page-tabs-inline" role="tablist">
      <button type="button" class="admin-page-tab${licensePage !== 'history' ? ' is-active' : ''}" data-license-page="status">현황</button>
      <button type="button" class="admin-page-tab${licensePage === 'history' ? ' is-active' : ''}" data-license-page="history">변경/지급 기록</button>
    </div>`;
    return;
  }
  slot.hidden = true;
  slot.innerHTML = '';
}

function memberMatchesLicenseTab(u) {
  if (licenseTab === 'all') return true;
  if (licenseTab === 'trial') return u.plan === 'trial' && u.licenseStatus === 'active';
  if (licenseTab === 'lifetime') return u.plan === 'lifetime' && u.licenseStatus === 'active';
  if (licenseTab === 'period') return u.plan === 'period' && u.licenseStatus === 'active';
  if (licenseTab === 'expiring') return isExpiring(u, 30);
  if (licenseTab === 'ended') return u.licenseStatus === 'expired' || u.licenseStatus === 'banned';
  return true;
}

function crmStatsHtml() {
  const card = (key, n, label, selected) => `<button type="button" class="crm-stat${selected === key ? ' is-selected' : ''}" data-crm-stat="${key}"><b>${n}</b><span>${label}</span></button>`;
  const nowActive = MEMBERS.filter((u) => u.activity === 'online' || u.activity === 'active').length;
  const selected = ['idle7', 'idle30', 'filtered'].includes(memberStatKey) ? '' : (memberStatKey || 'all');
  return [
    card('all', MEMBERS.length, '전체 회원', selected),
    card('active', nowActive, '활성', selected),
    card('lifetime', MEMBERS.filter((u) => u.plan === 'lifetime').length, '평생', selected),
    card('period', MEMBERS.filter((u) => u.plan === 'period').length, '기간제', selected),
    card('trial', MEMBERS.filter((u) => u.plan === 'trial').length, '체험판', selected),
    card('today', MEMBERS.filter((u) => u.joined === '2026.08.19').length, '오늘 가입', selected)
  ].join('');
}

function previewIdleDays(u) {
  const s = String(u.seen || '');
  if (!s.includes('일 전')) return 0;
  return parseInt(s, 10) || 0;
}
function previewSeenRank(u) {
  const s = String(u.seen || '');
  if (s === '방금') return 0;
  const n = parseInt(s, 10) || 0;
  if (s.includes('분')) return n;
  if (s.includes('시간')) return n * 60;
  if (s.includes('일')) return n * 1440;
  return 99999;
}
function previewFilterCount() {
  let n = 0;
  if (($('adminUserLicenseStatus')?.value || 'all') !== 'all') n++;
  if (($('adminCrmFilterOrders')?.value || 'all') !== 'all') n++;
  if (($('adminCrmFilterTickets')?.value || 'all') !== 'all') n++;
  if (memberQuickFilter === 'idle7' || memberQuickFilter === 'idle30') n++;
  return n;
}
function updatePreviewFilterButton() {
  const btn = $('adminCrmFilterBtn');
  if (!btn) return;
  const n = previewFilterCount();
  btn.textContent = n ? `필터 ${n}` : '필터';
  btn.classList.toggle('is-active', n > 0);
}

function licenseStatsHtml() {
  const card = (key, n, label) => `<button type="button" class="crm-stat${licenseTab === key ? ' is-selected' : ''}" data-license-stat="${key}"><b>${n}</b><span>${label}</span></button>`;
  return [
    card('all', MEMBERS.length, '전체 라이선스'),
    card('trial', MEMBERS.filter((u) => u.plan === 'trial' && u.licenseStatus === 'active').length, '체험판'),
    card('lifetime', MEMBERS.filter((u) => u.plan === 'lifetime' && u.licenseStatus === 'active').length, '평생'),
    card('period', MEMBERS.filter((u) => u.plan === 'period' && u.licenseStatus === 'active').length, '기간제'),
    card('expiring7', MEMBERS.filter((u) => isExpiring(u, 7)).length, '7일 내 만료'),
    card('expiring', MEMBERS.filter((u) => isExpiring(u, 30)).length, '30일 내 만료')
  ].join('');
}

function orderStatsHtml() {
  const card = (key, n, label) => `<button type="button" class="crm-stat${orderTab === key ? ' is-selected' : ''}" data-order-stat="${key}"><b>${n}</b><span>${label}</span></button>`;
  const paid = ORDERS.filter((o) => orderGroup(o.status) === 'paid');
  const krw = paid.filter((o) => o.currency === 'KRW').reduce((s, o) => s + (o.amountKrw || 0), 0);
  const usd = paid.filter((o) => o.currency === 'USD').reduce((s, o) => s + Number(String(o.amount).replace(/[^\d.]/g, '') || 0), 0);
  const amount = [krw ? `${krw.toLocaleString('ko-KR')} KRW` : '', usd ? `${usd.toFixed(2)} USD` : ''].filter(Boolean).join(' · ');
  return [
    card('all', ORDERS.length, '전체 주문'),
    card('paid', paid.length, '결제 완료'),
    card('failed', ORDERS.filter((o) => orderGroup(o.status) === 'failed').length, '결제 실패'),
    card('refund', ORDERS.filter((o) => orderGroup(o.status) === 'refund').length, '취소/환불'),
    card('paid', ORDERS.filter((o) => o.isToday && orderGroup(o.status) === 'paid').length, '오늘 결제'),
    amount ? `<div class="crm-stat is-amount"><b>${amount}</b><span>결제 금액</span></div>` : ''
  ].join('');
}

function syncPreviewWorkChrome() {
  const search = $('adminUserSearch');
  if (search) {
    search.placeholder = crmMode === 'orders'
      ? '주문번호, 거래번호, 사용자, 이메일'
      : crmMode === 'license'
        ? '사용자명, 이메일, UID'
        : '이메일, 이름, UID, HWID 검색';
  }
  const wrap = $('adminCrmFilterWrap');
  if (wrap) wrap.hidden = crmMode !== 'members';
  const actions = $('adminCrmToolbarActions');
  if (actions) actions.hidden = crmMode !== 'members';
  const sortSel = $('adminUserSort');
  if (sortSel) sortSel.hidden = crmMode !== 'members';
  const selectWrap = $('adminCrmSelectAllWrap');
  if (selectWrap) selectWrap.hidden = crmMode !== 'members';
  const bulk = $('adminCrmBulkbar');
  if (bulk) {
    if (crmMode !== 'members' && crmMode !== 'license') bulk.hidden = true;
    else bulk.hidden = selected.size === 0;
  }
  const stats = $('adminCrmStats');
  const tabs = $('adminCrmWorkTabs');
  if (crmMode === 'license') {
    stats && (stats.innerHTML = licenseStatsHtml());
    stats?.classList.remove('is-cols-5');
    stats?.classList.add('is-cols-6');
    if (tabs) {
      tabs.hidden = false;
      const counts = {
        all: MEMBERS.length,
        trial: MEMBERS.filter((u) => u.plan === 'trial' && u.licenseStatus === 'active').length,
        lifetime: MEMBERS.filter((u) => u.plan === 'lifetime' && u.licenseStatus === 'active').length,
        period: MEMBERS.filter((u) => u.plan === 'period' && u.licenseStatus === 'active').length,
        expiring: MEMBERS.filter((u) => isExpiring(u, 30)).length,
        ended: MEMBERS.filter((u) => u.licenseStatus === 'expired' || u.licenseStatus === 'banned').length
      };
      tabs.innerHTML = [
        ['all', '전체'], ['trial', '체험판'], ['lifetime', '평생'], ['period', '기간제'], ['expiring', '만료 예정'], ['ended', '만료/해제']
      ].map(([id, label]) => `<button type="button" class="admin-page-tab${licenseTab === id ? ' is-active' : ''}" data-license-tab="${id}">${label} <em>${counts[id]}</em></button>`).join('');
    }
  } else if (crmMode === 'orders') {
    stats && (stats.innerHTML = orderStatsHtml());
    stats?.classList.remove('is-cols-5');
    stats?.classList.add('is-cols-6');
    if (tabs) {
      tabs.hidden = false;
      const counts = { all: ORDERS.length, paid: 0, failed: 0, refund: 0, pending: 0 };
      ORDERS.forEach((o) => { counts[orderGroup(o.status)] = (counts[orderGroup(o.status)] || 0) + 1; });
      tabs.innerHTML = [
        ['all', '전체'], ['paid', '결제 완료'], ['failed', '결제 실패'], ['refund', '취소/환불'], ['pending', '대기']
      ].map(([id, label]) => `<button type="button" class="admin-page-tab${orderTab === id ? ' is-active' : ''}" data-order-tab="${id}">${label} <em>${counts[id] || 0}</em></button>`).join('');
    }
  } else {
    stats && (stats.innerHTML = crmStatsHtml());
    stats?.classList.remove('is-cols-5');
    stats?.classList.add('is-cols-6');
    updatePreviewFilterButton();
    if (tabs) { tabs.hidden = true; tabs.innerHTML = ''; }
  }
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
  renderCrmWork();
}
function renderCrmWork() {
  parkPreviewCrmDetail();
  if (crmMode !== 'members') {
    $('adminCrm')?.classList.remove('is-row-expand', 'is-detail-open');
  }
  syncPreviewWorkChrome();
  const q = ($('adminUserSearch')?.value || '').trim().toLowerCase();
  const box = $('adminUserList');
  if (!box) return;
  const hint = $('adminCrmFilterHint');
  const pager = $('adminCrmPager');
  const emptyMsg = (text) => {
    box.innerHTML = `<div class="empty-card">${text}</div>`;
    if (pager) { pager.hidden = true; pager.innerHTML = ''; }
  };
  if (crmMode === 'orders') {
    const rows = ORDERS.filter((o) => {
      if (orderTab !== 'all' && orderGroup(o.status) !== orderTab) return false;
      const u = memberByUid(o.uid);
      const hay = [o.id, o.uid, o.email, u?.name, o.product, o.status].join(' ').toLowerCase();
      return !q || hay.includes(q);
    });
    const groups = [];
    const map = new Map();
    rows.forEach((o) => {
      const key = o.uid || o.email || o.id;
      if (!map.has(key)) {
        const g = { key, uid: o.uid, items: [] };
        map.set(key, g);
        groups.push(g);
      }
      map.get(key).items.push(o);
    });
    $('adminUserCount') && ($('adminUserCount').textContent = `${groups.length}명 · ${rows.length}건`);
    if (hint) hint.textContent = rows.length === ORDERS.length ? '' : `필터 ${rows.length}건`;
    if (!rows.length) {
      emptyMsg(({
        all: '주문이 없습니다.',
        paid: '결제 완료 주문이 없습니다.',
        failed: '결제 실패 주문이 없습니다.',
        refund: '취소/환불 주문이 없습니다.',
        pending: '대기 중인 주문이 없습니다.'
      })[orderTab] || '해당하는 주문이 없습니다.');
      return;
    }
    if (!window.__midiaiPreviewOrderOpen) window.__midiaiPreviewOrderOpen = new Set();
    const openSet = window.__midiaiPreviewOrderOpen;
    box.innerHTML = `<div class="admin-table-wrap admin-console-table-wrap"><table class="admin-table admin-order-table"><thead><tr>
      <th>사용자</th><th>주문</th><th>최근 상품</th><th>최근 결제</th><th>최근 상태</th><th>최근 결제일</th>
    </tr></thead><tbody>${groups.map((g) => {
      const latest = g.items[0];
      const u = memberByUid(g.uid);
      const name = u?.name || latest.email || g.uid;
      const open = openSet.has(g.key);
      const methods = [...new Set(g.items.map((o) => o.method))];
      const methodLabel = methods.length > 1 ? `${methods[0]} 외 ${methods.length - 1}` : (methods[0] || '-');
      return `<tr class="admin-order-group${open ? ' is-open' : ''}" data-order-group="${g.key}">
        <td class="admin-order-buyer"><span class="admin-order-caret">▸</span><span><b>${name}</b>${u?.email ? `<small>${u.email}</small>` : ''}</span></td>
        <td>${g.items.length}건</td>
        <td>${latest.product}</td>
        <td>${methodLabel}</td>
        <td>${payStatusBadge(latest.status)}</td>
        <td>${latest.date}</td>
      </tr>
      <tr class="admin-order-expand"${open ? '' : ' hidden'}>
        <td colspan="6"><table class="admin-table admin-order-nested"><thead><tr>
          <th>주문번호</th><th>상품</th><th>결제수단</th><th>결제금액</th><th>결제상태</th><th>결제일</th><th>취소/환불</th><th>관리</th>
        </tr></thead><tbody>${g.items.map((o) => `<tr>
          <td class="mono">${o.id}</td><td>${o.product}</td><td>${o.method}</td><td>${o.amount}</td>
          <td>${payStatusBadge(o.status)}</td><td>${o.date}</td><td>${o.refund || (o.status === '환불' ? o.status : '-')}</td>
          <td><button type="button" class="secondary mini-btn danger-btn" data-order-delete="${o.id}">삭제</button></td>
        </tr>`).join('')}</tbody></table></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
    if (pager) {
      pager.hidden = false;
      pager.innerHTML = `<button type="button" class="ghost mini-btn" disabled>이전</button><span class="admin-crm-pager-info">1 / 1</span><button type="button" class="ghost mini-btn" disabled>다음</button><span class="admin-crm-pager-info muted">1–${groups.length} · ${groups.length}명</span>`;
    }
    return;
  }
  if (crmMode === 'license') {
    const rows = MEMBERS.filter((u) => {
      if (!memberMatchesLicenseTab(u)) return false;
      const hay = [u.name, u.email, u.uid, u.hwid].join(' ').toLowerCase();
      return !q || hay.includes(q);
    });
    $('adminUserCount') && ($('adminUserCount').textContent = `${rows.length} / ${MEMBERS.length}`);
    if (hint) hint.textContent = rows.length === MEMBERS.length ? '' : `필터 ${rows.length}명`;
    if (!rows.length) {
      emptyMsg(({
        all: '라이선스가 없습니다.',
        trial: '체험판 라이선스가 없습니다.',
        lifetime: '평생 라이선스가 없습니다.',
        period: '기간제 라이선스가 없습니다.',
        expiring: '만료 예정 라이선스가 없습니다.',
        ended: '만료/해제된 라이선스가 없습니다.'
      })[licenseTab] || '해당하는 라이선스가 없습니다.');
      return;
    }
    box.innerHTML = `<div class="admin-table-wrap admin-console-table-wrap"><table class="admin-table admin-license-table"><thead><tr>
      <th>사용자</th><th>이메일</th><th>라이선스</th><th>상태</th><th>시작일</th><th>만료일</th><th>최근 변경</th><th>지급/변경 주체</th><th>관리</th>
    </tr></thead><tbody>${rows.map((u) => {
      const open = licenseOpen === u.uid;
      return `
      <tr class="admin-license-row${open ? ' is-open' : ''}" data-license-row="${u.uid}">
        <td class="admin-member-user"><span class="admin-order-caret" aria-hidden="true">▸</span><span class="admin-crm-card-avatar is-fallback">${u.name.slice(0, 1)}</span><span><b>${u.name}</b></span></td>
        <td class="admin-member-email" title="${u.email}">${u.email}</td>
        <td>${planBadge(u.plan)}</td>
        <td>${licenseStatusBadge(u)}</td>
        <td>${u.startsAt ? fmtDot(u.startsAt) : '-'}</td>
        <td>${u.plan === 'lifetime' ? '없음' : (u.expiresAt ? fmtDot(u.expiresAt) : '-')}</td>
        <td>${u.changedAt || '-'}</td>
        <td>${u.issuedBy || '-'}</td>
        <td><button type="button" class="ghost mini-btn">${open ? '접기' : '관리'}</button></td>
      </tr>
      <tr class="admin-license-expand"${open ? '' : ' hidden'}>
        <td colspan="9">
          <div class="admin-license-expand-inner" data-license-uid="${u.uid}">
            <div class="admin-license-expand-col">
            <div class="admin-license-expand-meta">
              <span class="admin-license-expand-flags">
                <span>상태 ${licenseStatusBadge(u)}</span>
                <span>현재 ${planBadge(u.plan)}</span>
              </span>
              ${idPairHtml(u.uid, u.hwid)}
            </div>
            <div class="admin-crm-license-form admin-license-inline-form">
              <div class="form-split">
                <label>라이선스
                  <select data-lic-plan>
                    <option value="trial"${u.plan==='trial'?' selected':''}>체험판</option>
                    <option value="lifetime"${u.plan==='lifetime'?' selected':''}>평생</option>
                    <option value="period"${u.plan==='period'?' selected':''}>기간제</option>
                  </select>
                </label>
                <label>시작일
                  <input type="date" data-lic-starts value="${u.startsAt || ''}">
                </label>
                <label>만료일
                  <input type="date" data-lic-expires value="${u.expiresAt || ''}">
                </label>
              </div>
              <label>메모
                <textarea data-lic-memo rows="2" placeholder="라이선스 메모">${u.licenseMemo || ''}</textarea>
              </label>
              <div class="admin-license-expand-toolbar">
                <div class="admin-license-expand-actions">
                  <button type="button" class="primary mini-btn" data-license-save="${u.uid}">저장</button>
                  <button type="button" class="ghost mini-btn" data-license-member="${u.uid}">회원 상세</button>
                  <button type="button" class="ghost mini-btn" data-license-logs="${u.uid}">로그</button>
                </div>
              </div>
            </div>
            </div>
            <aside class="admin-license-expand-col admin-license-credit-panel" aria-label="크레딧 추가/회수">
              <div class="admin-license-credit-head">
                <h3>크레딧 추가/회수</h3>
                <span class="admin-license-credit-balance muted small">잔액 ${u.credits ?? 0} Credits</span>
              </div>
              <div class="admin-crm-points-quick">
                <button type="button" class="secondary mini-btn" data-license-credit-grant="${u.uid}" data-amount="1">+1</button>
                <button type="button" class="secondary mini-btn" data-license-credit-grant="${u.uid}" data-amount="3">+3</button>
                <button type="button" class="secondary mini-btn" data-license-credit-grant="${u.uid}" data-amount="5">+5</button>
                <button type="button" class="secondary mini-btn" data-license-credit-grant="${u.uid}" data-amount="10">+10</button>
              </div>
              <div class="admin-crm-points-quick">
                <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${u.uid}" data-amount="1">-1</button>
                <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${u.uid}" data-amount="3">-3</button>
                <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${u.uid}" data-amount="5">-5</button>
                <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${u.uid}" data-amount="10">-10</button>
              </div>
              <div class="admin-crm-points-form">
                <input type="number" data-lic-credit-amount min="1" step="1" value="5" aria-label="크레딧 수량">
                <input type="text" data-lic-credit-reason placeholder="사유 (선택)" aria-label="사유">
                <button type="button" class="secondary mini-btn" data-license-credit-grant="${u.uid}">지급</button>
                <button type="button" class="secondary mini-btn danger-btn" data-license-credit-deduct="${u.uid}">회수</button>
              </div>
            </aside>
          </div>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
    if (pager) {
      pager.hidden = false;
      pager.innerHTML = `<button type="button" class="ghost mini-btn" disabled>이전</button><span class="admin-crm-pager-info">1 / 1</span><button type="button" class="ghost mini-btn" disabled>다음</button><span class="admin-crm-pager-info muted">1–${rows.length} · ${rows.length}명</span>`;
    }
    return;
  }
  const plan = $('adminUserLicenseStatus')?.value || 'all';
  const ord = $('adminCrmFilterOrders')?.value || 'all';
  const tkt = $('adminCrmFilterTickets')?.value || 'all';
  const sort = $('adminUserSort')?.value || 'lastLogin';
  const rows = MEMBERS.filter((u) => {
    if (plan === 'favorites' && !u.fav) return false;
    if (plan !== 'all' && plan !== 'favorites' && u.plan !== plan) return false;
    if (ord === 'has' && !u.orders) return false;
    if (ord === 'none' && u.orders) return false;
    if (tkt === 'has' && !u.tickets) return false;
    if (tkt === 'none' && u.tickets) return false;
    if (memberQuickFilter === 'active' && !(u.activity === 'online' || u.activity === 'active')) return false;
    if (memberQuickFilter === 'today' && u.joined !== '2026.08.19') return false;
    if (memberQuickFilter === 'idle7' && previewIdleDays(u) < 7) return false;
    if (memberQuickFilter === 'idle30' && previewIdleDays(u) < 30) return false;
    const hay = [u.name, u.email, u.uid, u.hwid].join(' ').toLowerCase();
    return !q || hay.includes(q);
  }).slice().sort((a, b) => {
    if (a.fav !== b.fav) return a.fav ? -1 : 1;
    if (sort === 'name') return String(a.name).localeCompare(String(b.name), 'ko');
    if (sort === 'createdAt') return String(b.joined).localeCompare(String(a.joined));
    if (sort === 'createdAtAsc') return String(a.joined).localeCompare(String(b.joined));
    if (sort === 'lastLoginAsc') return previewSeenRank(a) - previewSeenRank(b);
    if (sort === 'lastPayment') return (b.orders || 0) - (a.orders || 0);
    return previewSeenRank(a) - previewSeenRank(b);
  });
  const filtered = !!(q || previewFilterCount() || memberQuickFilter === 'active' || memberQuickFilter === 'today');
  $('adminUserCount') && ($('adminUserCount').textContent = filtered ? `검색 결과 ${rows.length}명` : `${rows.length}명`);
  if (hint) hint.textContent = '';
  updatePreviewFilterButton();
  if (!rows.length) {
    emptyMsg('해당하는 회원이 없습니다.');
    return;
  }
  box.innerHTML = `<div class="admin-table-wrap admin-console-table-wrap"><table class="admin-table admin-member-table"><thead><tr>
    <th class="admin-col-check"></th><th>사용자</th><th>이메일</th><th>가입일</th><th>권한</th><th>라이선스</th><th>상태</th><th>국가</th><th>최근 접속</th><th>주문</th><th>문의</th>
  </tr></thead><tbody>${rows.map((u) => {
    const open = selectedUid === u.uid;
    return `
    <tr class="admin-crm-member-row${open ? ' is-selected is-open' : ''}" data-admin-uid="${u.uid}">
      <td><label class="admin-crm-check" onclick="event.stopPropagation()"><input type="checkbox" data-crm-check="${u.uid}" ${selected.has(u.uid) ? 'checked' : ''}></label></td>
      <td class="admin-member-user"><span class="admin-order-caret" aria-hidden="true">▸</span><span class="admin-crm-card-avatar is-fallback">${u.name.slice(0, 1)}</span><span><b>${u.fav ? '<span class="crm-fav-mark">★</span>' : ''}${u.name}</b></span></td>
      <td class="admin-member-email" title="${u.email}">${u.email}</td>
      <td class="admin-member-joined">${u.joined || '-'}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${licenseBadge(u)}</td>
      <td>${activityBadge(u.activity)}</td>
      <td class="admin-member-country">${u.country || '-'}</td>
      <td>${u.seen}</td>
      <td>${u.orders}</td>
      <td>${u.tickets}</td>
    </tr>${open ? `
    <tr class="admin-member-expand">
      <td colspan="11"><div class="admin-member-expand-inner" id="adminCrmMemberExpandHost"></div></td>
    </tr>` : ''}`;
  }).join('')}</tbody></table></div>`;
  if (pager) {
    pager.hidden = false;
    pager.innerHTML = `<button type="button" class="ghost mini-btn" disabled>이전</button><span class="admin-crm-pager-info">1 / 1</span><button type="button" class="ghost mini-btn" disabled>다음</button><span class="admin-crm-pager-info muted">1–${rows.length} · ${rows.length}명</span>`;
  }
  mountPreviewCrmDetailInRow();
}

function parkPreviewCrmDetail() {
  const pane = $('adminCrmDetail');
  if (!pane) return;
  const empty = $('adminCrmEmpty');
  const body = $('adminCrmDetailBody');
  const save = $('adminCrmFloatSave');
  if (empty && empty.parentElement !== pane) pane.insertBefore(empty, pane.firstChild);
  if (body && body.parentElement !== pane) {
    const before = save && save.parentElement === pane ? save : null;
    pane.insertBefore(body, before);
  }
  if (save && save.parentElement !== pane) pane.appendChild(save);
}
function mountPreviewCrmDetailInRow() {
  const crm = $('adminCrm');
  const host = $('adminCrmMemberExpandHost');
  const body = $('adminCrmDetailBody');
  const save = $('adminCrmFloatSave');
  if (!host || !body || crmMode !== 'members' || !selectedUid) {
    crm?.classList.remove('is-row-expand');
    return;
  }
  crm?.classList.add('is-row-expand');
  host.appendChild(body);
  if (save) host.appendChild(save);
}
function openDetail(uid, opts = {}) {
  const u = memberByUid(uid);
  if (!u) return;
  if (crmMode === 'members' && !opts.forceOpen && selectedUid === uid && $('adminCrm')?.classList.contains('is-row-expand')) {
    closeDetail();
    return;
  }
  selectedUid = uid;
  const body = $('adminCrmDetailBody');
  $('adminCrm')?.classList.add('is-detail-open');
  $('adminCrm')?.classList.toggle('is-row-expand', crmMode === 'members');
  $('adminCrmEmpty')?.classList.add('is-hidden');
  body?.classList.remove('is-hidden');
  body?.classList.add('is-fading');
  $('adminCrmName') && ($('adminCrmName').textContent = u.name);
  $('adminCrmEmail') && ($('adminCrmEmail').textContent = u.email);
  $('adminCrmUid') && ($('adminCrmUid').innerHTML = idPairHtml(u.uid, u.hwid));
  $('adminCrmRoleBadge') && ($('adminCrmRoleBadge').innerHTML = roleBadge(u.role));
  $('adminCrmHeaderLicense') && ($('adminCrmHeaderLicense').innerHTML = licenseBadge(u));
  $('adminCrmLicenseBadge') && ($('adminCrmLicenseBadge').innerHTML = licenseBadge(u));
  $('adminCrmHeaderMeta') && ($('adminCrmHeaderMeta').innerHTML = `<span><em>가입</em> ${u.joined}</span><span><em>최근 로그인</em> ${u.seen}</span><span><em>국가</em> ${u.country || '정보 없음'}</span><span>${activityBadge(u.activity)}</span>`);
  $('adminCrmFavBtn') && ($('adminCrmFavBtn').textContent = u.fav ? '★' : '☆');
  $('adminUserRole') && ($('adminUserRole').value = u.role);
  $('adminLicenseUid') && ($('adminLicenseUid').value = u.uid);
  $('adminLicensePlan') && ($('adminLicensePlan').value = u.plan);
  $('adminLicenseStartsAt') && ($('adminLicenseStartsAt').value = u.plan === 'period' ? (u.startsAt || '') : '');
  $('adminLicenseExpiresAt') && ($('adminLicenseExpiresAt').value = u.plan === 'period' ? (u.expiresAt || '') : '');
  $('adminLicenseMemo') && ($('adminLicenseMemo').value = u.licenseMemo || '');
  $('adminCrmLicenseMeta') && ($('adminCrmLicenseMeta').innerHTML = `<span class="crm-chip"><em>유형</em>${u.plan}</span><span class="crm-chip"><em>상태</em>${u.licenseStatus === 'banned' ? '정지' : '활성'}</span><span class="crm-chip"><em>시작</em>${u.startsAt ? fmtDot(u.startsAt) : u.joined}</span><span class="crm-chip"><em>만료</em>${u.plan === 'lifetime' ? '없음' : (u.expiresAt ? fmtDot(u.expiresAt) : '-')}</span><span class="crm-chip"><em>변경</em>${u.changedAt || '-'}</span><span class="crm-chip"><em>발급</em>${u.issuedBy || '-'}</span>`);
  const orders = ORDERS.filter((o) => o.uid === uid);
  const tickets = TICKETS.filter((t) => t.uid === uid);
  const paid = orders.filter((o) => o.status === '결제완료');
  const ticketList = tickets.slice(0, 3).map((t) => `<li><b>${t.title}</b><span>${t.status} · ${t.when}</span></li>`).join('');
  const dashBtn = (label, tab) => `<button type="button" class="ghost mini-btn" data-crm-action="goto-tab" data-crm-tab="${tab}">${label}</button>`;
  $('adminCrmSummary') && ($('adminCrmSummary').innerHTML = `<div class="admin-crm-dash-grid">
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>라이선스</h3><div class="admin-crm-dash-actions">${dashBtn('관리','license')}</div></header>
      <dl class="admin-crm-dash-dl">
        <div class="admin-crm-dash-row"><dt>유형</dt><dd>${planBadge(u.plan)}</dd></div>
        <div class="admin-crm-dash-row"><dt>상태</dt><dd>${licenseStatusBadge(u)}</dd></div>
        <div class="admin-crm-dash-row"><dt>시작</dt><dd>${u.startsAt ? fmtDot(u.startsAt) : '-'}</dd></div>
        <div class="admin-crm-dash-row"><dt>만료</dt><dd>${u.plan === 'lifetime' ? '없음' : (u.expiresAt ? fmtDot(u.expiresAt) : '-')}</dd></div>
        <div class="admin-crm-dash-row"><dt>지급</dt><dd>${u.issuedBy || '-'}</dd></div>
      </dl>
    </section>
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>접속/기기</h3><div class="admin-crm-dash-actions">${dashBtn('보기','access')}${dashBtn('관리','device')}</div></header>
      <dl class="admin-crm-dash-dl">
        <div class="admin-crm-dash-row"><dt>상태</dt><dd>${activityBadge(u.activity)}</dd></div>
        <div class="admin-crm-dash-row"><dt>최근 접속</dt><dd>${u.seen}</dd></div>
        <div class="admin-crm-dash-row"><dt>국가</dt><dd>${u.country || '<span class="admin-crm-dash-empty">정보 없음</span>'}</dd></div>
        <div class="admin-crm-dash-row"><dt>UID</dt><dd><code class="mono">${u.uid}</code></dd></div>
        <div class="admin-crm-dash-row"><dt>HWID</dt><dd>${u.hwid ? `<code class="mono">${u.hwid}</code>` : '<span class="admin-crm-dash-empty">없음</span>'}</dd></div>
      </dl>
    </section>
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>이용 현황</h3><div class="admin-crm-dash-actions">${dashBtn('보기','payments')}<button type="button" class="ghost mini-btn" data-crm-action="focus-usage">상세</button></div></header>
      <dl class="admin-crm-dash-dl">
        <div class="admin-crm-dash-row"><dt>주문</dt><dd>${orders.length ? `${orders.length}건` : '<span class="admin-crm-dash-empty">주문 내역 없음</span>'}</dd></div>
        <div class="admin-crm-dash-row"><dt>결제</dt><dd>${paid.length ? `${paid[0].date} · ${paid[0].amount}` : '<span class="admin-crm-dash-empty">결제 내역 없음</span>'}</dd></div>
        <div class="admin-crm-dash-row"><dt>FULL 사용</dt><dd>12회 · 최근 2026.08.19</dd></div>
      </dl>
    </section>
    <section class="admin-crm-dash-sec">
      <header class="admin-crm-dash-head"><h3>고객 지원</h3><div class="admin-crm-dash-actions">${dashBtn('보기','tickets')}${dashBtn('작성글','posts')}</div></header>
      <dl class="admin-crm-dash-dl">
        <div class="admin-crm-dash-row"><dt>문의</dt><dd>${tickets.length ? `${tickets.length}건` : '<span class="admin-crm-dash-empty">문의 없음</span>'}</dd></div>
        <div class="admin-crm-dash-row"><dt>작성글</dt><dd>2건</dd></div>
      </dl>
      ${ticketList ? `<ul class="admin-crm-dash-list">${ticketList}</ul>` : ''}
    </section>
  </div>`);
  $('adminCrmHwidBox') && ($('adminCrmHwidBox').innerHTML = `
    <div class="admin-crm-hwid-inline">${idPairHtml(u.uid, u.hwid || '(없음)')}</div>
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

function closePreviewOrderDrawer() {
  const drawer = $('adminCrmOrderDrawer');
  if (drawer) drawer.hidden = true;
}
function closeDetail() {
  selectedUid = '';
  closePreviewOrderDrawer();
  parkPreviewCrmDetail();
  $('adminCrm')?.classList.remove('is-detail-open', 'is-row-expand');
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
  const cat = $('adminTicketCategory')?.value || 'all';
  const range = $('adminTicketDate')?.value || 'all';
  const counts = { all: TICKETS.length, open: 0, answered: 0, closed: 0 };
  TICKETS.forEach((t) => { if (t.status in counts) counts[t.status]++; });
  document.querySelectorAll('#adminTicketTabs [data-ticket-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', (btn.getAttribute('data-ticket-tab') || 'all') === st);
  });
  document.querySelectorAll('#adminTicketTabs [data-ticket-count]').forEach((el) => {
    el.textContent = String(counts[el.getAttribute('data-ticket-count')] ?? 0);
  });
  const rows = TICKETS.filter((t) => {
    if (st !== 'all' && t.status !== st) return false;
    if (cat !== 'all' && t.type !== cat) return false;
    if (range === 'today' && t.day !== 'today') return false;
    if (range === '7d' && !(t.day === 'today' || t.day === '7d')) return false;
    if (range === '30d' && t.day === 'older') return false;
    return !q || [t.title, t.user, t.type].join(' ').toLowerCase().includes(q);
  });
  $('adminTicketCount') && ($('adminTicketCount').textContent = `${rows.length} / ${TICKETS.length}`);
  const box = $('adminTicketList');
  if (!box) return;
  box.innerHTML = `<table class="admin-table admin-ticket-table"><thead><tr><th></th><th>유형</th><th>제목</th><th>사용자</th><th>상태</th><th>수정일</th></tr></thead><tbody>${rows.map((t) => `<tr>
    <td></td>
    <td class="admin-ticket-cat">${t.type}</td>
    <td class="admin-ticket-title"><b>${t.title}</b></td>
    <td class="admin-ticket-user">${t.user}</td>
    <td class="admin-ticket-status">${ticketStatusBadge(t.status)}</td>
    <td class="admin-ticket-date">${t.when}</td>
  </tr>`).join('')}</tbody></table>`;
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
  const creditHead = logTab === 'credit';
  $('adminLogsTableHead') && ($('adminLogsTableHead').innerHTML = creditHead
    ? '<tr><th>시각</th><th>내역</th><th>내용</th><th>수행자</th></tr>'
    : '<tr><th>시각</th><th>종류</th><th>작업</th><th>내용</th><th>수행자</th></tr>');
  $('adminLogsTableBody') && ($('adminLogsTableBody').innerHTML = rows.map((r) => {
    const catLabel = (LOG_TABS.find(([id]) => id === r.cat) || [r.cat, r.cat])[1];
    if (creditHead) return `<tr><td>${r.when}</td><td>${r.action}</td><td>${r.summary}</td><td>${r.actor}</td></tr>`;
    return `<tr><td>${r.when}</td><td>${catLabel}</td><td>${r.action}</td><td>${r.summary}</td><td>${r.actor}</td></tr>`;
  }).join(''));
  const empty = $('adminLogsEmpty');
  if (empty) {
    empty.hidden = !!(logUid && rows.length);
    empty.textContent = !logUid ? '사용자를 선택하면 로그가 표시됩니다.' : '해당하는 로그가 없습니다.';
  }
}

function krw(n) {
  return `${Number(n || 0).toLocaleString('ko-KR')}원`;
}

const PREVIEW_PRODUCTS = [
  { productId: 'CREDIT_5', type: 'Credit Pack', name: '5 Credits', credits: '+5 Credits', list: 6500, sale: 6500, status: '중지', discount: '판매중지', badge: '', sort: 1, usd: '미설정' },
  { productId: 'CREDIT_30', type: 'Credit Pack', name: '30 Credits', credits: '+30 Credits', list: 35000, sale: 35000, status: '중지', discount: '판매중지', badge: '', sort: 2, usd: '미설정' },
  { productId: 'CREDIT_100', type: 'Credit Pack', name: '100 Credits', credits: '+100 Credits', list: 105000, sale: 105000, status: '중지', discount: '판매중지', badge: '', sort: 3, usd: '미설정' },
  { productId: 'PASS_7D', type: 'Full Pass', name: '7일 Full', credits: '7일 Full', list: 7900, sale: 7900, status: '판매중', discount: '정가', badge: '', sort: 5, usd: '미설정' },
  { productId: 'PASS_30D', type: 'Full Pass', name: '30일 Full', credits: '30일 Full', list: 19900, sale: 19900, status: '판매중', discount: '정가', badge: '추천', sort: 6, usd: '미설정' },
  { productId: 'PASS_90D', type: 'Full Pass', name: '90일 Full', credits: '90일 Full', list: 49900, sale: 49900, status: '판매중', discount: '정가', badge: '', sort: 7, usd: '미설정' },
  { productId: 'LIFETIME', type: 'Lifetime', name: 'Lifetime Full', credits: 'Lifetime Full', list: 129000, sale: 129000, status: '판매중', discount: '정가', badge: '', sort: 8, usd: '$89' }
];
const PREVIEW_PROMOS = [
  { id: 'summer', name: '여름 Pass 할인', targets: 'PASS_30D / PASS_90D', disc: '10%', start: '08/25 00:00', end: '08/31 23:59', status: '진행중', popup: '팝업 ON' },
  { id: 'life', name: 'Lifetime 주말 할인', targets: 'Lifetime', disc: '15%', start: '08/29 00:00', end: '08/30 23:59', status: '예정', popup: '팝업 OFF' }
];
let previewProductId = 'PASS_30D';
let previewPromoId = 'summer';
let previewPricingBound = false;
let previewIgnoreClickUntil = 0;
let previewDrag = null;

function previewFlash(msg) {
  const el = $('pricingSaveMsg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('is-ok');
}

function fillPreviewProduct(id) {
  previewProductId = id;
  const p = PREVIEW_PRODUCTS.find((x) => x.productId === id) || PREVIEW_PRODUCTS[1];
  const set = (k, v) => { const el = $(k); if (el) el.value = v; };
  const isLife = p.productId === 'LIFETIME';
  set('draftNameKo', p.name);
  set('draftNameKoDisplay', p.name);
  set('draftNameEn', p.name);
  set('draftNameJa', p.name);
  set('draftProductId', p.productId);
  set('draftType', p.type);
  set('draftInternalType', isLife ? 'lifetime' : 'credit_pack');
  set('draftProductVersion', '1');
  set('draftStatus', 'active');
  set('draftBadge', p.badge === '추천' ? 'recommended' : p.badge === 'Best Value' ? 'best' : '');
  set('draftCredits', isLife ? '' : String(p.credits.replace(/[^\d]/g, '')));
  const creditsWrap = $('draftCreditsWrap');
  const entitlementWrap = $('draftEntitlementWrap');
  if (creditsWrap) creditsWrap.hidden = isLife;
  if (entitlementWrap) entitlementWrap.hidden = !isLife;
  set('draftPriceKrw', String(p.list));
  const amountEl = $('draftUsdPreviewAmount');
  const promoEl = $('draftUsdPreviewPromo');
  const rateEl = $('draftUsdRateLine');
  const hintEl = $('draftUsdHint');
  if (amountEl) amountEl.textContent = '환율 연동 미리보기';
  if (promoEl) promoEl.hidden = true;
  if (rateEl) rateEl.textContent = '실제 관리자 화면은 서버 환율로 자동 계산합니다.';
  if (hintEl) hintEl.textContent = 'USD 직접 입력은 사용하지 않습니다. KRW가 기준입니다.';
  set('draftDescKo', p.productId === 'CREDIT_30' ? '' : p.productId === 'CREDIT_100' ? '대량' : p.productId === 'CREDIT_5' ? '소량 / 첫 구매' : '무제한 변환');
  set('draftDescEn', '');
  set('draftDescJa', '');
  const discOn = p.sale < p.list;
  const discEl = $('draftDiscEnabled');
  if (discEl) discEl.checked = discOn;
  const fields = $('draftDiscFields');
  const offNote = $('draftDiscOffNote');
  if (fields) fields.hidden = !discOn;
  if (offNote) offNote.hidden = !!discOn;
  set('draftDiscType', 'percent');
  set('draftDiscValue', discOn ? '10' : '');
  set('draftDiscStart', discOn ? '2026-08-25T00:00' : '');
  set('draftDiscEnd', discOn ? '2026-08-31T23:59' : '');
  $('draftUsdHint') && ($('draftUsdHint').textContent = p.usd === '미설정' ? 'USD 미설정 · PayPal 판매 안 함' : 'PayPal 판매 가능');
  $('previewList') && ($('previewList').textContent = krw(p.list));
  $('previewSale') && ($('previewSale').textContent = krw(p.sale));
  $('previewPct') && ($('previewPct').textContent = discOn ? '10% 할인 · 8월 31일까지' : '할인 없음');
  const credits = Number(String(p.credits).replace(/[^\d]/g, '')) || 0;
  const isPass = String(p.productId || '').startsWith('PASS_');
  if (isLife) {
    $('previewUnit') && ($('previewUnit').textContent = 'Lifetime Full · 영구 이용 · 자동결제 없음');
  } else if (isPass) {
    $('previewUnit') && ($('previewUnit').textContent = `${p.credits} · 변환 횟수 제한 없음 · 자동결제 없음`);
  } else {
    $('previewUnit') && ($('previewUnit').textContent = credits
      ? `1 Credit 약 ${Math.round(p.sale / credits).toLocaleString('ko-KR')}원`
      : '');
  }
  $('pricingEditorEmpty') && ($('pricingEditorEmpty').hidden = true);
  $('pricingEditorForm') && ($('pricingEditorForm').hidden = false);
  renderPreviewProductList();
}

function renderPreviewProductList() {
  const root = $('pricingProductList');
  if (!root) return;
  root.innerHTML = PREVIEW_PRODUCTS.map((p) => {
    const active = p.productId === previewProductId ? ' is-active' : '';
    const discounted = p.sale < p.list;
    let line2 = '';
    if (p.productId === 'LIFETIME') {
      line2 = `Lifetime Full · ${krw(p.list)}`;
    } else if (String(p.productId || '').startsWith('PASS_')) {
      line2 = discounted
        ? `${p.credits} · ${krw(p.list)} → ${krw(p.sale)}`
        : `${p.credits} · ${krw(p.list)}`;
    } else {
      line2 = discounted
        ? `${p.credits} · ${krw(p.list)} → ${krw(p.sale)}`
        : `${p.credits} · ${krw(p.list)}`;
    }
    const bits = [];
    if (p.status === '중지') bits.push('판매중지');
    else if (discounted) bits.push(p.discount);
    else if (p.productId === 'CREDIT_100') bits.push('약 19% 절약');
    if (p.badge) bits.push(p.badge);
    const idx = PREVIEW_PRODUCTS.indexOf(p);
    const upOff = idx === 0 ? ' disabled' : '';
    const downOff = idx === PREVIEW_PRODUCTS.length - 1 ? ' disabled' : '';
    return `<div class="pricing-product-item${active}" data-preview-product="${p.productId}">
      <button type="button" class="pricing-drag-handle" data-drag-handle aria-label="드래그하여 순서 변경" title="드래그하여 순서 변경"><span aria-hidden="true">⠿</span></button>
      <button type="button" class="pricing-product-item-body" data-select-product>
        <span class="pricing-product-item-top"><strong>${p.name}</strong><span class="badge">${p.status}</span></span>
        <span class="pricing-product-item-main">${line2}</span>
        ${bits.length ? `<span class="muted small">${bits.join(' · ')}</span>` : ''}
        <span class="muted small pricing-product-item-id">${p.productId}</span>
      </button>
      <span class="pricing-reorder-btns">
        <button type="button" class="pricing-reorder-btn" data-move-up aria-label="위로 이동"${upOff}>↑</button>
        <button type="button" class="pricing-reorder-btn" data-move-down aria-label="아래로 이동"${downOff}>↓</button>
      </span>
    </div>`;
  }).join('') + '<div class="pricing-drop-indicator" hidden></div>';
}

function commitPreviewProductOrder(ids) {
  const byId = new Map(PREVIEW_PRODUCTS.map((p) => [p.productId, p]));
  const next = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    next.push(row);
  }
  if (next.length !== PREVIEW_PRODUCTS.length) return;
  PREVIEW_PRODUCTS.length = 0;
  next.forEach((row, i) => {
    row.sort = i + 1;
    PREVIEW_PRODUCTS.push(row);
  });
  renderPreviewProductList();
  const status = $('pricingReorderStatus');
  if (status) {
    status.hidden = false;
    status.className = 'pricing-reorder-status is-saved';
    status.textContent = '✓ 순서 저장됨';
    setTimeout(() => { status.hidden = true; }, 1400);
  }
}

function movePreviewProduct(productId, delta) {
  const ids = PREVIEW_PRODUCTS.map((p) => p.productId);
  const from = ids.indexOf(productId);
  if (from < 0) return;
  const to = Math.max(0, Math.min(ids.length - 1, from + delta));
  if (to === from) return;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  commitPreviewProductOrder(ids);
}

function bindPreviewProductReorder() {
  const root = $('pricingProductList');
  if (!root || root.dataset.reorderBound === '1') return;
  root.dataset.reorderBound = '1';
  root.addEventListener('click', (e) => {
    if (Date.now() < previewIgnoreClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const item = e.target.closest('[data-preview-product]');
    if (!item || !root.contains(item)) return;
    const pid = item.getAttribute('data-preview-product');
    if (e.target.closest('[data-drag-handle]')) {
      e.preventDefault();
      return;
    }
    if (e.target.closest('[data-move-up]')) {
      e.preventDefault();
      movePreviewProduct(pid, -1);
      return;
    }
    if (e.target.closest('[data-move-down]')) {
      e.preventDefault();
      movePreviewProduct(pid, 1);
      return;
    }
    if (e.target.closest('[data-select-product]')) fillPreviewProduct(pid);
  });
  root.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    const item = handle.closest('[data-preview-product]');
    if (!item) return;
    e.preventDefault();
    const items = [...root.querySelectorAll('.pricing-product-item')];
    const fromIndex = items.indexOf(item);
    if (fromIndex < 0) return;
    try { handle.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    previewDrag = { pointerId: e.pointerId, fromIndex, startY: e.clientY, moved: false, insertIndex: fromIndex, item };
    const indicator = root.querySelector('.pricing-drop-indicator');
    const place = (insert) => {
      if (!indicator || !items.length) return;
      const listRect = root.getBoundingClientRect();
      let y;
      if (insert <= 0) y = items[0].getBoundingClientRect().top - listRect.top;
      else if (insert >= items.length) y = items[items.length - 1].getBoundingClientRect().bottom - listRect.top;
      else y = items[insert].getBoundingClientRect().top - listRect.top;
      indicator.style.top = `${Math.max(0, y - 1)}px`;
      indicator.hidden = false;
    };
    const onMove = (ev) => {
      if (!previewDrag || ev.pointerId !== previewDrag.pointerId) return;
      if (Math.abs(ev.clientY - previewDrag.startY) > 4) previewDrag.moved = true;
      if (!previewDrag.moved) return;
      item.classList.add('is-dragging');
      const live = [...root.querySelectorAll('.pricing-product-item')];
      let insert = live.length;
      for (let i = 0; i < live.length; i++) {
        const r = live[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { insert = i; break; }
      }
      previewDrag.insertIndex = insert;
      place(insert);
    };
    const onUp = (ev) => {
      if (!previewDrag || ev.pointerId !== previewDrag.pointerId) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      try { handle.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      const { fromIndex, insertIndex, moved } = previewDrag;
      if (indicator) indicator.hidden = true;
      item.classList.remove('is-dragging');
      previewDrag = null;
      if (!moved) return;
      previewIgnoreClickUntil = Date.now() + 400;
      let to = insertIndex;
      if (to > fromIndex) to -= 1;
      to = Math.max(0, Math.min(PREVIEW_PRODUCTS.length - 1, to));
      const ids = PREVIEW_PRODUCTS.map((p) => p.productId);
      if (to !== fromIndex) {
        const [movedId] = ids.splice(fromIndex, 1);
        ids.splice(to, 0, movedId);
      }
      commitPreviewProductOrder(ids);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}

function fillPreviewPromo(id) {
  previewPromoId = id;
  const p = PREVIEW_PROMOS.find((x) => x.id === id) || PREVIEW_PROMOS[0];
  const set = (k, v) => { const el = $(k); if (el) el.value = v; };
  set('promoNameKo', p.name);
  set('promoNameEn', p.id === 'summer' ? 'Summer Credit Sale' : 'Lifetime Weekend Sale');
  set('promoNameJa', p.id === 'summer' ? '夏のCredit割引' : 'Lifetime週末割引');
  const en = $('promoEnabledFlag');
  if (en) en.checked = true;
  set('promoType', 'percent');
  set('promoValue', p.disc.replace('%', ''));
  set('promoStart', p.id === 'summer' ? '2026-08-25T00:00' : '2026-08-29T00:00');
  set('promoEnd', p.id === 'summer' ? '2026-08-31T23:59' : '2026-08-30T23:59');
  const pop = $('promoPopupEnabled');
  if (pop) pop.checked = p.popup.includes('ON');
  set('promoPopupTitleKo', p.name);
  set('promoPopupBodyKo', p.id === 'summer' ? '30 / 100 Credits 최대 10% 할인. 8월 31일까지.' : 'Lifetime License 130,000 → 110,500원');
  set('promoPopupCtaKo', p.id === 'summer' ? '가격 보기' : 'Lifetime 구매');
  set('promoCtaUrl', './purchase.html');
  const box = $('promoProductTargets');
  if (box) {
    box.innerHTML = PREVIEW_PRODUCTS.map((prod) => {
      const on = p.id === 'summer' ? prod.productId !== 'LIFETIME' && prod.productId !== 'CREDIT_5' : prod.productId === 'LIFETIME';
      return `<label class="pricing-check"><input type="checkbox" ${on ? 'checked' : ''} disabled> ${prod.name}</label>`;
    }).join('');
  }
  $('pricingPromoEmpty') && ($('pricingPromoEmpty').hidden = true);
  $('pricingPromoForm') && ($('pricingPromoForm').hidden = false);
  const list = $('pricingPromoList');
  if (list) {
    list.innerHTML = PREVIEW_PROMOS.map((row) => {
      const active = row.id === previewPromoId ? ' is-active' : '';
      return `<button type="button" class="pricing-product-item${active}" data-preview-promo="${row.id}">
        <span class="pricing-product-item-top"><strong>${row.name}</strong><span class="badge">${row.status}</span></span>
        <span class="muted small">${row.targets}</span>
        <span class="muted small">${row.disc} · ${row.start} ~ ${row.end}</span>
        <span class="muted small">${row.popup}</span>
      </button>`;
    }).join('');
  }
}

function renderPricingMock() {
  $('pricingStatTotal') && ($('pricingStatTotal').textContent = '4');
  $('pricingStatLive') && ($('pricingStatLive').textContent = '4');
  $('pricingStatDiscount') && ($('pricingStatDiscount').textContent = '1');
  $('pricingStatScheduled') && ($('pricingStatScheduled').textContent = '1');
  renderPreviewProductList();
  fillPreviewProduct(previewProductId);
  fillPreviewPromo(previewPromoId);
  if (previewPricingBound) return;
  previewPricingBound = true;
  bindPreviewProductReorder();
  document.querySelectorAll('[data-pricing-pane]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pane = btn.getAttribute('data-pricing-pane');
      document.querySelectorAll('[data-pricing-pane]').forEach((b) => b.classList.toggle('is-active', b === btn));
      if ($('pricingProductsPane')) $('pricingProductsPane').hidden = pane !== 'products';
      if ($('pricingPromosPane')) $('pricingPromosPane').hidden = pane !== 'promos';
    });
  });
  $('pricingProductList')?.addEventListener('click', (e) => {
    if (Date.now() < previewIgnoreClickUntil) return;
    if (e.target.closest('[data-drag-handle], [data-move-up], [data-move-down]')) return;
    const btn = e.target.closest('[data-select-product]');
    const item = btn?.closest('[data-preview-product]');
    if (item) fillPreviewProduct(item.getAttribute('data-preview-product'));
  });
  $('pricingPromoList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preview-promo]');
    if (btn) fillPreviewPromo(btn.getAttribute('data-preview-promo'));
  });
  const mockSave = (label) => (e) => {
    e.preventDefault();
    previewFlash(`미리보기입니다. ${label}은 저장되지 않습니다. 실제 반영은 admin.html에서 하세요.`);
  };
  $('pricingSaveBtn')?.addEventListener('click', mockSave('상품 저장'));
  $('pricingSavePromoBtn')?.addEventListener('click', mockSave('이벤트 저장'));
  $('pricingAddProduct')?.addEventListener('click', () => { if ($('pricingCreateModal')) $('pricingCreateModal').hidden = false; });
  $('pricingCreateCancel')?.addEventListener('click', () => { if ($('pricingCreateModal')) $('pricingCreateModal').hidden = true; });
  $('pricingCreateConfirm')?.addEventListener('click', (e) => {
    e.preventDefault();
    if ($('pricingCreateModal')) $('pricingCreateModal').hidden = true;
    previewFlash('미리보기입니다. 새 상품은 저장되지 않습니다.');
  });
  $('pricingAddPromo')?.addEventListener('click', () => {
    document.querySelector('[data-pricing-pane="promos"]')?.click();
    previewFlash('미리보기입니다. 새 이벤트는 저장되지 않습니다.');
  });
}

function cmsRows() { return CMS[cmsTab] || []; }
function cmsTitle(x) {
  if (cmsTab === 'faq') return x.question || '-';
  if (cmsTab === 'patches') return `${x.type || 'APP'}${x.version ? ` · v${x.version}` : ''} · ${x.title || '-'}`;
  return x.title || '-';
}
function cmsStatusHtml(x) {
  return `${x.visible === false ? '<span class="badge none">숨김</span>' : '<span class="badge active">공개</span>'}${x.pinned ? ' <span class="badge pending">고정</span>' : ''}`;
}
function filteredCmsRows() {
  const q = ($('adminCmsSearch')?.value || '').trim().toLowerCase();
  return cmsRows().filter((x) => {
    const visible = x.visible !== false;
    const statusOk = cmsStatusApplied === 'all'
      || (cmsStatusApplied === 'visible' && visible)
      || (cmsStatusApplied === 'hidden' && !visible)
      || (cmsStatusApplied === 'pinned' && !!x.pinned);
    const hay = [cmsTitle(x), x.content, x.answer, x.author].join(' ').toLowerCase();
    return statusOk && (!q || hay.includes(q));
  });
}
function updateCmsFilterButton() {
  const btn = $('adminCmsFilterBtn');
  if (!btn) return;
  const n = cmsStatusApplied !== 'all' ? 1 : 0;
  btn.textContent = n ? `필터 ${n}` : '필터';
  btn.classList.toggle('is-active', n > 0);
}
function closeCmsDrawer() {
  const drawer = $('adminCmsDrawer');
  if (drawer) drawer.hidden = true;
  cmsDrawer = { mode: 'view', id: '' };
}
function renderCms() {
  bindCmsChrome();
  document.querySelectorAll('#adminCmsTabs [data-cms-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', (btn.getAttribute('data-cms-tab') || 'notices') === cmsTab);
  });
  updateCmsFilterButton();
  const box = $('adminCmsList');
  if (!box) return;
  const rows = filteredCmsRows();
  const q = ($('adminCmsSearch')?.value || '').trim();
  $('adminCmsCount') && ($('adminCmsCount').textContent = (q || cmsStatusApplied !== 'all') ? `검색 결과 ${rows.length}건` : `${rows.length}건`);
  if (!rows.length) {
    box.innerHTML = '<div class="empty-card">해당하는 콘텐츠가 없습니다.</div>';
    return;
  }
  const extra = cmsTab === 'board';
  box.innerHTML = `<table class="admin-table admin-cms-table"><thead><tr>
    <th>제목</th><th>상태</th><th>작성자</th><th>작성일</th><th>수정일</th>${extra ? '<th>조회</th><th>댓글</th>' : ''}<th>관리</th>
  </tr></thead><tbody>${rows.map((x) => `
    <tr class="admin-cms-row${x.visible === false ? ' is-hidden' : ''}" data-cms-id="${x.id}">
      <td class="admin-cms-title"><b>${x.pinned ? '📌 ' : ''}${cmsTitle(x)}</b></td>
      <td>${cmsStatusHtml(x)}</td>
      <td>${x.author || '-'}</td>
      <td>${x.createdAt}</td>
      <td>${x.updatedAt}</td>
      ${extra ? `<td>${x.views || 0}</td><td>${x.comments || 0}</td>` : ''}
      <td><div class="table-actions" onclick="event.stopPropagation()">
        <button type="button" class="ghost mini-btn" data-cms-view="${x.id}">보기</button>
        <button type="button" class="secondary mini-btn" data-cms-edit="${x.id}">수정</button>
        <button type="button" class="secondary mini-btn danger-btn" data-cms-delete="${x.id}">삭제</button>
      </div></td>
    </tr>`).join('')}</tbody></table>`;
}
function openCmsDrawer(id, mode) {
  const drawer = $('adminCmsDrawer');
  const body = $('adminCmsDrawerBody');
  const title = $('adminCmsDrawerTitle');
  if (!drawer || !body) return;
  cmsDrawer = { mode: mode || 'view', id: id || '' };
  drawer.hidden = false;
  const row = id ? cmsRows().find((x) => x.id === id) : null;
  if (title) title.textContent = !id ? `새 ${({ notices: '공지사항', patches: '패치노트', faq: 'FAQ', board: '자유게시판' })[cmsTab]}` : cmsTitle(row || {});
  if (mode === 'edit') {
    const isFaq = cmsTab === 'faq';
    body.innerHTML = `<form class="admin-cms-form" id="adminCmsPreviewForm">
      <div class="admin-cms-form-body">
        <label class="edit-field"><span>${isFaq ? '질문' : '제목'}</span><input name="title" value="${row ? (isFaq ? row.question : row.title) || '' : ''}" required></label>
        ${cmsTab === 'patches' ? `<label class="edit-field"><span>구분</span><select name="type"><option${(row?.type || 'APP') === 'APP' ? ' selected' : ''}>APP</option><option${row?.type === 'WEB' ? ' selected' : ''}>WEB</option></select></label>` : ''}
        <label class="edit-field"><span>${isFaq ? '답변' : '내용'}</span><textarea name="content" rows="8">${row ? (isFaq ? row.answer : row.content) || '' : ''}</textarea></label>
        <label class="edit-field edit-field-check"><span>상단 고정</span><input type="checkbox" name="pinned"${row?.pinned ? ' checked' : ''}></label>
        ${id ? `<label class="edit-field edit-field-check"><span>공개</span><input type="checkbox" name="visible"${row?.visible !== false ? ' checked' : ''}></label>` : ''}
      </div>
      <div class="admin-cms-view-actions">
        <button type="button" class="ghost mini-btn" data-cms-close="1">취소</button>
        <button type="submit" class="primary mini-btn">저장</button>
      </div>
    </form>`;
    $('adminCmsPreviewForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        title: String(fd.get('title') || ''),
        content: String(fd.get('content') || ''),
        pinned: !!fd.get('pinned'),
        visible: id ? fd.get('visible') !== null : true,
        type: String(fd.get('type') || 'APP'),
        author: row?.author || 'MidiAI Studio',
        createdAt: row?.createdAt || '2026.08.19',
        updatedAt: '2026.08.19'
      };
      if (cmsTab === 'faq') { payload.question = payload.title; payload.answer = payload.content; }
      if (!id) {
        payload.id = `${cmsTab}_${Date.now()}`;
        payload.views = 0; payload.comments = 0;
        cmsRows().unshift(payload);
        previewNotice('미리보기 — 저장됨 (실제 데이터 변경 없음)');
        openCmsDrawer(payload.id, 'view');
      } else {
        Object.assign(row, payload);
        if (cmsTab === 'faq') { row.question = payload.question; row.answer = payload.answer; }
        previewNotice('미리보기 — 수정됨 (실제 데이터 변경 없음)');
        openCmsDrawer(id, 'view');
      }
      renderCms();
    });
    return;
  }
  if (!row) { body.innerHTML = '<p class="muted">항목이 없습니다.</p>'; return; }
  body.innerHTML = `<div class="admin-cms-view">
    <div class="admin-cms-view-meta">${cmsStatusHtml(row)}<span>${row.author}</span><span>작성 ${row.createdAt}</span><span>수정 ${row.updatedAt}</span>${cmsTab === 'board' ? `<span>조회 ${row.views || 0}</span><span>댓글 ${row.comments || 0}</span>` : ''}</div>
    <div class="admin-cms-view-body">${(cmsTab === 'faq' ? row.answer : row.content) || ''}</div>
    <div class="admin-cms-view-actions">
      <button type="button" class="secondary mini-btn" data-cms-edit="${row.id}">수정</button>
      ${cmsTab === 'board' ? `<button type="button" class="secondary mini-btn" data-cms-pin="${row.id}">${row.pinned ? '고정 해제' : '고정'}</button>` : ''}
      <button type="button" class="secondary mini-btn danger-btn" data-cms-delete="${row.id}">삭제</button>
    </div>
  </div>`;
}
function deleteCmsItem(id) {
  if (!id || !confirm('삭제할까요?')) return;
  const rows = cmsRows();
  const idx = rows.findIndex((x) => x.id === id);
  if (idx >= 0) rows.splice(idx, 1);
  previewNotice('미리보기 — 삭제됨 (실제 데이터 변경 없음)');
  closeCmsDrawer();
  renderCms();
}
function bindCmsChrome() {
  const tabs = $('adminCmsTabs');
  if (tabs && !tabs.dataset.bound) {
    tabs.dataset.bound = '1';
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cms-tab]');
      if (!btn) return;
      closeCmsDrawer();
      cmsTab = btn.getAttribute('data-cms-tab') || 'notices';
      renderCms();
    });
  }
  const search = $('adminCmsSearch');
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', renderCms);
  }
  const newBtn = $('adminCmsNewBtn');
  if (newBtn && !newBtn.dataset.bound) {
    newBtn.dataset.bound = '1';
    newBtn.addEventListener('click', () => openCmsDrawer('', 'edit'));
  }
  const list = $('adminCmsList');
  if (list && !list.dataset.bound) {
    list.dataset.bound = '1';
    list.addEventListener('click', (e) => {
      const del = e.target.closest('[data-cms-delete]');
      if (del) { deleteCmsItem(del.getAttribute('data-cms-delete')); return; }
      const edit = e.target.closest('[data-cms-edit]');
      if (edit) { openCmsDrawer(edit.getAttribute('data-cms-edit'), 'edit'); return; }
      const view = e.target.closest('[data-cms-view]');
      if (view) { openCmsDrawer(view.getAttribute('data-cms-view'), 'view'); return; }
      const row = e.target.closest('[data-cms-id]');
      if (row) openCmsDrawer(row.getAttribute('data-cms-id'), 'view');
    });
  }
  const drawer = $('adminCmsDrawer');
  if (drawer && !drawer.dataset.bound) {
    drawer.dataset.bound = '1';
    drawer.addEventListener('click', (e) => {
      if (e.target.closest('[data-cms-close]')) { closeCmsDrawer(); return; }
      const edit = e.target.closest('[data-cms-edit]');
      if (edit) { openCmsDrawer(edit.getAttribute('data-cms-edit'), 'edit'); return; }
      const del = e.target.closest('[data-cms-delete]');
      if (del) { deleteCmsItem(del.getAttribute('data-cms-delete')); return; }
      const pin = e.target.closest('[data-cms-pin]');
      if (pin) {
        const row = cmsRows().find((x) => x.id === pin.getAttribute('data-cms-pin'));
        if (row) row.pinned = !row.pinned;
        renderCms();
        openCmsDrawer(row.id, 'view');
      }
    });
  }
  const btn = $('adminCmsFilterBtn');
  const pop = $('adminCmsFilterPopover');
  if (btn && pop && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      if (!pop.hidden && $('adminCmsStatus')) $('adminCmsStatus').value = cmsStatusApplied;
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
    $('adminCmsFilterApply')?.addEventListener('click', () => {
      cmsStatusApplied = $('adminCmsStatus')?.value || 'all';
      pop.hidden = true;
      renderCms();
    });
    $('adminCmsFilterReset')?.addEventListener('click', () => {
      cmsStatusApplied = 'all';
      if ($('adminCmsStatus')) $('adminCmsStatus').value = 'all';
      pop.hidden = true;
      renderCms();
    });
    document.addEventListener('click', () => { if (!pop.hidden) pop.hidden = true; });
  }
}

function snapshotPreviewFilterState() {
  return {
    license: $('adminUserLicenseStatus')?.value || 'all',
    orders: $('adminCrmFilterOrders')?.value || 'all',
    tickets: $('adminCrmFilterTickets')?.value || 'all',
    activity: $('adminCrmFilterActivity')?.value || 'all',
    quick: memberQuickFilter,
    stat: memberStatKey
  };
}
function restorePreviewFilterState(snap) {
  if (!snap) return;
  if ($('adminUserLicenseStatus')) $('adminUserLicenseStatus').value = snap.license;
  if ($('adminCrmFilterOrders')) $('adminCrmFilterOrders').value = snap.orders;
  if ($('adminCrmFilterTickets')) $('adminCrmFilterTickets').value = snap.tickets;
  if ($('adminCrmFilterActivity')) $('adminCrmFilterActivity').value = snap.activity;
  memberQuickFilter = snap.quick || '';
  memberStatKey = snap.stat || 'all';
}
function setPreviewFilterPopoverOpen(open) {
  const pop = $('adminCrmFilterPopover');
  const btn = $('adminCrmFilterBtn');
  if (!pop || !btn) return;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) setPreviewFilterPopoverOpen._snap = snapshotPreviewFilterState();
}
function closePreviewFilterPopover({ restore = false } = {}) {
  const pop = $('adminCrmFilterPopover');
  if (restore && pop && !pop.hidden) restorePreviewFilterState(setPreviewFilterPopoverOpen._snap);
  setPreviewFilterPopoverOpen(false);
}
function applyPreviewFilterPopover() {
  const st = $('adminUserLicenseStatus')?.value || 'all';
  const act = $('adminCrmFilterActivity')?.value || 'all';
  const ordersF = $('adminCrmFilterOrders')?.value || 'all';
  const ticketsF = $('adminCrmFilterTickets')?.value || 'all';
  if (act === 'idle7' || act === 'idle30') memberQuickFilter = act;
  else if (memberQuickFilter === 'idle7' || memberQuickFilter === 'idle30') memberQuickFilter = '';
  if (st === 'trial' || st === 'lifetime' || st === 'period' || st === 'favorites') memberStatKey = st;
  else if (act === 'idle7' || act === 'idle30' || ordersF !== 'all' || ticketsF !== 'all') memberStatKey = 'filtered';
  else if (memberQuickFilter === 'today' || memberQuickFilter === 'active') memberStatKey = memberQuickFilter;
  else memberStatKey = 'all';
  setPreviewFilterPopoverOpen._snap = snapshotPreviewFilterState();
  setPreviewFilterPopoverOpen(false);
  renderMembers();
}
function resetPreviewFilterPopover() {
  if ($('adminUserLicenseStatus')) $('adminUserLicenseStatus').value = 'all';
  if ($('adminCrmFilterOrders')) $('adminCrmFilterOrders').value = 'all';
  if ($('adminCrmFilterTickets')) $('adminCrmFilterTickets').value = 'all';
  if ($('adminCrmFilterActivity')) $('adminCrmFilterActivity').value = 'all';
  memberQuickFilter = '';
  memberStatKey = 'all';
  applyPreviewFilterPopover();
}
function applyPreviewMemberStat(key) {
  closePreviewFilterPopover({ restore: true });
  const k = String(key || 'all');
  memberStatKey = k;
  memberQuickFilter = '';
  const sel = $('adminUserLicenseStatus');
  const act = $('adminCrmFilterActivity');
  if (k === 'all') {
    if (sel) sel.value = 'all';
    if (act) act.value = 'all';
  } else if (k === 'lifetime' || k === 'trial' || k === 'period' || k === 'favorites') {
    if (sel) sel.value = k;
  } else if (k === 'active' || k === 'today' || k === 'idle7' || k === 'idle30') {
    if (sel) sel.value = 'all';
    memberQuickFilter = k;
    if (act) act.value = (k === 'idle7' || k === 'idle30') ? k : 'all';
  }
  renderMembers();
}
function bindPreviewFilterPopover() {
  const btn = $('adminCrmFilterBtn');
  const pop = $('adminCrmFilterPopover');
  if (!btn || !pop || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.hidden) {
      const act = $('adminCrmFilterActivity');
      if (act) act.value = (memberQuickFilter === 'idle7' || memberQuickFilter === 'idle30') ? memberQuickFilter : 'all';
      setPreviewFilterPopoverOpen(true);
    } else {
      closePreviewFilterPopover({ restore: true });
    }
  });
  pop.addEventListener('click', (e) => e.stopPropagation());
  $('adminCrmFilterApply')?.addEventListener('click', applyPreviewFilterPopover);
  $('adminCrmFilterReset')?.addEventListener('click', resetPreviewFilterPopover);
  document.addEventListener('click', () => {
    if (pop.hidden) return;
    closePreviewFilterPopover({ restore: true });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || pop.hidden) return;
    closePreviewFilterPopover({ restore: true });
  });
}

function bind() {
  document.documentElement.classList.add('sidebar-ready');
  window.__midiaiShowAdminViewCore = showView;
  window.__midiaiShowAdminView = showView;
  $('admin')?.classList.remove('admin-locked');
  $('adminCrmStats') && ($('adminCrmStats').innerHTML = crmStatsHtml());
  bindPreviewFilterPopover();
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
    const licensePageBtn = e.target.closest('button[data-license-page], .admin-page-tab[data-license-page]');
    if (licensePageBtn && licensePageBtn !== document.body) {
      const page = licensePageBtn.getAttribute('data-license-page');
      if (page === 'status' || page === 'history') {
        e.preventDefault();
        showView('crm', { crmMode: 'license', licensePage: page });
      }
    }
    const licenseTabBtn = e.target.closest('[data-license-tab]');
    if (licenseTabBtn) {
      licenseTab = licenseTabBtn.getAttribute('data-license-tab') || 'all';
      renderCrmWork();
    }
    const orderTabBtn = e.target.closest('[data-order-tab]');
    if (orderTabBtn) {
      orderTab = orderTabBtn.getAttribute('data-order-tab') || 'all';
      renderCrmWork();
    }
    const licenseStat = e.target.closest('[data-license-stat]');
    if (licenseStat) {
      const key = licenseStat.getAttribute('data-license-stat') || 'all';
      licenseTab = key === 'expiring7' ? 'expiring' : key;
      renderCrmWork();
    }
    const orderStat = e.target.closest('[data-order-stat]');
    if (orderStat) {
      const key = orderStat.getAttribute('data-order-stat') || 'all';
      orderTab = key === 'today' ? 'paid' : key;
      renderCrmWork();
    }
    const dashKpi = e.target.closest('[data-dash-kpi]');
    if (dashKpi) {
      const key = dashKpi.getAttribute('data-dash-kpi');
      if (key === 'pay-today') showView('payments');
      else if (key === 'tickets-open') showView('tickets', { ticketStatus: 'open' });
      else {
        showView('crm', { crmMode: 'members' });
        applyPreviewMemberStat(['trial', 'lifetime', 'period', 'active', 'today'].includes(key) ? key : 'all');
      }
    }
    const stat = e.target.closest('#adminCrmStats [data-crm-stat]');
    if (stat) {
      showView('crm', { crmMode: 'members' });
      const key = stat.getAttribute('data-crm-stat') || 'all';
      applyPreviewMemberStat(key);
      return;
    }
    const dashUser = e.target.closest('.admin-dash-user[data-admin-uid]');
    if (dashUser) {
      showView('crm', { crmMode: 'members' });
      openDetail(dashUser.getAttribute('data-admin-uid'), { forceOpen: true });
    }
    const dashLog = e.target.closest('[data-dash-log-uid]');
    if (dashLog) showView('logs', { logsTab: 'admin', uid: dashLog.getAttribute('data-dash-log-uid') });
    const dashTicket = e.target.closest('[data-dash-ticket]');
    if (dashTicket) showView('tickets', { ticketStatus: dashTicket.getAttribute('data-dash-ticket') === 'open' ? 'open' : 'all' });
    const licenseGrant = e.target.closest('[data-license-grant]');
    if (licenseGrant) {
      const uid = licenseGrant.getAttribute('data-license-uid');
      const kind = licenseGrant.getAttribute('data-license-grant');
      if (kind === 'trial') applyPreviewLicense({ plan: 'trial', licenseStatus: 'active', startsAt: PREVIEW_TODAY, expiresAt: '', issuedBy: '관리자' }, { uid, notice: '미리보기 — 체험판 지급 (실제 데이터 변경 없음)' });
      else if (kind === 'lifetime') applyPreviewLicense({ plan: 'lifetime', licenseStatus: 'active', startsAt: '', expiresAt: '', issuedBy: '관리자' }, { uid, notice: '미리보기 — 평생 지급 (실제 데이터 변경 없음)' });
      else if (kind === 'period') applyPreviewLicense({ plan: 'period', licenseStatus: 'active', startsAt: PREVIEW_TODAY, expiresAt: addDays(PREVIEW_TODAY, 30), issuedBy: '관리자' }, { uid, notice: '미리보기 — 기간제 지급 (실제 데이터 변경 없음)' });
      else if (kind === 'ban') applyPreviewLicense({ licenseStatus: 'banned' }, { uid, notice: '미리보기 — 라이선스 정지 (실제 데이터 변경 없음)' });
      else applyPreviewLicense({ licenseStatus: 'active' }, { uid, notice: '미리보기 — 라이선스 활성화 (실제 데이터 변경 없음)' });
      return;
    }
    const licenseCreditGrant = e.target.closest('[data-license-credit-grant]');
    if (licenseCreditGrant) {
      previewAdjustLicenseCredits(licenseCreditGrant, 1);
      return;
    }
    const licenseCreditDeduct = e.target.closest('[data-license-credit-deduct]');
    if (licenseCreditDeduct) {
      previewAdjustLicenseCredits(licenseCreditDeduct, -1);
      return;
    }
    const licenseSave = e.target.closest('[data-license-save]');
    if (licenseSave) {
      const uid = licenseSave.getAttribute('data-license-save');
      const wrap = licenseSave.closest('.admin-license-expand-inner');
      const patch = {
        startsAt: wrap?.querySelector('[data-lic-starts]')?.value || '',
        expiresAt: wrap?.querySelector('[data-lic-expires]')?.value || '',
        licenseMemo: wrap?.querySelector('[data-lic-memo]')?.value || ''
      };
      const plan = wrap?.querySelector('[data-lic-plan]')?.value;
      if (plan) patch.plan = plan;
      applyPreviewLicense(patch, { uid, notice: '미리보기 — 라이선스 저장 (실제 데이터 변경 없음)' });
      return;
    }
    const licenseLogs = e.target.closest('[data-license-logs]');
    if (licenseLogs) {
      showView('logs', { logsTab: 'license', uid: licenseLogs.getAttribute('data-license-logs') });
      return;
    }
    const licenseMember = e.target.closest('[data-license-member]');
    if (licenseMember) {
      showView('crm', { crmMode: 'members' });
      openDetail(licenseMember.getAttribute('data-license-member'), { forceOpen: true });
      return;
    }
    const licenseRow = e.target.closest('#adminUserList [data-license-row]');
    if (licenseRow && crmMode === 'license' && !e.target.closest('input,select,textarea,[data-license-grant],[data-license-member],[data-license-save],[data-license-logs],[data-license-credit-grant],[data-license-credit-deduct]')) {
      const uid = licenseRow.getAttribute('data-license-row');
      licenseOpen = licenseOpen === uid ? '' : uid;
      renderCrmWork();
      return;
    }
    const row = e.target.closest('#adminUserList [data-admin-uid]');
    if (row && !e.target.closest('[data-crm-check], .admin-member-expand')) openDetail(row.getAttribute('data-admin-uid'));
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
      else if (act === 'goto-tab') setDetailTab(action.getAttribute('data-crm-tab') || 'overview');
      else if (act === 'focus-usage') {
        setDetailTab('overview');
        $('adminCrmUsageCard')?.classList.remove('is-collapsed');
        const usage = $('adminCrmUsage');
        if (usage) usage.hidden = false;
        $('adminCrmUsageHint') && ($('adminCrmUsageHint').textContent = '접기');
      }
      else if (act === 'orders' || act === 'orders-more') setDetailTab('payments');
      else if (act === 'tickets') setDetailTab('tickets');
      else if (act === 'tickets-tab') showView('tickets');
      else if (act === 'open-logs') showView('logs', { logsTab: 'all', uid: selectedUid });
      else if (act === 'close-order-drawer') closePreviewOrderDrawer();
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
      else if (act === 'credits') {
        openPreviewBulkCredits();
        return;
      }
      else if (['hwid-reset', 'delete', 'ban', 'app-message', 'posts-delete-selected', 'posts-delete-all'].includes(act)) {
        if (act === 'ban') applyPreviewLicense({ licenseStatus: 'banned' }, { notice: '미리보기 — 라이선스 정지 (실제 데이터 변경 없음)' });
        else previewNotice('미리보기 — 실제 데이터는 변경되지 않습니다');
      }
    }
    const delOrder = e.target.closest('[data-order-delete]');
    if (delOrder) {
      const id = delOrder.getAttribute('data-order-delete');
      const idx = ORDERS.findIndex((o) => o.id === id);
      if (idx >= 0 && confirm('이 주문을 삭제할까요? (미리보기)')) {
        ORDERS.splice(idx, 1);
        previewNotice('미리보기 — 주문 삭제됨 (실제 데이터 변경 없음)');
        renderCrmWork();
      }
      return;
    }
    const orderGroupRow = e.target.closest('[data-order-group]');
    if (orderGroupRow) {
      if (!window.__midiaiPreviewOrderOpen) window.__midiaiPreviewOrderOpen = new Set();
      const key = orderGroupRow.getAttribute('data-order-group');
      if (window.__midiaiPreviewOrderOpen.has(key)) window.__midiaiPreviewOrderOpen.delete(key);
      else window.__midiaiPreviewOrderOpen.add(key);
      renderCrmWork();
      return;
    }
    const pay = e.target.closest('[data-pay-uid]');
    if (pay && !e.target.closest('[data-admin-nav]')) {
      const fromOrders = !!pay.closest('#adminUserList');
      showView('crm', { crmMode: fromOrders ? 'orders' : 'members', detailTab: 'payments' });
      openDetail(pay.getAttribute('data-pay-uid'), { tab: 'payments', forceOpen: true });
    }
    const logTabBtn = e.target.closest('[data-log-tab]');
    if (logTabBtn) {
      logTab = logTabBtn.getAttribute('data-log-tab');
      renderLogs();
    }
    const ticketTab = e.target.closest('#adminTicketTabs [data-ticket-tab]');
    if (ticketTab) {
      const next = ticketTab.getAttribute('data-ticket-tab') || 'all';
      if ($('adminTicketStatus')) $('adminTicketStatus').value = next;
      renderTickets();
      const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      hash.set('view', 'tickets');
      if (next === 'all') hash.delete('ticket'); else hash.set('ticket', next);
      history.replaceState(null, '', `#${hash}`);
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
  ['adminUserSort', 'adminTicketStatus', 'adminTicketCategory', 'adminTicketDate', 'adminLogsDateFilter', 'adminLogsUserSelect', 'adminLicensePlan', 'adminUserRole', 'adminLicenseStartsAt', 'adminLicenseExpiresAt'].forEach((id) => {
    $(id)?.addEventListener('change', () => {
      if (id === 'adminTicketStatus' || id === 'adminTicketCategory' || id === 'adminTicketDate') renderTickets();
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
    detailTab: params.get('crm') === 'license' ? 'license' : params.get('crm') === 'orders' ? 'payments' : undefined,
    licensePage: params.get('lic') === 'history' ? 'history' : (params.get('crm') === 'license' ? 'status' : undefined),
    cmsTab: params.get('cms') || undefined,
    cmsId: params.get('post') || undefined
  });
  window.addEventListener('hashchange', () => {
    const next = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    showView(next.get('view') || 'home', {
      logsTab: next.get('log') || undefined,
      ticketStatus: next.get('ticket') || undefined,
      uid: next.get('uid') || undefined,
      crmMode: next.get('crm') || undefined,
      detailTab: next.get('crm') === 'license' ? 'license' : next.get('crm') === 'orders' ? 'payments' : undefined,
      licensePage: next.get('lic') === 'history' ? 'history' : (next.get('crm') === 'license' ? 'status' : undefined),
      cmsTab: next.get('cms') || undefined,
      cmsId: next.get('post') || undefined
    });
  });
}

document.addEventListener('DOMContentLoaded', bind);
