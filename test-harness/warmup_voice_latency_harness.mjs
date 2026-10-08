// Executes warmup source with deterministic browser/provider doubles; no live audio/network.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.env.VOICE_SOURCE_ROOT||'.'),baseline=process.argv.includes('--baseline');
const html=readFileSync(resolve(root,'cloudflare-deploy/public/warmup.html'),'utf8');
const require=createRequire(import.meta.url);
const ts=require(resolve(root,'cloudflare-deploy/node_modules/typescript'));
const parsed=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>!(/\bsrc=|application\/ld\+json/.test(m[1]))).map((m,i)=>ts.createSourceFile('inline'+i+'.js',m[2],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS));
function fn(name){for(const file of parsed){let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(file);if(!found)ts.forEachChild(node,visit);}visit(file);if(found)return found;}throw Error('missing function '+name);}

let pass=0,fail=0;const failures=[];async function test(name,f){try{await f();pass++;console.log('PASS '+name);}catch(e){fail++;failures.push({name,error:e.message});console.log('FAIL '+name+': '+e.message);}}
async function flush(){for(let i=0;i<18;i++)await Promise.resolve();}
function clock(){let now=0,id=0;const timers=new Map();return {get now(){return now},setTimeout(f,ms=0){timers.set(++id,{at:now+ms,f});return id},clearTimeout(i){timers.delete(i)},async advance(ms){const end=now+ms;for(;;){await flush();const due=[...timers].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].f();}now=end;await flush();}};}
function env(){const c=clock(),events={stops:0,starts:0,lat:0,synth:[],output:[],hooks:[]};const s={warmupRatePreference:{loaded:true,ready:Promise.resolve()},console:{info(){},warn(){},error(){}},Date:class extends Date{static now(){return c.now}},performance:{now:()=>c.now},setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,AbortController,TextDecoder,_speakSeq:0,_speechOn:true,_warmPaused:false,_warmEpoch:1,_warmVoiceEpoch:1,_enVoice:{lang:'en-US'},_rateLevel:0,RATE_STEPS:[.8],AUDIO_RATE:[.8],_warmLang:'en',_ttsCache:{},_ttsEng:{},_ttsAudio:null,_speakLiveNext:null,_stmCur:null,_latCur:null,_warmTurnTrace:null,_speechEverStarted:false,_lastAiSpeak:'',_mixIdx:0,
 isZh:()=>false,_voiceGender:()=> 'female',_zhMaleVoiceReady:()=>false,pickVoice(){},_speechText:x=>String(x),_speechChunks:x=>[x],nextSpeaker:()=> 'luna',_zhMaleWanted:()=>false,_enMaleRate:x=>x,_enMaleGapMs:()=>0,_autoHook:x=>events.hooks.push(x),_latMark:()=>events.lat++,MangoAvatar:{plainStop(){events.stops++},plainStart(){events.starts++},attach(){}},localStorage:{getItem:()=>null,setItem(){}},location:{search:''},SpeechSynthesisUtterance:class{},speechSynthesis:{cancel(){},speak(u){events.synth.push(u)}},URL:{createObjectURL:()=> 'blob:fixture'}};
 s.Audio=class{constructor(){events.audio=this;this.paused=true}play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}};s.window=s;vm.createContext(s);return {s,c,events};}
