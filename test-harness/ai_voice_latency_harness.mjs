// Executable source regression with a virtual clock and synthetic amplitude/provider fixtures.
// Does not measure real speech recognition accuracy or service latency.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.env.VOICE_SOURCE_ROOT||'.');
const baseline=process.argv.includes('--baseline');
const src=p=>readFileSync(resolve(root,'cloudflare-deploy/public',p),'utf8');
let pass=0,fail=0;const findings=[];
async function test(name,fn){try{await fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.message);findings.push({name,error:e.message});}}
function clock(){let now=0,id=0;const timers=new Map();return {get now(){return now;},setTimeout(fn,ms=0){timers.set(++id,{at:now+ms,fn});return id;},clearTimeout(id){timers.delete(id);},async advance(ms){const end=now+ms;for(;;){await flush();const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();}now=end;await flush();},timers};}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
function base(){const c=clock();let urls=0;const s={console,friendRatePreference:{loaded:true,ready:Promise.resolve()},Date:class extends Date{static now(){return c.now}},performance:{now:()=>c.now},setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,localStorage:{getItem(){return null},setItem(){}},URL:{createObjectURL:()=> 'blob:synthetic'+(++urls)},AbortController};s.window=s;s.globalThis=s;vm.createContext(s);return {s,c};}
function voice({text='I like apples.',failProvider=false}={}){
 const e=base(),{s,c}=e,log={states:[],timings:[],stops:0,posts:0,peak:0};
 s.navigator={mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){log.stops++;}}]})}};
 s.requestAnimationFrame=f=>c.setTimeout(f,20);s.cancelAnimationFrame=c.clearTimeout;
 s.MediaRecorder=class {static isTypeSupported(){return true;}start(){log.started=true;}stop(){log.stopped=c.now;this.ondataavailable?.({data:{size:5000,type:'audio/webm'}});this.onstop?.();}};
 s.AudioContext=class {createMediaStreamSource(){return {connect(){}}}createAnalyser(){return {fftSize:1024,getByteTimeDomainData(b){b.fill(128);b[0]=128+log.peak;}}}close(){}};
 s.Blob=class{constructor(parts){this.size=parts.reduce((n,p)=>n+p.size,0);this.type='audio/webm';}};
 s.FormData=class{append(){}};
 s.fetch=async(url,o)=>{log.posts++;log.signal=o.signal;await new Promise(r=>c.setTimeout(r,120));if(failProvider)throw Error('synthetic provider failure');return {ok:true,json:async()=>({ok:true,text})};};
 vm.runInContext(src('js/mangoi-voice-input.js'),s);
 return {...e,log,start(opts={}){return s.MangoiVoice.record({...opts,onState:(stage,info)=>log.states.push({stage,info}),onTiming:(stage,reason)=>log.timings.push({stage,reason,at:c.now})});}};
}
function tts(){const e=base(),{s,c}=e,log={requests:[],done:[],events:[],synth:[]};
 s.Audio=class{constructor(){log.audio=this;this.paused=true;this.ended=false;this.currentTime=0;this.events={};}addEventListener(n,f){this.events[n]=f}removeEventListener(n,f){if(this.events[n]===f)delete this.events[n]}play(){this.paused=false;this.events.playing?.();return Promise.resolve()}pause(){this.paused=true;}};
 s.SpeechSynthesisUtterance=class{};s.speechSynthesis={speaking:false,getVoices:()=>[],cancel(){this.speaking=false;},speak(u){log.synth.push(u);this.speaking=true;u.onstart?.();}};
 s.fetch=()=>new Promise((res,rej)=>log.requests.push({res,rej}));
 vm.runInContext(src('js/game-tts.js'),s);
 const respond=async(i=0)=>{log.requests[i].res({ok:true,headers:{get:()=> 'audio/wav'},blob:async()=>({})});await flush();};
 return {...e,log,respond};
}
for(let repeat=0;repeat<5;repeat++){
 for(const scenario of [
 {name:'short fast',segments:[300]},
 {name:'long continuous',segments:[12000]},
 {name:'slow with 2-second pauses',segments:[700,2000,700,2000,700]},
 {name:'incomplete text preserved',segments:[200],text:'I want to'},
 {name:'low amplitude above existing threshold',segments:[800],peak:9},
 ]) await test(`${scenario.name} repeat ${repeat+1}`,async()=>{
 const v=voice({text:scenario.text});const promise=v.start();await flush();
 for(let i=0;i<scenario.segments.length;i++){v.log.peak=i%2===0?(scenario.peak||20):0;await v.c.advance(scenario.segments[i]);assert.equal(v.log.stopped,undefined,'must not stop ongoing/slow speech');}
 v.log.peak=0;await v.c.advance(2480);assert.equal(v.log.stopped,undefined,'keep conservative pause window');await v.c.advance(180);
 assert.equal(await promise,scenario.text||'I like apples.');assert.equal(v.log.posts,1);assert.equal(v.log.stops,1);
 const stopped=v.log.timings.find(x=>x.stage==='recording_stopped');if(!baseline)assert.equal(stopped?.reason,'silence');
 });
}
await test('cancel in-flight STT settles immediately and silences late errors',async()=>{const v=voice({failProvider:true});const p=v.start();await flush();v.s.MangoiVoice.stop();await flush();v.s.MangoiVoice.cancel();let settled=false;p.then(()=>settled=true);await flush();assert.equal(settled,true);assert.equal(v.s.MangoiVoice.busy(),false);assert.equal(v.log.signal?.aborted,true);await v.c.advance(200);assert.equal(v.log.states.some(x=>x.stage==='error'),false);});
await test('silent recording never begins model submission',async()=>{const v=voice();const p=v.start();await flush();await v.c.advance(9200);await p;if(!baseline)assert.equal(v.log.timings.find(x=>x.stage==='recording_stopped')?.reason,'no_speech');assert.equal(v.log.states.some(x=>x.stage==='speaking'),false);});
await test('maximum capture duration remains 20 seconds',async()=>{const v=voice();const p=v.start();await flush();v.log.peak=20;await v.c.advance(20200);await p;assert.equal(v.log.stopped,20000);if(!baseline)assert.equal(v.log.timings.find(x=>x.stage==='recording_stopped')?.reason,'max_duration');});
await test('canceled audio completion cannot end newer audio',async()=>{const t=tts();t.s.MangoiTTS.speak('Old',1,()=>t.log.done.push('old'));await t.respond();const stale=t.log.audio.onended;t.s.MangoiTTS.stop();t.s.MangoiTTS.speak('New',1,()=>t.log.done.push('new'));await t.respond(1);stale();assert.deepEqual(t.log.done,[]);t.log.audio.onended();assert.deepEqual(t.log.done,['new']);});
await test('cached speech invalidates older in-flight synthesis',async()=>{const t=tts();t.s.MangoiTTS.prefetch('Cached');await t.respond();t.s.MangoiTTS.speak('Old',1,()=>{});t.s.MangoiTTS.speak('Cached',1,()=>{});const source=t.log.audio.src;await t.respond(1);assert.equal(t.log.audio.src,source);assert.equal(t.log.audio.paused,false);});
await test('long cloud audio does not report complete at old 8-second timer',async()=>{const t=tts();t.s.MangoiTTS.speak('Long',1,()=>t.log.done.push(1));await t.respond();t.log.audio.currentTime=7;await t.c.advance(8000);assert.equal(t.log.done.length,0);t.log.audio.currentTime=15;await t.c.advance(8000);assert.equal(t.log.done.length,0);t.log.audio.onended();assert.equal(t.log.done.length,1);});
await test('long fallback voice does not report complete at old 4-second timer',async()=>{const t=tts();t.s.MangoiTTS.speak('Long',1,()=>t.log.done.push(1));t.log.requests[0].rej(Object.assign(Error('quota'),{noRetry:true}));await flush();await t.c.advance(4000);assert.equal(t.log.done.length,0);t.s.speechSynthesis.speaking=false;t.log.synth[0].onend();assert.equal(t.log.done.length,1);});
await test('stalled audio is paused before completion',async()=>{const t=tts();t.s.MangoiTTS.speak('Stall',1,()=>{assert.equal(t.log.audio.paused,true);t.log.done.push(1)});await t.respond();await t.c.advance(16000);assert.equal(t.log.done.length,1);});
if(!baseline)await test('TTS diagnostic stages reflect playback events rather than fetch only',async()=>{const t=tts();t.s.MangoiTTS.speak('Trace',1,()=>{},{onTiming:x=>t.log.events.push(x)});assert.deepEqual(t.log.events,['tts_started']);await t.respond();assert.deepEqual(t.log.events,['tts_started','tts_ready','output_started']);t.log.audio.onended();assert.equal(t.log.events.at(-1),'output_finished');});
if(!baseline)await test('local timing ring is bounded, contains no transcript and missing stages are unknown',async()=>{const {s,c}=base();vm.runInContext(src('js/ai-voice-timing.js'),s);for(let i=0;i<60;i++){const t=s.MangoiVoiceTiming.begin('auto');t.mark('input_requested');t.mark('speech_last');await c.advance(2500);t.mark('recording_stopped','silence');t.mark('private transcript');}const rows=s.MangoiVoiceTiming.snapshot();assert.equal(rows.length,50);assert.equal(rows[0].endOfTurnMs,2500);assert.equal(rows[0].responseAfterSpeechMs,null);assert.ok(!JSON.stringify(rows).includes('private'));});
await test('original speakText rejects stale completion before avatar side effects',async()=>{const {s}=base();s.document={querySelectorAll:()=>[]};Object.assign(s,{_ttsLangSet:true,_speechGeneration:0,personNow:()=> 'mango',speakerFor:()=> 'orion',charForPerson:x=>x,rateFor:()=>1,currentRate:1});let stops=0;const calls=[];s.MangoAvatar={plainStop(){stops++},setCharacter(){}};s.MangoiTTS={setSpeaker(){},speak(text,rate,done){calls.push(done)}};const html=src('ai-friend.html');const a=html.indexOf('    function speakText('),b=html.indexOf('    /* ══ 🎤',a);vm.runInContext(html.slice(a,b),s);s.speakText('Old');s._speechGeneration++;s.speakText('New');calls[0]();assert.equal(stops,0);calls[1]();assert.equal(stops,1);});

