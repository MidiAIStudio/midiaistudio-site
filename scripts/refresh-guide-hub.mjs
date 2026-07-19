/**
 * Rebuild the "All articles (50)" seo-grid on guides/index.html
 * from topical-map ARTICLES + article-narratives NARRATIVES.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ARTICLES } from "./topical-map.mjs";
import { NARRATIVES } from "./article-narratives.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HUB = path.join(ROOT, "guides", "index.html");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const missing = [];
const cards = ARTICLES.map((a) => {
  const n = NARRATIVES[a.slug];
  if (!n || !n.h1 || !n.description) {
    missing.push(a.slug);
    return null;
  }
  return (
    '<article class="seo-card">' +
    "<h3><a href=\"./articles/" +
    esc(a.slug) +
    '.html">' +
    esc(n.h1) +
    "</a></h3>" +
    "<p>" +
    esc(a.primary) +
    "</p>" +
    "<p>" +
    esc(n.description) +
    "</p>" +
    "</article>"
  );
}).filter(Boolean);

if (missing.length) {
  console.error("Missing narratives for:", missing.join(", "));
  process.exit(1);
}

const section =
  "<h2>All articles (" +
  ARTICLES.length +
  ")</h2>\n" +
  '<div class="seo-grid">\n' +
  cards.join("\n") +
  "\n</div>\n";

let html = fs.readFileSync(HUB, "utf8");
const re = /<h2>All articles[\s\S]*?(?=<aside class="seo-cta-box")/;
if (!re.test(html)) {
  console.error("Could not find All articles seo-cta-box region in guides/index.html");
  process.exit(1);
}

html = html.replace(re, section);
fs.writeFileSync(HUB, html, "utf8");

console.log("Updated " + HUB);
console.log("Cards: " + cards.length);
console.log("Sample h1: " + NARRATIVES[ARTICLES[0].slug].h1);
