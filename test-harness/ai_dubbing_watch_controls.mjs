// Exercise the actual watch engine with a controlled media clock and real captions.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../cloudflare-deploy/public/js/ai-dubbing-core.js');
const W = require('../cloudflare-deploy/public/js/ai-dubbing-watch.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const audios = [], progress = [], captions = [], seen = [];
class Media {
  constructor() { this.currentTime = 0; this.duration = 30; this.readyState = 4; this.paused = true; this.playbackRate = 1; this.seekable = {length:1,start:()=>0,end:()=>30}; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
}
const video = new Media();
assert.equal(C.canSeekMedia({seekable:{length:1,start:()=>0,end:()=>0}},0),false);
assert.equal(C.canSeekMedia(video,NaN),false);
assert.equal(C.canSeekMedia({seekable:{length:2,start:i=>i?10:0,end:i=>i?20:5}},7),false);
const cold = new Media(); cold.currentTime=4; cold.seekable={length:0}; cold.paused=false;
C.clockFollower().step(8,[cold],null);
assert.equal(cold.currentTime,4,'automatic drift recovery cannot rewind a cold stream');
const sc = { no: 1, timing: 'synced', durationSec: 30, playbackStartSec: 2,
  voices: { a: '/a.mp3', b: '/b.mp3' }, bgm: '/bgm.mp3', sfx: [],
  lines: [{ en: 'First', start: 2, end: 6 }, { en: 'Second', start: 10, end: 16 }] };
const ep = { id: 'controls', scenes: [sc, { ...sc, no: 2 }] };
const w = W.create({ C, opt: { cardMs: 1, endMs: 1, tickMs: 5, stallMs: 10000 },
  Audio: function () { const a = new Media(); audios.push(a); return a; },
  video: () => video, prepVideo: v => { v.currentTime = 0; }, waitVideo: () => Promise.resolve(true),
  card() {}, clearLine() {}, showLine: (_, l) => captions.push(l.en),
  onProgress: p => progress.push(p), onSeen: (_, n) => seen.push(n) });
const done = w.start([{ ep, scIdx: 0 }, { ep, scIdx: 1 }]);
for (let i = 0; i < 100 && !progress.at(-1)?.seekable; i++) await sleep(2);
assert.equal(progress.at(-1).duration, 28, 'embedded title excluded');
assert.equal(w.seek(9), true);
assert.equal(video.currentTime, 11);
assert.ok(audios.every(a => a.currentTime === 11), 'all voices and music seek together');
assert.equal(captions.at(-1), 'Second', 'captions update immediately');
const ranges = audios[0].seekable;
for (const unavailable of [{length:0}, {length:1,start:()=>0,end:()=>0}, {length:1,start:()=>0,end:()=>5}]) {
  audios[0].seekable = unavailable;
  assert.equal(w.seek(20), false, 'reject seek before moving any element');
  assert.ok([video,...audios].every(a=>a.currentTime===11), 'no partial group seek');
  await sleep(10);
  assert.equal(progress.at(-1).seekable,false,'loading voices cannot expose the seek slider');
}
audios[0].seekable=ranges;
await sleep(10);
assert.equal(progress.at(-1).seekable,true,'seeking becomes available when all streams are ready');
for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
  w.setRate(rate);
  assert.equal(video.playbackRate, rate);
  assert.ok(audios.every(a => a.playbackRate === rate));
}
w.setRate(NaN); w.setRate(99);
assert.equal(w.state().rate, 2, 'invalid speed rejected');
w.pause(); w.seek(0);
assert.equal(video.currentTime, 2);
assert.ok([video, ...audios].every(a => a.paused), 'paused seek stays paused');
w.resume();
assert.ok([video, ...audios].every(a => !a.paused), 'all tracks resume');
assert.equal(w.seek(Infinity), false);
w.seek(-100); assert.equal(video.currentTime, 2, 'negative seek clamped');
w.seek(999); assert.ok(video.currentTime < 30, 'seek clamped before scene end');
w.next();
for (let i = 0; i < 100 && audios.length < 6; i++) await sleep(2);
assert.ok(audios.length >= 6, 'next scene loaded');
assert.ok(audios.slice(3).every(a => a.playbackRate === 2), 'speed survives scene change');
assert.deepEqual(seen, [], 'skipping does not mark the scene watched');
w.stop(); await done;
assert.equal(w.seek(1), false);
assert.ok([video, ...audios].every(a => a.paused), 'stop releases media');
console.log('PASS: seeking, caption sync, all six speeds, paused seeking, bounds, next scene, cleanup');

const cv = new Media(), ca = new Media(); ca.seekable={length:0};
const cw = W.create({ C, opt:{cardMs:1,tickMs:5,stallMs:10000}, Audio:function(){return ca;},
  video:()=>cv, waitVideo:()=>Promise.resolve(true), card(){}, clearLine(){}, showLine(){} });
const coldDone=cw.start([{ep:{...ep,scenes:[{...sc,bgm:'',voices:{a:'/a.mp3'}}]},scIdx:0}]);
for(let i=0;i<100 && ca.paused;i++) await sleep(2);
assert.equal(cv.currentTime,0,'cold title skip starts the entire group at zero');
assert.equal(ca.currentTime,0);
cw.stop();await coldDone;

// Legacy untimed/TTS scenes seek by dialogue boundary, without inventing timestamps.
let resolveOld;
const oldTts = new Promise(r => { resolveOld = r; });
const spoken = [], turnCaptions = [], turnProgress = [];
const turn = { no: 1, timing: 'turn', sfx: [], lines: [
  { en: 'Old line', speaker: 'a' }, { en: 'Middle', speaker: 'a' }, { en: 'Target', speaker: 'a' }] };
const tw = W.create({ C: { ...C, ttsSpeakerFor: () => 'a' }, opt: { cardMs: 1 },
  Audio: function () { const a = new Media(); spoken.push(a); return a; },
  video: () => new Media(), waitVideo: () => Promise.resolve(true),
  tts: text => text === 'Old line' ? oldTts : Promise.resolve('/' + text),
  card() {}, clearLine() {}, showLine: (_, l) => turnCaptions.push(l.en), onProgress: p => turnProgress.push(p) });
const turnDone = tw.start([{ ep: { id: 'turn', scenes: [turn] }, scIdx: 0 }]);
for (let i = 0; i < 100 && !turnCaptions.length; i++) await sleep(2);
assert.equal(turnProgress.at(-1).unit, 'line');
tw.pause(); assert.equal(tw.seek(2), true);
await sleep(10);
assert.equal(spoken.length, 0, 'paused seek cannot start a voice');
tw.resume();
for (let i = 0; i < 100 && !spoken.length; i++) await sleep(2);
assert.equal(turnCaptions.at(-1), 'Target');
assert.equal(spoken[0].src, '/Target', 'seek skips the pending old TTS request');
resolveOld('/old'); await sleep(10);
assert.equal(spoken.length, 1, 'late TTS cannot speak the old line');
tw.stop(); await turnDone;
assert.ok(spoken.every(a => a.paused));
console.log('PASS: untimed dialogue seeking, paused seek, stale TTS cancellation');
