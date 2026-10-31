/**
 * Professional Markdown CMS Editor — shared mount/modal API.
 * Toast UI when healthy; automatic textarea fallback so typing never breaks.
 */
import {
  renderMarkdown,
  renderMarkdownInto,
  ensureMarkdownCss,
  bindMarkdownInteractions,
  wrapAdjacentImages,
  findLastImageAnchor,
  pairLastTwoImages,
  isImageOnlyBlock
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
} from './markdown-toolbar-extras.js?v=hub-md-list-2';
import { adminHoverToolbar, confirmDelete } from '../visual-cms.js';

const TOAST_CSS_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/toastui-editor.min.css',
  'https://uicdn.toast.com/editor/3.2.2/toastui-editor.min.css'
];
const TOAST_DARK_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/theme/toastui-editor-dark.min.css',
  'https://uicdn.toast.com/editor/3.2.2/theme/toastui-editor-dark.min.css'
];
const TOAST_JS_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/@toast-ui/editor@3.2.2/dist/toastui-editor-all.min.js',
  'https://uicdn.toast.com/editor/3.2.2/toastui-editor-all.min.js'
];

let _toastReady = null;
let _turndownReady = null;
let _turndownInstance = null;
const promptedDraftKeys = new Set();

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

function loadScript(src, marker = 'data-md-toast') {
  return new Promise((resolve, reject) => {
    if (window.toastui?.Editor) {
      resolve(window.toastui.Editor);
      return;
    }
    const existing = document.querySelector(`script[${marker}="1"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.toastui?.Editor || null));
      existing.addEventListener('error', () => reject(new Error('Toast UI script failed')));
      if (window.toastui?.Editor) resolve(window.toastui.Editor);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute(marker, '1');
    s.onload = () => resolve(window.toastui?.Editor || null);
    s.onerror = () => reject(new Error('Toast UI script failed'));
    document.head.appendChild(s);
  });
}

async function ensureToastEditor() {
  if (_toastReady) return _toastReady;
  _toastReady = (async () => {
    ensureMarkdownCss();
    TOAST_CSS_CANDIDATES.forEach(loadCss);
    TOAST_DARK_CANDIDATES.forEach(loadCss);
    for (const src of TOAST_JS_CANDIDATES) {
      try {
        const Editor = await loadScript(src, 'data-md-toast');
        if (Editor) return Editor;
      } catch (e) {
        console.warn('[MarkdownEditor] Toast UI CDN failed', src, e);
        document.querySelectorAll('script[data-md-toast="1"]').forEach((el) => el.remove());
      }
    }
    return null;
  })();
  return _toastReady;
}

async function ensureTurndown() {
  if (_turndownReady) return _turndownReady;
  _turndownReady = (async () => {
    try {
      const mod = await import('https://esm.sh/turndown@7.2.0');
      const TurndownService = mod.default || mod.TurndownService;
      const td = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
        br: '  \n'
      });
      td.addRule('keepImages', {
        filter: 'img',
        replacement: (_content, node) => {
          const alt = node.getAttribute('alt') || 'image';
          const src = node.getAttribute('src') || '';
          if (!src) return '';
          return `![${alt}](${src})`;
        }
      });
      td.addRule('keepVideo', {
        filter: (node) => node.nodeName === 'VIDEO',
        replacement: (_content, node) => {
          const src = node.getAttribute('src') || node.querySelector?.('source')?.getAttribute('src') || '';
          if (!src) return '';
          return `![video](${src})`;
        }
      });
      // Keep tight lists — blank lines between - items break editing round-trips.
      td.addRule('tightLists', {
        filter: ['ul', 'ol'],
        replacement: (content, node) => {
          const ordered = node.nodeName === 'OL';
          const items = [...node.children].filter((el) => el.nodeName === 'LI');
          if (!items.length) return content;
          const body = items.map((li, i) => {
            const inner = liInnerMarkdown(li);
            return ordered ? `${i + 1}. ${inner}` : `- ${inner}`;
          }).join('\n');
          return `\n\n${body}\n\n`;
        }
      });
      _turndownInstance = td;
      return td;
    } catch (e) {
      console.warn('[MarkdownEditor] turndown load failed', e);
      return null;
    }
  })();
  return _turndownReady;
}

/** Inline markdown for a list item — no blank lines that would split the list. */
function liInnerMarkdown(li) {
  const bits = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      bits.push(String(node.textContent || '').replace(/\s+/g, ' '));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      bits.push(' ');
      return;
    }
    if (tag === 'strong' || tag === 'b') {
      bits.push('**');
      node.childNodes.forEach(walk);
      bits.push('**');
      return;
    }
    if (tag === 'em' || tag === 'i') {
      bits.push('*');
      node.childNodes.forEach(walk);
      bits.push('*');
      return;
    }
    if (tag === 'code') {
      bits.push('`');
      bits.push(String(node.textContent || ''));
      bits.push('`');
      return;
    }
    if (tag === 'a') {
      const href = node.getAttribute('href') || '';
      bits.push('[');
      node.childNodes.forEach(walk);
      bits.push(`](${href})`);
      return;
    }
    if (tag === 'p' || tag === 'div' || tag === 'span') {
      node.childNodes.forEach(walk);
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      // nested lists: flatten lightly
      [...node.children].forEach((child) => {
        if (child.nodeName === 'LI') bits.push(` ${String(child.textContent || '').trim()}`);
      });
      return;
    }
    node.childNodes.forEach(walk);
  };
  li.childNodes.forEach(walk);
  return bits.join('').replace(/[ \t]{2,}/g, ' ').trim();
}

const LIST_ITEM_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+/;
const LIST_MARKER_ONLY_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]*$/;

/**
 * Ensure a non-list paragraph after a list starts its own block (blank line).
 * Without this, markdown-it (breaks:true) absorbs "- a\\nText" into the last <li>.
 */
