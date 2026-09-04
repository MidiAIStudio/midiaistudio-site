/**
 * Admin Kakao notify unit tests (no network, no secrets printed).
 */
const assert = require('assert');
const adminNotify = require('./adminNotify');
const kakaoAdminNotify = require('./kakaoAdminNotify');

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
  console.log('ok license gate');
}

function testTruncate() {
  const long = 'x'.repeat(250);
  const out = kakaoAdminNotify.truncateText(long, 200);
  assert.ok(out.length <= 200);
  console.log('ok truncate');
}

async function testKakaoFailureIsolated() {
  const failingNotify = async () => {
    throw Object.assign(new Error('kakao down'), { stage: 'memo_send_failed' });
  };
  const ref = {
    async get() {
      return { exists: true, data: () => ({}) };
    }
  };
  // claimAdminNotify uses real Firestore — stub alreadyNotified path via empty claim by
  // injecting notifyAdmin failure before claim. Use deps.notifyAdmin.
  const okInquiry = await adminNotify.notifyInquiryCreated('t_fail', {
    title: 'x',
    email: 'a@b.c'
  }, ref, { notifyAdmin: failingNotify, db: {}, FieldValue: {} });
  assert.strictEqual(okInquiry, false);

  const okPayment = await adminNotify.notifyPaymentCompleted('o_fail', {
    status: 'completed',
    licenseIssued: true,
    productName: 'P',
    amount: 1,
    currency: 'USD',
    email: 'a@b.c'
  }, ref, { notifyAdmin: failingNotify, db: {}, FieldValue: {} });
  assert.strictEqual(okPayment, false);
  console.log('ok kakao failure isolated');
}

async function testTokenRefreshMock() {
  const originalFetch = global.fetch;
  let refreshBody = '';
  global.fetch = async (url, opts) => {
    if (String(url).includes('/oauth/token')) {
      refreshBody = String(opts.body || '');
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            access_token: 'access_mock_not_logged',
            expires_in: 3600
            // no new refresh_token
          };
        }
      };
    }
    throw new Error('unexpected url');
  };

  process.env.KAKAO_REST_API_KEY = 'rest_key_mock';
  process.env.KAKAO_CLIENT_SECRET = 'client_secret_mock';

  const fakeDb = {
    collection() {
      return {
        doc() {
          return {
            async get() {
              return {
                exists: true,
                data: () => ({
                  refreshToken: 'refresh_mock_not_logged',
                  hasRefreshToken: true
                })
              };
            },
            async set() {
              return undefined;
            }
          };
        }
      };
    }
  };
  const FieldValue = { serverTimestamp: () => 'ts' };

  try {
    const token = await kakaoAdminNotify.getKakaoAdminAccessToken(fakeDb, FieldValue);
    assert.strictEqual(token, 'access_mock_not_logged');
    assert.ok(refreshBody.includes('grant_type=refresh_token'));
    assert.ok(refreshBody.includes('client_id=rest_key_mock'));
    assert.ok(refreshBody.includes('client_secret=client_secret_mock'));
    assert.ok(refreshBody.includes('refresh_token=refresh_mock_not_logged'));
    console.log('ok token refresh mock');
  } finally {
    global.fetch = originalFetch;
    delete process.env.KAKAO_REST_API_KEY;
    delete process.env.KAKAO_CLIENT_SECRET;
  }
}

async function testDiscordGone() {
  let threw = false;
  try {
    require('./discordNotify');
  } catch (_) {
    threw = true;
  }
  assert.strictEqual(threw, true);
  const fs = require('fs');
  const indexSrc = fs.readFileSync(require('path').join(__dirname, 'index.js'), 'utf8');
  assert.ok(!/DISCORD_INQUIRY_WEBHOOK|DISCORD_PAYMENT_WEBHOOK|discordNotify|notifyDiscordOn/.test(indexSrc));
  assert.ok(/notifyAdminOnInquiryCreate|notifyAdminOnOrderCompleted/.test(indexSrc));
  console.log('ok discord executable refs removed from functions');
}

(async () => {
  testPayloadBuilders();
  testLicenseGate();
  testTruncate();
  await testKakaoFailureIsolated();
  await testTokenRefreshMock();
  await testDiscordGone();
  console.log('all adminNotify tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
