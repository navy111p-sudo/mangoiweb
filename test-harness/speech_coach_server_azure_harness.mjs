#!/usr/bin/env node
/* 음성 코칭: 서버 Azure 채점 + 브라우저 SDK 폴백 (2026-11-09 사장님 결정)
 * Speech coach: server-side Azure scoring with browser-SDK fallback
 *
 * ① 화면 processAudio 를 소스에서 오려 내 가짜 fetch·가짜 SDK 로 «실제로» 돌린다
 *    — 서버가 점수를 주면 SDK 를 안 부르고, 서버가 Azure 에 못 닿았을 때만 SDK 를 부르는지(짝)
 *    — reference·토큰을 보내고 prompt 는 안 보내는지
 * ② 서버 정본 assessPronunciation 을 묶어 실제 Azure 응답(fixtures/azure-rest/prosody.json,
 *    2026-11-09 Korea Central · 합성 음성)으로 운율 값을 읽는지, 켤 때만 켜는지
 * ③ 전사 창구(transcribe)가 운율을 켜서 부르는지 · AI 친구 낱말 짚기는 안 켜는지
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CF = join(ROOT, 'cloudflare-deploy');
const SRC = join(CF, 'src');
const HTML_FILE = process.env.SC_HTML || join(CF, 'public', 'speech-coach.html');
const SRC_DIR = process.env.SC_SRC || SRC;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
};
const done = () => { console.log(`결과: PASS ${pass} / FAIL ${fail}`); process.exit(fail ? 1 : 0); };

/* ── ① 화면 ─────────────────────────────────────────────────────────── */
const html = readFileSync(HTML_FILE, 'utf8');
const a = html.indexOf('async function processAudio(blob)');
const b = html.indexOf('async function checkGrammar(', a);
const code = a > 0 && b > a ? html.slice(a, b) : '';
ok('전제: processAudio 를 오려 냈다', code.length > 500);

const TARGET = 'Hello, I am a student.';
const SDK_OK = { ok: true, accuracy: 90, fluency: 88, completeness: 100, pron: 89, prosody: 70, text: 'Hello I am a student.', words: [] };
const SRV_OK = { ok: true, scoreFieldsPresent: true, accuracy: 98, fluency: 98, completeness: 100, pron: 93, prosody: 83, text: 'Hello I am a student.', words: [] };

async function runScreen({ srv, token = 'tok123', whisperText = 'hello i am student' }) {
  const calls = { sdk: 0, transcribe: null, coach: null };
  const el = () => new Proxy({ style: {}, classList: { add() {}, remove() {} }, textContent: '', innerHTML: '', value: '' }, {
    get: (o, k) => (k in o ? o[k] : (k === 'scrollIntoView' ? () => {} : undefined)),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const nodes = {};
  const doc = { getElementById: id => { nodes[id] = nodes[id] || el(); if (id === 'target-display') nodes[id].textContent = TARGET; return nodes[id]; }, querySelector: () => el(), querySelectorAll: () => [] };
  const store = token ? { mango_token: token } : {};
  const stubs = {
    document: doc,
    window: { getLang: () => 'ko' },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem() {} },
    detectTtsLang: () => 'en',
    mgAcctUid: () => (token ? 'stu1' : ''),
    mgAcctName: () => '',
    azAssess: async () => { calls.sdk++; return SDK_OK; },
    setTimeout: () => 0,
    fetch: async (url, init = {}) => {
      if (url === '/api/voice/transcribe') {
        calls.transcribe = { form: init.body, headers: init.headers || {} };
        const body = srv === 'dropped'
          ? { ok: true, text: '', dropped: 'no_speech', azure: null, azure_diag: 'dropped' }
          : { ok: true, text: whisperText, lang: 'en', azure: srv && srv.ok ? srv : null, azure_diag: srv && srv.ok ? 'ok' : (srv && srv.reason) || 'none' };
        return { ok: true, json: async () => body };
      }
      if (url === '/api/voice/coach') { calls.coach = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: false, error: 'harness_stop' }) }; }
      return { ok: true, json: async () => ({ ok: false }) };
    },
  };
  /* 모르는 이름은 아무 일도 안 하는 함수 — 화면 그리기는 이 검사의 대상이 아니다 */
  const noop = new Proxy(function () {}, { get: () => noop, apply: () => undefined });
  const scope = new Proxy(stubs, {
    has: (o, k) => typeof k === 'string' && !(k in globalThis && !(k in o)),
    get: (o, k) => (k in o ? o[k] : (k === Symbol.unscopables ? undefined : noop)),
  });
  let fn;
  try { fn = new Function('scope', 'with (scope) { return (' + code.replace(/^async function processAudio/, 'async function') + '); }')(scope); }
  catch (e) { return { err: 'compile ' + e.message, calls }; }
  try { await fn(new Blob([new Uint8Array(200)], { type: 'audio/wav' })); }
  catch (e) { return { err: 'run ' + e.message, calls }; }
  return { calls, status: nodes['rec-status'] && nodes['rec-status'].textContent };
}

