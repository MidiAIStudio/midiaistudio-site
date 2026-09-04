/**
 * Turn routing / topic shift / correction golden E2E (agent + resolve path).
 * Run: node functions/knowledge/tests/turnRoutingGolden.js
 */
'use strict';

const assert = require('assert');
const { resolveConversationQuery } = require('../conversationContext');
const {
  classifyTurnRelation,
  resolveTurnQuery,
  RELATION
} = require('../../supportAiAgent/turnRelation');
const { understandDeterministic } = require('../../supportAiAgent/queryUnderstanding');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const {
  retrieve,
  isWeakOrConflictingRetrieval,
  detectAnswerIntent,
  ambiguousClarification,
  templateAnswer,
  formatCustomerCatalogText
} = require('../../supportAi');

function topIds(passages, n = 4) {
  return (passages || []).slice(0, n).map((p) => p.id);
}

async function agentForTurns(turns, opts = {}) {
  const prior = turns.slice(0, -1);
  const raw = turns[turns.length - 1];
  const priorAi = opts.priorAiReplies || [];
  const turn = resolveTurnQuery({
    rawQuestion: raw,
    priorUserTurns: prior,
    priorAiReplies: priorAi,
    legacyResolve: resolveConversationQuery
  });
  const out = await runSupportAgent({
    question: turn.resolvedQuestion,
    rawQuestion: raw,
    locale: 'ko',
    personal: false,
    userTurns: turn.turnsForUnderstanding || [raw],
    priorAiReplies:
      turn.relation === RELATION.CORRECTION
        ? priorAi.slice(-1)
        : turn.relation === RELATION.TOPIC_SHIFT
          ? []
          : priorAi,
    turnRelation: turn,
    clarifyEarly: null,
    adapters: {
      retrieveStatic: async ({ question: q, limit }) =>
        retrieve(q, limit || 4, { includeInternal: false, locale: 'ko' }),
      loadLiveFaq: async () => [],
      loadLiveCatalog: async ({ question: q }) => {
        if (!/(가격|얼마|크레딧|충전|할인|이벤트|구매|이용권)/i.test(String(q || ''))) return [];
        return [
          {
            id: 'live-catalog',
            title: '현재 판매 상품',
            href: '/purchase.html',
            text: 'mock',
            score: 30,
            customerSafeProducts: [
              { displayName: '크레딧 10', priceKrw: 7900, priceLabel: '7,900원', creditAmount: 10, listPriceKrw: 7900 },
              { displayName: '30일 이용권', priceKrw: 29900, priceLabel: '29,900원', listPriceKrw: 29900 },
              { displayName: '90일 이용권', priceKrw: 69900, priceLabel: '69,900원', listPriceKrw: 69900 },
              { displayName: 'Lifetime', priceKrw: 130000, priceLabel: '130,000원', listPriceKrw: 130000 }
            ]
          }
        ];
      },
      loadLiveRelease: async () => [],
      loadLiveNotice: async () => [],
      loadLiveGuide: async () => [],
      searchPrivateSource: async () => ({ passages: [], debug: {} })
    },
    retrieveStaticInitial: ({ limit, question: q }) =>
      retrieve(q || turn.resolvedQuestion, limit || 4, { includeInternal: false, locale: 'ko' }),
    isWeakOrConflictingRetrieval,
    detectAnswerIntent,
    ambiguousClarification,
    UNKNOWN_ERROR_RE: /[A-Z]{2,}[-_]?\d{2,}/,
    callLlm: null
  });
  return { turn, out, raw };
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
    return true;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  let pass = 0;
  let fail = 0;

  if (
    await check('SEQ1: 403 follow-up after conversion failure', async () => {
      const { turn, out } = await agentForTurns(['변환실패떠', '403에러인데']);
      assert.ok(
        turn.relation === RELATION.FOLLOW_UP || turn.relation === RELATION.CONTINUE,
        `expected FOLLOW_UP/CONTINUE got ${turn.relation}`
      );
      const ids = topIds(out.passages);
      assert.ok(
        ids.some((id) => /youtube-fetch|conversion-generic|troubleshooting/i.test(id)),
        `expected 403/conversion docs, got ${ids}`
      );
    })
  )
    pass++;
  else fail++;

  if (
    await check('SEQ1: 사업자번호 TOPIC_SHIFT — no YouTube answer', async () => {
      const { turn, out } = await agentForTurns(['변환실패떠', '403에러인데', '사업자번호가어떻게돼']);
      assert.strictEqual(turn.relation, RELATION.TOPIC_SHIFT);
      assert.strictEqual(turn.resolvedQuestion, '사업자번호가어떻게돼');
      assert.ok(!turn.carriedTopic, 'must not carry prior topic');
      const ids = topIds(out.passages);
      assert.ok(
        !ids.some((id) => /youtube|conversion/i.test(id)),
        `YouTube/conversion must not top retrieval: ${ids}`
      );
      assert.ok(
        ids.includes('business-registration') ||
          (out.debug && out.debug.understanding && out.debug.understanding.intent === 'business_registration_number'),
        `expected business intent/doc, got ids=${ids} intent=${out.debug && out.debug.understanding && out.debug.understanding.intent}`
      );
      const tmpl = templateAnswer('사업자번호가어떻게돼', out.passages, {
        personal: false,
        lowConfidence: false,
        wantHuman: false,
        locale: 'ko'
      });
      assert.ok(!/YouTube|유튜브|오디오를 가져오/i.test(tmpl.text), tmpl.text);
      assert.ok(/332-22-02381|사업자/i.test(tmpl.text), tmpl.text);
    })
  )
    pass++;
  else fail++;

  if (
    await check('SEQ2: credit recharge → purchase_method not definition', async () => {
      const { turn, out } = await agentForTurns(['크레딧좀 충전하려고하는데']);
      const intent = out.debug.understanding.intent;
      assert.strictEqual(intent, 'purchase_method');
      const tmpl = templateAnswer(turn.resolvedQuestion, out.passages, {
        personal: false,
        lowConfidence: false,
        wantHuman: false,
        locale: 'ko'
      });
      assert.ok(!/횟수 단위입니다/i.test(tmpl.text), `definition leak: ${tmpl.text}`);
      assert.ok(/구매|충전|결제/i.test(tmpl.text), tmpl.text);
    })
  )
    pass++;
  else fail++;

  if (
    await check('SEQ2: credit 10 price — direct answer first', async () => {
      const { turn, out } = await agentForTurns(['크레딧좀 충전하려고하는데', '크레딧 10개얼마야']);
      assert.ok(
        turn.relation === RELATION.CONTINUE || turn.relation === RELATION.FOLLOW_UP,
        turn.relation
      );
      assert.strictEqual(out.debug.understanding.intent, 'price_lookup');
      const tmpl = templateAnswer('크레딧 10개얼마야', out.passages, {
        personal: false,
        lowConfidence: false,
        wantHuman: false,
        locale: 'ko'
      });
      assert.ok(/^크레딧 10개는 7,900원/.test(tmpl.text.trim()), tmpl.text);
      assert.ok(!/현재 구매할 수 있는 상품은 다음과 같습니다/i.test(tmpl.text), tmpl.text);
    })
  )
    pass++;
  else fail++;

  if (
    await check('SEQ2: discount follow-up — not patch notes', async () => {
      const { turn, out } = await agentForTurns([
        '크레딧좀 충전하려고하는데',
        '크레딧 10개얼마야',
        '할인이벤트있어?'
      ]);
      assert.ok(
        [RELATION.CONTINUE, RELATION.FOLLOW_UP].includes(turn.relation),
        turn.relation
      );
      assert.strictEqual(out.debug.understanding.intent, 'promotion_discount');
      assert.notStrictEqual(out.debug.need, 'release');
      const tmpl = templateAnswer('할인이벤트있어?', out.passages, {
        personal: false,
        lowConfidence: false,
        wantHuman: false,
        locale: 'ko'
      });
      assert.ok(/할인|이벤트|프로모션|구매 페이지/i.test(tmpl.text), tmpl.text);
      assert.ok(!/패치|업데이트|릴리스/i.test(tmpl.text), tmpl.text);
      assert.ok(!/현재 구매할 수 있는 상품은 다음과 같습니다/i.test(tmpl.text), tmpl.text);
    })
  )
    pass++;
  else fail++;

  if (
    await check('SEQ2: 그게아닌데 = CORRECTION on last exchange only', async () => {
      const priorAi = [
        'YouTube 안내',
        '사업자등록번호는 332-22-02381입니다.',
        '현재 확인된 할인 이벤트는 없습니다.'
      ];
      const { turn } = await agentForTurns(
        [
          '변환실패떠',
          '403에러인데',
          '사업자번호가어떻게돼',
          '크레딧좀 충전하려고하는데',
          '크레딧 10개얼마야',
          '할인이벤트있어?',
          '그게아닌데'
        ],
        { priorAiReplies: priorAi }
      );
      assert.strictEqual(turn.relation, RELATION.CORRECTION);
      assert.ok(/할인이벤트/i.test(turn.resolvedQuestion), turn.resolvedQuestion);
      assert.ok(!/사업자/i.test(turn.carriedTopic || ''), turn.carriedTopic);
      assert.deepStrictEqual(turn.turnsForUnderstanding.slice(-1), ['그게아닌데']);
      assert.ok(turn.turnsForUnderstanding.includes('할인이벤트있어?'));
    })
  )
    pass++;
  else fail++;

  if (
    await check('SEQ2: 비밀키 TOPIC_SHIFT — not catalog', async () => {
      const { turn, out } = await agentForTurns([
        '크레딧좀 충전하려고하는데',
        '크레딧 10개얼마야',
        '비밀키가어떻게돼'
      ]);
      assert.strictEqual(turn.relation, RELATION.TOPIC_SHIFT);
      const intent = out.debug.understanding.intent;
      assert.ok(
        /credential|secret|api_key|license_key/i.test(intent),
        `security intent expected, got ${intent}`
      );
      assert.ok(!out.passages.some((p) => String(p.id).startsWith('live-catalog')));
    })
  )
    pass++;
  else fail++;

  if (
    await check('resolve: 사업자번호 not follow-up carry', async () => {
      const r = resolveConversationQuery({
        rawQuestion: '사업자번호가어떻게돼',
        priorUserTurns: ['변환실패떠', '403에러인데']
      });
      assert.strictEqual(r.followUp, false);
      assert.strictEqual(r.resolvedQuestion, '사업자번호가어떻게돼');
    })
  )
    pass++;
  else fail++;

  if (
    await check('formatCustomerCatalogText direct credit price', async () => {
      const text = formatCustomerCatalogText(
        [{ displayName: '크레딧 10', priceKrw: 7900, priceLabel: '7,900원', creditAmount: 10 }],
        'ko',
        { focusCreditAmount: 10 }
      );
      assert.strictEqual(text, '크레딧 10개는 7,900원입니다.');
    })
  )
    pass++;
  else fail++;

  if (
    await check('understandDeterministic commerce granularity', async () => {
      assert.strictEqual(
        understandDeterministic({ rawQuestion: '크레딧좀 충전하려고하는데' }).intent,
        'purchase_method'
      );
      assert.strictEqual(
        understandDeterministic({ rawQuestion: '크레딧 10개얼마야' }).intent,
        'price_lookup'
      );
      assert.strictEqual(
        understandDeterministic({ rawQuestion: '할인이벤트있어?' }).intent,
        'promotion_discount'
      );
      assert.strictEqual(
        understandDeterministic({ rawQuestion: '사업자번호가어떻게돼' }).intent,
        'business_registration_number'
      );
    })
  )
    pass++;
  else fail++;

  console.log(`\nturnRoutingGolden: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
