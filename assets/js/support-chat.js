/**
 * Floating support chat — reuses Firestore supportTickets + replies.
 * AI replies are written only by Cloud Functions (Admin SDK).
 */
const MODE = {
  AI: 'ai',
  WAITING: 'waiting_human',
  HUMAN: 'human',
  CLOSED: 'closed'
};

/** AI 상담 무응답 자동 종료 (30분) */
const AI_IDLE_CLOSE_MS = 30 * 60 * 1000;
const CLOSE_CMD_RE = /^\s*(상담\s*종료|종료|대화\s*종료|end(\s*chat)?|close(\s*ticket)?)\s*$/i;
const CHAT_UI_KEY = 'midiai.supportChat.ui';

/** Branding / chrome copy only — does not change ticket or AI reply logic. */
const CHAT_BRAND = {
  ko: {
    fab: 'AI 도우미',
    fabAria: 'AI 도우미 열기',
    panelAria: 'MidiAI AI 도우미',
    header: 'MidiAI AI 도우미',
    subtitle: '제품 사용 · 오류 · 기능 안내',
    human: '상담사 연결',
    closeAria: '닫기'
  },
  en: {
    fab: 'AI Assistant',
    fabAria: 'Open AI Assistant',
    panelAria: 'MidiAI AI Assistant',
    header: 'MidiAI AI Assistant',
    subtitle: 'Product help · errors · features',
    human: 'Connect to counselor',
    closeAria: 'Close'
  },
  ja: {
    fab: 'AIアシスタント',
    fabAria: 'AIアシスタントを開く',
    panelAria: 'MidiAI AIアシスタント',
    header: 'MidiAI AIアシスタント',
    subtitle: '使い方・エラー・機能案内',
    human: 'スタッフに相談',
    closeAria: '閉じる'
  }
};

function fabIconSvg(gradId = 'supportChatFabGrad'){
  return `
  <svg class="support-chat-fab-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${gradId}" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
        <stop stop-color="var(--accent2, #22d3ee)"/>
        <stop offset="1" stop-color="var(--accent, #8b5cf6)"/>
      </linearGradient>
    </defs>
    <rect x="2.5" y="3.5" width="16.5" height="12.5" rx="6" fill="url(#${gradId})" opacity=".22"/>
    <rect x="2.5" y="3.5" width="16.5" height="12.5" rx="6" stroke="url(#${gradId})" stroke-width="1.5" fill="none"/>
    <path d="M7.2 19.2 9.4 16.2" stroke="url(#${gradId})" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M16.2 6.2 16.7 7.5 18 8 16.7 8.5 16.2 9.8 15.7 8.5 14.4 8 15.7 7.5Z" fill="url(#${gradId})"/>
    <path d="M19.4 10.1 19.65 10.7 20.3 10.95 19.65 11.2 19.4 11.8 19.15 11.2 18.5 10.95 19.15 10.7Z" fill="url(#${gradId})" opacity=".9"/>
  </svg>
`.trim();
}

function readChatUiState(){
  try{
    const raw = sessionStorage.getItem(CHAT_UI_KEY);
    if(!raw) return { open: false, ticketId: '' };
    const data = JSON.parse(raw);
    return {
      open: !!data?.open,
      ticketId: String(data?.ticketId || '').trim()
    };
  }catch{
    return { open: false, ticketId: '' };
  }
}

function writeChatUiState({ open, ticketId }){
  try{
    sessionStorage.setItem(CHAT_UI_KEY, JSON.stringify({
      open: !!open,
      ticketId: String(ticketId || '').trim(),
      updatedAt: Date.now()
    }));
  }catch{ /* ignore quota / private mode */ }
}

const QUICK = [
  { id: 'convert', label: '변환/편집', text: 'YouTube·오디오·PDF를 MIDI로 변환하거나 편집하는 방법을 알고 싶어요.' },
  { id: 'install', label: '설치/오류', text: '설치·업데이트·실행 오류가 있어요.' },
  { id: 'purchase', label: '구매/라이선스', text: '구매·라이선스·로그인 관련 문의입니다.' },
  { id: 'other', label: '기타 문의', text: '다른 문의가 있어요.' }
];

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function nl2br(s){ return esc(s).replace(/\n/g, '<br>'); }
function fmtTime(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : null);
    if(!d) return '';
    return d.toLocaleString();
  }catch{ return ''; }
}

