/**
 * MidiAI Admin mobile ops — members, tickets, notices, version, audit.
 * Auth: approved + enabled adminDevices (deviceSecret).
 * License grant/block/HWID writes match web admin fields via Admin SDK + adminAuditLogs.
 * Writes go through Admin SDK and adminAuditLogs. Clients cannot self-authorize.
 */

'use strict';

const adminPush = require('./adminPush');
const adminCredits = require('./adminCredits');
const creditWalletV2 = require('./creditWalletV2');

const MEMBER_PAGE_SIZE = 10;
const MEMBER_LIMIT = MEMBER_PAGE_SIZE;
const USER_SCAN_CAP = 2000;
const RECENT_MEMBER_LIMIT = 5;
const TICKET_LIMIT = 30;
const AUDIT_LIMIT = 40;
const LICENSE_ITEMS = 30;
const CRM_URL = 'https://midiaistudio.com/admin.html#view=crm';
const TICKET_URL = 'https://midiaistudio.com/admin.html#view=support';
const NOTICE_URL = 'https://midiaistudio.com/admin.html#view=notices';

function httpError(status, message) {
  return adminPush.httpError(status, message);
}

function tsMs(value) {
  const dash = require('./adminMobileDashboard');
  return dash.tsMs(value);
}

function toIso(value) {
  const ms = tsMs(value);
  return ms ? new Date(ms).toISOString() : '';
}

function clamp(n, fallback, max) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(max, Math.max(1, Math.floor(v)));
}

async function assertApprovedDevice(db, body) {
  const found = await adminPush.assertDevice(db, body);
  const status = String((found.data && found.data.status) || '');
  if (status !== 'approved' || !found.data || found.data.enabled !== true) {
    throw httpError(403, '승인된 기기만 이용할 수 있습니다.');
  }
  return found;
}

function docsOf(snap) {
  if (!snap) return [];
  if (Array.isArray(snap.docs)) return snap.docs;
  return [];
}

async function safeQuery(fn) {
  try {
    return await fn();
  } catch (_) {
    return { docs: [], empty: true };
  }
}

function planLabel(plan, productId) {
  const p = String(plan || '').toLowerCase();
  if (p === 'lifetime') return 'Lifetime';
  if (p === 'trial') return 'Trial';
  const pid = String(productId || '').toUpperCase();
  if (pid.includes('90') || pid === 'PASS_90' || pid.includes('PASS_90D')) return '기간제 · 90일';
  if (pid.includes('7D') || pid === 'PASS_7' || pid.includes('PASS_7D')) return '기간제 · 7일';
  if (pid.includes('30') || pid === 'PASS_30' || pid.includes('PASS_30D')) return '기간제 · 30일';
  if (p === 'period') return '기간제';
  return plan || '—';
}

function licenseState(lic) {
  if (!lic) return { status: 'none', label: '없음', active: false };
  const st = String(lic.status || '').toLowerCase();
  const plan = String(lic.plan || '').toLowerCase();
  if (st === 'banned' || st === 'suspended' || lic.licensed === false && st === 'banned') {
    return { status: 'banned', label: '차단', active: false };
  }
  if (st === 'banned' || st === 'suspended') return { status: 'banned', label: '차단', active: false };
  if (plan === 'lifetime' && lic.licensed !== false && st !== 'banned') {
    return { status: 'lifetime', label: '평생', active: true };
  }
  const exp = tsMs(lic.expiresAt);
  if (exp && exp < Date.now()) return { status: 'expired', label: '만료', active: false };
  if (st === 'expired') return { status: 'expired', label: '만료', active: false };
  if (plan === 'trial') return { status: 'trial', label: '체험판', active: lic.licensed !== false };
  if (lic.licensed !== false && (st === 'active' || st === '' || st === 'inactive')) {
    return { status: 'active', label: '활성', active: true };
  }
  return { status: st || 'unknown', label: st || '확인 필요', active: !!lic.licensed };
}

function isLicenseDoc(lic) {
  if (!lic || typeof lic !== 'object') return false;
  return !!(
    lic.plan ||
    lic.status ||
    lic.licensed === true ||
    lic.licensed === false ||
    lic.expiresAt ||
    lic.startsAt ||
    lic.passProductId ||
    lic.productId ||
    lic.hwid
  );
}

function normalizePlan(lic) {
  if (!lic || !isLicenseDoc(lic)) return 'trial';
  const plan = String(lic.plan || '').toLowerCase().trim();
  if (plan === 'lifetime') return 'lifetime';
  if (lic.revokedAt && (plan === 'period' || plan === 'monthly')) return 'trial';
  if (plan === 'monthly') return 'period';
  if (!plan && tsMs(lic.expiresAt) && !lic.revokedAt) return 'period';
  if (plan === 'trial' || plan === 'period') return plan;
  return 'trial';
}

function normalizeStatus(lic) {
  if (!lic || !isLicenseDoc(lic)) return 'active';
  const status = String(lic.status || '').toLowerCase().trim();
  const plan = String(lic.plan || '').toLowerCase().trim();
  if (status === 'banned' || status === 'suspended') return 'banned';
  if (status === 'expired' || status === 'refunded' || status === 'revoked') return 'expired';
  if (lic.revokedAt && (plan === 'period' || plan === 'lifetime' || plan === 'monthly')) return 'expired';
  const exp = tsMs(lic.expiresAt);
  if ((status === 'active' || !status || status === 'none' || status === 'inactive') && exp && exp < Date.now()) {
    return 'expired';
  }
  return 'active';
}

function lastSeenMs(row) {
  return tsMs(row && (row.lastLogin || row.lastLoginAt || row.lastSeenAt || row.lastActiveAt)) || 0;
}

