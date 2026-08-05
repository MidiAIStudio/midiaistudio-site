const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = 'c:/GitHub/midiaistudio-site/_menu_audit';
fs.mkdirSync(out, { recursive: true });

const pages = [
  ['home', 'index.html'],
  ['product', 'product.html'],
  ['guide', 'guide/index.html'],
  ['downloads', 'downloads.html'],
  ['purchase', 'purchase.html'],
  ['notices', 'notices.html'],
  ['patches', 'patch-notes.html'],
  ['faq', 'faq.html'],
  ['board', 'board.html'],
  ['support', 'support.html'],
  ['tickets', 'my-tickets.html'],
  ['account', 'account.html'],
  ['admin', 'admin.html'],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route('**/googleapis.com/**', r => r.abort());
  await context.route('**/gstatic.com/**', r => r.abort());
  await context.route('**/googletagmanager.com/**', r => r.abort());
  await context.route('**/google-analytics.com/**', r => r.abort());
  await context.route('**/firebase*/**', r => r.abort());
  await context.route('**/firebasestorage.googleapis.com/**', r => r.abort());

  const page = await context.newPage();
  const results = [];

  for (const [name, file] of pages) {
    const url = `http://127.0.0.1:5520/${file}`;
    const row = { name, file, url, ok: true, issues: [] };
    try {
      // boot flash: delay app.js slightly and capture mid-state
      let delayed = false;
      const handler = async (route) => {
        if (!delayed && /assets\/js\/app\.js/.test(route.request().url())) {
          delayed = true;
          const res = await route.fetch();
          const body = await res.text();
          await new Promise(r => setTimeout(r, 500));
          await route.fulfill({ response: res, body });
          return;
        }
        await route.continue();
      };
      await context.route('**/assets/js/app.js**', handler);
      const navP = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(180);
      const mid = await page.evaluate(() => ({
        layout: document.body.classList.contains('sidebar-layout'),
        before: getComputedStyle(document.body, '::before').content,
        beforeW: getComputedStyle(document.body, '::before').width,
        mainML: getComputedStyle(document.querySelector('main') || document.body).marginLeft,
        mainOp: getComputedStyle(document.querySelector('main') || document.body).opacity,
        shells: document.querySelectorAll('.app-shell').length,
      }));
      await page.screenshot({ path: path.join(out, `${name}_boot.png`) });
      await navP;
      await context.unroute('**/assets/js/app.js**', handler);
      await page.waitForTimeout(700);

      const loaded = await page.evaluate(() => {
        const active = [...document.querySelectorAll('#mainNav a.active')].map(a => ({
          text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
          href: a.getAttribute('href') || ''
        }));
        const subnav = document.querySelector('.hub-subnav');
        return {
          layout: document.body.classList.contains('sidebar-layout'),
          shells: document.querySelectorAll('.app-shell').length,
          sidebars: document.querySelectorAll('.sidebar').length,
          topbars: document.querySelectorAll('.topbar').length,
          mains: document.querySelectorAll('main').length,
          before: getComputedStyle(document.body, '::before').content,
          mainML: getComputedStyle(document.querySelector('main') || document.body).marginLeft,
          brandTop: !!document.querySelector('.topbar .brand'),
          brandSide: !!document.querySelector('.sidebar-brand, .sidebar .brand'),
          hubSubnavDisplay: subnav ? getComputedStyle(subnav).display : null,
          active,
          title: document.title,
        };
      });
      await page.screenshot({ path: path.join(out, `${name}_loaded.png`), fullPage: false });

      // reload check
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(600);
      const afterReload = await page.evaluate(() => ({
        layout: document.body.classList.contains('sidebar-layout'),
        shells: document.querySelectorAll('.app-shell').length,
        before: getComputedStyle(document.body, '::before').content,
        mainML: getComputedStyle(document.querySelector('main') || document.body).marginLeft,
      }));
      await page.screenshot({ path: path.join(out, `${name}_reload.png`) });

      row.mid = mid;
      row.loaded = loaded;
      row.afterReload = afterReload;

      if (mid.before === '""' || (mid.beforeW && mid.beforeW !== 'auto' && mid.beforeW !== '0px')) {
        row.issues.push('boot_fake_sidebar');
      }
      if (mid.mainML && mid.mainML !== '0px' && mid.mainOp !== '0') {
        row.issues.push('boot_shifted_visible_content');
      }
      if (!loaded.layout) row.issues.push('no_sidebar_layout');
      if (loaded.shells !== 1) row.issues.push(`shells=${loaded.shells}`);
      if (loaded.sidebars !== 1) row.issues.push(`sidebars=${loaded.sidebars}`);
      if (loaded.before === '""') row.issues.push('loaded_fake_sidebar');
      if (loaded.mainML !== '0px') row.issues.push(`mainML=${loaded.mainML}`);
      if (loaded.brandTop) row.issues.push('brand_still_in_topbar');
      if (!loaded.brandSide) row.issues.push('no_sidebar_brand');
      if (loaded.hubSubnavDisplay && loaded.hubSubnavDisplay !== 'none') row.issues.push('hub_subnav_visible');
      if (!afterReload.layout) row.issues.push('reload_no_layout');
      if (afterReload.shells !== 1) row.issues.push(`reload_shells=${afterReload.shells}`);

      row.ok = row.issues.length === 0;
      console.log((row.ok ? 'OK ' : 'BAD') , name, row.issues.join(',') || '-');
    } catch (e) {
      row.ok = false;
      row.issues.push('exception:' + (e.message || e));
      console.log('ERR', name, e.message || e);
    }
    results.push(row);
  }

  await browser.close();
  const summary = {
    total: results.length,
    ok: results.filter(r => r.ok).length,
    bad: results.filter(r => !r.ok).map(r => ({ name: r.name, issues: r.issues })),
    results
  };
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\nSUMMARY', summary.ok + '/' + summary.total, 'ok');
  if (summary.bad.length) console.log('BAD', JSON.stringify(summary.bad, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
