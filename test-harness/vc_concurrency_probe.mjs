/**
 * vc_concurrency_probe.mjs — 화상수업 «동시 입장» 실측 도구 (수동 실행 전용)
 *
 * ⚠️ 파일명이 `_harness.mjs` 로 끝나지 않는다 = run.mjs 가 자동으로 돌리지 않는다.
 *    배포 게이트마다 운영에 부하를 거는 사고를 막기 위해 일부러 이렇게 이름을 붙였다.
 *
 * 운영 데이터 무영향 보장:
 *   - 방 이름을 `loadtest-*` 로만 쓴다 → 실수업 방(class-*, c24-*, mangoi-class)과 절대 겹치지 않음
 *   - /ws/video-call 시그널링만 두드린다. 출결(/api/attendance/*)·포인트·알림 API 는 호출하지 않음
 *     → D1 에 단 한 행도 쓰지 않는다. 남는 것은 KV `active-room:loadtest-*` 뿐이며 600초 뒤 자동 소멸
 *
 * 사용법:
 *   node test-harness/vc_concurrency_probe.mjs burst  [방수] [방당인원] [유지ms]
 *   node test-harness/vc_concurrency_probe.mjs soak   [방수] [방당인원] [유지ms]
 *   node test-harness/vc_concurrency_probe.mjs full     ← 보고서와 동일한 4종 세트
 *
 * 보고서(2026-08-06) 기준선 — 이 값보다 나빠지면 회귀:
 *   50명/25방 : 성공 50/50 · room-joined p95 1,286ms
 *   100명/50방: 성공 100/100 · room-joined p95 1,331ms
 *   50명/1방  : 10명 입장 + 40명 ROOM_FULL  (MAX_USERS=10 의 정상 동작)
 *   2분 유지   : 비정상 종료 0건 · pong RTT p95 73ms
 */
import WebSocket from 'ws';

const HOST = process.env.VC_HOST || 'wss://test.mangoi.co.kr';
const pct = (a, q) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : '-');

/** 한 명의 참가자를 흉내낸다. seat 0 = 강사, 그 외 = 학생 */
function participant({ room, seat, holdMs, pingMs, stats }) {
  return new Promise((resolve) => {
    const r = { tOpen: null, tJoined: null, existing: null, err: null, close: null };
    const t0 = Date.now();
    const ws = new WebSocket(`${HOST}/ws/video-call?roomId=${encodeURIComponent(room)}`);
    let pingTimer = null, sentAt = 0, settled = false;
    const finish = () => {
      if (settled) return; settled = true;
      clearInterval(pingTimer);
      try { ws.close(1000, 'probe done'); } catch {}
      setTimeout(() => resolve(r), 50);
    };
    const killer = setTimeout(() => { r.err ||= 'TIMEOUT'; finish(); }, holdMs + 15000);

    ws.on('open', () => {
      r.tOpen = Date.now() - t0;
      ws.send(JSON.stringify({
        type: 'join-room',
        data: { username: `probe_${room.slice(-8)}_${seat}`, role: seat === 0 ? 'teacher' : 'student', clientId: `probe-${room}-${seat}` },
      }));
      if (pingMs) pingTimer = setInterval(() => { sentAt = Date.now(); try { ws.send(JSON.stringify({ type: 'ping', data: {} })); } catch {} }, pingMs);
    });

    ws.on('message', (buf) => {
      let m; try { m = JSON.parse(buf.toString()); } catch { return; }
      if (m.type === 'room-joined' && r.tJoined === null) r.tJoined = Date.now() - t0;
      if (m.type === 'existing-users') r.existing = (m.data?.users || []).length;
      if (m.type === 'pong' && sentAt) stats.pong.push(Date.now() - sentAt);
      if (m.type === 'room-full') { r.err = 'ROOM_FULL'; clearTimeout(killer); finish(); }
      // 입장 확인이 끝나면 지정 시간만큼 머문 뒤 정상 종료
      if (r.tJoined !== null && r.existing !== null && !settled) {
        setTimeout(() => { clearTimeout(killer); finish(); }, holdMs);
      }
    });

    ws.on('error', (e) => { r.err ||= String(e.message || e); clearTimeout(killer); finish(); });
    ws.on('close', (code) => {
      r.close = code;
      // 1000=정상, 1005=코드 없이 닫힘. 그 외는 «끊김»으로 집계한다.
      if (code !== 1000 && code !== 1005) stats.badClose.push(code);
      if (!settled) { settled = true; clearTimeout(killer); clearInterval(pingTimer); setTimeout(() => resolve(r), 20); }
    });
  });
}

