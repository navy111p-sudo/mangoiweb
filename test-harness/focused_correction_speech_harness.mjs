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
const F = load('focused-correction.ts');
const FL = load('friend-correction-flow.ts');   // 🎚️ (2026-11-03) 모드별 최종 조립·미리듣기 문 정본
const flowSrc = fs.readFileSync(path.join(CF, 'src/friend-correction-flow.ts'), 'utf8');
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
  assert.equal(final.match(/You can say/g).length, 1);
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
/* 🎚️ (2026-11-03) liveSend 는 이제 미리듣기 문(previewGate)을 지난다 — 정본 gate 를 그대로 넣어 돌린다.
   균형은 «교정이 정해질 때까지» 잡아 둔다: fix.was 는 과거형 보완이 잡는 문장이라 교정이 «이미 있음» → 0문장. */
for (const mode of ['focused', 'free_talk', 'balanced']) {
  check('friend server stream gate: ' + mode, () => {
    const sent = [];
    const previewGate = FL.createFriendPreviewGate(FL.planFriendTurn(mode, fix.was), s => sent.push({ t: s }));
    const ctx = vm.createContext({ friendMode: mode, qmem: null, Date, latT0: Date.now(), previewGate,
      FRAG_RETRY_BUDGET_MS: 9000, repeatedQuestions: () => [], sseSend: o => sent.push(o) });
    vm.runInContext("let streamHalt = ''; let streamedText = ''; const emit = " + liveSend + '; emit(' + JSON.stringify(question) + ');', ctx);
    assert.equal(sent.length, mode === 'free_talk' ? 1 : 0);
  });
}
check('friend server stream gate: balanced without a correction still previews (pair)', () => {
  const sent = [];
  const previewGate = FL.createFriendPreviewGate(FL.planFriendTurn('balanced', 'I went to the park yesterday.'), s => sent.push({ t: s }));
  const ctx = vm.createContext({ friendMode: 'balanced', qmem: null, Date, latT0: Date.now(), previewGate,
    FRAG_RETRY_BUDGET_MS: 9000, repeatedQuestions: () => [], sseSend: o => sent.push(o) });
  vm.runInContext("let streamHalt = ''; let streamedText = ''; const emit = " + liveSend + '; emit(' + JSON.stringify(question) + ');', ctx);
  assert.equal(sent.length, 0);   // 아직 교정 여부를 모른다
  previewGate.raw('{"reply":"x","fix":null}');
  previewGate.recheck(false);
  assert.deepEqual(sent, [{ t: question }]);
});
check('friend canonical correction is applied before persistence', () => {
  /* 🎚️ (2026-11-03) 최종 조립이 finishFriendReply 한 곳으로 모였다 — 그 안에서 집중교정 3번(ensureFocusedFixSpoken)을 부른다. */
  // 🏅 (2026-11-04) 인자 끝에 suspect 가 붙었다 — 인자 «모양» 이 아니라 «저장 전에 부르는가» 를 본다
  const call = api.indexOf('reply = finishFriendReply(reply, { mode: friendMode, verified: verifiedFix, shown: showFix, msg, fallback: usedFallback');
  const save = api.indexOf(".bind(uid, 'assistant', reply");
  assert.ok(call > api.indexOf('let showFix: any = null;') && call < save);
  assert.match(flowSrc, /import \{[^}]*ensureFocusedFixSpoken[^}]*\} from '.\/warmup-honest'/);
  assert.equal(FL.finishFriendReply(question, { mode: 'focused', verified: fix, shown: fix, msg: fix.was, fallback: false }), final);
  assert.equal(FL.finishFriendReply(question, { mode: 'focused', verified: fix, shown: fix, msg: fix.was, fallback: true }), question);
});

