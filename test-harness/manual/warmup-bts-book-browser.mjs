#!/usr/bin/env node
/**
 * warmup-bts-book-browser.mjs — 웜업 «오늘 배울 교재(BTS)» 브라우저 검사
 *
 * ⚠️ 자동으로 안 돕니다(manual/ 규약). 사람이 부릅니다 — 먼저 서버와 브라우저를 띄우세요:
 *
 *   cd cloudflare-deploy/public && python3 -m http.server 8931 &
 *   /opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless=new \
 *     --remote-debugging-port=9931 --no-sandbox --disable-dev-shm-usage \
 *     --use-gl=angle --use-angle=swiftshader about:blank &
 *   node test-harness/manual/warmup-bts-book-browser.mjs
 *
 * ⚠️ 이 파일이 크로미움을 스스로 띄우지 않는 이유 — 일부 실행 환경에서 자식 프로세스로
 *   브라우저를 띄우면 스크립트가 «출력 한 줄 없이» 종료됩니다(2026-09-14 실측).
 *   붙지 못하면 FAIL 이 아니라 «건너뜀» 으로 끝냅니다 — 확인 못 한 것을 통과로 위장하지 않습니다.
 *
 * [왜] 자동 하니스(warmup_bts_book_harness)는 표와 판정 함수를 오려 내 «답» 을 보지만,
 *   «화면에 실제로 그려지는가 · 눌리는가 · 서버로 무엇이 나가는가» 는 원리상 못 봅니다.
 *   이 파일이 그 자리입니다.
 *
 * ⛔ «교재를 고르면 된다» 만 재지 마세요 — 사장님 지시가 «자유대화는 그대로» 이므로
 *   **«안 고르면 예전과 똑같다» 를 짝으로** 봅니다(⑤⑧절). 짝이 없으면 «전부 교재 모드» 도 통과합니다.
 * ⚠️ 새 탭(/json/new)으로 열면 이 컨테이너 크로미움은 스크립트를 실행하지 않습니다 —
 *   /json/list 의 «이미 있는 탭» 을 Page.navigate 로 씁니다(CLAUDE.md 2장).
 * ⚠️ 캐시는 HTTP 와 서비스워커 «둘 다» 꺼야 고친 파일이 반영됩니다.
 */
const PORT = Number(process.env.WBB_PORT || 8931);
const CDP  = Number(process.env.WBB_CDP  || 9931);
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

try { const r = await fetch(BASE + '/warmup.html', { method: 'HEAD' }); if (!r.ok) throw 0; }
catch { console.log('⏭  warmup-bts-book-browser — 건너뜀 (정적서버 ' + BASE + ' 가 안 떠 있습니다)'); process.exit(0); }

let list;
for (let i = 0; i < 20; i++) {
  try { list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); if (list?.length) break; } catch {}
  await sleep(500);
}
if (!list?.length) {
  console.log('⏭  warmup-bts-book-browser — 건너뜀 (서버/크로미움이 안 떠 있습니다. 위 머리말의 두 줄을 먼저 실행하세요)');
  process.exit(0);
}
const tgt = list.find(t => t.type === 'page') || list[0];
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
let id = 0; const waits = new Map();
await new Promise(r => { ws.onopen = r; });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => {
  const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: String(r.result.exceptionDetails.exception?.description || '') };
  return r.result?.result?.value;
};
await cmd('Page.enable'); await cmd('Runtime.enable');
await cmd('Network.setCacheDisabled', { cacheDisabled: true });
await cmd('Network.setBypassServiceWorker', { bypass: true });
async function open(url){
  await cmd('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { await sleep(200);
    if (await evaluate("typeof btsBookOf==='function' && !!document.getElementById('wusBooks')")) return true; }
  return false;
}
const P = [], F = [];
const t = (name, cond, got) => { (cond ? P : F).push(name + (cond ? '' : `  →  ${JSON.stringify(got)}`)); };
// ── ① 저장값 없이 첫 방문 = 자유 대화 그대로 ──
await open(`${BASE}/warmup.html?_nc=${Date.now()}`);
await evaluate("try{localStorage.removeItem('mangoi_warmup_bts');localStorage.removeItem('mangoi_warmup_level')}catch(e){}");
await open(`${BASE}/warmup.html?_nc=${Date.now()+1}`);
let r=await evaluate("JSON.stringify({tb:WCTX.textbook,topic:LESSON_TOPIC,vol:_btsVol,lvl:_warmLevel,chip:(document.getElementById('m-topic')||{}).textContent})");
let d=JSON.parse(r);
t('① 교재 안 고르면 textbook 비어 있음', d.tb==='', d.tb);
t('① 교재 안 고르면 주제 비어 있음(자유 대화)', d.topic==='', d.topic);
t('① 칩이 «자유 대화»', d.chip==='자유 대화', d.chip);

