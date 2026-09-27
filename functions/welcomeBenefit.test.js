'use strict';

/**
 * Welcome Benefit tests — device-once signup bonus + HMAC fingerprint + migration.
 */
const assert = require('assert');
const crypto = require('crypto');
const welcomeBenefit = require('./welcomeBenefit');
const creditWalletV2 = require('./creditWalletV2');
const migrateSignupBonusClaims = require('./migrateSignupBonusClaims');
const {
  deviceFingerprintFromHwid,
  normalizeHwid,
  configureDeviceFingerprint,
  getFingerprintSecret
} = require('./deviceFingerprint');

const TEST_HMAC = 'unit-test-signup-bonus-hmac-secret';

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
  function listDocs(prefix) {
    const docs = [];
    const base = `${prefix}/`;
    for (const [path, data] of store.entries()) {
      if (!path.startsWith(base)) continue;
      const rest = path.slice(base.length);
      if (!rest || rest.includes('/')) continue;
      docs.push({
        id: rest,
        data: () => ({ ...data })
      });
    }
    return docs;
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
      async get() {
        return { docs: listDocs(name) };
      },
      where(field, op, value) {
        return {
          limit(n) {
            return {
              async get() {
                const docs = [];
                for (const doc of listDocs(name)) {
                  const data = doc.data();
                  if (op === '==' && data && data[field] === value) {
                    docs.push(doc);
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
    doc(path) {
      return docRef(path);
    },
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

function claimHandlers(db, uid) {
  return welcomeBenefit.createHandlers({
    db,
    admin: makeAdmin(),
    cors: () => false,
    requireAdmin: async () => ({ uid: 'admin1' }),
    requireUser: async () => ({ uid })
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

async function test14_claim_uses_bound_hwid() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-claim');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_claim').set({ hwid: normalizeHwid(hwid) });
  const handlers = claimHandlers(db, 'u_claim');
  const missing = httpErrorRes();
  await handlers.claimSignupBonus({ method: 'POST', body: {}, headers: {} }, missing.res);
  // Bound HWID exists — empty body is OK (server uses licenses.hwid).
  assert.strictEqual(missing.out.statusCode, 200);
  assert.strictEqual(missing.out.body.granted, true);
  assert.strictEqual(walletBalance(db, 'u_claim'), 5);
}

async function test15_fingerprint_hmac_stable_no_raw() {
  const a = fakeHwid('same');
  const b = fakeHwid('same');
  assert.strictEqual(deviceFingerprintFromHwid(a), deviceFingerprintFromHwid(b));
  assert.notStrictEqual(deviceFingerprintFromHwid(a), normalizeHwid(a).toLowerCase());
  // Not plain SHA-256 of namespace+hwid
  const plain = crypto.createHash('sha256')
    .update('midiai:signup_bonus:v1:' + normalizeHwid(a), 'utf8')
    .digest('hex');
  assert.notStrictEqual(deviceFingerprintFromHwid(a), plain);
  assert.ok(getFingerprintSecret());
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

async function test17_template_vars() {
  const out = welcomeBenefit.applyTemplate(
    'Hi {{name}} / {{email}} / {{credits}} / {{product_name}} / {{missing}}',
    { name: 'N', email: 'e@x.com', credits: 3, product_name: 'MidiAI Studio' }
  );
  assert.strictEqual(out, 'Hi N / e@x.com / 3 / MidiAI Studio / {{missing}}');
}

async function test18_migration_existing_welcome_user() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-mig-one');
  await db.collection('licenses').doc('legacy1').set({
    hwid: normalizeHwid(hwid),
    plan: 'lifetime',
    status: 'active',
    startsAt: '2025-01-01',
    expiresAt: ''
  });
  await db.collection('welcome_credit_grants').doc('legacy1').set({
    uid: 'legacy1',
    amount: 5,
    creditGranted: true,
    email: 'legacy1@test.com',
    grantedAt: new Date('2026-01-01T00:00:00.000Z')
  });
  await db.collection('creditWalletsV2').doc('legacy1').set({ uid: 'legacy1', balance: 5 });
  const beforeLic = { ...db.store.get('licenses/legacy1') };
  const before = walletBalance(db, 'legacy1');
  const out = await migrateSignupBonusClaims.migrateSignupBonusClaims(db, {
    FieldValue,
    dryRun: false,
    force: true,
    secret: TEST_HMAC,
    logger: { info() {} }
  });
  assert.strictEqual(out.created, 1);
  assert.strictEqual(out.creditsChangedUsers, 0);
  assert.strictEqual(out.licensesChangedUsers, 0);
  assert.strictEqual(walletBalance(db, 'legacy1'), before);
  assert.deepStrictEqual(db.store.get('licenses/legacy1'), beforeLic);
  const claim = claimDoc(db, hwid);
  assert.ok(claim);
  assert.strictEqual(claim.uid, 'legacy1');
  assert.strictEqual(claim.migrated, true);
  assert.strictEqual(claim.claimed, true);
  assert.strictEqual(claim.creditGranted, false);
  assert.strictEqual(claim.amount, 0);
  assert.ok(!Object.prototype.hasOwnProperty.call(claim, 'hwid'));
}

async function test19_migration_multi_uid_one_claim() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-mig-multi');
  await db.collection('licenses').doc('m1').set({ hwid: normalizeHwid(hwid), plan: 'period' });
  await db.collection('licenses').doc('m2').set({ hwid: normalizeHwid(hwid), plan: 'trial' });
  await db.collection('licenses').doc('m3').set({ hwid: normalizeHwid(hwid), plan: 'trial' });
  await db.collection('welcome_credit_grants').doc('m1').set({
    uid: 'm1', amount: 5, creditGranted: true, grantedAt: new Date('2026-01-02')
  });
  await db.collection('creditWalletsV2').doc('m1').set({ balance: 5 });
  await db.collection('creditWalletsV2').doc('m2').set({ balance: 0 });
  const beforeM1Lic = { ...db.store.get('licenses/m1') };
  const logs = [];
  const out = await migrateSignupBonusClaims.migrateSignupBonusClaims(db, {
    FieldValue,
    force: true,
    secret: TEST_HMAC,
    logger: { info: (...a) => logs.push(a) }
  });
  assert.strictEqual(out.created, 1);
  assert.strictEqual(out.multiUidFingerprints, 1);
  assert.strictEqual(out.creditsChangedUsers, 0);
  const claim = claimDoc(db, hwid);
  assert.strictEqual(claim.uid, 'm1');
  assert.strictEqual(claim.relatedUidCount, 3);
  assert.strictEqual(walletBalance(db, 'm1'), 5);
  assert.strictEqual(walletBalance(db, 'm2'), 0);
  assert.deepStrictEqual(db.store.get('licenses/m1'), beforeM1Lic);
}

async function test20_after_migration_new_email_zero() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-mig-block');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('old').set({ hwid: normalizeHwid(hwid), plan: 'lifetime' });
  await db.collection('welcome_credit_grants').doc('old').set({
    uid: 'old', amount: 5, creditGranted: true, grantedAt: new Date()
  });
  await migrateSignupBonusClaims.migrateSignupBonusClaims(db, {
    FieldValue,
    force: true,
    secret: TEST_HMAC,
    logger: { info() {} }
  });
  await db.collection('licenses').doc('newbie').set({ hwid: normalizeHwid(hwid), plan: 'trial' });
  const out = await welcomeDevice(db, 'newbie', hwid, { email: 'new@test.com' });
  assert.strictEqual(out.skippedDeviceClaimed, true);
  assert.strictEqual(out.amount, 0);
  assert.strictEqual(walletBalance(db, 'newbie'), 0);
}

async function test21_forged_fingerprint_rejected() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-forge');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_forge').set({ hwid: normalizeHwid(hwid) });
  const handlers = claimHandlers(db, 'u_forge');
  const r = httpErrorRes();
  await handlers.claimSignupBonus({
    method: 'POST',
    body: { deviceFingerprint: 'deadbeef'.repeat(8) },
    headers: {}
  }, r.res);
  assert.strictEqual(r.out.statusCode, 400);
  assert.strictEqual(r.out.body.code, 'FORGED_FINGERPRINT');
  assert.strictEqual(walletBalance(db, 'u_forge'), 0);
}

async function test22_uid_mismatch_rejected() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-uid');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_real').set({ hwid: normalizeHwid(hwid) });
  const handlers = claimHandlers(db, 'u_real');
  const r = httpErrorRes();
  await handlers.claimSignupBonus({
    method: 'POST',
    body: { uid: 'u_other' },
    headers: {}
  }, r.res);
  assert.strictEqual(r.out.statusCode, 403);
  assert.strictEqual(r.out.body.code, 'UID_MISMATCH');
  assert.strictEqual(walletBalance(db, 'u_real'), 0);
  assert.strictEqual(walletBalance(db, 'u_other'), 0);
}

async function test23_license_and_claim_race_plus_five_once() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-dual-path');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_dual').set({ hwid: normalizeHwid(hwid) });
  const handlers = claimHandlers(db, 'u_dual');
  const claimRes = httpErrorRes();
  const results = await Promise.all([
    welcomeBenefit.processWelcomeOnLicenseHwidWrite(db, makeAdmin(), {
      uid: 'u_dual',
      beforeData: { hwid: '' },
      afterData: { hwid: normalizeHwid(hwid) }
    }),
    handlers.claimSignupBonus({ method: 'POST', body: {}, headers: {} }, claimRes.res)
  ]);
  const licenseOut = results[0];
  assert.strictEqual(claimRes.out.statusCode, 200);
  const grantedFlags = [
    !!(licenseOut && licenseOut.granted),
    !!claimRes.out.body.granted
  ].filter(Boolean);
  assert.ok(grantedFlags.length <= 1);
  assert.strictEqual(walletBalance(db, 'u_dual'), 5);
  assert.strictEqual(countLedgers(db), 1);
}

async function test24_txn_fail_then_retry_no_double() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-txn-retry');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  let attempts = 0;
  const orig = db.runTransaction.bind(db);
  db.runTransaction = async (fn) => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(new Error('simulated txn failure'), { code: 'TXN_FAIL' });
    }
    return orig(fn);
  };
  let firstErr = null;
  try {
    await welcomeDevice(db, 'u_retry', hwid);
  } catch (err) {
    firstErr = err;
  }
  assert.ok(firstErr);
  assert.strictEqual(walletBalance(db, 'u_retry'), 0);
  assert.strictEqual(claimDoc(db, hwid), null);

  const second = await welcomeDevice(db, 'u_retry', hwid);
  assert.strictEqual(second.granted, true);
  assert.strictEqual(walletBalance(db, 'u_retry'), 5);

  const third = await welcomeDevice(db, 'u_retry', hwid);
  assert.strictEqual(third.alreadyGranted, true);
  assert.strictEqual(walletBalance(db, 'u_retry'), 5);
  assert.strictEqual(countLedgers(db), 1);
}

