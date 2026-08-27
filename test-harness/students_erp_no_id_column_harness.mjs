// 🔎 students_erp 에 없는 컬럼 `id` 참조 감시 — 2026-08-27
//
// [무엇이 문제였나]
//   `students_erp` 는 `user_id TEXT PRIMARY KEY` 이고 **`id` 컬럼이 없다.**
//   그런데 소스 10곳이 `('stu_' || id)` 처럼 `id` 를 참조하고 있었다. 전부
//   `no such column: id` 로 죽는데 대부분 try/catch 안이라 **조용히 무동작**이었다.
//   2026-08-27 실사고: /api/class/sessions/today 의 «이름으로 계정 찾기» 구제가
//   이 형태로 죽어 있어, 학생이 아이디를 쳐도 예약을 못 찾고 공용방으로 흘렀다.
//
// [왜 문자열 검사만으로는 모자란가]
//   「그 함수를 부르는가」는 전부 초록이다 — SQL 은 «있고» 호출도 «된다». 죽는 것은 실행뿐이다.
//   그래서 운영과 같은 스키마(=id 컬럼 없음)의 진짜 SQLite 에 **실제로 돌려서** 판정한다.
//
// 실행: node test-harness/students_erp_no_id_column_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)'); process.exit(0); }

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(resolve(__dir, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};
// ⚠️ 부정 검사는 반드시 주석을 벗긴 사본으로 — 「왜 죽었나」 설명 주석이 그 패턴을 담는다(CLAUDE.md 2장)
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ══ ① 전제: students_erp 에는 id 컬럼이 없다 (운영 D1 2026-08-27 pragma 실측과 같은 모양) ══ */
console.log('\n① 전제 — students_erp 스키마에 id 컬럼이 없다');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, english_name TEXT,
  username TEXT, login_id TEXT, student_id TEXT, student_name TEXT, level TEXT, textbook TEXT, status TEXT)`);
db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT)`);
db.exec(`INSERT INTO students_erp (user_id, korean_name, username, login_id) VALUES ('heyst','김사랑','김사랑','heyst')`);
const cols = db.prepare(`SELECT name FROM pragma_table_info('students_erp')`).all().map(r => r.name);
check('students_erp 에 id 컬럼이 없다', !cols.includes('id'), cols);
const dies = (sql, ...b) => { try { db.prepare(sql).all(...b); return false; } catch (e) { return /no such column: id/.test(String(e)); } };
check("('stu_' || id) 를 쓰면 실제로 죽는다 (이 버그의 정체)",
  dies(`SELECT COALESCE(user_id, login_id, ('stu_' || id)) AS uid FROM students_erp WHERE korean_name = ?`, '김사랑'));

/* ══ ② 소스에 남은 id 참조 — ALLOW 를 뺀 나머지는 0건이어야 한다 ═════════════════ */
console.log('\n② 소스에서 students_erp SQL 의 id 참조 (주석 제외)');
// 일부러 고치지 않은 곳 — 근거를 여기 적는다. 근거 없이 늘리지 말 것.
const ALLOW = [
  { key: 'korean_name, username, signup_date', why: 'merge-duplicates: 되살리면 실제 학생 계정을 병합한다(운영 D1, 되돌릴 수 없음). rowid 전환 + dry_run 2단계가 함께 필요 — 사장님 판단 별건' },
  { key: `UPDATE students_erp SET status = '병합됨' WHERE id = ?`, why: 'merge-duplicates 의 실행부 — 위 항목과 한 몸(같은 API)' },
  { key: `COALESCE(status,'정상') IN ('정상','활동','active') ORDER BY rowid DESC`, why: 'seed-demo: 되살리면 class_schedules 에 시드 자리표시가 다시 생긴다(6월 시드 140행이 배정을 막던 사고 이력)' },
  { key: `WHERE COALESCE(user_id, login_id) = ? OR ('stu_' || id) = ? LIMIT 1`, why: 'seed-demo 의 학생 이름 조회 — 위 항목과 한 몸' },
];
/* ⚠️ 검사는 «사고의 형태» 로 좁힌다 — `students_erp` 가 들어간 SQL 전체에서 bare `id` 를 찾으면
   같은 문장 안의 **다른 테이블** id(class_schedules.id 등)까지 잡아 거짓 FAIL 이 난다(실제로 밟음).
   실사고 형태는 둘뿐이다: ① 'stu_' 접두 조립 ② students_erp 를 직접 UPDATE/DELETE 하며 WHERE id. */
