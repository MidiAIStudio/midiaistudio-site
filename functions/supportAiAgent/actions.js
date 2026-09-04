'use strict';

const ACTIONS = Object.freeze({
  ANSWER: 'ANSWER',
  SEARCH: 'SEARCH',
  SEARCH_ANOTHER_SOURCE: 'SEARCH_ANOTHER_SOURCE',
  COMPARE: 'COMPARE',
  ASK_DIAGNOSTIC: 'ASK_DIAGNOSTIC',
  HANDOFF: 'HANDOFF'
});

const SOURCE_TYPES = Object.freeze({
  knowledge: 'knowledge',
  operation: 'operation',
  faq: 'faq',
  catalog: 'catalog',
  release: 'release',
  notice: 'notice',
  error: 'error',
  guide: 'guide',
  private_source: 'private_source'
});

const ALLOWED_ACTIONS = new Set(Object.values(ACTIONS));
const ALLOWED_SOURCES = new Set(Object.values(SOURCE_TYPES));

function validateDecision(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const action = ALLOWED_ACTIONS.has(d.action) ? d.action : ACTIONS.ASK_DIAGNOSTIC;
  let sourceType = d.sourceType || null;
  if (sourceType && !ALLOWED_SOURCES.has(sourceType)) sourceType = SOURCE_TYPES.knowledge;
  if (action === ACTIONS.HANDOFF && d.reason !== 'policy') {
    // Planner cannot invent HANDOFF except explicit policy reasons from our code.
    return {
      action: ACTIONS.ASK_DIAGNOSTIC,
      sourceType: null,
      reason: 'handoff_rejected',
      intent: d.intent || null,
      topic: d.topic || null
    };
  }
  return {
    action,
    sourceType,
    reason: String(d.reason || '').slice(0, 80) || 'ok',
    intent: d.intent || null,
    topic: d.topic || null
  };
}

module.exports = {
  ACTIONS,
  SOURCE_TYPES,
  ALLOWED_ACTIONS,
  ALLOWED_SOURCES,
  validateDecision
};
