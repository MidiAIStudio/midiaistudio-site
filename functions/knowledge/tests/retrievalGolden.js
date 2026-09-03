/**
 * Support AI retrieval golden regression harness.
 *
 * Covers every public verified Knowledge with auto-generated user phrasings
 * plus critical / negative cross-topic cases. No per-question hardcoding in
 * the scorer — this file only asserts retrieval expectations.
 *
 * Run: node functions/knowledge/tests/retrievalGolden.js
 */
'use strict';

const assert = require('assert');
const {
  listPublicVerified,
  retrieveKnowledge,
  knowledgeStats,
  expandQueryText
} = require('../loadKnowledge');

const SOUND_ACCEPT = ['high-quality-sound-ops', 'high-quality-sounds'];
const AUDIO_MIDI_FORBIDDEN_FOR_SOUND = ['audio-to-midi', 'youtube-to-midi', 'export-formats'];

/** Related overview ↔ ops pairs that may share intent. */
const RELATED_GROUPS = {
  'high-quality-sounds': SOUND_ACCEPT,
  'high-quality-sound-ops': SOUND_ACCEPT,
  'midi-editor': [
    'midi-editor',
    'midi-editor-tempo',
    'midi-editor-note-edit',
    'midi-editor-velocity',
    'midi-editor-instrument',
    'midi-editor-playback-zoom',
    'midi-editor-undo-save'
  ],
  'score-editor': ['score-editor', 'score-editor-ops'],
  'score-editor-ops': ['score-editor', 'score-editor-ops'],
  'ai-assistant': ['ai-assistant', 'ai-assistant-ops', 'easier-key'],
  'ai-assistant-ops': ['ai-assistant', 'ai-assistant-ops'],
  'library-local': ['library-local', 'library-ops', 'nav-workspace'],
  'library-ops': ['library-local', 'library-ops', 'nav-workspace'],
  'youtube-to-midi': ['youtube-to-midi', 'studio-preview-range', 'studio-preview-playback'],
  'studio-preview-range': ['studio-preview-range', 'studio-preview-playback', 'youtube-to-midi', 'audio-to-midi'],
  'studio-preview-playback': ['studio-preview-playback', 'studio-preview-range'],
  'export-formats': ['export-formats', 'score-editor-ops', 'score-editor'],
  'support-contact': ['support-contact', 'troubleshooting-basics'],
  'troubleshooting-basics': ['troubleshooting-basics', 'support-contact'],
  'midi-editor-tempo': ['midi-editor-tempo', 'midi-editor'],
  'midi-editor-note-edit': ['midi-editor-note-edit', 'midi-editor'],
  'midi-editor-velocity': ['midi-editor-velocity', 'midi-editor'],
  'midi-editor-instrument': ['midi-editor-instrument', 'midi-editor'],
  'midi-editor-playback-zoom': ['midi-editor-playback-zoom', 'midi-editor'],
  'midi-editor-undo-save': ['midi-editor-undo-save', 'midi-editor', 'library-local']
};

