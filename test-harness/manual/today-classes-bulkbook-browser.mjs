// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📚 「🚪 오늘 수업」의 «교재 미배정 N건» 요약 줄 — 진짜 브라우저에 그려서 재는 검사
   (2026-09-08 신설)

   [왜 필요한가] 이 변경에서 틀릴 수 있는 것은 «그 줄이 그려지는가»·«숫자가 맞는가»·
   «버튼이 실제로 눌려 모달이 열리는가» 뿐이다. 문자열 회귀 하니스는 함수도 값도 전부
   «있다» 고 보고 통과한다(CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」).

   ⚠️ manual/ 규약상 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      js/adm-today-classes.js 의 bookNoteHtml()·render() 나
      js/adm-bulkbook.js 의 window.mangoiOpenBulkTextbook 을 건드리면 사람이 직접:
        node test-harness/manual/today-classes-bulkbook-browser.mjs

   ⚠️ 「뜬다」만 넣지 않는다 — «전부 배정이면 안 뜬다» 를 짝으로 둔다.
      한쪽만 두면 「언제나 뜨는 줄」도 초록으로 통과한다(CLAUDE.md 2장).
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.TCB_PORT || 8919);
const CDP = Number(process.env.TCB_CDP || 9339);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 씨앗 — 4건 중 3건이 교재 미배정(운영 실측과 같은 «대부분 비어 있음» 모양) ─────── */
const NOW = Date.now();
const SESSIONS = [
  { source: 'mangoi', schedule_id: 2001, observable: true, room_id: 'class-2001-20260908',
    student_uid: 'mby1', student_name: '지승연', teacher_name: 'KAYE', level: null, textbook: null,
    textbook_assigned: false, start_time: '12:30', start_ts: NOW, end_ts: NOW + 12e5,
    status: 'live', join_open: true, is_level_test: false },
  { source: 'mangoi', schedule_id: 2002, observable: true, room_id: 'class-2002-20260908',
    student_uid: 'juju5731', student_name: '박주형', teacher_name: 'KAYE', level: null, textbook: null,
    textbook_assigned: false, start_time: '13:00', start_ts: NOW + 6e5, end_ts: NOW + 18e5,
    status: 'open', join_open: true, is_level_test: false },
  { source: 'mangoi', schedule_id: 2003, observable: true, room_id: 'class-2003-20260908',
    student_uid: 'jjy2323', student_name: '장지웅', teacher_name: '중국어 강선생님', level: 'Lv 5',
    textbook: 'BTS 2 001', textbook_assigned: true, start_time: '18:00', start_ts: NOW + 9e6, end_ts: NOW + 9e6 + 18e5,
    status: 'early', join_open: false, is_level_test: false },
  { source: 'cafe24', schedule_id: null, observable: false, room_id: 'c24-512080',
    student_uid: 'mangoai1', student_name: 'MANGO AI', teacher_name: 'Teacher Far', level: null, textbook: null,
    textbook_assigned: false, start_time: '13:00', start_ts: NOW, end_ts: NOW + 12e5,
    status: 'live', join_open: false, is_level_test: false },
];
/* 🧪 레벨테스트 1건을 섞은 판 — 첫 수업이라 교재가 없는 것이 정상이라 «세지 않아야» 한다.
   ⚠️ 「빼는가」만 넣지 않는다 — «빼고 나서도 일반수업은 그대로 센다» 를 짝으로 봐야
      「아무것도 안 세는 코드」가 통과하지 않는다. */
const SESSIONS_LT = SESSIONS.concat([{
  source: 'mangoi', schedule_id: 2004, observable: true, room_id: 'class-2004-20260908',
  student_uid: 'newkid', student_name: '새하테스트', teacher_name: 'SID', level: null, textbook: null,
  textbook_assigned: false, start_time: '19:00', start_ts: NOW + 12e6, end_ts: NOW + 12e6 + 18e5,
  status: 'early', join_open: false, is_level_test: true },
]);
/* 전부 배정된 판 — «안 뜬다» 짝 검사용 */
const SESSIONS_ALL = SESSIONS.map(s => Object.assign({}, s, { textbook_assigned: true, textbook: s.textbook || 'BTS 1 001' }));

