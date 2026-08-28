/* portrait-textbook-top-browser.mjs — 세로 «교재를 위로» 를 진짜 브라우저에 그려서 잰다 (2026-08-28)
 *
 * 왜 필요한가
 *   이 기능이 틀리는 방식은 전부 «함수도 값도 다 있고, 어디에 그려졌는가만 틀린» 종류다:
 *     · order 를 한쪽에만 줘서 «아무 일도 안 일어남»
 *     · 얼굴이 내려왔는데 하단 독(#vc-dock)이 학생 얼굴을 덮음
 *     · 교재를 위로 올리려다 교재 칸이 오히려 작아짐
 *     · 강사에게도 버튼이 보임
 *   글자를 찾는 회귀 하니스는 이 중 아무것도 못 본다. 그래서 여기서는 **좌표를 잰다.**
 *
 * ⚠️ manual/ 규약상 자동으로 안 돕니다 — 세로 배치·독·☰ 메뉴를 건드리면 사람이 부르세요.
 *      node test-harness/manual/portrait-textbook-top-browser.mjs
 *    (로컬 HTTP 서버는 이 스크립트가 스스로 띄웠다 내립니다)
 *
 * ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 라 아무것도 확인되지 않는다(CLAUDE.md 함정).
 * ⚠️ 포트를 매번 바꾼다 — 같은 포트로 두 번 열면 서비스워커가 끼어 «고치기 전» 파일을 준다
 *    (2026-08-27 홈 정지 수리 때 실제로 밟은 함정).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
if (!existsSync(CHROME)) {
  console.log('⏭  건너뜀 — Chromium 을 찾지 못했습니다 (CHROME=… 로 지정하세요)');
  process.exit(0);
}
const HTTP_PORT = 8900 + (Date.now() % 90);        // 서비스워커 회피 — 매번 다른 포트
const CDP_PORT = 9400 + (Date.now() % 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}`;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  c ? (pass++, console.log('  ✅ ' + m))
    : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : '')));
};

const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'],
  { cwd: PUB, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${CDP_PORT}`, 'about:blank'], { stdio: 'ignore' });
const bye = (code) => { try { server.kill(); } catch {} try { chrome.kill(); } catch {} process.exit(code); };
process.on('SIGINT', () => bye(1));
await new Promise(r => setTimeout(r, 2500));

const tabs = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => { ws.onopen = r; });
const cdp = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};

/* 첫 방문자 상태를 넘긴다 — 「가로로 돌려주세요」 오버레이와 환영 안내가 화면을 덮고
   그 아래를 잠그면 멀쩡한 배치도 «깨졌다» 로 나온다(CLAUDE.md 함정). */
const AS_RETURNING_USER = `try{
  localStorage.setItem('mangoi_vc_orientation_dismissed','1');
  localStorage.setItem('mangoi_admin_welcome_v1_done','1');
  localStorage.removeItem('mangoi_vc_portrait_order');
}catch(e){}`;

/* ⚠️ Page.enable 을 먼저 부르지 않으면 addScriptToEvaluateOnNewDocument 가 조용히 안 먹는다.
   첫 판에 그것 때문에 앞 검사가 켜 둔 값이 다음 검사로 새어 라벨이 틀리게 나왔다. */
await cdp('Page.enable');
async function load(w, h, dpr) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: AS_RETURNING_USER });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.navigate', { url: BASE + '/index.html' });
  await new Promise(r => setTimeout(r, 3200));
  /* 그래도 한 번 더 지운다 — 검사끼리 상태가 새면 «없는 버그» 를 쫓게 된다 */
  await evalJs(`try{ localStorage.removeItem('mangoi_vc_portrait_order'); }catch(e){}`);
}

