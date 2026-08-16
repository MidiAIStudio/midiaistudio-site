/**
 * Writes crawlable /guide/{slug}/index.html shells for GitHub Pages
 * (directory URLs, no Hosting rewrites) + assets/js/guide-seo.js
 * Does not touch Firestore guide sections/media.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GUIDE_SEO, SITE, canonicalForSlug } from "./guide-seo-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OG = `${SITE}/assets/images/product/ai-midi-converter-home.jpg`;
const ASSET = "../../";

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pillarHref(slug) {
  if (slug === "audio-to-midi") return `${ASSET}guides/audio-to-midi.html`;
  if (slug === "youtube-to-midi") return `${ASSET}guides/youtube-to-midi.html`;
  if (slug === "pdf-to-midi") return `${ASSET}guides/pdf-to-midi.html`;
  if (slug === "midi-editor") return `${ASSET}guides/midi-editor.html`;
  if (slug === "ai-assistant") return `${ASSET}guides/ai-transcription.html`;
  return `${ASSET}guides/`;
}

function howToJsonLd(slug, seo) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: seo.h1,
    description: seo.summary,
    url: canonicalForSlug(slug),
    step: seo.steps.map((st, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: st.name,
      text: st.text,
    })),
  };
}

function faqJsonLd(seo) {
  if (!seo.faq?.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: seo.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function fallbackHtml(slug, seo) {
  const related = (seo.related || [])
    .map((r) => {
      const t = GUIDE_SEO[r]?.h1 || r;
      return `<li><a href="../${r}/">${esc(t)}</a></li>`;
    })
    .join("");
  const steps = seo.steps
    .map((st) => `<li><h3>${esc(st.name)}</h3><p>${esc(st.text)}</p></li>`)
    .join("");
  const faq = (seo.faq || [])
    .map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
    .join("");
  return `<article id="guideSeoFallback" class="wrap guide-seo-fallback">
      <p class="pill portal-pill">Guide</p>
      <h1>${esc(seo.h1)}</h1>
      <p class="portal-lead">${esc(seo.summary)}</p>
      <h2>단계별 안내</h2>
      <ol class="guide-seo-steps">${steps}</ol>
      <p>화면 스크린샷과 최신 단계는 아래에서 불러옵니다. Firestore를 읽지 못하는 환경에서도 위 요약은 HTML에 포함됩니다.</p>
      <h2>관련 기능</h2>
      <ul>${related}</ul>
      <p><a href="${pillarHref(slug)}">검색용 상세 가이드</a>
      · <a href="../index.html">전체 Guide 목록</a></p>
      ${faq ? `<h2>FAQ</h2>${faq}` : ""}
    </article>`;
}

function pageHtml(slug, seo) {
  const canon = canonicalForSlug(slug);
  const howTo = JSON.stringify(howToJsonLd(slug, seo));
  const faq = faqJsonLd(seo);
  const faqBlock = faq ? `<script type="application/ld+json">\n${JSON.stringify(faq)}\n</script>` : "";
  const crumb = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Guide", item: `${SITE}/guide/` },
      { "@type": "ListItem", position: 3, name: seo.h1, item: canon },
    ],
  });
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(seo.title)}</title>
  <meta name="description" content="${esc(seo.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(canon)}">
  <link rel="icon" href="${ASSET}assets/images/symbol.png" type="image/png" sizes="any">
  <link rel="apple-touch-icon" href="${ASSET}assets/images/symbol.png">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="MidiAI Studio">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${esc(seo.title)}">
  <meta property="og:description" content="${esc(seo.description)}">
  <meta property="og:url" content="${esc(canon)}">
  <meta property="og:image" content="${OG}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(seo.title)}">
  <meta name="twitter:description" content="${esc(seo.description)}">
  <meta name="twitter:image" content="${OG}">
  <link rel="stylesheet" href="${ASSET}assets/css/style.css?v=nav-soon-1">
  <link rel="stylesheet" href="${ASSET}assets/css/markdown-cms.css?v=md-cms-2">
  <script defer src="${ASSET}assets/js/analytics.js"></script>
  <script type="application/ld+json">${howTo}</script>
  ${faqBlock}
  <script type="application/ld+json">${crumb}</script>
</head>
<body>
<header class="topbar">
    <a class="brand" href="${ASSET}index.html"><img class="brand-symbol" src="${ASSET}assets/images/symbol.png" alt="MidiAI Studio" width="40" height="40"><b>MidiAI Studio</b></a>
    <nav id="mainNav" aria-label="주요 메뉴"></nav>
    <div class="actions"><button id="langBtn" class="ghost" type="button">EN</button><button id="loginBtn" class="login" type="button"><span>G</span><em>Google 로그인</em></button><button id="logoutBtn" class="ghost hidden" type="button">로그아웃</button></div>
  </header>
  <main id="main" class="portal-main guide-learn-page">
    <div id="guideCmsBar" class="guide-cms-bar hidden wrap" role="toolbar" aria-label="가이드 관리">
      <button type="button" class="secondary mini-btn" data-cms="edit">편집</button>
      <button type="button" class="secondary mini-btn hidden" data-cms="preview">미리보기</button>
      <button type="button" class="primary mini-btn" data-cms="save" disabled>저장</button>
      <button type="button" class="secondary mini-btn hidden" data-cms="add-section">+ 제품 카드 템플릿</button>
      <button type="button" class="ghost mini-btn" data-cms="delete">삭제</button>
      <span id="guideCmsStatus" class="guide-cms-status is-saved">✓ 저장 완료</span>
      <a class="ghost mini-btn" href="../index.html">목록</a>
    </div>
    ${fallbackHtml(slug, seo)}
    <div id="guideDetail" aria-live="polite">
      <div class="wrap empty-card">가이드를 불러오는 중…</div>
    </div>
  </main>
  <footer class="site-footer legal-footer">
    <div class="footer-main">
      <div class="footer-brand"><img src="${ASSET}assets/images/symbol.png" alt="MidiAI Studio" width="32" height="32" title="MidiAI Studio"><div><strong>MidiAI Studio</strong><p>AI 기반 MIDI 변환 소프트웨어</p></div></div>
      <div class="footer-links">
        <a href="${ASSET}support.html">고객센터</a><a href="${ASSET}terms.html">이용약관</a><a href="${ASSET}privacy.html">개인정보처리방침</a><a href="${ASSET}refund.html">환불정책</a><a href="${ASSET}business-info.html">사업자정보</a>
      </div>
    </div>
    <div class="business-box">
      <span>상호: 미디에이아이스튜디오</span><span>대표자: 최정환</span><span>사업장 주소: 경상남도 창원시 성산구 창원대로780번길 47, 1101호</span><span>대표전화: 010-2166-5563</span>
      <span>통신판매업: 제2026-창원성산-0312호</span><span>이메일: midiaistudio@gmail.com</span>
    </div>
    <div class="footer-copy">© <span id="year"></span> MidiAI Studio</div>
  </footer>
  <script>window.MIDIAI_BASE_PATH='${ASSET}';</script>
  <script type="module" src="${ASSET}assets/js/config.js"></script>
  <script type="module" src="${ASSET}assets/js/app.js?v=nav-soon-1"></script>
  <script type="module" src="${ASSET}assets/js/guide-cms.js?v=guide-seo-1"></script>
</body>
</html>
`;
}

function stubHtml(slug, seo) {
  const canon = canonicalForSlug(slug);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(seo.title)}</title>
  <meta name="description" content="${esc(seo.description)}">
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="${esc(canon)}">
  <meta http-equiv="refresh" content="0; url=./${esc(slug)}/">
</head>
<body>
  <p><a href="./${esc(slug)}/">${esc(seo.h1)}</a></p>
</body>
</html>
`;
}

function writeBrowserModule() {
  const payload = {};
  for (const [slug, seo] of Object.entries(GUIDE_SEO)) {
    payload[slug] = {
      title: seo.title,
      description: seo.description,
      canonical: canonicalForSlug(slug),
      h1: seo.h1,
    };
  }
  const js = `/** Generated from scripts/guide-seo-data.mjs — do not edit by hand. */