await test('face cancel accounting preserves 700ms echo guard without 25s canceled watchdog wait',async()=>{
 const {s,c}=base();const calls=[];s.speakText=(t,b,r,done)=>calls.push(done);s.stopSpeakingNow=()=>{};s.document={getElementById:()=>null};
 const source=src('js/aifriend-facetalk.js');const prefix=source.slice(0,source.indexOf('  /* ── 화면'));
 const quiet=source.slice(source.indexOf('  function waitQuiet('),source.indexOf('  async function listen('));
 vm.runInContext(prefix+'\nvar active=true,turnSeq=1;\n'+quiet+'\nwindow.faceProbe={wait:function(){return waitQuiet(1);},pending:function(){return pending;}};})();',s);
 s.speakText('Old');s.stopSpeakingNow();let resolvedAt=null;s.faceProbe.wait().then(()=>resolvedAt=c.now);
 await c.advance(600);assert.equal(resolvedAt,null,'do not remove echo guard');await c.advance(30000);
 findings.push({measurement:'canceled face wait',clock:'virtual',milliseconds:resolvedAt});
 assert.ok(resolvedAt>=700 && resolvedAt<1000,'canceled pending speech should settle after echo guard; observed '+resolvedAt);
 s.speakText('New');const pending=s.faceProbe.pending();calls[0]();assert.equal(s.faceProbe.pending(),pending,'old callback cannot decrement newer speech');
});
if(!baseline)await test('server diagnostics accept finite numeric counters only',async()=>{
 const {s}=base();vm.runInContext(src('js/ai-voice-timing.js'),s);const t=s.MangoiVoiceTiming.begin('face');
 t.server({server_ms:412.2,model_ms:250,tries:2,uid:'private',text:'private'});const row=s.MangoiVoiceTiming.snapshot()[0];
 assert.equal(row.serverMs,412);assert.equal(row.modelMs,250);assert.equal(row.modelTries,2);assert.ok(!JSON.stringify(row).includes('private'));
 t.server({server_ms:-1,model_ms:Infinity,tries:'3'});assert.equal(s.MangoiVoiceTiming.snapshot()[0].serverMs,412);
});


