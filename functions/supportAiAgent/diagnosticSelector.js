'use strict';

const { generateDiagnosticClarifyQuestion } = require('./diagnosticQuestion');
const { missingHighGainSlot } = require('./userFacts');
const { sourceKindOf } = require('./planner');

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function knownFactLabels(facts = {}) {
  const labels = [];
  if (facts.conversionKind) labels.push(`conversion=${facts.conversionKind}`);
  if (facts.sourceType) labels.push(`source=${facts.sourceType}`);
  if (facts.errorCode) labels.push(`error=${facts.errorCode}`);
  if (facts.stage) labels.push(`stage=${facts.stage}`);
  if (facts.feature) labels.push(`feature=${facts.feature}`);
  if (facts.candidateFeature) labels.push(`candidateFeature=${facts.candidateFeature}`);
  if (facts.version) labels.push(`version=${facts.version}`);
  return labels;
}

/**
 * Detect whether a candidate question re-asks something already known.
 */
function questionReasksKnownFacts(questionText, facts = {}) {
  const q = clean(questionText);
  if (!q) return true;
  // USER already named a feature — never ask generic "what task?"
  if (facts.candidateFeature && /어떤\s*작업을\s*하려는|지금\s*어떤\s*작업|어떤\s*기능\s*\(?메뉴\)?\s*질문인지|what\s+task\s+are\s+you\s+trying|which\s+specific\s+feature/i.test(q)) {
    return true;
  }
  if (facts.conversionKind === 'youtube' && /(어떤\s*변환|YouTube\s*\/\s*오디오|유튜브\s*\/\s*오디오|PDF\s*중)/i.test(q)) {
    return true;
  }
  if (facts.conversionKind && /(어떤\s*변환|YouTube|오디오\s*파일|PDF\s*중)/i.test(q) && facts.conversionKind !== 'youtube') {
    // still asking conversion type when known
    if (/어떤\s*변환/.test(q)) return true;
  }
  if (facts.errorCode && /(오류\s*문구|에러\s*코드|오류\s*코드|error\s*message)/i.test(q) && !/(다른|추가)/i.test(q)) {
    return true;
  }
  if (facts.sourceType === 'youtube' && /(설치\s*파일|Installer)/i.test(q) && /(유튜브|YouTube)/i.test(q) && /(중인지)/i.test(q)) {
    // asking youtube vs installer when youtube already known
    return true;
  }
  if (facts.stage === 'fetch' && /(어느\s*단계|어떤\s*단계)/i.test(q) && /(가져오|다운로드|fetch)/i.test(q) === false) {
    // generic stage question when stage known — still sometimes ok; treat as reask if only stage
    if (/(설치\s*\/\s*로그인\s*\/\s*변환\s*\/\s*재생)/i.test(q)) return true;
  }
  return false;
}

function shouldUseLlmDiagnostic({ facts, hypotheses, passages, clarifyCandidate }) {
  const hyps = Array.isArray(hypotheses) ? hypotheses : [];
  const factCount = knownFactLabels(facts).length;
  if (facts && facts.candidateFeature && clarifyCandidate && questionReasksKnownFacts(clarifyCandidate, facts)) {
    return { use: true, reason: 'feature_candidate_reask' };
  }
  if (hyps.length >= 2) return { use: true, reason: 'multi_hypothesis' };
  if (factCount >= 2 && clarifyCandidate && questionReasksKnownFacts(clarifyCandidate, facts)) {
    return { use: true, reason: 'would_reask_known' };
  }
  if (factCount >= 1 && hyps.length >= 1 && passages && passages.length > 0) {
    return { use: true, reason: 'evidence_plus_partial_facts' };
  }
  if (missingHighGainSlot(facts || {}, hyps) === 'symptomBranch') {
    return { use: true, reason: 'symptom_branch' };
  }
  return { use: false, reason: 'deterministic_ok' };
}

