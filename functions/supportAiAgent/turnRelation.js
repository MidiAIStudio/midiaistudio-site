/**
 * Turn relation classifier: CONTINUE | FOLLOW_UP | CORRECTION | TOPIC_SHIFT | AMBIGUOUS
 * CURRENT message is primary. Old topics must not rewrite a clear new question.
 */
'use strict';

const {
  normalizeSpace: _ns,
  hasStrongTopic,
  hasExplicitTopic,
  hasStandaloneSubject,
  looksLikeFollowUp,
  compressTopic,
  CORRECTION_RE,
  DOMAIN_SUBJECT_RE
} = (() => {
  const ctx = require('../knowledge/conversationContext');
  return {
    normalizeSpace: (s) =>
      String(s || '')
        .replace(/\s+/g, ' ')
        .trim(),
    hasStrongTopic: ctx.hasStrongTopic,
    hasExplicitTopic: ctx.hasExplicitTopic,
    hasStandaloneSubject: ctx.hasStandaloneSubject,
    looksLikeFollowUp: ctx.looksLikeFollowUp,
    compressTopic: ctx.compressTopic,
    CORRECTION_RE: ctx.CORRECTION_RE,
    DOMAIN_SUBJECT_RE: ctx.DOMAIN_SUBJECT_RE
  };
})();

function normalizeSpace(s) {
  return _ns(s);
}

const RELATION = {
  CONTINUE: 'CONTINUE',
  FOLLOW_UP: 'FOLLOW_UP',
  CORRECTION: 'CORRECTION',
  TOPIC_SHIFT: 'TOPIC_SHIFT',
  AMBIGUOUS: 'AMBIGUOUS'
};

function topicFamily(text) {
  const s = normalizeSpace(text);
  if (!s) return 'none';
  if (/(비밀\s*키|시크릿|api\s*key|client\s*secret|자격\s*증명|패스워드|비밀번호)/i.test(s)) return 'security';
  if (/(사업자|상호|대표자|사업장|통신판매)/i.test(s)) return 'company_info';
  // Structural contact domain (not phrase-specific hardcodes)
  if (/(전화|연락|고객센터|고객지원|문의\s*(처|채널|게시|남|할)|상담\s*채팅|1\s*:\s*1)/i.test(s)) {
    return 'company_contact';
  }
  if (/(할인|이벤트|프로모션|쿠폰)/i.test(s)) return 'promotion';
  if (/(충전|구매|결제|사려|사려고|샀|샀는)/i.test(s) && /(크레딧|이용권|라이선스|패스|\d+\s*일)/i.test(s)) {
    return 'purchase';
  }
  if (/(결제).{0,8}(됐|됐어|완료|성공|확인)/i.test(s) || /(안\s*들어|미반영|적용\s*안)/i.test(s)) {
    return 'purchase';
  }
  if (
    /(크레딧|credit).{0,12}(얼마|가격|원|비용)/i.test(s) ||
    /\d+\s*개.{0,8}(얼마|가격)/i.test(s) ||
    /(\d+\s*일|이용권|평생권|lifetime).{0,12}(얼마|가격)/i.test(s)
  ) {
    return 'price';
  }
  if (/(크레딧|credit).{0,12}(뭐|무엇|이란|뜻|의미)/i.test(s)) return 'credit_def';
  if (/(크레딧|credit)/i.test(s)) return 'credit';
  if (/(403|404|429|유튜브|youtube|오디오\s*다운로드|가져오)/i.test(s)) return 'youtube_error';
  if (/(변환|실패|오류|에러)/i.test(s)) return 'conversion';
  if (/(패치|업데이트|릴리스|릴리즈)/i.test(s)) return 'release';
  if (hasStrongTopic(s) || hasExplicitTopic(s)) return 'product';
  return 'other';
}

