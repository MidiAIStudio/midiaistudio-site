/**
 * Answer-quality smoke tests for Support AI template path (no live LLM required).
 * Run: node functions/knowledge/tests/answerQuality.js
 */
'use strict';

const assert = require('assert');
const { retrieveKnowledge } = require('../loadKnowledge');
const {
  templateAnswer,
  detectAnswerIntent,
  ambiguousClarification,
  sanitizeUserFacingText
} = require('../../supportAi');

const LEAK_RE =
  /listPriceKrw|salePriceKrw|durationDays|CREDIT_\d|PASS_\d|\bKnowledge\b|\bRAG\b|Firestore|권위\s*소스|featureStatus=|sourceHash/i;

function answerFor(query) {
  const locale = 'ko';
  const clarify = ambiguousClarification(query, locale);
  const passages = clarify ? [] : retrieveKnowledge(query, { limit: 4, locale });
  const raw = templateAnswer(query, passages, {
    personal: false,
    lowConfidence: !clarify && passages.length === 0,
    wantHuman: false,
    locale,
    clarify
  });
  return {
    ...raw,
    text: sanitizeUserFacingText(String(raw.text || ''), locale),
    top1: passages[0] && passages[0].id,
    intent: detectAnswerIntent(query),
    clarify: !!clarify
  };
}

function runCase(query, { expectTopic, forbidTopic, expectClarify, expectNoHandoff }) {
  const answer = answerFor(query);
  const text = String(answer.text || '');
  assert.ok(text.length > 0, `empty answer for ${query}`);
  assert.ok(!LEAK_RE.test(text), `leak in answer for ${query}: ${text.slice(0, 120)}`);

  if (expectClarify) {
    assert.ok(answer.clarify, `expected clarify flag for ${query}`);
    assert.ok(/건가요|인가요|어느 단계/.test(text), `expected clarification for ${query}, got: ${text}`);
    assert.strictEqual(!!answer.suggestHandoff, false);
  }
  if (expectTopic) {
    assert.ok(new RegExp(expectTopic, 'i').test(text), `expected /${expectTopic}/ for ${query}: ${text.slice(0, 220)}`);
  }
  if (forbidTopic) {
    assert.ok(!new RegExp(forbidTopic, 'i').test(text), `forbidden /${forbidTopic}/ for ${query}: ${text.slice(0, 220)}`);
  }
  if (expectNoHandoff) {
    assert.strictEqual(!!answer.suggestHandoff, false, `unexpected handoff for ${query}`);
  }
  if (String(query).replace(/\s+/g, '').length <= 8) {
    assert.ok(text.length < 900, `too long dump for short query ${query}`);
  }
  return { query, intent: answer.intent, top1: answer.top1, text: text.slice(0, 160) };
}

function run() {
  const cases = [
    {
      query: '고음질음원',
      expectTopic: '고품질|사운드팩|음원',
      forbidTopic: 'MP3|WAV|M4A|WEBM|로컬 오디오',
      expectNoHandoff: true
    },
    {
      query: '템포',
      expectTopic: '템포|BPM',
      forbidTopic: '1/4|변환 진행',
      expectNoHandoff: true
    },
    {
      query: '미리듣기 구간',
      expectTopic: '구간|파형|핸들|미리듣기',
      forbidTopic: 'YouTube URL을 넣',
      expectNoHandoff: true
    },
    {
      query: 'PDF 내보내기',
      expectTopic: 'PDF|내보내',
      forbidTopic: '악보를 인식해 MIDI',
      expectNoHandoff: true
    },
    {
      query: '오디오를 MIDI로',
      expectTopic: '오디오|MIDI|MP3|변환',
      forbidTopic: '사운드팩|Use high-quality',
      expectNoHandoff: true
    },
    { query: '속도', expectClarify: true },
    { query: '소리', expectClarify: true },
    { query: 'PDF', expectClarify: true }
  ];

  const out = cases.map((c) => runCase(c.query, c));
  console.log('[ANSWER QUALITY]');
  console.log(JSON.stringify({ pass: out.length, samples: out }, null, 2));
}

if (require.main === module) {
  run();
}

module.exports = { run, answerFor };