function resolveChatLang(getLang){
  try{
    const fromApi = typeof getLang === 'function' ? String(getLang() || '').toLowerCase() : '';
    if(fromApi === 'en' || fromApi === 'ja' || fromApi === 'ko') return fromApi;
  }catch{ /* ignore */ }
  try{
    const htmlLang = String(document.documentElement?.lang || '').toLowerCase().slice(0, 2);
    if(htmlLang === 'en' || htmlLang === 'ja' || htmlLang === 'ko') return htmlLang;
  }catch{ /* ignore */ }
  try{
    const stored = String(localStorage.getItem('midiai_lang') || '').toLowerCase();
    if(stored === 'en' || stored === 'ja' || stored === 'ko') return stored;
  }catch{ /* ignore */ }
  return 'ko';
}

function chatCopy(getLang){
  return CHAT_BRAND[resolveChatLang(getLang)] || CHAT_BRAND.ko;
}

/** Applied from app.js applyStaticI18n — branding chrome only. */
let applyBrandingLabels = null;
export function applySupportChatBranding(){
  try{ applyBrandingLabels?.(); }catch{ /* ignore */ }
}

export function initSupportChat(api){
  if(typeof document === 'undefined') return;
  if(document.body?.classList?.contains('admin-console-page')) return;
  if(document.getElementById('supportChatRoot')) return;

  const {
    $,
    getUser,
    isAdmin,
    getDb,
    getFs,
    getStorageApi,
    callFn,
    basePath = './',
    brandAuthor = 'MidiAI Studio',
    getLang,
    onAuthChange
  } = api;

  let open = false;
  let activeTicketId = '';
  let unsubTicket = null;
  let unsubReplies = null;
  let sending = false;
  let creatingTicket = false;
  let forceNextAsNew = false;
  let selectedFiles = [];
  let ticketCache = null;
  let repliesCache = [];
  let aiIdleTimer = 0;
  let closingTicket = false;
  const restoredUi = readChatUiState();

  function persistUiState(){
    writeChatUiState({ open, ticketId: activeTicketId });
  }

  function setActiveTicketId(id, { persist = true } = {}){
    activeTicketId = String(id || '').trim();
    if(persist) persistUiState();
  }

  if(restoredUi.ticketId) setActiveTicketId(restoredUi.ticketId, { persist: false });

  const t0 = chatCopy(getLang);
  const root = document.createElement('div');
  root.id = 'supportChatRoot';
  root.className = 'support-chat-root';
  root.innerHTML = `
    <button type="button" class="support-chat-fab" id="supportChatFab" aria-label="${esc(t0.fabAria)}">
      <span class="support-chat-fab-icon" aria-hidden="true">${fabIconSvg('supportChatFabGrad')}</span>
      <span class="support-chat-fab-label" id="supportChatFabLabel">${esc(t0.fab)}</span>
    </button>
    <section class="support-chat-panel" id="supportChatPanel" hidden aria-label="${esc(t0.panelAria)}">
      <header class="support-chat-head">
        <div class="support-chat-brand">
          <span class="support-chat-avatar" aria-hidden="true">${fabIconSvg('supportChatAvatarGrad')}</span>
          <div>
            <b id="supportChatTitle">${esc(t0.header)}</b>
            <small id="supportChatSub">${esc(t0.subtitle)}</small>
          </div>
        </div>
        <button type="button" class="support-chat-x" id="supportChatClose" aria-label="${esc(t0.closeAria)}">×</button>
      </header>
      <div class="support-chat-toolbar" id="supportChatToolbar" hidden>
        <select id="supportChatTicketSelect" aria-label="문의 선택"></select>
        <button type="button" class="support-chat-mini" id="supportChatNew">+ 새 문의</button>
      </div>
      <div class="support-chat-body" id="supportChatBody"></div>
      <div class="support-chat-actions" id="supportChatActions"></div>
      <footer class="support-chat-composer">
        <input type="file" id="supportChatFiles" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif,text/plain,text/csv,.log,.txt,.mid,.midi,.musicxml,.xml,.zip,application/zip,application/pdf">
        <button type="button" class="support-chat-attach" id="supportChatAttach" aria-label="첨부">📎</button>
        <textarea id="supportChatInput" rows="1" placeholder="메시지를 입력하세요..."></textarea>
        <button type="button" class="support-chat-send" id="supportChatSend" aria-label="전송">➤</button>
      </footer>
      <div class="support-chat-preview" id="supportChatPreview" hidden></div>
    </section>`;
  document.body.appendChild(root);

  const fab = root.querySelector('#supportChatFab');
  const panel = root.querySelector('#supportChatPanel');
  const body = root.querySelector('#supportChatBody');
  const actions = root.querySelector('#supportChatActions');
  const input = root.querySelector('#supportChatInput');
  const preview = root.querySelector('#supportChatPreview');
  const toolbar = root.querySelector('#supportChatToolbar');
  const select = root.querySelector('#supportChatTicketSelect');

  function applyLabels({ keepModeSub = false } = {}){
    const t = chatCopy(getLang);
    const fabLabel = root.querySelector('#supportChatFabLabel');
    if(fabLabel) fabLabel.textContent = t.fab;
    fab?.setAttribute('aria-label', t.fabAria);
    panel?.setAttribute('aria-label', t.panelAria);
    const title = root.querySelector('#supportChatTitle');
    if(title) title.textContent = t.header;
    const closeBtn = root.querySelector('#supportChatClose');
    if(closeBtn) closeBtn.setAttribute('aria-label', t.closeAria);
    if(!keepModeSub){
      const sub = root.querySelector('#supportChatSub');
      if(sub && !ticketCache) sub.textContent = t.subtitle;
    }
    const humanBtn = root.querySelector('#supportChatHuman');
    if(humanBtn) humanBtn.textContent = t.human;
  }
  applyBrandingLabels = () => applyLabels({ keepModeSub: !!ticketCache });
  applyLabels();

  function setOpen(next, { persist = true } = {}){
    open = !!next;
    panel.hidden = !open;
    fab.classList.toggle('is-open', open);
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if(persist) persistUiState();
    if(open){
      ensureSession().catch(console.error);
      // Avoid stealing focus on cross-page restore; only focus when user toggles open
      if(persist) input?.focus();
    } else {
      stopListeners();
    }
  }

  fab.addEventListener('click', () => setOpen(!open));
  root.querySelector('#supportChatClose')?.addEventListener('click', () => setOpen(false));
  root.querySelector('#supportChatAttach')?.addEventListener('click', () => root.querySelector('#supportChatFiles')?.click());
  root.querySelector('#supportChatFiles')?.addEventListener('change', (e) => {
    const files = [...(e.target.files || [])];
    selectedFiles = [...selectedFiles, ...files].slice(0, 5);
    e.target.value = '';
    renderPreview();
  });
  root.querySelector('#supportChatSend')?.addEventListener('click', () => sendMessage());
  root.querySelector('#supportChatNew')?.addEventListener('click', () => prepareNewInquiry());
  select?.addEventListener('change', () => {
    forceNextAsNew = false;
    setActiveTicketId(select.value || '');
    if(activeTicketId) bindTicket(activeTicketId).catch(console.error);
  });
  input?.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMessage();
    }
  });

  function renderPreview(){
    if(!selectedFiles.length){
      preview.hidden = true;
      preview.innerHTML = '';
      return;
    }
    preview.hidden = false;
    preview.innerHTML = selectedFiles.map((f, i) =>
      `<span class="support-chat-filechip">${esc(f.name)} <button type="button" data-rm="${i}" aria-label="제거">×</button></span>`
    ).join('');
    preview.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.onclick = () => {
        selectedFiles.splice(Number(btn.dataset.rm), 1);
        renderPreview();
      };
    });
  }

  function stopListeners(){
    try{ unsubTicket?.(); }catch{}
    try{ unsubReplies?.(); }catch{}
    unsubTicket = null;
    unsubReplies = null;
  }

  function modeLabel(mode, status){
    if(status === 'closed' || mode === MODE.CLOSED) return '종료';
    if(mode === MODE.WAITING) return '상담사 연결 요청됨';
    if(mode === MODE.HUMAN) return '상담사 상담중';
    if(mode === MODE.AI) return 'AI 상담중 · 30분 무응답 시 자동 종료';
    if(status === 'answered') return '답변 완료';
    return '문의중';
  }

  function paintWelcome(){
    const user = getUser();
    body.innerHTML = `
      <div class="support-chat-welcome">
        <div class="support-chat-bubble is-ai">
          <div class="support-chat-meta"><b>MidiAI Studio AI</b></div>
          <p>안녕하세요. 무엇을 도와드릴까요?<br>공식 가이드를 바탕으로 먼저 안내하고, 필요하면 상담사에게 연결합니다.</p>
        </div>
        ${user ? `<div class="support-chat-quick">${QUICK.map((q) =>
          `<button type="button" class="support-chat-chip" data-quick="${q.id}">${esc(q.label)}</button>`
        ).join('')}</div>` : `<div class="support-chat-login"><p>상담을 시작하려면 Google 로그인이 필요합니다.</p><button type="button" class="support-chat-primary" id="supportChatLogin">Google 로그인</button></div>`}
      </div>`;
    body.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.onclick = () => {
        const q = QUICK.find((x) => x.id === btn.dataset.quick);
        if(q){
          input.value = q.text;
          sendMessage();
        }
      };
    });
    body.querySelector('#supportChatLogin')?.addEventListener('click', () => {
      document.getElementById('loginBtn')?.click();
      document.getElementById('topbarProfileBtn')?.click();
    });
    actions.innerHTML = '';
    root.querySelector('#supportChatSub').textContent = chatCopy(getLang).subtitle;
  }

  function bubbleHtml(msg){
    const role = msg.role || 'user';
    const side = role === 'user' ? 'is-user' : 'is-agent';
    const who = role === 'admin'
      ? 'MidiAI Studio 상담사'
      : role === 'ai'
        ? 'MidiAI Studio AI'
        : (msg.displayName || '나');
    const aiTag = role === 'ai' ? '<em class="support-chat-ai-tag">AI 답변</em>' : '';
    const system = msg.messageType === 'system' || msg.messageType === 'ai_summary';
    const refs = Array.isArray(msg.sourceReferences) ? msg.sourceReferences.filter((r) => r?.href && r?.label) : [];
    const refsHtml = refs.length
      ? `<div class="support-chat-refs">${refs.map((r) =>
          `<a href="${esc(r.href)}" target="_blank" rel="noopener noreferrer">${esc(r.label)}</a>`
        ).join('')}</div>`
      : '';
    const atts = Array.isArray(msg.attachments) ? msg.attachments.filter((a) => a?.url) : [];
    const attHtml = atts.map((a) => {
      const mime = String(a.mime || a.type || '');
      const isImg = mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(a.name || '');
      if(isImg){
        return `<a class="support-chat-thumb" href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.name || '')}" loading="lazy" data-lightbox-src="${esc(a.url)}"></a>`;
      }
      return `<a class="support-chat-file" href="${esc(a.url)}" target="_blank" rel="noopener" download>${esc(a.name || '파일')}</a>`;
    }).join('');
    if(system){
      return `<div class="support-chat-system"><b>${esc(who)}</b><div>${nl2br(msg.content || '')}</div>${attHtml}${refsHtml}</div>`;
    }
    return `<div class="support-chat-row ${side}">
      <div class="support-chat-bubble ${side === 'is-user' ? 'is-user' : (role === 'ai' ? 'is-ai' : 'is-admin')}">
        <div class="support-chat-meta"><b>${esc(who)}</b>${aiTag}<span>${esc(fmtTime(msg.createdAt))}</span></div>
        <div class="support-chat-text">${nl2br(msg.content || '')}</div>
        ${attHtml ? `<div class="support-chat-atts">${attHtml}</div>` : ''}
        ${refsHtml}
      </div>
    </div>`;
  }

  function buildThreadMessages(ticket, replies){
    const out = [];
    if(ticket?.content){
      out.push({
        id: 'legacy-open',
        role: 'user',
        displayName: ticket.displayName || '사용자',
        content: ticket.content,
        createdAt: ticket.createdAt,
        attachments: ticket.attachments || []
      });
    }
    for(const r of replies || []){
      out.push(r);
    }
    return out;
  }

  function ticketActivityMs(ticket){
    const ts = ticket?.lastMessageAt || ticket?.updatedAt || ticket?.createdAt;
    try{
      if(ts?.toDate) return ts.toDate().getTime();
      if(ts?.seconds) return ts.seconds * 1000;
      if(typeof ts === 'number') return ts;
    }catch{}
    return 0;
  }

  function clearAiIdleTimer(){
    if(aiIdleTimer){
      clearTimeout(aiIdleTimer);
      aiIdleTimer = 0;
    }
  }

  function scheduleAiIdleClose(ticket){
    clearAiIdleTimer();
    if(!ticket || isTicketClosed(ticket)) return;
    const mode = ticket.conversationMode || MODE.AI;
    // Auto-close only during AI-first chat (not while waiting for / talking to human)
    if(mode !== MODE.AI) return;
    const last = ticketActivityMs(ticket);
    if(!last) return;
    const remain = AI_IDLE_CLOSE_MS - (Date.now() - last);
    if(remain <= 0){
      closeConversation({ reason: 'idle', silentConfirm: true }).catch(console.error);
      return;
    }
    aiIdleTimer = setTimeout(() => {
      closeConversation({ reason: 'idle', silentConfirm: true }).catch(console.error);
    }, remain);
  }

  function paintThread(){
    const ticket = ticketCache;
    if(!ticket){
      paintWelcome();
      return;
    }
    const mode = ticket.conversationMode || (ticket.status === 'closed' ? MODE.CLOSED : MODE.AI);
    const closed = isTicketClosed(ticket) || mode === MODE.CLOSED;
    root.querySelector('#supportChatSub').textContent = modeLabel(mode, ticket.status);
    const msgs = buildThreadMessages(ticket, repliesCache);
    body.innerHTML = msgs.map(bubbleHtml).join('') || '<p class="support-chat-empty">대화를 시작해 보세요.</p>';
    body.scrollTop = body.scrollHeight;

    const canHuman = !closed && mode === MODE.AI;
    const waiting = !closed && mode === MODE.WAITING;
    const canEnd = !closed && (mode === MODE.AI || mode === MODE.WAITING || mode === MODE.HUMAN);
    actions.innerHTML = `
      ${canHuman ? `<button type="button" class="support-chat-human" id="supportChatHuman">${esc(chatCopy(getLang).human)}</button>` : ''}
      ${canEnd ? `<button type="button" class="support-chat-end" id="supportChatEnd">상담 종료</button>` : ''}
      ${waiting ? `<div class="support-chat-waiting">상담사 연결이 요청되었습니다. 지금까지의 대화가 함께 전달됩니다. 메시지를 계속 남겨도 됩니다.</div>` : ''}
      ${closed ? `<div class="support-chat-waiting">이 상담은 종료되었습니다. 새 문제가 있으면 [+ 새 문의]로 시작해 주세요.</div>` : ''}
      <a class="support-chat-link" href="${esc(basePath)}my-tickets.html">나의 문의</a>
    `;
    actions.querySelector('#supportChatHuman')?.addEventListener('click', () => requestHuman().catch(console.error));
    actions.querySelector('#supportChatEnd')?.addEventListener('click', () => closeConversation({ reason: 'user' }).catch(console.error));

    const composer = root.querySelector('.support-chat-composer');
    if(composer) composer.classList.toggle('is-disabled', closed);
    if(input){
      input.disabled = closed;
      input.placeholder = closed ? '종료된 상담입니다. 새 문의를 시작해 주세요.' : '메시지를 입력하세요...';
    }
    root.querySelector('#supportChatSend')?.toggleAttribute('disabled', closed);
    root.querySelector('#supportChatAttach')?.toggleAttribute('disabled', closed);

    scheduleAiIdleClose(ticket);
  }

  async function closeConversation({ reason = 'user', silentConfirm = false } = {}){
    const user = getUser();
    if(!user || !activeTicketId || closingTicket) return;
    if(isTicketClosed(ticketCache)) return;
    if(!silentConfirm){
      const ok = window.confirm('이 상담을 종료할까요?');
      if(!ok) return;
    }
    closingTicket = true;
    clearAiIdleTimer();
    try{
      const db = getDb();
      const fs = getFs();
      const { doc, updateDoc, serverTimestamp, collection, addDoc } = fs;
      const note = reason === 'idle'
        ? 'AI 상담이 일정 시간 응답이 없어 자동 종료되었습니다.'
        : '사용자가 상담을 종료했습니다.';
      await updateDoc(doc(db, 'supportTickets', activeTicketId), {
        status: 'closed',
        conversationMode: MODE.CLOSED,
        closedAt: serverTimestamp(),
        closedReason: reason === 'idle' ? 'ai_idle_timeout' : 'user_end',
        humanChatNotified: false,
        updatedAt: serverTimestamp(),
        lastMessage: reason === 'idle' ? 'AI 상담 자동 종료' : '상담 종료',
        lastMessageAt: serverTimestamp(),
        lastSender: 'system'
      });
      await addDoc(collection(db, 'supportTickets', activeTicketId, 'replies'), {
        uid: user.uid,
        role: 'user',
        displayName: user.displayName || '',
        content: note,
        messageType: 'system',
        createdAt: serverTimestamp()
      });
    }catch(err){
      console.error(err);
      if(!silentConfirm) alert(err.message || '상담을 종료하지 못했습니다.');
    }finally{
      closingTicket = false;
    }
  }

  async function listMyTickets(){
    const user = getUser();
    const db = getDb();
    const fs = getFs();
    if(!user || !db || !fs) return [];
    const { collection, query, where, getDocs } = fs;
    const snap = await getDocs(query(collection(db, 'supportTickets'), where('uid', '==', user.uid)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
        const tb = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
        return tb - ta;
      });
  }

  async function refreshTicketSelect(){
    const rows = await listMyTickets();
    if(!rows.length){
      toolbar.hidden = true;
      return rows;
    }
    toolbar.hidden = false;
    select.innerHTML = rows.map((t) =>
      `<option value="${esc(t.id)}">${esc((t.title || '문의').slice(0, 40))} · ${esc(modeLabel(t.conversationMode, t.status))}</option>`
    ).join('');
    if(activeTicketId) select.value = activeTicketId;
    return rows;
  }

  async function ensureSession(){
    const user = getUser();
    if(!user){
      paintWelcome();
      toolbar.hidden = true;
      return;
    }
    const rows = await refreshTicketSelect();
    if(activeTicketId){
      await bindTicket(activeTicketId);
      return;
    }
    const openish = rows.find((t) => t.status !== 'closed' && t.conversationMode !== MODE.CLOSED);
    if(openish){
      setActiveTicketId(openish.id);
      select.value = activeTicketId;
      await bindTicket(activeTicketId);
    } else {
      ticketCache = null;
      repliesCache = [];
      paintWelcome();
    }
  }

  async function bindTicket(ticketId){
    stopListeners();
    setActiveTicketId(ticketId);
    const db = getDb();
    const fs = getFs();
    const { doc, onSnapshot, collection, query, orderBy } = fs;
    unsubTicket = onSnapshot(doc(db, 'supportTickets', ticketId), (snap) => {
      if(!snap.exists()){
        ticketCache = null;
        paintWelcome();
        return;
      }
      ticketCache = { id: snap.id, ...snap.data() };
      paintThread();
    });
    unsubReplies = onSnapshot(
      query(collection(db, 'supportTickets', ticketId, 'replies'), orderBy('createdAt', 'asc')),
      (snap) => {
        repliesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        paintThread();
      }
    );
  }

  async function uploadFiles(ticketId, messageId){
    const user = getUser();
    const storageApi = getStorageApi?.();
    if(!storageApi || !selectedFiles.length) return [];
    const blocked = /^(exe|msi|bat|cmd|ps1|com|scr|js|vbs|dll)$/i;
    const allowExt = /^(jpe?g|png|webp|gif|txt|log|csv|pdf|zip|mid|midi|musicxml|xml)$/i;
    const { ref, uploadBytes, getDownloadURL } = storageApi;
    const out = [];
    for(let i = 0; i < selectedFiles.length; i++){
      const file = selectedFiles[i];
      const ext = String(file.name || '').split('.').pop() || '';
      if(blocked.test(ext)) throw new Error('이 파일 형식은 업로드할 수 없습니다.');
      if(!allowExt.test(ext) && !(file.type || '').startsWith('image/')){
        throw new Error('지원하지 않는 첨부 형식입니다.');
      }
      const max = (file.type || '').startsWith('image/') ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
      if(file.size > max) throw new Error('파일 크기 제한을 초과했습니다.');
      const name = String(file.name || 'file').replace(/[^\w.\-()+ ]+/g, '_').slice(0, 80);
      const path = `support/${user.uid}/${ticketId}/${messageId || 'msg'}_${Date.now()}_${i}_${name}`;
      const r = ref(storageApi.storage, path);
      await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
      const url = await getDownloadURL(r);
      out.push({
        type: (file.type || '').startsWith('image/') ? 'image' : 'file',
        mime: file.type || '',
        name: file.name,
        size: file.size,
        path,
        url
      });
    }
    return out;
  }

  function isTicketClosed(ticket){
    if(!ticket) return false;
    return ticket.status === 'closed' || ticket.conversationMode === MODE.CLOSED;
  }

  function prepareNewInquiry(){
    stopListeners();
    setActiveTicketId('');
    ticketCache = null;
    repliesCache = [];
    forceNextAsNew = true;
    if(select) select.value = '';
    const composer = root.querySelector('.support-chat-composer');
    composer?.classList.remove('is-disabled');
    if(input){
      input.disabled = false;
      input.placeholder = '메시지를 입력하세요...';
    }
    root.querySelector('#supportChatSend')?.removeAttribute('disabled');
    root.querySelector('#supportChatAttach')?.removeAttribute('disabled');
    paintWelcome();
    input?.focus();
  }

  async function startNewTicket(seedText = ''){
    const user = getUser();
    if(!user){
      paintWelcome();
      return null;
    }
    if(creatingTicket) return activeTicketId || null;
    creatingTicket = true;
    try{
      const text = String(seedText || input.value || '').trim();
      const db = getDb();
      const fs = getFs();
      const { collection, addDoc, serverTimestamp } = fs;
      const title = text ? text.slice(0, 48) : '상담 문의';
      const content = text || '상담을 시작합니다.';
      const ref = await addDoc(collection(db, 'supportTickets'), {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        category: 'other',
        appVersion: '',
        os: '',
        title,
        content,
        status: 'open',
        private: true,
        attachments: [],
        conversationMode: MODE.AI,
        lastMessage: content,
        lastMessageAt: serverTimestamp(),
        lastSender: 'user',
        // AI-first: one create toast only; follow-up AI chat does not spam admin
        adminRead: false,
        adminNotified: false,
        adminNotifyKind: 'ticket',
        adminNotifyAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      input.value = '';
      selectedFiles = [];
      renderPreview();
      forceNextAsNew = false;
      setActiveTicketId(ref.id);
      // Optimistic cache so the next send does not create another ticket
      ticketCache = {
        id: ref.id,
        uid: user.uid,
        title,
        content,
        status: 'open',
        conversationMode: MODE.AI,
        displayName: user.displayName || ''
      };
      repliesCache = [];
      await refreshTicketSelect();
      if(select) select.value = activeTicketId;
      await bindTicket(activeTicketId);
      requestAi(ref.id).catch(console.error);
      return ref.id;
    }finally{
      creatingTicket = false;
    }
  }

  async function appendReply(text){
    const user = getUser();
    if(!user || !activeTicketId) return;
    const db = getDb();
    const fs = getFs();
    const { collection, addDoc, doc, updateDoc, serverTimestamp } = fs;
    const mode = (ticketCache && ticketCache.conversationMode) || MODE.AI;
    let uploaded = [];
    try{
      uploaded = await uploadFiles(activeTicketId, `pending_${Date.now()}`);
    }catch(err){
      console.error(err);
      alert(err.message || '업로드에 실패했습니다.');
      return;
    }
    await addDoc(collection(db, 'supportTickets', activeTicketId, 'replies'), {
      uid: user.uid,
      role: 'user',
      displayName: user.displayName || '',
      content: text || (uploaded.length ? '(첨부)' : ''),
      attachments: uploaded,
      messageType: uploaded.length ? 'attachment' : 'text',
      createdAt: serverTimestamp()
    });
    const patch = {
      status: 'open',
      updatedAt: serverTimestamp(),
      lastMessage: text || (uploaded[0]?.name || '첨부'),
      lastMessageAt: serverTimestamp(),
      lastSender: 'user'
    };
    // Only ping admin after human handoff / human mode — not during AI chat
    if(mode === MODE.WAITING || mode === MODE.HUMAN){
      patch.adminRead = false;
      patch.adminNotified = false;
      patch.adminNotifyKind = 'reply';
      patch.adminNotifyAt = serverTimestamp();
    }
    await updateDoc(doc(db, 'supportTickets', activeTicketId), patch);
    input.value = '';
    selectedFiles = [];
    renderPreview();
    if(mode === MODE.AI){
      await requestAi(activeTicketId);
    }
  }

  async function sendMessage(){
    if(sending || creatingTicket || closingTicket) return;
    const user = getUser();
    if(!user){
      paintWelcome();
      return;
    }
    const text = input.value.trim();
    if(!text && !selectedFiles.length) return;
    // Treat "상담종료" as an end command, not an AI question
    if(
      activeTicketId
      && !isTicketClosed(ticketCache)
      && !selectedFiles.length
      && CLOSE_CMD_RE.test(text)
    ){
      input.value = '';
      await closeConversation({ reason: 'user' });
      return;
    }
    sending = true;
    try{
      const needNew = forceNextAsNew || !activeTicketId || isTicketClosed(ticketCache);
      if(needNew){
        // Prefer continuing an open ticket unless user explicitly asked for a new one
        if(!forceNextAsNew && !activeTicketId){
          const rows = await listMyTickets();
          const openish = rows.find((t) => !isTicketClosed(t));
          if(openish){
            setActiveTicketId(openish.id);
            ticketCache = openish;
            await bindTicket(activeTicketId);
            await appendReply(text);
            return;
          }
        }
        await startNewTicket(text);
        return;
      }
      await appendReply(text);
    }catch(err){
      console.error(err);
      alert(err.message || '메시지를 보내지 못했습니다.');
    }finally{
      sending = false;
    }
  }

  async function requestAi(ticketId){
    try{
      await callFn(['supportAiReply'], { ticketId });
    }catch(err){
      console.warn('supportAiReply', err);
      const status = Number(err?.status || 0);
      const tip = document.createElement('div');
      tip.className = 'support-chat-system';
      const detail = status === 404
        ? 'AI 서버가 아직 준비되지 않았습니다. 메시지는 저장되었고, 상담사에게 연결할 수 있습니다.'
        : 'AI 답변을 불러오지 못했습니다. 메시지는 저장되었습니다. 상담사에게 연결할 수 있습니다.';
      tip.innerHTML = `<b>안내</b><div>${detail}</div>`;
      body.appendChild(tip);
      if(!actions.querySelector('#supportChatHuman')){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'support-chat-human';
        btn.id = 'supportChatHuman';
        btn.textContent = chatCopy(getLang).human;
        btn.onclick = () => requestHuman().catch(console.error);
        actions.prepend(btn);
      }
    }
  }

  async function requestHuman(){
    const user = getUser();
    if(!user || !activeTicketId) return;
    const db = getDb();
    const fs = getFs();
    const { doc, updateDoc, serverTimestamp, collection, addDoc } = fs;
    await updateDoc(doc(db, 'supportTickets', activeTicketId), {
      conversationMode: MODE.WAITING,
      humanRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      adminRead: false,
      adminNotified: false,
      adminNotifyKind: 'ticket',
      adminNotifyAt: serverTimestamp(),
      lastMessage: '상담사 연결 요청',
      lastMessageAt: serverTimestamp(),
      lastSender: 'user'
    });
    await addDoc(collection(db, 'supportTickets', activeTicketId, 'replies'), {
      uid: user.uid,
      role: 'user',
      displayName: user.displayName || '',
      content: '상담사 연결을 요청했습니다.',
      messageType: 'system',
      createdAt: serverTimestamp()
    });
    try{
      await callFn(['supportAiHandoffSummary'], { ticketId: activeTicketId });
    }catch(err){
      console.warn('supportAiHandoffSummary', err);
    }
  }

  if(typeof onAuthChange === 'function'){
    onAuthChange(() => {
      if(open) ensureSession().catch(console.error);
    });
  }

  // Expose for deep-links
  window.__midiaiOpenSupportChat = (ticketId) => {
    if(ticketId) setActiveTicketId(ticketId);
    setOpen(true);
  };

  // Keep panel open across same-tab page navigations (multi-page site)
  if(restoredUi.open){
    setOpen(true, { persist: false });
  }
}
