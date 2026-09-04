/**
 * Generalized unknown-feature / entity discovery.
 * Extracts product-feature candidates from USER text without hardcoding
 * specific feature names (e.g. never special-cases "예약변환").
 */
'use strict';

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function compact(s) {
  return clean(s)
    .toLowerCase()
    .replace(/[\s\-_/?.!。！？]+/g, '');
}

/** Intent / how-to tails — strip to leave a feature noun phrase. */
const INTENT_TAIL_RE =
  /(?:\s*)(등록\s*방법|사용\s*방법|하는\s*법|하는\s*방법|방법|어떻게\s*(?:해(?:요|야|줘)?|하나요|할까)?|어디(?:에)?\s*(?:있어|있나요|야|지)|있나\??|있어요\??|되나요\??|돼\??|가능\??|취소(?:는|는\s*어떻게)?|설정(?:은|은\s*어디)?|위치|메뉴)$/i;

const INTENT_PREFIX_RE = /^(어떻게|어디(?:서|에)?|뭐가|무엇이|어떤)\s+/i;

/** Conversational fillers that are not feature names. */
const FILLER_PREFIX_RE =
  /^(?:검색은\s*했는데|찾아(?:는|봤는데)|그런데|근데|그리고|일단|그냥|혹시|아|음|저)\s*/i;

/** Verb / desire suffixes after a feature noun. */
const DESIRE_SUFFIX_RE =
  /\s*(?:하려고|하고\s*싶(?:어|어요|다)?|할래|해볼래|해보려|등록하려|쓰려|쓰려고|원해요|원해)$/i;

/** Tokens that alone are too generic to be a feature candidate. */
const STOP_FEATURES = new Set(
  [
    '검색',
    '작업',
    '기능',
    '메뉴',
    '화면',
    '버튼',
    '단계',
    '오류',
    '에러',
    '문제',
    '방법',
    '사용',
    '설정',
    '등록',
    '취소',
    '변환',
    '파일',
    '결과',
    '도움',
    '문의',
    '질문',
    '설명',
    '해결',
    '설치',
    '로그인',
    '재생',
    '저장',
    '다운로드',
    '업데이트',
    '패치',
    '버전',
    '제품',
    '앱',
    '프로그램',
    'studio',
    'midiai',
    'midi',
    '오디오',
    '유튜브',
    'youtube',
    'pdf'
  ].map(compact)
);

const GENERIC_TASK_DIAG_RE =
  /어떤\s*작업을\s*하려는|지금\s*어떤\s*작업을|어떤\s*기능\s*\(?메뉴\)?\s*질문인지|what\s+task\s+are\s+you\s+trying|which\s+specific\s+feature/i;

function isStopFeature(phrase) {
  const c = compact(phrase);
  if (!c || c.length < 2) return true;
  if (STOP_FEATURES.has(c)) return true;
  // Pure intent / interrogatives
  if (/^(어떻게|어디|뭐|무엇|있나|돼|방법)$/i.test(c)) return true;
  return false;
}

/** Reject conversational / symptom sentences mistaken as feature names. */
const REJECT_CANDIDATE_RE =
  /(바꿔|이상|실패|오류|에러|됐는데|하는데|합칠|있어|알려|설명|소리|됐|뜨|안돼|안됨|문제|도와|제발|이거|저거|그거|그중|뭐야|무엇|어디|어떻게|선택|방금|줄일|숨길|넘겨|바뀌)/i;

function looksLikeFeatureNoun(phrase) {
  const s = clean(phrase);
  if (!s || isStopFeature(s)) return false;
  if (REJECT_CANDIDATE_RE.test(s)) return false;
  const c = compact(s);
  if (c.length < 2 || c.length > 16) return false;
  // At most 2 tokens (e.g. "예약 작업")
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length > 2) return false;
  if (tokens.length === 2) {
    if (isStopFeature(tokens[0])) return false;
    // Avoid "선택한 음" style modifier+noun
    if (/한$|된$|는$|은$/.test(tokens[0])) return false;
  }
  // Prefer Hangul/alnum feature shapes
  if (!/[가-힣A-Za-z]/.test(s)) return false;
  return true;
}

function normalizeFeaturePhrase(raw) {
  let s = clean(raw);
  if (!s) return null;
  s = s.replace(FILLER_PREFIX_RE, '');
  s = s.replace(INTENT_PREFIX_RE, '');
  s = s.replace(INTENT_TAIL_RE, '');
  s = s.replace(DESIRE_SUFFIX_RE, '');
  s = s
    .replace(/[?？!！.。]+$/g, '')
    .replace(/(이에요|예요|입니다|해주세요|해줘|알려줘|싶어|싶습니다|해요|해여)$/g, '')
    .replace(/[이가을를은는의]\s*$/g, '')
    .trim();
  s = s.replace(/(은|는|이|가|을|를|도|만|으로|로)$/g, '').trim();
  if (!looksLikeFeatureNoun(s)) return null;
  return s;
}

/**
 * Pull candidate feature / entity noun phrases from a single USER utterance.
 * No product-specific aliases — pattern-based only.
 */
