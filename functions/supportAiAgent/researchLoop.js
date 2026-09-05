'use strict';

const { ACTIONS } = require('./actions');
const { classifyNeed, decideNextAction, researchBudget, sourceKindOf } = require('./planner');
const { mergeAndRerank, shouldEarlyStop, pickAuthoritativeOnConflict } = require('./evidence');
const { shouldUseLlmPlanner } = require('./plannerAmbiguity');
const { runSelectiveLlmPlanner } = require('./llmPlanner');
const {
  discoverySearchQuery,
  applyDiscoveryBoosts,
  shouldTriggerFeatureDiscovery
} = require('./featureDiscovery');

function isOpsPassage(p) {
  return sourceKindOf(p) === 'operation';
}

function isErrorPassage(p) {
  return sourceKindOf(p) === 'error';
}

async function callSource(sourceType, adapters, ctx) {
  const q = ctx.searchQuery || ctx.question;
  const loc = ctx.locale;
  if (sourceType === 'knowledge') {
    return adapters.retrieveStatic({ question: q, limit: 6, minScore: 1, locale: loc });
  }
  if (sourceType === 'operation') {
    const rows = await adapters.retrieveStatic({ question: q, limit: 8, minScore: 1, locale: loc });
    const ops = (rows || []).filter(isOpsPassage);
    return ops.length ? ops : rows;
  }
  if (sourceType === 'error') {
    const rows = await adapters.retrieveStatic({ question: q, limit: 8, minScore: 1, locale: loc });
    const err = (rows || []).filter(isErrorPassage);
    return err.length ? err : rows;
  }
  if (sourceType === 'faq') {
    return adapters.loadLiveFaq({ question: q, limit: 3, locale: loc });
  }
  if (sourceType === 'catalog') {
    return adapters.loadLiveCatalog({ question: q, locale: loc });
  }
  if (sourceType === 'release') {
    return adapters.loadLiveRelease({
      question: q,
      locale: loc,
      version: ctx.facts && ctx.facts.version,
      preferLatest: !ctx.facts || !ctx.facts.version
    });
  }
  if (sourceType === 'notice') {
    return adapters.loadLiveNotice({ question: q, locale: loc });
  }
  if (sourceType === 'guide') {
    return adapters.loadLiveGuide({ question: q, locale: loc });
  }
  if (sourceType === 'private_source') {
    if (typeof adapters.searchPrivateSource !== 'function') return [];
    const out = await adapters.searchPrivateSource({
      question: q,
      rawQuestion: ctx.rawQuestion || q,
      searchQuery: q,
      locale: loc,
      facts: ctx.facts || {},
      need: ctx.need,
      weak: true,
      conflict: false,
      personal: false,
      sourcePlan: ctx.sourcePlan || []
    });
    if (out && Array.isArray(out.passages)) {
      if (ctx.onPrivateSourceMeta && out.debug) ctx.onPrivateSourceMeta(out);
      return out.passages;
    }
    return [];
  }
  return [];
}

async function decideWithOptionalLlm({
  question,
  rawQuestion,
  intent,
  facts,
  passages,
  searched,
  researchCount,
  budgetLeft,
  weak,
  conflict,
  personal,
  hypotheses,
  callLlm,
  llmPlannerState
}) {
  const deterministic = decideNextAction({
    question,
    rawQuestion,
    intent,
    facts,
    passages,
    searched,
    researchCount,
    budgetLeft,
    weak,
    conflict,
    personal
  });

  // Fast path / already used LLM this turn → deterministic only
  if (!llmPlannerState || llmPlannerState.used) {
    return {
      decision: deterministic,
      plannerMode: llmPlannerState && llmPlannerState.mode ? llmPlannerState.mode : 'deterministic',
      sourcePlan: llmPlannerState && llmPlannerState.sourcePlan ? llmPlannerState.sourcePlan : [],
      missingInfo: llmPlannerState && llmPlannerState.missingInfo ? llmPlannerState.missingInfo : []
    };
  }

  const gate = shouldUseLlmPlanner({
    question,
    rawQuestion,
    intent,
    facts,
    passages,
    weak,
    conflict,
    hypotheses,
    researchedOnce: researchCount > 0
  });

  if (!gate.use) {
    llmPlannerState.mode = 'deterministic';
    llmPlannerState.trigger = gate.reason;
    return {
      decision: deterministic,
      plannerMode: 'deterministic',
      sourcePlan: [],
      missingInfo: []
    };
  }

  // Mark used before await so we never call twice even on parallel mistakes
  llmPlannerState.used = true;
  llmPlannerState.trigger = gate.reason;

  const llmOut = await runSelectiveLlmPlanner({
    callLlm,
    rawQuestion,
    question,
    intent,
    facts,
    passages,
    searched,
    budgetLeft,
    hypotheses,
    triggerReason: gate.reason,
    fallbackDecision: deterministic
  });

  llmPlannerState.mode = llmOut.mode;
  llmPlannerState.sourcePlan = llmOut.sourcePlan || [];
  llmPlannerState.missingInfo = llmOut.missingInfo || [];
  llmPlannerState.decision = llmOut.decision;

  return {
    decision: llmOut.decision,
    plannerMode: llmOut.mode,
    sourcePlan: llmOut.sourcePlan || [],
    missingInfo: llmOut.missingInfo || []
  };
}

