// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🟢 강사 명부 «지금 수업 중» 신호등 — 진짜 브라우저에 그려서 재는 검사
   (2026-08-31 신설)

   [왜 필요한가] 이 변경에서 틀릴 수 있는 것은 «무슨 글자가·무슨 색으로·어느 칸에
   그려졌는가» 와 «버튼이 눌리는가» 뿐이다. 문자열을 찾는 회귀 하니스는 함수도 값도
   전부 «있다» 고 보고 통과한다(CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」).

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      강사 명부 표(js/adm-core.js 의 loadTeacherProfiles·_TP_LIVE 절)를 건드리면 사람이 직접:
        node test-harness/manual/teacher-live-now-browser.mjs

   [어떻게] playwright-core 가 이 컨테이너에 없어서 CDP 를 직접 말한다(Node 22 는 WebSocket 전역).
   ⚠️ /json/new 로 «새 탭» 을 열면 이 컨테이너의 크로미움은 페이지 스크립트를 실행하지 않는다
      — /json/list 의 «이미 있는 탭» 을 잡아 Page.navigate 로 연다(CLAUDE.md 2장).
   ⚠️ 빈 브라우저는 «첫 방문자» 라 환영 오버레이가 스크롤·클릭을 막는다 → 미리 «본 것으로» 표시.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.TPLIVE_PORT || 8913);
const CDP = Number(process.env.TPLIVE_CDP || 9333);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 씨앗 — 네 강사가 서로 다른 상태에 놓이도록 ─────────────────────────── */
const TEACHERS = [
  { id: 1, korean_name: '강선생', english_name: 'Teacher Hannah', status: '활동중', group_name: 'Home based' },
  { id: 2, korean_name: '제니',   english_name: 'Teacher Jenny',  status: '활동중', group_name: 'Home based' },
  { id: 3, korean_name: '케이',   english_name: 'Teacher Kaye',   status: '활동중', group_name: 'Office Teacher' },
  { id: 4, korean_name: '파',     english_name: 'Teacher Far',    status: '활동중', group_name: 'Office Teacher' },
];
const SESSIONS = [
  { room_id: 'class-901-20260831', teacher_name: 'Teacher Hannah', student_name: '김하나', start_time: '19:00', join_open: true },
  { room_id: 'class-902-20260831', teacher_name: 'Teacher Jenny',  student_name: '이두리', start_time: '19:10', join_open: true },
  { room_id: 'c24-778899',         teacher_name: 'Teacher Kaye',   student_name: '박세리', start_time: '19:00', join_open: true },
  { room_id: 'class-903-20260831', teacher_name: 'Teacher Far',    student_name: '최네리', start_time: '22:00', join_open: false },
];
const ACTIVE = [{ roomId: 'class-901-20260831', users: [{ username: 'stu1', role: 'student' }] }];

