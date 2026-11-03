/**
 * 취소한 수업이 «사라지지 않고» 취소·연기 상태로 남는가 — 샌드박스 끝-끝 검사 (2026-11-03)
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 이 하니스가 있나
 *   2026-11-02 Maimai 매니저가 lby01(BELLE) 14:00 수업을 「수업 취소」 했더니 관리자·매니저 «오늘 수업» 과
 *   강사 시간표에서 통째로 사라졌다. 데이터는 남아 있었다(D1 #4327 status=cancelled) — 조회가
 *   `status != 'cancelled'` 로 걸러 화면이 그 줄을 못 받았다. 요청: «지우지 말고 취소·연기 상태를 칸으로».
 *   정본: src/class-change-state.ts (취소 회차 판정 · 「취소·연기」 칸 판정 · KO/EN 글자).
 *
 * 무엇이 «진짜» 이고 무엇이 «모형» 인가 (schedule_move_room_sync_harness 와 같은 틀)
 *   ✅ 진짜: handleAdminApi · handleTeacherApi · handleMangoApi 를 소스 그대로 import 해 Request 로 돌린다
 *      (취소 = 실제 DELETE 경로, 연기·옮김 = 실제 schedule-requests 경로 → 이력도 실제 코드가 남긴다).
 *   ✅ 진짜: SQLite(node:sqlite) — D1 모양으로 감쌌다. 스키마 일부는 소스의 CREATE 문을 «읽어서» 만든다.
 *   🟡 모형: 시계 고정 · KV 는 빈 가짜 · src/index.ts 라우팅 게이트는 거치지 않는다.
 *
 * 변이시험: src 를 임시 폴더로 «복사» 한 뒤 복사본만 바꿔 다시 돌린다 — ⛔ 저장소 파일은 안 건드린다.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

/* ═════════════════════════════ 자식: 시나리오 실행 ═════════════════════════════ */
if (process.env.CCV_CHILD === '1') {
  const SRC = process.env.CCV_SRC;
  const results = [];
  const ok = (name, cond, why) => results.push({ name, pass: !!cond, why: cond ? '' : (why || '') });

  let NOW = 0;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  globalThis.Date = FakeDate;
  const setNow = (ymd, hm) => { NOW = RealDate.parse(`${ymd}T${hm}:00+09:00`); };
  console.warn = () => {};

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
  const kvMap = new Map();
  const KV = {
    async get(k, t) { const v = kvMap.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { kvMap.set(k, String(v)); }, async delete(k) { kvMap.delete(k); },
    async list() { return { keys: [...kvMap.keys()].map((name) => ({ name })), list_complete: true }; },
  };
  const env = new Proxy({ DB, ADMIN_PASSWORD: 'harness-pw' }, {
    get(t, p) { if (p in t) return t[p]; if (typeof p === 'string' && /^[A-Z_]+$/.test(p) && /KV|STATE|CACHE|SESS/.test(p)) return KV; return undefined; },
  });

  const imp = (f) => import(pathToFileURL(join(SRC, f)).href);
  const { handleAdminApi } = await imp('api-admin.ts');
  const { handleMangoApi } = await imp('api-mango.ts');
  const { handleTeacherApi } = await imp('api-teacher.ts');
  const { checkAdminSession } = await imp('auth-admin.ts');
  const { getScope } = await imp('scope.ts');
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');

  const BASE = 'https://mangoi.ai';
  const req = (method, path, { cookie, body } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = `mango_admin_session=${cookie}`;
    return new Request(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  };
  const callAdmin = async (method, path, opts) => {
    const r = req(method, path, opts);
    const res = await handleAdminApi(r, new URL(r.url), env, { waitUntil() {}, passThroughOnException() {} });
    return res ? { status: res.status, body: await res.json().catch(() => ({})) } : { status: 0, body: { error: 'no_route' } };
  };
  const portal = async (tok, qs = '') => {
    const r = req('GET', '/api/teacher/portal' + qs, { cookie: tok });
    const res = await handleTeacherApi(r, new URL(r.url), env);
    return res.json();
  };
  const studentToday = async (uid) => {
    const u = new URL(BASE + '/api/class/sessions/today?user_id=' + encodeURIComponent(uid));
    const res = await handleMangoApi(new Request(u.href), u, env, {});
    return res ? res.json() : { ok: false };
  };

  // ── 스키마: 핸들러가 스스로 만드는 것은 핸들러에게, 나머지는 소스의 CREATE 문을 읽어서 ──
  try {
    await checkAdminSession(req('GET', '/x', { cookie: 'prime' }), env);
    await getScope(env, req('GET', '/x'));
    await handleMangoApi(req('GET', '/api/class/sessions/today?user_id=prime'), new URL(BASE + '/api/class/sessions/today?user_id=prime'), env, {});
  } catch (e) { ok('전제: 스키마 준비', false, e.message); }
  const cutCreate = (src, name, mustContain) => {
    const re = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + name + '\\s*\\([\\s\\S]*?\\);?)`', 'g');
    let m; while ((m = re.exec(src))) { if (!mustContain || m[1].includes(mustContain)) return m[1]; }
    return null;
  };
  const tIdx = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const tEnd = adminSrc.indexOf("].join(' ')", tIdx);
  const teachersDDL = tIdx > 0 && tEnd > tIdx ? [...adminSrc.slice(tIdx, tEnd).matchAll(/`([^`]*)`/g)].map((m) => m[1]).join(' ') : null;
  const erpDDL = cutCreate(adminSrc, 'students_erp', 'user_id TEXT PRIMARY KEY, korean_name');
  const tlDDL = cutCreate(adminSrc, 'teacher_account_links');
  ok('전제: teachers·students_erp·teacher_account_links CREATE 를 소스에서 읽었다', !!(teachersDDL && erpDDL && tlDDL));
  for (const d of [teachersDDL, erpDDL, tlDDL]) if (d) sq.exec(d);
  /* 운영 명부에 있는 칸(레벨·교재·학원) — 소스 CREATE 에는 없고 나중에 ALTER 로 붙은 칸이다. 없으면 «오늘 수업» 의 조인이
     실패해 폴백(조인 없음)으로 돌고, 지사 계정은 안전상 폴백이 없어 0건이 된다 → 주 경로를 못 잰다(실제로 밟음). */
  for (const col of ['shop_name', 'level', 'textbook']) {
    if (!sq.prepare('PRAGMA table_info(students_erp)').all().some(c => c.name === col)) sq.exec(`ALTER TABLE students_erp ADD COLUMN ${col} TEXT`);
  }
  // 출결 표 — 소스의 CREATE 를 읽어서(«오늘 수업» 의 출결·강사 입장 판정이 이 표를 읽는다)
  { const att = cutCreate(adminSrc, 'attendance', 'room_id TEXT NOT NULL'); ok('전제: attendance CREATE 를 소스에서 읽었다', !!att); if (att) sq.exec(att); }

  // ── 씨앗 ──
  const T0 = RealDate.parse('2026-09-01T00:00:00Z'), FAR = RealDate.parse('2030-01-01T00:00:00Z');
  const ins = (sql, ...a) => sq.prepare(sql).run(...a);
  ins(`INSERT INTO teachers (id, name, active, created_at, updated_at) VALUES (1,'ALPHA',1,?,?)`, T0, T0);
  ins(`INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES ('t_alpha','x','ALPHA',?,?)`, T0, T0);
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('t_alpha','teacher',NULL,?)`, T0);
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('admin','hq',NULL,?)`, T0);
  ins(`INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES ('agency_mgr','x','Agency Manager',?,?)`, T0, T0);
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('agency_mgr','agency','owned-shop',?)`, T0);
  ins(`INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at) VALUES ('t_alpha','1','ALPHA','h',?)`, T0);
  for (const [tok, u] of [['tok_admin', 'admin'], ['tok_alpha', 't_alpha'], ['tok_agency', 'agency_mgr']]) {
    ins(`INSERT INTO admin_sessions (token, username, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)`, tok, u, T0, FAR, T0);
  }
  for (const s of ['stu_a', 'stu_b', 'stu_c', 'stu_d', 'stu_f']) ins(`INSERT INTO students_erp (user_id, korean_name, shop_name, created_at) VALUES (?,?,'owned-shop',?)`, s, '학생' + s, T0);
  const mkClass = (user, kind, dow, date, time) => Number(ins(
    `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
     VALUES (?,?,?, 'regular', ?, ?, ?, 20, '1', 'active', 'harness', ?)`, user, '학생' + user, kind, dow, date, time, T0).lastInsertRowid);
  const row = (id) => ({ ...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id) });

  const TODAY = '2026-11-03', TOMORROW = '2026-11-04';   // 화요일 (KST)
  setNow(TODAY, '13:55');                                   // X(14:00) 의 입장 시간대 안 — «취소면 닫힌다» 를 잴 수 있게
  const X = mkClass('stu_a', 'one_off', null, TODAY, '14:00');      // 오늘 날짜 수업 → 취소
  const W = mkClass('stu_b', 'recurring', 'Tue', null, '15:00');    // 매주(화) 수업 → 취소(회차가 아니다 — 안 떠야 한다)
  const Y = mkClass('stu_c', 'one_off', null, TODAY, '16:00');      // 오늘 날짜 수업 → 날짜 없이 연기
  const Z = mkClass('stu_d', 'one_off', null, TOMORROW, '11:00');   // 내일 수업 → 오늘 17:00 으로 연기(옮겨 옴)
  const F = mkClass('stu_f', 'one_off', null, '2026-11-11', '10:00'); // 다음 주 수업 → 취소(다음 주 시간표에 남아야)

  // ── 실제 경로로 바꾼다 ──
  let r = await callAdmin('DELETE', `/api/admin/class-schedules/${X}`, { cookie: 'tok_admin', body: { reason: 'harness reason' } });
  ok('취소(DELETE) 200 · 행은 지워지지 않고 cancelled', r.status === 200 && row(X).status === 'cancelled', JSON.stringify(r));
  r = await callAdmin('DELETE', `/api/admin/class-schedules/${W}`, { cookie: 'tok_admin' });
  ok('매주 행 취소(DELETE) 200', r.status === 200 && row(W).status === 'cancelled', JSON.stringify(r));
  r = await callAdmin('DELETE', `/api/admin/class-schedules/${F}`, { cookie: 'tok_admin' });
  ok('다음 주 수업 취소(DELETE) 200', r.status === 200 && row(F).status === 'cancelled', JSON.stringify(r));
  r = await callAdmin('POST', '/api/admin/schedule-requests', { cookie: 'tok_alpha', body: { schedule_id: Y, request_type: 'postpone', teacher_name: 'ALPHA' } });
  ok('날짜 없는 연기 → postponed', row(Y).status === 'postponed', JSON.stringify(r));
  r = await callAdmin('POST', '/api/admin/schedule-requests', { cookie: 'tok_admin', body: { schedule_id: Z, teacher_name: 'ALPHA', student_name: '학생stu_d', request_type: 'postpone', orig_date: TOMORROW, orig_time: '11:00', new_date: TODAY, new_time: '17:00', reason: 'h' } });
  if (row(Z).scheduled_date !== TODAY) r = await callAdmin('POST', '/api/admin/schedule-requests/decide', { cookie: 'tok_admin', body: { id: r.body.id, action: 'approve' } });
  ok('날짜 지정 연기 → 같은 행이 오늘 17:00 으로', row(Z).scheduled_date === TODAY && row(Z).start_time === '17:00' && row(Z).status === 'active', JSON.stringify({ r, z: row(Z) }));

  // ── A. 관리자(본사) 「오늘 수업」 ──
  const hq = await callAdmin('GET', `/api/admin/classes/today?date=${TODAY}`, { cookie: 'tok_admin' });
  ok('A0 관리자 오늘 수업 200 ok', hq.status === 200 && hq.body.ok === true, JSON.stringify(hq).slice(0, 300));
  ok('A0b 전제: 조인 경로로 돌았다(학원 칸이 실렸다 — 폴백이면 비어 있다)', (hq.body.sessions || []).some(s => s.academy === 'owned-shop'));
  const S = (b, id) => (b.sessions || []).find(s => Number(s.schedule_id) === id);
  const x = S(hq.body, X);
  ok('A1 🔑 취소한 수업이 목록에 «남는다»', !!x, JSON.stringify((hq.body.sessions || []).map(s => s.schedule_id)));
  if (x) {
    ok('A2 상태 cancelled · cancelled=true', x.status === 'cancelled' && x.cancelled === true, JSON.stringify({ st: x.status, c: x.cancelled }));
    ok('A3 입장·참관·옮기기 닫힘(입장 시간대 안이어도)', x.join_open === false && x.observable === false && x.can_move === false, JSON.stringify({ j: x.join_open, o: x.observable, m: x.can_move }));
    ok('A4 「취소·연기」 칸 = 취소 · 글자 KO/EN', x.change && x.change.kind === 'cancelled' && x.change.label_ko === '✕ 취소됨' && x.change.label_en === '✕ Cancelled', JSON.stringify(x.change));
    ok('A5 본사에는 누가·사유·언제가 실린다', x.change && !!x.change.by && x.change.reason === 'harness reason' && /^\d{2}\/\d{2} \d{2}:\d{2}$/.test(x.change.at_kst || ''), JSON.stringify(x.change));
    ok('A6 출결·강사 입장 = «취소됨»(결석·입장 기록 없음 ⚠ 아님)', x.attendance && x.attendance.state === 'cancelled' && x.teacher_entry && x.teacher_entry.state === 'cancelled', JSON.stringify({ a: x.attendance, t: x.teacher_entry }));
  }
  ok('A7 ⛔ 매주 행의 cancelled 는 «회차» 가 아니라 안 뜬다', !S(hq.body, W), 'W=' + JSON.stringify(S(hq.body, W)));
  const y = S(hq.body, Y);
  ok('A8 연기 줄 = 「취소·연기」 칸 postponed', !!y && y.postponed === true && y.change && y.change.kind === 'postponed' && /연기됨/.test(y.change.label_ko), JSON.stringify(y && y.change));
  const z = S(hq.body, Z);
  ok('A9 다른 날에서 옮겨 온 줄 = moved · 원래 날짜·시각', !!z && z.change && z.change.kind === 'moved' && z.change.from_date === TOMORROW && z.change.from_time === '11:00' && /11\/04 11:00/.test(z.change.label_ko + z.change.label_en), JSON.stringify(z && z.change));
  ok('A10 짝: 옮겨 온 줄은 그대로 열린 수업(취소·연기 아님)', !!z && !z.cancelled && !z.postponed && z.status !== 'cancelled', JSON.stringify(z && { st: z.status }));
  ok('A11 건수: cancelled 1 · postponed 1 · moved 1 · 이력 ok', hq.body.counts && hq.body.counts.cancelled === 1 && hq.body.counts.postponed === 1 && hq.body.counts.moved === 1 && hq.body.change_history === 'ok', JSON.stringify({ c: hq.body.counts, h: hq.body.change_history }));
  ok('A12 입장가능 수에 취소 줄이 안 섞인다', (hq.body.sessions || []).filter(s => s.join_open).every(s => !s.cancelled));

  // ── B. 지사·대리점 매니저 — 같은 줄이 보이되 누가·사유는 안 실린다 ──
  const ag = await callAdmin('GET', `/api/admin/classes/today?date=${TODAY}`, { cookie: 'tok_agency' });
  const xa = ag.body && S(ag.body, X);
  ok('B1 지사 매니저도 취소 줄을 본다', ag.status === 200 && !!xa && xa.cancelled === true, JSON.stringify({ st: ag.status, ids: (ag.body.sessions || []).map(s => s.schedule_id) }));
  ok('B2 🔒 지사에는 본사 직원 이름·사유가 안 실린다(언제는 실린다)', !!xa && xa.change && xa.change.by === null && xa.change.reason === null && !!xa.change.at_kst, JSON.stringify(xa && xa.change));

  // ── C. 다른 날짜 조회 — 그 날짜의 취소만 ──
  const d11 = await callAdmin('GET', `/api/admin/classes/today?date=2026-11-11`, { cookie: 'tok_admin' });
  ok('C1 11/11 조회: 그날 취소한 수업 F 가 남는다', !!S(d11.body, F) && S(d11.body, F).cancelled === true, JSON.stringify((d11.body.sessions || []).map(s => s.schedule_id)));
  ok('C2 짝: 11/11 조회에 오늘 취소한 X 는 안 섞인다', !S(d11.body, X));

  // ── D. 강사 화면 — 오늘 목록·주간·월간 ──
  const p = await portal('tok_alpha');
  ok('D0 강사 포털 ok', p && p.ok === true, JSON.stringify(p).slice(0, 200));
  const tc = (p.classes || []).find(c => Number(c.schedule_id) === X);
  ok('D1 오늘 목록: 취소 줄이 «취소됨» 으로 남는다(기존 동작 유지)', !!tc && tc.class_state === 'cancelled', JSON.stringify(tc && tc.class_state));
  const weekItems = ((p.week && p.week.days) || []).flatMap(d => (d.items || []).map(it => ({ ...it, _d: d.date })));
  const wx = weekItems.find(it => Number(it.schedule_id) === X);
  ok('D2 🔑 주간 시간표: 취소한 수업이 «사라지지 않고» 취소됨으로', !!wx && wx.class_state === 'cancelled' && wx._d === TODAY, JSON.stringify(wx));
  ok('D3 ⛔ 주간 시간표: 매주 행의 cancelled 는 어느 요일에도 안 뜬다', !weekItems.some(it => Number(it.schedule_id) === W));
  ok('D4 짝: 앞으로 7일(upcoming)에는 취소를 안 넣는다', !(p.upcoming || []).some(u => Number(u.id) === F || Number(u.schedule_id) === F));
  const pn = await portal('tok_alpha', '?week=2026-11-10');
  const fx = (((pn.week && pn.week.days) || []).flatMap(d => d.items || [])).find(it => Number(it.schedule_id) === F);
  ok('D5 다음 주 시간표: 취소한 수업이 취소됨 · 출결은 «취소됨»(예정 아님)', !!fx && fx.class_state === 'cancelled' && fx.status === 'cancelled' && fx.attendance && fx.attendance.state === 'cancelled', JSON.stringify(fx));
  const pm = await portal('tok_alpha', '?part=month&month=2026-11');
  const mItems = ((pm.month && pm.month.days) || []).flatMap(d => (d.items || []).map(it => ({ ...it, _d: d.date })));
  ok('D6 월간 달력: 취소한 수업 둘(X·F)이 그 날짜에 취소됨으로', [X, F].every(id => mItems.some(it => Number(it.schedule_id) === id && it.class_state === 'cancelled')), JSON.stringify(mItems.filter(it => [X, F].includes(Number(it.schedule_id)))));
  ok('D7 ⛔ 월간 달력: 매주 행의 cancelled 는 안 뜬다', !mItems.some(it => Number(it.schedule_id) === W));

  // ── E. 학생 — 취소된 수업 방으로 보내지 않는다(기존 계약 그대로) ──
  const st = await studentToday('stu_a');
  ok('E1 학생 오늘 수업에는 취소 줄이 없다(빈 방 입장 방지)', !(st.sessions || []).some(s => Number(s.schedule_id) === X), JSON.stringify((st.sessions || []).map(s => s.schedule_id)));

  process.stdout.write('\n@@RESULTS@@' + JSON.stringify({ results }) + '\n');
  process.exit(0);
}

