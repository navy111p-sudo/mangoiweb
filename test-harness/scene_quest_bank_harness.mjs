// 🖼 Scene Quest 사진 문제 은행 — 이미 가진 실사 사진으로 만든 문제가 «실제로 풀리고» «영상 없이도 돈다» 를 본다.
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const D=require('../cloudflare-deploy/public/js/scene-quest-data.js');
const B=require('../cloudflare-deploy/public/js/scene-quest-bank.js');
let pass=0,fail=0;
const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('❌ '+m);}};
const pub=new URL('../cloudflare-deploy/public/',import.meta.url);
const photo=D.scenes.filter(s=>/^c\d+$/.test(s.id));
ok(B.length>=400,'은행 문제 수가 400 이상 ('+B.length+')');
ok(photo.length===B.length,'은행이 전부 scenes 로 들어갔다');
ok(D.scenes.filter(s=>!/^c\d+$/.test(s.id)).length===12,'원래 12장면은 그대로');
ok(new Set(D.scenes.map(s=>s.id)).size===D.scenes.length,'id 중복 없음');
for(const band of ['bts','siu-basic','siu-advance']){
  const n=photo.filter(s=>s.world===band).length;ok(n>=4,band+' 문제가 4개 이상 ('+n+')');
  for(let level=0;level<3;level++){const d=D.deck(band,level,()=>.3);ok(d.length===5&&d.every(r=>r.scene.world===band),band+' deck');}
}
let bad=0;
for(const s of photo){
  ok(s.video===null,s.id+' 영상 없음(null)');
  ok(fs.existsSync(new URL(s.poster.slice(1),pub)),s.id+' 사진 파일 존재');
  for(let level=0;level<3;level++){
    if(D.check(s.answers[level][0],s,level)!=='correct'){bad++;console.log('❌ 모범답 오답 판정',s.id,level);}
    if(D.check('not '+s.answers[level][0],s,level)==='correct')bad++;
  }
  ok(/\.$/.test(s.answers[2][0])&&/^[A-Z]/.test(s.answers[2][0]),s.id+' 모범 문장 모양');
  ok(D.check(s.answers[2][0].toLowerCase().replace(/\.$/,''),s,1)==='correct',s.id+' 구문 문제에 문장도 받는다');
  const w=s.answers[0][0].replace(/^(a|an|the) /,'').slice(0,4).toLowerCase();
  ok(w.length<4||!s.clueEn.toLowerCase().includes(w),s.id+' 단서가 정답을 흘리지 않음');
}
ok(bad===0,'모든 은행 모범답이 정답·부정문은 오답 ('+bad+')');
// 짝: 원래 장면은 영상이 있다
ok(D.scenes.find(s=>s.id==='space').video.endsWith('.mp4'),'원래 장면은 영상 그대로');
// 화면 배선 — 사진 문제면 «영상 보기» 가 감춰지고, 영상 장면이면 보인다 (가짜 DOM 으로 실제 실행)
const html=fs.readFileSync(new URL('student-game-scene-quest.html',pub),'utf8');
ok(html.indexOf('scene-quest-bank.js')>0&&html.indexOf('scene-quest-bank.js')<html.indexOf('scene-quest-data.js'),'은행 파일이 데이터보다 먼저 실린다');
for(const band of ['bts','siu-basic','siu-advance'])ok(html.includes('<option value="'+band+'"'),'세계 선택에 '+band);
class El{constructor(){this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.innerHTML='';this.attrs={};this.handlers={};this.classList={add(){},remove(){},contains(){return false;}};}
 addEventListener(n,f){(this.handlers[n]??=[]).push(f);}dispatch(n){for(const f of this.handlers[n]||[])f.call(this,{preventDefault(){}});}
 focus(){}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get src(){return this.attrs.src||'';}set src(v){this.attrs.src=v;}pause(){}load(){}play(){this.played=true;return Promise.resolve();}replaceChildren(){}append(){}}
function run(world){
  const els=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new El()]));
  els.world.value=world;els.level.value='0';els.style.value='practice';
  const ctx={window:{MangoiSceneQuest:{...D,deck:(w,l)=>D.deck(w,l,()=>.5)},parent:null,addEventListener(){},speechSynthesis:{cancel(){},speak(){}}},
    document:{documentElement:{},hidden:false,getElementById:id=>els[id],querySelectorAll:()=>[],createElement:()=>new El(),addEventListener(){}},
    location:{origin:'x'},localStorage:{getItem(){return null;}},navigator:{},performance:{now:()=>0},setInterval(){},MutationObserver:function(){}};
  ctx.window.parent=ctx.window;
  try{vm.runInNewContext(fs.readFileSync(new URL('js/scene-quest.js',pub),'utf8'),ctx);els.start.dispatch('click');}catch(e){ok(false,'실행 실패 '+e.message);}
  return els;
}
const p=run('bts');
ok(p.watch.hidden===true&&p.still.hidden===true,'사진 문제면 «영상 보기» 감춤');
ok(p['media-tag'].textContent==='실사 사진','사진 문제 표시 «실사 사진»');
ok(/^\/img\/scene-clips\/\d+\.webp$/.test(p.poster.src),'사진이 걸린다 ('+p.poster.src+')');
p.watch.dispatch('click');ok(!p.video.played&&!p.video.src,'사진 문제에서 영상 재생을 시도하지 않는다');
const v=run('adventure');
ok(v.watch.hidden===false,'영상 장면이면 «영상 보기» 가 보인다(짝)');
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
