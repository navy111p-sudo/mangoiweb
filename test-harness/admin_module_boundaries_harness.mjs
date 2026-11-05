// Run shipped handlers with isolated D1/KV fixtures; never connect to live bindings.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { adminSrcUsing } from './_srcbundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.env.ADMIN_MODULE_SRC_DIR || join(root, 'cloudflare-deploy/src');
const { buildSync } = createRequire(import.meta.url)('../cloudflare-deploy/node_modules/esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-admin-boundaries-'));
let pass = 0;
async function check(name, run) {
  await run();
  console.log('PASS ' + name);
  pass++;
}

function fixture({ teacher = false, databaseError = false } = {}) {
  const trace = [];
  const levels = [{ code: 'teacher_1', rate_per_20min: 50 }];
  const teachers = [
    { id: 11, korean_name: 'Kaye', english_name: 'Kaye' },
    { id: 22, korean_name: 'Other', english_name: 'Other' },
  ];
  const DB = {
    async exec(sql) { trace.push(['exec', sql]); },
    prepare(sql) {
      let binds = [];
      const stmt = {
        bind(...values) { binds = values; return stmt; },
        async first() {
          trace.push(['first', sql, binds]);
          if (/FROM admin_sessions/.test(sql)) return { username: 'fixture_teacher', expires_at: Date.now() + 60_000, last_seen_at: Date.now() };
          if (/SELECT name FROM admin_account/.test(sql)) return { name: 'Kaye' };
          if (/FROM admin_scope/.test(sql)) return { scope_type: teacher ? 'teacher' : 'hq', scope_value: null };
          return { c: 1, value: '1' };
        },
        async all() {
          trace.push(['all', sql, binds]);
          if (databaseError) throw Error('fixture database unavailable');
          if (/FROM judgment_analysis/.test(sql)) return { results: [{ band: 2, n: 100, pct_correct: 80, students: 12 }] };
          if (/SELECT \* FROM payroll_levels/.test(sql)) return { results: levels };
          if (/SELECT id, korean_name/.test(sql)) return { results: teachers };
          if (/FROM payroll_deduction_rules/.test(sql)) return { results: [{ code: 'no_feedback_day', amount: 25 }] };
          return { results: [] };
        },
        async run() { trace.push(['run', sql, binds]); return { success: true, meta: { changes: 1 } }; },
      };
      return stmt;
    },
  };
  return { env: { DB, SESSION_STATE: { async get() { return null; }, async put() {} } }, trace, levels, teachers };
}

try {
  const out = join(temp, 'handlers.mjs');
  buildSync({ stdin: { contents: "export { handleAdminApi } from './api-admin'; export { admCacheHit, admCachePut } from './admin-cache';", resolveDir: sourceDir, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const { handleAdminApi, admCacheHit, admCachePut } = await import(pathToFileURL(out).href);
  const call = (path, env, options = {}) => {
    const url = new URL(path, 'https://sandbox.invalid');
    return handleAdminApi(new Request(url, options), url, env);
  };

  await check('unmatched routes and unsupported methods fall through without touching D1', async () => {
    const { env, trace } = fixture();
    for (const path of ['/api/admin/stats/not-a-route', '/api/admin/payroll/not-a-route', '/unrelated']) {
      assert.equal(await call(path, env), null);
    }
    assert.equal(await call('/api/admin/stats/judgment-bands', env, { method: 'DELETE' }), null);
    assert.deepEqual(trace, []);
  });
  await check('statistics dispatch preserves real aggregation and excludes guest samples in SQL', async () => {
    const { env, trace } = fixture();
    const res = await call('/api/admin/stats/judgment-bands', env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total, 100);
    assert.equal(body.enough_data, true);
    assert.equal(body.bands[0].off_target, -5);
    assert.match(trace.find(x => x[0] === 'all')[1], /NOT LIKE 'guest%'/);
  });
  await check('statistics database failure remains an explicit error response', async () => {
    const { env } = fixture({ databaseError: true });
    const res = await call('/api/admin/stats/judgment-bands', env);
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { ok: false, error: 'fixture database unavailable' });
  });
  await check('payroll routes use the extracted request-local initializer and preserve result rows', async () => {
    const { env, trace } = fixture();
    const res = await call('/api/admin/payroll/deduction-rules', env);
    assert.deepEqual(await res.json(), { ok: true, rules: [{ code: 'no_feedback_day', amount: 25 }] });
    assert(trace.some(x => x[0] === 'exec' && /CREATE TABLE IF NOT EXISTS payroll_deduction_rules/.test(x[1])));
  });
  await check('teacher payroll view filters out other teachers', async () => {
    const { env, teachers, levels } = fixture({ teacher: true });
    const res = await call('/api/admin/payroll/levels', env, { headers: { Cookie: 'mango_admin_session=fixture' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, levels, teachers: [teachers[0]] });
  });
  await check('teacher cannot change payroll rates and no payroll update reaches D1', async () => {
    const { env, trace } = fixture({ teacher: true });
    const res = await call('/api/admin/payroll/levels', env, { method: 'POST', headers: { Cookie: 'mango_admin_session=fixture', 'Content-Type': 'application/json' }, body: JSON.stringify({ levels: [{ code: 'teacher_1', rate_per_20min: 0 }] }) });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).ok, false);
    assert(!trace.some(x => /UPDATE payroll_levels/.test(x[1])));
  });
  await check('cache hits preserve JSON and cache failures preserve successful responses', async () => {
    const env = { SESSION_STATE: { async get() { return '{"ok":true}'; }, async put() { throw Error('KV offline'); } } };
    const hit = await admCacheHit(env, 'key');
    assert.equal(hit.headers.get('X-Adm-Cache'), 'hit');
    assert.deepEqual(await hit.json(), { ok: true });
    env.SESSION_STATE.get = async () => { throw Error('KV offline'); };
    assert.equal(await admCacheHit(env, 'key'), null);
    const res = await admCachePut(env, 'key', { rows: [1] });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { rows: [1] });
    let saved;
    env.SESSION_STATE.put = async (...args) => { saved = args; };
    await admCachePut(env, 'key', { ok: true }, 300);
    assert.deepEqual(saved, ['key', '{"ok":true}', { expirationTtl: 300 }]);
  });
  await check('source readers follow actual imports, preserve mutation overrides and fail on missing modules', () => {
    const sources = { 'api-admin.ts': "import { f } from './api-admin-stats'; // import './admin-fake'\nexport const root = 1;", 'api-admin-stats.ts': "import './admin-cache'; export const f = 'mutant';", 'admin-cache.ts': "import './api-admin-stats'; export const cache = 1;" };
    const graph = adminSrcUsing(file => { assert(file in sources, file); return sources[file]; });
    assert.equal(graph.match(/export const cache/g).length, 1);
    assert(graph.indexOf('export const cache') < graph.indexOf('export const f'));
    assert.match(graph, /'mutant'/);
    assert.throws(() => adminSrcUsing(file => { if (file === 'api-admin-stats.ts') throw Error('missing module'); return sources[file]; }), /missing module/);
  });
  console.log(`PASS ${pass} / FAIL 0`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
