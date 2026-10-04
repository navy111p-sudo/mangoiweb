// Execute the API against isolated SQLite, never production D1.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ts=require('../cloudflare-deploy/node_modules/typescript');
assert.ok(readFileSync('cloudflare-deploy/public/work.html','utf8').includes(readFileSync('cloudflare-deploy/public/js/handover-inbox-banner.js','utf8').trim()),'self-contained work banner must match the shared script');
const source=readFileSync('cloudflare-deploy/src/daily-handover.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE admin_account(username TEXT PRIMARY KEY,name TEXT); CREATE TABLE admin_scope(username TEXT,scope_type TEXT);
CREATE TABLE push_subscriptions(endpoint TEXT,user_id TEXT,enabled INTEGER);
CREATE TABLE push_queue(endpoint TEXT,title TEXT,body TEXT,url TEXT,icon TEXT,badge TEXT,tag TEXT,queued_at INTEGER);
INSERT INTO admin_account VALUES('alice','Alice'),('bob','Bob'),('carol','Carol'),('admin','Admin');
INSERT INTO admin_scope SELECT username,'hq' FROM admin_account;`);
let statementHook=null,beforeBatch=null,batchTail=Promise.resolve();
function statement(sql){let args=[];return{sql,bind(...a){assert.ok(a.length<=100,'D1 bind limit');args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},runSync(){statementHook?.(sql,args);const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};},async run(){return this.runSync();}};}
// A D1 batch never yields to another request's standalone write between statements.
// Keep SQLite execution synchronous inside the transaction; only batches are queued.
const env={DB:{prepare:statement,batch(items){const pending=batchTail.then(()=>{beforeBatch?.(items);db.exec('BEGIN');try{const out=items.map(s=>s.runSync());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}});batchTail=pending.catch(()=>{});return pending;}}};
let broadcastImpl=async eps=>({sent:eps.length}),broadcastCalls=[];
let now=Date.parse('2026-09-28T10:00:00Z');
class TestDate extends Date{static now(){return now;}}
const module={exports:{}};
const context={module,exports:module.exports,console,crypto,Date:TestDate,Request,Response,URL,setTimeout,clearTimeout,require:(name)=>{
 if(name==='./d1-chunk'){const m={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync('cloudflare-deploy/src/d1-chunk.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});return m.exports;}
 if(name==='./approval-policy')return{isHqStaff:a=>!!a.ok&&!a.isTeacher&&['hq','staff'].includes(a.role),isExec:a=>a.username==='admin'};
 if(name==='./once-per-isolate')return{oncePerIsolate:f=>f};
 if(name==='./web-push')return{broadcastWebPush:async eps=>{broadcastCalls.push([...eps]);return broadcastImpl(eps);}};
 throw new Error(name);
}};
vm.runInNewContext(code,context);
const {handleDailyHandover:handle,checkHandover,normalizeHandover,reminderStage,runDailyHandoverSweep}=module.exports;
const actor=u=>({ok:true,username:u,name:u,role:'hq'});
async function api(route,body,u='alice',headers={}){const url=new URL('https://mangoi.ai/api/approval/handover'+route);const req=new Request(url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});const res=await handle(req,url,env,typeof u==='string'?actor(u):u);return{status:res.status,...await res.json()};}
const draft={report_date:'2026-09-28',recipient:'bob',payload:{work:'Answered a Kakao inquiry.',no_issue:true,no_open:true},version:0,request_key:'daily_test_request_0001'};
assert.equal((await api('/home')).ok,true);
assert.equal((await api('/home',null,{ok:true,username:'teacher',isTeacher:true,role:'hq'})).status,403);
assert.equal((await api('/save',draft,'alice',{'Origin':'https://evil.test'})).status,403);
assert.equal((await api('/save',{...draft,submit:true})).status,400,'confirmation required');
assert.equal((await api('/save',{...draft,payload:{...draft.payload,work:''},submit:true,confirmed:true})).status,400);
assert.equal((await api('/save',{...draft,recipient:'missing'})).status,400);
assert.equal((await api('/save',draft)).row.version,1);
assert.equal((await api('/home',null,'bob')).reports.length,0,'draft is not delivered');
assert.equal((await api('/home',null,'admin')).reports.length,0,'draft remains private even in overview');
assert.equal((await api('/save',draft)).duplicate,true,'retry idempotent');
assert.equal((await api('/save',{...draft,request_key:'daily_test_request_other'})).status,409,'stale tab rejected');
const sent=await api('/save',{...draft,version:1,request_key:'daily_test_request_0002',submit:true,confirmed:true});
assert.equal(sent.row.status,'submitted');
assert.equal((await api('/home',null,'carol')).reports.length,0,'unrelated staff cannot read');
assert.equal((await api('/home',null,'bob')).reports.length,1);
assert.equal((await api('/ack',{id:sent.row.id,version:2},'alice')).status,403,'no self acknowledgement');
assert.equal((await api('/ack',{id:sent.row.id,version:2},'carol')).status,404);
assert.equal((await api('/ack',{id:sent.row.id,version:1},'bob')).status,409);
assert.equal((await api('/ack',{id:sent.row.id,version:2},'bob')).ok,true);
assert.equal((await api('/home')).own.status,'acknowledged');
assert.equal((await api('/return',{id:sent.row.id,version:3,feedback:'Confirm the result'},'bob')).ok,true);
assert.equal((await api('/home')).own.status,'changes_requested');
// 📖 다시 읽기 — 확인·보완요청한 보고는 미확인에서 빠지고 여기서 다시 보인다(받은 사람만)
assert.equal((await api('/inbox',null,'bob')).reports.length,0,'reviewed report leaves unread');
const reread=await api('/read-history',null,'bob');
assert.equal(reread.ok,true);assert.equal(reread.reports.length,1,'recipient can re-read reviewed report');
assert.equal(reread.reports[0].payload.work,'Answered a Kakao inquiry.');
assert.equal((await api('/read-history',null,'carol')).reports.length,0,'unrelated staff cannot re-read');
assert.equal((await api('/read-history',null,'alice')).reports.length,0,'author does not see own report as re-read');
assert.equal((await api('/read-history?date=2026-11-30',null,'bob')).reports.length,0,'window is 30 days');
assert.equal((await api('/read-history',null,{ok:true,username:'teacher',isTeacher:true,role:'hq'})).status,403);
// 📤 내가 보낸 보고 — 작성자만, 확인 상태·보완 요청 내용이 실려야 한다(짝: 남은 못 본다)
const mineA=await api('/mine',null,'alice');
assert.equal(mineA.ok,true);assert.equal(mineA.reports.length,1,'author sees own sent report');
assert.equal(mineA.reports[0].status,'changes_requested','author sees review outcome');
assert.equal(mineA.reports[0].feedback,'Confirm the result','author sees feedback');
assert.equal(mineA.reports[0].acknowledged_by,'bob','author sees who reviewed');
assert.equal((await api('/mine',null,'bob')).reports.length,0,'recipient does not see it as own');
assert.equal((await api('/mine',null,'carol')).reports.length,0,'unrelated staff sees nothing');
assert.equal((await api('/mine?date=2026-11-30',null,'alice')).reports.length,0,'mine window is 30 days');
assert.equal((await api('/mine',null,{ok:true,username:'teacher',isTeacher:true,role:'hq'})).status,403);
const hjs=readFileSync('cloudflare-deploy/public/js/daily-handover.js','utf8');
assert.ok(/filter==='read'\)return readHistory/.test(hjs),'re-read filter draws history');
assert.ok(hjs.includes("call('/read-history')")&&hjs.includes("$('reread').onclick"),'re-read button is wired');
assert.ok(readFileSync('cloudflare-deploy/public/daily-handover.html','utf8').includes('id="mh-reread"'),'re-read button is visible');
assert.ok(/filter==='mine'\)return mine/.test(hjs)&&hjs.includes("call('/mine')")&&hjs.includes("$('mine').onclick"),'my-reports filter is wired');
assert.ok(readFileSync('cloudflare-deploy/public/daily-handover.html','utf8').includes('id="mh-mine"')&&readFileSync('cloudflare-deploy/public/daily-handover.html','utf8').includes('id="mh-own-status"'),'my-reports button and own status are visible');
assert.equal(db.prepare('SELECT count(*) AS n FROM daily_handover_history').get().n,3);
const open=normalizeHandover({work:'Checked',no_issue:true,no_open:false,open:'Follow up',owner:'bob',deadline:'2026-09-29T10:00'});
assert.equal(checkHandover(open,'2026-09-28').ready,true);
assert.equal(checkHandover({...open,deadline:'2026-09-29T25:00'},'2026-09-28').ready,false);
const review=await api('/review',{...draft,use_ai:true});assert.equal(review.ai_state,'unavailable');assert.equal(review.check.ready,true);
env.AI={run:async()=>({response:JSON.stringify({work:'Answered inquiry.',issue:'Invented',open:'Invented',tips:['Confirm details.']})})};
const ai=await api('/review',{...draft,use_ai:true});assert.equal(ai.suggestion.issue,'');assert.equal(ai.suggestion.open,'');
assert.equal(reminderStage({enabled:1,weekdays:'1,2,3,4,5',due_time:'19:00',exempt_date:''},'2026-09-28',now),'due');
assert.equal(reminderStage({enabled:1,weekdays:'1',due_time:'19:00',exempt_date:'2026-09-28'},'2026-09-28',now),null);
assert.equal(reminderStage({enabled:1,weekdays:'0',due_time:'19:00'},'2026-09-28',now),null);
for(const user of ['alice','carol'])assert.equal((await api('/schedule',{enabled:true,weekdays:[1,2,3,4,5],due_time:'19:00',exempt_date:''},user)).ok,true);
await runDailyHandoverSweep(env);await runDailyHandoverSweep(env);
assert.equal(db.prepare('SELECT count(*) AS n FROM daily_handover_notices').get().n,1,'no duplicates and submitted report suppresses alert');
assert.equal(db.prepare('SELECT username FROM daily_handover_notices').get().username,'carol');

// Attachments use private R2 objects; test actual route authorization and signatures.
const objects=new Map();env.RECORDINGS={put:async(k,b)=>objects.set(k,b),get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async k=>objects.delete(k)};
async function upload(name,content,user='alice') {const u=new URL('https://mangoi.ai/api/approval/handover/attachment?date=2026-09-28');const req=new Request(u,{method:'POST',headers:{'X-File-Name':encodeURIComponent(name)},body:content});const r=await handle(req,u,env,actor(user));return {status:r.status,...await r.json()};}
async function getFile(id,user){const u=new URL('https://mangoi.ai/api/approval/handover/attachment?id='+id);return handle(new Request(u),u,env,actor(user));}
assert.equal((await upload('bad.pdf','<html>bad</html>')).status,400);
assert.equal((await upload('bad.html','%PDF-1.7 sample')).status,400);
const pdf=await upload('보고서.pdf','%PDF-1.7 test');assert.equal(pdf.ok,true);
assert.equal((await getFile(pdf.file.id,'alice')).status,200);
assert.equal((await getFile(pdf.file.id,'admin')).status,404,'staged files private even to exec');
assert.equal((await getFile(pdf.file.id,'bob')).status,404);
const foreign=await upload('foreign.pdf','%PDF-1.7 other','carol');
let current=(await api('/home')).own;
assert.equal((await api('/save',{...draft,version:current.version,request_key:'foreign_file_test_0000',payload:{...draft.payload,attachments:[foreign.file.id]},submit:true,confirmed:true})).status,400);
const withFile=await api('/save',{...draft,version:current.version,request_key:'attached_file_test_000',payload:{...draft.payload,attachments:[pdf.file.id]},submit:true,confirmed:true});assert.equal(withFile.ok,true);
assert.equal((await getFile(pdf.file.id,'bob')).status,200);
assert.match((await getFile(pdf.file.id,'bob')).headers.get('Content-Disposition'),/^inline/);
assert.match((await getFile(pdf.file.id,'bob')).headers.get('Content-Security-Policy'),/sandbox/);
assert.equal((await getFile(pdf.file.id,'carol')).status,404);
assert.equal((await api('/home',null,'bob')).files[0].name,'보고서.pdf');
assert.equal((await api('/inbox',null,'bob')).total,1);
assert.equal((await api('/inbox',null,'carol')).total,0);
// After-hours normal reports wait; urgent reports do not. No queue duplication across retries.
db.exec("INSERT INTO push_subscriptions VALUES('bob-device','bob',1)");
const beforeQueue=()=>db.prepare('SELECT count(*) n FROM push_queue').get().n;
await runDailyHandoverSweep(env);assert.equal(beforeQueue(),0,'normal quiet hours');
now=Date.parse('2026-09-29T00:00:00Z');await runDailyHandoverSweep(env);assert.equal(beforeQueue(),1,'next workday delivers unread previous-day report');
const alert=()=>db.prepare('SELECT * FROM daily_handover_read_alerts WHERE report_id=? AND version=?').get(withFile.row.id,withFile.row.version);
assert.equal(alert().attempts,1);await runDailyHandoverSweep(env);assert.equal(alert().attempts,1);
now+=59*60000;await runDailyHandoverSweep(env);assert.equal(alert().attempts,1);
now+=60000;await runDailyHandoverSweep(env);assert.equal(alert().attempts,2);assert.equal(beforeQueue(),1,'one pending notification per report/version/device');
assert.equal((await api('/ack',{id:withFile.row.id,version:withFile.row.version},'bob')).ok,true);assert.equal(beforeQueue(),0);assert.equal((await api('/inbox',null,'bob')).total,0);
now+=3600000;await runDailyHandoverSweep(env);assert.equal(beforeQueue(),0,'ack stops wakeups');
now=Date.parse('2026-09-29T14:00:00Z');
const urgent=await api('/save',{...draft,report_date:'2026-09-29',version:0,request_key:'urgent_handover_00001',payload:{...draft.payload,priority:'urgent'},submit:true,confirmed:true});assert.equal(urgent.push,'sent','urgent even off-hours');
const attempts=()=>db.prepare('SELECT attempts FROM daily_handover_read_alerts WHERE report_id=?').get(urgent.row.id).attempts;
now+=14*60000;await runDailyHandoverSweep(env);assert.equal(attempts(),1);
now+=60000;await runDailyHandoverSweep(env);assert.equal(attempts(),2);
assert.equal((await api('/read-schedule',{weekdays:[1,2],start_time:'10:00',end_time:'18:00'},'bob')).ok,true);
assert.equal((await api('/read-schedule',{weekdays:[],start_time:'10:00',end_time:'18:00'},'bob')).status,400);
assert.equal((await api('/read-schedule',{weekdays:[1],start_time:'20:00',end_time:'09:00'},'bob')).status,400);
console.log('PASS handover files/read reminders: real route uploads, signature checks, private drafts, cross-user denial, authenticated downloads, previous-day inbox, quiet hours, hourly/15-min reminders, deduplication and acknowledgement cancellation');
// Response tracking and sender follow-ups stay isolated by actor and revision.
now=Date.parse('2026-09-30T01:00:00Z');
assert.equal((await api('/read-schedule',{weekdays:[1,2,3,4,5],start_time:'09:00',end_time:'19:00'},'bob')).ok,true);
const follow=await api('/save',{...draft,report_date:'2026-09-30',version:0,request_key:'followup_revision_0001',submit:true,confirmed:true});
const ref={id:follow.row.id,version:follow.row.version};
assert.equal((await api('/opened',ref,'carol')).status,404);
assert.equal((await api('/opened',ref,'alice')).status,403);
assert.equal((await api('/opened',ref,'bob')).ok,true);
assert.equal((await api('/opened',ref,'bob')).ok,true);
assert.equal((await api('/mine',null,'alice')).reports[0].followup.opened_at,now);
assert.equal((await api('/followup',{...ref,action:'remind'},'bob')).status,403);
assert.equal((await api('/followup',{...ref,action:'final'},'alice')).status,400);
assert.equal((await api('/followup',{...ref,action:'deadline',due_at:now-1},'alice')).status,400);
assert.equal((await api('/followup',{...ref,action:'deadline',due_at:now+3600000,escalation_to:'carol'},'alice')).status,400);
const due=now+3600000;
assert.equal((await api('/followup',{...ref,action:'deadline',due_at:due,escalation_to:'admin'},'alice')).ok,true);
assert.equal((await api('/followup',{...ref,action:'remind'},'alice')).ok,true);
assert.equal((await api('/followup',{...ref,action:'remind'},'alice')).status,429,'deduplicate repeated clicks');
assert.equal((await api('/hold',{...ref,reason:'',hold_until:now+60000},'bob')).status,400);
assert.equal((await api('/hold',{...ref,reason:'Checking the details',hold_until:due+60000},'bob')).ok,true);
now=due;await runDailyHandoverSweep(env);
const followMeta=()=>db.prepare('SELECT * FROM daily_handover_followup WHERE report_id=? AND version=?').get(ref.id,ref.version);
assert.equal(followMeta().warning_level,1,'valid hold pauses escalation');
now+=60000;await runDailyHandoverSweep(env);assert.equal(followMeta().warning_level,2,'hold expiry resumes overdue alert');
now=due+3600000;await runDailyHandoverSweep(env);assert.equal(followMeta().warning_level,3);
db.exec("INSERT INTO push_subscriptions VALUES('alice-device','alice',1),('admin-device','admin',1)");
now=due+3*3600000;await runDailyHandoverSweep(env);assert.equal(followMeta().warning_level,4);
await runDailyHandoverSweep(env);
const history=await api('/followup-history?id='+ref.id,null,'alice');
assert.equal(history.events.filter(e=>e.kind==='opened').length,1,'opening is idempotent');
assert.equal(history.events.filter(e=>e.kind==='escalated').length,1,'sweep escalation is idempotent');
assert.equal((await api('/followup-history?id='+ref.id,null,'carol')).status,404);
assert.equal((await api('/ack',ref,'bob')).ok,true);
assert.equal((await api('/followup',{...ref,action:'remind'},'alice')).status,409,'resolved reports cannot be nudged');
assert.equal(db.prepare("SELECT count(*) n FROM push_queue WHERE tag=?").get(`handover-followup:${ref.id}:${ref.version}`).n,0);
const fresh=await api('/save',{...draft,report_date:'2026-09-30',version:ref.version+1,request_key:'followup_revision_0002',submit:true,confirmed:true});
assert.equal(fresh.ok,true);
assert.equal((await api('/mine',null,'alice')).reports[0].followup,null,'resubmission starts with fresh read/deadline state');
assert.equal((await api('/opened',ref,'bob')).status,409,'old tab cannot mark new revision read');
console.log('PASS follow-up: actor/revision isolation, opened timestamp, deadlines, cooldown, hold, 3 escalation stages, history authorization and response cancellation');

// Transactional follow-up delivery, using real SQLite rollback and a serialized D1.batch.
function fixture(level=3){
  statementHook=null;beforeBatch=null;broadcastImpl=async eps=>({sent:eps.length});broadcastCalls=[];
  now=Date.parse('2026-10-01T04:00:00Z');
  db.exec(`DELETE FROM daily_handover_schedule; DELETE FROM daily_handovers; DELETE FROM daily_handover_followup;
    DELETE FROM daily_handover_followup_events; DELETE FROM daily_handover_notices; DELETE FROM daily_handover_read_alerts; DELETE FROM push_queue;
    DELETE FROM push_subscriptions; DELETE FROM daily_handover_read_schedule;
    INSERT INTO push_subscriptions VALUES('bob-device','bob',1),('bob-device-2','bob',1),('alice-device','alice',1),('admin-device','admin',1)`);
  const result=db.prepare(`INSERT INTO daily_handovers(report_date,username,staff_name,recipient,payload,status,version,updated_at,submitted_at,request_key)
    VALUES('2026-10-01','alice','Alice','bob',?,'submitted',1,?,?,?)`).run(JSON.stringify({...draft.payload,work:'PRIVATE_STUDENT_DETAILS'}),now,now,'delivery_test');
  const id=Number(result.lastInsertRowid);
  db.prepare(`INSERT INTO daily_handover_followup(report_id,version,due_at,escalation_to,warning_level) VALUES(?,1,?,'admin',?)`).run(id,now-3*3600000,level);
  // Isolate follow-up queue counts from the independent read-reminder path.
  db.prepare('INSERT INTO daily_handover_read_alerts(report_id,version,next_at) VALUES(?,1,?)').run(id,Number.MAX_SAFE_INTEGER);
  return {id,version:1};
}
const metadata=r=>db.prepare('SELECT * FROM daily_handover_followup WHERE report_id=? AND version=?').get(r.id,r.version);
const queued=()=>db.prepare('SELECT * FROM push_queue ORDER BY endpoint,tag').all();
const events=()=>db.prepare('SELECT * FROM daily_handover_followup_events ORDER BY id').all();
function failedStage(r,oldQueue=[]){assert.equal(metadata(r).warning_level,3);assert.equal(metadata(r).last_request_at,null);assert.equal(events().length,0);assert.deepEqual(queued(),oldQueue);assert.equal(broadcastCalls.length,0);assert.equal(db.prepare("SELECT COUNT(*) n FROM daily_handover_notices WHERE kind LIKE 'handover-delivery:%'").get().n,0,'failed stage must not retain delivery markers');}
function completedFinal(r){
  assert.equal(metadata(r).warning_level,4);assert.equal(events().filter(e=>e.kind==='escalated').length,1);
  assert.equal(queued().length,4);assert.equal(broadcastCalls.length,1);
  assert.deepEqual(queued().map(q=>q.endpoint),['admin-device','alice-device','bob-device','bob-device-2']);
  assert.ok(queued().every(q=>!q.body.includes('PRIVATE_STUDENT_DETAILS')),'lockscreen remains generic');
}
let delivery=fixture();
db.exec(`CREATE TRIGGER fail_second_endpoint BEFORE INSERT ON push_queue WHEN NEW.endpoint='bob-device-2'
  BEGIN SELECT RAISE(ABORT,'injected second endpoint failure'); END`);
await runDailyHandoverSweep(env);failedStage(delivery);
db.exec('DROP TRIGGER fail_second_endpoint');
await runDailyHandoverSweep(env);completedFinal(delivery);
await runDailyHandoverSweep(env);completedFinal(delivery);
// A second recipient failure must restore even an older queue row deleted earlier in this batch.
delivery=fixture();
db.prepare('INSERT INTO push_queue(endpoint,title,body,url,tag,queued_at) VALUES(?,?,?,?,?,?)')
  .run('bob-device','old title','old body','/old',`handover-followup:${delivery.id}:1`,now-1);
const oldQueue=queued();
statementHook=(sql,args)=>{if(sql.startsWith('INSERT INTO push_queue')&&args.includes('alice'))throw new Error('injected second recipient failure');};
await runDailyHandoverSweep(env);failedStage(delivery,oldQueue);
statementHook=null;await runDailyHandoverSweep(env);completedFinal(delivery);
delivery=fixture();
statementHook=sql=>{if(sql.startsWith('INSERT INTO daily_handover_followup_events'))throw new Error('injected event failure');};
await runDailyHandoverSweep(env);failedStage(delivery);
statementHook=null;await runDailyHandoverSweep(env);completedFinal(delivery);
// Once durable, network errors and partial wakeups never discard queued delivery or duplicate the stage.
delivery=fixture();
broadcastImpl=async()=>{assert.equal(metadata(delivery).warning_level,4);assert.equal(queued().length,4);assert.equal(events().length,1);throw new Error('injected network failure');};
await runDailyHandoverSweep(env);completedFinal(delivery);
await runDailyHandoverSweep(env);completedFinal(delivery);
delivery=fixture();
broadcastImpl=async()=>({sent:1,failed:3,expired:[]});
await runDailyHandoverSweep(env);completedFinal(delivery);
delivery=fixture();
statementHook=sql=>{if(sql.startsWith('UPDATE daily_handover_followup SET warning_level=MAX'))throw new Error('injected advancement failure');};
await runDailyHandoverSweep(env);failedStage(delivery);
statementHook=null;await runDailyHandoverSweep(env);completedFinal(delivery);
delivery=fixture();
await Promise.all([runDailyHandoverSweep(env),runDailyHandoverSweep(env),runDailyHandoverSweep(env)]);completedFinal(delivery);
// Reachable recipients are queued once; missing recipients remain explicitly pending.
for(const user of ['bob','alice','admin']){
  delivery=fixture();db.prepare('UPDATE push_subscriptions SET enabled=0 WHERE user_id=?').run(user);
  await Promise.all([runDailyHandoverSweep(env),runDailyHandoverSweep(env)]);
  const pending=()=>db.prepare("SELECT username FROM daily_handover_notices WHERE kind LIKE 'handover-delivery:%' AND push_state='no_subscription'").all();
  assert.deepEqual(pending().map(n=>n.username),[user]);assert.equal(metadata(delivery).warning_level,3);assert.equal(events().length,0);
  const reachableCount=user==='bob'?2:3;
  assert.equal(queued().length,reachableCount);assert.equal(broadcastCalls.length,1);
  const inbox=await api('/inbox',null,'bob');assert.equal(inbox.reports.length,1);assert.equal(inbox.reports[0].status,'submitted');
  assert.deepEqual(inbox.reports[0].followup.delivery_pending,[user]);
  assert.deepEqual((await api('/mine',null,'alice')).reports[0].followup.delivery_pending,[user]);
  const alreadyQueued=queued();await runDailyHandoverSweep(env);assert.deepEqual(queued(),alreadyQueued);assert.equal(broadcastCalls.length,1);
  // Consuming the queue must not cause redelivery while another recipient is offline.
  db.exec('DELETE FROM push_queue');await runDailyHandoverSweep(env);assert.equal(queued().length,0);assert.equal(broadcastCalls.length,1);
  db.prepare('UPDATE push_subscriptions SET enabled=1 WHERE user_id=?').run(user);
  // Even completion of a partial stage is transactional with its final event.
  statementHook=sql=>{if(sql.startsWith('INSERT INTO daily_handover_followup_events'))throw new Error('injected partial completion event failure');};
  await runDailyHandoverSweep(env);assert.equal(metadata(delivery).warning_level,3);assert.equal(events().length,0);assert.equal(queued().length,0);assert.equal(pending().length,1);
  statementHook=null;await runDailyHandoverSweep(env);
  assert.equal(metadata(delivery).warning_level,4);assert.equal(events().length,1);assert.equal(pending().length,0);
  assert.equal(queued().length,4-reachableCount);assert.equal(broadcastCalls.length,2);
  assert.deepEqual((await api('/mine',null,'alice')).reports[0].followup.delivery_pending,[]);
  const finalQueue=queued();await runDailyHandoverSweep(env);assert.deepEqual(queued(),finalQueue);assert.equal(broadcastCalls.length,2);
}
assert.ok(hjs.includes('Device notification pending: ')&&hjs.includes('f.delivery_pending.map(staffName)'),'pending recipients visible in app');
// Snapshot races between the sweep read and its batch cannot enqueue stale work.
for(const race of ['revision','ack','deadline','escalation','hold','read-window']){
  delivery=fixture();
  beforeBatch=items=>{if(!items.some(s=>s.sql.startsWith('INSERT INTO push_queue')))return;beforeBatch=null;
    if(race==='revision'){db.prepare('UPDATE daily_handovers SET version=version+1 WHERE id=?').run(delivery.id);db.prepare('INSERT INTO daily_handover_read_alerts(report_id,version,next_at) VALUES(?,2,?)').run(delivery.id,Number.MAX_SAFE_INTEGER);}
    if(race==='ack')db.prepare("UPDATE daily_handovers SET status='acknowledged',version=version+1 WHERE id=?").run(delivery.id);
    if(race==='deadline')db.prepare('UPDATE daily_handover_followup SET due_at=? WHERE report_id=?').run(now+3600000,delivery.id);
    if(race==='escalation')db.prepare("UPDATE daily_handover_followup SET escalation_to='' WHERE report_id=?").run(delivery.id);
    if(race==='hold')db.prepare('UPDATE daily_handover_followup SET hold_until=? WHERE report_id=?').run(now+3600000,delivery.id);
    if(race==='read-window')db.prepare("INSERT INTO daily_handover_read_schedule VALUES('bob','1,2,3,4,5','15:00','19:00',?)").run(now);
  };
  await runDailyHandoverSweep(env);failedStage(delivery);
}
// A concurrent unsubscribe defers only that recipient, rather than consuming or blocking the stage.
delivery=fixture();
beforeBatch=items=>{if(!items.some(s=>s.sql.startsWith('INSERT INTO push_queue')))return;beforeBatch=null;db.exec("UPDATE push_subscriptions SET enabled=0 WHERE user_id='admin'");};
await runDailyHandoverSweep(env);assert.equal(metadata(delivery).warning_level,3);assert.equal(events().length,0);assert.equal(queued().length,3);assert.equal(broadcastCalls.length,1);
assert.deepEqual((await api('/mine',null,'alice')).reports[0].followup.delivery_pending,['admin']);
// Existing read windows and holds still control scheduled escalation, even for urgent payloads.
delivery=fixture();db.prepare('UPDATE daily_handover_followup SET hold_until=? WHERE report_id=?').run(now+60000,delivery.id);
await runDailyHandoverSweep(env);failedStage(delivery);now+=60000;
await runDailyHandoverSweep(env);completedFinal(delivery);
delivery=fixture();now=Date.parse('2026-10-01T11:00:00Z');await runDailyHandoverSweep(env);failedStage(delivery);
now=Date.parse('2026-10-02T00:00:00Z');await runDailyHandoverSweep(env);completedFinal(delivery);
// The first 100 held/offline reports cannot starve a later reachable report.
delivery=fixture();db.exec('DELETE FROM daily_handovers; DELETE FROM daily_handover_followup; DELETE FROM daily_handover_read_alerts');
let lastReport;
for(let i=0;i<101;i++){
  const user=i===100?'carol':'offline-'+i;
  const created=db.prepare(`INSERT INTO daily_handovers(report_date,username,staff_name,recipient,payload,status,version,updated_at,submitted_at,request_key)
    VALUES('2026-10-01',?,?,'bob',?,'submitted',1,?,?,?)`).run(user,user,JSON.stringify(draft.payload),now,now,'fair-'+i);
  const id=Number(created.lastInsertRowid);lastReport={id,version:1};
  db.prepare(`INSERT INTO daily_handover_followup(report_id,version,due_at,escalation_to,warning_level,hold_until) VALUES(?,1,?,'admin',3,?)`)
    .run(id,now-3*3600000,i<50?now+3600000:null);
  db.prepare('INSERT INTO daily_handover_read_alerts(report_id,version,next_at) VALUES(?,1,?)').run(id,Number.MAX_SAFE_INTEGER);
}
db.exec("INSERT INTO push_subscriptions VALUES('carol-device','carol',1)");
await runDailyHandoverSweep(env);assert.equal(metadata(lastReport).warning_level,3,'first sweep is bounded to 100');
await runDailyHandoverSweep(env);assert.equal(metadata(lastReport).warning_level,4,'least-recent attempt ordering reaches the 101st report');
assert.equal(events().filter(e=>e.report_id===lastReport.id&&e.kind==='escalated').length,1);
// Manual reminders/final warnings share the durable write boundary and preserve cooldown semantics.
for(const action of ['remind','final']){
  delivery=fixture(0);
  statementHook=sql=>{if(sql.startsWith('INSERT INTO daily_handover_followup_events'))throw new Error('injected manual event failure');};
  assert.equal((await api('/followup',{...delivery,action})).status,503);
  assert.equal(metadata(delivery).warning_level,0);assert.equal(metadata(delivery).last_request_at,null);assert.equal(events().length,0);assert.equal(queued().length,0);
  statementHook=null;broadcastCalls=[];broadcastImpl=async()=>{throw new Error('manual wakeup failure');};
  const retry=await api('/followup',{...delivery,action});assert.equal(retry.ok,true);assert.equal(retry.push,'queued');
  assert.equal(metadata(delivery).warning_level,action==='final'?3:1);assert.equal(metadata(delivery).last_request_at,now);
  assert.equal(events().length,1);assert.equal(queued().length,2);assert.equal(broadcastCalls.length,1);
  assert.equal((await api('/followup',{...delivery,action})).status,429);
}
delivery=fixture(0);db.exec("UPDATE push_subscriptions SET enabled=0 WHERE user_id='bob'");
const unsubscribed=await api('/followup',{...delivery,action:'final'});
assert.equal(unsubscribed.status,503);assert.equal(unsubscribed.ok,false);assert.equal(unsubscribed.push,'no_subscription');
assert.equal(metadata(delivery).warning_level,0);assert.equal(metadata(delivery).last_request_at,null);assert.equal(events().length,0);assert.equal(queued().length,0);
db.exec("UPDATE push_subscriptions SET enabled=1 WHERE user_id='bob'");
assert.equal((await api('/followup',{...delivery,action:'final'})).ok,true,'no subscription must not start a cooldown');
delivery=fixture(0);
beforeBatch=items=>{if(!items.some(s=>s.sql.startsWith('INSERT INTO push_queue')))return;beforeBatch=null;db.exec("UPDATE push_subscriptions SET enabled=0 WHERE user_id='bob'");};
const lostSubscription=await api('/followup',{...delivery,action:'final'});
assert.equal(lostSubscription.status,503);assert.equal(lostSubscription.push,'no_subscription');assert.equal(metadata(delivery).warning_level,0);
assert.equal(metadata(delivery).last_request_at,null);assert.equal(events().length,0);assert.equal(queued().length,0);assert.equal(broadcastCalls.length,0);
delivery=fixture(0);
const concurrentManual=await Promise.all([api('/followup',{...delivery,action:'final'}),api('/followup',{...delivery,action:'final'})]);
assert.deepEqual(concurrentManual.map(r=>r.status).sort(),[200,429]);assert.equal(events().length,1);assert.equal(queued().length,2);assert.equal(broadcastCalls.length,1);
delivery=fixture(0);
beforeBatch=items=>{if(!items.some(s=>s.sql.startsWith('INSERT INTO push_queue')))return;beforeBatch=null;db.prepare("UPDATE daily_handovers SET status='acknowledged',version=version+1 WHERE id=?").run(delivery.id);};
assert.equal((await api('/followup',{...delivery,action:'final'})).status,409);
assert.equal(metadata(delivery).warning_level,0);assert.equal(metadata(delivery).last_request_at,null);assert.equal(events().length,0);assert.equal(queued().length,0);assert.equal(broadcastCalls.length,0);
console.log('PASS follow-up durable delivery: endpoint/recipient/event rollback, retryable final escalation, post-commit wakeup failure, concurrent sweeps/manual requests, per-recipient subscription retries without redelivery, visible in-app pending state, fair 101-report sweep, stale revision/ack/deadline/escalation/hold/read-window races and generic payloads');

// Ack/return state, version and trigger history share the response event transaction.
const report=r=>db.prepare('SELECT * FROM daily_handovers WHERE id=?').get(r.id);
const revisions=r=>db.prepare('SELECT * FROM daily_handover_history WHERE report_id=? ORDER BY id').all(r.id);
const responseKind=route=>route==='/ack'?'acknowledged':'changes_requested';
function responseFixture(){
  const r=fixture(0);
  for(const version of [r.version,r.version+1])for(const tag of ['handover-read','handover-followup','handover-escalation']){
    db.prepare('INSERT INTO push_queue(endpoint,title,body,url,tag,queued_at) VALUES(?,?,?,?,?,?)')
      .run('bob-device','Report','Review the report','/daily-handover.html',`${tag}:${r.id}:${version}`,now);
  }
  return r;
}
function oneResponse(r,route,feedback,who='bob'){
  const row=report(r);
  assert.equal(row.version,r.version+1);assert.equal(row.status,responseKind(route));
  assert.equal(row.acknowledged_by,who);assert.equal(row.feedback,feedback);
  assert.equal(revisions(r).length,1,'one history row, including across retries');
  assert.equal(revisions(r)[0].version,r.version);assert.equal(revisions(r)[0].status,'submitted');
  assert.equal(events().length,1,'one response event, including across retries');
  assert.deepEqual([events()[0].report_id,events()[0].version,events()[0].actor,events()[0].kind,events()[0].detail,events()[0].created_at],
    [r.id,r.version,who,responseKind(route),feedback,row.acknowledged_at]);
}
for(const route of ['/ack','/return']){
  const r=responseFixture(), feedback=route==='/return'?'Confirm the result':'Read and checked';
  const body={...r,feedback:` ${feedback} `}, before=report(r), oldQueue=queued();
  db.exec(`CREATE TRIGGER fail_response_event BEFORE INSERT ON daily_handover_followup_events
    WHEN NEW.kind IN ('acknowledged','changes_requested') BEGIN SELECT RAISE(ABORT,'injected response event failure'); END`);
  let sawTransactionalHistory=false;
  statementHook=sql=>{if(sql.startsWith('INSERT INTO daily_handover_followup_events')){
    assert.equal(report(r).version,r.version+1);assert.equal(revisions(r).length,1);sawTransactionalHistory=true;
  }};
  assert.equal((await api(route,body,'bob')).status,503);
  assert.equal(sawTransactionalHistory,true,'the event failure occurs after state and trigger history changed');
  assert.deepEqual(report(r),before,'event failure rolls back every report field');
  assert.equal(revisions(r).length,0,'event failure rolls back the BEFORE UPDATE history trigger');
  assert.equal(events().length,0);assert.deepEqual(queued(),oldQueue,'failed transaction does not clean up notifications');
  statementHook=null;db.exec('DROP TRIGGER fail_response_event');
  assert.equal((await api(route,body,'bob')).ok,true);oneResponse(r,route,feedback);
  assert.equal(queued().length,3);assert.ok(queued().every(q=>q.tag.endsWith(`:${r.version+1}`)),'response cleanup leaves newer revision tags');
  const committed=report(r), savedHistory=revisions(r), savedEvents=events();
  now+=1000;
  for(let i=0;i<3;i++){
    const retry=await api(route,{...body,feedback},'bob');assert.equal(retry.status,200);assert.equal(retry.duplicate,true);
    assert.deepEqual(report(r),committed);assert.deepEqual(revisions(r),savedHistory);assert.deepEqual(events(),savedEvents);
  }
  assert.equal((await api(route,body,'admin')).status,409,'another authorized actor cannot claim the same response');
  assert.equal((await api(route,{...body,feedback:'Different feedback'},'bob')).status,409);
  assert.equal((await api(route==='/ack'?'/return':'/ack',body,'bob')).status,409,'another action is not a retry');
  assert.equal((await api(route,body,'alice')).status,403,'author still cannot respond to own report');
  assert.equal((await api(route,body,'carol')).status,404,'unrelated actor still cannot discover the report');
  assert.equal((await api(route,body,{ok:true,username:'bob',isTeacher:true,role:'hq'})).status,403);
  assert.equal((await api(route,body,'bob',{'Origin':'https://evil.test'})).status,403);
  assert.deepEqual(report(r),committed);assert.deepEqual(events(),savedEvents);assert.deepEqual(revisions(r),savedHistory);
  const resubmitted=await api('/save',{...draft,report_date:'2026-10-01',version:committed.version,request_key:`response_retry_${route.slice(1)}_new`,submit:true,confirmed:true});
  assert.equal(resubmitted.ok,true);assert.equal(resubmitted.row.version,r.version+2);
  const newer=report(r), newerHistory=revisions(r);
  assert.equal((await api(route,body,'bob')).status,409,'old response event never authorizes a newer revision');
  assert.deepEqual(report(r),newer);assert.deepEqual(revisions(r),newerHistory);assert.deepEqual(events(),savedEvents);
}
// Exact concurrent retries succeed once; differing actor/action/feedback yields one conflict.
for(const route of ['/ack','/return']){
  let r=responseFixture(), body={...r,feedback:'Checked'};
  const same=await Promise.all([api(route,body,'bob'),api(route,body,'bob'),api(route,body,'bob')]);
  assert.deepEqual(same.map(x=>x.status),[200,200,200]);assert.equal(same.filter(x=>x.duplicate).length,2);
  oneResponse(r,route,'Checked');
  for(const difference of ['actor','action','feedback']){
    r=responseFixture();body={...r,feedback:'Checked'};
    const otherRoute=difference==='action'?(route==='/ack'?'/return':'/ack'):route;
    const otherBody=difference==='feedback'?{...body,feedback:'Different'}:body;
    const attempts=await Promise.all([api(route,body,'bob'),api(otherRoute,otherBody,difference==='actor'?'admin':'bob')]);
    assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);
    const winner=attempts[0].ok?{route,feedback:'Checked',who:'bob'}:{route:otherRoute,feedback:otherBody.feedback,who:difference==='actor'?'admin':'bob'};
    oneResponse(r,winner.route,winner.feedback,winner.who);
  }
}
// Failures in any/all post-commit cleanup steps remain success, with exact retries repairing them.
for(const route of ['/ack','/return'])for(const failure of ['handover-read','handover-followup','handover-escalation','all']){
  const r=responseFixture(), body={...r,feedback:'Checked'}, cleanupAttempts=[];
  statementHook=(sql,args)=>{if(sql==='DELETE FROM push_queue WHERE tag=?'){
    cleanupAttempts.push(args[0]);if(failure==='all'||args[0].startsWith(failure+':'))throw new Error('injected response cleanup failure');
  }};
  assert.equal((await api(route,body,'bob')).ok,true);oneResponse(r,route,'Checked');
  assert.equal(cleanupAttempts.length,3,'each cleanup is attempted even after another fails');
  assert.equal(queued().length,failure==='all'?6:4);
  statementHook=null;
  const retry=await api(route,body,'bob');assert.equal(retry.ok,true);assert.equal(retry.duplicate,true);
  oneResponse(r,route,'Checked');assert.equal(queued().length,3);assert.ok(queued().every(q=>q.tag.endsWith(':2')));
}
// A matching row without its committed event is not sufficient evidence of an exact retry.
for(const route of ['/ack','/return']){
  const r=responseFixture(), body={...r,feedback:'Checked'};
  db.prepare('UPDATE daily_handovers SET status=?,version=2,acknowledged_by=?,feedback=?,acknowledged_at=? WHERE id=?')
    .run(responseKind(route),'bob','Checked',now,r.id);
  const before=report(r), beforeHistory=revisions(r), beforeQueue=queued();
  assert.equal((await api(route,body,'bob')).status,409);assert.deepEqual(report(r),before);
  assert.deepEqual(revisions(r),beforeHistory);assert.deepEqual(queued(),beforeQueue);assert.equal(events().length,0);
}
// A revision/status/recipient change after the initial authorized read is rejected inside the transaction.
for(const race of ['revision','status','recipient']){
  const r=responseFixture();
  beforeBatch=items=>{if(!items.some(s=>s.sql.startsWith('UPDATE daily_handovers SET status=')))return;beforeBatch=null;
    if(race==='revision')db.prepare('UPDATE daily_handovers SET version=version+1 WHERE id=?').run(r.id);
    if(race==='status')db.prepare("UPDATE daily_handovers SET status='changes_requested' WHERE id=?").run(r.id);
    if(race==='recipient')db.prepare("UPDATE daily_handovers SET recipient='carol',version=version+1 WHERE id=?").run(r.id);
  };
  const beforeQueue=queued();
  assert.equal((await api('/ack',r,'bob')).status,409);assert.equal(events().length,0);
  assert.equal(revisions(r).length,1,'only the racing update is in history');assert.deepEqual(queued(),beforeQueue);
}
console.log('PASS handover responses: atomic ack/return state/event/trigger-history rollback; exact repeated/concurrent retries; actor/action/feedback/revision conflicts; authorization; independent post-commit cleanup failures and retry recovery; missing-event and stale-read races');
// History versions describe storage transitions, never inferred submission numbers.
let historyRef=fixture(0);
assert.equal((await api('/followup',{...historyRef,action:'deadline',due_at:now+60000},'alice')).ok,true);
assert.equal((await api('/followup',{...historyRef,action:'final'},'alice')).ok,true);
let historyRows=await api('/followup-history?id='+historyRef.id);
assert.equal(historyRows.current_version,1);assert.equal(historyRows.filtered_version,null);
assert.equal(historyRows.limit,50);assert.equal(historyRows.has_more,false);
assert.ok(historyRows.events.some(e=>e.kind==='final'&&e.version===1));
const originalEvents=events();
assert.equal((await api('/return',{...historyRef,feedback:'Revise the result'},'bob')).ok,true);
let afterReturn=await api('/followup-history?id='+historyRef.id);
assert.equal(afterReturn.current_version,2);
assert.equal(afterReturn.events[0].kind,'changes_requested');assert.equal(afterReturn.events[0].version,1,'response uses pre-transition stored version');
let currentHistory=await api('/followup-history?id='+historyRef.id+'&version=2');
assert.equal(currentHistory.current_version,2);assert.equal(currentHistory.filtered_version,2);assert.deepEqual(currentHistory.events,[],'current stored version is not version minus one');
const revised=await api('/save',{...draft,report_date:'2026-10-01',version:2,request_key:'history_revised_000001',payload:{...draft.payload,work:'Revised result'},submit:true,confirmed:true});
assert.equal(revised.ok,true);assert.equal(revised.row.version,3);
assert.equal((await api('/opened',{id:historyRef.id,version:3},'bob')).ok,true);
const afterResubmit=await api('/followup-history?id='+historyRef.id);
assert.equal(afterResubmit.current_version,3);
assert.equal(afterResubmit.events[0].version,3);assert.equal(afterResubmit.events[0].kind,'opened');
currentHistory=await api('/followup-history?id='+historyRef.id+'&version=3');
assert.deepEqual(currentHistory.events.map(e=>e.kind),['opened'],'exact current version excludes earlier warning and response');
const earlierHistory=await api('/followup-history?id='+historyRef.id+'&version=1');
assert.ok(earlierHistory.events.every(e=>e.version===1));assert.ok(earlierHistory.events.some(e=>e.kind==='final'));
assert.equal(earlierHistory.current_version,3);assert.equal(earlierHistory.filtered_version,1);
assert.equal((await api('/ack',{id:historyRef.id,version:3},'bob')).ok,true);
const afterAck=await api('/followup-history?id='+historyRef.id);
assert.equal(afterAck.current_version,4);assert.equal(afterAck.events[0].version,3);assert.equal(afterAck.events[0].kind,'acknowledged');
assert.deepEqual((await api('/followup-history?id='+historyRef.id+'&version=4')).events,[]);
assert.deepEqual(events().slice(0,originalEvents.length),originalEvents,'history reads/response/resubmit never rewrite old events');
for(const user of ['alice','bob','admin'])assert.equal((await api('/followup-history?id='+historyRef.id,null,user)).status,200);
for(const suffix of ['', '&version=1', '&version=4', '&version=999']){
  const denied=await api('/followup-history?id='+historyRef.id+suffix,null,'carol');
  assert.equal(denied.status,404);assert.equal(denied.events,undefined);assert.equal(denied.current_version,undefined);
}
assert.equal((await api('/followup-history?id='+historyRef.id,null,{ok:true,username:'bob',isTeacher:true,role:'hq'})).status,403);
assert.equal((await api('/followup-history?id=999999')).status,404);
const wrongVersion=await api('/followup-history?id='+historyRef.id+'&version=999');
assert.equal(wrongVersion.status,200);assert.equal(wrongVersion.current_version,4);assert.equal(wrongVersion.filtered_version,999);assert.deepEqual(wrongVersion.events,[]);
for(const value of ['', '0','-1','1.5','1e0','01','+1',' 1','1 ','NaN','Infinity','9007199254740992','1 OR 1=1']){
  const invalid=await api('/followup-history?id='+historyRef.id+'&version='+encodeURIComponent(value));
  assert.equal(invalid.status,400,value);assert.equal(invalid.error,'version');
}
assert.equal((await api('/followup-history?id='+historyRef.id+'&version=1&version=2')).status,400);
const draftRow=db.prepare(`INSERT INTO daily_handovers(report_date,username,staff_name,recipient,payload,status,version,updated_at,request_key)
  VALUES('2026-09-20','alice','Alice','bob','{}','draft',1,?,'private_history')`).run(now);
const privateId=Number(draftRow.lastInsertRowid);
assert.deepEqual((await api('/followup-history?id='+privateId)).events,[]);
for(const user of ['bob','admin','carol'])assert.equal((await api('/followup-history?id='+privateId,null,user)).status,404,'draft visibility unchanged');

// A failed/malformed database read is unavailable, not an empty or invisible history.
const historyPrepare=env.DB.prepare;
for(const bad of [{success:false,results:[]},{success:true},{success:true,results:{} }]){
  env.DB.prepare=sql=>{const stmt=historyPrepare(sql);if(sql.includes('h.version AS current_version'))stmt.all=async()=>bad;return stmt;};
  try{const failed=await api('/followup-history?id='+historyRef.id);assert.equal(failed.status,503);assert.equal(failed.events,undefined);assert.equal(failed.current_version,undefined);}
  finally{env.DB.prepare=historyPrepare;}
}

// Execute shipped UI renderers and real event handlers against API responses.
// The small DOM implements tree attachment/text, so repaint/removal and stale requests are observable.
class HistoryNode{
  constructor(tag,content='',className=''){this.tag=tag;this.children=[];this.parent=null;this.value='';this.hidden=false;this.disabled=false;this.className=className;this._text=content==null?'':String(content);this.attributes={};}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get isConnected(){return this.connectedRoot===true||!!this.parent?.isConnected;}
  append(...nodes){for(const n of nodes){if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);n.parent=this;this.children.push(n);}}
  replaceChildren(...nodes){for(const n of this.children)n.parent=null;this.children=[];this._text='';this.append(...nodes);}
  setAttribute(k,v){this.attributes[k]=v;}
  all(tag){return this.children.flatMap(n=>[...(n.tag===tag?[n]:[]),...n.all(tag)]);}
}
function historyUI(row,request=path=>api(path)){
  const host=new HistoryNode('main');host.connectedRoot=true;
  const errors=[];
  const ctx={node:(...args)=>new HistoryNode(...args),call:request,networkError:e=>errors.push(e),staffName:x=>x,
    me:{username:'admin'},members:[],document:{hidden:false},Date};
  const begin=hjs.indexOf('  function paintFollowupHistory('),end=hjs.indexOf('  // 작성자 시점',begin);
  assert.ok(begin>=0&&end>begin);vm.runInNewContext(hjs.slice(begin,end),ctx);
  ctx.paintFollowup(host,row);
  return {host,errors,button:host.all('button')[0],scope:host.all('select')[0],box:host.all('select')[0].parent.parent,
    async choose(value){this.scope.value=value;await this.scope.onchange();}};
}
let ui=historyUI(revised.row);
await ui.button.onclick();
assert.match(ui.host.textContent,/Current stored version: v4/,'server current_version wins over stale report row v3');
assert.match(ui.host.textContent,/This report view is v3; refresh/);
assert.match(ui.host.textContent,/v1 · 이전 저장 버전 \/ Earlier stored version/);
assert.match(ui.host.textContent,/Final warning/);assert.match(ui.host.textContent,/Response recorded against pre-transition stored version v3/);
assert.match(ui.host.textContent,/Stored versions count saves and responses, not submissions/);
assert.match(ui.host.textContent,/Up to 50 latest events, newest first/);
await ui.choose('current');
assert.match(ui.host.textContent,/No events recorded against the current stored version/);
assert.ok(!ui.host.textContent.includes('Final warning'),'old warnings do not appear in exact current scope');
assert.ok(!ui.host.textContent.includes('Acknowledged'),'pre-transition response is not relabeled current');
await ui.choose('all');assert.match(ui.host.textContent,/Final warning/);
await ui.button.onclick();assert.equal(ui.host.all('select').length,1,'repeat refresh replaces one history region');
// Re-render the return and revised/resubmitted snapshots, including response-base labeling.
ui=historyUI({...revised.row,version:2,status:'changes_requested'},async()=>afterReturn);await ui.button.onclick();
assert.match(ui.host.textContent,/Current stored version: v2/);assert.match(ui.host.textContent,/pre-transition stored version v1/);
ui=historyUI(revised.row,async path=>path.includes('version=3')?{...afterResubmit,filtered_version:3,events:afterResubmit.events.filter(e=>e.version===3)}:afterResubmit);
await ui.button.onclick();await ui.choose('current');assert.match(ui.host.textContent,/v3 · 현재 저장 버전 \/ Current stored version/);assert.match(ui.host.textContent,/Opened/);assert.ok(!ui.host.textContent.includes('Final warning'));
// A concurrent version change does not paint the requested older version as current.
const requestedPaths=[];
ui=historyUI({...revised.row,version:3},async path=>{requestedPaths.push(path);return path.includes('version=3')?{...afterAck,filtered_version:3}:path.includes('version=4')?{...afterAck,filtered_version:4,events:[]}:afterResubmit;});
await ui.button.onclick();await ui.choose('current');assert.ok(requestedPaths[1].endsWith('&version=3'));
assert.match(ui.host.textContent,/stored version changed during this lookup/);assert.ok(!ui.host.textContent.includes('Acknowledged'));
await ui.button.onclick();assert.ok(requestedPaths[2].endsWith('&version=4'));assert.match(ui.host.textContent,/No events recorded against the current stored version/);assert.ok(!ui.host.textContent.includes('stored version changed during this lookup'));
// Latest filter wins when requests finish out of order; late errors cannot replace a newer result.
let pending=[];ui=historyUI(revised.row,path=>new Promise((resolve,reject)=>pending.push({path,resolve,reject})));
const old=ui.button.onclick();const newer=ui.choose('current');
pending[1].resolve({...afterResubmit,filtered_version:3,events:afterResubmit.events.filter(e=>e.version===3)});await newer;
pending[0].resolve(afterReturn);await old;assert.match(ui.host.textContent,/Current stored version: v3/);assert.ok(!ui.host.textContent.includes('Final warning'));
const oldFailure=ui.button.onclick();const newest=ui.choose('all');pending[3].resolve(afterAck);await newest;
pending[2].reject(new Error('late denied'));await oldFailure;assert.equal(ui.errors.length,0);assert.match(ui.host.textContent,/Current stored version: v4/);
// A removed/repainted report cannot append a late response or report a late error globally.
pending=[];ui=historyUI(revised.row,()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
const removed=ui.button.onclick();const detachedPanel=ui.host.children[0];ui.host.replaceChildren();pending[0].resolve(afterAck);await removed;
assert.equal(ui.host.textContent,'');assert.ok(!detachedPanel.textContent.includes('Current stored version: v4'));
pending=[];ui=historyUI(revised.row,()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
const removedError=ui.button.onclick();ui.host.replaceChildren();pending[0].reject(new Error('late denied'));await removedError;assert.equal(ui.errors.length,0);
// Authorization/network errors remove previous history and re-enable retry without leaving stale labels.
let allowed=true;ui=historyUI(revised.row,async()=>{if(!allowed)throw new Error('not_found');return afterAck;});
await ui.button.onclick();allowed=false;await ui.button.onclick();assert.match(ui.host.textContent,/Could not load history/);assert.ok(!ui.host.textContent.includes('Final warning'));assert.equal(ui.button.disabled,false);assert.equal(ui.errors.length,1);
// Event text must stay literal, never create markup.
ui=historyUI(revised.row,async()=>({...afterResubmit,events:[{version:3,actor:'<img src=x>',kind:'opened',detail:'<script>bad()</script>',created_at:now}]}));
await ui.button.onclick();assert.match(ui.host.textContent,/<script>bad\(\)<\/script>/);assert.equal(ui.host.all('script').length,0);assert.equal(ui.host.all('img').length,0);
// Truncation is per requested scope, newest first; 51 is only a sentinel, never returned.
for(let i=0;i<55;i++)db.prepare('INSERT INTO daily_handover_followup_events(report_id,version,actor,kind,detail,created_at) VALUES(?,?,?,?,?,?)').run(historyRef.id,1,'alice','remind','older-'+i,now+i);
const beforeRead=events();
for(const suffix of ['', '&version=1']){
  const limited=await api('/followup-history?id='+historyRef.id+suffix);
  assert.equal(limited.events.length,50);assert.equal(limited.limit,50);assert.equal(limited.has_more,true);
  assert.equal(limited.events[0].detail,'older-54');assert.equal(limited.events[49].detail,'older-5');
  ui=historyUI(revised.row,async()=>limited);await ui.button.onclick();assert.match(ui.host.textContent,/Older events omitted/);
}
assert.equal((await api('/followup-history?id='+historyRef.id+'&version=4')).has_more,false);
assert.deepEqual(events(),beforeRead,'GET history leaves stored events unchanged');
console.log('PASS handover history: authoritative stored versions; exact validated filtering; ack/return base versions; return/revise/resubmit; visibility; no rewrite; newest-50 truncation; shipped DOM handlers, stale filters/removal/errors, literal event text and retry');

db.close();
console.log('PASS daily handover: authorization, real SQLite saves/history, retries/conflicts, review/ack/return, AI fallback, deadlines, workday/leave/duplicate reminder handling');
