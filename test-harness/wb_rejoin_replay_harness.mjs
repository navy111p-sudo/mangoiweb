// -*- coding: utf-8 -*-
// wb_rejoin_replay_harness.mjs — 재접속한 사람의 칠판이 «텅 빈» 사고 회귀 감시 (2026-11-04)
//   실행: node test-harness/wb_rejoin_replay_harness.mjs
//
// [제보 — 2026-11-04 사내 시험]
//   강사가 교재를 올려 밑줄을 긋고 칠판에 메모를 적었다. Sir Karl 이 약 20초 끊겼다가 다시 들어오니
//   교재는 그대로 보이는데 «칠판만 완전히 비어» 있었다(강사 화면에는 그대로).
//   Expected: 재접속 뒤에도 칠판이 교재처럼 양쪽에 남아 있어야 한다.
//
// [뿌리 — 둘. 둘 다 «칠판만 비고 교재는 남는» 같은 모양을 만든다]
//   Ⓐ 화면(js/idx-vc-textbook.js): 수업에 들어오면(body.vc-in-call) «350ms 뒤» onEnterCall 이
//      지난 수업 칠판을 비웠다(wbReceiveClear). 그런데 그 사이 서버가 돌려준 «지금 수업» 칠판
//      (whiteboard-replay)이 먼저 도착하면 그것까지 지웠다. 권한·TURN 을 미리 잡아 두는 지금 입장
//      흐름은 WebSocket 을 거의 곧바로 열어, 회선이 좋을수록 복원본이 350ms 안에 온다.
//      [잰 것 — 실제 index.html, 헤드리스 크로미움] 입장 후 50ms·200ms 에 온 복원본은 1초 뒤 0개,
//      600ms 에 온 것은 남았다. 교재는 pdf-sync·HTTP 폴링으로 다시 채워지니 «칠판만» 비었다.
//      → 지난 수업 칠판은 «들어오는 순간»(관찰자 콜백 = WebSocket 을 열기 전) 한 번만 비운다.
//   Ⓑ 서버(src/video-call-room.ts): 20초 순단 유예(dropRec)로 신원을 물려받을 때는 옛 소켓을
//      stale- 로 바꾸지 않는다. 닫힌/닫히는 소켓이 getWebSockets() 에 남으면 wsOf 가 그쪽을 «먼저»
//      골라, send() 가 readyState 에서 조용히 버린다 → 재입장자가 room-joined·whiteboard-replay 를
//      못 받는다(교재는 HTTP 폴링으로 살아남는다). → wsOf 가 «열린 소켓 먼저» 고른다.
//      ⚠️ 운영 런타임이 닫힌 소켓을 정말 남기는지는 재지 못했다 — 같은 파일의 joinedUsers 주석
//         («닫히는 중/닫힌 소켓(재연결 좀비 등)») 과 sticky 경로의 stale- 이름 바꾸기가 그 사정을 전제한다.
//
// ⛔ 문자열이 아니라 «실제로 돌려서» 묻는다 — Ⓐ 는 그 IIFE 를 오려 내 가짜 DOM 에서 실행,
//    Ⓑ 는 esbuild 로 진짜 DO 클래스를 번들해 가짜 storage·소켓으로 실행한다.
// ⛔ 각 «고쳤다» 옆에 «예전 동작은 그대로» 짝을 둔다(지난 수업 칠판은 여전히 비워진다 등).

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const CF = join(ROOT, 'cloudflare-deploy');

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(name, cond, detail) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

/* ═══════════════════════════════════════════════════════════════════════
   Ⓐ 화면 — 입장 처리 IIFE 를 오려 내 가짜 DOM 에서 실제로 돌린다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ Ⓐ 화면 — 서버가 돌려준 «지금 수업» 칠판을 입장 처리가 지우지 않는다 ]');
const TB = readFileSync(join(CF, 'public', 'js', 'idx-vc-textbook.js'), 'utf8');
/** 「대기 카드 + 입장 처리」 IIFE 하나를 중괄호 짝으로 자른다(다음 IIFE 가 딸려 오지 않게). */
function sliceEntryIife(src) {
  const anchor = src.indexOf("card(){ return _el || (_el = document.getElementById('vc-wait-card'))");
  if (anchor < 0) return '';
  const start = src.lastIndexOf('(function(){', anchor);
  let depth = 0, i = src.indexOf('{', start);
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  const end = src.indexOf(')();', i);
  return end > 0 ? src.slice(start, end + 4) : '';
}
const IIFE = sliceEntryIife(TB);
ok('전제 — 입장 처리 IIFE 를 실제로 잘라 냈다', IIFE.length > 500 && /onEnterCall/.test(IIFE) && /MutationObserver/.test(IIFE),
   IIFE.length + '자');

