import http from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css'
};

function serve(){
  return new Promise((resolve)=>{
    const server = http.createServer((req, res)=>{
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let path = join(root, url.replace(/^\//, '') || 'index.html');
      if(!existsSync(path) || statSync(path).isDirectory()){
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
      createReadStream(path).pipe(res);
    });
    server.listen(0, '127.0.0.1', ()=> resolve(server));
  });
}

function fail(msg){ throw new Error(msg); }

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const errors = [];
try{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (err)=> errors.push(err.message));
  await page.goto(`${origin}/tests/patch-type-harness.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(()=> window.__patchHarnessReady === true, { timeout: 10000 });

  const desktop = await page.evaluate(()=>{
    const box = (el)=>{
      if(!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const parent = el.parentElement.getBoundingClientRect();
      return {
        text: el.textContent.trim(),
        height: Number(r.height.toFixed(2)),
        center: Number((r.top + r.height/2).toFixed(2)),
        offset: Number((r.top - parent.top).toFixed(2)),
        radius: cs.borderRadius,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontWeight: cs.fontWeight,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        marginTop: cs.marginTop,
        borderWidth: cs.borderTopWidth,
        color: cs.color,
        display: cs.display
      };
    };
    const rows = [...document.querySelectorAll('.hub-notice-row')];
    const appRow = rows.find((r)=> r.querySelector('.patch-badge--version')?.textContent.includes('1.6.2'));
    const webRow = rows.find((r)=> r.querySelector('.patch-badge--web'));
    const body = document.querySelector('.hub-list-body');
    const app = box(appRow?.querySelector('.patch-badge--app'));
    const version = box(appRow?.querySelector('.patch-badge--version'));
    const title = box(appRow?.querySelector('.hub-col-title-text'));
    const web = box(webRow?.querySelector('.patch-badge--web'));
    return {
      items: rows.map((row)=>({
        kind: row.querySelector('.patch-badge--app, .patch-badge--web')?.textContent?.trim() || '',
        version: row.querySelector('.patch-badge--version')?.textContent?.trim() || '',
        title: row.querySelector('.hub-col-title-text')?.textContent?.trim() || '',
        height: Math.round(row.getBoundingClientRect().height)
      })),
      overflow: body.scrollWidth > body.clientWidth + 2,
      app, web, version, title,
      webDetailVersion: document.querySelector('#detailWeb .patch-badge--version')?.textContent || '',
      appDetail: {
        kind: document.querySelector('#detailApp .patch-badge--app')?.textContent?.trim() || '',
        version: document.querySelector('#detailApp .patch-badge--version')?.textContent?.trim() || ''
      }
    };
  });

  const web = desktop.items.find((x)=> x.kind === 'WEB');
  const app162 = desktop.items.find((x)=> x.version === 'v1.6.2');
  const app161 = desktop.items.find((x)=> x.version === 'v1.6.1');
  const app160 = desktop.items.find((x)=> x.version === 'v1.6.0');
  if(!web || web.version) fail('WEB row invalid: ' + JSON.stringify(web));
  if(!app162 || app162.kind !== 'APP') fail('v1.6.2 row invalid');
  if(!app161 || app161.kind !== 'APP') fail('v1.6.1 row invalid');
  if(!app160 || app160.kind !== 'APP') fail('v1.6.0 row invalid');
  if(desktop.overflow) fail('desktop overflow');
  if(desktop.webDetailVersion) fail('WEB detail showed version');
  if(desktop.appDetail.kind !== 'APP' || desktop.appDetail.version !== 'v1.6.2') fail('APP detail mismatch');

  const {app, version, web: webBadge, title} = desktop;
  for(const [name, el] of [['APP', app], ['WEB', webBadge], ['VERSION', version]]){
    if(!el) fail(name + ' missing');
    if(el.height !== 18) fail(name + ' height ' + el.height);
    if(el.radius !== '6px') fail(name + ' radius ' + el.radius);
    if(el.fontSize !== '10px') fail(name + ' font-size ' + el.fontSize);
    if(el.lineHeight !== '10px') fail(name + ' line-height ' + el.lineHeight);
    if(el.paddingTop !== '0px' || el.paddingBottom !== '0px') fail(name + ' padding ' + el.paddingTop);
    if(el.marginTop !== '0px') fail(name + ' margin-top ' + el.marginTop);
    if(el.borderWidth !== '1px') fail(name + ' border ' + el.borderWidth);
    if(el.fontWeight !== '800') fail(name + ' weight ' + el.fontWeight);
  }
  if(Math.abs(app.center - version.center) > 0.6) fail('APP/VERSION center mismatch ' + app.center + ' vs ' + version.center);
  if(Math.abs(app.center - title.center) > 1.2) fail('APP/title center mismatch ' + app.center + ' vs ' + title.center);
  if(app.color === 'rgb(154, 163, 187)' || app.color === 'rgb(154,163,187)') fail('APP still gray');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(()=>{
    const rows = [...document.querySelectorAll('.hub-notice-row')];
    const body = document.querySelector('.hub-list-body') || document.body;
    const appRow = rows.find((r)=> r.querySelector('.patch-badge--version')?.textContent.includes('1.6.2'));
    const app = appRow?.querySelector('.patch-badge--app')?.getBoundingClientRect();
    const ver = appRow?.querySelector('.patch-badge--version')?.getBoundingClientRect();
    return {
      items: rows.map((row)=>({
        kind: row.querySelector('.patch-badge--app, .patch-badge--web')?.textContent?.trim() || '',
        version: row.querySelector('.patch-badge--version')?.textContent?.trim() || '',
        title: row.querySelector('.hub-col-title-text')?.textContent?.trim() || '',
        height: Math.round(row.getBoundingClientRect().height)
      })),
      overflowX: body.scrollWidth > document.documentElement.clientWidth + 4,
      centerDelta: app && ver ? Math.abs((app.top + app.height/2) - (ver.top + ver.height/2)) : 99
    };
  });
  if(mobile.items.some((x)=> !x.kind)) fail('mobile missing kind badge');
  if(mobile.items.some((x)=> x.height > 160)) fail('mobile row too tall ' + JSON.stringify(mobile.items));
  if(mobile.overflowX) fail('mobile horizontal overflow');
  if(mobile.centerDelta > 0.6) fail('mobile APP/VERSION misaligned ' + mobile.centerDelta);

  console.log('desktop metrics', { app, web: webBadge, version, title });
  console.log('desktop rows', desktop.items);
  console.log('mobile', mobile);
  if(errors.length) fail('page errors: ' + errors.join(' | '));
  console.log('e2e patch-type harness pass');
} finally {
  await browser.close();
  server.close();
}
