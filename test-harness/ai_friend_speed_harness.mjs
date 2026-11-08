/* ⚡ A.i 친구하기 휴대폰 속도 (2026-11-06 사장님 「휴대폰에서 A.i 말하기 3카드 모두 아바타가 더 빨리 응답」)
 *    AI Friend speed: run the real server route, the real send handler, the real recorder wrapper,
 *    the lip-sync switch and the hands-free timer — never the live service.
 *
 * 무엇을 보나 (전부 «실제로 돌려서» — 글자가 있는가가 아니라 «언제 무엇이 일어나는가»)
 *  ① 서버 — 집중교정 «교정만 다시 묻기» 가 본 호출과 «동시에» 돈다(예전: 본 답이 끝난 뒤 차례로)
 *       짝: 규칙 보완이 잡는 문장·균형/자유대화에서는 안 부른다 · 첫 모델이 죽으면 그 모델로 다시 묻는다
 *  ② 서버 — 최종 답(final)이 포인트·지연 기록 «전» 에 나간다 · done 과 같은 답 · 포인트는 done 에만
 *       짝: 기록 저장(대화·말하기 세션)은 final «앞» (함정 대조 2026-11-06) · JSON 경로에는 final 이 없다 · 지연 기록 ms 는 final 시각이다
 *  ③ 화면 — final 을 받는 순간 그리고 읽는다(done 을 안 기다림) · 두 번 안 그린다 · 포인트·발음은 done 뒤
 *       짝: final 없는 옛 서버는 예전처럼 done 에서 그리고 읽는다 · final 뒤 done 이 깨져도 오류 말풍선을 안 띄운다
 *  ④ 화면 — 녹음 «미리 받아쓰기»(정본 js/mangoi-voice-early.js) — 조용히 있었으면 끝에서 다시 안 올린다
 *       짝: 조각이 말소리 아님·빈손이면 «조용히» 버리고 끝에서 예전처럼 판정 · 다시 말하면 버린다 · 모듈 없으면 예전 그대로
 *  ⑤ 화면 — 입모양 분석 엔진을 켠다(2026-11-09 다시 켬 — 11-06 에 껐던 것) · 짝: ?visemes=off 면 분석·부팅을 막는다
 *  ⑥ 자동 말하기 — AI 말이 끝나고 마이크를 여는 대기: 안드로이드 300ms · 그 밖 600ms(웜업과 같은 값) · 그 시각에 실제로 연다
 */
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
const read = p => fs.readFileSync(path.join(CF, p), 'utf8');
const HTML = process.env.AIF_HTML ? fs.readFileSync(process.env.AIF_HTML, 'utf8') : read('public/ai-friend.html');
const AUTO = process.env.AIF_AUTO ? fs.readFileSync(process.env.AIF_AUTO, 'utf8') : read('public/js/aifriend-auto-talk.js');
const EARLY = read('public/js/mangoi-voice-early.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + ' — ' + (e && e.message ? e.message.split('\n')[0] : e)); }
}

/* ─────────────── ①② 서버 — 실제 Worker 라우트(메모리 D1 · 가짜 모델) ─────────────── */
console.log('\n①② 서버 — /api/ai/chat-friend 를 실제로 돌린다');
const worker = load('index.ts').default;
const TB = load('tense-backfill.ts');
const FC = load('focused-correction.ts');
const raw = new DatabaseSync(':memory:');
let slowSaveMs = 0, slowGamMs = 0;
const statement = sql => {
  /* slowGam — 포인트 스냅샷(aiFriendGamSnapshot 의 «연속 일수» 조회)만 늦춘다: final 뒤·지연 기록 앞에 도는 일 */
  const slow = /INSERT INTO ai_friend_chats/.test(sql), slowGam = /SELECT DISTINCT CAST\(\(created_at \+ 32400000\)/.test(sql);
  const mk = args => ({
    all: async () => { if (slowGam && slowGamMs) await sleep(slowGamMs); return { results: raw.prepare(sql).all(...args), success: true }; },
    first: async col => { const r = raw.prepare(sql).get(...args) ?? null; return col && r ? r[col] : r; },
    run: async () => {
      if (slow && slowSaveMs) await sleep(slowSaveMs);
      const r = raw.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } };
    },
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
const env = { DB, ROOM_JWT_SECRET: 'speed-local-fixture-only',
  SESSION_STATE: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, String(v)), list: async () => ({ keys: [] }) },
  AI: { run: async (model, opts) => {
    const sys = String(opts.messages?.[0]?.content || '');
    const kind = sys.includes('FOCUSED_CORRECTION_CHECK') ? 'focused' : sys.includes('BALANCED_CORRECTION_CHECK') ? 'balanced' : 'main';
    const rec = { kind, model, t0: Date.now(), t1: 0 }; calls.push(rec);
    if (cfg.failModel && model === cfg.failModel) { rec.t1 = Date.now(); throw new Error('fixture model down'); }
    await sleep(kind === 'main' ? (cfg.mainMs || 0) : (cfg.checkMs || 0));
    rec.t1 = Date.now();
    let response;
    if (kind === 'focused') response = JSON.stringify({ reply: 'Checked.', fix: cfg.checkFix || null });
    else if (kind === 'balanced') response = JSON.stringify({ reply: 'Checked.', fix: null });
    else response = JSON.stringify({ reply: cfg.reply || 'Great! What else do you like?', fix: cfg.mainFix || null });
    if (!opts.stream) return { response };
    return new ReadableStream({ start(c) { c.enqueue(enc('data: ' + JSON.stringify({ response }) + '\n\ndata: [DONE]\n\n')); c.close(); } });
  } } };
