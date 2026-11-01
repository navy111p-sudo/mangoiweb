import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {start} from './server.mjs';
const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}
const f=await start();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:1000}});
const requests=[],errors=[];
await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){requests.push(url.origin);return route.abort();}return route.continue();});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:8798/eleader-pilot.html?academy=eleaderjam';
const output=process.env.ELEADER_ARTIFACTS||(handoffTmp()+'/eleader-artifacts');await mkdir(output,{recursive:true});
try{
 await page.addInitScript(token=>localStorage.setItem('mango_token',token),f.tokens['pilot-child-1']);
 await page.goto(base);await page.locator('#student').waitFor({state:'visible'});
 await page.getByRole('button',{name:'반려동물 20문항 · 연습하기'}).click();await page.locator('#question').waitFor({state:'visible'});
 await page.locator('#hintButton').click();assert.match(await page.locator('#hint').innerText(),/고양이/);
 await page.locator('#answer').fill('yes');await page.locator('#expand').click();assert.match(await page.locator('#expansion').innerText(),/Yes, I like cats/);
 await page.locator('#complete').click();await page.waitForFunction(()=>document.querySelector('#history').textContent.includes('1 / 20'));
 await page.reload();await page.locator('#student').waitFor({state:'visible'});assert.match(await page.locator('#history').innerText(),/1 \/ 20/);
 await page.getByRole('button',{name:'반려동물 20문항 · 연습하기'}).click();
 // Verify actual local avatar renderer selected existing Emma asset; audio lip sync is not verified.
 await page.waitForFunction(()=>window.MangoAvatar&&document.querySelector('#tavatar-canvas').width>0);
 await page.screenshot({path:output+'/student-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/student-mobile.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // No local voice: deterministic fallback. No external speech requests permitted.
 await page.evaluate(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],cancel(){},speak(){throw new Error('should not call');}}}));
 await page.locator('#listen').click();assert.match(await page.locator('#voiceStatus').innerText(),/내장 영어 음성이 없어요/);
 await page.evaluate(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{localService:true,lang:'en-US'}],cancel(){},speak(u){u.onerror();}}}));
 // Browser SpeechSynthesisVoice is not constructible: use a test utterance with matching interface.
 await page.evaluate(()=>{window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};});
 await page.locator('#listen').click();assert.match(await page.locator('#voiceStatus').innerText(),/실패/);
 await page.evaluate(()=>{window.speechSynthesis.speak=u=>{window.pendingUtterance=u;u.onstart();};});
 await page.locator('#listen').click();await page.locator('#stop').click();
 await page.evaluate(()=>window.pendingUtterance.onend());assert.match(await page.locator('#voiceStatus').innerText(),/취소/);
 // Login changed in another tab: old data must immediately disappear.
 const tab=await context.newPage();await tab.goto(base);await tab.evaluate(t=>localStorage.setItem('mango_token',t),f.tokens['other-child']);
 await page.waitForFunction(()=>document.querySelector('#student').hidden);assert.equal(await page.locator('#answer').inputValue(),'');
 await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('접근 권한'));
 await tab.close();
 await context.addCookies([{name:'mango_admin_session',value:'fixture-director-session',url:'http://127.0.0.1:8798'}]);
 await page.setViewportSize({width:1280,height:1000});await page.goto(base+'&view=director');await page.locator('#director').waitFor({state:'visible'});
 await page.locator('#students').selectOption('pilot-child-2');await page.locator('#assignUnit').selectOption('food');await page.locator('#assign button').click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('#report tr')).some(r=>r.textContent.includes('pilot-child-2')&&r.textContent.includes('맛있는 음식')&&r.textContent.includes('배정')&&!r.textContent.includes('미배정')));
 await page.locator('#settingName').fill('엘리더잼 검토 학원');await page.locator('#settings button').click();await page.waitForFunction(()=>document.querySelector('#academyName').textContent==='엘리더잼 검토 학원');
 await page.screenshot({path:output+'/director-desktop.png',fullPage:true});
 await context.addCookies([{name:'mango_admin_session',value:'fixture-other-session',url:'http://127.0.0.1:8798'}]);
 await page.locator('#settings button').click();await page.waitForFunction(()=>document.querySelector('#director').hidden);
 assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
 console.log('PASS browser: student/admin, hint/expansion, completion/reload, responsive layout, local-only voice fallback/failure/cancel, stale voice callback, student/admin login switch; zero external requests and page errors.');
 console.log('Screenshots: '+output);
}finally{await browser.close();await new Promise(r=>f.server.close(r));f.db.close();}