const BAD = [
  { re: /'stu_(?:id_)?'\s*\|\|\s*id/, what: "'stu_' || id 조립" },
  { re: /(?:UPDATE|DELETE\s+FROM)\s+students_erp[\s\S]*?\bWHERE\s+id\b/i, what: 'students_erp 를 WHERE id 로 직접 변경' },
];
const FILES = ['api-admin.ts', 'api-mango.ts', 'api-students.ts', 'api-teacher.ts', 'api-lessons.ts', 'api-games.ts', 'index.ts', 'cafe24-sync.ts', 'student-override.ts'];
let leftover = [];
for (const f of FILES) {
  let src = ''; try { src = strip(rd('../cloudflare-deploy/src/' + f)); } catch { continue; }
  for (const m of src.matchAll(/`([^`]*students_erp[^`]*)`/g)) {
    const sql = m[1];
    if (/CREATE\s+TABLE/i.test(sql)) continue;                 // 스키마 정의는 아래 ⑤에서 따로 본다
    const hit = BAD.find(b => b.re.test(sql));
    if (!hit) continue;
    if (ALLOW.some(a => sql.includes(a.key))) continue;
    leftover.push(f + ' [' + hit.what + ']: ' + sql.replace(/\s+/g, ' ').slice(0, 80));
  }
}
check('ALLOW 를 뺀 곳에 students_erp 의 id 참조가 없다', leftover.length === 0, leftover);
check('ALLOW 는 근거가 적힌 4건뿐이다 (근거 없이 늘리지 말 것)', ALLOW.length === 4 && ALLOW.every(a => a.why.length > 20));

/* ══ ③ 2026-08-27 에 고친 SQL 들이 실제로 돈다 (컴파일이 아니라 실행으로) ═════════ */
console.log('\n③ 고친 SQL 을 진짜 SQLite 에 돌려 본다');
const runs = (label, sql, ...b) => {
  try { db.prepare(sql).all(...b); check(label, true); }
  catch (e) { check(label, false, String(e).slice(0, 120)); }
};
runs('verify-room · POST class-schedules — 이름으로 uid',
  `SELECT COALESCE(user_id, login_id) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`, '김사랑', '김사랑');
runs('GET class-schedules — uid 로 이름 (바인드 2개)',
  `SELECT COALESCE(korean_name, username) AS name FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`, 'heyst', 'heyst');
runs('GET class-schedules — 이름 서브쿼리(상관 서브쿼리가 아니어야 한다)',
  `SELECT id FROM class_schedules WHERE (user_id IN (SELECT COALESCE(user_id, login_id) FROM students_erp WHERE korean_name = ? OR username = ?) OR student_name = ?)`, '김사랑', '김사랑', '김사랑');
runs('bulk-assign-textbook — 이력 INSERT 의 SELECT 부분',
  `SELECT COALESCE(user_id, login_id), ?, ?, ?, 'active', ? FROM students_erp WHERE 1=1`, 't', 'l', 1, 1);

/* ══ ④ 되돌림 방지 — 고친 자리에 옛 패턴이 다시 들어오면 ②가 잡는다(그 전제 확인) ══ */
console.log('\n④ 소스가 실제로 고쳐진 상태인가');
const adm = strip(rd('../cloudflare-deploy/src/api-admin.ts'));
const mango = strip(rd('../cloudflare-deploy/src/api-mango.ts'));
check('verify-room 이 COALESCE(user_id, login_id) 를 쓴다',
  /SELECT COALESCE\(user_id, login_id\) AS uid FROM students_erp WHERE korean_name = \? OR username = \?/.test(mango));
check('POST class-schedules 는 «유일할 때만» 채택한다 (LIMIT 1 로 아무나 집지 않는다)',
  /uids\.length === 1/.test(adm) && !/AS uid FROM students_erp WHERE korean_name = \? OR username = \? LIMIT 1/.test(adm));
check('SAME_NAME_UIDS 서브쿼리에서 id 가 빠졌다 (상관 서브쿼리 해소)',
  /const SAME_NAME_UIDS =\s*`SELECT COALESCE\(user_id, login_id\) FROM students_erp/.test(adm));

/* ══ ⑤ 왜 이 사고가 났나 — 코드의 CREATE 와 «운영 실물» 이 다르다 ═══════════════ */
console.log('\n⑤ 코드의 CREATE TABLE 과 운영 실물의 불일치 (이 버그의 뿌리)');
const createHasId = /CREATE TABLE IF NOT EXISTS students_erp\s*\(\s*id INTEGER PRIMARY KEY AUTOINCREMENT/.test(mango);
check('코드의 CREATE TABLE students_erp 에는 id 가 있다 (그래서 «있겠거니» 하고 쓴 것)', createHasId);
console.log('     ↳ 운영 D1 실물에는 id 가 없다(2026-08-27 pragma 실측) — 그 표는 이 CREATE 로 만들어지지');
console.log('       않았다. 그래서 id 를 쓰는 SQL 이 «새 DB 에서는 돌고 운영에서만 죽는» 상태가 된다.');
console.log('       ⛔ CREATE 를 고쳐서 맞추려 하지 말 것 — 운영 표는 그대로이고 새 환경만 바뀐다.');
console.log('       ✅ 읽는 쪽에서 id 를 안 쓰는 것이 정본(user_id / login_id / rowid).');

console.log('\n====================================================');
console.log(`🎯 총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패 항목:'); FAILS.forEach(f => console.log('  - ' + f)); }
else console.log('🎉 students_erp id 컬럼 참조 감시 전부 통과');
console.log('====================================================');
process.exit(FAIL ? 1 : 0);