async function scenario(label, { rooms, perRoom, holdMs, pingMs = 0 }) {
  const stamp = Date.now();
  const stats = { pong: [], badClose: [] };
  const total = rooms * perRoom;
  console.log(`\n▶ ${label} — ${total}명 (${rooms}방 × ${perRoom}명) → ${HOST}`);

  const jobs = [];
  const roomOf = [];
  for (let i = 0; i < rooms; i++) {
    const room = `loadtest-${stamp}-${i}`;
    for (let s = 0; s < perRoom; s++) { roomOf.push(room); jobs.push(participant({ room, seat: s, holdMs, pingMs, stats })); }
  }
  const wall = Date.now();
  const res = await Promise.all(jobs);          // 전원 동시 발사 = 정각 몰림 재현
  const wallMs = Date.now() - wall;

  const ok = res.filter((r) => r.tJoined !== null && !r.err);
  const fail = res.filter((r) => r.err);
  const opens = res.filter((r) => r.tOpen !== null).map((r) => r.tOpen);
  const joins = ok.map((r) => r.tJoined);
  const sawPeer = new Set(res.map((r, i) => ((r.existing || 0) > 0 ? roomOf[i] : null)).filter(Boolean));

  console.log(`  벽시계        : ${wallMs}ms`);
  console.log(`  성공 / 실패   : ${ok.length} / ${fail.length}  (전체 ${total})`);
  if (opens.length) console.log(`  WS open    ms : p50=${pct(opens, 0.5)} p95=${pct(opens, 0.95)} max=${Math.max(...opens)}`);
  if (joins.length) console.log(`  room-joined ms: p50=${pct(joins, 0.5)} p95=${pct(joins, 0.95)} max=${Math.max(...joins)}`);
  console.log(`  상대 보인 방  : ${sawPeer.size} / ${rooms}`);
  if (stats.pong.length) console.log(`  pong RTT   ms : n=${stats.pong.length} p50=${pct(stats.pong, 0.5)} p95=${pct(stats.pong, 0.95)} max=${Math.max(...stats.pong)}`);
  if (fail.length) {
    const tally = {};
    for (const f of fail) tally[f.err] = (tally[f.err] || 0) + 1;
    console.log(`  실패 사유     :`, tally);
  }
  console.log(`  비정상 종료   : ${stats.badClose.length}건${stats.badClose.length ? ' ' + JSON.stringify([...new Set(stats.badClose)]) : ' (없음)'}`);
  return { ok: ok.length, fail: fail.length, total };
}

const mode = (process.argv[2] || 'full').toLowerCase();
const n = (i, d) => Number(process.argv[i] || d);

if (mode === 'burst') {
  await scenario('폭주 입장', { rooms: n(3, 25), perRoom: n(4, 2), holdMs: n(5, 8000) });
} else if (mode === 'soak') {
  await scenario('지속 유지', { rooms: n(3, 25), perRoom: n(4, 2), holdMs: n(5, 120000), pingMs: 25000 });
} else {
  await scenario('① 50명 · 25개 1:1 방 동시 입장', { rooms: 25, perRoom: 2, holdMs: 8000 });
  await scenario('② 100명 · 50개 방 동시 입장 (2배 여유)', { rooms: 50, perRoom: 2, holdMs: 6000 });
  await scenario('③ 50명이 «한 방»에 몰릴 때 (공용폴백 재현)', { rooms: 1, perRoom: 50, holdMs: 5000 });
  await scenario('④ 50명 2분 유지 (끊김 측정)', { rooms: 25, perRoom: 2, holdMs: 120000, pingMs: 25000 });
}
