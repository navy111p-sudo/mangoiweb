// Exercise the real main player and home integration. Media capture/playback and
// network boundaries are replaced; resume, finalization and score orchestration run.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const core=read('cloudflare-deploy/public/js/ai-dubbing-core.js');
const home=read('cloudflare-deploy/public/js/ai-dubbing-home.js');
const main=read('cloudflare-deploy/public/js/ai-dubbing.js');
const tick=()=>new Promise(r=>setImmediate(r));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
async function until(check){for(let i=0;i<30;i++){if(check())return;await tick();}assert.fail('Timed out waiting for the player to settle');}
class El {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.events=new Map();this.attrs={};this.style={};this.hidden=false;this.disabled=false;this.checked=false;this.value='';this.innerHTML='';this._text='';this.classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!this.classes.has(x);on?this.classes.add(x):this.classes.delete(x);}};}
  set textContent(v){this._text=String(v);this.children=[];} get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  append(...xs){xs.forEach(x=>{this.children.push(x);x.parentNode=this;});}appendChild(x){this.append(x);return x;}
  replaceChildren(...xs){this.children.forEach(x=>x.parentNode=null);this.children=[];this._text='';this.append(...xs);}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  addEventListener(k,f){const a=this.events.get(k)||[];a.push(f);this.events.set(k,a);}removeEventListener(k,f){this.events.set(k,(this.events.get(k)||[]).filter(x=>x!==f));}
  async fire(k,event={}){for(const f of this.events.get(k)||[])await f.call(this,{currentTarget:this,target:this,...event});}
  querySelectorAll(selector){const all=[];const walk=x=>{x.children.forEach(c=>{all.push(c);walk(c);});};walk(this);if(selector==='video')return all.filter(x=>x.tagName==='video');if(selector==='[data-library-view]')return all.filter(x=>x.attrs['data-library-view']);return[];}
  get isConnected(){return!!(this.root||this.parentNode?.isConnected);}get scrollHeight(){return this.children.length*100;}
  scrollIntoView(){}focus(){this.focused=true;}pause(){this.paused=true;}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
}
const fixture={id:'fixture',title:{ko:'모험',en:'Adventure'},status:'final',note:{ko:'',en:''},playable:['mina','jun'],characters:{mina:{emoji:'M',name:{ko:'미나',en:'Mina'}},jun:{emoji:'J',name:{ko:'준',en:'Jun'}}},scenes:[
  {no:1,label:{ko:'첫 장면',en:'First scene'},video:'/one.mp4',durationSec:60,lines:[{id:'a',speaker:'mina',en:'Can you help me?',ko:'도와줄래?'}]},
  {no:2,label:{ko:'짧은 장면',en:'Short scene'},video:'/two.mp4',durationSec:30,lines:[{id:'b',speaker:'mina',en:'Thank you!',ko:'고마워!'}]},
  {no:3,label:{ko:'마지막 장면',en:'Last scene'},video:'/three.mp4',durationSec:45,lines:[{id:'c',speaker:'jun',en:'Let us go!',ko:'가자!'}]},
]};
function world(){
  const els=new Map(),data=new Map(),listeners=[],events=new Map();
  const el=id=>{if(!els.has(id)){const e=new El();e.id=id;e.root=true;els.set(id,e);}return els.get(id);};
  const out={owner:'student:alice',saved:[],drafts:[],fetches:[],revoked:[],micCount:0,movieStarts:0,localMovies:[],remoteDrafts:[],localDrafts:[],deletedDrafts:[]};
  const ctx={console,Blob,FormData,Headers,Response,URLSearchParams,Promise,setTimeout,clearTimeout,setInterval,clearInterval,
    location:{search:'?ep=fixture',href:''},getLang:()=> 'ko',alert:()=>{},confirm:()=>true,
    localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)},
    URL:{createObjectURL:()=> 'blob:test-'+Math.random(),revokeObjectURL:u=>out.revoked.push(u)},
    speechSynthesis:{cancel(){}},document:{readyState:'loading',getElementById:el,createElement:t=>new El(t),querySelectorAll:()=>[],addEventListener:(k,f)=>events.set(k,f),body:el('body')},
    addEventListener:(k,f)=>events.set(k,f),matchMedia:()=>({matches:false,addEventListener(){}}),
  };
  const lib={
    identity:()=>out.owner,hasAccount:()=>out.owner!=='guest',newId:()=> 'movie-id',errorText:e=>e.code||e.message||'save_error',
    onAccountChange:fn=>listeners.push(fn),saveDraft:async(id,p)=>{out.drafts.push({id,p:structuredClone(p),owner:out.owner});return{ok:true,etag:'version'};},
    saveMovie:async(blob,meta)=>{out.saved.push({blob,meta,owner:out.owner});return{ok:true,movie:{id:'server-movie'}};},
    listMovies:async()=>({ok:true,movies:[]}),listLocalMovies:async()=>out.localMovies,
    listDrafts:async()=>({ok:true,drafts:out.remoteDrafts}),listLocalDrafts:async()=>out.localDrafts,getLocalDraft:async()=>null,
    deleteDraft:async id=>out.deletedDrafts.push({id,scope:'remote',owner:out.owner}),
    removeLocalDraft:async id=>out.deletedDrafts.push({id,scope:'local',owner:out.owner}),
  };
  ctx.MangoiDubLibrary=lib;ctx.window=ctx;ctx.hooks={
    mic:run=>{out.micCount++;run.mic={stream:{getTracks:()=>[{stop(){}}]}};return Promise.resolve(run.mic);},
    scene:(run,sc)=>{ctx.MangoiDubCore.assignLines(sc,ctx.testDub.S.cast,run.counters);return Promise.resolve();},
    movie:()=>{out.movieStarts++;const mv={chunks:[new Blob(['v'.repeat(3000)],{type:'video/webm'})],startedAt:Date.now()-2000};mv.rec={state:'recording',mimeType:'video/webm',stop(){this.state='inactive';Promise.resolve().then(()=>this.onstop());}};return mv;},
  };
  out.fetchHandler=()=>Promise.resolve(new Response(JSON.stringify({ok:false,error:'unavailable'})));
  ctx.fetch=(url,opts)=>{out.fetches.push({url,opts});return out.fetchHandler(url,opts);};
  vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(home,ctx);
  const boot=main.indexOf("  if (document.readyState === 'loading')");assert.ok(boot>0);
  vm.runInContext(main.slice(0,boot)+`
    window.testDub={S,boot,restorePractice,checkpoint,startRun,stopRun,scoreOne,enqueueScore,saveCast,loadCast,wire,
      queue:()=>QUEUE,qbusy:()=>QBUSY};
    ensureMix=function(){};
    openMic=function(run){return window.hooks.mic(run);};
    playScene=function(run,sc){return window.hooks.scene(run,sc);};
    startMovie=function(){return window.hooks.movie();};
    sleep=function(){return Promise.resolve();};
    applySndPrefs=function(){};
    renderStatus=renderScenes=renderPickSum=renderMbar=renderWatchPanel=renderGenreMini=renderEpisodes=function(){};
    wireStatic=function(){};
    loadIndex=function(){return Promise.resolve([]);};
    loadEpisode=function(){return Promise.resolve();};
  })();`,ctx);
  out.ctx=ctx;out.el=el;out.data=data;out.lib=lib;out.d=ctx.testDub;
  out.d.S.ep=structuredClone(fixture);out.d.S.cast=[{name:'Alice',character:'mina'}];out.d.S.sel=0;
  data.set('mangoi_logged_user',JSON.stringify({uid:'alice',name:'Alice'}));
  el('dub-mode').value='practice';el('dub-make-movie').checked=true;
  out.changeOwner=(value,notify=true)=>{const old=out.owner;out.owner=value;data.set('mangoi_logged_user',JSON.stringify({uid:value.split(':')[1],name:value.split(':')[1]}));if(notify)listeners.forEach(fn=>fn(value,old));};
  out.boot=async()=>{out.d.boot();await tick();};
  return out;
}
const tests=[];const test=(name,fn)=>tests.push({name,fn});
const state=()=>({version:1,cast:[{name:'Alice',character:'mina'},{name:'Friend',character:'mina'}],sceneIdxs:[0,1,2],nextIndex:1,counters:{mina:1},mode:'presentation',korean:true,makeMovie:true,complete:false});