await test('slow first output over15s is measured rather than presumed to be replay',async()=>{const {s,c}=env();s._latOn=()=>false;s._latCur={t0:100,t1:200,wait:1300,tStop:50};vm.runInContext(fn('_latMark'),s);await c.advance(17000);s._latMark();assert.equal(s.__warmLat?.length,1);assert.equal(s.__warmLat[0].voice,16800);});
await test('late canceled device voice cannot stop the new avatar or finish current output',async()=>{const {s,events}=env();vm.runInContext(fn('_synthSpeak'),s);let done=0;s._synthSpeak('old',null,()=>done++);const old=events.synth[0];s._speakSeq++;s._synthSpeak('new',null,()=>done++);const before=events.stops;old.onend();assert.equal(events.stops,before);assert.equal(done,0);});
await test('device voice completion is idempotent across error and end callbacks',async()=>{const {s,events}=env();vm.runInContext(fn('_synthSpeak'),s);let done=0;s._synthSpeak('same',null,()=>done++);events.synth[0].onerror();events.synth[0].onend();assert.equal(done,1);});
await test('late canceled cloud audio callback cannot stop current avatar',async()=>{const {s,events}=env();s._ttsCache={'luna|old':'blob:old','luna|new':'blob:new'};vm.runInContext(fn('_stopSpeak')+'\n'+fn('speak'),s);s.speak('old');await flush();const old=events.audio.onended;s.speak('new');await flush();const before=events.stops;old();assert.equal(events.stops,before);});
if(!baseline)await test('output timing waits for actual playing event and ignores replay',async()=>{const {s,c,events}=env();vm.runInContext(readFileSync(resolve(root,'cloudflare-deploy/public/js/ai-voice-timing.js'),'utf8'),s);const trace=s.MangoiVoiceTiming.begin('auto','warmup-whisper');trace.mark('input_requested');s._warmTurnTrace=trace;s._ttsCache={'luna|reply':'blob:reply'};vm.runInContext(fn('_stopSpeak')+'\n'+fn('speak'),s);s.speak('reply');await flush();assert.equal(s.MangoiVoiceTiming.snapshot()[0].inputToOutputMs,null);await c.advance(80);events.audio.onplaying();assert.equal(s.MangoiVoiceTiming.snapshot()[0].inputToOutputMs,80);events.audio.onended();const before=JSON.stringify(s.MangoiVoiceTiming.snapshot());s.speak('reply',{classList:{add(){},remove(){}}});await flush();await c.advance(80);events.audio.onplaying();assert.equal(JSON.stringify(s.MangoiVoiceTiming.snapshot()),before);});

