/** Cafe24 manual origin-ID ownership through real movement, approval and sync.
 * Authenticated Worker/handlers, synthetic SQLite, mocked Cafe24 READ responses.
 * No production network, real customer data, or deployment.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.MIRROR_QA_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

if (process.env.SMAV_CHILD === '1') {
  const relevantSources = ['class-schedule-move.ts','c24-mirror.ts','api-admin.ts','schedule-request-atomic.ts','student-schedule-request.ts','c24-identity.ts'];
  const hashes = () => Object.fromEntries(relevantSources.map(f => [f,createHash('sha256').update(readFileSync(join(SRC,f))).digest('hex')]));
  const hashesBefore = hashes();
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: pass ? '' : JSON.stringify(detail) });
  const RealDate = Date;
  const NOW = RealDate.parse('2026-10-04T12:00:00+09:00');
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this harness'); };
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  let fault = null, afterScheduleRead = null, beforeClassInsert = null;
  const writes = [];
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  const injected = (sql, method, args) => {
    if (!fault || fault.method !== method || !fault.match(sql, args)) return null;
    if (fault.mode === 'throw') throw new Error('injected availability read failure');
    return fault.mode === 'unsuccessful' ? { success: false, results: [] } : { success: true };
  };
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a.map(norm)),
    async first(col) {
      const bad = injected(sql, 'first', args); if (bad) return bad;
      const row = sq.prepare(sql).get(...args); return row ? (col ? row[col] : { ...row }) : null;
    },
    async all() {
      const bad = injected(sql, 'all', args); if (bad) return bad;
      const rows = sq.prepare(sql).all(...args).map(r => ({ ...r }));
      if (afterScheduleRead && /FROM class_schedules\b/.test(sql)) { const hook = afterScheduleRead; afterScheduleRead = null; await hook(); }
      return { success: true, results: rows, meta: {} };
    },
    async run() {
      if (beforeClassInsert && /INSERT INTO class_schedules/.test(sql)) { const hook = beforeClassInsert; beforeClassInsert = null; await hook(); }
      writes.push({ sql, args });
      const r = sq.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async raw() { return sq.prepare(sql).all(...args).map(Object.values); }
  });
  const DB = { prepare: sql => stmt(sql), async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(stmts) { sq.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts)out.push(await s.run());sq.exec('COMMIT');return out;}catch(e){sq.exec('ROLLBACK');throw e;} } };
  const mem = new Map();
  const KV = { async get(k, type) { const v = mem.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { mem.set(k, String(v)); }, async delete(k) { mem.delete(k); },
    async list() { return { keys: [], list_complete: true }; } };
  const env = new Proxy({ DB, ADMIN_PASSWORD: 'availability-harness-only' }, {
    get(t, p) { return p in t ? t[p] : typeof p === 'string' && /KV|STATE|CACHE|SESS/.test(p) ? KV : undefined; }
  });
  const imp = file => import(pathToFileURL(join(SRC, file)).href);
  const { handleAdminApi } = await imp('api-admin.ts');
  const { checkAdminSession } = await imp('auth-admin.ts');
  const { getScope } = await imp('scope.ts');
  const { ensureClassAuditTable } = await imp('class-audit.ts');
  const req = (method, path, body, token = 'tok_admin') => new Request('https://mangoi.ai' + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { cookie: 'mango_admin_session=' + token } : {}) },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const call = async (method, path, body, token) => {
    const r = req(method, path, body, token);
    const res = await handleAdminApi(r, new URL(r.url), env, { waitUntil() {}, passThroughOnException() {} });
    return res ? { status: res.status, body: await res.json() } : { status: 0, body: { error: 'no_route' } };
  };
  await checkAdminSession(req('GET', '/prime', null, 'prime'), env);
  await getScope(env, req('GET', '/prime', null, null));
  await ensureClassAuditTable(env);
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const lessonSrc = readFileSync(join(SRC, 'api-lessons.ts'), 'utf8');
  const ddl = (src, table, needs = '') => {
    const re = new RegExp('`(CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\([\\s\\S]*?\\);?)`', 'g');
    for (const m of src.matchAll(re)) if (m[1].includes(needs)) return m[1];
    throw new Error('Production DDL not found: ' + table);
  };
  sq.exec(ddl(adminSrc, 'class_schedules', 'duration_min INTEGER DEFAULT 20'));
  sq.exec('ALTER TABLE class_schedules ADD COLUMN starts_on TEXT');
  const ti = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const te = adminSrc.indexOf("].join(' ')", ti);
  sq.exec([...adminSrc.slice(ti, te).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' '));
  const blockDDL = ddl(adminSrc, 'teacher_unavailability');
  const vacationDDL = ddl(lessonSrc, 'calendar_events');
  sq.exec(blockDDL); sq.exec(vacationDDL);
  const insert = (sql, ...args) => sq.prepare(sql).run(...args);
  for (const [id, name] of [[1, 'ALPHA'], [2, 'BETA'], [3, 'GAMMA']]) {
    insert('INSERT INTO teachers (id,name,active,created_at,updated_at) VALUES (?,?,1,?,?)', id, name, NOW, NOW);
  }
  for (const [username, name, scope] of [
    ['admin', '관리자', 'hq'], ['mgr_karl', 'Karl (본사 매니저)', 'hq'],
    ['hq_t_alpha', 'ALPHA', 'teacher'], ['branch_test', 'Branch', 'branch'], ['unknown_scope', 'Staff', '']
  ]) {
    insert('INSERT OR IGNORE INTO admin_account (username,password_hash,name,created_at,updated_at) VALUES (?,?,?,?,?)', username, 'x', name, NOW, NOW);
    if (scope !== null) insert('INSERT OR REPLACE INTO admin_scope (username,scope_type,updated_at) VALUES (?,?,?)', username, scope, NOW);
    insert('INSERT INTO admin_sessions (token,username,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)', 'tok_' + username, username, NOW, NOW + 86400000, NOW);
  }
  const seed = (overrides = {}) => {
    const row = { user_id: 'student_a', student_name: 'Student A', schedule_kind: 'dated', class_type: 'regular',
      day_of_week: null, scheduled_date: '2026-10-05', start_time: '09:20', duration_min: 20,
      teacher_id: '1', status: 'active', source: 'harness', created_at: NOW, starts_on: null, ...overrides };
    const keys = Object.keys(row);
    return Number(insert(`INSERT INTO class_schedules (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(row)).lastInsertRowid);
  };
  const other = overrides => seed({ user_id: 'student_b', teacher_id: '2', start_time: '09:00', duration_min: 30, ...overrides });
  const block = (overrides = {}) => {
    const row = { teacher_id: '2', kind: 'weekly', day_of_week: 1, start_date: null, end_date: null,
      start_time: '09:00', end_time: '09:30', created_at: NOW, ...overrides };
    const keys = Object.keys(row); insert(`INSERT INTO teacher_unavailability (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(row));
  };
  const vacation = (overrides = {}) => {
    const row = { event_type: 'vacation', title: 'Vacation', teacher_name: 'BETA', date: '2026-10-05', end_date: null, created_at: NOW, ...overrides };
    const keys = Object.keys(row); insert(`INSERT INTO calendar_events (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(row));
  };
  const reset = () => { fault = null; afterScheduleRead = null; beforeClassInsert = null; sq.exec('DELETE FROM class_schedules; DELETE FROM teacher_unavailability; DELETE FROM calendar_events; DELETE FROM class_audit_log;'); writes.length = 0; };
  const snapshot = () => JSON.stringify(sq.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const classWrites = () => writes.filter(x => /UPDATE\s+class_schedules|INSERT\s+INTO\s+class_audit_log/i.test(x.sql));
  const patch = async (id, body = {}, token = 'tok_admin', method = 'PATCH') => call(method, '/api/admin/class-schedules/' + id, { teacher_id: '2', ...body }, token);
  const preview = (ids, token = 'tok_admin') => call('GET', '/api/admin/class-schedules/teacher-options?ids=' + ids.join(','), null, token);

  // The approved contract preserves manual origin identity and rejects ambiguity.
  const { applyMirror, ensureMirrorTables, mirrorNoteClassId } = await imp('c24-mirror.ts');
  const { moveSchedulesAtomically, scheduleMoveVersion } = await imp('class-schedule-move.ts');
  const { ensureScheduleChangeRequestTable } = await imp('student-schedule-request.ts');
  await ensureScheduleChangeRequestTable(env);
  sq.exec(`CREATE TABLE students_erp(user_id TEXT PRIMARY KEY,korean_name TEXT);
    INSERT INTO students_erp VALUES ('student_a','Student A'),('student_b','Student B'),('student_c','Student C');
    CREATE TABLE teacher_payroll_auto(teacher_id TEXT,teacher_name TEXT,year INTEGER,month INTEGER);
    INSERT INTO teacher_payroll_auto VALUES ('37','Teacher ALPHA',2026,10),('38','Teacher BETA',2026,10);
    CREATE TABLE attendance(user_id TEXT,teacher_uid TEXT,start_ms INTEGER);`);
  await ensureMirrorTables(env);
  sq.exec("INSERT INTO c24_mirror_config(k,v,updated_at) VALUES ('mode','all',0)");
  const evidence=[], probes=[];
  let externalCalls=0,classes=[];
  const cls=(o={})=>{const c={class_id:'qa_original',user_id:'student_a',date:'2026-10-05',time:'09:20',teacher_id:'37',class_state:1,...o};return {...c,start_ms:Date.parse(c.date+'T'+c.time+':00+09:00'),end_ms:Date.parse(c.date+'T'+c.time+':00+09:00')+1200000};};
  const cypher=async(e,q,p,mode)=>{
    if(e!==env||mode!=='READ'||!q.includes('MATCH (c:Class)'))throw Error('unexpected external mock request');
    externalCalls++;
    const fields=['class_id','user_id','start_ms','end_ms','date','class_state','teacher_id'];
    return {fields,values:classes.filter(c=>c.date>=p.since&&c.date<=p.until).map(c=>fields.map(f=>c[f]))};
  };
  const sync=async(since='2026-10-01',until='2026-10-20')=>{
    try{return await applyMirror(env,cypher,{since,until,dry_run:false,actor:'isolated-future-contract'});}
    catch(e){return {threw:String(e?.message||e)};}
  };
  const all=()=>sq.prepare('SELECT * FROM class_schedules ORDER BY id').all().map(r=>({...r}));
  const byId=id=>all().find(r=>r.id===id);
  const stable=r=>JSON.stringify(r);
  const outcomeVisible=r=>!!r.threw||r.ok===false||r.errors?.length>0;
  const put=(table,data)=>{const keys=Object.keys(data);return Number(sq.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(data)).lastInsertRowid);};
  const setup=async(source='c24-mirror', overrides={})=>{
    reset();sq.exec('DELETE FROM schedule_change_requests');classes=[cls()];
    const initial=await sync();
    if(initial.applied?.created!==1||initial.errors?.length)throw Error('fixture sync failed '+JSON.stringify(initial));
    const id=all()[0].id;
    const changes={source,...overrides};
    sq.prepare('UPDATE class_schedules SET '+Object.keys(changes).map(k=>k+'=?').join(',')+' WHERE id=?').run(...Object.values(changes),id);
    return id;
  };
  const move=async(route,ids,patch,expected)=>{
    expected=expected||Object.fromEntries(ids.map(id=>[id,scheduleMoveVersion(byId(id))]));
    if(route==='direct')return moveSchedulesAtomically(env,{ok:true,username:'admin',name:'QA',isTeacher:false},{ids,patch,expected});
    if(route==='group')return (await call('PATCH','/api/admin/class-schedules/move',{ids,patch,expected})).body;
    if(route==='single'){
      const p={...patch};if(p.destination_date){p.scheduled_date=p.destination_date;delete p.destination_date;}
      return (await call('PATCH','/api/admin/class-schedules/'+ids[0],{...p,expected})).body;
    }
    if(route==='approval'){
      if(ids.length!==1)throw Error('approval interface accepts one request at a time');
      const row=byId(ids[0]),rid=put('schedule_change_requests',{schedule_id:row.id,request_type:'change',requester_role:'admin',requester_name:'QA',requester_uid:row.user_id,teacher_name:'ALPHA',student_name:row.student_name,orig_date:row.scheduled_date,orig_time:row.start_time,new_date:patch.destination_date||patch.scheduled_date||row.scheduled_date,new_time:patch.start_time||row.start_time,new_teacher_id:patch.teacher_id||null,status:'pending',created_at:NOW,schedule_snapshot:scheduleMoveVersion(row)});
      const res=(await call('POST','/api/admin/schedule-requests/decide',{id:rid,action:'approve',decided_by:'QA'})).body;
      return {...res,request_id:rid,move_versions:res.ok?{[row.id]:scheduleMoveVersion(byId(row.id))}:undefined};
    }
    throw Error('unknown route '+route);
  };
  const assertProtected=(name,ids,before,res)=>{
    const rows=all(),notes=before.map(r=>r.notes);
    check(name+': each original row unchanged and present exactly once',ids.every((id,i)=>stable(byId(id))===stable(before[i]))&&rows.filter(r=>notes.includes(r.notes)).length===ids.length,{res,rows,before});
    check(name+': no sync mutation or constraint-error fallback',res.applied?.created===0&&res.applied?.updated===0&&res.applied?.cancelled===0&&res.errors?.length===0,{res,rows});
  };
  // 1. Main contract through actual move module, group PATCH, legacy PATCH and approval.
  for(const route of ['direct','group','single','approval'])for(const source of ['c24-mirror','c24-mirror:manual'])for(const dest of ['2026-10-04','2026-10-06'])for(const window of ['original-inclusive','origin-only','destination-only']) {
    const name=`contract ${route} ${source} ${dest} ${window}`;
    const id=await setup(source),res=await move(route,[id],{destination_date:dest,start_time:'10:00'});
    check(name+': movement accepted',res.ok===true,res);
    if(!res.ok){evidence.push({name,res});continue;}
    const before=[byId(id)];
    check(name+': manual override stamped atomically',before[0].source==='c24-mirror:manual',before);
    let since='2026-10-01',until='2026-10-20';
    if(window==='origin-only')since=until='2026-10-05';
    if(window==='destination-only'){since=until=dest;classes.push(cls({class_id:'qa_nonempty',user_id:'unknown_fixture',date:dest}));}
    const first=await sync(since,until);assertProtected(name+' first',[id],before,first);
    const second=await sync(since,until);assertProtected(name+' repeat',[id],before,second);
    evidence.push({name,movement:res,before,first,second,after:all()});
  }
  // 2. Same-day edits and undo on either side of a sync run.
  for(const route of ['direct','group','single','approval']) {
    for(const patch of [{teacher_id:'2'},{start_time:'10:00'},{teacher_id:'2',start_time:'10:00'}]) {
      const name=`same-date ${route} ${JSON.stringify(patch)}`,id=await setup(),res=await move(route,[id],patch),before=[byId(id)],r=await sync();
      check(name+': movement accepted',res.ok===true,res);assertProtected(name,[id],before,r);evidence.push({name,res,r,rows:all()});
    }
    for(const source of ['c24-mirror','c24-mirror:manual'])for(const dest of ['2026-10-04','2026-10-06'])for(const timing of ['before-sync','after-sync']) {
      const name=`undo ${route} ${source} ${dest} ${timing}`,id=await setup(source),res=await move(route,[id],{destination_date:dest,start_time:'10:00'});
      const middle=timing==='after-sync'?await sync():null;
      const undo=await move(route,[id],{destination_date:'2026-10-05',start_time:'09:20'},res.move_versions);
      check(name+': move and undo both accepted',res.ok===true&&undo.ok===true,{res,middle,undo});
      const before=[byId(id)],last=await sync();
      check(name+': original identity restored',before[0]?.scheduled_date==='2026-10-05'&&before[0]?.start_time==='09:20'&&all().length===1,{before,last,rows:all()});
      assertProtected(name,[id],before,last);evidence.push({name,res,middle,undo,last,rows:all()});
    }
  }
  // 3. Group movement: different students keep separate immutable Cafe24 IDs.
  for(const dest of ['2026-10-04','2026-10-06'])for(const window of ['original-inclusive','destination-only']) {
    reset();classes=[cls(),cls({class_id:'qa_second',user_id:'student_b'})];await sync();
    const ids=all().map(r=>r.id),name=`two-member group ${dest} ${window}`;
    const res=await move('group',ids,{destination_date:dest,start_time:'10:00',teacher_id:'2'}),before=ids.map(byId);
    check(name+': whole group moved',res.ok===true&&res.count===2,res);
    if(window==='destination-only')classes.push(cls({class_id:'qa_nonempty',user_id:'unknown_fixture',date:dest}));
    const first=window==='destination-only'?await sync(dest,dest):await sync();assertProtected(name,ids,before,first);
    const second=window==='destination-only'?await sync(dest,dest):await sync();assertProtected(name+' repeat',ids,before,second);evidence.push({name,res,first,second,rows:all()});
  }
  // 4. Cancellation is an explicit manual decision; it must not resurrect at another date.
  for(const date of ['2026-10-05','2026-10-06'])for(const window of ['original-inclusive','origin-only','destination-only']) {
    const id=await setup('c24-mirror:manual',{status:'cancelled',scheduled_date:date}),before=[byId(id)],name=`cancelled manual ${date} ${window}`;
    if(window==='destination-only')classes.push(cls({class_id:'qa_nonempty',user_id:'unknown_fixture',date}));
    const r=window==='origin-only'?await sync('2026-10-05','2026-10-05'):window==='destination-only'?await sync(date,date):await sync();
    assertProtected(name,[id],before,r);evidence.push({name,r,rows:all()});
  }
  // 5. A valid different ID on the same student's day must not be swallowed by a blanket date lock.
  for(const status of ['active','cancelled']) {
    const id=await setup('c24-mirror:manual',{status,start_time:'10:00'}),before=byId(id);
    classes.push(cls({class_id:'qa_distinct',time:'11:00'}));
    const r=await sync(),rows=all(),name=`different class ID same UID/day ${status}`;
    check(name+': original override unchanged',stable(byId(id))===stable(before),{r,rows});
    check(name+': distinct lesson created once',r.applied?.created===1&&rows.length===2&&rows.some(x=>x.notes==='c24:qa_distinct'&&x.start_time==='11:00'),{r,rows});
    const repeated=await sync();check(name+': repeat remains two rows',repeated.applied?.created===0&&all().length===2,{repeated,rows:all()});evidence.push({name,r,repeated,rows:all()});
  }
  // 6. Identity-read failure is not evidence of absence. Future implementation may throw
  // or report errors; either is accepted, provided no class data changed.
  for(const mode of ['throw','unsuccessful','malformed']) {
    const id=await setup('c24-mirror:manual',{scheduled_date:'2026-10-06'}),before=stable(all());let hits=0;
    fault={method:'all',mode,match(sql){const hit=/FROM class_schedules\b/.test(sql);if(hit)hits++;return hit;}};
    const r=await sync();fault=null;
    check('identity read '+mode+': injection reached actual query',hits>0,{hits,r});
    check('identity read '+mode+': no schedule mutation',stable(all())===before,{r,rows:all()});
    check('identity read '+mode+': failure visible',outcomeVisible(r),r);evidence.push({name:'identity read '+mode,hits,r,rows:all()});
  }
  // 7. Real asynchronous interfaces permit movement after the sync's old-row read.
  for(const flavor of ['moved-then-same-day-edit','stale-sync-update','stale-sync-cancel']) {
    const id=await setup();
    if(flavor==='moved-then-same-day-edit')await move('group',[id],{destination_date:'2026-10-06'});
    else classes=flavor==='stale-sync-update'?[cls({teacher_id:'38'})]:[cls({class_id:'qa_nonempty',user_id:'unknown_fixture'})];
    let hookResult=null,afterMove=null;
    afterScheduleRead=async()=>{hookResult=await move('group',[id],flavor==='moved-then-same-day-edit'?{start_time:'10:00'}:{destination_date:'2026-10-06',start_time:'10:00'});afterMove=byId(id);};
    const r=await sync();
    check('interleaving '+flavor+': movement committed at read boundary',hookResult?.ok===true,{hookResult,r});
    check('interleaving '+flavor+': one row and committed override survives',all().length===1&&afterMove&&stable(byId(id))===stable(afterMove),{afterMove,r,rows:all()});
    const next=await sync();check('interleaving '+flavor+': next sync stays stable',all().length===1&&stable(byId(id))===stable(afterMove)&&next.applied?.created===0,{next,rows:all()});
    evidence.push({name:'interleaving '+flavor,hookResult,afterMove,r,next,rows:all()});
  }

  // Full Worker fetch entrypoint: detect router/auth allowlist regressions as well.
  const { createRequire } = await import('node:module');
  const require = createRequire(join(ROOT, 'cloudflare-deploy/package.json'));
  const bundled = require('esbuild').buildSync({entryPoints:[join(SRC,'index.ts')],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'}).outputFiles[0].text;
  const worker = (await import('data:text/javascript;base64,'+Buffer.from(bundled).toString('base64'))).default;
  for(const route of ['group','single']) {
    const id=await setup(), expected={[id]:scheduleMoveVersion(byId(id))};
    const path=route==='group'?'/api/admin/class-schedules/move':'/api/admin/class-schedules/'+id;
    const body=route==='group'?{ids:[id],expected,patch:{destination_date:'2026-10-06',start_time:'10:00'}}:{expected,scheduled_date:'2026-10-06',start_time:'10:00'};
    const response=await worker.fetch(req('PATCH',path,body),env,{waitUntil(){},passThroughOnException(){}}),res=await response.json(),before=[byId(id)];
    check('Worker '+route+': authenticated movement reaches handler',response.status===200&&res.ok===true,{status:response.status,res});
    const r=await sync();assertProtected('Worker '+route,[id],before,r);evidence.push({name:'Worker '+route,res,r,rows:all()});
  }
  // 8. Fail-closed identity ownership: no guessed UID or duplicate origin authority.
  for(const collision of ['UID mismatch','two same-ID same-UID manual rows','two same-ID different-UID manual rows']) {
    const id=await setup('c24-mirror:manual',{scheduled_date:'2026-10-06',...(collision==='UID mismatch'?{user_id:'student_b'}:{})});
    if(collision.startsWith('two'))seed({source:'c24-mirror:manual',notes:'c24:qa_original',scheduled_date:'2026-10-07',user_id:collision.includes('different-UID')?'student_b':'student_a'});
    const before=all(),r=await sync();
    check(collision+': no durable row changes',stable(all())===stable(before),{r,rows:all()});
    check(collision+': visible conflict and no successful writes',r.rows?.some(x=>x.verdict==='conflict') || r.report?.rows?.some(x=>x.verdict==='conflict') || r.counts?.conflict>0 || r.summary?.conflict>0,{r});
    evidence.push({name:collision,before,r,rows:all()});
  }
  for(const class_id of ['',null,'bad/id',' spaced ','qa_original qa_other']) {
    reset();classes=[cls({class_id})];const r=await sync();
    check('invalid upstream ID '+JSON.stringify(class_id)+': creates no schedule',all().length===0&&r.applied?.created===0,{r,rows:all()});
  }
  // The identity may appear after every planning read but before INSERT executes.
  for(const source of ['c24-mirror','c24-mirror:manual']) for(const notes of ['c24:qa_original','memo c24:qa_original · 보강']) for(const user_id of ['student_a','student_b']) {
    reset();classes=[cls()];let protectedId=null;
    beforeClassInsert=()=>{protectedId=seed({source,notes,user_id,scheduled_date:'2026-10-25'});};
    const r=await sync(),rows=all();
    check('valid origin after-plan '+source+' '+notes+' '+user_id+': new creation withheld without false success',protectedId&&rows.length===1&&rows[0].id===protectedId&&rows[0].scheduled_date==='2026-10-25'&&r.applied?.created===0&&outcomeVisible(r),{r,rows});
  }
  for(const control of [{source:'c24-mirror:manual',notes:'c24:qa_original_extra'}, {source:'c24-mirror:manual',notes:'c24:different'}, {source:'adm-enroll:fixture',notes:'c24:qa_original'}]) {
    reset();classes=[cls()];
    beforeClassInsert=()=>seed({...control,scheduled_date:'2026-10-25'});
    const r=await sync();
    check('after-plan negative control '+JSON.stringify(control)+': unrelated origin remains eligible',all().length===2&&r.applied?.created===1&&r.errors?.length===0,{r,rows:all()});
  }
  // Corrupt NUL notes cannot bypass the JavaScript/SQLite token boundary mismatch.
  for(const notes of ['c24:qa_original\0bad','\0 c24:qa_original']) for(const source of ['c24-mirror','c24-mirror:manual']) {
    const id=await setup(source,{notes}),before=all(),r=await sync();
    check('NUL authoritative read '+source+' '+JSON.stringify(notes)+': fails visibly without mutation',outcomeVisible(r)&&stable(all())===stable(before),{r,rows:all()});
    reset();classes=[cls()];let inserted=null;
    beforeClassInsert=()=>{inserted=seed({source,notes,scheduled_date:'2026-10-25'});};
    const raced=await sync();
    check('NUL after-plan guard '+source+' '+JSON.stringify(notes)+': no duplicate or false successful write',inserted&&all().length===1&&raced.applied?.created===0&&outcomeVisible(raced),{raced,rows:all()});
  }
  // Missing origin identity cannot be promoted into a cross-date manual owner.
  for(const route of ['direct','group','single','approval']) for(const notes of [null,'','c24:','c24:qa_original c24:other']) {
    const id=await setup('c24-mirror',{notes}),before=byId(id),r=await move(route,[id],{destination_date:'2026-10-06'});
    check('untrusted cross-date '+route+' '+JSON.stringify(notes)+': reject with row unchanged',r.ok===false&&r.error==='mirror_identity_missing'&&stable(byId(id))===stable(before),{r,row:byId(id)});
    if(route==='approval')check('untrusted approval remains pending '+JSON.stringify(notes),sq.prepare('SELECT status FROM schedule_change_requests WHERE id=?').get(r.request_id)?.status==='pending',r);
  }
  // Existing approval policy applies before and after the new manual stamp.
  for(const source of ['c24-mirror','c24-mirror:manual']) {
    const id=await setup(source),before=byId(id),denied=await move('approval',[id],{destination_date:'2026-10-06',teacher_id:'2'});
    check('approval date+teacher policy '+source+': denied without consuming request',denied.ok===false&&denied.error==='teacher_not_changed'&&stable(byId(id))===stable(before)&&sq.prepare('SELECT status FROM schedule_change_requests WHERE id=?').get(denied.request_id)?.status==='pending',{denied,row:byId(id)});
  }
  {
    const id=await setup(),first=await move('approval',[id],{destination_date:'2026-10-06'}),middle=byId(id),second=await move('approval',[id],{destination_date:'2026-10-07',teacher_id:'2'});
    check('date-only approval followed by date+teacher cannot bypass policy',first.ok===true&&middle.source==='c24-mirror:manual'&&second.error==='teacher_not_changed'&&stable(byId(id))===stable(middle),{first,middle,second});
    const direct=await move('group',[id],{destination_date:'2026-10-07',teacher_id:'2'});
    check('direct timetable retains authorized date+teacher capability',direct.ok===true&&byId(id).teacher_id==='2'&&byId(id).scheduled_date==='2026-10-07',{direct,row:byId(id)});
  }
  // Raw evidence is kept separate from immutable baseline files.
  const hashesAfter = hashes();
  check('source files remained unchanged during harness run',JSON.stringify(hashesBefore)===JSON.stringify(hashesAfter),{hashesBefore,hashesAfter});
  const summary={pass:results.filter(x=>x.pass).length,fail:results.filter(x=>!x.pass).length,probes:probes.length};
  writeFileSync(process.env.MIRROR_QA_REPORT || join(tmpdir(), 'c24-mirror-move-sync-' + process.pid + '.json'),JSON.stringify({source:ROOT,hashesBefore,hashesAfter,summary,externalCalls,network:'global fetch always throws; mocked synthetic Cafe24 READ responses only',contract:'User-approved stable Cafe24 origin-ID manual ownership; offline verification only',results,evidence,probes},null,2));
  await new Promise(resolve=>process.stdout.write('\n@@RESULTS@@'+JSON.stringify(results)+'\n',resolve));process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'smav-'));
let pass = 0, fail = 0;
try {
  writeFileSync(join(tmp, 'hooks.mjs'), `import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
 if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
  const u = new URL(spec + '.ts', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
 } return next(spec, ctx);
}`);
  writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF],
    { encoding: 'utf8', env: { ...process.env, SMAV_CHILD: '1' }, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  const marker = child.stdout?.lastIndexOf('@@RESULTS@@') ?? -1;
  if (marker < 0) { fail++; console.log('FAIL harness child crashed\n' + child.stderr + '\n' + child.stdout); }
  else {
    for (const result of JSON.parse(child.stdout.slice(marker + '@@RESULTS@@'.length).trim())) {
      if (result.pass) { pass++; console.log('PASS ' + result.name); }
      else { fail++; console.log('FAIL ' + result.name + ' — ' + result.detail.slice(0,700)); }
    }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`\nc24_mirror_move_sync_harness: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
