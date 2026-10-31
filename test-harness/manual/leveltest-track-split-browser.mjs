#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   🎯 leveltest-track-split-browser — 레벨테스트 «AI 자동 / 선생님 확정» 구분 (브라우저)

   ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다(`manual/` 은 게이트가 안 물어 갑니다).

   [왜 브라우저가 필요한가]
     자동 하니스(`leveltest_track_split_harness`)는 «식이 옳은가» 까지만 봅니다.
     «그 글자가 실제로 화면에 뜨는가» 는 그려 봐야 알 수 있습니다
     (i18n 이 textContent 를 갈아끼우거나 상태 맵에서 빠지면 «ai_done» 이 날것으로 뚝니다).

   [짝으로 묻습니다]
     「AI 전용이면 «AI 추정 레벨»」만 두면 «전부 AI 추정» 도 통과합니다 —
     「선생님이 매겼으면 «최종 레벨»」·「옆 상태(done)는 예전 그대로」를 옆에 둡니다.

   [쓰는 법]
     cd cloudflare-deploy/public && python3 -m http.server 8921 &
     /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new --no-sandbox \
       --disable-gpu --remote-debugging-port=9222 --user-data-dir=/tmp/pw about:blank &
     node test-harness/manual/leveltest-track-split-browser.mjs
   ════════════════════════════════════════════════════════════════════════ */
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ✅ '+m);} else {fail++;console.log('  ❌ '+m);} };

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t=>t.type==='page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id=0; const waiters=new Map(); const evs=[];
ws.onmessage = e => { const m=JSON.parse(e.data);
  if(m.id && waiters.has(m.id)){ waiters.get(m.id)(m); waiters.delete(m.id); } else if(m.method) evs.push(m); };
await new Promise(r=>ws.onopen=r);
const send=(method,params={})=>new Promise(r=>{ const i=++id; waiters.set(i,r); ws.send(JSON.stringify({id:i,method,params})); });
const ev=async(expr)=>{ const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0,300));
  return r.result?.result?.value; };

await send('Page.enable'); await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Network.setBypassServiceWorker',{bypass:true});

async function go(url){
  const done = new Promise(r=>{ const t=setInterval(()=>{ if(evs.some(e=>e.method==='Page.loadEventFired')){clearInterval(t);r();} },50); });
  evs.length=0; await send('Page.navigate',{url}); await done; await new Promise(r=>setTimeout(r,600));
}

console.log('\n① 학부모 대시보드 — 레벨테스트 카드');
await go('http://127.0.0.1:8921/parent.html?_nc='+Date.now());

const FIX = {ok:true, items:[
  {id:1, status:'ai_done',  final_level:'A2', teacher_score:null, desired_date:'2026-09-20', ai_score:40},
  {id:2, status:'done',     final_level:'B1', teacher_score:80,   desired_date:'2026-09-18', ai_score:60},
]};
await ev(`(()=>{ window.__orig=window.fetch; window.fetch=(u,o)=>{
  if(String(u).indexOf('/api/leveltest/my')>=0) return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(FIX)}),{headers:{'content-type':'application/json'}}));
  return window.__orig(u,o); }; return 1; })()`);
// 모듈 스코프 let 은 같은 realm 이라 Runtime.evaluate 에서 보인다
const wired = await ev(`(()=>{ try{ _currentUid='testuid'; _token='t'; return typeof pdLeveltest==='function'; }catch(e){ return 'ERR:'+e.message; } })()`);
ok(wired===true, '전제: pdLeveltest 를 부를 수 있다 ('+wired+')');
await ev(`pdLeveltest()`);
await new Promise(r=>setTimeout(r,400));

const shown = await ev(`document.getElementById('pd-lt-card') && getComputedStyle(document.getElementById('pd-lt-card')).display`);
ok(shown && shown!=='none', '전제: 카드가 실제로 그려졌다 (display='+shown+')');
const txt = await ev(`(document.getElementById('pd-leveltest')||{}).innerText || ''`);
console.log('    ┌ 실제 글자: ' + JSON.stringify(txt.replace(/\s+/g,' ').slice(0,220)));
ok(/AI 자동진단 완료/.test(txt), '상태: «AI 자동진단 완료» 가 화면에 뜬다');
ok(!/\bai_done\b/.test(txt), '짝: 날것 «ai_done» 은 안 뜬다');
ok(/AI 추정 레벨/.test(txt), '레벨: 선생님 점수가 없으면 «AI 추정 레벨»');
ok(/최종 레벨/.test(txt), '짝: 선생님 점수가 있으면 «최종 레벨»');
ok(/테스트 완료/.test(txt), '짝: 옛 상태(done)는 예전 그대로 «테스트 완료»');

console.log('\n② 관리자 레벨테스트 표 — 렌더 함수를 실제로 돌린다');
await go('http://127.0.0.1:8921/admin.html?_nc='+Date.now());
await new Promise(r=>setTimeout(r,1500));
const hasStmap = await ev(`typeof STMAP`);
// STMAP 은 adm-core.js 안 스코프일 수 있다 — 소스를 오려 내 돌리는 쪽이 확실
const core = await (await fetch('http://127.0.0.1:8921/js/adm-core.js?'+Date.now())).text();
const si = core.indexOf('const STMAP');
const stBlk = core.slice(si, core.indexOf('};', si)+2);
ok(si>0, '전제: STMAP 블록을 오려 냈다');
/* ⛔ 길이로 자르지 말 것 — +200 으로 자르면 바로 아래 블록주석 한가운데서 끊겨
   «닫히지 않은 주석» 이 되고, 그러면 «깔끔한 FAIL» 이 아니라 SyntaxError 로 죽는다.
   `const lvl = …;` 문장의 «줄 끝» 까지만 자른다. */
const cellSrc = (()=>{
  const i = core.indexOf('const _lvByTeacher'); if (i < 0) return null;
  const j = core.indexOf('const lvl =', i);     if (j < 0) return null;
  const e = core.indexOf('\n', j);              if (e < 0) return null;
  return core.slice(i, e);
})();
ok(!!cellSrc, '전제: 레벨 칸 조립식을 오려 냈다');
const r2 = await ev(`(()=>{ try{
  ${stBlk}
  const _esc=s=>String(s);
  const adminLang='ko';
  const out=[];
  for (const a of [{final_level:'A2',teacher_score:null,status:'ai_done'},{final_level:'B1',teacher_score:0,status:'done'}]) {
    ${cellSrc}
    out.push({lvl, st: (STMAP[a.status]||['?','?','#999'])[0]});
  }
  return out;
}catch(e){ return 'ERR:'+e.message; } })()`);
ok(Array.isArray(r2), '전제: 조립식이 실제로 돌았다 ('+JSON.stringify(r2).slice(0,160)+')');
if (Array.isArray(r2)) {
  ok(/AI 자동/.test(r2[0].lvl) && !/선생님 확정/.test(r2[0].lvl), '관리자: 선생님 점수 없음 → «(AI 자동)»');
  ok(/선생님 확정/.test(r2[1].lvl), '짝: 0점이어도 선생님이 매겼으면 «(선생님 확정)»');
  ok(r2[0].st === 'AI 자동진단', '관리자 상태 라벨 «AI 자동진단»');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
ws.close();
process.exit(fail? 1:0);
