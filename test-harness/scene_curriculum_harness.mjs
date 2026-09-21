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
const manifest={wordForms:4546,wordPictureForms:95,contextOnlyForms:4374,cardOnlyForms:77,clips:43,books:[{id:'bts-01',series:'bts',label:'BTS 1',title:'School'},{id:'bts-02',series:'bts',label:'BTS 2',title:'Colors'},{id:'siu-basic-01',series:'siu-basic',label:'SIU Basic 1',title:'Talk'}]};
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
/* 📁 payload 가 가리키는 «우리 경로» 그림·영상이 저장소에 실제로 있는가.
   🔴 CLAUDE.md: 「새 그림은 «표에 등록» 만 하고 파일을 커밋에 안 담으면 조용히 폴백합니다」
      (2026-08-31 Lily 얼굴이 며칠 동안 옛 얼굴로 돌던 사고). 2026-09-21 에 클립 1,010개를
      한꺼번에 담았으므로 «등록은 됐는데 파일이 빠진» 것을 여기서 잡습니다.
   ⛔ 외부 주소(http…)는 여기서 못 봅니다 — 그건 사람이 브라우저로 봐야 합니다. */
{let n=0;const missing=[];
 for(const f of fs.readdirSync(dir)){
  if(f==='manifest.json'||!f.endsWith('.json'))continue;
  const book=JSON.parse(fs.readFileSync(new URL(f,dir),'utf8'));
  for(const sc of Object.values(book.scenes||{}))for(const u of [sc.image,sc.video]){
   if(!u||!u.startsWith('/'))continue;n++;
   if(!fs.existsSync(new URL('.'+u,root))&&missing.length<8)missing.push(f+' '+u);}}
 ok(n>1000,'payload 가 우리 경로 그림·영상을 충분히 가리킨다 ('+n+')');
 ok(missing.length===0,'payload 가 가리키는 파일이 저장소에 실재한다 ('+(missing.join(' · ')||'빠진 것 없음')+')');}
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
/* 🖼 2026-09-21 사장님 지시(그림문자 카드를 실사 사진으로) — 낱말마다 «그 낱말을 그린» 사진 한 장.
   ⛔ 빌드가 만든 payload 를 되짚지 않고 «여기서 다시» 고릅니다 — 되짚기만 하면 근거 게이트를
      «항상 참» 으로 열어도 전부 초록입니다(2026-09-21 함정 대조 실측).
   ⚠️ 표에 있어도 그림 파일이 없으면 세지 않습니다 — 표만 늘리고 그림을 커밋에 안 담으면
      조용히 빈 그림이 됩니다(2026-08-31 Lily 얼굴). */
const wordImageDir=new URL('img/scene-words/',root);
const wordImagePlan=plan('word-image-plan.json');
const wordAssets=[],wordFile=new Map();
for(const it of wordImagePlan){const p=new URL(it.index+'.webp',wordImageDir);if(!fs.existsSync(p))continue;
 wordAssets.push({id:'w'+it.index,index:it.index,prompt:it.prompt,scenes:[]});wordFile.set(it.index,fs.statSync(p).size);}
ok(wordAssets.length>0,'낱말 사진 표가 가리키는 그림이 저장소에 실재한다 ('+wordAssets.length+'/'+wordImagePlan.length+')');
const stopWords=new Set(plan('stopwords.json').concat(['ken','karen','tom','nelly','poko','leon',"leon's"]));
const {describe,shell:shellSet,depicts}=EV.pictureEvidence({assets:assetPlan.concat(wordAssets),clips:clipPlan,sceneText:new Map(scenePlan.map(r=>[r.id,r.text])),stopWords});
/* 🖼 「설명이 그 낱말을 가리킬 때만」 — 껍데기 낱말(natural·clear·soft…)은 여기서 떨어집니다. */
const wordSceneOf=new Map(),wordSceneBytes=new Map();
for(const it of wordImagePlan){if(!wordFile.has(it.index))continue;if(!depicts(it.word,'word-image:'+it.index))continue;
 wordSceneOf.set(it.word,'w'+it.index);wordSceneBytes.set('w'+it.index,wordFile.get(it.index));}
