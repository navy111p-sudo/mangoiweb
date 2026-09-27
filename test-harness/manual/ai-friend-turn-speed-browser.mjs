// Regression: canceled TTS must not leave face chat waiting for the 25s watchdog.
// PW_DIR=/tmp/pw CHROMIUM_PATH=/path/to/chrome node test-harness/manual/ai-friend-turn-speed-browser.mjs
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PW_DIR+'/node_modules/playwright');
const root=resolve('cloudflare-deploy/public');
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);
 if(!path.startsWith(root+'/'))throw Error('path');
 res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.html'?'text/html':'application/octet-stream');
 res.end(await readFile(path));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const p=await browser.newPage();
 await p.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,items:[],uid:'guest_probe',token:'test.token'})}));
 await p.goto('http://127.0.0.1:'+server.address().port+'/ai-friend.html');
 await p.evaluate(()=>{
  window.speedProbe={calls:[],recordings:0,options:[]};
  MangoiTTS.speak=(text,rate,done)=>speedProbe.calls.push({text,done});
  MangoiTTS.stop=()=>{}; // Real stop intentionally does not emit onend.
  MangoiVoice.supported=()=>true;
  MangoiVoice.record=o=>{speedProbe.recordings++;speedProbe.options.push(o);o.onState('waiting',{});return new Promise(r=>speedProbe.resolve=r);};
  MangoiVoice.cancel=()=>{if(speedProbe.resolve){speedProbe.resolve('');speedProbe.resolve=null;}};
  appendMsg('ai','Hello!');
  speakText('An old sentence that is stopped.',null,null);
  speedProbe.start=performance.now();
  MangoiFaceTalk.enter();
 });
 await p.waitForFunction(()=>speedProbe.recordings===1,null,{timeout:2500});
 const first=await p.evaluate(()=>({ms:performance.now()-speedProbe.start,silence:speedProbe.options[0].silenceMs}));
 assert.ok(first.ms<2500,'canceled speech must not wait 25 seconds');
 assert.equal(first.silence,1500);
 console.log('PASS: stopped speech -> mic in '+Math.round(first.ms)+'ms; face silence threshold 1500ms');
 // Old completion arriving during a new greeting must not finish the new speech.
 await p.evaluate(()=>{
  MangoiFaceTalk.exit(); document.getElementById('chat').innerHTML='';
  speakText('Another old sentence.',null,null);
  speedProbe.old=speedProbe.calls[speedProbe.calls.length-1].done;
  MangoiFaceTalk.enter();
  speedProbe.newDone=speedProbe.calls[speedProbe.calls.length-1].done;
  speedProbe.old();
 });
 const before=await p.evaluate(()=>speedProbe.recordings);
 await p.waitForTimeout(1100);
 assert.equal(await p.evaluate(()=>speedProbe.recordings),before,'late canceled callback must not open mic over new speech');
 await p.evaluate(()=>speedProbe.newDone());
 await p.waitForFunction(n=>speedProbe.recordings===n+1,before,{timeout:2500});
 console.log('PASS: late canceled completion ignored; current greeting completes before listening');
 await p.evaluate(()=>{MangoiFaceTalk.exit(); FriendAutoTalk.setMode('auto');});
 await p.waitForFunction(n=>speedProbe.recordings===n+2,before,{timeout:2500});
 assert.equal(await p.evaluate(()=>speedProbe.options.at(-1).silenceMs),1500);
 await p.evaluate(()=>{FriendAutoTalk.setMode('button');toggleMic();});
 assert.equal(await p.evaluate(()=>speedProbe.options.at(-1).silenceMs),2500);
 console.log('PASS: inline auto 1500ms; manual speech retains 2500ms');
}finally{await browser.close();server.close();}
