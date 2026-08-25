const https = require("https");
const { URL } = require("url");
const BASE = (process.argv[2] || "https://midiaistudio.com").replace(/\/$/, "");
const CANON = "https://midiaistudio.com";
function u(path) {
  return BASE + path;
}

function request(url, { method = "GET", maxHops = 8, follow = false } = {}) {
  const hops = [];
  return new Promise((resolve, reject) => {
    const go = (u, left) => {
      const parsed = new URL(u);
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method,
          headers: {
            "User-Agent": "MidiAI-SEO-Audit/1.0",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        },
        (res) => {
          const loc = res.headers.location || null;
          hops.push({
            url: u,
            status: res.statusCode,
            location: loc,
            ctype: res.headers["content-type"],
          });
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const body = Buffer.concat(chunks);
            if (
              follow &&
              loc &&
              left > 0 &&
              [301, 302, 303, 307, 308].includes(res.statusCode)
            ) {
              go(new URL(loc, u).href, left - 1);
            } else {
              resolve({
                hops,
                status: res.statusCode,
                headers: res.headers,
                body: body.toString("utf8"),
                bytes: body.length,
              });
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
    };
    go(url, maxHops);
  });
}

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}
function all(html, re) {
  return [...html.matchAll(re)].map((m) => m[1]);
}
function seo(html, url) {
  const title = pick(html, /<title>([^<]*)<\/title>/i);
  const desc =
    pick(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
    ) ||
    pick(
      html,
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
    );
  const robots =
    pick(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) ||
    pick(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i);
  const canonical =
    pick(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) ||
    pick(html, /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const h1 = pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const hreflang = [...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)].map(
    (m) => {
      const t = m[0];
      const hl = (t.match(/hreflang=["']([^"']+)/i) || [])[1];
      const href = (t.match(/href=["']([^"']+)/i) || [])[1];
      return `${hl} => ${href}`;
    }
  );
  const jsonld = (html.match(/application\/ld\+json/gi) || []).length;
  const fffd = (html.match(/\uFFFD/g) || []).length;
  const hangul = (html.match(/[\uAC00-\uD7A3]/g) || []).length;
  const jp = (html.match(/[\u3040-\u30FF]/g) || []).length;
  const badCanon =
    canonical &&
    (/localhost|web\.app/i.test(canonical) ||
      canonical.startsWith("/") ||
      /\/workflow\//.test(canonical));
  const indexable = robots ? !/noindex/i.test(robots) : true;
  const selfCanon = canonical === url;
  return {
    url,
    title,
    desc,
    robots,
    canonical,
    h1: h1 ? h1.replace(/<[^>]+>/g, "").trim() : null,
    hreflang,
    jsonld,
    fffd,
    hangul,
    jp,
    badCanon,
    indexable,
    selfCanon,
  };
}

(async () => {
  const out = { base: BASE };
  const home = await request(u("/"), { follow: false });
  out.HOME = { hops: home.hops, seo: seo(home.body, CANON + "/") };

  const langs = ["/", "/en/", "/ja/"];
  out.LANG = [];
  for (const p of langs) {
    const r = await request(u(p), { follow: false });
    out.LANG.push({ hops: r.hops, seo: seo(r.body, CANON + p) });
  }

  const redirs = [
    ["AUDIO", "/workflow/audio-to-midi", "/guides/audio-to-midi.html"],
    ["AUDIO_HTML", "/workflow/audio-to-midi.html", "/guides/audio-to-midi.html"],
    ["AUDIO_SLASH", "/workflow/audio-to-midi/", "/guides/audio-to-midi.html"],
    ["YOUTUBE", "/workflow/youtube-to-midi", "/guides/youtube-to-midi.html"],
    ["YOUTUBE_HTML", "/workflow/youtube-to-midi.html", "/guides/youtube-to-midi.html"],
    ["YOUTUBE_SLASH", "/workflow/youtube-to-midi/", "/guides/youtube-to-midi.html"],
    ["PDF", "/workflow/pdf-to-midi", "/guides/pdf-to-midi.html"],
    ["PDF_HTML", "/workflow/pdf-to-midi.html", "/guides/pdf-to-midi.html"],
    ["PDF_SLASH", "/workflow/pdf-to-midi/", "/guides/pdf-to-midi.html"],
    ["EDITOR", "/workflow/midi-editor", "/guides/midi-editor.html"],
    ["EDITOR_HTML", "/workflow/midi-editor.html", "/guides/midi-editor.html"],
    ["EDITOR_SLASH", "/workflow/midi-editor/", "/guides/midi-editor.html"],
    ["MP3", "/guides/mp3-to-midi.html", "/guides/audio-to-midi.html"],
  ];
  out.REDIRECTS = [];
  for (const [name, fromPath, expectPath] of redirs) {
    const from = u(fromPath);
    const first = await request(from, { follow: false });
    const loc = first.hops[0].location;
    const abs = loc ? new URL(loc, from).href : null;
    let final = null;
    if (abs) final = await request(abs, { follow: false });
    const locPath = abs ? new URL(abs).pathname : null;
    out.REDIRECTS.push({
      name,
      from,
      status: first.hops[0].status,
      location: loc,
      locPath,
      expectPath,
      locOk: locPath === expectPath,
      hop: loc && final && final.hops[0].status === 200 ? 1 : first.hops.length,
      finalStatus: final && final.hops[0].status,
    });
  }

  const guides = [
    "/guides/audio-to-midi.html",
    "/guides/youtube-to-midi.html",
    "/guides/pdf-to-midi.html",
    "/guides/ai-transcription.html",
    "/guides/midi-editor.html",
  ];
  out.GUIDES = [];
  for (const p of guides) {
    const r = await request(u(p), { follow: false });
    out.GUIDES.push({ hops: r.hops, seo: seo(r.body, CANON + p) });
  }

  const sm = await request(u("/sitemap.xml"), { follow: false });
  const locs = all(sm.body, /<loc>([^<]+)<\/loc>/g);
  out.SITEMAP = {
    status: sm.hops[0].status,
    count: locs.length,
    workflow: locs.filter((x) => /\/workflow\//.test(x)),
    mp3: locs.filter((x) => /mp3-to-midi/.test(x)),
    core: {
      audio: locs.includes(CANON + "/guides/audio-to-midi.html"),
      youtube: locs.includes(CANON + "/guides/youtube-to-midi.html"),
      pdf: locs.includes(CANON + "/guides/pdf-to-midi.html"),
      ai: locs.includes(CANON + "/guides/ai-transcription.html"),
      editor: locs.includes(CANON + "/guides/midi-editor.html"),
      home: locs.includes(CANON + "/"),
      en: locs.includes(CANON + "/en/"),
      ja: locs.includes(CANON + "/ja/"),
    },
  };

  const rb = await request(u("/robots.txt"), { follow: false });
  out.ROBOTS = { status: rb.hops[0].status, body: rb.body };

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