{
  const r = await runScreen({ srv: SRV_OK });
  ok('전제: 화면을 끝까지 돌렸다(코치 요청까지)', !r.err && r.calls.coach, r.err);
  const f = r.calls.transcribe && r.calls.transcribe.form;
  ok('모범 문장을 reference 로 보낸다', f && f.get && f.get('reference') === TARGET);
  ok('⛔ prompt(Whisper 힌트)는 여전히 안 보낸다 (07-29 만점 사고)', f && f.get && f.get('prompt') === null);
  ok('로그인 학생은 토큰을 Authorization 으로 싣는다', r.calls.transcribe && r.calls.transcribe.headers.Authorization === 'Bearer tok123');
  ok('서버가 점수를 주면 브라우저 SDK 를 안 부른다', r.calls.sdk === 0, 'sdk=' + r.calls.sdk);
  ok('  그 서버 점수(운율 포함)를 코치에 넘긴다', r.calls.coach && r.calls.coach.azure && r.calls.coach.azure.prosody === 83 && r.calls.coach.azure.accuracy === 98);
  ok('  기록 사유는 ok(server)', r.calls.coach && /^ok\(server\)/.test(r.calls.coach.azure_diag), r.calls.coach && r.calls.coach.azure_diag);
  ok('  채점 글자는 Azure 전사', r.calls.coach && r.calls.coach.spoken === SRV_OK.text);
}
{
  const r = await runScreen({ srv: SRV_OK, token: '' });
  ok('비로그인은 Authorization 을 안 싣는다', !r.err && r.calls.transcribe && !('Authorization' in r.calls.transcribe.headers), r.err);
}
/* recog_Error(Azure 내부 오류 — «다시 해 보라» 는 상태)·recog_unknown 은 «말 없음» 이 아니라서 SDK 로 다시 잰다 */
for (const reason of ['http_401 ', 'timeout', 'no_key', 'dropped', 'not_wav', 'recog_Error', 'recog_unknown']) {
  const r = await runScreen({ srv: reason === 'dropped' ? 'dropped' : { ok: false, reason } });
  ok(`서버 실패(${reason.trim()})면 브라우저 SDK 로 한 번 더 잰다`, !r.err && r.calls.sdk === 1, r.err || 'sdk=' + r.calls.sdk);
  ok(`  그때 사유에 서버·SDK 둘 다 남는다 (${reason.trim()})`, r.calls.coach && /^server:.+\|ok\(sdk\)/.test(r.calls.coach.azure_diag), r.calls.coach && r.calls.coach.azure_diag);
}
for (const reason of ['recog_no_words', 'recog_NoMatch', 'recog_InitialSilenceTimeout', 'recog_BabbleTimeout', 'too_long']) {
  const r = await runScreen({ srv: { ok: false, reason } });
  ok(`서버가 «말 없음·너무 김»(${reason}) 이면 SDK 로 다시 안 묻는다`, !r.err && r.calls.sdk === 0, r.err || 'sdk=' + r.calls.sdk);
  ok(`  점수 없이 Whisper 글자로 채점 (${reason})`, r.calls.coach && r.calls.coach.azure === null && r.calls.coach.spoken === 'hello i am student'
     && r.calls.coach.azure_diag === 'server:' + reason + '|sdk:skip', r.calls.coach && r.calls.coach.azure_diag);
}

