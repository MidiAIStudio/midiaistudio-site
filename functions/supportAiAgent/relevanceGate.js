/**
 * Support AI — retrieval relevance gate.
 * Rejects docs that share keywords but do not answer the understood question.
 */
'use strict';

function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function passageBlob(p) {
  return clean(
    [p.id, p.title, p.category, p.summary, ...(p.keywords || [])]
      .map((x) => String(x || ''))
      .join(' ')
  );
}

/**
 * Returns { accepted, rejected, confidence }
 * confidence: high | medium | low | none
 */
function gatePassages(passages, understanding = {}) {
  const list = Array.isArray(passages) ? passages : [];
  const intent = String(understanding.intent || '');
  const contradiction = String(understanding.contradiction || '');
  const selectedMode = String(understanding.selectedMode || '');
  const observedLabel = String(understanding.observedLabel || '');
  const topic = String(understanding.topic || '');

  const accepted = [];
  const rejected = [];

  for (const p of list) {
    const blob = passageBlob(p);
    const id = String(p.id || '');
    let reason = null;

    // Feature preview / marketing docs must not answer mode-mismatch troubleshooting
    if (
      contradiction === 'mode_label_mismatch' &&
      intent === 'troubleshooting' &&
      (id === 'band-orchestra-preview' ||
        (/band|orchestra|오케스트라|밴드/.test(blob) &&
          /(preview|experimental|프리뷰|베타|beta)/.test(blob) &&
          !/(실패|오류|에러|fail|error|mismatch|불일치)/.test(blob)))
    ) {
      reason = 'feature_doc_for_mismatch_troubleshoot';
    }

    // Orchestra feature question should keep orchestra docs
    if (
      !reason &&
      (intent === 'feature_explanation' || intent === 'how_to') &&
      (observedLabel === 'orchestra' || selectedMode === 'orchestra' || /orchestra|오케스트라/.test(topic))
    ) {
      // keep
    }

    // Piano troubleshooting should not prefer orchestra feature page
    if (
      !reason &&
      intent === 'troubleshooting' &&
      selectedMode === 'piano' &&
      !contradiction &&
      id === 'band-orchestra-preview'
    ) {
      reason = 'orchestra_feature_for_piano_troubleshoot';
    }

    // Generic: docs that only share a secondary label token while contradiction points elsewhere
    if (
      !reason &&
      contradiction === 'mode_label_mismatch' &&
      observedLabel &&
      selectedMode &&
      blob.includes(observedLabel === 'orchestra' ? 'orchestra' : observedLabel) &&
      !blob.includes(selectedMode === 'piano' ? 'piano' : selectedMode) &&
      /(preview|experimental|기능\s*소개|what\s+is)/.test(blob)
    ) {
      reason = 'label_keyword_only';
    }

    if (reason) {
      rejected.push({ id, title: p.title || '', reason, score: p.score });
    } else {
      accepted.push(p);
    }
  }

  let confidence = 'none';
  if (accepted.length) {
    const top = Number(accepted[0].score || 0);
    if (contradiction === 'mode_label_mismatch' && accepted.length) confidence = 'medium';
    else if (top >= 18) confidence = 'high';
    else if (top >= 10) confidence = 'medium';
    else confidence = 'low';
  }

  return { accepted, rejected, confidence };
}

/**
 * Multi-query retrieve + merge by best score, then relevance gate.
 */
function retrieveWithSearchPlan(searchQueries, retrieveFn, understanding) {
  const queries = (searchQueries && searchQueries.length ? searchQueries : []).filter(Boolean);
  const map = new Map();
  for (const q of queries.slice(0, 4)) {
    const rows = retrieveFn(q) || [];
    for (const r of rows) {
      const id = String(r.id || '');
      if (!id) continue;
      const prev = map.get(id);
      if (!prev || Number(r.score || 0) > Number(prev.score || 0)) map.set(id, { ...r });
    }
  }
  const merged = [...map.values()].sort(
    (a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(a.priority || 99) - Number(b.priority || 99)
  );
  return gatePassages(merged, understanding);
}

module.exports = {
  gatePassages,
  retrieveWithSearchPlan,
  passageBlob
};
