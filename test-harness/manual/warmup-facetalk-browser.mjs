// -*- coding: utf-8 -*-
// 😊 A.i 말하기 연습(웜업) «선생님 얼굴과만 대화하기» (js/warmup-facetalk.js) — 브라우저 검사.
//   (2026-09-26 사장님 1안 — A.i 친구하기에 먼저 넣었는데 사장님이 쓰시는 화면이 웜업이었음)
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/warmup-facetalk-browser.mjs
//   ⚠️ 문자열 하니스로는 «무엇이 보이고, 언제 녹음하고, 무엇을 보내는가» 를 못 봅니다.
//      목소리(speak)·마이크(MangoiVoice)는 가짜로 바꿔 «순서» 를 기록합니다.
//   짝으로 묻는 것: 「말하는 동안 녹음하지 않는다」 ↔ 「말이 끝나면 저절로 듣는다」
//                  「지어낸 말(무음)은 안 보낸다」 ↔ 「진짜 말은 보낸다」
//                  「막히면 저절로 열린다」 ↔ 「평소엔 닫혀 있다」
//                  「나가면 말하는 방법이 원래대로」 ↔ 「들어와 있는 동안은 자동」
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const SRC=process.env.FTK_SRC||'';            // 변이시험: 고친 사본(js/warmup-facetalk.js 대신)
const HTML=process.env.FTK_HTML||'';          // 변이시험: 고친 warmup.html 사본
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);
  const file=(SRC&&p==='/js/warmup-facetalk.js')?SRC:(HTML&&p==='/warmup.html')?HTML:join(root,p==='/'?'index.html':p);
  const b=await readFile(file);s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe});

