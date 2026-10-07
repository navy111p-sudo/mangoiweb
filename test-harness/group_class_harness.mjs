// 👥 1:N(합반) 수업 회귀 하니스 — 2026-10-07
//
// 정본 세 파일(group-room.ts · enroll-ops.ts · enroll-activate.ts)을 esbuild 로 번들해 «진짜 SQLite» 위에서
// 실제로 돌린다. 문자열 검사가 아니라 «무슨 답이 나오는가» 로 묻고, 모든 «된다» 옆에 «안 된다» 를 짝으로 둔다
// (짝이 없으면 «전부 합반으로 묶기»·«전부 막기» 같은 엉터리 수리도 통과한다).
//
//  ① 방 — 같은 강사·같은 시각·같은 길이면 한 방(대표 = 가장 작은 예약 id) · 1:1 은 방 번호가 그대로
//  ② 강사 시간 잠금 마이그레이션 — 1:1 겹침은 DB 가 여전히 막는다 · 합반 좌석만 같은 자리에 여럿
//  ③ 수강신청 확정 — 1:3 세 명은 같은 강사 반으로 합류 · 정원이 차면 다음 반 · 1:1 은 그 자리에 못 끼어든다
//  ④ 결석 판정 — 합반에서 한 학생만 들어와도 나머지가 «입장» 으로 보이지 않는다
//  ⑤ 정원 상수가 화상방 MAX_USERS 와 맞물린다
//  ⑥ 배선 — 방 번호를 만드는 곳들이 정본을 «실제로» 부른다
process.env.TZ = 'Asia/Seoul';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const SRC = join(CF, 'src');
const rd = (f) => readFileSync(join(SRC, f), 'utf8');
let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };
const done = () => { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(FAIL ? 1 : 0); };

let esb = null;
try { esb = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }

/* ═══ ⑤·⑥ 정적 대조 (esbuild 없어도 돈다) ═══════════════════════════ */
console.log('⑤ 정원 상수');
const maxUsers = Number((/^const MAX_USERS = (\d+);/m.exec(rd('video-call-room.ts')) || [])[1]);
const gMax = Number((/export const GROUP_HARD_MAX_STUDENTS = (\d+);/.exec(rd('enroll-ops.ts')) || [])[1]);
ok(maxUsers > 1 && gMax === maxUsers - 1, `합반 학생 정원(${gMax}) = 화상방 한도(${maxUsers}) − 강사 1명`);

