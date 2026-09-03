/**
 * Multi-turn Support AI conversation golden tests.
 * Asserts USER-only topic carry-forward, topic switch, and no AI-history poisoning.
 *
 * Run: node functions/knowledge/tests/conversationGolden.js
 */
'use strict';

const assert = require('assert');
const {
  resolveConversationQuery,
  collectUserTurns
} = require('../conversationContext');
const {
  retrieve,
  isWeakOrConflictingRetrieval,
  ambiguousClarification
} = require('../../supportAi');

const SOUND_ACCEPT = ['high-quality-sound-ops', 'high-quality-sounds'];
const TEMPO_ACCEPT = ['midi-editor-tempo', 'midi-editor'];
const PREVIEW_ACCEPT = ['studio-preview-range', 'studio-preview-playback'];
const PDF_ACCEPT = ['pdf-to-midi'];
const AUDIO_FAIL_ACCEPT = [
  'youtube-fetch-errors',
  'conversion-generic-failure',
  'audio-to-midi',
  'troubleshooting-basics'
];
const EASY_KEY_ACCEPT = ['easier-key', 'ai-assistant-ops', 'ai-assistant'];

function topIds(passages, n = 3) {
  return (passages || []).slice(0, n).map((p) => p.id);
}

function assertAccept(passages, accept, label) {
  const ids = topIds(passages, 4);
  const hit = ids.some((id) => accept.includes(id));
  assert.ok(hit, `${label}: expected one of [${accept}] in top ${ids.join(', ') || '(none)'}`);
}

function assertForbidden(passages, forbidden, label) {
  const top = passages && passages[0];
  if (!top) return;
  assert.ok(
    !forbidden.includes(top.id),
    `${label}: forbidden top hit ${top.id}`
  );
}

function resolveTurns(turns) {
  const prior = turns.slice(0, -1);
  const raw = turns[turns.length - 1];
  return resolveConversationQuery({ rawQuestion: raw, priorUserTurns: prior });
}

function retrieveResolved(turns) {
  const r = resolveTurns(turns);
  const passages = retrieve(r.resolvedQuestion, 4, { includeInternal: false, locale: 'ko' });
  const weak = isWeakOrConflictingRetrieval(passages);
  return { ...r, passages, weak, lowConfidence: weak || !passages.length };
}

const cases = [
  {
    name: 'A soundpack install follow-up',
    turns: ['고품질 음원이 뭐야?', '설치는?'],
    expectResolved: /고품질|음원|설치/,
    accept: SOUND_ACCEPT,
    forbidTop: ['audio-to-midi', 'youtube-to-midi'],
    noLowConfidence: true
  },
  {
    name: 'B tempo where follow-up',
    turns: ['템포 변경하고 싶어', '어디 있어?'],
    expectResolved: /템포|어디/,
    accept: TEMPO_ACCEPT,
    noLowConfidence: true
  },
  {
    name: 'C preview range reset',
    turns: ['미리듣기 구간 변경 방법', '초기화는?'],
    expectResolved: /미리\s*듣|구간|초기화/,
    accept: PREVIEW_ACCEPT,
    noLowConfidence: true
  },
  {
    name: 'D PDF how follow-up',
    turns: ['PDF 악보를 MIDI로 바꾸고 싶어', '어떻게?'],
    expectResolved: /PDF|사용 방법|어떻게/,
    accept: PDF_ACCEPT,
    noLowConfidence: true
  },
  {
    name: 'E audio conversion failure fix',
    turns: ['오디오 변환하다 실패했어', '해결방법은?'],
    expectResolved: /오디오|해결/,
    accept: ['conversion-generic-failure', 'audio-to-midi', 'troubleshooting-basics', 'youtube-fetch-errors'],
    noLowConfidence: true
  },
  {
    name: 'F production repro: audio download fail → explain feature',
    turns: ['오디오 다운로드 실패뜨는데', '기능설명해줘'],
    expectResolved: /오디오|다운로드|기능/,
    accept: AUDIO_FAIL_ACCEPT,
    forbidTop: ['getting-started', 'install-update', 'credits-usage'],
    noLowConfidence: true,
    followUp: true
  },
  {
    name: 'G topic switch soundpack → tempo',
    turns: ['고품질 음원 설치 알려줘', '템포 변경 방법은?'],
    expectResolved: /^템포/,
    accept: TEMPO_ACCEPT,
    forbidTop: SOUND_ACCEPT,
    followUp: false,
    noLowConfidence: true
  },
  {
    name: 'H bad AI history must not poison (user turns only)',
    turns: ['고음질음원', '설치방법은?'],
    // Simulated AI wrong answer is NOT passed into resolver
    expectResolved: /고음질|고품질|음원|설치/,
    accept: SOUND_ACCEPT,
    forbidTop: ['audio-to-midi', 'youtube-to-midi'],
    noLowConfidence: true
  },
  {
    name: 'I Easy Key pronoun follow-up',
    turns: ['Easy Key가 뭐야?', '그거 어떻게 써?'],
    expectResolved: /Easy|쉬운|사용/,
    accept: EASY_KEY_ACCEPT,
    noLowConfidence: true
  },
  {
    name: 'J ambiguous pivot 소리 does not keep tempo',
    turns: ['템포', '그리고 소리는?'],
    expectResolved: /^소리$/,
    expectAmbiguous: true,
    followUp: false
  },
  {
    name: 'K 403 why follow-up',
    turns: ['403 떠', '왜?'],
    expectResolved: /403|원인/,
    accept: ['youtube-fetch-errors', 'troubleshooting-basics'],
    noLowConfidence: true
  }
];

