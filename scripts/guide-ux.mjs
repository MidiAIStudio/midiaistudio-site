/**
 * EEAT + UX helpers for Guide pages — shared chrome, no visual redesign.
 */
import { ARTICLES, PILLARS, CLUSTERS, SITE } from "./topical-map.mjs";
import { NARRATIVES } from "./article-narratives.mjs";

export const AUTHOR = {
  person: "최정환",
  role: "Founder & Product Lead",
  org: "미디에이아이스튜디오",
  email: "midiaistudio@gmail.com",
  aboutUrl: `${SITE}/about.html`,
  bio: "Builds MidiAI Studio for practical AI MIDI conversion, score workflows, and musician-first editing on Windows.",
};

export const TODAY = "2026-07-20";
export const PUBLISHED = "2026-07-20";

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wordCount(text) {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

export function readingMinutes(words) {
  return Math.max(4, Math.ceil(words / 220));
}

export function slugify(h) {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Stable order within each cluster for prev/next */
export function clusterSequence(clusterId) {
  return ARTICLES.filter((a) => a.cluster === clusterId);
}

export function neighbors(slug) {
  const art = ARTICLES.find((a) => a.slug === slug);
  if (!art) return { prev: null, next: null };
  const seq = clusterSequence(art.cluster);
  const i = seq.findIndex((a) => a.slug === slug);
  return {
    prev: i > 0 ? seq[i - 1] : null,
    next: i >= 0 && i < seq.length - 1 ? seq[i + 1] : null,
  };
}

export function authorBox(rootPrefix = "../../") {
  return `<aside class="seo-author" aria-label="About the author">
<div class="seo-author-mark" aria-hidden="true">M</div>
<div class="seo-author-copy">
<p class="seo-author-name"><a href="${rootPrefix}about.html">${esc(AUTHOR.person)}</a> · ${esc(AUTHOR.role)}</p>
<p class="seo-author-bio">${esc(AUTHOR.bio)}</p>
<p class="seo-author-links">
<a href="${rootPrefix}about.html">About &amp; credentials</a>
· <a href="${rootPrefix}business-info.html">Business info</a>
· <a href="${rootPrefix}patch-notes.html">Update history</a>
· <a href="${rootPrefix}support.html">Support</a>
· <a href="mailto:${AUTHOR.email}">${esc(AUTHOR.email)}</a>
</p>
</div>
</aside>`;
}

export function metaBar({ minutes, intent, clusterName }) {
  return `<div class="seo-meta" role="group" aria-label="Article metadata">
  <span><time datetime="${PUBLISHED}">Published ${PUBLISHED}</time></span>
  <span><time datetime="${TODAY}">Updated ${TODAY}</time></span>
  <span class="seo-read-time">${minutes} min read</span>
  <span>Intent: ${esc(intent)}</span>
  <span>Cluster: ${esc(clusterName)}</span>
</div>`;
}

export function tocNav(h2s, ids, includeFaq = true) {
  return `<nav class="seo-toc" aria-label="Table of contents">
<p class="seo-toc-label"><strong>Contents</strong> <span class="seo-toc-hint">Jump to a section</span></p>
<ol class="seo-toc-list">
${h2s.map((h, i) => `<li><a href="#${ids[i]}">${esc(h)}</a></li>`).join("\n")}
${includeFaq ? `<li><a href="#faq">FAQ</a></li>` : ""}
<li><a href="#related-guides">Related guides</a></li>
</ol>
</nav>`;
}

export function prevNextNav(spec, rootArticles = "./") {
  const { prev, next } = neighbors(spec.slug);
  const cluster = CLUSTERS[spec.cluster]?.name || spec.cluster;
  return `<nav class="seo-pager" aria-label="Previous and next guides in ${esc(cluster)}">
${
  prev
    ? `<a class="seo-pager-link seo-pager-prev" href="${rootArticles}${prev.slug}.html"><span class="seo-pager-kicker">Previous</span><span class="seo-pager-title">${esc(NARRATIVES[prev.slug].h1)}</span></a>`
    : `<span class="seo-pager-link seo-pager-empty"></span>`
}
${
  next
    ? `<a class="seo-pager-link seo-pager-next" href="${rootArticles}${next.slug}.html"><span class="seo-pager-kicker">Next</span><span class="seo-pager-title">${esc(NARRATIVES[next.slug].h1)}</span></a>`
    : `<span class="seo-pager-link seo-pager-empty"></span>`
}
</nav>`;
}

/** Diverse CTAs by intent — same button classes, different destinations/copy */
export function ctaBlock(spec, position = "end") {
  const primary = spec.primary;
  const variants = {
    "how-to": {
      h: `Practice “${primary}” in MidiAI Studio`,
      p: `Open the Windows app, run a short test conversion for this workflow, then edit the draft before you export.`,
      links: [
        ["primary", `${SITE}/downloads.html`, "Download free trial"],
        ["secondary", `${SITE}/product.html`, "See product features"],
        ["ghost", `${SITE}/guides/${spec.parent}.html`, "Back to pillar guide"],
      ],
    },
    explainer: {
      h: `See the concepts behind “${primary}” in the product`,
      p: `After you understand the idea, try one concrete conversion so theory turns into muscle memory.`,
      links: [
        ["primary", `${SITE}/product.html`, "Explore MidiAI Studio"],
        ["secondary", `${SITE}/downloads.html`, "Try the installer"],
        ["ghost", `${SITE}/guides/midi-converter-faq.html`, "Read converter FAQ"],
      ],
    },
    comparison: {
      h: `Compare options, then verify with a real file`,
      p: `Use this page to pick the right job. When you are ready, MidiAI Studio covers intake → MIDI edit → score paths on Windows.`,
      links: [
        ["primary", `${SITE}/downloads.html`, "Test on your machine"],
        ["secondary", `${SITE}/purchase.html`, "Lifetime license"],
        ["ghost", `${SITE}/about.html`, "Publisher & trust info"],
      ],
    },
    "use-case": {
      h: `Apply “${primary}” in a real session`,
      p: `Teachers, learners, and creators get the most value by converting one short example today—not a whole library.`,
      links: [
        ["primary", `${SITE}/downloads.html`, "Start free trial"],
        ["secondary", `${SITE}/board.html`, "Ask the community"],
        ["ghost", `${SITE}/support.html`, "Contact support"],
      ],
    },
    "legal-edu": {
      h: `Stay informed — then use tools responsibly`,
      p: `This page is educational, not legal advice. For product questions, use official support channels.`,
      links: [
        ["primary", `${SITE}/support.html`, "Ask support"],
        ["secondary", `${SITE}/terms.html`, "Terms of use"],
        ["ghost", `${SITE}/about.html`, "About MidiAI Studio"],
      ],
    },
    checklist: {
      h: `Run the checklist inside MidiAI Studio`,
      p: `Keep this list open beside the app. Check one item per listen-pass so cleanup stays focused.`,
      links: [
        ["primary", `${SITE}/downloads.html`, "Open the app"],
        ["secondary", `${SITE}/patch-notes.html`, "Check latest fixes"],
        ["ghost", `${SITE}/faq.html`, "Portal FAQ"],
      ],
    },
    troubleshooting: {
      h: `Stuck on “${primary}”? Fix source quality first`,
      p: `Most accuracy issues are upstream. Improve the input, convert a shorter section, then edit—or ask support with a concrete example.`,
      links: [
        ["primary", `${SITE}/support.html`, "Get 1:1 help"],
        ["secondary", `${SITE}/downloads.html`, "Update / reinstall"],
        ["ghost", `${SITE}/guides/articles/improve-midi-accuracy.html`, "Accuracy guide"],
      ],
    },
    workflow: {
      h: `Wire “${primary}” into your daily toolchain`,
      p: `Export clean MIDI, then continue in your DAW or score tools. Lifetime licensing unlocks full conversion and editing.`,
      links: [
        ["primary", `${SITE}/purchase.html`, "Buy Lifetime"],
        ["secondary", `${SITE}/downloads.html`, "Download trial"],
        ["ghost", `${SITE}/product.html`, "Feature overview"],
      ],
    },
  };
  const v = variants[spec.intent] || variants["how-to"];
  const midNote =
    position === "mid"
      ? `<p class="seo-cta-note">Quick pause: bookmark this section, then finish the article—or jump to a trial conversion while the example is fresh.</p>`
      : "";
  return `<aside class="seo-cta-box" data-cta="${esc(spec.intent)}-${position}" aria-label="Call to action">
<h2>${esc(v.h)}</h2>
<p>${esc(v.p)}</p>
${midNote}
<p class="seo-cta-actions">
${v.links
  .map(([cls, href, label]) => `<a class="${cls}" href="${href}">${esc(label)}</a>`)
  .join("\n")}
</p>
</aside>`;
}

export function relatedBlock(spec) {
  const sameCluster = ARTICLES.filter((x) => x.cluster === spec.cluster && x.slug !== spec.slug);
  // Rank by shared parent + intent adjacency
  const ranked = [...sameCluster].sort((a, b) => {
    const score = (x) =>
      (x.parent === spec.parent ? 2 : 0) + (x.intent === spec.intent ? 1 : 0);
    return score(b) - score(a);
  });
  const picks = ranked.slice(0, 5);
  const pillar = PILLARS.find((p) => p.slug === spec.parent);
  const crossCluster = ARTICLES.filter(
    (x) => x.cluster !== spec.cluster && (x.parent === spec.parent || x.intent === spec.intent)
  ).slice(0, 2);

  return `<nav class="seo-related" id="related-guides" aria-label="Related guides">
<h2>Related guides for “${esc(spec.primary)}”</h2>
<p class="seo-related-lead">Hand-picked from the <strong>${esc(CLUSTERS[spec.cluster]?.name || "")}</strong> cluster and nearby intents—not a generic footer dump.</p>
${
  pillar
    ? `<a href="../${pillar.slug}.html"><strong>Pillar · ${esc(pillar.primary)}</strong><br><span class="seo-related-meta">Start here if you need the head-term overview</span></a>`
    : ""
}
${picks
  .map((a) => {
    const n = NARRATIVES[a.slug];
    return `<a href="./${a.slug}.html"><strong>${esc(n.h1)}</strong><br><span class="seo-related-meta">${esc(a.primary)} · ${esc(a.intent)}</span></a>`;
  })
  .join("\n")}
${crossCluster
  .map((a) => {
    const n = NARRATIVES[a.slug];
    return `<a href="./${a.slug}.html"><strong>${esc(n.h1)}</strong><br><span class="seo-related-meta">Nearby · ${esc(a.primary)}</span></a>`;
  })
  .join("\n")}
<a href="../index.html"><strong>All guides hub</strong><br><span class="seo-related-meta">Browse by pillar and cluster</span></a>
<a href="../topical-map.html"><strong>Topical map</strong><br><span class="seo-related-meta">See primary-keyword ownership</span></a>
</nav>`;
}

export function faqSection(spec, faqs) {
  const intro = `Straight answers for musicians researching <strong>${esc(spec.primary)}</strong>. Expand any question—answers stay on this page so you do not bounce away mid-read.`;
  return `<section class="seo-faq" aria-label="FAQ" id="faq">
<h2>FAQ</h2>
<p class="seo-faq-intro">${intro}</p>
${faqs
  .map(
    (f, i) =>
      `<details${i === 0 ? " open" : ""}><summary>${esc(f.q)}</summary><p>${f.a}</p></details>`
  )
  .join("\n")}
</section>`;
}

export function breadcrumbsArticle(spec, h1) {
  const cluster = CLUSTERS[spec.cluster];
  const pillar = PILLARS.find((p) => p.slug === spec.parent);
  return `<nav class="seo-breadcrumbs" aria-label="Breadcrumb">
<a href="../../index.html">Home</a> ›
<a href="../index.html">Guides</a> ›
${pillar ? `<a href="../${pillar.slug}.html">${esc(pillar.primary)}</a> ›` : ""}
<span class="seo-crumb-cluster">${esc(cluster?.name || spec.cluster)}</span> ›
<span aria-current="page">${esc(h1)}</span>
</nav>`;
}
