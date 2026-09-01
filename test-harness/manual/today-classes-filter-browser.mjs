// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🔎 「🚪 오늘 수업」 출처 고르기 + 검색창 — 진짜 브라우저에 그려서 재는 검사
   (2026-09-01 신설)

   [왜 필요한가] 이 변경에서 틀릴 수 있는 것은 «누른 뒤 표에 무엇이 남는가» 와
   «비었을 때 이유를 말하는가» 뿐이다. 문자열 회귀 하니스는 함수도 값도 전부 «있다» 고
   보고 통과한다(CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」).

   ⚠️ manual/ 규약상 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      js/adm-today-classes.js 의 render()·srcFilter()·bind() 를 건드리면 사람이 직접:
        node test-harness/manual/today-classes-filter-browser.mjs

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
const PORT = Number(process.env.TCF_PORT || 8917);
const CDP = Number(process.env.TCF_CDP || 9337);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 씨앗 — 카페24 3건 + 망고아이 2건(하나는 지금 입장가능) ────────────── */
const NOW = Date.now();
const SESSIONS = [
  { source: 'mangoi', schedule_id: 1015, observable: true, room_id: 'class-1015-20260901',
    student_uid: 'yse', student_name: '유세영', teacher_name: 'FAR', level: 'Lv 3', textbook: '',
    textbook_assigned: false, start_time: '14:00', start_ts: NOW + 60000, end_ts: NOW + 1800000,
    status: 'live', join_open: true, is_level_test: false },
  { source: 'mangoi', schedule_id: 1016, observable: true, room_id: 'class-1016-20260901',
    student_uid: 'jjy', student_name: '장지웅', teacher_name: 'HANNAH', level: 'Lv 5', textbook: 'BTS 2 001',
    textbook_assigned: true, start_time: '22:00', start_ts: NOW + 9e6, end_ts: NOW + 9e6 + 18e5,
    status: 'early', join_open: false, is_level_test: false },
  { source: 'cafe24', schedule_id: null, observable: false, room_id: 'c24-512074',
    student_uid: 'mai', student_name: 'MANGO AI', teacher_name: 'Teacher Far', level: null, textbook: null,
    textbook_assigned: false, start_time: '14:00', start_ts: NOW, end_ts: NOW + 12e5,
    status: 'live', join_open: false, is_level_test: false },
  { source: 'cafe24', schedule_id: null, observable: false, room_id: 'c24-512075',
    student_uid: 'hwa', student_name: '화2시그룹', teacher_name: 'Teacher Kaye', level: null, textbook: null,
    textbook_assigned: false, start_time: '14:20', start_ts: NOW, end_ts: NOW + 12e5,
    status: 'live', join_open: false, is_level_test: false },
  { source: 'cafe24', schedule_id: null, observable: false, room_id: 'c24-512076',
    student_uid: 'jes', student_name: '조은서', teacher_name: 'Teacher Len', level: null, textbook: null,
    textbook_assigned: false, start_time: '15:00', start_ts: NOW, end_ts: NOW + 12e5,
    status: 'live', join_open: false, is_level_test: false },
];

