'use strict';

const assert = require('assert');
const adminBulkEmail = require('./adminBulkEmail');
const adminScheduledEmail = require('./adminScheduledEmail');

function httpErrorRes() {
  const out = { statusCode: 200, body: null };
  const res = {
    set() {},
    status(code) { out.statusCode = code; return res; },
    json(body) { out.body = body; return res; }
  };
  return { res, out };
}

function toMillis(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

function memoryDb() {
  const store = new Map();
  function docRef(path) {
    const id = path.split('/').pop();
    const ref = {
      id,
      path,
      async get() {
        const v = store.get(path);
        return { exists: v != null, id, ref, data: () => (v ? { ...v } : undefined) };
      },
      async set(data, opts) {
        const prev = store.get(path) || {};
        store.set(path, opts && opts.merge ? { ...prev, ...data } : { ...data });
      }
    };
    return ref;
  }
  function applyFilters(name, filters) {
    const prefix = name + '/';
    const docs = [];
    for (const [k, v] of store.entries()) {
      if (!k.startsWith(prefix) || k.slice(prefix.length).includes('/')) continue;
      const ok = filters.every((f) => {
        if (f.op === '==') return v[f.field] === f.value;
        if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(v[f.field]);
        if (f.op === '<=') return toMillis(v[f.field]) <= toMillis(f.value);
        if (f.op === '>=') return toMillis(v[f.field]) >= toMillis(f.value);
        return false;
      });
      if (ok) {
        const id = k.slice(prefix.length);
        const ref = docRef(k);
        docs.push({ id, ref, data: () => ({ ...v }) });
      }
    }
    return docs;
  }
  function col(name) {
    let auto = 0;
    const makeQuery = (filters) => {
      const q = {
        where(field, op, value) {
          return makeQuery(filters.concat([{ field, op, value }]));
        },
        orderBy(field, dir) {
          q._order = { field, dir: dir || 'asc' };
          return q;
        },
        startAfter() { return q; },
        limit(n) { q._limit = n; return q; },
        async get() {
          let docs = applyFilters(name, filters);
          if (q._order) {
            const field = q._order.field;
            const dir = q._order.dir;
            docs.sort((a, b) => {
              const av = toMillis(a.data()[field]) || 0;
              const bv = toMillis(b.data()[field]) || 0;
              return dir === 'asc' ? av - bv : bv - av;
            });
          }
          if (q._limit) docs = docs.slice(0, q._limit);
          return { docs, empty: !docs.length };
        }
      };
      return q;
    };
    return {
      doc(id) {
        const docId = id || `auto_${++auto}`;
        return docRef(`${name}/${docId}`);
      },
      async add(data) {
        const id = `auto_${++auto}`;
        const ref = docRef(`${name}/${id}`);
        await ref.set(data);
        return ref;
      },
      where(field, op, value) {
        return makeQuery([{ field, op, value }]);
      },
      orderBy(field, dir) {
        return makeQuery([]).orderBy(field, dir);
      },
      limit(n) {
        const q = makeQuery([]);
        return q.limit(n);
      }
    };
  }
  return {
    store,
    collection: col,
    _txLock: Promise.resolve(),
    async runTransaction(fn) {
      const run = this._txLock.then(() => {
        const tx = {
          get: (ref) => ref.get(),
          set: (ref, data, opts) => ref.set(data, opts)
        };
        return fn(tx);
      });
      this._txLock = run.catch(() => {});
      return run;
    }
  };
}

const FieldValue = { serverTimestamp: () => new Date('2026-08-26T00:00:00.000Z') };
const Timestamp = {
  fromMillis(ms) {
    return { toMillis: () => ms, toDate: () => new Date(ms) };
  }
};

function makeHandlers({ db, sendMail, now, requireAdmin }) {
  const bulk = adminBulkEmail.createHandlers({
    db,
    admin: { firestore: { FieldValue }, auth: () => ({ getUser: async () => { throw new Error('no'); } }) },
    cors: () => false,
    requireAdmin: requireAdmin || (async () => ({ uid: 'admin1', email: 'admin@test.com' })),
    sendMail,
    chunkSize: 10,
    delayMs: 0
  });
  const scheduled = adminScheduledEmail.createHandlers({
    db,
    admin: { firestore: { FieldValue } },
    cors: () => false,
    requireAdmin: requireAdmin || (async () => ({ uid: 'admin1', email: 'admin@test.com' })),
    executeBulkEmail: bulk.executeAdminBulkEmail,
    ensureMailReady: bulk.ensureMailReady,
    nowFn: typeof now === 'function' ? now : () => now,
    Timestamp
  });
  return { bulk, scheduled };
}

async function testParseKst() {
  const ms = adminScheduledEmail.parseKstDateTime('2026-08-27', '10:00');
  assert.strictEqual(ms, Date.UTC(2026, 7, 27, 1, 0, 0));
  assert.strictEqual(adminScheduledEmail.formatKstLabel(ms), '2026-08-27 10:00 KST');
  try {
    adminScheduledEmail.parseKstDateTime('2026-02-31', '10:00');
    assert.fail('expected invalid date');
  } catch (e) {
    assert.strictEqual(e.code, 'SCHEDULE_TIME_INVALID');
  }
  console.log('ok kst parse');
}

async function testImmediateRegression() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const sent = [];
  const { bulk } = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 26, 1, 0, 0),
    sendMail: async (msg) => { sent.push(msg.to); }
  });
  const r = httpErrorRes();
  await bulk.sendAdminBulkEmail({
    method: 'POST',
    body: { recipientUids: ['u1'], subject: '즉시', body: '본문만', operationId: 'op_immed01' }
  }, r.res);
  assert.strictEqual(r.out.body.success, 1);
  assert.strictEqual(sent.length, 1);
  const hist = await db.collection('adminScheduledEmails').doc('op_immed01').get();
  assert.strictEqual(hist.exists, true);
  assert.strictEqual(hist.data().sendType, 'immediate');
  assert.strictEqual(hist.data().status, 'completed');
  assert.strictEqual(hist.data().body, '본문만');
  assert.strictEqual(hist.data().successCount, 1);
  assert.strictEqual(hist.data().failureCount, 0);
  assert.ok(!hist.data().scheduledAt);
  console.log('ok immediate send writes history, not a scheduled job');
}

