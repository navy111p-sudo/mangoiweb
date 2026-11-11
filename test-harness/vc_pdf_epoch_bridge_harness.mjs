// Actual outbox + actual DO handlers, synthetic sockets and transactional KV.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {DatabaseSync} from 'node:sqlite';import vm from 'node:vm';
const fixtureURL=new URL('./vc_pdf_share_epoch_room_harness.mjs',import.meta.url);
const fixture=readFileSync(fixtureURL,'utf8');const boundary=fixture.indexOf("await test(");assert.ok(boundary>0);
const prelude=fixture.slice(0,boundary).replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(fixtureURL.href));
const {world,socket}=vm.runInNewContext(prelude+'\n;({world,socket})',{assert,readFileSync,createRequire,DatabaseSync,vm,URL,crypto,TextEncoder,structuredClone,process:{env:{}}});
const client={window:{}};vm.runInNewContext(readFileSync(new URL('../cloudflare-deploy/public/js/idx-vc-pdf-epoch.js',import.meta.url),'utf8'),client);
let pass=0,fail=0;async function test(n,f){try{await f();pass++;console.log('PASS '+n)}catch(e){fail++;console.log('FAIL '+n+' '+e.message)}}
async function setup(){const w=world('off','off'),t=socket('t'),peer=socket('peer','student');w.sockets.push(t,peer);const r=await w.room();return{w,t,peer,r}}
function endpoint(r,s){const network=[],notes=[],timers=new Map();let id=0,busy=false;const scope=[{},s],records=[];
 const box=new client.window.PdfEpochOutbox({scope:()=>scope,send:frame=>{network.push(structuredClone(frame));return true},notice:s=>notes.push(s),busy:v=>busy=v,id:()=>`req-${++id}`,setTimeout:f=>{const k=++id;timers.set(k,f);return k},clearTimeout:k=>timers.delete(k),record:m=>records.push(structuredClone(m))});
 box.observe({...r.pdfEpochMeta(),pdfState:r.pdfState});return{box,network,notes,records,timers,get busy(){return busy},receive(){for(const m of s.messages.splice(0)){if(m.type==='pdf-share-epoch')box.ack(m.data);else if(m.type==='pdf-sync')box.observe({...m.data,pdfState:m.data});else if(m.type==='pdf-stop-share')box.observe({...m.data,pdfState:null})}}};
}
await test('rapid same-URL share/stop/share uses actual persisted ACK epochs end to end',async()=>{
 const {w,t,peer,r}=await setup();try{const c=endpoint(r,t);for(const type of ['pdf-share','pdf-stop-share','pdf-share'])c.box.submit({type,data:{url:'/same.pdf',documentUrl:'/same.pdf'}});
 assert.equal(c.network.length,1);let retired;
 for(let i=0;i<3;i++){const frame=c.network.shift();assert.ok(frame);await r.webSocketMessage(t,JSON.stringify(frame));if(i===0)retired={shareEpoch:r.pdfEpochRecord.epoch,documentUrl:'/same.pdf'};c.receive();}
 assert.equal(c.network.length,0);assert.equal(c.busy,false);assert.equal(r.pdfState.url,'/same.pdf');assert.notEqual(r.pdfEpochRecord.epoch,retired.shareEpoch);
 peer.messages.length=0;await r.webSocketMessage(t,JSON.stringify({type:'pdf-anno-clear',data:{...retired,pages:[1]}}));assert.ok(!peer.messages.some(m=>m.type==='pdf-anno-clear'));
 assert.equal(c.box.record.shareEpoch,r.pdfEpochRecord.epoch);assert.equal(c.timers.size,0);
 }finally{w.close()}
});
await test('actual storage rejection cancels all dependent client intents without automatic replay',async()=>{
 const {w,t,r}=await setup();try{const c=endpoint(r,t);c.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});c.box.submit({type:'pdf-share',data:{url:'/B.pdf'}});w.failKv();await r.webSocketMessage(t,JSON.stringify(c.network.shift()));c.receive();assert.equal(c.busy,false);assert.equal(c.box.record,null);assert.equal(c.network.length,0);assert.ok(c.notes.length);assert.equal(r.pdfState,null);}finally{w.close()}
});
await test('two controllers using one old revision cannot both replace the share',async()=>{
 const {w,t,r}=await setup();try{const other=socket('other');w.sockets.push(other);const a=endpoint(r,t),b=endpoint(r,other);
 a.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});b.box.submit({type:'pdf-share',data:{url:'/B.pdf'}});
 await Promise.all([r.webSocketMessage(t,JSON.stringify(a.network.shift())),r.webSocketMessage(other,JSON.stringify(b.network.shift()))]);
 const results=[...t.messages,...other.messages].filter(m=>m.type==='pdf-share-epoch');assert.equal(results.filter(m=>m.data.ok).length,1);
 a.receive();b.receive();assert.equal(a.busy,false);assert.equal(b.busy,false);assert.equal(a.network.length+b.network.length,0);
 }finally{w.close()}
});
console.log(`${pass} PASS / ${fail} FAIL (actual client/server bridge; synthetic transport/storage)`);process.exitCode=fail?1:0;
