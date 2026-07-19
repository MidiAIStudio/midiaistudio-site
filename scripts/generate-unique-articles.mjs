/**
 * Rebuild all guide articles from topical-map + unique narratives.
 * EEAT/UX chrome via guide-ux.mjs (no visual redesign).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ARTICLES, PILLARS, CLUSTERS, SITE, assertUniquePrimaries } from "./topical-map.mjs";
import { NARRATIVES } from "./article-narratives.mjs";
import {
  AUTHOR,
  TODAY,
  PUBLISHED,
  esc,
  wordCount,
  readingMinutes,
  slugify,
  authorBox,
  metaBar,
  tocNav,
  prevNextNav,
  ctaBlock,
  relatedBlock,
  faqSection,
  breadcrumbsArticle,
} from "./guide-ux.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ART_DIR = path.join(ROOT, "guides", "articles");

assertUniquePrimaries();

for (const a of ARTICLES) {
  if (!NARRATIVES[a.slug]) throw new Error(`Missing narrative for ${a.slug}`);
}

function paras(arr) {
  return arr.map((p) => `<p>${p}</p>`).join("\n");
}

function buildBody(spec, n, minutes) {
  const ids = n.h2.map(slugify);
  const toc = tocNav(n.h2, ids, true);

  const img = `../../assets/images/product/${spec.screenshot}`;
  const figure = `<figure class="seo-figure">
<img src="${img}" alt="${esc(n.caption)}" title="${esc(n.caption)}" width="1280" height="720" loading="lazy" decoding="async">
<figcaption><span class="seo-fig-cap">${esc(n.caption)}</span> <span class="seo-fig-credit">Screenshot · MidiAI Studio · illustrates “${esc(spec.primary)}”</span></figcaption>
</figure>`;

  const altShot =
    spec.screenshot === "midi-editor-piano-roll.jpg"
      ? "ai-audio-to-midi-studio.jpg"
      : "midi-editor-piano-roll.jpg";
  const midFigure = `<figure class="seo-figure seo-figure-mid">
<img src="../../assets/images/product/${altShot}" alt="MidiAI Studio detail for ${esc(spec.primary)}" title="Supporting view for ${esc(spec.primary)}" width="1280" height="720" loading="lazy" decoding="async">
<figcaption><span class="seo-fig-cap">Supporting view while you follow the steps for “${esc(spec.primary)}”.</span> <span class="seo-fig-credit">MidiAI Studio UI</span></figcaption>
</figure>`;

  const stepsHtml = `<ol class="seo-steps">
${n.steps.map((s) => `<li><strong>${esc(s.title)}.</strong> ${s.body}</li>`).join("\n")}
</ol>`;

  const practicesHtml = `<ul class="seo-list">
${n.practices.map((p) => `<li>${p}</li>`).join("\n")}
</ul>`;

  const mistakesHtml = `<ul class="seo-list">
${n.mistakes.map((m) => `<li><strong>${esc(m.t)}:</strong> ${m.d}</li>`).join("\n")}
</ul>`;

  const blocks = [
    paras(n.definition),
    paras(n.mechanism),
    `<h3>${esc(n.example.title)}</h3>\n${paras(n.example.body)}\n${midFigure}\n${ctaBlock(spec, "mid")}`,
    stepsHtml,
    practicesHtml,
    mistakesHtml,
    paras(n.deeper.slice(0, 2)),
    paras(n.deeper.slice(2)),
  ];

  let sections = "";
  for (let i = 0; i < n.h2.length; i++) {
    sections += `\n<h2 id="${ids[i]}">${esc(n.h2[i])}</h2>\n${blocks[i] || ""}\n`;
  }

  return `
<p class="pill portal-pill" style="display:inline-block">Guide · ${esc(CLUSTERS[spec.cluster]?.name || spec.cluster)}</p>
<h1>${esc(n.h1)}</h1>
${metaBar({ minutes, intent: spec.intent, clusterName: CLUSTERS[spec.cluster]?.name || spec.cluster })}
${authorBox("../../")}
${toc}
${paras(n.intro)}
${figure}
${sections}
${ctaBlock(spec, "end")}
${faqSection(spec, n.faqs)}
${relatedBlock(spec)}
${prevNextNav(spec, "./")}
`;
}

function shell(spec, n, body, minutes) {
  const url = `${SITE}/guides/articles/${spec.slug}.html`;
  const faqs = n.faqs;
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: n.title,
      description: n.description,
      datePublished: PUBLISHED,
      dateModified: TODAY,
      timeRequired: `PT${minutes}M`,
      keywords: [spec.primary, ...spec.secondaries].join(", "),
      author: {
        "@type": "Person",
        name: AUTHOR.person,
        jobTitle: AUTHOR.role,
        url: `${SITE}/about.html`,
        worksFor: { "@type": "Organization", name: AUTHOR.org, url: SITE },
      },
      publisher: {
        "@type": "Organization",
        name: "MidiAI Studio",
        logo: { "@type": "ImageObject", url: `${SITE}/assets/images/symbol.png` },
      },
      image: [
        `${SITE}/assets/images/product/${spec.screenshot}`,
        `${SITE}/assets/images/symbol.png`,
      ],
      mainEntityOfPage: url,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a.replace(/<[^>]+>/g, "") },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE}/guides/` },
        ...(PILLARS.find((p) => p.slug === spec.parent)
          ? [
              {
                "@type": "ListItem",
                position: 3,
                name: PILLARS.find((p) => p.slug === spec.parent).primary,
                item: `${SITE}/guides/${spec.parent}.html`,
              },
            ]
          : []),
        { "@type": "ListItem", position: 4, name: n.h1, item: url },
      ],
    },
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(n.title)}</title>
  <meta name="description" content="${esc(n.description)}">
  <meta name="keywords" content="${esc([spec.primary, ...spec.secondaries].join(", "))}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="author" content="${esc(AUTHOR.person)}">
  <meta name="theme-color" content="#0b1020">
  <link rel="canonical" href="${url}">
  <link rel="icon" href="../../assets/images/symbol.png" type="image/png">
  <link rel="apple-touch-icon" href="../../assets/images/symbol.png">
  <link rel="manifest" href="../../manifest.webmanifest">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="MidiAI Studio">
  <meta property="og:title" content="${esc(n.title)}">
  <meta property="og:description" content="${esc(n.description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${SITE}/assets/images/product/${spec.screenshot}">
  <meta property="article:author" content="${esc(AUTHOR.person)}">
  <meta property="article:modified_time" content="${TODAY}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(n.title)}">
  <meta name="twitter:description" content="${esc(n.description)}">
  <meta name="twitter:image" content="${SITE}/assets/images/product/${spec.screenshot}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../assets/css/style.css?v=v81-sidebar-user-20260719">
  <link rel="stylesheet" href="../../assets/css/seo-content.css?v=20260720-eeat">
  <script defer src="../../assets/js/analytics.js"></script>
  ${schemas.map((s) => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`).join("\n")}
</head>
<body class="portal-page seo-page">
  <div class="orb orb-a"></div><div class="orb orb-b"></div>
  <a class="seo-skip" href="#guide-main">Skip to guide content</a>
  <header class="topbar">
    <a class="brand" href="../../index.html"><img class="brand-symbol" src="../../assets/images/symbol.png" alt="MidiAI Studio" width="40" height="40" title="MidiAI Studio"><b>MidiAI Studio</b></a>
    <button id="menuBtn" class="menu-btn" type="button" aria-label="Open menu">☰</button>
    <nav id="mainNav" aria-label="Primary">
      <a href="../../index.html">Home</a>
      <a href="../../product.html">Product</a>
      <a href="../../downloads.html">Downloads</a>
      <a href="../index.html">Guides</a>
      <a href="../../faq.html">FAQ</a>
      <a href="../../support.html">Support</a>
      <a href="../../about.html">About</a>
    </nav>
    <div class="actions"><a class="primary" href="../../downloads.html">Free trial</a></div>
  </header>
  <main class="portal-main" id="guide-main">
    <article class="wrap seo-prose" style="padding-top:36px;padding-bottom:48px">
      ${breadcrumbsArticle(spec, n.h1)}
      ${body}
    </article>
  </main>
  <footer class="site-footer legal-footer">
    <div class="footer-main">
      <div><strong>MidiAI Studio</strong><p>${esc(AUTHOR.org)}</p></div>
      <div class="footer-links">
        <a href="../../about.html">About</a>
        <a href="../index.html">Guides</a>
        <a href="../topical-map.html">Topical map</a>
        <a href="../../product.html">Product</a>
        <a href="../../downloads.html">Downloads</a>
        <a href="../../support.html">Support</a>
      </div>
    </div>
    <div class="footer-copy">© <span id="year"></span> MidiAI Studio</div>
  </footer>
  <script>document.getElementById('year').textContent=new Date().getFullYear();</script>
  <script>window.MIDIAI_BASE_PATH='../../';</script>
  <script type="module" src="../../assets/js/config.js"></script>
  <script type="module" src="../../assets/js/app.js"></script>
</body>
</html>`;
}

fs.mkdirSync(ART_DIR, { recursive: true });
const stats = [];
for (const spec of ARTICLES) {
  const n = NARRATIVES[spec.slug];
  // First pass for word estimate, second pass injects accurate read time
  const draft = buildBody(spec, n, 8);
  const words = wordCount(draft);
  const minutes = readingMinutes(words);
  const body = buildBody(spec, n, minutes);
  const html = shell(spec, n, body, minutes);
  fs.writeFileSync(path.join(ART_DIR, `${spec.slug}.html`), html, "utf8");
  stats.push({
    slug: spec.slug,
    words,
    minutes,
    primary: spec.primary,
    cluster: spec.cluster,
    intent: spec.intent,
    hasAuthor: html.includes("seo-author"),
    hasPager: html.includes("seo-pager"),
    hasMidCta: (html.match(/data-cta="/g) || []).length >= 2,
    faqOpen: (html.match(/<details open>/g) || []).length,
  });
}

fs.writeFileSync(path.join(ROOT, "guides", "articles.json"), JSON.stringify(stats, null, 2));
console.log(`Wrote ${stats.length} EEAT/UX articles`);
console.log(
  `words min=${Math.min(...stats.map((s) => s.words))} max=${Math.max(...stats.map((s) => s.words))}`
);
console.log(
  `read min=${Math.min(...stats.map((s) => s.minutes))} max=${Math.max(...stats.map((s) => s.minutes))} min`
);