if(!baseline)await test('warmup Whisper -> send -> synthesis -> playing measures each real source boundary',async()=>{
 const {s,c,events}=env();vm.runInContext(readFileSync(resolve(root,'cloudflare-deploy/public/js/ai-voice-timing.js'),'utf8'),s);
 const nodes={inp:{value:''},sendBtn:{disabled:false},wgState:{}};s.document={getElementById:id=>nodes[id],createElement:()=>({remove(){}})};
 Object.assign(s,{_whisperOn:false,_whisperUserStop:false,_recognizing:false,_warmPendingTrace:null,_warmInputTrace:null,_latSilence:null,_ttsFellBack:false,_micManual:()=>false,setMicState(){},_setListenLabel(){},wuT:x=>x,sending:false,maybeAdjustRate(){},ansCardClear(){},fixCardClear(){},bumpCombo(){},showFixCard(){},showAnswerChips(){},SESSION_ID:'synthetic-session',withCtx:x=>x,warmupEndpoint:()=>'/api/warmup/chat',_stmWanted:()=>false,log:{appendChild(){},scrollHeight:0}});
 s.addMsg=(text,role)=>{if(role==='ai')s.speak(text)};
 const sleep=ms=>new Promise(r=>c.setTimeout(r,ms));
 s.MangoiVoice={supported:()=>true,record:async opts=>{
   opts.onTiming('input_requested');opts.onTiming('recording_started');opts.onState('speaking');opts.onTiming('speech_started');
   await sleep(100);opts.onTiming('speech_last');await sleep(20);opts.onTiming('recording_stopped','silence');opts.onTiming('stt_started');await sleep(130);opts.onTiming('stt_finished');return 'Fixture sentence.';
 }};
 const sent=[];s.warmupFetch=async(url,opts)=>{sent.push(JSON.parse(opts.body));await sleep(80);return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({ai_response:'Hello fixture.'})};};
 s.fetch=async()=>{await sleep(120);return {ok:true,status:200,headers:{get:n=>n==='content-type'?'audio/wav':''},blob:async()=>({})};};
 s.Audio=class{constructor(){events.audio=this}play(){c.setTimeout(()=>this.onplaying?.(),80);return Promise.resolve()}pause(){}};
 vm.runInContext(['_stopSpeak','_warmTtsFetch','_ttsSpeak','speak','micViaWhisper','sendMsg'].map(fn).join('\n'),s);
 const p=s.micViaWhisper();await c.advance(550);await p;await flush();
 const row=s.MangoiVoiceTiming.snapshot()[0];assert.equal(row.source,'warmup-whisper');assert.equal(row.endOfTurnMs,20);assert.equal(row.transcriptionRoundTripMs,130);assert.equal(row.responseRoundTripMs,80);assert.equal(row.synthesisRoundTripMs,120);assert.equal(row.playbackStartMs,80);assert.equal(row.responseAfterSpeechMs,430);assert.equal(row.inputToOutputMs,530);
 assert.equal(sent.length,1);assert.equal(sent[0].session_id,'synthetic-session');assert.ok(!JSON.stringify(row).includes('Fixture sentence'));
 events.audio.onended();assert.equal(s._warmTurnTrace,null);assert.equal(s._warmPendingTrace,null);
});
if(!baseline)await test('native recognition result times are never labeled acoustic speech-end or provider-only STT',async()=>{
 const {s,c}=env();vm.runInContext(readFileSync(resolve(root,'cloudflare-deploy/public/js/ai-voice-timing.js'),'utf8'),s);const t=s.MangoiVoiceTiming.begin('auto','warmup-browser');t.mark('input_requested');t.mark('recording_started');await c.advance(200);t.mark('recognition_first_result');t.mark('recognition_last_result');await c.advance(1300);t.mark('recording_stopped','silence');t.mark('recognition_finished');const r=s.MangoiVoiceTiming.snapshot()[0];assert.equal(r.nativeFirstResultMs,200);assert.equal(r.nativeResultToStopMs,1300);assert.equal(r.endOfTurnMs,null);assert.equal(r.transcriptionRoundTripMs,null);
});
if(!baseline)await test('warmup TTS headers and stalled body share a bounded deadline',async()=>{
 for(const phase of ['headers','body']){const {s,c}=env();s.fetch=phase==='headers'?()=>new Promise(()=>{}):async()=>({ok:true,status:200,headers:{get:()=> 'audio/wav'},blob:()=>new Promise(()=>{})});vm.runInContext(fn('_warmTtsFetch'),s);let err;const p=s._warmTtsFetch('/api/voice/tts',{}).catch(e=>err=e);await c.advance(15000);await p;assert.equal(err?.message,'tts_timeout');assert.equal(err?.noRetry,true);}
});
if(!baseline)await test('warmup manual Whisper preserves explicit-stop requirement and long capture options',async()=>{
 const {s}=env();const sent=[],held=[];s._micManual=()=>true;s._whisperOn=false;s.MIC_MANUAL_IDLE=30000;s.MIC_MANUAL_MAX=180000;s.setMicState=()=>{};s._setListenLabel=()=>{};s.wuT=x=>x;s._micManualHold=x=>held.push(x);s.sendMsg=()=>sent.push(1);s.addMsg=()=>{};s.document={getElementById:()=>({value:''})};
 let opts;s.MangoiVoice={supported:()=>true,record:async o=>{opts=o;o.onState('speaking',{});return 'Long slow fixture';}};vm.runInContext(fn('micViaWhisper'),s);await s.micViaWhisper();assert.equal(opts.silenceMs,30000);assert.equal(opts.maxMs,180000);assert.equal(sent.length,0);assert.equal(held.length,1);
 s.MangoiVoice.record=async o=>{o.onState('speaking',{});s._whisperUserStop=true;return 'Explicitly stopped fixture';};await s.micViaWhisper();assert.equal(sent.length,1);
});


