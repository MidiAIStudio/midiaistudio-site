/**
 * Admin mobile dashboard unit tests (no network, no secrets printed).
 * Run: node adminMobileDashboard.test.js
 */
const assert = require('assert');
const adminPush = require('./adminPush');
const dash = require('./adminMobileDashboard');

const DEVICE_ID = 'android-device-dash01';
const SECRET = 'dash-device-secret-value';
const NOW = new Date(dash.zonedLocalToUtcMs(2026, 9, 8, 0, 34, 0, dash.TZ));

function cmpValue(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value && typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : ms;
}

function makeFakeDb(store) {
  function createQuery(name) {
    const state = { filters: [], orders: [], lim: null };
    const query = {
      where(field, op, value) {
        state.filters.push({ field, op, value });
        return query;
      },
      orderBy(field, dir) {
        state.orders.push({ field, dir: dir || 'asc' });
        return query;
      },
      limit(n) {
        state.lim = n;
        return query;
      },
      async get() {
        const prefix = `${name}/`;
        let rows = Object.keys(store)
          .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map((k) => {
            const id = k.slice(prefix.length);
            return {
              id,
              ref: db.collection(name).doc(id),
              data: () => store[k] || {}
            };
          });
        rows = rows.filter((row) => {
          const data = row.data();
          return state.filters.every((f) => {
            const left = data[f.field];
            if (f.op === '==') return left === f.value;
            if (left == null) return false;
            const lv = cmpValue(left);
            const rv = cmpValue(f.value);
            if (f.op === '>=') return lv >= rv;
            if (f.op === '<') return lv < rv;
            if (f.op === '>') return lv > rv;
            if (f.op === '<=') return lv <= rv;
            return false;
          });
        });
        if (state.orders.length) {
          const ord = state.orders[0];
          rows.sort((a, b) => {
            const d = cmpValue(a.data()[ord.field]) - cmpValue(b.data()[ord.field]);
            return ord.dir === 'desc' ? -d : d;
          });
        }
        if (state.lim != null) rows = rows.slice(0, state.lim);
        return { docs: rows, empty: rows.length === 0 };
      }
    };
    return query;
  }

  const db = {
    collection(name) {
      const query = createQuery(name);
      query.doc = function doc(id) {
        const path = `${name}/${id}`;
        const ref = {
          id,
          path,
          async get() {
            return { exists: store[path] != null, id, data: () => store[path] || {}, ref };
          },
          async set(patch, opts) {
            if (opts && opts.merge) store[path] = Object.assign({}, store[path] || {}, patch);
            else store[path] = Object.assign({}, patch);
          }
        };
        return ref;
      };
      return query;
    }
  };
  return db;
}

function approvedStore(extra) {
  const store = {
    [`adminDevices/${DEVICE_ID}`]: {
      status: 'approved',
      enabled: true,
      deviceSecretHash: adminPush.hashSecret(SECRET),
      role: 'owner'
    }
  };
  Object.assign(store, extra || {});
  return store;
}

function auth() {
  return { deviceId: DEVICE_ID, deviceSecret: SECRET };
}

function kst(y, m, d, hh, mm, ss) {
  return new Date(dash.zonedLocalToUtcMs(y, m, d, hh, mm || 0, ss || 0, dash.TZ));
}

function testKstTodayIncludes0034() {
  const bounds = dash.kstBounds(NOW);
  const included = kst(2026, 9, 8, 0, 34, 0);
  const excluded = kst(2026, 9, 7, 23, 59, 0);
  assert.ok(included.getTime() >= bounds.todayStart.getTime());
  assert.ok(included.getTime() < bounds.todayEnd.getTime());
  assert.ok(excluded.getTime() < bounds.todayStart.getTime());
  assert.strictEqual(excluded.getTime() >= bounds.todayStart.getTime(), false);
  console.log('ok kst today 00:34 included / prev 23:59 excluded');
}

function testKstMonthBoundary() {
  const bounds = dash.kstBounds(NOW);
  const first = kst(2026, 9, 1, 0, 0, 0);
  const lastAug = kst(2026, 8, 31, 23, 59, 59);
  const oct = kst(2026, 10, 1, 0, 0, 0);
  assert.ok(first.getTime() >= bounds.monthStart.getTime());
  assert.ok(first.getTime() < bounds.monthEnd.getTime());
  assert.ok(lastAug.getTime() < bounds.monthStart.getTime());
  assert.ok(oct.getTime() >= bounds.monthEnd.getTime());
  assert.strictEqual(bounds.todayStart.toISOString(), '2026-09-07T15:00:00.000Z');
  assert.strictEqual(bounds.todayEnd.toISOString(), '2026-09-08T15:00:00.000Z');
  assert.strictEqual(bounds.monthStart.toISOString(), '2026-08-31T15:00:00.000Z');
  assert.strictEqual(bounds.monthEnd.toISOString(), '2026-09-30T15:00:00.000Z');
  console.log('ok kst month boundary via timezone API');
}