/** 가짜 브라우저 하나. body class 를 바꾸면 그 «다음» 에 관찰자 콜백을 부른다(= 마이크로태스크). */
function makePage(src) {
  const cls = new Set();
  const observers = [];
  let now = 0; const timers = [];
  const calls = { clear: 0, tabs: [], clearAt: [] };
  const win = { wbOps: [], _vcObserverMode: false };
  win.vcSwitchTab = (t) => calls.tabs.push(t);
  const ctx = {
    window: win,
    document: {
      body: { classList: { contains: c => cls.has(c), add: c => cls.add(c), remove: c => cls.delete(c) } },
      getElementById: () => null,
    },
    MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe() {} },
    setTimeout: (fn, ms) => { timers.push({ at: now + (ms || 0), fn }); return timers.length; },
    setInterval: () => 0,
    localStorage: { getItem: () => null },
    /* 칠판 비우기 정본(idx-main.js) 대신 — 기록을 비우고 언제 불렸는지 적는다 */
    wbReceiveClear: () => { calls.clear++; calls.clearAt.push(now); win.wbOps.length = 0; },
  };
  vm.createContext(ctx);
  let err = null;
  try { vm.runInContext(src, ctx); } catch (e) { err = e; }
  const notify = () => { for (const o of observers) o.cb([]); };
  const page = {
    err, win, calls, observers,
    get now() { return now; },
    enter() { cls.add('vc-in-call'); notify(); },
    leave() { cls.delete('vc-in-call'); notify(); },
    otherClass(c, on) { if (on) cls.add(c); else cls.delete(c); notify(); },
    /** 서버가 보낸 whiteboard-replay — idx-main.js 처리처럼 «비우고 서버 것으로 다시 채운다» */
    replay(ops) { win.wbOps.length = 0; for (const o of ops) win.wbOps.push(o); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > until) break;
        timers.shift(); now = t.at;
        try { t.fn(); } catch (_) {}
      }
      now = until;
    },
  };
  return page;
}

function scenarios(src, quiet) {
  const R = {};
  const P = (k, v) => { R[k] = v; };
  /* S1 — 제보 그대로: 지난 수업 잔상이 있는 채로 입장 → 100ms 뒤 서버 복원본 도착 → 1초 뒤에도 남는가 */
  {
    const p = makePage(src);
    p.win.wbOps.push({ k: 'text', d: { text: 'old class' } });
    p.enter();
    P('s1_clearedAtEntry', p.win.wbOps.length === 0 && p.calls.clear === 1 && p.calls.clearAt[0] === 0);
    p.advance(100);
    p.replay([{ k: 'text', d: { text: 'Hello notes' } }, { k: 'seg', d: { tool: 'pen' } }]);
    p.advance(1000);
    P('s1_replayKept', p.win.wbOps.length === 2 && p.win.wbOps[0].d.text === 'Hello notes');
    P('s1_clearOnce', p.calls.clear === 1);
    P('s1_noErr', !p.err);
  }
  /* S2 — 짝: 서버가 아무것도 안 돌려줘도(새 수업) 지난 수업 칠판은 여전히 비워진다 */
  {
    const p = makePage(src);
    p.win.wbOps.push({ k: 'text', d: { text: 'old class' } });
    p.enter(); p.advance(1000);
    P('s2_leftoverCleared', p.win.wbOps.length === 0);
  }
  /* S3 — 수업 중 다른 body class 가 바뀌어도(가벼운 모드·전체화면 등) 다시 지우지 않는다 */
  {
    const p = makePage(src);
    p.enter(); p.advance(50);
    p.replay([{ k: 'text', d: { text: 'Q1' } }]);
    p.otherClass('vc-lite', true); p.advance(40); p.otherClass('vc-fullscreen', true);
    p.advance(1000);
    p.otherClass('vc-lite', false); p.advance(1000);
    P('s3_keptAcrossClassChanges', p.win.wbOps.length === 1 && p.calls.clear === 1);
  }
  /* S4 — 나갔다 «다시» 들어오면 그 입장에서 한 번 더 비운다(지난 수업 잔상 방지 그대로) */
  {
    const p = makePage(src);
    p.enter(); p.advance(80); p.replay([{ k: 'text', d: { text: 'class 1' } }]); p.advance(1000);
    p.leave(); p.advance(500);
    P('s4_leaveKeepsUntilNextEntry', p.win.wbOps.length === 1);
    p.enter();
    P('s4_reentryClears', p.win.wbOps.length === 0 && p.calls.clear === 2);
    p.advance(120); p.replay([{ k: 'text', d: { text: 'class 2' } }]); p.advance(1000);
    P('s4_reentryReplayKept', p.win.wbOps.length === 1 && p.win.wbOps[0].d.text === 'class 2');
  }
  /* S5 — 짝: 입장 처리의 나머지(첫 탭 = 교재, 교재 표시 상태 초기화)는 예전 그대로 350ms 뒤에 돈다 */
  {
    const p = makePage(src);
    p.win._vcCurrentPdfUrl = '/library/old.pdf';
    p.enter(); p.advance(300);
    const before = p.calls.tabs.length;
    p.advance(100);
    P('s5_tabPdfAfterDelay', before === 0 && p.calls.tabs.includes('pdf'));
    P('s5_pdfUrlReset', p.win._vcCurrentPdfUrl === '');
  }
  /* S6 — 복원본이 늦게(600ms) 와도 남는다(예전에도 되던 경우 — 그대로인가) */
  {
    const p = makePage(src);
    p.enter(); p.advance(600); p.replay([{ k: 'seg', d: { tool: 'pen' } }]); p.advance(1000);
    P('s6_lateReplayKept', p.win.wbOps.length === 1);
  }
  return R;
}

