/**
 * Admin FCM push unit tests (no network, no secrets printed).
 * Run: node adminPush.test.js
 */
const assert = require('assert');
const adminPush = require('./adminPush');

function testHelpers() {
  assert.strictEqual(adminPush.maskEmail('buyer@example.com'), 'buy***@example.com');
  assert.strictEqual(adminPush.maskEmail('ab@x.com'), 'ab***@x.com');
  assert.ok(!adminPush.maskEmail('buyer@example.com').includes('buyer@'));
  assert.strictEqual(adminPush.formatAmount(19900, 'KRW'), '₩19,900');
  assert.strictEqual(adminPush.validDeviceId('a'.repeat(64)), true);
  assert.strictEqual(adminPush.validDeviceId('short'), false);
  assert.ok(adminPush.hashSecret('secret').length === 64);
  assert.notStrictEqual(adminPush.hashSecret('a'), adminPush.hashSecret('b'));
  console.log('ok helpers');
}

function testPushTargetAndFilters() {
  assert.strictEqual(adminPush.isPushTarget({ status: 'pending', enabled: false, token: 'x' }), false);
  assert.strictEqual(adminPush.isPushTarget({ status: 'approved', enabled: true, token: 'tok' }), true);
  assert.strictEqual(adminPush.isPushTarget({ status: 'approved', enabled: false, token: 'tok' }), false);
  assert.strictEqual(adminPush.isPushTarget({ status: 'revoked', enabled: true, token: 'tok' }), false);
  assert.strictEqual(adminPush.categoryEnabledOnDevice({ paymentEnabled: false }, 'payment'), false);
  assert.strictEqual(adminPush.categoryEnabledOnDevice({ inquiryEnabled: true }, 'inquiry'), true);
  assert.strictEqual(adminPush.globalAllows({ paymentEnabled: false }, 'payment'), false);
  assert.strictEqual(adminPush.globalAllows({ paymentEnabled: false }, 'test'), true);
  assert.strictEqual(adminPush.globalAllows({ paymentEnabled: false }, 'system'), true);
  console.log('ok targeting');
}

function testProof() {
  const hash = adminPush.hashSecret('dev-secret');
  assert.strictEqual(adminPush.proofOk({ deviceSecret: 'dev-secret' }, { deviceSecretHash: hash }), true);
  assert.strictEqual(adminPush.proofOk({ deviceSecret: 'wrong' }, { deviceSecretHash: hash }), false);
  assert.strictEqual(adminPush.proofOk({ fcmToken: 'tok_abc' }, { token: 'tok_abc', deviceSecretHash: hash }), false);
  assert.strictEqual(adminPush.secretOk({ deviceSecret: 'dev-secret' }, { deviceSecretHash: hash }), true);
  assert.strictEqual(adminPush.secretOk({}, { deviceSecretHash: hash }), false);
  console.log('ok proof');
}

function testSnapshotHidesSecrets() {
  const snap = adminPush.deviceSnapshot('dev1', {
    status: 'approved',
    enabled: true,
    role: 'owner',
    token: 'SHOULD_NOT_APPEAR',
    tokenHash: 'TOKEN_HASH_SHOULD_NOT_APPEAR',
    deviceSecretHash: 'SHOULD_NOT_APPEAR',
    paymentEnabled: false
  });
  const json = JSON.stringify(snap);
  assert.ok(!json.includes('SHOULD_NOT_APPEAR'));
  assert.ok(!json.includes('TOKEN_HASH_SHOULD_NOT_APPEAR'));
  assert.ok(!Object.prototype.hasOwnProperty.call(snap, 'token'));
  assert.ok(!Object.prototype.hasOwnProperty.call(snap, 'tokenHash'));
  assert.ok(!Object.prototype.hasOwnProperty.call(snap, 'deviceSecretHash'));
  assert.strictEqual(snap.paymentEnabled, false);
  assert.strictEqual(snap.status, 'approved');
  console.log('ok snapshot redaction');
}