async function post(route, body, token) {
  return worker.fetch(new Request('https://mangoi.ai' + route, { method: 'POST', headers: {
    'Content-Type': 'application/json', Origin: 'https://mangoi.ai', ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }, body: JSON.stringify(body) }), env, { waitUntil() {}, passThroughOnException() {} });
}
/** SSE 를 «도착하는 대로» 읽어 이벤트마다 도착 시각(요청 시작 기준 ms)을 붙인다. */
async function sseTimed(resp, t0, onEv) {
  const rd = resp.body.getReader(), dec = new TextDecoder(); let buf = ''; const out = [];
  for (;;) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) { const e = { at: Date.now() - t0, ev: JSON.parse(line.slice(5)) }; out.push(e); if (onEv) onEv(e.ev); }
    }
  }
  return out;
}
async function friendTurn(msg, mode, { stream = 1, c = {}, onEv, as = null, extra = {} } = {}) {
  cfg = c; calls = [];
  const auth = as || await (await post('/api/ai/chat-guest-token', {})).json();
  const t0 = Date.now();
  const resp = await post('/api/ai/chat-friend', { uid: auth.uid, msg, correction_mode: mode, stream, level: 'S3', ...extra }, auth.token);
  if (!stream) return { json: await resp.json(), ms: Date.now() - t0, calls: calls.slice(), uid: auth.uid };
  const evs = await sseTimed(resp, t0, onEv);
  return { evs, ms: Date.now() - t0, calls: calls.slice(), uid: auth.uid,
    fin: evs.find(e => e.ev.final), done: evs.find(e => e.ev.done) };
}

