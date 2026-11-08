// Real page wiring with local AI responses; no live AI, wallet, DB or microphone.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {requireBrowser} from './_pw.mjs';
const {chromium,exe}=requireBrowser();
const pub=new URL('../../cloudflare-deploy/public/',import.meta.url);
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(req.url.split('?')[0]);const ext=extname(path);res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.js'?'application/javascript':ext==='.css'?'text/css':'application/octet-stream');res.end(await readFile(new URL('.'+path,pub)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:exe});
let count=0;
try{for(const width of [320,390,768,1366]){
 const page=await browser.newPage({viewport:{width,height:844}});let turn=0,cut=false;const requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base){await route.abort();return;}if(!url.pathname.startsWith('/api/')){await route.continue();return;}
  if(url.pathname==='/api/warmup/chat'){
   const body=route.request().postDataJSON();requests.push(body);if(body.kickoff){await route.fulfill({json:{ai_response:'What do you like?',session_id:body.session_id}});return;}
   const p={source:'warmup-verified-turn',sessionId:body.session_id,turn:++turn,grade:'partial',spokenWords:['i','like','apple'],reviewWords:['apples'],skills:{},correction:{was:'I like apple.',now:'I like apples.',why:'복수형으로 말해요.'}};
   const d={ok:true,status:200,ai_response:'What fruit do you like?',session_id:body.session_id,fix:null,grade:'partial',progress:p};
   const data='data: '+JSON.stringify({...d,final:1})+'\n\n'+(cut?'':'data: '+JSON.stringify({...d,done:1})+'\n\n');
   await route.fulfill({contentType:'text/event-stream',body:data});return;
  }
  if(url.pathname==='/api/voice/tts'){await route.fulfill({status:503,body:''});return;}
  await route.fulfill({json:{ok:false,items:[],questions:[]}});
 });
 await page.goto(base+'/warmup.html?setup=0');await page.waitForFunction(()=>window.MangoWarmupFlow&&window.AiSpeakingSession);
 await page.evaluate(()=>{_speechOn=false;_stopSpeak();});
 await page.locator('#wfPreferencesOpen').click();await page.locator('#wfSettingsDetail > summary').click();await page.locator('#wfCorrectionTiming').selectOption('after-lesson');await page.locator('#wfPreferencesClose').click();
 await page.locator('#inp').fill('I like apple.');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!sending);
 assert.equal(requests.at(-1).correction_timing,'after-lesson');
 assert.equal(await page.evaluate(()=>AiSpeakingSession.result(wuProgressContext()).turns),1);
 cut=true;await page.locator('#inp').fill('I like apple.');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!sending);
 assert.equal(await page.evaluate(()=>AiSpeakingSession.result(wuProgressContext()).turns),1,'final without done is not recorded');
 await page.locator('#wgFinish').click();await page.waitForSelector('.ai-progress-card');
 const text=await page.locator('.ai-progress-card').innerText();assert.match(text,/I like apples/);assert.match(text,/미측정/);assert.doesNotMatch(text,/100\/100|⭐|💎/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
 assert.equal(await page.locator('.ai-progress-card').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'result fits mobile width');
 assert.deepEqual(errors,[]);count++;await page.close();
}
for(const width of [320,390,768,1366]){
 const page=await browser.newPage({viewport:{width,height:844}});let turn=0,cut=false;const requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('mango_guest_chat',JSON.stringify({uid:'guest_progress',token:'local-fixture'})));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base){await route.abort();return;}if(!url.pathname.startsWith('/api/')){await route.continue();return;}
  if(url.pathname==='/api/ai/chat-friend'){
   const body=route.request().postDataJSON();requests.push(body);
   const progress={source:'warmup-verified-turn',sessionId:body.practice_session,turn:++turn,grade:null,spokenWords:['i','like','apple'],reviewWords:['apples'],skills:{},correction:{was:'I like apple.',now:'I like apples.'}};
   const d={ok:true,reply:'What fruit do you like?',fix:null,progress};
   await route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify({...d,final:1})+'\n\n'+(cut?'':'data: '+JSON.stringify({...d,done:1})+'\n\n')});return;
  }
  if(url.pathname==='/api/voice/tts'){await route.fulfill({status:503,body:''});return;}
  await route.fulfill({json:{ok:true,items:[]}});
 });
 await page.goto(base+'/ai-friend.html');await page.waitForSelector('#friendCorrectionTiming');
 await page.locator('#friendCorrectionTiming').selectOption('after-lesson');
 await page.locator('#msgInput').fill('I like apple.');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!document.getElementById('sendBtn').disabled);
 assert.equal(requests.at(-1).correction_timing,'after-lesson');assert.ok(requests.at(-1).practice_session);
 assert.equal(await page.evaluate(()=>AiSpeakingSession.result(wuProgressContext()).turns),1);
 cut=true;await page.locator('#msgInput').fill('I like apple.');await page.locator('#sendBtn').click();await page.waitForFunction(()=>!document.getElementById('sendBtn').disabled);
 assert.equal(await page.evaluate(()=>AiSpeakingSession.result(wuProgressContext()).turns),1);
 await page.locator('.ai-progress-trigger').click();const box=page.locator('.ai-progress-dialog');await box.waitFor({state:'visible'});
 assert.match(await box.innerText(),/I like apples/);assert.match(await box.innerText(),/미측정/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 assert.equal(await box.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
 assert.deepEqual(errors,[]);count++;await page.close();
}}
finally{await browser.close();await new Promise(r=>server.close(r));}
console.log('PASS connected speaking results/settings and interrupted-stream exclusion at '+count+' desktop/mobile widths; providers mocked, not a real-device test');
