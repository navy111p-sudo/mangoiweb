// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🎓 녹화 목록 「학생」 칸 — 진짜 브라우저에 그려서 재는 검사 (2026-09-01 신설)

   [왜 필요한가] 칸을 하나 늘리는 변경에서 틀릴 수 있는 것은 «머리칸과 몸칸이 어긋나
   한 칸씩 밀리는가»·«글자가 실제로 그려지는가»·«표가 가로로 넘치는가» 뿐이다.
   문자열을 찾는 회귀 하니스는 값도 함수도 전부 «있다» 고 보고 통과한다
   (CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」).

   ⚠️ manual/ 규약상 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      녹화 목록 표(js/adm-core.js 의 renderRecordingsTable)를 건드리면 사람이 직접:
        node test-harness/manual/recording-student-column-browser.mjs

   ⚠️ /json/new 로 «새 탭» 을 열면 이 컨테이너의 크로미움이 페이지 스크립트를 실행하지 않는다
      → /json/list 의 «이미 있는 탭» 을 잡아 Page.navigate 로 연다(CLAUDE.md 2장).
   ⚠️ 빈 브라우저는 «첫 방문자» 라 환영 오버레이가 스크롤·클릭을 막는다 → 미리 «본 것으로».
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.RECSTU_PORT || 8917);
const CDP  = Number(process.env.RECSTU_CDP  || 9337);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 서버 응답 씨앗 — D1 실측 모양 그대로(임시 접속번호가 이름 자리에 섞여 있다) */
const NOW = Date.now();
const RECS = [
  { id: 1, room_id: 'class-1086-20260901', teacher_name: 'cys01', teacher_id: 'u_a',
    started_at: NOW - 600000, duration_ms: 300000, size_bytes: 1600000, status: 'completed',
    file_url: 'rec/a.webm', storage: 'r2',
    participant_names: '["cys01","w1hxlzisk4v5q4yzutktq","최윤서"]',
    consented_user_ids: '["cys01"]',
    students: [{ uid: 'cys01', name: '최윤서', scheduled: true }] },
  { id: 2, room_id: 'class-1078-20260901', teacher_name: '교사 Teacher - Krystel', teacher_id: 'u_b',
    started_at: NOW - 1200000, duration_ms: 1369000, size_bytes: 216600000, status: 'completed',
    file_url: 'rec/b.webm', storage: 'r2',
    participant_names: '["교사 Teacher - Krystel","김선우"]', consented_user_ids: '["jye46712"]',
    students: [{ uid: 'jye46712', name: '김선우', scheduled: true }, { uid: 'heyst', name: '김사랑' }] },
  { id: 3, room_id: 'mangoi-class', teacher_name: 'heyst', teacher_id: 'u_c',
    started_at: NOW - 1800000, duration_ms: 17000, size_bytes: 2200000, status: 'upload_failed',
    participant_names: '["heyst"]', consented_user_ids: '[]', students: [] },
];

const BOOT = `
  try {
    localStorage.setItem('mangoi_admin_welcome_v1_done','1');
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ username:'admin', role:'hq_exec' }));
    localStorage.setItem('mangoi_lang','ko');
  } catch(e){}
  (function(){
    var R = ${JSON.stringify(RECS)};
    var ok = function(body, headers){ return new Response(JSON.stringify(body), { status:200,
      headers: Object.assign({'content-type':'application/json'}, headers||{}) }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/recordings/blob/list') >= 0) return Promise.resolve(ok({ items: [] }));
      if (s.indexOf('/api/recordings/storage-stats') >= 0) return Promise.resolve(ok({ ok:true }));
      if (s.indexOf('/api/recordings') >= 0 && s.indexOf('/api/recordings/') < 0)
        return Promise.resolve(ok(R, { 'X-Total-Count':'3', 'X-Offset':'0', 'X-Limit':'50' }));
      if (s.indexOf('/api/admin/me') >= 0) return Promise.resolve(ok({ ok:true, username:'admin', role:'hq_exec' }));
      return real(u, o);
    };
  })();
`;

