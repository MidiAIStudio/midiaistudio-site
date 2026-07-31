/**
 * Professional Markdown CMS Editor — Toast UI (markdown-only) + on-demand preview.
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
  containerSnippet
} from './markdown-toolbar-extras.js';
import { adminHoverToolbar, confirmDelete } from '../visual-cms.js';

const TOAST_CSS = 'https://uicdn.toast.com/editor/latest/toastui-editor.min.css';
const TOAST_DARK = 'https://uicdn.toast.com/editor/latest/theme/toastui-editor-dark.min.css';
const TOAST_JS = 'https://uicdn.toast.com/editor/latest/toastui-editor-all.min.js';

let _toastReady = null;

function loadCss(href) {
  if ([...document.styleSheets].some((s) => s.href === href)) return;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.toastui?.Editor) {
      resolve(window.toastui.Editor);
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.toastui.Editor));
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(window.toastui?.Editor);
    s.onerror = reject;
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
      const Editor = await loadScript(TOAST_JS);
      return Editor || null;
    } catch (e) {
      console.warn('Toast UI Editor load failed, using fallback textarea', e);
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

/**
 * Mount editor into host element.
 * @returns {{ getValue, setValue, focus, destroy, insertMarkdown }}
 */
export async function mountMarkdownEditor(host, options = {}) {
  const {
    value = '',
    height = '420px',
    draftKey = '',
    storagePrefix = 'cms-md/anon',
    upload,
    showActions = false,
    onChange,
    onCancel,
    onComplete,
    onPreview,
    placeholder = 'Markdown으로 작성하세요…'
  } = options;

  ensureMarkdownCss();
  host.innerHTML = '';
  host.classList.add('md-editor-shell', 'md-no-split');

  const Editor = await ensureToastEditor();
  let toast = null;
  let ta = null;
  let destroyed = false;

  const getValue = () => {
    if (toast) return toast.getMarkdown();
    return ta?.value || '';
  };
  const setValue = (v) => {
    const s = String(v ?? '');
    if (toast) toast.setMarkdown(s);
    else if (ta) ta.value = s;
  };
  const focus = () => {
    try {
      if (toast) toast.focus();
      else ta?.focus();
    } catch (_) { /* ignore */ }
  };

  const getSelection = () => {
    const text = getValue();
    if (toast) {
      try {
        const sel = toast.getSelection();
        if (Array.isArray(sel) && sel.length >= 2) {
          // Toast returns [start, end] as cm positions or offsets depending on version
          const start = typeof sel[0] === 'number' ? sel[0] : 0;
          const end = typeof sel[1] === 'number' ? sel[1] : start;
          return { start, end, text };
        }
      } catch (_) { /* fall through */ }
    }
    if (ta) return { start: ta.selectionStart, end: ta.selectionEnd, text };
    return { start: text.length, end: text.length, text };
  };

  const setSelection = (next, start, end) => {
    setValue(next);
    if (ta) {
      ta.focus();
      ta.setSelectionRange(start, end);
    } else if (toast) {
      try {
        toast.setSelection(start, end);
      } catch (_) { /* ignore */ }
    }
    onChange?.(getValue());
    autosave.touch();
  };

  const insertMarkdown = (snippet) => {
    insertAtCursor(getSelection, setSelection, snippet.startsWith('\n') ? snippet : snippet);
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
  host.appendChild(editorHost);

  let initial = String(value ?? '');
  if (draftKey) {
    const draft = loadDraft(draftKey);
    if (draft?.value && draft.value !== initial) {
      const restore = confirm('저장된 임시 초안이 있습니다. 복원할까요?');
      if (restore) initial = draft.value;
    }
  }

  const autosave = createDraftAutosave(draftKey, getValue);

  if (Editor) {
    toast = new Editor({
      el: editorHost,
      height,
      initialValue: initial,
      initialEditType: 'markdown',
      previewStyle: 'tab',
      hideModeSwitch: true,
      usageStatistics: false,
      placeholder,
      theme: 'dark',
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
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
            const ts = Date.now();
            const path = `${storagePrefix.replace(/\/$/, '')}/${ts}_paste.png`;
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
  } else {
    ta = document.createElement('textarea');
    ta.className = 'md-editor-fallback';
    ta.value = initial;
    ta.placeholder = placeholder;
    ta.addEventListener('input', () => {
      onChange?.(getValue());
      autosave.touch();
    });
    editorHost.appendChild(ta);
  }

  // Fix double-insert: recreate uploader for hook without insert, use separate for toolbar
  // Simpler fix: for Toast hook, upload only and callback
  if (toast) {
    toast.off?.('change');
    // Re-bind image hook properly by replacing — Toast doesn't easily allow.
    // Instead patch: remove the insert from hook path by customizing.
  }

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

  return {
    getValue,
    setValue,
    focus,
    insertMarkdown,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      autosave.stop();
      unbindPaste?.();
      try { toast?.destroy(); } catch (_) { /* ignore */ }
      host.innerHTML = '';
    }
  };
}

/** Fullscreen / modal preview matching site styles */
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
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        close();
      }
    });
    document.body.appendChild(backdrop);
  });
}

/**
 * Modal editor: Cancel / Preview / Complete
 * @returns {Promise<string|null>} markdown or null if cancelled
 */
export function openMarkdownEditorModal(options = {}) {
  const {
    title = '본문 작성',
    value = '',
    draftKey = '',
    storagePrefix = 'cms-md/anon',
    upload,
    height = 'min(58vh, 520px)'
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
    const root = backdrop.querySelector('[data-editor-root]');
    let editor = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { editor?.destroy(); } catch (_) { /* ignore */ }
      backdrop.remove();
      resolve(result);
    };

    editor = await mountMarkdownEditor(root, {
      value,
      draftKey,
      storagePrefix,
      upload,
      height: typeof height === 'number' ? `${height}px` : height,
      showActions: false
    });

    backdrop.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
    backdrop.querySelector('[data-close]').addEventListener('click', () => finish(null));
    backdrop.querySelector('[data-preview]').addEventListener('click', async () => {
      await openMarkdownPreview({ markdown: editor.getValue(), title: '미리보기' });
    });
    backdrop.querySelector('[data-complete]').addEventListener('click', () => {
      const md = editor.getValue();
      if (draftKey) clearDraft(draftKey);
      options.onComplete?.(md);
      finish(md);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null);
    });
    setTimeout(() => editor?.focus(), 60);
  });
}

/**
 * Visual CMS long-text field: public render + admin [수정] modal.
 */
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
  let current = String(value ?? '');
  const empty = !current.trim();

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
    setValue: (v) => { current = String(v ?? ''); paint(); }
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
    { label: empty ? '작성' : '수정', action: 'edit' },
    { label: '삭제', action: 'clear', danger: true }
  ]);
  tools.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.action === 'edit') {
      const uid = (await import('../visual-cms.js').then((m) => m.getFirebase()).then((fb) => fb.auth.currentUser?.uid).catch(() => null)) || 'anon';
      const md = await openMarkdownEditorModal({
        title: placeholder,
        value: current,
        draftKey: draftKey || `field:${placeholder}`,
        storagePrefix: storagePrefix || `cms-md/${uid}/cms`
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
