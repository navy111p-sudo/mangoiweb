import vm from 'node:vm';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
let release,plays=0,prepares=0;
class Audio {constructor(){this.src='';this.duration=12;this.playbackRate=1;}play(){plays++;return Promise.resolve();}pause(){}}
const MangoAvatar={prepare(){prepares++;return new Promise(r=>release=r);}};
const window={MangoAvatar,localStorage:{getItem(){return null;},setItem(){}}};
const code=readFileSync(new URL('../cloudflare-deploy/public/js/game-tts.js',import.meta.url),'utf8');
vm.runInNewContext(code,{window,MangoAvatar,Audio,Blob,URL:{createObjectURL(){return 'blob:voice';}},fetch:async()=>({ok:true,headers:{get(k){return k==='content-type'?'audio/mpeg':'';}},blob:async()=>new Blob(['voice'])}),setTimeout(){return 1;},clearTimeout(){},console,Promise,Number,localStorage:window.localStorage});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
window.MangoiTTS.speak('Hello there');await flush();assert.equal(prepares,1);assert.equal(plays,0,'audio waits for mouth cues');
release();await flush();assert.equal(plays,1);
window.MangoiTTS.speak('Hello there');await flush();assert.equal(plays,1,'cached replay also waits');
window.MangoiTTS.stop();release();await flush();assert.equal(plays,1,'cancel during analysis cannot start stale speech');
console.log('PASS: prepare before audio, cached replay, cancellation while preparing');
