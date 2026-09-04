  const understandHint = understanding
    ? `Understood intent=${understanding.intent || ''}; userGoal=${understanding.userGoal || ''}; turnRelation=${turnResolved.relation || ''}.`
    : '';
  void understandHint;
  void answerIntent;
  const toolSnapshot = agentOut.toolSnapshot || (agentOut.debug && agentOut.debug.toolSnapshot) || null;
  const effectiveRelation =
    (understanding && (understanding.effectiveRelation || understanding.relation)) ||
    turnResolved.relation ||
    'CONTINUE';

  const authority = buildAuthoritativeContext({
    rawQuestion,
    understanding: {
      ...(understanding || {}),
      effectiveRelation,
      relation: effectiveRelation
    },
    conversationState: (agentOut.debug && agentOut.debug.conversationState) || ticket.aiConversationState,
    relation: effectiveRelation,
    toolSnapshot,
    passages: customerFacingPassages(passages),
    userTurns: turnsForUnderstanding,
    priorAiReplies:
      effectiveRelation === RELATION.TOPIC_SHIFT
        ? []
        : effectiveRelation === RELATION.CORRECTION
          ? priorAiReplies.slice(-1)
          : priorAiReplies.slice(-3),
    locale
  });
  ragDebug.agent.authorityContext = {
    currentGoal: authority.currentGoal,
    currentTopic: authority.currentTopic,
    relation: authority.relation,
    productArea: authority.productArea,
    epoch: authority.epoch,
    activeFacts: authority.activeFacts,
    toolEvidenceCount: (authority.toolEvidence || []).length,
    relevantUserTurns: authority.relevantUserTurns,
    rejectedOldTopics: authority.rejectedOldTopics,
    historySelectReason: authority.historySelectReason
  };

  const privateCtx =
    agentOut.debug && agentOut.debug.privateSourceUsed && agentOut.debug.privateSourceLlmContext
      ? String(agentOut.debug.privateSourceLlmContext).slice(0, 500)
      : '';

  if (clarify && /공식 자료만으로는|could not confirm that from official/i.test(String(clarify))) {
    clarify = buildNoEvidenceFromState({ authority, locale });
  }

  let answer = templateAnswer(question, passages, {
    personal,
    lowConfidence: lowConfidence && !clarify,
    wantHuman: false,
    locale,
    clarify
  });
  let llmFailed = false;
  let answerSynthesisAttempted = false;
  let answerSynthesisSucceeded = false;
  let answerSynthesisFallbackReason = null;
  let privateRawFallbackBlocked = false;
  let synthMeta = null;

  const onlyPrivate =
    (passages || []).length > 0 &&
    customerFacingPassages(passages).length === 0 &&
    !!(agentOut.debug && agentOut.debug.privateSourceUsed);

  function evidenceBackedFallback(reason) {
    const syn = synthesizeFromEvidence({
      question,
      locale,
      privateDebug: agentOut.debug,
      passages
    });
    if (syn.ok && syn.text && !looksLikeSourceDump(syn.text)) {
      answerSynthesisFallbackReason = reason;
      return {
        text: syn.text,
        suggestHandoff: false,
        confidence: 0.7,
        refs: customerFacingPassages(passages)
          .slice(0, 2)
          .map((p) => ({ label: p.title, href: p.href || '' }))
      };
    }
    return null;
  }

  try {
    const shouldSynth =
      !clarify ||
      (toolSnapshot && (toolSnapshot.licenseSummary || toolSnapshot.paymentSummary || toolSnapshot.facts));
    if (clarify && !shouldSynth) {
      /* keep clarification */
    } else if (
      shouldSynth &&
      (!lowConfidence ||
        personal ||
        onlyPrivate ||
        (toolSnapshot && toolSnapshot.facts && toolSnapshot.facts.length) ||
        clarify)
    ) {
      answerSynthesisAttempted = true;
      const authIn = privateCtx
        ? {
            ...authority,
            acceptedKnowledgeEvidence: [...(authority.acceptedKnowledgeEvidence || []), privateCtx]
          }
        : authority;
      const synth = await synthesizeAnswer({
        callLlm: callLlmIfConfigured,
        authority: authIn,
        toolSnapshot,
        locale,
        allowRetry: true
      });
      synthMeta = synth;
      if (synth && synth.text && !looksLikeSourceDump(synth.text)) {
        answer = {
          ...answer,
          text: synth.text.slice(0, 1800),
          confidence:
            passages.length || (toolSnapshot && toolSnapshot.facts && toolSnapshot.facts.length)
              ? 0.82
              : 0.7,
          suggestHandoff: /상담사|human|agent|オペレーター/i.test(synth.text),
          noReliableKnowledge: false
        };
        clarify = null;
        answerSynthesisSucceeded = true;
        if (synth.retried) answerSynthesisFallbackReason = 'semantic_drift_resynth';
      } else if (onlyPrivate) {
        answer =
          evidenceBackedFallback('llm_empty_private_only') ||
          templateAnswer(question, [], {
            personal: false,
            lowConfidence: true,
            wantHuman: false,
            locale,
            clarify: buildNoEvidenceFromState({ authority, locale })
          });
      }
    }
  } catch (err) {
    llmFailed = true;
    answerSynthesisFallbackReason = 'llm_error';
    console.warn('supportAi LLM', err && err.message);
    const backed = evidenceBackedFallback('llm_error_evidence_fallback');
    if (backed) {
      answer = backed;
      privateRawFallbackBlocked = false;
    } else if (!(customerFacingPassages(passages).length && !lowConfidence)) {
      privateRawFallbackBlocked = true;
      answer = templateAnswer(question, customerFacingPassages(passages), {
        personal: false,
        lowConfidence: true,
        wantHuman: false,
        locale,
        clarify: buildNoEvidenceFromState({ authority, locale })
      });
    }
  }