function extractCandidatesFromText(text) {
  const s0 = clean(text);
  if (!s0) return [];
  const found = [];
  const push = (raw, { prefer = false } = {}) => {
    const n = normalizeFeaturePhrase(raw);
    if (!n) return;
    if (found.some((x) => compact(x) === compact(n))) return;
    if (prefer) found.unshift(n);
    else found.push(n);
  };

  let s = s0.replace(FILLER_PREFIX_RE, '');

  // "{feature} 등록방법|방법|어디|어떻게|있나|돼|취소|설정"
  const howMatch = s.match(
    /^(.{2,24}?)\s*(등록\s*방법|사용\s*방법|하는\s*법|방법|어떻게|어디(?:에)?(?:\s*있어)?|있나|돼요?|되나요|취소|설정|위치)/i
  );
  if (howMatch) push(howMatch[1], { prefer: true });

  // "{feature}하려고|하고싶어|등록하려"
  const desireMatch = s.match(
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s]{1,20}?)\s*(?:하려고|하고\s*싶|할래|해보려|등록하려|쓰려고)/
  );
  if (desireMatch) push(desireMatch[1], { prefer: true });

  // "{feature} 있나?|돼?|가능해?"
  const existMatch = s.match(/^(.{2,20}?)\s*(있나|있어요|돼|되나요|가능)\s*\??$/i);
  if (existMatch) push(existMatch[1], { prefer: true });

  // "{feature}은/는?" short topic ask
  const topicParticle = s.match(/^([가-힣A-Za-z0-9]{2,16})[은는]\s*\??$/);
  if (topicParticle) push(topicParticle[1], { prefer: true });

  // Compound verb-noun leftovers: "트랙합치기", "구간저장", "일괄변환", "자동정리"
  const compound = s.match(
    /([가-힣A-Za-z]{2,10}(?:하기|저장|변환|정리|합치기|등록|취소|반복|예약))/
  );
  if (compound) push(compound[1]);

  // Spaced compound: "예약 작업"
  const spaced = s.match(/([가-힣]{2,8})\s+([가-힣]{2,8})/);
  if (spaced) {
    const joined = `${spaced[1]} ${spaced[2]}`;
    if (looksLikeFeatureNoun(joined) || looksLikeFeatureNoun(compact(joined))) {
      push(joined);
    }
  }

  // Deduplicate preserving prefer-first order; prefer shorter specific nouns
  const uniq = [];
  for (const f of found) {
    if (!uniq.some((x) => compact(x) === compact(f))) uniq.push(f);
  }
  uniq.sort((a, b) => {
    // Prefer no-space compounds of moderate length
    const as = /\s/.test(a) ? 1 : 0;
    const bs = /\s/.test(b) ? 1 : 0;
    if (as !== bs) return as - bs;
    return compact(a).length - compact(b).length || a.length - b.length;
  });
  return uniq;
}

/**
 * Merge candidates across USER turns. Primary = best from latest turn, else longest overall.
 */
function extractCandidateFeatures(userTurns = []) {
  const turns = (userTurns || []).map(clean).filter(Boolean);
  const all = [];
  const byTurn = [];
  for (const t of turns) {
    const cands = extractCandidatesFromText(t);
    byTurn.push(cands);
    for (const c of cands) {
      if (!all.some((x) => compact(x) === compact(c))) all.push(c);
    }
  }
  const latest = byTurn.length ? byTurn[byTurn.length - 1] : [];
  const primary = latest[0] || all[0] || null;
  return {
    candidateFeature: primary,
    candidateEntities: all.slice(0, 6)
  };
}

function isGenericTaskDiagnostic(text) {
  return GENERIC_TASK_DIAG_RE.test(clean(text));
}

function collectAiReplies(replies = []) {
  return (replies || [])
    .filter((r) => String(r.role || '') === 'ai')
    .map((r) => clean(r.content))
    .filter(Boolean);
}

/**
 * Diff facts between prior USER turns and full turns.
 */
function diffNewUserFacts(prevFacts = {}, nextFacts = {}) {
  const keys = [
    'candidateFeature',
    'conversionKind',
    'sourceType',
    'errorCode',
    'stage',
    'feature',
    'version'
  ];
  const added = [];
  for (const k of keys) {
    const a = prevFacts[k] || null;
    const b = nextFacts[k] || null;
    if (b && compact(String(b)) !== compact(String(a || ''))) {
      added.push(k === 'candidateFeature' ? `feature:${b}` : `${k}=${b}`);
    }
  }
  // New entities
  const prevEnt = new Set((prevFacts.candidateEntities || []).map(compact));
  for (const e of nextFacts.candidateEntities || []) {
    if (e && !prevEnt.has(compact(e))) added.push(`entity:${e}`);
  }
  return [...new Set(added)];
}

function shouldTriggerFeatureDiscovery(facts = {}, { weak = true, intent = 'general', need = null } = {}) {
  if (!facts.candidateFeature) return false;
  if (!weak) return false;
  // Keep authoritative routers for catalog / release / notice
  if (need === 'release' || need === 'catalog' || need === 'notice') return false;
  if (facts.version && /(패치|업데이트|릴리스|릴리즈)/i.test(String(facts._joined || ''))) return false;
  // Known conversion/error paths keep their own routers
  if (facts.errorCode) return false;
  if (facts.conversionKind && /(실패|오류|안\s*되)/i.test(String(facts._joined || ''))) return false;
  return (
    intent === 'how' ||
    intent === 'where' ||
    intent === 'what' ||
    intent === 'general' ||
    intent === 'troubleshoot'
  );
}