function mapMember(uid, user, lic, credits, extra) {
  const licenseDoc = isLicenseDoc(lic) ? lic : null;
  const state = licenseState(licenseDoc);
  const row = user || {};
  const creditN = Number(credits);
  const creditBalance = Number.isFinite(creditN) ? Math.max(0, Math.floor(creditN)) : 0;
  const normPlan = licenseDoc ? normalizePlan(licenseDoc) : '';
  return {
    uid: String(uid || ''),
    emailMasked: adminPush.maskEmail(row.email || row.payerEmail),
    displayName: adminPush.personName(row, uid),
    photoURL: adminPush.photoUrlOf(row) || undefined,
    joinedAt: toIso(user && (user.createdAt || user.joinedAt))
      || toIso(extra && extra.createTime)
      || undefined,
    lastLoginAt: toIso(user && (user.lastLogin || user.lastLoginAt || user.lastSeenAt)) || undefined,
    plan: normPlan,
    planLabel: licenseDoc ? planLabel(normPlan || licenseDoc.plan, licenseDoc.passProductId || licenseDoc.productId) : '없음',
    passProductId: String((licenseDoc && (licenseDoc.passProductId || licenseDoc.productId)) || ''),
    method: String((licenseDoc && licenseDoc.method) || ''),
    licenseStatus: state.status,
    licenseLabel: state.label,
    startsAt: toIso(licenseDoc && licenseDoc.startsAt) || undefined,
    expiresAt: toIso(licenseDoc && licenseDoc.expiresAt) || undefined,
    credits: creditBalance,
    adminUrl: CRM_URL
  };
}

function mapTicket(id, row) {
  const mode = String((row && row.conversationMode) || '').toLowerCase();
  const raw = String((row && row.status) || 'open').toLowerCase();
  let status = 'open';
  if (raw === 'closed' || mode === 'closed') status = 'closed';
  else if (mode === 'human' || raw === 'pending' || raw === 'in_progress') status = 'pending';
  else if (mode === 'waiting_human') status = 'open';
  else if (raw === 'open') status = 'open';
  return {
    inquiryId: String(id || ''),
    title: String((row && (row.title || row.subject)) || '(제목 없음)').slice(0, 120),
    emailMasked: adminPush.maskEmail(row && (row.email || row.payerEmail)),
    displayName: adminPush.personName(row, (row && row.uid) || ''),
    uid: String((row && row.uid) || ''),
    status,
    conversationMode: mode,
    category: String((row && row.category) || ''),
    createdAt: toIso(row && (row.humanRequestedAt || row.createdAt)) || undefined,
    updatedAt: toIso(row && row.updatedAt) || undefined,
    lastMessage: String((row && row.lastMessage) || '').slice(0, 180),
    adminUrl: TICKET_URL
  };
}

async function aggregationCount(query) {
  try {
    if (!query || typeof query.count !== 'function') return 0;
    const snap = await query.count().get();
    const data = snap && typeof snap.data === 'function' ? snap.data() : null;
    const n = data && data.count;
    return Number.isFinite(Number(n)) ? Number(n) : 0;
  } catch (_) {
    return 0;
  }
}

async function countLicenseStats(db, now) {
  const at = now instanceof Date ? now : new Date();
  const [active, trial, lifetime, period, banned, expiredStatus, pendingExpire, d7, d30, d90] = await Promise.all([
    aggregationCount(db.collection('licenses').where('licensed', '==', true)),
    aggregationCount(db.collection('licenses').where('plan', '==', 'trial')),
    aggregationCount(db.collection('licenses').where('plan', '==', 'lifetime')),
    aggregationCount(db.collection('licenses').where('plan', '==', 'period')),
    aggregationCount(db.collection('licenses').where('status', '==', 'banned')),
    aggregationCount(db.collection('licenses').where('status', '==', 'expired')),
    aggregationCount(db.collection('licenses').where('status', '==', 'active').where('expiresAt', '<=', at)),
    aggregationCount(db.collection('licenses').where('passProductId', '==', 'PASS_7D')),
    aggregationCount(db.collection('licenses').where('passProductId', '==', 'PASS_30D')),
    aggregationCount(db.collection('licenses').where('passProductId', '==', 'PASS_90D'))
  ]);
  return {
    active,
    trial,
    lifetime,
    period,
    banned,
    expired: expiredStatus + pendingExpire,
    d7,
    d30,
    d90,
    capped: false
  };
}

async function tryUserOrder(db, field, limit) {
  try {
    const snap = await db.collection('users').orderBy(field, 'desc').limit(limit).get();
    return docsOf(snap);
  } catch (_) {
    return [];
  }
}

async function loadRecentMemberDocs(db) {
  const merged = new Map();
  const fields = ['lastLogin', 'lastSeenAt', 'lastLoginAt'];
  for (const field of fields) {
    const rows = await tryUserOrder(db, field, RECENT_MEMBER_LIMIT);
    for (const doc of rows) {
      if (!merged.has(doc.id) && lastSeenMs(doc.data ? doc.data() : {}) > 0) {
        merged.set(doc.id, doc);
      }
    }
  }
  return [...merged.values()]
    .sort((a, b) => lastSeenMs(b.data ? b.data() : {}) - lastSeenMs(a.data ? a.data() : {}))
    .slice(0, RECENT_MEMBER_LIMIT);
}

async function fetchHomeExtraSnaps(db, bounds, now) {
  const signupCountQuery = db.collection('users')
    .where('createdAt', '>=', bounds.todayStart)
    .where('createdAt', '<', bounds.todayEnd);
  const [signupSnap, waitingSnap, signupCount, licenseCounts, recentMemberDocs] = await Promise.all([
    safeQuery(() => db.collection('users')
      .where('createdAt', '>=', bounds.todayStart)
      .where('createdAt', '<', bounds.todayEnd)
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get()),
    safeQuery(() => db.collection('supportTickets')
      .where('conversationMode', '==', 'waiting_human')
      .orderBy('humanRequestedAt', 'desc')
      .limit(20)
      .get()),
    aggregationCount(signupCountQuery),
    countLicenseStats(db, now),
    loadRecentMemberDocs(db)
  ]);
  const { licMap, walletMap } = await attachLicensesAndCredits(db, recentMemberDocs);
  return {
    signupSnap,
    waitingSnap,
    signupCount,
    licenseCounts,
    recentMemberDocs,
    recentLicMap: licMap,
    recentWalletMap: walletMap
  };
}

