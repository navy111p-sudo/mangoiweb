import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = readFileSync('cloudflare-deploy/public/student-game-grammar-pizza.html','utf8');
const block = html.slice(html.indexOf('var TTS_LANG ='), html.indexOf('/* ══════════ 음성 인식'));
let played=0, paused=0, requested=[], nodes=[], timers=[];
const voices=[{lang:'en-US',name:'Microsoft Zira'},{lang:'en-US',name:'Google US English'},{lang:'zh-CN',name:'Xiaoxiao Neural'}];
const speech={getVoices:()=>voices,cancel(){},speak(u){requested.push(u);}};
function node(kind){const n={kind,connect(to){this.to=to;},gain:{},threshold:{},knee:{},ratio:{},attack:{},release:{}};nodes.push(n);return n;}
class Audio {play(){played++;return Promise.resolve();} pause(){paused++;}}
class AC {constructor(){this.state='suspended';this.destination={};} createGain(){return node('gain');} createDynamicsCompressor(){return node('limiter');} createMediaElementSource(){return node('source');} resume(){this.state='running';return Promise.resolve();}}
const box={GLANG:'en',DIFF:1,RATE_BY_DIFF:JSON.parse(html.match(/var RATE_BY_DIFF = (\[[^;]+\])/)[1]),Audio,SpeechSynthesisUtterance:function(t){this.text=t;},speechSynthesis:speech,setTimeout:f=>timers.push(f),clearTimeout(){},fetch:async()=>({ok:true,headers:{get:()=> 'audio/mpeg'},blob:async()=>({})}),URL:{createObjectURL:()=> 'blob:test'}};
box.window={speechSynthesis:speech,AudioContext:AC};
vm.createContext(box);vm.runInContext(block,box);
assert.equal(box.voiceFor('en-US').name,'Google US English');
assert.equal(box.voiceFor('zh-CN').name,'Xiaoxiao Neural');
box.speak('Hello I am a student.');
await new Promise(r=>setImmediate(r));
assert.equal(played,1);assert.equal(box._pzAudio.volume,1);assert.equal(box._pzAudio.playbackRate,.9);
assert.equal(box._pzContext.state,'running');assert.equal(nodes.find(n=>n.kind==='gain').gain.value,1.6);
assert.equal(nodes.find(n=>n.kind==='source').to.kind,'gain');assert.equal(nodes.find(n=>n.kind==='gain').to.kind,'limiter');
box._pzStop();assert.ok(paused>0);
box.window.AudioContext=null;box._pzContext=null;box._pzSource=null;
box.speak('Second sentence.');await new Promise(r=>setImmediate(r));assert.equal(played,2);
box._pzSynth('Hello','en-US',()=>{});assert.equal(requested[0].volume,1);assert.equal(requested[0].lang,'en-US');
console.log('PASS pizza audio: voice selection, rate, gain/limiter routing, stop, plain Audio fallback, synthesis volume');

