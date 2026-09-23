// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🏫 「오늘 수업」 학원·강사 드롭다운 — 진짜 브라우저에 그려서 재는 검사 (2026-09-23 신설)

   [왜] 매니저 Karl 요청 «list of academies and list of teachers, instead of typing them».
        틀릴 수 있는 것은 «고른 뒤 무엇이 남는가»·«목록이 무엇을 담는가»·«0건일 때 이유를 말하는가» 뿐이라
        문자열 하니스로는 못 본다. admin.html(js/adm-today-classes.js) · manager.html 두 화면을 다 잰다.

   ⚠️ manual/ 규약상 게이트가 물어 가지 않는다. 그 두 곳의 드롭다운을 건드리면 사람이 직접:
        node test-harness/manual/today-class-pickers-browser.mjs
   [어떻게] CDP 직접(playwright 없음). ⚠️ /json/new 새 탭은 스크립트를 안 돌린다 → /json/list 의 탭.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.TCP_PORT || 8941);
const CDP = Number(process.env.TCP_CDP || 9351);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 씨앗 — BNJ 3건(강사 둘, 카페24 1) · CAG 1건 · 학원 없음 1건 · 공백만 다른 BNJ 1건 · 강사 미배정 1건 */
const NOW = Date.now();
const mk = (o) => Object.assign({ source: 'mangoi', observable: true, level: null, textbook: 'BTS 1',
  textbook_assigned: true, status: 'early', join_open: false, can_move: true, is_level_test: false,
  start_ts: NOW + 36e5, end_ts: NOW + 36e5 + 12e5 }, o);
const SESSIONS = [
  mk({ schedule_id: 1, room_id: 'class-1-x', student_uid: 'a1', student_name: '가학생', teacher_name: 'FAR', academy: 'BNJ어학원', start_time: '14:00' }),
  mk({ schedule_id: 2, room_id: 'class-2-x', student_uid: 'a2', student_name: '나학생', teacher_name: 'HANNAH', academy: 'BNJ어학원', start_time: '14:20' }),
  mk({ source: 'cafe24', schedule_id: null, observable: false, room_id: 'c24-9', student_uid: 'a3', student_name: '다학생', teacher_name: 'FAR', academy: 'BNJ  어학원', start_time: '14:40' }),
  mk({ schedule_id: 4, room_id: 'class-4-x', student_uid: 'a4', student_name: '라학생', teacher_name: 'HANNAH', academy: 'CAG영수학원', start_time: '15:00' }),
  mk({ schedule_id: 5, room_id: 'class-5-x', student_uid: 'a5', student_name: '마학생', teacher_name: 'Kaye', academy: '', start_time: '15:20' }),
  mk({ schedule_id: 6, room_id: 'class-6-x', student_uid: 'a6', student_name: '바학생', teacher_name: null, academy: 'CAG영수학원', start_time: '15:40' }),
];
/* ⚠️ 'BNJ  어학원'(공백 둘)은 'BNJ어학원' 과 «다른» 이름이다 — 공백 «축약» 만 같게 보므로(`BNJ 어학원` ≠ `BNJ어학원`)
   여기서는 목록에 두 항목이 나와야 정상이다. 공백 축약이 실제로 일하는지는 자동 하니스가 본다. */

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
      if (s.indexOf('/api/admin/classes/today') >= 0) { window.__tcHits++; return Promise.resolve(ok({ ok:true, date:'2026-09-23', sessions:S, counts:{ cafe24:1, joinable:0 } })); }
      /* 🏫 일괄 연기 — 요청을 적어 두고, 수업 2번 접수만 거절해 «실패해도 계속» 을 본다 */
      if (s.indexOf('/api/admin/schedule-requests') >= 0) {
        var b = {}; try { b = JSON.parse((o && o.body) || '{}'); } catch(e){}
        (window.__bkLog = window.__bkLog || []).push({ u: s.split('/api/')[1], b: b });
        if (s.indexOf('/decide') >= 0) return Promise.resolve(ok({ ok:true, applied:'postponed' }));
        if (b.schedule_id === 2) return Promise.resolve(new Response(JSON.stringify({ ok:false, error:'forbidden_scope' }), { status:403, headers:{'content-type':'application/json'} }));
        return Promise.resolve(ok({ ok:true, id: 900 + b.schedule_id }));
      }
      if (s.indexOf('/api/admin/me') >= 0) return Promise.resolve(ok({ ok:true, username:'admin', role:'hq', scope_type:'hq', name:'Admin' }));
      if (s.indexOf('/api/') >= 0) return Promise.resolve(ok({ ok:true }));
      return real(u, o);
    };
  })();
