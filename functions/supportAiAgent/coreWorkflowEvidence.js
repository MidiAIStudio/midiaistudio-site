/**
 * Core Studio workflow search expansion + composite evidence helpers.
 * When a how-to has no modality (YouTube/audio/PDF/…), expand retrieval to
 * official conversion / getting-started workflows — not phrase hardcodes.
 */
'use strict';

const CORE_WORKFLOW_DOC_IDS = new Set([
  'youtube-to-midi',
  'audio-to-midi',
  'pdf-to-midi',
  'nav-workspace',
  'getting-started-install',
  'midi-editor',
  'studio-preview-range',
  'studio-preview-playback',
  'library-local',
  'ai-assistant',
  'export-formats',
  'score-editor',
  'credits-usage'
]);

/** Stable retrieval queries that match existing Knowledge keywords (not user phrases). */
const CORE_WORKFLOW_SEARCH_QUERIES = [
  'YouTube to MIDI',
  'audio to MIDI',
  'getting started Studio',
  'MIDI Editor'
];

const STUDIO_AREAS = new Set(['studio_conversion', 'product_ui', 'general', '']);
const USAGE_INTENTS = new Set(['how_to', 'feature_explanation', 'where', 'general']);

function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasModalitySignal(text) {
  return /(youtube|유튜브|\byt\b|audio|오디오|mp3|wav|m4a|webm|\bpdf\b|midi\s*editor|미디\s*편집|미디에디터|라이브러리|\blibrary\b|assistant|어시스턴트|악보\s*인식|pdf\s*to)/i.test(
    String(text || '')
  );
}

function understandingBlob(understanding = {}) {
  return [
    understanding.userGoal,
    understanding.resolvedQuery,
    understanding.topic,
    ...(Array.isArray(understanding.searchQueries) ? understanding.searchQueries : [])
  ]
    .map(clean)
    .filter(Boolean)
    .join(' ');
}

/**
 * True when this is a Studio usage/how-to ask without a named input modality.
 * Does not match on the word "변환" — uses intent + productArea + modality absence.
 */
function needsCoreWorkflowExpansion(understanding = {}) {
  if (understanding.contradiction) return false;
  const intent = String(understanding.intent || '');
  if (intent === 'troubleshooting') return false;
  if (!USAGE_INTENTS.has(intent)) return false;

  const area = String(understanding.productArea || '').toLowerCase();
  if (!STUDIO_AREAS.has(area)) return false;
  if (understanding.selectedMode) return false;

  if (hasModalitySignal(understandingBlob(understanding))) return false;
  return true;
}

function expandCoreWorkflowSearchQueries(searchQueries, understanding = {}) {
  const base = (Array.isArray(searchQueries) ? searchQueries : []).map(clean).filter(Boolean);
  const probe = { ...understanding, searchQueries: base };
  if (!needsCoreWorkflowExpansion(probe)) return base.slice(0, 4);

  const out = [];
  const push = (q) => {
    const t = clean(q);
    if (t && !out.includes(t)) out.push(t);
  };
  // Prefer workflow queries first so merge rank is driven by real docs, not a 0-score raw phrase.
  for (const q of CORE_WORKFLOW_SEARCH_QUERIES) push(q);
  for (const q of base) push(q);
  return out.slice(0, 4);
}

function countWorkflowCluster(passages) {
  let n = 0;
  for (const p of passages || []) {
    if (CORE_WORKFLOW_DOC_IDS.has(String(p.id || ''))) n += 1;
  }
  return n;
}

/**
 * Multiple official workflow docs supporting the same Studio how-to → MEDIUM.
 * Keeps NONE/LOW when cluster is empty or only one weak unrelated hit.
 */
function applyCompositeWorkflowConfidence(confidence, acceptedPassages) {
  const conf = String(confidence || 'NONE').toUpperCase();
  if (conf === 'HIGH' || conf === 'MEDIUM') return conf;

  const accepted = acceptedPassages || [];
  const cluster = countWorkflowCluster(accepted);
  const scored = accepted.filter((p) => Number(p.score || 0) >= 5);
  const clusterScored = scored.filter((p) => CORE_WORKFLOW_DOC_IDS.has(String(p.id || '')));

  if (clusterScored.length >= 2) return 'MEDIUM';
  if (cluster >= 2 && scored.length >= 2) return 'MEDIUM';
  if (clusterScored.length >= 1 && Number(clusterScored[0].score || 0) >= 10) return 'MEDIUM';
  return conf;
}

module.exports = {
  CORE_WORKFLOW_DOC_IDS,
  CORE_WORKFLOW_SEARCH_QUERIES,
  needsCoreWorkflowExpansion,
  expandCoreWorkflowSearchQueries,
  countWorkflowCluster,
  applyCompositeWorkflowConfidence,
  hasModalitySignal
};