console.log('\n⑥ 배선 — 방 번호를 만드는 곳이 정본을 부른다');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
for (const [f, re] of [
  ['api-mango.ts', /loadGroupLeads\(/], ['api-mango.ts', /loadGroupMembers\(/],
  ['api-teacher.ts', /loadGroupLeadsForIds\(/], ['absent-sweep.ts', /loadGroupLeads\(/],
  ['absent-sweep.ts', /studentJoinedIn\(/], ['api-admin.ts', /loadGroupLeads\(/],
  ['enroll-activate.ts', /groupSeatFlag\(e\)/], ['enroll-ops.ts', /ensureTeacherSlotIndexes\(env\)/],
]) ok(re.test(strip(rd(f))), `${f} 가 ${re.source.replace(/\\/g, '')} 를 실제 코드에서 부른다`);
ok(!/CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_teacher_slot ON/.test(strip(rd('enroll-ops.ts'))),
  '옛 잠금(강사·날짜·시각 하나)을 다시 만드는 줄이 없다 — 있으면 지운 잠금이 매번 되살아나 1:N 이 다시 막힌다');

if (!esb) { console.log('\n  ⏭ esbuild 없음 — 실행 검증(①~④) 건너뜀'); done(); }

/* ═══ 번들 ═══ */
const out = join(mkdtempSync(join(tmpdir(), 'grp-')), 'g.mjs');
let M = null;
try {
  esb.buildSync({
    stdin: { contents: `export * from './group-room'; export * from './enroll-ops'; export * from './enroll-activate';`, resolveDir: SRC, loader: 'ts' },
    bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
  });
  M = await import('file://' + out);
} catch (e) { console.log('  번들 실패: ' + (e && e.message)); }
ok(!!(M && M.pickGroupLeads && M.ensureTeacherSlotIndexes && M.handleEnrollActivateApi), '전제: 정본 세 파일을 번들해 불러왔다');
if (!M) done();

/* ═══ D1 모양의 진짜 SQLite ═══ */
function mkEnv(opts = {}) {
  const db = new DatabaseSync(':memory:');
  const failOn = opts.failOn || null;     // 이 정규식에 맞는 SQL 은 던진다(장애 주입)
  const chk = (q) => { if (failOn && failOn.test(q)) throw new Error('injected: ' + q.slice(0, 40)); };
  const mk = (q, args = []) => ({
    bind: (...a) => mk(q, a),
    all: async () => { chk(q); return { results: db.prepare(q).all(...args) }; },
    first: async () => { chk(q); return db.prepare(q).get(...args) ?? null; },
    run: async () => { chk(q); const r = db.prepare(q).run(...args); return { meta: { changes: Number(r.changes) } }; },
    _q: q, _a: args,
  });
  const env = {
    DB: {
      prepare: (q) => mk(q),
      exec: async (q) => { chk(q); db.exec(q); return {}; },
      batch: async (sts) => { const out = []; for (const s of sts) out.push(await s.run()); return out; },
    },
  };
  return { db, env };
}
const SCHED = `CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, notes TEXT)`;
const OLD_IDX = `CREATE UNIQUE INDEX uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL`;

/* ═══ ① 방 ═══ */
console.log('\n① 한 수업 = 한 방');
const D = '2026-10-07', YMD = '20261007';
const R = (id, uid, t, st, dm, extra = {}) => ({ id, user_id: uid, teacher_id: t, start_time: st, duration_min: dm, scheduled_date: D, status: 'active', ...extra });
let L = M.pickGroupLeads([R(7, 'a', '9', '19:00', 20), R(3, 'b', '9', '19:00', 20), R(5, 'c', '9', '19:00', 20)], D);
ok([7, 3, 5].every(i => M.groupRoomId(L, i, YMD) === 'class-3-20261007'), '같은 강사·시각·길이 셋 → 셋 다 class-3 (가장 작은 id)');
L = M.pickGroupLeads([R(7, 'a', '9', '19:00', 20), R(8, 'b', '9', '19:00', 40)], D);
ok(M.groupRoomId(L, 7, YMD) === 'class-7-20261007' && M.groupRoomId(L, 8, YMD) === 'class-8-20261007', '(짝) 길이가 다르면 다른 수업 — 방도 따로');
L = M.pickGroupLeads([R(7, 'a', '9', '19:00', 20), R(8, 'b', '10', '19:00', 20)], D);
ok(M.groupRoomId(L, 8, YMD) === 'class-8-20261007', '(짝) 강사가 다르면 따로');
L = M.pickGroupLeads([R(7, 'a', '9', '19:00', 20)], D);
ok(L.size === 0 && M.groupRoomId(L, 7, YMD) === 'class-7-20261007', '1:1 은 방 번호가 한 글자도 안 바뀐다');
L = M.pickGroupLeads([R(2, 'a', '9', '19:00', 20, { status: 'cancelled' }), R(7, 'b', '9', '19:00', 20), R(9, 'c', '9', '19:00', 20)], D);
ok(M.groupRoomId(L, 9, YMD) === 'class-7-20261007', '취소된 행은 대표가 되지 않는다');
L = M.pickGroupLeads([R(2, 'lms', '9', '19:00', 20), R(7, 'b', '9', '19:00', 20)], D);
ok(M.groupRoomId(L, 7, YMD) === 'class-7-20261007', '자리표시(lms)는 학생이 아니다 — 묶지 않는다');
L = M.pickGroupLeads([R(4, 'a', '9', '9:00', 20), R(6, 'b', '9', '09:00:00', 20)], D);
ok(M.groupRoomId(L, 6, YMD) === 'class-4-20261007', '시각 표기가 달라도(9:00 · 09:00:00) 같은 수업');
L = M.pickGroupLeads([{ ...R(4, 'a', '9', '19:00', 20), scheduled_date: null, day_of_week: '수' }, R(6, 'b', '9', '19:00', 20)], D);
ok(M.groupRoomId(L, 6, YMD) === 'class-4-20261007', '반복(요일) 행과 날짜 행도 같은 날 같은 자리면 한 수업');
L = M.pickGroupLeads([{ ...R(4, 'a', '9', '19:00', 20), scheduled_date: null, day_of_week: '목' }, R(6, 'b', '9', '19:00', 20)], D);
ok(M.groupRoomId(L, 6, YMD) === 'class-6-20261007', '(짝) 요일이 다르면 그날은 혼자');

{ const { db, env } = mkEnv();
  db.exec(SCHED);
  for (const [u, t] of [['s1', '9'], ['s2', '9'], ['s3', '9'], ['o1', '10']])
    db.prepare(`INSERT INTO class_schedules (user_id, schedule_kind, scheduled_date, start_time, duration_min, teacher_id) VALUES (?, 'dated', ?, '19:00', 20, ?)`).run(u, D, t);
  const leads = await M.loadGroupLeads(env, [{ id: 3, teacher_id: '9' }], D);
  ok(M.leadIdOf(leads, 3) === 1 && M.leadIdOf(leads, 2) === 1, 'DB 를 다시 읽어 대표를 정한다 — 학생이 자기 행만 들고 와도 같은 방');
  const mem = await M.loadGroupMembers(env, 'class-1-20261007');
  ok(Array.isArray(mem) && mem.map(r => r.user_id).join(',') === 's1,s2,s3', '방 번호 → 그 수업의 학생 셋(역방향)');
  const mem1 = await M.loadGroupMembers(env, 'class-4-20261007');
  ok(Array.isArray(mem1) && mem1.length === 1 && mem1[0].user_id === 'o1', '(짝) 1:1 방은 그 학생 하나');
  ok(Array.isArray(await M.loadGroupMembers(env, 'class-99-20261007')) && (await M.loadGroupMembers(env, 'class-99-20261007')).length === 0, '없는 예약은 빈 목록');
}
{ const { env } = mkEnv({ failOn: /class_schedules/ });
  const leads = await M.loadGroupLeads(env, [{ id: 3, teacher_id: '9' }], D);
  ok(leads.size === 0 && M.groupRoomId(leads, 3, YMD) === 'class-3-20261007', 'DB 가 실패하면 막지 않고 예전 방(fail-open)');
  ok((await M.loadGroupMembers(env, 'class-3-20261007')) === null, '(짝) 역방향은 실패를 «모름(null)» 으로 말한다 — «없음([])» 과 갈린다');
}

/* ═══ ② 잠금 마이그레이션 ═══ */
console.log('\n② 강사 시간 잠금');
const ins = (db, u, t, st, gs = null, d = D) => {
  try { db.prepare(`INSERT INTO class_schedules (user_id, schedule_kind, scheduled_date, start_time, duration_min, teacher_id, group_seat) VALUES (?, 'dated', ?, ?, 20, ?, ?)`).run(u, d, st, t, gs); return true; }
  catch { return false; }
};
{ const { db, env } = mkEnv();
  db.exec(SCHED); db.exec(OLD_IDX);
  await M.ensureTeacherSlotIndexes(env);
  const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='class_schedules'`).all().map(r => r.name);
  ok(!idx.includes('uq_sched_teacher_slot') && idx.includes('uq_sched_teacher_slot_1to1') && idx.includes('uq_sched_group_seat'), '옛 잠금이 빠지고 새 잠금 둘이 생겼다 (' + idx.join(',') + ')');
  ok(ins(db, 'a', '9', '19:00') && !ins(db, 'b', '9', '19:00'), '1:1 끼리는 예전처럼 DB 가 막는다 (같은 강사·날짜·시각)');
  ok(ins(db, 'g1', '9', '20:00', 1) && ins(db, 'g2', '9', '20:00', 1) && ins(db, 'g3', '9', '20:00', 1), '합반 좌석(group_seat=1)은 같은 자리에 여럿');
  ok(!ins(db, 'g1', '9', '20:00', 1), '(짝) 합반이어도 같은 학생 두 벌은 막는다');
  ok(ins(db, 'b', '9', '21:00'), '(짝) 다른 시각 1:1 은 그대로 들어간다');
  db.exec(`UPDATE class_schedules SET status='cancelled' WHERE user_id='a'`);
  ok(ins(db, 'b', '9', '19:00'), '취소된 자리는 다시 쓸 수 있다(잠금은 active 만)');
}
{ const { db, env } = mkEnv({ failOn: /CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_group_seat/ });
  db.exec(SCHED); db.exec(OLD_IDX);
  await M.ensureTeacherSlotIndexes(env);
  const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='class_schedules'`).all().map(r => r.name);
  ok(idx.includes('uq_sched_teacher_slot'), '새 잠금을 못 만들면 옛 잠금을 지우지 않는다 (1:1 이 잠금 없이 남지 않게)');
}

/* ═══ ③ 수강신청 확정 ═══ */
console.log('\n③ 수강신청 확정');
async function enrollWorld() {
  const w = mkEnv();
  const { db } = w;
  db.exec(SCHED); db.exec(OLD_IDX);
  db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)`);
  db.exec(`INSERT INTO teachers VALUES (901,'T_ONE',1),(902,'T_TWO',1)`);
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, parent_phone TEXT, student_phone TEXT, phone TEXT)`);
  db.exec(`CREATE TABLE enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, days_of_week TEXT, time TEXT, class_size TEXT, duration_min INTEGER, assign_priority TEXT, teacher_name TEXT, end_date TEXT, duration_months TEXT, type TEXT)`);
  return w;
}
async function enroll(w, id, uid, size, days = '월,수', time = '19:00') {
  const now = Date.now();
  w.db.prepare(`INSERT OR IGNORE INTO students_erp (user_id, korean_name) VALUES (?, ?)`).run(uid, '학생_' + uid);
  w.db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, package, started_at, status, created_at, updated_at, days_of_week, time, class_size, duration_min, duration_months, monthly_fee_krw) VALUES (?, ?, ?, '정규수업', ?, 'pending', ?, ?, ?, ?, ?, 20, '1', 100000)`)
    .run(id, uid, '학생_' + uid, now, now, now, days, time, size);
  const url = new URL(`http://x/api/admin/enrollments/${id}/activate`);
  const req = new Request(url, { method: 'POST', body: JSON.stringify({ steps: { assign_teacher: true, create_schedules: true } }), headers: { 'content-type': 'application/json' } });
  const res = await M.handleEnrollActivateApi(req, url, w.env, 'harness');
  return res ? await res.json() : null;
}
const rowsOf = (w, uid) => w.db.prepare(`SELECT * FROM class_schedules WHERE user_id = ? AND status='active' ORDER BY scheduled_date`).all(uid);
{ const w = await enrollWorld();
  const r1 = await enroll(w, 1, 'g1', '1:3'), r2 = await enroll(w, 2, 'g2', '1:3'), r3 = await enroll(w, 3, 'g3', '1:3');
  const a = rowsOf(w, 'g1'), b = rowsOf(w, 'g2'), c = rowsOf(w, 'g3');
  ok(a.length > 0 && a.length === b.length && b.length === c.length, `1:3 세 명 모두 수업이 생겼다 (${a.length}/${b.length}/${c.length}회) — 옛 잠금이면 2·3번째는 0회`);
  ok(a.length > 0 && [a, b, c].every(x => x.length && x.every(r => r.teacher_id === a[0].teacher_id)), '세 명 다 같은 강사 반으로 합류');
  ok(a.length > 0 && [a, b, c].every(x => x.length && x.every(r => Number(r.group_seat) === 1)), '합반 행은 group_seat=1 로 적힌다');
  ok(r2 && (r2.plan_warnings || []).some(s => /합반/.test(s)), '두 번째 학생 확정에 «합반 — 합류» 안내가 붙는다');
  const room = (uid) => rowsOf(w, uid)[0] || { id: -1, scheduled_date: '2000-01-01' };
  const day = room('g1').scheduled_date;
  const leads = await M.loadGroupLeads(w.env, [room('g3')], day);
  const ymd = day.replace(/-/g, '');
  ok(['g1', 'g2', 'g3'].every(u => M.groupRoomId(leads, room(u).id, ymd) === M.groupRoomId(leads, room('g1').id, ymd)), '첫 수업 날 세 학생의 방 번호가 같다');
  const r4 = await enroll(w, 4, 'g4', '1:3');
  const d = rowsOf(w, 'g4');
  ok(d.length > 0 && a.length > 0 && d[0].teacher_id !== a[0].teacher_id, '(짝) 정원(3명)이 찬 반에는 안 들어가고 다른 강사 반이 열린다');
  const r5 = await enroll(w, 5, 'o1', '1:1');
  ok(rowsOf(w, 'o1').length === 0, '1:1 학생은 합반 자리에 끼어들지 못한다 (두 강사 다 그 시각 수업 중)');
  ok(rowsOf(w, 'g1').length === a.length, '(짝) 그 과정에서 기존 합반 수업은 그대로');
}
{ const w = await enrollWorld();
  await enroll(w, 1, 'o1', '1:1');
  await enroll(w, 2, 'o2', '1:1');
  const t1 = rowsOf(w, 'o1')[0]?.teacher_id, t2 = rowsOf(w, 'o2')[0]?.teacher_id;
  ok(t1 && t2 && t1 !== t2, '1:1 두 명은 예전처럼 서로 다른 강사로 (같은 강사 반에 묶이지 않는다)');
  await enroll(w, 3, 'g1', '1:3');
  ok(rowsOf(w, 'g1').length === 0, '1:N 학생도 남의 1:1 수업에 합류하지 않는다 (빈 강사가 없으면 안 만든다)');
}
{ const w = await enrollWorld();
  await enroll(w, 1, 'p1', '1:2'); await enroll(w, 2, 'p2', '1:2');
  await enroll(w, 3, 'p3', '1:3');
  const t = (rowsOf(w, 'p1')[0] || {}).teacher_id;
  ok(rowsOf(w, 'p3').length > 0 && rowsOf(w, 'p3')[0].teacher_id !== t, '1:2 로 꽉 찬 반에 1:3 학생이 끼어 3명이 되지 않는다');
}
{ const w = await enrollWorld();
  for (let i = 1; i <= 10; i++) await enroll(w, i, 'n' + i, '1:9');
  const t = (rowsOf(w, 'n1')[0] || {}).teacher_id;
  const same = Array.from({ length: 10 }, (_, k) => rowsOf(w, 'n' + (k + 1))[0]?.teacher_id).filter(x => x === t).length;
  ok(same === 9, `1:9 열 명 중 아홉 명만 한 반 (화상방 한도) — 실제 ${same}명`);
}

{ const w = await enrollWorld();
  await enroll(w, 1, 'o1', '1:1');
  await enroll(w, 2, 'g1', '1:3');
  const o = rowsOf(w, 'o1'), g = rowsOf(w, 'g1');
  ok(o.length > 0 && g.length === o.length && g[0].teacher_id !== o[0].teacher_id,
    `1:1 수업이 있는 강사는 «합반 후보» 가 아니다 — 1:N 학생은 비어 있는 다른 강사로 (${g.length}회)`);
}

/* ═══ ③-퍼즈 — 무작위 수강신청 섞기를 수백 번. 불변식 넷을 매번 본다 ═══ */
console.log('\n③-퍼즈 무작위 수강신청');
{
  let seed = 20261007; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ROUNDS = Number(process.env.GROUP_FUZZ || 200);
  const bad = { mixed: 0, over: 0, split: 0, room: 0 };
  let made = 0, total = 0;
  for (let k = 0; k < ROUNDS; k++) {
    const w = await enrollWorld();
    const n = 3 + Math.floor(rnd() * 10);
    for (let i = 1; i <= n; i++) {
      total++;
      await enroll(w, i, 'z' + i, pick(['1:1', '1:1', '1:2', '1:3', '1:4', '1:9']), pick(['월,수', '월', '화,목']), pick(['19:00', '19:00', '20:00']));
    }
    const rows = w.db.prepare(`SELECT cs.*, e.class_size FROM class_schedules cs LEFT JOIN enrollments e ON 'adm-enroll:' || e.id = cs.source WHERE cs.status='active'`).all();
    made += new Set(rows.map(r => r.user_id)).size;
    const slots = new Map();
    for (const r of rows) { const key = r.teacher_id + '|' + r.scheduled_date + '|' + r.start_time; (slots.get(key) || slots.set(key, []).get(key)).push(r); }
    for (const [key, list] of slots) {
      if (list.length < 2) continue;
      if (list.some(r => !(Number(r.group_seat) === 1))) bad.mixed++;            // 1:1 이 남과 한 자리
      const cap = Math.min(9, ...list.map(r => Number((/1:(\d+)/.exec(r.class_size || '') || [])[1]) || 1));
      if (list.length > cap) bad.over++;                                            // 정원 초과
      const day = list[0].scheduled_date;
      const leads = await M.loadGroupLeads(w.env, [list[0]], day);
      const ymd = day.replace(/-/g, '');
      if (new Set(list.map(r => M.groupRoomId(leads, r.id, ymd))).size !== 1) bad.room++;   // 한 자리 = 한 방
    }
    for (const uid of new Set(rows.map(r => r.user_id))) {
      if (new Set(rows.filter(r => r.user_id === uid).map(r => r.teacher_id)).size !== 1) bad.split++;  // 학생 하나가 강사 여럿
    }
  }
  ok(made > total * 0.4, `퍼즈 ${ROUNDS}판 · 신청 ${total}건 중 ${made}명이 수업을 받았다(강사 2명이라 나머지는 자리 없음)`);
  ok(bad.mixed === 0, `1:1 수업이 남과 같은 자리에 들어간 적 없음 (${bad.mixed})`);
  ok(bad.over === 0, `합반 정원(그 반의 가장 작은 N · 최대 9)을 넘은 적 없음 (${bad.over})`);
  ok(bad.room === 0, `한 자리의 학생들이 서로 다른 방으로 갈린 적 없음 (${bad.room})`);
  ok(bad.split === 0, `한 학생의 수업이 강사 여럿으로 쪼개진 적 없음 (${bad.split})`);
}

/* ═══ ④ 결석 판정 ═══ */
console.log('\n④ 합반 결석 판정');
const att = [{ account_uid: 'g1', user_id: 'u_x', username: '학생1' }];
ok(M.studentJoinedIn(att, 'g1', '학생1') === 'joined', '들어온 학생은 입장');
ok(M.studentJoinedIn(att, 'g2', '학생2') === 'absent', '(짝) 다른 학생이 들어왔다고 이 학생이 입장으로 보이지 않는다');
ok(M.studentJoinedIn([{ account_uid: '', user_id: 'u_y', username: '' }], 'g2', '학생2') === 'unknown', '신원 없는 접속이 있으면 «모름» — 거짓 결석 알림을 내지 않는다');
ok(M.studentJoinedIn([], 'g2', '학생2') === 'absent', '아무도 없으면 결석');

done();
