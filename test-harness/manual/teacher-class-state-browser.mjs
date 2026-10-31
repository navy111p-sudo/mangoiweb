/* 수동 브라우저 검사 — 교사 화면 «오늘의 수업» 상태 표시 (2026-10-01).
   B: 제목 아래 상태별 개수 칩(PC·폰) · D: PC 폭에서만 입장 버튼 자리에 «⏸ 연기됨 · 누가·언제» 상자 ·
   A: 폰에서는 상자를 숨기고 이름 아래 «기다리지 않아도 됩니다» 한 줄.
   ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다: node test-harness/manual/teacher-class-state-browser.mjs
   변이시험: TEACHER_SRC=<고친 사본 경로> 로 그 사본을 teacher.html 대신 띄웁니다(저장소 파일을 안 건드림). */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(ROOT, 'cloudflare-deploy', 'public');

function findChrome() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(base, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return null;
}
const CHROME = findChrome();
if (!CHROME) { console.log('⏭  건너뜀 — Chromium 을 찾지 못했습니다'); process.exit(0); }
if (typeof WebSocket !== 'function') { console.log('⏭  건너뜀 — Node 에 전역 WebSocket 이 없습니다(Node 22+ 필요)'); process.exit(0); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer(); s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; console.log('  ❌ FAIL ' + name + (detail ? '  — ' + detail : '')); }
}


// ── 스텁: 오늘 수업 5줄 — 예정·연기(누가·언제 있음)·취소·노쇼·완료 ────────────────
const KST_TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function mk(id, minsFromNow, over) {
  const start = Date.now() + minsFromNow * 60e3;
  return Object.assign({
    kind: 'class', schedule_id: id, room_id: 'class-' + id + '-20261001',
    start_time: '1' + id + ':00', start_ts: start, end_ts: start + 20 * 60e3,
    open_at_ts: start - 10 * 60e3, close_at_ts: start + 35 * 60e3,
    enter_from_ts: start - 12 * 3600e3, enter_until_ts: start + 12 * 3600e3,
    duration_min: 20, student_name: '학생' + id, student_uid: 'stu' + id, class_state: 'scheduled',
    level: 'Lv 3', class_kind: 'regular',
  }, over || {});
}
const POST_AT = Date.UTC(2026, 9, 1, 4, 55);   // 13:55 KST
const CLASSES = [
  mk(1, 120),
  mk(2, 60,  { class_state: 'postponed', postponed_info: { at: POST_AT, by: 'Maimai (본사 매니저)' } }),
  mk(3, 90,  { class_state: 'cancelled' }),
  mk(4, -30, { class_state: 'no_show', no_show_role: 'student' }),
  mk(5, -200, { class_state: 'done' }),
];
const TEACHER_SRC = process.env.TEACHER_SRC || '';   // 변이시험용 사본 경로(선택)
// ── 서버·브라우저 기동 ──────────────────────────────────────────────────
const httpPort = await freePort();
const cdpPort = await freePort();
const srv = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'],
  { cwd: PUBLIC_DIR, stdio: 'ignore' });
const udd = mkdtempSync(join(tmpdir(), 'tjrs-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + udd, 'about:blank'], { stdio: 'ignore' });
function cleanup() { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} }
process.on('exit', cleanup);

const BASE = 'http://127.0.0.1:' + httpPort;
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json();
    target = list.find(t => t.type === 'page');
  } catch {}
}
for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/teacher.html'); break; } catch { await sleep(250); } }
if (!target) { console.log('❌ CDP 탭을 찾지 못했습니다'); cleanup(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0; const pending = new Map(); const listeners = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  for (const l of listeners) l(m);
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
  return r.result.value;
};

const pageErrors = [];
listeners.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});


function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }
listeners.push(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = m.params;
  const u = new URL(request.url);
  const reply = (obj) => send('Fetch.fulfillRequest', { requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
    body: b64(JSON.stringify(obj)) });
  try {
    if (u.pathname === '/teacher.html' && TEACHER_SRC) {
      const fs = await import('node:fs');
      return await send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: b64(fs.readFileSync(TEACHER_SRC, 'utf8')) });
    }
    if (u.pathname === '/api/teacher/portal' && !u.search)
      return await reply({ ok: true, now: Date.now(), today: KST_TODAY,
        me: { name: 'Farrah', username: 'mangoi_018', lang: 'ko' },
        classes: CLASSES, upcoming: [], notices: [], resources: [], rating: {} });
    return await reply({ ok: false, error: 'stub' });
  } catch (e) {}
});

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Network.setCacheDisabled', { cacheDisabled: true });
const pats = [{ urlPattern: '*/api/*' }]; if (TEACHER_SRC) pats.push({ urlPattern: '*/teacher.html*' });
await send('Fetch.enable', { patterns: pats });
await send('Page.addScriptToEvaluateOnNewDocument', { source:
  "window.alert=function(){};window.confirm=function(){return false;};" +
  "try{localStorage.removeItem('mangoi_teacher_portal_v1');localStorage.setItem('mangoi_lang','ko');}catch(e){}" });

