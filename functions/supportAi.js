/**
 * Support AI — RAG over curated MidiAI Studio Product Knowledge (server-side only).
 * Public replies retrieve only visibility:public + verification:verified docs.
 * Writes role:'ai' replies via Admin SDK. Clients cannot forge AI messages.
 */
const admin = require('firebase-admin');
const {
  retrieveKnowledge,
  knowledgeStats,
  detectLocale,
  DEFAULT_MIN_SCORE
} = require('./knowledge/loadKnowledge');

const MODE = {
  AI: 'ai',
  WAITING: 'waiting_human',
  HUMAN: 'human',
  CLOSED: 'closed'
};

const PERSONAL_RE =
  /(제\s*(라이선스|결제|환불|계정|크레딧|포인트)|내\s*(라이선스|결제|환불|계정|크레딧)|언제\s*끝|남은\s*기간|차단됐|환불됐|결제\s*성공|어떤\s*상품|my\s+(license|payment|refund|account|credit)|when\s+does\s+my|ライセンス.*(いつ|期限)|アカウント)/i;

const HUMAN_WANT_RE =
  /(상담사|사람|관리자|human|agent|operator|직원).{0,12}(연결|통화|이야기|상담)|사람과\s*이야기|상담원|オペレーター|有人対応|talk\s+to\s+(a\s+)?(human|agent|person)/i;

const SECRET_PROBE_RE =
  /(api\s*key|secret|비밀번호|패스워드|password|토큰|private\s*key|service\s*account|관리자\s*비번|credentials?)/i;

const INJECTION_RE =
  /(이전|ignore|disregard).{0,40}(지침|instruction|prompt)|internal\s*knowledge|내부\s*(지식|문서|knowledge)|관리자용.{0,20}(문서|지식)|cuda\s*내부|시스템\s*프롬프트|show\s+(me\s+)?(the\s+)?(system|hidden)\s+prompt|source\s*code\s*(보여|輸出|dump|print)/i;

const PRICE_RE =
  /(가격|얼마|요금|price|cost|구매\s*상품|판매\s*상품|lifetime\s*가격|크레딧\s*(팩|가격|얼마)|料金|いくら)/i;

const UNKNOWN_ERROR_RE =
  /[A-Z]{2,}[-_]?\d{2,}|(처음\s*보는|모르는|unknown)\s*(오류|에러|error)|見たことない\s*(エラー|誤り)/i;

function cfg(name, fallback = '') {
  return process.env[name] || fallback;
}

function scoreBoost(question, doc) {
  const s = String(question || '').toLowerCase();
  let score = 0;
  if (doc.id === 'credits-usage' && /(크레딧|credit).{0,12}(뭐|무엇|뭔|무엇인가|이란|뜻|의미|what|mean)/i.test(s))
    score += 12;
  if (doc.id === 'easier-key' && /(easy\s*key|easier\s*key|쉬운\s*조)/i.test(s)) score += 10;
  if (doc.id === 'band-orchestra-preview' && /(band|orchestra|프리뷰|preview|멀티트랙)/i.test(s))
    score += 8;
  if (doc.id === 'trial-limits' && /(trial|체험|1\s*분|무료)/i.test(s)) score += 8;
  if (doc.id === 'pdf-to-midi' && /pdf/i.test(s)) score += 6;
  if (doc.id === 'youtube-to-midi' && /(youtube|유튜브|yt)/i.test(s)) score += 6;
  if (doc.id === 'youtube-fetch-errors' && /(403|forbidden|yt-?dlp)/i.test(s)) score += 10;
  return score;
}