const A = scenarios(IIFE);
ok('들어오는 «순간» 지난 수업 칠판을 비운다(WebSocket 을 열기 전)', A.s1_clearedAtEntry);
ok('입장 100ms 뒤 온 서버 복원본(whiteboard-replay)이 1초 뒤에도 남는다 — 제보의 핵심', A.s1_replayKept);
ok('한 번 입장에 한 번만 비운다', A.s1_clearOnce);
ok('입장 처리 코드가 오류 없이 돈다', A.s1_noErr);
ok('짝 — 서버가 아무것도 안 돌려줘도 지난 수업 칠판은 비워진다', A.s2_leftoverCleared);
ok('수업 중 다른 body class 가 바뀌어도 칠판을 다시 지우지 않는다', A.s3_keptAcrossClassChanges);
ok('짝 — 나간 뒤 다음 입장 전까지는 건드리지 않는다', A.s4_leaveKeepsUntilNextEntry);
ok('짝 — 다시 들어오면 그 입장에서 한 번 더 비운다', A.s4_reentryClears);
ok('다시 들어온 뒤 온 복원본도 남는다', A.s4_reentryReplayKept);
ok('짝 — 첫 탭은 여전히 350ms 뒤 «교재» 로 맞춘다', A.s5_tabPdfAfterDelay);
ok('짝 — 교재 표시 상태(_vcCurrentPdfUrl) 초기화는 그대로', A.s5_pdfUrlReset);
ok('짝 — 늦게 온 복원본도 남는다', A.s6_lateReplayKept);

/* Ⓐ-퍼즈 — 입장·퇴장·다른 class 변화·복원본 도착 시각을 무작위로 섞어 수백 번 돌린다(시드 고정 = 재현 가능).
   불변식: 매 입장 뒤 칠판 기록은 «그 입장 뒤 마지막으로 온 복원본» 과 같고, 복원본이 없었으면 비어 있다.
   (지난 수업 잔상이 남지도, 지금 수업 복원본이 지워지지도 않는다) · 한 입장에 비우기는 정확히 1번. */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SEED = Number(process.env.HARNESS_SEED || 20261104);