if(!baseline)await test('stalled STT headers/body settle at 30s and discard late result',async()=>{
 const v=voice();let resolve;v.s.fetch=()=>new Promise(r=>resolve=r);const p=v.start();await flush();v.s.MangoiVoice.stop();await flush();await v.c.advance(30000);assert.equal(await p,'');assert.equal(v.s.MangoiVoice.busy(),false);assert.equal(v.log.states.filter(x=>x.stage==='error').length,1);
 resolve({ok:true,json:async()=>({ok:true,text:'late'})});await flush();assert.equal(v.log.timings.some(x=>x.stage==='stt_finished'),false);
});
if(!baseline)await test('stalled TTS fetch falls back once and cannot replay late cloud audio',async()=>{
 const t=tts();t.s.MangoiTTS.speak('timeout',1,()=>t.log.done.push(1));await t.c.advance(15000);assert.equal(t.log.synth.length,1);assert.equal(t.log.requests.length,1);await t.respond();assert.equal(t.log.audio,undefined);t.s.MangoiTTS.stop();
});
if(!baseline)await test('stalled TTS audio body is also bounded at 15s',async()=>{
 const t=tts();t.s.MangoiTTS.speak('body timeout',1,()=>{});t.log.requests[0].res({ok:true,headers:{get:()=> 'audio/wav'},blob:()=>new Promise(()=>{})});await flush();await t.c.advance(15000);assert.equal(t.log.synth.length,1);t.s.MangoiTTS.stop();
});
await test('transient TTS failure retries once at 400ms and stop cancels that retry',async()=>{
 const t=tts();t.s.MangoiTTS.speak('retry',1,()=>{});t.log.requests[0].rej(Error('transient'));await flush();await t.c.advance(399);assert.equal(t.log.requests.length,1);await t.c.advance(1);assert.equal(t.log.requests.length,2);await t.respond(1);assert.ok(t.log.audio);t.s.MangoiTTS.stop();
 const u=tts();u.s.MangoiTTS.speak('cancel retry',1,()=>{});u.log.requests[0].rej(Error('transient'));await flush();u.s.MangoiTTS.stop();await u.c.advance(400);assert.equal(u.log.requests.length,1);assert.equal(u.log.synth.length,0);
});
if(!baseline)await test('stream queue waits for real active audio beyond 20s and progresses on completion',async()=>{
 const {s,c}=base();const calls=[];let busy=true;s.isSoundOn=()=>true;s.MangoiTTS={busy:()=>busy};s.speakText=(t,b,r,done)=>calls.push({t,done});s.FriendAutoTalk={stop(){}};
 const html=src('ai-friend.html');vm.runInContext(html.slice(html.indexOf('    var _stmGen ='),html.indexOf('    function stmShow(')),s);
 s.stmSpeak('first');s.stmSpeak('second');await flush();assert.equal(calls.length,1);await c.advance(20000);assert.equal(calls.length,1);busy=false;calls[0].done();await flush();assert.equal(calls.length,2);calls[1].done();await flush();
});
if(!baseline)await test('manual/auto mode, quiet window, stream gap, cancel and repeated-silence policies survive',async()=>{
 const {s,c}=base();let recordings=0,cancels=0;const listeners={};const input={value:'',blur(){},addEventListener(){}};const nodes={msgInput:input,friendTalkSwitch:{setAttribute(){},addEventListener(){},dataset:{}},friendTalkStatus:{dataset:{}}};
 s.parent=s;s._whisperOn=false;s.document={body:{classList:{contains:()=>false}},getElementById:id=>nodes[id],addEventListener:(n,f)=>listeners[n]=f};s.addEventListener=(n,f)=>listeners[n]=f;s.isSoundOn=()=>true;s.cancelFriendMic=()=>cancels++;s.micViaWhisper=()=>recordings++;s.MangoiVoice={busy:()=>false};s.MangoiTTS={getAudioEl:()=>null};
 vm.runInContext(src('js/aifriend-auto-talk.js'),s);const f=s.FriendAutoTalk;await c.advance(1000);assert.equal(recordings,0);
 f.setMode('auto');await c.advance(699);assert.equal(recordings,0);await c.advance(1);assert.equal(recordings,1);
 const turn=f.begin(),speech=f.aiStart();f.aiDone(speech);await c.advance(1000);assert.equal(recordings,1,'no mic between streamed sentences while send pending');f.settled(true,turn);await c.advance(700);assert.equal(recordings,2);
 f.empty('');await c.advance(700);assert.equal(recordings,3);f.empty('');await c.advance(2000);assert.equal(recordings,3);assert.equal(f.on(),false);
 f.setMode('button');f.aiDone(speech);await c.advance(1000);assert.equal(recordings,3);assert.ok(cancels>0);
});


