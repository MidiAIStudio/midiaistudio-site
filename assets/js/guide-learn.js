/**
 * Guide Learning Center — public presentation helpers.
 * Does not touch Firestore writes or shared markdown renderer.
 * Optional CMS fields used when present: level, duration, chapters[{title,start}], mediaCaption.
 */

import { esc } from './visual-cms.js?v=slot-scale-22';

/** Preferential chip order for known product flows (matched by category/title/slug). */
export const GUIDE_CHIP_PRESETS = [
  { id: 'all', label: '전체' },
  { id: '시작', label: '시작하기', match: (g) => /시작|getting|install/i.test(`${g.category} ${g.slug} ${g.title}`) },
  { id: 'youtube', label: 'YouTube → MIDI', match: (g) => /youtube/i.test(`${g.slug} ${g.title}`) },
  { id: 'midi-edit', label: 'MIDI 편집', match: (g) => /midi-editor|midi 편집|편집/i.test(`${g.slug} ${g.title}`) && !/score|악보/i.test(`${g.slug} ${g.title}`) },
  { id: 'pdf', label: 'PDF → MIDI', match: (g) => /pdf/i.test(`${g.slug} ${g.title}`) },
  { id: 'ai', label: 'AI Assistant', match: (g) => /ai-assistant|ai /i.test(`${g.slug} ${g.title} ${g.category}`) },
  { id: 'install', label: '설치 / 업데이트', match: (g) => /license|계정|install|업데이트/i.test(`${g.slug} ${g.title} ${g.category}`) },
  { id: 'trouble', label: '문제 해결', match: (g) => /trouble|문제|도움/i.test(`${g.slug} ${g.title} ${g.category}`) }
];

export function guideThumb(g) {
  if (g.heroImage) return { type: 'image', url: g.heroImage };
  const secs = Array.isArray(g.sections) ? g.sections : [];
  for (const s of secs) {
    if (s.mediaType === 'image' && s.mediaUrl) return { type: 'image', url: s.mediaUrl };
    if ((s.mediaType === 'video' || s.mediaType === 'youtube') && s.posterUrl) return { type: 'image', url: s.posterUrl };
  }
  return { type: 'icon', url: '' };
}

export function guideStepCount(g) {
  if (Array.isArray(g.sections) && g.sections.length) return g.sections.length;
  if (Array.isArray(g.steps) && g.steps.length) return g.steps.length;
  return 0;
}

