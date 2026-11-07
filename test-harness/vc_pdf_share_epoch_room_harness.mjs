// Actual DO methods on isolated SQLite + synthetic sockets; no network or accounts.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {DatabaseSync} from 'node:sqlite';import vm from 'node:vm';
const require=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url)),ts=require('typescript');
const source=readFileSync(process.env.KAYE_DO_SOURCE || new URL('../cloudflare-deploy/src/video-call-room.ts',import.meta.url),'utf8');
const epochSource=readFileSync(new URL('../cloudflare-deploy/src/pdf-share-epoch.ts',import.meta.url),'utf8').replace(/^import type.*\n/gm,'').replace(/^export\s+/gm,'');
const helper=readFileSync(new URL('../cloudflare-deploy/src/room-whiteboard-history.ts',import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const ast=ts.createSourceFile('room.ts',source,ts.ScriptTarget.Latest,true),body=ast.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(ast).replace(/^export\s+/, '')).join('\n');
let now=Date.parse('2026-11-03T07:00:00Z'),pass=0,fail=0;
class Clock extends Date{static now(){return now}}
const logs=[];const {VideoCallRoom,RoomWhiteboardHistory}=vm.runInNewContext(compile(epochSource)+'\n'+compile(helper.replace(/^export\s+/gm,''))+'\n'+compile(body)+';({VideoCallRoom,RoomWhiteboardHistory})',{Date:Clock,Map,Set,TextEncoder,JSON,crypto,console:{log(){},warn:s=>logs.push(s)},WebSocket:{OPEN:1},verifyGhostObserveSig:async(_room,tok)=>tok==='synthetic-allow'});
function socket(id,role='teacher',joined=true){let att={userId:id,username:id,roomId:'fixture',role,joined,seenAt:now};return{readyState:1,messages:[],deserializeAttachment:()=>structuredClone(att),serializeAttachment:a=>att=structuredClone(a),send(m){this.messages.push(JSON.parse(m))},close(){this.readyState=3}}}
function world(historyMode='on',pdfHistoryMode='off',sqlAvailable=true,allowPrototype=false,epoch=true,allowEpoch=true){const sq=new DatabaseSync(':memory:'),kv=new Map([['roomId','fixture']]),sockets=[],blocks=[];let deny=false,denyClear=false,denyRead=false,denyPdfRead=false;
 const sql={exec(text,...args){if(denyPdfRead&&/FROM vc_pdf_history/.test(text)){denyPdfRead=false;throw Error('synthetic PDF read failure')}if(denyRead&&/^SELECT.*FROM vc_whiteboard_history/.test(text)){denyRead=false;throw Error('synthetic read failure')}if(deny&&/^INSERT/.test(text))throw Error('synthetic disk error');if(denyClear&&/^DELETE/.test(text))throw Error('synthetic clear failure');const rows=sq.prepare(text).all(...args);return{[Symbol.iterator]:()=>rows[Symbol.iterator](),toArray:()=>rows,one:()=>{assert.equal(rows.length,1);return rows[0]}}}};
 const transaction=body=>{sq.exec('BEGIN');try{const v=body();sq.exec('COMMIT');return v}catch(e){sq.exec('ROLLBACK');throw e}};
 let kvSerial=Promise.resolve(),kvFail=false,kvWrites=0;
 const kvTransaction=fn=>{const result=kvSerial.then(async()=>{const copy=new Map(structuredClone([...kv]));const tx={async get(k){return structuredClone(copy.get(k))},async put(entries){kvWrites++;for(const [k,v] of Object.entries(entries))copy.set(k,structuredClone(v))}};const value=await fn(tx);if(kvFail){kvFail=false;throw Error('synthetic KV commit failure')}kv.clear();for(const [k,v] of copy)kv.set(k,v);return value});kvSerial=result.catch(()=>{});return result};
 const state={storage:{transaction:kvTransaction,sql:sqlAvailable?sql:undefined,transactionSync:transaction,async get(k){return structuredClone(kv.get(k))},async put(k,v){kv.set(k,structuredClone(v))},async delete(k){kv.delete(k)},async setAlarm(){}},blockConcurrencyWhile(f){blocks.push(f())},getWebSockets:()=>sockets};
 async function room(mode=historyMode,epochOverride=epoch,allowEpochOverride=allowEpoch){const r=new VideoCallRoom(state,{VC_WHITEBOARD_HISTORY:mode,VC_PDF_HISTORY:pdfHistoryMode,VC_PDF_SHARE_EPOCH:epochOverride?'on':'off'},{replayPrototype:allowPrototype,shareEpochProtocol:allowEpochOverride});await Promise.all(blocks);return r}
 return{get kvWrites(){return kvWrites},sq,sql,transaction,state,kv,sockets,room,failKv:()=>kvFail=true,failRead:()=>denyRead=true,failPdfRead:()=>denyPdfRead=true,failClear:()=>denyClear=true,recover:()=>{deny=false;denyClear=false},deny:()=>deny=true,close:()=>sq.close()};
}
async function test(n,f){try{await f();pass++;console.log('PASS '+n)}catch(e){fail++;console.log('FAIL '+n+' '+e.message)}}
async function draw(r,s,n=1){for(let i=0;i<n;i++)await r.webSocketMessage(s,JSON.stringify({type:'whiteboard-text',data:{id:'x'+i,text:'fixture-'+i}}))}

let request=0;
function command(r,extra={}){return{shareEpoch:r.pdfEpochRecord.epoch,shareRevision:r.pdfEpochRecord.revision,epochRequestId:'req-'+(++request),...extra}}
async function setup(){const w=world('off','off');const t=socket('t'),peer=socket('peer','student');w.sockets.push(t,peer);const r=await w.room();return{w,t,peer,r}}
await test('same URL stop/re-share and reconstruction reject every retired annotation',async()=>{
 const {w,t,peer}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/A.pdf'}));const old=command(r,{documentUrl:'/A.pdf'});
 await r.handlePdfStopShare('t',t.deserializeAttachment(),command(r,{documentUrl:'/A.pdf'}));await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/A.pdf'}));r=await w.room();
 for(const type of ['pdf-anno-start','pdf-anno-point','pdf-anno-text','pdf-anno-shape','pdf-anno-clear','pdf-anno-undo']){peer.messages.length=0;await r.webSocketMessage(t,JSON.stringify({type,data:{...old,page:1,id:'retired',point:[0,0],stroke:{text:'old'},pages:[1]}}));assert.ok(!peer.messages.some(m=>m.type===type));}
 peer.messages.length=0;await r.webSocketMessage(t,JSON.stringify({type:'pdf-anno-text',data:{...command(r),documentUrl:'/A.pdf',page:1,stroke:{text:'new'}}}));assert.ok(peer.messages.some(m=>m.type==='pdf-anno-text'));
 }finally{w.close()}
});
await test('retired same-URL page and stop controls cannot mutate the new share',async()=>{
 const {w,t}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/A.pdf',currentPage:4}));const old=command(r,{documentUrl:'/A.pdf'});
 await r.handlePdfStopShare('t',t.deserializeAttachment(),command(r,{documentUrl:'/A.pdf'}));await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/A.pdf',currentPage:7}));
 await r.handlePdfPageChange('t',t.deserializeAttachment(),{...old,currentPage:99});assert.equal(r.pdfState.currentPage,7);await r.handlePdfStopShare('t',t.deserializeAttachment(),old);assert.equal(r.pdfState.url,'/A.pdf');
 }finally{w.close()}
});
await test('missing epoch in the protected room fails closed, legacy default remains unchanged',async()=>{
 const {w,t,peer,r}=await setup();try{await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/A.pdf'}));peer.messages.length=0;await r.webSocketMessage(t,JSON.stringify({type:'pdf-anno-text',data:{documentUrl:'/A.pdf',page:1,stroke:{text:'unproven'}}}));assert.ok(!peer.messages.some(m=>m.type==='pdf-anno-text'));}finally{w.close()}
 const legacy=world('off','off',true,false,false);try{const s=socket('s');legacy.sockets.push(s);const r=await legacy.room();await r.handlePdfShare('s',s.deserializeAttachment(),{url:'/legacy.pdf'});assert.equal(r.pdfState.url,'/legacy.pdf');assert.equal(legacy.kv.has('pdfShareEpoch:v1'),false);}finally{legacy.close()}
});
await test('environment flag alone cannot enable the unfinished protocol',async()=>{
 const w=world('off','off',true,false,true,false);try{const r=await w.room();assert.equal(r.pdfEpochEnabled,false);assert.equal(w.kv.has('pdfShareEpoch:v1'),false);}finally{w.close()}
});
await test('KV failure does not acknowledge a new generation and permits retry',async()=>{
 const {w,t,r}=await setup();try{const before=structuredClone(w.kv.get('pdfShareEpoch:v1'));const data=command(r,{url:'/A.pdf'});w.failKv();await r.handlePdfShare('t',t.deserializeAttachment(),data);assert.deepEqual(w.kv.get('pdfShareEpoch:v1'),before);assert.equal(r.pdfEpochBlocked,true);assert.equal(r.pdfState,null);await r.handlePdfShare('t',t.deserializeAttachment(),data);assert.equal(r.pdfState.url,'/A.pdf');assert.equal(r.pdfEpochBlocked,false);}finally{w.close()}
});

await test('new-class media cleanup advances the durable epoch and remains usable',async()=>{
 const {w,t}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/old.pdf'}));const old=r.pdfEpochRecord.epoch;
 w.sockets.length=0;w.kv.set('emptyAt',now-300001);r=await w.room();const next=socket('next','student',false);w.sockets.push(next);r.handleJoinRoom(next,'next',{username:'next',role:'student'});
 await new Promise(resolve=>setImmediate(resolve));r=await w.room();assert.equal(r.pdfEpochBlocked,false);assert.equal(r.pdfState,null);assert.notEqual(r.pdfEpochRecord.epoch,old);
 }finally{w.close()}
});

