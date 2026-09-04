/**
 * Final answer synthesizer — authoritative turn context + semantic drift gate.
 * Answer stage must NOT re-consume full unrelated transcript.
 */
'use strict';

const { loadState, statePromptBlock } = require('./conversationState');

const SYNTH_SYSTEM = [
  'You are MidiAI Studio support answer synthesizer.',
  'AUTHORITATIVE_TURN_CONTEXT is the absolute source of truth for this turn.',
  'Priority (highest first):',
  '1) CURRENT_USER_MESSAGE',
  '2) CURRENT_GOAL',
  '3) TOOL_EVIDENCE (binding / authoritative when present)',
  '4) ACCEPTED_KNOWLEDGE',
  '5) ACTIVE_FACTS + PERSISTENT_FACTS',
  '6) RELEVANT_USER_TURNS_ONLY',
  'Never let HISTORICAL / REJECTED_OLD_TOPICS (403, YouTube, company phone) become the answer center.',
  'If TOOL_EVIDENCE is present, your answer MUST cite those facts (license/payment/credits/account).',
  'Do not invent prices or account data beyond TOOL / KNOWLEDGE evidence.',
  'Answer the CURRENT_GOAL in the first sentence.',
  'Return ONLY compact JSON:',
  '{ "answer": string, "usedEvidence": string[], "answeredGoal": string, "needsMoreInfo": boolean, "nextAction": string|null }',
  'answer = natural customer language. No schema dumps, no secrets, no internal ids.'
].join(' ');

function topicFamilyOf(text) {
  const s = String(text || '');
  // Commerce/account before company: bare "문의" often appears in commerce answers ("문의로 이해…")
  if (/(결제|이용권|크레딧|할인|가격|얼마|환불|샀|구매|만료|라이선스|lifetime|반영|들어왔|안들어)/i.test(s)) {
    return 'commerce';
  }
  if (/(403|404|429|유튜브|youtube|변환|실패|오류|ffmpeg)/i.test(s)) return 'conversion';
  if (
    /(전화|대표\s*번|연락처|고객센터|사업자|회사\s*(연락|문의|정보)|이메일|문의\s*남|문의\s*게시|1:1\s*문의)/i.test(
      s
    )
  ) {
    return 'company';
  }
  if (/(account|계정)/i.test(s)) return 'account';
  return 'other';
}

function familiesRelated(a, b) {
  if (!a || !b || a === 'other' || b === 'other') return true;
  if (a === b) return true;
  const commerce = new Set(['commerce', 'account']);
  if (commerce.has(a) && commerce.has(b)) return true;
  return false;
}

/**
 * Select only history turns relevant to current goal/area.
 */
function selectRelevantHistory({ userTurns = [], priorAiReplies = [], understanding, relation } = {}) {
  const rel = String(
    relation || understanding?.effectiveRelation || understanding?.relation || ''
  ).toUpperCase();
  if (rel === 'TOPIC_SHIFT') {
    return { userLines: [], aiLines: [], reason: 'topic_shift_cleared' };
  }
  const area = String(understanding?.productArea || understanding?.topic || '');
  const goalFam =
    topicFamilyOf(understanding?.userGoal || '') ||
    topicFamilyOf(area) ||
    (area === 'account' ? 'commerce' : 'other');
  const users = (userTurns || []).map(String).filter(Boolean);
  const ais = (priorAiReplies || []).map(String).filter(Boolean);

  if (rel === 'CORRECTION') {
    return {
      userLines: users.slice(-2),
      aiLines: ais.slice(-1),
      reason: 'correction_last_exchange'
    };
  }

  const relevantUsers = [];
  for (let i = users.length - 1; i >= 0 && relevantUsers.length < 4; i--) {
    const fam = topicFamilyOf(users[i]);
    if (familiesRelated(goalFam, fam) || i === users.length - 1) {
      relevantUsers.unshift(users[i]);
    }
  }
  const relevantAi = [];
  for (let i = ais.length - 1; i >= 0 && relevantAi.length < 2; i--) {
    const fam = topicFamilyOf(ais[i]);
    if (familiesRelated(goalFam, fam)) relevantAi.unshift(ais[i].slice(0, 180));
  }
  return { userLines: relevantUsers, aiLines: relevantAi, reason: 'goal_filtered' };
}

