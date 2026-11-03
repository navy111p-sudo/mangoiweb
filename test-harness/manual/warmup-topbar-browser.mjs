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
// 누르기: 다른 것이 덮어 못 누르면 하니스가 죽지 않고 «깔끔한 FAIL» 로 남긴다(30초 타임아웃 크래시는 ❌ 0건으로 위장한다)
const tap=async(page,sel)=>{try{await page.click(sel,{timeout:3000});return true;}catch(e){ok(sel+' 를 누를 수 있다(다른 요소가 덮지 않는다)',false,String(e.message||e).split('\n').find(l=>/intercepts/.test(l))||String(e.message||e).slice(0,120));return false;}};
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
  await tap(page,'#wuTbHide');await page.waitForTimeout(400);
  const hid=await page.evaluate(()=>{const s=document.getElementById('wuTbShow');const r=s.getBoundingClientRect();
    return {vis:getComputedStyle(document.querySelector('.top')).visibility,show:getComputedStyle(s).display,showTop:Math.round(r.top),
      y:document.getElementById('wfStage').getBoundingClientRect().top,stored:localStorage.getItem('mangoi_warmup_topbar_hidden'),focus:document.activeElement&&document.activeElement.id};});
  await tap(page,'#wuTbShow');await page.waitForTimeout(400);
  const back=await page.evaluate(()=>({vis:getComputedStyle(document.querySelector('.top')).visibility,show:getComputedStyle(document.getElementById('wuTbShow')).display,focus:document.activeElement&&document.activeElement.id}));
  await tap(page,'#menuBtn');await page.waitForTimeout(200);
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
  await tap(page,'#menuBtn');await page.waitForTimeout(400);
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
  await tap(page,'#wfAskOpen');await page.waitForTimeout(300);
  const a=await page.evaluate(()=>document.getElementById('wfAsk').open);
  await page.keyboard.press('Escape');await page.waitForTimeout(200);
  await tap(page,'#wgHistory');await page.waitForTimeout(200);
  const h=await page.evaluate(()=>document.getElementById('wgHistory').getAttribute('aria-expanded'));
  console.log('▶ 옮긴 버튼 동작');
  ok('질문하기 아이콘 → 질문 패널이 열린다', a===true);
  ok('이전 대화 아이콘 → 펼쳐진다', h==='true', h);
  ok('스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
  await ctx.close(); }

