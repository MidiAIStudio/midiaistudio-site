/**
 * Safe content hashing for Knowledge stale detection.
 * Never hash secrets/PII — only normalized public product text + declared source files.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashString(text) {
  return crypto.createHash('sha256').update(normalizeText(text), 'utf8').digest('hex').slice(0, 16);
}

function docContentFingerprint(doc) {
  const parts = [
    doc.id,
    JSON.stringify(doc.title || ''),
    JSON.stringify(doc.summary || ''),
    JSON.stringify(doc.details || ''),
    JSON.stringify(doc.steps || ''),
    JSON.stringify(doc.fixSteps || ''),
    JSON.stringify(doc.knownSymptoms || ''),
    doc.featureStatus || '',
    doc.relatedGuideUrl || '',
    ...(Array.isArray(doc.keywords) ? doc.keywords : [])
  ];
  return hashString(parts.join('|'));
}

function hashFileSafe(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    const raw = fs.readFileSync(absPath, 'utf8');
    // Strip volatile cache-busters / timestamps that do not change product facts
    const cleaned = raw
      .replace(/\?v=[a-zA-Z0-9._-]+/g, '')
      .replace(/updatedAt["']?\s*[:=]\s*["'][^"']+["']/gi, '');
    return hashString(cleaned);
  } catch (_) {
    return null;
  }
}

function repoRootFromKnowledge() {
  return path.resolve(__dirname, '..', '..');
}

module.exports = {
  normalizeText,
  hashString,
  docContentFingerprint,
  hashFileSafe,
  repoRootFromKnowledge
};
