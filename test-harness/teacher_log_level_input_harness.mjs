// 🎚 강사가 수업 일지에서 학생 레벨을 직접 정한다 (2026-10-27 사장님 「강사가 일지에서 레벨을 직접 입력하게 해줘」)
//
// 글자가 «있는가» 가 아니라 출하 코드를 «실제로 돌려» 답을 본다.
//   A  정본 src/teacher-student-level.ts — 값 판정(Lv 1~34)·목록·진짜 SQLite 저장(변경 기록·한 batch·정확일치)
//   B  밤 동기화·레벨테스트가 강사 값을 안 지우는가 — cafe24-sync 의 SQL 을 진짜 SQLite 에 · applyPlacementLevel 실행
//   C  api-teacher.ts — 경로 게이트 식 평가 · POST ?part=level 블록을 오려 내 «이 강사의 학생인가» 판정을 실행
//      + 권한 범위 정본 teacherLevelScope(2026-10-28 좁힘) 경계 — 최근 14일·매주 수업·취소·앞으로·모르는 상태
//   D  teacher.html openEval — vm 에서 창을 그리고 레벨을 골라 저장·실패 되돌림·«보내기» 기다림을 본다
// ⚠️ «된다» 옆에 «안 된다» 를 짝으로 둔다 — 짝이 없으면 «전부 허용»·«전부 막기» 가 통과한다.
// 변이시험용: LEVEL_SRC_ROOT=<cloudflare-deploy 사본> 으로 읽을 소스를 바꿀 수 있다(typescript 는 저장소 것을 쓴다).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const SRC = process.env.LEVEL_SRC_ROOT ? resolve(process.env.LEVEL_SRC_ROOT) : CF;
const rd = (p) => readFileSync(join(SRC, p), 'utf8');
let PASS = 0, FAIL = 0;
const FAILS = [];
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; FAILS.push(m); console.log('  ❌ ' + m); } };
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

