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
const { CUSTOMER_SAFE_SYSTEM_RULES, sanitizeCustomerAnswer, customerAnswerIsSafe } = require('./customerSafe');

const sharedCache = createTtlCache({ ttlMs: PRIVATE_SOURCE_CONFIG.cacheTtlMs });

function emptyDebug(extra) {
  return {
    privateSourceUsed: false,
    privateSourceRef: PRIVATE_SOURCE_CONFIG.sourceRef,
    privateSearchQueries: [],
    privateSourceHits: [],
    privateFilesFetched: 0,
    privateSafeExcerptChars: 0,
    privateRedactions: 0,
    privateSanitizations: 0,
    privateSourceFallbackReason: null,
    ...extra
  };
}

/**
 * Production private source research adapter.
 * GitHub fetch → path gate → redact → sanitize → bounded excerpt → (caller → OpenAI)
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

  async function scorePreferredOnGitHub(terms, policy) {
    const hits = [];
    const seen = new Set();
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
      for (const term of terms) {
        const tokens = String(term || '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 6);
        if (!tokens.length) continue;
        const low = text.toLowerCase();
        const requireAll = tokens.length > 1;
        if (requireAll && !tokens.every((t) => low.includes(t.toLowerCase()))) continue;
        let bestLine = 1;
        let score = 0;
        const lines = text.split(/\r?\n/);
        const phrase = tokens.join(' ').toLowerCase();
        for (let i = 0; i < Math.min(lines.length, 8000); i += 1) {
          const ll = lines[i].toLowerCase();
          let lineScore = 0;
          if (phrase && ll.includes(phrase)) lineScore += 100;
          if (
            /midi_ai_easy_key|midi_ai_cleanup|midi_ai_instrument_arrange|easier key|ai cleanup|instrument arrange|guided arrangement/i.test(
              lines[i]
            ) &&
            /(easy_key|easier|cleanup|arrange|정리|쉬운|편곡|instrument\s*arrange)/i.test(tokens.join(' '))
          ) {
            lineScore += 80;
          }
          let tokenHits = 0;
          for (const t of tokens) {
            if (ll.includes(t.toLowerCase())) tokenHits += 1;
          }
          if (tokenHits === tokens.length) lineScore += 40;
          if (lineScore > score) {
            score = lineScore;
            bestLine = i + 1;
          }
        }
        if (score <= 0) {
          for (const t of tokens) {
            const idx = low.indexOf(t.toLowerCase());
            if (idx >= 0) {
              score = 15;
              bestLine = text.slice(0, idx).split(/\n/).length;
              break;
            }
          }
        }
        if (score <= 0) continue;
        if (/^lang\//i.test(dec.normalized)) score += 25;
        if (/^run_gui\.py$/i.test(dec.normalized)) score += 15;
        if (!seen.has(dec.normalized) || score > (hits.find((h) => h.path === dec.normalized) || {}).score) {
          seen.add(dec.normalized);
          const existing = hits.findIndex((h) => h.path === dec.normalized);
          const row = {
            path: dec.normalized,
            line: bestLine,
            score,
            kind: 'preferred_scan'
          };
          if (existing >= 0) hits[existing] = row;
          else hits.push(row);
        }
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, PRIVATE_SOURCE_CONFIG.maxFileFetches);
  }

  async function stageASearch(terms, policy) {
    const queries = [];
    const hits = [];
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
        hits.push({ path: dec.normalized, line: h.line || 1, score: h.score || 1, kind: h.kind || 'search' });
      }
    }

    // GitHub code search often lags after merges (incomplete_results / empty).
    // Fall back to bounded preferred-file scan — still path-gated, never repo-wide enumerate.
    if (!hits.length && !localRoot) {
      const preferred = await scorePreferredOnGitHub(terms, policy);
      for (const h of preferred) {
        if (seen.has(h.path)) continue;
        seen.add(h.path);
        hits.push(h);
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return { queries, hits: hits.slice(0, PRIVATE_SOURCE_CONFIG.maxFileFetches) };
  }

  async function readBytes(relPath) {
    if (localRoot) {
      const full = path.join(localRoot, relPath);
      return fs.readFileSync(full);
    }
    const file = await github.getFileContent(relPath);
    return file && file.bytes ? file.bytes : null;
  }

  async function research({ question, rawQuestion, personal, need, weak, conflict, facts, sourcePlan } = {}) {
    const debug = emptyDebug();

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

    const terms = buildSearchTerms({ question, rawQuestion, facts, sourcePlan });
    if (!terms.length) {
      debug.privateSourceFallbackReason = 'empty_search_terms';
      return { enabled: false, passages: [], llmContext: '', packets: [], debug };
    }

    let stageA;
    try {
      stageA = await stageASearch(terms, policy);
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
    // Hit paths kept abbreviated for debug (basename only in production-facing debug)
    debug.privateSourceHits = stageA.hits.map((h) => ({
      pathHint: String(h.path || '').split('/').slice(-2).join('/'),
      score: h.score
    }));

    if (!stageA.hits.length) {
      debug.privateSourceUsed = false;
      debug.privateSourceFallbackReason = 'no_source_hits';
      return { enabled: true, passages: [], llmContext: '', packets: [], debug };
    }

    const packets = [];
    let redactions = 0;
    let sanitizations = 0;
    let fetched = 0;

    for (const hit of stageA.hits) {
      if (fetched >= PRIVATE_SOURCE_CONFIG.maxFileFetches) break;
      const dec = evaluatePath(hit.path, policy);
      if (!dec.allowed) continue;
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
      if (!made.ok || !made.packet) continue;
      packets.push(made.packet);
      redactions += made.packet.redactionCount || 0;
      sanitizations += made.packet.sanitizeCount || 0;
    }

    debug.privateFilesFetched = fetched;
    debug.privateRedactions = redactions;
    debug.privateSanitizations = sanitizations;

    if (!packets.length) {
      debug.privateSourceFallbackReason = 'no_safe_excerpts';
      return { enabled: true, passages: [], llmContext: '', packets: [], debug };
    }

    const ctx = buildLlmContext(packets, policy);
    debug.privateSourceUsed = true;
    debug.privateSafeExcerptChars = ctx.safeExcerptChars;
    debug.privateSourceFallbackReason = null;

    // Customer-facing passage text: behavior summary placeholders (no paths)
    // Center snippet on hit line so ±80 context does not bury the match in the first 400 chars.
    const passages = packets.map((p, i) => {
      const lines = String(p.safeText || '').split(/\r?\n/);
      const hit = Math.max(p.startLine, Math.min(p.endLine, p.hitLine || p.startLine));
      const localIdx = hit - p.startLine;
      const from = Math.max(0, localIdx - 6);
      const to = Math.min(lines.length, localIdx + 7);
      const snippet = lines
        .slice(from, to)
        .join(' ')
        .replace(/\s+/g, ' ')
        .slice(0, 400);
      return {
        id: `private-source-${i + 1}`,
        title: 'Verified product behavior',
        text: snippet,
        href: '',
        score: 22 - i,
        sourceKind: 'private_source',
        category: 'private_source',
        visibility: 'public',
        verification: 'private_source',
        _llmSafeExcerpt: p.safeText,
        _doNotCitePath: true
      };
    });

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
  sharedCache
};
