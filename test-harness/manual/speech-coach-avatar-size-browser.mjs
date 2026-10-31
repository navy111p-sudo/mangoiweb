// -*- coding: utf-8 -*-
// 👩‍🏫 발음 연습(speech-coach) 선생님 얼굴 크기 (웜업판·친구하기판과 짝) — PC·폰 폭별로 «크게 · 안 찌그러짐 · 채팅을 안 가림 · 대화창이 남음» 을 잰다.
//   (2026-09-23 사장님 「선생님 얼굴들을 가장 적합한 위치에 지금보다 크게」)
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/speech-coach-avatar-size-browser.mjs
//   ⚠️ 문자열 하니스로는 «몇 px 이고 무엇을 가리는가» 를 못 봅니다 — 그래서 브라우저로 잽니다.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);const b=await readFile(join(root,p==='/'?'index.html':p));s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe,args:['--autoplay-policy=no-user-gesture-required']});
// [폭, 높이, 최소 얼굴 폭, 이름]  — 옛 값: 폰 64 · 태블릿/노트북 136 · 1600↑ 272
// 옛 값: 폰 64 · 폰 가로 40 · PC 88. «최소 폭» 은 새 값에서 몇 px 여유를 둔 바닥이다.
// 옛 값: 폰 118 · 작은 폰 92 · PC 260(폰을 눕히면 화면을 넘어 잘림). 최소 폭은 새 값의 바닥.
const SIZES=[[390,844,145,'폰 세로'],[360,640,100,'작은 폰'],[844,390,50,'폰 가로'],[768,1024,255,'태블릿'],
  [1024,768,285,'작은 노트북'],[1280,800,325,'노트북 1280'],[1366,768,325,'노트북 1366'],[1440,900,325,'PC 1440'],[1920,1080,325,'PC 1920'],[412,780,125,'폰 중간']];
for(const [w,h,minW,name] of SIZES){
  const ctx=await browser.newContext({viewport:{width:w,height:h}});
  const page=await ctx.newPage();
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    if(u.pathname==='/api/warmup/chat'){await route.fulfill({json:{ai_response:'Hello! Do you like cats?'}});return;}
    if(u.pathname==='/api/voice/tts'){await route.fulfill({status:503,body:''});return;}
    await route.fulfill({json:{ok:true}});});
  await page.goto(base+'/speech-coach.html?x=1&_nc='+Date.now());
  await page.waitForTimeout(2500);
  // PC 2단(>640)은 얼굴 칸이 sticky(top 84) — 제목 아래에서 시작해 스크롤하면 위에 붙는다.
  // 그래서 «붙은 뒤» 화면 안에 다 들어오는가를 잰다(폰을 눕혀 세로가 짧을 때 잘리던 사고).
  if(w>640){ await page.evaluate(()=>{const r=document.getElementById('tavatar-ring').getBoundingClientRect();window.scrollBy(0,Math.max(0,r.top-60));}); await page.waitForTimeout(200); }
  const m=await page.evaluate(()=>{
    const R=e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
    const ring=document.getElementById('tavatar-ring'), log=document.querySelector('.rec-btn')||document.body, wrap=document.querySelector('.target-box')||document.body;
    const rr=R(ring), lr=R(log), wr=R(wrap);
    const top=document.elementFromPoint(rr.l+rr.w/2, rr.t+rr.h/2);
    const fixed=getComputedStyle(document.getElementById('tavatar-wrap')).position==='fixed';
    return {rr,lr,wr,fixed,onTop:!!(top&&ring.contains(top)),innerH:innerHeight,innerW:innerWidth};
  });
  console.log(`▶ ${name} ${w}x${h} — 얼굴 ${Math.round(m.rr.w)}x${Math.round(m.rr.h)} · ${m.fixed?'채팅 옆(고정)':'채팅 위'} · 녹음 버튼 바닥 ${Math.round(m.lr.b)}`);
  ok(name+': 얼굴 폭 ≥ '+minW, m.rr.w>=minW, Math.round(m.rr.w)+'px');
  ok(name+': 4:5 비율 유지(찌그러짐 없음)', Math.abs(m.rr.h/m.rr.w-1.25)<0.03, (m.rr.h/m.rr.w).toFixed(3));
  ok(name+': 얼굴이 화면 안', m.rr.t>=0 && m.rr.b<=m.innerH+1 && m.rr.l>=0 && m.rr.r<=m.innerW+1);
  ok(name+': 얼굴 가운데가 맨 위(안 가려짐)', m.onTop);
  ok(name+': 얼굴이 문장 카드를 안 가림(옆이나 위에 놓임)', m.rr.r<=m.wr.l-8 || m.rr.b<=m.wr.t+1, `얼굴 ${Math.round(m.rr.l)}~${Math.round(m.rr.r)}/${Math.round(m.rr.b)} · 카드 왼쪽 ${Math.round(m.wr.l)} 위 ${Math.round(m.wr.t)}`);
  const wraps=await page.evaluate(()=>{const n=e=>{if(!e)return 0;const lh=parseFloat(getComputedStyle(e).lineHeight)||parseFloat(getComputedStyle(e).fontSize)*1.4;return Math.round(e.getBoundingClientRect().height/lh);};return {st:n(document.querySelector('#tavatar-status .ts-idle')),pg:n(null)};});
  ok(name+': 얼굴 밑 상태 글자가 한 줄', wraps.st<=1 && wraps.pg<=1, JSON.stringify(wraps));
  if(w<=640) ok(name+': 폰은 녹음 버튼까지 스크롤 없이 한 화면(바닥 ≤ 화면 높이)', m.lr.b<=m.innerH+1, `녹음 버튼 바닥 ${Math.round(m.lr.b)} / ${m.innerH}`);
  await page.screenshot({path:`/tmp/claude-0/-home-user-mangoiweb/11708116-d8f5-581d-b17e-b8e1f5a4c520/scratchpad/sc-${w}x${h}.png`});
  await ctx.close();
}
await browser.close();srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);process.exit(fail?1:0);
