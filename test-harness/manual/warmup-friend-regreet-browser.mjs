// Warmup: changing the AI friend before the student speaks re-greets as the new friend,
// and the Jake portrait has no opaque line across its top. Real page, local assets, every API mocked.
// 웜업: 학생이 말하기 전에 친구를 바꾸면 새 친구 이름으로 다시 인사하고(「Jake 인데 I'm Emma」 방지),
// Jake 초상화 맨 위에 불투명한 가로줄이 없다. 실제 페이지 + 로컬 자산, API 는 모두 모의 응답.
// Run / 실행: node test-harness/manual/warmup-friend-regreet-browser.mjs
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,join,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {loadPlaywright,findChromium} from './_pw.mjs';
const root=resolve(process.env.WARMUP_PUBLIC_ROOT||join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.mp4':'video/mp4'};
const server=createServer(async(q,s)=>{try{const p=new URL(q.url,'http://local').pathname;const f=join(root,decodeURIComponent(p));s.setHeader('content-type',mime[extname(f)]||'application/octet-stream');s.end(await readFile(f));}catch{s.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const pw=loadPlaywright(),exe=process.env.CHROMIUM||findChromium();
if(!pw||!exe){console.error('BLOCKED: Playwright/Chromium required');server.close();process.exit(2);}
const browser=await pw.chromium.launch({executablePath:exe,args:['--no-sandbox']});let n=0;const ok=(v,m)=>{assert.ok(v,m);n++;console.log('PASS',m);};
const NAMES={emma:'Emma',jake:'Jake',lily:'Lily',noah:'Noah'};
async function open({saved,query='',serverGreets=false,lang}={}){
 const ctx=await browser.newContext({viewport:{width:1366,height:800}});const chats=[],errs=[];
 await ctx.addInitScript(([sv,lg])=>{if(sv)localStorage.setItem('mangoi_warmup_voice',sv);if(lg)localStorage.setItem('mangoi_lang',lg);localStorage.setItem('mangoi_ftk_peeked','1');window.SpeechRecognition=class{start(){}stop(){}abort(){}};},[saved||'',lang||'']);
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
  if(!u.pathname.startsWith('/api/'))return route.continue();
  if(u.pathname==='/api/warmup/chat'){let b={};try{b=route.request().postDataJSON();}catch(e){}chats.push(b);
   if(serverGreets&&b.kickoff)return route.fulfill({json:{ai_response:`Hi, I'm ${NAMES[b.friend]}! What food do you like?`}});
   if(b.kickoff)return route.fulfill({status:500,body:''});
   return route.fulfill({json:{ai_response:'Nice! Tell me more.'}});}
  if(u.pathname==='/api/voice/tts')return route.fulfill({status:503,body:''});
  return route.fulfill({json:{ok:true}});});
 const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));
 await p.goto(base+'/warmup.html'+query);
 await p.waitForFunction(()=>window.MangoAvatar&&typeof setVoiceMode==='function');
 if(!/setup=0/.test(query)){await p.waitForTimeout(600);await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/시작하기|Start/.test(x.textContent)&&x.offsetWidth);b.click();});}
 await p.waitForFunction(()=>document.querySelector('#log .msg.ai'),null,{timeout:15000});
 return {p,chats,errs,ctx};
}
const ai=p=>p.evaluate(()=>[...document.querySelectorAll('#log .msg.ai')].map(m=>m._warmText));
const all=p=>p.evaluate(()=>document.getElementById('log').innerText);
const sid=p=>p.evaluate(()=>SESSION_ID);