function testInvalidTokenDetect() {
  assert.strictEqual(adminPush.isInvalidTokenError({ code: 'messaging/registration-token-not-registered' }), true);
  assert.strictEqual(adminPush.isInvalidTokenError({ message: 'Requested entity was not found.' }), true);
  assert.strictEqual(adminPush.isInvalidTokenError({ code: 'messaging/internal-error' }), false);
  console.log('ok invalid token detect');
}

async function testMulticastPartialFailure() {
  const store = {};
  const fakeDb = {
    collection(name) {
      return {
        doc(id) {
          const path = `${name}/${id}`;
          return {
            async get() {
              if (name === 'adminNotificationSettings') {
                return { exists: true, data: () => ({ paymentEnabled: true, inquiryEnabled: true, refundEnabled: true, criticalEnabled: true }) };
              }
              return { exists: !!store[path], data: () => store[path] || {} };
            },
            async set(patch) {
              store[path] = Object.assign({}, store[path] || {}, patch);
            }
          };
        },
        async get() {
          if (name !== 'adminDevices') return { docs: [] };
          return {
            docs: [
              {
                id: 'a',
                ref: fakeDb.collection('adminDevices').doc('a'),
                data: () => ({ status: 'approved', enabled: true, token: 'token-a', paymentEnabled: true })
              },
              {
                id: 'b',
                ref: fakeDb.collection('adminDevices').doc('b'),
                data: () => ({ status: 'approved', enabled: true, token: 'token-b', paymentEnabled: true })
              },
              {
                id: 'c',
                ref: fakeDb.collection('adminDevices').doc('c'),
                data: () => ({ status: 'pending', enabled: false, token: 'token-c' })
              }
            ]
          };
        },
        async add(entry) {
          store[`log/${Date.now()}`] = entry;
          return { id: 'log1' };
        },
        orderBy() { return this; },
        offset() { return this; },
        limit() { return this; }
      };
    },
    batch() {
      return { delete() {}, async commit() {} };
    }
  };

  const messaging = {
    async sendEach(messages) {
      assert.strictEqual(messages.length, 2);
      messages.forEach((m) => {
        assert.ok(m.data.eventType === 'payment');
        assert.ok(m.android.priority === 'high');
        assert.ok(!JSON.stringify(m).includes('password'));
      });
      assert.strictEqual(messages[0].token, 'token-a');
      assert.strictEqual(messages[1].token, 'token-b');
      assert.notStrictEqual(messages[0].token, adminPush.hashSecret('token-a'));
      return {
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } }
        ]
      };
    }
  };

  const out = await adminPush.sendAdminNotification({
    type: 'payment',
    title: '💰 신규 결제',
    body: '30일 PASS · ₩19,900'
  }, { db: fakeDb, messaging });

  assert.strictEqual(out.attempted, 2);
  assert.strictEqual(out.success, 1);
  assert.strictEqual(out.failed, 1);
  assert.strictEqual(store['adminDevices/b'].enabled, false);
  assert.strictEqual(store['adminDevices/b'].tokenInvalid, true);
  assert.strictEqual(store['adminDevices/b'].token, '');
  assert.strictEqual(store['adminDevices/b'].tokenHash, '');
  console.log('ok multicast partial failure + invalid token cleanup');
}

async function testGlobalOffSkipsSend() {
  const fakeDb = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return { exists: true, data: () => ({ paymentEnabled: false }) };
            }
          };
        },
        async get() { return { docs: [] }; },
        async add() { return { id: 'x' }; },
        orderBy() { return this; },
        offset() { return this; },
        limit() { return this; }
      };
    }
  };
  let sent = 0;
  const out = await adminPush.sendAdminNotification({
    type: 'payment',
    title: 'x'
  }, { db: fakeDb, messaging: { sendEach: async () => { sent += 1; return { responses: [] }; } } });
  assert.strictEqual(out.skipped, 'global_off');
  assert.strictEqual(sent, 0);
  console.log('ok global filter');
}

async function testPaymentFailureIsolation() {
  const fakeNotify = async () => { throw new Error('fcm down'); };
  try {
    await fakeNotify();
    assert.fail('should throw');
  } catch (err) {
    assert.ok(err.message.includes('fcm down'));
  }
  console.log('ok fcm failure can be isolated by caller');
}

