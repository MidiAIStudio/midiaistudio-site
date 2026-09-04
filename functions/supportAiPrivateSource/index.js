'use strict';

const fs = require('fs');
const path = require('path');
const { PRIVATE_SOURCE_CONFIG, repoSlug } = require('./config');
const { normalizePolicy, disabledPolicy, policyCacheKey } = require('./policy');
const { createTtlCache } = require('./cache');
const { createGitHubClient } = require('./githubClient');
const { localSearch } = require('./localSearch');
const { makeSafePacket, buildLlmContext, evaluatePath } = require('./gateway');
const { shouldUsePrivateSource, buildSearchTerms, isPersonalOrPaymentQuestion } = require('./shouldUse');
const {
  scoreHitRelevance,
  evidenceMatchesQuestion,
  MIN_PRIVATE_RELEVANCE
} = require('./relevance');
const { CUSTOMER_SAFE_SYSTEM_RULES, sanitizeCustomerAnswer, customerAnswerIsSafe } = require('./customerSafe');

const sharedCache = createTtlCache({ ttlMs: PRIVATE_SOURCE_CONFIG.cacheTtlMs });

function emptyDebug(extra) {
  return {
    privateSourceUsed: false,
    privateSourceRef: PRIVATE_SOURCE_CONFIG.sourceRef,
    privateSearchQueries: [],
    privateSemanticTerms: [],
    privateActualQueries: [],
    privateSourceHits: [],
    privateRejectedHits: [],
    privateAcceptedHits: [],
    privateHitRelevance: [],
    privateEvidenceQuestionMatch: null,
    privateFilesFetched: 0,
    privateSafeExcerptChars: 0,
    privateRedactions: 0,
    privateSanitizations: 0,
    privateSourceFallbackReason: null,
    ...extra
  };
}

