/**
 * Live E2E: AI rate-limit machine-readable retry + closed-chat purge.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT = 'midiaistudio';
const WEB_API_KEY = 'AIzaSyAAS0fFhGk9zHz0eb3XtNob42g3OvYdDiA';
const SUPPORT_AI_URL = 'https://us-central1-midiaistudio.cloudfunctions.net/supportAiReply';
const SUPPORT_CLOSE_URL = 'https://us-central1-midiaistudio.cloudfunctions.net/supportCloseTicket';
const SA_EMAIL = 'firebase-adminsdk-fbsvc@midiaistudio.iam.gserviceaccount.com';
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function loadLogin() {
  const p = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { email: j.user && j.user.email, refreshToken: j.tokens.refresh_token };
}

async function getCliAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLI_CLIENT_ID,
      client_secret: CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  return data.access_token;
}

async function createEphemeralSaKey(accessToken) {
  const url =
    'https://iam.googleapis.com/v1/projects/' +
    PROJECT +
    '/serviceAccounts/' +
    encodeURIComponent(SA_EMAIL) +
    '/keys';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyAlgorithm: 'KEY_ALG_RSA_2048',
      privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.privateKeyData) throw new Error(`createSaKey ${res.status}`);
  return {
    keyName: data.name,
    cred: JSON.parse(Buffer.from(data.privateKeyData, 'base64').toString('utf8'))
  };
}

async function deleteSaKey(accessToken, keyName) {
  await fetch('https://iam.googleapis.com/v1/' + keyName, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}

async function exchangeCustomToken(customToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(WEB_API_KEY)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`signIn ${res.status}`);
  return data.idToken;
}

async function postJson(url, idToken, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const report = { ok: false, steps: [] };
  const login = loadLogin();
  const accessToken = await getCliAccessToken(login.refreshToken);
  let keyName = null;
  let db = null;
  let testUid = null;
  const createdTicketIds = [];

  try {
    const sa = await createEphemeralSaKey(accessToken);
    keyName = sa.keyName;
    await new Promise((r) => setTimeout(r, 4000));
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(sa.cred), projectId: PROJECT });
    }
    db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    const userRecord = await admin.auth().getUserByEmail(login.email);
    const uid = userRecord.uid;
    testUid = uid;
    const idToken = await exchangeCustomToken(await admin.auth().createCustomToken(uid));

    // --- RATE LIMIT ---
    const now = Date.now();
    const windowStartMs = now - 5 * 60 * 1000;
    await db.collection('aiSupportRate').doc(uid).set({
      windowStartMs,
      count: 70,
      hardMax: 40,
      softMax: 70,
      updatedAt: FieldValue.serverTimestamp()
    });

    const rateTicket = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      title: '[RATE-PURGE-E2E] rate',
      content: '라이선스 기간이 궁금해요',
      status: 'open',
      conversationMode: 'ai',
      aiConversationState: null,
      e2eTag: 'rate-purge-e2e',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    createdTicketIds.push(rateTicket.id);

    const rateRes = await postJson(SUPPORT_AI_URL, idToken, { ticketId: rateTicket.id });
    report.steps.push({ name: 'rate_limit_response', status: rateRes.status, data: rateRes.data });
    assert(rateRes.status === 429, `expected 429 got ${rateRes.status}`);
    assert(rateRes.data.errorCode === 'AI_RATE_LIMIT', 'errorCode AI_RATE_LIMIT');
    assert(Number(rateRes.data.retryAfterSeconds) > 0, 'retryAfterSeconds > 0');
    assert(Number(rateRes.data.resetAtMs) > now, 'resetAtMs in future');
    const expectedReset = windowStartMs + 60 * 60 * 1000;
    assert(
      Math.abs(Number(rateRes.data.resetAtMs) - expectedReset) < 5000,
      `resetAtMs mismatch ${rateRes.data.resetAtMs} vs ${expectedReset}`
    );

    const rateTicket2 = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      title: '[RATE-PURGE-E2E] rate2',
      content: '새 문의',
      status: 'open',
      conversationMode: 'ai',
      aiConversationState: null,
      e2eTag: 'rate-purge-e2e',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    createdTicketIds.push(rateTicket2.id);
    const rateRes2 = await postJson(SUPPORT_AI_URL, idToken, { ticketId: rateTicket2.id });
    report.steps.push({ name: 'rate_new_ticket', status: rateRes2.status, data: rateRes2.data });
    assert(rateRes2.status === 429, 'new ticket still 429');
    assert(rateRes2.data.errorCode === 'AI_RATE_LIMIT', 'new ticket AI_RATE_LIMIT');
    assert(Number(rateRes2.data.retryAfterSeconds) > 0, 'new ticket retryAfter');

    await db.collection('aiSupportRate').doc(uid).set({
      windowStartMs: Date.now(),
      count: 0,
      hardMax: 40,
      softMax: 70,
      updatedAt: FieldValue.serverTimestamp()
    });
    const okRes = await postJson(SUPPORT_AI_URL, idToken, { ticketId: rateTicket.id });
    report.steps.push({ name: 'rate_reset_ok', status: okRes.status, ok: okRes.data.ok });
    assert(okRes.ok && okRes.data.ok, 'AI ok after rate reset');

    // --- PURGE ---
    const purgeTicket = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      title: '[RATE-PURGE-E2E] purge',
      content: '결제 내역 확인',
      status: 'open',
      conversationMode: 'waiting_human',
      aiConversationState: {
        schemaVersion: 2,
        topicEpoch: 1,
        facts: [{ key: 'x', value: 'y', layer: 'ACTIVE' }]
      },
      aiSummary: '요약 테스트',
      e2eTag: 'rate-purge-e2e',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    createdTicketIds.push(purgeTicket.id);
    await purgeTicket.collection('replies').add({
      uid,
      role: 'user',
      content: '유저 메시지',
      createdAt: FieldValue.serverTimestamp()
    });
    await purgeTicket.collection('replies').add({
      uid: 'system-ai',
      role: 'ai',
      content: 'AI 답변',
      createdAt: FieldValue.serverTimestamp()
    });

    const paymentRef = db.collection('orders').doc(`e2e-rate-purge-${uid.slice(0, 8)}`);
    await paymentRef.set({ uid, productId: 'LIFETIME', e2eMarker: true, createdAt: Date.now() }, { merge: true });
    const rateBefore = (await db.collection('aiSupportRate').doc(uid).get()).data();

    const close1 = await postJson(SUPPORT_CLOSE_URL, idToken, { ticketId: purgeTicket.id });
    report.steps.push({ name: 'close_purge', status: close1.status, data: close1.data });
    assert(close1.ok && close1.data.purged, `purged got ${JSON.stringify(close1)}`);

    const ticketGone = await purgeTicket.get();
    assert(!ticketGone.exists, 'ticket document gone');
    const repliesGone = await purgeTicket.collection('replies').get();
    assert(repliesGone.empty, 'replies gone');

    const close2 = await postJson(SUPPORT_CLOSE_URL, idToken, { ticketId: purgeTicket.id });
    report.steps.push({ name: 'close_idempotent', status: close2.status, data: close2.data });
    assert(close2.ok && close2.data.alreadyDeleted, 'idempotent alreadyDeleted');

    const paymentStill = await paymentRef.get();
    assert(paymentStill.exists, 'order preserved');
    const rateAfter = (await db.collection('aiSupportRate').doc(uid).get()).data();
    assert(rateAfter && Number(rateAfter.count) === Number(rateBefore.count), 'rate counter preserved');

    // Auth: other ephemeral user cannot purge owner ticket
    const other = await admin.auth().createUser({
      email: `rate-purge-other-${Date.now()}@example.com`,
      emailVerified: true
    });
    const otherToken = await exchangeCustomToken(await admin.auth().createCustomToken(other.uid));
    const victim = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      title: '[RATE-PURGE-E2E] auth',
      content: 'x',
      status: 'open',
      conversationMode: 'ai',
      e2eTag: 'rate-purge-e2e',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    createdTicketIds.push(victim.id);
    const forbidden = await postJson(SUPPORT_CLOSE_URL, otherToken, { ticketId: victim.id });
    report.steps.push({ name: 'auth_forbidden', status: forbidden.status, data: forbidden.data });
    assert(forbidden.status === 403, `other user forbidden got ${forbidden.status}`);
    assert((await victim.get()).exists, 'victim ticket still exists');

    await paymentRef.delete().catch(() => {});
    await admin.auth().deleteUser(other.uid).catch(() => {});

    report.ok = true;
    report.verdict = 'PASS';
  } catch (err) {
    report.ok = false;
    report.verdict = 'FAIL';
    report.error = err && err.message ? err.message : String(err);
  } finally {
    if (db && createdTicketIds.length) {
      for (const id of createdTicketIds) {
        try {
          await db.recursiveDelete(db.collection('supportTickets').doc(id));
        } catch (_) {
          try {
            await db.collection('supportTickets').doc(id).delete();
          } catch (__) {}
        }
      }
    }
    if (testUid) {
      try {
        // Leave rate doc as soft reset so we don't brick the logged-in admin account
        await db.collection('aiSupportRate').doc(testUid).set(
          {
            windowStartMs: Date.now(),
            count: 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      } catch (_) {}
    }
    if (keyName) {
      try {
        await deleteSaKey(accessToken, keyName);
      } catch (_) {}
    }
    const out = path.join(__dirname, '_tmp_ratePurgeE2e_report.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
