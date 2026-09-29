// -*- coding: utf-8 -*-
// 🚪 강사 화면(teacher.html) — 「방이 바뀌었는데 [수업 입장] 이 옛 방으로 가는가」 브라우저 검사
//
// 배경(2026-09-29): renderClasses() 는 지문(sig)이 같으면 다시 그리지 않고, [수업 입장] 버튼의
//   onclick 은 «마지막으로 그린 순간» 의 list 를 쥔다. sig 에 room_id 가 없어서 「🚪 오늘은 다른 방으로」
//   (room override) 나 관리자의 수업 이동으로 room_id 만 바뀌면, 45초 자동 갱신이 DATA 는 바꾸는데
//   DOM 은 안 바꿔 버튼이 옛 방으로 갔다.
//   고침: sig 에 room_id/duration_min/close_at_ts · joinClass() 가 DATA 에서 schedule_id 로 다시 찾기
//         (freshClass) · 지정 PUT 성공 직후 scheduleAutoRefresh(300).
//
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      node test-harness/manual/teacher-join-room-sync-browser.mjs
//    짝 검사(고침을 되돌린 사본으로 FAIL 이 나는지):
//      PUBLIC_DIR=<되돌린 public 사본> node test-harness/manual/teacher-join-room-sync-browser.mjs
//
// 구동: playwright 없이 **CDP 직접**(Node 22 전역 WebSocket). CLAUDE.md 함정 준수:
//   · file:// 금지 → python3 -m http.server 로 서빙(실행마다 새 포트)
//   · /json/new 금지 → /json/list 의 기존 탭 + Page.navigate
//   · Network.setBypassServiceWorker + setCacheDisabled 둘 다
//   · location.replace 후킹 금지 → 이동은 Fetch 도메인이 «문서 요청» 을 가로채 URL 로 읽는다
//   · 네트워크 스텁은 Fetch 도메인(Node 쪽 상태) — 페이지가 새로 떠도 스텁이 유지된다
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

// ── 스텁 상태(Node 쪽) ──────────────────────────────────────────────────
const KST_TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
function makeClass(over) {
  const t = Date.now();
  const start = t - 2 * 60e3;       // 2분 전에 시작 → 진행 중(live) → [수업 입장]
  return Object.assign({
    kind: 'class', schedule_id: 7, room_id: 'class-7-20260929',
    start_time: '19:00', start_ts: start, open_at_ts: start - 10 * 60e3, close_at_ts: start + 25 * 60e3,
    enter_from_ts: start - 12 * 3600e3, enter_until_ts: start + 12 * 3600e3,
    duration_min: 25, student_name: '김하나', student_uid: 'stu_hana', class_state: 'scheduled',
    level: 'Lv 3', textbook: 'BTS 1', class_kind: 'regular',
  }, over || {});
}
const S = {
  cls: makeClass(),
  portalHits: 0,
  putBodies: [],
  onPut: null,              // PUT 를 받았을 때 포털 상태를 바꿀 콜백
  nav: [],                  // 가로챈 문서 이동 URL
};
function portalPayload() {
  return {
    ok: true, now: Date.now(), today: KST_TODAY,
    me: { name: 'Kaye', username: 'mangoi_001', lang: 'ko' },
    classes: [S.cls], upcoming: [], notices: [], resources: [], rating: {},
  };
}

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

// Fetch 가로채기 — /api/* 전부 + vc_room 이 붙은 문서 이동
function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }
function jsonReply(requestId, obj, status = 200) {
  return send('Fetch.fulfillRequest', { requestId, responseCode: status,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
    body: b64(JSON.stringify(obj)) });
}
listeners.push(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, request, resourceType } = m.params;
  const u = new URL(request.url);
  try {
    if (u.searchParams.has('vc_room') && resourceType === 'Document') {
      S.nav.push(request.url);
      return await send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: b64('<!doctype html><meta charset="utf-8"><title>stub</title><p id="stub">navigated</p>') });
    }
    if (u.pathname === '/api/teacher/portal' && !u.search) {
      S.portalHits++;
      return await jsonReply(requestId, portalPayload());
    }
    if (u.pathname === '/api/admin/class-schedules' && request.method === 'PUT') {
      let body = {}; try { body = JSON.parse(request.postData || '{}'); } catch {}
      S.putBodies.push(body);
      const room = 'meet-' + String(body.room_code || '');
      if (S.onPut) S.onPut(room);
      return await jsonReply(requestId, { ok: true, room_id: room, link: '' });
    }
    // 그 밖의 API 는 «없음» 으로 조용히 답한다(결재·장애·월통계 등 — 이 검사와 무관)
    return await jsonReply(requestId, { ok: false, error: 'stub' });
  } catch (e) { /* 페이지가 떠난 뒤 늦게 온 요청 */ }
});

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }, { urlPattern: '*vc_room=*', resourceType: 'Document' }] });
// 대화상자는 막는다 — prompt 는 방 번호 5555, alert/confirm 은 no-op
await send('Page.addScriptToEvaluateOnNewDocument', { source:
  "window.prompt=function(){return window.__promptAnswer!=null?window.__promptAnswer:'5555';};" +
  "window.alert=function(){};window.confirm=function(){return false;};" +
  "try{localStorage.removeItem('mangoi_teacher_portal_v1');}catch(e){}" });

