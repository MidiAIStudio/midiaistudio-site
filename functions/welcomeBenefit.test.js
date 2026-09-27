'use strict';

/**
 * Welcome Benefit tests — device-once signup bonus + legacy UID grant semantics.
 */
const assert = require('assert');
const crypto = require('crypto');
const welcomeBenefit = require('./welcomeBenefit');
const creditWalletV2 = require('./creditWalletV2');
const {
  deviceFingerprintFromHwid,
  normalizeHwid
} = require('./deviceFingerprint');

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
      where(field, op, value) {
        return {
          limit(n) {
            return {
              async get() {
                const docs = [];
                const prefix = `${name}/`;
                for (const [path, data] of store.entries()) {
                  if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
                  const id = path.slice(prefix.length);
                  if (op === '==' && data && data[field] === value) {
                    docs.push({
                      id,
                      data: () => ({ ...data })
                    });
                  }
                  if (docs.length >= n) break;
                }
                return { docs };
              }
            };
          },
          async get() {
            return this.limit(1000).get();
          },
          orderBy() { return this; }
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

function fakeHwid(seed) {
  return crypto.createHash('sha256').update(String(seed || 'pc'), 'utf8').digest('hex').toUpperCase();
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

function claimDoc(db, hwid) {
  const fp = deviceFingerprintFromHwid(hwid);
  return db.store.get(`signupBonusClaims/${fp}`) || null;
}

function auditActions(db) {
  const out = [];
  for (const [k, v] of db.store.entries()) {
    if (k.startsWith('adminAuditLogs/') && v && v.action) out.push(v.action);
  }
  return out;
}

async function welcomeDevice(db, uid, hwid, opts = {}) {
  return welcomeBenefit.processWelcomeForDevice(db, makeAdmin(opts.authUsers), {
    uid,
    hwid,
    email: opts.email || `${uid}@test.com`,
    displayName: opts.displayName || uid,
    sendMail: opts.sendMail,
    ipMasked: opts.ipMasked || '1.2.***.***'
  });
}

async function test1_disabled_skips() {
  const db = memoryDb();
  const hwid = fakeHwid('off');
  await setConfig(db, { enabled: false, creditAmount: 50, emailEnabled: false });
  const out = await welcomeDevice(db, 'u_off', hwid, {
    sendMail: async () => { throw new Error('should not send'); }
  });
  assert.strictEqual(out.skipped, true);
  assert.strictEqual(grantDoc(db, 'u_off'), null);
  assert.strictEqual(walletBalance(db, 'u_off'), 0);
  assert.strictEqual(countLedgers(db), 0);
}

async function test2_new_pc_new_account_grants() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-a');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false, configVersion: 2 });
  const out = await welcomeDevice(db, 'u_new', hwid);
  assert.strictEqual(out.granted, true);
  assert.strictEqual(out.amount, 5);
  assert.strictEqual(walletBalance(db, 'u_new'), 5);
  assert.ok(claimDoc(db, hwid));
  assert.strictEqual(claimDoc(db, hwid).uid, 'u_new');
  assert.ok(!Object.prototype.hasOwnProperty.call(claimDoc(db, hwid), 'hwid'));
  assert.ok(auditActions(db).includes(welcomeBenefit.ACTION_GRANTED));
}

async function test3_same_pc_other_account_zero() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-shared');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_a').set({ hwid: normalizeHwid(hwid) });
  await welcomeDevice(db, 'u_a', hwid);
  await db.collection('licenses').doc('u_b').set({ hwid: normalizeHwid(hwid) });
  const out = await welcomeDevice(db, 'u_b', hwid, { email: 'b@test.com' });
  assert.strictEqual(out.granted, false);
  assert.strictEqual(out.skippedDeviceClaimed, true);
  assert.strictEqual(out.amount, 0);
  assert.strictEqual(walletBalance(db, 'u_a'), 5);
  assert.strictEqual(walletBalance(db, 'u_b'), 0);
  assert.strictEqual(countLedgers(db), 1);
  assert.ok(auditActions(db).includes(welcomeBenefit.ACTION_SKIPPED));
}

