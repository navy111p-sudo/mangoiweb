// 🖼 Scene Quest 사진 문제 은행 — 이미 가진 실사 사진으로 만든 문제가 «실제로 풀리고» «영상 없이도 돈다» 를 본다.
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const D=require('../cloudflare-deploy/public/js/scene-quest-data.js');
const BANDS=['bts','siu-basic','siu-advance'];
const PARTS=Object.fromEntries(BANDS.map(b=>[b,require('../cloudflare-deploy/public/js/scene-quest-bank-'+b+'.js')]));
const B=BANDS.flatMap(b=>PARTS[b]);
let pass=0,fail=0;
const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('❌ '+m);}};
const pub=new URL('../cloudflare-deploy/public/',import.meta.url);
const photo=D.scenes.filter(s=>/^[cw]\d+$/.test(s.id));
for(const b of BANDS)ok(PARTS[b].length>0&&PARTS[b].every(x=>x.band===b),b+' 파일에는 그 수준 문제만 ('+PARTS[b].length+')');
ok(B.length>=400,'은행 문제 수가 400 이상 ('+B.length+')');
ok(photo.length===B.length,'은행이 전부 scenes 로 들어갔다');
ok(photo.some(s=>s.id[0]==='w'&&s.poster.startsWith('/img/scene-words/'))&&photo.some(s=>s.id[0]==='c'&&s.poster.startsWith('/img/scene-clips/')),'행동 장면 사진·낱말 사진 두 갈래가 다 들어 있다');
for(const band of ['siu-basic','siu-advance']){const n=photo.filter(s=>s.world===band).length;ok(n>=200,band+' 문제가 200 이상 ('+n+')');}
ok(D.scenes.filter(s=>!/^[cw]\d+$/.test(s.id)).length===12,'원래 12장면은 그대로');
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
// 📦 수준별 파일 — 주소는 <template id="sq-banks"> 에만 있고(실행·다운로드 안 됨), 처음 열 때는 아무것도 안 받는다
const tplM=/<template id="sq-banks">([\s\S]*?)<\/template>/.exec(html);
ok(!!tplM,'수준별 주소 목록 <template id="sq-banks"> 가 있다');
const tplUrls={};for(const m of (tplM?tplM[1]:'').matchAll(/<script src="([^"]+)" data-band="([^"]+)"><\/script>/g))tplUrls[m[2]]=m[1];
for(const b of BANDS)ok(/^\/js\/scene-quest-bank-[a-z-]+\.js\?v=\d+$/.test(tplUrls[b]||'')&&tplUrls[b].includes('bank-'+b+'.js'),b+' 주소가 ?v= 와 함께 적혀 있다 ('+tplUrls[b]+')');
const outside=html.replace(/<template id="sq-banks">[\s\S]*?<\/template>/,'');
ok(!/scene-quest-bank[^"]*\.js/.test(outside),'사진 문제 파일을 처음부터 싣지 않는다(템플릿 밖에 없음)');
ok(!fs.existsSync(new URL('js/scene-quest-bank.js',pub)),'옛 한 덩어리 파일은 지웠다');
const dataSrc=fs.readFileSync(new URL('js/scene-quest-data.js',pub),'utf8');
ok(!/scene-quest-bank-[a-z-]+\.js\?v=/.test(dataSrc),'주소(?v=)를 데이터 파일에 적지 않았다(정본은 HTML)');
for(const band of ['bts','siu-basic','siu-advance'])ok(html.includes('<option value="'+band+'"'),'세계 선택에 '+band);
class El{constructor(){this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.innerHTML='';this.attrs={};this.handlers={};this.classList={add(){},remove(){},contains(){return false;}};}
 addEventListener(n,f){(this.handlers[n]??=[]).push(f);}dispatch(n){for(const f of this.handlers[n]||[])f.call(this,{preventDefault(){}});}
 focus(){}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get src(){return this.attrs.src||'';}set src(v){this.attrs.src=v;}pause(){}load(){}play(){this.played=true;return Promise.resolve();}replaceChildren(){}append(){}}
function run(world,opt={}){
  const els=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new El()]));
  els.world.value=world;els.level.value='0';els.style.value='practice';
  const tplScripts=Object.entries(tplUrls).map(([band,src])=>({getAttribute:k=>k==='data-band'?band:k==='src'?src:null}));
  els['sq-banks'].content={querySelectorAll:()=>tplScripts};
  const appended=[];
  const win={parent:null,addEventListener(){},speechSynthesis:{cancel(){},speak(){}},MangoiSceneQuestBanks:{}};
  const doc={documentElement:{},hidden:false,getElementById:id=>els[id],querySelectorAll:()=>[],createElement:()=>{const e=new El();e.remove=()=>{e.removed=true;};return e;},addEventListener(){},head:{appendChild(e){appended.push(e);}}};
  const ctx={window:win,document:doc,location:{origin:'x'},localStorage:{getItem(){return null;}},navigator:{},performance:{now:()=>0},setInterval(){},MutationObserver:function(){}};
  win.parent=win;
  try{vm.runInNewContext(dataSrc,ctx);const real=win.MangoiSceneQuest;win.MangoiSceneQuest={...real,deck:(w,l)=>real.deck(w,l,()=>.5)};
    vm.runInNewContext(fs.readFileSync(new URL('js/scene-quest.js',pub),'utf8'),ctx);}catch(e){ok(false,'실행 실패 '+e.message);return {els,appended,win};}
  const deliver=(fail)=>{try{for(const e of appended.splice(0)){const band=Object.keys(tplUrls).find(b=>tplUrls[b]===e.src);if(fail)e.onerror();else{win.MangoiSceneQuestBanks[band]=PARTS[band];e.onload();}}}catch(err){ok(false,'받은 뒤 처리 중 예외: '+err.message);}};
  try{els.start.dispatch('click');if(opt.auto!==false)deliver(false);}catch(e){ok(false,'실행 실패 '+e.message);}
  return {els,appended,win,deliver,photoCount:()=>win.MangoiSceneQuest.scenes.filter(s=>/^[cw]\d+$/.test(s.id)).length};
}
// 처음에는 사진 문제 0개 — 누르기 전에는 아무 수준도 안 받는다
{const r=run('adventure');ok(r.photoCount()===0,'처음 열 때 사진 문제는 0개(받지 않음)');ok(r.appended.length===0,'그림·영상 세계는 아무 파일도 안 받는다');ok(r.els.intro.hidden===true,'그림·영상 세계는 바로 시작');}
// 초급을 고르면 초급 파일 «하나만» 받는다
{const r=run('bts',{auto:false});
 ok(r.appended.length===1&&r.appended[0].src===tplUrls.bts,'초급을 고르면 초급 파일 하나만 받는다 ('+r.appended.map(e=>e.src).join(',')+')');
 ok(r.els.start.disabled===true&&/불러오는 중/.test(r.els['start-status'].textContent),'받는 동안 버튼을 잠그고 «불러오는 중» 이라고 말한다');
 r.els.start.dispatch('click');ok(r.appended.length===1,'받는 중에 또 눌러도 두 번 받지 않는다');
 r.deliver(false);
 ok(r.els.start.disabled===false&&r.els['start-status'].textContent===''&&r.els.intro.hidden===true,'받고 나면 게임이 시작된다');
 ok(r.win.MangoiSceneQuest.scenes.filter(s=>s.world==='bts').length===PARTS.bts.length&&r.win.MangoiSceneQuest.scenes.every(s=>s.world!=='siu-basic'&&s.world!=='siu-advance'),'받은 수준만 들어 있다');
 r.els.start.dispatch('click');ok(r.appended.length===0,'이미 받은 수준은 다시 받지 않는다');
 let called='x';r.win.MangoiSceneQuest.load('bts',{},e=>{called=e;});ok(called===null&&r.appended.length===0,'이미 받은 수준을 load 하면 곧바로 성공으로 알린다(콜백을 빠뜨리지 않음)');
 let c2='x';r.win.MangoiSceneQuest.load('siu-basic',{},e=>{c2=e;});ok(!!(c2&&c2.message),'주소를 모르면 받은 척하지 않고 실패로 알린다');}