const CORRECT = 'I like pizza very much.';
const MAIN = 600, CHECK = 500;
{
  const r = await friendTurn(CORRECT, 'focused', { c: { mainMs: MAIN, checkMs: CHECK } });
  const main = r.calls.find(x => x.kind === 'main'), rc = r.calls.find(x => x.kind === 'focused');
  await check('①-1 집중교정: 다시 묻기를 한 번 부른다 (전제)', () => assert.equal(r.calls.filter(x => x.kind === 'focused').length, 1));
  await check('①-2 집중교정: 다시 묻기가 본 호출이 «끝나기 전» 에 시작한다 (동시에)', () => assert.ok(rc && main && rc.t0 < main.t1, JSON.stringify(r.calls)));
  await check(`①-3 집중교정: 답(final)까지 ${MAIN}+${CHECK}ms 를 «더하지» 않는다 (겹친다)`, () =>
    assert.ok(r.fin && r.fin.at < MAIN + CHECK - 150, 'final at ' + (r.fin && r.fin.at) + 'ms'));
  const lat1 = raw.prepare("SELECT ms, model_ms FROM ai_latency_log WHERE feature='chat-friend' ORDER BY id DESC LIMIT 1").get();
  await check('①-10 지연 기록 model_ms ≤ ms — 겹친 다시 묻기 시간을 두 번 안 센다', () => assert.ok(lat1 && lat1.model_ms <= lat1.ms + 30, JSON.stringify(lat1)));
  await check('①-4 맞는 문장은 교정 없이 «모델의 답» 을 보낸다 (교정 3번 아님 · 동작 그대로)', () => {
    assert.equal(r.done.ev.fix, null); assert.ok(/What else do you like\?/.test(r.done.ev.reply) && !/You can say/.test(r.done.ev.reply), r.done.ev.reply);
  });
}
{
  /* 다시 묻기가 본 호출보다 «오래» 걸린 턴 — 기다린 나머지는 모델 시간으로 센다(안 세면 model_ms 가 비어 «우리 코드가 느리다» 로 읽힌다) */
  await friendTurn(CORRECT, 'focused', { c: { mainMs: 300, checkMs: 800 } });
  const lat2 = raw.prepare("SELECT ms, model_ms FROM ai_latency_log WHERE feature='chat-friend' ORDER BY id DESC LIMIT 1").get();
  await check('①-11 짝: 다시 묻기를 «기다린 나머지» 는 model_ms 에 들어간다', () => assert.ok(lat2 && lat2.model_ms >= lat2.ms - 150 && lat2.model_ms <= lat2.ms + 30, JSON.stringify(lat2)));
}
{
  /* 쓰는 «순서» — 모델의 교정이 있으면 미리 부른 다시 묻기 결과는 버린다(둘이 다른 교정을 내도) */
  const msg = 'my favorite animal is lion';
  const A = { was: msg, now: 'My favorite animal is a lion', why_ko: '관사를 붙여요', tag: 'other', severity: 'minor' };
  const B = { was: msg, now: 'My favorite animal is the lion', why_ko: '관사를 붙여요', tag: 'other', severity: 'minor' };
  await check('①-12 (전제) 두 교정 모두 검증을 통과한다 — 순서가 뒤집히면 답이 달라진다', () => { assert.ok(FC.focusedCandidate(A, msg)); assert.ok(FC.focusedCandidate(B, msg)); });
  const r = await friendTurn(msg, 'focused', { c: { mainFix: A, checkFix: B } });
  await check('①-13 모델의 교정이 미리 부른 다시 묻기를 이긴다 (순서 그대로)', () => assert.equal(r.done.ev.fix && r.done.ev.fix.now, A.now, JSON.stringify(r.done.ev.fix)));
}
{
  const msg = 'I go to the park yesterday.';
  await check('①-5 (전제) 이 문장은 과거형 보완 규칙이 잡는다', () => assert.ok(FC.focusedCandidate(TB.backfillPastTenseFix(msg), msg)));
  const r = await friendTurn(msg, 'focused', { c: {} });
  await check('①-6 짝: 규칙 보완이 잡는 문장은 다시 묻기를 아예 안 부른다 (헛호출 없음)', () =>
    assert.equal(r.calls.filter(x => x.kind === 'focused').length, 0, JSON.stringify(r.calls.map(x => x.kind))));
  await check('①-7 그때도 규칙 교정이 답이 된다', () => assert.ok(r.done.ev.fix && /went/.test(r.done.ev.fix.now), JSON.stringify(r.done.ev.fix)));
}
for (const mode of ['balanced', 'free_talk']) {
  const r = await friendTurn(CORRECT, mode, { c: {} });
  await check('①-8 짝: ' + mode + ' 에서는 집중교정 다시 묻기를 안 부른다', () =>
    assert.equal(r.calls.filter(x => x.kind === 'focused').length, 0));
}
{
  /* 첫 모델이 죽고 둘째 모델이 답한 턴 — 미리 부른 다시 묻기(첫 모델)는 빈손이므로 «답한 모델» 로 한 번 더 묻는다(예전 동작) */
  const FIRST = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const fixNow = 'I like pizza very much!';
  const r = await friendTurn(CORRECT, 'focused', { c: { failModel: FIRST, checkFix: { was: CORRECT, now: fixNow, why_ko: '문장부호', tag: 'other', severity: 'minor' } } });
  const rc = r.calls.filter(x => x.kind === 'focused');
  await check('①-9 첫 모델이 죽으면 답한 모델로 다시 묻는다 (미리 부른 것 + 한 번 더)', () =>
    assert.deepEqual(rc.map(x => x.model === FIRST), [true, false], JSON.stringify(rc.map(x => x.model))));
}

