'use strict';
const fs = require('fs');
const p = require('path').join(__dirname, '..', 'assets', 'js', 'app.js');
let s = fs.readFileSync(p, 'utf8');
const pairs = [
  ["'패치노트':'Patch notes','FAQ':'FAQ'", "'패치노트':'Patch notes','업데이트':'Updates','FAQ':'FAQ'"],
  ["'패치노트':'パッチノート','FAQ':'FAQ'", "'패치노트':'パッチノート','업데이트':'アップデート','FAQ':'FAQ'"]
];
for (const [a, b] of pairs) {
  if (!s.includes(a)) {
    console.error('missing', a);
    process.exit(1);
  }
  if (s.includes(b.split(',')[1])) {
    console.log('already has', b.split(',')[1]);
    continue;
  }
  s = s.replace(a, b);
}
fs.writeFileSync(p, s);
console.log('updated', s.includes("'업데이트':'Updates'"), s.includes("'업데이트':'アップデート'"));
