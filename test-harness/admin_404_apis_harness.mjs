// -*- coding: utf-8 -*-
// 🧪 태초 404 API 4종 구현 검증 하니스 (2026-07-14)
//   실행:  node test-harness/admin_404_apis_harness.mjs
//   대상:  ① /api/admin/referrals(+/stats) ② /api/admin/counseling/*(bookings·slot/open·cancel)
//          ③ /api/battle/leaderboard(+history) ④ /api/admin/attendance/qr-gen + /api/attendance/check-in
//   방식:  api-admin.ts 를 esbuild 로 실번들 → 가짜 D1 로 handleAdminApi 를 직접 호출해
//          라우팅·프런트 계약(응답 shape)·토큰 만료 로직을 실제 코드로 검증.
//          + api-mango.ts 위임 가드 / index.ts 게이트에 경로가 등록됐는지 소스 검사.
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) { PASS++; } else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }

// ═══ 0) esbuild 로 api-admin.ts 번들 ═══
const outDir = mkdtempSync(join(tmpdir(), 'mangoi-h-'));
const outFile = join(outDir, 'api-admin.bundle.mjs');
execFileSync(process.execPath, [
  join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'),
  join(CF, 'src', 'api-admin.ts'),
  '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
  `--outfile=${outFile}`,
], { stdio: ['ignore', 'ignore', 'inherit'] });
const { handleAdminApi } = await import(pathToFileURL(outFile).href);
console.log('— api-admin.ts 실번들 로드 완료 —');

// ═══ 가짜 D1 — SQL 패턴 매칭 in-memory ═══
function fakeDB(state) {
  const match = (sql) => {
    sql = sql.replace(/\s+/g, ' ').trim();
    return {
      is: (re) => re.test(sql),
      sql,
    };
  };
  return {
    exec: async (sql) => { state.ddl.push(sql); },
    prepare(sql) {
      const m = match(sql);
      const run = async (...args) => {
        if (m.is(/^INSERT INTO attendance_qr_tokens/i)) {
          const [token, room_id, teacher_uid, created_at, expires_at] = args;
          state.qrTokens.set(token, { token, room_id, teacher_uid, created_at, expires_at, used_count: 0 });
        } else if (m.is(/^INSERT INTO counseling_slots/i)) {
          state.slots.push({ id: state.slots.length + 1, staff_uid: args[0], date: args[1], start_time: args[2], duration_min: args[3], status: 'open', created_at: args[4] });
        } else if (m.is(/^UPDATE counseling_bookings SET status = '취소'/i)) {
          const b = state.bookings.find(x => x.id === args[0]); if (b) b.status = '취소';
        } else if (m.is(/^INSERT INTO attendance /i)) {
          state.attendance.push({ room_id: args[0], user_id: args[1], username: args[2], joined_at: args[3], attended_at: args[4], date: args[5], status: 'attended' });
        } else if (m.is(/^UPDATE attendance SET status = 'attended'/i)) {
          state.attUpdated = true;
        } else if (m.is(/used_count = used_count \+ 1/i)) {
          const t = state.qrTokens.get(args[0]); if (t) t.used_count++;
        }
        return { meta: { last_row_id: 1 } };
      };
      const first = async (...args) => {
        if (m.is(/FROM attendance_qr_tokens WHERE token/i)) return state.qrTokens.get(args[0]) || null;
        if (m.is(/FROM counseling_bookings WHERE id/i)) return state.bookings.find(x => x.id === args[0]) || null;
        if (m.is(/FROM attendance WHERE user_id/i)) return state.attendance.find(x => x.user_id === args[0] && x.room_id === args[1] && x.date === args[2]) || null;
        return null;
      };
      const all = async (...args) => {
        if (m.is(/referred_uid AS referee_uid/i)) return { results: state.referrals };
        if (m.is(/SELECT status, COUNT\(\*\) AS n FROM referrals/i)) {
          const g = {}; for (const r of state.referrals) g[r.status] = (g[r.status] || 0) + 1;
          return { results: Object.entries(g).map(([status, n]) => ({ status, n })) };
        }
        if (m.is(/SELECT referrer_uid, COUNT\(\*\) AS n FROM referrals/i)) {
          const g = {}; for (const r of state.referrals) g[r.referrer_uid] = (g[r.referrer_uid] || 0) + 1;
          return { results: Object.entries(g).map(([referrer_uid, n]) => ({ referrer_uid, n })).sort((a, b) => b.n - a.n) };
        }
        if (m.is(/FROM counseling_bookings ORDER BY/i)) return { results: state.bookings };
        if (m.is(/SUM\(correct_count\) AS wins FROM game_progress/i)) return { results: state.gameLeader };
        if (m.is(/FROM game_progress WHERE user_id/i)) return { results: state.gameRows.filter(r => r.user_id === args[0]) };
        return { results: [] };
      };
      const api = { bind: (...args) => ({ run: () => run(...args), first: () => first(...args), all: () => all(...args) }), run: () => run(), first: () => first(), all: () => all() };
      return api;
    },
  };
}