ok(wordSceneOf.size>wordAssets.length*0.9,'낱말 사진 대부분이 근거를 통과한다 ('+wordSceneOf.size+'/'+wordAssets.length+')');
{const shellWord=wordImagePlan.filter(it=>wordFile.has(it.index)&&!wordSceneOf.has(it.word)).map(it=>it.word);
 ok(shellWord.length>0,'껍데기 낱말은 사진이 있어도 «낱말 그림» 이 되지 않는다 — 0이면 게이트가 열린 것');
 for(const w of shellWord)ok(EV.shellTokens(assetPlan.concat(wordAssets).map(x=>x.prompt)).has(w),'거부된 까닭은 껍데기 낱말이어서다: '+w);}
/* 🧱 «한 낱말이 그림 거의 전부를 가리킨다» 면 그것은 근거가 아니라 새어 나온 틀이다.
   🔴 2026-09-21 에 이 모양으로 두 번 샜습니다 — ⓐ 틀 꼬리(light·setting·writing·subtitles)가
      prompt 를 타고 들어와 클립 «전부» 에 붙었고 ⓑ variants() 가 없는 어미를 잘라 만든 기능어
      (thing→the · ones→on · toes→to)가 설명마다 있어 「thing」이 클립 95.5% 에 붙었습니다.
      둘 다 «껍데기 80%» 게이트를 비켜 갔습니다(꼬리는 80%에 못 미치고, 기능어는 낱말 쪽에서 생깁니다).
   ✅ 그래서 «결과» 로 묻습니다 — 교재 낱말 중 어느 하나도 그림의 절반을 넘게 가리키면 안 됩니다.
   ⛔ 낱말 목록을 손으로 적어 빼지 마세요(틀이 바뀌면 낡습니다) · 문턱을 올려서 풀지 마세요.
   ⚠️ 사람 이름·흔한 사물(child·smile)은 원래 여러 그림에 나옵니다 — 실측 최대가 20.5% 라
      절반(50%)은 «정상» 과 «샘» 사이에 넉넉히 떨어져 있습니다. */
{const allWords=new Set();
 for(const list of sourceBooks.values())for(const t of list)for(const w of EV.tokens(t))if(!stopWords.has(w))allWords.add(w);
 /* ⛔ 여기서 토큰을 «다시 걸러» 세지 마세요 — 그러면 모듈이 무엇을 근거로 삼든 하니스는 제 기준만 봅니다.
    2026-09-21 실측: 그렇게 썼더니 모듈에서 기능어 거르기를 통째로 지워도 486,407건이 전부 초록이었습니다.
    ✅ 반드시 정본 depicts() 에 «물어서» 셉니다. */
 const keys=clipPlan.map(c=>'clip-image:'+c.index).filter(k=>describe.get(k));
 ok(keys.length>=20,'설명이 있는 클립이 충분하다 — 적으면 아래 비율 검사가 뜻을 잃는다 ('+keys.length+')');
 let worst=['',0];
 for(const w of allWords){let n=0;
  for(const k of keys)if(depicts(w,k))n++;
  if(n>worst[1])worst=[w,n];}
 const pct=100*worst[1]/Math.max(1,keys.length);
 ok(pct<50,'어느 교재 낱말도 클립 그림의 절반을 넘게 가리키지 않는다 — 넘으면 틀이 근거로 샌 것 (최대 '+worst[0]+' '+worst[1]+'/'+keys.length+' = '+pct.toFixed(1)+'%)');
 ok(worst[1]>0,'그래도 가리키는 낱말이 있다 — 0이면 근거가 통째로 죽은 것');}
