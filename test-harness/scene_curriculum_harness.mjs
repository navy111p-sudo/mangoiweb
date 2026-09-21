import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import * as EV from '../scripts/scene-picture-evidence.mjs';
const require=createRequire(import.meta.url),D=require('../cloudflare-deploy/public/js/scene-curriculum.js');
const root=new URL('../cloudflare-deploy/public/',import.meta.url);
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++;},eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
eq(D.normalize('  APPLE！ '),'apple');eq(D.normalize('She’s here.'),"she's here");
ok(D.normalize('She is not here.')!==D.normalize('She is here.'));
eq(D.blank('A cat catches another cat.','cat'),'A _____ catches another _____.');
eq(D.blank("It isn't his cat.","isn't"),'It _____ his cat.');
const original=[1,2,3];D.shuffle(original,()=>.5);eq(original,[1,2,3]);
class El{
 constructor(tag='div'){this.tag=tag;this.hidden=false;this.disabled=false;this._value='';this.textContent='';this.attrs={};this.handlers={};this.children=[];this.paused=true;this.style={};this.complete=false;}
 get options(){return this.children;}get value(){return this._value;}set value(v){this._value=String(v);}
 addEventListener(n,f){(this.handlers[n]??=[]).push(f);}dispatch(n,extra={}){for(const f of this.handlers[n]||[])f.call(this,{preventDefault(){},...extra});if(this['on'+n])this['on'+n]();}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]||null;}removeAttribute(k){delete this.attrs[k];}get src(){return this.attrs.src||'';}set src(v){this.attrs.src=v;}
 replaceChildren(){this.children=[];if(this.tag==='select')this.value='';}append(...els){for(const e of els){this.children.push(e);if(this.tag==='select'&&this.children.length===1)this.value=e.value;}}
 pause(){this.paused=true;}load(){}play(){this.paused=false;return Promise.resolve();}focus(){}getClientRects(){return [{}];}
}
const html=fs.readFileSync(new URL('student-game-scene-quest.html',root),'utf8');
const source=fs.readFileSync(new URL('js/scene-curriculum.js',root),'utf8');
function app(){
 const els=Object.fromEntries([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/g)].map(m=>[m[2],new El(m[1])]));els['cq-series'].value='bts';els['cq-mode'].value='words';
 const events={},requests=[],posted=[],timers=new Map();let timerId=0;
 const document={documentElement:{lang:'ko'},hidden:false,getElementById:id=>els[id],createElement:t=>new El(t),createTextNode:s=>({textContent:s}),addEventListener:(n,f)=>events[n]=f};
 const window={parent:{postMessage:(m,o)=>posted.push({m,o})},addEventListener(){},speechSynthesis:{cancel(){},speak(){}}};
 const math=Object.create(Math);math.random=()=>.999;
 const fetch=(url,options)=>new Promise((resolve,reject)=>{const r={url,options,resolve,reject,done:false};requests.push(r);options.signal.addEventListener('abort',()=>{r.aborted=true;const e=Error('aborted');e.name='AbortError';reject(e);});});
 vm.runInNewContext(source,{window,document,fetch,AbortController,Math:math,Map,Set,location:{origin:'https://mangoi.test'},SpeechSynthesisUtterance:function(){},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id)});
 return {els,events,requests,posted,timers,document,click:id=>els['cq-'+id].dispatch('click'),change:(id,value)=>{els['cq-'+id].value=value;els['cq-'+id].dispatch('change');},respond:(suffix,data)=>{const r=requests.findLast(r=>!r.done&&r.url.endsWith(suffix));assert.ok(r,'request '+suffix);r.done=true;r.resolve({ok:true,json:async()=>data});},answer:s=>{els['cq-answer'].value=s;els['cq-answer-form'].dispatch('submit');}};
}
const manifest={wordForms:4546,wordPictureForms:95,contextOnlyForms:4157,noPictureForms:294,clips:43,books:[{id:'bts-01',series:'bts',label:'BTS 1',title:'School'},{id:'bts-02',series:'bts',label:'BTS 2',title:'Colors'},{id:'siu-basic-01',series:'siu-basic',label:'SIU Basic 1',title:'Talk'}]};
const one={id:'bts-01',label:'BTS 1',words:[{word:'apple',scene:'a',sourceIndex:1,bookExample:'I have an apple.'},{word:'pencil',scene:'p',sourceIndex:11,bookExample:'This is a pencil.'}],clips:[{scene:'v',sourceIndex:1}],scenes:{a:{text:'An apple is red.',source:'BTS 1 · #1',image:'https://images.example.test/apple.webp'},p:{text:'This is a pencil.',source:'BTS 1 · #2',image:'https://images.example.test/pencil.webp'},v:{text:'He kicks the ball.',source:'BTS 1 · #3',image:'https://images.example.test/ball.webp',video:'https://images.example.test/ball.mp4'}}};
const two={id:'bts-02',label:'BTS 2',words:[{word:'green',scene:'g',bookExample:'The balloon is green.'}],clips:[],scenes:{g:{text:'The balloon is green.',source:'BTS 2 · #1',image:'https://images.example.test/green.webp'}}};
const flush=()=>new Promise(setImmediate);
async function ready(){const a=app();eq(a.requests.length,0,'no curriculum data loaded before the user opens it');a.click('open');await flush();eq(a.requests.length,1);a.respond('manifest.json',manifest);await flush();eq(a.requests.length,2,'fetch only one selected book');a.respond('bts-01.json',one);await flush();return a;}
const a=await ready();ok(!a.els['cq-card'].hidden);eq(a.els['cq-target'].textContent,'apple');eq(a.els['cq-video'].src,'','no eager video load');eq(a.els['cq-items'].children.length,2);
a.click('quiz');ok(a.els['cq-book-example'].textContent.includes('_____'),'the selected book example does not leak quiz answers');a.answer('wrong');ok(!a.els['cq-answer'].disabled);a.answer('APPLE!');ok(a.els['cq-answer'].disabled);const points=a.els['cq-count'].textContent;a.answer('apple');eq(a.els['cq-count'].textContent,points,'double submit does not award again');a.click('next');a.click('reveal');a.answer('pencil');a.click('next');ok(!a.els['cq-result'].hidden);eq(a.posted.length,1);a.click('next');eq(a.posted.length,1,'completion is idempotent');
a.els['cq-result'].children.find(x=>x.tag==='button').dispatch('click');a.answer('apple');a.click('next');a.answer('pencil');a.click('next');eq(a.posted.length,1,'review does not post a second completion');
const scoped=await ready();scoped.change('lesson','1');eq(scoped.els['cq-target'].textContent,'pencil','section filter uses source position');eq(scoped.els['cq-items'].children.length,1);scoped.change('mode','videos');ok(scoped.els['cq-card'].hidden,'empty section does not silently use another lesson');scoped.change('lesson','all');scoped.change('level','starter');scoped.click('quiz');ok(scoped.els['cq-example'].textContent.includes('_____'),'starter sentence task uses a word blank');ok(scoped.els['cq-feedback'].textContent.startsWith('k'),'starter gets an initial-letter prompt');scoped.answer('kicks');ok(scoped.els['cq-answer'].disabled,'starter grades the missing word');scoped.change('difficulty','challenge');scoped.click('quiz');ok(!scoped.els['cq-example'].textContent.includes('kicks'),'challenge hides sentence answer');scoped.answer('kicks');ok(!scoped.els['cq-answer'].disabled,'full-sentence mode rejects a single word');scoped.answer('He kicks the ball.');ok(scoped.els['cq-answer'].disabled,'full-sentence answer passes');scoped.change('level','growing');scoped.change('difficulty','auto');scoped.click('quiz');ok(scoped.els['cq-example'].textContent.includes('k____'),'standard sentence mode exposes initial letters');
const media=await ready();media.change('mode','videos');eq(media.requests.length,2,'mode switch reuses the selected book');eq(media.els['cq-video'].src,'');media.click('watch');await flush();ok(media.els['cq-video'].src.endsWith('.mp4'));media.document.hidden=true;media.events.visibilitychange();ok(media.els['cq-video'].paused);eq(media.els['cq-video'].src,'','hidden page releases the video source');
media.document.hidden=false;media.click('watch');media.click('close');await flush();ok(media.els['cq-video'].paused);eq(media.els['cq-video'].src,'');ok(media.els.curriculum.hidden);
const stalled=await ready();stalled.change('mode','videos');let resolvePlay;stalled.els['cq-video'].play=()=>new Promise(resolve=>{resolvePlay=resolve;});stalled.click('watch');for(const timer of [...stalled.timers.values()])if(timer.ms===15000)timer.fn();ok(stalled.els['cq-video'].hidden,'stalled clip falls back to the picture');ok(!stalled.els['cq-watch'].disabled,'stalled clip can be retried');eq(stalled.els['cq-video'].src,'');resolvePlay();await flush();ok(stalled.els['cq-video'].hidden,'late play cannot reopen the timed-out clip');
const offline=await ready();offline.change('mode','videos');offline.els['cq-video'].play=()=>Promise.reject(Error('offline'));offline.click('watch');await flush();ok(offline.els['cq-video'].hidden);ok(offline.els['cq-media-status'].textContent.includes('재생하지 못'));
offline.change('mode','words');offline.els['cq-image'].dispatch('error');ok(!offline.els['cq-retry-image'].hidden);offline.click('quiz');offline.answer('apple');ok(offline.els['cq-answer'].disabled,'image failure does not block learning');
const race=await ready();race.change('book','bts-02');await flush();const old=race.requests.at(-1);race.change('book','bts-01');await flush();ok(old.aborted);eq(race.els['cq-target'].textContent,'apple');old.resolve({ok:true,json:async()=>two});await flush();eq(race.els['cq-target'].textContent,'apple','late response cannot replace the latest selected book');
race.change('book','bts-02');await flush();for(const timer of [...race.timers.values()])if(timer.ms===15000)timer.fn();await flush();ok(!race.els['cq-retry'].hidden,'timeout exposes a retry button');race.click('retry');await flush();race.respond('bts-02.json',two);await flush();eq(race.els['cq-target'].textContent,'green');
ok(!/speech-data-(?:bts|siu)/.test(html),'page never eagerly loads all three curricula');
ok(/id="cq-video"[^>]*preload="none"/.test(html));ok(!/id="cq-video"[^>]*autoplay/.test(html));
const dir=new URL('data/scene-curriculum/v1/',root),live=JSON.parse(fs.readFileSync(new URL('manifest.json',dir),'utf8'));
eq(live.books.length,85);ok(live.wordForms>4400);ok(live.clips>=40);
/* 🔴 2026-09-21 — 여기 있던 「word forms 의 97% 가 verified picture」 단정을 버렸습니다.
   그 숫자는 «그림을 붙인 개수» 였을 뿐 «그 낱말을 보여 주는가» 를 한 번도 재지 않았고,
   실측으로 그림을 붙인 39,762줄 중 38,475줄(96.8%)이 그 낱말과 무관했습니다(「nice」 ← 가방 사진).
   그래서 «몇 %가 그림을 가졌나» 대신 «그림이라고 말한 것마다 근거가 있는가» 를 봅니다. */