const state = {
  ddl: [], qrTokens: new Map(), slots: [], attendance: [], attUpdated: false,
  referrals: [
    { id: 2, referrer_uid: 'mom_kim', referee_uid: 'newkid2', code: 'MK-7788', status: 'rewarded', reward_points: 500, created_at: 1752480000000 },
    { id: 1, referrer_uid: 'mom_kim', referee_uid: 'newkid1', code: 'MK-7788', status: 'pending', reward_points: 0, created_at: 1752470000000 },
  ],
  bookings: [
    { id: 11, slot_id: 3, staff_uid: 'teacher_ann', date: '2026-07-15', start_time: '14:00', parent_name: '김학부모', parent_phone: '010-1234-5678', student_uid: 'wondang', topic: '레벨 상담', status: '예약', created_at: 1752470000000 },
  ],
  gameLeader: [{ user_id: 'wondang', wins: 42 }, { user_id: 'student', wins: 17 }],
  gameRows: [
    { user_id: 'wondang', lang: 'en', item: 'apple', correct_count: 5, wrong_count: 1, last_seen: 1752480000000 },
    { user_id: 'wondang', lang: 'en', item: 'grape', correct_count: 1, wrong_count: 3, last_seen: 1752470000000 },
  ],
};
const env = { DB: fakeDB(state) };
const call = async (method, path, body) => {
  const url = new URL('https://test.mangoi.co.kr' + path);
  const request = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const res = await handleAdminApi(request, url, env);
  return res ? { status: res.status, json: await res.json() } : null;
};

// ═══ 1) 🎁 추천 친구 보상 ═══
console.log('\n[1] 🎁 /api/admin/referrals + /stats');
{
  const r = await call('GET', '/api/admin/referrals?limit=50');
  check('referrals: 라우트 매칭(null 아님)', !!r);
  check('referrals: ok=true + list 배열', r?.json?.ok === true && Array.isArray(r.json.list));
  check('referrals: 프런트 계약 필드(referrer_uid/referee_uid/code/status/created_at)', ['referrer_uid', 'referee_uid', 'code', 'status', 'created_at'].every(k => k in (r?.json?.list?.[0] || {})));
  const s = await call('GET', '/api/admin/referrals/stats');
  check('stats: counts 객체(rewarded=1)', s?.json?.ok === true && s.json.counts?.rewarded === 1 && s.json.counts?.pending === 1);
  check('stats: leaderboard [{referrer_uid,n}]', Array.isArray(s?.json?.leaderboard) && s.json.leaderboard[0]?.referrer_uid === 'mom_kim' && s.json.leaderboard[0]?.n === 2);
  check('referrals: 멱등 DDL 수행(referrals 테이블)', state.ddl.some(d => /CREATE TABLE IF NOT EXISTS referrals/.test(d)));
}