/* 🔢 클립 매체 번호가 «이미 임자가 있는 자리» 를 뺏지 않는가.
   🔴 2026-09-21 실측: 새로 받은 505편을 6001.. 로 매기니 6007 이 겹쳤다 — 그 자리는 clip-plan 5007
      (「The dog has four legs.」)이 reuseClip 으로 쓰던 «네 다리 강아지 재촬영» 매체였고, 덮어쓰자
      bts-03·08·18·24 의 「dog」 사진이 사라져 그림문자 카드로 내려갔다(카드 줄 14 → 25).
   ⚠️ 구조만으로는 «정당한 재사용»(5014 → 5028, 문장은 다르지만 같은 바닷가 영상)과 구분할 수 없다.
      가를 수 있는 것은 하나뿐 — 「clip-plan 에 임자 행이 없는 reuseClip 자리」는 그 한 편을 위해
      따로 찍어 둔 매체이므로, 다른 클립이 그 번호를 «자기 번호» 로 쓰면 안 된다.
   ⛔ 이 검사를 지우고 번호를 손으로 맞추지 마세요 — 덮어써도 에러가 안 나고 그림만 조용히 바뀝니다. */
{const dup=clipPlan.map(c=>c.index).filter((v,i,a)=>a.indexOf(v)!==i);
 ok(dup.length===0,'클립 번호가 겹치지 않는다 ('+(dup.join(',')||'0건')+')');
 /* 묶음은 천 단위로 매긴다(5xxx 1차 · 6007 재촬영 · 7xxx 2차). reuseClip 은 «같은 묶음 안» 을
    가리키거나 «임자가 없는 전용 자리» 를 가리킨다 — 다른 묶음의 클립이 그 자리를 «자기 번호» 로
    쓰고 있으면 그 자리를 뺏은 것이다.
    ⛔ 「임자가 없는 자리만 예약» 으로 쓰면 스스로 무력해집니다 — 뺏기는 순간 임자가 생겨
       예약 목록에서 빠지기 때문입니다(2026-09-21 에 실제로 그렇게 짰다가 변이가 안 잡혔습니다). */
 const block=n=>Math.floor(n/1000);
 const owner=new Map(clipPlan.map(c=>[c.index,c]));
 const stolen=[];
 for(const c of clipPlan){if(!c.reuseClip)continue;
  const t=owner.get(c.reuseClip);
  if(t&&block(t.index)!==block(c.index))stolen.push(c.index+'→'+c.reuseClip);}
 ok(stolen.length===0,'reuseClip 이 가리키는 자리를 다른 묶음의 클립이 뺏지 않았다 ('+(stolen.join(',')||'0건')+')');}
const assetIndexOf=new Map(assetPlan.map(a=>[a.id,a.index]));
const mediaKey=new Map();
for(const row of scenePlan){const index=assetIndexOf.get(row.asset);mediaKey.set(row.id,contextPlan[index]||('word-image:'+index));}
for(const c of clipPlan)mediaKey.set(c.id,'clip-image:'+(c.reuseClip||c.index));
for(const sid of wordSceneOf.values())mediaKey.set(sid,'word-image:'+sid.slice(1));
/* 🔁 빌드가 고른 것을 «여기서 다시 골라» 맞춰 본다 — 안 그러면 이미 만들어진 payload 를 같은 모듈로
   되짚기만 해서, 근거 게이트를 «항상 참» 으로 열어도 전부 초록이 됩니다(2026-09-21 함정 대조 실측).
   ⛔ 그래서 «붙인다» 와 «안 붙일 때는 정말 근거가 없다» 를 짝으로 봅니다. */
const mediaLookup=new Set();
{const excluded=new Set(plan('excluded-media.json'));
 for(const m of plan('optimized-media.json')){const key=(m.kind||'word-image')+':'+m.index;if(m.url&&m.uploaded&&!excluded.has(key))mediaLookup.add(key);}}
