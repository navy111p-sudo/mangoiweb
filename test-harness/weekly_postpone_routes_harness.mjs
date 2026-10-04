/**
 * 수업을 옮긴 뒤 «강사와 학생이 같은 방·같은 시각» 을 받는가 — 샌드박스 끝-끝 검사
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 이 하니스가 있나
 *   방 번호는 `class-{예약id}-{YYYYMMDD KST}` 로 결정론적이다. 그런데 그 방을 «만드는 곳» 이
 *   둘이다 — 학생 `/api/class/sessions/today`(api-mango.ts)와 강사 `/api/teacher/portal`
 *   (api-teacher.ts). 수업을 옮기는 입구(드래그 PATCH · 연기/변경 요청 승인 · 「오늘은 이 방」)
 *   중 하나라도 한쪽만 따라가면 «같은 수업인데 둘 다 참여자 1명» 이 재현된다(CLAUDE.md 2장).
 *
 * 무엇이 «진짜» 이고 무엇이 «모형» 인가
 *   ✅ 진짜: handleAdminApi · handleMangoApi · handleTeacherApi 를 **소스 그대로**
 *      (`node --experimental-strip-types` + 확장자 해석 훅) import 해 Request 를 넣어 돌린다.
 *      인증(checkAdminSession·getAdminActor·getScope)·스키마 생성·SQL 전부 실제 코드다.
 *   ✅ 진짜: SQLite(node:sqlite) — D1 모양(prepare/bind/first/all/run/raw, exec, batch)으로 감쌌다.
 *   🟡 모형: src/index.ts 의 라우팅·인증 게이트(isAdminPath 등)는 거치지 않는다 — 핸들러를 직접 부른다.
 *   🟡 모형: 시계(Date.now / new Date())는 고정값. KV·외부 API 는 없음(빈 가짜 KV).
 *   🟡 모형: 스키마 일부(teachers·students_erp·teacher_account_links)는 소스의 CREATE 문을 «읽어서»
 *      만든다(손으로 베끼지 않는다). class_schedules·auth·override 표는 핸들러가 스스로 만든다.
 *
 * 변이시험: src 를 임시 폴더로 «복사» 한 뒤 복사본의 글자만 바꿔 자식 프로세스로 다시 돌린다.
 *   ⛔ 저장소 파일은 한 글자도 안 건드린다.
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
  const studentCall = async(uid,method,path,body) => {
    const token=await signUidToken(uid,env);
    const request=new Request(BASE+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const response=await handleMangoApi(request,new URL(request.url),env,{});
    return {status:response.status,body:await response.json()};
  };
  for(let trial=0;trial<400;trial++){
    sq.exec('DELETE FROM class_schedules');
    setNow(TODAY,'08:00');
    const uid='sandbox_route_'+trial, kind=trial%2?'change':'postpone';
    const hour=String(9+trial%12).padStart(2,'0')+':00';
    const ids=[0,7,14].map(days=>mkClass(uid,'one_off',null,addDays(TODAY,days),hour,'1'));
    const untouched=mkClass(uid,'one_off',null,addDays(TODAY,1),hour,'1');
    const body={request_type:kind,schedule_id:ids[0],new_date:addDays(TODAY,7),new_time:kind==='change'?hour.slice(0,3)+'30':hour};
    if(kind==='postpone'){
      const preview=await studentCall(uid,'GET','/api/class/schedule/weekly-postpone?schedule_id='+ids[0]);
      ok(trial+' preview full series',preview.status===200&&preview.body.count===3,JSON.stringify(preview));
      body.request_scope='weekly_postpone';body.expected_series_snapshot=preview.body.snapshot;
    }
    const submitted=await studentCall(uid,'POST','/api/class/schedule/request',body);
    ok(trial+' student '+kind+' request saved',submitted.status===200&&submitted.body.ok,JSON.stringify(submitted));
    if(!submitted.body.ok)continue;
    const requestId=submitted.body.id;
    for(const cookie of ['tok_admin','tok_alpha']){
      const list=await callAdmin('GET','/api/admin/schedule-requests?status=pending&limit=300',{cookie});
      ok(trial+' visible pending '+cookie,(list.body.rows||[]).some(r=>r.id===requestId&&r.request_type===kind),JSON.stringify(list.body).slice(0,120));
    }
    const foreign=await callAdmin('GET','/api/admin/schedule-requests?status=pending&limit=300',{cookie:'tok_beta'});
    ok(trial+' other teacher excluded',!(foreign.body.rows||[]).some(r=>r.id===requestId));
    const approved=await callAdmin('POST','/api/admin/schedule-requests/decide',{cookie:'tok_admin',body:{id:requestId,action:'approve'}});
    ok(trial+' approved actual move',approved.status===200&&approved.body.applied==='moved',JSON.stringify(approved));
    if(approved.body.applied!=='moved')continue;
    const count=sq.prepare('SELECT COUNT(*) n FROM class_schedules').get().n;
    ok(trial+' same count and other weekday untouched',count===4&&sq.prepare('SELECT scheduled_date FROM class_schedules WHERE id=?').get(untouched).scheduled_date===addDays(TODAY,1));
    const days=kind==='postpone'?[7,14,21]:[7,7,14];
    ok(trial+' all expected dates',ids.every((id,i)=>sq.prepare('SELECT scheduled_date FROM class_schedules WHERE id=?').get(id).scheduled_date===addDays(TODAY,days[i])));
    for (const [index,sid] of (kind === 'postpone' ? ids : [ids[0]]).entries()) {
      const date = addDays(TODAY,7*(index+1));
      setNow(date,hour);
      await both(trial+' '+kind+' matching room '+index,sid,uid,'tok_alpha','tok_beta',{present:true,time:body.new_time,ymd:date.replaceAll('-','')});
      const calendar=await callAdmin('GET','/api/admin/schedules?week='+addDays(date,-1),{cookie:'tok_admin'});
      const shown=Array.isArray(calendar.body)?calendar.body:(calendar.body.items||calendar.body.schedules||[]);
      ok(trial+' admin calendar contains moved lesson '+index,shown.some(r=>r.id===sid&&r.date===date&&r.start_time===body.new_time),JSON.stringify(shown.filter(r=>r.id===sid)));
    }
  }

  writeFileSync(process.env.WEEKLY_RESULT, JSON.stringify({ results, warns: warns.slice(0, 5) }));
  process.exit(0);
}

/* ═════════════════════════════ 부모: 준비·실행·변이 ═════════════════════════════ */
const tmp = mkdtempSync(join(tmpdir(), 'smrs-'));
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
console.log('\n═ 수업 이동 뒤 강사·학생 방 동기화 (실제 핸들러 · SQLite) ═');
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
const MUT = [];
if (!base.crashed) {
  for (const m of MUT) {
    const dir = join(tmp, 'mut-' + Math.random().toString(36).slice(2));
    cpSync(REAL_SRC, dir, { recursive: true });
    const f = join(dir, m.file);
    const s = readFileSync(f, 'utf8');
    if (!s.includes(m.from)) { fail++; console.log('  FAIL ' + m.name + ' — 치환 앵커를 못 찾음(변이가 한 번도 안 돎)'); continue; }
    writeFileSync(f, s.replace(m.from, m.to));
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

