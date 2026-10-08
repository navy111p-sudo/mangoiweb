// Local browser-only fixture. Rejects every API and external subresource; no real microphone.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(process.env.VOICE_SOURCE_ROOT||'.','cloudflare-deploy/public');
const boot=`<script>
window.fetch=async function(){return new Response(JSON.stringify({ok:true,items:[],uid:'guest_fixture',token:'synthetic.token'}),{headers:{'Content-Type':'application/json'}})};
window.addEventListener('load',async function(){
 const results=[];window.fixtureResults=results;
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 window.speedProbe={calls:[],recordings:0,options:[],avatarStops:0};
 MangoiTTS.speak=(text,rate,done)=>speedProbe.calls.push({text,done});MangoiTTS.stop=()=>{};
 MangoAvatar.plainStop=()=>speedProbe.avatarStops++;
 MangoiVoice.supported=()=>true;
 MangoiVoice.record=o=>{speedProbe.recordings++;speedProbe.options.push(o);o.onState('waiting',{});return new Promise(r=>speedProbe.resolve=r)};
 MangoiVoice.cancel=()=>{if(speedProbe.resolve){speedProbe.resolve('');speedProbe.resolve=null}};
 for(let n=0;n<3;n++){
 MangoiFaceTalk.exit();appendMsg('ai','Hello fixture.');speakText('Canceled sentence.',null,null);
 const count=speedProbe.recordings,start=performance.now();MangoiFaceTalk.enter();
 while(speedProbe.recordings===count && performance.now()-start<3000)await delay(20);
 const waited=Math.round(performance.now()-start);const resumed=speedProbe.recordings===count+1;
 MangoiFaceTalk.exit();stopSpeakingNow();speakText('Old.',null,null);const old=speedProbe.calls.at(-1).done;stopSpeakingNow();speakText('New.',null,null);const before=speedProbe.avatarStops;old();
 results.push({repeat:n+1,canceledMicResumedWithin3s:resumed,observedWaitMs:waited,staleAvatarStopped:speedProbe.avatarStops>before});
 }
 MangoiFaceTalk.exit();
 const out=document.createElement('pre');out.id='fixture-report';out.style='position:fixed;inset:0;background:white;color:black;padding:24px;z-index:2147483647;overflow:auto';out.textContent=JSON.stringify({kind:'real browser with synthetic TTS/mic and local API fixtures; no provider measurement',results},null,2);document.body.append(out);window.fixtureDone=true;
});
</script>`;
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://fixture');if(url.pathname.startsWith('/api/')){res.writeHead(403);res.end();return;}
 const p=resolve(root,'.'+url.pathname);if(!p.startsWith(root+'/'))throw Error('path');
 res.setHeader('Content-Type',extname(p)==='.js'?'text/javascript':extname(p)==='.html'?'text/html':extname(p)==='.css'?'text/css':'application/octet-stream');
 res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; media-src 'none'");
 let body=await readFile(p);if(url.pathname==='/ai-friend.html')body=body.toString().replace('<head>','<head>'+boot);res.end(body);
}catch{res.writeHead(404);res.end();}}).listen(Number(process.env.PORT||8797),'127.0.0.1',()=>console.log('track2 fixture listening'));
