'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname ? path.join(__dirname, '..') : 'c:/GitHub/midiaistudio-site';
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const COPY = {
  en: {
    h1: 'Convert audio and YouTube music to MIDI with AI',
    lead: 'MidiAI Studio is Windows AI MIDI conversion and transcription software. Turn MP3, audio, YouTube, and score PDFs into MIDI and edit them in a piano roll.',
    schemaDesc: 'Windows software that converts MP3, WAV, YouTube, and score PDFs to MIDI and includes MIDI editing.',
    h2: 'What you can convert to MIDI',
    buy: 'Buy license',
    trial: 'Download free trial',
    price: '89.00',
    currency: 'USD'
  },
  ja: {
    h1: '音源とYouTubeの音楽をAIでMIDIに変換',
    lead: 'MidiAI StudioはWindows向けAI MIDI変換・自動採譜ソフトです。MP3・オーディオ、YouTube、楽譜PDFをMIDIに変換し、ピアノロールで編集します。',
    schemaDesc: 'MP3・WAV・YouTube・楽譜PDFをAIでMIDIに変換し、MIDI編集までできるWindowsソフト。',
    h2: 'MIDIに変換できるもの',
    buy: 'ライセンス購入',
    trial: '無料体験ダウンロード',
    price: '89.00',
    currency: 'USD'
  }
};

function makeLocale(lang, title, desc, ogLocale, canonicalPath) {
  let html = src;
  const copy = COPY[lang];
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

  html = html.replace(
    /<link rel="canonical" href="https:\/\/midiaistudio\.com\/">/,
    `<link rel="canonical" href="https://midiaistudio.com${canonicalPath}">`
  );
  html = html.replace(
    /property="og:url" content="https:\/\/midiaistudio\.com\/"/,
    `property="og:url" content="https://midiaistudio.com${canonicalPath}"`
  );

  if (copy) {
    html = html.replace(
      /<h1>음원과 YouTube 음악을 AI로 MIDI로 변환<\/h1>/,
      `<h1>${copy.h1}</h1>`
    );
    html = html.replace(
      /<h2>무엇을 MIDI로 변환할 수 있나요<\/h2>/,
      `<h2>${copy.h2}</h2>`
    );
    html = html.replace(
      /"price": "129000",\s*"priceCurrency": "KRW"/,
      `"price": "${copy.price}",\n      "priceCurrency": "${copy.currency}"`
    );
    html = html.replace(
      /<p class="portal-lead">MidiAI Studio는 Windows용 AI MIDI 변환·자동 채보 소프트웨어입니다\. MP3·오디오, YouTube, 악보 PDF를 MIDI로 바꾸고 피아노롤에서 편집합니다\.<\/p>/,
      `<p class="portal-lead">${copy.lead}</p>`
    );
    html = html.replace(
      /"description": "음원·MP3·WAV, YouTube, 악보 PDF를 AI로 MIDI로 변환하고 MIDI 편집까지 지원하는 Windows 소프트웨어\."/,
      `"description": "${copy.schemaDesc}"`
    );
    html = html.replace(
      /<a class="primary" href="\.\/purchase\.html">라이선스 구매<\/a>/,
      `<a class="primary" href="./purchase.html">${copy.buy}</a>`
    );
    html = html.replace(
      /<a class="secondary" href="\.\/downloads\.html">무료 체험 다운로드<\/a>/,
      `<a class="secondary" href="./downloads.html">${copy.trial}</a>`
    );
  }

  html = html.replace(/(href|src)="\.\/assets\//g, '$1="../assets/');
  html = html.replace(/href="\.\/manifest\.webmanifest"/g, 'href="../manifest.webmanifest"');
  html = html.replace(/href="\.\/index\.html"/g, 'href="./"');
  html = html.replace(/href="\.\/guides\//g, 'href="../guides/');
  html = html.replace(/href="\.\/guide\//g, 'href="../guide/');
  html = html.replace(/href="\.\/(?!purchase\.html)([a-zA-Z0-9._-]+\.html)"/g, 'href="../$1"');
  html = html.replace(/href="\.\.\/purchase\.html"/g, 'href="./purchase.html"');

  html = html.replace(
    "<script>window.MIDIAI_BASE_PATH='./';</script>",
    `<script>window.MIDIAI_BASE_PATH='../'; localStorage.setItem('midiai_lang','${lang}');</script>`
  );
  html = html.replace(/src="\.\/assets\/js\//g, 'src="../assets/js/');

  if (!html.includes('locale-boot.js')) {
    html = html.replace(
      '<meta charset="utf-8">',
      '<meta charset="utf-8">\n  <script src="../assets/js/locale-boot.js?v=seo-hub-1"></script>'
    );
  }

  html = html.replace(
    /<link rel="alternate" hreflang="ko"[^>]*>\s*<link rel="alternate" hreflang="en"[^>]*>\s*<link rel="alternate" hreflang="ja"[^>]*>\s*<link rel="alternate" hreflang="x-default"[^>]*>/,
    [
      '<link rel="alternate" hreflang="ko" href="https://midiaistudio.com/">',
      '  <link rel="alternate" hreflang="en" href="https://midiaistudio.com/en/">',
      '  <link rel="alternate" hreflang="ja" href="https://midiaistudio.com/ja/">',
      '  <link rel="alternate" hreflang="x-default" href="https://midiaistudio.com/">'
    ].join('\n')
  );

  html = html.replace(/style\.css\?v=[^"]+/g, 'style.css?v=seo-hub-2');
  html = html.replace(/app\.js\?v=[^"]+/g, 'app.js?v=seo-hub-1');
  html = html.replace(/config\.js\?v=[^"]+/g, 'config.js?v=seo-hub-1');
  html = html.replace(/locale-boot\.js\?v=[^"]+/g, 'locale-boot.js?v=seo-hub-1');
  return html;
}

const en = makeLocale(
  'en',
  'AI MIDI Converter for Audio, YouTube &amp; PDF | MidiAI Studio',
  'Windows AI MIDI converter. Convert MP3, WAV, YouTube, and sheet-music PDF to MIDI, then edit in a piano roll.',
  'en_US',
  '/en/'
);
const ja = makeLocale(
  'ja',
  'AI MIDI変換｜音源・YouTube・PDFをMIDIに | MidiAI Studio',
  'Windows向けAI MIDI変換ソフト。音源・MP3・WAV・YouTube・楽譜PDFをMIDIに変換し、ピアノロールで編集します。',
  'ja_JP',
  '/ja/'
);

fs.writeFileSync(path.join(root, 'en', 'index.html'), en);
fs.writeFileSync(path.join(root, 'ja', 'index.html'), ja);

function checkHreflang(label, html) {
  const ko = /hreflang="ko" href="https:\/\/midiaistudio\.com\/"/.test(html);
  const enH = /hreflang="en" href="https:\/\/midiaistudio\.com\/en\/"/.test(html);
  const jaH = /hreflang="ja" href="https:\/\/midiaistudio\.com\/ja\/"/.test(html);
  const xd = /hreflang="x-default" href="https:\/\/midiaistudio\.com\/"/.test(html);
  console.log(label, { ko, en: enH, ja: jaH, xdefault: xd });
}

console.log('wrote en/index.html', en.includes('locale-boot'), /html lang="en"/.test(en));
console.log('wrote ja/index.html', ja.includes('locale-boot'), /html lang="ja"/.test(ja));
checkHreflang('en hreflang', en);
checkHreflang('ja hreflang', ja);