await test('a delayed stream chunk cannot restart speech after interruption',async()=>{
 const {s}=base();let resolve,canceled=0;const shown=[];Object.assign(s,{_stmGen:0,TextDecoder,stmShow:x=>shown.push(x),stmSpeak:x=>shown.push(x)});
 const html=src('ai-friend.html');vm.runInContext(html.slice(html.indexOf('    async function stmRead('),html.indexOf('    function speakText(')),s);
 const reader={read:()=>new Promise(r=>resolve=r),cancel:async()=>{canceled++}};const p=s.stmRead({body:{getReader:()=>reader}},null,0);s._stmGen++;
 resolve({done:false,value:new TextEncoder().encode('data: {"t":"Old late sentence."}\n\n')});await flush();
 assert.equal(shown.length,0);assert.equal((await p).canceled,true);assert.equal(canceled,1);
});
if(!baseline)await test('face safety timeout pauses rather than recording over unfinished voice',async()=>{
 const {s,c}=base();let state='',help=0;s.speakText=()=>{};s.stopSpeakingNow=()=>{};s.document={getElementById:()=>null};s.MangoiTTS={busy:()=>true};
 s.setState=x=>state=x;s.showStuck=()=>help++;
 const source=src('js/aifriend-facetalk.js');const prefix=source.slice(0,source.indexOf('  /* ── 화면'));const quiet=source.slice(source.indexOf('  function waitQuiet('),source.indexOf('  async function listen('));
 vm.runInContext(prefix+'\nvar active=true,turnSeq=1;\n'+quiet+'\nwindow.faceProbe={wait:function(){return waitQuiet(1);}};})();',s);let done;
 s.faceProbe.wait().then(x=>done=x);await c.advance(60500);assert.equal(done,false);assert.equal(state,'pause');assert.equal(help,1);
});
if(!baseline)await test('new utterance pauses old audio before waiting for replacement synthesis',async()=>{
 const t=tts();t.s.MangoiTTS.speak('Old');await t.respond();assert.equal(t.log.audio.paused,false);t.s.MangoiTTS.speak('New');assert.equal(t.log.audio.paused,true);t.s.MangoiTTS.stop();
});

