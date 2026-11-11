// -*- coding: utf-8 -*-
// kaye_class_issues_261104_harness.mjs — Kaye 강사 2026-11-03 수업 제보 3건 회귀 감시
//   실행: node test-harness/kaye_class_issues_261104_harness.mjs
//
// [제보 — Teacher Kaye, 2026-11-03]
//   ① 채팅 한국어 번역을 켰는데 번역이 안 된다
//   ② 끊겼다 다시 들어온 학생이 교재 화면·칠판에 올린 질문을 못 본다
//   ③ 인터넷이 잠깐만 흔들려도 곧바로 수업에서 튕긴다
//
// [잰 것 — D1, 2026-11-03 KST]
//   · class-4065 chat_messages: 같은 영어 문장이 13:15:17·13:15:26 두 번 «번역 없이» 나갔다(①)
//   · vc_roster(접속마다 한 줄): 학생 juju5731 이 13:01:06 → 13:03:55 → 13:14:28 에 다시 붙었다.
//     두 번째 간격 633초 = LIVENESS_NOPING_STALE_MS(600초) + 알람 주기(45초) 안쪽(③)
//   · 같은 시각 vc_quality: RTT 95~135ms · 손실 0~0.1% — 회선은 멀쩡했다
//
// [뿌리]
//   ③ DO 가 ping 자동응답 시각을 `ws.getAutoResponseTimestamp()` 로 읽었다 — WebSocket 에는 그런
//      메서드가 없다(정본: DurableObjectState.getWebSocketAutoResponseTimestamp(ws)). 늘 0 이라
//      조용한 참가자는 살아 있어도 600초마다 끊겼다. 그리고 소켓이 닫히는 순간 user-left 를 방송해
//      상대 화면이 영상 연결을 바로 닫았다.
//   ② 칠판·교재 판서는 메모리에만 있었다 — DO 는 10초만 조용하면 hibernation 으로 내려가 그 버퍼가
//      빈다. 강사의 «현재 탭» 은 아예 저장·재전송되지 않았다.
//   ① 화면이 3초만 기다리고 «아무 말 없이» 원문을 보냈다. 서버는 언어모델이 한 번 실패하면 끝이었다.
//
// ⛔ 이 하니스는 문자열이 아니라 «실제로 돌려서» 묻는다. 「그 글자가 있는가」는
//    2026-08-20 ~ 2026-11-03 동안 틀린 API 이름을 초록불로 통과시켰다(vc_ghost_liveness ⑧번 줄).

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '../cloudflare-deploy');

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

/* ═══ 0) esbuild 로 실번들 (admin_404_apis_harness 와 같은 방식 — OS 별 실행 차이 포함) ═══ */
const RUN_ESBUILD = (p, args, opts) => (process.platform === 'win32'
  ? execFileSync(process.execPath, [p, ...args], opts)
  : execFileSync(p, args, opts));
