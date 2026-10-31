// -*- coding: utf-8 -*-
// 😊 A.i 친구하기 «선생님 얼굴과만 대화하기» (js/aifriend-facetalk.js) — 브라우저 검사.
//   (2026-09-26 사장님 1안: 얼굴 가득 + 유리판 자막 · 「끌어올리기를 몰라도 자동으로」)
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/ai-friend-facetalk-browser.mjs
//   ⚠️ 문자열 하니스로는 «무엇이 보이고, 언제 녹음하고, 무엇을 보내는가» 를 못 봅니다.
//      마이크(MangoiVoice)와 목소리(MangoiTTS)는 가짜로 바꿔 «순서» 를 기록합니다.
//   짝으로 묻는 것: 「말하는 동안 녹음하지 않는다」 ↔ 「말이 끝나면 듣는다」
//                  「지어낸 말(무음)은 안 보낸다」 ↔ 「진짜 말은 보낸다」
//                  「막히면 저절로 열린다」 ↔ 「평소엔 닫혀 있다」
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const SRC=process.env.FTK_SRC||'';           // 변이시험: 고친 사본을 가리킨다(저장소 파일을 안 건드림)
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);
  const file=(SRC&&p==='/js/aifriend-facetalk.js')?SRC:join(root,p==='/'?'index.html':p);
  const b=await readFile(file);s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe});

const STUB=`(function(){
  window.__log=[]; window.__speaking=0; window.__recDuringSpeak=0;
  window.__script=[{heard:true,text:'I like dogs'},{heard:false,text:'Thank you.'},{heard:false,text:''},{heard:true,text:'Yes I do'}];
  function patch(){
    if(!window.MangoiTTS||!window.MangoiVoice){return setTimeout(patch,30);}
    MangoiTTS.speak=function(text,rate,done){ __log.push('speak:'+text); __speaking++;
      setTimeout(function(){ __speaking--; __log.push('spoke'); done&&done(); },500); };
    MangoiVoice.supported=function(){return true;};
    MangoiVoice.record=function(o){ if(__speaking>0) __recDuringSpeak++;
      var st=__script.shift()||{heard:false,text:''}; __log.push('rec');
      return new Promise(function(res){ window.__recCancel=function(){res('');};
        o.onState('waiting',{});
        setTimeout(function(){ if(st.heard) o.onState('speaking',{});
          setTimeout(function(){ o.onState('thinking',{}); setTimeout(function(){ res(st.text); },150); },300); },300); }); };
    MangoiVoice.stop=function(){}; MangoiVoice.cancel=function(){ window.__recCancel&&__recCancel(); };
    window.__patched=true;
  }
  patch();
})();`;

