/* class-end-flow-browser.mjs — 「나가기」→ 평가 ⭐ 흐름을 진짜 브라우저에서 확인 (2026-09-02)
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어가지 않습니다.
 *    화상수업 하단 독(js/vc-dock.js)·index.html 의 종료 방아쇠를 건드리면 **사람이 부르세요**:
 *      node test-harness/manual/class-end-flow-browser.mjs
 *
 * 왜 브라우저가 필요한가
 *   틀렸던 것이 «셀렉터가 서로 안 맞는다» 뿐이라 문자열 하니스·타입체크가 전부 초록이었다.
 *   「버튼이 있다」·「보인다」·「눌린다」·「모달이 뜬다」는 전부 다른 이야기다.
 *
 * 🪤 이 검사를 만들며 실제로 밟은 함정 두 가지 — 지우지 마세요
 *   ① 서비스워커(public/sw.js)가 자산을 cache-first 로 준다. 그래서 파일을 고치고 다시 재면
 *      **옛 사본이 그대로 온다** — 변이시험이 «통과» 해 버려 고침이 된 줄 알았다.
 *      → Network.setBypassServiceWorker 를 반드시 켠다(HTTP 캐시만 끄는 것으로는 부족).
 *   ② CDP /json/new 로 «새 탭» 을 만들면 이 컨테이너에서는 스크립트가 하나도 안 돈다.
 *      → /json/list 의 «이미 있는 탭» 을 잡아 Page.navigate 한다.
 */
const PORT = process.env.PW_PORT || 8901;
const CDP = 'http://127.0.0.1:9222';
const URL = 'http://127.0.0.1:' + PORT + '/index.html';

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

const list = await (await fetch(CDP + '/json/list')).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.error('열린 탭이 없습니다 — 크로미움을 --remote-debugging-port=9222 로 띄우세요'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; waiters.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); } };
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r && r.result && r.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });   // 🪤 ① — 빼면 옛 사본을 잰다
await send('Emulation.setFocusEmulationEnabled', { enabled: true });

/* 수업 화면에 들어간 «척» 하고 나가기를 실제 좌표로 누른다 */
async function clickLeaveAs(role, vw, vh) {
  await send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL + '?_nc=' + Date.now() });
  await sleep(6000);
  await ev(`(function(){
    localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'testkid',name:'테스트학생',role:'${role}'}));
    window.vcMyRole='${role}';
    document.body.classList.add('vc-in-call');   // 독은 1.5초 tick 이 이 클래스를 보고 그린다
    return 'ok'; })()`);
  await sleep(2500);
  /* 🪤 빈 브라우저는 늘 «첫 방문자» 다 — 세로 폰에서는 「화면을 가로로 돌려주세요」
        오버레이(#vc-orientation-overlay, z=99999)가 수업 화면을 통째로 덮어, 멀쩡한 버튼도
        «다른 것이 덮는다» 로 나온다(CLAUDE.md). 사람이 「이대로 보기」를 누르는 그 함수를 부른다. */
  await ev(`(function(){ try { if (typeof window.vcNukeRotationOverlays === 'function')
      window.vcNukeRotationOverlays(); } catch(e){}
    var o=document.getElementById('vc-orientation-overlay');
    if (o && o.parentNode) o.parentNode.removeChild(o);   // 함수가 없거나 안 지웠을 때의 안전망
    return 'ok'; })()`);
  await sleep(300);
  /* 🪤 폰 세로에서는 독이 「⋯」(#vc-dock-more) 뒤로 접혀 있어 나가기 버튼의 폭이 0 이다
        (CLAUDE.md 「폰에서 하단 독은 ⋯ 뒤에 접혀 display:none」). 먼저 펴고 잰다. */
  await ev(`(function(){ var b=document.getElementById('vc-dock-leave');
    if (b && !b.getBoundingClientRect().width) {
      var more=document.getElementById('vc-dock-more');
      if (more) more.click();
    } return 'ok'; })()`);
  await sleep(600);
  const box = await ev(`(function(){ var b=document.getElementById('vc-dock-leave'); if(!b) return null;
    var r=b.getBoundingClientRect(); if(!r.width) return null;
    var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
    return {x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height,
            맨위: !!(top && (top===b || b.contains(top))),
            cls:b.className, bg:getComputedStyle(b).backgroundColor,
            color:getComputedStyle(b).color, br:getComputedStyle(b).borderRadius}; })()`);
  if (!box) return { err: '나가기 버튼을 찾지 못했습니다' };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(1200);
  const after = await ev(`({ 평가모달: !!document.getElementById('vc-rate-modal'),
    수업중: document.body.classList.contains('vc-in-call'),
    주소: location.pathname + (location.search ? '?' + location.search.slice(1,3) : '') })`);
  return { box, after };
}

