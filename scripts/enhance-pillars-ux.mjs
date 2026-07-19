/**
 * Enhance pillar landing pages + FAQ guide with the same EEAT/UX chrome
 * without redesigning the portal visual system.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ARTICLES, PILLARS, CLUSTERS, SITE } from "./topical-map.mjs";
import { NARRATIVES } from "./article-narratives.mjs";
import {
  AUTHOR,
  TODAY,
  PUBLISHED,
  esc,
  authorBox,
  readingMinutes,
  wordCount,
} from "./guide-ux.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUIDES = path.join(ROOT, "guides");

function pillarArticles(pillarSlug) {
  return ARTICLES.filter((a) => a.parent === pillarSlug).slice(0, 8);
}

function enhancePillar(file, pillar) {
  const full = path.join(GUIDES, file);
  if (!fs.existsSync(full)) return { file, skipped: true };
  let html = fs.readFileSync(full, "utf8");
  const words = wordCount(html);
  const minutes = readingMinutes(words);

  // Bump CSS version
  html = html.replace(/seo-content\.css\?v=[^"]+/g, "seo-content.css?v=20260720-eeat");

  // Inject skip link once
  if (!html.includes("seo-skip")) {
    html = html.replace(
      /<body([^>]*)>/,
      `<body$1>\n  <a class="seo-skip" href="#guide-main">Skip to guide content</a>`
    );
  }
  if (!html.includes('id="guide-main"')) {
    html = html.replace(/<main([^>]*)>/, `<main$1 id="guide-main">`);
  }

  // Enrich breadcrumbs if thin
  if (!html.includes(`Pillar ·`) && html.includes("seo-breadcrumbs")) {
    html = html.replace(
      /(<nav class="seo-breadcrumbs"[^>]*>)([\s\S]*?)(<\/nav>)/,
      `$1<a href="../index.html">Home</a> › <a href="./index.html">Guides</a> › <span aria-current="page">${esc(pillar.primary)}</span>$3`
    );
  }

  // Insert meta + author after first h1 if missing
  if (!html.includes("seo-author")) {
    const meta = `<div class="seo-meta" role="group" aria-label="Article metadata">
  <span><time datetime="${PUBLISHED}">Published ${PUBLISHED}</time></span>
  <span><time datetime="${TODAY}">Updated ${TODAY}</time></span>
  <span class="seo-read-time">${minutes} min read</span>
  <span>Pillar · owns primary “${esc(pillar.primary)}”</span>
</div>
${authorBox("../")}
`;
    html = html.replace(/(<h1>[^<]*<\/h1>)/, `$1\n${meta}`);
  }

  // Cluster article list block before final CTA / related if not present
  const kids = pillarArticles(pillar.slug);
  if (kids.length && !html.includes("seo-pillar-children")) {
    const list = `<section class="seo-related seo-pillar-children" aria-label="Supporting articles">
<h2>Supporting articles in this topic</h2>
<p class="seo-related-lead">These long-tail guides support the pillar primary <strong>${esc(pillar.primary)}</strong> without competing for it.</p>
${kids
  .map((a) => {
    const n = NARRATIVES[a.slug];
    return `<a href="./articles/${a.slug}.html"><strong>${esc(n.h1)}</strong><br><span class="seo-related-meta">${esc(a.primary)} · ${esc(a.intent)}</span></a>`;
  })
  .join("\n")}
<a href="./topical-map.html"><strong>Full topical map</strong></a>
</section>`;
    if (html.includes('class="seo-cta-box"')) {
      html = html.replace(/(<aside class="seo-cta-box")/, `${list}\n$1`);
    } else {
      html = html.replace(/<\/article>/i, `${list}\n</article>`);
    }
  }

  // Pillar prev/next among pillars
  if (!html.includes("seo-pager")) {
    const i = PILLARS.findIndex((p) => p.slug === pillar.slug);
    const prev = i > 0 ? PILLARS[i - 1] : null;
    const next = i < PILLARS.length - 1 ? PILLARS[i + 1] : null;
    const pager = `<nav class="seo-pager" aria-label="Previous and next pillar guides">
${
  prev
    ? `<a class="seo-pager-link seo-pager-prev" href="./${prev.slug}.html"><span class="seo-pager-kicker">Previous pillar</span><span class="seo-pager-title">${esc(prev.primary)}</span></a>`
    : `<span class="seo-pager-link seo-pager-empty"></span>`
}
${
  next
    ? `<a class="seo-pager-link seo-pager-next" href="./${next.slug}.html"><span class="seo-pager-kicker">Next pillar</span><span class="seo-pager-title">${esc(next.primary)}</span></a>`
    : `<span class="seo-pager-link seo-pager-empty"></span>`
}
</nav>`;
    html = html.replace(/<\/article>/i, `${pager}\n</article>`);
  }

  // Open first FAQ details
  if (html.includes("<details>") && !html.includes("<details open>")) {
    html = html.replace("<details>", "<details open>");
  }

  fs.writeFileSync(full, html, "utf8");
  return { file, ok: true, minutes, kids: kids.length };
}

const results = [];
for (const p of PILLARS) {
  results.push(enhancePillar(`${p.slug}.html`, p));
}

// FAQ guide page
const faqPath = path.join(GUIDES, "midi-converter-faq.html");
if (fs.existsSync(faqPath)) {
  let html = fs.readFileSync(faqPath, "utf8");
  html = html.replace(/seo-content\.css\?v=[^"]+/g, "seo-content.css?v=20260720-eeat");
  if (!html.includes("seo-author")) {
    html = html.replace(/(<h1>[^<]*<\/h1>)/, `$1\n${authorBox("../")}`);
  }
  if (!html.includes("seo-read-time")) {
    const mins = readingMinutes(wordCount(html));
    html = html.replace(
      /(seo-author[\s\S]*?<\/aside>)/,
      `<div class="seo-meta"><span class="seo-read-time">${mins} min read</span><span><time datetime="${TODAY}">Updated ${TODAY}</time></span></div>\n$1`
    );
  }
  fs.writeFileSync(faqPath, html, "utf8");
  results.push({ file: "midi-converter-faq.html", ok: true });
}

// Hub: author strip + topical map prominence
const hub = path.join(GUIDES, "index.html");
if (fs.existsSync(hub)) {
  let html = fs.readFileSync(hub, "utf8");
  html = html.replace(/seo-content\.css\?v=[^"]+/g, "seo-content.css?v=20260720-eeat");
  if (!html.includes("seo-author")) {
    html = html.replace(
      /(<h1>[^<]*<\/h1>)/,
      `$1\n<div class="seo-meta"><span class="seo-read-time">Hub</span><span><time datetime="${TODAY}">Updated ${TODAY}</time></span><span>50 unique articles · 5 pillars</span></div>\n${authorBox("../")}`
    );
  }
  fs.writeFileSync(hub, html, "utf8");
  results.push({ file: "index.html", ok: true });
}

console.log(JSON.stringify(results, null, 2));
