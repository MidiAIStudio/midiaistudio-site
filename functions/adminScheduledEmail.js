'use strict';

const crypto = require('crypto');
const { uniqueUids } = require('./adminCredits');
const { normalizeBrandInput } = require('./adminEmailTemplate');
const { parseBulkEmailInput, bodyPreview } = require('./adminBulkEmail');

const COLLECTION = 'adminScheduledEmails';
const TIMEZONE = 'Asia/Seoul';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LEASE_MS = 12 * 60 * 1000;
const MAX_JOBS_PER_TICK = 1;
const LIST_LIMIT = 30;
const LIST_MAX = 50;
const SUBJECT_MAX = 200;
const BODY_MAX = 20000;

const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled']);
const LIST_FILTERS = {
  all: null,
  scheduled: ['scheduled'],
  processing: ['processing'],
  completed: ['completed'],
  failed: ['failed', 'partial'],
  cancelled: ['cancelled']
};

function httpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value.toDate === 'function') {
    const d = value.toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function formatKstLabel(ms) {
  const shifted = new Date(Number(ms) + KST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())} ${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())} KST`;
}

function parseKstDateTime(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || '').trim());
  if (!dm || !tm) {
    throw httpError(400, 'SCHEDULE_TIME_INVALID', '예약 날짜와 시간을 확인해 주세요.');
  }
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw httpError(400, 'SCHEDULE_TIME_INVALID', '예약 날짜와 시간을 확인해 주세요.');
  }
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - KST_OFFSET_MS;
  const check = new Date(utcMs + KST_OFFSET_MS);
  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() + 1 !== month
    || check.getUTCDate() !== day
    || check.getUTCHours() !== hour
    || check.getUTCMinutes() !== minute
  ) {
    throw httpError(400, 'SCHEDULE_TIME_INVALID', '예약 날짜와 시간을 확인해 주세요.');
  }
  return utcMs;
}

function newJobId() {
  return `se_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function inferSendType(d) {
  const raw = String(d.sendType || '').trim();
  if (raw === 'immediate' || raw === 'scheduled') return raw;
  return toMillis(d.scheduledAt) ? 'scheduled' : 'immediate';
}

function publicJob(d, { includeBody = false } = {}) {
  const scheduledMs = toMillis(d.scheduledAt);
  const createdMs = toMillis(d.createdAt);
  const startedMs = toMillis(d.startedAt);
  const completedMs = toMillis(d.completedAt);
  const cancelledMs = toMillis(d.cancelledAt);
  const sendType = inferSendType(d);
  const out = {
    jobId: d.jobId,
    operationId: d.operationId || d.jobId,
    sendType,
    status: d.status,
    timezone: d.timezone || TIMEZONE,
    subject: d.subject || '',
    bodyPreview: d.bodyPreview || '',
    recipientCount: Number(d.recipientCount || 0),
    successCount: Number(d.successCount || 0),
    failureCount: Number(d.failureCount || 0),
    scheduledAtMs: scheduledMs,
    scheduledAtKst: scheduledMs ? formatKstLabel(scheduledMs) : '',
    createdAtMs: createdMs,
    createdAtKst: createdMs ? formatKstLabel(createdMs) : '',
    startedAtMs: startedMs,
    startedAtKst: startedMs ? formatKstLabel(startedMs) : '',
    completedAtMs: completedMs,
    completedAtKst: completedMs ? formatKstLabel(completedMs) : '',
    cancelledAtMs: cancelledMs,
    cancelledAtKst: cancelledMs ? formatKstLabel(cancelledMs) : '',
    createdBy: d.createdBy || '',
    createdByEmail: d.createdByEmail || '',
    cancelledBy: d.cancelledBy || '',
    error: d.error || ''
  };
  if (includeBody) {
    out.body = d.body || '';
    out.preheader = d.preheader || '';
    out.bannerEnabled = !!d.bannerEnabled;
    out.bannerEyebrow = d.bannerEyebrow || '';
    out.bannerTitle = d.bannerTitle || '';
    out.bannerDescription = d.bannerDescription || '';
    out.ctaLabel = d.ctaLabel || '';
    out.ctaUrl = d.ctaUrl || '';
    out.bannerImageUrl = d.bannerImageUrl || '';
    out.recipientCount = Array.isArray(d.recipientUids) ? d.recipientUids.length : out.recipientCount;
    out.failedSummary = Array.isArray(d.failedSummary)
      ? d.failedSummary.slice(0, 50).map((row) => ({
        uid: String((row && row.uid) || ''),
        code: String((row && row.code) || ''),
        message: String((row && row.message) || '').slice(0, 160)
      })).filter((row) => row.uid)
      : [];
  }
  return out;
}