async function runResearchLoop({
  question,
  rawQuestion,
  locale,
  intent,
  facts,
  passages,
  adapters,
  weak,
  conflict,
  personal,
  isWeakOrConflictingRetrieval,
  maxResearchActions = 3,
  callLlm = null,
  hypotheses = [],
  searchQueries = null
} = {}) {
  const need = classifyNeed({ question, rawQuestion, intent, facts });
  const searched = new Set();
  const top0 = passages && passages[0];
  if (top0 && Number(top0.score || 0) >= 14) searched.add(sourceKindOf(top0));

  const discoveryOn = shouldTriggerFeatureDiscovery(facts || {}, {
    weak: !!weak,
    intent: intent || 'general',
    need
  });
  let budget = Math.min(
    maxResearchActions,
    researchBudget({ need, weak, conflict, passages, searched, facts })
  );
  const altQueries = (Array.isArray(searchQueries) ? searchQueries : [])
    .map((q) => String(q || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  let altQueryIdx = 0;
  const nextSearchQuery = (fallback) => {
    if (!altQueries.length) return fallback;
    // When weak, prefer rotating semantic rewrites over repeating the raw vague phrase.
    const q = altQueries[altQueryIdx % altQueries.length];
    altQueryIdx += 1;
    return q || fallback;
  };
  const searchQ = discoveryOn ? discoverySearchQuery(facts, question) : question;
  const llmPlannerState = {
    used: false,
    mode: 'deterministic',
    trigger: null,
    sourcePlan: [],
    missingInfo: [],
    decision: null
  };

  const debug = {
    need,
    budgetStart: budget,
    actions: [],
    planner: [],
    plannerMode: 'deterministic',
    plannerTrigger: null,
    sourcePlan: [],
    missingInfo: [],
    discoveryTriggered: discoveryOn,
    discoverySources: []
  };

  let current = discoveryOn
    ? applyDiscoveryBoosts(passages || [], facts && facts.candidateFeature)
    : passages || [];
  let researchCount = 0;
  let pendingSourcePlan = [];

  // Prefer discovery source plan when named feature is unknown (not release/catalog)
  if (discoveryOn && budget > 0 && (need === 'operation' || need === 'knowledge')) {
    pendingSourcePlan = ['operation', 'private_source', 'knowledge', 'guide'].filter(
      (s) => !searched.has(s)
    );
  }

  const evalWeak = () => {
    if (!current.length) return true;
    return typeof isWeakOrConflictingRetrieval === 'function' ? isWeakOrConflictingRetrieval(current) : false;
  };

  while (budget > 0) {
    const w = evalWeak();
    const conflictNow = (w && current.length > 1) || conflict;

    let decision;
    let plannerMode = llmPlannerState.mode;
    let sourcePlan = pendingSourcePlan;

    if (pendingSourcePlan.length) {
      const nextSrc = pendingSourcePlan.find((s) => !searched.has(s));
      if (nextSrc) {
        decision = {
          action: searched.size ? ACTIONS.SEARCH_ANOTHER_SOURCE : ACTIONS.SEARCH,
          sourceType: nextSrc,
          reason: 'llm_source_plan',
          intent,
          topic: need
        };
      } else {
        pendingSourcePlan = [];
      }
    }

    if (!decision) {
      const picked = await decideWithOptionalLlm({
        question,
        rawQuestion,
        intent,
        facts,
        passages: current,
        searched,
        researchCount,
        budgetLeft: budget,
        weak: w,
        conflict: conflictNow,
        personal,
        hypotheses,
        callLlm,
        llmPlannerState
      });
      decision = picked.decision;
      plannerMode = picked.plannerMode;
      sourcePlan = picked.sourcePlan || [];
      if (sourcePlan.length > 1) {
        pendingSourcePlan = sourcePlan.slice();
      }
      debug.missingInfo = picked.missingInfo || [];
    }

    debug.planner.push({ ...decision, plannerMode });
    debug.plannerMode = plannerMode;
    debug.plannerTrigger = llmPlannerState.trigger;
    debug.sourcePlan = llmPlannerState.sourcePlan || sourcePlan || [];

    if (decision.action === ACTIONS.ANSWER || decision.action === ACTIONS.ASK_DIAGNOSTIC || decision.action === ACTIONS.HANDOFF) {
      debug.finalAction = decision.action;
      break;
    }

    if (decision.action === ACTIONS.COMPARE) {
      current = pickAuthoritativeOnConflict(current, need);
      debug.actions.push({ kind: 'compare', need });
      budget -= 1;
      researchCount += 1;
      debug.finalAction = ACTIONS.ANSWER;
      break;
    }

    const sourceType = decision.sourceType;
    if (!sourceType || searched.has(sourceType)) {
      // Try next from source plan
      const alt = (pendingSourcePlan || []).find((s) => !searched.has(s));
      if (alt) {
        pendingSourcePlan = pendingSourcePlan.filter((s) => s !== alt);
        budget -= 1;
        researchCount += 1;
        searched.add(alt);
        const qNow = discoveryOn ? searchQ : nextSearchQuery(searchQ);
        debug.actions.push({ kind: 'search', sourceType: alt, q: qNow, via: 'source_plan' });
        if (discoveryOn) debug.discoverySources.push(alt);
        const extraRaw =
          (await callSource(alt, adapters, {
            question,
            rawQuestion,
            searchQuery: qNow,
            locale,
            facts,
            need,
            sourcePlan: pendingSourcePlan,
            onPrivateSourceMeta: (meta) => {
              debug.privateSource = meta && meta.debug ? meta.debug : null;
              if (meta && meta.llmContext) debug.privateSourceLlmContext = meta.llmContext;
            }
          })) || [];
        const extra = applyDiscoveryBoosts(extraRaw, facts && facts.candidateFeature);
        current = mergeAndRerank({ initialPassages: current, extraPassages: extra, need, limit: 4 });
        if (shouldEarlyStop({ passages: current, need, weak: evalWeak(), conflict: false })) {
          debug.finalAction = ACTIONS.ANSWER;
          debug.earlyStop = true;
          break;
        }
        continue;
      }

      const again = decideNextAction({
        question,
        rawQuestion,
        intent,
        facts,
        passages: current,
        searched,
        researchCount,
        budgetLeft: 0,
        weak: w,
        personal
      });
      debug.finalAction = again.action;
      debug.planner.push(again);
      break;
    }

    budget -= 1;
    researchCount += 1;
    searched.add(sourceType);
    pendingSourcePlan = (pendingSourcePlan || []).filter((s) => s !== sourceType);
    const qNow = discoveryOn ? searchQ : nextSearchQuery(searchQ);
    debug.actions.push({ kind: 'search', sourceType, q: qNow });
    if (discoveryOn) debug.discoverySources.push(sourceType);
    const extraRaw =
      (await callSource(sourceType, adapters, {
        question,
        rawQuestion,
        searchQuery: qNow,
        locale,
        facts,
        need,
        sourcePlan: pendingSourcePlan,
        onPrivateSourceMeta: (meta) => {
          debug.privateSource = meta && meta.debug ? meta.debug : null;
          if (meta && meta.llmContext) debug.privateSourceLlmContext = meta.llmContext;
        }
      })) || [];
    const extra = applyDiscoveryBoosts(extraRaw, facts && facts.candidateFeature);
    current = mergeAndRerank({ initialPassages: current, extraPassages: extra, need, limit: 4 });

    if (shouldEarlyStop({ passages: current, need, weak: evalWeak(), conflict: false })) {
      debug.finalAction = ACTIONS.ANSWER;
      debug.earlyStop = true;
      break;
    }
  }

  if (!debug.finalAction) {
    const w = evalWeak();
    debug.finalAction = decideNextAction({
      question,
      rawQuestion,
      intent,
      facts,
      passages: current,
      searched,
      researchCount,
      budgetLeft: 0,
      weak: w,
      personal
    }).action;
  }

  return {
    passages: current,
    need,
    searched: [...searched],
    researchCount,
    finalAction: debug.finalAction,
    debug,
    llmPlannerState
  };
}

module.exports = { runResearchLoop, callSource, decideWithOptionalLlm };
