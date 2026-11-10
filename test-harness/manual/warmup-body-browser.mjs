// AI speaking torso layer: real warmup page, local assets, every API mocked. No paid/live calls.
// AI 말하기 몸통 레이어: 실제 페이지 + 로컬 자산, API 는 모두 모의 응답. 유료·실서비스 호출 없음.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,join,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadPlaywright,findChromium} from './_pw.mjs';
const root=resolve(process.env.WARMUP_PUBLIC_ROOT||join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer(async(q,s)=>{try{const p=new URL(q.url,'http://local').pathname;const f=join(root,decodeURIComponent(p));s.setHeader('content-type',mime[extname(f)]||'application/octet-stream');s.end(await readFile(f));}catch{s.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const pw=loadPlaywright(),exe=process.env.CHROMIUM||findChromium();
if(!pw||!exe){console.error('BLOCKED: Playwright/Chromium required');server.close();process.exit(2);}
const browser=await pw.chromium.launch({executablePath:exe,args:['--no-sandbox']});
let passed=0;function ck(v,name){assert.ok(v,name);passed++;console.log('PASS '+name);}
const FRIENDS=['emma','lily','noah','jake','mei','long'];

async function page(w,h,{failBody=false}={}){
 const context=await browser.newContext({viewport:{width:w,height:h}});const p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{localStorage.setItem('mangoi_ftk_peeked','1');window.SpeechRecognition=class{start(){}stop(){}abort(){}};});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
  if(failBody&&u.pathname.startsWith('/img/bodies/'))return route.fulfill({status:503,body:''});
  if(!u.pathname.startsWith('/api/'))return route.continue();
  if(u.pathname==='/api/warmup/chat')return route.fulfill({json:{ai_response:'What would you like to order?'}});
  if(u.pathname==='/api/voice/tts')return route.fulfill({status:503,body:''});
  return route.fulfill({json:{ok:true}});
 });
 await p.goto(base+'/warmup.html?setup=0&lang=en&textbook=BTS%201&unit=Food%20at%20the%20bakery');
 await p.waitForFunction(()=>window.MangoWarmupBody&&window.MangoAvatar&&typeof _stopSpeak==='function');
 await p.evaluate(()=>{try{_stopSpeak();}catch(e){}});
 return{p,errors,close:()=>context.close()};
}
async function use(p,who){
 await p.evaluate(x=>MangoAvatar.setCharacter(x),who);
 await p.waitForFunction(x=>{const i=document.querySelector('#tavatar-ring>.wf-body');return i&&(i.getAttribute('data-friend')===x||!document.getElementById('tavatar-ring').classList.contains('wf-has-body'))&&i.complete;},who);
 // the card animates height (.25s) and pulses while speaking: measure only when settled.
 await p.evaluate(()=>{try{MangoAvatar.plainStop();}catch(e){}});
 await p.waitForFunction(()=>{const r=document.getElementById('tavatar-ring');return !r.getAnimations().some(a=>a.playState==='running')&&!document.getElementById('tavatar-wrap').classList.contains('speaking');});
 await p.waitForTimeout(450);
 return p.evaluate(()=>{
  // Layout boxes, not transformed rects: the face engine's own idle "breath"
  // (mgAliveBreath, origin = canvas bottom centre) moves the seam corners by <=0.6px.
  const ring=document.getElementById('tavatar-ring'),cv=document.getElementById('tavatar-canvas'),img=ring.querySelector('.wf-body');
  const box=e=>{const s=getComputedStyle(e);return[e.offsetLeft,e.offsetTop,parseFloat(s.width)||0,parseFloat(s.height)||0];};
  const r=ring.getBoundingClientRect();
  return{has:ring.classList.contains('wf-has-body'),shown:getComputedStyle(img).display!=='none',friend:img.getAttribute('data-friend'),
   ring:[0,0,r.width,r.height],canvas:box(cv),body:box(img),intr:[cv.width,cv.height],nat:[img.naturalWidth,img.naturalHeight]};
 });
}

// 1) Wide layout: every friend gets a torso; the face keeps its aspect, size and top edge.
{const {p,errors,close}=await page(1366,900);
 for(const who of FRIENDS){
  const m=await use(p,who);
  ck(m.has&&m.shown&&m.friend===who,`1366 ${who}: torso layer shown / 몸통 표시`);
  const expH=m.canvas[2]*m.intr[1]/m.intr[0];
  ck(Math.abs(m.canvas[3]-expH)<1.5,`1366 ${who}: face canvas keeps its own aspect (${m.canvas[3].toFixed(1)}≈${expH.toFixed(1)})`);
  ck(Math.abs(m.canvas[1]-(m.ring[1]+4))<1.5&&Math.abs(m.canvas[0]-(m.ring[0]+4))<1.5,`1366 ${who}: face canvas stays at the card's top-left ring=${m.ring} canvas=${m.canvas}`);
  ck(Math.abs(m.body[2]-m.canvas[2])<1.5&&Math.abs(m.body[1]-m.canvas[1])<1.5,`1366 ${who}: torso aligned under the canvas (same width/top) body=${m.body} canvas=${m.canvas}`);
  // seam = bottom of the face canvas; in the body image it is (natural height - 2x160 drawn rows).
  const seamCss=m.canvas[3],bodySeam=m.body[2]*(m.nat[1]-320)/m.nat[0];
  ck(Math.abs(seamCss-bodySeam)<1.0,`1366 ${who}: seam lines up within 1px (${seamCss.toFixed(2)} vs ${bodySeam.toFixed(2)}, canvas ${m.intr})`);
  ck(m.ring[3]>m.canvas[3]+20,`1366 ${who}: card shows torso below the face`);
  // no visible seam line: the largest row-to-row colour step within ±6px of the seam, on screen.
  const png=(await p.locator('#tavatar-ring').screenshot()).toString('base64');
  const step=await p.evaluate(async([b64,seam])=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
   const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
   const k=im.width/document.getElementById('tavatar-ring').getBoundingClientRect().width,x0=Math.round(im.width*0.1),w=Math.round(im.width*0.8),y0=Math.round((seam-6)*k),h=Math.round(12*k);
   const d=g.getImageData(x0,y0,w,h).data;let max=0;
   for(let y=1;y<h;y++){let s=0;for(let i=0;i<w*4;i++)if(i%4<3)s+=Math.abs(d[y*w*4+i]-d[(y-1)*w*4+i]);max=Math.max(max,s/(w*3));}
   return max;},[png,m.canvas[1]+m.canvas[3]]);
  ck(step<20,`1366 ${who}: no seam line (max row step ${step.toFixed(1)} < 20; old Jake 36, Jake neckline ink ~15)`);
 }
 ck(errors.length===0,'1366: no page errors '+errors.join('|'));await close();}

