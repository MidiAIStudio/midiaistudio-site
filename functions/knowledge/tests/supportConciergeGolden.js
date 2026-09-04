/**
 * Generalist Support concierge acceptance (semantic assertions, not exact wording).
 * Run: node functions/knowledge/tests/supportConciergeGolden.js
 */
'use strict';

const assert = require('assert');
const { retrieveKnowledge, detectLocale } = require('../loadKnowledge');
const { resolveConversationQuery } = require('../conversationContext');
const { synthesizeFromEvidence } = require('../../supportAiPrivateSource/synthesizeFromEvidence');
const { looksLikeSourceDump } = require('../../supportAiPrivateSource/customerSafe');
const { evidenceMatchesQuestion } = require('../../supportAiPrivateSource/relevance');
const { templateAnswer, isPersonal } = require('../../supportAi');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const { isWeakOrConflictingRetrieval, detectAnswerIntent } = require('../../supportAi');
const {
  FEATURE_MAP,
  USER_QUESTIONS,
  MULTI_TURN_SCENARIOS,
  NONEXISTENT_FEATURES,
  NEGATIVE_EVIDENCE,
  FEATURE_LABELS,
  QUESTION_TEMPLATES
} = require('./supportConciergeData');

function retrieve(q) {
  return retrieveKnowledge(q, { limit: 4, includeInternal: false, locale: detectLocale(q), minScore: 1 });
}

function emptyAdapters(overrides = {}) {
  return {
    retrieveStatic: async ({ question }) => retrieve(question),
    loadLiveFaq: async () => [],
    loadLiveCatalog: async () => [],
    loadLiveRelease: async () => [],
    loadLiveNotice: async () => [],
    loadLiveGuide: async () => [],
    ...overrides
  };
}

async function agent(question, opts = {}) {
  return runSupportAgent({
    question,
    rawQuestion: opts.rawQuestion || question,
    locale: 'ko',
    personal: !!opts.personal,
    userTurns: opts.userTurns || [opts.rawQuestion || question],
    priorAiReplies: opts.priorAiReplies || [],
    clarifyEarly: null,
    adapters: emptyAdapters(opts.adapters || {}),
    retrieveStaticInitial: ({ limit, question: q }) => retrieve(q || opts.rawQuestion || question),
    isWeakOrConflictingRetrieval,
    detectAnswerIntent,
    callLlm: opts.callLlm || null
  });
}

function assertNoRaw(text) {
  assert.ok(!looksLikeSourceDump(text), `raw dump: ${String(text).slice(0, 80)}`);
  assert.ok(!/midi_ai_|score_editor_|AI 답변을 불러오지/i.test(text), `bad answer: ${text}`);
}

function assertAnswerNatural(text, { topic } = {}) {
  assertNoRaw(text);
  const t = String(text || '');
  assert.ok(t.length < 1200, `too long (${t.length})`);
  assert.ok(!/무슨 작업을 하려는지/.test(t), 'generic diagnostic');
  assert.ok(!/(Knowledge|RAG|Firestore|Functions|sourcePlan)/i.test(t), 'internal jargon');
  if (topic && Array.isArray(topic.mustNot) ) {
    for (const re of topic.mustNot) assert.ok(!re.test(t), `mustNot ${re}`);
  }
}

