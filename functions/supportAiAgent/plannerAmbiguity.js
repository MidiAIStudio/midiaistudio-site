'use strict';

const { classifyNeed, sourceKindOf, passagesMatchNeed } = require('./planner');

function compact(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\-_/?.!]+/g, '');
}

/**
 * True when the question is a clear single-source fast path (no LLM planner).
 */
function isDeterministicFastPath({ question, rawQuestion, intent, facts, passages, weak }) {
  const q = `${question || ''} ${rawQuestion || ''}`;
  const need = classifyNeed({ question, rawQuestion, intent, facts });
  const c = compact(q);

  // Compound → not fast path
  if (isCompoundQuery(q, facts)) return false;

  // Strong single-source known answers
  if (!weak && passagesMatchNeed(need, passages)) return true;

  // Clear catalog / simple release / operation / known error with code
  if (need === 'catalog' && /(가격|상품|이용권|판매|구매|lifetime|plans?)/i.test(q)) return true;
  if (need === 'release' && !isCompoundQuery(q, facts) && (/\b\d+\.\d+/.test(q) || /패치|업데이트|업뎃|최근|최신|요즘/.test(c))) {
    return true;
  }
  if (need === 'operation' && intent === 'where') return true;
  if (need === 'error' && facts && (facts.errorCode || facts.conversionKind) && !isCompoundQuery(q, facts)) {
    return true;
  }
  if (need === 'knowledge' && !weak && passages && passages[0] && Number(passages[0].score || 0) >= 18) {
    return true;
  }
  return false;
}

function isCompoundQuery(q, facts) {
  const text = String(q || '');
  // release + error/conversion
  if (
    /(패치|업데이트|업뎃|버전|\d+\.\d+(?:\.\d+)?).{0,48}(오류|에러|변환|이상|실패|관련)/i.test(text) ||
    /(오류|에러|변환|이상|실패).{0,48}(패치|업데이트|업뎃|버전|\d+\.\d+)/i.test(text) ||
    /(관련\s*있|연관|때문|이후부터|하고\s*나서|새\s*버전부터)/i.test(text)
  ) {
    return true;
  }
  // conversion done + sound issue (multi-hypothesis)
  if (/(변환|결과).{0,20}(됐|나왔|완료)/i.test(text) && /(소리|음색|음질|이상)/i.test(text)) {
    return true;
  }
  // release feature → where to configure
  if (
    (facts && facts.version) &&
    /(어디|설정|메뉴|기능)/i.test(text) &&
    /(그중|그거|그\s*기능|패치|업데이트)/i.test(text)
  ) {
    return true;
  }
  return false;
}

function evidenceMismatchesNeed(need, passages) {
  if (!passages || !passages.length) return false;
  const top = passages[0];
  const kind = sourceKindOf(top);
  if (need === 'release' && kind !== 'release' && kind !== 'notice') return true;
  if (need === 'catalog' && kind !== 'catalog') return true;
  if (need === 'operation' && kind !== 'operation' && Number(top.score || 0) < 16) return true;
  if (need === 'error' && kind !== 'error' && Number(top.score || 0) < 14) return true;
  return false;
}

function hasSourceConflict(passages) {
  if (!passages || passages.length < 2) return false;
  const k1 = sourceKindOf(passages[0]);
  const k2 = sourceKindOf(passages[1]);
  const s1 = Number(passages[0].score || 0);
  const s2 = Number(passages[1].score || 0);
  return k1 && k2 && k1 !== k2 && s2 >= s1 - 3;
}

/**
 * Decide whether selective LLM planner should run (at most once per turn).
 */
function shouldUseLlmPlanner({
  question,
  rawQuestion,
  intent,
  facts,
  passages,
  weak,
  conflict,
  hypotheses,
  researchedOnce
} = {}) {
  if (isDeterministicFastPath({ question, rawQuestion, intent, facts, passages, weak })) {
    return { use: false, reason: 'fast_path' };
  }

  const q = `${question || ''} ${rawQuestion || ''}`;
  if (isCompoundQuery(q, facts)) {
    return { use: true, reason: 'compound_query' };
  }

  if (conflict || hasSourceConflict(passages)) {
    return { use: true, reason: 'evidence_conflict' };
  }

  const need = classifyNeed({ question, rawQuestion, intent, facts });
  if (evidenceMismatchesNeed(need, passages) && (weak || researchedOnce)) {
    return { use: true, reason: 'evidence_mismatch' };
  }

  if (Array.isArray(hypotheses) && hypotheses.length >= 3 && weak) {
    return { use: true, reason: 'multi_hypothesis' };
  }

  // Ambiguous / unfamiliar: weak evidence and no clear single need signal
  if (weak && need === 'knowledge' && !facts.conversionKind && !facts.errorCode && !facts.version) {
    const compactQ = compact(q);
    if (compactQ.length >= 6 && compactQ.length <= 40) {
      return { use: true, reason: 'ambiguous_unknown' };
    }
  }

  // Follow-up that may need source transition (release → operation)
  if (
    facts &&
    facts.version &&
    /(어디|설정|메뉴|어떻게)/i.test(q) &&
    /(그|기능|편집|변환)/i.test(q)
  ) {
    return { use: true, reason: 'source_transition' };
  }

  return { use: false, reason: 'deterministic_ok' };
}

module.exports = {
  isDeterministicFastPath,
  isCompoundQuery,
  shouldUseLlmPlanner,
  evidenceMismatchesNeed,
  hasSourceConflict
};
