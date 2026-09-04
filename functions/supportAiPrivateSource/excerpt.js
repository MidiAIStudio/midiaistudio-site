'use strict';

const { PRIVATE_SOURCE_CONFIG } = require('./config');
const path = require('path');

const BINARY_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.exe',
  '.dll',
  '.pyd',
  '.so',
  '.dylib',
  '.whl',
  '.zip',
  '.7z',
  '.pdf',
  '.mid',
  '.mp3',
  '.wav',
  '.db',
  '.pyc'
]);

function isProbablyBinary(filePath, sample) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (BINARY_EXT.has(ext)) return true;
  if (sample && Buffer.isBuffer(sample) && sample.slice(0, 4096).includes(0)) return true;
  return false;
}

function extractExcerpt(content, { hitLine = null, contextLines, maxLines } = {}) {
  const ctx = contextLines == null ? PRIVATE_SOURCE_CONFIG.contextLines : contextLines;
  const max = maxLines == null ? PRIVATE_SOURCE_CONFIG.maxLinesPerFile : maxLines;
  if (content == null) return { ok: false, reason: 'empty', text: '', startLine: 0, endLine: 0, totalLines: 0 };
  const lines = String(content).split(/\r?\n/);
  const total = lines.length;
  if (!total) return { ok: false, reason: 'empty', text: '', startLine: 0, endLine: 0, totalLines: 0 };

  let start;
  let end;
  if (hitLine == null) {
    start = 1;
    end = Math.min(total, max);
  } else {
    const hl = Math.max(1, Math.min(total, Number(hitLine) || 1));
    start = Math.max(1, hl - ctx);
    end = Math.min(total, hl + ctx);
    if (end - start + 1 > max) {
      const half = Math.floor(max / 2);
      start = Math.max(1, hl - half);
      end = Math.min(total, start + max - 1);
      start = Math.max(1, end - max + 1);
    }
  }
  return {
    ok: true,
    reason: 'ok',
    text: lines.slice(start - 1, end).join('\n'),
    startLine: start,
    endLine: end,
    totalLines: total
  };
}

function truncatePacketBudget(texts, maxChars) {
  const budget = maxChars == null ? PRIVATE_SOURCE_CONFIG.maxTotalChars : maxChars;
  const out = [];
  let used = 0;
  for (const t of texts || []) {
    if (used >= budget) break;
    const remain = budget - used;
    if (t.length <= remain) {
      out.push(t);
      used += t.length;
    } else {
      out.push(`${t.slice(0, remain)}\n# [TRUNCATED_FOR_BUDGET]`);
      break;
    }
  }
  return out;
}

module.exports = {
  isProbablyBinary,
  extractExcerpt,
  truncatePacketBudget
};
