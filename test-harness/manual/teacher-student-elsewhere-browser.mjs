// -*- coding: utf-8 -*-
// 🚪 강사 화면 «학생이 다른 방에 있어요» + 🗼 매니저 화면 Class Monitor 입구 — 브라우저 검사 (2026-10-21)
//
// 자동 하니스(test-harness/teacher_student_elsewhere_harness.mjs)는 «무슨 HTML 이 나오는가» 까지만 본다.
// 여기서는 진짜 Chromium 에 그려서 ① 상자가 보이고 ② 버튼이 «맨 위» 라 눌리며 ③ 누르면 학생 방으로 가고
// ④ 학생이 옮기면 상자가 따라 바뀌거나 사라지며 ⑤ 글자가 읽히는지(밝은·어두운 화면) ⑥ 폰 폭에서 안 넘치는지,
// ⑦ 매니저 화면에서 본사만 🗼 버튼이 보이는지를 «무작위 반복» 으로 잰다.
//
// ⚠️ 자동으로 안 돕니다(manual/) — 사람이 부릅니다:
//      node test-harness/manual/teacher-student-elsewhere-browser.mjs          (기본 120회)
//      ROUNDS=300 node test-harness/manual/teacher-student-elsewhere-browser.mjs
//    짝 검사(고침을 되돌린 사본으로 FAIL 이 나는지): PUBLIC_DIR=<사본> node …
//
// 구동: playwright 없이 CDP 직접(Node 22 전역 WebSocket). CLAUDE.md 함정 준수:
//   · file:// 금지 → python3 -m http.server(실행마다 새 포트) · /json/new 금지 → /json/list 의 기존 탭
//   · Network.setBypassServiceWorker + setCacheDisabled 둘 다 · 이동은 Fetch 로 «문서 요청» 을 가로채 URL 로 읽는다
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import net from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_DIR = process.env.PUBLIC_DIR || join(ROOT, 'cloudflare-deploy', 'public');
const ROUNDS = Math.max(1, Number(process.env.ROUNDS || 120));

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
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; if (!QUIET) console.log('  ✅ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; fails.push(name); console.log('  ❌ FAIL ' + name + (detail ? '  — ' + detail : '')); }
}
let QUIET = false;

// ── 스텁 상태(Node 쪽) ──────────────────────────────────────────────────
const KST_TODAY = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ROOM = 'class-4397-' + KST_TODAY.replace(/-/g, '');
function makeClass(over) {
  const t = Date.now();
  const start = t - 3 * 60e3;
  return Object.assign({
    kind: 'class', schedule_id: 4397, room_id: ROOM,
    start_time: '21:00', start_ts: start, open_at_ts: start - 10 * 60e3, close_at_ts: start + 35 * 60e3,
    enter_from_ts: start - 12 * 3600e3, enter_until_ts: start + 12 * 3600e3,
    duration_min: 20, student_name: '김하나', student_uid: 'delaware', class_state: 'ongoing',
    level: 'Lv 3', textbook: 'BTS 1', class_kind: 'regular',
  }, over || {});
}
const S = { cls: makeClass(), lang: 'ko', portalHits: 0, nav: [], scope: 'hq' };
function fixtureWeek() {
  const monday = new Date(KST_TODAY + 'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return { start: monday.toISOString().slice(0, 10), days: Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), classes: [] };
  }) };
}
function portalPayload() {
  return { ok: true, now: Date.now(), today: KST_TODAY, week: fixtureWeek(),
    me: { name: 'Kaye', username: 'mangoi_001', lang: S.lang },
    classes: [S.cls], upcoming: [], notices: [], resources: [], rating: {} };
}

