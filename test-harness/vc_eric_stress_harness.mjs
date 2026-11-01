// Local, deterministic stress tests of shipping code. No production endpoints or DB.
// STRESS_CASES=300 STRESS_REPORT=/absolute/result.json node test-harness/vc_eric_stress_harness.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const overrides = { 'idx-vc-book-history.js': process.env.STRESS_BOOK_SOURCE,
  'idx-main.js': process.env.STRESS_MAIN_SOURCE, 'idx-vc-officemode.js': process.env.STRESS_OFFICE_SOURCE };
const source = name => readFileSync(overrides[name] || new URL('../cloudflare-deploy/public/js/' + name, import.meta.url), 'utf8');
const main = source('idx-main.js');
const cut = (start, end) => {
  const a = main.indexOf(start), b = main.indexOf(end, a);
  assert(a >= 0 && b > a, 'shipping function boundaries exist');
  return main.slice(a, b);
};
const count = Number(process.env.STRESS_CASES || 300);
assert(Number.isInteger(count) && count >= 1 && count <= 10000, 'STRESS_CASES must be 1..10000');
const quiet = { log() {}, warn() {}, error() {} };
const failures = [], groups = {};
let assertions = 0;
const equal = (a, b, reason) => { assertions++; assert.deepEqual(a, b, reason); };
async function scenario(group, seed, fn) {
  const g = groups[group] ||= { cases: 0, pass: 0, fail: 0 };
  g.cases++;
  try { await fn(); g.pass++; }
  catch (e) { g.fail++; failures.push({ group, seed, message: e.message, stack: e.stack }); }
}
const drain = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function rng(seed) { let n = seed + 12345; return limit => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return (n >>> 0) % limit; }; }

for (let seed = 0; seed < count; seed++) await scenario('annotation-files-and-load-order', seed, async () => {
  const random = rng(seed), expected = new Map();
  const ctx = vm.createContext({ URL, Map, console: quiet, location: { origin: 'https://fixture.test' },
    document: { getElementById: () => null }, setTimeout() {}, pdfRender() {},
    pdfBuildImageDoc: async url => ({ url }), ensurePdfJs: async () => {},
    pdfjsLib: { GlobalWorkerOptions: {}, getDocument: ({ url }) => ({ promise: Promise.resolve({ url }) }) } });
  ctx.window = ctx;
  vm.runInContext('let pdfDoc, pdfPageNum, pdfAnnotations = {}; const pdfAnnotationsByDoc = new Map(); let pdfLoadGeneration = 0; let vcRoomId = "r0";', ctx);
  vm.runInContext(cut('async function pdfLoad(url, kind)', '// fix (2026-06-01) — 현재 화면의 교재 파일 다운로드'), ctx);
  for (let step = 0; step < 25; step++) {
    const room = 'r' + random(3), file = random(8), ext = file % 2 ? 'pdf' : 'jpg';
    const path = '/page-' + file + '.' + ext, key = room + '|' + path;
    ctx.room = room; vm.runInContext('vcRoomId = room', ctx);
    await ctx.pdfLoad(random(2) ? path : 'https://fixture.test' + path, ext === 'pdf' ? 'pdf' : 'image');
    const notes = JSON.parse(vm.runInContext('JSON.stringify(pdfAnnotations)', ctx));
    equal(notes, expected.get(key) || {}, 'notes isolated by room and canonical file URL');
    const page = 1 + random(4);
    if (random(4) === 0) {
      vm.runInContext('delete pdfAnnotations[' + page + ']', ctx);
      const old = expected.get(key) || {}; delete old[page]; expected.set(key, old);
    } else {
      ctx.note = { tool: 'text', text: `${seed}:${step}` };
      vm.runInContext('pdfAnnotations[' + page + '] = [note]', ctx);
      const old = expected.get(key) || {}; old[page] = [structuredClone(ctx.note)]; expected.set(key, old);
    }
  }
  const waiting = new Map();
  ctx.pdfBuildImageDoc = url => new Promise(resolve => waiting.set(url, resolve));
  const first = ctx.pdfLoad('/slow.jpg', 'image'), second = ctx.pdfLoad('/fast.jpg', 'image');
  if (seed % 2) { waiting.get('/slow.jpg')({ url: '/slow.jpg' }); await first; waiting.get('/fast.jpg')({ url: '/fast.jpg' }); }
  else { waiting.get('/fast.jpg')({ url: '/fast.jpg' }); await second; waiting.get('/slow.jpg')({ url: '/slow.jpg' }); }
  await Promise.all([first, second]);
  equal(ctx._vcCurrentPdfUrl, '/fast.jpg', 'last selection wins either completion order');
  equal(vm.runInContext('pdfDoc.url', ctx), '/fast.jpg', 'document and URL remain consistent');
});