function testPaidFilterAndEmailMask() {
  assert.strictEqual(dash.wasSuccessfulPayment({ status: 'completed', amount: 19900, currency: 'KRW' }), true);
  assert.strictEqual(dash.wasSuccessfulPayment({ status: 'failed', amount: 19900 }), false);
  assert.strictEqual(dash.wasSuccessfulPayment({ status: 'pending', amount: 19900 }), false);
  assert.strictEqual(dash.wasSuccessfulPayment({ status: 'created', amount: 19900 }), false);
  assert.strictEqual(dash.wasSuccessfulPayment({ status: 'completed', environment: 'test', amount: 100 }), false);
  assert.strictEqual(dash.wasSuccessfulPayment({ status: 'credited', granted: true, amount: 4900 }), true);
  assert.strictEqual(adminPush.maskEmail('kante@gmail.com'), 'kan***@gmail.com');
  const mapped = dash.mapPayment('pay_1', {
    email: 'kante@gmail.com',
    amount: 19900,
    currency: 'KRW',
    status: 'completed',
    provider: 'portone',
    productName: '30일 PASS'
  });
  assert.strictEqual(mapped.emailMasked, 'kan***@gmail.com');
  assert.ok(!JSON.stringify(mapped).includes('kante@gmail.com'));
  assert.ok(!JSON.stringify(mapped).includes('deviceSecret'));
  console.log('ok paid filter + masked email');
}

function testNoDoubleCountKeys() {
  const keys = dash.dedupKeys('auto1', { paymentId: 'pay_x', paypalOrderId: 'PAYPAL-1' });
  assert.ok(keys.includes('pay_x'));
  assert.ok(keys.includes('PAYPAL-1'));
  assert.ok(keys.includes('auto1'));
  console.log('ok dedup keys');
}

