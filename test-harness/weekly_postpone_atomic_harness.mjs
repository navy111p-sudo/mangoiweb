/** Local SQLite sandbox; executes production planner, conflict checks and request transaction.
 * Does not claim browser, HTTP routing, production D1, or all-calendar coverage. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
registerHooks({resolve(s,c,next){try{return next(s,c)}catch(e){if(s.startsWith('.')&&!/\.[a-z]+$/.test(s))return next(s+'.ts',c);throw e}}});
const {weeklyPostponePlan,readWeeklyPostponePlan,prepareWeeklyPostpone}=await import('../cloudflare-deploy/src/weekly-postpone.ts');
const {prepareScheduleRequestGuards,commitScheduleRequestDecision}=await import('../cloudflare-deploy/src/schedule-request-atomic.ts');
const {ensureScheduleChangeRequestTable}=await import('../cloudflare-deploy/src/student-schedule-request.ts');
const {addDays}=await import('../cloudflare-deploy/src/class-series-move.ts');
let passed=0;
for(let n=0;n<600;n++){
 const db=new DatabaseSync(':memory:');
 const statement=(sql,args=[])=>({bind(...v){return statement(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{success:true,results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}});
 const env={DB:{prepare:statement,async exec(sql){db.exec(sql)},async batch(ss){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of ss)out.push(await s.run());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}}};
 db.exec(`CREATE TABLE class_schedules(id INTEGER PRIMARY KEY,user_id TEXT,teacher_id TEXT,scheduled_date TEXT,start_time TEXT,duration_min INTEGER,status TEXT,source TEXT,updated_at INTEGER,schedule_kind TEXT,starts_on TEXT,day_of_week TEXT);
 CREATE TABLE teachers(id INTEGER PRIMARY KEY,name TEXT); INSERT INTO teachers VALUES(1,'Sandbox Teacher');
 CREATE TABLE teacher_unavailability(id INTEGER PRIMARY KEY,teacher_id TEXT,kind TEXT,start_date TEXT,end_date TEXT,day_of_week INTEGER,start_time TEXT,end_time TEXT);
 CREATE TABLE calendar_events(id INTEGER PRIMARY KEY,event_type TEXT,teacher_name TEXT,date TEXT,end_date TEXT);`);
 await ensureScheduleChangeRequestTable(env);
 const start=addDays('2027-01-01',n),count=1+n%52,hour=String(8+n%13).padStart(2,'0')+':00';
 const insert=db.prepare("INSERT INTO class_schedules VALUES(?,?,?,?,?,20,'active','sandbox-series',1,'one_off',NULL,NULL)");
 for(let i=0;i<count;i++)insert.run(i+1,'sandbox_student','1',addDays(start,i*7),hour);
 // Other weekday, different student/source, earlier occurrence all stay untouched.
 insert.run(1001,'sandbox_student','1',addDays(start,1),hour);
 insert.run(1002,'sandbox_other','1',addDays(start,2),hour);
 insert.run(1003,'sandbox_student','1',addDays(start,-7),hour);
 const anchor=db.prepare('SELECT * FROM class_schedules WHERE id=1').get();
 const plan=await readWeeklyPostponePlan(env,anchor);assert.equal(plan.ok,true);assert.equal(plan.items.length,count);
 db.prepare("INSERT INTO schedule_change_requests(id,schedule_id,request_type,status,created_at,new_date,new_time,series_snapshot,request_scope) VALUES(1,1,'postpone','pending',1,?,?,?,'weekly_postpone')").run(addDays(start,7),hour,plan.snapshot);
 const request=db.prepare('SELECT * FROM schedule_change_requests WHERE id=1').get();
 const before=JSON.stringify(db.prepare('SELECT * FROM class_schedules ORDER BY id').all());
 const mode=n%8;
 if(mode>=6){
  db.exec('CREATE TABLE teacher_pricing(teacher_id TEXT, long_class_daily_cap INTEGER)');
  db.prepare('INSERT INTO teacher_pricing VALUES(?,?)').run('1',mode===6?1:0);
  db.exec('UPDATE class_schedules SET duration_min=30 WHERE id<1000');
  insert.run(2001,'sandbox_long','1',addDays(start,count*7),'06:00');
  db.exec('UPDATE class_schedules SET duration_min=30 WHERE id=2001');
  Object.assign(anchor,db.prepare('SELECT * FROM class_schedules WHERE id=1').get());
  const fresh=await readWeeklyPostponePlan(env,anchor);
  db.prepare('UPDATE schedule_change_requests SET series_snapshot=? WHERE id=1').run(fresh.snapshot);
  Object.assign(request,db.prepare('SELECT * FROM schedule_change_requests WHERE id=1').get());
 }
 if(mode===1){ // Another teacher booking conflicts at final extension.
  insert.run(2001,'sandbox_busy','1',addDays(start,count*7),hour.slice(0,3)+'10');
 }
 if(mode===2){db.prepare("INSERT INTO teacher_unavailability VALUES(1,'1','date',?,?,NULL,NULL,NULL)").run(addDays(start,count*7),addDays(start,count*7));}
 if(mode===3){db.exec('UPDATE class_schedules SET updated_at=2 WHERE id=1');}
 const guards=await prepareScheduleRequestGuards(env,request,anchor);
 const prepared=await prepareWeeklyPostpone(env,request,anchor,10);
 if(mode===1||mode===2||mode===3||mode===6){assert.equal(prepared.ok,false);assert.equal(db.prepare('SELECT status FROM schedule_change_requests').get().status,'pending');}
 else{
  assert.equal(prepared.ok,true);
  if(mode===4)db.exec('UPDATE class_schedules SET updated_at=3 WHERE id=1001');
  if(mode===5)db.exec("CREATE TRIGGER fail_weekly BEFORE UPDATE ON class_schedules WHEN NEW.id=1 BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
  const decision=env.DB.prepare("UPDATE schedule_change_requests SET status='approved' WHERE id=1 AND status='pending'");
  if(mode===4||mode===5){
   const unchanged=JSON.stringify(db.prepare('SELECT * FROM class_schedules ORDER BY id').all());
   await assert.rejects(commitScheduleRequestDecision(env,guards,prepared.mutations,decision));
   assert.equal(JSON.stringify(db.prepare('SELECT * FROM class_schedules ORDER BY id').all()),unchanged);
   assert.equal(db.prepare('SELECT status FROM schedule_change_requests').get().status,'pending');
  }else{
   await commitScheduleRequestDecision(env,guards,prepared.mutations,decision);
   const after=db.prepare('SELECT * FROM class_schedules ORDER BY id').all();
   assert.equal(after.length,count+3+(mode===7?1:0));
   for(let i=0;i<count;i++){assert.equal(after[i].scheduled_date,addDays(start,(i+1)*7));assert.equal(after[i].start_time,hour);assert.equal(after[i].teacher_id,'1');}
   assert.equal(JSON.stringify(after.filter(r=>r.id>=1001&&r.id<=1003)),JSON.stringify(JSON.parse(before).slice(count)));
   assert.equal(db.prepare('SELECT status FROM schedule_change_requests').get().status,'approved');
   await assert.rejects(commitScheduleRequestDecision(env,guards,prepared.mutations,decision));
  }
 }
 db.close();passed++;
}
for(const date of ['2027-02-30','garbage',''])assert.equal(weeklyPostponePlan({scheduled_date:date},[]).ok,false);
console.log(JSON.stringify({passed,failed:0,scenarios:['atomic weekly extension','teacher collision','teacher leave','stale series','concurrent edit rollback','injected write failure rollback'],scope:'production helpers + local SQLite; not browser or production deployment'}));
