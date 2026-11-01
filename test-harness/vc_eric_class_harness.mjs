// Execute shipping functions: file isolation/return, stale loads, RAF concurrency, book restore.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = n => readFileSync(new URL('../cloudflare-deploy/public/js/' + n, import.meta.url), 'utf8');
const main = read('idx-main.js');
const section = (a, b) => main.slice(main.indexOf(a), main.indexOf(b, main.indexOf(a)));
let rendered = 0;
const ctx = vm.createContext({ URL, Map, console, location: { origin: 'https://example.test' },
  document: { getElementById: () => null }, setTimeout() {},
  pdfBuildImageDoc: async url => ({ url }), pdfRender() { rendered++; } });
ctx.window = ctx;
vm.runInContext('let pdfDoc, pdfPageNum, pdfAnnotations = {}; const pdfAnnotationsByDoc = new Map(); let pdfLoadGeneration = 0;', ctx);
vm.runInContext(section('async function pdfLoad(url, kind)', '// fix (2026-06-01) — 현재 화면의 교재 파일 다운로드'), ctx);
await ctx.pdfLoad('/a.jpg', 'image');
vm.runInContext('pdfAnnotations[1] = [{tool:"text",text:"hello"}];', ctx);
await ctx.pdfLoad('/b.jpg', 'image');
assert.equal(vm.runInContext('Object.keys(pdfAnnotations).length', ctx), 0);
vm.runInContext('pdfAnnotations[1] = [{tool:"pen"}];', ctx);
await ctx.pdfLoad('https://example.test/a.jpg', 'image');
assert.equal(vm.runInContext('pdfAnnotations[1][0].text', ctx), 'hello');
vm.runInContext('delete pdfAnnotations[1];', ctx);
await ctx.pdfLoad('/b.jpg', 'image');
assert.equal(vm.runInContext('pdfAnnotations[1][0].tool', ctx), 'pen');
await ctx.pdfLoad('/a.jpg', 'image');
assert.equal(vm.runInContext('pdfAnnotations[1]', ctx), undefined);
let finish;
ctx.pdfBuildImageDoc = url => url === '/slow.jpg' ? new Promise(r => { finish = r; }) : Promise.resolve({ url });
const slow = ctx.pdfLoad('/slow.jpg', 'image');
await ctx.pdfLoad('/fast.jpg', 'image'); finish({ url: '/slow.jpg' }); await slow;
assert.equal(ctx._vcCurrentPdfUrl, '/fast.jpg');
assert.equal(vm.runInContext('pdfDoc.url', ctx), '/fast.jpg');
console.log('PASS annotation isolation, canonical URLs, clear/return and stale load');

const raf = [], bg = { isProcessing: true, frameTick: 2, _mobile: false,
  hiddenVideo: { readyState: 4, videoWidth: 640, videoHeight: 480 },
  segmenter: { send: () => new Promise(r => { finish = r; }) } };
const loop = vm.createContext({ vcBg: bg, requestAnimationFrame(fn) { raf.push(fn); return raf.length; }, console });
loop.window = loop;
vm.runInContext(section('async function vcBgRenderLoop()', '// --- 5-b)'), loop);
const pending = loop.vcBgRenderLoop();
assert.equal(raf.length, 1, 'schedule next display frame before awaiting inference');
assert.equal(bg.sending, true);
await raf.shift()();
assert.equal(raf.length, 1, 'pending inference keeps one display loop');
assert.equal(bg.frameCount, undefined);
finish(); await pending;
assert.equal(bg.frameCount, 1);
bg.isProcessing = false; await raf.shift()(); assert.equal(raf.length, 0);
console.log('PASS background pending inference, no overlapping sends, stop');

const elements = new Map();
function element() { return { style: {}, options: [], listeners: {}, setAttribute() {}, getAttribute() { return 'Books'; },
  replaceChildren() { this.options = []; }, appendChild(e) { this.options.push(e); elements.set(e.id, e); },
  addEventListener(n, fn) { this.listeners[n] = fn; } }; }
const toolbar = element(); elements.set('pdf-page-info', { parentElement: toolbar });
const calls = [];
const history = vm.createContext({ URL, Map, location: { origin: 'https://example.test' },
  document: { getElementById: id => elements.get(id), createElement: element },
  miIsEn: () => true, vcCanControlTextbook: () => true,
  pdfGoToPage(p) { vm.runInContext('pdfPageNum = ' + p, history); }, _pdfBroadcastPage() {},
  async selectFromTextbookLibrary(id, url) { calls.push(url); history._vcCurrentPdfUrl = url; vm.runInContext('pdfPageNum = 1', history); },
  vcShareTextbook() {} });
history.window = history; vm.runInContext('let pdfPageNum = 1;', history);
vm.runInContext(read('idx-vc-book-history.js'), history);
const seqA = [{ id: 'a', url: '/a.pdf' }], seqB = [{ id: 'b', url: '/b.jpg' }];
history._libSequence = seqA; history._libSeqIdx = 0;
await history.selectFromTextbookLibrary('a', '/a.pdf', 'pdf', '[Alpha] lesson');
vm.runInContext('pdfPageNum = 7', history);
history._libSequence = seqB;
await history.selectFromTextbookLibrary('b', '/b.jpg', 'image', '[Beta] lesson');
const select = elements.get('vc-book-history');
assert.equal(select.options.length, 2); assert.equal(select.hidden, false);
select.value = 'Alpha'; await select.listeners.change();
assert.equal(calls.at(-1), '/a.pdf'); assert.equal(history._libSequence, seqA);
assert.equal(vm.runInContext('pdfPageNum', history), 7);
history.vcCanControlTextbook = () => false; select.value = 'Beta'; await select.listeners.change();
assert.equal(calls.at(-1), '/a.pdf'); assert.equal(select.hidden, true);
console.log('PASS previous book, sequence, PDF page restore and student permission');
