// ⏸ 연속 결석 «보류» (2026-09-25 사장님 결정 — 결석 2회 연속 · 보류 중 강사비 0% · 매니저 확인)
//
// 정본 src/absence-hold.ts 를 타입 제거로 «실제로» 돌리고(진짜 SQLite), 배선 네 곳
// (결석 감지 · 급여 · 강사 화면 · 매니저 결정 API)이 그 정본을 쓰는지 본다.
// ⚠️ 「보류한다」 옆에 「안 보류한다(1회·출석·모름)」를 짝으로 둔다 — 짝이 없으면 «전부 보류» 도 통과한다.
process.env.TZ = 'Asia/Seoul';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };
const rd = (p) => readFileSync(p, 'utf8');

/* 정본 로드 — 형제 import 는 가짜로 갈아 끼운다(recurStartedOn 만 진짜) */
const calls = { sms: [], alim: [], email: [], push: [] };
globalThis.__AH = {
  phonesForStudent: async (env, uid) => (globalThis.__AH_PHONES[uid] || { student: '', parent: '' }),
  sendPlainSms: async (env, to, text) => { calls.sms.push({ to, text }); return { ok: true }; },
  sendKakaoAlimtalk: async (env, p) => { calls.alim.push(p); return { ok: true }; },
  sendEmail: async (env, p) => { calls.email.push(p); return { ok: true }; },
  emailLayout: (o) => o.title + o.bodyHtml,
  pushToTeacher: async (env, tid, title, body, url, tag, extra) => { calls.push.push({ tid, url, extra }); return { sent: 1 }; },
  PH_MANAGERS: ['mgr_melca', 'mgr_maimai', 'mgr_karl'],
  siteUrl: (p) => 'https://mangoi.ai' + p,
  selectInChunks: async (db, items, build) => {
    if (!items || !items.length) return [];
    const r = await db.prepare(build(items.map(() => '?').join(','))).bind(...items).all();
    return (r && r.results) || [];
  },
};
globalThis.__AH_PHONES = {};
let M = null;
try {
  const csd = stripTypeScriptTypes(rd(resolve(SRC, 'class-start-date.ts')));
  const CSD = await import('data:text/javascript;base64,' + Buffer.from(csd).toString('base64'));
  globalThis.__AH.recurStartedOn = CSD.recurStartedOn;
  let code = stripTypeScriptTypes(rd(resolve(SRC, 'absence-hold.ts')));
  code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map(n => n.trim()).filter(Boolean).map(n => `const ${n} = globalThis.__AH.${n};`).join('\n'));
  M = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
} catch (e) { console.log('  (정본 로드 실패) ' + e.message); }
ok(!!(M && M.absenceStreak && M.maybeHoldStudent), '전제: 정본을 불러왔다');
if (!M) { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(1); }

console.log('① 순수 판정');
ok(M.ABSENCE_HOLD_STREAK === 2, '기준은 «2회 연속» (사장님 결정)');
ok(JSON.stringify(M.dowList('Thu')) === '[4]' && JSON.stringify(M.dowList('1,3,5')) === '[1,3,5]' && JSON.stringify(M.dowList('목')) === '[4]', '요일 표기 세 벌을 읽는다');
ok(M.dowList('x').length === 0, '(짝) 모르는 요일은 지어내지 않는다');
const O = (d, s) => ({ date: d, start: '19:00', schedule_id: 1, state: s });
ok(M.absenceStreak([O('2026-09-20', 'absent'), O('2026-09-22', 'absent')]) === 2, '최근 두 회차가 결석이면 2');
ok(M.absenceStreak([O('2026-09-20', 'absent'), O('2026-09-21', 'attended'), O('2026-09-22', 'absent')]) === 1, '(짝) 중간에 출석이 있으면 끊긴다');
ok(M.absenceStreak([O('2026-09-20', 'absent'), O('2026-09-21', 'unknown'), O('2026-09-22', 'absent')]) === 1, '(짝) 모르는 회차도 끊는다 — 모르면 보류하지 않는다');
ok(M.absenceStreak([O('2026-09-22', 'absent'), O('2026-09-20', 'absent')]) === 2, '순서와 무관');
const H = { held_after: '2026-09-22', resumed_on: null };
ok(M.isHeldOn(H, '2026-09-22') === false, '보류를 건 날(두 번째 결석) 수업은 보류 아님 — 기존 결석 규칙');
ok(M.isHeldOn(H, '2026-09-23') === true, '그 다음 날부터 보류');
ok(M.isHeldOn({ held_after: '2026-09-22', resumed_on: '2026-09-25' }, '2026-09-25') === false, '재개한 날부터는 정상');
ok(M.isHeldOn({ held_after: '2026-09-22', resumed_on: '2026-09-25' }, '2026-09-24') === true, '(짝) 재개 전날까지는 보류');