function historyFixture() {
  const elements = new Map(), calls = [];
  function element() { return { style: {}, options: [], listeners: {}, attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
    replaceChildren() { this.options = []; },
    appendChild(e) { this.options.push(e); elements.set(e.id, e); },
    addEventListener(k, fn) { this.listeners[k] = fn; } }; }
  elements.set('pdf-page-info', { parentElement: element() });
  const ctx = vm.createContext({ URL, Map, location: { origin: 'https://fixture.test' },
    document: { getElementById: id => elements.get(id), createElement: element },
    miIsEn: () => false, vcCanControlTextbook: () => true,
    pdfGoToPage(n) { ctx.page = n; vm.runInContext('pdfPageNum = page', ctx); }, _pdfBroadcastPage() {},
    async selectFromTextbookLibrary(id, url) { calls.push(url); if (ctx.pendingSelect) await ctx.pendingSelect(); ctx._vcCurrentPdfUrl = url; vm.runInContext('pdfPageNum = 1', ctx); },
    vcShareTextbook() {} });
  ctx.window = ctx;
  vm.runInContext('let pdfPageNum = 1, vcRoomId = "r0";', ctx);
  vm.runInContext(source('idx-vc-book-history.js'), ctx);
  return { ctx, elements, calls };
}
for (let seed = 0; seed < count; seed++) await scenario('book-history-and-room-boundaries', seed, async () => {
  const { ctx, elements, calls } = historyFixture(), random = rng(seed), saved = new Map();
  let active;
  for (let step = 0; step < 15; step++) {
    if (active) saved.get(active).page = vm.runInContext('pdfPageNum', ctx);
    const key = 'Book' + random(5), index = random(5), url = '/' + key + '-' + index + '.pdf';
    const sequence = Array.from({ length: 5 }, (_, n) => ({ id: key + n, url: '/' + key + '-' + n + '.pdf', kind: 'pdf' }));
    ctx._libSequence = sequence; ctx._libSeqIdx = index;
    await ctx.selectFromTextbookLibrary(key + index, url, 'pdf', '[' + key + '] lesson');
    const page = random(20) + 1;
    ctx.page = page; vm.runInContext('pdfPageNum = page', ctx);
    saved.set(key, { url, index, sequence, page }); active = key;
  }
  saved.get(active).page = vm.runInContext('pdfPageNum', ctx);
  const select = elements.get('vc-book-history');
  equal(select.options.length, saved.size, 'one entry per book');
  for (const [key, expected] of saved) {
    select.value = key; await select.listeners.change();
    equal(ctx._vcCurrentPdfUrl, expected.url, 'restore last file');
    equal(ctx._libSeqIdx, expected.index, 'restore sequence index');
    equal(ctx._libSequence, expected.sequence, 'restore complete sequence');
    equal(vm.runInContext('pdfPageNum', ctx), expected.page, 'restore actual PDF page');
  }
  const before = calls.length;
  if (seed % 2) {
    ctx.vcCanControlTextbook = () => false;
    select.value = saved.keys().next().value; await select.listeners.change();
    equal(calls.length, before, 'students cannot switch shared books');
  } else {
    vm.runInContext('vcRoomId = "new-room"', ctx);
    select.value = saved.keys().next().value; await select.listeners.change();
    equal(calls.length, before, 'new room must not reopen the previous room book from a stale selector');
  }
});

