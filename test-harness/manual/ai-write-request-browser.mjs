// Real DOM and fetch cancellation; all API traffic is synthetic and local.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import assert from 'node:assert/strict';
import {requireBrowser} from './_pw.mjs';
const {chromium,exe}=requireBrowser();
const pub=new URL('../../cloudflare-deploy/public/',import.meta.url);
const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/ai/write-correct')) {
    res.writeHead(200,{'Content-Type':'application/json'});res.write('{"ok":');return;
  }
  try {const p=req.url.split('?')[0];res.setHeader('Content-Type',extname(p)==='.html'?'text/html; charset=utf-8':extname(p)==='.js'?'application/javascript':extname(p)==='.css'?'text/css':'application/octet-stream');res.end(await readFile(new URL('.'+p,pub)));}
  catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try {
 browser=await chromium.launch({executablePath:exe,headless:true});
 for(const width of [390,768,1280]) {
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('mangoi_aiwrite_howto_v1','1'));
  let calls=0,mode='hold',release;
  let held=new Promise(r=>release=r);
  let entered;const routed=new Promise(r=>entered=r);
  const good={ok:true,corrected:'A boy is eating cake.',score:85,issues:[],upgrades:[],suggestions:[]};
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==base)return route.abort();
   if(!u.pathname.startsWith('/api/'))return route.continue();
   if(u.pathname==='/api/ai/write-correct') {
    calls++;entered();
    if(mode==='stall')return route.continue();
    if(mode==='hold')await held;
    return route.fulfill({json:mode==='invalid'?{ok:true,score:85}:good});
   }
   return route.fulfill({json:{ok:false,items:[]}});
  });
  await page.goto(base+'/ai-write.html');
  await page.click('#awHelp > summary');await page.click('#sentenceCoach > summary');
  await page.fill('#coachSentence','A boy is eating cake.');await page.fill('#text','My first sentence. ');
  await page.click('#coachAdd');assert.equal(await page.inputValue('#text'),'My first sentence. \nA boy is eating cake.');
  await page.fill('#text','');await page.click('#coachAdd');assert.equal(await page.inputValue('#text'),'A boy is eating cake.');
  await page.click('#coachAdd');assert.equal(await page.inputValue('#text'),'A boy is eating cake.');
  await page.evaluate(()=>{_goAnswers.where='original place';submitText();submitText();});
  await routed;
  assert.equal(calls,1);
  await page.evaluate(()=>{currentLevel='B2';_goAnswers.where='changed place';document.querySelector('#text').value='My new draft.';});
  release();await page.waitForFunction(()=>!document.querySelector('#submitBtn').disabled);
  assert.equal(await page.inputValue('#text'),'My new draft.');assert.equal(await page.evaluate(()=>_lastResult.level),'A1');
  await page.evaluate(()=>openSheet());
  const sheet=await page.locator('#sheetModal').textContent();assert(sheet.includes('A boy is eating cake.'));assert(sheet.includes('original place'));assert(!sheet.includes('changed place'));
  await page.evaluate(()=>closeSheet());
  mode='invalid';await page.evaluate(()=>submitText());
  assert.equal(await page.inputValue('#text'),'My new draft.');assert.equal(await page.evaluate(()=>_lastDraft),'A boy is eating cake.');
  assert.equal(await page.locator('#submitBtn').isEnabled(),true);
  // Headers arrive, but body never finishes. Browser AbortController must release the UI.
  mode='stall';await page.clock.install();
  await page.evaluate(()=>{const original=window.fetch;window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).includes('write-correct'))window.__headers=true;return r;};submitText();});
  await page.waitForFunction(()=>window.__headers===true);await page.clock.runFor(120001);
  await page.waitForFunction(()=>!document.querySelector('#submitBtn').disabled);
  assert.equal(await page.inputValue('#text'),'My new draft.');assert.equal(calls,3);
  assert.equal(errors.length,0,errors.join('\n'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log('PASS',width,'coach re-add, duplicates, captured level/memo, preserved draft/print, malformed response, stalled body timeout, no script errors/overflow');
  await page.close();
 }
} finally {if(browser)await browser.close();server.closeAllConnections();server.close();}
