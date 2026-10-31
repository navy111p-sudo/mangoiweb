import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
// UI contract test: synthetic state metadata, no remote account or microphone.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {start} from './server.mjs';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const f=await start(),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
try{
 const c=await browser.newContext({serviceWorkers:'block'});await c.addInitScript(t=>localStorage.setItem('mango_token',t),f.tokens['pilot-child-1']);
 let expires=Date.now()+60000,blocked=0;
 await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:8798'){blocked++;return r.abort();}if(u.pathname==='/api/ai/eleader/state'){const response=await r.fetch();return r.fulfill({response,json:{...await response.json(),trial:{read_only:true,expires_at:expires}}});}return r.continue();});
 const p=await c.newPage();await p.goto('http://127.0.0.1:8798/eleader-pilot.html?academy=eleaderjam');await p.locator('#student').waitFor({state:'visible'});await p.getByRole('button',{name:'반려동물 20문항 · 연습하기'}).click();
 assert.match(await p.locator('#trialNotice').innerText(),/합성 학원/);assert.ok(await p.locator('#complete').isDisabled());assert.ok(await p.locator('#listen').isDisabled());
 await p.locator('#hintButton').click();assert.match(await p.locator('#hint').innerText(),/고양이/);await p.locator('#answer').fill('yes');await p.locator('#expand').click();assert.match(await p.locator('#expansion').innerText(),/I like cats/);
 expires=Date.now()+200;await p.locator('#reload').click();await p.waitForFunction(()=>document.querySelector('#student').hidden);assert.match(await p.locator('#trialNotice').innerText(),/끝났습니다/);assert.equal(await p.locator('#answer').inputValue(),'');assert.equal(blocked,0);
 console.log('PASS trial UI: synthetic/read-only notice; completion/audio disabled; hints/examples usable; expiry hides student data and clears input; zero external requests.');
}finally{await browser.close();await new Promise(r=>f.server.close(r));f.db.close();}
