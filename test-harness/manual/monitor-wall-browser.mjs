/**
 * monitor-wall-browser.mjs — 🗼 수업 관제탑 «진짜 브라우저» 검사 (2026-08-30)
 *
 * 왜 필요한가
 *   문자열 하니스(monitor_wall_harness)는 «그 줄이 있는가» 까지만 본다. 이 화면에서 정작
 *   무너지는 것은 «그려지는가 · 걸러지는가 · 눌리는가» 다 — 검색이 실제로 줄을 줄이는지,
 *   정렬이 순서를 바꾸는지, 순회 참관이 창 주소를 바꾸는지, 강사에게는 목록이 안 뜨는지.
 *   (CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」)
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 이라 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      node test-harness/manual/monitor-wall-browser.mjs
 *
 * 방법
 *   · public/ 을 로컬 HTTP 로 띄운다 (file:// 로 열면 절대경로 자산이 전부 404 — 2장 함정)
 *   · 이미 열려 있는 탭을 /json/list 로 잡아 Page.navigate 한다
 *     ⛔ /json/new 로 «새 탭» 을 만들면 이 컨테이너의 크로미움은 페이지 스크립트를 실행하지
 *        않는다(에러도 없이). 멀쩡한 화면을 «JS 가 죽었다» 로 오진하게 된다 — 2장 함정.
 *   · API 는 addScriptToEvaluateOnNewDocument 로 fetch 를 갈아끼워 가짜 응답을 준다.
 *     window.open 도 가짜로 바꿔 실제 수업 화면을 열지 않고 «어디로 가려 했는지» 만 기록한다.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8931, CDP = 9331;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
const no = (m) => { fail++; console.log(`  ❌ ${m}`); };
const check = (m, c) => c ? ok(m) : no(m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── 가짜 서버 응답 ─────────────────────────────────────────────────────
   방 3개: 정상 2명 · 혼자 대기 1명 · 회선 나쁨 2명. 예약 수업 1건(방 없음). */
const STUB = `
window.__calls = [];
window.__opened = [];
const J = (o, extra) => new Response(JSON.stringify(o), Object.assign({ status: 200,
  headers: { 'Content-Type': 'application/json' } }, extra || {}));
window.fetch = function (url, opt) {
  const u = String(url);
  window.__calls.push({ url: u, method: (opt && opt.method) || 'GET', body: (opt && opt.body) || '' });
  if (u.indexOf('/api/active-rooms') === 0) return Promise.resolve(J([
    { roomId: 'class-190-20260830', userCount: 2, observerCount: 0, users: [{ username: 'Teacher Len' }, { username: 'jiho' }] },
    { roomId: 'class-187-20260830', userCount: 1, observerCount: 0, users: [{ username: 'seoyun' }] },
    { roomId: 'class-182-20260830', userCount: 3, observerCount: 1, users: [{ username: 'Teacher Ana' }, { username: 'hajun' }, { username: 'mina' }] }
  ]));
  if (u.indexOf('/api/admin/classes-now') === 0) {
    if (window.__asTeacher) return Promise.resolve(J({ ok: false, error: 'forbidden_teacher' }, { status: 403 }));
    return Promise.resolve(J({ ok: true, counts: { now: 4, soon: 1, connected: 3 }, classes: [
      { start_kst: '15:20', end_kst: '15:40', phase: 'soon', student_name: '최민서', teacher_name: 'Teacher Rica', connected: false }
    ] }));
  }
  if (u.indexOf('/api/admin/alerts') === 0) return Promise.resolve(J({ ok: true, items: [
    { room_id: 'class-182-20260830', alert_type: 'silence_20s', acknowledged_at: null }
  ] }));
  if (u.indexOf('/api/admin/vc/quality') === 0) return Promise.resolve(J({ ok: true, mins: 5, rooms: [
    { room: 'class-190-20260830', avg_loss: 0.4, worst_loss: 1.1, avg_rtt: 88, windows: 4 },
    { room: 'class-182-20260830', avg_loss: 9.2, worst_loss: 14, avg_rtt: 610, windows: 3 }
  ] }));
  if (u.indexOf('/api/admin/live-classes') === 0) return Promise.resolve(J({ ok: true, rooms: {
    'class-190-20260830': { teacher_name: 'Teacher Len', student_name: '김지호', start_time: '15:00' },
    'class-187-20260830': { teacher_name: 'Teacher Sid', student_name: '박서윤', start_time: '15:00' },
    'class-182-20260830': { teacher_name: 'Teacher Ana', student_name: '이하준', start_time: '14:30' }
  } }));
  if (u.indexOf('/api/turn-config') === 0) return Promise.resolve(J({ ok: true },
    { headers: { 'Content-Type': 'application/json', 'x-turn-source': 'kv-cache', 'x-turn-detail': 'cache' } }));
  if (u.indexOf('/api/admin/ghost/start') === 0) return Promise.resolve(J({ ok: true, observation_id: 7 }));
  if (u.indexOf('/force-end') >= 0) return Promise.resolve(J({ ok: true, notified: 2 }));
  return Promise.resolve(J({ ok: true }));
};
/* 창을 실제로 열지 않는다 — 어디로 가려 했는지만 적어 둔다 */
window.open = function (url, name) {
  const rec = { url: String(url), name: String(name || ''), closed: false, hops: [] };
  window.__opened.push(rec);
  const w = { closed: false, hops: rec.hops };
  Object.defineProperty(w, 'location', {
    get(){ return { get href(){ return rec.url; }, set href(v){ rec.url = String(v); rec.hops.push(String(v)); } }; },
    set(v){ rec.url = String(v); rec.hops.push(String(v)); }
  });
  return w;
};
window.confirm = function (m) { window.__lastConfirm = m; return true; };
window.prompt = function (m) { window.__lastPrompt = m; return '테스트 사유'; };
window.alert = function (m) { window.__lastAlert = m; };
try { localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'admin' })); } catch (e) {}
try { localStorage.removeItem('mangoi_mw_sort'); localStorage.removeItem('mangoi_mw_poll'); } catch (e) {}
`;

