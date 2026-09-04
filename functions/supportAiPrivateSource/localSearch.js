'use strict';

const fs = require('fs');
const path = require('path');
const { evaluatePath } = require('./pathGate');
const { PRIVATE_SOURCE_CONFIG } = require('./config');

const SKIP_DIR_PREFIXES = [
  'reports',
  'dev/reports',
  'dev/backups',
  'venv',
  'node_modules',
  '.git',
  'build',
  'dist',
  'cache',
  'logs'
];

function collectAllowedFiles(root, policy) {
  const out = [];
  function walk(absDir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      const low = rel.toLowerCase();
      if (ent.isDirectory()) {
        if (SKIP_DIR_PREFIXES.some((p) => low === p || low.startsWith(`${p}/`))) continue;
        walk(path.join(absDir, ent.name), rel);
        continue;
      }
      if (!ent.isFile()) continue;
      if (evaluatePath(rel, policy).allowed) out.push(rel);
    }
  }
  walk(root, '');
  return out;
}

/**
 * Stage A local search (tests / optional local fixture root).
 * Production path uses GitHub searchCode instead.
 */
function localSearch(root, query, policy, { limit } = {}) {
  const q = String(query || '').trim();
  if (!q || !root) return [];
  const max = limit == null ? PRIVATE_SOURCE_CONFIG.maxFileFetches : limit;
  const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (!tokens.length) return [];
  const requireAllTokens = tokens.length > 1;
  const symbolRe = new RegExp(
    `\\b(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'i'
  );

  function scoreText(rel, text) {
    const base = path.basename(rel).toLowerCase();
    let score = 0;
    let line = 1;
    let kind = 'text';
    const low = text.toLowerCase();
    const lines = text.split(/\r?\n/);
    if (
      requireAllTokens &&
      !tokens.every((t) => low.includes(t.toLowerCase()) || base.includes(t.toLowerCase()))
    ) {
      return null;
    }
    if (tokens.some((t) => base.includes(t.toLowerCase()))) {
      score += 50;
      kind = 'filename';
    }
    // Prefer a line that contains the full query phrase or all tokens (word-ish)
    const phrase = tokens.join(' ').toLowerCase();
    let phraseLine = -1;
    let bestLineScore = -1;
    const lineScanLimit = Math.min(lines.length, 8000);
    for (let i = 0; i < lineScanLimit; i += 1) {
      const rawLine = lines[i];
      const ll = rawLine.toLowerCase();
      let lineScore = 0;
      if (phrase && ll.includes(phrase)) lineScore += 100;
      let tokenHits = 0;
      for (const t of tokens) {
        const tre = new RegExp(
          `(?:^|[^a-z0-9_])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^a-z0-9_]|$)`,
          'i'
        );
        if (tre.test(rawLine)) tokenHits += 1;
      }
      if (tokenHits === tokens.length) lineScore += 50 + tokenHits * 5;
      else if (tokenHits > 0) lineScore += tokenHits * 3;
      if (
        /midi_ai_easy_key|midi_ai_cleanup|midi_ai_instrument_arrange|easier key|ai cleanup|instrument arrange/i.test(
          rawLine
        ) &&
        /(easy|key|cleanup|arrange|정리|쉬운|편곡|instrument)/i.test(tokens.join(' '))
      ) {
        lineScore += 80;
      }
      if (lineScore > bestLineScore) {
        bestLineScore = lineScore;
        phraseLine = i + 1;
      }
    }
    if (bestLineScore >= 50) {
      score += Math.min(60, bestLineScore);
      line = phraseLine;
      kind = kind === 'filename' ? kind : 'phrase';
    } else {
      const m = symbolRe.exec(text);
      if (m) {
        score += requireAllTokens ? 25 : 30;
        if (kind !== 'filename') kind = 'symbol';
        line = text.slice(0, m.index).split(/\n/).length;
      } else {
        for (const t of tokens) {
          const idx = low.indexOf(t.toLowerCase());
          if (idx >= 0) {
            score += 10;
            line = text.slice(0, idx).split(/\n/).length;
            break;
          }
        }
      }
    }
    if (score <= 0) return null;
    if (/^lang\//i.test(rel)) score += 25;
    if (/^run_gui\.py$/i.test(rel)) score += 15;
    if (/^ui\//i.test(rel)) score += 10;
    return { path: rel, line, score, kind };
  }

  const preferred = [
    'lang/en.json',
    'lang/ko.json',
    'lang/ja.json',
    'run_gui.py',
    'app_version.py',
    'AGENTS.md'
  ];
  const hits = [];
  const seen = new Set();
  for (const rel of preferred) {
    if (!evaluatePath(rel, policy).allowed) continue;
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    let text = '';
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (_) {
      continue;
    }
    const hit = scoreText(rel, text);
    if (hit) {
      hits.push(hit);
      seen.add(rel);
    }
  }
  hits.sort((a, b) => b.score - a.score);
  if (hits.length >= max) return hits.slice(0, max);

  let examined = 0;
  const MAX_EXAMINE = 400;
  for (const rel of collectAllowedFiles(root, policy)) {
    if (seen.has(rel)) continue;
    examined += 1;
    if (examined > MAX_EXAMINE) break;
    let text = '';
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch (_) {
      continue;
    }
    if (text.length > 500_000) continue;
    const hit = scoreText(rel, text);
    if (hit) {
      hits.push(hit);
      seen.add(rel);
      if (hits.length >= max * 3) break;
    }
  }

  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const out = [];
  const outSeen = new Set();
  for (const h of hits) {
    if (outSeen.has(h.path)) continue;
    outSeen.add(h.path);
    out.push(h);
    if (out.length >= max) break;
  }
  return out;
}

module.exports = { localSearch, collectAllowedFiles };
