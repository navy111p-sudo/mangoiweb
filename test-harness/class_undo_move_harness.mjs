import { adminSrcFromFile as readAdminSourceFromFile } from './_srcbundle.mjs';
/**
 * ↩ 옮긴 수업 되돌리기 (2026-11-04 매니저 Mai «I postpone the class but there's no restore or undo postponement option»)
 *
 * 무엇을 재나 — 실제 모듈(class-undo-move.ts · class-change-state.ts · class-schedule-move.ts)을 진짜 SQLite 로 돌린다.
 *   A. 판정 정본 judgeMovedAwayUndo — 되돌릴 수 있나(시각·대상 상태·매주 반복의 하루짜리 줄)
 *   B. undoMovedClass — 실제로 원래 날짜·시각으로 돌아가는가 · 같은 행인가 · 기록이 'restore' 라 새 날짜에 «옮겨 감» 줄이
 *      안 생기는가 · 겹침·휴가·출석·동시 수정·조회 실패(모르면 막기)·매주 반복 하루짜리 줄
 *   C. 두 화면(admin.html js/adm-today-classes.js · manager.html)의 버튼 함수를 «오려 내 실제로 돌려» —
 *      본사만 · 못 하면 사유 글자 · 누르면 action:'undo_move' + from_date 를 보내는가 · 배선
 *   변이시험 — 고친 자리를 되돌린 사본에서 이 하니스가 정말 빨간불이 되는가.
 *   E. (e2e 자식) 진짜 handleAdminApi 로 — «오늘 수업» 응답의 undo 칸 · POST {action:'undo_move'} 의 본사 게이트 · 실제로 돌아오는가.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_SRC = join(ROOT, 'cloudflare-deploy/src');
const REAL_PUB = join(ROOT, 'cloudflare-deploy/public');
const SELF = fileURLToPath(import.meta.url);

/* JS 소스에서 «여는 자리부터 짝이 맞는 닫는 중괄호까지» 를 오린다(문자열·주석 안의 괄호는 건너뜀). */
function cutBlock(src, startNeedle) {
  const s = src.indexOf(startNeedle);
  if (s < 0) return '';
  let i = src.indexOf('{', s), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) return ''; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(s, i + 1);
  }
  return '';
}
/* 주석을 벗긴 사본(배선 검사가 «설명 주석» 에 걸려 헛돌지 않게) — 문자열 안은 그대로 둔다. */
function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e - 1; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const st = i;
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      out += src.slice(st, i + 1); continue;
    }
    out += c;
  }
  return out;
}

/* ═════════════════════════ 자식(e2e): 진짜 핸들러로 HTTP 경로 ═════════════════════════
   «오늘 수업» 응답의 undo 칸 · POST {action:'undo_move'} 의 본사 게이트 · 실제로 돌아오는가 — api-admin.ts 의 진짜 handleAdminApi.
   ⏱ 무거운 모듈(api-admin.ts)을 부르므로 «기본 실행» 과 e2e 변이에서만 돈다. 처음엔 이 절을 class_cancelled_visible_harness 에
     넣었는데, 그 하니스는 변이마다 시나리오 전체를 다시 돌려 CI 에서 90초 상한(run.mjs)을 넘겨 SKIP 으로 빠졌다
     (2026-11-04 PR #2093 — SKIP 20→21 «기준선 이탈»). 그래서 여기로 옮겼다. 준비 방식은 그 하니스와 같다. */
