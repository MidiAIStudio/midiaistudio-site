'use strict';

/**
 * When private source research should run (product behavior), vs secure personal paths.
 * Search terms are product semantics only — never planner routing labels.
 */

const { isRoutingLabel, isGenericToken } = require('./relevance');

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

  if (facts && facts.candidateFeature) return true;
  if (weak || conflict) return true;
  if (need === 'operation' || need === 'error' || need === 'knowledge') return true;
  if (
    /(기능|어디|메뉴|버튼|어떻게|사용|오류|에러|편곡|arrange|easy\s*key|cleanup|노트\s*정리|예약\s*변환|변환)/i.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

function pushTerm(terms, t) {
  const s = String(t || '').trim();
  if (!s) return;
  if (isRoutingLabel(s)) return;
  if (isGenericToken(s) && !s.includes(' ')) return;
  if (!terms.some((x) => x.toLowerCase() === s.toLowerCase())) terms.push(s);
}

/**
 * Build product semantic search terms only.
 * Do NOT pass planner sourcePlan labels (operation/knowledge/…).
 */
function buildSearchTerms({ question, rawQuestion, facts } = {}) {
  const terms = [];
  const semantic = [];

  const pushSemantic = (t) => {
    pushTerm(terms, t);
    pushTerm(semantic, t);
  };

  if (facts && facts.candidateFeature) pushTerm(terms, facts.candidateFeature);
  for (const e of (facts && facts.candidateEntities) || []) pushTerm(terms, e);

  const q = String(question || rawQuestion || '');

  if (/편곡/.test(q)) {
    pushSemantic('편곡');
    pushSemantic('Arrange');
    pushSemantic('Instrument Arrange');
    pushSemantic('AI Instrument Arrange');
    pushSemantic('midi_ai_instrument_arrange');
    pushSemantic('AI Assistant');
  }
  if (/자동.*악기|악기.*나(?:누|눠)|instrument\s*arrange|스템|stem\s*split/i.test(q)) {
    pushSemantic('AI Instrument Arrange');
    pushSemantic('midi_ai_instrument_arrange');
    pushSemantic('instrument arrange');
    pushSemantic('Guided Arrangement');
  }
  if (/쉬운\s*키|이지\s*키|easy\s*key|쉬운\s*조/i.test(q)) {
    pushSemantic('Easier Key');
    pushSemantic('midi_ai_easy_key');
    pushSemantic('Easy Key');
    pushSemantic('쉬운 조 추천');
  }
  if (/노트\s*정리|클린업|(?:^|[^a-z])cleanup/i.test(q)) {
    pushSemantic('AI Cleanup');
    pushSemantic('midi_ai_cleanup');
    pushSemantic('Cleanup');
  }
  if (/예약\s*변환|예약변환|예액\s*변환|예액변환/i.test(q)) {
    pushSemantic('예약변환');
    pushSemantic('예약 변환');
    pushSemantic('scheduled conversion');
    pushSemantic('schedule convert');
    pushSemantic('convert queue');
  }
  if (/변환\s*방법|변환방법|유튜브|youtube|오디오.*midi|pdf.*midi/i.test(q) && !/편곡|arrange/i.test(q)) {
    pushSemantic('변환');
    pushSemantic('conversion');
    pushSemantic('audio to MIDI');
    pushSemantic('YouTube to MIDI');
    pushSemantic('youtube');
  }
  if (/퀀텀\s*폴드|quantum\s*fold/i.test(q)) {
    pushSemantic('QuantumFold');
  }
  if (/템포|tempo|bpm/i.test(q)) {
    pushSemantic('tempo');
    pushSemantic('BPM');
  }

  // USER surface tokens (non-generic only)
  for (const t of String(q)
    .split(/[\s,./|?？!！]+/)
    .filter((x) => x.length >= 2)
    .slice(0, 6)) {
    pushTerm(terms, t);
  }

  return {
    terms: terms.slice(0, 8),
    semanticTerms: semantic.slice(0, 8)
  };
}

module.exports = {
  shouldUsePrivateSource,
  isPersonalOrPaymentQuestion,
  buildSearchTerms
};
