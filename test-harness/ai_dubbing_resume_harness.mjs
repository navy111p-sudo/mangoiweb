// Exercise the real main player and home integration. Media capture/playback and
// network boundaries are replaced; resume, finalization and score orchestration run.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
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
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
  addEventListener(k,f){const a=this.events.get(k)||[];a.push(f);this.events.set(k,a);}removeEventListener(k,f){this.events.set(k,(this.events.get(k)||[]).filter(x=>x!==f));}
  async fire(k,event={}){for(const f of this.events.get(k)||[])await f.call(this,{currentTarget:this,target:this,...event});}
  querySelectorAll(selector){const all=[];const walk=x=>{x.children.forEach(c=>{all.push(c);walk(c);});};walk(this);if(selector==='video')return all.filter(x=>x.tagName==='video');if(selector==='[data-library-view]')return all.filter(x=>x.attrs['data-library-view']);return[];}
  get isConnected(){return!!(this.root||this.parentNode?.isConnected);}get scrollHeight(){return this.children.length*100;}
  click(){this.clicks=(this.clicks||0)+1;}scrollIntoView(){}focus(){this.focused=true;}pause(){this.paused=true;}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;}
}
const fixture={id:'fixture',title:{ko:'모험',en:'Adventure'},status:'final',note:{ko:'',en:''},playable:['mina','jun'],characters:{mina:{emoji:'M',name:{ko:'미나',en:'Mina'}},jun:{emoji:'J',name:{ko:'준',en:'Jun'}}},scenes:[
  {no:1,label:{ko:'첫 장면',en:'First scene'},video:'/one.mp4',durationSec:60,lines:[{id:'a',speaker:'mina',en:'Can you help me?',ko:'도와줄래?'}]},
  {no:2,label:{ko:'짧은 장면',en:'Short scene'},video:'/two.mp4',durationSec:30,lines:[{id:'b',speaker:'mina',en:'Thank you!',ko:'고마워!'}]},
  {no:3,label:{ko:'마지막 장면',en:'Last scene'},video:'/three.mp4',durationSec:45,lines:[{id:'c',speaker:'jun',en:'Let us go!',ko:'가자!'}]},
]};
function world(sharedData){
  const els=new Map(),data=sharedData||new Map(),listeners=[],events=new Map();
  const el=id=>{if(!els.has(id)){const e=new El();e.id=id;e.root=true;els.set(id,e);}return els.get(id);};
  const out={owner:'student:alice',saved:[],drafts:[],fetches:[],revoked:[],micCount:0,movieStarts:0,localMovies:[],remoteDrafts:[],localDrafts:[],deletedDrafts:[]};
  const ctx={console,Blob,TextEncoder,FormData,Headers,Response,URLSearchParams,Promise,setTimeout,clearTimeout,setInterval,clearInterval,
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
  out.pagehide=()=>events.get('pagehide')?.();out.ctx=ctx;out.el=el;out.data=data;out.lib=lib;out.d=ctx.testDub;
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

test('group search filters the loaded library without requests and groups legacy named movies',async()=>{
  const w=world();await w.boot();let requests=0;w.lib.listMovies=async()=>{requests++;return{ok:true,movies:[]};};
  const titles=['1모둠 · 에피소드 1 · 첫 장면','1모둠 · Episode 2 · Scene','무지개 모둠 · 처음부터 끝까지','에피소드 3 · 마지막 장면'];
  w.localMovies=titles.map((title,i)=>({id:'m'+i,meta:{engine:'main',episodeId:'fixture',title},blob:new Blob(['video']),createdAt:Date.now()-i}));
  await w.ctx.MangoiDubHome.openLibrary('movies');assert.equal(w.el('dub-library-items').children.length,4);
  w.el('dub-library-search').value='  1모둠 ';await w.el('dub-library-search').fire('input');
  assert.equal(w.el('dub-library-items').children.length,2);assert.match(w.el('dub-library-status').textContent,/2 \/ 4/);assert.equal(requests,1);
  w.el('dub-library-layout').value='groups';await w.el('dub-library-layout').fire('change');
  assert.equal(w.el('dub-library-items').children.length,1);assert.match(w.el('dub-library-items').children[0].textContent,/1모둠 · 2개 영상/);
  w.el('dub-library-search').value='';await w.el('dub-library-search').fire('input');
  const groups=w.el('dub-library-items').children;assert.equal(groups.length,3);assert.match(groups.at(-1).textContent,/모둠 이름 없음/);
  w.el('dub-library-search').value='무지개'.normalize('NFD');await w.el('dub-library-search').fire('input');
  assert.equal(w.el('dub-library-items').children.length,1);assert.match(w.el('dub-library-items').textContent,/무지개 모둠/);
  w.el('dub-library-search').value='없는 모둠';await w.el('dub-library-search').fire('input');
  assert.match(w.el('dub-library-items').textContent,/찾은 영상이 없어요/);assert.equal(w.el('dub-library-empty').hidden,true);
  const clear=w.el('dub-library-items').children[0].children.find(x=>x.tagName==='button');await clear.fire('click');
  assert.equal(w.el('dub-library-search').value,'');assert.equal(w.el('dub-library-items').children.length,3);assert.equal(requests,1);
});

test('video filters never hide saved practice and account changes discard search data and late responses',async()=>{
  const w=world();await w.boot();w.el('dub-library-search').value='1모둠';w.el('dub-library-layout').value='groups';
  w.remoteDrafts=[{id:'p1',engine:'main',episodeId:'fixture',title:'연습',updatedAt:Date.now()}];
  await w.ctx.MangoiDubHome.openLibrary('drafts');assert.equal(w.el('dub-library-filters').hidden,true);assert.equal(w.el('dub-library-items').children.length,1);
  const pending=deferred();w.lib.listMovies=()=>pending.promise;
  const load=w.ctx.MangoiDubHome.openLibrary('movies');w.changeOwner('student:bob');
  pending.resolve({ok:true,movies:[{id:'private',engine:'main',title:'1모둠 · 에피소드 1',createdAt:Date.now()}]});await load;
  assert.equal(w.el('dub-library-search').value,'');await w.el('dub-library-search').fire('input');await w.el('dub-library-layout').fire('change');
  assert.equal(w.el('dub-library-items').children.length,0,'Neither a stale response nor filters can repaint the old account');
});

function descendants(el){return el.children.flatMap(c=>[c,...descendants(c)]);}
function bulkControls(w){const section=w.el('dub-library-items').children[0];return{section,start:descendants(section).find(e=>e.tagName==='button'&&e.textContent==='모두 내려받기 (ZIP)'),ready:descendants(section).find(e=>e.tagName==='a'&&e.textContent==='ZIP 다시 내려받기'),note:descendants(section).find(e=>e.className==='dub-save-note'&&e.attrs['aria-live']==='polite')};}
async function bulkWorld(){
  const w=world();await w.boot();w.archives=[];
  w.ctx.JSZip=class{constructor(){this.files=[];}file(name,blob){this.files.push({name,blob});}async generateAsync(options){w.archives.push({files:this.files,options});return new Blob(['zip'],{type:'application/zip'});}};
  w.lib.listMovies=async()=>({movies:[{id:'remote',title:'무지개 모둠 · 에피소드 1',mime:'video/mp4'}]});
  w.lib.getMovie=async()=>new Blob(['remote bytes'],{type:'video/mp4'});
  w.localMovies=[{id:'local',meta:{title:'무지개 모둠 · 에피소드 1'},blob:new Blob(['local bytes'],{type:'video/webm'})},{id:'other',meta:{title:'다른 모둠 · 에피소드 1'},blob:new Blob(['private'])}];
  w.el('dub-library-layout').value='groups';w.el('dub-library-search').value='무지개';await w.ctx.MangoiDubHome.openLibrary('movies');return w;
}
test('group ZIP includes only that group, local and remote bytes, unique names and a reusable download',async()=>{
  const w=await bulkWorld(),b=bulkControls(w);await b.start.fire('click');
  assert.equal(w.archives.length,1);const archive=w.archives[0];assert.equal(archive.files.length,2);
  assert.deepEqual(await Promise.all(archive.files.map(f=>f.blob.text())),['remote bytes','local bytes']);
  assert.equal(new Set(archive.files.map(f=>f.name)).size,2);assert.ok(archive.files.every(f=>f.name.includes('무지개_모둠')));
  assert.match(archive.files[0].name,/\.mp4$/);assert.match(archive.files[1].name,/\.webm$/);
  assert.equal(b.ready.download,'mangoi-무지개_모둠_더빙영상.zip');assert.equal(b.ready.clicks,1);assert.equal(b.ready.hidden,false);assert.equal(b.start.hidden,true);
  const url=b.ready.href;await w.el('dub-library-close').fire('click');assert.ok(w.revoked.includes(url));
});
test('group ZIP failures do not silently omit videos and allow a complete retry',async()=>{
  const w=await bulkWorld(),b=bulkControls(w);w.lib.getMovie=async()=>{throw new Error('network');};
  await b.start.fire('click');assert.equal(w.archives.length,0);assert.equal(b.ready.hidden,true);assert.equal(b.start.disabled,false);assert.match(b.note.textContent,/(?:완료|준비)하지 못했어요/);
  w.lib.getMovie=async()=>new Blob(['ok']);await b.start.fire('click');assert.equal(w.archives[0].files.length,2);
});
test('pending group downloads stop on account changes, filter redraws and closing the library',async()=>{
  for(const cancel of [w=>w.changeOwner('student:bob'),w=>w.el('dub-library-search').fire('input'),w=>w.el('dub-library-close').fire('click')]){
    const w=await bulkWorld(),b=bulkControls(w),held=deferred();w.lib.getMovie=()=>held.promise;
    const download=b.start.fire('click');await tick();await cancel(w);held.resolve(new Blob(['old account']));await download;
    assert.equal(w.archives.length,0);assert.equal(b.ready.clicks,undefined);assert.equal(b.ready.hidden,true);
  }
});
test('missing ZIP support and oversized collections explain how to recover',async()=>{
  const w=await bulkWorld(),b=bulkControls(w);w.ctx.JSZip=null;await b.start.fire('click');assert.match(b.note.textContent,/새로고침/);assert.equal(b.start.disabled,false);
  w.ctx.JSZip=class{file(){}generateAsync(){assert.fail('oversized ZIP must not be built');}};
  w.lib.getMovie=async()=>{const blob=new Blob(['x']);Object.defineProperty(blob,'size',{value:513*1024*1024});return blob;};
  await b.start.fire('click');assert.match(b.note.textContent,/파일 내려받기/);assert.equal(b.ready.hidden,true);
});

function selectedControls(w){const host=w.el('dub-library-bulk');return{start:descendants(host).find(e=>e.tagName==='button'&&e.textContent==='선택한 모둠 내려받기 (ZIP)'),ready:descendants(host).find(e=>e.tagName==='a'),note:descendants(host).find(e=>e.className==='dub-save-note'&&e.attrs['aria-live']==='polite')};}
async function selectGroup(w,name){const check=descendants(w.el('dub-library-items')).find(e=>e.tagName==='input'&&e.attrs['aria-label']===name+' 선택');assert.ok(check);check.checked=true;await check.fire('change');}
test('selected groups persist across searches and ZIP contains only their videos in separate named folders',async()=>{
  const w=await bulkWorld();assert.equal(selectedControls(w).start.disabled,true);
  await selectGroup(w,'무지개 모둠');assert.match(w.el('dub-library-bulk').textContent,/선택한 모둠 1개 · 영상 2개/);
  w.el('dub-library-search').value='다른';await w.el('dub-library-search').fire('input');
  assert.match(w.el('dub-library-bulk').textContent,/무지개 모둠/);await selectGroup(w,'다른 모둠');
  const b=selectedControls(w);assert.match(w.el('dub-library-bulk').textContent,/선택한 모둠 2개 · 영상 3개/);await b.start.fire('click');
  const files=w.archives[0].files;assert.equal(files.length,3);assert.equal(new Set(files.map(f=>f.name.split('/')[0])).size,2);
  assert.ok(files.every(f=>f.name.split('/').length===2));assert.ok(files.some(f=>f.name.includes('_무지개_모둠/')));assert.ok(files.some(f=>f.name.includes('_다른_모둠/')));
  assert.deepEqual((await Promise.all(files.map(f=>f.blob.text()))).sort(),['local bytes','private','remote bytes'].sort());
  assert.match(b.ready.download,/선택한_모둠_2개_더빙영상\.zip$/);assert.equal(b.ready.clicks,1);
});
test('select visible groups never adds hidden groups, and clear/refresh/account changes discard selection',async()=>{
  const w=await bulkWorld();const buttonByText=text=>descendants(w.el('dub-library-bulk')).find(e=>e.tagName==='button'&&e.textContent===text);
  await buttonByText('보이는 모둠 모두 선택').fire('click');assert.match(w.el('dub-library-bulk').textContent,/1개 · 영상 2개/);
  await buttonByText('선택 해제').fire('click');assert.equal(selectedControls(w).start.disabled,true);
  await selectGroup(w,'무지개 모둠');await w.ctx.MangoiDubHome.openLibrary('movies');assert.equal(selectedControls(w).start.disabled,true);
  await selectGroup(w,'무지개 모둠');w.changeOwner('student:bob');assert.equal(w.el('dub-library-bulk').hidden,true);assert.equal(w.el('dub-library-bulk').children.length,0);
  await w.ctx.MangoiDubHome.openLibrary('movies');assert.equal(selectedControls(w).start.disabled,true);
});
test('group folder names cannot traverse paths or merge after filename sanitization',async()=>{
  const w=await bulkWorld();w.lib.listMovies=async()=>({movies:[]});
  const groups=['A/B','A:B','../..','모둠 이름 없음',''];
  w.localMovies=groups.map((name,i)=>({id:'safe-'+i,meta:{title:(name?name+' · ':'')+'에피소드 1'},blob:new Blob([String(i)])}));
  w.el('dub-library-search').value='';await w.ctx.MangoiDubHome.openLibrary('movies');
  await descendants(w.el('dub-library-bulk')).find(e=>e.textContent==='보이는 모둠 모두 선택').fire('click');await selectedControls(w).start.fire('click');
  const files=w.archives[0].files,folders=files.map(f=>f.name.split('/')[0]);assert.equal(files.length,5);assert.equal(new Set(folders).size,5);
  for(const f of files){const parts=f.name.split('/');assert.equal(parts.length,2);assert.ok(parts.every(p=>p!=='.'&&p!=='..'&&!/[<>:"\\|?*]/.test(p)));}
});
test('changing selected groups cancels a pending multi-group ZIP and a failed group never yields a partial ZIP',async()=>{
  const w=await bulkWorld();w.el('dub-library-search').value='';await w.el('dub-library-search').fire('input');
  await descendants(w.el('dub-library-bulk')).find(e=>e.textContent==='보이는 모둠 모두 선택').fire('click');
  const held=deferred();w.lib.getMovie=()=>held.promise;let b=selectedControls(w);const job=b.start.fire('click');await tick();
  await descendants(w.el('dub-library-bulk')).find(e=>e.tagName==='button'&&e.textContent==='선택 해제').fire('click');held.resolve(new Blob(['late']));await job;
  assert.equal(w.archives.length,0);assert.equal(b.ready.clicks,undefined);
  await descendants(w.el('dub-library-bulk')).find(e=>e.textContent==='보이는 모둠 모두 선택').fire('click');w.lib.getMovie=async()=>{throw new Error('network');};
  b=selectedControls(w);await b.start.fire('click');assert.equal(w.archives.length,0);assert.equal(b.ready.hidden,true);assert.equal(b.start.disabled,false);
});

function sizedBlob(id,size){const blob=new Blob([id],{type:'video/mp4'});Object.defineProperty(blob,'size',{value:size});return blob;}
function partButton(w,n){return descendants(w.el('dub-library-bulk')).find(e=>e.tagName==='button'&&e.textContent.startsWith(n+'번 ZIP'));}
async function splitWorld(sizes=[200,200,200,100]){
  const w=await bulkWorld();w.requests=[];w.sizes=sizes.map(n=>n*1024*1024);
  w.localMovies=[];w.lib.listMovies=async()=>({movies:w.sizes.map((size,i)=>({id:'v'+i,title:(i<3?'1모둠':'2모둠')+' · 에피소드 1',size,mime:'video/mp4'}))});
  w.lib.getMovie=async id=>{w.requests.push(id);return sizedBlob(id,w.sizes[Number(id.slice(1))]);};
  w.el('dub-library-search').value='';await w.ctx.MangoiDubHome.openLibrary('movies');
  await descendants(w.el('dub-library-bulk')).find(e=>e.textContent==='보이는 모둠 모두 선택').fire('click');return w;
}
test('one click downloads ZIP parts in order, fetching only one part at a time and preserving folders',async()=>{
  const w=await splitWorld(),b=selectedControls(w),held=deferred(),get=w.lib.getMovie;
  w.ctx.setTimeout=(fn,ms,...args)=>ms===250?setImmediate(fn):setTimeout(fn,ms,...args);
  w.lib.getMovie=async id=>{if(id==='v2'){w.requests.push(id);return held.promise;}return get(id);};
  const job=b.start.fire('click');await until(()=>w.requests.includes('v2'));
  assert.equal(w.archives.length,1);assert.deepEqual(w.requests,['v0','v1','v2']);
  assert.equal(partButton(w,1).disabled,true);assert.equal(partButton(w,2).disabled,true);
  const firstUrl=w.revoked.at(-1);assert.ok(firstUrl,'Previous ZIP URL is released before fetching the next part');
  held.resolve(sizedBlob('v2',w.sizes[2]));await job;
  assert.equal(w.archives.length,2);assert.equal(b.ready.clicks,2);assert.match(b.ready.download,/-part-002\.zip$/);
  assert.ok(w.revoked.includes(firstUrl));assert.equal(partButton(w,2).disabled,false);
  const files=w.archives.flatMap(a=>a.files);assert.equal(files.length,4);assert.equal(new Set(files.map(f=>f.name)).size,4);
  assert.deepEqual(await Promise.all(files.map(f=>f.blob.text())),['v0','v1','v2','v3']);
  assert.ok(files.slice(0,3).every(f=>f.name.startsWith('001_1모둠/')));assert.ok(files[3].name.startsWith('002_2모둠/'));
  assert.ok(files[2].name.includes('/003_'),'Ordinals continue across ZIP boundaries');
  for(const a of w.archives)assert.ok(a.files.reduce((sum,f)=>sum+f.blob.size,0)<512*1024*1024);
  assert.match(b.note.textContent,/다운로드를 순서대로 요청/);assert.match(b.note.textContent,/차단되거나 빠진 ZIP/);
});

test('ZIP planning accounts for header overhead at the 512MiB boundary',async()=>{
  const w=await splitWorld([256,256]);await selectedControls(w).start.fire('click');
  assert.equal(w.archives.length,2);assert.equal(w.archives[0].files.length,1);assert.ok(partButton(w,2),'Two 256MiB files require two ZIPs once headers are counted');
  assert.equal(w.archives[1].files.length,1);
});
test('a failed later ZIP retries only that part and old part buttons cannot fetch after an account change',async()=>{
  const w=await splitWorld(),b=selectedControls(w),get=w.lib.getMovie;
  w.lib.getMovie=async id=>{if(id==='v2')throw new Error('offline');return get(id);};await b.start.fire('click');
  assert.equal(w.archives.length,1);assert.match(b.note.textContent,/2 \/ 2번 ZIP을 완료하지 못/);
  w.lib.getMovie=get;const before=w.requests.length;await partButton(w,2).fire('click');assert.equal(w.archives.length,2);assert.deepEqual(w.requests.slice(before),['v2','v3']);
  const stale=partButton(w,1);w.changeOwner('student:bob');const count=w.requests.length;await stale.fire('click');assert.equal(w.requests.length,count);
});
test('a split single-group download also keeps its group folder, and changed size metadata cannot overflow a ZIP',async()=>{
  const w=await splitWorld([200,200,200]);const b=bulkControls(w);await b.start.fire('click');assert.ok(w.archives[0].files.every(f=>f.name.startsWith('001_1모둠/')));
  const x=await splitWorld([100]);x.lib.getMovie=async()=>sizedBlob('changed',101*1024*1024);await selectedControls(x).start.fire('click');assert.equal(x.archives.length,0);assert.match(selectedControls(x).note.textContent,/새로고침/);
});

test('a browser-blocked request leaves numbered buttons usable and retry rebuilds only the missing ZIP',async()=>{
  const w=await splitWorld(),b=selectedControls(w),attempts=[],received=[];
  b.ready.click=function(){attempts.push(this.download);if(attempts.length!==2)received.push(this.download);};
  await b.start.fire('click');assert.equal(attempts.length,2);assert.equal(received.length,1);
  assert.match(b.note.textContent,/브라우저.*허용/);assert.equal(partButton(w,2).disabled,false);
  const count=w.requests.length;await partButton(w,2).fire('click');assert.equal(received.length,2);
  assert.deepEqual(w.requests.slice(count),['v2','v3']);assert.match(received.at(-1),/-part-002\.zip$/);
});
test('account, selection and close changes stop the queue between ZIPs',async()=>{
  for(const cancel of [w=>w.changeOwner('student:bob'),w=>w.el('dub-library-search').fire('input'),w=>w.el('dub-library-close').fire('click')]){
    const w=await splitWorld(),held=deferred();let waiting=false;
    w.ctx.setTimeout=(fn,ms,...args)=>ms===250?(waiting=true,held.promise.then(fn),1):setTimeout(fn,ms,...args);
    const b=selectedControls(w),job=b.start.fire('click');await until(()=>waiting);assert.equal(w.archives.length,1);
    await cancel(w);held.resolve();await job;assert.equal(w.archives.length,1);assert.deepEqual(w.requests,['v0','v1']);
  }
});
test('a later ZIP failure stops the queue and Download all remains usable for a new attempt',async()=>{
  const w=await splitWorld([300,300,300]),get=w.lib.getMovie;
  w.lib.getMovie=async id=>{if(id==='v1')throw new Error('offline');return get(id);};
  await selectedControls(w).start.fire('click');assert.equal(w.archives.length,1);assert.deepEqual(w.requests,['v0']);
  assert.equal(partButton(w,3).disabled,false);
  const all=descendants(w.el('dub-library-bulk')).find(e=>e.tagName==='button'&&e.textContent==='모두 내려받기');assert.ok(all);assert.equal(all.disabled,false);
  w.lib.getMovie=get;await all.fire('click');assert.equal(w.archives.length,4);
});

function progressControls(w){const all=descendants(w.el('dub-library-bulk'));return{stop:all.find(e=>e.tagName==='button'&&e.textContent==='중단'),resume:all.find(e=>e.tagName==='button'&&e.textContent==='남은 ZIP 이어받기'),meter:all.find(e=>e.tagName==='progress'),summary:all.find(e=>e.className==='dub-zip-summary')};}
test('pause between ZIPs shows request progress and resume fetches only the unrequested ZIPs',async()=>{
  const w=await splitWorld([300,300,300]),held=deferred();let waiting=false;
  w.ctx.setTimeout=(fn,ms,...args)=>ms===250?(waiting=true,held.promise.then(fn),1):setTimeout(fn,ms,...args);
  const b=selectedControls(w),job=b.start.fire('click');await until(()=>waiting);
  let p=progressControls(w);assert.equal(p.meter.max,3);assert.equal(p.meter.value,1);await p.stop.fire('click');assert.match(p.summary.textContent,/중단 중/);assert.equal(p.resume.disabled,true);
  held.resolve();await job;assert.match(p.summary.textContent,/중단됨/);assert.equal(p.resume.disabled,false);assert.equal(p.resume.hidden,false);assert.deepEqual(w.requests,['v0']);
  w.ctx.setTimeout=setTimeout;await p.resume.fire('click');
  assert.deepEqual(w.requests,['v0','v1','v2']);assert.equal(w.archives.length,3);assert.equal(p.meter.value,3);assert.equal(p.resume.hidden,true);assert.match(p.summary.textContent,/모든 ZIP 다운로드 요청됨/);
});
test('pause during a ZIP fetch prevents a late download and resume restarts just the unfinished part',async()=>{
  const w=await splitWorld([300,300,300]),held=deferred(),entered=deferred(),get=w.lib.getMovie;
  w.lib.getMovie=async id=>{if(id==='v1'){w.requests.push(id);entered.resolve();return held.promise;}return get(id);};
  const b=selectedControls(w),job=b.start.fire('click');await entered.promise;
  const p=progressControls(w);assert.match(p.summary.textContent,/전체 3개 중 2번째 ZIP/);assert.equal(p.meter.value,1);
  await p.stop.fire('click');assert.equal(p.resume.disabled,true);held.resolve(sizedBlob('v1',w.sizes[1]));await job;
  assert.equal(w.archives.length,1);assert.equal(b.ready.clicks,1);assert.equal(p.resume.disabled,false);
  w.lib.getMovie=get;await p.resume.fire('click');assert.deepEqual(w.requests,['v0','v1','v1','v2']);assert.equal(b.ready.clicks,3);assert.equal(p.meter.value,3);
});
test('a paused ZIP generation cannot request a download after finishing, and remains resumable',async()=>{
  const w=await splitWorld([300,300]),held=deferred(),entered=deferred(),Base=w.ctx.JSZip;let builds=0;
  w.ctx.JSZip=class extends Base{async generateAsync(options){builds++;if(builds===2){entered.resolve();await held.promise;}return super.generateAsync(options);}};
  const b=selectedControls(w),job=b.start.fire('click');await entered.promise;const p=progressControls(w);await p.stop.fire('click');held.resolve();await job;
  assert.equal(b.ready.clicks,1);assert.equal(p.meter.value,1);await p.resume.fire('click');assert.equal(b.ready.clicks,2);assert.equal(p.meter.value,2);
});
test('resume after a middle failure skips both earlier requests and a manually requested later ZIP',async()=>{
  const w=await splitWorld([300,300,300]),get=w.lib.getMovie;
  w.lib.getMovie=async id=>{if(id==='v1')throw new Error('offline');return get(id);};await selectedControls(w).start.fire('click');
  const p=progressControls(w);assert.equal(p.resume.hidden,false);assert.equal(p.meter.value,1);
  await partButton(w,3).fire('click');assert.equal(p.meter.value,2);
  const count=w.requests.length;w.lib.getMovie=get;await p.resume.fire('click');assert.deepEqual(w.requests.slice(count),['v1']);assert.equal(p.meter.value,3);
  const before=p.meter.value;await partButton(w,1).fire('click');assert.equal(p.meter.value,before,'A retry never counts twice');
});
test('paused resume buttons cannot fetch another account’s videos or survive closing the library',async()=>{
  for(const cancel of [w=>w.changeOwner('student:bob'),w=>w.el('dub-library-close').fire('click')]){
    const w=await splitWorld([300,300]),held=deferred();let waiting=false;w.ctx.setTimeout=(fn,ms,...args)=>ms===250?(waiting=true,held.promise.then(fn),1):setTimeout(fn,ms,...args);
    const job=selectedControls(w).start.fire('click');await until(()=>waiting);const p=progressControls(w);await p.stop.fire('click');held.resolve();await job;
    await cancel(w);const before=w.requests.length;await p.resume.fire('click');assert.equal(w.requests.length,before);
  }
});

const historyPrefix='mangoi_dub_downloads_v1:';
const historyKey=w=>[...w.data.keys()].find(k=>k.startsWith(historyPrefix));
const storedJobs=w=>JSON.parse(w.data.get(historyKey(w))||'[]');
function historyControls(w){const all=descendants(w.el('dub-library-downloads'));return{resume:all.find(e=>e.tagName==='button'&&e.textContent==='남은 ZIP 이어받기'),meter:all.find(e=>e.tagName==='progress'),summary:all.find(e=>e.className==='dub-zip-summary')};}
async function checkpointWorld(){
  const w=await splitWorld([300,300,300]),held=deferred();let waiting=false;
  w.ctx.setTimeout=(fn,ms,...args)=>ms===250?(waiting=true,held.promise.then(fn),1):setTimeout(fn,ms,...args);
  const job=selectedControls(w).start.fire('click');await until(()=>waiting);w.pagehide();held.resolve();await job;return w;
}
async function restoredWorld(w,mutate,owner='student:alice'){
  const x=world(w.data);await x.boot();x.changeOwner(owner);x.sizes=w.sizes;x.requests=[];x.archives=[];x.localMovies=w.localMovies;
  x.ctx.JSZip=class{constructor(){this.files=[];}file(name,blob){this.files.push({name,blob});}async generateAsync(options){x.archives.push({files:this.files,options});return new Blob(['zip'],{type:'application/zip'});}};
  x.lib.listMovies=w.lib.listMovies;x.lib.getMovie=async id=>{x.requests.push(id);return sizedBlob(id,w.sizes[Number(id.slice(1))]);};
  if(mutate)mutate(x);await x.ctx.MangoiDubHome.openLibrary('movies');return x;
}
test('refresh restores metadata-only progress and resumes remaining ZIPs without automatically downloading on open',async()=>{
  const w=await checkpointWorld(),jobs=storedJobs(w);assert.equal(jobs.length,1);assert.deepEqual(jobs[0].requested,[0]);assert.equal(jobs[0].parts.length,3);
  assert.ok(!w.data.get(historyKey(w)).includes('blob:'));assert.ok(!w.data.get(historyKey(w)).includes('remote bytes'));
  const x=await restoredWorld(w),p=historyControls(x);assert.ok(p.resume);assert.equal(p.meter.value,1);assert.equal(p.meter.max,3);assert.equal(x.requests.length,0);assert.equal(x.archives.length,0);
  await p.resume.fire('click');assert.deepEqual(x.requests,['v1','v2']);assert.equal(x.archives.length,2);assert.deepEqual(storedJobs(x)[0].requested,[0,1,2]);
  assert.equal(x.archives[0].files[0].name,jobs[0].parts[1][0].path);assert.equal(x.archives[1].files[0].name,jobs[0].parts[2][0].path);
});
test('closing and reopening the library retains progress, and account B cannot see or use account A’s resume controls',async()=>{
  const w=await checkpointWorld(),x=await restoredWorld(w);await x.el('dub-library-close').fire('click');await x.ctx.MangoiDubHome.openLibrary('movies');assert.equal(historyControls(x).meter.value,1);
  const stale=historyControls(x).resume;x.changeOwner('student:bob');await x.ctx.MangoiDubHome.openLibrary('movies');assert.equal(x.el('dub-library-downloads').hidden,true);assert.equal(historyControls(x).resume,undefined);
  await stale.fire('click');assert.equal(x.requests.length,0);x.changeOwner('student:alice');await x.ctx.MangoiDubHome.openLibrary('movies');assert.equal(historyControls(x).meter.value,1);
});
test('added videos do not change the saved selection, ZIP boundaries or filenames',async()=>{
  const w=await checkpointWorld(),saved=storedJobs(w)[0];
  const x=await restoredWorld(w,x=>{const list=x.lib.listMovies;x.lib.listMovies=async()=>{const result=await list();result.movies.unshift({id:'new-video',title:'1모둠 · 에피소드 1',size:100,mime:'video/mp4'});return result;};});
  await historyControls(x).resume.fire('click');assert.deepEqual(x.requests,['v1','v2']);assert.equal(x.archives[0].files[0].name,saved.parts[1][0].path);
});
test('missing, renamed or resized originals keep their progress record but cannot silently resume',async()=>{
  const w=await checkpointWorld();
  for(const change of [movies=>movies.shift(),movies=>movies[0].title='바뀐 영상',movies=>movies[0].size++]){
    const x=await restoredWorld(w,x=>{const list=x.lib.listMovies;x.lib.listMovies=async()=>{const result=await list();change(result.movies);return result;};});
    assert.equal(historyControls(x).resume,undefined);assert.match(x.el('dub-library-downloads').textContent,/이 기기에서 보이지 않거나 변경/);assert.equal(x.requests.length,0);assert.equal(storedJobs(x).length,1);
  }
});
test('corrupt or traversal-shaped progress is never converted to a ZIP or fetched',async()=>{
  const w=await checkpointWorld(),key=historyKey(w),original=w.data.get(key);
  const bad=JSON.parse(original);bad[0].parts[0][0].path='../evil.mp4';w.data.set(key,JSON.stringify(bad));let x=await restoredWorld(w);assert.equal(historyControls(x).resume,undefined);assert.match(x.el('dub-library-downloads').textContent,/형식이 맞지/);assert.equal(x.requests.length,0);
  w.data.set(key,'{broken');x=await restoredWorld(w);assert.equal(historyControls(x).resume,undefined);assert.match(x.el('dub-library-downloads').textContent,/읽지 못/);assert.equal(x.requests.length,0);
});
test('blocked browser storage warns accurately while the current download still works',async()=>{
  const w=await splitWorld([100]);const set=w.ctx.localStorage.setItem;w.ctx.localStorage.setItem=(k,v)=>{if(k.startsWith(historyPrefix))throw new Error('quota');set(k,v);};
  await selectedControls(w).start.fire('click');assert.equal(w.archives.length,1);assert.equal(historyKey(w),undefined);
  assert.match(w.el('dub-library-bulk').textContent,/진행 상황을 저장하지 못/);assert.ok(!w.el('dub-library-bulk').textContent.includes('화면을 닫거나 새로고침해도'));
});
test('removing a download progress record never removes saved movies',async()=>{
  const w=await checkpointWorld(),x=await restoredWorld(w);let deleted=0;x.lib.deleteMovie=async()=>deleted++;x.lib.removeLocalMovie=async()=>deleted++;
  const remove=descendants(x.el('dub-library-downloads')).find(e=>e.tagName==='button'&&e.textContent==='다운로드 진행 기록 삭제');await remove.fire('click');assert.equal(storedJobs(x).length,0);assert.equal(deleted,0);assert.equal(x.el('dub-library-downloads').hidden,true);
});

function cloudFixture(w, store) {
  const account=()=>{if(!store.has(w.owner))store.set(w.owner,{jobs:new Map(),removed:new Set()});return store.get(w.owner);};
  w.lib.listDownloads=async()=>({downloads:structuredClone([...account().jobs.values()]),removed:[...account().removed]});
  w.lib.saveDownload=async(job,owner)=>{
    assert.equal(owner,w.owner);const a=account();if(a.removed.has(job.id))throw Object.assign(new Error('deleted'),{code:'download_deleted'});
    const old=a.jobs.get(job.id);const next=structuredClone(job);
    if(old)next.requested=[...new Set([...old.requested,...job.requested])].sort();
    a.jobs.set(job.id,next);return{download:structuredClone(next)};
  };
  w.lib.deleteDownload=async id=>{const a=account();a.jobs.delete(id);a.removed.add(id);return{};};
}
async function cloudCheckpoint(){const w=await checkpointWorld(),store=new Map();cloudFixture(w,store);await w.ctx.MangoiDubHome.openLibrary('movies');return{w,store};}
test('a separate browser with empty localStorage restores account progress and requests only remaining ZIPs',async()=>{
  const {w,store}=await cloudCheckpoint();const other={...w,data:new Map()};
  const x=await restoredWorld(other,x=>cloudFixture(x,store));assert.equal(historyControls(x).meter.value,1);assert.equal(x.requests.length,0);
  assert.match(x.el('dub-library-downloads').textContent,/계정에 동기화됨/);
  await historyControls(x).resume.fire('click');assert.deepEqual(x.requests,['v1','v2']);assert.equal(historyControls(x).meter.value,3);
  assert.deepEqual([...store.get(w.owner).jobs.values()][0].requested,[0,1,2]);
  assert.ok(x.data!==w.data);assert.match(x.el('dub-library-downloads').textContent,/다른 컴퓨터·브라우저/);
});
test('resume checks another device’s newer requests before starting and never rewinds account progress',async()=>{
  const {w,store}=await cloudCheckpoint(),x=await restoredWorld({...w,data:new Map()},x=>cloudFixture(x,store));
  const saved=[...store.get(w.owner).jobs.values()][0];saved.requested=[0,1];
  await historyControls(x).resume.fire('click');assert.deepEqual(x.requests,['v2']);assert.deepEqual(saved.parts,storedJobs(x)[0].parts);
});
test('cloud progress is separated by account even with a fresh browser',async()=>{
  const {w,store}=await cloudCheckpoint();const x=await restoredWorld({...w,data:new Map()},x=>cloudFixture(x,store),'student:bob');
  assert.equal(x.el('dub-library-downloads').hidden,true);assert.equal(x.requests.length,0);
});
test('an offline local outbox merges after reconnection and cloud failure is visible',async()=>{
  const w=await checkpointWorld(),store=new Map();cloudFixture(w,store);const save=w.lib.saveDownload;
  w.lib.saveDownload=async()=>{throw new Error('offline');};await w.ctx.MangoiDubHome.openLibrary('movies');
  assert.match(w.el('dub-library-downloads').textContent,/동기화하지 못/);assert.equal(store.get(w.owner).jobs.size,0);
  w.lib.saveDownload=save;await w.ctx.MangoiDubHome.openLibrary('movies');assert.equal(store.get(w.owner).jobs.size,1);
  const x=await restoredWorld({...w,data:new Map()},x=>cloudFixture(x,store));assert.equal(historyControls(x).meter.value,1);
});
test('deletion on another device removes stale local history and cannot recreate it',async()=>{
  const {w,store}=await cloudCheckpoint(),a=store.get(w.owner),id=[...a.jobs.keys()][0];a.jobs.delete(id);a.removed.add(id);
  await w.ctx.MangoiDubHome.openLibrary('movies');assert.equal(w.el('dub-library-downloads').hidden,true);assert.equal(storedJobs(w).length,0);assert.equal(a.jobs.size,0);
});
test('missing device-only originals show account upload guidance and never fetch a partial ZIP',async()=>{
  const {w,store}=await cloudCheckpoint();const x=await restoredWorld({...w,data:new Map()},x=>{cloudFixture(x,store);x.lib.listMovies=async()=>({movies:[]});});
  assert.match(x.el('dub-library-downloads').textContent,/내 계정에도 저장하기/);assert.equal(historyControls(x).resume,undefined);assert.equal(x.requests.length,0);
});
test('a promoted local original retains immutable manifest timestamps while resuming from another device',async()=>{
  const {w,store}=await cloudCheckpoint();const saved=[...store.get(w.owner).jobs.values()][0];saved.parts.forEach(part=>part.forEach(e=>{e.deviceOnly=true;e.createdAt='123';}));
  const x=await restoredWorld({...w,data:new Map()},x=>{cloudFixture(x,store);const list=x.lib.listMovies;x.lib.listMovies=async()=>({movies:(await list()).movies.map(m=>({...m,createdAt:456}))});});
  await historyControls(x).resume.fire('click');assert.deepEqual(x.requests,['v1','v2']);
  assert.ok([...store.get(w.owner).jobs.values()][0].parts.every(p=>p.every(e=>e.createdAt==='123'&&e.deviceOnly)));
});
test('failed latest-progress lookup prevents accidental duplicate resume and can be retried',async()=>{
  const {w,store}=await cloudCheckpoint(),x=await restoredWorld({...w,data:new Map()},x=>cloudFixture(x,store));
  const list=x.lib.listDownloads;x.lib.listDownloads=async()=>{throw new Error('offline');};await historyControls(x).resume.fire('click');assert.equal(x.requests.length,0);
  assert.match(x.el('dub-library-downloads').textContent,/최신 진행 상황을 확인하지 못/);x.lib.listDownloads=list;
  await historyControls(x).resume.fire('click');assert.deepEqual(x.requests,['v1','v2']);
});

function uploadControls(w){const all=descendants(w.el('dub-library-upload')),find=t=>all.find(e=>e.tagName==='button'&&e.textContent===t);return{start:find('선택한 영상 계정에 저장'),select:find('보이는 기기 영상 모두 선택'),clear:find('영상 선택 해제'),stop:find('저장 중단'),meter:all.find(e=>e.tagName==='progress')};}
async function uploadWorld(){
  const w=world();await w.boot();w.uploadCalls=[];w.cloudMovies=[{id:'cloud',title:'무지개 모둠 · 에피소드 9',engine:'main',episodeId:'fixture',createdAt:100}];
  w.localMovies=[0,1,2].map(i=>({id:'device-'+i,createdAt:123,blob:new Blob(['voice-'+i],{type:'video/webm'}),meta:{title:(i<2?'무지개 모둠':'다른 모둠')+' · 에피소드 '+(i+1),engine:i===1?'studio':'main',episodeId:'fixture',interrupted:i===1,durationMs:1234}}));
  w.lib.listMovies=async()=>({movies:w.cloudMovies.slice()});
  w.lib.saveMovie=async(blob,meta)=>{w.uploadCalls.push({owner:w.owner,blob,meta:structuredClone(meta)});const movie={...meta,id:meta.clientId,mime:blob.type,size:blob.size,createdAt:456};w.cloudMovies.push(movie);w.localMovies=w.localMovies.filter(m=>m.id!==meta.clientId);return{ok:true,movie};};
  await w.ctx.MangoiDubHome.openLibrary('movies');return w;
}
test('bulk account save preserves selections across search/group views and uploads only selected device videos sequentially',async()=>{
  const w=await uploadWorld();assert.equal(uploadControls(w).start.disabled,true);
  w.el('dub-library-search').value='무지개';await w.el('dub-library-search').fire('input');await uploadControls(w).select.fire('click');
  assert.match(w.el('dub-library-upload').textContent,/선택한 영상 2개/);
  w.el('dub-library-search').value='다른';await w.el('dub-library-search').fire('input');await uploadControls(w).select.fire('click');
  w.el('dub-library-layout').value='groups';await w.el('dub-library-layout').fire('change');assert.match(w.el('dub-library-upload').textContent,/선택한 영상 3개/);
  const held=deferred(),save=w.lib.saveMovie,entered=[];w.lib.saveMovie=async(b,m)=>{entered.push(m.clientId);if(entered.length===1)await held.promise;return save(b,m);};
  const job=uploadControls(w).start.fire('click');await until(()=>entered.length===1);
  assert.equal(uploadControls(w).start.disabled,true);assert.equal(uploadControls(w).select.disabled,true);assert.deepEqual(entered,['device-0']);
  held.resolve();await job;assert.deepEqual(entered,['device-0','device-1','device-2']);assert.equal(w.localMovies.length,0);
  assert.equal(w.uploadCalls.length,3);assert.ok(w.uploadCalls.every(c=>c.owner==='student:alice'));
  const studio=w.uploadCalls[1];assert.equal(studio.meta.engine,'studio');assert.equal(studio.meta.interrupted,true);assert.equal(studio.meta.durationMs,1234);assert.equal(studio.meta.title,'무지개 모둠 · 에피소드 2');assert.equal(await studio.blob.text(),'voice-1');
  assert.match(w.el('dub-library-upload').textContent,/저장 3개 · 실패 0개 · 남은 0개/);assert.equal(uploadControls(w).meter.value,3);
  assert.equal(descendants(w.el('dub-library-items')).filter(e=>e.tagName==='input'&&e.attrs['aria-label']?.startsWith('계정에 저장할')).length,0);
  await w.ctx.MangoiDubHome.openLibrary('movies');assert.match(w.el('dub-library-upload').textContent,/3 \/ 3개 저장/);assert.equal(w.cloudMovies.length,4);
});
test('individual device checkboxes and clear selection never select cloud videos',async()=>{
  const w=await uploadWorld();const checks=()=>descendants(w.el('dub-library-items')).filter(e=>e.tagName==='input'&&e.attrs['aria-label']?.startsWith('계정에 저장할'));
  assert.equal(checks().length,3);const check=checks()[1];check.checked=true;await check.fire('change');assert.match(w.el('dub-library-upload').textContent,/선택한 영상 1개/);
  await uploadControls(w).clear.fire('click');assert.equal(uploadControls(w).start.disabled,true);assert.ok(checks().every(c=>!c.checked));
  checks()[1].checked=true;await checks()[1].fire('change');await uploadControls(w).start.fire('click');assert.deepEqual(w.uploadCalls.map(c=>c.meta.clientId),['device-1']);
});
test('partial save failures retain originals and selections, and retry does not re-upload successes',async()=>{
  const w=await uploadWorld(),save=w.lib.saveMovie,attempts=[];let fail=true;
  w.lib.saveMovie=async(b,m)=>{attempts.push(m.clientId);if(m.clientId==='device-1'&&fail)throw Object.assign(new Error('invalid'),{code:'invalid_metadata'});return save(b,m);};
  await uploadControls(w).select.fire('click');await uploadControls(w).start.fire('click');assert.match(w.el('dub-library-upload').textContent,/저장 2개 · 실패 1개 · 남은 1개/);
  assert.match(w.el('dub-library-upload').textContent,/저장 실패 · 무지개 모둠 · 에피소드 2/);assert.equal(w.localMovies.length,1);assert.equal(await w.localMovies[0].blob.text(),'voice-1');assert.match(w.el('dub-library-upload').textContent,/선택한 영상 1개/);
  fail=false;await uploadControls(w).start.fire('click');assert.deepEqual(attempts,['device-0','device-1','device-2','device-1']);assert.equal(w.localMovies.length,0);assert.equal(w.cloudMovies.length,4);
});
test('network/account quota failures stop the queue while failed and unattempted videos stay selected',async()=>{
  for(const error of [{code:'network'},{code:'movie_count_limit',status:409}]){
    const w=await uploadWorld(),save=w.lib.saveMovie,attempts=[];w.lib.saveMovie=async(b,m)=>{attempts.push(m.clientId);if(m.clientId==='device-1')throw error;return save(b,m);};
    await uploadControls(w).select.fire('click');await uploadControls(w).start.fire('click');assert.deepEqual(attempts,['device-0','device-1']);assert.equal(w.localMovies.length,2);
    assert.match(w.el('dub-library-upload').textContent,/저장 1개 · 실패 1개 · 남은 2개/);assert.match(w.el('dub-library-upload').textContent,/선택한 영상 2개/);
    w.lib.saveMovie=save;await uploadControls(w).start.fire('click');assert.equal(w.cloudMovies.length,4);
  }
});
test('pause settles the current upload, keeps remaining originals, and retries only remaining selections',async()=>{
  const w=await uploadWorld(),save=w.lib.saveMovie,held=deferred();let entered=false;w.lib.saveMovie=async(b,m)=>{entered=true;await held.promise;return save(b,m);};
  await uploadControls(w).select.fire('click');const job=uploadControls(w).start.fire('click');await until(()=>entered);await uploadControls(w).stop.fire('click');held.resolve();await job;
  assert.equal(w.uploadCalls.length,1);assert.equal(w.localMovies.length,2);assert.match(w.el('dub-library-upload').textContent,/저장을 중단/);assert.match(w.el('dub-library-upload').textContent,/선택한 영상 2개/);
  w.lib.saveMovie=save;await uploadControls(w).start.fire('click');assert.equal(w.uploadCalls.length,3);
});
test('account changes, close, refresh and pagehide prevent the next video upload and stale selection controls cannot restart it',async()=>{
  for(const [mode,cancel] of [['account',w=>w.changeOwner('student:bob')],['close',w=>w.el('dub-library-close').fire('click')],['refresh',w=>w.ctx.MangoiDubHome.openLibrary('movies')],['pagehide',w=>w.pagehide()]]){
    const w=await uploadWorld(),held=deferred(),calls=[];w.lib.saveMovie=async(b,m)=>{calls.push({owner:w.owner,id:m.clientId});await held.promise;return{movie:{...m,id:m.clientId}};};
    await uploadControls(w).select.fire('click');const stale=uploadControls(w).start,job=stale.fire('click');await until(()=>calls.length===1);await cancel(w);held.resolve();await job;
    assert.equal(calls.length,1);assert.equal(calls[0].owner,'student:alice');assert.equal(w.localMovies.length,3);
    // The stale start from a closed/refreshed/account-switched view cannot upload.
    if(mode!=='pagehide'){await stale.fire('click');assert.equal(calls.length,1);}
  }
});
test('guest device selection explains sign-in and cannot send an account save',async()=>{
  const w=await uploadWorld();w.changeOwner('guest');await w.ctx.MangoiDubHome.openLibrary('movies');await uploadControls(w).select.fire('click');assert.equal(uploadControls(w).start.disabled,true);assert.match(w.el('dub-library-upload').textContent,/먼저 로그인/);
  await uploadControls(w).start.fire('click');assert.equal(w.uploadCalls.length,0);
});
test('active uploads cannot be duplicated by double clicks, single-save buttons, or ZIP controls',async()=>{
  const w=await uploadWorld(),held=deferred(),save=w.lib.saveMovie;let entered=0;w.lib.saveMovie=async(b,m)=>{entered++;await held.promise;return save(b,m);};
  w.el('dub-library-layout').value='groups';await w.el('dub-library-layout').fire('change');await uploadControls(w).select.fire('click');const job=uploadControls(w).start.fire('click');await until(()=>entered===1);
  await uploadControls(w).start.fire('click');const buttons=descendants(w.el('dub-library-items'));await buttons.find(b=>b.tagName==='button'&&b.textContent==='내 계정에도 저장하기').fire('click');await buttons.find(b=>b.tagName==='button'&&b.textContent==='모두 내려받기 (ZIP)').fire('click');assert.equal(entered,1);
  held.resolve();await job;assert.equal(w.uploadCalls.length,3);
});

const uploadHistoryKey=w=>'mangoi_dub_uploads_v1:'+encodeURIComponent(w.owner);
const uploadHistory=w=>JSON.parse(w.data.get(uploadHistoryKey(w))||'null');
function resumeUpload(w){return descendants(w.el('dub-library-upload')).find(e=>e.tagName==='button'&&e.textContent==='남은 영상 이어서 저장');}
async function pausedUploadWorld(){
  const w=await uploadWorld(),save=w.lib.saveMovie;
  w.lib.saveMovie=async(b,m)=>{const r=await save(b,m);if(m.clientId==='device-0')w.pagehide();return r;};
  await uploadControls(w).select.fire('click');await uploadControls(w).start.fire('click');return w;
}
async function reloadUploadWorld(w,mutate,owner=w.owner){
  const x=world(w.data);await x.boot();x.changeOwner(owner);x.localMovies=w.localMovies.slice();x.cloudMovies=w.cloudMovies;x.uploadCalls=[];
  x.lib.listMovies=async()=>({movies:x.cloudMovies.slice()});
  x.lib.saveMovie=async(blob,meta)=>{x.uploadCalls.push({owner:x.owner,blob,meta:structuredClone(meta)});const movie={...meta,id:meta.clientId,mime:blob.type,size:blob.size,createdAt:789};x.cloudMovies.push(movie);x.localMovies=x.localMovies.filter(m=>m.id!==meta.clientId);return{movie};};
  if(mutate)mutate(x);await x.ctx.MangoiDubHome.openLibrary('movies');return x;
}
test('account upload progress survives a fresh JS context and resumes only unfinished originals without automatic uploading',async()=>{
  const w=await pausedUploadWorld(),record=uploadHistory(w);assert.equal(record.entries.length,3);assert.deepEqual(record.entries.map(e=>e.state),['saved','pending','pending']);
  const json=w.data.get(uploadHistoryKey(w));assert.ok(!json.includes('blob:')&&!json.includes('voice-0')&&!json.includes('mango_token'));
  const x=await reloadUploadWorld(w);assert.match(x.el('dub-library-upload').textContent,/1 \/ 3개 저장 · 남은 2개/);assert.equal(x.uploadCalls.length,0);assert.equal(uploadControls(x).meter.value,1);
  await resumeUpload(x).fire('click');assert.deepEqual(x.uploadCalls.map(c=>c.meta.clientId),['device-1','device-2']);assert.match(x.el('dub-library-upload').textContent,/3 \/ 3개 저장 · 남은 0개/);assert.equal(uploadControls(x).meter.value,3);
});
test('a server-committed upload with a lost success response is reconciled and never uploaded a second time',async()=>{
  const w=await pausedUploadWorld(),pending=w.localMovies[0];
  w.cloudMovies.push({...pending.meta,id:pending.id,size:pending.blob.size,mime:pending.blob.type,createdAt:999});
  const x=await reloadUploadWorld(w);assert.match(x.el('dub-library-upload').textContent,/2 \/ 3개 저장 · 남은 1개/);
  await resumeUpload(x).fire('click');assert.deepEqual(x.uploadCalls.map(c=>c.meta.clientId),['device-2']);assert.equal(new Set(x.cloudMovies.map(m=>m.id)).size,x.cloudMovies.length);
});
test('resume rechecks the latest account list even when another view saved a video after this library opened',async()=>{
  const w=await pausedUploadWorld(),x=await reloadUploadWorld(w),pending=x.localMovies[0];
  x.cloudMovies.push({...pending.meta,id:pending.id,size:pending.blob.size,mime:pending.blob.type,createdAt:999});
  await resumeUpload(x).fire('click');assert.deepEqual(x.uploadCalls.map(c=>c.meta.clientId),['device-2']);
});
test('the entire queue exists before the first account-list await and a closed view can restore all selected originals',async()=>{
  const w=await uploadWorld(),held=deferred();w.lib.listMovies=()=>held.promise;
  await uploadControls(w).select.fire('click');const job=uploadControls(w).start.fire('click');await until(()=>!!uploadHistory(w));assert.equal(uploadHistory(w).entries.length,3);
  await w.el('dub-library-close').fire('click');held.resolve({movies:w.cloudMovies.slice()});await job;assert.equal(w.uploadCalls.length,0);
  const x=await reloadUploadWorld(w);assert.equal(x.uploadCalls.length,0);await resumeUpload(x).fire('click');assert.equal(x.uploadCalls.length,3);
});
test('missing or changed originals are retained in progress and never silently counted as saved',async()=>{
  const w=await pausedUploadWorld();
  for(const mutate of [x=>x.localMovies.shift(),x=>x.localMovies[0]={...x.localMovies[0],blob:new Blob(['changed-size'])}]){
    const x=await reloadUploadWorld(w,mutate);await resumeUpload(x).fire('click');assert.deepEqual(x.uploadCalls.map(c=>c.meta.clientId),['device-2']);
    assert.match(x.el('dub-library-upload').textContent,/2 \/ 3개 저장 · 남은 1개/);assert.ok(uploadHistory(x).entries.some(e=>['missing','changed'].includes(e.state)));assert.match(x.el('dub-library-upload').textContent,/원본|정보가 바뀌/);
    // Reset shared account state before the second variation.
    w.cloudMovies=w.cloudMovies.filter(m=>m.id!=='device-2');w.data.set(uploadHistoryKey(w),JSON.stringify({version:1,owner:w.owner,id:'fixture-progress',updatedAt:Date.now(),entries:[...uploadHistory(w).entries.map(e=>({...e,state:e.id==='device-0'?'saved':'pending',error:''}))]}));
  }
});
test('an unavailable account list never causes blind uploads and reconnecting can resume safely',async()=>{
  const w=await pausedUploadWorld(),x=await reloadUploadWorld(w),list=x.lib.listMovies;x.lib.listMovies=async()=>{throw new Error('offline');};
  await resumeUpload(x).fire('click');assert.equal(x.uploadCalls.length,0);assert.match(x.el('dub-library-upload').textContent,/저장 완료 목록을 확인하지 못/);
  x.lib.listMovies=list;await resumeUpload(x).fire('click');assert.equal(x.uploadCalls.length,2);
});
test('upload progress is scoped to the same account and a stale resume cannot upload after switching accounts',async()=>{
  const w=await pausedUploadWorld(),x=await reloadUploadWorld(w),stale=resumeUpload(x);x.changeOwner('student:bob');
  x.localMovies=[];x.lib.listMovies=async()=>({movies:[]});await x.ctx.MangoiDubHome.openLibrary('movies');assert.equal(resumeUpload(x),undefined);assert.equal(x.el('dub-library-upload').hidden,true);
  await stale.fire('click');assert.equal(x.uploadCalls.length,0);assert.ok(w.data.has('mangoi_dub_uploads_v1:student%3Aalice'));assert.ok(!w.data.has('mangoi_dub_uploads_v1:student%3Abob'));
});
test('corrupt or foreign-account progress cannot select or upload originals and clearing progress never deletes movies',async()=>{
  const w=await pausedUploadWorld(),original=w.data.get(uploadHistoryKey(w));
  for(const bad of ['{broken',JSON.stringify({...JSON.parse(original),owner:'student:bob'}),JSON.stringify({...JSON.parse(original),entries:[{...JSON.parse(original).entries[0],id:'../escape'}]})]){
    w.data.set(uploadHistoryKey(w),bad);const x=await reloadUploadWorld(w);assert.match(x.el('dub-library-upload').textContent,/기록을 읽지 못/);assert.equal(resumeUpload(x),undefined);assert.equal(x.uploadCalls.length,0);
    const before=x.localMovies.length,cloud=x.cloudMovies.length;await descendants(x.el('dub-library-upload')).find(e=>e.tagName==='button'&&e.textContent==='저장 진행 기록 지우기').fire('click');assert.equal(x.localMovies.length,before);assert.equal(x.cloudMovies.length,cloud);assert.equal(x.data.has(uploadHistoryKey(x)),false);
  }
});
test('blocked checkpoint writes report the limitation while current-view saving still works',async()=>{
  const w=await uploadWorld(),set=w.ctx.localStorage.setItem;w.ctx.localStorage.setItem=(k,v)=>{if(k.startsWith('mangoi_dub_uploads_v1:'))throw new Error('quota');set(k,v);};
  await uploadControls(w).select.fire('click');await uploadControls(w).start.fire('click');assert.equal(w.uploadCalls.length,3);assert.match(w.el('dub-library-upload').textContent,/진행 기록을 저장하지 못/);assert.equal(uploadHistory(w),null);
});
test('adding another selection preserves unfinished originals in the remembered queue',async()=>{
  const w=await pausedUploadWorld();w.localMovies.push({id:'extra',createdAt:123,blob:new Blob(['extra']),meta:{engine:'main',episodeId:'fixture',title:'새 모둠 · 에피소드 1'}});
  const x=await reloadUploadWorld(w);const card=x.el('dub-library-items').children.find(e=>e.textContent.includes('새 모둠'));const one=descendants(card).find(e=>e.tagName==='button'&&e.textContent==='내 계정에도 저장하기');
  await one.fire('click');assert.ok(uploadHistory(x).entries.some(e=>e.id==='device-2'&&e.state==='pending'));assert.ok(uploadHistory(x).entries.some(e=>e.id==='extra'&&e.state==='saved'));assert.equal(uploadHistory(x).entries.length,4);
});

test('an unreadable original store disables resume instead of declaring originals lost or posting anything',async()=>{
  const w=await pausedUploadWorld(),x=await reloadUploadWorld(w,x=>{x.lib.listLocalMovies=async()=>{throw new Error('device-store-unavailable');};});
  assert.equal(resumeUpload(x).disabled,true);assert.match(x.el('dub-library-upload').textContent,/원본 영상을 불러오지 못/);assert.equal(x.uploadCalls.length,0);assert.ok(!uploadHistory(x).entries.some(e=>e.state==='missing'));
});
test('a record removed in another tab cannot be resurrected by a stale resume control',async()=>{
  const w=await pausedUploadWorld(),x=await reloadUploadWorld(w),resume=resumeUpload(x);x.data.delete(uploadHistoryKey(x));await resume.fire('click');
  assert.equal(x.uploadCalls.length,0);assert.equal(x.data.has(uploadHistoryKey(x)),false);assert.match(x.el('dub-library-upload').textContent,/다른 화면에서 바뀌/);
});

// Independent browser storage with shared authenticated account boundaries.
function cloudUploads(w, server) {
  w.ctx.crypto=webcrypto;
  w.lib.listUploads=async()=>({uploads:structuredClone(server.jobs.filter(r=>r.owner===w.owner)),removed:[...server.removed]});
  w.lib.saveUpload=async(r,owner)=>{
    assert.equal(owner,w.owner);if(server.offline)throw new Error('offline');
    if(server.removed.has(r.id))throw Object.assign(new Error('deleted'),{status:410});
    const prior=server.jobs.find(j=>j.id===r.id&&j.owner===owner),entries=new Map((prior?.entries||[]).map(e=>[e.id,e]));
    r.entries.forEach(e=>{const old=entries.get(e.id);entries.set(e.id,{...old,...e,...(old?.sha256?{sha256:old.sha256}:{}),state:old?.state==='saved'?'saved':e.state==='saved'?'saved':'pending',error:''});});
    const job={...structuredClone(r),entries:[...entries.values()]};server.jobs=server.jobs.filter(j=>j.id!==r.id||j.owner!==owner);server.jobs.push(job);return{upload:structuredClone(job)};
  };
  w.lib.deleteUpload=async(id,owner)=>{assert.equal(owner,w.owner);server.jobs=server.jobs.filter(j=>j.id!==id||j.owner!==owner);server.removed.add(id);};
  w.lib.storeLocalMovie=async(blob,meta,owner)=>{assert.equal(owner,w.owner);w.localMovies.push({id:meta.clientId,blob,meta,createdAt:1});};
}
async function crossUploadFixture(){
  const server={jobs:[],removed:new Set()},w=await uploadWorld();cloudUploads(w,server);const save=w.lib.saveMovie;
  w.lib.saveMovie=async(b,m)=>{const r=await save(b,m);if(m.clientId==='device-0')w.pagehide();return r;};
  await uploadControls(w).select.fire('click');await uploadControls(w).start.fire('click');
  const source={...w,data:new Map()},x=await reloadUploadWorld(source,y=>{y.localMovies=[];cloudUploads(y,server);});return{w,x,server};
}
const originalPicker=w=>descendants(w.el('dub-library-upload')).find(e=>e.tagName==='input'&&e.type==='file');
test('a separate browser restores account upload progress without local storage or original bytes and never uploads automatically',async()=>{
  const {w,x,server}=await crossUploadFixture();assert.notEqual(w.data,x.data);assert.equal(x.localMovies.length,0);assert.equal(x.uploadCalls.length,0);
  assert.match(x.el('dub-library-upload').textContent,/1 \/ 3개 저장 · 남은 2개/);assert.match(x.el('dub-library-upload').textContent,/계정에 저장 진행이 동기화/);assert.ok(originalPicker(x));
  assert.ok(server.jobs[0].entries.every(e=>/^[a-f0-9]{64}$/.test(e.sha256)));await resumeUpload(x).fire('click');assert.equal(x.uploadCalls.length,0);
});
test('cross-browser original reconnection rejects different same-size bytes and resumes only exact unfinished originals',async()=>{
  const {w,x}=await crossUploadFixture();const original=w.localMovies[0].blob,wrong=new Blob(['x'.repeat(original.size)],{type:original.type});
  let picker=originalPicker(x);picker.files=[wrong];await picker.fire('change');assert.equal(x.localMovies.length,0);assert.match(x.el('dub-library-upload').textContent,/일치하지 않는 파일 1개/);
  picker=originalPicker(x);picker.files=w.localMovies.map(m=>m.blob);await picker.fire('change');assert.equal(x.localMovies.length,2);assert.equal(x.uploadCalls.length,0);
  await resumeUpload(x).fire('click');assert.deepEqual(x.uploadCalls.map(c=>c.meta.clientId),['device-1','device-2']);assert.match(x.el('dub-library-upload').textContent,/3 \/ 3개 저장 · 남은 0개/);
});
test('account-upload checkpoints from another account never appear in an empty browser',async()=>{
  const {x,server}=await crossUploadFixture();x.changeOwner('student:bob');x.cloudMovies=[];await x.ctx.MangoiDubHome.openLibrary('movies');assert.equal(x.el('dub-library-upload').hidden,true);assert.equal(x.uploadCalls.length,0);assert.equal(server.jobs.length,1);
});
test('cloud deletion propagates to an old browser and a stale resume cannot resurrect it or upload a movie',async()=>{
  const {w,x,server}=await crossUploadFixture();const id=server.jobs[0].id;server.jobs=[];server.removed.add(id);
  await resumeUpload(x).fire('click');assert.equal(x.uploadCalls.length,0);assert.match(x.el('dub-library-upload').textContent,/계정에서 삭제된 진행/);
  const y=await reloadUploadWorld(w,z=>cloudUploads(z,server));assert.equal(resumeUpload(y),undefined);assert.equal(server.jobs.length,0);
});
test('offline cloud checkpoint failure is visible and keeps local originals and current-device progress',async()=>{
  const w=await uploadWorld(),server={jobs:[],removed:new Set(),offline:true};cloudUploads(w,server);
  await uploadControls(w).select.fire('click');await uploadControls(w).start.fire('click');assert.equal(w.uploadCalls.length,3);assert.ok(uploadHistory(w));assert.match(w.el('dub-library-upload').textContent,/계정에 진행 상황을 동기화하지 못/);
});

test('an original replaced by different bytes of the same size cannot be uploaded under a remembered fingerprint',async()=>{
  const {w,server}=await crossUploadFixture();const x=await reloadUploadWorld(w,y=>{cloudUploads(y,server);const old=y.localMovies[0];y.localMovies[0]={...old,blob:new Blob(['x'.repeat(old.blob.size)],{type:old.blob.type})};});
  await resumeUpload(x).fire('click');assert.equal(x.uploadCalls.length,0);assert.match(x.el('dub-library-upload').textContent,/原本|원본 파일 내용이 진행 기록과 달라/);
});
test('a failed account progress lookup is visible even in a fresh browser without any originals',async()=>{
  const w=world();await w.boot();w.lib.listUploads=async()=>{throw new Error('offline');};await w.ctx.MangoiDubHome.openLibrary('movies');assert.equal(w.el('dub-library-upload').hidden,false);assert.match(w.el('dub-library-upload').textContent,/계정의 저장 진행을 불러오지 못/);
});

let failed=0;
for(const {name,fn}of tests){try{await fn();console.log('✅ '+name);}catch(e){failed++;console.error('❌ '+name+'\n   '+e.stack);}}
console.log(`\nDubbing resume/player: ${tests.length-failed} PASS / ${failed} FAIL`);
if(failed)process.exitCode=1;
