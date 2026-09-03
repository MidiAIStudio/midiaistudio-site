#!/usr/bin/env node
/**
 * Knowledge stale audit — compare source file hashes to last-known fingerprints.
 * Does NOT auto-publish. Reports STALE / OK. Safe to run in CI or before deploy.
 *
 * Usage: node functions/knowledge/auditStale.js
 *        node functions/knowledge/auditStale.js --write-baseline
 */
const fs = require('fs');
const path = require('path');
const { hashFileSafe, docContentFingerprint, repoRootFromKnowledge } = require('./sourceHash');
const { loadDocs, knowledgeStats } = require('./loadKnowledge');

const ROOT = repoRootFromKnowledge();
const MANIFEST_PATH = path.join(__dirname, 'source-manifest.json');
const BASELINE_PATH = path.join(__dirname, 'source-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function main() {
  const manifest = loadJson(MANIFEST_PATH, { sources: [] });
  const baseline = loadJson(BASELINE_PATH, { sources: {}, docs: {} });
  const sourceResults = [];
  const staleKnowledgeIds = new Set();

  for (const src of manifest.sources || []) {
    const pathHashes = {};
    let combined = '';
    let missing = false;
    for (const rel of src.paths || []) {
      const abs = path.join(ROOT, rel.replace(/\//g, path.sep));
      const h = hashFileSafe(abs);
      pathHashes[rel] = h;
      if (!h) missing = true;
      else combined += h;
    }
    const fingerprint = combined ? require('./sourceHash').hashString(combined) : null;
    const prev = baseline.sources?.[src.id];
    const status = !fingerprint
      ? 'MISSING_SOURCE'
      : !prev
        ? 'NO_BASELINE'
        : prev === fingerprint
          ? 'OK'
          : 'STALE';
    if (status === 'STALE' || status === 'NO_BASELINE') {
      for (const id of src.affects || []) staleKnowledgeIds.add(id);
    }
    sourceResults.push({
      id: src.id,
      status,
      fingerprint,
      paths: pathHashes,
      affects: src.affects || []
    });
    if (writeBaseline && fingerprint) {
      baseline.sources = baseline.sources || {};
      baseline.sources[src.id] = fingerprint;
    }
  }

  const pub = loadDocs('public');
  const inn = loadDocs('internal');
  const nr = loadDocs('internal').length; // needs-review loaded from same folder pattern
  const allDocs = [...pub, ...loadDocs('internal')];
  // Also load needs-review file explicitly
  const needsPath = path.join(__dirname, 'internal', 'needs-review.json');
  let needs = [];
  try {
    needs = JSON.parse(fs.readFileSync(needsPath, 'utf8'));
    if (!Array.isArray(needs)) needs = [];
  } catch (_) {}

  const docResults = [];
  for (const doc of [...pub, ...inn.filter((d) => d.verification === 'verified'), ...needs]) {
    const fp = docContentFingerprint(doc);
    const stored = doc.sourceHash || null;
    const contentStatus =
      !stored ? 'MISSING_HASH' : stored === fp ? 'OK' : 'CONTENT_DRIFT';
    if (writeBaseline) {
      baseline.docs = baseline.docs || {};
      baseline.docs[doc.id] = fp;
    }
    docResults.push({
      id: doc.id,
      visibility: doc.visibility,
      verification: doc.verification,
      active: doc.active !== false,
      sourceHash: stored,
      contentFingerprint: fp,
      contentStatus,
      staleBySource: staleKnowledgeIds.has(doc.id) || staleKnowledgeIds.has(`*${doc.visibility}`)
    });
  }

  if (writeBaseline) {
    baseline.updatedAt = new Date().toISOString();
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  }

  const staleSources = sourceResults.filter((s) => s.status === 'STALE' || s.status === 'NO_BASELINE');
  const report = {
    ok: staleSources.length === 0,
    generatedAt: new Date().toISOString(),
    baselineWritten: writeBaseline,
    stats: knowledgeStats(),
    staleSourceCount: staleSources.length,
    staleKnowledgeIds: [...staleKnowledgeIds],
    sources: sourceResults,
    docs: docResults,
    notes: [
      'FAQ is runtime-authoritative via Firestore (loadLiveFaqPassages) — not gated by this baseline.',
      'Product prices are runtime-authoritative via Firestore products — do not hardcode in Knowledge.',
      'STALE means update Knowledge or mark needs_review; do not blind auto-publish.'
    ]
  };

  const outPath = path.join(__dirname, 'audit-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    ok: report.ok,
    staleSourceCount: report.staleSourceCount,
    staleKnowledgeIds: report.staleKnowledgeIds,
    stats: report.stats,
    report: 'functions/knowledge/audit-report.json'
  }, null, 2));
  process.exit(report.ok || writeBaseline ? 0 : 2);
}

main();
