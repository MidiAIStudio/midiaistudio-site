/**
 * Firestore rules tests for licenses/{uid}.
 * Requires: npm i (in this folder) + Java for Firestore emulator.
 *
 * Run from repo root:
 *   cd tests/firestore-rules && npm i
 *   npm run test:emulators
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');

const RULES = fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8');
const PROJECT_ID = 'demo-midiai';

let testEnv;

before(async function () {
  this.timeout(60000);
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seedAdmin(uid = 'admin1') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${uid}`).set({ uid, role: 'admin', email: 'a@test.com' });
  });
}

async function seedUser(uid = 'user1') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`users/${uid}`).set({ uid, role: 'user', email: 'u@test.com' });
  });
}

async function seedLicense(uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(`licenses/${uid}`).set(data);
  });
}

describe('licenses rules', () => {
  it('owner can read own license', async () => {
    await seedUser('user1');
    await seedLicense('user1', { plan: 'trial', licensed: true, status: 'active' });
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('licenses/user1').get());
  });

  it('owner cannot create trial (CF-only)', async () => {
    await seedUser('user1');
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(
      db.doc('licenses/user1').set({
        licensed: true,
        plan: 'trial',
        status: 'active',
        method: 'signup'
      })
    );
  });

  it('owner cannot create lifetime', async () => {
    await seedUser('user1');
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(
      db.doc('licenses/user1').set({
        licensed: true,
        plan: 'lifetime',
        status: 'active',
        method: 'hack'
      })
    );
  });

  it('owner cannot update trial → lifetime', async () => {
    await seedUser('user1');
    await seedLicense('user1', { plan: 'trial', licensed: true, status: 'active', method: 'signup' });
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('licenses/user1').update({ plan: 'lifetime' }));
  });

  it('owner cannot set licensed=true on banned', async () => {
    await seedUser('user1');
    await seedLicense('user1', { plan: 'trial', licensed: false, status: 'banned' });
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('licenses/user1').update({ licensed: true, status: 'active' }));
  });

  it('admin can create and update licenses', async () => {
    await seedAdmin('admin1');
    await seedUser('user1');
    const db = testEnv.authenticatedContext('admin1').firestore();
    await assertSucceeds(
      db.doc('licenses/user1').set({
        licensed: true,
        plan: 'lifetime',
        status: 'active',
        method: 'admin'
      })
    );
    await assertSucceeds(db.doc('licenses/user1').update({ memo: 'ok' }));
  });

  it('unauthenticated cannot write licenses', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      db.doc('licenses/user1').set({ plan: 'lifetime', licensed: true, status: 'active' })
    );
  });

  it('existing lifetime remains readable; owner still cannot overwrite', async () => {
    await seedUser('user1');
    await seedLicense('user1', {
      plan: 'lifetime',
      licensed: true,
      status: 'active',
      method: 'paypal'
    });
    const db = testEnv.authenticatedContext('user1').firestore();
    const snap = await assertSucceeds(db.doc('licenses/user1').get());
    assert.strictEqual(snap.data().plan, 'lifetime');
    await assertFails(db.doc('licenses/user1').set({ plan: 'trial', licensed: true, status: 'active' }));
  });
});
