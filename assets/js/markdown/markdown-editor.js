/**
 * Professional Markdown CMS Editor — shared mount/modal API.
 * Toast UI when healthy; automatic textarea fallback so typing never breaks.
 */
import {
  renderMarkdown,
  renderMarkdownInto,
  ensureMarkdownCss,
  bindMarkdownInteractions
} from './markdown-renderer.js';
import { createDraftAutosave, loadDraft, clearDraft, saveDraft } from './markdown-draft.js';
import { createMarkdownUploader } from './markdown-upload.js';
import {
  buildExtraToolbar,
  insertAlert,
  insertSpoiler,
  insertTable,
  insertChecklist,
  insertAtCursor,
  promptInternalLink,
  searchInternalDocs,
  containerSnippet,
  wrapSelection
} from './markdown-toolbar-extras.js';
import { adminHoverToolbar, confirmDelete } from '../visual-cms.js';

const TOAST_CSS = 'https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css';
const TOAST_DARK = 'https://uicdn.toast.com/editor/3.2.2/theme/toastui-editor-dark.min.css';
const TOAST_JS = 'https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js';

let _toastReady = null;

/** Normalize content fields from Firestore docs / forms */
export function pickMarkdownSource(docOrValue) {
  if (docOrValue == null) return '';
  if (typeof docOrValue === 'string') return docOrValue;
  const d = docOrValue;
  const keys = ['contentMarkdown', 'content', 'body', 'answer', 'markdown', 'description', 'text'];
  for (const k of keys) {
    if (typeof d[k] === 'string' && d[k].length) return d[k];
  }
  for (const k of keys) {
    if (typeof d[k] === 'string') return d[k];
  }
  return '';
}