async function test25_lifetime_login_claim_no_credit_license_intact() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-life');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  const lic = {
    plan: 'lifetime',
    status: 'active',
    licensed: true,
    method: 'paypal',
    startsAt: '2025-03-01',
    expiresAt: '',
    hwid: normalizeHwid(hwid)
  };
  await db.collection('licenses').doc('u_life').set(lic);
  await db.collection('creditWalletsV2').doc('u_life').set({ uid: 'u_life', balance: 23 });
  const beforeLic = { ...db.store.get('licenses/u_life') };
  const out = await welcomeDevice(db, 'u_life', hwid);
  assert.strictEqual(out.granted, false);
  assert.strictEqual(out.skippedExistingPaid, true);
  assert.strictEqual(out.amount, 0);
  assert.strictEqual(walletBalance(db, 'u_life'), 23);
  assert.deepStrictEqual(db.store.get('licenses/u_life'), beforeLic);
  assert.strictEqual(db.store.get('licenses/u_life').plan, 'lifetime');
  assert.ok(claimDoc(db, hwid));
  assert.strictEqual(claimDoc(db, hwid).creditGranted, false);
}

async function test26_lifetime_bonus_fail_still_ok() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-life-fail');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_life2').set({
    plan: 'lifetime', status: 'active', licensed: true, hwid: normalizeHwid(hwid)
  });
  // Force HMAC miss mid-path: still must not alter license.
  configureDeviceFingerprint({ secret: '' });
  const beforeLic = { ...db.store.get('licenses/u_life2') };
  const out = await welcomeDevice(db, 'u_life2', hwid);
  assert.strictEqual(out.skipped, true);
  assert.strictEqual(out.reason, 'hmac_secret_missing');
  assert.deepStrictEqual(db.store.get('licenses/u_life2'), beforeLic);
  configureDeviceFingerprint({ secret: TEST_HMAC });
}