/* 수업 화면을 실제와 같은 모양으로 세운다 (vc-textbook-mobile-browser 의 TILES 와 같은 방식) */
const SETUP = `(function(mode, role, remoteRole){
  window.vcMyRole = role || 'student';
  document.body.classList.add('vc-in-call');
  try{ window.vcNukeRotationOverlays && window.vcNukeRotationOverlays(); }catch(e){}
  var view=document.getElementById('view-videocall-call');
  if(view){ view.style.display='flex'; view.classList.add('active'); }
  document.querySelectorAll('[id^="view-"]').forEach(function(e){ if(e.id!=='view-videocall-call') e.style.display='none'; });
  var row=document.getElementById('vc-main-row');
  row.className=row.className.replace(/video-[a-z]+/g,'').trim();
  row.classList.add(mode || 'video-half');
  var grid=document.getElementById('vc-video-grid'); grid.innerHTML='';
  ['vc-video-teacher','vc-local-box'].forEach(function(idn){
    var b=document.createElement('div'); b.className='video-box'; b.id=idn;
    var v=document.createElement('video'); v.style.width='100%'; v.style.height='100%'; b.appendChild(v);
    if(idn!=='vc-local-box' && remoteRole){
      b.dataset.role=remoteRole;
      var l=document.createElement('span'); l.className='video-label';
      l.textContent = remoteRole==='teacher' ? 'Teacher Ann' : '학생'; b.appendChild(l);
    }
    grid.appendChild(b);
  });
  grid.setAttribute('data-count','2');
  /* ⚠️ window.vcScreenSet 은 «진짜 수업에 들어가야» 정의된다(idx-main.js 3364행, vcJoinRoom 안).
     여기서는 방에 들어가지 않으므로 같은 일을 하는 대역을 깔아 둔다 — 그래야 «떠 있는 모드에서
     켜면 half 로 옮기는가» 를 잴 수 있다. 대역이 «불렸는지» 는 window.__setModes 로 남긴다. */
  if(typeof window.vcScreenSet !== 'function'){
    window.__setModes=[];
    window.vcScreenSet=function(m){ window.__setModes.push(m);
      var r=document.getElementById('vc-main-row');
      r.className=r.className.replace(/video-[a-z]+/g,'').trim(); r.classList.add('video-'+m); };
  }
  try{ window.mgSyncTeacherSelf && window.mgSyncTeacherSelf(); }catch(e){}
  try{ window.mgTbTopEnsureBtn && window.mgTbTopEnsureBtn(); window.mgTbTopApply && window.mgTbTopApply(); }catch(e){}
  return true;
})`;
/* ⚠️ 화면 아래에 뜨는 것들(☰ 기능 · ⋯ · 독)은 vc-dock.js 의 tick 이 1.5초마다 돌면서
   vc-in-call 을 보고 «만든다». 기다리지 않고 재면 전부 0×0 이라 «겹치지 않는다» 는
   허울뿐인 초록불이 나온다.
   ⚠️ 폰에서 #vc-dock 자체는 «⋯» 뒤에 접혀 display:none 이다 — 그것만 기다리면 영영 안 온다. */
async function setup(mode, role, remoteRole) {
  const r = await evalJs(`${SETUP}(${JSON.stringify(mode || 'video-half')},${JSON.stringify(role || 'student')},${JSON.stringify(remoteRole || 'teacher')})`);
  for (let i = 0; i < 12; i++) {
    const h = await evalJs(`(function(){var n=0;
      ['#vc-dock','#vc-dock-more','#vc-dock-handle','.vc-phero-ctrl'].forEach(function(sel){
        var e=document.querySelector(sel); if(!e) return;
        var r=e.getBoundingClientRect(); if(r.height>0) n=Math.max(n, Math.round(r.height)); });
      return n;})()`);
    if (h > 0) break;
    await new Promise(x => setTimeout(x, 400));
  }
  return r;
}

