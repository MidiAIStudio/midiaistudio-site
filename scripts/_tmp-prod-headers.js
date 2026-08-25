const https = require("https");
const { URL } = require("url");

function request(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": "MidiAI-SEO-Audit/1.0",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            url,
            status: res.statusCode,
            location: res.headers.location || null,
            headers: {
              cache: res.headers["cache-control"],
              etag: res.headers.etag,
              age: res.headers.age,
              xfh: res.headers["x-served-by"] || res.headers["server"],
              powered: res.headers["x-powered-by"],
              firebase: res.headers["x-firebase-hosting"] || res.headers["x-orig-cache"],
              cf: res.headers["cf-cache-status"] || res.headers["cf-ray"],
              all: Object.fromEntries(
                Object.entries(res.headers).filter(([k]) =>
                  /cache|etag|age|firebase|cdn|cf-|x-|server|location/i.test(k)
                )
              ),
            },
            title: (body.match(/<title>([^<]*)<\/title>/i) || [])[1] || null,
            canonical:
              (body.match(
                /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i
              ) || [])[1] || null,
            robots:
              (body.match(
                /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i
              ) || [])[1] || null,
            snippet: body.slice(0, 400).replace(/\s+/g, " "),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  const urls = [
    "https://midiaistudio.com/?nocache=" + Date.now(),
    "https://midiaistudio.web.app/?nocache=" + Date.now(),
    "https://midiaistudio.com/en/?nocache=" + Date.now(),
    "https://midiaistudio.web.app/en/?nocache=" + Date.now(),
    "https://midiaistudio.com/workflow/audio-to-midi",
    "https://midiaistudio.web.app/workflow/audio-to-midi",
    "https://midiaistudio.com/workflow/audio-to-midi.html",
    "https://midiaistudio.web.app/workflow/audio-to-midi.html",
    "https://midiaistudio.com/guides/mp3-to-midi.html",
    "https://midiaistudio.web.app/guides/mp3-to-midi.html",
    "https://midiaistudio.com/guides/ai-transcription.html?nocache=" + Date.now(),
    "https://midiaistudio.com/sitemap.xml?nocache=" + Date.now(),
  ];
  for (const u of urls) {
    const r = await request(u);
    console.log(JSON.stringify(r, null, 2));
    console.log("---");
  }
})();