async function testApprovedSuccessAndLists() {
  const store = approvedStore({
    'orders/pay_today': {
      paymentId: 'pay_today',
      status: 'completed',
      provider: 'portone',
      productName: '30일 PASS',
      amount: 19900,
      currency: 'KRW',
      email: 'kante@gmail.com',
      completedAt: kst(2026, 9, 8, 0, 34, 0),
      environment: 'live'
    },
    'orders/pay_fail': {
      paymentId: 'pay_fail',
      status: 'failed',
      amount: 19900,
      currency: 'KRW',
      email: 'fail@x.com',
      completedAt: kst(2026, 9, 8, 0, 10, 0),
      environment: 'live'
    },
    'orders/pay_pending': {
      paymentId: 'pay_pending',
      status: 'pending',
      amount: 9900,
      currency: 'KRW',
      completedAt: kst(2026, 9, 8, 0, 11, 0)
    },
    'orders/pay_test': {
      paymentId: 'pay_test',
      status: 'completed',
      amount: 100,
      currency: 'KRW',
      completedAt: kst(2026, 9, 8, 0, 12, 0),
      environment: 'test'
    },
    'orders/pay_aug': {
      paymentId: 'pay_aug',
      status: 'completed',
      provider: 'portone',
      productName: 'Lifetime',
      amount: 129000,
      currency: 'KRW',
      email: 'aug@x.com',
      completedAt: kst(2026, 8, 31, 23, 59, 0),
      environment: 'live'
    },
    'orders/pay_month': {
      paymentId: 'pay_month',
      status: 'completed',
      provider: 'paypal',
      paypalOrderId: 'PAYPAL-MONTH',
      productName: 'Lifetime',
      amount: 89,
      currency: 'USD',
      effectivePriceKrw: 129000,
      fxRate: 1450,
      email: 'pp@x.com',
      completedAt: kst(2026, 9, 1, 0, 0, 0)
    },
    'creditPurchases/pay_credit': {
      paymentId: 'pay_credit',
      status: 'credited',
      granted: true,
      amount: 4900,
      currency: 'KRW',
      email: 'cred@x.com',
      orderName: '100 Credits',
      createdAt: kst(2026, 9, 8, 0, 20, 0)
    },
    'creditPurchases/PAYPAL-MONTH': {
      paymentId: 'PAYPAL-MONTH',
      status: 'credited',
      granted: true,
      amount: 89,
      currency: 'USD',
      email: 'pp@x.com',
      createdAt: kst(2026, 9, 1, 0, 0, 0)
    },
    'supportTickets/inq_1': {
      title: '설치 오류',
      category: 'install',
      email: 'kante@gmail.com',
      conversationMode: 'waiting_human',
      status: 'open',
      humanRequestedAt: kst(2026, 9, 8, 0, 34, 0),
      createdAt: kst(2026, 9, 8, 0, 30, 0)
    },
    'supportTickets/inq_ai': {
      title: 'AI only',
      category: 'other',
      email: 'ai@x.com',
      conversationMode: 'ai',
      status: 'open',
      createdAt: kst(2026, 9, 8, 0, 33, 0)
    },
    'adminPushLogs/crit_1': {
      type: 'critical',
      title: '지급 실패',
      summary: 'PASS 지급 실패',
      createdAt: kst(2026, 9, 8, 0, 15, 0)
    }
  });
  const out = await dash.getAdminMobileDashboard(auth(), { db: makeFakeDb(store), now: NOW });
  assert.strictEqual(out.today.payments, 2);
  assert.strictEqual(out.today.revenue, 19900 + 4900);
  assert.strictEqual(out.today.inquiries, 1);
  assert.strictEqual(out.today.critical, 1);
  assert.strictEqual(out.month.payments, 3);
  assert.strictEqual(out.month.revenue, 19900 + 4900 + 129000);
  assert.ok(!out.recentPayments.some((p) => p.paymentId === 'pay_fail'));
  assert.ok(!out.recentPayments.some((p) => p.paymentId === 'pay_test'));
  assert.ok(!out.recentPayments.some((p) => p.paymentId === 'PAYPAL-MONTH' && p.provider !== 'paypal'));
  const paypal = out.recentPayments.filter((p) => p.paymentId === 'pay_month' || p.paymentId === 'PAYPAL-MONTH');
  assert.strictEqual(paypal.length, 1);
  assert.ok(out.recentPayments.find((p) => p.paymentId === 'pay_today'));
  assert.ok(out.recentPayments.find((p) => p.paymentId === 'pay_credit'));
  assert.strictEqual(out.recentInquiries.length, 1);
  assert.strictEqual(out.recentInquiries[0].inquiryId, 'inq_1');
  assert.strictEqual(out.recentInquiries[0].emailMasked, 'kan***@gmail.com');
  assert.strictEqual(out.recentCritical[0].eventId, 'crit_1');
  assert.ok(out.recentPayments[0].emailMasked.includes('***'));
  const raw = JSON.stringify(out);
  assert.ok(!raw.includes(SECRET));
  assert.ok(!raw.includes('kante@gmail.com'));
  assert.strictEqual(out.currency, 'KRW');
  assert.ok(out.generatedAt);
  console.log('ok approved dashboard + paid only + no double count');
}

async function testRefundAggregation() {
  const store = approvedStore({
    'orders/pay_ok': {
      paymentId: 'pay_ok',
      status: 'completed',
      amount: 19900,
      currency: 'KRW',
      completedAt: kst(2026, 9, 8, 0, 10, 0),
      environment: 'live'
    },
    'orders/pay_ref': {
      paymentId: 'pay_ref',
      status: 'refunded',
      amount: 19900,
      currency: 'KRW',
      refundedAmount: 19900,
      completedAt: kst(2026, 9, 8, 0, 5, 0),
      refundAt: kst(2026, 9, 8, 0, 20, 0),
      updatedAt: kst(2026, 9, 8, 0, 20, 0),
      environment: 'live'
    },
    'portoneRefundEvents/pay_ref_1': {
      paymentId: 'pay_ref',
      refundedAmount: 19900,
      cancelledAmount: 19900,
      createdAt: kst(2026, 9, 8, 0, 20, 0)
    }
  });
  const out = await dash.getAdminMobileDashboard(auth(), { db: makeFakeDb(store), now: NOW });
  assert.strictEqual(out.today.revenue, 19900 + 19900);
  assert.strictEqual(out.today.payments, 2);
  assert.strictEqual(out.today.refundAmount, 19900);
  assert.strictEqual(out.today.refunds, 1);
  assert.strictEqual(out.netRevenue.today, 19900);
  console.log('ok refund aggregation (gross + separate refund, no double-subtract)');
}

async function testRecentOrdering() {
  const store = approvedStore({
    'orders/old': {
      paymentId: 'old',
      status: 'completed',
      amount: 1,
      currency: 'KRW',
      completedAt: kst(2026, 9, 8, 0, 1, 0)
    },
    'orders/new': {
      paymentId: 'new',
      status: 'completed',
      amount: 2,
      currency: 'KRW',
      completedAt: kst(2026, 9, 8, 0, 30, 0)
    }
  });
  const out = await dash.getAdminMobileDashboard(auth(), { db: makeFakeDb(store), now: NOW });
  assert.strictEqual(out.recentPayments[0].paymentId, 'new');
  assert.strictEqual(out.recentPayments[1].paymentId, 'old');
  console.log('ok recent ordering');
}

