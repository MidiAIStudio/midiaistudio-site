/**
 * Full SEO audit for MidiAI Studio static site.
 * Exit code 1 if critical issues remain.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://midiaistudio.com";

const critical = [];
const warnings = [];
const info = [];

function walk(dir, base = "") {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "functions", "firebase", "scripts", ".git"].includes(ent.name)) continue;
    const rel = path.join(base, ent.name).replace(/\\/g, "/");
    if (ent.isDirectory()) out.push(...walk(path.join(dir, ent.name), rel));
    else if (ent.name.endsWith(".html")) out.push(rel);
  }
  return out;
}

const pages = walk(ROOT);
const titles = new Map();
const descriptions = new Map();

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const isRedirect = /location\.replace|http-equiv=["']refresh/i.test(html);

  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  const desc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1];
  const robots = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1] || "";
  const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1];
  const charset = /<meta[^>]*charset=/i.test(html);
  const viewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const lang = html.match(/<html[^>]*lang=["']([^"']*)["']/i)?.[1];
  const ogTitle = /property=["']og:title["']/i.test(html);
  const ogDesc = /property=["']og:description["']/i.test(html);
  const ogImage = /property=["']og:image["']/i.test(html);
  const ogUrl = /property=["']og:url["']/i.test(html);
  const twitter = /name=["']twitter:card["']/i.test(html);
  const favicon = /rel=["']icon["']/i.test(html);
  const manifest = /rel=["']manifest["']/i.test(html);
  const themeColor = /name=["']theme-color["']/i.test(html);
  const styleCss = /assets\/css\/style\.css/i.test(html);
  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;

  if (!title) critical.push(`${rel}: missing <title>`);
  if (!desc && !isRedirect) critical.push(`${rel}: missing meta description`);
  if (!charset) critical.push(`${rel}: missing charset`);
  if (!viewport) critical.push(`${rel}: missing viewport`);
  if (!lang) critical.push(`${rel}: missing html lang`);
  if (!canonical) critical.push(`${rel}: missing canonical`);
  if (!favicon) warnings.push(`${rel}: missing favicon`);
  if (!isRedirect && !ogTitle) critical.push(`${rel}: missing og:title`);
  if (!isRedirect && !ogDesc) critical.push(`${rel}: missing og:description`);
  if (!isRedirect && !ogImage) critical.push(`${rel}: missing og:image`);
  if (!isRedirect && !ogUrl) warnings.push(`${rel}: missing og:url`);
  if (!isRedirect && !twitter) warnings.push(`${rel}: missing twitter:card`);
  if (!isRedirect && !manifest) warnings.push(`${rel}: missing manifest`);
  if (!isRedirect && !themeColor) warnings.push(`${rel}: missing theme-color`);
  if (!isRedirect && !styleCss) critical.push(`${rel}: missing style.css (broken design)`);
  if (!isRedirect && h1Count === 0) warnings.push(`${rel}: no H1`);
  if (!isRedirect && h1Count > 1) warnings.push(`${rel}: multiple H1 (${h1Count})`);

  // Accidental noindex on public marketing pages
  const publicIndexed = [
    "index.html",
    "product.html",
    "downloads.html",
    "purchase.html",
    "faq.html",
    "notices.html",
    "support.html",
    "terms.html",
    "privacy.html",
  ];
  if (publicIndexed.includes(rel) && /noindex/i.test(robots)) {
    critical.push(`${rel}: public page has noindex`);
  }

  if (title) {
    if (!titles.has(title)) titles.set(title, []);
    titles.get(title).push(rel);
  }
  if (desc) {
    if (!descriptions.has(desc)) descriptions.set(desc, []);
    descriptions.get(desc).push(rel);
  }

  // Empty alt on content images (not decorative)
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  for (const img of imgs) {
    if (!/\balt=/i.test(img)) critical.push(`${rel}: img missing alt: ${img.slice(0, 80)}`);
    if (!/\bwidth=/i.test(img) || !/\bheight=/i.test(img)) {
      if (/brand-symbol|symbol\.png|product\//i.test(img)) {
        warnings.push(`${rel}: img missing width/height`);
      }
    }
  }

  // Internal href checks (relative .html)
  const hrefs = [...html.matchAll(/href=["'](\.\/|\.\.\/)?([a-z0-9\-_/]+\.html[^"']*)["']/gi)];
  for (const m of hrefs) {
    const prefix = m[1] || "";
    const target = m[2].split("?")[0].split("#")[0];
    const fromDir = path.dirname(rel);
    const resolved = path.normalize(path.join(fromDir, prefix + target)).replace(/\\/g, "/");
    if (!fs.existsSync(path.join(ROOT, resolved))) {
      critical.push(`${rel}: broken link -> ${prefix}${target} (resolved ${resolved})`);
    }
  }
}

for (const [t, list] of titles) {
  const unique = [...new Set(list.filter((p) => !p.includes("/") || p.endsWith("index.html")))];
  // allow redirect stubs to share short titles
  const nonRedirect = list.filter((p) => {
    const h = fs.readFileSync(path.join(ROOT, p), "utf8");
    return !/location\.replace|http-equiv=["']refresh/i.test(h);
  });
  if (nonRedirect.length > 1) {
    critical.push(`Duplicate title "${t}": ${nonRedirect.join(", ")}`);
  }
}

for (const [d, list] of descriptions) {
  const nonRedirect = list.filter((p) => {
    const h = fs.readFileSync(path.join(ROOT, p), "utf8");
    return !/location\.replace|http-equiv=["']refresh/i.test(h);
  });
  if (nonRedirect.length > 1) {
    critical.push(`Duplicate description: ${nonRedirect.join(", ")}`);
  }
}

// Root files
if (!fs.existsSync(path.join(ROOT, "robots.txt"))) critical.push("missing robots.txt");
else {
  const robots = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
  if (!/Sitemap:\s*https:\/\/midiaistudio\.com\/sitemap\.xml/i.test(robots)) {
    critical.push("robots.txt missing Sitemap URL");
  }
  if (/Disallow:\s*\/\s*$/m.test(robots)) critical.push("robots.txt Disallow: / blocks all indexing");
}
if (!fs.existsSync(path.join(ROOT, "sitemap.xml"))) critical.push("missing sitemap.xml");
else {
  const sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  if (!sm.includes("<urlset")) critical.push("sitemap.xml invalid");
  if (!sm.includes(`${SITE}/`)) critical.push("sitemap missing homepage");
  // ensure private pages not in sitemap
  for (const p of ["admin.html", "account.html", "my-tickets.html", "ticket.html", "board-write.html"]) {
    if (sm.includes(p)) warnings.push(`sitemap includes private page ${p}`);
  }
}
if (!fs.existsSync(path.join(ROOT, "manifest.webmanifest"))) critical.push("missing manifest.webmanifest");
if (!fs.existsSync(path.join(ROOT, "assets/js/analytics.js"))) warnings.push("missing analytics.js");
if (!fs.existsSync(path.join(ROOT, "404.html"))) critical.push("missing 404.html");
if (!fs.existsSync(path.join(ROOT, "assets/images/symbol.png"))) critical.push("missing favicon/symbol.png");

const report = { critical, warnings, info, pagesAudited: pages.length };
fs.writeFileSync(path.join(ROOT, "scripts/seo-audit-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nCRITICAL: ${critical.length}  WARNINGS: ${warnings.length}`);
process.exit(critical.length ? 1 : 0);
