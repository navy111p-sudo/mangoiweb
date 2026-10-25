import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {start} from './server.mjs';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}
const f=await start();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
const origin='http://127.0.0.1:8798';let count=0;
async function setup(token){
 const c=await browser.newContext({serviceWorkers:'block'});
 await c.addInitScript(t=>{if(t)localStorage.setItem('mango_token',t);window.speechSynthesis.cancel();},token);
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/api/ai/eleader/'))return r.fulfill({status:404,json:{error:'test_only'}});return r.continue();});
 const p=await c.newPage();return {c,p};
}
async function load(p){await p.goto(origin+'/warmup.html?setup=1');await p.locator('#wuSetup').waitFor({state:'visible'});}
try{
 let {c,p}=await setup(f.tokens['pilot-child-1']);await load(p);
 await p.locator('#eleaderEntry button').waitFor();assert.match(await p.locator('#eleaderEntry').innerText(),/엘리더잼/);count++;
 await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));count++;
 await p.locator('#eleaderEntry button').click();await p.waitForURL('**/eleader-pilot.html?academy=eleaderjam');await p.locator('#student').waitFor({state:'visible'});assert.equal(await p.locator('#units button').count(),3);count++;
 await p.getByRole('button',{name:'반려동물 20문항 · 연습하기'}).click();await p.locator('#hintButton').click();assert.match(await p.locator('#hint').innerText(),/고양이/);count++;await c.close();
 ({c,p}=await setup(f.tokens['pilot-child-1']));await c.addInitScript(()=>localStorage.setItem('mangoi_lang','en'));await load(p);await p.locator('#eleaderEntry button').waitFor();
 assert.match(await p.locator('#eleaderEntry').innerText(),/custom question practice/);assert.doesNotMatch(await p.locator('#eleaderEntry').innerText(),/맞춤 문항|한글 힌트와/);
 await p.evaluate(()=>{localStorage.setItem('mangoi_lang','ko');dispatchEvent(new CustomEvent('mangoi:lang-changed',{detail:{lang:'ko'}}));});await p.waitForFunction(()=>/맞춤 문항 연습/.test(document.querySelector('#eleaderEntry').innerText));count++;await c.close();
 ({c,p}=await setup(f.tokens['other-child']));await load(p);await p.locator('#eleaderEntry button').waitFor();assert.doesNotMatch(await p.locator('#eleaderEntry').innerText(),/엘리더잼/);count++;await c.close();
 for(const token of ['', 'forged']){({c,p}=await setup(token));await load(p);await p.waitForTimeout(150);assert.ok(await p.locator('#eleaderEntry').isHidden());assert.ok(await p.locator('#wusStart').isVisible());count++;await c.close();}
 ({c,p}=await setup(f.tokens['pilot-child-1']));await load(p);await p.locator('#eleaderEntry button').waitFor();f.db.exec("DELETE FROM eleader_members WHERE subject='pilot-child-1'");await p.locator('#eleaderEntry button').click();await p.waitForFunction(()=>document.querySelector('#eleaderEntry').hidden);assert.match(p.url(),/warmup/);count++;
 f.db.exec("INSERT INTO eleader_members VALUES ('eleaderjam','student','pilot-child-1','student')");await p.reload();await p.locator('#eleaderEntry button').waitFor();await p.evaluate(()=>localStorage.setItem('mango_token','changed'));await p.locator('#eleaderEntry button').click();assert.ok(await p.locator('#eleaderEntry').isHidden());count++;await c.close();
 ({c,p}=await setup(f.tokens['pilot-child-1']));await load(p);await p.locator('#eleaderEntry button').waitFor();await p.evaluate(()=>localStorage.removeItem('mango_token'));await p.waitForFunction(()=>document.querySelector('#eleaderEntry').hidden);count++;await c.close();
 ({c,p}=await setup(f.tokens['pilot-child-1']));let release,held=false;
 await c.route('**/api/ai/eleader/entry',async r=>{const response=await r.fetch();held=true;await new Promise(resolve=>release=resolve);await r.fulfill({response}).catch(()=>{});});
 await load(p);for(let i=0;i<100&&!held;i++)await p.waitForTimeout(10);assert.ok(held);
 await p.evaluate(()=>{localStorage.removeItem('mango_token');dispatchEvent(new StorageEvent('storage',{key:'mango_token'}));});release();await p.waitForTimeout(100);assert.ok(await p.locator('#eleaderEntry').isHidden());count++;await c.close();
 f.env.ELEADER_PILOT='off';({c,p}=await setup(f.tokens['pilot-child-1']));await load(p);await p.waitForTimeout(150);assert.ok(await p.locator('#eleaderEntry').isHidden());assert.ok(await p.locator('#wusStart').isVisible());count++;await c.close();
 console.log(`PASS ${count} entry browser scenarios: actual Warmup→pilot navigation, own tenant only, EN/KO labels, anonymous/forged/default-off, revocation at click, same-tab identity change and delayed old response. All external API calls intercepted; no provider use.`);
}finally{await browser.close();await new Promise(r=>f.server.close(r));f.db.close();}
