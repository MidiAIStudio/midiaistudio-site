'use strict';

const { sourceKindOf } = require('./planner');

function uniqueById(passages) {
  const map = new Map();
  for (const p of passages || []) {
    if (!p || !p.id) continue;
    const id = String(p.id);
    const prev = map.get(id);
    if (!prev || Number(p.score || 0) > Number(prev.score || 0)) map.set(id, p);
  }
  return [...map.values()];
}

function authorityBonus(passage, need) {
  const kind = sourceKindOf(passage);
  if (need === 'catalog' && kind === 'catalog') return 40;
  if (need === 'release' && kind === 'release') return 36;
  if (need === 'notice' && (kind === 'notice' || kind === 'release')) return 30;
  if (need === 'operation' && kind === 'operation') return 18;
  if (need === 'error' && kind === 'error') return 16;
  if (kind === 'faq') return 4;
  if (kind === 'catalog' && need !== 'catalog') return -8;
  return 0;
}

function mergeAndRerank({ initialPassages, extraPassages, need, limit = 4 }) {
  const merged = uniqueById([...(initialPassages || []), ...(extraPassages || [])]).map((p) => ({
    ...p,
    score: Number(p.score || 0) + authorityBonus(p, need)
  }));
  merged.sort(
    (a, b) =>
      Number(b.score || 0) - Number(a.score || 0) ||
      Number(a.priority || 99) - Number(b.priority || 99)
  );
  return merged.slice(0, limit);
}

function shouldEarlyStop({ passages, need, weak, conflict }) {
  if (!passages || !passages.length) return false;
  const top = passages[0];
  const kind = sourceKindOf(top);
  if (need === 'release' && kind === 'release' && Number(top.score || 0) >= 12) return true;
  if (need === 'catalog' && kind === 'catalog') return true;
  if (need === 'operation' && kind === 'operation' && Number(top.score || 0) >= 16) return true;
  if (!weak && !conflict && Number(top.score || 0) >= 18) return true;
  return false;
}

function pickAuthoritativeOnConflict(passages, need) {
  if (!passages || passages.length < 2) return passages || [];
  const ranked = mergeAndRerank({ initialPassages: passages, extraPassages: [], need, limit: passages.length });
  return ranked;
}

module.exports = {
  uniqueById,
  mergeAndRerank,
  shouldEarlyStop,
  pickAuthoritativeOnConflict,
  authorityBonus
};