function buildAuthoritativeContext({
  rawQuestion,
  understanding,
  conversationState,
  relation,
  toolSnapshot,
  passages,
  userTurns,
  priorAiReplies,
  locale
} = {}) {
  const state = loadState(conversationState);
  const u = understanding || {};
  const rel = String(relation || u.effectiveRelation || u.relation || 'CONTINUE').toUpperCase();
  const area = String(u.productArea || state.currentTopic || state.epochTopic || '').toLowerCase();
  const hist = selectRelevantHistory({
    userTurns,
    priorAiReplies,
    understanding: { ...u, productArea: area },
    relation: rel
  });

  const toolEvidence = [];
  if (toolSnapshot) {
    if (Array.isArray(toolSnapshot.canonicalFacts)) {
      for (const f of toolSnapshot.canonicalFacts) toolEvidence.push(String(f));
    }
    if (toolSnapshot.blocks) {
      for (const b of toolSnapshot.blocks) toolEvidence.push(String(b));
    }
    if (toolSnapshot.licenseSummary) toolEvidence.push(`license:${toolSnapshot.licenseSummary}`);
    if (toolSnapshot.paymentSummary) toolEvidence.push(`payment:${toolSnapshot.paymentSummary}`);
    if (toolSnapshot.creditSummary) toolEvidence.push(`credit:${toolSnapshot.creditSummary}`);
    if (toolSnapshot.paymentQueryStatus) {
      toolEvidence.push(`payment_query_status=${toolSnapshot.paymentQueryStatus}`);
    }
  }

  const knowledge = (passages || [])
    .filter((p) => {
      const id = String(p.id || '');
      if (
        (area === 'commerce' || area === 'account') &&
        /business-registration|support-contact|youtube|conversion-generic/i.test(id)
      ) {
        return false;
      }
      if (area === 'company' && /youtube|conversion-generic|live-catalog/i.test(id)) return false;
      return true;
    })
    .slice(0, 4)
    .map((p) => {
      const body = String(p.summary || p.body || p.text || '').slice(0, 280);
      return `[${p.id}] ${p.title || ''}: ${body}`;
    });

  // Current-turn facts from understanding (state not yet committed)
  const turnFacts = []
    .concat(u.knownFacts || [])
    .concat(u.newFacts || [])
    .concat(u.userProvidedFacts || [])
    .map((f) => String(f).slice(0, 160))
    .filter(Boolean);

  const activeFacts = [
    ...new Set([...(state.activeFacts || []), ...turnFacts, u.userGoal ? `goal=${u.userGoal}` : null].filter(Boolean))
  ].slice(-12);

  const rejectedOld = []
    .concat(state.rejectedOldTopics || [])
    .concat(rel === 'TOPIC_SHIFT' ? [state.previousTopic, state.epochTopic].filter(Boolean) : [])
    .filter(Boolean);

  const hasTools = toolEvidence.length > 0;

  // Sticky company goals must not survive into commerce/account authoritative context
  let currentGoal = String(u.userGoal || state.currentGoal || rawQuestion || '').slice(0, 240);
  if (
    (area === 'commerce' || area === 'account') &&
    topicFamilyOf(currentGoal) === 'company' &&
    topicFamilyOf(rawQuestion) !== 'company'
  ) {
    currentGoal = String(rawQuestion || u.userGoal || '').slice(0, 240);
  }

  return {
    currentUserMessage: String(rawQuestion || '').slice(0, 300),
    currentGoal,
    currentTopic: String(u.topic || u.productArea || state.currentTopic || '').slice(0, 80),
    relation: rel,
    productArea: area,
    locale: locale || 'ko',
    activeFacts,
    persistentFacts: (state.persistentFacts || []).slice(-6),
    invalidatedFacts: (state.invalidatedFacts || []).slice(-8),
    unresolvedIssues: (state.unresolvedIssues || []).slice(-6),
    plannedActions: u.plannedActions || [],
    toolEvidence: [...new Set(toolEvidence)].slice(0, 24),
    // If tools ran this turn, they are binding regardless of area label noise
    toolBindingRequired: hasTools,
    acceptedKnowledgeEvidence: knowledge,
    rejectedOldTopics: [...new Set(rejectedOld)].slice(-8),
    relevantUserTurns: hist.userLines,
    relevantAiTurns: hist.aiLines,
    historySelectReason: hist.reason,
    epoch: state.epoch,
    epochTopic: state.epochTopic,
    stateBlock: statePromptBlock(state)
  };
}

