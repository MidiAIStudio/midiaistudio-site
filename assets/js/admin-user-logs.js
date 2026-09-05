/**
 * Admin: 사용자별 통합 로그 (독립 화면)
 * Existing CRM / Timeline / Recent Activity are left untouched.
 */
const PAGE_SIZE = 80;
const USER_LIST_LIMIT = 80;
const LOGS_UID_KEY = 'midiai-admin-logs-uid';
const TABS = [
  { id: 'all', label: '전체' },
  { id: 'license', label: '라이선스' },
  { id: 'admin', label: '관리자 작업' },
  { id: 'message', label: '쪽지/알림' },
  { id: 'payment', label: '결제' },
  { id: 'credit', label: '크레딧 사용내역' },
  { id: 'app', label: '앱 사용' },
  { id: 'hwid', label: 'HWID/기기' },
  { id: 'ticket', label: '문의' }
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

/** Display-only labels. Do not write these back to Firestore. */
const LOG_FEATURE_LABELS = {
  midi_editor_export: 'MIDI 편집 내보내기',
  midi_editor_full_export: 'MIDI 편집 전체 내보내기',
  midieditorfullexport: 'MIDI 편집 전체 내보내기',
  score_editor_export: '악보 편집 내보내기',
  score_editor_full_export: '악보 편집 전체 내보내기',
  scoreeditorfullexport: '악보 편집 전체 내보내기',
  piano_full_convert: 'Piano 전체 변환',
  pianofullconvert: 'Piano 전체 변환',
  orchestra_full_convert: 'Orchestra 전체 변환',
  orchestrafullconvert: 'Orchestra 전체 변환',
  youtube_to_midi: 'YouTube → MIDI 변환',
  audio_to_midi: '오디오 → MIDI 변환',
  pdf_to_midi: 'PDF → MIDI 변환',
  musicxml_export: 'MusicXML 내보내기',
  library_save: '라이브러리 저장',
  midi_editor: 'MIDI 편집',
  score_editor: '악보 편집'
};
const LOG_DURATION_LABELS = {
  over_60s: '60초 초과',
  over60s: '60초 초과',
  under_60s: '60초 이하',
  under60s: '60초 이하',
  below_60s: '60초 이하',
  le_60s: '60초 이하'
};
const LOG_PLAN_LABELS = {
  lifetime: '평생',
  trial: '체험판',
  period: '기간제',
  banned: '정지'
};
const LOG_TOKEN_LABELS = {
  midi: 'MIDI',
  editor: '편집',
  export: '내보내기',
  full: '전체',
  convert: '변환',
  score: '악보',
  piano: 'Piano',
  orchestra: 'Orchestra',
  youtube: 'YouTube',
  audio: '오디오',
  pdf: 'PDF',
  musicxml: 'MusicXML',
  library: '라이브러리',
  save: '저장',
  open: '열기',
  preview: '미리보기',
  login: '로그인'
};

function looksLikeEventId(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true;
  if (/^[0-9a-f]{16,}$/i.test(v)) return true;
  if (/^[0-9a-f-]{8,}\.\.\.$/i.test(v)) return true;
  return false;
}

function logLabelKey(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function formatAdminLogLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-') return raw;
  if (looksLikeEventId(raw)) return '';
  const key = logLabelKey(raw);
  if (LOG_FEATURE_LABELS[key] || LOG_FEATURE_LABELS[raw]) return LOG_FEATURE_LABELS[key] || LOG_FEATURE_LABELS[raw];
  if (LOG_DURATION_LABELS[key]) return LOG_DURATION_LABELS[key];
  if (LOG_PLAN_LABELS[key]) return LOG_PLAN_LABELS[key];
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/i.test(raw) || /^[a-z]+[A-Z]/.test(raw) || /[-]/.test(raw) && /^[a-z0-9-]+$/i.test(raw)) {
    const tokens = raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/);
    return tokens.map((t) => LOG_TOKEN_LABELS[t.toLowerCase()] || t).join(' ').replace(/\s+/g, ' ').trim();
  }
  return raw;
}

export function formatAdminLogAction(row) {
  const raw = row?.raw || {};
  const code = raw.feature || row?.columns?.work || row?.action;
  const labeled = formatAdminLogLabel(code);
  return labeled || row?.action || '-';
}

export function formatAdminLogSummary(row) {
  const raw = row?.raw || {};
  if (row?.category === 'app' || raw.feature || raw.durationCategory) {
    const parts = [
      formatAdminLogLabel(raw.durationCategory),
      formatAdminLogLabel(raw.licensePlan),
      raw.appVersion ? `앱 ${raw.appVersion}` : ''
    ].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  const bits = String(row?.summary || '')
    .split(/\s*·\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => formatAdminLogLabel(s))
    .filter(Boolean);
  if (bits.length) return bits.join(' · ');
  return row?.summary || '-';
}

function $(id) { return document.getElementById(id); }

let api = {
  db: null,
  fs: null,
  isAdmin: () => false,
  getActor: () => ({ uid: '', email: '' }),
  getUsers: () => [],
  getLicense: () => null,
  getOrders: () => [],
  getTickets: () => [],
  callAdminFunction: null
};

let booted = false;
let selectedUid = '';
let activeTab = 'all';
let dateRange = 'all';
let tableQuery = '';
let userQuery = '';
let userFilter = 'all';
let loadToken = 0;
let allRows = [];
let visibleLimit = PAGE_SIZE;
let expandedId = '';
let loading = false;
let lastError = '';

function tsMs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  if (v?.atMs) return Number(v.atMs) || 0;
  const d = v instanceof Date ? v : new Date(v);
  const n = d.getTime();
  return Number.isFinite(n) ? n : 0;
}

function fmtAgo(ms) {
  if (!ms) return '';
  const d = Date.now() - ms;
  if (d < 0) return fmtTs(ms);
  if (d < 60000) return '방금';
  if (d < 3600000) return `${Math.floor(d / 60000)}분 전`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}시간 전`;
  if (d < 7 * 86400000) return `${Math.floor(d / 86400000)}일 전`;
  try {
    return new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return '';
  }
}

function lastSeenMs(u) {
  return tsMs(u?.lastLogin || u?.lastSeenAt || u?.updatedAt || 0);
}

function fmtTs(ms) {
  if (!ms) return '-';
  try {
    return new Date(ms).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  } catch {
    return '-';
  }
}

function maskHwid(hwid) {
  const s = String(hwid || '');
  if (!s) return '(없음)';
  if (s.length <= 10) return `${s.slice(0, 2)}${'*'.repeat(Math.max(4, s.length - 2))}`;
  return `${s.slice(0, 4)}${'*'.repeat(8)}${s.slice(-4)}`;
}

function truncate(s, n = 72) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function makeRow(partial) {
  const id = partial.id || `row_${partial.category}_${partial.timestamp || 0}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    timestamp: Number(partial.timestamp) || 0,
    category: partial.category || 'other',
    action: partial.action || '-',
    summary: partial.summary || '',
    actor: partial.actor || '-',
    result: partial.result || '-',
    before: partial.before ?? '',
    after: partial.after ?? '',
    source: partial.source || '',
    raw: partial.raw || null,
    columns: partial.columns || null
  };
}

function categoryLabel(cat) {
  return ({
    all: '전체',
    license: '라이선스',
    admin: '관리자',
    message: '쪽지',
    payment: '결제',
    credit: '크레딧',
    app: '앱',
    hwid: 'HWID',
    ticket: '문의',
    user: '계정'
  })[cat] || cat;
}

