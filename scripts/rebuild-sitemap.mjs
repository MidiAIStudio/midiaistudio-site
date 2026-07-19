/**
 * Rebuild sitemap.xml including guides + articles + about.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://midiaistudio.com";
const TODAY = new Date().toISOString().slice(0, 10);

const core = [
  ["/", 1.0, "weekly"],
  ["/product.html", 0.9, "monthly"],
  ["/downloads.html", 0.9, "weekly"],
  ["/purchase.html", 0.9, "monthly"],
  ["/about.html", 0.8, "monthly"],
  ["/faq.html", 0.8, "weekly"],
  ["/guides/", 0.9, "weekly"],
  ["/guides/pdf-to-midi.html", 0.9, "weekly"],
  ["/guides/youtube-to-midi.html", 0.9, "weekly"],
  ["/guides/mp3-to-midi.html", 0.9, "weekly"],
  ["/guides/audio-to-midi.html", 0.9, "weekly"],
  ["/guides/musicxml.html", 0.9, "weekly"],
  ["/guides/midi-converter-faq.html", 0.85, "weekly"],
  ["/notices.html", 0.6, "weekly"],
  ["/patch-notes.html", 0.7, "weekly"],
  ["/board.html", 0.5, "daily"],
  "/support.html",
  "/terms.html",
  "/privacy.html",
  "/refund.html",
  "/business-info.html",
  "/en/purchase.html",
  "/ja/purchase.html",
].map((x) =>
  Array.isArray(x) ? x : [x.startsWith("/") ? x : `/${x}`, 0.5, "monthly"]
);

// normalize support etc
const normalized = [
  ["/", 1.0, "weekly"],
  ["/product.html", 0.9, "monthly"],
  ["/downloads.html", 0.9, "weekly"],
  ["/purchase.html", 0.9, "monthly"],
  ["/about.html", 0.8, "monthly"],
  ["/faq.html", 0.8, "weekly"],
  ["/guides/", 0.9, "weekly"],
  ["/guides/pdf-to-midi.html", 0.9, "weekly"],
  ["/guides/youtube-to-midi.html", 0.9, "weekly"],
  ["/guides/mp3-to-midi.html", 0.9, "weekly"],
  ["/guides/audio-to-midi.html", 0.9, "weekly"],
  ["/guides/musicxml.html", 0.9, "weekly"],
  ["/guides/midi-converter-faq.html", 0.85, "weekly"],
  ["/guides/topical-map.html", 0.85, "weekly"],
  ["/notices.html", 0.6, "weekly"],
  ["/patch-notes.html", 0.7, "weekly"],
  ["/board.html", 0.5, "daily"],
  ["/support.html", 0.7, "monthly"],
  ["/terms.html", 0.3, "yearly"],
  ["/privacy.html", 0.3, "yearly"],
  ["/refund.html", 0.3, "yearly"],
  ["/business-info.html", 0.3, "yearly"],
  ["/en/purchase.html", 0.7, "monthly"],
  ["/ja/purchase.html", 0.7, "monthly"],
];

const artDir = path.join(ROOT, "guides", "articles");
const articles = fs
  .readdirSync(artDir)
  .filter((f) => f.endsWith(".html"))
  .map((f) => [`/guides/articles/${f}`, 0.7, "monthly"]);

const urls = [...normalized, ...articles];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ([loc, priority, changefreq]) => `  <url>
    <loc>${SITE}${loc === "/" ? "/" : loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`sitemap urls: ${urls.length}`);
