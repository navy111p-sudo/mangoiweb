// Real controls in Chromium; speech/network providers are controlled test doubles.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const name=decodeURIComponent(req.url.split('?')[0]);
 if(name==='/qa-font.ttf' && process.env.PIZZA_QA_FONT){res.setHeader('Content-Type','font/ttf');res.end(await readFile(process.env.PIZZA_QA_FONT));return;}
 if(name==='/qa-frame'){res.setHeader('Content-Type','text/html');res.end('<iframe src="/student-game-grammar-pizza.html" allow="microphone; autoplay" style="width:100%;height:95vh;border:0"></iframe>');return;}
 res.setHeader('Content-Type',mime[extname(name)]||'application/octet-stream');res.end(await readFile(join(root,name)));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const {chromium,exe}=requireBrowser();
const browser=await chromium.launch({executablePath:exe,args:['--no-sandbox']});
let pass=0;function ck(name,ok){assert.ok(ok,name);pass++;console.log('PASS '+name);}
async function setup(width=1366,height=768,mode='native',framed=false){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({mode})=>{
  window.__tts=[];window.__instances=[];
  Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return [];},speak(u){window.__tts.push(u.text);setTimeout(()=>u.onend?.(),30);}}});
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  window.SpeechRecognition=mode==='unsupported'?undefined:class{
   constructor(){window.__instances.push(this);this.results=[];}
   start(){this.results=[];this.onstart?.();}
   abort(){this.aborted=true;}
   stop(){this.onend?.();}
   say(text,final=true){const r=[{transcript:text}];r.isFinal=final;this.results=[r];this.onresult?.({results:this.results});}
  };
  window.webkitSpeechRecognition=undefined;
 },{mode});
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());if(u.origin!==base)return r.abort();
  if(u.pathname.startsWith('/api/'))return r.fulfill({status:u.pathname.includes('tts')?503:200,json:{ok:true,sets:[]}});
  return r.continue();
 });
 await page.goto(base+(framed?'/qa-frame':'/student-game-grammar-pizza.html'));
 const frame=framed?page.frames().find(f=>f.url().includes('grammar-pizza')):page;
 await frame.waitForFunction(()=>typeof startMission==='function');
 if(process.env.PIZZA_QA_FONT){await frame.addStyleTag({content:"@font-face{font-family:PizzaQA;src:url('/qa-font.ttf')}body,button,select{font-family:PizzaQA,sans-serif!important}"});await frame.evaluate(()=>document.fonts.ready);}
 return {page,frame,errors};
}
try{
 {
  const {page,frame,errors}=await setup();
  await frame.locator('#btn-ready').click();await frame.waitForFunction(()=>!awaitingStart);
  // Click the actual rendered ingredients in sentence order.
  await frame.evaluate(()=>{while(placedCount<cur().tokens.length){const idx=placedCount;const word=cur().tokens[idx][0];const el=[...document.querySelectorAll('#tray .bowl')].find(e=>e.querySelector('.w').textContent===word);el.click();}});
  await frame.locator('#mission.show').waitFor();ck('build pizza opens speaking mission',await frame.locator('#btn-speak').isDisabled());
  await frame.locator('#btn-listen').click();await frame.waitForFunction(()=>!document.querySelector('#btn-speak').disabled);
  ck('listening unlocks speaking',await frame.locator('#listen-dots .on').count()===1);
  await frame.locator('#btn-speak').click();ck('recording has an actionable stop button',(await frame.locator('#btn-speak').innerText()).includes('끝내기'));
  ck('listen locked during speaking',await frame.locator('#btn-listen').isDisabled());
  await frame.evaluate(()=>recognition.say('something different',true));await frame.locator('#btn-speak').click();
  ck('wrong answer stays visible',(await frame.locator('#speech-result').innerText()).includes('something different'));
  const before=await frame.evaluate(()=>__tts.length);await page.waitForTimeout(750);
  ck('wrong answer does not interrupt with automatic audio',await frame.evaluate(()=>__tts.length)===before);
  await frame.locator('#btn-speak').click();await frame.evaluate(()=>recognition.say(sentenceText(),false));
  ck('interim correct result does not award points',await frame.evaluate(()=>tokens)===0);
  await frame.evaluate(()=>recognition.say(sentenceText(),true));
  ck('final correct retry awards ten not first-try bonus',await frame.evaluate(()=>tokens)===10);
  ck('completed mission releases its microphone',await frame.evaluate(()=>!listening&&__instances.every(r=>r.aborted)));
  ck('desktop has no runtime errors',errors.length===0);await page.close();
 }
 for(const [width,height,framed] of [[390,844,false],[768,1024,true],[1366,768,false]]){
  const {page,frame,errors}=await setup(width,height,'native',framed);
  await frame.evaluate(()=>{document.querySelector('#ready').classList.remove('show');startMission();listenCount=1;_pzButtons();});
  await frame.locator('#btn-speak').click();await frame.evaluate(()=>recognition.onerror({error:'not-allowed'}));
  ck(width+' permission message persists',(await frame.locator('#speech-result').innerText()).includes('권한'));
  ck(width+' retry unlocked',!(await frame.locator('#btn-speak').isDisabled()));
  ck(width+' controls fit viewport',await frame.locator('#mission-card').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
  if(process.env.PIZZA_SCREENSHOTS){await mkdir(process.env.PIZZA_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.PIZZA_SCREENSHOTS,'pizza-'+width+'.png')});}
  await frame.locator('#btn-speak').click();await frame.evaluate(()=>recognition.say(sentenceText(),true));
  ck(width+' permission retry can pass',await frame.evaluate(()=>tokens)===15);
  ck(width+' no runtime errors',errors.length===0);await page.close();
 }
 {
  const {page,frame,errors}=await setup(390,844,'unsupported');
  await frame.evaluate(()=>{window.MangoiVoice={supported:()=>true,cancel(){},stop(){window.__resolve(sentenceText());},record(opts){window.__opts=opts;opts.onState('waiting',{});return new Promise(r=>window.__resolve=r);}};document.querySelector('#ready').classList.remove('show');startMission();listenCount=1;_pzButtons();});
  await frame.locator('#btn-speak').click();ck('native unsupported does not auto-pass',await frame.evaluate(()=>tokens)===0);
  ck('fallback uses English hint',await frame.evaluate(()=>__opts.lang)==='en');await frame.locator('#btn-speak').click();
  await frame.waitForFunction(()=>tokens===15);ck('fallback stop transcribes and passes',true);
  ck('fallback no runtime errors',errors.length===0);await page.close();
 }
 console.log('pizza-speech-browser — PASS '+pass+' / FAIL 0');
}finally{await browser.close();server.close();}
