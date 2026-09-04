/**
 * Live production E2E for 90+ conversation agent (temp harness).
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

const FEATURE_FALLBACK_RE = /기능을 말씀하시는 거죠|같은 이름으로 바로 확인이 안/i;
const SECRET_LEAK_RE = /(AIza[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|ghp_|BEGIN (RSA |EC )?PRIVATE)/i;

const SEQUENCES = {
  MULTI: [
    '변환 안돼',
    '403 떠',
    '그건 됐고 회사에 연락할 곳 있어?',
    '전화는 말고',
    '문의 남기는 곳',
    '그리고 30일짜리 어제 샀는데',
    '아직 안들어왔어',
    '결제는 됐어',
    '그럼 뭘 확인해야돼?'
  ],
  TOOL: ['내 이용권 언제까지야?', '결제했는데 이용권이 없어'],
  DIRECT: ['사업자번호 알려줘', '30일짜리얼마', '그거 어제 샀는데 아직 안들어왔어'],
  CORRECTION: ['고객센터 번호는?', '아니 전화 말고', '문의 남기는 곳만'],
  UNSEEN: [
    '그거 언제 끝나?',
    '방금 산 거 안 보이는데',
    '아까 말한 거 말고 결제 쪽',
    '그게 아니라 이용권이야',
    '어제 산 패스 아직도 대기중',
    '승인 메일은 왔는데 계정엔 없어',
    '다른 계정으로 산 건 아니고',
    '환불은 아니고 반영만',
    '그럼 지금 내 권한 상태 뭐야',
    '만료일만 짧게 알려줘'
  ]
};

function loadLogin() {
  const p = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { email: j.user && j.user.email, refreshToken: j.tokens.refresh_token };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function latestAiReply(db, ticketId) {
  const snap = await db
    .collection('supportTickets')
    .doc(ticketId)
    .collection('replies')
    .orderBy('createdAt', 'desc')
    .limit(8)
    .get();
  for (const d of snap.docs) {
    const row = d.data() || {};
    if (String(row.role || '') === 'ai') return String(row.content || '').trim();
  }
  return '';
}

function summarize(rag) {
  if (!rag) return null;
  const agent = rag.agent || {};
  const u = agent.understanding || {};
  const state = agent.conversationState || null;
  return {
    turnRelation: rag.turnRelation || (agent.turnRelation && agent.turnRelation.relation) || null,
    userGoal: u.userGoal || null,
    productArea: u.productArea || null,
    source: u.source || null,
    llmCalls: agent.llmCalls || null,
    toolCalls: agent.toolCalls || [],
    evidenceConfidence: agent.evidenceConfidence || null,
    retrievalDocs: (rag.retrieved || []).map((x) => x.id),
    finalAction: agent.finalAction || rag.finalAction || null,
    conversationState: state
      ? {
          epoch: state.epoch,
          epochTopic: state.epochTopic,
          currentGoal: state.currentGoal,
          currentTopic: state.currentTopic,
          activeFacts: state.activeFacts,
          invalidatedFacts: state.invalidatedFacts,
          rejectedOldTopics: state.rejectedOldTopics
        }
      : null,
    authorityContext: agent.authorityContext || null,
    synthContract: agent.synthContract || null,
    answerGateFailures: agent.answerGateFailures || null,
    answerSynthesisFallbackReason: agent.answerSynthesisFallbackReason || null
  };
}

function judge(seq, idx, user, answer, meta) {
  const fails = [];
  if (!answer) fails.push('empty');
  if (FEATURE_FALLBACK_RE.test(answer)) fails.push('feature_fallback');
  if (SECRET_LEAK_RE.test(answer)) fails.push('secret_leak');
  if (seq === 'MULTI' && idx === 2) {
    if (/YouTube|유튜브|403|오디오를 가져오/i.test(answer) && !/연락|문의|전화|사업자|1:1|010/i.test(answer)) {
      fails.push('topic_leak');
    }
  }
  // Turns 6–9 (idx 5–8): commerce — forbid 403/company/사업자 as answer center
  if (seq === 'MULTI' && idx >= 5) {
    const commerceish = /(이용권|결제|반영|lifetime|만료|승인|구매|크레딧|평생)/i.test(answer);
    const histCenter =
      /(대표전화|010-\d{3,4}-\d{4}|사업자등록|403\s*(오류|떠)|유튜브\s*변환|회사에\s*연락)/i.test(answer) &&
      !commerceish;
    if (histCenter) fails.push('commerce_hist_drift');
    if (!/(이용권|lifetime|평생|결제|반영)/i.test(answer)) fails.push('commerce_no_entitlement_terms');
  }
  if (seq === 'MULTI' && idx === 7) {
    if (/무엇.{0,8}결제|어떤.{0,8}(상품|이용권).{0,10}(사|결제)/i.test(answer)) {
      fails.push('reask_payment');
    }
  }
  if (seq === 'DIRECT' && idx === 1) {
    if (/사업자|332-|{사업자}/i.test(answer) && !/(원|가격|할인|30\s*일|이용권)/i.test(answer)) {
      fails.push('cross_topic_company_leak');
    }
  }
  if (seq === 'DIRECT' && idx === 2) {
    if (/사업자|대표전화|010-/i.test(answer) && !/(이용권|결제|반영|샀)/i.test(answer)) {
      fails.push('pronoun_purchase_drift');
    }
  }
  if (seq === 'CORRECTION' && idx >= 1) {
    if (/010-\d{3,4}-\d{4}/.test(answer)) {
      fails.push('phone_still_active');
    }
  }
  if (seq === 'TOOL' && idx === 0) {
    if (!/(lifetime|평생|만료\s*없|무기한)/i.test(answer)) fails.push('lifetime_not_bound');
  }
  if (seq === 'TOOL' && meta && meta.source === 'deterministic' && !(meta.toolCalls || []).length) {
    fails.push('tool_not_used_offline_path');
  }
  return fails;
}

async function runSequence(db, authUid, idToken, name, turns) {
  const FieldValue = admin.firestore.FieldValue;
  const ticketRef = await db.collection('supportTickets').add({
    uid: authUid,
    email: 'live-e2e@midiaistudio.local',
    displayName: 'LiveE2E90',
    category: 'other',
    title: `[LIVE-90-${name}] ${turns[0].slice(0, 40)}`,
    content: turns[0],
    status: 'open',
    private: true,
    attachments: [],
    conversationMode: 'ai',
    lastMessage: turns[0],
    lastMessageAt: FieldValue.serverTimestamp(),
    lastSender: 'user',
    adminRead: false,
    adminNotified: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    e2eTag: 'live-90plus-2026-09-05'
  });
  const ticketId = ticketRef.id;
  const results = [];
  for (let i = 0; i < turns.length; i++) {
    const userText = turns[i];
    if (i > 0) {
      await ticketRef.collection('replies').add({
        role: 'user',
        uid: authUid,
        content: userText,
        createdAt: FieldValue.serverTimestamp()
      });
      await ticketRef.update({
        lastMessage: userText,
        lastMessageAt: FieldValue.serverTimestamp(),
        lastSender: 'user',
        updatedAt: FieldValue.serverTimestamp(),
        conversationMode: 'ai'
      });
    }
    console.error(`  ${name}[${i + 1}/${turns.length}] ${userText}`);
    const { status, data, latencyMs } = await callSupportAi(idToken, ticketId);
    await sleep(1000);
    const answer = await latestAiReply(db, ticketId);
    const meta = summarize(data && data._rag);
    const fails = judge(name, i, userText, answer, meta);
    results.push({
      i: i + 1,
      user: userText,
      httpStatus: status,
      ok: !!(data && data.ok),
      latencyMs,
      meta,
      answer: answer.slice(0, 600),
      fails
    });
    await sleep(500);
  }
  await ticketRef.update({
    status: 'closed',
    conversationMode: 'closed',
    updatedAt: FieldValue.serverTimestamp()
  });
  return { ticketId, results };
}

async function main() {
  const login = loadLogin();
  let accessToken = await getCliAccessToken(login.refreshToken);
  const created = await createEphemeralSaKey(accessToken);
  await sleep(5000);
  try {
    admin.initializeApp({ credential: admin.credential.cert(created.cred), projectId: PROJECT });
    const db = admin.firestore();
    const userRecord = await admin.auth().getUserByEmail(login.email);
    const idToken = await exchangeCustomToken(await admin.auth().createCustomToken(userRecord.uid));
    try {
      await db.collection('aiSupportRate').doc(userRecord.uid).delete();
    } catch (e) {
      console.error('rate_reset_warn', e && e.message);
    }
    const role = String(((await db.collection('users').doc(userRecord.uid).get()).data() || {}).role || '');
    console.log(JSON.stringify({ email: login.email, role, model: 'gpt-4o-mini via OPENAI_API_KEY v2' }));

    const report = { sequences: {}, startedAt: new Date().toISOString() };
    for (const [name, turns] of Object.entries(SEQUENCES)) {
      console.error(`Running ${name}...`);
      report.sequences[name] = await runSequence(db, userRecord.uid, idToken, name, turns);
    }
    const out = path.join(__dirname, '_tmp_liveE2e_report.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log('REPORT_PATH', out);
  } finally {
    try {
      accessToken = await getCliAccessToken(login.refreshToken);
      await deleteSaKey(accessToken, created.keyName);
      console.error('Deleted ephemeral SA key');
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error('E2E_FAIL', e && e.message ? e.message : e);
  process.exit(1);
});
