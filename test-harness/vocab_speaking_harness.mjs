import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = fs.readFileSync('cloudflare-deploy/public/vocab.html','utf8');
for (const [,script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script);
const block = html.slice(html.indexOf('/* Follow-along'), html.indexOf('/* ── 세션 종료'));
let pending, calls=0, canceled=0;
const elements = {'mic-btn':{disabled:false},'speak-fb':{},'speak-replay':{pause(){},removeAttribute(){}}};
const context = vm.createContext({window:{addEventListener(){},MangoiVoice:true},document:{getElementById:id=>elements[id]},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
MangoiVoice:{supported:()=>true,cancel(){canceled++},record(opts){assert.equal(opts.lang,'en');return new Promise(resolve=>{pending=resolve})}},
esc:s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;'),fetch:()=>{calls++;return Promise.resolve({})},UID:1,__mgTok:()=>'',getName:()=>'',floatPt(){},sndFanfare(){},confetti(){},loadStats(){},
S:{id:'test',idx:0,spoke:new Set()},_answered:false});
vm.runInContext(block,context);
const run=code=>vm.runInContext(code,context);
for(const [a,b,ok] of [['A boy was blowing','A boy was blowing.',true],['A boy was blowing',' A BOY  was blowing! ',true],["Don't stop","Don’t stop.",true],['blowing','flowing',false],['cat','catch',false],['A boy was blowing','blowing',false],['cat','',false],['well',"we’ll",false],['ill',"I'll",false],['shell',"she'll",false]]) assert.equal(run(`vocabSpeechMatches(${JSON.stringify(a)},${JSON.stringify(b)})`),ok);
let task=run("trySpeak({id:1,word:'A boy was blowing'})");pending('A boy was flowing');await task;assert.equal(calls,0);assert.match(elements['speak-fb'].innerHTML,/<mark>flowing/);assert.equal(elements['mic-btn'].disabled,false);
task=run("trySpeak({id:1,word:'A boy was blowing'})");pending('A boy was blowing.');await task;assert.equal(calls,1);assert.equal(elements['mic-btn'].disabled,false);
task=run("trySpeak({id:1,word:'A boy was blowing'})");pending('A boy was blowing');await task;assert.equal(calls,1);
task=run("trySpeak({id:2,word:'cat'})");run('cancelVocabSpeak(); S.idx++');elements['speak-fb'].innerHTML='new card';pending('cat');await task;assert.equal(calls,1);assert.equal(elements['speak-fb'].innerHTML,'new card');assert.equal(canceled,1);
console.log('PASS: full sentence, punctuation/case/spacing, incorrect word rejection, retry, one reward, stale result cancellation; inline syntax');