function loadCss(href) {
  if (document.querySelector(`link[data-md-css="${href}"]`) || document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.mdCss = href;
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.toastui?.Editor) {
      resolve(window.toastui.Editor);
      return;
    }
    const existing = document.querySelector(`script[data-md-toast="1"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.toastui?.Editor || null));
      existing.addEventListener('error', () => reject(new Error('Toast UI script failed')));
      if (window.toastui?.Editor) resolve(window.toastui.Editor);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.mdToast = '1';
    s.onload = () => resolve(window.toastui?.Editor || null);
    s.onerror = () => reject(new Error('Toast UI script failed'));
    document.head.appendChild(s);
  });
}

async function ensureToastEditor() {
  if (_toastReady) return _toastReady;
  _toastReady = (async () => {
    ensureMarkdownCss();
    loadCss(TOAST_CSS);
    loadCss(TOAST_DARK);
    try {
      return await loadScript(TOAST_JS);
    } catch (e) {
      console.warn('[MarkdownEditor] Toast UI load failed', e);
      return null;
    }
  })();
  return _toastReady;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveHeightPx(height) {
  if (typeof height === 'number' && height > 0) return Math.max(300, height);
  if (typeof height === 'string') {
    const px = parseInt(height, 10);
    if (!Number.isNaN(px) && px > 0) return Math.max(300, px);
  }
  return 420;
}

function waitFrames(n = 2) {
  return new Promise((resolve) => {
    const step = (left) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

function isVisible(el) {
  if (!el || !el.isConnected) return false;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
}

function toastIsHealthy(root) {
  if (!root) return false;
  const cm = root.querySelector('.CodeMirror');
  const ta = root.querySelector('textarea');
  const ww = root.querySelector('.ProseMirror, .toastui-editor-contents [contenteditable="true"]');
  const surface = cm || ta || ww;
  if (!surface) return false;
  const r = surface.getBoundingClientRect();
  return r.height >= 40 && r.width >= 40;
}

function buildBasicToolbar(onAction) {
  const bar = document.createElement('div');
  bar.className = 'md-editor-toolbar-basic';
  const items = [
    ['bold', 'B'], ['italic', 'I'], ['strike', 'S'],
    ['h2', 'H2'], ['ul', '•'], ['ol', '1.'],
    ['check', '☑'], ['code', '</>'], ['quote', '“'],
    ['link', '링크'], ['undo', '↩'], ['redo', '↪']
  ];
  items.forEach(([action, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.mdBasic = action;
    btn.textContent = label;
    btn.title = action;
    bar.appendChild(btn);
  });
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-md-basic]');
    if (!btn) return;
    onAction(btn.dataset.mdBasic);
  });
  return bar;
}

/**
 * Mount editor into a visible host element.
 * Call only after the host is in the DOM and displayed.
 */
export async function mountMarkdownEditor(host, options = {}) {
  if (!host) throw new Error('MarkdownEditor: mount element missing');

  const {
    value = '',
    height = 420,
    draftKey = '',
    storagePrefix = 'cms-md/anon',
    upload,
    showActions = false,
    onChange,
    onCancel,
    onComplete,
    onPreview,
    placeholder = '내용을 입력하세요.',
    // Default false: reliable textarea. Toast used when explicitly enabled + healthy.
    preferToast = false
  } = options;

  ensureMarkdownCss();

  // Destroy any previous instance on this host
  if (host._mdApi) {
    try { host._mdApi.destroy(); } catch (_) { /* ignore */ }
    host._mdApi = null;
  }
  host.innerHTML = '';
  host.classList.add('md-editor-shell');
  host.classList.remove('md-no-split');

  const heightPx = resolveHeightPx(height);
  let toast = null;
  let ta = null;
  let destroyed = false;
  let history = [];
  let historyIdx = -1;

  const getValue = () => {
    try {
      if (toast) return String(toast.getMarkdown() ?? '');
    } catch (_) { /* fall through */ }
    return ta ? String(ta.value ?? '') : '';
  };

  const pushHistory = (v) => {
    const cur = String(v ?? '');
    if (historyIdx >= 0 && history[historyIdx] === cur) return;
    history = history.slice(0, historyIdx + 1);
    history.push(cur);
    if (history.length > 80) history.shift();
    historyIdx = history.length - 1;
  };

  const setValue = (v, { recordHistory = true } = {}) => {
    const s = String(v ?? '');
    if (toast) {
      try { toast.setMarkdown(s); } catch (e) { console.warn(e); }
    }
    if (ta) ta.value = s;
    if (recordHistory) pushHistory(s);
    onChange?.(s);
  };

  const focus = () => {
    try {
      if (toast) {
        toast.focus();
        const cm = host.querySelector('.CodeMirror');
        cm?.CodeMirror?.focus?.();
        return;
      }
      ta?.focus();
    } catch (_) { /* ignore */ }
  };

  const refreshLayout = () => {
    try {
      const cm = host.querySelector('.CodeMirror');
      cm?.CodeMirror?.refresh?.();
      if (toast?.isViewer === false) {
        // force height
        const ui = host.querySelector('.toastui-editor-defaultUI');
        if (ui) ui.style.height = `${heightPx}px`;
      }
      if (ta) {
        ta.style.minHeight = `${Math.max(260, heightPx - 48)}px`;
      }
    } catch (_) { /* ignore */ }
  };

  const getSelection = () => {
    const text = getValue();
    if (ta && document.activeElement === ta) {
      return { start: ta.selectionStart, end: ta.selectionEnd, text };
    }
    if (toast) {
      try {
        // Prefer textarea fallback selection if toast md mode exposes cm
        const cm = host.querySelector('.CodeMirror')?.CodeMirror;
        if (cm) {
          const from = cm.getCursor('from');
          const to = cm.getCursor('to');
          const start = cm.indexFromPos(from);
          const end = cm.indexFromPos(to);
          return { start, end, text };
        }
      } catch (_) { /* ignore */ }
    }
    return { start: text.length, end: text.length, text };
  };

  const setSelection = (next, start, end) => {
    setValue(next, { recordHistory: true });
    if (ta) {
      ta.focus();
      const a = Math.max(0, start ?? next.length);
      const b = Math.max(a, end ?? a);
      ta.setSelectionRange(a, b);
      return;
    }
    if (toast) {
      try {
        const cm = host.querySelector('.CodeMirror')?.CodeMirror;
        if (cm) {
          cm.focus();
          cm.setSelection(cm.posFromIndex(start), cm.posFromIndex(end));
          return;
        }
        toast.setMarkdown(next);
      } catch (_) { /* ignore */ }
    }
    autosave.touch();
  };

  const insertMarkdown = (snippet) => {
    insertAtCursor(getSelection, setSelection, snippet);
    focus();
  };

  const statusEl = document.createElement('div');
  statusEl.className = 'md-editor-status';

  const uploader = createMarkdownUploader({
    storagePrefix,
    upload,
    insertMarkdown,
    onStatus: (m) => { statusEl.textContent = m; }
  });

  let searchFn = async () => [];
  try {
    const { getFirebase } = await import('../visual-cms.js');
    const fb = await getFirebase();
    searchFn = (q) => searchInternalDocs({ db: fb.db, fs: fb.fs }, q);
  } catch (_) { /* optional */ }

  const basicBar = buildBasicToolbar((action) => {
    const g = getSelection;
    const s = setSelection;
    if (action === 'bold') wrapSelection(g, s, '**', '**', '굵게');
    else if (action === 'italic') wrapSelection(g, s, '*', '*', '기울임');
    else if (action === 'strike') wrapSelection(g, s, '~~', '~~', '취소선');
    else if (action === 'h2') insertAtCursor(g, s, '\n## ');
    else if (action === 'ul') insertAtCursor(g, s, '\n- ');
    else if (action === 'ol') insertAtCursor(g, s, '\n1. ');
    else if (action === 'check') insertChecklist(g, s);
    else if (action === 'code') wrapSelection(g, s, '`', '`', 'code');
    else if (action === 'quote') insertAtCursor(g, s, '\n> ');
    else if (action === 'link') {
      const url = prompt('URL', 'https://');
      if (url) wrapSelection(g, s, '[', `](${url})`, '링크');
    } else if (action === 'undo') {
      if (historyIdx > 0) {
        historyIdx -= 1;
        setValue(history[historyIdx], { recordHistory: false });
      }
    } else if (action === 'redo') {
      if (historyIdx < history.length - 1) {
        historyIdx += 1;
        setValue(history[historyIdx], { recordHistory: false });
      }
    }
    focus();
  });
  host.appendChild(basicBar);

  const extras = buildExtraToolbar(async (action) => {
    if (action === 'alert') {
      const kind = prompt('Alert 종류: NOTE / TIP / WARNING / IMPORTANT / CAUTION', 'NOTE') || 'NOTE';
      insertAlert(getSelection, setSelection, kind.toUpperCase());
    } else if (action === 'spoiler') insertSpoiler(getSelection, setSelection);
    else if (action === 'checklist') insertChecklist(getSelection, setSelection);
    else if (action === 'table') insertTable(getSelection, setSelection);
    else if (action === 'image') await uploader.pickImage();
    else if (action === 'video') await uploader.pickVideo();
    else if (action === 'file') await uploader.pickFileAttach();
    else if (action === 'internal') await promptInternalLink(getSelection, setSelection, searchFn);
    else if (action === 'step' || action === 'tip' || action === 'faq') {
      insertAtCursor(getSelection, setSelection, containerSnippet(action));
    }
    focus();
  });
  host.appendChild(extras);

  const editorHost = document.createElement('div');
  editorHost.className = 'md-editor-host';
  editorHost.style.minHeight = `${Math.max(260, heightPx - 40)}px`;
  host.appendChild(editorHost);

  let initial = String(value ?? '');
  if (draftKey) {
    const draft = loadDraft(draftKey);
    if (draft?.value && draft.value !== initial) {
      const restore = confirm('저장된 임시 초안이 있습니다. 복원할까요?');
      if (restore) initial = draft.value;
    }
  }
  pushHistory(initial);

  const autosave = createDraftAutosave(draftKey, getValue);

  const mountTextarea = (text) => {
    editorHost.innerHTML = '';
    toast = null;
    ta = document.createElement('textarea');
    ta.className = 'md-editor-fallback';
    ta.value = text;
    ta.placeholder = placeholder;
    ta.setAttribute('aria-label', '본문');
    ta.spellcheck = true;
    ta.style.minHeight = `${Math.max(260, heightPx - 48)}px`;
    ta.addEventListener('input', () => {
      pushHistory(ta.value);
      onChange?.(ta.value);
      autosave.touch();
    });
    editorHost.appendChild(ta);
    host.classList.add('md-engine-textarea');
    host.classList.remove('md-engine-toast');
    statusEl.textContent = '';
  };

  const mountToast = async (text) => {
    const Editor = preferToast ? await ensureToastEditor() : null;
    if (!Editor) {
      mountTextarea(text);
      return false;
    }
    editorHost.innerHTML = '';
    ta = null;
    try {
      toast = new Editor({
        el: editorHost,
        height: `${heightPx}px`,
        initialValue: text,
        initialEditType: 'markdown',
        previewStyle: 'tab',
        hideModeSwitch: true,
        usageStatistics: false,
        placeholder,
        theme: 'dark',
        autofocus: false,
        toolbarItems: [
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'link'],
          ['code', 'codeblock']
        ],
        hooks: {
          addImageBlobHook: async (blob, callback) => {
            try {
              const file = blob instanceof File
                ? blob
                : new File([blob], `paste-${Date.now()}.png`, { type: blob.type || 'image/png' });
              const { uploadToStorage } = await import('../visual-cms.js');
              const doUpload = upload || uploadToStorage;
              const path = `${storagePrefix.replace(/\/$/, '')}/${Date.now()}_paste.png`;
              const url = await doUpload(path, file);
              callback(url, 'image');
              statusEl.textContent = '업로드 완료';
            } catch (err) {
              console.error(err);
              statusEl.textContent = '이미지 업로드 실패';
              callback('', '');
            }
          }
        },
        events: {
          change: () => {
            onChange?.(getValue());
            autosave.touch();
          }
        }
      });
      host.classList.add('md-engine-toast', 'md-hide-toast-preview-tab');
      host.classList.remove('md-engine-textarea');
      await waitFrames(2);
      refreshLayout();
      if (!toastIsHealthy(editorHost)) {
        console.warn('[MarkdownEditor] Toast UI surface unhealthy — falling back to textarea');
        try { toast.destroy(); } catch (_) { /* ignore */ }
        toast = null;
        mountTextarea(text);
        statusEl.textContent = '편집기를 안전 모드로 전환했습니다.';
        return false;
      }
      return true;
    } catch (e) {
      console.error('[MarkdownEditor] Toast init failed', e);
      mountTextarea(text);
      statusEl.textContent = '편집기 로드 실패 — 안전 모드로 작성하세요.';
      return false;
    }
  };

  if (!isVisible(host) && host.offsetParent === null && getComputedStyle(host).display === 'none') {
    console.warn('[MarkdownEditor] host not visible at mount — delaying');
  }

  await mountToast(initial);

  const unbindPaste = uploader.bindPasteDrop(host);
  host.appendChild(statusEl);

  if (showActions) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'md-editor-actions';
    actionsEl.innerHTML = `
      <button type="button" class="secondary" data-md="cancel">취소</button>
      <button type="button" class="secondary" data-md="preview">미리보기</button>
      <button type="button" class="primary" data-md="complete">완료</button>`;
    actionsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-md]');
      if (!btn) return;
      const act = btn.getAttribute('data-md');
      if (act === 'cancel') onCancel?.();
      else if (act === 'preview') {
        if (onPreview) onPreview(getValue());
        else await openMarkdownPreview({ markdown: getValue() });
      } else if (act === 'complete') {
        autosave.flush();
        onComplete?.(getValue());
      }
    });
    host.appendChild(actionsEl);
  }

  const api = {
    getMarkdown: getValue,
    getValue,
    setMarkdown: (v) => setValue(v),
    setValue,
    focus,
    refreshLayout,
    insertMarkdown,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      autosave.stop();
      unbindPaste?.();
      try { toast?.destroy(); } catch (_) { /* ignore */ }
      toast = null;
      ta = null;
      host._mdApi = null;
      host.innerHTML = '';
      host.classList.remove('md-editor-shell', 'md-engine-toast', 'md-engine-textarea', 'md-hide-toast-preview-tab');
    }
  };
  host._mdApi = api;
  setTimeout(() => { refreshLayout(); focus(); }, 80);
  return api;
}

/** Fullscreen / modal preview — does not save */
export function openMarkdownPreview({ markdown = '', title = '미리보기' } = {}) {
  return new Promise((resolve) => {
    ensureMarkdownCss();
    const backdrop = document.createElement('div');
    backdrop.className = 'md-modal-backdrop';
    backdrop.innerHTML = `
      <div class="md-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="md-modal-head">
          <h3>${esc(title)}</h3>
          <button type="button" class="md-modal-x" data-close aria-label="close">×</button>
        </div>
        <div class="md-modal-preview-body hub-post-detail">
          <div class="post-body-content md-preview-target"></div>
        </div>
        <div class="md-editor-actions">
          <button type="button" class="primary" data-back>편집 계속</button>
        </div>
      </div>`;
    const target = backdrop.querySelector('.md-preview-target');
    renderMarkdownInto(target, markdown);
    const close = () => {
      backdrop.remove();
      resolve();
    };
    backdrop.querySelector('[data-close]').addEventListener('click', close);
    backdrop.querySelector('[data-back]').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
  });
}

/**
 * Shared modal: Cancel / Preview / Complete
 * @returns {Promise<string|null>}
 */
export function openMarkdownEditorModal(options = {}) {
  const {
    title = '본문 작성',
    value = '',
    mode = 'edit',
    draftKey = '',
    storagePrefix = 'cms-md/anon',
    upload,
    height = 420,
    onComplete
  } = options;

  return new Promise(async (resolve) => {
    ensureMarkdownCss();
    const backdrop = document.createElement('div');
    backdrop.className = 'md-modal-backdrop';
    backdrop.innerHTML = `
      <div class="md-modal" role="dialog" aria-modal="true">
        <div class="md-modal-head">
          <h3>${esc(title)}</h3>
          <button type="button" class="md-modal-x" data-close aria-label="close">×</button>
        </div>
        <div class="md-modal-body">
          <div data-editor-root></div>
        </div>
        <div class="md-editor-actions">
          <button type="button" class="secondary" data-cancel>취소</button>
          <button type="button" class="secondary" data-preview>미리보기</button>
          <button type="button" class="primary" data-complete>완료</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    await waitFrames(2);

    const root = backdrop.querySelector('[data-editor-root]');
    let editor = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { editor?.destroy(); } catch (_) { /* ignore */ }
      editor = null;
      backdrop.remove();
      resolve(result);
    };

    try {
      editor = await mountMarkdownEditor(root, {
        value: pickMarkdownSource(value),
        draftKey: mode === 'create' ? draftKey : draftKey,
        storagePrefix,
        upload,
        height: resolveHeightPx(height),
        showActions: false
      });
    } catch (e) {
      console.error(e);
      alert(`편집기를 열 수 없습니다.\n${e.message || e}`);
      finish(null);
      return;
    }

    backdrop.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
    backdrop.querySelector('[data-close]').addEventListener('click', () => finish(null));
    backdrop.querySelector('[data-preview]').addEventListener('click', async () => {
      const md = editor.getMarkdown();
      await openMarkdownPreview({ markdown: md, title: '미리보기' });
      editor.refreshLayout();
      editor.focus();
    });
    backdrop.querySelector('[data-complete]').addEventListener('click', () => {
      if (!editor) {
        alert('편집기가 준비되지 않았습니다.');
        return;
      }
      const md = editor.getMarkdown();
      if (draftKey) clearDraft(draftKey);
      try { onComplete?.(md); } catch (e) {
        console.error(e);
        alert(e.message || String(e));
        return;
      }
      finish(md);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null);
    });
    setTimeout(() => {
      editor?.refreshLayout();
      editor?.focus();
    }, 100);
  });
}

