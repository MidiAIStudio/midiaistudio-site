/**
 * Custom markdown-it plugins: Discord spoiler/quote/emoji, GitHub alerts,
 * :::containers, buttons, YouTube embeds.
 */

const EMOJI_MAP = {
  smile: '😄', grinning: '😀', joy: '😂', heart: '❤️', fire: '🔥',
  thumbsup: '👍', thumbsdown: '👎', clap: '👏', tada: '🎉', rocket: '🚀',
  eyes: '👀', thinking: '🤔', wink: '😉', sob: '😭', cool: '😎',
  check: '✅', x: '❌', warning: '⚠️', bulb: '💡', star: '⭐',
  sparkles: '✨', wave: '👋', pray: '🙏', muscle: '💪', hundred: '💯',
  ok_hand: '👌', raised_hands: '🙌', memo: '📝', link: '🔗', package: '📦'
};

const ALERT_TYPES = new Set(['NOTE', 'TIP', 'WARNING', 'IMPORTANT', 'CAUTION']);

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function youtubeId(url) {
  if (!url) return '';
  const m = String(url).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/i
  );
  return m ? m[1] : '';
}

/** Discord ||spoiler|| */
export function pluginSpoiler(md) {
  md.core.ruler.after('inline', 'discord_spoiler', (state) => {
    const re = /\|\|([\s\S]+?)\|\|/g;
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children?.length) continue;
      const next = [];
      for (const child of token.children) {
        if (child.type !== 'text' || !child.content.includes('||')) {
          next.push(child);
          continue;
        }
        let last = 0;
        const s = child.content;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(s))) {
          if (m.index > last) {
            next.push({ ...child, content: s.slice(last, m.index) });
          }
          next.push({
            type: 'html_inline',
            content: '<span class="md-spoiler" tabindex="0" role="button">',
            level: child.level
          });
          next.push({ ...child, content: m[1] });
          next.push({ type: 'html_inline', content: '</span>', level: child.level });
          last = m.index + m[0].length;
        }
        if (last < s.length) next.push({ ...child, content: s.slice(last) });
      }
      token.children = next;
    }
  });
}

/** :smile: shortcodes */
export function pluginEmoji(md) {
  md.inline.ruler.before('text', 'emoji_shortcode', (state, silent) => {
    const start = state.pos;
    if (state.src.charCodeAt(start) !== 0x3a /* : */) return false;
    const match = state.src.slice(start).match(/^:([a-z0-9_+-]+):/);
    if (!match) return false;
    const emoji = EMOJI_MAP[match[1]];
    if (!emoji) return false;
    if (!silent) {
      const token = state.push('text', '', 0);
      token.content = emoji;
    }
    state.pos += match[0].length;
    return true;
  });
}