async function openTeacher() {
  S.nav = []; pageErrors.length = 0;
  await send('Page.navigate', { url: BASE + '/teacher.html?_nc=' + Date.now() });
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    try { if (await evaluate("!!document.querySelector('#classes [data-join]')")) return true; } catch {}
  }
  return false;
}
async function clickSel(sel) {
  const box = await evaluate(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,top:!!(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===e||e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))};})()`);
  if (!box) return null;
  for (const type of ['mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return box;
}
async function joinAndReadRoom() {
  const before = S.nav.length;
  const b = await clickSel('#classes [data-join]');
  if (!b) return { room: null, why: 'join 버튼 없음' };
  for (let i = 0; i < 40 && S.nav.length === before; i++) await sleep(100);
  const u = S.nav[S.nav.length - 1];
  if (S.nav.length === before) return { room: null, why: '이동 없음' };
  return { room: new URL(u).searchParams.get('vc_room'), role: new URL(u).searchParams.get('vc_role'), topHit: b.top };
}
async function waitHits(n, ms = 5000) {
  const t0 = Date.now();
  while (S.portalHits < n && Date.now() - t0 < ms) await sleep(50);
  await sleep(400);   // 응답 → renderClasses 까지 여유
  return S.portalHits >= n;
}

console.log('▶ teacher-join-room-sync-browser  (PUBLIC_DIR=' + PUBLIC_DIR + ')');

try {
  // ① 처음 방 → 입장
  console.log('① 처음 방 그대로 입장');
  S.cls = makeClass(); S.onPut = null;
  ok('① 페이지가 수업 카드를 그렸다', await openTeacher());
  const r1 = await joinAndReadRoom();
  ok('① [수업 입장] 버튼이 화면 맨 위 요소다(눌린다)', r1.topHit === true);
  ok('① vc_room = class-7-20260929', r1.room === 'class-7-20260929', 'vc_room=' + r1.room + ' role=' + r1.role);

  // ② 포털이 room_id 만 meet-1234 로 바꿔 줌 → 자동 갱신 → 입장
  console.log('② room_id 만 바뀜(관리자 이동/지정) → 자동 갱신 뒤 입장');
  S.cls = makeClass();
  ok('② 페이지 준비', await openTeacher());
  await sleep(300);
  const h2 = S.portalHits;
  S.cls = makeClass({ room_id: 'meet-1234' });
  await evaluate("document.dispatchEvent(new Event('visibilitychange')), true");   // 1500ms 뒤 갱신 예약
  ok('② 자동 갱신이 포털을 다시 불렀다', await waitHits(h2 + 1), 'hits ' + h2 + '→' + S.portalHits);
  const r2 = await joinAndReadRoom();
  ok('② vc_room = meet-1234 (새 방)', r2.room === 'meet-1234', 'vc_room=' + r2.room);

  // ③ 「🚪 오늘은 다른 방으로」 흐름 — PUT 성공 → 2초 안에 새 방
  console.log('③ 🚪 오늘은 다른 방으로(5555) → 새로고침 없이 새 방');
  S.cls = makeClass();
  S.onPut = (room) => { S.cls = makeClass({ room_id: room }); };
  ok('③ 페이지 준비', await openTeacher());
  await sleep(300);
  const h3 = S.portalHits;
  const rb = await clickSel('#classes [data-roomset]');
  ok('③ 🚪 버튼을 눌렀다', !!rb);
  for (let i = 0; i < 30 && !S.putBodies.length; i++) await sleep(100);
  const put = S.putBodies[S.putBodies.length - 1] || {};
  ok('③ PUT 본문 = room_override · schedule_id 7 · room_code 5555',
    put.action === 'room_override' && String(put.schedule_id) === '7' && put.room_code === '5555', JSON.stringify(put));
  const t3 = Date.now();
  const refreshed = await waitHits(h3 + 1, 2000);
  ok('③ PUT 직후 2초 안에 포털을 다시 불렀다', refreshed, 'hits ' + h3 + '→' + S.portalHits + ' · ' + (Date.now() - t3) + 'ms');
  const r3 = await joinAndReadRoom();
  ok('③ vc_room = meet-5555 (지정한 방)', r3.room === 'meet-5555', 'vc_room=' + r3.room);
  S.onPut = null;

  // ④ 시간 이동 — start_time/start_ts 바뀜 → 카드가 새 시각을 그리고 입장은 여전히 맞는 방
  console.log('④ 시간 이동 → 카드 다시 그림 + 입장은 그대로 맞는 방');
  S.cls = makeClass();
  ok('④ 페이지 준비', await openTeacher());
  await sleep(300);
  const tBefore = await evaluate("(document.querySelector('#classes .cls-time')||{}).textContent||''");
  const h4 = S.portalHits;
  const moved = makeClass();
  moved.start_time = '19:30'; moved.start_ts += 60e3; moved.open_at_ts += 60e3; moved.close_at_ts += 60e3;
  S.cls = moved;
  await evaluate("document.dispatchEvent(new Event('visibilitychange')), true");
  await waitHits(h4 + 1);
  const tAfter = await evaluate("(document.querySelector('#classes .cls-time')||{}).textContent||''");
  ok('④ 카드 시각이 19:00 → 19:30 으로 다시 그려졌다', /19:00/.test(tBefore) && /19:30/.test(tAfter), JSON.stringify(tBefore) + ' → ' + JSON.stringify(tAfter));
  const r4 = await joinAndReadRoom();
  ok('④ vc_room = class-7-20260929', r4.room === 'class-7-20260929', 'vc_room=' + r4.room);

  const errs = pageErrors.filter(Boolean);
  ok('페이지 예외 0건(마지막 회차)', errs.length === 0, errs.slice(0, 2).join(' | '));
} catch (e) {
  fail++; console.log('  ❌ FAIL 하니스 예외 — ' + (e && e.stack || e));
}

console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
try { ws.close(); } catch {}
cleanup();
process.exit(fail ? 1 : 0);
