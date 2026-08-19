import http from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };

function serve(){
  return new Promise((resolve)=>{
    const server = http.createServer((req, res)=>{
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const path = join(root, url.replace(/^\//, '') || 'index.html');
      if(!existsSync(path) || statSync(path).isDirectory()){ res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' });
      createReadStream(path).pipe(res);
    });
    server.listen(0, '127.0.0.1', ()=> resolve(server));
  });
}

const props = ['display','height','minHeight','paddingTop','paddingBottom','lineHeight','fontSize','fontWeight','borderTopWidth','borderRadius','verticalAlign','marginTop','marginBottom','position','transform','color','backgroundColor','boxSizing'];
function pick(cs){
  const o = {};
  for(const p of props) o[p] = cs[p];
  return o;
}

const server = await serve();
const browser = await chromium.launch({ headless:true, channel:'chrome' });
try{
  const page = await browser.newPage({ viewport:{ width:1280, height:900 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/patch-type-harness.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(()=> window.__patchHarnessReady === true);
  const result = await page.evaluate((keys)=>{
    const row = [...document.querySelectorAll('.hub-notice-row')].find((r)=> r.querySelector('.badge.active, .patch-badge--version'));
    const app = row?.querySelector('.patch-kind-badge.is-app, .patch-badge--app');
    const ver = row?.querySelector('.badge.active, .patch-badge--version');
    const web = document.querySelector('.patch-kind-badge.is-web, .patch-badge--web');
    const title = row?.querySelector('.hub-col-title-text');
    const box = (el)=>{
      if(!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const parent = el.parentElement.getBoundingClientRect();
      const o = { top: Number(r.top.toFixed(2)), height: Number(r.height.toFixed(2)), center: Number((r.top + r.height/2).toFixed(2)), offsetFromParentTop: Number((r.top - parent.top).toFixed(2)) };
      for(const k of keys) o[k] = cs[k];
      return o;
    };
    return { app: box(app), web: box(web), version: box(ver), title: box(title) };
  }, props);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  server.close();
}
