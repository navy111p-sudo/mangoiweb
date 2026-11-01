// DOM-only integration check against review-server.mjs; never requests audio or microphone.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW_MODULE||'playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8044/')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:8044/ai-dubbing.html?ep=dub-004');
 await page.locator('[data-scene="5"]').waitFor();
 assert.equal(await page.locator('#dub-scenes [data-scene]').count(),6);
 // Read the notice from the draft so this check follows status updates instead of going stale.
 const note=JSON.parse(await readFile(new URL('./episode.draft.json',import.meta.url),'utf8')).note;
 const body=await page.locator('body').innerText();
 assert(body.includes(note.ko)||body.includes(note.en),'draft notice not shown: '+note.ko);
 await page.locator('[data-n="5"]').click();
 const roles=['kai','emma','maya','pip','momo'];
 assert.equal(await page.locator('.stu-name').count(),5);
 for(let i=0;i<5;i++){
  await page.locator(`.stu-name[data-i="${i}"]`).fill('검토'+(i+1));
  await page.locator(`.chip[data-i="${i}"][data-c="${roles[i]}"]`).click();
  assert.equal(await page.locator(`.chip[data-i="${i}"][data-c="${roles[i]}"]`).getAttribute('aria-pressed'),'true');
 }
 assert.equal(await page.locator('#dub-final').isDisabled(),true);
 assert.equal(await page.locator('#dub-eps a[href*="dub-004"]').count(),0);
 await page.reload();await page.locator('[data-scene="5"]').waitFor();
 assert.equal(await page.locator('.stu-name').count(),5);
 for(let i=0;i<5;i++)assert.equal(await page.locator(`.chip[data-i="${i}"][data-c="${roles[i]}"]`).getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);
 // Pending permission promise lets us inspect the real start handler without a mic.
 for(const episode of ['dub-004','dub-003']) {
  await page.goto('http://127.0.0.1:8044/ai-dubbing.html?ep='+episode);
  await page.locator('[data-pick="0"]').waitFor();
  await page.locator('[data-pick="0"]').click();
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise((_,reject)=>{window.rejectReviewMic=reject;});});
  await page.locator('[data-scene="3"]').click();
  assert.equal(await page.locator('[data-pick="3"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-pick="0"]').getAttribute('aria-pressed'),'false');
  assert((await page.locator('#dub-pick-sum').innerText()).includes('EP 4'));
  assert.equal(await page.locator('#dub-player').isVisible(),true);
  page.once('dialog',d=>d.dismiss());
  await page.evaluate(()=>window.rejectReviewMic(new DOMException('Review stub','NotAllowedError')));
  await page.waitForFunction(()=>document.getElementById('dub-player').hidden);
 }
 await page.goto('http://127.0.0.1:8044/ai-dubbing.html?ep=dub-004');
 await page.locator('[data-pick="0"]').waitFor();
 if(process.env.SCREENSHOT)await page.screenshot({path:process.env.SCREENSHOT,fullPage:true});
 console.log('PASS: unchanged production UI loaded EP04 draft, six scenes, five selectable and persisted roles, production card stays coming, final movie disabled, zero page errors; EP04/EP03 direct-start selection matches during simulated pending/denied mic permission. DOM ONLY; no playback/mic/evaluation/export claimed.');
}finally{await browser.close();}
