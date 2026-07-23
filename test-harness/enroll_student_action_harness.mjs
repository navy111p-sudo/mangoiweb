// 🎓 enroll_student 액션 실행 하니스 (2026-07-23)
//   AI 운영비서가 "아이디/비번 + 강사 + 요일 + 시간" 으로 요청하면 실제로
//   ① 학생계정 생성 ② 비밀번호 해시 저장 ③ 강사 매칭 ④ 요일별 반복수업 등록 이 되는지
//   메모리 SQLite 를 D1 처럼 꽂아 '진짜 실행'으로 검증한다. (실서비스 DB 는 건드리지 않는다)
//
//   ⚠️ src/ai-command.ts 를 임시 폴더에 컴파일해서 돌린다. tsc 가 없으면 SKIP.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const CFD = resolve(HERE, '../cloudflare-deploy');
const SRC = join(CFD, 'src');
const require_ = createRequire(import.meta.url);

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) pass++;
  else { fail++; console.log('  ❌ ' + name + (got !== undefined ? '  → ' + JSON.stringify(got) : '')); }
};

// ── 1) ai-command.ts 컴파일 ──
const out = mkdtempSync(join(tmpdir(), 'enrollact-'));
const cfgPath = join(out, 'tsconfig.json');
const fwd = (p) => p.replace(/\\/g, '/');
writeFileSync(cfgPath, JSON.stringify({
  compilerOptions: {
    target: 'ES2022', lib: ['ES2022', 'WebWorker'], module: 'CommonJS', moduleResolution: 'node',
    outDir: fwd(join(out, 'build')), rootDir: fwd(SRC), strict: false, esModuleInterop: true, skipLibCheck: true,
    types: ['@cloudflare/workers-types'], typeRoots: [fwd(join(CFD, 'node_modules/@types')), fwd(join(CFD, 'node_modules'))]
  },
  include: [fwd(join(SRC, 'ai-command.ts')), fwd(join(SRC, 'class-audit.ts'))]
}));
try {
  // npx 는 Windows 에서 execFileSync 로 못 부른다(EINVAL) → tsc.js 를 node 로 직접 실행
  execFileSync(process.execPath, [join(CFD, 'node_modules/typescript/lib/tsc.js'), '-p', cfgPath], { cwd: CFD, stdio: 'pipe' });
} catch (e) {
  console.log('⏭ SKIP — tsc 컴파일 불가 (' + String(e.message).slice(0, 120) + ')');
  rmSync(out, { recursive: true, force: true });
  process.exit(0);
}

let DatabaseSync;
try { ({ DatabaseSync } = require_('node:sqlite')); }
catch { console.log('⏭ SKIP — node:sqlite 없음 (Node 22+ 필요)'); rmSync(out, { recursive: true, force: true }); process.exit(0); }

const { executeAction } = require_(join(out, 'build', 'ai-command.js'));

// ── 2) D1 흉내 (메모리 SQLite) ──
const db = new DatabaseSync(':memory:');
const clean = (r) => (r ? Object.assign({}, r) : null);
const DB = {
  exec: async (sql) => { db.exec(sql); },
  prepare: (sql) => {
    const mk = (args) => ({
      first: async () => clean(db.prepare(sql).get(...args)),
      all: async () => ({ results: db.prepare(sql).all(...args).map(clean) }),
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    });
    const base = mk([]);
    base.bind = (...args) => mk(args);
    return base;
  },
  batch: async (stmts) => { for (const s of stmts) await s.run(); },
};
const kv = new Map();
const env = { DB, SESSION_STATE: { put: async (k, v) => kv.set(k, v), get: async (k) => kv.get(k) || null } };

// 최소 스키마 — 나머지 컬럼은 액션이 ALTER 로 보강한다
db.exec(`CREATE TABLE students_erp (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT)`);
db.exec(`CREATE TABLE teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, status TEXT, active INTEGER, created_at INTEGER, updated_at INTEGER)`);
db.exec(`CREATE TABLE teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT, english_name TEXT)`);
db.prepare(`INSERT INTO teachers (name, status, active) VALUES ('Melca', '활동중', 1)`).run();
db.prepare(`INSERT INTO teacher_profiles (korean_name, english_name) VALUES ('강선생님', 'Teacher Kang')`).run();

const A = (args) => executeAction(env, 'enroll_student', args, 'tester');