console.log('\n② 진짜 SQLite 로 보류 걸기');
function mkEnv(kv = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT, day_of_week TEXT, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, teacher_id TEXT, status TEXT, starts_on TEXT)`);
  db.exec(`CREATE TABLE class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, created_at INTEGER)`);
  db.exec(`CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, account_uid TEXT, role TEXT, status TEXT, date TEXT, joined_at INTEGER)`);
  db.exec(`CREATE TABLE teacher_profiles (email TEXT, english_name TEXT, korean_name TEXT)`);
  db.exec(`CREATE TABLE admin_account (username TEXT, email TEXT)`);
  db.exec(`CREATE TABLE admin_scope (username TEXT, scope_type TEXT)`);
  db.prepare(`INSERT INTO admin_scope VALUES ('mgr_karl','hq'),('sneaky_branch','branch')`).run();
  const wrap = (q, args) => {
    const st = db.prepare(q);
    return {
      all: async () => ({ results: st.all(...args) }),
      first: async () => st.get(...args) ?? null,
      run: async () => { const r = st.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    };
  };
  const env = {
    DB: {
      exec: async (q) => db.exec(q),
      prepare: (q) => ({ ...wrap(q, []), bind: (...a) => wrap(q, a) }),
    },
    SESSION_STATE: { get: async (k) => kv[k] ?? null },
  };
  return { db, env };
}
const at = (ymd, hm) => Date.parse(`${ymd}T${hm}:00+09:00`);
const NOW = at('2026-09-24', '21:00');   // 목요일 밤
// 월·목 19:00 수업(9/1 시작)
function seed(db, uid = 'kim01') {
  db.prepare(`INSERT INTO class_schedules (id,user_id,student_name,day_of_week,start_time,duration_min,teacher_id,status) VALUES (1,?,?, 'Mon,Thu','19:00',20,'8','active')`).run(uid, '김서윤');
}
const absent = (db, ymd) => db.prepare(`INSERT INTO class_no_show (room_id,schedule_id,missing_role,created_at) VALUES (?,1,'student',?)`).run('class-1-' + ymd.replace(/-/g, ''), at(ymd, '19:15'));
const attend = (db, ymd, uid = 'kim01') => db.prepare(`INSERT INTO attendance (room_id,user_id,account_uid,role,status,date,joined_at) VALUES (?,?,?,'student','present',?,?)`).run('class-1-' + ymd.replace(/-/g, ''), 'u_x', uid, ymd, at(ymd, '19:01'));

{
  const { db, env } = mkEnv(); seed(db);
  attend(db, '2026-09-18'); absent(db, '2026-09-21'); absent(db, '2026-09-24');
  globalThis.__AH_PHONES = { kim01: { parent: '01012345678', student: '' } };
  calls.sms.length = 0; calls.push.length = 0; calls.email.length = 0;
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01', student_name: '김서윤', teacher_id: '8', teacher_name: 'KAYE' }, NOW);
  ok(r.status === 'held' && r.streak === 2, '출석 뒤 결석 2회 연속 → 보류 (' + r.status + ')');
  const row = db.prepare(`SELECT * FROM class_absence_hold`).get();
  ok(row && row.held_after === '2026-09-24' && row.state === 'held', '보류 기간은 «오늘(두 번째 결석) 다음» 부터');
  ok(calls.sms.length === 1 && calls.sms[0].to === '01012345678', '학생 목록의 학부모 번호로 문자를 보냈다');
  ok(calls.push.some(p => p.url === '/teacher' && p.tid === '8'), '강사에게 알림(푸시)');
  ok(calls.push.some(p => p.url === '/manager' && (p.extra || []).includes('mgr_karl')), '필리핀 매니저에게 알림(푸시)');
  const r2 = await M.maybeHoldStudent(env, { user_id: 'kim01', student_name: '김서윤', teacher_id: '8' }, NOW);
  ok(r2.status === 'already_held' && db.prepare(`SELECT COUNT(*) n FROM class_absence_hold`).get().n === 1, '(짝) 이미 보류면 두 번 걸지 않는다');
  const R = await M.loadHoldRanges(env);
  ok(!!M.heldOnFor(R, 'KIM01', '2026-09-28') && !M.heldOnFor(R, 'kim01', '2026-09-24'), '급여·강사화면이 읽는 판정 — 다음 회차는 보류, 그날은 아님');
  // 학생이 스스로 다시 들어옴 → 자동 재개
  attend(db, '2026-09-28');
  ok(await M.autoResumeReturning(env, at('2026-09-28', '20:00')) === 1, '학생이 다시 들어오면 자동으로 풀린다');
  const R2 = await M.loadHoldRanges(env);
  ok(!M.heldOnFor(R2, 'kim01', '2026-09-28') && !M.heldOnFor(R2, 'kim01', '2026-10-01'), '재개일부터 정상 지급');
}
{
  const { db, env } = mkEnv(); seed(db);
  absent(db, '2026-09-24');
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01' }, NOW);
  ok(r.status === 'below', '(짝) 결석 1회(앞 회차는 기록 없음=모름)면 보류 안 함');
}
{
  const { db, env } = mkEnv(); seed(db);
  absent(db, '2026-09-21'); attend(db, '2026-09-21'); absent(db, '2026-09-24');
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01' }, NOW);
  ok(r.status === 'below', '(짝) 결석이 찍혔어도 그날 늦게 들어왔으면 출석으로 본다');
}
{
  const { db, env } = mkEnv({ absence_hold: 'off' }); seed(db);
  absent(db, '2026-09-21'); absent(db, '2026-09-24');
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01' }, NOW);
  ok(r.status === 'switch_off', 'KV absence_hold=off 면 새 보류를 걸지 않는다');
}
{
  const { db, env } = mkEnv(); seed(db, 'lee02');
  absent(db, '2026-09-21'); absent(db, '2026-09-24');
  globalThis.__AH_PHONES = {};
  calls.sms.length = 0;
  const r = await M.maybeHoldStudent(env, { user_id: 'lee02', student_name: '이하준', teacher_id: '8' }, NOW);
  ok(r.status === 'held' && r.notify.student.why === 'no_phone_in_student_list' && calls.sms.length === 0,
    '번호가 없으면 보내지 않고 «번호 없음» 을 남긴다(화면이 «직접 연락» 으로 말함)');
  const items = await M.listHolds(env);
  ok(items.length === 1 && !('notify_json' in items[0]) && JSON.stringify(items).indexOf('0101') < 0, '목록에 전화번호를 싣지 않는다');
  const d = await M.decideHold(env, items[0].id, 'end', 'mgr_karl');
  ok(d.ok && db.prepare(`SELECT state FROM class_absence_hold`).get().state === 'ended', '매니저 [그만둠] → ended (보류 유지·지급 0)');
  const R = await M.loadHoldRanges(env);
  ok(!!M.heldOnFor(R, 'lee02', '2026-12-01'), '그만둠은 기한 없이 보류');
  ok((await M.decideHold(env, items[0].id, 'bogus', 'x')).error === 'unknown_action', '(짝) 모르는 결정은 거절');
  ok((await M.decideHold(env, items[0].id, 'resume', 'mgr_karl')).ok === true, '그만둠도 나중에 재개할 수 있다(되돌릴 길)');
}
{
  // 🔴 함정 대조(2026-09-25): 결석 감지는 «시작+10~40분» 에 기록하고 곧바로 판정한다 — 그 회차는 아직 안 끝났다.
  const { db, env } = mkEnv(); seed(db);
  absent(db, '2026-09-21'); absent(db, '2026-09-24');
  globalThis.__AH_PHONES = {};
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01' }, at('2026-09-24', '19:16'));
  ok(r.status === 'held' && r.streak === 2, '«2회째» 결석이 막 기록된 그 순간(수업 진행 중)에 보류가 걸린다 — 3회째가 아님 (' + r.status + '/' + r.streak + ')');
}
{
  const { db, env } = mkEnv(); seed(db);
  absent(db, '2026-09-17'); absent(db, '2026-09-21');
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01' }, at('2026-09-24', '19:05'), { dry: true });
  ok(r.status === 'would_hold' && r.streak === 2, '(짝) 진행 중이고 기록 없는 회차는 연속을 끊지 않는다(모름=빼기)');
  attend(db, '2026-09-24');
  const r2 = await M.maybeHoldStudent(env, { user_id: 'kim01' }, at('2026-09-24', '19:05'), { dry: true });
  ok(r2.status === 'below', '(짝) 진행 중이라도 학생이 들어왔으면 출석으로 끊는다');
}
{
  // 급여: 보류 구간이라도 학생이 실제로 들어온 회차는 지급
  const { db, env } = mkEnv(); seed(db);
  attend(db, '2026-09-28');
  const S = await M.attendedStudentRooms(env, ['class-1-20260928', 'class-1-20261001']);
  ok(S instanceof Set && S.has('class-1-20260928') && !S.has('class-1-20261001'), '보류 기간에 학생이 들어온 회차는 «수업함» 으로 가려낸다');
  const S2 = await M.attendedStudentRooms({ DB: { prepare: () => { throw Error('x'); } } }, ['class-1-20260928']);
  ok(S2 === null, '(짝) 못 읽으면 null — 급여가 보류를 적용하지 않는다(가르친 수업을 0원으로 만들지 않음)');
}
{
  // 그만둠(ended) 뒤에 학생이 돌아오면 자동 재개 + 계정 칸이 빈 접속(기기 번호만)도 잡는다
  const { db, env } = mkEnv(); seed(db);
  db.prepare(`CREATE TABLE IF NOT EXISTS class_absence_hold (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_id TEXT, teacher_name TEXT, held_after TEXT NOT NULL, resumed_on TEXT, streak INTEGER, state TEXT NOT NULL DEFAULT 'held', notify_json TEXT, decided_by TEXT, decided_at INTEGER, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
  db.prepare(`INSERT INTO class_absence_hold (student_uid, held_after, state, created_at, updated_at) VALUES ('kim01','2026-09-24','ended',1,1)`).run();
  db.prepare(`INSERT INTO attendance (room_id,user_id,account_uid,role,status,date,joined_at) VALUES ('class-1-20261001','u_dev',NULL,'student','present','2026-10-01',?)`).run(at('2026-10-01', '19:02'));
  ok(await M.autoResumeReturning(env, at('2026-10-01', '20:00')) === 1, '«그만둠» 뒤에 돌아와도 자동으로 풀린다 — 계정 칸이 빈 접속도(예약방으로)');
  const row = db.prepare(`SELECT state, resumed_on FROM class_absence_hold`).get();
  ok(row.state === 'resumed' && row.resumed_on === '2026-10-01', '재개일은 그 접속 날짜');
}
{
  // 중복 판정 조회가 죽으면 «없음» 으로 떨어지지 않는다 — 두 번 걸고 두 번 문자 보내지 않는다
  const { db, env } = mkEnv(); seed(db);
  absent(db, '2026-09-21'); absent(db, '2026-09-24');
  const orig = env.DB.prepare;
  // 실패는 «조회 순간» 에 낸다(prepare 는 성공) — 그래야 `.first().catch(()=>null)` 로 삼키는 변이를 잡는다
  const boom = { first: async () => { throw Error('boom'); }, all: async () => { throw Error('boom'); }, run: async () => { throw Error('boom'); } };
  env.DB.prepare = (q) => /FROM class_absence_hold WHERE student_uid/.test(q) ? { ...boom, bind: () => boom } : orig(q);
  calls.sms.length = 0; globalThis.__AH_PHONES = { kim01: { parent: '01012345678', student: '' } };
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01' }, NOW);
  const n = (() => { try { return db.prepare(`SELECT COUNT(*) n FROM class_absence_hold`).get().n; } catch { return 0; } })();
  ok(r.status === 'error' && n === 0 && calls.sms.length === 0, '중복 확인을 못 하면 보류·문자를 보내지 않는다(fail-closed)');
}
{
  // 조회가 죽으면 보류하지 않는다(던지지도 않는다)
  const env = { DB: { exec: async () => { throw Error('x'); }, prepare: () => { throw Error('x'); } }, SESSION_STATE: { get: async () => null } };
  const r = await M.maybeHoldStudent(env, { user_id: 'kim01' }, NOW);
  ok(r.status === 'error', 'DB 가 죽으면 «보류 안 함» 으로 떨어지고 던지지 않는다');
  const R = await M.loadHoldRanges(env);
  ok(R.size === 0, '(짝) 못 읽으면 «보류 없음» — 급여·강사화면은 예전 그대로');
}

