'use strict';

function normalizePath(raw) {
  let s = String(raw || '').trim().replace(/\\/g, '/');
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(s);
      if (decoded === s) break;
      s = decoded;
    } catch (_) {
      break;
    }
  }
  s = s.replace(/\\/g, '/');
  while (s.includes('//')) s = s.replace(/\/\//g, '/');
  s = s.replace(/^\//, '');
  const parts = [];
  for (const p of s.split('/')) {
    if (!p || p === '.') continue;
    parts.push(p);
  }
  return parts.join('/');
}

function globToRegExp(pat) {
  const escaped = pat
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<DD>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/<<<DD>>>/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchGlob(path, pattern) {
  const pat = String(pattern || '').replace(/\\/g, '/').replace(/^\//, '');
  const pathL = String(path || '').toLowerCase();
  const patL = pat.toLowerCase();
  if (!patL) return false;

  if (!patL.includes('/') && !patL.startsWith('*')) {
    const base = pathL.split('/').pop();
    if (globToRegExp(patL).test(base)) return true;
  }
  if (globToRegExp(patL).test(pathL)) return true;
  if (globToRegExp(patL).test(pathL.split('/').pop())) return true;
  return false;
}

function matchesAny(path, patterns) {
  for (const pat of patterns || []) {
    if (matchGlob(path, pat)) return pat;
  }
  return null;
}

/**
 * Default-deny path gate. Deny always wins over allow.
 */
function evaluatePath(rawPath, policy) {
  if (rawPath == null || String(rawPath).trim() === '') {
    return { allowed: false, reason: 'empty_path', normalized: '' };
  }
  const original = String(rawPath);
  const low = original.toLowerCase();
  if (
    /(^|\/|\\)\.\.(\/|\\|$)/.test(original) ||
    low.includes('%2e%2e') ||
    low.includes('%252e') ||
    low.includes('..%2f') ||
    low.includes('%2f..')
  ) {
    return { allowed: false, reason: 'path_traversal', normalized: normalizePath(original) };
  }
  if (/^(?:[a-zA-Z]:[\\/]|\\\\|\/|file:)/i.test(original.trim())) {
    return { allowed: false, reason: 'absolute_path', normalized: normalizePath(original) };
  }

  const normalized = normalizePath(original);
  if (!normalized) return { allowed: false, reason: 'empty_normalized', normalized: '' };
  if (normalized.split('/').includes('..')) {
    return { allowed: false, reason: 'path_traversal', normalized };
  }

  // Hard rejects (binary / cache) — always deny regardless of allow list
  if (
    /(^|\/)__pycache__(\/|$)/i.test(normalized) ||
    /\.(pyc|pyo|exe|dll|so|dylib|png|jpg|jpeg|gif|webp|zip|7z|pdf|mid|mp3|wav|db)$/i.test(normalized)
  ) {
    return { allowed: false, reason: 'hard_deny_binary_or_cache', normalized };
  }

  const denyHit = matchesAny(normalized, policy.denyPaths);
  if (denyHit) return { allowed: false, reason: `deny_path:${denyHit}`, normalized };

  const denyPat = matchesAny(normalized, policy.denyPatterns);
  if (denyPat) return { allowed: false, reason: `deny_pattern:${denyPat}`, normalized };

  const allowHit = matchesAny(normalized, policy.allowPaths);
  if (allowHit) return { allowed: true, reason: `allow_path:${allowHit}`, normalized };

  return { allowed: false, reason: 'default_deny', normalized };
}

module.exports = { evaluatePath, normalizePath, matchGlob };
