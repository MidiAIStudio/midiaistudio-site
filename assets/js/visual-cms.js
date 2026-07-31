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
const WIDTH_LABEL = { full: '전체', md: '중간', sm: '작게' };

export function normalizeMediaWidth(w) {
  return MEDIA_WIDTHS.includes(w) ? w : 'full';
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
        label: String(raw.label || '').slice(0, 80)
      };
    }
    return {
      id,
      type: 'bubble',
      x: clamp(raw.x),
      y: clamp(raw.y),
      text: String(raw.text || '').slice(0, 120),
      side: raw.side === 'right' ? 'right' : 'left'
    };
  }).filter(Boolean);
}

function newOverlayId() {
  return `ov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Media frame that never collapses. Supports image / upload video / youtube,
 * plus mediaWidth + mediaOverlays (rect / speech bubble) on images.
 */
export function mountEditableMedia(container, {
  mediaType = '',
  mediaUrl = '',
  posterUrl = '',
  mediaFit = 'cover',
  mediaWidth = 'full',
  mediaOverlays = [],
  editMode = false,
  isAdmin = false,
  videoClass = 'product-video',
  onChange,
  onFile
}) {
  container.innerHTML = '';
  container.classList.add('vcms-media-slot', 'product-feature-media');
  container.classList.toggle('is-empty', !mediaUrl);

  let overlays = normalizeMediaOverlays(mediaOverlays);
  let width = normalizeMediaWidth(mediaWidth);
  let selectedId = null;
  let tool = null; // 'rect' | 'bubble' | null
  let drawState = null;

  const emit = () => {
    onChange?.({
      mediaType,
      mediaUrl,
      posterUrl,
      mediaFit,
      mediaWidth: width,
      mediaOverlays: overlays.map((o) => ({ ...o }))
    });
  };

  const applyChromeClasses = () => {
    container.classList.remove('fit-cover', 'fit-contain', 'fit-center', 'width-full', 'width-md', 'width-sm');
    container.classList.add(
      mediaFit === 'contain' ? 'fit-contain' : mediaFit === 'center' ? 'fit-center' : 'fit-cover'
    );
    container.classList.add(`width-${width}`);
    container.classList.toggle('is-annotating', !!tool);
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

  const pctFromEvent = (e) => {
    const rect = annotLayer.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    };
  };

  const paintOverlays = () => {
    const canEdit = editMode && isAdmin && mediaType === 'image' && !!mediaUrl;
    annotLayer.classList.toggle('is-editable', canEdit);
    annotLayer.innerHTML = '';
    overlays.forEach((ov) => {
      const el = document.createElement('div');
      el.className = `vcms-annot vcms-annot-${ov.type}${selectedId === ov.id ? ' is-selected' : ''}`;
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
        if (canEdit && selectedId === ov.id) {
          ['nw', 'ne', 'sw', 'se'].forEach((h) => {
            const handle = document.createElement('i');
            handle.className = `vcms-annot-handle vcms-annot-handle-${h}`;
            handle.dataset.handle = h;
            el.appendChild(handle);
          });
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

  // Public / preview: overlays only
  if (!editMode || !isAdmin) return;

  const annotBar = document.createElement('div');
  annotBar.className = 'vcms-annot-toolbar';
  annotBar.innerHTML = `
    <button type="button" class="vcms-hover-btn" data-annot="width">크기: ${WIDTH_LABEL[width]}</button>
    <button type="button" class="vcms-hover-btn" data-annot="rect">영역</button>
    <button type="button" class="vcms-hover-btn" data-annot="bubble">말풍선</button>
    <button type="button" class="vcms-hover-btn" data-annot="side" hidden>꼬리</button>
    <button type="button" class="vcms-hover-btn" data-annot="edit-text" hidden>텍스트</button>
    <button type="button" class="vcms-hover-btn is-danger" data-annot="delete" hidden>삭제</button>`;
  container.appendChild(annotBar);

  const syncAnnotBar = () => {
    const sel = overlays.find((o) => o.id === selectedId);
    const hasImage = mediaType === 'image' && !!mediaUrl;
    annotBar.querySelector('[data-annot="rect"]').hidden = !hasImage;
    annotBar.querySelector('[data-annot="bubble"]').hidden = !hasImage;
    annotBar.querySelector('[data-annot="width"]').textContent = `크기: ${WIDTH_LABEL[width]}`;
    annotBar.querySelector('[data-annot="rect"]').classList.toggle('is-active', tool === 'rect');
    annotBar.querySelector('[data-annot="bubble"]').classList.toggle('is-active', tool === 'bubble');
    annotBar.querySelector('[data-annot="side"]').hidden = !(sel && sel.type === 'bubble');
    annotBar.querySelector('[data-annot="edit-text"]').hidden = !sel;
    annotBar.querySelector('[data-annot="delete"]').hidden = !sel;
    if (sel?.type === 'bubble') {
      annotBar.querySelector('[data-annot="side"]').textContent = sel.side === 'right' ? '꼬리: 우' : '꼬리: 좌';
    }
  };
  syncAnnotBar();

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
    applyChromeClasses();
    emit();
  };

  const setMedia = (type, url, poster = '') => {
    mediaType = type;
    mediaUrl = url;
    posterUrl = poster;
    if (type !== 'image') {
      overlays = [];
      selectedId = null;
      tool = null;
    }
    paintContent();
    paintOverlays();
    applyChromeClasses();
    syncAnnotBar();
    emit();
  };

  const editSelectedText = () => {
    const sel = overlays.find((o) => o.id === selectedId);
    if (!sel) return;
    if (sel.type === 'rect') {
      const next = prompt('영역 라벨', sel.label || '');
      if (next == null) return;
      sel.label = String(next).slice(0, 80);
    } else {
      const next = prompt('말풍선 텍스트', sel.text || '');
      if (next == null) return;
      sel.text = String(next).slice(0, 120);
    }
    paintOverlays();
    emit();
  };

  annotBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-annot]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const act = btn.dataset.annot;
    if (act === 'width') {
      width = MEDIA_WIDTHS[(MEDIA_WIDTHS.indexOf(width) + 1) % MEDIA_WIDTHS.length];
      applyChromeClasses();
      syncAnnotBar();
      emit();
      return;
    }
    if (act === 'rect' || act === 'bubble') {
      tool = tool === act ? null : act;
      selectedId = null;
      applyChromeClasses();
      paintOverlays();
      syncAnnotBar();
      return;
    }
    if (act === 'side') {
      const sel = overlays.find((o) => o.id === selectedId);
      if (!sel || sel.type !== 'bubble') return;
      sel.side = sel.side === 'right' ? 'left' : 'right';
      paintOverlays();
      syncAnnotBar();
      emit();
      return;
    }
    if (act === 'edit-text') {
      editSelectedText();
      return;
    }
    if (act === 'delete') {
      if (!selectedId) return;
      overlays = overlays.filter((o) => o.id !== selectedId);
      selectedId = null;
      paintOverlays();
      syncAnnotBar();
      emit();
    }
  });

  // Annotation interactions
  annotLayer.addEventListener('mousedown', (e) => {
    if (!(editMode && isAdmin && mediaType === 'image' && mediaUrl)) return;
    const handle = e.target.closest('[data-handle]');
    const annotEl = e.target.closest('.vcms-annot');
    if (handle && annotEl) {
      e.preventDefault();
      e.stopPropagation();
      const ov = overlays.find((o) => o.id === annotEl.dataset.id);
      if (!ov || ov.type !== 'rect') return;
      selectedId = ov.id;
      tool = null;
      const start = pctFromEvent(e);
      const orig = { x: ov.x, y: ov.y, w: ov.w, h: ov.h };
      const corner = handle.dataset.handle;
      const onMove = (ev) => {
        const p = pctFromEvent(ev);
        let x1 = orig.x;
        let y1 = orig.y;
        let x2 = orig.x + orig.w;
        let y2 = orig.y + orig.h;
        if (corner.includes('w')) x1 = p.x;
        if (corner.includes('e')) x2 = p.x;
        if (corner.includes('n')) y1 = p.y;
        if (corner.includes('s')) y2 = p.y;
        ov.x = Math.min(x1, x2);
        ov.y = Math.min(y1, y2);
        ov.w = Math.max(2, Math.abs(x2 - x1));
        ov.h = Math.max(2, Math.abs(y2 - y1));
        paintOverlays();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        emit();
        syncAnnotBar();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      paintOverlays();
      syncAnnotBar();
      return;
    }
    if (annotEl && !tool) {
      e.preventDefault();
      e.stopPropagation();
      const ov = overlays.find((o) => o.id === annotEl.dataset.id);
      if (!ov) return;
      selectedId = ov.id;
      const start = pctFromEvent(e);
      const origX = ov.x;
      const origY = ov.y;
      const onMove = (ev) => {
        const p = pctFromEvent(ev);
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        if (ov.type === 'rect') {
          ov.x = Math.min(100 - ov.w, Math.max(0, origX + dx));
          ov.y = Math.min(100 - ov.h, Math.max(0, origY + dy));
        } else {
          ov.x = Math.min(100, Math.max(0, origX + dx));
          ov.y = Math.min(100, Math.max(0, origY + dy));
        }
        paintOverlays();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        emit();
        syncAnnotBar();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      paintOverlays();
      syncAnnotBar();
      return;
    }
    if (tool === 'rect') {
      e.preventDefault();
      e.stopPropagation();
      const start = pctFromEvent(e);
      const id = newOverlayId();
      drawState = { id, x0: start.x, y0: start.y };
      const draft = { id, type: 'rect', x: start.x, y: start.y, w: 2, h: 2, label: '' };
      overlays = [...overlays.filter((o) => o.id !== id), draft];
      selectedId = id;
      const onMove = (ev) => {
        const p = pctFromEvent(ev);
        draft.x = Math.min(drawState.x0, p.x);
        draft.y = Math.min(drawState.y0, p.y);
        draft.w = Math.max(2, Math.abs(p.x - drawState.x0));
        draft.h = Math.max(2, Math.abs(p.y - drawState.y0));
        paintOverlays();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        tool = null;
        applyChromeClasses();
        paintOverlays();
        syncAnnotBar();
        emit();
        const label = prompt('영역 라벨 (선택)', '');
        if (label != null && label.trim()) {
          draft.label = String(label).slice(0, 80);
          paintOverlays();
          emit();
        }
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      paintOverlays();
      syncAnnotBar();
      return;
    }
    if (tool === 'bubble') {
      e.preventDefault();
      e.stopPropagation();
      const p = pctFromEvent(e);
      const text = prompt('말풍선 텍스트', '여기');
      if (text == null) return;
      const ov = {
        id: newOverlayId(),
        type: 'bubble',
        x: p.x,
        y: p.y,
        text: String(text).slice(0, 120) || '말풍선',
        side: 'left'
      };
      overlays = [...overlays, ov];
      selectedId = ov.id;
      tool = null;
      applyChromeClasses();
      paintOverlays();
      syncAnnotBar();
      emit();
    }
  });

  annotLayer.addEventListener('dblclick', (e) => {
    const annotEl = e.target.closest('.vcms-annot');
    if (!annotEl) return;
    selectedId = annotEl.dataset.id;
    syncAnnotBar();
    editSelectedText();
  });

  const onKey = (e) => {
    if (!container.isConnected) {
      window.removeEventListener('keydown', onKey);
      return;
    }
    if (e.key === 'Escape') {
      tool = null;
      selectedId = null;
      applyChromeClasses();
      paintOverlays();
      syncAnnotBar();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement === document.body) {
      overlays = overlays.filter((o) => o.id !== selectedId);
      selectedId = null;
      paintOverlays();
      syncAnnotBar();
      emit();
    }
  };
  window.addEventListener('keydown', onKey);

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
      overlays = [];
      selectedId = null;
      tool = null;
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