{
  slowGamMs = 500;
  let savedAtFinal = null;
  const r = await friendTurn(CORRECT, 'focused', { c: {}, onEv: ev => { if (ev.final) savedAtFinal = raw.prepare("SELECT content FROM ai_friend_chats WHERE role='assistant' ORDER BY id DESC LIMIT 1").get(); } });
  slowGamMs = 0;
  await check('②-1 final 이벤트가 있다', () => assert.ok(r.fin && r.done, JSON.stringify(r.evs.map(e => Object.keys(e.ev)))));
  await check('②-2 final 이 그 뒤 처리(느린 포인트 조회 500ms)를 «기다리지 않고» 먼저 나간다', () =>
    assert.ok(r.done.at - r.fin.at >= 400, 'final ' + r.fin.at + 'ms · done ' + r.done.at + 'ms'));
  await check('②-8 대화 저장은 final «앞» — 답을 듣고 바로 끊겨도 들은 문장이 기록에 있다', () =>
    assert.equal(savedAtFinal && savedAtFinal.content, r.fin.ev.reply, JSON.stringify(savedAtFinal)));
  await check('②-3 final 과 done 이 같은 답·같은 교정·같은 replaced', () => {
    assert.equal(r.fin.ev.reply, r.done.ev.reply); assert.deepEqual(r.fin.ev.fix, r.done.ev.fix);
    assert.equal(r.fin.ev.repeat, r.done.ev.repeat); assert.equal(r.fin.ev.replaced, r.done.ev.replaced);
  });
  await check('②-4 포인트(gam)는 done 에만 실린다', () => { assert.equal(r.fin.ev.gam, undefined); assert.ok('gam' in r.done.ev); });
  await check('②-5 저장은 그대로 된다 (학생이 들은 답 = 다음 턴이 읽는 기록)', () =>
    assert.equal(raw.prepare("SELECT content FROM ai_friend_chats WHERE student_uid=? AND role='assistant' ORDER BY id DESC").get(r.uid)?.content, r.fin.ev.reply));
  const lat = raw.prepare("SELECT ms FROM ai_latency_log WHERE feature='chat-friend' ORDER BY id DESC LIMIT 1").get();
  await check('②-6 지연 기록 ms 는 학생이 답을 받은 시각(final) — 그 뒤 포인트 처리 시간을 안 센다', () =>
    assert.ok(lat && lat.ms <= r.fin.at + 50 && lat.ms < r.done.at - 300, JSON.stringify({ lat, fin: r.fin.at, done: r.done.at })));
}
{
  /* 회원 계정 + 열린 말하기 세션 — recordSpeakingTurn 이 결과 카드용 턴을 적는다(게스트는 안 적음 → 회원으로) */
  const AT = load('auth-token.ts');
  const member = { uid: 'speed-member', token: await AT.signUidToken('speed-member', env) };
  const st = await (await post('/api/ai/speaking-progress', { action: 'start', app: 'friend' }, member.token)).json();
  await check('②-9 (전제) 회원 계정으로 말하기 세션을 열었다', () => assert.ok(st && st.sessionId, JSON.stringify(st)));
  const turnsNow = () => { try { return JSON.parse(raw.prepare('SELECT turns_json FROM ai_speaking_sessions WHERE id=?').get(st.sessionId)?.turns_json || '[]').length; } catch { return -1; } };
  let turnsAtFinal = null;
  const r = await friendTurn(CORRECT, 'focused', { as: member, c: {}, extra: { progress_session: st.sessionId, progress_turn: 'speed-turn-1' },
    onEv: ev => { if (ev.final) turnsAtFinal = turnsNow(); } });
  await check('②-9 말하기 세션 기록(결과 카드의 턴)도 final «앞» — 들은 턴이 결과에서 빠지지 않는다', () => {
    assert.ok(r.fin, JSON.stringify(r.evs.map(e => Object.keys(e.ev)))); assert.equal(turnsAtFinal, 1, 'final 때 턴 수 ' + turnsAtFinal);
  });
}
{
  const r = await friendTurn(CORRECT, 'focused', { stream: 0, c: {} });
  await check('②-7 짝: JSON 경로(stream 없음)는 예전 응답 그대로 (final 칸 없음)', () => {
    assert.equal(r.json.ok, true); assert.equal(r.json.final, undefined); assert.ok(/What else do you like\?/.test(r.json.reply), r.json.reply);
  });
}

