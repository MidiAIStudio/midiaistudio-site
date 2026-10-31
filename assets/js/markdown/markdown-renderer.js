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
    if (isExternal) {
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

function isImageOnlyBlock(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.classList?.contains('md-img-row') || el.classList?.contains('md-img-cell')) return false;
  if (/^(IMG|VIDEO)$/.test(el.tagName)) return true;
  if (el.tagName === 'P') {
    const kids = [...el.childNodes].filter((n) => !(n.nodeType === 3 && !String(n.textContent || '').trim()));
    return kids.length === 1 && kids[0].nodeType === 1 && /^(IMG|VIDEO)$/.test(kids[0].tagName);
  }
  return false;
}

function extractBlockMedia(el) {
  if (/^(IMG|VIDEO)$/.test(el.tagName)) return el;
  return el.querySelector?.('img, video') || null;
}

/** Group consecutive standalone images into side-by-side rows (2 per row). */
export function wrapAdjacentImages(root) {
  if (!root) return;
  const prose = root.classList?.contains('md-prose')
    ? root
    : (root.querySelector?.('.md-prose') || root);
  const blocks = [...prose.children];
  let i = 0;
  while (i < blocks.length) {
    if (!isImageOnlyBlock(blocks[i])) { i += 1; continue; }
    const run = [];
    let j = i;
    while (j < blocks.length && isImageOnlyBlock(blocks[j])) {
      run.push(blocks[j]);
      j += 1;
    }
    if (run.length >= 2) {
      for (let k = 0; k < run.length; k += 2) {
        const pair = run.slice(k, k + 2);
        if (pair.length < 2) break;
        const row = document.createElement('div');
        row.className = 'md-img-row';
        pair[0].before(row);
        pair.forEach((block) => {
          const media = extractBlockMedia(block);
          const cell = document.createElement('div');
          cell.className = 'md-img-cell';
          if (media) cell.appendChild(media);
          row.appendChild(cell);
          block.remove();
        });
      }
      blocks.splice(0, blocks.length, ...prose.children);
      i = 0;
      continue;
    }
    i = j;
  }
}

/** Ensure highlight + markdown CSS once */
let _cssReady = false;
export function ensureMarkdownCss() {
  if (_cssReady) return;
  _cssReady = true;
  const links = [
    { id: 'md-cms-css', href: new URL('../../css/markdown-cms.css', import.meta.url).href },
    { id: 'md-hljs-css', href: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.10.0/build/styles/github-dark.min.css' }
  ];
  links.forEach(({ id, href }) => {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
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