const FUZZ_A = Number(process.env.FUZZ_A || 500);
function fuzzClient(src, n, seed) {
  const R = rng(seed); const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  let bad = 0, sample = '';
  for (let it = 0; it < n; it++) {
    const p = makePage(src);
    for (let k = ri(0, 3); k > 0; k--) p.win.wbOps.push({ k: 'text', d: { text: 'leftover' } });
    const entries = ri(1, 3); let okRun = true; const why = [];
    for (let e = 0; e < entries && okRun; e++) {
      const clearBefore = p.calls.clear;
      p.enter();
      /* 이 입장 동안 일어날 일들을 시각 순으로 */
      const events = [];
      for (let k = ri(0, 4); k > 0; k--) events.push({ at: ri(0, 900), kind: 'cls', on: R() < 0.5, c: 'x' + ri(1, 3) });
      const replays = R() < 0.2 ? 0 : ri(1, 2);
      for (let k = 0; k < replays; k++) events.push({ at: ri(0, 1200), kind: 'replay', ops: Array.from({ length: ri(1, 4) }, (_, j) => ({ k: 'text', d: { text: `e${e}r${k}o${j}` } })) });
      events.sort((a, b) => a.at - b.at);
      let t = 0, last = null;
      for (const ev of events) {
        p.advance(ev.at - t); t = ev.at;
        if (ev.kind === 'cls') p.otherClass(ev.c, ev.on);
        else { p.replay(ev.ops); last = ev.ops; }
      }
      p.advance(2000 - t);
      const got = p.win.wbOps.map(o => o.d && o.d.text).join('|');
      const want = last ? last.map(o => o.d.text).join('|') : '';
      if (got !== want) { okRun = false; why.push(`입장${e}: 기록=[${got}] 기대=[${want}]`); }
      if (p.calls.clear - clearBefore !== 1) { okRun = false; why.push(`입장${e}: 비우기 ${p.calls.clear - clearBefore}번`); }
      p.leave(); p.advance(ri(0, 3000));
    }
    if (!okRun) { bad++; if (!sample) sample = `#${it} ` + why.join(' · '); }
  }
  return { bad, sample };
}
const FA = fuzzClient(IIFE, FUZZ_A, SEED);
ok(`퍼즈 ${FUZZ_A}회(시드 ${SEED}) — 어떤 순서·시각에도 복원본이 남고 잔상은 지워진다`, FA.bad === 0, FA.bad ? `${FA.bad}회 실패 · 예: ${FA.sample}` : '');

/* ═══════════════════════════════════════════════════════════════════════
   Ⓑ 서버 — 진짜 DO 를 번들해 «닫힌 옛 소켓이 목록에 남은» 채로 순단 유예 재입장을 돌린다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ Ⓑ 서버 — 순단 유예로 돌아온 사람에게 칠판·입장 응답이 «새 소켓» 으로 간다 ]');
const RUN_ESBUILD = (p, args, opts) => (process.platform === 'win32'
  ? execFileSync(process.execPath, [p, ...args], opts)
  : execFileSync(p, args, opts));
const outDir = mkdtempSync(join(tmpdir(), 'mangoi-wbrejoin-'));
let doFile = null;
try {
  doFile = join(outDir, 'vcr.mjs');
  RUN_ESBUILD(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), [
    join(CF, 'src', 'video-call-room.ts'), '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
    `--outfile=${doFile}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  const msg = (e && (e.stderr ? String(e.stderr) : e.message)) || String(e);
  console.log('  ❌ esbuild 번들 실패 — 이 절은 esbuild 가 있어야 돕니다(cloudflare-deploy 에서 npm ci)');
  msg.split(/\r?\n/).filter(x => x && !/^\s*at /.test(x)).slice(0, 6).forEach(x => console.log('     ' + x));
  try { rmSync(outDir, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n결과: ${PASS} 통과, ${FAIL + 1} 실패`);
  process.exit(1);
}

if (!globalThis.WebSocket) globalThis.WebSocket = { OPEN: 1, CLOSING: 2, CLOSED: 3 };
let NOW = 1_800_000_000_000;
const realNow = Date.now;
Date.now = () => NOW;
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
let TIMERS = [], tid = 0;
globalThis.setTimeout = (fn, ms) => { const id = ++tid; TIMERS.push({ id, fn, ms }); return id; };
globalThis.clearTimeout = (id) => { TIMERS = TIMERS.filter(t => t.id !== id); };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function runTimers() { const ts = TIMERS; TIMERS = []; for (const t of ts) t.fn(); await flush(); }

const { VideoCallRoom } = await import(pathToFileURL(doFile).href);

function makeStorage() {
  const m = new Map(); let alarm = null;
  const clone = v => (v === undefined ? undefined : structuredClone(v));
  return {
    m,
    async get(k) { return clone(m.get(k)); },
    async put(k, v) { m.set(k, clone(v)); },
    async delete(k) {
      if (Array.isArray(k)) { let n = 0; for (const x of k) if (m.delete(x)) n++; return n; }
      return m.delete(k);
    },
    async list(opts = {}) {
      const p = opts.prefix || '';
      const keys = [...m.keys()].filter(k => k.startsWith(p)).sort();
      return new Map(keys.map(k => [k, clone(m.get(k))]));
    },
    async getAlarm() { return alarm; },
    async setAlarm(t) { alarm = t; },
    async deleteAlarm() { alarm = null; },
  };
}
class FakeWS {
  constructor(att, world) { this.att = structuredClone(att); this.readyState = 1; this.out = []; this.closed = null; this.world = world; }
  serializeAttachment(a) {
    /* 운영 런타임은 닫힌 소켓의 attachment 갱신을 거절할 수 있다(holdDrop 주석) — 그 경우도 재현한다 */
    if (this.readyState !== 1 && this.world.rejectClosedAttach) throw new Error('closed');
    this.att = structuredClone(a);
  }
  deserializeAttachment() { return this.att; }
  send(s) { if (this.readyState !== 1) throw new Error('send on closed'); this.out.push(JSON.parse(s)); }
  close(code, reason) { if (this.readyState === 1) this.readyState = 2; this.closed = this.closed || { code, reason }; }
  types() { return this.out.map(o => o.type); }
}
/**
 * @param keepClosed true = 닫힌/닫히는 소켓도 getWebSockets() 에 남는다(이번 제보의 의심 조건)
 * @param rejectClosedAttach true = 닫힌 소켓의 attachment 갱신이 거절된다
 */
