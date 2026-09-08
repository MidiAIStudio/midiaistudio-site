/**
 * MidiAI Admin FCM push — device registration, policy, multicast send.
 * Side-effect only when used from payment / inquiry / refund paths.
 * Never logs FCM tokens, device secrets, or Admin credentials.
 */

'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');

const DEVICES = 'adminDevices';
const SETTINGS_COL = 'adminNotificationSettings';
const SETTINGS_DOC = 'default';
const LOGS = 'adminPushLogs';
const ABUSE = 'adminPushAbuse';
const DEDUP = 'adminPushDedup';
const CLAIMS = 'adminPushClaims';
const LOG_KEEP = 80;
const ADMIN_ORIGIN = 'https://midiaistudio.com/admin.html';

const GLOBAL_DEFAULTS = {
  paymentEnabled: true,
  inquiryEnabled: true,
  refundEnabled: true,
  criticalEnabled: true
};

const CHANNEL_BY_TYPE = {
  payment: 'payment',
  inquiry: 'inquiry',
  refund: 'refund',
  critical: 'critical',
  system: 'system',
  test: 'system'
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
  'registration-token-not-registered',
  'invalid-registration-token'
]);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function hashesEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function newDeviceSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function tokenPatch(raw) {
  const token = String(raw || '').trim();
  return {
    token,
    tokenHash: hashSecret(token),
    tokenInvalid: false
  };
}

function fcmSendToken(data) {
  const token = String((data && data.token) || '').trim();
  if (!token) return '';
  const hash = String((data && data.tokenHash) || '').trim();
  if (hash && hashesEqual(token, hash)) return '';
  return token;
}

function clientIp(req) {
  const fwd = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-appengine-user-ip'])) || '');
  const first = fwd.split(',')[0].trim();
  return first || String((req.ip || '')).trim() || 'unknown';
}

function validDeviceId(raw) {
  const id = String(raw || '').trim();
  return /^[a-fA-F0-9]{32,64}$/.test(id) || /^[a-zA-Z0-9._:-]{16,128}$/.test(id);
}

function validToken(raw) {
  const token = String(raw || '').trim();
  return token.length >= 20 && token.length <= 4096 && !/\s/.test(token);
}

function bool(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value === 'true' || value === 'false') return value === 'true';
  return fallback;
}

function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at <= 0) return '';
  const local = s.slice(0, at);
  const domain = s.slice(at);
  const keep = Math.min(3, local.length);
  return `${local.slice(0, keep)}***${domain}`;
}

/**
 * Display name from users/orders/tickets docs. Never Auth.getUser (N+1).
 * Priority: displayName/name → email local-part → uid prefix.
 */
function personName(row, uid) {
  const name = String((row && (row.displayName || row.name || row.payerName || row.googleName)) || '').trim();
  if (name) return name.slice(0, 80);
  const email = String((row && (row.email || row.payerEmail)) || '').trim();
  const local = email.split('@')[0];
  if (local) return local.slice(0, 40);
  const id = String(uid || (row && row.uid) || '').trim();
  return id ? id.slice(0, 8) : '회원';
}

function photoUrlOf(row) {
  const url = String((row && row.photoURL) || '').trim();
  if (!url || url.length > 500) return '';
  if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) return '';
  return url;
}

function formatAmount(amount, currency) {
  if (amount == null || amount === '') return '';
  const num = Number(amount);
  const value = Number.isFinite(num) ? num.toLocaleString('en-US') : String(amount);
  const cur = String(currency || '').toUpperCase();
  if (cur === 'KRW' || cur === '원') return `₩${value}`;
  if (cur) return `${cur} ${value}`;
  return value;
}

function adminUrlFor(type, entityId) {
  if (type === 'inquiry') {
    return entityId
      ? `${ADMIN_ORIGIN}#view=tickets`
      : `${ADMIN_ORIGIN}#view=tickets`;
  }
  if (type === 'payment' || type === 'refund') {
    return `${ADMIN_ORIGIN}#view=crm&crm=orders`;
  }
  if (type === 'critical') return `${ADMIN_ORIGIN}#view=logs`;
  return `${ADMIN_ORIGIN}#view=push`;
}

function isPushTarget(data) {
  const d = data || {};
  return String(d.status || '') === 'approved' && d.enabled === true && !!fcmSendToken(d);
}

