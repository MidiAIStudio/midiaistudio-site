/**
 * MidiAI Studio Product Knowledge loader for Support AI RAG.
 * Public customer AI may only retrieve visibility:"public" + verification:"verified" + active:true.
 * Admin/internal helpers may also use visibility:"internal".
 * Never embeds secrets; docs are curated product facts only.
 */
const fs = require('fs');
const path = require('path');
const { docContentFingerprint } = require('./sourceHash');

const ROOT = __dirname;
const DEFAULT_MIN_SCORE = 3;

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn('knowledge load failed', filePath, err && err.message);
    return [];
  }
}

function loadDocs(subdir) {
  const dir = path.join(ROOT, subdir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const data = readJsonSafe(path.join(dir, name));
    if (Array.isArray(data)) out.push(...data);
    else if (data && typeof data === 'object') out.push(data);
  }
  return out;
}

function isRetrievable(doc, { includeInternal = false } = {}) {
  if (!doc || doc.active === false) return false;
  if (doc.verification !== 'verified') return false;
  if (doc.visibility === 'public') return true;
  if (includeInternal && doc.visibility === 'internal') return true;
  return false;
}

function passageText(doc, locale = 'ko') {
  const loc = String(locale || 'ko').toLowerCase();
  const summary =
    (doc.summary && (doc.summary[loc] || doc.summary.ko || doc.summary.en)) ||
    (typeof doc.summary === 'string' ? doc.summary : '');
  const details =
    (doc.details && (doc.details[loc] || doc.details.ko || doc.details.en)) ||
    (typeof doc.details === 'string' ? doc.details : '');
  const steps = Array.isArray(doc.steps)
    ? doc.steps
        .map((s, i) => {
          if (typeof s === 'string') return `${i + 1}. ${s}`;
          const t = s[loc] || s.ko || s.en || '';
          return t ? `${i + 1}. ${t}` : '';
        })
        .filter(Boolean)
        .join(' ')
    : '';
  const fix = Array.isArray(doc.fixSteps)
    ? doc.fixSteps
        .map((s) => (typeof s === 'string' ? s : s[loc] || s.ko || s.en || ''))
        .filter(Boolean)
        .join(' ')
    : '';
  const feature =
    doc.featureStatus && doc.featureStatus !== 'production'
      ? `featureStatus=${doc.featureStatus}`
      : '';
  return [summary, details, steps, fix ? `확인/해결: ${fix}` : '', feature]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toRetrievalDoc(doc, locale = 'ko') {
  return {
    id: doc.id,
    priority: Number(doc.priority || 2),
    title: (doc.title && (doc.title[locale] || doc.title.ko || doc.title.en || doc.title.ja)) || doc.id,
    href: doc.relatedGuideUrl || '',
    keywords: Array.isArray(doc.keywords) ? doc.keywords : [],
    text: passageText(doc, locale),
    category: doc.category || '',
    visibility: doc.visibility || 'public',
    featureStatus: doc.featureStatus || 'production',
    verification: doc.verification || 'needs_review',
    sourceHash: doc.sourceHash || docContentFingerprint(doc),
    knowledgeUpdatedAt: doc.knowledgeUpdatedAt || null
  };
}

function scoreDoc(q, doc) {
  const s = String(q || '').toLowerCase();
  let score = 0;
  for (const kw of doc.keywords || []) {
    const k = String(kw).toLowerCase();
    if (k && s.includes(k)) score += Math.max(3, Math.min(8, k.length));
  }
  const title = String(doc.title || '').toLowerCase();
  if (title && s.includes(title)) score += 6;
  if (doc.category && s.includes(String(doc.category).toLowerCase())) score += 2;
  return score;
}

function detectLocale(question) {
  const q = String(question || '');
  if (/[가-힣]/.test(q)) return 'ko';
  if (/[\u3040-\u30ff]/.test(q) || (/[\u3400-\u9fff]/.test(q) && !/[a-zA-Z]{8,}/.test(q))) return 'ja';
  if (/[a-zA-Z]{3,}/.test(q)) return 'en';
  return 'ko';
}

/**
 * @returns {Array<{id,title,text,href,keywords,priority,score,visibility,featureStatus}>}
 */
function retrieveKnowledge(
  question,
  { limit = 4, includeInternal = false, locale = 'ko', minScore = DEFAULT_MIN_SCORE } = {}
) {
  const all = [...loadDocs('public'), ...(includeInternal ? loadDocs('internal') : [])];
  const ranked = all
    .filter((d) => isRetrievable(d, { includeInternal }))
    .map((d) => toRetrievalDoc(d, locale))
    .map((d) => ({ d, score: scoreDoc(question, d) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score || a.d.priority - b.d.priority);
  return ranked.slice(0, limit).map((x) => ({ ...x.d, score: x.score }));
}

function knowledgeStats() {
  const pub = loadDocs('public');
  const inn = loadDocs('internal');
  const count = (rows, pred) => rows.filter(pred).length;
  return {
    publicTotal: pub.length,
    publicVerified: count(pub, (d) => d.verification === 'verified' && d.active !== false),
    publicNeedsReview: count(pub, (d) => d.verification === 'needs_review'),
    internalTotal: inn.length,
    internalVerified: count(inn, (d) => d.verification === 'verified' && d.active !== false),
    internalNeedsReview: count(inn, (d) => d.verification === 'needs_review')
  };
}

function stampSourceHashesInMemory(docs) {
  const now = new Date().toISOString().slice(0, 10);
  return (docs || []).map((doc) => ({
    ...doc,
    sourceHash: docContentFingerprint(doc),
    knowledgeUpdatedAt: doc.knowledgeUpdatedAt || now
  }));
}

module.exports = {
  loadDocs,
  retrieveKnowledge,
  knowledgeStats,
  isRetrievable,
  toRetrievalDoc,
  detectLocale,
  stampSourceHashesInMemory,
  DEFAULT_MIN_SCORE
};
