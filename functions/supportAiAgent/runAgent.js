'use strict';

const { ACTIONS } = require('./actions');
const { extractUserFacts, inferHypotheses, missingHighGainSlot } = require('./userFacts');
const { classifyNeed, decideNextAction, researchBudget } = require('./planner');
const { runResearchLoop } = require('./researchLoop');
const { selectDiagnosticQuestion } = require('./diagnosticSelector');
const { shouldUseLlmPlanner, isDeterministicFastPath } = require('./plannerAmbiguity');
const {
  diffNewUserFacts,
  isGenericTaskDiagnostic,
  buildTargetedFeatureDiagnostic,
  shouldTriggerFeatureDiscovery,
  applyDiscoveryBoosts
} = require('./featureDiscovery');
const { understandQuery } = require('./queryUnderstanding');
const { gatePassages, retrieveWithSearchPlan } = require('./relevanceGate');
const { executeSupportTools, TOOL_NAMES } = require('./supportTools');
const { assessEvidenceConfidence, CONFIDENCE } = require('./evidenceGate');
const { loadState } = require('./conversationState');

function unknownErrorCleared(rawQuestion, passages, UNKNOWN_ERROR_RE) {
  if (!UNKNOWN_ERROR_RE || !UNKNOWN_ERROR_RE.test(String(rawQuestion || ''))) return passages;
  const top = passages && passages[0];
  const strong =
    top &&
    (Number(top.score || 0) >= 15 ||
      /error|403|404|cuda|ffmpeg|timeout|오류/i.test(String(top.id || '') + String(top.title || '')));
  return strong ? passages : [];
}

function buildMismatchDiagnostic(understanding, locale = 'ko') {
  const selected = understanding.selectedMode || '선택한 모드';
  const observed = understanding.observedLabel || '다른 모드';
  if (locale === 'en') {
    return `It sounds like you selected ${selected} conversion, but the failure message mentions ${observed}. To tell whether the wrong path ran or only the error text is wrong, please share the full error text from the failure screen.`;
  }
  if (locale === 'ja') {
    return `${selected}変換を選んだのに、失敗メッセージが${observed}と出ている状態のようです。実際の変換経路の問題か、表示文言だけの問題かを切り分けるため、失敗画面のエラー全文を教えてください。`;
  }
  return `${selected} 변환을 선택했는데 '${observed} 변환 실패'처럼 다른 모드 메시지가 보인 상황으로 이해했습니다. 실제 변환 경로가 잘못된 건지, 오류 문구만 잘못된 건지 확인하려면 실패 화면에 나온 전체 오류 문구를 알려주세요.`;
}

function inferToolActions(understanding, personal) {
  const planned = Array.isArray(understanding.plannedActions) ? understanding.plannedActions.slice() : [];
  if (understanding.requiresAccountLookup) planned.push(TOOL_NAMES.LOOKUP_ACCOUNT);
  if (understanding.requiresPaymentLookup) planned.push(TOOL_NAMES.LOOKUP_PAYMENT);
  if (understanding.requiresLicenseLookup) {
    planned.push(TOOL_NAMES.LOOKUP_LICENSE);
    planned.push(TOOL_NAMES.LOOKUP_ENTITLEMENT);
  }
  if (personal) {
    planned.push(TOOL_NAMES.LOOKUP_ACCOUNT, TOOL_NAMES.LOOKUP_LICENSE, TOOL_NAMES.LOOKUP_ENTITLEMENT);
  }
  const area = String(understanding.productArea || '');
  if (area === 'account') {
    planned.push(TOOL_NAMES.LOOKUP_ACCOUNT, TOOL_NAMES.LOOKUP_LICENSE);
  }
  return [...new Set(planned.map((a) => String(a).toUpperCase()))];
}

