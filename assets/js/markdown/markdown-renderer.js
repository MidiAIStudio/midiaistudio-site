/**
 * Shared Markdown → sanitized HTML renderer for the site + preview modal.
 */
import MarkdownIt from 'https://esm.sh/markdown-it@14.1.0?target=es2020';
import DOMPurify from 'https://esm.sh/dompurify@3.1.6?target=es2020';
import hljs from 'https://esm.sh/highlight.js@11.9.0?target=es2020';
import { applyAllPlugins } from './markdown-plugins.js';

let _md = null;

function createMd() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
    highlight(str, lang) {
      const key = (lang || '').toLowerCase();
      if (key && hljs.getLanguage(key)) {
        try {
          return `<pre class="hljs"><code class="language-${md.utils.escapeHtml(key)}">${hljs.highlight(str, { language: key, ignoreIllegals: true }).value}</code></pre>`;
        } catch (_) { /* fall through */ }
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    }
  });
  md.enable(['table', 'strikethrough']);

  // Task lists: - [ ] / - [x]
  md.core.ruler.after('inline', 'task_lists', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'inline') continue;
      const m = tokens[i].content.match(/^\[([ xX])\]\s+/);
      if (!m) continue;
      const parent = tokens[i - 2];
      if (!parent || parent.type !== 'list_item_open') continue;
      parent.attrJoin('class', 'md-task-item');
      const checked = m[1].toLowerCase() === 'x';
      tokens[i].content = tokens[i].content.slice(m[0].length);
      if (tokens[i].children?.[0]?.type === 'text') {
        tokens[i].children[0].content = tokens[i].children[0].content.replace(/^\[([ xX])\]\s+/, '');
      }
      const checkbox = `<input type="checkbox" class="md-task-check" disabled${checked ? ' checked' : ''}> `;
      tokens[i].children = tokens[i].children || [];
      tokens[i].children.unshift({
        type: 'html_inline',
        content: checkbox,
        level: 0
      });
    }
  });

  const defaultLinkOpen = md.renderer.rules.link_open
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href') || '';
    const isExternal = /^https?:\/\//i.test(href) && !/midiaistudio\.com/i.test(href);
    const isDownload = /\/download(\/|$|\?)/i.test(href)
      || /\.(zip|exe|msi|dmg|pkg|7z|rar|apk)(\?|$)/i.test(href);
    if (isExternal || isDownload) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener noreferrer');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Uploaded videos: ![alt](url.mp4) → <video>
  const defaultImage = md.renderer.rules.image
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const src = tokens[idx].attrGet('src') || '';
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(src)) {
      const alt = tokens[idx].content || '';
      return `<video class="md-video-file" src="${md.utils.escapeHtml(src)}" controls playsinline preload="metadata"${alt ? ` aria-label="${md.utils.escapeHtml(alt)}"` : ''}></video>`;
    }
    return defaultImage(tokens, idx, options, env, self);
  };

  applyAllPlugins(md);
  return md;
}

function getMd() {
  if (!_md) _md = createMd();
  return _md;
}

const PURIFY_CFG = {
  ADD_TAGS: ['iframe', 'video', 'source', 'details', 'summary', 'input', 'button'],
  ADD_ATTR: [
    'allow', 'allowfullscreen', 'frameborder', 'target', 'rel', 'loading',
    'controls', 'playsinline', 'preload', 'poster', 'muted', 'loop', 'autoplay',
    'tabindex', 'role', 'aria-label', 'data-alert', 'data-tab', 'data-tab-panel',
    'data-md-tabs', 'checked', 'disabled', 'type', 'class'
  ],
  ALLOW_DATA_ATTR: true,
  FORBID_TAGS: ['script', 'style', 'object', 'embed', 'form'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
};

export function isImageOnlyBlock(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.classList?.contains('md-img-row') || el.classList?.contains('md-img-cell')) return false;
  if (/^(IMG|VIDEO)$/.test(el.tagName)) return true;
  if (el.tagName === 'P' || el.tagName === 'DIV') {
    const media = [...el.querySelectorAll(':scope > img, :scope > video')];
    const text = String(el.textContent || '').trim();
    return media.length >= 1 && !text;
  }
  return false;
}

function extractBlockMedia(el) {
  if (/^(IMG|VIDEO)$/.test(el.tagName)) return el;
  return el.querySelector?.('img, video') || null;
}

function extractAllBlockMedia(el) {
  if (/^(IMG|VIDEO)$/.test(el.tagName)) return [el];
  return [...(el.querySelectorAll?.('img, video') || [])];
}

function makeImgCell(media) {
  const cell = document.createElement('div');
  cell.className = 'md-img-cell';
  if (media) cell.appendChild(media);
  return cell;
}

function makeImgRow(mediaList) {
  const row = document.createElement('div');
  row.className = 'md-img-row';
  mediaList.forEach((m) => row.appendChild(makeImgCell(m)));
  return row;
}

/** Last meaningful child: image / image-row, skipping empty paragraphs. */
export function findLastImageAnchor(prose) {
  if (!prose) return null;
  for (let el = prose.lastElementChild; el; el = el.previousElementSibling) {
    if (el.classList?.contains('md-img-row')) return el;
    if (isImageOnlyBlock(el)) return el;
    const empty = !String(el.textContent || '').trim() && !el.querySelector?.('img,video');
    if (empty) continue;
    return null;
  }
  return null;
}

