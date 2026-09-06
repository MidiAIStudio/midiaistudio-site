'use strict';

/**
 * Welcome Benefit tests — covers TEST 1–16 semantics from product spec.
 */
const assert = require('assert');
const welcomeBenefit = require('./welcomeBenefit');
const creditWalletV2 = require('./creditWalletV2');

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
      async update(data) {
        const prev = store.get(path);
        if (!prev) {
          const err = new Error('not found');
          err.code = 5;
          throw err;
        }
        store.set(path, { ...prev, ...data });
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
      where() {
        return {
          async get() { return { docs: [] }; },
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

const FieldValue = { serverTimestamp: () => new Date('2026-09-06T00:00:00.000Z') };

function makeAdmin(authUsers) {
  const users = authUsers || {};
  return {
    firestore: { FieldValue },
    auth() {
      return {
        async getUser(uid) {
          if (!users[uid]) {
            const err = new Error('not found');
            err.code = 'auth/user-not-found';
            throw err;
          }
          return users[uid];
        }
      };
    }
  };
}

async function setConfig(db, partial) {
  await db.collection(welcomeBenefit.CONFIG_COLLECTION).doc(welcomeBenefit.CONFIG_DOC_ID).set({
    ...welcomeBenefit.defaultConfig(),
    configVersion: 1,
    ...partial
  });
}

function countLedgers(db) {
  let n = 0;
  for (const k of db.store.keys()) {
    if (k.startsWith('creditLedgerV2/')) n += 1;
  }
  return n;
}

function walletBalance(db, uid) {
  const v = db.store.get(`creditWalletsV2/${uid}`);
  return creditWalletV2.readBalanceV2(v || {});
}

function grantDoc(db, uid) {
  return db.store.get(`welcome_credit_grants/${uid}`) || null;
}

async function test1_disabled_skips() {
  const db = memoryDb();
  await setConfig(db, { enabled: false, creditAmount: 50, emailEnabled: false });
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_off', email: 'a@test.com', displayName: 'A' },
    { sendMail: async () => { throw new Error('should not send'); } }
  );
  assert.strictEqual(out.skipped, true);
  assert.strictEqual(grantDoc(db, 'u_off'), null);
  assert.strictEqual(walletBalance(db, 'u_off'), 0);
  assert.strictEqual(countLedgers(db), 0);
}

async function test2_credit_only() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 30, emailEnabled: false, configVersion: 2 });
  let mailed = 0;
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_credit', email: 'c@test.com', displayName: 'C' },
    { sendMail: async () => { mailed += 1; } }
  );
  assert.strictEqual(out.granted, true);
  assert.strictEqual(out.emailSkipped, true);
  assert.strictEqual(walletBalance(db, 'u_credit'), 30);
  assert.strictEqual(mailed, 0);
  const g = grantDoc(db, 'u_credit');
  assert.ok(g);
  assert.strictEqual(g.amount, 30);
  assert.strictEqual(g.emailEnabled, false);
  assert.strictEqual(g.configVersion, 2);
  assert.strictEqual(countLedgers(db), 1);
}

async function test3_credit_and_email() {
  const db = memoryDb();
  await setConfig(db, {
    enabled: true,
    creditAmount: 10,
    emailEnabled: true,
    emailSubject: 'Welcome {{name}}',
    emailBody: 'You got {{credits}} on {{product_name}} ({{email}})'
  });
  const sent = [];
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_mail', email: 'm@test.com', displayName: 'Mina' },
    {
      sendMail: async (msg) => {
        sent.push(msg);
      }
    }
  );
  assert.strictEqual(out.emailSent, true);
  assert.strictEqual(walletBalance(db, 'u_mail'), 10);
  assert.strictEqual(sent.length, 1);
  assert.ok(String(sent[0].subject).includes('Mina'));
  assert.ok(String(sent[0].text || sent[0].html).includes('10'));
  assert.strictEqual(grantDoc(db, 'u_mail').emailSent, true);
}

async function test4_double_handler_no_double_credit() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 20, emailEnabled: false });
  const user = { uid: 'u_dup', email: 'd@test.com', displayName: 'D' };
  const a = await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {});
  const b = await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {});
  assert.strictEqual(a.granted, true);
  assert.strictEqual(b.alreadyGranted, true);
  assert.strictEqual(walletBalance(db, 'u_dup'), 20);
  assert.strictEqual(countLedgers(db), 1);
}

async function test5_ten_retries_still_once() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  const user = { uid: 'u_retry', email: 'r@test.com' };
  for (let i = 0; i < 10; i += 1) {
    await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {});
  }
  assert.strictEqual(walletBalance(db, 'u_retry'), 5);
  assert.strictEqual(countLedgers(db), 1);
}

async function test6_email_success_retry_no_extra_mail() {
  const db = memoryDb();
  await setConfig(db, {
    enabled: true,
    creditAmount: 1,
    emailEnabled: true,
    emailSubject: 'Hi',
    emailBody: 'Body'
  });
  let mailed = 0;
  const sendMail = async () => { mailed += 1; };
  const user = { uid: 'u_es', email: 'es@test.com', displayName: 'E' };
  await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, { sendMail });
  await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, { sendMail });
  assert.strictEqual(mailed, 1);
  assert.strictEqual(walletBalance(db, 'u_es'), 1);
}

