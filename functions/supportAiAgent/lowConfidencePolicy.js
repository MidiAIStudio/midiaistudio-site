/**
 * Low-confidence policy:
 * - When evidence is empty/weak/conflicting, do bounded additional retrieval (multi-source).
 * - If still insufficient, output a targeted diagnostic clarifying question.
 *
 * Pure-ish module: all source access is via injected adapters.
 */
'use strict';

function cleanSpace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function uniqueById(passages) {
  const map = new Map();
  for (const p of passages || []) {
    if (!p || !p.id) continue;
    const id = String(p.id);
    const prev = map.get(id);
    if (!prev) {
      map.set(id, p);
      continue;
    }
    const prevScore = Number(prev.score || 0);
    const nextScore = Number(p.score || 0);
    if (nextScore > prevScore) map.set(id, p);
  }
  return [...map.values()];
}

function sortPassages(passages) {
  return (passages || [])
    .slice()
    .sort(
      (a, b) =>
        Number(b.score || 0) - Number(a.score || 0) ||
        Number(a.priority || 0) - Number(b.priority || 0)
    );
}

function detectSourcePresence(passages) {
  const hasFaq = (passages || []).some((p) => String(p.id || '').startsWith('faq-'));
  const hasLiveCatalog = (passages || []).some((p) => String(p.id || '').startsWith('live-catalog'));
  return { hasFaq, hasLiveCatalog };
}

function makeQueryVariants({ question, rawQuestion, intent, locale } = {}) {
  const q = cleanSpace(question || rawQuestion || '');
  const raw = cleanSpace(rawQuestion || question || '');
  const compact = q.replace(/[\s\-_/·•・‧]+/g, ' ').trim();

  const variants = [q, compact, raw].filter(Boolean);
  const intentToken =
    intent === 'troubleshoot'
      ? locale === 'en'
        ? 'fix'
        : '해결'
      : intent === 'install'
        ? locale === 'en'
          ? 'install'
          : '설치'
        : intent === 'where'
          ? locale === 'en'
            ? 'where'
            : '어디'
          : intent === 'how'
            ? locale === 'en'
              ? 'how'
              : '방법'
            : intent === 'what'
              ? locale === 'en'
                ? 'what'
                : '무엇'
              : locale === 'en'
                ? 'problem'
                : '문제';

  if (intentToken && !compact.includes(intentToken)) variants.push(`${compact} ${intentToken}`);

  if (compact.length > 40) variants.push(compact.slice(Math.max(0, Math.floor(compact.length * 0.5))));

  const seen = new Set();
  return variants.filter((v) => {
    const s = cleanSpace(v);
    if (!s || seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

function mergeAndRerank({ initialPassages, extraPassages, limit = 4 }) {
  const merged = uniqueById([...(initialPassages || []), ...(extraPassages || [])]);
  return sortPassages(merged).slice(0, limit);
}

function defaultMaxResearchActions() {
  return 3; // medium budget
}

async function applyLowConfidencePolicy({
  question,
  rawQuestion,
  locale,
  intent,
  personal,
  clarifyExisting,
  passages,
  adapters,
  maxResearchActions = defaultMaxResearchActions(),
  isWeakOrConflictingRetrieval,
  generateDiagnosticClarifyQuestion
} = {}) {
  const clar = clarifyExisting || null;
  if (personal) {
    return {
      passages: passages || [],
      clarify: clar,
      lowConfidence: false,
      researchDebug: { skipped: 'personal' }
    };
  }

  const initialPassages = passages || [];
  const initialLowConfidence = !clar && (initialPassages.length === 0 || isWeakOrConflictingRetrieval(initialPassages));
  if (!initialLowConfidence) {
    return {
      passages: initialPassages,
      clarify: clar,
      lowConfidence: false,
      researchDebug: { skipped: 'enough_evidence' }
    };
  }

  // --- Bounded research stage ---
  let remainingBudget = maxResearchActions;
  const researchDebug = {
    started: true,
    budget: maxResearchActions,
    actions: [],
    usedStatic: false,
    usedFaq: false,
    usedCatalog: false
  };

  const { hasFaq, hasLiveCatalog } = detectSourcePresence(initialPassages);
  const variants = makeQueryVariants({ question, rawQuestion, intent, locale });
  const staticVariants = variants.slice(0, 2);

  let extraPassages = [];

  const callStatic = async (q, idx) => {
    if (remainingBudget <= 0) return;
    remainingBudget -= 1;
    researchDebug.actions.push({ kind: 'static', q, idx });
    researchDebug.usedStatic = true;
    const out = await adapters.retrieveStatic({ question: q, limit: 6, minScore: 1, locale });
    extraPassages.push(...(out || []));
  };

  const callFaq = async (q) => {
    if (remainingBudget <= 0) return;
    remainingBudget -= 1;
    researchDebug.actions.push({ kind: 'faq', q });
    researchDebug.usedFaq = true;
    const out = await adapters.loadLiveFaq({ question: q, limit: 3, locale });
    extraPassages.push(...(out || []));
  };

  const callCatalog = async (q) => {
    if (remainingBudget <= 0) return;
    remainingBudget -= 1;
    researchDebug.actions.push({ kind: 'catalog', q });
    researchDebug.usedCatalog = true;
    const out = await adapters.loadLiveCatalog({ question: q, locale });
    extraPassages.push(...(out || []));
  };

  for (let i = 0; i < staticVariants.length; i++) {
    await callStatic(staticVariants[i], i);
    if (remainingBudget <= 0) break;
  }

  if (remainingBudget > 0) {
    const variantForLive = variants[2] || variants[0] || question || rawQuestion;
    if (!hasFaq) await callFaq(variantForLive);
    else if (!hasLiveCatalog) await callCatalog(variantForLive);
  }

  const mergedPassages = mergeAndRerank({ initialPassages, extraPassages, limit: 4 });
  const lowConfidenceAfterResearch =
    mergedPassages.length === 0 || isWeakOrConflictingRetrieval(mergedPassages);

  if (!lowConfidenceAfterResearch) {
    return {
      passages: mergedPassages,
      clarify: null,
      lowConfidence: false,
      researchDebug
    };
  }

  const diagnostic = generateDiagnosticClarifyQuestion({
    locale,
    intent,
    rawQuestion,
    question,
    passages: mergedPassages
  });

  return {
    passages: mergedPassages,
    clarify: diagnostic,
    lowConfidence: true,
    researchDebug
  };
}

module.exports = { applyLowConfidencePolicy };

