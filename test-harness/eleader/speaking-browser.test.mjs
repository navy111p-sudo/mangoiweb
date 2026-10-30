import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {start} from './server.mjs';
const require=createRequire(import.meta.url);let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'));}
const calls=[];
const f=await start({engines:{chat:async r=>{calls.push('chat');return Response.json({ai_response:'You could say: "I like cats." Do you like cats?'});},voice:async r=>{if(new URL(r.url).pathname.endsWith('tts')){calls.push('tts');return new Response(new Uint8Array(300),{headers:{'Content-Type':'audio/mpeg','X-TTS-Speaker':'asteria','X-TTS-Engine':'mock-contract'}});}calls.push('transcribe');return Response.json({ok:true,text:'cats'});}}});
f.env.ELEADER_LIVE_AI='approved';f.env.ELEADER_POLICY_VERSION='fixture-policy';f.env.ELEADER_POLICY_NOTICE='모의 계약 검사: 실제 음성·AI 호출이나 보호자 동의가 아닙니다.';
f.db.prepare('INSERT INTO eleader_consents VALUES (?,?,?,?,?,?,NULL)').run('eleaderjam','pilot-child-1','fixture-policy',1,1,Date.now()+60000);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1200,height:1000}});const external=[];
await context.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external.push(r.request().url());return r.abort();}return r.continue();});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(t=>localStorage.setItem('mango_token',t),f.tokens['pilot-child-1']);await page.goto('http://127.0.0.1:8798/eleader-pilot.html?academy=eleaderjam');await page.locator('#student').waitFor({state:'visible'});await page.getByRole('button',{name:'반려동물 20문항 · 연습하기'}).click();
 await page.locator('#chatLive').click();assert.equal(calls.length,0);assert.match(await page.locator('#liveStatus').innerText(),/먼저 선택/);
 await page.locator('#liveConfirm').check();
 await page.evaluate(()=>{
  window.MangoiVoice={supported:()=>true,record:async opts=>{window.recordOptions=opts;const fd=new FormData();fd.append('audio',new Blob([new Uint8Array(1500)],{type:'audio/webm'}),'fixture.webm');const d=await opts.transcribe(fd);return d.text;},stop(){},cancel(){}};
 });
 await page.locator('#recordLive').click();await page.waitForFunction(()=>document.querySelector('#answer').value==='cats');assert.deepEqual(calls,['transcribe']);
 await page.locator('#chatLive').click();await page.waitForFunction(()=>document.querySelector('#liveReply').textContent.includes('I like cats'));assert.deepEqual(calls,['transcribe','chat']);
 await page.evaluate(()=>{window.audioContract={attach:0,prepare:0,play:0,pause:0};window.MangoAvatar.attach=()=>window.audioContract.attach++;window.MangoAvatar.prepare=async()=>{window.audioContract.prepare++;};window.Audio=class{constructor(){window.contractAudio=this;}pause(){window.audioContract.pause++;}load(){}removeAttribute(){}async play(){window.audioContract.play++;}};});
 await page.locator('#emmaRead').click();await page.waitForFunction(()=>window.audioContract.play===1);assert.deepEqual(calls,['transcribe','chat','tts']);assert.deepEqual(await page.evaluate(()=>[window.audioContract.attach,window.audioContract.prepare]),[1,1]);
 await page.locator('#cancelLive').click();await page.evaluate(()=>window.contractAudio.onended());assert.match(await page.locator('#liveStatus').innerText(),/취소/);
 const out=process.env.ELEADER_ARTIFACTS||(handoffTmp()+'/eleader-v2-artifacts');await mkdir(out,{recursive:true});await page.screenshot({path:out+'/speaking-contract-mock.png',fullPage:true});
 // Question changes cancel a pending capture and discard its later transcription.
 await page.evaluate(()=>{window.MangoiVoice.record=()=>new Promise(r=>window.finishMockRecording=r);});await page.locator('#recordLive').click();await page.locator('#next').click();await page.evaluate(()=>window.finishMockRecording('stale words'));assert.equal(await page.locator('#answer').inputValue(),'');assert.equal(await page.locator('#liveConfirm').isChecked(),false);
 await page.locator('#liveConfirm').check();await page.locator('#answer').fill('yes');f.db.prepare('UPDATE eleader_consents SET revoked_at=?').run(Date.now());await page.locator('#chatLive').click();await page.waitForFunction(()=>document.querySelector('#chatLive').disabled);assert.equal(calls.length,3);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);console.log('PASS v2 browser mocked contracts: explicit confirmation -> scoped recorder transport -> AI reply -> Emma TTS/attach/prepare/play; cancellation, stale capture, question switch, consent revocation; external calls 0. Actual providers/audio hardware NOT tested.');
}finally{await browser.close();await new Promise(r=>f.server.close(r));f.db.close();}
