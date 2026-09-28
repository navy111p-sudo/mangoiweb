import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('cloudflare-deploy/public/js/handover-dictation.js','utf8');
let next=0,timers=new Map(),instances=[],recordOptions,resolveRecord,cancels=0;
class Speech{constructor(){instances.push(this);}start(){this.onstart();}stop(){this.onend();}abort(){this.aborted=true;}}
const voice={supported:()=>true,record:o=>{recordOptions=o;o.onState('waiting',{});return new Promise(r=>resolveRecord=r);},stop:()=>{},cancel:()=>{cancels++;}};
const window={SpeechRecognition:Speech,MangoiVoice:voice};
vm.runInNewContext(source,{window,setTimeout:(f,ms)=>{timers.set(++next,{f,ms});return next;},clearTimeout:id=>timers.delete(id)});
const element=()=>({textContent:'',disabled:false,setAttribute(){}});
const o={button:element(),fallback:element(),language:{value:'ko-KR'},status:element(),interim:element(),canStart:()=>true,onBusy:()=>{},onText:t=>output.push(t)};
let output=[];const controller=window.HandoverDictation.create(o);
function emit(text,final=false,index=0){const r=[{transcript:text}];r.isFinal=final;const results=[];results[index]=r;instances.at(-1).onresult({resultIndex:index,results});}
function fire(ms){const pair=Array.from(timers).find(x=>x[1].ms===ms);assert.ok(pair,'timer '+ms);timers.delete(pair[0]);pair[1].f();}
o.button.onclick();assert.equal(instances.at(-1).interimResults,true);emit('오늘 문의를');assert.equal(o.interim.textContent,'오늘 문의를');assert.equal(output.length,0);
o.button.onclick();assert.deepEqual(output,['오늘 문의를']);assert.equal(controller.busy(),false);
o.button.onclick();emit('확인했습니다',true);emit('확인했습니다',true);controller.stop();assert.deepEqual(output,['오늘 문의를','확인했습니다'],'final is inserted exactly once');
o.button.onclick();fire(12000);assert.equal(controller.busy(),false);assert.match(o.status.textContent,/인식 응답이 없습니다/);
o.button.onclick();instances.at(-1).onerror({error:'not-allowed'});assert.match(o.status.textContent,/권한/);assert.equal(controller.busy(),false);
o.button.onclick();emit('남은 문장');const old=instances.at(-1);controller.cancel();const count=output.length;const fake=[{transcript:'late'}];fake.isFinal=true;old.onresult({resultIndex:0,results:[fake]});assert.equal(output.length,count);assert.ok(old.aborted);
o.fallback.onclick();assert.equal(recordOptions.lang,'ko');assert.equal(controller.busy(),true);recordOptions.onState('thinking',{});assert.match(o.status.textContent,/변환 중/);resolveRecord('녹음한 보고입니다');await Promise.resolve();await Promise.resolve();assert.equal(output.at(-1),'녹음한 보고입니다');assert.equal(controller.busy(),false);
o.fallback.onclick();fire(90000);assert.equal(cancels,1);resolveRecord('late recording');await Promise.resolve();await Promise.resolve();assert.notEqual(output.at(-1),'late recording');assert.equal(controller.busy(),false);
// A browser that never emits onend still releases its microphone and preserves interim text.
o.button.onclick();emit('마지막 임시 문장');instances.at(-1).stop=()=>{};controller.stop();fire(1200);assert.equal(output.at(-1),'마지막 임시 문장');assert.equal(controller.busy(),false);assert.ok(instances.at(-1).aborted);
console.log('PASS handover dictation: interim visibility, stop commits interim, final deduplication, stalled recognition timeout, permission errors, fallback language, cancellation/late-response isolation, missing onend recovery');
