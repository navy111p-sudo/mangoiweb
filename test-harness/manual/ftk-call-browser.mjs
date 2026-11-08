// -*- coding: utf-8 -*-
// 📞 A.i 말하기 «얼굴 대화» 영상통화 화면(js/ftk-call.js) — 브라우저 검사.
//   (2026-11-08 사장님 「영상 앱과 똑같이 — 답변·입모양·디자인·분위기·표정」)
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/ftk-call-browser.mjs
//   목소리는 «진짜 <audio>» 로 무음 WAV 를 재생합니다(자막이 실제 재생 위치를 따라가는지 보려고).
//   짝으로 묻는 것: 「소리 나기 전엔 자막 없음」 ↔ 「소리 난 만큼 나옴」 · 「자동은 바로 듣기」 ↔ 「손 모드는 쉬며 기다림」
//                  「.5X 켜면 0.5배」 ↔ 「끄면 원래 속도」 · 「카메라 켜면 내 얼굴」 ↔ 「나가면 카메라 꺼짐」
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);
  const b=await readFile(join(root,p==='/'?'index.html':p));s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe,args:['--autoplay-policy=no-user-gesture-required']});
const LONG='Nice! Do you have a dog? I have a small brown dog named Mango and he loves to run in the park every single morning.';

const STUB=`(function(){
  window.__log=[]; window.__samples=[];
  window.__script=[{heard:true,text:'I like dogs'},{heard:false,text:''},{heard:false,text:''},{heard:true,text:'Yes I do'}];
  function wav(sec){ var sr=8000,n=Math.floor(sr*sec),b=new ArrayBuffer(44+n*2),v=new DataView(b);
    function w(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}
    w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
    v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
    return URL.createObjectURL(new Blob([b],{type:'audio/wav'})); }
  function patch(){
    if(!window.MangoiTTS||!window.MangoiVoice||!window.MangoiVoiceCheck||!window.FtkCall){return setTimeout(patch,30);}
    MangoiVoiceCheck.blobHasVoice=async function(b){return !!(b&&b.hasVoice);};
    MangoiTTS.speak=function(text,rate,done){ __log.push('speak:'+text);
      var a=MangoiTTS.getAudioEl(); a.onended=function(){ __log.push('spoke'); done&&done(); };
      a.src=wav(Math.max(1.2,text.split(' ').length*0.22)); a.play().catch(function(){ __log.push('playfail'); done&&done(); }); };
    MangoiVoice.supported=function(){return true;};
    MangoiVoice.record=function(o){ var st=__script.shift()||{heard:false,text:''}; __log.push('rec');
      o.onAudio&&o.onAudio({hasVoice:st.heard});
      return new Promise(function(res){ window.__recCancel=function(){res('');};
        o.onState('waiting',{});
        setTimeout(function(){ if(st.heard) o.onState('speaking',{});
          setTimeout(function(){ o.onState('thinking',{}); setTimeout(function(){ res(st.text); },300); },400); },300); }); };
    MangoiVoice.stop=function(){}; MangoiVoice.cancel=function(){ window.__recCancel&&__recCancel(); };
    navigator.mediaDevices.getUserMedia=async function(){ var c=document.createElement('canvas'); c.width=64;c.height=64;
      c.getContext('2d').fillRect(0,0,64,64); window.__cam=c.captureStream(5); return window.__cam; };
    /* 50ms 마다 «상태·재생·자막» 을 적는다 */
    setInterval(function(){ var f=document.getElementById('ftk'); if(!f||!f.classList.contains('on')) return;
      var a=MangoiTTS.getAudioEl(), p=f.querySelector('.fc-cap p'), st=f.querySelector('.fc-status');
      __samples.push({s:f.getAttribute('data-s'), play:!!(a&&!a.paused&&!a.ended&&a.currentTime>0), cap:p?p.textContent:'', status:st?st.textContent:''}); },50);
    window.__patched=true;
  }
  patch();
})();`;

async function open(hands){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(STUB);
  await ctx.addInitScript((h)=>{ try{ localStorage.setItem('mangoi_ftk_peeked','1'); if(h) localStorage.setItem('mangoi_ftk_hands',h); }catch(e){} }, hands||'');
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    if(u.pathname==='/api/ai/chat-guest-token'){await route.fulfill({json:{ok:true,uid:'guest_abc',token:'eyJ1aWQiOiJndWVzdF9hYmMifQ.sig'}});return;}
    if(u.pathname==='/api/ai/chat-friend'){await route.fulfill({json:{ok:true,reply:LONG}});return;}
    await route.fulfill({json:{ok:true}});});
  await page.goto(base+'/ai-friend.html?_nc='+Date.now());
  await page.waitForFunction(()=>window.__patched && window.MangoiFaceTalk, null, {timeout:9000}).catch(()=>{});
  await page.waitForTimeout(600);
  return {ctx,page,errs};
}
const st=(page)=>page.evaluate(()=>{const f=document.getElementById('ftk');return {s:f.getAttribute('data-s'),status:f.querySelector('.fc-status').textContent};});

