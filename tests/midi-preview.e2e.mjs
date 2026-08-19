import http from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.json': 'application/json'
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

async function runFixture(page, file, expectPrograms){
  await page.goto(`http://127.0.0.1:${port}/tests/midi-preview-harness.html`, { waitUntil: 'load', timeout: 60000 });
  await page.setInputFiles('#file', join(root, 'tests', 'midi-fixtures', file));
  await page.click('#go');
  await page.waitForFunction(()=> document.getElementById('log').textContent.includes('loaded'), { timeout: 180000 });
  const log = await page.textContent('#log');
  console.log('\n===', file, '===');
  console.log(log.slice(-500));
  if(!/loaded /.test(log)) throw new Error(file + ': no loaded line');
  for(const p of expectPrograms){
    if(!log.includes(String(p))) throw new Error(file + ': missing program ' + p);
  }
  const audioSrc = await page.getAttribute('#player', 'src');
  if(!audioSrc) throw new Error(file + ': no audio src');
}

const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome'
});
const page = await browser.newPage();
page.on('console', (msg)=> console.log('BROWSER', msg.type(), msg.text()));
page.on('pageerror', (err)=> console.log('PAGEERROR', err.message));
await runFixture(page, 'simultaneous-4.mid', [0,40,56,73]);
await runFixture(page, 'single-piano.mid', [0]);
await runFixture(page, 'program-change.mid', [0,40]);
await runFixture(page, 'drums-ch10.mid', []);
await runFixture(page, 'arrangement-4.mid', [0,40,56,73]);
await browser.close();
server.close();
console.log('e2e chrome fixtures pass');