async function testCreateDoesNotSend() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  await db.collection('users').doc('u2').set({ email: 'b@test.com' });
  const sent = [];
  const now = Date.UTC(2026, 7, 26, 1, 0, 0);
  const { scheduled } = makeHandlers({
    db,
    now,
    sendMail: async (msg) => { sent.push(msg.to); }
  });
  const r = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1', 'u2', 'u2'],
      subject: '보너스 안내',
      body: '보너스 10 크레딧을 지급했습니다.',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00',
      timezone: 'Asia/Seoul'
    }
  }, r.res);
  assert.strictEqual(r.out.body.ok, true);
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(r.out.body.job.recipientCount, 2);
  assert.strictEqual(r.out.body.job.status, 'scheduled');
  const snap = await db.collection('adminScheduledEmails').doc(r.out.body.jobId).get();
  assert.deepStrictEqual(snap.data().recipientUids, ['u1', 'u2']);
  assert.strictEqual(snap.data().sendType, 'scheduled');
  console.log('ok schedule create snapshots uids and does not send');
  return { db, jobId: r.out.body.jobId, scheduled, sent };
}

async function testPastRejected() {
  const db = memoryDb();
  const now = Date.UTC(2026, 7, 27, 2, 0, 0);
  const { scheduled } = makeHandlers({ db, now, sendMail: async () => {} });
  const r = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1'],
      subject: 's',
      body: 'b',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00',
      timezone: 'Asia/Seoul'
    }
  }, r.res);
  assert.strictEqual(r.out.statusCode, 400);
  assert.strictEqual(r.out.body.code, 'SCHEDULE_TIME_PAST');
  console.log('ok past-time rejected on server');
}

async function testAuthRequired() {
  const db = memoryDb();
  const { scheduled } = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 26, 1, 0, 0),
    sendMail: async () => {},
    requireAdmin: async () => {
      const e = new Error('관리자만 사용할 수 있습니다.');
      e.status = 403;
      throw e;
    }
  });
  const r = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1'],
      subject: 's',
      body: 'b',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, r.res);
  assert.strictEqual(r.out.statusCode, 403);
  console.log('ok schedule admin-only');
}

async function testDuplicateClaim() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const now = Date.UTC(2026, 7, 26, 1, 0, 0);
  const { scheduled } = makeHandlers({ db, now, sendMail: async () => {} });
  const created = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1'],
      subject: 's',
      body: 'hello',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, created.res);
  const jobRef = db.collection('adminScheduledEmails').doc(created.out.body.jobId);
  const due = Date.UTC(2026, 7, 27, 1, 5, 0);
  const first = await scheduled.claimScheduledEmail(jobRef, due);
  const second = await scheduled.claimScheduledEmail(jobRef, due);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'LEASED');
  console.log('ok duplicate worker claim');
}

