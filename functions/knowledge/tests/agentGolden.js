/**
 * Support AI agent behavior golden tests (low-confidence policy).
 *
 * Run: node functions/knowledge/tests/agentGolden.js
 *
 * These tests mock all retrieval sources. No Firestore/live data is needed.
 */
'use strict';

const assert = require('assert');

const { applyLowConfidencePolicy } = require('../../supportAiAgent/lowConfidencePolicy');
const { generateDiagnosticClarifyQuestion } = require('../../supportAiAgent/diagnosticQuestion');

const {
  templateAnswer,
  sanitizeUserFacingText,
  isWeakOrConflictingRetrieval,
  detectAnswerIntent,
  collectUserTurns,
  resolveConversationQuery
} = require('../../supportAi');

const LEAK_RE =
  /listPriceKrw|salePriceKrw|durationDays|CREDIT_\d|PASS_\d|\bKnowledge\b|\bRAG\b|Firestore|권위\s*소스|featureStatus=|sourceHash|internal\s+knowledge|LIVE\s+SELLABLE|api\s*key/i;

function sanitizeForLocale(text, locale = 'ko') {
  return sanitizeUserFacingText(String(text || ''), locale);
}

function makePassage({
  id,
  score = 20,
  title = 'Doc',
  href = '/doc',
  category = '',
  summary = '',
  details = '',
  steps = []
} = {}) {
  return {
    id,
    score,
    priority: 2,
    title,
    href,
    category,
    visibility: 'public',
    verification: 'verified',
    featureStatus: 'production',
    summary,
    details,
    steps,
    fixSteps: []
  };
}

function assertNoHandoffAndNoLeak(text, { locale = 'ko' } = {}) {
  const clean = sanitizeForLocale(text, locale);
  assert.strictEqual(/(상담사|오페레이터|counselor|human|operator)/i.test(clean), false, `unexpected handoff wording: ${clean}`);
  assert.strictEqual(LEAK_RE.test(clean), false, `leak in output: ${clean.slice(0, 140)}`);
  return clean;
}

async function runLowConfidenceToDiagnostic() {
  const rawQuestion = '처음 보는 화면에서 뭔가가 안돼요';
  const question = rawQuestion;
  const locale = 'ko';
  const intent = detectAnswerIntent(question);

  const policy = await applyLowConfidencePolicy({
    question,
    rawQuestion,
    locale,
    intent,
    personal: false,
    clarifyExisting: null,
    passages: [],
    maxResearchActions: 3,
    adapters: {
      retrieveStatic: async () => [],
      loadLiveFaq: async () => [],
      loadLiveCatalog: async () => []
    },
    isWeakOrConflictingRetrieval,
    generateDiagnosticClarifyQuestion
  });

  assert.strictEqual(policy.lowConfidence, true, 'expected lowConfidence');
  assert.ok(typeof policy.clarify === 'string' && policy.clarify.length > 0, 'expected diagnostic clarify');

  const answer = templateAnswer(question, policy.passages, {
    personal: false,
    lowConfidence: policy.lowConfidence && !policy.clarify,
    wantHuman: false,
    locale,
    clarify: policy.clarify
  });

  const clean = assertNoHandoffAndNoLeak(answer.text, { locale });
  assert.ok(/단계|어떤 작업|막히|오류/i.test(clean), `expected diagnostic stage phrasing: ${clean}`);
  assert.ok(answer.suggestHandoff === false, 'diagnostic must not handoff');
}

async function runDiagnosticThenEvidenceAnswer() {
  const question1 = '처음 보는 화면에서 뭔가가 안돼요';
  const locale = 'ko';
  const intent1 = detectAnswerIntent(question1);

  const policy1 = await applyLowConfidencePolicy({
    question: question1,
    rawQuestion: question1,
    locale,
    intent: intent1,
    personal: false,
    clarifyExisting: null,
    passages: [],
    maxResearchActions: 3,
    adapters: {
      retrieveStatic: async () => [],
      loadLiveFaq: async () => [],
      loadLiveCatalog: async () => []
    },
    isWeakOrConflictingRetrieval,
    generateDiagnosticClarifyQuestion
  });

  assert.ok(policy1.clarify, 'expected diagnostic');

  const question2 = '설치 단계에서 막혀요';
  const intent2 = detectAnswerIntent(question2);
  const evidencePassages = [
    makePassage({
      id: 'getting-started-install',
      score: 30,
      title: 'Getting Started (Install)',
      href: '/docs',
      category: 'installation',
      summary: '설치 과정은 다운로드 → 설치 → 로그인 순서로 진행됩니다.',
      steps: ['미디AI 스튜디오를 최신 버전으로 다운로드하세요.', '설치 프로그램을 실행한 뒤 안내대로 완료합니다.']
    })
  ];

  const policy2 = await applyLowConfidencePolicy({
    question: question2,
    rawQuestion: question2,
    locale,
    intent: intent2,
    personal: false,
    clarifyExisting: null,
    passages: evidencePassages,
    maxResearchActions: 3,
    adapters: {
      retrieveStatic: async () => [],
      loadLiveFaq: async () => [],
      loadLiveCatalog: async () => []
    },
    isWeakOrConflictingRetrieval,
    generateDiagnosticClarifyQuestion
  });

  assert.strictEqual(policy2.lowConfidence, false, 'expected enough evidence');
  assert.strictEqual(policy2.clarify, null, 'expected no diagnostic');

  const answer = templateAnswer(question2, policy2.passages, {
    personal: false,
    lowConfidence: policy2.lowConfidence && !policy2.clarify,
    wantHuman: false,
    locale,
    clarify: policy2.clarify
  });

  const clean = assertNoHandoffAndNoLeak(answer.text, { locale });
  assert.ok(clean.includes('설치 과정'), `expected evidence summary, got: ${clean.slice(0, 140)}`);
  assert.ok(answer.suggestHandoff === false, 'evidence answer must not handoff');
}