// 2) Phone: the original chest-up card is unchanged (button and dialogue not pushed down).
for(const [w,h] of [[390,844],[320,568],[844,390]]){
 const {p,errors,close}=await page(w,h);
 for(const who of ['lily','noah']){
  const m=await use(p,who);
  ck(!m.shown,`${w}x${h} ${who}: torso hidden on phones / 휴대폰은 기존 카드`);
  ck(Math.abs(m.ring[3]-m.ring[2]*1.25)<1.5,`${w}x${h} ${who}: card height unchanged (4:5)`);
 }
 ck(errors.length===0,`${w}x${h}: no page errors`);await close();}

// 3) Tall stacked screen (tablet portrait): torso shown.
{const {p,close}=await page(768,1024);const m=await use(p,'mei');ck(m.shown&&m.friend==='mei','768x1024 mei: torso shown on a tall tablet');await close();}

// 4) Switching friends never leaves the previous body; a failed image falls back to the card.
{const {p,close}=await page(1366,900);
 const a=await use(p,'noah'),b=await use(p,'lily');
 ck(a.friend==='noah'&&b.friend==='lily','switch noah→lily: body follows the friend');
 const n=await p.evaluate(()=>document.querySelectorAll('#tavatar-ring>.wf-body').length);ck(n===1,'only one torso element');
 await p.evaluate(()=>MangoAvatar.setCharacter('nobody'));await p.waitForTimeout(100);
 ck(await p.evaluate(()=>MangoWarmupBody.current()==='lily'),'unknown name ignored like the face engine (keeps lily)');
 await p.evaluate(()=>MangoAvatar.setCharacter('emma_classic'));await p.waitForTimeout(100);
 ck(await p.evaluate(()=>MangoWarmupBody.current()===''),'old video face (emma_classic): no drawn body');
 await use(p,'mei');ck(await p.evaluate(()=>MangoWarmupBody.current()==='mei'),'back to a photo friend: body returns');
 await close();}
{const {p,close}=await page(1366,900,{failBody:true});const m=await use(p,'noah');
 ck(!m.has&&!m.shown,'image error: torso hidden, original card back');
 ck(Math.abs(m.ring[3]-m.ring[2]*1.25)<1.5,'image error: card height back to 4:5');await close();}

await browser.close();server.close();
console.log(`warmup-body-browser: ${passed} PASS`);