function assembleHomeExtras(bundle, seed) {
  const signupSnap = bundle && bundle.signupSnap;
  const waitingSnap = bundle && bundle.waitingSnap;
  const signupsToday = Number((bundle && bundle.signupCount) || 0);
  const licenseCounts = (bundle && bundle.licenseCounts) || {};
  const activeLicenses = Number(licenseCounts.active || 0);

  const activity = [];
  (seed.recentPayments || []).forEach((p) => {
    activity.push({
      type: 'payment',
      at: p.paidAt || p.paidAtMs,
      title: p.product || '결제',
      summary: `${p.displayName || p.emailMasked || ''} · ${p.grossAmount || p.amount || 0}`,
      entityId: p.paymentId
    });
  });
  (seed.recentInquiries || []).forEach((q) => {
    activity.push({
      type: 'inquiry',
      at: q.createdAt,
      title: q.title || '문의',
      summary: q.displayName || q.emailMasked || '',
      entityId: q.inquiryId
    });
  });
  docsOf(signupSnap).slice(0, 8).forEach((doc) => {
    const row = doc.data() || {};
    activity.push({
      type: 'signup',
      at: toIso(row.createdAt),
      title: '신규 가입',
      summary: adminPush.personName(row, doc.id),
      entityId: doc.id
    });
  });
  activity.sort((a, b) => tsMs(b.at) - tsMs(a.at));

  const attention = [];
  (seed.recentCritical || []).forEach((c) => {
    attention.push({
      type: 'critical',
      severity: 'alert',
      title: c.title || '중요 오류',
      summary: c.summary || '',
      at: c.timestamp,
      entityId: c.eventId
    });
  });
  docsOf(waitingSnap).forEach((doc) => {
    const t = mapTicket(doc.id, doc.data() || {});
    attention.push({
      type: 'inquiry',
      severity: 'warn',
      title: '답변 대기 문의',
      summary: t.title,
      at: t.updatedAt || t.createdAt,
      entityId: t.inquiryId
    });
  });
  if (seed.todayRefunds > 0) {
    attention.push({
      type: 'refund',
      severity: 'warn',
      title: '오늘 환불/취소',
      summary: `${seed.todayRefunds}건`,
      at: new Date().toISOString(),
      entityId: ''
    });
  }

  const recentMembers = mapUserDocs(
    bundle && bundle.recentMemberDocs,
    bundle && bundle.recentLicMap,
    bundle && bundle.recentWalletMap
  ).slice(0, RECENT_MEMBER_LIMIT);

  const waitingInquiryCount = docsOf(waitingSnap).length;
  const criticalOpenCount = Array.isArray(seed.recentCritical) ? seed.recentCritical.length : 0;
  const firstPurchasesToday = Number(seed.firstPurchasesToday || 0);
  const actionRequiredCount = waitingInquiryCount + criticalOpenCount;
  const command = {
    newMembersToday: signupsToday,
    firstPurchasesToday,
    waitingInquiryCount,
    criticalOpenCount,
    actionRequiredCount
  };

  return {
    todaySignups: signupsToday,
    activeLicenses,
    licenseStats: licenseCounts,
    activeLicensesCapped: false,
    attention: attention.slice(0, 8),
    activity: activity.slice(0, 12),
    recentMembers,
    waitingInquiryCount,
    criticalOpenCount,
    actionRequiredCount,
    firstPurchasesToday,
    command
  };
}

async function attachHomeExtras(db, bounds, seed, now) {
  const snaps = await fetchHomeExtraSnaps(db, bounds, now);
  return assembleHomeExtras(snaps, seed || {});
}

async function getDocsByIds(db, col, ids) {
  const unique = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  const map = new Map();
  if (!unique.length) return map;
  if (typeof db.getAll === 'function') {
    const snaps = await db.getAll(...unique.map((id) => db.collection(col).doc(id)));
    for (const snap of snaps) {
      map.set(snap.id, snap.exists ? (snap.data() || {}) : {});
    }
    return map;
  }
  await Promise.all(unique.map(async (id) => {
    const snap = await db.collection(col).doc(id).get();
    map.set(id, snap.exists ? (snap.data() || {}) : {});
  }));
  return map;
}

function docIdField() {
  try {
    const admin = require('firebase-admin');
    if (admin.firestore && admin.firestore.FieldPath && typeof admin.firestore.FieldPath.documentId === 'function') {
      return admin.firestore.FieldPath.documentId();
    }
  } catch (_) { /* unit tests without Admin SDK FieldPath */ }
  return '__name__';
}

function encodeCursor(payload) {
  if (!payload) return '';
  if (payload.o == null && !payload.id) return '';
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeCursor(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.o == null && !parsed.id) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function cursorTime(value) {
  if (value == null || value === '') return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : value;
}

function ymdKst(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: 'numeric'
  }).format(new Date(n));
}

function timedKindOf(member) {
  const pid = String((member && member.passProductId) || '').toUpperCase();
  const label = String((member && member.planLabel) || '');
  if (pid.includes('90') || label.includes('90')) return 'd90';
  if (pid.includes('7D') || pid === 'PASS_7' || label.includes('7일')) return 'd7';
  if (pid.includes('30')) return 'd30';
  return 'custom';
}

function memberMatchesFilters(member, lic, filter, timedFilter, statusFilter) {
  const plan = normalizePlan(lic);
  const st = normalizeStatus(lic);
  if (filter === 'trial' && plan !== 'trial') return false;
  if (filter === 'lifetime' && plan !== 'lifetime') return false;
  if (filter === 'period' || filter === 'timed') {
    if (plan !== 'period') return false;
    if (timedFilter && timedFilter !== 'all' && timedKindOf(member) !== timedFilter) return false;
  }
  if (statusFilter === 'banned' && st !== 'banned') return false;
  if (statusFilter === 'expired' && st !== 'expired') return false;
  if (statusFilter === 'active' && st !== 'active') return false;
  return true;
}

function syntheticUserDoc(id, data) {
  return {
    id: String(id),
    data: () => data || {},
    createTime: null
  };
}

