const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../public/js/ai-speaking-progress-view.js'),'utf8');
function element(tag){return {tagName:tag,children:[],textContent:'',className:'',setAttribute(k,v){this[k]=v},appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}}}
function view(){const root={};vm.runInNewContext(src,{window:root,document:{createElement:element,createElementNS:(_,tag)=>element(tag)}});return root.AiSpeakingProgressView}
test('does not display fabricated scores for missing result',()=>{const c=element('section');view().render(c,null,'ko');assert.match(c.children[0].textContent,/정상 종료/);});
test('shows unmeasured fields explicitly',()=>{const c=element('section');view().render(c,{finishedNormally:true,skills:{grammar:90},uniqueWords:[],reviewWords:[]},'ko');assert.match(JSON.stringify(c),/미측정/);});
test('ignores reward estimates',()=>{const c=element('section');view().render(c,{finishedNormally:true,stars:15,gems:10},'en');assert.doesNotMatch(JSON.stringify(c),/reward/i);});
test('renders untrusted word as text, never HTML',()=>{const c=element('section');view().render(c,{finishedNormally:true,skills:{},reviewWords:['<script>alert(1)</script>']},'en');assert.match(JSON.stringify(c),/<script>/);});
test('partial result cannot display overall score or estimated reward',()=>{const c=element('section');view().render(c,{finishedNormally:true,score:100,skills:{grammar:100},stars:15,gems:10},'en');assert.match(JSON.stringify(c),/Overall score unavailable/);assert.doesNotMatch(JSON.stringify(c),/reward/i);assert.doesNotMatch(JSON.stringify(c),/⭐/);});
test('actual server model result renders instead of the incomplete-lesson placeholder',async()=>{const {evaluateSpeaking}=await import('../src/ai-speaking-progress.ts');const r=evaluateSpeaking({lessonId:'lesson',studentId:'student',finishedNormally:true,evaluatedAt:new Date().toISOString(),evaluationSource:'engine',skills:{grammar:80},spokenWords:['Hello'],correctedWords:[],sentencesCompleted:0});const c=element('section');view().render(c,r,'en');assert.match(JSON.stringify(c),/80\/100/);assert.doesNotMatch(JSON.stringify(c),/after the lesson ends normally/);});
test('zero is a measured score',()=>{const c=element('section');view().render(c,{finishedNormally:true,score:0,skills:{pronunciation:0,fluency:0,grammar:0,vocabulary:0,sentence:0}},'en');assert.match(JSON.stringify(c),/0\/100/);});
test('actual wallet is shown without inventing achievement rewards',()=>{const c=element('section');view().render(c,{finishedNormally:true,score:90,skills:{grammar:90},stars:9,gems:10,rewards:{pointsEarned:5,pointsBalance:50,gemsBalance:30,badges:[]}},'en');const s=JSON.stringify(c);assert.doesNotMatch(s,/Estimated learning achievements/);assert.match(s,/Points earned in this practice: 5P/);assert.match(s,/Gem balance at completion: 30/);});
test('unknown wallet data is unavailable rather than zero',()=>{const c=element('section');view().render(c,{finishedNormally:true,skills:{},rewards:{pointsEarned:null,pointsBalance:null,gemsBalance:null,badges:null}},'ko');assert.match(JSON.stringify(c),/확인 불가/);assert.doesNotMatch(JSON.stringify(c),/잔액: 0/);});