// 못 받으면 사실대로 말하고, 다시 누르면 다시 받는다(짝)
{const r=run('siu-basic',{auto:false});r.deliver(true);
 ok(/불러오지 못했어요/.test(r.els['start-status'].textContent)&&r.els.start.disabled===false,'못 받으면 «불러오지 못했어요» + 다시 누를 수 있다');
 ok(r.els.intro.hidden!==true||r.photoCount()===0,'못 받았는데 게임을 시작하지 않는다');
 r.els.start.dispatch('click');ok(r.appended.length===1&&r.appended[0].src===tplUrls['siu-basic'],'다시 누르면 다시 받으러 간다');
 r.deliver(false);ok(r.els.intro.hidden===true&&r.els['start-status'].textContent==='','두 번째에 받으면 시작된다');}
// 파일은 왔는데 내용이 비면(스크립트가 깨졌거나 가로채였을 때) 받은 척하지 않는다
{const r=run('siu-advance',{auto:false});try{r.appended.shift().onload();}catch(e){ok(false,'예외 '+e.message);}
 ok(/불러오지 못했어요/.test(r.els['start-status'].textContent)&&r.els.intro.hidden!==true,'파일은 왔는데 내용이 비면 받은 것으로 치지 않는다');}
// 깜짝 탐험(all)은 세 수준을 모두 받는다
{const r=run('all',{auto:false});ok(r.appended.length===3,'깜짝 탐험은 세 수준을 모두 받는다 ('+r.appended.length+')');
 const one=r.appended.shift();r.win.MangoiSceneQuestBanks.bts=PARTS.bts;one.onload();
 ok(r.els.start.disabled===true,'셋 중 하나만 오면 아직 시작하지 않는다');r.deliver(false);ok(r.els.intro.hidden===true,'셋 다 오면 시작');}
const p=run('bts').els;
ok(p.watch.hidden===true&&p.still.hidden===true,'사진 문제면 «영상 보기» 감춤');
ok(p['media-tag'].textContent==='실사 사진','사진 문제 표시 «실사 사진»');
ok(/^\/img\/scene-(clips|words)\/\d+\.webp$/.test(p.poster.src),'사진이 걸린다 ('+p.poster.src+')');
p.watch.dispatch('click');ok(!p.video.played&&!p.video.src,'사진 문제에서 영상 재생을 시도하지 않는다');
const v=run('adventure').els;
ok(v.watch.hidden===false,'영상 장면이면 «영상 보기» 가 보인다(짝)');
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail?1:0);