const BOOT = `
  try {
    localStorage.setItem('mangoi_admin_welcome_v1_done','1');
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ username:'admin', role:'hq_exec' }));
    localStorage.setItem('mangoi_lang','ko');
  } catch(e){}
  (function(){
    window.__tcSeed = ${JSON.stringify(SESSIONS)};
    window.__books = 0;
    /* 🔔 alert 을 가로채 «사람에게 말했는가» 를 잰다 — 조용히 넘기면 「버튼이 고장났다」가 된다 */
    window.__alerts = [];
    window.alert = function(m){ window.__alerts.push(String(m)); };
    var ok = function(body){ return new Response(JSON.stringify(body), { status:200, headers:{'content-type':'application/json'} }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/admin/classes/today') >= 0) return Promise.resolve(ok({ ok:true, sessions: window.__tcSeed }));
      /* 🧪 배정 API — window.__bulkFail 로 «서버가 이렇게 거절하면» 을 만들어 본다.
         ⚠️ 종단 404 응답에는 «ok» 칸이 아예 없다 — 그대로 흉내 낸다(그게 함정이다).
            ⛔ 이 주석은 백틱 템플릿(BOOT) 안이다 — 백틱을 쓰면 문자열이 그 자리에서 끊긴다. */
      if (s.indexOf('/api/admin/students/bulk-assign-textbook') >= 0) {
        try { window.__lastBulkBody = JSON.parse((o && o.body) || '{}'); } catch(e) { window.__lastBulkBody = null; }
        var f = window.__bulkFail;
        if (f) return Promise.resolve(new Response(JSON.stringify(f.body), { status: f.status, headers:{'content-type':'application/json'} }));
        return Promise.resolve(ok({ ok:true, dry:true, targets:3 }));
      }
      if (s.indexOf('/api/admin/textbooks') >= 0) { window.__books++; return Promise.resolve(ok({ ok:true, items:[], library:[{ name:'BTS 1 001', level:'Lv 1', quizzes:12, files:20, lang:'en' }] })); }
      if (s.indexOf('/api/admin/me') >= 0) return Promise.resolve(ok({ ok:true, username:'admin', role:'hq_exec' }));
      return real(u, o);
    };
  })();
`;