/* 두 칸이 화면 어디에 그려졌는지 + 독이 얼굴을 덮는지 */
const MEASURE = `(function(){
  function box(id){ var e=document.getElementById(id); if(!e) return null;
    var r=e.getBoundingClientRect();
    return { top:Math.round(r.top), bottom:Math.round(r.bottom), h:Math.round(r.height), w:Math.round(r.width) }; }
  var face = box('vc-video-pane'), cont = box('vc-content-pane');
  var grid = box('vc-video-grid');       // 실제로 얼굴이 그려지는 칸
  /* 폰에서 아래를 덮는 것은 «독» 이 아니라 ☰ 기능 버튼과 ⋯ 다 (독은 ⋯ 뒤에 접혀 있다).
     보이는 것들 중 제일 위로 올라온 것을 «덮개» 로 삼는다. */
  var cover = null;
  ['#vc-dock','#vc-dock-more','#vc-dock-handle','.vc-phero-ctrl'].forEach(function(sel){
    var e=document.querySelector(sel); if(!e) return;
    var r=e.getBoundingClientRect(); if(r.height<=0) return;
    if(!cover || r.top < cover.top) cover={ sel:sel, top:Math.round(r.top), h:Math.round(r.height) };
  });
  /* «얼굴 아래 가장자리에서 맨 위에 무엇이 있나» — 「보인다」와 「안 가려진다」는 다르다.
     좌우 가운데 3지점을 재서 하나라도 독·FAB 이 위에 있으면 가려진 것이다. */
  var covered = [];
  if (grid) {
    [0.25, 0.5, 0.85].forEach(function(fx){
      var x = Math.round(grid.w * fx), y = grid.bottom - 6;
      var stack = document.elementsFromPoint(x, y) || [];
      var top = stack[0];
      if (top && top.closest && (top.closest('#vc-dock') || top.closest('#vc-dock-more') ||
                                 top.closest('#vc-dock-handle') || top.closest('.vc-phero-ctrl')))
        covered.push(fx + '@' + (top.id || top.className || top.tagName));
    });
  }
  return JSON.stringify({
    face: face, cont: cont, grid: grid, cover: cover, covered: covered,
    on: document.body.classList.contains('mg-tb-top'),
    gap: getComputedStyle(document.documentElement).getPropertyValue('--mg-tb-gap').trim(),
    rowCls: (document.getElementById('vc-main-row')||{}).className,
    btn: !!document.getElementById('mg-tbtop-btn'),
  });
})()`;
const measure = async () => JSON.parse(await evalJs(MEASURE));
const press = () => evalJs(`(function(){ var b=document.getElementById('mg-tbtop-btn');
  if(!b) return 'no-btn'; b.click(); return 'ok'; })()`);

console.log('\n════════ 세로 «교재를 위로» — 브라우저 실측 ════════');

/* ── ① 기본은 지금 그대로 (얼굴이 위) ────────────────────────────────── */
console.log('\n① 기본 (390×844 세로 · 학생 · 옵션 꺼짐)');
await load(390, 844, 3);
ok(await evalJs('typeof window.mgTbTopApply === "function"'), '⑬절이 실제로 실행됐다 (defer 파일 로드 확인)');
await setup('video-half', 'student', 'teacher');
const a = await measure();
ok(a.face && a.cont, '얼굴 칸·교재 칸을 둘 다 찾았다', JSON.stringify(a));
ok(a.on === false, '기본은 꺼짐 — body 에 mg-tb-top 이 없다');
ok(a.face.top < a.cont.top, `기본 배치는 «위 얼굴 / 아래 교재» 그대로 (얼굴 top ${a.face?.top} < 교재 top ${a.cont?.top})`,
  JSON.stringify(a));
ok(a.btn === true, '학생에게는 ☰ 메뉴 항목이 만들어져 있다');

/* ── ② 켜면 정말로 뒤집히는가 ────────────────────────────────────────── */
console.log('\n② 켠 뒤');
ok(await press() === 'ok', '메뉴 항목을 눌렀다');
await new Promise(r => setTimeout(r, 400));
const b = await measure();
ok(b.on === true, '켜지면 body 에 mg-tb-top 이 붙는다');
ok(b.cont && b.face && b.cont.top < b.face.top,
  `교재가 위로 올라갔다 (교재 top ${b.cont?.top} < 얼굴 top ${b.face?.top})`, JSON.stringify(b));

