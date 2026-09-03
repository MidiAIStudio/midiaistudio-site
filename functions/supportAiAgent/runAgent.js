'use strict';

const { ACTIONS } = require('./actions');
const { extractUserFacts, inferHypotheses } = require('./userFacts');
const { classifyNeed, decideNextAction, researchBudget } = require('./planner');
const { runResearchLoop } = require('./researchLoop');
const { generateDiagnosticClarifyQuestion } = require('./diagnosticQuestion');

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
  UNKNOWN_ERROR_RE
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
    finalAction: null
  };

  if (personal) {
    const passages = retrieveStaticInitial ? retrieveStaticInitial({ limit: 1 }) : [];
    debug.finalAction = ACTIONS.ANSWER;
    return { passages, clarify: null, lowConfidence: false, debug };
  }

  if (clarifyEarly) {
    debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
    debug.diagnosticReason = 'ambiguous_pivot';
    return { passages: [], clarify: clarifyEarly, lowConfidence: false, debug };
  }

  let passages = retrieveStaticInitial ? retrieveStaticInitial({ limit: 4 }) : [];
  passages = unknownErrorCleared(rawQuestion, passages, UNKNOWN_ERROR_RE);

  const weak0 = !passages.length || isWeakOrConflictingRetrieval(passages);
  const budgetHint = researchBudget({
    need,
    weak: weak0,
    conflict: weak0 && passages.length > 1,
    passages,
    searched: []
  });

  if (budgetHint > 0 || need === 'release' || need === 'catalog' || need === 'notice') {
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
      maxResearchActions: 3
    });
    passages = loop.passages;
    debug.plannerActions = loop.debug.planner || [];
    debug.sourcesSearched = loop.searched;
    debug.researchCount = loop.researchCount;
    debug.finalAction = loop.finalAction;
    debug.need = loop.need;
  } else {
    debug.finalAction = ACTIONS.ANSWER;
    debug.researchCount = 0;
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
    clarify = generateDiagnosticClarifyQuestion({
      locale,
      intent,
      rawQuestion,
      question,
      passages,
      facts,
      hypotheses
    });
    lowConfidence = true;
    debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
    debug.diagnosticReason = decision.reason;
    return { passages, clarify, lowConfidence, debug };
  }

  if (!weak) {
    lowConfidence = false;
    debug.finalAction = ACTIONS.ANSWER;
    return { passages, clarify: null, lowConfidence: false, debug };
  }

  clarify =
    ambiguousClarification && ambiguousClarification(rawQuestion, locale)
      ? ambiguousClarification(rawQuestion, locale)
      : generateDiagnosticClarifyQuestion({ locale, intent, rawQuestion, question, passages, facts, hypotheses });
  debug.finalAction = ACTIONS.ASK_DIAGNOSTIC;
  debug.diagnosticReason = 'fallback_clarify';
  return { passages, clarify, lowConfidence: true, debug };
}

module.exports = { runSupportAgent };
