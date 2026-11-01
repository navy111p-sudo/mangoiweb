// Stateful A-L coverage, real production stats sampling + signaling helpers in a VM.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const qlog = fs.readFileSync(process.env.QLOG_SRC || new URL('../cloudflare-deploy/public/js/idx-vc-qlog.js', import.meta.url), 'utf8');
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
function setup({self = 'a', peer = 'z'} = {}) {
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
    async setLocalDescription(sdp) {
      this.localDescription = sdp.type === 'rollback' ? null : sdp;
      this.signalingState = sdp.type === 'offer' ? 'have-local-offer' : 'stable';
    },
    async setRemoteDescription(sdp) { this.remoteDescription = sdp; this.signalingState = sdp.type === 'offer' ? 'have-remote-offer' : 'stable'; },
    async createAnswer() { return { type: 'answer', sdp: 'answer' }; }
  };
  const ctx = {
    Date: class extends Date { static now() { return now; } }, MediaStream: Stream,
    console: { log: (...v) => logs.push(v), warn: (...v) => logs.push(v), error: (...v) => logs.push(v) },
    document: { body: { classList: { contains: () => true } }, getElementById: id => id === 'vc-video-' + peer ? box : null },
    vcPeerConnections: { [peer]: pc }, vcRemoteCamOff: {}, vcUserId: self, vcRoomId: 'test-room', vcMyRole: 'student',
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
    state: () => ctx.__vcRxRecovery[peer],
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
  check(!!h.state().done[2], 'L2: only a sent offer completes the local stage');
  await h.pc.setRemoteDescription({type:'answer',sdp:'answered'});
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
  h.pc.signalingState='have-local-offer';
  await h.ctx.vcHandleOffer({fromUserId:'z',recovery:true,sdp:{type:'offer',sdp:'ignored'}});
  check(h.pc.remoteDescription.sdp==='glare', 'larger ID preserves existing impolite glare behavior');
  h.pc.signalingState='have-remote-offer';
  await h.ctx.vcHandleOffer({fromUserId:'z',recovery:true,sdp:{type:'offer',sdp:'busy'}});
  check(made===0, 'recovery offer during pending remote offer cannot rebuild');
  h.pc.signalingState='stable';
  await h.ctx.vcHandleOffer({fromUserId:'z',sdp:{type:'offer',sdp:'rebuild'}});
  check(made===1, 'ordinary rebuild offer still uses original path');
}
{
  const h=setup(); await h.boot(); h.sender.track=null;
  await h.ctx.vcRecoveryMessage({fromUserId:'z',action:'sender-reapply',token:'missing'});
  check(h.sent.some(m=>m.data.action==='ready')&&!h.sent.some(m=>m.data.action==='camera-off'), 'missing sender is a fault, not manual camera OFF');
}
{
  const h=setup(); await h.boot(); h.ctx.vcUserId='zz';
  h.pc.iceConnectionState='failed';h.pc.connectionState='failed';
  await h.tick({a:0});await h.tick({a:0});
  check(h.counts().restarts===1, 'ICE-failed endpoint restarts locally even when it has larger ID');
}
{
  const h=setup();await h.boot();h.ctx.vcRemoteCamOff.z='aao';
  for(let i=0;i<3;i++)await h.tick();
  check(h.sent.length===0,'AAO with flowing audio never starts video recovery');
  h.pc.iceConnectionState='failed';h.pc.connectionState='failed';
  await h.tick({a:0});await h.tick({a:0});
  check(h.counts().restarts===1&&h.sender.sets===0,'AAO still permits dead-transport recovery without enabling video');
}
{
  const h=setup();await h.boot();await h.tick({f:2,v:8});
  h.ctx.pc=h.pc;h.ctx.userId='z';
  vm.runInContext(main.slice(main.indexOf('    pc.oniceconnectionstatechange = () => {'),main.indexOf('    pc.ontrack =')),h.ctx);
  h.pc.iceConnectionState='failed';h.pc.connectionState='failed';
  h.pc.oniceconnectionstatechange();h.pc.onconnectionstatechange();
  check(h.counts().restarts===0&&h.counts().rebuilds===0,'established peer ICE events defer to staged recovery instead of immediate rebuild');
  const other={connectionState:'connected'};h.ctx.vcPeerConnections.other=other;
  await h.tick({a:0});await h.tick({a:0});
  for(let i=0;i<4;i++)await h.tick({a:0});
  check(h.counts().rebuilds===1&&h.ctx.vcPeerConnections.other===other,'L4 rebuild targets one peer and preserves other participants');
  h.ctx.vcPeerConnections.z={...h.pc};
  for(let i=0;i<6;i++)await h.tick({a:0});
  check(h.counts().rebuilds===1,'rebuild budget survives replacement of the peer object');
}
{
  const h=setup();await h.boot();await h.tick();
  const seq=h.state().seq;
  h.ctx.vcqRxRecoverySample('z','video',{dr:0,dfr:0,known:true},h.pc,h.vr,seq+1);
  await h.tick();await h.tick();
  check(h.counts().plays===1,'paired sample completes the same sequence only once');
  h.ctx.__vcRxRecovery={};
  for(const n of [10,13]) {
    h.ctx.vcqRxRecoverySample('z','video',{dr:0,dfr:0,known:true},h.pc,h.vr,n);
    h.ctx.vcqRxRecoverySample('z','audio',{dr:8,known:true},h.pc,h.ar,n);
  }
  check(h.state().bad===1,'missing sample sequence resets consecutive stall count');
}
// A deferred/rejected L2 attempt must not permanently consume its recovery stage.
for (const reason of ['socket', 'cooldown', 'offer-error']) {
  const h=setup(); await h.boot(); await h.tick(); await h.tick();
  const createOffer=h.pc.createOffer;
  if(reason==='socket') h.ctx.vcConn.ws.readyState=3;
  if(reason==='cooldown') h.pc.__vcRecoveryNegoAt=h.ctx.Date.now();
  if(reason==='offer-error') h.pc.createOffer=async()=>{throw new Error('temporary encoder failure');};
  await h.tick();
  check(!h.state().done[2], reason+': unsuccessful L2 must remain retryable');
  h.ctx.vcConn.ws.readyState=1; h.pc.createOffer=createOffer;
  for(let i=0;i<4;i++) await h.tick();
  check(h.sent.filter(m=>m.type==='offer').length===1, reason+': L2 eventually sends after transient failure');
  check(!!h.state().done[2], reason+': sent offer records completion before returning to stable');
  await h.pc.setRemoteDescription({type:'answer',sdp:'answered'});
  for(let i=0;i<5;i++) await h.tick();
  check(h.sent.filter(m=>m.type==='offer').length===1 && h.counts().restarts===0,
    reason+': successful L2 is not repeated and healthy audio is preserved');
}
// Camera-off guard must return cleanly, even if called directly during a state transition.
{
  const h=setup();await h.boot();await h.tick();await h.tick();
  let resolveOffer, calls=0;
  h.pc.createOffer=()=>{calls++;return new Promise(resolve=>{resolveOffer=resolve;});};
  await h.tick();for(let i=0;i<5;i++)await h.tick();
  check(calls===1 && !h.state().done[2], 'pending L2 cannot start concurrent offers or count as sent');
  await h.tick({f:2,v:8});
  resolveOffer({type:'offer',sdp:'late'});await flush();
  check(!h.state().done[2] && !h.state().negoPending, 'late offer result cannot mark recovered episode as stalled');
  check(h.sent.every(m=>m.type!=='offer'), 'frame recovery while createOffer waits cancels the obsolete offer');
}
{
  const h=setup();await h.boot();await h.tick();await h.tick();
  let resolveOffer;
  h.pc.createOffer=()=>new Promise(resolve=>{resolveOffer=resolve;});
  await h.tick();h.ctx.vcPeerConnections.z={...h.pc};
  resolveOffer({type:'offer',sdp:'old-peer'});await flush();
  check(h.sent.every(m=>m.type!=='offer') && !h.state().done[2], 'replaced peer cannot send or complete old recovery');
}
// Two actual endpoint contexts, including queued signaling and the production
// offer handler. The receiver has the higher ID, so only its peer may offer.
for (const reason of ['busy', 'cooldown', 'offer-error']) {
  const lower = setup(), higher = setup({self:'z', peer:'a'}), queue = [];
  for (const [from, to, id] of [[lower,higher,'a'], [higher,lower,'z']]) {
    const send = from.ctx.vcConn.send;
    from.ctx.vcConn.send = m => { send(m); queue.push({to, message:{...m, data:{...m.data, fromUserId:id}}}); };
    from.ctx.RTCSessionDescription = function(d) { return d; };
    from.ctx.vcFlushPendingIce = () => {};
    from.ctx.vcEnsureIceServers = async () => {};
    from.ctx.vcCreatePeer = () => { throw new Error('recovery must retain the peer'); };
    vm.runInContext(main.slice(main.indexOf('async function vcHandleOffer('), main.indexOf('/** Answer 수신 처리 */')), from.ctx);
  }
  const drain = async () => {
    while (queue.length) {
      const {to, message} = queue.shift();
      if (message.type === 'video-recovery') await to.ctx.vcRecoveryMessage(message.data);
      if (message.type === 'offer') await to.ctx.vcHandleOffer(message.data);
      if (message.type === 'answer') await to.pc.setRemoteDescription(message.data.sdp);
    }
    await flush();
  };
  const tick = async (sample) => { await lower.tick({f:2,v:8}); await higher.tick(sample); await drain(); };
  await lower.boot(); await higher.boot(); await tick(); await tick();
  const createOffer = lower.pc.createOffer;
  let attempts = 0;
  lower.pc.createOffer = async function(options) {
    attempts++;
    if (reason === 'offer-error' && attempts === 1) throw new Error('fail once');
    return createOffer.call(this, options);
  };
  if (reason === 'busy') lower.pc.signalingState = 'have-local-offer';
  if (reason === 'cooldown') lower.pc.__vcRecoveryNegoAt = lower.ctx.Date.now();
  await tick();
  const token = higher.state().token;
  check(!higher.state().done[2], reason+': higher-ID request does not consume L2 before a remote offer');
  check(!lower.pc.__vcRecoveryCommands.renegotiate, reason+': failed owner attempt does not cache the token');
  check(lower.sent.every(m=>m.type!=='offer') && higher.counts().offers===0, reason+': first two-endpoint attempt sends no offer');
  lower.pc.signalingState = 'stable';
  for(let i=0;i<3;i++) await tick();
  check(lower.sent.filter(m=>m.type==='offer').length===1 && higher.pc.remoteDescription?.type==='offer',
    reason+': retried request reaches the smaller-ID owner and actual offer handler');
  check(lower.pc.__vcRecoveryCommands.renegotiate.token===token, reason+': successful offer consumes the incident token');
  for(let i=0;i<9;i++) await tick();
  check(lower.sent.filter(m=>m.type==='offer').length===1 && higher.counts().offers===0,
    reason+': delayed frames and duplicate requests cannot repeat a successful offer');
  check(lower.counts().restarts===0 && higher.counts().restarts===0, reason+': flowing audio never restarts ICE');
  await tick({f:2,v:8});
  const requests = higher.sent.filter(m=>m.data.action==='renegotiate').length;
  for(let i=0;i<10;i++) await tick({f:2,v:8});
  check(!higher.state().started && higher.sent.filter(m=>m.data.action==='renegotiate').length===requests,
    reason+': real frame evidence ends the request retry loop');
}
// Production send silently drops when the socket closes. The close can happen
// during either SDP await, after the original readyState check already passed.
for (const reason of ['create-offer', 'local-description', 'send-throws']) {
  const h=setup(); await h.boot();
  const create=h.pc.createOffer, local=h.pc.setLocalDescription;
  let finish, rollbacks=0, fail=true;
  if(reason==='create-offer') h.pc.createOffer=()=>new Promise(resolve=>{finish=resolve;});
  h.pc.setLocalDescription=async function(sdp) {
    await local.call(this,sdp);
    if(sdp.type==='rollback') rollbacks++;
    else if(reason==='local-description' && fail) await new Promise(resolve=>{finish=resolve;});
  };
  h.ctx.vcConn.send=m=>{
    if(fail && reason==='send-throws' && m.type==='offer') throw new Error('send failed');
    if(h.ctx.vcConn.ws.readyState===1) h.sent.push(m);
  };
  const data={fromUserId:'z',action:'renegotiate',token:'close-'+reason};
  const first=h.ctx.vcRecoveryMessage(data); await flush();
  if(reason!=='send-throws') { h.ctx.vcConn.ws.readyState=3; finish({type:'offer',sdp:'deferred'}); }
  await first;
  check(h.sent.every(m=>m.type!=='offer') && !h.pc.__vcRecoveryCommands.renegotiate,
    reason+': dropped offer does not consume requested token');
  check(h.pc.signalingState==='stable' && rollbacks===(reason==='create-offer'?0:1),
    reason+': unsent local offer cannot wedge signaling');
  fail=false; h.ctx.vcConn.ws.readyState=1; h.pc.createOffer=create;
  await h.tick({f:2,v:8,dt:12000});
  await h.ctx.vcRecoveryMessage(data);
  check(h.sent.filter(m=>m.type==='offer').length===1 && h.pc.__vcRecoveryCommands.renegotiate.token===data.token,
    reason+': reopening the socket permits one same-token retry');
  check(h.counts().restarts===0, reason+': signaling retry does not restart healthy ICE');
}
// A remote/glare winner must not be rolled back or sent as our recovery offer.
{
  const h=setup(); await h.boot(); const local=h.pc.setLocalDescription; let rollbacks=0;
  h.pc.setLocalDescription=async function(sdp) {
    if(sdp.type==='rollback') { rollbacks++; return local.call(this,sdp); }
    await local.call(this,sdp);
    await this.setRemoteDescription({type:'offer',sdp:'remote-winner'});
  };
  await h.ctx.vcRecoveryMessage({fromUserId:'z',action:'renegotiate',token:'glare-winner'});
  check(rollbacks===0 && h.pc.signalingState==='have-remote-offer' && h.sent.every(m=>m.type!=='offer'),
    'remote signaling winner is neither rolled back nor overwritten after local SDP await');
}
// A request deferred behind another offer must not create concurrent work.
{
  const h=setup(); await h.boot(); let finish, calls=0;
  h.pc.createOffer=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  const data={fromUserId:'z',action:'renegotiate',token:'pending-request'};
  const first=h.ctx.vcRecoveryMessage(data); await flush();
  await h.ctx.vcRecoveryMessage(data);
  check(calls===1 && !h.pc.__vcRecoveryCommands.renegotiate, 'duplicate in-flight request neither overlaps nor consumes token');
  finish({type:'offer',sdp:'sent'}); await first;
  await h.ctx.vcRecoveryMessage(data);
  check(calls===1 && h.sent.filter(m=>m.type==='offer').length===1, 'completed request token suppresses another successful offer');
}
for(const reason of ['user','aao']) {
  const h=setup();await h.boot();h.ctx.vcRemoteCamOff.z=reason;
  check(h.ctx.vcRecoveryElement('z',h.pc,h.state())===false && h.counts().plays===0,
    reason+': element recovery neither throws nor plays an intentionally stopped video');
}
check(!/setInterval\(|MutationObserver/.test(helpers), 'no new interval or MutationObserver');
check(server.includes("case 'video-recovery':") && server.includes('!this.isJoined(target)')
  && server.includes('recovery: data?.recovery === true'), 'server routes only joined in-room peers and preserves recovery offer flag');
console.log(`vc_fast_recovery_harness: PASS ${pass} / FAIL 0`);