function familiesCompatible(a, b) {
  if (!a || !b || a === 'none' || b === 'none') return true;
  if (a === b) return true;
  const company = new Set(['company_info', 'company_contact']);
  if (company.has(a) && company.has(b)) return true;
  const commerce = new Set(['credit', 'credit_def', 'price', 'purchase', 'promotion']);
  if (commerce.has(a) && commerce.has(b)) return true;
  const trouble = new Set(['conversion', 'youtube_error']);
  if (trouble.has(a) && trouble.has(b)) return true;
  return false;
}

/**
 * Classify relation of current turn to previous conversation.
 */
function classifyTurnRelation({
  rawQuestion,
  priorUserTurns = [],
  priorAiReplies = []
} = {}) {
  const raw = normalizeSpace(rawQuestion);
  const prior = (priorUserTurns || []).map(normalizeSpace).filter(Boolean);
  const lastUser = prior.length ? prior[prior.length - 1] : '';
  const lastAi = (priorAiReplies || []).filter(Boolean).slice(-1)[0] || '';

  if (!raw) {
    return {
      relation: RELATION.AMBIGUOUS,
      currentFamily: 'none',
      previousFamily: topicFamily(lastUser),
      useHistoryForRetrieval: false,
      reason: 'empty'
    };
  }

  if (CORRECTION_RE.test(raw)) {
    return {
      relation: RELATION.CORRECTION,
      currentFamily: topicFamily(lastUser),
      previousFamily: topicFamily(lastUser),
      useHistoryForRetrieval: true,
      historyScope: 'last_exchange',
      reason: 'correction_phrase',
      lastAiHint: lastAi ? normalizeSpace(lastAi).slice(0, 120) : ''
    };
  }

  const curFam = topicFamily(raw);
  const prevFam = topicFamily(lastUser);

  if (hasStandaloneSubject(raw)) {
    if (prior.length && !familiesCompatible(curFam, prevFam)) {
      return {
        relation: RELATION.TOPIC_SHIFT,
        currentFamily: curFam,
        previousFamily: prevFam,
        useHistoryForRetrieval: false,
        historyScope: 'none',
        reason: 'incompatible_domain'
      };
    }
    if (prior.length && familiesCompatible(curFam, prevFam) && curFam !== 'other' && curFam !== 'none') {
      return {
        relation: RELATION.CONTINUE,
        currentFamily: curFam,
        previousFamily: prevFam,
        useHistoryForRetrieval: true,
        historyScope: 'recent_compatible',
        reason: 'compatible_domain_continue'
      };
    }
    // Standalone subject with no conflicting prior — treat as fresh topic root
    return {
      relation: prior.length ? RELATION.TOPIC_SHIFT : RELATION.CONTINUE,
      currentFamily: curFam,
      previousFamily: prevFam,
      useHistoryForRetrieval: false,
      historyScope: 'none',
      reason: 'standalone_subject'
    };
  }

  if (looksLikeFollowUp(raw)) {
    if (!prior.length) {
      return {
        relation: RELATION.CONTINUE,
        currentFamily: curFam || 'none',
        previousFamily: 'none',
        useHistoryForRetrieval: false,
        historyScope: 'none',
        reason: 'first_turn'
      };
    }
    return {
      relation: RELATION.FOLLOW_UP,
      currentFamily: prevFam || curFam,
      previousFamily: prevFam,
      useHistoryForRetrieval: true,
      historyScope: 'carry_topic',
      reason: 'referential_follow_up'
    };
  }

  if (prior.length && familiesCompatible(curFam, prevFam)) {
    return {
      relation: RELATION.CONTINUE,
      currentFamily: curFam,
      previousFamily: prevFam,
      useHistoryForRetrieval: true,
      historyScope: 'recent_compatible',
      reason: 'same_family'
    };
  }

  if (prior.length && curFam !== 'other' && prevFam !== 'none' && !familiesCompatible(curFam, prevFam)) {
    return {
      relation: RELATION.TOPIC_SHIFT,
      currentFamily: curFam,
      previousFamily: prevFam,
      useHistoryForRetrieval: false,
      historyScope: 'none',
      reason: 'clear_shift'
    };
  }

  return {
    relation: RELATION.AMBIGUOUS,
    currentFamily: curFam,
    previousFamily: prevFam,
    useHistoryForRetrieval: false,
    historyScope: 'none',
    reason: 'ambiguous'
  };
}

