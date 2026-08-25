'use strict';
/**
 * Offline unit checks for locale-boot priority rules.
 * Simulates the same priority without DOM/location.
 */
function normLang(v) {
  const s = String(v || '').toLowerCase().replace(/_/g, '-');
  if (s === 'ko' || s === 'en' || s === 'ja') return s;
  const primary = s.split('-')[0];
  return primary === 'ko' || primary === 'en' || primary === 'ja' ? primary : '';
}
function fromBrowser(list) {
  for (const raw of list || []) {
    const hit = normLang(raw);
    if (hit) return hit;
  }
  return '';
}
function fromCountry(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === 'ZZ' || c === 'XX') return '';
  if (c === 'JP') return 'ja';
  if (c === 'KR' || c === 'KP') return 'ko';
  if (['US','GB','AU','CA','NZ','IE','SG','PH','IN','ZA','MY'].includes(c)) return 'en';
  return '';
}
function preferred({ saved, browser, country }) {
  return normLang(saved) || fromBrowser(browser) || fromCountry(country) || 'ko';
}

/** Mirrors locale-boot.js isHomePath — only locale roots, not nested index.html pages */
function isHomePath(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  const lower = p.toLowerCase();
  return (
    lower === '' ||
    lower === '/' ||
    lower === '/index.html' ||
    lower === '/en' ||
    lower === '/en/index.html' ||
    lower === '/ja' ||
    lower === '/ja/index.html' ||
    lower === '/ko' ||
    lower === '/ko/index.html'
  );
}

const homePathCases = [
  { path: '/', expect: true },
  { path: '/index.html', expect: true },
  { path: '/en/', expect: true },
  { path: '/en/index.html', expect: true },
  { path: '/ja/index.html', expect: true },
  { path: '/guide/index.html', expect: false },
  { path: '/guide/getting-started/index.html', expect: false },
  { path: '/product.html', expect: false },
  { path: '/en/purchase.html', expect: false }
];

const cases = [
  { name: 'saved=ja + KR', saved: 'ja', browser: ['ko-KR'], country: 'KR', expect: 'ja' },
  { name: 'saved=en + JP', saved: 'en', browser: ['ja-JP'], country: 'JP', expect: 'en' },
  { name: 'browser=en-US', saved: '', browser: ['en-US'], country: '', expect: 'en' },
  { name: 'browser=ja-JP', saved: '', browser: ['ja-JP'], country: '', expect: 'ja' },
  { name: 'browser=ko-KR', saved: '', browser: ['ko-KR'], country: '', expect: 'ko' },
  { name: 'country=JP only', saved: '', browser: [], country: 'JP', expect: 'ja' },
  { name: 'all unknown', saved: '', browser: ['fr-FR'], country: 'FR', expect: 'ko' }
];

let failed = 0;
for (const c of cases) {
  const got = preferred(c);
  const ok = got === c.expect;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: got=${got} expect=${c.expect}`);
  if (!ok) failed++;
}
for (const c of homePathCases) {
  const got = isHomePath(c.path);
  const ok = got === c.expect;
  console.log(`${ok ? 'PASS' : 'FAIL'} isHomePath(${c.path}): got=${got} expect=${c.expect}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`FAILED ${failed}`);
  process.exit(1);
}
console.log('ALL PASS');