/** GitHub-style > [!NOTE] alerts + Discord >>> multiline quote */
export function pluginAlertsAndQuotes(md) {
  const defaultBlockquote = md.renderer.rules.blockquote_open
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.core.ruler.after('block', 'github_alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;
      const inline = tokens[i + 2];
      if (!inline || inline.type !== 'inline') continue;
      const m = inline.content.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*/i);
      if (!m) continue;
      const kind = m[1].toUpperCase();
      if (!ALERT_TYPES.has(kind)) continue;
      tokens[i].attrJoin('class', `md-alert md-alert-${kind.toLowerCase()}`);
      tokens[i].attrSet('data-alert', kind);
      inline.content = inline.content.slice(m[0].length);
      if (inline.children?.[0]?.type === 'text') {
        inline.children[0].content = inline.children[0].content.replace(
          /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*/i,
          ''
        );
      }
    }
  });

  md.block.ruler.before('blockquote', 'discord_multiline_quote', (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (pos + 3 > max) return false;
    if (state.src.slice(pos, pos + 3) !== '>>>') return false;
    if (silent) return true;

    const tokenOpen = state.push('blockquote_open', 'blockquote', 1);
    tokenOpen.attrJoin('class', 'md-quote-multi');
    tokenOpen.map = [startLine, startLine];

    let nextLine = startLine;
    const firstContent = state.src.slice(pos + 3, max).replace(/^\s*/, '');
    if (firstContent) {
      const pOpen = state.push('paragraph_open', 'p', 1);
      pOpen.map = [startLine, startLine + 1];
      const inline = state.push('inline', '', 0);
      inline.content = firstContent;
      inline.map = [startLine, startLine + 1];
      inline.children = [];
      state.push('paragraph_close', 'p', -1);
    }
    nextLine++;
    while (nextLine < endLine) {
      if (state.isEmpty(nextLine)) break;
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const line = state.src.slice(lineStart, lineEnd);
      const pOpen = state.push('paragraph_open', 'p', 1);
      pOpen.map = [nextLine, nextLine + 1];
      const inline = state.push('inline', '', 0);
      inline.content = line;
      inline.map = [nextLine, nextLine + 1];
      inline.children = [];
      state.push('paragraph_close', 'p', -1);
      nextLine++;
    }
    state.push('blockquote_close', 'blockquote', -1);
    state.line = nextLine;
    return true;
  });

  md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
    const t = tokens[idx];
    const alert = t.attrGet('data-alert');
    if (alert) {
      const label = alert.charAt(0) + alert.slice(1).toLowerCase();
      return `<blockquote class="${escapeHtml(t.attrGet('class') || '')}" data-alert="${escapeHtml(alert)}"><div class="md-alert-label">${escapeHtml(label)}</div>`;
    }
    return defaultBlockquote(tokens, idx, options, env, self);
  };
}

function parseTabs(content) {
  const parts = String(content || '').split(/^@tab\s+/m).filter(Boolean);
  return parts.map((part) => {
    const nl = part.indexOf('\n');
    if (nl < 0) return { name: part.trim(), body: '' };
    return { name: part.slice(0, nl).trim(), body: part.slice(nl + 1) };
  });
}

/**
 * :::type Title?
 * body
 * :::
 */
export function pluginContainers(md) {
  const TYPES = new Set([
    'step', 'tip', 'warning', 'success', 'feature', 'price', 'faq', 'details', 'tabs'
  ]);

  md.block.ruler.before('fence', 'md_container', (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    if (state.src.slice(startPos, startPos + 3) !== ':::') return false;
    const header = state.src.slice(startPos + 3, max).trim();
    const hm = header.match(/^([a-zA-Z]+)(?:\s+(.*))?$/);
    if (!hm || !TYPES.has(hm[1].toLowerCase())) return false;
    const type = hm[1].toLowerCase();
    const title = (hm[2] || '').trim();
    if (silent) return true;

    let nextLine = startLine + 1;
    let found = false;
    while (nextLine < endLine) {
      const p = state.bMarks[nextLine] + state.tShift[nextLine];
      const e = state.eMarks[nextLine];
      if (state.src.slice(p, e).trim() === ':::') {
        found = true;
        break;
      }
      nextLine++;
    }
    if (!found) return false;

    const content = state.getLines(startLine + 1, nextLine, state.tShift[startLine], true);
    const token = state.push('md_container', 'div', 0);
    token.block = true;
    token.info = type;
    token.meta = { title, content };
    token.map = [startLine, nextLine + 1];
    state.line = nextLine + 1;
    return true;
  });

  md.renderer.rules.md_container = (tokens, idx) => {
    const t = tokens[idx];
    const type = t.info;
    const { title, content } = t.meta || {};
    const body = String(content || '').trim();

    if (type === 'tabs') {
      const tabs = parseTabs(body);
      let html = '<div class="md-tabs">';
      html += '<div class="md-tabs-nav" role="tablist">';
      tabs.forEach((tab, i) => {
        html += `<button type="button" class="md-tab-btn${i === 0 ? ' is-active' : ''}" data-tab="${i}" role="tab">${escapeHtml(tab.name)}</button>`;
      });
      html += '</div>';
      tabs.forEach((tab, i) => {
        html += `<div class="md-tab-panel${i === 0 ? ' is-active' : ''}" data-tab-panel="${i}" role="tabpanel">${md.render(tab.body)}</div>`;
      });
      return `${html}</div>`;
    }

    if (type === 'faq') {
      const lines = body.split(/\n/);
      const q = lines[0] || '';
      const a = lines.slice(1).join('\n').trim();
      return `<details class="md-faq"><summary>${escapeHtml(q)}</summary><div class="md-faq-a">${md.render(a)}</div></details>`;
    }

    if (type === 'details') {
      return `<details class="md-details"><summary>${escapeHtml(title || 'Details')}</summary><div class="md-details-body">${md.render(body)}</div></details>`;
    }

    if (type === 'feature') {
      const lines = body.split(/\n/);
      const featTitle = title || lines[0] || 'Feature';
      const featBody = title ? body : lines.slice(1).join('\n').trim();
      return `<div class="md-feature-card"><div class="md-feature-title">${escapeHtml(featTitle)}</div><div class="md-feature-body">${md.render(featBody)}</div></div>`;
    }

    if (type === 'price') {
      const price = (body || title || '').trim();
      return `<div class="md-price-card"><span class="md-price-value">${escapeHtml(price)}</span></div>`;
    }

    const label = title || ({
      step: 'Step', tip: 'Tip', warning: 'Warning', success: 'Success'
    }[type] || type);
    return `<div class="md-card md-card-${type}"><div class="md-card-label">${escapeHtml(label)}</div><div class="md-card-body">${md.render(body)}</div></div>`;
  };
}