async function runMultiSourceResearchMerge() {
  const question = '완전 처음 보는 주제인데 답이 필요해요';
  const locale = 'ko';
  const intent = detectAnswerIntent(question); // general

  const initialPassages = [
    makePassage({
      id: 'getting-started-install',
      score: 2,
      title: 'Install',
      href: '/docs',
      category: 'installation',
      summary: '관련 없어 보이는 설치 문서 요약(약한 신호).',
      steps: []
    })
  ];

  let faqCalled = false;
  const policy = await applyLowConfidencePolicy({
    question,
    rawQuestion: question,
    locale,
    intent,
    personal: false,
    clarifyExisting: null,
    passages: initialPassages,
    maxResearchActions: 3,
    adapters: {
      retrieveStatic: async () => [],
      loadLiveFaq: async () => {
        faqCalled = true;
        return [
          makePassage({
            id: 'faq-123',
            score: 25,
            title: 'FAQ: Something',
            href: '/faq.html',
            category: '',
            summary: 'FAQ 근거로 답변할 수 있습니다.',
            steps: []
          })
        ];
      },
      loadLiveCatalog: async () => []
    },
    isWeakOrConflictingRetrieval,
    generateDiagnosticClarifyQuestion
  });

  assert.strictEqual(faqCalled, true, 'expected live FAQ research to run');
  assert.strictEqual(policy.lowConfidence, false, 'expected evidence to become sufficient after merge');
  assert.strictEqual(policy.clarify, null, 'expected no diagnostic clarify after evidence');

  const ids = (policy.passages || []).map((p) => p.id);
  assert.ok(ids.includes('faq-123'), `expected merged faq evidence, got ids=${ids.join(', ')}`);
  assert.ok(ids.includes('getting-started-install'), `expected initial static evidence preserved, got ids=${ids.join(', ')}`);

  const answer = templateAnswer(question, policy.passages, {
    personal: false,
    lowConfidence: policy.lowConfidence && !policy.clarify,
    wantHuman: false,
    locale,
    clarify: policy.clarify
  });
  assertNoHandoffAndNoLeak(answer.text, { locale });
}

function runNoPoisoningFollowUpTest() {
  const ticket = { content: '고품질 음원이 뭐야?' };
  const replies = [
    { role: 'user', content: '설치방법이 궁금해' },
    { role: 'ai', content: '어느 단계에서 문제가 생기나요? (설치/변환/재생 중)' },
    { role: 'user', content: '설치 단계에서요' }
  ];

  const turns = collectUserTurns(ticket, replies);
  assert.deepStrictEqual(turns, ['고품질 음원이 뭐야?', '설치방법이 궁금해', '설치 단계에서요']);

  const resolved = resolveConversationQuery({
    rawQuestion: '설치 단계에서요',
    priorUserTurns: ['고품질 음원이 뭐야?', '설치방법이 궁금해']
  });
  assert.ok(!/문제가 생기나요|어느 단계에서/i.test(resolved.resolvedQuestion), 'AI diagnostic text leaked into resolution');
}

async function run() {
  const cases = [
    ['unknown_novel_triggers_diagnostic', runLowConfidenceToDiagnostic],
    ['diagnostic_follow_up_returns_evidence_answer', runDiagnosticThenEvidenceAnswer],
    ['bounded_research_merges_static_plus_live_faq', runMultiSourceResearchMerge],
    ['follow_up_no_poisoning', runNoPoisoningFollowUpTest]
  ];

  let failed = 0;
  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${name}: ${err && err.message}`);
    }
  }

  console.log(`\nagentGolden: ${cases.length - failed}/${cases.length} cases`);
  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = { run };

