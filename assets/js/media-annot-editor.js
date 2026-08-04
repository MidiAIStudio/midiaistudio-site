/**
 * Image editor: fixed template frame, SE zoom/pan, free crop, annotations.
 * Apply returns local blob/url only — no server calls.
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

function newOverlayId() {
  return `ov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function pctFromEl(el, e) {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100)
  };
}

function loadImage(url, withCors = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (withCors && /^https?:/i.test(url)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

/**
 * Visible region of natural image inside a cover+zoom+pan frame.
 * panX/panY = focal point in image (0–1). zoom >= 1 relative to cover.
 */
function visibleSourceRect(nw, nh, fw, fh, zoom, panX, panY) {
  const z = Math.max(1, zoom);
  const cover = Math.max(fw / nw, fh / nh);
  const scale = cover * z;
  const dispW = nw * scale;
  const dispH = nh * scale;
  let left = fw / 2 - panX * dispW;
  let top = fh / 2 - panY * dispH;
  // clamp so frame stays filled when possible
  if (dispW >= fw) left = clamp(left, fw - dispW, 0);
  else left = (fw - dispW) / 2;
  if (dispH >= fh) top = clamp(top, fh - dispH, 0);
  else top = (fh - dispH) / 2;

  const sx = clamp((-left) / scale, 0, nw);
  const sy = clamp((-top) / scale, 0, nh);
  const sw = clamp(fw / scale, 1, nw - sx);
  const sh = clamp(fh / scale, 1, nh - sy);
  return { sx, sy, sw, sh, left, top, dispW, dispH, scale };
}

async function sourceBitmap(sourceUrl, sourceFile = null) {
  if (sourceFile instanceof Blob) {
    return createImageBitmap(sourceFile);
  }
  if (sourceUrl.startsWith('blob:') || sourceUrl.startsWith('data:')) {
    const img = await loadImage(sourceUrl, false);
    return createImageBitmap(img);
  }
  try {
    const res = await fetch(sourceUrl, { mode: 'cors', credentials: 'omit', cache: 'reload' });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return createImageBitmap(await res.blob());
  } catch (fetchErr) {
    try {
      const img = await loadImage(sourceUrl, true);
      return createImageBitmap(img);
    } catch (_) {
      throw new Error(`이미지를 읽을 수 없습니다. (CORS/네트워크: ${fetchErr.message || fetchErr})`);
    }
  }
}

async function bakeToFile(sourceUrl, region, outW, outH, sourceFile = null) {
  const bmp = await sourceBitmap(sourceUrl, sourceFile);
  const canvas = document.createElement('canvas');
  const w = Math.max(2, Math.round(outW));
  const h = Math.max(2, Math.round(outH));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bmp, region.sx, region.sy, region.sw, region.sh, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
  });
  if (!blob) throw new Error('canvas bake failed (possibly CORS-tainted)');
  const file = new File([blob], `media-${Date.now()}.jpg`, { type: 'image/jpeg' });
  const imageUrl = URL.createObjectURL(blob);
  return { file, imageUrl };
}

/**
 * @param {{ imageUrl: string, overlays?: any[], frameAspect?: number, sourceFile?: Blob|null }} opts
 * @returns {Promise<{ overlays: any[], file: File|null, imageUrl: string, frameAspect: number } | null>}
 */
