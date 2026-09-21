import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
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
const manifest={wordForms:4546,wordPictureForms:228,contextOnlyForms:4040,noPictureForms:278,clips:43,books:[{id:'bts-01',series:'bts',label:'BTS 1',title:'School'},{id:'bts-02',series:'bts',label:'BTS 2',title:'Colors'},{id:'bts-03',series:'bts',label:'BTS 3',title:'Kinds'},{id:'siu-basic-01',series:'siu-basic',label:'SIU Basic 1',title:'Talk'}]};
const one={id:'bts-01',label:'BTS 1',words:[{word:'apple',scene:'a',bookExample:'An apple is red.'},{word:'pencil',scene:'p',bookExample:'This is a pencil.'}],clips:[{scene:'v'}],scenes:{a:{text:'An apple is red.',source:'BTS 1 · #1',image:'https://images.example.test/apple.webp'},p:{text:'This is a pencil.',source:'BTS 1 · #2',image:'https://images.example.test/pencil.webp'},v:{text:'He kicks the ball.',source:'BTS 1 · #3',image:'https://images.example.test/ball.webp',video:'https://images.example.test/ball.mp4'}}};
const two={id:'bts-02',label:'BTS 2',words:[{word:'green',scene:'g',bookExample:'The balloon is green.'}],clips:[],scenes:{g:{text:'The balloon is green.',source:'BTS 2 · #1',image:'https://images.example.test/green.webp'}}};
const flush=()=>new Promise(setImmediate);
async function ready(){const a=app();eq(a.requests.length,0,'no curriculum data loaded before the user opens it');a.click('open');await flush();eq(a.requests.length,1);a.respond('manifest.json',manifest);await flush();eq(a.requests.length,2,'fetch only one selected book');a.respond('bts-01.json',one);await flush();return a;}
const a=await ready();ok(!a.els['cq-card'].hidden);eq(a.els['cq-target'].textContent,'apple');eq(a.els['cq-video'].src,'','no eager video load');eq(a.els['cq-items'].children.length,2);
a.click('quiz');a.answer('wrong');ok(!a.els['cq-answer'].disabled);a.answer('APPLE!');ok(a.els['cq-answer'].disabled);const points=a.els['cq-count'].textContent;a.answer('apple');eq(a.els['cq-count'].textContent,points,'double submit does not award again');a.click('next');a.click('reveal');a.answer('pencil');a.click('next');ok(!a.els['cq-result'].hidden);eq(a.posted.length,1);a.click('next');eq(a.posted.length,1,'completion is idempotent');
a.els['cq-result'].children.find(x=>x.tag==='button').dispatch('click');a.answer('apple');a.click('next');a.answer('pencil');a.click('next');eq(a.posted.length,1,'review does not post a second completion');
const media=await ready();media.change('mode','videos');eq(media.requests.length,2,'mode switch reuses the selected book');eq(media.els['cq-video'].src,'');media.click('watch');await flush();ok(media.els['cq-video'].src.endsWith('.mp4'));media.document.hidden=true;media.events.visibilitychange();ok(media.els['cq-video'].paused);eq(media.els['cq-video'].src,'','hidden page releases the video source');
media.document.hidden=false;media.click('watch');media.click('close');await flush();ok(media.els['cq-video'].paused);eq(media.els['cq-video'].src,'');ok(media.els.curriculum.hidden);
const stalled=await ready();stalled.change('mode','videos');let resolvePlay;stalled.els['cq-video'].play=()=>new Promise(resolve=>{resolvePlay=resolve;});stalled.click('watch');for(const timer of [...stalled.timers.values()])if(timer.ms===15000)timer.fn();ok(stalled.els['cq-video'].hidden,'stalled clip falls back to the picture');ok(!stalled.els['cq-watch'].disabled,'stalled clip can be retried');eq(stalled.els['cq-video'].src,'');resolvePlay();await flush();ok(stalled.els['cq-video'].hidden,'late play cannot reopen the timed-out clip');
const offline=await ready();offline.change('mode','videos');offline.els['cq-video'].play=()=>Promise.reject(Error('offline'));offline.click('watch');await flush();ok(offline.els['cq-video'].hidden);ok(offline.els['cq-media-status'].textContent.includes('재생하지 못'));
offline.change('mode','words');offline.els['cq-image'].dispatch('error');ok(!offline.els['cq-retry-image'].hidden);offline.click('quiz');offline.answer('apple');ok(offline.els['cq-answer'].disabled,'image failure does not block learning');
const race=await ready();race.change('book','bts-02');await flush();const old=race.requests.at(-1);race.change('book','bts-01');await flush();ok(old.aborted);eq(race.els['cq-target'].textContent,'apple');old.resolve({ok:true,json:async()=>two});await flush();eq(race.els['cq-target'].textContent,'apple','late response cannot replace the latest selected book');
race.change('book','bts-02');await flush();for(const timer of [...race.timers.values()])if(timer.ms===15000)timer.fn();await flush();ok(!race.els['cq-retry'].hidden,'timeout exposes a retry button');race.click('retry');await flush();race.respond('bts-02.json',two);await flush();eq(race.els['cq-target'].textContent,'green');
ok(!/speech-data-(?:bts|siu)/.test(html),'page never eagerly loads all three curricula');
ok(/id="cq-video"[^>]*preload="none"/.test(html));ok(!/id="cq-video"[^>]*autoplay/.test(html));