/* ─────────────── ③ 화면 — 실제 sendMsg ─────────────── */
console.log('\n③ 화면 — ai-friend.html 의 sendMsg 를 실제로 돌린다');
const inline = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('async function sendMsg('));
function named(source, name) {
  const ast = ts.createSourceFile('s.js', source, ts.ScriptTarget.Latest, true); let found = '';
  (function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n.getText(ast); ts.forEachChild(n, visit); })(ast);
  return found;
}
const uiSrc = ['stmClearPreview', 'stmRead', 'stmSpeak', 'stmReset', 'stopSpeakingNow', 'sayThrice', 'sendMsg'].map(n => named(inline || '', n));
await check('③-0 (전제) 화면 함수 여섯을 오려 냈다', () => assert.ok(uiSrc.every(Boolean)));
const REPLY = 'Yay! What toppings do you like?';
async function uiTurn({ withFinal = true, doneOk = true, pron = false, mode = 'focused', tAfterFinal = '', interrupt = false } = {}) {
  const log = []; let releaseDone; const doneGate = new Promise(r => { releaseDone = r; });
  const fin = { final: 1, ok: true, reply: REPLY, fix: null, repeat: false, replaced: 0 };
  const done = doneOk ? { done: 1, ok: true, reply: REPLY, fix: null, repeat: false, replaced: 0, gam: { awarded: 2 },
    ...(pron ? { pron_fix: { word: 'pizza', say_times: 3 } } : {}) } : { done: 1, ok: false, error: 'stream_failed' };
  const chunks = (withFinal ? [fin] : []).concat(tAfterFinal ? [{ t: tAfterFinal }] : []).map(o => ({ o })).concat([{ o: done, gate: true }]);
  const input = { value: 'I like pizza.', focus() {}, dispatchEvent() {} };
  const button = { disabled: false }, row = {};
  const doc = { getElementById: id => id === 'msgInput' ? input : id === 'sendBtn' ? button : {},
    querySelector: () => null, querySelectorAll: s => s === '.ai-row' ? [row] : [] };
  const auto = { begin: () => 1, on: () => false, stop() {}, settled: () => log.push('settled') };
  const ctx = vm.createContext({ console, TextDecoder, TextEncoder, Promise, Date, Event: class {},
    document: doc, currentCorr: mode, currentLevel: 'S3', currentPersona: 'friendly', currentTopic: null,
    currentSub: 'on', currentVoice: 'emma', _ttsLangSet: false, _pendingVoice: false, _lastRecBlob: null,
    _lastAiText: '', _repeatTarget: null, _stmGen: 0, _stmChain: Promise.resolve(), _stmSpoke: false, _stmRow: null,
    window: { FriendAutoTalk: auto }, FriendAutoTalk: auto, setTimeout: () => 0, isSoundOn: () => true, isEn: () => false,
    maybeAdjustRate() {}, friendPanelFold() {}, getAuth: async () => ({ uid: 'test', token: 'fake' }), fixCardClear() {},
    appendMsg: (who, text) => { log.push(who === 'ai' ? (/^⚠️/.test(text) ? 'error-msg' : 'ai-msg') : 'user-msg'); if (who === 'ai') row._speakBody = text; },
    appendTyping() {}, removeTyping() {}, sndPop() {}, personNow: () => 'emma',
    applyGam: g => log.push('gam:' + (g && g.awarded)), showFixCard: () => log.push('fix-card'), appendNotice: () => log.push('notice'),
    showPronFix: () => log.push('pron-card'), stmShow: () => log.push('preview'),
    speakText: (text, _b, _r, cb) => { log.push('speech:' + text); Promise.resolve().then(cb); },
    fetch: async () => {
      let i = 0;
      return { status: 200, headers: { get: () => 'text/event-stream' }, body: { getReader: () => ({ read: async () => {
        if (i >= chunks.length) return { done: true };
        const c = chunks[i++];
        if (c.gate) { log.push('--done-released--'); await doneGate; }
        return { value: enc('data: ' + JSON.stringify(c.o) + '\n\n'), done: false };
      } }) } };
    } });
  vm.runInContext(uiSrc.join('\n'), ctx);
  const p = vm.runInContext('sendMsg()', ctx);
  await sleep(30);                       // final 을 처리할 시간 — 아직 done 은 안 보냈다
  const beforeDone = log.slice(); const lockedBeforeDone = button.disabled;
  if (interrupt) vm.runInContext('stopSpeakingNow()', ctx);
  releaseDone(); await p; await vm.runInContext('_stmChain', ctx); await sleep(5);
  return { beforeDone, log, lockedBeforeDone, lockedAfter: button.disabled };
}
{
  const r = await uiTurn();
  await check('③-1 final 을 받는 순간 말풍선을 그리고 읽기 시작한다 (done 을 안 기다림)', () =>
    assert.ok(r.beforeDone.includes('ai-msg') && r.beforeDone.includes('speech:' + REPLY), JSON.stringify(r.beforeDone)));
  await check('③-2 포인트는 done 이 온 «뒤» 에만', () => {
    assert.ok(!r.beforeDone.some(x => x.startsWith('gam:')), JSON.stringify(r.beforeDone));
    assert.ok(r.log.includes('gam:2'), JSON.stringify(r.log));
  });
  await check('③-10 final 과 done 사이에는 보내기 버튼이 잠겨 있고 done 뒤에 풀린다 (다음 턴이 포인트 처리보다 먼저 못 옴)', () => {
    assert.equal(r.lockedBeforeDone, true); assert.equal(r.lockedAfter, false);
  });
  await check('③-3 두 번 그리지도 두 번 읽지도 않는다', () => {
    assert.equal(r.log.filter(x => x === 'ai-msg').length, 1, JSON.stringify(r.log));
    assert.equal(r.log.filter(x => x.startsWith('speech:')).length, 1, JSON.stringify(r.log));
  });
}
{
  const r = await uiTurn({ pron: true });
  await check('③-4 발음 카드·3번 듣기는 done 뒤, 답 낭독 «다음» 에', () => {
    const i = r.log.indexOf('speech:' + REPLY), j = r.log.indexOf('pron-card');
    assert.ok(i >= 0 && j > i && r.log.filter(x => x === 'speech:pizza').length === 3, JSON.stringify(r.log));
  });
}
{
  const r = await uiTurn({ pron: true, interrupt: true });
  await check('③-9 final 뒤 중단하면 늦은 done 발음은 재생하지 않는다 (카드·포인트는 유지)', () => {
    assert.ok(r.beforeDone.includes('speech:' + REPLY), JSON.stringify(r.log));
    assert.equal(r.log.filter(x => x === 'speech:pizza').length, 0, JSON.stringify(r.log));
    assert.ok(r.log.includes('pron-card') && r.log.includes('gam:2'), JSON.stringify(r.log));
  });
}
{
  const r = await uiTurn({ withFinal: false });
  await check('③-5 짝: final 이 없는 옛 서버는 예전처럼 done 에서 그리고 읽는다', () => {
    assert.ok(!r.beforeDone.includes('ai-msg'), JSON.stringify(r.beforeDone));
    assert.equal(r.log.filter(x => x === 'ai-msg').length, 1); assert.ok(r.log.includes('speech:' + REPLY)); assert.ok(r.log.includes('gam:2'));
  });
}
{
  const r = await uiTurn({ doneOk: false });
  await check('③-6 final 뒤 done 이 깨져도(저장 중 오류) 오류 말풍선을 안 띄운다 — 답은 이미 갔다', () => {
    assert.ok(r.log.includes('ai-msg') && !r.log.includes('error-msg'), JSON.stringify(r.log));
  });
}
{
  const r = await uiTurn({ mode: 'balanced', tAfterFinal: 'Do you like cheese too?' });
  await check('③-8 final 뒤에 늦게 온 미리듣기 문장은 받지 않는다 (같은 답을 또 읽지 않음)', () => {
    assert.ok(!r.log.includes('preview') && !r.log.includes('speech:Do you like cheese too?'), JSON.stringify(r.log));
    assert.ok(r.log.includes('speech:' + REPLY), JSON.stringify(r.log));
  });
}
{
  const r = await uiTurn({ withFinal: false, doneOk: false });
  await check('③-7 짝: final 도 없이 깨지면 예전처럼 오류 말풍선', () => assert.ok(r.log.includes('error-msg'), JSON.stringify(r.log)));
}

