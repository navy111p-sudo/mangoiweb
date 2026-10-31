/* Mango-i Escape Audio v1: immersive Web Audio, isolated from WebRTC */
(function(){
'use strict';
var KEY='mangoi_escape_audio_v1',ctx,master,bgm,sfx,noiseBuf,nodes=[],timers=[],loc='study',ducked=false;
var cfg={on:true,bgm:true,sfx:true,vol:.46};
try{var x=JSON.parse(localStorage.getItem(KEY)||'null');if(x)Object.assign(cfg,x);}catch(_){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(cfg));}catch(_){}}
function init(){
 if(ctx)return ctx;
 try{
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  master=ctx.createGain();bgm=ctx.createGain();sfx=ctx.createGain();
  bgm.connect(master);sfx.connect(master);master.connect(ctx.destination);
  var len=ctx.sampleRate*2;noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
  var d=noiseBuf.getChannelData(0);for(var i=0;i<len;i++)d[i]=Math.random()*2-1;
  mix();
 }catch(_){ctx=null}
 return ctx;
}
function resume(){var a=init();if(a&&a.state==='suspended')try{a.resume()}catch(_){}}
function mix(){if(!ctx)return;var t=ctx.currentTime;
 master.gain.setTargetAtTime(cfg.on?Math.max(0,Math.min(1,cfg.vol)):0,t,.03);
 bgm.gain.setTargetAtTime(cfg.bgm?(ducked?.055:.18):0,t,.04);
 sfx.gain.setTargetAtTime(cfg.sfx?.78:0,t,.03);
}
function later(fn,ms){var id=setTimeout(fn,ms);timers.push(id);return id}
function stopAll(){timers.forEach(clearTimeout);timers=[];nodes.forEach(function(n){try{n.stop()}catch(_){}try{n.disconnect()}catch(_){}});nodes=[]}
function env(bus,v,t,d){var g=ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d+.08);g.connect(bus);return g}
function tone(f,d,type,v,t){if(!init())return;t=t==null?ctx.currentTime:t;var o=ctx.createOscillator(),g=env(sfx,v||.08,t,d||.1);o.type=type||'sine';o.frequency.value=f;o.connect(g);o.start(t);o.stop(t+(d||.1)+.1)}
function sweep(f1,f2,d,v,t){if(!init())return;t=t==null?ctx.currentTime:t;var o=ctx.createOscillator(),g=env(sfx,v||.07,t,d||.3);o.type='sawtooth';o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,f2),t+d);o.connect(g);o.start(t);o.stop(t+d+.1)}
function nz(d,v,lo,hi,t,bus){if(!init())return;t=t==null?ctx.currentTime:t;var src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=env(bus||sfx,v||.04,t,d||.2);src.buffer=noiseBuf;f.type='bandpass';f.frequency.value=(lo+hi)/2;f.Q.value=.7;src.connect(f);f.connect(g);src.start(t);src.stop(t+d+.1)}
function click(t,v){t=t==null?ctx.currentTime:t;nz(.04,v||.08,900,4200,t);tone(280,.035,'square',(v||.08)*.5,t)}
function thump(t,v){t=t==null?ctx.currentTime:t;sweep(115,48,.15,v||.16,t);nz(.08,(v||.16)*.45,50,260,t)}
function ping(f,t,v){t=t==null?ctx.currentTime:t;tone(f||1000,.28,'triangle',v||.06,t);tone((f||1000)*1.5,.17,'sine',(v||.06)*.45,t+.01)}
function play(name){
 if(!cfg.on||!cfg.sfx)return;resume();var t=ctx.currentTime;
 if(name==='success'){tone(660,.09,'triangle',.07,t);tone(990,.16,'triangle',.08,t+.1)}
 else if(name==='wrong')sweep(220,165,.16,.05,t);
 else if(name==='unlock'){click(t,.11);click(t+.1,.1);tone(760,.2,'triangle',.08,t+.2)}
 else if(name==='alarm'){tone(880,.1,'square',.05,t);tone(660,.11,'square',.045,t+.14)}
 else if(name==='tick')click(t,.025);
 else if(name==='creak'||name==='scrape'){nz(.5,.055,120,1500,t);sweep(180,75,.52,.045,t)}
 else if(name==='keyTurn'){click(t,.11);click(t+.09,.09);sweep(260,145,.2,.06,t+.15)}
 else if(name==='event'){sweep(145,72,.45,.065,t);nz(.32,.03,45,500,t+.04)}
 else if(name==='footsteps'){[0,.36,.7,1.08].forEach(function(dt,i){nz(.07,.045,55,310,t+dt);sweep(92+i*2,60,.08,.06,t+dt)})}
 else if(name==='piano'){[392,523,466,587].forEach(function(f,i){tone(f,.5,'triangle',.05,t+i*.38)})}
 else if(name==='tvStatic')nz(.55,.065,350,6800,t);
 else if(name==='drip'){[0,.52,.98].forEach(function(dt,i){ping(1500-i*90,t+dt,.03)})}
 else if(name==='bookFall'){nz(.16,.055,70,1200,t);thump(t+.07,.13)}
 else if(name==='curtain')nz(.55,.035,160,2400,t);
 else if(name==='doorOpen'){click(t,.11);sweep(185,72,.72,.075,t+.07);nz(.62,.05,80,900,t+.1);later(function(){thump(null,.09)},700)}
 else if(name==='doorClose'){nz(.16,.045,90,900,t);thump(t+.1,.2);ping(540,t+.16,.04)}
 else if(name==='cabinetOpen'){click(t,.09);nz(.25,.05,180,1800,t+.03);sweep(260,135,.28,.055,t+.03);ping(1150,t+.22,.04)}
 else if(name==='safeOpen'){click(t,.12);click(t+.11,.1);thump(t+.27,.12);ping(820,t+.32,.045)}
 else if(name==='keyPickup'){ping(1450,t,.07);ping(1900,t+.06,.045);ping(1120,t+.12,.035)}
 else if(name==='booksShift'){nz(.27,.045,120,1200,t);thump(t+.18,.07)}
}
function ambientStart(where){
 if(!init())return;resume();stopAll();loc=where||'study';if(!cfg.on||!cfg.bgm)return;
 var o1=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain();o1.type=o2.type='sine';o1.frequency.value=48;o2.frequency.value=49.2;g.gain.value=.11;o1.connect(g);o2.connect(g);g.connect(bgm);o1.start();o2.start();nodes.push(o1,o2,g);
 var hum=ctx.createOscillator(),hg=ctx.createGain();hum.type='sine';hum.frequency.value=loc==='restroom'?119.7:59.8;hg.gain.value=loc==='restroom'?.045:.02;hum.connect(hg);hg.connect(bgm);hum.start();nodes.push(hum,hg);
 scheduleAmbient();
}
function scheduleAmbient(){if(!cfg.on||!cfg.bgm)return;later(function(){
 var r=Math.random();
 if(loc==='restroom')play(r<.65?'drip':(r<.84?'event':'cabinetOpen'));
 else if(loc==='storage')play(r<.55?'scrape':'footsteps');
 else if(loc==='classroom')play(r<.55?'footsteps':'bookFall');
 else if(loc==='rooftop'||loc==='playground'){nz(.6,.025,80,950);if(r>.72)play('footsteps')}
 else play(r<.5?'bookFall':(r<.78?'footsteps':'curtain'));
 scheduleAmbient();
},11000+Math.random()*16000)}
function step(id){
 if(id==='drawer')play('cabinetOpen');
 else if(id==='painting')play('scrape');
 else if(id==='books')play('booksShift');
 else if(id==='code')later(function(){play('safeOpen')},180);
 else if(id==='key')play('keyPickup');
 else if(id==='door')later(function(){play('doorOpen')},430);
}
function duck(v){ducked=!!v;mix()}
function start(where){ui();ambientStart(where);later(function(){play('doorClose')},520)}
function stop(){stopAll()}
function ui(){
 if(document.getElementById('escapeAudioCtl')||!document.getElementById('wrap'))return;
 var st=document.createElement('style');st.textContent='#escapeAudioCtl{position:absolute;right:12px;top:42px;z-index:12;font-family:inherit}#escapeAudioCtl .m{width:38px;height:34px;border-radius:10px;border:1px solid rgba(255,224,122,.45);background:rgba(7,14,22,.84);color:white;cursor:pointer}#escapeAudioCtl .p{display:none;margin-top:6px;padding:8px;border-radius:10px;background:rgba(7,14,22,.92);border:1px solid rgba(140,165,195,.28);min-width:185px}#escapeAudioCtl.open .p{display:block}#escapeAudioCtl .r{display:flex;gap:6px;align-items:center;margin:4px 0;color:#dce8f4;font-size:11px;font-weight:800}#escapeAudioCtl .t{flex:1;padding:6px;border-radius:7px;border:1px solid rgba(140,165,195,.25);background:#162230;color:#dce8f4}#escapeAudioCtl .off{opacity:.45;text-decoration:line-through}#escapeAudioCtl input{width:95px}';document.head.appendChild(st);
 var d=document.createElement('div');d.id='escapeAudioCtl';d.innerHTML='<button class="m" data-m>🔊</button><div class="p"><div class="r"><button class="t" data-b>🎵 배경음</button><button class="t" data-s>🔔 효과음</button></div><div class="r">🎚 <input type="range" min="0" max="100" value="'+Math.round(cfg.vol*100)+'"></div></div>';document.getElementById('wrap').appendChild(d);
 d.querySelector('[data-m]').onclick=function(e){e.stopPropagation();d.classList.toggle('open')};
 d.querySelector('[data-b]').onclick=function(e){e.stopPropagation();cfg.bgm=!cfg.bgm;save();cfg.bgm?ambientStart(loc):stopAll();mix();this.classList.toggle('off',!cfg.bgm)};
 d.querySelector('[data-s]').onclick=function(e){e.stopPropagation();cfg.sfx=!cfg.sfx;save();mix();this.classList.toggle('off',!cfg.sfx)};
 d.querySelector('input').oninput=function(e){e.stopPropagation();cfg.vol=this.value/100;save();mix()};
}
window.EscapeAudio={start:start,stop:stop,duck:duck,sfx:play,step:step,resume:resume,ensureUI:ui};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ui);else ui();
})();