// ⑦ 가로: 도구 버튼에 짧은 글자 (2026-11-03 사장님 «가로 화면 도구 버튼에 글자도 넣어줘»)
//    짝으로 둔다: «세로는 그대로 아이콘만» · «한 줄에 안 들어가면 단계적으로 줄고, 그때 칸이 넘치지 않는다»
//    · «자리가 돌아오면 다시 글자가 붙는다» · «화면낭독기 이름은 원래 긴 이름 그대로(짧은 글자가 안 덧붙는다)».
//    기대 글자는 하니스에 베끼지 않고 js 의 LABELS 표에서 읽는다.
{ const src=await readFile(join(root,'js/warmup-topbar.js'),'utf8');
  const LBL={};for(const m of src.matchAll(/^\s*(wf\w+|wg\w+):\s*\['([^']+)',\s*'([^']+)'\]/gm))LBL[m[1]]={ko:m[2],en:m[3]};
  const hist=/'대화 접기',\s*'([^']+)'\)\s*:\s*tr\('([^']+)',\s*'([^']+)'\)/.exec(src);
  ok('전제: LABELS 표를 소스에서 읽었다(질문·배경·크게·도움)', ['wfAskOpen','wfPreferencesOpen','wfExpandOpen','wgHelpOpen'].every(k=>LBL[k]), JSON.stringify(LBL));
  ok('전제: 이전 대화 글자(닫힘/열림)를 소스에서 읽었다', !!hist);
  const labels=page=>page.evaluate(()=>{const s=document.getElementById('wuTbSlot');
    const vis=e=>!!e&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;
    const strip=c=>{const m=/^"([^"]*)"/.exec(c||'');return m?m[1]:'';};   // '"질문" / ""' → 질문
    const tp=s.querySelector('.meta .chip.topic');
    return {mode:WarmupTopbar.mode(),steps:['wu-tb-cshort','wu-tb-hshort','wu-tb-iconly'].filter(c=>document.documentElement.classList.contains(c)),
      over:s.scrollWidth-s.clientWidth, topicSqueezed:!!tp&&tp.scrollWidth>tp.clientWidth+1&&tp.getBoundingClientRect().width<parseFloat(getComputedStyle(tp).maxWidth)-1,
      btns:Object.fromEntries([...s.querySelectorAll('.wf-button,.wg-btn')].filter(vis).map(b=>[b.id,{w:Math.round(b.getBoundingClientRect().width),lbl:strip(getComputedStyle(b,'::after').content)}]))};});
  // 7-1 폰 가로 KO/EN: 세 도구 버튼에 그 언어 글자, 한 줄에 들어감, 이름은 원래 이름 그대로
  for(const en of [false,true]){
    const {ctx,page,errs}=await open(844,390,true,en);
    const L=await labels(page);
    const name=await page.getByRole('button',{name:en?'Ask a question':'질문하기',exact:true}).count();
    const tag=en?'(EN)':'(KO)';
    console.log('▶ 가로 도구 버튼 글자 '+tag+' 844x390 — '+JSON.stringify(L.btns));
    for(const id of ['wfAskOpen','wfPreferencesOpen','wfExpandOpen']){
      const want=LBL[id]&&(en?LBL[id].en:LBL[id].ko);
      ok(tag+' '+id+' 에 글자 «'+want+'» 가 보인다', !!L.btns[id]&&L.btns[id].lbl===want&&L.btns[id].w>40, JSON.stringify(L.btns[id]));
    }
    ok(tag+' 줄이기 단계 없이 한 줄에 들어간다', L.steps.length===0&&L.over<=1, JSON.stringify(L.steps)+' over '+L.over);
    ok(tag+' 화면낭독기 이름은 원래 긴 이름 그대로(짧은 글자가 안 덧붙음)', name===1, String(name));
    ok(tag+' 스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
    await ctx.close();
  }
  // 7-2 짝: 세로는 그대로 아이콘만
  { const {ctx,page}=await open(390,844,true);const L=await labels(page);
    console.log('▶ 세로는 글자 없이 아이콘만');
    ok('세로: 도구 버튼에 글자가 안 붙는다(26px 아이콘)', Object.values(L.btns).length>=3&&Object.values(L.btns).every(b=>b.lbl===''&&b.w<=26), JSON.stringify(L.btns));
    await ctx.close(); }
  // 7-3 마우스 가로 800x360: 이전 대화·도움에도 글자, 이전 대화를 펼치면 글자가 바뀐다
  { const {ctx,page,errs}=await open(800,360,false);const L=await labels(page);
    console.log('▶ 마우스 가로 800x360 — '+JSON.stringify(L.steps));
    ok('800: 이전 대화·도움에도 글자', L.btns.wgHistory&&L.btns.wgHistory.lbl===(hist&&hist[2])&&L.btns.wgHelpOpen&&L.btns.wgHelpOpen.lbl===LBL.wgHelpOpen.ko, JSON.stringify([L.btns.wgHistory,L.btns.wgHelpOpen]));
    ok('800: 칸이 넘치지 않고 주제 칩도 안 눌린다', L.over<=1&&!L.topicSqueezed, 'over '+L.over+' squeezed '+L.topicSqueezed);
    await tap(page,'#wgHistory');await page.waitForTimeout(300);
    const L2=await labels(page);
    ok('800: 이전 대화를 펼치면 글자가 «대화 접기»', L2.btns.wgHistory&&L2.btns.wgHistory.lbl==='대화 접기', JSON.stringify(L2.btns.wgHistory));
    ok('800: 스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
    await ctx.close(); }
  // 7-4 좁은 마우스 가로 641x400(이전 대화 줄 + 콤보): 다 줄여 아이콘만, 칸은 안 넘친다 → 넓히면 글자가 돌아온다
  { const {ctx,page,errs}=await open(641,400,false);const L=await labels(page);
    console.log('▶ 좁은 가로 641x400 — '+JSON.stringify(L.steps));
    ok('641: 한 줄에 안 들어가 아이콘만으로 되돌아간다', L.steps.includes('wu-tb-iconly')&&Object.values(L.btns).every(b=>b.lbl===''&&b.w<=26), JSON.stringify(L.btns));
    ok('641: 그래도 칸이 넘치지 않고 주제 칩이 안 눌린다', L.over<=1&&!L.topicSqueezed, 'over '+L.over+' squeezed '+L.topicSqueezed);
    await page.setViewportSize({width:1024,height:500});await page.waitForTimeout(400);
    const L2=await labels(page);
    ok('창을 넓히면(1024x500, 아직 가로) 글자가 다시 붙는다', L2.mode==='l'&&L2.steps.length===0&&L2.btns.wfAskOpen&&L2.btns.wfAskOpen.lbl===LBL.wfAskOpen.ko, JSON.stringify(L2.steps)+' '+JSON.stringify(L2.btns.wfAskOpen));
    ok('641→1024: 스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
    await ctx.close(); }
  // 7-5 콤보 칩이 «나중에» 나타나면 다시 잰다(EN 667x375 — 콤보가 뜨면 콤보만 «🔥N» 으로 줄어든다)
  { const {ctx,page}=await open(667,375,true,true);
    await page.evaluate(()=>{document.getElementById('comboChip').style.display='none';});await page.waitForTimeout(200);
    const a=await labels(page);
    await page.evaluate(()=>{document.getElementById('comboChip').style.display='';document.getElementById('comboN').textContent='12';});await page.waitForTimeout(200);
    const b=await labels(page);
    console.log('▶ 콤보 칩이 나중에 뜰 때 — 전 '+JSON.stringify(a.steps)+' / 후 '+JSON.stringify(b.steps));
    ok('667(EN): 콤보 칩이 없을 때는 줄이기 없음', a.steps.length===0&&a.over<=1, JSON.stringify(a.steps));
    ok('667(EN): 콤보 칩이 뜨면 다시 재어 콤보만 줄인다(글자는 남음)', b.steps.length===1&&b.steps[0]==='wu-tb-cshort'&&b.over<=1&&!b.topicSqueezed&&b.btns.wfAskOpen&&b.btns.wfAskOpen.lbl===LBL.wfAskOpen.en, JSON.stringify(b));
    await ctx.close(); }
  // 7-6 🌐 언어를 바꾸면 글자도 바뀐다
  { const {ctx,page,errs}=await open(844,390,true);
    await page.evaluate(()=>{try{wuToggleUiLang();}catch(e){}});await page.waitForTimeout(300);
    const L=await labels(page);
    console.log('▶ 🌐 언어 전환');
    ok('KO→EN 전환 뒤 도구 버튼 글자가 영어', L.btns.wfAskOpen&&L.btns.wfAskOpen.lbl===LBL.wfAskOpen.en&&L.btns.wfExpandOpen&&L.btns.wfExpandOpen.lbl===LBL.wfExpandOpen.en, JSON.stringify(L.btns));
    ok('언어 전환: 스크립트 오류 없음', errs.length===0, errs.join(' | ').slice(0,200));
    await ctx.close(); }
}

console.log(`\n합계 PASS ${pass} / FAIL ${fail}`);
await browser.close();srv.close();
process.exit(fail?1:0);
