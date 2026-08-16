import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://midiaistudio.com";
const TODAY = new Date().toISOString().slice(0, 10);

const skipDir = (name) =>
  ["node_modules", "functions", "firebase", "scripts", ".git", "_probe", "_probe_shots", "_probe_product", "_corrupt_backup2", "_corrupt_backup", "tests"].includes(name);

function walk(dir, base = "") {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDir(ent.name)) continue;
    const rel = path.join(base, ent.name).replace(/\\/g, "/");
    if (ent.isDirectory()) out.push(...walk(path.join(dir, ent.name), rel));
    else if (ent.name.endsWith(".html")) {
      if (/^google[a-z0-9]+\.html$/i.test(ent.name)) continue;
      out.push(rel);
    }
  }
  return out;
}

const privateRe = /(admin|account|my-tickets|ticket|board-write)\.html$/i;
const urls = [];
const seen = new Set();

for (const rel of walk(ROOT)) {
  if (privateRe.test(rel)) continue;
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (/noindex/i.test(html)) continue;
  if (/location\.replace|http-equiv=["']refresh/i.test(html)) continue;
  if (rel.startsWith("guides/articles/")) continue;
  if (rel.startsWith("workflow/")) continue;
  if (["guides/topical-map.html", "guides/midi-converter-faq.html", "notice.html", "patch-note.html", "board-post.html"].includes(rel)) continue;
  const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1];
  const loc = canonical || `${SITE}/${rel.replace(/index\.html$/, "")}`;
  if (seen.has(loc)) continue;
  seen.add(loc);
  const isHome = loc === `${SITE}/` || loc === SITE;
  const isPillar = /\/guides\/(audio|youtube|pdf|mp3)-to-midi\.html|\/guides\/midi-editor|\/guides\/ai-transcription/.test(loc);
  const isGuideShell = /\/guide\/[a-z0-9-]+\/?$/.test(loc);
  urls.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${isHome ? "weekly" : "monthly"}</changefreq>
    <priority>${isHome ? "1.0" : isPillar ? "0.9" : isGuideShell ? "0.8" : "0.6"}</priority>
  </url>`);
}

fs.writeFileSync(
  path.join(ROOT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`
);
console.log(`sitemap urls: ${urls.length}`);
