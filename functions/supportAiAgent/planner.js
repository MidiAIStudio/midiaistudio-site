'use strict';

const { ACTIONS, SOURCE_TYPES, ALLOWED_SOURCES, validateDecision } = require('./actions');

function compact(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\-_/?.!]+/g, '');
}

function classifyNeed({ question, rawQuestion, intent, facts }) {
  const q = `${question || ''} ${rawQuestion || ''}`;
  const c = compact(q);

  if (
    /(가격|얼마|요금|price|판매\s*상품|구매\s*상품|상품\s*종류|이용권|라이선스|패스|lifetime|크레딧\s*팩|plans?)/i.test(
      q
    )
  ) {
    return 'catalog';
  }
  if (
    /(패치|업데이트|업뎃|릴리스|릴리즈|changelog|patchnote|변경사항|뭐바뀐|뭐가바뀌|공지)/i.test(c) ||
    /\b\d+\.\d+(?:\.\d+)?\b/.test(q) ||
    (facts && facts.version && /(그중|그거|관련)/i.test(q))
  ) {
    if (/(공지)/i.test(c) && !/(패치|업데이트|버전|\d+\.\d+)/i.test(c)) return 'notice';
    return 'release';
  }
  if (
    intent === 'where' ||
    /(버튼|드래그|선택|undo|redo|여러\s*개|같이\s*(옮|이동)|메뉴|위치|화면)/i.test(q)
  ) {
    return 'operation';
  }
  if (
    intent === 'troubleshoot' ||
    /(오류|에러|실패|안돼|안됨|이상|error|fail)/i.test(q)
  ) {
    return 'error';
  }
  if (intent === 'how' || intent === 'what') return 'knowledge';
  return 'knowledge';
}

function sourceKindOf(p) {
  const explicit = p && (p.sourceKind || p.sourceType);
  if (explicit && ALLOWED_SOURCES.has(String(explicit))) return String(explicit);
  const id = String((p && p.id) || '');
  const cat = String((p && p.category) || '');
  if (id.startsWith('live-catalog')) return 'catalog';
  if (id.startsWith('faq-')) return 'faq';
  if (id.startsWith('patch-') || id.startsWith('release-')) return 'release';
  if (id.startsWith('notice-')) return 'notice';
  if (id.startsWith('guide-')) return 'guide';
  if (/ops|_ops|operation/i.test(id + cat) || /_ops$/.test(cat)) return 'operation';
  if (/troubleshooting|error|fail|timeout/i.test(id + cat)) return 'error';
  return 'knowledge';
}

function hasSource(passages, type) {
  return (passages || []).some((p) => sourceKindOf(p) === type);
}

function passagesMatchNeed(need, passages) {
  if (!passages || !passages.length) return false;
  if (need === 'catalog') return hasSource(passages, 'catalog');
  if (need === 'release') return hasSource(passages, 'release');
  if (need === 'notice') return hasSource(passages, 'notice') || hasSource(passages, 'release');
  if (need === 'operation') return hasSource(passages, 'operation') || Number(passages[0].score || 0) >= 18;
  if (need === 'error') return hasSource(passages, 'error') || Number(passages[0].score || 0) >= 16;
  return Number(passages[0].score || 0) >= 14;
}

function researchBudget({ need, weak, conflict, passages, searched }) {
  const searchedSet = searched instanceof Set ? searched : new Set(searched || []);
  if (need === 'release' && !searchedSet.has('release') && !hasSource(passages, 'release')) {
    return weak || conflict ? 2 : 1;
  }
  if (need === 'notice' && !searchedSet.has('notice')) return 1;
  if (need === 'catalog' && !searchedSet.has('catalog') && !hasSource(passages, 'catalog')) return 1;
  if (need === 'operation' && !searchedSet.has('operation') && !hasSource(passages, 'operation')) {
    return weak ? 2 : 1;
  }
  if (!weak && !conflict && passagesMatchNeed(need, passages)) return 0;
  if (conflict) return 3;
  if (weak) return 2;
  return 0;
}

function nextUnsearched(need, searched) {
  const orderByNeed = {
    release: ['release', 'notice', 'faq', 'knowledge'],
    notice: ['notice', 'release', 'faq'],
    catalog: ['catalog'],
    operation: ['operation', 'knowledge', 'guide', 'faq'],
    error: ['error', 'faq', 'knowledge', 'guide'],
    knowledge: ['knowledge', 'operation', 'faq', 'guide']
  };
  const order = orderByNeed[need] || orderByNeed.knowledge;
  return order.find((s) => !searched.has(s)) || null;
}

function decideNextAction({
  question,
  rawQuestion,
  intent,
  facts,
  passages,
  searched,
  researchCount,
  budgetLeft,
  weak,
  conflict,
  personal
} = {}) {
  if (personal) {
    return validateDecision({ action: ACTIONS.ANSWER, reason: 'personal_fast', intent });
  }

  const need = classifyNeed({ question, rawQuestion, intent, facts });
  const searchedSet = searched instanceof Set ? searched : new Set(searched || []);
  const strongMatch = !weak && !conflict && passagesMatchNeed(need, passages);

  if (strongMatch && budgetLeft >= 0) {
    return validateDecision({
      action: ACTIONS.ANSWER,
      sourceType: need === 'knowledge' ? SOURCE_TYPES.knowledge : need,
      reason: 'enough_evidence',
      intent,
      topic: need
    });
  }

  if (conflict && passages && passages.length >= 2 && budgetLeft <= 0) {
    return validateDecision({ action: ACTIONS.COMPARE, reason: 'conflict_rerank', intent, topic: need });
  }

  if (budgetLeft > 0) {
    const next = nextUnsearched(need, searchedSet);
    if (next) {
      return validateDecision({
        action: searchedSet.size ? ACTIONS.SEARCH_ANOTHER_SOURCE : ACTIONS.SEARCH,
        sourceType: next,
        reason: `need_${need}`,
        intent,
        topic: need
      });
    }
  }

  const missingCore =
    need === 'error' &&
    (!facts.conversionKind && !facts.sourceType || !facts.errorCode && !facts.stage);

  if (need === 'error' || need === 'knowledge' || missingCore) {
    return validateDecision({
      action: ACTIONS.ASK_DIAGNOSTIC,
      reason: 'missing_user_fact',
      intent,
      topic: need
    });
  }

  if (researchCount > 0 && weak) {
    return validateDecision({
      action: ACTIONS.ASK_DIAGNOSTIC,
      reason: 'still_weak',
      intent,
      topic: need
    });
  }

  return validateDecision({
    action: ACTIONS.ASK_DIAGNOSTIC,
    reason: 'default_clarify',
    intent,
    topic: need
  });
}

function parseLlmPlannerText(text) {
  const raw = String(text || '').trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]);
    const action = String(obj.nextAction || obj.action || '').toUpperCase();
    const sourceType = obj.sourceType || (Array.isArray(obj.sourceTypes) ? obj.sourceTypes[0] : null);
    return validateDecision({
      action,
      sourceType,
      reason: 'llm_planner',
      intent: obj.intent || null,
      topic: obj.topic || null
    });
  } catch (_) {
    return null;
  }
}

module.exports = {
  classifyNeed,
  sourceKindOf,
  hasSource,
  passagesMatchNeed,
  researchBudget,
  decideNextAction,
  parseLlmPlannerText,
  nextUnsearched
};