async function attachLicensesAndCredits(db, userDocs) {
  const ids = (userDocs || []).map((d) => d.id).filter(Boolean);
  const licMap = new Map();
  const walletMap = new Map();
  if (!ids.length) return { licMap, walletMap };
  if (typeof db.getAll === 'function') {
    const refs = ids.map((id) => db.collection('licenses').doc(id))
      .concat(ids.map((id) => db.collection('creditWalletsV2').doc(id)));
    const snaps = await db.getAll(...refs);
    ids.forEach((id, i) => {
      const licSnap = snaps[i];
      const walSnap = snaps[ids.length + i];
      licMap.set(id, licSnap && licSnap.exists ? (licSnap.data() || {}) : {});
      walletMap.set(id, walSnap && walSnap.exists ? (walSnap.data() || {}) : {});
    });
    return { licMap, walletMap };
  }
  const [licenses, wallets] = await Promise.all([
    getDocsByIds(db, 'licenses', ids),
    getDocsByIds(db, 'creditWalletsV2', ids)
  ]);
  return { licMap: licenses, walletMap: wallets };
}

function mapUserDocs(userDocs, licMap, walletMap) {
  return (userDocs || []).map((doc) => mapMember(
    doc.id,
    doc.data ? (doc.data() || {}) : {},
    (licMap && licMap.get(doc.id)) || null,
    creditWalletV2.readBalanceV2((walletMap && walletMap.get(doc.id)) || {}),
    { createTime: doc.createTime }
  ));
}

async function queryUserPage(db, { pageSize, cursor, namePrefix }) {
  const take = pageSize + 1;
  const idField = docIdField();
  if (namePrefix) {
    const prefixSnap = await safeQuery(() => {
      let query = db.collection('users').orderBy('displayName').orderBy(idField)
        .startAt(namePrefix).endAt(namePrefix + '\uf8ff');
      if (cursor && cursor.id) query = query.startAfter(cursor.n || namePrefix, cursor.id);
      return query.limit(take).get();
    });
    const prefixed = docsOf(prefixSnap);
    if (prefixed.length) return prefixed;
    const nameEq = await safeQuery(() => db.collection('users').where('displayName', '==', namePrefix).limit(take).get());
    const named = docsOf(nameEq);
    if (named.length) return named;
    const alt = await safeQuery(() => db.collection('users').where('name', '==', namePrefix).limit(take).get());
    return docsOf(alt);
  }
  let snap = await safeQuery(() => {
    let query = db.collection('users').orderBy('createdAt', 'desc').orderBy(idField, 'desc');
    if (cursor && cursor.id) {
      const t = cursorTime(cursor.t);
      query = t ? query.startAfter(t, cursor.id) : query.startAfter(cursor.id);
    }
    return query.limit(take).get();
  });
  let rows = docsOf(snap);
  if (rows.length) return rows;
  snap = await safeQuery(() => {
    let query = db.collection('users').orderBy('createdAt', 'desc');
    if (cursor && cursor.id) {
      const t = cursorTime(cursor.t);
      query = t ? query.startAfter(t) : query;
    }
    return query.limit(take).get();
  });
  rows = docsOf(snap);
  if (rows.length) return rows;
  snap = await safeQuery(() => {
    let query = db.collection('users').orderBy(idField);
    if (cursor && cursor.id) query = query.startAfter(cursor.id);
    return query.limit(take).get();
  });
  return docsOf(snap);
}

async function queryLicensePage(db, { plan, passProductId, status, pageSize, cursor }) {
  const take = pageSize + 1;
  const idField = docIdField();
  const snap = await safeQuery(() => {
    let query = db.collection('licenses');
    if (plan) query = query.where('plan', '==', plan);
    if (passProductId) query = query.where('passProductId', '==', passProductId);
    if (status === 'banned') query = query.where('status', '==', 'banned');
    query = query.orderBy(idField);
    if (cursor && cursor.id) query = query.startAfter(cursor.id);
    return query.limit(take).get();
  });
  return docsOf(snap);
}

function nextCursorFromDocs(docs, pageSize, kind) {
  if (!docs || docs.length <= pageSize) return '';
  const last = docs[pageSize - 1];
  if (!last) return '';
  const row = last.data ? (last.data() || {}) : {};
  return encodeCursor({
    id: last.id,
    t: toIso(rowTime(row)) || '',
    n: String(row.displayName || ''),
    k: kind || 'createdAt'
  });
}

function rowTime(row) {
  return (row && (row.createdAt || row.joinedAt)) || null;
}

async function countUsers(db) {
  return aggregationCount(db.collection('users'));
}

async function scanAllUsers(db) {
  const idField = docIdField();
  try {
    const snap = await db.collection('users').orderBy(idField).limit(USER_SCAN_CAP).get();
    const rows = docsOf(snap);
    if (rows.length) return rows;
  } catch (_) { /* fall through to unordered scan */ }
  const snap = await db.collection('users').limit(USER_SCAN_CAP).get();
  return docsOf(snap);
}

function userDocMatchesQuery(doc, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const row = doc.data ? (doc.data() || {}) : {};
  const hay = `${row.displayName || ''} ${row.name || ''} ${row.email || ''} ${doc.id || ''}`.toLowerCase();
  return hay.indexOf(needle) >= 0;
}

async function collectUserDocs(db, q, pageSize) {
  const needle = String(q || '').trim();
  if (needle.includes('@')) {
    let snap = await db.collection('users').where('email', '==', needle).limit(pageSize + 1).get();
    let rows = docsOf(snap);
    if (!rows.length) {
      snap = await db.collection('users').where('emailLower', '==', needle.toLowerCase()).limit(pageSize + 1).get();
      rows = docsOf(snap);
    }
    return rows;
  }
  if (needle.length >= 16 && !/\s/.test(needle)) {
    const ids = [needle];
    const order = await db.collection('orders').doc(needle).get();
    if (order.exists) ids.push((order.data() || {}).uid);
    const byPay = await db.collection('orders').where('paymentId', '==', needle).limit(1).get();
    const payDoc = docsOf(byPay)[0];
    if (payDoc) ids.push((payDoc.data() || {}).uid);
    const hw = await db.collection('licenses').where('hwid', '==', needle).limit(5).get();
    for (const doc of docsOf(hw)) ids.push(doc.id);
    const userMap = await getDocsByIds(db, 'users', ids);
    return [...userMap.keys()].map((id) => syntheticUserDoc(id, userMap.get(id) || {}));
  }
  const all = await scanAllUsers(db);
  if (!needle) return all;
  return all.filter((doc) => userDocMatchesQuery(doc, needle));
}

