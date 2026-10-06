/**
 * Independent schedule lifecycle QA. Only ephemeral in-memory SQLite and fake KV.
 * Actual Worker router, authentication, admin/student/teacher handlers and SQL.
 * Three varied data/order/timezone trials, no production writes or browser claims.
 * This test intentionally fails when a request approval partially commits, loses a
 * concurrent edit, or bypasses the availability rules of direct schedule moves.
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
if (process.env.SLS_CHILD === '1') {
  const SRC = process.env.SLS_SRC;
  const results = [];
  const batchBindCounts=[];
  let writeFailure = null, readHook = null, readFailure = null, faultHits = 0, beforeBatch = null;
  globalThis.fetch = async () => { throw new Error('External network forbidden in isolated lifecycle QA'); };

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
    sql, args,
    bind: (...b) => mkStmt(sql, b.map(norm)),
    async first(col) {
      if (readFailure?.(sql,'first')) { faultHits++; throw new Error('injected lifecycle read failure'); }
      const st = sq.prepare(sql);
      const r = st.get(...args);
      if (readHook?.match(sql,args)) { const h=readHook;readHook=null;await h.run(); }
      if (!r) return null;
      const o = { ...r };
      return col ? o[col] : o;
    },
    async all() {
      if (readFailure?.(sql,'all')) { faultHits++; throw new Error('injected lifecycle read failure'); }
      const st = sq.prepare(sql);
      return { results: st.all(...args).map((r) => ({ ...r })), success: true, meta: {} };
    },
    async run() {
      const st = sq.prepare(sql);
      if (writeFailure?.(sql,args)) { faultHits++; throw new Error('injected lifecycle write failure'); }
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
    async batch(stmts) { batchBindCounts.push(...stmts.map(s=>s.args.length));if(beforeBatch){const h=beforeBatch;beforeBatch=null;await h();}sq.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts)out.push(await s.run());sq.exec('COMMIT');return out;}catch(e){sq.exec('ROLLBACK');throw e;} },
    dump: async () => new ArrayBuffer(0),
  };
  const kvMap = new Map();
  const KV = {
    async get(k, t) { const v = kvMap.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { kvMap.set(k, String(v)); },
    async delete(k) { kvMap.delete(k); },
    async list() { return { keys: [...kvMap.keys()].map((name) => ({ name })), list_complete: true }; },
  };
  const env = new Proxy({ DB, ADMIN_PASSWORD: 'harness-pw', ROOM_JWT_SECRET: 'local-lifecycle-test-secret' }, {
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
  const req = (method, path, { cookie, body, bearer } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (bearer) headers.authorization = 'Bearer ' + bearer;
    if (cookie) headers.cookie = `mango_admin_session=${cookie}`;
    return new Request(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  };
  let worker = null;
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const callAdmin = async (method, path, opts) => {
    const r = req(method, path, opts);
    const res = worker ? await worker.fetch(r, env, ctx) : await handleAdminApi(r, new URL(r.url), env, ctx);
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

  const { createRequire } = await import('node:module');
  const require = createRequire(join(ROOT, 'cloudflare-deploy/package.json'));
  const compiled = require('esbuild').buildSync({ entryPoints:[join(SRC,'index.ts')],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent' }).outputFiles[0].text;
  worker = (await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))).default;
  const { signUidToken } = await imp('auth-token.ts');
  const { scheduleMoveVersion } = await imp('class-schedule-move.ts');
  const trial = Number(process.env.SLS_TRIAL || 0);
  const originDate = ['2026-10-04','2026-10-11','2026-10-18'][trial]; // Sunday -> Monday crosses week
  const destDate = ['2026-10-05','2026-10-12','2026-10-19'][trial];
  const destTime = ['00:20','09:40','21:20'][trial];
  const student = 'stu_a';
  setNow(originDate,'10:00');
  const token = await signUidToken(student, env, 60*86400000);
  const call = async (method,path,opts={}) => {
    try {
      const response = await worker.fetch(req(method,path,opts),env,ctx);
      return { status:response.status, body:await response.json().catch(()=>({})) };
    } catch(e) { return { status:599, body:{ error:String(e.message) } }; }
  };
  const studentCall = (method,path,body) => call(method,path,{bearer:token,body});
  const admin = (method,path,body) => call(method,path,{cookie:'tok_admin',body});
  const teacher = tid => call('GET','/api/teacher/portal',{cookie:tid==='1'?'tok_alpha':'tok_beta'});
  const row = id => ({...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id)});
  const requestRow = id => ({...sq.prepare('SELECT * FROM schedule_change_requests WHERE id=?').get(id)});
  const durableState = () => JSON.stringify(['class_schedules','schedule_change_requests','class_audit_log','class_room_override'].map(table=>[table,sq.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)?sq.prepare('SELECT * FROM '+table+' ORDER BY rowid').all():[]]));
  const reset = () => {
    writeFailure=readHook=readFailure=beforeBatch=null;faultHits=0;
    for(const table of ['class_schedules','schedule_change_requests','class_audit_log','class_room_override','teacher_unavailability','calendar_events','attendance']) {
      if(sq.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))sq.exec('DELETE FROM '+table);
    }
    setNow(originDate,'10:00');
  };
  const seed = () => mkClass(student,'one_off',null,originDate,'15:00','1');
  const submit = (id,overrides={}) => studentCall('POST','/api/class/schedule/request',{
    schedule_id:id,request_type:'change',new_date:destDate,new_time:destTime,teacher_id:2,...overrides
  });
  const decide = (id,action='approve') => admin('POST','/api/admin/schedule-requests/decide',{id,action});
  const list = body => Array.isArray(body)?body:(body.items||body.schedules||body.sessions||[]);
  const projections = async (label,id,date,time,tid='2',present=true) => {
    setNow(date,time==='00:20'?'00:05':'09:00');
    const before=row(id);
    const mine=await studentCall('GET','/api/class/schedule/mine?user_id='+student);
    const sessions=await studentCall('GET','/api/class/sessions/today?user_id='+student);
    const tp=await teacher(tid);
    const old=await teacher(tid==='1'?'2':'1');
    const today=await admin('GET','/api/admin/classes/today');
    const weekStart=new RealDate(RealDate.parse(date+'T00:00:00Z')-((new RealDate(date+'T00:00:00Z').getUTCDay()+6)%7)*86400000).toISOString().slice(0,10);
    const weekly=await admin('GET','/api/admin/schedules?week='+weekStart);
    const m=mine.body.schedules?.filter(s=>Number(s.schedule_id)===id)||[];
    const s=sessions.body.sessions?.filter(s=>Number(s.schedule_id)===id)||[];
    const t=tp.body.classes?.filter(s=>Number(s.schedule_id)===id)||[];
    const a=list(today.body).filter(s=>Number(s.schedule_id)===id);
    const w=list(weekly.body).filter(s=>Number(s.id)===id);
    const tw=(tp.body.week?.days||[]).flatMap(d=>(d.items||[]).filter(s=>Number(s.id)===id).map(s=>({...s,date:d.date})));
    ok(label+': teacher weekly calendar agrees with final state',present?tw.length===1&&tw[0].date===date&&tw[0].start_time===time:tw.length===0,JSON.stringify(tw));
    ok(label+': all role APIs succeeded',[mine,sessions,tp,today,weekly].every(r=>r.status===200&&r.body.ok!==false),JSON.stringify({mine,sessions,tp,today,weekly}).slice(0,1000));
    ok(label+': student schedule and today counts',present?m.length===1&&s.length===1:m.length===0&&s.length===0,JSON.stringify({m,s}));
    ok(label+': old teacher has no moved occurrence',!(old.body.classes||[]).some(s=>Number(s.schedule_id)===id));
    if(present) {
      ok(label+': admin weekly time/date/teacher correct once',w.length===1&&w[0].start_time===time&&w[0].date===date&&String(w[0].teacher_id)===tid,JSON.stringify(w));
      ok(label+': student upcoming schedule time/date correct',m[0]?.next_date===date&&m[0]?.start_time===time,JSON.stringify(m));
      ok(label+': teacher and student same timestamp',t.length===1&&s[0]?.start_ts===t[0]?.start_ts&&t[0]?.start_time===time,JSON.stringify({s,t}));
      ok(label+': admin/student/teacher same room',a.length===1&&a[0]?.room_id===s[0]?.room_id&&s[0]?.room_id===t[0]?.room_id,JSON.stringify({a,s,t}));
      ok(label+': final room follows same schedule id + KST date',s[0]?.room_id===`class-${id}-${date.replaceAll('-','')}`,JSON.stringify(s));
      const finalRoom=s[0]?.room_id||'';
      const studentVerify=await studentCall('GET','/api/class/verify-room?'+new URLSearchParams({room_id:finalRoom,user_id:student,role:'student'}));
      const teacherVerify=await call('GET','/api/class/verify-room?'+new URLSearchParams({room_id:finalRoom,user_id:tid,role:'teacher'}),{cookie:tid==='1'?'tok_alpha':'tok_beta'});
      ok(label+': final room entry verification accepts student and assigned teacher',studentVerify.body.authorized===true&&studentVerify.body.resolved_role==='student'&&teacherVerify.body.authorized===true&&teacherVerify.body.resolved_role==='teacher',JSON.stringify({studentVerify,teacherVerify}));
      const teacherPage=readFileSync(join(ROOT,'cloudflare-deploy/public/teacher.html'),'utf8');
      const extract=name=>{const begin=teacherPage.indexOf('function '+name+'(');if(begin<0)throw new Error('Missing executable teacher UI '+name);const open=teacherPage.indexOf('{',begin);let depth=0;for(let i=open;i<teacherPage.length;i++){if(teacherPage[i]==='{')depth++;else if(teacherPage[i]==='}'&&--depth===0)return teacherPage.slice(begin,i+1);}throw new Error('Unclosed teacher function '+name);};
      const location={};new Function('DATA','c','location',extract('freshClass')+'\n'+extract('joinClass')+'\njoinClass(c);')({...tp.body,me:{name:tid==='1'?'ALPHA':'BETA'}},{schedule_id:id,kind:'class',room_id:`class-${id}-${originDate.replaceAll('-','')}`},location);
      const navigated=location.href?new URL(location.href,BASE).searchParams.get('vc_room'):null;
      ok(label+': executable teacher join replaces stale room with latest portal room',navigated===finalRoom,JSON.stringify({navigated,finalRoom}));

    } else {
      ok(label+': teacher postponed occurrence cannot enter',t.length===1&&t[0].class_state==='postponed'&&t[0].can_enter===false&&t[0].join_open===false,JSON.stringify(t));
      ok(label+': admin postponed occurrence cannot join',a.length===1&&a[0].status==='postponed'&&a[0].join_open===false,JSON.stringify(a));
    }
    ok(label+': projections did not alter schedule',JSON.stringify(row(id))===JSON.stringify(before));
  };
  const scenarios = [
    ['student change approval across week boundary',async()=>{
      reset(); const id=seed(), original=row(id); const r=await submit(id);
      ok('student change: authenticated request pending',r.status===200&&r.body.status==='pending',JSON.stringify(r));
      ok('student change: request does not preempt approval',JSON.stringify(row(id))===JSON.stringify(original));
      const dup=await submit(id);ok('student change: serial duplicate rejected once',dup.status===409&&dup.body.error==='already_pending'&&sq.prepare('SELECT COUNT(*) n FROM schedule_change_requests').get().n===1,JSON.stringify(dup));
      const done=await decide(r.body.id);ok('student change: approved and moved',done.status===200&&done.body.applied==='moved'&&row(id).teacher_id==='2',JSON.stringify(done));
      const again=await decide(r.body.id);ok('student change: approval retry does not reapply',again.status===409&&again.body.error==='already_decided',JSON.stringify(again));
      const oldSessions=await studentCall('GET','/api/class/sessions/today?user_id='+student);ok('student change: old day no ghost slot',!oldSessions.body.sessions?.some(s=>Number(s.schedule_id)===id));
      const oldPortal=await teacher('1'),newPortal=await teacher('2');
      ok('student change: old teacher old day no ghost slot',!oldPortal.body.classes?.some(s=>Number(s.schedule_id)===id));
      ok('student change: new teacher upcoming receives destination date',(newPortal.body.upcoming||[]).some(s=>Number(s.id)===id&&s.date===destDate),JSON.stringify(newPortal.body.upcoming));
      const oldWeek=await admin('GET','/api/admin/schedules?week='+originDate);
      ok('student change: old admin week no ghost slot',!list(oldWeek.body).some(s=>Number(s.id)===id));
      const nextMine=await studentCall('GET','/api/class/schedule/mine?user_id='+student);
      ok('student change: student upcoming switches to new date immediately',nextMine.body.schedules?.some(s=>Number(s.schedule_id)===id&&s.next_date===destDate&&s.start_time===destTime),JSON.stringify(nextMine.body));
      await projections('student change final',id,destDate,destTime);
      await projections('student change refresh',id,destDate,destTime);
    }],
    ['postpone/reject/rebook',async()=>{
      reset();const id=seed(),original=row(id);
      const rejected=await submit(id);const no=await decide(rejected.body.id,'reject');
      ok('reject: request rejected and original schedule untouched',no.status===200&&requestRow(rejected.body.id).status==='rejected'&&JSON.stringify(original)===JSON.stringify(row(id)),JSON.stringify(no));
      const r=await submit(id,{request_type:'postpone',new_date:null,new_time:null,teacher_id:null});
      /* ⏩ (2026-10-06) 학생 무료 «미정 연기» 는 접수 즉시 자동 승인된다(student-auto-postpone.ts) —
         관리자 /decide 를 다시 부르면 already_decided 여야 한다(이중 적용 없음). */
      ok('postpone: free student postpone auto-approved on submit',r.status===200&&r.body.status==='approved'&&r.body.auto_applied==='postponed'&&row(id).status==='postponed'&&requestRow(r.body.id).status==='approved',JSON.stringify(r));
      const done=await decide(r.body.id);ok('postpone: admin re-decide does not reapply',done.status===409&&done.body.error==='already_decided'&&row(id).status==='postponed',JSON.stringify(done));
      await projections('postponed',id,originDate,'15:00','1',false);
      const rebook=await submit(id);const approved=await decide(rebook.body.id);
      ok('postpone: rebook restores active',approved.status===200&&approved.body.applied==='moved'&&row(id).status==='active',JSON.stringify({rebook,approved,row:row(id)}));
      await projections('rebooked final',id,destDate,destTime);
    }],
    ['blocked teacher request approval',async()=>{
      reset(); const id=seed();
      sq.exec(`CREATE TABLE IF NOT EXISTS teacher_unavailability (id INTEGER PRIMARY KEY,teacher_id TEXT,kind TEXT,day_of_week INTEGER,start_date TEXT,end_date TEXT,start_time TEXT,end_time TEXT,created_at INTEGER)`);
      ins('INSERT INTO teacher_unavailability (teacher_id,kind,start_date,end_date,start_time,end_time,created_at) VALUES (?,?,?,?,?,?,?)','2','date_range',destDate,destDate,'00:00','23:59',NOW);
      const r=await submit(id);const original=row(id);
      const control=await admin('PATCH','/api/admin/class-schedules/move',{ids:[id],expected:{[id]:scheduleMoveVersion(original)},source_date:originDate,destination_date:destDate,start_time:destTime,teacher_id:'2'});
      ok('blocked teacher: direct move rejects same blocked target',control.status===409&&JSON.stringify(row(id))===JSON.stringify(original),JSON.stringify(control));
      const done=await decide(r.body.id);
      ok('blocked teacher: approval cannot move into unavailable time',JSON.stringify(row(id))===JSON.stringify(original)&&done.body.applied!=='moved',JSON.stringify({done,row:row(id)}));
    }],
    ['decision write failure rollback',async()=>{
      reset();const id=seed();const r=await submit(id);const original=row(id),before=durableState();
      writeFailure=(sql)=>/^UPDATE schedule_change_requests SET status/.test(sql);
      const done=await decide(r.body.id);writeFailure=null;
      ok('decision write failure: exact fault fired and error reported',faultHits===1&&done.status>=400,JSON.stringify(done));
      ok('decision write failure: all durable rows roll back',before===durableState());
      ok('decision write failure: schedule and pending request roll back together',JSON.stringify(row(id))===JSON.stringify(original)&&requestRow(r.body.id).status==='pending',JSON.stringify({done,row:row(id),request:requestRow(r.body.id)}));
    }],
    ['schedule write failure preserves pending',async()=>{
      reset();const id=seed();const r=await submit(id);const original=row(id),before=durableState();
      writeFailure=(sql)=>/^UPDATE class_schedules SET scheduled_date/.test(sql);
      const done=await decide(r.body.id);writeFailure=null;
      ok('schedule write failure: exact fault fired and all durable rows roll back',faultHits===1&&before===durableState());
      ok('schedule write failure: never reports successful decision',done.status>=400&&requestRow(r.body.id).status==='pending'&&JSON.stringify(row(id))===JSON.stringify(original),JSON.stringify({done,row:row(id),request:requestRow(r.body.id)}));
    }],
    ['edit after student request',async()=>{
      reset();const id=seed();const r=await submit(id);
      const edit=await admin('PATCH','/api/admin/class-schedules/'+id,{start_time:'17:00'});
      ok('concurrent: intervening admin edit succeeds',edit.status===200&&row(id).start_time==='17:00',JSON.stringify(edit));
      const original=row(id);const done=await decide(r.body.id);
      ok('concurrent: stale student request cannot silently overwrite newer edit',done.status===409&&JSON.stringify(row(id))===JSON.stringify(original),JSON.stringify({done,row:row(id)}));
    }],
    ['approval overlap retains pending request',async()=>{
      for(const kind of ['student','teacher']){
        reset();const id=seed(),request=await submit(id);
        const [h,m]=destTime.split(':').map(Number),mins=h*60+m+5,overlapTime=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
        const other=mkClass(kind==='student'?student:'stu_b','one_off',null,destDate,overlapTime,kind==='student'?'1':'2');
        const before=durableState(),blocked=await decide(request.body.id);
        ok(kind+' overlap: approval returns409 conflict',blocked.status===409&&blocked.body.error==='conflict',JSON.stringify(blocked));
        ok(kind+' overlap: request stays pending and all durable rows unchanged',requestRow(request.body.id).status==='pending'&&before===durableState());
        sq.prepare('DELETE FROM class_schedules WHERE id=?').run(other);
        const retry=await decide(request.body.id);
        ok(kind+' overlap: removing conflict allows same pending request to succeed',retry.status===200&&retry.body.applied==='moved'&&row(id).scheduled_date===destDate&&row(id).start_time===destTime,JSON.stringify(retry));
      }
    }],
    ['moved overridden room across all projections',async()=>{
      reset();const id=seed(),code='qa-room-'+trial;
      const assigned=await admin('PUT','/api/admin/class-schedules',{action:'room_override',schedule_id:id,room_code:code});
      const room='meet-'+code,overrideBefore=JSON.stringify(sq.prepare('SELECT * FROM class_room_override WHERE schedule_id=?').all(id));
      const moved=await admin('PATCH','/api/admin/class-schedules/move',{ids:[id],expected:{[id]:scheduleMoveVersion(row(id))},source_date:originDate,destination_date:originDate,start_time:'15:20',teacher_id:'2'});
      ok('override composition: actual override and atomic move both succeed',assigned.status===200&&assigned.body.room_id===room&&moved.status===200&&moved.body.count===1,JSON.stringify({assigned,moved}));
      ok('override composition: existing room override rows survive move unchanged',overrideBefore===JSON.stringify(sq.prepare('SELECT * FROM class_room_override WHERE schedule_id=?').all(id)));
      const attendanceDDL=cutCreate(readSrc('api-mango.ts'),'attendance','last_seen_at');
      if(!attendanceDDL)throw new Error('Production attendance DDL missing');sq.exec(attendanceDDL);
      if(!sq.prepare('PRAGMA table_info(attendance)').all().some(c=>c.name==='teacher_uid'))sq.exec('ALTER TABLE attendance ADD COLUMN teacher_uid TEXT');
      setNow(originDate,'15:22');
      ins('INSERT INTO attendance (room_id,user_id,username,role,joined_at,last_seen_at,status,date) VALUES (?,?,?,?,?,?,?,?)',room,student,'Fixture Student','student',NOW-60000,NOW,'present',originDate);
      const originalRoom=`class-${id}-${originDate.replaceAll('-','')}`;
      ins('INSERT INTO attendance (room_id,user_id,username,role,joined_at,last_seen_at,status,date) VALUES (?,?,?,?,?,?,?,?)',originalRoom,'unrelated-user','Unrelated old room','student',NOW-60000,NOW,'present',originDate);
      const ss=await studentCall('GET','/api/class/sessions/today?user_id='+student),tt=await teacher('2'),today=await admin('GET','/api/admin/classes/today'),now=await admin('GET','/api/admin/classes-now');
      const studentRow=ss.body.sessions?.find(s=>Number(s.schedule_id)===id),teacherRow=tt.body.classes?.find(s=>Number(s.schedule_id)===id),todayRow=list(today.body).find(s=>Number(s.schedule_id)===id),nowRows=now.body.classes?.filter(s=>Number(s.schedule_id)===id)||[];
      ok('override composition: student teacher today-admin and classes-now agree',studentRow?.room_id===room&&teacherRow?.room_id===room&&todayRow?.room_id===room&&nowRows.length===1&&nowRows[0].room_id===room,JSON.stringify({studentRow,teacherRow,todayRow,now}));
      ok('override composition: live status follows overridden room once',nowRows[0]?.connected===true&&nowRows[0]?.live_room===room&&now.body.counts?.connected===1,JSON.stringify(now));
      sq.prepare('DELETE FROM attendance WHERE room_id=?').run(room);
      const onlyOld=await admin('GET','/api/admin/classes-now'),remaining=onlyOld.body.classes?.find(s=>Number(s.schedule_id)===id);
      ok('override composition: unrelated original-room attendance cannot mark override connected',remaining?.room_id===room&&remaining?.connected===false&&remaining?.live_room===null,JSON.stringify(onlyOld));
    }],
    ['frozen-clock ABA approval protection',async()=>{
      reset();const id=seed();ins('UPDATE class_schedules SET updated_at=? WHERE id=?',NOW+5000,id);
      const versions=[row(id).updated_at],held=await submit(id);
      const toB=await admin('POST','/api/admin/schedule-requests',{schedule_id:id,request_type:'change',new_date:destDate,new_time:destTime,teacher_name:'ALPHA'});
      const b=await decide(toB.body.id);versions.push(row(id).updated_at);
      const toA=await submit(id,{new_date:originDate,new_time:'15:00',teacher_id:1});
      const a=await decide(toA.body.id);versions.push(row(id).updated_at);
      ok('ABA: both fresh approvals restore original slot under frozen wall clock',b.body.applied==='moved'&&a.body.applied==='moved'&&row(id).scheduled_date===originDate&&row(id).start_time==='15:00',JSON.stringify({b,a,row:row(id)}));
      const heldResult=await decide(held.body.id);
      ok('ABA: older pending request does not become valid after A-B-A',heldResult.status===409&&requestRow(held.body.id).status==='pending',JSON.stringify(heldResult));
      const c=await admin('PATCH','/api/admin/class-schedules/'+id,{start_time:'16:00'});versions.push(row(id).updated_at);
      const d=await admin('PATCH','/api/admin/class-schedules/'+id,{start_time:'15:00'});versions.push(row(id).updated_at);
      const heldAgain=await decide(held.body.id);
      ok('ABA: direct edits also cannot revive old request',c.status===200&&d.status===200&&heldAgain.status===409&&row(id).start_time==='15:00',JSON.stringify({c,d,heldAgain}));
      ok('ABA: update timestamp strictly increases even ahead of frozen clock',versions.every((v,i)=>i===0||v>versions[i-1]),JSON.stringify(versions));
    }],
    ['availability changes before atomic commit',async()=>{
      reset();const id=seed(),r=await submit(id),original=row(id);
      sq.exec(`CREATE TABLE IF NOT EXISTS teacher_unavailability (id INTEGER PRIMARY KEY,teacher_id TEXT,kind TEXT,day_of_week INTEGER,start_date TEXT,end_date TEXT,start_time TEXT,end_time TEXT,created_at INTEGER)`);
      let inserted=false;beforeBatch=async()=>{ins('INSERT INTO teacher_unavailability (teacher_id,kind,start_date,end_date,start_time,end_time,created_at) VALUES (?,?,?,?,?,?,?)','2','date_range',destDate,destDate,'00:00','23:59',NOW);inserted=true;};
      const done=await decide(r.body.id);
      ok('commit race: newly unavailable teacher prevents move',inserted&&done.status===409&&JSON.stringify(row(id))===JSON.stringify(original)&&requestRow(r.body.id).status==='pending',JSON.stringify({done,row:row(id)}));
    }],
    ['decision UI pending conflict recovery',async()=>{
      const {runInNewContext}=await import('node:vm');
      const manager=readFileSync(join(ROOT,'cloudflare-deploy/public/manager.html'),'utf8');
      const start=manager.indexOf('  function reqMsgOf('),end=manager.indexOf('  /* 📆 (2026-09-29',start);
      if(start<0||end<0)throw new Error('Manager request UI extraction anchors missing');
      const code=manager.slice(start,end),cases=[['schedule_changed',409,false],['request_snapshot_missing',409,false],['request_or_schedule_changed',409,false],['teacher_unavailable',409,false],['request_apply_failed',503,false],['already_decided',409,true]];
      for(const [error,status,locked]of cases){
        let click;const msg={className:'',textContent:''},buttons=[{disabled:false},{disabled:false}],sent=[],storage=new Map();
        const wrap={querySelector:()=>msg,querySelectorAll:()=>buttons};
        Object.assign(buttons[0],{parentNode:wrap,getAttribute:key=>({'data-id':'42','data-act':'approve','data-who':'Student','data-to':'new time'})[key]});
        const data={ok:false,error,message:'다시 확인해 주세요.',message_en:'Refresh and check the schedule.'};
        const ui={EN:()=>true,T:(en)=>en,D:{me:{name:'Admin'},reqs:{rows:[{id:42,status:'pending'}],pending_count:1}},CACHE_PREFIX:'qa_',localStorage:{removeItem:k=>storage.delete(k),setItem:(k,v)=>storage.set(k,v)},document:{addEventListener:(event,fn)=>{if(event==='click')click=fn;}},confirm:()=>true,fetch:async(path,init)=>{sent.push({path,init});return{status,json:async()=>data};},quietGet:async()=>({name:'Admin'}),paintTodo:()=>{}};ui.window=ui;
        runInNewContext(code,ui);const event={target:{closest:()=>buttons[0]}};click(event);click(event);
        for(let n=0;n<3;n++)await new Promise(resolve=>setImmediate(resolve));
        ok('manager UI '+error+': rapid repeated click sends once',sent.length===1,sent.length);
        ok('manager UI '+error+': correct pending/already-decided button recovery',buttons.every(b=>b.disabled===locked),JSON.stringify({buttons,msg}));
        ok('manager UI '+error+': does not mislabel pending errors handled',locked?/Already handled/.test(msg.textContent):!/(Already handled|이미 처리)/.test(msg.textContent)&&msg.textContent.length>0,JSON.stringify(msg));
        const alerts=[];const adminUi={adminLang:'en',document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},localStorage:{getItem(){return null;}},prompt:()=>'',alert:text=>alerts.push(String(text)),fetch:async()=>({status,json:async()=>data})};adminUi.window=adminUi;
        runInNewContext(readFileSync(join(ROOT,'cloudflare-deploy/public/js/adm-r11.js'),'utf8'),adminUi);adminUi.srqLoad=()=>{};await adminUi.srqDecide(42,'approve');
        ok('admin UI '+error+': error contains recovery detail',alerts.length===1&&alerts[0].includes(data.message_en),JSON.stringify(alerts));
      }
    }],
    ['optional audit and notification failures',async()=>{
      reset();const id=seed();writeFailure=sql=>/^INSERT INTO notification_queue/.test(sql);
      const r=await submit(id);writeFailure=null;
      ok('optional notification failure: submission remains durably pending',faultHits===1&&r.status===200&&requestRow(r.body.id).status==='pending',JSON.stringify({r,faultHits}));
      faultHits=0;writeFailure=sql=>/^INSERT INTO class_audit_log/.test(sql);
      const done=await decide(r.body.id);writeFailure=null;
      ok('optional audit failure: durable decision and schedule remain successful',faultHits===1&&done.status===200&&done.body.applied==='moved'&&requestRow(r.body.id).status==='approved'&&row(id).scheduled_date===destDate&&row(id).teacher_id==='2',JSON.stringify({done,faultHits}));
    }],
    ['legacy dated request lacks snapshot',async()=>{
      reset();const id=seed(),r=await submit(id);sq.prepare('UPDATE schedule_change_requests SET schedule_snapshot=NULL WHERE id=?').run(r.body.id);
      const before=durableState(),done=await decide(r.body.id);
      ok('legacy dated request: missing snapshot cannot silently move',done.status===409&&before===durableState(),JSON.stringify(done));
      const rejected=await decide(r.body.id,'reject');
      ok('legacy dated request: rejection remains available for recovery',rejected.status===200&&requestRow(r.body.id).status==='rejected',JSON.stringify(rejected));
      const fresh=await submit(id),approved=await decide(fresh.body.id);
      ok('legacy dated request: reject then fresh request can complete',fresh.status===200&&approved.body.applied==='moved'&&requestRow(r.body.id).status==='rejected',JSON.stringify({fresh,approved}));

    }],
    ['approval read failures are fail closed',async()=>{
      for(const [name,match] of [
        ['schedule read',(sql,method)=>method==='first'&&/FROM class_schedules WHERE id/.test(sql)],
        ['overlap read',(sql,method)=>method==='all'&&/FROM class_schedules/.test(sql)],
        ['unavailability read',(sql,method)=>method==='all'&&/FROM teacher_unavailability/.test(sql)],
      ]) {
        reset();const id=seed(),r=await submit(id);
        sq.exec(`CREATE TABLE IF NOT EXISTS teacher_unavailability (id INTEGER PRIMARY KEY,teacher_id TEXT,kind TEXT,day_of_week INTEGER,start_date TEXT,end_date TEXT,start_time TEXT,end_time TEXT,created_at INTEGER)`);
        const before=durableState();readFailure=match;const done=await decide(r.body.id);readFailure=null;
        ok(name+': fault observed and approval rejected',faultHits>0&&done.status>=400,JSON.stringify({done,faultHits}));
        ok(name+': schedule/request/audit/room rows untouched',before===durableState());
      }
    }],
    ['student executable UI through Worker',async()=>{
      reset();const id=seed();const other=mkClass(student,'one_off',null,destDate,'16:00','1');
      const {runInNewContext}=await import('node:vm');
      const page=readFileSync(join(ROOT,'cloudflare-deploy/public/lesson-postpone-demo.html'),'utf8');
      const start=page.indexOf('function __mobPairs('),end=page.indexOf('window.__mobLastFee =',start);
      if(start<0||end<0)throw new Error('Student executable UI extraction anchors missing');
      const seen=[];
      const ui={__MOB_REAL:true,localStorage:{getItem:k=>k==='mango_token'?token:null},CURRENT_SCHEDULE:[{schedule_id:id,date:originDate,hour:'15:00'},{schedule_id:other,date:destDate,hour:'16:00'}],state:{mode:trial===1?'postpone':'change',cart:[{origIdx:0,date:destDate,hour:destTime,teacherName:'BETA',realTeacherId:'2'}]},fetch:async(path,init)=>{seen.push({path,body:JSON.parse(init.body),authorization:init.headers.Authorization});return worker.fetch(new Request(BASE+path,init),env,ctx);}};
      runInNewContext(page.slice(start,end),ui);
      const result=await ui.__mobPersist();const rows=sq.prepare('SELECT * FROM schedule_change_requests').all();
      ok('student UI: real chosen lesson creates exactly one authenticated request',result.ok&&result.sent===1&&rows.length===1&&rows[0].schedule_id===id&&seen.length===1&&seen[0].authorization==='Bearer '+token,JSON.stringify({result,rows}));
      ok('student UI: unscheduled cart item does not postpone other lesson',row(other).status==='active'&&row(other).start_time==='16:00');
      const approved=await decide(rows[0]?.id);ok('student UI: chosen request reaches actual approval',approved.body.applied==='moved',JSON.stringify(approved));
      await projections('student UI final',id,destDate,destTime);
      const emptyBefore=seen.length;ui.state.cart=[];const empty=await ui.__mobPersist();
      ok('student UI: empty cart does not send requests or claim success',!empty.ok&&empty.sent===0&&seen.length===emptyBefore,JSON.stringify(empty));
      ui.state.cart=[{origIdx:1,date:destDate,hour:'18:00',teacherName:'BETA',realTeacherId:'2'}];ui.localStorage.getItem=()=>null;
      const expired=await ui.__mobPersist();ok('student UI: expired login reports failure without mutating another lesson',!expired.ok&&expired.error==='login_required'&&row(other).start_time==='16:00',JSON.stringify(expired));
    }],
    ['weekly recurring approval contract',async()=>{
      reset();const id=mkClass(student,'recurring','Sun',null,'15:00','1'),original=row(id);
      const r=await submit(id,{orig_date:originDate});const done=await decide(r.body.id);
      ok('recurring: explicitly recorded only, template untouched',done.body.applied==='recorded'&&JSON.stringify(row(id))===JSON.stringify(original),JSON.stringify({r,done,row:row(id)}));
      const {runInNewContext}=await import('node:vm');const alerts=[];
      const ui={adminLang:'en',document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},localStorage:{getItem(){return null;}},prompt:()=>'',alert:x=>alerts.push(String(x)),fetch:async()=>({json:async()=>done.body})};
      ui.window=ui;runInNewContext(readFileSync(join(ROOT,'cloudflare-deploy/public/js/adm-r11.js'),'utf8'),ui);ui.srqLoad=()=>{};
      await ui.srqDecide(r.body.id,'approve');
      ok('recurring: executable admin UI explicitly asks manual timetable adjustment',alerts.some(x=>/not auto-changed/.test(x)&&/manually/.test(x)),JSON.stringify(alerts));
      let sends=0;ui.fetch=async()=>{sends++;return{json:async()=>done.body};};ui.prompt=()=>null;
      await ui.srqDecide(r.body.id,'approve');ok('approval UI: Cancel causes no request',sends===0,sends);
    }],
    ['interleaved student duplicate check',async()=>{
      reset();const id=seed();let nested;
      readHook={match:sql=>/SELECT id FROM schedule_change_requests WHERE schedule_id/.test(sql),run:async()=>{nested=await submit(id);}};
      const outer=await submit(id);
      const rows=sq.prepare('SELECT * FROM schedule_change_requests WHERE schedule_id=?').all(id);
      ok('interleaved retries: no two pending rows after racing duplicate reads',rows.length===1,JSON.stringify({outer,nested,rows}));
    }],
    ['interleaved approve and reject',async()=>{
      reset();const id=seed();const r=await submit(id),original=row(id);let nested;
      readHook={match:sql=>/SELECT \* FROM schedule_change_requests WHERE id/.test(sql),run:async()=>{nested=await decide(r.body.id,'reject');}};
      const outer=await decide(r.body.id);
      ok('interleaved decisions: one committed decision wins without overwrite',nested?.body?.status==='rejected'&&outer.status===409&&requestRow(r.body.id).status==='rejected'&&JSON.stringify(row(id))===JSON.stringify(original),JSON.stringify({nested,outer,row:row(id),request:requestRow(r.body.id)}));
    }],
    ['parallel student retries',async()=>{
      reset();const id=seed();const responses=await Promise.all([submit(id),submit(id),submit(id)]);
      const rows=sq.prepare('SELECT * FROM schedule_change_requests WHERE schedule_id=?').all(id);
      ok('parallel student retries: at most one pending row',rows.length===1&&responses.filter(r=>r.status===200).length===1,JSON.stringify({responses,rows}));
    }],
  ];
  const order=trial===1?[...scenarios].reverse():trial===2?[...scenarios.slice(3),...scenarios.slice(0,3)]:scenarios;
  for(const[name,fn]of order){try{await fn();}catch(e){ok(name+': scenario did not throw',false,e.stack);}}
  ok('transaction statements respect D1 100-bind limit',batchBindCounts.length>0&&batchBindCounts.every(n=>n<=100),'max='+Math.max(...batchBindCounts));
  process.stdout.write('\n@@RESULTS@@'+JSON.stringify({results,warns:warns.slice(-4)})+'\n');
  process.exit(0);
}