await test('boundary read/commit failure cannot expose old media after join and reconstruction',async()=>{
 const {w,t}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/old.pdf'}));w.sockets.length=0;w.kv.set('emptyAt',now-300001);w.failKv();
 r=await w.room();assert.equal(r.pdfEpochBlocked,true);const next=socket('next','student',false);w.sockets.push(next);r.handleJoinRoom(next,'next',{username:'next',role:'student'});
 await new Promise(resolve=>setImmediate(resolve));r=await w.room();assert.equal(r.pdfState,null);
 assert.ok(!next.messages.some(m=>m.type==='pdf-sync'&&m.data.url==='/old.pdf'));
 }finally{w.close()}
});
await test('an active participant prevents age-only cleanup across reconstruction',async()=>{
 const {w,t}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/active.pdf'}));now+=10800001;r=await w.room();assert.equal(r.pdfState.url,'/active.pdf');}finally{w.close()}
});

await test('protocol off/on fences old packets and preserves latest legacy document',async()=>{
 const {w,t}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/old.pdf'}));const old=r.pdfEpochRecord.epoch;
 r=await w.room('off',false,false);assert.equal(r.pdfEpochEnabled,false);assert.equal(r.pdfState.shareEpoch,undefined);await r.handlePdfShare('t',t.deserializeAttachment(),{url:'/legacy-current.pdf'});
 r=await w.room('off',true,true);assert.notEqual(r.pdfEpochRecord.epoch,old);assert.equal(r.pdfState.url,'/legacy-current.pdf');
 }finally{w.close()}
});
await test('failed off-mode fence holds PDF writes instead of mutating the mirror',async()=>{
 const {w,t}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/old.pdf'}));const mirror=structuredClone(w.kv.get('pdfState'));w.failKv();
 r=await w.room('off',false,false);assert.equal(r.pdfEpochBlocked,true);w.failKv();await r.handlePdfShare('t',t.deserializeAttachment(),{url:'/must-not-write.pdf'});assert.deepEqual(w.kv.get('pdfState'),mirror);await r.handlePdfShare('t',t.deserializeAttachment(),{url:'/recovered.pdf'});assert.equal(r.pdfState.url,'/recovered.pdf');assert.equal(r.pdfEpochBlocked,false);
 }finally{w.close()}
});
await test('numeric replay prototype cannot bypass the epoch incompatibility hold',async()=>{
 const w=world('off','on',true,true,true,true);try{const t=socket('t');w.sockets.push(t);const r=await w.room();assert.equal(r.pdfEpochBlocked,true);await r.handlePdfShare('t',t.deserializeAttachment(),{});assert.equal(r.pdfEpochBlocked,true);assert.equal(w.kv.has('pdfShareEpoch:v1'),false);}finally{w.close()}
});

