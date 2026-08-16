/**
 * Live SEO crawl of https://midiaistudio.com from sitemap + key URLs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.LIVE_ORIGIN || "https://midiaistudio.com";
const UA = "MidiAIStudioSeoAudit/1.0";

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text) {
  return text.split(/\s+/).filter((w) => w.length > 1);
}

function extract(html, url) {
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || "";
  const desc =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ||
    "";
  const robots =
    html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const canonical =
    html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1] || "";
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    stripTags(m[1])
  );
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) =>
    stripTags(m[1])
  );
  const noindex = /noindex/i.test(robots);
  const text = stripTags(html);
  const wc = words(text).length;
  const ldOk = [...html.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)].every((b) => {
    try {
      JSON.parse(b[1]);
      return true;
    } catch {
      return false;
    }
  });
  const ldCount = (html.match(/application\/ld\+json/gi) || []).length;
  const offers = [];
  for (const b of html.matchAll(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(b[1]);
      const nodes = Array.isArray(d) ? d : [d];
      for (const n of nodes) {
        if (n?.offers?.price != null) offers.push({ price: n.offers.price, currency: n.offers.priceCurrency });
      }
    } catch {
      /* already counted */
    }
  }
  return {
    url,
    title,
    desc,
    robots,
    canonical,
    noindex,
    h1: h1s,
    h1Count: h1s.length,
    h2: h2s.slice(0, 12),
    wordCount: wc,
    textSample: text.slice(0, 280),
    textForSim: text.slice(0, 4000),
    ldOk,
    ldCount,
    offers,
    hasStaticGuide: /guideSeoFallback|guide-seo-fallback/i.test(html),
  };
}

async function fetchUrl(url, opts = {}) {
  const res = await fetch(url, {
    redirect: opts.redirect || "manual",
    headers: { "User-Agent": UA, Accept: "text/html,application/xml,*/*" },
  });
  const loc = res.headers.get("location");
  let body = "";
  const ct = res.headers.get("content-type") || "";
  if (/html|xml|text|json/i.test(ct) || res.status === 200) {
    try {
      body = await res.text();
    } catch {
      body = "";
    }
  }
  return { status: res.status, location: loc, body, finalUrl: url, contentType: ct };
}

async function follow(url, max = 5) {
  const chain = [];
  let current = url;
  for (let i = 0; i < max; i++) {
    const r = await fetchUrl(current);
    chain.push({ url: current, status: r.status, location: r.location });
    if (r.status >= 300 && r.status < 400 && r.location) {
      current = new URL(r.location, current).href;
      continue;
    }
    return { ...r, finalUrl: current, chain };
  }
  return { status: 0, body: "", finalUrl: current, chain, error: "redirect loop/chain" };
}

function quality(row) {
  if (row.noindex) return "NOINDEX";
  if (row.status !== 200) return "ERROR";
  if (row.wordCount < 80 && !row.hasStaticGuide) return "THIN";
  if (row.wordCount < 180) return "NEAR-THIN";
  return "SUBSTANTIAL";
}