export function openMediaAnnotEditor({ imageUrl, overlays = [], frameAspect: seedAspect = 1.6, sourceFile = null }) {
  return new Promise((resolve) => {
    let list = normalizeMediaOverlays(overlays).map((o) => ({ ...o }));
    let selectedId = null;
    let tool = null; // 'rect' | 'bubble' | null
    let uiMode = 'transform'; // 'transform' | 'crop'
    let zoom = 1.15;
    let panX = 0.5;
    let panY = 0.5;
    let crop = { x: 10, y: 10, w: 80, h: 80 }; // % of natural image
    let natural = { w: 0, h: 0 };
    let frameAspect = clamp(Number(seedAspect) || 1.6, 0.45, 3.2);
    const bakeSourceFile = sourceFile instanceof Blob ? sourceFile : null;

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
            <p class="muted small">우하단으로 미리보기 창·사진 크기를 조절하고, 잘라내기는 기본 크롭 스킨으로 영역을 잡은 뒤 적용하세요. (저장은 페이지 저장 버튼)</p>
          </div>
          <button type="button" class="ghost mini-btn" data-editor="cancel">취소</button>
        </header>
        <div class="vcms-annot-stage">
          <div class="vcms-annot-workspace" data-workspace>
            <div class="vcms-annot-frame" data-frame>
              <img class="vcms-annot-source" alt="${esc('편집 이미지')}" draggable="false">
              <div class="vcms-media-annots is-editable" data-annots></div>
              <i class="vcms-annot-frame-se" data-se title="창·사진 크기"></i>
            </div>
            <div class="vcms-annot-crop-layer" data-crop-layer hidden>
              <img class="vcms-annot-crop-source" alt="" draggable="false">
              <div class="vcms-annot-crop-box" data-crop-box>
                <div class="vcms-crop-grid" aria-hidden="true"></div>
                <i class="vcms-crop-h" data-crop-h="nw"></i>
                <i class="vcms-crop-h" data-crop-h="n"></i>
                <i class="vcms-crop-h" data-crop-h="ne"></i>
                <i class="vcms-crop-h" data-crop-h="e"></i>
                <i class="vcms-crop-h" data-crop-h="se"></i>
                <i class="vcms-crop-h" data-crop-h="s"></i>
                <i class="vcms-crop-h" data-crop-h="sw"></i>
                <i class="vcms-crop-h" data-crop-h="w"></i>
              </div>
            </div>
          </div>
        </div>
        <div class="vcms-annot-modal-toolbar">
          <button type="button" class="vcms-hover-btn is-active" data-editor="transform">크기/위치</button>
          <button type="button" class="vcms-hover-btn" data-editor="crop">잘라내기</button>
          <button type="button" class="vcms-hover-btn" data-editor="rect">영역 박스</button>
          <button type="button" class="vcms-hover-btn" data-editor="bubble">말풍선</button>
          <button type="button" class="vcms-hover-btn" data-editor="side" hidden>꼬리: 좌</button>
          <button type="button" class="vcms-hover-btn" data-editor="edit-text" hidden>텍스트 수정</button>
          <button type="button" class="vcms-hover-btn is-danger" data-editor="delete" hidden>주석 삭제</button>
          <span class="vcms-annot-modal-spacer"></span>
          <button type="button" class="secondary mini-btn" data-editor="cancel">취소</button>
          <button type="button" class="primary mini-btn" data-editor="apply">적용</button>
        </div>
      </div>`;

    const workspace = root.querySelector('[data-workspace]');
    const frame = root.querySelector('[data-frame]');
    const img = root.querySelector('.vcms-annot-source');
    const layer = root.querySelector('[data-annots]');
    const se = root.querySelector('[data-se]');
    const cropLayer = root.querySelector('[data-crop-layer]');
    const cropImg = root.querySelector('.vcms-annot-crop-source');
    const cropBox = root.querySelector('[data-crop-box]');
    const bar = root.querySelector('.vcms-annot-modal-toolbar');
    if (/^https?:/i.test(imageUrl)) {
      img.crossOrigin = 'anonymous';
      cropImg.crossOrigin = 'anonymous';
    }
    img.src = imageUrl;
    cropImg.src = imageUrl;

    const applyWorkspaceAspect = () => {
      workspace.style.aspectRatio = String(clamp(frameAspect, 0.45, 3.2));
    };
    applyWorkspaceAspect();

    const onResize = () => {
      layoutImage();
      layoutCrop();
    };

    const finish = (value) => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      root.remove();
      document.body.classList.remove('vcms-annot-modal-open');
      resolve(value);
    };

    const layoutImage = () => {
      if (!natural.w || uiMode === 'crop') return;
      const fr = frame.getBoundingClientRect();
      const fw = fr.width;
      const fh = fr.height;
      if (!fw || !fh) return;
      const vis = visibleSourceRect(natural.w, natural.h, fw, fh, zoom, panX, panY);
      img.style.width = `${vis.dispW}px`;
      img.style.height = `${vis.dispH}px`;
      img.style.left = `${vis.left}px`;
      img.style.top = `${vis.top}px`;
    };

    const layoutCrop = () => {
      if (uiMode !== 'crop' || !natural.w) return;
      const host = cropLayer.getBoundingClientRect();
      if (!host.width) return;
      // Fit full image into crop layer (contain)
      const scale = Math.min(host.width / natural.w, host.height / natural.h);
      const dispW = natural.w * scale;
      const dispH = natural.h * scale;
      const left = (host.width - dispW) / 2;
      const top = (host.height - dispH) / 2;
      cropImg.style.width = `${dispW}px`;
      cropImg.style.height = `${dispH}px`;
      cropImg.style.left = `${left}px`;
      cropImg.style.top = `${top}px`;
      cropBox.style.left = `${left + (crop.x / 100) * dispW}px`;
      cropBox.style.top = `${top + (crop.y / 100) * dispH}px`;
      cropBox.style.width = `${(crop.w / 100) * dispW}px`;
      cropBox.style.height = `${(crop.h / 100) * dispH}px`;
    };

    const syncModeUi = () => {
      const cropping = uiMode === 'crop';
      frame.hidden = cropping;
      cropLayer.hidden = !cropping;
      se.hidden = cropping || !!tool;
      root.classList.toggle('is-cropping', cropping);
      root.classList.toggle('is-annotating', !!tool && !cropping);
      root.classList.toggle('is-panning-mode', uiMode === 'transform' && !tool && !cropping);
      bar.querySelector('[data-editor="transform"]').classList.toggle('is-active', uiMode === 'transform' && !tool);
      bar.querySelector('[data-editor="crop"]').classList.toggle('is-active', uiMode === 'crop');
      bar.querySelector('[data-editor="rect"]').classList.toggle('is-active', tool === 'rect');
      bar.querySelector('[data-editor="bubble"]').classList.toggle('is-active', tool === 'bubble');
      if (cropping) layoutCrop();
      else layoutImage();
    };

    const syncBar = () => {
      const sel = list.find((o) => o.id === selectedId);
      bar.querySelector('[data-editor="side"]').hidden = !(sel && sel.type === 'bubble');
      bar.querySelector('[data-editor="edit-text"]').hidden = !sel || uiMode === 'crop';
      bar.querySelector('[data-editor="delete"]').hidden = !sel || uiMode === 'crop';
      if (sel?.type === 'bubble') {
        bar.querySelector('[data-editor="side"]').textContent = sel.side === 'right' ? '꼬리: 우' : '꼬리: 좌';
      }
      if (sel) {
        bar.querySelector('[data-editor="edit-text"]').textContent =
          sel.type === 'rect' ? '설명 수정' : '텍스트 수정';
      }
      syncModeUi();
    };

    const paintAnnots = () => {
      layer.innerHTML = '';
      if (uiMode === 'crop') {
        syncBar();
        return;
      }
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
        const next = prompt('영역 설명', sel.label || '');
        if (next == null) return;
        sel.label = String(next);
      } else {
        const next = prompt('말풍선 텍스트', sel.text || '');
        if (next == null) return;
        sel.text = String(next);
      }
      paintAnnots();
    };

    const applyAsync = async () => {
      const applyBtn = bar.querySelector('[data-editor="apply"]');
      if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = '적용 중…';
      }
      try {
        const nextOverlays = uiMode === 'crop' ? [] : list.map((o) => ({ ...o }));

        // Annotations / frame aspect must never depend on canvas bake (CORS breaks Firebase URLs).
        // Only crop rewrites pixels; transform bake is optional when a local file exists.
        if (uiMode !== 'crop') {
          let outFile = bakeSourceFile || null;
          let outUrl = imageUrl;
          if (bakeSourceFile && natural.w && natural.h) {
            try {
              const fr = frame.getBoundingClientRect();
              if (fr.width > 2 && fr.height > 2) {
                const vis = visibleSourceRect(natural.w, natural.h, fr.width, fr.height, zoom, panX, panY);
                const baked = await bakeToFile(
                  imageUrl,
                  { sx: vis.sx, sy: vis.sy, sw: vis.sw, sh: vis.sh },
                  Math.min(1600, Math.round(fr.width * 2)),
                  Math.min(1600, Math.round(fr.height * 2)),
                  bakeSourceFile
                );
                outFile = baked.file;
                outUrl = baked.imageUrl;
              }
            } catch (bakeErr) {
              console.warn('optional framing bake skipped', bakeErr);
            }
          }
          finish({
            overlays: nextOverlays,
            file: outFile,
            imageUrl: outUrl,
            frameAspect
          });
          return;
        }

        if (!natural.w || !natural.h) {
          throw new Error('이미지가 아직 로드되지 않았습니다. 잠시 후 다시 시도해 주세요.');
        }
        const region = {
          sx: (crop.x / 100) * natural.w,
          sy: (crop.y / 100) * natural.h,
          sw: (crop.w / 100) * natural.w,
          sh: (crop.h / 100) * natural.h
        };
        const outW = Math.min(1600, Math.max(2, Math.round(region.sw)));
        const outH = Math.min(1600, Math.max(2, Math.round(region.sh)));
        const baked = await bakeToFile(imageUrl, region, outW, outH, bakeSourceFile);
        finish({
          overlays: nextOverlays,
          file: baked.file,
          imageUrl: baked.imageUrl,
          frameAspect
        });
      } catch (err) {
        console.error(err);
        alert(`이미지 적용에 실패했습니다.\n${err?.message || err}`);
        if (applyBtn) {
          applyBtn.disabled = false;
          applyBtn.textContent = '적용';
        }
      }
    };

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-editor]');
      if (!btn) return;
      const act = btn.dataset.editor;
      if (act === 'cancel') return finish(null);
      if (act === 'apply') return void applyAsync();
      if (act === 'transform') {
        uiMode = 'transform';
        tool = null;
        selectedId = null;
        paintAnnots();
        return;
      }
      if (act === 'crop') {
        uiMode = 'crop';
        tool = null;
        selectedId = null;
        paintAnnots();
        return;
      }
      if (act === 'rect' || act === 'bubble') {
        uiMode = 'transform';
        tool = tool === act ? null : act;
        selectedId = null;
        paintAnnots();
        return;
      }
      if (act === 'side') {
        const sel = list.find((o) => o.id === selectedId);
        if (!sel || sel.type !== 'bubble') return;
        sel.side = sel.side === 'right' ? 'left' : 'right';
        paintAnnots();
        return;
      }
      if (act === 'edit-text') return editText();
      if (act === 'delete' && selectedId) {
        list = list.filter((o) => o.id !== selectedId);
        selectedId = null;
        paintAnnots();
      }
    });

    // Pan: annot layer sits above the image, so drag on empty frame/layer space.
    const beginPan = (e) => {
      if (uiMode !== 'transform' || tool) return false;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const origPanX = panX;
      const origPanY = panY;
      const fr = frame.getBoundingClientRect();
      const vis = visibleSourceRect(natural.w, natural.h, fr.width, fr.height, zoom, panX, panY);
      // Allow a little pan even near cover by ensuring zoom headroom.
      if (zoom < 1.02) zoom = 1.08;
      const dispW = Math.max(1, vis.dispW);
      const dispH = Math.max(1, vis.dispH);
      frame.classList.add('is-panning');
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        panX = clamp(origPanX - dx / dispW, 0, 1);
        panY = clamp(origPanY - dy / dispH, 0, 1);
        layoutImage();
      };
      const onUp = () => {
        frame.classList.remove('is-panning');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return true;
    };

    frame.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-se]')) return;
      if (e.target.closest('.vcms-annot')) return;
      beginPan(e);
    });

    // SE: free window aspect + image zoom
    se.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uiMode = 'transform';
      tool = null;
      const startX = e.clientX;
      const startY = e.clientY;
      const startZoom = zoom;
      const startAspect = frameAspect;
      const box = workspace.getBoundingClientRect();
      const onMove = (ev) => {
        const zoomDelta = ((ev.clientX - startX) + (ev.clientY - startY)) / 220;
        zoom = clamp(startZoom + zoomDelta, 1, 5);
        const nextW = Math.max(160, box.width + (ev.clientX - startX));
        const nextH = Math.max(100, box.height + (ev.clientY - startY));
        frameAspect = clamp(nextW / nextH, 0.45, 3.2);
        // blend: prefer drag direction — if mostly vertical, aspect from startAspect * ratio
        if (Math.abs(ev.clientY - startY) > 8 || Math.abs(ev.clientX - startX) > 8) {
          frameAspect = clamp(startAspect * (nextW / box.width) / (nextH / box.height), 0.45, 3.2);
        }
        applyWorkspaceAspect();
        layoutImage();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      paintAnnots();
    });

    // Classic crop: move + 8-handle resize
    cropBox.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('[data-crop-h]');
      const host = cropImg.getBoundingClientRect();
      if (!host.width || !host.height) return;
      e.preventDefault();
      e.stopPropagation();
      const start = { x: e.clientX, y: e.clientY };
      const orig = { ...crop };

      if (handle) {
        const corner = handle.dataset.cropH;
        const onMove = (ev) => {
          const dx = ((ev.clientX - start.x) / host.width) * 100;
          const dy = ((ev.clientY - start.y) / host.height) * 100;
          let x1 = orig.x;
          let y1 = orig.y;
          let x2 = orig.x + orig.w;
          let y2 = orig.y + orig.h;
          if (corner.includes('w')) x1 = orig.x + dx;
          if (corner.includes('e')) x2 = orig.x + orig.w + dx;
          if (corner.includes('n')) y1 = orig.y + dy;
          if (corner.includes('s')) y2 = orig.y + orig.h + dy;
          // edge-only handles
          if (corner === 'n' || corner === 's') { /* x unchanged */ }
          if (corner === 'e' || corner === 'w') { /* y unchanged via only one axis */ }
          x1 = clamp(x1, 0, 95);
          y1 = clamp(y1, 0, 95);
          x2 = clamp(x2, 5, 100);
          y2 = clamp(y2, 5, 100);
          crop.x = Math.min(x1, x2);
          crop.y = Math.min(y1, y2);
          crop.w = Math.max(5, Math.abs(x2 - x1));
          crop.h = Math.max(5, Math.abs(y2 - y1));
          if (crop.x + crop.w > 100) crop.w = 100 - crop.x;
          if (crop.y + crop.h > 100) crop.h = 100 - crop.y;
          layoutCrop();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return;
      }

      const onMove = (ev) => {
        const dx = ((ev.clientX - start.x) / host.width) * 100;
        const dy = ((ev.clientY - start.y) / host.height) * 100;
        crop.x = clamp(orig.x + dx, 0, 100 - orig.w);
        crop.y = clamp(orig.y + dy, 0, 100 - orig.h);
        layoutCrop();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Annotations
    layer.addEventListener('mousedown', (e) => {
      if (uiMode === 'crop') return;
      const handle = e.target.closest('[data-handle]');
      const annotEl = e.target.closest('.vcms-annot');

      if (handle && annotEl) {
        e.preventDefault();
        e.stopPropagation();
        const ov = list.find((o) => o.id === annotEl.dataset.id);
        if (!ov || ov.type !== 'rect') return;
        selectedId = ov.id;
        tool = null;
        const orig = { x: ov.x, y: ov.y, w: ov.w, h: ov.h };
        const corner = handle.dataset.handle;
        const onMove = (ev) => {
          const p = pctFromEl(layer, ev);
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
          paintAnnots();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        paintAnnots();
        return;
      }

      if (annotEl) {
        e.preventDefault();
        e.stopPropagation();
        const ov = list.find((o) => o.id === annotEl.dataset.id);
        if (!ov) return;
        selectedId = ov.id;
        tool = null;
        const start = pctFromEl(layer, e);
        const origX = ov.x;
        const origY = ov.y;
        const onMove = (ev) => {
          const p = pctFromEl(layer, ev);
          const dx = p.x - start.x;
          const dy = p.y - start.y;
          if (ov.type === 'rect') {
            ov.x = clamp(origX + dx, 0, 100 - ov.w);
            ov.y = clamp(origY + dy, 0, 100 - ov.h);
          } else {
            ov.x = clamp(origX + dx, 0, 100);
            ov.y = clamp(origY + dy, 0, 100);
          }
          paintAnnots();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        paintAnnots();
        return;
      }

      if (tool === 'rect') {
        e.preventDefault();
        const start = pctFromEl(layer, e);
        const draft = { id: newOverlayId(), type: 'rect', x: start.x, y: start.y, w: 2, h: 2, label: '' };
        list = [...list, draft];
        selectedId = draft.id;
        const onMove = (ev) => {
          const p = pctFromEl(layer, ev);
          draft.x = Math.min(start.x, p.x);
          draft.y = Math.min(start.y, p.y);
          draft.w = Math.max(2, Math.abs(p.x - start.x));
          draft.h = Math.max(2, Math.abs(p.y - start.y));
          paintAnnots();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          tool = null;
          paintAnnots();
          const label = prompt('영역 설명 (선택)', '');
          if (label != null && label.trim()) {
            draft.label = String(label).trim();
            paintAnnots();
          }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        paintAnnots();
        return;
      }

      if (tool === 'bubble') {
        e.preventDefault();
        const p = pctFromEl(layer, e);
        const text = prompt('말풍선 텍스트', '여기');
        if (text == null) return;
        list = [...list, {
          id: newOverlayId(),
          type: 'bubble',
          x: p.x,
          y: p.y,
          text: String(text).trim() || '말풍선',
          side: 'left'
        }];
        selectedId = list[list.length - 1].id;
        tool = null;
        paintAnnots();
        return;
      }

      // Empty space: pan the photo (layer covers the image).
      if (beginPan(e)) return;
      if (selectedId) {
        selectedId = null;
        paintAnnots();
      }
    });

    layer.addEventListener('dblclick', (e) => {
      const annotEl = e.target.closest('.vcms-annot');
      if (!annotEl || uiMode === 'crop') return;
      selectedId = annotEl.dataset.id;
      tool = null;
      paintAnnots();
      editText();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (tool || selectedId) {
          tool = null;
          selectedId = null;
          paintAnnots();
          return;
        }
        finish(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        e.preventDefault();
        list = list.filter((o) => o.id !== selectedId);
        selectedId = null;
        paintAnnots();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);

    document.body.appendChild(root);
    document.body.classList.add('vcms-annot-modal-open');

    const boot = () => {
      natural = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
      if (!natural.w || !natural.h) {
        natural = { w: 1600, h: 1000 };
      }
      layoutImage();
      paintAnnots();
    };
    if (img.complete && img.naturalWidth) boot();
    else img.addEventListener('load', boot, { once: true });
  });
}