// ⚠️ «처음 한 번 저절로 보여 주기(peek)» 가 판을 여는 동안 재면 «막히면 저절로 열림» 이 헛돕니다
//    (그 줄을 지워도 통과했습니다 — 변이 실측). 그래서 폰 회차는 peek 을, 노트북 회차는 «이미 본 기기» 로
//    막힘 자동 열림을 잽니다.
for (const [w,h,name,seen] of [[390,844,'폰 세로',false],[1280,800,'노트북',true]]) {
  console.log(`▶ ${name} ${w}x${h}`);
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  await ctx.addInitScript(STUB);
  if (seen) await ctx.addInitScript(()=>{ try{ localStorage.setItem('mangoi_ftk_peeked','1'); }catch(e){} });
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  const sent=[];
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    if(u.pathname==='/api/ai/chat-guest-token'){await route.fulfill({json:{ok:true,uid:'guest_abc',token:'eyJ1aWQiOiJndWVzdF9hYmMifQ.sig'}});return;}
    if(u.pathname==='/api/ai/chat-friend'){let b={};try{b=JSON.parse(route.request().postData()||'{}');}catch{}
      sent.push(b); await route.fulfill({json:{ok:true,reply:'Nice! Do you have a dog?'}});return;}
    await route.fulfill({json:{ok:true}});});
  await page.goto(base+'/ai-friend.html?_nc='+Date.now());
  await page.waitForFunction(()=>window.__patched && window.MangoiFaceTalk, null, {timeout:8000}).catch(()=>{});
  await page.waitForTimeout(800);

  const pre=await page.evaluate(()=>{const r=document.getElementById('tavatar-ring');
    return {badge:!!(r&&r.querySelector('.ftk-badge')),role:r&&r.getAttribute('role'),ready:!!window.MangoiFaceTalk};});
  ok(name+': 얼굴 카드에 입구 표시(▶)가 있다', pre.badge && pre.role==='button', JSON.stringify(pre));

  await page.click('#tavatar-ring');
  await page.waitForTimeout(400);
  await page.screenshot({path:`/tmp/ftk-face-${w}.png`});
  const on=await page.evaluate(()=>{const f=document.getElementById('ftk'), r=document.getElementById('tavatar-ring');
    const rr=r.getBoundingClientRect(); const chat=document.getElementById('chat').getBoundingClientRect();
    const top=document.elementFromPoint(innerWidth/2, Math.min(innerHeight-5, chat.top+10));
    const inp=document.getElementById('msgInput');
    return {on:f&&f.classList.contains('on'), inside:f&&f.contains(r), cover:rr.width*rr.height/(innerWidth*innerHeight),
      hid:!!(top&&f.contains(top)), ro:inp.readOnly, peek:localStorage.getItem('mangoi_ftk_peeked')};});
  ok(name+': 누르면 얼굴 화면이 켜지고 얼굴 카드가 그 안으로 옮겨진다', on.on && on.inside);
  ok(name+': 얼굴이 화면 대부분을 차지한다(≥ 90%)', on.cover>=0.9, (on.cover*100).toFixed(0)+'%');
  ok(name+': 채팅·버튼은 가려져 안 보인다(맨 위가 얼굴 화면)', on.hid);
  ok(name+': 입력칸은 읽기 전용(폰 키보드가 안 튀어나옴)', on.ro===true);
  ok(name+': 처음 들어왔음을 기억한다(한 번만 저절로 보여 주기)', on.peek==='1');
  if (!seen) {
    await page.waitForTimeout(1400);
    const pk=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
    ok(name+': 처음 들어온 기기는 판이 저절로 한 번 올라와 «여기에 글이 있다» 를 보여 준다', /translateY\(0px\)/.test(pk), pk);
  } else {
    await page.waitForTimeout(1400);
    const pk=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
    ok(name+': 이미 본 기기는 평소에 판이 닫혀 있다(짝)', !/translateY\(0px\)/.test(pk), pk);
  }

  // 인사 → 듣기 → 보내기 → 대답 → 다시 듣기(무음 = 지어낸 말) → 유리판 자동 열림
  // ⚠️ 고정 대기로 재면 화면 캡처 시간에 따라 «쉬기» 로 넘어간 뒤를 잽니다(실제로 흔들렸습니다) —
  //    «대답 보기 칩이 뜬 순간» 을 기다려 잽니다.
  await page.waitForFunction(()=>document.querySelectorAll('#ftkChips button').length>0, null, {timeout:9000}).catch(()=>{});
  const mid=await page.evaluate(()=>({log:__log.slice(),rds:__recDuringSpeak,s:document.getElementById('ftk').getAttribute('data-s'),
    tf:document.getElementById('ftkGlass').style.transform, chips:document.querySelectorAll('#ftkChips button').length,
    note:document.getElementById('ftkNote').textContent, teacher:document.getElementById('ftkTeacher').textContent,
    me:document.getElementById('ftkMe').textContent}));
  await page.screenshot({path:`/tmp/ftk-open-${w}.png`});
  const iHi=mid.log.findIndex(x=>x.startsWith('speak:Hi')), iSpoke=mid.log.indexOf('spoke'), iRec=mid.log.indexOf('rec');
  ok(name+': 먼저 선생님이 인사한다', iHi===0, mid.log.slice(0,3).join(' | '));
  ok(name+': 인사가 «끝난 뒤» 에 듣기 시작한다', iSpoke>=0 && iRec>iSpoke);
  ok(name+': 말하는 동안에는 한 번도 녹음하지 않는다', mid.rds===0, 'recDuringSpeak='+mid.rds);
  ok(name+': 학생 말을 서버로 보낸다(목소리 턴)', sent.length>=1 && sent[0].msg==='I like dogs' && sent[0].via==='voice', JSON.stringify(sent[0]||{}));
  ok(name+': 선생님 대답을 읽는다', mid.log.some(x=>x==='speak:Nice! Do you have a dog?'));
  ok(name+': 무음에서 지어낸 말("Thank you.")은 보내지 않는다', !sent.some(b=>/thank you/i.test(b.msg||'')), sent.length+'건');
  ok(name+': 막히면 유리판이 «저절로» 열린다', /translateY\(0px\)/.test(mid.tf), mid.tf);
  ok(name+': 열린 판에 선생님 말·내 말·대답 보기 칩이 있다', !!mid.teacher && /I like dogs/.test(mid.me) && mid.chips>=2, `chips=${mid.chips}`);
  ok(name+': 대답 보기에 빈칸(___) 칩은 없다', await page.evaluate(()=>![...document.querySelectorAll('#ftkChips button')].some(b=>b.textContent.includes('___'))));

  await page.waitForTimeout(1600);
  const p=await page.evaluate(()=>({s:document.getElementById('ftk').getAttribute('data-s'),recs:__log.filter(x=>x==='rec').length}));
  ok(name+': 두 번 조용하면 쉬기(마이크 끔)', p.s==='pause', 'state='+p.s+' recs='+p.recs);
  await page.waitForTimeout(800);
  const p2=await page.evaluate(()=>__log.filter(x=>x==='rec').length);
  ok(name+': 쉬는 동안에는 더 녹음하지 않는다', p2===p.recs, p.recs+'→'+p2);

  // 얼굴을 누르면 다시 시작
  await page.mouse.click(w/2, h*0.3);
  await page.waitForTimeout(1500);
  const r2=await page.evaluate(()=>({recs:__log.filter(x=>x==='rec').length}));
  ok(name+': 쉬는 중 얼굴을 누르면 다시 듣는다', r2.recs>p2, p2+'→'+r2.recs);
  ok(name+': 다시 말한 것도 보낸다', sent.some(b=>b.msg==='Yes I do'), sent.map(b=>b.msg).join(' / '));

  // 유리판 손잡이 탭 → 닫힘/열림
  const before=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
  await page.click('#ftkGrab');
  await page.waitForTimeout(500);
  const after=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
  ok(name+': 손잡이를 한 번 탭하면 판이 열리고 닫힌다', before!==after, before+' → '+after);

  // ✕ → 원래 화면
  await page.click('#ftkX');
  await page.waitForTimeout(400);
  const off=await page.evaluate(()=>{const f=document.getElementById('ftk'), r=document.getElementById('tavatar-ring');
    return {off:!f.classList.contains('on'), home:document.getElementById('tavatar-wrap').contains(r),
      ro:document.getElementById('msgInput').readOnly, chat:document.querySelectorAll('#chat .msg.user').length};});
  ok(name+': ✕ 를 누르면 얼굴 카드가 원래 자리로 돌아온다', off.off && off.home);
  ok(name+': 입력칸이 다시 쓸 수 있게 된다', off.ro===false);
  ok(name+': 방금 나눈 대화가 채팅창에 남아 있다', off.chat>=2, off.chat+'줄');
  ok(name+': 페이지 스크립트 오류 없음', errs.length===0, errs.slice(0,2).join(' | '));
  await page.screenshot({path:`/tmp/ftk-${w}.png`});
  await ctx.close();
}
await browser.close();srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);process.exit(fail?1:0);
