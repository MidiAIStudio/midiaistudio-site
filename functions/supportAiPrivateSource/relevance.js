'use strict';

/** Planner routing labels — never use as product search terms */
const ROUTING_LABELS = new Set([
  'operation',
  'private_source',
  'knowledge',
  'guide',
  'faq',
  'release',
  'notice',
  'error',
  'catalog',
  'search',
  'compare',
  'answer',
  'handoff'
]);

/** Single-token matches that must never alone create evidence */
const GENERIC_TOKENS = new Set([
  'ai',
  'key',
  'note',
  'notes',
  'guide',
  'operation',
  'function',
  'editor',
  'convert',
  'conversion',
  'feature',
  'menu',
  'button',
  'the',
  'and',
  'for',
  'with',
  'from',
  'fold',
  '기능',
  '노트',
  '정리',
  '사용',
  '방법',
  '어디',
  '메뉴',
  '변환',
  '등록',
  '알려줘',
  '있어',
  '있어요',
  '뭐야'
]);

const MIN_PRIVATE_RELEVANCE = 12;

/** Known feature identifiers / phrases keyed by topic family */
const FEATURE_MARKERS = [
  {
    family: 'arrange',
    question: /편곡|instrument\s*arrange|악기.*나(?:누|눠)|guided\s*arrangement/i,
    markers: [
      'midi_ai_instrument_arrange',
      'instrument arrange',
      'ai instrument arrange',
      'guided arrangement',
      'studioarrangement'
    ]
  },
  {
    family: 'easy_key',
    question: /쉬운\s*키|이지\s*키|easy\s*key|easier\s*key|쉬운\s*조/i,
    markers: ['midi_ai_easy_key', 'easier key', 'easy key', '쉬운 조 추천']
  },
  {
    family: 'cleanup',
    question: /노트\s*정리|클린업|ai\s*cleanup|cleanup/i,
    markers: ['midi_ai_cleanup', 'ai cleanup', 'goto_cleanup']
  },
  {
    family: 'tempo',
    question: /템포|tempo|bpm/i,
    markers: ['tempo', 'bpm', 'midi_editor_tempo', '템포']
  },
  {
    family: 'scheduled',
    question: /예약\s*변환|예약변환|scheduled\s*conversion|schedule.*convert/i,
    markers: [
      'scheduled conversion',
      'reservation',
      '예약 변환',
      '예약변환',
      'queue convert',
      'convert_queue',
      'schedule_convert'
    ]
  },
  {
    family: 'conversion',
    question: /변환\s*방법|유튜브|youtube|오디오.*midi|midi.*변환|pdf.*midi/i,
    markers: [
      'youtube',
      'audio to midi',
      'pdf to midi',
      'convert',
      'conversion',
      'youtube-engine',
      '변환'
    ]
  }
];

function isRoutingLabel(term) {
  return ROUTING_LABELS.has(String(term || '').trim().toLowerCase());
}

function isGenericToken(term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t) return true;
  if (GENERIC_TOKENS.has(t)) return true;
  if (t.length <= 1) return true;
  return false;
}

