/**
 * Shared Visual CMS primitives for Guide + Product pages.
 */
const CONFIG = window.MIDIAI_CONFIG || {};
const FB = 'https://www.gstatic.com/firebasejs/10.12.5';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : '';
}

export function pickFile(accept = 'image/*,video/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

export function confirmDelete(message, { double = false } = {}) {
  if (!confirm(message)) return false;
  if (double && !confirm('정말 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return false;
  return true;
}

/** Save status bar controller */
export function createSaveStatus(elOrId) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  let dirty = false;
  return {
    get dirty() { return dirty; },
    setDirty(v) {
      dirty = !!v;
      if (!el) return;
      el.textContent = dirty ? '● 저장되지 않은 변경사항' : '✓ 저장 완료';
      el.classList.toggle('is-dirty', dirty);
      el.classList.toggle('is-saved', !dirty);
    },
    bindUnload() {
      const handler = (e) => {
        if (!dirty) return;
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  };
}

export function adminHoverToolbar(buttons) {
  const wrap = document.createElement('div');
  wrap.className = 'vcms-hover-toolbar';
  wrap.setAttribute('role', 'toolbar');
  buttons.forEach(({ label, action, danger }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `vcms-hover-btn${danger ? ' is-danger' : ''}`;
    btn.textContent = label;
    btn.dataset.action = action;
    wrap.appendChild(btn);
  });
  return wrap;
}

/**
 * Editable text slot. Keeps placeholder for admins when empty.
 * @param {object} opts
 */
export function mountEditableText(container, {
  tag = 'p',
  className = '',
  value = '',
  placeholder = '작성',
  editMode = false,
  isAdmin = false,
  multiline = false,
  onChange,
  onClear
}) {
  container.innerHTML = '';
  container.classList.add('vcms-text-slot');
  const empty = !String(value || '').trim();

  if (!editMode || !isAdmin) {
    if (empty) {
      container.classList.add('is-empty-public');
      container.hidden = true;
      return;
    }
    container.hidden = false;
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (multiline) el.innerHTML = esc(value).replace(/\n/g, '<br>');
    else el.textContent = value;
    container.appendChild(el);
    return;
  }

  container.hidden = false;
  container.classList.toggle('is-empty', empty);
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.contentEditable = 'true';
  el.dataset.placeholder = placeholder;
  el.textContent = value || '';
  if (empty) el.classList.add('vcms-placeholder-text');

  const tools = adminHoverToolbar([
    { label: empty ? '작성' : '수정', action: 'edit' },
    { label: '삭제', action: 'clear', danger: true }
  ]);
  tools.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (btn.dataset.action === 'edit') {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (btn.dataset.action === 'clear') {
      if (!confirmDelete('이 텍스트를 비울까요? (슬롯은 유지됩니다)')) return;
      el.textContent = '';
      el.classList.add('vcms-placeholder-text');
      container.classList.add('is-empty');
      onClear?.();
      onChange?.('');
    }
  });

  el.addEventListener('focus', () => el.classList.remove('vcms-placeholder-text'));
  el.addEventListener('input', () => {
    const v = el.textContent || '';
    container.classList.toggle('is-empty', !v.trim());
    onChange?.(v);
  });
  el.addEventListener('blur', () => {
    if (!(el.textContent || '').trim()) el.classList.add('vcms-placeholder-text');
  });

  container.appendChild(el);
  container.appendChild(tools);
}

export function mountEditableFeatureList(container, {
  features = [],
  editMode = false,
  isAdmin = false,
  onChange
}) {
  container.innerHTML = '';
  container.classList.add('vcms-feature-slot');
  const list = document.createElement('ul');
  list.className = 'product-points';

  const emit = (next) => onChange?.(next);

  if (!editMode || !isAdmin) {
    const visible = (features || []).filter((f) => String(f || '').trim());
    if (!visible.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    visible.forEach((f) => {
      const li = document.createElement('li');
      li.textContent = f;
      list.appendChild(li);
    });
    container.appendChild(list);
    return;
  }

  container.hidden = false;
  const rows = [...(features || [])];
  if (!rows.length) rows.push('');

  const render = () => {
    list.innerHTML = '';
    rows.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'vcms-feature-row';
      const text = document.createElement('span');
      text.contentEditable = 'true';
      text.dataset.placeholder = '기능 항목';
      text.textContent = f;
      if (!String(f || '').trim()) text.classList.add('vcms-placeholder-text');
      text.addEventListener('input', () => {
        rows[i] = text.textContent || '';
        emit([...rows]);
      });
      const tools = adminHoverToolbar([
        { label: '수정', action: 'edit' },
        { label: '위로', action: 'up' },
        { label: '아래로', action: 'down' },
        { label: '삭제', action: 'del', danger: true }
      ]);
      tools.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.action;
        if (act === 'edit') text.focus();
        if (act === 'up' && i > 0) {
          [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
          emit([...rows]);
          render();
        }
        if (act === 'down' && i < rows.length - 1) {
          [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
          emit([...rows]);
          render();
        }
        if (act === 'del') {
          if (!confirmDelete('이 기능 항목을 비울까요?')) return;
          rows.splice(i, 1);
          if (!rows.length) rows.push('');
          emit([...rows]);
          render();
        }
      });
      li.appendChild(text);
      li.appendChild(tools);
      list.appendChild(li);
    });
  };

  render();
  container.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'secondary mini-btn vcms-add-feature';
  addBtn.textContent = '항목 추가';
  addBtn.addEventListener('click', () => {
    rows.push('새 기능');
    emit([...rows]);
    render();
  });
  container.appendChild(addBtn);
}

/**
 * Media frame that never collapses. Supports image / upload video / youtube.
 */
export function mountEditableMedia(container, {
  mediaType = '',
  mediaUrl = '',
  posterUrl = '',
  mediaFit = 'cover',
  editMode = false,
  isAdmin = false,
  videoClass = 'product-video',
  onChange,
  onFile
}) {
  container.innerHTML = '';
  container.classList.add('vcms-media-slot', 'product-feature-media');
  container.classList.toggle('is-empty', !mediaUrl);

  const fitClass = mediaFit === 'contain' ? 'fit-contain' : mediaFit === 'center' ? 'fit-center' : 'fit-cover';
  container.classList.add(fitClass);

  const paintContent = () => {
    const body = container.querySelector('.vcms-media-body') || document.createElement('div');
    body.className = 'vcms-media-body';
    body.innerHTML = '';
    if (mediaType === 'youtube' && mediaUrl) {
      const id = youtubeId(mediaUrl) || mediaUrl;
      body.innerHTML = `<iframe src="https://www.youtube.com/embed/${esc(id)}" title="video" allowfullscreen loading="lazy"></iframe>`;
    } else if (mediaType === 'video' && mediaUrl) {
      const v = document.createElement('video');
      v.className = videoClass;
      v.src = mediaUrl;
      if (posterUrl) v.poster = posterUrl;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      body.appendChild(v);
    } else if (mediaType === 'image' && mediaUrl) {
      const img = document.createElement('img');
      img.src = mediaUrl;
      img.alt = '';
      img.loading = 'lazy';
      body.appendChild(img);
    } else {
      body.innerHTML = `<div class="vcms-media-placeholder"><span>사진 또는 영상 추가</span></div>`;
    }
    if (!container.contains(body)) container.appendChild(body);
  };

  paintContent();

  if (!editMode || !isAdmin) return;

  const overlay = document.createElement('div');
  overlay.className = 'vcms-media-overlay';
  const empty = !mediaUrl;
  const buttons = empty
    ? [
      { label: '사진 추가', action: 'add-image' },
      { label: '영상 추가', action: 'add-video' },
      { label: 'YouTube', action: 'add-youtube' }
    ]
    : mediaType === 'image'
      ? [
        { label: '사진 변경', action: 'add-image' },
        { label: '영상으로 변경', action: 'add-video' },
        { label: 'YouTube', action: 'add-youtube' },
        { label: '맞춤', action: 'fit' },
        { label: '삭제', action: 'clear', danger: true }
      ]
      : [
        { label: '영상 변경', action: mediaType === 'youtube' ? 'add-youtube' : 'add-video' },
        { label: '사진으로 변경', action: 'add-image' },
        { label: mediaType === 'youtube' ? 'URL 변경' : '맞춤', action: mediaType === 'youtube' ? 'add-youtube' : 'fit' },
        { label: '삭제', action: 'clear', danger: true }
      ];

  const toolbar = adminHoverToolbar(buttons);
  overlay.appendChild(toolbar);
  container.appendChild(overlay);

  const applyFitCycle = () => {
    const order = ['cover', 'contain', 'center'];
    const next = order[(order.indexOf(mediaFit) + 1) % order.length];
    mediaFit = next;
    container.classList.remove('fit-cover', 'fit-contain', 'fit-center');
    container.classList.add(next === 'contain' ? 'fit-contain' : next === 'center' ? 'fit-center' : 'fit-cover');
    onChange?.({ mediaType, mediaUrl, posterUrl, mediaFit });
  };

  const setMedia = (type, url, poster = '') => {
    mediaType = type;
    mediaUrl = url;
    posterUrl = poster;
    container.classList.toggle('is-empty', !url);
    paintContent();
    onChange?.({ mediaType, mediaUrl, posterUrl, mediaFit });
  };

  toolbar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const act = btn.dataset.action;
    if (act === 'add-image') {
      const file = await pickFile('image/*');
      if (!file) return;
      const preview = URL.createObjectURL(file);
      setMedia('image', preview);
      onFile?.({ kind: 'image', file });
    }
    if (act === 'add-video') {
      const file = await pickFile('video/*');
      if (!file) return;
      const preview = URL.createObjectURL(file);
      setMedia('video', preview);
      onFile?.({ kind: 'video', file });
    }
    if (act === 'add-youtube') {
      const url = prompt('YouTube URL', mediaType === 'youtube' ? mediaUrl : '');
      if (!url) return;
      const id = youtubeId(url);
      if (!id) { alert('올바른 YouTube URL이 아닙니다.'); return; }
      setMedia('youtube', url);
      onFile?.({ kind: 'youtube', file: null });
    }
    if (act === 'fit') applyFitCycle();
    if (act === 'clear') {
      if (!confirmDelete('미디어를 비울까요? (프레임은 유지됩니다)')) return;
      setMedia('', '');
      onFile?.({ kind: 'clear', file: null });
    }
  });

  // drag & drop images/videos
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    container.classList.add('dragover');
  });
  container.addEventListener('dragleave', () => container.classList.remove('dragover'));
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    container.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      setMedia('video', preview);
      onFile?.({ kind: 'video', file });
    } else if (file.type.startsWith('image/')) {
      setMedia('image', preview);
      onFile?.({ kind: 'image', file });
    }
  });
}