export const GUIDE_SEO = ${JSON.stringify(payload, null, 2)};

export function guideSlugFromLocation() {
  const q = new URLSearchParams(location.search).get('slug');
  if (q) return q.trim();
  const p = location.pathname.replace(/\\\\/g, '/');
  const m = p.match(/\\/guide\\/([a-z0-9-]+)(?:\\.html)?\\/?$/i);
  if (m && m[1].toLowerCase() !== 'index') return m[1];
  return '';
}

export function prettyGuidePath(slug) {
  return 'guide/' + encodeURIComponent(slug) + '/';
}

function upsertMeta(attr, key, value) {
  if (!value) return;
  let el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function upsertLinkRel(rel, href) {
  let el = document.head.querySelector('link[rel="' + rel + '"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function applyGuideDocumentSeo(slug, liveTitle) {
  const seo = GUIDE_SEO[slug];
  const title = seo?.title
    || ((liveTitle && String(liveTitle).trim()) ? (liveTitle + ' | MidiAI Studio') : 'Guide — MidiAI Studio');
  document.title = title;
  const desc = seo?.description || '';
  const canon = seo?.canonical || (location.origin + location.pathname);
  if (desc) {
    upsertMeta('name', 'description', desc);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('name', 'twitter:description', desc);
  }
  upsertMeta('property', 'og:title', title);
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('property', 'og:url', canon);
  upsertLinkRel('canonical', canon);
}

export function hideGuideSeoFallback() {
  const el = document.getElementById('guideSeoFallback');
  if (el) el.hidden = true;
}

export function mediaAltForGuide(g, section) {
  const gTitle = (g && (g.title || g.slug)) || 'MidiAI Studio';
  const sTitle = section && (section.title || section.id);
  if (sTitle) return 'MidiAI Studio ' + gTitle + ' — ' + sTitle;
  return 'MidiAI Studio ' + gTitle + ' 화면';
}
`;
  fs.writeFileSync(path.join(ROOT, "assets/js/guide-seo.js"), js, "utf8");
}

function main() {
  writeBrowserModule();
  const dir = path.join(ROOT, "guide");
  fs.mkdirSync(dir, { recursive: true });
  for (const [slug, seo] of Object.entries(GUIDE_SEO)) {
    const nested = path.join(dir, slug);
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "index.html"), pageHtml(slug, seo), "utf8");
    fs.writeFileSync(path.join(dir, `${slug}.html`), stubHtml(slug, seo), "utf8");
  }
  console.log(`Wrote ${Object.keys(GUIDE_SEO).length} directory shells + .html stubs + assets/js/guide-seo.js`);
}

main();