async function test4_same_account_relogin_no_extra() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-relogin');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  const user = { uid: 'u_re', email: 're@test.com' };
  await welcomeDevice(db, user.uid, hwid, { email: user.email });
  const again = await welcomeDevice(db, user.uid, hwid, { email: user.email });
  assert.strictEqual(again.alreadyGranted, true);
  assert.strictEqual(walletBalance(db, 'u_re'), 5);
  assert.strictEqual(countLedgers(db), 1);
}

async function test5_concurrent_two_uids_one_grant() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-race');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  const results = await Promise.all([
    welcomeDevice(db, 'u_race1', hwid, { email: 'r1@test.com' }),
    welcomeDevice(db, 'u_race2', hwid, { email: 'r2@test.com' })
  ]);
  const granted = results.filter((r) => r.granted);
  const skipped = results.filter((r) => r.skippedDeviceClaimed || r.alreadyGranted);
  assert.strictEqual(granted.length, 1);
  assert.ok(skipped.length >= 1);
  const total = walletBalance(db, 'u_race1') + walletBalance(db, 'u_race2');
  assert.strictEqual(total, 5);
  assert.strictEqual(countLedgers(db), 1);
}

async function test6_other_pc_new_account_grants() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await welcomeDevice(db, 'u_pc1', fakeHwid('pc-1'));
  const out = await welcomeDevice(db, 'u_pc2', fakeHwid('pc-2'));
  assert.strictEqual(out.granted, true);
  assert.strictEqual(walletBalance(db, 'u_pc1'), 5);
  assert.strictEqual(walletBalance(db, 'u_pc2'), 5);
  assert.strictEqual(countLedgers(db), 2);
}

async function test7_auth_oncreate_waits_for_device() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  const out = await welcomeBenefit.processWelcomeForAuthUser(
    db,
    makeAdmin(),
    { uid: 'u_auth', email: 'a@test.com' },
    {}
  );
  assert.strictEqual(out.skipped, true);
  assert.strictEqual(out.reason, 'waiting_for_device');
  assert.strictEqual(walletBalance(db, 'u_auth'), 0);
}

async function test8_license_hwid_write_grants() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-bind');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  const out = await welcomeBenefit.processWelcomeOnLicenseHwidWrite(db, makeAdmin(), {
    uid: 'u_bind',
    beforeData: { hwid: '' },
    afterData: { hwid }
  });
  assert.strictEqual(out.granted, true);
  assert.strictEqual(walletBalance(db, 'u_bind'), 5);
}

async function test9_credit_and_email() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-mail');
  await setConfig(db, {
    enabled: true,
    creditAmount: 10,
    emailEnabled: true,
    emailSubject: 'Welcome {{name}}',
    emailBody: 'You got {{credits}} on {{product_name}} ({{email}})'
  });
  const sent = [];
  const out = await welcomeDevice(db, 'u_mail', hwid, {
    displayName: 'Mina',
    email: 'm@test.com',
    sendMail: async (msg) => { sent.push(msg); }
  });
  assert.strictEqual(out.emailSent, true);
  assert.strictEqual(walletBalance(db, 'u_mail'), 10);
  assert.strictEqual(sent.length, 1);
  assert.ok(String(sent[0].subject).includes('Mina'));
}

async function test10_smtp_fail_keeps_credit() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-smtp');
  await setConfig(db, {
    enabled: true,
    creditAmount: 40,
    emailEnabled: true,
    emailSubject: 'Hi',
    emailBody: 'Body'
  });
  const out = await welcomeDevice(db, 'u_smtp', hwid, {
    sendMail: async () => {
      const err = new Error('SMTP down');
      err.code = 'SMTP_UNAVAILABLE';
      throw err;
    }
  });
  assert.strictEqual(out.emailSent, false);
  assert.strictEqual(walletBalance(db, 'u_smtp'), 40);
}

async function test11_legacy_sibling_blocks_new() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-legacy');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('old_user').set({ hwid: normalizeHwid(hwid) });
  await db.collection('welcome_credit_grants').doc('old_user').set({
    uid: 'old_user',
    amount: 5,
    creditGranted: true,
    grantedAt: new Date()
  });
  await db.collection('licenses').doc('new_user').set({ hwid: normalizeHwid(hwid) });
  const out = await welcomeDevice(db, 'new_user', hwid);
  assert.strictEqual(out.skippedDeviceClaimed, true);
  assert.strictEqual(walletBalance(db, 'new_user'), 0);
  assert.ok(claimDoc(db, hwid));
}