/** Visual CMS long-text field */
export function mountMarkdownField(container, {
  value = '',
  placeholder = '본문 작성',
  editMode = false,
  isAdmin = false,
  draftKey = '',
  storagePrefix = 'cms-md/anon',
  onChange,
  onClear
} = {}) {
  ensureMarkdownCss();
  container.innerHTML = '';
  container.classList.add('vcms-md-field');
  let current = pickMarkdownSource(value);

  const preview = document.createElement('div');
  preview.className = 'vcms-md-preview';
  preview.dataset.placeholder = placeholder;

  const paint = () => {
    if (!current.trim()) {
      container.classList.add('is-empty');
      preview.innerHTML = '';
      if (!editMode || !isAdmin) {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      return;
    }
    container.classList.remove('is-empty');
    container.hidden = false;
    renderMarkdownInto(preview, current);
  };

  const api = {
    getValue: () => current,
    setValue: (v) => { current = pickMarkdownSource(v); paint(); }
  };
  container._mdField = api;
  container.dataset.mdField = '1';

  if (!editMode || !isAdmin) {
    paint();
    container.appendChild(preview);
    return api;
  }

  container.hidden = false;
  paint();
  container.appendChild(preview);

  const tools = adminHoverToolbar([
    { label: current.trim() ? '수정' : '작성', action: 'edit' },
    { label: '삭제', action: 'clear', danger: true }
  ]);
  tools.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.action === 'edit') {
      let uid = 'anon';
      try {
        const { getFirebase } = await import('../visual-cms.js');
        const fb = await getFirebase();
        uid = fb.auth.currentUser?.uid || 'anon';
      } catch (_) { /* ignore */ }
      const md = await openMarkdownEditorModal({
        title: placeholder,
        value: current,
        mode: current.trim() ? 'edit' : 'create',
        draftKey: draftKey || `field:${placeholder}`,
        storagePrefix: storagePrefix.includes('anon') ? `cms-md/${uid}/cms` : storagePrefix
      });
      if (md == null) return;
      current = md;
      paint();
      onChange?.(current);
    }
    if (btn.dataset.action === 'clear') {
      if (!confirmDelete('이 본문을 비울까요? (슬롯은 유지됩니다)')) return;
      current = '';
      paint();
      onClear?.();
      onChange?.('');
    }
  });
  container.appendChild(tools);
  return api;
}

export { renderMarkdown, renderMarkdownInto, bindMarkdownInteractions, saveDraft, loadDraft, clearDraft };