async function testProcessSendsOnceAndSkipsNewUser() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  await db.collection('users').doc('u2').set({ email: 'b@test.com' });
  const sent = [];
  const handlers = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 26, 1, 0, 0),
    sendMail: async () => {}
  });
  const created = httpErrorRes();
  await handlers.scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1', 'u2'],
      subject: '보너스',
      body: '**보너스** 10 크레딧',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, created.res);
  await db.collection('users').doc('u3').set({ email: 'newbie@test.com' });
  const dueHandlers = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 27, 1, 1, 0),
    sendMail: async (msg) => {
      sent.push(msg.to);
      assert.strictEqual((String(msg.html).match(/안녕하세요/g) || []).length, 1);
      assert.strictEqual((String(msg.html).match(/감사합니다/g) || []).length, 1);
      assert.ok(String(msg.html).includes('<strong>보너스</strong>'));
    }
  });
  const out = await dueHandlers.scheduled.processDueScheduledEmails();
  assert.strictEqual(out.processed, 1);
  assert.deepStrictEqual(sent, ['a@test.com', 'b@test.com']);
  const job = await db.collection('adminScheduledEmails').doc(created.out.body.jobId).get();
  assert.strictEqual(job.data().status, 'completed');
  assert.strictEqual(job.data().recipientCount, 2);
  console.log('ok process due sends snapshot only + branded html once');
}

async function testPartialResumeSkipsSent() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  await db.collection('users').doc('u2').set({ email: 'b@test.com' });
  const sent = [];
  const createNow = Date.UTC(2026, 7, 26, 1, 0, 0);
  const createdHandlers = makeHandlers({ db, now: createNow, sendMail: async () => {} });
  const created = httpErrorRes();
  await createdHandlers.scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1', 'u2'],
      subject: 's',
      body: 'body',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, created.res);
  const jobId = created.out.body.jobId;
  await db.collection('adminBulkOperations').doc(jobId).set({
    status: 'IN_PROGRESS',
    doneUids: ['u1'],
    failed: [],
    type: 'EMAIL'
  });
  await db.collection('adminScheduledEmails').doc(jobId).set({
    status: 'processing',
    leaseUntil: Timestamp.fromMillis(Date.UTC(2026, 7, 27, 0, 50, 0)),
    scheduledAt: Timestamp.fromMillis(Date.UTC(2026, 7, 27, 1, 0, 0)),
    recipientUids: ['u1', 'u2'],
    recipientCount: 2,
    subject: 's',
    body: 'body',
    createdBy: 'admin1',
    jobId
  }, { merge: true });
  const resume = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 27, 1, 10, 0),
    sendMail: async (msg) => { sent.push(msg.to); }
  });
  await resume.scheduled.processDueScheduledEmails();
  assert.deepStrictEqual(sent, ['b@test.com']);
  console.log('ok partial resume does not resend sent uid');
}

async function testCancelPreventsSend() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const sent = [];
  const createdHandlers = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 26, 1, 0, 0),
    sendMail: async (msg) => { sent.push(msg.to); }
  });
  const created = httpErrorRes();
  await createdHandlers.scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1'],
      subject: 's',
      body: 'body',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, created.res);
  const cancel = httpErrorRes();
  await createdHandlers.scheduled.adminScheduledEmail({
    method: 'POST',
    body: { action: 'cancel', jobId: created.out.body.jobId }
  }, cancel.res);
  assert.strictEqual(cancel.out.body.status, 'cancelled');
  const due = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 27, 1, 10, 0),
    sendMail: async (msg) => { sent.push(msg.to); }
  });
  const out = await due.scheduled.processDueScheduledEmails();
  assert.strictEqual(out.processed, 0);
  assert.deepStrictEqual(sent, []);
  console.log('ok cancel prevents send');
}

async function testCancelProcessingRejected() {
  const db = memoryDb();
  const now = Date.UTC(2026, 7, 26, 1, 0, 0);
  const { scheduled } = makeHandlers({ db, now, sendMail: async () => {} });
  const created = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1'],
      subject: 's',
      body: 'body',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, created.res);
  await db.collection('adminScheduledEmails').doc(created.out.body.jobId).set({
    status: 'processing'
  }, { merge: true });
  const cancel = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: { action: 'cancel', jobId: created.out.body.jobId }
  }, cancel.res);
  assert.strictEqual(cancel.out.statusCode, 409);
  console.log('ok processing cancel rejected');
}

