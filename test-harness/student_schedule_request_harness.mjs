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
ok('같은 수업·회차에 대기 요청이 있으면 409 already_pending', g({ pendingDup: true }).error === 'already_pending' && g({ pendingDup: true }).status === 409);
ok('대기 요청이 없으면 받는다(짝)', g({ pendingDup: false }).ok === true);
ok('중복을 못 봤으면(null) 막지 않는다', g({ pendingDup: null }).ok === true);

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
      run: async () => { const r = st.run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    });
    return Object.assign(exec([]), { bind: (...a) => exec(a) });
  };
  return { db, D1: { prepare: wrap, exec: async sql => db.exec(sql) } };
}
const versionSrc = SRC('src/class-schedule-move.ts');
const scheduleMoveVersion = new Function('row', blockAt(versionSrc, versionSrc.indexOf('export function scheduleMoveVersion')));
const json = (o, status = 200) => ({ status, body: o });
async function call({ tok, payload, pre }) {
  const { db, D1 } = makeDb();
  const env = { DB: D1 };
  if (pre) await pre(env, db);
  const request = { json: async () => payload };
  const url = new URL('http://x/api/class/schedule/request');
  const authUidGlobal = async () => tok;
  const notes = [];
  const enqueueNotification = async (_e, n) => { notes.push(n); };
  let res;
  try {
    const fn = new Function('env', 'request', 'url', 'json', 'authUidGlobal', 'enqueueNotification', 'studentRequestGate', 'ensureScheduleChangeRequestTable', 'scheduleMoveVersion',
      'return (async () => {' + body + '\n})();');
    res = await fn(env, request, url, json, authUidGlobal, enqueueNotification, gate, ensureScheduleChangeRequestTable, scheduleMoveVersion); }
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
const ftAt = mango.indexOf("if (method === 'GET' && (path === '/api/class/schedule/free-teachers' || path === '/api/class/schedule/day-slots')) {");
ok('라우트를 찾았다', ftAt > 0);
let ftBody = blockAt(mango, ftAt);
ok('라우트 몸통을 오려 냈다', ftBody.length > 400);
ok('판정은 정본 moveCandidatesFor 를 부른다(복제 금지)', /moveCandidatesFor\(env, row, date, time\)/.test(ftBody));
ok('정본이 enroll-ops.ts 에 «export» 로 있다', /export async function moveCandidatesFor\(/.test(SRC('src/enroll-ops.ts')));
ok('관리자 move-candidates 도 같은 정본을 부른다(두 판정이 갈리지 않게)', /return json\(await moveCandidatesFor\(env, row, date, time\)\)/.test(SRC('src/enroll-ops.ts')));
ftBody = ftBody.replace(/ as any/g, '').replace(/\b(let|const) (\w+): [^=;]+=/g, '$1 $2 =').replace(/\((\w+): any\)/g, '($1)').replace(/\(e: any\)/g, '(e)').replace(/\b(let|const) (\w+): any;/g, '$1 $2;');
async function callFt({ tok, qs, mc, path = '/api/class/schedule/free-teachers', ds }) {
  const { db, D1 } = makeDb();
  db.exec(`ALTER TABLE class_schedules ADD COLUMN duration_min INTEGER`);
  db.exec(`ALTER TABLE class_schedules ADD COLUMN source TEXT`);
  const env = { DB: D1 };
  const url = new URL('http://x' + path + '?' + qs);
  const seen = [];
  const moveCandidatesFor = async (_e, row, date, time) => { seen.push({ row, date, time }); if (mc === 'throw') throw new Error('boom');
    return { ok: true, duration_min: 20, current: { id: '16', name: 'KRYSTEL', display_name: 'Krystel', photo: '', why: '', free: true, current: true },
      candidates: [{ id: '21', name: 'KARL', display_name: 'Karl', photo: '', free: true, why: '', current: false }], busy_count: 3, teacher_change_ok: true }; };
  const daySlotsFor = async (_e, row, date) => { seen.push({ slots: true, row, date }); if (ds === 'throw') throw new Error('boom');
    return { ok: true, date, duration_min: 20, slots: [{ t: '09:00', past: false, student_busy: false, teacher_free: true }] }; };
  let res;
  try {
    const fn = new Function('env', 'request', 'url', 'json', 'authUidGlobal', 'moveCandidatesFor', 'daySlotsFor', 'path', 'return (async () => {' + ftBody + '\n})();');
    res = await fn(env, {}, url, json, async () => tok, moveCandidatesFor, daySlotsFor, path);
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
/* CI 러너는 cloudflare-deploy/node_modules 에만 typescript 가 있다(test-harness 에서 'typescript' 로는 못 찾음 — 2026-09-30 CI 에서 밟음). */
for (const cand of ['typescript', join(ROOT, 'cloudflare-deploy', 'node_modules', 'typescript'), '/opt/node22/lib/node_modules/typescript/lib/typescript.js']) { try { tsMod = createRequire(import.meta.url)(cand); break; } catch {} }
ok('typescript 를 찾았다(decide 를 실제로 돌리려면 필요)', !!tsMod);
if (tsMod) dBody = tsMod.transpileModule('async function __d(){' + dBody + '\n}', { compilerOptions: { target: 99 } }).outputText
  .replace(/^[\s\S]*?async function __d\(\)\s*\{/, '').replace(/\}\s*$/, '');
const atomicModule = {};
if (tsMod) new Function('exports', tsMod.transpileModule(SRC('src/schedule-request-atomic.ts'), { compilerOptions: { target: 99, module: 1 } }).outputText)(atomicModule);
async function callDecide({ reqRow, scope = 'hq', isTeacher = false, conflict = false, schedSource = null, schedDate = '2026-10-01' }) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, active INTEGER DEFAULT 1)`);
  db.exec(`INSERT INTO teachers VALUES (16,'KRYSTEL',1),(21,'KARL',1),(30,'LEFT',0)`);
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, teacher_id TEXT, source TEXT, status TEXT, updated_at INTEGER)`);
  db.exec(`INSERT INTO class_schedules VALUES (4385,'jeong',${schedDate === null ? 'NULL' : `'${schedDate}'`},'16:00',20,'16',${schedSource ? `'${schedSource}'` : 'NULL'},'active',0)`);
  db.exec(`CREATE TABLE admin_scope (username TEXT, scope_type TEXT)`);
  if (scope) db.prepare(`INSERT INTO admin_scope VALUES ('boss', ?)`).run(scope);
  const wrap = sql => { const st = db.prepare(sql); const ex = a => ({ first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }), run: async () => { const r = st.run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }); return Object.assign(ex([]), { bind: (...a) => ex(a) }); };
  /* D1 batch = 한 트랜잭션 — 하나라도 실패하면 전부 되돌린다(그 성질까지 흉내낸다). */
  const batch = async stmts => { db.exec('BEGIN'); try { const out = []; for (const x of stmts) out.push(await x.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const env = { DB: { prepare: wrap, exec: async q => db.exec(q), batch } };
  await ensureScheduleChangeRequestTable(env);
  const r = Object.assign({ schedule_id: 4385, request_type: 'postpone', teacher_name: 'KRYSTEL', student_name: '정우영', orig_date: '2026-10-01', orig_time: '16:00', new_date: '2026-10-01', new_time: '16:00', status: 'pending', created_at: 1 }, reqRow);
  r.schedule_snapshot = scheduleMoveVersion(db.prepare('SELECT * FROM class_schedules WHERE id=4385').get());
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO schedule_change_requests (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(k => r[k]));
  const audits = []; const confCalls = [];
  const deps = {
    scheduleMoveVersion, ...atomicModule,
    findScheduleMoveConflicts: async () => null, // Strict availability is exercised through the full Worker lifecycle harness.
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

/* ── ②-4 📅 «날짜로 연기» 시간칸 — GET /api/class/schedule/day-slots + 정본 daySlotsFor ── */
console.log('\n②-4 날짜로 연기 시간칸');
{
  const { res, seen } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=' + plus(1), path: '/api/class/schedule/day-slots' });
  ok('day-slots 는 시각 없이 200 + 칸 목록', res.status === 200 && res.body.ok === true && Array.isArray(res.body.slots) && res.body.slots.length === 1, res);
  ok('day-slots 는 daySlotsFor 만 부른다(moveCandidatesFor 는 안 부름)', seen.length === 1 && seen[0].slots === true && Number(seen[0].row.id) === 4385, seen);
}
{
  const { res } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=' + plus(1) });
  ok('free-teachers 는 여전히 시각이 없으면 400(짝)', res.status === 400 && res.body.error === 'bad_params', res);
}
{
  const { res, seen } = await callFt({ tok: 'jeong', qs: 'schedule_id=9000&date=' + plus(1), path: '/api/class/schedule/day-slots' });
  ok('day-slots 도 남의 수업은 403 · 정본 안 부름', res.status === 403 && seen.length === 0, res);
}
{
  const { res, seen } = await callFt({ tok: null, qs: 'schedule_id=4385&date=' + plus(1), path: '/api/class/schedule/day-slots' });
  ok('day-slots 도 토큰 없으면 401', res.status === 401 && seen.length === 0, res);
}
{
  const { res } = await callFt({ tok: 'jeong', qs: 'schedule_id=4385&date=' + plus(1), path: '/api/class/schedule/day-slots', ds: 'throw' });
  ok('day-slots 정본이 실패하면 «빈 칸» 이 아니라 500', res.status === 500 && res.body.ok === false, res);
}

/* 정본 daySlotsFor 를 진짜 SQLite 에서 돌린다 — 겹침 판정은 schedule-conflict.ts 를 그대로 트랜스파일해 쓴다. */
function fnText(src, name) {
  const re = new RegExp('(export\\s+)?(async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(src); if (!m) return '';
  /* ⚠️ TS 반환 타입(Promise<Map<string, { … }[]>>) 안의 «{» 를 몸통으로 잡지 않게 — 괄호·꺾쇠 깊이 0 인 첫 «{» 부터(CLAUDE.md 2장). */
  const start = m.index; let o = -1;
  for (let k = m.index + m[0].length - 1, pd = 0, ad = 0; k < src.length; k++) {
    const c = src[k];
    if (c === '(') pd++; else if (c === ')') pd--; else if (c === '<') ad++; else if (c === '>' && src[k - 1] !== '=') ad--;
    else if (c === '{' && pd === 0 && ad === 0) { o = k; break; }
  }
  if (o < 0) return '';
  let d = 0; for (let k = o; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(start, k + 1); } }
  return '';
}
let daySlotsForReal = null;
try {
  if (!tsMod) throw new Error('typescript 없음');
  const cjs = (code) => tsMod.transpileModule(code, { compilerOptions: { target: 99, module: 1 } }).outputText;
  const load = (code, req) => { const exports = {}; new Function('exports', 'require', cjs(code))(exports, req); return exports; };
  const cp = load(SRC('src/class-policy.ts'), () => ({}));
  const sc = load(SRC('src/schedule-conflict.ts'), () => cp);
  const eo = SRC('src/enroll-ops.ts');
  const dst = eo.slice(eo.indexOf('export const DAY_SLOT_TIMES'), eo.indexOf('})();', eo.indexOf('export const DAY_SLOT_TIMES')) + 5);
  const parts = ['enrollTimeToMin', 'enrollOverlap', 'subOverlayBusyIds', 'subOverlayHasOverlap', 'unavailabilityRows', 'teachersOffAt', 'daySlotsFor'].map((n) => fnText(eo, n));
  ok('정본 조각을 전부 오려 냈다', parts.every(Boolean) && dst.length > 50, parts.map((x) => x.length));
  const code = "const { findScheduleConflicts, activeRowsFor, findLongClassCapBlock } = require('./schedule-conflict');\nconst DEFAULT_CLASS_MINUTES = " + cp.DEFAULT_CLASS_MINUTES + ';\n' + dst + '\n' + parts.join('\n') + '\nexports.daySlotsFor = daySlotsFor;';
  /* activeRowsFor·findScheduleConflicts 는 schedule-conflict 정본 그대로 */
  daySlotsForReal = load(code.replace(/export /g, ''), () => sc).daySlotsFor;
} catch (e) { ok('정본 조각 불러오기', false, e.message); }
ok('정본 daySlotsFor 를 불러왔다', typeof daySlotsForReal === 'function');
if (daySlotsForReal) {
  const D = '2099-10-05';   // 월요일
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, day_of_week TEXT, scheduled_date TEXT, start_time TEXT, duration_min INTEGER, teacher_id TEXT, status TEXT, schedule_kind TEXT)`);
  db.exec(`CREATE TABLE class_substitutions (schedule_id INTEGER, substitute_teacher_id TEXT, status TEXT, sub_date TEXT)`);
  db.exec(`CREATE TABLE teacher_unavailability (teacher_id TEXT, kind TEXT, start_date TEXT, end_date TEXT, day_of_week INTEGER, start_time TEXT, end_time TEXT)`);
  db.exec(`INSERT INTO class_schedules VALUES
    (100,'jeong',NULL,'${D}','11:00',20,'16','active','one_off'),
    (101,'jeong',NULL,'${D}','10:00',20,'21','active','one_off'),
    (102,'kim',NULL,'${D}','14:10',20,'16','active','one_off'),   -- 같은 시각·같은 길이는 «합반» 으로 보는 정본 규칙이라 어긋나게 둔다
    (103,'lee',NULL,'${D}','20:00',20,'29','active','one_off'),
    (104,'lms',NULL,'${D}','21:00',20,'16','active','one_off'),
    (105,'park',NULL,'${D}','15:00',20,'16','cancelled','one_off')`);
  db.exec(`INSERT INTO class_substitutions VALUES (103,'16','active','${D}')`);
  db.exec(`INSERT INTO teacher_unavailability VALUES ('16','weekly',NULL,NULL,1,'18:00','19:00')`);
  const wrapQ = (sql) => { const st = db.prepare(sql); const ex = (a) => ({ first: async () => st.get(...a) || null, all: async () => ({ results: st.all(...a) }) }); return Object.assign(ex([]), { bind: (...a) => ex(a) }); };
  const env = { DB: { prepare: wrapQ } };
  const row = { id: 100, user_id: 'jeong', teacher_id: '16', dm: 20, scheduled_date: D };
  let out = null; try { out = await daySlotsForReal(env, row, D, Date.parse('2099-10-01T00:00:00Z')); } catch (e) { ok('정본 실행', false, e.message); }
  const at = (t) => out && out.slots.find((x) => x.t === t);
  ok('칸은 09:00~22:40 20분 칸(42개)', !!out && out.slots.length === 42 && out.slots[0].t === '09:00' && out.slots[41].t === '22:40', out && out.slots.length);
  ok('내 다른 수업(10:00)과 겹치는 칸은 student_busy', at('10:00')?.student_busy === true);
  ok('겹치지 않는 옆 칸(10:20·09:40)은 student_busy 아님(짝)', at('10:20')?.student_busy === false && at('09:40')?.student_busy === false);
  ok('옮기는 그 수업 자신(11:00)은 겹침으로 안 센다', at('11:00')?.student_busy === false && at('11:00')?.teacher_free === true);
  ok('지금 선생님이 다른 학생 수업 중(14:10~14:30)이면 걸치는 칸(14:00·14:20)은 teacher_free 아님', at('14:00')?.teacher_free === false && at('14:20')?.teacher_free === false);
  ok('그 옆 칸(13:40·14:40)은 teacher_free(짝)', at('13:40')?.teacher_free === true && at('14:40')?.teacher_free === true);
  ok('내 다른 수업의 강사(21번) 시간은 지금 선생님과 무관', at('10:00')?.teacher_free === true);
  ok('근무 불가(월 18:00~19:00) 칸은 teacher_free 아님', ['18:00', '18:20', '18:40'].every((t) => at(t)?.teacher_free === false) && at('19:00')?.teacher_free === true);
  ok('대체 수업 중(20:00)이면 teacher_free 아님', at('20:00')?.teacher_free === false && at('20:20')?.teacher_free === true);
  ok('LMS 자리표시(21:00)·취소된 수업(15:00)은 막지 않는다', at('21:00')?.teacher_free === true && at('15:00')?.teacher_free === true);
  ok('다른 날이면 past 없음', !!out && out.slots.every((x) => x.past === false));
  let out2 = null; try { out2 = await daySlotsForReal(env, row, D, Date.parse(D + 'T12:10:00+09:00')); } catch (e) { ok('정본 실행(오늘)', false, e.message); }
  const at2 = (t) => out2 && out2.slots.find((x) => x.t === t);
  ok('오늘이면 지났거나 30분 안에 시작하는 칸은 past(12:20)', at2('12:20')?.past === true && at2('09:00')?.past === true);
  ok('30분 뒤 칸(12:40)은 past 아님(짝)', at2('12:40')?.past === false);

  /* 🪑 긴 수업(40분): 하루 정원은 «강사·날짜» 로만 정해진다 — 칸마다 D1 을 다시 묻지 않는다(2026-09-30 함정 대조). */
  db.exec(`CREATE TABLE teacher_pricing (teacher_id TEXT, long_class_daily_cap INTEGER)`);
  db.exec(`INSERT INTO class_schedules VALUES (106,'choi',NULL,'${D}','07:00',40,'16','active','one_off')`);
  let q = 0;
  const envC = { DB: { prepare: (sql) => { q++; return wrapQ(sql); } } };
  const long = { ...row, dm: 40 };
  let o3 = null; try { o3 = await daySlotsForReal(envC, long, D, Date.parse('2099-10-01T00:00:00Z')); } catch (e) { ok('정본 실행(긴 수업·정원 없음)', false, e.message); }
  ok('긴 수업이어도 D1 조회 수가 칸 수와 무관(≤ 8번)', q <= 8, q);
  ok('정원 없음(0)이면 막지 않는다 — 13:00 은 teacher_free', o3?.slots.find((x) => x.t === '13:00')?.teacher_free === true);
  db.exec(`INSERT INTO teacher_pricing VALUES ('16', 1)`);
  q = 0;
  let o4 = null; try { o4 = await daySlotsForReal(envC, long, D, Date.parse('2099-10-01T00:00:00Z')); } catch (e) { ok('정본 실행(긴 수업·정원 1)', false, e.message); }
  ok('정원(1)을 이미 채웠으면 지금 선생님은 어느 칸도 teacher_free 아님', !!o4 && o4.slots.every((x) => x.teacher_free === false), o4 && o4.slots.filter((x) => x.teacher_free).map((x) => x.t));
  ok('정원 검사도 한 번만(≤ 10번)', q <= 10, q);
  ok('정원은 학생 쪽 판정과 무관(13:00 student_busy 아님)', o4?.slots.find((x) => x.t === '13:00')?.student_busy === false);
}

/* ── ②-dup 중복 요청 (2026-10-01 jeong 대기 8건) ── */
console.log('\n②-dup 같은 수업·회차 중복');
{
  const pay = { schedule_id: 849, request_type: 'postpone', orig_date: plus(1), new_date: plus(8), new_time: '19:20' };
  const seed = async (env, db) => { await ensureScheduleChangeRequestTable(env);
    db.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_uid, orig_date, status, created_at) VALUES (849,'postpone','student','jeong',?, 'pending', 1)`).run(plus(1)); };
  const a = await call({ tok: 'jeong', payload: pay, pre: seed });
  ok('대기 중 요청이 있으면 409 · 새 행 없음', a.res.status === 409 && a.res.body.error === 'already_pending' && a.rows.length === 1, a.res);
  const seedOther = async (env, db) => { await ensureScheduleChangeRequestTable(env);
    db.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_uid, orig_date, status, created_at) VALUES (849,'postpone','student','jeong',?, 'pending', 1)`).run(plus(2)); };
  const b = await call({ tok: 'jeong', payload: pay, pre: seedOther });
  ok('다른 회차(날짜)의 대기 요청은 막지 않는다(짝)', b.res.status === 200 && b.rows.length === 2, b.res);
  const seedDone = async (env, db) => { await ensureScheduleChangeRequestTable(env);
    db.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_uid, orig_date, status, created_at) VALUES (849,'postpone','student','jeong',?, 'rejected', 1)`).run(plus(1)); };
  const c = await call({ tok: 'jeong', payload: pay, pre: seedDone });
  ok('반려된 요청이 있으면 다시 보낼 수 있다(짝)', c.res.status === 200 && c.rows.length === 2, c.res);
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
ok('중복 요청(already_pending)을 사람 말로 말한다', /already_pending/.test(page) && /기다리는 중/.test(page));

/* ③-2 «고른 수업만» 보낸다 (2026-10-01 jeong — 하루만 미루려 했는데 4건 전부 요청됨) */
console.log('\n③-2 고른 수업만 요청');
const pairsSrc = page.slice(page.indexOf('function __mobPairs('), page.indexOf('function __mobPickedOrigs('));
ok('__mobPairs 를 오려 냈다', pairsSrc.length > 100);
let pairs = null; try { pairs = new Function(pairsSrc + '\nreturn __mobPairs;')(); } catch (e) { ok('__mobPairs 실행', false, e.message); }
const origs = [{ date: '2026-10-01' }, { date: '2026-10-02' }, { date: '2026-10-06' }, { date: '2026-10-07' }];
const run = (cart) => { try { const s = cart.slice().sort((a, b) => (a.date + a.hour) < (b.date + b.hour) ? -1 : 1); return pairs(s, origs, s.filter(c => c.origIdx == null)); } catch (e) { return 'THREW ' + e.message; } };
const one = run([{ date: '2026-10-08', hour: '19:20', origIdx: 0 }]);
ok('하나만 담으면 요청도 하나(그 수업만)', Array.isArray(one) && one.length === 1 && one[0].o.date === '2026-10-01', one);
const mid = run([{ date: '2026-10-09', hour: '19:20', origIdx: 1 }]);
ok('둘째 수업만 담으면 둘째만', Array.isArray(mid) && mid.length === 1 && mid[0].o.date === '2026-10-02', mid);
const all = run(origs.map((o, i) => ({ date: '2026-10-1' + i, hour: '19:20', origIdx: i })));
ok('넷을 다 담으면 넷 다(짝)', Array.isArray(all) && all.length === 4, all);
ok('아무것도 안 담으면 0', Array.isArray(run([])) && run([]).length === 0);
const persistCode = code;
ok('저장이 __mobPairs 결과만 보낸다(현재 수업 전부를 돌지 않는다)', /__mobPairs\(/.test(persistCode) && /pairs\.map\(/.test(persistCode) && !/origs\.map\(/.test(persistCode));
const sticky = blockAt(page, page.indexOf('function updateSticky(){')).replace(/\/\*[\s\S]*?\*\//g, '');
ok('실제 수업은 1개부터 완료 가능', /__MOB_REAL \? state\.cart\.length >= 1/.test(sticky));
const confirmB = blockAt(page, page.indexOf('function onConfirm(){'));
ok('확정도 실제 수업은 담은 수를 강요하지 않는다', /!__MOB_REAL && state\.cart\.length < state\.weeklyTarget/.test(confirmB));
const push = blockAt(page, page.indexOf('function pushBackAll(){'));
const pushReal = blockAt(push, push.indexOf('if (__MOB_REAL)'));
ok('«한 주 뒤로» 는 실제 수업에서 고른 하나만 담는다(전부 map 하지 않음)', /state\.cart\.push\(/.test(pushReal) && !/CURRENT_SCHEDULE\.map\(/.test(pushReal), pushReal.slice(0, 200));
const done = blockAt(page, page.indexOf('function showCompletion('));
ok('완료 화면의 «기존» 도 고른 수업만', /__mobPickedOrigs\(\)/.test(done) && /beforeSrc\.forEach/.test(done));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