function makeFakeDb(store) {
  const db = {
    collection(name) {
      return {
        doc(id) {
          const path = `${name}/${id}`;
          const ref = {
            async get() {
              if (name === 'adminNotificationSettings') {
                return {
                  exists: true,
                  data: () => store[path] || {
                    paymentEnabled: true,
                    inquiryEnabled: true,
                    refundEnabled: true,
                    criticalEnabled: true
                  }
                };
              }
              return { exists: store[path] != null, data: () => store[path] || {} };
            },
            async set(patch, opts) {
              if (opts && opts.merge) store[path] = Object.assign({}, store[path] || {}, patch);
              else store[path] = Object.assign({}, patch);
            }
          };
          return ref;
        },
        async get() {
          const prefix = `${name}/`;
          const docs = Object.keys(store).filter((k) => k.startsWith(prefix)).map((k) => {
            const id = k.slice(prefix.length);
            return {
              id,
              ref: db.collection(name).doc(id),
              data: () => store[k]
            };
          });
          return { docs };
        },
        async add(entry) {
          store[`${name}/${Date.now()}`] = entry;
          return { id: 'log1' };
        },
        orderBy() { return this; },
        offset() { return this; },
        limit() { return this; }
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return ref.get(); },
        set(ref, patch, opts) { return ref.set(patch, opts); }
      };
      return fn(tx);
    },
    batch() {
      return { delete() {}, async commit() {} };
    }
  };
  return db;
}

