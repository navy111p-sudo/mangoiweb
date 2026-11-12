import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../cloudflare-deploy/public/ai-write.html', import.meta.url), 'utf8');
const source = html.match(/    let _awSubmitting = false[^\n]*\n    async function submitText\(\) \{[\s\S]*?\n    \}/)?.[0];
assert(source, 'submission function is present');
function setup() {
 const nodes = {text:{value:'I go to the park yesterday.'},submitBtn:{disabled:false},resultBox:{style:{}}};
 const results=[], rounds=[], errors=[], homework=[], requests=[]; let resolve, uid='test-only', timer;
 const c={document:{getElementById:id=>nodes[id]}, stopDictation(){},awUnlockSound(){},alert(){},confirm:()=>true,awTr:(ko,en)=>en,awNorm:s=>s,
 _awPrev:null,_goTheme:{id:'custom:41',ko:'Original topic'},_goAnswers:{where:'original place'},currentLevel:'A1',_missionWords:[],_awSubmitSnap:null,_lastDraft:'previous',_lastResultTheme:null,
 getUid:()=>uid,getToken:()=>'',awTopicIdNow:()=>41,goQuestions:()=>[{k:'where'}],awDraftSave(){},AbortController,
 setTimeout(fn){timer=fn;return 1;},clearTimeout(){},console:{error(){}},awNoteRound:(...a)=>rounds.push(a),renderResult:d=>results.push(d),awPlayDoneChime(){},awShowFeedbackResult(){},awMarkHwDone:id=>homework.push(id),loadHistory:()=>new Promise(()=>{}),showErrorBox:(...a)=>errors.push(a),
 fetch:(url,opts)=>{requests.push(JSON.parse(opts.body));return new Promise((res,rej)=>{resolve=res;opts.signal.addEventListener('abort',()=>rej(new Error('aborted')));});}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,nodes,results,rounds,errors,homework,requests,reply:(d,status=200)=>resolve({ok:status<400,status,json:async()=>d}),timeout:()=>timer(),account:()=>uid='another-test',reset:()=>vm.runInContext('_awSubmitEpoch++; _awRequestController.abort();',c)};
}
const good={ok:true,corrected:'I went to the park yesterday.',score:80,issues:[],upgrades:[],topic_recorded:true};
let checks=0;
{
 const t=setup(),pending=t.c.submitText();await t.c.submitText();assert.equal(t.requests.length,1);checks++;
 t.c.currentLevel='B2';t.c.awTopicIdNow=()=>99;t.c._goAnswers.where='new place';t.c._goTheme={id:'custom:99'};
 t.reply({...good});await pending;
 assert.equal(t.rounds[0][2],'A1');assert.deepEqual(t.homework,[41]);assert.equal(t.c._awSubmitSnap.answers.where,'original place');assert.equal(t.c._lastResultTheme.id,'custom:41');assert.equal(t.results[0].level,'A1');assert.equal(t.nodes.submitBtn.disabled,false);checks+=6;
}
for(const [payload,status] of [[{...good},500],[{ok:true,score:100},200],[{...good,score:'100'},200],[{...good,score:101},200],[{...good,issues:[null]},200],[{ok:false,error:'unreadable'},502]]){
 const t=setup(),p=t.c.submitText();t.reply(payload,status);await p;assert.equal(t.results.length,0);assert.equal(t.errors.length,1);assert.equal(t.nodes.text.value,'I go to the park yesterday.');assert.equal(t.nodes.submitBtn.disabled,false);checks+=4;
}
{
 const t=setup(),p=t.c.submitText();t.timeout();await p;assert.equal(t.errors.length,1);assert.equal(t.nodes.submitBtn.disabled,false);assert.equal(t.nodes.text.value,'I go to the park yesterday.');assert.equal(t.c._lastDraft,'previous');const p2=t.c.submitText();t.reply({...good});await p2;assert.equal(t.results.length,1);checks+=5;
}
for(const action of ['account','reset']){const t=setup(),p=t.c.submitText();t[action]();if(action==='account')t.reply({...good});await p;assert.equal(t.results.length,0);assert.equal(t.errors.length,0);assert.equal(t.nodes.submitBtn.disabled,false);checks+=3;}
console.log(`${checks} assertions passed: single-flight, snapshot, invalid/HTTP errors, timeout/retry, draft preservation, account change, reset, history stall.`);
