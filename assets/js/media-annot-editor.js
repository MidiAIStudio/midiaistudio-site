/**
 * Full-screen image annotation editor (region boxes + speech bubbles).
 * Opens when picking/changing product & guide slot images.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function normalizeMediaOverlays(list) {
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

function pctFromEvent(layer, e) {
  const rect = layer.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
    y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
  };
}

/**
 * @param {{ imageUrl: string, overlays?: any[] }} opts
 * @returns {Promise<{ overlays: any[] } | null>}
 */
export function openMediaAnnotEditor({ imageUrl, overlays = [] }) {
  return new Promise((resolve) => {
    let list = normalizeMediaOverlays(overlays).map((o) => ({ ...o }));
    let selectedId = null;
    let tool = null;

    const root = document.createElement('div');
    root.className = 'vcms-annot-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '사진 편집');
    root.innerHTML = `
      <div class="vcms-annot-modal-panel">
        <header class="vcms-annot-modal-head">
          <div>
            <p class="eyebrow">Image editor</p>
            <h3>사진 편집</h3>
            <p class="muted small">영역 박스·말풍선을 추가한 뒤 적용하세요.</p>
          </div>
          <button type="button" class="ghost mini-btn" data-editor="cancel">취소</button>
        </header>
        <div class="vcms-annot-stage">
          <div class="vcms-annot-canvas">
            <img class="vcms-annot-source" alt="${esc('편집 이미지')}" draggable="false">
            <div class="vcms-media-annots is-editable"></div>
          </div>
        </div>
        <div class="vcms-annot-modal-toolbar">
          <button type="button" class="vcms-hover-btn" data-editor="rect">영역 박스</button>
          <button type="button" class="vcms-hover-btn" data-editor="bubble">말풍선</button>
          <button type="button" class="vcms-hover-btn" data-editor="side" hidden>꼬리: 좌</button>
          <button type="button" class="vcms-hover-btn" data-editor="edit-text" hidden>텍스트</button>
          <button type="button" class="vcms-hover-btn is-danger" data-editor="delete" hidden>주석 삭제</button>
          <span class="vcms-annot-modal-spacer"></span>
          <button type="button" class="secondary mini-btn" data-editor="cancel">취소</button>
          <button type="button" class="primary mini-btn" data-editor="apply">적용</button>
        </div>
      </div>`;

    const img = root.querySelector('.vcms-annot-source');
    const layer = root.querySelector('.vcms-media-annots');
    const bar = root.querySelector('.vcms-annot-modal-toolbar');
    img.src = imageUrl;

    const finish = (value) => {
      window.removeEventListener('keydown', onKey);
      root.remove();
      document.body.classList.remove('vcms-annot-modal-open');
      resolve(value);
    };

    const syncBar = () => {
      const sel = list.find((o) => o.id === selectedId);
      bar.querySelector('[data-editor="rect"]').classList.toggle('is-active', tool === 'rect');
      bar.querySelector('[data-editor="bubble"]').classList.toggle('is-active', tool === 'bubble');
      bar.querySelector('[data-editor="side"]').hidden = !(sel && sel.type === 'bubble');
      bar.querySelector('[data-editor="edit-text"]').hidden = !sel;
      bar.querySelector('[data-editor="delete"]').hidden = !sel;
      if (sel?.type === 'bubble') {
        bar.querySelector('[data-editor="side"]').textContent = sel.side === 'right' ? '꼬리: 우' : '꼬리: 좌';
      }
      root.classList.toggle('is-annotating', !!tool);
    };

    const paint = () => {
      layer.innerHTML = '';
      list.forEach((ov) => {
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
          if (selectedId === ov.id) {
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
        layer.appendChild(el);
      });
      syncBar();
    };

    const editText = () => {
      const sel = list.find((o) => o.id === selectedId);
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
      paint();
    };

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-editor]');
      if (!btn) return;
      const act = btn.dataset.editor;
      if (act === 'cancel') return finish(null);
      if (act === 'apply') return finish({ overlays: list.map((o) => ({ ...o })) });
      if (act === 'rect' || act === 'bubble') {
        tool = tool === act ? null : act;
        selectedId = null;
        paint();
        return;
      }
      if (act === 'side') {
        const sel = list.find((o) => o.id === selectedId);
        if (!sel || sel.type !== 'bubble') return;
        sel.side = sel.side === 'right' ? 'left' : 'right';
        paint();
        return;
      }
      if (act === 'edit-text') return editText();
      if (act === 'delete' && selectedId) {
        list = list.filter((o) => o.id !== selectedId);
        selectedId = null;
        paint();
      }
    });

    layer.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('[data-handle]');
      const annotEl = e.target.closest('.vcms-annot');
      if (handle && annotEl) {
        e.preventDefault();
        const ov = list.find((o) => o.id === annotEl.dataset.id);
        if (!ov || ov.type !== 'rect') return;
        selectedId = ov.id;
        tool = null;
        const orig = { x: ov.x, y: ov.y, w: ov.w, h: ov.h };
        const corner = handle.dataset.handle;
        const onMove = (ev) => {
          const p = pctFromEvent(layer, ev);
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
          paint();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        paint();
        return;
      }
      if (annotEl && !tool) {
        e.preventDefault();
        const ov = list.find((o) => o.id === annotEl.dataset.id);
        if (!ov) return;
        selectedId = ov.id;
        const start = pctFromEvent(layer, e);
        const origX = ov.x;
        const origY = ov.y;
        const onMove = (ev) => {
          const p = pctFromEvent(layer, ev);
          const dx = p.x - start.x;
          const dy = p.y - start.y;
          if (ov.type === 'rect') {
            ov.x = Math.min(100 - ov.w, Math.max(0, origX + dx));
            ov.y = Math.min(100 - ov.h, Math.max(0, origY + dy));
          } else {
            ov.x = Math.min(100, Math.max(0, origX + dx));
            ov.y = Math.min(100, Math.max(0, origY + dy));
          }
          paint();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        paint();
        return;
      }
      if (tool === 'rect') {
        e.preventDefault();
        const start = pctFromEvent(layer, e);
        const draft = { id: newOverlayId(), type: 'rect', x: start.x, y: start.y, w: 2, h: 2, label: '' };
        list = [...list, draft];
        selectedId = draft.id;
        const onMove = (ev) => {
          const p = pctFromEvent(layer, ev);
          draft.x = Math.min(start.x, p.x);
          draft.y = Math.min(start.y, p.y);
          draft.w = Math.max(2, Math.abs(p.x - start.x));
          draft.h = Math.max(2, Math.abs(p.y - start.y));
          paint();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          tool = null;
          paint();
          const label = prompt('영역 라벨 (선택)', '');
          if (label != null && label.trim()) {
            draft.label = String(label).slice(0, 80);
            paint();
          }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        paint();
        return;
      }
      if (tool === 'bubble') {
        e.preventDefault();
        const p = pctFromEvent(layer, e);
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
        list = [...list, ov];
        selectedId = ov.id;
        tool = null;
        paint();
      }
    });

    layer.addEventListener('dblclick', (e) => {
      const annotEl = e.target.closest('.vcms-annot');
      if (!annotEl) return;
      selectedId = annotEl.dataset.id;
      editText();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') finish(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement?.tagName !== 'INPUT') {
        list = list.filter((o) => o.id !== selectedId);
        selectedId = null;
        paint();
      }
    };
    window.addEventListener('keydown', onKey);

    document.body.appendChild(root);
    document.body.classList.add('vcms-annot-modal-open');
    paint();
  });
}
