// Full shipping initializer + setter. Only the external model and media/DOM are fakes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const main = readFileSync(process.env.BG_MAIN_SOURCE || new URL('../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const cut = (a, b) => { const start = main.indexOf(a), end = main.indexOf(b, start); assert(start >= 0 && end > start); return main.slice(start, end); };
const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture(stage) {
  let models = 0, sends = 0, captures = 0;
  const pending = [];
  const gate = name => name === stage ? new Promise((resolve, reject) => { pending.push(fail => fail ? reject(new Error('fixture ' + name)) : resolve()); }) : Promise.resolve();
  const raw = { id: 'raw' }, local = { getVideoTracks: () => [raw], getAudioTracks: () => [] };
  const video = { style: {}, srcObject: local, setAttribute() {}, play: async () => {} };
  const status = { textContent: '' }, box = { style: {} }, swaps = [], timers = [];
  const ctx = vm.createContext({
    console: { warn() {} }, vcLocalStream: local, vcBg: { mode: 'off', segmenter: null, canvas: null, maskCanvas: null },
    document: { querySelectorAll: () => [], getElementById: id => ({ 'vc-local-video': video, 'vc-local-box': box, 'vc-bg-status': status })[id],
      createElement: () => ({ getContext: () => ({}), captureStream() { captures++; return { getVideoTracks: () => [{ id: 'processed' }] }; } }) },
    SelfieSegmentation: class { constructor() { models++; } setOptions() {} onResults() {} initialize() { return gate('init'); } send() { sends++; return gate('send'); } close() {} },
    vcOnSegResults() {}, VC_MP_LOCAL: '/',
    VC_BG_IMAGES: Object.fromEntries(['galaxy', 'beach', 'jungle', 'desert', 'underwater', 'fireplace'].map(mode => [mode, '/' + mode])),
    vcIsMobileDevice: () => false, vcLoadMediaPipe: async () => {}, vcEnsureHiddenVideo: async () => {}, vcLoadBgImage: async () => {},
    vcSmartFitVideo() {}, vcInstallSmartFit() {}, vcBgCaptureFps: () => 20,
    vcBgRenderLoop() { ctx.vcBg.rafId = 1; }, cancelAnimationFrame() {}, setTimeout(fn) { timers.push(fn); },
    vcSwapVideoTrack: track => swaps.push(track.id),
  });
  ctx.window = ctx;
  vm.runInContext(cut('async function vcInitBgEngine()', '// --- 4)'), ctx);
  const helper = main.indexOf('async function vcBgSendFrame(image)');
  if (helper >= 0) vm.runInContext(main.slice(helper, main.indexOf('// --- 5-b)', helper)), ctx);
  vm.runInContext(cut('window.vcSetBackground = async function(mode)', '// 🥭 Phase 41'), ctx);
  return { ctx, video, local, status, swaps, timers, finish: fail => pending.splice(0).forEach(resolve => resolve(fail)), metrics: () => ({ models, sends, captures }) };
}
let passed = 0;
const failures = [];
async function check(name, action) { try { await action(); passed++; } catch (error) { failures.push({ name, message: error.message }); } }
for (const mode of ['galaxy', 'beach', 'jungle', 'desert', 'underwater', 'fireplace'])
  for (const stage of ['init', 'send']) for (const action of ['change', 'off', 'direct-off'])
    await check(`${mode}/${stage}/${action}`, async () => {
      const f = fixture(stage), first = f.ctx.vcSetBackground(mode);
      await drain(); let second, finished = false, rejection;
      if (action === 'change') {
        second = f.ctx.vcSetBackground(mode === 'beach' ? 'galaxy' : 'beach').then(() => { finished = true; }, error => { rejection = error; finished = true; });
      } else if (action === 'off') await f.ctx.vcSetBackground('off');
      else { f.ctx.vcBg.mode = 'off'; f.ctx.vcBg.isProcessing = false; }
      await drain();
      const before = { finished, raw: f.video.srcObject === f.local, ...f.metrics() };
      f.finish(false); await Promise.all([first, second]);
      assert.equal(before.raw, true, 'keep raw preview until the first result');
      assert.equal(before.captures, 0, 'never capture an uninitialized/empty canvas');
      if (action === 'change') {
        assert.equal(before.finished, false, 'the latest request waits for shared initialization/inference');
        assert.equal(rejection, undefined);
        assert.equal(f.metrics().models, 1); assert.equal(f.metrics().sends, 1);
        assert.equal(!!f.ctx.vcBg.processedStream, true);
      } else {
        assert.equal(f.ctx.vcBg.isProcessing, false);
        assert.equal(f.video.srcObject, f.local);
        assert.equal(f.swaps.includes('processed'), false);
      }
    });
await check('initialize failure is retryable', async () => {
  const f = fixture('init'), first = f.ctx.vcSetBackground('galaxy'); await drain(); f.finish(true); await first;
  assert.equal(f.ctx.vcBg.segmenter, null); assert.equal(f.ctx.vcBg._engineInitPromise, null);
  const second = f.ctx.vcSetBackground('beach'); await drain(); f.finish(false); await second;
  assert.equal(f.metrics().models, 2); assert.equal(!!f.ctx.vcBg.processedStream, true);
});
await check('failed first inference restores raw sender and preview', async () => {
  const f = fixture('send'), pending = f.ctx.vcSetBackground('galaxy'); await drain(); f.finish(true); await pending;
  assert.equal(f.video.srcObject, f.local); assert.equal(f.ctx.vcBg.isProcessing, false);
  assert.equal(f.swaps.includes('processed'), false); assert.equal(f.swaps.at(-1), 'raw');
});
await check('two-second stalled-loop fallback restores raw sender', async () => {
  const f = fixture('none'); await f.ctx.vcSetBackground('galaxy');
  assert.equal(f.swaps.at(-1), 'processed'); f.timers[0]();
  assert.equal(f.video.srcObject, f.local); assert.equal(f.swaps.at(-1), 'raw');
});
await check('direct OFF invalidates old result timer', async () => {
  const f = fixture('none'); await f.ctx.vcSetBackground('galaxy');
  f.ctx.vcBg.mode = 'off'; f.ctx.vcBg.isProcessing = false; const status = f.status.textContent;
  f.timers[0](); assert.equal(f.status.textContent, status);
});
for (const pendingInit of [false, true]) await check(`performance rescue restores raw/${pendingInit}`, async () => {
  const f = fixture(pendingInit ? 'init' : 'none');
  f.ctx.api = { _toast() {} }; f.ctx.st = {}; f.ctx.TIERS = [{}]; f.ctx.save = () => {};
  vm.runInContext('window.rescue = ({' + cut('_rescue: function(){', '_toast: function(msg)') + '})._rescue;', f.ctx);
  const request = f.ctx.vcSetBackground('galaxy');
  if (pendingInit) await drain(); else await request;
  f.ctx.rescue();
  if (pendingInit) { f.finish(false); await request; }
  assert.equal(f.ctx.vcBg.mode, 'off'); assert.equal(f.ctx.vcBg.isProcessing, false);
  assert.equal(f.video.srcObject, f.local); assert.equal(f.swaps.at(-1), 'raw');
});
console.log(JSON.stringify({ passed, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