if(!baseline)await test('missing device voice cannot leave synthesis busy forever',async()=>{
 const t=tts();delete t.s.speechSynthesis;t.s.MangoiTTS.speak('No fallback',1,()=>t.log.done.push(1));t.log.requests[0].rej(Object.assign(Error('quota'),{noRetry:true}));await flush();assert.equal(t.log.done.length,1);assert.equal(t.s.MangoiTTS.busy(),false);
});

function friendRequestFixture(){
 const e=base(),{s,c}=e,events={messages:[],aborted:0};const nodes={msgInput:{value:'Synthetic request',dispatchEvent(){},focus(){}},sendBtn:{disabled:false}};
 Object.assign(s,{console:{error(){}},_pendingVoice:false,_pendingVoiceTrace:null,_friendRequestAbort:null,_speechGeneration:0,_stmGen:0,_stmChain:Promise.resolve(),_stmRow:null,_stmSpoke:false,currentLevel:'S1',currentPersona:'friendly',currentTopic:null,currentSub:1,TextDecoder,Event:class{},getAuth:async()=>({uid:'guest_fixture',token:'synthetic'}),maybeAdjustRate(){},personNow:()=> 'mango',fixCardClear(){},appendMsg:(r,t)=>events.messages.push({r,t}),sndPop(){},appendTyping(){},removeTyping(){},showFixCard(){},applyGam(){},isSoundOn:()=>false,stmShow(){},stmSpeak(){},stmReset(){s._stmGen++},document:{getElementById:id=>nodes[id],querySelector:()=>null,querySelectorAll:()=>[]}});
 const html=src('ai-friend.html');vm.runInContext(html.slice(html.indexOf('    async function sendMsg('),html.indexOf('    /* ⏹ B — 글로 말을 걸 때도')),s);
 vm.runInContext(html.slice(html.indexOf('    async function stmRead('),html.indexOf('    function speakText(')),s);
 vm.runInContext(html.slice(html.indexOf('    function stopSpeakingNow('),html.indexOf('    function stmSpeak(')),s);
 return {...e,events,nodes};
}
if(!baseline)await test('AI friend hung response times out and releases controls',async()=>{
 const e=friendRequestFixture();e.s.fetch=(url,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>{e.events.aborted++;reject(Error('fixture timeout'))}));let settled=false;const p=e.s.sendMsg().then(()=>settled=true);await flush();await e.c.advance(30000);assert.equal(settled,true);await p;assert.equal(e.events.aborted,1);assert.equal(e.nodes.sendBtn.disabled,false);assert.equal(e.s._friendRequestAbort,null);
});
if(!baseline)await test('AI friend interrupt aborts pending request without a stale error bubble',async()=>{
 const e=friendRequestFixture();e.s.fetch=(url,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>{e.events.aborted++;reject(Error('fixture canceled'))}));const p=e.s.sendMsg();await flush();e.s.stopSpeakingNow();await p;assert.equal(e.events.aborted,1);assert.equal(e.events.messages.filter(x=>x.r==='ai').length,0);assert.equal(e.nodes.sendBtn.disabled,false);
});
if(!baseline)await test('AI friend active long stream refreshes inactivity deadline',async()=>{
 const e=friendRequestFixture();let n=0;e.s.fetch=async(url,o)=>{o.signal.addEventListener('abort',()=>e.events.aborted++);return {ok:true,headers:{get:()=> 'text/event-stream'},body:{getReader:()=>({read:()=>new Promise(resolve=>e.c.setTimeout(()=>{n++;resolve(n<3?{done:false,value:new TextEncoder().encode(n===1?'data: {"t":"First."}\n\n':'data: {"done":1,"ok":true,"reply":"First."}\n\n')}:{done:true})},n<2?20000:1000)),cancel:async()=>{}})}}};const p=e.s.sendMsg();await flush();await e.c.advance(42000);await p;assert.equal(e.events.aborted,0);assert.equal(e.events.messages.filter(x=>x.r==='ai').length,1);assert.equal(e.nodes.sendBtn.disabled,false);
});


