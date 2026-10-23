// Execute the real browser client with asynchronous IndexedDB/fetch boundaries.
// No production data, browser microphone or remote service is used.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const source = readFileSync(new URL('../cloudflare-deploy/public/js/ai-dubbing-library.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
function token(uid) { return Buffer.from(JSON.stringify({uid,exp:Date.now()+600000})).toString('base64url')+'.test-signature'; }
function storage(initial={}) {
  const data=new Map(Object.entries(initial));
  return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),data};
}
// Implements only the IndexedDB surface the client uses, preserving async events,
// structured cloning and the transaction-completion boundary (important for races).
function indexedDBFake() {
  const stores=new Map(), events=[], control={hook:null,failWrites:false};let initialized=false;
  const db={
    createObjectStore(name,{keyPath}) { const store={keyPath,rows:new Map(),indexes:new Map()};stores.set(name,store);return {createIndex:(n,path)=>store.indexes.set(n,path)}; },
    transaction(name,mode) {
      const store=stores.get(name);if(!store) throw new Error('missing store');
      const tx={};
      function op(kind,key,value,index) {
        const req={}, event={kind,store:name,key,value:structuredClone(value),mode};events.push(event);
        Promise.resolve().then(async()=>{
          if(control.hook) await control.hook(event);
          if(control.failWrites && mode==='readwrite') {tx.error=new Error('QuotaExceededError');tx.onabort?.();return;}
          if(kind==='put') store.rows.set(value[store.keyPath],structuredClone(value));
          else if(kind==='delete') store.rows.delete(key);
          else if(kind==='get') req.result=structuredClone(store.rows.get(key));
          else if(kind==='getAll') req.result=[...store.rows.values()].filter(v=>v[store.indexes.get(index)]===key).map(v=>structuredClone(v));
          req.onsuccess?.();tx.oncomplete?.();
        }).catch(e=>{req.error=e;req.onerror?.();tx.onerror?.();});
        return req;
      }
      tx.objectStore=()=>({put:v=>op('put',null,structuredClone(v)),delete:k=>op('delete',k),get:k=>op('get',k),index:n=>({getAll:k=>op('getAll',k,undefined,n)})});
      return tx;
    }
  };
  return {stores,events,control,open() {const req={result:db};Promise.resolve().then(()=>{if(!initialized){initialized=true;req.onupgradeneeded?.();}req.onsuccess?.();});return req;}};
}
function json(body,status=200) {return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}
function world(initial={},idb=indexedDBFake()) {
  const local=storage(initial), calls=[],events=new Map(),timers=new Map(),intervals=[];let nextTimer=1;
  const w={
    console,Headers,Blob,Response,AbortController,DOMException,URL,URLSearchParams,TextDecoder,Uint8Array,atob,crypto:webcrypto,
    localStorage:local,indexedDB:idb,document:{hidden:false,addEventListener:(k,fn)=>events.set(k,fn)},
    addEventListener:(k,fn)=>events.set(k,fn),setTimeout(fn,ms){const n=nextTimer++;timers.set(n,{fn,ms});return n;},clearTimeout:n=>timers.delete(n),
    setInterval(fn,ms){intervals.push({fn,ms});return intervals.length;},
  };
  const out={ctx:w,local,calls,events,timers,intervals,idb,handler:()=>json({ok:true,owner:'test-owner'})};
  w.fetch=(url,opts)=>{
    const d=deferred(), call={url,opts,...d};calls.push(call);
    const aborted=()=>d.reject(new DOMException('aborted','AbortError'));
    opts.signal?.addEventListener('abort',aborted,{once:true});
    Promise.resolve().then(()=>out.handler(call)).then(d.resolve,d.reject);
    return d.promise;
  };
  w.window=w;vm.createContext(w);vm.runInContext(source,w);out.api=w.MangoiDubLibrary;
  out.student=uid=>{local.setItem('mangoi_logged_user',JSON.stringify({uid}));local.setItem('mango_token',token(uid));};
  return out;
}
// The studio owns a separate database with out-of-line keys. Keep its asynchronous
// transaction boundary and commit all deletions together, as IndexedDB does.
function studioDatabase(w, entries = []) {
  const rows = new Map(entries), control = { fail: false }, notices = [];
  const previous = w.ctx.indexedDB;
  const db = {
    close() {}, createObjectStore() {},
    transaction(name, mode) {
      assert.equal(name, 'recs'); assert.equal(mode, 'readwrite');
      const draft = new Map(rows), tx = {}; let pending = 0, done = false;
      function operation(fn) {
        const req = {}; pending++;
        queueMicrotask(() => {
          if (done) return;
          if (control.fail) { done = true; tx.onabort?.(); return; }
          req.result = fn(); req.onsuccess?.(); pending--;
          queueMicrotask(() => {
            if (pending || done) return;
            done = true; rows.clear(); draft.forEach((value, key) => rows.set(key, value)); tx.oncomplete?.();
          });
        });
        return req;
      }
      tx.objectStore = () => ({ getAllKeys: () => operation(() => [...draft.keys()]), delete: (key) => operation(() => draft.delete(key)) });
      return tx;
    },
  };
  w.ctx.indexedDB = { open(name) {
    if (name !== 'dubstudio') return previous.open(name);
    const req = { result: db }; queueMicrotask(() => req.onsuccess?.()); return req;
  } };
  w.ctx.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  w.ctx.dispatchEvent = event => { notices.push(event); w.events.get(event.type)?.(event); return true; };
  return { rows, control, notices };
}
const alice={mangoi_logged_user:JSON.stringify({uid:'Alice'}),mango_token:token('Alice')};
const checks=[];
function test(name,fn){checks.push({name,fn});}

