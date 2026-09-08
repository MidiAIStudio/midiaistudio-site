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
      count() {
        return {
          get: async () => {
            const saved = state.lim;
            state.lim = null;
            const snap = await query.get();
            state.lim = saved;
            return { data: () => ({ count: (snap.docs || []).length }) };
          }
        };
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
            const base = opts && opts.merge ? Object.assign({}, store[path] || {}) : {};
            Object.keys(patch || {}).forEach((key) => {
              const value = patch[key];
              if (value && value.__delete) delete base[key];
              else base[key] = value;
            });
            store[path] = base;
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
  return {
    collection: (name) => createQuery(name),
    async getAll(...refs) {
      return Promise.all(refs.map((r) => r.get()));
    }
  };
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
  assert.strictEqual(found.members[0].displayName, 'Kim');
  const nameless = await ops.getAdminMembers(Object.assign({ q: 'u2' }, auth()), { db: makeFakeDb(storeBase({
    'users/u2': { email: 'hong@gmail.com', createdAt: '2026-09-08T01:00:00.000Z' },
    'licenses/u2': { plan: 'trial', status: 'active', licensed: true }
  })) });
  // q=u2 is too short for uid path; email-local fallback is covered by mapMember
  assert.strictEqual(ops.mapMember('u9', { email: 'hong@gmail.com' }, null).displayName, 'hong');
  assert.strictEqual(ops.mapMember('u9', { displayName: '홍길동', email: 'hong@gmail.com' }, null).displayName, '홍길동');
  assert.strictEqual(ops.mapMember('abcdefghij', {}, null).displayName, 'abcdefgh');
  assert.strictEqual(found.members[0].lastLoginAt, undefined);
  const withLogin = storeBase({
    'users/u1': {
      email: 'kim@gmail.com',
      lastLogin: '2026-09-08T12:42:00.000Z',
      lastSeenAt: '2026-09-01T00:00:00.000Z'
    },
    'licenses/u1': { plan: 'lifetime', status: 'active', licensed: true }
  });
  const loginHit = await ops.getAdminMembers(Object.assign({ q: 'kim@gmail.com' }, auth()), { db: makeFakeDb(withLogin) });
  assert.ok(String(loginHit.members[0].lastLoginAt).startsWith('2026-09-08'));
  const detail = await ops.getAdminMemberDetail(Object.assign({ uid: 'u1' }, auth()), { db });
  assert.strictEqual(detail.license.state.status, 'lifetime');
  const fv = { serverTimestamp: () => new Date(), delete: () => ({ __delete: true }) };
  await ops.postAdminMemberAction(Object.assign({ uid: 'u1', action: 'block' }, auth()), { db, FieldValue: fv });
  assert.strictEqual(store['licenses/u1'].status, 'banned');
  await ops.postAdminMemberAction(Object.assign({
    uid: 'u1',
    action: 'grant',
    plan: 'period',
    passProductId: 'PASS_30D',
    startsAt: '2026-09-09',
    expiresAt: '2026-10-09'
  }, auth()), { db, FieldValue: fv });
  assert.strictEqual(store['licenses/u1'].plan, 'period');
  assert.strictEqual(store['licenses/u1'].passProductId, 'PASS_30D');
  assert.strictEqual(store['licenses/u1'].method, 'manual');
  assert.strictEqual(store['licenses/u1'].licensed, true);
  await ops.postAdminMemberAction(Object.assign({ uid: 'u1', action: 'grant', plan: 'lifetime' }, auth()), { db, FieldValue: fv });
  assert.strictEqual(store['licenses/u1'].plan, 'lifetime');
  assert.ok(!store['licenses/u1'].startsAt);
  assert.ok(!store['licenses/u1'].expiresAt);
  assert.ok(!store['licenses/u1'].passProductId);
  await ops.postAdminMemberAction(Object.assign({
    uid: 'u1',
    action: 'grant',
    plan: 'period',
    startsAt: '2026-09-05',
    expiresAt: '2026-11-20'
  }, auth()), { db, FieldValue: fv });
  assert.strictEqual(store['licenses/u1'].plan, 'period');
  assert.ok(!store['licenses/u1'].passProductId);
  const listed = await ops.getAdminMembers(Object.assign({ q: 'kim@gmail.com' }, auth()), { db });
  assert.ok(String(listed.members[0].planLabel).indexOf('기간제') >= 0);
  assert.strictEqual(ops.planLabel('period', 'PASS_30D'), '기간제 · 30일');
  assert.strictEqual(ops.planLabel('period', ''), '기간제');
  await ops.postAdminMemberAction(Object.assign({ uid: 'u1', action: 'reset_hwid' }, auth()), { db, FieldValue: fv });
  try {
    await ops.postAdminMemberAction(Object.assign({ uid: 'u1', action: 'explode' }, auth()), { db, FieldValue: fv });
    assert.fail('unknown action should be rejected');
  } catch (err) {
    assert.strictEqual(err.status, 400);
  }
  console.log('ok member search + block + grant + custom period + hwid reset');
}

