'use strict';

const assert = require('assert');
const adminCredits = require('./adminCredits');
const creditWallet = require('./creditWallet');
const sideEffects = require('./creditLedgerSideEffects');
const userNotify = require('./userNotify');

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
  function docRef(path) {
    const id = path.split('/').pop();
    const ref = {
      id,
      path,
      async get() {
        const v = store.get(path);
        return { exists: v != null, id, data: () => (v ? { ...v } : undefined) };
      },
      async set(data, opts) {
        const prev = store.get(path) || {};
        store.set(path, opts && opts.merge ? { ...prev, ...data } : { ...data });
      },
      async create(data) {
        if (store.has(path)) {
          const err = new Error('already exists');
          err.code = 6;
          throw err;
        }
        store.set(path, { ...data });
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
        const chain = {
          async get() {
            const prefix = name + '/';
            const docs = [];
            for (const [k, v] of store.entries()) {
              if (!k.startsWith(prefix) || k.slice(prefix.length).includes('/')) continue;
              if (op === '==' && v[field] === value) {
                docs.push({ id: k.slice(prefix.length), data: () => ({ ...v }), ref: docRef(k) });
              }
            }
            return { docs };
          },
          orderBy() { return chain; },
          limit() { return chain; }
        };
        return chain;
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

function handlersFor(db, extra) {
  return adminCredits.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: extra && extra.requireAdmin
      ? extra.requireAdmin
      : async () => ({ uid: 'admin1', email: 'admin@test.com' }),
    userNotify: extra && extra.userNotify
  });
}

async function testGrantDeductMirrorLedger() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ email: 'u1@test.com', creditBalance: 10 });
  const handlers = handlersFor(db);
  const g = httpErrorRes();
  const t0 = Date.now();
  await handlers.adminGrantCredits({
    method: 'POST',
    body: { targetUid: 'u1', amount: 10, reason: '보너스' }
  }, g.res);
  const grantMs = Date.now() - t0;
  assert.strictEqual(g.out.statusCode, 200);
  assert.strictEqual(g.out.body.balance, 20);
  const wallet = await db.collection('creditWallets').doc('u1').get();
  const user = await db.collection('users').doc('u1').get();
  assert.strictEqual(wallet.data().balance, 20);
  assert.strictEqual(wallet.data().creditBalance, 20);
  assert.strictEqual(user.data().creditBalance, 20);
  let ledgers = 0;
  for (const k of db.store.keys()) {
    if (k.startsWith('creditLedger/')) ledgers += 1;
  }
  assert.strictEqual(ledgers, 1);

  const d = httpErrorRes();
  await handlers.adminDeductCredits({
    method: 'POST',
    body: { targetUid: 'u1', amount: 5 }
  }, d.res);
  assert.strictEqual(d.out.body.balance, 15);
  const wallet2 = await db.collection('creditWallets').doc('u1').get();
  const user2 = await db.collection('users').doc('u1').get();
  assert.strictEqual(wallet2.data().balance, 15);
  assert.strictEqual(user2.data().creditBalance, 15);
  console.log('ok grant 10+10=20 deduct -5=15 mirror', { grantMs });
}