test('identity reads real student/staff shapes, including legacy mirror fallback',async()=>{
  for(const field of ['uid','user_id','id']) {
    const w=world({mangoi_logged_user:JSON.stringify({[field]:'Alice'}),mango_token:token('Alice')});
    assert.equal(w.api.identity(),'student:alice');
  }
  const old=world({mangoi_logged_user:'{}',mango_user:JSON.stringify({uid:'Legacy'}),mango_token:token('Legacy')});
  assert.equal(old.api.identity(),'student:legacy','An empty primary object must not hide a valid mirror');
  for(const session of [{uid:'Teacher'},{username:'Teacher'},{user_id:'Teacher'},{user:{username:'Teacher'}}]) {
    const w=world({mangoi_admin_session:JSON.stringify(session)});
    assert.equal(w.api.identity(),'staff:teacher');
    await w.api.listMovies();
    assert.equal(w.calls[0].opts.headers.get('Authorization'),null);
    assert.equal(decodeURIComponent(w.calls[0].opts.headers.get('X-Dubbing-Actor')),'staff:teacher');
    assert.equal(w.calls[0].opts.credentials,'same-origin');
  }
});

test('actor hint is supplied for JSON and binary; a stale student token cannot change the requested owner',async()=>{
  const w=world(alice);w.student('Bob');w.local.setItem('mango_token',token('Alice'));
  w.handler=call=>{
    const auth=JSON.parse(Buffer.from(call.opts.headers.get('Authorization').slice(7).split('.')[0],'base64url').toString()).uid;
    const actor=decodeURIComponent(call.opts.headers.get('X-Dubbing-Actor'));
    return actor==='student:'+auth.toLowerCase()?json({ok:true}):json({ok:false,error:'actor_mismatch'},401);
  };
  await assert.rejects(w.api.listMovies(),e=>e.status===401);
  await assert.rejects(w.api.getMovie('movie-a'),e=>e.status===401);
  for(const c of w.calls) {
    assert.equal(decodeURIComponent(c.opts.headers.get('X-Dubbing-Actor')),'student:bob');
    assert.equal(c.opts.cache,'no-store');
    assert.ok(!c.url.includes('token')&&!c.url.includes('Alice'));
  }
});

test('a staff login uses the session cookie even if an orphan student token remains',async()=>{
  const w=world({mangoi_admin_session:JSON.stringify({uid:'Teacher'}),mango_token:token('Alice')});
  assert.equal(w.api.identity(),'staff:teacher');
  await w.api.listMovies();
  assert.equal(w.calls[0].opts.headers.get('Authorization'),null);
  assert.equal(decodeURIComponent(w.calls[0].opts.headers.get('X-Dubbing-Actor')),'staff:teacher');
});

