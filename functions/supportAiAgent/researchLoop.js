'use strict';

const { ACTIONS } = require('./actions');
const { classifyNeed, decideNextAction, researchBudget, sourceKindOf } = require('./planner');
const { mergeAndRerank, shouldEarlyStop, pickAuthoritativeOnConflict } = require('./evidence');

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
  return [];
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
  maxResearchActions = 3
} = {}) {
  const need = classifyNeed({ question, rawQuestion, intent, facts });
  const searched = new Set();
  const top0 = passages && passages[0];
  if (top0 && Number(top0.score || 0) >= 14) searched.add(sourceKindOf(top0));

  let budget = Math.min(maxResearchActions, researchBudget({ need, weak, conflict, passages, searched }));
  const debug = {
    need,
    budgetStart: budget,
    actions: [],
    planner: []
  };

  let current = passages || [];
  let researchCount = 0;

  const evalWeak = () => {
    if (!current.length) return true;
    return typeof isWeakOrConflictingRetrieval === 'function' ? isWeakOrConflictingRetrieval(current) : false;
  };

  while (budget > 0) {
    const w = evalWeak();
    const decision = decideNextAction({
      question,
      rawQuestion,
      intent,
      facts,
      passages: current,
      searched,
      researchCount,
      budgetLeft: budget,
      weak: w,
      conflict: w && current.length > 1,
      personal
    });
    debug.planner.push(decision);

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
    debug.actions.push({ kind: 'search', sourceType, q: question });
    const extra = (await callSource(sourceType, adapters, { question, searchQuery: question, locale, facts })) || [];
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
    debug
  };
}

module.exports = { runResearchLoop, callSource };