async function testMembersBatchNotNPlusOne() {
  const extra = {};
  for (let i = 0; i < 20; i += 1) {
    extra[`users/u${i}`] = {
      email: `user${i}@gmail.com`,
      displayName: `User${i}`,
      createdAt: '2026-09-08T01:00:00.000Z'
    };
    extra[`licenses/u${i}`] = { plan: 'period', status: 'active', licensed: true };
  }
  const db = makeFakeDb(storeBase(extra));
  let getAllCalls = 0;
  const orig = db.getAll.bind(db);
  db.getAll = async (...refs) => {
    getAllCalls += 1;
    return orig(...refs);
  };
  const out = await ops.getAdminMembers(auth(), { db });
  assert.ok(out.members.length >= 8);
  assert.strictEqual(out.members[0].displayName.indexOf('User') === 0, true);
  assert.strictEqual(getAllCalls, 1);
  console.log('ok members list uses one license batch getAll');
}

async function testGoogleNameFromUsersDoc() {
  const db = makeFakeDb(storeBase({
    'users/u_kr': {
      email: 'hong@gmail.com',
      displayName: '홍길동',
      photoURL: 'https://example.com/hong.png',
      createdAt: '2026-09-08T01:00:00.000Z'
    },
    'licenses/u_kr': { plan: 'period', passProductId: 'PASS_30D', licensed: true, status: 'active' }
  }));
  const out = await ops.getAdminMembers(auth(), { db });
  const row = out.members.find((m) => m.uid === 'u_kr') || out.members[0];
  assert.strictEqual(row.displayName, '홍길동');
  assert.notStrictEqual(row.displayName, 'hong');
  console.log('ok users.displayName is source of truth (홍길동, not email local)');
}

async function testLicenseCountsNotCappedAt80() {
  const extra = {};
  for (let i = 0; i < 90; i += 1) {
    extra[`licenses/u${i}`] = {
      licensed: true,
      plan: i < 10 ? 'lifetime' : (i < 20 ? 'trial' : 'period'),
      status: 'active',
      passProductId: i >= 20 && i < 50 ? 'PASS_30D' : (i >= 50 && i < 60 ? 'PASS_7D' : (i >= 60 && i < 70 ? 'PASS_90D' : undefined))
    };
  }
  extra['licenses/ban1'] = { licensed: false, status: 'banned', plan: 'period' };
  const db = makeFakeDb(storeBase(extra));
  const stats = await ops.getAdminLicenseStats(auth(), { db });
  assert.strictEqual(stats.stats.active, 90);
  assert.strictEqual(stats.stats.lifetime, 10);
  assert.strictEqual(stats.stats.trial, 10);
  assert.strictEqual(stats.stats.d30, 30);
  assert.strictEqual(stats.stats.d7, 10);
  assert.strictEqual(stats.stats.d90, 10);
  assert.strictEqual(stats.stats.period, 71);
  assert.strictEqual(stats.stats.banned, 1);
  assert.strictEqual(stats.capped, false);
  const dashOut = await dash.getAdminMobileDashboard(auth(), {
    db,
    now: new Date(dash.zonedLocalToUtcMs(2026, 9, 8, 12, 0, 0, dash.TZ))
  });
  assert.strictEqual(dashOut.activeLicenses, 90);
  assert.strictEqual(dashOut.licenseStats.d30, 30);
  assert.strictEqual(dashOut.activeLicensesCapped, false);
  console.log('ok license counts use aggregation past 80 docs');
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
  await testMembersBatchNotNPlusOne();
  await testGoogleNameFromUsersDoc();
  await testLicenseCountsNotCappedAt80();
  await testTicketsAndVersion();
  await testRevoked403();
  await testDashboardHomeExtrasNoPush();
  console.log('all adminMobileOps tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