if (process.env.CUM_CHILD === '1' && process.env.CUM_MODE === 'e2e') {
  const SRC = process.env.CUM_SRC;
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
  console.warn = () => {};
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this harness'); };

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
  const { checkAdminSession } = await imp('auth-admin.ts');
  const { getScope } = await imp('scope.ts');
  const { scheduleMoveVersion } = await imp('class-schedule-move.ts');
  const adminSrc = readAdminSourceFromFile(join(SRC, 'api-admin.ts'));
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

  // 스키마: 핸들러가 스스로 만드는 것은 핸들러에게, 나머지는 소스의 CREATE 문을 읽어서(하니스에 베끼지 않는다)
  setNow('2026-12-02', '08:00');
  try {
    await checkAdminSession(req('GET', '/x', { cookie: 'prime' }), env);
    await getScope(env, req('GET', '/x'));
    await handleMangoApi(req('GET', '/api/class/sessions/today?user_id=prime'), new URL(BASE + '/api/class/sessions/today?user_id=prime'), env, {});
  } catch (e) { ok('E0 전제: 스키마 준비', false, e.message); }
  const cutCreate = (src, name, mustContain) => {
    const re = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + name + '\\s*\\([\\s\\S]*?\\);?)`', 'g');
    let m; while ((m = re.exec(src))) { if (!mustContain || m[1].includes(mustContain)) return m[1]; }
    return null;
  };
  const tIdx = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const tEnd = adminSrc.indexOf("].join(' ')", tIdx);
  const ddls = [
    tIdx > 0 && tEnd > tIdx ? [...adminSrc.slice(tIdx, tEnd).matchAll(/`([^`]*)`/g)].map((m) => m[1]).join(' ') : null,
    cutCreate(adminSrc, 'students_erp', 'user_id TEXT PRIMARY KEY, korean_name'),
    cutCreate(adminSrc, 'teacher_account_links'),
    cutCreate(adminSrc, 'attendance', 'room_id TEXT NOT NULL'),
    cutCreate(readFileSync(join(SRC, 'student-schedule-request.ts'), 'utf8'), 'schedule_change_requests'),
  ];
  ok('E0 전제: teachers·students_erp·teacher_account_links·attendance·schedule_change_requests CREATE 를 소스에서 읽었다', ddls.every(Boolean));
  for (const d of ddls) if (d) sq.exec(d);
  // 운영 명부의 칸(소스 CREATE 에는 없고 나중에 ALTER) — 없으면 «오늘 수업» 조인이 폴백으로 돌고 지사 계정은 0건이 된다
  for (const col of ['shop_name', 'level', 'textbook']) {
    if (!sq.prepare('PRAGMA table_info(students_erp)').all().some(c => c.name === col)) sq.exec(`ALTER TABLE students_erp ADD COLUMN ${col} TEXT`);
  }
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
  ins(`INSERT INTO students_erp (user_id, korean_name, shop_name, created_at) VALUES ('stu_un','학생stu_un','owned-shop',?)`, T0);
  const mkClass = (user, date, time) => Number(ins(
    `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
     VALUES (?,?, 'one_off', 'regular', NULL, ?, ?, 20, '1', 'active', 'harness', ?)`, user, '학생' + user, date, time, T0).lastInsertRowid);
  const row = (id) => ({ ...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id) });
  const S = (b, id) => ((b && b.sessions) || []).find(s => Number(s.schedule_id) === id);

  const UD = '2026-12-02', UN = '2026-12-09';   // 수요일 → 다음 주 수요일
  const U1 = mkClass('stu_un', UD, '20:00');
  const U2 = mkClass('stu_un', UD, '10:00');
  const mvU = (id) => callAdmin('PATCH', '/api/admin/class-schedules/move', { cookie: 'tok_admin', body: { ids: [id], expected: { [id]: scheduleMoveVersion(row(id)) }, patch: { scheduled_date: UN } } });
  const r1 = await mvU(U1), r2 = await mvU(U2);
  ok('E0b 전제: 두 수업(20:00·10:00)을 끌어 옮기기로 12/09 로(진짜 PATCH 경로)', r1.status === 200 && r2.status === 200 && row(U1).scheduled_date === UN && row(U2).scheduled_date === UN, JSON.stringify({ r1, r2 }));
  setNow(UD, '18:30');
  const d0 = await callAdmin('GET', `/api/admin/classes/today?date=${UD}`, { cookie: 'tok_admin' });
  ok('E0c 전제: «오늘 수업» 이 조인 경로로 돌았다(학원 칸이 실렸다)', d0.status === 200 && (d0.body.sessions || []).some(s => s.academy === 'owned-shop'), JSON.stringify(d0).slice(0, 300));
  const g1 = S(d0.body, U1), g2 = S(d0.body, U2);
  ok('E1 🔑 원래 날짜 줄에 «되돌릴 수 있음» 이 실린다(원래 12/02 20:00)', !!g1 && g1.moved_away === true && g1.undo && g1.undo.ok === true && g1.undo.reason === null
    && g1.undo.from_date === UD && g1.undo.from_time === '20:00', JSON.stringify(g1 && g1.undo));
  ok('E1b 짝: 원래 시각(10:00)이 지난 줄은 «못 함 · orig_passed»', !!g2 && g2.moved_away === true && g2.undo && g2.undo.ok === false && g2.undo.reason === 'orig_passed', JSON.stringify(g2 && g2.undo));
  const ra = await callAdmin('POST', `/api/admin/class-schedules/${U1}`, { cookie: 'tok_agency', body: { action: 'undo_move', from_date: UD } });
  const rt = await callAdmin('POST', `/api/admin/class-schedules/${U1}`, { cookie: 'tok_alpha', body: { action: 'undo_move', from_date: UD } });
  ok('E2 🔒 지사·강사 세션의 되돌리기는 403 · 행 그대로(본사 전용 — 연기 취소와 같은 선)', ra.status === 403 && rt.status === 403 && row(U1).scheduled_date === UN, JSON.stringify({ ra, rt }));
  const rp = await callAdmin('POST', `/api/admin/class-schedules/${U2}`, { cookie: 'tok_admin', body: { action: 'undo_move', from_date: UD } });
  ok('E3 원래 시각이 지난 수업은 본사가 눌러도 409 orig_passed · 행 그대로', rp.status === 409 && rp.body.error === 'orig_passed' && row(U2).scheduled_date === UN, JSON.stringify(rp));
  const rh = await callAdmin('POST', `/api/admin/class-schedules/${U1}`, { cookie: 'tok_admin', body: { action: 'undo_move', from_date: UD } });
  ok('E4 🔑 본사 되돌리기 200 · 같은 행이 12/02 20:00 · active 로', rh.status === 200 && rh.body.ok === true && row(U1).scheduled_date === UD && row(U1).start_time === '20:00' && row(U1).status === 'active', JSON.stringify(rh));
  const d1 = await callAdmin('GET', `/api/admin/classes/today?date=${UD}`, { cookie: 'tok_admin' });
  const s1 = (d1.body.sessions || []).filter(s => Number(s.schedule_id) === U1);
  ok('E5 원래 날짜에는 «옮겨 감» 줄 대신 진짜 수업 한 줄(취소·연기 칸 비어 있음)', s1.length === 1 && !s1[0].moved_away && !s1[0].change, JSON.stringify(s1.map(s => ({ mv: s.moved_away, ch: s.change }))));
  const d2 = await callAdmin('GET', `/api/admin/classes/today?date=${UN}`, { cookie: 'tok_admin' });
  ok('E6 짝: 새 날짜(12/09)에는 그 수업이 «옮겨 감» 줄로도 안 남는다(U2 는 그대로 그 날 수업)', !S(d2.body, U1) && !!S(d2.body, U2), JSON.stringify((d2.body.sessions || []).map(s => [s.schedule_id, s.moved_away])));

  ok('E7 past correction is offered separately', g2?.undo?.historical_available === true, g2?.undo);
  const denyHistory = await callAdmin('POST', `/api/admin/class-schedules/${U2}`, { cookie:'tok_agency', body:{action:'undo_move',from_date:UD,historical_correction:true} });
  ok('E8 agency cannot correct past history', denyHistory.status === 403 && row(U2).scheduled_date === UN, denyHistory);
  const history = await callAdmin('POST', `/api/admin/class-schedules/${U2}`, { cookie:'tok_admin', body:{action:'undo_move',from_date:UD,historical_correction:true} });
  ok('E9 real route corrects past to postponed only', history.status === 200 && row(U2).scheduled_date === UD && row(U2).status === 'postponed', history);
  const repeatHistory = await callAdmin('POST', `/api/admin/class-schedules/${U2}`, { cookie:'tok_admin', body:{action:'undo_move',from_date:UD,historical_correction:true} });
  ok('E10 repeat correction cannot reactivate', repeatHistory.status === 409 && row(U2).status === 'postponed', repeatHistory);

  /* ↩ (2026-11-06 사장님 스크린샷 그대로) 12/02 12:00 수업을 12/09 로 연기 → 12/09 수업을 «취소» → 원래 시각(12:00)은 지남.
     원래 날짜 줄에 «되돌릴 수 없음» 만 있던 자리 — 이제 «취소 수업 복원» 이 실리고, 누르면 진짜 경로로 12/09 에 다시 열린다. */
  setNow(UD, '08:00');
  const U3 = mkClass('stu_un', UD, '12:00');
  const m3 = await mvU(U3);
  const c3 = await callAdmin('DELETE', `/api/admin/class-schedules/${U3}`, { cookie: 'tok_admin', body: { reason: 'harness' } });
  ok('E11 전제: 12:00 수업을 12/09 로 옮기고(진짜 PATCH) 그 12/09 수업을 취소(진짜 DELETE)', m3.status === 200 && c3.status === 200 && row(U3).scheduled_date === UN && row(U3).status === 'cancelled', JSON.stringify({ m3, c3 }));
  setNow(UD, '18:30');
  const d3 = await callAdmin('GET', `/api/admin/classes/today?date=${UD}`, { cookie: 'tok_admin' });
  const g3 = S(d3.body, U3);
  ok('E12 🔑 «오늘 수업» 원래 날짜 줄에 «취소 수업 복원» 이 실린다(orig_passed · 대상 = 그 행 · 12/09 12:00)',
    !!g3 && g3.moved_away === true && g3.undo && g3.undo.reason === 'orig_passed' && g3.undo.restore_cancelled_available === true
    && String(g3.undo.target_id) === String(U3) && g3.undo.target_date === UN && g3.undo.target_time === '12:00', JSON.stringify(g3 && g3.undo));
  const T3 = g3 && g3.undo ? g3.undo.target_id : 0;   // 화면이 받은 대상 그대로 — «응답 → 실제 복원» 을 잇는다
  const ra3 = await callAdmin('POST', `/api/admin/class-schedules/${T3}`, { cookie: 'tok_agency', body: { action: 'restore' } });
  ok('E13 🔒 지사 세션의 복원은 403 · 그대로 취소', ra3.status === 403 && row(U3).status === 'cancelled', JSON.stringify(ra3));
  const rr3 = await callAdmin('POST', `/api/admin/class-schedules/${T3}`, { cookie: 'tok_admin', body: { action: 'restore', reason: 'harness' } });
  ok('E14 🔑 본사 복원 200 → 같은 행이 12/09 12:00 active', rr3.status === 200 && rr3.body.ok === true && row(U3).status === 'active' && row(U3).scheduled_date === UN && row(U3).start_time === '12:00', JSON.stringify(rr3));
  const d4 = await callAdmin('GET', `/api/admin/classes/today?date=${UD}`, { cookie: 'tok_admin' });
  const g4 = S(d4.body, U3);
  ok('E15 복원 뒤 원래 날짜 줄은 «과거 기록 정정» 으로 바뀐다(복원 표시 사라짐)', !!g4 && g4.undo && g4.undo.restore_cancelled_available === false && g4.undo.historical_available === true, JSON.stringify(g4 && g4.undo));

  /* 🔁 매주 반복 수업을 «그 주 하루만» 12/10(목) 15:00 로 옮기고 그 하루짜리 줄을 취소 — 대상은 하루짜리 줄(반복 행 번호가 아니다).
     (목요일로 둔 이유: 반복 행 자신의 수요일 15:00 회차와 겹치면 복원이 slot_taken 이 된다) */
  for (const [c, t] of [['skip_dates', 'TEXT'], ['notes', 'TEXT']]) if (!sq.prepare('PRAGMA table_info(class_schedules)').all().some(x => x.name === c)) sq.exec(`ALTER TABLE class_schedules ADD COLUMN ${c} ${t}`);
  const WD = '2026-12-10';
  const PID = Number(ins(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, skip_dates, created_at)
     VALUES ('stu_un','학생stu_un','weekly','regular','Wed',NULL,'15:00',20,'1','active','harness',?,?)`, UD, T0).lastInsertRowid);
  const CID = Number(ins(`INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, notes, created_at)
     VALUES ('stu_un','학생stu_un','one_off','regular',NULL,?,'15:00',20,'1','cancelled',?,?,?)`, WD, 'recurring-week:' + PID, UD + ' 회차', T0).lastInsertRowid);
  ins(`INSERT INTO class_audit_log (action, schedule_id, teacher_name, student_name, lesson_date, lesson_time, actor, actor_role, source, reason, detail, created_at)
     VALUES ('postpone', ?, 'ALPHA', '학생stu_un', ?, '15:00', 'HQ', 'admin', 'ui', NULL, '', ?)`, PID, UD, NOW - 3600000);
  const d5 = await callAdmin('GET', `/api/admin/classes/today?date=${UD}`, { cookie: 'tok_admin' });
  const g5 = S(d5.body, PID);
  ok('E16 🔑 🔁 매주 반복: 원래 날짜 줄(반복 행 번호)의 복원 대상은 «하루짜리 줄» 번호 · 12/10 15:00',
    !!g5 && g5.moved_away === true && g5.undo && g5.undo.restore_cancelled_available === true && String(g5.undo.target_id) === String(CID) && String(CID) !== String(PID)
    && g5.undo.target_date === WD && g5.undo.target_time === '15:00', JSON.stringify(g5 && g5.undo));
  const rr5 = await callAdmin('POST', `/api/admin/class-schedules/${g5 && g5.undo ? g5.undo.target_id : 0}`, { cookie: 'tok_admin', body: { action: 'restore', reason: 'harness' } });
  ok('E17 🔁 그 대상으로 보낸 복원 200 → 하루짜리 줄이 12/10 15:00 active · 반복 행은 그대로', rr5.status === 200 && row(CID).status === 'active' && row(CID).scheduled_date === WD && row(PID).status === 'active' && !row(PID).scheduled_date, JSON.stringify(rr5));
  const d6 = await callAdmin('GET', `/api/admin/classes/today?date=${UD}`, { cookie: 'tok_admin' });
  const g6 = S(d6.body, PID);
  ok('E18 짝: 복원 뒤 그 줄의 복원 표시는 사라진다', !!g6 && g6.undo && g6.undo.restore_cancelled_available === false, JSON.stringify(g6 && g6.undo));
  process.stdout.write('\n@@RESULTS@@' + JSON.stringify({ results }) + '\n');
  process.exit(0);
}