let failed = 0;
const results = [];

for (const c of cases) {
  try {
    const out = retrieveResolved(c.turns);
    if (c.expectResolved) {
      assert.ok(
        c.expectResolved.test(out.resolvedQuestion),
        `resolved "${out.resolvedQuestion}" !~ ${c.expectResolved}`
      );
    }
    if (c.followUp === true) assert.strictEqual(out.followUp, true, 'expected followUp');
    if (c.followUp === false) assert.strictEqual(out.followUp, false, 'expected standalone/switch');
    if (c.expectAmbiguous) {
      const clarify = ambiguousClarification(out.resolvedQuestion, 'ko');
      assert.ok(clarify, `expected clarification for ${out.resolvedQuestion}`);
    }
    if (c.accept) assertAccept(out.passages, c.accept, c.name);
    if (c.forbidTop) assertForbidden(out.passages, c.forbidTop, c.name);
    if (c.noLowConfidence) {
      assert.ok(!out.lowConfidence, `${c.name}: unexpected lowConfidence; top=${topIds(out.passages).join(',')}`);
    }
    results.push({ name: c.name, ok: true, resolved: out.resolvedQuestion, top: topIds(out.passages, 2) });
    console.log(`PASS  ${c.name}\n      resolved=${out.resolvedQuestion}\n      top=${topIds(out.passages, 2).join(', ')}`);
  } catch (err) {
    failed += 1;
    results.push({ name: c.name, ok: false, error: err.message });
    console.error(`FAIL  ${c.name}: ${err.message}`);
  }
}

// collectUserTurns must ignore AI roles
{
  const turns = collectUserTurns(
    { content: '고음질음원' },
    [
      { role: 'user', content: '고음질음원' },
      { role: 'ai', content: 'Audio → MIDI 변환 기능입니다.' },
      { role: 'user', content: '설치방법은?' }
    ]
  );
  assert.deepStrictEqual(turns, ['고음질음원', '설치방법은?']);
  const r = resolveConversationQuery({
    rawQuestion: '설치방법은?',
    priorUserTurns: ['고음질음원']
  });
  assert.ok(/음원|설치/.test(r.resolvedQuestion));
  assert.ok(!/Audio|MIDI 변환/.test(r.resolvedQuestion));
  console.log('PASS  AI history ignored for topic');
}

console.log(`\nconversationGolden: ${cases.length - failed}/${cases.length} cases + poison guard`);
if (failed) process.exit(1);
