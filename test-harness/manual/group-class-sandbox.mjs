// 👥 1:N 수업 샌드박스 E2E — 진짜 Worker(wrangler dev --local) 의 화상방(DO)에
//    «강사 1명 + 학생 N명» 을 동시에 넣고 수백 번 되풀이한다. (2026-10-07)
//
//   ⚠️ 자동으로 돌지 않는다(manual/) — 사람이 로컬 샌드박스를 띄우고 부른다:
//     cd cloudflare-deploy && CI=1 npx wrangler dev --local --port 8787
//     VC_HOST=ws://127.0.0.1:8787 ITER=300 node test-harness/manual/group-class-sandbox.mjs
//   ⛔ 운영 주소(mangoi.ai)로 돌리지 말 것 — 방 이름이 sbx- 라도 실서비스 DO 를 깨운다.
//
//   한 회차에 보는 것 (전부 «짝» 으로):
//    ① 동시 입장 — 모두 room-joined 를 받는다 · 아무도 room-full 을 안 받는다
//    ② 명단 — 마지막에 각자가 아는 «다른 사람 수» == 방 인원-1 (늦게 온 사람도, 먼저 온 사람도)
//    ③ 강사 → 전체 채팅이 학생 «모두» 에게 간다 · 학생 → 강사 1:1 채팅은 «다른 학생에겐 안 간다»
//    ④ 강사 → 학생마다 offer 중계 — 받는 사람이 정확히 그 학생이고 fromUserId 가 강사
//    ⑤ 정원 — 방이 10명(강사+학생 9)이면 11번째는 room-full · 9명 이하면 11번째가 아니라 «들어온다»
//    ⑥ 퇴장 — 한 학생이 나가면 남은 사람 모두 user-left 를 받는다 · 나간 사람은 다시 안 센다
//    ⑦ 재접속 — 같은 clientId 로 다시 들어오면 명단이 «한 명 늘지 않는다»(유령 타일 0)
const HOST = process.env.VC_HOST || 'ws://127.0.0.1:8787';
const ITER = Number(process.env.ITER || 200);
const PAR = Number(process.env.PAR || 4);          // 동시에 도는 방 수
if (/mangoi\.ai|mangoi\.co\.kr|workers\.dev/.test(HOST)) { console.log('⛔ 운영 주소 금지: ' + HOST); process.exit(2); }