// ── ② 설정 화면에 교재 목록이 실제로 그려지는가 ──
await evaluate("openSetup(false)");
await new Promise(r=>setTimeout(r,300));
r=await evaluate(`JSON.stringify({
  secVisible: !!document.getElementById('wusBooksSec') && getComputedStyle(document.getElementById('wusBooksSec')).display!=='none',
  btnCount: document.querySelectorAll('#wusBooks [data-bts]').length,
  freeOn: !!document.querySelector('#wusBooks [data-bts="0"].on'),
  hasDetails: !!document.querySelector('#wusBooks details'),
  offsetOk: !!document.getElementById('wusBooks').offsetParent
})`);
d=JSON.parse(r);
t('② 교재 섹션이 화면에 보임', d.secVisible===true, d);
t('② 교재 버튼 33개(자유대화1+32권)', d.btnCount===33, d.btnCount);
t('② 기본 선택이 «자유 대화»', d.freeOn===true, d.freeOn);
t('② 나머지 권은 접혀 있음', d.hasDetails===true, d.hasDetails);
t('② 실제로 레이아웃에 올라와 있음', d.offsetOk===true, d.offsetOk);

// ── ③ BTS 3 고르면 주제·교재·레벨이 함께 ──
const before=await evaluate("_warmLevel");
await evaluate(`document.querySelector('#wusBooks [data-bts="3"], #wusBooks details [data-bts="3"]').click()`);
await new Promise(r=>setTimeout(r,200));
r=await evaluate("JSON.stringify({tb:WCTX.textbook,lv:WCTX.level,topic:LESSON_TOPIC,vol:_btsVol,lvl:_warmLevel,chip:(document.getElementById('m-topic')||{}).textContent,saved:localStorage.getItem('mangoi_warmup_bts')})");
d=JSON.parse(r);
t('③ 교재명에 권과 주제가 들어감', d.tb==='BTS 3 (My family, How old are you)', d.tb);
t('③ 레벨 문자열 Lv 3', d.lv==='Lv 3', d.lv);
t('③ 주제가 영어 원문', d.topic==='My family, How old are you', d.topic);
t('③ 대화 단계가 밴드1로 자동', d.lvl===1, {before,after:d.lvl});
t('③ 칩이 교재로 바뀜', String(d.chip).indexOf('BTS 3')>=0, d.chip);
t('③ 고른 값이 저장됨', d.saved==='3', d.saved);

// ── ④ 새로고침해도 이어짐 (강사 없이) + 레벨은 학생 값 존중 ──
await evaluate("setLevel(5,false)");   // 학생이 직접 5단계로 올림
await open(`${BASE}/warmup.html?_nc=${Date.now()+2}`);
r=await evaluate("JSON.stringify({tb:WCTX.textbook,vol:_btsVol,lvl:_warmLevel,chip:(document.getElementById('m-topic')||{}).textContent})");
d=JSON.parse(r);
t('④ 새로고침 후 교재가 복원됨', d.vol===3, d.vol);
t('④ 복원 후에도 칩이 교재', String(d.chip).indexOf('BTS 3')>=0, d.chip);
t('④ 복원이 학생이 고른 단계를 덮지 않음', d.lvl===5, d.lvl);

// ── ⑤ 자유 대화로 되돌리면 완전히 예전 상태 ──
await evaluate("openSetup(false)"); await new Promise(r=>setTimeout(r,250));
await evaluate(`document.querySelector('#wusBooks [data-bts="0"]').click()`);
await new Promise(r=>setTimeout(r,200));
r=await evaluate("JSON.stringify({tb:WCTX.textbook,lv:WCTX.level,topic:LESSON_TOPIC,vol:_btsVol,lvl:_warmLevel,chip:(document.getElementById('m-topic')||{}).textContent,saved:localStorage.getItem('mangoi_warmup_bts')})");
d=JSON.parse(r);
t('⑤ 되돌리면 교재 비어 있음', d.tb==='', d.tb);
t('⑤ 되돌리면 주제 비어 있음', d.topic==='', d.topic);
t('⑤ 되돌리면 칩이 «자유 대화»', d.chip==='자유 대화', d.chip);
t('⑤ 저장값이 지워짐', d.saved===null, d.saved);
t('⑤ 되돌려도 학생 단계는 그대로', d.lvl===5, d.lvl);

