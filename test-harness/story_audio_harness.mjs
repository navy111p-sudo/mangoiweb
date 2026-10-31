import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('cloudflare-deploy/public/js/story-audio.js', 'utf8');
export function setup({ voices = [], blocked = false, deferred = false } = {}) {
  const media = [], timers = new Map(), notices = [];
  let id = 0;
  class Audio {
    constructor() { media.push(this); this.duration = 3; this.calls = 0; }
    play() {
      this.calls++;
      if (deferred) return new Promise((resolve, reject) => { (this.pending ||= []).push({ resolve, reject }); });
      return blocked ? Promise.reject({ name: 'NotAllowedError' }) : Promise.resolve();
    }
    pause() {} load() {} removeAttribute() {}
  }
  const synth = { getVoices: () => voices, speak(u) { this.current = u; }, cancel() {} };
  const events = {};
  const window = { Audio, addEventListener(name, fn) { events[name] = fn; } };
  if (voices.length) Object.assign(window, { speechSynthesis: synth, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } });
  const document = { createElement: () => ({ style: {}, setAttribute() {}, appendChild(child) { this.child = child; } }), body: { appendChild(x) { notices.push(x); } } };
  vm.runInNewContext(source, { window, document, setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(n) { timers.delete(n); } });
  return { api: window.StoryAudio, media, synth, timers, notices, events };
}
{
  const { api, media } = setup(); let ended = 0;
  api.speak('Hello world.', 0.8, () => ended++);
  assert.equal(media.length, 1); assert.equal(media[0].calls, 1);
  assert.equal(new URL(media[0].src, 'https://example.test').searchParams.get('lang'), 'en');
  assert.equal(media[0].playbackRate, 0.8); assert.equal(ended, 0);
  const finish = media[0].onended; finish(); finish(); assert.equal(ended, 1);
}
{
  const { api, media } = setup(); let ended = 0;
  api.speak('Old', 1, () => ended++); const stale = media[0].onended;
  api.stop(); stale(); assert.equal(ended, 0); assert.equal(api.isSpeaking(), false);
  api.speak('New', 1, () => ended++); stale(); assert.equal(ended, 0);
  media[0].onended(); assert.equal(ended, 1);
}
{
  const { api, media } = setup(); let ended = 0;
  const text = 'A sentence with several words. '.repeat(80).trim();
  api.speak(text, 1, () => ended++);
  const parts = [];
  while (api.isSpeaking()) { parts.push(new URL(media[0].src, 'https://x.test').searchParams.get('q')); media[0].onended(); }
  assert.ok(parts.every(p => p.length <= 180)); assert.equal(parts.join(' '), text); assert.equal(ended, 1);
}
{
  const { api, media, notices } = setup(); let ended = 0;
  api.speak('Failure', 1, () => ended++); media[0].onerror();
  assert.equal(ended, 0); assert.equal(api.isSpeaking(), false); assert.ok(notices[0].textContent.includes('Audio unavailable'));
}
{
  const { api, media, synth } = setup({ voices: [{ lang: 'en-US' }] }); let ended = 0;
  api.speak('Fallback', 1, () => ended++); media[0].onerror(); assert.equal(synth.current.text, 'Fallback');
  synth.current.onend(); assert.equal(ended, 1);
}
{
  const { api, media, synth } = setup({ voices: [{ lang: 'en-US' }] }); let ended = 0;
  api.speak('Fallback error', 1, () => ended++); media[0].onerror(); synth.current.onerror();
  assert.equal(ended, 0); assert.equal(api.isSpeaking(), false);
}
{
  const { api, media, notices } = setup({ blocked: true }); let ended = 0;
  api.speak('Blocked', 1, () => ended++); await Promise.resolve();
  assert.equal(ended, 0); assert.ok(notices[0].child); assert.equal(api.isSpeaking(), false);
  notices[0].child.onclick(); assert.equal(media[0].calls, 2); await Promise.resolve();
}
{
  const { api, timers } = setup(); let ended = 0;
  api.speak('Timeout', 1, () => ended++); [...timers.values()][0]();
  assert.equal(ended, 0); assert.equal(api.isSpeaking(), false);
}
let books = 0;
for (const file of readdirSync('cloudflare-deploy/public').filter(x => /^story-(?:s\d-\d+|red-umbrella|birthday-cake|robot-dance|treasure-map)\.html$/.test(x))) {
  const html = readFileSync('cloudflare-deploy/public/' + file, 'utf8');
  assert.ok(html.includes('/js/story-audio.js?v=1'), file);
  assert.ok(html.includes('window.StoryAudio.speak(text,'), file);
  assert.ok(!html.includes('synth.speak(u)'), file);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1], { filename: file });
  books++;
}
assert.equal(books, 184);
console.log(`PASS: 8 audio scenarios and ${books} storybook integrations/syntax checks`);