/* ── A. 자동(기본) ── */
console.log('▶ A. A.i 친구하기 · 자동 대화 · 폰 390x844');
{
  const {ctx,page,errs}=await open('');
  await page.click('#tavatar-ring');
  await page.waitForTimeout(300);
  const ui=await page.evaluate(()=>{const f=document.getElementById('ftk');
    const v=(q)=>{const e=f.querySelector(q);return !!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;};
    return {skin:f.classList.contains('ftk-call'),title:f.querySelector('.fc-title').textContent,
      btns:['.fc-done','.fc-cam','.fc-close','.fc-replay','.fc-mic','.fc-slow','.fc-cc','.fc-auto','.fc-hand'].every(v),
      oldX:v('#ftkX'), bg:getComputedStyle(f).backgroundImage, cam:f.querySelector('.fc-cam').getAttribute('aria-pressed'),
      auto:f.querySelector('.fc-auto').getAttribute('aria-pressed')};});
  ok('영상통화 화면이 입혀진다(제목 «A.i 친구하기»)', ui.skin && ui.title==='A.i 친구하기', ui.title);
  ok('위·왼쪽·아래 버튼이 모두 보인다(✓ 📷 ✕ · 다시 듣기 · 🎤 .5X CC 자동 손)', ui.btns);
  ok('옛 ✕(#ftkX)는 숨긴다(✕ 가 두 개 아님)', !ui.oldX);
  ok('밝은 회색 배경(옛 남색 아님)', /linear-gradient\(rgb\(2[0-9]{2}/.test(ui.bg), ui.bg.slice(0,60));
  ok('내 카메라는 기본 꺼짐(빨강)', ui.cam==='false');
  ok('자동 대화가 기본', ui.auto==='true');
  await page.screenshot({path:'/tmp/ftk-call-390.png'});

  // 첫 인사가 끝날 때까지
  await page.waitForFunction(()=>__log.includes('spoke'), null, {timeout:9000}).catch(()=>{});
  const g=await page.evaluate(()=>({sm:__samples.slice(), hi:(__log.find(x=>x.startsWith('speak:'))||'').slice(6)}));
  const sp=g.sm.filter(x=>x.s==='speak');
  const firstPlay=sp.findIndex(x=>x.play);
  const total=g.hi.split(' ').length;
  const counts=sp.filter(x=>x.play).map(x=>x.cap?x.cap.split(' ').length:0);
  ok('전제: 첫 인사가 실제 <audio> 로 재생됐다', firstPlay>=0 && g.hi, 'samples='+sp.length);
  ok('소리가 나기 «전» 에는 자막이 없다', sp.slice(0,Math.max(0,firstPlay)).every(x=>!x.cap), JSON.stringify(sp.slice(0,firstPlay).map(x=>x.cap)));
  ok('소리 나는 동안 낱말이 «일부만» 보이는 순간이 있다(한꺼번에 아님)', counts.some(n=>n>0&&n<total), counts.join(','));
  ok('재생이 이어질수록 자막이 줄지 않는다', counts.every((n,i,a)=>!i||n>=a[i-1]));
  ok('끝날 즈음 인사 전체가 자막에 나온다', counts.length && Math.max(...counts)===total, Math.max(...counts)+'/'+total);
  ok('말하는 동안엔 «듣는 중/생각 중» 글자가 없다', sp.every(x=>!x.status));

  // 듣기 → 생각 → 긴 대답
  await page.waitForFunction(()=>__samples.some(x=>x.s==='listen'), null, {timeout:9000}).catch(()=>{});
  await page.waitForFunction(()=>__samples.some(x=>x.s==='think'), null, {timeout:9000}).catch(()=>{});
  const ls=await page.evaluate(()=>({l:(__samples.find(x=>x.s==='listen')||{}).status,t:(__samples.find(x=>x.s==='think')||{}).status}));
  ok('듣는 동안 «듣는 중...»', ls.l==='듣는 중...', ls.l);
  ok('답을 기다리는 동안 «생각 중...»', ls.t==='생각 중...', ls.t);
  await page.waitForFunction((L)=>__log.indexOf('speak:'+L.split(' ').slice(0,2).join(' '))>=0 || __log.some(x=>x.startsWith('speak:')&&x!==__log[0]), LONG, {timeout:12000}).catch(()=>{});
  await page.waitForFunction(()=>{const p=document.querySelector('#ftk .fc-cap p');return p&&/morning\.$/.test(p.textContent);}, null, {timeout:15000}).catch(()=>{});
  const cl=await page.evaluate(()=>{const c=document.querySelector('#ftk .fc-cap'),p=c.querySelector('p');
    const lh=parseFloat(getComputedStyle(c).lineHeight);return {ch:c.clientHeight,ph:p.scrollHeight,lh,txt:p.textContent,
      last:(()=>{const r=document.createRange();r.selectNodeContents(p);const rs=r.getClientRects();const b=c.getBoundingClientRect();const lr=rs[rs.length-1];return lr&&lr.bottom<=b.bottom+1&&lr.top>=b.top-1;})()};});
  ok('긴 대답은 «마지막 2줄» 만 보인다(넘친 윗줄은 잘림)', cl.ch<=cl.lh*2.1 && cl.ph>cl.ch, `상자 ${cl.ch}px · 내용 ${cl.ph}px · 줄 ${cl.lh}px`);
  ok('보이는 줄의 끝이 «지금 말한 낱말»', /morning\.$/.test(cl.txt) && cl.last, cl.txt.slice(-30));
  await page.screenshot({path:'/tmp/ftk-call-cap-390.png'});

  // CC 끄기/켜기
  await page.click('#ftk .fc-cc'); await page.waitForTimeout(100);
  const cc0=await page.evaluate(()=>({h:document.querySelector('#ftk .fc-cap').hidden,p:document.querySelector('#ftk .fc-cc').getAttribute('aria-pressed'),ls:localStorage.getItem('mangoi_ftk_cc')}));
  await page.click('#ftk .fc-cc'); await page.waitForTimeout(100);
  const cc1=await page.evaluate(()=>document.querySelector('#ftk .fc-cap').hidden);
  ok('CC 를 끄면 자막이 숨고(기억함)', cc0.h && cc0.p==='false' && cc0.ls==='0');
  ok('다시 켜면 자막이 보인다(짝)', cc1===false);

  // .5X
  const r0=await page.evaluate(()=>currentRate);
  await page.click('#ftk .fc-slow'); await page.waitForTimeout(100);
  const r1=await page.evaluate(()=>({r:currentRate,p:document.querySelector('#ftk .fc-slow').getAttribute('aria-pressed')}));
  await page.click('#ftk .fc-slow'); await page.waitForTimeout(100);
  const r2=await page.evaluate(()=>currentRate);
  ok('.5X 를 켜면 0.5배로 말한다', r1.r===0.5 && r1.p==='true', r0+'→'+r1.r);
  ok('.5X 를 끄면 원래 속도로(짝)', r2===r0, String(r2));

  // 다시 듣기
  await page.waitForTimeout(400);
  const n0=await page.evaluate(()=>__log.filter(x=>x.startsWith('speak:')).length);
  await page.click('#ftk .fc-replay'); await page.waitForTimeout(400);
  const rp=await page.evaluate((n)=>__log.filter(x=>x.startsWith('speak:')).slice(n),n0);
  ok('다시 듣기 → 선생님 마지막 말을 다시 읽는다', rp.length>=1, rp.join(' | ').slice(0,80));

  // 카메라
  await page.click('#ftk .fc-cam'); await page.waitForTimeout(300);
  const cm=await page.evaluate(()=>({vis:!document.querySelector('#ftk .fc-self').hidden,p:document.querySelector('#ftk .fc-cam').getAttribute('aria-pressed')}));
  ok('📷 를 누르면 내 얼굴이 작게 보인다', cm.vis && cm.p==='true');

  // 진행 막대
  const pg=await page.evaluate(()=>({w:document.querySelector('#ftk .fc-prog i').style.width,n:document.querySelectorAll('#chat .msg.user').length}));
  ok('진행 막대 = 말한 횟수/5', pg.w===(Math.min(1,pg.n/5)*100)+'%', pg.n+'번 → '+pg.w);

  // ✓ 끝내기 → 결과
  await page.evaluate(()=>{ window.AiSpeakingProgress=window.AiSpeakingProgress||{}; window.AiSpeakingProgress.finish=function(){ window.__fin=(window.__fin||0)+1; }; });
  await page.click('#ftk .fc-done'); await page.waitForTimeout(300);
  const dn=await page.evaluate(()=>({off:!document.getElementById('ftk').classList.contains('on'),fin:window.__fin,cam:window.__cam.getTracks().every(t=>t.readyState==='ended'),home:document.getElementById('tavatar-wrap').contains(document.getElementById('tavatar-ring'))}));
  ok('✓ → 얼굴 화면을 닫고 «학습 결과» 를 연다', dn.off && dn.fin===1 && dn.home);
  ok('나가면 카메라가 꺼진다(짝)', dn.cam);
  ok('페이지 스크립트 오류 없음', errs.length===0, errs.slice(0,2).join(' | '));
  await ctx.close();
}

/* ── B. 손(누르고 말하기) ── */
console.log('▶ B. A.i 친구하기 · 손 모드(누르고 말하기)');
{
  const {ctx,page,errs}=await open('hand');
  await page.click('#tavatar-ring');
  await page.waitForFunction(()=>__log.includes('spoke'), null, {timeout:9000}).catch(()=>{});
  await page.waitForTimeout(1500);
  const a=await page.evaluate(()=>({recs:__log.filter(x=>x==='rec').length,hand:document.querySelector('#ftk .fc-hand').getAttribute('aria-pressed')}));
  const s1=await st(page);
  ok('손 모드: 인사가 끝나도 저절로 듣지 않는다', a.recs===0 && a.hand==='true', 'recs='+a.recs);
  ok('손 모드: «마이크를 눌러 말해요» 로 기다린다', s1.s==='pause' && s1.status==='마이크를 눌러 말해요', JSON.stringify(s1));
  await page.click('#ftk .fc-mic'); await page.waitForTimeout(500);
  const b=await page.evaluate(()=>__log.filter(x=>x==='rec').length);
  ok('🎤 를 누르면 듣기 시작(짝)', b===1, 'recs='+b);
  await page.waitForFunction(()=>__log.filter(x=>x==='spoke').length>=2, null, {timeout:15000}).catch(()=>{});
  await page.waitForTimeout(1500);
  const c=await page.evaluate(()=>__log.filter(x=>x==='rec').length);
  ok('손 모드: 대답 뒤에도 다시 저절로 듣지 않는다', c===1, 'recs='+c);
  await page.click('#ftk .fc-auto'); await page.waitForTimeout(600);
  const d=await page.evaluate(()=>({recs:__log.filter(x=>x==='rec').length,ls:localStorage.getItem('mangoi_ftk_hands')}));
  ok('자동으로 바꾸면 바로 듣고(기억함)', d.recs===2 && d.ls==='auto', JSON.stringify(d));
  ok('페이지 스크립트 오류 없음', errs.length===0, errs.slice(0,2).join(' | '));
  await ctx.close();
}

/* ── C. 웜업(A.i 말하기 연습) — 같은 화면이 입혀지는가 ── */
console.log('▶ C. A.i 말하기 연습(웜업)');
{
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(()=>{ try{ localStorage.setItem('mangoi_ftk_peeked','1'); localStorage.setItem('mangoi_warmup_talk_mode','auto'); }catch(e){} });
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    await route.fulfill({json:{ok:true,ai_response:'Nice! Do you have a dog?',answer_chips:['Yes, I do.']}});});
  await page.goto(base+'/warmup.html?setup=0&diff=2&_nc='+Date.now());
  await page.waitForFunction(()=>window.WarmupFaceTalk && window.FtkCall, null, {timeout:9000}).catch(()=>{});
  await page.waitForTimeout(2000);
  await page.evaluate(()=>WarmupFaceTalk.enter()); await page.waitForTimeout(400);
  const u=await page.evaluate(()=>{const f=document.getElementById('ftk');return {skin:!!f&&f.classList.contains('ftk-call'),title:f&&f.querySelector('.fc-title').textContent};});
  ok('웜업에도 같은 영상통화 화면(제목 «A.i 말하기»)', u.skin && u.title==='A.i 말하기', JSON.stringify(u));
  const r0=await page.evaluate(()=>_rateLevel);
  await page.click('#ftk .fc-slow'); await page.waitForTimeout(100);
  const r1=await page.evaluate(()=>_rateLevel);
  await page.click('#ftk .fc-slow'); await page.waitForTimeout(100);
  const r2=await page.evaluate(()=>_rateLevel);
  ok('.5X → 1단계(0.5배), 끄면 원래 단계', r1===1 && r2===r0, r0+'→'+r1+'→'+r2);
  await page.click('#ftk .fc-hand'); await page.waitForTimeout(200);
  const m1=await page.evaluate(()=>WarmupAutoTalk.mode());
  ok('손 모드 → 엔진을 «버튼» 으로', m1==='button', m1);
  await page.click('#ftk .fc-close'); await page.waitForTimeout(300);
  const m2=await page.evaluate(()=>({m:WarmupAutoTalk.mode(),off:!document.getElementById('ftk').classList.contains('on')}));
  ok('나가면 원래 «자동» 으로 되돌린다(짝)', m2.off && m2.m==='auto', JSON.stringify(m2));
  await page.evaluate(()=>localStorage.setItem('mangoi_ftk_hands','auto'));
  ok('페이지 스크립트 오류 없음', errs.length===0, errs.slice(0,2).join(' | '));
  await ctx.close();
}
await browser.close();srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);process.exit(fail?1:0);