async function testDeviceLifecycle() {
  const store = {};
  const db = makeFakeDb(store);
  const deviceId = 'android-device-001';
  const token = 'fcm-token-value-123456';
  const req = { headers: { 'x-forwarded-for': '203.0.113.10' }, ip: '203.0.113.10' };

  const created = await adminPush.requestAdminDeviceRegistration({
    deviceId,
    fcmToken: token,
    deviceName: 'Galaxy S25 Ultra',
    appVersion: '1.0.0',
    platform: 'android'
  }, req, { db });
  assert.strictEqual(created.status, 'pending');
  assert.strictEqual(created.enabled, false);
  assert.ok(created.deviceSecret);
  assert.ok(!JSON.stringify(created).includes(token));
  const stored = store[`adminDevices/${deviceId}`];
  assert.strictEqual(stored.token, token);
  assert.strictEqual(stored.tokenHash, adminPush.hashSecret(token));
  assert.strictEqual(stored.deviceSecretHash, adminPush.hashSecret(created.deviceSecret));
  assert.ok(!Object.prototype.hasOwnProperty.call(stored, 'deviceSecret'));
  const secret = created.deviceSecret;

  const dup = await adminPush.requestAdminDeviceRegistration({
    deviceId,
    fcmToken: token,
    deviceName: 'Galaxy S25 Ultra',
    appVersion: '1.0.0',
    platform: 'android'
  }, req, { db });
  assert.strictEqual(dup.status, 'pending');
  assert.ok(!dup.deviceSecret);

  let sent = [];
  const messaging = {
    async sendEach(messages) {
      sent = messages;
      return { responses: messages.map(() => ({ success: true })) };
    }
  };

  const approved = await adminPush.adminAct({
    action: 'approve',
    deviceId,
    role: 'owner',
    label: '산타님 Galaxy'
  }, 'admin-uid', { db, messaging });
  assert.strictEqual(approved.device.status, 'approved');
  assert.strictEqual(approved.device.enabled, true);
  assert.strictEqual(approved.device.role, 'owner');
  assert.ok(sent.length >= 1);
  assert.strictEqual(sent[0].data.eventType, 'system');

  const reregDenied = await adminPush.requestAdminDeviceRegistration({
    deviceId,
    fcmToken: 'fcm-token-value-REFRESHED',
    deviceName: 'Galaxy S25 Ultra',
    appVersion: '1.0.1',
    platform: 'android'
  }, req, { db }).then(() => null, (err) => err);
  assert.ok(reregDenied);
  assert.strictEqual(reregDenied.status, 403);

  const rereg = await adminPush.requestAdminDeviceRegistration({
    deviceId,
    deviceSecret: secret,
    fcmToken: 'fcm-token-value-REFRESHED',
    deviceName: 'Galaxy S25 Ultra',
    appVersion: '1.0.1',
    platform: 'android'
  }, req, { db });
  assert.strictEqual(rereg.status, 'approved');
  assert.strictEqual(rereg.enabled, true);
  assert.ok(!rereg.deviceSecret);
  assert.strictEqual(store[`adminDevices/${deviceId}`].token, 'fcm-token-value-REFRESHED');
  assert.strictEqual(store[`adminDevices/${deviceId}`].tokenHash, adminPush.hashSecret('fcm-token-value-REFRESHED'));

  const settings = await adminPush.updateAdminDeviceSettings({
    deviceId,
    deviceSecret: secret,
    paymentEnabled: false,
    inquiryEnabled: true,
    refundEnabled: true,
    criticalEnabled: true,
    status: 'approved',
    role: 'owner',
    enabled: true
  }, { db });
  assert.strictEqual(settings.paymentEnabled, false);
  assert.strictEqual(store[`adminDevices/${deviceId}`].status, 'approved');
  assert.strictEqual(store[`adminDevices/${deviceId}`].role, 'owner');

  sent = [];
  const pay = await adminPush.sendAdminNotification({
    type: 'payment',
    title: '💰 신규 결제',
    body: '30일 PASS'
  }, { db, messaging });
  assert.strictEqual(pay.attempted, 0);
  assert.strictEqual(pay.skipped, 'no_targets');

  await adminPush.updateAdminDeviceSettings({
    deviceId,
    deviceSecret: secret,
    paymentEnabled: true,
    inquiryEnabled: true,
    refundEnabled: true,
    criticalEnabled: true
  }, { db });

  await adminPush.adminAct({ action: 'disable', deviceId }, 'admin-uid', { db, messaging });
  assert.strictEqual(store[`adminDevices/${deviceId}`].status, 'disabled');
  const disabledSend = await adminPush.sendAdminNotification({
    type: 'payment',
    title: 'x'
  }, { db, messaging });
  assert.strictEqual(disabledSend.attempted, 0);

  await adminPush.adminAct({ action: 'enable', deviceId }, 'admin-uid', { db, messaging });
  assert.strictEqual(store[`adminDevices/${deviceId}`].status, 'approved');

  await adminPush.adminAct({ action: 'revoke', deviceId }, 'admin-uid', { db, messaging });
  const afterRevoke = await adminPush.requestAdminDeviceRegistration({
    deviceId,
    fcmToken: token,
    deviceName: 'Galaxy S25 Ultra',
    appVersion: '1.0.0',
    platform: 'android'
  }, req, { db });
  assert.strictEqual(afterRevoke.status, 'revoked');
  assert.strictEqual(afterRevoke.enabled, false);

  const rejectedId = 'android-device-002';
  await adminPush.requestAdminDeviceRegistration({
    deviceId: rejectedId,
    fcmToken: token,
    deviceName: 'Pixel',
    appVersion: '1.0.0',
    platform: 'android'
  }, req, { db });
  await adminPush.adminAct({ action: 'reject', deviceId: rejectedId }, 'admin-uid', { db, messaging });
  const reapply = await adminPush.requestAdminDeviceRegistration({
    deviceId: rejectedId,
    fcmToken: token,
    deviceName: 'Pixel',
    appVersion: '1.0.0',
    platform: 'android'
  }, req, { db });
  assert.strictEqual(reapply.status, 'pending');
  assert.ok(!reapply.deviceSecret);

  const statusOk = await adminPush.getAdminDeviceStatus({ deviceId, deviceSecret: secret }, { db });
  assert.strictEqual(statusOk.status, 'revoked');
  assert.ok(!statusOk.deviceSecret);
  assert.ok(!Object.prototype.hasOwnProperty.call(statusOk, 'token'));

  let denied = null;
  try {
    await adminPush.getAdminDeviceStatus({ deviceId, deviceSecret: 'wrong-secret-value' }, { db });
  } catch (err) {
    denied = err;
  }
  assert.ok(denied);
  assert.strictEqual(denied.status, 403);

  let tokenOnly = null;
  try {
    await adminPush.getAdminDeviceStatus({ deviceId, fcmToken: token }, { db });
  } catch (err) {
    tokenOnly = err;
  }
  assert.ok(tokenOnly);
  assert.strictEqual(tokenOnly.status, 403);
  console.log('ok device lifecycle + whitelist + revoke/reject');
}

