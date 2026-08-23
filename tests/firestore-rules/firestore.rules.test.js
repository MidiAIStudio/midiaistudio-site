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

describe('users accessInfo rules', () => {
  it('owner can still update lastLogin without touching accessInfo', async () => {
    await seedUser('user1');
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('users/user1').set({ lastLogin: new Date(), lastSeenAt: new Date() }, { merge: true }));
  });

  it('owner cannot write accessInfo', async () => {
    await seedUser('user1');
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(
      db.doc('users/user1').set({
        accessInfo: { countryCode: 'US', lastIpMasked: '1.2.***.***' }
      }, { merge: true })
    );
  });

  it('other user cannot read another member accessInfo', async () => {
    await seedUser('user1');
    await seedUser('user2');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user1').set({
        uid: 'user1',
        role: 'user',
        accessInfo: { countryCode: 'KR', lastIpMasked: '123.45.***.***' }
      }, { merge: true });
    });
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertFails(db.doc('users/user1').get());
  });

  it('admin can read another member accessInfo', async () => {
    await seedAdmin('admin1');
    await seedUser('user1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user1').set({
        uid: 'user1',
        role: 'user',
        accessInfo: { countryCode: 'KR', lastIpMasked: '123.45.***.***' }
      }, { merge: true });
    });
    const db = testEnv.authenticatedContext('admin1').firestore();
    const snap = await assertSucceeds(db.doc('users/user1').get());
    assert.strictEqual(snap.data().accessInfo.countryCode, 'KR');
  });
});

describe('users role privilege', () => {
  it('owner cannot self-promote to admin', async () => {
    await seedUser('user1');
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('users/user1').update({ role: 'admin' }));
    await assertFails(db.doc('users/user1').set({ role: 'admin' }, { merge: true }));
  });

  it('owner cannot create as admin', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('users/user1').set({ uid: 'user1', role: 'admin', email: 'u@test.com' }));
  });

  it('owner can update lastLogin without changing role', async () => {
    await seedUser('user1');
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('users/user1').set({ lastLogin: new Date() }, { merge: true }));
  });

  it('self-promoted role cannot unlock license writes', async () => {
    await seedUser('user1');
    await seedLicense('user1', { plan: 'trial', licensed: true, status: 'active' });
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('users/user1').update({ role: 'admin' }));
    await assertFails(db.doc('licenses/user1').update({ plan: 'lifetime' }));
  });
});

describe('credit and legacy point collections', () => {
  async function seedCreditDocs() {
    await seedUser('user1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('creditWallets/user1').set({ uid: 'user1', balance: 2 });
      await db.doc('pointWallets/user1').set({ uid: 'user1', balance: 2 });
      await db.doc('creditLedger/led1').set({ uid: 'user1', amount: 2, type: 'purchase' });
      await db.doc('creditJobs/job1').set({ uid: 'user1', status: 'reserved', creditCost: 1 });
      await db.doc('creditPurchases/pay1').set({ uid: 'user1', status: 'credited' });
    });
  }

  it('owner can read own credit wallet but cannot write', async () => {
    await seedCreditDocs();
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('creditWallets/user1').get());
    await assertFails(db.doc('creditWallets/user1').update({ balance: 999999 }));
    await assertFails(db.doc('creditWallets/user1').set({ balance: 999999 }, { merge: true }));
  });

  it('owner cannot write legacy point wallet', async () => {
    await seedCreditDocs();
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('pointWallets/user1').get());
    await assertFails(db.doc('pointWallets/user1').update({ balance: 999 }));
  });

  it('owner cannot write ledger, jobs, or purchases', async () => {
    await seedCreditDocs();
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('creditLedger/led1').update({ amount: 10000 }));
    await assertFails(db.doc('creditJobs/job1').update({ status: 'refunded' }));
    await assertFails(db.doc('creditPurchases/pay1').update({ status: 'paid' }));
    await assertFails(db.doc('creditLedger/new1').set({ uid: 'user1', amount: 10000, type: 'purchase' }));
  });
});

describe('users/{uid}/notifications rules', () => {
  const unreadPayload = {
    type: 'reservation_complete',
    actorUid: 'user1',
    actorName: 'MidiAI Studio',
    read: false,
    postTitle: '',
    preview: 'ok',
    sourceType: 'reservation_complete',
    sourceId: 'run1'
  };

  it('owner can read own notifications; other user cannot', async () => {
    await seedUser('user1');
    await seedUser('user2');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user1/notifications/n1').set({
        ...unreadPayload,
        read: false
      });
    });
    const owner = testEnv.authenticatedContext('user1').firestore();
    const other = testEnv.authenticatedContext('user2').firestore();
    await assertSucceeds(owner.doc('users/user1/notifications/n1').get());
    await assertFails(other.doc('users/user1/notifications/n1').get());
  });

  it('owner can mark own notification read, not unread, not rewrite type', async () => {
    await seedUser('user1');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user1/notifications/n1').set({
        ...unreadPayload,
        read: false
      });
    });
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('users/user1/notifications/n1').update({ read: true }));
    await assertFails(db.doc('users/user1/notifications/n1').update({ read: false }));
    await assertFails(db.doc('users/user1/notifications/n1').update({ type: 'admin_message' }));
  });

  it('owner cannot mark another uid read', async () => {
    await seedUser('user1');
    await seedUser('user2');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('users/user2/notifications/n1').set({
        ...unreadPayload,
        actorUid: 'user2',
        read: false
      });
    });
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('users/user2/notifications/n1').update({ read: true }));
  });

  it('owner can create reservation notifications for self only', async () => {
    await seedUser('user1');
    await seedUser('user2');
    const owner = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(
      owner.doc('users/user1/notifications/reservation_complete_run1').set(unreadPayload)
    );
    await assertFails(
      owner.doc('users/user2/notifications/reservation_complete_run1').set({
        ...unreadPayload,
        actorUid: 'user1'
      })
    );
    await assertFails(
      owner.doc('users/user1/notifications/credit_purchase_x').set({
        ...unreadPayload,
        type: 'credit_purchase'
      })
    );
  });
});