const BOOT = `
  try {
    localStorage.setItem('mangoi_admin_welcome_v1_done','1');
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ username:'admin', role:'hq_exec' }));
    localStorage.setItem('mangoi_lang','ko');
  } catch(e){}
  (function(){
    var S = ${JSON.stringify(SESSIONS)};
    window.__tcHits = 0;
    var ok = function(body){ return new Response(JSON.stringify(body), { status:200, headers:{'content-type':'application/json'} }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/admin/classes/today') >= 0) { window.__tcHits++; return Promise.resolve(ok({ ok:true, sessions:S })); }
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
  /* ⚠️ 헤드리스 창은 «포커스가 없는 창» 이라 el.focus() 가 통째로 안 먹는다 — 그대로 재면
     멀쩡한 화면이 「커서가 날아간다」로 나온다(검사 환경 문제. CLAUDE.md 2장). 강제로 켠다. */
  try { await c.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html` });
  await sleep(5000);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };
  const names = () => ev('[...document.querySelectorAll("#tc-body tbody tr td:nth-child(3) b")].map(e=>e.textContent.trim()).join(",")');
  const setQ = async v => ev(`(function(){var e=document.getElementById("tc-q");e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("input",{bubbles:true}));})()`);
  const setSrc = async v => ev(`(function(){var e=document.getElementById("tc-source");e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("change",{bubbles:true}));})()`);

  /* ⚠️ 관리자 카드는 «한 번에 한 장» 만 보인다(IA6 의 .ia6-hide = display:none). 그대로 재면
     표는 DOM 에 있는데 상자가 통째로 숨어 있어 «보인다·눌린다» 검사가 전부 헛돈다
     (실측: offsetParent=null · 폭 0). jumpToMenu 로 그 카드를 먼저 연다(CLAUDE.md 2장). */
  await ev('typeof jumpToMenu === "function" ? (jumpToMenu("card-students-mgmt"), 1) : 0');
  await sleep(400);
  await ev('(function(){var d=document.getElementById("sm-today-classes"); if(d) d.open=true;})()');
  await ev('typeof tcLoadToday === "function" ? tcLoadToday() : Promise.reject("tcLoadToday 없음")');
  await sleep(900);

  console.log('\n── ① 컨트롤이 툴바에 그려졌는가 ─────────────────────');
  check('출처 고르기(#tc-source)가 있다', await ev('!!document.getElementById("tc-source")'));
  check('검색창(#tc-q)이 있다', await ev('!!document.getElementById("tc-q")'));
  /* ⚠️ 입력칸이 #tc-body «안» 이면 다시 그릴 때 포커스가 날아가 「한 글자만 쳐진다」가 된다 */
  check('둘 다 #tc-body «밖» 이다 (다시 그려도 커서가 살아 있다)',
    await ev('!document.getElementById("tc-body").contains(document.getElementById("tc-q")) && !document.getElementById("tc-body").contains(document.getElementById("tc-source"))'));
  check('출처 선택지는 전체·망고아이·카페24 셋이다',
    (await ev('[...document.querySelectorAll("#tc-source option")].map(o=>o.value).join(",")')) === ',mangoi,cafe24');
  /* ⚠️ 순서는 «지금 입장가능이 먼저, 그다음 시작시각» 이다(tcLoadToday 의 정렬) — 22시 수업이 맨 뒤 */
  check('처음에는 5건 다 보인다', (await names()) === '유세영,MANGO AI,화2시그룹,조은서,장지웅', await names());
  const cnt0 = await ev('document.getElementById("tc-count").textContent');
  check('건수가 카페24·망고아이를 갈라서 센다', /카페24 3건/.test(cnt0) && /망고아이 2건/.test(cnt0), cnt0);
  check('   거르기 전에는 «표시 N건» 을 안 붙인다 (숫자가 두 번 나오면 헷갈린다)', !/표시/.test(cnt0), cnt0);

  console.log('\n── ② 출처로 가르는가 ────────────────────────────────');
  await setSrc('mangoi'); await sleep(120);
  check('망고아이만 → 새로 넣은 수업 2건', (await names()) === '유세영,장지웅', await names());
  check('   LMS 배지가 한 줄도 없다', (await ev('document.querySelectorAll("#tc-body tbody tr").length')) === 2
    && !/LMS/.test(await ev('document.getElementById("tc-body").textContent')));
  const cntM = await ev('document.getElementById("tc-count").textContent');
  check('   «표시 2건 / 전체 5건» 처럼 둘 다 말한다', /표시 2건/.test(cntM) && /5건/.test(cntM), cntM);
  await setSrc('cafe24'); await sleep(120);
  check('카페24만 → 3건', (await names()) === 'MANGO AI,화2시그룹,조은서', await names());
  await setSrc(''); await sleep(120);
  check('전체로 되돌리면 5건이 돌아온다', (await ev('document.querySelectorAll("#tc-body tbody tr").length')) === 5);

  console.log('\n── ③ 검색이 훑는 칸 ─────────────────────────────────');
  await setQ('장지웅'); await sleep(120);
  check('학생 이름으로 찾는다', (await names()) === '장지웅', await names());
  await setQ('hannah'); await sleep(120);
  check('강사 이름 · 대소문자를 안 가린다', (await names()) === '장지웅', await names());
  await setQ('c24-512075'); await sleep(120);
  check('강의실 번호로 찾는다 (옮겨 적을 일이 없게)', (await names()) === '화2시그룹', await names());
  await setQ('BTS'); await sleep(120);
  check('교재로도 찾는다', (await names()) === '장지웅', await names());
  await setQ(''); await sleep(120);
  check('비우면 전부 돌아온다', (await ev('document.querySelectorAll("#tc-body tbody tr").length')) === 5);

  console.log('\n── ④ 서버를 다시 부르지 않는가 ──────────────────────');
  const hits = await ev('window.__tcHits');
  await setSrc('cafe24'); await setQ('조은'); await sleep(150);
  check('출처·검색은 화면 안에서만 거른다 (요청 0건)', (await ev('window.__tcHits')) === hits, 'hits=' + hits);

  console.log('\n── ⑤ 0건일 때 «왜» 를 말하는가 ──────────────────────');
  await setQ('없는이름zzz'); await sleep(150);
  const empty = await ev('document.getElementById("tc-body").textContent');
  check('조건에 맞는 수업이 없다고 말한다', /조건에 맞는 수업이 없습니다/.test(empty), empty.slice(0, 120));
  check('   무엇으로 걸렀는지 그 자리에 적는다', /없는이름zzz/.test(empty) && /카페24/.test(empty), empty.slice(0, 160));
  check('   전체 건수도 함께 적는다 (수업이 사라진 게 아님)', /전체 5건/.test(empty), empty.slice(0, 160));
  await setQ(''); await setSrc('cafe24');
  await ev('(function(){var c=document.getElementById("tc-only-live");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await sleep(150);
  const empty2 = await ev('document.getElementById("tc-body").textContent');
  /* ⚠️ 카페24 줄은 join_open 이 «항상 false» 라 이 조합은 0건이 정상이다 — 그때도 이유를 말해야 한다 */
  check('카페24 + 「지금 입장가능만」 = 0건이지만 이유를 말한다',
    /조건에 맞는 수업이 없습니다/.test(empty2) && /지금 입장가능만/.test(empty2), empty2.slice(0, 160));
  await ev('(function(){var c=document.getElementById("tc-only-live");c.checked=false;c.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await setSrc(''); await sleep(150);

  console.log('\n── ⑥ 검색 중 커서가 살아 있는가 ─────────────────────');
  await ev('document.getElementById("tc-q").focus()');
  check('검색창이 실제로 화면에 있다 (카드가 열려 있다)', await ev('!!document.getElementById("tc-q").offsetParent'));
  await ev('document.getElementById("tc-q").focus()');
  await setQ('유세'); await sleep(150);
  const af = await ev('document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null');
  check('다시 그린 뒤에도 포커스가 검색창에 남는다', af === 'tc-q', String(af));
  await setQ(''); await sleep(120);

  console.log('\n── ⑦ 화면이 안 밀리는가 ────────────────────────────');
  const of = JSON.parse(await ev('JSON.stringify({s:document.documentElement.scrollWidth,w:window.innerWidth})'));
  check('문서가 가로로 넘치지 않는다', of.s <= of.w + 1, JSON.stringify(of));
  /* 「보인다」와 「손이 닿는다」는 다르다 — 맨 위가 그 입력칸인지 잰다 */
  const top = await ev(`(function(){var b=document.getElementById("tc-q");b.scrollIntoView({block:"center"});var r=b.getBoundingClientRect();
    var el=document.elementsFromPoint(r.left+r.width/2, r.top+r.height/2)[0]; return el ? (el.id||el.tagName) : null})()`);
  check('검색창이 화면 맨 위다 (무엇에도 안 덮인다)', top === 'tc-q', String(top));

  /* 📱 좁은 폰 폭 — 새 칸을 툴바에 넣으면 여기서만 가로로 밀린다(넓은 창에서는 재현 안 됨.
     CLAUDE.md 2장 「넓은 창에서는 재현이 안 됩니다」). 툴바가 flex-wrap 이라 줄로 접혀야 한다. */
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const ofM = JSON.parse(await ev('JSON.stringify({s:document.documentElement.scrollWidth,w:window.innerWidth})'));
  check('390px 폰 폭에서도 문서가 가로로 안 넘친다', ofM.s <= ofM.w + 1, JSON.stringify(ofM));
  const wq = await ev('JSON.stringify({q:Math.round(document.getElementById("tc-q").getBoundingClientRect().width),s:Math.round(document.getElementById("tc-source").getBoundingClientRect().width),w:innerWidth})');
  check('   검색창·출처칸이 화면 폭 안에 들어온다', JSON.parse(wq).q <= JSON.parse(wq).w && JSON.parse(wq).s <= JSON.parse(wq).w, wq);
  await c.send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

  console.log('\n── ⑧ 🌐 EN 전환을 따라오는가 ───────────────────────');
  /* ⚠️ 관리자 화면의 정적 라벨 적용 정본은 adm-core.js 의 applyAdminLangDom() 이다
     (mango-i18n.js 는 이 화면에서 안 싣는다 — teacher_feedback_admin_harness 가 그것을 못 박는다). */
  await ev('(function(){ window.adminLang="en"; applyAdminLangDom(); document.dispatchEvent(new CustomEvent("mangoi:lang-changed")); })()');
  await sleep(300);
  const enOpt = await ev('[...document.querySelectorAll("#tc-source option")].map(o=>o.textContent.trim()).join("|")');
  check('출처 선택지가 영어로 바뀐다', /All/.test(enOpt) && /Mangoi/.test(enOpt), enOpt);
  const ph = await ev('document.getElementById("tc-q").placeholder');
  check('검색창 안내글도 영어로 바뀐다 (data-ko-ph/data-en-ph)', /Search/.test(ph), ph);

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}   FAIL ${FAIL}`);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
