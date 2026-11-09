// Execute the shipped learning dispatcher, with local doubles only. Never use live AI or D1.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { gamesSrcUsing } from './_srcbundle.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = process.env.VOICE_MODULE_SRC_DIR || join(root, 'cloudflare-deploy/src');
const { buildSync } = createRequire(import.meta.url)('../cloudflare-deploy/node_modules/esbuild');
const temp = mkdtempSync(join(tmpdir(), 'mangoi-voice-contracts-'));
const realFetch = globalThis.fetch;
let pass = 0;
async function check(name, run) { await run(); pass++; console.log('PASS ' + name); }
function fixture() {
  const trace = [], cache = new Map(), aiCalls = [];
  const DB = {
    async exec(sql) { trace.push(['exec', sql]); },
    prepare(sql) {
      let binds = [];
      const s = {
        bind(...values) { binds = values; return s; },
        async first() { trace.push(['first', sql, binds]); return null; },
        async all() { trace.push(['all', sql, binds]); return { results: [] }; },
        async run() { trace.push(['run', sql, binds]); return { success: true }; },
      }; return s;
    },
  };
  const env = { DB, ROOM_JWT_SECRET: 'synthetic-local-voice-contract-secret-only',
    AI: { async run(...args) { aiCalls.push(args); return new Response(new Uint8Array(400), { headers: { 'Content-Type': 'audio/mpeg' } }); } },
    RECORDINGS: {
      async get(key) { const r = cache.get(key); return r ? { body: r.bytes.slice(), customMetadata: r.meta.customMetadata } : null; },
      async put(key, bytes, meta) { cache.set(key, { bytes: new Uint8Array(bytes), meta }); },
    },
  };
  return { env, trace, cache, aiCalls };
}
try {
  globalThis.fetch = async () => { throw Error('Unexpected network request in voice contract test'); };
  const out = join(temp, 'handlers.mjs');
  buildSync({ stdin: { contents: "export { handleGamesApi } from './api-games'; export { signUidToken } from './auth-token';", resolveDir: sourceDir, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'silent' });
  const { handleGamesApi, signUidToken } = await import(pathToFileURL(out).href);
  const call = (path, env, options = {}) => {
    const url = new URL(path, 'https://sandbox.invalid');
    return handleGamesApi(new Request(url, options), url, env);
  };
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const audio = (query = '') => ({ path: '/api/voice/transcribe' + query, options: { method: 'POST', body: new Uint8Array(200) } });

  await check('unmatched paths and unsupported voice methods fall through with no D1/AI work', async () => {
    const { env, trace, aiCalls } = fixture();
    for (const path of ['/unrelated', '/api/voice/unknown', '/api/voice/tts', '/api/voice/transcribe', '/api/voice/coach']) assert.equal(await call(path, env), null);
    assert.deepEqual(trace, []); assert.deepEqual(aiCalls, []);
  });
  await check('TTS validates text and missing binding before provider calls', async () => {
    const { env, aiCalls } = fixture();
    assert.equal((await call('/api/voice/tts', env, post({}))).status, 400);
    delete env.AI;
    assert.equal((await call('/api/voice/tts', env, post({ text: 'study' }))).status, 503);
    assert.equal(aiCalls.length, 0);
  });
  await check('TTS dispatch normalizes short text, preserves voice and reuses cache', async () => {
    const { env, aiCalls, trace } = fixture();
    const res = await call('/api/voice/tts', env, post({ text: 'study', speaker: 'delia' }));
    assert.equal(res.status, 200); assert.equal(res.headers.get('X-TTS-Speaker'), 'delia');
    assert.equal(aiCalls[0][1].text, 'Study.'); assert.equal(aiCalls[0][1].speaker, 'delia');
    assert.equal((await res.arrayBuffer()).byteLength, 400);
    const hit = await call('/api/voice/tts', env, post({ text: 'study', speaker: 'delia' }));
    assert.equal(hit.headers.get('X-TTS-Engine'), 'r2-cache:aura-2'); assert.equal(aiCalls.length, 1);
    assert.deepEqual(trace, []);
  });
  await check('Aura-1 fallback does not occupy another Aura-2 speaker cache', async () => {
    const { env, aiCalls } = fixture();
    env.AI.run = async (model, params) => { aiCalls.push([model, params]); return model.endsWith('aura-2-en') ? new Response('{}', { status: 429 }) : new Response(new Uint8Array(400), { headers: { 'Content-Type': 'audio/mpeg' } }); };
    const first = await call('/api/voice/tts', env, post({ text: 'study', speaker: 'delia' }));
    assert.equal(first.headers.get('X-TTS-Engine'), 'aura-1'); assert.equal(first.headers.get('X-TTS-Speaker'), 'luna');
    assert.equal(aiCalls.length, 2); // Quota errors do not retry Aura-2.
    const actualHit = await call('/api/voice/tts', env, post({ text: 'study', speaker: 'luna' }));
    assert.equal(actualHit.headers.get('X-TTS-Engine'), 'aura-1'); assert.equal(aiCalls.length, 4);
    await call('/api/voice/tts', env, post({ text: 'study', speaker: 'delia' }));
    assert.equal(aiCalls.length, 6);
  });
  await check('cache metadata reports actual engine rather than requested Azure provider', async () => {
    const { env, aiCalls } = fixture();
    env.RECORDINGS.get = async () => ({ body: new Uint8Array(400), customMetadata: { eng: 'gtts' } });
    const r = await call('/api/voice/tts', env, post({ text: '你好', lang: 'zh', azure_voice: 'yunxi' }));
    assert.equal(r.headers.get('X-TTS-Engine'), 'r2-cache:gtts'); assert.equal(aiCalls.length, 0);
  });
  await check('transcription validates audio and strict language before model execution', async () => {
    const { env, aiCalls } = fixture();
    assert.equal((await call('/api/voice/transcribe', env, { method: 'POST', body: 'tiny' })).status, 400);
    const a = audio('?strict=1'); const r = await call(a.path, env, a.options);
    assert.equal(r.status, 400); assert.equal((await r.json()).error, 'speech_language_required'); assert.equal(aiCalls.length, 0);
  });
  await check('strict empty speech is terminal and never invokes base recognizer', async () => {
    const { env, aiCalls } = fixture();
    env.AI.run = async (...args) => { aiCalls.push(args); return { text: '' }; };
    const a = audio('?strict=1&lang=en'); const r = await call(a.path, env, a.options);
    assert.equal((await r.json()).dropped, 'no_speech'); assert.equal(aiCalls.length, 1);
  });
  await check('strict recognizer failure stays 503 while ordinary coaching retains base fallback', async () => {
    for (const strict of [true, false]) {
      const { env, aiCalls } = fixture();
      env.AI.run = async (model, params) => { aiCalls.push([model, params]); if (model.includes('turbo')) throw Error('synthetic unavailable'); return { text: 'Hello.' }; };
      const a = audio('?lang=en' + (strict ? '&strict=1' : '')); const r = await call(a.path, env, a.options);
      assert.equal(r.status, strict ? 503 : 200); assert.equal(aiCalls.length, strict ? 1 : 2);
      if (!strict) assert.equal((await r.json()).text, 'Hello.');
    }
  });
  await check('focused English recording recovers on only with a matching second transcript', async () => {
    for (const [first, second, enabled, expected, calls] of [
      ['I am interested in music.', 'I am interested on music.', true, 'I am interested on music.', 2],
      ['I am interested in music.', 'I am interested in music.', true, 'I am interested in music.', 2],
      ['I am interested in music.', 'I am interested on movies.', true, 'I am interested in music.', 2],
      ['I am interested in music.', null, true, 'I am interested in music.', 2],
      ['I am interested on music.', '', true, 'I am interested on music.', 2],
      ['I am interested in music.', 'I am interested on music.', false, 'I am interested in music.', 1],
    ]) {
      const { env, aiCalls } = fixture();
      let backupStarted;
      const started = new Promise(resolve => { backupStarted = resolve; });
      env.AI.run = async model => {
        aiCalls.push(model);
        if (model.includes('turbo')) {
          if (enabled) {
            let timer;
            try {
              await Promise.race([started, new Promise((_, reject) => {
                timer = setTimeout(() => reject(Error('backup did not start alongside primary')), 50);
              })]);
            } finally { clearTimeout(timer); }
          }
          return { text: first };
        }
        backupStarted();
        if (second === null) throw Error('synthetic unavailable');
        return { text: second };
      };
      const fd = new FormData();
      fd.set('audio', new Blob([new Uint8Array(200)]), 'speech.webm');
      fd.set('lang', 'en');
      if (enabled) fd.set('check_preposition', '1');
      const r = await call('/api/voice/transcribe', env, { method: 'POST', body: fd });
      const data = await r.json();
      assert.equal(data.text, expected);
      assert.equal(aiCalls.length, calls);
      if (!enabled || !first.includes('interested in')) assert.equal(data.preposition_recheck, undefined);
      else assert.equal(data.preposition_recheck, expected !== first ? 'recovered' : second === null ? 'unavailable' : 'unchanged');
    }
  });
  await check('coach denies writes for another student before AI or record insert', async () => {
    const { env, trace, aiCalls } = fixture();
    const r = await call('/api/voice/coach', env, post({ target: 'Hello.', spoken: 'Hello.', student_uid: 'other-student' }));
    assert.equal(r.status, 401); assert.equal(aiCalls.length, 0); assert(!trace.some(x => x[0] === 'run'));
  });
  await check('guest practice still receives deterministic scores and stores its own record without AI', async () => {
    const { env, trace } = fixture(); delete env.AI;
    const r = await call('/api/voice/coach', env, post({ target: 'I like apples.', spoken: 'I like apples.', student_uid: 'guest' }));
    assert.equal(r.status, 200); const b = await r.json(); assert.equal(b.ok, true); assert(b.scores.overall >= 90);
    const insert = trace.find(x => x[0] === 'run' && /INSERT INTO voice_coaching/.test(x[1])); assert.equal(insert[2][0], 'guest');
  });
  await check('history and statistics reject absent/mismatched tokens and accept the owner', async () => {
    const { env, trace } = fixture(); const token = await signUidToken('student-a', env);
    for (const route of ['history', 'stats']) {
      assert.equal((await call('/api/voice/' + route + '?uid=student-a', env)).status, 401);
      assert.equal((await call('/api/voice/' + route + '?uid=student-b', env, { headers: { Authorization: 'Bearer ' + token } })).status, 401);
      const r = await call('/api/voice/' + route + '?uid=student-a', env, { headers: { Authorization: 'Bearer ' + token } });
      assert.equal(r.status, 200); assert.equal((await r.json()).ok, true);
    }
    assert(trace.filter(x => x[0] === 'all').every(x => x[2][0] === 'student-a'));
  });
  await check('Azure token endpoint reports missing configuration without network calls', async () => {
    const { env } = fixture(); const r = await call('/api/voice/azure-token', env);
    assert.equal(r.status, 503); assert.equal((await r.json()).error, 'azure_not_configured');
  });
  await check('source graph excludes disconnected modules, follows overrides and fails missing dependencies', async () => {
    const files = { 'api-games.ts': "import { x } from './api-games-voice'; ROOT", 'api-games-voice.ts': "import { y } from './api-voice-tts'; VOICE", 'api-voice-tts.ts': 'TTS_OVERRIDE', 'api-voice-unused.ts': 'UNSHIPPED' };
    const graph = gamesSrcUsing(f => { assert(f in files, 'missing ' + f); return files[f]; });
    assert(graph.includes('TTS_OVERRIDE')); assert(!graph.includes('UNSHIPPED'));
    delete files['api-voice-tts.ts']; assert.throws(() => gamesSrcUsing(f => { if (!(f in files)) throw Error('missing dependency'); return files[f]; }), /missing dependency/);
  });
  console.log(`PASS ${pass} / FAIL 0 voice module contracts`);
} finally { globalThis.fetch = realFetch; rmSync(temp, { recursive: true, force: true }); }
