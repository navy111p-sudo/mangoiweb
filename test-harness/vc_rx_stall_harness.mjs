import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../cloudflare-deploy/public/js/idx-vc-qlog.js', import.meta.url), 'utf8');
const a = src.indexOf('function vcqRxRecoverySample(');
const b = src.indexOf('\nfunction vcqRxTick()', a);
assert.ok(a >= 0 && b > a, 'recovery helper must exist before vcqRxTick');
const helper = src.slice(a, b);
for (const bad of ['restartIce(', 'createOffer(', '.close(', 'setInterval(', 'MutationObserver', 'track.enabled', 'replaceTrack(', 'setParameters(']) {
  assert.equal(helper.includes(bad), false, `helper must not contain ${bad}`);
}

class FakeStream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  addTrack(t) { if (!this.tracks.includes(t)) this.tracks.push(t); }
  removeTrack(t) { this.tracks = this.tracks.filter(x => x !== t); }
}
let now = 100000;
let playCount = 0;
const video = { srcObject: new FakeStream(), play() { playCount++; return Promise.resolve(); } };
const box = { querySelector(sel) { return sel === 'video' ? video : null; } };
const windowObj = { vcRemoteCamOff: {}, __vcRxRecovery: {} };
let hintCalls = 0;
windowObj.vcApplyRemoteCamHint = () => { hintCalls++; };
const RealDate = Date;
class FakeDate extends RealDate { static now() { return now; } }
const context = vm.createContext({
  window: windowObj,
  document: { getElementById: id => id === 'vc-video-p1' ? box : null },
  MediaStream: FakeStream,
  Date: FakeDate,
  console,
  Promise,
});
vm.runInContext(helper, context);
const f = context.vcqRxRecoverySample;
assert.equal(typeof f, 'function');
const vtrack = { id: 'v1', kind: 'video', readyState: 'live', muted: false };
const pc = { connectionState: 'connected', iceConnectionState: 'connected' };
const vr = { track: vtrack };

windowObj.vcRemoteCamOff.p1 = 'aao';
f('p1', 'video', { dfr: 1, known: true }, pc, vr, 1);
assert.equal(windowObj.vcRemoteCamOff.p1, undefined, 'decoded frame clears stale AAO only');
assert.equal(hintCalls, 1, 'AAO hint refreshes after self-clear');

windowObj.vcRemoteCamOff.p1 = 'user';
f('p1', 'video', { dfr: 1, known: true }, pc, vr, 2);
assert.equal(windowObj.vcRemoteCamOff.p1, 'user', 'manual camera OFF must never be cleared');
delete windowObj.vcRemoteCamOff.p1;

windowObj.__vcRxRecovery = {};
playCount = 0;
video.srcObject = new FakeStream();
f('p1', 'video', { dfr: 0, known: true }, pc, vr, 10);
f('p1', 'audio', { dr: 8 }, pc, null, 10);
assert.equal(playCount, 0, 'one stalled tick does not recover');
now += 4000;
f('p1', 'video', { dfr: 0, known: true }, pc, vr, 11);
f('p1', 'audio', { dr: 8 }, pc, null, 11);
assert.equal(playCount, 1, 'two paired stalled ticks recover video element');
assert.equal(video.srcObject.getVideoTracks()[0], vtrack, 'live receiver video track is attached');

now += 4000;
f('p1', 'video', { dfr: 0, known: true }, pc, vr, 12);
f('p1', 'audio', { dr: 8 }, pc, null, 12);
assert.equal(playCount, 1, '12s cooldown prevents 4s retry loop');

windowObj.__vcRxRecovery = {};
playCount = 0;
video.srcObject = new FakeStream();
now += 20000;
f('p1', 'video', { dfr: 0, known: true }, pc, vr, 20);
f('p1', 'audio', { dr: 0 }, pc, null, 20);
f('p1', 'video', { dfr: 0, known: true }, pc, vr, 21);
f('p1', 'audio', { dr: 0 }, pc, null, 21);
assert.equal(playCount, 0, 'audio+video dead does not use video-only recovery');

windowObj.__vcRxRecovery = {};
playCount = 0;
windowObj.vcRemoteCamOff.p1 = 'user';
f('p1', 'video', { dfr: 0, known: true }, pc, vr, 30);
f('p1', 'audio', { dr: 8 }, pc, null, 30);
f('p1', 'video', { dfr: 0, known: true }, pc, vr, 31);
f('p1', 'audio', { dr: 8 }, pc, null, 31);
assert.equal(playCount, 0, 'manual camera OFF blocks recovery loop');

console.log('vc_rx_stall_harness: PASS 10 / FAIL 0');
