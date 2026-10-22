// No media devices or server required: execute the player display and movie code.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../cloudflare-deploy/public/js/ai-dubbing-core.js');
const source = readFileSync(new URL('../cloudflare-deploy/public/js/ai-dubbing.js', import.meta.url), 'utf8');
const elements = new Map();
const el = id => {
  if (!elements.has(id)) elements.set(id, { value: 'en', textContent: '', hidden: false, classList: {
    flags: new Set(), toggle(k,on) { on ? this.flags.add(k) : this.flags.delete(k); },
    remove(k) { this.flags.delete(k); }
  }});
  return elements.get(id);
};
const drawn = [];
const context2d = { fillRect() {}, drawImage() {}, getImageData() {}, fillText(text) { drawn.push(text); } };
class Recorder { constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; } }
const document = { readyState: 'loading', addEventListener() {}, getElementById: el,
  createElement: () => ({ getContext: () => context2d, captureStream: () => ({ addTrack() {} }) }) };
const window = { MangoiDubCore: core, MediaRecorder: Recorder };
class Audio { constructor() { this.readyState = 3; this.muted = false; } }
const sandbox = { window, document, Audio, MediaRecorder: Recorder, localStorage: { getItem: () => '{"ko":false}' },
  console, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {} };
vm.createContext(sandbox);
vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
  window.test = { S: S, scriptMode: scriptMode, showLine: showLine, wShowLine: wShowLine,
    startMovie: startMovie, stopMovie: stopMovie, playSynced: playSynced, setMix: function(m) { MIX = m; } };
})();`), sandbox);
const api = window.test;
api.S.ep = { characters: { mina: { emoji: 'M', name: { ko: '미나', en: 'Mina' } } } };
api.S.cast = [{ name: '학생', character: 'mina' }];
const line = { speaker: 'mina', en: 'Hello, friend!', ko: '안녕, 친구!' };
api.setMix({ rec: { stream: { getAudioTracks: () => [] } } });
el('dub-video').readyState = 2;
el('dub-video').videoWidth = 960;
el('dub-video').videoHeight = 540;
for (const mode of ['en', 'ko', 'none']) {
  el('dub-script-mode').value = mode;
  const run = { scriptMode: api.scriptMode() };
  api.showLine(run, line, { type: 'student', idx: 0 });
  assert.equal(el('dub-sub-en').textContent, mode === 'en' ? line.en : '');
  assert.equal(el('dub-sub-ko').textContent, mode === 'ko' ? line.ko : '');
  assert.equal(el('dub-stage').classList.flags.has('noko'), false, 'Korean-only ignores practice subtitle preference');
  drawn.length = 0;
  assert.ok(api.startMovie(run));
  assert.equal(drawn.includes(line.en), mode === 'en', 'movie English');
  assert.equal(drawn.includes(line.ko), mode === 'ko', 'movie Korean');
  api.wShowLine(api.S.ep, line);
  assert.equal(el('dub-sub-en').textContent, line.en, 'practice always shows English');
  assert.equal(el('dub-sub-ko').textContent, line.ko, 'practice restores translation');
}
el('dub-script-mode').value = 'invalid';
assert.equal(api.scriptMode(), 'en');
assert.ok(!source.includes('listenFirst'), 'dubbing cannot preview selected native lines');
const scene = { lines: [line], voices: { mina: '/mina.mp3', jun: '/jun.mp3' } };
for (const mixed of [false, true]) {
  api.setMix(mixed ? { out: {}, ctx: {
    createGain: () => ({ gain: {}, connect() {} }), createMediaElementSource: () => ({ connect() {} })
  }} : null);
  // Abort after track construction, before playback/timers. Inspect the real routing code.
  const run = { aborted: true, counters: {} };
  await api.playSynced(run, scene);
  const mina = run.tracks.find(t => t.cid === 'mina');
  const jun = run.tracks.find(t => t.cid === 'jun');
  if (mixed) {
    assert.equal(mina.route.gain.gain.value, 0, 'Mina muted in speaker/movie mixer');
    assert.equal(jun.route.gain.gain.value, 1, 'partner audible in speaker/movie mixer');
  } else {
    assert.equal(mina.el.muted, true, 'Mina muted without Web Audio');
    assert.equal(jun.el.muted, false, 'partner audible without Web Audio');
  }
}
console.log('PASS: 3 script modes, movie captions, practice reset, native preview removed, selected/partner voice routing with and without mixer');