/* 교재 칸이 오히려 작아지면 이 기능의 목적 자체가 사라진다.
   빈자리는 «얼굴 칸» 에서 뺀다 — 그래서 교재 높이는 거의 그대로여야 한다. */
const dCont = Math.abs((b.cont?.h || 0) - (a.cont?.h || 0));
ok(dCont <= 8, `교재 칸 높이가 그대로다 (${a.cont?.h}px → ${b.cont?.h}px, 차이 ${dCont}px)`, JSON.stringify({ a: a.cont, b: b.cont }));
ok((b.grid?.h || 0) < (a.grid?.h || 0) - 30,
  `대신 얼굴이 그려지는 칸이 독 높이만큼 줄었다 (${a.grid?.h}px → ${b.grid?.h}px, 빈자리 ${b.gap})`,
  JSON.stringify({ a: { face: a.face, grid: a.grid }, b: { face: b.face, grid: b.grid } }));
ok(Math.abs((b.face?.h || 0) - (a.face?.h || 0)) <= 2,
  '얼굴 «칸» 의 바깥 크기는 그대로다 (padding 방식이라 교재 칸을 안 밀어낸다)', JSON.stringify(b));

/* ── ③ 겹침 — 「보인다」와 「안 가려진다」는 다르다 ──────────────────── */
console.log('\n③ 하단 독이 얼굴을 덮지 않는가');
ok(b.covered.length === 0,
  '얼굴 아래 가장자리 세 지점 어디에도 독·☰버튼이 얹혀 있지 않다',
  '가려진 지점: ' + JSON.stringify(b.covered) + ' · ' + JSON.stringify({ face: b.face, dock: b.dock }));
if (b.cover && b.cover.h > 0) {
  ok(b.grid.bottom <= b.cover.top + 1,
    `얼굴이 그려지는 칸 아래끝(${b.grid.bottom})이 ${b.cover.sel} 윗변(${b.cover.top}) 위에 있다`, JSON.stringify(b));
  const gapPx = parseInt(b.gap, 10);
  ok(gapPx >= 40 && gapPx <= 160, `빈자리를 «재서» 넣었다 (${b.gap}, 기본값 76px 에 기대지 않음)`, JSON.stringify(b));
} else {
  /* ⛔ 조용히 건너뛰지 않는다 — 못 잰 것을 «문제 없음» 으로 읽으면 이 검사를 둔 뜻이 사라진다. */
  fail++;
  console.log('  ❌ 화면 아래에 떠 있는 것을 하나도 못 찾아 겹침을 재지 못했습니다 — 검사 설정을 고치세요');
}

/* ── ④ 다시 누르면 원래대로 ──────────────────────────────────────────── */
console.log('\n④ 되돌리기');
await press();
await new Promise(r => setTimeout(r, 400));
const c = await measure();
ok(c.on === false && c.face.top < c.cont.top, '다시 누르면 «위 얼굴» 로 정확히 돌아온다', JSON.stringify(c));
ok(Math.abs(c.face.h - a.face.h) <= 2 && Math.abs(c.cont.h - a.cont.h) <= 2,
  '높이도 켜기 전과 같아진다 (찌꺼기가 남지 않는다)', JSON.stringify({ a, c }));

/* ── ⑤ 떠 있는 모드(pip)에서 켜면 먼저 2단으로 옮긴다 ────────────────── */
console.log('\n⑤ pip(교재 전체 + 작은 얼굴)에서 켰을 때');
await setup('video-pip', 'student', 'teacher');
await press();
await new Promise(r => setTimeout(r, 400));
const d = await measure();
const modes = await evalJs('JSON.stringify(window.__setModes||[])');
ok(/video-half/.test(d.rowCls) && !/video-pip/.test(d.rowCls),
  '먼저 half(기본)로 옮긴다 — «눌렀는데 아무 일도 안 일어남» 방지', d.rowCls + ' · vcScreenSet' + modes);