function sanitizeDiagnosticText(text, locale = 'ko') {
  let out = clean(text);
  out = out
    .replace(/\b(Knowledge|RAG|planner|Firestore|sourceType|hypothesis|evidence)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Keep only first 1–2 sentences / questions
  const parts = out.split(/(?<=[.?？！])\s+/).filter(Boolean).slice(0, 2);
  out = parts.join(' ').slice(0, 280);
  if (!out) {
    return locale === 'en'
      ? 'Could you share one more detail about which step fails?'
      : '어느 단계에서 문제가 생기는지 한 가지만 더 알려주시겠어요?';
  }
  return out;
}

function deterministicEvidenceAware({ locale, intent, rawQuestion, question, passages, facts, hypotheses }) {
  const base = generateDiagnosticClarifyQuestion({
    locale,
    intent,
    rawQuestion,
    question,
    passages,
    facts,
    hypotheses
  });
  if (!questionReasksKnownFacts(base, facts)) return base;

  // Named feature lock → targeted feature clarification
  if (facts && facts.candidateFeature) {
    const { buildTargetedFeatureDiagnostic } = require('./featureDiscovery');
    const targeted = buildTargetedFeatureDiagnostic({
      locale,
      candidateFeature: facts.candidateFeature,
      intent,
      hypotheses
    });
    if (targeted) return targeted;
  }

  // Rewrite around known facts — ask only missing high-gain slot
  const slot = missingHighGainSlot(facts || {}, hypotheses || []);
  const loc = locale === 'en' ? 'en' : locale === 'ja' ? 'ja' : 'ko';
  if (loc === 'ko') {
    if (slot === 'errorText') {
      return '화면에 보이는 오류 문구/코드를 한 줄만 알려주세요.';
    }
    if (slot === 'symptomBranch') {
      return '기본 음원(기본 사운드)으로 재생해도 같은지, 아니면 특정 악기/사운드팩에서만 이상한지 알려주세요.';
    }
    if (slot === 'stage' && facts.conversionKind) {
      return `${facts.conversionKind === 'youtube' ? 'YouTube' : facts.conversionKind} 작업 중 불러오기/변환/재생 중 어디에서 막히나요?`;
    }
    if (slot === 'conversionKind') {
      return 'YouTube / 오디오 파일 / PDF 중 어떤 변환인가요?';
    }
    return '추가로 확인할 핵심 정보 한 가지만 알려주세요. (오류 문구 또는 막히는 단계)';
  }
  if (loc === 'en') {
    if (slot === 'errorText') return 'Please paste the exact on-screen error message or code (one line).';
    if (slot === 'symptomBranch') {
      return 'Does it sound wrong with the default sound too, or only with a specific instrument/soundpack?';
    }
    return 'Which exact step fails, and what error text do you see?';
  }
  return base;
}

const DIAG_SYSTEM = [
  'You write ONE short customer-facing diagnostic question for MidiAI Studio support.',
  'Ask only for the highest information-gain missing detail.',
  'Never re-ask facts already listed as known.',
  'If candidateFeature is known, ask where that label was seen (screen/menu/button) — never ask "what task are you trying to do?".',
  'Do not mention Knowledge, RAG, planner, scores, or internal IDs.',
  'Do not invent causes. Output the question text only (max 2 short sentences).'
].join(' ');

async function selectDiagnosticQuestion({
  callLlm,
  locale = 'ko',
  intent,
  rawQuestion,
  question,
  passages,
  facts,
  hypotheses,
  searched,
  missingInfo
} = {}) {
  const deterministic = deterministicEvidenceAware({
    locale,
    intent,
    rawQuestion,
    question,
    passages,
    facts,
    hypotheses
  });

  const gate = shouldUseLlmDiagnostic({
    facts,
    hypotheses,
    passages,
    clarifyCandidate: deterministic
  });

  if (!gate.use || typeof callLlm !== 'function') {
    return {
      text: deterministic,
      mode: 'deterministic',
      reason: gate.reason
    };
  }

  const evidence = (passages || [])
    .slice(0, 3)
    .map((p) => `${sourceKindOf(p)}:${String(p.title || p.id || '').slice(0, 40)}`)
    .join('; ');

  const userPrompt = [
    `LOCALE: ${locale}`,
    `RAW: ${String(rawQuestion || '').slice(0, 160)}`,
    `RESOLVED: ${String(question || '').slice(0, 160)}`,
    `KNOWN_FACTS: ${knownFactLabels(facts).join(', ') || '(none)'}`,
    `HYPOTHESES: ${(hypotheses || []).join(',') || '(none)'}`,
    `SEARCHED: ${(searched || []).join(',') || '(none)'}`,
    `EVIDENCE: ${evidence || '(none)'}`,
    `MISSING: ${(missingInfo || []).join(',') || missingHighGainSlot(facts || {}, hypotheses || []) || '(unknown)'}`,
    'Write the best next diagnostic question.'
  ].join('\n');

  try {
    const llm = await callLlm(DIAG_SYSTEM, userPrompt);
    const text = sanitizeDiagnosticText(llm, locale);
    if (questionReasksKnownFacts(text, facts)) {
      return { text: deterministic, mode: 'deterministic_fallback', reason: 'llm_reasked_known' };
    }
    return { text, mode: 'llm', reason: gate.reason };
  } catch (_) {
    return { text: deterministic, mode: 'deterministic_fallback', reason: 'llm_error' };
  }
}

module.exports = {
  selectDiagnosticQuestion,
  shouldUseLlmDiagnostic,
  questionReasksKnownFacts,
  knownFactLabels,
  deterministicEvidenceAware
};