function sanitizeCreditTitle(raw) {
  let text = String(raw || '').replace(/\\/g, '/').trim();
  if (!text) return '';
  if (/^[A-Za-z]:\//.test(text) || text.startsWith('/Users/') || text.startsWith('/home/') || text.includes('/Users/') || text.includes('/home/')) {
    text = text.split('/').filter(Boolean).pop() || text;
  } else if (text.includes('/') && /\.(mp3|wav|mid|midi|pdf|mp4|m4a|flac|ogg)$/i.test(text)) {
    text = text.split('/').filter(Boolean).pop() || text;
  }
  text = text.replace(/\b(jobId|paymentId|uid)\s*[:=]\s*\S+/ig, '').trim();
  return text.slice(0, 120);
}

function creditKindLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'purchase') return '구매';
  if (t === 'admin_grant' || t === 'admin_bulk_credit') return '지급';
  if (t === 'admin_deduct' || t === 'admin_bulk_deduct') return '회수';
  if (t === 'refund') return '반환';
  if (t === 'conversion') return '사용';
  return '기타';
}

function creditLedgerTitle(row) {
  const type = String(row?.type || '').toLowerCase();
  const title = sanitizeCreditTitle(row?.displayTitle || '');
  if (type === 'refund') return '변환 실패 반환';
  if (type === 'admin_grant' || type === 'admin_bulk_credit') return title || '관리자 크레딧 지급';
  if (type === 'admin_deduct' || type === 'admin_bulk_deduct') return title || '관리자 크레딧 회수';
  if (type === 'purchase') return title || '크레딧 구매';
  return title || 'AI 변환';
}