console.log('\n③ 매니저 결정 API 게이트');
{
  const { env } = mkEnv();
  const req = (m, body) => new Request('https://x/api/admin/reports/absence-holds' + (body ? '/decide' : ''), { method: m, body: body ? JSON.stringify(body) : undefined });
  const dep = (actor) => ({ getAdminActor: async () => actor, isOrgScopedRole: (r) => ['branch', 'agency', 'franchise'].includes(r) });
  const t = await M.absenceHoldRouter(env, req('GET'), new URL('https://x/?state=open'), 'absence-holds', dep({ ok: true, role: 'teacher', isTeacher: true }));
  ok(t.status === 403, '강사는 목록·결정을 못 한다(강사는 /teacher 에서 보류 표시만 본다)');
  const b = await M.absenceHoldRouter(env, req('GET'), new URL('https://x/'), 'absence-holds', dep({ ok: true, role: 'branch', isTeacher: false }));
  ok(b.status === 403, '지사·대리점은 막는다');
  const g = await M.absenceHoldRouter(env, req('GET'), new URL('https://x/'), 'absence-holds', dep({ ok: true, role: 'hq', isTeacher: false, username: 'mgr_karl' }));
  ok(g.status === 200 && (await g.json()).ok === true, '(짝) 본사·매니저는 목록을 본다');
  const u = await M.absenceHoldRouter(env, req('POST', { id: 1, action: 'resume' }), new URL('https://x/'), 'absence-holds/decide', dep({ ok: true, role: 'staff', isTeacher: false, username: 'nobody' }));
  ok(u.status === 403 && (await u.json()).error === 'scope_unknown', '스코프를 못 읽으면 결정을 막는다(role 이 staff 로 떨어져도)');
  const sb = await M.absenceHoldRouter(env, req('POST', { id: 1, action: 'resume' }), new URL('https://x/'), 'absence-holds/decide', dep({ ok: true, role: 'staff', isTeacher: false, username: 'sneaky_branch' }));
  ok(sb.status === 403, '(짝) actor.role 이 staff 여도 admin_scope 가 지사면 막는다');
  const x = await M.absenceHoldRouter(env, req('GET'), new URL('https://x/'), 'monthly', dep({ ok: true, role: 'hq' }));
  ok(x === null, '다른 경로는 건드리지 않는다');
}