function termsCacheKey(terms) {
  return (terms || [])
    .map((t) => String(t || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

/**
 * Production private source research adapter.
 * GitHub fetch → path gate → redact → sanitize → relevance gate → bounded excerpt
 * Raw snippets are grounding-only — never customer-facing answer text.
 */
function createPrivateSourceAdapter(opts = {}) {
  const cache = opts.cache || sharedCache;
  const github =
    opts.githubClient ||
    createGitHubClient({
      env: opts.env || process.env,
      cache,
      authOverride: opts.authOverride || null
    });
  const localRoot = opts.localRoot || null;
  const policyOverride = opts.policy || null;
  let policyDisabled = false;
  let loadedPolicy = policyOverride;

  async function loadPolicy() {
    if (policyOverride) {
      loadedPolicy = normalizePolicy(policyOverride);
      return loadedPolicy;
    }
    const key = policyCacheKey();
    const cached = cache.get(key);
    if (cached) {
      loadedPolicy = cached;
      return loadedPolicy;
    }
    try {
      let raw;
      if (localRoot && !github.configured()) {
        const p = path.join(localRoot, PRIVATE_SOURCE_CONFIG.policyPath);
        raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      } else if (github.configured()) {
        raw = await github.getPolicyJson();
      } else {
        policyDisabled = true;
        throw Object.assign(new Error('github_auth_missing'), { code: 'github_auth_missing' });
      }
      loadedPolicy = normalizePolicy(raw);
      if (!loadedPolicy.allowPaths.length) {
        policyDisabled = true;
        throw Object.assign(new Error('policy_empty_allow'), { code: 'policy_fetch_failed' });
      }
      cache.set(key, loadedPolicy);
      policyDisabled = false;
      return loadedPolicy;
    } catch (err) {
      policyDisabled = true;
      loadedPolicy = disabledPolicy();
      const code = err && err.code ? err.code : 'policy_fetch_failed';
      throw Object.assign(new Error(code), { code });
    }
  }

  async function readBytes(relPath) {
    if (localRoot) {
      const full = path.join(localRoot, relPath);
      return fs.readFileSync(full);
    }
    const file = await github.getFileContent(relPath);
    return file && file.bytes ? file.bytes : null;
  }

  async function scorePreferredOnGitHub(terms, policy, question) {
    const cacheKey = `preferred:${PRIVATE_SOURCE_CONFIG.sourceRef}:${termsCacheKey(terms)}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const hits = [];
    let fetched = 0;
    for (const rel of PRIVATE_SOURCE_CONFIG.preferredPaths) {
      if (fetched >= PRIVATE_SOURCE_CONFIG.maxFileFetches) break;
      const dec = evaluatePath(rel, policy);
      if (!dec.allowed) continue;
      let bytes;
      try {
        bytes = await readBytes(dec.normalized);
      } catch (_) {
        continue;
      }
      if (!bytes) continue;
      fetched += 1;
      const text = bytes.toString('utf8');
      if (text.length > 2_000_000) continue;
      const lines = text.split(/\r?\n/);

      let best = null;
      for (let i = 0; i < Math.min(lines.length, 8000); i += 1) {
        const window = lines.slice(Math.max(0, i - 1), i + 2).join('\n');
        const scored = scoreHitRelevance({
          text: window,
          path: dec.normalized,
          terms,
          question
        });
        if (!scored.accepted) continue;
        if (!best || scored.score > best.score) {
          best = { path: dec.normalized, line: i + 1, score: scored.score, kind: 'preferred_scan' };
        }
      }
      // Whole-file fallback only if a strong marker exists
      if (!best) {
        const scored = scoreHitRelevance({ text, path: dec.normalized, terms, question });
        if (scored.accepted) {
          // Find first marker line
          let line = 1;
          for (let i = 0; i < lines.length; i += 1) {
            const s = scoreHitRelevance({
              text: lines[i],
              path: dec.normalized,
              terms,
              question
            });
            if (s.accepted) {
              line = i + 1;
              break;
            }
          }
          best = { path: dec.normalized, line, score: scored.score, kind: 'preferred_scan' };
        }
      }
      if (best) hits.push(best);
    }
    hits.sort((a, b) => b.score - a.score);
    const out = hits.slice(0, PRIVATE_SOURCE_CONFIG.maxFileFetches);
    cache.set(cacheKey, out);
    return out;
  }

  async function stageASearch(terms, policy, question) {
    const queries = [];
    const rawHits = [];
    const seen = new Set();
    let searchCalls = 0;

    for (const term of terms) {
      if (searchCalls >= PRIVATE_SOURCE_CONFIG.maxSearchCalls) break;
      const q = String(term || '').trim();
      if (!q) continue;
      queries.push(q);
      searchCalls += 1;
      let batch = [];
      if (localRoot) {
        batch = localSearch(localRoot, q, policy, { limit: PRIVATE_SOURCE_CONFIG.maxFileFetches });
      } else {
        batch = await github.searchCode(q, { limit: PRIVATE_SOURCE_CONFIG.maxFileFetches });
      }
      for (const h of batch) {
        const p = String(h.path || '');
        if (!p || seen.has(p)) continue;
        const dec = evaluatePath(p, policy);
        if (!dec.allowed) continue;
        seen.add(p);
        rawHits.push({
          path: dec.normalized,
          line: h.line || 1,
          score: h.score || 1,
          kind: h.kind || 'search'
        });
      }
    }

    if (!rawHits.length && !localRoot) {
      const preferred = await scorePreferredOnGitHub(terms, policy, question);
      for (const h of preferred) {
        if (seen.has(h.path)) continue;
        seen.add(h.path);
        rawHits.push(h);
      }
    } else if (!rawHits.length && localRoot) {
      // Local: re-score via localSearch already; still apply relevance later
    }

    return { queries, hits: rawHits.slice(0, PRIVATE_SOURCE_CONFIG.maxFileFetches * 2) };
  }

  async function research({ question, rawQuestion, personal, need, weak, conflict, facts } = {}) {
    const debug = emptyDebug();
    const qForSearch = String(question || rawQuestion || '');

    if (personal || isPersonalOrPaymentQuestion(question) || isPersonalOrPaymentQuestion(rawQuestion)) {
      debug.privateSourceFallbackReason = 'personal_or_payment_skipped';
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }
    if (
      !shouldUsePrivateSource({
        question,
        rawQuestion,
        personal,
        need,
        weak,
        conflict,
        facts
      })
    ) {
      debug.privateSourceFallbackReason = 'not_applicable';
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }

    if (!localRoot && !github.configured()) {
      debug.privateSourceFallbackReason = 'github_auth_missing';
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }

    let policy;
    try {
      policy = await loadPolicy();
    } catch (err) {
      debug.privateSourceFallbackReason =
        err && err.code === 'github_auth_missing' ? 'github_auth_missing' : 'policy_fetch_failed';
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }
    if (policyDisabled || !policy.allowPaths.length) {
      debug.privateSourceFallbackReason = 'policy_fetch_failed';
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }

    const built = buildSearchTerms({ question: qForSearch, rawQuestion, facts });
    const terms = built.terms || [];
    debug.privateSemanticTerms = built.semanticTerms || [];
    if (!terms.length) {
      debug.privateSourceFallbackReason = 'empty_search_terms';
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }

    let stageA;
    try {
      stageA = await stageASearch(terms, policy, qForSearch);
    } catch (err) {
      const code = err && err.code;
      if (code === 'github_auth_failure' || code === 'github_auth_missing') {
        debug.privateSourceFallbackReason = 'github_auth_failure';
      } else if (err && err.name === 'AbortError') {
        debug.privateSourceFallbackReason = 'github_timeout';
      } else {
        debug.privateSourceFallbackReason = 'github_api_error';
      }
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }

    debug.privateSearchQueries = stageA.queries;
    debug.privateActualQueries = stageA.queries.slice();

    if (!stageA.hits.length) {
      debug.privateSourceFallbackReason = 'no_source_hits';
      return { enabled: true, passages: [], llmContext: '', packets: [], debug };
    }

    const packets = [];
    const acceptedMeta = [];
    let redactions = 0;
    let sanitizations = 0;
    let fetched = 0;

    for (const hit of stageA.hits) {
      if (fetched >= PRIVATE_SOURCE_CONFIG.maxFileFetches) break;
      const dec = evaluatePath(hit.path, policy);
      if (!dec.allowed) {
        debug.privateRejectedHits.push({ pathHint: hit.path.split('/').slice(-2).join('/'), reason: 'path_denied' });
        continue;
      }
      fetched += 1;
      let bytes;
      try {
        bytes = await readBytes(dec.normalized);
      } catch (err) {
        if (err && (err.code === 'github_auth_failure' || err.name === 'AbortError')) {
          debug.privateSourceFallbackReason =
            err.name === 'AbortError' ? 'github_timeout' : 'github_auth_failure';
          return { enabled: false, passages: [], llmContext: '', packets: [], debug };
        }
        continue;
      }
      if (!bytes) continue;
      const made = makeSafePacket(policy, dec.normalized, bytes, hit.line);
      if (!made.ok || !made.packet) {
        debug.privateRejectedHits.push({
          pathHint: dec.normalized.split('/').slice(-2).join('/'),
          reason: made.reason || 'unsafe_packet'
        });
        continue;
      }

      const match = evidenceMatchesQuestion(qForSearch, made.packet.safeText, terms);
      if (!match.ok) {
        debug.privateRejectedHits.push({
          pathHint: dec.normalized.split('/').slice(-2).join('/'),
          reason: match.reason
        });
        continue;
      }

      const rel =
        match.relevance ||
        scoreHitRelevance({
          text: made.packet.safeText,
          path: dec.normalized,
          terms,
          question: qForSearch
        }).score;

      if (rel < MIN_PRIVATE_RELEVANCE) {
        debug.privateRejectedHits.push({
          pathHint: dec.normalized.split('/').slice(-2).join('/'),
          reason: 'below_min_relevance',
          relevance: rel
        });
        continue;
      }

      packets.push({ ...made.packet, relevanceScore: rel });
      acceptedMeta.push({
        pathHint: dec.normalized.split('/').slice(-2).join('/'),
        relevance: rel
      });
      redactions += made.packet.redactionCount || 0;
      sanitizations += made.packet.sanitizeCount || 0;
    }

    debug.privateFilesFetched = fetched;
    debug.privateRedactions = redactions;
    debug.privateSanitizations = sanitizations;
    debug.privateAcceptedHits = acceptedMeta;
    debug.privateHitRelevance = acceptedMeta.map((a) => a.relevance);
    debug.privateSourceHits = acceptedMeta;
    debug.privateEvidenceQuestionMatch = packets.length ? 'ok' : 'no_match';

    if (!packets.length) {
      debug.privateSourceFallbackReason = 'no_relevant_evidence';
      return { enabled: true, passages: [], llmContext: '', packets: [], debug };
    }

    packets.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    const ctx = buildLlmContext(packets, policy);
    debug.privateSourceUsed = true;
    debug.privateSafeExcerptChars = ctx.safeExcerptChars;
    debug.privateSourceFallbackReason = null;

    // Grounding-only passages: NEVER put raw snippet in customer-facing text fields.
    const passages = packets.map((p, i) => ({
      id: `private-source-${i + 1}`,
      title: 'Verified product behavior',
      text: '',
      summary: '',
      details: '',
      href: '',
      score: Math.min(18, Math.max(1, Number(p.relevanceScore || 0))),
      sourceKind: 'private_source',
      category: 'private_source',
      visibility: 'public',
      verification: 'private_source',
      _llmSafeExcerpt: p.safeText,
      _groundingOnly: true,
      _doNotCitePath: true,
      relevanceScore: p.relevanceScore
    }));

    return {
      enabled: true,
      passages,
      llmContext: ctx.llmContext,
      systemRules: ctx.systemRules,
      packets,
      debug
    };
  }

  function invalidateCache() {
    cache.invalidatePrefix(`${PRIVATE_SOURCE_CONFIG.owner}/${PRIVATE_SOURCE_CONFIG.repo}@`);
    cache.invalidatePrefix('search:');
    cache.invalidatePrefix('file:');
    cache.invalidatePrefix('preferred:');
  }

  return {
    research,
    loadPolicy,
    evaluatePath: (p, pol) => evaluatePath(p, pol || loadedPolicy || disabledPolicy()),
    github,
    config: PRIVATE_SOURCE_CONFIG,
    repoSlug: repoSlug(),
    invalidateCache,
    isConfigured: () => !!(localRoot || github.configured())
  };
}

module.exports = {
  createPrivateSourceAdapter,
  PRIVATE_SOURCE_CONFIG,
  shouldUsePrivateSource,
  buildSearchTerms,
  isPersonalOrPaymentQuestion,
  sanitizeCustomerAnswer,
  customerAnswerIsSafe,
  CUSTOMER_SAFE_SYSTEM_RULES,
  sharedCache,
  MIN_PRIVATE_RELEVANCE
};