const BOOT = `
  try {
    localStorage.setItem('mangoi_admin_welcome_v1_done','1');
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ username:'admin', role:'hq_exec' }));
    localStorage.setItem('mangoi_lang','ko');
  } catch(e){}
  (function(){
    var T = ${JSON.stringify(TEACHERS)}, S = ${JSON.stringify(SESSIONS)}, A = ${JSON.stringify(ACTIVE)};
    window.__tpStubHits = { today: 0, rooms: 0, list: 0 };
    var ok = function(body){ return new Response(JSON.stringify(body), { status:200, headers:{'content-type':'application/json'} }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/admin/teacher-profiles') >= 0) { window.__tpStubHits.list++; return Promise.resolve(ok({ ok:true, items:T })); }
      if (s.indexOf('/api/admin/classes/today') >= 0)    { window.__tpStubHits.today++; return Promise.resolve(ok({ ok:true, sessions:S })); }
      if (s.indexOf('/api/active-rooms') >= 0)           { window.__tpStubHits.rooms++; return Promise.resolve(ok(A)); }
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
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html` });
  await sleep(5000);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };

  await ev('typeof loadTeacherProfiles === "function" ? loadTeacherProfiles() : Promise.reject("loadTeacherProfiles 없음")');
  await sleep(1500);

  console.log('\n── ① 표가 그려졌는가 ────────────────────────────────');
  const rows = await ev('document.querySelectorAll("#tp-list-body tr[data-tid]").length');
  check('강사 4명이 data-tid 를 달고 그려진다', rows === 4, 'rows=' + rows);
  const hits = await ev('JSON.stringify(window.__tpStubHits)');
  /* ⚠️ 「1회인가」로 물으면 안 된다 — 화면이 스스로 한 번, 이 검사가 한 번 그리므로 늘 2 다.
     물어야 할 것은 «표를 그린 횟수와 같은가»(=강사 수만큼 부르지 않는가) 이다. */
  const H = JSON.parse(hits);
  check('classes/today 를 «표당 한 번» 부른다 (강사 수만큼 아님)', H.today === H.list && H.today > 0, hits);
  const th = await ev('[...document.querySelectorAll("#tp-list-table thead th")].map(e=>e.textContent.trim()).join("|")');
  check('머리칸에 「지금」이 상태 바로 뒤에 있다', /상태\|지금/.test(th), th);

  console.log('\n── ② 상태가 갈려서 그려졌는가 ───────────────────────');
  const cell = async id => ev(`(function(){var e=document.getElementById("tpnow-${id}");return e?e.textContent.trim():null})()`);
  const color = async id => ev(`(function(){var e=document.querySelector("#tpnow-${id} span");return e?getComputedStyle(e).color:null})()`);
  const c1 = await cell(1), c2 = await cell(2), c3 = await cell(3), c4 = await cell(4);
  check('🟢 방이 실제로 열린 강사 = 「수업 중」', /수업 중/.test(c1), c1);
  check('   학생·시각을 함께 적는다', /19:00/.test(c1) && /김하나/.test(c1), c1);
  check('🟡 예약은 지금인데 방이 빈 강사 = 「수업 시간」', /수업 시간/.test(c2), c2);
  check('⚪ 카페24 수업 강사 = 「카페24」', /카페24/.test(c3), c3);
  check('— 수업이 없는 강사는 비워 둔다', c4 === '—', c4);
  const col1 = await color(1);
  check('초록이 admin-inline-c.css 에 안 먹힌다 (인라인 !important)', col1 === 'rgb(22, 163, 74)', col1);

  console.log('\n── ③ 👁 버튼이 «눌리는가» ───────────────────────────');
  const btn = async id => ev(`(function(){var b=document.getElementById("tpobs-${id}");return b?JSON.stringify({d:b.disabled,o:getComputedStyle(b).opacity,t:b.title}):null})()`);
  const b1 = JSON.parse(await btn(1)), b3 = JSON.parse(await btn(3)), b4 = JSON.parse(await btn(4));
  check('수업 중인 강사는 진하게 + 눌린다', b1.d === false && Number(b1.o) > 0.9, JSON.stringify(b1));
  check('카페24 강사는 흐리고 안 눌린다', b3.d === true && Number(b3.o) < 0.5, JSON.stringify(b3));
  check('   이유를 툴팁이 말한다 (참관할 방이 없다)', /카페24/.test(b3.t), b3.t);
  check('수업 없는 강사도 흐리고 안 눌린다', b4.d === true, JSON.stringify(b4));
  check('   이유를 툴팁이 말한다', /진행 중인 수업이 없/.test(b4.t), b4.t);
  /* 「버튼이 있다」와 「손이 닿는다」는 다르다 — 맨 위가 그 버튼인지 잰다 */
  const top1 = await ev(`(function(){var b=document.getElementById("tpobs-1");b.scrollIntoView({block:"center"});var r=b.getBoundingClientRect();
    var el=document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2)[0]; return el ? (el.id||el.tagName) : null})()`);
  check('그 버튼이 화면 맨 위다 (무엇에도 안 덮인다)', top1 === 'tpobs-1', String(top1));

  console.log('\n── ④ 요약과 「수업 중만 보기」 ──────────────────────');
  const sum = await ev('(document.getElementById("tp-live-summary")||{}).textContent');
  check('요약이 세 상태를 갈라서 센다', /수업 중 1/.test(sum) && /수업 시간 1/.test(sum) && /카페24 1/.test(sum), sum);
  check('   요약에 data-ko/data-en 이 함께 박힌다 (🌐 대응)',
    await ev('!!(document.getElementById("tp-live-summary")||{}).getAttribute && !!document.getElementById("tp-live-summary").getAttribute("data-en")'));
  await ev('window.tpToggleLiveOnly()');
  await sleep(200);
  const vis = await ev('[...document.querySelectorAll("#tp-list-body tr[data-tid]")].map(t=>t.getAttribute("data-tid")+":"+(t.style.display==="none"?"hide":"show")).join(",")');
  check('수업 중만 보기 → 수업 없는 강사만 숨는다 (카페24는 남는다)', vis === '1:show,2:show,3:show,4:hide', vis);
  const lbl = await ev('(document.getElementById("tp-live-only")||{}).textContent');
  check('   버튼 글자가 되돌아가는 길을 말한다', /전체 강사/.test(lbl), lbl);
  await ev('window.tpToggleLiveOnly()');
  await sleep(200);
  const vis2 = await ev('[...document.querySelectorAll("#tp-list-body tr[data-tid]")].filter(t=>t.style.display==="none").length');
  check('다시 누르면 전부 돌아온다', vis2 === 0, String(vis2));

  console.log('\n── ⑤ 칸을 하나 늘려도 화면이 안 밀리는가 ────────────');
  const of = await ev('JSON.stringify({s:document.documentElement.scrollWidth,w:window.innerWidth})');
  const o = JSON.parse(of);
  check('문서가 가로로 넘치지 않는다 (표는 상자 안에서 구른다)', o.s <= o.w + 1, of);

  console.log('\n── ⑥ 🌐 EN 전환을 따라오는가 ───────────────────────');
  await ev('(function(){ window.adminLang="en"; document.dispatchEvent(new CustomEvent("mangoi:lang-changed")); })()');
  await sleep(250);
  const en1 = await cell(1), enSum = await ev('(document.getElementById("tp-live-summary")||{}).textContent');
  check('배지가 영어로 바뀐다', /In class/.test(en1), en1);
  check('요약도 영어로 바뀐다', /In class 1/.test(enSum), enSum);

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}   FAIL ${FAIL}`);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