function formatCreditDelta(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

function creditActor(row) {
  const type = String(row?.type || '').toLowerCase();
  const adminUid = String(row?.adminUid || '').trim();
  if (adminUid) {
    const users = api.getUsers() || [];
    const admin = users.find((u) => u.uid === adminUid);
    return admin?.email || admin?.displayName || adminUid;
  }
  if (type === 'admin_grant' || type === 'admin_bulk_credit' || type === 'admin_deduct' || type === 'admin_bulk_deduct') {
    return '관리자';
  }
  if (type === 'refund') return '시스템';
  return '사용자';
}

function mapCreditLedgerApiRow(row) {
  const id = String(row?.id || row?.ledgerId || '').trim()
    || `api_${Math.random().toString(36).slice(2, 10)}`;
  return mapCreditLedgerDoc(id, {
    type: row?.type,
    amount: row?.amount,
    creditAmount: row?.creditAmount ?? row?.amount,
    displayTitle: row?.displayTitle,
    reason: row?.reason,
    createdAt: row?.createdAt,
    balanceBefore: row?.balanceBefore,
    balanceAfter: row?.balanceAfter,
    adminUid: row?.adminUid,
    productId: row?.productId,
    paymentId: row?.paymentId,
    jobId: row?.jobId
  }, 'creditLedgerV2');
}

async function fetchCreditLedgerRowsFromFirestore(uid) {
  const { collection, getDocs, query, where, orderBy, limit } = api.fs;
  const merged = [];
  const seen = new Set();

  async function loadLedgerCollection(collectionName, rowLimit = 200) {
    let docs = [];
    try {
      const snap = await getDocs(query(
        collection(api.db, collectionName),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(rowLimit)
      ));
      docs = snap.docs;
    } catch (e) {
      console.warn(`${collectionName} indexed query failed, fallback`, e);
      const snap = await getDocs(query(
        collection(api.db, collectionName),
        where('uid', '==', uid),
        limit(rowLimit)
      ));
      docs = snap.docs.slice().sort((a, b) => tsMs(b.data()?.createdAt) - tsMs(a.data()?.createdAt));
    }
    for (const d of docs) {
      const key = `${collectionName}/${d.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ doc: d, collectionName });
    }
  }

  await loadLedgerCollection('creditLedgerV2', 200);
  await loadLedgerCollection('creditLedger', 50);
  merged.sort((a, b) => tsMs(b.doc.data()?.createdAt) - tsMs(a.doc.data()?.createdAt));
  return merged.slice(0, 200).map(({ doc, collectionName }) =>
    mapCreditLedgerDoc(doc.id, doc.data(), collectionName)
  );
}

async function fetchCreditLedgerRows(uid) {
  if (typeof api.callAdminFunction === 'function') {
    try {
      const data = await api.callAdminFunction(
        ['adminCreditOverview', 'adminPointOverview'],
        { targetUid: uid, ledgerLimit: 200 }
      );
      const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
      if (ledger.length) {
        const apiRows = ledger.map((row) => mapCreditLedgerApiRow(row));
        let legacyRows = [];
        try {
          legacyRows = await fetchCreditLedgerRowsFromFirestore(uid);
          legacyRows = legacyRows.filter((r) => String(r.source || '') === 'creditLedger');
        } catch (e) {
          console.warn('admin credit legacy ledger', e);
        }
        const seen = new Set(apiRows.map((r) => r.id));
        for (const row of legacyRows) {
          if (!seen.has(row.id)) apiRows.push(row);
        }
        apiRows.sort((a, b) => b.timestamp - a.timestamp);
        return apiRows.slice(0, 200);
      }
    } catch (e) {
      console.warn('admin credit ledger API', e);
      lastError = lastError || `creditLedger API: ${e.message || e}`;
    }
  }
  return fetchCreditLedgerRowsFromFirestore(uid);
}

function mapCreditLedgerDoc(id, data, sourceCollection = 'creditLedgerV2') {
  const row = data || {};
  const amount = Number(row.amount || row.creditAmount || 0);
  const type = String(row.type || 'conversion');
  const title = creditLedgerTitle(row);
  const kind = creditKindLabel(type);
  const before = row.balanceBefore != null && Number.isFinite(Number(row.balanceBefore))
    ? String(Number(row.balanceBefore))
    : '';
  const after = row.balanceAfter != null && Number.isFinite(Number(row.balanceAfter))
    ? String(Number(row.balanceAfter))
    : '';
  return makeRow({
    id: `credit_${sourceCollection}_${id}`,
    timestamp: tsMs(row.createdAt),
    category: 'credit',
    action: title,
    summary: [kind, formatCreditDelta(amount), after ? `잔액 ${after}` : ''].filter(Boolean).join(' · '),
    actor: creditActor(row),
    result: amount < 0 ? (type === 'refund' ? '반환' : '차감') : '적립',
    before,
    after,
    source: sourceCollection,
    raw: { id, creditSystemVersion: sourceCollection === 'creditLedgerV2' ? 2 : 1, ...row },
    columns: {
      kind,
      type,
      title,
      delta: formatCreditDelta(amount),
      amount,
      balance: after || '-',
      reason: row.reason || '',
      productId: row.productId || '',
      paymentId: row.paymentId || ''
    }
  });
}

function planLabel(p) {
  const s = String(p || '').toLowerCase();
  if (s === 'lifetime') return '평생';
  if (s === 'trial') return '체험판';
  if (s === 'period' || s === 'monthly') return '기간제';
  return p || '-';
}

function licenseStatusKo(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'active' || v === 'inactive') return '활성';
  if (v === 'expired' || v === 'refunded') return '만료';
  if (v === 'banned' || v === 'suspended') return '차단';
  return s || '-';
}

function planBadgeHtml(plan) {
  const s = String(plan || '').toLowerCase();
  if (s === 'lifetime') return `<span class="crm-badge is-lifetime"><i></i>평생</span>`;
  if (s === 'period' || s === 'monthly') return `<span class="crm-badge is-period"><i></i>기간제</span>`;
  if (s === 'trial') return `<span class="crm-badge is-trial"><i></i>체험판</span>`;
  if (plan) return `<span class="crm-badge is-none"><i></i>${esc(planLabel(plan))}</span>`;
  return '';
}

function statusBadgeHtml(status) {
  const v = String(status || '').toLowerCase();
  if (!v || v === '-') return '';
  if (v === 'expired' || v === 'refunded') return `<span class="crm-badge is-expired"><i></i>만료</span>`;
  if (v === 'banned' || v === 'suspended') return `<span class="crm-badge is-banned"><i></i>차단</span>`;
  if (v === 'active' || v === 'inactive') return `<span class="crm-badge is-active"><i></i>활성</span>`;
  return `<span class="crm-badge is-none"><i></i>${esc(status)}</span>`;
}

function statusLabel(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'completed' || v === 'paid') return '결제완료';
  if (v === 'created' || v === 'pending') return '대기';
  if (v === 'refunded' || v === 'duplicate_refunded') return '환불';
  if (v === 'failed' || v === 'duplicate_refund_failed') return '실패';
  if (v === 'cancelled' || v === 'canceled') return '취소';
  return s || '-';
}

function inDateRange(ms) {
  if (!ms || dateRange === 'all') return true;
  const now = Date.now();
  if (dateRange === 'today') {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return ms >= d.getTime();
  }
  if (dateRange === '7d') return ms >= now - 7 * 86400000;
  if (dateRange === '30d') return ms >= now - 30 * 86400000;
  return true;
}

function userUid(u) {
  return String(u?.uid || u?.id || '');
}

function findUser(uid) {
  const s = String(uid || '');
  return (api.getUsers() || []).find((u) => {
    return String(u.uid || '') === s || String(u.id || '') === s;
  }) || null;
}

/** Write durable admin audit log (admin-only collection). */
export async function writeAdminAuditLog(entry = {}) {
  try {
    if (!api.db || !api.fs || !api.isAdmin()) return null;
    const actor = api.getActor() || {};
    const { collection, addDoc, serverTimestamp } = api.fs;
    const targetUserId = String(entry.targetUserId || '').trim();
    if (!targetUserId) return null;
    const payload = {
      timestamp: serverTimestamp(),
      targetUserId,
      targetEmail: String(entry.targetEmail || findUser(targetUserId)?.email || ''),
      category: String(entry.category || 'admin'),
      action: String(entry.action || 'unknown'),
      actorType: String(entry.actorType || 'admin'),
      actorId: String(entry.actorId || actor.uid || ''),
      actorEmail: String(entry.actorEmail || actor.email || ''),
      before: entry.before == null ? null : entry.before,
      after: entry.after == null ? null : entry.after,
      result: String(entry.result || 'success'),
      summary: String(entry.summary || entry.action || ''),
      metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}
    };
    const ref = await addDoc(collection(api.db, 'adminAuditLogs'), payload);
    return ref.id;
  } catch (e) {
    console.error('writeAdminAuditLog', e);
    return null;
  }
}

export function configureAdminUserLogs(next = {}) {
  if (next.db) api.db = next.db;
  if (next.firestoreApi) api.fs = next.firestoreApi;
  if (typeof next.isAdmin === 'function') api.isAdmin = next.isAdmin;
  else if (next.isAdmin != null) api.isAdmin = () => !!next.isAdmin;
  if (typeof next.getActor === 'function') api.getActor = next.getActor;
  if (typeof next.getUsers === 'function') api.getUsers = next.getUsers;
  if (typeof next.getLicense === 'function') api.getLicense = next.getLicense;
  if (typeof next.getOrders === 'function') api.getOrders = next.getOrders;
  if (typeof next.getTickets === 'function') api.getTickets = next.getTickets;
  if (typeof next.callAdminFunction === 'function') api.callAdminFunction = next.callAdminFunction;
  else if (next.callAdminFunction === null) api.callAdminFunction = null;
}

export function initAdminUserLogs(next = {}) {
  configureAdminUserLogs(next);
  ensureBoot();
  renderUserList();
}

function ensureBoot() {
  if (booted) return;
  booted = true;
  bindUi();
  renderTabs();
  renderUserList();
  renderMain();
}

function bindUi() {
  const search = $('adminLogsUserSearch');
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    search.addEventListener('input', () => {
      userQuery = search.value.trim().toLowerCase();
      renderUserList();
    });
  }
  const filters = $('adminLogsUserFilters');
  if (filters && !filters.dataset.bound) {
    filters.dataset.bound = '1';
    filters.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-logs-user-filter]');
      if (!btn) return;
      userFilter = btn.getAttribute('data-logs-user-filter') || 'all';
      filters.querySelectorAll('[data-logs-user-filter]').forEach((el) => {
        el.classList.toggle('is-active', el === btn);
      });
      renderUserList();
    });
  }
  const refresh = $('adminLogsRefreshBtn');
  if (refresh && !refresh.dataset.bound) {
    refresh.dataset.bound = '1';
    refresh.addEventListener('click', () => {
      renderUserList();
      if (selectedUid) loadSelectedLogs({ force: true });
    });
  }
  const tableSearch = $('adminLogsTableSearch');
  if (tableSearch && !tableSearch.dataset.bound) {
    tableSearch.dataset.bound = '1';
    tableSearch.addEventListener('input', () => {
      tableQuery = tableSearch.value.trim().toLowerCase();
      visibleLimit = PAGE_SIZE;
      renderTable();
      renderTabs();
    });
  }
  const dateSel = $('adminLogsDateFilter');
  if (dateSel && !dateSel.dataset.bound) {
    dateSel.dataset.bound = '1';
    dateSel.addEventListener('change', () => {
      dateRange = dateSel.value || 'all';
      visibleLimit = PAGE_SIZE;
      renderTable();
      renderTabs();
    });
  }
  const more = $('adminLogsLoadMore');
  if (more && !more.dataset.bound) {
    more.dataset.bound = '1';
    more.addEventListener('click', () => {
      visibleLimit += PAGE_SIZE;
      renderTable();
    });
  }
  const section = $('adminLogsSection');
  if (section && !section.dataset.bound) {
    section.dataset.bound = '1';
    section.addEventListener('click', (e) => {
      const copyRaw = e.target.closest('[data-logs-copy-id]');
      if (copyRaw) {
        e.preventDefault();
        e.stopPropagation();
        const raw = copyRawFor(copyRaw.getAttribute('data-logs-copy-id'));
        copyText(raw).then((ok) => flashBtn(copyRaw, ok ? '복사됨' : '실패'));
      }
    });
  }
  const list = $('adminLogsUserList');
  if (list && !list.dataset.keys) {
    list.dataset.keys = '1';
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const buttons = [...list.querySelectorAll('[data-logs-uid]')];
      if (!buttons.length) return;
      e.preventDefault();
      const cur = buttons.findIndex((b) => b.getAttribute('data-logs-uid') === selectedUid);
      const next = e.key === 'ArrowDown'
        ? Math.min(buttons.length - 1, Math.max(0, cur) + 1)
        : Math.max(0, (cur < 0 ? 0 : cur) - 1);
      const uid = buttons[next]?.getAttribute('data-logs-uid');
      if (uid) {
        selectUser(uid);
        buttons[next].focus();
      }
    });
  }
  bindTabs();
}

function bindTabs() {
  const host = $('adminLogsTabs');
  if (!host || host.dataset.bound) return;
  host.dataset.bound = '1';
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-logs-tab]');
    if (!btn || !host.contains(btn)) return;
    activeTab = btn.getAttribute('data-logs-tab') || 'all';
    expandedId = '';
    visibleLimit = PAGE_SIZE;
    renderTabs();
    renderTable();
    syncLogsHash();
  });
}

function renderTabs() {
  const host = $('adminLogsTabs');
  if (!host) return;
  bindTabs();
  const counts = countByCategory(selectedUid ? filterByDateAndSearch(allRows) : []);
  host.querySelectorAll('[data-logs-tab]').forEach((btn) => {
    const id = btn.getAttribute('data-logs-tab');
    const n = id === 'all' ? counts.all : (counts[id] || 0);
    btn.classList.toggle('is-active', activeTab === id);
    let em = btn.querySelector('em');
    if (!em) {
      em = document.createElement('em');
      btn.appendChild(em);
    }
    em.textContent = String(n);
  });
}

function filteredUsers() {
  const users = (api.getUsers() || []).slice();
  users.sort((a, b) => {
    const seen = lastSeenMs(b) - lastSeenMs(a);
    if (seen) return seen;
    return String(a.email || '').localeCompare(String(b.email || ''), 'ko');
  });
  return users.filter((u) => {
    if (!userMatchesFilter(u)) return false;
    if (!userQuery) return true;
    const hay = [u.email, u.displayName, u.uid, u.id].join(' ').toLowerCase();
    return hay.includes(userQuery);
  });
}

function userMatchesFilter(u) {
  if (userFilter === 'all') return true;
  const lic = api.getLicense(userUid(u));
  const plan = String(lic?.plan || '').toLowerCase();
  const status = String(lic?.status || '').toLowerCase();
  if (userFilter === 'banned') return status === 'banned' || status === 'suspended';
  if (userFilter === 'trial') return plan === 'trial';
  if (userFilter === 'lifetime') return plan === 'lifetime';
  if (userFilter === 'period') return plan === 'period' || plan === 'monthly';
  return true;
}

function renderUserList() {
  const host = $('adminLogsUserList');
  if (!host) return;
  const filtered = filteredUsers();
  const countEl = $('adminLogsUserCount');
  if (countEl) countEl.textContent = String(filtered.length);
  if (!filtered.length) {
    host.innerHTML = `<div class="admin-logs-empty">조건에 맞는 사용자가 없습니다.</div>`;
    return;
  }
  const extra = filtered.length > USER_LIST_LIMIT
    ? `<div class="admin-logs-empty">상위 ${USER_LIST_LIMIT}명만 표시합니다. 검색으로 좁혀 주세요.</div>`
    : '';
  host.innerHTML = filtered.slice(0, USER_LIST_LIMIT).map((u) => {
    const uid = userUid(u);
    const lic = api.getLicense(uid);
    const email = u.email || uid || '-';
    const name = u.displayName || '';
    const active = uid === selectedUid ? ' is-active' : '';
    const badges = `${planBadgeHtml(lic?.plan)}${statusBadgeHtml(lic?.status)}`;
    const seen = fmtAgo(lastSeenMs(u));
    const title = name ? `${name} · ${email}` : email;
    return `<button type="button" class="admin-logs-user${active}" data-logs-uid="${esc(uid)}" title="${esc(title)}">
      <span class="admin-logs-user-dot" aria-hidden="true"></span>
      <span class="admin-logs-user-text">
        <span class="admin-logs-user-email">${esc(name || email)}</span>
        ${name ? `<span class="admin-logs-user-sub">${esc(email)}</span>` : ''}
        <span class="admin-logs-user-plan">${badges || '<span class="admin-logs-user-plan-fallback">라이선스 없음</span>'}</span>
        ${seen ? `<span class="admin-logs-user-seen">${esc(seen)}</span>` : ''}
      </span>
    </button>`;
  }).join('') + extra;
  host.querySelectorAll('[data-logs-uid]').forEach((btn) => {
    btn.addEventListener('click', () => selectUser(btn.getAttribute('data-logs-uid') || ''));
  });
}

function persistUid(uid) {
  try {
    if (uid) sessionStorage.setItem(LOGS_UID_KEY, uid);
    else sessionStorage.removeItem(LOGS_UID_KEY);
  } catch (_) {}
}

function restoreUid() {
  if (selectedUid) return true;
  try {
    const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const fromHash = hash.get('uid');
    if (fromHash) {
      selectUser(fromHash);
      return true;
    }
    const stored = sessionStorage.getItem(LOGS_UID_KEY) || '';
    if (stored) {
      selectUser(stored);
      return true;
    }
  } catch (_) {}
  return false;
}

function syncLogsHash() {
  try {
    const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    hash.set('view', 'logs');
    if (activeTab === 'all') hash.delete('log');
    else hash.set('log', activeTab);
    if (selectedUid) hash.set('uid', selectedUid);
    else hash.delete('uid');
    history.replaceState(null, '', `#${hash.toString()}`);
  } catch (_) {}
}

async function copyText(text) {
  const s = String(text || '');
  if (!s) return false;
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = s;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

function flashBtn(btn, label) {
  if (!btn) return;
  const prev = btn.dataset.prevLabel || btn.textContent;
  btn.dataset.prevLabel = prev;
  btn.textContent = label;
  clearTimeout(Number(btn.dataset.flashTimer || 0));
  btn.dataset.flashTimer = String(setTimeout(() => {
    btn.textContent = btn.dataset.prevLabel || prev;
  }, 1200));
}

function selectUser(uid) {
  if (!uid) return;
  if (uid === selectedUid) {
    loadSelectedLogs({ force: true });
    return;
  }
  selectedUid = uid;
  expandedId = '';
  visibleLimit = PAGE_SIZE;
  persistUid(uid);
  syncLogsHash();
  renderUserList();
  renderSelectedSummary();
  loadSelectedLogs({ force: true });
}

function renderSelectedSummary() {
  const box = $('adminLogsSelected');
  if (!box) return;
  if (!selectedUid) {
    box.hidden = false;
    box.innerHTML = `<p class="muted">왼쪽에서 회원을 선택하면 이력이 표시됩니다.</p>`;
    return;
  }
  // Selected-user identity chrome (avatar / UID·HWID / copy / member link) removed —
  // the left member list already shows who is selected.
  box.hidden = true;
  box.innerHTML = '';
}

async function loadSelectedLogs({ force = false } = {}) {
  if (!selectedUid || !api.db || !api.fs || !api.isAdmin()) return;
  const token = ++loadToken;
  loading = true;
  lastError = '';
  renderTable();
  try {
    const rows = await collectLogsForUser(selectedUid);
    if (token !== loadToken) return;
    allRows = rows.sort((a, b) => b.timestamp - a.timestamp);
    loading = false;
    renderTabs();
    renderTable();
  } catch (e) {
    if (token !== loadToken) return;
    console.error('loadSelectedLogs', e);
    loading = false;
    lastError = e.message || String(e);
    allRows = [];
    renderTabs();
    renderTable();
  }
}

async function safeQuery(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`admin logs ${label}`, e);
    lastError = lastError || `${label}: ${e.message || e}`;
    return [];
  }
}

async function collectLogsForUser(uid) {
  const { collection, doc, getDoc, getDocs, query, where, orderBy, limit } = api.fs;
  const user = findUser(uid) || {};
  const email = user.email || '';
  const lic = api.getLicense(uid);
  const rows = [];

  // Account milestones from user doc (real fields only)
  if (user.createdAt) {
    rows.push(makeRow({
      id: `user_join_${uid}`,
      timestamp: tsMs(user.createdAt),
      category: 'app',
      action: '가입',
      summary: email || uid,
      actor: '사용자',
      result: '정상',
      source: 'users',
      raw: { createdAt: user.createdAt }
    }));
  }
  if (user.lastLogin || user.lastSeenAt) {
    rows.push(makeRow({
      id: `user_login_${uid}`,
      timestamp: tsMs(user.lastLogin || user.lastSeenAt),
      category: 'app',
      action: '최근 로그인',
      summary: email || uid,
      actor: '사용자',
      result: '정상',
      source: 'users',
      raw: { lastLogin: user.lastLogin, lastSeenAt: user.lastSeenAt }
    }));
  }

  // Current license snapshot (not a full history — only latest doc state)
  if (lic && (lic.updatedAt || lic.createdAt)) {
    rows.push(makeRow({
      id: `license_snap_${uid}`,
      timestamp: tsMs(lic.updatedAt || lic.createdAt),
      category: 'license',
      action: '라이선스 상태',
      summary: `${planLabel(lic.plan)} · ${licenseStatusKo(lic.status)} · ${lic.method || '-'}`,
      actor: lic.method === 'admin' || lic.method === 'manual' ? '관리자' : (lic.method || '시스템'),
      result: lic.status || '-',
      before: '',
      after: { plan: lic.plan, status: lic.status, method: lic.method, startsAt: lic.startsAt, expiresAt: lic.expiresAt },
      source: 'licenses',
      raw: lic
    }));
  }

  // Admin memo history on user doc
  const memoHist = Array.isArray(user.adminMemoHistory) ? user.adminMemoHistory : [];
  memoHist.forEach((h, i) => {
    rows.push(makeRow({
      id: `memo_${uid}_${i}_${h.atMs || i}`,
      timestamp: tsMs(h.atMs || h.at || 0),
      category: 'admin',
      action: '관리자 메모 변경',
      summary: truncate(h.text || '', 80),
      actor: h.by || '관리자',
      result: '성공',
      after: h.text || '',
      source: 'users.adminMemoHistory',
      raw: h
    }));
  });

  // Orders (reuse CRM cache first)
  const orders = (api.getOrders(uid) || []).slice();
  orders.forEach((o) => {
    const t = tsMs(o.completedAt || o.verifiedAt || o.issuedAt || o.updatedAt || o.createdAt);
    rows.push(makeRow({
      id: `order_${o.id}`,
      timestamp: t,
      category: 'payment',
      action: statusLabel(o.status),
      summary: `${o.productName || o.orderName || o.plan || '상품'} · ${o.provider || o.paymentMethod || '-'}`,
      actor: '사용자',
      result: statusLabel(o.status),
      source: 'orders',
      raw: o,
      columns: {
        product: o.productName || o.orderName || o.plan || '-',
        method: o.provider || o.paymentMethod || '-',
        amount: formatAmount(o),
        status: statusLabel(o.status),
        paymentId: o.paymentId || o.paypalOrderId || o.id || '-'
      }
    }));
  });

  // Tickets (reuse CRM cache)
  const tickets = (api.getTickets(uid) || []).slice();
  for (const t of tickets) {
    rows.push(makeRow({
      id: `ticket_${t.id}`,
      timestamp: tsMs(t.createdAt),
      category: 'ticket',
      action: '문의 작성',
      summary: t.title || t.id,
      actor: '사용자',
      result: t.status || 'open',
      source: 'supportTickets',
      raw: t
    }));
    if (t.updatedAt && tsMs(t.updatedAt) !== tsMs(t.createdAt)) {
      rows.push(makeRow({
        id: `ticket_upd_${t.id}`,
        timestamp: tsMs(t.updatedAt),
        category: 'ticket',
        action: '문의 상태/갱신',
        summary: t.title || t.id,
        actor: '시스템',
        result: t.status || '-',
        source: 'supportTickets',
        raw: t
      }));
    }
  }

  // Ticket replies (fetch, limited)
  const replyRows = await safeQuery('ticket-replies', async () => {
    const out = [];
    const top = tickets.slice(0, 25);
    for (const t of top) {
      try {
        const snap = await getDocs(query(
          collection(api.db, 'supportTickets', t.id, 'replies'),
          orderBy('createdAt', 'asc'),
          limit(40)
        ));
        snap.docs.forEach((d) => {
          const r = { id: d.id, ...d.data() };
          out.push(makeRow({
            id: `reply_${t.id}_${r.id}`,
            timestamp: tsMs(r.createdAt),
            category: 'ticket',
            action: r.role === 'admin' ? '관리자 답변' : '사용자 추가 문의',
            summary: truncate(r.content || '', 80),
            actor: r.role === 'admin' ? (r.displayName || '관리자') : '사용자',
            result: t.status || '-',
            source: 'supportTickets/replies',
            raw: { ticket: t, reply: r }
          }));
        });
      } catch (e) {
        console.warn('ticket replies', t.id, e);
      }
    }
    return out;
  });
  rows.push(...replyRows);

  // Notifications
  const notifRows = await safeQuery('notifications', async () => {
    const snap = await getDocs(query(
      collection(api.db, 'users', uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(100)
    ));
    return snap.docs.map((d) => {
      const n = { id: d.id, ...d.data() };
      const isAdminMsg = n.type === 'admin_message' || n.adminMessage === true;
      const isLicense = n.type === 'license_change';
      let category = 'message';
      let action = '알림';
      if (isAdminMsg) { category = 'message'; action = '쪽지 발송'; }
      else if (isLicense) { category = 'license'; action = '라이선스 알림'; }
      else if (n.type === 'ticket_reply') { category = 'ticket'; action = '문의 답변 알림'; }
      else if (n.type === 'notice') { action = '공지 알림'; }
      else if (n.type === 'patch_note') { action = '패치노트 알림'; }
      else if (n.type === 'board_comment') { action = '댓글 알림'; }
      else if (n.type === 'credit_purchase') { category = 'payment'; action = '크레딧 구매 알림'; }
      else if (n.type === 'credit_admin_grant') { category = 'payment'; action = '크레딧 지급 알림'; }
      else if (n.type === 'credit_admin_deduct') { category = 'payment'; action = '크레딧 회수 알림'; }
      else if (n.type === 'reservation_complete' || n.type === 'queue_done') { category = 'app'; action = '예약 변환 완료 알림'; }
      else if (n.type === 'reservation_failed') { category = 'app'; action = '예약 변환 실패 알림'; }
      return makeRow({
        id: `notif_${n.id}`,
        timestamp: tsMs(n.createdAt),
        category,
        action,
        summary: n.postTitle || n.preview || n.type || '',
        actor: n.actorName || (isAdminMsg ? '관리자' : '시스템'),
        result: n.read === true ? '읽음' : '미확인',
        source: 'users/notifications',
        raw: n,
        columns: {
          kind: isAdminMsg ? '쪽지' : '알림',
          title: n.postTitle || '-',
          sender: n.actorName || '-',
          read: n.read === true ? '읽음' : '미확인',
          readAt: '-'
        }
      });
    });
  });
  rows.push(...notifRows);

  // Usage proofs (app events written by desktop/Admin SDK)
  const proofRows = await safeQuery('usageProofs', async () => {
    const snap = await getDocs(query(
      collection(api.db, 'users', uid, 'usageProofs'),
      orderBy('createdAt', 'desc'),
      limit(100)
    ));
    return snap.docs.map((d) => {
      const p = { id: d.id, ...d.data() };
      return makeRow({
        id: `proof_${p.id}`,
        timestamp: tsMs(p.createdAt),
        category: 'app',
        action: p.feature || '앱 기능 사용',
        summary: [p.durationCategory, p.eventId].filter(Boolean).join(' · ') || '-',
        actor: '사용자',
        result: '정상',
        source: 'users/usageProofs',
        raw: p,
        columns: {
          work: p.feature || '-',
          version: p.appVersion || '-',
          device: '-',
          result: '정상'
        }
      });
    });
  });
  rows.push(...proofRows);

  // Usage aggregate (optional milestone markers — only if timestamps exist)
  await safeQuery('usage/paid', async () => {
    try {
      const snap = await getDoc(doc(api.db, 'users', uid, 'usage', 'paid'));
      if (!snap.exists()) return [];
      const u = snap.data() || {};
      if (u.firstPaidFeatureUsedAt) {
        rows.push(makeRow({
          id: `usage_first_${uid}`,
          timestamp: tsMs(u.firstPaidFeatureUsedAt),
          category: 'app',
          action: '유료 기능 최초 사용',
          summary: `총 ${u.paidFeatureUseCount || 0}회`,
          actor: '사용자',
          result: '정상',
          source: 'users/usage/paid',
          raw: u
        }));
      }
      if (u.lastPaidFeatureUsedAt) {
        rows.push(makeRow({
          id: `usage_last_${uid}`,
          timestamp: tsMs(u.lastPaidFeatureUsedAt),
          category: 'app',
          action: '유료 기능 최근 사용',
          summary: `총 ${u.paidFeatureUseCount || 0}회`,
          actor: '사용자',
          result: '정상',
          source: 'users/usage/paid',
          raw: u
        }));
      }
    } catch (e) {
      console.warn('usage/paid', e);
    }
    return [];
  });

  // Durable admin audit logs
  const auditRows = await safeQuery('adminAuditLogs', async () => {
    try {
      const snap = await getDocs(query(
        collection(api.db, 'adminAuditLogs'),
        where('targetUserId', '==', uid),
        orderBy('timestamp', 'desc'),
        limit(150)
      ));
      return snap.docs.map((d) => mapAuditDoc(d.id, d.data()));
    } catch (e) {
      // Fallback without composite index
      console.warn('adminAuditLogs indexed query failed, fallback', e);
      const snap = await getDocs(query(
        collection(api.db, 'adminAuditLogs'),
        where('targetUserId', '==', uid),
        limit(150)
      ));
      return snap.docs.map((d) => mapAuditDoc(d.id, d.data()))
        .sort((a, b) => b.timestamp - a.timestamp);
    }
  });
  rows.push(...auditRows);

  // Credit V2 ledger (authoritative) via Admin Functions API + legacy V1 Firestore fallback.
  const ledgerRows = await safeQuery('creditLedgerV2', () => fetchCreditLedgerRows(uid));
  rows.push(...ledgerRows);

  // Deduplicate near-identical license snapshot vs license_change notif is fine (different sources)
  return dedupeRows(rows);
}

function mapAuditDoc(id, data) {
  const cat = String(data.category || 'admin');
  const beforeStr = formatDisplayVal(data.before) || stringifyVal(data.before);
  const afterStr = formatDisplayVal(data.after) || stringifyVal(data.after);
  const summary = data.summary
    || [beforeStr && afterStr ? `${beforeStr} → ${afterStr}` : '', data.action].filter(Boolean).join(' · ');
  const afterObj = parseMaybeJson(data.after);
  const creditAmount = (afterObj && typeof afterObj === 'object' && afterObj.amount != null)
    ? Number(afterObj.amount)
    : null;
  const creditColumns = (cat === 'credit' && creditAmount != null && Number.isFinite(creditAmount))
    ? {
      kind: creditKindLabel(creditAmount > 0 ? 'admin_grant' : 'admin_deduct'),
      type: String(data.action || '').toLowerCase(),
      title: summary,
      delta: formatCreditDelta(creditAmount),
      amount: creditAmount,
      balance: (afterObj.balance != null && Number.isFinite(Number(afterObj.balance)))
        ? String(Number(afterObj.balance))
        : '-',
      reason: String(afterObj.reason || '')
    }
    : null;
  return makeRow({
    id: `audit_${id}`,
    timestamp: tsMs(data.timestamp),
    category: cat === 'user' ? 'admin' : cat,
    action: data.action || '관리자 작업',
    summary,
    actor: data.actorEmail || data.actorId || '관리자',
    result: data.result || 'success',
    before: data.before,
    after: data.after,
    source: 'adminAuditLogs',
    raw: { id, ...data },
    columns: creditColumns
  });
}

function stringifyVal(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function parseMaybeJson(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return v;
  try { return JSON.parse(s); } catch { return v; }
}

function formatDisplayVal(v) {
  const parsed = parseMaybeJson(v);
  if (parsed == null || parsed === '') return '';
  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') return String(parsed);
  if (Array.isArray(parsed)) return parsed.map(formatDisplayVal).filter(Boolean).join(', ');
  if (typeof parsed === 'object') {
    if (parsed.plan != null || parsed.status != null) {
      const parts = [];
      if (parsed.plan) parts.push(planLabel(parsed.plan));
      if (parsed.status) parts.push(licenseStatusKo(parsed.status));
      if (parsed.method) parts.push(parsed.method === 'admin' || parsed.method === 'manual' ? '관리자' : String(parsed.method));
      return parts.filter((p) => p && p !== '-').join(' · ') || '-';
    }
    const pairs = Object.entries(parsed)
      .filter(([, val]) => val != null && val !== '' && typeof val !== 'object')
      .slice(0, 4)
      .map(([k, val]) => `${k} ${formatDisplayVal(val)}`);
    return pairs.join(' · ') || '-';
  }
  return stringifyVal(parsed);
}

function formatAmount(o) {
  const amount = o.amount ?? o.price ?? o.totalAmount;
  if (amount == null || amount === '') return '-';
  const cur = String(o.currency || 'KRW').toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  if (cur === 'KRW') return `${n.toLocaleString('ko-KR')}원`;
  return `${cur} ${n.toLocaleString('en-US')}`;
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = r.id || `${r.source}|${r.timestamp}|${r.action}|${r.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function filterByDateAndSearch(rows) {
  const q = tableQuery;
  return (rows || []).filter((r) => {
    if (!inDateRange(r.timestamp)) return false;
    if (!q) return true;
    const hay = [
      r.action, r.summary, r.actor, r.result, r.category,
      formatAdminLogAction(r), formatAdminLogSummary(r),
      stringifyVal(r.before), stringifyVal(r.after),
      formatDisplayVal(r.before), formatDisplayVal(r.after),
      r.columns?.kind, r.columns?.title, r.columns?.delta, r.columns?.reason, r.columns?.type
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function countByCategory(rows) {
  const counts = { all: rows.length, license: 0, admin: 0, message: 0, payment: 0, credit: 0, app: 0, hwid: 0, ticket: 0 };
  rows.forEach((r) => {
    if (counts[r.category] != null) counts[r.category] += 1;
  });
  counts.admin = rows.filter((r) =>
    r.category === 'admin'
    || r.source === 'adminAuditLogs'
    || r.source === 'users.adminMemoHistory'
  ).length;
  return counts;
}

function rowsForActiveTab() {
  const base = filterByDateAndSearch(allRows);
  if (activeTab === 'all') return base;
  if (activeTab === 'admin') {
    return base.filter((r) =>
      r.category === 'admin'
      || r.source === 'adminAuditLogs'
      || r.source === 'users.adminMemoHistory'
    );
  }
  return base.filter((r) => r.category === activeTab);
}

function renderMain() {
  renderSelectedSummary();
  renderTabs();
  renderTable();
}

function renderTable() {
  const host = $('adminLogsTableBody');
  const empty = $('adminLogsEmpty');
  const meta = $('adminLogsTableMeta');
  const more = $('adminLogsLoadMore');
  if (!host) return;

  if (!selectedUid) {
    host.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      empty.textContent = '왼쪽에서 회원을 선택하면 이력이 표시됩니다.';
    }
    if (meta) meta.textContent = '';
    if (more) more.hidden = true;
    renderTableHead();
    return;
  }

  if (loading) {
    host.innerHTML = `<tr><td colspan="6" class="admin-logs-td-muted">불러오는 중…</td></tr>`;
    if (empty) empty.hidden = true;
    if (more) more.hidden = true;
    if (meta) meta.textContent = '';
    renderTableHead();
    return;
  }

  const rows = rowsForActiveTab();
  const slice = rows.slice(0, visibleLimit);
  renderTableHead();

  if (!slice.length) {
    host.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      empty.textContent = lastError
        ? `로그를 불러오지 못했습니다. ${lastError}`
        : '이 조건에 맞는 기록이 없습니다. 탭을 바꿔 보세요.';
    }
    if (meta) meta.textContent = lastError ? '일부 소스 오류 가능' : '';
    if (more) more.hidden = true;
    return;
  }

  if (empty) empty.hidden = true;
  if (meta) {
    meta.textContent = lastError ? '일부 소스 오류' : '';
  }
  if (more) more.hidden = rows.length <= visibleLimit;

  host.innerHTML = slice.map((r) => rowHtml(r)).join('');
  host.querySelectorAll('[data-logs-row]').forEach((tr) => {
    tr.addEventListener('click', () => {
      const id = tr.getAttribute('data-logs-row') || '';
      expandedId = expandedId === id ? '' : id;
      renderTable();
    });
  });
}

function renderTableHead() {
  const head = $('adminLogsTableHead');
  if (!head) return;
  const cols = headColsForTab(activeTab);
  head.innerHTML = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
}

function headColsForTab(tab) {
  if (tab === 'license') return ['일시', '작업', '이전 값', '변경 값', '처리자', '결과'];
  if (tab === 'admin') return ['일시', '처리자', '작업', '이전→변경', '결과', '대상'];
  if (tab === 'message') return ['일시', '종류', '제목', '발송자', '읽음', '내용'];
  if (tab === 'payment') return ['일시', '상품', '결제수단', '금액', '상태', '결제 ID'];
  if (tab === 'credit') return ['일시', '구분', '내역', '변동', '잔액', '처리자'];
  if (tab === 'app') return ['일시', '작업', '버전', '내용', '처리자', '결과'];
  if (tab === 'hwid') return ['일시', '작업', '이전 HWID', '변경 HWID', '처리자', '결과'];
  if (tab === 'ticket') return ['일시', '작업', '문의 제목', '처리자', '상태', '내용'];
  return ['일시', '구분', '작업', '내용', '처리자', '결과'];
}

function rowHtml(r) {
  const open = expandedId === r.id;
  const cells = cellsForTab(activeTab, r);
  const detail = open ? detailHtml(r) : '';
  return `<tr class="admin-logs-tr${open ? ' is-open' : ''}" data-logs-row="${esc(r.id)}">${
    cells.map((c) => `<td title="${esc(c.title || String(c.text || '').replace(/<[^>]+>/g, ''))}"><span class="${esc(c.cls || '')}">${c.html}</span></td>`).join('')
  }</tr>${detail}`;
}

function logActionCell(r) {
  const display = formatAdminLogAction(r);
  const orig = String(r.action || '');
  return { html: esc(display), text: display, title: orig && orig !== display ? orig : display };
}
function logSummaryCell(r, max = 48) {
  const display = formatAdminLogSummary(r);
  const orig = String(r.summary || '');
  return { html: esc(truncate(display, max)), text: display, title: orig && orig !== display ? orig : display };
}
function cellsForTab(tab, r) {
  const time = { html: esc(fmtTs(r.timestamp)), text: fmtTs(r.timestamp), cls: 'admin-logs-time' };
  if (tab === 'license') {
    return [
      time,
      logActionCell(r),
      { html: esc(truncate(formatDisplayVal(r.before) || '-', 40)), text: formatDisplayVal(r.before) },
      { html: esc(truncate(formatDisplayVal(r.after) || r.summary || '-', 48)), text: formatDisplayVal(r.after) || r.summary },
      { html: esc(r.actor), text: r.actor },
      { html: badge(r.result), text: r.result, cls: '' }
    ];
  }
  if (tab === 'admin') {
    const delta = [formatDisplayVal(r.before), formatDisplayVal(r.after)].filter(Boolean).join(' → ') || r.summary || '-';
    return [
      time,
      { html: esc(truncate(r.actor, 36)), text: r.actor },
      logActionCell(r),
      { html: esc(truncate(delta, 64)), text: delta },
      { html: badge(r.result), text: r.result },
      { html: esc(truncate(selectedUid, 18)), text: selectedUid }
    ];
  }
  if (tab === 'message') {
    const c = r.columns || {};
    const kind = c.kind || (r.action.includes('쪽지') ? '쪽지' : '알림');
    const title = c.title || r.raw?.postTitle || r.summary || '-';
    const body = r.raw?.preview || '';
    return [
      time,
      { html: badge(kind, 'cat'), text: kind },
      { html: esc(truncate(title, 56)), text: title },
      { html: esc(c.sender || r.actor), text: c.sender || r.actor },
      { html: badge(c.read || r.result), text: c.read || r.result },
      { html: esc(truncate(body, 72)), text: body }
    ];
  }
  if (tab === 'payment') {
    const c = r.columns || {};
    return [
      time,
      { html: esc(truncate(c.product || r.summary, 36)), text: c.product || r.summary },
      { html: esc(c.method || '-'), text: c.method },
      { html: esc(c.amount || '-'), text: c.amount },
      { html: badge(c.status || r.result), text: c.status || r.result },
      { html: esc(truncate(c.paymentId || '-', 22)), text: c.paymentId, cls: 'mono' }
    ];
  }
  if (tab === 'credit') {
    const c = r.columns || {};
    const amt = Number(c.amount);
    const deltaCls = amt > 0 ? 'admin-logs-delta is-plus' : amt < 0 ? 'admin-logs-delta is-minus' : 'admin-logs-delta';
    return [
      time,
      { html: badge(c.kind || '기타'), text: c.kind || '기타' },
      { html: esc(truncate(c.title || r.action, 48)), text: c.title || r.action },
      { html: esc(c.delta || '-'), text: c.delta, cls: deltaCls },
      { html: esc(c.balance || r.after || '-'), text: c.balance || r.after, cls: 'mono' },
      { html: esc(r.actor), text: r.actor }
    ];
  }
  if (tab === 'app') {
    const c = r.columns || {};
    return [
      time,
      logActionCell(r),
      { html: esc(c.version || r.raw?.appVersion || '-'), text: c.version || r.raw?.appVersion },
      logSummaryCell(r, 64),
      { html: esc(r.actor), text: r.actor },
      { html: badge(r.result), text: r.result }
    ];
  }
  if (tab === 'hwid') {
    const before = maskIfHwid(r.before);
    const after = maskIfHwid(r.after);
    return [
      time,
      logActionCell(r),
      { html: esc(before || '-'), text: before, cls: 'mono' },
      { html: esc(after || '-'), text: after, cls: 'mono' },
      { html: esc(r.actor), text: r.actor },
      { html: badge(r.result), text: r.result }
    ];
  }
  if (tab === 'ticket') {
    const title = r.raw?.ticket?.title || r.raw?.title || (r.action.includes('문의') ? r.summary : '-') || '-';
    return [
      time,
      logActionCell(r),
      { html: esc(truncate(title, 36)), text: title },
      { html: esc(r.actor), text: r.actor },
      { html: badge(r.result), text: r.result },
      logSummaryCell(r, 56)
    ];
  }
  return [
    time,
    { html: badge(categoryLabel(r.category), 'cat'), text: categoryLabel(r.category) },
    logActionCell(r),
    logSummaryCell(r, 72),
    { html: esc(truncate(r.actor, 24)), text: r.actor },
    { html: badge(r.result), text: r.result }
  ];
}

function maskIfHwid(v) {
  const s = stringifyVal(v);
  if (!s || s === '-' || s === '{}' || s === 'null') return '';
  if (/^[A-Fa-f0-9-]{8,}$/.test(s) || s.length >= 12) return maskHwid(s);
  return truncate(s, 40);
}

function badgeTone(text, kind) {
  const s = String(text || '').toLowerCase();
  if (kind === 'cat') return s || 'muted';
  if (/성공|정상|완료|결제완료|읽음|paid|success|active|ok/.test(s)) return 'ok';
  if (/실패|차단|만료|환불|fail|banned|expired|error|refund/.test(s)) return 'bad';
  if (/대기|미확인|pending|open|created/.test(s)) return 'warn';
  return 'muted';
}

function badge(text, kind = 'result') {
  const t = String(text || '-');
  return `<span class="admin-logs-badge admin-logs-badge-${esc(kind)} is-${esc(badgeTone(t, kind))}">${esc(t)}</span>`;
}

function copyRawFor(id) {
  const r = allRows.find((x) => x.id === id);
  try { return JSON.stringify(r?.raw || r || {}, null, 2); } catch { return ''; }
}

function isBlankDetail(v) {
  const s = String(v ?? '').trim();
  return !s || s === '-' || s === '{}' || s === 'null';
}

function pushDetail(list, label, value) {
  if (isBlankDetail(value)) return;
  const v = String(value).trim();
  if (list.some(([, existing]) => existing === v)) return;
  list.push([label, v]);
}

function detailSections(r) {
  const facts = [];
  const blocks = [];
  const raw = r.raw || {};
  const cat = r.category;
  pushDetail(facts, '일시', fmtTs(r.timestamp));
  if (cat === 'message') {
    const kind = r.columns?.kind || (String(r.action || '').includes('쪽지') ? '쪽지' : '알림');
    pushDetail(facts, '종류', kind);
    pushDetail(facts, '발송자', raw.actorName || r.columns?.sender || r.actor);
    pushDetail(facts, '상태', raw.read === true ? '읽음' : (r.result || '미확인'));
    const title = raw.postTitle || r.columns?.title || '';
    const body = raw.preview || raw.body || raw.content || '';
    pushDetail(blocks, '제목', title);
    if (body && body !== title) pushDetail(blocks, '내용', body);
    return { facts, blocks };
  }
  pushDetail(facts, '작업', formatAdminLogAction(r));
  pushDetail(facts, '처리자', r.actor);
  pushDetail(facts, '결과', r.result);
  if (cat === 'payment') {
    const c = r.columns || {};
    pushDetail(facts, '상품', c.product);
    pushDetail(facts, '결제수단', c.method);
    pushDetail(facts, '금액', c.amount);
    pushDetail(blocks, '결제 ID', c.paymentId);
    return { facts, blocks };
  }
  if (cat === 'credit') {
    const c = r.columns || {};
    pushDetail(facts, '구분', c.kind);
    pushDetail(facts, '변동', c.delta);
    pushDetail(facts, '이전 잔액', r.before);
    pushDetail(facts, '변경 잔액', r.after || c.balance);
    pushDetail(facts, '처리자', r.actor);
    pushDetail(blocks, '내역', c.title || r.action);
    pushDetail(blocks, '사유', c.reason);
    pushDetail(blocks, '상품', c.productId);
    pushDetail(blocks, '결제 ID', c.paymentId);
    return { facts, blocks };
  }
  if (cat === 'hwid') {
    pushDetail(blocks, '이전 HWID', stringifyVal(r.before));
    pushDetail(blocks, '변경 HWID', stringifyVal(r.after));
    return { facts, blocks };
  }
  if (cat === 'app') {
    pushDetail(facts, '앱 버전', raw.appVersion || r.columns?.version);
    pushDetail(blocks, '내용', formatAdminLogSummary(r));
    return { facts, blocks };
  }
  if (cat === 'ticket') {
    pushDetail(blocks, '제목', raw.ticket?.title || raw.title);
    pushDetail(blocks, '내용', raw.content || formatAdminLogSummary(r));
    return { facts, blocks };
  }
  const before = formatDisplayVal(r.before) || stringifyVal(r.before);
  const after = formatDisplayVal(r.after) || stringifyVal(r.after);
  pushDetail(blocks, '이전', before);
  pushDetail(blocks, '변경', after);
  const summary = formatAdminLogSummary(r);
  if (summary && summary !== before && summary !== after && summary !== formatAdminLogAction(r)) {
    pushDetail(blocks, '내용', summary);
  }
  return { facts, blocks };
}

function detailPairHtml(pairs, cls) {
  if (!pairs.length) return '';
  return `<dl class="${esc(cls)}">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function detailHtml(r) {
  const { facts, blocks } = detailSections(r);
  return `<tr class="admin-logs-detail-row"><td colspan="6">
    <div class="admin-logs-detail">
      <div class="admin-logs-detail-head">
        <span>상세</span>
        <button type="button" class="ghost mini-btn" data-logs-copy-id="${esc(r.id)}">원본 복사</button>
      </div>
      ${detailPairHtml(facts, 'admin-logs-detail-facts')}
      ${detailPairHtml(blocks, 'admin-logs-detail-blocks')}
    </div>
  </td></tr>`;
}

/** Called when CRM user list updates so left pane stays fresh. */
export function refreshAdminUserLogsUsers() {
  if (!booted) return;
  renderUserList();
  if (selectedUid) renderSelectedSummary();
}

export function showAdminUserLogsPanel(show) {
  const el = $('adminLogsSection');
  if (el) el.hidden = !show;
  if (show) {
    ensureBoot();
    renderUserList();
    if (selectedUid) loadSelectedLogs({ force: true });
    else if (!restoreUid()) renderMain();
  }
}

export function setAdminLogsTab(id) {
  const next = String(id || 'all');
  activeTab = TABS.some((t) => t.id === next) ? next : 'all';
  expandedId = '';
  visibleLimit = PAGE_SIZE;
  ensureBoot();
  renderTabs();
  renderTable();
}

export function selectAdminLogsUser(uid) {
  if (!uid) return;
  ensureBoot();
  selectUser(uid);
}
