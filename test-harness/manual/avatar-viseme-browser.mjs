// Real browser: deterministic cues + real Web Audio playback and canvas rendering.
import {loadPlaywright,findChromium} from './_pw.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,extname} from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const pw=loadPlaywright(),exe=process.env.CHROME_PATH||findChromium();
if(!pw||!exe){console.log('SKIP: browser unavailable');process.exit(0);}
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const cues=[{start:0,end:.3,value:'A'},{start:.3,end:.6,value:'D'},{start:.6,end:1,value:'F'},{start:1,end:2,value:'C'}];
const server=http.createServer((req,res)=>{
 if(req.url==='/'){
  res.setHeader('Content-Type','text/html');res.end(`<div id="tavatar-wrap"></div><div id="tavatar-ring"></div><canvas id="tavatar-canvas"></canvas><video id="tavatar-video"></video>
  <script>window.__mgAvatarWant='lily';window.AvatarVisemes={prepare:()=>Promise.resolve(${JSON.stringify(cues)}),at:(cs,t)=>(cs.find(c=>t>=c.start&&t<c.end)||{value:'X'}).value};
  const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(im,...a){if(im.src&&im.src.includes('-mouths.webp'))window.pose=Math.round(a[0]/a[2])+Math.round(a[1]/a[3])*3;return draw.call(this,im,...a)};</script><script src="/js/mango-avatar.js"></script>`);return;
 }
 try{const f=join(root,new URL(req.url,'http://local').pathname);res.setHeader('Content-Type',extname(f)==='.js'?'text/javascript':extname(f)==='.webp'?'image/webp':'image/png');res.end(readFileSync(f));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await pw.chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
let pass=0;
try{
 const page=await browser.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(const width of [390,1280])for(const character of ['lily','noah','emma'])for(const rate of [.7,1,1.3]){
  await page.setViewportSize({width,height:800});
  await page.evaluate(async({character,rate})=>{
   MangoAvatar.plainStop();MangoAvatar.setCharacter(character);
   if(!window.a){
    // Two seconds of quiet sine PCM: actual playable, independent of network/TTS providers.
    const n=44100*2,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);function str(o,s){for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}
    str(0,'RIFF');v.setUint32(4,36+n*2,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*2,true);
    for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i*2*Math.PI*220/44100)*3000,true);
    window.a=new Audio(URL.createObjectURL(new Blob([buf],{type:'audio/wav'})));MangoAvatar.attach(a);
   }
   a.pause();a.currentTime=.65;a.playbackRate=rate;await a.play();
  },{character,rate});
  await page.waitForFunction(()=>window.pose===6,{},{timeout:5000}); // F at .6-1 seconds, regardless of rate.
  await page.evaluate(()=>a.pause());await page.waitForFunction(()=>window.pose===0);
  await page.evaluate(async()=>{a.currentTime=.35;await a.play();});
  await page.waitForFunction(()=>window.pose===4);
  await page.evaluate(()=>MangoAvatar.plainStop());assert.equal(await page.evaluate(()=>window.pose),0);
  await page.evaluate(()=>a.pause());pass++;
 }
 assert.deepEqual(errors,[]);console.log(`avatar-viseme-browser: PASS ${pass} / FAIL 0`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