/* ── CDP 최소 클라이언트 ─────────────────────────────────────────────── */
async function cdp() {
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('열린 탭이 없습니다');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waits = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  };
  const send = (method, params) => new Promise((res) => { waits.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''));
    return r.result?.result?.value;
  };
  return { send, evalJs, close: () => ws.close() };
}

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUB, stdio: 'ignore' });
  const br = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`,
    '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  const done = () => { try { srv.kill(); } catch (e) {} try { br.kill(); } catch (e) {} };
  try {
    await sleep(2500);
    const c = await cdp();
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    const url = `http://127.0.0.1:${PORT}/admin/monitor-wall.html`;

    console.log('monitor-wall-browser — 관제탑이 실제로 그려지고 눌리는가\n');

    /* ── 1부 · 표가 그려지는가 ── */
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    await c.send('Page.navigate', { url });
    await sleep(1800);

    const rows = await c.evalJs(`document.querySelectorAll('#rooms tr[data-room]').length`);
    check(`① 화상방 3개가 표의 줄로 그려진다 (실측 ${rows}줄)`, rows === 3);

    const first = await c.evalJs(`document.querySelector('#rooms tr[data-room]').getAttribute('data-room')`);
    check(`①-2 기본 정렬이 «심각한 것부터» — 알림 있는 방이 맨 위 (실측 ${first})`, first === 'class-182-20260830');

    const who = await c.evalJs(`document.querySelector('#rooms tr[data-room] td.who').textContent.trim()`);
    check(`①-3 방 번호가 아니라 사람 이름이 앞에 온다 (실측 «${who.slice(0, 24)}»)`, /Teacher Ana/.test(who) && /이하준/.test(who));

    const sig = await c.evalJs(`document.querySelector('#rooms tr[data-room="class-182-20260830"]').querySelectorAll('td.n')[1].textContent.trim()`);
    check(`① -4 회선 신호등이 나쁜 방을 🔴 로 표시 (실측 «${sig}»)`, sig.indexOf('🔴') === 0 && /610ms/.test(sig));

    const noSample = await c.evalJs(`document.querySelector('#rooms tr[data-room="class-187-20260830"]').querySelectorAll('td.n')[1].textContent.trim()`);
    check(`①-5 표본이 없는 방은 «—» (0% 로 채우지 않는다) (실측 «${noSample}»)`, noSample === '—');

    const chips = await c.evalJs(`document.getElementById('chips').textContent`);
    check(`①-6 상태등 줄에 «영상 중계 정상» 이 뜬다 (x-turn-source 헤더)`, /영상 중계 정상/.test(chips));

    const overflow = await c.evalJs(`document.documentElement.scrollWidth <= window.innerWidth + 1`);
    check('①-7 표가 넓어도 문서가 옆으로 밀리지 않는다 (상자 안에서 스크롤)', overflow === true);

    /* ── 1-b · 「🚨 지금 손봐야 할 방」 상자 (2026-09-13 D안 · 함정 대조 후속) ── */
    const urgN = await c.evalJs(`document.querySelectorAll('#urgent .u').length`);
    check(`①-8 급한 방 상자에 심각도 1 이상인 수업방만 뜬다 — 알림 1 + 혼자 1 (실측 ${urgN}줄)`, urgN === 2);
    const urgFirst = await c.evalJs(`document.querySelector('#urgent .u button[data-room]')?.getAttribute('data-room')`);
    check(`①-9 상자 첫 줄이 알림 있는 방이고 버튼이 data-room 을 든다 (실측 ${urgFirst})`, urgFirst === 'class-182-20260830');
    const urgObs = await c.evalJs(`document.querySelector('#urgent .u .badge')?.textContent || ''`);
    check(`①-10 상자에도 참관 인원(관찰 1/4)이 보인다 (실측 «${urgObs}»)`, /1\/4/.test(urgObs));
    /* hover 게이트 — 상자 위에 마우스가 있는 동안은 표도 상자도 다시 그리지 않는다 */
    await c.evalJs(`(function(){ document.getElementById('urgent').dispatchEvent(new PointerEvent('pointerenter'));
      const q=document.getElementById('q'); q.value='Len'; q.dispatchEvent(new Event('input')); return 1; })()`);
    const heldRows = await c.evalJs(`document.querySelectorAll('#rooms tr[data-room]').length`);
    check(`①-11 상자 위에 마우스가 있으면 검색해도 표가 갈리지 않는다 (실측 ${heldRows}줄, 3이어야)`, heldRows === 3);
    await c.evalJs(`(function(){ document.getElementById('urgent').dispatchEvent(new PointerEvent('pointerleave')); return 1; })()`);
    const releasedRows = await c.evalJs(`document.querySelectorAll('#rooms tr[data-room]').length`);
    check(`①-12 마우스가 떠나면 미뤄 둔 그리기가 바로 된다 (실측 ${releasedRows}줄, 1이어야)`, releasedRows === 1);
    await c.evalJs(`(function(){ const q=document.getElementById('q'); q.value=''; q.dispatchEvent(new Event('input')); return 1; })()`);

    /* ── 2부 · 검색·정렬이 실제로 듣는가 ── */
    await c.evalJs(`(function(){ const q=document.getElementById('q'); q.value='Len';
      q.dispatchEvent(new Event('input')); return 1; })()`);
    const nLen = await c.evalJs(`document.querySelectorAll('#rooms tr[data-room]').length`);
    check(`② 검색 «Len» → 1줄만 남는다 (실측 ${nLen}줄)`, nLen === 1);

    await c.evalJs(`(function(){ const q=document.getElementById('q'); q.value='박서윤';
      q.dispatchEvent(new Event('input')); return 1; })()`);
    const nKo = await c.evalJs(`document.querySelector('#rooms tr[data-room]')?.getAttribute('data-room')`);
    check(`②-2 학생 이름(한글)으로도 찾는다 (실측 ${nKo})`, nKo === 'class-187-20260830');

    await c.evalJs(`(function(){ const q=document.getElementById('q'); q.value='';
      q.dispatchEvent(new Event('input'));
      const s=document.getElementById('sel-sort'); s.value='people';
      s.dispatchEvent(new Event('change')); return 1; })()`);
    const byPeople = await c.evalJs(`document.querySelector('#rooms tr[data-room]').getAttribute('data-room')`);
    check(`②-3 «인원» 정렬 → 3명 방이 맨 위 (실측 ${byPeople})`, byPeople === 'class-182-20260830');

    await c.evalJs(`(function(){ const s=document.getElementById('sel-sort'); s.value='time';
      s.dispatchEvent(new Event('change')); return 1; })()`);
    const byTime = await c.evalJs(`document.querySelector('#rooms tr[data-room]').getAttribute('data-room')`);
    check(`②-4 «시작 시각» 정렬 → 14:30 수업이 맨 위 (실측 ${byTime})`, byTime === 'class-182-20260830');

    /* ── 3부 · 순회 참관 ── */
    await c.evalJs(`(function(){ const s=document.getElementById('sel-sort'); s.value='sev';
      s.dispatchEvent(new Event('change'));
      document.getElementById('btn-rot').click(); return 1; })()`);
    await sleep(300);
    const rotOpen = await c.evalJs(`JSON.stringify(window.__opened.map(o=>({name:o.name,url:o.url,hops:o.hops.length})))`);
    check(`③ 순회 시작 → 이름 있는 창 하나를 열고 그 창을 참관 주소로 보낸다 (${rotOpen})`,
          /mangoiObserveRotate/.test(rotOpen) && /observe%3D|observe=/.test(rotOpen));

    const barShown = await c.evalJs(`!document.getElementById('rotbar').hidden && document.getElementById('rotbar').textContent`);
    check(`③-2 순회 줄이 «몇 번째 / 몇 개 / 다음 몇 초» 를 보여 준다`,
          typeof barShown === 'string' && /1 \/ 3/.test(barShown) && /다음/.test(barShown));

    const audit1 = await c.evalJs(`window.__calls.filter(c=>c.url.indexOf('/api/admin/ghost/start')===0).length`);
    check(`③-3 첫 방에 들어갈 때 참관 기록이 남는다 (실측 ${audit1}건)`, audit1 === 1);

    await c.evalJs(`document.getElementById('rb-next').click()`);
    await sleep(200);
    const hops = await c.evalJs(`window.__opened[0].hops.length`);
    const audit2 = await c.evalJs(`window.__calls.filter(c=>c.url.indexOf('/api/admin/ghost/start')===0).length`);
    check(`③-4 «다음 방» → 창을 새로 열지 않고 같은 창의 주소만 바꾼다 (이동 ${hops}회, 창 ${await c.evalJs('window.__opened.length')}개)`,
          hops === 2 && (await c.evalJs('window.__opened.length')) === 1);
    check(`③-5 옮길 때마다 참관 기록이 또 남는다 (실측 ${audit2}건)`, audit2 === 2);

    const heldTxt = await c.evalJs(`(function(){ document.getElementById('rb-hold').click();
      return document.getElementById('rotbar').textContent; })()`);
    check('③-6 «이 방에 머물기» 를 누르면 순회가 멈춘다', /머무는 중/.test(heldTxt));

    await c.evalJs(`document.getElementById('rb-stop').click()`);
    const barHidden = await c.evalJs(`document.getElementById('rotbar').hidden === true`);
    check('③-7 «정지» 를 누르면 순회 줄이 사라진다', barHidden === true);

    /* ── 4부 · 강제 종료 (되돌릴 수 없는 조작) ── */
    await c.evalJs(`document.querySelector('#rooms tr[data-room="class-190-20260830"] button[data-act="end"]').click()`);
    await sleep(400);
    const conf = await c.evalJs(`window.__lastConfirm || ''`);
    const prom = await c.evalJs(`window.__lastPrompt || ''`);
    const ended = await c.evalJs(`window.__calls.filter(c=>c.url.indexOf('/force-end')>=0).map(c=>c.url+' '+c.body)[0] || ''`);
    check(`④ 강제 종료가 확인창에 «누구의 수업인지» 를 함께 보여 준다`, /Teacher Len/.test(conf) && /김지호/.test(conf));
    check('④-2 사유를 물어본다', /사유/.test(prom));
    check(`④-3 그 방의 force-end 를 부르고 사유를 함께 보낸다 (${ended.slice(0, 70)})`,
          /class-190-20260830\/force-end/.test(ended) && /테스트 사유/.test(ended));

    /* ── 5부 · 강사 계정은 목록 자체를 못 본다 ── */
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__asTeacher = true;' });
    await c.send('Page.navigate', { url: url + '?t=' + Date.now() });
    await sleep(1600);
    const tRows = await c.evalJs(`document.querySelectorAll('#rooms tr[data-room]').length`);
    const warn = await c.evalJs(`document.getElementById('auth-warn').textContent`);
    check(`⑤ 강사 계정에는 방이 한 줄도 안 그려진다 (실측 ${tRows}줄)`, tRows === 0);
    check('⑤-2 왜 안 보이는지 화면이 말한다 (본사·매니저 전용)', /본사·매니저 전용/.test(warn));

    c.close();
  } finally { done(); }

  console.log(`\n  결과: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e.message); process.exit(2); });
