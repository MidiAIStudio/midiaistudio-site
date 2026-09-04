'use strict';

const { PRIVATE_SOURCE_CONFIG } = require('./config');

function asList(v) {
  return Array.isArray(v) ? v.map(String) : [];
}

function normalizePolicy(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    name: String(data.name || 'midiai-support-ai-source-policy'),
    version: Number(data.version || 1),
    allowPaths: asList(data.allowPaths),
    denyPaths: asList(data.denyPaths),
    denyPatterns: asList(data.denyPatterns),
    customerSafeRules: asList(data.customerSafeRules),
    notes: asList(data.notes)
  };
}

/**
 * Fail-closed: empty allow list means nothing is readable.
 * Used only as a disabled sentinel — callers must disable the adapter instead of searching.
 */
function disabledPolicy() {
  return normalizePolicy({
    name: 'disabled',
    version: 0,
    allowPaths: [],
    denyPaths: ['**'],
    denyPatterns: ['*'],
    customerSafeRules: []
  });
}

module.exports = {
  normalizePolicy,
  disabledPolicy,
  policyCacheKey: () =>
    `${PRIVATE_SOURCE_CONFIG.owner}/${PRIVATE_SOURCE_CONFIG.repo}@${PRIVATE_SOURCE_CONFIG.sourceRef}:policy`
};