function formatAuthorityPrompt(ctx) {
  return [
    '=== AUTHORITATIVE_TURN_CONTEXT (HIGHEST PRIORITY — IGNORE ANYTHING OUTSIDE) ===',
    `CURRENT_USER_MESSAGE: ${ctx.currentUserMessage}`,
    `CURRENT_GOAL: ${ctx.currentGoal}`,
    `CURRENT_TOPIC: ${ctx.currentTopic}`,
    `RELATION: ${ctx.relation}`,
    `PRODUCT_AREA: ${ctx.productArea}`,
    `EPOCH: ${ctx.epoch} (${ctx.epochTopic || 'n/a'})`,
    `ACTIVE_FACTS: ${(ctx.activeFacts || []).join(' | ') || '(none)'}`,
    `PERSISTENT_FACTS: ${(ctx.persistentFacts || []).join(' | ') || '(none)'}`,
    `INVALIDATED_FACTS (do not revive): ${(ctx.invalidatedFacts || []).join(' | ') || '(none)'}`,
    `UNRESOLVED: ${(ctx.unresolvedIssues || []).join(' | ') || '(none)'}`,
    `REJECTED_OLD_TOPICS (FORBIDDEN as answer center): ${(ctx.rejectedOldTopics || []).join(' | ') || '(none)'}`,
    `TOOL_BINDING_REQUIRED: ${ctx.toolBindingRequired ? 'YES' : 'NO'}`,
    `TOOL_EVIDENCE:`,
    ...(ctx.toolEvidence && ctx.toolEvidence.length ? ctx.toolEvidence.map((x) => `- ${x}`) : ['- (none)']),
    `ACCEPTED_KNOWLEDGE:`,
    ...(ctx.acceptedKnowledgeEvidence && ctx.acceptedKnowledgeEvidence.length
      ? ctx.acceptedKnowledgeEvidence.map((x) => `- ${x}`)
      : ['- (none)']),
    `RELEVANT_USER_TURNS_ONLY (${ctx.historySelectReason || ''}): ${
      (ctx.relevantUserTurns || []).join(' || ') || '(none)'
    }`,
    `RELEVANT_AI_TURNS_ONLY: ${(ctx.relevantAiTurns || []).join(' || ') || '(none)'}`,
    `LOCALE: ${ctx.locale}`,
    'Return JSON only.'
  ].join('\n');
}

function parseSynthJson(text) {
  if (!text) return null;
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const obj = JSON.parse(m[0]);
    if (!obj || typeof obj !== 'object') return null;
    const answer = String(obj.answer || obj.text || '').trim();
    if (!answer) return null;
    return {
      answer: answer.slice(0, 1800),
      usedEvidence: Array.isArray(obj.usedEvidence) ? obj.usedEvidence.map(String).slice(0, 8) : [],
      answeredGoal: String(obj.answeredGoal || '').slice(0, 240),
      needsMoreInfo: !!obj.needsMoreInfo,
      nextAction: obj.nextAction ? String(obj.nextAction).slice(0, 80) : null
    };
  } catch (_) {
    return null;
  }
}

function isCommerceLike(authority) {
  const area = String((authority && authority.productArea) || '').toLowerCase();
  const goal = String((authority && authority.currentGoal) || '');
  const fam = topicFamilyOf(goal);
  return area === 'commerce' || area === 'account' || fam === 'commerce' || fam === 'account';
}

/**
 * Semantic drift gate — goal/tool/history mismatch.
 */