const uiFunctions = ['stmClearPreview', 'stmRead', 'stmSpeak', 'stmReset', 'sayThrice', 'sendMsg'].map(n => named(inline, n)).join('\n');
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
    maybeAdjustRate() {}, friendPanelFold() {}, getAuth: async () => ({ uid: 'test', token: 'fake' }), fixCardClear() {},
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
let holdHistory;
let routeFix = fix;
let scenario = 'normal', modelCalls = 0, rechecks = 0;
const env = { DB, ROOM_JWT_SECRET: 'focused-local-fixture-only',
  SESSION_STATE: { get: async k => cache.get(k) ?? null, put: async (k, v) => {
    if (holdHistory && k.startsWith('warmup:early-')) await holdHistory;
    cache.set(k, String(v));
  }, list: async () => ({ keys: [] }) },
  AI: { run: async (_model, opts) => {
    modelCalls++;
    const recheck = opts.messages?.[0]?.content.includes('FOCUSED_CORRECTION_CHECK');
    if (recheck) rechecks++;
    const fullFix = { ...routeFix, why_ko: '문법에 맞게 고쳐요', tag: 'other', severity: 'minor' };
    let response = JSON.stringify({ reply: question, fix: fullFix, grade: 'partial' });
    if (scenario === 'repeated') response = JSON.stringify({ reply: H.ensureFocusedFixSpoken(question, 'focused', 'partial', routeFix), fix: fullFix });
    if (scenario === 'missing' || scenario === 'invalid') response = JSON.stringify({ reply: 'You can say... "' + routeFix.now + '"', fix: scenario === 'invalid' ? { ...fullFix, was: 'Invented text' } : null });
    if (scenario === 'truncated') response = JSON.stringify({ reply: 'You can say... "' + routeFix.now + '"' }).slice(0, -1) + ',"fix": {';
    if (scenario === 'invalid') response = JSON.stringify({ reply: question, fix: { ...fullFix, was: 'Invented text' } });
    if (scenario === 'omitted') response = JSON.stringify({ reply: question, fix: null });
    if (scenario === 'correct') response = JSON.stringify({ reply: 'What do you like?', fix: null, grade: 'perfect' });
    if (recheck) {
      if (['failed-check', 'failed-quoted'].includes(scenario)) throw new Error('fixture unavailable');
      response = JSON.stringify({ reply: 'Checked.', fix: scenario === 'correct' ? null : fullFix });
    }
    if (scenario === 'failed-check' && !recheck) response = JSON.stringify({ reply: 'Please try again.', fix: null });
    if (scenario === 'failed-quoted' && !recheck) response = JSON.stringify({ reply: 'You can say... "' + routeFix.now + '"', fix: null });
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
    /* ⚡ (2026-11-06) A.i 친구 스트리밍은 저장·포인트 «전» 에 final 로 같은 정본을 먼저 보낸다 — done 보다 앞, 같은 답·같은 교정. */
    if (kind === 'friend' && stream) {
      const fi = events.findIndex(e => e.final), di = events.findIndex(e => e.done);
      assert.ok(fi >= 0 && fi < di, 'final event precedes done');
      assert.equal(events[fi].reply, body.reply);
      assert.equal(events[fi].fix?.now, body.fix?.now);
      assert.equal(events[fi].repeat, body.repeat);
      assert.equal(events[fi].replaced, body.replaced);
      assert.equal(events[fi].gam, undefined, 'points stay on done');
    }
  });
}
const quickFixes = [
  ["Yeah, it's really helpful for me understand", "Yeah, it's really helpful for me to understand"],
  ["It is difficult for us speak clearly.", "It is difficult for us to speak clearly."],
  ['Yesterday I go to the park with my sister.', 'Yesterday I went to the park with my sister.'],
  ['I eat pizza yesterday.', 'I ate pizza yesterday.'],
  ['My favorite animal is lion.', 'My favorite animal is a lion.'],
  ['I saw elephant.', 'I saw an elephant.'],
  ['She like cats.', 'She likes cats.'],
  ['They is ready.', 'They are ready.'],
  ['I am interested on music.', 'I am interested in music.'],
  ["She's responsible of the project.", "She's responsible for the project."],
];
for (const mode of ['focused', 'free_talk']) {
  let release;
  holdHistory = new Promise(resolve => { release = resolve; });
  const key = 'early-' + mode;
  try {
    const r = await post('/api/warmup/chat', { session_id: key, student_input: fix.was,
      correction_mode: mode, guided: 1, difficulty: 3, stream: 1, final_reply: 1 });
    const reader = r.body.getReader();
    const first = JSON.parse(new TextDecoder().decode((await reader.read()).value).slice(6));
    check('avatar ' + mode + ' sends only the verified reply while history is held', () => {
      assert.equal(first.final, 1);
      assert.equal(first.ok, true);
      assert.equal(cache.has('warmup:' + key), false);
      assert.equal(first.ai_response, mode === 'focused' ? final : question);
    });
    release();
    const done = JSON.parse(new TextDecoder().decode((await reader.read()).value).slice(6));
    check('avatar ' + mode + ' done carries the same reply after history is saved', () => {
      assert.equal(done.done, 1);
      assert.equal(done.ai_response, first.ai_response);
      assert.deepEqual(done.fix, first.fix);
      assert.equal(cache.has('warmup:' + key), true);
    });
    await reader.read();
  } finally {
    release();
    holdHistory = null;
  }
}
for (const [i, [studentInput, corrected]] of quickFixes.entries()) {
  modelCalls = 0;
  const r = await post('/api/warmup/chat', { session_id: 'infinitive-' + i, student_input: studentInput,
    correction_mode: 'focused', guided: 1, difficulty: 3, stream: 1, final_reply: 1 });
  const events = (await r.text()).split('\n').filter(s => s.startsWith('data:')).map(s => JSON.parse(s.slice(5)));
  const done = events.find(e => e.done);
  check('avatar guided verified correction ' + i + ' needs zero model calls', () => {
    assert.equal(modelCalls, 0);
    assert.deepEqual(events.filter(e => e.t), []);
    assert.equal(done.fix.was, studentInput);
    assert.equal(done.fix.now, corrected);
    assert.equal(done.ai_response, H.ensureFocusedFixSpoken(question, 'focused', 'partial', { now: corrected }));
    assert.equal(done.speaking_help, null);
  });
}
check('fast rules leave ambiguous, complex and already-correct forms for the model', () => {
  for (const input of ['Yesterday I go park.', 'I go there every week but yesterday I stayed home.',
    'Yesterday I went to the park.', 'I play the game today.', 'I play chess after work yesterday.']) {
    assert.equal(F.focusedPastTenseFix(input), null, input);
  }
  for (const input of ['My favorite animal is a lion.', 'My favorite animal is lions.',
    'My favorite food is rice.', 'This is elephant habitat.']) {
    assert.equal(F.focusedArticleFix(input), null, input);
  }
  for (const input of ['She likes cats.', 'They are ready.', 'My friends likes music.',
    'She go park yesterday.', 'She like cats and we like dogs.', 'Does she like cats?']) {
    assert.equal(F.focusedAgreementFix(input), null, input);
  }
  for (const input of ['I am interested in music.', 'She is afraid of spiders.', 'I am good in class.',
    'I am interested on Monday.', 'I am interested on music because I sing.']) {
    assert.equal(F.focusedPrepositionFix(input), null, input);
  }
});
check('infinitive rule leaves correct clauses, modals, unrelated phrases and long input alone', () => {
  for (const input of ["It's helpful for me to understand.", "It's helpful for me, understand?",
    "It is important for me tomorrow.", "It's hard for us can speak.", "I am happy for you",
    "It's hard for me read " + 'many different books '.repeat(7)]) {
    assert.equal(F.focusedInfinitiveFix(input), null, input);
  }
});
scenario = 'normal';
routeFix = { was: 'What you do? I go park yesterday.', now: 'What did you do? I went to the park yesterday.' };
const complex = await (await post('/api/warmup/chat', { session_id: 'focused-complex', student_input: routeFix.was,
  correction_mode: 'focused', difficulty: 3 })).json();