/* ═════════════════════════════ 부모: 준비·실행·변이 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'ccv-'));
const cleanup = () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} };
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
  const r = spawnSync(process.execPath,
    ['--experimental-strip-types', '--no-warnings', '--import', pathToFileURL(join(tmp, 'reg.mjs')).href, SELF],
    { encoding: 'utf8', env: { ...process.env, CCV_CHILD: '1', CCV_SRC: srcDir }, maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
  const out = r.stdout || '';
  const i = out.lastIndexOf('@@RESULTS@@');
  if (i < 0) return { crashed: true, err: ((r.stderr || '') + out).split('\n').filter(Boolean).slice(-22).join('\n') };
  return JSON.parse(out.slice(i + '@@RESULTS@@'.length).trim().split('\n')[0]);
}

let pass = 0, fail = 0;
console.log('\n═ 취소한 수업이 사라지지 않고 «취소·연기» 로 남는가 (실제 핸들러 · SQLite) ═');
const base = runChild(REAL_SRC);
if (base.crashed) { console.log('  FAIL 자식 실행이 죽었다:\n' + base.err); fail++; }
else for (const t of base.results) {
  if (t.pass) { pass++; console.log('  PASS ' + t.name); } else { fail++; console.log('  FAIL ' + t.name + (t.why ? ' — ' + t.why : '')); }
}

/* ── 변이시험: 고친 자리를 되돌리면 이 하니스가 정말 빨간불이 되는가 ── */
console.log('\n─ 변이시험 (복사본만 바꾼다) ─');
const MUTANTS = [
  { name: '조회를 옛 «status != cancelled» 로 되돌림(관리자·강사 공용 조각)', expect: /A1 |D2 /,
    edits: [['class-change-state.ts', "return `(COALESCE(${a}status,'active') <> 'cancelled' OR substr(COALESCE(${a}scheduled_date,''),1,10) BETWEEN ? AND ?)`;",
             "return `(COALESCE(${a}status,'active') <> 'cancelled' AND ? = ?)`;"]] },
  { name: '매주 행의 cancelled 까지 받아 오고 관리자 방어 줄도 걷어냄(두 겹 모두)', expect: /A7 /,
    edits: [['class-change-state.ts', "OR substr(COALESCE(${a}scheduled_date,''),1,10) BETWEEN ? AND ?)`;",
             "OR COALESCE(${a}scheduled_date,'') = '' OR substr(COALESCE(${a}scheduled_date,''),1,10) BETWEEN ? AND ?)`;"],
            ['api-admin.ts', "if (String(s.status || '').trim().toLowerCase() === 'cancelled' && !isCancelledOccurrence(s)) continue;", '']] },
  { name: '취소 줄의 입장을 안 닫음', expect: /A3 /,
    edits: [['api-admin.ts', 'join_open: !_postponed && !_holOff && !_cancelled && ', 'join_open: !_postponed && !_holOff && ']] },
  { name: '본사가 아닌데도 누가·사유를 실음', expect: /B2 /,
    edits: [['api-admin.ts', '{ showActor: _ctSeeContact }', '{ showActor: true }']] },
  { name: '강사 시간표에서 취소를 다시 뺌', expect: /D2 |D5 |D6 /,
    edits: [['api-teacher.ts', 'if (!_cancelled || isCancelledOccurrence(s)) {', 'if (!_cancelled) {']] },
  { name: '출결 판정이 «취소» 를 모름(결석으로 말함)', expect: /A6 /,
    edits: [['class-today-extras.ts', "if (status === 'cancelled') return { state: 'cancelled', at: null, late_min: null };", '']] },
];
for (const m of MUTANTS) {
  const dir = join(tmp, 'm-' + MUTANTS.indexOf(m));
  cpSync(REAL_SRC, dir, { recursive: true });
  let missing = '';
  for (const [f, from, to] of m.edits) {
    const p = join(dir, f), s = readFileSync(p, 'utf8');
    if (!s.includes(from)) { missing = f; break; }
    writeFileSync(p, s.replace(from, to));
  }
  if (missing) { fail++; console.log('  FAIL 변이 «' + m.name + '» — ' + missing + ' 에서 바꿀 자리를 못 찾았다(소스가 바뀌었으면 변이도 고칠 것)'); continue; }
  const res = runChild(dir);
  const failed = res.crashed ? ['(crash)'] : res.results.filter(t => !t.pass).map(t => t.name);
  const caught = !res.crashed && failed.some(n => m.expect.test(n));
  if (caught) { pass++; console.log('  PASS 변이 잡힘 «' + m.name + '» → ' + failed.filter(n => m.expect.test(n)).slice(0, 3).join(' · ')); }
  else { fail++; console.log('  FAIL 변이 못 잡음 «' + m.name + '»' + (res.crashed ? ' (자식이 죽음: ' + String(res.err).slice(-200) + ')' : failed.length ? ' (다른 실패: ' + failed.slice(0, 3).join(' · ') + ')' : '')); }
}
cleanup();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
