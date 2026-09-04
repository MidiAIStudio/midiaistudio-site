/**
 * Multi-turn Support AI context resolver (deterministic, no extra LLM).
 * Resolves follow-up questions using recent USER turns only — never AI replies —
 * so a wrong prior AI answer cannot poison the next retrieval topic.
 */
'use strict';

/** Follow-up / ellipsis surface forms (detection only — not canned answers). */
const FOLLOW_UP_RE =
  /^(그거|그건|그것|그\s*기능|이거|저거|아까|방금|그게|그건요|그중|그중에|그\s*중)\b|기능\s*설명|자세히\s*(알려|설명)|어떻게\s*해\s*\??$|왜\s*그래\s*\??$|^그럼\s*\??$|설치는\s*\??$|사용법은\s*\??$|다시\s*설명|해결\s*방법|어디\s*(있어|있나요)|안\s*되(는데|요|다)?|그리고\s*\??$|다음은\s*\??$|^어떻게\s*\??$|^왜\s*\??$|설명해\s*줘|알려\s*줘|초기화는|리셋은|그거\s*어떻게|그건\s*어떻게|그중/i;

/** Clear product / feature nouns that can start or switch a topic. */
const EXPLICIT_TOPIC_RE =
  /(템포|bpm|속도|pdf|유튜브|유튭|youtube|yt|오디오|mp3|wav|m4a|사운드팩|soundpack|고품질|고음질|음원|easy\s*key|easier\s*key|쉬운\s*조|쉬운\s*키|이지\s*키|편곡|arrange|instrument\s*arrange|예약\s*변환|예약변환|크레딧|라이선스|이용권|라이프\s*타임|lifetime|미리\s*듣|미리듣|구간|웨이브|파형|노트|음표|벨로시티|velocity|악보|musicxml|변환|midi\s*editor|미디\s*에디터|미디\s*편집|라이브러리|library|assistant|어시스턴트|설치\s*파일|installer|403|404|cuda|ffmpeg|로그|trial|체험|패치|업데이트|릴리스|릴리즈|공지|\d+\.\d+(?:\.\d+)?)/i;

/**
 * Strong feature anchors used when choosing which prior USER turn to carry.
 * Excludes thin facet nouns (로그/노트 alone) so follow-ups do not steal the topic.
 */
const STRONG_TOPIC_RE =
  /(템포|bpm|편곡|arrange|쉬운\s*키|쉬운\s*조|이지\s*키|easy\s*key|easier\s*key|cleanup|클린업|노트\s*정리|humanize|휴머나이즈|사람처럼\s*연주|analyze|유튜브|유튭|youtube|오디오|사운드팩|고품질|고음질|라이브러리|library|score\s*editor|악보|pdf|벨로시티|velocity|midi\s*editor|미디\s*편집|미디\s*에디터|예약\s*변환|예약변환|403|lifetime|라이프|이용권|체험|trial|크레딧|installer|uninstall|repair|미리\s*듣|미리듣|변환\s*실패|변환\s*방법|유튜브\s*변환)/i;

/** Short pivots that should NOT inherit the previous topic (clarification path). */
const AMBIGUOUS_PIVOT_RE =
  /(?:그리고\s*)?(소리|사운드|음|속도|빠르기|pdf)[은는을를]?\s*\??$/i;

/** Facet / incomplete questions that refine the prior topic (checked before standalone-topic cut). */
const FACET_FOLLOW_RE =
  /^(왜|어떻게|어디|로그|원인|해결|그다음|다음엔|자세히|몇번|되돌리|저장\s*위치|원본|마음에|켜는\s*법|어디서\s*사|안돼|안됨|링크만|넣으면)/i;

