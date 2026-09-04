/**
 * Conversation state with topic epochs and fact tiers.
 * Persisted on supportTickets/{id}.aiConversationState.
 */
'use strict';

function emptyState() {
  return {
    epoch: 0,
    epochTopic: null,
    currentGoal: null,
    currentTopic: null,
    previousTopic: null,
    activeFacts: [],
    persistentFacts: [],
    historicalFacts: [],
    invalidatedFacts: [],
    // legacy aliases kept for older readers
    knownFacts: [],
    userProvidedFacts: [],
    resolvedReferences: [],
    unresolvedIssues: [],
    lastAssistantAssumption: null,
    lastUserCorrection: null,
    relevantProductState: null,
    lastActions: [],
    rejectedOldTopics: [],
    updatedAtMs: 0
  };
}

function normalizeFact(f) {
  return String(f || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function uniqPush(list, item, max = 12) {
  const v = normalizeFact(item);
  if (!v) return list;
  const lower = v.toLowerCase();
  const next = (list || []).filter((x) => String(x).toLowerCase() !== lower);
  next.push(v);
  return next.slice(-max);
}

function isPersistentFact(f) {
  return /account_authenticated|account_email|email_verified|uidPrefix|lifetime/i.test(String(f || ''));
}

function loadState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const known = Array.isArray(raw.knownFacts) ? raw.knownFacts.map(normalizeFact).filter(Boolean) : [];
  const active = Array.isArray(raw.activeFacts)
    ? raw.activeFacts.map(normalizeFact).filter(Boolean)
    : known.slice(-8);
  const persistent = Array.isArray(raw.persistentFacts)
    ? raw.persistentFacts.map(normalizeFact).filter(Boolean)
    : known.filter(isPersistentFact);
  return {
    epoch: Number(raw.epoch || 0) || 0,
    epochTopic: raw.epochTopic ? String(raw.epochTopic).slice(0, 80) : null,
    currentGoal: raw.currentGoal ? String(raw.currentGoal).slice(0, 240) : null,
    currentTopic: raw.currentTopic ? String(raw.currentTopic).slice(0, 80) : null,
    previousTopic: raw.previousTopic ? String(raw.previousTopic).slice(0, 80) : null,
    activeFacts: active.slice(-12),
    persistentFacts: persistent.slice(-8),
    historicalFacts: Array.isArray(raw.historicalFacts)
      ? raw.historicalFacts.map(normalizeFact).filter(Boolean).slice(-16)
      : [],
    invalidatedFacts: Array.isArray(raw.invalidatedFacts)
      ? raw.invalidatedFacts.map(normalizeFact).filter(Boolean).slice(-12)
      : [],
    knownFacts: known.slice(-12),
    userProvidedFacts: Array.isArray(raw.userProvidedFacts)
      ? raw.userProvidedFacts.map(normalizeFact).filter(Boolean).slice(-12)
      : [],
    resolvedReferences: Array.isArray(raw.resolvedReferences)
      ? raw.resolvedReferences.map(normalizeFact).filter(Boolean).slice(-8)
      : [],
    unresolvedIssues: Array.isArray(raw.unresolvedIssues)
      ? raw.unresolvedIssues.map(normalizeFact).filter(Boolean).slice(-8)
      : [],
    lastAssistantAssumption: raw.lastAssistantAssumption
      ? String(raw.lastAssistantAssumption).slice(0, 200)
      : null,
    lastUserCorrection: raw.lastUserCorrection ? String(raw.lastUserCorrection).slice(0, 200) : null,
    relevantProductState: raw.relevantProductState
      ? String(raw.relevantProductState).slice(0, 200)
      : null,
    lastActions: Array.isArray(raw.lastActions) ? raw.lastActions.map(String).slice(-6) : [],
    rejectedOldTopics: Array.isArray(raw.rejectedOldTopics)
      ? raw.rejectedOldTopics.map(String).slice(-6)
      : [],
    updatedAtMs: Number(raw.updatedAtMs || 0) || 0
  };
}

function startNewEpoch(state, topic) {
  const prevTopic = state.currentTopic || state.epochTopic;
  // Move active → historical (except persistent)
  for (const f of state.activeFacts || []) {
    if (!isPersistentFact(f)) state.historicalFacts = uniqPush(state.historicalFacts, f, 16);
  }
  if (prevTopic) state.rejectedOldTopics = uniqPush(state.rejectedOldTopics, prevTopic, 6);
  if (state.epochTopic && state.epochTopic !== prevTopic) {
    state.rejectedOldTopics = uniqPush(state.rejectedOldTopics, state.epochTopic, 6);
  }
  if (state.currentGoal) {
    state.historicalFacts = uniqPush(state.historicalFacts, `prev_goal=${state.currentGoal}`, 16);
  }
  // Clear conversion/company contact leftovers from active channel
  state.previousTopic = prevTopic;
  state.epoch = (Number(state.epoch) || 0) + 1;
  state.epochTopic = topic || null;
  state.currentTopic = topic || null;
  state.currentGoal = null;
  state.activeFacts = (state.persistentFacts || []).slice();
  state.unresolvedIssues = [];
  state.lastAssistantAssumption = null;
  state.resolvedReferences = [];
  state.relevantProductState = null;
  return state;
}

/**
 * Commit strategy by relation.
 */
function mergeState(prev, { understanding, relation, toolSnapshot, finalAction, assistantAssumption } = {}) {
  let state = loadState(prev);
  const u = understanding || {};
  const rel = String(relation || u.relation || u.effectiveRelation || 'CONTINUE').toUpperCase();
  // Prefer productArea for epoch identity so sticky LLM topic labels cannot keep old domains.
  const domainAreas = new Set([
    'company',
    'commerce',
    'security',
    'account',
    'troubleshooting',
    'release',
    'product_ui'
  ]);
  const area = String(u.productArea || '').toLowerCase();
  const topic = String(
    (domainAreas.has(area) ? u.productArea : null) || u.topic || u.productArea || state.currentTopic || 'general'
  ).slice(0, 80);

  if (rel === 'TOPIC_SHIFT') {
    state = startNewEpoch(state, topic);
  } else if (rel === 'AMBIGUOUS') {
    // Do not overwrite goal/topic aggressively
    state.updatedAtMs = Date.now();
    if (finalAction) state.lastActions = uniqPush(state.lastActions, finalAction, 6);
    return state;
  }

  if (rel === 'CORRECTION') {
    if (state.lastAssistantAssumption) {
      state.invalidatedFacts = uniqPush(
        state.invalidatedFacts,
        `invalidated_assumption=${state.lastAssistantAssumption}`,
        12
      );
    }
    const rawGoal = String(u.userGoal || '');
    const assumption = String(state.lastAssistantAssumption || '');
    if (
      /말고|아니|아니라/i.test(rawGoal) &&
      (/전화|대표\s*번|phone/i.test(assumption) || /전화|phone/i.test(rawGoal))
    ) {
      state.invalidatedFacts = uniqPush(state.invalidatedFacts, 'need_phone_number', 12);
      state.activeFacts = (state.activeFacts || []).filter((f) => !/phone|전화|대표번/i.test(f));
      state.activeFacts = uniqPush(state.activeFacts, 'need_non_phone_support_channel');
    }
    state.lastUserCorrection = String(u.userGoal || '').slice(0, 200);
    state.lastAssistantAssumption = null;
  } else if (rel === 'CONTINUE' || rel === 'FOLLOW_UP') {
    // Soft correction inside same topic (e.g. reject phone channel without formal CORRECTION label)
    const rawGoal = String(u.userGoal || '');
    const assumption = String(state.lastAssistantAssumption || '');
    if (/말고/i.test(rawGoal) && /전화|phone|대표/i.test(assumption + rawGoal)) {
      state.invalidatedFacts = uniqPush(state.invalidatedFacts, 'need_phone_number', 12);
      state.activeFacts = (state.activeFacts || []).filter((f) => !/phone|전화|대표번/i.test(f));
      state.activeFacts = uniqPush(state.activeFacts, 'need_non_phone_support_channel');
      state.lastUserCorrection = rawGoal.slice(0, 200);
    }
  }

  if (u.userGoal) state.currentGoal = String(u.userGoal).slice(0, 240);
  if (u.topic || u.productArea) {
    state.currentTopic = String(u.topic || u.productArea).slice(0, 80);
    if (!state.epochTopic) state.epochTopic = state.currentTopic;
  }

  const incoming = []
    .concat(u.knownFacts || [])
    .concat(u.newFacts || [])
    .concat(u.userProvidedFacts || []);
  for (const f of incoming) {
    if (isPersistentFact(f)) state.persistentFacts = uniqPush(state.persistentFacts, f, 8);
    else state.activeFacts = uniqPush(state.activeFacts, f, 12);
    state.userProvidedFacts = uniqPush(state.userProvidedFacts, f, 12);
  }
  // Keep knownFacts as active+persistent for backward compat in debug
  state.knownFacts = [...new Set([...(state.persistentFacts || []), ...(state.activeFacts || [])])].slice(
    -12
  );

  if (Array.isArray(u.references)) {
    for (const r of u.references) state.resolvedReferences = uniqPush(state.resolvedReferences, r, 8);
  }
  if (Array.isArray(u.missingInformation) && rel !== 'TOPIC_SHIFT') {
    state.unresolvedIssues = (u.missingInformation || []).map(normalizeFact).filter(Boolean).slice(0, 8);
  } else if (rel === 'FOLLOW_UP' || rel === 'CONTINUE') {
    if (Array.isArray(u.missingInformation)) {
      state.unresolvedIssues = (u.missingInformation || []).map(normalizeFact).filter(Boolean).slice(0, 8);
    }
  }

  if (toolSnapshot && typeof toolSnapshot === 'object') {
    const bits = [];
    if (toolSnapshot.licenseSummary) bits.push(toolSnapshot.licenseSummary);
    if (toolSnapshot.creditSummary) bits.push(toolSnapshot.creditSummary);
    if (toolSnapshot.paymentSummary) bits.push(toolSnapshot.paymentSummary);
    if (bits.length) state.relevantProductState = bits.join(' | ').slice(0, 200);
    if (Array.isArray(toolSnapshot.canonicalFacts)) {
      for (const f of toolSnapshot.canonicalFacts) {
        if (isPersistentFact(f)) state.persistentFacts = uniqPush(state.persistentFacts, f, 8);
        else state.activeFacts = uniqPush(state.activeFacts, f, 12);
      }
    } else if (toolSnapshot.facts) {
      for (const f of toolSnapshot.facts) {
        if (isPersistentFact(f)) state.persistentFacts = uniqPush(state.persistentFacts, f, 8);
        else state.activeFacts = uniqPush(state.activeFacts, f, 12);
      }
    }
    state.knownFacts = [...new Set([...(state.persistentFacts || []), ...(state.activeFacts || [])])].slice(
      -12
    );
  }

  if (assistantAssumption) {
    state.lastAssistantAssumption = String(assistantAssumption).slice(0, 200);
  }
  if (finalAction) state.lastActions = uniqPush(state.lastActions, finalAction, 6);
  state.updatedAtMs = Date.now();
  return state;
}

function statePromptBlock(state) {
  const s = loadState(state);
  if (!s.currentGoal && !s.activeFacts.length && !s.relevantProductState) return '(empty)';
  return [
    `EPOCH: ${s.epoch} (${s.epochTopic || 'n/a'})`,
    `CURRENT_GOAL: ${s.currentGoal || '(none)'}`,
    `CURRENT_TOPIC: ${s.currentTopic || '(none)'}`,
    `PREVIOUS_TOPIC: ${s.previousTopic || '(none)'}`,
    `ACTIVE_FACTS: ${s.activeFacts.join('; ') || '(none)'}`,
    `PERSISTENT_FACTS: ${s.persistentFacts.join('; ') || '(none)'}`,
    `INVALIDATED_FACTS: ${s.invalidatedFacts.join('; ') || '(none)'}`,
    `UNRESOLVED: ${s.unresolvedIssues.join('; ') || '(none)'}`,
    `REJECTED_OLD_TOPICS: ${s.rejectedOldTopics.join('; ') || '(none)'}`,
    `LAST_USER_CORRECTION: ${s.lastUserCorrection || '(none)'}`,
    `RELEVANT_PRODUCT_STATE: ${s.relevantProductState || '(none)'}`
  ].join('\n');
}

module.exports = {
  emptyState,
  loadState,
  mergeState,
  startNewEpoch,
  statePromptBlock,
  isPersistentFact
};