function joinedSortMs(member) {
  const ms = tsMs(member && member.joinedAt);
  return ms || Number.MAX_SAFE_INTEGER;
}

function pageOffset(cursor, members) {
  if (!cursor) return 0;
  if (cursor.o != null && Number.isFinite(Number(cursor.o))) {
    return Math.max(0, Math.floor(Number(cursor.o)));
  }
  if (cursor.id) {
    const idx = (members || []).findIndex((m) => m.uid === cursor.id);
    return idx >= 0 ? idx + 1 : 0;
  }
  return 0;
}

async function getAdminMembers(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const q = String((body && body.q) || '').trim();
  const filter = String((body && (body.filter || body.planFilter)) || 'all').toLowerCase();
  const timedFilter = String((body && (body.timedFilter || body.timed)) || 'all').toLowerCase();
  const statusFilter = String((body && (body.statusFilter || body.status)) || 'all').toLowerCase();
  const pageSize = clamp(body && (body.pageSize || body.limit), MEMBER_PAGE_SIZE, MEMBER_PAGE_SIZE);
  const cursor = decodeCursor(body && body.cursor);
  const counted = await countUsers(db);
  const userDocs = await collectUserDocs(db, q, pageSize);
  const { licMap, walletMap } = await attachLicensesAndCredits(db, userDocs);
  let members = mapUserDocs(userDocs, licMap, walletMap);
  members = members.filter((m) => {
    const lic = licMap.get(m.uid);
    return memberMatchesFilters(m, lic, filter, timedFilter, statusFilter) && matchesQuery(m, q);
  });
  members.sort((a, b) => {
    const tb = joinedSortMs(b);
    const ta = joinedSortMs(a);
    if (tb !== ta) return tb - ta;
    return String(b.uid || '').localeCompare(String(a.uid || ''));
  });

  const offset = pageOffset(cursor, members);
  const total = members.length;
  const scanned = userDocs.length;
  const totalUsers = Number(counted || 0) > 0
    ? Number(counted)
    : Number(q ? total : scanned);
  const page = members.slice(offset, offset + pageSize);
  const hasMore = offset + page.length < total;
  const last = page[page.length - 1];
  const nextCursor = hasMore
    ? encodeCursor({ o: offset + pageSize, id: last && last.uid })
    : '';
  const pageCount = total > 0 ? Math.ceil(total / pageSize) : (hasMore ? 2 : 1);
  return {
    members: page,
    q,
    filter,
    timedFilter,
    statusFilter,
    pageSize,
    total: Number(total || 0),
    totalUsers: Number(totalUsers || 0),
    pageCount,
    hasMore,
    nextCursor,
    source: 'users'
  };
}

function matchesQuery(member, q) {
  const needle = String(q || '').trim();
  if (!needle) return true;
  if (needle.includes('@') || needle.length >= 16) return true;
  const hay = `${member.displayName || ''} ${member.uid || ''}`.toLowerCase();
  if (hay.indexOf(needle.toLowerCase()) >= 0) return true;
  return String(member.displayName || '').indexOf(needle) >= 0;
}

async function getAdminMemberDetail(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const uid = String((body && (body.uid || body.userId)) || '').trim();
  if (!uid) throw httpError(400, 'uid가 없습니다.');
  const [userSnap, licSnap, walletSnap, orderSnap, ticketSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('licenses').doc(uid).get(),
    db.collection('creditWalletsV2').doc(uid).get(),
    safeQuery(() => db.collection('orders').where('uid', '==', uid).limit(20).get()),
    safeQuery(() => db.collection('supportTickets').where('uid', '==', uid).limit(10).get())
  ]);
  const user = userSnap.exists ? (userSnap.data() || {}) : {};
  const lic = licSnap.exists ? (licSnap.data() || {}) : null;
  const credits = creditWalletV2.readBalanceV2(walletSnap.exists ? (walletSnap.data() || {}) : {});
  const member = mapMember(uid, user, lic, credits, { createTime: userSnap.createTime });
  const dash = require('./adminMobileDashboard');
  const payments = docsOf(orderSnap)
    .map((doc) => dash.mapPayment(doc.id, doc.data() || {}))
    .sort((a, b) => tsMs(b.paidAt) - tsMs(a.paidAt))
    .slice(0, 8);
  return {
    member: Object.assign({}, member, {
      emailMasked: member.emailMasked,
      role: String((user && user.role) || 'user'),
      hwid: lic && lic.hwid ? String(lic.hwid).slice(0, 8) + '…' : '',
      startsAt: toIso(lic && lic.startsAt) || undefined,
      expiresAt: toIso(lic && lic.expiresAt) || undefined,
      lastVerifiedAt: toIso(lic && (lic.lastVerifiedAt || lic.updatedAt)) || undefined,
      appVersion: String((lic && (lic.appVersion || lic.clientVersion)) || (user && user.appVersion) || ''),
      photoURL: adminPush.photoUrlOf(user) || member.photoURL || undefined,
      passProductId: String((lic && (lic.passProductId || lic.productId)) || ''),
      method: String((lic && lic.method) || ''),
      plan: String((lic && lic.plan) || member.plan || ''),
      credits: credits
    }),
    license: lic ? {
      plan: String(lic.plan || ''),
      status: String(lic.status || ''),
      licensed: lic.licensed !== false,
      state: licenseState(lic),
      startsAt: toIso(lic.startsAt) || undefined,
      expiresAt: toIso(lic.expiresAt) || undefined
    } : null,
    payments,
    tickets: docsOf(ticketSnap)
      .map((doc) => mapTicket(doc.id, doc.data() || {}))
      .sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt))
      .slice(0, 5),
    adminUrl: CRM_URL
  };
}