// ── ⑥ 밴드 매핑이 LEVEL_CATALOG 와 일치 ──
r=await evaluate(`(function(){var bad=[];for(var i=0;i<BTS_BOOKS.length;i++){var v=BTS_BOOKS[i].v,b=btsBandOf(v);
  var c=LEVEL_CATALOG[b-1]; if(!c){bad.push(v+':밴드없음');continue;}
  var m=String(c.lv).match(/(\\d+)\\s*[-~]\\s*(\\d+)/); if(!m||v<+m[1]||v>+m[2]) bad.push(v+'→'+b);}
  return JSON.stringify(bad);})()`);
d=JSON.parse(r);
t('⑥ 32권 전부 밴드 구간과 일치', d.length===0, d);

// ── ⑦ 서버로 나가는 payload 에 교재가 실리는가 ──
await evaluate("openSetup(false)"); await new Promise(r=>setTimeout(r,250));
await evaluate(`document.querySelector('#wusBooks [data-bts="22"], #wusBooks details [data-bts="22"]').click()`);
r=await evaluate("JSON.stringify(withCtx({session_id:'x',student_input:'hi'}))");
d=JSON.parse(r);
t('⑦ payload.textbook 실림', String(d.textbook||'').indexOf('BTS 22')>=0, d.textbook);
t('⑦ payload.lesson_topic 실림', String(d.lesson_topic||'').indexOf('Staying Healthy')>=0, d.lesson_topic);
t('⑦ payload.difficulty 가 밴드6', d.difficulty===6, d.difficulty);

// ── ⑧ 되돌리면 payload 도 예전 그대로 ──
await evaluate("openSetup(false)"); await new Promise(r=>setTimeout(r,250));
await evaluate(`document.querySelector('#wusBooks [data-bts="0"]').click()`);
r=await evaluate("JSON.stringify(withCtx({session_id:'x',student_input:'hi'}))");
d=JSON.parse(r);
t('⑧ 되돌리면 payload 에 textbook 없음', !('textbook' in d), Object.keys(d));
t('⑧ 되돌리면 payload 에 lesson_topic 없음', !('lesson_topic' in d), Object.keys(d));

// ════════════════════════════════════════════════════════════════════
//  ⑨ 📖 «오늘 배울 과» — 교재의 진짜 문장이 실제로 붙는가 (2026-09-15)
//  ⚠️ 자동 하니스는 «답» 만 봅니다. 여기서는 화면에 그려지고·눌리고·
//     서버로 나가는 payload 에 D1 교재 이름이 실리는지를 봅니다.
//  ⛔ «붙는다» 만 재지 마세요 — «못 받으면 예전 그대로» 를 짝으로 봅니다(⑨-4).
// ════════════════════════════════════════════════════════════════════
await open(`${BASE}/warmup.html?_nc=${Date.now()+9}`);
await evaluate("try{localStorage.removeItem('mangoi_warmup_bts');localStorage.removeItem('mangoi_warmup_bts_lesson')}catch(e){}");
await open(`${BASE}/warmup.html?_nc=${Date.now()+10}`);
/* 정적서버에는 /api 가 없으므로 그 주소만 가로챕니다(나머지 요청은 그대로 둡니다). */
await evaluate(`(function(){
  window.__origFetch = window.__origFetch || window.fetch;
  window.__lsnCalls = [];
  window.fetch = function(u){
    var s = String(u||'');
    if(s.indexOf('/api/games/lessons') === 0){
      window.__lsnCalls.push(s);
      var b = window.__lsnReply ? window.__lsnReply(s) : { ok:true, lessons:[], courses:[] };
      return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(b); } });
    }
    return window.__origFetch.apply(window, arguments);
  };
  return 'ok';
})()`);
const L1K = 'BTS 1 001 (Welcome to school)', L4K = 'BTS 1 004 (School Stuff)';
await evaluate(`window.__lsnReply = function(){ return { ok:true, courses:[{course:'BTS 1',count:8}], lessons:[
  {seq:1,title:'Welcome to school',key:${JSON.stringify(L1K)},sentences:[{en:'Hello, I am a student.'},{en:'I like school.'}],words:[]},
  {seq:4,title:'School Stuff',key:${JSON.stringify(L4K)},sentences:[{en:'I have a pencil'}],words:[]}
]};}; 'ok'`);