// ═══ 2) 📅 1:1 상담 예약 ═══
console.log('\n[2] 📅 /api/admin/counseling/*');
{
  const b = await call('GET', '/api/admin/counseling/bookings');
  check('bookings: ok + list', b?.json?.ok === true && Array.isArray(b.json.list) && b.json.list[0]?.parent_name === '김학부모');
  check('bookings: 프런트 계약 필드(date/start_time/staff_uid/parent_phone/topic/status)', ['date', 'start_time', 'staff_uid', 'parent_phone', 'topic', 'status'].every(k => k in b.json.list[0]));
  const o = await call('POST', '/api/admin/counseling/slot/open', { staff_uid: 'teacher_ann', date: '2026-07-16', start_time: '14:00', duration_min: 30, count: 3 });
  check('slot/open: ok + count=3', o?.json?.ok === true && o.json.count === 3);
  check('slot/open: 연속 슬롯 시간(14:00/14:30/15:00)', state.slots.map(s => s.start_time).join(',') === '14:00,14:30,15:00');
  const bad = await call('POST', '/api/admin/counseling/slot/open', { staff_uid: '', date: 'x', start_time: '' });
  check('slot/open: 필수값 검증 400', bad?.status === 400);
  const c = await call('POST', '/api/admin/counseling/cancel', { booking_id: 11 });
  check('cancel: ok + status=취소 반영', c?.json?.ok === true && state.bookings[0].status === '취소');
  const nf = await call('POST', '/api/admin/counseling/cancel', { booking_id: 999 });
  check('cancel: 없는 예약 404', nf?.status === 404);
}

// ═══ 3) 🎮 영어 배틀 ═══
console.log('\n[3] 🎮 /api/battle/leaderboard + history');
{
  const lb = await call('GET', '/api/battle/leaderboard');
  check('leaderboard: ok + list[{user_id,wins}]', lb?.json?.ok === true && lb.json.list[0]?.user_id === 'wondang' && lb.json.list[0]?.wins === 42);
  const h = await call('GET', '/api/battle/history?user_id=wondang&limit=20');
  check('history: ok + 프런트 계약 필드', h?.json?.ok === true && ['game_type', 'challenger_uid', 'opponent_uid', 'challenger_score', 'opponent_score'].every(k => k in h.json.list[0]));
  check('history: 승패 판정(5:1→학생 승, 1:3→AI 승)', h.json.list[0].winner_uid === 'wondang' && h.json.list[1].winner_uid === 'AI');
  const h0 = await call('GET', '/api/battle/history');
  check('history: user_id 없으면 빈 목록 ok', h0?.json?.ok === true && h0.json.list.length === 0);
}

