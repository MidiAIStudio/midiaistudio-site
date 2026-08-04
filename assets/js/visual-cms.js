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

const MEDIA_WIDTHS = ['full', 'md', 'sm'];
const WIDTH_PCT = { full: 100, md: 72, sm: 48 };

export function normalizeMediaWidth(w) {
  return MEDIA_WIDTHS.includes(w) ? w : 'full';
}

export function normalizeMediaWidthPct(pct, legacyWidth) {
  const n = Number(pct);
  if (Number.isFinite(n) && n > 0) return Math.min(100, Math.max(28, n));
  return WIDTH_PCT[normalizeMediaWidth(legacyWidth)] || 100;
}

export function normalizeMediaAspect(a) {
  const n = Number(a);
  if (Number.isFinite(n) && n > 0) return Math.min(3.5, Math.max(0.4, n));
  return 1.6;
}

export function normalizeMediaOverlays(list) {
  if (!Array.isArray(list)) return [];
  return list.map((raw, i) => {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || `ov-${i}-${Math.random().toString(36).slice(2, 7)}`);
    const type = raw.type === 'bubble' ? 'bubble' : raw.type === 'rect' ? 'rect' : '';
    if (!type) return null;
    const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, Number(n) || 0));
    if (type === 'rect') {
      return {
        id,
        type: 'rect',
        x: clamp(raw.x),
        y: clamp(raw.y),
        w: clamp(raw.w, 2, 100),
        h: clamp(raw.h, 2, 100),
        label: String(raw.label || '')
      };
    }
    return {
      id,
      type: 'bubble',
      x: clamp(raw.x),
      y: clamp(raw.y),
      text: String(raw.text || ''),
      side: raw.side === 'right' ? 'right' : 'left'
    };
  }).filter(Boolean);
}

/**
 * Prefer a local File/Blob when we already have one.
 * Do NOT call Storage getBlob here — it often hangs (no timeout) and freezes the
 * "사진 편집" click. Plain HTTPS URLs display fine without crossOrigin.
 */
async function resolveImageSourceForEditor(url, file = null) {
  if (file instanceof Blob) {
    const displayUrl = URL.createObjectURL(file);
    return {
      imageUrl: displayUrl,
      sourceFile: file,
      revokeUrl: displayUrl
    };
  }
  return { imageUrl: url || '', sourceFile: null, revokeUrl: null };
}

/**
 * Media frame that never collapses. Supports image / upload video / youtube,
 * plus mediaWidth + mediaOverlays. Image pick/change opens annotation editor first.
 */