test('anonymous cloud access fails before fetch; account A local blobs stay hidden from B and guests',async()=>{
  const w=world();assert.equal(w.api.hasAccount(),false);
  await assert.rejects(w.api.listMovies(),e=>e.code==='auth_required');assert.equal(w.calls.length,0);
  w.student('Alice');w.handler=()=>json({ok:false,error:'library_full'},507);
  const movie=new Blob(['alice-voice'],{type:'video/webm'});
  await assert.rejects(w.api.saveMovie(movie,{clientId:'movie-a',title:'My film'}),e=>e.status===507&&e.localSaved&&e.clientId==='movie-a');
  let rows=await w.api.listLocalMovies();assert.equal(rows.length,1);assert.equal(await rows[0].blob.text(),'alice-voice');
  w.student('Bob');assert.equal((await w.api.listLocalMovies()).length,0);
  w.local.removeItem('mangoi_logged_user');w.local.removeItem('mango_token');assert.equal((await w.api.listLocalMovies()).length,0);
  // A fresh client (page reload) restores the same owner's actual bytes.
  const reload=world(alice,w.idb);rows=await reload.api.listLocalMovies();assert.equal(rows.length,1);assert.equal(await rows[0].blob.text(),'alice-voice');
  await reload.api.removeLocalMovie('movie-a');assert.equal((await reload.api.listLocalMovies()).length,0);
});

test('failed local storage does not block a valid upload, and a rejected upload never discards the local blob',async()=>{
  const w=world(alice);w.idb.control.failWrites=true;
  const result=await w.api.saveMovie(new Blob(['voice'],{type:'video/webm'}),{clientId:'movie-a'});
  assert.equal(result.ok,true);assert.equal(result.localSaved,false);
  w.idb.control.failWrites=false;w.handler=()=>Promise.reject(new TypeError('offline'));
  await assert.rejects(w.api.saveMovie(new Blob(['retry-me'],{type:'video/mp4'}),{clientId:'movie-b'}),e=>e.code==='network'&&e.localSaved);
  assert.equal(await (await w.api.listLocalMovies())[0].blob.text(),'retry-me');
  assert.equal(w.idb.events.filter(e=>e.kind==='delete'&&e.key==='student:alice/movie-b').length,0);
});

test('binary downloads return the exact blob, while invalid JSON success bodies are rejected',async()=>{
  const w=world(alice);w.handler=()=>new Response(new Blob(['audio-bytes'],{type:'audio/webm'}));
  const blob=await w.api.getAudio('draft-a','audio-a');assert.equal(await blob.text(),'audio-bytes');assert.equal(blob.type,'audio/webm');
  w.handler=()=>json({items:[]});await assert.rejects(w.api.listMovies(),e=>e.code==='invalid_response');
  assert.throws(()=>w.api.getAudio('../other','audio-a'),e=>e.code==='invalid_id');
});

test('timeouts differ from account switches, including same-tab changes with no storage event',async()=>{
  const w=world(alice);const never=deferred();w.handler=()=>never.promise;
  const pending=w.api.listMovies();await tick();
  const timer=[...w.timers.values()][0];assert.equal(timer.ms,60000);timer.fn();
  await assert.rejects(pending,e=>e.code==='timeout');assert.equal(w.timers.size,0);
  const late=deferred();w.handler=()=>late.promise;const changes=[];w.api.onAccountChange((now,old)=>changes.push([now,old]));
  const before=w.api.listMovies();await tick();w.student('Bob');late.resolve(json({ok:true,items:[{id:'alice-private'}]}));
  await assert.rejects(before,e=>e.code==='account_changed');
  assert.deepEqual(changes,[['student:bob','student:alice']]);assert.equal(w.timers.size,0);
});

test('an account switch while binary bytes are arriving rejects the late body',async()=>{
  const w=world(alice),body=deferred();w.handler=()=>({ok:true,blob:()=>body.promise});
  const pending=w.api.getMovie('movie-a');await tick();w.student('Bob');body.resolve(new Blob(['alice-private']));
  await assert.rejects(pending,e=>e.code==='account_changed');
});

