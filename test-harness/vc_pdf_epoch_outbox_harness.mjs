import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const c={window:{}};vm.runInNewContext(readFileSync(new URL('../cloudflare-deploy/public/js/idx-vc-pdf-epoch.js',import.meta.url),'utf8'),c);
function world(){const sent=[],notes=[],records=[],timers=new Map();let scope=['room','account','self',{},{}],id=0,busy=false,sendOK=true;
 const box=new c.window.PdfEpochOutbox({scope:()=>scope.slice(),send:frame=>{if(sendOK)sent.push(structuredClone(frame));return sendOK},notice:s=>notes.push(s),record:r=>records.push(structuredClone(r)),busy:v=>busy=v,id:()=>`req-${++id}`,setTimeout:f=>{const k=++id;timers.set(k,f);return k},clearTimeout:k=>timers.delete(k)});
 const meta=(epoch='e1',revision=1)=>({epochReady:true,shareEpoch:epoch,shareRevision:revision});box.observe(meta());
 return{box,sent,notes,records,timers,meta,get busy(){return busy},change(index){scope[index]={}},deny(){sendOK=false},ack(epoch,revision,ok=true){box.ack({...meta(epoch,revision),ok,epochRequestId:sent.at(-1).data.epochRequestId})}};
}
let pass=0,fail=0;async function test(n,fn){try{await fn();pass++;console.log('PASS '+n)}catch(e){fail++;console.log('FAIL '+n+' '+e.message)}}
await test('share-stop-share intents serialize only after matching acknowledgements',()=>{const h=world();for(const type of ['pdf-share','pdf-stop-share','pdf-share'])h.box.submit({type,data:{url:'/A.pdf',documentUrl:'/A.pdf'}});assert.equal(h.sent.length,1);h.ack('e2',2);assert.equal(h.sent[1].type,'pdf-stop-share');assert.equal(h.sent[1].data.shareEpoch,'e2');h.ack('e3',3);assert.equal(h.sent[2].type,'pdf-share');assert.equal(h.sent[2].data.shareEpoch,'e3');h.ack('e4',4);assert.equal(h.busy,false);assert.equal(h.timers.size,0)});
for(let boundary=0;boundary<5;boundary++)await test('owner boundary '+boundary+' cancels pending intents without replay',()=>{const h=world();h.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});h.box.submit({type:'pdf-share',data:{url:'/B.pdf'}});h.change(boundary);h.ack('e2',2);assert.equal(h.sent.length,1);assert.equal(h.busy,false);assert.equal(h.box.record,null)});
await test('annotation/page frames are never rebased through a pending stop',()=>{const h=world();h.box.submit({type:'pdf-stop-share',data:{documentUrl:'/A.pdf'}});for(const type of ['pdf-anno-point','pdf-page-change'])assert.equal(h.box.submit({type,data:{shareEpoch:'e1',documentUrl:'/A.pdf'}}),false);assert.equal(h.sent.length,1)});
await test('stale explicit epoch and revision are refused before any send',()=>{const h=world();for(const data of [{shareEpoch:'old'},{shareRevision:0},{epochRequestId:'already-sent'}])assert.equal(h.box.submit({type:'pdf-share',data:{url:'/A.pdf',...data}}),false);assert.equal(h.sent.length,0)});
await test('timeout never automatically retries or executes a later intent',()=>{const h=world();h.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});h.box.submit({type:'pdf-share',data:{url:'/B.pdf'}});[...h.timers.values()][0]();h.ack('e2',2);assert.equal(h.sent.length,1);assert.equal(h.box.record,null);assert.equal(h.busy,false);assert.ok(h.notes.length)});
await test('a rejected command discards all dependent intents',()=>{const h=world();h.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});h.box.submit({type:'pdf-share',data:{url:'/B.pdf'}});h.ack('e5',5,false);assert.equal(h.sent.length,1);assert.equal(h.busy,false);assert.equal(h.box.record.shareEpoch,'e5')});
await test('unsolicited/duplicate ACK cannot roll back a newer snapshot or release a queue',()=>{const h=world();h.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});h.box.ack({...h.meta('bad',1),ok:true,epochRequestId:'other'});assert.equal(h.busy,true);h.box.observe(h.meta('e4',4));h.ack('e2',2);assert.equal(h.box.record.shareEpoch,'e4');assert.equal(h.busy,false)});
await test('pending queue is bounded and reports overflow',()=>{const h=world();for(let i=0;i<17;i++)assert.equal(h.box.submit({type:'pdf-share',data:{url:`/${i}.pdf`}}),true);assert.equal(h.box.submit({type:'pdf-share',data:{url:'/overflow.pdf'}}),false);assert.equal(h.sent.length,1);assert.equal(h.box.queue.length,16);assert.ok(h.notes.length)});
await test('raw send failure cancels pending controls and timers',()=>{const h=world();h.deny();h.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});assert.equal(h.busy,false);assert.equal(h.timers.size,0);assert.ok(h.notes.length)});
await test('page operation has its own acknowledged request ID',()=>{const h=world();h.box.submit({type:'pdf-page-change',data:{documentUrl:'/A.pdf',currentPage:4}});assert.ok(h.sent[0].data.epochRequestId);h.ack('e1',2);assert.equal(h.busy,false)});

for(const bad of [{epochReady:true,shareEpoch:'e2'}, {shareEpoch:'e2',shareRevision:2}])await test('malformed ACK cannot authorize the next queued intent '+JSON.stringify(bad),()=>{
 const h=world();h.box.submit({type:'pdf-share',data:{url:'/A.pdf'}});h.box.submit({type:'pdf-share',data:{url:'/B.pdf'}});
 h.box.ack({...bad,ok:true,epochRequestId:h.sent[0].data.epochRequestId});assert.equal(h.sent.length,1);assert.equal(h.busy,false);assert.equal(h.box.record,null);
});

await test('lazy epoch asset version maps to its shipped bytes',()=>{
 const main=readFileSync(new URL('../cloudflare-deploy/public/js/idx-main.js',import.meta.url),'utf8');
 const key=main.match(/script\.src = '(\/js\/idx-vc-pdf-epoch\.js\?v=\d+)'/)[1];
 const versions=JSON.parse(readFileSync(new URL('./asset-versions.json',import.meta.url),'utf8'));
 const actual=createHash('sha256').update(readFileSync(new URL('../cloudflare-deploy/public/js/idx-vc-pdf-epoch.js',import.meta.url))).digest('hex').slice(0,16);
 assert.equal(versions[key],actual);
});
console.log(`${pass} PASS / ${fail} FAIL (synthetic clock/socket only)`);process.exitCode=fail?1:0;
