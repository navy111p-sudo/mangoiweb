// 🔎 attendance 를 «학생 계정» 으로 찾는 자리 감시 — 2026-09-21
//
// [무엇이 문제였나]
//   사장님: 「왜 학생아이디 jeong 에는 출결 현황이 없고 각종 자료들이 모두 비어있지?
//            현재까지 중국어 수업을 강선생님과 화수목금 정규수업으로 계속 하고 있었는데」
//   attendance 의 두 칸은 뜻이 다르다 —
//     · user_id     = 화상방이 «접속마다 새로 발급하는» 기기 임시번호 (u_oqipkl162d)
//     · account_uid = 로그인 계정 (jeong)
//   그런데 «학생 한 명» 을 찾는 자리들이 전부 `WHERE user_id = ?` 에 «계정» 을
//   바인딩하고 있었다 ⟹ 실측 0건. 화면은 「출석 0일·출석률 0%」라고 말했지만
//   실제로는 최근 30일 23일·108세션이었다.
//
// [왜 문자열 검사만으로는 모자란가]
//   표도 SQL 도 호출도 전부 «있다». 틀린 것은 «어느 칸을 보는가» 하나뿐이고,
//   조회는 «성공» 하며 0행을 돌려준다. 그래서 정본 조건을 소스에서 **오려 내**
//   진짜 SQLite 에 실제로 돌려 «무슨 행이 잡히는가» 를 답으로 묻는다.
//
// [짝으로 묻는 이유]
//   「계정으로 찾는다」만 보면 «account_uid 만 보게» 바꾸는 변이도 통과한다.
//   그러면 카페24 학생(그 행에는 account_uid 가 없다)의 화면이 통째로 비어
//   지금보다 나빠진다. 그래서 「기기번호 행도 그대로 찾는다」를 짝으로 둔다.
//
// 실행: node test-harness/attendance_account_uid_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)'); process.exit(0); }