async function testRevoked403() {
  const store = approvedStore();
  store[`adminDevices/${DEVICE_ID}`].status = 'revoked';
  store[`adminDevices/${DEVICE_ID}`].enabled = false;
  let err = null;
  try {
    await dash.getAdminMobileDashboard(auth(), { db: makeFakeDb(store), now: NOW });
  } catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 403);
  console.log('ok revoked 403');
}

async function testDisabled403() {
  const store = approvedStore();
  store[`adminDevices/${DEVICE_ID}`].status = 'disabled';
  store[`adminDevices/${DEVICE_ID}`].enabled = false;
  let err = null;
  try {
    await dash.getAdminMobileDashboard(auth(), { db: makeFakeDb(store), now: NOW });
  } catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 403);
  console.log('ok disabled 403');
}

async function testInvalidSecret403() {
  const store = approvedStore();
  let err = null;
  try {
    await dash.getAdminMobileDashboard({
      deviceId: DEVICE_ID,
      deviceSecret: 'wrong-secret-value'
    }, { db: makeFakeDb(store), now: NOW });
  } catch (e) { err = e; }
  assert.ok(err);
  assert.strictEqual(err.status, 403);
  console.log('ok invalid deviceSecret 403');
}

async function testPaymentDetailAuth() {
  const store = approvedStore({
    'orders/pay_1': {
      paymentId: 'pay_1',
      status: 'completed',
      provider: 'portone',
      productName: 'Lifetime',
      amount: 129000,
      currency: 'KRW',
      email: 'abc@gmail.com',
      completedAt: kst(2026, 9, 7, 23, 18, 0)
    }
  });
  const db = makeFakeDb(store);
  const ok = await dash.getAdminPaymentDetail(Object.assign({ paymentId: 'pay_1' }, auth()), { db });
  assert.strictEqual(ok.paymentId, 'pay_1');
  assert.strictEqual(ok.payment.paymentId, 'pay_1');
  assert.strictEqual(ok.emailMasked, 'abc***@gmail.com');
  assert.strictEqual(ok.refundStatus, 'none');
  assert.ok(!JSON.stringify(ok).includes('abc@gmail.com'));

  store[`adminDevices/${DEVICE_ID}`].status = 'revoked';
  store[`adminDevices/${DEVICE_ID}`].enabled = false;
  let denied = null;
  try {
    await dash.getAdminPaymentDetail(Object.assign({ paymentId: 'pay_1' }, auth()), { db });
  } catch (e) { denied = e; }
  assert.ok(denied);
  assert.strictEqual(denied.status, 403);

  const store2 = approvedStore({
    'orders/pay_1': store['orders/pay_1']
  });
  let badSecret = null;
  try {
    await dash.getAdminPaymentDetail({
      deviceId: DEVICE_ID,
      deviceSecret: 'nope-secret-value',
      paymentId: 'pay_1'
    }, { db: makeFakeDb(store2) });
  } catch (e) { badSecret = e; }
  assert.ok(badSecret);
  assert.strictEqual(badSecret.status, 403);
  console.log('ok payment detail authorization');
}

async function testPaymentDetailPaypalLookup() {
  const store = approvedStore({
    'orders/autoDoc': {
      paypalOrderId: 'EC-99',
      status: 'completed',
      provider: 'paypal',
      amount: 89,
      currency: 'USD',
      productName: 'Lifetime',
      email: 'pp@x.com',
      completedAt: kst(2026, 9, 8, 0, 1, 0)
    }
  });
  const out = await dash.getAdminPaymentDetail(Object.assign({ paymentId: 'EC-99' }, auth()), {
    db: makeFakeDb(store)
  });
  assert.strictEqual(out.provider, 'paypal');
  assert.ok(out.paymentId);
  console.log('ok payment detail paypal lookup');
}

(async () => {
  testKstTodayIncludes0034();
  testKstMonthBoundary();
  testPaidFilterAndEmailMask();
  testNoDoubleCountKeys();
  await testApprovedSuccessAndLists();
  await testRefundAggregation();
  await testRecentOrdering();
  await testRevoked403();
  await testDisabled403();
  await testInvalidSecret403();
  await testPaymentDetailAuth();
  await testPaymentDetailPaypalLookup();
  console.log('all adminMobileDashboard tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
