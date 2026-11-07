// Epoch state machine on transactional copy-on-write storage. No network/D1/PG.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const ts=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url))('typescript');
const source=readFileSync(process.env.PDF_EPOCH_SOURCE||new URL('../cloudflare-deploy/src/pdf-share-epoch.ts',import.meta.url),'utf8');
const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,crypto});
const {PdfShareEpoch}=exports;
function world(){
    const values=new Map();let serial=Promise.resolve(),token=0,fail=false;
    const storage={transaction(fn){const result=serial.then(async()=>{
        const copy=new Map(structuredClone([...values]));
        const tx={async get(k){return structuredClone(copy.get(k))},async put(entries){for(const [k,v] of Object.entries(entries))copy.set(k,structuredClone(v))}};
        const result=await fn(tx);if(fail){fail=false;throw Error('synthetic commit failure')}
        values.clear();for(const [k,v] of copy)values.set(k,v);return result;
    });serial=result.catch(()=>{});return result;}};
    const core=()=>new PdfShareEpoch(storage,()=>`epoch-${++token}`);
    let id=0;
    const command=(record,extra={})=>({shareEpoch:record.epoch,shareRevision:record.revision,epochRequestId:`request-${++id}`,...extra});
    return{values,storage,core,command,fail:()=>fail=true};
}
const same=(a,b)=>assert.deepEqual(structuredClone(a),structuredClone(b));
let pass=0,fail=0;async function test(name,fn){try{await fn();pass++;console.log('PASS '+name)}catch(e){fail++;console.log('FAIL '+name+' '+e.message)}}
await test('cold open, migration and reconstruction retain one committed identity',async()=>{
    const w=world();w.values.set('pdfState',{url:'/A.pdf',currentPage:4});const first=await w.core().open();
    assert.equal(first.state.currentPage,4);assert.equal(first.state.shareEpoch,first.epoch);
    same(await w.core().open(),first);same(w.values.get('pdfState'),structuredClone(first.state));
});
await test('stop and same-URL reopen reject the old epoch after reconstruction',async()=>{
    const w=world();let c=w.core(),r=await c.open();r=(await c.change('share',w.command(r,{url:'/A.pdf'}),1)).record;const old=r;
    r=(await c.change('stop',w.command(r,{documentUrl:'/A.pdf'}),2)).record;
    assert.notEqual(r.epoch,old.epoch);assert.equal(r.state,null);
    r=(await c.change('share',w.command(r,{url:'/A.pdf'}),3)).record;c=w.core();same(await c.open(),r);
    assert.equal((await c.change('stop',w.command(old,{documentUrl:'/A.pdf'}),4)).ok,false);
    same(await c.open(),r);
});
await test('same active document keeps the epoch but revisions protect old control replays',async()=>{
    const w=world(),c=w.core();let r=await c.open();const share=w.command(r,{url:'/A.pdf'});r=(await c.change('share',share,1)).record;
    const repeated=w.command(r,{url:'/A.pdf'}),first=(await c.change('share',repeated,2)).record;assert.equal(first.epoch,r.epoch);
    const page=(await c.change('page',w.command(first,{documentUrl:'/A.pdf',currentPage:9}),3)).record;
    assert.equal((await c.change('share',repeated,4)).ok,false);assert.equal((await c.open()).state.currentPage,9);
    assert.equal(page.epoch,first.epoch);
});
await test('exact retry is idempotent; request-ID reuse with another payload is rejected',async()=>{
    const w=world(),c=w.core(),r=await c.open(),d=w.command(r,{url:'/A.pdf'});
    const a=await c.change('share',d,1);same(await c.change('share',d,99),a);
    assert.equal((await c.change('share',{...d,url:'/B.pdf'},2)).reason,'duplicate-mismatch');
});
await test('concurrent same-precondition changes have exactly one winner',async()=>{
    const w=world(),c=w.core(),r=await c.open();const results=await Promise.all(['/A.pdf','/B.pdf'].map(url=>c.change('share',w.command(r,{url}),1)));
    assert.equal(results.filter(r=>r.ok).length,1);assert.equal((await c.open()).revision,r.revision+1);
});
for(const operation of ['open','share','stop','page','disable'])await test(operation+' commit failure preserves the complete prior durable state',async()=>{
    const w=world(),c=w.core();let r;
    if(operation!=='open'){r=await c.open();r=(await c.change('share',w.command(r,{url:'/A.pdf'}),1)).record;}
    const before=structuredClone([...w.values]);w.fail();
    await assert.rejects(operation==='open'?c.open():operation==='disable'?c.disable():c.change(operation,w.command(r,{url:'/B.pdf',documentUrl:'/A.pdf',currentPage:4}),2));
    same([...w.values],before);if(r)same(await w.core().open(),r);
});
await test('disable fences old identity and re-enable uses the latest legacy state',async()=>{
    const w=world(),c=w.core();let r=await c.open();r=(await c.change('share',w.command(r,{url:'/old.pdf'}),1)).record;
    await c.disable();w.values.set('pdfState',{url:'/legacy-current.pdf',currentPage:7});
    const fresh=await w.core().open();assert.notEqual(fresh.epoch,r.epoch);assert.equal(fresh.state.url,'/legacy-current.pdf');
    assert.equal((await c.change('share',w.command(r,{url:'/old.pdf'}),2)).ok,false);
});
await test('unexpected mirror edits and corrupt records fail closed without overwriting evidence',async()=>{
    const w=world(),c=w.core();await c.open();w.values.set('pdfState',{url:'/unexpected.pdf'});
    const before=structuredClone([...w.values]);await assert.rejects(w.core().open());same([...w.values],before);
    w.values.set(PdfShareEpoch.KEY,{version:999});await assert.rejects(w.core().open());
});
for(const bad of [undefined,null,'old-epoch'])await test('missing or stale epoch '+String(bad)+' is rejected',async()=>{
    const w=world(),c=w.core(),r=await c.open();assert.equal((await c.change('share',w.command(r,{url:'/A.pdf',shareEpoch:bad}),1)).ok,false);
});
await test('empty repeated stop is harmless and stays reconstructible',async()=>{
    const w=world(),c=w.core();let r=await c.open();const epoch=r.epoch;r=(await c.change('stop',w.command(r),1)).record;
    assert.equal(r.epoch,epoch);assert.equal(r.state,null);same(await w.core().open(),r);
});

await test('migration never enables numeric authoritative replay',async()=>{
    const w=world();w.values.set('pdfState',{url:'/A.pdf',annotationSession:99});const r=await w.core().open();
    assert.equal(r.state.annotationSession,undefined);
});
await test('a broken nonce generator cannot preserve the retired identity',async()=>{
    const w=world();let r=await w.core().open();const c=new PdfShareEpoch(w.storage,()=>r.epoch);
    await assert.rejects(c.change('share',w.command(r,{url:'/A.pdf'}),1));assert.equal((await w.core().open()).state,null);
});
await test('missing revision cannot replay a same-epoch control',async()=>{
    const w=world(),c=w.core(),r=await c.open();assert.equal((await c.change('share',w.command(r,{url:'/A.pdf',shareRevision:undefined}),1)).ok,false);
});
console.log(`${pass} PASS / ${fail} FAIL (in-memory transaction model only)`);process.exitCode=fail?1:0;
