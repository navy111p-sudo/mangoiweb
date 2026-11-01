/**
 * 학생 연기·변경 자동 승인 — 샌드박스 끝-끝 검사 (2026-10-06 「자동 연기되게」 → 2026-10-07 「대리점 승인 필요 없음, 즉각 반영」)
 * ─────────────────────────────────────────────────────────────────────────────
 * 정본: cloudflare-deploy/src/student-auto-postpone.ts · 배선: api-mango.ts POST /api/class/schedule/request
 * ✅ 진짜: handleMangoApi · handleAdminApi · handleTeacherApi 를 소스 그대로 import 해 돌린다(SQLite).
 * 🟡 모형: src/index.ts 라우팅·인증 게이트는 거치지 않는다. 시계는 고정값.
 * 묻는 것(짝으로):
 *   · 자동 반영된다 — 날짜 지정 수업 1건 연기 · 매주 연기 · 날짜 없이 연기(postponed)
 *     그리고 강사 포털·학생 오늘 수업·관리자 캘린더에 «바로» 새 일시로 보인다
 *   · 2026-10-07 부터 유료(30분 이내)·강사 변경·변경(change)·연기보강도 즉시 반영(유료 표시는 요청에 남음)
 *   · 자동 반영 «안» 된다(대기로 남고 수업이 그대로) — 반복 수업 · 겹침 · 고른 강사를 못 찾음 ·
 *     카페24 미러 같은 날 시각만 · 미러의 날짜+강사 동시 변경
 *   · 예전에 대기로 남은 요청(jeong #14 모양)을 다시 보내면 그 요청이 자동 반영된다
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
  const row = (id) => sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id);
  const reqRow = (id) => sq.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(id);
  const showsMoved = async (label, sid, uid, date, time) => {
    setNow(date, '08:00');
    await both(label, sid, uid, 'tok_alpha', 'tok_beta', { present: true, time, ymd: date.replaceAll('-','') });
    const cal = await callAdmin('GET','/api/admin/schedules?week='+addDays(date,-1),{cookie:'tok_admin'});
    const shown = Array.isArray(cal.body)?cal.body:(cal.body.items||cal.body.schedules||[]);
    ok(label+' · 관리자 캘린더에 새 일시로', shown.some(r=>r.id===sid&&r.date===date&&r.start_time===time), JSON.stringify(shown.filter(r=>r.id===sid)));
  };
  const reset = () => { sq.exec('DELETE FROM class_schedules'); try { sq.exec('DELETE FROM schedule_change_requests'); } catch {} };

  for (let trial = 0; trial < 6; trial++) {
    const uid = 'auto_' + trial;
    const hour = String(10 + trial).padStart(2,'0') + ':00';

    // ① 단건 날짜 지정 연기 → 자동 반영 + 세 화면에 보임
    reset(); setNow(TODAY,'08:00');
    const s1 = mkClass(uid,'one_off',null,TODAY,hour,'1');
    const nd = addDays(TODAY, 2), nt = String(10+trial).padStart(2,'0')+':30';
    let r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s1,new_date:nd,new_time:nt});
    ok(trial+' ① 단건 연기 자동 반영', r.status===200&&r.body.status==='approved'&&r.body.auto_applied==='moved', JSON.stringify(r.body));
    ok(trial+' ① 수업표가 실제로 옮겨짐', row(s1).scheduled_date===nd&&row(s1).start_time===nt, JSON.stringify(row(s1)));
    ok(trial+' ① 요청은 approved · 자동승인 표시', reqRow(r.body.id)?.status==='approved'&&/자동/.test(reqRow(r.body.id)?.decided_by||''));
    if (r.body.auto_applied) await showsMoved(trial+' ① ', s1, uid, nd, nt);
    setNow(TODAY,'08:00');
    const st = await studentToday(uid);
    ok(trial+' ① 옛 날짜(오늘)에는 더 이상 안 보임', !(st.sessions||[]).some(c=>Number(c.schedule_id)===s1));
    let audit = -1; try { audit = sq.prepare("SELECT COUNT(*) n FROM class_audit_log WHERE schedule_id=? AND source='schedule-request-auto'").get(s1).n; } catch { audit = -1; }
    ok(trial+' ① 변경 이력에 남음', audit===1, 'n='+audit);

    // ② 유료(30분 이내) → 2026-10-07 부터 즉시 반영 + 유료 표시는 요청에 남는다
    reset(); setNow(TODAY, '09:50');
    const s2 = mkClass(uid,'one_off',null,TODAY,'10:00','1');
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s2,new_date:addDays(TODAY,1),new_time:'10:00'});
    ok(trial+' ② 유료도 즉시 반영', r.status===200&&r.body.status==='approved'&&r.body.auto_applied==='moved'&&r.body.fee_type==='paid', JSON.stringify(r.body));
    ok(trial+' ② 유료도 수업표가 옮겨짐', row(s2).scheduled_date===addDays(TODAY,1)&&row(s2).start_time==='10:00', JSON.stringify(row(s2)));
    ok(trial+' ② 유료 표시는 요청에 그대로', reqRow(r.body.id)?.fee_type==='paid');

    // ③ 반복 수업 → 대기(recorded 경로라 자동으로 안 함)
    reset(); setNow(TODAY,'08:00');
    const s3 = mkClass(uid,'recurring','Thu',null,hour,'1');
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s3,orig_date:'2026-10-01',new_date:'2026-10-08',new_time:hour});
    /* 🔁 (2026-10-09 「반복 수업 그 주 하루만 연기」) 옛 경계 「반복 수업은 언제나 대기」를 새 경계로 옮겼다:
       반복 수업도 «그 주 하루만» 반영하되, 다음 주 «같은 시각» 은 그 반복 줄 자신과 겹치므로 대기(conflict). */
    ok(trial+' ③ 반복 수업 — 다음 주 같은 시각은 자기 수업과 겹쳐 대기', r.status===200&&r.body.status==='pending'&&r.body.auto_reason==='conflict', JSON.stringify(r.body));
    ok(trial+' ③ 반복 수업 행 그대로(빠지는 날도 없음)', row(s3).day_of_week==='Thu'&&!row(s3).scheduled_date&&!row(s3).skip_dates, JSON.stringify(row(s3)));
    // ③-b 다른 날로 옮기면 → 그 주(10/8)만 빠지고 10/9 에 하루짜리 줄
    //      (10/1 은 ③ 의 대기 요청이 있어 중복 방지로 막힌다 — 그것도 정상)
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s3,orig_date:'2026-10-01',new_date:'2026-10-02',new_time:hour});
    ok(trial+' ③-b0 같은 회차에 대기 요청이 있으면 중복으로 막힘', r.status===409&&r.body.error==='already_pending', JSON.stringify(r.body));
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s3,orig_date:'2026-10-08',new_date:'2026-10-09',new_time:hour});
    ok(trial+' ③-b 반복 수업 그 주 하루만 자동 반영', r.status===200&&r.body.status==='approved'&&r.body.auto_applied==='moved', JSON.stringify(r.body));
    ok(trial+' ③-b 반복 줄은 매주 그대로 · 10/8 만 빠짐', row(s3).day_of_week==='Thu'&&!row(s3).scheduled_date&&row(s3).skip_dates==='2026-10-08', JSON.stringify(row(s3)));
    const mv = sq.prepare("SELECT * FROM class_schedules WHERE source=?").all('recurring-week:'+s3);
    ok(trial+' ③-b 10/9 에 하루짜리 보강 줄 1개', mv.length===1&&mv[0].scheduled_date==='2026-10-09'&&mv[0].start_time===hour&&mv[0].status==='active'&&mv[0].class_type==='makeup', JSON.stringify(mv));
    // ③-c 그다음 주(10/15)는 날짜 없이 연기 → '연기' 기록 줄
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s3,orig_date:'2026-10-15'});
    ok(trial+' ③-c 날짜 없이 연기도 그 주만', r.status===200&&r.body.status==='approved'&&r.body.auto_applied==='postponed'&&row(s3).skip_dates==='2026-10-08,2026-10-15', JSON.stringify(r.body)+JSON.stringify(row(s3)));
    const pp = sq.prepare("SELECT * FROM class_schedules WHERE source=? AND status='postponed'").all('recurring-week:'+s3);
    ok(trial+' ③-c 10/15 연기 기록 줄', pp.length===1&&pp[0].scheduled_date==='2026-10-15'&&pp[0].start_time===hour, JSON.stringify(pp));

    // ④ 강사 변경 → 즉시 반영(시각과 강사가 «함께» 바뀐다)
    reset(); setNow(TODAY,'08:00');
    const s4 = mkClass(uid,'one_off',null,addDays(TODAY,1),hour,'1');
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s4,new_date:addDays(TODAY,2),new_time:hour,teacher_id:2});
    ok(trial+' ④ 강사 변경도 즉시 반영', r.status===200&&r.body.status==='approved'&&r.body.auto_applied==='moved', JSON.stringify(r.body));
    ok(trial+' ④ 날짜와 강사가 함께 바뀜', row(s4).scheduled_date===addDays(TODAY,2)&&String(row(s4).teacher_id)==='2', JSON.stringify(row(s4)));
    // ④-2 고른 강사를 못 찾으면(퇴사·없는 번호) 대기 — 시각만 바꾸고 «완료» 라 하지 않는다
    //   접수 게이트가 없는 강사를 미리 걸러 내므로, 접수 «뒤» 에 강사가 사라진 요청을 직접 넣어 자동 승인을 부른다.
    reset(); setNow(TODAY,'08:00');
    const s4b = mkClass(uid,'one_off',null,addDays(TODAY,1),hour,'1');
    { const { scheduleMoveVersion: v4 } = await imp('class-schedule-move.ts'); const c4 = row(s4b);
      const q4 = Number(sq.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_name, requester_uid, teacher_name, student_name, orig_date, orig_time, new_date, new_time, fee_type, minutes_before, status, created_at, schedule_snapshot, new_teacher_id)
        VALUES (?,'postpone','student',?,?,'ALPHA',?,?,?,?,?,'free',600,'pending',?,?,'999')`).run(s4b, uid, uid, uid, c4.scheduled_date, hour, addDays(TODAY,2), hour, NOW, v4(c4)).lastInsertRowid);
      const a4 = await autoApproveStudentPostpone(env, q4);
      ok(trial+' ④-2 없는 강사는 대기', !a4.applied && a4.reason==='teacher_not_found' && reqRow(q4).status==='pending', JSON.stringify(a4));
      ok(trial+' ④-2 없는 강사면 수업·강사 그대로', row(s4b).scheduled_date===addDays(TODAY,1)&&String(row(s4b).teacher_id)==='1', JSON.stringify(row(s4b))); }

    // ⑤ 겹침 → 대기, 수업 그대로
    reset(); setNow(TODAY,'08:00');
    const s5 = mkClass(uid,'one_off',null,addDays(TODAY,1),hour,'1');
    mkClass(uid,'one_off',null,addDays(TODAY,3),hour,'2');   // 같은 «학생» 이 그 시각에 다른 강사 수업 — DB 유니크 인덱스(강사 기준)로는 안 막힌다
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s5,new_date:addDays(TODAY,3),new_time:hour});
    ok(trial+' ⑤ 겹치면 대기', r.status===200&&r.body.status==='pending'&&!r.body.auto_applied, JSON.stringify(r.body));
    ok(trial+' ⑤ 겹치면 수업 그대로', row(s5).scheduled_date===addDays(TODAY,1));

    // ⑥ 변경(change) → 즉시 반영
    reset(); setNow(TODAY,'08:00');
    const s6 = mkClass(uid,'one_off',null,addDays(TODAY,1),hour,'1');
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'change',schedule_id:s6,new_date:addDays(TODAY,2),new_time:hour});
    ok(trial+' ⑥ 변경도 즉시 반영', r.status===200&&r.body.status==='approved'&&r.body.auto_applied==='moved', JSON.stringify(r.body));
    ok(trial+' ⑥ 변경 수업표가 옮겨짐', row(s6).scheduled_date===addDays(TODAY,2), JSON.stringify(row(s6)));

    // ⑦ 날짜 없이 연기 → postponed 로 자동
    reset(); setNow(TODAY,'08:00');
    const s7 = mkClass(uid,'one_off',null,addDays(TODAY,1),hour,'1');
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s7});
    ok(trial+' ⑦ 미정 연기 자동 postponed', r.body.auto_applied==='postponed'&&row(s7).status==='postponed', JSON.stringify(r.body));

    // ⑧ 매주 연기 → 자동, 세 회차 모두 한 주씩 + 다른 요일 그대로
    reset(); setNow(TODAY,'08:00');
    const ids = [0,7,14].map(d=>mkClass(uid,'one_off',null,addDays(TODAY,d+1),hour,'1'));
    const keep = mkClass(uid,'one_off',null,addDays(TODAY,2),hour,'1');
    const pv = await studentCall(uid,'GET','/api/class/schedule/weekly-postpone?schedule_id='+ids[0]);
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:ids[0],new_date:addDays(TODAY,8),new_time:hour,request_scope:'weekly_postpone',expected_series_snapshot:pv.body.snapshot});
    ok(trial+' ⑧ 매주 연기 자동', r.body.auto_applied==='moved', JSON.stringify(r.body));
    ok(trial+' ⑧ 세 회차 한 주씩', ids.every((id,i)=>row(id).scheduled_date===addDays(TODAY,i*7+8)));
    ok(trial+' ⑧ 다른 요일 그대로', row(keep).scheduled_date===addDays(TODAY,2));
    if (r.body.auto_applied) for (const [i,id] of ids.entries()) await showsMoved(trial+' ⑧-'+i+' ', id, uid, addDays(TODAY,i*7+8), hour);

    // ⑨ jeong #14 모양: 자동 승인 전 접수돼 대기로 남은 요청 → 다시 보내면 반영
    reset(); setNow(TODAY,'08:00');
    const s9 = mkClass(uid,'one_off',null,addDays(TODAY,1),hour,'1');
    const nd9 = addDays(TODAY,4);
    const { scheduleMoveVersion } = await imp('class-schedule-move.ts');
    const cs9 = row(s9);
    const legacy = Number(sq.prepare(`INSERT INTO schedule_change_requests (schedule_id, request_type, requester_role, requester_name, requester_uid, teacher_name, student_name, orig_date, orig_time, new_date, new_time, fee_type, minutes_before, status, created_at, schedule_snapshot)
      VALUES (?,'postpone','student',?,?,'ALPHA',?,?,?,?,?,'free',600,'pending',?,?)`).run(s9, uid, uid, uid, cs9.scheduled_date, hour, nd9, hour, NOW, scheduleMoveVersion(cs9)).lastInsertRowid);
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s9,new_date:nd9,new_time:hour});
    ok(trial+' ⑨ 다시 보내면 대기 요청이 자동 반영', r.status===200&&r.body.id===legacy&&r.body.auto_applied==='moved', JSON.stringify(r.body));
    ok(trial+' ⑨ 수업표 반영 · 요청 approved', row(s9).scheduled_date===nd9&&reqRow(legacy).status==='approved');
    const n9 = sq.prepare('SELECT COUNT(*) n FROM schedule_change_requests WHERE schedule_id=?').get(s9).n;
    ok(trial+' ⑨ 중복 요청이 새로 안 생김', n9===1, 'n='+n9);
    r = await studentCall(uid,'POST','/api/class/schedule/request',{request_type:'postpone',schedule_id:s9,new_date:addDays(TODAY,5),new_time:hour});
    ok(trial+' ⑨ 그 뒤 또 연기해도 정상 접수(새 날짜로)', r.status===200&&r.body.auto_applied==='moved'&&row(s9).scheduled_date===addDays(TODAY,5), JSON.stringify(r.body));
  }

  // ⑩ 순수 판정 짝
  const base = { status:'pending', requester_role:'student', request_type:'postpone', fee_type:'free', schedule_snapshot:null };
  const csx = { id:1, scheduled_date:'2026-10-06', status:'active', source:'x', teacher_id:'1', start_time:'10:00', duration_min:20, user_id:'u' };
  const { scheduleMoveVersion: smv } = await imp('class-schedule-move.ts');
  const good = { ...base, schedule_snapshot: smv(csx), new_date:'2026-10-07', new_time:'10:00' };
  ok('⑩ 조건 맞으면 null', autoPostponeEligible(good, csx) === null);
  ok('⑩ 유료도 통과', autoPostponeEligible({ ...good, fee_type:'paid' }, csx) === null);
  ok('⑩ 요금 몰라도 통과', autoPostponeEligible({ ...good, fee_type:null }, csx) === null);
  ok('⑩ 변경(change)도 통과', autoPostponeEligible({ ...good, request_type:'change' }, csx) === null);
  ok('⑩ 취소 등 다른 종류는 막음', autoPostponeEligible({ ...good, request_type:'cancel' }, csx) === 'not_postpone_or_change');
  ok('⑩ 강사 변경(새 일시 있음) 통과', autoPostponeEligible({ ...good, new_teacher_id:'2' }, csx) === null);
  ok('⑩ 강사 변경인데 새 일시 없음은 막음', autoPostponeEligible({ ...good, new_teacher_id:'2', new_date:null, new_time:null }, csx) === 'teacher_change_invalid');
  ok('⑩ 강사(관리자) 요청은 막음', autoPostponeEligible({ ...good, requester_role:'teacher' }, csx) === 'not_student');
  ok('⑩ 스냅샷 없으면 막음', autoPostponeEligible({ ...good, schedule_snapshot:null }, csx) === 'schedule_changed');
  ok('⑩ 스냅샷 다르면 막음', autoPostponeEligible(good, { ...csx, start_time:'11:00' }) === 'schedule_changed');
  ok('⑩ 연기보강도 통과', autoPostponeEligible({ ...good, end_makeup:'연기보강' }, csx) === null);
  const mir = { ...csx, source:'c24-mirror' };
  ok('⑩ 미러 같은 날 시각만은 막음', autoPostponeEligible({ ...good, schedule_snapshot:smv(mir), new_date:'2026-10-06', new_time:'11:00' }, mir) === 'mirror_same_day');
  ok('⑩ 미러 다른 날은 허용', autoPostponeEligible({ ...good, schedule_snapshot:smv(mir) }, mir) === null);
  // ⑪ 되돌리기 스위치 env.STUDENT_AUTO_APPLY — 짝으로(기본은 전부 · 옛 정책 · 끔 · 모르는 값은 기본)
  ok('⑪ 스위치 없음 = 전부', autoApplyMode({}) === 'all' && autoApplyMode(null) === 'all');
  ok('⑪ 모르는 값 = 전부(오타로 정책이 조용히 안 바뀜)', autoApplyMode({ STUDENT_AUTO_APPLY: 'of' }) === 'all');
  ok('⑪ off 면 막음', autoApplyMode({ STUDENT_AUTO_APPLY: ' OFF ' }) === 'off' && autoPostponeEligible(good, csx, 'off') === 'auto_off');
  ok('⑪ free_postpone 이면 유료는 막음', autoPostponeEligible({ ...good, fee_type:'paid' }, csx, 'free_postpone') === 'not_free');
  ok('⑪ free_postpone 이면 변경은 막음', autoPostponeEligible({ ...good, request_type:'change' }, csx, 'free_postpone') === 'not_postpone');
  ok('⑪ free_postpone 이어도 무료 연기는 통과', autoPostponeEligible(good, csx, 'free_postpone') === null);
  ok('⑩ 미러 날짜+강사 동시 변경은 막음', autoPostponeEligible({ ...good, schedule_snapshot:smv(mir), new_teacher_id:'2' }, mir) === 'mirror_teacher_date');

  writeFileSync(process.env.WEEKLY_RESULT, JSON.stringify({ results, warns: warns.slice(0, 5) }));
  process.exit(0);
}

/* ═════════════════════════════ 부모: 준비·실행·변이 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'sap-'));
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
console.log('\n═ 학생 무료 연기 자동 반영 (실제 핸들러 · SQLite) ═');
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
  { name: '종류 막기 제거(취소도 자동)', file: 'student-auto-postpone.ts', from: "if (row.request_type !== 'postpone' && row.request_type !== 'change') return 'not_postpone_or_change';", to: '' },
  { name: '반복 수업 그 주 반영을 안 씀', file: 'student-auto-postpone.ts', from: "mutations.push(...ow.mutations);", to: '' },
  { name: '고른 강사를 못 찾아도 진행', file: 'student-auto-postpone.ts', from: "if (!tr) return { applied: null, reason: 'teacher_not_found' };", to: '' },
  { name: '강사는 안 바꾸고 시각만', file: 'student-auto-postpone.ts', from: "if (swap) mutations.push(", to: "if (false) mutations.push(" },
  { name: '미러 날짜+강사 막기 제거', file: 'student-auto-postpone.ts', from: "if (isMirror && String(row.new_date) !== String(cs.scheduled_date)) return 'mirror_teacher_date';", to: '' },
  { name: '겹침 검사 둘 다 무시', file: 'student-auto-postpone.ts', from: "if (strict) return { applied: null, reason: strict.error || 'conflict' };", to: '' , also: ["if (conf.has) return { applied: null, reason: 'conflict' };", ''] },
  { name: '접수 뒤 자동 승인 안 부름', file: 'api-mango.ts', from: 'const auto = await autoApproveStudentPostpone(env, reqId);', to: "const auto = { applied: null, reason: 'off' };" },
  { name: '대기 요청 재시도 자동 반영 제거', file: 'api-mango.ts', from: "if (gate.error === 'already_pending' && pendingDupId) {", to: 'if (false) {' },
  { name: '조건 뒤집기 — 연기·변경만 막음', file: 'student-auto-postpone.ts', from: "if (row.request_type !== 'postpone' && row.request_type !== 'change')", to: "if (row.request_type === 'postpone' || row.request_type === 'change')" },
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

