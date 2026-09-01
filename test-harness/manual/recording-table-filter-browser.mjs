// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🔢 녹화 목록 «표 안 필터 + 머리글 정렬» — 진짜 브라우저에 그려서 재는 검사
   (2026-09-01 신설)

   [왜 필요한가] 이 변경에서 틀릴 수 있는 것은 «어떤 행이 남는가»·«무슨 순서로
   그려지는가»·«화살표가 보이는가» 뿐이다. 문자열을 찾는 회귀 하니스는 함수도 값도
   전부 «있다» 고 보고 통과한다(CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」).

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      녹화 목록(js/adm-core.js 의 renderRecordingsTable·_recPassColF·recSortBy)이나
      admin.html 의 그 표 머리글을 건드리면 사람이 직접:
        node test-harness/manual/recording-table-filter-browser.mjs

   ⚠️ /json/new 로 «새 탭» 을 열면 이 컨테이너의 크로미움은 페이지 스크립트를 실행하지 않는다
      — /json/list 의 «이미 있는 탭» 을 잡아 Page.navigate 로 연다(CLAUDE.md 2장).
   ⚠️ 빈 브라우저는 «첫 방문자» 라 환영 오버레이가 스크롤·클릭을 막는다 → 미리 «본 것으로» 표시.
   ⚠️ 고친 파일을 다시 잴 때는 캐시를 우회한다(?_nc=) — 편집 전 사본이 그대로 나온다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.RECF_PORT || 8917);
const CDP  = Number(process.env.RECF_CDP  || 9337);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 씨앗 — 필터 갈래마다 «정확히 한 건씩» 걸리도록 만든 6건 ────────────
   room / teacher / 시간(분) / 크기(MB) / 참가자 / 시선·말하기 / 파일 유무 */
const T0 = Date.parse('2026-09-01T10:00:00+09:00');
const RECS = [
  // id, room, teacher, 시작, 길이, 참가자, 점수, file_url
  { id: 1, room_id: 'class-901', teacher_name: 'Zed',    started_at: T0 - 5000, duration_ms:  30 * 1000,      size_bytes: 0,                  participant_names: '[]',                 consented_user_ids: '[]',      status: 'aborted',       gaze_score: null, speaking_score: null, file_url: null },
  { id: 2, room_id: 'class-902', teacher_name: 'Anna',   started_at: T0 - 4000, duration_ms:  5 * 60 * 1000,  size_bytes: 3 * 1048576,        participant_names: '["a"]',              consented_user_ids: '["a"]',   status: 'completed',     gaze_score: 92,   speaking_score: 88,   file_url: 'class-902/x.webm' },
  { id: 3, room_id: 'class-903', teacher_name: 'Bella',  started_at: T0 - 3000, duration_ms: 20 * 60 * 1000,  size_bytes: 40 * 1048576,       participant_names: '["a","b"]',          consented_user_ids: '["a"]',   status: 'completed',     gaze_score: 60,   speaking_score: 60,   file_url: 'class-903/x.webm' },
  { id: 4, room_id: 'class-904', teacher_name: 'Carl',   started_at: T0 - 2000, duration_ms: 45 * 60 * 1000,  size_bytes: 300 * 1048576,      participant_names: '["a","b","c"]',      consented_user_ids: '["a"]',   status: 'completed',     gaze_score: 20,   speaking_score: 30,   file_url: 'class-904/x.webm' },
  { id: 5, room_id: 'class-905', teacher_name: 'Dora',   started_at: T0 - 1000, duration_ms: 12 * 60 * 1000,  size_bytes: 15 * 1048576,       participant_names: '["a","b"]',          consented_user_ids: '[]',      status: 'upload_failed', gaze_score: null, speaking_score: null, file_url: null },
  { id: 6, room_id: 'class-906', teacher_name: 'Emma',   started_at: T0 - 500,  duration_ms:  8 * 60 * 1000,  size_bytes: 9 * 1048576,        participant_names: '["a"]',              consented_user_ids: '[]',      status: 'completed',     gaze_score: 70,   speaking_score: null, file_url: 'class-906/x.webm' },
];
const BLOBS = RECS.filter(r => r.file_url).map(r => ({ key: r.file_url, url: '/blob/' + r.file_url, size: r.size_bytes, uploaded: new Date(r.started_at + r.duration_ms).toISOString() }));

