import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
class Media {
 constructor(){this.events={};this.paused=true;this.ended=false;this.readyState=4;this.style={};}
 addEventListener(n,f){(this.events[n] ||= []).push(f);}
 emit(n){for(const f of this.events[n]||[])f();}
 pause(){this.paused=true;} load(){} removeAttribute(){} appendChild(){}
}
let lastImage,sources=0,next=0;const pending=new Map();
const ctx={clearRect(){},drawImage(im){lastImage=im.src;},getImageData(){return {data:new Uint8ClampedArray(4)};},putImageData(){}};
const video=new Media(),canvas={style:{},getContext(){return ctx;}},wrap={classList:{toggle(){}}},ring={style:{},getBoundingClientRect(){return {width:320};}};
class Image {constructor(){this.complete=true;this.naturalWidth=320;this.naturalHeight=400;}set src(v){this._src=v;queueMicrotask(()=>this.onload?.());}get src(){return this._src;}}
class AudioContext {
 constructor(){this.state='running';this.destination={};}
 createAnalyser(){return {fftSize:512,getByteTimeDomainData(a){a.fill(180);}};}
 createMediaElementSource(el){assert(!el.sourced);el.sourced=true;sources++;return {connect(){}};}
}
const window={__mgAvatarWant:'lily',AudioContext};
vm.runInNewContext(readFileSync(new URL('../cloudflare-deploy/public/js/mango-avatar.js',import.meta.url),'utf8'),{window,Image,Date,WeakMap,Uint8Array,Promise,setTimeout,clearTimeout,
 document:{readyState:'complete',getElementById(id){return {'tavatar-video':video,'tavatar-canvas':canvas,'tavatar-wrap':wrap,'tavatar-ring':ring}[id];}},
 requestAnimationFrame(f){pending.set(++next,f);return next;},cancelAnimationFrame(id){pending.delete(id);}});
await new Promise(queueMicrotask);
const av=window.MangoAvatar,a=new Media(),b=new Media();
const frame=()=>{const fs=[...pending.values()];pending.clear();fs.forEach(f=>f());};
av.attach(a);assert.equal(pending.size,0);
a.paused=false;a.emit('playing');frame();assert.match(lastImage,/wide/);
a.emit('waiting');assert.match(lastImage,/closed/);frame();assert.match(lastImage,/closed/);
a.emit('playing');frame();assert.match(lastImage,/wide/);
a.paused=true;a.emit('pause');assert.equal(pending.size,0);assert.match(lastImage,/closed/);
a.paused=false;a.emit('playing');frame();av.plainStop();assert.match(lastImage,/closed/);
av.attach(b);b.paused=false;b.emit('playing');frame();a.emit('ended');assert(pending.size);
b.paused=true;b.emit('ended');assert.equal(pending.size,0);assert.match(lastImage,/closed/);
av.attach(a);av.attach(b);assert.equal(sources,2);
console.log('PASS: playback, buffering, resume, pause, cancel, end, stale events, rebind');
// Video-only Jake keeps his identity but also follows audio-derived cue timing.
let cue='A';window.AvatarVisemes={prepare:()=>Promise.resolve([{start:0,end:1,value:'A'}]),at:()=>cue};
b.src='blob:test';av.setCharacter('jake');av.attach(b);await new Promise(queueMicrotask);
b.paused=false;av.plainStart();frame();assert.equal(video.currentTime,3.2,'P/B/M uses closed Jake pose');
cue='D';av.plainStart();frame();assert.equal(video.currentTime,3.5,'AH uses wide Jake pose');
cue='A';frame();assert.equal(video.currentTime,3.2,'closure bypasses minimum video hold');av.plainStop();
console.log('PASS: original video character follows cue timing and closes immediately');