function stampFromMillis(Timestamp, ms) {
  if (Timestamp && typeof Timestamp.fromMillis === 'function') {
    return Timestamp.fromMillis(ms);
  }
  return new Date(ms);
}

async function writeAudit(db, FieldValue, {
  adminUser,
  action,
  result,
  summary,
  jobId,
  metadata
}) {
  try {
    await db.collection('adminAuditLogs').add({
      timestamp: FieldValue.serverTimestamp(),
      targetUserId: jobId || 'scheduled-email',
      category: 'message',
      action,
      actorId: (adminUser && adminUser.uid) || 'system',
      actorEmail: (adminUser && adminUser.email) || '',
      actorType: 'admin',
      result,
      summary: String(summary || '').slice(0, 180),
      metadata: metadata || {}
    });
  } catch (err) {
    console.warn('adminScheduledEmail audit', action, err && err.message);
  }
}

function matchesFilter(data, field, op, value) {
  const left = data[field];
  if (op === '==') return left === value;
  if (op === '<=') return toMillis(left) <= toMillis(value);
  if (op === '>=') return toMillis(left) >= toMillis(value);
  if (op === '<') return toMillis(left) < toMillis(value);
  if (op === '>') return toMillis(left) > toMillis(value);
  return false;
}

async function claimScheduledEmail(db, FieldValue, Timestamp, jobRef, nowMs, leaseMs = LEASE_MS) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return { ok: false, reason: 'MISSING' };
    const data = snap.data() || {};
    const status = String(data.status || '');
    if (TERMINAL.has(status)) return { ok: false, reason: 'TERMINAL', data };
    if (String(data.sendType || '') === 'immediate') return { ok: false, reason: 'IMMEDIATE', data };
    const leaseUntil = stampFromMillis(Timestamp, nowMs + leaseMs);
    if (status === 'scheduled') {
      if (toMillis(data.scheduledAt) > nowMs) return { ok: false, reason: 'NOT_DUE', data };
      tx.set(jobRef, {
        status: 'processing',
        startedAt: FieldValue.serverTimestamp(),
        leaseUntil,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return { ok: true, resume: false, data };
    }
    if (status === 'processing') {
      const leaseMsLeft = toMillis(data.leaseUntil);
      if (leaseMsLeft && leaseMsLeft > nowMs) return { ok: false, reason: 'LEASED', data };
      tx.set(jobRef, {
        leaseUntil,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return { ok: true, resume: true, data };
    }
    return { ok: false, reason: 'UNKNOWN', data };
  });
}

function createHandlers({
  db,
  admin,
  cors,
  requireAdmin,
  executeBulkEmail,
  ensureMailReady,
  nowFn = () => Date.now(),
  Timestamp
}) {
  const FieldValue = admin.firestore.FieldValue;
  const Ts = Timestamp || (admin.firestore && admin.firestore.Timestamp);

  async function createScheduledEmail(adminUser, body) {
    const parsed = parseBulkEmailInput({
      ...body,
      operationId: newJobId()
    });
    const scheduledMs = parseKstDateTime(body.scheduledDate, body.scheduledTime);
    if (scheduledMs <= nowFn()) {
      throw httpError(400, 'SCHEDULE_TIME_PAST', '예약 시간은 현재 시간 이후로 설정해 주세요.');
    }
    const timezone = String(body.timezone || TIMEZONE).trim() || TIMEZONE;
    if (timezone !== TIMEZONE) {
      throw httpError(400, 'TIMEZONE_UNSUPPORTED', '예약 시간은 대한민국 표준시(KST)만 지원합니다.');
    }
    const jobId = parsed.operationId;
    const jobRef = db.collection(COLLECTION).doc(jobId);
    const brand = parsed.brand;
    const payload = {
      jobId,
      operationId: jobId,
      sendType: 'scheduled',
      status: 'scheduled',
      timezone: TIMEZONE,
      scheduledAt: stampFromMillis(Ts, scheduledMs),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: adminUser.uid,
      createdByEmail: adminUser.email || '',
      subject: brand.subject.slice(0, SUBJECT_MAX),
      body: brand.body.slice(0, BODY_MAX),
      bodyPreview: bodyPreview(brand.body),
      preheader: brand.preheader || '',
      bannerEnabled: !!brand.bannerEnabled,
      bannerEyebrow: brand.bannerEyebrow || '',
      bannerTitle: brand.bannerTitle || '',
      bannerDescription: brand.bannerDescription || '',
      ctaLabel: brand.ctaLabel || '',
      ctaUrl: brand.ctaUrl || '',
      bannerImageUrl: brand.bannerImageUrl || '',
      recipientUids: parsed.uids,
      recipientCount: parsed.uids.length,
      successCount: 0,
      failureCount: 0,
      error: ''
    };
    await jobRef.set(payload);
    await writeAudit(db, FieldValue, {
      adminUser,
      action: 'ADMIN_EMAIL_SCHEDULE_CREATED',
      result: 'success',
      summary: `메일 예약 · ${payload.subject}`.slice(0, 180),
      jobId,
      metadata: {
        jobId,
        subject: payload.subject,
        recipientCount: payload.recipientCount,
        scheduledAtKst: formatKstLabel(scheduledMs),
        scheduledAtMs: scheduledMs
      }
    });
    const saved = { ...payload, createdAt: new Date(nowFn()), scheduledAt: stampFromMillis(Ts, scheduledMs) };
    return { ok: true, jobId, scheduledAtKst: formatKstLabel(scheduledMs), job: publicJob(saved, { includeBody: false }) };
  }

  async function listScheduledEmails(body = {}) {
    const filterKey = String(body.statusFilter || body.filter || 'all').trim() || 'all';
    const statuses = Object.prototype.hasOwnProperty.call(LIST_FILTERS, filterKey)
      ? LIST_FILTERS[filterKey]
      : LIST_FILTERS.all;
    const pageSize = Math.min(LIST_MAX, Math.max(1, Number(body.limit) || LIST_LIMIT));
    const cursorMs = Number(body.cursorMs || 0);
    const orderField = filterKey === 'scheduled' ? 'scheduledAt' : 'createdAt';
    const orderDir = filterKey === 'scheduled' ? 'asc' : 'desc';

    function sortJobs(jobs) {
      jobs.sort((a, b) => {
        const av = orderField === 'scheduledAt' ? (a.scheduledAtMs || 0) : (a.createdAtMs || 0);
        const bv = orderField === 'scheduledAt' ? (b.scheduledAtMs || 0) : (b.createdAtMs || 0);
        return orderDir === 'asc' ? av - bv : bv - av;
      });
      return jobs;
    }

    function applyStatus(jobs) {
      if (!statuses) return jobs;
      return jobs.filter((job) => statuses.includes(job.status));
    }

    async function fetchFallback() {
      let snap;
      try {
        snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(LIST_MAX).get();
      } catch (_) {
        snap = await db.collection(COLLECTION).limit(LIST_MAX).get();
      }
      let jobs = (snap.docs || []).map((doc) => publicJob({ jobId: doc.id, ...(doc.data() || {}) }));
      jobs = applyStatus(jobs);
      jobs = sortJobs(jobs);
      if (cursorMs) {
        jobs = jobs.filter((job) => {
          const ms = orderField === 'scheduledAt' ? job.scheduledAtMs : job.createdAtMs;
          return orderDir === 'asc' ? ms > cursorMs : ms < cursorMs;
        });
      }
      const page = jobs.slice(0, pageSize);
      const last = page[page.length - 1];
      return {
        ok: true,
        jobs: page,
        hasMore: jobs.length > pageSize,
        cursorMs: last ? (orderField === 'scheduledAt' ? last.scheduledAtMs : last.createdAtMs) : 0
      };
    }

    try {
      let query = db.collection(COLLECTION);
      if (statuses && statuses.length === 1) {
        query = query.where('status', '==', statuses[0]);
      } else if (statuses && statuses.length > 1) {
        query = query.where('status', 'in', statuses);
      }
      query = query.orderBy(orderField, orderDir);
      if (cursorMs) {
        query = query.startAfter(stampFromMillis(Ts, cursorMs));
      }
      query = query.limit(pageSize + 1);
      const snap = await query.get();
      const docs = snap.docs || [];
      const jobs = docs.slice(0, pageSize).map((doc) => publicJob({ jobId: doc.id, ...(doc.data() || {}) }));
      const last = jobs[jobs.length - 1];
      return {
        ok: true,
        jobs,
        hasMore: docs.length > pageSize,
        cursorMs: last ? (orderField === 'scheduledAt' ? last.scheduledAtMs : last.createdAtMs) : 0
      };
    } catch (err) {
      console.warn('adminScheduledEmail list', err && err.message);
      return fetchFallback();
    }
  }

  async function getScheduledEmail(jobId) {
    const id = String(jobId || '').trim();
    if (!id) throw httpError(400, 'JOB_ID_REQUIRED', '예약 항목이 없습니다.');
    const snap = await db.collection(COLLECTION).doc(id).get();
    if (!snap.exists) throw httpError(404, 'JOB_NOT_FOUND', '예약 항목을 찾을 수 없습니다.');
    const data = { jobId: id, ...(snap.data() || {}) };
    return { ok: true, job: publicJob(data, { includeBody: true }) };
  }

  async function cancelScheduledEmail(adminUser, jobId) {
    const id = String(jobId || '').trim();
    if (!id) throw httpError(400, 'JOB_ID_REQUIRED', '예약 항목이 없습니다.');
    const jobRef = db.collection(COLLECTION).doc(id);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      if (!snap.exists) throw httpError(404, 'JOB_NOT_FOUND', '예약 항목을 찾을 수 없습니다.');
      const data = snap.data() || {};
      if (String(data.status) !== 'scheduled') {
        throw httpError(409, 'JOB_NOT_CANCELLABLE', '예약 상태에서만 취소할 수 있습니다.');
      }
      tx.set(jobRef, {
        status: 'cancelled',
        cancelledAt: FieldValue.serverTimestamp(),
        cancelledBy: adminUser.uid,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return data;
    });
    await writeAudit(db, FieldValue, {
      adminUser,
      action: 'ADMIN_EMAIL_SCHEDULE_CANCELLED',
      result: 'success',
      summary: `메일 예약 취소 · ${result.subject || ''}`.slice(0, 180),
      jobId: id,
      metadata: {
        jobId: id,
        subject: result.subject || '',
        recipientCount: Number(result.recipientCount || 0),
        scheduledAtKst: formatKstLabel(toMillis(result.scheduledAt))
      }
    });
    return { ok: true, jobId: id, status: 'cancelled' };
  }

  async function runClaimedJob(jobRef, data, adminUser) {
    const uids = uniqueUids(data.recipientUids);
    const brand = normalizeBrandInput({
      subject: data.subject,
      body: data.body,
      preheader: data.preheader,
      bannerEnabled: data.bannerEnabled,
      bannerEyebrow: data.bannerEyebrow,
      bannerTitle: data.bannerTitle,
      bannerDescription: data.bannerDescription,
      ctaLabel: data.ctaLabel,
      ctaUrl: data.ctaUrl,
      bannerImageUrl: data.bannerImageUrl
    });
    if (typeof executeBulkEmail !== 'function') {
      throw httpError(500, 'SEND_PIPELINE_MISSING', '메일 발송 파이프라인을 찾을 수 없습니다.');
    }
    if (typeof ensureMailReady === 'function') {
      await ensureMailReady();
    }
    await writeAudit(db, FieldValue, {
      adminUser,
      action: 'ADMIN_EMAIL_SCHEDULE_STARTED',
      result: 'success',
      summary: `메일 예약 발송 시작 · ${brand.subject}`.slice(0, 180),
      jobId: data.jobId,
      metadata: {
        jobId: data.jobId,
        subject: brand.subject,
        recipientCount: uids.length,
        scheduledAtKst: formatKstLabel(toMillis(data.scheduledAt))
      }
    });
    const sent = await executeBulkEmail({
      adminUser,
      brand,
      uids,
      operationId: data.jobId,
      auditMetadata: { scheduledJobId: data.jobId, scheduled: true }
    });
    const successCount = Number(sent.success || 0);
    const failureCount = Number(sent.failed || 0);
    const status = failureCount && successCount
      ? 'partial'
      : (failureCount && !successCount ? 'failed' : 'completed');
    const failedSummary = Array.isArray(sent.failures)
      ? sent.failures.slice(0, 50).map((row) => ({
        uid: String((row && row.uid) || ''),
        code: String((row && row.code) || ''),
        message: String((row && row.message) || '').slice(0, 160)
      })).filter((row) => row.uid)
      : [];
    await jobRef.set({
      status,
      successCount,
      failureCount,
      failedSummary,
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      error: status === 'failed'
        ? '메일 발송에 실패했습니다.'
        : (status === 'partial' ? '일부 수신자에게 발송하지 못했습니다.' : '')
    }, { merge: true });
    await writeAudit(db, FieldValue, {
      adminUser,
      action: status === 'failed' ? 'ADMIN_EMAIL_SCHEDULE_FAILED' : 'ADMIN_EMAIL_SCHEDULE_COMPLETED',
      result: status === 'completed' ? 'success' : (status === 'partial' ? 'partial' : 'fail'),
      summary: `메일 예약 발송 ${status} · ${brand.subject}`.slice(0, 180),
      jobId: data.jobId,
      metadata: {
        jobId: data.jobId,
        subject: brand.subject,
        recipientCount: uids.length,
        successCount,
        failureCount,
        scheduledAtKst: formatKstLabel(toMillis(data.scheduledAt))
      }
    });
    return { ok: true, jobId: data.jobId, status, success: successCount, failed: failureCount };
  }

  async function loadCandidates(nowMs) {
    const nowStamp = stampFromMillis(Ts, nowMs);
    const jobs = [];
    const seen = new Set();
    async function pull(query) {
      try {
        const snap = await query.get();
        (snap.docs || []).forEach((doc) => {
          if (seen.has(doc.id)) return;
          seen.add(doc.id);
          jobs.push({ ref: doc.ref || db.collection(COLLECTION).doc(doc.id), id: doc.id, data: { jobId: doc.id, ...(doc.data() || {}) } });
        });
      } catch (err) {
        console.warn('adminScheduledEmail query', err && err.message);
      }
    }
    await pull(
      db.collection(COLLECTION)
        .where('status', '==', 'scheduled')
        .where('scheduledAt', '<=', nowStamp)
        .limit(8)
    );
    await pull(
      db.collection(COLLECTION)
        .where('status', '==', 'processing')
        .where('leaseUntil', '<=', nowStamp)
        .limit(8)
    );
    return jobs.filter((job) => inferSendType(job.data) !== 'immediate');
  }

  async function processDueScheduledEmails() {
    const nowMs = nowFn();
    const candidates = await loadCandidates(nowMs);
    const results = [];
    for (const job of candidates) {
      if (results.length >= MAX_JOBS_PER_TICK) break;
      const claim = await claimScheduledEmail(db, FieldValue, Ts, job.ref, nowMs, LEASE_MS);
      if (!claim.ok) continue;
      const actor = {
        uid: claim.data.createdBy || 'system',
        email: claim.data.createdByEmail || ''
      };
      try {
        const out = await runClaimedJob(job.ref, claim.data, actor);
        results.push(out);
      } catch (err) {
        const message = err.message || '예약 메일 발송에 실패했습니다.';
        const code = String(err.code || '');
        const attempts = Number(claim.data.attemptCount || 0) + 1;
        const terminal = code === 'MAIL_NOT_CONFIGURED' || code === 'SMTP_AUTH_FAILED' || attempts >= 3;
        console.warn('processDueScheduledEmails job', job.id, code, message);
        try {
          await job.ref.set({
            status: terminal ? 'failed' : 'processing',
            attemptCount: attempts,
            error: String(message).slice(0, 300),
            updatedAt: FieldValue.serverTimestamp(),
            leaseUntil: stampFromMillis(Ts, terminal ? nowMs + LEASE_MS : nowMs)
          }, { merge: true });
        } catch (_) { /* ignore */ }
        await writeAudit(db, FieldValue, {
          adminUser: actor,
          action: 'ADMIN_EMAIL_SCHEDULE_FAILED',
          result: 'fail',
          summary: `메일 예약 발송 실패 · ${claim.data.subject || ''}`.slice(0, 180),
          jobId: job.id,
          metadata: {
            jobId: job.id,
            subject: claim.data.subject || '',
            recipientCount: Number(claim.data.recipientCount || 0),
            error: String(err.code || message).slice(0, 120)
          }
        });
      }
    }
    return { ok: true, processed: results.length, results };
  }

  async function adminScheduledEmail(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const adminUser = await requireAdmin(req);
      const body = req.body || {};
      const action = String(body.action || 'create').trim();
      if (action === 'create') {
        return res.json(await createScheduledEmail(adminUser, body));
      }
      if (action === 'list') {
        return res.json(await listScheduledEmails(body));
      }
      if (action === 'get') {
        return res.json(await getScheduledEmail(body.jobId));
      }
      if (action === 'cancel') {
        return res.json(await cancelScheduledEmail(adminUser, body.jobId));
      }
      throw httpError(400, 'ACTION_INVALID', '알 수 없는 요청입니다.');
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        code: err.code || 'SCHEDULED_EMAIL_FAILED',
        message: err.message || '예약 메일 처리에 실패했습니다.'
      });
    }
  }

  return {
    adminScheduledEmail,
    processDueScheduledEmails,
    createScheduledEmail,
    cancelScheduledEmail,
    claimScheduledEmail: (jobRef, nowMs) => claimScheduledEmail(db, FieldValue, Ts, jobRef, nowMs, LEASE_MS)
  };
}

module.exports = {
  createHandlers,
  parseKstDateTime,
  formatKstLabel,
  toMillis,
  claimScheduledEmail,
  COLLECTION,
  TIMEZONE,
  LEASE_MS,
  matchesFilter
};
