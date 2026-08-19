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
    const rows = [...document.querySelectorAll('.hub-notice-row')];
    const body = document.querySelector('.hub-list-body');
    return {
      items: rows.map((row)=>({
        kind: row.querySelector('.patch-kind-badge')?.textContent?.trim() || '',
        version: row.querySelector('.badge.active')?.textContent?.trim() || '',
        title: row.querySelector('.hub-col-title-text')?.textContent?.trim() || '',
        height: Math.round(row.getBoundingClientRect().height)
      })),
      overflow: body.scrollWidth > body.clientWidth + 2,
      webDetailVersion: document.querySelector('#detailWeb .patch-version-pill')?.textContent || '',
      appDetail: {
        kind: document.querySelector('#detailApp .patch-kind-badge')?.textContent?.trim() || '',
        version: document.querySelector('#detailApp .patch-version-pill')?.textContent?.trim() || ''
      }
    };
  });
  const web = desktop.items.find((x)=> x.kind === 'WEB');
  const app = desktop.items.find((x)=> x.version === 'v1.6.2');
  if(!web) fail('WEB row missing');
  if(web.version) fail('WEB row showed version: ' + web.version);
  if(!web.title.includes('미리듣기')) fail('WEB title missing');
  if(!app || app.kind !== 'APP') fail('legacy v1.6.2 not APP: ' + JSON.stringify(app));
  if(desktop.overflow) fail('desktop overflow');
  if(desktop.webDetailVersion) fail('WEB detail showed version');
  if(desktop.appDetail.kind !== 'APP' || desktop.appDetail.version !== 'v1.6.2') fail('APP detail mismatch');

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(()=>{
    const rows = [...document.querySelectorAll('.hub-notice-row')];
    const body = document.querySelector('.hub-list-body') || document.body;
    return {
      items: rows.map((row)=>({
        kind: row.querySelector('.patch-kind-badge')?.textContent?.trim() || '',
        version: row.querySelector('.badge.active')?.textContent?.trim() || '',
        title: row.querySelector('.hub-col-title-text')?.textContent?.trim() || '',
        height: Math.round(row.getBoundingClientRect().height)
      })),
      overflowX: body.scrollWidth > document.documentElement.clientWidth + 4
    };
  });
  if(mobile.items.some((x)=> !x.kind)) fail('mobile missing kind badge');
  if(mobile.items.some((x)=> x.height > 160)) fail('mobile row too tall ' + JSON.stringify(mobile.items));
  if(mobile.overflowX) fail('mobile horizontal overflow');

  console.log('desktop', desktop);
  console.log('mobile', mobile);
  if(errors.length) fail('page errors: ' + errors.join(' | '));
  console.log('e2e patch-type harness pass');
} finally {
  await browser.close();
  server.close();
}
