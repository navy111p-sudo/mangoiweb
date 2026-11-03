// -*- coding: utf-8 -*-
// 📱 A.i 말하기 연습 — 휴대폰 «위쪽 버튼 한 줄» (2026-11-03 사장님 선택: 세로 B · 가로 C)
//   짝: cloudflare-deploy/public/js/warmup-topbar.js · css/warmup-topbar.css
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/warmup-topbar-browser.mjs
//   ⚠️ 문자열 하니스로는 «한 줄인가 · 무엇이 보이는가 · 되돌아오는가» 를 못 봅니다 — 그래서 브라우저로 잽니다.
//   짝으로 둡니다: «휴대폰에서는 한 줄로 바뀐다» 옆에 «PC 는 한 픽셀도 그대로다» 와
//   «화면을 돌렸다 돌아오면 DOM 이 원래 자리로 돌아온다» (없으면 «전부 옮겨 놓고 안 돌려놓기» 도 통과).
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
const browser=await chromium.launch({executablePath:exe});
const AI="You're optimistic about their chances! Who's your favorite player on the team?";

async function open(w,h,touch,en,withoutTopbar){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch});
  const page=await ctx.newPage();
  const cdp=await ctx.newCDPSession(page);
  // hasTouch 만으로는 (hover:none)(pointer:coarse) 가 안 켜진다 — 미디어 기능을 직접 흉내낸다
  await cdp.send('Emulation.setEmulatedMedia',{features:touch?[{name:'hover',value:'none'},{name:'pointer',value:'coarse'},{name:'any-hover',value:'none'},{name:'any-pointer',value:'coarse'}]:[{name:'hover',value:'hover'},{name:'pointer',value:'fine'}]});
  await page.addInitScript((en)=>{try{if(!sessionStorage.getItem('__t')){sessionStorage.setItem('__t','1');localStorage.clear();if(en)localStorage.setItem('mangoi_lang','en');}}catch(e){}},!!en);
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(withoutTopbar&&/\/warmup-topbar\.(js|css)$/.test(u.pathname)){await route.abort();return;}   // 짝 비교용: 이 기능을 뺀 화면
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    if(u.pathname==='/api/warmup/chat'){await route.fulfill({json:{ai_response:AI}});return;}
    if(u.pathname==='/api/voice/tts'){await route.fulfill({status:503,body:''});return;}
    await route.fulfill({json:{ok:true}});});
  await page.goto(base+'/warmup.html?setup=0&_nc='+Date.now());
  await page.waitForTimeout(2200);
  await page.evaluate((ai)=>{try{addMsg('I like soccer.','me');addMsg(ai,'ai');}catch(e){}
    try{document.getElementById('comboChip').style.display='';document.getElementById('comboN').textContent='4';}catch(e){}},AI);
  await page.waitForTimeout(300);
  return {ctx,page,errs};
}
// 화면 배치 수치 — 머리글 높이, 한 줄에 든 버튼, 마지막 AI 말풍선이 가려지지 않았는가
const measure=page=>page.evaluate((ai)=>{
  const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
  const vis=el=>!!el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&el.getBoundingClientRect().height>0;
  const top=document.querySelector('.top');
  const ids=['wfAskOpen','wfPreferencesOpen','wfExpandOpen','wgHistory','wgHelpOpen','setupBtn','menuBtn'];
  const row={};ids.forEach(id=>{const e=document.getElementById(id);row[id]=vis(e)?R(e):null;});
  const lm=[...document.querySelectorAll('#log .msg.ai')].find(x=>x.textContent.includes(ai.slice(0,20)));
  const lr=R(lm);let seen=false;
  if(lr){const t=document.elementFromPoint(lr.l+Math.min(lr.w/2,120),Math.min(lr.t+24,lr.b-4));seen=!!(t&&lm.contains(t));}
  return {mode:window.WarmupTopbar?WarmupTopbar.mode():'(없음)',cls:document.documentElement.className,
    docW:document.documentElement.scrollWidth,innerW:innerWidth,top:R(top),row,seen,
    ring:R(document.getElementById('tavatar-ring')),lr};
},AI);
// DOM 순서 서명 — 옮겼다 되돌린 뒤 처음과 같아야 한다
const sig=page=>page.evaluate(()=>{const n=e=>e.nodeType===1?(e.id||e.className||e.tagName):null;
  const pick=s=>{const e=document.querySelector(s);return e?[...e.childNodes].map(n).filter(Boolean):null;};
  return JSON.stringify({top:pick('.top'),wrap:pick('.wrap'),conv:pick('.wg-conversation'),head:pick('.wg-header'),menu:pick('#menuPanel .menu-scroll')});});

