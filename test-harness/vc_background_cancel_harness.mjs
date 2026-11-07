// Exercise the whole shipping setter, not only its steady-state RAF loop.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const main = readFileSync(process.env.BG_MAIN_SOURCE || new URL('../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const start = main.indexOf('window.vcSetBackground = async function(mode)');
const end = main.indexOf('// 🥭 Phase 41', start);
assert(start >= 0 && end > start);
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture(stage, fail = false) {
  let finish, total = 0, inflight = 0, max = 0;
  const gate = name => name === stage ? new Promise((resolve, reject) => { finish = () => fail ? reject(new Error('fixture failure')) : resolve(); }) : Promise.resolve();
  const raw = { kind: 'video', id: 'raw' }, processed = { kind: 'video', id: 'processed' };
  const local = { getVideoTracks: () => [raw], getAudioTracks: () => [] };
  const video = { style: {}, srcObject: local, setAttribute() {}, play: async () => {} };
  const status = { textContent: '' }, box = { style: {} }, swaps = [], timers = [];
  const ctx = vm.createContext({
    console: { warn() {} }, vcLocalStream: local,
    document: { querySelectorAll: () => [], getElementById: id => ({ 'vc-local-video': video, 'vc-local-box': box, 'vc-bg-status': status })[id] },
    vcBg: { mode: 'off', isProcessing: false, hiddenVideo: {}, canvas: { captureStream: () => ({ getVideoTracks: () => [processed] }) },
      segmenter: { async send() { total++; inflight++; max = Math.max(max, inflight); try { await gate('send'); } finally { inflight--; } } } },
    VC_BG_IMAGES: Object.fromEntries(['galaxy', 'beach', 'jungle', 'desert', 'underwater', 'fireplace'].map(x => [x, '/' + x])),
    vcIsMobileDevice: () => false, vcLoadMediaPipe: () => gate('load'), vcInitBgEngine: () => gate('init'),
    vcEnsureHiddenVideo: () => gate('video'), vcLoadBgImage: () => gate('image'),
    vcSmartFitVideo() {}, vcInstallSmartFit() {}, vcBgCaptureFps: () => 20,
    vcBgRenderLoop() { ctx.vcBg.rafId = 1; }, cancelAnimationFrame() {}, setTimeout(fn) { timers.push(fn); },
    vcSwapVideoTrack: track => swaps.push(track.id),
  });
  ctx.window = ctx;
  const helper = main.indexOf('async function vcBgSendFrame(image)');
  if (helper >= 0) vm.runInContext(main.slice(helper, main.indexOf('// --- 5-b)', helper)), ctx);
  vm.runInContext(main.slice(start, end), ctx);
  return { ctx, status, video, local, swaps, timers, finish: () => finish(), metrics: () => ({ total, max }) };
}
let passed = 0;
for (const mode of ['galaxy', 'beach', 'jungle', 'desert', 'underwater', 'fireplace'])
  for (const stage of ['load', 'init', 'video', 'image', 'send']) for (const fail of [false, true]) {
    const f = fixture(stage, fail), pending = f.ctx.vcSetBackground(mode);
    await drain(); await f.ctx.vcSetBackground('off');
    const offStatus = f.status.textContent;
    f.finish(); await pending;
    assert.equal(f.ctx.vcBg.mode, 'off');
    assert.equal(f.ctx.vcBg.isProcessing, false, `${mode}/${stage}: OFF stays off after deferred work`);
    assert.equal(f.video.srcObject, f.local, 'raw preview survives stale completion');
    assert.deepEqual(f.swaps, ['raw'], 'stale background never replaces the sender');
    assert.equal(f.status.textContent, offStatus, 'stale success/failure cannot overwrite OFF status');
    passed++;
  }
// A second ON during the first inference must share its send mutex.
{
  const f = fixture('send'), old = f.ctx.vcSetBackground('galaxy');
  await drain();
  const newer = f.ctx.vcSetBackground('beach'); await drain();
  assert.equal(f.metrics().total, 1, 'initial inferences must not overlap');
  f.finish(); await Promise.all([old, newer]);
  assert.equal(f.metrics().max, 1);
  assert.equal(f.ctx.vcBg.mode, 'beach');
  passed++;
}
{
  const f = fixture('none');
  await f.ctx.vcSetBackground('galaxy');
  await f.ctx.vcSetBackground('off');
  await f.ctx.vcSetBackground('galaxy');
  const status = f.status.textContent;
  f.timers[0]();
  assert.equal(f.ctx.vcBg.isProcessing, true, 'old same-mode timeout cannot stop the new session');
  assert.equal(f.status.textContent, status);
  passed++;
}
{
  const f = fixture('none');
  f.local.getVideoTracks = () => [];
  f.ctx.vcBg.isProcessing = true; f.ctx.vcBg.rafId = 12;
  await f.ctx.vcSetBackground('off');
  assert.equal(f.ctx.vcBg.isProcessing, false, 'OFF cleans up even after camera removal');
  assert.equal(f.ctx.vcBg.rafId, null);
  passed++;
}
console.log(`PASS ${passed} background cancellation/concurrency scenarios`);
