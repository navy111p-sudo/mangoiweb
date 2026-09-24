// 📅 매주 반복 수업의 «시작일» (2026-09-24 사장님 「수업 시작 일자가 써있지 않아」·「수업을 입력하면 뒤로 수업이 가」)
//
// 정본 src/class-start-date.ts 를 타입 제거로 «실제로» 돌리고, 학생 상세 캘린더(admin/student.html)의
// mgsSchedHitsDate 를 오려 내 같은 입력에 같은 답을 내는지 대조한다.
// ⚠️ 「막는다」 옆에 「옛 행·날짜 지정 행은 그대로」를 짝으로 둔다 — 짝이 없으면 «전부 안 그리기» 도 통과한다.
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

/* ① 정본 */
console.log('① 정본 recurStartedOn');
let M = null;
try {
  const code = stripTypeScriptTypes(readFileSync(resolve(SRC, 'class-start-date.ts'), 'utf8'));
  M = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
} catch (e) { console.log('  (정본 로드 실패) ' + e.message); }
ok(!!(M && M.recurStartedOn), '전제: 정본을 불러왔다');
if (M) {
  const R = { day_of_week: '5', starts_on: '2026-10-02' };
  ok(M.recurStartedOn(R, '2026-09-25') === false, '시작일 전 날짜에는 안 연다');
  ok(M.recurStartedOn(R, '2026-10-02') === true, '시작일 당일은 연다');
  ok(M.recurStartedOn(R, '2026-10-09') === true, '시작일 뒤에는 연다');
  ok(M.recurStartedOn({ day_of_week: '5' }, '2020-01-03') === true, '(짝) 시작일 없는 옛 행은 예전 그대로 연다');
  ok(M.recurStartedOn({ day_of_week: '5', starts_on: 'x' }, '2020-01-03') === true, '(짝) 깨진 시작일은 막지 않는다(모르면 연다)');
  ok(M.recurStartedOn({ scheduled_date: '2026-09-25', starts_on: '2026-10-02' }, '2026-09-25') === true, '(짝) 날짜 지정 행은 시작일과 무관');
  const created = Date.parse('2026-09-24T03:00:00Z');
  ok(M.recurStartedOn({ day_of_week: '5', created_at: created }, '2026-06-05', { createdFallback: true }) === false,
    '캘린더용: 시작일 없는 행은 등록한 날 전으로 번지지 않는다');
  ok(M.recurStartedOn({ day_of_week: '5', created_at: created }, '2026-06-05') === true,
    '(짝) 서버 판정은 created_at 을 바닥으로 안 쓴다');
  ok(M.startsOnSel(false) === ', NULL AS starts_on' && M.startsOnSel(true, 'cs') === ', cs.starts_on', 'SELECT 조각 모양');

  /* 진짜 SQLite — 칸이 없으면 만들고, 있으면 true */
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, day_of_week TEXT)`);
  const env = { DB: {
    exec: async (q) => db.exec(q),
    prepare: (q) => ({ all: async () => ({ results: db.prepare(q).all() }) }),
  } };
  ok(await M.ensureStartsOnColumn(env) === true, '칸이 없던 DB 에 starts_on 을 만든다');
  ok(await M.ensureStartsOnColumn(env) === true, '두 번 불러도 true(멱등)');
  const env2 = { DB: { exec: async () => { throw Error('x'); }, prepare: () => ({ all: async () => { throw Error('x'); } }) } };
  ok(await M.ensureStartsOnColumn(env2) === false, '(짝) 못 물어보면 false — SELECT 에 그 칸을 안 넣는다');
}

/* ② 캘린더 판정 — 소스에서 오려 내 실제로 돌린다 */
console.log('\n② 학생 상세 캘린더 mgsSchedHitsDate');
const html = readFileSync(resolve(PUB, 'admin/student.html'), 'utf8');
function fnSrc(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = html.indexOf('{', i), d = 0;
  for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (!d) return html.slice(i, k + 1); } }
  return '';
}
const parts = ['mgsYmd', 'mgsDowIdx', 'mgsSchedStartYmd', 'mgsSchedHitsDate'].map(fnSrc);
ok(parts.every(Boolean), '전제: 네 함수를 오려 냈다');
let hits = null;
try { hits = new Function(parts.join('\n') + '\nreturn mgsSchedHitsDate;')(); } catch (e) { console.log('  ' + e.message); }
if (hits) {
  const created = Date.parse('2026-09-24T03:00:00Z'); // 목요일 12:00 KST 에 등록
  const oldRow = { day_of_week: '3', created_at: created, status: 'active' };
  ok(hits(oldRow, new Date(2026, 5, 3)) === false, '사장님 제보 그대로: 9/24 등록한 수요일 수업이 6/3 에 안 그려진다');
  ok(hits(oldRow, new Date(2026, 8, 30)) === true, '(짝) 등록 뒤 수요일(9/30)에는 그린다');
  const soRow = { day_of_week: '5', starts_on: '2026-10-09', created_at: created, status: 'active' };
  ok(hits(soRow, new Date(2026, 9, 2)) === false, '시작일(10/9) 전 금요일은 안 그린다');
  ok(hits(soRow, new Date(2026, 9, 9)) === true, '시작일 당일 금요일은 그린다');
  ok(hits({ day_of_week: '5', status: 'active' }, new Date(2026, 0, 2)) === true, '(짝) 시작일·등록일 둘 다 모르면 그린다');
  ok(hits({ scheduled_date: '2026-06-03', created_at: created, status: 'active' }, new Date(2026, 5, 3)) === true,
    '(짝) 날짜 지정 행은 등록일과 무관하게 그 날짜에 그린다');
}

/* ③ 배선 — 폼이 시작일을 보내고, 서버가 저장하고, «오늘 열리나» 판정이 정본을 부른다 */
console.log('\n③ 배선');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
ok(/id="ns-start"/.test(html), '폼에 시작일 칸(ns-start)이 있다');
ok(/starts_on:\s*\(kindEl\.value === 'recurring'/.test(html), '매주 반복일 때 starts_on 을 보낸다');
const adm = strip(readFileSync(resolve(SRC, 'api-admin.ts'), 'utf8'));
ok(/INSERT INTO class_schedules \([^)]*starts_on\)/.test(adm), '등록 INSERT 가 starts_on 을 쓴다');
ok(!/scheduled_date:\s*startsOn/.test(adm), '(부정) 시작일을 scheduled_date 로 적지 않는다');
for (const [f, re] of [
  ['api-mango.ts', /dowMatches\(s\.day_of_week, kDow\) && recurStartedOn\(s, todayStr\)/],
  ['api-teacher.ts', /dowMatches\(s\.day_of_week, kDow\) && recurStartedOn\(s, todayStr\)/],
  ['absent-sweep.ts', /=== kDow\) && recurStartedOn\(s, todayStr\)/],
  ['lesson-reminder.ts', /=== kDow\) && recurStartedOn\(s, todayStr\)/],
  ['classes-now.ts', /dowMatches\(s\.day_of_week, dow\) && recurStartedOn\(s, d\)/],
  ['api-students.ts', /recurStartedOn\(r, k\.ymd\)/],
]) {
  ok(re.test(strip(readFileSync(resolve(SRC, f), 'utf8'))), f + ' 의 «오늘 열리나» 판정이 시작일을 본다');
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
