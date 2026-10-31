// Execute production formatters, stream gates and the actual friend send handler.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { d1ExecLikeProd } from './helpers/d1-exec-faithful.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CF = path.join(ROOT, 'cloudflare-deploy');
const require = createRequire(path.join(CF, 'package.json'));
const ts = require('typescript');
const esbuild = require('esbuild');
function load(file) {
  const js = esbuild.buildSync({ entryPoints: [path.join(CF, 'src', file)], bundle: true,
    write: false, platform: 'node', format: 'cjs', external: ['cloudflare:*'] }).outputFiles[0].text;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', js)(module, module.exports, require);
  return module.exports;
}
const H = load('warmup-honest.ts');
const S = load('warmup-stream.ts');
const api = fs.readFileSync(path.join(CF, 'src/api-ai.ts'), 'utf8');
const index = fs.readFileSync(path.join(CF, 'src/index.ts'), 'utf8');
const html = fs.readFileSync(path.join(CF, 'public/ai-friend.html'), 'utf8');
const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('async function sendMsg('));
function named(source, name, kind = 'function') {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  let found;
  function visit(n) {
    if (kind === 'function' && ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(ast);
    if (kind === 'arrow' && ts.isVariableDeclaration(n) && n.name.getText(ast) === name) found = n.initializer.getText(ast);
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.ok(found, 'Production function exists: ' + name);
  return ts.transpileModule(found, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
let pass = 0;
function check(name, run) { run(); pass++; console.log('PASS ' + name); }
const fix = { was: 'I go park yesterday', now: 'I went to the park yesterday' };
const question = 'What did you do next?';
const final = H.ensureFocusedFixSpoken(question, 'focused', 'partial', fix);
check('avatar correction is first, exactly three times, no next question', () => {
  assert.ok(final.startsWith('You can say... "' + fix.now + '"'));
  assert.equal(final.split(fix.now).length - 1, 3);
  assert.equal(final.match(/You can say/g).length, 3);
  assert.ok(!final.includes(question));
  assert.ok(final.endsWith('Can you say it with me?'));
});
check('model correction cannot add a fourth repetition; formatter is idempotent', () => {
  assert.equal(H.ensureFocusedFixSpoken(fix.now + '. ' + question, 'focused', null, fix), final);
  assert.equal(H.ensureFocusedFixSpoken(final, 'focused', null, fix), final);
});
check('no invented corrections and other modes keep their reply', () => {
  for (const mode of ['free_talk', 'balanced']) assert.equal(H.ensureFocusedFixSpoken(question, mode, null, fix), question);
  assert.equal(H.ensureFocusedFixSpoken(question, 'focused', null, null), question);
  assert.equal(H.ensureFocusedFixSpoken(question, 'focused', 'perfect', null), question);
});
check('avatar SSE holds every speculative sentence in focused mode', () => {
  const sent = [];
  const live = S.createWarmupLive(o => sent.push(o), { lang: 'en', cap: 50, friend: 'Mango',
    studentInput: fix.was, focused: true });
  assert.equal(live.push(question), false);
  assert.equal(live.push(fix.now), false);
  assert.deepEqual(sent, []);
  assert.equal(live.sent(), 0);
  assert.equal(live.replacedBy(final), 0);
  assert.match(index, /focused:\s*honest\?\.mode === 'focused'/);
});
check('avatar ordinary mode still streams', () => {
  const sent = [];
  const live = S.createWarmupLive(o => sent.push(o), { lang: 'en', cap: 50, friend: 'Mango', studentInput: fix.was });
  assert.equal(live.push(question), true);
  assert.equal(sent[0].t, question);
});
const liveSend = named(api, 'liveSend', 'arrow');
for (const mode of ['focused', 'free_talk', 'balanced']) {
  check('friend server stream gate: ' + mode, () => {
    const sent = [];
    const ctx = vm.createContext({ friendMode: mode, qmem: null, Date, latT0: Date.now(),
      FRAG_RETRY_BUDGET_MS: 9000, repeatedQuestions: () => [], sseSend: o => sent.push(o) });
    vm.runInContext("let streamHalt = ''; let streamedText = ''; const emit = " + liveSend + '; emit(' + JSON.stringify(question) + ');', ctx);
    assert.equal(sent.length, mode === 'focused' ? 0 : 1);
  });
}
check('friend canonical correction is applied before persistence', () => {
  const call = api.indexOf('reply = ensureFocusedFixSpoken(reply, friendMode, null, usedFallback ? null : showFix)');
  const save = api.indexOf(".bind(uid, 'assistant', reply");
  assert.ok(call > api.indexOf('let showFix: any = null;') && call < save);
  assert.match(api, /import \{[^}]*ensureFocusedFixSpoken[^}]*\} from '.\/warmup-honest'/);
});

const uiFunctions = ['stmRead', 'stmSpeak', 'stmReset', 'sayThrice', 'sendMsg'].map(n => named(inline, n)).join('\n');
async function uiTurn(mode, stream, { sound = true, pron = false, replaced = false, unavailable = false } = {}) {
  const said = [], events = [], payloads = [];
  const response = { ok: true, reply: mode === 'focused' ? final : question,
    fix: mode === 'focused' ? fix : null, repeat: true, replaced, ai_unavailable: unavailable,
    ...(pron ? { pron_fix: { word: 'park', say_times: 3 } } : {}) };
  const input = { value: fix.was, focus() {}, dispatchEvent() {} };
  const button = { disabled: false };
  const row = {};
  const doc = { getElementById: id => id === 'msgInput' ? input : id === 'sendBtn' ? button : {},
    querySelector: () => null, querySelectorAll: s => s === '.ai-row' ? [row] : [] };
  const chunks = [{ t: question }, { done: 1, ...response }].map(o => 'data: ' + JSON.stringify(o) + '\n\n');
  const auto = { begin: () => 1, on: () => false, settled: () => events.push('settled') };
  const ctx = vm.createContext({ console, TextDecoder, TextEncoder, Promise, Date, Event: class {},
    document: doc, currentCorr: mode, currentLevel: 'beginner', currentPersona: 'friendly', currentTopic: null,
    currentSub: 'on', currentVoice: 'emma', _ttsLangSet: false, _pendingVoice: false, _lastRecBlob: null,
    _lastAiText: '', _repeatTarget: null, _stmGen: 0, _stmChain: Promise.resolve(), _stmSpoke: false, _stmRow: null,
    window: { FriendAutoTalk: auto }, FriendAutoTalk: auto, setTimeout: () => 0, isSoundOn: () => sound, isEn: () => false,
    maybeAdjustRate() {}, getAuth: async () => ({ uid: 'test', token: 'fake' }), fixCardClear() {},
    appendMsg: (who, text) => { if (who === 'ai') row._speakBody = text; }, appendTyping() {}, removeTyping() {},
    sndPop() {}, personNow: () => 'emma', applyGam() {}, showFixCard: () => events.push('fix-card'),
    appendNotice: () => events.push('notice'),
    showPronFix: (_pf, auto) => { assert.equal(auto, false); events.push('pron-card'); },
    stmShow: () => events.push('preview'),
    speakText: (text, _btn, _row, done) => { said.push(text); events.push('speech'); Promise.resolve().then(done); },
    fetch: async (_url, opts) => {
      payloads.push(JSON.parse(opts.body)); let i = 0;
      return { status: 200, headers: { get: () => stream ? 'text/event-stream' : 'application/json' },
        json: async () => response, body: { getReader: () => ({ read: async () => i < chunks.length
          ? { value: new TextEncoder().encode(chunks[i++]), done: false } : { done: true } }) } };
    } });
  vm.runInContext(uiFunctions, ctx);
  await vm.runInContext('sendMsg()', ctx);
  await vm.runInContext('_stmChain', ctx);
  return { said, events, payloads };
}
for (const stream of [false, true]) {
  const r = await uiTurn('focused', stream);
  check('actual friend send: correction first exactly three, ' + (stream ? 'SSE' : 'JSON'), () => {
    assert.deepEqual(r.said, [final]);
    assert.equal(r.said.join(' ').split(fix.now).length - 1, 3);
    assert.ok(!r.events.includes('preview'));
  });
}
for (const mode of ['free_talk', 'balanced']) {
  const r = await uiTurn(mode, true);
  check('actual friend ordinary stream remains once: ' + mode, () => assert.deepEqual(r.said, [question]));
}
const muted = await uiTurn('focused', true, { sound: false });
check('mute is respected', () => assert.deepEqual(muted.said, []));
const pron = await uiTurn('focused', true, { pron: true });
check('pronunciation cannot interrupt grammar correction and completes three times afterward', () => {
  assert.deepEqual(pron.said, [final, 'park', 'park', 'park']);
  assert.equal(pron.events.at(-1), 'settled');
});
const unavailable = await uiTurn('focused', true, { unavailable: true });
check('failed AI replies stay silent notices, without correction cards', () => {
  assert.deepEqual(unavailable.said, []);
  assert.ok(unavailable.events.includes('notice'));
  assert.ok(!unavailable.events.includes('fix-card'));
});

// Real Worker routes with an in-memory D1 and a deterministic model, never the live service.
const worker = load('index.ts').default;
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
const cache = new Map();
let routeFix = fix;
const env = { DB, ROOM_JWT_SECRET: 'focused-local-fixture-only',
  SESSION_STATE: { get: async k => cache.get(k) ?? null, put: async (k, v) => cache.set(k, String(v)), list: async () => ({ keys: [] }) },
  AI: { run: async (_model, opts) => {
    const response = JSON.stringify({ reply: question, fix: { ...routeFix, why_ko: '어제라서 과거형', tag: 'past_tense', severity: 'major' }, grade: 'partial' });
    if (!opts.stream) return { response };
    return new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ response }) + '\n\ndata: [DONE]\n\n')); c.close(); } });
  } } };
