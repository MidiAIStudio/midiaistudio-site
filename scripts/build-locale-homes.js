'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname ? path.join(__dirname, '..') : 'c:/GitHub/midiaistudio-site';
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function makeLocale(lang, title, desc, ogLocale, canonicalPath) {
  let html = src;
  html = html.replace('<html lang="ko">', `<html lang="${lang}">`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${desc}">`
  );
  html = html.replace('content="ko_KR"', `content="${ogLocale}"`);
  html = html.replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${title}"`);
  html = html.replace(
    /property="og:description" content="[^"]*"/,
    `property="og:description" content="${desc}"`
  );
  html = html.replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${title}"`);
  html = html.replace(
    /name="twitter:description" content="[^"]*"/,
    `name="twitter:description" content="${desc}"`
  );
  html = html.replace(/https:\/\/midiaistudio\.com\/(?=["'])/g, `https://midiaistudio.com${canonicalPath}`);

  // Rebase root-relative site assets/links for /en or /ja folder.
  html = html.replace(/(href|src)="\.\/assets\//g, '$1="../assets/');
  html = html.replace(/href="\.\/manifest\.webmanifest"/g, 'href="../manifest.webmanifest"');
  html = html.replace(/href="\.\/index\.html"/g, 'href="./"');
  html = html.replace(/href="\.\/guides\//g, 'href="../guides/');
  // Keep locale purchase in-folder; rebase other root pages to ../
  html = html.replace(/href="\.\/(?!purchase\.html)([a-zA-Z0-9._-]+\.html)"/g, 'href="../$1"');
  // Safety: any accidental ../purchase.html from older builds → locale-local
  html = html.replace(/href="\.\.\/purchase\.html"/g, 'href="./purchase.html"');

  html = html.replace(
    "<script>window.MIDIAI_BASE_PATH='./';</script>",
    `<script>window.MIDIAI_BASE_PATH='../'; localStorage.setItem('midiai_lang','${lang}');</script>`
  );
  html = html.replace(/src="\.\/assets\/js\//g, 'src="../assets/js/');

  if (!html.includes('locale-boot.js')) {
    html = html.replace(
      '<meta charset="utf-8">',
      '<meta charset="utf-8">\n  <script src="../assets/js/locale-boot.js?v=auto-locale-1"></script>'
    );
  }

  html = html.replace(
    /<link rel="alternate" hreflang="ko"[^>]*>\s*<link rel="alternate" hreflang="x-default"[^>]*>/,
    [
      '<link rel="alternate" hreflang="ko" href="https://midiaistudio.com/">',
      '  <link rel="alternate" hreflang="en" href="https://midiaistudio.com/en/">',
      '  <link rel="alternate" hreflang="ja" href="https://midiaistudio.com/ja/">',
      '  <link rel="alternate" hreflang="x-default" href="https://midiaistudio.com/">'
    ].join('\n')
  );

  html = html.replace(/style\.css\?v=[^"]+/g, 'style.css?v=auto-locale-2');
  html = html.replace(/app\.js\?v=[^"]+/g, 'app.js?v=auto-locale-2');
  html = html.replace(/config\.js\?v=[^"]+/g, 'config.js?v=auto-locale-2');
  html = html.replace(/locale-boot\.js\?v=[^"]+/g, 'locale-boot.js?v=auto-locale-2');
  return html;
}

const en = makeLocale(
  'en',
  'MidiAI Studio | AI Audio·YouTube·PDF to MIDI',
  'Windows AI MIDI converter. Turn audio, MP3, YouTube, and sheet-music PDF into MIDI and edit in a piano roll.',
  'en_US',
  '/en/'
);
const ja = makeLocale(
  'ja',
  'MidiAI Studio | AI音源・YouTube・PDF MIDI変換',
  'Windows向けAI MIDI変換ソフト。音源・MP3・YouTube・楽譜PDFをMIDIに変換し、ピアノロールで編集します。',
  'ja_JP',
  '/ja/'
);

fs.writeFileSync(path.join(root, 'en', 'index.html'), en);
fs.writeFileSync(path.join(root, 'ja', 'index.html'), ja);
console.log('wrote en/index.html', en.includes('locale-boot'), /html lang="en"/.test(en));
console.log('wrote ja/index.html', ja.includes('locale-boot'), /html lang="ja"/.test(ja));
