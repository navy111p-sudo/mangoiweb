/* Full-source regression for office-mode AudioContext recovery.
 * node test-harness/vc_office_recovery_harness.mjs
 * No copied recovery function: execute the shipping IIFE with deterministic media/time.
 * Real decoded audio is checked separately by manual/vc-office-recovery-browser.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = readFileSync(process.env.OFFICE_SOURCE || fileURLToPath(new URL('../cloudflare-deploy/public/js/idx-vc-officemode.js', import.meta.url)), 'utf8');
let passed = 0;
const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

function fixture({ muted = false, pref = '1', borrowed = true } = {}) {
  let clock = 10000, nextTimer = 0, seq = 0, inCall = false;
  const timers = new Map(), contexts = [], requests = [], tracks = [];
  const storage = new Map(pref === null ? [] : [['mangoi_vc_office', pref]]);
  storage.set('mangoi_vc_mic_id', 'saved-other-mic');
  let failExact = false;
  class Track {
    constructor(device = 'chosen-usb-mic', agc = false) {
      this.kind = 'audio'; this.id = `track-${++seq}`; this.enabled = true; this.readyState = 'live';
      this.settings = { deviceId: device, autoGainControl: agc }; this.listeners = new Map(); tracks.push(this);
    }
    getSettings() { return { ...this.settings }; }
    async applyConstraints(c) { if (borrowed) this.settings.autoGainControl = c.autoGainControl; }
    stop() { this.readyState = 'ended'; }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
  }
  class Stream {
    constructor(ts = []) { this.tracks = ts; }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    getTracks() { return this.tracks.slice(); }
    addTrack(t) { this.tracks.push(t); }
    removeTrack(t) { this.tracks = this.tracks.filter(v => v !== t); }
  }
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1, setTargetAtTime() {} }, frequency: { value: 0 }, fftSize: 1024, getFloatTimeDomainData(buf) { buf.fill(0.2); } });
  class Context {
    constructor() { this.state = 'running'; this.currentTime = 0; this.listeners = new Set(); this.resumes = 0; this.resumeKind = 'pending'; contexts.push(this); }
    addEventListener(type, fn) { if (type === 'statechange') this.listeners.add(fn); }
    removeEventListener(type, fn) { this.listeners.delete(fn); }
    change(state) { this.state = state; for (const fn of [...this.listeners]) fn(); }
    resume() {
      this.resumes++;
      if (this.resumeKind === 'throw') throw new Error('resume throw');
      if (this.resumeKind === 'reject') return Promise.reject(new Error('resume rejected'));
      if (this.resumeKind === 'success') { this.change('running'); return Promise.resolve(); }
      return new Promise(() => {});
    }
    async close() { this.change('closed'); }
    createMediaStreamSource() { return node(); }
    createBiquadFilter() { return node(); }
    createGain() { return node(); }
    createAnalyser() { return node(); }
    createMediaStreamDestination() { return { ...node(), stream: new Stream([new Track('WebAudio-output', false)]) }; }
  }
  const original = new Track('chosen-usb-mic', borrowed ? false : true);
  original.enabled = !muted;
  const local = new Stream([original]);
  const senders = Array.from({ length: 2 }, () => ({ track: original, replacements: [], async replaceTrack(t) { this.track = t; this.replacements.push(t); } }));
  const world = {
    Date: class extends Date { static now() { return clock; } },
    console: { log() {}, warn() {}, error() {} }, MediaStream: Stream, AudioContext: Context,
    setInterval(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearInterval(id) { timers.delete(id); }, setTimeout() {},
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    document: { hidden: false, readyState: 'complete', body: { classList: { contains: () => inCall } } },
    navigator: { mediaDevices: { async getUserMedia(c) {
      requests.push(structuredClone(c));
      if (failExact && c.audio?.deviceId?.exact) throw new Error('device unplugged');
      return new Stream([new Track(c.audio?.deviceId?.exact || 'default-mic', c.audio?.autoGainControl ?? true)]);
    } } },
    vcLocalStream: local, vcPeerConnections: Object.fromEntries(senders.map((sender, i) => [i, { getSenders: () => [sender] }])),
    vcIsStaffNow: () => true, showView() {},
  };
  world.window = world;
  vm.runInNewContext(source, world, { filename: 'idx-vc-officemode.js' });
  return {
    world, local, senders, storage, requests, contexts, original, timers, tracks,
    context: () => contexts.at(-1), setFailExact: () => { failExact = true; },
    async enable() { inCall = true; assert.equal(await world.vcSetOfficeMode(true), true); await drain(); assert.equal(world.vcOfficeModeOn(), true); },
    async autoEnable() { inCall = true; world.showView('view-videocall-call'); await this.advance(500); await drain(); assert.equal(world.vcOfficeModeOn(), true); },
    async advance(ms) { clock += ms; for (const { fn } of [...timers.values()]) fn(); await drain(); },
  };
}

async function check(name, fn) { await fn(); passed++; console.log(`  ✅ ${name}`); }
function restored(f, muted, expectedPref = '1') {
  const t = f.local.getAudioTracks()[0];
  assert.equal(f.world.vcOfficeModeOn(), false);
  assert.equal(t.readyState, 'live');
  assert.equal(t.enabled, !muted);
  assert.equal(t.getSettings().autoGainControl, true);
  assert(!t.getSettings().deviceId.startsWith('WebAudio'));
  assert(f.senders.every(s => s.track === t), 'every actual sender must be replaced, not only localStream');
  assert.equal(f.storage.get('mangoi_vc_office') ?? null, expectedPref);
  assert.equal(f.storage.get('mangoi_vc_mic_id'), 'saved-other-mic');
  assert.equal(f.timers.size, 0, 'old gate timer must be removed');
  assert.equal(f.context().listeners.size, 0, 'closed engine must not retain recovery callback');
}

for (const state of ['suspended', 'interrupted', 'closed']) {
  for (const muted of [false, true]) {
    await check(`${state}, ${muted ? 'muted' : 'audible'}: real IIFE restores every sender and selection`, async () => {
      const f = fixture({ muted }); await f.enable();
      const processed = f.local.getAudioTracks()[0];
      assert(f.senders.every(s => s.track === processed));
      f.context().change(state);
      await f.advance(999); assert.equal(f.world.vcOfficeModeOn(), true, 'brief interruptions get a grace period');
      await f.advance(1); restored(f, muted);
      assert.equal(f.local.getAudioTracks()[0].getSettings().deviceId, 'chosen-usb-mic');
      assert.equal(f.context().resumes, state === 'closed' ? 0 : 1);
      f.world.showView('view-videocall-call'); await f.advance(1000);
      assert.equal(f.world.vcOfficeModeOn(), false, 'saved on must not re-enable automatically after fallback');
      assert.equal(f.contexts.length, 1);
      await f.world.navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: true } });
      assert.equal(f.requests.at(-1).audio.autoGainControl, true, 'fallback must also stop the AGC hook');
      await f.enable(); assert.equal(f.contexts.length, 2, 'explicit retry remains possible');
      assert.equal(f.local.getAudioTracks()[0].enabled, !muted);
      await f.world.vcSetOfficeMode(false);
    });
  }
}

await check('hidden/throttled tab: elapsed one second recovers on the next callback, without 40 ticks', async () => {
  const f = fixture(); await f.enable(); f.world.document.hidden = true;
  f.context().change('suspended'); await f.advance(5000); restored(f, false);
});
await check('missing statechange: periodic guard still notices the stopped engine', async () => {
  const f = fixture(); await f.enable(); f.context().state = 'interrupted';
  await f.advance(25); await f.advance(1000); restored(f, false);
});
await check('successful resume: keep the processing chain and reset the stall clock', async () => {
  const f = fixture(); await f.enable(); const t = f.local.getAudioTracks()[0];
  f.context().resumeKind = 'success'; f.context().change('suspended'); await f.advance(2000);
  assert.equal(f.world.vcOfficeModeOn(), true); assert.equal(f.local.getAudioTracks()[0], t);
  f.context().resumeKind = 'pending'; f.context().change('interrupted');
  await f.advance(999); assert.equal(f.world.vcOfficeModeOn(), true); await f.advance(1); restored(f, false);
});
for (const kind of ['reject', 'throw', 'pending']) {
  await check(`resume ${kind}: bounded attempt cannot block fallback or escape as unhandled rejection`, async () => {
    const f = fixture(); await f.enable(); f.context().resumeKind = kind; f.context().change('suspended');
    for (let i = 0; i < 40; i++) await f.advance(25);
    restored(f, false); assert.equal(f.context().resumes, 1);
  });
}
await check('owned raw source + selected device fails: retry default mic with mute, preference and AGC intact', async () => {
  const f = fixture({ muted: true, borrowed: false }); await f.enable(); f.setFailExact();
  f.context().change('closed'); await f.advance(1000); restored(f, true);
  assert.equal(f.local.getAudioTracks()[0].getSettings().deviceId, 'default-mic');
  const attempts = f.requests.slice(-2);
  assert.equal(attempts[0].audio.deviceId.exact, 'chosen-usb-mic');
  assert.equal(attempts[1].audio.deviceId, undefined);
  assert(attempts.every(c => c.audio.autoGainControl === true));
});
await check('automatic/default-on preference stays absent after engine fallback', async () => {
  const f = fixture({ pref: null }); await f.autoEnable(); f.context().change('suspended');
  await f.advance(1000); restored(f, false, null);
});
await check('disable and explicit re-enable do not carry an unfinished stall into the new engine', async () => {
  const f = fixture(); await f.enable(); const old = f.context(); old.change('suspended'); await f.advance(800);
  await f.world.vcSetOfficeMode(false); await f.enable(); old.change('closed');
  f.context().change('suspended'); await f.advance(200); assert.equal(f.world.vcOfficeModeOn(), true);
  await f.advance(800); restored(f, false);
});
// Give Node an event-loop turn: a missing catch on a rejected resume must fail this process.
await new Promise(resolve => setImmediate(resolve));
console.log(`\nPASS ${passed}  FAIL 0`);
