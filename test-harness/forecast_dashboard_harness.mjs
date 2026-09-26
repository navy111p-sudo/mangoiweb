import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { revenueEstimate, careCandidate, loadRevenue, loadCare, saveCare, DAY, ymd } from '../cloudflare-deploy/src/forecast-dashboard.ts';

const now = Date.parse('2026-09-27T05:00:00+09:00');
const rows = Array.from({length:90},(_,i)=>({date:ymd(now-(90-i)*DAY),amount:10000}));
const steady = revenueEstimate(rows,now);
assert.equal(steady.estimated_month,300000);
assert.equal(steady.forecast.reduce((a,r)=>a+r.amount,0),300000);
assert.equal(steady.quality,'estimate');
assert.equal(revenueEstimate([],now).estimated_month,null,'empty is unknown, never zero');
assert.equal(revenueEstimate(rows.slice(-20),now).quality,'insufficient','short import history');
assert.equal(revenueEstimate(rows.slice(0,70),now).quality,'insufficient','stopped sync');
const falling = revenueEstimate(rows.map((r,i)=>({...r,amount:i<60?20000:10000})),now);
assert(falling.estimated_month>falling.actual_month,'declining history cannot collapse future receipts to zero');
assert.equal(falling.forecast[0].amount,14000);
assert.equal(revenueEstimate([{date:'2026-09-26',amount:1000000}],now).quality,'insufficient','single payment is not a forecast');
const raw = new DatabaseSync(':memory:');
raw.exec(`CREATE TABLE student_payments(id INTEGER PRIMARY KEY,user_id TEXT,paid_at INTEGER,amount_krw INTEGER,status TEXT,memo TEXT,period_end TEXT);
  CREATE TABLE student_retention(user_id TEXT PRIMARY KEY,category TEXT,end_date TEXT,last_class TEXT,days_inactive INTEGER,updated_at INTEGER,contacted_at INTEGER,contacted INTEGER DEFAULT 0);
  CREATE TABLE students_erp(user_id TEXT PRIMARY KEY,korean_name TEXT);`);
// D1 adapter backed by real SQLite: exercises SQL joins, ordering and upserts.
const db = {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async all(){return {results:raw.prepare(sql).all(...args)};},async first(){return raw.prepare(sql).get(...args)||null;},async run(){return raw.prepare(sql).run(...args);}};}};
const insert = raw.prepare('INSERT INTO student_payments VALUES(?,?,?,?,?,?,?)');
let id=0;
for(const r of rows) insert.run(++id,'daily',Date.parse(r.date+'T12:00:00+09:00'),r.amount,'paid','','2026-09-30');
insert.run(++id,'seed',now-1000,999999999,'paid','demo-seed','2026-09-30');
insert.run(++id,'refund',now-1000,999999999,'refunded','','2026-09-30');
insert.run(++id,'future',now+DAY,999999999,'paid','','2026-09-30');
const notSeed = "COALESCE(memo,'') != 'demo-seed'";
assert.equal((await loadRevenue(db,notSeed,now)).actual_month,260000,'exclude seed/refunded/future payments and honor KST');
const addStudent=(uid,end,inactive=0,category='expiring',updated=now)=>{
 raw.prepare('INSERT INTO student_retention(user_id,category,end_date,last_class,days_inactive,updated_at,contacted_at) VALUES(?,?,?,?,?,?,?)').run(uid,category,end,'2026-09-26',inactive,updated,null);
 raw.prepare('INSERT INTO students_erp VALUES(?,?)').run(uid,uid);
};
addStudent('due','2026-09-30');
addStudent('unknown-fee','2026-09-30');
addStudent('renewed','2026-09-30');
addStudent('inactive','2026-10-25',25,'inactive');
insert.run(++id,'due',now-2*DAY,200000,'paid','','2026-09-30');
insert.run(++id,'due',now-DAY,220000,'paid','','2026-09-30');
insert.run(++id,'renewed',now-DAY,220000,'paid','','2026-10-30');
let care=await loadCare(db,notSeed,now);
assert.equal(care.renewals_14d,2,'already renewed snapshot excluded');
assert.equal(care.risk_count,3);
assert.equal(care.reference_total,3);
assert.equal(care.reference_known,1);
assert.equal(care.renewal_reference,220000,'latest actual payment once, no default fee or free-AI revenue');
assert.equal(care.projected_next_month_churn,null,'no invented churn count');
let due=care.rows.find(r=>r.user_id==='due');
assert.equal((await saveCare(db,{user_id:'due',case_key:due.case_key,status:'in_progress',contacted:true},'manager',now)).status,200);
care=await loadCare(db,notSeed,now);
due=care.rows.find(r=>r.user_id==='due');
assert.equal(raw.prepare("SELECT contacted FROM student_retention WHERE user_id='due'").get().contacted,1,'contact action also suppresses duplicate legacy auto-contact');
assert.equal(due.status,'in_progress');assert.equal(due.owner,'manager');assert.equal(due.contacted_at,now);
await saveCare(db,{user_id:'due',case_key:due.case_key,status:'done',contacted:false},'manager2',now+1000);
assert.equal((await loadCare(db,notSeed,now+1000)).rows.find(r=>r.user_id==='due').contacted_at,now,'status change preserves contact time');
assert.equal((await saveCare(db,{user_id:'due',case_key:'stale',status:'done',contacted:false},'manager',now)).status,409);
assert.equal((await saveCare(db,{user_id:'due',case_key:due.case_key,status:'nonsense',contacted:false},'manager',now)).status,400);
assert.equal(careCandidate({user_id:'a',updated_at:now-4*DAY},now).fresh,false);
raw.prepare("UPDATE student_retention SET updated_at=? WHERE user_id='unknown-fee'").run(now-4*DAY);
assert.equal((await loadCare(db,notSeed,now)).risk_count,null,'partial stale snapshot is not a full zero/count');
raw.prepare("UPDATE student_retention SET end_date='2026-10-02' WHERE user_id='due'").run();
assert.equal((await loadCare(db,notSeed,now)).rows.find(r=>r.user_id==='due').status,'unreviewed','a new renewal cycle resets care status');
for(let i=0;i<110;i++) addStudent('many'+i,'2026-09-30');
care=await loadCare(db,notSeed,now);
assert(care.total>100);assert.equal(care.rows.length,100,'display capped, counts not capped');
console.log('PASS: forecast calculations, KST ledger filters, retention joins, unknown/stale data, care persistence and cycle reset');