/* ── ② 서버 정본 ────────────────────────────────────────────────────── */
const tmp = mkdtempSync(join(tmpdir(), 'sc-azure-'));
const entry = join(tmp, 'entry.ts');
const from = f => JSON.stringify(join(SRC_DIR, f));
writeFileSync(entry, `export { assessPronunciation } from ${from('azure-pronunciation')};\nexport { assessPronFix } from ${from('pron-focus')};\n`);
const out = join(tmp, 'bundle.mjs');
let M = null;
try {
  const esbuild = createRequire(join(CF, 'package.json'))('esbuild');
  esbuild.buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
  M = await import(pathToFileURL(out).href);
} catch (e) {
  console.log('SKIP ② 서버 정본 — esbuild 없음/실패: ' + String(e.message).slice(0, 80));
}
if (M) {
  const FX = join(ROOT, 'test-harness', 'fixtures', 'azure-rest');
  const fx = n => JSON.parse(readFileSync(join(FX, n + '.json'), 'utf8'));
  ok('전제: 고정 응답이 실제 모양(평평한 ProsodyScore)이다', typeof fx('prosody').NBest[0].ProsodyScore === 'number' && !fx('prosody').NBest[0].PronunciationAssessment);
  const wav = () => {
    const n = 16000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    return buf;
  };
  const env = { AZURE_SPEECH_KEY: 'x'.repeat(32), AZURE_SPEECH_REGION: 'koreacentral' };
  const run = async (body, lang, opts) => {
    const seen = [];
    globalThis.fetch = async (u, init) => { seen.push(JSON.parse(Buffer.from(init.headers['Pronunciation-Assessment'], 'base64').toString('utf8'))); return new Response(JSON.stringify(body)); };
    const r = await M.assessPronunciation(env, wav(), 'Hello, I am a student.', lang, opts);
    return { r, cfg: seen[0] || {} };
  };
  let x = await run(fx('prosody'), 'en', { prosody: true });
  ok('운율을 켜면 요청에 EnableProsodyAssessment 가 실린다', x.cfg.EnableProsodyAssessment === true);
  ok('  실제 응답의 ProsodyScore 83.4 → 83', x.r.ok && x.r.prosody === 83, JSON.stringify(x.r.prosody));
  ok('  다른 점수는 그대로 읽는다', x.r.ok && x.r.accuracy === 98 && x.r.fluency === 98 && x.r.completeness === 100);
  x = await run(fx('normal'), 'en', undefined);
  ok('안 켜면 요청에 운율이 없다(기본값)', !('EnableProsodyAssessment' in x.cfg));
  ok('  운율이 안 온 응답은 null — 0 을 지어내지 않는다', x.r.ok && x.r.prosody === null, JSON.stringify(x.r.prosody));
  x = await run(fx('normal'), 'zh', { prosody: true });
  ok('운율은 en-US 만 — 중국어로 켜도 요청에 안 싣는다', !('EnableProsodyAssessment' in x.cfg));
  const bad = JSON.parse(JSON.stringify(fx('prosody'))); bad.NBest[0].ProsodyScore = 'x';
  x = await run(bad, 'en', { prosody: true });
  ok('운율 값이 이상하면 null', x.r.ok && x.r.prosody === null);
  /* AI 친구 낱말 짚기는 운율을 켜지 않는다 — 낱말 하나 기준이라 의미가 없고 지연만 는다 */
  const seen = [];
  globalThis.fetch = async (u, init) => { seen.push(JSON.parse(Buffer.from(init.headers['Pronunciation-Assessment'], 'base64').toString('utf8'))); return new Response(JSON.stringify(fx('normal'))); };
  const b64 = Buffer.from(new Uint8Array(wav())).toString('base64');
  await M.assessPronFix(env, b64, 'student');
  ok('AI 친구 발음 짚기는 운율을 안 켠다', seen.length === 1 && !('EnableProsodyAssessment' in seen[0]), 'calls=' + seen.length);
}