check('avatar correction containing an internal question is still spoken exactly three times', () => {
  assert.equal(complex.fix?.now, routeFix.now);
  assert.equal(complex.ai_response, H.ensureFocusedFixSpoken(question, 'focused', 'partial', routeFix));
  assert.equal(complex.ai_response.split(routeFix.now).length - 1, 3);
});
// The screenshot's first-turn missing article: reply has a correction but fix is absent.
routeFix = { was: 'my favorite animal is lion', now: 'My favorite animal is a lion' };
for (const kind of ['avatar', 'friend']) for (const mode of ['focused', 'balanced', 'free_talk']) {
  for (const variant of ['missing', 'omitted', 'invalid', 'truncated', 'repeated', 'correct', 'failed-check', 'failed-quoted']) {
    scenario = variant; modelCalls = 0; rechecks = 0;
    let token, uid;
    if (kind === 'friend') { const auth = await (await post('/api/ai/chat-guest-token', {})).json(); token = auth.token; uid = auth.uid; }
    const response = await post(kind === 'avatar' ? '/api/warmup/chat' : '/api/ai/chat-friend', kind === 'avatar'
      ? { session_id: 'reliability-' + mode + '-' + variant, student_input: variant === 'correct' ? routeFix.now : routeFix.was, correction_mode: mode, stream: 1, difficulty: 1 }
      : { uid, msg: variant === 'correct' ? routeFix.now : routeFix.was, correction_mode: mode, stream: 1, level: 'S1' }, token);
    const events = (await response.text()).split('\n').filter(s => s.startsWith('data:')).map(s => JSON.parse(s.slice(5)));
    const body = events.find(e => e.done);
    check(kind + ' first turn ' + mode + ' / ' + variant, () => {
      assert.equal(response.status, 200);
      assert.ok(body);
      const spoken = body.ai_response || body.reply;
      if (mode === 'focused' && !['correct', 'failed-check'].includes(variant)) {
        assert.equal(body.fix?.now, routeFix.now);
        assert.equal(spoken, H.ensureFocusedFixSpoken(question, mode, 'partial', routeFix));
        assert.equal(events.filter(e => e.t).length, 0);
        const needsCheck = ['omitted', 'invalid'].includes(variant);
        /* ⚡ (2026-11-06) A.i 친구는 다시 묻기를 본 호출과 «동시에» 미리 시작한다(api-ai.ts focusedRecoverP) —
           모델이 교정을 줘서 결과를 안 쓰는 턴에도 한 번은 불린다(호출 하나와 바꾼 기다림). 웜업(avatar)은 예전대로 «필요할 때만». */
        const startsEarly = kind === 'friend';
        assert.equal(rechecks, needsCheck || startsEarly ? 1 : 0);
        assert.equal(modelCalls, needsCheck || startsEarly ? 2 : 1);
      } else if (mode === 'focused') {
        assert.equal(body.fix, null);
        assert.ok(!spoken.includes('You can say'));
        assert.equal(rechecks, 1);
      } else {
        assert.equal(rechecks, 0, 'ordinary modes do not acquire focused rechecks');
      }
    });
  }
}
check('quoted correction recovery requires explicit framing, source overlap and a real change', () => {
  assert.equal(F.focusedReplyFix('You can say... "My favorite animal is a lion"', routeFix.was)?.now, routeFix.now);
  for (const reply of ['What is your favorite animal?', 'You can say... "I drove to the moon"', 'You can say... "' + routeFix.was + '"']) {
    assert.equal(F.focusedReplyFix(reply, routeFix.was), null);
  }
});
raw.close();
console.log(`PASS ${pass} / FAIL 0`);