function makeWorld({ keepClosed, rejectClosedAttach = false }) {
  const storage = makeStorage();
  const sockets = [];
  const state = {
    storage,
    getWebSockets: () => (keepClosed ? sockets.slice() : sockets.filter(s => s.readyState === 1)),
    acceptWebSocket: ws => sockets.push(ws),
    blockConcurrencyWhile: async fn => fn(),
    setWebSocketAutoResponse() {},
    getWebSocketAutoResponseTimestamp: () => null,
  };
  const world = { storage, sockets, state, rejectClosedAttach, room: null };
  world.boot = async () => { world.room = new VideoCallRoom(state, { VC_STICKY_UID: 'on' }); await flush(); return world.room; };
  world.connect = (id) => { const ws = new FakeWS({ userId: id, roomId: 'class-9-20261104', joined: false, seenAt: NOW }, world); sockets.push(ws); return ws; };
  world.msg = async (ws, type, data) => { await world.room.webSocketMessage(ws, JSON.stringify({ type, data })); await flush(); };
  world.join = async (id, username, role, clientId) => { const ws = world.connect(id); await world.msg(ws, 'join-room', { username, role, clientId }); return ws; };
  /** 상대가 끊었다(닫힘 프레임·회선 끊김) — 소켓은 CLOSED, 서버는 webSocketClose 를 받는다 */
  world.drop = async (ws, code = 1006) => { ws.readyState = 3; await world.room.webSocketClose(ws, code, ''); await flush(); };
  return world;
}

async function rejoinCase(opts) {
  const w = makeWorld(opts); await w.boot();
  const t = await w.join('t1', 'Teacher', 'teacher', 'cT');
  const s = await w.join('s1', 'Karl', 'student', 'cKarl');
  const sid = s.att.userId;
  await w.msg(t, 'pdf-share', { url: '/library/book1.pdf', currentPage: 2, kind: 'pdf', name: 'Book 1' });
  await w.msg(t, 'whiteboard-text', { x: 0.2, y: 0.3, text: 'Notes: show and tell' });
  await w.msg(t, 'whiteboard-draw', { tool: 'pen', fromX: 0.1, fromY: 0.5, toX: 0.6, toY: 0.5, color: '#f00', size: 4 });
  await runTimers();
  t.out = [];
  await w.drop(s, 1006);                    // Karl 이 끊김 → 20초 유예
  NOW += 15_000;
  const s2 = await w.join('fresh', 'Karl', 'student', 'cKarl');   // 같은 브라우저로 돌아옴
  const rj = s2.out.find(o => o.type === 'room-joined');
  const rep = s2.out.find(o => o.type === 'whiteboard-replay');
  const res = {
    gotJoined: !!rj,
    sameId: !!rj && rj.data.userId === sid,
    replay: !!rep && rep.data.ops.some(o => o.t === 'whiteboard-text' && /show and tell/.test(o.d.text))
            && rep.data.ops.some(o => o.t === 'whiteboard-draw'),
    pdf: s2.types().includes('pdf-sync'),
    teacherNoLeft: !t.types().includes('user-left'),
  };
  /* 돌아온 사람이 칠판에 쓰면 강사에게 간다(서버가 «입장한 사람» 으로 본다) */
  t.out = [];
  await w.msg(s2, 'whiteboard-text', { x: 0.5, y: 0.5, text: 'Karl answer' });
  res.studentDrawRelayed = t.out.some(o => o.type === 'whiteboard-text' && o.data && o.data.text === 'Karl answer');
  /* 강사가 그 뒤에 Karl 에게만 보내는 응답(ping→pong)도 새 소켓으로 간다 */
  s2.out = [];
  await w.msg(s2, 'ping', {});
  res.pongToNew = s2.types().includes('pong');
  return res;
}