async function test27_period_dates_unchanged() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-period');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_per').set({
    plan: 'period',
    status: 'active',
    licensed: true,
    startsAt: '2026-09-20',
    expiresAt: '2026-10-20',
    hwid: normalizeHwid(hwid)
  });
  await db.collection('creditWalletsV2').doc('u_per').set({ balance: 7 });
  const out = await welcomeDevice(db, 'u_per', hwid);
  assert.strictEqual(out.skippedExistingPaid, true);
  assert.strictEqual(walletBalance(db, 'u_per'), 7);
  const lic = db.store.get('licenses/u_per');
  assert.strictEqual(lic.startsAt, '2026-09-20');
  assert.strictEqual(lic.expiresAt, '2026-10-20');
  assert.strictEqual(lic.plan, 'period');
}

async function test28_period_claim_fail_license_ok() {
  const db = memoryDb();
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_per2').set({
    plan: 'period',
    status: 'active',
    startsAt: '2026-09-20',
    expiresAt: '2026-10-20',
    hwid: ''
  });
  const handlers = claimHandlers(db, 'u_per2');
  const r = httpErrorRes();
  await handlers.claimSignupBonus({ method: 'POST', body: {}, headers: {} }, r.res);
  assert.strictEqual(r.out.statusCode, 400);
  assert.strictEqual(r.out.body.code, 'HWID_NOT_BOUND');
  const lic = db.store.get('licenses/u_per2');
  assert.strictEqual(lic.startsAt, '2026-09-20');
  assert.strictEqual(lic.expiresAt, '2026-10-20');
  assert.strictEqual(lic.plan, 'period');
}

