/**
 * PR1412 restore safety regression, through the real admin handler.
 * Real TypeScript imports, real SQLite, real authentication and SQL. No live APIs.
 * D1 reads can be failed/malformed independently to prove fail-closed behavior.
 * Same-slot restore remains blocked pending policy; authorized interval rules reuse the strict move helper.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const localRoot = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(process.env.RESTORE_AUDIT_SOURCE || (existsSync(join(localRoot, 'cloudflare-deploy/src/api-admin.ts')) ? localRoot : fileURLToPath(new URL('../../source', import.meta.url))));
const SRC = join(ROOT, 'cloudflare-deploy/src');
const SELF = fileURLToPath(import.meta.url);

if (process.env.RESTORE_AUDIT_CHILD === '1') {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
  const RealDate = Date;
  const NOW = RealDate.parse('2026-10-04T12:00:00+09:00');
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this harness'); };
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  let fault = null, afterFirst = null, beforeBatch = null, afterBatch = null;
  const batches = [], snapshotSizes = [];
  const writes = [];
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  let faultHits = 0;
  const injected = (sql, method, args) => {
    if (!fault || fault.method !== method || !fault.match(sql, args)) return null;
    faultHits++;
    if (fault.mode === 'throw') throw new Error('injected availability read failure');
    return fault.mode === 'unsuccessful' ? { success: false, results: [] } : { success: true };
  };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a.map(norm)),
    async first(col) {
      const bad = injected(sql, 'first', args); if (bad) return bad;
      const row = sq.prepare(sql).get(...args); const out = row ? (col ? row[col] : { ...row }) : null;
      if(afterFirst?.match(sql)) { const hook=afterFirst;afterFirst=null;hook.run(); }
      return out;
    },
    async all() {
      const bad = injected(sql, 'all', args); if (bad) return bad;
      const out = { success: true, results: sq.prepare(sql).all(...args).map(r => ({ ...r })), meta: {} };
      if(/json_group_array\(json_array/.test(sql) && typeof out.results[0]?.value==='string') snapshotSizes.push({bytes:new TextEncoder().encode(out.results[0].value).byteLength,characters:out.results[0].value.length});
      if(afterFirst?.match(sql)) { const hook=afterFirst;afterFirst=null;hook.run(); }
      return out;
    },
    async run() {
      writes.push({ sql, args });
      const bad = injected(sql, 'run', args); if (bad) return bad;
      const r = sq.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async raw() { return sq.prepare(sql).all(...args).map(Object.values); }
  });
  const DB = { prepare: sql => stmt(sql), async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(stmts) { batches.push(stmts.map(s=>({sql:s.sql,bindCount:s.args.length})));if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}sq.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of stmts){const r=await s.run();if(r?.success===false)throw new Error('injected D1 batch statement failure');out.push(r);}sq.exec('COMMIT');if(afterBatch){const hook=afterBatch;afterBatch=null;return hook(out);}return out;}catch(e){sq.exec('ROLLBACK');throw e;} } };
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
    try {
      const res = await handleAdminApi(r, new URL(r.url), env, { waitUntil() {}, passThroughOnException() {} });
      return res ? { status: res.status, body: await res.json() } : { status: 0, body: { error: 'no_route' } };
    } catch (e) { return { status: 0, body: { error: 'handler_threw', message: String(e?.message || e) } }; }
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
  const reset = () => { fault = null; afterFirst = beforeBatch = afterBatch = null; batches.length=0; snapshotSizes.length=0; faultHits = 0; sq.exec('DELETE FROM class_schedules; DELETE FROM teacher_unavailability; DELETE FROM calendar_events; DELETE FROM class_audit_log;'); writes.length = 0; };
  const snapshot = () => JSON.stringify(sq.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const classWrites = () => writes.filter(x => /UPDATE\s+class_schedules|INSERT\s+INTO\s+class_audit_log/i.test(x.sql));
  const { findScheduleMoveConflicts, findScheduleConflicts } = await imp('schedule-conflict.ts');
  const restore = (id, token = 'tok_admin', body = {}) => call('POST', '/api/admin/class-schedules/' + id, { action: 'restore', ...body }, token);
  const guardEmpty = () => !sq.prepare("SELECT name FROM sqlite_master WHERE name='schedule_move_guard'").get() || sq.prepare('SELECT COUNT(*) AS n FROM schedule_move_guard').get().n===0;
  const auditCount = () => sq.prepare('SELECT COUNT(*) AS n FROM class_audit_log').get().n;
  const row = id => ({ ...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id) });
  const comparison = async (name, target = {}, existing = {}, { expected, token, body, note } = {}) => {
    reset();
    const id = seed({ status: 'cancelled', source: 'c24-mirror:manual', ...target });
    if (existing !== null) seed({ user_id: 'student_b', teacher_id: '1', ...existing });
    const before = row(id);
    const strict = await findScheduleMoveConflicts(env, before, 'ALPHA');
    const expectedAllowed = expected ?? !strict;
    writes.length = 0;
    const result = await restore(id, token, body);
    const after = row(id);
    const audits = sq.prepare('SELECT COUNT(*) AS n FROM class_audit_log WHERE schedule_id=?').get(id).n;
    const allowed = result.status === 200 && result.body.ok === true && after.status === 'active';
    check(name, guardEmpty() && allowed === expectedAllowed && (allowed ? audits === 1 && after.source === before.source : after.status === 'cancelled' && audits === 0), {
      expectedAllowed, actualAllowed: allowed, result, strict: strict && { error: strict.error, student: strict.conflicts?.map(r => r.id), teacher: strict.teacher_conflicts?.map(r => r.id) }, audits, note,
    });
  };

  await comparison('teacher partial overlap: earlier existing 09:00–09:30, restore 09:20–09:40', {}, {start_time:'09:00',duration_min:30});
  await comparison('teacher partial overlap: later existing 09:30–09:50, restore 09:20–09:40', {}, {start_time:'09:30'});
  await comparison('student partial overlap with a different teacher', {}, {user_id:'student_a',teacher_id:'2',start_time:'09:10'});
  await comparison('same teacher exact start and duration, different student, no group marker', {}, {}, {expected:false,note:'Same-slot restore is intentionally blocked. The real strict helper allows this generically, including class_type regular; no group flag exists in its decision.'});
  await comparison('same teacher exact start and duration for leveltest rows', {class_type:'leveltest'}, {class_type:'leveltest'}, {expected:false,note:'Same-slot restore is intentionally blocked. Demonstrates absence of class_type policy, not an endorsement of shared level tests.'});
  await comparison('same student exact start and duration remains blocked', {}, {user_id:'student_a'});
  await comparison('same student exact slot on a different teacher remains blocked', {}, {user_id:'student_a',teacher_id:'2'});
  await comparison('same teacher same start unequal duration remains blocked', {}, {duration_min:30});
  await comparison('earlier adjacent lesson ending exactly at 09:20 is allowed', {}, {start_time:'09:00'});
  await comparison('later adjacent lesson starting exactly at 09:40 is allowed', {}, {start_time:'09:40'});
  await comparison('other student and other teacher partial overlap is irrelevant', {}, {teacher_id:'2',start_time:'09:10'});
  await comparison('same teacher partial overlap on another date is irrelevant', {}, {scheduled_date:'2026-10-06',start_time:'09:10'});
  await comparison('placeholder LMS exact slot does not block', {}, {user_id:'lms'});
  await comparison('placeholder seed partial overlap does not block', {}, {user_id:'type_seed',start_time:'09:10'});
  await comparison('cancelled exact duplicate does not block', {}, {user_id:'student_a',status:'cancelled'});
  await comparison('NULL-status same-student exact slot is conservatively blocked', {}, {user_id:'student_a',status:null});
  await comparison('completed same-student exact slot preserves existing restore block', {}, {user_id:'student_a',status:'completed'}, {expected:false,note:'Existing status semantics differ: restore status != cancelled versus strict active or null. Do not silently change lifecycle policy.'});
  await comparison('same student H:MM spelling still denotes same time', {}, {user_id:'student_a',start_time:'9:20'});
  await comparison('active recurring teacher overlap after starts_on is blocked', {}, {schedule_kind:'recurring',scheduled_date:null,day_of_week:'Mon',starts_on:'2026-10-05',start_time:'09:10'});
  await comparison('active recurring student overlap after starts_on is blocked', {}, {user_id:'student_a',teacher_id:'2',schedule_kind:'recurring',scheduled_date:null,day_of_week:'1',starts_on:'2026-10-05',start_time:'09:10'});
  await comparison('active recurring teacher before starts_on is allowed', {}, {schedule_kind:'recurring',scheduled_date:null,day_of_week:'Mon',starts_on:'2026-10-12',start_time:'09:10'});
  await comparison('active recurring teacher different weekday is allowed', {}, {schedule_kind:'recurring',scheduled_date:null,day_of_week:'Tue',starts_on:'2026-10-01',start_time:'09:10'});
  await comparison('recurring teacher exact slot stays blocked pending group policy', {}, {schedule_kind:'recurring',scheduled_date:null,day_of_week:'Mon',starts_on:'2026-10-05'}, {expected:false,note:'Existing dated exact-slot restore block conservatively extends to recurring occupants.'});
  await comparison('explicit date overrides recurring marker and weekday', {}, {schedule_kind:'recurring',scheduled_date:'2026-10-06',day_of_week:'Mon',start_time:'09:10'});
  await comparison('overnight target overlap next date is blocked', {start_time:'23:50'}, {scheduled_date:'2026-10-06',start_time:'00:00'});
  await comparison('previous-day overnight overlap is blocked', {scheduled_date:'2026-10-06',start_time:'00:05'}, {start_time:'23:50'});
  await comparison('overnight adjacency remains allowed', {start_time:'23:50'}, {scheduled_date:'2026-10-06',start_time:'00:10'});
  await comparison('weekly cancelled target stays ineligible for restore', {scheduled_date:null,schedule_kind:'recurring',day_of_week:'Mon'}, null, {expected:false});
  await comparison('past dated target stays ineligible for restore', {scheduled_date:'2026-10-03'}, null, {expected:false});
  await comparison('fresh empty slot restores and preserves manual source', {}, null);
  await comparison('force does not permit same-student exact duplicate', {}, {user_id:'student_a'}, {body:{force:true}});
  await comparison('force does not make partial overlap acceptable', {}, {start_time:'09:10'}, {body:{force:true}});


  for (const invalid of [
    {start_time:'25:00'}, {start_time:'09:20:00'}, {duration_min:0}, {duration_min:-10}, {duration_min:20.5}, {duration_min:241},
    {scheduled_date:'2026-11-31'}, {scheduled_date:'2026-10-05T09:20:00'},
  ]) {
    reset();const id=seed({status:'cancelled',...invalid});const before=snapshot();writes.length=0;const result=await restore(id);
    check('invalid target fails closed '+JSON.stringify(invalid), result.status===409 && result.body.error==='lookup_failed' && snapshot()===before && classWrites().length===0, result);
  }
  for (const invalid of [
    {start_time:'garbage'}, {duration_min:0}, {duration_min:-10}, {duration_min:20.5}, {duration_min:241},
    {scheduled_date:'2026-11-31'}, {scheduled_date:null,day_of_week:null},
    {scheduled_date:null,day_of_week:'Mon garbage'}, {scheduled_date:null,day_of_week:'Mon',starts_on:'2026-11-31'},
  ]) {
    reset();const id=seed({status:'cancelled'});seed({user_id:'student_b',...invalid});const before=snapshot();writes.length=0;const result=await restore(id);
    check('invalid peer fails closed '+JSON.stringify(invalid), result.status===409 && result.body.error==='lookup_failed' && snapshot()===before && classWrites().length===0, result);
  }
  await comparison('legacy NULL duration uses canonical 20-minute adjacency',{}, {start_time:'09:00',duration_min:null});
  await comparison('legacy NULL duration overlapping target remains blocked',{}, {start_time:'09:10',duration_min:null});
  await comparison('unknown non-cancelled peer status remains occupied',{}, {user_id:'student_a',status:'unknown'}, {expected:false});
  await comparison('placeholder names are case insensitive',{}, {user_id:'LMS'});


  reset();
  {
    const id=seed({status:'cancelled'});seed({user_id:'student_b',schedule_kind:'recurring',scheduled_date:null,day_of_week:'Mon',start_time:'09:10'});
    sq.exec('ALTER TABLE class_schedules DROP COLUMN starts_on');
    const before=snapshot();writes.length=0;const result=await restore(id);
    check('legacy schema without optional starts_on still detects recurring conflict',result.status===409 && result.body.error==='slot_taken' && snapshot()===before && classWrites().length===0,result);
    sq.exec('ALTER TABLE class_schedules ADD COLUMN starts_on TEXT');
  }


  {
    const originalColumns=sq.prepare('PRAGMA table_info(class_schedules)').all().length;
    const added=[];
    for(let n=originalColumns;n<32;n++) {const name='restore_capacity_'+n;sq.exec(`ALTER TABLE class_schedules ADD COLUMN ${name} TEXT`);added.push(name);}
    reset();let id=seed({status:'cancelled'});let result=await restore(id);
    check('D1 exact 32-column boundary succeeds with at most 38 guard binds',result.status===200 && batches.length===1 && batches[0][0].bindCount===38 && guardEmpty(),{result,columns:sq.prepare('PRAGMA table_info(class_schedules)').all().length,binds:batches[0]?.[0]?.bindCount});
    sq.exec('ALTER TABLE class_schedules ADD COLUMN restore_capacity_over TEXT');
    reset();id=seed({status:'cancelled'});const prior=snapshot();
    fault={method:'all',match:sql=>/json_group_array\(json_array/.test(sql),mode:'throw'};
    result=await restore(id);
    check('D1 33-column schema fails closed before unsupported snapshot SQL',result.status===409 && result.body.error==='lookup_failed' && snapshot()===prior && faultHits===0 && batches.length===0 && classWrites().length===0,result);
    sq.exec('ALTER TABLE class_schedules DROP COLUMN restore_capacity_over');
    for(const name of added.reverse())sq.exec(`ALTER TABLE class_schedules DROP COLUMN ${name}`);
  }
  for(const [name,count,expectedAllowed] of [['below ceiling',499500,true],['above ceiling',500000,false]]) {
    reset();const id=seed({status:'cancelled'});seed({user_id:'student_b',start_time:'10:00',notes:'한'.repeat(count)});
    const prior=snapshot();const result=await restore(id);const size=snapshotSizes[0];
    check('UTF-8 snapshot '+name,expectedAllowed
      ? result.status===200 && size?.bytes<1_500_000 && size?.bytes>1_490_000 && guardEmpty()
      : result.status===409 && result.body.error==='lookup_failed' && size?.bytes>1_500_000 && size?.characters<1_500_000 && snapshot()===prior && batches.length===0 && classWrites().length===0,
      {result,size});
  }
  reset();
  {
    const id=seed({status:'cancelled',notes:'한'.repeat(500000)});const prior=snapshot();const result=await restore(id);
    check('oversized source proof fails before snapshot query or binding',result.status===409 && result.body.error==='lookup_failed' && snapshot()===prior && snapshotSizes.length===0 && batches.length===0 && classWrites().length===0,result);
  }

  // Focused failure behavior: no writes when lookup throws; normal strict reads fail closed.
  for (const [name, method, match, mode, routeExpected] of [
    ['source lookup throws', 'first', sql=>/SELECT \* FROM class_schedules WHERE id/.test(sql), 'throw', 'not_found'],
    ['candidate lookup throws', 'all', sql=>/SELECT \* FROM class_schedules WHERE id <>/.test(sql), 'throw', 'lookup_failed'],
    ['candidate lookup unsuccessful', 'all', sql=>/SELECT \* FROM class_schedules WHERE id <>/.test(sql), 'unsuccessful', 'lookup_failed'],
    ['candidate lookup malformed', 'all', sql=>/SELECT \* FROM class_schedules WHERE id <>/.test(sql), 'malformed', 'lookup_failed'],
  ]) {
    reset(); const id=seed({status:'cancelled'}); const before=snapshot(); writes.length=0;
    fault={method,match,mode}; const result=await restore(id);
    check(name+' fails closed without schedule/audit write', faultHits>0 && result.body.error===routeExpected && snapshot()===before && classWrites().length===0, {result,faultHits});
  }
  for (const mode of ['throw','unsuccessful','malformed']) {
    reset(); const id=seed({status:'cancelled'}); fault={method:'all',match:sql=>/FROM class_schedules/.test(sql),mode};
    let threw=false; try { await findScheduleMoveConflicts(env,row(id),'ALPHA'); } catch { threw=true; }
    check('normal strict helper fails closed on '+mode+' overlap result', threw && faultHits>0, {threw,faultHits});
  }
  for (const token of ['tok_hq_t_alpha','tok_branch_test','tok_unknown_scope','']) {
    reset(); const id=seed({status:'cancelled'}); const before=snapshot(); writes.length=0;
    const result=await restore(id,token);
    check('restore rejects unauthorized '+(token||'anonymous'), [401,403].includes(result.status) && snapshot()===before && classWrites().length===0, result);
  }
  // Explain why the old registration helper cannot supply strict recurrence/failure guarantees.
  reset(); const id=seed({status:'cancelled'}); seed({user_id:'student_b',teacher_id:'1',schedule_kind:'recurring',scheduled_date:null,day_of_week:'Mon',starts_on:'2026-10-05',start_time:'09:10'});
  const query={kind:'one_off',userId:'student_a',teacherId:'1',schedDate:'2026-10-05',startTime:'09:20',durationMin:20,excludeId:id};
  const registration=await findScheduleConflicts(env,query);
  check('older registration helper misses dated versus recurring conflict (known limitation)', registration.has===false, registration);
  fault={method:'all',match:sql=>/FROM class_schedules/.test(sql),mode:'throw'};
  const failOpen=await findScheduleConflicts(env,query);
  check('older registration helper is fail-open on overlap read failure (known limitation)', failOpen.has===false && faultHits>0, {failOpen,faultHits});


  {
  // Characterizations below report separate limitations; they are not assertions of new policy.
  for(const type of ['weekly_break','vacation']) {
    reset();const id=seed({status:'cancelled'});
    if(type==='weekly_break') block({teacher_id:'1'}); else vacation({teacher_name:'ALPHA'});
    const strict=await findScheduleMoveConflicts(env,row(id),'ALPHA'); const result=await restore(id);
    check('KNOWN LIMITATION: restore does not consult '+type, strict?.error==='teacher_unavailable' && result.status===200, {strict:strict?.error,result});
  }

  reset();let id=seed({status:'cancelled'});
  afterFirst={match:sql=>/SELECT \* FROM class_schedules WHERE id <>/.test(sql),run:()=>seed({user_id:'student_a',teacher_id:'2'})};
  let result=await restore(id);
  check('candidate insertion after lookup rejects guarded restore', result.status===409 && result.body.error==='schedule_changed' && row(id).status==='cancelled' && auditCount()===0 && guardEmpty(),result);

  for(const [name,change] of [
    ['teacher overlap inserted', id=>seed({user_id:'late_student',start_time:'09:10'})],
    ['student overlap inserted', id=>seed({user_id:'student_a',teacher_id:'2',start_time:'09:10'})],
    ['recurring overlap inserted', id=>seed({user_id:'late_student',schedule_kind:'recurring',scheduled_date:null,day_of_week:'Mon',start_time:'09:10'})],
    ['source start changes', id=>insert("UPDATE class_schedules SET start_time='10:00' WHERE id=?",id)],
    ['source duration changes', id=>insert('UPDATE class_schedules SET duration_min=30 WHERE id=?',id)],
    ['source student changes', id=>insert("UPDATE class_schedules SET user_id='other_student' WHERE id=?",id)],
    ['source teacher changes', id=>insert("UPDATE class_schedules SET teacher_id='2' WHERE id=?",id)],
    ['source date changes', id=>insert("UPDATE class_schedules SET scheduled_date='2026-10-06' WHERE id=?",id)],
    ['source starts_on changes', id=>insert("UPDATE class_schedules SET starts_on='2026-10-12' WHERE id=?",id)],
    ['source marker changes', id=>insert("UPDATE class_schedules SET source='edited' WHERE id=?",id)],
    ['source already restored', id=>insert("UPDATE class_schedules SET status='active' WHERE id=?",id)],
    ['source deleted', id=>insert('DELETE FROM class_schedules WHERE id=?',id)],
  ]) {
    reset();const id=seed({status:'cancelled'});let concurrentState='';
    beforeBatch=()=>{change(id);concurrentState=snapshot();};
    const result=await restore(id);
    check('race guard: '+name,result.status===409 && result.body.error==='schedule_changed' && snapshot()===concurrentState && auditCount()===0 && guardEmpty(),result);
  }
  for(const [name,initial,change] of [
    ['existing peer moves into interval',{start_time:'10:00'},peer=>insert("UPDATE class_schedules SET start_time='09:10' WHERE id=?",peer)],
    ['unrelated teacher becomes relevant',{teacher_id:'2',start_time:'09:10'},peer=>insert("UPDATE class_schedules SET teacher_id='1' WHERE id=?",peer)],
    ['placeholder becomes real student',{user_id:'lms',start_time:'09:10'},peer=>insert("UPDATE class_schedules SET user_id='real_student' WHERE id=?",peer)],
    ['cancelled peer becomes active',{status:'cancelled',start_time:'09:10'},peer=>insert("UPDATE class_schedules SET status='active' WHERE id=?",peer)],
    ['peer deleted after validation',{start_time:'10:00'},peer=>insert('DELETE FROM class_schedules WHERE id=?',peer)],
  ]) {
    reset();const id=seed({status:'cancelled'}), peer=seed({user_id:'student_b',...initial});let concurrentState='';
    beforeBatch=()=>{change(peer);concurrentState=snapshot();};
    const result=await restore(id);
    check('candidate membership guard: '+name,result.status===409 && result.body.error==='schedule_changed' && snapshot()===concurrentState && auditCount()===0 && guardEmpty(),result);
  }

  for (const [name,match] of [
    ['guard insert',sql=>/INSERT INTO schedule_move_guard/.test(sql)],
    ['restore update',sql=>/UPDATE class_schedules SET status='active'/.test(sql)],
    ['audit insert',sql=>/INSERT INTO class_audit_log/.test(sql)],
    ['guard cleanup',sql=>/DELETE FROM schedule_move_guard/.test(sql)],
  ]) {
    for(const mode of ['throw','unsuccessful']) {
      reset();const id=seed({status:'cancelled'});const prior=snapshot();
      fault={method:'run',match,mode};const result=await restore(id);
      check('batch rollback: '+name+' '+mode,result.status===503 && result.body.error==='restore_failed' && snapshot()===prior && auditCount()===0 && faultHits>0 && batches.length===1 && guardEmpty(),{result,faultHits});
    }
  }
  for(const mode of ['throw','unsuccessful']) {
    reset();id=seed({status:'cancelled'});
    fault={method:'run',match:sql=>/CREATE TABLE IF NOT EXISTS schedule_move_guard/.test(sql),mode};
    result=await restore(id);
    check('guard preparation '+mode+' leaves source and audit untouched',result.status===503 && row(id).status==='cancelled' && auditCount()===0 && guardEmpty(),result);
  }


  // Older route snapshots did not create this existing table; prepare its actual DDL for trigger-only fixtures.
  if(!sq.prepare("SELECT name FROM sqlite_master WHERE name='schedule_move_guard'").get())
    sq.exec(ddl(readFileSync(join(SRC,'class-schedule-move.ts'),'utf8'),'schedule_move_guard'));
  for(const [name,table,event] of [
    ['guard insert','schedule_move_guard','INSERT'],
    ['restore update','class_schedules','UPDATE'],
    ['audit insert','class_audit_log','INSERT'],
    ['guard cleanup','schedule_move_guard','DELETE'],
  ]) {
    reset();const id=seed({status:'cancelled'});const prior=snapshot();
    sq.exec(`CREATE TEMP TRIGGER ignore_restore_write BEFORE ${event} ON ${table} BEGIN SELECT RAISE(IGNORE); END`);
    const result=await restore(id);
    sq.exec('DROP TRIGGER ignore_restore_write');
    check('ignored-write assertion rolls back '+name,result.status===503 && result.body.error==='restore_failed' && snapshot()===prior && auditCount()===0 && guardEmpty(),result);
  }

  reset();id=seed({status:'cancelled'});let winningRestore=null;
  beforeBatch=async()=>{winningRestore=await restore(id);};
  result=await restore(id);
  check('two validated restore requests commit only once',winningRestore?.status===200 && result.status===409 && result.body.error==='schedule_changed' && row(id).status==='active' && auditCount()===1 && guardEmpty(),{winningRestore,losingRestore:result});
  const duplicate=await restore(id);
  check('repeat restore remains not_cancelled with no duplicate audit',duplicate.status===409 && duplicate.body.error==='not_cancelled' && auditCount()===1 && guardEmpty(),duplicate);

  reset();id=seed({status:'cancelled'});result=await restore(id);
  check('success uses one bounded prepared batch and existing guard schema',result.status===200 && batches.length===1 && batches[0].length===8 && batches[0].every(s=>s.bindCount<=100) && guardEmpty(),{result,statements:batches[0]});
  check('guard schema matches existing move definition',/token TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT schedule_move_snapshot CHECK\(valid=1\)/.test(sq.prepare("SELECT sql FROM sqlite_master WHERE name='schedule_move_guard'").get().sql),sq.prepare("SELECT sql FROM sqlite_master WHERE name='schedule_move_guard'").get());

  reset();id=seed({status:'cancelled'});afterBatch=()=>undefined;
  result=await restore(id);
  check('unconfirmed batch response is reported as failure without retrying',result.status===503 && row(id).status==='active' && auditCount()===1 && batches.length===1 && guardEmpty(),{result,note:'The synthetic server committed but lost its response. This proves no false success or implicit retry, not a rollback of a committed transaction.'});
  }
  process.stdout.write('\n@@RESULTS@@' + JSON.stringify(results) + '\n');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'restore-conflict-'));
let pass = 0, fail = 0, results = [];
try {
  writeFileSync(join(tmp, 'hooks.mjs'), `import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
 if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
  const u = new URL(spec + '.ts', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
 } return next(spec, ctx);
}`);
  writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);
  let fixtureRoot = ROOT;
  if(process.env.RESTORE_AUDIT_BASELINE) {
    fixtureRoot = join(tmp,'baseline-source');
    cpSync(SRC,join(fixtureRoot,'cloudflare-deploy/src'),{recursive:true});
    cpSync(resolve(process.env.RESTORE_AUDIT_BASELINE),join(fixtureRoot,'cloudflare-deploy/src/api-admin.ts'));
  }
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF],
    { encoding: 'utf8', env: { ...process.env, RESTORE_AUDIT_CHILD: '1', RESTORE_AUDIT_SOURCE: fixtureRoot }, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  const marker = child.stdout?.lastIndexOf('@@RESULTS@@') ?? -1;
  if (marker < 0) { fail++; console.log('FAIL harness child crashed\n' + child.stderr + '\n' + child.stdout); }
  else {
    results=JSON.parse(child.stdout.slice(marker + '@@RESULTS@@'.length).trim());
    for (const result of results) {
      if (result.pass) { pass++; console.log('PASS ' + result.name); }
      else { fail++; console.log('FAIL ' + result.name + ' — ' + JSON.stringify(result.detail)); }
    }
  }
  if(process.env.RESTORE_AUDIT_RESULTS) writeFileSync(process.env.RESTORE_AUDIT_RESULTS,JSON.stringify({source:ROOT,pass,fail,results},null,2)+'\n');
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`\nRestore actual-source safety: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
