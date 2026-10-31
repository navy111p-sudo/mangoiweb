const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const cover = { hidden: true, replaceChildren() {}, appendChild() {}, setAttribute() {} };
const listeners = {}, callbacks = new Map(); let id = 0;
const video = { parentNode: { querySelector: () => cover }, currentTime: 0, readyState: 4,
  addEventListener(n, fn) { (listeners[n] ||= new Set()).add(fn); },
  removeEventListener(n, fn) { listeners[n].delete(fn); },
  requestVideoFrameCallback(fn) { callbacks.set(++id, fn); return id; },
  cancelVideoFrameCallback(id) { callbacks.delete(id); },
};
const context = { WeakMap, document: { createElement: () => ({}) } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../cloudflare-deploy/public/js/ai-dubbing-intro.js'), 'utf8'), context);
function emit(n) { for (const fn of listeners[n] || []) fn(); }
function frame(t) { const queued = [...callbacks.values()]; callbacks.clear(); for (const fn of queued) fn(0, { mediaTime: t }); }
const prepare = context.MangoiDubIntro.prepare;
prepare(video, { playbackStartSec: 2, poster: '/scene.jpg' });
assert.equal(cover.hidden, false);
emit('loadeddata');
frame(0); assert.equal(cover.hidden, false, 'Ignored seek must not expose title');
frame(1.99); assert.equal(cover.hidden, false, 'Last embedded-title frame stays covered');
frame(2); assert.equal(cover.hidden, true, 'Actual decoded content frame uncovers video');
video.currentTime = 0; emit('seeking'); assert.equal(cover.hidden, false);
prepare(video, { playbackStartSec: 2 }); assert.equal(cover.hidden, false);
assert.equal(callbacks.size, 0, 'Previous scene callback cancelled');
emit('loadeddata'); frame(2.1); assert.equal(cover.hidden, true);
prepare(video, {}); assert.equal(cover.hidden, true, 'Other films stay uncovered');
assert.equal(listeners.loadeddata.size, 1, 'Scene changes do not accumulate listeners');
console.log('PASS: ignored seeks, decoded frame boundary, backward seek, scene cleanup, ordinary films');