const keepRej = await rejoinCase({ keepClosed: true, rejectClosedAttach: true });
ok('닫힌 옛 소켓이 목록에 남아 있어도 — 돌아온 사람이 room-joined 를 받는다', keepRej.gotJoined);
ok('…같은 신원(userId)을 그대로 물려받는다', keepRej.sameId);
ok('…칠판 복원본(whiteboard-replay — 글자·펜 획)을 받는다 — 제보의 핵심', keepRej.replay);
ok('…교재(pdf-sync)도 받는다', keepRej.pdf);
ok('…자기에게만 오는 응답(pong)도 새 소켓으로 간다', keepRej.pongToNew);
ok('…강사 화면에는 «나갔다» 가 가지 않는다(유예 동작 그대로)', keepRej.teacherNoLeft);
ok('…돌아온 사람이 칠판에 쓰면 강사에게 간다', keepRej.studentDrawRelayed);

const keepOk = await rejoinCase({ keepClosed: true, rejectClosedAttach: false });
ok('짝 — 닫힌 소켓 갱신이 받아들여지는 런타임에서도 칠판 복원본을 받는다', keepOk.replay && keepOk.sameId && keepOk.gotJoined);

const clean = await rejoinCase({ keepClosed: false });
ok('짝 — 닫힌 소켓이 목록에서 바로 빠지는 경우(예전 하니스 조건)도 그대로 받는다',
   clean.replay && clean.sameId && clean.gotJoined && clean.pdf && clean.teacherNoLeft);

/* 짝 — 끊김을 서버가 «못 본» 채 돌아온 경우(회선만 바뀜): 옛 sticky 경로가 stale- 로 비켜 두고 물려준다 */
{
  const w = makeWorld({ keepClosed: true }); await w.boot();
  const t = await w.join('t1', 'Teacher', 'teacher', 'cT');
  const s = await w.join('s1', 'Karl', 'student', 'cKarl');
  const sid = s.att.userId;
  await w.msg(t, 'whiteboard-text', { x: 0.1, y: 0.1, text: 'half-open notes' });
  await runTimers();
  const s2 = await w.join('fresh2', 'Karl', 'student', 'cKarl');   // 옛 소켓은 서버 눈에 아직 OPEN
  const rj = s2.out.find(o => o.type === 'room-joined');
  const rep = s2.out.find(o => o.type === 'whiteboard-replay');
  ok('짝 — 서버가 끊김을 못 본 채 돌아와도(sticky) 새 소켓이 같은 신원·칠판을 받는다',
     !!rj && rj.data.userId === sid && !!rep && rep.data.ops.some(o => /half-open/.test(o.d.text || '')));
  ok('짝 — 그때 옛 소켓은 4001 로 닫힌다(예전 동작)', !!s.closed && s.closed.code === 4001);
}

/* 짝 — 같은 신원의 «열린» 소켓이 없으면 예전처럼 첫 번째를 돌려준다(아무것도 안 보내지는 쪽이 아니라 «예전 그대로») */
{
  const w = makeWorld({ keepClosed: true }); await w.boot();
  const t = await w.join('t1', 'Teacher', 'teacher', 'cT');
  const s = await w.join('s1', 'Lee', 'student', 'cLee');
  await w.drop(s, 1006);
  let threw = null;
  try { await w.msg(t, 'chat-message', { message: 'hi', to: s.att.userId }); } catch (e) { threw = e; }
  ok('짝 — 닫힌 소켓만 남은 사람에게 보내도 서버가 던지지 않는다', !threw);
}