/* ═════════════════════════════ 자식: 시나리오 실행 ═════════════════════════════ */
if (process.env.CUM_CHILD === '1') {
  const SRC = process.env.CUM_SRC, PUB = process.env.CUM_PUB;
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
  setNow('2026-11-04', '18:30');   // 스크린샷 그 날 — Maimai 가 18:03 에 20:00 수업을 11/11 로 옮김
  console.warn = () => {};
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this harness'); };

  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  let failOn = null, beforeBatch = null;
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...a) => statement(sql, a.map(norm)),
    async first(col) {
      if (failOn && failOn.test(sql)) throw new Error('injected read failure');
      const r = sq.prepare(sql).get(...args);
      return r ? (col ? r[col] : { ...r }) : null;
    },
    async all() {
      if (failOn && failOn.test(sql)) throw new Error('injected read failure');
      return { success: true, results: sq.prepare(sql).all(...args).map(r => ({ ...r })), meta: {} };
    },
    async run() {
      const r = sq.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] };
    },
  });
  const DB = {
    prepare: s => statement(s),
    async exec(s) { sq.exec(s); return { count: 1 }; },
    async batch(stmts) {
      if (beforeBatch) { const h = beforeBatch; beforeBatch = null; h(); }
      const out = [];
      sq.exec('BEGIN IMMEDIATE');
      try { for (const s of stmts) out.push(await s.run()); sq.exec('COMMIT'); }
      catch (e) { sq.exec('ROLLBACK'); throw e; }
      return out;
    },
  };
  const env = { DB };
  const actor = { ok: true, username: 'admin', name: 'Maimai', isTeacher: false };
  const imp = f => import(pathToFileURL(join(SRC, f)).href);
  const { undoMovedClass } = await imp('class-undo-move.ts');
  const { judgeMovedAwayUndo, judgeMovedAway, loadMovedAwayEvents, movedAwayKey, judgeClassChange, loadClassChangeAudits } = await imp('class-change-state.ts');
  const { moveSchedulesAtomically, scheduleMoveVersion } = await imp('class-schedule-move.ts');
  const { ensureClassAuditTable } = await imp('class-audit.ts');
  const { ensureRoomOverrideTable } = await imp('class-room-override.ts');

  /* 스키마는 정본 소스의 CREATE 문을 읽어서 만든다(하니스에 베끼지 않는다). */
  const adminSrc = readAdminSourceFromFile(join(SRC, 'api-admin.ts'));
  const ddl = (src, table, needs = '') => {
    for (const m of src.matchAll(new RegExp('`(CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\([\\s\\S]*?\\);?)`', 'g'))) if (m[1].includes(needs)) return m[1];
    throw new Error('Production DDL not found: ' + table);
  };
  sq.exec(ddl(adminSrc, 'class_schedules', 'duration_min INTEGER DEFAULT 20'));
  const cols = new Set(sq.prepare('PRAGMA table_info(class_schedules)').all().map(c => c.name));
  for (const [c, t] of [['starts_on', 'TEXT'], ['skip_dates', 'TEXT'], ['notes', 'TEXT'], ['student_name', 'TEXT'], ['schedule_kind', 'TEXT']]) if (!cols.has(c)) sq.exec(`ALTER TABLE class_schedules ADD COLUMN ${c} ${t}`);
  sq.exec(ddl(readFileSync(join(SRC, 'scope.ts'), 'utf8'), 'admin_scope'));
  const ti = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  sq.exec([...adminSrc.slice(ti, adminSrc.indexOf("].join(' ')", ti)).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' '));
  sq.exec(ddl(adminSrc, 'teacher_unavailability'));
  sq.exec(ddl(readFileSync(join(SRC, 'api-lessons.ts'), 'utf8'), 'calendar_events'));
  sq.exec(ddl(adminSrc, 'attendance', 'room_id TEXT NOT NULL'));
  sq.exec(ddl(readFileSync(join(SRC, 'student-schedule-request.ts'), 'utf8'), 'schedule_change_requests'));
  await ensureClassAuditTable(env);
  await ensureRoomOverrideTable(DB);

  const insert = (table, data) => {
    const keys = Object.keys(data);
    return Number(sq.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(data).map(norm)).lastInsertRowid);
  };
  for (const [id, name] of [[1, 'ALPHA'], [2, 'BETA']]) insert('teachers', { id, name, active: 1, created_at: NOW, updated_at: NOW });
  insert('admin_scope', { username: 'admin', scope_type: 'hq', updated_at: NOW });

  const row = id => ({ ...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id) });
  const rowCount = () => Number(sq.prepare('SELECT count(*) AS n FROM class_schedules').get().n);
  const audits = id => sq.prepare('SELECT * FROM class_audit_log WHERE schedule_id=? ORDER BY id').all(id).map(r => ({ ...r }));
  const seed = (o = {}) => insert('class_schedules', {
    user_id: 'stu_a', student_name: 'Jung Seo Yoon', schedule_kind: 'dated', class_type: 'regular', day_of_week: null,
    scheduled_date: '2026-11-11', start_time: '20:00', duration_min: 20, teacher_id: '1', status: 'active', source: 'harness',
    created_at: NOW, updated_at: null, ...o,
  });
  const auditMove = (id, from, fromTime, action = 'postpone', detail = '') => insert('class_audit_log', {
    action, schedule_id: id, teacher_name: 'ALPHA', student_name: 'Jung Seo Yoon', lesson_date: from, lesson_time: fromTime,
    actor: 'Maimai (Head Office Manager)', actor_role: 'admin', source: 'ui', reason: null, detail, created_at: NOW - 1800000,
  });
  /* 스크린샷 그대로 — 11/04 20:00 수업을 11/11 20:00 으로 연기(옮긴 행 = 같은 id, 원래 자리는 이력에만) */
  const moved = (o = {}, from = '2026-11-04', fromTime = '20:00') => { const id = seed(o); auditMove(id, from, fromTime); return id; };
  const reset = () => {
    failOn = beforeBatch = null;
    sq.exec('DELETE FROM class_schedules; DELETE FROM class_audit_log; DELETE FROM schedule_change_requests; DELETE FROM attendance; DELETE FROM calendar_events; DELETE FROM teacher_unavailability; DELETE FROM class_room_override;');
    setNow('2026-11-04', '18:30');
  };
  const evOn = async (id, d) => (await loadMovedAwayEvents(DB, d, d)).byKey.get(movedAwayKey(id, d));
  const unchanged = (id, before) => JSON.stringify(row(id)) === JSON.stringify(before);

  /* ── A. 판정 정본 judgeMovedAwayUndo ── */
  {
    const ch = (o = {}) => ({ kind: 'moved_away', from_date: '2026-11-04', from_time: '20:00', ...o });
    const r0 = { id: 7, scheduled_date: '2026-11-11', start_time: '20:00', status: 'active' };
    const nowMs = RealDate.parse('2026-11-04T18:30:00+09:00');
    let u = judgeMovedAwayUndo(r0, ch(), null, nowMs);
    ok('A1 🔑 원래 시각(11/04 20:00) 전 · 새 자리 active · 시작 전 → 되돌릴 수 있음(대상 = 그 행)',
      u && u.ok === true && u.reason === null && u.target_id === '7' && u.from_date === '2026-11-04' && u.from_time === '20:00', JSON.stringify(u));
    u = judgeMovedAwayUndo(r0, ch(), null, RealDate.parse('2026-11-04T20:00:00+09:00'));
    ok('A2 원래 시각이 «시작된 순간» 부터는 orig_passed(지난 시각에 예정 수업을 만들지 않는다)', u && u.ok === false && u.reason === 'orig_passed', JSON.stringify(u));
    const weeklyHistory = judgeMovedAwayUndo({id:99,status:'active'}, ch(), r0, RealDate.parse('2026-11-04T21:00:00+09:00'));
    ok('A2c historical weekly parent stays blocked until original-room lineage is guarded', weeklyHistory && weeklyHistory.historical_available !== true && !weeklyHistory.ok, weeklyHistory);
    u = judgeMovedAwayUndo(r0, ch(), null, RealDate.parse('2026-11-04T19:59:00+09:00'));
    ok('A2b 짝: 1분 전이면 아직 된다', u && u.ok === true, JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'cancelled' }, ch(), null, nowMs);
    ok('A3 옮긴 뒤 취소된 수업 → target_not_active(새 날짜에서 처리)', u && u.ok === false && u.reason === 'target_not_active', JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'postponed' }, ch(), null, nowMs);
    ok('A3b 옮긴 뒤 다시 «날짜 없이 연기» → target_not_active', u && u.reason === 'target_not_active', JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, scheduled_date: '2026-11-04', start_time: '09:00' }, ch({ from_date: '2026-11-05', from_time: '10:00' }), null, nowMs);
    ok('A4 앞당겨 이미 끝난 수업(11/04 09:00) → target_started(지난 수업을 다시 끌어오지 않는다)', u && u.ok === false && u.reason === 'target_started', JSON.stringify(u));
    const parent = { id: 50, scheduled_date: null, day_of_week: 'Wed', start_time: '20:00', status: 'active', skip_dates: '2026-11-04' };
    u = judgeMovedAwayUndo(parent, ch(), { id: 51, scheduled_date: '2026-11-13', start_time: '20:00', status: 'active' }, nowMs);
    ok('A5 🔁 매주 반복 «그 주 하루만» → 대상은 하루짜리 줄(반복 행이 아니다)', u && u.ok === true && u.target_id === '51', JSON.stringify(u));
    u = judgeMovedAwayUndo(parent, ch(), null, nowMs);
    ok('A6 하루짜리 줄을 못 찾으면 no_target(무엇을 옮길지 모른다 — 지어내지 않는다)', u && u.ok === false && u.reason === 'no_target' && u.target_id === null, JSON.stringify(u));
    u = judgeMovedAwayUndo(r0, ch({ from_time: null }), null, nowMs);
    ok('A7 원래 시각을 모르면 no_time', u && u.ok === false && u.reason === 'no_time', JSON.stringify(u));
    ok('A8 «옮겨 감» 줄이 아니면 판정 없음(null)',
      judgeMovedAwayUndo(r0, null, null, nowMs) === null && judgeMovedAwayUndo(r0, { ...ch(), kind: 'moved' }, null, nowMs) === null, '');
    /* ↩ (2026-11-06 사장님 «원래 시각이 지났어도 되돌리기 옵션» — 화면 «⏸ Postponed → 11/11 20:00 · later cancelled» +
       «Original time has passed — cannot undo»). 새 자리가 그 뒤 취소됐고 아직 시작 전이면 그 줄에서 «취소 수업 복원». */
    const after = RealDate.parse('2026-11-04T21:00:00+09:00');
    u = judgeMovedAwayUndo({ ...r0, status: 'cancelled' }, ch(), null, after);
    ok('A9 🔑 원래 시각 지남 + 새 자리(11/11 20:00) 그 뒤 취소·시작 전 → restore_cancelled_available(대상 = 그 행 · 새 날짜·시각) · 과거 정정은 아님',
      u && u.ok === false && u.reason === 'orig_passed' && u.restore_cancelled_available === true && u.historical_available !== true
      && u.target_id === '7' && u.target_date === '2026-11-11' && u.target_time === '20:00', JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'cancelled' }, ch(), null, RealDate.parse('2026-11-11T20:00:00+09:00'));
    ok('A9b 짝: 새 자리 시각이 «시작된 순간» 부터는 복원 없음(지난 수업을 열지 않는다)', u && u.restore_cancelled_available === false, JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'cancelled' }, ch(), null, RealDate.parse('2026-11-11T19:59:00+09:00'));
    ok('A9c 짝: 1분 전이면 아직 된다', u && u.restore_cancelled_available === true, JSON.stringify(u));
    u = judgeMovedAwayUndo(r0, ch(), null, after);
    ok('A9d 짝: 새 자리가 살아 있으면(active) 복원이 아니라 «과거 기록 정정»', u && u.restore_cancelled_available === false && u.historical_available === true, JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'postponed' }, ch(), null, after);
    ok('A9e 짝: 날짜 없이 다시 연기된 대상은 «취소 수업 복원» 이 아니다', u && u.restore_cancelled_available === false, JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'cancelled' }, ch(), null, nowMs);
    ok('A9f 원래 시각 전이어도 대상이 취소면 target_not_active + 복원 가능', u && u.ok === false && u.reason === 'target_not_active' && u.restore_cancelled_available === true, JSON.stringify(u));
    u = judgeMovedAwayUndo(parent, ch(), { id: 51, scheduled_date: '2026-11-13', start_time: '20:00', status: 'cancelled' }, after);
    ok('A9g 🔁 매주 반복 «그 주 하루만» 줄이 취소 → 대상은 하루짜리 줄(51)', u && u.restore_cancelled_available === true && u.target_id === '51' && u.target_date === '2026-11-13', JSON.stringify(u));
    u = judgeMovedAwayUndo(parent, ch(), null, after);
    ok('A9h 짝: 대상을 못 찾으면(no_target) 복원도 없음', u && u.reason === 'no_target' && u.restore_cancelled_available === false, JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'Cancelled' }, ch(), null, after);
    ok('A9i 상태는 복원 엔진과 같은 정확일치(\'Cancelled\' 는 엔진이 not_cancelled 로 거절 → 버튼도 없음)', u && u.restore_cancelled_available === false, JSON.stringify(u));
    u = judgeMovedAwayUndo({ ...r0, status: 'cancelled' }, ch({ from_time: null }), null, after);
    ok('A9j 원래 시각을 몰라도(no_time) 새 자리 복원은 된다(새 자리에 여는 것이라 원래 시각이 필요 없다)', u && u.reason === 'no_time' && u.restore_cancelled_available === true, JSON.stringify(u));
  }

  /* ── BR. (2026-11-06) «그 뒤 취소» 된 새 자리를 원래 날짜 줄에서 복원 — 실제 판정 + 정본 복원 엔진을 SQLite 로 ── */
  reset();
  {
    const id = moved({ status: 'cancelled' });   // 11/04 20:00 → 11/11 20:00 연기, 그 뒤 취소(스크린샷 그대로)
    setNow('2026-11-05', '10:00');                 // 원래 시각(11/04 20:00)은 지났다
    const judge = async () => { const r = row(id); const c = judgeMovedAway(r, await evOn(id, '2026-11-04'), { showActor: false }, null); return judgeMovedAwayUndo(r, c, null, Date.now()); };
    let u = await judge();
    ok('BR1 🔑 원래 날짜 줄 판정 = orig_passed + restore_cancelled_available(대상 = 같은 행 · 11/11 20:00)',
      u && u.reason === 'orig_passed' && u.restore_cancelled_available === true && u.target_id === String(id) && u.target_date === '2026-11-11' && u.target_time === '20:00', JSON.stringify(u));
    const n0 = rowCount();
    const res = await moveSchedulesAtomically(env, actor, { ids: [String(u.target_id)], patch: {}, reason: 'harness' }, [row(u.target_id)], { restoreCancelled: true });
    ok('BR2 🔑 그 대상에 정본 복원(restoreCancelled) → 같은 행이 11/11 20:00 active · 새 행 없음',
      res.ok === true && row(id).status === 'active' && row(id).scheduled_date === '2026-11-11' && row(id).start_time === '20:00' && rowCount() === n0, JSON.stringify(res));
    u = await judge();
    ok('BR3 복원 뒤 원래 날짜 줄 = «과거 기록 정정» 가능 · 복원 표시는 사라짐', u && u.restore_cancelled_available === false && u.historical_available === true, JSON.stringify(u));
    setNow('2026-11-11', '20:00');
    sq.prepare("UPDATE class_schedules SET status='cancelled' WHERE id=?").run(id);
    u = await judge();
    ok('BR4 짝: 새 자리 시각도 지났으면 복원 표시 없음(사유 글자만)', u && u.restore_cancelled_available === false && u.reason === 'orig_passed', JSON.stringify(u));
  }

  /* ── B. undoMovedClass — 실제로 돌려 본다 ── */
  reset();
  {
    const id = moved();
    const n0 = rowCount(), a0 = audits(id).length;
    ok('B0 전제: 원래 날짜(11/04)에 «⏸ 연기됨 → 11/11 20:00» 줄이 생기는 상태',
      (judgeMovedAway(row(id), await evOn(id, '2026-11-04'), { showActor: true }) || {}).label_en === '⏸ Postponed → 11/11 20:00', JSON.stringify(row(id)));
    const r = await undoMovedClass(env, actor, id, '2026-11-04');
    const after = row(id), log = audits(id);
    ok('B1 🔑 되돌리기 → 같은 행이 11/04 20:00 · active 로 돌아온다', r.ok === true && r.status === 200 && after.scheduled_date === '2026-11-04' && after.start_time === '20:00' && after.status === 'active', JSON.stringify({ r, after }));
    ok('B1b 새 행을 만들지 않는다(PR #1889 — 같은 id 가 옮겨 다닌다)', rowCount() === n0 && r.id === id, String(rowCount()));
    const last = log[log.length - 1] || {};
    ok('B1c 기록은 \'restore\'(undo_move 표시) · 그때 자리(11/11 20:00)를 lesson_date 로',
      log.length === a0 + 1 && last.action === 'restore' && last.lesson_date === '2026-11-11' && /"undo_move":true/.test(String(last.detail)), JSON.stringify(last));
    ok('B1d 🔑 원래 날짜(11/04)의 «옮겨 감» 줄이 사라진다(진짜 수업 한 줄로 돌아옴)', judgeMovedAway(after, await evOn(id, '2026-11-04'), { showActor: true }) === null, '');
    ok('B1e 🔑 짝: 새 날짜(11/11)에 «옮겨 감» 줄이 새로 생기지 않는다', !(await evOn(id, '2026-11-11')), '');
    const au = await loadClassChangeAudits(DB, [id]);
    ok('B1f 원래 날짜 줄에 «📅 … 에서 옮김» 글자도 안 붙는다', judgeClassChange(after, au.bySchedule.get(String(id)), { showActor: true }) === null, '');
    const r2 = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B1g 두 번 눌러도 한 번만 — 두 번째는 not_moved · 기록 안 늘어남', r2.ok === false && r2.status === 409 && r2.error === 'not_moved' && audits(id).length === a0 + 1, JSON.stringify(r2));
  }
  reset();
  {
    const id = seed();
    insert('schedule_change_requests', { schedule_id: id, request_type: 'postpone', status: 'approved', orig_date: '2026-11-04', orig_time: '20:00',
      new_date: '2026-11-11', new_time: '20:00', decided_by: 'Maimai', decided_at: NOW - 3600000, created_at: NOW - 7200000 });
    const r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B2 이력 줄 없이 «승인된 변경 요청» 만 있어도 되돌린다', r.ok === true && row(id).scheduled_date === '2026-11-04' && row(id).start_time === '20:00', JSON.stringify(r));
  }
  reset();
  {
    const id = moved();
    seed({ scheduled_date: '2026-11-04', start_time: '20:00', teacher_id: '2' });   // 같은 학생 · 원래 시각에 다른 수업
    const b = row(id), r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B3 원래 시각에 같은 학생의 다른 수업 → 거절 · 행·기록 그대로', r.ok === false && r.status === 409 && ['conflict', 'slot_taken'].includes(r.error) && unchanged(id, b) && audits(id).length === 1, JSON.stringify(r));
  }
  reset();
  {
    const id = moved();
    const other = seed({ user_id: 'stu_b', student_name: 'Other', scheduled_date: '2026-11-04', start_time: '20:00' });   // 같은 강사 · 같은 자리(그룹 자리)
    const b = row(id), r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B3b 🔑 같은 강사의 «같은 자리» 수업이 있으면 slot_taken — 되돌리기는 그룹에 끼워 넣지 않는다(연기 취소와 같은 선)',
      r.ok === false && r.error === 'slot_taken' && unchanged(id, b), JSON.stringify(r));
    const plain = await moveSchedulesAtomically(env, actor, { ids: [String(id)], expected: { [id]: scheduleMoveVersion(row(id)) }, patch: { destination_date: '2026-11-04', start_time: '20:00' } });
    ok('B3c 짝: 일반 «옮기기» 는 그 자리(그룹)로 갈 수 있다 — 막는 것은 되돌리기만', plain.ok === true && row(id).scheduled_date === '2026-11-04' && row(other).status === 'active', JSON.stringify(plain));
  }
  reset();
  {
    const id = moved();
    insert('calendar_events', { event_type: 'vacation', title: 'Leave', teacher_name: 'ALPHA', date: '2026-11-04', created_at: NOW });
    const b = row(id), r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B4 원래 날짜가 강사 휴가 → teacher_unavailable · 그대로', r.ok === false && r.error === 'teacher_unavailable' && unchanged(id, b), JSON.stringify(r));
  }
  reset();
  {
    const id = moved();
    insert('attendance', { room_id: `class-${id}-20261111`, user_id: 'stu_a', role: 'student', status: 'present', joined_at: NOW });
    const b = row(id), r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B5 새 날짜 방에 출석 기록이 있으면 class_already_attended · 그대로', r.ok === false && r.error === 'class_already_attended' && unchanged(id, b), JSON.stringify(r));
  }
  reset();
  {
    const id = moved({}, '2026-11-04', '10:00');   // 원래 10:00 — 지금(18:30)보다 앞
    const b = row(id), r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B6 원래 시각이 지났으면 orig_passed · 그대로', r.ok === false && r.status === 409 && r.error === 'orig_passed' && unchanged(id, b), JSON.stringify(r));
    const corrected = await undoMovedClass(env, actor, id, '2026-11-04', NOW, true);
    ok('B6 historical: explicit correction keeps same ID postponed, never active', corrected.ok && row(id).status === 'postponed' && row(id).scheduled_date === '2026-11-04' && row(id).start_time === '10:00', JSON.stringify(corrected));
    ok('B6 historical: audit records consequence', /"historical_correction":true/.test(audits(id).at(-1).detail));
    const again = await undoMovedClass(env, actor, id, '2026-11-04', NOW, true);
    ok('B6 historical: repeated correction cannot reactivate', !again.ok && row(id).status === 'postponed', JSON.stringify(again));
    const id2 = moved({ scheduled_date: '2026-11-04', start_time: '09:00' }, '2026-11-05', '10:00');   // 앞당겨 이미 끝남
    const b2 = row(id2), r2 = await undoMovedClass(env, actor, id2, '2026-11-05');
    ok('B6b 앞당겨 이미 끝난 수업은 target_started · 그대로', r2.ok === false && r2.error === 'target_started' && unchanged(id2, b2), JSON.stringify(r2));
    const id3 = moved({ status: 'cancelled' });
    const b3 = row(id3), r3 = await undoMovedClass(env, actor, id3, '2026-11-04');
    ok('B6c 옮긴 뒤 취소됐으면 target_not_active · 그대로', r3.ok === false && r3.error === 'target_not_active' && unchanged(id3, b3), JSON.stringify(r3));
  }
  reset();
  {
    const id = moved({scheduled_date:'2026-11-18'}, '2026-10-28', '10:00');
    auditMove(id,'2026-11-04','10:00','reschedule');
    const result = await undoMovedClass(env, actor, id, '2026-10-28', NOW, true);
    ok('B6 chain A to B to C corrects original A as postponed', result.ok && row(id).scheduled_date === '2026-10-28' && row(id).status === 'postponed' && audits(id).length === 3, result);
  }
  for (const scenario of ['attendance','original_attendance','race','cancelled','started']) {
    reset();
    const id = moved({...(scenario === 'cancelled' ? {status:'cancelled'} : {}), ...(scenario === 'started' ? {scheduled_date:'2026-11-04',start_time:'17:00'} : {})}, '2026-11-04', '10:00');
    if (scenario === 'attendance' || scenario === 'original_attendance') insert('attendance', {room_id:`class-${id}-${scenario === 'attendance' ? '20261111' : '20261104'}`, user_id:'stu_a', role:'student', status:'present', joined_at:NOW});
    if (scenario === 'race') beforeBatch = () => sq.prepare('UPDATE class_schedules SET updated_at=? WHERE id=?').run(NOW+1,id);
    const result = await undoMovedClass(env, actor, id, '2026-11-04', NOW, true);
    ok('B6 historical rejects '+scenario, !result.ok && row(id).scheduled_date !== '2026-11-04' || scenario === 'started' && !result.ok && row(id).start_time === '17:00', result);
  }
  reset();
  {
    const id = seed();
    const r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B7 이동 기록이 없으면 no_move_record(지어내지 않는다)', r.ok === false && r.status === 409 && r.error === 'no_move_record', JSON.stringify(r));
    const r2 = await undoMovedClass(env, actor, id, '11/04');
    const r3 = await undoMovedClass(env, actor, 999999, '2026-11-04');
    ok('B8 날짜 모양이 틀리면 400 · 없는 수업이면 404', r2.status === 400 && r2.error === 'invalid_from_date' && r3.status === 404, JSON.stringify({ r2, r3 }));
  }
  reset();
  {
    const id = moved();
    failOn = /FROM class_audit_log|FROM schedule_change_requests/;
    const b = row(id), r = await undoMovedClass(env, actor, id, '2026-11-04');
    failOn = null;
    ok('B9 🔒 이력 조회가 실패하면 «기록 없음» 이 아니라 lookup_failed(503) · 그대로(모르면 막는다)', r.ok === false && r.status === 503 && r.error === 'lookup_failed' && unchanged(id, b), JSON.stringify(r));
  }
  reset();
  {
    const pid = seed({ user_id: 'stu_r', schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Wed', skip_dates: '2026-11-04' });
    const cid = seed({ user_id: 'stu_r', schedule_kind: 'one_off', scheduled_date: '2026-11-13', start_time: '20:00', source: 'recurring-week:' + pid,
      notes: '반복수업 2026-11-04 회차를 옮김(→ 2026-11-13 20:00)' });
    insert('schedule_change_requests', { schedule_id: pid, request_type: 'postpone', status: 'approved', orig_date: '2026-11-04', orig_time: '20:00',
      new_date: '2026-11-13', new_time: '20:00', decided_by: 'Maimai', decided_at: NOW - 3600000, created_at: NOW - 7200000 });
    const pb = row(pid), r = await undoMovedClass(env, actor, pid, '2026-11-04');
    const c = row(cid);
    ok('B10 🔁 매주 반복 «그 주 하루만» 옮긴 수업 → 하루짜리 줄이 11/04 20:00 으로 · 반복 행은 그대로',
      r.ok === true && r.id === cid && c.scheduled_date === '2026-11-04' && c.start_time === '20:00' && c.status === 'active' && unchanged(pid, pb), JSON.stringify({ r, c }));
    ok('B10b 그 뒤 원래 날짜에 «옮겨 감» 줄이 없다(하루짜리 줄이 그 날 진짜 수업)',
      judgeMovedAway(row(pid), await evOn(pid, '2026-11-04'), { showActor: true }, c) === null, '');
    const pid2 = seed({ user_id: 'stu_q', schedule_kind: 'recurring', scheduled_date: null, day_of_week: 'Wed', start_time: '21:00', skip_dates: '2026-11-04' });
    insert('schedule_change_requests', { schedule_id: pid2, request_type: 'postpone', status: 'approved', orig_date: '2026-11-04', orig_time: '21:00',
      new_date: '2026-11-13', new_time: '21:00', decided_by: 'Maimai', decided_at: NOW - 3600000, created_at: NOW - 7200000 });
    const p2b = row(pid2), r2 = await undoMovedClass(env, actor, pid2, '2026-11-04');
    ok('B11 하루짜리 줄을 못 찾으면 no_target · 반복 행 그대로(반복 행을 날짜로 옮기지 않는다)', r2.ok === false && r2.error === 'no_target' && unchanged(pid2, p2b), JSON.stringify(r2));
  }
  reset();
  {
    const id = moved();
    beforeBatch = () => sq.prepare('UPDATE class_schedules SET start_time = ?, updated_at = ? WHERE id = ?').run('20:30', NOW + 5, id);
    const r = await undoMovedClass(env, actor, id, '2026-11-04');
    ok('B12 확인하는 사이 다른 사람이 그 수업을 바꾸면 schedule_changed · 되돌리지 않는다',
      r.ok === false && r.error === 'schedule_changed' && row(id).scheduled_date === '2026-11-11' && row(id).start_time === '20:30', JSON.stringify(r));
  }

  /* ── C. 두 화면 — 버튼 함수를 오려 내 실제로 돌린다 ── */
  const admJs = readFileSync(join(PUB, 'js/adm-today-classes.js'), 'utf8');
  const mgrHtml = readFileSync(join(PUB, 'manager.html'), 'utf8');
  {
    const code = [cutBlock(admJs, 'var TC_UNDO_WHY = {') + ';', cutBlock(admJs, 'function tcMd('), cutBlock(admJs, 'function tcUndoMoveHtml('), cutBlock(admJs, 'async function tcUndoMove('), cutBlock(admJs, 'function tcMovedRestoreWhy('), cutBlock(admJs, 'async function tcRestorePostponed(')].join('\n');
    ok('C0 전제: admin 화면에서 네 조각을 오려 냈다', code.includes('tcUndoMoveHtml') && code.includes('tcUndoMove(el)') && code.includes('TC_UNDO_WHY'), code.slice(0, 200));
    const mk = (hq, ko = true) => {
      const calls = { fetch: [], alerts: [], confirms: [], reload: 0, confirm: true };
      const win = { tcLoadToday: () => { calls.reload++; } };
      const f = new Function('T', 'esc', 'tcCanMessage', 'confirm', 'alert', 'fetch', 'window', code + '\nreturn { tcUndoMoveHtml, tcUndoMove, tcRestorePostponed };');
      const api = f((k, e) => (ko ? k : e), s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'), () => hq,
        msg => { calls.confirms.push(msg); return calls.confirm; }, m => calls.alerts.push(m),
        async (url, init) => { calls.fetch.push({ url, init }); return calls.respond(url, init); }, win);
      return { api, calls };
    };
    const S = (u, o = {}) => ({ schedule_id: 41, student_name: 'Jung Seo Yoon', moved_away: true, change: { to_date: '2026-11-11', to_time: '20:00' }, undo: u, ...o });
    let { api } = mk(true);
    const h = api.tcUndoMoveHtml(S({ ok: true, reason: null, from_date: '2026-11-04', from_time: '20:00' }));
    ok('C1 🔑 admin: 되돌릴 수 있으면 «↩ 원래대로» 버튼(그 줄 번호·원래 날짜를 싣는다)',
      /class="tc-undo-pin"/.test(h) && /data-sid="41"/.test(h) && /data-from="2026-11-04"/.test(h) && /↩ 원래대로/.test(h), h);
    ok('C1b admin: 못 하면 버튼 대신 사유 글자(누르면 거절되는 버튼을 두지 않는다)',
      (() => { const t = api.tcUndoMoveHtml(S({ ok: false, reason: 'orig_passed', from_date: '2026-11-04', from_time: '10:00' })); return !/tc-undo-pin/.test(t) && /원래 시각이 지나/.test(t); })(), '');
    ok('C1c 🔒 admin: 본사가 아니면(지사·대리점·강사) 아무것도 안 그린다', mk(false).api.tcUndoMoveHtml(S({ ok: true, reason: null, from_date: '2026-11-04', from_time: '20:00' })) === '', '');
    ok('C1d admin: 영어 화면은 «↩ Undo move»', /↩ Undo move/.test(mk(true, false).api.tcUndoMoveHtml(S({ ok: true, reason: null, from_date: '2026-11-04', from_time: '20:00' }))), '');
    // 누르기 — 가짜 요소
    const el = attrs => ({ _busy: false, textContent: '↩ 원래대로', getAttribute: k => attrs[k] ?? null });
    let m = mk(true);
    m.calls.respond = async () => ({ ok: true, json: async () => ({ ok: true, id: 41 }) });
    await m.api.tcUndoMove(el({ 'data-sid': '41', 'data-from': '2026-11-04', 'data-back': '11/04 20:00', 'data-now': '11/11 20:00', 'data-name': 'Jung Seo Yoon' }));
    const sent = m.calls.fetch[0] || {};
    let body = {}; try { body = JSON.parse(sent.init.body); } catch {}
    ok('C2 🔑 admin: 누르면 POST /class-schedules/41 { action:\'undo_move\', from_date:\'2026-11-04\' } · 성공하면 목록을 다시 받는다',
      m.calls.fetch.length === 1 && sent.url === '/api/admin/class-schedules/41' && sent.init.method === 'POST' && body.action === 'undo_move' && body.from_date === '2026-11-04' && m.calls.reload === 1,
      JSON.stringify({ sent, body, reload: m.calls.reload }));
    m = mk(true); m.calls.confirm = false; m.calls.respond = async () => ({ ok: true, json: async () => ({ ok: true }) });
    await m.api.tcUndoMove(el({ 'data-sid': '41', 'data-from': '2026-11-04' }));
    ok('C2b 짝: 확인창에서 취소하면 아무것도 안 보낸다', m.calls.fetch.length === 0, '');
    m = mk(true); m.calls.respond = async () => ({ ok: false, json: async () => ({ ok: false, error: 'slot_taken' }) });
    const e1 = el({ 'data-sid': '41', 'data-from': '2026-11-04' });
    await m.api.tcUndoMove(e1);
    ok('C2c admin: 거절되면 사유를 사람 말로(조용히 실패하지 않음) · 버튼 글자 원래대로', m.calls.alerts.length === 1 && /다른 수업/.test(m.calls.alerts[0]) && e1.textContent === '↩ 원래대로' && m.calls.reload === 0, JSON.stringify(m.calls.alerts));
    // 배선 — 주석을 벗긴 사본에서
    const admS = stripComments(admJs);
    const mvBranch = cutBlock(admS, '} else if (s.moved_away) {'.slice(2));
    ok('C3 admin 배선: «다른 날로 옮김» 갈래가 tcUndoMoveHtml(s) 를 붙이고, .tc-undo-pin 을 tcUndoMove 에 묶는다',
      /tcUndoMoveHtml\(s\)/.test(mvBranch) && /querySelectorAll\('\.tc-undo-pin'\)[\s\S]{0,260}tcUndoMove\(el\)/.test(admS), mvBranch.slice(0, 300));
    ok('C3b admin 배선: .tc-restore-pin(새 «수업 복원» 버튼도 이 클래스) 의 클릭·키보드가 tcRestorePostponed 로 간다',
      /querySelectorAll\('\.tc-restore-pin'\)[\s\S]{0,200}tcRestorePostponed\(el\)/.test(admS), '');
    /* ↩ (2026-11-06) 새 자리가 그 뒤 취소·시작 전 → 이 줄에서 «↩ 수업 복원 · 새 시각» */
    const RC = { ok: false, reason: 'orig_passed', historical_available: false, restore_cancelled_available: true, target_id: '41', target_date: '2026-11-11', target_time: '20:00', from_date: '2026-11-04', from_time: '20:00' };
    const hr = api.tcUndoMoveHtml(S(RC));
    ok('C8 🔑 admin: 새 자리가 그 뒤 취소·시작 전 → «↩ 수업 복원 · 11/11 20:00»(.tc-restore-pin · 대상 행 번호 · 원래 시각 · 지남 표시) — «되돌릴 수 없음» 대신',
      /class="tc-restore-pin"/.test(hr) && /data-sid="41"/.test(hr) && /data-back="2026-11-04 20:00"/.test(hr) && /data-past="1"/.test(hr) && /data-undo="0"/.test(hr)
      && /수업 복원 · 11\/11 20:00/.test(hr) && !/되돌릴 수 없음/.test(hr) && !/tc-undo-pin/.test(hr), hr);
    ok('C8b 🔒 admin: 본사가 아니면 복원 버튼도 안 그린다', mk(false).api.tcUndoMoveHtml(S(RC)) === '', '');
    ok('C8c 짝: 복원 표시가 없으면 예전대로 사유 글자', (() => { const t = api.tcUndoMoveHtml(S({ ...RC, restore_cancelled_available: false })); return /원래 시각이 지나/.test(t) && !/tc-restore-pin/.test(t); })(), '');
    ok('C8d 대상 행 번호가 줄 번호와 다르면(매주 반복 하루짜리 줄) 대상 번호를 싣는다', /data-sid="51"/.test(api.tcUndoMoveHtml(S({ ...RC, target_id: '51' }))), '');
    ok('C8e admin: 영어 화면은 «↩ Restore class · 11/11 20:00»', /↩ Restore class · 11\/11 20:00/.test(mk(true, false).api.tcUndoMoveHtml(S(RC))), '');
    m = mk(true); m.calls.respond = async () => ({ ok: true, json: async () => ({ ok: true, id: 41, status: 'active' }) });
    await m.api.tcRestorePostponed(el({ 'data-sid': '41', 'data-name': 'Jung Seo Yoon', 'data-when': '2026-11-11 20:00 KST', 'data-back': '2026-11-04 20:00', 'data-past': '1' }));
    const rs = m.calls.fetch[0] || {};
    let rb = {}; try { rb = JSON.parse(rs.init.body); } catch {}
    ok('C9 🔑 admin: 누르면 POST /class-schedules/41 { action:\'restore\' } · 확인창이 «연기 → 그 뒤 취소» 와 «원래 시각은 다시 열 수 없음» 을 말한다 · 성공하면 목록 다시',
      rs.url === '/api/admin/class-schedules/41' && rb.action === 'restore' && rb.reason === 'Restore cancelled class (moved-away row)' && m.calls.reload === 1
      && /그 뒤 취소됨/.test(m.calls.confirms[0] || '') && /다시 열 수 없습니다/.test(m.calls.confirms[0] || ''), JSON.stringify({ rs, rb, c: m.calls.confirms }));
    m = mk(true); m.calls.respond = async () => ({ ok: true, json: async () => ({ ok: true }) });
    await m.api.tcRestorePostponed(el({ 'data-sid': '41', 'data-name': 'X', 'data-when': '2026-11-11 20:00 KST' }));
    ok('C9b 짝: 새 날짜 줄의 «취소 수업 복원»(data-back 없음)은 예전 확인창 그대로', /원래 날짜·시각에 활성 수업으로/.test(m.calls.confirms[0] || '') && !/그 뒤 취소됨/.test(m.calls.confirms[0] || ''), JSON.stringify(m.calls.confirms));
    const confirmFor = async (past, undo) => { const mm = mk(true); mm.calls.confirm = false; await mm.api.tcRestorePostponed(el({ 'data-sid': '41', 'data-name': 'X', 'data-when': '2026-11-11 20:00 KST', 'data-back': '2026-11-04 20:00', 'data-past': past, 'data-undo': undo })); return mm.calls.confirms[0] || ''; };
    const cNoTime = await confirmFor('0', '0'), cUndo = await confirmFor('0', '1');
    ok('C9c admin: 원래 시각을 모르면(no_time) 확인창이 «↩ 원래대로» 를 약속하지 않는다 · 짝: 원래 시각이 미래(target_not_active)면 안내한다',
      /그 뒤 취소됨/.test(cNoTime) && !/원래대로/.test(cNoTime) && !/다시 열 수 없습니다/.test(cNoTime) && /원래대로/.test(cUndo), JSON.stringify({ cNoTime, cUndo }));
    ok('C9c2 admin: 원래 시각 미래(target_not_active) → data-undo="1"', /data-undo="1"/.test(api.tcUndoMoveHtml(S({ ...RC, reason: 'target_not_active' }))), '');
    m = mk(true); m.calls.respond = async () => ({ ok: false, json: async () => ({ ok: false, error: 'slot_taken' }) });
    await m.api.tcRestorePostponed(el({ 'data-sid': '41', 'data-name': 'X', 'data-when': '2026-11-11 20:00 KST', 'data-back': '2026-11-04 20:00', 'data-past': '1', 'data-undo': '0' }));
    ok('C9d admin: «다른 날로 옮김» 줄의 복원이 거절되면 그 줄에 맞는 말(새 시각을 짚고, 없는 «📅 새 날짜로» 버튼을 가리키지 않음)',
      m.calls.alerts.length === 1 && /2026-11-11 20:00/.test(m.calls.alerts[0]) && !/새 날짜로」/.test(m.calls.alerts[0]), JSON.stringify(m.calls.alerts));
  }
  {
    const code = [cutBlock(mgrHtml, 'var TA_UNDO_WHY = {') + ';', cutBlock(mgrHtml, 'function taMd('), cutBlock(mgrHtml, 'function taRestoreMovedPill('), cutBlock(mgrHtml, 'async function taRestoreMoved('), cutBlock(mgrHtml, 'function taUndoPill('), cutBlock(mgrHtml, 'function taUndoMove(')].join('\n');
    ok('C4 전제: manager 화면에서 세 조각을 오려 냈다', code.includes('taUndoPill') && code.includes('taUndoMove(el)'), code.slice(0, 200));
    const mk = (hq) => {
      const calls = { fetch: [], alerts: [], reload: 0, stale: 0 };
      const rows = { 41: { schedule_id: 41, student_name: 'Jung Seo Yoon', moved_away: true, change: { to_date: '2026-11-11', to_time: '20:00' }, undo: { ok: true, reason: null, from_date: '2026-11-04', from_time: '20:00' } } };
      const win = { loadTodayAll: () => { calls.reload++; } };
      calls.confirms = [];
      const f = new Function('T', 'esc', 'IS_HQ', 'confirm', 'alert', 'fetch', 'window', 'taRowOf', 'taMarkStale', 'taRestoreCancelled', code + '\nreturn { taUndoPill, taUndoMove };');
      const api = f((en, ko) => ko, s => String(s ?? ''), hq, msg => { calls.confirms.push(msg); return true; }, a => calls.alerts.push(a),
        (url, init) => { calls.fetch.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }); },
        win, sid => rows[sid] || null, () => { calls.stale++; }, () => { calls.restoreCancelled = (calls.restoreCancelled || 0) + 1; });
      return { api, calls, rows };
    };
    const { api, rows } = mk(true);
    const p = api.taUndoPill(rows[41]);
    ok('C5 🔑 manager: 본사면 «↩ 원래대로» 버튼(data-undomv=그 줄 번호)', /data-undomv="41"/.test(p) && /↩ 원래대로/.test(p), p);
    ok('C5b 🔒 manager: 본사가 아니면 아무것도 안 그린다', mk(false).api.taUndoPill(rows[41]) === '', '');
    ok('C5c manager: 못 하면 사유 글자', (() => { const t = api.taUndoPill({ ...rows[41], undo: { ok: false, reason: 'target_started' } }); return !/data-undomv/.test(t) && /이미 시작됨/.test(t); })(), '');
    const m = mk(true);
    m.api.taUndoMove({ _busy: false, textContent: 'x', getAttribute: k => (k === 'data-undomv' ? '41' : null) });
    await new Promise(r => setTimeout(r, 10));
    const sent = m.calls.fetch[0] || {};
    let body = {}; try { body = JSON.parse(sent.init.body); } catch {}
    ok('C6 🔑 manager: 누르면 POST { action:\'undo_move\', from_date } · 성공하면 낡은 목록 표시 + 다시 받기',
      sent.url === '/api/admin/class-schedules/41' && body.action === 'undo_move' && body.from_date === '2026-11-04' && m.calls.reload === 1 && m.calls.stale === 1,
      JSON.stringify({ sent, body, c: m.calls }));
    /* ↩ (2026-11-06) 새 자리가 그 뒤 취소·시작 전 → «↩ 수업 복원 · 11/11 20:00» — 누르면 «대상 행»(target_id)에 restore */
    const RCM = { ok: false, reason: 'orig_passed', historical_available: false, restore_cancelled_available: true, target_id: '77', target_date: '2026-11-11', target_time: '20:00', from_date: '2026-11-04', from_time: '20:00' };
    const pr = api.taUndoPill({ ...rows[41], undo: RCM });
    ok('C10 🔑 manager: «↩ 수업 복원 · 11/11 20:00»(data-restore-moved) — «되돌릴 수 없음» 대신',
      /data-restore-moved="1"/.test(pr) && /data-undomv="41"/.test(pr) && /수업 복원 · 11\/11 20:00/.test(pr) && !/되돌릴 수 없음/.test(pr), pr);
    ok('C10b 🔒 manager: 본사가 아니면 복원 버튼도 안 그린다', mk(false).api.taUndoPill({ ...rows[41], undo: RCM }) === '', '');
    ok('C10c 짝: 복원 표시가 없으면 예전대로 사유 글자', (() => { const t = api.taUndoPill({ ...rows[41], undo: { ...RCM, restore_cancelled_available: false } }); return /원래 시각이 지나/.test(t) && !/data-restore-moved/.test(t); })(), '');
    const m2 = mk(true);
    m2.rows[41].undo = RCM;
    m2.api.taUndoMove({ _busy: false, textContent: 'x', getAttribute: k => (k === 'data-undomv' ? '41' : k === 'data-restore-moved' ? '1' : null) });
    await new Promise(r => setTimeout(r, 10));
    const s2 = m2.calls.fetch[0] || {};
    let b2 = {}; try { b2 = JSON.parse(s2.init.body); } catch {}
    ok('C11 🔑 manager: 누르면 «대상 행»(77) 에 POST { action:\'restore\' } · 확인창이 «그 뒤 취소됨» 을 말한다 · 성공하면 낡은 목록 표시 + 다시 받기',
      s2.url === '/api/admin/class-schedules/77' && b2.action === 'restore' && m2.calls.reload === 1 && m2.calls.stale === 1 && /그 뒤 취소됨/.test(m2.calls.confirms[0] || ''),
      JSON.stringify({ s2, b2, c: m2.calls }));
    const mgrConfirm = async (reason) => { const mm = mk(true); mm.rows[41].undo = { ...RCM, reason }; mm.api.taUndoMove({ _busy: false, textContent: 'x', getAttribute: k => (k === 'data-undomv' ? '41' : k === 'data-restore-moved' ? '1' : null) }); await new Promise(r => setTimeout(r, 10)); return mm.calls.confirms[0] || ''; };
    const mNoTime = await mgrConfirm('no_time'), mUndo = await mgrConfirm('target_not_active');
    ok('C11b manager: 원래 시각을 모르면(no_time) 확인창이 «↩ 원래대로» 를 약속하지 않는다 · 짝: target_not_active 면 안내',
      /그 뒤 취소됨/.test(mNoTime) && !/원래대로/.test(mNoTime) && /원래대로/.test(mUndo), JSON.stringify({ mNoTime, mUndo }));
    const mgrS = stripComments(mgrHtml);
    ok('C7 manager 배선: 간단히·자세히 두 보기 모두 «다른 날로 옮김» 줄에 taUndoPill · 클릭·키보드 위임이 data-undomv 를 받는다',
      /r\.moved_away \? taUndoPill\(r\) : r\.cancelled \? taRestoreCancelledPill\(r\) : taMovePill\(r\)/.test(mgrS) && /resch = r\.moved_away \? taUndoPill\(r\) : taRestoreCancelledPill\(r\)/.test(mgrS)
      && /closest\('\[data-undomv\]'\)[\s\S]{0,80}taUndoMove\(um\)/.test(mgrS) && /closest\('\[data-ta\],\[data-calpin\],\[data-bulk\],\[data-undomv\]'\)/.test(mgrS), '');
  }

  process.stdout.write('\n@@RESULTS@@' + JSON.stringify({ results }) + '\n');
  process.exit(0);
}