console.log('■ ① 학생이 「나가기」를 누르면 평가 ⭐ 가 뜬다 (PC 1280x800)');
const stu = await clickLeaveAs('student', 1280, 800);
if (stu.err) { ok(false, stu.err); }
else {
  ok(stu.box.맨위, '나가기 버튼이 실제로 눌리는 자리에 있다(맨 위)', '가려져 있으면 「보이는데 안 눌림」');
  ok(/\bctrl-btn\b/.test(stu.box.cls) && /\bdanger\b/.test(stu.box.cls),
     '버튼이 종료 방아쇠가 알아보는 표식을 달고 있다', 'class = ' + stu.box.cls);
  ok(stu.after.평가모달, '평가 모달(#vc-rate-modal)이 떴다',
     '안 뜨면 복습퀴즈도 함께 사라진다 — 흐름이 평가 → 퀴즈 직렬이다');
  ok(stu.after.수업중, '평가를 내기 전에는 수업에서 안 나간다',
     '「평가를 남겨야 수업에서 나갈 수 있어요」 가 이 화면의 약속이다');
}

console.log('■ ② 모양은 고치기 전 그대로 (색·모서리)');
if (!stu.err) {
  ok(stu.box.bg === 'rgba(239, 68, 68, 0.18)', '배경이 연빨강 그대로다', '잰 값: ' + stu.box.bg
     + ' — css/vc-refresh.css 의 !important 가 이기면 진빨강(.96)이 된다');
  ok(stu.box.color === 'rgb(255, 154, 154)', '글자색이 그대로다', '잰 값: ' + stu.box.color);
  ok(stu.box.br === '13px', '모서리가 그대로다', '잰 값: ' + stu.box.br);
  ok(stu.box.w === 70 && stu.box.h === 62, 'PC 버튼 크기가 그대로다(70x62)', '잰 값: ' + stu.box.w + 'x' + stu.box.h);
}

console.log('■ ③ 강사는 평가 없이, 그러나 홈으로 튕기지 않고 나간다');
const tea = await clickLeaveAs('teacher', 1280, 800);
if (tea.err) { ok(false, tea.err); }
else {
  ok(!tea.after.평가모달, '강사에게는 평가 모달이 안 뜬다', '평가·복습퀴즈는 학생 전용이다');
  ok(!tea.after.수업중, '강사는 수업에서 나간다');
  ok(!/_e=/.test(tea.after.주소) && !/_exit=/.test(tea.after.주소),
     '강사가 홈으로 «튕기지» 않는다(SPA 종료)',
     '주소에 ?_e=·?_exit= 가 붙으면 v34/v32 의 location.replace 가 잡은 것 — '
     + 'v35 가 먼저 삼켜 vcLeaveRoom() 으로 가야 한다. 잰 주소: ' + tea.after.주소);
}

console.log('■ ④ 폰에서도 눌린다 (390x844)');
const mob = await clickLeaveAs('student', 390, 844);
if (mob.err) { ok(false, mob.err); }
else {
  ok(mob.box.맨위, '폰에서도 나가기 버튼이 맨 위에 있다');
  ok(mob.after.평가모달, '폰에서도 평가 모달이 뜬다');
  ok(mob.box.bg === 'rgba(239, 68, 68, 0.18)', '폰에서도 색이 그대로다', '잰 값: ' + mob.box.bg);
}

console.log('■ ⑤ 공유받은 교재의 이름이 학생 화면에 잡힌다');
const book = await ev(`(function(){
  var wrapped = /mangoiCurrentBookId/.test(String(window.vcApplySharedPdf));
  var before = window.__mangoiCurrentBookId || '';
  try { window.vcApplySharedPdf('/api/video-call/pdf/a.jpg','image',1,'a',
        '[다락원 중국어 마스터 3] 미분류 레슨 / Slide7.JPG'); } catch(e){}
  var got = window.__mangoiCurrentBookId || '';
  try { window.vcApplySharedPdf('/api/video-call/pdf/b.jpg','image',1,'b','이름에 대괄호 없음.jpg'); } catch(e){}
  var keep = window.__mangoiCurrentBookId || '';
  return { wrapped: wrapped, before: before, got: got, keep: keep,
           reset: typeof window.__rqvResetProbe }; })()`);