function relatedAccept(id) {
  return RELATED_GROUPS[id] || [id];
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function pickKeywordVariants(doc) {
  const kws = (doc.keywords || []).map((k) => String(k).trim()).filter((k) => k.length >= 2);
  const genericish =
    /^(midi|audio|pdf|변환|convert|사용|설정|방법|파일|확인|studio|노트|음표|악보|메뉴|설치|시작|문제|오류|문의|오디오|재생|정지|음원|사운드|sound)$/i;
  const specific = kws.filter((k) => !genericish.test(k) && k.replace(/\s+/g, '').length >= 3);
  const pool = specific.length ? specific : kws.filter((k) => k.replace(/\s+/g, '').length >= 4);
  return pool.slice(0, 6);
}

/**
 * Auto-generate realistic user phrasings per Knowledge (A–H styles).
 * Facts stay in Knowledge; only query surface forms are invented.
 */
function autoQueriesForDoc(doc) {
  const id = doc.id;
  const title = String(doc.title || id);
  const titleKo = title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[·•]/g, ' ').trim();
  const kws = pickKeywordVariants(doc);
  if (!kws.length && titleKo.length < 4) return [];
  const primary = kws[0] || titleKo;
  const compact = primary.replace(/\s+/g, '');
  const queries = [];

  const push = (q, kind) => {
    const t = String(q || '').trim();
    if (!t || t.length < 2) return;
    // Skip ultra-generic auto queries that only create noise in the golden set
    const c = t.replace(/\s+/g, '').replace(/[?？!！]/g, '');
    if (
      /^(노트|악보|메뉴|설치|오디오|문제|문의|재생|정지|방법|설정|파일)(어떻게해|뭐야|안나와)?$/i.test(c)
    ) {
      return;
    }
    queries.push({
      query: t,
      kind,
      expectedKnowledgeId: id,
      acceptableKnowledgeIds: relatedAccept(id)
    });
  };

  // A normal / title-ish — prefer specific keyword over long shared product title
  push(`${primary} 방법`, 'A');
  push(primary, 'A');
  if (titleKo.length >= 6 && !/MIDI Editor|Score Editor|AI Assistant/i.test(titleKo)) {
    push(`${titleKo} 방법`, 'A');
  }
  // B no-space
  if (compact !== primary && compact.length >= 4) push(compact, 'B');
  // C short search
  if (compact.length >= 3 && compact.length <= 12) push(compact, 'C');
  else if (kws[1]) push(String(kws[1]).replace(/\s+/g, ''), 'C');
  // D colloquial
  if (compact.length >= 4) push(`${primary} 어떻게 해`, 'D');
  // E mild variant
  if (/음원|사운드|sound/i.test(primary)) push(primary.replace(/고품질/g, '고음질'), 'E');
  if (/템포|BPM|bpm/i.test(primary + id)) push('템포변경', 'E');
  // F EN mix
  if (/[a-zA-Z]/.test(kws.join(' '))) {
    const en = kws.find((k) => /[a-zA-Z]{3,}/.test(k));
    if (en) push(en, 'F');
  }
  // G question / H problem — only for distinctive phrases
  if (compact.length >= 4) {
    push(`${primary} 뭐야?`, 'G');
    push(`${primary} 안 나와`, 'H');
  }

  return queries;
}