function categoryEnabledOnDevice(data, type) {
  const d = data || {};
  if (type === 'payment') return d.paymentEnabled !== false;
  if (type === 'inquiry') return d.inquiryEnabled !== false;
  if (type === 'refund') return d.refundEnabled !== false;
  if (type === 'critical') return d.criticalEnabled !== false;
  return true;
}

function deviceSnapshot(id, data, extra) {
  const d = data || {};
  return Object.assign({
    deviceId: String(id || ''),
    status: String(d.status || 'unregistered'),
    enabled: d.enabled === true,
    role: String(d.role || ''),
    label: String(d.label || ''),
    deviceName: String(d.deviceName || ''),
    appVersion: String(d.appVersion || ''),
    platform: String(d.platform || 'android'),
    paymentEnabled: d.paymentEnabled !== false,
    inquiryEnabled: d.inquiryEnabled !== false,
    refundEnabled: d.refundEnabled !== false,
    criticalEnabled: d.criticalEnabled !== false,
    tokenInvalid: d.tokenInvalid === true,
    requestedAt: d.requestedAt || null,
    approvedAt: d.approvedAt || null
  }, extra || {});
}

function dbRef() {
  return admin.firestore();
}

function FieldValue() {
  return admin.firestore.FieldValue;
}

async function loadGlobalSettings(db) {
  const snap = await db.collection(SETTINGS_COL).doc(SETTINGS_DOC).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  return {
    paymentEnabled: data.paymentEnabled !== false,
    inquiryEnabled: data.inquiryEnabled !== false,
    refundEnabled: data.refundEnabled !== false,
    criticalEnabled: data.criticalEnabled !== false
  };
}

function globalAllows(settings, type) {
  if (type === 'system' || type === 'test') return true;
  if (type === 'payment') return settings.paymentEnabled !== false;
  if (type === 'inquiry') return settings.inquiryEnabled !== false;
  if (type === 'refund') return settings.refundEnabled !== false;
  if (type === 'critical') return settings.criticalEnabled !== false;
  return false;
}

function secretOk(body, data) {
  const secret = String((body && body.deviceSecret) || '').trim();
  const storedHash = String((data && data.deviceSecretHash) || '');
  if (!secret || !storedHash) return false;
  return hashesEqual(hashSecret(secret), storedHash);
}

function proofOk(body, data) {
  return secretOk(body, data);
}

async function assertDevice(db, body, opts) {
  const deviceId = String((body && body.deviceId) || '').trim();
  if (!validDeviceId(deviceId)) throw httpError(400, 'deviceId가 올바르지 않습니다.');
  const ref = db.collection(DEVICES).doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) {
    if (opts && opts.allowMissing) return { deviceId, ref, snap, data: null };
    throw httpError(404, '등록된 기기가 없습니다.');
  }
  const data = snap.data() || {};
  const requireProof = !(opts && opts.requireProof === false);
  if (requireProof && !secretOk(body, data)) {
    throw httpError(403, '기기를 확인할 수 없습니다.');
  }
  return { deviceId, ref, snap, data };
}

async function hitRateLimit(db, key, max, windowMs) {
  const id = hashSecret(key).slice(0, 32);
  const ref = db.collection(ABUSE).doc(id);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    const started = Number(data.windowStartMs || 0);
    let count = Number(data.count || 0);
    if (!started || now - started > windowMs) {
      count = 0;
    }
    if (count >= max) {
      throw httpError(429, '요청이 너무 많습니다. 잠시 후 다시 시도하세요.');
    }
    tx.set(ref, {
      windowStartMs: !started || now - started > windowMs ? now : started,
      count: count + 1,
      updatedAt: FieldValue().serverTimestamp()
    }, { merge: true });
  });
}

async function claimFlag(ref, field) {
  const db = dbRef();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (data[field] === true) return false;
    const patch = {};
    patch[field] = true;
    patch[`${field}At`] = FieldValue().serverTimestamp();
    tx.set(ref, patch, { merge: true });
    return true;
  });
}

function paymentPaidEventKey(paymentId) {
  return `payment:${String(paymentId || '').trim()}:paid`;
}

function paymentRefundEventKey(paymentId, refundEventId) {
  return `payment:${String(paymentId || '').trim()}:refund:${String(refundEventId || '').trim()}`;
}

