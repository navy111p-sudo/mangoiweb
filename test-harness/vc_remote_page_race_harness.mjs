// Exercise the shipping remote-load wrapper, including work after pdfLoad resolves.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(process.env.REMOTE_MAIN_SOURCE || new URL('../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const start = source.indexOf('async function pdfLoadRemote(');
const end = source.indexOf('\n/*', start);
assert(start >= 0 && end > start);
const loadStart = source.indexOf('async function pdfLoad(url, kind)');
const loadEnd = source.indexOf('// fix (2026-06-01) — 현재 화면의 교재 파일 다운로드', loadStart);
assert(loadStart >= 0 && loadEnd > loadStart);
let passed = 0;
for (let seed = 0; seed < 300; seed++) {
  const pending = new Map();
  const build = url => new Promise(resolve => pending.set(url, () => resolve({ url })));
  const ctx = vm.createContext({
    URL, Map, location: { origin: 'https://fixture.test' },
    document: { getElementById: () => null }, setTimeout() {},
    pdfBuildImageDoc: build,
    async fetch() { return { headers: { get: () => seed % 2 ? 'image/jpeg' : 'application/pdf' } }; },
    async ensurePdfJs() {},
    pdfjsLib: { GlobalWorkerOptions: { workerSrc: 'fixture' }, getDocument: ({ url }) => ({ promise: build(url) }) },
    pdfRender() { ctx.renders++; }, renders: 0,
  });
  ctx.window = ctx;
  vm.runInContext('let pdfCurrentId = null, pdfPageNum = 1, pdfDoc, pdfAnnotations = {}, pdfLoadGeneration = 0, vcRoomId = "one"; const pdfAnnotationsByDoc = new Map();', ctx);
  vm.runInContext(source.slice(loadStart, loadEnd), ctx);
  vm.runInContext(source.slice(start, end), ctx);
  const kind = ['image', 'pdf', undefined][seed % 3];
  const old = ctx.pdfLoadRemote('old', 2 + seed % 15, kind);
  const current = ctx.pdfLoadRemote('current', 30 + seed % 15, kind);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  if (seed % 2) { pending.get('/api/video-call/pdf/old')(); await old; }
  pending.get('/api/video-call/pdf/current')(); await current;
  if (!(seed % 2)) { pending.get('/api/video-call/pdf/old')(); await old; }
  assert.equal(vm.runInContext('pdfPageNum', ctx), 30 + seed % 15, 'cancelled old load must not overwrite the current remote page');
  assert.equal(ctx.renders, 2, 'cancelled load must not render the new document again');
  const abandoned = ctx.pdfLoadRemote('previous-room', 99, 'image');
  vm.runInContext('vcRoomId = "two"', ctx);
  pending.get('/api/video-call/pdf/previous-room')(); await abandoned;
  assert.equal(vm.runInContext('pdfPageNum', ctx), 30 + seed % 15, 'room cancellation must not change the page');
  assert.equal(ctx.renders, 2);
  passed++;
}
console.log(`PASS ${passed} remote page race scenarios, ${passed * 4} assertions`);
