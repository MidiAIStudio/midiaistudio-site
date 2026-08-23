const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..', '..');
const out = path.join(repo, 'admin.html');
const buf = execSync('git show 7194d94:admin.html', { cwd: repo });
let s = buf.toString('utf8');
s = s.replace('pricing-admin.js?v=price-fix-2', 'pricing-admin.js?v=dyn-catalog-1');
fs.writeFileSync(out, s, 'utf8');

const check = fs.readFileSync(out, 'utf8');
console.log('title ok:', check.includes('관리자 —'));
console.log('mojibake:', check.includes('愿'));
console.log('broken button:', check.includes('??/button>'));
console.log('script:', (check.match(/pricing-admin\.js\?v=[^"']+/) || [])[0]);