/** Critical + negative cross-topic cases (generalized intents, not one-off patches). */
function criticalCases() {
  return [
    {
      query: '고음질음원',
      expectedKnowledgeId: 'high-quality-sound-ops',
      acceptableKnowledgeIds: SOUND_ACCEPT,
      forbiddenKnowledgeIds: AUDIO_MIDI_FORBIDDEN_FOR_SOUND,
      critical: true
    },
    {
      query: '고품질음원',
      expectedKnowledgeId: 'high-quality-sounds',
      acceptableKnowledgeIds: SOUND_ACCEPT,
      forbiddenKnowledgeIds: AUDIO_MIDI_FORBIDDEN_FOR_SOUND,
      critical: true
    },
    {
      query: '사운드팩',
      expectedKnowledgeId: 'high-quality-sound-ops',
      acceptableKnowledgeIds: SOUND_ACCEPT,
      forbiddenKnowledgeIds: ['audio-to-midi', 'midi-editor-instrument'],
      critical: true
    },
    {
      query: 'sound pack',
      expectedKnowledgeId: 'high-quality-sounds',
      acceptableKnowledgeIds: SOUND_ACCEPT,
      forbiddenKnowledgeIds: ['audio-to-midi'],
      critical: true
    },
    {
      query: '오디오를 MIDI로',
      expectedKnowledgeId: 'audio-to-midi',
      acceptableKnowledgeIds: ['audio-to-midi'],
      forbiddenKnowledgeIds: SOUND_ACCEPT,
      critical: true
    },
    {
      query: '템포',
      expectedKnowledgeId: 'midi-editor-tempo',
      acceptableKnowledgeIds: ['midi-editor-tempo'],
      forbiddenKnowledgeIds: ['conversion-progress-piano', 'studio-preview-playback'],
      critical: true
    },
    {
      query: 'BPM',
      expectedKnowledgeId: 'midi-editor-tempo',
      acceptableKnowledgeIds: ['midi-editor-tempo'],
      forbiddenKnowledgeIds: ['conversion-progress-piano'],
      critical: true
    },
    {
      query: '곡을 느리게',
      expectedKnowledgeId: 'midi-editor-tempo',
      acceptableKnowledgeIds: ['midi-editor-tempo'],
      forbiddenKnowledgeIds: ['conversion-progress-piano'],
      critical: true
    },
    {
      query: '미리듣기 구간',
      expectedKnowledgeId: 'studio-preview-range',
      acceptableKnowledgeIds: ['studio-preview-range', 'studio-preview-playback'],
      forbiddenKnowledgeIds: ['youtube-to-midi'],
      critical: true
    },
    {
      query: '변환구간',
      expectedKnowledgeId: 'studio-preview-range',
      acceptableKnowledgeIds: ['studio-preview-range'],
      forbiddenKnowledgeIds: ['conversion-generic-failure'],
      critical: true
    },
    {
      query: '벨로시티',
      expectedKnowledgeId: 'midi-editor-velocity',
      acceptableKnowledgeIds: ['midi-editor-velocity', 'midi-editor-note-edit'],
      forbiddenKnowledgeIds: [],
      critical: true
    },
    {
      query: '악기 변경',
      expectedKnowledgeId: 'midi-editor-instrument',
      acceptableKnowledgeIds: ['midi-editor-instrument'],
      forbiddenKnowledgeIds: ['band-orchestra-preview'],
      critical: true
    },
    {
      query: 'PDF 내보내기',
      expectedKnowledgeId: 'score-editor-ops',
      acceptableKnowledgeIds: ['score-editor-ops', 'score-editor'],
      forbiddenKnowledgeIds: ['pdf-to-midi', 'pdf-timeout'],
      critical: true
    },
    {
      query: 'PDF→MIDI',
      expectedKnowledgeId: 'pdf-to-midi',
      acceptableKnowledgeIds: ['pdf-to-midi'],
      forbiddenKnowledgeIds: ['score-editor-ops'],
      critical: true
    },
    {
      query: '라이선스 기간',
      expectedKnowledgeId: 'license-full-lifetime',
      acceptableKnowledgeIds: ['license-full-lifetime'],
      forbiddenKnowledgeIds: ['midi-editor-note-edit', 'studio-preview-range'],
      critical: true
    },
    {
      query: '유튜브 변환',
      expectedKnowledgeId: 'youtube-to-midi',
      acceptableKnowledgeIds: ['youtube-to-midi'],
      forbiddenKnowledgeIds: ['audio-to-midi'],
      critical: true
    },
    {
      query: '쉬운 조',
      expectedKnowledgeId: 'easier-key',
      acceptableKnowledgeIds: ['easier-key', 'ai-assistant-ops'],
      forbiddenKnowledgeIds: [],
      critical: true
    },
    {
      query: '설치 방법',
      expectedKnowledgeId: 'getting-started-install',
      acceptableKnowledgeIds: ['getting-started-install', 'nav-workspace'],
      forbiddenKnowledgeIds: [],
      critical: true
    }
  ];
}