ok(JSON.parse(modes).indexOf('half') >= 0, 'vcScreenSet("half") 를 실제로 부른다', modes);
ok(d.on === true && d.cont.top < d.face.top, '그리고 교재가 위로 올라간다', JSON.stringify(d));

/* ── ⑥ 강사·관리자에게는 없다 (사장님 2026-08-28 지시) ───────────────── */
console.log('\n⑥ 「학생만」');
await load(390, 844, 3);
await setup('video-half', 'teacher', 'student');
const e = await measure();
ok(e.btn === false, '강사 화면에는 ☰ 메뉴 항목이 아예 없다', JSON.stringify(e));
ok(e.on === false, '강사 화면에는 배치가 걸리지 않는다');
ok(await evalJs('window.mgTbTopIsStudent()') === false, '판정 함수도 «학생 아님» 이라고 답한다');

await load(390, 844, 3);
await setup('video-half', 'admin', 'teacher');
ok(await evalJs('window.mgTbTopIsStudent()') === true,
  'jeong 사고형 — admin 으로 잡혔지만 상대에 교사가 있으면 학생 자리로 본다');
ok((await measure()).btn === true, '그래서 그 화면에는 버튼이 보인다');

/* ⚠️ 클래스를 붙여 놓고 기다리면 안 된다 — js/vc-observe-guard.js 가 주소에 observe= 가
   없으면 그 클래스를 도로 뗀다(2026-08-27 무한루프 수리 코드). 그래서 «붙인 그 순간»
   한 호출 안에서 판정까지 끝낸다. */
await load(390, 844, 3);
await setup('video-half', 'admin', 'teacher');
const ghost = await evalJs(`(function(){
  var before=!!document.getElementById('mg-tbtop-btn');
  document.body.classList.add('vc-observer');
  var isStu=window.mgTbTopIsStudent();
  window.mgTbTopEnsureBtn();
  var after=!!document.getElementById('mg-tbtop-btn');
  return JSON.stringify({before:before,isStu:isStu,after:after});
})()`);
const g = JSON.parse(ghost);
ok(g.isStu === false, '참관(Ghost)은 «학생 자리» 로 보지 않는다', ghost);
ok(g.before === true && g.after === false, '참관으로 바뀌면 이미 만든 항목도 지운다', ghost);

/* ── ⑦ PC·가로는 한 픽셀도 안 바뀐다 ─────────────────────────────────── */
console.log('\n⑦ PC·가로 (세로 전용 규칙이 새지 않는가)');
for (const [w, h, name] of [[844, 390, '폰 가로'], [1280, 800, 'PC']]) {
  await load(w, h, 2);
  await setup('video-half', 'student', 'teacher');
  const before = await measure();
  await evalJs(`document.body.classList.add('mg-tb-top')`);   // 억지로 켜 본다
  await new Promise(r => setTimeout(r, 200));
  const after = await measure();
  ok(before.face && after.face &&
     before.face.top === after.face.top && before.cont.top === after.cont.top,
    `${name} — mg-tb-top 을 억지로 붙여도 배치가 그대로다`,
    JSON.stringify({ before: { f: before.face, c: before.cont }, after: { f: after.face, c: after.cont } }));
}

/* ── ⑧ ☰ 메뉴 안에서 실제로 보이고 눌리는가 ──────────────────────────── */
console.log('\n⑧ ☰ 기능 메뉴 안');
await load(390, 844, 3);
await setup('video-half', 'student', 'teacher');
await evalJs(`(function(){ try{ window.vcTogglePheroMenu && window.vcTogglePheroMenu(); }catch(e){} return 1; })()`);
await new Promise(r => setTimeout(r, 400));
/* 🔴 굴리기 «전에» 먼저 잰다 — 스크롤해야 나오는 항목은 사람에게 «없는» 것과 같다.
   2026-08-28 사장님 「햄버거에서 기능이 안 보이는데」 제보가 정확히 그 상태였다. */
