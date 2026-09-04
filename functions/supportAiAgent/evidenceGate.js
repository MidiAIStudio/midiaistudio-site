/**
 * Evidence confidence + final answer relevance gate.
 */
'use strict';

const CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  NONE: 'NONE'
});

function gradePassageRelevance(passage, understanding) {
  const goal = String((understanding && understanding.userGoal) || '').toLowerCase();
  const area = String((understanding && understanding.productArea) || '').toLowerCase();
  const id = String((passage && passage.id) || '').toLowerCase();
  const title = String((passage && passage.title) || '').toLowerCase();
  const text = String(
    (passage && (passage.summary || passage.body || passage.text || '')) || ''
  ).toLowerCase();
  const blob = `${id} ${title} ${text}`;

  if (!passage) return 'IRRELEVANT';

  // Hard mismatches
  if (
    (area === 'company' || /연락|전화|사업자|문의\s*채널|고객지원/.test(goal)) &&
    /(youtube|유튜브|conversion-generic|ffmpeg|cuda)/i.test(id)
  ) {
    return 'IRRELEVANT';
  }
  if (
    (area === 'commerce' || /가격|할인|결제|이용권|크레딧|환불/.test(goal)) &&
    /(youtube|유튜브|ffmpeg|cuda|band-orchestra)/i.test(id) &&
    !/live-catalog|credits|license|refund|purchase/i.test(id)
  ) {
    return 'IRRELEVANT';
  }
  if (
    (area === 'security' || /비밀|시크릿|api\s*key|자격/.test(goal)) &&
    /live-catalog|credits-usage|price/i.test(id)
  ) {
    return 'IRRELEVANT';
  }

  const score = Number(passage.score || 0);
  if (score >= 18 || /live-catalog|business-registration|support-contact|credits-usage/.test(id)) {
    return 'DIRECT';
  }
  if (score >= 10) return 'SUPPORTING';
  if (score >= 5) return 'WEAK';
  // keyword-only weak
  if (goal && blob && goal.split(/\s+/).some((t) => t.length > 1 && blob.includes(t))) return 'WEAK';
  return 'IRRELEVANT';
}

function filterPassagesByRelevance(passages, understanding) {
  const accepted = [];
  const rejected = [];
  for (const p of passages || []) {
    const grade = gradePassageRelevance(p, understanding);
    if (grade === 'IRRELEVANT') rejected.push({ id: p.id, grade });
    else accepted.push({ ...p, relevanceGrade: grade });
  }
  accepted.sort((a, b) => {
    const rank = { DIRECT: 0, SUPPORTING: 1, WEAK: 2 };
    const ra = Object.prototype.hasOwnProperty.call(rank, a.relevanceGrade)
      ? rank[a.relevanceGrade]
      : 9;
    const rb = Object.prototype.hasOwnProperty.call(rank, b.relevanceGrade)
      ? rank[b.relevanceGrade]
      : 9;
    if (ra !== rb) return ra - rb;
    return Number(b.score || 0) - Number(a.score || 0);
  });
  return { accepted, rejected };
}

function assessEvidenceConfidence({
  passages,
  toolSnapshot,
  understanding,
  requiresAccountLookup,
  requiresPaymentLookup,
  requiresLicenseLookup
} = {}) {
  const { accepted, rejected } = filterPassagesByRelevance(passages, understanding);
  const hasTool =
    toolSnapshot &&
    (toolSnapshot.licenseSummary ||
      toolSnapshot.paymentSummary ||
      toolSnapshot.creditSummary ||
      (toolSnapshot.facts && toolSnapshot.facts.length));
  const needsTool = !!(requiresAccountLookup || requiresPaymentLookup || requiresLicenseLookup);
  const direct = accepted.filter((p) => p.relevanceGrade === 'DIRECT');
  const supporting = accepted.filter((p) => p.relevanceGrade === 'SUPPORTING');

  let confidence = CONFIDENCE.NONE;
  if (needsTool && hasTool && direct.length) confidence = CONFIDENCE.HIGH;
  else if (needsTool && hasTool) confidence = CONFIDENCE.MEDIUM;
  else if (needsTool && !hasTool && !direct.length) confidence = CONFIDENCE.LOW;
  else if (direct.length >= 1) confidence = CONFIDENCE.HIGH;
  else if (supporting.length >= 1 || accepted.length >= 2) confidence = CONFIDENCE.MEDIUM;
  else if (accepted.length === 1) confidence = CONFIDENCE.LOW;
  else confidence = CONFIDENCE.NONE;

  return {
    confidence,
    accepted,
    rejected,
    hasToolEvidence: !!hasTool
  };
}

/**
 * Pre-send answer relevance checks. Returns { ok, failures[], nextAction }.
 */
function gateFinalAnswer({
  answerText,
  understanding,
  conversationState,
  relation,
  secretLeakRe
} = {}) {
  const failures = [];
  const text = String(answerText || '');
  const goal = String((understanding && understanding.userGoal) || '').toLowerCase();
  const area = String((understanding && understanding.productArea) || '').toLowerCase();
  const facts = ((conversationState && conversationState.knownFacts) || []).map((f) =>
    String(f).toLowerCase()
  );

  if (!text.trim()) {
    failures.push('empty_answer');
    return { ok: false, failures, nextAction: 'ASK_DIAGNOSTIC' };
  }

  if (secretLeakRe && secretLeakRe.test(text)) {
    failures.push('secret_leak');
    return { ok: false, failures, nextAction: 'ASK_DIAGNOSTIC' };
  }

  if (/기능을 말씀하시는 거죠|같은 이름으로 바로 확인이 안/i.test(text) && area !== 'product_ui') {
    failures.push('fabricated_feature_fallback');
  }

  if (
    relation === 'TOPIC_SHIFT' &&
    /(youtube|유튜브).{0,20}(403|가져오)/i.test(text) &&
    (area === 'company' || area === 'commerce')
  ) {
    failures.push('topic_leak');
  }

  // Re-asking known payment fact
  if (
    facts.some((f) => /payment|결제/.test(f)) &&
    /무엇.{0,6}결제|어떤.{0,6}(상품|이용권).{0,8}(사|결제)/i.test(text)
  ) {
    failures.push('reask_known_fact');
  }

  // Over-answer: full catalog dump on focused price/discount
  if (
    (/얼마|가격|할인/.test(goal) || area === 'commerce') &&
    (text.match(/원/g) || []).length >= 4 &&
    /현재 구매할 수 있는 상품은 다음과/i.test(text)
  ) {
    failures.push('overanswer_catalog_dump');
  }

  if (failures.length) {
    return {
      ok: false,
      failures,
      nextAction: failures.includes('topic_leak') ? 'REASON_AGAIN' : 'ASK_DIAGNOSTIC'
    };
  }
  return { ok: true, failures: [], nextAction: null };
}

module.exports = {
  CONFIDENCE,
  gradePassageRelevance,
  filterPassagesByRelevance,
  assessEvidenceConfidence,
  gateFinalAnswer
};