function retrieve(question, limit = 4, { includeInternal = false, locale = 'ko', minScore = DEFAULT_MIN_SCORE } = {}) {
  const base = retrieveKnowledge(question, {
    limit: Math.max(limit, 6),
    includeInternal,
    locale,
    minScore: 1
  });
  const q = String(question || '').toLowerCase();
  const rescored = base
    .map((d) => {
      let score = Number(d.score || 0) + scoreBoost(question, d);
      for (const kw of d.keywords || []) {
        const k = String(kw).toLowerCase();
        if (k && q.includes(k)) score += Math.max(2, Math.min(6, k.length));
      }
      const title = String(d.title || '').toLowerCase();
      if (title && q.includes(title)) score += 6;
      return { d, score };
    })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score || a.d.priority - b.d.priority);
  return rescored.slice(0, limit).map((x) => ({ ...x.d, score: x.score }));
}

function isPersonal(q) {
  return PERSONAL_RE.test(String(q || ''));
}

function wantsHuman(q) {
  return HUMAN_WANT_RE.test(String(q || ''));
}

function isSecretProbe(q) {
  return SECRET_PROBE_RE.test(String(q || ''));
}

function isInjectionProbe(q) {
  return INJECTION_RE.test(String(q || ''));
}

async function isAdminUid(db, uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const role = String((snap.data() || {}).role || '').toLowerCase();
    return role === 'admin' || role === 'developer' || role === 'staff';
  } catch (_) {
    return false;
  }
}

async function loadRecentReplies(db, ticketId, limit = 12) {
  const snap = await db
    .collection('supportTickets')
    .doc(ticketId)
    .collection('replies')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() || {}) }))
    .reverse();
}

function buildTranscript(ticket, replies) {
  const lines = [];
  if (ticket.content) lines.push(`user: ${ticket.content}`);
  for (const r of replies) {
    const role = r.role || 'user';
    lines.push(`${role}: ${String(r.content || '').slice(0, 800)}`);
  }
  return lines.join('\n').slice(0, 6000);
}

function templateAnswer(question, passages, { personal, lowConfidence, wantHuman, locale }) {
  const loc = locale || 'ko';
  if (wantHuman) {
    return {
      text:
        loc === 'en'
          ? 'I will connect you to a counselor. Please wait a moment.'
          : loc === 'ja'
            ? 'オペレーターに接続します。少々お待ちください。'
            : '상담사에게 연결해 드리겠습니다. 잠시만 기다려 주세요.',
      suggestHandoff: true,
      confidence: 0.9,
      refs: []
    };
  }
  if (personal) {
    return {
      text:
        loc === 'en'
          ? 'Personal account, payment, or license expiry cannot be confirmed from public docs alone. Connect to a counselor to check your account?'
          : loc === 'ja'
            ? '個人のライセンス期限・決済状態は公開資料だけでは確認できません。オペレーター接続で正確に確認しますか？'
            : '개인 계정·결제·라이선스 만료일 등은 공식 문서만으로 확인할 수 없습니다. 상담사에게 연결해 정확한 계정 상태를 확인해 드릴까요?',
      suggestHandoff: true,
      confidence: 0.95,
      refs: passages.slice(0, 1).map((p) => ({ label: `${p.title}`, href: p.href }))
    };
  }
  if (!passages.length || lowConfidence) {
    return {
      text:
        loc === 'en'
          ? 'I could not find a reliable official answer for this. I will not guess. Would you like a counselor?'
          : loc === 'ja'
            ? '公式資料で確実な案内が見つかりません。推測ではお答えできません。オペレーターに接続しますか？'
            : '이 부분은 공식 자료에서 정확히 확인하기 어렵습니다. 추측으로 안내드리지 않고, 상담사에게 연결해 드릴까요?',
      suggestHandoff: true,
      confidence: 0.2,
      refs: [],
      noReliableKnowledge: true
    };
  }
  const top = passages[0];
  const related = passages
    .slice(1)
    .filter((p) => p && p.id !== top.id && p.text !== top.text)
    .slice(0, 2);
  let text = String(top.text || '').trim();
  if (related.length) {
    const label =
      loc === 'en' ? '\n\nAlso see: ' : loc === 'ja' ? '\n\n関連: ' : '\n\n더 볼 수 있는 안내: ';
    text += label + related.map((p) => p.title).join(', ');
  }
  return {
    text,
    suggestHandoff: false,
    confidence: Math.min(0.9, 0.55 + passages.length * 0.1),
    refs: [top, ...related].map((p) => ({
      label: p.id === 'credits-usage' ? (loc === 'en' ? 'Credits / purchase' : '구매·크레딧 안내') : `${p.title}`,
      href: p.href
    }))
  };
}