// ── 서버·브라우저 기동 ──────────────────────────────────────────────────
const httpPort = await freePort();
const cdpPort = await freePort();
const srv = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'], { cwd: PUBLIC_DIR, stdio: 'ignore' });
const udd = mkdtempSync(join(tmpdir(), 'tse-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + udd, 'about:blank'], { stdio: 'ignore' });
function cleanup() { try { chrome.kill('SIGKILL'); } catch {} try { srv.kill('SIGKILL'); } catch {} }
process.on('exit', cleanup);

const BASE = 'http://127.0.0.1:' + httpPort;
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try { const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json(); target = list.find(t => t.type === 'page'); } catch {}
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
listeners.push((m) => { if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });

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
    if (u.pathname === '/api/teacher/portal') {
      if (u.searchParams.get('only') === 'next') return await jsonReply(requestId, { ok: true, classes: [] });
      S.portalHits++;
      return await jsonReply(requestId, portalPayload());
    }
    if (u.pathname === '/api/admin/me') return await jsonReply(requestId, { ok: true, username: 'mgr_melca', name: 'Melca', scope_type: S.scope, role: S.scope === 'hq' ? 'hq' : S.scope });
    if (u.pathname === '/api/admin/exec/summary') return await jsonReply(requestId, { ok: true,
      scope: { type: S.scope, label: S.scope === 'hq' ? '본사' : '부산', value: S.scope === 'hq' ? 'HQ' : '부산' },
      this_month: { period: KST_TODAY.slice(0, 7), income: 0, pay_count: 0, settle: 0 }, students: { active: 0, new_this_month: 0, new_today: 0 }, fee_rate: 0 });
    return await jsonReply(requestId, { ok: false, error: 'stub' });
  } catch (e) { /* 페이지가 떠난 뒤 늦게 온 요청 */ }
});

await send('Page.enable');
await send('Runtime.enable');
await send('Runtime.addBinding', { name: '__recordConfirm' });
listeners.push((m) => { if (m.method === 'Runtime.bindingCalled' && m.params.name === '__recordConfirm') S.asked.push(m.params.payload); });
await send('Network.enable');
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }, { urlPattern: '*vc_room=*', resourceType: 'Document' }] });
// 주소의 _t(테마)·_c(확인 답)를 페이지 스크립트보다 «먼저» 읽어 심는다. confirm 은 물은 문장을 남긴다.
await send('Page.addScriptToEvaluateOnNewDocument', { source:
  "(function(){var q=new URLSearchParams(location.search);" +
  "try{localStorage.setItem('mangoi_teacher_theme',q.get('_t')==='dark'?'dark':'light');localStorage.removeItem('mangoi_teacher_portal_v1');}catch(e){}" +
  "window.__asked=[];window.__confirmAnswer=q.get('_c')!=='no';" +
  "window.confirm=function(m){window.__asked.push(String(m));window.__recordConfirm(String(m));return window.__confirmAnswer;};" +
  "window.prompt=function(){return null;};window.alert=function(){};})();" });