test('same-tab login changes notify the UI without relying on the browser storage event',async()=>{
  const w=world(alice),changes=[];const remove=w.api.onAccountChange((now,old)=>{changes.push([now,old]);w.api.scope();});
  w.student('Bob');assert.equal(w.api.scope(),'student:bob');
  assert.deepEqual(changes,[['student:bob','student:alice']]);
  w.student('Carol');assert.equal(w.intervals.length,1);assert.equal(w.intervals[0].ms,1000);
  w.intervals[0].fn();assert.deepEqual(changes[1],['student:carol','student:bob']);
  w.intervals[0].fn();assert.equal(changes.length,2,'No duplicate notifications for an unchanged account');
  remove();w.student('Dave');w.intervals[0].fn();assert.equal(changes.length,2);
  assert.equal(w.calls.length,0,'Account polling itself makes no network requests');
});

test('a delayed local restore cannot reveal the previous account’s rows',async()=>{
  const w=world(alice);w.handler=()=>json({ok:false,error:'quota'},507);
  await assert.rejects(w.api.saveMovie(new Blob(['alice-private']),{clientId:'movie-a'}));
  const held=deferred(),entered=deferred();
  w.idb.control.hook=e=>{if(e.kind==='getAll'){entered.resolve();return held.promise;}};
  const pending=w.api.listLocalMovies();await entered.promise;w.student('Bob');held.resolve();
  await assert.rejects(pending,e=>e.code==='account_changed');
});

test('movie cleanup and draft cleanup cannot return another account’s late success',async()=>{
  for(const kind of ['movie','draft']) {
    const w=world(alice),held=deferred(),entered=deferred();
    w.idb.control.hook=e=>{if(e.kind==='delete'){entered.resolve();return held.promise;}};
    const pending=kind==='movie'
      ? w.api.saveMovie(new Blob(['voice']),{clientId:'movie-a'})
      : w.api.deleteDraft('draft-a');
    await entered.promise;w.student('Bob');held.resolve();
    await assert.rejects(pending,e=>e.code==='account_changed');
  }
});

test('draft saves freeze each snapshot and serialize compare-and-swap versions',async()=>{
  const w=world(alice),first=deferred();let puts=0;
  w.handler=call=>{
    if((call.opts.method||'GET')==='GET')return json({ok:false,error:'not_found'},404);
    puts++;return puts===1?first.promise:json({ok:true,draft:{etag:'"v'+puts+'"'}});
  };
  const firstPayload={line:1},p1=w.api.saveDraft('draft-a',firstPayload);firstPayload.line=999;
  const p2=w.api.saveDraft('draft-a',{line:2});await tick();
  let uploads=w.calls.filter(c=>c.opts.method==='PUT');assert.equal(uploads.length,1);
  assert.deepEqual(JSON.parse(uploads[0].opts.body),{line:1});
  assert.equal(uploads[0].opts.headers.get('If-None-Match'),'*');assert.equal(uploads[0].opts.headers.get('If-Match'),null);
  first.resolve(json({ok:true,etag:'"v1"'}));await p1;await p2;
  uploads=w.calls.filter(c=>c.opts.method==='PUT');assert.equal(uploads.length,2);assert.equal(uploads[1].opts.headers.get('If-Match'),'"v1"');
  assert.deepEqual(JSON.parse(uploads[1].opts.body),{line:2});
  await w.api.saveDraft('draft-a',{line:3});uploads=w.calls.filter(c=>c.opts.method==='PUT');
  assert.equal(uploads[2].opts.headers.get('If-Match'),'"v2"','Nested draft.etag is accepted');
  assert.equal((await w.api.getLocalDraft('draft-a')).draft.line,3);
});

test('conflicts preserve the local draft and require a fresh read before another overwrite',async()=>{
  const w=world(alice);let puts=0,readVersion='"remote1"';
  w.handler=call=>{
    if((call.opts.method||'GET')==='GET')return json({ok:true,draft:{etag:readVersion}});
    puts++;return puts===1?json({ok:false,error:'conflict'},412):json({ok:true,etag:'"remote3"'});
  };
  await assert.rejects(w.api.saveDraft('draft-a',{line:1}),e=>e.status===412&&e.localSaved);
  await assert.rejects(w.api.saveDraft('draft-a',{line:2}),e=>e.code==='conflict'&&e.localSaved);
  assert.equal(puts,1,'Conflict is not silently retried with an unconditional overwrite');
  assert.equal((await w.api.getLocalDraft('draft-a')).draft.line,2);
  readVersion='"remote2"';await w.api.getDraft('draft-a');await w.api.saveDraft('draft-a',{line:3});
  assert.equal(w.calls.filter(c=>c.opts.method==='PUT')[1].opts.headers.get('If-Match'),'"remote2"');
});

