'use strict';

const { extractCandidateFeatures } = require('./featureDiscovery');

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function compact(s) {
  return clean(s).toLowerCase().replace(/[\s\-_/]+/g, '');
}

/**
 * Reconstruct diagnostic facts from USER turns only.
 * User guesses are tagged as userHypothesis, never confirmedCause.
 * Unknown product feature nouns become candidateFeature (USER fact lock).
 */
function extractUserFacts(userTurns = []) {
  const texts = (userTurns || []).map(clean).filter(Boolean);
  const joined = texts.join('\n');
  const c = compact(joined);
  const featureCands = extractCandidateFeatures(texts);

  const facts = {
    sourceType: null,
    conversionKind: null,
    errorCode: null,
    stage: null,
    feature: null,
    version: null,
    userHypothesis: null,
    candidateFeature: featureCands.candidateFeature || null,
    candidateEntities: featureCands.candidateEntities || [],
    _joined: joined
  };

  const ver = joined.match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
  if (ver) facts.version = ver[1];

  const err =
    joined.match(/\b(403|404|401|429|500|502|503)\b/) ||
    joined.match(/\b([A-Z]{2,}[-_]?\d{2,})\b/);
  if (err) facts.errorCode = err[1];

  if (/(유튜브|youtube|\byt\b)/i.test(joined)) {
    facts.sourceType = 'youtube';
    facts.conversionKind = 'youtube';
  } else if (/(pdf)/i.test(joined) && /(변환|midi|미디)/i.test(joined)) {
    facts.sourceType = 'pdf';
    facts.conversionKind = 'pdf';
  } else if (/(mp3|wav|m4a|webm|로컬\s*오디오|오디오\s*파일)/i.test(joined)) {
    facts.sourceType = 'audio';
    facts.conversionKind = 'audio';
  } else if (/(installer|설치\s*파일|설치프로그램)/i.test(joined)) {
    facts.sourceType = 'installer';
  }

  if (/(가져오|fetch|다운로드).{0,12}(실패|오류)|403|429/i.test(joined)) facts.stage = 'fetch';
  else if (/(변환|분석|트랜스)/i.test(joined) && /(실패|오류|안\s*되)/i.test(joined)) facts.stage = 'convert';
  else if (/(재생|플레이)/i.test(joined)) facts.stage = 'playback';
  else if (/(설치)/i.test(joined) && /(실패|막히|안\s*되)/i.test(joined)) facts.stage = 'install';
  else if (/(저장|세이브)/i.test(joined)) facts.stage = 'save';

  if (/(사운드팩|고품질\s*음원|고음질)/i.test(joined)) facts.feature = 'soundpack';
  else if (/(템포|bpm)/i.test(joined)) facts.feature = 'tempo';
  else if (/(미리\s*듣|구간)/i.test(joined)) facts.feature = 'preview';
  else if (/(벨로시티|velocity)/i.test(joined)) facts.feature = 'velocity';
  else if (/(악보|score)/i.test(joined)) facts.feature = 'score';
  else if (/(노트|음표)/i.test(joined)) facts.feature = 'notes';

  if (/(cuda|gpu|드라이버).{0,8}(같|문제)/i.test(joined)) {
    facts.userHypothesis = 'cuda';
  }

  facts._compact = c;
  return facts;
}

function inferHypotheses(question, facts = {}) {
  const q = clean(question);
  const hyps = [];
  if (/(소리|음질|이상|이상해|이상함)/i.test(q) && /(변환|됐|결과)/i.test(q)) {
    hyps.push('transcription', 'instrument', 'soundpack', 'velocity', 'playback');
  }
  if (/(다운로드|가져오).{0,10}(실패|오류|안)/i.test(q) && !facts.sourceType) {
    hyps.push('youtube_fetch', 'installer_download', 'export');
  }
  if (/(변환).{0,12}(안|실패|오류|이상)/i.test(q) && !facts.conversionKind) {
    hyps.push('youtube', 'audio', 'pdf');
  }
  return hyps;
}

function missingHighGainSlot(facts, hypotheses) {
  if (!facts.conversionKind && hypotheses.includes('youtube')) return 'conversionKind';
  if (!facts.sourceType && hypotheses.includes('youtube_fetch')) return 'sourceType';
  if (!facts.errorCode && (facts.conversionKind || facts.stage === 'convert' || facts.stage === 'fetch')) {
    return 'errorText';
  }
  if (!facts.stage && hypotheses.includes('transcription')) return 'symptomBranch';
  if (!facts.stage) return 'stage';
  return null;
}

module.exports = {
  extractUserFacts,
  inferHypotheses,
  missingHighGainSlot
};
