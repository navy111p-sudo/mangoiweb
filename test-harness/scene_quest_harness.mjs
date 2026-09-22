import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const D=require('../cloudflare-deploy/public/js/scene-quest-data.js');
let checks=0;
function ok(value,msg){assert.ok(value,msg);checks++;}
function eq(a,b,msg){assert.deepEqual(a,b,msg);checks++;}
for(const s of D.scenes){for(let level=0;level<3;level++){
  for(const answer of s.answers[level]) eq(D.check('  '+answer.toUpperCase()+'! ',s,level),'correct',s.id+' variants');
  eq(D.check('',s,level),'empty');eq(D.check('I do not know',s,level),'wrong');
  eq(D.check('not '+s.answers[level][0],s,level),'wrong');
  eq(D.check('<script>alert(1)</script>',s,level),'wrong');
}}
const astronaut=D.scenes.find(s=>s.id==='space');
eq(D.check('astronau',astronaut,0),'close');
eq(D.check('The astronaut is waving.',astronaut,1),'correct','full correct sentence is accepted for phrase task');
eq(D.check("He’s waving.",astronaut,2),'correct');
eq(D.check('The astronaut is not waving.',astronaut,2),'wrong');
for(const world of ['all','adventure','everyday','nature'])for(let level=0;level<3;level++){
 const deck=D.deck(world,level,()=>.5);eq(deck.length,5);eq(new Set(deck.slice(0,4).map(r=>r.scene.id)).size,4);
 ok(deck[4].boss);eq(deck[4].level,Math.min(2,level+1));ok(world==='all'||deck.every(r=>r.scene.world===world));
}
// Execute the actual event handlers against a small DOM adapter. This is NOT browser/layout QA.
class El{
 constructor(){this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.innerHTML='';this.attrs={};this.handlers={};this.children=[];this.paused=true;this.currentTime=0;this.classes=new Set();this.classList={add:(...c)=>c.forEach(x=>this.classes.add(x)),remove:(...c)=>c.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x)};}
 addEventListener(n,f){(this.handlers[n]??=[]).push(f);}
 dispatch(n,extra={}){for(const f of this.handlers[n]||[])f.call(this,{preventDefault(){},...extra});}
 focus(){} setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]||null;}removeAttribute(k){delete this.attrs[k];}
 get src(){return this.attrs.src||'';}set src(v){this.attrs.src=v;}
 pause(){this.paused=true;}load(){}play(){this.paused=false;return Promise.resolve();}
 replaceChildren(){this.children=[];}append(...els){this.children.push(...els);}getClientRects(){return [{}];}
}
function game(){
 const html=fs.readFileSync(new URL('../cloudflare-deploy/public/student-game-scene-quest.html',import.meta.url),'utf8');
 const els=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new El()]));
 els.world.value='adventure';els.level.value='0';els.style.value='practice';
 const events={},posted=[],timers=[];let now=0,copied='';
 const document={documentElement:{},hidden:false,getElementById:id=>els[id],querySelectorAll:()=>[],createElement:()=>new El(),addEventListener:(n,f)=>events[n]=f};
 const window={MangoiSceneQuest:{...D,deck:(w,l)=>D.deck(w,l,()=>.999)},parent:{postMessage:(m,o)=>posted.push({m,o})},addEventListener(){},speechSynthesis:{cancel(){},speak(){}}};
 const ctx={window,document,location:{origin:'https://mangoi.test'},localStorage:{getItem(){return null;}},navigator:{clipboard:{writeText:async s=>{copied=s;}}},performance:{now:()=>now},setInterval:f=>timers.push(f),SpeechSynthesisUtterance:function(){},MutationObserver:function(){}};
 vm.runInNewContext(fs.readFileSync(new URL('../cloudflare-deploy/public/js/scene-quest.js',import.meta.url),'utf8'),ctx);
 return {els,posted,events,document,click:id=>els[id].dispatch('click'),answer:s=>{els.answer.value=s;els['answer-form'].dispatch('submit');},tick:seconds=>{now+=seconds*1000;timers.forEach(f=>f());},copied:()=>copied};
}
const g=game();g.click('start');eq(g.els['scene-title'].textContent,'우주 정거장');
g.answer('');eq(g.els.score.textContent,0);ok(!g.els.answer.disabled);
g.answer('astronau');eq(g.els.score.textContent,0);ok(g.els.feedback.textContent.includes('철자'));
g.answer('ASTRONAUT!');eq(g.els.score.textContent,50);ok(g.els.answer.disabled);
g.answer('astronaut');eq(g.els.score.textContent,50,'double submission cannot award twice');
g.click('next');g.click('hint');g.answer('wand');eq(g.els.score.textContent,100);
g.click('next');g.click('reveal');g.answer('monkey');eq(g.els.score.textContent,100,'revealed answer has no score');
g.click('next');g.answer('diver');eq(g.els.score.textContent,160);
g.click('next');g.answer('astronaut');ok(!g.els.answer.disabled,'boss requires phrase');g.answer('waving');g.click('next');
eq(g.posted.length,1);eq(g.posted[0].m.game,'scenequest');eq(g.posted[0].o,'https://mangoi.test');ok(!g.els.result.hidden);eq(g.els['review-count'].textContent,4);
g.click('next');eq(g.posted.length,1,'result cannot post completion twice');g.click('copy');await Promise.resolve();ok(g.copied().includes('astronaut'));ok(!g.copied().includes('astronau\n'));
g.click('review');g.answer('astronaut');g.click('next');g.answer('wand');g.click('next');g.answer('monkey');g.click('next');g.answer('waving');g.click('next');eq(g.posted.length,1,'review has no second hub reward');
const timed=game();timed.els.style.value='challenge';timed.click('start');timed.tick(10);ok(timed.els.timer.textContent.includes('35'));
timed.click('pause');timed.tick(50);ok(timed.els.timer.textContent.includes('35'));timed.answer('astronaut');eq(timed.els.score.textContent,0);
timed.click('resume');timed.tick(36);ok(timed.els.timer.textContent.includes('계속'));timed.answer('astronaut');ok(timed.els.answer.disabled,'timeout does not prevent learning');
const hidden=game();hidden.click('start');hidden.document.hidden=true;hidden.events.visibilitychange();ok(!hidden.els.paused.hidden);
const media=game();media.click('start');media.click('watch');media.click('pause');await new Promise(setImmediate);ok(media.els.video.paused,'late play resolution cannot resume paused game');
const fail=game();fail.click('start');fail.els.video.play=()=>Promise.reject(Error('offline'));fail.click('watch');await new Promise(setImmediate);ok(fail.els.video.hidden);ok(!fail.els.poster.hidden);ok(fail.els['media-msg'].textContent.includes('재생할 수 없어'));
const replay=game();replay.click('start');let oldPlay;replay.els.video.play=function(){this.paused=false;return new Promise(resolve=>{oldPlay=resolve;});};replay.click('watch');replay.els.video.play=function(){this.paused=false;return Promise.resolve();};replay.click('watch');await new Promise(setImmediate);oldPlay();await new Promise(setImmediate);ok(!replay.els.video.paused,'stale play callback cannot pause a newer explicit replay');
// 건너뛰기 — 못 맞혀도 나갈 길이 있어야 합니다.
// «넘어간다» 옆에 «공짜로 통과하지 않는다»·«맞히는 길은 그대로다» 를 짝으로 둡니다.
const sk=game();sk.click('start');
ok(!sk.els.skip.hidden,'skip button is offered before answering');
ok(sk.els.next.hidden,'next is not available before the round ends');
sk.click('skip');
ok(!sk.els.next.hidden,'skipping opens the way to the next scene');
eq(sk.els.score.textContent,0,'skipping earns no points');
ok(sk.els.answer.disabled&&sk.els.skip.hidden,'a skipped round is closed');
ok(!sk.els['hint-box'].hidden&&sk.els['hint-box'].textContent.includes('astronaut'),'the answer is still taught after skipping');
ok(!sk.els.listen.hidden,'the answer can still be heard after skipping');
ok(sk.els.feedback.textContent.includes('넘어갔'),'the screen says it was skipped, not solved');
ok(!sk.els.gate.classes.has('unlocked'),'skipping does not unlock the treasure gate');
sk.answer('astronaut');eq(sk.els.score.textContent,0,'a late correct answer cannot re-award a skipped round');
sk.click('skip');eq(sk.els.score.textContent,0,'double skip changes nothing');
// ⚠️ 위 한 줄은 «점수» 를 보는데 건너뛰기는 애초에 점수를 안 줘 원리상 안 움직입니다.
//    재진입 가드를 죽이면 «기록이 두 번 실리는» 것이 진짜 피해라 그것을 아래에서 셉니다.
sk.click('next');ok(sk.els['scene-title'].textContent!=='우주 정거장','the next scene actually loads');
ok(!sk.els.skip.hidden&&!sk.els.answer.disabled,'the new round is answerable again');
sk.answer('wand');ok(Number(sk.els.score.textContent)>0,'earning points by answering still works');
ok(sk.els.gate.classes.has('unlocked'),'a correct answer still unlocks the gate');
// 같은 장면을 두 번 건너뛰어도 기록은 한 번이어야 합니다 — 재진입 가드(passed)가 그것을 지킵니다.
// ⚠️ 이 시나리오가 «끝까지» 가야 결과 목록이 그려집니다. 중간에서 멈추면 그 검사가 원리상 안 닿습니다.
const dup=game();dup.click('start');dup.click('skip');dup.click('skip');dup.click('next');
for(let i=0;i<4;i++){dup.click('skip');dup.click('next');}
eq(dup.els['review-list'].children.length,5,'a scene cannot be recorded twice (re-entry guard)');
dup.click('copy');await Promise.resolve();
eq(dup.copied().split('\n').filter(l=>/^\d+\. /.test(l)).length,5,'the teacher summary lists each scene once');
const pausedSkip=game();pausedSkip.click('start');pausedSkip.click('pause');pausedSkip.click('skip');
ok(pausedSkip.els.next.hidden&&!pausedSkip.els.answer.disabled,'skipping does nothing while the game is paused');
const allSkip=game();allSkip.click('start');
for(let i=0;i<5;i++){allSkip.click('skip');allSkip.click('next');}
ok(!allSkip.els.result.hidden,'skipping every scene still reaches the results');
eq(allSkip.els['total-score'].textContent,0,'skipping everything scores nothing');
eq(allSkip.els['review-count'].textContent,5,'every skipped scene goes to review');
eq(allSkip.els['review-list'].children.length,5,'a scene cannot be recorded twice (re-entry guard)');
ok(allSkip.els['review-list'].children.some(r=>r.children.some(c=>c.textContent.includes('넘어감'))),'results say «skipped» rather than folding it into «review»');
allSkip.click('copy');await Promise.resolve();ok(allSkip.copied().includes('[넘어감]'),'the teacher summary marks skipped rounds');
eq(allSkip.copied().split('\n').filter(l=>/^\d+\. /.test(l)).length,5,'the teacher summary lists each scene once');
// 하나도 스스로 못 쓴 채 끝났는데 「보물문이 열렸어요!」라고 하면 화면이 거짓말을 합니다.
eq(allSkip.els['result-title'].textContent,'끝까지 왔어요!','the title does not claim the gate opened when nothing was solved');
eq(allSkip.els['result-title'].getAttribute('data-ko'),'끝까지 왔어요!','data-ko is updated too, so switching language does not restore the old title');
eq(allSkip.els['result-title'].getAttribute('data-en'),'You made it to the end!','data-en too — otherwise the English screen restores the false celebration');
ok((allSkip.els['result-copy'].getAttribute('data-en')||'').includes('skipped'),'the closing copy carries an English value as well');
ok(allSkip.els['result-copy'].textContent.includes('넘어갔'),'the closing copy says what actually happened');
// 짝 — 한 장면이라도 스스로 풀었으면 예전 축하 문구 그대로여야 합니다.
const mix=game();mix.click('start');mix.answer('astronaut');mix.click('next');
for(let i=0;i<4;i++){mix.click('skip');mix.click('next');}
eq(mix.els['result-title'].textContent,'보물문이 열렸어요!','solving even one scene keeps the original celebration');
ok(mix.els['result-copy'].textContent.includes('탐험했어요'),'the original closing copy is kept');
console.log('PASS scene quest: '+checks+' assertions (grading, learning flow, rewards, pause, media failure; no browser/layout test)');
