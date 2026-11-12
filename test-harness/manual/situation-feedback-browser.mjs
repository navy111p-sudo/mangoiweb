import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {requireBrowser} from './_pw.mjs';
const {chromium,exe}=requireBrowser();
const pub=new URL('../../cloudflare-deploy/public/',import.meta.url);
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(req.url.split('?')[0]);res.setHeader('Content-Type',extname(path)==='.html'?'text/html':extname(path)==='.js'?'application/javascript':extname(path)==='.css'?'text/css':'application/octet-stream');res.end(await readFile(new URL('.'+path,pub)));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:exe});
let checks=0;
try{for(const width of [390,768,1366]){
 const page=await browser.newPage({viewport:{width,height:900}});let fail=false;const requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('mangoi_ai_screen_mode','full');
  localStorage.setItem('mangoi_warmup_level','3');localStorage.setItem('mangoi_warmup_correction','balanced');
 });
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  if(u.pathname==='/api/warmup/chat'){
   const b=route.request().postDataJSON();requests.push(b);
   return route.fulfill({status:fail?503:200,json:{ai_response:'Nice to meet you! What do you like?',fix:null,answer_chips:[]}});
  }
  return route.fulfill({json:{ok:false,items:[]}});
 });
 await page.goto(base+'/warmup.html?setup=0&sit=new-friend');
 await page.waitForFunction(()=>window.MangoWarmupFlow&&window.MangoSituationResume&&_warmStarted);
 await page.evaluate(()=>{_speechOn=false;_stopSpeak();});
 await page.evaluate(()=>{
  window.MangoiVoiceEarly=null;
  let resolveRecording;
  window.MangoiVoice={supported:()=>true,record:opts=>{opts.onState('speaking');return new Promise(r=>resolveRecording=r);},stop:()=>{if(resolveRecording){let r=resolveRecording;resolveRecording=null;r('My name is Mina.');}},cancel:()=>{}};
  _micPreferWhisper=true;toggleMic();
 });
 assert.equal(await page.locator('#inp').inputValue(),'');
 await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>!sending&&!_whisperOn&&document.querySelectorAll('.msg.me').length===1);
 assert.equal(requests.length,1,'Send finalizes audio and sends exactly once');
 assert.equal(requests[0].student_input,'My name is Mina.');
 const sid=await page.evaluate(()=>SESSION_ID);
 await page.goto(base+'/ai-speaking.html');
 await page.locator('#situationResume').waitFor({state:'visible'});
 assert.match(await page.locator('#situationResume').innerText(),/이어하기|Continue/);
 await page.locator('#situationResume').click();
 await page.waitForFunction(()=>document.querySelectorAll('.msg.me').length===1);
 assert.equal(await page.evaluate(()=>SESSION_ID),sid);
 assert.equal(requests.length,1,'restoring must not resubmit');
 assert.equal(await page.evaluate(()=>_recognizing||_whisperOn),false,'restoring does not open the microphone');
 fail=true;
 await page.locator('#inp').fill('I like apples.');await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>!sending);
 assert.equal(await page.locator('#inp').inputValue(),'I like apples.','failed answer remains editable');
 assert.equal(requests.length,2,'no automatic duplicate retry');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.evaluate(()=>localStorage.setItem('mango_user',JSON.stringify({user_id:'different-user'})));
 await page.goto(base+'/ai-speaking.html');
 assert.equal(await page.locator('#situationResume').isVisible(),false,'another account cannot see the snapshot');
 assert.deepEqual(errors,[]);checks++;await page.close();
}
console.log('PASS: situation feedback flows at '+checks+' viewport widths');
}finally{await browser.close();await new Promise(r=>server.close(r));}
