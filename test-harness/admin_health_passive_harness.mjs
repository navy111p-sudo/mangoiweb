/** Execute shipped health dashboard and bundled Worker offline. No live fetches or storage. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('cloudflare-deploy/public/admin/health.html', root), 'utf8');
const code = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const BINDINGS'));
assert.ok(code, 'exercise the complete shipped dashboard script');
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }
const good = { ok: true, mode: 'passive', build_stamp: 'fixture-build', bindings: { DB:true, PDF_STORE:true, SESSION_STATE:true, RECORDINGS:true, AI:true, SIGNALING_ROOM:true, VIDEO_CALL_ROOM:true } };
const passivePath = '/api/admin/health-check?mode=passive';
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
class Element {
  constructor(tag='div') { this.tagName=tag; this.children=[]; this.className=''; this.textContent=''; this.checked=false; this.disabled=false; this.listeners={}; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children=children; this.textContent=''; }
  addEventListener(type, fn) { this.listeners[type]=fn; }
  fire(type) { return this.listeners[type]?.({target:this}); }
}
function fixture() {
  const nodes=new Map();
  for (const m of html.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const n=new Element(m[1]);n.checked=/\bchecked\b/.test(m[2]);n.disabled=/\bdisabled\b/.test(m[2]);nodes.set(m[3],n);
  }
  let next=0, approve=true, responder=null;
  const intervals=new Map(), timeouts=new Map(), requests=[], confirms=[], events={};
  const document={ getElementById:id=>{assert.ok(nodes.has(id),'real DOM id '+id);return nodes.get(id);}, createElement:tag=>new Element(tag), hidden:false };
  const respond=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(data)});
  const defaultResponder=path=>respond(path===passivePath?good:path==='/api/health'?{status:'ok'}:{ok:true,bindings:{DB:true},db_query_ok:true});
  const fetch=async(path,opts)=>{
    requests.push({path,opts});
    assert.ok([passivePath,'/api/health','/api/admin/health-check'].includes(path),'only reviewed paths');
    assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);assert.equal(opts.cache,'no-store');assert.equal(opts.credentials,'include');
    return (responder||defaultResponder)(path,opts);
  };
  const window={confirm:text=>{confirms.push(text);return approve;},addEventListener:(type,fn)=>{events[type]=fn;}};
  vm.runInNewContext(code,{document,window,fetch,AbortController,performance,Date,console,
    setInterval:(fn,ms)=>{const id=++next;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),
    setTimeout:(fn,ms)=>{const id=++next;timeouts.set(id,{fn,ms});return id;},clearTimeout:id=>timeouts.delete(id)});
  return {nodes,document,events,requests,confirms,intervals,timeouts,respond,el:id=>nodes.get(id),
    tick:()=>{for(const t of [...intervals.values()])t.fn();},approve:value=>{approve=value;},setResponder:fn=>{responder=fn;},
    timeout:()=>{for(const t of [...timeouts.values()])t.fn();}};
}
const text = el => [el.textContent,...el.children.map(text)].join(' ');
const cards = f => f.el('bindings').children;
let f=fixture();await flush();
check('load performs exactly one passive request; no diagnostics selected or confirmed',()=>{
  assert.deepEqual(f.requests.map(r=>r.path),[passivePath]);assert.equal(f.confirms.length,0);
  assert.equal(f.el('diagnostic-worker').checked,false);assert.equal(f.el('diagnostic-db').checked,false);
  assert.equal(f.intervals.size,1);assert.equal([...f.intervals.values()][0].ms,10000);
});
check('actual boolean binding schema displays presence, never operational green',()=>{
  assert.equal(cards(f).length,7);assert.equal(f.el('summary-configured').textContent,7);
  assert.ok(cards(f).every(c=>c.className==='tile gray'&&text(c).includes('동작 미검증')));
  assert.equal(f.el('build-stamp').textContent,'fixture-build');assert.equal(f.el('summary-icon').className,'big gray');
});
f.tick();await flush();await f.el('refresh-btn').fire('click');await flush();
check('timer and refresh button remain passive',()=>assert.deepEqual(f.requests.map(r=>r.path),[passivePath,passivePath,passivePath]));
f.document.hidden=true;f.tick();await flush();
check('hidden page skips timed refresh',()=>assert.equal(f.requests.length,3));
f.document.hidden=false;f.el('auto-refresh').checked=false;f.el('auto-refresh').fire('change');
check('turning auto refresh off clears timer',()=>assert.equal(f.intervals.size,0));
f.el('auto-refresh').checked=true;f.el('auto-refresh').fire('change');f.el('auto-refresh').fire('change');
check('repeated enabling never duplicates timers',()=>assert.equal(f.intervals.size,1));
let resolvePassive;
f.setResponder(()=>new Promise(resolve=>{resolvePassive=resolve;}));
const refresh=f.el('refresh-btn').fire('click');f.tick();f.el('refresh-btn').fire('click');
check('passive inflight lock coalesces repeated manual/timer refresh',()=>{assert.equal(f.requests.length,4);assert.equal(f.el('refresh-btn').disabled,true);});
resolvePassive(f.respond(good));await refresh;
check('passive lock releases after completion',()=>assert.equal(f.el('refresh-btn').disabled,false));
for (const data of [{ok:true,mode:'passive',bindings:{DB:false,AI:'true',PDF_STORE:{status:'ok',length:99,detail:'SECRET_SENTINEL'}}},
  {ok:true,bindings:{DB:true},buildInfo:{stamp:'unrelated'}}, {ok:true,mode:'passive',build_stamp:'unknown'}]) {
  f.setResponder(()=>f.respond(data));await f.el('refresh-btn').fire('click');
  check('unknown / unconfigured / obsolete schema stays unverified',()=>{
    assert.equal(f.el('build-stamp').textContent,'미확인');assert.ok(cards(f).every(c=>!c.className.includes('green')));
    assert.ok(!text(f.el('bindings')).includes('SECRET_SENTINEL'));assert.ok(!text(f.el('bindings')).includes('99'));
    assert.equal(f.el('summary-icon').className,'big gray');
    if(data.bindings?.DB===false) {assert.equal(f.el('summary-unconfigured').textContent,1);assert.equal(f.el('summary-unknown').textContent,6);}
  });
}
f.setResponder(()=>f.respond({...good,build_stamp:'<img src=x onerror=alert(1)>'}));await f.el('refresh-btn').fire('click');
check('stamp rendered as plain text',()=>{assert.equal(f.el('build-stamp').textContent,'<img src=x onerror=alert(1)>');assert.equal(f.el('build-stamp').children.length,0);});
for(const failure of [()=>f.respond({},401),()=>f.respond({},503),()=>{throw new Error('private-error-detail');},()=>({ok:true,json:async()=>{throw new Error('invalid json');}}),()=>f.respond(null)]) {
  f.setResponder(failure);await f.el('refresh-btn').fire('click');
  check('passive HTTP/network/JSON failure clears stale build and reports unknown without raw error',()=>{
    assert.equal(f.el('build-stamp').textContent,'미확인');assert.equal(f.el('summary-unknown').textContent,7);
    assert.equal(f.el('refresh-btn').disabled,false);assert.match(f.el('last-update').textContent,/실패/);
    assert.doesNotMatch(f.el('last-update').textContent,/private-error-detail/);
  });
}
f.setResponder(null);
let before=f.requests.length;await f.el('run-diagnostics').fire('click');
check('no selection sends nothing and requests selection',()=>{assert.equal(f.requests.length,before);assert.equal(f.confirms.length,0);});
f.el('diagnostic-worker').checked=true;f.approve(false);await f.el('run-diagnostics').fire('click');
check('declined confirmation sends no requests',()=>{assert.equal(f.requests.length,before);assert.equal(f.confirms.length,1);});
f.approve(true);await f.el('run-diagnostics').fire('click');
check('explicit Worker-only selection invokes only pure health route',()=>{
  assert.deepEqual(f.requests.slice(before).map(r=>r.path),['/api/health']);
  assert.match(f.el('endpoints').children[0].className,/green/);assert.match(f.el('endpoints').children[1].className,/gray/);
});
const resultText=text(f.el('endpoints'));f.tick();await flush();
check('passive timer leaves manual diagnostic results intact and never reruns them',()=>assert.equal(text(f.el('endpoints')),resultText));
f.el('diagnostic-worker').checked=false;f.el('diagnostic-db').checked=true;before=f.requests.length;await f.el('run-diagnostics').fire('click');
check('D1-only selection uses legacy diagnostic route once',()=>{
  assert.deepEqual(f.requests.slice(before).map(r=>r.path),['/api/admin/health-check']);assert.match(f.el('endpoints').children[1].className,/green/);
  assert.match(f.confirms.at(-1),/SELECT 1/);
});
for(const data of [{ok:true,bindings:{DB:false}},{ok:true,bindings:{DB:true}},{ok:true,db_query_ok:false},{ok:true,db_query_error:'SECRET_SENTINEL'},{ok:true,db_query_ok:'true'}]){
  f.setResponder(()=>f.respond(data));await f.el('run-diagnostics').fire('click');
  check('D1 absent / unknown / failed / malformed diagnostic is never green or raw error',()=>{
    assert.doesNotMatch(f.el('endpoints').children[1].className,/green/);assert.doesNotMatch(text(f.el('endpoints')),/SECRET_SENTINEL/);
  });
}
f.setResponder(()=>f.respond({},403));await f.el('run-diagnostics').fire('click');
check('manual authorization failure is not route success',()=>{assert.match(text(f.el('endpoints')),/HTTP 403/);assert.match(f.el('endpoints').children[1].className,/red/);});
f.el('diagnostic-worker').checked=true;
let pending=[];f.setResponder((path,opts)=>path===passivePath?f.respond(good):new Promise(resolve=>pending.push({resolve,opts,path})));
before=f.requests.length;const firstRun=f.el('run-diagnostics').fire('click');await flush();f.el('run-diagnostics').fire('click');
check('two selected diagnostics run once each; repeated click suppressed',()=>{
  assert.deepEqual(f.requests.slice(before).map(r=>r.path),['/api/health','/api/admin/health-check']);
  assert.equal(f.el('run-diagnostics').disabled,true);assert.equal(f.el('diagnostic-db').disabled,true);assert.equal(f.el('cancel-diagnostics').disabled,false);
});
f.tick();await flush();
check('timer during diagnostics only refreshes passive config',()=>assert.equal(f.requests.at(-1).path,passivePath));
f.el('cancel-diagnostics').fire('click');
check('cancellation aborts active controllers and unlocks controls',()=>{
  assert.ok(pending.every(p=>p.opts.signal.aborted));assert.equal(f.el('run-diagnostics').disabled,false);assert.equal(f.el('cancel-diagnostics').disabled,true);
});
const cancelled=text(f.el('endpoints'));const cancelStatus=f.el('diagnostic-status').textContent;
for(const p of pending)p.resolve(f.respond({ok:true,status:'ok',db_query_ok:true}));await firstRun;
check('late cancelled responses cannot repaint results or completion',()=>{assert.equal(text(f.el('endpoints')),cancelled);assert.equal(f.el('diagnostic-status').textContent,cancelStatus);});
// A cancelled old run may finish after a newer run; it must not unlock or replace that run.
pending=[];const oldRun=f.el('run-diagnostics').fire('click');await flush();const oldPending=pending;f.el('cancel-diagnostics').fire('click');pending=[];
const newRun=f.el('run-diagnostics').fire('click');await flush();for(const p of oldPending)p.resolve(f.respond({status:'ok',ok:true,db_query_ok:true}));await oldRun;
check('old completion cannot alter newer in-flight diagnostics',()=>{assert.equal(f.el('run-diagnostics').disabled,true);assert.match(f.el('diagnostic-status').textContent,/실행 중/);});
for(const p of pending)p.resolve(f.respond(p.path==='/api/health'?{status:'ok'}:{ok:true,db_query_ok:true}));await newRun;
check('new run completes normally after cancellation retry',()=>assert.equal(f.el('run-diagnostics').disabled,false));
f.setResponder((path,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
const timeoutRun=f.el('run-diagnostics').fire('click');f.timeout();await timeoutRun;
check('diagnostic timeout reports failure and releases lock for retry',()=>{assert.match(text(f.el('endpoints')),/응답 시간 초과/);assert.equal(f.el('run-diagnostics').disabled,false);});
const timeoutRefresh=f.el('refresh-btn').fire('click');f.timeout();await timeoutRefresh;
check('passive timeout releases refresh lock',()=>{assert.match(f.el('last-update').textContent,/응답 시간 초과/);assert.equal(f.el('refresh-btn').disabled,false);});
const hiddenRefresh=f.el('refresh-btn').fire('click');const hiddenRun=f.el('run-diagnostics').fire('click');f.events.pagehide();await Promise.all([hiddenRefresh,hiddenRun]);
check('pagehide cancels active work and stops timers',()=>{assert.equal(f.intervals.size,0);assert.equal(f.el('run-diagnostics').disabled,false);assert.equal(f.el('refresh-btn').disabled,false);});
f.setResponder(null);before=f.requests.length;f.events.pageshow({persisted:true});await flush();
check('back/forward restore resumes passive refresh only',()=>{assert.equal(f.intervals.size,1);assert.deepEqual(f.requests.slice(before).map(r=>r.path),[passivePath]);});
check('dangerous probes and false deployment label are absent from dashboard',()=>{
  for(const path of ['/api/recordings/test-r2','/api/turn-config','force-end','heartbeat','__probe__'])assert.ok(!code.includes(path),path);
  assert.doesNotMatch(html,/마지막 배포|b\.d1|buildInfo|length=/);assert.match(html,/배포 확인 아님/);
});

// Full Worker router + real auth/scope code with instrumented fake D1 and inert bindings.
const require=createRequire(new URL('cloudflare-deploy/package.json',root));
const compiled=require('esbuild').buildSync({entryPoints:[new URL('cloudflare-deploy/src/index.ts',root).pathname],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'}).outputFiles[0].text;
const savedFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('External network forbidden');};
try {
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))).default;
  const queries=[],writes=[],bindingCalls=[];
  let dbResult={one:1},dbFailure=false,authFailure=false;
  const statement=(sql,args=[])=>({
    bind:(...a)=>statement(sql,a),
    async first(){
      queries.push(sql);
      if(sql==='SELECT 1 AS one'){if(dbFailure)throw new Error('fixture diagnostic failure');return dbResult;}
      if(/FROM admin_sessions/.test(sql)){if(authFailure||args[0]==='invalid')return null;return {username:args[0],expires_at:Date.now()+600000};}
      if(/FROM admin_scope/.test(sql))return {scope_type:args[0]==='agency_fixture'?'agency':'hq',scope_value:'fixture'};
      if(/FROM admin_account/.test(sql))return {name:'fixture'};
      return null;
    },
    async all(){return {results:[]};},
    async run(){writes.push(sql);return {success:true,meta:{changes:1}};}
  });
  const DB={prepare:sql=>statement(sql),async exec(sql){writes.push(sql);return {count:1};}};
  const inert=new Proxy({}, {get(target,name){return ()=>{bindingCalls.push(name);throw new Error('Diagnostic touched non-D1 binding');};}});
  const env={DB,PDF_STORE:inert,SESSION_STATE:inert,RECORDINGS:inert,AI:inert,SIGNALING_ROOM:inert,VIDEO_CALL_ROOM:inert,BUILD_STAMP:'fixture-build',SOLAPI_API_KEY:'fixture-secret-not-for-output'};
  const call=async(path,token='admin')=>{
    queries.length=0;writes.length=0;bindingCalls.length=0;
    const request=new Request('https://example.invalid'+path,{headers:token?{cookie:'mango_admin_session='+token}:{}});
    const response=await worker.fetch(request,env,{waitUntil(){}});
    return {status:response.status,body:await response.json(),headers:response.headers,queries:[...queries],writes:[...writes],bindingCalls:[...bindingCalls]};
  };
  let r=await call(passivePath);
  check('bundled Worker passive mode returns boolean presence and build without diagnostic SELECT 1',()=>{
    assert.equal(r.status,200);assert.equal(r.body.mode,'passive');assert.equal(r.body.build_stamp,'fixture-build');
    assert.ok(Object.values(r.body.bindings).every(v=>v===true));assert.equal(r.body.db_query_ok,undefined);assert.equal(r.body.db_query_error,undefined);
    assert.ok(!r.queries.includes('SELECT 1 AS one'));assert.equal(r.bindingCalls.length,0);assert.equal(r.headers.get('cache-control'),'no-store');
    assert.ok(r.queries.some(sql=>/FROM admin_sessions/.test(sql)),'same real session gate executes');
    assert.ok(r.writes.some(sql=>/UPDATE admin_sessions SET last_seen_at/.test(sql)),'existing authentication activity is preserved, not misrepresented as zero I/O');
  });
  check('secrets output remains presence booleans only, no values/lengths',()=>{
    assert.equal(r.body.secrets_present.SOLAPI_API_KEY,true);assert.equal(r.body.secrets_present.VAPID_PRIVATE_KEY,false);
    assert.ok(Object.values(r.body.secrets_present).every(v=>typeof v==='boolean'));
    assert.ok(!JSON.stringify(r.body).includes('fixture-secret-not-for-output'));assert.ok(!JSON.stringify(r.body).includes('length'));
  });
  r=await call('/api/admin/health-check');
  check('legacy default retains exactly one diagnostic SELECT 1 with successful result',()=>{
    assert.equal(r.status,200);assert.equal(r.body.db_query_ok,true);assert.equal(r.queries.filter(sql=>sql==='SELECT 1 AS one').length,1);assert.equal(r.bindingCalls.length,0);
  });
  dbFailure=true;r=await call(passivePath);
  check('passive mode does not hit failing diagnostic query',()=>{assert.equal(r.status,200);assert.equal(r.body.db_query_error,undefined);assert.ok(!r.queries.includes('SELECT 1 AS one'));});
  r=await call('/api/admin/health-check');
  check('legacy active failure still reported as query error',()=>{assert.equal(r.body.db_query_error,'fixture diagnostic failure');assert.equal(r.body.db_query_ok,undefined);});
  dbFailure=false;dbResult={one:0};r=await call('/api/admin/health-check');
  check('legacy active unexpected query result remains false',()=>assert.equal(r.body.db_query_ok,false));dbResult={one:1};
  for(const token of [null,'invalid'])for(const path of [passivePath,'/api/admin/health-check']){
    r=await call(path,token);check('both modes reject missing/invalid session before diagnostics',()=>{assert.equal(r.status,401);assert.equal(r.body.build_stamp,undefined);assert.ok(!r.queries.includes('SELECT 1 AS one'));});
  }
  for(const token of ['admin','agency_fixture'])for(const path of [passivePath,'/api/admin/health-check']){
    r=await call(path,token);check('existing HQ and organization health access remains available in both modes',()=>assert.equal(r.status,200));
  }
  authFailure=true;r=await call(passivePath);
  check('passive mode cannot bypass failing authentication',()=>assert.equal(r.status,401));authFailure=false;
  r=await call('/api/health',null);
  check('retained public health GET is pure through the full Worker',()=>{assert.equal(r.status,200);assert.equal(r.body.status,'ok');assert.equal(r.queries.length,0);assert.equal(r.writes.length,0);assert.equal(r.bindingCalls.length,0);});
  env.RECORDINGS=undefined;env.BUILD_STAMP=undefined;r=await call(passivePath);
  check('missing binding/build are reported without invented operational status',()=>{assert.equal(r.body.bindings.RECORDINGS,false);assert.equal(r.body.build_stamp,null);});
} finally {globalThis.fetch=savedFetch;}
console.log(`Admin passive health: PASS ${count}; shipped DOM + full bundled Worker, no live calls`);
