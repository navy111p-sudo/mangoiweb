// 매일보고 음성 입력 — 2026-10-02 사장님 지시로 «말로 입력»(브라우저 SpeechRecognition)을 빼고
// «녹음해서 입력»(서버 Whisper) 하나만 남겼다. 모듈을 실제로 돌려 녹음·변환·취소·시간초과를 보고,
// 화면에 «말로 입력» 버튼·브라우저 인식 코드가 되살아나지 않았는지 짝으로 본다.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('cloudflare-deploy/public/js/handover-dictation.js','utf8');
const html=readFileSync('cloudflare-deploy/public/daily-handover.html','utf8');
const page=readFileSync('cloudflare-deploy/public/js/daily-handover.js','utf8');
const code=source.replace(/\/\*[\s\S]*?\*\//g,'');
let next=0,timers=new Map(),recordOptions,resolveRecord,cancels=0,stops=0,speechMade=0;
class Speech{constructor(){speechMade++;}}
const voice={supported:()=>true,record:o=>{recordOptions=o;o.onState('waiting',{});return new Promise(r=>resolveRecord=r);},stop:()=>{stops++;},cancel:()=>{cancels++;}};
const window={SpeechRecognition:Speech,webkitSpeechRecognition:Speech,MangoiVoice:voice};
vm.runInNewContext(source,{window,setTimeout:(f,ms)=>{timers.set(++next,{f,ms});return next;},clearTimeout:id=>timers.delete(id)});
const element=()=>({textContent:'',disabled:false,setAttribute(){}});
let output=[];
const o={button:element(),language:{value:'ko-KR',disabled:false},status:element(),canStart:()=>true,onBusy:()=>{},onText:t=>output.push(t)};
const controller=window.HandoverDictation.create(o);
function fire(ms){const pair=Array.from(timers).find(x=>x[1].ms===ms);assert.ok(pair,'timer '+ms);timers.delete(pair[0]);pair[1].f();}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};

// 1) 누르면 녹음(서버 변환)이 시작되고, 브라우저 인식은 만들지 않는다
o.button.onclick();assert.equal(recordOptions.lang,'ko');assert.equal(controller.busy(),true);assert.equal(speechMade,0,'no browser SpeechRecognition');
assert.match(o.button.textContent,/녹음 정지/);assert.equal(o.language.disabled,true);
recordOptions.onState('thinking',{});assert.match(o.status.textContent,/변환 중/);
resolveRecord('녹음한 보고입니다');await tick();assert.deepEqual(output,['녹음한 보고입니다']);assert.equal(controller.busy(),false);assert.match(o.button.textContent,/녹음해서 입력/);assert.equal(o.language.disabled,false);
// 2) 녹음 중 다시 누르면 «정지»(변환), 취소가 아니다
o.button.onclick();o.button.onclick();assert.equal(stops,1);assert.equal(cancels,0);resolveRecord('두 번째');await tick();assert.equal(output.at(-1),'두 번째');
// 3) 빈 결과는 넣지 않고 사실대로 말한다
o.button.onclick();resolveRecord('');await tick();assert.equal(output.length,2);assert.match(o.status.textContent,/인식된 말이 없습니다/);
// 4) 시간초과 → 취소, 늦게 온 답은 무시
o.button.onclick();fire(90000);assert.equal(cancels,1);resolveRecord('late recording');await tick();assert.notEqual(output.at(-1),'late recording');assert.equal(controller.busy(),false);
// 5) 화면 이동 등 cancel → 늦은 답 무시
o.button.onclick();controller.cancel();assert.equal(cancels,2);resolveRecord('after cancel');await tick();assert.notEqual(output.at(-1),'after cancel');
// 6) 권한 거부 사유를 말한다
o.button.onclick();recordOptions.onState('error',{reason:'denied'});resolveRecord('');await tick();assert.match(o.status.textContent,/권한/);
// 7) 녹음을 못 하는 브라우저는 시작하지 않고 사유를 말한다
voice.supported=()=>false;o.button.onclick();assert.equal(controller.busy(),false);assert.match(o.status.textContent,/녹음할 수 없습니다/);voice.supported=()=>true;

// 8) «말로 입력»이 되살아나지 않았다(짝: 녹음 버튼은 있다)
assert.ok(!/id="mh-voice"[\s>]/.test(html),'«말로 입력» 버튼(#mh-voice)이 없다');
assert.ok(!/말로 입력|Dictate</.test(html),'«말로 입력» 문구가 없다');
assert.ok(!/mh-voice-interim/.test(html),'실시간 미리보기 줄이 없다');
assert.ok(/id="mh-voice-record"/.test(html),'녹음 버튼은 있다');
assert.ok(!/SpeechRecognition/.test(code),'브라우저 음성인식 코드가 없다');
assert.ok(!/\$\('voice'\)/.test(page),'페이지가 없는 #mh-voice 를 부르지 않는다');
assert.ok(/button:\$\('voice-record'\)/.test(page),'녹음 버튼을 모듈에 넘긴다');
console.log('PASS handover dictation (record only): server record/convert, stop vs cancel, empty result, timeout/late-response isolation, permission message, unsupported browser, no browser SpeechRecognition / Dictate button');