const sourceBooks=new Map();
for(const [series,file,name] of [['bts','speech-data-bts.js','BTS_SENTENCES'],['siu-basic','speech-data-siu-basic.js','SIU_BASIC_SENTENCES'],['siu-advance','speech-data-siu-advance.js','SIU_ADVANCE_SENTENCES']]){
 const code=fs.readFileSync(new URL('js/'+file,root),'utf8');const actual=JSON.parse(vm.runInNewContext(code+'\nJSON.stringify('+name+')'));
 Object.values(actual).forEach((b,i)=>sourceBooks.set(series+'-'+String(i+1).padStart(2,'0'),b.sentences));
}
const plan=name=>JSON.parse(fs.readFileSync(new URL('../../docs/scene-curriculum-media/'+name,root),'utf8'));
const scenePlan=plan('scene-plan.json'),assetPlan=plan('asset-plan.json'),clipPlan=plan('clip-plan.json'),contextPlan=plan('context-images.json').images;
const {describe,depicts}=EV.pictureEvidence({assets:assetPlan,clips:clipPlan,sceneText:new Map(scenePlan.map(r=>[r.id,r.text]))});
const assetIndexOf=new Map(assetPlan.map(a=>[a.id,a.index]));
const mediaKey=new Map();
for(const row of scenePlan){const index=assetIndexOf.get(row.asset);mediaKey.set(row.id,contextPlan[index]||('word-image:'+index));}
for(const c of clipPlan)mediaKey.set(c.id,'clip-image:'+(c.reuseClip||c.index));
/* 🔁 빌드가 고른 것을 «여기서 다시 골라» 맞춰 본다 — 안 그러면 이미 만들어진 payload 를 같은 모듈로
   되짚기만 해서, 근거 게이트를 «항상 참» 으로 열어도 전부 초록이 됩니다(2026-09-21 함정 대조 실측).
   ⛔ 그래서 «붙인다» 와 «안 붙일 때는 정말 근거가 없다» 를 짝으로 봅니다. */