function separateListFromFollowingParagraph(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  const isBlank = (line) => /^\s*$/.test(line);
  const isListLine = (line) => LIST_ITEM_RE.test(line) || LIST_MARKER_ONLY_RE.test(line);
  const isIndentedCont = (line) => /^\s{2,}\S/.test(line);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = out.length ? out[out.length - 1] : null;
    if (
      prev != null &&
      !isBlank(prev) &&
      isListLine(prev) &&
      !isBlank(line) &&
      !isListLine(line) &&
      !isIndentedCont(line)
    ) {
      out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Keep consecutive bullet/numbered items tight (no blank line between). */
function normalizeMarkdownLists(md) {
  let out = String(md || '');
  // Fix broken "-\ntext" from contenteditable <br> after the marker — single newline only.
  // Do NOT collapse across blank lines (that would swallow a following paragraph).
  out = out.replace(/^([ \t]*[-*+] )[ \t]*\n(?!\n)[ \t]*/gm, '$1');
  out = out.replace(/^([ \t]*\d+\. )[ \t]*\n(?!\n)[ \t]*/gm, '$1');
  out = out.replace(/^([ \t]*[-*+])[ \t]*\n(?!\n)(?=\S)/gm, '$1 ');
  // Paragraph after a list must be separated so it does not stay inside the last <li>.
  out = separateListFromFollowingParagraph(out);
  // Drop empty marker-only lines left before a following paragraph ("- \\n\\nText").
  out = out.replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]*\n(?=[ \t]*\n)/gm, '');
  // Remove blank lines between consecutive list items: "\n\n- " / "\n\n1. "
  out = out.replace(/\n[ \t]*\n+(\s*[-*+] )/g, '\n$1');
  out = out.replace(/\n[ \t]*\n+(\s*\d+\. )/g, '\n$1');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function isEffectivelyEmptyListItem(li) {
  if (!li) return true;
  const text = String(li.textContent || '').replace(/\u200B/g, '').trim();
  if (text) return false;
  if (li.querySelector('img, video, table, pre, hr')) return false;
  return true;
}

function closestListItem(node, root) {
  let n = node;
  if (n && n.nodeType === 3) n = n.parentElement;
  while (n && n !== root) {
    if (n.nodeType === 1 && n.tagName === 'LI') return n;
    n = n.parentElement;
  }
  return null;
}

function placeCaretIn(el, atStart = true) {
  if (!el) return;
  const range = document.createRange();
  const sel = window.getSelection();
  try {
    if (atStart) range.setStart(el, 0);
    else range.selectNodeContents(el);
    range.collapse(atStart);
    sel?.removeAllRanges();
    sel?.addRange(range);
  } catch (_) { /* ignore */ }
}

/** Enter on an empty <li> exits the list into a new <p> below the <ul>/<ol>. */
function exitListAtEmptyItem(li) {
  const list = li?.parentElement;
  if (!list || !/^(UL|OL)$/.test(list.tagName)) return false;
  if (!isEffectivelyEmptyListItem(li)) return false;
  li.remove();
  const p = document.createElement('p');
  p.appendChild(document.createElement('br'));
  if (![...list.children].some((c) => c.tagName === 'LI')) {
    list.replaceWith(p);
  } else {
    list.after(p);
  }
  placeCaretIn(p, true);
  return true;
}

/**
 * Contenteditable often keeps post-list text inside the last <li> after a <br> / <div>.
 * Promote that trailing content to a sibling <p> after the list (last item only).
 */
function promoteTrailingBreakContentFromLists(root) {
  if (!root) return;
  root.querySelectorAll('ul, ol').forEach((list) => {
    const items = [...list.children].filter((c) => c.tagName === 'LI');
    const li = items[items.length - 1];
    if (!li) return;

    const nodes = [...li.childNodes];
    let splitIdx = -1;
    let seenContent = false;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.nodeType === 3) {
        if (String(n.textContent || '').replace(/\u200B/g, '').trim()) seenContent = true;
        continue;
      }
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'BR') {
        if (seenContent) {
          splitIdx = i;
          break;
        }
        continue;
      }
      if (/^(DIV|P)$/.test(n.tagName)) {
        const t = String(n.textContent || '').replace(/\u200B/g, '').trim();
        if (seenContent) {
          splitIdx = i;
          break;
        }
        if (t) seenContent = true;
        continue;
      }
      if (String(n.textContent || '').replace(/\u200B/g, '').trim()) seenContent = true;
    }
    if (splitIdx < 0) return;

    const slice = nodes.slice(splitIdx);
    const skipBr = slice[0]?.nodeName === 'BR' ? 1 : 0;
    const toMove = slice.slice(skipBr);
    slice.forEach((n) => n.remove());
    const movedText = toMove
      .map((n) => String(n.textContent || ''))
      .join('')
      .replace(/\u200B/g, '')
      .trim();
    if (!movedText && !toMove.some((n) => n.nodeType === 1 && n.querySelector?.('img, video'))) {
      return;
    }
    const p = document.createElement('p');
    if (
      toMove.length === 1 &&
      toMove[0].nodeType === 1 &&
      /^(DIV|P)$/.test(toMove[0].tagName)
    ) {
      const block = toMove[0];
      while (block.firstChild) p.appendChild(block.firstChild);
    } else {
      toMove.forEach((n) => p.appendChild(n));
    }
    if (!String(p.textContent || '').replace(/\u200B/g, '').trim() && !p.querySelector('img, video')) {
      p.innerHTML = '<br>';
    }
    list.after(p);
  });
}

