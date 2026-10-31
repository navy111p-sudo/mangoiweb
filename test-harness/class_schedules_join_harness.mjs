// 🔎 GET /api/admin/class-schedules 의 teachers JOIN 감시 — 2026-09-11
//
// [무엇이 문제였나]
//   `teachers` 표에는 **`status` 와 `user_id` 가 둘 다 있다**(운영 실측 스키마).
//   그런데 이 핸들러의 WHERE 절이 `status != 'cancelled'` · `user_id = ?` 처럼
//   접두사 없이 쓰고 있어서, JOIN 을 붙이는 순간
//       ambiguous column name: status  (SQLITE_ERROR)
//   로 sqlWithJoin 이 통째로 죽었다. 그러면 catch 가 «JOIN 없는» 폴백으로
//   떨어뜨려 `teacher_name` 칸이 응답에서 사라지고, 학생 상세 화면은
//   «번호는 있는데 이름이 없다» 로 읽어 모든 예약을 「강사 미확인」으로 그린다.
//   2026-09-11 실사고 — 예약 1,262건 전부가 그 상태였다.
//   ⚠️ 세는 기준을 함께 적는다: `status != 'cancelled'` · 2026-09-11 17시(KST) 운영 D1.
//      admin/student.html 주석의 1,263건은 같은 날 조금 다른 시각의 실측이다 — 그 사이
//      예약이 하나 늘거나 취소되면 어긋난다. 숫자만 적고 기준을 안 적으면 다음 사람이
//      «둘 중 뭐가 맞지» 로 시간을 쓴다(CLAUDE.md 「잰 것과 판단을 줄을 나눠 적으세요」).
//   WHERE 첫 줄이 언제나 status 조건이라 **이 JOIN 은 한 번도 성공한 적이 없다.**
//
// [왜 문자열 검사만으로는 모자란가]
//   SQL 은 «있고» 호출도 «된다». 죽는 것은 실행뿐이고, 폴백이 그것을 삼킨다.
//   그래서 소스에서 두 SQL 을 **오려 내** 운영과 같은 스키마의 진짜 SQLite 에
//   실제로 prepare·실행해서 판정한다.
//
// 실행: node test-harness/class_schedules_join_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)'); process.exit(0); }

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-admin.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 (CLAUDE.md — 길이로 자르지 말 것) */
function blockFrom(text, openIdx) {
  let d = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '{') d++;
    else if (text[i] === '}') { d--; if (d === 0) return text.slice(openIdx, i + 1); }
  }
  return '';
}
/** `(` 부터 짝이 맞는 `)` 까지의 «인자» 만 */
function argsFrom(text, openParen) {
  let d = 0;
  for (let i = openParen; i < text.length; i++) {
    if (text[i] === '(') d++;
    else if (text[i] === ')') { d--; if (d === 0) return text.slice(openParen + 1, i); }
  }
  return '';
}

/* ══ ① 전제 — teachers 에 status·user_id 가 둘 다 있어야 이 검사가 뜻을 가진다 ══
   ⛔ 그 DDL 을 여기 «베껴 적지» 말 것 — 하니스가 자기가 적은 상수를 검사하게 되어,
      정본이 바뀌어도 조용히 초록이 된다(CLAUDE.md 2장 「자기가 새로 만든 상수를 잡아 통과」).
      정본은 api-admin.ts 의 ensurePayrollSchema — CREATE 와 멱등 ALTER 를 «읽어서» 쓴다. */
