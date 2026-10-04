// Final push-payload claim against isolated SQLite, never a delivery service.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('../cloudflare-deploy/node_modules/typescript');
const db=new DatabaseSync(':memory:');let beforeClaim=null,claims=0;
function statement(sql){let args=[];return{bind(...v){assert.ok(v.length<=100);args=v;return this;},async first(){if(sql.startsWith('UPDATE push_queue SET fetched_at')){claims++;beforeClaim?.(sql,args);}return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}
const env={DB:{prepare:statement,exec:async sql=>db.exec(sql)}};
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('cloudflare-deploy/src/api-notify.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,console,Date,Request,Response,URL,fetch:()=>{throw Error('network prohibited in fixture');},require:name=>name==='./api-util'?{json:(v,status=200)=>new Response(JSON.stringify(v),{status})}:{}});
const pending=async(endpoint='device')=>{const url=new URL('https://mangoi.ai/api/push/pending?endpoint='+endpoint);return (await module.exports.handleNotifyApi(new Request(url),url,env)).json();};
await pending();
function handoverSchema(){db.exec(`CREATE TABLE IF NOT EXISTS daily_handovers(id INTEGER PRIMARY KEY,version INTEGER,status TEXT,username TEXT,report_date TEXT,submitted_at INTEGER);
CREATE TABLE IF NOT EXISTS daily_handover_notices(notice_key TEXT PRIMARY KEY,username TEXT,report_date TEXT,kind TEXT);
CREATE TABLE IF NOT EXISTS daily_handover_schedule(username TEXT PRIMARY KEY,enabled INTEGER,exempt_date TEXT);`);}
function clean(){handoverSchema();for(const table of ['push_queue','daily_handovers','daily_handover_notices','daily_handover_schedule'])db.exec('DELETE FROM '+table);beforeClaim=null;claims=0;}
function report(id=1,version=1,status='submitted',user='alice',day='2026-10-01'){db.prepare('INSERT INTO daily_handovers VALUES(?,?,?,?,?,?)').run(id,version,status,user,day,status==='draft'?null:1);}
function queue(tag,time=100,endpoint='device'){return Number(db.prepare('INSERT INTO push_queue(endpoint,title,body,url,tag,queued_at) VALUES(?,?,?,?,?,?)').run(endpoint,'Report','Review','/daily-handover.html',tag,time).lastInsertRowid);}
const unfetched=()=>db.prepare('SELECT * FROM push_queue WHERE fetched_at IS NULL ORDER BY id').all();
for(const state of ['acknowledged','changes_requested','deleted','new-version']){
 clean();if(state!=='deleted')report(1,state==='new-version'?2:1,state==='new-version'?'submitted':state);
 for(const kind of ['read','followup','escalation'])queue(`handover-${kind}:1:1`);
 const out=await pending();assert.equal(out.count,0,state);assert.equal(out.suppressed_handover,3,state);assert.equal(unfetched().length,0,state);
}
for(const race of ['ack','return','delete','revision']){
 clean();report();queue('handover-read:1:1');beforeClaim=()=>{beforeClaim=null;if(race==='delete')db.exec('DELETE FROM daily_handovers');else if(race==='revision')db.exec('UPDATE daily_handovers SET version=2');else db.prepare('UPDATE daily_handovers SET status=?').run(race==='ack'?'acknowledged':'changes_requested');};
 const out=await pending();assert.equal(out.count,0,race);assert.equal(out.suppressed_handover,1,race);assert.equal(unfetched().length,0);
}
clean();report();for(const kind of ['read','followup','escalation'])queue(`handover-${kind}:1:1`);
let out=await pending();assert.equal(out.count,3);assert.ok(out.messages.every(m=>!('handover_eligible' in m)));assert.equal((await pending()).count,0);
clean();report();queue('handover-read:1:1');const concurrent=await Promise.all([pending(),pending(),pending()]);assert.equal(concurrent.reduce((n,r)=>n+r.count,0),1);
console.log('PASS final handover claim: ack/return/delete/stale-version suppression, claim-time races, current messages and concurrent single consumption');
// Transient lookup failure leaves the exact item untouched, while unrelated
// queue entries still return. Never translate unknown into stale/acknowledged.
clean();queue('handover-read:1:1',200);queue('unrelated-news',100);db.exec('DROP TABLE daily_handovers');
out=await pending();assert.equal(out.count,1);assert.equal(out.messages[0].tag,'unrelated-news');assert.equal(out.deferred_handover,1);assert.equal(out.suppressed_handover,0);assert.equal(unfetched().length,1);
handoverSchema();report();assert.equal((await pending()).count,1);assert.equal(unfetched().length,0);
clean();queue('2026-10-01:alice:due');db.exec('DROP TABLE daily_handover_notices');out=await pending();assert.equal(out.count,0);assert.equal(out.deferred_handover,1);assert.equal(unfetched().length,1);
handoverSchema();out=await pending();assert.equal(out.count,1,'matching-format unrelated tag without notice remains unchanged');
console.log('PASS unknown lookups: item retained for retry, unrelated payloads progress, no handover-table requirement for unrelated tags');
for(const resolution of ['submitted','draft','disabled','exempt','deleted-report']){
 clean();db.prepare('INSERT INTO daily_handover_schedule VALUES(?,?,?)').run('alice',resolution==='disabled'?0:1,resolution==='exempt'?'2026-10-01':'');
 if(resolution!=='deleted-report')report(1,1,resolution==='submitted'?'submitted':'draft');
 db.exec("INSERT INTO daily_handover_notices VALUES('2026-10-01:alice:due','alice','2026-10-01','due')");queue('2026-10-01:alice:due');
 out=await pending();const valid=resolution==='draft'||resolution==='deleted-report';assert.equal(out.count,valid?1:0,resolution);assert.equal(out.suppressed_handover,valid?0:1,resolution);
}
clean();report(1,1,'draft');db.exec("INSERT INTO daily_handover_schedule VALUES('alice',1,'');INSERT INTO daily_handover_notices VALUES('2026-10-01:alice:due','alice','2026-10-01','due')");queue('2026-10-01:alice:due');
beforeClaim=()=>{beforeClaim=null;db.exec("UPDATE daily_handovers SET status='submitted',submitted_at=1");};out=await pending();assert.equal(out.count,0);assert.equal(out.suppressed_handover,1);
console.log('PASS missing submissions: confirmed legacy tags only, final submission race, submitted/disabled/exempt suppression and still-missing eligibility');
clean();report(1,1,'acknowledged');for(let i=0;i<12;i++)queue('handover-read:1:1',300+i);for(let i=0;i<6;i++)queue('other-'+i,100+i);queue('other-endpoint',400,'another-device');
out=await pending();assert.equal(out.count,5);assert.equal(out.suppressed_handover,12);assert.ok(out.messages.every(m=>m.tag.startsWith('other-')));assert.equal(unfetched().length,2);
assert.equal((await pending()).count,1);assert.equal((await pending('another-device')).count,1);
clean();report(1,1,'acknowledged');for(let i=0;i<55;i++)queue('handover-read:1:1',300+i);queue('bounded-later-valid',100);
out=await pending();assert.equal(out.count,0);assert.equal(out.suppressed_handover,50);assert.equal(claims,50);
out=await pending();assert.equal(out.count,1);assert.equal(out.suppressed_handover,5);assert.equal(unfetched().length,0);
// A report payload already returned before ack is in-flight and cannot be recalled.
clean();report();queue('handover-read:1:1');out=await pending();assert.equal(out.count,1);db.exec("UPDATE daily_handovers SET status='acknowledged'");assert.equal(out.messages[0].body,'Review');assert.equal((await pending()).count,0);
console.log('PASS bounded refill: stale top rows skip/refill to five, 50-candidate cap advances next fetch, endpoint isolation, unrelated messages unchanged; already-returned payload is explicitly outside recall guarantees');
db.close();