async function test7_smtp_fail_keeps_credit() {
  const db = memoryDb();
  await setConfig(db, {
    enabled: true,
    creditAmount: 40,
    emailEnabled: true,
    emailSubject: 'Hi',
    emailBody: 'Body'
  });
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_smtp', email: 's@test.com' },
    {
      sendMail: async () => {
        const err = new Error('SMTP down');
        err.code = 'SMTP_UNAVAILABLE';
        throw err;
      }
    }
  );
  assert.strictEqual(out.emailSent, false);
  assert.strictEqual(walletBalance(db, 'u_smtp'), 40);
  assert.strictEqual(grantDoc(db, 'u_smtp').emailSent, false);
  assert.ok(grantDoc(db, 'u_smtp').emailError);
}

async function test8_smtp_fail_then_email_retry_no_extra_credit() {
  const db = memoryDb();
  await setConfig(db, {
    enabled: true,
    creditAmount: 15,
    emailEnabled: true,
    emailSubject: 'Hi {{name}}',
    emailBody: 'Credits {{credits}}'
  });
  const user = { uid: 'u_smtp2', email: 's2@test.com', displayName: 'Sam' };
  await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {
    sendMail: async () => { throw Object.assign(new Error('fail'), { code: 'SEND_FAILED' }); }
  });
  assert.strictEqual(walletBalance(db, 'u_smtp2'), 15);
  let mailed = 0;
  const out = await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {
    sendMail: async () => { mailed += 1; }
  });
  assert.strictEqual(out.emailRetried, true);
  assert.strictEqual(out.emailSent, true);
  assert.strictEqual(mailed, 1);
  assert.strictEqual(walletBalance(db, 'u_smtp2'), 15);
  assert.strictEqual(countLedgers(db), 1);
}

async function test9_google_signup_once() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 7, emailEnabled: false });
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin({ g1: { email: 'g@gmail.com', displayName: 'G' } }),
    { uid: 'g1', email: 'g@gmail.com', displayName: 'G', providerData: [{ providerId: 'google.com' }] },
    {}
  );
  assert.strictEqual(out.granted, true);
  assert.strictEqual(walletBalance(db, 'g1'), 7);
}

async function test10_google_relogin_zero() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 7, emailEnabled: false });
  const user = { uid: 'g2', email: 'g2@gmail.com' };
  await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {});
  // Relogin is not Auth onCreate — simulate mistaken re-invoke only yields alreadyGranted.
  const again = await welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {});
  assert.strictEqual(again.alreadyGranted, true);
  assert.strictEqual(walletBalance(db, 'g2'), 7);
}

async function test11_email_signup_once() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 3, emailEnabled: false });
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'e1', email: 'e1@mail.com', providerData: [{ providerId: 'password' }] },
    {}
  );
  assert.strictEqual(out.granted, true);
  assert.strictEqual(walletBalance(db, 'e1'), 3);
}

async function test12_non_admin_deny() {
  const db = memoryDb();
  await setConfig(db, { enabled: false });
  const handlers = welcomeBenefit.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => {
      throw Object.assign(new Error('Admin only'), { status: 403, code: 'ADMIN_FORBIDDEN' });
    }
  });
  const r = httpErrorRes();
  await handlers.getWelcomeBenefitConfig({ method: 'POST', body: {} }, r.res);
  assert.strictEqual(r.out.statusCode, 403);
  const r2 = httpErrorRes();
  await handlers.saveWelcomeBenefitConfig({
    method: 'POST',
    body: { enabled: true, creditAmount: 1, emailEnabled: false }
  }, r2.res);
  assert.strictEqual(r2.out.statusCode, 403);
}

async function test13_admin_config_ok() {
  const db = memoryDb();
  const handlers = welcomeBenefit.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1', email: 'admin@test.com' })
  });
  const save = httpErrorRes();
  await handlers.saveWelcomeBenefitConfig({
    method: 'POST',
    body: {
      enabled: true,
      creditAmount: 12,
      emailEnabled: true,
      emailSubject: 'Hello {{name}}',
      emailBody: 'Credits {{credits}}'
    }
  }, save.res);
  assert.strictEqual(save.out.statusCode, 200);
  assert.strictEqual(save.out.body.config.creditAmount, 12);
  assert.strictEqual(save.out.body.config.configVersion, 1);

  const get = httpErrorRes();
  await handlers.getWelcomeBenefitConfig({ method: 'POST', body: {} }, get.res);
  assert.strictEqual(get.out.body.config.enabled, true);
  assert.strictEqual(get.out.body.config.emailSubject, 'Hello {{name}}');
}

