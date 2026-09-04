/**
 * Semantic generalization golden — unseen contact/company phrasings.
 * Must NOT pass via per-phrase hardcode. Asserts class of behavior only:
 * - no "OO 기능을 말씀하시는 거죠?" fallback
 * - company/contact retrieval or productArea=company
 * - no YouTube/conversion contamination after business ask
 *
 * Run: node functions/knowledge/tests/llmGeneralizationGolden.js
 */
'use strict';

const assert = require('assert');
const { extractCandidateFeatures, looksLikeInfoAsk, looksLikeCompanyContactAsk } =
  require('../../supportAiAgent/featureDiscovery');
const { understandDeterministic } = require('../../supportAiAgent/queryUnderstanding');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const {
  retrieve,
  isWeakOrConflictingRetrieval,
  detectAnswerIntent,
  ambiguousClarification,
  templateAnswer
} = require('../../supportAi');

const FEATURE_FALLBACK_RE = /기능을 말씀하시는 거죠|같은 이름으로 바로 확인이 안|화면이나 버튼 위치/i;

/** Unseen / varied phrasings — none should be special-cased in production routers. */
const CONTACT_PHRASES = [
  '사업자번호 알려줘',
  '사업자등록번호가 뭐야',
  '회사 연락처 있어?',
  '고객센터번호는?',
  '대표번호 알려줘',
  '어디로 전화하면 돼?',
  '고객지원 연락하려고',
  '전화 상담 가능해?',
  '결제 문의 어디다 해?'
];

const OUT_OF_DOMAIN = [
  { q: '환불 며칠 걸려?', forbidFallback: true },
  { q: '평생권 얼마야?', forbidFallback: true },
  { q: '30일짜리 살건데', forbidFallback: true },
  { q: '설치가 멈췄어', forbidFallback: true },
  { q: '403 뜨는데', forbidFallback: true },
  { q: '다운로드 어디서 해?', forbidFallback: true },
  { q: '최신버전 뭐야?', forbidFallback: true }
];

async function agent(question, prior = []) {
  const turns = [...prior, question];
  return runSupportAgent({
    question,
    rawQuestion: question,
    locale: 'ko',
    personal: false,
    userTurns: turns,
    priorAiReplies: [],
    turnRelation: null,
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

function answerText(question, out) {
  if (out.clarify) return out.clarify;
  const tmpl = templateAnswer(question, out.passages || [], {
    personal: false,
    lowConfidence: !!out.lowConfidence,
    wantHuman: false,
    locale: 'ko',
    clarify: out.clarify
  });
  return tmpl.text || '';
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  let pass = 0;
  let fail = 0;

  if (
    await check('info asks are never UI feature candidates', async () => {
      for (const q of CONTACT_PHRASES) {
        assert.ok(looksLikeInfoAsk(q) || looksLikeCompanyContactAsk(q), q);
        const c = extractCandidateFeatures([q]);
        assert.ok(!c.candidateFeature, `${q} → candidateFeature=${c.candidateFeature}`);
      }
    })
  )
    pass++;
  else fail++;

  if (
    await check('contact phrasings: no feature-fallback; company retrieval', async () => {
      for (const q of CONTACT_PHRASES) {
        const out = await agent(q, q.includes('고객') || q.includes('전화') || q.includes('연락') || q.includes('결제')
          ? ['사업자번호가 어떻게돼?']
          : []);
        const text = answerText(q, out);
        assert.ok(!FEATURE_FALLBACK_RE.test(text), `${q} → feature fallback: ${text}`);
        const ids = (out.passages || []).map((p) => p.id);
        const area = out.debug && out.debug.understanding && out.debug.understanding.productArea;
        const hit =
          ids.some((id) => /business-registration|support-contact/i.test(id)) ||
          area === 'company' ||
          /010-2166|332-22-02381|1:1|사업자정보|문의/i.test(text);
        assert.ok(hit, `${q} → no company/contact evidence; ids=${ids.join(',')} area=${area} text=${text.slice(0, 120)}`);
        assert.ok(
          out.debug.understanding.isUiFeatureAsk === false || area === 'company',
          `${q} should not be UI feature ask`
        );
      }
    })
  )
    pass++;
  else fail++;

  if (
    await check('follow-up after business number stays company (not feature invent)', async () => {
      const out = await agent('고객센터번호는?', ['사업자번호가 어떻게돼?']);
      const text = answerText('고객센터번호는?', out);
      assert.ok(!FEATURE_FALLBACK_RE.test(text), text);
      assert.ok(!/YouTube|유튜브|변환 실패/i.test(text), text);
      assert.ok(
        /010-2166|1:1|사업자정보|문의|연락|전화/i.test(text) ||
          (out.passages || []).some((p) => /business-registration|support-contact/i.test(p.id)),
        text
      );
    })
  )
    pass++;
  else fail++;

  if (
    await check('out-of-domain unseen phrases: never feature-fallback', async () => {
      for (const { q } of OUT_OF_DOMAIN) {
        const out = await agent(q);
        const text = answerText(q, out);
        assert.ok(!FEATURE_FALLBACK_RE.test(text), `${q} → ${text}`);
        const u = understandDeterministic({ rawQuestion: q });
        assert.ok(u.isUiFeatureAsk === false || u.productArea !== 'product_ui' || u.intent !== 'feature_explanation');
      }
    })
  )
    pass++;
  else fail++;

  console.log(`\nllmGeneralizationGolden: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