const firstView = JSON.parse(await evalJs(`(function(){
  var b=document.getElementById('mg-tbtop-btn');
  var tb=document.querySelector('#vc-main-row .content-pane .tab-bar');
  if(!b||!tb) return JSON.stringify({found:false});
  var br=b.getBoundingClientRect(), tr=tb.getBoundingClientRect();
  return JSON.stringify({ found:true, top:Math.round(br.top), bottom:Math.round(br.bottom),
    sheetTop:Math.round(tr.top), sheetBottom:Math.round(tr.bottom),
    idx:Array.prototype.indexOf.call(tb.children, b), n:tb.children.length,
    scrolled:Math.round(tb.scrollTop) });
})()`));
ok(firstView.found && firstView.bottom <= firstView.sheetBottom && firstView.top >= firstView.sheetTop - 1,
  `메뉴를 열자마자 «스크롤 없이» 보인다 (항목 ${firstView.idx + 1}/${firstView.n}번째)`,
  JSON.stringify(firstView));

/* 그 다음에 굴려서 겹침·글자를 잰다 */
await evalJs(`(function(){ var b=document.getElementById('mg-tbtop-btn');
  if(b && b.scrollIntoView) b.scrollIntoView({block:'center'}); return 1; })()`);
await new Promise(r => setTimeout(r, 250));
const menu = JSON.parse(await evalJs(`(function(){
  var b=document.getElementById('mg-tbtop-btn');
  if(!b) return JSON.stringify({found:false});
  var r=b.getBoundingClientRect(), cs=getComputedStyle(b);
  var stack=document.elementsFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2))||[];
  return JSON.stringify({ found:true, w:Math.round(r.width), h:Math.round(r.height),
    display:cs.display, text:b.textContent,
    onTop: !!(stack[0] && (stack[0]===b || (stack[0].closest && stack[0].closest('#mg-tbtop-btn')))),
    coveredBy: stack[0] ? (stack[0].id || stack[0].className || stack[0].tagName) : null });
})()`));
ok(menu.found && menu.display !== 'none' && menu.w > 40 && menu.h > 30,
  `메뉴를 열면 큰 버튼으로 보인다 (${menu.w}×${menu.h})`, JSON.stringify(menu));
ok(menu.onTop === true, '그 자리에서 맨 위에 있다 — 다른 것이 덮고 있지 않다', JSON.stringify(menu));
ok(menu.text === '⇅ 교재를 위로', '글자가 «무엇을 하는지» 그대로 말한다', menu.text);

/* ── ⑨ 사장님이 실제로 쓰신 창 크기에서도 보이는가 ──────────────────────
   2026-08-28 제보 스크린샷의 창은 482×832 였다. 390×844 만 재고 «보인다» 라고 하면
   정작 제보하신 화면을 안 잰 것이다. */
console.log('\n⑨ 제보 창 크기(482×832)에서도 스크롤 없이 보이는가');
await load(482, 832, 2);
await setup('video-half', 'student', 'teacher');
await evalJs(`(function(){ try{ window.vcTogglePheroMenu && window.vcTogglePheroMenu(); }catch(e){} return 1; })()`);
await new Promise(r => setTimeout(r, 450));
const wide = JSON.parse(await evalJs(`(function(){
  var b=document.getElementById('mg-tbtop-btn');
  var tb=document.querySelector('#vc-main-row .content-pane .tab-bar');
  if(!b||!tb) return JSON.stringify({found:false});
  var br=b.getBoundingClientRect(), tr=tb.getBoundingClientRect();
  return JSON.stringify({ found:true, top:Math.round(br.top), bottom:Math.round(br.bottom),
    sheetTop:Math.round(tr.top), sheetBottom:Math.round(tr.bottom),
    w:Math.round(br.width), text:b.textContent });
})()`));
ok(wide.found && wide.bottom <= wide.sheetBottom && wide.top >= wide.sheetTop - 1,
  `482×832 에서도 메뉴를 열자마자 보인다 (${wide.w}px 폭)`, JSON.stringify(wide));

console.log(`\n──────────────────────────────────────────\n  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})\n`);
ws.close();
bye(fail ? 1 : 0);