test('restore validates scene boundaries and resumes shared-role turn counters without opening a microphone',async()=>{
  const w=world();await w.boot();
  assert.equal(w.d.restorePractice(state()),true);
  assert.deepEqual(Array.from(w.d.S.resume.sceneIdxs),[1,2]);assert.equal(w.d.S.sel,1);
  const next=w.ctx.MangoiDubCore.assignLines(w.d.S.ep.scenes[1],w.d.S.cast,{...w.d.S.resume.counters});
  assert.equal(next[0].performer.idx,1,'The next classmate retains their turn across scene boundaries');
  assert.equal(w.el('dub-mode').value,'presentation');assert.equal(w.el('dub-korean').checked,true);
  assert.equal(w.micCount,0);assert.equal(w.d.S.run,null);assert.equal(w.el('dub-side').classList.contains('open'),true);
  const complete={...state(),complete:true,nextIndex:3};assert.equal(w.d.restorePractice(complete),true);
  assert.equal(w.d.S.resume.sceneIdxs[0],0);assert.deepEqual(Object.keys(w.d.S.resume.counters),[]);
  for(const patch of [{version:2},{sceneIdxs:[]},{sceneIdxs:[99]},{sceneIdxs:[0.5]},{nextIndex:-1},{nextIndex:3},{cast:[]},{cast:[{character:'missing'}]}]) {
    const before=JSON.stringify(w.d.S.resume);assert.equal(w.d.restorePractice({...state(),...patch}),false);assert.equal(JSON.stringify(w.d.S.resume),before);
  }
});

