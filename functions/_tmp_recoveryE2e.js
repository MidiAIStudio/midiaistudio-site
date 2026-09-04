/**
 * Live recovery E2E: rate-limit poison + new chat + next-turn recovery.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT = 'midiaistudio';
const WEB_API_KEY = 'AIzaSyAAS0fFhGk9zHz0eb3XtNob42g3OvYdDiA';
const SUPPORT_AI_URL = 'https://us-central1-midiaistudio.cloudfunctions.net/supportAiReply';
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

async function callSupportAi(idToken, ticketId) {
  const t0 = Date.now();
  const res = await fetch(SUPPORT_AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ ticketId, debug: true })
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, latencyMs: Date.now() - t0 };
}

async function latestAi(db, ticketId) {
  const snap = await db
    .collection('supportTickets')
    .doc(ticketId)
    .collection('replies')
    .orderBy('createdAt', 'desc')
    .limit(6)
    .get();
  for (const d of snap.docs) {
    const row = d.data() || {};
    if (String(row.role || '') === 'ai') return String(row.content || '').trim();
  }
  return '';
}

async function main() {
  const login = loadLogin();
  let accessToken = await getCliAccessToken(login.refreshToken);
  const created = await createEphemeralSaKey(accessToken);
  await new Promise((r) => setTimeout(r, 4000));
  try {
    admin.initializeApp({ credential: admin.credential.cert(created.cred), projectId: PROJECT });
    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;
    const userRecord = await admin.auth().getUserByEmail(login.email);
    const uid = userRecord.uid;
    const idToken = await exchangeCustomToken(await admin.auth().createCustomToken(uid));

    // Simulate burned hard hourly window (still within softMax)
    await db.collection('aiSupportRate').doc(uid).set(
      {
        windowStartMs: Date.now() - 10 * 60 * 1000,
        count: 40,
        lastAttemptMs: Date.now() - 1000,
        lastSuccessMs: Date.now() - 10 * 60 * 1000,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const report = { tests: {} };

    // TEST A: soft recovery after rate burn
    const aRef = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      displayName: 'RecoveryE2E',
      category: 'other',
      title: '[RECOVERY-A]',
      content: '안녕',
      status: 'open',
      private: true,
      attachments: [],
      conversationMode: 'ai',
      aiConversationState: null,
      lastMessage: '안녕',
      lastMessageAt: FieldValue.serverTimestamp(),
      lastSender: 'user',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      e2eTag: 'recovery-e2e'
    });
    const a1 = await callSupportAi(idToken, aRef.id);
    const a1Text = await latestAi(db, aRef.id);
    report.tests.SINGLE_FAILURE_RECOVERY = {
      status: a1.status,
      ok: !!(a1.data && a1.data.ok),
      hasAi: !!a1Text,
      answer: a1Text.slice(0, 160),
      pass: a1.status === 200 && !!(a1.data && a1.data.ok) && !!a1Text
    };

    // Next turn on same ticket
    await aRef.collection('replies').add({
      role: 'user',
      uid,
      content: '변환 안돼',
      createdAt: FieldValue.serverTimestamp()
    });
    await aRef.update({
      lastMessage: '변환 안돼',
      lastSender: 'user',
      conversationMode: 'ai',
      updatedAt: FieldValue.serverTimestamp()
    });
    const a2 = await callSupportAi(idToken, aRef.id);
    const a2Text = await latestAi(db, aRef.id);
    report.tests.NEXT_TURN_SAME_TICKET = {
      status: a2.status,
      ok: !!(a2.data && a2.data.ok),
      answer: a2Text.slice(0, 160),
      mode: ((await aRef.get()).data() || {}).conversationMode,
      pass: a2.status === 200 && !!(a2.data && a2.data.ok) && !!a2Text
    };

    // TEST B: new chat fresh
    const bRef = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      displayName: 'RecoveryE2E',
      category: 'other',
      title: '[RECOVERY-B]',
      content: '새문의 안녕',
      status: 'open',
      private: true,
      attachments: [],
      conversationMode: 'ai',
      aiConversationState: null,
      lastAiTurnFailure: null,
      lastMessage: '새문의 안녕',
      lastMessageAt: FieldValue.serverTimestamp(),
      lastSender: 'user',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      e2eTag: 'recovery-e2e'
    });
    const b1 = await callSupportAi(idToken, bRef.id);
    const b1Text = await latestAi(db, bRef.id);
    const bState = ((await bRef.get()).data() || {}).aiConversationState;
    report.tests.NEW_CHAT_RECOVERY = {
      status: b1.status,
      ok: !!(b1.data && b1.data.ok),
      hasAi: !!b1Text,
      answer: b1Text.slice(0, 160),
      stateFresh: !bState || bState.epoch === 0 || bState.schemaVersion === 2,
      pass: b1.status === 200 && !!(b1.data && b1.data.ok) && !!b1Text
    };

    // Handoff separation: transient failure must not flip mode
    report.tests.HANDOFF_SEPARATION = {
      ticketAMode: ((await aRef.get()).data() || {}).conversationMode,
      ticketBMode: ((await bRef.get()).data() || {}).conversationMode,
      pass:
        ((await aRef.get()).data() || {}).conversationMode === 'ai' &&
        ((await bRef.get()).data() || {}).conversationMode === 'ai'
    };

    await aRef.update({ status: 'closed', conversationMode: 'closed' });
    await bRef.update({ status: 'closed', conversationMode: 'closed' });

    const out = path.join(__dirname, '_tmp_recoveryE2e_report.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log('REPORT', out);
  } finally {
    try {
      accessToken = await getCliAccessToken(login.refreshToken);
      await deleteSaKey(accessToken, created.keyName);
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error('RECOVERY_E2E_FAIL', e && e.message ? e.message : e);
  process.exit(1);
});
