// Stateful A-L coverage, real production stats sampling + signaling helpers in a VM.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const qlog = fs.readFileSync(new URL('../cloudflare-deploy/public/js/idx-vc-qlog.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../cloudflare-deploy/src/video-call-room.ts', import.meta.url), 'utf8');
const helpers = qlog.slice(qlog.indexOf('function vcRecoveryLog('), qlog.indexOf('function vcqTurnHost('));
let pass = 0;
function check(c, msg) { assert.ok(c, msg); pass++; }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
class Stream {
  constructor(t = []) { this.t = [...t]; }
  getTracks() { return [...this.t]; }
  getVideoTracks() { return this.t.filter(t => t.kind === 'video'); }
  addTrack(t) { if (!this.t.includes(t)) this.t.push(t); }
  removeTrack(t) { this.t = this.t.filter(x => x !== t); }
}
function setup() {
  let now = 100000, plays = 0, rebuilds = 0, offers = 0, restarts = 0, stats = 0, writes = 0;
  const logs = [], sent = [], overlays = new Map();
  const vt = { id: 'v', kind: 'video', readyState: 'live', enabled: true, muted: false };
  const at = { id: 'a', kind: 'audio', readyState: 'live', enabled: true };
  const video = { srcObject: new Stream([vt]), total: 10, play() { plays++; return Promise.resolve(); },
    getVideoPlaybackQuality() { return { totalVideoFrames: this.total }; } };
  const box = { querySelector(s) { return s === 'video' ? video : overlays.get(s); }, classList: { contains: () => false } };
  const vs = { id: 'vs', type: 'inbound-rtp', kind: 'video', packetsReceived: 100, framesDecoded: 10, framesReceived: 10, freezeCount: 0 };
  const as = { id: 'as', type: 'inbound-rtp', kind: 'audio', packetsReceived: 100 };
  const vr = { track: vt, getStats() { stats++; return Promise.resolve(new Map([['v', {...vs}]])); } };
  const ar = { track: at, getStats() { stats++; return Promise.resolve(new Map([['a', {...as}]])); } };
  const sender = { track: {...vt}, params: { encodings: [{ active: false, maxBitrate: 60000, scaleResolutionDownBy: 4 }] }, sets: 0,
    getParameters() { return structuredClone(this.params); }, setParameters(p) { this.sets++; this.params = p; return Promise.resolve(); } };
  const pc = { connectionState: 'connected', iceConnectionState: 'connected', signalingState: 'stable', __vcRecoveryCapable: true,
    getReceivers: () => [vr, ar], getSenders: () => [sender],
    restartIce() { restarts++; }, async createOffer(options) { offers++; return { type: 'offer', sdp: options?.iceRestart ? 'ice' : 'video' }; },
    async setLocalDescription(sdp) { this.localDescription = sdp; },
    async setRemoteDescription(sdp) { this.remoteDescription = sdp; }, async createAnswer() { return { type: 'answer', sdp: 'answer' }; }
  };
  const ctx = {
    Date: class extends Date { static now() { return now; } }, MediaStream: Stream,
    console: { log: (...v) => logs.push(v), warn: (...v) => logs.push(v), error: (...v) => logs.push(v) },
    document: { body: { classList: { contains: () => true } }, getElementById: id => id === 'vc-video-z' ? box : null },
    vcPeerConnections: { z: pc }, vcRemoteCamOff: {}, vcUserId: 'a', vcRoomId: 'test-room', vcMyRole: 'student',
    vcCamOn: true, vcqWho: () => ({ role: 'student' }), vcAaoSfuCut: () => false,
    vcConn: { ws: { readyState: 1 }, send: m => sent.push(m) }, vcTuneAudioSdp: s => s,
    vcqLowQSelf() {}, vcqDupTabWatch() {}, vcqWrapCreatePeer() {}, vcqWrapAAONotify() {}, vcqPathProbe() {}, vcLowQRemote() {}, vcNetPeerMark() {},
    vcReconnectPeer() { rebuilds++; }, vcApplyRemoteCamHint() { overlays.delete('.vc-camoff-hint'); writes++; },
    vcAaoFreeze() { overlays.delete('.vc-aao-still'); overlays.delete('.vc-aao-freeze'); writes++; },
    __vcQ: { p: [], rxv: [], rxa: [], rxc: [], rxf: 0 }
  };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(helpers, ctx);
  const tick = async ({a = 8, v = 0, f = 0, dt = 4000} = {}) => {
    now += dt; as.packetsReceived += a; vs.packetsReceived += v; vs.framesDecoded += f; vs.framesReceived += f;
    ctx.vcqRxTick(); await flush();
  };
  const boot = async () => { ctx.vcqRxTick(); await flush(); };
  const overlay = sel => overlays.set(sel, { remove() { overlays.delete(sel); writes++; } });
  return { ctx, pc, vt, ar, vr, sender, vs, as, video, box, overlays, overlay, sent, logs, tick, boot,
    counts: () => ({ plays, rebuilds, offers, restarts, stats, writes }),
    state: () => ctx.__vcRxRecovery.z,
    events: e => logs.filter(x => x[0] === '[vc-recovery] ' + e) };
}
// A/C/E/L: decode freeze is different from packet loss, even with a muted remote track.
{
  const h = setup(); await h.boot(); h.vt.muted = true;
  await h.tick({v: 10}); check(h.counts().plays === 0, 'A: first stalled sample does not confirm');
  check(h.sent.length === 1 && h.sent[0].data.action === 'sender-reapply', 'L0: first 4s sample requests remote sender, not our sender');
  await h.tick({v: 10}); check(h.events('video-stalled').length === 1, 'A: second paired sample confirms VIDEO_STALLED');
  check(h.counts().plays === 1, 'C: L1 plays once');
  await h.tick({v: 10}); check(h.counts().offers === 1, 'L2: next tick negotiates on same PC');
  for (let i = 0; i < 15; i++) await h.tick({v: 10});
  check(h.counts().restarts === 0 && h.counts().rebuilds === 0, 'E: healthy audio never restarts ICE or rebuilds');
  check(h.counts().offers === 1 && h.counts().plays === 1, 'L: no repeated levels every 4 seconds');
  check(h.events('recovered').length === 0, 'play resolution and active=true do not prove recovery');
  const log = h.events('video-stalled')[0][1];
  check(log.roomId === 'test-room' && log.peerId === 'z' && log.role === 'student' && log.audioPacketsDelta === 8
    && log.videoPacketsDelta === 10 && log.framesDecodedDelta === 0 && log.track.readyState === 'live'
    && log.track.enabled === true && log.elapsedMs === 4000 && log.recoveryLevel === 1, 'required structured log fields');
}
// B/D: real frame evidence stops escalation; stable ticks write/log nothing.
for (const stalls of [1, 2]) {
  const h = setup(); await h.boot(); for (let i=0; i<stalls; i++) await h.tick();
  await h.tick({f: 4, v: 20});
  for (let i=0; i<5; i++) await h.tick({f: 4, v: 20});
  check(h.counts().plays === (stalls === 1 ? 0 : 1), stalls === 1 ? 'B: L0 recovery avoids L1' : 'D: L1 recovery avoids L2');
  check(h.counts().offers === 0 && h.counts().restarts === 0, 'recovered stream never escalates');
  check(h.events('recovered').length === 1, 'recovered logged exactly once');
  check(h.counts().writes === 0, 'normal frames perform zero DOM writes');
  const before=h.counts().stats; await h.tick({f: 2});
  check(h.counts().stats - before === 2, 'only original audio/video receiver stats are read');
  for (let i=0; i<2; i++) await h.tick();
  check(h.counts().offers === 0, '30s recovery cooldown suppresses a transient relapse');
}
// F/G/H: all media dead + failed transport, restart then wait 3 ticks before isolated rebuild.
for (const recovers of [true, false]) {
  const h = setup(); await h.boot(); h.pc.iceConnectionState = 'failed'; h.pc.connectionState = 'failed';
  await h.tick({a:0}); await h.tick({a:0});
  check(h.counts().restarts === 1 && h.counts().offers === 1, 'F: failed transport + two dead media samples restarts ICE and offers');
  if (recovers) { h.pc.connectionState='connected'; h.pc.iceConnectionState='connected'; await h.tick({f: 5, v: 10}); }
  for (let i=0; i<10; i++) await h.tick(recovers ? {f:5,v:10} : {a:0});
  check(h.counts().rebuilds === (recovers ? 0 : 1), recovers ? 'G: frames after ICE stop rebuild' : 'H: failed ICE gets exactly one rebuild');
  check(h.counts().restarts === 1, 'L: ICE restart never loops');
}
// I: remote reapply never enables local camera; latest bitrate/scale preserved on actual reapply.
{
  const h = setup(); await h.boot(); h.ctx.vcCamOn = false; h.sender.track.enabled = false;
  await h.ctx.vcRecoveryMessage({fromUserId:'z',action:'sender-reapply',token:'manual'});
  check(h.sender.sets === 0 && h.sender.track.enabled === false, 'I: manual local camera OFF remains off');
  h.ctx.vcCamOn = true; h.sender.track.enabled = true;
  await h.ctx.vcRecoveryMessage({fromUserId:'z',action:'sender-reapply',token:'normal'});
  check(h.sender.params.encodings[0].active && h.sender.params.encodings[0].maxBitrate === 60000
    && h.sender.params.encodings[0].scaleResolutionDownBy === 4, 'L0: restores active using current bitrate/scale');
  await h.ctx.vcRecoveryMessage({fromUserId:'z',action:'sender-reapply',token:'normal'});
  check(h.sender.sets === 1, 'duplicate sender request is deduplicated');
  h.ctx.__vcAAO={active:true};
  await h.ctx.vcRecoveryMessage({fromUserId:'z',action:'sender-reapply',token:'aao'});
  check(h.sender.sets === 1, 'AAO cannot be overridden by receiver recovery');
}
// J/K: user OFF and intentional AAO are respected; stale image/black cover removed only on frames.
{
  const h=setup(); await h.boot(); h.ctx.vcRemoteCamOff.z='user'; h.overlay('.vc-camoff-hint');
  for(let i=0;i<8;i++) await h.tick();
  check(h.sent.length===0 && h.counts().plays===0 && h.counts().offers===0, 'J: remote manual OFF never starts recovery');
  await h.tick({f:5}); check(h.ctx.vcRemoteCamOff.z==='user' && h.overlays.size===1, 'manual privacy cover survives even black encoded frames');
  h.ctx.vcRemoteCamOff.z='aao'; await h.tick();
  check(h.counts().offers===0, 'intentional AAO never renegotiates');
  h.overlay('.vc-aao-still'); h.overlay('.vc-aao-freeze'); h.overlay('.vc-black-hint');
  await h.tick({f:5});
  check(!h.ctx.vcRemoteCamOff.z && h.overlays.size===0, 'K: actual new frame removes all stale AAO and black placeholders');
}
// Negative evidence / async ordering / attachment / fallback frame sources.
{
  const h=setup(); await h.boot();
  for(let i=0;i<4;i++) await h.tick({a:0});
  check(h.sent.length===0 && h.counts().restarts===0, 'silent audio/DTX with connected ICE is not a dead path');
  h.video.srcObject = new Stream(); await h.tick({f:5});
  check(h.video.srcObject.getVideoTracks()[0]===h.vt && h.counts().plays===1, 'healthy decoder repairs lost attachment immediately');
  h.pc.signalingState='have-local-offer'; for(let i=0;i<4;i++) await h.tick();
  check(h.counts().offers===0, 'pending signaling transaction blocks competing offer');
}
{
  const h=setup(); await h.boot(); delete h.vs.framesDecoded;
  for(let i=0;i<3;i++) { h.ctx.vcqRxTick(); await flush(); }
  // Call samples directly for browser that omits framesDecoded but exposes framesReceived.
  h.ctx.__vcRxRecovery={};
  const sample=(seq)=>{h.ctx.vcqRxRecoverySample('z','video',{dr:0,known:false,dfr:0,stalledKnown:true,progress:0},h.pc,h.vr,seq);
    h.ctx.vcqRxRecoverySample('z','audio',{dr:8,known:true},h.pc,h.ar,seq);};
  sample(100); sample(101);
  check(h.events('video-stalled').length>=1, 'framesReceived fallback can detect stalled delivery');
  h.video.total+=2; sample(102);
  check(h.events('recovered').length===1, 'totalVideoFrames growth is valid success evidence');
}
{
  const h=setup(); await h.boot(); await h.tick();
  const seq=h.state().seq;
  h.ctx.vcqRxRecoverySample('z','audio',{dr:8},h.pc,h.ar,seq);
  h.ctx.vcqRxRecoverySample('z','video',{dr:0,dfr:0,known:true},h.pc,h.vr,seq-1);
  check(h.state().bad===1, 'duplicate and older samples cannot advance hysteresis');
  h.vs.framesDecoded=0; h.vs.packetsReceived=0; await h.tick();
  check(h.counts().plays===0, 'counter reset is a new baseline, not a stall');
}
{
  const h=setup(); await h.boot(); let cb;
  h.video.requestVideoFrameCallback=fn=>{cb=fn;return 1;}; h.video.cancelVideoFrameCallback=()=>{};
  await h.tick(); cb();
  check(h.events('recovered').length===1, 'requestVideoFrameCallback is valid frame evidence');
}
// Execute actual production offer/answer handler, including existing glare polarity.
{
  const h=setup(); await h.boot(); let made=0;
  h.ctx.RTCSessionDescription=function(d){return d;}; h.ctx.vcEnsureIceServers=async()=>{};
  h.ctx.vcCreatePeer=()=>{made++;return h.pc;}; h.ctx.vcFlushPendingIce=()=>{};
  vm.runInContext(main.slice(main.indexOf('async function vcHandleOffer('),main.indexOf('/** Answer 수신 처리 */')),h.ctx);
  await h.ctx.vcHandleOffer({fromUserId:'z',recovery:true,sdp:{type:'offer',sdp:'new'}});
  check(made===0 && h.pc.remoteDescription.sdp==='new', 'L2: recovery offer reuses existing PC');
  h.pc.signalingState='have-local-offer';
  await h.ctx.vcHandleOffer({fromUserId:'z',recovery:true,sdp:{type:'offer',sdp:'glare'}});
  check(made===0 && h.pc.remoteDescription.sdp==='glare', 'smaller ID preserves existing polite glare behavior');
  h.ctx.vcUserId='zz';
  await h.ctx.vcHandleOffer({fromUserId:'z',recovery:true,sdp:{type:'offer',sdp:'ignored'}});
  check(h.pc.remoteDescription.sdp==='glare', 'larger ID preserves existing impolite glare behavior');
  h.pc.signalingState='stable';
  await h.ctx.vcHandleOffer({fromUserId:'z',sdp:{type:'offer',sdp:'rebuild'}});
  check(made===1, 'ordinary rebuild offer still uses original path');
}
check(!/setInterval\(|MutationObserver/.test(helpers), 'no new interval or MutationObserver');
check(server.includes("case 'video-recovery':") && server.includes('!this.isJoined(target)')
  && server.includes('recovery: data?.recovery === true'), 'server routes only joined in-room peers and preserves recovery offer flag');
console.log(`vc_fast_recovery_harness: PASS ${pass} / FAIL 0`);
