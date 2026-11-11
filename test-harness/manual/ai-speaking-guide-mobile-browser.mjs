import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW_DIR+'/node_modules/playwright-core');
const root=path.resolve('cloudflare-deploy/public');
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript'})[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
let cases=0;
try {
 for(const width of [320,360,390,430,560,768,1366]) for(const lang of ['ko','en']) {
  const page=await browser.newPage({viewport:{width,height:844}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/ai-speaking.html');
  await page.click('#guideBtn');
  let frame=page.frameLocator('#guideFrame');
  await frame.locator('a[href*="ai-speaking-guide-full"]').click();
  await frame.locator('[data-lang-btn="'+lang+'"]').click();
  const rows=await frame.locator('.legend li').evaluateAll((els)=>els.map(li=>{
   const visible=e=>getComputedStyle(e).display!=='none';
   const b=[...li.querySelectorAll('b')].find(visible).getBoundingClientRect();
   const s=[...li.querySelectorAll(':scope > span')].find(visible).getBoundingClientRect();
   return {titleX:b.x,titleY:b.y,textX:s.x,textY:s.y,width:s.width,height:s.height};
  }));
  assert.equal(rows.length,6);
  for(const row of rows){assert.ok(row.width>150,JSON.stringify({width,lang,row}));if(width<=560){assert.ok(Math.abs(row.titleX-row.textX)<1);assert.ok(row.textY>row.titleY);}}
  assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1));
  cases++;
  await page.close();
 }
 console.log('PASS: guide dialog -> full guide, KO/EN, '+cases+' viewport cases; all 6 descriptions retain readable width.');
} finally {await browser.close();server.close();}
