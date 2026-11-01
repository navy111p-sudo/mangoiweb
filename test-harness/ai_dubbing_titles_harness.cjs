const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pub = path.join(__dirname, '../cloudflare-deploy/public');
const C = require(path.join(pub, 'js/ai-dubbing-core.js'));
const W = require(path.join(pub, 'js/ai-dubbing-watch.js'));
const raw = JSON.parse(fs.readFileSync(path.join(pub, 'data/dubbing/dub-007.json')));
const ep = C.normalizeEpisode(raw).episode;
assert.equal(ep.scenes.length, 6);
assert.ok(ep.scenes.every(s => s.playbackStartSec === 2 && s.timing === 'synced'));
for (const value of [-1, Infinity, 61, 12]) {
  const copy = structuredClone(raw);
  copy.scenes[0].playbackStartSec = value;
  assert.equal(C.normalizeEpisode(copy).episode.scenes[0].playbackStartSec, 0);
}
const media = [];
class Media {
  constructor() { this.readyState = 4; this.paused = true; this.currentTime = 0; this.seeks = []; media.push(this); }
  set currentTime(t) { this.time = t; if (this.seeks) this.seeks.push(t); }
  get currentTime() { return this.time; }
  play() { this.seeks.push(this.currentTime); this.paused = false; this.ended = false; this.timer = setInterval(() => { this.time += 1; if (this.time >= 61) this.ended = true; }, 1); return Promise.resolve(); }
  pause() { this.paused = true; clearInterval(this.timer); }
}
(async () => {
  const video = new Media(), cards = [], seen = [];
  const watch = W.create({ C, Audio: Media, opt: { cardMs: 1, endMs: 0, tickMs: 1 }, video: () => video,
    prepVideo: () => {}, waitVideo: () => Promise.resolve(true),
    route: () => ({ cut() {} }), card: item => { if (item && !item.end) cards.push(item.scIdx); },
    clearLine() {}, showLine() {}, onSeen: (id, no) => seen.push(no),
  });
  assert.equal(await watch.start([0, 1].map(scIdx => ({ ep, scIdx }))), true);
  assert.deepEqual(cards, [0]);
  assert.deepEqual(seen, [1, 2]);
  assert.ok(media.every(m => m.seeks.length && m.seeks.every(t => t === 2)), 'Video and all voice/music tracks start at the same original timestamp');
  cards.length = 0;
  await watch.start([{ ep, scIdx: 3 }]);
  assert.deepEqual(cards, [3], 'A new playback shows its opening title once');
  console.log('PASS: title once per playback, all six title offsets, invalid offsets, synchronized video/audio, next scene and fresh playback');
})().catch(e => { media.forEach(m => m.pause()); console.error(e); process.exitCode = 1; });