function htmlToMarkdownSync(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  const parts = [];
  const walk = (node, ctx = { inList: false }) => {
    if (node.nodeType === 3) {
      const t = node.textContent || '';
      if (t) parts.push(ctx.inList ? t.replace(/\s+/g, ' ') : t);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'img') {
      parts.push(`![${node.getAttribute('alt') || 'image'}](${node.getAttribute('src') || ''})\n\n`);
      return;
    }
    if (tag === 'video') {
      parts.push(`![video](${node.getAttribute('src') || ''})\n\n`);
      return;
    }
    if (tag === 'div' && node.classList?.contains('md-img-row')) {
      node.querySelectorAll('img, video').forEach((m) => walk(m, ctx));
      parts.push('\n');
      return;
    }
    if (tag === 'div' && node.classList?.contains('md-img-cell')) {
      node.childNodes.forEach((c) => walk(c, ctx));
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      parts.push(`\n\n${'#'.repeat(level)} ${String(node.textContent || '').trim()}\n\n`);
      return;
    }
    if (tag === 'br') {
      parts.push(ctx.inList ? ' ' : '\n');
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      const items = [...node.children].filter((el) => el.nodeName === 'LI');
      parts.push('\n');
      items.forEach((li, i) => {
        const marker = ordered ? `${i + 1}. ` : '- ';
        parts.push(`\n${marker}${liInnerMarkdown(li)}`);
      });
      parts.push('\n\n');
      return;
    }
    if (tag === 'li') {
      parts.push(`\n- ${liInnerMarkdown(node)}`);
      return;
    }
    if (tag === 'p' || tag === 'div' || tag === 'section') {
      if (ctx.inList) {
        node.childNodes.forEach((c) => walk(c, ctx));
        return;
      }
      node.childNodes.forEach((c) => walk(c, ctx));
      parts.push('\n\n');
      return;
    }
    if (tag === 'strong' || tag === 'b') {
      parts.push('**');
      node.childNodes.forEach((c) => walk(c, ctx));
      parts.push('**');
      return;
    }
    if (tag === 'em' || tag === 'i') {
      parts.push('*');
      node.childNodes.forEach((c) => walk(c, ctx));
      parts.push('*');
      return;
    }
    node.childNodes.forEach((c) => walk(c, ctx));
  };
  tmp.childNodes.forEach((c) => walk(c));
  return normalizeMarkdownLists(parts.join(''));
}

/** Prefer ready turndown when available (sync path for getValue / draft / submit). */
function htmlToMarkdownNow(html) {
  if (_turndownInstance) {
    try {
      return normalizeMarkdownLists(String(_turndownInstance.turndown(html || '') || ''));
    } catch (_) { /* fall through */ }
  }
  return htmlToMarkdownSync(html);
}

async function htmlToMarkdown(html) {
  const td = await ensureTurndown();
  if (td) {
    try { return normalizeMarkdownLists(String(td.turndown(html || '') || '')); } catch (_) { /* fall through */ }
  }
  return htmlToMarkdownSync(html);
}

function insertHtmlAtRange(html, range) {
  if (!range) return false;
  try {
    range.deleteContents();
    const frag = range.createContextualFragment(html);
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      const next = document.createRange();
      next.setStartAfter(last);
      next.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(next);
    }
    return true;
  } catch (_) {
    return false;
  }
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
  return r.height >= 24 && r.width >= 24;
}

async function waitForToastSurface(root, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (toastIsHealthy(root)) return true;
    await waitFrames(2);
  }
  return !!(
    root?.querySelector('.ProseMirror')
    || root?.querySelector('.toastui-editor-contents [contenteditable="true"]')
    || root?.querySelector('.CodeMirror')
  );
}

function buildBasicToolbar(onAction) {
  const bar = document.createElement('div');
  bar.className = 'md-editor-toolbar-basic';
  const items = [
    ['bold', 'B', '굵게'],
    ['italic', 'I', '기울임'],
    ['strike', 'S', '취소선'],
    ['h2', 'H2', '제목'],
    ['ul', '• 목록', '글머리 목록'],
    ['ol', '1. 목록', '번호 목록'],
    ['check', '☑', '체크리스트'],
    ['code', '</>', '코드'],
    ['quote', '인용', '인용문'],
    ['link', '링크', '링크'],
    ['undo', '↩', '실행 취소'],
    ['redo', '↪', '다시 실행']
  ];
  items.forEach(([action, label, title]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.mdBasic = action;
    btn.textContent = label;
    btn.title = title || action;
    btn.setAttribute('aria-label', title || action);
    bar.appendChild(btn);
  });
  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-md-basic]');
    if (!btn) return;
    onAction(btn.dataset.mdBasic);
  });
  return bar;
}

/** Match markdown image / media embeds: ![alt](url) */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function listMarkdownImages(md) {
  const out = [];
  const src = String(md || '');
  MD_IMAGE_RE.lastIndex = 0;
  let m;
  while ((m = MD_IMAGE_RE.exec(src))) {
    out.push({
      full: m[0],
      alt: m[1] || '',
      url: m[2] || '',
      index: m.index,
      end: m.index + m[0].length
    });
  }
  return out;
}

function rewriteMarkdownImages(md, nextImages) {
  const src = String(md || '');
  const found = listMarkdownImages(src);
  if (!found.length) return src;
  let out = '';
  let cursor = 0;
  found.forEach((item, i) => {
    out += src.slice(cursor, item.index);
    const next = nextImages[i];
    out += next ? next.full : '';
    cursor = item.end;
  });
  out += src.slice(cursor);
  return out;
}

export function moveMarkdownImage(md, index, dir) {
  const images = listMarkdownImages(md);
  const j = index + dir;
  if (index < 0 || j < 0 || index >= images.length || j >= images.length) return String(md || '');
  const next = images.slice();
  const tmp = next[index];
  next[index] = next[j];
  next[j] = tmp;
  return rewriteMarkdownImages(md, next);
}

export function removeMarkdownImage(md, index) {
  const images = listMarkdownImages(md);
  if (index < 0 || index >= images.length) return String(md || '');
  const next = images.slice();
  next[index] = null;
  return rewriteMarkdownImages(md, next);
}