for (let seed = 0; seed < count; seed++) await scenario('pending-selection-room-change', seed, async () => {
  if (seed % 2) {
    const { ctx, elements } = historyFixture();
    let finish;
    ctx.pendingSelect = () => new Promise(resolve => { finish = resolve; });
    const load = ctx.selectFromTextbookLibrary('a', '/a.pdf', 'pdf', '[Previous room] book');
    vm.runInContext('vcRoomId = "new-room"', ctx);
    finish(); await load;
    equal(elements.get('vc-book-history')?.options.length || 0, 0, 'late book selection must not repopulate the new room history');
  } else {
    let finish;
    const ctx = vm.createContext({ URL, Map, console: quiet, location: { origin: 'https://fixture.test' },
      document: { getElementById: () => null }, setTimeout() {}, pdfRender() {},
      pdfBuildImageDoc: url => new Promise(resolve => { finish = () => resolve({ url }); }) });
    ctx.window = ctx;
    vm.runInContext('let pdfDoc = null, pdfPageNum, pdfAnnotations = {}; const pdfAnnotationsByDoc = new Map(); let pdfLoadGeneration = 0; let vcRoomId = "old-room";', ctx);
    vm.runInContext(cut('async function pdfLoad(url, kind)', '// fix (2026-06-01) — 현재 화면의 교재 파일 다운로드'), ctx);
    const load = ctx.pdfLoad('/old-room.jpg', 'image');
    vm.runInContext('vcRoomId = "new-room"', ctx);
    finish(); const result = await load;
    equal(result, false, 'a pending old-room file must be cancelled when the room changes');
    equal(vm.runInContext('pdfDoc', ctx), null, 'old-room document must not become the new-room document');
  }
});

for (let seed = 0; seed < count; seed++) await scenario('background-frame-scheduling', seed, async () => {
  const random = rng(seed), raf = [], pending = [];
  let inflight = 0, total = 0, max = 0;
  const bg = { isProcessing: true, frameTick: 0, _mobile: !!(seed % 2),
    hiddenVideo: { readyState: 4, videoWidth: 640, videoHeight: 480, currentTime: 0 },
    segmenter: { send() { inflight++; total++; max = Math.max(max, inflight); return new Promise((resolve, reject) => pending.push({ resolve: () => { inflight--; resolve(); }, reject: () => { inflight--; reject(new Error('inference failure')); } })); } } };
  const ctx = vm.createContext({ console: quiet, vcBg: bg,
    requestAnimationFrame(fn) { raf.push(fn); return raf.length; },
    vcPerf: { tick() {}, get: () => ({ segEvery: 3 + seed % 6 }), begin: () => 1, end() {} } });
  ctx.window = ctx;
  vm.runInContext(cut('async function vcBgRenderLoop()', '// --- 5-b)'), ctx);
  let running = ctx.vcBgRenderLoop();
  const jobs = [running];
  for (let frame = 0; frame < 100; frame++) {
    equal(raf.length, 1, 'exactly one scheduled display callback');
    if (frame % (2 + seed % 4) === 0) bg.hiddenVideo.currentTime += 1 / 30;
    if (pending.length && random(3) === 0) {
      const job = pending.shift(); if (seed % 5 === 0) job.reject(); else job.resolve();
      await drain();
    }
    jobs.push(raf.shift()()); await drain();
  }
  bg.isProcessing = false;
  await raf.shift()();
  while (pending.length) pending.shift().resolve();
  await Promise.all(jobs);
  equal(raf.length, 0, 'stop does not restart after pending inference');
  equal(max, 1, 'never overlaps model sends');
  equal(total > 0, true, 'model was exercised');
});

