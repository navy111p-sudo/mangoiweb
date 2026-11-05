// Translation extraction: run the production entry point with isolated AI/KV/DB.
// No external requests or production credentials are used.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CF = process.env.TRANSLATE_TEST_CF || join(ROOT, 'cloudflare-deploy');
const require = createRequire(join(CF, 'package.json'));
const { buildSync } = require('esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-translate-'));
let pass = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network access is disabled in translation sandbox'); };
try {
  const bundle = join(temp, 'api.mjs');
  buildSync({ entryPoints: [join(CF, 'src/api-mango.ts')], outfile: bundle,
    bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', logLevel: 'silent' });
  const { handleMangoApi } = await import(pathToFileURL(bundle).href);
  async function run(body, options = {}) {
    const calls = [], puts = [], pending = [], queries = [];
    let running = 0, peak = 0;
    const env = {
      DB: { prepare(sql) {
        queries.push(sql);
        if (body?.mode !== 'learn_report') throw new Error('Unexpected database access');
        return { bind() { return this; }, async run() { return {}; }, async first() { return { n: options.reportCount || 0 }; } };
      } },
      SESSION_STATE: {
        async get(key) { if (options.kvFails) throw new Error('KV unavailable'); return options.cache?.[key] ?? null; },
        async put(...args) { if (options.kvFails) throw new Error('KV unavailable'); puts.push(args); },
      },
    };
    if (!options.noAi) env.AI = { async run(model, input) {
      calls.push({ model, input }); running++; peak = Math.max(peak, running);
      try {
        await Promise.resolve();
        if (options.ai) return await options.ai(model, input, calls.length);
        if (model.includes('m2m100')) return { translated_text: '오늘 수업을 시작해요.' };
        if (options.path === '/api/i18n/translate') {
          const lines = input.messages.at(-1).content.split('\n\n').at(-1).split('\n');
          return { response: lines.map((_, i) => `${i + 1}. Label ${i + 1}`).join('\n') };
        }
        return { response: '오늘 수업을 시작해요.' };
      } finally { running--; }
    } };
    const url = new URL('https://sandbox.invalid' + (options.path || '/api/translate'));
    const request = new Request(url, { method: options.method || 'POST',
      ...(options.method === 'GET' ? {} : { body: options.raw ?? JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) });
    const response = await handleMangoApi(request, url, env, { waitUntil(p) { pending.push(p); } });
    await Promise.all(pending);
    return { status: response?.status, data: response ? await response.json() : null, calls, puts, queries, pending, peak, request };
  }
  async function test(name, fn) { await fn(); pass++; console.log('  PASS ' + name); }
  await test('unrelated routes fall through without consuming a body', async () => {
    const r = await run({}, { path: '/api/unknown-translate-module' });
    assert.equal(r.data, null); assert.equal(r.request.bodyUsed, false);
  });
  for (const path of ['/api/translate', '/api/i18n/translate']) {
    await test(path + ' GET stays unhandled', async () => assert.equal((await run({}, { path, method: 'GET' })).data, null));
    await test(path + ' empty and malformed JSON retain empty maps', async () => {
      assert.deepEqual((await run({}, { path })).data, { ok: true, map: {} });
      assert.deepEqual((await run({}, { path, raw: '{' })).data, { ok: true, map: {} });
    });
  }
  await test('UI cache hits avoid AI and preserve exact keys', async () => {
    const r = await run({ texts: ['수업', '수업', ''] }, { path: '/api/i18n/translate', cache: { 'i18n:en:수업': 'Class' } });
    assert.deepEqual(r.data.map, { 수업: 'Class' }); assert.equal(r.calls.length, 0);
  });
  await test('UI 50-item limit uses three chunks and waitUntil cache writes', async () => {
    const r = await run({ texts: Array.from({ length: 55 }, (_, i) => '수업' + i) }, { path: '/api/i18n/translate' });
    assert.equal(Object.keys(r.data.map).length, 50); assert.equal(r.calls.length, 3);
    assert.equal(r.puts.length, 50); assert.equal(r.pending.length, 1);
    assert.ok(r.puts.every(([key, , ttl]) => key.startsWith('i18n:en:') && ttl.expirationTtl === 15552000));
  });
  await test('UI accepts JSON array output', async () => {
    const r = await run({ texts: ['수업'] }, { path: '/api/i18n/translate', ai: async () => ({ response: '["Class"]' }) });
    assert.equal(r.data.map.수업, 'Class');
  });
  await test('UI retries failures and never caches untranslated output', async () => {
    const r = await run({ texts: ['수업'] }, { path: '/api/i18n/translate', ai: async () => { throw new Error('AI unavailable'); } });
    assert.equal(r.data.map.수업, '수업'); assert.equal(r.calls.length, 2); assert.equal(r.puts.length, 0);
  });
  await test('no AI returns original UI text', async () => {
    const r = await run({ texts: ['수업'] }, { path: '/api/i18n/translate', noAi: true });
    assert.equal(r.data.map.수업, '수업');
  });
  for (const [target, text] of [['en', 'Hello'], ['ko', '안녕하세요'], ['zh', '你好']]) {
    await test(target + ' text already in target language bypasses AI', async () => {
      const r = await run({ target, texts: [text] }); assert.equal(r.data.map[text], text); assert.equal(r.calls.length, 0);
    });
  }
  await test('normal translation retains tr cache namespace', async () => {
    const r = await run({ target: 'ko', texts: ['Start class'] });
    assert.equal(r.data.map['Start class'], '오늘 수업을 시작해요.'); assert.equal(r.puts[0][0], 'tr:ko:Start class');
  });
  await test('chat cache bypasses AI', async () => {
    const r = await run({ target: 'ko', mode: 'chat', texts: ['Hello'] }, { cache: { 'trc4:ko:Hello': '안녕하세요.' } });
    assert.equal(r.data.map.Hello, '안녕하세요.'); assert.equal(r.calls.length, 0);
  });
  await test('chat failure retries LLM, falls back to MT and avoids cache poisoning', async () => {
    const r = await run({ target: 'ko', mode: 'chat', texts: ['Start class'] }, { ai: async (model) => {
      if (!model.includes('m2m100')) throw new Error('sandbox capacity');
      return { translated_text: '수업을 시작해요.' };
    } });
    assert.equal(r.calls.length, 3); assert.equal(r.data.map['Start class'], '수업을 시작해요.'); assert.equal(r.puts.length, 0);
  });
  await test('chat strips labels, quotes and stacked polite endings', async () => {
    const r = await run({ target: 'ko', mode: 'chat', texts: ['Thanks'] }, { ai: async () => ({ response: 'Translation: "감사합니다요."' }) });
    assert.equal(r.data.map.Thanks, '감사합니다.'); assert.equal(r.puts[0][0], 'trc4:ko:Thanks');
  });
  await test('learn curated greetings bypass AI', async () => {
    const r = await run({ target: 'ko', mode: 'learn', texts: ['Good job!'] });
    assert.match(r.data.map['Good job!'], /잘했어요/); assert.equal(r.calls.length, 0); assert.equal(r.puts[0][0], 'trl2:ko:Good job!');
  });
  await test('learn rejects invalid cache and refreshes meaning', async () => {
    const r = await run({ target: 'ko', mode: 'learn', texts: ['Start class'] }, { cache: { 'trl2:ko:Start class': 'ㅋㅋㅋㅋ' } });
    assert.equal(r.data.map['Start class'], '오늘 수업을 시작해요.'); assert.equal(r.puts.length, 1);
  });
  await test('translation batch concurrency stays at four', async () => {
    const r = await run({ target: 'ko', texts: Array.from({ length: 10 }, (_, i) => 'Start class ' + i) });
    assert.equal(r.calls.length, 10); assert.equal(r.peak, 4);
  });
  await test('KV failure preserves a valid translation response', async () => {
    const r = await run({ target: 'ko', texts: ['Start class'] }, { kvFails: true });
    assert.equal(r.status, 200); assert.equal(r.data.map['Start class'], '오늘 수업을 시작해요.');
  });
  await test('note rejects empty input and absent AI', async () => {
    assert.equal((await run({ mode: 'note', text: '' })).status, 400);
    assert.equal((await run({ mode: 'note', text: 'Hello' }, { noAi: true })).status, 503);
  });
  await test('note masks student name, restores output and never caches', async () => {
    const r = await run({ mode: 'note', text: '민수 joined class.', student_name: '민수' }, {
      ai: async () => ({ response: '{"en":"{{STUDENT}} joined class.","ko":"{{STUDENT}}는 오늘 수업에 잘 참여했어요."}' }),
    });
    assert.equal(r.status, 200); assert.equal(r.data.en, '민수 joined class.'); assert.match(r.data.ko, /민수/);
    assert.ok(!JSON.stringify(r.calls).includes('민수')); assert.equal(r.puts.length, 0);
  });
  await test('note malformed JSON uses Korean-only fallback', async () => {
    const r = await run({ mode: 'note', text: 'Joined class.' }, { ai: async (_, __, n) => ({ response: n === 1 ? 'not JSON' : '오늘 수업에 잘 참여했어요.' }) });
    assert.equal(r.status, 200); assert.equal(r.data.en, 'Joined class.'); assert.equal(r.calls.length, 2);
  });
  await test('note cannot return success when Korean generation fails', async () => {
    const r = await run({ mode: 'note', text: 'Joined class.' }, { ai: async () => ({ response: 'English only' }) });
    assert.equal(r.status, 502); assert.equal(r.data.error, 'no_korean');
  });
  await test('learn report validates fields, stores only in sandbox DB and retains cap', async () => {
    assert.equal((await run({ mode: 'learn_report' })).status, 400);
    const r = await run({ mode: 'learn_report', text: 'Hello', meaning: '안녕', page: 'warmup' });
    assert.equal(r.data.stored, true); assert.ok(r.queries.some(q => q.startsWith('INSERT INTO learn_meaning_reports')));
    const capped = await run({ mode: 'learn_report', text: 'Hello', meaning: '안녕' }, { reportCount: 500 });
    assert.equal(capped.data.stored, false); assert.ok(!capped.queries.some(q => q.startsWith('INSERT')));
  });
  await test('unexpected route error still passes through shared 500 boundary', async () => {
    const r = await run(null); assert.equal(r.status, 500); assert.equal(r.data.ok, false);
  });
  await test('dispatcher calls the extracted handler with request, URL, env and context', async () => {
    const src = readFileSync(join(CF, 'src/api-mango.ts'), 'utf8');
    assert.match(src, /import \{ handleTranslateApi \} from '\.\/api-translate'/);
    assert.match(src, /await handleTranslateApi\(request, url, env, ctx\)/);
    assert.ok(!src.includes('async function chatTranslate('));
  });
  console.log(`\nPASS ${pass} / FAIL 0`);
} finally {
  globalThis.fetch = originalFetch;
  // Only the directory returned by mkdtempSync is removed.
  rmSync(temp, { recursive: true, force: true });
}