ok(book.wrapped, 'vcApplySharedPdf 가 감싸져 있다');
ok(book.got === '다락원 중국어 마스터 3', '공유받은 교재 이름이 잡힌다', '잰 값: ' + JSON.stringify(book.got));
ok(book.keep === book.got, '이름을 못 뽑는 교재를 받아도 앞 값을 지우지 않는다',
   '빈 값으로 덮으면 잡혀 있던 교재가 사라진다. 잰 값: ' + JSON.stringify(book.keep));
ok(book.reset === 'function', '__rqvResetProbe 가 노출돼 있다(교재가 늦게 와도 다시 물어본다)');

console.log('■ ⑥ 터치(휴대폰)에서도 평가가 남는가');
/* 위 ①~④ 는 마우스로 눌렀다. 실제 학생은 대부분 폰이라 touchstart → touchend 가 온다.
   학생 방아쇠(index.html:4325)는 ['pointerdown','touchstart','mousedown','click'] 로
   **touchend 를 안 잡는데**, v29(14907)·v34(15161)는 touchend 를 캡처해 홈으로 보낸다
   ⟹ 평가 모달이 «떴다가» navigation 으로 지워진다. 고치려면 그 배열에 'touchend' 를
      더해야 했다 — 2026-09-02 사장님 승인으로 넣었다(index.html:4330).
      ⚠️ 그 낱말을 빼면 이 절이 다시 «사람 결정 대기» 로 떨어진다. */
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, hasTouch: true });
await send('Page.navigate', { url: URL + '?_nc=' + Date.now() });
await sleep(6000);
await ev(`(function(){
  localStorage.setItem('mangoi_logged_user', JSON.stringify({uid:'testkid',name:'테스트학생',role:'student'}));
  window.vcMyRole='student'; document.body.classList.add('vc-in-call'); return 'ok'; })()`);
await sleep(2500);
await ev(`(function(){ try{ if(typeof window.vcNukeRotationOverlays==='function') window.vcNukeRotationOverlays(); }catch(e){}
  var o=document.getElementById('vc-orientation-overlay'); if(o&&o.parentNode) o.parentNode.removeChild(o);
  var b=document.getElementById('vc-dock-leave');
  if (b && !b.getBoundingClientRect().width) { var m=document.getElementById('vc-dock-more'); if(m) m.click(); }
  return 'ok'; })()`);
await sleep(600);
const tbox = await ev(`(function(){ var b=document.getElementById('vc-dock-leave');
  if(!b) return null; var r=b.getBoundingClientRect(); if(!r.width) return null;
  return {x:r.left+r.width/2, y:r.top+r.height/2}; })()`);
if (!tbox) { ok(false, '터치 검사: 나가기 버튼을 찾지 못했습니다'); }
else {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tbox.x, y: tbox.y }] });
  await sleep(400);
  const mid = await ev(`({ 평가모달: !!document.getElementById('vc-rate-modal') })`);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1200);
  const end = await ev(`({ 평가모달: !!document.getElementById('vc-rate-modal'),
    수업중: document.body.classList.contains('vc-in-call'),
    튕김: /[?&](_e|_exit)=/.test(location.search) })`);
  ok(mid.평가모달, 'touchstart 에서 평가 모달이 뜬다(고침이 터치에도 닿는다)');
  if (end.평가모달 && !end.튕김) {
    ok(true, 'touchend 뒤에도 평가 모달이 남아 있다 — 터치 경로까지 완결');
  } else {
    console.log('  ⏳ 사람 결정 대기 — touchend 뒤 평가 모달: ' + end.평가모달 + ' · 홈으로 튕김: ' + end.튕김);
    console.log('       · index.html:4325 의 학생 방아쇠 배열에 \'touchend\' 를 더하면 닫힙니다(공동 금지구역)');
    console.log('       · 그 전까지 폰 학생은 여전히 평가·복습퀴즈 없이 나갑니다');
  }
}

await ev(`document.body.classList.remove('vc-in-call');'ok'`);
ws.close();
console.log('────────────────────────────────');
console.log(`  ${fail === 0 ? '✅' : '❌'} PASS ${pass} · FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