function semanticDriftGate({ answerText, authority, toolSnapshot } = {}) {
  const failures = [];
  const text = String(answerText || '');
  const goal = String((authority && authority.currentGoal) || '').toLowerCase();
  const area = String((authority && authority.productArea) || '').toLowerCase();

  if (!text.trim()) {
    return { ok: false, failures: ['empty_answer'], nextAction: 'SYNTHESIZE_AGAIN' };
  }

  const ansFam = topicFamilyOf(text);
  const goalFam = topicFamilyOf(goal) || topicFamilyOf(area);

  if (
    goalFam &&
    goalFam !== 'other' &&
    ansFam &&
    ansFam !== 'other' &&
    !familiesRelated(goalFam, ansFam)
  ) {
    failures.push('semantic_mismatch_goal_family');
  }

  if (isCommerceLike(authority)) {
    if (
      /(대표전화|010-\d{3,4}-\d{4}|사업자등록|유튜브|403\s*오류|오디오를 가져오|회사에 연락)/i.test(text) &&
      !/(이용권|결제|크레딧|Lifetime|만료|반영|승인|할인|\d+\s*,?\d*\s*원)/i.test(text)
    ) {
      failures.push('inactive_historical_topic_centered');
    }
  }

  if (area === 'company' && /(403|유튜브|youtube|변환 실패)/i.test(text) && !/(연락|전화|이메일|문의)/i.test(text)) {
    failures.push('company_answered_as_conversion');
  }

  const hasTool =
    toolSnapshot &&
    (toolSnapshot.licenseSummary ||
      toolSnapshot.paymentSummary ||
      toolSnapshot.creditSummary ||
      (toolSnapshot.canonicalFacts && toolSnapshot.canonicalFacts.length) ||
      (toolSnapshot.facts && toolSnapshot.facts.length));

  if (hasTool && authority && authority.toolBindingRequired) {
    const mentionsToolish = /(이용권|라이선스|lifetime|만료|결제|잔액|크레딧|활성|반영|조회|계정)/i.test(
      text
    );
    if (!mentionsToolish) {
      failures.push('tool_evidence_ignored');
    }
    if (
      toolSnapshot.licenseSummary &&
      !/(이용권|lifetime|평생|라이선스)/i.test(text)
    ) {
      failures.push('tool_license_not_reflected');
    }
    if (
      /lifetime|평생/i.test(String(toolSnapshot.licenseSummary || '')) &&
      !/(lifetime|평생)/i.test(text)
    ) {
      failures.push('tool_lifetime_not_reflected');
    }
    const toolBits = [
      toolSnapshot.licenseSummary,
      toolSnapshot.paymentSummary,
      toolSnapshot.creditSummary,
      ...(toolSnapshot.canonicalFacts || [])
    ]
      .filter(Boolean)
      .join(' ');
    if (
      /lifetime/i.test(toolBits) &&
      /(만료|언제까지|이용권|안\s*들어|미반영|샀|구매)/i.test(goal) &&
      !/(lifetime|평생|만료\s*없|무기한|활성)/i.test(text)
    ) {
      failures.push('tool_lifetime_not_reflected');
    }
    if (
      toolSnapshot.paymentQueryStatus === 'QUERY_FAILED' &&
      /(결제\s*(내역|기록).{0,8}(없|없습)|구매\s*기록\s*없|결제.{0,10}(완료되지|안\s*됐|실패)|결제가\s*완료되지)/i.test(
        text
      )
    ) {
      failures.push('payment_query_failed_misread_as_empty');
    }
  }

  // User-asserted payment success vs answer contradiction
  if (
    ((authority && authority.activeFacts) || []).some((f) => /payment.?success|결제.{0,4}됐|결제\s*완료/i.test(f)) &&
    /(결제.{0,10}(완료되지|안\s*됐|실패)|결제가\s*완료되지)/i.test(text)
  ) {
    failures.push('contradicts_user_payment_fact');
  }

  if (
    ((authority && authority.invalidatedFacts) || []).some((f) => /need_phone|전화/i.test(f)) &&
    /대표전화|010-\d{3,4}-\d{4}/.test(text) &&
    !/이메일|1:1|문의 게시판/.test(text)
  ) {
    failures.push('invalidated_phone_still_active');
  }

  // Even if non-phone channel is also mentioned, leading with phone after invalidation is drift
  if (
    ((authority && authority.invalidatedFacts) || []).some((f) => /need_phone|전화/i.test(f)) &&
    /010-\d{3,4}-\d{4}/.test(text) &&
    ((authority && authority.activeFacts) || []).some((f) => /non_phone|전화\s*없|1:1|문의/i.test(f))
  ) {
    failures.push('invalidated_phone_still_active');
  }

  if (failures.length) {
    return { ok: false, failures, nextAction: 'SYNTHESIZE_AGAIN' };
  }
  return { ok: true, failures: [], nextAction: null };
}

