// Execute shipped pizza controls with deterministic microphone, clock and DOM.
// Providers are fakes: this verifies lifecycle and scoring, not acoustic accuracy.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../cloudflare-deploy/public/student-game-grammar-pizza.html',import.meta.url),'utf8');
const stt=readFileSync(new URL('../cloudflare-deploy/public/js/mangoi-stt.js',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('var recognition = null'),html.indexOf('\nfunction norm(s)'));
const listen=html.slice(html.indexOf("$('btn-listen').onclick = function(){"),html.indexOf('\n/* 💯'));
const mic=html.slice(html.indexOf("$('btn-speak').onclick = function(){"),html.indexOf('\nfunction missionComplete('));
let pass=0;
function ck(name,condition){assert.ok(condition,name);pass++;}
function setup({native=true,record=true,startThrows=false,noEnd=false}={}){
  let now=0,id=0; const timers=new Map(), els={}, events={}, attempts=[], records=[], states=[];
  const env={console,GLANG:'en',missionActive:true,listenCount:1,speakCount:0,speakAttempts:0,PERFECT_SC:.98,awaitingStart:false,
    setTimeout:(fn,ms=0)=>{timers.set(++id,{at:now+ms,fn});return id;},clearTimeout:n=>timers.delete(n),Date:{now:()=>now},
    $:k=>els[k]||(els[k]={textContent:'',disabled:false,hidden:false,setAttribute(){}}),
    addEventListener:(name,fn)=>events[name]=fn,document:{hidden:false,addEventListener:(n,fn)=>events[n]=fn},
    _pzStop:()=>states.push('tts-stop'),sentenceText:()=>env.GLANG==='zh'?'我喜欢苹果':'I like blue cars',
    langOf:()=>env.GLANG==='zh'?'zh-CN':'en-US',matchScore:(a,b)=>a.toLowerCase()===b.toLowerCase()?1:0,
    speakSuccess:sc=>attempts.push(sc),_pzRemember:ok=>attempts.push(ok),
    renderDots(){},speak:(text,done)=>{env.ttsDone=done;states.push('tts');},nextSentence:()=>states.push('next'),
  };
  class SR{
    constructor(){env.last=this;this.results=[];this.starts=0;}
    start(){if(startThrows)throw new Error('start');this.starts++;this.results=[];this.onstart?.();}
    abort(){this.aborted=true;}
    stop(){if(!noEnd)this.onend?.();}
    say(text,final=true){const r=[{transcript:text}];r.isFinal=final;this.results=[r];this.onresult?.({results:this.results});}
    error(code){this.onerror?.({error:code});}
  }
  env.SR=native?SR:null;
  env.MangoiVoice={supported:()=>record,cancel:()=>states.push('cancel'),stop:()=>states.push('stop'),
    record:opts=>{records.push(opts);return new Promise(resolve=>env.resolve=resolve);}};
  env.window=env;vm.createContext(env);vm.runInContext(stt+'\n'+helpers+'\n'+listen+'\n'+mic,env);
  return {env,els,attempts,records,states,events,click:()=>env.$('btn-speak').onclick(),
    tick(ms){const end=now+ms;for(let n=0;n<1000;n++){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].fn();}now=end;},
    text:()=>env.$('speech-result').textContent};
}
{
 const t=setup();t.click();ck('microphone announces actual start',/준비됐어요/.test(t.text()));
 ck('listen disabled during microphone',t.els['btn-listen'].disabled);
 t.env.$('btn-listen').onclick();ck('listen cannot interrupt microphone',!t.states.includes('tts'));
 t.env.last.say('I like',true);t.env.last.onend();ck('browser end restarts unfinished sentence',t.env.last.starts===2&&t.attempts.length===0);
 t.env.last.say('blue cars');ck('segments survive restart and count one perfect attempt',t.attempts[0]===1&&t.env.speakAttempts===1);
 ck('microphone stopped and controls restored',t.env.last.aborted&&!t.env.listening&&!t.els['btn-listen'].disabled);
}
{
 const t=setup();t.click();t.env.last.say('I like blue cars',false);ck('interim exact match earns no points',t.attempts.length===0);
 t.env.last.say('I like red bikes',true);t.click();ck('latest correction beats earlier perfect interim',t.attempts[0]===false&&t.env.speakAttempts===1);
 ck('wrong answer remains visible without forced playback',/들린 말/.test(t.text())&&!t.states.includes('tts'));
 t.click();t.env.last.say('I like blue cars');ck('retry starts fresh and counts both attempts',t.attempts[1]===1&&t.env.speakAttempts===2);
}
for(const code of ['not-allowed','audio-capture','network','service-not-allowed']){
 const t=setup();t.click();const old=t.env.last.onend;t.env.last.error(code);old();
 ck(code+' remains actionable after late end',!t.env.listening&&t.text().length>15&&t.attempts.length===0);
 ck(code+' exposes no-points exit',t.els['btn-practice-next'].hidden===false);
 if(code==='network'){t.click();ck('network failure next click uses recorder only',t.records.length===1&&t.env.last.starts===1);}
}
{
 const t=setup({startThrows:true});t.click();ck('synchronous start failure unlocks controls',!t.env.listening&&!t.els['btn-speak'].disabled&&t.attempts.length===0);
}
{
 const t=setup({noEnd:true});t.click();t.tick(11000);ck('child gets twelve seconds for first words',t.env.listening);
 t.tick(2500);ck('missing end event cannot wedge microphone',!t.env.listening&&t.attempts.length===0);
}
{
 const t=setup();t.click();const late=t.env.last.onresult;t.env._pzCancelMissionAudio();
 const r=[{transcript:'I like blue cars'}];r.isFinal=true;late({results:[r]});
 t.tick(45000);ck('canceled sentence ignores late results and timers',t.attempts.length===0&&!t.env.listening);
}
{
 const t=setup();t.env.$('btn-listen').onclick();t.click();ck('TTS blocks microphone start',!t.env.last);
 t.env.ttsDone();ck('listening completion restores microphone',!t.els['btn-speak'].disabled);
 for(let i=0;i<4;i++){t.env.$('btn-listen').onclick();t.env.ttsDone();}
 ck('listening remains available after three plays',t.env.listenCount===6&&!t.els['btn-listen'].disabled);
 t.env.$('btn-listen').onclick();const done=t.env.ttsDone;t.env._pzCancelMissionAudio();const count=t.env.listenCount;done();
 ck('old TTS completion cannot unlock a new sentence',t.env.listenCount===count);
}
{
 const t=setup({native:false});t.click();ck('unsupported native uses real recording interface',t.records.length===1&&t.attempts.length===0);
 t.records[0].onState('waiting',{});t.click();ck('recording stop is wired',t.states.includes('stop'));
 t.env.resolve('I like blue cars');await Promise.resolve();ck('recorder transcript gets same scoring',t.attempts[0]===1&&t.env.speakAttempts===1);
}
{
 const t=setup({native:false});t.env.GLANG='zh';t.click();ck('Chinese recorder receives Chinese language hint',t.records[0].lang==='zh');
 t.env.resolve('我喜欢苹果');await Promise.resolve();ck('Chinese transcript accepted through same lifecycle',t.attempts[0]===1);
}
{
 const t=setup({native:false,record:false});t.click();ck('no recognition never creates a success',t.attempts.length===0&&t.env.speakAttempts===0);
 t.env.$('btn-practice-next').onclick();ck('practice exit progresses without reward',t.states.includes('next')&&t.attempts.length===0);
}
{
 const t=setup({native:false});t.click();t.tick(45000);ck('hung transcription releases controls',!t.env.listening&&/응답/.test(t.text()));
 t.env.resolve('I like blue cars');await Promise.resolve();ck('late transcription after timeout never earns points',t.attempts.length===0);
}
{
 const t=setup();t.click();t.env.document.hidden=true;t.events.visibilitychange();ck('hidden tab cancels microphone',!t.env.listening&&t.env.last.aborted);
 t.click();t.events.pagehide();ck('leaving game cancels microphone',!t.env.listening&&t.env.last.aborted);
}
// TTS uses its real sequence guards: timed-out requests cannot play over the microphone.
{
 const t=setup();const e=t.env;const requests=[],plays=[];let done=0;
 e.voiceCache={};e.RATE_BY_DIFF=[1];e.DIFF=1;
 e.URL={createObjectURL:()=> 'blob:audio'};
 e.fetch=()=>new Promise(resolve=>requests.push(resolve));
 e.Audio=class{pause(){} play(){plays.push('audio');return Promise.resolve();}};
 e.speechSynthesis={cancel(){},getVoices(){return [];},speak:u=>{plays.push('synth');e.utterance=u;}};
 e.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 e.voiceFor=()=>null;
 vm.runInContext(html.slice(html.indexOf('var _pzAudio = null'),html.indexOf('/* 재료 클릭 즉시')),e);
 e.speak('I like blue cars',()=>done++);t.tick(2500);
 for(let i=0;i<5;i++)await Promise.resolve();
 ck('slow TTS starts device fallback after bounded wait',plays.join() === 'synth');
 e.utterance.onend();ck('TTS completes only once',done===1);
 requests[0]({ok:true,headers:{get:()=> 'audio/mpeg'},blob:()=>Promise.resolve({})});
 for(let i=0;i<8;i++)await Promise.resolve();
 ck('late server TTS never plays after fallback',plays.join()==='synth');
 e.speak('another sentence',()=>done++);e._pzStop();t.tick(15000);
 for(let i=0;i<5;i++)await Promise.resolve();
 ck('canceled TTS never resumes or completes old mission',done===1&&plays.length===1);
}
console.log('pizza_speech_harness — PASS '+pass+' / FAIL 0');
