/* Mango-i School Escape Audio v1
   Child-safe suspense soundscape + musical bed. Isolated from WebRTC tracks. */
(function(){
'use strict';
var KEY='mangoi_school_escape_audio_v1';
var ctx,master,bgmBus,sfxBus,musicBus,noiseBuf,ambientNodes=[],timers=[],ducked=false,tension=.15;
var cfg={on:true,bgm:true,sfx:true,vol:.48};
try{var saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved)Object.assign(cfg,saved);}catch(_){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(cfg));}catch(_){}}
function init(){
  if(ctx)return ctx;
  try{
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain();bgmBus=ctx.createGain();musicBus=ctx.createGain();sfxBus=ctx.createGain();
    bgmBus.connect(master);musicBus.connect(master);sfxBus.connect(master);master.connect(ctx.destination);
    var len=ctx.sampleRate*2;noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
    var d=noiseBuf.getChannelData(0);for(var i=0;i<len;i++)d[i]=Math.random()*2-1;
    mix();
  }catch(_){ctx=null}
  return ctx;
}
function resume(){var a=init();if(a&&a.state==='suspended')try{a.resume()}catch(_){}}
function mix(){
  if(!ctx)return;var t=ctx.currentTime;
  master.gain.setTargetAtTime(cfg.on?Math.max(0,Math.min(1,cfg.vol)):0,t,.03);
  bgmBus.gain.setTargetAtTime(cfg.bgm?(ducked?.045:(.12+.08*tension)):0,t,.05);
  musicBus.gain.setTargetAtTime(cfg.bgm?(ducked?.03:(.08+.06*tension)):0,t,.05);
  sfxBus.gain.setTargetAtTime(cfg.sfx?.8:0,t,.03);
}
function later(fn,ms){var id=setTimeout(fn,ms);timers.push(id);return id}
function clearTimers(){timers.forEach(clearTimeout);timers=[]}
function env(bus,v,t,d,a,r){var g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t+(a||.008));g.gain.exponentialRampToValueAtTime(.0001,t+d+(r||.08));g.connect(bus);return g}
function tone(f,d,type,v,t,bus){
  if(!init())return;t=t==null?ctx.currentTime:t;var o=ctx.createOscillator(),g=env(bus||sfxBus,v||.08,t,d||.1);
  o.type=type||'sine';o.frequency.value=f;o.connect(g);o.start(t);o.stop(t+(d||.1)+.12);return o;
}
function sweep(a,b,d,v,t,bus){if(!init())return;t=t==null?ctx.currentTime:t;var o=ctx.createOscillator(),g=env(bus||sfxBus,v||.06,t,d||.3);o.type='sawtooth';o.frequency.setValueAtTime(a,t);o.frequency.exponentialRampToValueAtTime(Math.max(25,b),t+d);o.connect(g);o.start(t);o.stop(t+d+.12)}
function nz(d,v,lo,hi,t,bus){
  if(!init())return;t=t==null?ctx.currentTime:t;var src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=env(bus||sfxBus,v||.035,t,d||.2);
  src.buffer=noiseBuf;f.type='bandpass';f.frequency.value=(lo+hi)/2;f.Q.value=.7;src.connect(f);f.connect(g);src.start(t);src.stop(t+d+.1);
}
function click(t,v){t=t==null?ctx.currentTime:t;nz(.035,v||.07,900,4200,t);tone(270,.03,'square',(v||.07)*.45,t)}
function thump(t,v){t=t==null?ctx.currentTime:t;sweep(105,48,.14,v||.14,t);nz(.07,(v||.14)*.42,45,260,t)}
function ping(f,t,v){t=t==null?ctx.currentTime:t;tone(f||950,.26,'triangle',v||.05,t);tone((f||950)*1.48,.14,'sine',(v||.05)*.42,t+.01)}
function sfx(name){
  if(!cfg.on||!cfg.sfx)return;resume();var t=ctx.currentTime;
  if(name==='success'){tone(660,.09,'triangle',.07,t);tone(990,.16,'triangle',.075,t+.1)}
  else if(name==='wrong')sweep(220,170,.15,.048,t);
  else if(name==='tick')click(t,.022);
  else if(name==='alarm'){tone(880,.1,'square',.05,t);tone(660,.11,'square',.045,t+.14)}
  else if(name==='doorRattle'){click(t,.1);sweep(180,105,.32,.055,t+.05);click(t+.34,.07)}
  else if(name==='doorOpen'){click(t,.11);sweep(175,78,.62,.07,t+.08);nz(.5,.04,90,1000,t+.1);later(function(){thump(null,.08)},610)}
  else if(name==='keyTurn'){click(t,.11);click(t+.09,.09);sweep(260,145,.18,.055,t+.15)}
  else if(name==='computerOn'){tone(190,.07,'sine',.06,t);tone(330,.08,'sine',.075,t+.09);tone(520,.16,'sine',.085,t+.19);nz(.18,.02,500,4200,t+.18)}
  else if(name==='keyboard'){[0,.055,.105,.16].forEach(function(dt){click(t+dt,.035)})}
  else if(name==='mailSend'){tone(520,.07,'sine',.055,t);tone(740,.08,'triangle',.065,t+.08);tone(990,.13,'triangle',.075,t+.17)}
  else if(name==='note'){nz(.18,.03,300,2500,t);ping(1300,t+.1,.035)}
  else if(name==='footsteps'){[0,.38,.72,1.09].forEach(function(dt,i){nz(.065,.04,55,320,t+dt);sweep(88+i*2,58,.07,.052,t+dt)})}
  else if(name==='locker'){click(t,.05);thump(t+.06,.09);ping(510,t+.11,.026)}
  else if(name==='bell'){tone(784,.42,'sine',.045,t);tone(1046,.36,'triangle',.025,t+.02)}
  else if(name==='flicker'){for(var i=0;i<4;i++)later(function(){nz(.055,.028,900,5200)},i*120)}
  else if(name==='relief'){[523,659,784,1046].forEach(function(f,i){tone(f,.3,'triangle',.055,t+i*.12)})}
}
function stopAmbient(){clearTimers();ambientNodes.forEach(function(n){try{n.stop()}catch(_){}try{n.disconnect()}catch(_){}});ambientNodes=[]}
function loopNoise(freq,vol){
  var src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=noiseBuf;src.loop=true;f.type='bandpass';f.frequency.value=freq;f.Q.value=.75;g.gain.value=vol;
  src.connect(f);f.connect(g);g.connect(bgmBus);src.start();ambientNodes.push(src,f,g);
}
function startMusic(){
  if(!ctx||!cfg.bgm)return;
  function phrase(){
    if(!cfg.on||!cfg.bgm)return;
    var t=ctx.currentTime+.05, notes=tension>.62?[220,277.18,329.63,415.3]:[220,261.63,329.63,392];
    notes.forEach(function(f,i){tone(f,.8,'sine',.018+(tension*.008),t+i*.68,musicBus);tone(f*2,.45,'triangle',.006,t+i*.68+.01,musicBus)});
    later(phrase,4700-Math.round(tension*900));
  }
  phrase();
}
function start(){
  if(!init())return;resume();stopAmbient();if(!cfg.on||!cfg.bgm)return;
  var hum=ctx.createOscillator(),hg=ctx.createGain();hum.type='sine';hum.frequency.value=59.8;hg.gain.value=.018;hum.connect(hg);hg.connect(bgmBus);hum.start();ambientNodes.push(hum,hg);
  var air=ctx.createOscillator(),ag=ctx.createGain();air.type='sine';air.frequency.value=119.6;ag.gain.value=.008;air.connect(ag);ag.connect(bgmBus);air.start();ambientNodes.push(air,ag);
  loopNoise(1150,.008);startMusic();scheduleRoom();
}
function scheduleRoom(){
  if(!cfg.on||!cfg.bgm)return;
  later(function(){
    var r=Math.random();
    if(r<.34)sfx('footsteps');else if(r<.58)sfx('locker');else if(r<.77)sfx('flicker');else sfx('bell');
    scheduleRoom();
  },12000+Math.random()*15000);
}
function step(id){
  if(id==='door1')sfx('doorRattle');
  else if(id==='computer')later(function(){sfx('computerOn')},120);
  else if(id==='note')sfx('note');
  else if(id==='password'){sfx('keyboard');later(function(){sfx('computerOn')},300)}
  else if(id==='email'){sfx('keyboard');later(function(){sfx('mailSend')},320)}
  else if(id==='door2'){sfx('keyTurn');later(function(){sfx('doorOpen')},430)}
}
function setTension(v){tension=Math.max(0,Math.min(1,Number(v)||0));mix()}
function duck(v){ducked=!!v;mix()}
function stop(){stopAmbient()}
function ui(){
  if(document.getElementById('schoolEscapeAudioCtl')||!document.getElementById('wrap'))return;
  var st=document.createElement('style');st.textContent='#schoolEscapeAudioCtl{position:absolute;right:12px;top:42px;z-index:12;font-family:inherit}#schoolEscapeAudioCtl .m{width:38px;height:34px;border-radius:10px;border:1px solid rgba(255,210,63,.48);background:rgba(42,31,8,.84);color:white;cursor:pointer}#schoolEscapeAudioCtl .p{display:none;margin-top:6px;padding:8px;border-radius:10px;background:rgba(42,31,8,.94);border:1px solid rgba(255,225,180,.28);min-width:185px;box-shadow:0 8px 22px rgba(0,0,0,.35)}#schoolEscapeAudioCtl.open .p{display:block}#schoolEscapeAudioCtl .r{display:flex;gap:6px;align-items:center;margin:4px 0;color:#fff2d9;font-size:11px;font-weight:800}#schoolEscapeAudioCtl .t{flex:1;padding:6px;border-radius:7px;border:1px solid rgba(255,225,180,.25);background:#503716;color:#fff2d9}#schoolEscapeAudioCtl .off{opacity:.45;text-decoration:line-through}#schoolEscapeAudioCtl input{width:95px}';document.head.appendChild(st);
  var d=document.createElement('div');d.id='schoolEscapeAudioCtl';d.innerHTML='<button class="m" data-m>🔊</button><div class="p"><div class="r"><button class="t" data-b>🎵 배경음</button><button class="t" data-s>🔔 효과음</button></div><div class="r">🎚 <input type="range" min="0" max="100" value="'+Math.round(cfg.vol*100)+'"></div></div>';document.getElementById('wrap').appendChild(d);
  d.querySelector('[data-m]').onclick=function(e){e.stopPropagation();d.classList.toggle('open')};
  d.querySelector('[data-b]').onclick=function(e){e.stopPropagation();cfg.bgm=!cfg.bgm;save();cfg.bgm?start():stopAmbient();mix();this.classList.toggle('off',!cfg.bgm)};
  d.querySelector('[data-s]').onclick=function(e){e.stopPropagation();cfg.sfx=!cfg.sfx;save();mix();this.classList.toggle('off',!cfg.sfx)};
  d.querySelector('input').oninput=function(e){e.stopPropagation();cfg.vol=this.value/100;save();mix()};
}
window.EscapeSchoolAudio={start:start,stop:stop,duck:duck,sfx:sfx,step:step,setTension:setTension,resume:resume,ensureUI:ui};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ui);else ui();
})();