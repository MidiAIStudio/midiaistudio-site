/**
 * Synthesizer / state-lock golden — structural, no sequence hardcodes.
 * Run: node functions/knowledge/tests/synthesizerStateGolden.js
 */
'use strict';

const assert = require('assert');
const { loadState, mergeState, startNewEpoch } = require('../../supportAiAgent/conversationState');
const {
  buildAuthoritativeContext,
  selectRelevantHistory,
  semanticDriftGate,
  topicFamilyOf,
  toolBoundFallback
} = require('../../supportAiAgent/answerSynthesizer');

function main() {
  // Topic epoch reset
  let state = loadState(null);
  state = mergeState(state, {
    understanding: { userGoal: '403 오류', productArea: 'troubleshooting', newFacts: ['error=403'] },
    relation: 'CONTINUE'
  });
  assert.ok(state.activeFacts.some((f) => /403/.test(f)));
  state = mergeState(state, {
    understanding: { userGoal: '회사 연락처', productArea: 'company', newFacts: ['want_contact'] },
    relation: 'TOPIC_SHIFT'
  });
  assert.ok(state.epoch >= 1);
  assert.ok(!state.activeFacts.some((f) => /403/.test(f)));
  assert.ok(state.historicalFacts.some((f) => /403|prev_goal/.test(f)));
  assert.ok(state.rejectedOldTopics.length >= 1);

  // Correction invalidates phone
  state.lastAssistantAssumption = '대표전화 010-2166-5563 안내';
  state = mergeState(state, {
    understanding: { userGoal: '전화는 말고 문의 채널', productArea: 'company' },
    relation: 'CONTINUE'
  });
  assert.ok(state.invalidatedFacts.some((f) => /need_phone/.test(f)));
  assert.ok(state.activeFacts.some((f) => /non_phone/.test(f)));

  // History selector clears on TOPIC_SHIFT
  const cleared = selectRelevantHistory({
    userTurns: ['403 떠', '회사 연락처', '30일짜리 샀는데'],
    priorAiReplies: ['403은 권한 문제', '전화번호는 ...'],
    understanding: { userGoal: '30일 이용권 미반영', productArea: 'commerce' },
    relation: 'TOPIC_SHIFT'
  });
  assert.deepStrictEqual(cleared.userLines, []);
  assert.strictEqual(cleared.reason, 'topic_shift_cleared');

  // Goal-filtered history keeps commerce turns only
  const filtered = selectRelevantHistory({
    userTurns: ['403 떠', '회사 연락처', '30일짜리 어제 샀는데', '아직 안들어왔어', '결제는 됐어'],
    priorAiReplies: ['403 안내', '전화 010', '문의 게시판'],
    understanding: { userGoal: '결제 후 이용권 미반영', productArea: 'account' },
    relation: 'CONTINUE'
  });
  assert.ok(filtered.userLines.every((t) => topicFamilyOf(t) === 'commerce' || /결제|샀|들어/.test(t)));
  assert.ok(!filtered.userLines.some((t) => /403|회사/.test(t)));

  // Authority + drift gate
  const authority = buildAuthoritativeContext({
    rawQuestion: '결제는 됐어',
    understanding: {
      userGoal: '30일 이용권 결제 후 미반영 — 결제는 완료됨',
      productArea: 'account',
      newFacts: ['payment_succeeded_per_user', 'product=30-day'],
      plannedActions: ['LOOKUP_PAYMENT', 'LOOKUP_LICENSE']
    },
    conversationState: {
      epoch: 2,
      epochTopic: 'commerce',
      currentGoal: '30일 이용권 미반영',
      currentTopic: 'commerce',
      rejectedOldTopics: ['troubleshooting', 'company'],
      activeFacts: ['product=30-day'],
      persistentFacts: ['account_authenticated=true']
    },
    relation: 'CONTINUE',
    toolSnapshot: {
      licenseSummary: 'Lifetime 이용권 활성',
      paymentSummary: '이 계정에서 최근 결제·구매 기록은 확인되지 않음',
      paymentQueryStatus: 'NOT_FOUND',
      canonicalFacts: ['license_canonical=plan:lifetime|active:true|expires:none'],
      facts: ['license_active=true']
    },
    passages: [],
    userTurns: ['30일짜리 어제 샀는데', '아직 안들어왔어', '결제는 됐어'],
    priorAiReplies: [],
    locale: 'ko'
  });
  assert.ok(authority.toolBindingRequired);
  assert.ok(authority.toolEvidence.length >= 1);
  assert.ok(authority.activeFacts.some((f) => /30-day|payment_succeeded|goal=/.test(f)));

  const bad = semanticDriftGate({
    answerText: '회사 대표전화는 010-2166-5563입니다. 1:1 문의도 가능합니다.',
    authority,
    toolSnapshot: {
      licenseSummary: 'Lifetime 이용권 활성',
      paymentQueryStatus: 'NOT_FOUND',
      facts: ['x']
    }
  });
  assert.ok(!bad.ok);
  assert.ok(bad.failures.includes('inactive_historical_topic_centered') || bad.failures.includes('tool_evidence_ignored'));

  const good = semanticDriftGate({
    answerText:
      '30일 이용권 미반영 문의로 이해했습니다. 계정 조회상 Lifetime 이용권이 활성이며 만료일은 없습니다. 결제 기록은 이 계정에서 확인되지 않았습니다.',
    authority,
    toolSnapshot: {
      licenseSummary: 'Lifetime 이용권 활성',
      paymentQueryStatus: 'NOT_FOUND',
      facts: ['x']
    }
  });
  assert.ok(good.ok, JSON.stringify(good.failures));

  const bound = toolBoundFallback({
    authority,
    toolSnapshot: {
      licenseSummary: 'Lifetime 이용권 활성',
      paymentQueryStatus: 'QUERY_FAILED'
    },
    locale: 'ko'
  });
  assert.ok(/Lifetime/.test(bound));
  assert.ok(/완료하지 못했/.test(bound));
  assert.ok(!/없습니다/.test(bound) || /완료하지/.test(bound));

  // AMBIGUOUS does not wipe goal
  let s2 = loadState({ currentGoal: 'keep-me', currentTopic: 'commerce', epoch: 1 });
  s2 = mergeState(s2, {
    understanding: { userGoal: '??', productArea: 'general' },
    relation: 'AMBIGUOUS'
  });
  assert.strictEqual(s2.currentGoal, 'keep-me');

  console.log('synthesizerStateGolden: PASS');
}

main();
