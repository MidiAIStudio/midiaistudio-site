/**
 * MidiAI Admin mobile ops — members, tickets, notices, version, audit.
 * Auth: approved + enabled adminDevices (deviceSecret).
 * License grant/block/HWID writes match web admin fields via Admin SDK + adminAuditLogs.
 * Writes go through Admin SDK and adminAuditLogs. Clients cannot self-authorize.
 */

'use strict';

const adminPush = require('./adminPush');

const MEMBER_LIMIT = 20;
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

function mapMember(uid, user, lic) {
  const state = licenseState(lic);
  const row = user || {};
  return {
    uid: String(uid || ''),
    emailMasked: adminPush.maskEmail(row.email || row.payerEmail),
    displayName: adminPush.personName(row, uid),
    photoURL: adminPush.photoUrlOf(row) || undefined,
    joinedAt: toIso(user && (user.createdAt || user.joinedAt)) || undefined,
    lastLoginAt: toIso(user && (user.lastLogin || user.lastLoginAt || user.lastSeenAt)) || undefined,
    plan: String((lic && lic.plan) || 'trial'),
    planLabel: planLabel(lic && lic.plan, lic && (lic.passProductId || lic.productId)),
    passProductId: String((lic && (lic.passProductId || lic.productId)) || ''),
    method: String((lic && lic.method) || ''),
    licenseStatus: state.status,
    licenseLabel: state.label,
    startsAt: toIso(lic && lic.startsAt) || undefined,
    expiresAt: toIso(lic && lic.expiresAt) || undefined,
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

async function fetchHomeExtraSnaps(db, bounds, now) {
  const signupCountQuery = db.collection('users')
    .where('createdAt', '>=', bounds.todayStart)
    .where('createdAt', '<', bounds.todayEnd);
  const [signupSnap, waitingSnap, signupCount, licenseCounts] = await Promise.all([
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
    countLicenseStats(db, now)
  ]);
  return { signupSnap, waitingSnap, signupCount, licenseCounts };
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

  return {
    todaySignups: signupsToday,
    activeLicenses,
    licenseStats: licenseCounts,
    activeLicensesCapped: false,
    attention: attention.slice(0, 8),
    activity: activity.slice(0, 12)
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

async function getAdminMembers(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const q = String((body && body.q) || '').trim();
  const limit = clamp(body && body.limit, MEMBER_LIMIT, 40);
  let userDocs = [];

  if (q.includes('@')) {
    const snap = await safeQuery(() => db.collection('users').where('email', '==', q).limit(5).get());
    userDocs = docsOf(snap);
  } else if (q.length >= 16 && !/\s/.test(q)) {
    const ids = [q];
    const order = await db.collection('orders').doc(q).get();
    if (order.exists) ids.push((order.data() || {}).uid);
    const byPay = await safeQuery(() => db.collection('orders').where('paymentId', '==', q).limit(1).get());
    const payDoc = docsOf(byPay)[0];
    if (payDoc) ids.push((payDoc.data() || {}).uid);
    const hw = await safeQuery(() => db.collection('licenses').where('hwid', '==', q).limit(5).get());
    for (const doc of docsOf(hw)) ids.push(doc.id);
    const [userMap, licMap] = await Promise.all([
      getDocsByIds(db, 'users', ids),
      getDocsByIds(db, 'licenses', ids)
    ]);
    const members = [...userMap.keys()].map((id) => mapMember(id, userMap.get(id), licMap.get(id) || null));
    return { members: members.slice(0, limit), q };
  }

  if (!userDocs.length) {
    const snap = await safeQuery(() => db.collection('users').orderBy('createdAt', 'desc').limit(limit).get());
    userDocs = docsOf(snap);
    if (q) {
      const needle = q.toLowerCase();
      userDocs = userDocs.filter((doc) => {
        const row = doc.data() || {};
        const hay = `${row.email || ''} ${row.displayName || ''} ${row.name || ''} ${doc.id}`.toLowerCase();
        return hay.indexOf(needle) >= 0;
      });
    }
  }

  const licMap = await getDocsByIds(db, 'licenses', userDocs.map((doc) => doc.id));
  const members = userDocs.map((doc) => mapMember(doc.id, doc.data() || {}, licMap.get(doc.id) || null));
  return { members: members.slice(0, limit), q };
}

async function getAdminMemberDetail(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const uid = String((body && (body.uid || body.userId)) || '').trim();
  if (!uid) throw httpError(400, 'uid가 없습니다.');
  const [userSnap, licSnap, orderSnap, ticketSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('licenses').doc(uid).get(),
    safeQuery(() => db.collection('orders').where('uid', '==', uid).limit(20).get()),
    safeQuery(() => db.collection('supportTickets').where('uid', '==', uid).limit(10).get())
  ]);
  const user = userSnap.exists ? (userSnap.data() || {}) : {};
  const lic = licSnap.exists ? (licSnap.data() || {}) : null;
  const member = mapMember(uid, user, lic);
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
      plan: String((lic && lic.plan) || member.plan || '')
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

function expiresAtTsSafe(endTs, FieldValue) {
  return endTs || FieldValue.delete();
}

async function postAdminMemberAction(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  const device = await assertApprovedDevice(db, body);
  const uid = String((body && body.uid) || '').trim();
  const action = String((body && body.action) || '').trim();
  if (!uid) throw httpError(400, 'uid가 없습니다.');
  const allowed = ['block', 'unblock', 'grant', 'reset_hwid'];
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
  if (action === 'block' || action === 'unblock') {
    const patch = action === 'block'
      ? { licensed: false, status: 'banned', updatedAt: FieldValue.serverTimestamp(), method: 'admin' }
      : { licensed: true, status: 'active', updatedAt: FieldValue.serverTimestamp(), method: 'admin' };
    await licRef.set(patch, { merge: true });
    after = { status: patch.status };
    auditAction = action === 'block' ? '라이선스 차단' : '차단 해제';
  } else if (action === 'reset_hwid') {
    await db.collection('users').doc(uid).set({ hwid: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await licRef.set({ hwid: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    after = { hwid: '' };
    auditAction = 'HWID 초기화';
    summary = before.hwid ? 'hwid cleared' : '(없음)';
  } else {
    const granted = await grantLicenseLikeWeb(db, uid, body, FieldValue, before);
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
    auditAction = granted.savePlan === 'period' ? 'PASS_ADMIN_GRANTED' : '라이선스 변경';
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
    category: action === 'reset_hwid' ? 'hwid' : 'license',
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
  createHandlers
};
