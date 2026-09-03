/**
 * Unknown feature discovery + diagnostic-loop regression golden.
 * Run: node functions/knowledge/tests/featureDiscoveryGolden.js
 */
'use strict';

const assert = require('assert');
const { extractCandidateFeatures, isGenericTaskDiagnostic } = require('../../supportAiAgent/featureDiscovery');
const { extractUserFacts } = require('../../supportAiAgent/userFacts');
const { runSupportAgent } = require('../../supportAiAgent/runAgent');
const { isWeakOrConflictingRetrieval, detectAnswerIntent, templateAnswer } = require('../../supportAi');

function passage(p) {
  return {
    priority: 2,
    href: '/x',
    visibility: 'public',
    verification: 'verified',
    featureStatus: 'production',
    summary: p.summary || p.title || '',
    details: p.details || '',
    steps: [],
    fixSteps: [],
    ...p
  };
}

function emptyAdapters(overrides = {}) {
  return {
    retrieveStatic: async () => [],
    loadLiveFaq: async () => [],
    loadLiveCatalog: async () => [],
    loadLiveRelease: async () => [],
    loadLiveNotice: async () => [],
    loadLiveGuide: async () => [],
    ...overrides
  };
}

async function agent(opts) {
  return runSupportAgent({
    question: opts.question,
    rawQuestion: opts.rawQuestion || opts.question,
    locale: 'ko',
    personal: false,
    userTurns: opts.userTurns || [opts.rawQuestion || opts.question],
    priorAiReplies: opts.priorAiReplies || [],
    clarifyEarly: opts.clarifyEarly || null,
    adapters: emptyAdapters(opts.adapters || {}),
    retrieveStaticInitial: opts.retrieveStaticInitial || (() => []),
    isWeakOrConflictingRetrieval,
    detectAnswerIntent,
    UNKNOWN_ERROR_RE: /[A-Z]{2,}[-_]?\d{2,}/,
    callLlm: opts.callLlm || null
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

  await check('A 예약변환 등록방법 → featureCandidate + discovery, no generic diag', async () => {
    const searched = [];
    const out = await agent({
      question: '예약변환 등록방법',
      userTurns: ['예약변환 등록방법'],
      retrieveStaticInitial: () => [],
      adapters: {
        retrieveStatic: async ({ question }) => {
          searched.push(`static:${question}`);
          return [];
        },
        loadLiveGuide: async ({ question }) => {
          searched.push(`guide:${question}`);
          return [];
        },
        loadLiveFaq: async ({ question }) => {
          searched.push(`faq:${question}`);
          return [];
        }
      }
    });
    assert.ok(out.debug.candidateFeature, 'expected candidateFeature');
    assert.ok(/예약변환/.test(out.debug.candidateFeature), out.debug.candidateFeature);
    assert.ok(out.debug.discoveryTriggered, 'discovery should trigger');
    assert.ok((out.debug.discoverySources || []).length >= 1, 'discovery sources called');
    assert.ok(out.clarify, 'clarify after miss');
    assert.ok(!isGenericTaskDiagnostic(out.clarify), `generic diag forbidden: ${out.clarify}`);
    assert.ok(out.clarify.includes('예약변환') || /화면|메뉴|버튼/.test(out.clarify), out.clarify);
    assert.ok(searched.some((s) => /예약변환/.test(s)), `search used candidate: ${searched.join(',')}`);
  });

  await check('B multi-turn: no repeated generic 어떤 작업', async () => {
    const t1 = await agent({
      question: '검색은 했는데 예약변환하려고',
      userTurns: ['검색은 했는데 예약변환하려고'],
      retrieveStaticInitial: () => []
    });
    assert.ok(t1.debug.candidateFeature);
    assert.ok(!isGenericTaskDiagnostic(t1.clarify || ''), t1.clarify);

    const t2 = await agent({
      question: '예약변환 등록방법',
      userTurns: ['검색은 했는데 예약변환하려고', '예약변환 등록방법'],
      priorAiReplies: [
        t1.clarify || '어떤 작업을 하려는 건지, 그리고 어느 단계에서 막혔는지 한 줄로 알려주세요.'
      ],
      retrieveStaticInitial: () => []
    });
    assert.ok(t2.debug.candidateFeature);
    assert.ok(t2.clarify, 'expected targeted clarify');
    assert.ok(!isGenericTaskDiagnostic(t2.clarify), `repeat generic FAIL: ${t2.clarify}`);
    assert.ok(
      t2.debug.diagnosticRepeatPrevented || !isGenericTaskDiagnostic(t2.clarify),
      'repeat prevention'
    );
    assert.ok(/예약변환/.test(t2.clarify), t2.clarify);
  });

  await check('C existing unknown-style operation term → discovery answer', async () => {
    const out = await agent({
      question: '구간저장 어떻게 해',
      userTurns: ['구간저장 어떻게 해'],
      retrieveStaticInitial: () => [],
      adapters: {
        retrieveStatic: async ({ question }) => {
          if (/구간저장|구간/.test(question)) {
            return [
              passage({
                id: 'studio-preview-range',
                score: 10,
                category: 'studio_ops',
                sourceKind: 'operation',
                title: '미리듣기 구간',
                summary: 'Studio 파형에서 시작·끝 핸들로 변환 구간을 저장·조정합니다.',
                aliases: ['구간', '미리듣기 구간']
              })
            ];
          }
          return [];
        }
      }
    });
    assert.ok(out.debug.discoveryTriggered || (out.debug.sourcesSearched || []).length);
    assert.ok(
      !out.clarify || out.passages.some((p) => p.id === 'studio-preview-range'),
      'should answer from discovered ops or not invent'
    );
    if (!out.clarify) {
      assert.ok(out.passages.some((p) => p.id === 'studio-preview-range'));
      assert.strictEqual(out.debug.finalAction, 'ANSWER');
    }
  });

  await check('D nonexistent feature → no hallucination + targeted clarify', async () => {
    const out = await agent({
      question: '퀀텀폴드 등록방법',
      userTurns: ['퀀텀폴드 등록방법'],
      retrieveStaticInitial: () => [],
      adapters: {
        retrieveStatic: async () => [
          passage({
            id: 'audio-to-midi',
            score: 6,
            title: '오디오 변환',
            summary: '오디오를 MIDI로 변환합니다.'
          })
        ]
      }
    });
    assert.ok(out.debug.candidateFeature);
    assert.ok(out.clarify, 'must clarify, not invent');
    assert.ok(!/퀀텀폴드는 .{0,20}(기능입니다|할 수 있습니다|메뉴에서)/.test(out.clarify));
    const ans = templateAnswer('퀀텀폴드 등록방법', out.passages, {
      personal: false,
      lowConfidence: true,
      wantHuman: false,
      locale: 'ko',
      clarify: out.clarify
    });
    assert.ok(!/퀀텀폴드를 사용하려면|퀀텀폴드 기능/.test(ans.text));
    assert.ok(!isGenericTaskDiagnostic(out.clarify), out.clarify);
  });

  await check('E 10 arbitrary feature-name variants → discovery path', async () => {
    const variants = [
      '자동정리 어디있어',
      '구간저장 어떻게 해',
      '트랙합치기 돼?',
      '일괄변환 있나?',
      '예약 작업 취소는?',
      '배치내보내기 방법',
      '스마트분할 등록방법',
      '웨이브마커 어디있어',
      '클립고정 어떻게 해',
      '타임락 있나?'
    ];
    let ok = 0;
    for (const q of variants) {
      const extracted = extractCandidateFeatures([q]);
      assert.ok(extracted.candidateFeature, `extract fail: ${q}`);
      const searched = [];
      const out = await agent({
        question: q,
        userTurns: [q],
        retrieveStaticInitial: () => [],
        adapters: {
          retrieveStatic: async ({ question }) => {
            searched.push(question);
            return [];
          },
          loadLiveGuide: async () => {
            searched.push('guide');
            return [];
          }
        }
      });
      assert.ok(out.debug.candidateFeature, q);
      assert.ok(out.debug.discoveryTriggered, `discovery: ${q}`);
      assert.ok((out.debug.sourcesSearched || []).length >= 1 || searched.length >= 1, q);
      assert.ok(!isGenericTaskDiagnostic(out.clarify || ''), `${q} → ${out.clarify}`);
      ok += 1;
    }
    assert.strictEqual(ok, 10);
  });

  await check('F new USER fact after diagnostic → same family not repeated', async () => {
    const generic =
      '어떤 작업을 하려는 건지, 그리고 어느 단계에서 막혔는지 한 줄로 알려주세요.';
    const out = await agent({
      question: '예약변환 등록방법',
      userTurns: ['검색은 했는데', '예약변환 등록방법'],
      priorAiReplies: [generic],
      retrieveStaticInitial: () => []
    });
    assert.ok(out.debug.newUserFactsSinceLastAi.length >= 1, JSON.stringify(out.debug.newUserFactsSinceLastAi));
    assert.ok(!isGenericTaskDiagnostic(out.clarify || ''), out.clarify);
    assert.ok(out.debug.diagnosticRepeatPrevented || /예약변환/.test(out.clarify || ''));
  });

  await check('facts lock: extractUserFacts keeps candidate across turns', async () => {
    const f = extractUserFacts(['검색은 했는데 예약변환하려고', '예약변환 등록방법']);
    assert.strictEqual(f.candidateFeature, '예약변환');
  });

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nfeatureDiscoveryGolden: ${results.length - failed}/${results.length} cases`);
  if (failed) process.exitCode = 1;
}

if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = { run };