// Execute the actual route branch with stub actors; denial must happen before DB reads/writes.
const apiSource=readFileSync(new URL('../cloudflare-deploy/src/api-admin.ts',import.meta.url),'utf8');
const start=apiSource.indexOf("    if (path === '/api/admin/forecast/revenue' || path === '/api/admin/forecast/churn') {");
const wrapped=stripTypeScriptTypes('async function branch(){'+apiSource.slice(start,apiSource.indexOf('    // [Phase FAM]',start))+'}');
const branch=wrapped.slice(wrapped.indexOf('{')+1,wrapped.lastIndexOf('}')); 
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const route=new AsyncFunction('request','url','env','getAdminActor','readScopeType','orgScopeVerdict','orgScopeDenyResponse','json','loadRevenue','loadCare','saveCare','notSeedSql','parseJsonBody',"const path=url.pathname,method=request.method;"+branch);
const json=(b,s=200)=>new Response(JSON.stringify(b),{status:s});
let touched=0;
const deniedActor=async (actor, scope, method='GET',origin)=>route(
 new Request('https://mangoi.ai/api/admin/forecast/churn',{method,headers:origin?{Origin:origin}:{}}),
 new URL('https://mangoi.ai/api/admin/forecast/churn'),{DB:{}},async()=>actor,async()=>scope,
 (st,role)=>['agency','branch'].includes(role)||['agency','branch'].includes(st)?'org':st?'hq':'unknown',
 verdict=>verdict==='hq'?null:json({ok:false},403),json,
 async()=>{touched++;return {};},async()=>{touched++;return {};},async()=>{touched++;return {status:200,body:{ok:true}};},()=>notSeed,async()=>({}));
assert.equal((await deniedActor({ok:false},'hq')).status,401);
assert.equal((await deniedActor({ok:true,isTeacher:true},'teacher')).status,403);
assert.equal((await deniedActor({ok:true,role:'agency'},'agency')).status,403);
assert.equal((await deniedActor({ok:true,role:'staff'},null)).status,403);
assert.equal((await deniedActor({ok:true,role:'staff'},'hq','POST','https://other.example')).status,403);
assert.equal(touched,0,'denied users and cross-origin requests never reach data');
assert.equal((await deniedActor({ok:true,role:'staff'},'hq')).status,200);

// Execute the real frontend with response fixtures: caching, failure states and HTML escaping.
const script=readFileSync(new URL('../cloudflare-deploy/public/js/adm-forecast.js',import.meta.url),'utf8');
async function ui(revStatus=200,careStatus=200){
 const elements={};
 for(const id of ['forecast-overview','card-ai-forecast','fc-result','af-status']) elements[id]={hidden:true,innerHTML:'',events:{},addEventListener(k,f){this.events[k]=f;},querySelectorAll(){return [];},scrollIntoView(){}};
 let calls=[];
 const context={console,Date,Promise,MutationObserver:class{observe(){}},document:{getElementById(id){return elements[id];},documentElement:{}},window:{adminLang:'ko'},fetch:async(url,opts)=>{
  calls.push([url,opts]);let status=url.endsWith('revenue')?revStatus:careStatus;
  return {ok:status===200,status,json:async()=>url.endsWith('revenue')?steady:{ok:true,quality:'snapshot',updated_at:now,rows:[{user_id:'x',name:'<img src=x onerror=alert(1)>',status:'unreviewed',reason:'expiring',days_to_expiry:2,renewal:true,risk:true}],risk_count:1,renewals_14d:1,reference_total:1,reference_known:0,renewal_reference:null,total:1}};
 }};
 vm.runInNewContext(script,context);await new Promise(r=>setImmediate(r));
 return {context,elements,calls};
}
let u=await ui();
assert.equal(u.elements['forecast-overview'].hidden,false);
assert.equal(u.calls.length,2,'only two lightweight reads on startup');
assert(u.elements['forecast-overview'].innerHTML.includes('&lt;img'));
assert(!u.elements['forecast-overview'].innerHTML.includes('<img src=x'));
u.elements['card-ai-forecast'].open=true;u.elements['card-ai-forecast'].events.toggle.call(u.elements['card-ai-forecast']);
await new Promise(r=>setImmediate(r));assert.equal(u.calls.length,2,'detail reuses cached responses');
u=await ui(503,200);assert(u.elements['forecast-overview'].innerHTML.includes('조회 실패'));
u=await ui(200,403);assert.equal(u.elements['forecast-overview'].hidden,true);
console.log('PASS: actual route auth/origin guards and frontend loading, cache, escaping, partial failure, forbidden state');