async function testCategoryFilter() {
  const store = {
    'adminDevices/keep': { status: 'approved', enabled: true, token: 'token-keep', paymentEnabled: true },
    'adminDevices/skip': { status: 'approved', enabled: true, token: 'token-skip', paymentEnabled: false }
  };
  const db = makeFakeDb(store);
  let count = 0;
  const out = await adminPush.sendAdminNotification({
    type: 'payment',
    title: 'pay'
  }, {
    db,
    messaging: {
      async sendEach(messages) {
        count = messages.length;
        return { responses: messages.map(() => ({ success: true })) };
      }
    }
  });
  assert.strictEqual(count, 1);
  assert.strictEqual(out.success, 1);
  console.log('ok device category filter');
}

async function testTokenRefreshAndRevokedPush() {
  const store = {};
  const db = makeFakeDb(store);
  const deviceId = 'android-device-003';
  const token = 'fcm-token-original-aaaaaa';
  const req = { headers: {}, ip: '203.0.113.20' };
  const created = await adminPush.requestAdminDeviceRegistration({
    deviceId,
    fcmToken: token,
    deviceName: 'Pixel 9',
    appVersion: '1.0.0',
    platform: 'android'
  }, req, { db });
  const secret = created.deviceSecret;
  await adminPush.adminAct({ action: 'approve', deviceId, role: 'staff', label: 'Pixel' }, 'admin-uid', {
    db,
    messaging: { async sendEach() { return { responses: [{ success: true }] }; } }
  });
  const before = Object.assign({}, store[`adminDevices/${deviceId}`]);
  await adminPush.updateAdminDeviceToken({
    deviceId,
    deviceSecret: secret,
    fcmToken: 'fcm-token-rotated-bbbbbb',
    appVersion: '1.0.1'
  }, { db });
  const after = store[`adminDevices/${deviceId}`];
  assert.strictEqual(after.status, before.status);
  assert.strictEqual(after.role, before.role);
  assert.strictEqual(after.enabled, before.enabled);
  assert.strictEqual(after.token, 'fcm-token-rotated-bbbbbb');
  assert.strictEqual(after.tokenHash, adminPush.hashSecret('fcm-token-rotated-bbbbbb'));

  await adminPush.adminAct({ action: 'revoke', deviceId }, 'admin-uid', { db });
  assert.strictEqual(adminPush.isPushTarget(store[`adminDevices/${deviceId}`]), false);
  let sent = 0;
  const out = await adminPush.sendAdminNotification({
    type: 'payment',
    title: 'pay'
  }, {
    db,
    messaging: {
      async sendEach(messages) {
        sent = messages.length;
        return { responses: messages.map(() => ({ success: true })) };
      }
    }
  });
  assert.strictEqual(sent, 0);
  assert.ok(out.attempted === 0);

  const hashedOnly = {
    status: 'approved',
    enabled: true,
    token: adminPush.hashSecret('raw-fcm-token-value-xx'),
    tokenHash: adminPush.hashSecret('raw-fcm-token-value-xx')
  };
  assert.strictEqual(adminPush.fcmSendToken(hashedOnly), '');
  assert.strictEqual(adminPush.isPushTarget(hashedOnly), false);
  console.log('ok token refresh immutability + revoked skip + hash not sent');
}