console.log('\n① 전제 — teachers 스키마를 정본에서 읽는다 (status·user_id 가 둘 다 있다)');
/** 소스의 `await env.DB.exec([ `CREATE TABLE …` , … ].join(' '))` 조각을 이어 붙여 DDL 을 복원 */
function ddlFromSource(src, table) {
  const at = src.indexOf('`CREATE TABLE IF NOT EXISTS ' + table + ' (`');
  if (at < 0) return '';
  const end = src.indexOf("].join(' ')", at);
  if (end < 0) return '';
  return (src.slice(at, end).match(/`[^`]*`/g) || []).map((x) => x.slice(1, -1)).join(' ');
}
const DDL_TEACHERS = ddlFromSource(SRC, 'teachers');
check('teachers DDL 을 정본(api-admin.ts)에서 읽었다', /CREATE TABLE IF NOT EXISTS teachers/.test(DDL_TEACHERS), DDL_TEACHERS.slice(0, 60));
// 기존 DB 에 컬럼이 없을 때 붙는 멱등 ALTER 도 정본에서 읽어 함께 적용한다(운영 DB 가 그 모양)
const ALTERS = (SRC.match(/`ALTER TABLE teachers ADD COLUMN [^`]*`/g) || []).map((x) => x.slice(1, -1));
const DDL_SCHEDULES = `CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
  student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular',
  day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30,
  teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL,
  updated_at INTEGER, notes TEXT)`;
const DDL_STUDENTS = `CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, english_name TEXT,
  username TEXT, login_id TEXT, student_name TEXT, status TEXT)`;
const db = new DatabaseSync(':memory:');
db.exec(DDL_TEACHERS); db.exec(DDL_SCHEDULES); db.exec(DDL_STUDENTS);
for (const a of ALTERS) { try { db.exec(a); } catch { /* duplicate column — 정상 */ } }
// «적혀 있는가» 가 아니라 «실제로 만들어진 표에 있는가» 로 묻는다
const tCols = db.prepare('SELECT name FROM pragma_table_info(?)').all('teachers').map((r) => r.name);
check('teachers 에 status 컬럼이 있다 (이게 없으면 아래 검사가 뜻을 잃는다)', tCols.includes('status'), tCols);
check('teachers 에 user_id 컬럼이 있다 — class_schedules 와 겹치는 두 칸', tCols.includes('user_id'), tCols);
// ⚠️ status 는 여기서 «쓰지» 않는다 — 정본 DDL 에서 그 칸이 사라지는 변이를 넣었을 때
//    씨앗 INSERT 가 먼저 던지면 하니스가 크래시해 «무엇이 깨졌는지» 가 안 보인다(깔끔한 FAIL 로).
db.exec(`INSERT INTO teachers (id, name, active, created_at, updated_at) VALUES (29,'중국어 강선생님',1,1,1)`);
db.exec(`INSERT INTO students_erp (user_id, korean_name, username, login_id) VALUES ('jeong','정우영','정우영','jeong')`);
// 실사고와 같은 모양: 원부에 있는 번호(29) / 원부에 없는 번호(999) — «짝» 으로 둔다
db.exec(`INSERT INTO class_schedules (id,user_id,student_name,schedule_kind,day_of_week,start_time,teacher_id,status,created_at)
         VALUES (848,'jeong','정우영','recurring','tue','19:20','29','active',1)`);
db.exec(`INSERT INTO class_schedules (id,user_id,student_name,schedule_kind,scheduled_date,start_time,teacher_id,status,created_at)
         VALUES (2333,'jeong','정우영','dated','2026-09-18','14:20','29','active',1)`);
db.exec(`INSERT INTO class_schedules (id,user_id,student_name,schedule_kind,day_of_week,start_time,teacher_id,status,created_at)
         VALUES (900,'jeong','정우영','recurring','mon','10:00','999','active',1)`);

/* ══ ② 소스에서 그 핸들러를 오려 낸다 ══ */
console.log('\n② 소스에서 GET /api/admin/class-schedules 핸들러를 오려 낸다');
const anchor = SRC.indexOf(`if (method === 'GET' && path === '/api/admin/class-schedules') {`);
check('핸들러 앵커를 찾았다', anchor >= 0);
const BLK = anchor >= 0 ? blockFrom(SRC, SRC.indexOf('{', anchor)) : '';
check('핸들러 블록을 중괄호 짝으로 잘라 냈다 (전제 — 비면 아래가 조용히 통과한다)', BLK.length > 500, BLK.length);

// SAME_NAME_UIDS 상수 값을 «소스에서 읽어» 쓴다 (하니스에 베끼면 정본이 바뀔 때 헛돈다)
const mSame = BLK.match(/const SAME_NAME_UIDS\s*=\s*([\s\S]*?);/);
check('SAME_NAME_UIDS 상수를 소스에서 읽었다', !!mSame);
const SAME_NAME_UIDS = mSame ? new Function('return ' + mSame[1])() : '';

// where 초기값
const mInit = BLK.match(/const where: string\[\]\s*=\s*(\[[\s\S]*?\]);/);
check('where 초기값을 소스에서 읽었다', !!mInit);
const whereInit = mInit ? new Function('return ' + mInit[1])() : [];

// where.push(...) 인자 전부 (괄호 짝으로 — 주석·여러 줄 대응)
const pushArgs = [];
for (let i = 0; ; ) {
  const at = BLK.indexOf('where.push(', i);
  if (at < 0) break;
  const raw = argsFrom(BLK, at + 'where.push'.length);
  try { pushArgs.push(new Function('SAME_NAME_UIDS', 'return (' + raw + ')')(SAME_NAME_UIDS)); }
  catch { pushArgs.push('<평가실패>'); }
  i = at + 1;
}
check('where.push 조건을 전부 뽑았다 (실측 8개)', pushArgs.length >= 6, pushArgs.length);
check('평가하지 못한 조건이 없다', !pushArgs.includes('<평가실패>'), pushArgs);

// 두 SQL 템플릿
const mJoin  = BLK.match(/const sqlWithJoin\s*=\s*(`[\s\S]*?`);/);
const mNo    = BLK.match(/const sqlNoJoin\s*=\s*(`[\s\S]*?`);/);
check('sqlWithJoin 템플릿을 읽었다', !!mJoin);
check('sqlNoJoin 템플릿을 읽었다', !!mNo);
/* 📅 (2026-09-24) SELECT 에 starts_on 조각(_soSel)이 붙었다 — 칸이 없는 DB 에서 쓰는 모양(NULL AS starts_on)
   으로 채워 돈다(정본 src/class-start-date.ts 의 startsOnSel(false)). */
const mkSql = (tmpl, where) => new Function('where', '_soSel', 'return ' + tmpl)(where, ', NULL AS starts_on');

/* ══ ③ 실제 조회 경로 네 가지를 진짜 SQLite 에 돌린다 ══ */
console.log('\n③ 네 가지 조회 경로 — 두 SQL 을 실제로 prepare·실행한다');
const cond = (frag) => pushArgs.find((c) => typeof c === 'string' && c.includes(frag)) || '';
const cUidOnly = pushArgs.find((c) => typeof c === 'string' && /^\S*user_id = \?$/.test(c.trim())) || '';
const cUidName = cond('SAME_NAME_UIDS') || pushArgs.find((c) => typeof c === 'string' && c.includes('OR') && c.includes('IN (SELECT')) || '';
const cNameOnly = pushArgs.filter((c) => typeof c === 'string' && c.includes('IN (SELECT')).pop() || '';
const cFrom = cond('>= ?'), cTo = cond('<= ?'), cKind = cond("schedule_kind = 'recurring'");

const SCEN = [
  { 이름: 'user_id 만 (동명이인이 있어 이름 통합을 안 하는 경로 — 실사고가 난 자리)',
    where: [...whereInit, cUidOnly], binds: ['jeong', 100] },
  { 이름: 'user_id + 이름 통합 (동명이인이 하나뿐일 때)',
    where: [...whereInit, cUidName], binds: ['jeong', '정우영', '정우영', '정우영', 100] },
  { 이름: 'student_name 만',
    where: [...whereInit, cNameOnly], binds: ['정우영', '정우영', '정우영', 100] },
  { 이름: 'user_id + 기간 + 종류(recurring)',
    where: [...whereInit, cUidOnly, cFrom, cTo, cKind], binds: ['jeong', '2026-09-01', '2026-12-31', 100] },
];
for (const s of SCEN) {
  check('조건을 다 찾았다 — ' + s.이름, s.where.every((w) => typeof w === 'string' && w.length > 0), s.where);
  for (const [라벨, tmpl] of [['JOIN', mJoin && mJoin[1]], ['폴백(JOIN 없음)', mNo && mNo[1]]]) {
    if (!tmpl) continue;
    let err = null, rows = [];
    try { rows = db.prepare(mkSql(tmpl, s.where)).all(...s.binds); }
    catch (e) { err = String(e && e.message || e); }
    check(`${라벨} 쿼리가 에러 없이 돈다 — ${s.이름}`, err === null, err);
  }
}

/* ══ ③-2 시나리오를 «고르지 않고» — 모든 조건을 한꺼번에 컴파일한다 ══
   ⚠️ 위 ③은 조회 경로를 손으로 골라 조합한다. 그러면 나중에 where.push 가 하나 늘 때
      그 조건은 검사에 «닿지 않는다». 바인드 없이 prepare 만 하면 컴파일 단계에서
      ambiguous 가 그대로 나므로, 미래에 늘어날 조건까지 한 번에 덮는다. */
console.log('\n③-2 모든 조건을 AND 로 이어 컴파일 — 미래에 늘어날 조건까지 덮는다');
const ALL_CONDS = [...whereInit, ...pushArgs.filter((c) => typeof c === 'string' && c !== '<평가실패>')];
check('이어 붙일 조건이 모두 모였다 (전제)', ALL_CONDS.length >= 7, ALL_CONDS.length);
for (const [라벨, tmpl] of [['JOIN', mJoin && mJoin[1]], ['폴백(JOIN 없음)', mNo && mNo[1]]]) {
  if (!tmpl) continue;
  let err = null;
  try { db.prepare(mkSql(tmpl, ALL_CONDS)); } catch (e) { err = String(e && e.message || e); }
  check(`${라벨} — 모든 조건을 함께 써도 컴파일된다 (ambiguous 없음)`, err === null, err);
}

/* ══ ④ 짝 — «이름이 실제로 실린다» 와 «원부에 없는 번호는 안 지어낸다» ══ */
console.log('\n④ 짝 검사 — 이름이 실리는가 / 없는 번호를 지어내지 않는가');
let joined = [];
try { joined = db.prepare(mkSql(mJoin[1], [...whereInit, cUidOnly])).all('jeong', 100); } catch (e) { joined = []; }
check('JOIN 결과에 teacher_name 칸이 있다 (이게 없으면 화면이 「강사 미확인」을 그린다)',
  joined.length > 0 && Object.prototype.hasOwnProperty.call(joined[0], 'teacher_name'),
  joined[0] ? Object.keys(joined[0]) : null);
const byId = Object.fromEntries(joined.map((r) => [r.id, r.teacher_name]));
check('원부에 있는 번호(29)는 이름이 실린다 — 예약 848', byId[848] === '중국어 강선생님', byId[848]);
check('원부에 있는 번호(29)는 이름이 실린다 — 예약 2333', byId[2333] === '중국어 강선생님', byId[2333]);
check('원부에 «없는» 번호(999)는 이름을 지어내지 않는다 — 예약 900', byId[900] === null || byId[900] === undefined, byId[900]);
check('취소·다른 학생이 섞이지 않는다 (3건)', joined.length === 3, joined.length);

/* ══ ⑤ 서브쿼리 안에는 cs. 를 붙이지 않는다 (2026-08-27 상관 서브쿼리 전수 스캔 방지) ══ */
console.log('\n⑤ 서브쿼리 안(students_erp)에는 cs. 를 붙이지 않는다');
const subs = pushArgs.filter((c) => typeof c === 'string' && c.includes('FROM students_erp'));
check('students_erp 서브쿼리를 쓰는 조건이 있다 (전제)', subs.length >= 1, subs.length);
for (const c of subs) {
  const inner = c.slice(c.indexOf('SELECT'), c.indexOf('FROM students_erp'));
  check('서브쿼리의 SELECT 목록에 cs. 가 없다 — ' + inner.trim().slice(0, 46), !inner.includes('cs.'), inner.trim());
}
/* 🔴 위 글자 검사는 «일반형» 을 못 잡는다 — 서브쿼리의 WHERE 에서 «바깥에만 있는» 컬럼을
      무심코 참조해도 SQLite 는 에러 없이 상관 서브쿼리로 만든다(2026-08-27 실측 4.3초/2,348만 행).
      그래서 실행계획에 CORRELATED 가 뜨는지로 «뜻» 을 묻는다. */
for (const [라벨, tmpl] of [['JOIN', mJoin && mJoin[1]], ['폴백(JOIN 없음)', mNo && mNo[1]]]) {
  if (!tmpl) continue;
  let plan = [], err = null;
  try { plan = db.prepare('EXPLAIN QUERY PLAN ' + mkSql(tmpl, [...whereInit, cUidName]))
                 .all('jeong', '정우영', '정우영', '정우영', 100); }
  catch (e) { err = String(e && e.message || e); }
  const detail = plan.map((r) => r.detail || '').join(' | ');
  check(`${라벨} — 실행계획에 CORRELATED 가 없다 (매 행 전수 스캔 방지)`,
    err === null && !/CORRELATED/i.test(detail), err || detail);
}

/* ══ ⑥ 형제 — api-mango.ts 의 같은 JOIN 도 접두사를 지킨다 ══ */
console.log('\n⑥ 형제 — api-mango.ts 의 같은 JOIN(sessions/today)');
const MANGO = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-mango.ts'), 'utf8');
const mWhereSql = MANGO.match(/const whereSql = `([^`]*)`/);
check('api-mango 의 whereSql 을 읽었다', !!mWhereSql);
check('api-mango 의 status 조건에 cs. 가 붙어 있다', !!mWhereSql && mWhereSql[1].includes('cs.status'), mWhereSql && mWhereSql[1]);

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패 목록:'); FAILS.forEach((f) => console.log('  - ' + f)); process.exit(1); }
