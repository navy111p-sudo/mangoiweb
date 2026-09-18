// Execute production recovery code against SQLite and an in-memory R2. No live writes.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(ROOT,p),'utf8');
const loadText=async text=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(text)).toString('base64'));
const load=p=>loadText(read(p).replace(/^import .+;\s*$/gm,''));
const {runRecordingFinalizeSweep:finalize,handleRecordingUpload}=await load('cloudflare-deploy/src/recordings-r2.ts');
const {sweepStuckRecordings:cleanup}=await load('cloudflare-deploy/src/recordings-cleanup.ts');
const mango=read('cloudflare-deploy/src/api-mango.ts');
const start=mango.indexOf("    if (path === '/api/recordings/stop'");
const end=mango.indexOf("    if (path === '/api/recordings' && method === 'GET')",start);
const {stop}=await loadText(`export async function stop(env,body){
 const request={json:async()=>body},path='/api/recordings/stop',method='POST',json=x=>x;
 ${mango.slice(start,end)}
}`);
const NOW=Date.UTC(2026,8,19,0),MIN=60000,H=60*MIN,originalNow=Date.now;
Date.now=()=>NOW;
let passed=0;
function fixture({age=5*H,ended=null,bytes=200,key='rec/test/1.webm',status='recording',duration=null}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE recordings(id INTEGER PRIMARY KEY,file_url TEXT,started_at INTEGER,ended_at INTEGER,
 duration_ms INTEGER,size_bytes INTEGER,status TEXT,storage TEXT);
 CREATE TABLE recording_parts(recording_id INTEGER,part_number INTEGER,r2_key TEXT,upload_id TEXT,
 etag TEXT,size_bytes INTEGER,created_at INTEGER,PRIMARY KEY(recording_id,part_number));`);
 db.prepare('INSERT INTO recordings VALUES(1,?,?,?,?,?,?,?)').run(key,NOW-age,ended,duration,bytes,status,key?'r2':'local');
 const objects=new Map();
 const control={headFails:false,completeFails:false,failSnapshotPut:false,raceFull:false,latePart:false};
 const object=(size,uploaded=NOW-H,metadata={})=>({size,uploaded:new Date(uploaded),customMetadata:metadata,arrayBuffer:async()=>new Uint8Array(size).buffer});
 function part(at=NOW-H){db.prepare('INSERT OR REPLACE INTO recording_parts VALUES(1,1,?,?,?,?,?)').run(key,'upload-1','etag-1',1000,at);}
 const env={DB:{prepare(sql){let args=[];return {
 bind(...a){args=a;return this;},async all(){return {results:db.prepare(sql).all(...args)};},
 async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}
 };}},RECORDINGS:{
 async head(k){if(control.headFails)throw Error('R2 unavailable');return objects.get(k)||null;},
 async get(k){return objects.get(k)||null;},
 async put(k,buf,options){
 if(control.failSnapshotPut)throw Error('put timeout');
 if(control.raceFull)objects.set(k,object(5000));
 if(control.latePart)part(NOW);
 if(options?.onlyIf?.get('If-None-Match')==='*'&&objects.has(k))return null;
 const o=object(buf.byteLength,NOW,options?.customMetadata||{});objects.set(k,o);return o;
 },async delete(k){objects.delete(k);},
 resumeMultipartUpload(k){return {async complete(){if(control.completeFails)throw Error('multipart temporary failure');const o=object(1000);objects.set(k,o);return o;},async abort(){}};}
 },SESSION_STATE:{async get(){return null;},async put(){}}};
 return {env,db,objects,control,key,part,object,row:()=>db.prepare('SELECT * FROM recordings WHERE id=1').get(),snapshot(at=NOW-H){objects.set(key+'.snap',object(200,at));}};
}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
try{
 await test('active legacy recorder under 4 hours is untouched',async()=>{
 const f=fixture({age:H});f.snapshot();await finalize(f.env);assert.equal(f.row().status,'recording');});
 await test('explicit stop + five quiet minutes recovers a short snapshot',async()=>{
 const f=fixture({age:20*MIN,ended:NOW-10*MIN,duration:600000});f.snapshot(NOW-11*MIN);await finalize(f.env);
 assert.equal(f.row().status,'completed');assert.equal(f.row().storage,'r2_snapshot');assert.equal(f.row().duration_ms,null);assert.equal(f.row().ended_at,NOW-10*MIN);});
 await test('stop still draining is protected',async()=>{
 const f=fixture({age:H,ended:NOW-2*MIN});f.snapshot();await finalize(f.env);assert.equal(f.row().status,'recording');});
 await test('recent upload part after stop prevents sealing',async()=>{
 const f=fixture({age:H,ended:NOW-10*MIN});f.part(NOW-MIN);await finalize(f.env);assert.equal(f.row().status,'recording');});
 await test('silent 11-hour snapshot recovers without waiting 12 hours',async()=>{
 const f=fixture({age:11*H});f.snapshot();await finalize(f.env);assert.equal(f.row().status,'completed');});
 await test('recent snapshot on an old row remains uploadable',async()=>{
 const f=fixture();f.snapshot(NOW-2*MIN);await finalize(f.env);assert.equal(f.row().status,'recording');});
 await test('a real object with no parts repairs metadata',async()=>{
 const f=fixture();f.objects.set(f.key,f.object(1500));await finalize(f.env);assert.equal(f.row().size_bytes,1500);assert.equal(f.row().status,'completed');});
 await test('null-size and zero-size empty records both settle',async()=>{
 for(const bytes of [null,0]){const f=fixture({key:null,bytes});await finalize(f.env);assert.equal(f.row().status,'aborted');}});
 await test('missing video with recorded data is an explicit failure',async()=>{
 const f=fixture();await finalize(f.env);assert.equal(f.row().status,'upload_failed');});
 await test('storage lookup failure preserves pending recordings',async()=>{
 const f=fixture({age:7*H});f.control.headFails=true;await cleanup(f.env);await finalize(f.env);assert.equal(f.row().status,'recording');});
 await test('nightly cleanup cannot strand a snapshot',async()=>{
 const f=fixture({age:7*H});f.snapshot();await cleanup(f.env);assert.equal(f.row().status,'recording');await finalize(f.env);assert.equal(f.row().storage,'r2_snapshot');});
 await test('nightly cleanup protects uploaded parts',async()=>{
 const f=fixture({age:7*H});f.part();await cleanup(f.env);assert.equal(f.row().status,'recording');await finalize(f.env);assert.equal(f.row().status,'completed');});
 await test('normal completion wins against snapshot promotion',async()=>{
 const f=fixture();f.snapshot();f.control.raceFull=true;await finalize(f.env);assert.equal(f.objects.get(f.key).size,5000);assert.equal(f.row().size_bytes,5000);assert.equal(f.row().storage,'r2');});
 await test('late multipart arrival prevents partial metadata commit',async()=>{
 const f=fixture();f.snapshot();f.control.latePart=true;await finalize(f.env);assert.equal(f.row().status,'recording');
 f.part(NOW-H);f.control.completeFails=true;await finalize(f.env);assert.equal(f.row().status,'recording');assert.equal(f.db.prepare('SELECT count(*) AS n FROM recording_parts').get().n,1);});
 await test('failed snapshot write retains recovery sources',async()=>{
 const f=fixture();f.snapshot();f.control.failSnapshotPut=true;await finalize(f.env);assert.equal(f.row().status,'recording');assert.ok(f.objects.has(f.key+'.snap'));});
 await test('transient multipart failure retains ledger for retry',async()=>{
 const f=fixture();f.part();f.control.completeFails=true;await finalize(f.env);assert.equal(f.row().status,'recording');assert.equal(f.db.prepare('SELECT count(*) AS n FROM recording_parts').get().n,1);
 f.control.completeFails=false;await finalize(f.env);assert.equal(f.row().status,'completed');});
 await test('completed/deleted records are not rewritten',async()=>{
 for(const status of ['completed','deleted']){const f=fixture({status});f.snapshot();await finalize(f.env);await cleanup(f.env);assert.equal(f.row().status,status);}});
 await test('end hint marks only the matching recording without closing upload',async()=>{
 const f=fixture({age:H});await stop(f.env,{recording_id:1,recording_key:'wrong',finalize_pending:true});assert.equal(f.row().ended_at,null);
 await stop(f.env,{recording_id:1,recording_key:f.key,finalize_pending:true});assert.equal(f.row().ended_at,NOW);assert.equal(f.row().status,'recording');});
 await test('end hint works before upload creation',async()=>{
 const f=fixture({key:null,bytes:null,age:MIN});await stop(f.env,{recording_id:1,recording_key:null,finalize_pending:true});assert.equal(f.row().ended_at,NOW);});
 await test('stop failure preserves recoverable key and status',async()=>{
 const f=fixture();f.part();await stop(f.env,{recording_id:1,duration_ms:20000,size_bytes:900,r2_success:false,file_url:'CLIENT_ERR:timeout',storage:'error'});assert.equal(f.row().file_url,f.key);assert.equal(f.row().status,'recording');assert.equal(f.row().storage,'r2');});
 await test('stop and cleanup cannot treat promoted snapshot as full multipart',async()=>{
 const f=fixture();f.part();f.objects.set(f.key,f.object(200,NOW-H,{recoveredFrom:'snapshot'}));await stop(f.env,{recording_id:1,r2_success:false,duration_ms:600000,size_bytes:1000});assert.equal(f.row().status,'recording');await cleanup(f.env,{olderThanMs:H});assert.equal(f.row().status,'recording');});
 await test('completion error retains snapshot and eligibility',async()=>{
 const f=fixture();f.part();f.snapshot();f.control.completeFails=true;
 const req=new Request('https://internal/api/recordings/upload/complete',{method:'POST',body:JSON.stringify({recording_id:1,key:f.key,upload_id:'upload-1',parts:[{partNumber:1,etag:'etag-1'}]})});
 const res=await handleRecordingUpload(req,new URL(req.url),f.env);assert.equal(res.status,500);assert.equal(f.row().status,'recording');assert.ok(f.objects.has(f.key+'.snap'));});
 console.log(`${passed} PASS / 0 FAIL`);
}finally{Date.now=originalNow;}
