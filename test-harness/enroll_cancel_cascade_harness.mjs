// -*- coding: utf-8 -*-
// 🧪 수강신청 «✕ 취소» → 그 신청이 만든 남은 수업도 함께 종료 (2026-10-08 사장님 지시)
//   실행:  node test-harness/enroll_cancel_cascade_harness.mjs
//
//   [무슨 일이었나] 신청 목록의 「✕ 취소」는 enrollments.status 한 칸만 바꾸고, 그 신청이 만든
//     수업(class_schedules.source='adm-enroll:<id>')은 그대로 살아 있었다.
//
//   [이 하니스가 실제로 하는 일 — 문자열 검사만 하지 않는다]
//     A. 정본 src/enroll-cancel-cascade.ts 를 node 타입 제거로 «실제로» 돌려 경계값을 넣는다
//        (내린다 / 지난 것은 안 내린다 / 되살린다 / 안 되살린다 — 짝으로).
//     B. api-admin.ts 의 PATCH /api/admin/enrollments/:id 핸들러를 중괄호 짝으로 오려 내
//        «진짜 SQLite» 위에서 실행한다 — 취소하면 남은 수업만 cancelled 가 되는가, 강사는 막히는가,
//        되살리기가 이번에 내린 것만 되살리는가, 남의 신청 수업은 안 건드리는가.
//     C. 화면(adm-core.js)이 확인창에서 «수업도 종료» 를 말하고 결과 건수를 그리는가.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const SELF = fileURLToPath(import.meta.url);
if (!process.env.__ECC_CHILD) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', SELF], { encoding: 'utf8', env: { ...process.env, __ECC_CHILD: '1' } });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exit(r.status == null ? 1 : r.status);
}