function claimDocId(eventKey) {
  return String(eventKey || '').replace(/\//g, '_').slice(0, 700);
}

function isAlreadyExistsError(err) {
  const code = String((err && (err.code || (err.errorInfo && err.errorInfo.code))) || '').toLowerCase();
  const msg = String((err && err.message) || '').toLowerCase();
  return code === 'already-exists' || code === '6' || msg.includes('already exists') || msg.includes('already-exists');
}

/**
 * Atomic create-if-absent. Do not claim by writing orders — that retriggers onWrite.
 * adminPushLogs is a send log, not a lock.
 */
async function claimPushEvent(eventKey, deps) {
  const key = String(eventKey || '').trim();
  if (!key) return false;
  const db = (deps && deps.db) || dbRef();
  const ref = db.collection(CLAIMS).doc(claimDocId(key));
  if (typeof ref.create === 'function') {
    try {
      await ref.create({
        eventKey: key,
        createdAt: FieldValue().serverTimestamp()
      });
      return true;
    } catch (err) {
      if (isAlreadyExistsError(err)) return false;
      throw err;
    }
  }
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      eventKey: key,
      createdAt: FieldValue().serverTimestamp()
    });
    return true;
  });
}

function isInvalidTokenError(err) {
  const code = String((err && (err.code || err.errorInfo && err.errorInfo.code)) || '').toLowerCase();
  if (INVALID_TOKEN_CODES.has(code)) return true;
  const msg = String((err && err.message) || '').toLowerCase();
  return msg.includes('requested entity was not found')
    || msg.includes('not a valid fcm registration token')
    || msg.includes('registration-token-not-registered');
}

async function markInvalidToken(ref) {
  await ref.set({
    enabled: false,
    tokenInvalid: true,
    tokenInvalidAt: FieldValue().serverTimestamp(),
    disabledReason: 'invalid_token',
    token: '',
    tokenHash: '',
    updatedAt: FieldValue().serverTimestamp()
  }, { merge: true });
}

async function writePushLog(db, entry) {
  const col = db.collection(LOGS);
  await col.add({
    type: String(entry.type || ''),
    attempted: Number(entry.attempted || 0),
    success: Number(entry.success || 0),
    failed: Number(entry.failed || 0),
    title: String(entry.title || '').slice(0, 80),
    summary: String(entry.summary || entry.body || '').slice(0, 180),
    createdAt: FieldValue().serverTimestamp()
  });
  try {
    const old = await col.orderBy('createdAt', 'desc').offset(LOG_KEEP).limit(30).get();
    const batch = db.batch();
    old.docs.forEach((doc) => batch.delete(doc.ref));
    if (!old.empty) await batch.commit();
  } catch (_) {
    /* index may be building; logs still usable */
  }
}

function buildMessage(token, payload) {
  const type = String(payload.type || 'system');
  const title = String(payload.title || 'MidiAI Admin');
  const body = String(payload.body || '');
  const entityId = String(payload.entityId || '');
  const adminUrl = String(payload.adminUrl || adminUrlFor(type, entityId));
  const data = {
    eventType: type,
    entityId,
    adminUrl,
    title,
    body
  };
  Object.keys(data).forEach((k) => {
    if (data[k] == null) data[k] = '';
    else data[k] = String(data[k]);
  });
  return {
    token,
    notification: { title, body },
    data,
    android: {
      priority: 'high',
      notification: {
        channelId: CHANNEL_BY_TYPE[type] || 'system',
        defaultVibrateTimings: type === 'critical'
      }
    }
  };
}