/* ═══ 2026-09-21 · 그림이 무엇을 보여 주는지 화면이 사실대로 말하는가 ═══════════════
   사장님 지적: 「nice(좋은·멋진)」 카드에 「Your backpack looks nice.」 의 가방 사진이 붙었다.
   ⛔ 세 상태를 한 문구로 뭉치지 마세요 — 그러면 «근거 있는 그림» 과 «그냥 붙인 그림» 이 같은 말이 됩니다.
   ⚠️ 「낱말 그림이라고 말한다」만 검사하면 «전부 낱말 그림» 도 통과합니다 → 세 상태를 짝으로 봅니다. */
const kinds={id:'bts-03',label:'BTS 3',words:[
  {word:'desk',scene:'d',sourceIndex:1,bookExample:'This is my desk.',pic:1},
  {word:'nice',scene:'n',sourceIndex:2},
  {word:'kind',scene:'k',sourceIndex:3},
  {word:'ball',scene:'b',sourceIndex:4,bookExample:'I have a ball.',pic:1}],
 clips:[],
 scenes:{d:{source:'SIU Basic 4 · #12',image:'https://images.example.test/desk.webp'},
   n:{text:'Nice to meet you.',source:'BTS 3 · #2',image:'https://images.example.test/greet.webp'},
   k:{text:'She is so kind!',source:'BTS 3 · #3'},
   b:{text:'He kicks the ball.',source:'BTS 3 · #7',image:'https://images.example.test/ball.webp'}}};
async function kindsApp(){const a=await ready();a.change('book','bts-03');await flush();a.respond('bts-03.json',kinds);await flush();return a;}
const k=await kindsApp();
eq(k.els['cq-target'].textContent,'desk');
ok(k.els['cq-source'].textContent.includes('낱말 그림'),'근거가 있는 그림은 「낱말 그림」이라고 말한다');
ok(k.els['cq-source'].textContent.includes('desk'),'무엇을 근거로 그렇게 말하는지 밝힌다');
eq(k.els['cq-book-example'].textContent,'','그림 문장이 payload 에 없으면 남의 교재 문장이 샐 자리도 없다');
eq(k.els['cq-example'].children.map(c=>c.textContent).join(''),'This is my desk.','예문은 그 교재의 예문이다');
ok(k.els['cq-example'].children.some(c=>c.tag==='mark'&&c.textContent==='desk'),'예문에서 배울 낱말을 표시한다');
k.click('next');
eq(k.els['cq-target'].textContent,'nice');
ok(k.els['cq-source'].textContent.includes('상황 그림'),'근거가 없으면 「상황 그림」이라고 말한다');
ok(k.els['cq-source'].textContent.includes('낱말 뜻 그림은 아니에요'),'낱말 뜻 그림이 아니라고 분명히 말한다');
ok(!k.els['cq-source'].textContent.includes('낱말 그림 ·'),'상황 그림을 낱말 그림이라고 부르지 않는다');
eq(k.els['cq-example'].children.map(c=>c.textContent).join(''),'Nice to meet you.','상황 그림은 그 그림이 그린 그 예문과 함께 나온다');
k.click('next');
eq(k.els['cq-target'].textContent,'kind');
ok(k.els['cq-source'].textContent.includes('붙이지 않았어요'),'맞는 그림이 없으면 그렇게 말한다');
ok(k.els['cq-image'].hidden&&!k.els['cq-image'].getAttribute('src'),'맞는 그림이 없으면 아무 그림도 붙이지 않는다');
ok(k.els['cq-placeholder'].textContent.includes('그림이 없어'),'왜 비었는지 화면이 말한다');
k.click('next');
eq(k.els['cq-target'].textContent,'ball');
/* 🔴 그림이 «다른 문장» 에서 왔을 때: 예문은 교재 예문이고, 그림 문장은 따로 밝힌다.
   ⛔ 둘을 바꿔 쓰면 학생이 자기 교재에 없는 문장을 예문으로 외웁니다(옛 화면이 그랬습니다). */