async function cdp() {
  const r = await fetch('http://127.0.0.1:' + CDP + '/json/list');
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
    '--remote-debugging-port=' + CDP, '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
  const bye = () => { try { br.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', bye);
  await sleep(2200);

  const c = await cdp();
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  // ⚠️ 고친 사본을 보려고 캐시를 비켜 간다(로컬 서버가 옛 사본을 준 실측이 있다 — CLAUDE.md 2장)
  await c.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/admin.html?_nc=' + Date.now() });
  await sleep(5000);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  };

  await ev('typeof jumpToMenu === "function" ? jumpToMenu("card-recording-storage") : 0');
  await ev('typeof vcRecordingsShow === "function" ? vcRecordingsShow() : Promise.reject("vcRecordingsShow 없음")');
  await sleep(1800);

  console.log('\n── ① 표가 그려졌는가 ────────────────────────────────');
  const nRows = await ev('document.querySelectorAll("#recordings-table tr").length');
  check('녹화 3건이 그려진다', nRows === 3, 'rows=' + nRows);

  console.log('\n── ② 머리칸과 몸칸이 어긋나지 않는가 ────────────────');
  const th = await ev('[...document.querySelectorAll("#rec-table-wrap thead th")].map(e=>e.textContent.trim()).join("|")');
  const nTd = await ev('document.querySelectorAll("#recordings-table tr:first-child td").length');
  check('머리칸에 「학생」이 「교사」 바로 뒤에 있다', /방\|교사\|학생\|시작/.test(th), th);
  check('머리칸 수 = 몸칸 수 (한 칸씩 밀리지 않는다)',
    th.split('|').length === nTd, 'th=' + th.split('|').length + ' td=' + nTd);

  console.log('\n── ③ 학생이 «보이는가» ─────────────────────────────');
  const cell = async i => ev('(function(){var t=document.querySelectorAll("#recordings-table tr")[' + i + '];return t?t.cells[2].textContent.trim():null})()');
  const tip  = async i => ev('(function(){var t=document.querySelectorAll("#recordings-table tr")[' + i + '];var s=t&&t.cells[2].querySelector("[title]");return s?s.getAttribute("title"):null})()');
  const c0 = await cell(0), c1 = await cell(1), c2 = await cell(2);
  check('예약 수업은 학생 이름을 적는다', c0 === '최윤서', c0);
  check('   계정은 툴팁으로 함께 알려 준다', /계정: cys01/.test(await tip(0)), await tip(0));
  check('여러 명이면 예약 학생이 맨 앞', /^김선우/.test(c1), c1);
  check('공용방처럼 학생을 모르면 «—» 와 이유를 말한다',
    c2 === '—' && /로그인/.test(await tip(2)), c2 + ' / ' + (await tip(2)));
  const bold = await ev('(function(){var s=document.querySelectorAll("#recordings-table tr")[0].cells[2].querySelector("span");return s?getComputedStyle(s).fontWeight:null})()');
  check('예약의 학생은 굵게 그려진다', String(bold) === '700' || Number(bold) >= 700, String(bold));
  /* 임시 접속번호(participant_names 에 섞여 있는 값)가 학생 칸에 새어 나오면 안 된다 */
  const all = await ev('[...document.querySelectorAll("#recordings-table tr")].map(t=>t.cells[2].textContent).join(" ")');
  check('임시 접속번호가 학생 칸에 새지 않는다', !/[a-z0-9]{18,}/.test(all), all);

  console.log('\n── ③-2 머리글 정렬이 학생 칸에도 먹는가 ───────────');
  /* 2026-09-01 에 머리글 정렬(▲▼)이 들어오면서 모든 칸이 정렬 가능해졌다.
     학생 칸만 «누르면 아무 일도 안 일어나는» 칸으로 남으면 그것이 고장으로 읽힌다. */
  await ev('typeof recSortBy === "function" ? recSortBy("student") : Promise.reject("recSortBy 없음")');
  await sleep(200);
  const sorted = await ev('[...document.querySelectorAll("#recordings-table tr")].map(t=>t.cells[2].textContent.trim()).join("|")');
  check('학생 이름 올림순으로 정렬된다 (모르는 행은 뒤로)', sorted === '김선우, 김사랑|최윤서|—', sorted);
  await ev('recSortBy("student"); recSortBy("student")');   // ▼ → 원래 순서
  await sleep(200);
  const back = await ev('[...document.querySelectorAll("#recordings-table tr")].map(t=>t.cells[2].textContent.trim()).join("|")');
  check('세 번 누르면 원래 순서로 돌아온다', back === '최윤서|김선우, 김사랑|—', back);

  console.log('\n── ④ 칸을 하나 늘려도 화면이 안 밀리는가 ────────────');
  const o = JSON.parse(await ev('JSON.stringify({s:document.documentElement.scrollWidth,w:window.innerWidth})'));
  check('문서가 가로로 넘치지 않는다', o.s <= o.w + 1, JSON.stringify(o));

  console.log('\n── ⑤ 「녹화 없음」 줄도 표 폭을 맞추는가 ───────────');
  const cs = await ev('(function(){window._unifiedRecRows=[];renderRecordingsTable();' +
    'var td=document.querySelector("#recordings-table td");return td?td.getAttribute("colspan"):null})()');
  check('빈 줄 colspan 이 머리칸 수와 같다', String(cs) === String(th.split('|').length), 'colspan=' + cs);

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log('  ' + (FAIL ? '⚠' : '✅') + ' PASS ' + PASS + '   FAIL ' + FAIL);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
