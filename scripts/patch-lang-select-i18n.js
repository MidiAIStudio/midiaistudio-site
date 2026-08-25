'use strict';
const fs = require('fs');
const p = require('path').join(__dirname, '..', 'assets', 'js', 'app.js');
let s = fs.readFileSync(p, 'utf8');
if (!s.includes("'언어 선택':'Language'")) {
  s = s.replace("'사이트 메뉴':'Site menu'", "'사이트 메뉴':'Site menu','언어 선택':'Language'");
}
if (!s.includes("'언어 선택':'言語'")) {
  s = s.replace("'사이트 메뉴':'サイトメニュー'", "'사이트 메뉴':'サイトメニュー','언어 선택':'言語'");
}
s = s.replace(
  "langBtn.setAttribute('aria-label', `언어 선택, ${meta.name}`);",
  "langBtn.setAttribute('aria-label', `${tt('언어 선택')}, ${meta.name}`);"
);
fs.writeFileSync(p, s);
console.log({
  en: s.includes("'언어 선택':'Language'"),
  ja: s.includes("'언어 선택':'言語'"),
  aria: s.includes("${tt('언어 선택')}, ${meta.name}")
});
