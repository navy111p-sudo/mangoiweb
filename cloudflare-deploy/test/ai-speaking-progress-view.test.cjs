const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../public/js/ai-speaking-progress-view.js'),'utf8');
function element(tag){return {tagName:tag,children:[],textContent:'',className:'',setAttribute(k,v){this[k]=v},appendChild(x){this.children.push(x)},replaceChildren(){this.children=[]}}}
function view(){const root={};vm.runInNewContext(src,{window:root,document:{createElement:element}});return root.AiSpeakingProgressView}
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