async function testHistoryUnifiesImmediateAndScheduled() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const now = Date.UTC(2026, 7, 26, 1, 0, 0);
  const { bulk, scheduled } = makeHandlers({ db, now, sendMail: async () => {} });
  const immed = httpErrorRes();
  await bulk.sendAdminBulkEmail({
    method: 'POST',
    body: { recipientUids: ['u1'], subject: '즉시 안내', body: '지금 보냅니다.', operationId: 'op_hist_im1' }
  }, immed.res);
  const created = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1'],
      subject: '예약 안내',
      body: '나중에 보냅니다.',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, created.res);
  const list = httpErrorRes();
  await scheduled.adminScheduledEmail({ method: 'POST', body: { action: 'list' } }, list.res);
  const jobs = list.out.body.jobs || [];
  assert.ok(jobs.some((j) => j.sendType === 'immediate' && j.subject === '즉시 안내' && j.status === 'completed'));
  assert.ok(jobs.some((j) => j.sendType === 'scheduled' && j.subject === '예약 안내' && j.status === 'scheduled'));
  const got = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: { action: 'get', jobId: 'op_hist_im1' }
  }, got.res);
  assert.strictEqual(got.out.body.job.body, '지금 보냅니다.');
  console.log('ok history lists immediate + scheduled with body');
}

async function testPartialFailureHistory() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  await db.collection('users').doc('u2').set({ email: 'b@test.com' });
  await db.collection('users').doc('u3').set({ email: '' });
  const { bulk, scheduled } = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 26, 1, 0, 0),
    sendMail: async (msg) => {
      if (msg.to === 'b@test.com') throw new Error('smtp');
    }
  });
  const r = httpErrorRes();
  await bulk.sendAdminBulkEmail({
    method: 'POST',
    body: {
      recipientUids: ['u1', 'u2', 'u3'],
      subject: '부분 실패',
      body: '본문',
      operationId: 'op_partial_hist'
    }
  }, r.res);
  assert.strictEqual(r.out.body.success, 1);
  assert.strictEqual(r.out.body.failed, 2);
  const snap = await db.collection('adminScheduledEmails').doc('op_partial_hist').get();
  assert.strictEqual(snap.data().status, 'partial');
  assert.strictEqual(snap.data().successCount, 1);
  assert.strictEqual(snap.data().failureCount, 2);
  assert.strictEqual(snap.data().recipientCount, 3);
  const list = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: { action: 'list', statusFilter: 'failed' }
  }, list.res);
  assert.ok((list.out.body.jobs || []).some((j) => j.jobId === 'op_partial_hist' && j.status === 'partial'));
  console.log('ok partial failure history');
}

async function testCancelRemainsInHistory() {
  const db = memoryDb();
  const now = Date.UTC(2026, 7, 26, 1, 0, 0);
  const { scheduled } = makeHandlers({ db, now, sendMail: async () => {} });
  const created = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: {
      action: 'create',
      recipientUids: ['u1'],
      subject: '취소할 메일',
      body: '본문',
      scheduledDate: '2026-08-27',
      scheduledTime: '10:00'
    }
  }, created.res);
  const jobId = created.out.body.jobId;
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: { action: 'cancel', jobId }
  }, httpErrorRes().res);
  const list = httpErrorRes();
  await scheduled.adminScheduledEmail({
    method: 'POST',
    body: { action: 'list', statusFilter: 'cancelled' }
  }, list.res);
  const row = (list.out.body.jobs || []).find((j) => j.jobId === jobId);
  assert.ok(row);
  assert.strictEqual(row.status, 'cancelled');
  console.log('ok cancelled job remains in history');
}

async function testWorkerSkipsImmediateHistory() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const sent = [];
  const { scheduled } = makeHandlers({
    db,
    now: Date.UTC(2026, 7, 27, 1, 10, 0),
    sendMail: async (msg) => { sent.push(msg.to); }
  });
  await db.collection('adminScheduledEmails').doc('op_immed_stuck').set({
    jobId: 'op_immed_stuck',
    sendType: 'immediate',
    status: 'processing',
    subject: '즉시',
    body: '본문',
    recipientUids: ['u1'],
    recipientCount: 1,
    createdBy: 'admin1',
    leaseUntil: Timestamp.fromMillis(Date.UTC(2026, 7, 27, 0, 0, 0))
  });
  const out = await scheduled.processDueScheduledEmails();
  assert.strictEqual(out.processed, 0);
  assert.deepStrictEqual(sent, []);
  console.log('ok worker skips immediate history docs');
}

(async () => {
  await testParseKst();
  await testImmediateRegression();
  await testCreateDoesNotSend();
  await testPastRejected();
  await testAuthRequired();
  await testDuplicateClaim();
  await testProcessSendsOnceAndSkipsNewUser();
  await testPartialResumeSkipsSent();
  await testCancelPreventsSend();
  await testCancelProcessingRejected();
  await testHistoryUnifiesImmediateAndScheduled();
  await testPartialFailureHistory();
  await testCancelRemainsInHistory();
  await testWorkerSkipsImmediateHistory();
  console.log('all scheduled email tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
