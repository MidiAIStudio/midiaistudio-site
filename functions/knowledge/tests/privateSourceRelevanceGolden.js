/**
 * Private source relevance + raw-output guard tests.
 * Run: node functions/knowledge/tests/privateSourceRelevanceGolden.js
 */
'use strict';

const assert = require('assert');
const { buildSearchTerms } = require('../../supportAiPrivateSource/shouldUse');
const {
  scoreHitRelevance,
  evidenceMatchesQuestion,
  isRoutingLabel
} = require('../../supportAiPrivateSource/relevance');
const { looksLikeSourceDump, customerAnswerIsSafe } = require('../../supportAiPrivateSource/customerSafe');
const { resolveConversationQuery } = require('../conversationContext');
const { templateAnswer, sanitizeUserFacingText } = require('../../supportAi');

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

  await check('L sourcePlan labels not in search terms', async () => {
    const { terms } = buildSearchTerms({
      question: '편곡기능있어?',
      sourcePlan: ['operation', 'private_source', 'knowledge', 'guide']
    });
    for (const bad of ['operation', 'private_source', 'knowledge', 'guide']) {
      assert.ok(!terms.includes(bad));
      assert.ok(!isRoutingLabel('Arrange'));
      assert.ok(isRoutingLabel(bad));
    }
  });

  await check('generic single token rejected', async () => {
    const r = scoreHitRelevance({
      text: 'AI editor convert feature guide',
      path: 'lang/en.json',
      terms: ['AI'],
      question: '기능 있어?'
    });
    assert.strictEqual(r.accepted, false);
  });

  await check('Arrange evidence keeps', async () => {
    const text = '"midi_ai_instrument_arrange": "AI Instrument Arrange"';
    const r = evidenceMatchesQuestion('편곡기능있어?', text, ['Arrange', 'midi_ai_instrument_arrange']);
    assert.ok(r.ok);
  });

  await check('A 예약변환 rejects score editor', async () => {
    const text = 'score_editor_palette_lines barline tutorial localization';
    const r = evidenceMatchesQuestion('예약변환 등록', text, ['예약변환', 'scheduled conversion']);
    assert.ok(!r.ok);
  });

  await check('D conversion rejects Arrange-only', async () => {
    const text = '"midi_ai_instrument_arrange": "AI Instrument Arrange"';
    const r = evidenceMatchesQuestion('변환방법알려줘', text, ['conversion', 'youtube']);
    assert.ok(!r.ok);
  });

  await check('raw dump blocked', async () => {
    const dump =
      '"midi_ai_analyze": "AI Analyze", "midi_ai_cleanup": "AI Cleanup", "midi_ai_easy_key": "Easier Key"';
    assert.ok(looksLikeSourceDump(dump));
    assert.ok(!customerAnswerIsSafe(dump));
  });

  await check('templateAnswer ignores private grounding passages', async () => {
    const out = templateAnswer(
      '편곡기능있어?',
      [
        {
          id: 'private-source-1',
          title: 'Verified product behavior',
          text: '"midi_ai_easy_key": "Easier Key"',
          score: 18,
          sourceKind: 'private_source',
          _groundingOnly: true
        }
      ],
      { personal: false, lowConfidence: false, wantHuman: false, locale: 'ko' }
    );
    assert.ok(!looksLikeSourceDump(out.text));
    assert.ok(!/midi_ai_/.test(out.text));
  });

  await check('G topic switch 편곡 → 변환방법', async () => {
    const r = resolveConversationQuery({
      rawQuestion: '변환방법알려줘',
      priorUserTurns: ['편곡기능있어?']
    });
    assert.strictEqual(r.followUp, false);
    assert.ok(/변환/.test(r.resolvedQuestion));
    assert.ok(!/편곡/.test(r.resolvedQuestion));
  });

  await check('H follow-up keeps Arrange', async () => {
    const r = resolveConversationQuery({
      rawQuestion: '그거 어디있어?',
      priorUserTurns: ['편곡기능있어?']
    });
    assert.strictEqual(r.followUp, true);
    assert.ok(/편곡/.test(r.resolvedQuestion));
  });

  await check('sanitize still strips leftovers', async () => {
    const s = sanitizeUserFacingText('run_gui.py midi_ai_easy_key 확인', 'ko');
    assert.ok(!/run_gui\.py/.test(s));
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nprivateSourceRelevanceGolden: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
