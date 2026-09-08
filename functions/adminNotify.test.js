/**
 * Admin notify unit tests — FCM only, no Kakao self-message.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const adminNotify = require('./adminNotify');
const adminPush = require('./adminPush');

const KAKAO_MEMO_RE = /kapi\.kakao\.com|talk\/memo|나에게 보내기|나와의 채팅/;
const KAKAO_ADMIN_MODULE_RE = /kakaoAdminNotify|kakaoOAuth|notifyAdminKakao|sendKakaoAdminNotification|getKakaoAdminAccessToken|testKakaoAdminNotification|kakaoOAuthCallback/;

function testPayloadBuilders() {
  const payment = adminNotify.buildPaymentAlert('ord_1', {
    productName: 'Lifetime License',
    amount: 129000,
    currency: 'KRW',
    email: 'buyer@example.com',
    completedAt: '2026-09-04T03:00:00.000Z',
    status: 'completed',
    licenseIssued: true
  });
  assert.strictEqual(payment.type, 'payment');
  assert.ok(payment.title.includes('결제'));
  assert.ok(payment.message.includes('Lifetime License'));
  assert.ok(payment.message.includes('129,000'));
  assert.ok(payment.message.includes('buyer@example.com'));
  assert.ok(!/token|secret|webhook|password/i.test(payment.message));

  const inquiry = adminNotify.buildInquiryAlert('t1', {
    title: '설치가 안 됩니다',
    email: 'user@example.com',
    category: 'bug',
    content: '매우 긴 본문은 카카오에 보내지 않아야 합니다. '.repeat(20),
    createdAt: '2026-09-04T04:00:00.000Z'
  });
  assert.strictEqual(inquiry.type, 'inquiry');
  assert.ok(inquiry.title.includes('문의'));
  assert.ok(inquiry.message.includes('설치가 안 됩니다'));
  assert.ok(inquiry.message.includes('user@example.com'));
  assert.ok(!inquiry.message.includes('매우 긴 본문은'));
  console.log('ok payload builders');
}

function testLicenseGate() {
  assert.strictEqual(adminNotify.isLicenseGrantedOrder({ status: 'created' }), false);
  assert.strictEqual(adminNotify.isLicenseGrantedOrder({
    status: 'completed',
    licenseIssued: true
  }), true);
  assert.strictEqual(adminNotify.isLicenseGrantedOrder({
    status: 'completed',
    provider: 'paypal',
    paypalCaptureId: 'cap_1'
  }), true);
  assert.strictEqual(adminNotify.shouldSendPaymentPushOnOrderWrite(false, {}, {
    status: 'completed',
    licenseIssued: true
  }), true);
  assert.strictEqual(adminNotify.shouldSendPaymentPushOnOrderWrite(true, {
    status: 'created'
  }, {
    status: 'completed',
    licenseIssued: true
  }), true);
  assert.strictEqual(adminNotify.shouldSendPaymentPushOnOrderWrite(true, {
    status: 'completed',
    licenseIssued: true
  }, {
    status: 'completed',
    licenseIssued: true,
    lastSyncedAt: '2026-09-08'
  }), false);
  console.log('ok license gate');
}

function grantedOrder(extra) {
  return Object.assign({
    status: 'completed',
    licenseIssued: true,
    productName: 'Lifetime',
    amount: 130000,
    currency: 'KRW',
    email: 'buyer@example.com'
  }, extra || {});
}

function orderChange(before, after) {
  return {
    before: { exists: !!before, data: () => before || {} },
    after: { exists: !!after, data: () => after || {} }
  };
}

async function testHistoricalPaidOrdersDoNotPush() {
  let fcmCalls = 0;
  const deps = {
    sendFcmPayment: async () => {
      fcmCalls += 1;
      return { success: 1 };
    }
  };
  const ids = ['hist_1', 'hist_2', 'hist_3', 'hist_4'];
  for (const id of ids) {
    const paid = grantedOrder({ paymentId: id });
    const out = await adminNotify.handleOrderWrite(
      id,
      orderChange(paid, Object.assign({}, paid, { lastSyncedAt: 'reconcile' })),
      { id },
      deps
    );
    assert.strictEqual(out.sent, false);
  }
  assert.strictEqual(fcmCalls, 0);
  console.log('ok historical paid orders 4건 → FCM 0');
}

async function testPendingToPaidPushesOnce() {
  let fcmCalls = 0;
  const deps = {
    sendFcmPayment: async () => {
      fcmCalls += 1;
      return { success: 1 };
    }
  };
  const pending = { status: 'created', licenseIssued: false, paymentId: 'new_1' };
  const paid = grantedOrder({ paymentId: 'new_1' });
  const first = await adminNotify.handleOrderWrite('new_1', orderChange(pending, paid), { id: 'new_1' }, deps);
  const retry = await adminNotify.handleOrderWrite('new_1', orderChange(paid, paid), { id: 'new_1' }, deps);
  assert.strictEqual(first.sent, true);
  assert.strictEqual(retry.sent, false);
  assert.strictEqual(fcmCalls, 1);
  console.log('ok pending → paid FCM 1회, retry 0');
}

async function testSameCanonicalDifferentProductName() {
  assert.strictEqual(
    adminPush.paymentPaidEventKey('pay_life'),
    adminPush.paymentPaidEventKey('pay_life')
  );
  const a = adminPush.paymentPaidEventKey('pay_life');
  const lifetime = grantedOrder({ paymentId: 'pay_life', productName: 'Lifetime' });
  const license = grantedOrder({ paymentId: 'pay_life', productName: 'Lifetime License' });
  assert.strictEqual(adminNotify.shouldSendPaymentPushOnOrderWrite(true, lifetime, license), false);
  assert.strictEqual(a, 'payment:pay_life:paid');
  console.log('ok canonical paymentId aliases share one paid event key');
}

function testReadApisAreSideEffectFree() {
  const files = [
    'adminMobileDashboard.js',
    'adminSettlement.js'
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.ok(!/sendAdminNotification|maybeNotifyPaymentFcm|maybeNotifyRefundFcm|notifyPaymentCompleted/.test(src), file);
  }
  console.log('ok dashboard/sales/settlement source has no FCM send');
}

function countKakaoSelfMessage(src) {
  const memoHits = src.match(/talk\/memo|kapi\.kakao\.com\/v2\/api\/talk\/memo/g) || [];
  const oauthHits = src.match(/kakaoAdminNotify|createKakaoOAuthCallbackHandler|createTestKakaoAdminNotificationHandler|kakaoOAuthCallback|testKakaoAdminNotification/g) || [];
  return memoHits.length + oauthHits.length;
}

async function testPaymentSuccessFcmOnly() {
  let fcmCalls = 0;
  let kakaoCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (KAKAO_MEMO_RE.test(String(url))) kakaoCalls += 1;
    throw new Error('unexpected fetch');
  };
  try {
    const ok = await adminNotify.notifyPaymentCompleted('o_ok', {
      status: 'completed',
      licenseIssued: true,
      productName: 'Lifetime',
      amount: 129000,
      currency: 'KRW',
      email: 'buyer@example.com'
    }, { id: 'o_ok' }, {
      sendFcmPayment: async () => {
        fcmCalls += 1;
        return { success: 1 };
      }
    });
    assert.strictEqual(ok, true);
    assert.strictEqual(fcmCalls, 1);
    assert.strictEqual(kakaoCalls, 0);
    console.log('ok payment success → FCM, Kakao 0');
  } finally {
    global.fetch = originalFetch;
  }
}

async function testInquiryWaitingHumanFcmOnly() {
  let fcmCalls = 0;
  let kakaoCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (KAKAO_MEMO_RE.test(String(url))) kakaoCalls += 1;
    throw new Error('unexpected fetch');
  };
  try {
    const ok = await adminNotify.notifyInquiryCreated('t_wait', {
      title: '상담 요청',
      email: 'user@example.com',
      conversationMode: 'waiting_human'
    }, { id: 't_wait' }, {
      sendFcmInquiry: async () => {
        fcmCalls += 1;
        return { success: 1 };
      }
    });
    assert.strictEqual(ok, true);
    assert.strictEqual(fcmCalls, 1);
    assert.strictEqual(kakaoCalls, 0);
    console.log('ok inquiry waiting_human → FCM, Kakao 0');
  } finally {
    global.fetch = originalFetch;
  }
}

function makeFcmFakeDb(store) {
  return {
    collection(name) {
      const col = {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              return { exists: store[key] != null, data: () => store[key] || {} };
            },
            async set(patch, opts) {
              if (opts && opts.merge) store[key] = Object.assign({}, store[key] || {}, patch);
              else store[key] = Object.assign({}, patch);
              return undefined;
            },
            async create(doc) {
              if (store[key] != null) {
                const err = new Error('ALREADY_EXISTS');
                err.code = 'already-exists';
                throw err;
              }
              store[key] = Object.assign({}, doc);
            }
          };
        },
        async get() {
          return {
            docs: Object.keys(store)
              .filter((k) => k.startsWith(`${name}/`))
              .map((k) => ({
                id: k.slice(name.length + 1),
                data: () => store[k],
                ref: col.doc(k.slice(name.length + 1))
              }))
          };
        },
        async add(doc) {
          store[`${name}/log_${Object.keys(store).length}`] = doc;
          return { id: 'log' };
        },
        orderBy() { return this; },
        offset() { return this; },
        limit() { return this; }
      };
      return col;
    }
  };
}

async function testRefundFcmOnly() {
  let fcmCalls = 0;
  let kakaoCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (KAKAO_MEMO_RE.test(String(url))) kakaoCalls += 1;
    return { ok: false, status: 500, async json() { return {}; } };
  };
  const store = {
    'adminDevices/dev1': {
      status: 'approved',
      enabled: true,
      token: 'fcm-refund-token-value',
      refundEnabled: true
    }
  };
  try {
    const out = await adminPush.sendAdminNotification({
      type: 'refund',
      title: '↩ 결제 취소',
      body: 'Lifetime · 129,000 KRW',
      entityId: 'pay_1'
    }, {
      db: makeFcmFakeDb(store),
      messaging: {
        async sendEach(messages) {
          fcmCalls += messages.length;
          return { responses: messages.map(() => ({ success: true })) };
        }
      }
    });
    assert.strictEqual(out.success, 1);
    assert.strictEqual(fcmCalls, 1);
    assert.strictEqual(kakaoCalls, 0);
    const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    assert.ok(/maybeNotifyRefundFcm/.test(indexSrc));
    assert.ok(!/notifyAdminKakao|sendKakaoAdminNotification/.test(indexSrc));
    console.log('ok refund → FCM, Kakao 0');
  } finally {
    global.fetch = originalFetch;
  }
}

async function testCriticalFcmOnly() {
  let fcmCalls = 0;
  let kakaoCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (KAKAO_MEMO_RE.test(String(url))) kakaoCalls += 1;
    return { ok: false, status: 500, async json() { return {}; } };
  };
  const store = {
    'adminDevices/dev1': {
      status: 'approved',
      enabled: true,
      token: 'fcm-critical-token-value',
      criticalEnabled: true
    }
  };
  try {
    const out = await adminPush.notifyCritical({
      key: '',
      title: '🚨 테스트',
      body: 'critical',
      entityId: 'x'
    }, {
      db: makeFcmFakeDb(store),
      messaging: {
        async sendEach(messages) {
          fcmCalls += messages.length;
          return { responses: messages.map(() => ({ success: true })) };
        }
      }
    });
    assert.strictEqual(out.success, 1);
    assert.strictEqual(fcmCalls, 1);
    assert.strictEqual(kakaoCalls, 0);
    const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    assert.ok(/adminPush\.notifyCritical/.test(indexSrc));
    console.log('ok critical → FCM, Kakao 0');
  } finally {
    global.fetch = originalFetch;
  }
}

async function testFcmFailureIsolated() {
  const failingFcm = async () => {
    throw new Error('fcm down');
  };
  const ref = { id: 'iso' };

  const okInquiry = await adminNotify.notifyInquiryCreated('t_fail', {
    title: 'x',
    email: 'a@b.c',
    conversationMode: 'waiting_human'
  }, ref, { sendFcmInquiry: failingFcm });
  assert.strictEqual(okInquiry, true);

  const okPayment = await adminNotify.notifyPaymentCompleted('o_fail', {
    status: 'completed',
    licenseIssued: true,
    productName: 'P',
    amount: 1,
    currency: 'USD',
    email: 'a@b.c'
  }, ref, { sendFcmPayment: failingFcm });
  assert.strictEqual(okPayment, true);
  console.log('ok FCM failure isolated (does not fail main handling)');
}

function testKakaoSelfMessageGone() {
  const files = [
    'adminNotify.js',
    'index.js',
    'adminPush.js',
    'creditPurchase.js'
  ];
  for (const file of files) {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.strictEqual(countKakaoSelfMessage(src), 0, `${file} still has Kakao self-message refs`);
    assert.ok(!KAKAO_MEMO_RE.test(src) || file === 'adminNotify.test.js', `${file} mentions Kakao memo`);
  }
  assert.strictEqual(fs.existsSync(path.join(__dirname, 'kakaoAdminNotify.js')), false);
  assert.strictEqual(fs.existsSync(path.join(__dirname, 'kakaoOAuth.js')), false);
  let threwAdmin = false;
  let threwOauth = false;
  try { require('./kakaoAdminNotify'); } catch (_) { threwAdmin = true; }
  try { require('./kakaoOAuth'); } catch (_) { threwOauth = true; }
  assert.strictEqual(threwAdmin, true);
  assert.strictEqual(threwOauth, true);

  const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.ok(!KAKAO_ADMIN_MODULE_RE.test(indexSrc));
  assert.ok(/notifyAdminOnInquiryCreate|notifyAdminOnOrderCompleted/.test(indexSrc));
  assert.ok(/handleOrderWrite|maybeNotifyPaymentFcm|notifyPaymentCompleted/.test(indexSrc));
  assert.ok(/sendAdminNotification|notifyCritical|maybeNotifyRefundFcm/.test(indexSrc));
  console.log('ok Kakao self-message modules and callsites removed');
}

async function testDiscordGone() {
  let threw = false;
  try {
    require('./discordNotify');
  } catch (_) {
    threw = true;
  }
  assert.strictEqual(threw, true);
  const indexSrc = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.ok(!/DISCORD_INQUIRY_WEBHOOK|DISCORD_PAYMENT_WEBHOOK|discordNotify|notifyDiscordOn/.test(indexSrc));
  assert.ok(/notifyAdminOnInquiryCreate|notifyAdminOnOrderCompleted/.test(indexSrc));
  console.log('ok discord executable refs removed from functions');
}

(async () => {
  testPayloadBuilders();
  testLicenseGate();
  await testHistoricalPaidOrdersDoNotPush();
  await testPendingToPaidPushesOnce();
  await testSameCanonicalDifferentProductName();
  testReadApisAreSideEffectFree();
  await testPaymentSuccessFcmOnly();
  await testInquiryWaitingHumanFcmOnly();
  await testRefundFcmOnly();
  await testCriticalFcmOnly();
  await testFcmFailureIsolated();
  testKakaoSelfMessageGone();
  await testDiscordGone();
  console.log('all adminNotify tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
