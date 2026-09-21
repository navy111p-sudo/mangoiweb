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
const manifest={imageWordForms:4500,clips:43,books:[{id:'bts-01',series:'bts',label:'BTS 1',title:'School'},{id:'bts-02',series:'bts',label:'BTS 2',title:'Colors'},{id:'siu-basic-01',series:'siu-basic',label:'SIU Basic 1',title:'Talk'}]};
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
eq(live.books.length,85);ok(live.wordForms>4400);ok(live.imageWordForms/live.wordForms>=.97,'at least 97% of word forms have a verified picture');ok(live.clips>=40);
const sourceBooks=new Map();
for(const [series,file,name] of [['bts','speech-data-bts.js','BTS_SENTENCES'],['siu-basic','speech-data-siu-basic.js','SIU_BASIC_SENTENCES'],['siu-advance','speech-data-siu-advance.js','SIU_ADVANCE_SENTENCES']]){
 const code=fs.readFileSync(new URL('js/'+file,root),'utf8');const actual=JSON.parse(vm.runInNewContext(code+'\nJSON.stringify('+name+')'));
 Object.values(actual).forEach((b,i)=>sourceBooks.set(series+'-'+String(i+1).padStart(2,'0'),b.sentences));
}
const seen=new Set(),pictures=new Set();
for(const entry of live.books){
 const bytes=fs.readFileSync(new URL(entry.id+'.json',dir));ok(bytes.length<350000,entry.id+' payload');ok(zlib.gzipSync(bytes).length<80000,entry.id+' gzip budget');const b=JSON.parse(bytes);eq(b.id,entry.id);eq(b.words.length,entry.words);ok(b.clips.length>0,entry.id+' has a sentence clip');
 for(const w of b.words){eq(sourceBooks.get(b.id)[w.sourceIndex-1],w.bookExample,'example matches the existing course source');seen.add(w.word);const s=b.scenes[w.scene];ok(s,'scene exists');ok((s.text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).includes(w.word),'example contains target');ok((w.bookExample.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[]).includes(w.word),'word belongs to selected book');if(s.image){pictures.add(w.word);ok(s.imageBytes<=80000,'picture budget');ok(/^https:\/\//.test(s.image),'HTTPS image');}}
 for(const c of b.clips){const s=b.scenes[c.scene];eq(sourceBooks.get(b.id)[c.sourceIndex-1],s.text,'clip matches the selected book');ok(s.video&&s.image);ok(s.videoBytes<=900000,'clip budget');ok(s.duration>0&&s.duration<=6.2,'short clip');}
}
eq(seen.size,live.wordForms);eq(pictures.size,live.imageWordForms);
console.log('PASS scene curriculum: '+checks+' assertions (book coverage, payload budgets, grading, request races, cancellation and media fallback; no browser/layout test)');
