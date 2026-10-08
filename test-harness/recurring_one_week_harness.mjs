/**
 * 🔁 반복 수업 «그 주 하루만» 연기·변경 — 샌드박스 끝-끝 검사 (2026-10-09 사장님 「반복 수업 그 주 하루만 연기 기능 만들어줘」)
 * ─────────────────────────────────────────────────────────────────────────────
 * 정본: cloudflare-deploy/src/recurring-one-week.ts · 읽는 쪽: class-start-date.ts(recurStartedOn·recurSkippedOn)
 * ✅ 진짜: handleMangoApi · handleAdminApi · handleTeacherApi 를 소스 그대로 import 해 돌린다(SQLite).
 * 🟡 모형: src/index.ts 라우팅·인증 게이트는 거치지 않는다. 시계는 고정값.
 * 묻는 것(짝으로):
 *   · 승인하면 그 날짜만 빠지고(skip_dates) 새 일시에 하루짜리 줄 — 다른 주는 그대로 열린다
 *   · 학생·강사·관리자 화면이 빠진 날을 안 열고, 옮긴 줄은 같은 방으로 연다
 *   · 날짜 없이 연기 → 연기 기록 줄 · 급여가 날짜마다 한 번만 센다(빠진 날 두 번 안 셈)
 *   · 겹침·수업 요일 아님·지난 회차 → 409, 아무것도 안 바뀜 · 옛 요청(회차 없음)은 예전처럼 기록만
 * 변이시험: src 복사본만 고친다(저장소 파일은 그대로).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

/* ═════════════════════════════ 자식: 시나리오 실행 ═════════════════════════════ */
if (process.env.SMRS_CHILD === '1') {
  const SRC = process.env.SMRS_SRC;
  const results = [];
  const ok = (name, cond, why) => results.push({ name, pass: !!cond, why: cond ? '' : (why || '') });

  // ── 시계 고정 ──
  let NOW = 0;
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  globalThis.Date = FakeDate;
  const kstMs = (ymd, hm) => RealDate.parse(`${ymd}T${hm}:00+09:00`);
  const setNow = (ymd, hm) => { NOW = kstMs(ymd, hm); };

  // ── console 소음 줄이기(경고는 모아 둔다) ──
  const warns = [];
  console.warn = (...a) => warns.push(a.map(String).join(' ').slice(0, 200));

  // ── D1 모양 SQLite ──
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  const norm = (v) => (v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v));
  const mkStmt = (sql, args) => ({
    bind: (...b) => mkStmt(sql, b.map(norm)),
    async first(col) {
      const st = sq.prepare(sql);
      const r = st.get(...args);
      if (!r) return null;
      const o = { ...r };
      return col ? o[col] : o;
    },
    async all() {
      const st = sq.prepare(sql);
      return { results: st.all(...args).map((r) => ({ ...r })), success: true, meta: {} };
    },
    async run() {
      const st = sq.prepare(sql);
      const r = st.run(...args);
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
    async raw() {
      const st = sq.prepare(sql);
      return st.all(...args).map((r) => Object.values(r));
    },
  });
  const DB = {
    prepare: (sql) => mkStmt(sql, []),
    async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(stmts) { sq.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts)out.push(await s.run());sq.exec('COMMIT');return out;}catch(e){sq.exec('ROLLBACK');throw e;} },
    dump: async () => new ArrayBuffer(0),
  };
  const kvMap = new Map();
  const KV = {
    async get(k, t) { const v = kvMap.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { kvMap.set(k, String(v)); },
    async delete(k) { kvMap.delete(k); },
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

  const readSrc = (f) => readFileSync(join(SRC, f), 'utf8');
  const adminSrc = readSrc('api-admin.ts');

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

  // ── 스키마 준비: 핸들러가 스스로 만드는 것은 핸들러에게, 나머지는 소스의 CREATE 문을 읽어서 ──
  const errStage = [];
  try {
    await checkAdminSession(req('GET', '/x', { cookie: 'prime' }), env);            // auth 표 + admin 부트스트랩
    await getScope(env, req('GET', '/x'));                                           // admin_scope
    await handleMangoApi(req('GET', '/api/class/sessions/today?user_id=prime'), new URL(BASE + '/api/class/sessions/today?user_id=prime'), env, {});
  } catch (e) { errStage.push('prime: ' + e.message); }

  const cutCreate = (src, name, mustContain) => {
    const re = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + name + '\\s*\\([\\s\\S]*?\\);?)`', 'g');
    let m; while ((m = re.exec(src))) { if (!mustContain || m[1].includes(mustContain)) return m[1]; }
    return null;
  };
  // teachers — 배열 join 모양
  const tIdx = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const tEnd = adminSrc.indexOf("].join(' ')", tIdx);
  const teachersDDL = tIdx > 0 && tEnd > tIdx
    ? [...adminSrc.slice(tIdx, tEnd).matchAll(/`([^`]*)`/g)].map((m) => m[1]).join(' ') : null;
  const erpDDL = cutCreate(adminSrc, 'students_erp', 'user_id TEXT PRIMARY KEY, korean_name');
  const tlDDL = cutCreate(adminSrc, 'teacher_account_links');
  ok('전제: 소스에서 teachers CREATE 를 읽었다', !!teachersDDL);
  ok('전제: 소스에서 students_erp CREATE 를 읽었다', !!erpDDL);
  ok('전제: 소스에서 teacher_account_links CREATE 를 읽었다', !!tlDDL);
  for (const d of [teachersDDL, erpDDL, tlDDL]) if (d) sq.exec(d);
  const hasCs = sq.prepare(`SELECT name FROM sqlite_master WHERE name='class_schedules'`).get();
  ok('전제: sessions/today 핸들러가 class_schedules 를 스스로 만들었다', !!hasCs, errStage.join('|'));

  // ── 씨앗 ──
  const T0 = RealDate.parse('2026-09-01T00:00:00Z');
  const ins = (sql, ...a) => sq.prepare(sql).run(...a);
  ins(`INSERT INTO teachers (id, name, active, created_at, updated_at) VALUES (1,'ALPHA',1,?,?)`, T0, T0);
  ins(`INSERT INTO teachers (id, name, active, created_at, updated_at) VALUES (2,'BETA',1,?,?)`, T0, T0);
  for (const [u, n] of [['t_alpha', 'ALPHA'], ['t_beta', 'BETA']]) {
    ins(`INSERT INTO admin_account (username, password_hash, name, created_at, updated_at) VALUES (?, 'x', ?, ?, ?)`, u, n, T0, T0);
    ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES (?, 'teacher', NULL, ?)`, u, T0);
  }
  ins(`INSERT OR REPLACE INTO admin_scope (username, scope_type, scope_value, updated_at) VALUES ('admin','hq',NULL,?)`, T0);
  ins(`INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at) VALUES ('t_alpha','1','ALPHA','h',?)`, T0);
  ins(`INSERT INTO teacher_account_links (username, teacher_id, teacher_name, linked_by, linked_at) VALUES ('t_beta','2','BETA','h',?)`, T0);
  const FAR = RealDate.parse('2030-01-01T00:00:00Z');
  for (const [tok, u] of [['tok_admin', 'admin'], ['tok_alpha', 't_alpha'], ['tok_beta', 't_beta']]) {
    ins(`INSERT INTO admin_sessions (token, username, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)`, tok, u, T0, FAR, T0);
  }
  for (const s of ['stu_a', 'stu_b', 'stu_c', 'stu_d']) ins(`INSERT INTO students_erp (user_id, korean_name, created_at) VALUES (?,?,?)`, s, '학생' + s, T0);
  const mkClass = (user, kind, dow, date, time, tid) => Number(ins(
    `INSERT INTO class_schedules (user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status, source, created_at)
     VALUES (?,?,?, 'regular', ?, ?, ?, 20, ?, 'active', 'harness', ?)`,
    user, '학생' + user, kind, dow, date, time, tid, T0).lastInsertRowid);

  const TODAY = '2026-09-29';   // 화요일 (KST)
  const YMD = '20260929';
  setNow(TODAY, '10:00');
  const A = mkClass('stu_a', 'one_off', null, TODAY, '14:00', '1');
  const B = mkClass('stu_b', 'recurring', 'Mon', null, '15:00', '1');
  const C = mkClass('stu_c', 'one_off', null, '2026-09-30', '11:00', '1');
  const D = mkClass('stu_d', 'one_off', null, '2026-09-30', '00:30', '1');   // 자정 넘김용

  // ── 두 쪽 보기 ──
  const portal = async (tok) => {
    const r = req('GET', '/api/teacher/portal', { cookie: tok });
    const res = await handleTeacherApi(r, new URL(r.url), env);
    const b = await res.json();
    return b;
  };
  const studentToday = async (uid) => {
    const u = new URL(BASE + '/api/class/sessions/today?user_id=' + encodeURIComponent(uid));
    const res = await handleMangoApi(new Request(u.href), u, env, {});
    return res ? await res.json() : { ok: false };
  };
  const hm = (ts) => { const d = new RealDate(ts + 9 * 3600e3); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

  /** 양쪽을 보고 같은 방·같은 시각인지 확인. expect: {present:boolean, time?, room?, ymd} */
  const both = async (label, sid, uid, tok, otherTok, expect) => {
    const p = await portal(tok);
    const s = await studentToday(uid);
    const tc = (p.classes || []).find((c) => Number(c.schedule_id) === sid);
    const sc = (s.sessions || []).find((c) => Number(c.schedule_id) === sid);
    const ymd = expect.ymd || YMD;
    if (!p.ok) { ok(label + ' · 강사 포털 응답', false, JSON.stringify(p).slice(0, 200)); return; }
    if (expect.present) {
      ok(label + ' · 강사 포털에 뜬다', !!tc, 'classes=' + JSON.stringify((p.classes || []).map((c) => c.schedule_id)));
      ok(label + ' · 학생 sessions/today 에 뜬다', !!sc, 'sessions=' + JSON.stringify((s.sessions || []).map((c) => c.schedule_id)));
      if (tc && sc) {
        const room = expect.room || `class-${sid}-${ymd}`;
        ok(label + ' · 강사 방 == 학생 방 (' + tc.room_id + ')', tc.room_id === sc.room_id, `teacher=${tc.room_id} student=${sc.room_id}`);
        ok(label + ' · 방 == ' + room, sc.room_id === room && tc.room_id === room, `teacher=${tc.room_id} student=${sc.room_id}`);
        if (expect.time) {
          ok(label + ' · 강사 시각 ' + expect.time, tc.start_time === expect.time, 'teacher=' + tc.start_time);
          ok(label + ' · 학생 시각 ' + expect.time, hm(sc.start_ts) === expect.time, 'student=' + hm(sc.start_ts));
          ok(label + ' · 두 쪽 start_ts 동일', tc.start_ts === sc.start_ts, `${tc.start_ts} vs ${sc.start_ts}`);
        }
      }
      if (otherTok) {
        const o = await portal(otherTok);
        ok(label + ' · 다른 강사 포털에는 안 뜬다', !(o.classes || []).some((c) => Number(c.schedule_id) === sid));
      }
    } else {
      ok(label + ' · 강사 포털에 안 뜬다(오늘)', !tc);
      ok(label + ' · 학생 sessions/today 에 안 뜬다', !sc);
    }
    return { tc, sc, p, s };
  };


  sq.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_sched_teacher_slot ON class_schedules(teacher_id,scheduled_date,start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL");
  env.ROOM_JWT_SECRET = 'sandbox-only-secret-at-least-thirty-two-characters';
  const {signUidToken} = await imp('auth-token.ts');
  const {addDays} = await imp('class-series-move.ts');
  const { autoPostponeEligible, autoApproveStudentPostpone, autoApplyMode } = await imp('student-auto-postpone.ts');
  const studentCall = async(uid,method,path,body) => {
    const token=await signUidToken(uid,env);
    const request=new Request(BASE+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const response=await handleMangoApi(request,new URL(request.url),env,{});
    return {status:response.status,body:await response.json()};
  };

  /* ═════ 🔁 반복 수업 «그 주 하루만» 연기·변경 ═════ */
  env.STUDENT_AUTO_APPLY = 'off';   // 관리자 승인 경로를 검사(학생 자동 경로는 student_auto_postpone 하니스)
  const { normSkipDates } = await imp('class-start-date.ts');
  const reqRow = (id) => sq.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(id);
  const row = (id) => sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id);
  const reset = () => { sq.exec('DELETE FROM class_schedules'); try { sq.exec('DELETE FROM schedule_change_requests'); } catch {} };
  const decide = (id, action = 'approve') => callAdmin('POST', '/api/admin/schedule-requests/decide', { cookie: 'tok_admin', body: { id, action } });
  const sessionsOn = async (uid, ymd, hm = '08:00') => { setNow(ymd, hm); return (await studentToday(uid)).sessions || []; };
  const mineOn = async (uid, ymd) => { setNow(ymd, '08:00'); const r = await studentCall(uid, 'GET', '/api/class/schedule/mine?user_id=' + uid); return (r.body && r.body.schedules) || []; };
  const adminToday = async (ymd) => { setNow(ymd, '08:00'); const r = await callAdmin('GET', '/api/admin/classes/today', { cookie: 'tok_admin' }); const b = r.body; return Array.isArray(b) ? b : (b.sessions || b.items || []); };
  const lessonsOf = async (sid, ymPrefix) => {
    setNow('2026-11-02', '08:00');
    const r = await callAdmin('GET', '/api/admin/payroll/lessons?year=2026&month=10&all=1', { cookie: 'tok_admin' });
    return { ok: r.status === 200, list: ((r.body && r.body.lessons) || []) };
  };

  for (let trial = 0; trial < 5; trial++) {
    const uid = 'rw_' + trial;
    const hour = String(10 + trial).padStart(2, '0') + ':00';
    reset(); setNow(TODAY, '08:00');
    sq.prepare(`INSERT OR IGNORE INTO students_erp (user_id, korean_name, created_at) VALUES (?,?,?)`).run(uid, '학생' + uid, T0);
    const R = mkClass(uid, 'recurring', 'Thu', null, hour, '1');      // 매주 목요일
    const before = row(R);

    // ① 10/8 회차를 10/9 로 — 관리자 승인 → 그 주만
    let r = await studentCall(uid, 'POST', '/api/class/schedule/request', { request_type: 'postpone', schedule_id: R, orig_date: '2026-10-08', new_date: '2026-10-09', new_time: hour });
    ok(trial + ' ① 접수(자동 꺼짐 → 대기)', r.status === 200 && r.body.status === 'pending', JSON.stringify(r.body));
    const q1 = r.body.id;
    let d = await decide(q1);
    ok(trial + ' ① 승인 → moved', d.status === 200 && d.body.applied === 'moved', JSON.stringify(d.body));
    ok(trial + ' ① 반복 줄은 그 주(10/8)만 빠지고 나머지 칸 그대로', row(R).skip_dates === '2026-10-08' && row(R).day_of_week === 'Thu' && !row(R).scheduled_date
      && row(R).updated_at === before.updated_at && row(R).start_time === hour && row(R).teacher_id === '1', JSON.stringify(row(R)));
    const mv = sq.prepare('SELECT * FROM class_schedules WHERE source=?').all('recurring-week:' + R);
    ok(trial + ' ① 10/9 하루짜리 보강 줄', mv.length === 1 && mv[0].scheduled_date === '2026-10-09' && mv[0].start_time === hour && mv[0].status === 'active' && mv[0].class_type === 'makeup' && mv[0].teacher_id === '1', JSON.stringify(mv));
    const M = mv[0] ? Number(mv[0].id) : -1;
    ok(trial + ' ① 요청 approved', reqRow(q1).status === 'approved');

    // 읽는 쪽 — 10/8 에는 안 열린다(학생·강사·관리자), 10/9 에는 새 줄이 같은 방으로, 10/15 는 그대로(짝)
    let ss = await sessionsOn(uid, '2026-10-08');
    ok(trial + ' ② 10/8 학생 화면에 반복 수업 없음', !ss.some((c) => Number(c.schedule_id) === R), JSON.stringify(ss));
    let p = await portal('tok_alpha');
    ok(trial + ' ② 10/8 강사 포털에 없음', !(p.classes || []).some((c) => Number(c.schedule_id) === R));
    let at = await adminToday('2026-10-08');
    ok(trial + ' ② 10/8 관리자 오늘 수업에 없음', !at.some((c) => Number(c.schedule_id) === R), JSON.stringify(at.map((c) => c.schedule_id)));
    setNow('2026-10-09', '08:00');
    await both(trial + ' ② 10/9 보강', M, uid, 'tok_alpha', 'tok_beta', { present: true, time: hour, ymd: '20261009' });
    ss = await sessionsOn(uid, '2026-10-15');
    ok(trial + ' ② (짝) 10/15 는 반복 수업이 그대로 열린다', ss.some((c) => Number(c.schedule_id) === R && c.room_id === `class-${R}-20261015`), JSON.stringify(ss));
    at = await adminToday('2026-10-15');
    ok(trial + ' ② (짝) 10/15 관리자 오늘 수업에 있음', at.some((c) => Number(c.schedule_id) === R), JSON.stringify(at.map((c) => c.schedule_id)));
    const mine = await mineOn(uid, '2026-10-02');
    const mR = mine.find((s) => Number(s.schedule_id) === R);
    ok(trial + ' ② «내 수업» 다음 회차가 빠진 날(10/8)을 건너뛴다', mR && mR.next_date === '2026-10-15', JSON.stringify(mR));
    ok(trial + ' ② «내 수업» 이 빠진 날 목록을 싣는다', mR && JSON.stringify(mR.skip_dates) === '["2026-10-08"]', JSON.stringify(mR));

    // ③ 10/15 날짜 없이 연기 → 연기 기록 줄 · 다른 주 대기 요청이 막히지 않는다(updated_at 안 올림)
    setNow(TODAY, '08:00');
    r = await studentCall(uid, 'POST', '/api/class/schedule/request', { request_type: 'postpone', schedule_id: R, orig_date: '2026-10-15' });
    const q2 = r.body.id;
    r = await studentCall(uid, 'POST', '/api/class/schedule/request', { request_type: 'postpone', schedule_id: R, orig_date: '2026-10-22', new_date: '2026-10-29', new_time: hour });
    const q3 = r.body.id;   // 10/29 같은 시각 = 반복 줄 자신과 겹침
    r = await studentCall(uid, 'POST', '/api/class/schedule/request', { request_type: 'postpone', schedule_id: R, orig_date: '2026-10-23', new_date: '2026-10-24', new_time: hour });
    const q4 = r.body.id;   // 금요일 = 수업 요일 아님
    d = await decide(q2);
    ok(trial + ' ③ 날짜 없이 연기 → postponed', d.status === 200 && d.body.applied === 'postponed', JSON.stringify(d.body));
    ok(trial + ' ③ 빠진 날 둘', row(R).skip_dates === '2026-10-08,2026-10-15', row(R).skip_dates);
    const pp = sq.prepare("SELECT * FROM class_schedules WHERE source=? AND status='postponed'").all('recurring-week:' + R);
    ok(trial + ' ③ 10/15 연기 기록 줄', pp.length === 1 && pp[0].scheduled_date === '2026-10-15' && pp[0].start_time === hour, JSON.stringify(pp));
    ss = await sessionsOn(uid, '2026-10-15');
    ok(trial + ' ③ 10/15 반복 수업이 안 열린다', !ss.some((c) => Number(c.schedule_id) === R), JSON.stringify(ss));
    ok(trial + ' ③ 10/15 연기 기록은 입장 대상이 아니다', !ss.some((c) => Number(c.schedule_id) === Number(pp[0] && pp[0].id) && c.status !== 'postponed' && c.can_enter !== false), JSON.stringify(ss));

    // ④ 겹침 → 409 · 아무것도 안 바뀜 · 요청은 대기
    const skBefore = row(R).skip_dates;
    d = await decide(q3);
    ok(trial + ' ④ 다음 주 같은 시각은 자기 수업과 겹쳐 409', d.status === 409 && (d.body.error === 'conflict'), JSON.stringify(d.body));
    ok(trial + ' ④ 겹치면 빠진 날도 안 늘고 요청은 대기', row(R).skip_dates === skBefore && reqRow(q3).status === 'pending');
    // ⑤ 수업 요일이 아닌 회차 → 409 orig_not_class_day
    d = await decide(q4);
    ok(trial + ' ⑤ 수업 요일 아닌 회차는 409', d.status === 409 && d.body.error === 'orig_not_class_day' && typeof d.body.message === 'string' && typeof d.body.message_en === 'string', JSON.stringify(d.body));
    ok(trial + ' ⑤ 그때도 아무것도 안 바뀜', row(R).skip_dates === skBefore && reqRow(q4).status === 'pending');

    // ⑥ 급여 — 이 달 그 학생 수업이 날짜마다 한 번씩만(빠진 날 두 번 안 셈)
    const ls = await lessonsOf();
    const mineL = ls.list.filter((l) => [R, M, Number(pp[0] && pp[0].id)].includes(Number(l.schedule_id)));
    const dates = mineL.map((l) => String(l.date || '').slice(0, 10)).sort();
    ok(trial + ' ⑥ 급여 화면 응답', ls.ok, JSON.stringify(ls).slice(0, 300));
    ok(trial + ' ⑥ 급여: 목 1·22·29 + 보강 9 + 연기 15 = 5건, 중복 없음', JSON.stringify(dates) === JSON.stringify(['2026-10-01', '2026-10-09', '2026-10-15', '2026-10-22', '2026-10-29']), JSON.stringify(mineL.map((l) => [l.schedule_id, l.date, l.status])));
    const lp = mineL.find((l) => String(l.date).slice(0, 10) === '2026-10-15');
    ok(trial + ' ⑥ 급여: 10/15 는 «연기» 로 · 무료 연기 지급률(요청과 이어짐)', lp && lp.status === 'postponed' && lp.postpone_fee_type === 'free', JSON.stringify(lp));

    // ⑦ 빠진 날 자리는 비었다 — 같은 학생 다른 수업을 10/8 그 시각으로 옮길 수 있다(겹침 검사가 빠진 날을 안다)
    setNow(TODAY, '08:00');
    const X = mkClass(uid, 'one_off', null, '2026-10-06', '20:00', '1');
    r = await studentCall(uid, 'POST', '/api/class/schedule/request', { request_type: 'change', schedule_id: X, new_date: '2026-10-08', new_time: hour });
    d = await decide(r.body.id);
    ok(trial + ' ⑦ 빠진 날 그 시각으로 다른 수업을 옮길 수 있다', d.status === 200 && d.body.applied === 'moved' && row(X).scheduled_date === '2026-10-08', JSON.stringify(d.body));

    // ⑧ 지난 회차는 안 옮긴다 · 강사 변경은 보강 줄에만
    setNow(TODAY, '08:00');
    r = await studentCall(uid, 'POST', '/api/class/schedule/request', { request_type: 'change', schedule_id: R, orig_date: '2026-10-29', new_date: '2026-10-30', new_time: hour, teacher_id: 2 });
    const q5 = r.body.id;
    setNow('2026-10-30', '08:00');
    d = await decide(q5);
    ok(trial + ' ⑧ 지난 회차는 409 orig_date_past', d.status === 409 && d.body.error === 'orig_date_past', JSON.stringify(d.body));
    sq.prepare('UPDATE schedule_change_requests SET status=? WHERE id=?').run('rejected', q5);
    setNow(TODAY, '08:00');
    r = await studentCall(uid, 'POST', '/api/class/schedule/request', { request_type: 'change', schedule_id: R, orig_date: '2026-10-29', new_date: '2026-10-30', new_time: hour, teacher_id: 2 });
    d = await decide(r.body.id);
    const mv2 = sq.prepare("SELECT * FROM class_schedules WHERE source=? AND scheduled_date='2026-10-30'").all('recurring-week:' + R);
    ok(trial + ' ⑧ 강사 변경: 그 주 보강 줄만 BETA, 반복 줄은 ALPHA', d.status === 200 && d.body.applied === 'moved' && mv2.length === 1 && mv2[0].teacher_id === '2' && row(R).teacher_id === '1' && d.body.teacher_changed && d.body.teacher_changed.id === '2', JSON.stringify({ b: d.body, mv2, R: row(R) }));

    // ⑨ 회차 날짜 없는 옛 요청은 예전처럼 기록만
    const oldId = Number(sq.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, status, created_at) VALUES (?, 'postpone', 'teacher', 'pending', ?)`).run(R, NOW).lastInsertRowid);
    const skNow = row(R).skip_dates;
    d = await decide(oldId);
    ok(trial + ' ⑨ 회차 날짜 없는 옛 요청은 recorded · 아무것도 안 바뀜', d.status === 200 && d.body.applied === 'recorded' && row(R).skip_dates === skNow, JSON.stringify(d.body));
  }
  ok('정본: 깨진 조각은 버린다', JSON.stringify(normSkipDates('2026-10-08,x,2026-02-30')) === '["2026-10-08"]');

  writeFileSync(process.env.WEEKLY_RESULT, JSON.stringify({ results, warns: warns.slice(0, 5) }));
  process.exit(0);
}

/* ═════════════════════════════ 부모: 준비·실행·변이 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'rw1-'));
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
    ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF],
    { encoding: 'utf8', env: { ...process.env, SMRS_CHILD: '1', SMRS_SRC: srcDir, WEEKLY_RESULT: join(tmp, 'result.json') }, maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
  if (r.status !== 0 || !existsSync(join(tmp,'result.json'))) return {crashed:true,err:(r.stderr||'') + String(r.error||'')};
  return JSON.parse(readFileSync(join(tmp,'result.json'),'utf8'));
}

let pass = 0, fail = 0;
console.log('\n═ 반복 수업 «그 주 하루만» 연기·변경 (실제 핸들러 · SQLite) ═');
const base = runChild(REAL_SRC);
if (base.crashed) {
  console.log('  FAIL 자식 실행이 죽었다:\n' + base.err);
  fail++;
} else {
  for (const t of base.results) {
    if (t.info) { console.log('  ' + t.name); continue; }
    if (t.pass) { pass++; console.log('  PASS ' + t.name); }
    else { fail++; console.log('  FAIL ' + t.name + (t.why ? ' — ' + t.why : '')); }
  }
}

/* ── 변이시험: 복사본만 고친다 ── */
console.log('\n═ 변이시험 (복사본 src — 저장소 파일은 그대로) ═');
const MUT = [
  { name: '읽는 쪽이 빠진 날을 모름', file: 'class-start-date.ts', from: "if (recurSkippedOn(row, ymd)) return false;", to: '' },
  { name: '급여가 빠진 날도 셈(이중 계산)', file: 'api-admin.ts', from: "if (recurSkippedOn(row, _ymd)) continue;", to: '' },
  { name: '승인이 예전처럼 기록만', file: 'api-admin.ts', from: "const _ow = await prepareRecurringOneWeek(", to: "const _ow = { ok: true, applied: 'recorded' as any, mutations: [] as any[], error: null as any, status: 200, conflict: null as any }; void (" },
  { name: '빠진 날 기록을 안 씀', file: 'recurring-one-week.ts', from: "env.DB.prepare(`UPDATE class_schedules SET skip_dates = ? WHERE id = ? AND scheduled_date IS NULL`).bind(nextSkips, cs.id),", to: '' },
  { name: '옮긴 날 겹침에서 반복 줄을 늘 뺌', file: 'recurring-one-week.ts', from: "const exclude = newDate === orig ? [cs.id] : [];", to: "const exclude = [cs.id];", also: ["excludeId: newDate === orig ? cs.id : undefined,", "excludeId: cs.id,"] },
  { name: '조건 뒤집기 — 지난 회차만 허용', file: 'recurring-one-week.ts', from: "if (orig < today) return 'orig_date_past';", to: "if (orig >= today) return 'orig_date_past';" },
  { name: '겹침 검사가 빠진 날을 모름', file: 'schedule-conflict.ts', from: "if (recurSkippedOn(recurring, d)) return false;", to: '' },
  { name: '«내 수업» 다음 회차가 빠진 날로', file: 'api-mango.ts', from: "guard < 60 && recurSkippedOn(r, nextDate)", to: "guard < 60 && false && recurSkippedOn(r, nextDate)" },
  { name: '연기 기록 줄 급여가 요청과 안 이어짐', file: 'api-admin.ts', from: "|| (_rwParent ? postponeReq[`${_rwParent}|${dateStr}`] : null)", to: '' },
  { name: '옛 요청도 409(기록만 폴백 제거)', file: 'api-admin.ts', from: "} else if (_oneWeekWhy && ONE_WEEK_FALLBACK.includes(_oneWeekWhy)) {", to: "} else if (false) {" },
];
if (!base.crashed) {
  for (const m of MUT) {
    const dir = join(tmp, 'mut-' + Math.random().toString(36).slice(2));
    cpSync(REAL_SRC, dir, { recursive: true });
    const f = join(dir, m.file);
    const s = readFileSync(f, 'utf8');
    if (!s.includes(m.from)) { fail++; console.log('  FAIL ' + m.name + ' — 치환 앵커를 못 찾음(변이가 한 번도 안 돎)'); continue; }
    let s2 = s.replace(m.from, m.to); if (m.also) s2 = s2.replace(m.also[0], m.also[1]);
    writeFileSync(f, s2);
    const r = runChild(dir);
    const nFail = r.crashed ? -1 : r.results.filter((t) => !t.pass && !t.info).length;
    if (r.crashed) { fail++; console.log('  FAIL ' + m.name + ' — 자식이 크래시(깔끔한 FAIL 이 아님)\n' + r.err); }
    else if (nFail > 0) {
      pass++;
      const first = r.results.find((t) => !t.pass && !t.info);
      console.log(`  PASS ${m.name} → 하니스가 ${nFail}건 FAIL 로 잡음 (예: ${first.name})`);
    } else { fail++; console.log('  FAIL ' + m.name + ' — 변이를 못 잡음(검사가 헛돈다)'); }
    rmSync(dir, { recursive: true, force: true });
  }
}

cleanup();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