export function mountEditableMedia(container, {
  mediaType = '',
  mediaUrl = '',
  posterUrl = '',
  mediaFit = 'cover',
  mediaWidth = 'full',
  mediaWidthPct,
  mediaAspect,
  mediaOverlays = [],
  editMode = false,
  isAdmin = false,
  videoClass = 'product-video',
  onChange,
  onFile
}) {
  container.innerHTML = '';
  container.classList.add('vcms-media-slot', 'product-feature-media', 'is-free-size');
  container.classList.toggle('is-empty', !mediaUrl);

  let overlays = normalizeMediaOverlays(mediaOverlays);
  let widthPct = normalizeMediaWidthPct(mediaWidthPct, mediaWidth);
  let aspect = normalizeMediaAspect(mediaAspect);
  let pendingImageFile = null;

  const nearestWidthToken = () => {
    if (widthPct >= 90) return 'full';
    if (widthPct >= 60) return 'md';
    return 'sm';
  };

  const emit = () => {
    onChange?.({
      mediaType,
      mediaUrl,
      posterUrl,
      mediaFit,
      mediaWidth: nearestWidthToken(),
      mediaWidthPct: widthPct,
      mediaAspect: aspect,
      mediaOverlays: overlays.map((o) => ({ ...o }))
    });
  };

  const applyChromeClasses = () => {
    container.classList.remove('fit-cover', 'fit-contain', 'fit-center', 'width-full', 'width-md', 'width-sm');
    container.classList.add(
      mediaFit === 'contain' ? 'fit-contain' : mediaFit === 'center' ? 'fit-center' : 'fit-cover'
    );
    container.classList.toggle('has-media', !!mediaUrl);
    container.style.width = `${widthPct}%`;
    container.style.maxWidth = '100%';
    container.style.aspectRatio = String(aspect);
    container.style.setProperty('--vcms-w', `${widthPct}%`);
    container.style.setProperty('--vcms-ar', String(aspect));
    container.style.marginInline = widthPct < 99.5 ? 'auto' : '0';
  };
  applyChromeClasses();

  const body = document.createElement('div');
  body.className = 'vcms-media-body';
  container.appendChild(body);

  const annotLayer = document.createElement('div');
  annotLayer.className = 'vcms-media-annots';
  container.appendChild(annotLayer);

  const paintContent = () => {
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
      body.innerHTML = `<div class="vcms-media-placeholder"><span>${editMode && isAdmin ? '사진 또는 영상 추가' : ''}</span></div>`;
    }
    container.classList.toggle('is-empty', !mediaUrl);
  };

  const paintOverlays = () => {
    annotLayer.classList.remove('is-editable');
    annotLayer.innerHTML = '';
    overlays.forEach((ov) => {
      const el = document.createElement('div');
      el.className = `vcms-annot vcms-annot-${ov.type}`;
      el.dataset.id = ov.id;
      if (ov.type === 'rect') {
        el.style.left = `${ov.x}%`;
        el.style.top = `${ov.y}%`;
        el.style.width = `${ov.w}%`;
        el.style.height = `${ov.h}%`;
        if (ov.label) {
          const lab = document.createElement('span');
          lab.className = 'vcms-annot-label';
          lab.textContent = ov.label;
          el.appendChild(lab);
        }
      } else {
        el.classList.add(ov.side === 'right' ? 'side-right' : 'side-left');
        el.style.left = `${ov.x}%`;
        el.style.top = `${ov.y}%`;
        const bubble = document.createElement('div');
        bubble.className = 'vcms-bubble-text';
        bubble.textContent = ov.text || '말풍선';
        el.appendChild(bubble);
      }
      annotLayer.appendChild(el);
    });
  };

  paintContent();
  paintOverlays();

  if (!editMode || !isAdmin) return;

  const annotBar = document.createElement('div');
  annotBar.className = 'vcms-annot-toolbar';
  annotBar.innerHTML = `
    <button type="button" class="vcms-hover-btn" data-annot="edit" hidden>사진 편집</button>
    <button type="button" class="vcms-hover-btn is-danger" data-annot="clear-media" hidden>사진 제거</button>
    <span class="muted small" data-annot="size-hint">우하단 핸들로 창 크기</span>`;
  container.appendChild(annotBar);

  const slotSe = document.createElement('i');
  slotSe.className = 'vcms-slot-se';
  slotSe.title = '창 크기 조절';
  container.appendChild(slotSe);

  const syncAnnotBar = () => {
    const hasMedia = !!mediaUrl;
    const hasImage = mediaType === 'image' && hasMedia;
    container.classList.toggle('has-media', hasMedia);
    annotBar.querySelector('[data-annot="edit"]').hidden = !hasImage;
    annotBar.querySelector('[data-annot="clear-media"]').hidden = !hasMedia;
    annotBar.querySelector('[data-annot="clear-media"]').textContent =
      mediaType === 'video' || mediaType === 'youtube' ? '영상 제거' : '사진 제거';
    slotSe.hidden = !hasMedia;
  };
  syncAnnotBar();

  slotSe.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const parent = container.parentElement;
    if (!parent) return;
    const parentW = parent.getBoundingClientRect().width || 1;
    const startBox = container.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, w: widthPct, a: aspect };
    const onMove = (ev) => {
      const nextWpx = Math.max(120, startBox.width + (ev.clientX - start.x));
      const nextHpx = Math.max(80, startBox.height + (ev.clientY - start.y));
      widthPct = normalizeMediaWidthPct((nextWpx / parentW) * 100);
      aspect = normalizeMediaAspect(nextWpx / nextHpx);
      applyChromeClasses();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      emit();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

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
        { label: '사진 편집', action: 'edit-image' },
        { label: '영상으로 변경', action: 'add-video' },
        { label: 'YouTube', action: 'add-youtube' },
        { label: '맞춤', action: 'fit' },
        { label: '사진 제거', action: 'clear', danger: true }
      ]
      : [
        { label: '영상 변경', action: mediaType === 'youtube' ? 'add-youtube' : 'add-video' },
        { label: '사진으로 변경', action: 'add-image' },
        { label: mediaType === 'youtube' ? 'URL 변경' : '맞춤', action: mediaType === 'youtube' ? 'add-youtube' : 'fit' },
        { label: '영상 제거', action: 'clear', danger: true }
      ];

  const toolbar = adminHoverToolbar(buttons);
  overlay.appendChild(toolbar);
  container.appendChild(overlay);

  const applyFitCycle = () => {
    const order = ['cover', 'contain', 'center'];
    const next = order[(order.indexOf(mediaFit) + 1) % order.length];
    mediaFit = next;
    applyChromeClasses();
    emit();
  };

  const setMedia = (type, url, poster = '', nextOverlays = null) => {
    mediaType = type;
    mediaUrl = url;
    posterUrl = poster;
    if (type !== 'image') {
      overlays = [];
      pendingImageFile = null;
    } else if (Array.isArray(nextOverlays)) {
      overlays = normalizeMediaOverlays(nextOverlays);
    }
    paintContent();
    paintOverlays();
    applyChromeClasses();
    syncAnnotBar();
    emit();
  };

  const openImageEditor = async (url, file = null, seedOverlays = overlays) => {
    let revokeHydrated = null;
    try {
      const { openMediaAnnotEditor } = await import('./media-annot-editor.js?v=annot-img-fix-19');
      const previewImg = body.querySelector('img');
      const pageSrc = previewImg?.currentSrc || previewImg?.getAttribute('src') || url;
      const resolved = await resolveImageSourceForEditor(pageSrc || url, file);
      revokeHydrated = resolved.revokeUrl;
      const result = await openMediaAnnotEditor({
        imageUrl: resolved.imageUrl,
        overlays: seedOverlays,
        frameAspect: aspect,
        sourceFile: resolved.sourceFile || null
      });
      if (!result) {
        if (revokeHydrated) URL.revokeObjectURL(revokeHydrated);
        if (file && url.startsWith('blob:') && url !== revokeHydrated) URL.revokeObjectURL(url);
        return false;
      }
      // Editor returns a local baked file when possible; otherwise overlays-only on existing URL.
      const nextUrl = result.imageUrl || resolved.imageUrl || url;
      const nextFile = result.file || resolved.sourceFile || file || null;
      if (revokeHydrated && revokeHydrated !== nextUrl) URL.revokeObjectURL(revokeHydrated);
      if (file && url.startsWith('blob:') && url !== nextUrl && url !== revokeHydrated) URL.revokeObjectURL(url);
      pendingImageFile = nextFile || null;
      if (Number.isFinite(Number(result.frameAspect))) {
        aspect = normalizeMediaAspect(result.frameAspect);
        applyChromeClasses();
      }
      setMedia('image', nextUrl, '', Array.isArray(result.overlays) ? result.overlays : []);
      if (result.file) onFile?.({ kind: 'image', file: result.file });
      else if (nextFile) onFile?.({ kind: 'image', file: nextFile });
      else onFile?.({ kind: 'image-edit', file: null });
      return true;
    } catch (err) {
      console.error(err);
      alert(`이미지 편집기를 열 수 없습니다.\n${err?.message || err}`);
      if (revokeHydrated) URL.revokeObjectURL(revokeHydrated);
      if (file && url.startsWith('blob:') && url !== revokeHydrated) URL.revokeObjectURL(url);
      return false;
    }
  };

  const pickAndEditImage = async () => {
    const file = await pickFile('image/*');
    if (!file) return;
    const preview = URL.createObjectURL(file);
    await openImageEditor(preview, file, []);
  };

  annotBar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-annot]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const act = btn.dataset.annot;
    if (act === 'edit') {
      if (mediaType === 'image' && mediaUrl) await openImageEditor(mediaUrl, pendingImageFile, overlays);
      return;
    }
    if (act === 'clear-media') {
      if (!mediaUrl) return;
      const label = mediaType === 'video' || mediaType === 'youtube' ? '영상을 제거할까요?' : '사진을 제거할까요?';
      if (!confirmDelete(`${label} (프레임은 유지됩니다)`)) return;
      overlays = [];
      pendingImageFile = null;
      setMedia('', '');
      onFile?.({ kind: 'clear', file: null });
    }
  });

  toolbar.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const act = btn.dataset.action;
    if (act === 'add-image') await pickAndEditImage();
    if (act === 'edit-image') {
      if (mediaType === 'image' && mediaUrl) await openImageEditor(mediaUrl, pendingImageFile, overlays);
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
      overlays = [];
      pendingImageFile = null;
      setMedia('', '');
      onFile?.({ kind: 'clear', file: null });
    }
  });

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
    if (file.type.startsWith('video/')) {
      const preview = URL.createObjectURL(file);
      setMedia('video', preview);
      onFile?.({ kind: 'video', file });
    } else if (file.type.startsWith('image/')) {
      const preview = URL.createObjectURL(file);
      await openImageEditor(preview, file, []);
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
