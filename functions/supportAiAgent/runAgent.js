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

async function runSupportAgent({
  question,
  rawQuestion,
  locale,
  personal,
  userTurns,
  priorAiReplies = [],
  turnRelation = null,
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
  const understanding = await understandQuery({
    rawQuestion,
    userTurns: turns,
    priorAiReplies,
    callLlm
  });

  let effectiveQuestion = question;
  if (
    understanding.contradiction === 'mode_label_mismatch' ||
    (understanding.resolvedQuery && understanding.intent === 'troubleshooting')
  ) {
    effectiveQuestion = understanding.resolvedQuery || question;
  }
  // TOPIC_SHIFT: never let troubleshooting rewrite from old modes
  if (turnRelation && turnRelation.relation === 'TOPIC_SHIFT') {
    effectiveQuestion = rawQuestion || question;
    if (understanding.productArea === 'studio_conversion' && understanding.intent === 'troubleshooting') {
      // understanding may still be polluted if turns were wrong — force raw
      understanding.searchQueries = [rawQuestion].filter(Boolean);
      understanding.resolvedQuery = rawQuestion;
      understanding.contradiction = null;
      understanding.selectedMode = null;
      understanding.observedLabel = null;
    }
  }

  const facts = extractUserFacts(turns);
  if (understanding.selectedMode) facts.selectedMode = understanding.selectedMode;
  if (understanding.observedLabel) facts.observedLabel = understanding.observedLabel;
  if (understanding.contradiction) facts.contradiction = understanding.contradiction;

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

  const debug = {
    facts,
    hypotheses,
    need,
    intent,
    turnRelation: turnRelation
      ? {
          relation: turnRelation.relation,
          reason: turnRelation.reason,
          currentFamily: turnRelation.currentFamily,
          previousFamily: turnRelation.previousFamily,
          historyScope: turnRelation.historyScope
        }
      : null,
    understanding: {
      intent: understanding.intent,
      topic: understanding.topic,
      selectedMode: understanding.selectedMode,
      observedLabel: understanding.observedLabel,
      contradiction: understanding.contradiction,
      searchQueries: understanding.searchQueries,
      source: understanding.source,
      llmCalled: !!understanding.llmCalled
    },
    relevance: { accepted: [], rejected: [], confidence: null },
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

  if (personal) {
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
  if (understanding.searchQueries && understanding.searchQueries.length && retrieveStaticInitial) {
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
  } else {
    passages = retrieveStaticInitial ? retrieveStaticInitial({ limit: 4 }) : [];
    const gated = gatePassages(passages, understanding);
    passages = gated.accepted;
    debug.relevance = {
      accepted: gated.accepted.map((p) => p.id),
      rejected: gated.rejected,
      confidence: gated.confidence
    };
  }

  passages = applyDiscoveryBoosts(passages, facts.candidateFeature);
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

  const weak = !passages.length || isWeakOrConflictingRetrieval(passages);
  let clarify = null;
  let lowConfidence = weak;

  const decision = decideNextAction({
    question: effectiveQuestion,
    rawQuestion,
    intent,
    facts,
    passages,
    searched: new Set(debug.sourcesSearched || []),
    researchCount: debug.researchCount,
    budgetLeft: 0,
    weak,
    personal: false
  });
  debug.plannerActions = [...(debug.plannerActions || []), decision];

  if (
    understanding.contradiction === 'mode_label_mismatch' &&
    (weak || debug.relevance.confidence === 'low' || debug.relevance.confidence === 'none')
  ) {
    clarify = buildMismatchDiagnostic(understanding, locale);
    lowConfidence = true;
    debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
    debug.diagnosticReason = 'mode_label_mismatch_insufficient_evidence';
    debug.diagnosticMode = 'deterministic';
    return { passages, clarify, lowConfidence, debug, understanding };
  }

  if (decision.action === ACTIONS.ASK_DIAGNOSTIC || (weak && decision.action !== ACTIONS.ANSWER)) {
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
        hypotheses
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
        hypotheses
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
    return { passages, clarify, lowConfidence, debug, understanding };
  }

  debug.finalAction = ACTIONS.ANSWER;
  return { passages, clarify, lowConfidence, debug, understanding };
}

module.exports = {
  runSupportAgent,
  buildMismatchDiagnostic
};
