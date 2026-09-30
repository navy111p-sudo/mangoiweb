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
  ok('고른 강사가 원부와 같으면(대소문자 무시) 담당 강사로', rows[0] && rows[0].teacher_name === 'KARL', rows[0]);
  ok('날짜 지정 수업은 수업표 날짜', rows[0] && rows[0].orig_date === '2026-10-01');
}
{
  const { rows } = await call({ tok: 'jeong', payload: { schedule_id: 4385, request_type: 'postpone', new_date: plus(4), new_time: '14:00', teacher_name: 'Teacher Ana' } });
  ok('원부에 없는 강사는 지어내지 않고 사유에 «희망 강사»', rows[0] && rows[0].teacher_name === 'KRYSTEL' && /희망 강사: Teacher Ana/.test(rows[0].reason || ''), rows[0]);
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