/* Ⓑ-퍼즈 — 끊김 방식·돌아오는 시각(유예 안/밖)·인스턴스 잠듦·닫힌 소켓이 남는지·갱신 거절·
   «끊긴 동안 강사가 더 쓴 판서» 를 무작위로 섞어 돌린다. 불변식: 돌아온 사람은 room-joined 와
   «강사가 쓴 칠판 전부(순서 그대로)» 를 받는다. 유예 안이면 같은 신원, 강사에게 user-left 없음. */
const FUZZ_B = Number(process.env.FUZZ_B || 200);
{
  const R = rng(SEED ^ 0x5bd1e995); const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const KINDS = [
    i => ['whiteboard-text', { x: 0.1, y: 0.1 + i / 100, text: 'T' + i }],
    i => ['whiteboard-draw', { tool: 'pen', fromX: 0.1, fromY: 0.2, toX: 0.3, toY: 0.2 + i / 100, color: '#f00', size: 3, n: i }],
    i => ['whiteboard-stroke', { points: [[0.1, 0.1], [0.2, 0.2 + i / 100]], color: '#00f', size: 3, n: i }],
    i => ['whiteboard-shape', { shape: { type: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, color: '#0a0', size: 2, n: i }],
  ];
  let bad = 0, sample = '', within = 0, after = 0;
  for (let it = 0; it < FUZZ_B; it++) {
    const keepClosed = R() < 0.7, rejectClosedAttach = R() < 0.5;
    const w = makeWorld({ keepClosed, rejectClosedAttach }); await w.boot();
    const t = await w.join('t1', 'Teacher', 'teacher', 'cT');
    const s = await w.join('s1', 'Karl', 'student', 'cKarl');
    const sid = s.att.userId;
    const sent = [];
    const write = async (n) => { for (let k = 0; k < n; k++) { const [ty, d] = KINDS[ri(0, 3)](sent.length); sent.push([ty, d]); await w.msg(t, ty, d); if (R() < 0.3) await runTimers(); } };
    await write(ri(1, 6));
    if (R() < 0.5) await runTimers();
    t.out = [];
    await w.drop(s, R() < 0.5 ? 1006 : 1001);
    const gap = R() < 0.75 ? ri(500, 19_000) : ri(21_000, 120_000);
    const inGrace = gap < 20_000; if (inGrace) within++; else after++;
    await write(ri(0, 3));                                   // 끊긴 동안에도 강사는 계속 쓴다
    NOW += gap;
    if (R() < 0.5) await runTimers();
    if (R() < 0.4) { if (TIMERS.length) await runTimers(); await w.boot(); }   // 잠들었다 깸 — 예약 타이머가 있는 동안은 잠들지 않는다(LOG_FLUSH_MS 주석)
    if (!inGrace) { await w.room.alarm(); await flush(); }   // 유예 만료 알람
    const leftSeen = t.types().includes('user-left');
    const s2 = await w.join('fresh-' + it, 'Karl', 'student', 'cKarl');
    const rj = s2.out.find(o => o.type === 'room-joined');
    const rep = s2.out.find(o => o.type === 'whiteboard-replay');
    const got = rep ? rep.data.ops.map(o => o.t + ':' + JSON.stringify(o.d)).join('|') : '';
    const want = sent.map(([ty, d]) => ty + ':' + JSON.stringify(d)).join('|');
    const why = [];
    if (!rj) why.push('room-joined 못 받음');
    if (got !== want) why.push(`칠판 ${rep ? rep.data.ops.length : 0}/${sent.length}개`);
    if (inGrace && rj && rj.data.userId !== sid) why.push('유예 안인데 신원 바뀜');
    if (inGrace && leftSeen) why.push('유예 안인데 강사에게 user-left');
    if (why.length) { bad++; if (!sample) sample = `#${it} keepClosed=${keepClosed} reject=${rejectClosedAttach} gap=${gap}: ${why.join(', ')}`; }
  }
  ok(`퍼즈 ${FUZZ_B}회(유예 안 ${within} · 밖 ${after}) — 돌아온 사람은 언제나 입장 응답과 칠판 전부를 받는다`, bad === 0,
     bad ? `${bad}회 실패 · 예: ${sample}` : '');
}

Date.now = realNow; globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
try { rmSync(outDir, { recursive: true, force: true }); } catch (_) {}

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패: ' + FAILS.join(' / ')); process.exit(1); }