// ═══ 4) 📷 QR 출결 ═══
console.log('\n[4] 📷 /api/admin/attendance/qr-gen + /api/attendance/check-in');
{
  const g = await call('POST', '/api/admin/attendance/qr-gen', { room_id: 'room-101', teacher_uid: 'teacher_ann' });
  check('qr-gen: ok + 계약 {qr_url,token,expires_at}', g?.json?.ok === true && typeof g.json.qr_url === 'string' && typeof g.json.token === 'string' && typeof g.json.expires_at === 'number');
  check('qr-gen: token=32자리 hex', /^[a-f0-9]{32}$/.test(g.json.token));
  check('qr-gen: qr_url 상대경로 /qr-checkin.html?token=', g.json.qr_url === `/qr-checkin.html?token=${g.json.token}`);
  const remainMin = (g.json.expires_at - Date.now()) / 60000;
  check('qr-gen: 유효 5분(±10초)', remainMin > 4.8 && remainMin <= 5.01);
  const badRoom = await call('POST', '/api/admin/attendance/qr-gen', { room_id: '방 이름에 공백' });
  check('qr-gen: room_id 형식 검증 400', badRoom?.status === 400);

  const ci = await call('POST', '/api/attendance/check-in', { token: g.json.token, user_id: 'wondang', username: '원당' });
  check('check-in: ok + status=attended + room 매핑', ci?.json?.ok === true && ci.json.status === 'attended' && ci.json.room_id === 'room-101');
  check('check-in: attendance 행 생성', state.attendance.length === 1 && state.attendance[0].user_id === 'wondang');
  check('check-in: 토큰 used_count 증가', state.qrTokens.get(g.json.token).used_count === 1);
  const ci2 = await call('POST', '/api/attendance/check-in', { token: g.json.token, user_id: 'wondang' });
  check('check-in: 중복 체크인 already=true(UPDATE 경로)', ci2?.json?.ok === true && ci2.json.already === true && state.attUpdated === true);

  state.qrTokens.get(g.json.token).expires_at = Date.now() - 1000; // 강제 만료
  const exp = await call('POST', '/api/attendance/check-in', { token: g.json.token, user_id: 'wondang' });
  check('check-in: 만료 토큰 410 token_expired', exp?.status === 410 && exp.json.error === 'token_expired');
  const nf = await call('POST', '/api/attendance/check-in', { token: 'a'.repeat(32), user_id: 'wondang' });
  check('check-in: 없는 토큰 404', nf?.status === 404);
  const badTok = await call('POST', '/api/attendance/check-in', { token: 'short', user_id: 'wondang' });
  check('check-in: 형식 불량 토큰 400', badTok?.status === 400);
}

// ═══ 5) 배선 검사 — api-mango 위임 가드 + index.ts 게이트 + 랜딩 페이지 ═══
console.log('\n[5] 🔌 배선(가드·게이트·랜딩) 소스 검사');
{
  const mango = readFileSync(join(CF, 'src', 'api-mango.ts'), 'utf8');
  const guardStart = mango.indexOf("path.startsWith('/api/admin/nps/')"); // 위임 가드 블록 시작
  const guardEnd = mango.indexOf('handleAdminApi', guardStart);
  const guard = mango.slice(guardStart, guardEnd);
  check('가드: /api/admin/referrals', guard.includes("path.startsWith('/api/admin/referrals')"));
  check('가드: /api/admin/counseling/', guard.includes("path.startsWith('/api/admin/counseling/')"));
  check('가드: /api/admin/attendance/qr-gen', guard.includes("'/api/admin/attendance/qr-gen'"));
  check('가드: /api/attendance/check-in', guard.includes("'/api/attendance/check-in'"));
  check('가드: /api/battle/leaderboard + history', guard.includes("'/api/battle/leaderboard'") && guard.includes("'/api/battle/history'"));

  const idx = readFileSync(join(CF, 'src', 'index.ts'), 'utf8');
  for (const p of ['/api/admin/referrals', '/api/admin/referrals/stats', '/api/admin/counseling/bookings', '/api/admin/counseling/slot/open', '/api/admin/counseling/cancel', '/api/battle/leaderboard', '/api/battle/history', '/api/admin/attendance/qr-gen', '/api/attendance/check-in']) {
    check(`게이트(index.ts): ${p}`, idx.includes(`'${p}'`));
  }

  const landing = readFileSync(join(CF, 'public', 'qr-checkin.html'), 'utf8');
  check('랜딩: /api/attendance/check-in 호출', landing.includes("/api/attendance/check-in"));
  check('랜딩: uid 자동감지 관례 키(mangoi_uid)', landing.includes("mangoi_uid"));
  check('랜딩: 만료 안내(token_expired)', landing.includes('token_expired'));
}

console.log(`\n════════ 결과: ${PASS} PASS / ${FAIL} FAIL ════════`);
if (FAIL) { console.log('실패 목록:'); FAILS.forEach(f => console.log('  ❌ ' + f)); process.exit(1); }