async function post(route, body, token) {
  return worker.fetch(new Request('https://mangoi.ai' + route, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: 'https://mangoi.ai', ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }, body: JSON.stringify(body) }), env, { waitUntil() {}, passThroughOnException() {} });
}
for (const kind of ['avatar', 'friend']) for (const stream of [0, 1]) {
  let token, uid;
  if (kind === 'friend') {
    const auth = await (await post('/api/ai/chat-guest-token', {})).json(); token = auth.token; uid = auth.uid;
  }
  const response = await post(kind === 'avatar' ? '/api/warmup/chat' : '/api/ai/chat-friend', kind === 'avatar'
    ? { session_id: 'focused-' + stream, student_input: fix.was, correction_mode: 'focused', stream, difficulty: 3 }
    : { uid, msg: fix.was, correction_mode: 'focused', stream, level: 'S3' }, token);
  const events = stream ? (await response.text()).split('\n').filter(s => s.startsWith('data:')).map(s => JSON.parse(s.slice(5))) : [];
  const body = stream ? events.find(e => e.done) : await response.json();
  check('real ' + kind + ' endpoint: ' + (stream ? 'SSE' : 'JSON'), () => {
    assert.equal(response.status, 200);
    if (kind === 'friend' || stream) assert.equal(body.ok, true);
    assert.equal(body.fix?.now, fix.now);
    const speech = body.ai_response || body.reply;
    assert.equal(speech, final);
    assert.equal(events.filter(e => e.t).length, 0);
    if (kind === 'friend') assert.equal(raw.prepare("SELECT content FROM ai_friend_chats WHERE student_uid=? AND role='assistant'").get(uid)?.content, final);
  });
}
routeFix = { was: 'What you do? I go park yesterday.', now: 'What did you do? I went to the park yesterday.' };
const complex = await (await post('/api/warmup/chat', { session_id: 'focused-complex', student_input: routeFix.was,
  correction_mode: 'focused', difficulty: 3 })).json();
check('avatar correction containing an internal question is still spoken exactly three times', () => {
  assert.equal(complex.fix?.now, routeFix.now);
  assert.equal(complex.ai_response, H.ensureFocusedFixSpoken(question, 'focused', 'partial', routeFix));
  assert.equal(complex.ai_response.split(routeFix.now).length - 1, 3);
});
raw.close();
console.log(`PASS ${pass} / FAIL 0`);
