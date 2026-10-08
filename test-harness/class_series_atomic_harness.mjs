#!/usr/bin/env node
/** Offline actual-route execution with real SQLite transactions. Authentication
 * and scope are explicit fixture seams; shared policies and production SQL run. */
import './helpers/offline-network-guard.cjs';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'cloudflare-deploy/src');
const TEMP = mkdtempSync(join(tmpdir(), 'series-atomic-'));
process.on('exit', () => rmSync(TEMP, {recursive:true, force:true}));
const made = new Map();
function copy(name) {
  if (made.has(name)) return made.get(name);
  const path = join(TEMP, name+'.ts'); made.set(name,path);
  writeFileSync(path, readFileSync(name === 'class-series-atomic' && process.env.SERIES_ATOMIC_SRC || join(DIR,name+'.ts'),'utf8')
    .replace(/from '\.\/([\w-]+)'/g, (_m,n) => `from '${pathToFileURL(copy(n)).href}'`));
  return path;
}
const ops = readFileSync(process.env.SERIES_OPS_SRC || join(DIR,'enroll-ops.ts'),'utf8');
const start = ops.indexOf("  if (path === '/api/pay/enroll/admin/series-move' && method === 'POST') {");
const end = ops.indexOf('  /* ── (m-3)',start);
if (start < 0 || end <= start) throw new Error('route source not found');
const prelude = `
import { planSeries, realConflict, normTime, seriesPreviewKey } from '${pathToFileURL(copy('class-series-move')).href}';
import * as Atomic from '${pathToFileURL(copy('class-series-atomic')).href}';
const { captureSeriesMoveSnapshot, observeSeriesConflictReads, applySeriesMoveAtomically, readSeriesMoveFirst, readSeriesMoveRows } = Atomic;
import { findScheduleConflicts } from '${pathToFileURL(copy('schedule-conflict')).href}';
import { DEFAULT_CLASS_MINUTES } from '${pathToFileURL(copy('class-policy')).href}';
import { teacherMoveDenyReason } from '${pathToFileURL(copy('class-teacher-move')).href}';
import { writeClassAudit } from '${pathToFileURL(copy('class-audit')).href}';
const json = (data:any,status=200) => ({status,data});
const parseJsonBody = async (r:any) => r;
const getAdminActor = async (_r:any,env:any) => env.actor || ({ok:true,isTeacher:false,role:'admin',username:'admin',name:'Fixture Admin'});
const forbiddenTeacherBody = () => ({ok:false,error:'forbidden_teacher'});
const subScopeDenied = async () => null;
export async function run(request:any,env:any) { const path='/api/pay/enroll/admin/series-move',method='POST';
${ops.slice(start,end)}
}
`;
writeFileSync(join(TEMP,'route.ts'),prelude);
const {run} = await import(pathToFileURL(join(TEMP,'route.ts')).href);
let pass=0, fail=0, maxArgs=0, maxSql=0, maxQueries=0, maxBatch=0, maxFunctionArgs=0, maxBoundValueBytes=0, scenarios=0;
const failed=[];
function ok(value,name,detail) { if(value) pass++; else {fail++; failed.push({name,detail}); console.error('FAIL',name,detail||'');} }
const defaults={schedule_id:1,new_date:'2026-10-14',new_time:'18:20'};
function setup(count=3, options={}) {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules(id INTEGER PRIMARY KEY,user_id TEXT,student_name TEXT,scheduled_date TEXT,day_of_week TEXT,start_time TEXT,duration_min INTEGER,teacher_id TEXT,status TEXT,source TEXT,updated_at INTEGER,schedule_kind TEXT,starts_on TEXT);
    CREATE TABLE teachers(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO teachers VALUES(5,'Original'),(6,'Next');
    CREATE TABLE admin_scope(username TEXT,scope_type TEXT); INSERT INTO admin_scope VALUES('admin','hq');`);
  if(!options.noPricing) db.exec(`CREATE TABLE teacher_pricing(teacher_id TEXT PRIMARY KEY${options.noCap?'':',long_class_daily_cap INTEGER'});`);
  const insert=(id,date,extra={}) => { const r={uid:'stu',time:'17:00',duration:20,tid:'5',status:'active',source:'adm-enroll:7',...extra};
    db.prepare(`INSERT INTO class_schedules VALUES(?,?,'Student',?,'Tue',?,?,?,?,?,1,'dated',NULL)`).run(id,r.uid,date,r.time,r.duration,r.tid,r.status,r.source); };
  for(let i=0;i<count;i++) insert(i+1,new Date(Date.parse('2026-10-13T00:00:00Z')+i*7*86400000).toISOString().slice(0,10));
  const state={fault:null,after:null,beforeBatch:null,batches:0,queries:0,executed:[],insert,db};
  const fault=(stage,sql)=>{const f=state.fault;if(f&&f.stage===stage&&f.match.test(sql)){if(f.once)state.fault=null;if(f.mode==='throw')throw new Error('synthetic lookup outage');return {hit:true,value:f.value};}return null;};
  function check(sql,args) {
    for(const m of sql.matchAll(/json_array\(([^()]*)\)/g)){const n=m[1].split(',').length;maxFunctionArgs=Math.max(maxFunctionArgs,n);if(n>32)throw new Error('D1 SQL function argument limit');}
    for(const a of args) if(typeof a==='string'){const n=Buffer.byteLength(a);maxBoundValueBytes=Math.max(maxBoundValueBytes,n);if(n>2000000)throw new Error('D1 value limit');}
    maxArgs=Math.max(maxArgs,args.length);maxSql=Math.max(maxSql,Buffer.byteLength(sql));
    if(args.length>100)throw new Error('D1 bind limit');if(Buffer.byteLength(sql)>100000)throw new Error('D1 SQL limit');
  }
  function wrap(sql,args=[]) {
    check(sql,args);
    const result=(stage)=>{state.queries++;const f=fault(stage,sql);if(f)return f.value;
      const stmt=db.prepare(sql);let value;
      if(stage==='first')value=stmt.get(...args)??null;
      else if(stage==='all'||/^\s*(SELECT|PRAGMA)\b/i.test(sql))value={success:true,results:stmt.all(...args),meta:{changes:0}};
      else {const r=stmt.run(...args);value={success:true,results:[],meta:{changes:Number(r.changes)}};}
      state.executed.push({stage,sql,args});if(state.after)state.after(sql,stage);return value;};
    return {sql,args,bind(...a){const f=fault('bind',sql);if(f)return f.value;return wrap(sql,a);},first:async()=>result('first'),all:async()=>result('all'),run:async()=>result('run')};
  }
  const env={DB:{prepare(sql){const f=fault('prepare',sql);if(f)return f.value;return wrap(sql);},
    exec:async sql=>{state.queries++;for(const line of sql.split('\n').filter(s=>s.trim()))db.exec(line);return {success:true};},
    batch:async statements=>{state.batches++;maxBatch=Math.max(maxBatch,statements.length);if(state.beforeBatch)state.beforeBatch();
      db.exec('BEGIN IMMEDIATE');try {const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return state.malformedBatchResult?[]:out;}
      catch(e){db.exec('ROLLBACK');throw e;}}
  }};
  const audit=()=>db.prepare("SELECT name FROM sqlite_master WHERE name='class_audit_log'").get()?Number(db.prepare('SELECT count(*) AS n FROM class_audit_log').get().n):0;
  const schedules=()=>JSON.stringify(db.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const call=async body=>{const q=state.queries;let r;try{r=await run({...defaults,...body},env);}catch(e){r={status:599,data:{error:String(e.message)}};}maxQueries=Math.max(maxQueries,state.queries-q);return r;};
  return {state,env,call,audit,schedules,insert,db,close:()=>db.close()};
}
async function scenario(name,fn){scenarios++;try{await fn();}catch(e){ok(false,name,e.stack);}}
const sharedStudent=/SELECT id, day_of_week, scheduled_date, start_time, duration_min, user_id, teacher_id\s+FROM class_schedules\s+WHERE user_id/;
const sharedTeacher=/SELECT id, day_of_week, scheduled_date, start_time, duration_min, user_id, teacher_id\s+FROM class_schedules\s+WHERE teacher_id/;
const sharedCap=/SELECT long_class_daily_cap AS cap FROM teacher_pricing/;
const repeats=Number(process.env.SERIES_REPEAT||1);
for(let round=0;round<repeats;round++) {
 await scenario('review/apply/duplicate',async()=>{const s=setup();const before=s.schedules();const p=await s.call({});ok(p.status===200&&p.data.dry_run&&typeof p.data.preview_key==='string'&&p.data.preview_key.length>0,'preview exact key');ok(s.schedules()===before&&s.audit()===0&&s.state.batches===0,'preview read-only');const r=await s.call({apply:true,expected_preview:p.data.preview_key});ok(r.status===200&&r.data.moved===3&&s.audit()===3,'all sessions and audits saved',r);ok(s.db.prepare('SELECT count(*) n FROM schedule_move_guard').get().n===0,'guard cleaned');const after=s.schedules();const d=await s.call({apply:true,expected_preview:p.data.preview_key});ok(d.status!==200&&s.schedules()===after&&s.audit()===3,'duplicate apply no further writes',d);s.close();});
 await scenario('teacher swap',async()=>{const s=setup();const p=await s.call({teacher_id:'6'});const r=await s.call({teacher_id:'6',apply:true,expected_preview:p.data.preview_key});ok(r.status===200&&s.audit()===3&&s.db.prepare("SELECT count(*) n FROM class_schedules WHERE teacher_id='6'").get().n===3,'teacher swap commits with audits',r);s.close();});
 await scenario('normalized legacy time',async()=>{const s=setup();s.db.exec("UPDATE class_schedules SET start_time='7:00'");const p=await s.call({});const r=await s.call({apply:true,expected_preview:p.data.preview_key});ok(p.status===200&&p.data.from_time==='07:00'&&r.status===200&&s.audit()===3,'accepted legacy time applies without ignored updates',r);s.close();});
 await scenario('optional preview key',async()=>{const s=setup();const r=await s.call({apply:true});ok(r.status===200&&s.audit()===3,'legacy caller without expected key allowed');s.close();});
 for(const [name,mutation] of [['member add',s=>s.insert(9,'2026-11-03')],['member replace',s=>{s.db.exec('DELETE FROM class_schedules WHERE id=3');s.insert(9,'2026-10-27');}],['anchor uid',s=>s.db.exec("UPDATE class_schedules SET user_id='new-stu' WHERE id=1")],['source',s=>s.db.exec("UPDATE class_schedules SET source='other' WHERE id=1")],['teacher',s=>s.db.exec("UPDATE class_schedules SET teacher_id='6' WHERE id=1")],['duration',s=>s.db.exec('UPDATE class_schedules SET duration_min=30 WHERE id=1')],['member date',s=>s.db.exec("UPDATE class_schedules SET scheduled_date='2026-11-10' WHERE id=3")]])
 await scenario('stale '+name,async()=>{const s=setup();const p=await s.call({});mutation(s);const before=s.schedules();const r=await s.call({apply:true,expected_preview:p.data.preview_key});ok(r.status===409&&r.data.error==='stale_preview'&&s.schedules()===before&&s.audit()===0,'stale preview '+name,r);s.close();});
 await scenario('destination teacher key',async()=>{const s=setup();const p=await s.call({});const r=await s.call({apply:true,teacher_id:'6',expected_preview:p.data.preview_key});ok(r.status===409&&r.data.error==='stale_preview'&&s.audit()===0,'destination teacher covered by key',r);s.close();});
 for(const [name,edit] of [['new conflict',s=>s.insert(99,'2026-10-14',{uid:'stu',time:'18:20',tid:'6'})],['member changed',s=>s.db.exec("UPDATE class_schedules SET scheduled_date='2026-10-28' WHERE id=2")],['member inserted',s=>s.insert(99,'2026-11-03')]])
 await scenario('concurrent '+name,async()=>{const s=setup();let before;s.state.beforeBatch=()=>{edit(s);before=s.schedules();};const r=await s.call({apply:true});ok(r.status===409&&r.data.error==='schedule_changed'&&s.schedules()===before&&s.audit()===0,'concurrent '+name+' rolls back',r);s.close();});
 await scenario('snapshot precedes reads',async()=>{const s=setup();let injected=false;s.state.after=(sql,stage)=>{if(!injected&&stage==='first'&&/json_group_array/.test(sql)&&/SELECT \* FROM class_schedules/.test(sql)){injected=true;s.insert(99,'2026-11-03');}};const r=await s.call({apply:true});ok(injected&&r.status===409&&r.data.error==='schedule_changed'&&s.audit()===0,'new member before authoritative reads detected',r);s.close();});
 for(const [name,ddl] of [
 ['ignored update',"CREATE TRIGGER ignore_write BEFORE UPDATE ON class_schedules WHEN NEW.id=2 BEGIN SELECT RAISE(IGNORE); END"],
 ['failed update',"CREATE TRIGGER fail_write BEFORE UPDATE ON class_schedules WHEN NEW.id=2 BEGIN SELECT RAISE(ABORT,'write fault'); END"],
 ['ignored audit',"CREATE TRIGGER ignore_audit BEFORE INSERT ON class_audit_log WHEN NEW.schedule_id=2 BEGIN SELECT RAISE(IGNORE); END"],
 ['failed audit',"CREATE TRIGGER fail_audit BEFORE INSERT ON class_audit_log WHEN NEW.schedule_id=2 BEGIN SELECT RAISE(ABORT,'audit fault'); END"],
 ['ignored guard',"CREATE TRIGGER ignore_guard BEFORE INSERT ON schedule_move_guard BEGIN SELECT RAISE(IGNORE); END"],
 ['failed guard',"CREATE TRIGGER fail_guard BEFORE INSERT ON schedule_move_guard BEGIN SELECT RAISE(ABORT,'guard fault'); END"],
 ['ignored cleanup',"CREATE TRIGGER ignore_cleanup BEFORE DELETE ON schedule_move_guard BEGIN SELECT RAISE(IGNORE); END"]])
 await scenario(name,async()=>{const s=setup();const before=s.schedules();s.state.beforeBatch=()=>s.db.exec(ddl);const r=await s.call({apply:true});ok(r.status===503&&r.data.error==='move_failed'&&s.schedules()===before&&s.audit()===0,name+' rolls back',r);s.close();});
 for(const [label,match,stages] of [['student',sharedStudent,['prepare','bind','all']],['teacher',sharedTeacher,['prepare','bind','all']],['cap',sharedCap,['prepare','bind','first']]])
 for(const stage of stages) for(const apply of [false,true])
 await scenario(label+' '+stage+' outage',async()=>{const s=setup();s.db.exec('UPDATE class_schedules SET duration_min=30');const before=s.schedules();s.state.fault={stage,match,mode:'throw'};const r=await s.call({apply});ok(r.status===503&&r.data.error==='availability_unknown'&&s.schedules()===before&&s.audit()===0&&s.state.batches===0,`${label} ${stage} outage ${apply?'apply':'preview'} fails closed`,r);s.close();});
 for(const [label,match,stage,values] of [['student',sharedStudent,'all',[null,{}, {results:null},{success:false,results:[]},{results:[{}]},{results:[null]}]],['cap',sharedCap,'first',[undefined,{},[],false,{success:false,cap:0}]]])
 for(const value of values)
 await scenario(label+' malformed',async()=>{const s=setup();s.db.exec('UPDATE class_schedules SET duration_min=30');s.state.fault={stage,match,mode:'value',value};const r=await s.call({apply:true});ok(r.status===503&&r.data.error==='availability_unknown'&&s.audit()===0,label+' malformed result fails closed',r);s.close();});
 for(const completeShape of [false,true]) for(const apply of [false,true])
 await scenario('pricing metadata '+(completeShape?'partial':'malformed')+' '+(apply?'apply':'preview'),async()=>{const s=setup();s.db.exec("UPDATE class_schedules SET duration_min=40; INSERT INTO teacher_pricing VALUES('5',1)");s.insert(99,'2026-10-14',{uid:'other',time:'08:00',duration:40});const clean=await s.call({});ok(clean.status===409&&clean.data.error==='conflict','configured cap blocks clean preview',clean);const column=completeShape?s.db.prepare('PRAGMA table_info(teacher_pricing)').all().find(c=>c.name==='teacher_id'):{name:'teacher_id'};s.state.fault={stage:'all',match:/PRAGMA table_info\(teacher_pricing\)/,mode:'value',value:{success:true,results:[column]}};const before=s.schedules();const r=await s.call({apply});ok(r.status===(completeShape?409:503)&&r.data.error===(completeShape?'conflict':'availability_unknown')&&s.audit()===0&&s.schedules()===before,'pricing metadata cannot bypass real cap: '+(completeShape?'full-shaped prefix':'malformed row'),r);s.close();});
 for(const options of [{noPricing:true},{noCap:true}]) for(const stage of ['prepare','bind','first']) for(const apply of [false,true])
 await scenario('optional pricing lookup outage '+stage+' '+apply,async()=>{const s=setup(3,options);s.db.exec('UPDATE class_schedules SET duration_min=40');s.state.fault={stage,match:sharedCap,mode:'throw'};const r=await s.call({apply});ok(r.status===503&&r.data.error==='availability_unknown'&&s.audit()===0,'metadata absence alone cannot swallow unrelated outage',r);s.close();});
 for(const options of [{noPricing:true},{noCap:true}])
 await scenario('optional cap absent',async()=>{const s=setup(3,options);s.db.exec('UPDATE class_schedules SET duration_min=30');const r=await s.call({apply:true});ok(r.status===200&&s.audit()===3,'metadata-confirmed optional absence defaults',r);s.close();});
 await scenario('group and conflict',async()=>{const s=setup();s.insert(99,'2026-10-14',{uid:'another',time:'18:20'});const p=await s.call({});ok(p.status===200,'exact-slot group exception preserved',p);s.db.exec("UPDATE class_schedules SET start_time='18:10' WHERE id=99");const r=await s.call({apply:true});ok(r.status===409&&r.data.error==='conflict'&&s.audit()===0,'staggered teacher overlap blocked',r);s.close();});
 await scenario('ABA overlap',async()=>{const s=setup();s.insert(99,'2026-10-14',{uid:'another',time:'18:10'});const before=s.schedules();let changed=false;s.state.after=(sql,stage)=>{if(!changed&&stage==='first'&&/json_group_array/.test(sql)&&/SELECT \* FROM class_schedules/.test(sql)){changed=true;s.db.exec("UPDATE class_schedules SET status='cancelled' WHERE id=99");}};s.state.beforeBatch=()=>s.db.exec("UPDATE class_schedules SET status='active' WHERE id=99");const r=await s.call({apply:true});ok(changed&&r.status===409&&r.data.error==='schedule_changed'&&s.audit()===0&&s.schedules()===before,'ABA restored overlap rejected using actual empty read',r);s.close();});
 for(const temporary of ['cap-raised','cap-row-deleted'])
 await scenario('ABA '+temporary,async()=>{const s=setup();s.db.exec("UPDATE class_schedules SET duration_min=40; ALTER TABLE teacher_pricing ADD COLUMN updated_at INTEGER; INSERT INTO teacher_pricing VALUES('5',3,1)");for(let i=0;i<3;i++)s.insert(90+i,'2026-10-14',{uid:'other'+i,time:(8+i)+':00',duration:40});const before=s.schedules();let changed=false;s.state.after=(sql,stage)=>{if(!changed&&stage==='first'&&/json_group_array/.test(sql)&&/SELECT \* FROM teacher_pricing/.test(sql)){changed=true;s.db.exec(temporary==='cap-raised'?"UPDATE teacher_pricing SET long_class_daily_cap=10,updated_at=2":"DELETE FROM teacher_pricing");}};s.state.beforeBatch=()=>s.db.exec("INSERT OR REPLACE INTO teacher_pricing VALUES('5',3,3)");const r=await s.call({apply:true});ok(changed&&r.status===409&&r.data.error==='schedule_changed'&&s.audit()===0&&s.schedules()===before,'ABA '+temporary+' with advancing version rejected',r);s.close();});
 for(const [label,change,restore] of [['anchor',"UPDATE class_schedules SET source='temporary' WHERE id=1","UPDATE class_schedules SET source='adm-enroll:7' WHERE id=1"],['membership',"UPDATE class_schedules SET status='cancelled' WHERE id=2","UPDATE class_schedules SET status='active' WHERE id=2"]])
 await scenario('ABA '+label,async()=>{const s=setup();const before=s.schedules();let changed=false;s.state.after=(sql,stage)=>{if(!changed&&stage==='first'&&/json_group_array/.test(sql)&&/SELECT \* FROM class_schedules/.test(sql)){changed=true;s.db.exec(change);}};s.state.beforeBatch=()=>s.db.exec(restore);const r=await s.call({apply:true});ok(changed&&r.status===409&&r.data.error==='schedule_changed'&&s.audit()===0&&s.schedules()===before,'ABA '+label+' rejected',r);s.close();});
 await scenario('ABA target teacher',async()=>{const s=setup();const before=s.schedules();let changed=false;s.state.after=(sql,stage)=>{if(!changed&&stage==='first'&&/json_group_array/.test(sql)&&/SELECT id, name FROM teachers/.test(sql)){changed=true;s.db.exec("INSERT INTO teachers VALUES(9,'Temporary')");}};s.state.beforeBatch=()=>s.db.exec('DELETE FROM teachers WHERE id=9');const r=await s.call({teacher_id:'9',apply:true});ok(changed&&r.status===409&&r.data.error==='schedule_changed'&&s.audit()===0&&s.schedules()===before,'ABA target teacher existence proved',r);s.close();});
 await scenario('differing cap reads',async()=>{const s=setup();s.db.exec("UPDATE class_schedules SET duration_min=40; INSERT INTO teacher_pricing VALUES('5',3)");for(let i=0;i<3;i++)s.insert(90+i,'2026-10-14',{uid:'other'+i,time:(8+i)+':00',duration:40});let reads=0,changed=false;s.state.after=(sql,stage)=>{if(!changed&&stage==='first'&&/json_group_array/.test(sql)&&/SELECT \* FROM teacher_pricing/.test(sql)){changed=true;s.db.exec('UPDATE teacher_pricing SET long_class_daily_cap=50');}if(stage==='first'&&sharedCap.test(sql)){reads++;s.db.exec('UPDATE teacher_pricing SET long_class_daily_cap=3');}};const r=await s.call({apply:true});ok(reads===3&&r.status===409&&s.audit()===0,'dedup retains earlier differing query result',r);s.close();});
 await scenario('oversized UTF-8 history',async()=>{const s=setup();const name='학'.repeat(6000);s.db.exec('BEGIN');for(let i=0;i<90;i++){s.insert(1000+i,'2025-01-01',{uid:'old'+i,status:'completed'});s.db.prepare('UPDATE class_schedules SET student_name=? WHERE id=?').run(name,1000+i);}s.db.exec('COMMIT');const before=s.schedules();const r=await s.call({apply:true});ok(r.status===503&&r.data.error==='availability_unknown'&&s.schedules()===before&&s.audit()===0&&s.state.batches===0,'oversized UTF-8 snapshot rejects without truncation',r);s.close();});
 await scenario('uncertain batch response',async()=>{const s=setup();const p=await s.call({});s.state.malformedBatchResult=true;const r=await s.call({apply:true,expected_preview:p.data.preview_key});ok(r.status===503&&r.data.error==='move_failed'&&s.audit()===3,'committed but unconfirmed batch reports uncertainty',r);const after=s.schedules();const retry=await s.call({apply:true,expected_preview:p.data.preview_key});ok(retry.status!==200&&s.schedules()===after&&s.audit()===3,'uncertain response retry adds no writes');s.close();});
 for(const [name,stage,match,value] of [['anchor','first',/SELECT cs.id, cs.user_id, cs.student_name/,{id:1,status:'active'}],['members','all',/SELECT id, user_id, scheduled_date, start_time, teacher_id, source, status/,{results:[{id:1,status:'active'}]}],['metadata','all',/PRAGMA table_info\(class_schedules\)/,{results:[{}]}],['guard setup','run',/CREATE TABLE IF NOT EXISTS schedule_move_guard/,{success:false}]])
 await scenario('malformed '+name,async()=>{const s=setup();s.state.fault={stage,match,mode:'value',value};const before=s.schedules();const r=await s.call({apply:true});ok(r.status===503&&s.schedules()===before&&s.audit()===0,name+' malformed no save',r);s.close();});
 for(const delta of [7,-7])
 await scenario('unique chain '+delta,async()=>{const s=setup();s.db.exec("CREATE UNIQUE INDEX uq_sched_teacher_slot ON class_schedules(teacher_id,scheduled_date,start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL");const date=new Date(Date.parse('2026-10-13T00:00:00Z')+delta*86400000).toISOString().slice(0,10);const p=await s.call({new_date:date,new_time:'17:00'});const r=await s.call({new_date:date,new_time:'17:00',apply:true,expected_preview:p.data.preview_key});ok(r.status===200&&s.audit()===3,'whole-week unique slots vacated '+delta,r);s.close();});
 for(const count of [3,61])
 await scenario('450 historical rows plus '+count+' future',async()=>{const s=setup(count);s.db.exec('BEGIN');for(let i=0;i<450;i++)s.insert(1000+i,new Date(Date.parse('2010-01-05T00:00:00Z')+i*7*86400000).toISOString().slice(0,10));s.db.exec('COMMIT');const old=JSON.stringify(s.db.prepare('SELECT * FROM class_schedules WHERE id>=1000 ORDER BY id').all());const before=s.schedules();const p=await s.call({});if(count===3){ok(p.status===200&&p.data.count===3&&p.data.items.map(x=>x.id).join(',')==='1,2,3','past history cannot hide later members',p);const r=await s.call({apply:true,expected_preview:p.data.preview_key});ok(r.status===200&&r.data.moved===3&&s.audit()===3&&JSON.stringify(s.db.prepare('SELECT * FROM class_schedules WHERE id>=1000 ORDER BY id').all())===old,'full future series moved; history unchanged',r);}else{const r=await s.call({apply:true});ok(p.status===400&&p.data.error==='too_many'&&r.status===400&&r.data.error==='too_many'&&s.audit()===0&&s.schedules()===before&&s.state.batches===0,'history cannot hide over60; preview/apply reject without writes',r);}s.close();});
 await scenario('sixty long sessions',async()=>{const s=setup(60);s.db.exec("UPDATE class_schedules SET duration_min=40; INSERT INTO teacher_pricing VALUES('5',100)");const p=await s.call({});const r=await s.call({apply:true,expected_preview:p.data.preview_key});ok(p.status===200&&r.status===200&&r.data.moved===60&&s.audit()===60,'60 long sessions with cap validation save atomically',r);s.close();});
 await scenario('sixty sessions',async()=>{const s=setup(60);const p=await s.call({});const r=await s.call({apply:true,expected_preview:p.data.preview_key});ok(p.status===200&&p.data.count===60&&r.status===200&&r.data.moved===60&&s.audit()===60,'60 rows and audits save',r.status);ok(s.state.batches===1,'60-row batch never split');s.close();});
}
ok(maxArgs<=100&&maxSql<=100000&&maxQueries<=1000&&maxFunctionArgs<=32&&maxBoundValueBytes<=1500000,'D1 Paid per-statement/value and route-local query bounds',{maxArgs,maxSql,maxQueries,maxBatch,maxFunctionArgs,maxBoundValueBytes});
console.log(JSON.stringify({pass,fail,scenarios,repeats,limits:{maxArgs,maxSql,maxQueries,maxBatch,maxFunctionArgs,maxBoundValueBytes,queryScope:'route-local, excludes authentication and outer setup',freeTierSupported:maxQueries<=50},failed},null,2));
process.exitCode=fail?1:0;
