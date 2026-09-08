/**
 * Mobile ops unit tests — members/tickets/version. No FCM, no ledger rewrite.
 */
const assert = require('assert');
const adminPush = require('./adminPush');
const ops = require('./adminMobileOps');
const dash = require('./adminMobileDashboard');

const DEVICE_ID = 'android-device-ops01';
const SECRET = 'ops-device-secret-value';

function cmpValue(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
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
            return { id, data: () => store[k] || {} };
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
            return false;
          });
        });
        if (state.lim != null) rows = rows.slice(0, state.lim);
        return { docs: rows, empty: rows.length === 0 };
      },
      async add(doc) {
        store[`${name}/log_${Object.keys(store).length}`] = doc;
        return { id: 'log' };
      },
      doc(id) {
        const path = `${name}/${id}`;
        const ref = {
          id,
          async get() {
            return { exists: store[path] != null, id, data: () => store[path] || {}, ref };
          },
          async set(patch, opts) {
            if (opts && opts.merge) store[path] = Object.assign({}, store[path] || {}, patch);
            else store[path] = Object.assign({}, patch);
          },
          collection(sub) {
            return createQuery(`${name}/${id}/${sub}`);
          }
        };
        return ref;
      }
    };
    return query;
  }
  return { collection: (name) => createQuery(name) };
}

function auth() {
  return { deviceId: DEVICE_ID, deviceSecret: SECRET };
}

function storeBase(extra) {
  return Object.assign({
    [`adminDevices/${DEVICE_ID}`]: {
      status: 'approved',
      enabled: true,
      deviceSecretHash: adminPush.hashSecret(SECRET)
    }
  }, extra || {});
}

async function testMemberSearchAndBlock() {
  const store = storeBase({
    'users/u1': { email: 'kim@gmail.com', displayName: 'Kim', createdAt: '2026-09-08T01:00:00.000Z' },
    'licenses/u1': { plan: 'lifetime', status: 'active', licensed: true }
  });
  const db = makeFakeDb(store);
  const found = await ops.getAdminMembers(Object.assign({ q: 'kim@gmail.com' }, auth()), { db });
  assert.strictEqual(found.members.length, 1);
  assert.strictEqual(found.members[0].uid, 'u1');
  assert.ok(found.members[0].emailMasked.includes('***'));
  const detail = await ops.getAdminMemberDetail(Object.assign({ uid: 'u1' }, auth()), { db });
  assert.strictEqual(detail.license.state.status, 'lifetime');
  const fv = { serverTimestamp: () => new Date() };
  await ops.postAdminMemberAction(Object.assign({ uid: 'u1', action: 'block' }, auth()), { db, FieldValue: fv });
  assert.strictEqual(store['licenses/u1'].status, 'banned');
  try {
    await ops.postAdminMemberAction(Object.assign({ uid: 'u1', action: 'grant' }, auth()), { db, FieldValue: fv });
    assert.fail('grant should be rejected');
  } catch (err) {
    assert.strictEqual(err.status, 400);
  }
  console.log('ok member search + block + grant rejected on mobile');
}

async function testTicketsAndVersion() {
  const store = storeBase({
    'supportTickets/t1': {
      title: '설치 오류',
      email: 'a@b.com',
      uid: 'u1',
      status: 'open',
      conversationMode: 'waiting_human',
      content: '안 됩니다',
      createdAt: '2026-09-08T02:00:00.000Z',
      updatedAt: '2026-09-08T02:00:00.000Z'
    },
    'users/u1': { email: 'a@b.com', createdAt: '2026-09-01T00:00:00.000Z' },
    'licenses/u1': { plan: 'pass_30d', status: 'active', licensed: true },
    'downloads/latest': { version: '1.6.4', minVersion: '1.6.3', mandatory: true, url: 'https://example.com/app.exe' },
    'announcements/n1': { title: '점검', visible: true, pinned: true, createdAt: '2026-09-01T00:00:00.000Z' }
  });
  const db = makeFakeDb(store);
  const tickets = await ops.getAdminTickets(Object.assign({ status: 'open' }, auth()), { db });
  assert.ok(tickets.tickets.some((t) => t.inquiryId === 't1'));
  const detail = await ops.getAdminTicketDetail(Object.assign({ ticketId: 't1' }, auth()), { db });
  assert.ok(detail.ticket.content.includes('안 됩니다'));
  assert.ok(detail.member);
  const ver = await ops.getAdminAppVersion(auth(), { db });
  assert.strictEqual(ver.latest, '1.6.4');
  assert.strictEqual(ver.forceUpdate, true);
  const notices = await ops.getAdminNotices(auth(), { db });
  assert.strictEqual(notices.notices[0].title, '점검');
  console.log('ok tickets + version + notices');
}

async function testRevoked403() {
  const store = {
    [`adminDevices/${DEVICE_ID}`]: {
      status: 'revoked',
      enabled: false,
      deviceSecretHash: adminPush.hashSecret(SECRET)
    }
  };
  try {
    await ops.getAdminMembers(auth(), { db: makeFakeDb(store) });
    assert.fail('expected 403');
  } catch (err) {
    assert.strictEqual(err.status, 403);
  }
  console.log('ok ops revoked 403');
}

async function testDashboardHomeExtrasNoPush() {
  let fcm = 0;
  const original = adminPush.sendAdminNotification;
  adminPush.sendAdminNotification = async () => { fcm += 1; };
  try {
    const extra = {
      'users/u_new': { email: 'new@x.com', createdAt: dash.zonedLocalToUtcMs(2026, 9, 8, 1, 0, 0, dash.TZ) },
      'licenses/u1': { licensed: true, plan: 'lifetime', status: 'active' },
      'orders/pay_ok': {
        paymentId: 'pay_ok',
        status: 'completed',
        amount: 19900,
        currency: 'KRW',
        completedAt: new Date(dash.zonedLocalToUtcMs(2026, 9, 8, 10, 0, 0, dash.TZ)),
        environment: 'live'
      }
    };
    const store = {
      [`adminDevices/${DEVICE_ID}`]: {
        status: 'approved',
        enabled: true,
        deviceSecretHash: adminPush.hashSecret(SECRET)
      }
    };
    Object.assign(store, extra);
    const out = await dash.getAdminMobileDashboard(auth(), {
      db: makeFakeDb(store),
      now: new Date(dash.zonedLocalToUtcMs(2026, 9, 8, 12, 0, 0, dash.TZ))
    });
    assert.ok(out.todaySignups >= 0);
    assert.ok(Array.isArray(out.attention));
    assert.ok(Array.isArray(out.activity));
    assert.ok(!out.activity.some((a) => /정산 완료/.test(String(a.title || ''))));
    assert.strictEqual(fcm, 0);
  } finally {
    adminPush.sendAdminNotification = original;
  }
  console.log('ok dashboard extras + no FCM on home read');
}

(async () => {
  await testMemberSearchAndBlock();
  await testTicketsAndVersion();
  await testRevoked403();
  await testDashboardHomeExtrasNoPush();
  console.log('all adminMobileOps tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