const tmp=mkdtempSync(join(tmpdir(),'sls-'));
let pass=0,fail=0;
try {
  writeFileSync(join(tmp,'hooks.mjs'),`import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';export async function resolve(spec,ctx,next){if((spec.startsWith('./')||spec.startsWith('../'))&&!/\\.(ts|js|mjs|json)$/.test(spec)&&ctx.parentURL){const u=new URL(spec+'.ts',ctx.parentURL);if(existsSync(fileURLToPath(u)))return next(u.href,ctx);}return next(spec,ctx);}`);
  writeFileSync(join(tmp,'reg.mjs'),`import {register} from 'node:module';register('./hooks.mjs',import.meta.url);`);
  for(const[i,tz]of ['UTC','America/Los_Angeles','Asia/Seoul'].entries()){
    console.log('\nTRIAL '+(i+1)+' TZ='+tz);
    const r=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--import',join(tmp,'reg.mjs'),SELF],{encoding:'utf8',env:{...process.env,SLS_CHILD:'1',SLS_SRC:REAL_SRC,SLS_TRIAL:String(i),TZ:tz},maxBuffer:32*1024*1024,timeout:180000});
    const marker=r.stdout?.lastIndexOf('@@RESULTS@@')??-1;
    if(marker<0){fail++;console.log('FAIL child crashed '+r.stderr+'\n'+r.stdout);continue;}
    const result=JSON.parse(r.stdout.slice(marker+'@@RESULTS@@'.length).trim());
    for(const t of result.results){if(t.pass){pass++;console.log('PASS '+t.name);}else{fail++;console.log('FAIL '+t.name+' — '+t.why);}}
  }
}finally{rmSync(tmp,{recursive:true,force:true});}
console.log(`\nStudent schedule lifecycle sync: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