let PASS = 0, FAIL = 0; const fails = [];
const ok = (c, m) => { if (c) PASS++; else { FAIL++; if (fails.length < 40) fails.push(m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(15); } return fn(); };

function client(room, name, role, clientId) {
  return new Promise((resolve) => {
    const c = { name, role, id: null, joined: false, full: false, peers: new Set(), chats: [], offers: [], lefts: [], ws: null };
    const ws = new WebSocket(`${HOST}/ws/video-call?roomId=${encodeURIComponent(room)}`);
    c.ws = ws;
    const timer = setTimeout(() => resolve(c), 6000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join-room', data: { username: name, role, clientId } }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const d = m.data || {};
      if (m.type === 'room-joined') { c.joined = true; c.id = d.userId; clearTimeout(timer); resolve(c); }
      else if (m.type === 'room-full') { c.full = true; clearTimeout(timer); resolve(c); }
      else if (m.type === 'existing-users') for (const u of (d.users || [])) c.peers.add(u.userId);
      else if (m.type === 'user-joined') c.peers.add(d.userId);
      else if (m.type === 'user-left') { c.peers.delete(d.userId); c.lefts.push(d.userId); }
      else if (m.type === 'chat-message' && !d.isSystem) c.chats.push(d);
      else if (m.type === 'offer') c.offers.push(d);
      else if (m.type === 'ping') { try { ws.send(JSON.stringify({ type: 'pong' })); } catch {} }
    };
    ws.onerror = () => {};
    ws.onclose = () => { clearTimeout(timer); resolve(c); };
  });
}
const send = (c, type, data) => { try { c.ws.send(JSON.stringify({ type, data })); } catch {} };
const close = (c) => { try { c.ws.close(1000); } catch {} };

async function oneRoom(i) {
  const room = `sbx-${Date.now().toString(36)}-${i}`;
  const n = 2 + (i % 8);                 // 학생 2~9명 (9 = 정원 한계)
  const all = await Promise.all([client(room, 'T', 'teacher', `t-${room}`)]
    .concat(Array.from({ length: n }, (_, k) => client(room, 'S' + k, 'student', `s${k}-${room}`))));
  const [T, ...Ss] = all;
  const tag = `[#${i} 학생${n}]`;
  ok(all.every(c => c.joined), `${tag} ① 동시 입장 — 전원 room-joined (${all.filter(c => c.joined).length}/${all.length})`);
  ok(all.every(c => !c.full), `${tag} ① 아무도 room-full 이 아니다`);
  await waitFor(() => all.every(c => c.peers.size === n));
  ok(all.every(c => c.peers.size === n), `${tag} ② 모두가 다른 ${n}명을 안다 (${all.map(c => c.peers.size).join(',')})`);

  // ③ 채팅
  send(T, 'chat-message', { message: 'hello-' + i });
  await waitFor(() => Ss.every(s => s.chats.some(x => x.message === 'hello-' + i)));
  ok(Ss.every(s => s.chats.some(x => x.message === 'hello-' + i)), `${tag} ③ 강사 전체 채팅이 학생 모두에게`);
  send(Ss[0], 'chat-message', { message: 'dm-' + i, toUserId: T.id });
  await waitFor(() => T.chats.some(x => x.message === 'dm-' + i));
  await sleep(80);
  ok(T.chats.some(x => x.message === 'dm-' + i), `${tag} ③ 학생→강사 1:1 이 강사에게`);
  ok(Ss.slice(1).every(s => !s.chats.some(x => x.message === 'dm-' + i)), `${tag} ③ (짝) 1:1 은 다른 학생에게 안 간다`);

  // ④ offer 중계 — 학생마다 하나씩
  for (const s of Ss) send(T, 'offer', { targetUserId: s.id, sdp: { type: 'offer', sdp: 'v=0 fake ' + s.name } });
  await waitFor(() => Ss.every(s => s.offers.length >= 1));
  ok(Ss.every(s => s.offers.length === 1 && s.offers[0].fromUserId === T.id && String(s.offers[0].sdp?.sdp || '').endsWith(s.name)),
    `${tag} ④ offer 가 학생마다 정확히 그 학생에게 (강사가 보냄)`);
  ok(T.offers.length === 0, `${tag} ④ (짝) 강사 자신에게는 offer 가 안 돌아온다`);

  // ⑤ 정원
  const extra = await client(room, 'X', 'student', `x-${room}`);
  if (n + 1 >= 10) ok(extra.full && !extra.joined, `${tag} ⑤ 10명 방에 11번째는 room-full`);
  else ok(extra.joined && !extra.full, `${tag} ⑤ (짝) 자리가 남으면 들어온다`);
  const present = extra.joined ? all.concat([extra]) : all;
  const cnt = present.length;
  if (extra.joined) await waitFor(() => all.every(c => c.peers.size === cnt - 1));

  // ⑥ 퇴장
  const leaver = Ss[Ss.length - 1];
  send(leaver, 'leave-room', {});
  const stay = present.filter(c => c !== leaver);
  await waitFor(() => stay.every(c => c.lefts.includes(leaver.id)));
  ok(stay.every(c => c.lefts.includes(leaver.id)), `${tag} ⑥ 나간 학생을 남은 사람 모두가 user-left 로 안다`);
  ok(stay.every(c => !c.peers.has(leaver.id)), `${tag} ⑥ 나간 학생은 명단에서 빠진다`);
  close(leaver);

  // ⑦ 같은 clientId 재접속 — 명단이 한 명 늘지 않는다
  const before = T.peers.size;
  const again = await client(room, 'S0', 'student', `s0-${room}`);
  await sleep(250);
  ok(again.joined, `${tag} ⑦ 재접속이 들어온다`);
  ok(T.peers.size === before, `${tag} ⑦ 재접속해도 강사 명단 인원이 그대로 (${before} → ${T.peers.size})`);

  for (const c of present.concat([again])) close(c);
}

const t0 = Date.now();
let next = 0;
await Promise.all(Array.from({ length: PAR }, async () => { while (next < ITER) { const i = next++; try { await oneRoom(i); } catch (e) { ok(false, `#${i} 예외 ${e?.message}`); } } }));
console.log(`\n${ITER}개 방 · 동시 ${PAR}개 · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const f of fails) console.log('  ❌ ' + f);
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
