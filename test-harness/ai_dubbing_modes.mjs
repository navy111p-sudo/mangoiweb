// No media devices or server required: execute the player display and movie code.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
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
const window = { MangoiDubCore: {}, MediaRecorder: Recorder };
const sandbox = { window, document, MediaRecorder: Recorder, localStorage: { getItem: () => '{"ko":false}' },
  console, setInterval() {}, clearInterval() {}, setTimeout() {}, clearTimeout() {} };
vm.createContext(sandbox);
vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
  window.test = { S: S, scriptMode: scriptMode, showLine: showLine, wShowLine: wShowLine,
    startMovie: startMovie, stopMovie: stopMovie, setMix: function(m) { MIX = m; } };
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
console.log('PASS: 3 script modes, movie captions, practice reset, invalid setting fallback, native preview removed');