function evaluateCase(c) {
  const hits = retrieveKnowledge(c.query, { limit: 3, locale: 'ko' });
  const top1 = hits[0] ? hits[0].id : null;
  const top3 = hits.map((h) => h.id);
  const accept = new Set(c.acceptableKnowledgeIds || [c.expectedKnowledgeId]);
  const forbidden = new Set(c.forbiddenKnowledgeIds || []);
  const top1Ok = top1 && accept.has(top1);
  const top3Ok = top3.some((id) => accept.has(id));
  const forbiddenHit = top1 && forbidden.has(top1);
  const pass = top1Ok && !forbiddenHit;
  return {
    query: c.query,
    expected: c.expectedKnowledgeId,
    actualTop1: top1,
    top3,
    score: hits[0] ? hits[0].score : 0,
    pass,
    top3Ok,
    forbiddenHit,
    critical: !!c.critical,
    kind: c.kind || 'critical',
    expanded: expandQueryText(c.query)
  };
}

function confusionPairs(results) {
  const map = new Map();
  for (const r of results) {
    if (r.pass || !r.actualTop1) continue;
    const key = `${r.expected}→${r.actualTop1}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pair, count]) => ({ pair, count }));
}

function buildGoldenSet(docs) {
  const auto = [];
  for (const doc of docs) {
    auto.push(...autoQueriesForDoc(doc));
  }
  // Deduplicate by query text (critical overrides auto)
  const byQuery = new Map();
  for (const c of auto) {
    const key = c.query.toLowerCase().replace(/\s+/g, '');
    if (!byQuery.has(key)) byQuery.set(key, c);
  }
  for (const c of criticalCases()) {
    const key = c.query.toLowerCase().replace(/\s+/g, '');
    byQuery.set(key, c);
  }
  return [...byQuery.values()];
}

function run() {
  const stats = knowledgeStats();
  const docs = listPublicVerified('ko');
  assert.ok(docs.length >= 30, `expected ~34 public verified, got ${docs.length}`);
  assert.strictEqual(stats.publicVerified, docs.length);

  const golden = buildGoldenSet(docs);
  const results = golden.map(evaluateCase);

  const pass = results.filter((r) => r.pass);
  const fail = results.filter((r) => !r.pass);
  const criticalFail = fail.filter((r) => r.critical);
  const top3Hits = results.filter((r) => r.top3Ok);
  const wrongTopic = results.filter((r) => r.forbiddenHit);

  const confusion = confusionPairs(results);
  const categories = uniq(docs.map((d) => d.category));

  const report = {
    knowledgePublicVerified: docs.length,
    intentsMapped: docs.length,
    goldenQueries: results.length,
    categoriesCovered: categories.length,
    top1Accuracy: +(pass.length / results.length).toFixed(4),
    top3Accuracy: +(top3Hits.length / results.length).toFixed(4),
    wrongTopic: wrongTopic.length,
    criticalFail: criticalFail.length,
    pass: pass.length,
    fail: fail.length,
    confusionTop: confusion.slice(0, 20),
    remainingFailures: fail.slice(0, 40).map((r) => ({
      query: r.query,
      expected: r.expected,
      actual: r.actualTop1,
      top3: r.top3,
      score: r.score,
      critical: r.critical
    }))
  };

  console.log('[RETRIEVAL GOLDEN]');
  console.log(JSON.stringify(report, null, 2));

  if (criticalFail.length) {
    console.error('CRITICAL FAILURES:', criticalFail.map((r) => `${r.query} => ${r.actualTop1} (want ${r.expected})`));
    process.exitCode = 1;
  }
  if (wrongTopic.length) {
    console.error('WRONG-TOPIC:', wrongTopic.map((r) => r.query));
    process.exitCode = 1;
  }
  // Soft gate: overall top1 should stay high after calibration
  if (pass.length / results.length < 0.82) {
    console.error(`TOP1 accuracy too low: ${report.top1Accuracy}`);
    process.exitCode = 1;
  }

  return report;
}

if (require.main === module) {
  run();
}

module.exports = {
  buildGoldenSet,
  criticalCases,
  evaluateCase,
  run,
  RELATED_GROUPS,
  SOUND_ACCEPT
};
