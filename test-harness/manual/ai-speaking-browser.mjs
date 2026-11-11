// Entire pages on localhost. All external requests blocked; no live AI, mic or DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { browserJobs, runPool } from '../helpers/browser-pool.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_DIR + '/node_modules/playwright');
const root = path.resolve('cloudflare-deploy/public');
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname.startsWith('/api/')) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:false,items:[],data:[]})); return; }
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
const sizes = [[320,568],[360,640],[375,667],[390,844],[430,932],[768,1024],[820,1180],[1024,768],[1366,768],[1920,1080]];
let cases=0, assertions=0; const failures=[];
function check(value,message) { assertions++; assert.ok(value,message); }
// 사례마다 새 컨텍스트(저장소가 따로)라 동시에 돌려도 서로를 못 봅니다(helpers/browser-pool.mjs).
// CASE_FILTER·CASE_LIMIT 는 예전과 같은 뜻 — 순서대로 거른 뒤 앞에서부터 N개.
let matrix=[];
for(const [width,height] of sizes) for(const language of ['ko','en']) for(const storage of ['empty','saved','blocked','unavailable']) for(const mode of ['textbook','friend']) for(const keyboard of [false,true]) {
  const name = `${width}x${height}/${language}/${storage}/${mode}/${keyboard?'keyboard':'pointer'}`;
  if(process.env.CASE_FILTER && !name.includes(process.env.CASE_FILTER)) continue;
  matrix.push({width,height,language,storage,mode,keyboard,name});
}
if (process.env.CASE_LIMIT) matrix=matrix.slice(0,Number(process.env.CASE_LIMIT));
const jobs=browserJobs();
console.log(`speaking sandbox: ${matrix.length} cases, ${jobs} at a time`);
try {
  await runPool(matrix,jobs,async({width,height,language,storage,mode,keyboard,name},index)=>{
    const ctx = await browser.newContext({viewport:{width,height}});
    await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await ctx.addInitScript(({language,storage})=>{
      if(storage==='unavailable') Object.defineProperty(window,'localStorage',{get(){const error=new Error('storage unavailable');error.name='SecurityError';throw error;}});
      else {
        if(!localStorage.getItem('speaking_sandbox_seeded')) {
          localStorage.setItem('mangoi_lang',language);
          if(storage==='saved') { localStorage.setItem('mangoi_aifriend_level','5');localStorage.setItem('mangoi_aifriend_correction','balanced'); }
          localStorage.setItem('speaking_sandbox_seeded','1');
        }
        if(storage==='blocked') Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError');};
      }
    },{language,storage});
    const page=await ctx.newPage(); page.setDefaultTimeout(6000);
    const errors=[];page.on('pageerror',e=>errors.push(e.stack || e.message));
    const requests=[];page.on('request',r=>requests.push(r.url()));
    try {
      await page.goto(origin+'/ai-speaking.html');
      check(await page.locator('.mode').count()===3,'three modes');
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'hub has no horizontal overflow');
      check(await page.locator('html').getAttribute('lang')===(storage==='unavailable'?'ko':language),'language or safe fallback');
      check(!requests.some(u=>u.includes('/api/')),'hub makes no API calls');
      check(errors.length===0,'hub has no JS errors: '+errors.join(';'));
      const link=page.locator('#'+mode+'-mode');
      if(keyboard){await link.focus();await page.keyboard.press('Enter');}else await link.click();
      await page.waitForURL('**/'+(mode==='textbook'?'warmup':'ai-friend')+'.html');
      check(await page.locator('a[href="/ai-speaking.html"]').count()>=1,'return link exists');
      // Allow one CSS pixel of browser rounding, never a clipped control.
      const overflow = await page.evaluate(()=>({ok:document.documentElement.scrollWidth<=innerWidth+1,width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+0.01;}).slice(0,12).map(e=>({tag:e.tagName,id:e.id,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,65)}))}));
      check(overflow.ok,'practice has no horizontal overflow: '+JSON.stringify(overflow));
      // 2026-11-09: A.i 친구하기는 열자마자 얼굴 대화(영상통화 화면)가 뜬다 — 웜업은 설정 화면이 먼저라 안 뜬다.
      // 돌아가는 길은 사람과 같게: ✕ 로 얼굴 화면을 닫고(실제 포인터) 그다음 «모드 선택».
      if(mode!=='textbook'){
        await page.waitForFunction(()=>window.MangoiFaceTalk&&MangoiFaceTalk.isActive(),null,{timeout:6000}).catch(()=>{});
        check(await page.evaluate(()=>!!(window.MangoiFaceTalk&&MangoiFaceTalk.isActive())),'friend opens face talk by default');
        await page.locator('#ftk .fc-close').click();
        check(await page.evaluate(()=>!MangoiFaceTalk.isActive()),'face talk closes with X');
      } else {
        check(await page.evaluate(()=>!(window.MangoiFaceTalk&&MangoiFaceTalk.isActive())),'warmup setup is not covered by face talk');
      }
      // Actual pointer hit-testing, not JS .click(): catches links obscured by onboarding.
      await page.locator('a[href="/ai-speaking.html"]:visible').first().click();
      await page.waitForURL('**/ai-speaking.html');
      check(await page.locator('.mode').count()===3,'round trip returns to choice');
      await page.reload();
      check(await page.locator('.mode').count()===3,'reload keeps choice usable');
      if(storage==='saved') {
        const saved=await page.evaluate(()=>[localStorage.getItem('mangoi_aifriend_level'),localStorage.getItem('mangoi_aifriend_correction')]);
        check(saved[0]==='5'&&saved[1]==='balanced','mode switching preserves saved level and correction');
      }
      check(errors.length===0,'practice JS errors: '+errors.join(';'));
    }catch(e){failures.push({index,name,error:e.message});console.log('FAIL '+name+' '+e.message.split('\n')[0]);}
    finally {await ctx.close();cases++;}
    if(cases%20===0)console.log(`speaking sandbox: ${cases} cases, ${failures.length} failed`);
  });
}finally {await browser.close();await new Promise(r=>server.close(r));}
// 동시에 돌면 끝나는 순서가 섞이므로 보고는 사례 순서로 되돌립니다.
failures.sort((a,b)=>a.index-b.index).forEach(f=>delete f.index);
if(!process.env.CASE_LIMIT&&!process.env.CASE_FILTER) assert.equal(cases,320,'entire matrix must execute');
console.log(JSON.stringify({suite:'AI speaking real-browser sandbox',cases,assertions,failed:failures.length,failures},null,2));
process.exitCode=failures.length?1:0;
