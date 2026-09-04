'use strict';

/**
 * Single config for private app source adapter.
 * Do not scatter repo/ref literals across the codebase.
 */
const PRIVATE_SOURCE_CONFIG = Object.freeze({
  owner: 'MidiAIStudio',
  repo: 'MidiAI-Studio',
  /** Temporary until cleanup branch merges to main */
  sourceRef: process.env.SUPPORT_AI_SOURCE_REF || 'repo-cleanup-support-ai',
  policyPath: 'support-ai-source-policy.json',
  maxSearchCalls: 3,
  maxFileFetches: 5,
  contextLines: 80,
  maxLinesPerFile: 250,
  maxTotalChars: 80000,
  searchTimeoutMs: 8000,
  fetchTimeoutMs: 8000,
  cacheTtlMs: 5 * 60 * 1000
});

function repoSlug() {
  return `${PRIVATE_SOURCE_CONFIG.owner}/${PRIVATE_SOURCE_CONFIG.repo}`;
}

module.exports = {
  PRIVATE_SOURCE_CONFIG,
  repoSlug
};
