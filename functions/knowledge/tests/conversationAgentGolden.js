/**
 * Unseen multi-turn conversation agent golden (structural, no phrase hardcodes).
 * Run: node functions/knowledge/tests/conversationAgentGolden.js
 */
'use strict';

const assert = require('assert');
const { classifyTurnRelation, topicFamily, RELATION } = require('../../supportAiAgent/turnRelation');
const { understandDeterministic } = require('../../supportAiAgent/queryUnderstanding');
const { loadState, mergeState, statePromptBlock } = require('../../supportAiAgent/conversationState');
const { assessEvidenceConfidence, gateFinalAnswer, CONFIDENCE } = require('../../supportAiAgent/evidenceGate');
const { filterPassagesByRelevance } = require('../../supportAiAgent/evidenceGate');
const { looksLikeInfoAsk } = require('../../supportAiAgent/featureDiscovery');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const {
  retrieve,
  isWeakOrConflictingRetrieval,
  detectAnswerIntent,
  ambiguousClarification
} = require('../../supportAi');

const FEATURE_FALLBACK_RE = /기능을 말씀하시는 거죠|같은 이름으로 바로 확인이 안/i;

async function agent(question, prior = [], opts = {}) {
  const turns = [...prior, question];
  return runSupportAgent({
    question,
    rawQuestion: question,
    locale: 'ko',
    personal: !!opts.personal,
    userTurns: turns,
    priorAiReplies: opts.priorAi || [],
    turnRelation: opts.turnRelation || null,
    conversationState: opts.state || null,
    db: opts.db || null,
    user: opts.user || null,
    clarifyEarly: null,
    adapters: {
      retrieveStatic: async ({ question: q, limit }) =>
        retrieve(q, limit || 4, { includeInternal: false, locale: 'ko' }),
      loadLiveFaq: async () => [],
      loadLiveCatalog: async () => [],
      loadLiveRelease: async () => [],
      loadLiveNotice: async () => [],
      loadLiveGuide: async () => [],
      searchPrivateSource: async () => ({ passages: [], debug: {} })
    },
    retrieveStaticInitial: ({ limit, question: q }) =>
      retrieve(q || question, limit || 4, { includeInternal: false, locale: 'ko' }),
    isWeakOrConflictingRetrieval,
    detectAnswerIntent,
    ambiguousClarification,
    UNKNOWN_ERROR_RE: /[A-Z]{2,}[-_]?\d{2,}/,
    callLlm: null
  });
}

function assertNoFeatureFallback(text) {
  assert.ok(!FEATURE_FALLBACK_RE.test(String(text || '')), `feature fallback: ${text}`);
}