const ts = createRequire(join(CF, 'package.json'))('typescript');
const tsToJs = (text) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
// src 안의 TS 모듈을 import 까지 따라가며 실제로 싣는다(목 없이 — 정본끼리의 연결도 함께 검사된다).
const CACHE = new Map();
function loadSrc(rel) {
  const file = rel.endsWith('.ts') ? rel : rel + '.ts';
  if (CACHE.has(file)) return CACHE.get(file);
  const exports = {};
  CACHE.set(file, exports);
  new Function('exports', 'require', tsToJs(rd(file)))(exports, (name) => {
    if (!name.startsWith('./')) throw new Error('Unmocked import: ' + name + ' (from ' + file + ')');
    const next = join(dirname(file), name.slice(2));
    if (!existsSync(join(SRC, next + '.ts'))) throw new Error('Missing module: ' + next);
    return loadSrc(next);
  });
  return exports;
}
// D1 모양으로 감싼 진짜 SQLite — batch 는 한 트랜잭션(한쪽만 남지 않는가를 재려고).
function d1(raw) {
  const wrap = (sql) => {
    const bound = (args) => {
      const st = () => raw.prepare(sql);
      return {
        bind: (...next) => bound(next),
        first: async () => st().get(...args) || null,
        all: async () => ({ success: true, results: st().all(...args) }),
        run: async () => { const r = st().run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
        _exec: () => st().run(...args),
      };
    };
    return bound([]);
  };
  return {
    prepare: wrap,
    exec: async (sql) => { raw.exec(sql); return { success: true }; },
    batch: async (stmts) => {
      raw.exec('BEGIN');
      try { const out = stmts.map((s) => s._exec()); raw.exec('COMMIT'); return out; }
      catch (e) { raw.exec('ROLLBACK'); throw e; }
    },
  };
}
const NOW = Date.parse('2026-10-27T13:00:00+09:00');

/* ── A. 정본 ─────────────────────────────────────────────────────────── */
console.log('\n[A] src/teacher-student-level.ts — 실제 실행');
let L = null, JL = null;
try {
  L = loadSrc('src/teacher-student-level');
  JL = loadSrc('src/judgment-level');
  const first = JL.BAND_SPECS[0].lvFrom, last = JL.BAND_SPECS[JL.BAND_SPECS.length - 1].lvTo;
  ok(L.TEACHER_LEVEL_MIN === first && L.TEACHER_LEVEL_MAX === last, `고를 수 있는 범위 = BAND_SPECS 의 Lv ${first}~${last}(숫자를 다시 적지 않음)`);
  const good = [['Lv 1', 'Lv 1'], ['Lv ' + last, 'Lv ' + last], ['lv12', 'Lv 12'], ['Lv.7', 'Lv 7'], [' Lv 5 ', 'Lv 5'], ['12', 'Lv 12'], [12, 'Lv 12'], ['LV 20', 'Lv 20']];
  for (const [inp, out] of good) ok(L.normalizeTeacherLevelChoice(inp) === out, `${JSON.stringify(inp)} → ${out}`);
  const bad = ['Lv 0', '0', 0, 'Lv ' + (last + 1), last + 1, 'Lv 5.5', '5.5', 'Lv 5 (Basic)', 'Beginner', 'Lv -3', '-3', '', '   ', null, undefined, true, false, {}, [], 'Lv 1;DROP'];
  for (const b of bad) ok(L.normalizeTeacherLevelChoice(b) === null, `받지 않는 값 ${JSON.stringify(b)} → null`);
  const scale = L.levelScaleForPortal();
  ok(Array.isArray(scale) && scale.length === JL.BAND_SPECS.length, '고르기 목록은 BAND_SPECS 와 같은 수의 묶음');
  let contiguous = scale.length > 0 && scale[0].from === first && scale[scale.length - 1].to === last;
  for (let i = 1; i < scale.length; i++) if (scale[i].from !== scale[i - 1].to + 1) contiguous = false;
  ok(contiguous, '묶음이 빈틈·겹침 없이 Lv 1 부터 끝까지 이어진다');
  ok(scale.every((s, i) => s.ko === JL.BAND_SPECS[i].nameKo && s.en === JL.BAND_SPECS[i].nameEn), '묶음 이름은 BAND_SPECS 의 이름 그대로(한/영)');

  // 진짜 SQLite — level·updated_at 칸이 «없는» 옛 표에서 시작한다(멱등 ALTER 확인)
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT)`);
  raw.exec(`INSERT INTO students_erp (user_id, korean_name) VALUES ('kim01','김'),('Kim','김대문자'),('lee02','이')`);
  const DB = d1(raw);
  const set = (uid, level, by = 'teacher1') => L.setStudentLevelByTeacher(DB, { uid, level, by, byName: 'Teacher One', nowMs: NOW });
  const lvOf = (u) => (raw.prepare('SELECT level FROM students_erp WHERE user_id = ?').get(u) || {}).level;
  const logs = (u) => raw.prepare('SELECT * FROM student_level_log WHERE user_id = ? ORDER BY id').all(u);

  const r1 = await set('kim01', 'Lv 5');
  ok(r1.ok === true && r1.level === 'Lv 5' && r1.previous === null && !r1.unchanged, '미등록 → Lv 5 저장(previous null)');
  ok(lvOf('kim01') === 'Lv 5', '  students_erp.level 이 Lv 5');
  ok(raw.prepare('SELECT updated_at FROM students_erp WHERE user_id = ?').get('kim01').updated_at === NOW, '  updated_at 도 그 시각(칸이 없던 표에 만들어 넣음)');
  const l1 = logs('kim01');
  ok(l1.length === 1 && l1[0].old_level === null && l1[0].new_level === 'Lv 5' && l1[0].changed_by === 'teacher1'
     && l1[0].changed_by_name === 'Teacher One' && l1[0].source === 'teacher_log' && l1[0].created_at === NOW, '  변경 기록 한 줄(누가·언제·무엇으로)');
  const r2 = await set('kim01', 'lv5');
  ok(r2.ok === true && r2.unchanged === true && logs('kim01').length === 1, '같은 값(lv5=Lv 5)이면 아무것도 안 쓴다(기록도 안 늘어남)');
  const r3 = await set('kim01', 'Lv 12');
  ok(r3.ok === true && r3.previous === 'Lv 5' && lvOf('kim01') === 'Lv 12' && logs('kim01').length === 2 && logs('kim01')[1].old_level === 'Lv 5',
     'Lv 5 → Lv 12: previous 를 돌려주고 기록에 «전 값» 이 남는다');
  ok(lvOf('Kim') === null, '  대소문자만 다른 계정(Kim)은 건드리지 않는다');
  const r4 = await set('KIM01', 'Lv 3');
  ok(r4.ok === false && r4.error === 'not_found' && lvOf('kim01') === 'Lv 12', '대소문자가 다른 아이디(KIM01)는 not_found — 정확일치');
  const r5 = await set('lee02', 'Lv 99');
  ok(r5.ok === false && r5.error === 'bad_level' && lvOf('lee02') == null && logs('lee02').length === 0, '범위 밖(Lv 99)은 bad_level · 아무것도 안 씀');
  const r6 = await set('  ', 'Lv 3');
  ok(r6.ok === false && r6.error === 'student_uid_required', '빈 아이디는 student_uid_required');
  // 한 batch — 기록 INSERT 가 실패하면 레벨도 안 바뀐다
  raw.exec(`CREATE TRIGGER boom BEFORE INSERT ON student_level_log WHEN NEW.user_id = 'lee02' BEGIN SELECT RAISE(ABORT, 'boom'); END`);
  let threw = false;
  try { await set('lee02', 'Lv 8'); } catch { threw = true; }
  ok(threw && lvOf('lee02') == null, '변경 기록이 실패하면 레벨도 안 바뀐다(한 batch) · 예외는 부르는 쪽으로 올라간다');
  raw.exec('DROP TRIGGER boom');
  const r7 = await set('lee02', 'Lv 8');
  ok(r7.ok === true && lvOf('lee02') === 'Lv 8', '  기록이 되살아나면 그대로 저장된다');
} catch (e) {
  ok(false, 'A 절 실행 중 예외: ' + (e && e.stack || e));
}

/* ── B. 밤 동기화·레벨테스트가 강사 값을 지우지 않는가 ─────────────────── */
console.log('\n[B] 카페24 밤 동기화 · 레벨테스트 배치 — 강사가 정한 레벨이 남는가');
try {
  const C = rd('src/cafe24-sync.ts');
  const delA = C.indexOf('`DELETE FROM students_erp'), delB = C.indexOf('`', delA + 1);
  const insA = C.indexOf('`INSERT INTO students_erp (user_id, student_id'), insB = C.indexOf('`', insA + 1);
  ok(delA > 0 && delB > delA && insA > 0 && insB > insA, '전제: 동기화의 DELETE·UPSERT SQL 을 오려 냈다');
  const delSql = C.slice(delA + 1, delB), insSql = C.slice(insA + 1, insB);
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, student_id TEXT, login_id TEXT, username TEXT, korean_name TEXT, grade TEXT, school TEXT,
    status TEXT, signup_date TEXT, end_date TEXT, shop_name TEXT, franchise TEXT, hq_name TEXT, points INTEGER, parent_phone TEXT, student_phone TEXT,
    phone TEXT, created_at INTEGER, updated_at INTEGER, password_hash TEXT, parent_user_id TEXT, eval_band TEXT, level TEXT, textbook TEXT)`);
  const SENT = 1751500000000;
  raw.prepare(`INSERT INTO students_erp (user_id, created_at, level) VALUES ('t1', ?, 'Lv 9'), ('t2', ?, NULL)`).run(SENT, SENT);
  raw.prepare(delSql).run(SENT);
  ok(!!raw.prepare(`SELECT 1 FROM students_erp WHERE user_id='t1'`).get(), '밤 DELETE 는 레벨이 있는 행을 남긴다');
  ok(!raw.prepare(`SELECT 1 FROM students_erp WHERE user_id='t2'`).get(), '  (짝) 레벨이 없는 카페24 행은 예전대로 지운다 — 조건이 살아 있다');
  raw.prepare(insSql).run('t1', 't1', 't1', 'u', '김', '', '', 'active', '', '', '', '', '', 0, '', '', '', SENT, SENT + 1);
  ok(raw.prepare(`SELECT level FROM students_erp WHERE user_id='t1'`).get().level === 'Lv 9', '밤 UPSERT 가 레벨을 덮지 않는다(SET 목록에 level 없음)');

  const P = loadSrc('src/student-placement');
  const raw2 = new DatabaseSync(':memory:');
  raw2.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, level TEXT, updated_at INTEGER)`);
  raw2.exec(`INSERT INTO students_erp (user_id, level) VALUES ('p1', 'Lv 20'), ('p2', NULL)`);
  const env2 = { DB: d1(raw2) };
  const pr1 = await P.applyPlacementLevel(env2, 'p1', 'A1');
  ok(pr1.applied === false && raw2.prepare(`SELECT level FROM students_erp WHERE user_id='p1'`).get().level === 'Lv 20', '레벨테스트 배치는 강사가 정한 레벨(Lv 20)을 덮지 않는다');
  const pr2 = await P.applyPlacementLevel(env2, 'p2', 'A1');
  ok(pr2.applied === true && !!raw2.prepare(`SELECT level FROM students_erp WHERE user_id='p2'`).get().level, '  (짝) 비어 있으면 레벨테스트가 예전대로 채운다');
} catch (e) {
  ok(false, 'B 절 실행 중 예외: ' + (e && e.stack || e));
}

/* ── C. api-teacher.ts — 경로 게이트 · «이 강사의 학생인가» ─────────────── */
console.log('\n[C] api-teacher.ts — POST ?part=level 을 오려 내 실제로 돌린다');
const T = rd('src/api-teacher.ts');
// 블록을 «중괄호 짝» 으로 잘라 낸다(문자열·줄주석 안의 중괄호는 세지 않는다).
function braceBlock(text, startIdx) {
  let i = text.indexOf('{', startIdx), depth = 0, q = null;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); continue; }
    if (ch === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i) + 1; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(startIdx, i + 1);
  }
  throw new Error('unbalanced block');
}
try {
  // C-1 경로 게이트 — 그 줄들을 그대로 평가한다
  const gA = T.indexOf('  const isGoalPost =');
  const gB = T.indexOf('return null;', gA);
  ok(gA > 0 && gB > gA, '전제: 경로 게이트 줄을 찾았다');
  const gateFn = new Function('path', 'method', 'url', tsToJs(T.slice(gA, gB + 'return null;'.length)) + '\nreturn "pass";');
  const g = (method, part) => gateFn('/api/teacher/portal', method, new URL('https://x.invalid/api/teacher/portal' + (part ? '?part=' + part : '')));
  ok(g('POST', 'level') === 'pass', 'POST ?part=level 은 게이트를 지난다');
  ok(g('POST', 'goal') === 'pass' && g('GET', '') === 'pass', '  기존 POST ?part=goal · GET 은 그대로');
  ok(g('POST', 'levelx') === null && g('POST', '') === null && g('DELETE', 'level') === null, '  (짝) 모르는 POST·DELETE 는 여전히 null');

  // C-2 POST ?part=level 블록
  const bA = T.indexOf('  if (isLevelPost) {');
  ok(bA > 0, '전제: if (isLevelPost) 블록을 찾았다');
  const block = braceBlock(T, bA);
  const posBlock = T.indexOf(block);
  const lastPush = T.lastIndexOf('classes.push(', posBlock);
  const dedupe = T.indexOf('cafe24DedupeSchedules = rows.results');
  ok(dedupe > 0 && posBlock > dedupe && posBlock > lastPush && lastPush > 0, '  블록은 오늘 목록·예약표를 «다 만든 뒤» 에 있다(위치)');
  const uA = T.indexOf('const studentUidOf = (s: any)');
  const studentUidOfSrc = braceBlock(T, uA) + ';';
  const studentUidOf = new Function(tsToJs(studentUidOfSrc) + '\nreturn studentUidOf;')();

  // C-2a 권한 범위 정본(teacherLevelScope) — 경계를 실제로 넣어 본다(2026-10-28 「3번 권한 범위 좁혀줘」)
  //   오늘 = 2026-10-27(NOW). 창 = 오늘 − 14일(10-13) ~ 오늘. 「된다」 옆에 「안 된다」를 짝으로.
  ok(L.TEACHER_LEVEL_PAST_DAYS === 14, '전제: 지난 수업 창은 14일(카페24 되돌아보기와 같은 근거)');
  const scope = (todayClasses, schedules, uid = 'u1', todayStr = '2026-10-27') =>
    L.teacherLevelScope({ uid, todayClasses, schedules, todayStr, uidOf: studentUidOf });
  const sc = (row) => scope([], [Object.assign({ user_id: 'u1' }, row)]);
  ok(scope([{ kind: 'class', student_uid: 'u1', class_state: 'done' }], []) === 'ok', '① 오늘 목록의 수업 학생 → ok');
  ok(scope([{ kind: 'class', student_uid: 'u1', class_state: 'postponed' }], []) === 'ok', '  오늘 수업이 «연기» 여도 ok(옮겨진 것이지 끝난 게 아님)');
  ok(scope([{ kind: 'class', student_uid: 'u1', class_state: 'cancelled' }], []) === 'out_of_window', '  (짝) 오늘 수업이 «취소» 뿐이면 out_of_window');
  ok(scope([{ kind: 'lms', student_uid: 'u1' }], []) === 'not_your_student', '  (짝) 수업이 아닌 줄(kind≠class)은 근거가 아니다 → not_your_student');
  ok(sc({ scheduled_date: '2026-10-27' }) === 'ok' && sc({ scheduled_date: '2026-10-13' }) === 'ok', '② 날짜 잡힌 수업: 오늘·14일 전(10-13) → ok');
  ok(sc({ scheduled_date: '2026-10-12' }) === 'out_of_window', '  (짝) 15일 전(10-12) → out_of_window');
  ok(sc({ scheduled_date: '2026-10-28' }) === 'out_of_window' && sc({ scheduled_date: '2027-03-04' }) === 'out_of_window', '  (짝) 앞으로 잡힌 수업만 → out_of_window(일지 창은 수업 시작 뒤에만 열린다)');
  ok(sc({ scheduled_date: '2026-10-20 19:00' }) === 'ok', '  날짜 뒤에 시각이 붙어 있어도 앞 10글자로 본다');
  ok(sc({ scheduled_date: '2026-10-20', sched_status: 'cancelled' }) === 'out_of_window', '  (짝) 창 안이어도 «취소» 는 근거가 아니다');
  ok(sc({ scheduled_date: '2026-10-20', sched_status: 'postponed' }) === 'ok' && sc({ scheduled_date: '2026-10-20', sched_status: null }) === 'ok', '  «연기»·상태 비어 있음 → ok');
  ok(sc({ scheduled_date: '2026-10-20', sched_status: 'deleted' }) === 'out_of_window', '  (짝) 모르는 상태는 근거가 못 된다(막는 쪽으로 실패)');
  ok(sc({ scheduled_date: 'abc', day_of_week: '2' }) === 'out_of_window', '  깨진 날짜를 «매주 수업» 으로 넘겨짚지 않는다');
  ok(sc({ day_of_week: '2' }) === 'ok' && sc({ day_of_week: 'Mon,Wed', starts_on: '2026-10-27' }) === 'ok', '③ 매주 수업(시작일 없음·오늘 시작) → ok');
  ok(sc({ day_of_week: '2', starts_on: '2026-11-03' }) === 'out_of_window', '  (짝) 다음 주에 시작하는 매주 수업 → out_of_window');
  ok(sc({ day_of_week: '2', skip_dates: '2026-10-27' }) === 'ok', '  오늘이 «그 주만 빠지는 날» 이어도 매주 수업 학생이다');
  ok(sc({ day_of_week: '', scheduled_date: '' }) === 'out_of_window' && sc({ day_of_week: '2', sched_status: 'cancelled' }) === 'out_of_window', '  (짝) 요일도 날짜도 없는 줄 · 취소된 매주 수업 → out_of_window');
  ok(scope([], [{ user_id: 'u1', scheduled_date: '2026-09-01' }, { user_id: 'u1', scheduled_date: '2026-10-22' }]) === 'ok'
     && scope([], [{ user_id: 'u1', scheduled_date: '2026-10-22' }, { user_id: 'u1', scheduled_date: '2026-09-01' }]) === 'ok', '  옛 줄과 최근 줄이 함께 있으면 순서와 무관하게 ok');
  ok(scope([], [{ user_id: 'U1', scheduled_date: '2026-10-22' }]) === 'not_your_student', '  (짝) 대소문자만 다른 아이디(U1) → not_your_student(정확일치)');
  ok(scope([], [{ user_id: 'lms', scheduled_date: '2026-10-22' }], 'lms') === 'not_your_student', '  옛 LMS 자리표시(lms)는 학생이 아니다');
  ok(scope([], [{ user_id: 'zz', scheduled_date: '2026-10-22' }]) === 'not_your_student', '  목록 어디에도 없으면 not_your_student');
  ok(scope([{ kind: 'class', student_uid: '' }], [], '') === 'not_your_student' && sc({ scheduled_date: '2026-10-27' }) === 'ok'
     && scope([], [{ user_id: 'u1', scheduled_date: '2026-10-27' }], 'u1', 'bad') === 'not_your_student', '  아이디·오늘 날짜가 비거나 깨지면 not_your_student(막는 쪽)');
  ok(L.teacherLevelScope({ uid: 'u1', todayClasses: [], schedules: [{ user_id: 'u1', scheduled_date: '2026-02-15' }], todayStr: '2026-03-01', uidOf: studentUidOf }) === 'ok'
     && L.teacherLevelScope({ uid: 'u1', todayClasses: [], schedules: [{ user_id: 'u1', scheduled_date: '2026-02-14' }], todayStr: '2026-03-01', uidOf: studentUidOf }) === 'out_of_window',
     '  달이 바뀌어도 14일을 정확히 센다(03-01 → 02-15 ok · 02-14 안 됨)');

  const runner = new Function('ctx', tsToJs(
    'const { classes, cafe24DedupeSchedules, normalizeTeacherLevelChoice, setStudentLevelByTeacher, teacherLevelScope, TEACHER_LEVEL_PAST_DAYS, json, env, actor, now, todayStr, request } = ctx;\n'
    + 'const isLevelPost = true;\n'
    + studentUidOfSrc + '\n'
    + 'return (async () => {\n' + block + '\nreturn "fell-through";\n})();'));
  const json = (body, status = 200) => ({ status, body });
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, level TEXT, updated_at INTEGER)`);
  raw.exec(`INSERT INTO students_erp (user_id, level) VALUES ('kim01','Lv 5'),('week1',NULL),('stranger',NULL),('lms',NULL),('old1','Lv 4'),('cancel1','Lv 6'),('nobody_in_erp_x',NULL)`);
  raw.exec(`DELETE FROM students_erp WHERE user_id='nobody_in_erp_x'`);
  const DB = d1(raw);
  const classes = [
    { kind: 'class', student_uid: 'kim01' },
    { kind: 'lms_slot', student_uid: 'stranger' },        // 수업이 아닌 줄의 아이디는 권한이 아니다
    { kind: 'class', student_uid: 'ghost01' },            // 오늘 수업은 있는데 명부에 없는 학생
    { kind: 'class', student_uid: 'cancel1', class_state: 'cancelled' },   // 오늘 수업이 취소된 학생(다른 근거 없음)
  ];
  // 주간 보기의 지난 수업(창 안) · 옛 LMS 자리표시 · 9월에 끝난 수업(창 밖)
  const sched = [{ user_id: 'week1', scheduled_date: '2026-10-20' }, { user_id: 'lms', scheduled_date: '2026-10-20' }, { user_id: 'old1', scheduled_date: '2026-09-10' }];
  const call = async (bodyObj, extra = {}) => {
    const req = new Request('https://x.invalid/api/teacher/portal?part=level', { method: 'POST', body: typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj) });
    return runner({ classes, cafe24DedupeSchedules: sched, normalizeTeacherLevelChoice: L.normalizeTeacherLevelChoice,
      setStudentLevelByTeacher: L.setStudentLevelByTeacher, teacherLevelScope: L.teacherLevelScope, TEACHER_LEVEL_PAST_DAYS: L.TEACHER_LEVEL_PAST_DAYS,
      json, env: { DB }, actor: { username: 'teacher1', name: 'Teacher One' }, now: NOW, todayStr: '2026-10-27', request: req, ...extra });
  };
  const lv = (u) => (raw.prepare('SELECT level FROM students_erp WHERE user_id = ?').get(u) || {}).level;
  const a1 = await call({ student_uid: 'kim01', level: 'Lv 13' });
  ok(a1.status === 200 && a1.body.ok === true && a1.body.level === 'Lv 13' && a1.body.previous === 'Lv 5' && lv('kim01') === 'Lv 13', '오늘 수업 학생: 200 · 저장 · previous 돌려줌');
  const a2 = await call({ student_uid: 'week1', level: '9' });
  ok(a2.status === 200 && lv('week1') === 'Lv 9', '주간 보기의 학생(예약표 행에만 있음)도 정할 수 있다 — 지난 수업 일지도 같은 창');
  const a3 = await call({ student_uid: 'stranger', level: 'Lv 9' });
  ok(a3.status === 403 && a3.body.error === 'not_your_student' && lv('stranger') == null, '수업이 아닌 줄(kind≠class)의 아이디는 403 · 안 씀');
  const a4 = await call({ student_uid: 'KIM01', level: 'Lv 9' });
  ok(a4.status === 403 && lv('kim01') === 'Lv 13', '대소문자만 다른 아이디(KIM01)는 403 — 정확일치');
  const a5 = await call({ student_uid: 'lms', level: 'Lv 9' });
  ok(a5.status === 403 && lv('lms') == null, '옛 LMS 자리표시(lms)는 학생이 아니다 — 403');
  const a6 = await call({ student_uid: 'outsider', level: 'Lv 9' });
  ok(a6.status === 403, '목록 어디에도 없는 학생은 403');
  const a7 = await call({ student_uid: 'kim01', level: 'Lv 0' });
  ok(a7.status === 400 && a7.body.error === 'bad_level' && lv('kim01') === 'Lv 13', '범위 밖 레벨은 400 bad_level · 안 씀');
  const a8 = await call({ level: 'Lv 3' });
  ok(a8.status === 400 && a8.body.error === 'student_uid_required', '아이디가 없으면 400');
  const a9 = await call('not json');
  ok(a9.status === 400, '본문이 JSON 이 아니어도 죽지 않고 400');
  const a10 = await call({ student_uid: 'ghost01', level: 'Lv 3' });
  ok(a10.status === 404 && a10.body.error === 'not_found', '오늘 수업 학생인데 명부에 없으면 404 not_found');
  const a11 = await call({ student_uid: 'kim01', level: 'Lv 14' }, { setStudentLevelByTeacher: async () => { throw new Error('D1 down'); } });
  ok(a11.status === 500 && a11.body.error === 'db_error', 'DB 가 던지면 500 db_error — «저장했다» 고 말하지 않음');
  const a12 = await call({ student_uid: 'kim01', level: 'Lv 13' });
  ok(a12.status === 200 && a12.body.unchanged === true, '같은 값이면 200 unchanged');
  const a13 = await call({ student_uid: 'old1', level: 'Lv 9' });
  ok(a13.status === 403 && a13.body.error === 'level_window_closed' && a13.body.past_days === L.TEACHER_LEVEL_PAST_DAYS && lv('old1') === 'Lv 4',
     '9월에 끝난 수업만 있는 학생: 403 level_window_closed · past_days 를 실어 보냄 · 안 씀');
  const a14 = await call({ student_uid: 'cancel1', level: 'Lv 9' });
  ok(a14.status === 403 && a14.body.error === 'level_window_closed' && lv('cancel1') === 'Lv 6', '오늘 수업이 취소뿐인 학생: 403 level_window_closed · 안 씀');
  const a15 = await call({ student_uid: 'week1', level: 'Lv 11' }, { todayStr: '2026-11-10' });
  ok(a15.status === 403 && a15.body.error === 'level_window_closed' && lv('week1') === 'Lv 9', '  (짝) 블록이 포털의 todayStr 을 넘긴다 — 11-10 기준 10-20 은 창 밖(10-27 기준이면 됐을 것)');
  const a16 = await call({ student_uid: 'week1', level: 'Lv 12' }, { todayStr: '2026-11-10', cafe24DedupeSchedules: [], classes: [{ kind: 'class', student_uid: 'week1' }] });
  ok(a16.status === 200 && lv('week1') === 'Lv 12', '  (짝) 블록이 포털의 오늘 목록(classes)을 넘긴다');

  // C-3 포털 응답이 고르기 목록을 싣는다(가벼운 응답이 아니라 본 응답에)
  const rA = T.indexOf('  return json({\n    ok: true,\n    now, today: todayStr,');
  ok(rA > 0, '전제: 포털 본 응답을 찾았다');
  const ret = braceBlock(T, rA);
  ok(/\blevel_scale:\s*levelScaleForPortal\(\)/.test(ret), '본 응답에 level_scale: levelScaleForPortal() 이 실린다');
} catch (e) {
  ok(false, 'C 절 실행 중 예외: ' + (e && e.stack || e));
}