async function test29_migration_trial_credits_unchanged() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-trial-mig');
  await db.collection('licenses').doc('u_tr').set({
    plan: 'trial', status: 'active', hwid: normalizeHwid(hwid)
  });
  await db.collection('creditWalletsV2').doc('u_tr').set({ balance: 2 });
  const beforeLic = { ...db.store.get('licenses/u_tr') };
  const out = await migrateSignupBonusClaims.migrateSignupBonusClaims(db, {
    FieldValue,
    force: true,
    secret: TEST_HMAC,
    logger: { info() {} }
  });
  assert.strictEqual(out.creditsChangedUsers, 0);
  assert.strictEqual(walletBalance(db, 'u_tr'), 2);
  assert.deepStrictEqual(db.store.get('licenses/u_tr'), beforeLic);
}

async function test30_migration_idempotent() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-idem');
  await db.collection('licenses').doc('u_id').set({
    plan: 'lifetime', hwid: normalizeHwid(hwid)
  });
  const a = await migrateSignupBonusClaims.migrateSignupBonusClaims(db, {
    FieldValue, force: true, secret: TEST_HMAC, logger: { info() {} }
  });
  const b = await migrateSignupBonusClaims.migrateSignupBonusClaims(db, {
    FieldValue, force: true, secret: TEST_HMAC, logger: { info() {} }
  });
  assert.strictEqual(a.created, 1);
  assert.strictEqual(b.created, 0);
  assert.strictEqual(b.alreadyExisted, 1);
  assert.strictEqual(walletBalance(db, 'u_id'), 0);
}