async function sendAdminNotification(input, deps) {
  const db = (deps && deps.db) || dbRef();
  const messaging = (deps && deps.messaging) || admin.messaging();
  const type = String((input && input.type) || '').trim();
  if (!type) return { attempted: 0, success: 0, failed: 0, skipped: 'no_type' };

  if (input && input.eventKey) {
    const claimed = await claimPushEvent(input.eventKey, deps);
    if (!claimed) return { attempted: 0, success: 0, failed: 0, skipped: 'already_sent' };
  } else if (input && input.claimRef && input.claimField) {
    const claimed = await claimFlag(input.claimRef, input.claimField);
    if (!claimed) return { attempted: 0, success: 0, failed: 0, skipped: 'already_sent' };
  }

  const settings = await loadGlobalSettings(db);
  if (!globalAllows(settings, type)) {
    return { attempted: 0, success: 0, failed: 0, skipped: 'global_off' };
  }

  let docs;
  if (input && Array.isArray(input.deviceIds) && input.deviceIds.length) {
    docs = [];
    for (const id of input.deviceIds) {
      const snap = await db.collection(DEVICES).doc(String(id)).get();
      if (snap.exists) docs.push(snap);
    }
  } else {
    const snap = await db.collection(DEVICES).get();
    docs = snap.docs;
  }

  const targets = [];
  for (const doc of docs) {
    const data = doc.data() || {};
    if (!isPushTarget(data)) continue;
    if (!categoryEnabledOnDevice(data, type)) continue;
    const token = fcmSendToken(data);
    if (!token) continue;
    targets.push({ id: doc.id, ref: doc.ref, token });
  }

  if (!targets.length) {
    const empty = { attempted: 0, success: 0, failed: 0, skipped: 'no_targets' };
    if (type !== 'system') await writePushLog(db, Object.assign({ type, title: input.title }, empty));
    return empty;
  }

  const messages = targets.map((t) => buildMessage(t.token, input));
  let success = 0;
  let failed = 0;
  const invalid = [];
  try {
    const res = await messaging.sendEach(messages);
    (res.responses || []).forEach((item, idx) => {
      if (item.success) {
        success += 1;
        return;
      }
      failed += 1;
      if (isInvalidTokenError(item.error)) invalid.push(targets[idx]);
    });
  } catch (err) {
    if (isInvalidTokenError(err) && targets.length === 1) {
      invalid.push(targets[0]);
      failed = 1;
    } else {
      failed = targets.length;
    }
  }

  for (const row of invalid) {
    try { await markInvalidToken(row.ref); } catch (_) { /* keep sending others */ }
  }

  const out = { attempted: targets.length, success, failed };
  await writePushLog(db, Object.assign({
    type,
    title: input.title,
    summary: String((input && input.body) || '').slice(0, 180)
  }, out));
  return out;
}

async function maybeNotifyPaymentFcm(orderId, data, ref, deps) {
  const order = data || {};
  const paymentId = String(order.paymentId || orderId || '').trim();
  const product = String(order.productName || order.orderName || (order.plan === 'lifetime' ? 'Lifetime' : order.plan) || 'MidiAI Studio').trim();
  const amount = formatAmount(order.amount ?? order.paidAmount, order.currency);
  const email = maskEmail(order.email || order.payerEmail);
  const body = [product, amount, email].filter(Boolean).join(' · ');
  return sendAdminNotification({
    type: 'payment',
    title: '💰 신규 결제',
    body: body || product,
    entityId: paymentId || String(orderId || ''),
    adminUrl: adminUrlFor('payment'),
    eventKey: paymentPaidEventKey(paymentId)
  }, deps);
}

async function maybeNotifyInquiryFcm(ticketId, data, ref, deps) {
  const ticket = data || {};
  const subject = String(ticket.title || '(제목 없음)').trim().slice(0, 60);
  const email = maskEmail(ticket.email || ticket.payerEmail);
  const body = [subject, email].filter(Boolean).join(' · ');
  return sendAdminNotification({
    type: 'inquiry',
    title: '💬 신규 문의',
    body,
    entityId: String(ticketId || ''),
    adminUrl: adminUrlFor('inquiry'),
    claimRef: ref,
    claimField: 'fcmAlertSent'
  }, deps);
}

function refundEventIdOf(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.refundEventId) return String(result.refundEventId).trim();
  if (Array.isArray(result.refundEventIds) && result.refundEventIds[0]) {
    return String(result.refundEventIds[0]).trim();
  }
  if (result.refundEventType) return String(result.refundEventType).trim();
  return '';
}

async function maybeNotifyRefundFcm(result, deps) {
  if (result && result.duplicateEvent) return { skipped: 'duplicate_event' };
  const paymentId = String((result && result.paymentId) || '').trim();
  if (!paymentId) return { skipped: 'no_payment' };
  const newEvents = Number((result && result.eventsApplied) || 0);
  const eventId = refundEventIdOf(result);
  if (newEvents <= 0 && !eventId) return { skipped: 'no_new_refund_event' };
  const db = (deps && deps.db) || dbRef();
  const ref = db.collection('orders').doc(paymentId);
  const snap = await ref.get();
  const order = snap.exists ? (snap.data() || {}) : {};
  const product = String(order.productName || order.orderName || order.plan || 'MidiAI Studio').trim();
  const amount = formatAmount(
    result.cancelledAmount || result.refundedAmount || order.amount,
    order.currency
  );
  return sendAdminNotification({
    type: 'refund',
    title: '↩ 결제 취소',
    body: [product, amount].filter(Boolean).join(' · '),
    entityId: paymentId,
    adminUrl: adminUrlFor('refund'),
    eventKey: paymentRefundEventKey(paymentId, eventId || 'refund')
  }, deps);
}