const DISCOVERY_SOURCE_ORDER = [
  'operation',
  'private_source',
  'knowledge',
  'guide',
  'faq',
  'notice',
  'release'
];

function discoverySearchQuery(facts, question) {
  if (facts && facts.candidateFeature) return String(facts.candidateFeature);
  return String(question || '');
}

/**
 * Soft match: candidate tokens against title / summary / aliases / id.
 * Returns a boost score (0 if unrelated).
 */
function discoveryMatchBoost(candidateFeature, passage) {
  if (!candidateFeature || !passage) return 0;
  const cand = compact(candidateFeature);
  if (cand.length < 2) return 0;

  const title = compact(passage.title);
  const summary = compact(passage.summary);
  const details = compact(passage.details);
  const id = compact(passage.id);
  const aliases = []
    .concat(passage.aliases || [], passage.keywords || [], passage.tags || [])
    .map((a) => compact(typeof a === 'string' ? a : a && (a.ko || a.en || a)))
    .filter(Boolean);
  const blob = [title, summary, details, id, ...aliases].join('|');

  if (!blob) return 0;
  if (title === cand || aliases.includes(cand)) return 28;
  if (title.includes(cand) || cand.includes(title) && title.length >= 3) return 22;
  if (aliases.some((a) => a.includes(cand) || cand.includes(a))) return 18;
  if (summary.includes(cand) || id.includes(cand)) return 14;

  // Token overlap for compounds (e.g. 예약+변환 vs title tokens)
  const parts = String(candidateFeature)
    .split(/(?=[가-힣]{2})|[\s\-_]/)
    .map(compact)
    .filter((p) => p.length >= 2 && !STOP_FEATURES.has(p));
  if (parts.length >= 2) {
    const hits = parts.filter((p) => blob.includes(p)).length;
    if (hits >= 2) return 12;
    if (hits === 1 && title.includes(parts[0])) return 6;
  }
  return 0;
}

function applyDiscoveryBoosts(passages, candidateFeature) {
  if (!candidateFeature || !passages || !passages.length) return passages || [];
  return (passages || []).map((p) => {
    const boost = discoveryMatchBoost(candidateFeature, p);
    if (!boost) return p;
    return { ...p, score: Number(p.score || 0) + boost, _discoveryBoost: boost };
  });
}

/**
 * Targeted clarification when a named feature candidate was not verified.
 * Interpolates the dynamic candidate — no product-specific hardcoding.
 */
function buildTargetedFeatureDiagnostic({
  locale = 'ko',
  candidateFeature,
  intent = 'general',
  hypotheses = []
} = {}) {
  const name = clean(candidateFeature);
  if (!name) return null;
  const loc = locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : 'ko';
  const hyps = Array.isArray(hypotheses) ? hypotheses : [];

  if (loc === 'en') {
    if (intent === 'where') {
      return `Where did you see “${name}” (which screen or menu label)? A screen name or nearby button helps me check.`;
    }
    if (hyps.length >= 2) {
      return `When you say “${name}”, which of these is closest to what you mean — and on which screen did you see that label?`;
    }
    return `I couldn’t verify a feature labeled “${name}” in the official docs yet. Where did you see that name (screen/menu/button)?`;
  }
  if (loc === 'ja') {
    return `「${name}」という表示をどの画面・メニューで見ましたか？場所が分かると確認できます。`;
  }

  if (intent === 'where') {
    return `"${name}"이라고 표시된 메뉴나 버튼을 어디에서 보셨나요? 화면 이름이나 근처 버튼 위치를 알려주시면 확인해볼게요.`;
  }
  if (intent === 'how' || intent === 'what') {
    return `"${name}" 기능을 말씀하시는 거죠? 공식 자료에서 같은 이름으로는 바로 확인이 안 돼서, 그 이름이 보인 화면이나 버튼 위치를 알려주시면 맞춰볼게요.`;
  }
  if (hyps.length >= 2) {
    return `"${name}"이 어떤 작업에 가까운지, 그리고 그 이름을 본 화면을 알려주시면 확인하겠습니다.`;
  }
  return `"${name}"이라고 표시된 메뉴를 어디에서 보셨나요? 화면 이름이나 버튼 위치를 알려주시면 확인해볼게요.`;
}

module.exports = {
  extractCandidatesFromText,
  extractCandidateFeatures,
  isGenericTaskDiagnostic,
  collectAiReplies,
  diffNewUserFacts,
  shouldTriggerFeatureDiscovery,
  DISCOVERY_SOURCE_ORDER,
  discoverySearchQuery,
  discoveryMatchBoost,
  applyDiscoveryBoosts,
  buildTargetedFeatureDiagnostic,
  GENERIC_TASK_DIAG_RE,
  compact,
  clean
};
