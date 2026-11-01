/**
 * 🎌 공휴일 입장 문구 — 진짜 브라우저 반복 시험 (2026-10-09)
 * ---------------------------------------------------------------------------
 * 무엇을 보나
 *   휴강일(서버 /api/class/sessions/today 의 holiday)에 입장 버튼을 누르면
 *   «오늘 예약된 수업이 없어요» 대신 서버가 만든 공휴일 안내(holiday.alert, 정본 holidayEntryAlert)가 뜨는가.
 *   게이트 꺼짐(기본)이면 예전처럼 공용방으로 들어가되 사후 안내가 공휴일 안내로 바뀌는가.
 *   그리고 «휴강이 아닐 때 / 교사 / 중국어처럼 열린 수업이 남을 때» 는 예전 그대로인가(짝).
 * 왜 반복하나
 *   사장님 지시 «수백 번». 문구·역할·휴강 이름을 매번 무작위로 바꿔 같은 답이 나오는지 본다.
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. 사람이 부른다:
 *   PW_DIR=/tmp/pw node test-harness/manual/holiday-entry-msg-browser.mjs [반복수=300]
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8000 + Math.floor(Math.random() * 900);   // 서비스워커 캐시를 피하려고 매번 새 오리진
const N = Math.max(1, Number(process.argv[2] || 300));

let pass = 0, fail = 0;
const fails = [];
const ok = (label, cond, detail) => {
  if (cond) pass++;
  else { fail++; if (fails.length < 30) fails.push(label + (detail ? ' — ' + detail : '')); }
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUB, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

const NAMES = ['한글날', '개천절', '추석', '어린이날', null];
const OLD_NONE = '오늘 예약된 수업이 없어요';
// 기대 문구는 서버 정본 holidayEntryAlert 를 소스에서 오려 내 실제로 돌려 만든다(⛔ 하니스에 베끼지 않음)
const HSRC = readFileSync(join(ROOT, 'cloudflare-deploy/src/holiday-closure.ts'), 'utf8');
const HM = HSRC.match(/export function holidayEntryAlert\(name: string \| null\): string \{([\s\S]*?)\n\}/);
if (!HM) { console.log('❌ holidayEntryAlert 를 못 찾음'); process.exit(1); }
const msgOf = new Function('name', HM[1]);
const rnd = a => a[Math.floor(Math.random() * a.length)];

async function newPage() {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.__dialogs = [];
  page.on('dialog', async d => { page.__dialogs.push(d.message()); try { await d.dismiss(); } catch (_) {} });
  page.__errs = [];
  page.on('pageerror', e => page.__errs.push(String(e).slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#vc-name-input', { state: 'attached', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => {
    window.__ws = [];
    window.WebSocket = function (url) { window.__ws.push(String(url)); return { readyState: 0, send() {}, close() {}, addEventListener() {}, removeEventListener() {} }; };
    const realFetch = window.fetch.bind(window);
    const J = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (input, init) => {
      const u = String((input && input.url) || input || '');
      if (u.includes('/api/class/sessions/today')) return J(window.__resp);
      if (u.includes('/api/turn-config')) return J({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      if (u.includes('/api/consents/')) return J({ user_id: 'stu_test', consent_version: 'v1.0-2026-08', recording_consent: 1, recording: 1, attendance: 1 });
      if (u.includes('/api/')) return J({ ok: true });
      return realFetch(input, init);
    };
  });
  return { page, ctx };
}

let ROOM = '';
function session(joinOpen) {
  const now = Date.now();
  // ⚠️ 방 번호의 날짜는 «오늘(KST)» 이어야 한다 — 박아 두면 자정을 넘는 순간 «지난 날짜 링크» 로 되돌림 고리가 돈다(실제로 밟음)
  const k = new Date(now + 9 * 3600 * 1000), p2 = n => (n < 10 ? '0' : '') + n;
  ROOM = 'class-9001-' + k.getUTCFullYear() + p2(k.getUTCMonth() + 1) + p2(k.getUTCDate());
  return { schedule_id: 9001, room_id: ROOM, student_uid: 'stu_test', teacher_id: '29',
    start_ts: now, end_ts: now + 1800000, open_at_ts: now - 600000, close_at_ts: now + 2700000,
    duration_min: 30, status: joinOpen ? 'live' : 'early', join_open: joinOpen, starts_in_ms: 0 };
}

async function setup(page, { role, resp }) {
  page.__dialogs.length = 0;
  await page.evaluate(({ role, resp }) => {
    window.__resp = resp; window.__ws = [];
    window.getCurrentUser = () => ({ uid: 'stu_test', name: '테스트', role });
    window.vcMyRole = role;
    document.getElementById('vc-name-input').value = '테스트';
    document.getElementById('vc-roomcode-input').value = '';
    const g = document.getElementById('vc-class-gate'); if (g) g.remove();
  }, { role, resp });
}

async function waitOutcome(page, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const inCall = await page.evaluate(() => document.body.classList.contains('vc-in-call'));
    if (page.__dialogs.length || inCall) { await new Promise(r => setTimeout(r, 300)); break; }
    await new Promise(r => setTimeout(r, 100));
  }
  return page.evaluate(() => ({ inCall: document.body.classList.contains('vc-in-call'), ws: window.__ws.slice() }));
}

try {
  // ── A. 머무는 시나리오(입장하지 않음) — 한 페이지에서 N 번 ──
  console.log(`A. 휴강·학생: 로비(게이트 켜짐)/«내 수업 바로 입장» × ${N}회 (휴강 이름 무작위)`);
  let { page, ctx } = await newPage();
  for (let i = 0; i < N; i++) {
    const n = rnd(NAMES), m = msgOf(n);
    const viaLobby = i % 2 === 0;
    const gate = viaLobby ? 'on' : rnd(['off', 'on']);   // 바로입장은 게이트와 무관해야 한다
    const resp = { ok: true, sessions: [], current: null, student_gate: gate, holiday: { name: n, closed_count: 1 + (i % 4), msg: 'x', alert: m } };
    await setup(page, { role: 'student', resp });
    if (viaLobby) await page.evaluate(() => { vcJoinRoom(); });
    else await page.evaluate(() => { vcJoinMyClass(); });
    const r = await waitOutcome(page);
    const tag = `A#${i} ${viaLobby ? '로비' : '바로입장'} gate=${gate}`;
    ok(tag + ' 공휴일 안내 정확히 1번', page.__dialogs.length === 1 && page.__dialogs[0] === m, JSON.stringify(page.__dialogs));
    ok(tag + ' «예약 없음» 문구 안 뜸', !page.__dialogs.some(d => d.includes(OLD_NONE)));
    ok(tag + ' 수업 화면에 안 들어감', !r.inCall);
    ok(tag + ' 방에 접속 안 함', r.ws.length === 0, JSON.stringify(r.ws));
  }
  // 짝: 휴강 아님 → 예전 «예약 없음» 문구 그대로(바로입장·로비 gate=on)
  const M = Math.max(20, Math.floor(N / 3));
  console.log(`B. 짝 — 휴강 아님: 예전 문구 그대로 × ${M}회`);
  for (let i = 0; i < M; i++) {
    const viaLobby = i % 2 === 0;
    await setup(page, { role: 'student', resp: { ok: true, sessions: [], current: null, student_gate: 'on', holiday: null } });
    if (viaLobby) await page.evaluate(() => { vcJoinRoom(); }); else await page.evaluate(() => { vcJoinMyClass(); });
    const r = await waitOutcome(page);
    ok(`B#${i} 예전 «예약 없음» 문구`, page.__dialogs.length === 1 && page.__dialogs[0].includes(OLD_NONE), JSON.stringify(page.__dialogs));
    ok(`B#${i} 공휴일 안내 안 뜸`, !page.__dialogs.some(d => d.includes('수업이 쉬어요')));
    ok(`B#${i} 입장 안 함`, !r.inCall);
  }
  ok('A·B 동안 스크립트 오류 없음', page.__errs.length === 0, page.__errs.join(' | '));
  await ctx.close();

  // ── C. 들어가는 시나리오(짝) — 매번 새 페이지 ──
  const K = Math.max(10, Math.floor(N / 15));
  console.log(`C. 짝 — 들어가야 하는 경우 × ${K}회씩`);
  for (let i = 0; i < K; i++) {
    const n = rnd(NAMES), hol = { name: n, closed_count: 2, msg: 'x', alert: msgOf(n) };
    // C1 휴강이어도 열린 수업(중국어 예외)이 남으면 그 예약방으로 들어간다
    ({ page, ctx } = await newPage());
    const s = session(true);
    await setup(page, { role: 'student', resp: { ok: true, sessions: [s], current: s, student_gate: 'off', holiday: hol } });
    await page.evaluate(() => { vcJoinRoom(); });
    let r = await waitOutcome(page, 8000);
    ok(`C1#${i} 열린 수업 → 예약방 입장`, r.inCall && r.ws.some(u => u.includes(ROOM)), JSON.stringify(r.ws) + ' ' + JSON.stringify(page.__dialogs));
    ok(`C1#${i} 공휴일 안내 안 뜸`, !page.__dialogs.some(d => d.includes('수업이 쉬어요')));
    ok(`C1#${i} 오류 없음`, page.__errs.length === 0, page.__errs.join(' | '));
    await ctx.close();
    // C2 교사는 휴강이어도 예전처럼 연습방(공휴일 문구로 막지 않음)
    ({ page, ctx } = await newPage());
    await setup(page, { role: 'teacher', resp: { ok: true, sessions: [], current: null, student_gate: 'off', holiday: hol } });
    await page.evaluate(() => { vcJoinRoom(); });
    r = await waitOutcome(page, 8000);
    ok(`C2#${i} 교사 → 예전처럼 입장`, r.inCall, JSON.stringify(page.__dialogs));
    ok(`C2#${i} 교사에게 공휴일 안내로 막지 않음`, !page.__dialogs.some(d => d.includes('수업이 쉬어요')));
    await ctx.close();
    // C4 휴강·게이트 꺼짐 학생 → (2026-10-09) 공용방에도 안 들어가고 공휴일 안내만
    ({ page, ctx } = await newPage());
    await setup(page, { role: 'student', resp: { ok: true, sessions: [], current: null, student_gate: 'off', holiday: hol } });
    await page.evaluate(() => { vcJoinRoom(); });
    const r4 = await waitOutcome(page, 8000);
    await new Promise(r => setTimeout(r, 1500));   // 공용방 사후 안내(900ms)가 «안» 뜨는지까지 본다
    ok(`C4#${i} 게이트 꺼짐 → 공휴일 안내 정확히 1번`, page.__dialogs.length === 1 && page.__dialogs[0] === hol.alert, JSON.stringify(page.__dialogs));
    ok(`C4#${i} 게이트 꺼짐 → 공용방에 안 들어감`, !r4.inCall && !(await page.evaluate(() => document.body.classList.contains('vc-in-call'))));
    ok(`C4#${i} 게이트 꺼짐 → 방에 접속 안 함`, r4.ws.length === 0, JSON.stringify(r4.ws));
    ok(`C4#${i} 오류 없음`, page.__errs.length === 0, page.__errs.join(' | '));
    await ctx.close();
    // C5 휴강 아님·게이트 꺼짐 → 예전 «공용 연습방» 안내 그대로(짝)
    // C3 휴강 아님·게이트 꺼짐 학생 → 예전처럼 공용방 입장(되돌림 없음)
    ({ page, ctx } = await newPage());
    await setup(page, { role: 'student', resp: { ok: true, sessions: [], current: null, student_gate: 'off', holiday: null } });
    await page.evaluate(() => { vcJoinRoom(); });
    r = await waitOutcome(page, 8000);
    { const t0 = Date.now(); while (!page.__dialogs.length && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100)); }
    ok(`C3#${i} 휴강 아님 → 예전처럼 공용방 입장`, r.inCall, JSON.stringify(page.__dialogs));
    ok(`C3#${i} 예전 «예약 없음 · 공용 연습방» 안내 그대로`, page.__dialogs.some(d => d.includes('예약된 수업이 없어서')), JSON.stringify(page.__dialogs));
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
for (const f of fails) console.log('  ❌ ' + f);
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
