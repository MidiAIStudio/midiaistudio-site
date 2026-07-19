/**
 * Restore missing style.css links and dedupe Google Fonts after SEO apply.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CSS_VERSIONS = {
  "index.html": "./assets/css/style.css?v=v81-sidebar-user-20260719",
  "product.html": "./assets/css/style.css?v=v61-admin-nav-hide-20260719",
  "downloads.html": "./assets/css/style.css?v=v48-downloads-i18n-20260713",
  "purchase.html": "./assets/css/style.css?v=v82-kakao-card-note-20260714",
  "en/purchase.html": "../assets/css/style.css?v=v46-i18n-20260713",
  "ja/purchase.html": "../assets/css/style.css?v=v46-i18n-20260713",
  "faq.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "notices.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "notice.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "patch-notes.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "patch-note.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "board.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "board-post.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "board-write.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "support.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "my-tickets.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "ticket.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "account.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "admin.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "terms.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "privacy.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "refund.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "business-info.html": "./assets/css/style.css?v=v46-i18n-20260713",
  "404.html": "./assets/css/style.css?v=v46-i18n-20260713",
};

function fix(rel, cssHref) {
  const filePath = path.join(ROOT, rel);
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, "utf8");

  // Dedupe google fonts stylesheet links — keep one
  const fontLinkRe =
    /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]*" rel="stylesheet">\s*/g;
  const fontLinks = html.match(fontLinkRe) || [];
  if (fontLinks.length > 1) {
    let n = 0;
    html = html.replace(fontLinkRe, (m) => {
      n += 1;
      return n === 1 ? m : "";
    });
  }

  if (!/assets\/css\/style\.css/i.test(html)) {
    const tag = `  <link rel="stylesheet" href="${cssHref}">\n`;
    if (/<script defer src="[^"]*analytics\.js"><\/script>/.test(html)) {
      html = html.replace(
        /(<script defer src="[^"]*analytics\.js"><\/script>)/,
        `${tag}$1`
      );
    } else if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${tag}</head>`);
    }
  }

  fs.writeFileSync(filePath, html, "utf8");
  console.log("fixed", rel);
}

for (const [rel, href] of Object.entries(CSS_VERSIONS)) {
  fix(rel, href);
}