test('quick start selects an actual short scene and opens role setup; it never starts the microphone',async()=>{
  const w=world();await w.boot();assert.equal(w.micCount,0);
  await w.el('dub-quick-start').fire('click');
  assert.equal(w.d.S.sel,1);assert.equal(w.el('dub-mode').value,'practice');assert.equal(w.el('dub-side').classList.contains('open'),true);
  assert.equal(w.micCount,0);assert.equal(w.movieStarts,0);assert.equal(w.d.S.run,null);
});

test('checkpoints advance only after a completed scene and interrupted video bytes are kept',async()=>{
  const w=world();await w.boot();const entered=deferred();
  w.ctx.hooks.scene=(run,sc)=>{
    w.ctx.MangoiDubCore.assignLines(sc,w.d.S.cast,run.counters);
    if(sc.no===2)return new Promise(resolve=>{run.wakers.push(resolve);entered.resolve();});
    return Promise.resolve();
  };
  w.d.startRun([0,1,2]);await entered.promise;
  const last=w.drafts.at(-1).p.state;assert.equal(last.nextIndex,1);assert.equal(last.counters.mina,1);
  w.d.stopRun();await until(()=>!w.d.S.run);
  assert.equal(w.d.S.movies.length,1);assert.equal(w.d.S.movies[0].interrupted,true);
  assert.match(w.d.S.movies[0].title,/중간 녹음/);assert.equal(w.saved.length,1);assert.equal((await w.saved[0].blob.text()).length,3000);
  assert.equal(w.drafts.at(-1).p.state.nextIndex,1,'Stopping mid-scene resumes from that scene, not the following one');
});

test('a pending or failed AI score cannot hold up completed video persistence',async()=>{
  const w=world();await w.boot();const transcribe=deferred();w.fetchHandler=()=>transcribe.promise;let result;
  w.ctx.hooks.scene=(run,sc)=>{
    result={line:sc.lines[0],studentIdx:0,owner:run.owner,recorded:true,status:'queued'};
    w.d.S.results.push(result);w.d.enqueueScore(result,new Blob(['voice'],{type:'audio/webm'}));return Promise.resolve();
  };
  w.d.startRun([0]);await until(()=>!w.d.S.run);
  assert.equal(w.saved.length,1);assert.equal(w.d.qbusy(),true,'Video saving does not wait on the score request');
  transcribe.resolve(new Response(JSON.stringify({ok:false,error:'ai_unavailable'})));await until(()=>!w.d.qbusy());
  assert.equal(result.status,'error');assert.equal(w.saved.length,1);assert.equal(w.d.S.movies.length,1);
});

test('late scores from an older recording cannot re-enter the new recording’s results',async()=>{
  const w=world();await w.boot();const oldTranscribe=deferred();
  w.fetchHandler=url=>url.endsWith('transcribe')?oldTranscribe.promise:Promise.resolve(new Response(JSON.stringify({ok:true,scores:{overall:99}})));
  const old={line:fixture.scenes[0].lines[0],studentIdx:0,owner:w.owner,recorded:true,status:'queued'};
  w.d.S.results.push(old);w.d.enqueueScore(old,new Blob(['old'],{type:'audio/webm'}));await tick();
  const hold=deferred();w.ctx.hooks.scene=run=>{run.wakers.push(hold.resolve);return hold.promise;};
  w.d.startRun([0]);await tick();const fresh={line:fixture.scenes[1].lines[0],studentIdx:0,owner:w.owner,recorded:true,status:'done',score:{overall:85}};w.d.S.results.push(fresh);
  oldTranscribe.resolve(new Response(JSON.stringify({ok:true,text:'Can you help me?'})));await until(()=>!w.d.qbusy());
  assert.equal(old.score.overall,99);assert.equal(w.d.S.results.length,1);assert.equal(w.d.S.results[0],fresh);
  assert.equal(w.ctx.MangoiDubCore.summarize(w.d.S.results,w.d.S.cast)[0].avg,85);
  w.d.stopRun();await until(()=>!w.d.S.run);
});