const STUB=`(function(){
  window.__log=[]; window.__speaking=0; window.__recDuringSpeak=0;
  window.__script=[{heard:true,text:'I like dogs'},{heard:false,text:'Thank you.'},{heard:false,text:''},{heard:true,text:'Yes I do'}];
  function patch(){
    if(typeof window.speak!=='function'||!window.MangoiVoice||!window.WarmupAutoTalk||!window.WarmupFaceTalk){return setTimeout(patch,30);}
    /* 목소리 — 화면의 speak 과 같은 신호(aiStart/aiDone)를 낸다. 얼굴 카드의 «말하는 중» 표시도 켠다 */
    window.speak=function(text,btn){ __log.push('speak:'+text); __speaking++;
      var w=document.getElementById('tavatar-wrap'); if(w) w.classList.add('speaking');
      _autoHook('aiStart');
      setTimeout(function(){ __speaking--; if(w) w.classList.remove('speaking'); __log.push('spoke'); if(!btn) _autoHook('aiDone'); },500); };
    window.sttSupported=function(){return false;};   // 녹음+Whisper 경로로 고정(가짜 마이크)
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
    if(u.pathname==='/api/warmup/chat'){let b={};try{b=JSON.parse(route.request().postData()||'{}');}catch{}
      if(b.student_input) sent.push(b.student_input);
      await route.fulfill({json:{ok:true,ai_response:'Nice! Do you have a dog?',answer_chips:['Yes, I do.','No, I don\'t.']}});return;}
    await route.fulfill({json:{ok:true}});});
  await page.goto(base+'/warmup.html?setup=0&diff=2&_nc='+Date.now());
  await page.waitForFunction(()=>window.__patched, null, {timeout:9000}).catch(()=>{});
  await page.waitForTimeout(2500);
  const modeBefore=await page.evaluate(()=>localStorage.getItem('mangoi_warmup_talk_mode'));

  const pre=await page.evaluate(()=>{const r=document.getElementById('tavatar-ring');
    return {badge:!!(r&&r.querySelector('.ftk-badge')),role:r&&r.getAttribute('role')};});
  ok(name+': 얼굴 카드에 입구 표시(▶)가 있다', pre.badge && pre.role==='button', JSON.stringify(pre));

  await page.evaluate(()=>{ __log.length=0; });
  await page.click('#tavatar-ring');
  await page.waitForTimeout(400);
  await page.screenshot({path:`/tmp/wftk-face-${w}.png`});
  const on=await page.evaluate(()=>{const f=document.getElementById('ftk'), r=document.getElementById('tavatar-ring');
    const rr=r.getBoundingClientRect(); const log=document.getElementById('log').getBoundingClientRect();
    const top=document.elementFromPoint(innerWidth/2, Math.min(innerHeight-120, Math.max(5,log.top+10)));
    const inp=document.getElementById('inp');
    return {on:f&&f.classList.contains('on'), inside:f&&f.contains(r), cover:rr.width*rr.height/(innerWidth*innerHeight),
      hid:!!(top&&f.contains(top)), ro:inp.readOnly, mode:localStorage.getItem('mangoi_warmup_talk_mode')};});
  ok(name+': 누르면 얼굴 화면이 켜지고 얼굴 카드가 그 안으로 옮겨진다', on.on && on.inside);
  ok(name+': 얼굴이 화면 대부분을 차지한다(≥ 90%)', on.cover>=0.9, (on.cover*100).toFixed(0)+'%');
  ok(name+': 대화창·버튼은 가려져 안 보인다(맨 위가 얼굴 화면)', on.hid);
  ok(name+': 입력칸은 읽기 전용(폰 키보드가 안 튀어나옴)', on.ro===true);
  ok(name+': 들어와 있는 동안은 «자동으로 말하기» 가 켜진다', on.mode==='auto', String(on.mode));
  if (!seen) {
    await page.waitForTimeout(1400);
    const pk=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
    ok(name+': 처음 들어온 기기는 판이 저절로 한 번 올라와 «여기에 글이 있다» 를 보여 준다', /translateY\(0px\)/.test(pk), pk);
  } else {
    await page.waitForTimeout(700);
    const pk=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
    ok(name+': 이미 본 기기는 평소에 판이 닫혀 있다(짝)', !/translateY\(0px\)/.test(pk), pk);
  }

  // 듣기 → 보내기 → 대답 → (말 끝난 뒤) 다시 듣기 → 무음 = 지어낸 말 → 유리판 자동 열림
  await page.waitForFunction(()=>document.querySelectorAll('#ftkChips button').length>0, null, {timeout:12000}).catch(()=>{});
  const mid=await page.evaluate(()=>({log:__log.slice(),rds:__recDuringSpeak,
    tf:document.getElementById('ftkGlass').style.transform, chips:[...document.querySelectorAll('#ftkChips button')].map(b=>b.textContent),
    note:document.getElementById('ftkNote').textContent, teacher:document.getElementById('ftkTeacher').textContent,
    me:document.getElementById('ftkMe').textContent}));
  await page.waitForTimeout(600);             // 판이 올라오는 움직임(.4초)이 끝난 뒤 잰다
  await page.screenshot({path:`/tmp/wftk-open-${w}.png`});
  const vis=await page.evaluate(()=>[...document.querySelectorAll('#ftkChips button')].map(b=>{const r=b.getBoundingClientRect();
    const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.bottom<=innerHeight+1&&r.top>=0&&t===b;}));
  ok(name+': 열린 판의 대답 보기가 화면 안에서 실제로 눌린다(열렸다 ≠ 보인다)', vis.length>=2 && vis.every(Boolean), JSON.stringify(vis));
  // ⚠️ 첫 탭은 «소리 허용» 제스처라, 막혔던 첫 인사를 화면이 다시 읽어 줄 수 있다(unlockAudio) — 그러면 그 «뒤» 에 듣는다
  const iRec=mid.log.indexOf('rec'), iSpk=mid.log.findIndex(x=>x==='speak:Nice! Do you have a dog?');
  const iSpoke=mid.log.indexOf('spoke',iSpk), iRec2=mid.log.indexOf('rec',iSpk);
  const pre1=mid.log.slice(0,iRec), greetOk=pre1.filter(x=>x.startsWith('speak:')).length===pre1.filter(x=>x==='spoke').length;
  ok(name+': 누르면 저절로 듣기 시작한다(🎤 를 안 눌러도 · 인사가 있으면 끝난 뒤)', iRec>=0 && greetOk, mid.log.slice(0,4).join(' | '));
  ok(name+': 학생 말을 보낸다', sent[0]==='I like dogs', JSON.stringify(sent));
  ok(name+': 선생님 대답을 읽는다', iSpk>0);
  ok(name+': 대답이 «끝난 뒤» 에 다시 듣는다', iSpoke>iSpk && iRec2>iSpoke, mid.log.join(' | '));
  ok(name+': 말하는 동안에는 한 번도 녹음하지 않는다', mid.rds===0, 'recDuringSpeak='+mid.rds);
  ok(name+': 무음에서 지어낸 말("Thank you.")은 보내지 않는다', !sent.some(s=>/thank you/i.test(s)), sent.join(' / '));
  ok(name+': 막히면 유리판이 «저절로» 열린다', /translateY\(0px\)/.test(mid.tf), mid.tf);
  ok(name+': 열린 판에 선생님 말·내 말·대답 보기가 있다', /Do you have a dog/.test(mid.teacher) && /I like dogs/.test(mid.me) && mid.chips.length>=2, JSON.stringify(mid.chips));
  ok(name+': 대답 보기는 화면이 서버에서 받은 것 그대로', mid.chips.includes('Yes, I do.'), JSON.stringify(mid.chips));

  await page.waitForFunction(()=>document.getElementById('ftk').getAttribute('data-s')==='pause', null, {timeout:9000}).catch(()=>{});
  const p=await page.evaluate(()=>({s:document.getElementById('ftk').getAttribute('data-s'),recs:__log.filter(x=>x==='rec').length}));
  ok(name+': 두 번 못 들으면 쉬기(마이크 끔)', p.s==='pause', 'state='+p.s+' recs='+p.recs);
  await page.waitForTimeout(2500);
  const p2=await page.evaluate(()=>__log.filter(x=>x==='rec').length);
  ok(name+': 쉬는 동안에는 더 녹음하지 않는다', p2===p.recs, p.recs+'→'+p2);

  await page.mouse.click(w/2, h*0.3);
  await page.waitForTimeout(2000);
  const r2=await page.evaluate(()=>__log.filter(x=>x==='rec').length);
  ok(name+': 쉬는 중 얼굴을 누르면 다시 듣는다', r2>p2, p2+'→'+r2);
  ok(name+': 다시 말한 것도 보낸다', sent.includes('Yes I do'), sent.join(' / '));

  const before=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
  await page.click('#ftkGrab');
  await page.waitForTimeout(500);
  const after=await page.evaluate(()=>document.getElementById('ftkGlass').style.transform);
  ok(name+': 손잡이를 한 번 탭하면 판이 열리고 닫힌다', before!==after, before+' → '+after);

  await page.click('#ftkX');
  await page.waitForTimeout(500);
  const off=await page.evaluate(()=>{const f=document.getElementById('ftk'), r=document.getElementById('tavatar-ring');
    const inp=document.getElementById('inp');
    return {off:!f.classList.contains('on'), home:r.parentNode&&r.parentNode.id==='tavatar-wrap', ro:inp.readOnly,
      mode:localStorage.getItem('mangoi_warmup_talk_mode'), ov:document.documentElement.style.overflow};});
  ok(name+': ✕ 를 누르면 원래 화면으로 돌아오고 얼굴이 제자리로 간다', off.off && off.home, JSON.stringify(off));
  ok(name+': 입력칸이 다시 쓸 수 있게 된다', off.ro===false);
  ok(name+': «말하는 방법» 이 들어오기 전 그대로(저장값을 바꿔 두지 않음)', off.mode===modeBefore, modeBefore+' → '+off.mode);
  ok(name+': 페이지 스크롤 잠금이 풀린다', off.ov==='');
  const errsReal=errs.filter(e=>!/ResizeObserver|NotSupportedError|play\(\)/.test(e));
  ok(name+': 스크립트 오류 없음', errsReal.length===0, errsReal.slice(0,3).join(' | '));
  await ctx.close();
}

// 화상수업 안(iframe)에서는 입구가 없다 — 자동 말하기가 거기서 꺼져 있는 것과 같은 이유
{
  console.log('▶ 수업 안(iframe)');
  const ctx=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await ctx.newPage();
  await page.route('**/api/**',r=>r.fulfill({json:{ok:true,ai_response:'Hi!'}}));
  await page.setContent(`<iframe id="f" src="${base}/warmup.html?setup=0&diff=2" style="width:900px;height:700px"></iframe>`);
  await page.waitForTimeout(3500);
  const fr=page.frames().find(f=>f.url().includes('warmup.html'));
  const b=fr?await fr.evaluate(()=>{const r=document.getElementById('tavatar-ring');return {badge:!!(r&&r.querySelector('.ftk-badge')),ready:!!window.WarmupFaceTalk};}):null;
  ok('수업 안: 얼굴 입구 표시가 없다', b && b.ready && !b.badge, JSON.stringify(b));
  await ctx.close();
}

await browser.close(); srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