/* ─────────────── ④ 화면 — friendRecordVoice + 미리 받아쓰기 ─────────────── */
console.log('\n④ 화면 — 녹음 «미리 받아쓰기» (정본 js/mangoi-voice-early.js 를 그대로 싣는다)');
const micCode = HTML.slice(HTML.indexOf('    async function friendRecordVoice(opts)'), HTML.indexOf('    function toggleMic()', HTML.indexOf('    async function micViaWhisper(auto)')));
await check('④-0 (전제) friendRecordVoice ~ micViaWhisper 를 오려 냈다', () => assert.ok(micCode.length > 1500 && /async function micViaWhisper/.test(micCode)));
const mkFd = blob => { const f = new Map([['audio', blob]]); return { append: (k, v) => f.set(k, v), get: k => f.get(k), _f: f }; };
async function micCase({ early = true, voice = { snap: true, fin: true }, text = { snap: 'I like pizza.', fin: 'I like pizza.' }, speakAgain = false } = {}) {
  const sent = [], states = [], checks = [], requests = [];
  const snapBlob = { id: 'snap' }, finBlob = { id: 'fin' };
  const ctx = { Promise, String, Date, Map, Set, setTimeout, clearTimeout, console,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' },
    _friendMicSeq: 0, _whisperOn: false, _lastRecBlob: null, _pendingVoice: false,
    document: { getElementById: () => ({ value: '' }) }, updateMicUI() {}, stopSpeakingNow() {}, isEn: () => false,
    micHint() {}, sendMsg: () => sent.push(ctx.__lastInput), AvatarVisemes: null,
    FriendAutoTalk: { micState: s => states.push(s), empty() {}, pause() {} },
    MangoiVoiceCheck: { blobHasVoice: async b => { checks.push(b && b.id); return b && b.id === 'snap' ? voice.snap : voice.fin; } },
    fetch: async (_u, o) => { const id = o.body.get('audio').id; requests.push(id + (o.body.get('strict') === '1' ? '+strict' : ''));
      await sleep(20); return { ok: true, json: async () => ({ ok: true, text: id === 'snap' ? text.snap : text.fin }) }; },
    MangoiVoice: { supported: () => true, post: async () => { throw new Error('post must not be used — transcribe is given'); }, cancel() {}, stop() {},
      record: async opts => {
        opts.onState('speaking', {});
        opts.early && opts.early({ mime: 'audio/webm;codecs=opus', stop() {}, snap: async () => mkFd(snapBlob) });   // 말이 멎었다
        await sleep(650);                                                   // 0.5초 뒤 미리 받기 → 받아 적기
        if (speakAgain) { opts.early && opts.early(0); await sleep(50); }  // 다시 말했다
        opts.onAudio(finBlob);                                              // 녹음 끝(침묵 대기가 찼다)
        opts.onState('thinking', {});
        const d = await opts.transcribe(mkFd(finBlob));
        if (!d || !d.ok) { opts.onState('error', { reason: 'server' }); return ''; }
        return String(d.text || '').trim();
      } } };
  ctx.window = ctx; vm.createContext(ctx);
  if (early) vm.runInContext(EARLY, ctx);
  vm.runInContext(micCode + '\n;globalThis.__x = 1;', ctx);
  const inputEl = { value: '' }; ctx.document = { getElementById: () => inputEl };
  ctx.sendMsg = () => sent.push(inputEl.value);
  await ctx.micViaWhisper(true);
  return { sent, states, checks, requests };
}
{
  const r = await micCase();
  await check('④-1 조용히 있었으면 미리 받은 글자를 그대로 쓴다 — 끝에서 다시 안 올린다', () => {
    assert.deepEqual(r.requests, ['snap+strict']); assert.deepEqual(r.sent, ['I like pizza.']);
  });
  await check('④-2 조각은 «조각 자기 소리» 로 말소리를 재고, 그 조각을 품은 전체 파일은 다시 안 잰다', () => assert.deepEqual(r.checks, ['snap']));
  await check('④-3 오류 상태를 한 번도 안 낸다', () => assert.ok(!r.states.includes('error'), JSON.stringify(r.states)));
}
{
  const r = await micCase({ voice: { snap: false, fin: true }, text: { snap: 'x', fin: 'I like pizza and chicken.' } });
  await check('④-4 짝: 조각이 말소리가 아니면 «조용히» 버리고 끝에서 전체를 올린다 (오류 안내 없음)', () => {
    assert.deepEqual(r.requests, ['fin+strict']); assert.deepEqual(r.sent, ['I like pizza and chicken.']);
    assert.ok(!r.states.includes('error'), JSON.stringify(r.states));
  });
}
{
  const r = await micCase({ text: { snap: '', fin: 'I like pizza and chicken.' } });
  await check('④-5 짝: 조각이 빈손이면 버리고 끝에서 전체를 올린다', () => {
    assert.deepEqual(r.requests, ['snap+strict', 'fin+strict']); assert.deepEqual(r.sent, ['I like pizza and chicken.']);
    assert.ok(!r.states.includes('error'), JSON.stringify(r.states));
  });
}
{
  const r = await micCase({ speakAgain: true, text: { snap: 'I like', fin: 'I like pizza and chicken.' } });
  await check('④-6 짝: 미리 받은 뒤 다시 말하면 그 조각은 버린다 (지난 말을 안 보냄)', () => {
    assert.deepEqual(r.sent, ['I like pizza and chicken.']); assert.deepEqual(r.requests, ['snap+strict', 'fin+strict']);
  });
}
{
  const r = await micCase({ voice: { snap: false, fin: false } });
  await check('④-7 짝: 끝까지 말소리가 없으면 예전처럼 «안 들렸어요»(no_audio)로 끝나고 안 보낸다', () => {
    assert.deepEqual(r.sent, []); assert.deepEqual(r.requests, []); assert.ok(r.states.includes('error'), JSON.stringify(r.states));
  });
}
{
  const r = await micCase({ early: false });
  await check('④-8 짝: 미리 받기 모듈이 없으면 예전 그대로 (끝에서 한 번 · 전체로 판정)', () => {
    assert.deepEqual(r.requests, ['fin+strict']); assert.deepEqual(r.checks, ['fin']); assert.deepEqual(r.sent, ['I like pizza.']);
  });
}