const mediaLookup=new Set();
{const excluded=new Set(plan('excluded-media.json'));
 for(const m of plan('optimized-media.json')){const key=(m.kind||'word-image')+':'+m.index;if(m.url&&m.uploaded&&!excluded.has(key))mediaLookup.add(key);}}
const stopWords=new Set(plan('stopwords.json').concat(['ken','karen','tom','nelly','poko','leon',"leon's"]));
const contentWords=text=>[...new Set((String(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).filter(w=>!stopWords.has(w)))];
const sceneHasImage=new Map(),sceneOwnText=new Map();
for(const row of scenePlan){sceneOwnText.set(row.id,row.text);sceneHasImage.set(row.id,mediaLookup.has(mediaKey.get(row.id)));}
for(const c of clipPlan){if(!mediaLookup.has('video:'+(c.reuseClip||c.index)))continue;sceneOwnText.set(c.id,c.text);sceneHasImage.set(c.id,mediaLookup.has(mediaKey.get(c.id)));}
const depictPool=new Map();
for(const [sid,text] of sceneOwnText){if(!sceneHasImage.get(sid))continue;
 for(const w of contentWords(text)){if(!depicts(w,mediaKey.get(sid)))continue;if(!depictPool.has(w))depictPool.set(w,[]);depictPool.get(w).push(sid);}}
ok(depictPool.size>0&&depictPool.size<600,'근거 있는 낱말은 소수여야 한다 — 갑자기 많아지면 게이트가 열린 것 ('+depictPool.size+')');

/* 🖼 낱말 그림 — 그 낱말 «하나» 를 보여 주려고 일부러 만든 그림.
   ⛔ 「표에 있다」를 «붙어 있다» 로 읽지 마세요 — 파일이 커밋에 안 담기면 조용히 폴백합니다
      (2026-08-31 Lily 얼굴이 그렇게 며칠 동안 옛 얼굴로 돌았습니다). existsSync 로 실재를 봅니다. */
const wordPicPlanPath=new URL('../../docs/scene-curriculum-media/word-picture-plan.json',root);
const wordPicPlan=fs.existsSync(wordPicPlanPath)?JSON.parse(fs.readFileSync(wordPicPlanPath,'utf8')):[];
const wordPicEv=EV.wordPictureEvidence(wordPicPlan);
const wordPicUrl=new Map();
for(const w of wordPicPlan){
 ok(w.word&&w.file&&w.prompt,'낱말 그림 계획에는 낱말·파일·설명이 있어야 한다');
 ok(/^scene-words\/[a-z0-9-]+\.webp$/.test(w.file),'낱말 그림 파일 이름 규칙: '+w.file);
 const abs=new URL('img/'+w.file,root);
 ok(fs.existsSync(abs),'계획한 낱말 그림 파일이 저장소에 실재해야 한다(커밋 누락): '+w.file);
 if(fs.existsSync(abs))ok(fs.statSync(abs).size<=80000,'낱말 그림 용량: '+w.file+' '+fs.statSync(abs).size);
 /* ① 선언만 믿지 않는다 — 그 프롬프트가 실제로 그 낱말을 불러야 붙는다. */
 ok(wordPicEv.keyFor(w.word)==='word-pic:'+w.index,'계획한 낱말 그림은 그 낱말을 부르는 설명이어야 한다: '+w.word);
 if(fs.existsSync(abs))wordPicUrl.set(w.word,'/img/'+w.file);
}
/* 짝 ①: 설명이 그 낱말을 안 부르면 «붙이지 않는다». 이 짝이 없으면 «전부 붙이기» 도 통과합니다. */
eq(EV.wordPictureEvidence([{word:'zebra',index:999001,prompt:'Vocabulary picture for a horse in a field.'}]).keyFor('zebra'),'',
 '설명이 그 낱말을 안 부르면 낱말 그림으로 안 쓴다');
eq(EV.wordPictureEvidence([{word:'zebra',index:999002,prompt:'Vocabulary picture for "zebra". A zebra on grass.'}]).keyFor('zebra'),'word-pic:999002',
 '설명이 그 낱말을 부르면 낱말 그림으로 쓴다');
/* 짝 ②: 계획에 없는 낱말은 예전 그대로다(낱말 그림이 «전부» 를 덮어쓰지 않는다). */
eq(wordPicEv.keyFor('zzqnotaword'),'','계획에 없는 낱말에는 낱말 그림이 없다');
/* 짝 ③: 거의 모든 설명에 나오는 말(껍데기)은 근거가 아니다 — 안 그러면 틀 문구가 모든 그림에 붙습니다. */
{const same=[...Array(10)].map((_,i)=>({word:'picture',index:999100+i,prompt:'Vocabulary picture for "picture". Thing number '+i+'.'}));
 eq(EV.wordPictureEvidence(same).keyFor('picture'),'','묶음의 거의 모든 설명에 나오는 낱말은 근거가 아니다');}
eq(wordPicUrl.size,live.wordPictureAssets||0,'manifest 의 낱말 그림 장수가 실제 파일 수와 같다');
eq(wordPicPlan.length,live.wordPicturePlan||0,'manifest 의 낱말 그림 계획 수가 실제와 같다');
ok([...describe.values()].filter(t=>t.trim()).length<assetPlan.length/2,
 '그림 설명 대부분은 문장을 옮겨 적은 틀이다 — 그것을 근거로 되돌리면 이 검사가 먼저 빨간불이 된다');
eq(live.wordPictureForms+live.contextOnlyForms+live.noPictureForms,live.wordForms,
 '낱말 형태를 «낱말 그림 / 상황 그림만 / 그림 없음» 으로 갈라서 센다');
ok(live.wordPictureForms>0&&live.wordPictureForms<live.wordForms/2,
 '근거 있는 낱말 그림은 소수다 — 갑자기 대부분이 되면 근거 게이트가 죽은 것');
const seen=new Set(),pictures=new Set(),claimed={word:0,context:0,none:0};
for(const entry of live.books){
 const bytes=fs.readFileSync(new URL(entry.id+'.json',dir));ok(bytes.length<350000,entry.id+' payload');ok(zlib.gzipSync(bytes).length<80000,entry.id+' gzip budget');const b=JSON.parse(bytes);eq(b.id,entry.id);eq(b.words.length,entry.words);ok(b.clips.length>0,entry.id+' has a sentence clip');
 const sentences=sourceBooks.get(b.id),owned=new Set(sentences);
 for(const w of b.words){
  seen.add(w.word);const s=b.scenes[w.scene];ok(s,'scene exists');
  /* 화면이 보여 주는 예문 = bookExample ?? 그림 문장. 둘이 같을 때 빌드가 한 번만 싣는다. */
  const shown=w.bookExample||s.text;
  eq(sentences[w.sourceIndex-1],shown,'example matches the existing course source');
  ok((shown.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).includes(w.word),'word belongs to the shown example');
  /* ⛔ 남의 교재 문장은 payload 에 실리지 않는다 — BTS 1 학생에게 SIU ADVANCE 문장이 가던 길. */
  if(s.text)ok(owned.has(s.text),'a shipped sentence belongs to this book');
  if(w.img){
   /* 🖼 그 낱말을 보여 주려고 «일부러» 만든 그림. 문장 삽화가 아니므로 예문은 이 교재의 교재 예문 그대로다. */
   claimed.word++;pictures.add(w.word);
   ok(w.pic,'낱말 그림을 붙였으면 화면에도 «낱말 그림» 이라고 말한다: '+w.word);
   eq(w.img,wordPicUrl.get(w.word),'그 낱말에 배정된 낱말 그림이어야 한다: '+w.word);
   ok(s.text===shown,'낱말 그림을 쓸 때 예문은 이 교재의 교재 예문이다: '+w.word);
   ok(w.imgBytes>0&&w.imgBytes<=80000,'낱말 그림 용량: '+w.word);
   /* ⛔ 남의 CDN 주소를 payload 에 박지 않는다 — 주소가 만료되면 그림이 통째로 사라집니다. */
   ok(/^\/img\/scene-words\//.test(w.img),'낱말 그림은 우리 서버에서 온다: '+w.img);
  }else if(w.pic){
   claimed.word++;pictures.add(w.word);
   ok(s.image,'a word picture has a picture');
   ok(depicts(w.word,mediaKey.get(w.scene)),'「낱말 그림」이라고 말하려면 그 그림의 설명이 그 낱말을 가리켜야 한다: '+w.word);
  }else if(s.image){
   claimed.context++;pictures.add(w.word);
   /* 근거가 없을 때 그림은 «그 그림이 실제로 그린 그 문장» 과만 함께 나온다. */
   ok(s.text===shown,'상황 그림은 지금 보여 주는 그 예문의 그림이어야 한다: '+w.word);
   ok(!depicts(w.word,mediaKey.get(w.scene))||!w.bookExample,'근거가 있는데 낱말 그림으로 안 세었다: '+w.word);
  }else{claimed.none++;ok(s.text===shown,'그림이 없을 때도 예문은 그 교재의 예문이다: '+w.word);}
  /* 🔁 빌드의 선택을 다시 계산해 맞춘다 — pic 은 «낱말 그림이 있었는가 또는 근거 있는 후보가 있었는가» 와 같아야 한다.
     ⛔ 낱말 그림이 있는 낱말은 «붙어 있어야» 한다 — 조용히 문장 삽화로 떨어지면 여기서 빨간불이 난다. */
  eq(!!w.pic,wordPicUrl.has(w.word)||depictPool.has(w.word),'낱말 그림 여부가 근거 재계산과 같아야 한다: '+w.word);
  eq(!!w.img,wordPicUrl.has(w.word),'낱말 그림이 있는 낱말에는 반드시 그 그림이 붙는다: '+w.word);
  if(w.pic&&!w.img)ok(depictPool.get(w.word).includes(w.scene),'고른 그림이 근거 있는 후보 가운데 하나다: '+w.word);
  if(!w.img&&s.image){ok(s.imageBytes<=80000,'picture budget');ok(/^https:\/\//.test(s.image),'https picture');}
 }
 for(const c of b.clips){const s=b.scenes[c.scene];eq(sentences[c.sourceIndex-1],s.text,'clip matches the selected book');ok(s.video&&s.image);ok(s.videoBytes<=900000,'clip budget');ok(s.duration>0&&s.duration<=6.2,'short clip');}
 eq(b.words.filter(w=>w.pic).length,entry.wordPictures,entry.id+' word-picture count');
 eq(b.words.filter(w=>!w.pic&&b.scenes[w.scene].image).length,entry.contextPictures,entry.id+' context-picture count');
}
eq(seen.size,live.wordForms);
eq(claimed.word,live.wordPictureRows,'manifest 의 낱말 그림 줄 수가 실제와 같다');
eq(claimed.context,live.contextPictureRows,'manifest 의 상황 그림 줄 수가 실제와 같다');
eq(claimed.none,live.noPictureRows,'manifest 의 그림 없음 줄 수가 실제와 같다');
ok(claimed.none>0,'맞는 그림이 없으면 붙이지 않는다 — 전부 붙었다면 게이트가 죽은 것');
eq(pictures.size,live.wordPictureForms+live.contextOnlyForms,'그림이 붙은 낱말 형태 수');
console.log('PASS scene curriculum: '+checks+' assertions (그림 근거 게이트, 예문 출처, payload budgets, grading, request races, cancellation, media fallback; 브라우저·레이아웃 검사는 없음)');