async function runSupportAgent({
  question,
  rawQuestion,
  locale,
  personal,
  userTurns,
  priorAiReplies = [],
  turnRelation = null,
  conversationState = null,
  db = null,
  user = null,
  clarifyEarly,
  adapters,
  retrieveStaticInitial,
  isWeakOrConflictingRetrieval,
  detectAnswerIntent,
  ambiguousClarification,
  UNKNOWN_ERROR_RE,
  callLlm = null
} = {}) {
  const turns = userTurns || [rawQuestion];
  const state = loadState(conversationState);
  const understanding = await understandQuery({
    rawQuestion,
    userTurns: turns,
    priorAiReplies,
    conversationState: state,
    callLlm
  });

  // Prefer LLM relation when present; otherwise keep turnRelation from deterministic classifier
  if (understanding.relation && turnRelation && turnRelation.relation) {
    const llmRel = String(understanding.relation).toUpperCase();
    if (['CONTINUE', 'FOLLOW_UP', 'CORRECTION', 'TOPIC_SHIFT', 'AMBIGUOUS'].includes(llmRel)) {
      // LLM may upgrade TOPIC_SHIFT / CORRECTION; do not downgrade TOPIC_SHIFT to CONTINUE
      if (
        turnRelation.relation === 'TOPIC_SHIFT' ||
        turnRelation.relation === 'CORRECTION' ||
        llmRel === 'TOPIC_SHIFT' ||
        llmRel === 'CORRECTION'
      ) {
        understanding.effectiveRelation =
          llmRel === 'TOPIC_SHIFT' || turnRelation.relation === 'TOPIC_SHIFT'
            ? llmRel === 'CORRECTION'
              ? 'CORRECTION'
              : 'TOPIC_SHIFT'
            : llmRel === 'CORRECTION' || turnRelation.relation === 'CORRECTION'
              ? 'CORRECTION'
              : llmRel;
      } else {
        understanding.effectiveRelation = llmRel;
      }
    }
  }
  understanding.effectiveRelation =
    understanding.effectiveRelation ||
    (turnRelation && turnRelation.relation) ||
    understanding.relation ||
    'CONTINUE';

  // Structural guards (not phrase hardcodes):
  // 1) Explicit correction phrases must stay CORRECTION even if LLM says TOPIC_SHIFT.
  // 2) On TOPIC_SHIFT, if LLM keeps the previous domain but deterministic sees a new domain,
  //    prefer deterministic productArea/searchQueries so old company/commerce context cannot stick.
  const { CORRECTION_RE } = require('../knowledge/conversationContext');
  if (CORRECTION_RE.test(String(rawQuestion || '')) && understanding.effectiveRelation !== 'CORRECTION') {
    understanding.effectiveRelation = 'CORRECTION';
  }
  const detFallback = require('./queryUnderstanding').understandDeterministic({
    rawQuestion,
    userTurns: turns
  });
  if (understanding.effectiveRelation === 'TOPIC_SHIFT' || understanding.effectiveRelation === 'CORRECTION') {
    const prevArea = String(state.currentTopic || state.previousTopic || '').toLowerCase();
    const llmArea = String(understanding.productArea || '').toLowerCase();
    const detArea = String(detFallback.productArea || '').toLowerCase();
    const domainish = new Set(['company', 'commerce', 'security', 'troubleshooting', 'account', 'release']);
    if (
      detArea &&
      domainish.has(detArea) &&
      detArea !== llmArea &&
      (llmArea === 'company' || llmArea === 'general' || llmArea === prevArea || !llmArea)
    ) {
      understanding.productArea = detFallback.productArea;
      understanding.intent = detFallback.intent || understanding.intent;
      understanding.searchQueries = detFallback.searchQueries || understanding.searchQueries;
      understanding.resolvedQuery = detFallback.resolvedQuery || understanding.resolvedQuery;
      understanding.isUiFeatureAsk = detFallback.isUiFeatureAsk;
      if (detArea === 'commerce' || detArea === 'account') {
        understanding.requiresPaymentLookup =
          understanding.requiresPaymentLookup ||
          /결제|샀|구매|이용권|안\s*들어|미반영/i.test(String(rawQuestion || ''));
        understanding.requiresLicenseLookup =
          understanding.requiresLicenseLookup || understanding.requiresPaymentLookup;
        understanding.plannedActions = [
          ...new Set([
            ...(understanding.plannedActions || []),
            'SEARCH_KNOWLEDGE',
            ...(understanding.requiresPaymentLookup ? ['LOOKUP_PAYMENT'] : []),
            ...(understanding.requiresLicenseLookup ? ['LOOKUP_LICENSE', 'LOOKUP_ENTITLEMENT'] : [])
          ])
        ];
      }
    }
  }

  // Soft commerce domain when deterministic purchase/price intent is clear,
  // even if relation stayed CONTINUE/FOLLOW_UP (LLM sticky company area).
  {
    const detArea = String(detFallback.productArea || '').toLowerCase();
    const llmArea = String(understanding.productArea || '').toLowerCase();
    if (
      detArea === 'commerce' &&
      (detFallback.intent === 'purchase_method' ||
        detFallback.intent === 'price_lookup' ||
        detFallback.intent === 'promotion_discount') &&
      (llmArea === 'company' || llmArea === 'general' || llmArea === 'troubleshooting' || !llmArea)
    ) {
      understanding.productArea = 'commerce';
      understanding.intent = detFallback.intent || understanding.intent;
      understanding.searchQueries = detFallback.searchQueries || understanding.searchQueries;
      understanding.resolvedQuery = detFallback.resolvedQuery || understanding.resolvedQuery;
      understanding.isUiFeatureAsk = false;
      // Never keep previous-epoch company goal after commerce domain shift
      understanding.userGoal = String(rawQuestion || detFallback.userGoal || understanding.userGoal || '').slice(
        0,
        240
      );
      understanding.topic = 'purchase_entitlement';
      if (detFallback.intent === 'purchase_method') {
        understanding.requiresPaymentLookup = true;
        understanding.requiresLicenseLookup = true;
        understanding.plannedActions = [
          ...new Set([
            ...(understanding.plannedActions || []),
            'SEARCH_KNOWLEDGE',
            'LOOKUP_PAYMENT',
            'LOOKUP_LICENSE',
            'LOOKUP_ENTITLEMENT'
          ])
        ];
        if (
          understanding.effectiveRelation === 'CONTINUE' ||
          understanding.effectiveRelation === 'FOLLOW_UP' ||
          understanding.effectiveRelation === 'AMBIGUOUS'
        ) {
          understanding.effectiveRelation = 'TOPIC_SHIFT';
        }
      }
    }
  }

  // Channel correction: reject phone support without relying on a long phrase list.
  {
    const raw = String(rawQuestion || '');
    const assumption = String(state.lastAssistantAssumption || '');
    if (
      /말고|아니/i.test(raw) &&
      /전화|대표\s*번|phone/i.test(raw + ' ' + assumption) &&
      String(understanding.productArea || state.currentTopic || '').toLowerCase().includes('company')
    ) {
      understanding.effectiveRelation = 'CORRECTION';
      understanding.userGoal = String(rawQuestion || '전화 없는 문의 채널').slice(0, 240);
      understanding.newFacts = [
        ...new Set([...(understanding.newFacts || []), 'need_non_phone_support_channel'])
      ].slice(0, 6);
      understanding.knownFacts = (understanding.knownFacts || []).filter((f) => !/phone|전화|대표번/i.test(f));
    }
  }

  // Epoch lock: once purchase/account epoch is active, follow-ups stay there
  // until an explicit TOPIC_SHIFT (no per-phrase hardcodes).
  const epochArea = String(state.epochTopic || state.currentTopic || '').toLowerCase();
  const relNow = String(understanding.effectiveRelation || '').toUpperCase();
  if (
    (epochArea === 'commerce' || epochArea === 'account') &&
    (relNow === 'CONTINUE' || relNow === 'FOLLOW_UP' || relNow === 'AMBIGUOUS')
  ) {
    if (!['commerce', 'account'].includes(String(understanding.productArea || '').toLowerCase())) {
      understanding.productArea = epochArea === 'commerce' ? 'commerce' : 'account';
    }
    understanding.requiresPaymentLookup = true;
    understanding.requiresLicenseLookup = true;
    understanding.plannedActions = [
      ...new Set([
        ...(understanding.plannedActions || []),
        'LOOKUP_PAYMENT',
        'LOOKUP_LICENSE',
        'LOOKUP_ENTITLEMENT',
        'SEARCH_KNOWLEDGE'
      ])
    ];
    if (!understanding.userGoal || /company|연락|전화|문의\s*남/i.test(String(understanding.userGoal))) {
      understanding.userGoal =
        String(rawQuestion || state.currentGoal || '이용권·결제 반영 상태 확인').slice(0, 240);
    }
  }

  // Soft facts from deterministic commerce understanding (structural signals only)
  if (
    ['commerce', 'account'].includes(String(understanding.productArea || '')) &&
    detFallback &&
    (detFallback.intent === 'purchase_method' ||
      detFallback.intent === 'price_lookup' ||
      detFallback.intent === 'promotion_discount')
  ) {
    const nf = Array.isArray(understanding.newFacts) ? understanding.newFacts.slice() : [];
    if (detFallback.intent === 'purchase_method') nf.push('user_reports_purchase_or_entitlement_issue');
    if (detFallback.intent === 'price_lookup') nf.push('user_asks_price');
    understanding.newFacts = [...new Set(nf)].slice(0, 6);
    understanding.requiresKnowledge = true;
  }

  // Structural fact merge from current message (commerce epoch)
  {
    const raw = String(rawQuestion || '');
    const nf = Array.isArray(understanding.newFacts) ? understanding.newFacts.slice() : [];
    if (/결제.{0,6}(됐|완료|됐어|됐음|승인)/i.test(raw) || /payment\s*(ok|done|succeeded)/i.test(raw)) {
      nf.push('user_reports_payment_succeeded');
    }
    if (/안\s*들어|미반영|안\s*보이|대기/i.test(raw)) {
      nf.push('entitlement_not_reflected_yet');
    }
    if (/(\d+)\s*일/.test(raw) && /샀|구매|결제|패스|이용권/.test(raw)) {
      const m = raw.match(/(\d+)\s*일/);
      if (m) nf.push(`product=${m[1]}-day`);
    }
    if (nf.length) understanding.newFacts = [...new Set(nf)].slice(0, 8);
  }

  let effectiveQuestion = question;
  if (
    understanding.contradiction === 'mode_label_mismatch' ||
    (understanding.resolvedQuery && understanding.intent === 'troubleshooting')
  ) {
    effectiveQuestion = understanding.resolvedQuery || question;
  }
  if (understanding.effectiveRelation === 'TOPIC_SHIFT') {
    effectiveQuestion = rawQuestion || question;
    understanding.contradiction = understanding.contradiction === 'mode_label_mismatch' ? null : understanding.contradiction;
    if (understanding.productArea === 'studio_conversion' && understanding.intent === 'troubleshooting') {
      understanding.searchQueries = [rawQuestion].filter(Boolean);
      understanding.resolvedQuery = rawQuestion;
      understanding.selectedMode = null;
      understanding.observedLabel = null;
    }
  }

  const facts = extractUserFacts(turns);
  if (understanding.selectedMode) facts.selectedMode = understanding.selectedMode;
  if (understanding.observedLabel) facts.observedLabel = understanding.observedLabel;
  if (understanding.contradiction) facts.contradiction = understanding.contradiction;
  const isUiFeatureAsk = understanding.isUiFeatureAsk !== false;
  if (
    understanding.isUiFeatureAsk === false ||
    ['company', 'commerce', 'security', 'account'].includes(String(understanding.productArea || ''))
  ) {
    facts.candidateFeature = null;
  }

  const priorTurns = turns.length > 1 ? turns.slice(0, -1) : [];
  const prevFacts = priorTurns.length ? extractUserFacts(priorTurns) : {};
  const newUserFactsSinceLastAi = diffNewUserFacts(prevFacts, facts);
  const hypotheses = inferHypotheses(effectiveQuestion || rawQuestion, facts);
  if (understanding.contradiction === 'mode_label_mismatch') {
    hypotheses.unshift('mode_label_mismatch');
  }
  const intent = detectAnswerIntent(effectiveQuestion);
  const need = classifyNeed({ question: effectiveQuestion, rawQuestion, intent, facts });

  const lastAi = priorAiReplies && priorAiReplies.length ? priorAiReplies[priorAiReplies.length - 1] : '';
  const lastAiWasGenericDiag = isGenericTaskDiagnostic(lastAi);
  let diagnosticRepeatPrevented = false;

  // Read-only account/payment/license tools (never write)
  const toolActions = inferToolActions(understanding, personal);
  let toolResult = { calls: [], snapshot: { facts: [], blocks: [] } };
  if (db && user && toolActions.some((a) => String(a).startsWith('LOOKUP_'))) {
    toolResult = await executeSupportTools(db, user, toolActions);
  }

  const debug = {
    facts,
    hypotheses,
    need,
    intent,
    turnRelation: turnRelation
      ? {
          relation: understanding.effectiveRelation || turnRelation.relation,
          reason: turnRelation.reason,
          currentFamily: turnRelation.currentFamily,
          previousFamily: turnRelation.previousFamily,
          historyScope: turnRelation.historyScope
        }
      : { relation: understanding.effectiveRelation },
    understanding: {
      intent: understanding.intent,
      topic: understanding.topic,
      userGoal: understanding.userGoal || null,
      productArea: understanding.productArea || null,
      isUiFeatureAsk: understanding.isUiFeatureAsk,
      selectedMode: understanding.selectedMode,
      observedLabel: understanding.observedLabel,
      contradiction: understanding.contradiction,
      searchQueries: understanding.searchQueries,
      source: understanding.source,
      llmCalled: !!understanding.llmCalled,
      knownFacts: understanding.knownFacts || [],
      newFacts: understanding.newFacts || [],
      plannedActions: understanding.plannedActions || [],
      requiresAccountLookup: !!understanding.requiresAccountLookup,
      requiresPaymentLookup: !!understanding.requiresPaymentLookup,
      requiresLicenseLookup: !!understanding.requiresLicenseLookup
    },
    conversationState: state,
    toolCalls: toolResult.calls,
    toolSnapshot: toolResult.snapshot,
    relevance: { accepted: [], rejected: [], confidence: null },
    evidenceConfidence: null,
    plannerActions: [],
    sourcesSearched: [],
    researchCount: 0,
    diagnosticReason: null,
    diagnosticMode: null,
    finalAction: null,
    plannerMode: 'deterministic',
    plannerTrigger: null,
    sourcePlan: [],
    missingInfo: [],
    llmCalls: { planner: 0, diagnostic: 0, understanding: understanding.llmCalled ? 1 : 0 },
    candidateFeature: facts.candidateFeature || null,
    candidateEntities: facts.candidateEntities || [],
    discoveryTriggered: false,
    discoverySources: [],
    newUserFactsSinceLastAi,
    diagnosticRepeatPrevented: false,
    privateSourceUsed: false,
    privateSourceRef: null,
    privateSearchQueries: [],
    privateSourceHits: [],
    privateFilesFetched: 0,
    privateSafeExcerptChars: 0,
    privateRedactions: 0,
    privateSanitizations: 0,
    privateSourceFallbackReason: null,
    privateSourceLlmContext: null
  };

  // Personal account questions: prefer tool evidence over immediate counselor template
  if (personal && toolResult.calls && toolResult.calls.length) {
    debug.finalAction = ACTIONS.ANSWER;
    debug.evidenceConfidence = CONFIDENCE.MEDIUM;
    return {
      passages: [],
      clarify: null,
      lowConfidence: false,
      debug,
      understanding,
      toolSnapshot: toolResult.snapshot
    };
  }

  if (personal && (!toolResult.calls || !toolResult.calls.length)) {
    const passages = retrieveStaticInitial ? retrieveStaticInitial({ limit: 1 }) : [];
    debug.finalAction = ACTIONS.ANSWER;
    return { passages, clarify: null, lowConfidence: false, debug, understanding };
  }

  if (clarifyEarly) {
    if (facts.candidateFeature && isGenericTaskDiagnostic(clarifyEarly)) {
      diagnosticRepeatPrevented = true;
      debug.diagnosticRepeatPrevented = true;
    } else if (understanding.contradiction === 'mode_label_mismatch') {
      /* continue into mismatch path */
    } else {
      debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
      debug.diagnosticReason = 'ambiguous_pivot';
      debug.diagnosticMode = 'deterministic';
      return { passages: [], clarify: clarifyEarly, lowConfidence: false, debug, understanding };
    }
  }

  let passages = [];
  const wantsSearch =
    understanding.requiresKnowledge !== false ||
    (understanding.plannedActions || []).includes('SEARCH_KNOWLEDGE') ||
    !(understanding.plannedActions || []).includes('ANSWER_DIRECTLY');

  if (wantsSearch && understanding.searchQueries && understanding.searchQueries.length && retrieveStaticInitial) {
    const gated = retrieveWithSearchPlan(
      understanding.searchQueries,
      (q) => {
        try {
          return retrieveStaticInitial({ limit: 6, question: q }) || [];
        } catch (_) {
          return [];
        }
      },
      understanding
    );
    passages = gated.accepted;
    debug.relevance = {
      accepted: gated.accepted.map((p) => p.id),
      rejected: gated.rejected,
      confidence: gated.confidence
    };
  } else if (wantsSearch) {
    passages = retrieveStaticInitial ? retrieveStaticInitial({ limit: 4 }) : [];
    const gated = gatePassages(passages, understanding);
    passages = gated.accepted;
    debug.relevance = {
      accepted: gated.accepted.map((p) => p.id),
      rejected: gated.rejected,
      confidence: gated.confidence
    };
  }

  passages = applyDiscoveryBoosts(
    passages,
    isUiFeatureAsk ? facts.candidateFeature : null
  );
  passages = unknownErrorCleared(rawQuestion, passages, UNKNOWN_ERROR_RE);

  const weak0 = !passages.length || isWeakOrConflictingRetrieval(passages);
  const fast = isDeterministicFastPath({
    question: effectiveQuestion,
    rawQuestion,
    intent,
    facts,
    passages,
    weak: weak0
  });

  const budgetHint = researchBudget({
    need,
    weak: weak0,
    conflict: weak0 && passages.length > 1,
    passages,
    searched: [],
    facts
  });

  const compoundGate = shouldUseLlmPlanner({
    question: effectiveQuestion,
    rawQuestion,
    intent,
    facts,
    passages,
    weak: weak0,
    conflict: weak0 && passages.length > 1,
    hypotheses,
    researchedOnce: false
  });

  const discoveryLikely = shouldTriggerFeatureDiscovery(facts, {
    weak: weak0,
    intent,
    need
  });

  if (
    budgetHint > 0 ||
    need === 'release' ||
    need === 'catalog' ||
    need === 'notice' ||
    compoundGate.use ||
    discoveryLikely ||
    (understanding.contradiction === 'mode_label_mismatch' && weak0)
  ) {
    const loop = await runResearchLoop({
      question: effectiveQuestion,
      rawQuestion,
      locale,
      intent,
      facts,
      passages,
      adapters,
      weak: weak0,
      conflict: weak0 && passages.length > 1,
      personal: false,
      isWeakOrConflictingRetrieval,
      maxResearchActions: 3,
      callLlm: fast && understanding.contradiction !== 'mode_label_mismatch' ? null : callLlm,
      hypotheses
    });
    passages = loop.passages;
    const gated2 = gatePassages(passages, understanding);
    passages = gated2.accepted;
    debug.relevance = {
      accepted: gated2.accepted.map((p) => p.id),
      rejected: [...(debug.relevance.rejected || []), ...gated2.rejected],
      confidence: gated2.confidence
    };
    debug.plannerActions = loop.debug.planner || [];
    debug.sourcesSearched = loop.searched;
    debug.researchCount = loop.researchCount;
    debug.finalAction = loop.finalAction;
    debug.need = loop.need;
    debug.plannerMode = loop.debug.plannerMode || (fast ? 'deterministic' : 'deterministic');
    debug.plannerTrigger = loop.debug.plannerTrigger || null;
    debug.sourcePlan = loop.debug.sourcePlan || [];
    debug.missingInfo = loop.debug.missingInfo || [];
    debug.discoveryTriggered = !!loop.debug.discoveryTriggered;
    debug.discoverySources = loop.debug.discoverySources || [];
    if (loop.debug.privateSource) {
      Object.assign(debug, {
        privateSourceUsed: !!loop.debug.privateSource.privateSourceUsed,
        privateSourceRef: loop.debug.privateSource.privateSourceRef || null,
        privateSearchQueries: loop.debug.privateSource.privateSearchQueries || [],
        privateSourceHits: loop.debug.privateSource.privateSourceHits || [],
        privateFilesFetched: loop.debug.privateSource.privateFilesFetched || 0,
        privateSafeExcerptChars: loop.debug.privateSource.privateSafeExcerptChars || 0,
        privateRedactions: loop.debug.privateSource.privateRedactions || 0,
        privateSanitizations: loop.debug.privateSource.privateSanitizations || 0,
        privateSourceFallbackReason: loop.debug.privateSource.privateSourceFallbackReason || null
      });
    }
    if (loop.debug.privateSourceLlmContext) {
      debug.privateSourceLlmContext = loop.debug.privateSourceLlmContext;
    }
    if (loop.llmPlannerState && loop.llmPlannerState.used && loop.llmPlannerState.mode === 'llm') {
      debug.llmCalls.planner = 1;
      debug.plannerMode = 'llm';
    } else if (loop.llmPlannerState && loop.llmPlannerState.mode === 'deterministic_fallback') {
      debug.plannerMode = 'deterministic_fallback';
      debug.llmCalls.planner = 1;
    } else if (fast) {
      debug.plannerMode = 'deterministic';
      debug.plannerTrigger = 'fast_path';
    }
  } else {
    debug.finalAction = ACTIONS.ANSWER;
    debug.researchCount = 0;
    debug.plannerMode = 'deterministic';
    debug.plannerTrigger = 'fast_path';
  }

  const hasLiveCatalog = (passages || []).some((p) => String(p.id || '').startsWith('live-catalog'));
  if (hasLiveCatalog) {
    passages = (passages || []).filter((p) => p.id !== 'license-full-lifetime');
  }

  passages = unknownErrorCleared(rawQuestion, passages, UNKNOWN_ERROR_RE);
  {
    const gated3 = gatePassages(passages, understanding);
    passages = gated3.accepted;
    debug.relevance.confidence = gated3.confidence;
    if (gated3.rejected.length) {
      debug.relevance.rejected = [...(debug.relevance.rejected || []), ...gated3.rejected];
    }
  }

  // Drop company contact docs when current goal is commerce/account entitlement
  const areaNow = String(understanding.productArea || '');
  if (areaNow === 'commerce' || areaNow === 'account') {
    passages = (passages || []).filter(
      (p) => !/business-registration|support-contact/i.test(String(p.id || ''))
    );
  }

  const weak = !passages.length || isWeakOrConflictingRetrieval(passages);
  let clarify = null;
  let lowConfidence = weak;

  const evidence = assessEvidenceConfidence({
    passages,
    toolSnapshot: toolResult.snapshot,
    understanding,
    requiresAccountLookup: understanding.requiresAccountLookup,
    requiresPaymentLookup: understanding.requiresPaymentLookup,
    requiresLicenseLookup: understanding.requiresLicenseLookup
  });
  passages = evidence.accepted;
  debug.relevance = {
    accepted: evidence.accepted.map((p) => p.id),
    rejected: [...(debug.relevance.rejected || []), ...evidence.rejected],
    confidence: evidence.confidence
  };
  debug.evidenceConfidence = evidence.confidence;

  const decision = decideNextAction({
    question: effectiveQuestion,
    rawQuestion,
    intent,
    facts,
    passages,
    searched: new Set(debug.sourcesSearched || []),
    researchCount: debug.researchCount,
    budgetLeft: 0,
    weak: evidence.confidence === CONFIDENCE.NONE || evidence.confidence === CONFIDENCE.LOW || weak,
    personal: false
  });
  debug.plannerActions = [...(debug.plannerActions || []), decision];

  if (
    understanding.contradiction === 'mode_label_mismatch' &&
    (weak || evidence.confidence === CONFIDENCE.LOW || evidence.confidence === CONFIDENCE.NONE)
  ) {
    clarify = buildMismatchDiagnostic(understanding, locale);
    lowConfidence = true;
    debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
    debug.diagnosticReason = 'mode_label_mismatch_insufficient_evidence';
    debug.diagnosticMode = 'deterministic';
    return { passages, clarify, lowConfidence, debug, understanding, toolSnapshot: toolResult.snapshot };
  }

  if (decision.action === ACTIONS.ASK_DIAGNOSTIC || (weak && decision.action !== ACTIONS.ANSWER)) {
    if (
      !isUiFeatureAsk ||
      ['company', 'commerce', 'security', 'account'].includes(String(understanding.productArea || ''))
    ) {
      if (passages && passages.length && evidence.confidence !== CONFIDENCE.NONE) {
        const biz = passages.find((p) => /business-registration/i.test(String(p.id || '')));
        const ordered = biz ? [biz, ...passages.filter((p) => p !== biz)] : passages;
        debug.finalAction = ACTIONS.ANSWER;
        return {
          passages: ordered.slice(0, 4),
          clarify: null,
          lowConfidence: evidence.confidence === CONFIDENCE.LOW,
          debug,
          understanding,
          toolSnapshot: toolResult.snapshot
        };
      }
      const noEvidence =
        locale === 'en'
          ? 'I could not confirm that from official materials yet. Could you share a bit more detail about what you need (contact channel, refund, license, or a specific error)?'
          : locale === 'ja'
            ? '公式資料だけでは確認できませんでした。連絡先・返金・ライセンス・具体的なエラーのどれについて知りたいか、もう少し教えてください。'
            : '공식 자료만으로는 바로 확인하기 어렵습니다. 문의 채널, 환불, 이용권, 구체적인 오류 중 어떤 도움이 필요한지 조금 더 알려 주세요.';
      debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
      debug.diagnosticReason = 'no_evidence_info_ask';
      debug.diagnosticMode = 'deterministic';
      return {
        passages: passages || [],
        clarify: noEvidence,
        lowConfidence: true,
        debug,
        understanding,
        toolSnapshot: toolResult.snapshot
      };
    }

    let diag = await selectDiagnosticQuestion({
      callLlm,
      locale,
      intent,
      rawQuestion,
      question: effectiveQuestion,
      passages,
      facts,
      hypotheses,
      searched: debug.sourcesSearched,
      missingInfo: debug.missingInfo.length
        ? debug.missingInfo
        : [missingHighGainSlot(facts, hypotheses)].filter(Boolean)
    });

    if (
      (lastAiWasGenericDiag || diagnosticRepeatPrevented) &&
      facts.candidateFeature &&
      (newUserFactsSinceLastAi.length > 0 || isGenericTaskDiagnostic(diag.text))
    ) {
      const targeted = buildTargetedFeatureDiagnostic({
        locale,
        candidateFeature: facts.candidateFeature,
        intent,
        hypotheses,
        isUiFeatureAsk: true
      });
      if (targeted && (isGenericTaskDiagnostic(diag.text) || lastAiWasGenericDiag)) {
        diag = { text: targeted, mode: 'deterministic', reason: 'diagnostic_repeat_prevented' };
        diagnosticRepeatPrevented = true;
        debug.diagnosticRepeatPrevented = true;
      }
    }

    if (facts.candidateFeature && isGenericTaskDiagnostic(diag.text)) {
      const targeted = buildTargetedFeatureDiagnostic({
        locale,
        candidateFeature: facts.candidateFeature,
        intent,
        hypotheses,
        isUiFeatureAsk: true
      });
      if (targeted) {
        diag = { text: targeted, mode: 'deterministic', reason: 'feature_fact_lock' };
        diagnosticRepeatPrevented = true;
        debug.diagnosticRepeatPrevented = true;
      }
    }

    clarify = diag.text;
    lowConfidence = true;
    debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
    debug.diagnosticReason = decision.reason || diag.reason;
    debug.diagnosticMode = diag.mode;
    if (diag.mode === 'llm') debug.llmCalls.diagnostic = 1;
    return { passages, clarify, lowConfidence, debug, understanding, toolSnapshot: toolResult.snapshot };
  }

  debug.finalAction = ACTIONS.ANSWER;
  return {
    passages,
    clarify: null,
    lowConfidence: evidence.confidence === CONFIDENCE.LOW,
    debug,
    understanding,
    toolSnapshot: toolResult.snapshot
  };
}

module.exports = {
  runSupportAgent,
  buildMismatchDiagnostic
};