const __dir = dirname(fileURLToPath(import.meta.url));
const SRCDIR = resolve(__dir, '../cloudflare-deploy/src');
const read = (f) => readFileSync(resolve(SRCDIR, f), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 주석을 벗긴 사본 — 부정 검사가 «자기 설명 주석» 을 잡는 것을 막는다.
   ⛔ `//` 를 정규식으로 일괄 제거하면 문자열 안의 https:// 가 잘린다.
      글자를 훑으며 «블록 안인가 · 문자열 안인가» 를 함께 추적한다. */
function stripComments(t) {
  let out = '', i = 0, n = t.length;
  let inLine = false, inBlock = false, q = '';
  while (i < n) {
    const c = t[i], d = t[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; } else i++; continue; }
    if (q) { if (c === '\\') { out += c + (d ?? ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* 「FROM attendance」가 있는 자리마다 «그 SQL 조각» 을 잘라 낸다.
   ⛔ 세 가지를 다 시험해 보고 이 방식만 남았다(2026-09-21 변이시험) —
      ① 정규식(/`[^`]*`/)        : 이스케이프·따옴표에서 짝이 밀려 뒤를 통째로 놓침
      ② 줄 창(slice(i-3, i+8))   : 옆 줄이 정본을 쓰면 그 줄에 가려 새 실수를 놓침
      ③ 파일 첫 글자부터 문자열 수집 : 파일 중간의 큰 HTML 템플릿(`${}` 안에 또 따옴표)에서
         짝이 한 번 밀리면 그 «뒤» 가 전부 문자열 밖으로 뒤집혀 놓침
   ⟹ 밀림과 무관하게, 그 자리에서 «가장 가까운 백틱» 까지만 좌우로 넓힌다.
      SQL 안의 'c24-%' 같은 작은따옴표는 백틱 «안» 이라 안 잘린다. */
function sqlAt(src, idx) {
  let a = idx, b = idx;
  while (a > 0 && src[a - 1] !== '`') a--;
  while (b < src.length && src[b] !== '`') b++;
  return src.slice(a, b);
}
function attendanceSqls(src) {
  const out = [];
  for (const m of src.matchAll(/FROM\s+attendance\b/gi)) out.push(sqlAt(src, m.index));
  return out;
}

console.log('\n① 정본 조건을 진짜 SQLite 에 실제로 돌린다');
const CANON = read('attendance-uid.ts');

// 조건 문자열을 «정본에서 오려 낸다» — ⛔ 하니스에 베껴 적지 말 것(정본이 바뀌면 조용히 어긋난다)
const mCond = CANON.match(/return\s+`\(\$\{p\}([a-z_]+)\s*=\s*\?\s*OR\s*\$\{p\}([a-z_]+)\s*=\s*\?\)`/);
check('⓪ 전제 — 정본에서 조건을 오려 냈다', !!mCond, mCond ? [mCond[1], mCond[2]] : CANON.slice(0, 120));
const COND = mCond ? `(${mCond[1]} = ? OR ${mCond[2]} = ?)` : null;

// 바인드 헬퍼도 정본에서 — 개수가 조건의 ? 수와 맞는지 본다
const mBind = CANON.match(/export function attUidBinds\([^)]*\)[^{]*\{([\s\S]*?)\n\}/);
check('⓪ 전제 — 바인드 헬퍼를 오려 냈다', !!mBind);

if (COND) try {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, account_uid TEXT,
    username TEXT, role TEXT, joined_at INTEGER, date TEXT, status TEXT)`);
  // 실제 운영에 있는 세 가지 모양을 그대로 넣는다
  db.exec(`INSERT INTO attendance (room_id,user_id,account_uid,username,joined_at,date,status) VALUES
    ('class-851-20260918','u_oqipkl162d','jeong','jeong',1,'2026-09-18','left'),   -- 망고아이 화상수업(진짜 출석)
    ('c24-111','jcm0424',NULL,'김학생',2,'2026-09-18','present'),                   -- 카페24 예약 씨앗(계정형 user_id)
    ('class-850-20260917','u_zzz','delaware','delaware',3,'2026-09-17','left')`);   // 남의 행

  const q = (uid) => db.prepare(`SELECT room_id FROM attendance WHERE ${COND} ORDER BY joined_at`).all(uid, uid).map(r => r.room_id);

  check('①-1 계정으로 찾는다 (account_uid 에만 있는 행)', JSON.stringify(q('jeong')) === JSON.stringify(['class-851-20260918']), q('jeong'));
  // 🔗 짝 — 이것이 없으면 «account_uid 만 보게» 바꾸는 변이가 통과한다
  check('①-2 짝 — 기기번호 자리에 계정이 든 옛 행(카페24 씨앗)도 그대로 찾는다',
        JSON.stringify(q('jcm0424')) === JSON.stringify(['c24-111']), q('jcm0424'));
  check('①-3 남의 행은 안 찾는다', q('jeong').length === 1 && !q('jeong').includes('class-850-20260917'), q('jeong'));
  check('①-4 없는 계정은 0건', q('nobody').length === 0, q('nobody'));

  /* NOCASE 판도 «실제로» 돌린다 — 상수만 있고 뜻이 틀리면 학생 본인 화면이 조용히 빈다.
     정본에서 오려 내 쓴다(⛔ 하니스에 베껴 적지 말 것). */
  const mNo = CANON.match(/ATTENDANCE_BY_UID_NOCASE\s*=\s*\n?\s*`([^`]+)`/);
  check('①-5 전제 — NOCASE 판을 정본에서 오려 냈다', !!mNo, mNo ? mNo[1] : null);
  if (mNo) {
    /* ⚠️ 반드시 try 로 감쌀 것 — 조건의 ? 개수가 바뀌는 변이는 prepare/실행이 «던져서»
       하니스를 크래시시킨다. 그러면 결과줄조차 안 나와 «무엇이 깨졌는지» 가 안 보이고,
       ❌ 개수로 세는 변이시험이 «0건 = 못 잡음» 으로 읽힌다(2026-09-21 실제로 밟음). */
    const db2 = new DatabaseSync(':memory:');
    try {
      db2.exec(`CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, account_uid TEXT, joined_at INTEGER)`);
      db2.exec(`INSERT INTO attendance (room_id,user_id,account_uid,joined_at) VALUES
        ('class-1','u_aaa','Jeong',1), ('c24-2','JCM0424',NULL,2)`);
      const qn = (uid) => db2.prepare(`SELECT room_id FROM attendance WHERE ${mNo[1]}`).all(uid, uid).map(r => r.room_id);
      check('①-6 NOCASE — 계정을 대소문자 무시하고 찾는다', JSON.stringify(qn('jeong')) === JSON.stringify(['class-1']), qn('jeong'));
      check('①-7 NOCASE 짝 — 기기번호 자리의 옛 행도 그대로', JSON.stringify(qn('jcm0424')) === JSON.stringify(['c24-2']), qn('jcm0424'));
    } catch (e) {
      check('①-6 NOCASE — 조건을 실제로 돌릴 수 있다', false, String(e && e.message || e));
    } finally { db2.close(); }
  }

  // 물음표 개수 == 바인드 개수 (호출부가 개수를 세지 않아도 되게)
  const qmarks = (COND.match(/\?/g) || []).length;
  check('②  조건의 ? 개수와 바인드 개수가 같다 (2)', qmarks === 2, qmarks);
  db.close();
} catch (e) {
  check('①  정본 조건을 실제로 돌릴 수 있다', false, String(e && e.message || e));
}

console.log('\n③ 전수 — attendance 를 «계정» 으로 찾는데 정본을 안 쓰는 자리가 있는가');
/* ALLOW — 「왜 아직 정본을 안 쓰는가」를 반드시 적는다.
   ⛔ 이 목록을 «조용히 넘기는 자리» 로 쓰지 말 것. 여기 적힌 것은 하니스가
      매번 이름을 찍어 출력한다(사람 결정 대기). */
const ALLOW = [
  ['api-students.ts', '주간 계획의 «카페24 예약 씨앗» 조회 — room_id LIKE \'c24-%\' 로 씨앗만 일부러 본다. 그 행의 user_id 는 «계정» 이라 이 자리는 user_id 가 맞다(2026-09-21 확인)'],
  ['api-games.ts', 'computeAttendanceStreak 의 재귀 CTE — 주석이 idx_attendance_user_date 를 타는 것을 전제로 한다. OR 로 넓히면 30회 재귀가 인덱스를 못 타 무거워질 수 있어 사람이 정할 일(2026-09-21)'],
  ['api-admin.ts', '학생 목록의 user_id IN (…) 4곳 — OR 로 넓히면 바인드가 2배가 되어 D1 100개 한도에 걸린다(지금도 90개씩 자른다). 별건(2026-09-21)'],
];
/* 🔴 ALLOW 를 «파일 단위» 로 두면 그 파일에 «새» 실수가 생겨도 전부 통과한다
   (2026-09-21 변이시험에서 실제로 뚫렸다 — api-students.ts 에 정본을 안 쓰는 줄을
   새로 넣었는데 0건으로 통과). 그래서 «그 SQL 의 지문» 으로 좁힌다. */
const ALLOW_SQL = [
  [/FROM attendance\s+WHERE user_id = \? AND room_id LIKE 'c24-%'/, 'api-students.ts'],
  [/WITH RECURSIVE[\s\S]*FROM attendance/,                            'api-games.ts'],
  [/FROM walk[\s\S]*EXISTS[\s\S]*FROM attendance/,                     'api-games.ts'],   // 같은 재귀 CTE 의 두 번째 조각
];
const allowedSql = (f, sql) => ALLOW_SQL.some(([re, file]) => file === f && re.test(sql));

// SQL 문자열만 뽑아서 본다 — 「FROM attendance」 와 「user_id = ?」 가 같은 문자열에 있으면 후보
const FILES = ['api-mango.ts','api-admin.ts','api-students.ts','api-reports.ts','api-games.ts',
               'learning-insights.ts','lesson-insight.ts','absent-sweep.ts','api-points.ts',
               'api-teacher.ts','churn-graph.ts','retention.ts','no-show-truth.ts','marketing-studio.ts',
               'lesson-reminder.ts','accounting-reports.ts','ai-command.ts','api-sales-hr.ts'];
const offenders = [];
for (const f of FILES) {
  let src;
  try { src = stripComments(read(f)); } catch { continue; }
  /* ⛔ 백틱 문자열을 정규식(/`[^`]*`/)으로 뽑지 말 것 — 파일 어딘가의 백틱 짝이 한 번
     어긋나면 그 뒤 추출이 통째로 밀려 «새 자리» 를 조용히 놓친다(2026-09-21 변이시험에서
     실제로 뚫렸다: api-students.ts 에 넣은 변이가 0건으로 통과). 줄 창으로 본다. */
  for (const raw of attendanceSqls(src)) {
    if (!/\buser_id\s*=\s*\?/i.test(raw)) continue;
    if (/room_id\s*=\s*\?/i.test(raw)) continue;          // 방 + 기기 기준 — 계정으로 찾는 자리가 아니다
    if (/\$\{ATTENDANCE_BY_UID(_NOCASE)?\}|attendanceByUid\(/.test(raw)) continue;  // 정본을 쓴다
    const one = raw.replace(/\s+/g, ' ').trim();
    offenders.push([f, one.slice(0, 110), allowedSql(f, one)]);
  }
}
const unexpected = offenders.filter(o => !o[2]);
check('③-1 정본을 안 쓰는 «새» 자리가 없다', unexpected.length === 0, unexpected);

console.log('\n   📋 아직 정본을 안 쓰는 자리 (사람 결정 대기 — FAIL 아님)');
if (offenders.length === 0) console.log('      (없음)');
for (const [f, s] of offenders) {
  const why = (ALLOW.find(a => a[0] === f) || [, '사유 미기재'])[1];
  console.log(`      · ${f}  —  ${why}`);
  console.log(`        ${s}`);
}

console.log('\n④ 고친 자리가 되돌아가지 않았는가 (파일별)');
const MUST_USE = [
  ['api-mango.ts', 8, '관리자 학생 상세 — 기본 4곳 + full 4곳'],
  ['api-students.ts', 2, '학부모 대시보드 자녀 출석 · 월간 리포트'],
  ['api-reports.ts', 1, '월간 성적표 출석일수'],
  ['learning-insights.ts', 1, '학습 인사이트 월별 출석'],
  ['api-games.ts', 2, '배지(출석 1일) · 스트릭 «오늘 출석했나»'],
];
MUST_USE.push(['api-students.ts@nocase', 2, '학생 본인 화면 2곳 — 원래 COLLATE NOCASE 였던 자리']);
for (const [f0, n, why] of MUST_USE) {
  const f = f0.replace('@nocase', '');
  if (f0.endsWith('@nocase')) {
    const src = stripComments(read(f));
    const used = (src.match(/\$\{ATTENDANCE_BY_UID_NOCASE\}/g) || []).length;
    check(`④ ${f} — NOCASE 정본을 ${n}곳에서 쓴다 (${why})`, used === n, { 실제: used });
    continue;
  }
  const src = stripComments(read(f));
  const used = (src.match(/\$\{ATTENDANCE_BY_UID\}/g) || []).length;
  check(`④ ${f} — 정본을 ${n}곳에서 쓴다 (${why})`, used === n, { 실제: used });
  check(`④ ${f} — 바인드도 정본 헬퍼로`, /attUidBinds\(/.test(src), false);
}

console.log('\n⑤ 칸·인덱스 보장이 살아 있는가');
const canonNoComment = stripComments(CANON);
check('⑤-1 account_uid 칸을 멱등 ALTER 로 보장한다',
      /ALTER TABLE attendance ADD COLUMN account_uid/.test(canonNoComment));
/* 🔴 인덱스가 없으면 이 조건은 풀스캔이다(2026-09-21 실측 rows_read 180,885).
      조건을 넓힌 것과 «짝» 이라 함께 못 박는다. */
check('⑤-2 account_uid 인덱스를 멱등 생성한다 (없으면 풀스캔)',
      /CREATE INDEX IF NOT EXISTS\s+\S+\s+ON attendance\(account_uid/.test(canonNoComment));
check('⑤-3 보장 함수를 학생 상세 두 자리에서 부른다',
      (stripComments(read('api-mango.ts')).match(/ensureAttendanceAccountUid\(/g) || []).length >= 2);
/* ⛔ 이 조건을 «쓰기» 에 쓰면 남의 행을 건드린다 — 정본이 읽기 전용임을 못 박는다 */
const writeMisuse = [];
for (const f of FILES) {
  let src; try { src = stripComments(read(f)); } catch { continue; }
  for (const m of src.matchAll(/(UPDATE|DELETE FROM)\s+attendance[\s\S]{0,300}?\$\{ATTENDANCE_BY_UID\}/gi)) writeMisuse.push([f, m[0].slice(0, 60)]);
}
check('⑤-4 정본 조건을 UPDATE/DELETE 에 쓰지 않았다', writeMisuse.length === 0, writeMisuse);

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('⚠ 실제 확인 필요:'); FAILS.forEach(f => console.log('   - ' + f)); process.exit(1); }