function catalogBoundFallback({ authority, passages, locale }) {
  const loc = locale || 'ko';
  const catalog = (passages || []).find((p) => String(p.id || '').startsWith('live-catalog'));
  if (!catalog) return null;
  const products = Array.isArray(catalog.customerSafeProducts) ? catalog.customerSafeProducts : [];
  const goal = String((authority && authority.currentGoal) || authority.currentUserMessage || '');
  // Prefer a single matching product when the goal names a duration/credit amount structurally
  let hit = null;
  const day = goal.match(/(\d+)\s*일/);
  const credit = goal.match(/크레딧\s*(\d+)|\b(\d+)\s*개/);
  if (day) {
    const d = Number(day[1]);
    hit = products.find((p) => Number(p.durationDays) === d);
  } else if (credit) {
    const n = Number(credit[1] || credit[2]);
    hit = products.find((p) => Number(p.creditAmount) === n);
  }
  if (hit && Number.isFinite(Number(hit.priceKrw))) {
    const price = Number(hit.priceKrw).toLocaleString('ko-KR');
    const name = hit.name || hit.title || '해당 상품';
    return loc === 'en' ? `${name} is ${price} KRW.` : `${name}은(는) ${price}원입니다.`;
  }
  if (/(할인|프로모션|쿠폰)/i.test(goal)) {
    const hasSale = products.some((p) => {
      const list = Number(p.listPriceKrw || 0);
      const price = Number(p.priceKrw || 0);
      return list > 0 && price > 0 && price < list;
    });
    return hasSale
      ? loc === 'en'
        ? 'Some plans currently show a reduced price on the Purchase page.'
        : '일부 상품에 할인 가격이 표시되어 있을 수 있습니다. 구매 페이지 표시를 확인해 주세요.'
      : loc === 'en'
        ? 'No confirmed discount event in the current sellable catalog.'
        : '현재 확인된 할인 이벤트는 없습니다. 가격은 구매 페이지 표시를 기준으로 합니다.';
  }
  return null;
}

function toolBoundFallback({ authority, toolSnapshot, locale }) {
  const loc = locale || 'ko';
  const bits = [
    toolSnapshot && toolSnapshot.licenseSummary,
    toolSnapshot && toolSnapshot.paymentSummary,
    toolSnapshot && toolSnapshot.creditSummary
  ]
    .filter(Boolean)
    .join(' / ');
  if (!bits && !(toolSnapshot && toolSnapshot.paymentQueryStatus)) return null;
  const payStatus = toolSnapshot && toolSnapshot.paymentQueryStatus;
  let payNote = '';
  if (payStatus === 'QUERY_FAILED' || payStatus === 'UNAVAILABLE') {
    payNote =
      loc === 'en'
        ? ' Payment history lookup could not be completed right now (this is not the same as “no payment”).'
        : ' 결제 이력 조회는 현재 완료하지 못했습니다(결제 없음/결제 실패와는 다릅니다).';
  } else if (payStatus === 'NOT_FOUND') {
    payNote =
      loc === 'en'
        ? ' No recent payment records were found on this account.'
        : ' 이 계정에서 최근 결제 기록은 확인되지 않았습니다.';
  }
  const goal =
    (authority && authority.currentUserMessage) || (authority && authority.currentGoal) || '';
  const factBits = ((authority && authority.activeFacts) || [])
    .filter((f) => !/^goal=/i.test(f))
    .slice(0, 3)
    .join(', ');
  if (loc === 'en') {
    return `Regarding “${goal}”: ${bits || 'account tools ran'}.${payNote}${
      factBits ? ` Noted: ${factBits}.` : ''
    } If this still does not match your purchase, share the payment time and product name.`;
  }
  return `「${goal}」 기준으로 계정 조회 결과: ${bits || '(도구 결과)'}.${payNote}${
    factBits ? ` 확인된 사실: ${factBits}.` : ''
  } 구매 내용과 다르면 결제 시각·상품명을 알려 주세요.`;
}

function nonPhoneSupportFallback({ locale }) {
  const loc = locale || 'ko';
  return loc === 'en'
    ? 'Please use the website 1:1 inquiry board or in-app 1:1 Support (no phone required).'
    : '전화 없이 문의하시려면 웹사이트 1:1 문의 게시판 또는 앱의 1:1 Support를 이용해 주세요.';
}

function buildNoEvidenceFromState({ authority, locale }) {
  const loc = locale || 'ko';
  const goal = (authority && authority.currentGoal) || '';
  const facts = ((authority && authority.activeFacts) || [])
    .filter((f) => !/^goal=/i.test(f))
    .slice(0, 4)
    .join(', ');
  if (facts) {
    return loc === 'en'
      ? `I understand: ${goal || 'your request'}. Already noted: ${facts}. I still need one missing detail — payment approval vs pass activation?`
      : `${goal || '문의'} 상황을 기준으로 이해했습니다. 이미 확인된 내용: ${facts}. 지금 확인할 항목이 결제 승인인지, 이용권 반영인지 한 가지만 짚어 주세요.`;
  }
  return loc === 'en'
    ? `I could not confirm that from official materials yet for: ${goal || 'your question'}. Which detail should I verify next?`
    : `「${goal || '요청'}」에 대해 공식 자료만으로는 바로 확정하기 어렵습니다. 지금 확인할 핵심이 무엇인가요?`;
}

