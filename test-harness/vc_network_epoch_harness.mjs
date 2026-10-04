/* Execute the shipping qlog script against synthetic HOME/OFFICE receiver reports.
 * No production requests, credentials, media, or network shaping. These tests check
 * reconnect counter identity and diagnostic truthfulness, not KR/PH field quality.
 * QLOG_SOURCE can point to the unmodified baseline for a falsification run.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(process.env.QLOG_SOURCE || new URL('../cloudflare-deploy/public/js/idx-vc-qlog.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const results = [], observations = [];
async function check(name, fn) {
  try { await fn(); pass++; results.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) { fail++; results.push({ name, pass: false, error: error.message }); console.log('FAIL ' + name + ': ' + error.message); }
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture(profile) {
  const Q = () => ({ s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], pt: 0, pr: 0, sentAt: Date.now() });
  const w = { console: { log() {}, warn() {}, error() {} }, setInterval: () => 1, clearInterval() {},
    document: { body: { classList: { contains: () => true } }, getElementById: () => null },
    localStorage: { getItem: () => null }, navigator: {}, vcRoomId: 'harness-offline-' + profile,
    vcPeerConnections: {}, __vcQ: Q(), __vcAAO: { active: false }, vcMyRole: 'teacher',
  }; w.window = w;
  vm.createContext(w); vm.runInContext(source, w);
  return { w, Q, async tick() { w.vcqRxTick(); await flush(); } };
}
function peer() {
  const rows = Object.fromEntries(['video', 'audio'].map(kind => [kind, {
    id: kind + '-1', type: 'inbound-rtp', kind, packetsLost: 0, packetsReceived: 100,
    framesDecoded: 10, framesReceived: 10, freezeCount: 0, concealedSamples: 0, totalSamplesReceived: 10000,
  }]));
  const receivers = ['video', 'audio'].map(kind => ({ track: { id: kind + '-track1', kind, readyState: 'live', enabled: true },
    getStats: async () => new Map([[rows[kind].id, { ...rows[kind] }]]) }));
  return { rows, receivers, getReceivers: () => receivers, connectionState: 'connected', iceConnectionState: 'connected' };
}
function path(local = 'srflx', remote = 'host', extra = {}) {
  return new Map([
    ['T', { id: 'T', type: 'transport', selectedCandidatePairId: 'P' }],
    ['P', { id: 'P', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'L', remoteCandidateId: 'R', ...extra }],
    ['L', { id: 'L', type: 'local-candidate', candidateType: local, url: local === 'relay' ? 'turn:synthetic.invalid:3478?transport=udp' : '', relayProtocol: 'udp' }],
    ['R', { id: 'R', type: 'remote-candidate', candidateType: remote }],
  ]);
}
for (const profile of ['HOME', 'OFFICE']) {
  for (const change of ['peer-rebuild', 'track-replacement', 'stats-id-change', 'counter-reset']) for (const counter of change === 'counter-reset' ? ['lower'] : ['lower', 'higher']) {
    await check(`${profile}: ${change}/${counter} resets silent streak and excludes cross-epoch deltas`, async () => {
      const f = fixture(profile); let p = peer(); f.w.vcPeerConnections.peer = p;
      await f.tick();
      for (let n = 0; n < 15; n++) await f.tick();
      assert.equal(f.w.vcPeerNoMedia('peer'), 60, 'precondition: old media was silent for 60s');
      if (change === 'peer-rebuild') { p = peer(); f.w.vcPeerConnections.peer = p; }
      if (change === 'track-replacement') for (const r of p.receivers) r.track = { ...r.track, id: r.track.id + '-new' };
      if (change === 'stats-id-change') for (const r of Object.values(p.rows)) r.id += '-new';
      for (const r of Object.values(p.rows)) { r.packetsReceived = counter === 'lower' ? 1 : 1000; r.packetsLost = 50; r.freezeCount = 8; r.concealedSamples = 4800; r.totalSamplesReceived = 20000; }
      const before = [f.w.__vcQ.rxv.length, f.w.__vcQ.rxa.length, f.w.__vcQ.rxc.length, f.w.__vcQ.rxf];
      await f.tick();
      observations.push({ profile, scenario: change + '/' + counter, silentSeconds: f.w.vcPeerNoMedia('peer'), newVideoLossSamples: f.w.__vcQ.rxv.length - before[0], videoLossPercent: f.w.__vcQ.rxv.length > before[0] ? f.w.__vcQ.rxv.at(-1) : null, newAudioLossSamples: f.w.__vcQ.rxa.length - before[1], newConcealSamples: f.w.__vcQ.rxc.length - before[2], newFreezeCount: f.w.__vcQ.rxf - before[3] });
      assert.equal(f.w.vcPeerNoMedia('peer'), 0, 'new media must not inherit old silence');
      assert.deepEqual([f.w.__vcQ.rxv.length, f.w.__vcQ.rxa.length, f.w.__vcQ.rxc.length, f.w.__vcQ.rxf], before, 'a new baseline must not count loss, concealment or freezes');
      for (const r of Object.values(p.rows)) { r.packetsReceived += 90; r.packetsLost += 10; r.freezeCount++; r.framesDecoded += 20; r.framesReceived += 20; r.concealedSamples += 480; r.totalSamplesReceived += 4800; }
      await f.tick();
      assert.equal(f.w.__vcQ.rxv.at(-1), 10); assert.equal(f.w.__vcQ.rxa.at(-1), 10);
      assert.equal(f.w.__vcQ.rxc.at(-1), 10); assert.equal(f.w.__vcQ.rxf, before[3] + 1);
      assert.equal(f.w.vcPeerNoMedia('peer'), 0);
    });
  }
  await check(`${profile}: a rebuilt peer is not considered silent while its first stats are pending`, async () => {
    const f = fixture(profile), old = peer(); f.w.vcPeerConnections.peer = old;
    await f.tick(); for (let i = 0; i < 15; i++) await f.tick();
    assert.equal(f.w.vcPeerNoMedia('peer'), 60);
    const fresh = peer(); f.w.vcPeerConnections.peer = fresh;
    for (const r of fresh.receivers) r.getStats = () => new Promise(() => {});
    await f.tick(); assert.equal(f.w.vcPeerNoMedia('peer'), 0);
  });
  await check(`${profile}: replaced tracks are not considered silent while their first stats are pending`, async () => {
    const f = fixture(profile), p = peer(); f.w.vcPeerConnections.peer = p;
    await f.tick(); for (let i = 0; i < 15; i++) await f.tick();
    assert.equal(f.w.vcPeerNoMedia('peer'), 60);
    for (const r of p.receivers) { r.track = { ...r.track, id: r.track.id + '-new' }; r.getStats = () => new Promise(() => {}); }
    await f.tick(); assert.equal(f.w.vcPeerNoMedia('peer'), 0);
  });
  await check(`${profile}: a replaced video baseline clears the prior loss-warning streak`, async () => {
    const f = fixture(profile), p = peer(); f.w.vcPeerConnections.peer = p;
    await f.tick();
    for (let i = 0; i < 3; i++) { p.rows.video.packetsLost += 25; p.rows.video.packetsReceived += 25; await f.tick(); }
    assert.equal(f.w.__vcRxBad.peer, 3);
    p.receivers[0].track = { ...p.receivers[0].track, id: 'new-track' };
    await f.tick(); assert.equal(f.w.__vcRxBad.peer, 0);
  });
  await check(`${profile}: missing packet counters never grow a false silence streak`, async () => {
    const f = fixture(profile), p = peer(); f.w.vcPeerConnections.peer = p;
    await f.tick();
    for (const r of Object.values(p.rows)) delete r.packetsReceived;
    for (let i = 0; i < 20; i++) await f.tick();
    assert.equal(f.w.vcPeerNoMedia('peer'), 0);
  });
  await check(`${profile}: a late receive report cannot attach to a replacement track`, async () => {
    const f = fixture(profile), p = peer(); f.w.vcPeerConnections.peer = p;
    let finish; p.receivers[0].getStats = () => new Promise(resolve => { finish = resolve; });
    await f.tick(); p.receivers[0].track = { ...p.receivers[0].track, id: 'new-track' };
    finish(new Map([['old', { ...p.rows.video }]])); await flush();
    assert.equal(f.w.__vcRxPrev['peer:video'], undefined);
  });
  await check(`${profile}: receive reports cannot repopulate a completed summary/session`, async () => {
    const f = fixture(profile), p = peer(); f.w.vcPeerConnections.peer = p;
    let finish; p.receivers[0].getStats = () => new Promise(resolve => { finish = resolve; });
    await f.tick(); const old = f.w.__vcQ; f.w.__vcQ = f.Q();
    finish(new Map([['old', { ...p.rows.video }]])); await flush();
    assert.equal(f.w.__vcRxPrev['peer:video'], undefined);
    assert.equal(old.rxv.length, 0);
  });
  for (const [local, remote] of [[undefined, undefined], ['host', undefined], ['unknown', 'srflx']]) {
    await check(`${profile}: unknown candidate ${local}/${remote} is not reported as Direct`, async () => {
      const f = fixture(profile), p = { getStats: async () => path(local, remote) };
      // Explicit undefined would otherwise use path()'s defaults.
      const report = path(); report.get('L').candidateType = local; report.get('R').candidateType = remote;
      p.getStats = async () => report; f.w.vcPeerConnections.peer = p;
      await f.tick(); assert.equal(f.w.__vcQ.pt, 0); assert.equal(f.w.__vcPath?.peer, undefined);
    });
  }
  await check(`${profile}: partial candidate details still prove Relay when one side is relay`, async () => {
    const f = fixture(profile), report = path('relay', 'host'); report.delete('R');
    f.w.vcPeerConnections.peer = { getStats: async () => report };
    await f.tick(); assert.equal(f.w.__vcQ.pt, 1); assert.equal(f.w.__vcQ.pr, 1);
  });
  await check(`${profile}: selected failed pair is not a healthy path sample`, async () => {
    const f = fixture(profile); f.w.vcPeerConnections.peer = { getStats: async () => path('host', 'srflx', { state: 'failed' }) };
    await f.tick(); assert.equal(f.w.__vcQ.pt, 0);
  });
  await check(`${profile}: late old peer path cannot overwrite rebuilt peer path`, async () => {
    const f = fixture(profile); let finish;
    const old = { getStats: () => new Promise(resolve => { finish = resolve; }) }; f.w.vcPeerConnections.peer = old;
    await f.tick(); f.w.vcPeerConnections.peer = { getStats: async () => path('srflx', 'host') }; await f.tick();
    finish(path('relay', 'host')); await flush();
    assert.equal(f.w.__vcQ.pt, 1); assert.equal(f.w.__vcQ.pr, 0); assert.equal(f.w.__vcPath.peer.relay, false);
  });
  await check(`${profile}: one slow path probe cannot overlap or reorder subsequent samples`, async () => {
    const f = fixture(profile); let finish, calls = 0;
    f.w.vcPeerConnections.peer = { getStats: () => { calls++; return new Promise(resolve => { finish = resolve; }); } };
    await f.tick(); await f.tick(); assert.equal(calls, 1);
    finish(path()); await flush(); assert.equal(f.w.__vcQ.pt, 1);
  });
  await check(`${profile}: a late path report cannot repopulate a completed summary/session`, async () => {
    const f = fixture(profile); let finish;
    f.w.vcPeerConnections.peer = { getStats: () => new Promise(resolve => { finish = resolve; }) };
    await f.tick(); const old = f.w.__vcQ; f.w.__vcQ = f.Q();
    finish(path('relay', 'host')); await flush();
    assert.equal(old.pt, 0); assert.equal(f.w.__vcQ.pt, 0); assert.equal(f.w.__vcPath?.peer, undefined);
  });
  await check(`${profile}: synchronous path probe failure releases its read guard`, async () => {
    const f = fixture(profile); let calls = 0;
    f.w.vcPeerConnections.peer = { getStats: () => { if (++calls === 1) throw new Error('synthetic sync failure'); return Promise.resolve(path()); } };
    await f.tick(); await f.tick(); assert.equal(calls, 2); assert.equal(f.w.__vcQ.pt, 1);
  });
  await check(`${profile}: rejected path probe is retryable`, async () => {
    const f = fixture(profile); let calls = 0;
    f.w.vcPeerConnections.peer = { getStats: async () => { if (++calls === 1) throw new Error('synthetic failure'); return path(); } };
    await f.tick(); await f.tick(); assert.equal(calls, 2); assert.equal(f.w.__vcQ.pt, 1);
  });
}
console.log(JSON.stringify({ evidence: 'synthetic full-source VM only', profiles: ['HOME', 'OFFICE'], pass, fail, observations, results }, null, 2));
console.log(`vc_network_epoch_harness: PASS ${pass} / FAIL ${fail} / SKIP 0`);
if (fail) process.exitCode = 1;