// ── 3) 신규 학생 + teachers 에 있는 강사 ──
{
  const r = await A({
    student: { login_id: 'jeong01', password: 'mango1234', name: 'Jeong' },
    teacher_name: 'Melca', days: ['tue', 'wed', 'thu', 'fri'], time: '19:20',
  });
  ok('등록 성공', r.ok === true, r);
  ok('4건 등록', r.inserted_count === 4, r.inserted_count);
  ok('학생 신규 생성', r.student_created === true);
  ok('비밀번호 설정됨', r.password_set === true);
  ok('강사 매칭', r.teacher_name === 'Melca' && r.teacher_id, r.teacher_id);
  ok('요약 한/영 둘 다', !!r.summary && !!r.summary_en, [r.summary, r.summary_en]);

  const rows = db.prepare(`SELECT day_of_week, start_time, duration_min, schedule_kind, teacher_id, source FROM class_schedules ORDER BY id`).all();
  ok('요일별 1행씩', rows.length === 4 && rows.map(x => x.day_of_week).join(',') === 'tue,wed,thu,fri', rows.map(x => x.day_of_week));
  ok('시간·길이 저장', rows[0].start_time === '19:20' && rows[0].duration_min === 20, rows[0]);
  ok('반복 스케줄', rows[0].schedule_kind === 'recurring' && rows[0].source === 'ai_enroll', rows[0]);

  const stu = db.prepare(`SELECT user_id, korean_name, password_hash FROM students_erp WHERE user_id='jeong01'`).get();
  ok('학생 계정 저장', stu && stu.korean_name === 'Jeong', stu);
  // api-students.ts 의 hashPwd 와 같은 해시여야 학생 로그인이 된다
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mango1234|mangoi-salt-2026'));
  const want = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  ok('비밀번호 해시가 학생 로그인과 동일 규칙', stu && stu.password_hash === want, stu && stu.password_hash);
  ok('감사기록에 비번 없음', !JSON.stringify([...kv.values()]).includes('mango1234'));
}

// ── 4) 같은 요청 재실행 = 멱등 (중복 수업이 안 생겨야 함) ──
{
  const r = await A({ student: { login_id: 'jeong01' }, teacher_name: 'Melca', days: ['tue', 'wed'], time: '19:20' });
  ok('중복 등록 안 함', r.inserted_count === 0 && r.skipped_count === 2, r);
  const n = db.prepare(`SELECT COUNT(*) AS c FROM class_schedules`).get().c;
  ok('총 4건 유지', n === 4, n);
}

// ── 5) teacher_profiles 에만 있는 강사 → teachers 에 등재 후 연결 ──
{
  const r = await A({ student: { login_id: 'kim02', name: '김민준' }, teacher_name: '강선생님', days: ['mon'], time: '17:00' });
  ok('프로필 전용 강사도 연결', r.ok && r.teacher_id && r.teacher_created === true, { t: r.teacher_id, c: r.teacher_created });
  ok('경고 한/영 동시 제공', r.warnings.length > 0 && r.warnings_en.length === r.warnings.length, [r.warnings, r.warnings_en]);
  const t = db.prepare(`SELECT name FROM teachers WHERE id=?`).get(Number(r.teacher_id));
  ok('teachers 에 실제 등재', t && t.name === '강선생님', t);
}

// ── 6) 강사 시간 겹침 경고 (등록은 하되 알림) ──
{
  const r = await A({ student: { login_id: 'lee03' }, teacher_name: 'Melca', days: ['tue'], time: '19:20' });
  ok('겹쳐도 등록은 됨', r.inserted_count === 1, r.inserted_count);
  ok('강사 중복 경고', r.items[0].teacher_conflict && r.warnings.length > 0, r.items[0]);
}

// ── 7) 입력 검증 ──
{
  ok('아이디 필수', (await A({ student: {}, days: ['mon'], time: '10:00' })).error === 'login_id_required');
  ok('아이디 형식', (await A({ student: { login_id: 'a b!' }, days: ['mon'], time: '10:00' })).error === 'bad_login_id');
  ok('요일 필수', (await A({ student: { login_id: 'zz99' }, days: [], time: '10:00' })).error === 'days_required');
  ok('시간 필수', (await A({ student: { login_id: 'zz99' }, days: ['mon'], time: '' })).error === 'time_required');
  ok('시간 범위', (await A({ student: { login_id: 'zz99' }, days: ['mon'], time: '99:99' })).error === 'bad_time');
  ok('약한 비번 거부', (await A({ student: { login_id: 'zz99', password: '12' }, days: ['mon'], time: '10:00' })).error === 'weak_password');
  ok('허용 액션만', (await executeAction(env, 'drop_everything', {}, 'tester')).error === 'action_not_allowed');
  const n = db.prepare(`SELECT COUNT(*) AS c FROM class_schedules`).get().c;
  ok('검증 실패는 아무것도 안 씀', n === 6, n);
}

// ── 8) 요일 표기가 한글/숫자로 와도 정규화 ──
{
  const r = await A({ student: { login_id: 'park04' }, teacher_name: 'Melca', days: ['월', '3', 'Fri'], time: '08:30' });
  ok('한글·숫자·영문 요일 정규화', JSON.stringify(r.days) === '["mon","wed","fri"]', r.days);
}

rmSync(out, { recursive: true, force: true });
console.log((fail ? '❌' : '✅') + ' enroll_student action: ' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