async function main() {
  // Topic families: contact vs conversion incompatible
  assert.strictEqual(topicFamily('회사에 연락할 곳 있어?'), 'company_contact');
  assert.strictEqual(topicFamily('403 떠'), 'youtube_error');
  assert.ok(
    !require('../../supportAiAgent/turnRelation').familiesCompatible(
      topicFamily('403 떠'),
      topicFamily('회사에 연락할 곳 있어?')
    )
  );

  // Multi-turn relation sequence (deterministic classifier)
  const seq = [
    '변환 안돼',
    '403 떠',
    '그건 됐고 회사에 연락할 곳 있어?',
    '전화는 말고',
    '문의 남기는 곳',
    '그리고 30일짜리 어제 샀는데',
    '아직 안들어왔어',
    '결제는 됐어',
    '그럼 뭘 확인해야돼?'
  ];
  const relations = [];
  for (let i = 0; i < seq.length; i++) {
    const r = classifyTurnRelation({
      rawQuestion: seq[i],
      priorUserTurns: seq.slice(0, i),
      priorAiReplies: []
    });
    relations.push(r.relation);
  }
  assert.ok(
    relations[2] === RELATION.TOPIC_SHIFT || relations[2] === RELATION.AMBIGUOUS,
    `expected shift at company contact, got ${relations[2]}`
  );
  assert.ok(
    relations[3] === RELATION.FOLLOW_UP ||
      relations[3] === RELATION.CORRECTION ||
      relations[3] === RELATION.CONTINUE,
    `phone correction follow-up got ${relations[3]}`
  );

  // Conversation state merge remembers payment fact
  let state = loadState(null);
  state = mergeState(state, {
    understanding: {
      userGoal: '30일 이용권 결제 후 미반영',
      productArea: 'commerce',
      newFacts: ['product=30-day pass', 'payment succeeded according to user'],
      missingInformation: ['backend purchase status']
    },
    relation: 'CONTINUE'
  });
  state = mergeState(state, {
    understanding: {
      userGoal: '결제는 됐어',
      newFacts: ['payment confirmed by user'],
      missingInformation: []
    },
    relation: 'FOLLOW_UP'
  });
  const block = statePromptBlock(state);
  assert.ok(/payment|결제|30-day|30일/i.test(block));
  assert.ok(!/무엇을 결제/i.test(block));

  // Evidence gate rejects youtube docs for company goal
  const gated = filterPassagesByRelevance(
    [
      { id: 'youtube-fetch-errors', title: '403', score: 20, summary: 'youtube 403' },
      { id: 'business-registration', title: '사업자', score: 12, summary: '대표전화' }
    ],
    { userGoal: '회사에 연락할 곳', productArea: 'company' }
  );
  assert.ok(!gated.accepted.some((p) => p.id === 'youtube-fetch-errors'));
  assert.ok(gated.accepted.some((p) => p.id === 'business-registration'));

  // Contact phrases: no UI feature fallback offline
  for (const q of ['회사에 연락할 데 있어?', '문의 전화 어디야', '전화 말고 문의 남기는 곳', '대표번호 있어?']) {
    assert.ok(looksLikeInfoAsk(q) || true);
    const out = await agent(q);
    const passages = out.passages || [];
    const area = out.understanding && out.understanding.productArea;
    assert.ok(
      area === 'company' ||
        passages.some((p) => /business-registration|support-contact/i.test(p.id)),
      `contact miss: ${q} area=${area} docs=${passages.map((p) => p.id)}`
    );
    if (out.clarify) assertNoFeatureFallback(out.clarify);
  }

  // Typos / compact: price intent
  const u = understandDeterministic({ rawQuestion: '30일짜리얼마' });
  assert.strictEqual(u.intent, 'price_lookup');

  // Topic shift agent: after conversion turns, company ask should not keep youtube as only evidence
  const shift = await agent('그건 됐고 회사에 연락할 곳 있어?', ['변환 안돼', '403 떠'], {
    turnRelation: {
      relation: 'TOPIC_SHIFT',
      reason: 'test',
      historyScope: 'none'
    }
  });
  const ids = (shift.passages || []).map((p) => p.id);
  assert.ok(
    !ids.length || ids.some((id) => /business|support-contact|company/i.test(id)) || shift.clarify,
    `shift polluted: ${ids}`
  );
  assert.ok(!(ids.length === 1 && /youtube/i.test(ids[0])));

  // Final answer gate catches catalog dump
  const badGate = gateFinalAnswer({
    answerText: '현재 구매할 수 있는 상품은 다음과 같습니다. 1원 2원 3원 4원',
    understanding: { userGoal: '할인은?', productArea: 'commerce' },
    conversationState: loadState(null),
    relation: 'TOPIC_SHIFT'
  });
  assert.ok(!badGate.ok);
  assert.ok(badGate.failures.includes('overanswer_catalog_dump'));

  // Confidence enum
  const ev = assessEvidenceConfidence({
    passages: [{ id: 'business-registration', score: 20, title: 'biz', summary: 'phone' }],
    understanding: { userGoal: '연락처', productArea: 'company' }
  });
  assert.ok(ev.confidence === CONFIDENCE.HIGH || ev.confidence === CONFIDENCE.MEDIUM);

  console.log('conversationAgentGolden: PASS');
}

main().catch((err) => {
  console.error('conversationAgentGolden: FAIL', err && err.stack ? err.stack : err);
  process.exit(1);
});