async function test31_dry_run_no_writes_and_stats() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-dry');
  await db.collection('licenses').doc('d1').set({ plan: 'lifetime', hwid: normalizeHwid(hwid) });
  await db.collection('licenses').doc('d2').set({ plan: 'period', hwid: '' });
  await db.collection('licenses').doc('d3').set({ plan: 'trial', hwid: normalizeHwid(fakeHwid('pc-dry-2')) });
  const out = await migrateSignupBonusClaims.migrateSignupBonusClaims(db, {
    FieldValue,
    dryRun: true,
    force: true,
    secret: TEST_HMAC,
    logger: { info() {} }
  });
  assert.strictEqual(out.dryRun, true);
  assert.strictEqual(out.totalLicenses, 3);
  assert.strictEqual(out.withHwid, 2);
  assert.strictEqual(out.lifetime, 1);
  assert.strictEqual(out.period, 1);
  assert.strictEqual(out.trial, 1);
  assert.strictEqual(out.creditsChangedUsers, 0);
  assert.strictEqual(out.licensesChangedUsers, 0);
  assert.ok(out.claimsToCreate >= 1);
  assert.strictEqual(claimDoc(db, hwid), null);
}

async function test32_welcome_never_writes_license_keys() {
  const db = memoryDb();
  const hwid = fakeHwid('pc-keys');
  await setConfig(db, { enabled: true, creditAmount: 5, emailEnabled: false });
  await db.collection('licenses').doc('u_t').set({
    plan: 'trial', status: 'active', method: 'signup', hwid: normalizeHwid(hwid)
  });
  await welcomeDevice(db, 'u_t', hwid);
  const lic = db.store.get('licenses/u_t');
  assert.strictEqual(lic.plan, 'trial');
  assert.strictEqual(lic.method, 'signup');
  assert.strictEqual(lic.status, 'active');
  // Only hwid was pre-set; welcome must not add plan/expires fields via overwrite.
  assert.strictEqual(Object.prototype.hasOwnProperty.call(lic, 'expiresAt'), false);
}

async function main() {
  configureDeviceFingerprint({ secret: TEST_HMAC });
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
    ['TEST14 claimSignupBonus uses bound HWID', test14_claim_uses_bound_hwid],
    ['TEST15 HMAC fingerprint stable', test15_fingerprint_hmac_stable_no_raw],
    ['TEST16 amount change new device', test16_amount_change_applies_to_new_device_only],
    ['TEST17 template vars', test17_template_vars],
    ['TEST18 migration existing welcome user', test18_migration_existing_welcome_user],
    ['TEST19 migration multi UID one claim', test19_migration_multi_uid_one_claim],
    ['TEST20 after migration new email → 0', test20_after_migration_new_email_zero],
    ['TEST21 forged fingerprint rejected', test21_forged_fingerprint_rejected],
    ['TEST22 other UID claim rejected', test22_uid_mismatch_rejected],
    ['TEST23 license+claim race → +5 once', test23_license_and_claim_race_plus_five_once],
    ['TEST24 txn fail retry → no double', test24_txn_fail_then_retry_no_double],
    ['TEST25 Lifetime claim → +0 license intact', test25_lifetime_login_claim_no_credit_license_intact],
    ['TEST26 Lifetime bonus fail → license OK', test26_lifetime_bonus_fail_still_ok],
    ['TEST27 period dates unchanged', test27_period_dates_unchanged],
    ['TEST28 period claim fail → license OK', test28_period_claim_fail_license_ok],
    ['TEST29 trial migration credits unchanged', test29_migration_trial_credits_unchanged],
    ['TEST30 migration idempotent', test30_migration_idempotent],
    ['TEST31 dry-run stats no writes', test31_dry_run_no_writes_and_stats],
    ['TEST32 welcome never mutates license fields', test32_welcome_never_writes_license_keys]
  ];
  for (const [name, fn] of tests) {
    configureDeviceFingerprint({ secret: TEST_HMAC });
    await fn();
    console.log('PASS', name);
  }
  console.log('welcomeBenefit.test.js OK', tests.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