/* ── D. 강사 화면 일지 창 — vm 에서 그리고 고른다 ───────────────────────── */
console.log('\n[D] teacher.html openEval — 레벨을 골라 저장·실패·기다림');
const HTML = rd('public/teacher.html');
function fn(name) {
  const a = HTML.indexOf('  function ' + name + '(');
  if (a < 0) throw new Error('function not found: ' + name);
  return braceBlock(HTML, a);
}
const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function makeSelect(html) {
  const m = html.match(/<select id="ev-lv">([\s\S]*?)<\/select>/);
  if (!m) return null;
  const opts = [...m[1].matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map((x) => ({ value: decode(x[1]), sel: !!x[2], text: decode(x[3]) }));
  const groups = [...m[1].matchAll(/<optgroup label="([^"]*)">/g)].map((x) => decode(x[1]));
  let idx = opts.findIndex((o) => o.sel);
  const sel = {
    disabled: false, onchange: null, opts, groups,
    get value() { return idx >= 0 && opts[idx] ? opts[idx].value : ''; },
    // 실제 select 처럼 «아무것도 안 골라짐»(-1)과 «값이 빈 줄(미등록·지금 값)이 골라짐» 을 가른다 — value 만 보면 둘 다 ''.
    get selectedIndex() { return idx; },
    set value(v) { idx = opts.findIndex((o) => o.value === String(v)); },
    querySelector(s) {
      if (s !== 'option[value=""]') return null;
      const o = opts.find((x) => x.value === '');
      return o ? { parentNode: { removeChild() { const cur = sel.value; opts.splice(opts.indexOf(o), 1); idx = opts.findIndex((x) => x.value === cur); } } } : null;
    },
    pick(v) { sel.value = v; return sel.onchange && sel.onchange(); },
  };
  return sel;
}
function makeMask() {
  const nodes = new Map();
  let lvSel = null;
  const mask = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(h) { this._html = h; lvSel = makeSelect(h); },
    querySelector(s) {
      if (s === '#ev-lv') return lvSel;
      if (s === '#ev-lv-msg' && !/id="ev-lv-msg"/.test(this._html)) return null;
      if (!nodes.has(s)) nodes.set(s, { value: '', disabled: false, hidden: true, className: '', textContent: '', innerHTML: '', onclick: null,
        querySelector: () => null, querySelectorAll: () => [] });
      return nodes.get(s);
    },
    querySelectorAll: () => [],
    node: (s) => nodes.get(s),
  };
  return mask;
}
let lang = 'en', mask = null, calls = [], levelMode = 'ok', levelResp = null, release = null, renders = 0, weekRenders = 0;
let confirmAnswer = true, confirms = [];   // window.confirm 대역 — 묻는 글자를 적고, 정해 둔 답을 돌려준다
const body = { appendChild(m) { m.parentNode = body; }, removeChild(m) { m.parentNode = null; } };
const ctx = {
  Date, Number, String, Array, AbortSignal, Event, JSON, Promise, Error,
  window: { addEventListener() {}, confirm: (m) => { confirms.push(String(m)); return confirmAnswer; } },
  T: (en, ko) => (lang === 'en' ? en : ko), EN: () => lang === 'en',
  esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  hhmm: () => '12:31',
  document: { addEventListener() {}, createElement: () => (mask = makeMask()), body, dispatchEvent() {} },
  DATA: null, WK_DATA: null, WK_READ: 0, MY: {}, lastSig: 'x',
  stuLabelText: (c) => c.student_name, MangoiClassDisplay: { range: () => '12:30pm – 12:50pm' },
  bandChip: () => '', chip: () => '', stars: () => '', pick: () => null,
  freshClass: (c) => c,
  renderClasses() { renders++; }, renderWeek() { weekRenders++; },
  fetch: (url, opts) => {
    calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (String(url).indexOf('/api/teacher/portal?part=level') === 0) {
      if (levelMode === 'reject') return Promise.reject(new Error('network'));
      if (levelMode === 'defer') return new Promise((r) => { release = () => r({ ok: true, json: async () => levelResp }); });
      return Promise.resolve({ ok: true, json: async () => levelResp });
    }
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, id: 1 }) });
  },
};
vm.createContext(ctx);
try {
  vm.runInContext(fn('setLevelOnScreen') + '\n' + fn('openEval'), ctx);
  const SCALE = L ? L.levelScaleForPortal() : [];
  const fresh = (extra = {}) => {
    const c = { kind: 'class', student_uid: 'kim01', student_name: 'Kim', room_id: 'class-9-20261027', class_date: '2026-10-27', level: 'Lv 5', ...extra };
    ctx.DATA = { today: '2026-10-27', me: { username: 'teacher1', name: 'Teacher One' }, level_scale: SCALE,
      classes: [c, { kind: 'class', student_uid: 'kim01', level: 'Lv 5', schedule_id: 2 }, { kind: 'class', student_uid: 'Kim01', level: 'Lv 1' }],
      upcoming: [{ kind: 'class', student_uid: 'kim01', level: 'Lv 5' }] };
    ctx.WK_DATA = { days: [{ items: [{ student_uid: 'kim01', level: 'Lv 5' }, { student_uid: 'other', level: 'Lv 2' }] }] };
    calls = []; levelMode = 'ok'; renders = 0; weekRenders = 0; ctx.lastSig = 'x'; confirmAnswer = true; confirms = [];
    return c;
  };
  const sendLog = async () => { await mask.querySelector('#ev-ok').onclick.call({ disabled: false, textContent: '' }); await tick(); };
  const msg = () => mask.querySelector('#ev-lv-msg');

  // D-1 그리기 — 목록·지금 값
  let c = fresh();
  ctx.openEval(c);
  let sel = mask.querySelector('#ev-lv');
  ok(!!sel, '서버 목록이 있으면 레벨 고르기 칸(select)이 그려진다');
  ok(sel && sel.groups.length === SCALE.length && sel.opts.length === SCALE[SCALE.length - 1].to, `  묶음 ${SCALE.length}개 · 레벨 ${SCALE.length ? SCALE[SCALE.length - 1].to : '?'}개`);
  ok(sel && sel.value === 'Lv 5' && !sel.opts.some((o) => o.value === ''), '  지금 값(Lv 5)이 골라져 있고 «미등록» 줄은 없다');
  ok(sel && /Starter \(Lv 1–4\)/.test(sel.groups[0]), '  묶음 이름에 Lv 구간이 붙는다(Starter (Lv 1–4))');
  ok(/Student level — pick to change \(asks before saving\)/.test(mask.innerHTML) && /id="ev-lv-msg"/.test(mask.innerHTML), '  안내 라벨과 결과 줄 자리');
  c = fresh({ level: null }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  ok(sel && sel.value === '' && sel.opts[0].value === '' && /Not set — choose a level/.test(sel.opts[0].text), '레벨이 없으면 «Not set — choose a level» 이 골라져 있다');
  c = fresh({ level: '<img src=x>' }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  ok(sel && sel.value === '' && sel.opts[0].text === '<img src=x> (current)' && !/<img src=x>/.test(mask.innerHTML), '목록에 없는 지금 값은 «(current)» 로 남기고 이스케이프한다');
  c = fresh(); ctx.DATA.level_scale = undefined; ctx.openEval(c);
  ok(!mask.querySelector('#ev-lv') && /Student level<\/b>: Lv 5/.test(mask.innerHTML), '(짝) 서버 목록이 없으면(옛 응답) 예전처럼 글자만 — 고르기 칸 없음');
  c = fresh({ student_uid: null }); ctx.openEval(c);
  ok(!mask.querySelector('#ev-lv'), '(짝) 학생 아이디가 없으면 고르기 칸 없음(누구 것인지 모른다)');

  // D-2 골라서 저장 — 성공
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelResp = { ok: true, level: 'Lv 12', previous: 'Lv 5' };
  const readBefore = ctx.WK_READ;
  sel.pick('Lv 12');
  ok(sel.disabled === true, '저장하는 동안 칸이 잠긴다');
  await tick();
  const lvCall = calls.find((x) => x.url === '/api/teacher/portal?part=level');
  ok(lvCall && lvCall.body.student_uid === 'kim01' && lvCall.body.level === 'Lv 12', 'POST /api/teacher/portal?part=level {student_uid, level}');
  ok(sel.disabled === false && sel.value === 'Lv 12', '  저장 뒤 칸이 풀리고 Lv 12');
  ok(/✅ Saved: Lv 12 \(was Lv 5\)/.test(msg().textContent) && !/lv-err/.test(msg().className), '  «✅ Saved: Lv 12 (was Lv 5)»');
  ok(c.level === 'Lv 12' && ctx.DATA.classes[1].level === 'Lv 12' && ctx.DATA.upcoming[0].level === 'Lv 12' && ctx.WK_DATA.days[0].items[0].level === 'Lv 12',
     '  같은 학생의 모든 줄(오늘·앞으로 7일·주간) 레벨이 함께 바뀐다');
  ok(ctx.DATA.classes[2].level === 'Lv 1' && ctx.WK_DATA.days[0].items[1].level === 'Lv 2', '  (짝) 다른 학생·대소문자만 다른 계정(Kim01)은 그대로');
  ok(renders === 1 && weekRenders === 1 && ctx.lastSig === null && ctx.WK_READ === readBefore + 1, '  목록을 다시 그리고(지문 지움) 진행 중이던 옛 읽기를 버린다');
  // 미등록에서 처음 정하면 «미등록» 줄이 사라진다
  c = fresh({ level: null }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelResp = { ok: true, level: 'Lv 3', previous: null };
  sel.pick('Lv 3'); await tick();
  ok(sel.value === 'Lv 3' && !sel.opts.some((o) => o.value === '') && /✅ Saved: Lv 3$/.test(msg().textContent), '미등록 → Lv 3: «미등록» 줄이 사라지고 «(was …)» 는 안 붙는다');

  // D-2b 확인창 — 저장 «전» 에 한 번 묻는다(2026-10-27 사장님 「2번 확인창 넣어줘」)
  //   «묻는다» 와 «취소하면 아무것도 안 나간다» 를 짝으로 본다 — 앞만 보면 «묻기만 하고 그냥 저장» 이 통과하고,
  //   뒤만 보면 «확인창을 통째로 빼기» 가 통과한다.
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelResp = { ok: true, level: 'Lv 12', previous: 'Lv 5' };
  sel.pick('Lv 12'); await tick();
  ok(confirms.length === 1, '고르면 저장 전에 확인창을 한 번 띄운다');
  ok(confirms[0] && /Change this student's level\?/.test(confirms[0]) && /\nKim\n/.test(confirms[0]) && /Lv 5 {2}→ {2}Lv 12/.test(confirms[0]),
     '  묻는 글자: 누구의(Kim) · 무엇에서 무엇으로(Lv 5 → Lv 12)');
  ok(confirms[0] && /Next time the student opens Judgment training, it restarts at this level/.test(confirms[0]) && /mode and age group, e\.g\. adult, go back to default/.test(confirms[0]),
     '  판단력 훈련이 «다음에 열 때» 다시 시작된다(모드·나이대 기본값)는 사실을 함께 말한다');
  ok(calls.some((x) => x.url === '/api/teacher/portal?part=level'), '  «확인» 이면 저장 요청이 나간다');
  // 취소 — 요청 0 · 칸 되돌림 · 안내 줄 그대로 · 화면 값 그대로
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  const msgBefore = msg().textContent;
  confirmAnswer = false;
  sel.pick('Lv 20'); await tick();
  ok(confirms.length === 1 && !calls.some((x) => x.url === '/api/teacher/portal?part=level'), '«취소» 면 저장 요청이 한 건도 안 나간다');
  ok(sel.value === 'Lv 5' && sel.disabled === false && c.level === 'Lv 5' && renders === 0, '  칸을 지금 값(Lv 5)으로 되돌리고 잠그지 않는다 · 화면 값·목록 그대로');
  ok(msg().textContent === msgBefore && !/lv-err/.test(msg().className), '  취소는 실패가 아니다 — 빨간 안내를 띄우지 않는다');
  // 취소한 뒤 다시 고르면 다시 묻고, 이번엔 저장된다(취소가 칸을 잠그지 않는다)
  confirmAnswer = true;
  sel.pick('Lv 20'); await tick();
  ok(confirms.length === 2 && calls.filter((x) => x.url === '/api/teacher/portal?part=level').length === 1, '  취소한 뒤 다시 고르면 다시 묻고 그때 저장한다');
  // 미등록에서 — «Not set → Lv 3» · 취소하면 «미등록» 줄로 돌아간다
  c = fresh({ level: null }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  confirmAnswer = false;
  sel.pick('Lv 3'); await tick();
  ok(confirms[0] && /Not set {2}→ {2}Lv 3/.test(confirms[0]), '미등록이면 «Not set → Lv 3» 으로 묻는다');
  ok(sel.value === '' && sel.opts[0].value === '' && !calls.some((x) => x.url === '/api/teacher/portal?part=level'), '  취소하면 «미등록» 줄로 돌아가고 요청 0');
  // 목록에 없는 지금 값(옛 표기 'Lv 40') — 취소·실패하면 «Lv 40 (current)» 줄로 돌아가야 한다(빈 칸이 되면 안 된다).
  //   value 만 보면 빈 칸(-1)도 '' 라서 못 가른다 — selectedIndex 로 «그 줄이 골라졌나» 를 본다.
  c = fresh({ level: 'Lv 40' }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  ok(sel && sel.selectedIndex === 0 && sel.opts[0].value === '' && /^Lv 40 \(current\)$/.test(sel.opts[0].text), '전제: 옛 표기 Lv 40 은 «Lv 40 (current)» 줄이 골라져 있다');
  confirmAnswer = false;
  sel.pick('Lv 7'); await tick();
  ok(confirms[0] && /Lv 40 {2}→ {2}Lv 7/.test(confirms[0]), '  옛 표기에서도 «Lv 40 → Lv 7» 로 묻는다');
  ok(sel.selectedIndex === 0 && !calls.some((x) => x.url === '/api/teacher/portal?part=level'), '  취소하면 «Lv 40 (current)» 줄로 돌아간다(빈 칸 아님) · 요청 0');
  confirmAnswer = true; levelResp = { ok: false, error: 'db_error' };
  sel.pick('Lv 7'); await tick();
  ok(sel.selectedIndex === 0 && /lv-err/.test(msg().className), '  저장이 실패해도 «Lv 40 (current)» 줄로 돌아간다(빈 칸 아님)');
  // 고르는 값이 아닌 줄·저장 중에는 묻지도 않는다
  c = fresh({ level: null }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  sel.pick(''); await tick();
  ok(confirms.length === 0, '«미등록» 줄(빈 값)을 고르면 묻지도 않는다');
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelMode = 'defer'; levelResp = { ok: true, level: 'Lv 9', previous: 'Lv 5' };
  sel.pick('Lv 9'); await tick();
  sel.pick('Lv 10'); await tick();
  ok(confirms.length === 1, '저장 중에 다시 골라도 두 번째 확인창을 띄우지 않는다');
  release(); await tick();

  // D-3 실패 — 되돌린다
  for (const [code, re] of [['not_your_student', /not in your class list/], ['not_found', /not in the student list/], ['bad_level', /cannot be chosen/], ['auth_required', /log in again/], ['db_error', /check your connection/]]) {
    c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
    levelResp = { ok: false, error: code };
    sel.pick('Lv 20'); await tick();
    ok(sel.value === 'Lv 5' && c.level === 'Lv 5' && ctx.DATA.classes[1].level === 'Lv 5' && renders === 0
       && /lv-err/.test(msg().className) && re.test(msg().textContent) && sel.disabled === false,
       `서버 거절(${code}) → 칸을 Lv 5 로 되돌리고 빨간 안내 · 화면 값 안 바뀜`);
  }
  // 범위 밖(2026-10-28) — «며칠» 은 서버 값만 쓰고, 이상한 값이면 숫자 없이 말한다
  for (const [resp, re, title] of [
    [{ ok: false, error: 'level_window_closed', past_days: 14 }, /taught in the last 14 days, or who have a weekly class/, '범위 밖(past_days 14) → «last 14 days … weekly class»'],
    [{ ok: false, error: 'level_window_closed' }, /taught recently, or who have a weekly class/, '  past_days 가 없으면 숫자 없이 «recently»'],
    [{ ok: false, error: 'level_window_closed', past_days: '14<b>' }, /taught recently/, '  past_days 가 이상하면(글자 섞임) 숫자를 안 그린다'],
    [{ ok: false, error: 'level_window_closed', past_days: 99999 }, /taught recently/, '  past_days 가 터무니없으면(99999) 숫자를 안 그린다'],
  ]) {
    c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
    levelResp = resp; sel.pick('Lv 20'); await tick();
    ok(sel.value === 'Lv 5' && /lv-err/.test(msg().className) && re.test(msg().textContent) && !/not in your class list/.test(msg().textContent), title);
  }
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelMode = 'reject'; sel.pick('Lv 20'); await tick();
  ok(sel.value === 'Lv 5' && /check your connection/.test(msg().textContent) && sel.disabled === false, '연결이 끊기면 되돌리고 «다시 골라 주세요»');
  c = fresh({ level: null }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelResp = { ok: false, error: 'db_error' }; sel.pick('Lv 7'); await tick();
  ok(sel.value === '' && c.level === null, '미등록에서 실패하면 «미등록» 으로 되돌아간다');
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelResp = { ok: true };           // ok 인데 level 이 없다 — «저장했다» 고 믿지 않는다
  sel.pick('Lv 20'); await tick();
  ok(sel.value === 'Lv 5' && /lv-err/.test(msg().className), '응답에 level 이 없으면 성공으로 보지 않는다');
  c = fresh({ level: null }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  sel.pick(''); await tick();
  ok(!calls.some((x) => x.url === '/api/teacher/portal?part=level'), '«미등록» 줄을 고르면 아무 요청도 안 나간다');

  // D-4 «보내기» 는 레벨 저장이 끝날 때까지 기다린다
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  mask.querySelector('#ev-ko').value = '오늘 수업에 잘 참여했습니다.';
  mask.querySelector('#ev-en').value = 'Participated well today.';
  levelMode = 'defer'; levelResp = { ok: true, level: 'Lv 12', previous: 'Lv 5' };
  sel.pick('Lv 12'); await tick();
  await sendLog();
  ok(!calls.some((x) => x.url === '/api/eval/manual-create'), '레벨 저장 중에 «보내기» 를 누르면 일지를 안 보낸다');
  ok(/still saving/.test(mask.querySelector('#ev-msg').innerHTML), '  «레벨을 저장하는 중» 안내');
  ok(sel.pick('Lv 20') === undefined && calls.filter((x) => x.url === '/api/teacher/portal?part=level').length === 1, '  저장 중에는 다시 골라도 두 번째 요청이 안 나간다');
  release(); await tick();
  await sendLog();
  const sent = calls.find((x) => x.url === '/api/eval/manual-create');
  ok(!!sent && sent.body.student_uid === 'kim01', '  저장이 끝난 뒤에는 일지가 그대로 나간다');
  ok(sent && !('level' in sent.body) && !('student_level' in sent.body), '  일지 본문에는 레벨을 싣지 않는다(서버가 원부에서 읽는다)');

  // D-5 한국어 화면
  lang = 'ko';
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  ok(/학생 레벨 — 고르면 한 번 묻고 저장해요/.test(mask.innerHTML) && sel && /첫걸음 \(Lv 1–4\)/.test(sel.groups[0]), '한국어 화면: 라벨·묶음 이름(첫걸음)');
  levelResp = { ok: true, level: 'Lv 12', previous: 'Lv 5' }; sel.pick('Lv 12'); await tick();
  ok(/✅ 저장했어요: Lv 12 \(전: Lv 5\)/.test(msg().textContent), '한국어 화면: «✅ 저장했어요: Lv 12 (전: Lv 5)»');
  ok(confirms[0] && /이 학생의 레벨을 바꿀까요\?/.test(confirms[0]) && /Lv 5 {2}→ {2}Lv 12/.test(confirms[0]) && /학생이 다음에 판단력 훈련을 열 때 이 레벨부터 다시 시작해요/.test(confirms[0]),
     '한국어 화면: 확인창 «이 학생의 레벨을 바꿀까요?» · Lv 5 → Lv 12 · 판단력 훈련 안내');
  c = fresh({ level: null }); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  ok(sel && /미등록 — 레벨을 골라 주세요/.test(sel.opts[0].text), '한국어 화면: «미등록 — 레벨을 골라 주세요»');
  levelResp = { ok: false, error: 'not_your_student' }; sel.pick('Lv 2'); await tick();
  ok(/내 수업 학생이 아니라/.test(msg().textContent), '한국어 화면: 거절 안내');
  c = fresh(); ctx.openEval(c); sel = mask.querySelector('#ev-lv');
  levelResp = { ok: false, error: 'level_window_closed', past_days: 14 }; sel.pick('Lv 2'); await tick();
  ok(/최근 14일 안에 수업했거나 지금 매주 수업 중인 학생만/.test(msg().textContent), '한국어 화면: 범위 밖 안내 «최근 14일 … 매주 수업 중인 학생만»');
  lang = 'en';
} catch (e) {
  ok(false, 'D 절 실행 중 예외: ' + (e && e.stack || e));
}

/* ── E. 색 — 실패 안내가 읽히는가(라이트·다크) ─────────────────────────── */
console.log('\n[E] 실패 안내 글자색 대비');
try {
  const full = (h) => (h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h);   // #fff → #ffffff
  const hex = (h) => [1, 3, 5].map((i) => parseInt(full(h).slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const light = (HTML.match(/\n\.mini\.lv-err\{color:(#[0-9a-f]{6})\}/i) || [])[1];
  const dark = (HTML.match(/html\[data-t="dark"\] \.mini\.lv-err\{color:(#[0-9a-f]{6})\}/i) || [])[1];
  const darkBg = (HTML.match(/html\[data-t="dark"\] \.modal\{background:(#[0-9a-f]{6}|#[0-9a-f]{3})\}/i) || [])[1];
  const lightBg = (HTML.match(/\n\.modal\{background:(#[0-9a-f]{6}|#[0-9a-f]{3})[;}]/i) || [])[1];
  ok(light && lightBg && cr(light, lightBg) >= 4.5, `라이트: ${light} on ${lightBg} = ${light && lightBg ? cr(light, lightBg).toFixed(2) : '?'} (≥4.5)`);
  ok(dark && darkBg && cr(dark, darkBg) >= 4.5, `다크: ${dark} on ${darkBg} = ${dark && darkBg ? cr(dark, darkBg).toFixed(2) : '?'} (≥4.5)`);
} catch (e) {
  ok(false, 'E 절 실행 중 예외: ' + (e && e.stack || e));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패 목록:\n - ' + FAILS.join('\n - ')); process.exit(1); }
