'use strict';

const assert = require('assert');
const adminCredits = require('./adminCredits');
const adminBulkEmail = require('./adminBulkEmail');

function httpErrorRes() {
  const out = { statusCode: 200, body: null };
  const res = {
    set() {},
    status(code) { out.statusCode = code; return res; },
    json(body) { out.body = body; return res; }
  };
  return { res, out };
}

function memoryDb() {
  const store = new Map();
  const keyOf = (path) => path;
  function docRef(path) {
    const id = path.split('/').pop();
    const ref = {
      id,
      path,
      async get() {
        const v = store.get(keyOf(path));
        return { exists: v != null, id, data: () => (v ? { ...v } : undefined) };
      },
      async set(data, opts) {
        const prev = store.get(keyOf(path)) || {};
        const next = opts && opts.merge ? { ...prev, ...data } : { ...data };
        store.set(keyOf(path), next);
      },
      collection(name) {
        return col(`${path}/${name}`);
      }
    };
    return ref;
  }
  function col(name) {
    let auto = 0;
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
        return {
          async get() {
            const prefix = name + '/';
            const docs = [];
            for (const [k, v] of store.entries()) {
              if (!k.startsWith(prefix) || k.slice(prefix.length).includes('/')) continue;
              if (op === '==' && v[field] === value) {
                docs.push({ id: k.slice(prefix.length), data: () => ({ ...v }) });
              }
            }
            return { docs };
          },
          orderBy() { return this; },
          limit() { return this; }
        };
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

const FieldValue = { serverTimestamp: () => new Date('2026-08-24T00:00:00.000Z') };

function makeAdmin() {
  return {
    firestore: {
      FieldValue,
      Timestamp: {
        fromMillis(ms) {
          return { _millis: ms, toMillis() { return ms; } };
        }
      }
    }
  };
}

async function testUniqueAndValidate() {
  assert.deepStrictEqual(adminCredits.uniqueUids(['a', 'a', ' b ', '', null]), ['a', 'b']);
  assert.strictEqual(adminCredits.parsePositiveInt(10), 10);
  assert.strictEqual(adminCredits.parsePositiveInt(0), null);
  assert.strictEqual(adminCredits.parsePositiveInt(-3), null);
  assert.strictEqual(adminCredits.parsePositiveInt(1.5), null);
  assert.strictEqual(adminCredits.parsePositiveInt('x'), null);
  assert.strictEqual(adminCredits.validateOperationId('op_abcde1'), 'op_abcde1');
  try { adminCredits.validateOperationId('bad'); assert.fail('expected throw'); }
  catch (e) { assert.strictEqual(e.status, 400); }
  console.log('ok unique/validate');
}

async function testGrantIncrement() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'u1@test.com', creditBalance: 5 });
  const result = await adminCredits.applyCreditDelta(db, FieldValue, {
    uid: 'u1',
    amount: 10,
    type: 'admin_bulk_credit',
    reason: '이벤트',
    adminUid: 'admin1',
    operationId: 'op_test_01',
    ledgerId: 'led1'
  });
  assert.strictEqual(result.prev, 5);
  assert.strictEqual(result.balance, 15);
  const wallet = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet.data().balance, 15);
  const user = await db.collection('users').doc('u1').get();
  assert.strictEqual(user.data().creditBalance, 15);
  const led = await db.collection('creditLedger').doc('led1').get();
  assert.strictEqual(led.data().type, 'admin_bulk_credit');
  assert.strictEqual(led.data().amount, 10);
  console.log('ok grant 5+10=15');
}

async function testBulkCreditIdempotency() {
  const db = memoryDb();
  const notifs = [];
  await db.collection('users').doc('u1').set({ email: 'a@test.com', creditBalance: 5 });
  await db.collection('users').doc('u2').set({ email: 'b@test.com' });
  const handlers = adminCredits.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' }),
    userNotify: {
      notifyAdminCreditGrant: async (_db, _fv, payload) => {
        notifs.push(payload);
        return { created: true };
      }
    }
  });
  const req = {
    method: 'POST',
    body: { recipientUids: ['u1', 'u1', 'u2'], amount: 10, reason: '이벤트', operationId: 'op_credit_01' }
  };
  const first = httpErrorRes();
  await handlers.grantBulkCredits(req, first.res);
  assert.strictEqual(first.out.statusCode, 200);
  assert.strictEqual(first.out.body.accepted, true);
  assert.notStrictEqual(first.out.body.status, 'COMPLETED');
  await handlers.processBulkCreditOperation('op_credit_01');
  const wallet = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet.data().balance, 15);
  assert.strictEqual(notifs.length, 0);

  const second = httpErrorRes();
  await handlers.grantBulkCredits(req, second.res);
  assert.strictEqual(second.out.body.code, 'ALREADY_COMPLETED');
  const wallet2 = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet2.data().balance, 15);
  assert.strictEqual(notifs.length, 0);

  const third = httpErrorRes();
  await handlers.grantBulkCredits({
    method: 'POST',
    body: { recipientUids: ['u1'], amount: 10, reason: '추가', operationId: 'op_credit_02' }
  }, third.res);
  await handlers.processBulkCreditOperation('op_credit_02');
  const wallet3 = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet3.data().balance, 25);
  console.log('ok bulk credit 5+10=15 idempotent then +10=25');
}

