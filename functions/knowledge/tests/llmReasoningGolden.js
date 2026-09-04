/**
 * LLM-centered reasoning rebuild golden tests (deterministic path + relevance gate).
 * Run: node functions/knowledge/tests/llmReasoningGolden.js
 */
'use strict';

const assert = require('assert');
const { retrieveKnowledge, detectLocale } = require('../loadKnowledge');
const { resolveConversationQuery } = require('../conversationContext');
const { understandDeterministic } = require('../../supportAiAgent/queryUnderstanding');
const { gatePassages, retrieveWithSearchPlan } = require('../../supportAiAgent/relevanceGate');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const { isWeakOrConflictingRetrieval, detectAnswerIntent, templateAnswer } = require('../../supportAi');

function retrieve(q) {
  return retrieveKnowledge(q, { limit: 6, includeInternal: false, locale: detectLocale(q), minScore: 1 });
}

function emptyAdapters() {
  return {
    retrieveStatic: async ({ question }) => retrieve(question),
    loadLiveFaq: async () => [],
    loadLiveCatalog: async () => [],
    loadLiveRelease: async () => [],
    loadLiveNotice: async () => [],
    loadLiveGuide: async () => []
  };
}

async function agent(question, opts = {}) {
  return runSupportAgent({
    question,
    rawQuestion: opts.rawQuestion || question,
    locale: 'ko',
    personal: false,
    userTurns: opts.userTurns || [opts.rawQuestion || question],
    priorAiReplies: opts.priorAiReplies || [],
    clarifyEarly: null,
    adapters: emptyAdapters(),
    retrieveStaticInitial: ({ limit, question: q }) => retrieve(q || opts.rawQuestion || question),
    isWeakOrConflictingRetrieval,
    detectAnswerIntent,
    callLlm: null
  });
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

  await check('TEST1 understanding piano/orchestra mismatch', async () => {
    const u = understandDeterministic({
      rawQuestion: '피아노로 변환했는데 오케스트라 변환 실패라고 떠',
      userTurns: ['피아노로 변환했는데 오케스트라 변환 실패라고 떠']
    });
    assert.strictEqual(u.intent, 'troubleshooting');
    assert.strictEqual(u.contradiction, 'mode_label_mismatch');
    assert.strictEqual(u.selectedMode, 'piano');
    assert.strictEqual(u.observedLabel, 'orchestra');
    assert.ok(u.searchQueries.every((q) => !/band orchestra preview/i.test(q)));
  });

  await check('TEST1 agent rejects orchestra feature doc', async () => {
    const out = await agent('피아노로 변환했는데 오케스트라 변환 실패라고 떠');
    assert.strictEqual(out.understanding.intent, 'troubleshooting');
    assert.strictEqual(out.understanding.contradiction, 'mode_label_mismatch');
    assert.ok(
      !(out.passages || []).some((p) => p.id === 'band-orchestra-preview'),
      `passages=${(out.passages || []).map((p) => p.id)}`
    );
    assert.ok(
      (out.debug.relevance.rejected || []).some((r) => r.id === 'band-orchestra-preview') ||
        !(retrieve('오케스트라').some((p) => p.id === 'band-orchestra-preview') && out.passages.some((p) => p.id === 'band-orchestra-preview'))
    );
    assert.ok(out.clarify || out.debug.finalAction === 'ASK_DIAGNOSTIC' || out.debug.finalAction === 'ANSWER');
    if (out.clarify) {
      assert.ok(/피아노|모드|오류|메시지/i.test(out.clarify));
      assert.ok(!/Preview|Experimental|프리뷰 기능입니다/i.test(out.clarify));
    }
  });

  await check('TEST2 orchestra what = feature', async () => {
    const u = understandDeterministic({
      rawQuestion: '오케스트라 변환은 뭐야?',
      userTurns: ['오케스트라 변환은 뭐야?']
    });
    assert.strictEqual(u.intent, 'feature_explanation');
    assert.ok(!u.contradiction);
    const out = await agent('오케스트라 변환은 뭐야?');
    assert.ok(
      (out.passages || []).some((p) => p.id === 'band-orchestra-preview') ||
        out.debug.finalAction === 'ANSWER' ||
        (out.passages || []).length > 0
    );
    const tmpl = templateAnswer('오케스트라 변환은 뭐야?', out.passages, {
      personal: false,
      lowConfidence: false,
      wantHuman: false,
      locale: 'ko'
    });
    assert.ok(!/상담사에게 연결/i.test(tmpl.text));
  });

  await check('TEST3 orchestra failed = troubleshoot', async () => {
    const u = understandDeterministic({
      rawQuestion: '오케스트라 변환하다 실패했어',
      userTurns: ['오케스트라 변환하다 실패했어']
    });
    assert.strictEqual(u.intent, 'troubleshooting');
  });

  await check('TEST4 piano selected orchestra converted', async () => {
    const u = understandDeterministic({
      rawQuestion: '피아노 선택했는데 오케스트라로 변환돼',
      userTurns: ['피아노 선택했는데 오케스트라로 변환돼']
    });
    assert.ok(u.contradiction === 'mode_label_mismatch' || u.intent === 'troubleshooting');
  });

  await check('TEST5 piano feature explain', async () => {
    const u = understandDeterministic({
      rawQuestion: '피아노 변환 기능 설명해줘',
      userTurns: ['피아노 변환 기능 설명해줘']
    });
    assert.ok(u.intent === 'feature_explanation' || u.intent === 'how_to');
  });

  await check('TEST10 typo same meaning', async () => {
    const u = understandDeterministic({
      rawQuestion: '오케스트라변환실패라떠 난피아노햇는데',
      userTurns: ['오케스트라변환실패라떠 난피아노햇는데']
    });
    assert.strictEqual(u.intent, 'troubleshooting');
    assert.strictEqual(u.contradiction, 'mode_label_mismatch');
  });

  await check('TEST11 multi-turn context', async () => {
    const turns = ['피아노 변환했어', '오케스트라 실패라고 떠'];
    const res = resolveConversationQuery({
      rawQuestion: turns[1],
      priorUserTurns: [turns[0]]
    });
    assert.ok(res.followUp || /피아노/.test(res.resolvedQuestion), JSON.stringify(res));
    const out = await agent(res.resolvedQuestion, {
      rawQuestion: turns[1],
      userTurns: turns,
      priorAiReplies: ['어떤 문제가 발생했나요?']
    });
    assert.strictEqual(out.understanding.contradiction, 'mode_label_mismatch');
    assert.ok(!(out.passages || []).some((p) => p.id === 'band-orchestra-preview'));
  });

  await check('TEST12 piano failed ignores orchestra feature', async () => {
    const out = await agent('피아노로 변환했는데 실패했어');
    assert.ok(!(out.passages || []).some((p) => p.id === 'band-orchestra-preview'));
  });

  await check('relevance gate rejects feature bait', async () => {
    const u = understandDeterministic({
      rawQuestion: '피아노로 변환했는데 오케스트라 변환 실패라고 떠',
      userTurns: ['피아노로 변환했는데 오케스트라 변환 실패라고 떠']
    });
    const bait = retrieve('오케스트라');
    assert.ok(bait.some((p) => p.id === 'band-orchestra-preview'));
    const gated = gatePassages(bait, u);
    assert.ok(!gated.accepted.some((p) => p.id === 'band-orchestra-preview'));
    assert.ok(gated.rejected.some((r) => r.id === 'band-orchestra-preview'));
  });

  await check('search plan multi-query merge', async () => {
    const u = understandDeterministic({
      rawQuestion: '피아노로 변환했는데 오케스트라 변환 실패라고 떠',
      userTurns: ['피아노로 변환했는데 오케스트라 변환 실패라고 떠']
    });
    const gated = retrieveWithSearchPlan(u.searchQueries, retrieve, u);
    assert.ok(!gated.accepted.some((p) => p.id === 'band-orchestra-preview'));
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
