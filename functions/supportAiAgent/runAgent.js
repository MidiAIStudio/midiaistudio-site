'use strict';

const { ACTIONS } = require('./actions');
const { extractUserFacts, inferHypotheses, missingHighGainSlot } = require('./userFacts');
const { classifyNeed, decideNextAction, researchBudget } = require('./planner');
const { runResearchLoop } = require('./researchLoop');
const { selectDiagnosticQuestion } = require('./diagnosticSelector');
const { shouldUseLlmPlanner, isDeterministicFastPath } = require('./plannerAmbiguity');

function unknownErrorCleared(rawQuestion, passages, UNKNOWN_ERROR_RE) {
  if (!UNKNOWN_ERROR_RE || !UNKNOWN_ERROR_RE.test(String(rawQuestion || ''))) return passages;
  const top = passages && passages[0];
  const strong =
    top &&
    (Number(top.score || 0) >= 15 ||
      /error|403|404|cuda|ffmpeg|timeout|오류/i.test(String(top.id || '') + String(top.title || '')));
  return strong ? passages : [];
}

async function runSupportAgent({
  question,
  rawQuestion,
  locale,
  personal,
  userTurns,
  clarifyEarly,
  adapters,
  retrieveStaticInitial,
  isWeakOrConflictingRetrieval,
  detectAnswerIntent,
  ambiguousClarification,
  UNKNOWN_ERROR_RE,
  callLlm = null
} = {}) {
  const facts = extractUserFacts(userTurns || [rawQuestion]);
  const hypotheses = inferHypotheses(question || rawQuestion, facts);
  const intent = detectAnswerIntent(question);
  const need = classifyNeed({ question, rawQuestion, intent, facts });

  const debug = {
    facts,
    hypotheses,
    need,
    intent,
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
    llmCalls: { planner: 0, diagnostic: 0 }
  };

  if (personal) {
    const passages = retrieveStaticInitial ? retrieveStaticInitial({ limit: 1 }) : [];
    debug.finalAction = ACTIONS.ANSWER;
    return { passages, clarify: null, lowConfidence: false, debug };
  }

  if (clarifyEarly) {
    debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
    debug.diagnosticReason = 'ambiguous_pivot';
    debug.diagnosticMode = 'deterministic';
    return { passages: [], clarify: clarifyEarly, lowConfidence: false, debug };
  }

  let passages = retrieveStaticInitial ? retrieveStaticInitial({ limit: 4 }) : [];
  passages = unknownErrorCleared(rawQuestion, passages, UNKNOWN_ERROR_RE);

  const weak0 = !passages.length || isWeakOrConflictingRetrieval(passages);
  const fast = isDeterministicFastPath({
    question,
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
    searched: []
  });

  const compoundGate = shouldUseLlmPlanner({
    question,
    rawQuestion,
    intent,
    facts,
    passages,
    weak: weak0,
    conflict: weak0 && passages.length > 1,
    hypotheses,
    researchedOnce: false
  });

  if (budgetHint > 0 || need === 'release' || need === 'catalog' || need === 'notice' || compoundGate.use) {
    const loop = await runResearchLoop({
      question,
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
      callLlm: fast ? null : callLlm,
      hypotheses
    });
    passages = loop.passages;
    debug.plannerActions = loop.debug.planner || [];
    debug.sourcesSearched = loop.searched;
    debug.researchCount = loop.researchCount;
    debug.finalAction = loop.finalAction;
    debug.need = loop.need;
    debug.plannerMode = loop.debug.plannerMode || (fast ? 'deterministic' : 'deterministic');
    debug.plannerTrigger = loop.debug.plannerTrigger || null;
    debug.sourcePlan = loop.debug.sourcePlan || [];
    debug.missingInfo = loop.debug.missingInfo || [];
    if (loop.llmPlannerState && loop.llmPlannerState.used && loop.llmPlannerState.mode === 'llm') {
      debug.llmCalls.planner = 1;
      debug.plannerMode = 'llm';
    } else if (loop.llmPlannerState && loop.llmPlannerState.mode === 'deterministic_fallback') {
      debug.plannerMode = 'deterministic_fallback';
      debug.llmCalls.planner = 1; // attempted
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

  const weak = !passages.length || isWeakOrConflictingRetrieval(passages);
  let clarify = null;
  let lowConfidence = weak;

  const decision = decideNextAction({
    question,
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

  if (decision.action === ACTIONS.ASK_DIAGNOSTIC || (weak && decision.action !== ACTIONS.ANSWER)) {
    const diag = await selectDiagnosticQuestion({
      callLlm,
      locale,
      intent,
      rawQuestion,
      question,
      passages,
      facts,
      hypotheses,
      searched: debug.sourcesSearched,
      missingInfo: debug.missingInfo.length
        ? debug.missingInfo
        : [missingHighGainSlot(facts, hypotheses)].filter(Boolean)
    });
    clarify = diag.text;
    lowConfidence = true;
    debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
    debug.diagnosticReason = decision.reason || diag.reason;
    debug.diagnosticMode = diag.mode;
    if (diag.mode === 'llm') debug.llmCalls.diagnostic = 1;
    else if (diag.mode === 'deterministic_fallback') debug.llmCalls.diagnostic = 1;
    return { passages, clarify, lowConfidence, debug };
  }

  if (!weak) {
    lowConfidence = false;
    debug.finalAction = ACTIONS.ANSWER;
    return { passages, clarify: null, lowConfidence: false, debug };
  }

  const diagFallback = await selectDiagnosticQuestion({
    callLlm,
    locale,
    intent,
    rawQuestion,
    question,
    passages,
    facts,
    hypotheses,
    searched: debug.sourcesSearched
  });
  clarify =
    ambiguousClarification && ambiguousClarification(rawQuestion, locale)
      ? ambiguousClarification(rawQuestion, locale)
      : diagFallback.text;
  debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
  debug.diagnosticReason = 'fallback_clarify';
  debug.diagnosticMode = diagFallback.mode;
  return { passages, clarify, lowConfidence: true, debug };
}

module.exports = { runSupportAgent };