// 1) 고정 인사(서버 인사 실패) — Emma → Jake, 학생이 말하기 전
{const {p,errs,ctx}=await open();
 ok(/I'm Emma/.test((await ai(p)).join('|')),'1 default greets as Emma');const s0=await sid(p);
 await p.evaluate(()=>setVoiceMode('jake',true));
 await p.waitForFunction(()=>/I'm Jake/.test(document.getElementById('log').innerText),null,{timeout:15000});
 const t=await all(p);ok(!/Emma/.test(t),'1 no Emma left in the log after switching: '+JSON.stringify(t.slice(0,80)));
 ok((await ai(p)).length===1,'1 exactly one greeting bubble');
 ok(await sid(p)!==s0,'1 new session id (server history has no Emma greeting)');
 ok(await p.evaluate(()=>localStorage.getItem('mangoi_warmup_voice')==='jake'&&window.__mgAvatarWant==='jake'&&document.getElementById('voiceVal').textContent.includes('Jake')),'1 saved value, face, label = Jake');
 ok(await p.evaluate(()=>document.querySelector('#log .replay-btn').__who==='jake'),'1 replay speaks as Jake');
 ok(errs.length===0,'1 no page errors '+errs.join('|'));await ctx.close();}

// 1b) 쓰다 만 답(보내기 전)은 친구를 바꿔도 남는다 / an unsent draft survives the re-greeting
{const {p,errs,ctx}=await open();
 await p.evaluate(()=>{document.getElementById('inp').value='I like music';});
 await p.evaluate(()=>setVoiceMode('jake',true));
 await p.waitForFunction(()=>/I'm Jake/.test(document.getElementById('log').innerText),null,{timeout:15000});
 ok(await p.evaluate(()=>document.getElementById('inp').value)==='I like music','1b unsent draft kept after switching');
 ok(!/Emma/.test(await all(p)),'1b still re-greets as Jake');
 ok(errs.length===0,'1b no page errors '+errs.join('|'));await ctx.close();}

// 2) 서버 인사 — friend 값이 jake 로 다시 요청된다
{const {p,chats,errs,ctx}=await open({serverGreets:true,query:'?setup=0&textbook=BTS%201&unit=Food'});
 ok(/I'm Emma/.test((await ai(p)).join('|')),'2 server greets as Emma');
 await p.evaluate(()=>setVoiceMode('jake',true));
 await p.waitForFunction(()=>/I'm Jake/.test(document.getElementById('log').innerText),null,{timeout:15000});
 ok(!/Emma/.test(await all(p)),'2 no Emma left');
 const ks=chats.filter(c=>c.kickoff);ok(ks.length===2&&ks[1].friend==='jake'&&ks[0].session_id!==ks[1].session_id,'2 second kickoff: friend=jake, new session');
 ok(errs.length===0,'2 no page errors '+errs.join('|'));await ctx.close();}

// 3) 학생이 이미 말했으면 대화를 지우지 않는다(기록 보존) — hi 만 읽는다
{const {p,chats,errs,ctx}=await open();const s0=await sid(p);
 await p.evaluate(()=>{addMsg('I like music.','me');});
 await p.evaluate(()=>setVoiceMode('jake',true));await p.waitForTimeout(800);
 ok(await sid(p)===s0,'3 session kept after the student spoke');
 ok(/I like music/.test(await all(p))&&/Emma/.test(await all(p)),'3 earlier bubbles kept');
 ok(await p.evaluate(()=>window.__mgAvatarWant==='jake'),'3 face still switches to Jake');
 ok(errs.length===0,'3 no page errors '+errs.join('|'));await ctx.close();}

// 4) 수업방(?session=)에서는 세션을 바꾸지 않는다
{const {p,errs,ctx}=await open({query:'?setup=0&session=class-1-20261110'});const s0=await sid(p);
 await p.evaluate(()=>setVoiceMode('jake',true));await p.waitForTimeout(800);
 ok(await sid(p)===s0,'4 class session id untouched');ok(errs.length===0,'4 no page errors '+errs.join('|'));await ctx.close();}

// 5) 같은 친구 다시 누르기·announce 없는 호출은 새로 시작하지 않는다
{const {p,ctx}=await open({saved:'jake'});const s0=await sid(p);
 await p.evaluate(()=>{setVoiceMode('jake',true);setVoiceMode('lily');});await p.waitForTimeout(500);
 ok(await sid(p)===s0,'5 same friend / silent call keeps the session');await ctx.close();}

// 6) 얼굴 화면(⋮ 메뉴에서 바꾸기) + 영어 화면 + 머리 위 선
{const {p,errs,ctx}=await open({lang:'en'});
 await p.evaluate(()=>document.getElementById('tavatar-ring').click());await p.waitForFunction(()=>document.querySelector('#ftk.on'));
 await p.evaluate(()=>setVoiceMode('jake',true));
 await p.waitForFunction(()=>/I'm Jake/.test(document.getElementById('log').innerText),null,{timeout:15000});
 ok(await p.evaluate(()=>!!document.querySelector('#ftk.on')),'6 face screen stays open');
 ok(!/Emma/.test(await p.evaluate(()=>document.getElementById('ftk').innerText)),'6 no Emma text on the face screen');
 await p.waitForTimeout(1500);
 const line=await p.evaluate(()=>{const c=document.getElementById('tavatar-canvas');const x=document.createElement('canvas');x.width=c.width;x.height=c.height;const g=x.getContext('2d');g.drawImage(c,0,0);
  let worst=0;for(let y=0;y<Math.round(c.height*0.03);y++){const d=g.getImageData(0,y,c.width,1).data;let op=0;for(let i=3;i<d.length;i+=4)if(d[i]>40)op++;worst=Math.max(worst,op/c.width);}return{worst,w:c.width,h:c.height};});
 ok(line.worst<0.02,'6 no opaque line across the top of the Jake canvas '+JSON.stringify(line));
 ok(errs.length===0,'6 no page errors '+errs.join('|'));await ctx.close();}
console.log('ALL PASS',n);await browser.close();server.close();
