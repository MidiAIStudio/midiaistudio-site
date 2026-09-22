const fs = require('fs');
function lum(hex) {
  let n = hex.replace('#', '');
  if (n.length === 3) n = n.split('').map((c) => c + c).join('');
  if (n.length !== 6) return null;
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2]);
}
function contrast(c, bg) {
  const a = lum(c), b = lum(bg);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const re = /([^{}]+)\{([^{}]+)\}/g;
  let m;
  while ((m = re.exec(css))) rules.push({ sel: m[1].trim(), body: m[2] });
  return rules;
}
const files = ['assets/css/style.css', 'assets/css/seo-content.css', 'assets/css/markdown-cms.css'];
const light = files.concat(['assets/css/theme-light.css']).flatMap((f) => parse(fs.readFileSync(f, 'utf8'))).filter((r) => /data-theme=(['"])light\1/.test(r.sel));
const covered = new Set();
for (const r of light) {
  if (!/\bcolor\s*:/.test(r.body)) continue;
  r.sel.split(',').forEach((s) => {
    const t = s.replace(/html\[data-theme=(['"])light\1\]\s*/g, '').trim();
    if (t) covered.add(t);
  });
}
const interesting = /btn|button|chip|pill|badge|action|like|ghost|secondary|primary|kicker|pager|subnav|footer-links|sale/i;
const lines = [];
for (const f of files) {
  for (const r of parse(fs.readFileSync(f, 'utf8'))) {
    if (!interesting.test(r.sel)) continue;
    const colors = [...r.body.matchAll(/color\s*:\s*(#[0-9a-fA-F]{3,8})/g)];
    for (const c of colors) {
      const hex = c[1].length === 4 ? '#' + c[1].slice(1).split('').map((x) => x + x).join('') : c[1].slice(0, 7);
      const worst = contrast(hex, '#ffffff');
      if (worst >= 3.2) continue;
      const parts = r.sel.split(',').map((s) => s.trim());
      const open = parts.filter((p) => !covered.has(p) && !/:hover/.test(p));
      if (!open.length) continue;
      lines.push(worst.toFixed(2) + ' ' + hex + ' ' + open.join(', ').slice(0, 180));
    }
  }
}
console.log(lines.filter((v, i, a) => a.indexOf(v) === i).join('\n'));
