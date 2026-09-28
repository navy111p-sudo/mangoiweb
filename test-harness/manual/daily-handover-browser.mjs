import { requireBrowser } from './_pw.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {chromium,exe}=requireBrowser();
const assert=require('node:assert/strict');const fs=require('fs');const http=require('http');
const base=fileURLToPath(new URL('../../cloudflare-deploy/public',import.meta.url));
(async()=>{
const server=http.createServer((req,res)=>{try{const p=req.url.split('?')[0];res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(base+p));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:exe});
const page=await browser.newPage({viewport:{width:1100,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let saves=0,own=null;
await page.route('**/api/approval/handover/**',async route=>{
const req=route.request(),b=req.method()==='POST'?req.postDataJSON():null;let data;
if(req.url().includes('/home'))data={ok:true,day:'2026-09-28',me:{username:'mgr_maimai',name:'Maimai'},members:[{username:'mgr_maimai',name:'Maimai'},{username:'mgr_jjw',name:'장지웅'}],default_recipient:'mgr_jjw',reports:own?[own]:[],own,schedule:null,required:[],ai_available:true,can_review_all:false};
else if(req.url().endsWith('/inbox'))data={ok:true,reports:[],total:0,files:[]};
else if(req.url().endsWith('/review'))data={ok:true,check:{ready:!!b.payload.work,missing:b.payload.work?[]:['work']},ai_state:b.use_ai?'ready':'unavailable',suggestion:b.use_ai?{work:b.payload.work,issue:b.payload.issue,open:b.payload.open,tips:['내용을 확인해 주세요.']}:null};
else if(req.url().endsWith('/save')){saves++;own={id:1,payload:b.payload,staff_name:'Maimai',username:'mgr_maimai',recipient:b.recipient,report_date:b.report_date,version:b.version+1,status:b.submit?'submitted':'draft',submitted_at:b.submit?1:null};data={ok:true,row:own,push:'no_subscription'};}
else data={ok:true};await route.fulfill({json:data});
});
await page.addInitScript(()=>{window.SpeechRecognition=class{constructor(){window.__handoverTestSpeech=this;}start(){this.onstart();}stop(){this.onend();}abort(){}};});
await page.goto('http://127.0.0.1:'+server.address().port+'/daily-handover.html');
await page.waitForFunction(()=>!document.querySelector('#mh-work').disabled);
assert.equal(await page.locator('#mh-staff').inputValue(),'Maimai');
await page.locator('#mh-voice').click();
await page.evaluate(()=>{const result=[{transcript:'오늘 카카오 문의에 답변했습니다'}];result.isFinal=false;window.__handoverTestSpeech.onresult({resultIndex:0,results:[result]});});
assert.match(await page.locator('#mh-voice-interim').innerText(),/카카오 문의/);assert.equal(await page.locator('#mh-review').isDisabled(),true);
await page.locator('#mh-voice').click();assert.equal(await page.locator('#mh-work').inputValue(),'오늘 카카오 문의에 답변했습니다');assert.equal(await page.locator('#mh-review').isEnabled(),true);
await page.locator('#mh-work').fill('');
await page.locator('#mh-review').click();await page.locator('#mh-errors').waitFor({state:'visible'});assert.match(await page.locator('#mh-errors').innerText(),/오늘 한 일/);
await page.locator('#mh-work').fill('카카오 문의 3건 답변, 내일 수업 일정 확인');
await page.locator('#mh-review').click();await page.locator('#mh-ai').waitFor({state:'visible'});
await page.locator('#mh-apply').click();await page.waitForFunction(()=>!document.querySelector('#mh-confirm').disabled);
await page.locator('#mh-confirm').check();await page.locator('#mh-work').fill('카카오 문의 4건 답변');assert.equal(await page.locator('#mh-send').isEnabled(),false);
await page.locator('#mh-manual').click();await page.waitForFunction(()=>!document.querySelector('#mh-confirm').disabled);await page.locator('#mh-confirm').check();
await page.locator('#mh-send').click();await page.locator('#mh-success').waitFor({state:'visible'});assert.equal(saves,1);assert.equal(await page.locator('#mh-send').isEnabled(),false);
assert.match(await page.locator('#mh-reports').innerText(),/카카오 문의 4건/);
for(const width of [360,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
assert.deepEqual(errors,[]);console.log('PASS browser: auto identity, validation, AI suggestion/apply, edits invalidate confirmation, real submit wiring, list refresh, no duplicate, 320/360px layout');
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
