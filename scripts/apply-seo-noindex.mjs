import fs from "fs";
import path from "path";

function setNoindex(file) {
  let html = fs.readFileSync(file, "utf8");
  const robots = html.match(/<meta[^>]*name=["']robots["'][^>]*>/i)?.[0] || "";
  if (/noindex/i.test(robots)) return false;
  if (robots) {
    html = html.replace(/<meta[^>]*name=["']robots["'][^>]*>/i, `<meta name="robots" content="noindex, follow">`);
  } else {
    html = html.replace("</title>", `</title>\n  <meta name="robots" content="noindex, follow">`);
  }
  fs.writeFileSync(file, html);
  return true;
}

let n = 0;
for (const f of fs.readdirSync("guides/articles").filter((x) => x.endsWith(".html"))) {
  if (setNoindex(path.join("guides/articles", f))) n++;
}
for (const f of [
  "guides/topical-map.html",
  "guides/midi-converter-faq.html",
  "guides/musicxml.html",
  "notice.html",
  "patch-note.html",
  "board-post.html",
]) {
  if (setNoindex(f)) n++;
}
console.log("noindex updated:", n);
