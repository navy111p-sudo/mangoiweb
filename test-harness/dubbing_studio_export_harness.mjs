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
  const c = { Blob, console, exp: { active: false }, MIX: { bus }, state: {}, micSession: null,
    document: { body: { classList: { add() {}, remove() {} } } }, $: el,
    setTimeout(fn) { timers.push(fn); }, cancelAnimationFrame() {}, setStatus(msg) { statuses.push(msg); }, t: k => k,
    downloads: { save(d) { downloads.push(d); return Promise.resolve(); } }, episode: () => ({ id: ep }),
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
  c.exp = { active: true, dest: {}, recorder: oldRec, chunks: [new Blob(['old-data'])], mime: 'video/webm' };
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
console.log('PASS studio export and recording: session ownership, late data, double clicks, stale callbacks, microphone flush; original-disconnect mutation detected');