async function setViewport(w, h, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
}
async function openTeacher(opts) {
  S.nav = []; S.asked = []; pageErrors.length = 0;
  const q = '?_nc=' + Date.now() + '&_t=' + (opts && opts.dark ? 'dark' : 'light') + '&_c=' + (opts && opts.confirmNo ? 'no' : 'yes');
  await send('Page.navigate', { url: BASE + '/teacher.html' + q });
  for (let i = 0; i < 80; i++) {
    await sleep(120);
    try { if (await evaluate("!!document.querySelector('#classes .cls')")) return true; } catch {}
  }
  return false;
}
async function boxInfo() {
  return evaluate(`(function(){
    var b=document.querySelector('#classes .cls-away'); if(!b) return null;
    var btn=b.querySelector('.btn-away'); var r=btn?btn.getBoundingClientRect():null;
    var cx=r?r.left+r.width/2:0, cy=r?r.top+r.height/2:0;
    var top=r?document.elementFromPoint(cx,cy):null;
    var cs=getComputedStyle(b), bs=btn?getComputedStyle(btn):null, sub=b.querySelector('.away-sub');
    return { text:b.textContent, html:b.innerHTML, btns:b.querySelectorAll('button').length,
      rowAway: !!(b.closest('.cls')&&b.closest('.cls').classList.contains('cls-away-row')),
      color:cs.color, bg:cs.backgroundColor, subColor:sub?getComputedStyle(sub).color:'', btnColor:bs?bs.color:'', btnBg:bs?bs.backgroundColor:'',
      btnH:r?r.height:0, btnW:r?r.width:0, btnTop: !!(top && (top===btn || btn.contains(top))),
      inView: r? (r.bottom>0 && r.top<innerHeight) : false,
      boxW:b.getBoundingClientRect().width, scrollW:document.documentElement.scrollWidth, innerW:innerWidth,
      display:cs.display };
  })()`);
}
async function clickAway() {
  const box = await evaluate(`(function(){var e=document.querySelector('#classes .btn-away');if(!e)return null;e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  if (!box) return false;
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  return true;
}
async function refreshPortal() {
  const h = S.portalHits;
  await evaluate("document.dispatchEvent(new Event('visibilitychange')), true");
  for (let i = 0; i < 60 && S.portalHits <= h; i++) await sleep(100);
  await sleep(450);
  return S.portalHits > h;
}
// WCAG 대비 — rgb()/rgba() 를 읽어 계산(배경은 불투명이어야 한다 — 상자·버튼 모두 단색)
function rgb(s) { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(',').map(x => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; }
function lum(c) { return [c.r, c.g, c.b].map(x => x / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(fg, bg) { const a = rgb(fg), b = rgb(bg); if (!a || !b || b.a < 1) return 0; const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

const KIND_KO = { public: '공용 대기방', meeting: '회의방', class: '다른 수업 방', other: '다른 방' };
const KIND_EN = { public: 'the shared waiting room', meeting: 'a meeting room', class: 'another class room', other: 'another room' };
const ROOM_OF = { public: 'mangoi-class', meeting: 'meet-1234', class: 'class-4379-' + KST_TODAY.replace(/-/g, ''), other: 'demo-1' };

console.log('▶ teacher-student-elsewhere-browser  (PUBLIC_DIR=' + PUBLIC_DIR + ' · ROUNDS=' + ROUNDS + ')');
try {
  await setViewport(1280, 900, false);

  console.log('① 기본 — 상자·버튼·이동(밝은 화면)');
  S.lang = 'ko';
  S.cls = makeClass({ student_elsewhere: { room: ROOM_OF.class, room_kind: 'class', others: 0, via_twin: false, seen_at: Date.now() } });
  ok('① 수업 카드를 그렸다', await openTeacher());
  let bi = await boxInfo();
  ok('① 상자가 보인다', !!bi && bi.display !== 'none', bi && bi.display);
  ok('① 「학생이 다른 방에 있어요」·「학생 방으로 들어가기」', !!bi && /학생이 다른 방에 있어요/.test(bi.text) && /학생 방으로 들어가기/.test(bi.text));
  ok('① 줄 강조(cls-away-row)', !!bi && bi.rowAway);
  ok('① 버튼은 하나 · 맨 위라 눌린다', !!bi && bi.btns === 1 && bi.btnTop);
  ok('① 버튼 높이 44px 이상(손가락)', !!bi && bi.btnH >= 44, bi && bi.btnH);
  const c1 = bi ? [contrast(bi.color, bi.bg), contrast(bi.subColor, bi.bg), contrast(bi.btnColor, bi.btnBg)] : [0, 0, 0];
  console.log('    대비(밝은): 상자글 ' + c1[0].toFixed(2) + ' · 부제 ' + c1[1].toFixed(2) + ' · 버튼 ' + c1[2].toFixed(2));
  ok('① 글자 대비 전부 4.5 이상', c1.every(x => x >= 4.5));
  ok('① 누르기 전엔 아무 데도 안 갔다', S.nav.length === 0);
  ok('① 버튼을 눌렀다', await clickAway());
  for (let i = 0; i < 40 && !S.nav.length; i++) await sleep(100);
  const asked1 = S.asked;
  const nav1 = S.nav[0] ? new URL(S.nav[0]) : null;
  ok('① 한 번 물었다(학생에게 선생님이 보입니다)', Array.isArray(asked1) && asked1.length === 1 && /학생에게 선생님이 보입니다/.test(asked1[0]), asked1 && asked1[0]);
  ok('① 학생 방으로 강사로 들어간다', !!nav1 && nav1.searchParams.get('vc_room') === ROOM_OF.class && nav1.searchParams.get('vc_role') === 'teacher', S.nav[0]);
  ok('① 이 수업 방(예약방)으로는 안 갔다', !!nav1 && nav1.searchParams.get('vc_room') !== ROOM);
  ok('① 페이지 오류 없음', pageErrors.length === 0, pageErrors[0]);

  console.log('② «아니오» → 안 간다 (짝)');
  ok('② 준비', await openTeacher({ confirmNo: true }));
  await clickAway();
  await sleep(600);
  ok('② 물었지만 이동 없음', S.nav.length === 0 && (await evaluate('window.__asked.length')) === 1);

  console.log('③ 칸이 없으면 상자도 없다 (짝)');
  S.cls = makeClass();
  ok('③ 준비', await openTeacher());
  ok('③ 상자 없음 · 줄 강조 없음', (await boxInfo()) === null && !(await evaluate("!!document.querySelector('.cls-away-row')")));

  console.log('④ 자동 갱신 — 학생이 옮기면 상자가 따라 바뀌고, 제자리로 오면 사라진다(지문 sig)');
  S.cls = makeClass({ student_elsewhere: { room: ROOM_OF.public, room_kind: 'public', others: 0, via_twin: false, seen_at: Date.now() } });
  ok('④ 준비', await openTeacher());
  ok('④ 처음엔 공용 대기방', /공용 대기방/.test((await boxInfo() || {}).text || ''));
  S.cls = makeClass({ student_elsewhere: { room: ROOM_OF.meeting, room_kind: 'meeting', others: 2, via_twin: false, seen_at: Date.now() } });
  ok('④ 갱신이 돌았다', await refreshPortal());
  const b4 = await boxInfo();
  ok('④ 회의방 · 2명으로 바뀌었다', !!b4 && /회의방/.test(b4.text) && /2명이 더/.test(b4.text) && /meet-1234/.test(b4.text), b4 && b4.text);
  S.cls = makeClass();
  ok('④ 다시 갱신', await refreshPortal());
  ok('④ 학생이 제자리로 오니 상자가 사라졌다', (await boxInfo()) === null);
  S.cls = makeClass({ student_elsewhere: { room: ROOM_OF.meeting, room_kind: 'meeting', others: 2, via_twin: false, seen_at: Date.now() } });
  ok('④ 준비(그사이 제자리)', await openTeacher({ confirmNo: true }));
  S.cls = makeClass();          // 서버는 이제 칸을 안 준다 — 화면은 옛 상자를 들고 있다
  await clickAway();             // goStudentRoom → freshClass 는 아직 옛 DATA … 갱신 뒤에 누르는 경우를 본다
  await sleep(300);
  S.nav = []; await evaluate('window.__asked.length=0, true');
  ok('④ 갱신', await refreshPortal());
  ok('④ 갱신 뒤엔 누를 상자가 없다(옛 방으로 보낼 길이 없다)', (await boxInfo()) === null);

  console.log('⑤ 어두운 화면 대비');
  S.cls = makeClass({ student_elsewhere: { room: ROOM_OF.class, room_kind: 'class', others: 1, via_twin: true, seen_at: Date.now() } });
  ok('⑤ 준비', await openTeacher({ dark: true }));
  ok('⑤ 어두운 테마가 켜졌다', await evaluate("document.documentElement.getAttribute('data-t')==='dark'"));
  const b5 = await boxInfo();
  const c5 = b5 ? [contrast(b5.color, b5.bg), contrast(b5.subColor, b5.bg), contrast(b5.btnColor, b5.btnBg)] : [0, 0, 0];
  console.log('    대비(어두운): 상자글 ' + c5[0].toFixed(2) + ' · 부제 ' + c5[1].toFixed(2) + ' · 버튼 ' + c5[2].toFixed(2));
  ok('⑤ 글자 대비 전부 4.5 이상', c5.every(x => x >= 4.5));
  ok('⑤ 쌍둥이 계정 안내', !!b5 && /학생의 다른 계정으로 접속/.test(b5.text));

  console.log('⑥ 폰 폭(360·390) — 가로로 안 넘치고 버튼이 화면에 들어온다');
  for (const w of [360, 390]) {
    await setViewport(w, 780, true);
    S.cls = makeClass({ student_elsewhere: { room: 'meet-' + 'abcdefghijklmnopqrstuvwxyz0123456789', room_kind: 'meeting', others: 3, via_twin: true, seen_at: Date.now() } });
    ok('⑥ ' + w + ' 준비', await openTeacher());
    await evaluate("var e=document.querySelector('#classes .cls-away');e&&e.scrollIntoView({block:'center'});true");
    const b6 = await boxInfo();
    ok('⑥ ' + w + ' 문서가 가로로 안 넘친다', !!b6 && b6.scrollW <= b6.innerW + 1, b6 && (b6.scrollW + '/' + b6.innerW));
    ok('⑥ ' + w + ' 버튼이 보이고 눌린다', !!b6 && b6.inView && b6.btnTop);
  }
  await setViewport(1280, 900, false);

  console.log('⑦ 무작위 반복 ' + ROUNDS + '회 — 종류·인원·쌍둥이·언어·테마·방 이름(이상한 글자 포함)');
  QUIET = true;
  let seed = 20261021 >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let r7 = 0;
  const startPass = pass;
  for (let n = 0; n < ROUNDS; n++) {
    const kind = pick(['public', 'meeting', 'class', 'other']);
    const others = pick([0, 0, 1, 2, 5]);
    const twin = rnd() < 0.4;
    const lang = pick(['ko', 'en']);
    const dark = rnd() < 0.3;
    const weird = rnd() < 0.25;
    const room = weird ? pick(['meet-<b>x</b>', 'demo-"><img src=x onerror=window.__pwn=1>', "x'y&z", 'meet-‮1234']) : ROOM_OF[kind];
    const has = rnd() < 0.8;
    S.lang = lang;
    S.cls = makeClass(has ? { student_elsewhere: { room, room_kind: kind, others, via_twin: twin, seen_at: Date.now() } } : {});
    const opened = await openTeacher({ dark, confirmNo: rnd() < 0.3 });
    const b = await boxInfo();
    const tag = '#' + n + ' ' + lang + (dark ? '/dark' : '') + ' ' + kind + ' others=' + others + (twin ? ' twin' : '') + (has ? '' : ' (칸 없음)');
    ok('⑦ ' + tag + ' 열림', opened);
    if (!has) { ok('⑦ ' + tag + ' 상자 없음', b === null); continue; }
    ok('⑦ ' + tag + ' 상자·버튼 하나·맨 위', !!b && b.btns === 1 && b.btnTop);
    const K = lang === 'en' ? KIND_EN : KIND_KO;
    ok('⑦ ' + tag + ' 방 종류 문구', !!b && b.text.indexOf(K[kind]) >= 0, b && b.text);
    const othersOk = !b ? false : others > 0
      ? (lang === 'en' ? new RegExp(others + ' other ' + (others === 1 ? 'person' : 'people')).test(b.text) : b.text.indexOf(others + '명이 더') >= 0)
      : !/명이 더|other (person|people)/.test(b.text);
    ok('⑦ ' + tag + ' 인원 문구', othersOk);
    ok('⑦ ' + tag + ' 쌍둥이 문구', !!b && (twin === (lang === 'en' ? /other account/.test(b.text) : /다른 계정/.test(b.text))));
    ok('⑦ ' + tag + ' 방 이름이 글자 그대로 보인다(태그로 안 풀림)', !!b && b.text.indexOf(room) >= 0 && !(await evaluate('!!window.__pwn')) && !/<img|<b>x<\/b>/.test(b.html.replace(/&lt;|&gt;/g, '')));
    const cc = b ? [contrast(b.color, b.bg), contrast(b.subColor, b.bg), contrast(b.btnColor, b.btnBg)] : [0];
    ok('⑦ ' + tag + ' 대비 4.5 이상', cc.every(x => x >= 4.5), cc.map(x => x.toFixed(2)).join('/'));
    // 누르기 — confirm 답에 따라 간다/안 간다
    const no = await evaluate('window.__confirmAnswer===false');
    await clickAway();
    for (let i = 0; i < 30 && !S.nav.length; i++) await sleep(60);
    if (no) { await sleep(250); ok('⑦ ' + tag + ' «아니오» 면 이동 없음', S.nav.length === 0); }
    else {
      const u = S.nav[0] ? new URL(S.nav[0]) : null;
      ok('⑦ ' + tag + ' 학생 방으로(강사)', !!u && u.searchParams.get('vc_room') === room && u.searchParams.get('vc_role') === 'teacher', S.nav[0]);
    }
    ok('⑦ ' + tag + ' 페이지 오류 없음', pageErrors.length === 0, pageErrors[0]);
    r7++;
  }
  QUIET = false;
  console.log('    무작위 ' + ROUNDS + '회(상자 있는 ' + r7 + '회) · 검사 ' + (pass - startPass) + '건 통과');

  console.log('⑧ 매니저 화면 — 🗼 Class Monitor 는 본사(hq)만');
  for (const sc of ['hq', 'branch', 'agency', 'hq', 'agency']) {
    S.scope = sc;
    pageErrors.length = 0;
    await send('Page.navigate', { url: BASE + '/manager.html?_nc=' + Date.now() });
    let st = null;
    for (let i = 0; i < 60; i++) {
      await sleep(150);
      st = await evaluate(`(function(){var a=document.getElementById('toMonitorTop'),b=document.getElementById('toMonitor');
        if(!a||!b)return null;var lb=document.getElementById('scopeLbl');
        function vis(e){var r=e.getBoundingClientRect();return getComputedStyle(e).display!=='none'&&r.width>0&&r.height>0;}
        return {top:vis(a),q:vis(b),lbl:lb?lb.textContent:'',href:a.getAttribute('href'),tgt:a.getAttribute('target')};})()`).catch(() => null);
      if (st && st.lbl && !/Loading|불러오는/.test(st.lbl)) break;
    }
    ok('⑧ ' + sc + ' 화면이 범위를 그렸다', !!st && !!st.lbl, st && st.lbl);
    const want = sc === 'hq';
    ok('⑧ ' + sc + ' 상단 버튼·자주 쓰는 기능 ' + (want ? '보임' : '감춤'), !!st && st.top === want && st.q === want, JSON.stringify(st));
    if (want) ok('⑧ 관제탑으로 새 탭', !!st && st.href === '/admin/monitor-wall.html' && st.tgt === '_blank');
    if (want) {
      const box = await evaluate(`(function(){var e=document.getElementById('toMonitorTop');var r=e.getBoundingClientRect();var t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {top:!!(t&&(t===e||e.contains(t))),w:r.width};})()`);
      ok('⑧ 상단 🗼 버튼이 맨 위라 눌린다', box.top, JSON.stringify(box));
    }
  }
} catch (e) {
  ok('예외 없이 끝났다', false, e && e.stack);
}

console.log('\n결과: PASS ' + pass + ' · FAIL ' + fail + (fails.length ? '\n  실패: ' + [...new Set(fails)].slice(0, 12).join(' | ') : ''));
cleanup();
process.exit(fail ? 1 : 0);