test('unavailable assessments suppress cached numeric fields',()=>{const c=element('section');view().render(c,{finishedNormally:true,evaluationStatus:'unavailable',score:99,skills:{pronunciation:99,fluency:99,grammar:99,vocabulary:99,sentence:99}},'en');assert.doesNotMatch(JSON.stringify(c),/99\/100/);assert.match(JSON.stringify(c),/Not measured/);});
const week=()=>Array.from({length:7},(_,i)=>({date:'2026-11-0'+(i+2),words:i===0?3:0,limited:i===0}));
test('weekly vocabulary renders seven accessible bars with real zeros and a capture warning',()=>{
 for(const lang of ['ko','en']){
  const c=element('section');view().render(c,{finishedNormally:true,weeklyVocabulary:week()},lang);
  const chart=c.children.find(el=>el.className==='ai-progress-week');assert.equal(chart.children.length,7);
  assert.equal(chart.children[0].children[1].value,3);assert.equal(chart.children[1].children[1].value,0);
  assert.match(chart.children[0].children[1]['aria-label'],/2026-11-02: 3/);
  assert.match(JSON.stringify(c),lang==='ko'?/어휘 실력 점수는 아닙니다/:/not a vocabulary ability score/);
  assert.match(JSON.stringify(c),lang==='ko'?/일부만 기록/:/limited text capture/);
 }
});
test('malformed or unavailable week has no fabricated bars',()=>{
 for(const weeklyVocabulary of [null,[],Array(7).fill({date:'2026-11-02',words:1,limited:false}),week().map(d=>({...d,words:-1})),week().map(d=>({...d,date:'<script>'}))]){
  const c=element('section');view().render(c,{finishedNormally:true,weeklyVocabulary},'en');
  assert.match(JSON.stringify(c),/Vocabulary records are unavailable/);assert.doesNotMatch(JSON.stringify(c),/ai-progress-bar|<script>/);
 }
});
function viewWith(navigator){const root={navigator};vm.runInNewContext(src,{window:root,document:{createElement:element,createElementNS:(_,tag)=>element(tag)}});return root.AiSpeakingProgressView}
const all=(c,out=[])=>{for(const x of c.children){out.push(x);all(x,out);}return out};
const shareBtn=c=>all(c).find(x=>x.tagName==='button');
test('next practice comes from the latest confirmed correction, never invented',()=>{
 const c=element('section');view().render(c,{source:'warmup-session-observations',turns:3,corrections:[{was:'I go',now:'I went'},{was:'He go',now:'He goes'}]},'ko');
 const s=JSON.stringify(c);assert.match(s,/다음에 연습할 한 가지/);assert.equal(all(c).find(x=>x.className==='ai-progress-focus').textContent,'He goes');
 for(const r of [{finishedNormally:true,skills:{},reviewWords:[]},{source:'warmup-session-observations',turns:2,corrections:[{was:'x',now:'  '}]}]){
  const e=element('section');view().render(e,r,'en');assert.doesNotMatch(JSON.stringify(e),/One thing to practice next/);
 }
});
test('next class link and share button are always offered after a result',()=>{
 for(const lang of ['ko','en']){const c=element('section');view().render(c,{finishedNormally:true,skills:{},reviewWords:['went']},lang);
  const a=all(c).find(x=>x.tagName==='a');assert.equal(a.href,'/my-schedule.html');assert.equal(shareBtn(c).type,'button');
  assert.match(a.textContent,lang==='ko'?/다음 원어민 수업/:/next class/);}
 const e=element('section');view().render(e,null,'ko');assert.equal(shareBtn(e),undefined);
});
test('phone share sheet gets a summary without the student id',async()=>{
 let sent=null,copied=null;const nav={maxTouchPoints:5,share:async x=>{sent=x;},clipboard:{writeText:async t=>{copied=t;}}};
 const c=element('section');viewWith(nav).render(c,{finishedNormally:true,studentId:'kim2024',lessonId:'L1',recordedTurns:4,uniqueWords:['i','went'],reviewWords:['went'],skills:{}},'ko');
 shareBtn(c).onclick();await new Promise(r=>setTimeout(r,0));
 assert.equal(sent.url,'https://mangoi.ai');assert.match(sent.text,/답변 4회/);assert.match(sent.text,/영어 단어 2개/);assert.match(sent.text,/다음 연습: went/);
 assert.doesNotMatch(JSON.stringify(sent),/kim2024|L1/);assert.equal(copied,null);
});
test('closing the share sheet is not a failure; PC copies instead',async()=>{
 let copied=null;const abort={maxTouchPoints:5,share:async()=>{const e=new Error('x');e.name='AbortError';throw e;},clipboard:{writeText:async t=>{copied=t;}}};
 const c=element('section');viewWith(abort).render(c,{finishedNormally:true,skills:{}},'en');shareBtn(c).onclick();await new Promise(r=>setTimeout(r,0));assert.equal(copied,null);
 const pc={maxTouchPoints:0,share:async()=>{throw new Error('should not open sheet on PC');},clipboard:{writeText:async t=>{copied=t;}}};
 const d=element('section');viewWith(pc).render(d,{finishedNormally:true,skills:{}},'en');shareBtn(d).onclick();await new Promise(r=>setTimeout(r,0));
 assert.match(copied,/https:\/\/mangoi\.ai/);assert.match(JSON.stringify(d),/Copied\. Paste it into KakaoTalk/);
 const none={maxTouchPoints:0};const f=element('section');viewWith(none).render(f,{finishedNormally:true,skills:{}},'ko');shareBtn(f).onclick();
 assert.match(JSON.stringify(f),/아래 글을 복사해서 보내세요/);
});

const tri=c=>all(c).filter(x=>x.tagName==='svg');
const shape=c=>all(c).find(x=>x.className==='ai-progress-tri-shape'||x['class']==='ai-progress-tri-shape');
test('triangle chart plots only confirmed sentence grades',()=>{
 for(const lang of ['ko','en']){
  const c=element('section');view().render(c,{source:'warmup-session-observations',turns:4,grades:{perfect:2,partial:1,incomplete:1}},lang);
  assert.equal(tri(c).length,1);assert.match(tri(c)[0]['aria-label'],lang==='ko'?/오류 없음 2, 교정 필요 1, 미완성 1/:/Error-free 2, To fix 1, Incomplete 1/);
  // perfect = 2/4 of radius 64 straight up from (130,104)
  assert.match(shape(c).points,/^130\.0,72\.0 /);
 }
 const none=element('section');view().render(none,{source:'warmup-session-observations',turns:2},'ko');
 assert.equal(tri(none).length,0);assert.match(JSON.stringify(none),/문장 등급 미제공/);
});
test('skill triangle never draws a shape through an unmeasured axis',()=>{
 const full=element('section');view().render(full,{finishedNormally:true,skills:{grammar:100,vocabulary:50,sentence:0}},'en');
 assert.match(shape(full).points,/^130\.0,40\.0 157\.7,120\.0 130\.0,104\.0$/);
 const part=element('section');view().render(part,{finishedNormally:true,skills:{grammar:90}},'en');
 assert.equal(tri(part).length,1);assert.equal(shape(part),undefined);assert.match(tri(part)[0]['aria-label'],/Grammar 90, Vocabulary Not measured/);
 for(const r of [{finishedNormally:true,skills:{}},{finishedNormally:true,evaluationStatus:'unavailable',skills:{grammar:99,vocabulary:99,sentence:99}}]){
  const e=element('section');view().render(e,r,'en');assert.equal(tri(e).length,0);
 }
});