/* ═════════════════════════════ 부모: 준비·실행·변이 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'cum-'));
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

function runChild(srcDir, pubDir, mode = 'unit') {
  return new Promise(resolve => {
    const cp = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', pathToFileURL(join(tmp, 'reg.mjs')).href, SELF],
      { env: { ...process.env, CUM_CHILD: '1', CUM_SRC: srcDir, CUM_PUB: pubDir, CUM_MODE: mode } });
    let so = '', se = '';
    cp.stdout.on('data', d => { so += d; });
    cp.stderr.on('data', d => { se += d; });
    const t = setTimeout(() => { try { cp.kill('SIGKILL'); } catch {} }, 120000);
    cp.on('close', () => {
      clearTimeout(t);
      const i = so.lastIndexOf('@@RESULTS@@');
      if (i < 0) return resolve({ crashed: true, err: (se + so).split('\n').filter(Boolean).slice(-20).join('\n') });
      try { resolve(JSON.parse(so.slice(i + '@@RESULTS@@'.length).trim().split('\n')[0])); } catch (e) { resolve({ crashed: true, err: String(e) }); }
    });
  });
}

let pass = 0, fail = 0;
try {
  console.log('\n═ ↩ 옮긴 수업 되돌리기 (실제 모듈 · SQLite · 두 화면 함수 실행) ═');
  for (const base of await Promise.all([runChild(REAL_SRC, REAL_PUB, 'unit'), runChild(REAL_SRC, REAL_PUB, 'e2e')])) {
    if (base.crashed) { fail++; console.log('  FAIL 자식 실행이 죽었다:\n' + base.err); continue; }
    for (const t of base.results) {
      if (t.pass) { pass++; console.log('  PASS ' + t.name); } else { fail++; console.log('  FAIL ' + t.name + (t.why ? ' — ' + t.why : '')); }
    }
  }

  /* ── 변이시험: 고친 자리를 되돌린 사본에서 정말 빨간불이 되는가(«조건 뒤집기» 포함) ── */
  console.log('\n─ 변이시험 (복사본만 바꾼다) ─');
  const MUTANTS = [
    { name: '판정: 원래 시각 지남 검사를 뺌', expect: /^A2 |^B6 /,
      edits: [['src', 'class-change-state.ts', "if (!Number.isFinite(origStart) || origStart <= nowMs) {", "if (false) {"]] },
    { name: '판정: 원래 시각 조건 뒤집기(<= → >)', expect: /^A1 |^B1 /,
      edits: [['src', 'class-change-state.ts', 'origStart <= nowMs) {', 'origStart > nowMs) {']] },
    { name: '판정: 새 자리 시작 검사를 뺌', expect: /^A4 |^B6b /,
      edits: [['src', 'class-change-state.ts', "if (!Number.isFinite(tStart) || tStart <= nowMs) return out('target_started');", '']] },
    { name: '판정: 취소·재연기 대상 검사를 뺌', expect: /^A3 |^B6c /,
      edits: [['src', 'class-change-state.ts', "if (tSt && tSt !== 'active') return out('target_not_active');", '']] },
    { name: '이동: 되돌리기의 «그룹 자리 끼워 넣기 금지» 를 뺌', expect: /^B3b /,
      edits: [['src', 'class-schedule-move.ts', "if (undo && !historical && slotTaken(dest)) return fail(409, 'slot_taken', 'Another class already uses the original time. Rebook to a different date or time.');", '']] },
    { name: '이동: 기록을 옛 \'reschedule\' 로(되돌리기를 restore 로 안 적음)', expect: /^B1c |^B1e /,
      edits: [['src', 'class-schedule-move.ts', "VALUES ('${guarded ? 'restore' : 'reschedule'}'", "VALUES ('${restore ? 'restore' : 'reschedule'}'"]] },
    { name: '이동: 출석 기록 검사를 연기 취소에만', expect: /^B5 /,
      edits: [['src', 'class-schedule-move.ts', '      if (guarded) {\n        const attendanceTable', '      if (restore) {\n        const attendanceTable']] },
    { name: '경로: 매주 반복도 반복 행 자체를 옮김(하루짜리 줄 무시)', expect: /^B10 /,
      edits: [['src', 'class-undo-move.ts', 'const target = child || row;', 'const target = row;']] },
    { name: '경로: 이력 조회 실패를 «기록 없음» 으로(모르면 막기 → 그냥 409)', expect: /^B9 /,
      edits: [['src', 'class-undo-move.ts', ": fail(503, 'lookup_failed', 'Could not check the change history right now. Please try again shortly.');", ": fail(409, 'no_move_record', 'x');"]] },
    { name: 'admin 화면: 본사 확인을 뺌', expect: /^C1c /,
      edits: [['pub', 'js/adm-today-classes.js', "if (!u || !s.schedule_id || !tcCanMessage()) return '';", "if (!u || !s.schedule_id) return '';"]] },
    { name: 'admin 화면: 엉뚱한 동작(restore)을 보냄', expect: /^C2 /,
      edits: [['pub', 'js/adm-today-classes.js', "body: JSON.stringify({ action: 'undo_move', from_date: from, historical_correction: historical })", "body: JSON.stringify({ action: 'restore' })"]] },
    { name: 'admin 화면: «다른 날로 옮김» 갈래에 버튼을 안 붙임', expect: /^C3 /,
      edits: [['pub', 'js/adm-today-classes.js', "+ T(' — 이 날은 수업 없음', ' — no class this day') + '</span>'\n              + tcUndoMoveHtml(s);", "+ T(' — 이 날은 수업 없음', ' — no class this day') + '</span>';"]] },
    { name: 'manager 화면: 본사 확인을 뺌', expect: /^C5b /,
      edits: [['pub', 'manager.html', "if (!u || !r.schedule_id || !IS_HQ) return '';", "if (!u || !r.schedule_id) return '';"]] },
    { name: 'manager 화면: 간단히 보기에 버튼을 안 붙임', expect: /^C7 /,
      edits: [['pub', 'manager.html', "(r.moved_away ? taUndoPill(r) : r.cancelled ? taRestoreCancelledPill(r) : taMovePill(r))", "taMovePill(r)"]] },
    { name: '오늘 수업: 원래 날짜 줄에 되돌리기 판정(undo)을 안 실음', expect: /^E1 /, mode: 'e2e',
      edits: [['src', 'api-admin.ts', 'undo: _undo ? { ok: _undo.ok, reason: _undo.reason,', 'undo: false ? { ok: _undo.ok, reason: _undo.reason,']] },
    { name: '판정: «취소 수업 복원» 표시를 안 실음', expect: /^A9 |^BR1 /,
      edits: [['src', 'class-change-state.ts', 'restore_cancelled_available: restoreCancelled,', 'restore_cancelled_available: false,']] },
    { name: '판정: 복원 시각 조건 뒤집기(> → <=)', expect: /^A9 |^A9b |^BR1 /,
      edits: [['src', 'class-change-state.ts', "target.status === 'cancelled' && Number.isFinite(tStart) && tStart > nowMs;", "target.status === 'cancelled' && Number.isFinite(tStart) && tStart <= nowMs;"]] },
    { name: '판정: «취소» 대신 «active 아니면 전부»(날짜 없는 재연기까지)', expect: /^A9e /,
      edits: [['src', 'class-change-state.ts', "target.status === 'cancelled' && Number.isFinite(tStart)", "tSt !== 'active' && Number.isFinite(tStart)"]] },
    { name: 'admin 화면: 복원 버튼 갈래를 뺌', expect: /^C8 /,
      edits: [['pub', 'js/adm-today-classes.js', 'if (u.restore_cancelled_available === true && u.target_id) {', 'if (false) {']] },
    { name: 'admin 화면: 복원 버튼이 대상 대신 줄 번호를 실음', expect: /^C8d /,
      edits: [['pub', 'js/adm-today-classes.js', `data-sid="' + esc(u.target_id) + '" '`, `data-sid="' + esc(s.schedule_id) + '" '`]] },
    { name: 'admin 화면: 복원 확인창이 옛 문구(원래 날짜에 복원)', expect: /^C9 /,
      edits: [['pub', 'js/adm-today-classes.js', "var back = el.getAttribute('data-back') || '', past", "var back = '', past"]] },
    { name: 'manager 화면: 복원 버튼 갈래를 뺌', expect: /^C10 /,
      edits: [['pub', 'manager.html', 'if (u.restore_cancelled_available === true && u.target_id) return taRestoreMovedPill(r);', '']] },
    { name: 'manager 화면: 대상 대신 줄 번호로 보냄', expect: /^C11 /,
      edits: [['pub', 'manager.html', 'encodeURIComponent(u.target_id), {', 'encodeURIComponent(r.schedule_id), {']] },
    { name: 'manager 화면: 복원 클릭을 «원래대로» 로 흘림', expect: /^C11 /,
      edits: [['pub', 'manager.html', "if (el.getAttribute('data-restore-moved') === '1') { taRestoreMoved(el, r); return; }", '']] },
    { name: '오늘 수업: 원래 날짜 줄에 복원 표시를 안 실음', expect: /^E12 /, mode: 'e2e',
      edits: [['src', 'api-admin.ts', 'restore_cancelled_available: _undo.restore_cancelled_available === true,', 'restore_cancelled_available: false,']] },
    { name: 'admin 배선: .tc-restore-pin 클릭을 tcRestorePostponed 에 안 묶음', expect: /^C3b /,
      edits: [['pub', 'js/adm-today-classes.js', 'var go = function (ev) { if (ev) ev.preventDefault(); tcRestorePostponed(el); };', 'var go = function (ev) { if (ev) ev.preventDefault(); };']] },
    { name: 'admin 확인창: 원래 시각을 몰라도 «원래대로» 를 약속', expect: /^C9c /,
      edits: [['pub', 'js/adm-today-classes.js', "canUndo = el.getAttribute('data-undo') === '1';", 'canUndo = true;']] },
    { name: 'admin 오류 문구: 옮긴 줄 복원 거절을 새 날짜 줄 문구로', expect: /^C9d /,
      edits: [['pub', 'js/adm-today-classes.js', 'if (back) {   // «다른 날로 옮김» 줄에서 누른 복원', 'if (false) {   // «다른 날로 옮김» 줄에서 누른 복원']] },
    { name: 'manager 확인창: 원래 시각을 몰라도 «원래대로» 를 약속', expect: /^C11b /,
      edits: [['pub', 'manager.html', "canUndo = u.reason === 'target_not_active';", 'canUndo = true;']] },
    { name: '판정: 상태를 다듬어 비교(엔진과 다른 판정)', expect: /^A9i /,
      edits: [['src', 'class-change-state.ts', "target.status === 'cancelled' && Number.isFinite(tStart)", "tSt === 'cancelled' && Number.isFinite(tStart)"]] },
    { name: '오늘 수업: 복원 대상으로 하루짜리 줄 대신 반복 행 번호를 실음', expect: /^E16 /, mode: 'e2e',
      edits: [['src', 'api-admin.ts', 'target_id: _undo.target_id,', 'target_id: String(s.id),']] },
    { name: '되돌리기 경로: 본사 게이트 없이 받음', expect: /^E2 /, mode: 'e2e',
      edits: [['src', 'api-admin.ts', "      const deny = await enrollAdminHqOnly(request, env);\n      if (deny) return deny;\n      const body: any = await request.json().catch(() => ({}));\n      /* ↩ (2026-11-04",
               "      const body: any = await request.json().catch(() => ({}));\n      /* ↩ (2026-11-04"]] },
  ];
  /* ⏱ 변이는 4개씩만 동시에 — 무거운 e2e 자식(api-admin.ts)이 한꺼번에 뜨면 CI 러너에서 90초 상한(run.mjs)에 가까워진다. */
  const LIMIT = Math.max(1, Number(process.env.CUM_JOBS) || 4);
  let active = 0; const waiters = [];
  const slot = async (fn) => { while (active >= LIMIT) await new Promise(r => waiters.push(r)); active++; try { return await fn(); } finally { active--; const w = waiters.shift(); if (w) w(); } };
  const runs = MUTANTS.map((m, k) => slot(async () => {
    const dir = join(tmp, 'm' + k), src = join(dir, 'src'), pub = join(dir, 'pub');
    mkdirSync(dir, { recursive: true });
    cpSync(REAL_SRC, src, { recursive: true });
    mkdirSync(join(pub, 'js'), { recursive: true });
    cpSync(join(REAL_PUB, 'js/adm-today-classes.js'), join(pub, 'js/adm-today-classes.js'));
    cpSync(join(REAL_PUB, 'manager.html'), join(pub, 'manager.html'));
    for (const [where, file, from, to] of m.edits) {
      const p = join(where === 'src' ? src : pub, file);
      const t = readFileSync(p, 'utf8');
      if (!t.includes(from)) return { m, applied: false };
      writeFileSync(p, t.replace(from, to));
    }
    return { m, applied: true, r: await runChild(src, pub, m.mode || 'unit') };
  }));
  for (const { m, applied, r } of await Promise.all(runs)) {
    if (!applied) { fail++; console.log('  FAIL 변이를 못 넣음(소스가 바뀜 — 하니스를 고칠 것) «' + m.name + '»'); continue; }
    if (r.crashed) { fail++; console.log('  FAIL 변이 실행이 죽음 «' + m.name + '» — ' + r.err.split('\n').slice(-3).join(' | ')); continue; }
    const caught = r.results.filter(t => !t.pass && m.expect.test(t.name));
    if (caught.length) { pass++; console.log('  PASS 변이 잡힘 «' + m.name + '» → ' + caught[0].name); }
    else { fail++; console.log('  FAIL 변이를 못 잡음 «' + m.name + '» (실패한 검사: ' + (r.results.filter(t => !t.pass).map(t => t.name.split(' ')[0]).join(',') || '없음') + ')'); }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
