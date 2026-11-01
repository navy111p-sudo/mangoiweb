import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
// Synthetic API response replay; actual trial authorization is tested separately.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {start} from './server.mjs';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=(handoffTmp()+'/eleader-browser-pack-')+process.pid+'.mjs';await require('../../cloudflare-deploy/node_modules/esbuild').build({entryPoints:['cloudflare-deploy/src/eleader-book-pack.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});const {ELEADER_BOOK_UNITS:units,ELEADER_BOOK_CURRICULUM:curriculum}=await import(handoffURL(out));
const f=await start(),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try{
 const c=await browser.newContext({serviceWorkers:'block'});await c.addInitScript(t=>{localStorage.setItem('mango_token',t);window.captureAttempts=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.captureAttempts++;throw Error('capture prohibited');};},f.tokens['pilot-child-1']);
 let external=0,writes=0;await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:8798'){external++;return r.abort();}if(r.request().method()!=='GET'){writes++;return r.abort();}if(u.pathname==='/api/ai/eleader/state'){const response=await r.fetch();return r.fulfill({response,json:{...await response.json(),units,curriculum,assignments:units.map(u=>({student_uid:'pilot-child-1',unit_id:u.id})),progress:[],trial:{read_only:true,expires_at:Date.now()+3600000}}});}return r.continue();});
 const p=await c.newPage();await p.goto('http://127.0.0.1:8798/eleader-pilot.html?academy=eleaderjam');await p.locator('#student').waitFor({state:'visible'});assert.equal(await p.locator('#units button').count(),22);assert.match(await p.locator('#curriculumNotice').innerText(),/440/);
 let checked=0;
 for(let i=0;i<units.length;i++){
  await p.locator('#units button').nth(i).click();
  for(let j=0;j<units[i].questions.length;j++){
   const q=units[i].questions[j];assert.equal(await p.locator('#question').innerText(),q.question);await p.locator('#hintButton').click();assert.equal(await p.locator('#hint').innerText(),q.hint);
   await p.locator('#answer').fill(q.short);await p.locator('#expand').click();assert.ok((await p.locator('#expansion').innerText()).includes(q.model));assert.ok(await p.locator('#complete').isDisabled());assert.ok(await p.locator('#listen').isDisabled());checked++;
   if(j+1<units[i].questions.length)await p.locator('#next').click();
  }
 }
 await p.reload();await p.locator('#student').waitFor({state:'visible'});assert.equal(await p.locator('#units button').count(),22);assert.equal(checked,440);assert.equal(await p.evaluate(()=>window.captureAttempts),0);assert.equal(external,0);assert.equal(writes,0);
 console.log('PASS combined browser: 22 topics, 440 question/hint/example walkthroughs, provenance/count display, reload, voice/completion disabled, zero external requests/writes/microphone calls.');
}finally{await browser.close();await new Promise(r=>f.server.close(r));f.db.close();}
