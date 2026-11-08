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
for (const reason of ['http_401 ', 'timeout', 'no_key', 'dropped', 'not_wav']) {
  const r = await runScreen({ srv: reason === 'dropped' ? 'dropped' : { ok: false, reason } });
  ok(`서버 실패(${reason.trim()})면 브라우저 SDK 로 한 번 더 잰다`, !r.err && r.calls.sdk === 1, r.err || 'sdk=' + r.calls.sdk);
  ok(`  그때 사유에 서버·SDK 둘 다 남는다 (${reason.trim()})`, r.calls.coach && /^server:.+\|ok\(sdk\)/.test(r.calls.coach.azure_diag), r.calls.coach && r.calls.coach.azure_diag);
}
for (const reason of ['recog_no_words', 'recog_NoMatch', 'too_long']) {
  const r = await runScreen({ srv: { ok: false, reason } });
  ok(`서버가 Azure 에 닿아 «${reason}» 면 SDK 로 다시 안 묻는다`, !r.err && r.calls.sdk === 0, r.err || 'sdk=' + r.calls.sdk);
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
ok('전사 창구가 운율을 켜서 Azure 를 부른다', /assessPronunciation\(\s*env as any,\s*audio,\s*paReference,\s*lang \|\| 'en',\s*\{\s*prosody:\s*true\s*\}\s*\)/.test(raBody));
ok('⛔ 모범 문장은 Whisper 쪽으로 안 간다', (() => { const t = games.indexOf('const turboParams'); return t > 0 && !games.slice(t, t + 900).includes('paReference'); })());

done();