async function notifyCritical(input, deps) {
  const db = (deps && deps.db) || dbRef();
  const key = String((input && input.key) || '').trim().slice(0, 120);
  if (key) {
    const ref = db.collection(DEDUP).doc(hashSecret(key).slice(0, 40));
    const now = Date.now();
    const windowMs = Number((input && input.windowMs) || 6 * 60 * 60 * 1000);
    const snap = await ref.get();
    const last = Number((snap.exists && snap.data() && snap.data().sentAtMs) || 0);
    if (last && now - last < windowMs) return { skipped: 'dedup' };
    await ref.set({ key, sentAtMs: now, updatedAt: FieldValue().serverTimestamp() }, { merge: true });
  }
  return sendAdminNotification({
    type: 'critical',
    title: String((input && input.title) || '🚨 중요 시스템 알림'),
    body: String((input && input.body) || ''),
    entityId: String((input && input.entityId) || ''),
    adminUrl: adminUrlFor('critical')
  }, deps);
}

async function requestAdminDeviceRegistration(body, req, deps) {
  const db = (deps && deps.db) || dbRef();
  const deviceId = String((body && body.deviceId) || '').trim();
  const fcmToken = String((body && body.fcmToken) || '').trim();
  const deviceName = String((body && body.deviceName) || '').trim().slice(0, 80);
  const appVersion = String((body && body.appVersion) || '').trim().slice(0, 32);
  const platform = String((body && body.platform) || 'android').trim().slice(0, 16) || 'android';
  if (!validDeviceId(deviceId)) throw httpError(400, 'deviceId가 올바르지 않습니다.');
  if (!validToken(fcmToken)) throw httpError(400, 'fcmToken이 올바르지 않습니다.');
  await hitRateLimit(db, `reg:${clientIp(req)}`, 20, 60 * 60 * 1000);
  await hitRateLimit(db, `reg-dev:${deviceId}`, 8, 60 * 60 * 1000);

  const ref = db.collection(DEVICES).doc(deviceId);
  const snap = await ref.get();
  const now = FieldValue().serverTimestamp();
  const existing = snap.exists ? (snap.data() || {}) : {};
  const status = String(existing.status || '');
  const tokens = tokenPatch(fcmToken);

  if (snap.exists && (status === 'approved' || status === 'disabled')) {
    if (!secretOk(body, existing)) {
      throw httpError(403, '이미 등록된 기기입니다. deviceSecret이 필요합니다.');
    }
    const patch = Object.assign({}, tokens, {
      deviceName: deviceName || existing.deviceName || '',
      appVersion: appVersion || existing.appVersion || '',
      platform,
      lastSeenAt: now,
      tokenUpdatedAt: now,
      updatedAt: now
    });
    if (existing.disabledReason === 'invalid_token' && status === 'approved') {
      patch.enabled = true;
      patch.disabledReason = FieldValue().delete();
    }
    await ref.set(patch, { merge: true });
    return deviceSnapshot(deviceId, Object.assign({}, existing, patch, {
      enabled: patch.enabled != null ? patch.enabled : existing.enabled
    }));
  }

  if (snap.exists && status === 'revoked') {
    return deviceSnapshot(deviceId, existing);
  }

  let secret = null;
  const createPending = !snap.exists || status === 'rejected' || status === '' || status === 'pending';
  const patch = Object.assign({}, tokens, {
    platform,
    deviceName,
    appVersion,
    lastSeenAt: now,
    tokenUpdatedAt: now,
    updatedAt: now
  });
  if (createPending) {
    patch.status = 'pending';
    patch.enabled = false;
    patch.role = existing.role || 'staff';
    patch.paymentEnabled = existing.paymentEnabled !== false;
    patch.inquiryEnabled = existing.inquiryEnabled !== false;
    patch.refundEnabled = existing.refundEnabled !== false;
    patch.criticalEnabled = existing.criticalEnabled !== false;
    patch.requestedAt = now;
    patch.rejectedAt = FieldValue().delete();
    if (!existing.deviceSecretHash) {
      secret = newDeviceSecret();
      patch.deviceSecretHash = hashSecret(secret);
    }
    if (!snap.exists) patch.createdAt = now;
  }
  await ref.set(patch, { merge: true });
  const after = Object.assign({}, existing, patch, { status: patch.status || existing.status });
  const out = deviceSnapshot(deviceId, after);
  if (secret) out.deviceSecret = secret;
  return out;
}