const ROOT = join(dirname(SELF), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const ADMIN = readFileSync(process.env.ECC_ADMIN_SRC || join(SRC, 'api-admin.ts'), 'utf8');
const CORE = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/adm-core.js'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

function braceBlock(src, openIdx) {
  let depth = 0, i = openIdx, inStr = null, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}

const M = await import(pathToFileURL(process.env.ECC_RULE_SRC || join(SRC, 'enroll-cancel-cascade.ts')).href);

// 기준 시각: 2026-10-08 14:00 KST
const NOW = Date.parse('2026-10-08T05:00:00Z');

console.log('\n── A. 정본 규칙 (실제로 실행)');
{
  const rows = [
    { id: 1, scheduled_date: '2026-10-09', start_time: '10:00', status: 'active' },   // 내일 → 내림
    { id: 2, scheduled_date: '2026-10-07', start_time: '21:00', status: 'active' },   // 어제 → 그대로
    { id: 3, scheduled_date: '2026-10-08', start_time: '13:00', status: 'active' },   // 오늘 지난 시각 → 그대로
    { id: 4, scheduled_date: '2026-10-08', start_time: '15:20', status: 'active' },   // 오늘 아직 → 내림
    { id: 5, scheduled_date: null, start_time: '21:10', status: 'active' },           // 매주 반복 → 안 내림(급여)
    { id: 9, scheduled_date: '2026-10-20', start_time: '10:00', status: 'postponed' },// 연기 → 안 건드림
    { id: 6, scheduled_date: '2026-10-20', start_time: '10:00', status: 'cancelled' },// 이미 취소 → 무시
    { id: 7, scheduled_date: '2026/10/20', start_time: '10:00', status: 'active' },   // 못 읽는 날짜 → 그대로
    { id: 8, scheduled_date: '2026-10-08', start_time: '', status: 'active' },        // 오늘·시각 모름 → 그대로
  ];
  const p = M.pickClassesToEnd(rows, NOW);
  const end = p.end.slice().sort((a, b) => a - b).join(',');
  check('남은 수업만 내린다 (1,4)', end === '1,4');
  check('매주 반복 줄은 안 내린다 (급여가 그 달 전체를 펼침)', !p.end.includes(5));
  check('active 가 아닌(연기) 수업은 안 건드린다', !p.end.includes(9));
  check('지난 수업은 안 내린다 (어제·오늘 지난 시각)', !p.end.includes(2) && !p.end.includes(3));
  check('못 읽는 날짜·시각은 안 내린다 (모르면 안 바꿈)', !p.end.includes(7) && !p.end.includes(8));
  check('이미 취소된 줄은 다시 세지 않는다', !p.end.includes(6));
  check('세는 숫자: 매주 1 · 지난 것 4', p.weekly === 1 && p.past === 4);

  const after = rows.map((r) => p.end.includes(r.id) ? { ...r, status: 'cancelled' } : r);
  const back = M.pickClassesToRestore(after, p.end, NOW);
  check('되살리기: 이번에 내린 것 중 날짜가 있고 안 지난 것만 (1,4)', back.restore.slice().sort().join(',') === '1,4');
  check('되살리기: 안 내린 매주 반복 줄은 대상이 아니다', !back.restore.includes(5) && back.skipped === 0);
  check('되살리기: 이번에 안 내린(원래 취소된) 수업은 안 되살린다', !back.restore.includes(6));
  const later = M.pickClassesToRestore(after, p.end, Date.parse('2026-10-10T00:00:00Z'));
  check('되살리기: 그 사이 지나 버린 수업은 안 되살린다', !later.restore.includes(1) && later.restore.length === 0);
  check('저장 목록이 깨져 있으면 빈 목록', M.parseSavedIds('{bad').length === 0 && M.parseSavedIds('[3,"4",-1]').join(',') === '3,4');
  check('KST 자정 경계: 15:30Z = 다음날 00:30 KST', M.kstNow(Date.parse('2026-10-08T15:30:00Z')).date === '2026-10-09');
}

console.log('\n── B. PATCH 핸들러를 진짜 SQLite 위에서 실행');
const anchor = "if (method === 'PATCH' && /^\\/api\\/admin\\/enrollments\\/\\d+$/.test(path)) {";
const at = ADMIN.indexOf(anchor);
check('전제: PATCH 핸들러를 찾았다', at >= 0);
let block = at >= 0 ? braceBlock(ADMIN, at + anchor.length - 1) : '';
check('전제: 핸들러 몸통을 오려 냈다', block.length > 1000);
const body = block.slice(1, -1)
  .replace(/\(env as any\)/g, '(env)')
  .replace(/ as any\[\]/g, '').replace(/ as any/g, '')
  .replace(/: any\[\]/g, '').replace(/: any/g, '');

const { DatabaseSync } = await import('node:sqlite');
function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, teacher_id TEXT, scheduled_date TEXT, start_time TEXT, status TEXT, source TEXT, updated_at INTEGER);`);
  db.prepare(`INSERT INTO enrollments (id, student_user_id, student_name, status, created_at, updated_at) VALUES (124,'delaware','김연숙','confirmed',0,0), (125,'other','남','confirmed',0,0)`).run();
  const ins = db.prepare(`INSERT INTO class_schedules (id,user_id,teacher_id,scheduled_date,start_time,status,source) VALUES (?,?,?,?,?,?,?)`);
  ins.run(1, 'delaware', '7', '2026-09-30', '21:10', 'active', 'adm-enroll:124');  // 지난 수업
  ins.run(2, 'delaware', '7', '2026-10-14', '21:10', 'active', 'adm-enroll:124');
  ins.run(3, 'delaware', '7', '2026-10-21', '21:10', 'active', 'adm-enroll:124');
  ins.run(4, 'delaware', '7', null, '21:10', 'active', 'adm-enroll:124');          // 매주 반복
  ins.run(5, 'other', '8', '2026-10-14', '20:00', 'active', 'adm-enroll:125');      // 남의 신청
  ins.run(6, 'delaware', '7', '2026-10-28', '21:10', 'active', 'adm-enroll:1240');  // 접두사만 같은 남
  ins.run(7, 'delaware', '7', '2026-11-04', '21:10', 'postponed', 'adm-enroll:124'); // 연기된 미래 수업
  const wrap = (sql) => {
    const st = { args: [], sql };
    st.bind = (...a) => { st.args = a; return st; };
    st.first = async () => db.prepare(sql).get(...st.args) ?? null;
    st.all = async () => ({ results: db.prepare(sql).all(...st.args) });
    st.run = async () => { const r = db.prepare(sql).run(...st.args); return { meta: { changes: Number(r.changes) } }; };
    return st;
  };
  return { db, env: { DB: {
    prepare: wrap,
    exec: async (sql) => { db.exec(sql); },
    batch: async (stmts) => { db.exec('BEGIN'); try { for (const s of stmts) db.prepare(s.sql).run(...s.args); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return []; },
  } } };
}

let runner = null;
try {
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  runner = new AsyncFn('method', 'path', 'request', 'env', 'json', 'invalidBody', 'parseJsonBody', 'getAdminActor', 'enrollAdminHqOnly', 'forbiddenTeacherBody', 'writeClassAudit', 'setOverridePhones', 'pickClassesToEnd', 'pickClassesToRestore', 'parseSavedIds', body);
} catch (e) { console.log('   (컴파일 실패: ' + e.message + ')'); }
check('전제: 핸들러를 실행할 수 있게 만들었다', !!runner);

const audits = [];
async function call(env, id, payload, actor) {
  const json = (o, st = 200) => ({ __st: st, ...o });
  try {
    return await runner('PATCH', '/api/admin/enrollments/' + id, {}, env, json, (f) => ({ __st: 400, error: 'invalid', f }),
      async () => payload, async () => actor, async () => (actor && !actor.isTeacher && !actor.unknown ? null : { __st: 403, ok: false, error: 'forbidden' }), (a, d) => ({ ok: false, error: 'forbidden_teacher', detail: d }),
      async (_e, a) => { audits.push(a); }, async () => ({ ok: true }),
      M.pickClassesToEnd, M.pickClassesToRestore, M.parseSavedIds);
  } catch (e) { return { __st: 'crash', error: String(e && e.message || e) }; }
}
const realNow = Date.now;
Date.now = () => NOW;
try {
  const HQ = { ok: true, isTeacher: false, name: '본사' };
  const TEACHER = { ok: true, isTeacher: true, name: '강사' };
  const st = (db, id) => db.prepare('SELECT status FROM class_schedules WHERE id=?').get(id).status;
  const est = (db, id) => db.prepare('SELECT status FROM enrollments WHERE id=?').get(id).status;

  { const { db, env } = mkEnv();
    const r = await call(env, 124, { status: 'cancelled' }, TEACHER);
    check('강사는 취소(=수업 종료) 못 한다 → 403', r.__st === 403);
    check('강사가 막히면 수업·신청 모두 그대로', st(db, 2) === 'active' && est(db, 124) === 'confirmed'); }

  { const { db, env } = mkEnv();
    const r = await call(env, 124, { status: 'cancelled' }, HQ);
    check('본사 취소 → ok', r.__st === 200 && r.ok === true);
    check('신청서 상태가 cancelled', est(db, 124) === 'cancelled');
    check('남은 수업(10/14·10/21)이 cancelled', st(db, 2) === 'cancelled' && st(db, 3) === 'cancelled');
    check('매주 반복 줄은 그대로 active (급여)', st(db, 4) === 'active');
    check('연기된 미래 수업은 그대로 postponed', st(db, 7) === 'postponed');
    check('지난 수업(9/30)은 그대로 active', st(db, 1) === 'active');
    check('남의 신청 수업은 안 건드린다', st(db, 5) === 'active');
    check('접두사만 같은 신청(1240) 수업은 안 건드린다', st(db, 6) === 'active');
    check('응답이 내린 건수·남긴 반복 줄을 말한다 (2·1)', r.ended_classes === 2 && r.weekly_left === 1 && r.past_kept === 1);
    check('이력을 남긴다', audits.some((a) => a && /수강신청 취소/.test(a.reason || '')));

    const r2 = await call(env, 124, { status: 'pending' }, HQ);
    check('되살리기 → ok', r2.__st === 200 && r2.ok === true && est(db, 124) === 'pending');
    check('되살리기: 날짜 지정 수업 2건이 active 로', st(db, 2) === 'active' && st(db, 3) === 'active' && r2.restored_classes === 2);
    check('되살리기: 건너뛴 것 없음', r2.restore_skipped === 0);
    check('되살리기: 연기 수업은 여전히 postponed (active 로 안 바뀜)', st(db, 7) === 'postponed');
    check('되살리기도 이력을 남긴다', audits.some((a) => a && a.action === 'restore'));
    check('되살린 뒤 저장 목록을 비운다', db.prepare('SELECT cancelled_class_ids c FROM enrollments WHERE id=124').get().c == null); }

  { const { db, env } = mkEnv();
    await call(env, 124, { status: 'cancelled' }, HQ);
    db.prepare(`INSERT INTO class_schedules (id,user_id,teacher_id,scheduled_date,start_time,status,source) VALUES (9,'delaware','9','2026-10-14','21:10','active','manual')`).run();
    const r = await call(env, 124, { status: 'confirmed' }, HQ);
    check('같은 시각에 이미 다른 수업이 있으면 그 줄은 안 되살린다', st(db, 2) === 'cancelled' && st(db, 3) === 'active' && r.restore_skipped === 1); }

  { const { db, env } = mkEnv();
    await call(env, 124, { status: 'cancelled' }, HQ);
    const r = await call(env, 124, { status: 'pending' }, TEACHER);
    check('강사는 되살리기(수업 다시 열기)도 못 한다 → 403', r.__st === 403 && st(db, 2) === 'cancelled' && est(db, 124) === 'cancelled'); }

  { const { db, env } = mkEnv();
    const r = await call(env, 124, { status: 'cancelled' }, { ok: true, isTeacher: false, unknown: true });
    check('본사 판정 정본이 막으면(스코프 모름) 취소도 안 된다', r.__st === 403 && st(db, 2) === 'active'); }

  { const { db, env } = mkEnv();
    const bad = { ...env, DB: { ...env.DB, batch: async () => { throw new Error('batch down'); } } };
    const r = await call(bad, 124, { status: 'cancelled' }, HQ);
    check('batch 가 실패하면 503 + 수업·신청 그대로', r.__st === 503 && st(db, 2) === 'active' && est(db, 124) === 'confirmed'); }

  { const { db, env } = mkEnv();
    db.prepare(`UPDATE class_schedules SET status='cancelled' WHERE id=3`).run();   // 취소 전에 사람이 따로 내린 수업
    await call(env, 124, { status: 'cancelled' }, HQ);
    await call(env, 124, { status: 'pending' }, HQ);
    check('취소 «전» 에 따로 내린 수업은 되살리지 않는다', st(db, 3) === 'cancelled' && st(db, 2) === 'active'); }

  { const { db, env } = mkEnv();
    const r = await call(env, 124, { status: 'active' }, TEACHER);
    check('취소가 아닌 상태 변경은 예전처럼 된다(강사 포함)', r.ok === true && est(db, 124) === 'active' && st(db, 2) === 'active'); }

  { const { db, env } = mkEnv();
    const bad = { ...env, DB: { ...env.DB, prepare: (sql) => { const s = env.DB.prepare(sql); if (/FROM class_schedules WHERE source = \? AND status = 'active'/.test(sql)) s.all = async () => { throw new Error('D1 down'); }; return s; } } };
    const r = await call(bad, 124, { status: 'cancelled' }, HQ);
    check('수업 목록을 못 읽으면 신청도 안 바꾼다 (503)', r.__st === 503 && est(db, 124) === 'confirmed'); }
} finally { Date.now = realNow; }

console.log('\n── C. 화면 문구');
{
  const fn = (() => { const i = CORE.indexOf('async function setEnrollmentStatus('); return i < 0 ? '' : braceBlock(CORE, CORE.indexOf('{', i)); })();
  check('확인창이 «남은 수업도 종료» 를 말한다 (KO)', /아직 안 지난 수업도 함께 종료/.test(fn));
  check('확인창이 «남은 수업도 종료» 를 말한다 (EN)', /will be ended too/.test(fn));
  check('옛 문구(«이 신청 건만 취소로 표시») 를 안 쓴다', !/이 신청 건만 취소로 표시/.test(fn));
  check('결과 토스트가 내린·되살린 건수를 그린다', /d\.ended_classes/.test(fn) && /d\.restored_classes/.test(fn));
  check('성공 판정은 ok === true 로', /d\.ok !== true/.test(fn));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패: ' + FAILS.join(' | ')); process.exit(1); }
