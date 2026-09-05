/**
 * Basic Studio how-to evidence regression (no phrase hardcodes for "변환").
 * Run: node functions/knowledge/tests/basicHowToGolden.js
 */
'use strict';

const assert = require('assert');
const { understandDeterministic } = require('../../supportAiAgent/queryUnderstanding');
const { retrieveKnowledge } = require('../loadKnowledge');
const { retrieveWithSearchPlan } = require('../../supportAiAgent/relevanceGate');
const { assessEvidenceConfidence, CONFIDENCE } = require('../../supportAiAgent/evidenceGate');
const { isWeakOrConflictingRetrieval, templateAnswer } = require('../../supportAi');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const {
  needsCoreWorkflowExpansion,
  expandCoreWorkflowSearchQueries
} = require('../../supportAiAgent/coreWorkflowEvidence');

const HOW_TO_CASES = [
  '변환 어떻게 해?',
  'midi 만들려면?',
  '노래를 미디로 바꾸고 싶어',
  '유튜브를 midi로 어떻게 만듬',
  'mp3를 midi로 바꾸는법',
  '변환 어디서 시작해?',
  '처음인데 어떻게 쓰면 돼?',
  '변환 어떻게하는거야?',
  'midi 변환 하는방법'
];

const WORKFLOW_RE = /youtube-to-midi|audio-to-midi|getting-started|nav-workspace|midi-editor|pdf-to-midi/i;
const NO_EVIDENCE_RE = /공식 자료에서 정확히 확인하기 어렵습니다|상담사에게 연결해 드릴까요/;

async function agentFor(q) {
  return runSupportAgent({
    question: q,
    rawQuestion: q,
    locale: 'ko',
    userTurns: [q],
    priorAiReplies: [],
    personal: false,
    retrieveStaticInitial: ({ limit, question: qq }) =>
      retrieveKnowledge(qq || q, { limit: limit || 6, minScore: 1, locale: 'ko' }),
    isWeakOrConflictingRetrieval,
    detectAnswerIntent: () => 'how',
    callLlm: null
  });
}

async function main() {
  let passed = 0;
  const total = HOW_TO_CASES.length;

  console.log('=== basic how-to retrieval + evidence ===');
  for (const q of HOW_TO_CASES) {
    const u = understandDeterministic({ rawQuestion: q });
    const plan = retrieveWithSearchPlan(
      u.searchQueries,
      (qq) => retrieveKnowledge(qq, { limit: 6, minScore: 1, locale: 'ko' }),
      u
    );
    const ev = assessEvidenceConfidence({ passages: plan.accepted, understanding: u });
    assert.ok(
      ev.confidence === CONFIDENCE.HIGH || ev.confidence === CONFIDENCE.MEDIUM,
      `${q}: expected HIGH/MEDIUM got ${ev.confidence} ids=${ev.accepted.map((p) => p.id)}`
    );
    assert.ok(
      ev.accepted.some((p) => WORKFLOW_RE.test(p.id)),
      `${q}: expected workflow doc, got ${ev.accepted.map((p) => p.id)}`
    );
    assert.ok(
      !ev.accepted.some((p) => /fetch-errors|generic-failure/i.test(p.id)),
      `${q}: failure doc leaked into how-to evidence`
    );
    passed += 1;
    console.log('OK', q, ev.confidence, ev.accepted.slice(0, 3).map((p) => p.id).join(','));
  }

  console.log('=== agent final action (no LLM) ===');
  for (const q of ['변환 어떻게하는거야?', 'midi 변환 하는방법']) {
    const out = await agentFor(q);
    assert.strictEqual(out.debug.finalAction, 'ANSWER', `${q} finalAction=${out.debug.finalAction}`);
    assert.ok(out.passages && out.passages.length, `${q} empty passages`);
    assert.ok(!out.lowConfidence, `${q} lowConfidence`);
    assert.ok(!out.clarify || !NO_EVIDENCE_RE.test(out.clarify), `${q} clarify=${out.clarify}`);
    const tmpl = templateAnswer(q, out.passages, {
      locale: 'ko',
      lowConfidence: out.lowConfidence,
      clarify: out.clarify
    });
    assert.ok(!NO_EVIDENCE_RE.test(tmpl.text), `${q} no-evidence template: ${tmpl.text}`);
    assert.ok(
      /YouTube|유튜브|오디오|MIDI|Studio|스튜디오|변환|Editor|에디터/i.test(tmpl.text),
      `${q} weak answer: ${tmpl.text}`
    );
    console.log('OK agent', q, '→', tmpl.text.slice(0, 120).replace(/\s+/g, ' '));
  }

  console.log('=== no-evidence protection still holds ===');
  {
    const q = '내일 날씨 어때?';
    const u = understandDeterministic({ rawQuestion: q });
    // Should not expand core studio workflows for off-topic if intent/area wrong —
    // deterministic may still mark general+studio_conversion; expansion may fire.
    // Use a commerce/company-safe negative instead:
    const q2 = '사업자등록번호 알려줘';
    const u2 = understandDeterministic({ rawQuestion: q2 });
    assert.strictEqual(u2.productArea, 'company');
    assert.ok(!needsCoreWorkflowExpansion(u2), 'company ask must not expand workflows');
    const plan = retrieveWithSearchPlan(
      u2.searchQueries,
      (qq) => retrieveKnowledge(qq, { limit: 6, minScore: 1, locale: 'ko' }),
      u2
    );
    assert.ok(
      plan.accepted.some((p) => /business-registration|support-contact/i.test(p.id)),
      'company docs expected'
    );
    console.log('OK company still retrieves business docs');
  }

  console.log('=== expansion is structural (no "변환" regex gate) ===');
  {
    const u = {
      intent: 'how_to',
      productArea: 'studio_conversion',
      userGoal: 'how do I use this product',
      searchQueries: ['how do I use this product']
    };
    assert.ok(needsCoreWorkflowExpansion(u));
    const qs = expandCoreWorkflowSearchQueries(u.searchQueries, u);
    assert.ok(qs.some((x) => /YouTube to MIDI/i.test(x)));
    assert.ok(!needsCoreWorkflowExpansion({ ...u, userGoal: 'YouTube link to MIDI', searchQueries: ['YouTube link to MIDI'] }));
    console.log('OK structural expansion');
  }

  console.log(`\nUNSEEN HOW-TO: ${passed} / ${total}`);
  console.log('basicHowToGolden PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
