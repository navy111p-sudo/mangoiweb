/* ⚡ 웜업(교재로 연습·상황별 말하기) 집중교정 «교정만 다시 묻기» 를 본 호출과 «동시에» (2026-11-06)
 *    Warmup focused recheck overlaps the main model call — run the real /api/warmup/chat route
 *    with an in-memory D1/KV and a delayed fake model (never the live service).
 *
 *  ① 집중교정 + 맞는 문장: 다시 묻기가 본 호출이 «끝나기 전» 에 시작하고, 답까지 두 호출 시간을 «더하지» 않는다
 *  ② 짝: 과거형 보완이 잡는 문장은 다시 묻기를 아예 안 부른다 · 균형·자유대화는 안 부른다
 *  ③ 짝: 본 호출이 «첫 호출» 이다(가짜 모델 하니스들의 대본이 안 밀린다)
 *  ④ 지연 기록 model_ms 가 전체 ms 보다 크지 않다(겹친 시간을 두 번 안 셈)
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { d1ExecLikeProd } from './helpers/d1-exec-faithful.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CF = path.join(ROOT, 'cloudflare-deploy');
const require = createRequire(path.join(CF, 'package.json'));
const esbuild = require('esbuild');
function load(file) {
  const js = esbuild.buildSync({ entryPoints: [path.join(CF, 'src', file)], bundle: true,
    write: false, platform: 'node', format: 'cjs', external: ['cloudflare:*'] }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', js)(module, module.exports, require);
  return module.exports;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + (e && e.message ? e.message.split('\n')[0] : e)); }
}

const worker = load('index.ts').default;
const TB = load('tense-backfill.ts');
const FC = load('focused-correction.ts');
const raw = new DatabaseSync(':memory:');
const statement = sql => {
  const mk = args => ({
    all: async () => ({ results: raw.prepare(sql).all(...args), success: true }),
    first: async col => { const r = raw.prepare(sql).get(...args) ?? null; return col && r ? r[col] : r; },
    run: async () => { const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { ...mk([]), bind: (...args) => mk(args.map(x => x === undefined ? null : typeof x === 'boolean' ? Number(x) : x)) };
};
const DB = { prepare(sql) {
  try { raw.prepare(sql); return statement(sql); }
  catch { const z = { all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: { changes: 0 } }) }; return { ...z, bind: () => z }; }
}, exec: d1ExecLikeProd(raw), batch: async ss => Promise.all(ss.map(s => s.run())) };
const kv = new Map();
let cfg = {}, calls = [];
const enc = s => new TextEncoder().encode(s);
const env = { DB, ROOM_JWT_SECRET: 'warmup-recheck-local-fixture-only',
  SESSION_STATE: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, String(v)), list: async () => ({ keys: [] }) },
  AI: { run: async (_model, opts) => {
    const sys = String(opts.messages?.[0]?.content || '');
    const kind = sys.includes('FOCUSED_CORRECTION_CHECK') ? 'focused' : 'main';
    const rec = { kind, t0: Date.now(), t1: 0 }; calls.push(rec);
    await sleep(kind === 'main' ? (cfg.mainMs || 0) : (cfg.checkMs || 0));
    rec.t1 = Date.now();
    const response = kind === 'focused'
      ? JSON.stringify({ reply: 'Checked.', fix: null })
      : JSON.stringify({ reply: 'Great! What else do you like?', fix: null, grade: 'perfect' });
    if (!opts.stream) return { response };
    return new ReadableStream({ start(c) { c.enqueue(enc('data: ' + JSON.stringify({ response }) + '\n\ndata: [DONE]\n\n')); c.close(); } });
  } } };
let sid = 0;
async function turn(input, mode, c = {}) {
  cfg = c; calls = [];
  const t0 = Date.now();
  const r = await worker.fetch(new Request('https://mangoi.ai/api/warmup/chat', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://mangoi.ai' },
    body: JSON.stringify({ session_id: 'recheck-par-' + (++sid), student_input: input, correction_mode: mode, difficulty: 3 }) }),
    env, { waitUntil() {}, passThroughOnException() {} });
  const body = await r.json();
  return { status: r.status, body, ms: Date.now() - t0, calls: calls.slice() };
}

console.log('\n① 집중교정 + 맞는 문장 — 다시 묻기가 «동시에»');
const CORRECT = 'I like pizza very much.';
const MAIN = 600, CHECK = 500;
{
  const r = await turn(CORRECT, 'focused', { mainMs: MAIN, checkMs: CHECK });
  const main = r.calls.find(x => x.kind === 'main'), rc = r.calls.find(x => x.kind === 'focused');
  await check('①-1 (전제) 응답 200 · 다시 묻기를 한 번 부른다', () => { assert.equal(r.status, 200); assert.equal(r.calls.filter(x => x.kind === 'focused').length, 1, JSON.stringify(r.calls)); });
  await check('①-2 다시 묻기가 본 호출이 «끝나기 전» 에 시작한다', () => assert.ok(rc && main && rc.t0 < main.t1, JSON.stringify(r.calls)));
  await check(`①-3 답까지 ${MAIN}+${CHECK}ms 를 «더하지» 않는다`, () => assert.ok(r.ms < MAIN + CHECK - 150, r.ms + 'ms'));
  await check('①-4 맞는 문장은 교정 없이 모델의 답 (동작 그대로)', () => {
    assert.equal(r.body.fix ?? null, null); assert.ok(/What else do you like\?/.test(r.body.ai_response) && !/You can say/.test(r.body.ai_response), r.body.ai_response);
  });
  await check('③ 본 호출이 «첫 호출» 이다 (하니스 대본이 안 밀림)', () => assert.equal(r.calls[0].kind, 'main', JSON.stringify(r.calls.map(x => x.kind))));
  const lat = raw.prepare("SELECT ms, model_ms FROM ai_latency_log WHERE feature='warmup' ORDER BY id DESC LIMIT 1").get();
  await check('④ 지연 기록 model_ms ≤ ms (겹친 시간을 두 번 안 셈)', () => assert.ok(lat && lat.model_ms <= lat.ms, JSON.stringify(lat)));
}

console.log('\n② 짝 — 안 불러야 할 때는 안 부른다');
{
  const msg = 'I go to the park yesterday.';
  await check('②-1 (전제) 이 문장은 과거형 보완 규칙이 잡는다', () => assert.ok(FC.focusedCandidate(TB.backfillPastTenseFix(msg), msg)));
  const r = await turn(msg, 'focused');
  await check('②-2 과거형 보완이 잡는 문장은 다시 묻기를 아예 안 부른다', () => assert.equal(r.calls.filter(x => x.kind === 'focused').length, 0, JSON.stringify(r.calls.map(x => x.kind))));
  await check('②-3 그때도 규칙 교정이 답이 된다', () => assert.ok(r.body.fix && /went/.test(r.body.fix.now), JSON.stringify(r.body.fix)));
}
for (const mode of ['balanced', 'free_talk']) {
  const r = await turn(CORRECT, mode);
  await check('②-4 ' + mode + ' 에서는 집중교정 다시 묻기를 안 부른다', () => assert.equal(r.calls.filter(x => x.kind === 'focused').length, 0));
}

raw.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