test('missing response versions block later overwrites instead of weakening the CAS guard',async()=>{
  const w=world(alice);let puts=0;
  w.handler=c=>(c.opts.method||'GET')==='GET'?json({ok:false,error:'not_found'},404):(puts++,json({ok:true}));
  await assert.rejects(w.api.saveDraft('draft-a',{line:1}),e=>e.code==='missing_version');
  await assert.rejects(w.api.saveDraft('draft-a',{line:2}),e=>e.code==='conflict');
  assert.equal(puts,1);
});

test('an account switch during local draft persistence must not fetch or write using the next account',async()=>{
  const w=world(alice),held=deferred(),entered=deferred();
  w.idb.control.hook=e=>{if(e.kind==='put'&&e.store==='drafts'){entered.resolve();return held.promise;}};
  const pending=w.api.saveDraft('draft-a',{line:1});await entered.promise;w.student('Bob');held.resolve();
  await assert.rejects(pending,e=>e.code==='account_changed');
  assert.equal(w.calls.length,0,'The pending A save must not issue a B lookup');
});

test('deleting a studio draft removes only that account and episode, preserving finished movies',async()=>{
  const w=world(alice),raw=new Blob(['synthetic line'],{type:'audio/webm'});
  const device=studioDatabase(w,[
    ['student%3Aalice|picnic:1',raw],['student%3Aalice|picnic:2',raw],
    ['student%3Aalice|teddy:1',raw],['student%3Abob|picnic:1',raw],['guest|picnic:1',raw],['picnic:1',raw],
  ]);
  w.local.setItem('dubstudio.checkpoint.v2:student%3Aalice:picnic','alice checkpoint');
  w.local.setItem('dubstudio.checkpoint.v2:student%3Abob:picnic','bob checkpoint');
  w.handler=c=>(c.opts.method||'GET')==='GET'?json({ok:false,error:'not_found'},404):json({ok:true,etag:'"v1"'});
  await w.api.saveDraft('studio-picnic',{engine:'studio',episodeId:'picnic',state:{}});
  w.handler=()=>json({ok:false,error:'quota'},507);
  await assert.rejects(w.api.saveMovie(new Blob(['finished film']),{clientId:'finished-a'}));
  w.handler=()=>json({ok:true});
  await w.api.deleteDraft('studio-picnic');
  assert.deepEqual([...device.rows.keys()],['student%3Aalice|teddy:1','student%3Abob|picnic:1','guest|picnic:1','picnic:1']);
  assert.equal(w.local.getItem('dubstudio.checkpoint.v2:student%3Aalice:picnic'),null);
  assert.equal(w.local.getItem('dubstudio.checkpoint.v2:student%3Abob:picnic'),'bob checkpoint');
  assert.equal(await w.api.getLocalDraft('studio-picnic'),null);
  assert.equal((await w.api.listLocalMovies()).length,1);
  assert.equal(device.notices[0].type,'mangoi:dubbing-draft-deleted');
  const notice=JSON.parse(w.local.getItem('mangoi:dubbing-draft-deleted'));
  assert.equal(notice.owner,'student:alice');assert.equal(notice.draftId,'studio-picnic');
});

test('a failed remote delete keeps the studio original, checkpoint and fallback manifest',async()=>{
  const w=world(alice),raw=new Blob(['keep this line']);
  const device=studioDatabase(w,[['student%3Aalice|picnic:1',raw]]);
  w.local.setItem('dubstudio.checkpoint.v2:student%3Aalice:picnic','keep checkpoint');
  w.handler=c=>(c.opts.method||'GET')==='GET'?json({ok:false,error:'not_found'},404):json({ok:true,etag:'"v1"'});
  await w.api.saveDraft('studio-picnic',{engine:'studio',episodeId:'picnic',state:{idx:3}});
  w.handler=()=>json({ok:false,error:'draft_busy'},409);
  await assert.rejects(w.api.deleteDraft('studio-picnic'),e=>e.status===409);
  assert.equal(await device.rows.get('student%3Aalice|picnic:1').text(),'keep this line');
  assert.equal(w.local.getItem('dubstudio.checkpoint.v2:student%3Aalice:picnic'),'keep checkpoint');
  assert.equal((await w.api.getLocalDraft('studio-picnic')).draft.state.idx,3);
  assert.equal(device.notices.length,0);
});

