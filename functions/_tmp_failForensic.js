/**
 * Forensic: supportAiReply failure persistence (temp).
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

async function main() {
  const login = loadLogin();
  let accessToken = await getCliAccessToken(login.refreshToken);
  const created = await createEphemeralSaKey(accessToken);
  await new Promise((r) => setTimeout(r, 4000));
  try {
    admin.initializeApp({ credential: admin.credential.cert(created.cred), projectId: PROJECT });
    const db = admin.firestore();
    const userRecord = await admin.auth().getUserByEmail(login.email);
    const uid = userRecord.uid;
    const idToken = await exchangeCustomToken(await admin.auth().createCustomToken(uid));

    const rateSnap = await db.collection('aiSupportRate').doc(uid).get();
    const rate = rateSnap.exists ? rateSnap.data() : null;
    const now = Date.now();
    const report = {
      uidPrefix: String(uid).slice(0, 6),
      rateBefore: rate
        ? {
            count: rate.count,
            windowStartMs: rate.windowStartMs,
            ageMin: rate.windowStartMs ? Math.round((now - Number(rate.windowStartMs)) / 60000) : null,
            nearLimit: Number(rate.count || 0) >= 35
          }
        : null,
      turns: []
    };

    // Ticket A
    const FieldValue = admin.firestore.FieldValue;
    const aRef = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      displayName: 'FailForensic',
      category: 'other',
      title: '[FAIL-FORENSIC-A] hello',
      content: '안녕',
      status: 'open',
      private: true,
      attachments: [],
      conversationMode: 'ai',
      lastMessage: '안녕',
      lastMessageAt: FieldValue.serverTimestamp(),
      lastSender: 'user',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      e2eTag: 'fail-forensic'
    });
    const a1 = await callSupportAi(idToken, aRef.id);
    report.turns.push({ ticket: 'A', i: 1, user: '안녕', ...a1, message: a1.data && a1.data.message });

    // Second message on A
    await aRef.collection('replies').add({
      role: 'user',
      uid,
      content: '변환이 안돼',
      createdAt: FieldValue.serverTimestamp()
    });
    await aRef.update({
      lastMessage: '변환이 안돼',
      lastSender: 'user',
      updatedAt: FieldValue.serverTimestamp(),
      conversationMode: 'ai'
    });
    const a2 = await callSupportAi(idToken, aRef.id);
    report.turns.push({ ticket: 'A', i: 2, user: '변환이 안돼', ...a2, message: a2.data && a2.data.message });

    // Ticket B (new chat)
    const bRef = await db.collection('supportTickets').add({
      uid,
      email: login.email,
      displayName: 'FailForensic',
      category: 'other',
      title: '[FAIL-FORENSIC-B] hello',
      content: '새문의테스트',
      status: 'open',
      private: true,
      attachments: [],
      conversationMode: 'ai',
      lastMessage: '새문의테스트',
      lastMessageAt: FieldValue.serverTimestamp(),
      lastSender: 'user',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      e2eTag: 'fail-forensic'
    });
    const b1 = await callSupportAi(idToken, bRef.id);
    report.turns.push({ ticket: 'B', i: 1, user: '새문의테스트', ...b1, message: b1.data && b1.data.message });

    const rateAfter = await db.collection('aiSupportRate').doc(uid).get();
    report.rateAfter = rateAfter.exists
      ? { count: rateAfter.data().count, windowStartMs: rateAfter.data().windowStartMs }
      : null;

    const aTicket = (await aRef.get()).data() || {};
    const bTicket = (await bRef.get()).data() || {};
    report.ticketA = {
      conversationMode: aTicket.conversationMode,
      hasState: !!aTicket.aiConversationState,
      stateKeys: aTicket.aiConversationState ? Object.keys(aTicket.aiConversationState) : []
    };
    report.ticketB = {
      conversationMode: bTicket.conversationMode,
      hasState: !!bTicket.aiConversationState,
      stateKeys: bTicket.aiConversationState ? Object.keys(bTicket.aiConversationState) : [],
      stateCopiedFromA:
        JSON.stringify(bTicket.aiConversationState || null) ===
        JSON.stringify(aTicket.aiConversationState || null)
    };

    await aRef.update({ status: 'closed', conversationMode: 'closed' });
    await bRef.update({ status: 'closed', conversationMode: 'closed' });

    const out = path.join(__dirname, '_tmp_failForensic_report.json');
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
  console.error('FORENSIC_FAIL', e && e.message ? e.message : e);
  process.exit(1);
});