/* ── ③ 전사 창구 배선 ───────────────────────────────────────────────── */
const games = readFileSync(join(SRC_DIR, 'api-games-voice.ts'), 'utf8');
const ra = games.indexOf('const runAzure = async');
/* 중괄호 짝으로 자른다 — 안에 «return { …};» 가 있어 «첫 }; » 로 자르면 몸통이 잘린다 */
const bodyAt = (src, from) => {
  const o = src.indexOf('{', src.indexOf('=>', from)); if (o < 0) return '';
  let d = 0, q = '';
  for (let i = o; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '{') d++;
    else if (c === '}' && --d === 0) return src.slice(o, i + 1);
  }
  return '';
};
const raBody = ra > 0 ? bodyAt(games, ra) : '';
ok('전제: runAzure 몸통을 잘라 냈다', /catch/.test(raBody) && /no_reference/.test(raBody));
/* 주석을 벗긴 사본으로 판정한다 — 설명 주석에 «paReference» 가 들어가도, 주석 처리된 호출이 남아도 헛돌지 않게.
   문자열 안의 // (https://) 는 지우지 않는다(글자를 훑으며 문자열 안인지 따라간다) */
const strip = src => {
  let o = '', q = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) { o += c; if (c === '\\') { o += n || ''; i++; } else if (c === q) q = ''; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; o += '\n'; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    o += c;
  }
  return o;
};
/* 여는 괄호부터 짝이 맞는 닫는 괄호까지 */
const spanAt = (src, o, open, close) => {
  if (o < 0 || src[o] !== open) return '';
  let d = 0, q = '';
  for (let i = o; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === open) d++;
    else if (c === close && --d === 0) return src.slice(o, i + 1);
  }
  return '';
};
const raLive = strip(raBody);
const callAt = raLive.indexOf('assessPronunciation(');
const callArgs = callAt >= 0 ? spanAt(raLive, callAt + 'assessPronunciation'.length, '(', ')') : '';
ok('전제: runAzure 안의 assessPronunciation 호출 인자를 잘라 냈다', callArgs.length > 10, callArgs);
ok('전사 창구가 모범 문장(paReference)으로 Azure 를 부른다', /\bpaReference\b/.test(callArgs));
ok('  그때 운율을 켠다(prosody: true)', /\bprosody\s*:\s*true\b/.test(callArgs));
const gLive = strip(games);
const tp = gLive.indexOf('const turboParams');
const tpObj = tp >= 0 ? spanAt(gLive, gLive.indexOf('{', tp), '{', '}') : '';
ok('전제: Whisper 요청 객체(turboParams)를 잘라 냈다', /language/.test(tpObj) && /task/.test(tpObj), tpObj.slice(0, 80));
ok('⛔ 모범 문장은 Whisper 요청 객체에 안 들어간다', !/\bpaReference\b/.test(tpObj));
ok('⛔ 나중에 turboParams 에 붙이는 값도 paReference 가 아니다', !/turboParams\s*(\.\w+|\[[^\]]*\])\s*=[^;]*\bpaReference\b/.test(gLive));
ok('⛔ initial_prompt 는 hintPrompt 에서만 오고 hintPrompt 는 reference 를 안 받는다', !/hintPrompt\s*=[^;]*(paReference|'reference')/.test(gLive));

