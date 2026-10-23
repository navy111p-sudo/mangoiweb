// Regression: non-seekable streams must not rewind the held speaker to a title.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../cloudflare-deploy/public/js/ai-dubbing.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('  function canSeekMedia('), source.indexOf('  function playSynced('));
class Media {
  constructor(seekable = true) {
    this.seekable = { length: seekable ? 1 : 0, start: () => 0, end: () => 61 };
    this.time = 10.3; this.readyState = 4; this.events = new Map(); this.seeks = [];
  }
  get currentTime() { return this.time; }
  set currentTime(t) { this.seeks.push(t); this.seeking = true; this.target = t; }
  addEventListener(k, f) { this.events.set(k, f); }
  removeEventListener(k, f) { if (this.events.get(k) === f) this.events.delete(k); }
  decode(time = this.target) { this.time = time; this.seeking = false; this.events.get('seeked')?.(); }
}
const ctx = { setTimeout, clearTimeout, Promise, Error, Math };
vm.createContext(ctx); vm.runInContext(helper, ctx);
const run = () => ({ wakers: [] });
{
  const v = new Media(false), a = new Media(), r = run();
  assert.equal(await ctx.positionSyncedMedia(v, [{ el: a }], 13.68, r), false);
  assert.deepEqual(v.seeks, []); assert.deepEqual(a.seeks, []);
  assert.equal(v.currentTime, 10.3, 'non-seekable video retains the speaker frame');
}
{
  const v = new Media(), a = new Media(false);
  assert.equal(await ctx.positionSyncedMedia(v, [{ el: a }], 13.68, run()), false);
  assert.deepEqual(v.seeks, [], 'an unseekable voice keeps the entire group on the original clock');
}
{
  const v = new Media(), a = new Media(), r = run(); let done = false;
  const moving = ctx.positionSyncedMedia(v, [{ el: a }], 13.68, r).then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false);
  v.decode(); await Promise.resolve(); assert.equal(done, false, 'wait for voice and video');
  a.decode(); await moving; assert.equal(done, true); assert.equal(r.wakers.length, 0);
  assert.equal(v.events.size, 0); assert.equal(a.events.size, 0);
}
{
  const v = new Media(), r = run();
  const moving = ctx.positionSyncedMedia(v, [], 13.68, r);
  const failed = assert.rejects(moving, /did not reach/);
  v.decode(0); await failed;
  assert.equal(r.wakers.length, 0, 'a seek silently returning to the title must fail');
}
{
  const v = new Media(), r = run();
  const moving = ctx.positionSyncedMedia(v, [], 13.68, r);
  r.wakers.slice().forEach(wake => wake()); await moving;
  assert.equal(v.events.size, 0); assert.equal(r.wakers.length, 0);
}
// Run the actual hold/resume closure, including asynchronous student completion.
const hold = source.slice(source.indexOf('        function holdPractice('), source.indexOf('        function closeCap('));
async function holdTest(code = hold) {
  const v = new Media(false), a = new Media(false), r = { ...run(), aborted: false };
  v.pause = a.pause = () => {}; v.play = a.play = () => Promise.resolve();
  const line = { start: 10.24, end: 13.68 }, samples = [];
  const c = { ...ctx, v, run: r, tracks: [{ el: a }], items: [{ line, performer: { idx: 0 } }],
    practiceBusy: false, caps: {}, limit: 61, ended: false, shown: -2,
    showLine() { samples.push(v.currentTime); }, setTurn() {}, studentName: () => 'student', charName: () => 'Luna',
    sndDuck() {}, DUCK_STUDENT: 1, setButtons() {}, startCapture: () => ({}),
    waitForPracticeDone: () => Promise.resolve(), closeCap: () => Promise.resolve(),
    clearLine() {}, C: { clockFollower: () => ({}) }, finish() {}, console,
  };
  vm.createContext(c); vm.runInContext(helper + code, c); c.holdPractice(0);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(v.seeks, [], 'holding must not rewind the video');
  assert.deepEqual(a.seeks, [], 'holding must not rewind the voice');
  assert.equal(samples[0], 10.3); assert.equal(c.practiceBusy, false);
  assert.equal(c.shown, 0, 'completed student caption is not repeated while the slot plays out');
}
await holdTest();
await assert.rejects(holdTest(hold.replace('v.pause();', 'v.pause(); v.currentTime = line.start;')), /must not rewind/, 'old rewind mutation must fail');
console.log('PASS: held frame, seekability across tracks, decoded seek barrier, wrong-frame rejection, cancellation, natural resume; old rewind mutation detected');
