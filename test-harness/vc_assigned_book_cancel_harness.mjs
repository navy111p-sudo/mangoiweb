import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(process.env.BOOK_SOURCE || new URL('../cloudflare-deploy/public/js/idx-vc-textbook.js', import.meta.url), 'utf8');
const start = source.indexOf('window._vcLoadTextbookByName = async function(book)'), end = source.indexOf('// 🎓 입장 시:', start);
assert(start >= 0 && end > start);
let passed = 0; const failures = [];
for (const kind of ['image', 'pdf']) for (const outcome of ['success', 'cancelled', 'rejected']) {
  const shares = [];
  const ctx = vm.createContext({ location: { origin: 'https://fixture.test' },
    document: { body: { classList: { contains: () => true } } }, setTimeout() {},
    fetch: async () => ({ json: async () => ({ items: [{ id: 'one', url: '/one', kind, name: '[Alpha] Lesson / 1' }] }) }),
    async pdfLoad() { if (outcome === 'rejected') throw new Error('fixture rejection'); return outcome === 'cancelled' ? false : undefined; },
    vcShareTextbook: (...args) => { shares.push(args); return true; },
  });
  ctx.window = ctx; vm.runInContext(source.slice(start, end), ctx);
  try {
    if (outcome === 'rejected') await assert.rejects(ctx._vcLoadTextbookByName('Alpha'), /fixture rejection/);
    else assert.equal(await ctx._vcLoadTextbookByName('Alpha'), outcome === 'success');
    assert.equal(shares.length, outcome === 'success' ? 1 : 0);
    if (outcome !== 'success') assert.equal(ctx._vcShownPdfName, undefined);
    passed++;
  } catch (error) { failures.push({ kind, outcome, message: error.message }); }
}
console.log(JSON.stringify({ passed, failed: failures.length, failures }, null, 2)); process.exitCode = failures.length ? 1 : 0;