async function getAdminDeviceStatus(body, deps) {
  const db = (deps && deps.db) || dbRef();
  const deviceId = String((body && body.deviceId) || '').trim();
  if (!validDeviceId(deviceId)) throw httpError(400, 'deviceId가 올바르지 않습니다.');
  const ref = db.collection(DEVICES).doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) {
    return deviceSnapshot(deviceId, { status: 'unregistered', enabled: false });
  }
  const data = snap.data() || {};
  if (!secretOk(body, data)) throw httpError(403, '기기를 확인할 수 없습니다.');
  await ref.set({ lastSeenAt: FieldValue().serverTimestamp() }, { merge: true });
  return deviceSnapshot(deviceId, data);
}

async function updateAdminDeviceToken(body, deps) {
  const db = (deps && deps.db) || dbRef();
  const found = await assertDevice(db, body);
  const token = String((body && body.fcmToken) || '').trim();
  if (!validToken(token)) throw httpError(400, 'fcmToken이 올바르지 않습니다.');
  const patch = Object.assign({}, tokenPatch(token), {
    tokenUpdatedAt: FieldValue().serverTimestamp(),
    lastSeenAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp()
  });
  if (body.appVersion) patch.appVersion = String(body.appVersion).slice(0, 32);
  if (body.deviceName) patch.deviceName = String(body.deviceName).slice(0, 80);
  if (found.data.status === 'approved' && found.data.disabledReason === 'invalid_token') {
    patch.enabled = true;
    patch.disabledReason = FieldValue().delete();
  }
  await found.ref.set(patch, { merge: true });
  return { ok: true };
}

async function updateAdminDeviceSettings(body, deps) {
  const db = (deps && deps.db) || dbRef();
  const found = await assertDevice(db, body);
  if (String(found.data.status) !== 'approved') {
    throw httpError(403, '승인된 기기만 알림 설정을 변경할 수 있습니다.');
  }
  const patch = {
    paymentEnabled: bool(body.paymentEnabled, found.data.paymentEnabled !== false),
    inquiryEnabled: bool(body.inquiryEnabled, found.data.inquiryEnabled !== false),
    refundEnabled: bool(body.refundEnabled, found.data.refundEnabled !== false),
    criticalEnabled: bool(body.criticalEnabled, found.data.criticalEnabled !== false),
    lastSeenAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp()
  };
  await found.ref.set(patch, { merge: true });
  return deviceSnapshot(found.deviceId, Object.assign({}, found.data, patch));
}

async function sendAdminDeviceTestPush(body, deps) {
  const db = (deps && deps.db) || dbRef();
  const found = await assertDevice(db, body);
  if (!isPushTarget(found.data)) {
    throw httpError(403, '승인된 활성 기기만 테스트 알림을 받을 수 있습니다.');
  }
  const fromApp = String((body && body.source) || '') !== 'web';
  return sendAdminNotification({
    type: 'test',
    title: '🔔 MidiAI Admin 테스트',
    body: fromApp
      ? 'Android 앱에서 테스트 알림을 요청했습니다.'
      : '웹 관리자 패널에서 테스트 알림을 전송했습니다.',
    deviceIds: [found.deviceId]
  }, deps);
}

async function unregisterAdminDevice(body, deps) {
  const db = (deps && deps.db) || dbRef();
  const found = await assertDevice(db, body);
  await found.ref.set({
    status: 'revoked',
    enabled: false,
    revokedAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp()
  }, { merge: true });
  return { ok: true, status: 'revoked', enabled: false };
}