`;

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
  await c.send('Network.enable');
  /* 캐시·서비스워커 두 겹 다 끈다 — 고친 뒤 옛 사본을 재지 않게(CLAUDE.md 2장) */
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await c.send('Network.setBypassServiceWorker', { bypass: true }); } catch (e) {}
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };
  const pick = (id, v) => ev(`(function(){var e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("change",{bubbles:true}));})()`);
  const opts = id => ev(`[...document.querySelectorAll("#${id} option")].map(o=>o.value+"="+o.textContent.trim()).join("|")`);

  /* ═════════ A. admin.html 「오늘 수업」 ═════════ */
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html?_nc=${Date.now()}` });
  await sleep(5000);
  await ev('typeof jumpToMenu === "function" ? (jumpToMenu("card-students-mgmt"), 1) : 0');
  await sleep(400);
  await ev('(function(){var d=document.getElementById("sm-today-classes"); if(d) d.open=true;})()');
  await ev('typeof tcLoadToday === "function" ? tcLoadToday() : Promise.reject("tcLoadToday 없음")');
  await sleep(900);
  const names = () => ev('[...document.querySelectorAll("#tc-body tbody tr td:nth-child(4) b")].map(e=>e.textContent.trim()).sort().join(",")');

  console.log('\n── A① 관리자: 드롭다운이 툴바에 있고 «그날 줄» 로 채워지는가 ──');
  check('학원·강사 드롭다운이 있다', await ev('!!document.getElementById("tc-academy") && !!document.getElementById("tc-teacher")'));
  check('   둘 다 #tc-body «밖» 이다 (다시 그려도 선택이 안 날아간다)',
    await ev('!document.getElementById("tc-body").contains(document.getElementById("tc-academy"))'));
  check('   화면에 실제로 보인다 (카드가 열려 있다)', await ev('!!document.getElementById("tc-academy").offsetParent'));
  const acO = await opts('tc-academy');
  check('학원 목록 = 전체 + 그날 학원(건수) + «(학원 미지정)» 맨 끝',
    acO === '=전체|BNJ 어학원=BNJ 어학원 (1)|BNJ어학원=BNJ어학원 (2)|CAG영수학원=CAG영수학원 (2)|__none__=(학원 미지정) (1)', acO);
  const teO = await opts('tc-teacher');
  check('강사 목록 = 그날 강사(건수) + «(강사 미배정)» 맨 끝',
    teO === '=전체|FAR=FAR (2)|HANNAH=HANNAH (2)|Kaye=Kaye (1)|__none__=(강사 미배정) (1)', teO);
  check('처음에는 6건 다 보인다', (await names()).split(',').length === 6, await names());

  console.log('\n── A② 관리자: 고르면 그 학원만 · 강사 목록이 따라 좁혀지는가 ──');
  const hits = await ev('window.__tcHits');
  await pick('tc-academy', 'BNJ어학원'); await sleep(150);
  check('BNJ어학원 → 가학생·나학생 2건', (await names()) === '가학생,나학생', await names());
  check('   강사 목록이 그 학원 강사(FAR·HANNAH)로 좁혀진다',
    (await opts('tc-teacher')) === '=전체|FAR=FAR (1)|HANNAH=HANNAH (1)', await opts('tc-teacher'));
  const sum = await ev('(document.querySelector("#tc-body .tc-ac-sum")||{}).textContent||""');
  check('   「그 학원 오늘 한눈에」 요약 줄을 그린다(건수·강사 수)', /BNJ어학원/.test(sum) && /2건/.test(sum) && /강사 2명/.test(sum), sum);
  await pick('tc-teacher', 'HANNAH'); await sleep(150);
  check('학원 + 강사 → 나학생 1건', (await names()) === '나학생', await names());
  check('   학원 목록도 그 강사 학원(BNJ·CAG)으로 좁혀지고 고른 값이 남는다',
    (await opts('tc-academy')) === '=전체|BNJ어학원=BNJ어학원 (1)|CAG영수학원=CAG영수학원 (1)'
    && (await ev('document.getElementById("tc-academy").value')) === 'BNJ어학원', await opts('tc-academy'));
  await pick('tc-academy', ''); await pick('tc-teacher', '__none__'); await sleep(150);
  check('«(강사 미배정)» → 강사 없는 바학생 1건', (await names()) === '바학생', await names());
  await pick('tc-teacher', ''); await pick('tc-academy', '__none__'); await sleep(150);
  check('«(학원 미지정)» → 학원 없는 마학생 1건', (await names()) === '마학생', await names());
  await pick('tc-academy', 'BNJ 어학원'); await sleep(150);
  const sumC = await ev('(document.querySelector("#tc-body .tc-ac-sum")||{}).textContent||""');
  check('카페24만 있는 학원 → 「여기서 옮길 수 없다」를 말한다', /카페24 1/.test(sumC) && /옮길 수 없습니다/.test(sumC), sumC);
  check('   화면 안에서만 거른다 (서버 요청 0건)', (await ev('window.__tcHits')) === hits);

  console.log('\n── A③ 관리자: 0건이면 이유를 말하는가 · 다른 필터와 함께 걸리는가 ──');
  await pick('tc-academy', 'BNJ어학원');
  await ev('(function(){var e=document.getElementById("tc-q");e.value="라학생";e.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await sleep(150);
  const empty = await ev('document.getElementById("tc-body").textContent');
  check('BNJ + 「라학생」 검색 = 0건 · «조건에 맞는 수업이 없습니다» + 고른 학원을 적는다',
    /조건에 맞는 수업이 없습니다/.test(empty) && /BNJ어학원/.test(empty) && /전체 6건/.test(empty), empty.slice(0, 160));
  await ev('(function(){var e=document.getElementById("tc-q");e.value="";e.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await pick('tc-academy', ''); await sleep(150);
  check('전체로 되돌리면 6건 · 요약 줄이 사라진다',
    (await names()).split(',').length === 6 && !(await ev('!!document.querySelector("#tc-body .tc-ac-sum")')));

  console.log('\n── A⑤ 관리자: 학원 한꺼번에 연기 ──');
  await pick('tc-academy', 'BNJ어학원'); await sleep(200);
  check('학원을 고르면 «한꺼번에 연기» 버튼이 보인다', await ev('!!(document.getElementById("tc-bulk-postpone")||{}).offsetParent'));
  await ev('document.getElementById("tc-bulk-postpone").click()'); await sleep(300);
  check('   누르면 창이 뜬다', await ev('!!document.getElementById("tc-bulk-modal")'));
  check('   옮길 두 줄(1·2번)에 체크가 있다', (await ev('[...document.querySelectorAll("#tc-bulk-modal [data-bk-sid]")].map(e=>e.getAttribute("data-bk-sid")+":"+e.checked).join(",")')) === '1:true,2:true');
  await ev('document.querySelector("#tc-bulk-modal").remove()');
  await pick('tc-academy', 'BNJ 어학원'); await sleep(200);
  await ev('document.getElementById("tc-bulk-postpone").click()'); await sleep(300);
  const skipT = await ev('document.getElementById("tc-bk-list").textContent');
  check('   카페24 줄은 체크 없이 «카페24에서 직접» 으로 따로 보인다', /카페24/.test(skipT) && !(await ev('!!document.querySelector("#tc-bulk-modal [data-bk-sid]")')), skipT.slice(0, 120));
  check('   옮길 것이 없으면 실행 버튼을 안 준다', !(await ev('!!document.getElementById("tc-bk-go")')));
  await ev('document.getElementById("tc-bk-close").click()'); await sleep(150);
  check('   닫기로 닫힌다', !(await ev('!!document.getElementById("tc-bulk-modal")')));
  await pick('tc-academy', 'BNJ어학원'); await sleep(200);
  await ev('document.getElementById("tc-bulk-postpone").click()'); await sleep(300);
  await ev('window.__bkLog=[]; window.confirm=function(q){ window.__bkAsk=q; return true; }; document.getElementById("tc-bk-reason").value="학원 휴원"; document.getElementById("tc-bk-go").click()');
  await sleep(1200);
  const log = await ev('JSON.stringify(window.__bkLog)');
  const L = JSON.parse(log || '[]');
  check('   1번은 접수→승인 두 요청, 2번은 접수만(거절) — 순서대로',
    L.map(x => x.u + '#' + (x.b.schedule_id || x.b.id)).join(',') === 'admin/schedule-requests#1,admin/schedule-requests/decide#901,admin/schedule-requests#2', log);
  check('   ⛔ request_type 은 postpone 이고 사유가 실린다', L.length && L[0].b.request_type === 'postpone' && L[0].b.reason === '학원 휴원', log.slice(0, 200));
  const res = await ev('[...document.querySelectorAll("#tc-bulk-modal [data-bk-res]")].map(e=>e.textContent).join("|")');
  check('   줄마다 결과(성공·실패 이유)가 적힌다', /연기됨/.test(res) && /권한/.test(res), res);
  check('   합계를 말한다', /연기 1건/.test(await ev('document.getElementById("tc-bk-msg").textContent')), await ev('document.getElementById("tc-bk-msg").textContent'));
  const hits0 = await ev('window.__tcHits');
  await ev('document.getElementById("tc-bk-close").click()'); await sleep(500);
  check('   닫으면 목록을 다시 불러온다', (await ev('window.__tcHits')) > hits0);
  await pick('tc-academy', ''); await sleep(150);
  check('학원을 «전체» 로 두면 버튼이 없다 (짝)', !(await ev('!!document.getElementById("tc-bulk-postpone")')));

  console.log('\n── A④ 관리자: EN ──');
  await ev('(function(){ window.adminLang="en"; if (typeof applyAdminLangDom==="function") applyAdminLangDom(); document.dispatchEvent(new CustomEvent("mangoi:lang-changed")); })()');
  await sleep(250);
  const acEn = await opts('tc-academy');
  check('EN 으로 바꾸면 «All»·«(no academy)» 로 다시 그린다', /=All\|/.test(acEn) && /\(no academy\)/.test(acEn), acEn);

  /* ═════════ B. manager.html 「오늘 전체 수업」 ═════════ */
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/manager.html?_nc=${Date.now()}` });
  await sleep(3500);
  await ev('(function(){ try{localStorage.setItem("mangoi_lang","ko");}catch(e){} var h=document.getElementById("hqCards"); if(h) h.hidden=false; var d=document.getElementById("c-today"); d.open=true; if (typeof loadTodayAll==="function") loadTodayAll(); })()');
  await sleep(900);
  const mnames = () => ev('[...document.querySelectorAll("#todayAllBody .row")].map(r=>(r.textContent.match(/[가-바]학생/)||[""])[0]).sort().join(",")');

  console.log('\n── B① 매니저: 드롭다운이 있고 같은 목록인가 ──');
  check('학원·강사 드롭다운이 있다', await ev('!!document.getElementById("taAcademy") && !!document.getElementById("taTeacher")'));
  check('   화면에 실제로 보인다', await ev('!!document.getElementById("taAcademy").offsetParent'));
  const mac = await opts('taAcademy');
  check('학원 목록이 관리자 화면과 같은 값·같은 차례다(글자만 언어 차이)',
    mac.split('|').map(x => x.split('=')[0]).join('|') === acO.split('|').map(x => x.split('=')[0]).join('|'), mac);
  check('처음에는 6건 다 보인다', (await mnames()).split(',').length === 6, await mnames());

  console.log('\n── B② 매니저: 고르면 거르고 숫자도 눈앞의 줄로 센다 ──');
  await pick('taAcademy', 'BNJ어학원'); await sleep(150);
  check('BNJ어학원 → 가학생·나학생', (await mnames()) === '가학생,나학생', await mnames());
  const head = await ev('document.getElementById("todayAllBody").textContent');
  check('   머리줄이 «전체 6건 중 2건 · 강사 2명» 을 말한다', /전체 6건 중 2건/.test(head) && /강사 2명/.test(head), head.slice(0, 160));
  check('   서버 합계(카페24 1건)를 그대로 쓰지 않는다 — 눈앞 2건에는 카페24가 없다', !/카페24 1건/.test(head), head.slice(0, 200));
  check('   강사 목록이 따라 좁혀진다', (await opts('taTeacher')).split('|').map(x => x.split('=')[0]).join('|') === '|FAR|HANNAH', await opts('taTeacher'));
  await pick('taTeacher', 'Kaye'); await sleep(150);
  check('그 학원에 없는 강사를 고를 수 없다(목록에 없다 → 값이 남지 않는다)',
    (await ev('document.getElementById("taTeacher").value')) === '', await ev('document.getElementById("taTeacher").value'));
  await pick('taAcademy', 'CAG영수학원'); await pick('taTeacher', 'HANNAH'); await sleep(150);
  check('CAG + HANNAH → 라학생', (await mnames()) === '라학생', await mnames());
  await pick('taTeacher', ''); await pick('taAcademy', ''); await sleep(150);
  check('전체로 되돌리면 6건', (await mnames()).split(',').length === 6, await mnames());

  console.log('\n── B③ 매니저: 학원 한꺼번에 연기 ──');
  await pick('taAcademy', 'CAG영수학원'); await sleep(150);
  check('학원을 고르면 버튼(data-bulk)이 보인다', await ev('!!(document.querySelector("#todayAllBody [data-bulk]")||{}).offsetParent'));
  await ev('document.querySelector("#todayAllBody [data-bulk]").click()'); await sleep(1500);
  check('   누르면 같은 창이 뜬다 (파일을 그때 받는다)', await ev('!!document.getElementById("tc-bulk-modal")'));
  check('   4번·6번 두 줄', (await ev('[...document.querySelectorAll("#tc-bulk-modal [data-bk-sid]")].map(e=>e.getAttribute("data-bk-sid")).join(",")')) === '4,6');
  await ev('document.getElementById("tc-bk-close").click()'); await sleep(150);
  await pick('taAcademy', ''); await sleep(150);
  check('전체로 두면 버튼이 없다 (짝)', !(await ev('!!document.querySelector("#todayAllBody [data-bulk]")')));

  console.log('\n── B④ 매니저: 머리글 «본사(전체)» 가 한 글자씩 쪼개지지 않는다 ──');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev('(function(){ document.getElementById("scopeLbl").textContent="Manager"; document.getElementById("scopeName").textContent="본사(전체)"; })()');
  await sleep(200);
  const hn = await ev('(function(){var b=document.getElementById("scopeName"),r=document.createRange();r.selectNodeContents(b);var ys={};[...r.getClientRects()].forEach(function(x){ys[Math.round(x.top)]=1});return Object.keys(ys).length;})()');
  check('760px 에서 한 줄', hn === 1, hn + '줄');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  const hn2 = await ev('(function(){var b=document.getElementById("scopeName"),r=document.createRange();r.selectNodeContents(b);var ys={};[...r.getClientRects()].forEach(function(x){ys[Math.round(x.top)]=1});return Object.keys(ys).length;})()');
  check('390px(폰)에서도 한 줄', hn2 === 1, hn2 + '줄');
  check('   가로로 넘치지 않는다', await ev('document.documentElement.scrollWidth <= innerWidth'));

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}   FAIL ${FAIL}`);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
