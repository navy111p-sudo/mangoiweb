/**
 * Enrollment reopening safety regression, through the real admin handler.
 * Real TypeScript imports, real SQLite, real authentication and SQL. No live APIs.
 * D1 reads can be failed/malformed independently to prove fail-closed behavior.
 * Successful partial/skipped results stay supported; unknown facts and failed writes roll back.
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
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? undefined : JSON.parse(JSON.stringify(detail)) });
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
  const batches = [], snapshotSizes = [], queries = [];
  const writes = [];
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  let faultHits = 0;
  const injected = (sql, method, args) => {
    if (!fault || fault.method !== method || !fault.match(sql, args)) return null;
    faultHits++;
    if (fault.mode === 'throw') throw new Error('injected availability read failure');
    if (fault.mode === 'missing-success') return { results: sq.prepare(sql).all(...args).map(r => ({ ...r })) };
    return fault.mode === 'unsuccessful' ? { success: false, results: [] } : { success: true };
  };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a.map(norm)),
    async first(col) {
      queries.push({method:'first',sql,bindCount:args.length});
      const bad = injected(sql, 'first', args); if (bad) return bad;
      const row = sq.prepare(sql).get(...args); const out = row ? (col ? row[col] : { ...row }) : null;
      if(afterFirst?.match(sql)) { const hook=afterFirst;afterFirst=null;hook.run(); }
      return out;
    },
    async all() {
      queries.push({method:'all',sql,bindCount:args.length});
      const bad = injected(sql, 'all', args); if (bad) return bad;
      const out = { success: true, results: sq.prepare(sql).all(...args).map(r => ({ ...r })), meta: {} };
      if(/json_group_array\(json_array/.test(sql) && typeof out.results[0]?.value==='string') snapshotSizes.push({bytes:new TextEncoder().encode(out.results[0].value).byteLength,characters:out.results[0].value.length});
      if(afterFirst?.match(sql)) { const hook=afterFirst;afterFirst=null;hook.run(); }
      return out;
    },
    async run() {
      queries.push({method:'run',sql,bindCount:args.length});
      writes.push({ sql, args });
      const bad = injected(sql, 'run', args); if (bad) return bad;
      const r = sq.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async raw() { return sq.prepare(sql).all(...args).map(Object.values); }
  });
  const DB = { prepare: sql => stmt(sql), async exec(sql) { queries.push({method:'exec',sql,bindCount:0});sq.exec(sql); return { count: 1 }; },
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
  const reset = () => { queries.length=0;fault = null; afterFirst = beforeBatch = afterBatch = null; batches.length=0; snapshotSizes.length=0; faultHits = 0; sq.exec('DELETE FROM class_schedules; DELETE FROM teacher_unavailability; DELETE FROM calendar_events; DELETE FROM class_audit_log;'); writes.length = 0; };
  const snapshot = () => JSON.stringify(sq.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const classWrites = () => writes.filter(x => /UPDATE\s+class_schedules|INSERT\s+INTO\s+class_audit_log/i.test(x.sql));
  sq.exec(ddl(adminSrc, 'enrollments'));
  sq.exec('ALTER TABLE enrollments ADD COLUMN cancelled_class_ids TEXT');
  const enrollment = () => ({ ...sq.prepare('SELECT * FROM enrollments WHERE id=124').get() });
  const guardEmpty = () => !sq.prepare("SELECT name FROM sqlite_master WHERE name='schedule_move_guard'").get()
    || sq.prepare('SELECT COUNT(*) AS n FROM schedule_move_guard').get().n === 0;
  const auditCount = () => sq.prepare("SELECT COUNT(*) AS n FROM class_audit_log WHERE action='restore'").get().n;
  const allState = () => JSON.stringify({ schedules: sq.prepare('SELECT * FROM class_schedules ORDER BY id').all(), enrollment: enrollment() });
  const row = id => ({ ...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id) });
  const restore = (body = {}, token = 'tok_admin') => call('PATCH', '/api/admin/enrollments/124', { status: 'confirmed', ...body }, token);
  const setup = (target = {}) => {
    reset(); sq.exec('DELETE FROM enrollments');
    const id = seed({ status: 'cancelled', source: 'adm-enroll:124', ...target });
    insert(`INSERT INTO enrollments (id,student_user_id,student_name,status,created_at,updated_at,cancelled_class_ids)
      VALUES (124,'student_a','Student A','cancelled',?,?,?)`, NOW, NOW, JSON.stringify([id]));
    return id;
  };
  const save = ids => insert('UPDATE enrollments SET cancelled_class_ids=? WHERE id=124', JSON.stringify(ids));
  const comparison = async (name, target = {}, existing = null, expected = true) => {
    const id = setup(target);
    if (existing !== null) seed({ user_id: 'student_b', teacher_id: '1', ...existing });
    const before = row(id); writes.length = 0;
    const result = await restore();
    const restored = result.status === 200 && result.body.ok === true && row(id).status === 'active';
    check(name, restored === expected && result.status === 200 && !result.body.restore_failed
      && result.body.restored_classes === (expected ? 1 : 0) && result.body.restore_skipped === (expected ? 0 : 1)
      && enrollment().status === 'confirmed' && enrollment().cancelled_class_ids === null
      && row(id).source === before.source && auditCount() === (expected ? 1 : 0) && guardEmpty(), { result, before, after: row(id), enrollment: enrollment() });
  };
  await comparison('empty slot restores saved source row');
  await comparison('teacher earlier partial overlap is skipped', {}, { start_time:'09:10' }, false);
  await comparison('teacher later partial overlap is skipped', {}, { start_time:'09:30' }, false);
  await comparison('student partial overlap with another teacher is skipped', {}, { user_id:'student_a',teacher_id:'2',start_time:'09:10' }, false);
  await comparison('teacher full containment is skipped', {}, { start_time:'09:00',duration_min:60 }, false);
  await comparison('student full containment is skipped', { start_time:'09:00',duration_min:60 }, { user_id:'student_a',teacher_id:'2',start_time:'09:10' }, false);
  await comparison('teacher exact same slot stays skipped pending group policy', {}, {}, false);
  await comparison('same-slot leveltest stays skipped pending group policy', { class_type:'leveltest' }, { class_type:'leveltest' }, false);
  await comparison('same student exact slot stays skipped', {}, { user_id:'student_a' }, false);
  await comparison('earlier adjacency is allowed', {}, { start_time:'09:00' });
  await comparison('later adjacency is allowed', {}, { start_time:'09:40' });
  await comparison('student adjacency is allowed', {}, { user_id:'student_a',teacher_id:'2',start_time:'09:00' });
  await comparison('different student and teacher is irrelevant', {}, { teacher_id:'2',start_time:'09:10' });
  await comparison('different date is irrelevant', {}, { scheduled_date:'2026-10-06',start_time:'09:10' });
  await comparison('recurring teacher overlap after starts_on is skipped', {}, { scheduled_date:null,schedule_kind:'recurring',day_of_week:'Mon',starts_on:'2026-10-05',start_time:'09:10' }, false);
  await comparison('recurring student overlap after starts_on is skipped', {}, { user_id:'student_a',teacher_id:'2',scheduled_date:null,day_of_week:'1',starts_on:'2026-10-05',start_time:'09:10' }, false);
  await comparison('recurring teacher before starts_on is allowed', {}, { scheduled_date:null,day_of_week:'Mon',starts_on:'2026-10-12',start_time:'09:10' });
  await comparison('recurring teacher different weekday is allowed', {}, { scheduled_date:null,day_of_week:'Tue',starts_on:'2026-10-01',start_time:'09:10' });
  await comparison('explicit date overrides weekday marker', {}, { scheduled_date:'2026-10-06',day_of_week:'Mon',start_time:'09:10' });
  await comparison('overnight target overlaps next date', { start_time:'23:50' }, { scheduled_date:'2026-10-06',start_time:'00:00' }, false);
  await comparison('previous-day overnight teacher overlaps target', { scheduled_date:'2026-10-06',start_time:'00:05' }, { start_time:'23:50' }, false);
  await comparison('overnight student overlap crosses recurring date', { scheduled_date:'2026-10-06',start_time:'00:05' }, { user_id:'student_a',teacher_id:'2',scheduled_date:null,day_of_week:'Mon',starts_on:'2026-10-05',start_time:'23:50' }, false);
  await comparison('overnight starts_on prevents earlier occurrence', { scheduled_date:'2026-10-06',start_time:'00:05' }, { scheduled_date:null,day_of_week:'Mon',starts_on:'2026-10-12',start_time:'23:50' });
  await comparison('overnight adjacency is allowed', { start_time:'23:50' }, { scheduled_date:'2026-10-06',start_time:'00:10' });
  await comparison('legacy NULL duration retains 20-minute adjacency', {}, { start_time:'09:00',duration_min:null });
  await comparison('legacy NULL duration overlap is skipped', {}, { start_time:'09:10',duration_min:null }, false);
  await comparison('H:MM representation still overlaps', {}, { start_time:'9:10' }, false);
  await comparison('cancelled peer does not occupy slot', {}, { status:'cancelled' });
  await comparison('NULL-status peer conservatively occupies slot', {}, { status:null,start_time:'09:10' }, false);
  await comparison('completed non-cancelled peer still occupies slot', {}, { status:'completed',start_time:'09:10' }, false);
  await comparison('teacher LMS placeholder is excluded', {}, { user_id:'LMS',start_time:'09:10' });
  await comparison('teacher type_seed placeholder is excluded', {}, { user_id:'type_seed',start_time:'09:10' });
  await comparison('past source remains skipped', { scheduled_date:'2026-10-03' }, null, false);
  await comparison('weekly source remains skipped', { scheduled_date:null,day_of_week:'Mon' }, null, false);
  await comparison('today already-started source remains skipped', { scheduled_date:'2026-10-04',start_time:'11:59' }, null, false);

  {
    const first = setup(); const second = seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:'2026-10-06'});
    const past = seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:'2026-10-03'});
    const weekly = seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:null,day_of_week:'Mon'});
    const unsaved = seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:'2026-10-07'});
    const foreign = seed({status:'cancelled',source:'adm-enroll:1240',scheduled_date:'2026-10-08'});
    save([first,second,past,weekly,foreign]); seed({user_id:'student_b',teacher_id:'1',start_time:'09:10'});
    const result=await restore();
    check('successful mixed restore/occupied/past/weekly skip preserves source and saved-ID selectors', result.status===200 && result.body.restored_classes===1 && result.body.restore_skipped===3
      && row(first).status==='cancelled' && row(second).status==='active' && row(past).status==='cancelled' && row(weekly).status==='cancelled'
      && row(unsaved).status==='cancelled' && row(foreign).status==='cancelled' && enrollment().cancelled_class_ids===null && auditCount()===1 && guardEmpty(), result);
  }
  {
    const first=setup();const second=seed({status:'cancelled',source:'adm-enroll:124',start_time:'09:30'});save([first,second]);const result=await restore();
    check('overlapping saved targets restore only first and skip second',result.status===200 && result.body.restored_classes===1 && result.body.restore_skipped===1 && row(first).status==='active' && row(second).status==='cancelled' && auditCount()===1,result);
  }
  {
    const first=setup();const second=seed({status:'cancelled',source:'adm-enroll:124',start_time:'09:40'});save([first,second]);const result=await restore();
    check('adjacent saved targets both restore in one transaction',result.status===200 && result.body.restored_classes===2 && result.body.restore_skipped===0 && row(first).status==='active' && row(second).status==='active' && auditCount()===1 && batches.length===1,result);
  }
  for(const saved of ['[99999]','[99999,99999]',null,'[]','{bad']) {
    const id=setup();insert('UPDATE enrollments SET cancelled_class_ids=? WHERE id=124',saved);const result=await restore();
    check('missing/malformed saved IDs never authorize unrelated rows '+saved,result.status===200 && result.body.restored_classes===0 && row(id).status==='cancelled' && auditCount()===0,result);
  }
  for(const token of ['tok_hq_t_alpha','tok_branch_test','tok_unknown_scope']) {
    setup();const prior=allState();const result=await restore({},token);
    check('existing reopening authorization remains enforced '+token,result.status===403 && allState()===prior && auditCount()===0,result);
  }
  {
    const id=setup();const foreign=seed({status:'cancelled',source:'adm-enroll:125',scheduled_date:'2026-10-07'});
    const result=await restore({cancelled_class_ids:[foreign],source:'adm-enroll:125',force:true});
    check('client-supplied saved IDs/source cannot redirect restoration',result.status===200 && row(id).status==='active' && row(foreign).status==='cancelled' && result.body.restored_classes===1,result);
  }

  const failure = async (name, arrange, expectedStatus=503) => {
    const id=setup();const second=seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:'2026-10-06'});save([id,second]);
    await arrange(id,second);const prior=allState();writes.length=0;const result=await restore();
    check(name,result.status===expectedStatus && result.body.ok===false && result.body.restore_failed===true && result.body.restored_classes===0
      && allState()===prior && auditCount()===0 && guardEmpty(),{result,faultHits,batches:batches.length});
  };
  for(const [name,method,match] of [
    ['enrollment snapshot','first',sql=>/SELECT status, student_name, cancelled_class_ids(?:, updated_at)? FROM enrollments/.test(sql)],
    ['source snapshot','all',sql=>/json_group_array\(json_array/.test(sql) && /WHERE source = \?/.test(sql)],
    ['candidate snapshot','all',sql=>/json_group_array\(json_array/.test(sql) && /WHERE id <> \?/.test(sql)],
    ['schema metadata','all',sql=>/PRAGMA table_info\(class_schedules\)/.test(sql)],
  ]) for(const mode of ['throw','unsuccessful','malformed',...(method==='all'?['missing-success']:[])]) {
    await failure(name+' '+mode+' leaves entire reopening unchanged',async()=>{fault={method,match,mode};});
  }
  for(const bad of [{start_time:'25:00'},{start_time:'09:20:00'},{duration_min:0},{duration_min:-10},{duration_min:20.5},{duration_min:241},{scheduled_date:'2026-11-31'}]) {
    await failure('malformed candidate fails closed '+JSON.stringify(bad),async()=>{seed({user_id:'student_b',teacher_id:'1',...bad});});
  }
  for(const bad of [{start_time:'garbage'},{duration_min:0},{duration_min:-10},{duration_min:20.5},{duration_min:241},{scheduled_date:'2026-11-31'}]) {
    setup(bad);const prior=allState();const result=await restore();
    check('invalid selected target fails closed '+JSON.stringify(bad),result.status===503 && result.body.restore_failed===true && allState()===prior && auditCount()===0 && batches.length===0,result);
  }
  {
    setup();sq.exec('ALTER TABLE class_schedules DROP COLUMN starts_on');
    insert("INSERT INTO class_schedules(user_id,teacher_id,scheduled_date,day_of_week,start_time,duration_min,status,created_at) VALUES ('student_b','1',NULL,'Mon','09:10',20,'active',?)",NOW);
    const result=await restore();
    check('legacy schema without optional starts_on still detects recurring conflict',result.status===200 && result.body.restored_classes===0 && result.body.restore_skipped===1,result);
    sq.exec('ALTER TABLE class_schedules ADD COLUMN starts_on TEXT');
  }
  {
    const count=sq.prepare('PRAGMA table_info(class_schedules)').all().length, added=[];
    for(let n=count;n<32;n++){const column='enrollment_capacity_'+n;sq.exec(`ALTER TABLE class_schedules ADD COLUMN ${column} TEXT`);added.push(column);}
    setup();let result=await restore();check('32-column snapshot boundary succeeds',result.status===200 && guardEmpty(),result);
    sq.exec('ALTER TABLE class_schedules ADD COLUMN enrollment_capacity_over TEXT');setup();const prior=allState();result=await restore();
    check('33-column snapshot fails before mutation',result.status===503 && result.body.restore_failed===true && allState()===prior && batches.length===0,result);
    sq.exec('ALTER TABLE class_schedules DROP COLUMN enrollment_capacity_over');for(const name of added.reverse())sq.exec(`ALTER TABLE class_schedules DROP COLUMN ${name}`);
  }
  for(const [label,count,allowed] of [['below',495000,true],['above',500000,false]]) {
    setup({notes:'한'.repeat(count)});const prior=allState();const result=await restore();const maxBytes=Math.max(...snapshotSizes.map(s=>s.bytes));
    check('source UTF-8 proof '+label+' ceiling',allowed ? result.status===200 && guardEmpty()
      : result.status===503 && result.body.restore_failed===true && maxBytes>1500000 && allState()===prior && batches.length===0,{result,maxBytes});
  }
  {
    setup({notes:'한'.repeat(270000)});seed({user_id:'student_b',teacher_id:'1',start_time:'10:00',notes:'한'.repeat(270000)});
    const prior=allState();const result=await restore();
    check('aggregate proof bytes fail before mutation even if individual values fit',result.status===503 && result.body.restore_failed===true && snapshotSizes.every(s=>s.bytes<1500000)
      && snapshotSizes.reduce((n,s)=>n+s.bytes,0)>1500000 && allState()===prior && batches.length===0,{result,snapshotSizes});
  }
  for(const count of [50,51]) {
    const first=setup({user_id:'capacity_0'});const ids=[first];
    for(let n=1;n<count;n++)ids.push(seed({user_id:'capacity_'+n,status:'cancelled',source:'adm-enroll:124',scheduled_date:new RealDate(RealDate.parse('2026-10-05T00:00:00Z')+n*86400000).toISOString().slice(0,10)}));
    save(ids);const prior=allState();const result=await restore();
    check(count+' independent neighborhoods '+(count===50?'fit the explicit proof-work bound':'fail before mutation'),count===50
      ? result.status===200 && result.body.restored_classes===50 && guardEmpty()
      : result.status===503 && result.body.restore_failed===true && allState()===prior && batches.length===0,
      {result,executedStatements:queries.length,batchStatements:batches[0]?.length,maxBindCount:Math.max(...queries.map(q=>q.bindCount)),maxSqlBytes:Math.max(...queries.map(q=>new TextEncoder().encode(q.sql).byteLength)),snapshotSizes});
  }
  {
    const first=setup(),ids=[first];
    for(let n=1;n<120;n++)ids.push(seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:new RealDate(RealDate.parse('2026-10-05T00:00:00Z')+n*86400000).toISOString().slice(0,10)}));
    save(ids);const result=await restore();
    check('120 saved lessons in one student/teacher neighborhood reuse one conflict proof',result.status===200 && result.body.restored_classes===120 && result.body.restore_skipped===0
      && auditCount()===1 && batches.length===1 && batches[0].length===13 && guardEmpty(),
      {result,executedStatements:queries.length,batchStatements:batches[0]?.length,maxBindCount:Math.max(...queries.map(q=>q.bindCount)),snapshotSizes});
  }

  for(const [name,sql,args] of [
    ['source moved', 'UPDATE class_schedules SET start_time=? WHERE id=?',['10:00']],
    ['source reassigned', 'UPDATE class_schedules SET source=? WHERE id=?',['adm-enroll:125']],
    ['source cancelled state changed', 'UPDATE class_schedules SET status=? WHERE id=?',['completed']],
    ['source duration changed','UPDATE class_schedules SET duration_min=? WHERE id=?',[40]],
    ['saved IDs changed','UPDATE enrollments SET cancelled_class_ids=? WHERE id=124',['[99999]']],
    ['enrollment status changed','UPDATE enrollments SET status=? WHERE id=124',['active']],
    ['enrollment version changed','UPDATE enrollments SET updated_at=? WHERE id=124',[NOW+1]],
  ]) {
    const id=setup();let observed;beforeBatch=()=>{insert(sql,...args,...(sql.includes('WHERE id=?')?[id]:[]));observed=allState();};
    const result=await restore();
    check(name+' after validation rejects stale apply',result.status===409 && result.body.restore_failed===true && result.body.restored_classes===0 && allState()===observed && auditCount()===0 && guardEmpty(),result);
  }
  {
    setup();let observed;beforeBatch=()=>{seed({user_id:'student_b',teacher_id:'1',start_time:'09:10'});observed=allState();};const result=await restore();
    check('new conflicting row inserted after validation rejects stale apply',result.status===409 && result.body.restore_failed===true && allState()===observed && auditCount()===0 && guardEmpty(),result);
  }
  {
    setup();let observed;beforeBatch=()=>{seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:'2026-10-06'});observed=allState();};const result=await restore();
    check('source membership changes after validation reject stale apply',result.status===409 && result.body.restore_failed===true && allState()===observed && auditCount()===0 && guardEmpty(),result);
  }
  {
    setup();const peer=seed({user_id:'student_b',teacher_id:'1',start_time:'10:00'});let observed;
    beforeBatch=()=>{insert('UPDATE class_schedules SET start_time=? WHERE id=?','09:10',peer);observed=allState();};const result=await restore();
    check('candidate changes after validation reject stale apply',result.status===409 && allState()===observed && auditCount()===0 && guardEmpty(),result);
  }
  if(!sq.prepare("SELECT name FROM sqlite_master WHERE name='schedule_move_guard'").get())
    sq.exec(ddl(readFileSync(join(SRC,'class-schedule-move.ts'),'utf8'),'schedule_move_guard'));
  for(const [name,table,event] of [
    ['guard insert','schedule_move_guard','INSERT'], ['class update','class_schedules','UPDATE'],
    ['enrollment update','enrollments','UPDATE'], ['audit insert','class_audit_log','INSERT'], ['guard cleanup','schedule_move_guard','DELETE'],
  ]) for(const mode of ['ABORT','IGNORE']) {
    const id=setup();const other=seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:'2026-10-06'});save([id,other]);const prior=allState();
    sq.exec(`CREATE TEMP TRIGGER fail_enrollment_write BEFORE ${event} ON ${table} BEGIN SELECT RAISE(${mode}${mode==='ABORT'?",'injected write failure'":''}); END`);
    const result=await restore();sq.exec('DROP TRIGGER fail_enrollment_write');
    check(name+' '+mode+' rolls back all classes, enrollment, audit and guards',result.status===503 && result.body.restore_failed===true && result.body.restored_classes===0 && allState()===prior && auditCount()===0 && guardEmpty(),result);
  }
  {
    const id=setup();const second=seed({status:'cancelled',source:'adm-enroll:124',scheduled_date:'2026-10-06'});save([id,second]);const prior=allState();
    sq.exec(`CREATE TEMP TRIGGER skip_one_enrollment_restore BEFORE UPDATE ON class_schedules WHEN OLD.id=${second} BEGIN SELECT RAISE(IGNORE); END`);
    const result=await restore();sq.exec('DROP TRIGGER skip_one_enrollment_restore');
    check('partially ignored bulk update rolls back earlier successful rows',result.status===503 && result.body.restore_failed===true && result.body.restored_classes===0 && allState()===prior && auditCount()===0 && guardEmpty(),result);
  }
  for(const mode of ['throw','unsuccessful']) await failure('guard preparation '+mode+' leaves operation unchanged',async()=>{fault={method:'run',match:sql=>/CREATE TABLE IF NOT EXISTS schedule_move_guard/.test(sql),mode};});
  for(const mode of ['throw','unsuccessful']) await failure('batch class write '+mode+' rolls back operation',async()=>{fault={method:'run',match:sql=>/UPDATE class_schedules SET status='active'/.test(sql),mode};});
  {
    setup();let winner;beforeBatch=async()=>{winner=await restore();};const loser=await restore();const repeated=await restore();
    check('concurrent duplicate apply commits only once',winner?.status===200 && loser.status===409 && loser.body.restored_classes===0 && auditCount()===1 && guardEmpty(),{winner,loser});
    check('repeat non-cancelled status change does not duplicate restoration or audit',repeated.status===200 && auditCount()===1 && guardEmpty(),repeated);
  }
  {
    setup();afterBatch=()=>undefined;const result=await restore();
    check('committed batch with lost acknowledgement reports uncertainty without retry',result.status===503 && result.body.restore_failed===true && enrollment().status==='confirmed' && auditCount()===1 && batches.length===1 && guardEmpty(),result);
  }
  for(const [name,malformed] of [['empty objects',()=>({})],['booleans',()=>true],['array entries',()=>[]]]) {
    setup();afterBatch=out=>out.map(malformed);const result=await restore();
    check('committed batch with malformed acknowledgement '+name+' reports uncertainty without retry',result.status===503 && result.body.restore_failed===true
      && enrollment().status==='confirmed' && auditCount()===1 && batches.length===1 && guardEmpty(),result);
  }
  {
    setup();const result=await restore();
    check('success uses bounded prepared batches and unchanged guard schema',result.status===200 && batches.length===1 && batches[0].every(s=>s.bindCount<=100) && guardEmpty()
      && /token TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT schedule_move_snapshot CHECK\(valid=1\)/.test(sq.prepare("SELECT sql FROM sqlite_master WHERE name='schedule_move_guard'").get().sql),{result,batch:batches[0],executedStatements:queries.length,maxBindCount:Math.max(...queries.map(q=>q.bindCount)),snapshotSizes});
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
console.log(`\nEnrollment restore actual-source safety: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