async function testGrantHttpDoesNotWaitNotifyAudit() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ creditBalance: 10 });
  await db.collection('users').doc('admin1').set({ email: 'admin@test.com', role: 'admin' });
  let notifyStarted = false;
  const handlers = handlersFor(db, {
    userNotify: {
      notifyAdminCreditGrant: async () => {
        notifyStarted = true;
        await new Promise((r) => setTimeout(r, 80));
        return { created: true };
      }
    }
  });
  const r = httpErrorRes();
  const t0 = Date.now();
  await handlers.adminGrantCredits({
    method: 'POST',
    body: { targetUid: 'u1', amount: 10 }
  }, r.res);
  const elapsed = Date.now() - t0;
  assert.strictEqual(r.out.body.balance, 20);
  assert.strictEqual(notifyStarted, false);
  assert.ok(elapsed < 200, `grant HTTP waited too long: ${elapsed}ms`);

  const auditsBefore = [...db.store.keys()].filter((k) => k.startsWith('adminAuditLogs/')).length;
  assert.strictEqual(auditsBefore, 0);

  let ledgerId = '';
  let ledgerData = null;
  for (const [k, v] of db.store.entries()) {
    if (k.startsWith('creditLedger/')) {
      ledgerId = k.slice('creditLedger/'.length);
      ledgerData = v;
    }
  }
  const side = await sideEffects.processCreditLedgerCreated({
    db,
    admin: makeAdmin(),
    userNotify,
    ledgerId,
    data: ledgerData
  });
  assert.strictEqual(side.skipped, false);
  assert.strictEqual(side.notified, true);
  assert.strictEqual(side.audited, true);
  const again = await sideEffects.processCreditLedgerCreated({
    db,
    admin: makeAdmin(),
    userNotify,
    ledgerId,
    data: ledgerData
  });
  assert.strictEqual(again.notified, false);
  const notifs = [...db.store.keys()].filter((k) => k.includes('/notifications/'));
  const audits = [...db.store.keys()].filter((k) => k.startsWith('adminAuditLogs/'));
  assert.strictEqual(notifs.length, 1);
  assert.strictEqual(audits.length, 1);
  console.log('ok grant HTTP fast path then durable notify/audit', { elapsed });
}

async function testConversionAndPurchaseLedgersSkipped() {
  const db = memoryDb();
  const conversion = await sideEffects.processCreditLedgerCreated({
    db,
    admin: makeAdmin(),
    userNotify,
    ledgerId: 'conv1',
    data: { uid: 'u1', type: 'conversion', amount: -1, origin: '' }
  });
  assert.strictEqual(conversion.skipped, true);
  const purchase = await sideEffects.processCreditLedgerCreated({
    db,
    admin: makeAdmin(),
    userNotify,
    ledgerId: 'p1',
    data: { uid: 'u1', type: 'purchase', amount: 5, origin: 'site_admin' }
  });
  assert.strictEqual(purchase.notified, false);
  assert.strictEqual(purchase.audited, false);
  console.log('ok conversion/purchase ledger skip');
}

async function testInsufficientAndIdempotentLedger() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ creditBalance: 10 });
  await creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid: 'u1',
    delta: -2,
    ledgerId: 'job_a',
    ledger: { type: 'conversion', origin: '' }
  });
  const wallet = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet.data().balance, 8);
  const again = await creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid: 'u1',
    delta: -2,
    ledgerId: 'job_a',
    ledger: { type: 'conversion' }
  });
  assert.strictEqual(again.alreadyApplied, true);
  assert.strictEqual(again.balance, 8);
  try {
    await creditWallet.applyWalletCreditDelta(db, FieldValue, {
      uid: 'u1',
      delta: -20,
      ledger: { type: 'conversion' }
    });
    assert.fail('expected insufficient');
  } catch (e) {
    assert.strictEqual(e.code, 'INSUFFICIENT_CREDITS');
  }
  const wallet2 = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet2.data().balance, 8);
  console.log('ok conversion-style debit + idempotent ledger + insufficient');
}

async function testSequentialOverspend() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ creditBalance: 1 });
  await creditWallet.applyWalletCreditDelta(db, FieldValue, {
    uid: 'u1',
    delta: -1,
    ledgerId: 'job_1',
    ledger: { type: 'conversion' }
  });
  try {
    await creditWallet.applyWalletCreditDelta(db, FieldValue, {
      uid: 'u1',
      delta: -1,
      ledgerId: 'job_2',
      ledger: { type: 'conversion' }
    });
    assert.fail('second debit should fail');
  } catch (e) {
    assert.strictEqual(e.code, 'INSUFFICIENT_CREDITS');
  }
  const wallet = await db.collection('creditWallets').doc('u1').get();
  assert.strictEqual(wallet.data().balance, 0);
  console.log('ok no overspend on sequential conversion-style debit');
}

