const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/js/ai-speaking-session.js'),'utf8');
function session(){const root={SESSION_ID:'s'};vm.runInNewContext(source,{window:root});return root.AiSpeakingSession;}
const p={source:'warmup-verified-turn',sessionId:'s',turn:1,grade:'partial',spokenWords:['i','like','apples'],reviewWords:['apple'],correction:{was:'apples',now:'apple'}};
test('confirmed turns dedupe and preserve observations without invented scores',()=>{const s=session();s.record(p,'ctx');s.record(p,'ctx');const r=s.result('ctx');assert.equal(r.turns,1);assert.equal(r.grades.partial,1);assert.equal(r.uniqueWords.length,3);assert.equal(r.score,null);assert.equal(r.stars,undefined);});
test('other sessions and unrecognized sources are ignored',()=>{const s=session();s.record({...p,sessionId:'other'},'ctx');s.record({...p,source:'preview'},'ctx');assert.equal(s.result('ctx').turns,0);});
test('new lesson context clears old observations',()=>{const s=session();s.record(p,'old');assert.equal(s.result('new').turns,0);});
test('replayed request IDs do not add another result even with a new response time',()=>{const s=session();s.record({...p,eventId:'same-request'},'ctx');s.record({...p,eventId:'same-request',turn:2},'ctx');assert.equal(s.result('ctx').turns,1);});

function friendPage(lang,chooseOk){
 const L={},D={};let placed=null;
 const el=t=>({tagName:t,children:[],style:{},attrs:{},get options(){return this.children;},appendChild(n){this.children.push(n);},append(...n){this.children.push(...n);},setAttribute(k,v){this.attrs[k]=v;}});
 const chat={before(n){placed=n;}};
 const root={SESSION_ID:'s',crypto:{randomUUID:()=>'u'},getLang:()=>lang.v,AiSpeakSettings:{read:()=>({timing:'immediate'}),chooseTiming:()=>chooseOk},addEventListener:(k,f)=>{(L[k]=L[k]||[]).push(f);}};
 const document={readyState:'complete',getElementById:id=>id==='chat'?chat:null,createElement:el,addEventListener:(k,f)=>{(D[k]=D[k]||[]).push(f);}};
 vm.runInNewContext(source,{window:root,document,localStorage:{}});
 const [label,select,note]=placed.children;
 return {label,select,note,fire:()=>[...(L['mangoi:lang-changed']||[]),...(D['mangoi:lang-changed']||[])].forEach(f=>f())};
}
test('AI friend timing dropdown follows the language toggle and keeps the choice',()=>{
 const lang={v:'ko'},p=friendPage(lang,true);
 assert.equal(p.label.textContent,'피드백 타이밍');assert.equal(p.select.options[1].textContent,'바로 교정');assert.equal(p.select.value,'immediate');
 lang.v='en';p.fire();
 assert.equal(p.label.textContent,'Feedback timing');assert.equal(p.select.options[1].textContent,'Correct immediately');assert.equal(p.select.value,'immediate');
 lang.v='ko';p.fire();assert.equal(p.select.options[3].textContent,'연습 후 모아서 보기');
});
test('save failure message is shown and switches language too',()=>{
 const lang={v:'ko'},p=friendPage(lang,false);
 assert.equal(p.note.textContent,'');p.select.onchange();assert.equal(p.note.textContent,'설정을 저장하지 못했어요.');
 lang.v='en';p.fire();assert.equal(p.note.textContent,'Could not save this setting.');
 const ok=friendPage({v:'en'},true);ok.select.onchange();assert.equal(ok.note.textContent,'');
});