test('role choices are scoped by account and episode, and legacy unscoped names are not imported',async()=>{
  const w=world();w.data.set('mangoi_dub_cast_v1',JSON.stringify([{name:'Other student',character:'jun'}]));await w.boot();
  assert.equal(w.d.S.cast[0].character,'mina');assert.notEqual(w.d.S.cast[0].name,'Other student');
  w.d.S.cast=[{name:'Alice role',character:'jun'}];w.d.saveCast();
  w.changeOwner('student:bob');assert.equal(w.d.S.cast[0].character,'mina');assert.notEqual(w.d.S.cast[0].name,'Alice role');
  w.changeOwner('student:alice');assert.equal(w.d.S.cast[0].name,'Alice role');assert.equal(w.d.S.cast[0].character,'jun');
  w.d.S.ep.id='another-film';w.d.loadCast();assert.equal(w.d.S.cast[0].character,'mina');
});

test('an account change stops old recording work and never uploads its movie or coach score as the new user',async()=>{
  const w=world();await w.boot();const transcribe=deferred(),entered=deferred();w.fetchHandler=()=>transcribe.promise;
  w.ctx.hooks.scene=(run,sc)=>{
    const r={line:sc.lines[0],studentIdx:0,owner:run.owner,recorded:true,status:'queued'};w.d.S.results.push(r);w.d.enqueueScore(r,new Blob(['alice'],{type:'audio/webm'}));
    return new Promise(resolve=>{run.wakers.push(resolve);entered.resolve();});
  };
  w.d.startRun([0]);await entered.promise;await tick();assert.equal(w.fetches.length,1);
  w.changeOwner('student:bob');transcribe.resolve(new Response(JSON.stringify({ok:true,text:'Alice voice'})));
  await until(()=>!w.d.S.run&&!w.d.qbusy());
  assert.equal(w.saved.length,0);assert.equal(w.d.S.movies.length,0);assert.equal(w.d.S.results.length,0);
  assert.equal(w.fetches.filter(c=>c.url.endsWith('/coach')).length,0);
  assert.ok(w.drafts.every(d=>d.owner==='student:alice'));
});

test('a stale local gallery retry cannot copy account A’s voice into account B',async()=>{
  const w=world();await w.boot();w.localMovies=[{id:'movie-a',meta:{engine:'main',episodeId:'fixture',title:'Alice film'},blob:new Blob(['alice-private']),createdAt:Date.now()}];
  w.ctx.MangoiDubHome.openLibrary('movies');await tick();
  const cards=w.el('dub-library-items').children;assert.equal(cards.length,1);
  const buttons=[];const walk=e=>{e.children.forEach(c=>{if(c.tagName==='button')buttons.push(c);walk(c);});};walk(cards[0]);
  const retry=buttons.find(b=>b.textContent==='내 계정에도 저장하기');assert.ok(retry);
  w.changeOwner('student:bob',false);await retry.fire('click');
  assert.equal(w.saved.length,0,'Check the captured gallery owner before calling saveMovie');
});

test('draft deletion removes a local-only fallback locally and keeps remote deletion for a cloud-backed draft',async()=>{
  for(const remote of [false,true]){
    const w=world();await w.boot();
    const draft={id:'practice-a',engine:'main',episodeId:'fixture',title:'Alice practice',state:state()};
    w.localDrafts=[{id:draft.id,draft,updatedAt:Date.now()}];
    if(remote)w.remoteDrafts=[{...draft,updatedAt:new Date(Date.now()-1000).toISOString()}];
    await w.ctx.MangoiDubHome.openLibrary('drafts');
    const cards=w.el('dub-library-items').children;assert.equal(cards.length,1);
    const buttons=[];const walk=e=>{e.children.forEach(c=>{if(c.tagName==='button')buttons.push(c);walk(c);});};walk(cards[0]);
    const remove=buttons.find(b=>b.textContent==='연습 기록 삭제');assert.ok(remove);
    await remove.fire('click');
    assert.deepEqual(w.deletedDrafts,[{id:draft.id,scope:remote?'remote':'local',owner:'student:alice'}]);
    w.changeOwner('student:bob',false);await remove.fire('click');
    assert.equal(w.deletedDrafts.length,1,'A stale account-A card cannot delete account-B practice');
  }
});