async function testConcurrentDifferentOps() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com', creditBalance: 0 });
  const handlers = adminCredits.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' })
  });
  const a = httpErrorRes();
  const b = httpErrorRes();
  await Promise.all([
    handlers.grantBulkCredits({ method: 'POST', body: { recipientUids: ['u1'], amount: 10, operationId: 'op_conc_aaa' } }, a.res),
    handlers.grantBulkCredits({ method: 'POST', body: { recipientUids: ['u1'], amount: 10, operationId: 'op_conc_bbb' } }, b.res)
  ]);
  await handlers.processBulkCreditOperation('op_conc_aaa');
  await handlers.processBulkCreditOperation('op_conc_bbb');
  const wallet = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet.data().balance, 20);
  console.log('ok concurrent different ops');
}

async function testBulkCreditRejects() {
  const db = memoryDb();
  const handlers = adminCredits.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' })
  });
  for (const amount of [0, -5, 1.2, 999999]) {
    const r = httpErrorRes();
    await handlers.grantBulkCredits({ method: 'POST', body: { recipientUids: ['u1'], amount, operationId: 'op_badamt1' } }, r.res);
    assert.ok(r.out.statusCode >= 400, `amount ${amount}`);
  }
  const forbidden = adminCredits.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => { const e = new Error('관리자만 사용할 수 있습니다.'); e.status = 403; throw e; }
  });
  const r = httpErrorRes();
  await forbidden.grantBulkCredits({ method: 'POST', body: { recipientUids: ['u1'], amount: 10, operationId: 'op_noadmin1' } }, r.res);
  assert.strictEqual(r.out.statusCode, 403);
  console.log('ok bulk credit rejects');
}

async function testPartialCreditFailure() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const handlers = adminCredits.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' })
  });
  const r = httpErrorRes();
  await handlers.grantBulkCredits({
    method: 'POST',
    body: { recipientUids: ['u1', 'missing'], amount: 3, operationId: 'op_partial1' }
  }, r.res);
  await handlers.processBulkCreditOperation('op_partial1');
  const done = httpErrorRes();
  await handlers.grantBulkCredits({
    method: 'POST',
    body: { operationId: 'op_partial1', poll: true }
  }, done.res);
  assert.strictEqual(done.out.body.success, 1);
  assert.strictEqual(done.out.body.failed, 1);
  console.log('ok partial credit');
}

async function testBulkDeduct() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com', creditBalance: 12 });
  await db.collection('users').doc('u2').set({ email: 'b@test.com', creditBalance: 2 });
  const handlers = adminCredits.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' })
  });
  const r = httpErrorRes();
  await handlers.grantBulkCredits({
    method: 'POST',
    body: { recipientUids: ['u1', 'u2'], amount: 5, mode: 'deduct', reason: '회수', operationId: 'op_deduct_01' }
  }, r.res);
  assert.strictEqual(r.out.statusCode, 200);
  assert.strictEqual(r.out.body.mode, 'deduct');
  await handlers.processBulkCreditOperation('op_deduct_01');
  const done = httpErrorRes();
  await handlers.grantBulkCredits({
    method: 'POST',
    body: { operationId: 'op_deduct_01', poll: true }
  }, done.res);
  assert.strictEqual(done.out.body.mode, 'deduct');
  assert.strictEqual(done.out.body.success, 1);
  assert.strictEqual(done.out.body.failed, 1);
  assert.strictEqual((await db.collection('creditWallets').doc('u1').get()).data().balance, 7);
  const led = await db.collection('creditLedger').doc('bulk_op_deduct_01_u1').get();
  assert.strictEqual(led.data().type, 'admin_bulk_deduct');
  assert.strictEqual(led.data().amount, -5);
  const audit = await db.collection('adminAuditLogs').doc('bulk_credit_op_deduct_01').get();
  assert.strictEqual(audit.data().action, 'ADMIN_BULK_CREDIT_DEDUCT');
  console.log('ok bulk deduct 12-5=7 and insufficient fails');
}