const BOOT = `
  try {
    localStorage.setItem('mangoi_admin_welcome_v1_done','1');
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ username:'admin', role:'hq_exec' }));
    localStorage.setItem('mangoi_lang','ko');
  } catch(e){}
  (function(){
    var R = ${JSON.stringify(RECS)}, B = ${JSON.stringify(BLOBS)};
    var json = function(body, headers){ return new Response(JSON.stringify(body), { status:200, headers: Object.assign({'content-type':'application/json'}, headers||{}) }); };
    var real = window.fetch.bind(window);
    window.fetch = function(u, o){
      var s = String((u && u.url) || u || '');
      if (s.indexOf('/api/recordings/blob/list') >= 0) return Promise.resolve(json({ items: B }));
      if (s.indexOf('/api/recordings/storage-stats') >= 0) return Promise.resolve(json({ ok:true }));
      if (s.indexOf('/api/recordings') >= 0) return Promise.resolve(json(R, { 'X-Total-Count': String(R.length), 'X-Offset':'0', 'X-Limit':'50' }));
      if (s.indexOf('/api/admin/me') >= 0) return Promise.resolve(json({ ok:true, username:'admin', role:'hq_exec' }));
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
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/admin.html?_nc=${Date.now()}` });
  await sleep(5000);

  const ev = async expr => {
    const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || ''));
    return r.result.value;
  };
  // 관리자 카드는 «한 번에 한 장» 만 보인다(.ia6-hide) — 이 카드를 열어야 «보인다» 검사가 헛돌지 않는다
  await ev('typeof jumpToMenu === "function" ? (jumpToMenu("card-recording-storage"), 1) : 0');
  await sleep(400);
  await ev('window.vcRecordingsShow()');
  await sleep(1500);

  const roomsOf = () => ev('[...document.querySelectorAll("#recordings-table tr")].map(t=>(t.children[0]||{}).textContent||"").join(",")');
  const setF = async (id, v) => { await ev(`(function(){var e=document.getElementById("${id}");e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("${id === 'recf-text' ? 'input' : 'change'}"));})()`); await sleep(150); };

  console.log('\n── ① 표와 필터 줄이 «보이는가» ──────────────────────');
  check('6건이 최신순으로 그려졌다', (await roomsOf()) === 'class-906,class-905,class-904,class-903,class-902,class-901', await roomsOf());
  const cfVis = await ev('(function(){var e=document.getElementById("rec-colfilter");return e?JSON.stringify({d:getComputedStyle(e).display,op:!!e.offsetParent}):null})()');
  check('표 안 필터 줄이 화면에 붙어 있다', /"d":"flex"/.test(cfVis) && /"op":true/.test(cfVis), cfVis);
  const cnt0 = await ev('(document.getElementById("recf-count")||{}).textContent');
  check('「이 쪽 N건 중 M건」을 말한다 (전체를 걸렀다고 오해하지 않게)', /이 쪽 6건 중 6건/.test(cnt0), cnt0);

  console.log('\n── ② 표 안 필터가 «실제로 거르는가» ─────────────────');
  await setF('recf-part', 'high');
  check('참여도 80 이상 → 902 만', (await roomsOf()) === 'class-902', await roomsOf());
  await setF('recf-part', 'low');
  check('참여도 50 미만 → 904 만', (await roomsOf()) === 'class-904', await roomsOf());
  await setF('recf-part', 'na');
  check('참여도 없음 → 905·901 (점수 둘 다 없는 행)', (await roomsOf()) === 'class-905,class-901', await roomsOf());
  const cnt1 = await ev('(document.getElementById("recf-count")||{}).textContent');
  check('걸러졌다는 것을 숫자와 함께 말한다', /이 쪽 6건 중 2건/.test(cnt1) && /걸러짐/.test(cnt1), cnt1);
  await setF('recf-part', 'all');

  await setF('recf-dur', 'lt1');
  check('1분 미만 → 901 만', (await roomsOf()) === 'class-901', await roomsOf());
  await setF('recf-dur', 'gte30');
  check('30분 이상 → 904 만', (await roomsOf()) === 'class-904', await roomsOf());
  await setF('recf-dur', 'all');

  await setF('recf-size', 'gte100');
  check('100MB 이상 → 904 만', (await roomsOf()) === 'class-904', await roomsOf());
  await setF('recf-size', 'zero');
  check('크기 0 → 901 만 (905 는 저장 실패지만 크기가 기록돼 있다)', (await roomsOf()) === 'class-901', await roomsOf());
  await setF('recf-size', 'all');

  await setF('recf-users', '2plus');
  check('참가자 2명 이상 → 905·904·903', (await roomsOf()) === 'class-905,class-904,class-903', await roomsOf());
  await setF('recf-users', '0');
  check('참가자 0명 → 901 만', (await roomsOf()) === 'class-901', await roomsOf());
  await setF('recf-users', 'all');

  await setF('recf-play', 'no');
  check('재생 불가 → 905·901 (영상 파일이 없는 것)', (await roomsOf()) === 'class-905,class-901', await roomsOf());
  await setF('recf-play', 'yes');
  check('재생 가능 → 906·904·903·902', (await roomsOf()) === 'class-906,class-904,class-903,class-902', await roomsOf());
  await setF('recf-play', 'all');

  await setF('recf-text', 'bell');
  check('글자 검색은 교사 이름도 본다(대소문자 무시) → 903', (await roomsOf()) === 'class-903', await roomsOf());
  await setF('recf-text', '905');
  check('방 번호로도 찾는다 → 905', (await roomsOf()) === 'class-905', await roomsOf());

  console.log('\n── ③ 하나도 안 남을 때 «사실» 을 말하는가 ───────────');
  await setF('recf-text', 'zzzz');
  const empty = await ev('(document.querySelector("#recordings-table td.empty")||{}).textContent');
  check('「녹화가 없다」가 아니라 「필터에 맞는 것이 없다」로 말한다', /표 안 필터에 맞는/.test(empty) && /6건 있음/.test(empty), empty);
  await setF('recf-text', '');

  console.log('\n── ④ 머리글 정렬 ───────────────────────────────────');
  await ev('window.recSortBy("dur")'); await sleep(150);
  check('시간 ▲ (짧은 것부터)', (await roomsOf()) === 'class-901,class-902,class-906,class-905,class-903,class-904', await roomsOf());
  const ar1 = await ev('document.querySelector("#card-recording-storage th[data-sk=\'dur\']").getAttribute("data-ar")');
  check('   그 칸 화살표가 ▲ 로 바뀐다', ar1 === '▲', String(ar1));
  await ev('window.recSortBy("dur")'); await sleep(150);
  check('한 번 더 → 시간 ▼ (긴 것부터)', (await roomsOf()) === 'class-904,class-903,class-905,class-906,class-902,class-901', await roomsOf());
  await ev('window.recSortBy("dur")'); await sleep(150);
  check('세 번째 → 원래 순서(서버가 준 최신순 그대로)', (await roomsOf()) === 'class-906,class-905,class-904,class-903,class-902,class-901', await roomsOf());
  const ar2 = await ev('document.querySelector("#card-recording-storage th[data-sk=\'dur\']").getAttribute("data-ar")');
  check('   화살표도 ⇅ 로 돌아온다', ar2 === '⇅', String(ar2));

  await ev('window.recSortBy("part")'); await sleep(150);
  check('참여도 ▲ — 점수 없는 행(905·901)은 방향과 무관하게 «뒤»',
    (await roomsOf()) === 'class-904,class-903,class-906,class-902,class-905,class-901', await roomsOf());
  await ev('window.recSortBy("part")'); await sleep(150);
  check('참여도 ▼ — 이때도 점수 없는 행은 뒤에 남는다',
    (await roomsOf()) === 'class-902,class-906,class-903,class-904,class-905,class-901', await roomsOf());

  console.log('\n── ⑤ 화면 숫자와 정렬이 같은 값을 쓰는가 ────────────');
  /* 총 참여도는 _recPartScore 하나로만 센다. 그린 숫자와 정렬 순서가 어긋나면
     「정렬해 보니 순서가 이상하다」가 된다. */
  /* ⚠️ 칸 번호를 손으로 세지 않는다 — 2026-09-01 에 「학생」 칸이 들어오면서 9 → 10 으로
     밀렸고, 그때 이 검사만 조용히 엉뚱한 칸을 읽었다. 머리글에서 자리를 «찾아» 쓴다. */
  const partIdx = await ev('[...document.querySelectorAll("#rec-table-wrap thead th")].findIndex(e=>e.getAttribute("data-sk")==="part")');
  const drawn = await ev('[...document.querySelectorAll("#recordings-table tr")].map(t=>(t.children[' + partIdx + ']||{}).textContent.trim()).join(",")');
  check('그린 값이 내림차순으로 읽힌다 (90.0,70.0,60.0,25.0,—,—)', drawn === '90.0%,70.0%,60.0%,25.0%,—,—', drawn);

  console.log('\n── ⑥ 초기화 / 정렬 표시 / 언어 ─────────────────────');
  await setF('recf-part', 'high');
  await ev('(function(){document.getElementById("recf-reset").click()})()'); await sleep(200);
  check('초기화 → 6건 전부 돌아온다', (await roomsOf()) === 'class-906,class-905,class-904,class-903,class-902,class-901', await roomsOf());
  check('   정렬도 함께 지워진다', (await ev('document.querySelectorAll("#card-recording-storage th.rec-sort-on").length')) === 0);
  check('   선택 상자도 전부 「전체」로 돌아온다',
    (await ev('["recf-part","recf-dur","recf-size","recf-users","recf-play"].map(i=>document.getElementById(i).value).join(",")')) === 'all,all,all,all,all');

  await ev('window.recSortBy("size")'); await sleep(150);
  const onCls = await ev('(function(){var t=document.querySelector("#card-recording-storage th[data-sk=\'size\']");return JSON.stringify({on:t.classList.contains("rec-sort-on"),cur:getComputedStyle(t).cursor,af:getComputedStyle(t,"::after").content})})()');
  check('정렬 중인 머리글이 강조되고 손가락 커서가 뜬다', /"on":true/.test(onCls) && /pointer/.test(onCls), onCls);
  check('   화살표가 ::after 로 실제 그려진다 (i18n 이 자식을 지워도 살아남음)', /▲|▼/.test(onCls), onCls);

  /* 🌐 EN — i18n 은 [data-ko] 요소의 textContent 를 통째로 덮는다. 머리글 화살표가
     그때 사라지면 안 되고, JS 가 그린 카운트 글자는 영어로 따라와야 한다. */
  await ev('(function(){ window.adminLang="en"; document.dispatchEvent(new CustomEvent("mangoi:lang-changed")); })()');
  await sleep(400);
  const afterEn = await ev('(function(){var t=document.querySelector("#card-recording-storage th[data-sk=\'size\']");return JSON.stringify({txt:t.textContent.trim(),ar:t.getAttribute("data-ar"),af:getComputedStyle(t,"::after").content})})()');
  check('EN 으로 바뀐 뒤에도 화살표가 살아 있다', /"ar":"▲"/.test(afterEn) && /▲/.test(afterEn), afterEn);
  const cntEn = await ev('(document.getElementById("recf-count")||{}).textContent');
  check('카운트 글자도 영어를 따라온다', /This page: 6 of 6/.test(cntEn), cntEn);

  console.log('\n── ⑦ 가로로 밀지 않는가 ────────────────────────────');
  const of = await ev('JSON.stringify({s:document.documentElement.scrollWidth,w:window.innerWidth})');
  const o = JSON.parse(of);
  check('문서가 가로로 넘치지 않는다', o.s <= o.w + 1, of);

  c.close(); bye();
  console.log('\n════════════════════════════════════════════');
  console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}   FAIL ${FAIL}`);
  console.log('════════════════════════════════════════════');
  process.exit(FAIL ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e); process.exit(2); });