function meaningfulTokens(terms) {
  const out = [];
  for (const term of terms || []) {
    const parts = String(term || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const p of parts) {
      if (isRoutingLabel(p) || isGenericToken(p)) continue;
      if (!out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
    }
  }
  return out;
}

function detectQuestionFamily(question) {
  const q = String(question || '');
  for (const fam of FEATURE_MARKERS) {
    if (fam.question.test(q)) return fam.family;
  }
  return null;
}

function familyMarkers(family) {
  const fam = FEATURE_MARKERS.find((f) => f.family === family);
  return fam ? fam.markers : [];
}

/**
 * Score a candidate excerpt/line against semantic search terms + question.
 * Returns 0 when the hit fails the minimum relevance gate.
 */
function scoreHitRelevance({ text, path, terms, question } = {}) {
  const body = String(text || '');
  const low = body.toLowerCase();
  const pathL = String(path || '').toLowerCase();
  const q = String(question || '');
  const tokens = meaningfulTokens(terms);
  const phrases = (terms || [])
    .map((t) => String(t || '').trim())
    .filter((t) => t && !isRoutingLabel(t) && t.includes(' '));

  let score = 0;
  let gate = false; // must satisfy A–D

  // D / C: known feature identifier or semantic expansion exact-ish match
  const family = detectQuestionFamily(q);
  const markers = family ? familyMarkers(family) : [];
  for (const m of markers) {
    if (m && low.includes(m.toLowerCase())) {
      score += 20;
      gate = true;
    }
  }
  // Also allow marker from terms that look like feature ids
  for (const t of terms || []) {
    const s = String(t || '');
    if (/^midi_ai_|^ai_/i.test(s) && low.includes(s.toLowerCase())) {
      score += 20;
      gate = true;
    }
  }

  // A: exact phrase match
  for (const ph of phrases) {
    if (ph.length >= 4 && low.includes(ph.toLowerCase())) {
      score += 15;
      gate = true;
    }
  }

  // B: 2+ meaningful token overlap on same line / excerpt
  let tokenHits = 0;
  for (const t of tokens) {
    if (t.length >= 2 && low.includes(t.toLowerCase())) tokenHits += 1;
  }
  if (tokenHits >= 2) {
    score += 10;
    gate = true;
  } else if (tokenHits === 1) {
    // single meaningful token alone is NOT enough (reject unless marker/phrase already gated)
    score += 0;
  }

  // Lang JSON: require strong gate only (exact key / translated feature / multi-token)
  if (/^lang\//i.test(pathL)) {
    const hasFeatureKey = /midi_ai_[a-z0-9_]+/i.test(body) && gate;
    const strongPhrase = phrases.some((ph) => low.includes(ph.toLowerCase()));
    if (!(hasFeatureKey || strongPhrase || tokenHits >= 2 || markers.some((m) => low.includes(m.toLowerCase())))) {
      return { score: 0, accepted: false, reason: 'lang_weak_match' };
    }
    // Prefer true feature lines over unrelated localization blocks
    if (!/midi_ai_|easier key|instrument arrange|ai cleanup|tempo|bpm|예약|schedule|youtube|convert/i.test(body)) {
      return { score: 0, accepted: false, reason: 'lang_unrelated_block' };
    }
  }

  if (!gate) {
    return { score: 0, accepted: false, reason: 'below_relevance_gate' };
  }

  if (score < MIN_PRIVATE_RELEVANCE) {
    return { score, accepted: false, reason: 'below_min_score' };
  }

  return { score, accepted: true, reason: 'ok', tokenHits, family };
}

/**
 * Drop evidence that does not support the current question family.
 */
function evidenceMatchesQuestion(question, text, terms) {
  const q = String(question || '');
  const body = String(text || '').toLowerCase();
  const family = detectQuestionFamily(q);

  // Hard mismatches
  if (/예약\s*변환|예약변환/i.test(q)) {
    if (/barline|palette_lines|score_editor_palette|tutorial/i.test(body) && !/예약|schedule|queue|reservation/i.test(body)) {
      return { ok: false, reason: 'scheduled_vs_score_editor' };
    }
  }
  if (/변환\s*방법|변환방법/i.test(q) && !/편곡|arrange/i.test(q)) {
    // General conversion question must not keep Arrange-only evidence
    if (
      /midi_ai_instrument_arrange|instrument arrange|guided arrangement/i.test(body) &&
      !/youtube|audio|pdf|convert|conversion|변환/i.test(body)
    ) {
      return { ok: false, reason: 'conversion_vs_arrange' };
    }
  }
  if (family === 'arrange') {
    if (!/arrange|편곡|instrument|midi_ai_instrument_arrange|guided/i.test(body)) {
      return { ok: false, reason: 'arrange_missing_marker' };
    }
  }
  if (family === 'easy_key') {
    if (!/easy_key|easier key|쉬운\s*조|midi_ai_easy_key/i.test(body)) {
      return { ok: false, reason: 'easy_key_missing_marker' };
    }
  }
  if (family === 'cleanup') {
    if (!/cleanup|정리|midi_ai_cleanup/i.test(body)) {
      return { ok: false, reason: 'cleanup_missing_marker' };
    }
  }

  const scored = scoreHitRelevance({ text, terms, question: q });
  if (!scored.accepted) return { ok: false, reason: scored.reason };
  return { ok: true, reason: 'ok', relevance: scored.score };
}

module.exports = {
  ROUTING_LABELS,
  GENERIC_TOKENS,
  MIN_PRIVATE_RELEVANCE,
  FEATURE_MARKERS,
  isRoutingLabel,
  isGenericToken,
  meaningfulTokens,
  detectQuestionFamily,
  scoreHitRelevance,
  evidenceMatchesQuestion
};