async function testBulkEmail() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'one@test.com' });
  await db.collection('users').doc('u2').set({ email: 'two@test.com' });
  await db.collection('users').doc('u3').set({ email: '' });
  const sent = [];
  const handlers = adminBulkEmail.createHandlers({
    db,
    admin: { firestore: { FieldValue }, auth: () => ({ getUser: async () => { throw new Error('no'); } }) },
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' }),
    sendMail: async (msg) => {
      if (msg.to === 'two@test.com') throw new Error('smtp');
      sent.push(msg.to);
      assert.ok(String(msg.html || '').includes('MidiAI Studio'));
      assert.ok(String(msg.text || '').includes('MidiAI Studio'));
    },
    chunkSize: 2,
    delayMs: 0
  });
  const req = {
    method: 'POST',
    body: {
      recipientUids: ['u1', 'u1', 'u2', 'u3', 'ghost'],
      subject: '안내',
      body: '줄1\n줄2',
      operationId: 'op_mail_001'
    }
  };
  const first = httpErrorRes();
  await handlers.sendAdminBulkEmail(req, first.res);
  assert.strictEqual(first.out.body.success, 1);
  assert.ok(first.out.body.failed >= 3);
  assert.deepStrictEqual(sent, ['one@test.com']);
  assert.ok(adminBulkEmail.textToHtml('a\nb').includes('<br>'));

  const second = httpErrorRes();
  await handlers.sendAdminBulkEmail(req, second.res);
  assert.strictEqual(second.out.body.code, 'ALREADY_COMPLETED');
  assert.deepStrictEqual(sent, ['one@test.com']);
  console.log('ok bulk email + idempotency');
}

async function testSendingUidSkipDoesNotResend() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'one@test.com' });
  await db.collection('adminBulkOperations').doc('op_mail_inflight').set({
    type: 'EMAIL',
    status: 'IN_PROGRESS',
    doneUids: [],
    sendingUids: ['u1'],
    failed: []
  });
  const sent = [];
  const handlers = adminBulkEmail.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' }),
    sendMail: async (msg) => { sent.push(msg.to); },
    delayMs: 0
  });
  const r = httpErrorRes();
  await handlers.sendAdminBulkEmail({
    method: 'POST',
    body: { recipientUids: ['u1'], subject: 's', body: 'hello', operationId: 'op_mail_inflight' }
  }, r.res);
  assert.deepStrictEqual(sent, []);
  assert.strictEqual(r.out.body.success, 1);
  assert.strictEqual(r.out.body.failed, 0);
  console.log('ok sendingUids skip does not resend');
}

async function testEmailAuth() {
  const db = memoryDb();
  const handlers = adminBulkEmail.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => { const e = new Error('관리자만 사용할 수 있습니다.'); e.status = 403; throw e; },
    sendMail: async () => {}
  });
  const r = httpErrorRes();
  await handlers.sendAdminBulkEmail({
    method: 'POST',
    body: { recipientUids: ['u1'], subject: 's', body: 'b', operationId: 'op_mail_auth' }
  }, r.res);
  assert.strictEqual(r.out.statusCode, 403);
  console.log('ok email admin-only');
}

async function testEmailMissingSecret() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const handlers = adminBulkEmail.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' }),
    sendMail: null
  });
  const r = httpErrorRes();
  await handlers.sendAdminBulkEmail({
    method: 'POST',
    body: { recipientUids: ['u1'], subject: 's', body: 'hello', operationId: 'op_mail_secret' }
  }, r.res);
  assert.strictEqual(r.out.statusCode, 503);
  assert.strictEqual(r.out.body.code, 'MAIL_NOT_CONFIGURED');
  assert.strictEqual(r.out.body.message, '메일 발송 설정이 완료되지 않았습니다.');
  console.log('ok email missing secret');
}

async function testSmtpErrorSanitizeAndVerify() {
  const auth = adminBulkEmail.sanitizeSmtpError({
    code: 'EAUTH',
    responseCode: 535,
    message: 'Invalid login: 535-5.7.8 Username and Password not accepted'
  });
  assert.strictEqual(auth.code, 'SMTP_AUTH_FAILED');
  assert.ok(!/535|Password not accepted/i.test(auth.message));

  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'a@test.com' });
  const sendMail = async () => {};
  sendMail.verify = async () => {
    const e = new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
    e.code = 'EAUTH';
    throw e;
  };
  const handlers = adminBulkEmail.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' }),
    sendMail
  });
  const r = httpErrorRes();
  await handlers.sendAdminBulkEmail({
    method: 'POST',
    body: { recipientUids: ['u1'], subject: 's', body: 'hello', operationId: 'op_mail_verify' }
  }, r.res);
  assert.strictEqual(r.out.statusCode, 503);
  assert.strictEqual(r.out.body.code, 'SMTP_AUTH_FAILED');
  assert.strictEqual(r.out.body.message, '메일 발송 설정이 올바르지 않습니다.');
  console.log('ok smtp error sanitize');
}

(async () => {
  await testUniqueAndValidate();
  await testGrantIncrement();
  await testBulkCreditIdempotency();
  await testConcurrentDifferentOps();
  await testBulkCreditRejects();
  await testPartialCreditFailure();
  await testBulkDeduct();
  await testBulkEmail();
  await testSendingUidSkipDoesNotResend();
  await testEmailAuth();
  await testEmailMissingSecret();
  await testSmtpErrorSanitizeAndVerify();
  console.log('all admin bulk tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
