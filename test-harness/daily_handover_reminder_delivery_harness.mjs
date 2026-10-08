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
CREATE TABLE push_queue(id INTEGER PRIMARY KEY AUTOINCREMENT,endpoint TEXT,title TEXT,body TEXT,url TEXT,icon TEXT,badge TEXT,tag TEXT,queued_at INTEGER,fetched_at INTEGER);
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

// Additional track4 contracts. The Worker/API code runs against isolated SQLite;
// broadcastWebPush is an in-memory stub and never calls any delivery service.
await api('/home');
function clean(){
 statementHook=null;beforeBatch=null;broadcastCalls=[];broadcastImpl=async eps=>({sent:eps.length});
 now=Date.parse('2026-10-01T01:00:00Z');
 for(const table of ['daily_handover_schedule','daily_handovers','daily_handover_followup','daily_handover_followup_events','daily_handover_notices','daily_handover_read_alerts','push_queue','push_subscriptions','daily_handover_read_schedule','daily_handover_history'])db.exec('DELETE FROM '+table);
}
const count=table=>db.prepare('SELECT count(*) n FROM '+table).get().n;
const queue=()=>db.prepare('SELECT * FROM push_queue ORDER BY endpoint,tag').all();
const notice=()=>db.prepare('SELECT * FROM daily_handover_notices ORDER BY notice_key').all();
async function schedule(user='carol',due='10:00',extra={}){assert.equal((await api('/schedule',{enabled:true,weekdays:[1,2,3,4,5],due_time:due,exempt_date:'',...extra},user)).ok,true);}
async function submit(user='alice',recipient='bob',key='reminder_submission_0001'){
 return api('/save',{...draft,report_date:'2026-10-01',recipient,request_key:key,submit:true,confirmed:true},user);
}
function devices(){db.exec("INSERT INTO push_subscriptions VALUES('bob-device','bob',1),('bob-device-2','bob',1),('carol-device','carol',1)");}
const alert=r=>db.prepare('SELECT * FROM daily_handover_read_alerts WHERE report_id=? AND version=?').get(r.id,r.version);
const prepareBatch=env.DB.batch;
async function raceBeforeQueue(action,work){
 let injected=false;
 env.DB.batch=async items=>{if(!injected&&items.some(s=>s.sql.startsWith('INSERT INTO push_queue'))){injected=true;await action();}return prepareBatch(items);};
 try{await work();assert.equal(injected,true);}finally{env.DB.batch=prepareBatch;}
}
// Missing submissions: rollback/retry, restored subscriptions, concurrent claims,
// per-device atomicity and no redelivery after service-worker consumption.
clean();await schedule();devices();
db.exec("CREATE TRIGGER fail_missing_queue BEFORE INSERT ON push_queue BEGIN SELECT RAISE(ABORT,'injected missing-submission failure'); END");
await runDailyHandoverSweep(env);assert.equal(notice()[0].push_state,'failed');assert.equal(count('push_queue'),0);
db.exec('DROP TRIGGER fail_missing_queue');
await Promise.all([runDailyHandoverSweep(env),runDailyHandoverSweep(env),runDailyHandoverSweep(env)]);
assert.equal(count('push_queue'),1);assert.equal(broadcastCalls.length,1);assert.equal(notice()[0].push_state,'sent');
db.exec('DELETE FROM push_queue');await runDailyHandoverSweep(env);assert.equal(count('push_queue'),0);assert.equal(broadcastCalls.length,1);
clean();await schedule();await runDailyHandoverSweep(env);assert.equal(notice()[0].push_state,'no_subscription');
devices();await runDailyHandoverSweep(env);assert.equal(count('push_queue'),1);assert.equal(broadcastCalls.length,1);
clean();await schedule('bob');devices();
db.exec("CREATE TRIGGER fail_second_device BEFORE INSERT ON push_queue WHEN NEW.endpoint='bob-device-2' BEGIN SELECT RAISE(ABORT,'injected second-device failure'); END");
await runDailyHandoverSweep(env);assert.equal(count('push_queue'),0);assert.equal(broadcastCalls.length,0);
db.exec('DROP TRIGGER fail_second_device');broadcastImpl=async()=>{throw new Error('offline push service');};
await runDailyHandoverSweep(env);assert.equal(count('push_queue'),2);assert.equal(notice()[0].push_state,'queued');
const durable=queue();await runDailyHandoverSweep(env);assert.deepEqual(queue(),durable);assert.equal(broadcastCalls.length,1);
for(const race of ['submitted','disabled','exempt','deadline']){
 clean();await schedule('alice');db.exec("INSERT INTO push_subscriptions VALUES('alice-device','alice',1)");
 await raceBeforeQueue(async()=>{
  if(race==='submitted')assert.equal((await submit('alice','alice')).ok,true);
  if(race==='disabled')await schedule('alice','10:00',{enabled:false});
  if(race==='exempt')await schedule('alice','10:00',{exempt_date:'2026-10-01'});
  if(race==='deadline')await schedule('alice','18:00');
 },()=>runDailyHandoverSweep(env));
 assert.equal(count('push_queue'),0,race);assert.equal(count('daily_handover_notices'),0,race);
}
console.log('PASS missing submission: queue/device failure rollback+retry, no-subscription recovery, durable wake failure, concurrent idempotency, consumed-message dedupe, and submit/schedule races');
// Read-reminder batches cannot enqueue after a response or newer revision wins.
for(const race of ['ack','admin-ack','return','revision','hold','read-window']){
 clean();devices();let sent=await submit();assert.equal(sent.ok,true);db.exec('DELETE FROM push_queue');broadcastCalls=[];now+=3600000;
 await raceBeforeQueue(async()=>{
  if(race==='ack'||race==='admin-ack')assert.equal((await api('/ack',{id:sent.row.id,version:sent.row.version},race==='admin-ack'?'admin':'bob')).ok,true);
  if(race==='return')assert.equal((await api('/return',{id:sent.row.id,version:sent.row.version,feedback:'Check again'},'bob')).ok,true);
  if(race==='revision')assert.equal((await api('/save',{...draft,report_date:'2026-10-01',version:sent.row.version,recipient:'carol',request_key:'new_recipient_revision_0001',submit:true,confirmed:true})).ok,true);
  if(race==='hold')assert.equal((await api('/hold',{id:sent.row.id,version:sent.row.version,reason:'Investigating',hold_until:now+60000},'bob')).ok,true);
  if(race==='read-window')assert.equal((await api('/read-schedule',{weekdays:[1,2,3,4,5],start_time:'18:00',end_time:'19:00'},'bob')).ok,true);
 },()=>runDailyHandoverSweep(env));
 assert.equal(queue().filter(q=>q.tag===`handover-read:${sent.row.id}:${sent.row.version}`).length,0,race);
 if(race!=='revision')assert.equal(broadcastCalls.length,0,race);
 else {assert.equal(queue().length,1);assert.equal(queue()[0].endpoint,'carol-device');}
}
clean();devices();let sent=await submit();db.exec('DELETE FROM push_queue');broadcastCalls=[];now+=3600000;
const oldAlert=alert(sent.row);
db.exec("CREATE TRIGGER fail_read_queue BEFORE INSERT ON push_queue WHEN NEW.endpoint='bob-device-2' BEGIN SELECT RAISE(ABORT,'injected read failure'); END");
await runDailyHandoverSweep(env);assert.equal(count('push_queue'),0);assert.deepEqual(alert(sent.row),oldAlert);assert.equal(broadcastCalls.length,0);
db.exec('DROP TRIGGER fail_read_queue');
await Promise.all([runDailyHandoverSweep(env),runDailyHandoverSweep(env),runDailyHandoverSweep(env)]);
assert.equal(count('push_queue'),2);assert.equal(alert(sent.row).attempts,oldAlert.attempts+1);assert.equal(broadcastCalls.length,1);
assert.equal((await api('/ack',{id:sent.row.id,version:sent.row.version},'bob')).ok,true);assert.equal(count('push_queue'),0);
now+=3600000;await runDailyHandoverSweep(env);assert.equal(count('push_queue'),0);assert.equal(broadcastCalls.length,1);
console.log('PASS unread reminders: actual ack/admin-ack/return/resubmission/hold/window races, endpoint rollback without interval consumption, concurrent dedupe and successful acknowledgement cancellation');
// Run the real shared pending route after a valid ack and cleanup failure.
env.DB.exec=async sql=>db.exec(sql);
const notifyModule={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('cloudflare-deploy/src/api-notify.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module:notifyModule,exports:notifyModule.exports,console,Date:TestDate,Request,Response,URL,require:name=>name==='./api-util'?{json:(v,status=200)=>new Response(JSON.stringify(v),{status})}:{}});
async function pending(endpoint){const url=new URL('https://mangoi.ai/api/push/pending?endpoint='+endpoint);return (await notifyModule.exports.handleNotifyApi(new Request(url),url,env)).json();}
// A valid ack still commits when best-effort cleanup fails (PR1369 contract).
clean();devices();sent=await submit();statementHook=sql=>{if(sql.startsWith('DELETE FROM push_queue'))throw new Error('injected cleanup failure');};
assert.equal((await api('/ack',{id:sent.row.id,version:sent.row.version},'bob')).ok,true);
assert.equal(db.prepare('SELECT status FROM daily_handovers').get().status,'acknowledged');assert.equal(count('push_queue'),2);
statementHook=null;
for(const endpoint of ['bob-device','bob-device-2']){const payload=await pending(endpoint);assert.equal(payload.count,0);assert.equal(payload.suppressed_handover,1);}
assert.equal(db.prepare('SELECT count(*) n FROM push_queue WHERE fetched_at IS NULL').get().n,0);
assert.equal((await api('/ack',{id:sent.row.id,version:sent.row.version},'bob')).duplicate,true);assert.equal(count('push_queue'),0);
console.log('PASS response-to-dispatch boundary: real ack survives cleanup failure, real pending route suppresses obsolete payloads, exact retry cleans queue');
// Acknowledged/returned projections derive their actual submitted revision from
// history, including a second fresh-version response, rather than version-1.
for(const who of ['bob','admin'])for(const late of [false,true]){
 clean();sent=await submit();const due=now+60000;
 assert.equal((await api('/followup',{id:sent.row.id,version:sent.row.version,action:'deadline',due_at:due},'alice')).ok,true);
 now=late?due+300000:due;
 const body={id:sent.row.id,version:sent.row.version};assert.equal((await api('/ack',body,who)).ok,true);
 let projected=(await api('/mine',null,'alice')).reports[0];
 assert.equal(projected.acknowledged_by,who);assert.equal(projected.acknowledged_at,now);assert.equal(projected.followup.due_at,due);
 assert.equal(projected.response_timing.late,late);assert.equal(projected.response_timing.delay_ms,late?300000:0);assert.equal(projected.response_timing.version,1);
 assert.equal((await api('/ack',body,who)).duplicate,true);
 assert.equal((await api('/ack',{id:sent.row.id,version:projected.version},who)).ok,true);
 projected=(await api('/mine',null,'alice')).reports[0];assert.equal(projected.version,3);assert.equal(projected.followup.version,1);assert.equal(projected.response_timing.version,1);
 const resub=await api('/save',{...draft,report_date:'2026-10-01',version:3,request_key:'next_submitted_revision_0001',submit:true,confirmed:true});
 assert.equal(resub.ok,true);projected=(await api('/mine',null,'alice')).reports[0];assert.equal(projected.followup,null);assert.equal(projected.response_timing,null);
}
clean();await schedule();await runDailyHandoverSweep(env);let home=await api('/home',null,'admin');
assert.equal(home.required[0].notices[0].state,'no_subscription');assert.equal((await api('/home',null,'bob')).required.length,0);
assert.equal((await api('/home',null,'carol')).required.length,0);
console.log('PASS late-response projection: recipient/admin, deadline boundary/late, exact retry/fresh response version, resubmission isolation, and admin-only missing-notification states');
// Dates straddling KST midnight stay within the existing [-30m,+120m] window.
for(const [due,clock,expectedDay,stage] of [['23:55','2026-10-01T15:05:00Z','2026-10-01','due'],['23:55','2026-10-01T15:40:00Z','2026-10-01','late'],['00:05','2026-09-30T14:40:00Z','2026-10-01','soon']]){
 clean();await schedule('carol',due);devices();now=Date.parse(clock);await runDailyHandoverSweep(env);
 assert.equal(notice().length,1);assert.equal(notice()[0].report_date,expectedDay);assert.equal(notice()[0].kind,stage);
 await runDailyHandoverSweep(env);assert.equal(queue().length,1);assert.equal(broadcastCalls.length,1);
}
clean();await schedule('carol','23:55',{exempt_date:'2026-10-01'});devices();now=Date.parse('2026-10-01T15:05:00Z');await runDailyHandoverSweep(env);assert.equal(notice().length,0);
clean();await schedule('carol','23:55');devices();now=Date.parse('2026-10-01T17:00:00Z');await runDailyHandoverSweep(env);assert.equal(notice().length,0,'no expanded historical backlog');
console.log('PASS midnight: previous-day due/late, next-day soon, per-report-day exemption, idempotency and existing window bound');
// Multiple staff receive only their own report reminders under concurrent sweeps.
clean();devices();db.exec("INSERT INTO push_subscriptions VALUES('alice-device','alice',1)");
const a=await submit('alice','bob','parallel_alice_bob_001'),b=await submit('carol','alice','parallel_carol_alice_1');
db.exec('DELETE FROM push_queue');broadcastCalls=[];now+=3600000;await Promise.all([runDailyHandoverSweep(env),runDailyHandoverSweep(env)]);
assert.equal(queue().length,3);assert.ok(queue().filter(q=>q.tag===`handover-read:${a.row.id}:1`).every(q=>q.endpoint.startsWith('bob-')));
assert.ok(queue().filter(q=>q.tag===`handover-read:${b.row.id}:1`).every(q=>q.endpoint==='alice-device'));
assert.equal(queue().some(q=>q.endpoint==='carol-device'),false);assert.equal(broadcastCalls.length,2);
// Exercise the shipped UI functions, using text nodes to reject HTML injection.
const js=readFileSync('cloudflare-deploy/public/js/daily-handover.js','utf8');
class Element{constructor(tag,text=''){this.tag=tag;this.value=text;this.children=[];}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;this.value='';}get textContent(){return this.value+this.children.map(x=>x.textContent??x).join('');}}
const required=new Element('div'),detail=new Element('div');
const ui={node:(tag,text='')=>new Element(tag,text||''),$:()=>required,staffName:x=>x,kst:ms=>new Date(ms+9*3600000).toISOString().slice(5,16).replace('T',' '),Date};
vm.runInNewContext(js.slice(js.indexOf('  function notificationLabel('),js.indexOf('  function paintFollowupHistory(')),ui);
ui.paintReportStatus(detail,{submitted_at:now,response_timing:{late:true,delay_ms:300000},notifications:{read:{state:'queued'},followup:[{level:3,username:'<script>bad()</script>',state:'no_subscription'}]}});
assert.match(detail.textContent,/Submitted:/);assert.match(detail.textContent,/Late response/);assert.match(detail.textContent,/5분/);assert.match(detail.textContent,/device receipt unverified/);assert.match(detail.textContent,/Queued/);assert.match(detail.textContent,/No device subscription/);assert.match(detail.textContent,/<script>bad\(\)<\/script>/);assert.equal(detail.children.some(x=>x.tag==='script'),false);
ui.paintRequired([{name:'Carol',username:'carol',weekdays:'1,2,3,4,5',due_time:'10:00',exempt_date:'',submitted_at:null,notices:[{stage:'due',state:'failed'}]}],'2026-10-01');
assert.match(required.textContent,/Carol/);assert.match(required.textContent,/Queue failed; retry pending/);assert.match(required.textContent,/10:00 KST/);
ui.paintRequired([], '2026-10-01');assert.equal(required.textContent,'');
console.log('PASS recipients and shipped UI: concurrent staff isolation, submission time, late result, exact warning stage, honest notification states, literal text and cleared overview');

// Independent review regression: committing a response before the final wake
// lookup must suppress the wake even when best-effort queue cleanup fails.
async function aroundWake(action,work,{after=false,at=1,fail=false}={}){
 const originalPrepare=env.DB.prepare;let lookups=0,injected=false;
 env.DB.prepare=sql=>{const stmt=originalPrepare(sql),all=stmt.all.bind(stmt);
  if(sql.startsWith('SELECT DISTINCT q.endpoint'))stmt.all=async()=>{
   lookups++;if(lookups!==at)return all();injected=true;
   if(fail)throw new Error('injected wake lookup failure');
   if(after){const selected=await all();await action();return selected;}
   await action();return all();
  };return stmt;
 };
 try{await work();assert.equal(injected,true);}finally{env.DB.prepare=originalPrepare;statementHook=null;}
}
async function respondBeforeWake(kind='ack',who='bob',failCleanup=true){
 const r=db.prepare('SELECT * FROM daily_handovers ORDER BY id DESC LIMIT 1').get();
 if(failCleanup)statementHook=sql=>{if(sql.startsWith('DELETE FROM push_queue'))throw new Error('injected post-commit cleanup failure');};
 const response=await api('/'+kind,{id:r.id,version:r.version,feedback:kind==='return'?'Revise the details':''},who);
 statementHook=null;assert.equal(response.ok,true);
 assert.equal(db.prepare('SELECT status FROM daily_handovers WHERE id=?').get(r.id).status,kind==='ack'?'acknowledged':'changes_requested');
}
for(const [kind,who] of [['ack','bob'],['ack','admin'],['return','bob']]){
 clean();devices();
 await aroundWake(()=>respondBeforeWake(kind,who),async()=>{assert.equal((await submit()).ok,true);});
 assert.equal(broadcastCalls.length,0);assert.equal(queue().length,2,'cleanup failure leaves rows, but must not trigger a new wakeup');
 for(const endpoint of ['bob-device','bob-device-2']){const result=await pending(endpoint);assert.equal(result.count,0);assert.equal(result.suppressed_handover,1);}
}
for(const path of ['read','missing','followup']){
 clean();devices();
 let work;
 if(path==='read')work=()=>submit();
 else if(path==='missing'){await schedule();work=()=>runDailyHandoverSweep(env);}
 else {sent=await submit();db.exec('DELETE FROM push_queue');broadcastCalls=[];work=()=>api('/followup',{id:sent.row.id,version:sent.row.version,action:'remind'});}
 await aroundWake(async()=>{db.prepare('UPDATE push_queue SET fetched_at=?').run(now);},work);
 assert.equal(broadcastCalls.length,0,path+' already-fetched payload does not need another wakeup');
 assert.ok(queue().every(q=>q.fetched_at===now));
}
// A normal report submitted while its missing reminder is preparing a wake is
// resolved by the same active schedule/submission predicate used for queueing.
clean();devices();await schedule('alice');db.exec("INSERT INTO push_subscriptions VALUES('alice-device','alice',1)");
await aroundWake(async()=>{assert.equal((await submit('alice','alice')).ok,true);},()=>runDailyHandoverSweep(env));
assert.equal(broadcastCalls.length,0);assert.equal(queue().length,1);
// Same response race applies to the pre-existing follow-up wake path.
clean();devices();sent=await submit();db.exec('DELETE FROM push_queue');broadcastCalls=[];
await aroundWake(()=>respondBeforeWake(),()=>api('/followup',{id:sent.row.id,version:sent.row.version,action:'remind'}));
assert.equal(broadcastCalls.length,0);assert.equal(queue().length,2);
// Final escalations read several recipients; a response during the second read
// must also invalidate endpoints collected by the first read.
clean();devices();db.exec("INSERT INTO push_subscriptions VALUES('alice-device','alice',1),('admin-device','admin',1)");sent=await submit();
assert.equal((await api('/followup',{id:sent.row.id,version:sent.row.version,action:'deadline',due_at:now+60000,escalation_to:'admin'})).ok,true);
now+=3*3600000+60000;db.prepare('UPDATE daily_handover_read_alerts SET next_at=?').run(Number.MAX_SAFE_INTEGER);db.exec('DELETE FROM push_queue');broadcastCalls=[];
await aroundWake(()=>respondBeforeWake(),()=>runDailyHandoverSweep(env),{at:2});
assert.equal(broadcastCalls.length,0);assert.equal(queue().length,4);
// Unknown wake-selection failure retains durable payloads for a subsequent
// successful pending fetch; it is never treated as delivered or obsolete.
clean();devices();await aroundWake(async()=>{},()=>submit(),{fail:true});assert.equal(broadcastCalls.length,0);assert.equal(queue().length,2);
assert.equal(db.prepare('SELECT push_state FROM daily_handover_read_alerts').get().push_state,'queued');
assert.equal((await pending('bob-device')).count,1);assert.equal((await pending('bob-device-2')).count,1);
// Explicit transport boundary: after the last eligibility SELECT returned, a
// racing ack can commit before the external wake starts. SQL cannot atomically
// recall that selected external work; the final pending gate still returns no
// obsolete content, and the unchanged SW may show its generic fallback.
clean();devices();await aroundWake(()=>respondBeforeWake('ack','bob',false),()=>submit(),{after:true});
assert.equal(broadcastCalls.length,1);assert.equal(queue().length,0);assert.equal((await pending('bob-device')).count,0);
console.log('PASS wake selection: real ack/admin-ack/return before lookup suppresses new wake despite cleanup failure; fetched/read/missing/followup payloads do not re-wake; multi-recipient recheck, unknown-read queue retention and after-selection transport limit');
db.close();