// ⑨-1 권을 고르면 과 줄이 그려지고 D1 이름이 실린다
await evaluate("openSetup(false)"); await sleep(250);
await evaluate(`document.querySelector('#wusBooks [data-bts="1"], #wusBooks details [data-bts="1"]').click()`);
await sleep(350);
r = await evaluate(`JSON.stringify({
  tb: WCTX.textbook, topic: LESSON_TOPIC,
  secShown: !!document.getElementById('wusLessonSec') && getComputedStyle(document.getElementById('wusLessonSec')).display!=='none',
  rowShown: (function(){var x=document.querySelector('#wusLessonSec .wus-lsn-row'); return !!x && getComputedStyle(x).display!=='none';})(),
  opts: [].map.call(document.querySelectorAll('#wusLesson option'), function(o){return o.value;}),
  sel: (document.getElementById('wusLesson')||{}).value,
  note: (document.getElementById('wusLessonNote')||{}).textContent,
  offsetOk: !!(document.getElementById('wusLessonSec')||{}).offsetParent,
  calls: window.__lsnCalls.length
})`);
d = JSON.parse(r);
t('⑨ WCTX.textbook 이 D1 교재 이름이 된다', d.tb === L1K, d.tb);
t('⑨ 주제가 «과 제목» 으로 좁혀진다', d.topic === 'Welcome to school', d.topic);
t('⑨ 과 줄이 화면에 보인다', d.secShown === true, d);
t('⑨ 실제로 레이아웃에 올라와 있다', d.offsetOk === true, d.offsetOk);
t('⑨ 과가 둘이면 고르개가 보인다', d.rowShown === true, d.rowShown);
t('⑨ 고르개에 과가 그대로 들어간다', JSON.stringify(d.opts) === JSON.stringify([L1K, L4K]), d.opts);
t('⑨ 첫 과가 골라져 있다', d.sel === L1K, d.sel);
t('⑨ 안내가 문장 수를 말한다', /2개/.test(d.note || ''), d.note);
t('⑨ 안내가 실제 교재 문장을 보여 준다', /Hello, I am a student\./.test(d.note || ''), d.note);
t('⑨ 한 번만 물어본다', d.calls === 1, d.calls);

// ⑨-2 사람이 과를 고르면 그 자리에서 바뀌고 저장된다
await evaluate(`(function(){var s=document.getElementById('wusLesson'); s.value=${JSON.stringify(L4K)};
  s.dispatchEvent(new Event('change',{bubbles:true})); return 'ok';})()`);
await sleep(200);
r = await evaluate("JSON.stringify({tb:WCTX.textbook,topic:LESSON_TOPIC,saved:localStorage.getItem('mangoi_warmup_bts_lesson'),note:(document.getElementById('wusLessonNote')||{}).textContent})");
d = JSON.parse(r);
t('⑨ 고른 과의 D1 이름으로 바뀐다', d.tb === L4K, d.tb);
t('⑨ 주제도 그 과 제목으로', d.topic === 'School Stuff', d.topic);
t('⑨ «권|키» 로 저장된다', d.saved === '1|' + L4K, d.saved);
t('⑨ 안내도 그 과의 문장 수로', /1개/.test(d.note || ''), d.note);
r = await evaluate("JSON.stringify(withCtx({session_id:'x',student_input:'hi'}))");
d = JSON.parse(r);
t('⑨ 서버로 나가는 payload 에 D1 교재 이름이 실린다', d.textbook === L4K, d.textbook);

// ⑨-3 새로고침해도 그 과로 이어진다 (강사 없이)
await open(`${BASE}/warmup.html?_nc=${Date.now()+11}`);
await evaluate(`(function(){
  window.__origFetch = window.__origFetch || window.fetch;
  window.__lsnCalls = [];
  window.__lsnReply = function(){ return { ok:true, courses:[{course:'BTS 1',count:8}], lessons:[
    {seq:1,title:'Welcome to school',key:${JSON.stringify(L1K)},sentences:[{en:'Hello, I am a student.'}],words:[]},
    {seq:4,title:'School Stuff',key:${JSON.stringify(L4K)},sentences:[{en:'I have a pencil'}],words:[]}]};};
  window.fetch = function(u){ var s=String(u||'');
    if(s.indexOf('/api/games/lessons')===0){ window.__lsnCalls.push(s);
      var b=window.__lsnReply(s); return Promise.resolve({ok:true,json:function(){return Promise.resolve(b);}}); }
    return window.__origFetch.apply(window, arguments); };
  return 'ok';
})()`);
await evaluate("applyBtsBook(1,false,false)"); await sleep(350);
r = await evaluate("JSON.stringify({tb:WCTX.textbook,vol:_btsVol})");
d = JSON.parse(r);
t('⑨ 새로고침 뒤에도 지난번 과로 이어진다', d.tb === L4K, d.tb);