function normalizeSpace(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactKo(s) {
  return normalizeSpace(s)
    .toLowerCase()
    .replace(/[\s\-_/?.!。！？]+/g, '');
}

function isAmbiguousPivot(text) {
  const s = normalizeSpace(text);
  if (!s) return false;
  if (AMBIGUOUS_PIVOT_RE.test(s)) return true;
  const c = compactKo(s);
  return /^(그리고)?(소리|사운드|음|속도|빠르기|pdf)[은는을를]?$/i.test(c);
}

function extractAmbiguousPivot(text) {
  const s = normalizeSpace(text);
  const m = s.match(/(소리|사운드|음|속도|빠르기|pdf)/i);
  return m ? m[1] : s;
}

/**
 * Collect chronological unique user turns (ticket body + replies).
 * AI / admin / system messages are ignored on purpose.
 */
function collectUserTurns(ticket, replies) {
  const turns = [];
  const seen = new Set();
  const push = (t) => {
    const s = normalizeSpace(t);
    if (!s || seen.has(s)) return;
    seen.add(s);
    turns.push(s);
  };
  push(ticket && ticket.content);
  for (const r of replies || []) {
    if (String(r.role || '') === 'user') push(r.content);
  }
  return turns;
}

function hasExplicitTopic(text) {
  return EXPLICIT_TOPIC_RE.test(String(text || ''));
}

function hasStrongTopic(text) {
  return STRONG_TOPIC_RE.test(String(text || ''));
}

/** Thin surface that should not become the carried topic root. */
function isThinTopicSurface(text) {
  const s = normalizeSpace(text);
  if (!s) return true;
  if (FACET_FOLLOW_RE.test(s) && !hasStrongTopic(s)) return true;
  if (s.length <= 16 && !hasStrongTopic(s)) return true;
  if (
    /(원본|바뀌|저장은|적용|몇번|그다음|켜는|마음에|링크만|넣으면|재시도|잡았어|켰어|만\s*그래|어디\s*있어|어떻게\s*써|왜\s*그래)/i.test(s) &&
    !hasStrongTopic(s)
  ) {
    return true;
  }
  return false;
}

/**
 * True when the latest message is a short referential / incomplete follow-up.
 * Does not rewrite standalone clear questions.
 */
function looksLikeFollowUp(rawQuestion) {
  const raw = normalizeSpace(rawQuestion);
  if (!raw) return false;
  if (isAmbiguousPivot(raw)) return false;
  if (/^(그중|그중에|그\s*중)/.test(raw)) return true;

  // Facet refinements (even if they contain secondary nouns like 로그)
  if (raw.length <= 28 && FACET_FOLLOW_RE.test(raw) && !hasStrongTopic(raw)) return true;
  if (raw.length <= 18 && /^(안돼|안됨|자세히|그다음엔\??|다음엔\??|몇번이야\??|되돌리기는\??|켜는\s*법|저장\s*위치는\??)/i.test(raw)) {
    return true;
  }

  // Short USER fact addenda — may include weak nouns without being a new topic root
  if (
    raw.length <= 28 &&
    !hasStrongTopic(raw) &&
    /(특정|일부|트랙만|악기만|만\s*그래|재시도|해도\s*안|같이\s*옮|여러\s*개|잡았어|켰어|아니\s+|나중에\s*자동|링크만|넣으면돼)/i.test(raw)
  ) {
    return true;
  }

  // New clear topic of its own → not a carry-forward follow-up
  if (hasExplicitTopic(raw) && raw.length >= 8 && !FOLLOW_UP_RE.test(raw)) {
    if (!/^(그거|그건|이거|저거|아까|방금)/i.test(raw)) return false;
  }
  if (FOLLOW_UP_RE.test(raw)) return true;
  // Short how/where/why/install without its own topic noun
  if (
    raw.length <= 22 &&
    !hasExplicitTopic(raw) &&
    /(설명|방법|어떻게|어디|왜|설치|해결|사용|초기화|리셋|자세히|원본|바뀌|저장은|적용)/i.test(raw)
  ) {
    return true;
  }
  // Pronoun-only openers
  if (/^(그거|그건|그것|이거|저거|그게)\b/i.test(raw) && raw.length <= 40) return true;
  return false;
}

/** Compress a prior user turn into a short topic phrase for retrieval. */
function compressTopic(userText) {
  let t = normalizeSpace(userText);
  t = t
    .replace(/[?？!！.。]+$/g, '')
    .replace(/(뜨는데|나오는데|하는데|이에요|예요|입니다|해주세요|해줘|알려줘|뭐야|무엇인가요|무엇|어떻게\s*해|싶어|싶습니다)$/g, '')
    .replace(/[이가을를은는의]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > 80) t = t.slice(0, 80).trim();
  return t || normalizeSpace(userText).slice(0, 80);
}

function detectFollowUpIntent(followUp) {
  const f = normalizeSpace(followUp);
  if (/(해결|고치|안\s*되|안돼|실패|오류|에러)/i.test(f)) return 'troubleshoot';
  if (/(설치)/i.test(f)) return 'install';
  if (/(어디|위치)/i.test(f)) return 'where';
  if (/(초기화|리셋|reset)/i.test(f)) return 'reset';
  if (/(왜|원인)/i.test(f)) return 'why';
  if (/(로그)/i.test(f)) return 'logs';
  if (/(설명|뭐야|무엇|기능|자세히)/i.test(f)) return 'explain';
  if (/(어떻게|방법|써|사용)/i.test(f)) return 'how';
  return 'general';
}

function combineTopicAndIntent(topicCore, followUp, intent) {
  const topic = compressTopic(topicCore);
  const fu = normalizeSpace(followUp);
  switch (intent) {
    case 'install':
      return `${topic} 설치 방법`;
    case 'where':
      return `${topic} 어디 있어`;
    case 'reset':
      return `${topic} 초기화 방법`;
    case 'why':
      return `${topic} 원인`;
    case 'logs':
      return `${topic} 로그 보내는 방법`;
    case 'troubleshoot':
      return `${topic} 해결 방법`;
    case 'explain':
      return `${topic} 기능 설명`;
    case 'how':
      return `${topic} 사용 방법`;
    default:
      return `${topic} ${fu}`.trim();
  }
}

/**
 * Prefer strong feature anchors; never let thin follow-ups steal the topic.
 */
function pickCarriedUserTopic(priorUserTurns) {
  const list = (priorUserTurns || []).filter(Boolean);
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (hasStrongTopic(t)) return t;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (isThinTopicSurface(t)) continue;
    if (hasExplicitTopic(t) || compressTopic(t).length >= 4) return t;
  }
  return list.length ? list[list.length - 1] : null;
}