async function synthesizeAnswer({
  callLlm,
  authority,
  toolSnapshot,
  passages = [],
  locale,
  allowRetry = true
} = {}) {
  const userPrompt = formatAuthorityPrompt(authority);
  let parsed = null;
  let raw = null;
  if (typeof callLlm === 'function') {
    try {
      raw = await callLlm(SYNTH_SYSTEM, userPrompt);
      parsed = parseSynthJson(raw);
      if (!parsed && raw && String(raw).trim().length > 20 && !String(raw).trim().startsWith('{')) {
        parsed = {
          answer: String(raw).trim().slice(0, 1800),
          usedEvidence: [],
          answeredGoal: authority.currentGoal,
          needsMoreInfo: false,
          nextAction: null
        };
      }
    } catch (_) {
      parsed = null;
    }
  }

  let text = parsed && parsed.answer;
  let gate = semanticDriftGate({ answerText: text, authority, toolSnapshot });
  let retried = false;

  if ((!text || !gate.ok) && allowRetry && typeof callLlm === 'function') {
    retried = true;
    const retryPrompt = [
      userPrompt,
      '',
      'PREVIOUS_DRAFT_FAILED_DRIFT_CHECK:',
      text || '(empty)',
      `FAILURES: ${(gate.failures || ['empty']).join(', ')}`,
      'Rewrite JSON. Answer ONLY CURRENT_GOAL.',
      'If TOOL_EVIDENCE exists, the answer MUST reflect those tool facts.',
      'Do NOT mention 403, YouTube, company phone, or business registration unless CURRENT_GOAL is about them.'
    ].join('\n');
    try {
      raw = await callLlm(SYNTH_SYSTEM, retryPrompt);
      parsed = parseSynthJson(raw) || parsed;
      text = parsed && parsed.answer;
      gate = semanticDriftGate({ answerText: text, authority, toolSnapshot });
    } catch (_) {
      /* keep prior */
    }
  }

  if (!text || !gate.ok) {
    if ((gate.failures || []).includes('invalidated_phone_still_active')) {
      return {
        text: nonPhoneSupportFallback({ locale }),
        parsed,
        gate: {
          ok: true,
          failures: [...(gate.failures || []), 'fallback_non_phone'],
          nextAction: null
        },
        retried,
        usedAuthority: true
      };
    }
    const bound = toolBoundFallback({ authority, toolSnapshot, locale });
    if (bound) {
      return {
        text: bound,
        parsed,
        gate: {
          ok: true,
          failures: [...(gate.failures || []), 'fallback_tool_bound'],
          nextAction: null
        },
        retried,
        usedAuthority: true
      };
    }
    const cat = catalogBoundFallback({
      authority,
      passages: passages.length ? passages : undefined,
      locale
    });
    // Also try knowledge strings embedded in authority
    const fromAuth = catalogBoundFallback({
      authority,
      passages: (authority.acceptedKnowledgeEvidence || [])
        .map((line) => {
          const m = String(line).match(/^\[([^\]]+)\]/);
          return m ? { id: m[1], summary: line, customerSafeProducts: null } : null;
        })
        .filter(Boolean),
      locale
    });
    if (cat || fromAuth) {
      return {
        text: cat || fromAuth,
        parsed,
        gate: {
          ok: true,
          failures: [...(gate.failures || []), 'fallback_catalog_bound'],
          nextAction: null
        },
        retried,
        usedAuthority: true
      };
    }
    return {
      text: buildNoEvidenceFromState({ authority, locale }),
      parsed,
      gate: { ok: false, failures: gate.failures || ['synth_failed'], nextAction: 'ASK_DIAGNOSTIC' },
      retried,
      usedAuthority: true
    };
  }

  return {
    text,
    parsed,
    gate,
    retried,
    usedAuthority: true
  };
}

module.exports = {
  SYNTH_SYSTEM,
  buildAuthoritativeContext,
  formatAuthorityPrompt,
  selectRelevantHistory,
  semanticDriftGate,
  synthesizeAnswer,
  toolBoundFallback,
  catalogBoundFallback,
  nonPhoneSupportFallback,
  buildNoEvidenceFromState,
  parseSynthJson,
  topicFamilyOf,
  isCommerceLike
};