// ⑨-4 (짝) 못 받으면 «고치기 전» 그대로 — 이 갈래가 깨지면 더 나빠집니다
await evaluate(`window.__lsnReply = function(){ return { ok:false }; }; 'ok'`);
await evaluate("openSetup(false)"); await sleep(250);
await evaluate(`document.querySelector('#wusBooks [data-bts="5"], #wusBooks details [data-bts="5"]').click()`);
await sleep(350);
r = await evaluate(`JSON.stringify({ tb: WCTX.textbook, topic: LESSON_TOPIC,
  secShown: !!document.getElementById('wusLessonSec') && getComputedStyle(document.getElementById('wusLessonSec')).display!=='none' })`);
d = JSON.parse(r);
t('⑨ 못 받으면 권 이름 그대로 보낸다', /^BTS 5 \(/.test(d.tb || ''), d.tb);
t('⑨ 못 받으면 과 줄을 그리지 않는다', d.secShown === false, d.secShown);

// ⑨-5 (짝) 자유 대화로 되돌리면 과도 함께 사라진다
await evaluate("openSetup(false)"); await sleep(250);
await evaluate(`document.querySelector('#wusBooks [data-bts="0"]').click()`);
await sleep(200);
r = await evaluate(`JSON.stringify({ tb: WCTX.textbook,
  secShown: !!document.getElementById('wusLessonSec') && getComputedStyle(document.getElementById('wusLessonSec')).display!=='none',
  saved: localStorage.getItem('mangoi_warmup_bts_lesson') })`);
d = JSON.parse(r);
t('⑨ 자유 대화로 되돌리면 교재가 비어 있다', d.tb === '', d.tb);
t('⑨ 자유 대화에서는 과 줄이 없다', d.secShown === false, d.secShown);
t('⑨ 과 저장값도 지워진다', d.saved === null, d.saved);

// ⑨-6 과가 하나뿐이면 고르개는 감추고 안내만 (짝)
await evaluate(`window.__lsnReply = function(){ return { ok:true, courses:[{course:'BTS 2 Korea (Shapes and colors)',count:1}],
  lessons:[{seq:0,title:'',key:'BTS 2 Korea (Shapes and colors)',sentences:[{en:'It is red.'}],words:[]}] }; }; 'ok'`);
await evaluate("openSetup(false)"); await sleep(250);
await evaluate(`document.querySelector('#wusBooks [data-bts="2"], #wusBooks details [data-bts="2"]').click()`);
await sleep(350);
r = await evaluate(`JSON.stringify({ tb: WCTX.textbook, topic: LESSON_TOPIC,
  secShown: !!document.getElementById('wusLessonSec') && getComputedStyle(document.getElementById('wusLessonSec')).display!=='none',
  rowShown: (function(){var x=document.querySelector('#wusLessonSec .wus-lsn-row'); return !!x && getComputedStyle(x).display!=='none';})(),
  note: (document.getElementById('wusLessonNote')||{}).textContent })`);
d = JSON.parse(r);
/* ⛔ 과 줄이 교재 상자 «안» 에 있어야 중국어 화면에서 함께 감춰집니다(구조로 보장). */
r = await evaluate(`(function(){var s=document.getElementById('wusLessonSec');
  var b=document.getElementById('wusBooksSec');
  return JSON.stringify({inside: !!(b && s && b.contains(s))});})()`);
t('⑨ 과 줄이 교재 상자 안에 있다(중국어에서 함께 감춰짐)', JSON.parse(r).inside === true, r);
t('⑨ 이름 모양이 달라도 그 key 를 쓴다', d.tb === 'BTS 2 Korea (Shapes and colors)', d.tb);
t('⑨ 과 제목이 없으면 권 주제를 그대로', d.topic === 'Shapes and colors, Adjectives', d.topic);
t('⑨ 과가 하나면 고르개는 감춘다', d.rowShown === false, d.rowShown);
t('⑨ 그래도 안내는 보여 준다(문장이 붙었다는 사실)', d.secShown === true && /1개/.test(d.note || ''), d);

const label = 'warmup-bts-book-browser';
console.log(`\n▶ ${label}`);
P.forEach(x => console.log('  ✅ ' + x));
F.forEach(x => console.log('  ❌ ' + x));
console.log(`\n${label} — PASS ${P.length} / FAIL ${F.length}`);
try { ws.close(); } catch {}
process.exit(F.length ? 1 : 0);
