/**
 * Unit tests for create-if-absent license provisioning (no Firestore emulator).
 * Run: node licenseProvision.test.js
 */
const assert = require('assert');
const {
  normalizeRole,
  buildSignupLicensePayload,
  createLicenseIfAbsent
} = require('./licenseProvision');

const TS = 'SERVER_TIMESTAMP';

function testPayloads() {
  const trial = buildSignupLicensePayload({ role: 'user' }, TS);
  assert.strictEqual(trial.plan, 'trial');
  assert.strictEqual(trial.licensed, true);
  assert.strictEqual(trial.status, 'active');
  assert.strictEqual(trial.method, 'signup');

  const life = buildSignupLicensePayload({ role: 'admin' }, TS);
  assert.strictEqual(life.plan, 'lifetime');
  assert.strictEqual(life.method, 'admin');

  assert.strictEqual(normalizeRole('developer'), 'admin');
  assert.strictEqual(normalizeRole('staff'), 'admin');
  assert.strictEqual(normalizeRole('user'), 'user');
  console.log('ok payloads');
}

function mockDb(existing) {
  const store = new Map();
  if (existing) store.set('uid1', { ...existing });

  return {
    collection() {
      return {
        doc(uid) {
          const ref = {
            id: uid,
            async get() {
              if (!store.has(uid)) return { exists: false, data: () => undefined };
              return { exists: true, data: () => store.get(uid) };
            },
            _store: store
          };
          return ref;
        }
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) {
          return ref.get();
        },
        create(ref, payload) {
          if (store.has(ref.id)) {
            const err = new Error('ALREADY_EXISTS');
            err.code = 6;
            throw err;
          }
          store.set(ref.id, { ...payload, createdAt: TS, updatedAt: TS });
        }
      };
      return fn(tx);
    },
    _store: store
  };
}

async function testCreateIfAbsent() {
  const FieldValue = { serverTimestamp: () => TS };

  // New user → trial created
  const db1 = mockDb(null);
  const r1 = await createLicenseIfAbsent(db1, 'uid1', { role: 'user' }, FieldValue);
  assert.strictEqual(r1.created, true);
  assert.strictEqual(r1.plan, 'trial');
  assert.strictEqual(db1._store.get('uid1').plan, 'trial');

  // Existing trial → no change
  const db2 = mockDb({ plan: 'trial', licensed: true, status: 'active' });
  const before2 = { ...db2._store.get('uid1') };
  const r2 = await createLicenseIfAbsent(db2, 'uid1', { role: 'user' }, FieldValue);
  assert.strictEqual(r2.created, false);
  assert.strictEqual(r2.existingPlan, 'trial');
  assert.deepStrictEqual(db2._store.get('uid1'), before2);

  // Existing lifetime → never overwritten (even if userData says trial path)
  const db3 = mockDb({ plan: 'lifetime', licensed: true, status: 'active', method: 'paypal' });
  const before3 = { ...db3._store.get('uid1') };
  const r3 = await createLicenseIfAbsent(db3, 'uid1', { role: 'user' }, FieldValue);
  assert.strictEqual(r3.created, false);
  assert.strictEqual(r3.existingPlan, 'lifetime');
  assert.deepStrictEqual(db3._store.get('uid1'), before3);

  // Concurrent create: second create races → already-exists path, doc stays one
  const db4 = mockDb(null);
  const pA = createLicenseIfAbsent(db4, 'uid1', { role: 'user' }, FieldValue);
  const pB = createLicenseIfAbsent(db4, 'uid1', { role: 'user' }, FieldValue);
  const [a, b] = await Promise.all([pA, pB]);
  assert.strictEqual([a.created, b.created].filter(Boolean).length, 1);
  assert.strictEqual(db4._store.size, 1);
  assert.strictEqual(db4._store.get('uid1').plan, 'trial');

  console.log('ok create-if-absent');
}

(async () => {
  testPayloads();
  await testCreateIfAbsent();
  console.log('All licenseProvision tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
