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
 * 🔒 (2026-11-04 «권한 분리») K절 — 수업 «취소»(DELETE /api/admin/class-schedules/:id)는 본사 계정만. 강사(스코프가 잘못 'hq'·'none'
 *    인 계정 포함)·역할 모름은 403 이고 행·이력이 그대로인가, 짝으로 본사는 그대로 취소되는가.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, availableParallelism } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
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
  // 🔒 스코프가 'hq'·'none' 인 강사(아이디 규칙 hq_t_* · 이름에 «교사») — 스코프만 보면 본사로 읽히는 계정들.
  ins(`INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES ('hq_t_beta','x','BETA',?,?)`, T0, T0);
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('hq_t_beta','hq',NULL,?)`, T0);
  ins(`INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES ('t_gamma','x','교사 Gamma',?,?)`, T0, T0);
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('t_gamma','none',NULL,?)`, T0);
  for (const [tok, u] of [['tok_admin', 'admin'], ['tok_alpha', 't_alpha'], ['tok_agency', 'agency_mgr'], ['tok_beta', 'hq_t_beta'], ['tok_gamma', 't_gamma']]) {
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

  // ── G. 관리자 «주간 시간표»(/api/admin/schedules) — 2026-11-03 「주간 시간표도 똑같이」 ──
  //    취소·연기 회차는 items 가 아니라 off_items 로(옛 화면이 «살아 있는 수업» 으로 그리지 않게), 옮길 id 없이.
  //    ⏭ «그 주 하루만» 빠진 반복 수업은 그 날 items 에 안 뜬다(정본 recurSkippedOn) — 짝: 다른 요일 반복은 뜬다.
  if (!sq.prepare('PRAGMA table_info(class_schedules)').all().some(c => c.name === 'skip_dates')) sq.exec('ALTER TABLE class_schedules ADD COLUMN skip_dates TEXT');
  const R = mkClass('stu_r', 'recurring', 'Tue', null, '18:00');    // 매주 화 — 11/03 만 빠짐
  sq.prepare('UPDATE class_schedules SET skip_dates=? WHERE id=?').run(TODAY, R);
  const R2 = mkClass('stu_r2', 'recurring', 'Wed', null, '18:00');  // 매주 수 — 짝(그대로 뜬다)
  const L = Number(ins(`INSERT INTO class_schedules (user_id, schedule_kind, class_type, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
     VALUES ('lms','one_off','regular',?,'12:00',20,'1','cancelled','lms_import_w26',?)`, TOMORROW, T0).lastInsertRowid);   // 정리된 LMS 자리표시
  const wk = await callAdmin('GET', '/api/admin/schedules?week=2026-11-02', { cookie: 'tok_admin' });
  const offs = (wk.body && wk.body.off_items) || [], its = (wk.body && wk.body.items) || [];
  const offOf = (uid) => offs.find(o => (o.students || []).some(s => s.uid === uid));
  ok('G0 주간 시간표 200 ok · off_items 배열 · 이력 완전', wk.status === 200 && wk.body.ok === true && Array.isArray(wk.body.off_items) && wk.body.off_complete === true, JSON.stringify(wk.body).slice(0, 300));
  const gx = offOf('stu_a');
  ok('G1 🔑 취소한 수업이 주간 시간표에서 «사라지지 않고» off_items 로', !!gx && gx.off === 'cancelled' && gx.date === TODAY && /^14:00/.test(gx.start_time) && gx.change && gx.change.label_ko === '✕ 취소됨' && gx.change.label_en === '✕ Cancelled', JSON.stringify(gx));
  ok('G2 본사에는 누가·사유·언제가 실린다', !!gx && !!gx.change.by && gx.change.reason === 'harness reason' && !!gx.change.at_kst, JSON.stringify(gx && gx.change));
  ok('G3 ⛔ 취소 줄은 «수업 칸»(items)에 안 섞인다 — 옛 화면이 살아 있는 수업으로 그리지 않게', !its.some(i => Number(i.id) === X), JSON.stringify(its.map(i => i.id)));
  ok('G4 ⛔ off_items 에는 옮길 id·move_field 가 없다(끌어 옮기기·삭제 불가)', offs.length > 0 && offs.every(o => o.id === undefined && o.move_field === undefined), JSON.stringify(offs.map(o => Object.keys(o))));
  const gy = offOf('stu_c');
  ok('G5 날짜 없이 연기한 수업 = off_items postponed', !!gy && gy.off === 'postponed' && /연기됨/.test(gy.change.label_ko) && !its.some(i => Number(i.id) === Y), JSON.stringify(gy));
  ok('G6 ⛔ 매주 행의 cancelled 는 어디에도 안 뜬다(회차가 아니다)', !offOf('stu_b') && !its.some(i => Number(i.id) === W));
  ok('G7 ⛔ 정리된 LMS 자리표시(cancelled)는 off_items 에 안 싣는다(수업이 아니다)', !offs.some(o => (o.students || []).length === 0 || o.date === TOMORROW && /^12:00/.test(o.start_time)), JSON.stringify(offs.map(o => [o.date, o.start_time])));
  const gz = its.find(i => Number(i.id) === Z);
  /* (2026-11-04) «옮겨 온» 수업은 새 날짜에 진짜 수업으로만 — 원래 날짜(11/04)에는 «📅 앞당김» 보기 전용 칸이 생기는 것이 맞다(I절). */
  ok('G8 다른 날에서 옮겨 온 수업 = 수업 칸 그대로 + change moved(원래 날짜) · 새 날짜에는 off 칸이 없다', !!gz && gz.date === TODAY && gz.change && gz.change.kind === 'moved' && gz.change.from_date === TOMORROW
    && !offs.some(o => (o.students || []).some(s => s.uid === 'stu_d') && (o.date === TODAY || !o.moved_away)), JSON.stringify({ ch: gz && gz.change, off: offs.filter(o => (o.students || []).some(s => s.uid === 'stu_d')) }));
  const rDays = its.filter(i => Number(i.id) === R).map(i => i.date), r2Days = its.filter(i => Number(i.id) === R2).map(i => i.date);
  ok('G9 ⏭ «그 주 하루만» 빠진 반복 수업은 그 날 수업 칸에 안 뜬다', !rDays.includes(TODAY), JSON.stringify(rDays));
  ok('G10 짝: 다른 요일 반복 수업은 그대로 뜬다', r2Days.length === 1 && r2Days[0] === TOMORROW, JSON.stringify(r2Days));
  const wn = await callAdmin('GET', '/api/admin/schedules?week=2026-11-09', { cookie: 'tok_admin' });
  const wnOffs = (wn.body && wn.body.off_items) || [];
  ok('G11 다음 주 조회: 그 주에 취소한 F 가 남고 이번 주 취소 X 는 안 섞인다', wnOffs.some(o => (o.students || []).some(s => s.uid === 'stu_f')) && !wnOffs.some(o => (o.students || []).some(s => s.uid === 'stu_a')), JSON.stringify(wnOffs.map(o => o.date)));
  const wt = await callAdmin('GET', '/api/admin/schedules?week=2026-11-02', { cookie: 'tok_alpha' });
  const tx = ((wt.body && wt.body.off_items) || []).find(o => (o.students || []).some(s => s.uid === 'stu_a'));
  ok('G12 🔒 본사·내부직원이 아니면 누가·사유는 안 실린다(언제는 실린다)', !!tx && tx.change.by === null && tx.change.reason === null && !!tx.change.at_kst, JSON.stringify(tx && tx.change));
  for (const [tok, lbl] of [['tok_beta', "스코프 'hq' 인 hq_t_* 강사"], ['tok_gamma', "스코프 'none' 인 «교사» 이름 계정"]]) {
    const wb = await callAdmin('GET', '/api/admin/schedules?week=2026-11-02', { cookie: tok });
    const bx = ((wb.body && wb.body.off_items) || []).find(o => (o.students || []).some(s => s.uid === 'stu_a'));
    const bz = ((wb.body && wb.body.items) || []).find(i => Number(i.id) === Z);
    ok('G13 🔒 강사(' + lbl + ')에게도 취소 칸의 누가·사유는 안 실린다 — 스코프가 아니라 역할로', wb.status === 200 && !!bx && bx.change.by === null && bx.change.reason === null && !!bx.change.at_kst, JSON.stringify(bx && bx.change));
    ok('G14 🔒 강사(' + lbl + ')에게 «옮겨 옴» 설명도 누가·사유 없이', !!bz && !!bz.change && bz.change.by === null && bz.change.reason === null, JSON.stringify(bz && bz.change));
  }
  void L;

  // ── H. 다른 날로 연기·변경한 수업이 «원래 날짜» 에 남는가 (2026-11-04 매니저 Mai) ──
  //    날짜 지정 연기·변경은 «같은 행» 이 새 날짜로 옮겨 가서(PR #1889) 원래 날짜에서 통째로 사라졌다.
  //    두 경로 모두 본다 — ① 연기·변경 요청 승인(schedule_change_requests) ② 끌어 옮기기(PATCH /class-schedules/move → class_audit_log).
  const { scheduleMoveVersion } = await imp('class-schedule-move.ts');
  for (const u of ['stu_p', 'stu_q', 'stu_s', 'stu_t', 'stu_u']) ins(`INSERT OR IGNORE INTO students_erp (user_id, korean_name, shop_name, created_at) VALUES (?,?,'owned-shop',?)`, u, '학생' + u, T0);
  const P1 = mkClass('stu_p', 'one_off', null, TODAY, '18:30');   // 요청 승인으로 11/10 18:30 로 연기
  const P2 = mkClass('stu_q', 'one_off', null, TODAY, '19:30');   // 끌어 옮기기로 11/12 로
  const P3 = mkClass('stu_s', 'one_off', null, TODAY, '20:30');   // 11/13 로 옮겼다가 원래 날짜로 되돌림 → 줄 없음(짝)
  const P4 = mkClass('stu_t', 'one_off', null, TODAY, '21:00');   // 11/14 로 옮긴 뒤 취소 → «그 뒤 취소됨»
  ins(`INSERT OR IGNORE INTO students_erp (user_id, korean_name, shop_name, created_at) VALUES ('stu_o','학생stu_o','other-shop',?)`, T0);
  const P6 = mkClass('stu_o', 'one_off', null, TODAY, '16:30');   // 🔒 다른 학원 학생 — 지사(owned-shop)에는 안 보여야
  const P5 = mkClass('stu_u', 'one_off', null, TODAY, '17:30');   // 요청 승인 — 승인 뒤 «덤» 이력 기록이 실패한 경우(승인 기록만 남음)
  r = await callAdmin('POST', '/api/admin/schedule-requests', { cookie: 'tok_admin', body: { schedule_id: P1, teacher_name: 'ALPHA', student_name: '학생stu_p', request_type: 'postpone', orig_date: TODAY, orig_time: '18:30', new_date: '2026-11-10', new_time: '18:30', reason: 'student trip' } });
  if (row(P1).scheduled_date !== '2026-11-10') r = await callAdmin('POST', '/api/admin/schedule-requests/decide', { cookie: 'tok_admin', body: { id: r.body.id, action: 'approve' } });
  ok('H0 전제: 요청 승인으로 P1 이 11/10 로 옮겨 갔다', row(P1).scheduled_date === '2026-11-10' && row(P1).status === 'active', JSON.stringify({ r, p1: row(P1) }));
  const mv = async (id, patch) => callAdmin('PATCH', '/api/admin/class-schedules/move', { cookie: 'tok_admin', body: { ids: [id], expected: { [id]: scheduleMoveVersion(row(id)) }, patch } });
  r = await callAdmin('POST', '/api/admin/schedule-requests', { cookie: 'tok_admin', body: { schedule_id: P5, teacher_name: 'ALPHA', student_name: '학생stu_u', request_type: 'postpone', orig_date: TODAY, orig_time: '17:30', new_date: '2026-11-11', new_time: '17:30', reason: 'h' } });
  if (row(P5).scheduled_date !== '2026-11-11') r = await callAdmin('POST', '/api/admin/schedule-requests/decide', { cookie: 'tok_admin', body: { id: r.body.id, action: 'approve' } });
  sq.prepare('DELETE FROM class_audit_log WHERE schedule_id = ?').run(P5);   // 승인 뒤 이력 쓰기는 best-effort — 실패한 경우를 만든다
  ok('H0a 전제: P5 는 승인으로 11/11 로 · 이력 줄은 없다(승인 기록만)', row(P5).scheduled_date === '2026-11-11' && !sq.prepare('SELECT 1 FROM class_audit_log WHERE schedule_id=?').get(P5), JSON.stringify({ r, p5: row(P5) }));
  r = await mv(P2, { scheduled_date: '2026-11-12' });
  ok('H0b 전제: 끌어 옮기기로 P2 가 11/12 로', r.status === 200 && row(P2).scheduled_date === '2026-11-12', JSON.stringify(r));
  r = await mv(P6, { scheduled_date: '2026-11-15' });
  ok('H0e 전제: 다른 학원 학생 P6 도 11/15 로 옮겨 갔다', r.status === 200 && row(P6).scheduled_date === '2026-11-15', JSON.stringify(r));
  r = await mv(P3, { scheduled_date: '2026-11-13' });
  const r3b = await mv(P3, { scheduled_date: TODAY });
  ok('H0c 전제: P3 은 옮겼다가 원래 날짜로 되돌아왔다', r.status === 200 && r3b.status === 200 && row(P3).scheduled_date === TODAY, JSON.stringify({ r, r3b }));
  r = await mv(P4, { scheduled_date: '2026-11-14' });
  const r4b = await callAdmin('DELETE', `/api/admin/class-schedules/${P4}`, { cookie: 'tok_admin' });
  ok('H0d 전제: P4 는 11/14 로 옮긴 뒤 취소', r.status === 200 && r4b.status === 200 && row(P4).status === 'cancelled' && row(P4).scheduled_date === '2026-11-14', JSON.stringify({ r, r4b }));

  const hq2 = await callAdmin('GET', `/api/admin/classes/today?date=${TODAY}`, { cookie: 'tok_admin' });
  const g1 = S(hq2.body, P1), g2 = S(hq2.body, P2), g3s = (hq2.body.sessions || []).filter(s => Number(s.schedule_id) === P3), g4 = S(hq2.body, P4);
  ok('H1 🔑 요청 승인으로 연기한 수업이 원래 날짜에 «⏸ 연기됨 → 11/10 18:30» 으로 남는다',
    !!g1 && g1.moved_away === true && g1.status === 'moved_away' && g1.change && g1.change.kind === 'moved_away'
    && g1.change.label_ko === '⏸ 연기됨 → 11/10 18:30' && g1.change.label_en === '⏸ Postponed → 11/10 18:30' && g1.start_time === '18:30',
    JSON.stringify(g1 && { st: g1.status, mv: g1.moved_away, ch: g1.change, t: g1.start_time }));
  ok('H2 🔑 끌어 옮긴 수업도(이력 경로) 원래 날짜에 «→ 11/12 19:30»', !!g2 && g2.moved_away === true && g2.change && g2.change.label_en === '⏸ Postponed → 11/12 19:30', JSON.stringify(g2 && g2.change));
  const g5 = S(hq2.body, P5);
  ok('H1b 🔑 이력 줄이 없어도 승인 기록만으로 원래 날짜 줄이 남는다', !!g5 && g5.moved_away === true && g5.change && g5.change.label_ko === '⏸ 연기됨 → 11/11 17:30', JSON.stringify(g5 && g5.change));
  ok('H3 원래 날짜 줄에는 입장·참관·옮기기·방이 없다', !!g1 && g1.join_open === false && g1.observable === false && g1.can_move === false && g1.can_split === false && g1.room_id === null, JSON.stringify(g1 && { j: g1.join_open, o: g1.observable, m: g1.can_move, s: g1.can_split, room: g1.room_id }));
  ok('H4 ⛔ 출결·강사 입장 판정을 안 태운다(원래 방의 «입장 없음» 을 결석으로 그리지 않는다)', !!g1 && !g1.attendance && !g1.teacher_entry, JSON.stringify(g1 && { a: g1.attendance, t: g1.teacher_entry }));
  ok('H5 짝: 원래 날짜로 되돌아온 수업은 «연기됨» 줄 없이 한 줄(진짜 수업)만', g3s.length === 1 && !g3s[0].moved_away && g3s[0].status !== 'moved_away', JSON.stringify(g3s.map(s => ({ st: s.status, mv: s.moved_away }))));
  ok('H6 옮긴 뒤 취소된 수업 = «→ 11/14 21:00 · 그 뒤 취소됨»', !!g4 && g4.moved_away === true && /11\/14 21:00 · 그 뒤 취소됨$/.test(g4.change.label_ko) && /later cancelled$/.test(g4.change.label_en), JSON.stringify(g4 && g4.change));
  ok('H7 본사에는 누가·사유·언제가 실린다', !!g1 && !!g1.change.by && g1.change.reason === 'student trip' && !!g1.change.at_kst, JSON.stringify(g1 && g1.change));
  ok('H8 건수: moved_away 5 · 망고아이 수업 수·입장가능 수에는 안 섞인다 · 이력 ok',
    hq2.body.counts && hq2.body.counts.moved_away === 5 && hq2.body.change_history === 'ok'
    && hq2.body.counts.mangoi === (hq2.body.sessions || []).filter(s => s.source === 'mangoi' && !s.moved_away).length
    && (hq2.body.sessions || []).filter(s => s.join_open).every(s => !s.moved_away),
    JSON.stringify({ c: hq2.body.counts, h: hq2.body.change_history }));
  ok('H9 기존 줄은 그대로(취소 X · 연기 Y · 옮겨 온 Z)', !!S(hq2.body, X) && S(hq2.body, X).cancelled === true && !!S(hq2.body, Y) && S(hq2.body, Y).postponed === true && !!S(hq2.body, Z) && S(hq2.body, Z).change.kind === 'moved');
  ok('H10 ⛔ 매주 행(W)은 어떤 경우에도 «연기됨» 줄이 안 생긴다', !(hq2.body.sessions || []).some(s => Number(s.schedule_id) === W));
  const ag2 = await callAdmin('GET', `/api/admin/classes/today?date=${TODAY}`, { cookie: 'tok_agency' });
  const a1 = ag2.body && S(ag2.body, P1);
  ok('H11 지사 매니저도 그 줄을 본다 — 🔒 누가·사유는 빼고(언제는 실린다)', ag2.status === 200 && !!a1 && a1.moved_away === true && a1.change.by === null && a1.change.reason === null && !!a1.change.at_kst, JSON.stringify(a1 && a1.change));
  ok('H11b 🔑🔒 다른 학원 학생의 «연기됨» 줄은 지사에 안 나간다(본사에는 보인다)', !!S(hq2.body, P6) && ag2.status === 200 && !S(ag2.body, P6), JSON.stringify({ hq: !!S(hq2.body, P6), ag: (ag2.body.sessions || []).map(s => s.schedule_id) }));
  // 새 날짜 쪽은 예전 그대로 «옮겨 옴» — 원래 날짜 줄이 새 날짜에 또 생기지 않는다
  const d10 = await callAdmin('GET', `/api/admin/classes/today?date=2026-11-10`, { cookie: 'tok_admin' });
  const n1 = (d10.body.sessions || []).filter(s => Number(s.schedule_id) === P1);
  ok('H12 짝: 새 날짜(11/10)에는 진짜 수업 한 줄 · «다른 날에서 옮겨 옴»', n1.length === 1 && !n1[0].moved_away && n1[0].change && n1[0].change.kind === 'moved' && n1[0].change.from_date === TODAY, JSON.stringify(n1));
  // 앞당긴 수업(Z: 11/04 → 11/03) — 원래 날짜(11/04)에 «📅 앞당김 → 11/03 17:00»
  const d04 = await callAdmin('GET', `/api/admin/classes/today?date=${TOMORROW}`, { cookie: 'tok_admin' });
  const gzz = S(d04.body, Z);
  ok('H13 앞당긴 수업은 원래 날짜에 «📅 앞당김 → 11/03 17:00»', !!gzz && gzz.moved_away === true && gzz.change.label_ko === "📅 앞당김 → 11/03 17:00" && gzz.change.label_en === "📅 Moved earlier → 11/03 17:00" && gzz.start_time === "11:00", JSON.stringify(gzz && { ch: gzz.change, t: gzz.start_time }));

  // 강사 화면 — 주간·월간 달력에 원래 날짜 줄, 오늘 목록(입장 목록)에는 안 넣는다
  const p2 = await portal('tok_alpha');
  const wk2 = ((p2.week && p2.week.days) || []).flatMap(d => (d.items || []).map(it => ({ ...it, _d: d.date })));
  const tw1 = wk2.find(it => Number(it.schedule_id) === P1 && it._d === TODAY);
  ok('H14 🔑 강사 주간 달력: 원래 날짜에 «다른 날로 연기됨» 줄(moved_label · 방 없음)', !!tw1 && tw1.class_state === 'moved_away' && tw1.moved_label_ko === '⏸ 연기됨 → 11/10 18:30' && tw1.moved_label_en === '⏸ Postponed → 11/10 18:30' && !tw1.room_id, JSON.stringify(tw1));
  ok('H15 짝: 강사 «오늘 수업» 목록(입장)에는 그 줄이 없다', !(p2.classes || []).some(c => Number(c.schedule_id) === P1 || c.class_state === 'moved_away'), JSON.stringify((p2.classes || []).map(c => [c.schedule_id, c.class_state])));
  ok('H16 짝: 되돌아온 P3 은 강사 주간 달력에 한 번만(연기 줄 없음)', wk2.filter(it => Number(it.schedule_id) === P3).length === 1 && !wk2.some(it => Number(it.schedule_id) === P3 && it.class_state === 'moved_away'));
  const pm2 = await portal('tok_alpha', '?part=month&month=2026-11');
  const mo2 = ((pm2.month && pm2.month.days) || []).flatMap(d => (d.items || []).map(it => ({ ...it, _d: d.date })));
  ok('H17 강사 월간 달력: 원래 날짜(11/03)에 연기 줄 + 새 날짜(11/10)에 진짜 수업', mo2.some(it => Number(it.schedule_id) === P1 && it._d === TODAY && it.class_state === 'moved_away') && mo2.some(it => Number(it.schedule_id) === P1 && it._d === '2026-11-10' && it.class_state !== 'moved_away'), JSON.stringify(mo2.filter(it => Number(it.schedule_id) === P1)));
  // 학생 — 연기 줄로 보내지 않는다(빈 방 입장 방지)
  const stp = await studentToday('stu_p');
  ok('H18 학생 오늘 수업에는 원래 날짜 줄이 없다', !(stp.sessions || []).some(s => Number(s.schedule_id) === P1), JSON.stringify((stp.sessions || []).map(s => s.schedule_id)));

  /* ── 후속(2026-11-04 함정 대조) ── */
  // H19 강사가 POST /api/admin/class-audit 로 «연기 이력» 을 지어내 원래 날짜 줄을 만들 수 없다 — 짝: 본사는 그대로 적는다
  {
    const nBefore = sq.prepare(`SELECT COUNT(*) n FROM class_audit_log`).get().n;
    const tr = await callAdmin('POST', '/api/admin/class-audit', { cookie: 'tok_alpha', body: { action: 'postpone', schedule_id: P2, lesson_date: '2026-11-03', lesson_time: '09:00', reason: 'forged' } });
    const nMid = sq.prepare(`SELECT COUNT(*) n FROM class_audit_log`).get().n;
    ok('H19 강사는 연기·변경 이력을 직접 못 적는다(403 · 행 안 늘어남)', tr.status === 403 && tr.body.error === 'forbidden_teacher' && nMid === nBefore, JSON.stringify(tr));
    const te = await callAdmin('POST', '/api/admin/class-audit', { cookie: 'tok_alpha', body: { action: 'end', room_id: 'x' } });
    const ar = await callAdmin('POST', '/api/admin/class-audit', { cookie: 'tok_admin', body: { action: 'end', room_id: 'x' } });
    ok('H19b 짝: 강사의 «end» 기록과 본사의 기록은 그대로 된다', te.status === 200 && ar.status === 200, JSON.stringify([te, ar]));
  }
  // H20 원래 날짜 줄은 «연락처 없음» 건수·레벨테스트 건수에 안 섞인다
  {
    const r = await callAdmin('GET', '/api/admin/classes/today?date=' + TODAY, { cookie: 'tok_admin' });
    const ss = r.body.sessions || [];
    const want = ss.filter(x => !x.contact_phone && !x.moved_away).length;
    ok('H20 contact_missing·level_test_count 는 원래 날짜 줄을 빼고 센다',
      ss.some(x => x.moved_away) && r.body.contact_missing === want && r.body.level_test_count === ss.filter(x => x.is_level_test && !x.moved_away).length,
      JSON.stringify({ cm: r.body.contact_missing, want, lt: r.body.level_test_count }));
  }
  // H21 조회가 상한(3000)에 걸리면 «다 물어봤다» 가 아니다 — 짝: 상한 안이면 complete
  {
    const { loadMovedAwayEvents } = await imp('class-change-state.ts');
    const insReq = sq.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, status, orig_date, orig_time, created_at) VALUES (?, 'postpone', 'approved', '2027-02-02', '10:00', ?)`);
    const CT = RealDate.parse('2027-01-20T00:00:00Z');
    sq.exec('BEGIN'); for (let i = 0; i < 3001; i++) insReq.run(900000 + i, CT); sq.exec('COMMIT');
    const big = await loadMovedAwayEvents(DB, '2027-02-02', '2027-02-02');
    sq.exec(`DELETE FROM schedule_change_requests WHERE schedule_id = 900000`);
    const fit = await loadMovedAwayEvents(DB, '2027-02-02', '2027-02-02');
    ok('H21 상한에 걸리면 complete=false — 짝: 상한 안이면 true', big.complete === false && fit.complete === true && fit.byKey.size === 3000, JSON.stringify({ big: big.complete, fit: fit.complete, n: fit.byKey.size }));
    sq.exec(`DELETE FROM schedule_change_requests WHERE schedule_id >= 900000`);
    // H22 원래 날짜보다 400일 넘게 앞서 적힌 기록은 안 읽는다(범위 스캔) — 짝: 그 안이면 읽는다
    sq.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, status, orig_date, orig_time, created_at) VALUES (?, 'postpone', 'approved', '2027-03-01', '10:00', ?)`)
      .run(910001, RealDate.parse('2025-12-01T00:00:00Z'));
    sq.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, status, orig_date, orig_time, created_at) VALUES (?, 'postpone', 'approved', '2027-03-01', '10:00', ?)`)
      .run(910002, RealDate.parse('2027-02-20T00:00:00Z'));
    const old = await loadMovedAwayEvents(DB, '2027-03-01', '2027-03-01');
    ok('H22 400일 넘게 앞선 기록은 빼고, 그 안의 기록은 읽는다', !old.byKey.has('910001|2027-03-01') && old.byKey.has('910002|2027-03-01'), JSON.stringify([...old.byKey.keys()]));
    sq.exec(`DELETE FROM schedule_change_requests WHERE schedule_id >= 910000`);
  }

  // ══ K. 🔒 수업 «취소»(DELETE) 는 본사 계정만 (2026-11-04 «권한 분리») ══
  //    화면은 강사·지사에게 취소 버튼을 안 준다(canCancel). 이 절은 «URL 직접 호출» 을 서버가 막는지 잰다.
  //    지사·대리점은 index.ts 스코프 관문이 막으므로(이 하니스는 그 관문을 안 거친다) 여기서는 강사 세 종류 + 로그인 없음.
  const K1 = mkClass('stu_a', 'one_off', null, '2026-11-12', '09:00');
  for (const [tok, lbl] of [['tok_alpha', '강사'], ['tok_beta', "스코프 'hq' 인 hq_t_* 강사"], ['tok_gamma', "스코프 'none' 인 «교사» 이름 계정"]]) {
    const rr = await callAdmin('DELETE', `/api/admin/class-schedules/${K1}`, { cookie: tok });
    ok('K1 🔒 ' + lbl + ' 세션의 취소(DELETE) 직접 호출은 403 · 행 그대로 · «본사 계정에서» 안내', rr.status === 403 && row(K1).status === 'active'
      && /HQ account/.test(String(rr.body.message_en || '')) && /본사 계정/.test(String(rr.body.message || '')), JSON.stringify({ st: rr.status, b: rr.body, row: row(K1).status }));
  }
  const kNo = await callAdmin('DELETE', `/api/admin/class-schedules/${K1}`, {});
  ok('K2 🔒 로그인 없이(역할을 못 읽으면) 막는다 · 행 그대로', kNo.status === 403 && row(K1).status === 'active', JSON.stringify({ st: kNo.status }));
  ok('K3 🔒 막힌 시도는 이력에 «remove» 로 안 남는다', !sq.prepare(`SELECT 1 FROM class_audit_log WHERE schedule_id = ? AND action = 'remove'`).get(K1));
  const kHq = await callAdmin('DELETE', `/api/admin/class-schedules/${K1}`, { cookie: 'tok_admin' });
  ok('K4 짝: 본사 계정은 그대로 취소된다(행은 cancelled 로 남는다)', kHq.status === 200 && row(K1).status === 'cancelled', JSON.stringify(kHq));
  /* ── I. 매주 반복 수업을 «그 주 하루만» 옮긴 경우 + 관리자 주간 시간표(2026-11-04 빈틈 두 개) ──
     반복 행은 그대로 남고 그 날만 skip_dates 로 빠지며, 옮겨 간 곳은 하루짜리 새 줄(source='recurring-week:<id>')이다
     (recurring-one-week.ts). 그래서 «지금 행이 새 날짜에 있다» 는 날짜 지정 규칙으로는 원래 날짜 줄이 안 생겼다. */
  {
    const { judgeMovedAway, recurWeekChildFor, loadMovedAwayEvents, slotKeyOf, movedAwayBlocked, movedAwayOrder } = await imp('class-change-state.ts');
    for (const u of ['stu_rw1', 'stu_rw2', 'stu_rw3', 'stu_rw4', 'stu_rw5']) ins(`INSERT OR IGNORE INTO students_erp (user_id, korean_name, shop_name, created_at) VALUES (?,?,'owned-shop',?)`, u, '학생' + u, T0);
    const reqApprove = async (id, uid, origTime, newDate, newTime) => {
      const body = { schedule_id: id, teacher_name: 'ALPHA', student_name: '학생' + uid, request_type: 'postpone', orig_date: TOMORROW, orig_time: origTime, reason: 'rw' };
      if (newDate) Object.assign(body, { new_date: newDate, new_time: newTime });
      const a = await callAdmin('POST', '/api/admin/schedule-requests', { cookie: 'tok_admin', body });
      if (a.body && a.body.status === 'pending' && a.body.id) return callAdmin('POST', '/api/admin/schedule-requests/decide', { cookie: 'tok_admin', body: { id: a.body.id, action: 'approve' } });
      return a;
    };
    const kidsOf = (id) => sq.prepare('SELECT * FROM class_schedules WHERE source = ?').all('recurring-week:' + id).map(x => ({ ...x }));
    // RW1 매주(수) 10:00 → 11/04 회차만 11/05 10:00 → 그 하루짜리 줄을 다시 11/06 으로 끌어 옮김(지금 자리 = 11/06)
    const RW1 = mkClass('stu_rw1', 'recurring', 'Wed', null, '10:00');
    let q = await reqApprove(RW1, 'stu_rw1', '10:00', '2026-11-05', '10:00');
    const k1 = kidsOf(RW1)[0];
    ok('I0 전제: RW1 은 skip_dates 에 11/04 · 하루짜리 줄이 11/05 에', String(row(RW1).skip_dates || '').includes(TOMORROW) && !!k1 && k1.scheduled_date === '2026-11-05' && row(RW1).scheduled_date == null, JSON.stringify({ q, rw1: row(RW1), k1 }));
    q = await mv(k1.id, { scheduled_date: '2026-11-06' });
    ok('I0b 전제: 그 하루짜리 줄을 11/06 으로 다시 옮겼다', q.status === 200 && row(k1.id).scheduled_date === '2026-11-06', JSON.stringify(q));
    // RW2 매주(수) 12:00 → 11/04 회차만 «날짜 없이» 연기 → 원래 날짜에 postponed 기록 줄(그 줄이 이미 «연기됨» 을 말한다)
    const RW2 = mkClass('stu_rw2', 'recurring', 'Wed', null, '12:00');
    q = await reqApprove(RW2, 'stu_rw2', '12:00', null, null);
    const k2 = kidsOf(RW2)[0];
    ok('I0c 전제: RW2 는 11/04 12:00 에 postponed 기록 줄', !!k2 && k2.scheduled_date === TOMORROW && k2.status === 'postponed', JSON.stringify({ q, k2 }));
    // RW3 매주(수) 13:00 → 11/06 13:00 으로 옮겼는데, 원래 자리(11/04 13:00)에 같은 학생 수업을 손으로 다시 넣었다(같은 자리)
    const RW3 = mkClass('stu_rw3', 'recurring', 'Wed', null, '13:00');
    q = await reqApprove(RW3, 'stu_rw3', '13:00', '2026-11-06', '13:00');
    const M3 = mkClass('stu_rw3', 'one_off', null, TOMORROW, '13:00');
    ok('I0d 전제: RW3 옮김 + 같은 자리에 손으로 넣은 수업', String(row(RW3).skip_dates || '').includes(TOMORROW) && row(M3).scheduled_date === TOMORROW, JSON.stringify(q));
    // RW4 매주(수) 14:00 — «그 주만» 반영되지 않은 옛 승인 기록(기록만 남음 = skip_dates 없음) → 그 날 수업은 그대로 열린다
    const RW4 = mkClass('stu_rw4', 'recurring', 'Wed', null, '14:00');
    sq.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, status, orig_date, orig_time, new_date, new_time, decided_by, decided_at, created_at) VALUES (?, 'postpone', 'approved', ?, '14:00', '2026-11-07', '14:00', 'h', ?, ?)`)
      .run(RW4, TOMORROW, NOW, NOW);
    /* RW5 매주(수) 09:00 → 11/04 회차를 «날짜 없이» 연기(그 날 postponed 기록 줄 k5) → 나중에 그 기록 줄을 11/07 로 다시 잡음.
       같은 회차가 «반복 행 승인 기록»(RW5, 11/04) 과 «하루짜리 줄을 옮긴 기록»(k5, 11/04) 두 번 잡힌다 — 원래 날짜 줄은 하나여야 한다
       (2026-11-04 함정 대조가 실제 핸들러로 재현: 세 화면 모두 두 줄). 남는 쪽은 «지금 자리를 가진» 하루짜리 줄(k5)이다. */
    const RW5 = mkClass('stu_rw5', 'recurring', 'Wed', null, '09:00');
    q = await reqApprove(RW5, 'stu_rw5', '09:00', null, null);
    const k5 = kidsOf(RW5)[0];
    ok('I0e 전제: RW5 는 11/04 09:00 에 postponed 기록 줄', !!k5 && k5.status === 'postponed' && k5.scheduled_date === TOMORROW, JSON.stringify({ q, k5 }));
    q = await mv(k5.id, { scheduled_date: '2026-11-07' });
    ok('I0f 전제: 그 기록 줄을 11/07 로 다시 잡았다', q.status === 200 && row(k5.id).scheduled_date === '2026-11-07', JSON.stringify(q));

    const d4 = await callAdmin('GET', `/api/admin/classes/today?date=${TOMORROW}`, { cookie: 'tok_admin' });
    const ss4 = d4.body.sessions || [];
    const i1 = S(d4.body, RW1);
    ok('I1 🔑 «그 주 하루만» 옮긴 매주 수업이 원래 날짜(11/04)에 «⏸ 연기됨 → 11/06 10:00»(하루짜리 줄의 «지금 자리»)',
      !!i1 && i1.moved_away === true && i1.start_time === '10:00' && i1.change && i1.change.label_ko === '⏸ 연기됨 → 11/06 10:00' && i1.change.label_en === '⏸ Postponed → 11/06 10:00' && i1.change.to_date === '2026-11-06' && i1.join_open === false && i1.room_id === null,
      JSON.stringify(i1 && { ch: i1.change, t: i1.start_time, j: i1.join_open }));
    const h2 = ss4.filter(x => x.student_uid === 'stu_rw2');
    ok('I2 짝: 날짜 없이 연기한 회차는 한 줄만(연기 기록 줄) — 원래 날짜 줄과 겹치지 않는다', h2.length === 1 && !h2[0].moved_away && h2[0].postponed === true, JSON.stringify(h2.map(x => ({ id: x.schedule_id, mv: x.moved_away, pp: x.postponed }))));
    const h3 = ss4.filter(x => x.student_uid === 'stu_rw3');
    ok('I3 같은 자리에 이미 수업이 있으면 반복 행의 원래 날짜 줄은 안 만든다(한 자리에 두 줄 금지)', h3.length === 1 && !h3[0].moved_away && Number(h3[0].schedule_id) === M3, JSON.stringify(h3.map(x => ({ id: x.schedule_id, mv: x.moved_away }))));
    const h4 = ss4.filter(x => x.student_uid === 'stu_rw4');
    ok('I4 ⛔ skip_dates 에 그 날이 없으면(옛 «기록만» 승인) 원래 날짜 줄 없음 — 그 날 수업은 그대로 열린다', h4.length === 1 && !h4[0].moved_away && Number(h4[0].schedule_id) === RW4, JSON.stringify(h4.map(x => ({ id: x.schedule_id, mv: x.moved_away }))));
    const h5 = ss4.filter(x => x.student_uid === 'stu_rw5');
    ok('I12 🔑 한 자리에 하나 — 반복 행 승인 기록과 하루짜리 줄 옮김 기록이 같은 회차면 «⏸ 연기됨 → 11/07 09:00» 한 줄(지금 자리를 가진 하루짜리 줄)',
      h5.length === 1 && h5[0].moved_away === true && Number(h5[0].schedule_id) === k5.id && h5[0].change && h5[0].change.label_ko === '⏸ 연기됨 → 11/07 09:00',
      JSON.stringify(h5.map(x => ({ id: x.schedule_id, mv: x.moved_away, l: x.change && x.change.label_ko }))));
    ok('I5 이력 ok · moved_away 건수에 들어간다', d4.body.change_history === 'ok' && d4.body.counts && d4.body.counts.moved_away >= 1, JSON.stringify({ h: d4.body.change_history, c: d4.body.counts }));

    // 강사 주간 달력 — 같은 판정(하루짜리 줄은 이 강사의 조회 결과 안에서 찾는다)
    const p3 = await portal('tok_alpha');
    const day4 = (((p3.week && p3.week.days) || []).find(d => d.date === TOMORROW) || {}).items || [];
    const t1 = day4.find(it => Number(it.schedule_id) === RW1);
    ok('I6 🔑 강사 주간 달력: 원래 날짜에 «⏸ 연기됨 → 11/06 10:00»(방 없음)', !!t1 && t1.class_state === 'moved_away' && t1.moved_label_ko === '⏸ 연기됨 → 11/06 10:00' && !t1.room_id, JSON.stringify(t1));
    ok('I7 짝: 강사 달력에서도 날짜 없는 연기·같은 자리 수업은 한 줄만', day4.filter(it => it.student_uid === 'stu_rw2').length === 1 && !day4.some(it => it.student_uid === 'stu_rw2' && it.class_state === 'moved_away')
      && day4.filter(it => it.student_uid === 'stu_rw3').length === 1 && !day4.some(it => it.student_uid === 'stu_rw3' && it.class_state === 'moved_away'),
      JSON.stringify(day4.filter(it => /stu_rw/.test(it.student_uid || '')).map(it => [it.student_uid, it.class_state])));
    const t5 = day4.filter(it => it.student_uid === 'stu_rw5');
    ok('I13 🔑 강사 달력도 한 자리에 하나(지금 자리를 가진 하루짜리 줄)', t5.length === 1 && t5[0].class_state === 'moved_away' && Number(t5[0].schedule_id) === k5.id && t5[0].moved_label_ko === '⏸ 연기됨 → 11/07 09:00',
      JSON.stringify(t5.map(it => ({ id: it.schedule_id, st: it.class_state, l: it.moved_label_ko }))));

    // 관리자 주간 시간표 — off_items 에 «옮겨 간» 칸(off:'postponed', moved_away)
    const w3 = await callAdmin('GET', '/api/admin/schedules?week=2026-11-02', { cookie: 'tok_admin' });
    const o3 = (w3.body && w3.body.off_items) || [];
    const ofU = (uid) => o3.filter(o => (o.students || []).some(s => s.uid === uid));
    const wr1 = ofU('stu_rw1').find(o => o.moved_away && o.date === TOMORROW);   // 11/05 에는 하루짜리 줄을 다시 옮긴 칸이 따로 있다(날짜 지정 규칙)
    ok('I8 🔑 주간 시간표: 매주 수업의 원래 날짜(11/04 10:00)에 «⏸ 연기됨 → 11/06 10:00» 보기 전용 칸', !!wr1 && wr1.off === 'postponed' && wr1.date === TOMORROW && /^10:00/.test(wr1.start_time) && wr1.change.label_ko === '⏸ 연기됨 → 11/06 10:00' && wr1.id === undefined && wr1.move_field === undefined && String(wr1.teacher_id) === '1', JSON.stringify(wr1));
    const wp1 = ofU('stu_p').find(o => o.moved_away);
    ok('I9 🔑 주간 시간표: 날짜 지정 수업도 원래 날짜(11/03)에 «⏸ 연기됨 → 11/10 18:30»', !!wp1 && wp1.date === TODAY && wp1.change.label_ko === '⏸ 연기됨 → 11/10 18:30' && !!wp1.change.by, JSON.stringify(wp1));
    ok('I10 짝: 주간 시간표 — 날짜 없는 연기는 연기 기록 칸 하나 · 같은 자리 수업이 있으면 옮겨 간 칸 없음 · 옛 기록만 승인은 칸 없음',
      ofU('stu_rw2').length === 1 && !ofU('stu_rw2')[0].moved_away && !ofU('stu_rw3').some(o => o.moved_away) && !ofU('stu_rw4').length && w3.body.off_complete === true,
      JSON.stringify({ rw2: ofU('stu_rw2'), rw3: ofU('stu_rw3').map(o => o.moved_away), rw4: ofU('stu_rw4').length, c: w3.body.off_complete }));
    const w5 = ofU('stu_rw5').filter(o => o.date === TOMORROW);
    ok('I14 🔑 주간 시간표도 원래 날짜(11/04)에 칸 하나 — 하루짜리 줄의 칸(note 가 «회차»)',
      w5.length === 1 && w5[0].moved_away === true && /09:00/.test(w5[0].start_time) && w5[0].change.label_ko === '⏸ 연기됨 → 11/07 09:00' && /2026-11-04 회차/.test(w5[0].note || ''),
      JSON.stringify(w5.map(o => ({ t: o.start_time, n: o.note, l: o.change && o.change.label_ko }))));
    const wt3 = await callAdmin('GET', '/api/admin/schedules?week=2026-11-02', { cookie: 'tok_alpha' });
    const tr1 = ((wt3.body && wt3.body.off_items) || []).find(o => o.moved_away && (o.students || []).some(s => s.uid === 'stu_p'));
    ok('I11 🔒 강사에게는 옮겨 간 칸의 누가·사유가 안 실린다', !!tr1 && tr1.change.by === null && tr1.change.reason === null, JSON.stringify(tr1 && tr1.change));

    // 판정 정본 — 순수 함수
    const ev0 = { schedule_id: '77', from_date: '2026-11-04', from_time: '10:00', at: NOW, by: 'x', reason: null };
    const rec = { id: 77, scheduled_date: null, start_time: '10:00', status: 'active', skip_dates: '2026-11-04' };
    ok('J1 반복 행: skip_dates 에 그 날이 없으면 null', judgeMovedAway({ ...rec, skip_dates: '2026-11-11' }, ev0, { showActor: false }, null) === null);
    ok('J2 반복 행: 하루짜리 줄이 원래 날짜(날짜 없는 연기 기록)면 null', judgeMovedAway(rec, ev0, { showActor: false }, { id: 5, scheduled_date: '2026-11-04', start_time: '10:00', status: 'postponed' }) === null);
    const j3 = judgeMovedAway(rec, ev0, { showActor: false }, null);
    ok('J3 하루짜리 줄도 기록의 새 날짜도 없으면 «이 날은 수업 없음» — 날짜를 지어내지 않는다', !!j3 && j3.label_ko === '⏸ 연기됨 — 이 날은 수업 없음' && j3.label_en === '⏸ Postponed — no class this day' && j3.to_date === null, JSON.stringify(j3));
    const j4 = judgeMovedAway(rec, { ...ev0, to_date: '2026-11-12', to_time: '09:30' }, { showActor: false }, null);
    ok('J4 하루짜리 줄을 못 찾으면 기록의 새 날짜로', !!j4 && j4.label_ko === '⏸ 연기됨 → 11/12 09:30' && j4.to_date === '2026-11-12', JSON.stringify(j4));
    const j5 = judgeMovedAway(rec, { ...ev0, to_date: '2026-11-12', to_time: '09:30' }, { showActor: false }, { id: 6, scheduled_date: '2026-11-13', start_time: '11:00', status: 'cancelled' });
    ok('J5 하루짜리 줄이 있으면 그 «지금 자리» 가 기록보다 먼저 · 그 뒤 취소면 덧붙인다', !!j5 && j5.label_ko === '⏸ 연기됨 → 11/13 11:00 · 그 뒤 취소됨', JSON.stringify(j5));
    const kids = [{ id: 5, notes: '반복수업 2026-11-04 회차를 옮김(원래 #77)' }, { id: 9, notes: '반복수업 2026-11-04 회차를 옮김(원래 #77)' }, { id: 12, notes: '반복수업 2026-11-11 회차를 옮김(원래 #77)' }];
    ok('J6 하루짜리 줄 고르기: 그 날짜 것 중 나중 것(id 큰 것) · 다른 날짜 줄은 안 고른다', recurWeekChildFor(kids, '2026-11-04')?.id === 9 && recurWeekChildFor(kids, '2026-11-18') === null);
    const ins7 = sq.prepare(`INSERT INTO class_audit_log (action, schedule_id, lesson_date, lesson_time, actor, detail, created_at) VALUES ('postpone', ?, '2027-04-07', '10:00', 'h', ?, ?)`);
    ins7.run(930001, '→ 2027-04-09 09:30 · 자동승인', RealDate.parse('2027-04-01T00:00:00Z'));
    ins7.run(930002, '자동승인', RealDate.parse('2027-04-01T00:00:00Z'));
    const lj = await loadMovedAwayEvents(DB, '2027-04-07', '2027-04-07');
    const e1 = lj.byKey.get('930001|2027-04-07'), e2 = lj.byKey.get('930002|2027-04-07');
    ok('J7 이력 detail 의 «→ 날짜 시각» 을 읽는다 — 짝: 없으면 null', !!e1 && e1.to_date === '2027-04-09' && e1.to_time === '09:30' && !!e2 && e2.to_date === null, JSON.stringify({ e1, e2 }));
    sq.exec(`DELETE FROM class_audit_log WHERE schedule_id >= 930000`);
    const sk = slotKeyOf('2026-11-04', '9:00', 'stu_x');
    ok('J8 자리 열쇠: 날짜|HH:MM|학생 · 학생이나 날짜를 모르면 빈 열쇠 — 빈 열쇠는 아무것도 안 막는다(모르는 둘을 하나로 합치지 않는다)',
      sk === '2026-11-04|09:00|stu_x' && slotKeyOf('2026-11-04', '09:00', '  ') === '' && slotKeyOf(null, '09:00', 'stu_x') === ''
      && movedAwayBlocked('', true, new Set(['']), new Set([''])) === false, sk);
    ok('J9 한 자리에 하나: 옮겨 감 줄끼리는 누구든 비켜 감 · 진짜 줄은 반복 행에서 온 줄만 비켜 감(짝) · 차례는 날짜 지정 행 먼저',
      movedAwayBlocked(sk, false, new Set(), new Set([sk])) === true && movedAwayBlocked(sk, true, new Set(), new Set([sk])) === true
      && movedAwayBlocked(sk, true, new Set([sk]), new Set()) === true && movedAwayBlocked(sk, false, new Set([sk]), new Set()) === false
      && movedAwayBlocked(sk, true, new Set(['x']), new Set(['y'])) === false
      && movedAwayOrder({ scheduled_date: '2026-11-04' }) === 0 && movedAwayOrder({ scheduled_date: null }) === 1 && movedAwayOrder(undefined) === 1);
    void q;

    // ── L. (2026-11-04) source 색인 — 하루짜리 줄 찾기 `source IN (...)` 가 표를 통째로 훑지 않게 ──
    //    [잰 것 — 운영 D1] 7,575행 · 그 조회 한 번 rows_read 7,575. 정본 ensureScheduleSourceIndex(class-change-state.ts).
    const idxRow = sq.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_sched_source'`).get();
    ok('L1 «오늘 수업» 을 열면(반복 행이 있을 때) source 색인이 생긴다 — class_schedules(source)',
      !!idxRow && /ON\s+class_schedules\s*\(\s*source\s*\)/i.test(String(idxRow.sql || '')), JSON.stringify(idxRow || null));
    const plan = sq.prepare(`EXPLAIN QUERY PLAN SELECT id, scheduled_date, start_time, status, source, notes, teacher_id, user_id FROM class_schedules WHERE source IN (?, ?)`)
      .all('recurring-week:1', 'recurring-week:2').map(r => String(r.detail || '')).join(' / ');
    ok('L2 하루짜리 줄 조회가 그 색인을 탄다(표를 통째로 훑지 않는다)', /USING (COVERING )?INDEX idx_sched_source/.test(plan) && !/^SCAN class_schedules$/m.test(plan), plan);
    // 새 모듈 인스턴스(쿼리 문자열) — «한 isolate 에 한 번» 과 «실패해도 조회는 된다» 를 처음 상태에서 본다
    const mkWrap = (opts) => {
      let creates = 0;
      return { db: { prepare: (sql) => { if (/CREATE INDEX/i.test(sql)) { creates++; if (opts && opts.throwOnCreate) throw new Error('D1_ERROR: harness create failure'); } return DB.prepare(sql); } },
               get creates() { return creates; } };
    };
    const ccsA = await import(pathToFileURL(join(SRC, 'class-change-state.ts')).href + '?L=a');
    const wA = mkWrap();
    sq.prepare(`INSERT INTO class_schedules (id, user_id, start_time, status, source, notes, scheduled_date, created_at) VALUES (940001, 'stu_l', '10:00', 'active', 'recurring-week:940000', '반복수업 2027-05-05 회차를 옮김(원래 #940000)', '2027-05-07', ?)`).run(NOW);
    const rA1 = await ccsA.loadRecurWeekChildren(wA.db, ['940000']);
    const rA2 = await ccsA.loadRecurWeekChildren(wA.db, ['940000']);
    ok('L3 색인 만들기는 한 isolate 에 한 번만 시도한다(요청마다 DDL 을 안 보낸다) — 짝: 조회 결과는 그대로',
      wA.creates === 1 && (rA1.byParent.get('940000') || []).length === 1 && (rA2.byParent.get('940000') || []).length === 1 && rA2.complete === true,
      JSON.stringify({ creates: wA.creates, a1: (rA1.byParent.get('940000') || []).length, a2: (rA2.byParent.get('940000') || []).length }));
    const ccsB = await import(pathToFileURL(join(SRC, 'class-change-state.ts')).href + '?L=b');
    const wB = mkWrap({ throwOnCreate: true });
    let rB = null, errB = null;
    try { rB = await ccsB.loadRecurWeekChildren(wB.db, ['940000']); } catch (e) { errB = String(e && e.message || e); }
    ok('L4 색인 만들기가 실패해도 조회는 그대로 된다(색인은 속도일 뿐 — 던지지 않는다)',
      !errB && !!rB && rB.complete === true && (rB.byParent.get('940000') || []).length === 1 && wB.creates === 1, JSON.stringify({ errB, creates: wB.creates }));
    const wC = mkWrap();
    const ccsC = await import(pathToFileURL(join(SRC, 'class-change-state.ts')).href + '?L=c');
    await ccsC.loadRecurWeekChildren(wC.db, []);
    ok('L5 반복 행이 없으면 아무것도 안 보낸다(조회도 색인 만들기도)', wC.creates === 0, String(wC.creates));
    sq.exec(`DELETE FROM class_schedules WHERE id = 940001`);
  }

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

