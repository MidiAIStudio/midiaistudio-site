'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const files = [
  ['purchase.html', './assets/js/locale-boot.js?v=auto-locale-1'],
  ['en/purchase.html', '../assets/js/locale-boot.js?v=auto-locale-1'],
  ['ja/purchase.html', '../assets/js/locale-boot.js?v=auto-locale-1'],
  ['product.html', './assets/js/locale-boot.js?v=auto-locale-1'],
  ['account.html', './assets/js/locale-boot.js?v=auto-locale-1'],
  ['downloads.html', './assets/js/locale-boot.js?v=auto-locale-1'],
  ['guide.html', './assets/js/locale-boot.js?v=auto-locale-1'],
  ['guide/index.html', '../assets/js/locale-boot.js?v=auto-locale-1']
];

for (const [rel, src] of files) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.log('skip missing', rel);
    continue;
  }
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('locale-boot.js')) {
    console.log('already', rel);
    continue;
  }
  if (!html.includes('<meta charset="utf-8">')) {
    console.log('no charset', rel);
    continue;
  }
  html = html.replace(
    '<meta charset="utf-8">',
    `<meta charset="utf-8">\n  <script src="${src}"></script>`
  );
  // light cache bump on app.js if present
  html = html.replace(/app\.js\?v=[^"]+/g, 'app.js?v=auto-locale-1');
  html = html.replace(/style\.css\?v=[^"]+/g, 'style.css?v=auto-locale-1');
  fs.writeFileSync(file, html);
  console.log('patched', rel);
}