/* ─────────────── ⑤ 화면 — 입모양 분석 엔진 ─────────────── */
console.log('\n⑤ 화면 — 입모양 분석 엔진을 켠다 (2026-11-09 사장님 「다시 켜줘」 · ?visemes=off 면 끔)');
const visA = HTML.indexOf('    var _afVisHold = (function(){');
const visB = HTML.indexOf("window.addEventListener('load', _afVisemeWrap);", visA);
const visCode = visA > 0 && visB > visA ? HTML.slice(visA, visB) + "window.addEventListener('load', _afVisemeWrap);" : '';
await check('⑤-0 (전제) 입모양 스위치를 오려 냈다', () => assert.ok(visCode.length > 300));
function visCase(search) {
  const n = { prep: 0, boot: 0 }; const V = { prepare: () => { n.prep++; return Promise.resolve('cues'); }, boot: () => { n.boot++; } };
  const ctx = vm.createContext({ Promise, location: { search }, document: { readyState: 'complete', addEventListener() {} } });
  ctx.window = { AvatarVisemes: V, addEventListener() {} };
  vm.runInContext(visCode, ctx);
  return { V: ctx.window.AvatarVisemes, n };
}
{
  const r = visCase(''); const got = await r.V.prepare('blob:x'); r.V.boot();
  await check('⑤-1 기본: 입모양을 분석하고(prepare 원래대로) 엔진도 켠다(boot) — 2026-11-09 다시 켬', () => {
    assert.equal(got, 'cues'); assert.deepEqual(r.n, { prep: 1, boot: 1 });
  });
}
{
  const r = visCase('?visemes=off'); const got = await r.V.prepare('blob:x'); r.V.boot();
  await check('⑤-2 짝: ?visemes=off 면 prepare 는 곧바로 null · boot 는 안 켠다 (비교용 끄기)', () => {
    assert.equal(got, null); assert.deepEqual(r.n, { prep: 0, boot: 0 });
  });
}
{
  const r = visCase('?visemes=now'); const got = await r.V.prepare('blob:x');
  await check('⑤-3 옛 스위치 ?visemes=now 도 «켬» 그대로 (옛 북마크가 꺼지지 않는다)', () => { assert.equal(got, 'cues'); assert.equal(r.n.prep, 1); });
}