console.log('\n④ 배선 — 정본을 실제로 쓰는가');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pay = strip(rd(resolve(SRC, 'api-admin.ts')));
const iUp = pay.indexOf("else if (upcoming) st = 'upcoming';");
const iHold = pay.indexOf("else if (heldAttended && !heldAttended.has(roomId) && heldOnFor(holdRanges, l.user_id, dateStr)) st = 'absence_hold';");
const iAbs = pay.indexOf("st = 'student_absent';");
ok(iHold > iUp && iHold < iAbs, '급여: 보류 판정이 «학생 결석» 보다 먼저 — 보류 기간은 0%');
ok(/if \(st === 'absence_hold'\) \{[^}]*continue; \}/.test(pay), '급여: 보류 수업은 수업 수·지급액에 안 들어간다');
ok(/const holdRanges = await loadHoldRanges\(/.test(pay), '급여: 보류 기록을 읽는다');
ok(/const heldAttended = heldRooms\.length \? await attendedStudentRooms\(/.test(pay), '급여: 보류 회차 중 학생이 들어온 방을 먼저 가려낸다');
const sw = strip(rd(resolve(SRC, 'absent-sweep.ts')));
const iSkip = sw.indexOf('if (heldOnFor(holdRanges, c.user_id, todayStr))');
const iAtt = sw.indexOf('SELECT 1 FROM attendance WHERE room_id = ?');
ok(iSkip > 0 && iSkip < iAtt, '결석 감지: 보류 중인 학생은 알림·기록을 만들지 않는다');
ok(/await maybeHoldStudent\(env, \{ user_id: c\.user_id/.test(sw), '결석 감지: 새 결석이 기록되면 보류를 판정한다');
const tp = strip(rd(resolve(SRC, 'api-teacher.ts')));
ok(/c\.absence_hold = \{/.test(tp) && /heldOnFor\(_holds, c\.student_uid, todayStr\)/.test(tp), '강사 포털: 오늘 수업에 보류 표시를 싣는다');
const th = rd(resolve(PUB, 'teacher.html'));
const iHoldCard = th.indexOf('if (c.absence_hold){');
const holdCard = iHoldCard > 0 ? th.slice(iHoldCard, th.indexOf('continue;', iHoldCard)) : '';
ok(holdCard.length > 0 && holdCard.length < 1800, '강사 화면: 보류 카드를 따로 그린다');
ok(/data-join="' \+ i \+ '"/.test(holdCard) && /btn-gray/.test(holdCard), '강사 화면: 학생이 돌아오면 들어갈 수 있게 회색 보조 입장 버튼을 남긴다');
{
  const i0 = th.indexOf('function renderNextUp('); const body = i0 > 0 ? th.slice(i0, th.indexOf('if (!pick){', i0)) : '';
  ok(/if \(c\.absence_hold\) continue;/.test(body) && /pick = c;/.test(body), '강사 화면: 보류 수업은 «다음 수업» 카운트다운에 올리지 않는다(다른 수업은 그대로)');
}
ok(/Do NOT wait in the room/.test(th) && /필리핀 매니저에게/.test(th), '강사 화면: «기다리지 말고 매니저에게 문의» 를 영·한으로');
const rep = strip(rd(resolve(SRC, 'accounting-reports.ts')));
ok(/absenceHoldRouter\(env as any, request, url, p,/.test(rep), '매니저 API 가 /api/admin/reports/ 라우터에 연결됐다(index.ts 무변경)');
ok(/<script defer src="\/js\/absence-hold-panel\.js\?v=\d+"><\/script>/.test(rd(resolve(PUB, 'admin.html'))), 'admin.html: 보류 알림판이 자동으로 뜬다');
{
  // manager.html 은 «외부 리소스 1개» 계약 — 보류가 «있을 때만» 패널 파일을 동적으로 싣는다
  const mg = rd(resolve(PUB, 'manager.html'));
  ok(/fetch\('\/api\/admin\/reports\/absence-holds\?state=open'/.test(mg) && /s\.src='\/js\/absence-hold-panel\.js\?v=\d+'/.test(mg),
    'manager.html: 보류가 있으면 알림판을 불러온다');
  ok(/!d\.items\.length\)return;/.test(mg), '(짝) manager.html: 보류가 없으면 파일을 받지 않는다(가볍게)');
  ok(!/<script[^>]+src="\/js\/absence-hold-panel/.test(mg), '(짝) manager.html: 외부 script 태그를 늘리지 않는다');
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
