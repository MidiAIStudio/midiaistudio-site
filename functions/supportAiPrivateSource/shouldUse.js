'use strict';

/**
 * When private source research should run (product behavior), vs secure personal paths.
 */

function isPersonalOrPaymentQuestion(q) {
  const s = String(q || '');
  return /(내\s*(결제|이용권|구독|계정)|환불\s*(해|해줘|승인)|결제\s*(상태|내역)|만료|잔여|이용권\s*남|계정\s*(상태|잠금)|관리자|개인정보|내\s*이메일|payment\s*status|my\s*(subscription|license|account)|refund\s*me)/i.test(
    s
  );
}

function shouldUsePrivateSource({ question, rawQuestion, personal, need, weak, conflict, facts } = {}) {
  if (personal) return false;
  const q = `${question || ''} ${rawQuestion || ''}`;
  if (isPersonalOrPaymentQuestion(q) || isPersonalOrPaymentQuestion(rawQuestion)) return false;
  if (need === 'catalog') return false;

  // Prefer private source for product existence / how / where / errors / NL features / knowledge miss
  if (facts && facts.candidateFeature) return true;
  if (weak || conflict) return true;
  if (need === 'operation' || need === 'error' || need === 'knowledge') return true;
  if (/(기능|어디|메뉴|버튼|어떻게|사용|오류|에러|편곡|arrange|easy\s*key|cleanup|노트\s*정리)/i.test(q)) {
    return true;
  }
  return false;
}

function buildSearchTerms({ question, rawQuestion, facts, sourcePlan } = {}) {
  const terms = [];
  const push = (t) => {
    const s = String(t || '').trim();
    if (!s) return;
    if (!terms.some((x) => x.toLowerCase() === s.toLowerCase())) terms.push(s);
  };

  if (facts && facts.candidateFeature) push(facts.candidateFeature);
  for (const e of (facts && facts.candidateEntities) || []) push(e);

  const q = String(question || rawQuestion || '');
  // Korean → English product term expansions (bounded)
  if (/편곡/.test(q)) {
    push('Arrange');
    push('AI Assistant');
    push('instrument arrange');
    push('midi_ai_instrument_arrange');
  }
  if (/자동.*악기|악기.*나(?:누|눠)|instrument\s*arrange|스템|stem\s*split/i.test(q)) {
    push('AI Instrument Arrange');
    push('midi_ai_instrument_arrange');
    push('instrument arrange');
    push('Guided Arrangement');
  }
  if (/쉬운\s*키|이지\s*키|easy\s*key/i.test(q)) {
    push('Easier Key');
    push('midi_ai_easy_key');
    push('Easy Key');
    push('easy_key');
  }
  if (/노트\s*정리|클린업|cleanup/i.test(q)) {
    push('Cleanup');
    push('AI Cleanup');
    push('midi_ai_cleanup');
  }
  if (/퀀텀\s*폴드|quantum\s*fold/i.test(q)) {
    push('QuantumFold');
    // Avoid bare "fold" token which false-positives across the repo
  }
  if (/템포|tempo/i.test(q)) {
    push('tempo');
  }

  for (const t of String(q)
    .split(/[\s,./|]+/)
    .filter((x) => x.length >= 2)
    .slice(0, 4)) {
    // Drop ultra-generic tokens that explode Stage A recall
    if (/^(the|and|for|with|from|fold|key|ai|note|notes|기능|노트|정리|사용|방법|어디|메뉴)$/i.test(t)) {
      continue;
    }
    push(t);
  }
  for (const s of sourcePlan || []) {
    if (typeof s === 'string') push(s);
  }
  return terms.slice(0, 8);
}

module.exports = {
  shouldUsePrivateSource,
  isPersonalOrPaymentQuestion,
  buildSearchTerms
};
