// -*- coding: utf-8 -*-
// 📱 A.i 말하기 연습 — 휴대폰·태블릿(터치) «아래 3칸 바» (2026-09-26 · 시안 4, 2026-09-25 A+C 중간안을 대체)
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
    const vis=el=>!!el&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0;
    const onTop=el=>{if(!vis(el))return false;const r=el.getBoundingClientRect();const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!t&&el.contains(t);};
    const msgs=[...document.querySelectorAll('#log .msg.ai')]; const lm=msgs.find(x=>x.textContent.includes(last))||msgs[msgs.length-1];
    const lr=R(lm); const cx=lr?lr.l+Math.min(lr.w/2,120):0, cy=lr?Math.min(lr.t+lr.h/2,lr.b-4):0;
    const top=lr?document.elementFromPoint(cx,cy):null;
    const bar=document.getElementById('tbBar'), sw=document.getElementById('talkSwitch');
    const swBtns=sw?[...sw.querySelectorAll('button')]:[];
    return {touch:matchMedia('(hover:none) and (pointer:coarse)').matches, innerH:innerHeight, innerW:innerWidth,
      docW:document.documentElement.scrollWidth, lr, lastSeen:!!(top&&lm&&lm.contains(top)),
      comp:R(document.querySelector('.wg-composer')), ring:R(document.getElementById('tavatar-ring')), bar:R(bar), hasBar:!!bar,
      swInBar:!!(bar&&sw&&bar.contains(sw)), swVis:vis(sw), swBtnH:Math.min(...swBtns.map(b=>b.getBoundingClientRect().height),999),
      swBtnsTop:swBtns.length===2&&swBtns.every(onTop), swLbl:vis(sw&&sw.querySelector('.ts-lbl')),
      tabsTop:['tbHelp','tbMic','tbType'].map(id=>onTop(document.getElementById(id))),
      micTxt:(document.getElementById('tbMic')||{}).textContent||'', micCls:(document.getElementById('tbMic')||{}).className||'',
      histBarVis:vis(document.querySelector('.wg-history-bar')), qsVis:vis(document.querySelector('.qs-row')),
      stVis:vis(document.getElementById('wgState')), hintVis:vis(document.querySelector('.hint')), compVis:vis(document.querySelector('.wg-composer')),
      stopOk:onTop(document.getElementById('micBtn'))};
  },ZH[2]);
  console.log(`▶ ${name} ${w}x${h} — 터치=${m.touch} · 바 ${m.bar?Math.round(m.bar.h):'-'}px · 얼굴 ${Math.round(m.ring.w)}px`);
  ok(name+': 미디어 흉내가 먹었다(전제)', m.touch===touch);
  ok(name+': 가로로 안 넘친다', m.docW<=m.innerW+1, m.docW+' / '+m.innerW);
  ok(name+': 「말하는 방법」 스위치가 보인다', m.swVis);
  if(touch){
    ok(name+': 아래 3칸 바가 있다', m.hasBar);
    ok(name+': 스위치가 바 안에 있다', m.swInBar);
    ok(name+': 스위치 두 버튼이 크고(≥38px) 눌린다', m.swBtnH>=(h<=520?36:40) && m.swBtnsTop, Math.round(m.swBtnH)+'px');
    ok(name+': 세로 화면이면 「말하는 방법」 글자가 보인다', h<=520 || m.swLbl);
    ok(name+': 도움·말하기·글쓰기 3칸이 모두 보이고 눌린다', m.tabsTop.every(Boolean), JSON.stringify(m.tabsTop));
    ok(name+': 듣는 동안 가운데 칸이 ⏹ 멈추기', m.micCls==='rec' && m.micTxt.includes('⏹'), m.micTxt);
    ok(name+': 방금 선생님이 한 말이 보이고 바 위에 있다', m.lastSeen && m.lr.b<=m.bar.t+1, m.lr?`말 아래 ${Math.round(m.lr.b)} · 바 위 ${Math.round(m.bar.t)}`:'없음');
    ok(name+': 바가 화면의 30% 이하', m.bar.h<=m.innerH*0.30, Math.round(m.bar.h)+' / '+m.innerH);
    ok(name+': 흩어진 줄(이전대화·새질문·안내·입력칸)은 감췄다', !m.histBarVis && !m.qsVis && !m.stVis && !m.hintVis && !m.compVis);
    ok(name+': 얼굴이 56px(눕힌 폰 40px)', Math.abs(m.ring.w-(h<=520?40:56))<=2, Math.round(m.ring.w)+'px');
    await page.screenshot({path:`${process.env.SHOT_DIR||'/tmp'}/touch-${w}x${h}-pre.png`});
    // ── 누르면 원래 기능이 도는가 ──
    const a=await page.evaluate(async()=>{
      const cnt={}; ['wgHistory','wgHelpOpen','qsBtn','wgFinish'].forEach(id=>{const e=document.getElementById(id);if(e)e.addEventListener('click',()=>{cnt[id]=(cnt[id]||0)+1;},true);});
      let mic=0; window.toggleMic=()=>{mic++;};
      const tap=id=>document.getElementById(id).click(); const sl=ms=>new Promise(r=>setTimeout(r,ms));
      const out={};
      tap('tbMic'); out.mic=mic;
      const sw=document.getElementById('talkSwitch');
      sw.querySelector('[data-talk="button"]').click(); await sl(50);
      out.btnMode=localStorage.getItem('mangoi_warmup_talk_mode'); out.btnOn=!!document.querySelector('#talkSwitch [data-talk="button"].on');
      document.getElementById('talkSwitch').querySelector('[data-talk="auto"]').click(); await sl(50);
      out.autoOn=!!document.querySelector('#talkSwitch [data-talk="auto"].on');
      tap('tbType'); await sl(80);
      const comp=document.querySelector('.wg-composer'), inbar=comp.querySelector('.inbar');
      out.typeVis=getComputedStyle(comp).display!=='none'&&getComputedStyle(inbar).display!=='none';
      out.typeFocus=document.activeElement===document.getElementById('inp');
      out.micHidden=getComputedStyle(document.getElementById('micBtn')).display==='none';
      out.typeOn=document.getElementById('tbType').classList.contains('on');
      tap('tbType'); await sl(50); out.typeOff=getComputedStyle(comp).display==='none';
      const items=['tbScenes','tbHist','tbAns','tbQs'];  // 끝내기는 마지막에 따로
      out.sheetItems=0;
      for(const k of items){ tap('tbHelp'); await sl(30);
        const sh=document.getElementById('tbSheet'); out.sheetOpen=(out.sheetOpen===undefined?true:out.sheetOpen)&&!sh.hidden;
        out.sheetItems=Math.max(out.sheetItems,sh.querySelectorAll('[data-tb]').length);
        const b=sh.querySelector('[data-tb="'+k+'"]'); if(b)b.click(); await sl(60);
        out.sheetClosed=(out.sheetClosed===undefined?true:out.sheetClosed)&&sh.hidden; }
      out.scenesVis=getComputedStyle(document.getElementById('wgScenes')).display!=='none';
      tap('tbHelp'); await sl(30); document.getElementById('tbSheetBg').click(); await sl(30); out.bgClose=document.getElementById('tbSheet').hidden;
      tap('tbHelp'); await sl(30); document.querySelector('#tbSheet [data-tb="tbFin"]').click(); await sl(60);
      out.cnt=cnt; return out;
    });
    ok(name+': 가운데 칸 → 원래 🎤(toggleMic)', a.mic===1);
    ok(name+': 스위치 「버튼으로」 → 저장·표시', a.btnMode==='button' && a.btnOn);
    ok(name+': 스위치 「자동으로」 → 표시', a.autoOn);
    ok(name+': ⌨ 글쓰기 → 입력칸이 열리고 포커스, 그 안 🎤 는 감춤', a.typeVis && a.typeFocus && a.micHidden && a.typeOn);
    ok(name+': ⌨ 한 번 더 → 입력칸 닫힘', a.typeOff);
    ok(name+': 💡 도움 시트가 열리고 5칸', a.sheetOpen && a.sheetItems===5, a.sheetItems);
    ok(name+': 시트 항목을 누르면 시트가 닫힌다', a.sheetClosed && a.bgClose);
    ok(name+': 시트 → 그림·이전대화·대답도움·새질문·끝내기가 원래 버튼을 누른다',
      a.scenesVis && a.cnt.wgHistory===1 && a.cnt.wgHelpOpen===1 && a.cnt.qsBtn===1 && a.cnt.wgFinish===1, JSON.stringify(a.cnt));
  }else{
    ok(name+': 마우스 PC 는 바를 안 만든다', !m.hasBar);
    ok(name+': 마우스 PC 는 예전 그대로 — ⏹ 버튼이 보이고 눌린다', m.stopOk);
    ok(name+': 마우스 PC 는 예전 그대로 — 얼굴을 안 줄인다', m.ring.w>60, Math.round(m.ring.w)+'px');
    ok(name+': 마우스 PC 는 예전 그대로 — 안내 줄·이전대화 줄이 보인다', m.stVis && m.hintVis && m.histBarVis);
  }
  await page.screenshot({path:`${process.env.SHOT_DIR||'/tmp'}/touch-${w}x${h}-${touch?'t':'m'}.png`});
  await ctx.close();
}
await browser.close();srv.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);process.exit(fail?1:0);