export function splitMarkdownBlocks(md) {
  const text = String(md || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  return text.split(/\n{2,}/).map((s) => s.trimEnd()).filter((s) => s.length);
}

function isMarkdownImageOnlyBlock(block) {
  const t = String(block || '').trim();
  if (!t) return false;
  MD_IMAGE_RE.lastIndex = 0;
  const m = MD_IMAGE_RE.exec(t);
  if (!m || m.index !== 0) return false;
  return t.slice(m[0].length).trim() === '';
}

/**
 * Move one markdown image to dropSlot among blank-line blocks (0…blocks.length).
 * Drop slots are indexed against the document BEFORE removal; slots after the
 * source block are adjusted automatically.
 */
export function placeMarkdownImageAt(md, imageIndex, dropSlot) {
  const src = String(md || '');
  const images = listMarkdownImages(src);
  const img = images[imageIndex];
  if (!img) return src;

  const blocks = splitMarkdownBlocks(src);
  let globalImg = 0;
  let fromBlock = -1;
  let localHit = -1;

  for (let i = 0; i < blocks.length; i++) {
    const local = listMarkdownImages(blocks[i]);
    for (let j = 0; j < local.length; j++) {
      if (globalImg === imageIndex) {
        fromBlock = i;
        localHit = j;
        break;
      }
      globalImg += 1;
    }
    if (fromBlock >= 0) break;
  }
  if (fromBlock < 0 || localHit < 0) return src;

  if (isMarkdownImageOnlyBlock(blocks[fromBlock])) {
    blocks.splice(fromBlock, 1);
  } else {
    const local = listMarkdownImages(blocks[fromBlock])[localHit];
    const b = blocks[fromBlock];
    blocks[fromBlock] = `${b.slice(0, local.index)}${b.slice(local.end)}`
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!blocks[fromBlock]) blocks.splice(fromBlock, 1);
  }

  let slot = Number(dropSlot);
  if (Number.isNaN(slot)) slot = blocks.length;
  if (fromBlock >= 0 && slot > fromBlock) slot -= 1;
  slot = Math.max(0, Math.min(slot, blocks.length));
  blocks.splice(slot, 0, img.full.trim());
  return blocks.join('\n\n');
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
    preferToast = false,
    promptDraft = true,
    /** Show rendered preview beside/below editor so inline images can be positioned. */
    livePreview = false,
    /** Visual (WYSIWYG) editing — images/headings render in the writing surface. */
    wysiwyg = false
  } = options;

  const useWysiwyg = !!wysiwyg;
  const useLivePreview = !!livePreview && !useWysiwyg;
  const useToast = !!preferToast || useWysiwyg;

  ensureMarkdownCss();

  // Destroy any previous instance on this host
  if (host._mdApi) {
    try { host._mdApi.destroy(); } catch (_) { /* ignore */ }
    host._mdApi = null;
  }
  host.innerHTML = '';
  host.classList.add('md-editor-shell');
  host.classList.remove('md-no-split', 'md-has-live-preview', 'md-engine-wysiwyg');
  if (useWysiwyg) host.classList.add('md-engine-wysiwyg');

  const heightPx = resolveHeightPx(height);
  let toast = null;
  let ta = null;
  let visualEl = null;
  let visualMdCache = '';
  let savedRange = null;
  let destroyed = false;
  let history = [];
  let historyIdx = -1;

  const saveVisualSelection = () => {
    if (!visualEl) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const anchor = sel.anchorNode;
    if (!anchor || !visualEl.contains(anchor)) return;
    try { savedRange = sel.getRangeAt(0).cloneRange(); } catch (_) { /* ignore */ }
  };

  const restoreVisualSelection = () => {
    if (!visualEl) return null;
    visualEl.focus();
    const sel = window.getSelection();
    if (!sel) return null;
    sel.removeAllRanges();
    let range = null;
    if (savedRange) {
      try {
        if (visualEl.contains(savedRange.commonAncestorContainer)) range = savedRange.cloneRange();
      } catch (_) { range = null; }
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(visualEl);
      range.collapse(false);
    }
    try { sel.addRange(range); } catch (_) { /* ignore */ }
    return range;
  };

  const insertVisualImage = (url, alt = 'image') => {
    if (!visualEl || !url) return false;
    const prose = visualEl.querySelector('.md-visual-prose') || visualEl;
    const img = document.createElement('img');
    img.src = url;
    img.alt = alt || 'image';
    img.draggable = true;
    img.title = '드래그해서 위치 이동';

    // Always place next to the last image in the document (right side),
    // not "below" — this matches the expected hub-composer UX.
    const anchor = findLastImageAnchor(prose);
    if (anchor?.classList?.contains('md-img-row') && anchor.querySelectorAll('.md-img-cell').length === 1) {
      const cell = document.createElement('div');
      cell.className = 'md-img-cell';
      cell.appendChild(img);
      anchor.appendChild(cell);
    } else if (anchor && (isImageOnlyBlock(anchor) || /^(IMG|VIDEO)$/.test(anchor.tagName))) {
      const media = /^(IMG|VIDEO)$/.test(anchor.tagName) ? anchor : anchor.querySelector('img,video');
      const row = document.createElement('div');
      row.className = 'md-img-row';
      const c1 = document.createElement('div');
      c1.className = 'md-img-cell';
      const c2 = document.createElement('div');
      c2.className = 'md-img-cell';
      if (media) c1.appendChild(media);
      c2.appendChild(img);
      row.appendChild(c1);
      row.appendChild(c2);
      anchor.replaceWith(row);
    } else if (anchor?.classList?.contains('md-img-row')) {
      // Row already has 2 images → start a new image below as its own block,
      // then pairLastTwoImages is NOT used (would steal from previous row).
      const p = document.createElement('p');
      p.appendChild(img);
      anchor.after(p);
    } else {
      const p = document.createElement('p');
      p.appendChild(img);
      prose.appendChild(p);
    }

    wrapAdjacentImages(prose);
    // If two stacked images somehow remain, force them into one row.
    const imgs = [...prose.querySelectorAll('img, video')];
    if (imgs.length >= 2) {
      const a = imgs[imgs.length - 2];
      const b = imgs[imgs.length - 1];
      if (a.closest('.md-img-row') !== b.closest('.md-img-row')) pairLastTwoImages(prose);
    }

    saveVisualSelection();
    visualMdCache = htmlToMarkdownNow(visualEl.innerHTML);
    pushHistory(visualMdCache);
    onChange?.(visualMdCache);
    scheduleLivePreview();
    statusEl.textContent = '이미지 삽입 · 두 번째 이미지는 오른쪽에 붙습니다. (안되면 「나란히」 클릭)';
    return true;
  };

  const getValue = () => {
    try {
      if (toast) return normalizeMarkdownLists(String(toast.getMarkdown() ?? ''));
    } catch (_) { /* fall through */ }
    if (visualEl) {
      // Prefer turndown when warmed; sync path also normalizes tight lists.
      promoteTrailingBreakContentFromLists(visualEl);
      visualMdCache = htmlToMarkdownNow(visualEl.innerHTML);
      return visualMdCache;
    }
    return normalizeMarkdownLists(ta ? String(ta.value ?? '') : '');
  };

  const pushHistory = (v) => {
    const cur = String(v ?? '');
    if (historyIdx >= 0 && history[historyIdx] === cur) return;
    history = history.slice(0, historyIdx + 1);
    history.push(cur);
    if (history.length > 80) history.shift();
    historyIdx = history.length - 1;
  };

  let previewEl = null;
  let imageStripEl = null;
  let previewTimer = 0;

  let dragImgIndex = -1;

  const clearDropHints = () => {
    previewEl?.querySelectorAll('.md-drop-slot.is-active, .md-preview-block.is-drag-over').forEach((el) => {
      el.classList.remove('is-active', 'is-drag-over');
    });
  };

  const bindPreviewImageDnD = (md) => {
    if (!previewEl) return;
    const images = listMarkdownImages(md);
    previewEl.querySelectorAll('[data-md-img]').forEach((el) => {
      el.setAttribute('draggable', 'true');
      el.classList.add('md-preview-draggable');
      el.addEventListener('dragstart', (e) => {
        dragImgIndex = Number(el.getAttribute('data-md-img'));
        if (Number.isNaN(dragImgIndex) || !images[dragImgIndex]) {
          dragImgIndex = -1;
          e.preventDefault();
          return;
        }
        el.classList.add('is-dragging');
        previewEl.classList.add('is-dnd');
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(dragImgIndex));
          e.dataTransfer.setData('application/x-md-image', String(dragImgIndex));
        } catch (_) { /* ignore */ }
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('is-dragging');
        previewEl.classList.remove('is-dnd');
        clearDropHints();
        dragImgIndex = -1;
      });
    });
    const onDragOverSlot = (e, slotEl) => {
      if (dragImgIndex < 0) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) { /* ignore */ }
      clearDropHints();
      slotEl.classList.add('is-active');
    };
    previewEl.querySelectorAll('[data-md-drop]').forEach((slot) => {
      slot.addEventListener('dragenter', (e) => onDragOverSlot(e, slot));
      slot.addEventListener('dragover', (e) => onDragOverSlot(e, slot));
      slot.addEventListener('dragleave', () => slot.classList.remove('is-active'));
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const raw = e.dataTransfer?.getData('application/x-md-image')
          || e.dataTransfer?.getData('text/plain')
          || String(dragImgIndex);
        const idx = Number(raw);
        const slotIdx = Number(slot.getAttribute('data-md-drop'));
        clearDropHints();
        previewEl.classList.remove('is-dnd');
        dragImgIndex = -1;
        if (Number.isNaN(idx) || Number.isNaN(slotIdx)) return;
        const next = placeMarkdownImageAt(getValue(), idx, slotIdx);
        if (next !== getValue()) setValue(next);
      });
    });
  };

  const paintLivePreview = () => {
    if (!useLivePreview || !previewEl) return;
    const md = getValue();
    const blocks = splitMarkdownBlocks(md);
    const images = listMarkdownImages(md);
    if (!blocks.length) {
      previewEl.innerHTML = `<div class="md-prose md-live-empty"><p class="muted">본문을 입력하면 미리보기가 나타납니다. 이미지는 드래그해서 원하는 위치로 옮길 수 있습니다.</p></div>`;
      if (imageStripEl) paintImageStrip(md);
      return;
    }
    // Map each image token index → which block it lives in (first match by url+offset order)
    let imgCursor = 0;
    const blockHtml = blocks.map((block, bi) => {
      const html = renderMarkdown(block, { className: 'md-prose md-preview-block-inner' });
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      const inner = wrap.firstElementChild || wrap;
      if (isMarkdownImageOnlyBlock(block) && imgCursor < images.length) {
        const imgIdx = imgCursor;
        imgCursor += 1;
        inner.querySelectorAll('img, video.md-video-file').forEach((media) => {
          media.setAttribute('data-md-img', String(imgIdx));
          media.setAttribute('title', '드래그해서 위치 이동');
        });
        // If renderer wrapped oddly, still mark the block
        inner.setAttribute('data-md-img-block', String(imgIdx));
      } else {
        // Inline images inside mixed blocks
        inner.querySelectorAll('img, video.md-video-file').forEach((media) => {
          const src = media.getAttribute('src') || '';
          const hit = images.findIndex((im, i) => i >= imgCursor && im.url === src);
          if (hit >= 0) {
            media.setAttribute('data-md-img', String(hit));
            media.setAttribute('title', '드래그해서 위치 이동');
            imgCursor = Math.max(imgCursor, hit + 1);
          }
        });
      }
      return `<div class="md-drop-slot" data-md-drop="${bi}"><span>여기에 놓기</span></div>
        <div class="md-preview-block" data-md-block="${bi}">${inner.outerHTML}</div>`;
    }).join('');
    previewEl.innerHTML = `${blockHtml}<div class="md-drop-slot" data-md-drop="${blocks.length}"><span>맨 아래에 놓기</span></div>`;
    bindMarkdownInteractions(previewEl);
    bindPreviewImageDnD(md);
    if (imageStripEl) paintImageStrip(md);
  };

  const scheduleLivePreview = () => {
    if (!useLivePreview) return;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(paintLivePreview, 120);
  };

  const paintImageStrip = (md) => {
    if (!imageStripEl) return;
    const images = listMarkdownImages(md);
    if (!images.length) {
      imageStripEl.hidden = true;
      imageStripEl.innerHTML = '';
      return;
    }
    imageStripEl.hidden = false;
    imageStripEl.innerHTML = `<div class="md-image-strip-head"><strong>본문 이미지</strong><span>미리보기에서 드래그&드롭으로 위치를 옮기세요</span></div>
      <div class="md-image-strip-list">${images.map((img, i) => {
        const isVideo = /\.(mp4|webm)(\?|$)/i.test(img.url) || /video/i.test(img.alt);
        const thumb = isVideo
          ? `<span class="md-image-strip-thumb is-video">🎥</span>`
          : `<img class="md-image-strip-thumb" src="${esc(img.url)}" alt="${esc(img.alt || 'image')}" loading="lazy" draggable="false">`;
        return `<div class="md-image-strip-item" data-md-img="${i}" draggable="true" title="미리보기로 드래그">
          ${thumb}
          <span class="md-image-strip-name" title="${esc(img.alt || img.url)}">${esc(img.alt || '이미지')}</span>
          <div class="md-image-strip-actions">
            <button type="button" class="secondary mini-btn" data-md-img-move="-1" ${i === 0 ? 'disabled' : ''} title="위로">↑</button>
            <button type="button" class="secondary mini-btn" data-md-img-move="1" ${i === images.length - 1 ? 'disabled' : ''} title="아래로">↓</button>
            <button type="button" class="secondary mini-btn danger-btn" data-md-img-remove title="삭제">삭제</button>
          </div>
        </div>`;
      }).join('')}</div>`;
    imageStripEl.querySelectorAll('.md-image-strip-item[draggable="true"]').forEach((el) => {
      el.addEventListener('dragstart', (e) => {
        if (e.target.closest('button')) {
          e.preventDefault();
          return;
        }
        dragImgIndex = Number(el.getAttribute('data-md-img'));
        el.classList.add('is-dragging');
        previewEl?.classList.add('is-dnd');
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(dragImgIndex));
          e.dataTransfer.setData('application/x-md-image', String(dragImgIndex));
        } catch (_) { /* ignore */ }
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('is-dragging');
        previewEl?.classList.remove('is-dnd');
        clearDropHints();
        dragImgIndex = -1;
      });
    });
  };

  const paintVisualFromMarkdown = (md) => {
    if (!visualEl) return;
    // Repair broken "-\\ntext" / blank-line lists so marked emits real <ul>/<li>.
    visualMdCache = normalizeMarkdownLists(String(md ?? ''));
    const html = renderMarkdown(visualMdCache, { className: 'md-prose md-visual-prose' });
    visualEl.innerHTML = html || '<p><br></p>';
    wrapAdjacentImages(visualEl);
    bindMarkdownInteractions(visualEl);
    visualEl.querySelectorAll('img').forEach((img) => {
      img.setAttribute('draggable', 'true');
      img.title = '드래그해서 위치 이동';
    });
  };

  const syncVisualMarkdown = async () => {
    if (!visualEl) return visualMdCache;
    promoteTrailingBreakContentFromLists(visualEl);
    visualMdCache = await htmlToMarkdown(visualEl.innerHTML);
    return visualMdCache;
  };

  const setValue = (v, { recordHistory = true } = {}) => {
    const s = normalizeMarkdownLists(String(v ?? ''));
    if (toast) {
      try { toast.setMarkdown(s); } catch (e) { console.warn(e); }
    }
    if (visualEl) paintVisualFromMarkdown(s);
    if (ta) ta.value = s;
    if (recordHistory) pushHistory(s);
    onChange?.(s);
    scheduleLivePreview();
  };

  const focus = () => {
    try {
      if (toast) {
        toast.focus();
        const ww = host.querySelector('.ProseMirror, .toastui-editor-contents [contenteditable="true"]');
        if (ww) { ww.focus(); return; }
        const cm = host.querySelector('.CodeMirror');
        cm?.CodeMirror?.focus?.();
        return;
      }
      if (visualEl) { visualEl.focus(); return; }
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
    const raw = String(snippet ?? '');
    const img = raw.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/m);
    // Prefer visual/photo insert — never dump raw markdown into the writing surface.
    if (visualEl && img) {
      insertVisualImage(img[2], img[1] || 'image');
      try { autosave?.touch?.(); } catch (_) { /* ignore */ }
      return;
    }
    if (toast) {
      try {
        if (img && typeof toast.exec === 'function') {
          toast.focus();
          toast.exec('addImage', { imageUrl: img[2], altText: img[1] || 'image' });
          scheduleLivePreview();
          return;
        }
        if (typeof toast.insertText === 'function') {
          toast.focus();
          toast.insertText(raw);
          scheduleLivePreview();
          return;
        }
      } catch (err) {
        console.warn('toast insert failed', err);
      }
    }
    if (visualEl) {
      const range = restoreVisualSelection();
      const html = renderMarkdown(raw, { className: '' }) || `<p>${esc(raw)}</p>`;
      let ok = false;
      try { ok = document.execCommand('insertHTML', false, html); } catch (_) { ok = false; }
      if (!ok) ok = insertHtmlAtRange(html, range);
      if (!ok) visualEl.insertAdjacentHTML('beforeend', html);
      saveVisualSelection();
      syncVisualMarkdown().then((md) => {
        visualMdCache = md;
        pushHistory(md);
        onChange?.(md);
        try { autosave?.touch?.(); } catch (_) { /* ignore */ }
      });
      return;
    }
    // Last resort: if wysiwyg was requested but only textarea exists, remount visual with image.
    if (useWysiwyg && img && ta) {
      const next = `${String(ta.value || '').replace(/\s*$/, '')}\n\n${img[0]}\n`;
      mountVisualWysiwyg(next);
      return;
    }
    insertAtCursor(getSelection, setSelection, raw);
    focus();
    scheduleLivePreview();
  };

  const statusEl = document.createElement('div');
  statusEl.className = 'md-editor-status';

  const uploader = createMarkdownUploader({
    storagePrefix,
    upload,
    insertMarkdown,
    onStatus: (m) => { statusEl.textContent = m; },
    onBeforePick: () => {
      saveVisualSelection();
      try { toast?.focus?.(); } catch (_) { /* ignore */ }
    }
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
    const visualFriendly = !!(toast || visualEl);
    if (action === 'bold') {
      if (visualFriendly && visualEl && document.execCommand) document.execCommand('bold');
      else wrapSelection(g, s, '**', '**', '굵게');
    } else if (action === 'italic') {
      if (visualFriendly && visualEl && document.execCommand) document.execCommand('italic');
      else wrapSelection(g, s, '*', '*', '기울임');
    } else if (action === 'strike') {
      if (visualFriendly && visualEl && document.execCommand) document.execCommand('strikeThrough');
      else wrapSelection(g, s, '~~', '~~', '취소선');
    } else if (action === 'h2') {
      if (visualFriendly) insertMarkdown('\n## 제목\n');
      else insertAtCursor(g, s, '\n## ');
    } else if (action === 'ul') {
      if (visualFriendly && visualEl && document.execCommand) document.execCommand('insertUnorderedList');
      else insertAtCursor(g, s, '\n- ');
    } else if (action === 'ol') {
      if (visualFriendly && visualEl && document.execCommand) document.execCommand('insertOrderedList');
      else insertAtCursor(g, s, '\n1. ');
    } else if (action === 'check') insertChecklist(g, s);
    else if (action === 'code') wrapSelection(g, s, '`', '`', 'code');
    else if (action === 'quote') {
      if (visualFriendly) insertMarkdown('\n> 인용\n');
      else insertAtCursor(g, s, '\n> ');
    } else if (action === 'link') {
      const url = prompt('URL', 'https://');
      if (url) {
        if (visualFriendly && visualEl && document.execCommand) document.execCommand('createLink', false, url);
        else wrapSelection(g, s, '[', `](${url})`, '링크');
      }
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
    if (visualEl) {
      syncVisualMarkdown().then((md) => {
        visualMdCache = md;
        pushHistory(md);
        onChange?.(md);
      });
    }
    focus();
  });
  host.appendChild(basicBar);

  // Keep caret inside the visual editor when pressing toolbar buttons
  // (otherwise the file dialog / focus change drops the selection → image goes to the bottom).
  const preserveCaretOnToolbar = (bar) => {
    bar?.addEventListener('mousedown', (e) => {
      if (!e.target.closest('button')) return;
      saveVisualSelection();
      e.preventDefault();
    });
  };
  preserveCaretOnToolbar(basicBar);

  const extras = buildExtraToolbar(async (action) => {
    if (action === 'alert') {
      const kind = prompt('Alert 종류: NOTE / TIP / WARNING / IMPORTANT / CAUTION', 'NOTE') || 'NOTE';
      insertAlert(getSelection, setSelection, kind.toUpperCase());
    } else if (action === 'spoiler') insertSpoiler(getSelection, setSelection);
    else if (action === 'checklist') insertChecklist(getSelection, setSelection);
    else if (action === 'table') insertTable(getSelection, setSelection);
    else if (action === 'image') await uploader.pickImage();
    else if (action === 'imagerow') {
      if (!visualEl) {
        alert('시각 편집기에서만 나란히 배치할 수 있습니다.');
      } else {
        const prose = visualEl.querySelector('.md-visual-prose') || visualEl;
        const ok = pairLastTwoImages(prose);
        if (!ok) alert('나란히 배치할 이미지가 2장 이상 필요합니다.');
        else {
          visualMdCache = htmlToMarkdownNow(visualEl.innerHTML);
          pushHistory(visualMdCache);
          onChange?.(visualMdCache);
          statusEl.textContent = '마지막 두 이미지를 좌·우로 배치했습니다.';
        }
      }
    } else if (action === 'video') await uploader.pickVideo();
    else if (action === 'file') await uploader.pickFileAttach();
    else if (action === 'internal') await promptInternalLink(getSelection, setSelection, searchFn);
    else if (action === 'step' || action === 'tip' || action === 'faq') {
      insertAtCursor(getSelection, setSelection, containerSnippet(action));
    }
    focus();
  });
  host.appendChild(extras);
  preserveCaretOnToolbar(extras);

  if (useLivePreview) {
    imageStripEl = document.createElement('div');
    imageStripEl.className = 'md-image-strip';
    imageStripEl.hidden = true;
    imageStripEl.addEventListener('click', (e) => {
      const item = e.target.closest('[data-md-img]');
      if (!item) return;
      const idx = Number(item.getAttribute('data-md-img'));
      if (Number.isNaN(idx)) return;
      const moveBtn = e.target.closest('[data-md-img-move]');
      if (moveBtn) {
        const dir = Number(moveBtn.getAttribute('data-md-img-move'));
        setValue(moveMarkdownImage(getValue(), idx, dir));
        return;
      }
      if (e.target.closest('[data-md-img-remove]')) {
        if (!confirm('이 이미지를 본문에서 삭제할까요?')) return;
        setValue(removeMarkdownImage(getValue(), idx));
      }
    });
    host.appendChild(imageStripEl);
  }

  const workArea = document.createElement('div');
  workArea.className = useLivePreview ? 'md-editor-work is-split' : 'md-editor-work';
  const editorHost = document.createElement('div');
  editorHost.className = 'md-editor-host';
  editorHost.style.minHeight = `${Math.max(260, heightPx - 40)}px`;
  workArea.appendChild(editorHost);
  if (useLivePreview) {
    const previewPane = document.createElement('div');
    previewPane.className = 'md-live-preview-pane';
    previewPane.innerHTML = `<div class="md-live-preview-label">미리보기 · 이미지를 드래그해 원하는 위치에 놓으세요</div><div class="md-live-preview-body post-body-content"></div>`;
    previewEl = previewPane.querySelector('.md-live-preview-body');
    workArea.appendChild(previewPane);
    host.classList.add('md-has-live-preview');
  }
  host.appendChild(workArea);

  let initial = String(value ?? '');
  if (draftKey && promptDraft !== false) {
    const draft = loadDraft(draftKey);
    const draftText = String(draft?.value || '');
    if (draftText && draftText !== initial && !promptedDraftKeys.has(draftKey)) {
      promptedDraftKeys.add(draftKey);
      const restore = confirm('저장된 임시 초안이 있습니다. 복원할까요?');
      if (restore) initial = draftText;
    }
  }
  pushHistory(initial);

  const autosave = createDraftAutosave(draftKey, getValue);

  const mountTextarea = (text) => {
    editorHost.innerHTML = '';
    toast = null;
    visualEl = null;
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
      scheduleLivePreview();
    });
    editorHost.appendChild(ta);
    host.classList.add('md-engine-textarea');
    host.classList.remove('md-engine-toast', 'md-engine-visual');
    statusEl.textContent = '';
    scheduleLivePreview();
  };

  const mountVisualWysiwyg = (text) => {
    editorHost.innerHTML = '';
    toast = null;
    ta = null;
    savedRange = null;
    visualEl = document.createElement('div');
    visualEl.className = 'md-visual-editor';
    visualEl.contentEditable = 'true';
    visualEl.setAttribute('role', 'textbox');
    visualEl.setAttribute('aria-multiline', 'true');
    visualEl.setAttribute('aria-label', '본문');
    visualEl.dataset.placeholder = placeholder;
    visualEl.style.minHeight = `${Math.max(280, heightPx - 48)}px`;
    paintVisualFromMarkdown(text);
    let syncTimer = 0;
    const queueSync = () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        const md = await syncVisualMarkdown();
        pushHistory(md);
        onChange?.(md);
        autosave.touch();
      }, 180);
    };
    visualEl.addEventListener('input', () => { saveVisualSelection(); queueSync(); });
    visualEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
      const li = closestListItem(sel.anchorNode, visualEl);
      if (!li || !visualEl.contains(li)) return;
      if (!isEffectivelyEmptyListItem(li)) return;
      e.preventDefault();
      if (exitListAtEmptyItem(li)) {
        saveVisualSelection();
        queueSync();
      }
    });
    visualEl.addEventListener('keyup', saveVisualSelection);
    visualEl.addEventListener('mouseup', saveVisualSelection);
    visualEl.addEventListener('click', saveVisualSelection);
    visualEl.addEventListener('blur', () => { saveVisualSelection(); queueSync(); });
    visualEl.addEventListener('paste', (e) => {
      saveVisualSelection();
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) uploader.uploadAndInsert(file, 'image');
          return;
        }
      }
    });
    editorHost.appendChild(visualEl);
    host.classList.add('md-engine-visual', 'md-engine-wysiwyg');
    host.classList.remove('md-engine-toast', 'md-engine-textarea');
    statusEl.textContent = '시각 편집 · 사진을 커서 위치에 바로 넣습니다. 드래그로 위치 이동 가능.';
    ensureTurndown().catch(() => {});
    setTimeout(() => {
      visualEl?.focus();
      saveVisualSelection();
    }, 60);
  };

  const mountToast = async (text) => {
    const Editor = useToast ? await ensureToastEditor() : null;
    if (!Editor) {
      if (useWysiwyg) mountVisualWysiwyg(text);
      else mountTextarea(text);
      return false;
    }
    editorHost.innerHTML = '';
    ta = null;
    visualEl = null;
    try {
      toast = new Editor({
        el: editorHost,
        height: `${heightPx}px`,
        initialValue: text,
        initialEditType: useWysiwyg ? 'wysiwyg' : 'markdown',
        previewStyle: useWysiwyg ? 'vertical' : 'tab',
        hideModeSwitch: true,
        usageStatistics: false,
        placeholder,
        theme: 'dark',
        autofocus: false,
        toolbarItems: [
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'image', 'link'],
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
              const safe = String(file.name || 'paste.png').replace(/[^\w.\-()+]+/g, '_').slice(0, 80);
              const path = `${storagePrefix.replace(/\/$/, '')}/${Date.now()}_${safe}`;
              const url = await doUpload(path, file);
              callback(url, file.name?.replace(/\.[^.]+$/, '') || 'image');
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
            scheduleLivePreview();
          }
        }
      });
      host.classList.add('md-engine-toast');
      host.classList.toggle('md-hide-toast-preview-tab', !useWysiwyg);
      host.classList.toggle('md-engine-wysiwyg', useWysiwyg);
      host.classList.remove('md-engine-textarea', 'md-engine-visual');
      await waitFrames(2);
      refreshLayout();
      const ok = await waitForToastSurface(editorHost, useWysiwyg ? 2500 : 1200);
      if (!ok) {
        console.warn('[MarkdownEditor] Toast UI surface unhealthy — using visual editor');
        try { toast.destroy(); } catch (_) { /* ignore */ }
        toast = null;
        if (useWysiwyg) {
          mountVisualWysiwyg(text);
        } else {
          mountTextarea(text);
          statusEl.textContent = '편집기를 안전 모드로 전환했습니다.';
        }
        return false;
      }
      if (useWysiwyg) {
        statusEl.textContent = '시각 편집 · 사진/제목이 본문에 바로 보입니다. 이미지는 드래그로 옮길 수 있습니다.';
      }
      scheduleLivePreview();
      return true;
    } catch (e) {
      console.error('[MarkdownEditor] Toast init failed', e);
      toast = null;
      if (useWysiwyg) mountVisualWysiwyg(text);
      else {
        mountTextarea(text);
        statusEl.textContent = '편집기 로드 실패 — 안전 모드로 작성하세요.';
      }
      return false;
    }
  };

  if (!isVisible(host) && host.offsetParent === null && getComputedStyle(host).display === 'none') {
    console.warn('[MarkdownEditor] host not visible at mount — delaying');
  }

  // Hub/visual composers: skip Toast CDN (often falls back to raw markdown textarea).
  // Use the reliable contenteditable surface so images always appear as photos.
  if (useWysiwyg) mountVisualWysiwyg(initial);
  else await mountToast(initial);

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
    refreshPreview: paintLivePreview,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(previewTimer);
      autosave.stop();
      unbindPaste?.();
      try { toast?.destroy(); } catch (_) { /* ignore */ }
      toast = null;
      ta = null;
      visualEl = null;
      visualMdCache = '';
      previewEl = null;
      imageStripEl = null;
      host._mdApi = null;
      host.innerHTML = '';
      host.classList.remove('md-editor-shell', 'md-engine-toast', 'md-engine-textarea', 'md-hide-toast-preview-tab', 'md-has-live-preview', 'md-engine-wysiwyg', 'md-engine-visual');
    }
  };
  host._mdApi = api;
  setTimeout(() => { refreshLayout(); focus(); paintLivePreview(); }, 80);
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
