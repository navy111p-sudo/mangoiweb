// -*- coding: utf-8 -*-
// 📱 A.i 말하기 연습 — 휴대폰·태블릿(터치)에서 입력 묶음이 대화창을 가리지 않는가 (2026-09-25 · A+C 중간안)
//   사장님 「1번(입력 묶음)이 너무 커서 2번(선생님이 방금 한 말)이 안 보여」 → 시안 A+C 로 결정,
//   「휴대폰과 테블릿에서만 적용해줘. 가로 세로 모두」.
//   자동으로 안 돕니다 — 사람이 부릅니다:
//     PW_DIR=/tmp/pw node test-harness/manual/warmup-touch-compact-browser.mjs
//   ⚠️ 문자열 하니스로는 «몇 px 이고 무엇이 보이는가» 를 못 봅니다 — 그래서 브라우저로 잽니다.
//   짝: «터치 기기에서는 줄어든다» 옆에 «마우스 PC 는 그대로다» 를 둡니다(없으면 «전부 줄이기» 도 통과).
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireBrowser} from './_pw.mjs';
const root=join(dirname(fileURLToPath(import.meta.url)),'../../cloudflare-deploy/public');
const SRC=process.env.WARMUP_SRC||'';   // 변이시험용: 고친 사본을 가리킨다(저장소 파일을 안 건드림)
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.webm':'video/webm','.mp4':'video/mp4','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const srv=createServer(async(q,s)=>{try{const p=decodeURIComponent(new URL(q.url,'http://x').pathname);
  const f=(SRC&&p==='/warmup.html')?SRC:join(root,p==='/'?'index.html':p);
  const b=await readFile(f);s.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream','cache-control':'no-store'});s.end(b);}catch{s.writeHead(404);s.end();}});
await new Promise(r=>srv.listen(0,r));const base='http://127.0.0.1:'+srv.address().port;
const {chromium,exe}=requireBrowser();
let pass=0,fail=0;const ok=(n,c,d)=>{if(c){pass++;console.log('  ✅ '+n+(d?'  '+d:''));}else{fail++;console.log('  ❌ FAIL '+n+(d?'  '+d:''));}};
const browser=await chromium.launch({executablePath:exe,args:['--autoplay-policy=no-user-gesture-required']});
// [폭, 높이, 터치?, 이름]
const SIZES=[[390,844,true,'폰 세로'],[360,640,true,'작은 폰 세로'],[844,390,true,'폰 가로'],
  [768,1024,true,'태블릿 세로'],[1024,768,true,'태블릿 가로'],
  [1280,800,false,'PC(마우스) 1280'],[390,844,false,'좁은 PC 창(마우스)']];
const ZH=['你好！今天我们聊聊电影吧。','在家看很舒服！你喜欢看什么电影？','你觉得看电影最好是在哪里看？'];
for(const [w,h,touch,name] of SIZES){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch});
  const page=await ctx.newPage();
  const cdp=await ctx.newCDPSession(page);
  // hasTouch 만으로는 (hover:none)(pointer:coarse) 가 안 켜진다 — 미디어 기능을 직접 흉내낸다
  await cdp.send('Emulation.setEmulatedMedia',{features:touch?[{name:'hover',value:'none'},{name:'pointer',value:'coarse'},{name:'any-hover',value:'none'},{name:'any-pointer',value:'coarse'}]:[{name:'hover',value:'hover'},{name:'pointer',value:'fine'}]});
  await page.addInitScript(()=>{try{if(!sessionStorage.getItem('__t')){sessionStorage.setItem('__t','1');localStorage.clear();
    localStorage.setItem('mangoi_warmup_lang','zh');localStorage.setItem('mangoi_warmup_talk_mode','auto');}}catch(e){}});
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base){await route.abort();return;}
    if(!u.pathname.startsWith('/api/')){await route.continue();return;}
    if(u.pathname==='/api/warmup/chat'){await route.fulfill({json:{ai_response:ZH[0]}});return;}
    if(u.pathname==='/api/voice/tts'){await route.fulfill({status:503,body:''});return;}
    await route.fulfill({json:{ok:true}});});
  await page.goto(base+'/warmup.html?setup=0&_nc='+Date.now());
  await page.waitForTimeout(2500);
  // 대화 몇 줄 + «듣는 중» 상태를 만든다(사장님 캡처와 같은 상태)
  await page.evaluate((zh)=>{
    const add=(t,who)=>{try{addMsg(t,who);}catch(e){}};
    add('我喜欢在家看电影。','me'); add(zh[1],'ai'); add('我喜欢看动画片。','me'); add(zh[2],'ai');
    try{window.WarmupAutoTalk._state.session=true;}catch(e){}
    try{setMicState(true);}catch(e){}
    try{_setListenLabel('🎙️ 지금 말해보세요! 천천히 해도 괜찮아요');}catch(e){}
    const ws=document.getElementById('wgWorkspace'); if(ws) ws.scrollTop=ws.scrollHeight;
  },ZH);
  await page.waitForTimeout(400);
  const m=await page.evaluate((last)=>{
    const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
    const comp=R(document.querySelector('.wg-composer')), ws=R(document.getElementById('wgWorkspace')), ring=R(document.getElementById('tavatar-ring'));
    const msgs=[...document.querySelectorAll('#log .msg.ai')]; const lm=msgs.find(x=>x.textContent.includes(last))||msgs[msgs.length-1];
    const lr=R(lm);
    // 마지막 선생님 말의 «글자» 가 보이는가 — 그 줄 가운데의 맨 위 요소가 그 말풍선인가
    const cx=lr?lr.l+Math.min(lr.w/2,120):0, cy=lr?Math.min(lr.t+lr.h/2,lr.b-4):0;
    const top=lr?document.elementFromPoint(cx,cy):null;
    const vis=el=>!!el&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0;
    const touch=matchMedia('(hover:none) and (pointer:coarse)').matches;
    const stopBtn=document.getElementById('micBtn'); const sr=R(stopBtn);
    const stopTop=sr?document.elementFromPoint(sr.l+sr.w/2,sr.t+sr.h/2):null;
    const sw=document.getElementById('talkSwitch'), swr=R(sw);
    return {touch,comp,ws,ring,lr,lastSeen:!!(top&&lm&&lm.contains(top)),innerH:innerHeight,innerW:innerWidth,
      stVis:vis(document.getElementById('wgState')),listenVis:vis(document.getElementById('listening')),
      pillVis:vis(document.getElementById('autoTalkPill')),hintVis:vis(document.querySelector('.hint')),
      swVis:vis(sw), swH:swr?swr.h:0, stopOk:!!(stopTop&&stopBtn.contains(stopTop)),
      docW:document.documentElement.scrollWidth};
  },ZH[2]);
  console.log(`▶ ${name} ${w}x${h} — 터치=${m.touch} · 입력묶음 ${Math.round(m.comp.h)}px · 대화칸 ${Math.round(m.ws.h)}px · 얼굴 ${Math.round(m.ring.w)}px`);
  ok(name+': 미디어 흉내가 먹었다(전제)', m.touch===touch);
  ok(name+': 가로로 안 넘친다', m.docW<=m.innerW+1, m.docW+' / '+m.innerW);
  ok(name+': ⏹ 멈추기 버튼이 보이고 눌린다', m.stopOk);
  ok(name+': 「말하는 방법」 스위치가 보인다', m.swVis);
  if(touch){
    ok(name+': 방금 선생님이 한 말이 보인다', m.lastSeen && m.lr.b<=m.comp.t+1, m.lr?`말 아래 ${Math.round(m.lr.b)} · 입력 위 ${Math.round(m.comp.t)}`:'없음');
    ok(name+': 입력 묶음이 화면의 35% 이하', m.comp.h<=m.innerH*0.35, Math.round(m.comp.h)+' / '+m.innerH);
    ok(name+': 같은 «듣는 중» 안내가 한 번만(wgState·자동 알약 감춤)', m.listenVis && !m.stVis && !m.pillVis);
    ok(name+': 대화 뒤에는 사용법 줄을 감춘다', !m.hintVis);
    ok(name+': 얼굴이 56px(눕힌 폰 40px) 로 줄었다', Math.abs(m.ring.w-(h<=520?40:56))<=2, Math.round(m.ring.w)+'px');
    ok(name+': 스위치가 한 줄(≤ 40px)', m.swH<=40, Math.round(m.swH)+'px');
  }else{
    ok(name+': 마우스 PC 는 예전 그대로 — 얼굴을 안 줄인다', m.ring.w>60, Math.round(m.ring.w)+'px');
    ok(name+': 마우스 PC 는 예전 그대로 — 안내 줄을 안 감춘다', m.stVis && m.hintVis);
  }
  await page.screenshot({path:`${process.env.SHOT_DIR||'/tmp'}/touch-${w}x${h}-${touch?'t':'m'}.png`});
  await ctx.close();
}
await browser.close();srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);process.exit(fail?1:0);