/**
 * Resolve retrieval query with turn-relation awareness.
 * TOPIC_SHIFT / standalone subjects never inherit old topics.
 */
function resolveTurnQuery({
  rawQuestion,
  priorUserTurns = [],
  priorAiReplies = [],
  legacyResolve
} = {}) {
  const raw = normalizeSpace(rawQuestion);
  const relation = classifyTurnRelation({ rawQuestion: raw, priorUserTurns, priorAiReplies });

  if (relation.relation === RELATION.CORRECTION) {
    const lastUser = (priorUserTurns || []).filter(Boolean).slice(-1)[0] || '';
    const lastAi = (priorAiReplies || []).filter(Boolean).slice(-1)[0] || '';
    return {
      ...relation,
      rawQuestion: raw,
      resolvedQuestion: [lastUser, lastAi ? `이전답변요지:${normalizeSpace(lastAi).slice(0, 100)}` : '', raw]
        .filter(Boolean)
        .join(' ')
        .slice(0, 240),
      followUp: true,
      carriedTopic: compressTopic(lastUser),
      ambiguousPivot: null,
      turnsForUnderstanding: [lastUser, raw].filter(Boolean),
      ignoredHistoryTurns: (priorUserTurns || []).slice(0, -1),
      ignoreLegacyCarry: true
    };
  }

  if (relation.relation === RELATION.TOPIC_SHIFT || relation.historyScope === 'none') {
    return {
      ...relation,
      rawQuestion: raw,
      resolvedQuestion: raw,
      followUp: false,
      carriedTopic: null,
      ambiguousPivot: null,
      turnsForUnderstanding: [raw],
      ignoredHistoryTurns: priorUserTurns || [],
      ignoreLegacyCarry: true
    };
  }

  let legacy = null;
  if (typeof legacyResolve === 'function') {
    legacy = legacyResolve({ rawQuestion: raw, priorUserTurns });
  }

  if (relation.relation === RELATION.FOLLOW_UP && legacy && legacy.followUp) {
    return {
      ...relation,
      rawQuestion: raw,
      resolvedQuestion: legacy.resolvedQuestion || raw,
      followUp: true,
      carriedTopic: legacy.carriedTopic || null,
      ambiguousPivot: legacy.ambiguousPivot || null,
      turnsForUnderstanding: [...(priorUserTurns || []).slice(-3), raw],
      ignoredHistoryTurns: (priorUserTurns || []).slice(0, -3),
      ignoreLegacyCarry: false
    };
  }

  if (relation.relation === RELATION.CONTINUE) {
    return {
      ...relation,
      rawQuestion: raw,
      resolvedQuestion: raw,
      followUp: false,
      carriedTopic: null,
      ambiguousPivot: null,
      turnsForUnderstanding: [...(priorUserTurns || []).slice(-3), raw],
      ignoredHistoryTurns: (priorUserTurns || []).slice(0, -3),
      ignoreLegacyCarry: false
    };
  }

  return {
    ...relation,
    rawQuestion: raw,
    resolvedQuestion: raw,
    followUp: false,
    carriedTopic: null,
    ambiguousPivot: null,
    turnsForUnderstanding: [raw],
    ignoredHistoryTurns: priorUserTurns || [],
    ignoreLegacyCarry: true
  };
}

module.exports = {
  RELATION,
  classifyTurnRelation,
  resolveTurnQuery,
  hasStandaloneSubject,
  topicFamily,
  familiesCompatible,
  DOMAIN_SUBJECT_RE,
  CORRECTION_RE
};
