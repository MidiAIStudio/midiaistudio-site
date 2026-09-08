/**
 * MidiAI Admin mobile ops — members, tickets, notices, version, audit.
 * Auth: approved + enabled adminDevices (deviceSecret). No payment/license grant rewrite.
 * Writes go through Admin SDK and adminAuditLogs. Clients cannot self-authorize.
 */

'use strict';

const adminPush = require('./adminPush');

const MEMBER_LIMIT = 20;
const TICKET_LIMIT = 30;
const AUDIT_LIMIT = 40;
const LICENSE_SCAN = 400;
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

function planLabel(plan) {
  const p = String(plan || '').toLowerCase();
  if (p === 'lifetime') return '평생 이용권';
  if (p === 'period') return 'PASS';
  if (p === 'trial') return '체험판';
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
  return {
    uid: String(uid || ''),
    emailMasked: adminPush.maskEmail(user && (user.email || user.payerEmail)),
    displayName: String((user && (user.displayName || user.name)) || '').slice(0, 80),
    joinedAt: toIso(user && (user.createdAt || user.joinedAt)) || undefined,
    lastLoginAt: toIso(user && (user.lastLoginAt || user.lastSeenAt)) || undefined,
    plan: String((lic && lic.plan) || 'trial'),
    planLabel: planLabel(lic && lic.plan),
    licenseStatus: state.status,
    licenseLabel: state.label,
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

async function countQuery(db, col, field, value, limit) {
  const snap = await safeQuery(() => db.collection(col).where(field, '==', value).limit(limit).get());
  return docsOf(snap).length;
}

async function attachHomeExtras(db, bounds, seed) {
  const [signupSnap, licenseSnap, waitingSnap] = await Promise.all([
    safeQuery(() => db.collection('users')
      .where('createdAt', '>=', bounds.todayStart)
      .where('createdAt', '<', bounds.todayEnd)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get()),
    safeQuery(() => db.collection('licenses')
      .where('licensed', '==', true)
      .limit(LICENSE_SCAN)
      .get()),
    safeQuery(() => db.collection('supportTickets')
      .where('conversationMode', '==', 'waiting_human')
      .orderBy('humanRequestedAt', 'desc')
      .limit(20)
      .get())
  ]);

  const signupsToday = docsOf(signupSnap).length;
  let activeLicenses = 0;
  const licenseDocs = docsOf(licenseSnap);
  for (const doc of licenseDocs) {
    const st = licenseState(doc.data() || {});
    if (st.active) activeLicenses += 1;
  }

  const activity = [];
  (seed.recentPayments || []).forEach((p) => {
    activity.push({
      type: 'payment',
      at: p.paidAt || p.paidAtMs,
      title: p.product || '결제',
      summary: `${p.emailMasked || ''} · ${p.grossAmount || p.amount || 0}`,
      entityId: p.paymentId
    });
  });
  (seed.recentInquiries || []).forEach((q) => {
    activity.push({
      type: 'inquiry',
      at: q.createdAt,
      title: q.title || '문의',
      summary: q.emailMasked || '',
      entityId: q.inquiryId
    });
  });
  docsOf(signupSnap).slice(0, 8).forEach((doc) => {
    const row = doc.data() || {};
    activity.push({
      type: 'signup',
      at: toIso(row.createdAt),
      title: '신규 가입',
      summary: adminPush.maskEmail(row.email),
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
    activeLicensesCapped: licenseDocs.length >= LICENSE_SCAN,
    attention: attention.slice(0, 8),
    activity: activity.slice(0, 12)
  };
}

async function getAdminMembers(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  await assertApprovedDevice(db, body);
  const q = String((body && body.q) || '').trim();
  const limit = clamp(body && body.limit, MEMBER_LIMIT, 40);
  const ids = new Set();
  const rows = [];

  async function addUid(uid) {
    const id = String(uid || '').trim();
    if (!id || ids.has(id)) return;
    ids.add(id);
    const [userSnap, licSnap] = await Promise.all([
      db.collection('users').doc(id).get(),
      db.collection('licenses').doc(id).get()
    ]);
    const user = userSnap.exists ? (userSnap.data() || {}) : {};
    rows.push(mapMember(id, user, licSnap.exists ? (licSnap.data() || {}) : null));
  }

  if (q.includes('@')) {
    const snap = await safeQuery(() => db.collection('users').where('email', '==', q).limit(5).get());
    for (const doc of docsOf(snap)) await addUid(doc.id);
  } else if (q.length >= 16 && !/\s/.test(q)) {
    await addUid(q);
    const order = await db.collection('orders').doc(q).get();
    if (order.exists) await addUid((order.data() || {}).uid);
    const byPay = await safeQuery(() => db.collection('orders').where('paymentId', '==', q).limit(1).get());
    const payDoc = docsOf(byPay)[0];
    if (payDoc) await addUid((payDoc.data() || {}).uid);
    const hw = await safeQuery(() => db.collection('licenses').where('hwid', '==', q).limit(5).get());
    for (const doc of docsOf(hw)) await addUid(doc.id);
  }

  if (!rows.length) {
    const snap = await safeQuery(() => db.collection('users').orderBy('createdAt', 'desc').limit(limit).get());
    for (const doc of docsOf(snap)) {
      if (q) {
        const row = doc.data() || {};
        const hay = `${row.email || ''} ${row.displayName || ''} ${doc.id}`.toLowerCase();
        if (hay.indexOf(q.toLowerCase()) < 0) continue;
      }
      await addUid(doc.id);
      if (rows.length >= limit) break;
    }
  }

  return { members: rows.slice(0, limit), q };
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
      appVersion: String((lic && (lic.appVersion || lic.clientVersion)) || (user && user.appVersion) || '')
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

async function postAdminMemberAction(body, deps) {
  const db = (deps && deps.db) || require('firebase-admin').firestore();
  const device = await assertApprovedDevice(db, body);
  const uid = String((body && body.uid) || '').trim();
  const action = String((body && body.action) || '').trim();
  if (!uid) throw httpError(400, 'uid가 없습니다.');
  if (action !== 'block' && action !== 'unblock') {
    throw httpError(400, '모바일에서는 차단/해제만 가능합니다. 지급·연장은 웹 관리자를 사용하세요.');
  }
  const licRef = db.collection('licenses').doc(uid);
  const beforeSnap = await licRef.get();
  const before = beforeSnap.exists ? (beforeSnap.data() || {}) : {};
  const FieldValue = (deps && deps.FieldValue) || require('firebase-admin').firestore.FieldValue;
  const patch = action === 'block'
    ? { licensed: false, status: 'banned', updatedAt: FieldValue.serverTimestamp(), method: 'admin_mobile' }
    : { licensed: true, status: 'active', updatedAt: FieldValue.serverTimestamp(), method: 'admin_mobile' };
  await licRef.set(patch, { merge: true });
  const actor = String(device.deviceId || body.deviceId || '');
  await db.collection('adminAuditLogs').add({
    timestamp: FieldValue.serverTimestamp(),
    targetUserId: uid,
    category: 'license',
    action: action === 'block' ? '라이선스 차단' : '차단 해제',
    actorId: 'device:' + actor,
    actorDeviceId: actor,
    before: String(before.status || ''),
    after: patch.status,
    result: 'success',
    summary: action
  });
  return { ok: true, uid, action };
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
  return { tickets: rows.slice(0, limit), status };
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
  const snap = await safeQuery(() => db.collection('licenses').limit(LICENSE_SCAN).get());
  const counts = { active: 0, expired: 0, banned: 0, trial: 0, lifetime: 0, scanned: 0 };
  for (const doc of docsOf(snap)) {
    counts.scanned += 1;
    const lic = doc.data() || {};
    const st = licenseState(lic);
    const plan = String(lic.plan || '').toLowerCase();
    if (st.status === 'banned') counts.banned += 1;
    else if (st.status === 'expired') counts.expired += 1;
    else if (st.active) counts.active += 1;
    if (plan === 'lifetime') counts.lifetime += 1;
    if (plan === 'trial') counts.trial += 1;
  }
  return { stats: counts, capped: counts.scanned >= LICENSE_SCAN };
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
  licenseState,
  mapMember,
  mapTicket,
  createHandlers
};