async function overview(deps) {
  const db = (deps && deps.db) || dbRef();
  const [devSnap, settings, logSnap] = await Promise.all([
    db.collection(DEVICES).get(),
    loadGlobalSettings(db),
    db.collection(LOGS).orderBy('createdAt', 'desc').limit(40).get().catch(() => ({ docs: [] }))
  ]);
  const devices = devSnap.docs.map((d) => deviceSnapshot(d.id, d.data()));
  const counts = {
    registered: devices.length,
    active: devices.filter((d) => d.status === 'approved' && d.enabled).length,
    pending: devices.filter((d) => d.status === 'pending').length,
    disabled: devices.filter((d) => d.status === 'disabled' || (d.status === 'approved' && !d.enabled)).length,
    revoked: devices.filter((d) => d.status === 'revoked').length,
    rejected: devices.filter((d) => d.status === 'rejected').length
  };
  let success = 0;
  let attempted = 0;
  logSnap.docs.slice(0, 20).forEach((doc) => {
    const d = doc.data() || {};
    success += Number(d.success || 0);
    attempted += Number(d.attempted || 0);
  });
  return {
    ok: true,
    fcm: 'ok',
    counts,
    successRate: attempted ? Math.round((success / attempted) * 100) : 100,
    global: settings,
    devices,
    pending: devices.filter((d) => d.status === 'pending'),
    logs: logSnap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        type: d.type || '',
        attempted: Number(d.attempted || 0),
        success: Number(d.success || 0),
        failed: Number(d.failed || 0),
        title: d.title || '',
        createdAt: d.createdAt || null
      };
    })
  };
}

async function adminAct(body, actorUid, deps) {
  const db = (deps && deps.db) || dbRef();
  const action = String((body && body.action) || '').trim();
  if (action === 'overview' || !action) return overview(deps);

  if (action === 'updateGlobal') {
    const patch = {
      paymentEnabled: bool(body.paymentEnabled, true),
      inquiryEnabled: bool(body.inquiryEnabled, true),
      refundEnabled: bool(body.refundEnabled, true),
      criticalEnabled: bool(body.criticalEnabled, true),
      updatedAt: FieldValue().serverTimestamp(),
      updatedBy: actorUid || ''
    };
    await db.collection(SETTINGS_COL).doc(SETTINGS_DOC).set(patch, { merge: true });
    return { ok: true, global: patch };
  }

  if (action === 'testAll') {
    return sendAdminNotification({
      type: 'test',
      title: '🔔 MidiAI Admin 테스트',
      body: '웹 관리자 패널에서 테스트 알림을 전송했습니다.'
    }, deps);
  }

  const deviceId = String((body && body.deviceId) || '').trim();
  if (!validDeviceId(deviceId)) throw httpError(400, 'deviceId가 올바르지 않습니다.');
  const ref = db.collection(DEVICES).doc(deviceId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError(404, '기기를 찾을 수 없습니다.');
  const data = snap.data() || {};
  const now = FieldValue().serverTimestamp();

  if (action === 'approve') {
    const role = String(body.role || 'staff').toLowerCase() === 'owner' ? 'owner' : 'staff';
    const label = String(body.label || data.label || data.deviceName || '').trim().slice(0, 80);
    await ref.set({
      status: 'approved',
      enabled: true,
      role,
      label,
      tokenInvalid: false,
      approvedAt: now,
      approvedBy: actorUid || '',
      updatedAt: now
    }, { merge: true });
    try {
      await sendAdminNotification({
        type: 'system',
        title: '✅ MidiAI Admin 승인 완료',
        body: '관리자 기기 등록이 승인되었습니다.',
        deviceIds: [deviceId]
      }, deps);
    } catch (_) { /* approval itself must succeed */ }
    return { ok: true, device: deviceSnapshot(deviceId, Object.assign({}, data, { status: 'approved', enabled: true, role, label })) };
  }

  if (action === 'reject') {
    await ref.set({ status: 'rejected', enabled: false, rejectedAt: now, updatedAt: now }, { merge: true });
    return { ok: true, status: 'rejected' };
  }
  if (action === 'disable') {
    await ref.set({
      status: 'disabled',
      enabled: false,
      disabledAt: now,
      disabledReason: 'admin',
      updatedAt: now
    }, { merge: true });
    return { ok: true, status: 'disabled' };
  }
  if (action === 'enable') {
    if (String(data.status) === 'revoked' || String(data.status) === 'rejected') {
      throw httpError(400, '차단/거절된 기기는 승인으로만 복구할 수 있습니다.');
    }
    await ref.set({
      status: 'approved',
      enabled: true,
      disabledReason: FieldValue().delete(),
      updatedAt: now
    }, { merge: true });
    return { ok: true, status: 'approved', enabled: true };
  }
  if (action === 'revoke') {
    await ref.set({
      status: 'revoked',
      enabled: false,
      revokedAt: now,
      revokedBy: actorUid || '',
      updatedAt: now
    }, { merge: true });
    return { ok: true, status: 'revoked' };
  }
  if (action === 'updateDevice') {
    const patch = { updatedAt: now };
    if (body.label != null) patch.label = String(body.label).slice(0, 80);
    if (body.role) patch.role = String(body.role).toLowerCase() === 'owner' ? 'owner' : 'staff';
    if (body.paymentEnabled != null) patch.paymentEnabled = bool(body.paymentEnabled, true);
    if (body.inquiryEnabled != null) patch.inquiryEnabled = bool(body.inquiryEnabled, true);
    if (body.refundEnabled != null) patch.refundEnabled = bool(body.refundEnabled, true);
    if (body.criticalEnabled != null) patch.criticalEnabled = bool(body.criticalEnabled, true);
    await ref.set(patch, { merge: true });
    return { ok: true, device: deviceSnapshot(deviceId, Object.assign({}, data, patch)) };
  }
  if (action === 'testDevice') {
    if (!isPushTarget(data)) throw httpError(400, '활성 승인 기기에만 테스트할 수 있습니다.');
    return sendAdminNotification({
      type: 'test',
      title: '🔔 MidiAI Admin 테스트',
      body: '웹 관리자 패널에서 테스트 알림을 전송했습니다.',
      deviceIds: [deviceId]
    }, deps);
  }
  throw httpError(400, '알 수 없는 작업입니다.');
}

function wrapHttp(cors, fn, opts) {
  return async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      if (opts && opts.requireAdmin) {
        const user = await opts.requireAdmin(req);
        const out = await fn(req.body || {}, user.uid, req);
        return res.json(Object.assign({ ok: true }, out && out.ok == null ? { ok: true } : {}, out));
      }
      const out = await fn(req.body || {}, req);
      return res.json(Object.assign({ ok: true }, out));
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) {
        console.error('adminPush', err && err.message ? err.message : err);
      }
      return res.status(status).json({
        ok: false,
        message: err.message || '요청에 실패했습니다.'
      });
    }
  };
}