async function test12_existing_credits_not_reclaimed() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-keep');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('creditWalletsV2').doc('paid_user').set({ uid: 'paid_user', balance: 99 });
  await welcomeDevice(db, 'paid_user', hwid);
  assert.strictEqual(walletBalance(db, 'paid_user'), 104);
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

  const get = httpErrorRes();
  await handlers.getWelcomeBenefitConfig({ method: 'POST', body: {} }, get.res);
  assert.strictEqual(get.out.body.policy.oncePer, 'device');
  assert.strictEqual(get.out.body.policy.storesRawHwid, false);
}

async function test14_claim_endpoint_requires_hwid() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  const handlers = welcomeBenefit.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1' }),
    requireUser: async () => ({ uid: 'u_claim' })
  });
  const bad = httpErrorRes();
  await handlers.claimSignupBonus({ method: 'POST', body: {}, headers: {} }, bad.res);
  assert.strictEqual(bad.out.statusCode, 400);

  const hwid = fakeHwid('pc-claim');
  const ok = httpErrorRes();
  await handlers.claimSignupBonus({
    method: 'POST',
    body: { hwid },
    headers: {}
  }, ok.res);
  assert.strictEqual(ok.out.statusCode, 200);
  assert.strictEqual(ok.out.body.granted, true);
  assert.strictEqual(walletBalance(db, 'u_claim'), 5);
}

async function test15_fingerprint_stable_no_raw() {
  const a = fakeHwid('same');
  const b = fakeHwid('same');
  assert.strictEqual(deviceFingerprintFromHwid(a), deviceFingerprintFromHwid(b));
  assert.notStrictEqual(deviceFingerprintFromHwid(a), normalizeHwid(a).toLowerCase());
}

async function test16_amount_change_applies_to_new_device_only() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 10, emailEnabled: false, configVersion: 3 });
  await welcomeDevice(db, 'u_old_amt', fakeHwid('pc-old-amt'));
  await setConfig(db, { enabled: true, creditAmount: 99, emailEnabled: false, configVersion: 4 });
  await welcomeDevice(db, 'u_old_amt', fakeHwid('pc-old-amt'));
  assert.strictEqual(walletBalance(db, 'u_old_amt'), 10);
  await welcomeDevice(db, 'u_new_amt', fakeHwid('pc-new-amt'));
  assert.strictEqual(walletBalance(db, 'u_new_amt'), 99);
}

async function test_template_vars() {
  const out = welcomeBenefit.applyTemplate(
    'Hi {{name}} / {{email}} / {{credits}} / {{product_name}} / {{missing}}',
    { name: 'N', email: 'e@x.com', credits: 3, product_name: 'MidiAI Studio' }
  );
  assert.strictEqual(out, 'Hi N / e@x.com / 3 / MidiAI Studio / {{missing}}');
}

async function main() {
  const tests = [
    ['TEST1 disabled', test1_disabled_skips],
    ['TEST2 new PC + new account → 5', test2_new_pc_new_account_grants],
    ['TEST3 same PC + other account → 0', test3_same_pc_other_account_zero],
    ['TEST4 same account relogin → no extra', test4_same_account_relogin_no_extra],
    ['TEST5 concurrent UIDs → max 5 once', test5_concurrent_two_uids_one_grant],
    ['TEST6 other PC + new account → 5', test6_other_pc_new_account_grants],
    ['TEST7 auth onCreate waits for device', test7_auth_oncreate_waits_for_device],
    ['TEST8 license HWID write grants', test8_license_hwid_write_grants],
    ['TEST9 credit+email', test9_credit_and_email],
    ['TEST10 smtp fail keeps credit', test10_smtp_fail_keeps_credit],
    ['TEST11 legacy sibling blocks', test11_legacy_sibling_blocks_new],
    ['TEST12 existing wallet not reclaimed', test12_existing_credits_not_reclaimed],
    ['TEST13 admin config', test13_admin_config_ok],
    ['TEST14 claimSignupBonus HTTP', test14_claim_endpoint_requires_hwid],
    ['TEST15 fingerprint stable', test15_fingerprint_stable_no_raw],
    ['TEST16 amount change new device', test16_amount_change_applies_to_new_device_only],
    ['template vars', test_template_vars]
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