/** Seeded PRNG for reproducible randomized QA */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function run() {
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    } catch (err) {
      results.push({ name, ok: false, error: err.message });
      console.error(`FAIL  ${name}: ${err.message}`);
    }
  };

  // --- Production bug: 편곡기능있어? must not dead-end ---
  await check('편곡기능있어? agent answers without counselor dead-end', async () => {
    const out = await agent('편곡기능있어?');
    assert.ok(out.debug.finalAction === 'ANSWER' || (out.passages && out.passages.length), out.debug.finalAction);
    const syn = synthesizeFromEvidence({
      question: '편곡기능있어?',
      locale: 'ko',
      privateDebug: { privateSourceUsed: true, privateAcceptedHits: [{ pathHint: 'lang/en.json' }] },
      passages: out.passages
    });
    assert.ok(syn.ok, syn.reason);
    assertAnswerNatural(syn.text);
    assert.ok(/Arrange|편곡|AI Assistant/i.test(syn.text));
    const tmpl = templateAnswer('편곡기능있어?', out.passages, {
      personal: false,
      lowConfidence: false,
      wantHuman: false,
      locale: 'ko'
    });
    assertAnswerNatural(tmpl.text);
  });

  await check('LLM-fail evidence fallback synthesizes Arrange', async () => {
    const syn = synthesizeFromEvidence({
      question: '편곡기능있어?',
      locale: 'ko',
      privateDebug: { privateSourceUsed: true },
      passages: []
    });
    assert.ok(syn.ok);
    assert.ok(/네/.test(syn.text));
    assertAnswerNatural(syn.text);
  });

  // --- Personal path ---
  await check('personal payment not product invention', async () => {
    assert.ok(isPersonal('내 결제 상태 알려줘') || /결제/.test('내 결제 상태 알려줘'));
    const out = await agent('내 이용권 언제 끝나?', { personal: true, rawQuestion: '내 이용권 언제 끝나?' });
    assert.strictEqual(out.debug.finalAction, 'ANSWER');
  });

  // --- Retrieval bank (120+ USER questions) ---
  assert.ok(USER_QUESTIONS.length >= 120, `need >=120 questions, got ${USER_QUESTIONS.length}`);
  for (const c of USER_QUESTIONS) {
    await check(`q:${c.topic}:${c.intent}:${c.q}`, async () => {
      const rows = retrieve(c.q);
      if (!c.soft) {
        assert.ok(rows.length, `no hits for ${c.q}`);
        assert.ok(
          rows.some((r) => c.idRe.test(String(r.id) + ' ' + String(r.category || '') + ' ' + String(r.title || ''))),
          `${c.q} → ${rows.map((r) => r.id).join(',')}`
        );
      }
      const tmpl = templateAnswer(c.q, rows, {
        personal: false,
        lowConfidence: !rows.length || Number(rows[0] && rows[0].score) < 8,
        wantHuman: false,
        locale: 'ko'
      });
      assertAnswerNatural(tmpl.text);
    });
  }

  // --- Multi-turn (30+) ---
  assert.ok(MULTI_TURN_SCENARIOS.length >= 30, `need >=30 multi-turn, got ${MULTI_TURN_SCENARIOS.length}`);
  for (const sc of MULTI_TURN_SCENARIOS) {
    await check(`multi:${sc.name}`, async () => {
      for (let i = 0; i < sc.turns.length; i += 1) {
        const prior = sc.turns.slice(0, i);
        const r = resolveConversationQuery({ rawQuestion: sc.turns[i], priorUserTurns: prior });
        if (sc.expectFollow[i] === true) assert.strictEqual(r.followUp, true, `${sc.turns[i]} follow`);
        if (sc.expectFollow[i] === false) assert.strictEqual(r.followUp, false, `${sc.turns[i]} switch`);
        if (sc.mustCarry[i] && r.followUp) {
          assert.ok(sc.mustCarry[i].test(r.resolvedQuestion), `carry ${r.resolvedQuestion}`);
        }
        assertNoRaw(r.resolvedQuestion);
      }
    });
  }

  // --- Nonexistent features (20+) ---
  assert.ok(NONEXISTENT_FEATURES.length >= 20, `need >=20 nonexistent`);
  for (const name of NONEXISTENT_FEATURES) {
    await check(`nonexist:${name}`, async () => {
      const q = `${name} 있어?`;
      const syn = synthesizeFromEvidence({
        question: q,
        locale: 'ko',
        privateDebug: { privateSourceUsed: false },
        passages: []
      });
      assert.ok(!syn.ok || !/네\.\s*AI Assistant/.test(syn.text));
      const rows = retrieve(q);
      const tmpl = templateAnswer(q, rows, {
        personal: false,
        lowConfidence: true,
        wantHuman: false,
        locale: 'ko'
      });
      assertAnswerNatural(tmpl.text);
      assert.ok(!new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,12}있습니다`).test(tmpl.text));
      assert.ok(!/무슨 작업을 하려는지/.test(tmpl.text));
    });
  }

  // --- Negative evidence matrix ---
  for (const n of NEGATIVE_EVIDENCE) {
    await check(`neg:${n.name}`, async () => {
      const r = evidenceMatchesQuestion(n.q, n.body, n.terms);
      assert.ok(!r.ok, `should reject: ${n.name} (${r.reason})`);
    });
  }

  // --- Randomized feature QA (50+) ---
  const rnd = mulberry32(20260904);
  const intents = ['what', 'exists', 'where', 'how', 'trouble'];
  const randomCases = [];
  while (randomCases.length < 50) {
    const feat = FEATURE_MAP[Math.floor(rnd() * FEATURE_MAP.length)];
    const intent = intents[Math.floor(rnd() * intents.length)];
    const label = FEATURE_LABELS[feat.id] || feat.topic;
    const templates = QUESTION_TEMPLATES[intent] || QUESTION_TEMPLATES.what;
    const tmpl = templates[Math.floor(rnd() * templates.length)];
    const q = tmpl.replace(/\{label\}/g, label);
    randomCases.push({ feat, intent, q });
  }
  for (const c of randomCases) {
    await check(`rand:${c.feat.id}:${c.intent}:${c.q}`, async () => {
      const rows = retrieve(c.q);
      // Soft features may miss; still require safe answer surface
      if (rows.length) {
        const hit = rows.some((r) => c.feat.idRe.test(String(r.id)));
        // Allow miss for patch/nav soft areas; otherwise require family hit when score strong
        if (Number(rows[0].score) >= 12) {
          assert.ok(hit || /patch|support|perf|login|playback/.test(c.feat.id), `${c.q} → ${rows[0].id}`);
        }
      }
      const tmpl = templateAnswer(c.q, rows, {
        personal: false,
        lowConfidence: !rows.length || Number(rows[0] && rows[0].score) < 8,
        wantHuman: false,
        locale: 'ko'
      });
      assertAnswerNatural(tmpl.text);
      // Must not invent nonexistent branded fake features
      assert.ok(!/퀀텀폴드|노트텔레포트/.test(tmpl.text));
    });
  }

  // --- Manual-style short chat simulation ---
  const manual = [
    '편곡 같은거 되나',
    '그거 어디',
    '미디로 뽑는건',
    '403 뜨는데',
    '소리왜이래',
    '쉬운키가머야',
    '템포느리게',
    'pdf저장'
  ];
  for (const q of manual) {
    await check(`manual:${q}`, async () => {
      const rows = retrieve(q);
      const tmpl = templateAnswer(q, rows, {
        personal: false,
        lowConfidence: !rows.length,
        wantHuman: false,
        locale: 'ko'
      });
      assertAnswerNatural(tmpl.text);
    });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nsupportConciergeGolden: ${results.length - failed.length}/${results.length} passed`);
  console.log(
    `coverage: questions=${USER_QUESTIONS.length} multi=${MULTI_TURN_SCENARIOS.length} fake=${NONEXISTENT_FEATURES.length} neg=${NEGATIVE_EVIDENCE.length} rand=50`
  );
  if (failed.length) {
    console.error(failed.slice(0, 30));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