/** Group consecutive standalone images into side-by-side rows (2 per row). */
export function wrapAdjacentImages(root) {
  if (!root) return;
  const prose = root.classList?.contains('md-prose')
    ? root
    : (root.querySelector?.('.md-prose') || root);

  // Split a single paragraph that contains multiple images into a row.
  [...prose.querySelectorAll('p')].forEach((p) => {
    const media = [...p.querySelectorAll(':scope > img, :scope > video')];
    if (media.length < 2) return;
    if (String(p.textContent || '').trim()) return;
    const row = makeImgRow(media);
    p.replaceWith(row);
  });

  let guard = 0;
  while (guard++ < 50) {
    const blocks = [...prose.children];
    let changed = false;
    for (let i = 0; i < blocks.length; i++) {
      if (!isImageOnlyBlock(blocks[i])) continue;
      const run = [];
      let j = i;
      while (j < blocks.length && isImageOnlyBlock(blocks[j])) {
        run.push(blocks[j]);
        j += 1;
      }
      if (run.length < 2) continue;
      for (let k = 0; k < run.length; k += 2) {
        const pair = run.slice(k, k + 2);
        if (pair.length < 2) break;
        const medias = pair.flatMap(extractAllBlockMedia);
        if (medias.length < 2) continue;
        const row = makeImgRow(medias.slice(0, 2));
        pair[0].before(row);
        pair.forEach((block) => block.remove());
        changed = true;
      }
      break;
    }
    if (!changed) break;
  }
}

/** Force the last two images in the editor into one side-by-side row. */
export function pairLastTwoImages(root) {
  if (!root) return false;
  const prose = root.classList?.contains('md-prose')
    ? root
    : (root.querySelector?.('.md-prose') || root);
  wrapAdjacentImages(prose);
  const imgs = [...prose.querySelectorAll('img, video')];
  if (imgs.length < 2) return false;
  const a = imgs[imgs.length - 2];
  const b = imgs[imgs.length - 1];
  const rowA = a.closest('.md-img-row');
  const rowB = b.closest('.md-img-row');
  if (rowA && rowA === rowB) return true;

  const parentA = a.closest('p, .md-img-cell, .md-img-row');
  const parentB = b.closest('p, .md-img-cell, .md-img-row');
  const row = makeImgRow([a, b]);

  if (parentB && parentB !== parentA) {
    parentB.replaceWith(row);
    if (parentA && parentA.isConnected && !parentA.querySelector('img,video') && !String(parentA.textContent || '').trim()) {
      parentA.remove();
    }
  } else if (parentA) {
    parentA.replaceWith(row);
  } else {
    b.before(row);
  }
  // remove emptied wrappers left behind
  ;[parentA, parentB].forEach((p) => {
    if (p && p.isConnected && !p.querySelector('img,video') && !String(p.textContent || '').trim() && p !== row) p.remove();
  });
  return true;
}

/** Ensure highlight + markdown CSS once */
let _cssReady = false;
export function ensureMarkdownCss() {
  const links = [
    { id: 'md-cms-css', href: `${new URL('../../css/markdown-cms.css', import.meta.url).href}?v=guide-body-md-1` },
    { id: 'md-hljs-css', href: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/styles/github-dark.min.css' }
  ];
  links.forEach(({ id, href }) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (id === 'md-cms-css' && existing.getAttribute('href') !== href) existing.setAttribute('href', href);
      return;
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
  _cssReady = true;
}

/**
 * Render markdown source to safe HTML string.
 * @param {string} src
 * @param {{ className?: string }} [opts]
 */
export function renderMarkdown(src, opts = {}) {
  ensureMarkdownCss();
  const raw = String(src ?? '');
  if (!raw.trim()) return '';
  const md = getMd();
  let html;
  try {
    html = md.render(raw);
  } catch (e) {
    console.error('markdown render failed', e);
    html = `<p>${md.utils.escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
  }
  const clean = DOMPurify.sanitize(html, PURIFY_CFG);
  const cls = opts.className || 'md-prose';
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="${cls}">${clean}</div>`;
  wrapAdjacentImages(wrap.firstElementChild);
  return wrap.innerHTML;
}

/** Bind interactive bits (spoiler reveal, tabs) inside a rendered root */
export function bindMarkdownInteractions(root) {
  if (!root) return;
  root.querySelectorAll('.md-spoiler:not([data-bound])').forEach((el) => {
    el.dataset.bound = '1';
    const reveal = () => el.classList.add('is-revealed');
    el.addEventListener('click', reveal);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        reveal();
      }
    });
  });
  root.querySelectorAll('.md-tabs:not([data-bound])').forEach((tabs) => {
    tabs.dataset.bound = '1';
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.md-tab-btn');
      if (!btn || !tabs.contains(btn)) return;
      const i = btn.getAttribute('data-tab');
      tabs.querySelectorAll('.md-tab-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      tabs.querySelectorAll('.md-tab-panel').forEach((p) => {
        p.classList.toggle('is-active', p.getAttribute('data-tab-panel') === i);
      });
    });
  });
}

export function renderMarkdownInto(el, src, opts) {
  if (!el) return;
  el.innerHTML = renderMarkdown(src, opts);
  wrapAdjacentImages(el);
  bindMarkdownInteractions(el);
}

/**
 * Inline markdown (links, bold, code) without wrapping block tags.
 * Safe for feature bullets / one-line slots.
 */
export function renderMarkdownInline(src) {
  ensureMarkdownCss();
  const raw = String(src ?? '');
  if (!raw.trim()) return '';
  const md = getMd();
  let html;
  try {
    html = md.renderInline(raw);
  } catch (e) {
    console.error('markdown inline render failed', e);
    html = md.utils.escapeHtml(raw);
  }
  return DOMPurify.sanitize(html, PURIFY_CFG);
}

/** Strip markdown/link noise for clamped card previews (plain text only). */
export function plainTextFromMarkdown(src) {
  return String(src ?? '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[`*_~>#]+/g, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