let _fb = null;

export async function getFirebase() {
  if (_fb) return _fb;
  if (!CONFIG.firebase?.apiKey) throw new Error('Firebase config missing');
  const [{ initializeApp, getApps, getApp }, authMod, fsMod, stMod] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-auth.js`),
    import(`${FB}/firebase-firestore.js`),
    import(`${FB}/firebase-storage.js`)
  ]);
  const app = getApps().length ? getApp() : initializeApp(CONFIG.firebase);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  const storage = stMod.getStorage(app);
  _fb = { app, auth, db, storage, fs: fsMod, st: stMod, authMod };
  return _fb;
}

export async function waitForAdmin() {
  const { auth, db, fs, authMod } = await getFirebase();
  return new Promise((resolve) => {
    const unsub = authMod.onAuthStateChanged(auth, async (user) => {
      unsub();
      let isAdmin = false;
      if (user) {
        try {
          const snap = await fs.getDoc(fs.doc(db, 'users', user.uid));
          isAdmin = snap.exists() && snap.data()?.role === 'admin';
        } catch (e) { console.error(e); }
      }
      resolve({ user, isAdmin });
    });
  });
}

export function onAuthAdmin(cb) {
  return getFirebase().then(({ auth, db, fs, authMod }) => {
    return authMod.onAuthStateChanged(auth, async (user) => {
      let isAdmin = false;
      if (user) {
        try {
          const snap = await fs.getDoc(fs.doc(db, 'users', user.uid));
          isAdmin = snap.exists() && snap.data()?.role === 'admin';
        } catch (e) { console.error(e); }
      }
      cb({ user, isAdmin });
    });
  });
}

export async function uploadToStorage(path, file) {
  const { storage, st } = await getFirebase();
  const { ref, uploadBytes, getDownloadURL } = st;
  const r = ref(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  return getDownloadURL(r);
}

/** Long-body Markdown field (hybrid Visual CMS). Lazy-loaded to avoid cycles. */
export async function mountMarkdownField(container, options) {
  const { mountMarkdownField: mount } = await import('./markdown/markdown-editor.js');
  return mount(container, options);
}