await test('an exact confirmed control retry returns ACK without rebroadcasting its effect',async()=>{
 const {w,t,peer,r}=await setup();try{const data=command(r,{url:'/A.pdf'});await r.handlePdfShare('t',t.deserializeAttachment(),data);peer.messages.length=0;t.messages.length=0;await r.handlePdfShare('t',t.deserializeAttachment(),data);assert.ok(!peer.messages.some(m=>m.type==='pdf-sync'));assert.ok(t.messages.some(m=>m.type==='pdf-share-epoch'&&m.data.ok));}finally{w.close()}
});

await test('protected old packets do not become legacy writes after protocol disable',async()=>{
 const {w,t,peer}=await setup();try{let r=await w.room();await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/same.pdf'}));const old=command(r,{documentUrl:'/same.pdf',url:'/same.pdf'});
 r=await w.room('off',false,false);await r.handlePdfShare('t',t.deserializeAttachment(),{url:'/same.pdf',currentPage:7});peer.messages.length=0;
 await r.webSocketMessage(t,JSON.stringify({type:'pdf-anno-clear',data:{...old,pages:[1]}}));assert.ok(!peer.messages.some(m=>m.type==='pdf-anno-clear'));
 await r.handlePdfStopShare('t',t.deserializeAttachment(),old);assert.equal(r.pdfState.currentPage,7);await r.handlePdfShare('t',t.deserializeAttachment(),old);assert.equal(r.pdfState.currentPage,7);
 }finally{w.close()}
});

await test('1000 live annotation points do not write epoch metadata or enable replay storage',async()=>{
 const {w,t,r}=await setup();try{await r.handlePdfShare('t',t.deserializeAttachment(),command(r,{url:'/A.pdf'}));const before=w.kvWrites;
 await r.webSocketMessage(t,JSON.stringify({type:'pdf-anno-start',data:{...command(r),documentUrl:'/A.pdf',page:1,id:'pen',point:[0,0]}}));
 for(let i=0;i<1000;i++)await r.webSocketMessage(t,JSON.stringify({type:'pdf-anno-point',data:{shareEpoch:r.pdfEpochRecord.epoch,documentUrl:'/A.pdf',page:1,id:'pen',point:[i/1000,0.5]}}));
 assert.equal(w.kvWrites,before);assert.equal(r.pdfHistoryEnabled,false);assert.equal(w.sq.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'vc_pdf_%'").get().n,0);
 }finally{w.close()}
});
console.log(`${pass} PASS / ${fail} FAIL (actual DO handlers; local-only protocol option; synthetic sockets/KV transactions)`);process.exitCode=fail?1:0;
