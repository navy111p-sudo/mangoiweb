import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
// Browser UI contract with injected mocks. No actual capture, playback or provider requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {start} from './server.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=(handoffTmp()+'/eleader-ui-books-')+process.pid+'.mjs';
await require('../../cloudflare-deploy/node_modules/esbuild').build({entryPoints:['cloudflare-deploy/src/eleader-book-pack.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {ELEADER_BOOK_UNITS:books}=await import(handoffURL(out)),f=await start(),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
let external=0,writes=0;
try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>{const q=r.request();if(new URL(q.url()).origin!=='http://127.0.0.1:8798'){external++;return r.abort();}if(q.method()!=='GET'){writes++;return r.abort();}return r.continue();});
 const page=await context.newPage();await page.goto('http://127.0.0.1:8798/eleader-pilot.html');
 await page.evaluate(()=>{window.realMic=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.realMic++;throw Error('real microphone forbidden');};});
 async function mount(options={}){
  await page.evaluate(({books,options})=>{
   window.testUI?.dispose();document.querySelector('#student').hidden=false;document.querySelector('#ownerTrial').hidden=false;
   window.testToken='synthetic';window.stats={start:0,request:0,permission:0,play:0,avatar:0};
   window.testUI=EleaderTrial20UI.mount({element:document.querySelector('#ownerTrial'),books,getToken:()=>window.testToken,enabled:options.enabled!==false,mode:options.mode||'mock-only',
    startSession:async body=>{window.stats.start++;if(options.rejectStart)throw Error('uncertain');if(options.delayStart)await new Promise(r=>window.releaseStart=r);return {mode:options.mode||'mock-only',book:body.book,expires_at:Date.now()+(options.expiry||60000)};},
    services:{permission:async()=>{window.stats.permission++;return true;},record:async()=>new Uint8Array([0]),stopCapture(){},stopPlayback(){},avatar(){window.stats.avatar++;},
     request:async({step})=>{window.stats.request++;if(options.failRequest)throw Error('network');return new Response(new Uint8Array([73,68,51]),{headers:{'Content-Type':'audio/mpeg','X-Trial20-Next':String(step+1)}});},play:async(_,{onStart})=>{window.stats.play++;onStart();}}
   });
  },{books,options});
 }
 const panel=page.locator('#ownerTrial'),status=panel.locator('[data-trial-status]'),action=k=>panel.locator(`[data-trial-action="${k}"]`);
 async function startBook(i=0){await panel.locator('select').selectOption(books[i].id);await panel.locator('input[type=password]').fill('a'.repeat(32));await panel.locator('input[type=checkbox]').check();await panel.locator('button[type=submit]').click();}
 await mount({enabled:false});assert.ok(await panel.locator('button[type=submit]').isDisabled());assert.equal(await page.evaluate(()=>stats.request),0);
 let turns=0;
 for(let book=0;book<22;book++){
  await mount({mode:book%2?'cloudflare':'mock-only'});await startBook(book);await page.waitForFunction(()=>document.querySelector('[data-trial-status]').textContent.includes('답변하거나'));
  assert.equal(await panel.locator('input[type=password]').inputValue(),'');
  for(let n=0;n<20;n++){
   assert.ok((await panel.innerText()).includes(books[book].questions[n].question));await action('hint').click();assert.ok((await panel.innerText()).includes(books[book].questions[n].hint));
   if(n===0){await action('repeat').click();assert.equal(await page.evaluate(()=>stats.request),1);}
   await action(n%2?'skip':'answer').click();await page.waitForFunction(n=>{const text=document.querySelector('[data-trial-status]').textContent;return n===19?text.includes('20문항 시험을 마쳤'):text.includes('답변하거나')&&text.includes((n+2)+'/20');},n);turns++;
  }
  assert.match(await status.innerText(),/20문항 시험을 마쳤/);assert.equal(await page.evaluate(()=>stats.request),21);assert.equal(await page.evaluate(()=>stats.permission),10);assert.ok(await action('answer').isDisabled());
 }
 await mount({rejectStart:true});await startBook();assert.match(await status.innerText(),/시작에 실패/);await panel.locator('form').evaluate(f=>f.dispatchEvent(new Event('submit',{cancelable:true})));assert.equal(await page.evaluate(()=>stats.start),1);
 await mount({failRequest:true});await startBook();assert.match(await status.innerText(),/중단/);assert.ok(await action('answer').isDisabled());assert.equal(await page.evaluate(()=>stats.request),1);
 await mount();await startBook();await action('cancel').click();assert.match(await status.innerText(),/종료/);assert.ok(await action('answer').isDisabled());
 await mount();await startBook();await page.evaluate(()=>{window.testToken='other';window.dispatchEvent(new Event('storage'));});assert.match(await status.innerText(),/로그인이 변경/);assert.ok(await action('answer').isDisabled());
 await mount({delayStart:true});await startBook();await page.evaluate(()=>{window.testToken='other';window.dispatchEvent(new Event('storage'));window.releaseStart();});await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>stats.request),0);
 await mount({expiry:100});await startBook();await page.waitForTimeout(150);assert.match(await status.innerText(),/시간이 끝났/);
 assert.equal(await page.evaluate(()=>window.realMic),0);assert.equal(external,0);assert.equal(writes,0);
 await page.reload();assert.equal(await page.evaluate(()=>!!window.testUI),false);assert.ok(await panel.isHidden());
 console.log(`PASS owner UI: ${turns} mocked question transitions across 22 books; disabled, code clearing, hints, repeat without request, skip, completion, uncertain start no retry, failure, cancel, identity change, late grant, expiry, reload. Real microphone/provider calls 0; external requests 0; writes 0. Audio/visemes simulated, not listening acceptance.`);
}finally{await browser.close();await new Promise(r=>f.server.close(r));f.db.close();}