const outDir = mkdtempSync(join(tmpdir(), 'mangoi-kaye-'));
function bundle(entry, name) {
  const outFile = join(outDir, name);
  try {
    RUN_ESBUILD(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), [
      join(CF, 'src', entry), '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
      `--outfile=${outFile}`,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const msg = (e && (e.stderr ? String(e.stderr) : e.message)) || String(e);
    console.log('  ❌ esbuild 번들 실패 — 이 하니스는 esbuild 가 있어야 돕니다');
    msg.split(/\r?\n/).filter(x => x && !/^\s*at /.test(x)).slice(0, 8).forEach(x => console.log('     ' + x));
    console.log('\n결과: 0 통과, 1 실패');
    process.exit(1);
  }
  return outFile;
}
const doFile = bundle('video-call-room.ts', 'vcr.mjs');
const mangoFile = bundle('api-mango.ts', 'mango.mjs');

/* ═══ 가짜 런타임 ═══ */
/* Node 22+ 에는 표준 WebSocket(OPEN=1·CLOSING=2·CLOSED=3, 읽기 전용)이 이미 있다 — 없을 때만 만든다. */
if (!globalThis.WebSocket) globalThis.WebSocket = { OPEN: 1, CLOSING: 2, CLOSED: 3 };
let NOW = 1_800_000_000_000;
const realNow = Date.now;
Date.now = () => NOW;
/* DO 의 setTimeout(로그 모아 쓰기)은 하니스가 손으로 돌린다 — 실제 시간을 기다리지 않는다. */
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
let TIMERS = [], tid = 0, FAKE_TIMERS = true;
globalThis.setTimeout = (fn, ms) => {
  if (!FAKE_TIMERS) return realSetTimeout(fn, Math.min(ms, 15));   // 번역 경로: 시간 상한을 15ms 로 줄여 실제로 돌린다
  const id = ++tid; TIMERS.push({ id, fn, ms }); return id;
};
globalThis.clearTimeout = (id) => { TIMERS = TIMERS.filter(t => t.id !== id); if (!FAKE_TIMERS) realClearTimeout(id); };
async function runTimers() { const ts = TIMERS; TIMERS = []; for (const t of ts) t.fn(); await flush(); }
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

const { VideoCallRoom } = await import(pathToFileURL(doFile).href);

function makeStorage() {
  const m = new Map(); let alarm = null;
  const clone = v => (v === undefined ? undefined : structuredClone(v));
  return {
    m,
    get alarmAt() { return alarm; },
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
  constructor(att) { this.att = structuredClone(att); this.readyState = 1; this.out = []; this.closed = null; }
  serializeAttachment(a) { this.att = structuredClone(a); }
  deserializeAttachment() { return this.att; }
  send(s) { this.out.push(JSON.parse(s)); }
  close(code, reason) { this.readyState = 3; this.closed = { code, reason }; }
  types() { return this.out.map(o => o.type); }
}
function makeWorld(env = { VC_STICKY_UID: 'on' }) {
  const storage = makeStorage();
  const sockets = [];
  const auto = new Map();
  const state = {
    storage,
    getWebSockets: () => sockets.filter(s => s.readyState !== 3),
    acceptWebSocket: ws => sockets.push(ws),
    blockConcurrencyWhile: async fn => fn(),
    setWebSocketAutoResponse() {},
    getWebSocketAutoResponseTimestamp: ws => (auto.has(ws) ? new Date(auto.get(ws)) : null),
  };
  const world = { storage, sockets, auto, state, env, room: null };
  world.boot = async () => { world.room = new VideoCallRoom(state, env); await flush(); return world.room; };
  /** hibernation 흉내 — 소켓·attachment·storage 는 그대로, 인스턴스(메모리)만 새로 */
  world.hibernate = world.boot;
  world.connect = (id) => { const ws = new FakeWS({ userId: id, roomId: 'class-1-20261103', joined: false, seenAt: NOW }); sockets.push(ws); return ws; };
  world.msg = async (ws, type, data) => { await world.room.webSocketMessage(ws, JSON.stringify({ type, data })); await flush(); };
  world.join = async (id, username, role, clientId) => {
    const ws = world.connect(id);
    await world.msg(ws, 'join-room', { username, role, clientId });
    return ws;
  };
  world.close = async (ws, code = 1006) => { ws.readyState = 3; await world.room.webSocketClose(ws, code, ''); await flush(); };
  return world;
}

/* ═══════════════════════════════════════════════════════════════════════
   ③-A 살아 있는 학생을 끊지 않는다 — ping 자동응답 시각을 «정본 API» 로 읽는가
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ ③-A 서버 생존 판정이 ping 자동응답 시각을 실제로 읽는다 ]');
{
  const w = makeWorld(); await w.boot();
  const s = await w.join('s1', 'juju', 'student', 'cS');
  /* 입장 뒤 11분 동안 ping 말고는 아무것도 안 보낸 «조용한 학생» — 실측 633초 끊김의 모양 */
  NOW += 660_000;
  await w.hibernate();                      // 메모리 lastSeen 은 비고 attachment 의 seenAt 은 옛 값
  w.auto.set(s, NOW - 20_000);              // 20초 전에도 ping 에 자동응답했다 = 살아 있다
  await w.room.alarm(); await flush();
  ok('ping 이 오가는 조용한 학생은 11분이 지나도 끊지 않는다(실측 633초 끊김)', s.closed === null);

  const w2 = makeWorld(); await w2.boot();
  const g = await w2.join('g1', 'ghost', 'student', 'cG');
  NOW += 660_000; await w2.hibernate();
  await w2.room.alarm(); await flush();
  ok('짝 — ping 근거가 «없고» 상한(600초)을 넘긴 소켓은 예전대로 정리한다(유령 보호 유지)',
     !!g.closed && g.closed.code === 4003);

  const w3 = makeWorld(); await w3.boot();
  const d = await w3.join('d1', 'dead', 'student', 'cD');
  NOW += 300_000; await w3.hibernate();
  w3.auto.set(d, NOW - 200_000);            // ping 이 200초 전에 끊겼다 = 진짜 죽은 소켓
  await w3.room.alarm(); await flush();
  ok('짝 — ping 이 120초 넘게 끊긴 소켓은 600초를 기다리지 않고 정리한다(설계값 복원)',
     !!d.closed && d.closed.code === 4003);

  const SRC = readFileSync(join(CF, 'src', 'video-call-room.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok('없는 API(ws.getAutoResponseTimestamp)를 다시 부르지 않는다', !/\.getAutoResponseTimestamp\b/.test(SRC));
}

/* ═══════════════════════════════════════════════════════════════════════
   ③-B 잠깐 끊긴 사람을 곧바로 «떠났다» 고 방송하지 않는다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ ③-B 순단 유예 — 20초 안에 돌아오면 상대 화면은 아무 일도 겪지 않는다 ]');
{
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  const s = await w.join('s1', 'juju', 'student', 'cS');
  const sid = s.att.userId;
  t.out = [];
  await w.close(s, 1006);
  ok('학생 소켓이 끊긴 «순간» 강사에게 user-left 를 보내지 않는다', !t.types().includes('user-left'));
  ok('유예 기록이 storage 에 남는다(hibernation 을 넘어 산다)', w.storage.m.has('drop:' + sid));
  ok('알람이 유예 마감(20초) 안쪽으로 당겨진다', !!w.storage.alarmAt && w.storage.alarmAt <= NOW + 20_000);

  NOW += 5_000;
  await w.hibernate();                       // 유예 중에 인스턴스가 내려가도
  const s2 = await w.join('fresh-id', 'juju', 'student', 'cS');
  const rj = s2.out.find(o => o.type === 'room-joined');
  ok('같은 브라우저(clientId)로 돌아오면 옛 userId 를 그대로 받는다(무중단 재연결)', !!rj && rj.data.userId === sid);
  /* 🔁 리뷰 반영(2026-11-04): 서버는 «같은 페이지 재연결» 과 «20초 안 새로고침» 을 가를 수 없다.
     새로고침이면 새 페이지는 상대의 카메라 꺼짐·화면공유 상태를 모르므로, 상대가 그것을 다시 알리게 user-joined(rejoin) 를 보낸다.
     받는 쪽은 PC 가 있으면 부수지 않는다(idx-main.js user-joined — offer 안전장치는 PC 가 없을 때만). */
  const ujr = t.out.find(o => o.type === 'user-joined');
  ok('돌아왔을 때 강사에게 user-joined(rejoin) 를 보내 상태 재알림을 받게 한다(새로고침 대비)',
     !!ujr && ujr.data.userId === sid && ujr.data.rejoin === true);
  ok('짝 — 서버 «입장했습니다» 채팅 방송은 하지 않는다(재연결마다 도배 방지)',
     !t.out.some(o => o.type === 'chat-message' && /입장/.test(o.data?.message || '')));
  ok('짝 — 돌아온 사이 user-left 는 나가지 않았다(상대 타일을 «재연결 중» 으로 만들지 않는다)', !t.types().includes('user-left'));
  ok('유예 기록은 꺼내면서 지운다', !w.storage.m.has('drop:' + sid));
  NOW += 30_000; await w.room.alarm(); await flush();
  ok('돌아온 뒤 알람이 돌아도 user-left 가 나가지 않는다', !t.types().includes('user-left'));
}
{
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  const s = await w.join('s1', 'juju', 'student', 'cS');
  t.out = [];
  await w.close(s, 1006);
  NOW += 10_000; await w.room.alarm(); await flush();
  ok('짝 — 유예 중(10초)에는 아직 방송하지 않는다', !t.types().includes('user-left'));
  NOW += 11_000; await w.hibernate(); await w.room.alarm(); await flush();
  const ul = t.out.find(o => o.type === 'user-left');
  ok('짝 — 20초 안에 안 돌아오면 예전처럼 user-left(dropped) 를 방송한다', !!ul && ul.data.reason === 'dropped');
}
{
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  const s = await w.join('s1', 'juju', 'student', 'cS');
  t.out = [];
  await w.msg(s, 'leave-room', {});
  const ul = t.out.find(o => o.type === 'user-left');
  ok('«나가기» 버튼(leave-room)은 미루지 않고 바로 left 로 방송한다', !!ul && ul.data.reason === 'left');
}
{
  const w = makeWorld({}); await w.boot();     // 무중단 재연결 스위치 꺼짐
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  const s = await w.join('s1', 'juju', 'student', 'cS');
  t.out = [];
  await w.close(s, 1006);
  ok('스위치(VC_STICKY_UID)가 꺼져 있으면 예전처럼 곧바로 dropped 를 방송한다', t.types().includes('user-left'));
}
{
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  const s = await w.join('s1', 'juju', 'student', 'cS');
  await w.close(s, 1006);
  NOW += 3_000;
  const u = await w.join('u1', 'manager', 'admin', 'cU');   // 유예 «중» 에 새로 들어온 사람
  const due = w.storage.alarmAt;
  ok('유예 중 누가 들어와도 순단 알람(20초)을 45초 뒤로 밀지 않는다', !!due && due <= NOW + 17_000);
  t.out = []; u.out = [];
  NOW += 2_000;
  await w.join('fresh', 'juju', 'student', 'cS');
  ok('유예 «중» 에 들어온 사람에게는 돌아온 학생의 user-joined 를 알려 준다', u.types().includes('user-joined'));
  ok('그 전부터 있던 강사에게도 user-joined(rejoin) 를 보낸다(상태 재알림)',
     t.out.some(o => o.type === 'user-joined' && o.data.rejoin === true));
}
{
  /* 👁 리뷰 반영: 참관자는 joined:false 라 user-joined 대상이 아니다. 유예 «전» 부터 보던 참관자(새로고침이면 옛 PC 가 죽음)와
     유예 «중» 에 들어온 참관자(이 학생을 아예 모름) 모두 «떠났다 → 들어왔다» 를 순서대로 받아야 다시 붙는다. */
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  const s = await w.join('s1', 'juju', 'student', 'cS');
  const sid = s.att.userId;
  const ob1 = new FakeWS({ userId: 'o1', roomId: 'class-1-20261103', joined: false, role: 'observer', ghost: true, seenAt: NOW }); w.sockets.push(ob1);
  await w.close(s, 1006);
  NOW += 3_000;
  const ob2 = new FakeWS({ userId: 'o2', roomId: 'class-1-20261103', joined: false, role: 'observer', ghost: true, seenAt: NOW }); w.sockets.push(ob2);
  ob1.out = []; ob2.out = []; t.out = [];
  NOW += 2_000;
  await w.join('fresh', 'juju', 'student', 'cS');
  for (const [nm, ob] of [['유예 전부터 보던', ob1], ['유예 중에 들어온', ob2]]) {
    const iL = ob.out.findIndex(o => o.type === 'observer-user-left' && o.data.userId === sid);
    const iJ = ob.out.findIndex(o => o.type === 'observer-user-joined' && o.data.userId === sid);
    ok(nm + ' 참관자는 돌아온 학생에게 «떠났다 → 들어왔다» 를 순서대로 받아 다시 붙는다', iL >= 0 && iJ > iL);
    ok('짝 — ' + nm + ' 참관자에게 user-joined(수업 참가자용) 를 보내지 않는다', !ob.types().includes('user-joined'));
  }
  ok('짝 — 수업 참가자(강사)에게 observer-user-* 를 보내지 않는다',
     !t.types().some(x => /^observer-user-/.test(x)));
}
{
  /* 리뷰 반영: webSocketError 뒤 attachment 갱신이 거절되고 그 소켓이 getWebSockets 에 남아도(닫히는 중)
     유예가 끝나면 user-left 가 나가야 한다 — «입장 중» 판정은 열린 소켓만 센다(joinedOpen). */
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  const s = await w.join('s1', 'juju', 'student', 'cS');
  t.out = [];
  s.serializeAttachment = () => { throw new Error('socket closed'); };
  s.readyState = 2;                                   // 닫히는 중 — getWebSockets 에 남아 있다
  await w.room.webSocketError(s, new Error('net')); await flush();
  ok('닫히는 소켓의 attachment 가 그대로(joined:true)여도 곧바로는 방송하지 않는다', !t.types().includes('user-left'));
  NOW += 21_000; await w.room.alarm(); await flush();
  const ul = t.out.find(o => o.type === 'user-left');
  ok('짝 — 유예가 끝나면 «열린 소켓» 이 없으므로 user-left(dropped) 가 나간다', !!ul && ul.data.reason === 'dropped');
}
{
  const SRC2 = readFileSync(join(CF, 'src', 'video-call-room.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const jo = SRC2.slice(SRC2.indexOf('private async handleJoinObserve('), SRC2.indexOf("type: 'whiteboard-replay'", SRC2.indexOf('private async handleJoinObserve(')));
  ok('잠든 뒤 들어온 참관자도 판서를 받는다 — 참관 입장이 replay 전에 storage 를 다시 읽는다', /await this\.ensureLogsLoaded\(\)/.test(jo));
  ok('알람 «안» 의 퇴장은 빈 방 정리 알람을 따로 잡지 않는다(45초 점검을 5분으로 덮는 경합 방지)',
     /if \(!this\.inAlarm\) void this\.ensureAlarmBy\(this\.emptyAt \+ VideoCallRoom\.NEW_CLASS_GAP_MS/.test(SRC2));
}

/* ═══════════════════════════════════════════════════════════════════════
   ② 재입장자가 칠판 질문·교재 판서·강사 화면을 다시 받는다 — hibernation 뒤에도
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ ② 재입장 — 칠판·교재 판서·강사 탭이 잠들었다 깨어나도 남는다 ]');
{
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher Kaye', 'teacher', 'cT');
  await w.msg(t, 'pdf-share', { url: '/library/book1.pdf', currentPage: 3, kind: 'pdf', name: 'Book 1' });
  await w.msg(t, 'whiteboard-text', { x: 10, y: 20, text: 'Q1. Do you have show and tell?' });
  await w.msg(t, 'pdf-anno-start', { id: 7, page: 3, tool: 'pen', color: '#f00', size: 3, point: { x: 1, y: 1 } });
  await w.msg(t, 'pdf-anno-point', { id: 7, page: 3, point: { x: 2, y: 2 } });
  await w.msg(t, 'pdf-anno-point', { id: 7, page: 3, point: { x: 3, y: 3 } });
  await w.msg(t, 'tab-sync', { tab: 'whiteboard' });
  ok('판서를 모아 쓰는 타이머를 건다(타이머가 있는 동안은 hibernation 이 안 된다)', TIMERS.length > 0);
  await runTimers();
  ok('칠판 로그가 storage 에 쓰였다', [...w.storage.m.keys()].some(k => k.startsWith('wbl:')));
  ok('강사 탭이 storage 에 쓰였다', w.storage.m.get('tabState') === 'whiteboard');

  NOW += 30_000;
  await w.hibernate();                              // 10초 넘게 조용 → 인스턴스가 내려갔다
  const s = await w.join('s9', 'juju', 'student', 'cS9');
  const rep = s.out.find(o => o.type === 'whiteboard-replay');
  ok('잠들었다 깬 뒤 들어온 학생도 칠판에 적힌 질문을 받는다',
     !!rep && rep.data.ops.some(o => o.t === 'whiteboard-text' && /show and tell/.test(o.d.text)));
  const par = s.out.find(o => o.type === 'pdf-anno-replay');
  const stroke = par && par.data.ops.find(o => o.t === 'stroke' && o.d.id === 7);
  ok('교재 판서도 받는다(점까지 그대로 3개)', !!stroke && stroke.d.points.length === 3);
  const iPdf = s.types().indexOf('pdf-sync'), iTab = s.types().indexOf('tab-sync');
  ok('교재(pdf-sync)를 받는다', iPdf >= 0);
  ok('강사가 지금 보는 탭(칠판)을 받는다', iTab >= 0 && s.out[iTab].data.tab === 'whiteboard');
  ok('탭 신호는 교재 신호보다 «뒤» 에 온다(교재가 학생을 교재 탭으로 끌어간 뒤 칠판으로)', iTab > iPdf);

  /* 짝 — 지우면 정말 지워지고, 학생이 보낸 탭은 기억하지 않는다 */
  await w.msg(t, 'whiteboard-clear', {});
  await flush();
  ok('짝 — 칠판 지우기는 storage 의 칠판 로그까지 지운다', ![...w.storage.m.keys()].some(k => k.startsWith('wbl:')));
  await w.msg(s, 'tab-sync', { tab: 'game' });
  ok('짝 — 학생이 보낸 tab-sync 는 기억하지 않는다', w.storage.m.get('tabState') === 'whiteboard');
  await w.hibernate();
  const s2 = await w.join('s10', 'mby', 'student', 'cS10');
  ok('짝 — 지운 뒤 들어온 학생에게는 옛 칠판을 보내지 않는다', !s2.types().includes('whiteboard-replay'));
}
{
  /* 새 수업 — 방이 5분 넘게 비었으면 지난 수업의 칠판·탭을 넘기지 않는다(교재가 없던 방이라도) */
  const w = makeWorld(); await w.boot();
  const t = await w.join('t1', 'Teacher A', 'teacher', 'cT');
  await w.msg(t, 'whiteboard-text', { x: 1, y: 1, text: 'old class' });
  await w.msg(t, 'tab-sync', { tab: 'whiteboard' });
  await runTimers();
  await w.msg(t, 'leave-room', {}); t.readyState = 3;
  ok('방이 비면 «다음 수업» 기준 시각에 정리 알람을 건다', !!w.storage.alarmAt && w.storage.alarmAt <= NOW + 5 * 60_000 + 2_000);
  NOW += 6 * 60_000;
  await w.hibernate(); await w.room.alarm(); await flush();
  ok('아무도 다시 안 오면 지난 수업 칠판 로그를 storage 에서 치운다', ![...w.storage.m.keys()].some(k => k.startsWith('wbl:')));
  ok('지난 수업 강사 탭 기억도 치운다', !w.storage.m.has('tabState'));
  const s = await w.join('s1', 'next', 'student', 'cN');
  ok('다음 수업 첫 입장자는 지난 수업 칠판·탭을 받지 않는다',
     !s.types().includes('whiteboard-replay') && !s.types().includes('tab-sync'));
}
FAKE_TIMERS = false; TIMERS = [];

/* ═══════════════════════════════════════════════════════════════════════
   ①-서버 /api/translate chat 모드 — 일시 실패는 한 번 더, 늦으면 대체 번역
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ ①-서버 채팅 번역 — 언어모델이 한 번 실패해도 번역이 나간다 ]');
const { handleMangoApi } = await import(pathToFileURL(mangoFile).href);
function fakeKV() { const m = new Map(); return { m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); } }; }
async function translateWith(ai, texts, target) {
  const env = { AI: ai, SESSION_STATE: fakeKV() };
  const req = new Request('https://mangoi.ai/api/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, target, mode: 'chat' }),
  });
  const res = await handleMangoApi(req, new URL(req.url), env);
  return { body: await res.json(), env };
}
{
  let calls = 0;
  const ai = { async run(model) {
    if (/llama/.test(model)) { calls++; if (calls === 1) throw new Error('3040: Capacity temporarily exceeded'); return { response: '쇼 앤 텔에서 심사위원이 있나요?' }; }
    return { translated_text: '(m2m)' };
  } };
  const { body } = await translateWith(ai, ['Do you have a judge in the show and tell?'], 'ko');
  ok('언어모델이 한 번 던지면 한 번 더 불러 한국어를 받는다', body.map['Do you have a judge in the show and tell?'] === '쇼 앤 텔에서 심사위원이 있나요?');
  ok('짝 — 재시도는 «한 번» 만(무한 재시도로 화면을 붙잡지 않는다)', calls === 2);
}
{
  const ai = { async run(model) { if (/llama/.test(model)) return { response: '안녕하세요, 반가워요.' }; return { translated_text: '(m2m)' }; } };
  const { env } = await translateWith(ai, ['Hello, nice to meet you.'], 'ko');
  ok('언어모델 번역은 180일 캐시에 남긴다(같은 문장은 다음에 즉시)', [...env.SESSION_STATE.m.keys()].some(k => /^trc4:ko:/.test(k)));
}
{
  let llama = 0, m2m = 0;
  const ai = { run(model) {
    if (/llama/.test(model)) { llama++; return new Promise(() => {}); }   // 영영 답이 없다
    m2m++; return Promise.resolve({ translated_text: '쇼 앤 텔에 심사위원이 있습니까?' });
  } };
  const { body, env: envT } = await translateWith(ai, ['Is there a judge?'], 'ko');
  ok('언어모델이 답을 안 주면 상한에서 끊고 대체 번역(m2m100)으로 한국어를 낸다', /심사위원/.test(body.map['Is there a judge?'] || ''));
  ok('짝 — 시간 초과는 재시도하지 않는다(화면이 기다리는 시간을 넘기지 않게)', llama === 1 && m2m === 1);
  ok('대체 번역(m2m100) 결과는 캐시하지 않는다 — 직역이 180일 굳지 않게(다음엔 언어모델을 다시 시도)',
     ![...envT.SESSION_STATE.m.keys()].some(k => /^trc4:/.test(k)));
}
{
  const ai = { async run() { throw new Error('down'); } };
  const zh = '老师您好';
  const { body } = await translateWith(ai, [zh], 'ko');
  ok('중국어→한국어가 실패하면 원문을 돌려준다(학생에게 「뜻을 불러오지 못했어요」가 나가지 않게)', body.map[zh] === zh);
  const r2 = await (async () => {
    const env = { AI: ai, SESSION_STATE: fakeKV() };
    const req = new Request('https://mangoi.ai/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [zh], target: 'ko', mode: 'learn' }) });
    return (await handleMangoApi(req, new URL(req.url), env)).json();
  })();
  ok('짝 — 학습(learn) 화면은 예전대로 안내문을 쓴다(그쪽은 «뜻» 칸이라 원문이 더 나쁘다)', /불러오지 못했어요/.test(r2.map[zh] || ''));
}

/* ═══════════════════════════════════════════════════════════════════════
   ①-화면 idx-vc-chat.js — 실패 시 초안을 보존하고 명시적 재시도를 안내한다
   ═══════════════════════════════════════════════════════════════════════ */
console.log('\n[ ①-화면 채팅 번역 — 조용히 실패하지 않는다 ]');
const CHAT = readFileSync(join(CF, 'public', 'js', 'idx-vc-chat.js'), 'utf8');
function chatWorld(fetchImpl) {
  class El {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.attrs = {}; this.parentNode = null; this.textContent = ''; this.value = ''; this.placeholder = ''; this.listeners = {}; this.id = ''; }
    appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) byId.set(c.id, c); return c; }
    insertBefore(c) { return this.appendChild(c); }
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; if (c.id) byId.delete(c.id); }
    setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
    addEventListener(t, f) { this.listeners[t] = f; }
    getBoundingClientRect() { return { left: 100, top: 500, bottom: 534 }; }
    focus() {} querySelector() { return null; } querySelectorAll() { return []; }
    get offsetWidth() { return 200; } get offsetHeight() { return 30; }
  }
  const byId = new Map();
  const body = new El('body'); const area = new El('div'); const input = new El('input');
  input.id = 'vc-chat-input'; area.appendChild(input); body.appendChild(area);
  const timers = [];
  const sent = [], notices = [];
  const ls = new Map([['mangoi_lang', 'en'], ['mangoi_vc_chat_tr', 'ko']]);
  const document = {
    readyState: 'complete', body,
    getElementById: id => byId.get(id) || null,
    createElement: t => new El(t),
    addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  };
  const window = {
    vcSendChat() { sent.push(input.value); input.value = ''; },
    vcReceiveChat() {},
    addEventListener() {}, innerWidth: 1280, getLang: () => 'en',
  };
  const ctx = vm.createContext({
    window, document, localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k) },
    fetch: fetchImpl, console, AbortController,
    vcAddChatSystem: text => notices.push(text), clearTimeout() {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  });
  vm.runInContext(CHAT, ctx);
  return { window, input, sent, timers, byId, notices, flush };
}
{
  const cw = chatWorld(async () => ({ ok: true, json: async () => ({ ok: true, map: { 'Good job!': '잘했어요!' } }) }));
  cw.input.value = 'Good job!';
  cw.window.vcSendChat();
  const btn = cw.byId.get('vc-tr-btn');
  ok('번역 중에는 버튼이 «번역 중» 을 말한다(입력칸 안내문은 글이 있으면 안 보인다)', !!btn && /⏳/.test(btn.textContent));
  await cw.flush();
  ok('번역이 오면 한국어로 보낸다', cw.sent[0] === '잘했어요!');
  ok('짝 — 성공하면 경고를 띄우지 않는다', !cw.byId.get('vc-tr-warn'));
  ok('보낸 뒤 버튼이 원래 이름으로 돌아온다', !/⏳/.test(btn.textContent));
}
{
  const cw = chatWorld(async () => ({ ok: true, json: async () => ({ ok: true, map: { 'Do you have a judge?': 'Do you have a judge?' } }) }));
  cw.input.value = 'Do you have a judge?';
  cw.window.vcSendChat(); await cw.flush();
  ok('번역 실패 시 원문을 자동 전송하지 않고 초안을 남긴다', cw.sent.length === 0 && cw.input.value === 'Do you have a judge?');
  ok('강사에게 전송 안 됨과 재시도 방법을 안내한다', cw.notices.some(x => /Nothing was sent/.test(x) && /Retry/.test(x)));
}
{
  const cw = chatWorld(() => new Promise(() => {}));        // 서버가 영영 답이 없다
  cw.input.value = 'Hello class';
  cw.window.vcSendChat(); await cw.flush();
  const waits = cw.timers.map(t => t.ms);
  ok('서버 재시도·대체 번역 시간을 10초까지 허용한다', waits.includes(10000) && !waits.includes(3000));
  ok('기다리는 동안은 아직 보내지 않는다', cw.sent.length === 0);
  /* ⚠️ 그 타이머가 없으면(=값이 바뀌었으면) 하니스가 죽지 않고 FAIL 로 말하게 한다 — 가장 긴 대기를 쓴다 */
  const longest = cw.timers.slice().sort((a, b) => b.ms - a.ms)[0];
  if (longest) longest.fn();
  await cw.flush();
  ok('시간 초과도 자동 전송 없이 초안과 상태 안내를 남긴다', !!longest && cw.sent.length === 0 && cw.input.value === 'Hello class' && cw.notices.some(x => /Nothing was sent/.test(x)));
}
{
  /* 화면 상한(8초)이 서버 상한(5초 + 대체 번역)보다 길어야 한다 — 숫자를 하니스에 적지 않고 소스에서 읽는다 */
  const wait = Number((CHAT.match(/var WAIT_MS\s*=\s*(\d+)/) || [])[1] || 0);
  const MANGO = readFileSync(join(CF, 'src', 'api-translate.ts'), 'utf8');
  const srv = Number((MANGO.match(/CHAT_LLM_TIMEOUT_MS\s*=\s*(\d+)/) || [])[1] || 0);
  ok(`화면이 기다리는 시간(${wait}ms)이 서버 언어모델 상한(${srv}ms)보다 2초 이상 길다`, wait > 0 && srv > 0 && wait - srv >= 2000);
  const IDX = readFileSync(join(CF, 'public', 'index.html'), 'utf8');
  const TCH = readFileSync(join(CF, 'public', 'teacher.html'), 'utf8');
  const v1 = (IDX.match(/idx-vc-chat\.js\?v=(\d+)/) || [])[1], v2 = (TCH.match(/idx-vc-chat\.js\?v=(\d+)/) || [])[1];
  ok(`수업 화면과 강사 미리받기가 같은 버전을 부른다 (index v=${v1} · teacher v=${v2})`, !!v1 && v1 === v2);
}

Date.now = realNow;
globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout;
try { rmSync(outDir, { recursive: true, force: true }); } catch {}
console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { FAILS.forEach(f => console.log(`실패: ${f}`)); process.exit(1); }