/** [button]text[/button] and [button=success]text[/button] */
export function pluginButtons(md) {
  md.inline.ruler.before('link', 'md_button', (state, silent) => {
    const start = state.pos;
    const src = state.src.slice(start);
    const m = src.match(/^\[button(?:=([a-zA-Z]+))?\]([\s\S]*?)\[\/button\]/);
    if (!m) return false;
    if (!silent) {
      const token = state.push('md_button', 'a', 0);
      token.meta = { variant: (m[1] || 'primary').toLowerCase(), text: m[2].trim() };
      token.content = m[2].trim();
    }
    state.pos += m[0].length;
    return true;
  });
  md.renderer.rules.md_button = (tokens, idx) => {
    const { variant, text } = tokens[idx].meta || {};
    const hrefMatch = String(text).match(/^(.*?)\s*\((https?:\/\/[^)]+)\)\s*$/);
    const label = hrefMatch ? hrefMatch[1].trim() : text;
    const href = hrefMatch ? hrefMatch[2] : '#';
    return `<a class="md-btn md-btn-${escapeHtml(variant || 'primary')}" href="${escapeHtml(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`;
  };
}

/** Standalone YouTube URL paragraphs → embed */
export function pluginYoutube(md) {
  md.core.ruler.after('inline', 'youtube_embed', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i].type !== 'paragraph_open') continue;
      const inline = tokens[i + 1];
      if (!inline || inline.type !== 'inline') continue;
      const text = inline.content.trim();
      const id = youtubeId(text);
      if (!id) continue;
      const onlyUrl = /^https?:\/\/(?:www\.)?(?:youtu\.be\/|youtube\.com\/)\S+$/i.test(text);
      if (!onlyUrl) continue;
      tokens[i] = {
        type: 'html_block',
        content: `<div class="md-video"><iframe src="https://www.youtube.com/embed/${id}" title="YouTube" allowfullscreen loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`,
        block: true,
        level: 0
      };
      tokens[i + 1].content = '';
      tokens[i + 1].children = [];
      tokens[i + 2] = { type: 'html_block', content: '', block: true, level: 0 };
    }
  });
}

export function applyAllPlugins(md) {
  pluginSpoiler(md);
  pluginEmoji(md);
  pluginAlertsAndQuotes(md);
  pluginContainers(md);
  pluginButtons(md);
  pluginYoutube(md);
  return md;
}

export { youtubeId, EMOJI_MAP, escapeHtml };
