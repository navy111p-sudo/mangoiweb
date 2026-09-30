// -*- coding: utf-8 -*-
/**
 * 학생이 직접 내는 수업 연기·변경 요청 — POST /api/class/schedule/request (2026-09-30)
 *
 * [왜] 학생 화면의 저장이 관리자 전용 /api/admin/schedule-requests 로 가서 늘 401 이었다.
 * [무엇을 보나]
 *   ① 판정 정본(studentRequestGate)을 «실제로 돌려» 경계값을 넣는다 — 막는다/받는다 짝.
 *   ② 라우트를 api-mango.ts 에서 중괄호 짝으로 오려 내 «진짜 SQLite» 로 돌린다 —
 *      남의 수업은 403 · 토큰 없으면 401 · 본문의 학생 이름/원래 시각은 무시하고 수업표 값을 적는다.
 *   ③ 학생 화면이 새 경로 + 토큰으로 보내고, 옛 관리자 경로로 안 보낸다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = p => readFileSync(join(ROOT, 'cloudflare-deploy', p), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌ FAIL', name, extra ?? ''); } };

/* ── 정본을 JS 로 — 타입 표기만 걷어 낸다(판정 코드는 그대로). ── */
function stripTs(t) {
  return t
    .replace(/^export type [\s\S]*?\n};\n/gm, '')
    .replace(/^export type [^\n]*;\n/gm, '')
    .replace(/export (async )?function/g, '$1function')
    .replace(/export const/g, 'const')
    .replace(/\): Promise<void> \{/g, ') {')
    .replace(/\(i: StudentReqInput\): StudentReqGate \{/g, '(i) {')
    .replace(/\(iso: string, n: number\): string \{/g, '(iso, n) {')
    .replace(/\(env: any\)/g, '(env)')
    .replace(/\(v: any\)/g, '(v)')
    .replace(/!\./g, '.')
    .replace(/i\.newDate!/g, 'i.newDate');
}
const modSrc = SRC('src/student-schedule-request.ts');
let mod;
try { mod = new Function(stripTs(modSrc) + '\nreturn { studentRequestGate, ensureScheduleChangeRequestTable, STUDENT_REQ_DAILY_CAP };')(); }
catch (e) { console.log('  ❌ FAIL 정본을 불러오지 못함', e.message); process.exit(1); }
const { studentRequestGate: gate, ensureScheduleChangeRequestTable, STUDENT_REQ_DAILY_CAP: CAP } = mod;

console.log('\n① 판정 정본');
const base = { tokUid: 'jeong', schedule: { user_id: 'jeong', scheduled_date: null, status: 'active' }, requestType: 'postpone', origDate: '2026-10-01', newDate: '2026-10-03', newTime: '11:20', todayKst: '2026-09-30', recentCount: 0 };
const g = o => { try { return gate(Object.assign({}, base, o)); } catch (e) { return { ok: false, error: 'THREW ' + e.message }; } };
ok('정상 요청은 받는다', g({}).ok === true, g({}));
ok('토큰 없으면 401', g({ tokUid: null }).error === 'login_required' && g({ tokUid: null }).status === 401);
ok('남의 수업은 403', g({ schedule: { user_id: 'kim' } }).error === 'not_your_class');
ok('대소문자만 다른 계정도 남의 것(Kim ≠ kim)', g({ tokUid: 'Jeong' }).error === 'not_your_class');
ok('수업이 없으면 404', g({ schedule: null }).error === 'schedule_not_found');
ok('취소된 수업은 거절', g({ schedule: { user_id: 'jeong', status: 'cancelled' } }).error === 'class_cancelled');
ok('반복 수업은 회차 날짜 필요', g({ origDate: null }).error === 'orig_date_required');
ok('회차 날짜가 60일 밖이면 거절', g({ origDate: '2026-12-15' }).error === 'orig_date_out_of_range');
ok('날짜 지정 수업은 회차 날짜 없어도 받는다(짝)', g({ schedule: { user_id: 'jeong', scheduled_date: '2026-10-01' }, origDate: null }).ok === true);
ok('연기는 새 일시 «미정» 도 받는다', g({ newDate: null, newTime: null }).ok === true);
ok('변경은 새 일시가 반드시 필요', g({ requestType: 'change', newDate: null, newTime: null }).error === 'new_date_time_required_for_change');
ok('새 날짜만 있고 시각 없으면 거절', g({ newTime: null }).error === 'bad_new_date_time');
ok('지난 날짜로는 못 옮긴다', g({ newDate: '2026-09-29' }).error === 'new_date_out_of_range');
ok('모르는 요청 종류(cancel)는 거절', g({ requestType: 'cancel' }).error === 'bad_request_type');
ok('상한 직전은 받는다', g({ recentCount: CAP - 1 }).ok === true);
ok('상한이면 429', g({ recentCount: CAP }).error === 'too_many_requests' && g({ recentCount: CAP }).status === 429);
ok('못 세었으면(null) 막지 않는다', g({ recentCount: null }).ok === true);

/* ── ② 라우트를 오려 내 진짜 SQLite 로 ── */
console.log('\n② 라우트 실제 실행');
const mango = SRC('src/api-mango.ts');
const at = mango.indexOf("if (method === 'POST' && path === '/api/class/schedule/request') {");
ok('라우트를 찾았다', at > 0);
function blockAt(s, i) { const o = s.indexOf('{', i); let d = 0; for (let k = o; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return s.slice(o + 1, k); } } return ''; }
let body = blockAt(mango, at);
ok('라우트 몸통을 오려 냈다', body.length > 500);
ok('관리자 전용 경로를 부르지 않는다', !/api\/admin\/schedule-requests/.test(body.replace(/\/\*[\s\S]*?\*\//g, '')));
body = body.replace(/ as any/g, '').replace(/\b(let|const) (\w+): [^=;]+=/g, '$1 $2 =').replace(/\((\w+): any\)/g, '($1)');

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)`);
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT, scheduled_date TEXT, start_time TEXT, teacher_id TEXT, status TEXT)`);
  db.exec(`INSERT INTO teachers VALUES (29,'중국어 강선생님',1),(16,'KRYSTEL',1),(21,'KARL',1)`);
  db.exec(`INSERT INTO class_schedules VALUES (849,'jeong','정우영',NULL,'19:20','29','active'),(4385,'jeong','정우영','2026-10-01','16:00','16','active'),(9000,'kim','김민수',NULL,'15:00','29','active')`);
  const wrap = sql => {
    const st = db.prepare(sql);
    const exec = args => ({
      first: async () => st.get(...args) || null,
      all: async () => ({ results: st.all(...args) }),
      run: async () => { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid) } }; },
    });
    return Object.assign(exec([]), { bind: (...a) => exec(a) });
  };
  return { db, D1: { prepare: wrap, exec: async sql => db.exec(sql) } };
}
const json = (o, status = 200) => ({ status, body: o });
async function call({ tok, payload }) {
  const { db, D1 } = makeDb();
  const env = { DB: D1 };
  const request = { json: async () => payload };
  const url = new URL('http://x/api/class/schedule/request');
  const authUidGlobal = async () => tok;
  const notes = [];
  const enqueueNotification = async (_e, n) => { notes.push(n); };
  let res;
  try {
    const fn = new Function('env', 'request', 'url', 'json', 'authUidGlobal', 'enqueueNotification', 'studentRequestGate', 'ensureScheduleChangeRequestTable',
      'return (async () => {' + body + '\n})();');
    res = await fn(env, request, url, json, authUidGlobal, enqueueNotification, gate, ensureScheduleChangeRequestTable); }
  catch (e) { res = { status: 0, body: { error: 'THREW ' + e.message } }; }
  const rows = (() => { try { return db.prepare('SELECT * FROM schedule_change_requests').all(); } catch { return []; } })();
  return { res, rows, notes };
}
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const plus = n => new Date(Date.parse(today + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

{
  const { res, rows, notes } = await call({ tok: 'jeong', payload: { schedule_id: 849, request_type: 'postpone', orig_date: plus(1), new_date: plus(3), new_time: '11:20', student_name: '가짜이름', orig_time: '03:00', student_uid: 'kim' } });
  ok('내 반복 수업 연기 → 200', res.status === 200 && res.body.ok === true, res);
  ok('요청 1행 저장', rows.length === 1, rows.length);
  const r = rows[0] || {};
  ok('학생 역할·토큰 uid 로 적는다', r.requester_role === 'student' && r.requester_uid === 'jeong', r);
  ok('본문의 이름·원래 시각은 무시(수업표 값)', r.student_name === '정우영' && r.orig_time === '19:20' && r.orig_date === plus(1), r);
  ok('담당 강사는 수업표에서', r.teacher_name === '중국어 강선생님', r.teacher_name);
  ok('상태 pending(승인은 관리자)', r.status === 'pending');
  ok('관리자 알림 1건', notes.length === 1 && notes[0].type === 'schedule_request');
}
{
  const { res, rows } = await call({ tok: null, payload: { schedule_id: 849, orig_date: plus(1) } });
  ok('토큰 없으면 401 · 저장 0', res.status === 401 && rows.length === 0, res);
}
{
  const { res, rows } = await call({ tok: 'jeong', payload: { schedule_id: 9000, orig_date: plus(1), new_date: plus(2), new_time: '10:00' } });
  ok('남의 수업(kim)은 403 · 저장 0', res.status === 403 && res.body.error === 'not_your_class' && rows.length === 0, res);
}
{
  const { rows } = await call({ tok: 'jeong', payload: { schedule_id: 4385, request_type: 'postpone', new_date: plus(4), new_time: '14:00', teacher_name: 'karl' } });
  ok('이름으로 고른 강사가 원부와 같으면(대소문자 무시) «희망 강사 번호» 로 — 담당 강사 칸은 그대로', rows[0] && rows[0].teacher_name === 'KRYSTEL' && rows[0].new_teacher_id === '21' && /희망 강사: KARL/.test(rows[0].reason || ''), rows[0]);
  ok('날짜 지정 수업은 수업표 날짜', rows[0] && rows[0].orig_date === '2026-10-01');
}
{
  const { rows } = await call({ tok: 'jeong', payload: { schedule_id: 4385, request_type: 'postpone', new_date: plus(4), new_time: '14:00', teacher_name: 'Teacher Ana' } });
  ok('원부에 없는 강사는 지어내지 않고 사유에 «희망 강사»', rows[0] && rows[0].teacher_name === 'KRYSTEL' && /희망 강사: Teacher Ana/.test(rows[0].reason || ''), rows[0]);
}

{
  const { rows } = await call({ tok: 'jeong', payload: { schedule_id: 4385, request_type: 'postpone', new_date: plus(4), new_time: '14:00', teacher_id: 21, teacher_name: 'Teacher Karl(표시이름)' } });
  ok('«교사로» 에서 고른 강사는 원부 번호(teacher_id)로 new_teacher_id 에 — 표시이름이 달라도 그 강사', rows[0] && rows[0].new_teacher_id === '21' && /희망 강사: KARL/.test(rows[0].reason || ''), rows[0]);
  ok('⛔ teacher_name 은 «담당 강사» 그대로(알림·변경 이력이 남의 이름을 적지 않게)', rows[0] && rows[0].teacher_name === 'KRYSTEL', rows[0]);
}
{
  const { rows } = await call({ tok: 'jeong', payload: { schedule_id: 4385, request_type: 'postpone', new_date: plus(4), new_time: '14:00', teacher_id: 99999, teacher_name: '' } });
  ok('없는 강사 번호는 지어내지 않는다(희망 번호 없음)', rows[0] && rows[0].teacher_name === 'KRYSTEL' && rows[0].new_teacher_id == null, rows[0]);
}
{
  const { rows } = await call({ tok: 'jeong', payload: { schedule_id: 4385, request_type: 'postpone', new_date: plus(4), new_time: '14:00', teacher_id: 16 } });
  ok('담당 강사와 같은 사람을 고르면 바꿀 것이 없다(희망 번호 없음)', rows[0] && rows[0].new_teacher_id == null, rows[0]);
}

/* ── ②-2 «교사로 연기» 가능 강사 조회 — GET /api/class/schedule/free-teachers ── */
console.log('\n②-2 가능 강사 조회 라우트');
const ftAt = mango.indexOf("if (method === 'GET' && path === '/api/class/schedule/free-teachers') {");
ok('라우트를 찾았다', ftAt > 0);
let ftBody = blockAt(mango, ftAt);
ok('라우트 몸통을 오려 냈다', ftBody.length > 400);
ok('판정은 정본 moveCandidatesFor 를 부른다(복제 금지)', /moveCandidatesFor\(env, row, date, time\)/.test(ftBody));
ok('정본이 enroll-ops.ts 에 «export» 로 있다', /export async function moveCandidatesFor\(/.test(SRC('src/enroll-ops.ts')));
ok('관리자 move-candidates 도 같은 정본을 부른다(두 판정이 갈리지 않게)', /return json\(await moveCandidatesFor\(env, row, date, time\)\)/.test(SRC('src/enroll-ops.ts')));
ftBody = ftBody.replace(/ as any/g, '').replace(/\b(let|const) (\w+): [^=;]+=/g, '$1 $2 =').replace(/\((\w+): any\)/g, '($1)').replace(/\(e: any\)/g, '(e)').replace(/\b(let|const) (\w+): any;/g, '$1 $2;');
async function callFt({ tok, qs, mc }) {
  const { db, D1 } = makeDb();
  db.exec(`ALTER TABLE class_schedules ADD COLUMN duration_min INTEGER`);
  db.exec(`ALTER TABLE class_schedules ADD COLUMN source TEXT`);
  const env = { DB: D1 };
  const url = new URL('http://x/api/class/schedule/free-teachers?' + qs);
  const seen = [];
  const moveCandidatesFor = async (_e, row, date, time) => { seen.push({ row, date, time }); if (mc === 'throw') throw new Error('boom');
    return { ok: true, duration_min: 20, current: { id: '16', name: 'KRYSTEL', display_name: 'Krystel', photo: '', why: '', free: true, current: true },
      candidates: [{ id: '21', name: 'KARL', display_name: 'Karl', photo: '', free: true, why: '', current: false }], busy_count: 3, teacher_change_ok: true }; };
  let res;
  try {
    const fn = new Function('env', 'request', 'url', 'json', 'authUidGlobal', 'moveCandidatesFor', 'return (async () => {' + ftBody + '\n})();');
    res = await fn(env, {}, url, json, async () => tok, moveCandidatesFor);
  } catch (e) { res = { status: 0, body: { error: 'THREW ' + e.message } }; }
  return { res, seen };
}
{
  const { res, seen } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=' + plus(1) + '&time=16:00' });
  ok('내 수업이면 200 + 가능 강사', res.status === 200 && res.body.ok === true && Array.isArray(res.body.candidates) && res.body.candidates.length === 1 && res.body.candidates[0].id === '21', res);
  ok('정본에 그 수업 줄·날짜·시각을 넘긴다', seen.length === 1 && Number(seen[0].row.id) === 4385 && seen[0].date === plus(1) && seen[0].time === '16:00', seen);
  ok('다른 학생 정보·사유(why·free)는 싣지 않는다', !!(res.body.candidates && res.body.candidates[0]) && !('why' in res.body.candidates[0]) && !('free' in res.body.candidates[0]) && !('student_conflict' in res.body), res.body);
}
{
  const { res, seen } = await callFt({ tok: 'jeong', qs: 'schedule_id=9000&date=' + plus(1) + '&time=15:00' });
  ok('남의 수업은 403 · 정본도 안 부름', res.status === 403 && res.body.error === 'not_your_class' && seen.length === 0, res);
}
{
  const { res } = await callFt({ tok: 'Jeong', qs: 'schedule_id=4385&date=' + plus(1) + '&time=16:00' });
  ok('대소문자만 다른 계정도 남의 것(Jeong ≠ jeong)', res.status === 403, res);
}
{
  const { res, seen } = await callFt({ tok: null, qs: 'schedule_id=4385&date=' + plus(1) + '&time=16:00' });
  ok('토큰 없으면 401 · 정본 안 부름', res.status === 401 && seen.length === 0, res);
}
{
  const { res } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=' + plus(-2) + '&time=16:00' });
  ok('지난 날짜는 거절', res.status === 400 && res.body.error === 'past_date', res);
}
{
  const { res, seen } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=' + plus(120) + '&time=16:00' });
  ok('90일보다 먼 날짜는 거절(무거운 조회를 막음)', res.status === 400 && res.body.error === 'date_out_of_range' && seen.length === 0, res);
}
{
  const { res } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=2026-1-1&time=16:00' });
  ok('형식이 깨진 날짜는 거절', res.status === 400 && res.body.error === 'bad_params', res);
}
{
  const { res } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=' + plus(1) + '&time=16:00', mc: 'throw' });
  ok('정본이 실패하면 «0명» 이 아니라 오류로 말한다', res.status === 500 && res.body.ok === false, res);
}

/* ── ②-3 관리자 승인(/decide)이 고른 강사를 «실제로» 바꾸는가 ──
   함정 대조(2026-09-30): 예전 decide 에는 teacher_id 를 바꾸는 코드가 한 줄도 없어서
   학생은 «선택됨», 관리자는 «승인·이동됨» 인데 수업은 원래 강사 그대로였다. */
console.log('\n②-3 승인이 강사를 바꾸는가');
const admin = SRC('src/api-admin.ts');
const dAt = admin.indexOf("if (method === 'POST' && path === '/api/admin/schedule-requests/decide') {");
ok('decide 라우트를 찾았다', dAt > 0);
let dBody = blockAt(admin, dAt);
ok('decide 몸통을 오려 냈다', dBody.length > 2000);
/* 타입 표기는 전역 typescript 로 걷어 낸다(손으로 짠 정규식은 decide 의 타입을 다 못 벗긴다).
   없으면 이 절은 «못 돌렸다» 로 FAIL — 조용히 건너뛰지 않는다. */
let tsMod = null;
for (const cand of ['typescript', '/opt/node22/lib/node_modules/typescript/lib/typescript.js']) { try { tsMod = createRequire(import.meta.url)(cand); break; } catch {} }
ok('typescript 를 찾았다(decide 를 실제로 돌리려면 필요)', !!tsMod);
if (tsMod) dBody = tsMod.transpileModule('async function __d(){' + dBody + '\n}', { compilerOptions: { target: 99 } }).outputText
  .replace(/^[\s\S]*?async function __d\(\)\s*\{/, '').replace(/\}\s*$/, '');
async function callDecide({ reqRow, scope = 'hq', isTeacher = false, conflict = false, schedSource = null, schedDate = '2026-10-01' }) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)`);
  db.exec(`INSERT INTO teachers VALUES (16,'KRYSTEL',1),(21,'KARL',1),(30,'LEFT',0)`);
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, teacher_id TEXT, source TEXT, status TEXT, updated_at INTEGER)`);
  db.exec(`INSERT INTO class_schedules VALUES (4385,'jeong',${schedDate === null ? 'NULL' : `'${schedDate}'`},'16:00',20,'16',${schedSource ? `'${schedSource}'` : 'NULL'},'active',0)`);
  db.exec(`CREATE TABLE admin_scope (username TEXT, scope_type TEXT)`);
  if (scope) db.prepare(`INSERT INTO admin_scope VALUES ('boss', ?)`).run(scope);
  const wrap = sql => { const st = db.prepare(sql); const ex = a => ({ first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }), run: async () => { st.run(...a); return {}; } }); return Object.assign(ex([]), { bind: (...a) => ex(a) }); };
  const env = { DB: { prepare: wrap, exec: async q => db.exec(q) } };
  await ensureScheduleChangeRequestTable(env);
  const r = Object.assign({ schedule_id: 4385, request_type: 'postpone', teacher_name: 'KRYSTEL', student_name: '정우영', orig_date: '2026-10-01', orig_time: '16:00', new_date: '2026-10-01', new_time: '16:00', status: 'pending', created_at: 1 }, reqRow);
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO schedule_change_requests (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => r[k]));
  const audits = []; const confCalls = [];
  const deps = {
    getAdminActor: async () => ({ ok: true, isTeacher, username: 'boss', name: '사장', role: scope }),
    forbiddenTeacherBody: (_a, m) => ({ ok: false, error: 'forbidden_teacher', message: m }),
    ensureScheduleRequestTable: async () => {},
    getScope: async () => ({ type: scope }),
    scopeStudentCond: () => ({ cond: '', binds: [] }),
    findScheduleConflicts: async (_e, q) => { confCalls.push(q); return conflict ? { has: true, ko: '겹침', en: 'overlap', student: [], teacher: [1] } : { has: false, student: [], teacher: [] }; },
    MIRROR_SOURCE: 'c24-mirror', MIRROR_SOURCE_MANUAL: 'c24-mirror:manual', DEFAULT_CLASS_MINUTES: 20,
    teacherMoveDenyReason: gateMod.teacherMoveDenyReason,
    writeClassAudit: async (_e, a) => { audits.push(a); },
  };
  const names = Object.keys(deps);
  let res;
  try {
    const fn = new Function('env', 'request', 'json', ...names, 'return (async () => {' + dBody + '\n})();');
    res = await fn(env, { json: async () => ({ id: 1, action: 'approve' }) }, json, ...names.map(k => deps[k]));
  } catch (e) { res = { status: 0, body: { error: 'THREW ' + e.message } }; }
  const cs = db.prepare('SELECT * FROM class_schedules WHERE id = 4385').get();
  return { res, cs, audits, confCalls };
}
/* 게이트 정본을 그대로 쓴다(복제 금지) — isOrgScopedRole 만 주입. */
const gateSrc = SRC('src/class-teacher-move.ts');
let gateMod = {};
try {
  const g = gateSrc.replace(/^import[^\n]*\n/gm, '').replace(/export type [^\n]*\n/g, '').replace(/export function/g, 'function')
    .replace(/\(a: \{[^)]*\}\): MoveDeny \{/, '(a) {').replace(/:\s*MoveDeny\s*\{/g, ' {');
  const cut = g.slice(0, g.indexOf('/** 이 행에 «그 칸»'));
  gateMod = new Function('isOrgScopedRole', cut + '\nreturn { teacherMoveDenyReason };')(r => ['franchise', 'branch', 'agency'].includes(String(r)));
} catch (e) { ok('게이트 정본을 불러왔다', false, e.message); }
ok('게이트 정본을 불러왔다', typeof gateMod.teacherMoveDenyReason === 'function');
{
  const { res, cs, audits, confCalls } = await callDecide({ reqRow: { new_teacher_id: '21' } });
  ok('본사 승인 → 담당 강사가 실제로 바뀐다(16 → 21)', res.body && res.body.applied === 'moved' && cs.teacher_id === '21', { res, cs });
  ok('응답이 바뀐 강사를 말한다', res.body && res.body.teacher_changed && res.body.teacher_changed.id === '21' && res.body.teacher_changed.name === 'KARL', res.body);
  ok('겹침 검사는 «새 강사» 기준', confCalls.length === 1 && String(confCalls[0].teacherId) === '21', confCalls);
  ok('변경 이력에 강사 변경이 남는다', audits.length === 1 && /담당 강사 → KARL/.test(audits[0].detail || ''), audits);
}
{
  const { res, cs } = await callDecide({ reqRow: {} });
  ok('희망 강사 없는 요청은 예전 그대로(강사 안 바뀜)', res.body && res.body.applied === 'moved' && cs.teacher_id === '16' && !res.body.teacher_changed, { res, cs });
}
{
  const { res, cs, audits } = await callDecide({ reqRow: { new_teacher_id: '21' }, scope: 'branch' });
  ok('지사 계정 승인은 강사를 못 바꾸고 «옮기지도 않는다»', res.body && res.body.applied === 'teacher_not_changed' && cs.teacher_id === '16', { res, cs });
  ok('그때는 변경 이력을 안 남긴다', audits.length === 0, audits);
  ok('그 사유를 말한다', res.body && typeof res.body.message === 'string' && res.body.message.length > 0, res.body);
}
{
  const { res, cs } = await callDecide({ reqRow: { new_teacher_id: '21' }, scope: null });
  ok('권한을 모르면(스코프 없음) 막는다', res.body && res.body.applied === 'teacher_not_changed' && cs.teacher_id === '16', { res, cs });
}
{
  const { res, cs } = await callDecide({ reqRow: { new_teacher_id: '30' } });
  ok('퇴사 강사로는 안 바꾼다', res.body && res.body.applied === 'teacher_not_changed' && cs.teacher_id === '16', { res, cs });
}
{
  const { res, cs } = await callDecide({ reqRow: { new_teacher_id: '21' }, conflict: true });
  ok('새 강사가 그 시간에 겹치면 안 바꾼다(conflict)', res.body && res.body.applied === 'conflict' && cs.teacher_id === '16', { res, cs });
}
{
  const { res, cs } = await callDecide({ reqRow: { new_teacher_id: '21', new_date: '2026-10-03' }, schedSource: 'c24-mirror' });
  ok('카페24 미러 수업은 날짜를 바꾸면서 강사까지 바꾸지 않는다', res.body && res.body.applied === 'teacher_not_changed' && cs.teacher_id === '16' && cs.scheduled_date === '2026-10-01' && cs.source === 'c24-mirror', { res, cs });
}
{
  const { res, cs } = await callDecide({ reqRow: { new_teacher_id: '21' }, schedSource: 'c24-mirror' });
  ok('미러 수업도 같은 날짜면 강사를 바꾸고 «사람 손» 도장', res.body && res.body.applied === 'moved' && cs.teacher_id === '21' && cs.source === 'c24-mirror:manual', { res, cs });
}
{
  const { res, cs } = await callDecide({ reqRow: { new_teacher_id: '21' }, schedDate: null });
  ok('반복 수업은 여전히 기록만(recorded) — 강사 안 바뀜', res.body && res.body.applied === 'recorded' && cs.teacher_id === '16', { res, cs });
}
{
  const { res, cs } = await callDecide({ reqRow: { new_teacher_id: '21' }, isTeacher: true });
  ok('강사 계정은 승인 자체가 막힌다(403)', res.status === 403 && cs.teacher_id === '16', res);
}

/* ── ③ 학생 화면 배선 ── */
console.log('\n③ 학생 화면');
const page = SRC('public/lesson-postpone-demo.html');
const persist = blockAt(page, page.indexOf('function __mobPersist(){'));
const code = persist.replace(/\/\*[\s\S]*?\*\//g, '');
ok('새 학생 경로로 보낸다', /\/api\/class\/schedule\/request/.test(code));
ok('옛 관리자 경로로 안 보낸다', !/\/api\/admin\/schedule-requests/.test(code));
ok('학생 토큰(Bearer)을 싣는다', /mango_token/.test(code) && /'Bearer '/.test(code));
ok('로그인 만료를 사람 말로 말한다', /login_required/.test(page) && /다시 로그인/.test(page));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
