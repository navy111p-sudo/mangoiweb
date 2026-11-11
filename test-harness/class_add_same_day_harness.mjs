import { adminSrcUsing as readAdminModuleGraph } from './_srcbundle.mjs';
/**
 * ➕ «옮기기» 를 «수업 추가» 로 한 것을 막고, 추가한 수업도 «누가·언제» 가 칸에 남는가 (2026-11-11)
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 이 하니스가 있나
 *   2026-11-10 매니저(Melca)가 KAYE 의 김선우(jye46712) 13:20 수업(#4284)을 21:30 으로 «옮긴다» 며
 *   「수업 추가」를 눌렀다(#8370, 이력 action='add'). 원래 수업은 그대로 열려 있었고(강사가 13:20·21:34 두 번 옛 방에 들어감),
 *   «오늘 수업» 「취소·연기」 칸은 «—» 였다 — 그 칸은 연기·변경·취소 이력만 읽었기 때문(D1 실측).
 *   매니저 요청: «옮기거나 연기·취소한 정확한 시각을 Mangoi AI 에 보여 달라».
 *
 * 지키는 것
 *   A. 정본 sameDayAddNotice(schedule-conflict.ts) — 같은 날 수업이 있으면 문구(시각 포함), 없으면 null
 *   B. 정본 judgeClassChange(class-change-state.ts) — 'add' 이력이면 «➕ 추가된 수업» + 언제(누가는 showActor 일 때만)
 *      짝: 옮김이 있으면 옮김이 먼저 · 취소가 먼저 · 매주 반복 행은 null · 이력 없으면 null
 *   C. 실제 핸들러(POST /api/admin/class-schedules) + 진짜 SQLite —
 *      같은 날 다른 시각 → 409 conflict(행 안 생김) · force → 등록 · 다른 날·빈 날 → 바로 등록(짝)
 *      그리고 그 등록이 남긴 이력을 실제 조회(loadClassChangeAudits)로 읽어 «➕ 추가된 수업» 이 되는가
 *
 * 변이시험: src 를 임시 폴더로 «복사» 한 뒤 복사본만 바꿔 다시 돌린다 — ⛔ 저장소 파일은 안 건드린다.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

/* ═════════════════════════════ 자식: 실제 실행 ═════════════════════════════ */
if (process.env.CASD_CHILD === '1') {
  const SRC = process.env.CASD_SRC;
  const results = [];
  const ok = (name, cond, why) => results.push({ name, pass: !!cond, why: cond ? '' : String(why ?? '') });

  let NOW = 0;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  globalThis.Date = FakeDate;
  const setNow = (ymd, hm) => { NOW = RealDate.parse(`${ymd}T${hm}:00+09:00`); };
  setNow('2026-11-10', '20:50');   // 사고 그날 — 20:57 에 21:30 을 «추가» 했다
  console.warn = () => {};
  console.log = () => {};
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this harness'); };

  const imp = (f) => import(pathToFileURL(join(SRC, f)).href);
  const { sameDayAddNotice } = await imp('schedule-conflict.ts');
  const { judgeClassChange, loadClassChangeAudits } = await imp('class-change-state.ts');

  /* ── A. 같은 날 안내 ── */
  ok('A1 같은 날 수업이 없으면 null', sameDayAddNotice([], '2026-11-10') === null && sameDayAddNotice(null, '2026-11-10') === null);
  const n1 = sameDayAddNotice([{ start_time: '13:20' }], '2026-11-10');
  ok('A2 있으면 문구 — 날짜·시각을 KO/EN 둘 다에', !!n1 && n1.ko.includes('11/10') && n1.ko.includes('13:20') && n1.en.includes('13:20') && n1.en.includes('Move'), JSON.stringify(n1));
  const n2 = sameDayAddNotice([{ start_time: '18:00' }, { start_time: '13:20' }, { start_time: '13:20' }], '2026-11-10');
  ok('A3 시각은 겹침 없이 차례대로', !!n2 && n2.times.join(',') === '13:20,18:00', JSON.stringify(n2 && n2.times));

  /* ── B. 칸 판정 ── */
  const T = RealDate.parse('2026-11-10T20:57:51+09:00');
  const dated = { id: 8370, status: 'active', scheduled_date: '2026-11-10', start_time: '21:30' };
  const add = { action: 'add', schedule_id: 8370, lesson_date: '2026-11-10', lesson_time: '21:30', actor: 'Melca (본사 매니저)', created_at: T, id: 1 };
  const b1 = judgeClassChange(dated, [add], { showActor: true });
  ok('B1 추가 이력 → «➕ 추가된 수업» · 누가 · 언제(KST)', !!b1 && b1.kind === 'added' && b1.label_en === '➕ Added class' && b1.by === 'Melca (본사 매니저)' && b1.at_kst === '11/10 20:57', JSON.stringify(b1));
  const b2 = judgeClassChange(dated, [add], { showActor: false });
  ok('B2 지사·대리점(showActor=false)에는 «누가» 없이 «언제» 만', !!b2 && b2.kind === 'added' && b2.by === null && b2.at_kst === '11/10 20:57', JSON.stringify(b2));
  const mv = { action: 'reschedule', schedule_id: 8370, lesson_date: '2026-11-10', lesson_time: '21:00', actor: 'Melca', created_at: T + 60000, id: 2 };
  const b3 = judgeClassChange(dated, [add, mv], { showActor: true });
  ok('B3 짝: 추가 뒤 옮겼으면 «옮김» 이 먼저', !!b3 && b3.kind === 'moved' && b3.from_time === '21:00', JSON.stringify(b3));
  const teacherOnly = { ...mv, lesson_time: '21:30' };   // 같은 자리 — 강사만 바꾼 변경
  const b4 = judgeClassChange(dated, [add, teacherOnly], { showActor: true });
  ok('B4 같은 자리 변경(강사만)이면 옮김이 아니라 «추가» 가 그대로', !!b4 && b4.kind === 'added', JSON.stringify(b4));
  const b5 = judgeClassChange({ ...dated, status: 'cancelled' }, [add, { action: 'remove', created_at: T + 1, id: 3 }], { showActor: true });
  ok('B5 짝: 취소된 줄은 «취소» 가 먼저', !!b5 && b5.kind === 'cancelled', JSON.stringify(b5));
  const b6 = judgeClassChange({ id: 9, status: 'active', scheduled_date: null, day_of_week: 'Tue', start_time: '21:30' }, [add], { showActor: true });
  ok('B6 짝: 매주 반복 행(날짜 없음)은 null — 매주 «추가됨» 이 영원히 뜨지 않게', b6 === null, JSON.stringify(b6));
  ok('B7 짝: 이력이 없으면 null(«—»)', judgeClassChange(dated, [], { showActor: true }) === null);

  /* ── C. 실제 핸들러 + 진짜 SQLite ── */
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  const norm = (v) => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const mkStmt = (sql, args) => ({
    bind: (...b) => mkStmt(sql, b.map(norm)),
    async first(col) { const r = sq.prepare(sql).get(...args); if (!r) return null; const o = { ...r }; return col ? o[col] : o; },
    async all() { return { results: sq.prepare(sql).all(...args).map((r) => ({ ...r })), success: true, meta: {} }; },
    async run() { const r = sq.prepare(sql).run(...args); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; },
    async raw() { return sq.prepare(sql).all(...args).map((r) => Object.values(r)); },
  });
  const DB = {
    prepare: (sql) => mkStmt(sql, []),
    async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(stmts) { sq.exec('BEGIN IMMEDIATE'); try { const out = []; for (const s of stmts) out.push(await s.run()); sq.exec('COMMIT'); return out; } catch (e) { sq.exec('ROLLBACK'); throw e; } },
  };
  const kv = new Map();
  const KV = { async get(k, t) { const v = kv.get(k); return v == null ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, String(v)); }, async delete(k) { kv.delete(k); }, async list() { return { keys: [], list_complete: true }; } };
  const env = new Proxy({ DB, ADMIN_PASSWORD: 'harness-pw' }, {
    get(t, p) { if (p in t) return t[p]; if (typeof p === 'string' && /^[A-Z_]+$/.test(p) && /KV|STATE|CACHE|SESS/.test(p)) return KV; return undefined; },
  });

  const { handleAdminApi } = await imp('api-admin.ts');
  const { handleMangoApi } = await imp('api-mango.ts');
  const { checkAdminSession } = await imp('auth-admin.ts');
  const { getScope } = await imp('scope.ts');
  const BASE = 'https://mangoi.ai';
  const req = (method, path, { cookie, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = `mango_admin_session=${cookie}`;
    return new Request(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  };
  const post = async (body) => {
    const r = req('POST', '/api/admin/class-schedules', { cookie: 'tok_admin', body });
    const res = await handleAdminApi(r, new URL(r.url), env, { waitUntil() {}, passThroughOnException() {} });
    return res ? { status: res.status, body: await res.json().catch(() => ({})) } : { status: 0, body: { error: 'no_route' } };
  };

  const errStage = [];
  try {
    await checkAdminSession(req('GET', '/x', { cookie: 'prime' }), env);
    await getScope(env, req('GET', '/x'));
    await handleMangoApi(req('GET', '/api/class/sessions/today?user_id=prime'), new URL(BASE + '/api/class/sessions/today?user_id=prime'), env, {});
  } catch (e) { errStage.push('prime: ' + e.message); }
  const adminSrc = readAdminModuleGraph((f) => readFileSync(join(SRC, f), 'utf8'));
  const tIdx = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const tEnd = adminSrc.indexOf("].join(' ')", tIdx);
  const teachersDDL = tIdx > 0 && tEnd > tIdx ? [...adminSrc.slice(tIdx, tEnd).matchAll(/`([^`]*)`/g)].map((m) => m[1]).join(' ') : null;
  const erpM = adminSrc.match(/`(CREATE TABLE IF NOT EXISTS students_erp\s*\(user_id TEXT PRIMARY KEY, korean_name[\s\S]*?\);?)`/);
  ok('C0 전제: 소스에서 teachers·students_erp CREATE 를 읽었다', !!teachersDDL && !!erpM);
  for (const d of [teachersDDL, erpM && erpM[1]]) if (d) sq.exec(d);
  ok('C0 전제: 핸들러가 class_schedules 를 스스로 만들었다', !!sq.prepare(`SELECT name FROM sqlite_master WHERE name='class_schedules'`).get(), errStage.join('|'));

  const T0 = RealDate.parse('2026-09-01T00:00:00Z'), FAR = RealDate.parse('2030-01-01T00:00:00Z');
  const ins = (sql, ...a) => sq.prepare(sql).run(...a);
  ins(`INSERT INTO teachers (id, name, active, created_at, updated_at) VALUES (8,'KAYE',1,?,?)`, T0, T0);
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('admin','hq',NULL,?)`, T0);
  ins(`INSERT INTO admin_sessions (token, username, created_at, expires_at, last_seen_at) VALUES ('tok_admin','admin',?,?,?)`, T0, FAR, T0);
  for (const u of ['jye46712', 'stu_free']) ins(`INSERT INTO students_erp (user_id, korean_name, created_at) VALUES (?,?,?)`, u, '학생' + u, T0);
  const orig = Number(ins(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
    VALUES ('jye46712','김선우','one_off','regular','2026-11-10','13:20',20,'8','active','adm-enroll:109',?)`, T0).lastInsertRowid);
  const count = (uid, date) => sq.prepare(`SELECT COUNT(*) AS n FROM class_schedules WHERE user_id=? AND scheduled_date=?`).get(uid, date).n;
  const base = { user_id: 'jye46712', schedule_kind: 'one_off', scheduled_date: '2026-11-10', start_time: '21:30', duration_min: 20, teacher_id: '8' };

  const c1 = await post(base);
  ok('C1 같은 날 다른 시각 «추가» → 409 conflict · 13:20 을 말함 · same_day', c1.status === 409 && c1.body.error === 'conflict' && String(c1.body.message).includes('13:20')
    && String(c1.body.message_en).includes('13:20') && Array.isArray(c1.body.same_day) && c1.body.same_day[0] === '13:20', JSON.stringify(c1).slice(0, 300));
  ok('C2 되묻는 동안 행이 안 생겼다', count('jye46712', '2026-11-10') === 1, String(count('jye46712', '2026-11-10')));
  setNow('2026-11-10', '20:57');
  const c3 = await post({ ...base, force: true });
  ok('C3 확인(force) → 등록', c3.status === 200 && c3.body.ok === true && count('jye46712', '2026-11-10') === 2, JSON.stringify(c3).slice(0, 300));
  const c4 = await post({ ...base, scheduled_date: '2026-11-12' });
  ok('C4 짝: 다른 날이면 묻지 않고 바로 등록', c4.status === 200 && c4.body.ok === true, JSON.stringify(c4).slice(0, 300));
  const c5 = await post({ ...base, user_id: 'stu_free', start_time: '19:00' });
  ok('C5 짝: 그날 수업이 없는 학생도 바로 등록', c5.status === 200 && c5.body.ok === true, JSON.stringify(c5).slice(0, 300));

  // 그 등록이 남긴 이력을 «오늘 수업» 과 같은 조회로 읽는다
  const added = sq.prepare(`SELECT * FROM class_schedules WHERE user_id='jye46712' AND scheduled_date='2026-11-10' AND start_time='21:30'`).get();
  const ids = [orig, added && added.id].filter(Boolean);
  const au = await loadClassChangeAudits(DB, ids);
  const chAdded = added ? judgeClassChange({ ...added }, au.bySchedule.get(String(added.id)), { showActor: true }) : null;
  ok('C6 추가한 21:30 줄 → «➕ 추가된 수업» · 언제 11/10 20:57 (실제 이력 조회)', !!chAdded && chAdded.kind === 'added' && chAdded.at_kst === '11/10 20:57' && !!chAdded.by, JSON.stringify(chAdded));
  const origRow = sq.prepare(`SELECT * FROM class_schedules WHERE id=?`).get(orig);
  const chOrig = judgeClassChange({ ...origRow }, au.bySchedule.get(String(orig)), { showActor: true });
  ok('C7 짝: 손대지 않은 13:20 줄은 그대로 «—»', chOrig === null, JSON.stringify(chOrig));

  process.stdout.write('\n@@RESULTS@@' + JSON.stringify({ results }) + '\n');
  process.exit(0);
}

/* ═════════════════════════════ 부모: 준비·실행·변이 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'casd-'));
writeFileSync(join(tmp, 'hooks.mjs'), `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
    const u = new URL(spec + '.ts', ctx.parentURL);
    if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
  }
  return next(spec, ctx);
}`);
writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);

function runChild(srcDir) {
  return new Promise((resolve) => {
    const cp = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', pathToFileURL(join(tmp, 'reg.mjs')).href, SELF],
      { env: { ...process.env, CASD_CHILD: '1', CASD_SRC: srcDir } });
    let so = '', se = '';
    cp.stdout.on('data', (d) => { so += d; });
    cp.stderr.on('data', (d) => { se += d; });
    const t = setTimeout(() => { try { cp.kill('SIGKILL'); } catch {} }, 80000);
    cp.on('close', () => {
      clearTimeout(t);
      const i = so.lastIndexOf('@@RESULTS@@');
      if (i < 0) return resolve({ crashed: true, err: (se + so).split('\n').filter(Boolean).slice(-12).join('\n') });
      try { resolve(JSON.parse(so.slice(i + 11))); } catch (e) { resolve({ crashed: true, err: String(e) }); }
    });
  });
}

let PASS = 0, FAIL = 0;
const line = (good, name, why) => { if (good) PASS++; else FAIL++; console.log(`  ${good ? '✅' : '❌'} ${name}${!good && why ? '\n       ↳ ' + why : ''}`); };

console.log('\n➕ 같은 날 «수업 추가» 되묻기 · 「추가된 수업」 칸 (2026-11-11)\n');
const real = await runChild(REAL_SRC);
if (real.crashed) line(false, '실제 소스로 실행', real.err);
else for (const r of real.results) line(r.pass, r.name, r.why);

/* 변이 — 하나라도 «통과» 하면 그 검사가 헛돈다는 뜻 */
const MUTANTS = [
  ['되묻기 끄기', 'api-admin-scheduling.ts', 'if (sameDay && !body.force) {', 'if (false && sameDay && !body.force) {'],
  ['force 를 무시(확인해도 영원히 409)', 'api-admin-scheduling.ts', 'if (sameDay && !body.force) {', 'if (sameDay) {'],
  ['조건 뒤집기(겹칠 때만 같은 날 검사)', 'api-admin-scheduling.ts', 'const sameDay = !conf.has && stuDay ?', 'const sameDay = conf.has && stuDay ?'],
  ['언제나 되묻기(다른 날도)', 'api-admin-scheduling.ts', 'const sameDay = !conf.has && stuDay ? sameDayAddNotice(stuDay, schedDate) : null;', "const sameDay = { ko: 'x', en: 'x', times: ['x'] };"],
  ['안내가 늘 null', 'schedule-conflict.ts', 'if (!times.length) return null;', 'return null;'],
  ['추가 이력을 안 읽음', 'class-change-state.ts', '[...CANCEL_ACTIONS, ...MOVE_ACTIONS, ...ADD_ACTIONS]', '[...CANCEL_ACTIONS, ...MOVE_ACTIONS]'],
  ['옮김 없을 때 추가를 안 말함', 'class-change-state.ts', 'if (!e) return added();', 'if (!e) return null;'],
  ['추가가 옮김을 덮음', 'class-change-state.ts', 'if (!e) return added();', '{ const x = added(); if (x) return x; } if (!e) return null;'],
  ['추가 글자 빠짐', 'class-change-state.ts', "if (kind === 'added') return { ko: '➕ 추가된 수업', en: '➕ Added class' };", ''],
];
console.log('\n  🧪 변이시험');
const runs = await Promise.all(MUTANTS.map(async ([name, file, a, b]) => {
  const d = mkdtempSync(join(tmpdir(), 'casd-m-'));
  cpSync(REAL_SRC, d, { recursive: true });
  const p = join(d, file), s = readFileSync(p, 'utf8');
  if (!s.includes(a)) { rmSync(d, { recursive: true, force: true }); return { name, missing: true }; }
  writeFileSync(p, s.replace(a, b));
  const r = await runChild(d);
  rmSync(d, { recursive: true, force: true });
  return { name, r };
}));
for (const { name, missing, r } of runs) {
  if (missing) { line(false, `변이 «${name}» — 바꿀 자리를 못 찾음(소스가 바뀌었다면 변이도 고칠 것)`); continue; }
  // 크래시는 «잡았다» 로 안 센다 — 검사가 아니라 실행이 죽은 것이라 어느 검사가 일하는지 모른다
  const failed = r.crashed ? [] : r.results.filter((x) => !x.pass).map((x) => x.name.split(' ')[0]);
  line(failed.length > 0, `변이 «${name}» 를 잡는다${failed.length ? ' (' + failed.join(',') + ')' : ''}`, r.crashed ? '실행이 죽음: ' + r.err : '모든 검사가 통과 — 그 검사가 헛돈다');
}
rmSync(tmp, { recursive: true, force: true });

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