test('group names are captured per recording and preserved in movie, download and account metadata',async()=>{
  const w=world();await w.boot();const held=deferred(),entered=deferred();
  w.ctx.hooks.scene=()=>{entered.resolve();return held.promise;};
  w.el('dub-group-name').value='  무지개 모둠  ';w.d.startRun([0]);await entered.promise;
  assert.equal(w.d.S.run.groupName,'무지개 모둠');
  assert.equal(w.drafts.at(-1).p.state.groupName,'무지개 모둠');
  w.el('dub-group-name').value='다음 모둠';held.resolve();await until(()=>!w.d.S.run);
  assert.match(w.d.S.movies[0].title,/^무지개 모둠 · 에피소드 1/);
  assert.match(w.saved[0].meta.title,/^무지개 모둠 · /);
  assert.match(w.el('dub-movies').innerHTML,/download="mangoi-무지개_모둠_/);
  assert.ok(!w.el('dub-movies').innerHTML.includes('다음_모둠'));
  w.ctx.hooks.scene=()=>Promise.resolve();w.d.startRun([0]);await until(()=>!w.d.S.run);
  assert.match(w.d.S.movies[1].title,/^다음 모둠 · /);
  assert.match(w.d.S.movies[0].title,/^무지개 모둠 · /);
  assert.equal(w.d.restorePractice({...state(),groupName:'무지개 모둠'}),true);
  assert.equal(w.el('dub-group-name').value,'무지개 모둠');
  assert.equal(w.d.restorePractice(state()),true);assert.equal(w.el('dub-group-name').value,'');
});

test('gallery downloads use the saved title, and filenames remain safe and bounded',async()=>{
  const w=world();await w.boot();const filename=w.ctx.MangoiDubHome.movieFilename;
  assert.match(filename('1모둠 · 에피소드 1','video/webm'),/^mangoi-1모둠_에피소드_1\.webm$/);
  assert.match(filename('CON:/\\<>"|?*\u0000 · test.','video/mp4'),/^mangoi-.*\.mp4$/);
  assert.ok(!/[<>:"/\\|?*\u0000-\u001f]/.test(filename('CON:/\\<>"|?*\u0000','video/webm')));
  assert.ok(filename('가'.repeat(500),'video/webm').length<120);
  w.localMovies=[{id:'movie-1',meta:{engine:'main',episodeId:'fixture',title:'1모둠 · 에피소드 1'},blob:new Blob(['video'],{type:'video/webm'}),createdAt:Date.now()}];
  await w.ctx.MangoiDubHome.openLibrary('movies');const card=w.el('dub-library-items').children[0];
  const links=[];const walk=e=>{e.children.forEach(c=>{if(c.tagName==='a')links.push(c);walk(c);});};walk(card);
  assert.equal(links[0].download,'mangoi-1모둠_에피소드_1.webm');
});

test('blank group names remain optional and long names do not exceed account title limits',async()=>{
  const w=world();await w.boot();w.el('dub-group-name').value=' ';w.d.startRun([0]);await until(()=>!w.d.S.run);
  assert.match(w.d.S.movies[0].title,/^에피소드 1/);
  w.d.S.ep.title.ko='긴 제목'.repeat(40);w.d.S.ep.scenes[0].label.ko='긴 장면'.repeat(40);
  w.el('dub-group-name').value='가'.repeat(100);w.d.startRun([0]);await until(()=>!w.d.S.run);
  assert.ok(w.saved.at(-1).meta.title.length<=120);assert.ok(w.drafts.at(-1).p.title.length<=120);
  assert.equal(w.drafts.at(-1).p.state.groupName.length,30);
});

let failed=0;
for(const {name,fn}of tests){try{await fn();console.log('✅ '+name);}catch(e){failed++;console.error('❌ '+name+'\n   '+e.stack);}}
console.log(`\nDubbing resume/player: ${tests.length-failed} PASS / ${failed} FAIL`);
if(failed)process.exitCode=1;
