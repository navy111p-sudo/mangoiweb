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
function statement(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};}};}
const env={DB:{prepare:statement,async batch(items){db.exec('BEGIN');try{const out=[];for(const s of items)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};
let now=Date.parse('2026-09-28T10:00:00Z');
class TestDate extends Date{static now(){return now;}}
const module={exports:{}};
const context={module,exports:module.exports,console,crypto,Date:TestDate,Request,Response,URL,setTimeout,clearTimeout,require:(name)=>{
 if(name==='./d1-chunk'){const m={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync('cloudflare-deploy/src/d1-chunk.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports});return m.exports;}
 if(name==='./approval-policy')return{isHqStaff:a=>!!a.ok&&!a.isTeacher&&['hq','staff'].includes(a.role),isExec:a=>a.username==='admin'};
 if(name==='./once-per-isolate')return{oncePerIsolate:f=>f};
 if(name==='./web-push')return{broadcastWebPush:async eps=>({sent:eps.length})};
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
db.close();
console.log('PASS daily handover: authorization, real SQLite saves/history, retries/conflicts, review/ack/return, AI fallback, deadlines, workday/leave/duplicate reminder handling');