function ymdStartKst(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
  const d = new Date(`${ymd}T00:00:00+09:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function ymdEndKst(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
  const d = new Date(`${ymd}T23:59:59.999+09:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isoDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return toIso(value) || null;
}

async function grantLicenseLikeWeb(db, uid, body, FieldValue, before) {
  let savePlan = String((body && body.plan) || 'trial').toLowerCase();
  if (savePlan === 'monthly') savePlan = 'period';
  if (!['trial', 'lifetime', 'period'].includes(savePlan)) savePlan = 'trial';
  const memo = String((body && body.memo) || '').slice(0, 500);
  const passProductId = String((body && body.passProductId) || '').trim().toUpperCase();
  const clearDates = savePlan === 'lifetime' || savePlan === 'trial';
  let startsAt = String((body && body.startsAt) || '').trim();
  let expiresAt = String((body && body.expiresAt) || '').trim();
  if (clearDates) {
    startsAt = '';
    expiresAt = '';
  }
  if (savePlan === 'period') {
    if (!startsAt || !expiresAt) throw httpError(400, '기간제의 시작일과 만료일이 필요합니다.');
    if (startsAt > expiresAt) throw httpError(400, '시작일이 만료일보다 늦을 수 없습니다.');
  }
  const payload = {
    licensed: true,
    plan: savePlan,
    status: 'active',
    method: 'manual',
    memo: memo,
    updatedAt: FieldValue.serverTimestamp()
  };
  if (savePlan === 'period' && passProductId) {
    payload.passProductId = passProductId;
  } else {
    payload.passProductId = FieldValue.delete();
  }
  if (clearDates) {
    payload.startsAt = FieldValue.delete();
    payload.expiresAt = FieldValue.delete();
  } else {
    const startTs = ymdStartKst(startsAt);
    const endTs = ymdEndKst(expiresAt);
    payload.startsAt = startTs || FieldValue.delete();
    payload.expiresAt = expiresAtTsSafe(endTs, FieldValue);
  }
  await db.collection('licenses').doc(uid).set(payload, { merge: true });
  return {
    savePlan,
    passProductId: savePlan === 'period' ? passProductId : '',
    startsAt: clearDates ? null : startsAt,
    expiresAt: clearDates ? null : expiresAt,
    memo,
    before: {
      plan: before.plan || '',
      startsAt: isoDate(before.startsAt),
      expiresAt: isoDate(before.expiresAt),
      memo: before.memo || '',
      passProductId: before.passProductId || ''
    }
  };
}

function extendFromCurrent(before, body) {
  const days = Number(body && body.days);
  const customExpires = String((body && body.expiresAt) || '').trim();
  const nowMs = Date.now();
  const currentExp = tsMs(before && before.expiresAt);
  const baseMs = currentExp > nowMs ? currentExp : nowMs;
  let expiresAt = customExpires;
  if (!expiresAt) {
    if (!Number.isFinite(days) || days <= 0) {
      throw httpError(400, '연장 일수 또는 만료일이 필요합니다.');
    }
    expiresAt = ymdKst(baseMs + days * 24 * 60 * 60 * 1000);
  }
  let startsAt = String((body && body.startsAt) || '').trim();
  if (!startsAt) {
    const currentStart = tsMs(before && before.startsAt);
    startsAt = currentStart && currentStart <= nowMs ? ymdKst(currentStart) : ymdKst(nowMs);
    if (!currentExp || currentExp < nowMs) startsAt = ymdKst(nowMs);
  }
  if (startsAt > expiresAt) throw httpError(400, '시작일이 만료일보다 늦을 수 없습니다.');
  const passProductId = String((body && body.passProductId) || (before && before.passProductId) || '').trim();
  return {
    plan: 'period',
    startsAt,
    expiresAt,
    passProductId,
    memo: String((body && body.memo) || '').slice(0, 500)
  };
}

function expiresAtTsSafe(endTs, FieldValue) {
  return endTs || FieldValue.delete();
}

async function postAdminMemberAction(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  const device = await assertApprovedDevice(db, body);
  const uid = String((body && body.uid) || '').trim();
  const action = String((body && body.action) || '').trim();
  if (!uid) throw httpError(400, 'uid가 없습니다.');
  const allowed = ['block', 'unblock', 'grant', 'reset_hwid', 'credit_grant', 'credit_deduct', 'extend'];
  if (allowed.indexOf(action) < 0) {
    throw httpError(400, '지원하지 않는 관리자 작업입니다.');
  }
  const licRef = db.collection('licenses').doc(uid);
  const beforeSnap = await licRef.get();
  const before = beforeSnap.exists ? (beforeSnap.data() || {}) : {};
  const FieldValue = (deps && deps.FieldValue) || require('firebase-admin').firestore.FieldValue;
  const actor = String(device.deviceId || body.deviceId || '');
  let after = {};
  let auditAction = action;
  let summary = action;
  let auditBefore = String(before.status || before.hwid || '');
  let category = action === 'reset_hwid' ? 'hwid' : 'license';
  if (action === 'credit_grant' || action === 'credit_deduct') {
    const amount = adminCredits.parsePositiveInt(body && body.amount);
    if (amount == null) throw httpError(400, '지급/회수 수량은 1 이상의 정수여야 합니다.');
    if (amount > adminCredits.MAX_GRANT) {
      throw httpError(400, `최대 ${adminCredits.MAX_GRANT} Credits까지 가능합니다.`);
    }
    const sign = action === 'credit_grant' ? 1 : -1;
    const reason = String((body && body.reason) || '').trim().slice(0, 200)
      || (sign > 0 ? '관리자 수동 지급' : '관리자 조정');
    const result = await adminCredits.applyCreditDelta(db, FieldValue, {
      uid,
      amount: sign * amount,
      type: sign > 0 ? 'admin_grant' : 'admin_deduct',
      reason,
      adminUid: 'device:' + actor,
      origin: 'android_admin'
    });
    after = {
      balance: result.balance,
      prev: result.prev,
      amount: sign * amount,
      ledgerId: result.ledgerId || '',
      type: sign > 0 ? 'admin_grant' : 'admin_deduct'
    };
    auditBefore = String(result.prev);
    auditAction = sign > 0 ? 'credit_grant' : 'credit_remove';
    summary = `${result.prev} → ${result.balance}`;
    category = 'credit';
    await db.collection('adminAuditLogs').add({
      timestamp: FieldValue.serverTimestamp(),
      targetUserId: uid,
      category,
      action: auditAction,
      actorId: 'device:' + actor,
      actorDeviceId: actor,
      source: 'android_admin',
      before: { balance: result.prev },
      after: { balance: result.balance, amount: sign * amount, reason },
      result: 'success',
      summary,
      reason
    });
    return {
      ok: true,
      uid,
      action,
      after,
      balance: result.balance,
      prev: result.prev,
      ledgerId: result.ledgerId || ''
    };
  }
  if (action === 'block' || action === 'unblock') {
    const patch = action === 'block'
      ? { licensed: false, status: 'banned', updatedAt: FieldValue.serverTimestamp(), method: 'admin' }
      : { licensed: true, status: 'active', updatedAt: FieldValue.serverTimestamp(), method: 'admin' };
    await licRef.set(patch, { merge: true });
    after = { status: patch.status };
    auditAction = action === 'block' ? 'license_block' : 'license_unblock';
    summary = action === 'block' ? '차단' : '차단 해제';
  } else if (action === 'reset_hwid') {
    await db.collection('users').doc(uid).set({ hwid: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await licRef.set({ hwid: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    after = { hwid: '' };
    auditAction = 'hwid_reset';
    summary = before.hwid ? 'hwid cleared' : '(없음)';
  } else {
    const grantBody = action === 'extend' ? extendFromCurrent(before, body) : body;
    const granted = await grantLicenseLikeWeb(db, uid, grantBody, FieldValue, before);
    after = {
      plan: granted.savePlan,
      status: 'active',
      startsAt: granted.startsAt,
      expiresAt: granted.expiresAt,
      memo: granted.memo,
      method: 'manual',
      passProductId: granted.passProductId
    };
    auditBefore = granted.before;
    if (action === 'extend') auditAction = 'pass_extend';
    else if (granted.savePlan === 'lifetime') auditAction = 'lifetime_grant';
    else if (granted.savePlan === 'period' && !granted.passProductId) auditAction = 'pass_custom_grant';
    else auditAction = 'license_change';
    summary = `${before.plan || '-'} → ${granted.savePlan}${granted.passProductId ? ' · ' + granted.passProductId : ''}`;
    try {
      await db.collection('users').doc(uid).collection('notifications').add({
        type: 'license_change',
        sourceType: 'admin_license',
        category: 'license',
        targetUrl: '/account.html',
        plan: granted.savePlan,
        status: 'active',
        actorUid: 'device:' + actor,
        actorName: 'MidiAI Admin',
        postTitle: granted.savePlan,
        preview: `${granted.savePlan} · active`,
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });
    } catch (_) { /* notification is best-effort, matching web try/catch */ }
  }
  await db.collection('adminAuditLogs').add({
    timestamp: FieldValue.serverTimestamp(),
    targetUserId: uid,
    category: category,
    action: auditAction,
    actorId: 'device:' + actor,
    actorDeviceId: actor,
    source: 'android_admin',
    before: auditBefore,
    after: after,
    result: 'success',
    summary: summary
  });
  return { ok: true, uid, action, after };
}

async function getAdminTickets(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const status = String((body && body.status) || 'open').toLowerCase();
  const limit = clamp(body && body.limit, TICKET_LIMIT, 50);
  let snap = await safeQuery(() => db.collection('supportTickets').orderBy('updatedAt', 'desc').limit(80).get());
  if (!docsOf(snap).length) {
    snap = await safeQuery(() => db.collection('supportTickets').orderBy('createdAt', 'desc').limit(80).get());
  }
  let rows = docsOf(snap).map((doc) => mapTicket(doc.id, doc.data() || {}));
  if (status === 'open') rows = rows.filter((r) => r.status === 'open');
  else if (status === 'pending') rows = rows.filter((r) => r.status === 'pending');
  else if (status === 'closed') rows = rows.filter((r) => r.status === 'closed');
  rows = rows.slice(0, limit);
  const userMap = await getDocsByIds(db, 'users', rows.map((r) => r.uid));
  rows = rows.map((t) => {
    const user = t.uid ? userMap.get(t.uid) : null;
    if (!user) return t;
    return Object.assign({}, t, {
      displayName: adminPush.personName(Object.assign({}, user, { email: user.email || t.emailMasked }), t.uid)
    });
  });
  return { tickets: rows, status };
}

async function getAdminTicketDetail(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const ticketId = String((body && (body.ticketId || body.inquiryId)) || '').trim();
  if (!ticketId) throw httpError(400, 'ticketId가 없습니다.');
  const snap = await db.collection('supportTickets').doc(ticketId).get();
  if (!snap.exists) throw httpError(404, '문의를 찾을 수 없습니다.');
  const row = snap.data() || {};
  const ticket = mapTicket(ticketId, row);
  ticket.content = String(row.content || row.body || '').slice(0, 4000);
  const repliesSnap = await safeQuery(() => db.collection('supportTickets').doc(ticketId)
    .collection('replies').orderBy('createdAt', 'asc').limit(50).get());
  const replies = docsOf(repliesSnap).map((doc) => {
    const r = doc.data() || {};
    return {
      replyId: doc.id,
      role: String(r.role || ''),
      content: String(r.content || r.body || '').slice(0, 2000),
      createdAt: toIso(r.createdAt) || undefined
    };
  });
  let member = null;
  let payments = [];
  if (row.uid) {
    try {
      const detail = await getAdminMemberDetail(Object.assign({}, body, { uid: row.uid }), { db });
      member = detail.member;
      payments = detail.payments || [];
    } catch (_) { /* optional */ }
  }
  return { ticket, replies, member, payments, adminUrl: TICKET_URL };
}

async function postAdminTicketReply(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  const device = await assertApprovedDevice(db, body);
  const ticketId = String((body && (body.ticketId || body.inquiryId)) || '').trim();
  const content = String((body && (body.content || body.body || body.message)) || '').trim();
  if (!ticketId) throw httpError(400, 'ticketId가 없습니다.');
  if (!content) throw httpError(400, '답변 내용이 없습니다.');
  const FieldValue = (deps && deps.FieldValue) || require('firebase-admin').firestore.FieldValue;
  const actor = 'device:' + String(device.deviceId || body.deviceId || '');
  await db.collection('supportTickets').doc(ticketId).collection('replies').add({
    uid: actor,
    role: 'admin',
    content,
    createdAt: FieldValue.serverTimestamp()
  });
  const status = String((body && body.status) || 'pending');
  const mode = status === 'closed' ? 'closed' : 'human';
  await db.collection('supportTickets').doc(ticketId).set({
    status: status === 'closed' ? 'closed' : 'pending',
    conversationMode: mode,
    lastMessage: content.slice(0, 180),
    lastSender: 'admin',
    lastMessageAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    adminRead: true
  }, { merge: true });
  await db.collection('adminAuditLogs').add({
    timestamp: FieldValue.serverTimestamp(),
    targetUserId: ticketId,
    category: 'ticket',
    action: '문의 답변',
    actorId: actor,
    result: 'success',
    summary: content.slice(0, 80)
  });
  return { ok: true, ticketId };
}

async function getAdminAppVersion(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const snap = await db.collection('downloads').doc('latest').get();
  const d = snap.exists ? (snap.data() || {}) : {};
  return {
    latest: String(d.version || ''),
    minimum: String(d.minVersion || d.minimumVersion || ''),
    forceUpdate: d.mandatory === true,
    url: String(d.url || ''),
    filename: String(d.filename || ''),
    notes: String(d.notes || d.description || '').slice(0, 400),
    updatedAt: toIso(d.updatedAt) || undefined,
    source: 'downloads/latest'
  };
}

async function getAdminNotices(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const snap = await safeQuery(() => db.collection('announcements').orderBy('createdAt', 'desc').limit(20).get());
  const notices = docsOf(snap).map((doc) => {
    const row = doc.data() || {};
    return {
      id: doc.id,
      title: String(row.title || '').slice(0, 120),
      visible: row.visible !== false,
      pinned: !!row.pinned,
      createdAt: toIso(row.createdAt) || undefined,
      adminUrl: NOTICE_URL
    };
  });
  return { notices };
}

async function getAdminAuditLogs(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const snap = await safeQuery(() => db.collection('adminAuditLogs').orderBy('timestamp', 'desc').limit(AUDIT_LIMIT).get());
  const logs = docsOf(snap).map((doc) => {
    const row = doc.data() || {};
    return {
      id: doc.id,
      at: toIso(row.timestamp) || undefined,
      action: String(row.action || ''),
      category: String(row.category || ''),
      target: String(row.targetUserId || ''),
      actor: String(row.actorId || row.actorEmail || ''),
      summary: String(row.summary || '').slice(0, 160),
      result: String(row.result || '')
    };
  });
  return { logs };
}

async function getAdminLicenseStats(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const now = (deps && deps.now) || new Date();
  const counts = await countLicenseStats(db, now);
  const snap = await safeQuery(() => db.collection('licenses').where('licensed', '==', true).limit(LICENSE_ITEMS).get());
  const items = [];
  for (const doc of docsOf(snap)) {
    const lic = doc.data() || {};
    const st = licenseState(lic);
    items.push({
      uid: doc.id,
      planLabel: planLabel(lic.plan, lic.passProductId || lic.productId),
      hwid: lic.hwid ? String(lic.hwid).slice(0, 8) + '…' : '',
      lastVerifiedAt: toIso(lic.lastVerifiedAt || lic.updatedAt) || undefined,
      licenseLabel: st.label,
      status: st.status
    });
  }
  return { stats: counts, items, capped: false };
}

function createHandlers({ cors }) {
  return {
    getAdminMembers: adminPush.wrapHttp(cors, (body) => getAdminMembers(body)),
    getAdminMemberDetail: adminPush.wrapHttp(cors, (body) => getAdminMemberDetail(body)),
    postAdminMemberAction: adminPush.wrapHttp(cors, (body) => postAdminMemberAction(body)),
    getAdminTickets: adminPush.wrapHttp(cors, (body) => getAdminTickets(body)),
    getAdminTicketDetail: adminPush.wrapHttp(cors, (body) => getAdminTicketDetail(body)),
    postAdminTicketReply: adminPush.wrapHttp(cors, (body) => postAdminTicketReply(body)),
    getAdminAppVersion: adminPush.wrapHttp(cors, (body) => getAdminAppVersion(body)),
    getAdminNotices: adminPush.wrapHttp(cors, (body) => getAdminNotices(body)),
    getAdminAuditLogs: adminPush.wrapHttp(cors, (body) => getAdminAuditLogs(body)),
    getAdminLicenseStats: adminPush.wrapHttp(cors, (body) => getAdminLicenseStats(body))
  };
}

module.exports = {
  attachHomeExtras,
  fetchHomeExtraSnaps,
  assembleHomeExtras,
  getAdminMembers,
  getAdminMemberDetail,
  postAdminMemberAction,
  getAdminTickets,
  getAdminTicketDetail,
  postAdminTicketReply,
  getAdminAppVersion,
  getAdminNotices,
  getAdminAuditLogs,
  getAdminLicenseStats,
  countLicenseStats,
  licenseState,
  planLabel,
  mapMember,
  mapTicket,
  createHandlers,
  normalizePlan,
  normalizeStatus,
  MEMBER_PAGE_SIZE,
  RECENT_MEMBER_LIMIT,
  ymdKst,
  extendFromCurrent
};
