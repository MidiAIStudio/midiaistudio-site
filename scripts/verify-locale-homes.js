'use strict';
const fs = require('fs');
const e = fs.readFileSync('c:/GitHub/midiaistudio-site/en/index.html', 'utf8');
const j = fs.readFileSync('c:/GitHub/midiaistudio-site/ja/index.html', 'utf8');
console.log('en purchase hrefs', e.match(/href=["'][^"']*purchase[^"']*["']/g));
console.log('ja purchase hrefs', j.match(/href=["'][^"']*purchase[^"']*["']/g));
console.log('en has locale-boot', e.includes('locale-boot'));
console.log('en MIDIAI', e.includes("MIDIAI_BASE_PATH='../'"));