/* ─────────────── ⑥ 자동 말하기 — 마이크 여는 대기 ─────────────── */
console.log('\n⑥ 자동 말하기 — AI 말이 끝난 뒤 마이크를 여는 대기 (웜업과 같은 값)');
const WARM = read('public/js/warmup-auto-talk.js');
const warmAndroid = Number((WARM.match(/ARM_DELAY_MS = ANDROID \? (\d+) : (\d+)/) || [])[1]);
const warmOther = Number((WARM.match(/ARM_DELAY_MS = ANDROID \? (\d+) : (\d+)/) || [])[2]);
await check('⑥-0 (전제) 웜업 값을 소스에서 읽었다', () => assert.ok(warmAndroid > 0 && warmOther > 0));
function autoCase(ua) {
  const timers = [], opened = [];
  const el = () => ({ addEventListener() {}, setAttribute() {}, dataset: {}, set innerHTML(v) {}, hidden: false, textContent: '', blur() {}, value: '' });
  const els = {};
  const ctx = { navigator: { userAgent: ua }, localStorage: { getItem: () => 'auto', setItem() {} },
    document: { getElementById: id => els[id] || (els[id] = el()), addEventListener() {}, hidden: false, activeElement: null, body: { classList: { contains: () => false } } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    isEn: () => false, isSoundOn: () => true, updateSoundBtn() {}, cancelFriendMic() {}, _whisperOn: false,
    micViaWhisper: auto => opened.push(auto), MangoiVoice: { busy: () => false }, MangoiTTS: { getAudioEl: () => null }, speechSynthesis: null };
  ctx.window = ctx; ctx.window.parent = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx); vm.runInContext(AUTO, ctx);
  const A = ctx.FriendAutoTalk; A.press(); const id = A.aiStart(); A.aiDone(id);
  const t = timers[timers.length - 1]; if (t) t.fn();
  return { ms: t && t.ms, opened };
}
{
  const a = autoCase('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36');
  const i = autoCase('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
  const p = autoCase('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36');
  await check('⑥-1 안드로이드: 웜업과 같은 값으로 연다 (' + warmAndroid + 'ms)', () => assert.equal(a.ms, warmAndroid));
  await check('⑥-2 아이폰·PC: 웜업과 같은 값으로 연다 (' + warmOther + 'ms — 블루투스 잔향)', () => { assert.equal(i.ms, warmOther); assert.equal(p.ms, warmOther); });
  await check('⑥-3 그 대기가 끝나면 실제로 마이크를 연다 (자동 모드)', () => { assert.deepEqual(a.opened, [true]); assert.deepEqual(i.opened, [true]); });
  await check('⑥-4 어떤 기기도 200ms 아래로 내리지 않는다 (스피커 잔향)', () => assert.ok(a.ms >= 200 && i.ms >= 200 && p.ms >= 200));
}

raw.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