/* ⏱ (2026-11-04) 변이가 40종을 넘어 «하나씩» 돌리면 --fast 동시 실행에서 90초 상한을 넘었다 — 변이만 동시에 돌린다.
   결과 줄은 원래 순서대로 찍는다(출력이 매번 같게). CCV_JOBS=1 이면 예전처럼 하나씩. */
const parseChild = (stdout, stderr) => {
  const out = stdout || '';
  const i = out.lastIndexOf('@@RESULTS@@');
  if (i < 0) return { crashed: true, err: ((stderr || '') + out).split('\n').filter(Boolean).slice(-22).join('\n') };
  return JSON.parse(out.slice(i + '@@RESULTS@@'.length).trim().split('\n')[0]);
};
function runChildAsync(srcDir) {
  return new Promise((resolve) => {
    const cp = spawn(process.execPath,
      ['--experimental-strip-types', '--no-warnings', '--import', pathToFileURL(join(tmp, 'reg.mjs')).href, SELF],
      { env: { ...process.env, CCV_CHILD: '1', CCV_SRC: srcDir } });
    let so = '', se = '';
    cp.stdout.on('data', (d) => { so += d; });
    cp.stderr.on('data', (d) => { se += d; });
    const t = setTimeout(() => { try { cp.kill('SIGKILL'); } catch {} }, 180000);
    cp.on('close', () => { clearTimeout(t); try { resolve(parseChild(so, se)); } catch (e) { resolve({ crashed: true, err: String(e) }); } });
  });
}
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
  { name: '주간 시간표: 취소·연기 회차를 안 실음(옛 동작)', expect: /G1 |G5 /,
    edits: [['api-admin.ts', 'if (!change) continue;\n          offItems.push({', 'if (!change || true) continue;\n          offItems.push({']] },
  { name: '주간 시간표: 취소 회차를 items 에 섞음(옛 화면이 살아 있는 수업으로 그림)', expect: /G3 /,
    edits: [['api-admin.ts', "`SELECT * FROM class_schedules WHERE (status IS NULL OR status='active')`", "`SELECT * FROM class_schedules WHERE (status IS NULL OR status='active' OR scheduled_date IS NOT NULL)`"]] },
  { name: '주간 시간표: «그 주 하루만» 빠진 날에도 반복 수업을 그림', expect: /G9 /,
    edits: [['api-admin.ts', 'if (recurSkippedOn(r, d)) continue;\n              items.push', 'items.push']] },
  { name: '주간 시간표: LMS 자리표시 거르기를 뺌', expect: /G7 /,
    edits: [['api-admin.ts', "if (['lms', 'type_seed'].includes(String(r.user_id || '').trim().toLowerCase())) return false;\n          return isCancelledOccurrence", 'return isCancelledOccurrence']] },
  { name: '주간 시간표: 누구에게나 누가·사유를 실음', expect: /G12 /,
    edits: [['api-admin.ts', "const _offShowActor = !_offIsTeacher && !!_offScope && (_offScope.type === 'hq' || _offScope.type === 'none');", 'const _offShowActor = true;']] },
  { name: '주간 시간표: 역할은 안 보고 스코프만 봄(hq·none 스코프 강사에게 누가·사유가 샘)', expect: /G13 |G14 /,
    edits: [['api-admin.ts', 'const _offShowActor = !_offIsTeacher && !!_offScope', 'const _offShowActor = !!_offScope']] },
  { name: '주간 시간표: 역할 판정을 꺼 버림(강사도 본사처럼 봄)', expect: /G13 |G14 /,
    edits: [['api-admin.ts', '_offIsTeacher = !_offActor || !_offActor.ok || !!_offActor.isTeacher;', '_offIsTeacher = !!(_offActor && _offActor.ok && _offActor.isTeacher) && false;']] },
  { name: '원래 날짜 줄: 판정 조건 뒤집기(같은 날짜일 때만 줄을 만듦)', expect: /H1 |H2 |H5 /,
    edits: [['class-change-state.ts', "if (cur === from) return null;", "if (cur !== from) return null;"]] },
  { name: '원래 날짜 줄: 요청 승인 기록을 안 읽음', expect: /H1b /,
    edits: [['class-change-state.ts', "WHERE status = 'approved' AND created_at >= ?", "WHERE status = 'never' AND created_at >= ?"]] },
  { name: '원래 날짜 줄: 끌어 옮기기 이력을 안 읽음', expect: /H2 /,
    edits: [['class-change-state.ts', "WHERE action IN (${acts}) AND created_at >= ?", "WHERE action IN ('never') AND created_at >= ?"]] },
  { name: '원래 날짜 줄: 출결 판정을 태움(결석으로 그릴 수 있음)', expect: /H4 /,
    edits: [['api-admin.ts', 'sessions.filter(x => !x.moved_away), dateStr', 'sessions, dateStr']] },
  { name: '원래 날짜 줄: 지사에도 누가·사유를 실음', expect: /H11 /,
    edits: [['api-admin.ts', 'judgeMovedAway(s, _mvEv.byKey.get(movedAwayKey(s.id, dateStr)), { showActor: _ctSeeContact },', 'judgeMovedAway(s, _mvEv.byKey.get(movedAwayKey(s.id, dateStr)), { showActor: true },']] },
  { name: '원래 날짜 줄: 스코프 조건을 뺌(지사에 남의 학생이 샘)', expect: /H11b /,
    edits: [['api-admin.ts', "AND LOWER(COALESCE(cs.user_id,'')) NOT IN ('lms','type_seed')\n                        ${_ctStu.cond ? `AND (${_ctStu.cond})` : ''}`,\n            { tail: _ctStu.binds });",
             "AND LOWER(COALESCE(cs.user_id,'')) NOT IN ('lms','type_seed')`,\n            { tail: [] });"]] },
  { name: '원래 날짜 줄: 망고아이 수업 수에 섞음', expect: /H8 /,
    edits: [['api-admin.ts', 'mangoi: sessions.length - c24Count - sessions.filter(x => x.moved_away).length,', 'mangoi: sessions.length - c24Count,']] },
  { name: '강사 주간 달력: 원래 날짜 줄을 안 넣음', expect: /H14 /,
    edits: [['api-teacher.ts', 'for (const m of _mvAwayItems) { const d = weekDays.find((x: any) => x.date === m.date); if (d && !mvShadowed(d, m)) d.items.push({ ...m.item }); }', '']] },
  { name: '강사 월간 달력: 원래 날짜 줄을 안 넣음', expect: /H17 /,
    edits: [['api-teacher.ts', 'for (const m of _mvAwayItems) { const d = monthDays.find((x: any) => x.date === m.date); if (d && !mvShadowed(d, m)) d.items.push({ ...m.item }); }', '']] },
  { name: '후속: 강사의 연기 이력 직접 쓰기를 다시 열어 둠', expect: /H19 /,
    edits: [['api-admin.ts', "if (_cawActor.isTeacher && ['postpone', 'reschedule', 'remove', 'restore'].includes(action)) {", "if (false && _cawActor.isTeacher) {"]] },
  { name: '후속: 강사의 모든 기록을 막음(end 까지)', expect: /H19b /,
    edits: [['api-admin.ts', "if (_cawActor.isTeacher && ['postpone', 'reschedule', 'remove', 'restore'].includes(action)) {", "if (_cawActor.isTeacher) {"]] },
  { name: '후속: 연락처 없음 건수에 원래 날짜 줄을 섞음', expect: /H20 /,
    edits: [['api-admin.ts', 'contact_missing: sessions.filter(x => !x.contact_phone && !x.moved_away).length,', 'contact_missing: sessions.filter(x => !x.contact_phone).length,']] },
  { name: '후속: 잘려도 complete 를 참으로 둠', expect: /H21 /,
    edits: [['class-change-state.ts', "if (list.length > CAP) complete = false;\n    for (const r of list.slice(0, CAP)) {\n      put({ schedule_id: String(r.schedule_id ?? '').trim(), from_date: ymd(r.orig_date)", "for (const r of list.slice(0, CAP)) {\n      put({ schedule_id: String(r.schedule_id ?? '').trim(), from_date: ymd(r.orig_date)"]] },
  { name: '후속: 400일 경계를 거꾸로(옛 기록만 읽음)', expect: /H22 /,
    edits: [['class-change-state.ts', "WHERE status = 'approved' AND created_at >= ?", "WHERE status = 'approved' AND created_at < ?"]] },
  { name: '주간 시간표: 조건 뒤집기 — 취소 회차를 거꾸로 거름', expect: /G1 |G5 /,
    edits: [['api-admin.ts', 'return isCancelledOccurrence(r) || isPostponedOccurrence(r);', 'return !(isCancelledOccurrence(r) || isPostponedOccurrence(r));']] },
  { name: '🔒 취소: 강사 막기를 걷어냄(옛 동작)', expect: /K1 /,
    edits: [['api-admin.ts', 'if (!_delActor || !_delActor.ok || _delActor.isTeacher) {', 'if (false) {']] },
  { name: '🔒 취소: 조건 뒤집기 — 본사를 막고 강사를 통과', expect: /K1 |K4 /,
    edits: [['api-admin.ts', 'if (!_delActor || !_delActor.ok || _delActor.isTeacher) {', 'if (!_delActor || !_delActor.ok || !_delActor.isTeacher) {']] },
  { name: '🔒 취소: 역할을 못 읽어도 통과(«모르면 막기» 해제)', expect: /K2 /,
    edits: [['api-admin.ts', 'if (!_delActor || !_delActor.ok || _delActor.isTeacher) {', 'if (_delActor && _delActor.ok && _delActor.isTeacher) {']] },
  { name: '반복: skip_dates 확인을 뺌(옛 «기록만» 승인에도 원래 날짜 줄)', expect: /I4 |J1 /,
    edits: [['class-change-state.ts', 'if (!normSkipDates(row.skip_dates).includes(from)) return null;', '']] },
  { name: '반복: 판정 조건 뒤집기(skip_dates 에 «없을 때» 줄을 만듦)', expect: /I1 |I4 |J1 /,
    edits: [['class-change-state.ts', 'if (!normSkipDates(row.skip_dates).includes(from)) return null;', 'if (normSkipDates(row.skip_dates).includes(from)) return null;']] },
  { name: '반복: 하루짜리 줄이 원래 날짜(연기 기록)여도 줄을 만듦', expect: /J2 /,
    edits: [['class-change-state.ts', 'if (cDate === from) return null;', '']] },
  { name: '반복: 목적지를 모르면 원래 날짜를 «→» 로 지어냄', expect: /J3 /,
    edits: [['class-change-state.ts', 'if (td && td !== from) { toDate = td; toTime = hhmm(ev.to_time); }', '{ toDate = td || from; toTime = hhmm(ev.to_time || ev.from_time); }']] },
  { name: '반복: 기록 detail 의 새 날짜를 안 읽음', expect: /J7 /,
    edits: [['class-change-state.ts', '        ...moveToOf(r.detail) });', '        });']] },
  { name: '반복: 하루짜리 줄 조회를 안 함(오늘 수업 — 기록의 옛 새 날짜로 말함)', expect: /I1 /,
    edits: [['api-admin.ts', 'const _rw = _rwIds.length ? await loadRecurWeekChildren(env.DB, _rwIds) : null;', 'const _rw = null;']] },
  { name: '반복: 같은 자리 빼기를 뺌(오늘 수업)', expect: /I3 /,
    edits: [['api-admin.ts', 'if (movedAwayBlocked(_slot, _isRecur, _taken, _ghostAt)) continue;', 'if (movedAwayBlocked(_slot, _isRecur, new Set(), _ghostAt)) continue;']] },
  { name: '한 자리에 하나: 옮겨 감 줄끼리 겹침을 안 봄(오늘 수업 — 함정 대조가 찾은 두 줄)', expect: /I12 /,
    edits: [['api-admin.ts', 'if (movedAwayBlocked(_slot, _isRecur, _taken, _ghostAt)) continue;', 'if (movedAwayBlocked(_slot, _isRecur, _taken, new Set())) continue;']] },
  { name: '한 자리에 하나: 차례 정렬을 뺌(오늘 수업 — 반복 행 쪽이 남음)', expect: /I12 /,
    edits: [['api-admin.ts', '[..._mvRows].sort((a: any, b: any) => movedAwayOrder(a) - movedAwayOrder(b))', '_mvRows']] },
  { name: '한 자리에 하나: 조건 뒤집기(진짜 줄 비켜 가기를 날짜 지정 행에 걺)', expect: /I3 /,
    edits: [['class-change-state.ts', 'return ghosts.has(key) || (recur && taken.has(key));', 'return ghosts.has(key) || (!recur && taken.has(key));']] },
  { name: '한 자리에 하나: 차례 뒤집기(반복 행 먼저)', expect: /I12 |I14 |J9 /,
    edits: [['class-change-state.ts', "return ymd(row && row.scheduled_date) ? 0 : 1;", "return ymd(row && row.scheduled_date) ? 1 : 0;"]] },
  { name: '자리 열쇠: 학생을 몰라도 열쇠를 만듦', expect: /J8 /,
    edits: [['class-change-state.ts', "if (!d || !u) return '';", '']] },
  { name: '한 자리에 하나: 빈 열쇠도 막음', expect: /J8 /,
    edits: [['class-change-state.ts', 'if (!key) return false;\n  return ghosts.has(key)', 'return ghosts.has(key)']] },
  { name: '반복: 같은 자리 빼기를 뺌(강사 달력)', expect: /I7 /,
    edits: [['api-teacher.ts', 'm.item.student_uid), !!m.recur, taken, ghosts);', 'm.item.student_uid), !!m.recur, new Set(), ghosts);']] },
  { name: '한 자리에 하나: 옮겨 감 줄끼리 겹침을 안 봄(강사 달력)', expect: /I13 /,
    edits: [['api-teacher.ts', 'm.item.student_uid), !!m.recur, taken, ghosts);', 'm.item.student_uid), !!m.recur, taken, new Set());']] },
  { name: '한 자리에 하나: 차례 정렬을 뺌(강사 달력)', expect: /I13 /,
    edits: [['api-teacher.ts', '_mvAwayItems.sort((a, b) => Number(!!a.recur) - Number(!!b.recur));', '']] },
  { name: '반복: 강사 달력이 하루짜리 줄을 안 넘김', expect: /I6 /,
    edits: [['api-teacher.ts', "_recur ? recurWeekChildFor(_mvKids.get(String(r.id)), ev.from_date) : null);", 'null);']] },
  { name: '주간 시간표: 옮겨 간 칸을 안 실음', expect: /I8 |I9 /,
    edits: [['api-admin.ts', 'const ch = judgeMovedAway(r, ev, { showActor: _offShowActor },', 'const ch = null && judgeMovedAway(r, ev, { showActor: _offShowActor },']] },
  { name: '주간 시간표: 같은 자리 빼기를 뺌', expect: /I10 /,
    edits: [['api-admin.ts', 'if (movedAwayBlocked(_slotW, _recur, _takenW, _ghostW)) continue;', 'if (movedAwayBlocked(_slotW, _recur, new Set(), _ghostW)) continue;']] },
  { name: '주간 시간표: 옮겨 감 칸끼리 겹침을 안 봄', expect: /I14 /,
    edits: [['api-admin.ts', 'if (movedAwayBlocked(_slotW, _recur, _takenW, _ghostW)) continue;', 'if (movedAwayBlocked(_slotW, _recur, _takenW, new Set())) continue;']] },
  { name: '주간 시간표: 차례 정렬을 뺌', expect: /I14 /,
    edits: [['api-admin.ts', '.sort((a, b) => movedAwayOrder(_mvWById.get(String(a.schedule_id))) - movedAwayOrder(_mvWById.get(String(b.schedule_id))));', ';']] },
  { name: '색인: 하루짜리 줄 조회 전에 색인을 안 만듦', expect: /L1 |L2 /,
    edits: [['class-change-state.ts', '  await ensureScheduleSourceIndex(db);\n', '']] },
  { name: '색인: 엉뚱한 칸에 만듦(notes)', expect: /L1 |L2 /,
    edits: [['class-change-state.ts', "ON class_schedules(source)').run();", "ON class_schedules(notes)').run();"]] },
  { name: '색인: 한 번만 시도하는 표시를 뺌(요청마다 DDL)', expect: /L3 /,
    edits: [['class-change-state.ts', '  _sourceIdxTried = true;\n', '']] },
  { name: '색인: 만들기 실패를 그대로 던짐', expect: /L4 /,
    edits: [['class-change-state.ts', "  try { await db.prepare('CREATE INDEX IF NOT EXISTS idx_sched_source ON class_schedules(source)').run(); } catch { /* 색인이 없어도 조회는 된다 */ }",
             "  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sched_source ON class_schedules(source)').run();"]] },
  { name: '색인: 반복 행이 없어도 만들러 감(조건 앞으로)', expect: /L5 /,
    edits: [['class-change-state.ts', "  const srcs = Array.from(new Set((parentIds || []).map(x => String(x ?? '').trim()).filter(x => /^\\d+$/.test(x))))",
             "  await ensureScheduleSourceIndex(db);\n  const srcs = Array.from(new Set((parentIds || []).map(x => String(x ?? '').trim()).filter(x => /^\\d+$/.test(x))))"]] },
  { name: '주간 시간표: 옮겨 간 칸에 누구에게나 누가·사유', expect: /I11 /,
    edits: [['api-admin.ts', 'const ch = judgeMovedAway(r, ev, { showActor: _offShowActor },', 'const ch = judgeMovedAway(r, ev, { showActor: true },']] },
];
const prepared = MUTANTS.map((m, idx) => {
  const dir = join(tmp, 'm-' + idx);
  cpSync(REAL_SRC, dir, { recursive: true });
  let missing = '';
  for (const [f, from, to] of m.edits) {
    const p = join(dir, f), s = readFileSync(p, 'utf8');
    if (!s.includes(from)) { missing = f; break; }
    writeFileSync(p, s.replace(from, to));
  }
  return { m, dir, missing };
});
const JOBS = Math.max(1, Number(process.env.CCV_JOBS) || Math.min(4, (availableParallelism && availableParallelism()) || 2));
const outcomes = new Array(prepared.length);
let next = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  for (;;) {
    const k = next++;
    if (k >= prepared.length) return;
    if (prepared[k].missing) continue;
    outcomes[k] = await runChildAsync(prepared[k].dir);
  }
}));
for (let k = 0; k < prepared.length; k++) {
  const { m, missing } = prepared[k];
  if (missing) { fail++; console.log('  FAIL 변이 «' + m.name + '» — ' + missing + ' 에서 바꿀 자리를 못 찾았다(소스가 바뀌었으면 변이도 고칠 것)'); continue; }
  const res = outcomes[k] || { crashed: true, err: 'no result' };
  const failed = res.crashed ? ['(crash)'] : res.results.filter(t => !t.pass).map(t => t.name);
  const caught = !res.crashed && failed.some(n => m.expect.test(n));
  if (caught) { pass++; console.log('  PASS 변이 잡힘 «' + m.name + '» → ' + failed.filter(n => m.expect.test(n)).slice(0, 3).join(' · ')); }
  else { fail++; console.log('  FAIL 변이 못 잡음 «' + m.name + '»' + (res.crashed ? ' (자식이 죽음: ' + String(res.err).slice(-200) + ')' : failed.length ? ' (다른 실패: ' + failed.slice(0, 3).join(' · ') + ')' : '')); }
}
cleanup();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