async function callLlmIfConfigured(system, userPrompt) {
  const geminiKey = cfg('GEMINI_API_KEY') || cfg('GOOGLE_AI_API_KEY');
  const openaiKey = cfg('OPENAI_API_KEY');
  if (geminiKey) {
    const model = cfg('SUPPORT_AI_MODEL', 'gemini-2.0-flash');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${system}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
      })
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return String(text).trim();
  }
  if (openaiKey) {
    const model = cfg('SUPPORT_AI_MODEL', 'gpt-4o-mini');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 512,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content || '').trim();
  }
  return null;
}

async function checkRateLimit(db, uid) {
  const ref = db.collection('aiSupportRate').doc(uid);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const maxPerHour = Number(cfg('SUPPORT_AI_MAX_PER_HOUR', '40')) || 40;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    let windowStart = Number(data.windowStartMs || 0);
    let count = Number(data.count || 0);
    if (!windowStart || now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    if (count >= maxPerHour) {
      throw Object.assign(new Error('AI 요청이 너무 많습니다. 잠시 후 다시 시도하거나 상담사를 연결해 주세요.'), {
        status: 429
      });
    }
    tx.set(
      ref,
      {
        windowStartMs: windowStart,
        count: count + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

async function writeAiReply(db, ticketId, payload) {
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const reply = {
    uid: 'system-ai',
    role: 'ai',
    displayName: 'MidiAI Studio AI',
    content: payload.text,
    messageType: 'text',
    sourceReferences: payload.refs || [],
    aiConfidence: payload.confidence,
    suggestHandoff: !!payload.suggestHandoff,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  if (payload.noReliableKnowledge) reply.noReliableKnowledge = true;
  await ticketRef.collection('replies').add(reply);
  const patch = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: String(payload.text || '').slice(0, 120),
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSender: 'ai'
  };
  if (payload.forceWaiting) {
    patch.conversationMode = MODE.WAITING;
    patch.humanRequestedAt = admin.firestore.FieldValue.serverTimestamp();
    patch.adminRead = false;
    patch.adminNotified = false;
    patch.adminNotifyKind = 'ticket';
    patch.adminNotifyAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await ticketRef.update(patch);
}

/** FAQ is runtime authoritative — not baked into Functions JSON. */
async function loadLiveFaqPassages(db, question, limit = 2) {
  try {
    const snap = await db.collection('faq').where('visible', '==', true).limit(40).get();
    const q = String(question || '').toLowerCase();
    const scored = [];
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      const title = String(data.question || data.title || '');
      const answer = String(data.answer || data.content || '');
      const hay = `${title} ${answer}`.toLowerCase();
      let score = 0;
      for (const token of q.split(/[\s,?!.]+/).filter((t) => t.length > 1).slice(0, 12)) {
        if (hay.includes(token)) score += 1;
      }
      if (score >= 2) {
        scored.push({
          id: `faq-${d.id}`,
          priority: 3,
          title: title.slice(0, 80) || 'FAQ',
          href: '/faq.html',
          keywords: [],
          text: `${title}: ${answer}`.slice(0, 600),
          score,
          visibility: 'public',
          featureStatus: 'production'
        });
      }
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (err) {
    console.warn('loadLiveFaqPassages', err && err.message);
    return [];
  }
}

/** Live catalog for prices / sellable products — authoritative over static Knowledge. */
async function loadLiveCatalogPassages(db, question) {
  if (!PRICE_RE.test(String(question || ''))) return [];
  try {
    const snap = await db.collection('products').limit(40).get();
    const lines = [];
    snap.docs.forEach((d) => {
      const p = d.data() || {};
      const status = String(p.status || p.saleStatus || 'active').toLowerCase();
      if (['paused', 'archived', 'hidden', 'disabled', 'draft'].includes(status)) return;
      const name = p.title || p.name || p.productId || d.id;
      const type = p.type || p.plan || p.kind || '';
      const list = p.listPriceKrw ?? p.priceKrw ?? p.listPrice;
      const sale = p.salePriceKrw ?? p.salePrice;
      lines.push(
        `- ${name} | type=${type || '-'} | listPriceKrw=${list ?? 'n/a'}${sale != null ? ` | salePriceKrw=${sale}` : ''} | status=${status}`
      );
    });
    if (!lines.length) {
      return [
        {
          id: 'live-catalog-empty',
          priority: 1,
          title: 'Purchase catalog',
          href: '/purchase.html',
          keywords: [],
          text: 'No active products returned from live catalog. Tell the user to open the Purchase page; do not invent prices.',
          score: 20,
          visibility: 'public',
          featureStatus: 'production'
        }
      ];
    }
    return [
      {
        id: 'live-catalog',
        priority: 1,
        title: '현재 판매 상품 (live)',
        href: '/purchase.html',
        keywords: [],
        text:
          'Authoritative live catalog (prefer over static Knowledge for prices). Only list these sellable items:\n' +
          lines.join('\n'),
        score: 20,
        visibility: 'public',
        featureStatus: 'production'
      }
    ];
  } catch (err) {
    console.warn('loadLiveCatalogPassages', err && err.message);
    return [];
  }
}

async function handleHandoffSummary(db, user, ticketId) {
  if (!ticketId) throw Object.assign(new Error('ticketId required'), { status: 400 });
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const snap = await ticketRef.get();
  if (!snap.exists) throw Object.assign(new Error('Ticket not found'), { status: 404 });
  const ticket = snap.data() || {};
  if (ticket.uid !== user.uid) {
    const roleSnap = await db.collection('users').doc(user.uid).get();
    const role = String((roleSnap.data() || {}).role || '').toLowerCase();
    if (role !== 'admin' && role !== 'developer' && role !== 'staff') {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
  }

  const replies = await loadRecentReplies(db, ticketId, 40);
  const transcript = buildTranscript(ticket, replies);
  const attachments = [];
  if (Array.isArray(ticket.attachments)) {
    for (const a of ticket.attachments) if (a?.name) attachments.push(a.name);
  }
  for (const r of replies) {
    if (Array.isArray(r.attachments)) {
      for (const a of r.attachments) if (a?.name) attachments.push(a.name);
    }
  }

  let summary =
    `문제:\n${String(ticket.title || ticket.content || '').slice(0, 200)}\n\n` +
    `대화 요약:\n${transcript.split('\n').slice(-12).join('\n')}\n\n` +
    `현재 상태: 상담사 연결 요청\n` +
    (attachments.length ? `첨부:\n- ${attachments.slice(0, 10).join('\n- ')}` : '첨부: 없음');

  try {
    const llm = await callLlmIfConfigured(
      'Summarize this MidiAI Studio support chat for a human agent in Korean. Short bullet sections: 문제, 사용자가 확인한 내용, AI가 안내한 내용, 해결 여부, 현재 상태, 첨부. Do not invent facts.',
      transcript.slice(0, 5000)
    );
    if (llm) summary = llm.slice(0, 2500);
  } catch (err) {
    console.warn('handoff summary LLM', err && err.message);
  }

  await ticketRef.update({
    conversationMode: MODE.WAITING,
    aiSummary: summary,
    aiSummaryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    humanRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminRead: false,
    adminNotified: false,
    adminNotifyKind: 'ticket',
    adminNotifyAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await ticketRef.collection('replies').add({
    uid: 'system-ai',
    role: 'ai',
    displayName: 'MidiAI Studio AI',
    content: `[AI 상담 요약]\n${summary}`,
    messageType: 'ai_summary',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { ok: true };
}

async function handleSupportAiReply(db, user, ticketId, { debug = false } = {}) {
  if (!ticketId) throw Object.assign(new Error('ticketId required'), { status: 400 });
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  const snap = await ticketRef.get();
  if (!snap.exists) throw Object.assign(new Error('Ticket not found'), { status: 404 });
  const ticket = snap.data() || {};
  if (ticket.uid !== user.uid) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const mode = ticket.conversationMode || MODE.AI;
  if (mode === MODE.HUMAN || mode === MODE.WAITING || mode === MODE.CLOSED || ticket.status === 'closed') {
    return { ok: true, skipped: true, reason: 'not_ai_mode' };
  }

  await checkRateLimit(db, user.uid);

  const replies = await loadRecentReplies(db, ticketId, 12);
  const lastUser =
    [...replies].reverse().find((r) => r.role === 'user')?.content || ticket.content || '';
  const question = String(lastUser || '').trim();
  if (!question) return { ok: true, skipped: true, reason: 'empty' };

  const locale = detectLocale(question);
  const ragDebug = {
    query: question.slice(0, 200),
    locale,
    retrieved: [],
    visibility: 'public',
    minScore: DEFAULT_MIN_SCORE
  };

  if (isSecretProbe(question) || isInjectionProbe(question)) {
    await writeAiReply(db, ticketId, {
      text:
        locale === 'en'
          ? 'I cannot reveal secrets, admin credentials, internal documents, or ignore safety rules. Ask about product usage instead.'
          : locale === 'ja'
            ? '秘密情報・管理者認証・内部ドキュメントの開示や安全ルールの無視には応えられません。製品の使い方についてお聞きください。'
            : '보안상 비밀값·관리자 정보·내부 문서 공개나 안전 규칙 우회 요청에는 답할 수 없습니다. 제품 사용 관련 문의만 도와드릴 수 있어요.',
      suggestHandoff: false,
      confidence: 1,
      refs: []
    });
    return { ok: true, refused: true, reason: 'secret_or_injection', ...(debug ? { _rag: ragDebug } : {}) };
  }

  const personal = isPersonal(question);
  const wantHuman = wantsHuman(question);
  if (wantHuman) {
    const result = await handleHandoffSummary(db, user, ticketId);
    return { ...result, handedOff: true, ...(debug ? { _rag: ragDebug } : {}) };
  }

  const staticPassages = personal
    ? retrieve(question, 1, { includeInternal: false, locale })
    : retrieve(question, 4, { includeInternal: false, locale });
  const faqPassages = personal ? [] : await loadLiveFaqPassages(db, question, 2);
  const catalogPassages = personal ? [] : await loadLiveCatalogPassages(db, question);
  let passages = [...catalogPassages, ...staticPassages, ...faqPassages].slice(0, 4);
  // Unknown / novel error codes: do not force nearest weak conversion docs
  if (UNKNOWN_ERROR_RE.test(question)) {
    const top = passages[0];
    const strong =
      top &&
      (Number(top.score || 0) >= 15 ||
        /error|403|404|cuda|ffmpeg|timeout|오류/i.test(String(top.id || '') + String(top.title || '')));
    if (!strong) passages = [];
  }
  const lowConfidence = !personal && passages.length === 0;
  ragDebug.retrieved = passages.map((p) => ({
    id: p.id,
    score: p.score || null,
    visibility: p.visibility || 'public',
    verification: p.verification || (String(p.id).startsWith('faq-') || String(p.id).startsWith('live-') ? 'live' : 'verified')
  }));

  const system = [
    'You are MidiAI Studio official support AI.',
    'Answer ONLY from the provided official context. Do not invent prices, pack sizes, policies, or personal account data.',
    'If live catalog context is present, use it for prices/products and ignore any conflicting static price guesses.',
    'Answer the user question directly first. Do not paste a related-info dump or repeat the same sentence.',
    'Respect featureStatus: do not describe Preview/Beta/Experimental features as full production.',
    `Reply in ${locale === 'en' ? 'English' : locale === 'ja' ? 'Japanese' : 'Korean'}.`,
    'Keep answers short and practical (conclusion first, then up to 5 steps if needed).',
    'If unsure, say you need a human agent. Never approve refunds, grant licenses, or reveal secrets/credentials/source/internal knowledge.'
  ].join(' ');

  const contextBlock = passages.map((p) => `[${p.title}] ${p.text} (${p.href})`).join('\n');
  const transcript = buildTranscript(ticket, replies.slice(-8));
  let answer = templateAnswer(question, passages, { personal, lowConfidence, wantHuman: false, locale });
  let llmFailed = false;

  try {
    if (!lowConfidence || personal) {
      const llm = await callLlmIfConfigured(
        system,
        `Official context:\n${contextBlock || '(none)'}\n\nTranscript (recent):\n${transcript}\n\nLatest question:\n${question}\n\nWrite a direct short answer to the latest question using only the official context. Do not add a related-info dump.`
      );
      if (llm) {
        answer = {
          ...answer,
          text: llm.slice(0, 1800),
          confidence: passages.length ? 0.75 : answer.confidence,
          suggestHandoff: answer.suggestHandoff || /상담사|human|agent|オペレーター/i.test(llm)
        };
      }
    }
  } catch (err) {
    llmFailed = true;
    console.warn('supportAi LLM', err && err.message);
    if (lowConfidence || !passages.length) {
      answer = {
        text:
          locale === 'en'
            ? 'AI answer is temporarily unavailable. Your message was saved — you can connect to a counselor.'
            : locale === 'ja'
              ? 'AI回答を一時的に取得できませんでした。メッセージは保存済みです。オペレーターに接続できます。'
              : 'AI 답변을 불러오지 못했습니다. 메시지는 저장되었습니다. 상담사에게 문의를 전달할 수 있습니다.',
        suggestHandoff: true,
        confidence: 0.1,
        refs: [],
        noReliableKnowledge: true
      };
    }
    // else keep templateAnswer from passages
  }

  await writeAiReply(db, ticketId, answer);
  const out = {
    ok: true,
    suggestHandoff: !!answer.suggestHandoff,
    noReliableKnowledge: !!answer.noReliableKnowledge,
    llmFailed
  };
  if (debug) {
    const adminOk = await isAdminUid(db, user.uid);
    if (adminOk) out._rag = ragDebug;
  }
  return out;
}

function createSupportAiHandlers({ db, cors, requireUser }) {
  async function supportAiReply(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const user = await requireUser(req);
      const ticketId = String(req.body?.ticketId || '').trim();
      const debug = req.body?.debug === true;
      const result = await handleSupportAiReply(db, user, ticketId, { debug });
      return res.json(result);
    } catch (err) {
      const status = err.status || 500;
      console.error('supportAiReply', err && err.message);
      return res.status(status).json({ ok: false, message: err.message || 'supportAiReply failed' });
    }
  }

  async function supportAiHandoffSummary(req, res) {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'POST only' });
    try {
      const user = await requireUser(req);
      const ticketId = String(req.body?.ticketId || '').trim();
      const result = await handleHandoffSummary(db, user, ticketId);
      return res.json(result);
    } catch (err) {
      const status = err.status || 500;
      console.error('supportAiHandoffSummary', err && err.message);
      return res.status(status).json({
        ok: false,
        message: err.message || 'supportAiHandoffSummary failed'
      });
    }
  }

  return { supportAiReply, supportAiHandoffSummary };
}

module.exports = {
  createSupportAiHandlers,
  retrieve,
  knowledgeStats,
  retrieveKnowledge,
  detectLocale,
  isPersonal,
  wantsHuman,
  isSecretProbe,
  isInjectionProbe
};