export function guideMatchesQuery(g, q) {
  if (!q) return true;
  const hay = [
    g.title, g.summary, g.category, g.slug,
    ...(g.features || []),
    ...(g.steps || []).flatMap((s) => [s.title, s.body]),
    ...(g.sections || []).flatMap((s) => [s.title, s.body, s.category, ...(s.features || [])])
  ].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function guideMatchesChip(g, chipId) {
  if (!chipId || chipId === 'all') return true;
  const preset = GUIDE_CHIP_PRESETS.find((c) => c.id === chipId);
  if (preset?.match) return preset.match(g);
  return String(g.category || '') === chipId;
}

export function buildCategoryChips(guides) {
  const chips = [...GUIDE_CHIP_PRESETS];
  const seen = new Set(chips.map((c) => c.id));
  for (const g of guides) {
    const cat = String(g.category || '').trim();
    if (!cat || seen.has(cat)) continue;
    // Skip if already covered by a preset match for most docs
    const covered = GUIDE_CHIP_PRESETS.some((c) => c.match && c.id !== 'all' && c.match(g));
    if (covered) continue;
    seen.add(cat);
    chips.push({ id: cat, label: cat, match: (x) => String(x.category || '') === cat });
  }
  return chips;
}

export function cardMetaBits(g) {
  const bits = [];
  if (g.level) bits.push(esc(g.level));
  if (g.duration) bits.push(esc(g.duration));
  const n = guideStepCount(g);
  if (n) bits.push(`${n}단계`);
  return bits;
}

export function renderGuideCard(g, pathBase) {
  const href = `${pathBase}guide.html?slug=${encodeURIComponent(g.slug || g.id)}`;
  const thumb = guideThumb(g);
  const badge = g.published === false ? `<span class="guide-draft-badge">초안</span>` : '';
  const meta = cardMetaBits(g);
  const media = thumb.type === 'image'
    ? `<div class="guide-hub-card-media"><img src="${esc(thumb.url)}" alt="" loading="lazy" decoding="async" width="640" height="360"></div>`
    : `<div class="guide-hub-card-media is-empty" aria-hidden="true"><span></span></div>`;
  return `<a class="guide-hub-card" href="${esc(href)}" data-guide-slug="${esc(g.slug || g.id)}">
    ${media}
    <div class="guide-hub-card-body">
      <span class="guide-card-cat">${esc(g.category || 'Guide')}</span>
      <h3>${esc(g.title || g.slug)}${badge}</h3>
      <p>${esc(g.summary || '')}</p>
      ${meta.length ? `<div class="guide-hub-card-meta">${meta.map((b) => `<em>${b}</em>`).join('')}</div>` : ''}
    </div>
  </a>`;
}

export function sectionTocItems(sections) {
  return (sections || []).map((s, i) => ({
    id: `guide-step-${i}`,
    label: s.title || `단계 ${i + 1}`,
    index: i
  }));
}

export function padStep(i) {
  return String(i + 1).padStart(2, '0');
}

/** Optional chapters: [{ title, start }] seconds — only used when present on CMS doc. */
export function chaptersHtml(chapters) {
  if (!Array.isArray(chapters) || !chapters.length) return '';
  return `<div class="guide-video-chapters" role="list">
    ${chapters.map((c, i) => {
      const start = Number(c.start);
      if (!Number.isFinite(start)) return '';
      return `<button type="button" class="guide-chapter-btn" role="listitem" data-chapter-start="${start}">
        <b>${padStep(i)}</b><span>${esc(c.title || `구간 ${i + 1}`)}</span>
      </button>`;
    }).filter(Boolean).join('')}
  </div>`;
}

export function lightboxEnsure() {
  let el = document.getElementById('guideLightbox');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'guideLightbox';
  el.className = 'guide-lightbox hidden';
  el.innerHTML = `<button type="button" class="guide-lightbox-close" aria-label="닫기">×</button>
    <img alt="" decoding="async">
    <p class="guide-lightbox-cap"></p>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.classList.contains('guide-lightbox-close')) {
      el.classList.add('hidden');
      el.querySelector('img').src = '';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') el.classList.add('hidden');
  });
  return el;
}

export function openLightbox(src, caption) {
  const el = lightboxEnsure();
  const img = el.querySelector('img');
  const cap = el.querySelector('.guide-lightbox-cap');
  img.src = src;
  cap.textContent = caption || '';
  el.classList.remove('hidden');
}

export function bindScrollSpy(root, linkSelector) {
  const links = [...root.querySelectorAll(linkSelector)];
  const targets = links
    .map((a) => {
      const id = (a.getAttribute('href') || '').replace(/^#/, '');
      return id ? document.getElementById(id) : null;
    })
    .filter(Boolean);
  if (!targets.length) return () => {};

  const setActive = (id) => {
    links.forEach((a) => {
      const on = (a.getAttribute('href') || '') === `#${id}`;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  };

  const io = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (visible[0]?.target?.id) setActive(visible[0].target.id);
  }, { rootMargin: '-20% 0px -55% 0px', threshold: [0.15, 0.4, 0.7] });

  targets.forEach((t) => io.observe(t));
  return () => io.disconnect();
}

export function bindGuideImageZoom(root) {
  root.addEventListener('click', (e) => {
    const img = e.target.closest('.guide-learn-step-media img, .guide-learn-hero-media img, .guide-hub-card-media img');
    if (!img || !img.src) return;
    // Don't intercept admin annot editor clicks
    if (document.body.classList.contains('guide-cms-editing')) return;
    e.preventDefault();
    const cap = img.closest('figure')?.querySelector('figcaption')?.textContent
      || img.getAttribute('alt')
      || '';
    openLightbox(img.src, cap);
  });
}