function createHandlers({ cors, requireAdmin }) {
  return {
    requestAdminDeviceRegistration: wrapHttp(cors, (body, req) => requestAdminDeviceRegistration(body, req)),
    getAdminDeviceStatus: wrapHttp(cors, (body) => getAdminDeviceStatus(body)),
    updateAdminDeviceToken: wrapHttp(cors, (body) => updateAdminDeviceToken(body)),
    updateAdminDeviceSettings: wrapHttp(cors, (body) => updateAdminDeviceSettings(body)),
    sendAdminDeviceTestPush: wrapHttp(cors, (body) => sendAdminDeviceTestPush(body)),
    unregisterAdminDevice: wrapHttp(cors, (body) => unregisterAdminDevice(body)),
    manageAdminPush: wrapHttp(cors, (body, uid) => adminAct(body, uid), { requireAdmin })
  };
}

module.exports = {
  DEVICES,
  GLOBAL_DEFAULTS,
  httpError,
  assertDevice,
  wrapHttp,
  adminUrlFor,
  hashSecret,
  maskEmail,
  personName,
  photoUrlOf,
  formatAmount,
  isPushTarget,
  categoryEnabledOnDevice,
  deviceSnapshot,
  globalAllows,
  loadGlobalSettings,
  sendAdminNotification,
  maybeNotifyPaymentFcm,
  maybeNotifyInquiryFcm,
  maybeNotifyRefundFcm,
  notifyCritical,
  claimPushEvent,
  paymentPaidEventKey,
  paymentRefundEventKey,
  notifyCritical,
  requestAdminDeviceRegistration,
  getAdminDeviceStatus,
  updateAdminDeviceToken,
  updateAdminDeviceSettings,
  sendAdminDeviceTestPush,
  unregisterAdminDevice,
  adminAct,
  createHandlers,
  isInvalidTokenError,
  validDeviceId,
  proofOk,
  secretOk,
  tokenPatch,
  fcmSendToken
};