async function testBulkAcceptThenWorkerAndDuplicateClaim() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ creditBalance: 0 });
  await db.collection('users').doc('u2').set({ creditBalance: 0 });
  const handlers = handlersFor(db);
  const r = httpErrorRes();
  const t0 = Date.now();
  await handlers.grantBulkCredits({
    method: 'POST',
    body: { recipientUids: ['u1', 'u2'], amount: 10, operationId: 'op_fast_bulk1' }
  }, r.res);
  const acceptMs = Date.now() - t0;
  assert.strictEqual(r.out.body.accepted, true);
  assert.ok(r.out.body.status === 'QUEUED' || r.out.body.code === 'QUEUED');
  assert.strictEqual((await db.collection('creditWallets').doc('u1').get()).exists, false);

  const first = await handlers.claimBulkCreditLease(
    db.collection('adminBulkOperations').doc('op_fast_bulk1'),
    Date.now()
  );
  const second = await handlers.claimBulkCreditLease(
    db.collection('adminBulkOperations').doc('op_fast_bulk1'),
    Date.now()
  );
  assert.strictEqual(first.status, 'CLAIMED');
  assert.strictEqual(second.status, 'LEASED');

  await db.collection('adminBulkOperations').doc('op_fast_bulk1').set({
    status: 'QUEUED',
    leaseUntil: { _millis: 0, toMillis() { return 0; } }
  }, { merge: true });
  await handlers.processBulkCreditOperation('op_fast_bulk1');
  assert.strictEqual((await db.collection('creditWallets').doc('u1').get()).data().balance, 10);
  assert.strictEqual((await db.collection('creditWallets').doc('u2').get()).data().balance, 10);

  await handlers.processBulkCreditOperation('op_fast_bulk1');
  assert.strictEqual((await db.collection('creditWallets').doc('u1').get()).data().balance, 10);
  console.log('ok bulk accept + duplicate claim + no double grant', { acceptMs });
}

async function testPartialResumeSkipsDoneUid() {
  const db = memoryDb();
  await db.collection('users').doc('u1').set({ creditBalance: 0 });
  await db.collection('users').doc('u2').set({ creditBalance: 0 });
  await adminCredits.applyCreditDelta(db, FieldValue, {
    uid: 'u1',
    amount: 10,
    type: 'admin_bulk_credit',
    operationId: 'op_resume1',
    ledgerId: 'bulk_op_resume1_u1',
    origin: 'site_admin_bulk'
  });
  await db.collection('adminBulkOperations').doc('op_resume1').set({
    type: 'CREDIT_GRANT',
    status: 'IN_PROGRESS',
    amount: 10,
    reason: '',
    adminUid: 'admin1',
    recipientUids: ['u1', 'u2'],
    doneUids: ['u1'],
    failed: [],
    balances: { u1: 10 },
    leaseUntil: { _millis: 0, toMillis() { return 0; } }
  });
  const handlers = handlersFor(db);
  await handlers.processBulkCreditOperation('op_resume1');
  assert.strictEqual((await db.collection('creditWallets').doc('u1').get()).data().balance, 10);
  assert.strictEqual((await db.collection('creditWallets').doc('u2').get()).data().balance, 10);
  console.log('ok partial resume does not re-grant done uid');
}

async function testPastAdminForbidden() {
  const db = memoryDb();
  const handlers = handlersFor(db, {
    requireAdmin: async () => {
      const e = new Error('관리자만 사용할 수 있습니다.');
      e.status = 403;
      throw e;
    }
  });
  const r = httpErrorRes();
  await handlers.adminGrantCredits({ method: 'POST', body: { targetUid: 'u1', amount: 10 } }, r.res);
  assert.strictEqual(r.out.statusCode, 403);
  console.log('ok grant admin-only');
}

(async () => {
  await testGrantDeductMirrorLedger();
  await testGrantHttpDoesNotWaitNotifyAudit();
  await testConversionAndPurchaseLedgersSkipped();
  await testInsufficientAndIdempotentLedger();
  await testSequentialOverspend();
  await testBulkAcceptThenWorkerAndDuplicateClaim();
  await testPartialResumeSkipsDoneUid();
  await testPastAdminForbidden();
  console.log('all admin credit fast path tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