async function open(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE + '/teacher.html?_nc=' + Date.now() });
  for (let i = 0; i < 80; i++) { await sleep(150); try { if (await evaluate("!!document.querySelector('#classes .cls-chips')")) return true; } catch {} }
  return false;
}
const READ = `(function(){
  var vis=function(e){if(!e)return false;var cs=getComputedStyle(e);if(cs.display==='none'||cs.visibility==='hidden')return false;var r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  var chips=[].map.call(document.querySelectorAll('#classes .cls-chip'),function(b){return b.textContent;});
  var post=document.querySelector('#classes .cls-postponed');
  var canc=document.querySelector('#classes .cls-cancel');
  var sb=post&&post.querySelector('.cls-sbox');
  var note=post&&post.querySelector('.cls-pnote');
  var sact=canc&&canc.querySelector('.cls-sact');
  return {chips:chips, hasPost:!!post, sbVis:vis(sb), sbText:sb?sb.textContent:'', noteVis:vis(note),
    postJoin:!!(post&&post.querySelector('[data-join]')), postPill:!!(post&&post.querySelector('.p-postponed')),
    cancSactVis:vis(sact), cancH: canc?canc.getBoundingClientRect().height:0,
    planJoin: !!document.querySelector('#classes [data-join]'),
    over: document.documentElement.scrollWidth>innerWidth};
})()`;

console.log('▶ 교사 «오늘의 수업» 상태 표시 — B(요약 칩) · D(PC 상태 상자) · A(폰 한 줄)');
for (const [w, h, pc] of [[1280, 900, true], [390, 844, false]]) {
  const okOpen = await open(w, h);
  ok(w + 'px 화면이 열리고 칩이 그려진다', okOpen);
  if (!okOpen) continue;
  const r = await evaluate(READ);
  const txt = r.chips.join(' | ');
  ok(w + 'px B: 예정·연기·취소·노쇼·완료 칩이 각각 1', /예정 1/.test(txt) && /연기 1/.test(txt) && /취소 1/.test(txt) && /노쇼 1/.test(txt) && /완료 1/.test(txt), txt);
  ok(w + 'px 연기 줄이 그려지고 «연기됨» 배지가 있다', r.hasPost && r.postPill);
  ok(w + 'px 연기 줄에는 입장 버튼이 없다', !r.postJoin);
  ok(w + 'px (짝) 예정 줄에는 입장 버튼이 그대로 있다', r.planJoin);
  if (pc) {
    ok('PC D: 상태 상자가 보인다', r.sbVis);
    ok('PC D: 상자에 «누가·언제» 가 있다(13:55 · Maimai)', /13:55/.test(r.sbText) && /Maimai/.test(r.sbText), r.sbText);
    ok('PC: 이름 아래 긴 안내 줄은 숨는다(상자와 중복 방지)', !r.noteVis);
    ok('PC: 취소 줄 상태 상자가 보인다', r.cancSactVis);
  } else {
    ok('폰 D: 상태 상자는 숨는다', !r.sbVis);
    ok('폰 A: 이름 아래 «기다리지 않아도 됩니다» 줄이 보인다', r.noteVis);
    ok('폰: 취소 줄의 빈 상자가 자리를 차지하지 않는다', !r.cancSactVis);
  }
  ok(w + 'px 가로 넘침 없음', !r.over);
  // 칩 클릭 → 연기 줄로 스크롤
  const y0 = await evaluate("(window.scrollTo(0,0),0)");
  await evaluate("document.querySelector('#classes [data-chip=\"postponed\"]').click()");
  await sleep(900);
  const inView = await evaluate("(function(){var r=document.querySelector('#classes .cls-postponed').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()");
  ok(w + 'px 칩 «연기» 를 누르면 연기 줄이 화면 안으로 온다', inView);
}
ok('페이지 예외 0건', pageErrors.length === 0, pageErrors.slice(0, 2).join(' / '));
console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
cleanup();
process.exit(fail ? 1 : 0);