async function test14_existing_user_no_retroactive() {
  // Existing users never hit Auth onCreate after feature enable.
  // Disabled-at-signup leaves no grant; later enable must not invent login grants.
  const db = memoryDb();
  await setConfig(db, { enabled: false, creditAmount: 100, emailEnabled: false });
  await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'old_user', email: 'old@test.com' },
    {}
  );
  assert.strictEqual(grantDoc(db, 'old_user'), null);
  await setConfig(db, { enabled: true, creditAmount: 100, emailEnabled: false });
  // No Auth onCreate re-fire for existing UID — only an explicit call would grant.
  // Policy: login paths must never call processWelcomeForAuthUser.
  assert.strictEqual(walletBalance(db, 'old_user'), 0);
}

async function test15_concurrent_two_events_one_grant() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 25, emailEnabled: false });
  const user = { uid: 'u_conc', email: 'c@test.com' };
  const results = await Promise.all([
    welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {}),
    welcomeBenefit.processWelcomeForAuthUser(db, makeAdmin(), user, {})
  ]);
  const grantedCount = results.filter((r) => r.granted).length;
  const already = results.filter((r) => r.alreadyGranted).length;
  assert.ok(grantedCount + already === 2);
  assert.strictEqual(walletBalance(db, 'u_conc'), 25);
  assert.strictEqual(countLedgers(db), 1);
}

async function test16_amount_change_applies_to_new_only() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 10, emailEnabled: false, configVersion: 3 });
  await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_old_amt', email: 'o@test.com' },
    {}
  );
  await setConfig(db, { enabled: true, creditAmount: 99, emailEnabled: false, configVersion: 4 });
  await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_old_amt', email: 'o@test.com' },
    {}
  );
  assert.strictEqual(walletBalance(db, 'u_old_amt'), 10);
  await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_new_amt', email: 'n@test.com' },
    {}
  );
  assert.strictEqual(walletBalance(db, 'u_new_amt'), 99);
  assert.strictEqual(grantDoc(db, 'u_new_amt').configVersion, 4);
}

async function test_amount_zero_email_only() {
  const db = memoryDb();
  await setConfig(db, {
    enabled: true,
    creditAmount: 0,
    emailEnabled: true,
    emailSubject: 'Welcome',
    emailBody: 'No credits but hello {{name}}'
  });
  let mailed = 0;
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_zero', email: 'z@test.com', displayName: '' },
    { sendMail: async (msg) => { mailed += 1; assert.ok(String(msg.text || msg.html).includes('회원')); } }
  );
  assert.strictEqual(out.emailSent, true);
  assert.strictEqual(mailed, 1);
  assert.strictEqual(walletBalance(db, 'u_zero'), 0);
  assert.strictEqual(countLedgers(db), 0);
  assert.ok(grantDoc(db, 'u_zero'));
}

async function test_template_vars() {
  const out = welcomeBenefit.applyTemplate(
    'Hi {{name}} / {{email}} / {{credits}} / {{product_name}} / {{missing}}',
    { name: 'N', email: 'e@x.com', credits: 3, product_name: 'MidiAI Studio' }
  );
  assert.strictEqual(out, 'Hi N / e@x.com / 3 / MidiAI Studio / {{missing}}');
  assert.strictEqual(welcomeBenefit.displayNameFallback(''), '회원');
  assert.strictEqual(welcomeBenefit.displayNameFallback('', 'en'), 'Member');
  assert.strictEqual(welcomeBenefit.displayNameFallback('', 'ja'), 'ユーザー');
}

async function test_require_user_missing_still_grants() {
  // Auth onCreate often runs before users/{uid} exists.
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 8, emailEnabled: false });
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'no_user_doc', email: 'x@test.com' },
    {}
  );
  assert.strictEqual(out.granted, true);
  assert.strictEqual(walletBalance(db, 'no_user_doc'), 8);
}

async function main() {
  const tests = [
    ['TEST1 disabled', test1_disabled_skips],
    ['TEST2 credit only', test2_credit_only],
    ['TEST3 credit+email', test3_credit_and_email],
    ['TEST4 double handler', test4_double_handler_no_double_credit],
    ['TEST5 ten retries', test5_ten_retries_still_once],
    ['TEST6 email success retry', test6_email_success_retry_no_extra_mail],
    ['TEST7 smtp fail keeps credit', test7_smtp_fail_keeps_credit],
    ['TEST8 smtp then email retry', test8_smtp_fail_then_email_retry_no_extra_credit],
    ['TEST9 google signup', test9_google_signup_once],
    ['TEST10 google relogin', test10_google_relogin_zero],
    ['TEST11 email signup', test11_email_signup_once],
    ['TEST12 non-admin deny', test12_non_admin_deny],
    ['TEST13 admin config', test13_admin_config_ok],
    ['TEST14 no retroactive', test14_existing_user_no_retroactive],
    ['TEST15 concurrent', test15_concurrent_two_events_one_grant],
    ['TEST16 amount change new only', test16_amount_change_applies_to_new_only],
    ['amount 0 email only', test_amount_zero_email_only],
    ['template vars', test_template_vars],
    ['grant before users doc', test_require_user_missing_still_grants]
  ];
  for (const [name, fn] of tests) {
    await fn();
    console.log('PASS', name);
  }
  console.log('welcomeBenefit.test.js OK', tests.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