// Reuse the existing test fixture, while executing the complete shipping office IIFE.
const office = source('idx-vc-officemode.js');
const recovery = readFileSync(new URL('./vc_office_recovery_harness.mjs', import.meta.url), 'utf8');
let fixtureCode = recovery.slice(recovery.indexOf('function fixture('), recovery.indexOf('async function check('));
fixtureCode = fixtureCode.replace(/const main = readFileSync\(new URL\([^\n]+\);/, 'const main = mainSource;');
assert(!fixtureCode.includes('import.meta'), 'fixture can be loaded without module globals');
const fixture = new Function('vm', 'assert', 'source', 'mainSource', 'drain', fixtureCode + '\nreturn fixture;')(vm, assert, office, main, drain);
const mic = cut('async function vcSwitchMic(deviceId)', 'window.vcPopulateMicSelect = vcPopulateMicSelect;')
  + cut('window.vcSetMicDevice = function(deviceId)', '/** 📷');
const micFixtureCode = fixtureCode.replace('vm.runInNewContext(source, world,', `
  world.vcMicOn = !muted; world.VC_MIC_PREF_KEY = 'mangoi_vc_mic_id';
  world.vcPopulateMicSelect = async function () {}; world.alert = function (message) { throw new Error(message); };
  vm.runInNewContext(micSource, world);
  vm.runInNewContext(source, world,`);
const micFixture = new Function('vm', 'assert', 'source', 'mainSource', 'drain', 'micSource', micFixtureCode + '\nreturn fixture;')(vm, assert, office, main, drain, mic);
for (let seed = 0; seed < count; seed++) await scenario('office-audio-state-and-preferences', seed, async () => {
  const muted = !!(seed % 2), borrowed = !!(seed % 3), pref = [null, '0', '1'][seed % 3];
  const f = fixture({ muted, borrowed, pref });
  await f.enable();
  for (let n = 0; n < 1 + seed % 4; n++) {
    const noise = !!((seed + n) % 2);
    await f.world.vcSetNoiseSuppression(noise); await drain();
    equal(f.world.vcOfficeModeOn(), true, 'office chain returns after noise toggle');
    equal(f.storage.get('mangoi_vc_noise'), noise ? '1' : '0', 'noise preference honored');
    equal(f.local.getAudioTracks()[0].enabled, !muted, 'mute preserved across noise changes');
    equal(f.senders.every(s => s.track.readyState === 'live'), true, 'all senders carry live tracks');
  }
  const state = ['suspended', 'interrupted', 'closed'][seed % 3];
  if (seed % 7 === 0) f.setFailExact();
  f.context().change(state); await f.advance(1000); await f.advance(1000);
  equal(f.world.vcOfficeModeOn(), false, 'stalled audio chain falls back');
  const track = f.local.getAudioTracks()[0];
  equal(track.readyState, 'live', 'fallback microphone is live');
  equal(track.enabled, !muted, 'fallback preserves mute');
  equal(f.senders.every(s => s.track === track), true, 'all peers use fallback microphone');
  equal(f.storage.get('mangoi_vc_office'), '1', 'automatic failure is not a user off preference');
  equal(f.timers.size, 0, 'no abandoned office timers');
});

for (let seed = 0; seed < count; seed++) await scenario('rapid-noise-toggle-order', seed, async () => {
  const f = fixture({ muted: !!(seed % 2), borrowed: true }); await f.enable();
  const last = !!(seed % 3);
  await Promise.all([f.world.vcSetNoiseSuppression(!last), f.world.vcSetNoiseSuppression(last)]);
  await drain();
  equal(f.storage.get('mangoi_vc_noise'), last ? '1' : '0', 'rapid toggles must end at the last requested preference');
  equal(f.local.getAudioTracks()[0].enabled, !(seed % 2), 'rapid toggles preserve mute');
  equal(f.senders.every(s => s.track.readyState === 'live'), true, 'rapid toggles leave no dead senders');
});

for (let seed = 0; seed < count; seed++) await scenario('mixed-audio-controls-and-mic-alias', seed, async () => {
  const f = micFixture({ muted: !!(seed % 2), borrowed: true }); await f.enable();
  const last = !!(seed % 3), id = 'Krisp-virtual-input-' + seed;
  await f.world.vcSetNoiseSuppression(false);
  await f.world.vcSetMicDevice(id + '-initial');
  equal(f.requests.filter(r => r.audio?.deviceId?.exact === id + '-initial').at(-1)?.audio.noiseSuppression, false,
    'changing the microphone keeps the chosen noise preference');
  await Promise.all([
    f.world.vcSetNoiseSuppression(!last),
    f.world.vcSetMicDevice(id),
    f.world.vcSetOfficeMode(false),
    f.world.vcSetNoiseSuppression(last),
    f.world.vcSetOfficeMode(true)
  ]); await drain();
  equal(f.storage.get('mangoi_vc_noise'), last ? '1' : '0', 'last noise request wins with other controls');
  equal(f.world.vcOfficeModeOn(), true, 'last office request wins');
  equal(f.storage.get('mangoi_vc_mic_id'), id, 'settings alias reaches selected microphone');
  equal(f.local.getAudioTracks()[0].enabled, !(seed % 2), 'mixed controls preserve mute');
  equal(f.senders.every(s => s.track.readyState === 'live'), true, 'mixed controls keep senders live');
});

const report = { casesPerGroup: count, totalCases: Object.values(groups).reduce((n, g) => n + g.cases, 0),
  assertions, groups, failures };
if (process.env.STRESS_REPORT) writeFileSync(process.env.STRESS_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, failures: failures.slice(0, 8) }, null, 2));
process.exitCode = failures.length ? 1 : 0;
