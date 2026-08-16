/**
 * Golden-build smoke for Firebase Hosting (web.app) before DNS cutover.
 */
const ORIGIN = process.env.LIVE_ORIGIN || "https://midiaistudio.com";

const urls = [
  "/",
  "/purchase.html",
  "/product.html",
  "/guide/",
  "/guide/youtube-to-midi/",
  "/guide/audio-to-midi/",
  "/guide/pdf-to-midi/",
  "/guide/midi-editor/",
  "/guides/audio-to-midi.html",
  "/guides/youtube-to-midi.html",
  "/guides/pdf-to-midi.html",
  "/guides/midi-editor.html",
  "/guides/ai-transcription.html",
  "/sitemap.xml",
  "/robots.txt",
  "/assets/css/style.css",
  "/assets/js/app.js",
  "/assets/js/config.js",
  "/assets/images/symbol.png",
  "/assets/images/product/ai-midi-converter-home.jpg",
];

const fail = [];
const ok = [];

for (const path of urls) {
  const u = ORIGIN + path;
  const r = await fetch(u, { redirect: "manual" });
  const row = { path, status: r.status };
  if (path.endsWith(".html") || path === "/" || path.startsWith("/guide")) {
    const t = await r.text();
    row.title = t.match(/<title>([^<]*)/)?.[1];
    if (path === "/" || path.includes("purchase") || path.includes("audio-to-midi.html")) {
      row.has130000 = t.includes("130000") || t.includes("130,000");
      row.has90000 = /"price":\s*"90000"/.test(t);
    }
    if (path.startsWith("/guide/") && path !== "/guide/") {
      row.hasFallback = /guideSeoFallback/.test(t);
    }
  }
  if (r.status !== 200) fail.push(row);
  else ok.push(row);
  console.log(JSON.stringify(row));
}

const home = await fetch(ORIGIN + "/").then((r) => r.text());
const purchase = await fetch(ORIGIN + "/purchase.html").then((r) => r.text());
if (!home.includes('"price": "130000"')) fail.push({ path: "/", issue: "schema not 130000" });
if (!purchase.includes("130,000원")) fail.push({ path: "/purchase.html", issue: "visible price missing" });

console.log(JSON.stringify({ origin: ORIGIN, ok: ok.length, fail }, null, 2));
if (fail.length) process.exit(1);