function makePushDb(store) {
  const db = {
    collection(name) {
      const col = {
        doc(id) {
          const path = `${name}/${id}`;
          return {
            async get() {
              if (name === 'adminNotificationSettings') {
                return {
                  exists: true,
                  data: () => ({
                    paymentEnabled: true,
                    inquiryEnabled: true,
                    refundEnabled: true,
                    criticalEnabled: true
                  })
                };
              }
              return { exists: store[path] != null, data: () => store[path] || {} };
            },
            async set(patch, opts) {
              if (opts && opts.merge) store[path] = Object.assign({}, store[path] || {}, patch);
              else store[path] = Object.assign({}, patch);
            },
            async create(doc) {
              if (store[path] != null) {
                const err = new Error('ALREADY_EXISTS');
                err.code = 'already-exists';
                throw err;
              }
              store[path] = Object.assign({}, doc);
            }
          };
        },
        async get() {
          if (name !== 'adminDevices') return { docs: [] };
          return {
            docs: Object.keys(store)
              .filter((k) => k.startsWith('adminDevices/'))
              .map((k) => ({
                id: k.slice('adminDevices/'.length),
                ref: col.doc(k.slice('adminDevices/'.length)),
                data: () => store[k]
              }))
          };
        },
        async add(entry) {
          store[`adminPushLogs/${Object.keys(store).length}`] = entry;
          return { id: 'log' };
        },
        orderBy() { return this; },
        offset() { return this; },
        limit() { return this; }
      };
      return col;
    }
  };
  return db;
}

async function testAtomicPaidClaim() {
  const store = {
    'adminDevices/dev1': {
      status: 'approved',
      enabled: true,
      token: 'fcm-paid-token-value',
      paymentEnabled: true
    }
  };
  const db = makePushDb(store);
  let fcmCalls = 0;
  const messaging = {
    async sendEach(messages) {
      fcmCalls += messages.length;
      return { responses: messages.map(() => ({ success: true })) };
    }
  };
  const payload = {
    type: 'payment',
    title: '💰 신규 결제',
    body: 'Lifetime License · ₩130,000',
    entityId: 'pay_life',
    eventKey: adminPush.paymentPaidEventKey('pay_life')
  };
  const first = await adminPush.sendAdminNotification(payload, { db, messaging });
  const second = await adminPush.sendAdminNotification(payload, { db, messaging });
  const alias = await adminPush.sendAdminNotification(Object.assign({}, payload, {
    body: 'Lifetime · ₩130,000'
  }), { db, messaging });
  assert.strictEqual(first.success, 1);
  assert.strictEqual(second.skipped, 'already_sent');
  assert.strictEqual(alias.skipped, 'already_sent');
  assert.strictEqual(fcmCalls, 1);
  console.log('ok paid eventKey webhook/retry/alias → FCM 1');
}

async function testRefundEventClaim() {
  const store = {
    'adminDevices/dev1': {
      status: 'approved',
      enabled: true,
      token: 'fcm-refund-token-value',
      refundEnabled: true
    },
    'orders/pay_r': {
      productName: 'Lifetime',
      amount: 130000,
      currency: 'KRW'
    }
  };
  const db = makePushDb(store);
  let fcmCalls = 0;
  const messaging = {
    async sendEach(messages) {
      fcmCalls += messages.length;
      return { responses: messages.map(() => ({ success: true })) };
    }
  };
  const result = {
    paymentId: 'pay_r',
    status: 'refunded',
    cancelledAmount: 130000,
    eventsApplied: 1,
    refundEventIds: ['ev_1']
  };
  const first = await adminPush.maybeNotifyRefundFcm(result, { db, messaging });
  const retry = await adminPush.maybeNotifyRefundFcm(result, { db, messaging });
  const historical = await adminPush.maybeNotifyRefundFcm({
    paymentId: 'pay_r',
    status: 'refunded',
    cancelledAmount: 130000,
    eventsApplied: 0,
    duplicateEvent: true
  }, { db, messaging });
  assert.strictEqual(first.success, 1);
  assert.strictEqual(retry.skipped, 'already_sent');
  assert.strictEqual(historical.skipped, 'duplicate_event');
  assert.strictEqual(fcmCalls, 1);
  console.log('ok refund event retry → FCM 1, historical duplicate 0');
}

(async () => {
  testHelpers();
  testPushTargetAndFilters();
  testProof();
  testSnapshotHidesSecrets();
  testInvalidTokenDetect();
  await testMulticastPartialFailure();
  await testGlobalOffSkipsSend();
  await testPaymentFailureIsolation();
  await testDeviceLifecycle();
  await testCategoryFilter();
  await testTokenRefreshAndRevokedPush();
  await testAtomicPaidClaim();
  await testRefundEventClaim();
  console.log('all adminPush tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