/* ── CDP 최소 클라이언트 ──────────────────────────────────────────────── */
async function cdp() {
  const r = await fetch(`http://127.0.0.1:${CDP}/json/list`);
  const tabs = (await r.json()).filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!tabs.length) throw new Error('열려 있는 탭이 없습니다');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiting = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const { res, rej } = waiting.get(m.id); waiting.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; waiting.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  return { send, close: () => ws.close() };
}

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  const br = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP}`, '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
  const bye = () => { try { br.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', bye);
  await sleep(2200);

  const c = await cdp();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  try { await c.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) {}
  /* ⚠️ 서비스워커가 자산을 cache-first 로 주면 «고치기 전» 사본으로 재게 된다
     — 변이시험이 조용히 통과한다(CLAUDE.md 2장). 캐시와 SW 를 둘 다 끈다. */
  try { await c.send('Network.enable'); } catch (e) {}
  try { await c.send('Network.setCacheDisabled', { cacheDisabled: true }); } catch (e) {}
  try { await c.send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html?_nc=${Date.now()}` });
  await sleep(5000);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };
  const reload = async seed => {
    await ev(`window.__tcSeed = ${JSON.stringify(seed)}`);
    await ev('tcLoadToday()');
    await sleep(700);
  };

  /* ⚠️ 관리자 카드는 «한 번에 한 장» 만 보인다(IA6 의 .ia6-hide) — 먼저 그 카드를 연다 */
  await ev('typeof jumpToMenu === "function" ? (jumpToMenu("card-students-mgmt"), 1) : 0');
  await sleep(400);
  await ev('(function(){var d=document.getElementById("sm-today-classes"); if(d) d.open=true;})()');
  await ev('typeof tcLoadToday === "function" ? tcLoadToday() : Promise.reject("tcLoadToday 없음")');
  await sleep(900);

  console.log('\n── ⓪ 전제 — 표가 실제로 화면에 있는가 ───────────────');
  check('오늘 수업 4건이 그려졌다', (await ev('document.querySelectorAll("#tc-body tbody tr").length')) === 4);
  check('그 카드가 실제로 보인다 (숨은 카드에 대고 재지 않는다)',
    await ev('!!document.getElementById("tc-body").offsetParent'));

  console.log('\n── ① 요약 줄이 그려지는가 ──────────────────────────');
  const line = await ev('(function(){var e=document.querySelector("#tc-body #tc-bulk-book"); return e ? e.parentElement.textContent.trim() : null})()');
  check('«교재 미배정» 요약 줄이 있다', !!line, String(line));
  check('   4건 중 3건으로 «정확히» 센다', /표시된 4건 중 3건/.test(line || ''), String(line));
  check('   무엇이 비어 있는지도 말한다 (학생 명부의 교재 칸)', /학생 명부의 교재/.test(line || ''), String(line));

  /* ⚠️ 줄이 아예 안 그려졌으면 아래 검사들이 null 에 대고 재다가 «크래시» 한다 —
     스택트레이스만 남으면 무엇이 깨졌는지 안 보인다(CLAUDE.md 2장). 깔끔한 FAIL 로 끝낸다. */
  if (!(await ev('!!document.getElementById("tc-bulk-book")'))) {
    check('요약 줄이 없어 ②~⑨ 를 잴 수 없다 (먼저 ①을 고치세요)', false);
    c.close(); bye();
    console.log('\n════════════════════════════════════════════');
    console.log(`  ⚠ PASS ${PASS}   FAIL ${FAIL}`);
    console.log('════════════════════════════════════════════');
    process.exit(1);
  }

  console.log('\n── ② 버튼이 «보이고 눌리는가» ──────────────────────');
  check('[📚 일괄 배정] 버튼이 실제로 보인다', await ev('!!document.getElementById("tc-bulk-book").offsetParent'));
  /* 「있다」와 「손이 닿는다」는 다르다 — 맨 위가 그 버튼인지 잰다(CLAUDE.md 2장) */
  const top = await ev(`(function(){var b=document.getElementById("tc-bulk-book");b.scrollIntoView({block:"center"});var r=b.getBoundingClientRect();
    var el=document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2)[0]; return el ? (el.id||el.tagName) : null})()`);
  check('   무엇에도 안 덮인다 (맨 위가 그 버튼)', top === 'tc-bulk-book', String(top));
  /* ⛔ 인라인 onclick 이면 이 파일이 IIFE 라 ReferenceError 가 난다 — 속성이 없어야 한다 */
  check('   인라인 onclick 을 쓰지 않는다', await ev('!document.getElementById("tc-bulk-book").getAttribute("onclick")'));
  /* 🎨 전역 「카드 안 button = 파란 알약」에 먹히지 않았는지 — 옆 칩들과 같은 높이여야 한다 */
  const hh = JSON.parse(await ev(`JSON.stringify({b:Math.round(document.getElementById("tc-bulk-book").getBoundingClientRect().height),
    a:Math.round((document.querySelector("#tc-body button.tc-act-observe")||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height)})`));
  check('   옆의 참관 칩과 같은 크기다 (파란 알약으로 부풀지 않았다)', hh.a > 0 && Math.abs(hh.b - hh.a) <= 4, JSON.stringify(hh));

  console.log('\n── ③ 누르면 «일괄 배정» 모달이 열리는가 ────────────');
  check('adm-bulkbook 이 문을 내놓았다', (await ev('typeof window.mangoiOpenBulkTextbook')) === 'function');
  await ev('document.getElementById("tc-bulk-book").click()');
  await sleep(500);
  check('모달이 실제로 열린다', (await ev('(function(){var o=document.getElementById("bat-overlay"); return o ? getComputedStyle(o).display : null})()')) === 'flex');
  check('   교재 목록을 서버에서 받아 온다', (await ev('window.__books')) >= 1);
  check('   «대상 미리보기» 전에는 실행 버튼이 잠겨 있다 (오배정 방지)',
    await ev('!!document.getElementById("bat-run").disabled'));
  check('   «미배정 학생만» 이 기본으로 켜져 있다', await ev('!!document.getElementById("bat-empty").checked'));
  /* 📌 이 줄이 센 수(화면에 보이는 3건)와 저 창의 기본 대상(권한 범위 전체)은 모집단이 다르다.
     실행 직전에 사람이 보는 자리에서 그 말을 해야 한다(CLAUDE.md 2장 「두 수를 비교할 때」). */
  const st = await ev('document.getElementById("bat-status").textContent');
  check('   «이 창의 대상은 화면의 3건이 아니다» 를 상태줄에서 말한다',
    /권한 범위/.test(st || '') && /미리보기/.test(st || ''), String(st));
  await ev('document.getElementById("bat-close").click()');
  await sleep(200);

  console.log('\n── ④ 전부 배정이면 «안» 뜨는가 (짝 검사) ───────────');
  await reload(SESSIONS_ALL);
  check('4건 다 배정되면 요약 줄이 사라진다', !(await ev('!!document.getElementById("tc-bulk-book")')));
  check('   그래도 표는 그대로 4건이다', (await ev('document.querySelectorAll("#tc-body tbody tr").length')) === 4);
  await reload(SESSIONS);
  check('다시 미배정이 있으면 돌아온다', await ev('!!document.getElementById("tc-bulk-book")'));

  console.log('\n── ⑤ «표시된 줄» 기준으로 세는가 ───────────────────');
  await ev('(function(){var e=document.getElementById("tc-source");e.value="cafe24";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await sleep(200);
  const c24 = await ev('(function(){var e=document.querySelector("#tc-body #tc-bulk-book"); return e ? e.parentElement.textContent.trim() : null})()');
  check('카페24만 걸러도 «1건 중 1건» 으로 눈앞의 목록을 말한다', /표시된 1건 중 1건/.test(c24 || ''), String(c24));
  await ev('(function(){var e=document.getElementById("tc-q");e.value="장지웅";e.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await ev('(function(){var e=document.getElementById("tc-source");e.value="";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await sleep(200);
  check('배정된 학생만 남으면 줄이 사라진다', !(await ev('!!document.getElementById("tc-bulk-book")')));
  await ev('(function(){var e=document.getElementById("tc-q");e.value="";e.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await sleep(200);

  console.log('\n── ⑤-2 레벨테스트는 세지 않는가 ────────────────────');
  await reload(SESSIONS_LT);
  const lt = await ev('(function(){var e=document.querySelector("#tc-body #tc-bulk-book"); return e ? e.parentElement.textContent.trim() : null})()');
  check('표는 5건인데 «5건 중 3건» 으로 센다 (레벨테스트 1건은 뺀다)', /표시된 5건 중 3건/.test(lt || ''), String(lt));
  check('   왜 적게 셌는지 말한다 (레벨테스트 1건 제외)', /레벨테스트 1건 제외/.test(lt || ''), String(lt));
  /* ⚠️ «빼는가» 만 보면 「아무것도 안 세는 코드」도 통과한다 — 일반수업은 그대로 세는지 짝으로 본다 */
  check('   그래도 일반수업 미배정 3건은 그대로 센다', /중 3건/.test(lt || ''), String(lt));
  const ltLines = JSON.parse(await ev(`(function(){var b=document.getElementById("tc-bulk-book").parentElement;
    var r=document.createRange(); r.selectNodeContents(b.firstChild);
    return JSON.stringify({rects:r.getClientRects().length})})()`));
  check('   꼬리말이 붙어도 두 줄 이내다', ltLines.rects <= 2, JSON.stringify(ltLines));
  await reload(SESSIONS);

  console.log('\n── ⑥ 글자가 낱글자로 쪼개지지 않는가 ───────────────');
  /* ⛔ display:flex 로 감싸면 짧은 글이 «교 / 재 / 미 / 배 / 정» 으로 쪼개진다(CLAUDE.md 2장).
     상자 높이 ÷ 줄높이로 «몇 줄인가» 를 센다. */
  /* ⚠️ «상자 높이 ÷ 줄높이» 로 세면 padding·border 가 섞여 한 줄짜리가 두 줄로 잡힌다
     (CLAUDE.md 2장 — 실제로 이 검사에서 한 번 밟았다). 글자 상자만 Range 로 직접 센다. */
  const lines = JSON.parse(await ev(`(function(){var b=document.getElementById("tc-bulk-book").parentElement;
    var r=document.createRange(); r.selectNodeContents(b.firstChild);
    return JSON.stringify({disp:getComputedStyle(b).display, rects:r.getClientRects().length})})()`));
  check('그 줄은 flex 가 아니다 (보통 텍스트 흐름)', lines.disp !== 'flex', JSON.stringify(lines));
  check('   1500px 폭에서 두 줄 이내다', lines.rects <= 2, JSON.stringify(lines));

  console.log('\n── ⑦ 좁은 폰 폭에서도 화면을 밀지 않는가 ───────────');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const ofM = JSON.parse(await ev('JSON.stringify({s:document.documentElement.scrollWidth,w:window.innerWidth})'));
  check('390px 폭에서 문서가 가로로 안 넘친다', ofM.s <= ofM.w + 1, JSON.stringify(ofM));
  check('   버튼이 화면 폭 안에 들어온다',
    await ev('document.getElementById("tc-bulk-book").getBoundingClientRect().right <= innerWidth + 1'));
  await c.send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

  console.log('\n── ⑧ 문이 사라지면 «사람에게 말하는가» ─────────────');
  await ev('window.__mangoiOpenBackup = window.mangoiOpenBulkTextbook; delete window.mangoiOpenBulkTextbook;');
  await ev('window.__alerts = []');
  await ev('document.getElementById("tc-bulk-book").click()');
  await sleep(300);
  check('함수가 없으면 조용히 넘기지 않고 알린다', (await ev('window.__alerts.length')) === 1, await ev('JSON.stringify(window.__alerts)'));
  check('   그때 모달이 열리지도 않는다',
    (await ev('(function(){var o=document.getElementById("bat-overlay"); return o ? getComputedStyle(o).display : "none"})()')) === 'none');
  await ev('window.mangoiOpenBulkTextbook = window.__mangoiOpenBackup');

  console.log('\n── ⑪ 배지를 누르면 «그 학생만» 인가 ────────────────');
  await reload(SESSIONS);
  check('미배정 배지가 누를 수 있는 것으로 보인다 (▸)',
    await ev('!!document.querySelector("#tc-body .tc-book-pin")'));
  const pinCount = await ev('document.querySelectorAll("#tc-body .tc-book-pin").length');
  /* ⚠️ «배정된 학생 배지는 안 눌린다» 를 짝으로 — 없으면 «전부 눌리게» 해도 통과한다 */
  check('   배정된 학생(장지웅)의 교재명은 누를 수 없다', pinCount === 3, '누를 수 있는 배지 ' + pinCount + '개');
  /* 🎨 <button> 이면 전역 룰에 먹혀 파란 알약이 된다 — span 인지 못 박는다(CLAUDE.md 2장) */
  check('   배지는 <button> 이 아니다 (파란 알약이 되지 않는다)',
    (await ev('document.querySelector("#tc-body .tc-book-pin").tagName')) === 'SPAN');
  const badge = JSON.parse(await ev(`(function(){var e=document.querySelector("#tc-body .tc-book-pin");var s=getComputedStyle(e);
    return JSON.stringify({h:Math.round(e.getBoundingClientRect().height), cur:s.cursor, role:e.getAttribute('role'), tab:e.getAttribute('tabindex')})})()`));
  check('   배지 모양이 그대로다 (높이 30px 이하 · 손가락 커서 · role/tabindex)',
    badge.h <= 30 && badge.cur === 'pointer' && badge.role === 'button' && badge.tab === '0', JSON.stringify(badge));

  await ev('document.querySelector("#tc-body .tc-book-pin").click()');
  await sleep(500);
  check('누르면 배정 창이 열린다', (await ev('(function(){var o=document.getElementById("bat-overlay"); return o ? getComputedStyle(o).display : null})()')) === 'flex');
  const pinned = await ev('document.getElementById("bat-pinned").textContent');
  check('   «이 학생에게만» 이라고 누구인지 못 박는다',
    /이 학생에게만/.test(pinned || '') && /mby1/.test(pinned || ''), String(pinned));
  check('   학생 검색어 칸이 잠긴다 (부분일치로 새지 않게)',
    await ev('!!document.getElementById("bat-q").disabled'));
  /* 🎯 정말 «그 학생만» 나가는지 — 실제 요청 본문을 본다(화면 글자가 아니라) */
  await ev('window.__lastBulkBody = null');
  await ev(`(function(){var b=document.getElementById("bat-book"); b.value='BTS 1 001'; b.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await ev('document.getElementById("bat-preview").click()');
  await sleep(400);
  const body1 = JSON.parse(await ev('JSON.stringify(window.__lastBulkBody)'));
  check('   요청에 그 학생 아이디만 실린다', JSON.stringify(body1 && body1.user_ids) === '["mby1"]', JSON.stringify(body1));
  check('   그때 학생 검색어는 비워 보낸다 (두 조건이 겹치지 않게)', (body1 || {}).q === '', JSON.stringify((body1 || {}).q));

  /* ⛔ 닫은 뒤에도 «그 한 명» 이 남아 있으면, 다음에 「일괄 배정」으로 연 창이 몰래 한 명만
     대상으로 돈다(화면은 «전체» 처럼 보인다). 조용한 사고라 반드시 짝으로 확인한다. */
  await ev('document.getElementById("bat-close").click()');
  await sleep(200);
  await ev('document.getElementById("tc-bulk-book").click()');
  await sleep(400);
  check('창을 닫으면 «이 학생만» 이 풀린다', (await ev('getComputedStyle(document.getElementById("bat-pinned")).display')) === 'none');
  check('   검색어 칸도 다시 열린다', !(await ev('!!document.getElementById("bat-q").disabled')));
  await ev('window.__lastBulkBody = null');
  await ev(`(function(){var b=document.getElementById("bat-book"); b.value='BTS 1 001'; b.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await ev('document.getElementById("bat-preview").click()');
  await sleep(400);
  const body2 = JSON.parse(await ev('JSON.stringify(window.__lastBulkBody)'));
  check('   그 뒤 요청에는 학생 목록이 안 실린다', !(body2 && body2.user_ids), JSON.stringify(body2));
  await ev('document.getElementById("bat-close").click()');
  await sleep(200);
  /* 🔴 이 창을 여는 입구가 셋이다 — 요약 줄 · 배지 · **학생관리 툴바의 「📚 일괄 배정」**.
     마지막 것은 openModal() 을 «직접» 부르므로, 풀어 주는 자리가 여는 함수 안에 없으면
     그 경로로 연 창만 몰래 «한 명» 대상으로 돈다(화면은 «전체» 처럼 보인다).
     ⚠️ 이 검사가 없을 때 그 구멍이 실제로 초록불로 지나갔다 — 반드시 셋째 입구로도 확인한다. */
  await ev('document.querySelector("#tc-body .tc-book-pin").click()');
  await sleep(400);
  await ev('document.getElementById("bat-close").click()');
  await sleep(200);
  const toolbarBtn = await ev('!!document.getElementById("sm-bulk-assign-textbook")');
  check('셋째 입구(학생관리 툴바 버튼)가 실제로 있다 (전제)', toolbarBtn);
  if (toolbarBtn) {
    await ev('document.getElementById("sm-bulk-assign-textbook").click()');
    await sleep(400);
    check('   그 버튼으로 열어도 «이 학생만» 이 안 남는다',
      (await ev('getComputedStyle(document.getElementById("bat-pinned")).display')) === 'none');
    await ev('window.__lastBulkBody = null');
    await ev(`(function(){var b=document.getElementById("bat-book"); b.value='BTS 1 001'; b.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await ev('document.getElementById("bat-preview").click()');
    await sleep(400);
    const body3 = JSON.parse(await ev('JSON.stringify(window.__lastBulkBody)'));
    check('      그 창의 요청에도 학생 목록이 안 실린다', !(body3 && body3.user_ids), JSON.stringify(body3));
    await ev('document.getElementById("bat-close").click()');
    await sleep(200);
  }

  console.log('\n── ⑩ 실패를 «사람 말» 로 하는가 ────────────────────');
  const preview = async fail => {
    await ev(`window.__bulkFail = ${fail ? JSON.stringify(fail) : 'null'}`);
    await ev('document.getElementById("tc-bulk-book").click()');
    await sleep(400);
    await ev(`(function(){var b=document.getElementById("bat-book"); b.value='BTS 1 001'; b.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await ev('document.getElementById("bat-preview").click()');
    await sleep(400);
    const txt = await ev('document.getElementById("bat-status").textContent');
    await ev('document.getElementById("bat-close").click()');
    await sleep(150);
    return txt;
  };
  /* ⚠️ «제대로 센다» 를 짝으로 먼저 본다 — 없으면 「무엇이든 실패로 읽는 코드」가 통과한다 */
  const okTxt = await preview(null);
  check('제대로 되면 대상 인원을 말한다 (3명)', /3/.test(okTxt || '') && !/❌/.test(okTxt || ''), String(okTxt));
  const noScope = await preview({ status: 403, body: { ok: false, error: 'no_scope' } });
  check('403 no_scope → 영문 코드가 아니라 사람 말로 말한다',
    /학생 명부 범위가 없어/.test(noScope || '') && !/no_scope/.test(noScope || ''), String(noScope));
  check('   무엇을 하면 되는지도 말한다 (본사·지사 계정)', /본사나 지사 계정/.test(noScope || ''), String(noScope));
  const tooMany = await preview({ status: 400, body: { ok: false, error: 'too_many_targets', targets: 4210 } });
  check('too_many_targets → 건수와 «좁히라» 를 말한다',
    /4210/.test(tooMany || '') && /좁혀/.test(tooMany || ''), String(tooMany));
  /* 🔴 종단 404 는 `ok` 칸이 없다 — «성공이라고 말했는가» 로 판정하지 않으면 조용히 통과한다 */
  const notFound = await preview({ status: 404, body: { error: 'Not Found', path: '/api/admin/students/bulk-assign-textbook' } });
  check('404(ok 칸 없음) 를 «성공» 으로 읽지 않는다', /❌/.test(notFound || ''), String(notFound));
  check('   배포가 안 나갔을 수 있다고 말한다', /배포가 아직 안 나갔을 수 있습니다/.test(notFound || ''), String(notFound));
  const unknown = await preview({ status: 400, body: { ok: false, error: 'zzz_unknown' } });
  check('모르는 코드는 뭉개지 말고 코드를 함께 보여 준다', /zzz_unknown/.test(unknown || ''), String(unknown));
  await ev('window.__bulkFail = null');

  console.log('\n── ⑨ 🌐 EN 전환을 따라오는가 ───────────────────────');
  /* ⛔ 여기서 tcLoadToday() 를 «손으로» 부르면 안 된다 — 그러면 「render() 가 영어를 낸다」까지만
     증명하고, 정작 매니저가 EN 을 눌렀을 때 표가 안 바뀌는 것을 못 본다(함정 대조에서 잡힌 결함).
     실제 토글 경로 그대로 간다: toggleAdminLang() 이 있으면 그것을, 없으면 adm-core 와 같은 모양으로
     **document** 에 이벤트만 쏜다(CustomEvent 는 bubbles:false 라 window 로 안 올라간다). */
  await ev(`(function(){
    if (typeof toggleAdminLang === 'function') { toggleAdminLang(); return 'toggle'; }
    window.adminLang = 'en';
    if (typeof applyAdminLangDom === 'function') applyAdminLangDom();
    document.dispatchEvent(new CustomEvent('mangoi:lang-changed'));
    return 'event';
  })()`);
  await sleep(800);
  check('EN 을 누른 «그 경로» 로 화면이 영어가 됐다 (손으로 다시 그리지 않았다)',
    (await ev('window.adminLang')) === 'en', String(await ev('window.adminLang')));
  const en = await ev('(function(){var e=document.querySelector("#tc-body #tc-bulk-book"); return e ? e.parentElement.textContent.trim() : null})()');
  check('요약 줄이 영어로 바뀐다', /3 of 4 shown have no textbook/.test(en || ''), String(en));
  check('   버튼 글자도 영어다', /Bulk assign/.test(en || ''), String(en));

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}   FAIL ${FAIL}`);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