if(!baseline)await test('preference hydration keeps face speech completion in one accounting generation',async()=>{
 const {s}=base();let ready,completed=0;const calls=[];s.friendRatePreference={loaded:false,ready:new Promise(r=>ready=r)};
 Object.assign(s,{_stmGen:0,_speechGeneration:0,_ttsLangSet:true,personNow:()=> 'mango',speakerFor:()=> 'luna',charForPerson:x=>x,rateFor:()=>1,currentRate:1,stopSpeakingNow(){},document:{querySelectorAll:()=>[],getElementById:()=>null},MangoAvatar:{plainStop(){},setCharacter(){}},MangoiTTS:{setSpeaker(){},speak(t,r,done){calls.push(done)}}});
 const html=src('ai-friend.html');vm.runInContext(html.slice(html.indexOf('    function speakText('),html.indexOf('    /* ══ 🎤')),s);
 const face=src('js/aifriend-facetalk.js');vm.runInContext(face.slice(0,face.indexOf('  /* ── 화면'))+'\n})();',s);
 s.speakText('Fixture voice',null,null,()=>completed++);s.friendRatePreference.loaded=true;ready();await flush();assert.equal(calls.length,1);calls[0]();assert.equal(completed,1);
});

console.log(`ai_voice_latency_harness: PASS ${pass} / FAIL ${fail}`);
if(process.env.RESULT_PATH)writeFileSync(process.env.RESULT_PATH,JSON.stringify({kind:'virtual-clock source tests; synthetic amplitude/provider doubles',pass,fail,findings},null,2));
process.exitCode=fail?1:0;