if(!baseline)for(let repeat=0;repeat<3;repeat++)for(const scenario of [
 {name:'complete short',text:'I like pizza',wait:1300},
 {name:'complete long',text:'Yesterday I visited the park with my family and played a long game of soccer',wait:1300},
 {name:'incomplete',text:'I want to',wait:5000},
 {name:'slow continuation',text:'I want to',pause:2000,last:'I want to visit my friend',wait:1300},
 {name:'incomplete grammar preserved',text:'I go school yesterday',wait:1300}
])await test('native source '+scenario.name+' repeat '+(repeat+1),async()=>{
 const {s,c}=env();vm.runInContext(readFileSync(resolve(root,'cloudflare-deploy/public/js/ai-voice-timing.js'),'utf8'),s);const trace=s.MangoiVoiceTiming.begin('auto','warmup-browser');trace.mark('input_requested');s._warmInputTrace=trace;
 const input={value:''},sent=[];Object.assign(s,{_micManual:()=>false,_micBase:'',_micSess:'',_micBySilence:false,_micStopWanted:false,_micUserStop:false,_micRestarts:0,_micT0:0,_micWhisperRetried:false,MIC_MANUAL_IDLE:30000,MIC_MANUAL_MAX:180000,setMicState(){},addMsg(){},sendMsg(){sent.push(input.value)},document:{getElementById:()=>input},MangoiVoice:{supported:()=>false}});
 s.SpeechRecognition=class{start(){this.onstart?.()}stop(){this.onend?.()}};
 vm.runInContext(html.match(/var MIC_DANGLING=(\/.*\/i);/)[0]+'\n'+fn('micUnfinished')+'\n'+fn('_startSttSession'),s);s._startSttSession();
 function emit(text){s._recog.onresult({results:[[{transcript:text}]]})}
 await c.advance(100);emit(scenario.text);
 if(scenario.pause){await c.advance(scenario.pause);assert.equal(sent.length,0);emit(scenario.last);}
 await c.advance(scenario.wait-1);assert.equal(sent.length,0);await c.advance(1);assert.deepEqual(sent,[scenario.last||scenario.text]);
 const row=s.MangoiVoiceTiming.snapshot()[0];assert.equal(row.nativeResultToStopMs,scenario.wait);assert.equal(row.endOfTurnMs,null);assert.equal(s._warmPendingTrace,trace);
});


await test('quietly canceled native recognition ignores later transcript callbacks',async()=>{
 const {s,c}=env();const input={value:''},sent=[];Object.assign(s,{_warmInputTrace:null,_whisperOn:false,_recognizing:false,_warmMicCancel:null,_micManual:()=>false,_micBase:'',_micSess:'',_micBySilence:false,_micStopWanted:false,_micUserStop:false,_micRestarts:0,_micT0:0,_micWhisperRetried:false,MIC_MANUAL_IDLE:30000,MIC_MANUAL_MAX:180000,setMicState(x){s._recognizing=x},addMsg(){},sendMsg(){sent.push(input.value)},document:{getElementById:()=>input},MangoiVoice:{supported:()=>false}});
 s.SpeechRecognition=class{start(){this.onstart?.()}stop(){this.onend?.()}};
 vm.runInContext(html.match(/var MIC_DANGLING=(\/.*\/i);/)[0]+'\n'+fn('micUnfinished')+'\n'+fn('_micAbortQuiet')+'\n'+fn('_startSttSession'),s);
 s._startSttSession();const old=s._recog;old.onresult({results:[[{transcript:'I want to'}]]});s._micAbortQuiet();const before=input.value;old.onresult({results:[[{transcript:'Late canceled sentence'}]]});assert.equal(input.value,before);await c.advance(6000);assert.equal(sent.length,0);
});

console.log(`warmup_voice_latency_harness: PASS ${pass} / FAIL ${fail}`);
if(process.env.RESULT_PATH)writeFileSync(process.env.RESULT_PATH,JSON.stringify({kind:'warmup actual source with virtual clock and speech/provider doubles',pass,fail,failures},null,2));process.exitCode=fail?1:0;