const contentWords=text=>[...new Set((String(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).filter(w=>!stopWords.has(w)))];
const sceneHasImage=new Map(),sceneOwnText=new Map();
for(const row of scenePlan){sceneOwnText.set(row.id,row.text);sceneHasImage.set(row.id,mediaLookup.has(mediaKey.get(row.id)));}
for(const c of clipPlan){if(!mediaLookup.has('video:'+(c.reuseClip||c.index)))continue;sceneOwnText.set(c.id,c.text);sceneHasImage.set(c.id,mediaLookup.has(mediaKey.get(c.id)));}
const depictPool=new Map();
for(const [sid,text] of sceneOwnText){if(!sceneHasImage.get(sid))continue;
 for(const w of contentWords(text)){if(!depicts(w,mediaKey.get(sid)))continue;if(!depictPool.has(w))depictPool.set(w,[]);depictPool.get(w).push(sid);}}
ok(depictPool.size>0&&depictPool.size<600,'근거 있는 낱말은 소수여야 한다 — 갑자기 많아지면 게이트가 열린 것 ('+depictPool.size+')');
/* ⚠️ «문장 그림» 과 «낱말 사진» 을 갈라서 셉니다 — 낱말 사진은 처음부터 설명이라 섞으면
   「대부분이 틀이다」가 저절로 깨져, 정작 지키려던 메아리 게이트를 아무도 안 보게 됩니다. */
{const sentenceKeys=new Set(assetPlan.map(x=>'word-image:'+x.index));
 ok([...describe].filter(([k,t])=>sentenceKeys.has(k)&&t.trim()).length<assetPlan.length/2,
  '문장 그림 설명 대부분은 문장을 옮겨 적은 틀이다 — 그것을 근거로 되돌리면 이 검사가 먼저 빨간불이 된다');
 const wordKeys=wordAssets.map(x=>'word-image:'+x.index);
 ok(wordKeys.filter(k=>(describe.get(k)||'').trim()).length>wordKeys.length*0.9,
  '낱말 사진 설명은 메아리가 아니라 진짜 설명이다 — 「짝」 검사(앞줄만 있으면 전부 버려도 통과)');}
eq(live.wordPictureForms+live.contextOnlyForms+live.cardOnlyForms,live.wordForms,
 '낱말 형태를 «낱말 그림 / 상황 그림만 / 그림카드만» 으로 갈라서 센다');
ok(live.wordPictureForms>0&&live.wordPictureForms<live.wordForms/2,
 '근거 있는 낱말 그림은 소수다 — 갑자기 대부분이 되면 근거 게이트가 죽은 것');
/* 🎨 2026-09-21 사장님 지시(모든 낱말에 그림) — 여기 있던 「맞는 그림이 없으면 붙이지 않는다 ·
   전부 붙었다면 게이트가 죽은 것」 단정을 버립니다. 그 검사가 지키던 것은 «근거 없는 사진을 붙이지 않는다»
   였는데, 지금은 그 자리를 «우리가 그린 낱말 그림카드» 가 채웁니다(남의 문장 사진을 빌려 오지 않습니다).
   ⛔ 느슨하게 풀지 말고 새 경계로 옮겨 적습니다 —
      ① 사진을 «낱말 그림» 이라고 부르는 줄은 여전히 근거가 있어야 하고 소수여야 한다
      ② 사진이 없는 줄은 카드로 채워진다(빈 상자 0줄)
      ③ 카드는 사진인 척하지 않는다(그 줄에는 image 가 없다) */
const seen=new Set(),pictures=new Set(),claimed={word:0,context:0,card:0};let cardExact=0;let wordPhotoRows=0;
/* 🖼 「그 교재 안에 그림 있는 예문이 있으면 그것을 예문으로 고른다」를 여기서 다시 계산해 맞춰 본다.
   ⛔ 「그림만 빌려 오기」와 다릅니다 — 예문 자체를 바꿔 그림과 예문이 언제나 짝입니다. */
const imagedText=new Set();for(const [sid,text] of sceneOwnText)if(sceneHasImage.get(sid))imagedText.add(text);
for(const entry of live.books){
 const bytes=fs.readFileSync(new URL(entry.id+'.json',dir));ok(bytes.length<350000,entry.id+' payload');ok(zlib.gzipSync(bytes).length<80000,entry.id+' gzip budget');const b=JSON.parse(bytes);eq(b.id,entry.id);eq(b.words.length,entry.words);ok(b.clips.length>0,entry.id+' has a sentence clip');
 const sentences=sourceBooks.get(b.id),owned=new Set(sentences);
 const sentenceOf=new Map();for(const t of sentences)for(const cw of contentWords(t)){if(!sentenceOf.has(cw))sentenceOf.set(cw,[]);sentenceOf.get(cw).push(t);}
 for(const w of b.words){
  seen.add(w.word);const s=b.scenes[w.scene];ok(s,'scene exists');
  /* 화면이 보여 주는 예문 = bookExample ?? 그림 문장. 둘이 같을 때 빌드가 한 번만 싣는다. */
  const shown=w.bookExample||s.text;
  eq(sentences[w.sourceIndex-1],shown,'example matches the existing course source');
  ok((shown.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).includes(w.word),'word belongs to the shown example');
  /* ⛔ 남의 교재 문장은 payload 에 실리지 않는다 — BTS 1 학생에게 SIU ADVANCE 문장이 가던 길. */
  if(s.text)ok(owned.has(s.text),'a shipped sentence belongs to this book');
  if(w.pic){
   claimed.word++;pictures.add(w.word);
   ok(s.image,'a word picture has a picture');
   ok(depicts(w.word,mediaKey.get(w.scene)),'「낱말 그림」이라고 말하려면 그 그림의 설명이 그 낱말을 가리켜야 한다: '+w.word);
  }else if(s.image){
   claimed.context++;pictures.add(w.word);
   /* 근거가 없을 때 그림은 «그 그림이 실제로 그린 그 문장» 과만 함께 나온다. */
   ok(s.text===shown,'상황 그림은 지금 보여 주는 그 예문의 그림이어야 한다: '+w.word);
   ok(!depicts(w.word,mediaKey.get(w.scene))||!w.bookExample,'근거가 있는데 낱말 그림으로 안 세었다: '+w.word);
  }else{claimed.card++;
   /* 🎨 사진이 없는 줄 — 화면이 그리는 낱말 그림카드가 붙는다. 여기서는 «사진인 척하지 않는가» 와
      «카드에 그릴 그림문자가 실제로 나오는가» 를 본다(그림문자 정본은 화면 파일 한 곳). */
   ok(s.text===shown,'그림카드 줄에서도 예문은 그 교재의 예문이다: '+w.word);
   const art=D.pictogram(w.word);
   ok(art&&art.icon&&art.icon.length>0,'그림카드에 그릴 그림문자가 반드시 나온다: '+w.word);
   /* 🎨 남은 카드 줄은 «사진을 안 만든 낱말»(고유명사)이거나 «껍데기 낱말» 뿐이다.
      ⛔ 사진이 있는데 카드로 남겨 두면 여기서 빨간불이 난다. */
   ok(!wordSceneOf.has(w.word),'사진이 있는 낱말을 카드로 남겨 두지 않는다: '+w.word);
   if(art.exact)cardExact++;}
  /* 🔁 빌드의 선택을 다시 계산해 맞춘다 — pic 은 «근거 있는 후보가 있었는가» 와 정확히 같아야 한다. */
  /* 🖼 빌드 규칙을 그대로 다시 씁니다 — ① 문장 그림에 근거가 있으면 그것 ② 없고 예문에도 그림이
     없을 때만 낱말 사진. ⛔ ②를 ① 앞으로 옮기지 마세요(🏞 예문 상황 그림이 통째로 사라집니다). */
  const byWordPhoto=!depictPool.has(w.word)&&!imagedText.has(shown)&&wordSceneOf.has(w.word);
  eq(!!w.pic,depictPool.has(w.word)||byWordPhoto,'낱말 그림 여부가 근거 재계산과 같아야 한다: '+w.word);
  if(w.pic&&depictPool.has(w.word))ok(depictPool.get(w.word).includes(w.scene),'고른 그림이 근거 있는 후보 가운데 하나다: '+w.word);
  if(byWordPhoto){wordPhotoRows++;
   eq(w.scene,wordSceneOf.get(w.word),'그 낱말의 사진을 골랐다: '+w.word);
   ok(!s.text,'낱말 사진에는 문장이 실리지 않는다(남의 교재 문장이 새는 길): '+w.word);
   ok(s.image==='/img/scene-words/'+String(w.scene).slice(1)+'.webp','낱말 사진은 우리 저장소 주소다: '+s.image);
   eq(s.imageBytes,wordSceneBytes.get(w.scene),'낱말 사진 크기가 실제 파일과 같다: '+w.word);}
  else ok(!String(w.scene).startsWith('w'),'낱말 사진은 «그림이 없던 자리» 에만 붙는다: '+b.id+' / '+w.word);
  if(s.image){ok(s.imageBytes<=80000,'picture budget');ok(/^(https:\/\/|\/img\/)/.test(s.image),'picture is https or our own asset path: '+s.image);}
  /* 🎨 빈 상자가 없다 — 사진(낱말·상황)이거나 우리가 그린 카드이거나 둘 중 하나다. */
  ok(!!s.image||!!D.pictogram(w.word).icon,'모든 낱말 줄에 그림이 붙는다: '+b.id+' / '+w.word);
  const spots=sentenceOf.get(w.word)||[];
  if(spots.some(t=>imagedText.has(t)))ok(imagedText.has(shown),'그 교재에 그림 있는 예문이 있으면 그것을 고른다: '+b.id+' / '+w.word);
 }
 for(const c of b.clips){const s=b.scenes[c.scene];eq(sentences[c.sourceIndex-1],s.text,'clip matches the selected book');ok(s.video&&s.image);ok(s.videoBytes<=900000,'clip budget');ok(s.duration>0&&s.duration<=6.2,'short clip');}
 eq(b.words.filter(w=>w.pic).length,entry.wordPictures,entry.id+' word-picture count');
 eq(b.words.filter(w=>!w.pic&&b.scenes[w.scene].image).length,entry.contextPictures,entry.id+' context-picture count');
}
eq(seen.size,live.wordForms);
eq(claimed.word,live.wordPictureRows,'manifest 의 낱말 그림 줄 수가 실제와 같다');
eq(claimed.context,live.contextPictureRows,'manifest 의 상황 그림 줄 수가 실제와 같다');
eq(claimed.card,live.cardRows,'manifest 의 그림카드 줄 수가 실제와 같다');
ok(claimed.card>0,'사진이 없는 줄은 그림카드로 채운다 — 0이면 카드 갈래가 죽은 것');
eq(cardExact,live.cardPictogramRows,'manifest 의 «뜻에 맞는 그림문자» 줄 수가 실제와 같다');
/* ⛔ 목표치가 아니라 «바닥» 입니다 — 표를 비우거나 stem 을 죽이면 여기서 먼저 빨간불이 납니다.
   숫자를 올리려고 갈래 그림문자를 exact 로 바꾸지 마세요(그게 「갈래를 뜻으로 읽게 두는」 함정입니다). */
/* 🎨 2026-09-21 — 카드 줄이 5,171 → 14 로 줄어 «카드 줄의 절반» 은 표본이 너무 작아졌습니다
   (남은 14줄은 고유명사 7 + 껍데기 낱말 7 이라 비율이 곧 반반입니다).
   ⛔ 느슨하게 풀지 말고 그 검사가 «정말 지키던 것»(그림문자 표가 살아 있는가)으로 옮겨 적습니다 —
      표를 비우거나 stem 을 죽이면 4,546 낱말 전체에서 먼저 빨간불이 납니다. */
{const exactForms=[...seen].filter(w=>D.pictogram(w).exact).length;
 ok(exactForms>seen.size*0.4,'그림문자 표가 낱말 형태의 40% 넘게를 뜻으로 맞힌다 ('+exactForms+'/'+seen.size+')');}
ok(wordPhotoRows>1000,'낱말 사진이 실제로 붙은 줄이 많다 — 0에 가까우면 배선이 죽은 것 ('+wordPhotoRows+')');
ok(claimed.card<claimed.word/100,'그림문자 카드로 남은 줄은 이제 아주 적다 ('+claimed.card+'/'+claimed.word+')');
ok(claimed.word>0&&claimed.word<claimed.word+claimed.context+claimed.card,'근거 있는 낱말 그림은 여전히 소수다');
eq(pictures.size,live.wordPictureForms+live.contextOnlyForms,'사진이 붙은 낱말 형태 수');
eq(seen.size-pictures.size,live.cardOnlyForms,'나머지 낱말 형태는 모두 그림카드를 받는다');
/* 🔤 그림문자는 단일 코드포인트만 — Unicode 13 이상은 Win10 에서 두부(□)가 되고 ZWJ 조합은 쪼개집니다.
   ⚠️ U+1FA70 위쪽은 대부분 Unicode 13+ 라 통째로 막고, 12.0 인 🩺(1FA7A)·🪁(1FA81) 둘만 엽니다. */
const icons=[...new Set(Object.values(D.PICTO))];
ok(icons.length>60,'그림문자 표가 비어 있지 않다 ('+icons.length+')');
for(const icon of icons){
 const points=[...icon];
 ok(points.length<=2&&(points.length===1||points[1]==='\uFE0F'),'그림문자는 단일 코드포인트다: '+JSON.stringify(icon));
 ok(!icon.includes('\u200d'),'ZWJ 조합 그림문자를 쓰지 않는다: '+JSON.stringify(icon));
 const cp=points[0].codePointAt(0);
 ok(cp<0x1FA70||cp===0x1FA7A||cp===0x1FA81,'Unicode 13 이상 이모지를 쓰지 않는다: '+JSON.stringify(icon)+' U+'+cp.toString(16));
}
ok(D.pictogram('rice').exact&&D.pictogram('books').exact&&D.pictogram('grandmother').exact,'변형형도 기본형으로 되돌려 찾는다');
ok(!D.pictogram('zzqwx').exact&&D.pictogram('zzqwx').icon,'모르는 낱말도 카드는 나온다 — 다만 «뜻에 맞는 그림» 이라고 말하지 않는다');
console.log('PASS scene curriculum: '+checks+' assertions (그림 근거 게이트, 예문 출처, payload budgets, grading, request races, cancellation, media fallback; 브라우저·레이아웃 검사는 없음)');
