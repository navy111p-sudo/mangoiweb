// Execute the actual inline handlers with deliberately reordered recorder callbacks.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../cloudflare-deploy/public/ai-dubbing-studio.html', import.meta.url), 'utf8');
const extract = (name, next) => html.slice(html.indexOf(`function ${name}(`), html.indexOf(`function ${next}(`));
const finish = extract('finishExport', 'resetEpisode');
const start = extract('startExport', 'drawFrame');
function environment() {
  const timers = [], disconnected = [], statuses = [], downloads = [];
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', classList: { add() {}, remove() {} }, captureStream: () => ({ addTrack() {} }) }); return elements.get(id); };
  let ep = 'picnic';
  const bus = { connect() {}, disconnect(d) { disconnected.push(d); } };
  const ctx = { resume() {}, createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [{}] } }) };
  const c = { Blob, console, exp: { active: false }, MIX: { bus }, state: { lang: 'ko' }, micSession: null,
    DubLibrary: null, studioIdentity: 'guest', sameStudioAccount: () => true, saveStudioMovie() {}, checkpointStudio() {},
    document: { body: { classList: { add() {}, remove() {} } } }, $: el,
    setTimeout(fn) { timers.push(fn); }, cancelAnimationFrame() {}, setStatus(msg) { statuses.push(msg); }, t: k => k,
    downloads: { save(d) { downloads.push(d); return Promise.resolve(); } }, episode: () => ({ id: ep, title: { ko: ep, en: ep } }),
    canExport: () => true, audioCtx: () => ctx, lines: () => [], pickMime: () => 'video/webm',
    drawFrame() {}, savePrefs() {}, renderSettings() {}, play() {},
    MediaRecorder: class { constructor() { this.mimeType = 'video/webm'; this.state = 'inactive'; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; } },
  };
  vm.createContext(c);
  return { c, timers, disconnected, statuses, downloads, changeEpisode: id => { ep = id; } };
}
function testDestination(code = finish) {
  const e = environment(), { c } = e, oldDest = {}, newDest = {};
  c.exp = { active: true, dest: oldDest, recorder: new c.MediaRecorder(), chunks: [], mime: 'video/webm' };
  vm.runInContext(code, c); c.finishExport(false);
  c.exp.dest = newDest; c.exp.recorder = new c.MediaRecorder(); c.exp.active = true;
  e.timers.forEach(fn => fn());
  assert.equal(e.disconnected.length, 1); assert.equal(e.disconnected[0], oldDest);
}
testDestination();
assert.throws(() => testDestination(finish.replace('MIX.bus.disconnect(dest)', 'MIX.bus.disconnect(exp.dest)')), 'mutation: disconnecting current destination must fail');

{
  const e = environment(), { c } = e, oldRec = new c.MediaRecorder();
  c.exp = { active: true, dest: {}, recorder: oldRec, chunks: [new Blob(['old-data'])], mime: 'video/webm', owner: 'guest', meta: { episodeId: 'picnic' }, startedAt: Date.now() };
  vm.runInContext(finish, c); c.finishExport(true);
  c.exp = { active: true, dest: {}, recorder: new c.MediaRecorder(), chunks: [new Blob(['new'])], mime: 'video/mp4' }; e.changeEpisode('teddy');
  await oldRec.onstop();
  assert.match(e.downloads[0].filename, /^dub-picnic-.*\.webm$/); assert.equal(await e.downloads[0].data.text(), 'old-data');
  assert.equal(e.statuses.length, 0, 'old completion must not overwrite current export status');
}
{
  const e = environment(), { c } = e;
  vm.runInContext(start, c); c.startExport(); const firstRec = c.exp.recorder, firstChunks = c.exp.chunks;
  c.startExport(); assert.equal(c.exp.recorder, firstRec, 'double click must not replace active recorder');
  c.exp.active = false; c.startExport(); const secondChunks = c.exp.chunks;
  firstRec.ondataavailable({ data: new Blob(['late']) });
  assert.equal(firstChunks.length, 1); assert.equal(secondChunks.length, 0, 'late chunks belong to their original recorder');
}
{
  const { c, timers } = environment(), calls = [];
  c.exp = { active: true, recorder: {} }; c.state = {};
  c.stopAll = () => {}; c.stopMusic = () => {}; c.isMine = () => true;
  c.t = () => () => 'done'; c.renderTransport = () => {}; c.finishExport = () => calls.push('finish');
  const fn = html.slice(html.indexOf('function finishEpisode()'), html.indexOf('\n/* =========================================================', html.indexOf('function finishEpisode()')));
  vm.runInContext(fn, c); c.finishEpisode(); c.exp.recorder = {}; timers.forEach(fn => fn());
  assert.equal(calls.length, 0, 'old end-of-episode timer must not finish a replacement export');
}
{
  const code = html.slice(html.indexOf('function stopMicRecording('), html.indexOf('async function pickRecording('));
  let stopped = false, requested = false;
  const session = { stopping: false, discard: false, stream: { getTracks: () => [{ stop() { stopped = true; } }] },
    recorder: { state: 'recording', stop() { requested = true; this.state = 'inactive'; } } };
  const c = { micSession: session }; vm.createContext(c); vm.runInContext(code, c);
  c.stopMicRecording(); assert.equal(requested, true); assert.equal(stopped, false, 'input stays live until recorder flushes');
  session.stream.getTracks().forEach(t => t.stop()); assert.equal(stopped, true);
}
{
  const writes = [], statuses = [], stream = { getTracks: () => [{ stop() {} }] };
  class Recorder { constructor() { this.mimeType = 'audio/webm'; this.state = 'inactive'; } start() { this.state = 'recording'; } }
  const c = { Blob, micSession: null, state: {}, window: { isSecureContext: true, MediaRecorder: Recorder }, MediaRecorder: Recorder,
    studioReady: true, studioLoading: false, studioDeleting: new Set(), studioIdentity: 'guest', studioRevision: () => 0, sameStudioRevision: () => true, episode: () => ({ id: 'picnic' }),
    navigator: { mediaDevices: { getUserMedia: async () => stream } }, pause() {}, recKey: i => `picnic:${i}`,
    setStatus: s => statuses.push(s), t: k => k, renderCurrent() {}, renderCues() {}, renderRecUI() {},
    setRec: (...a) => writes.push(a), dbWrite() {}, canPlay: async () => false };
  vm.createContext(c);
  const code = html.slice(html.indexOf('async function pickRecording('), html.indexOf("window.addEventListener('pagehide'"));
  vm.runInContext(code, c); await c.pickRecording(0); const r = c.micSession.recorder;
  r.ondataavailable({ data: new Blob(['header-only']) }); await r.onstop();
  assert.equal(writes.length, 0, 'unplayable recordings must not be marked saved'); assert.equal(statuses.at(-1), 'micFailed');
  let release;
  c.canPlay = () => new Promise(resolve => { release = resolve; });
  await c.pickRecording(0); const next = c.micSession.recorder;
  next.ondataavailable({ data: new Blob(['valid take']) }); const completing = next.onstop();
  c.sameStudioRevision = () => false; release(true); await completing;
  assert.equal(writes.length, 0, 'account/revision changes during validation must prevent old writes');
}
console.log('PASS studio export and recording: session ownership, late data, double clicks, stale callbacks, microphone flush, unplayable audio rejection; original-disconnect mutation detected');