/**
 * @param {{ rawQuestion: string, priorUserTurns?: string[] }} input
 */
function resolveConversationQuery({ rawQuestion, priorUserTurns = [] } = {}) {
  const raw = normalizeSpace(rawQuestion);
  if (!raw) {
    return {
      rawQuestion: '',
      resolvedQuestion: '',
      followUp: false,
      carriedTopic: null,
      ambiguousPivot: null
    };
  }

  if (isAmbiguousPivot(raw)) {
    const pivot = extractAmbiguousPivot(raw);
    return {
      rawQuestion: raw,
      resolvedQuestion: pivot,
      followUp: false,
      carriedTopic: null,
      ambiguousPivot: pivot
    };
  }

  if (!looksLikeFollowUp(raw)) {
    return {
      rawQuestion: raw,
      resolvedQuestion: raw,
      followUp: false,
      carriedTopic: null,
      ambiguousPivot: null
    };
  }

  // Strong new topic on a follow-up-looking string → switch (except referential openers)
  if (
    hasStrongTopic(raw) &&
    !/^(그거|그건|이거|저거|아까|방금|그중|그중에|그\s*중)/i.test(raw) &&
    raw.length >= 6
  ) {
    return {
      rawQuestion: raw,
      resolvedQuestion: raw,
      followUp: false,
      carriedTopic: null,
      ambiguousPivot: null
    };
  }

  // Legacy: explicit topic switch for clear standalone product questions
  if (hasExplicitTopic(raw) && !/^(그거|그건|이거|저거|아까|방금|그중|그중에|그\s*중)/i.test(raw)) {
    if (raw.length >= 6 && hasStrongTopic(raw)) {
      return {
        rawQuestion: raw,
        resolvedQuestion: raw,
        followUp: false,
        carriedTopic: null,
        ambiguousPivot: null
      };
    }
  }

  const carried = pickCarriedUserTopic(priorUserTurns);
  if (!carried) {
    return {
      rawQuestion: raw,
      resolvedQuestion: raw,
      followUp: true,
      carriedTopic: null,
      ambiguousPivot: null
    };
  }

  const intent = detectFollowUpIntent(raw);
  const resolved = combineTopicAndIntent(carried, raw, intent);
  return {
    rawQuestion: raw,
    resolvedQuestion: resolved,
    followUp: true,
    carriedTopic: compressTopic(carried),
    ambiguousPivot: null
  };
}

module.exports = {
  collectUserTurns,
  resolveConversationQuery,
  looksLikeFollowUp,
  hasExplicitTopic,
  hasStrongTopic,
  compressTopic,
  isAmbiguousPivot,
  FOLLOW_UP_RE,
  EXPLICIT_TOPIC_RE,
  STRONG_TOPIC_RE
};