eq(k.els['cq-example'].children.map(c=>c.textContent).join(''),'I have a ball.','예문은 언제나 그 교재의 예문이다');
ok(k.els['cq-book-example'].textContent.includes('그림 속 문장')&&k.els['cq-book-example'].textContent.includes('He kicks the ball.'),'그림이 다른 문장에서 왔다는 사실을 감추지 않는다');
/* 🗣 뜻 — 사전을 지어내지 않고 학생 화면이 이미 쓰는 /api/translate mode:'learn' 에 예문째로 묻는다. */
const m=await kindsApp();m.click('next');
const before=m.requests.length;m.click('mean');await flush();
eq(m.requests.length,before+1,'「뜻 보기」를 눌러야 물어본다');
const ask=m.requests.at(-1);ok(ask.url.endsWith('/api/translate'),'뜻은 기존 번역 경로에 묻는다');
ok(ask.options.body.includes('"mode":"learn"'),'직역(m2m100)이 아니라 학생용 의역으로 묻는다');
ok(ask.options.body.includes('Nice to meet you.'),'낱말만이 아니라 예문째로 묻는다 — 맥락이 없으면 「Good job!」→「훌륭한 직업!」 류가 된다');
ask.done=true;ask.resolve({ok:true,json:async()=>({map:{'Nice to meet you.':'만나서 반가워요.'}})});await flush();
ok(m.els['cq-meaning'].textContent.includes('만나서 반가워요.'),'받아온 뜻을 보여 준다');
m.click('mean');await flush();eq(m.requests.length,before+1,'같은 예문은 다시 묻지 않는다');
m.click('next');eq(m.els['cq-meaning'].textContent,'','카드를 넘기면 앞 카드의 뜻이 남지 않는다');
/* 늦게 도착한 답이 다음 카드에 얹히지 않는가 — 화면이 「kind」 자리에서 「nice」 의 뜻을 말하면 안 된다. */
const late=await kindsApp();late.click('next');late.click('mean');await flush();
const slow=late.requests.at(-1);late.click('next');
slow.done=true;slow.resolve({ok:true,json:async()=>({map:{'Nice to meet you.':'만나서 반가워요.'}})});await flush();
eq(late.els['cq-meaning'].textContent,'','늦게 온 뜻은 이미 넘긴 카드의 것이라 버린다');
const fail=await kindsApp();const n0=fail.requests.length;fail.click('mean');await flush();
const bad=fail.requests.at(-1);bad.done=true;bad.resolve({ok:false,status:500,json:async()=>({})});await flush();
ok(fail.els['cq-meaning'].textContent.includes('불러오지 못했어요'),'못 불러오면 솔직히 말한다');
ok(!fail.els['cq-mean'].disabled,'실패해도 다시 눌러 볼 수 있다');
const quizzed=await kindsApp();quizzed.click('quiz');
ok(quizzed.els['cq-mean'].hidden,'퀴즈 중에는 뜻 버튼을 숨긴다(발음 듣기와 같은 규칙)');
console.log('PASS UI checks',checks);
