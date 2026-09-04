'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'supportAi.js');
let s = fs.readFileSync(p, 'utf8');

const startMark = '  const understandHint = understanding';
const endMark = '  const catalogPassage = passages.find((p) => String(p.id || \'\').startsWith(\'live-catalog\'));';
const start = s.indexOf(startMark);
const end = s.indexOf(endMark);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

const replacement = fs.readFileSync(path.join(__dirname, '_tmp_synth_block.js'), 'utf8');
s = s.slice(0, start) + replacement + '\n\n' + s.slice(end);

// Replace post-answer gates with simpler merge using authority + synthMeta
const gateStart = s.indexOf('  // Final relevance gate — do not ship obvious context leaks');
const gateEnd = s.indexOf('  const nextState = mergeState(ticket.aiConversationState, {');
if (gateStart > 0 && gateEnd > gateStart) {
  const gateReplacement = `  // Semantic drift already handled inside synthesizeAnswer (conditional retry).
  // Keep a light catalog-schema sanitizer only.
  if (synthMeta && synthMeta.gate && synthMeta.gate.failures) {
    ragDebug.agent.answerGateFailures = synthMeta.gate.failures;
  }
  if (synthMeta && synthMeta.parsed) {
    ragDebug.agent.synthContract = {
      answeredGoal: synthMeta.parsed.answeredGoal,
      usedEvidence: synthMeta.parsed.usedEvidence,
      needsMoreInfo: synthMeta.parsed.needsMoreInfo,
      retried: !!synthMeta.retried
    };
  }

  const nextState = mergeState(ticket.aiConversationState, {
    understanding: {
      ...(understanding || {}),
      effectiveRelation:
        (understanding && (understanding.effectiveRelation || understanding.relation)) ||
        turnResolved.relation
    },
    relation:
      (understanding && (understanding.effectiveRelation || understanding.relation)) ||
      turnResolved.relation,
    toolSnapshot,
    finalAction: (agentOut.debug && agentOut.debug.finalAction) || null,
    assistantAssumption: String(answer.text || '').slice(0, 160)
  });
  // duplicate mergeState call below will be removed — splice carefully
`;
  // Actually we need to replace through nextState = mergeState(...) block start only and keep the rest of mergeState call
  s = s.slice(0, gateStart) + `  if (synthMeta && synthMeta.gate && synthMeta.gate.failures) {
    ragDebug.agent.answerGateFailures = synthMeta.gate.failures;
  }
  if (synthMeta && synthMeta.parsed) {
    ragDebug.agent.synthContract = {
      answeredGoal: synthMeta.parsed.answeredGoal,
      usedEvidence: synthMeta.parsed.usedEvidence,
      needsMoreInfo: synthMeta.parsed.needsMoreInfo,
      retried: !!synthMeta.retried
    };
  }

` + s.slice(gateEnd);
}

// Fix mergeState relation to use effectiveRelation
s = s.replace(
  `  const nextState = mergeState(ticket.aiConversationState, {
    understanding,
    relation: turnResolved.relation,
    toolSnapshot,
    finalAction: (agentOut.debug && agentOut.debug.finalAction) || null
  });`,
  `  const nextState = mergeState(ticket.aiConversationState, {
    understanding: {
      ...(understanding || {}),
      effectiveRelation:
        (understanding && (understanding.effectiveRelation || understanding.relation)) ||
        turnResolved.relation
    },
    relation:
      (understanding && (understanding.effectiveRelation || understanding.relation)) ||
      turnResolved.relation,
    toolSnapshot,
    finalAction: (agentOut.debug && agentOut.debug.finalAction) || null,
    assistantAssumption: String(answer && answer.text ? answer.text : '').slice(0, 160)
  });`
);

fs.writeFileSync(p, s);
console.log('patched supportAi.js', { start, end, len: s.length });
