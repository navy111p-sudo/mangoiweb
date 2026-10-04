// Isolated fault injection: no production accounts, network or database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('cloudflare-deploy/public/js/speech-preferences.js', 'utf8');
const storage = () => { const values = new Map(); return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; };
const tick = () => new Promise(r=>setImmediate(r));
const token = uid => btoa(JSON.stringify({uid})) + '.test';
function world(uid='Alice', local=storage(), fetcher) {
  local.setItem('mango_token',token(uid));
  local.setItem('mango_user',JSON.stringify({uid}));
  const events={},timers=new Map(); let timerId=0;
  const window={addEventListener:(type,fn)=>events[type]=fn};
  const remote=new Map(); let online=true, requests=[];
  const fetch=async(url,o)=>{
    const owner=JSON.parse(atob(o.headers.Authorization.slice(7).split('.')[0])).uid.toLowerCase();
    const app=new URL(url,'http://sandbox').searchParams.get('app');
    requests.push({owner,app,method:o.method});
    if (!online) throw Error('offline');
    if(o.method==='PUT') remote.set(owner+':'+app,JSON.parse(o.body).level);
    return {ok:true,json:async()=>({ok:true,level:remote.get(owner+':'+app)??null})};
  };
  vm.runInNewContext(source,{window,localStorage:local,sessionStorage:storage(),atob,AbortController,
    setTimeout:(fn)=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),fetch:fetcher||fetch});
  return {create:window.MangoiSpeechPreferences.create,local,remote,events,timers,requests,
    setOnline:v=>online=v,expire:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}}};
}
let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;}catch(e){failed++;console.error('FAIL',name,e.message);}}
for(const app of ['warmup','friend']){
  for(let level=1;level<=5;level++){
    for(let round=0;round<4;round++) await check(`${app} level ${level} reload ${round}`,async()=>{
      const w=world('Student'+round),p=w.create(app,3,()=>{});await p.ready;
      p.set(level);await tick();
      assert.equal(w.remote.get('student'+round+':'+app),level);
      const restored=w.create(app,3,()=>{});await restored.ready;assert.equal(restored.level,level);
      assert.equal(w.requests.filter(r=>r.method==='PUT').length,1,'restoring must not write defaults');
    });
  }
  await check(app+' latest of 60 rapid changes',async()=>{
    const w=world(),p=w.create(app,3,()=>{});await p.ready;
    for(let i=0;i<60;i++)p.set(i%5+1);await tick();await tick();
    assert.equal(w.remote.get('alice:'+app),5);
    assert.equal(w.create(app,3,()=>{}).level,5);
  });
  await check(app+' late GET cannot undo manual selection',async()=>{
    let reply; const w=world('Alice',storage(),(url,o)=>o.method==='GET'?new Promise(r=>reply=r):Promise.resolve({ok:true,json:async()=>({ok:true})}));
    const p=w.create(app,3,()=>assert.fail('stale callback'));p.set(1);
    reply({ok:true,json:async()=>({ok:true,level:5})});await p.ready;assert.equal(p.level,1);
  });
  await check(app+' offline write retries',async()=>{
    const w=world(),p=w.create(app,3,()=>{});await p.ready;w.setOnline(false);p.set(2);await tick();
    w.setOnline(true);w.events.online();await tick();assert.equal(w.remote.get('alice:'+app),2);
  });
  await check(app+' failed initial read retries when online',async()=>{
    const w=world();w.remote.set('alice:'+app,1);w.setOnline(false);
    let displayed=3;const p=w.create(app,3,v=>displayed=v);await p.ready;
    w.setOnline(true);w.events.online();await tick();
    assert.equal(p.level,1);assert.equal(displayed,1);
  });
  await check(app+' hanging auth cannot block ready forever',async()=>{
    const w=world();let done=false;
    const p=w.create(app,3,()=>{},()=>new Promise(()=>{}));p.ready.then(()=>done=true);
    await tick();w.expire();await tick();assert.equal(done,true);
  });
  await check(app+' old page must not save under switched account',async()=>{
    const w=world(),p=w.create(app,3,()=>{});await p.ready;
    w.local.setItem('mango_token',token('Bob'));p.set(5);await tick();assert.equal(w.requests.filter(x=>x.method==='PUT').length,0);
  });
  await check(app+' blocked browser storage remains usable',async()=>{
    const w=world();w.local.getItem=()=>{throw Error('storage denied');};w.local.setItem=()=>{throw Error('storage denied');};
    const p=w.create(app,3,()=>{});await p.ready;p.set(2);assert.equal(p.level,2);
  });
  for(const value of ['{broken','null','true','{"level":9,"dirty":true}','{"level":"2"}','{"level":1.2}'])
    await check(app+' corrupted cache '+value,async()=>{
      const w=world();w.local.setItem('mangoi_speech_rate_v1:alice:'+app,value);
      const p=w.create(app,3,()=>{});await p.ready;assert.equal(p.level,3);assert.equal(w.requests.filter(x=>x.method==='PUT').length,0);
    });
}
// Exercise the exact production hydration wait at the beginning of both speech functions.
for(const [page,marker,pref,stopCounter] of [
  ['warmup','function speak(text, btn){','warmupRatePreference','_speakSeq'],
  ['ai-friend','function speakText(text, btn, row, onDone) {','friendRatePreference','_stmGen']
]) await check(page+' stop during restore cancels queued speech',async()=>{
  const html=fs.readFileSync('cloudflare-deploy/public/'+page+'.html','utf8');
  let start=html.indexOf(marker),end=html.indexOf(page==='warmup'?'  /* 📡 P2':'      if (!window.MangoiTTS)',start);
  let release,spoken=0,finished=0;
  const p={loaded:false,ready:new Promise(r=>release=r)};
  const ctx=vm.createContext({[pref]:p,[stopCounter]:0,_warmEpoch:0,_warmPaused:false,played:()=>spoken++});
  vm.runInContext(html.slice(start,end)+'played();}',ctx);
  const fn=page==='warmup'?ctx.speak:ctx.speakText;
  fn('hello',null,null,()=>finished++);ctx[stopCounter]++;p.loaded=true;release();await tick();
  assert.equal(spoken,0);
  if(page==='ai-friend')assert.equal(finished,1,'cancelled stream promise must settle');
});
console.log(JSON.stringify({suite:'speech fault sandbox',passed,failed}));
if(failed)process.exitCode=1;
