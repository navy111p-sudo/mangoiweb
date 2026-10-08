// Offline real-page integration. Speech/provider replies are controlled fixtures, not live accuracy or latency.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require((process.env.PW_DIR||'/opt/codex/cua_node/lib')+'/node_modules/playwright');
const root=resolve('cloudflare-deploy/public');
const server=createServer(async(req,res)=>{try{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname);
 if(!path.startsWith(root+'/'))throw Error('path');
 res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.html'?'text/html':'application/octet-stream');
 res.end(await readFile(path));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try{
 for(let repeat=0;repeat<3;repeat++){
 const p=await browser.newPage();
 await p.route('**/*',r=>{
 const url=new URL(r.request().url());
 if(url.origin!==origin)return r.abort();
 if(url.pathname.startsWith('/api/'))return r.fulfill({json:{ok:true,items:[],uid:'guest_probe',token:'test.token'}});
 return r.continue();});
 await p.goto(origin+'/ai-friend.html');
 await p.evaluate(()=>{
 window.speedProbe={calls:[],recordings:0,options:[],avatarStops:0};
 MangoiTTS.speak=(text,rate,done)=>speedProbe.calls.push({text,done});
 MangoiTTS.stop=()=>{};
 MangoAvatar.plainStop=()=>speedProbe.avatarStops++;
 MangoiVoice.supported=()=>true;
 MangoiVoice.record=o=>{speedProbe.recordings++;speedProbe.options.push(o);o.onState('waiting',{});return new Promise(r=>speedProbe.resolve=r);};
 MangoiVoice.cancel=()=>{if(speedProbe.resolve){speedProbe.resolve('');speedProbe.resolve=null;}};
 appendMsg('ai','Hello!'); speakText('Canceled sentence.',null,null);
 speedProbe.start=performance.now(); MangoiFaceTalk.enter();
 });
 let resumed=true;
 try { await p.waitForFunction(()=>speedProbe.recordings===1,null,{timeout:3000}); }catch{resumed=false;}
 const first=await p.evaluate(()=>({ms:performance.now()-speedProbe.start,recordings:speedProbe.recordings}));
 // New utterance must keep its lip sync and mode state when canceled callback arrives.
 const stale=await p.evaluate(()=>{
 MangoiFaceTalk.exit();stopSpeakingNow();speakText('Old.',null,null);
 const old=speedProbe.calls.at(-1).done;stopSpeakingNow();speakText('New.',null,null);
 const before=speedProbe.avatarStops;old();
 return {before,after:speedProbe.avatarStops};
 });
 results.push({repeat:repeat+1,canceledMicResumedWithin3s:resumed,observedWaitMs:Math.round(first.ms),staleAvatarStopped:stale.after>stale.before});
 await p.close();
 }
 console.log(JSON.stringify({kind:'controlled browser timing; no live providers',results},null,2));
 if(process.env.RESULT_PATH)await writeFile(process.env.RESULT_PATH,JSON.stringify(results,null,2));
 if(!process.argv.includes('--baseline')) for(const r of results){assert.ok(r.canceledMicResumedWithin3s);assert.equal(r.staleAvatarStopped,false);}
}finally{await browser.close();server.close();}