function jaccard(a, b) {
  const sa = new Set(words(a.toLowerCase()).filter((w) => w.length > 3));
  const sb = new Set(words(b.toLowerCase()).filter((w) => w.length > 3));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

async function main() {
  const issues = [];
  const sm = await follow(`${ORIGIN}/sitemap.xml`);
  if (sm.status !== 200) {
    throw new Error(`sitemap HTTP ${sm.status}`);
  }
  const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    try {
      const u = new URL(m[1].trim());
      return ORIGIN + u.pathname + u.search;
    } catch {
      return m[1].trim();
    }
  });
  const rows = [];
  for (const loc of locs) {
    const r = await follow(loc);
    const ex = extract(r.body || "", loc);
    const canonPath = (() => {
      try { return new URL(ex.canonical, loc).pathname.replace(/\/$/, ""); } catch { return ""; }
    })();
    const locPath = (() => {
      try { return new URL(loc).pathname.replace(/\/$/, ""); } catch { return loc; }
    })();
    const row = {
      ...ex,
      status: r.status,
      finalUrl: r.finalUrl,
      redirects: r.chain?.length > 1 ? r.chain : undefined,
      selfCanonical: !ex.canonical || canonPath === locPath,
    };
    row.quality = quality({ ...row, status: r.status });
    if (r.status !== 200) issues.push(`${loc} HTTP ${r.status}`);
    if (r.chain && r.chain.length > 2) issues.push(`${loc} redirect chain ${r.chain.length}`);
    if (row.noindex) issues.push(`${loc} sitemap+noindex`);
    if (r.status === 200 && row.canonical && !row.selfCanonical) {
      issues.push(`${loc} canonical mismatch -> ${row.canonical}`);
    }
    if (ex.ldCount && !ex.ldOk) issues.push(`${loc} JSON-LD parse fail`);
    rows.push(row);
  }

  const extra = [
    `${ORIGIN}/guide.html?slug=youtube-to-midi`,
    `${ORIGIN}/guide.html?slug=audio-to-midi`,
    `${ORIGIN}/guide/youtube-to-midi`,
    `${ORIGIN}/guide/youtube-to-midi/`,
    `${ORIGIN}/robots.txt`,
  ];
  const extraRows = [];
  for (const u of extra) {
    const r = await follow(u);
    extraRows.push({
      url: u,
      status: r.status,
      ...extract(r.body || "", u),
      finalUrl: r.finalUrl,
    });
  }

  const key = [
    "/",
    "/guides/audio-to-midi.html",
    "/guides/mp3-to-midi.html",
    "/guides/youtube-to-midi.html",
    "/guides/pdf-to-midi.html",
    "/guides/midi-editor.html",
    "/guides/ai-transcription.html",
    "/guide/youtube-to-midi/",
    "/guide/audio-to-midi/",
    "/guide/pdf-to-midi/",
    "/guide/midi-editor/",
    "/guide/getting-started/",
    "/purchase.html",
    "/workflow/youtube-to-midi",
    "/workflow/audio-to-midi",
  ].map((p) => ORIGIN + p);

  const pairs = [
    ["audio-mp3", `${ORIGIN}/guides/audio-to-midi.html`, `${ORIGIN}/guides/mp3-to-midi.html`],
    ["yt-pillar-manual", `${ORIGIN}/guides/youtube-to-midi.html`, `${ORIGIN}/guide/youtube-to-midi/`],
    ["audio-pillar-manual", `${ORIGIN}/guides/audio-to-midi.html`, `${ORIGIN}/guide/audio-to-midi/`],
    ["pdf-pillar-manual", `${ORIGIN}/guides/pdf-to-midi.html`, `${ORIGIN}/guide/pdf-to-midi/`],
    ["editor-pillar-manual", `${ORIGIN}/guides/midi-editor.html`, `${ORIGIN}/guide/midi-editor/`],
    ["yt-workflow", `${ORIGIN}/guides/youtube-to-midi.html`, `${ORIGIN}/workflow/youtube-to-midi`],
    ["audio-workflow", `${ORIGIN}/guides/audio-to-midi.html`, `${ORIGIN}/workflow/audio-to-midi`],
    ["pdf-workflow", `${ORIGIN}/guides/pdf-to-midi.html`, `${ORIGIN}/workflow/pdf-to-midi`],
  ];
  const similarity = [];
  const byUrl = Object.fromEntries(rows.map((x) => [x.url, x]));
  for (const [name, a, b] of pairs) {
    const ra = byUrl[a];
    const rb = byUrl[b];
    if (!ra || !rb) {
      similarity.push({ name, a, b, error: "missing from sitemap crawl" });
      continue;
    }
    similarity.push({
      name,
      a,
      b,
      jaccard: Number(jaccard(ra.textForSim || "", rb.textForSim || "").toFixed(3)),
      wordA: ra.wordCount,
      wordB: rb.wordCount,
      h1A: ra.h1,
      h1B: rb.h1,
    });
  }

  const titles = {};
  for (const r of rows) {
    if (!r.title) continue;
    titles[r.title] = titles[r.title] || [];
    titles[r.title].push(r.url);
  }
  const dupTitles = Object.entries(titles).filter(([, u]) => u.length > 1);

  const report = {
    crawledAt: new Date().toISOString(),
    origin: ORIGIN,
    sitemapCount: locs.length,
    http200: rows.filter((r) => r.status === 200).length,
    not200: rows.filter((r) => r.status !== 200).map((r) => ({ url: r.url, status: r.status })),
    quality: {
      THIN: rows.filter((r) => r.quality === "THIN").map((r) => ({ url: r.url, wordCount: r.wordCount })),
      NEAR_THIN: rows.filter((r) => r.quality === "NEAR-THIN").map((r) => ({ url: r.url, wordCount: r.wordCount })),
      SUBSTANTIAL: rows.filter((r) => r.quality === "SUBSTANTIAL").length,
      NOINDEX: rows.filter((r) => r.quality === "NOINDEX").map((r) => r.url),
    },
    duplicateTitles: dupTitles,
    issues,
    similarity,
    extraRows,
    keyPages: rows.filter((r) => key.includes(r.url)).map((r) => ({
      url: r.url,
      status: r.status,
      title: r.title,
      desc: r.desc,
      canonical: r.canonical,
      h1: r.h1,
      h1Count: r.h1Count,
      wordCount: r.wordCount,
      noindex: r.noindex,
      hasStaticGuide: r.hasStaticGuide,
      offers: r.offers,
      ldOk: r.ldOk,
    })),
    rows: rows.map((r) => ({
      url: r.url,
      status: r.status,
      title: r.title,
      canonical: r.canonical,
      wordCount: r.wordCount,
      quality: r.quality,
      h1Count: r.h1Count,
      noindex: r.noindex,
    })),
  };

  const out = path.join(ROOT, "scripts/live-seo-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    sitemapCount: report.sitemapCount,
    http200: report.http200,
    not200: report.not200,
    thin: report.quality.THIN.length,
    nearThin: report.quality.NEAR_THIN.length,
    substantial: report.quality.SUBSTANTIAL,
    issues: report.issues,
    duplicateTitles: report.duplicateTitles,
    similarity: report.similarity,
    extraRows: report.extraRows.map((e) => ({
      url: e.url,
      status: e.status,
      robots: e.robots,
      canonical: e.canonical,
      title: e.title,
      h1: e.h1,
    })),
    keyPages: report.keyPages,
  }, null, 2));
  console.log(`\nWrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