// ① 크기별 배치 — [폭, 높이, 터치?, 이름, 기대 모드]
const SIZES=[[390,844,true,'폰 세로','p'],[360,780,false,'좁은 PC 창 세로(마우스)','p'],[320,568,false,'아주 작은 세로','p'],
  [844,390,true,'폰 가로','l'],[667,375,true,'작은 폰 가로','l'],[800,360,false,'낮은 PC 창(마우스)','l'],
  [1024,768,true,'태블릿 가로',''],[1280,800,false,'PC 1280','']];
for(const [w,h,touch,name,want] of SIZES){
  const {ctx,page,errs}=await open(w,h,touch);
  const m=await measure(page);
  console.log(`▶ ${name} ${w}x${h} — 모드=${m.mode||'꺼짐'} · 머리글 ${Math.round(m.top.h)}px`);
  ok(name+': 모드', m.mode===want, m.mode);
  ok(name+': 가로로 안 넘친다', m.docW<=m.innerW+1, m.docW+' / '+m.innerW);
  ok(name+': 스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
  if(want){
    const btns=Object.values(m.row).filter(Boolean);
    const midY=m.top.t+m.top.h/2;
    ok(name+': 머리글이 한 줄(40px 이하)', m.top.h<=40, Math.round(m.top.h)+'px');
    ok(name+': 보이는 버튼이 전부 머리글 한 줄 안', btns.length>=5&&btns.every(b=>b.t>=m.top.t-1&&b.b<=m.top.b+1&&Math.abs((b.t+b.h/2)-midY)<=4), btns.length+'개');
    ok(name+': 마지막 AI 말풍선이 가려지지 않는다', m.seen);
    if(touch) ok(name+': 터치 기기는 이전 대화·도움 줄이 감춰진다(아래 💡 도움에 있다)', !m.row.wgHistory&&!m.row.wgHelpOpen);
    else ok(name+': 마우스는 이전 대화·도움이 한 줄에 있다', !!m.row.wgHistory&&!!m.row.wgHelpOpen);
  }
  if(want==='l'){
    ok(name+': 얼굴이 대화 왼쪽에 보인다', m.ring&&m.lr&&m.ring.r<=m.lr.l&&m.ring.t>=m.top.b-2&&m.ring.b<=h, JSON.stringify(m.ring&&[m.ring.l,m.ring.t,m.ring.w,m.ring.h]));
  }
  if(!want) ok(name+': 휴대폰 클래스가 안 붙는다', !/wu-tb/.test(m.cls), m.cls);
  await ctx.close();
}

// ② 짝: PC·태블릿은 그대로 — 이 기능(js·css)을 뺀 화면과 위치·크기가 한 픽셀도 다르지 않아야 한다
const boxes=page=>page.evaluate(()=>['.top','.meta','#wfTools','.wg-history-bar','.wg-progress','#wfStage','#menuBtn'].map(s=>{
  const e=document.querySelector(s);if(!e)return s+':없음';const r=e.getBoundingClientRect();return s+':'+[r.left,r.top,r.width,r.height].map(Math.round).join(',');}).join(' '));
for(const [w,h,touch,name] of [[1280,800,false,'PC 1280'],[1024,768,true,'태블릿 가로']]){
  const a=await open(w,h,touch);const on=await boxes(a.page);await a.ctx.close();
  const b=await open(w,h,touch,false,true);const off=await boxes(b.page);await b.ctx.close();
  console.log('▶ '+name+' 그대로(기능 뺀 화면과 비교)');
  ok(name+': 머리글·칩·도구·대화 위치가 기능을 뺀 화면과 같다', on===off, on===off?'':'\n    켬 '+on+'\n    끔 '+off);
}

// ③ 회전: PC → 세로 → 가로 → PC — DOM 이 처음 자리로 돌아온다
{ const {ctx,page,errs}=await open(1280,800,false);
  const s0=await sig(page);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  const p=await page.evaluate(()=>({m:WarmupTopbar.mode(),quick:document.getElementById('wuTbQuick').children.length,slot:[...document.getElementById('wuTbSlot').children].map(e=>e.id||e.className)}));
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);
  const l=await page.evaluate(()=>({m:WarmupTopbar.mode(),quick:document.getElementById('wuTbQuick').children.length,home:!!document.querySelector('.top > .back.home')}));
  await page.setViewportSize({width:1280,height:800});await page.waitForTimeout(300);
  const s1=await sig(page);
  console.log('▶ 화면 돌리기');
  ok('세로: 빠른 줄 4개(모드 선택·홈·새 대화·소리)', p.m==='p'&&p.quick===4, JSON.stringify(p));
  ok('세로: 한 줄 칸에 칩·도구·이전/도움', JSON.stringify(p.slot)==='["meta","wfTools","wg-history-bar"]', JSON.stringify(p.slot));
  ok('가로: 빠른 줄은 비고 🏠 는 머리글로 돌아감', l.m==='l'&&l.quick===0&&l.home, JSON.stringify(l));
  ok('PC 로 돌아오면 DOM 순서가 처음과 같다', s0===s1, s0===s1?'':'\n    '+s0+'\n    '+s1);
  ok('스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
  await ctx.close(); }

// ④ 가로 숨기기·보이기
{ const {ctx,page,errs}=await open(844,390,true);
  const y0=await page.evaluate(()=>document.getElementById('wfStage').getBoundingClientRect().top);
  await page.click('#wuTbHide');await page.waitForTimeout(400);
  const hid=await page.evaluate(()=>{const s=document.getElementById('wuTbShow');const r=s.getBoundingClientRect();
    return {vis:getComputedStyle(document.querySelector('.top')).visibility,show:getComputedStyle(s).display,showTop:Math.round(r.top),
      y:document.getElementById('wfStage').getBoundingClientRect().top,stored:localStorage.getItem('mangoi_warmup_topbar_hidden'),focus:document.activeElement&&document.activeElement.id};});
  await page.click('#wuTbShow');await page.waitForTimeout(400);
  const back=await page.evaluate(()=>({vis:getComputedStyle(document.querySelector('.top')).visibility,show:getComputedStyle(document.getElementById('wuTbShow')).display,focus:document.activeElement&&document.activeElement.id}));
  await page.click('#menuBtn');await page.waitForTimeout(200);
  const mo=await page.evaluate(()=>document.getElementById('menuPanel').classList.contains('open'));
  await page.evaluate(()=>document.getElementById('wuTbHide').click());await page.waitForTimeout(200);
  const mc=await page.evaluate(()=>document.getElementById('menuPanel').classList.contains('open'));
  console.log('▶ 가로 숨기기');
  ok('⌃ 누르면 머리글이 숨는다', hid.vis==='hidden', hid.vis);
  ok('위 가운데 «메뉴» 손잡이가 보인다', hid.show!=='none'&&hid.showTop===0, hid.show+' @'+hid.showTop);
  ok('대화 영역이 위로 올라온다', hid.y<y0, y0+' → '+hid.y);
  ok('숨김 상태를 이 기기에 기억한다', hid.stored==='1');
  ok('초점: 숨기면 손잡이로, 보이면 ⌃ 로', hid.focus==='wuTbShow'&&back.focus==='wuTbHide', hid.focus+' / '+back.focus);
  ok('손잡이 누르면 다시 보인다', back.vis==='visible'&&back.show==='none', JSON.stringify(back));
  ok('메뉴가 열린 채 숨기면 메뉴도 닫힌다', mo&&!mc, mo+' → '+mc);
  ok('스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
  await ctx.close(); }

// ⑤ 세로 ⋮ 메뉴(진행 문구 + 빠른 줄) — 한국어/영어
for(const en of [false,true]){
  const {ctx,page,errs}=await open(390,844,true,en);
  await page.click('#menuBtn');await page.waitForTimeout(400);
  const m=await page.evaluate(()=>{const vis=e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0;
    const onTop=e=>{const r=e.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!t&&e.contains(t);};
    return {prog:vis(document.querySelector('#wuTbMenu .wg-progress')),
      items:[...document.getElementById('wuTbQuick').children].filter(vis).map(e=>({cap:e.getAttribute('data-wu-cap'),top:onTop(e)})),
      titles:[...document.querySelectorAll('#wuTbSlot .wf-button')].map(b=>b.title)};});
  console.log('▶ 세로 ⋮ 메뉴'+(en?' (EN)':' (KO)'));
  ok('진행 문구가 메뉴 맨 위에 보인다', m.prog);
  ok('빠른 줄 버튼이 보이고 눌린다', m.items.length>=3&&m.items.every(i=>i.top), JSON.stringify(m.items));
  ok('아이콘 버튼 툴팁이 지금 언어', m.titles[0]===(en?'Ask a question':'질문하기'), JSON.stringify(m.titles));
  ok('빠른 줄 이름표가 지금 언어', m.items.some(i=>i.cap===(en?'Home':'홈')), JSON.stringify(m.items.map(i=>i.cap)));
  ok('스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
  await ctx.close();
}

// ⑥ 옮긴 버튼이 원래 일을 그대로 한다
{ const {ctx,page,errs}=await open(360,780,false);
  await page.click('#wfAskOpen');await page.waitForTimeout(300);
  const a=await page.evaluate(()=>document.getElementById('wfAsk').open);
  await page.keyboard.press('Escape');await page.waitForTimeout(200);
  await page.click('#wgHistory');await page.waitForTimeout(200);
  const h=await page.evaluate(()=>document.getElementById('wgHistory').getAttribute('aria-expanded'));
  console.log('▶ 옮긴 버튼 동작');
  ok('질문하기 아이콘 → 질문 패널이 열린다', a===true);
  ok('이전 대화 아이콘 → 펼쳐진다', h==='true', h);
  ok('스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
  await ctx.close(); }

console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();srv.close();
process.exit(fail?1:0);