/* ── ④ 실제 전사 창구 실행 — «기록된 연습» 은 하루를 한 번으로 센다 ───────────────────
   진짜 SQLite + 진짜 토큰 검증 + 진짜 handleVoiceApi. Whisper·Azure 만 고정 응답이다. */
let V = null;
try {
  const { DatabaseSync } = await import('node:sqlite');
  const ventry = join(tmp, 'ventry.ts'), vout = join(tmp, 'ventry.mjs');
  writeFileSync(ventry, ['speaking-growth', 'api-games-voice', 'auth-token'].map(n => `export * from ${from(n)};`).join('\n'));
  createRequire(join(CF, 'package.json'))('esbuild').buildSync({ entryPoints: [ventry], outfile: vout, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  V = { M: await import(pathToFileURL(vout).href), DatabaseSync };
} catch (e) { console.log('SKIP ④ 전사 창구 실행 — 준비 실패: ' + String(e.message).slice(0, 100)); }
if (V) {
  const sq = new V.DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), async first() { return sq.prepare(sql).get(...args) || null; },
    async all() { return { results: sq.prepare(sql).all(...args) }; },
    async run() { const r = sq.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } });
  const kv = new Map();
  const FX = join(ROOT, 'test-harness', 'fixtures', 'azure-rest');
  const env = { DB: { prepare: stmt, async exec(x) { for (const l of x.split('\n')) if (l.trim()) sq.exec(l); } },
    ROOM_JWT_SECRET: 'isolated-speech-coach-fixture', SESSION_STATE: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); } },
    AZURE_SPEECH_KEY: 'x'.repeat(32), AZURE_SPEECH_REGION: 'koreacentral',
    AI: { async run() { return { text: 'Hello I am a student.' }; } } };
  const token = await V.M.signUidToken('coach-user', env);
  const wavOf = seed => { const n = 16000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
    v.setInt16(44, seed, true); return buf; };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(readFileSync(join(FX, 'prosody.json'), 'utf8'), { headers: { 'Content-Type': 'application/json' } });
  const say = async (seed, ref, tok = token) => {
    const fd = new FormData(); fd.append('audio', new Blob([wavOf(seed)], { type: 'audio/wav' }), 'rec.wav'); fd.append('lang', 'en'); fd.append('reference', ref);
    const u = new URL('https://local.test/api/voice/transcribe');
    const r = await V.M.handleVoiceApi(new Request(u, { method: 'POST', body: fd, headers: tok ? { Authorization: 'Bearer ' + tok } : {} }), u, env);
    return r.json();
  };
  try {
    const first = await say(1, 'Hello, I am a student.');
    ok('전사 창구가 서버 Azure 점수를 돌려준다(운율 포함)', first.ok && first.azure && first.azure.prosody === 83 && first.azure_diag === 'ok', JSON.stringify({ d: first.azure_diag, p: first.azure && first.azure.prosody }));
    await say(2, 'I like apples.'); await say(3, 'My dog is big.');
    const g = await V.M.readSpeakingGrowth(env.DB, 'coach-user', 0, Date.now() + 1000);
    ok('같은 날 세 문장 → 확인된 결과 3건', g && g.reading.samples === 3, JSON.stringify(g && g.reading));
    ok('  «기록된 연습» 은 1회(하루 = 한 번) — 녹음마다 따로 세지 않는다', g && g.sessions === 1, 'sessions=' + (g && g.sessions));
    await say(3, 'My dog is big.');
    ok('같은 소리를 다시 보내도 한 건만 남는다', (await V.M.readSpeakingGrowth(env.DB, 'coach-user', 0, Date.now() + 1000)).reading.samples === 3);
    await say(4, 'Hello, I am a student.', '');
    ok('비로그인은 기록하지 않는다', sq.prepare('SELECT COUNT(*) n FROM speaking_growth_events').get().n === 3);
  } catch (e) { ok('④ 전사 창구 실행이 던지지 않는다', false, String(e && e.stack || e).slice(0, 300)); }
  finally { globalThis.fetch = realFetch; }
}

done();