test('local guest deletion also removes unowned legacy lines, without touching signed-in recordings',async()=>{
  const w=world(),raw=new Blob(['guest line']);
  const device=studioDatabase(w,[['guest|picnic:1',raw],['picnic:1',raw],['student%3Aalice|picnic:1',raw],['teddy:1',raw]]);
  await assert.rejects(w.api.saveDraft('studio-picnic',{engine:'studio',episodeId:'picnic',state:{}}),e=>e.status===401);
  await w.api.removeLocalDraft('studio-picnic');
  assert.deepEqual([...device.rows.keys()],['student%3Aalice|picnic:1','teddy:1']);
  assert.equal(await w.api.getLocalDraft('studio-picnic'),null);
  assert.equal(w.calls.length,0,'Local-only deletion makes no remote request');
});

test('a save queued before delete completion cannot recreate the removed draft',async()=>{
  const w=world(alice),held=deferred();studioDatabase(w);
  w.handler=()=>held.promise;
  const deleting=w.api.deleteDraft('studio-picnic');
  const staleSave=w.api.saveDraft('studio-picnic',{engine:'studio',episodeId:'picnic',state:{idx:4}});
  const rejected=assert.rejects(staleSave,e=>e.code==='draft_deleted');
  await tick();held.resolve(json({ok:true}));await deleting;await rejected;
  assert.equal(w.calls.filter(c=>c.opts.method==='PUT').length,0);
  assert.equal(await w.api.getLocalDraft('studio-picnic'),null);
  w.handler=c=>(c.opts.method||'GET')==='GET'?json({ok:false,error:'not_found'},404):json({ok:true,etag:'"new"'});
  await w.api.saveDraft('studio-picnic',{engine:'studio',episodeId:'picnic',state:{idx:0}});
  assert.equal(w.calls.filter(c=>c.opts.method==='PUT').length,1,'A new intentional save after deletion works');
});

test('cross-tab deletion rejects a late draft body before it can restore a stale version',async()=>{
  const w=world(alice),held=deferred();w.handler=()=>held.promise;
  const reading=w.api.getDraft('studio-picnic');
  await tick();
  w.events.get('storage')({key:'mangoi:dubbing-draft-deleted',newValue:JSON.stringify({owner:'student:alice',draftId:'studio-picnic',nonce:'deleted-in-other-tab'})});
  held.resolve(json({ok:true,etag:'"stale"',draft:{state:{idx:8}}}));
  await assert.rejects(reading,e=>e.code==='draft_deleted');
});

test('failed studio device cleanup reports failure and keeps a fallback entry for retry',async()=>{
  const w=world(alice),raw=new Blob(['retry deletion']);
  const device=studioDatabase(w,[['student%3Aalice|picnic:1',raw]]);
  w.handler=c=>(c.opts.method||'GET')==='GET'?json({ok:false,error:'not_found'},404):json({ok:true,etag:'"v1"'});
  await w.api.saveDraft('studio-picnic',{engine:'studio',episodeId:'picnic',state:{}});
  device.control.fail=true;
  await assert.rejects(w.api.deleteDraft('studio-picnic'),e=>e.code==='local_cleanup');
  assert.equal(device.rows.size,1);assert.ok(await w.api.getLocalDraft('studio-picnic'));
  device.control.fail=false;await w.api.removeLocalDraft('studio-picnic');
  assert.equal(device.rows.size,0);assert.equal(await w.api.getLocalDraft('studio-picnic'),null);
});

let failures=0;
for(const {name,fn} of checks) {
  try {await fn();console.log('✅ '+name);} catch(e) {failures++;console.error('❌ '+name+'\n   '+e.message);}
}
console.log(`\nDubbing library client: ${checks.length-failures} PASS / ${failures} FAIL`);
if(failures)process.exitCode=1;
