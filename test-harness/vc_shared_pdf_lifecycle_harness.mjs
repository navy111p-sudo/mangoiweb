// Shipping pdfLoad + shared receive/retry + sequence fallback. No production requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const main = readFileSync(process.env.REMOTE_MAIN_SOURCE || new URL('../cloudflare-deploy/public/js/idx-main.js', import.meta.url), 'utf8');
const cut = (a, b) => { const start = main.indexOf(a), end = main.indexOf(b, start); assert(start >= 0 && end > start); return main.slice(start, end); };
const drain = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function fixture() {
  const jobs = [], shares = [], toasts = [];
  const load = (url, kind) => new Promise((resolve, reject) => jobs.push({ url, kind, resolve: () => resolve({ url }), reject: () => reject(new Error('fixture load failure')) }));
  const ctx = vm.createContext({ URL, Map, location: { origin: 'https://fixture.test' },
    console: { warn() {} }, document: { getElementById: () => null }, setTimeout() {}, pdfRender() {},
    pdfBuildImageDoc: url => load(url, 'image'), ensurePdfJs: async () => {},
    pdfjsLib: { GlobalWorkerOptions: { workerSrc: 'fixture' }, getDocument: ({ url }) => ({ promise: load(url, 'pdf') }) },
    vcCanControlTextbook: () => true, vcTextbookDenied() {}, vcSwitchTab() {},
    vcShareTextbook: (...args) => shares.push(args), _pdfToast: message => toasts.push(message), showToast: message => toasts.push(message),
  });
  ctx.window = ctx;
  vm.runInContext('let pdfDoc, pdfPageNum=1, pdfCurrentId, pdfAnnotations={}; const pdfAnnotationsByDoc=new Map(); let pdfLoadGeneration=0, vcRoomId="one";', ctx);
  vm.runInContext(cut('async function pdfLoad(url, kind)', '// fix (2026-06-01) — 현재 화면의 교재 파일 다운로드'), ctx);
  vm.runInContext(cut('window.vcApplySharedPdf = function(', 'window.vcStartPdfPoll = function('), ctx);
  vm.runInContext(cut('function _pdfGoSeqFile(f)', 'let _pdfBcTimer'), ctx);
  return { ctx, jobs, shares, toasts, page: () => vm.runInContext('pdfPageNum', ctx),
    job(url, kind) { const found = jobs.filter(job => job.url.endsWith(url) && job.kind === kind).at(-1); assert(found, `${kind} ${url} job exists`); return found; } };
}
let passed = 0; const failures = [];
async function check(name, action) { try { await action(); passed++; } catch (error) { failures.push({ name, message: error.message }); } }
for (const kind of ['image', 'pdf']) for (const oldFirst of [false, true]) for (const page of [1, 2, 5, 17, 30])
  await check(`receive/${kind}/${oldFirst}/${page}`, async () => {
    const f = fixture(); f.ctx.vcApplySharedPdf('/old', kind, 99, 'old'); f.ctx.vcApplySharedPdf('/new', kind, page, 'new'); await drain();
    if (oldFirst) { f.job('/old', kind).resolve(); await drain(); }
    f.job('/new', kind).resolve(); await drain();
    if (!oldFirst) { f.job('/old', kind).resolve(); await drain(); }
    assert.equal(f.page(), page); assert.equal(f.ctx._vcShownPdfUrl, 'https://fixture.test/new');
    assert.equal(f.ctx._vcCurrentPdfUrl, f.ctx._vcShownPdfUrl);
  });
await check('late old error cannot launch a retry after a new document', async () => {
  const f = fixture(); f.ctx.vcApplySharedPdf('/old', 'image', 2); f.ctx.vcApplySharedPdf('/new', 'image', 30);
  f.job('/new', 'image').resolve(); await drain(); f.job('/old', 'image').reject(); await drain();
  assert.equal(f.jobs.length, 2); assert.equal(f.page(), 30);
});
for (const fail of [false, true]) for (const oldFirst of [false, true])
  await check(`alternate retry/${fail}/${oldFirst}`, async () => {
    const f = fixture(); f.ctx.vcApplySharedPdf('/old', 'image', 2); f.job('/old', 'image').reject(); await drain();
    const retry = f.job('/old', 'pdf'); f.ctx.vcApplySharedPdf('/new', 'image', 30);
    if (oldFirst) { fail ? retry.reject() : retry.resolve(); await drain(); }
    f.job('/new', 'image').resolve(); await drain();
    if (!oldFirst) { fail ? retry.reject() : retry.resolve(); await drain(); }
    assert.equal(f.page(), 30); assert.equal(f.ctx._vcShownPdfKey, 'https://fixture.test/new|30');
    assert.equal(f.ctx._vcShownPdfUrl, 'https://fixture.test/new');
  });
for (const fail of [false, true]) await check(`room change/${fail}`, async () => {
  const f = fixture(); f.ctx.vcApplySharedPdf('/old', 'image', 2); vm.runInContext('vcRoomId="two"', f.ctx);
  fail ? f.job('/old', 'image').reject() : f.job('/old', 'image').resolve(); await drain();
  assert.equal(f.jobs.length, 1); assert.equal(f.page(), 1); assert.equal(f.ctx._vcShownPdfUrl, undefined);
});
await check('local selection cancels old shared-format retry', async () => {
  const f = fixture(); f.ctx.vcApplySharedPdf('/old', 'image', 2); const current = f.ctx.pdfLoad('/local', 'image');
  f.job('/local', 'image').resolve(); await current; f.job('/old', 'image').reject(); await drain();
  assert.equal(f.jobs.length, 2); assert.equal(f.ctx._vcCurrentPdfUrl, '/local');
});
await check('same URL with a newer page', async () => {
  const f = fixture(); f.ctx.vcApplySharedPdf('/same', 'image', 2); const first = f.jobs[0]; f.ctx.vcApplySharedPdf('/same', 'image', 30);
  f.jobs[1].resolve(); await drain(); first.resolve(); await drain(); assert.equal(f.page(), 30);
});
await check('cancelled sequence load must not broadcast the stale file', async () => {
  const f = fixture(); f.ctx._pdfGoSeqFile({ id: 'old', url: '/old', kind: 'image' });
  const current = f.ctx.pdfLoad('/new', 'image'); f.job('/new', 'image').resolve(); await current;
  f.job('/old', 'image').resolve(); await drain(); assert.equal(f.shares.length, 0);
});
console.log(JSON.stringify({ passed, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
