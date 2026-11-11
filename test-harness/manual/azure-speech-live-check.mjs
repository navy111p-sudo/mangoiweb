#!/usr/bin/env node
/* 실제 Azure 발음평가 점검 (사람이 부름 · 자동 게이트 아님)
 * Real Azure pronunciation-assessment check (manual · not a CI gate)
 *
 * - 합성 음성(ffmpeg flite)만 씁니다 — 학생·사람 목소리 없음 / synthetic voice only, no real people
 * - 서버 정본 assessPronunciation · referenceReadingEvidence 를 그대로 묶어 돌립니다
 * - 키 값은 어디에도 찍지 않습니다. 원격 컨테이너는 프록시가 헤더를 넣어 주므로
 *   AZURE_SPEECH_KEY 가 없으면 자리표시 값으로 부릅니다(프록시가 덮어씀).
 * - 운영 DB·KV·R2 를 쓰지 않습니다 / touches no production DB, KV or R2
 *
 *   node test-harness/manual/azure-speech-live-check.mjs
 *   AZURE_SPEECH_REGION=koreacentral (기본) · AZURE_SPEECH_KEY=<테스트 키> (로컬 PC)
 *   또는 키 없이: AZURE_TOKEN_URL=https://mangoi.ai/api/voice/azure-token (공개 10분 토큰)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CF = join(ROOT, 'cloudflare-deploy');
const tmp = mkdtempSync(join(tmpdir(), 'azure-live-'));

/* 정본 두 함수를 번들 — 하니스에 베끼지 않는다 */
const entry = join(tmp, 'entry.ts');
writeFileSync(entry, `export { assessPronunciation } from '${CF}/src/azure-pronunciation';\n`
  + `export { referenceReadingEvidence } from '${CF}/src/speaking-audio-evidence';\n`
  + `export { pronFixFromResult } from '${CF}/src/pron-focus';\n`);
const out = join(tmp, 'bundle.mjs');
execFileSync(join(CF, 'node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + out], { stdio: 'pipe' });
const { assessPronunciation, referenceReadingEvidence, pronFixFromResult } = await import(out);

function wav(name, args) {
  const f = join(tmp, name + '.wav');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', f]);
  const b = readFileSync(f);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
const say = (text, extra = []) => ['-f', 'lavfi', '-i', `flite=text='${text}':voice=slt`, ...extra];

const REF = 'Hello, I am a student.';
const CASES = [
  { id: 'normal',  ref: REF, audio: () => wav('normal', say(REF)), expect: 'ok' },
  { id: 'wrong',   ref: REF, audio: () => wav('wrong', say('I like pizza very much.')), expect: 'ok-low' },
  { id: 'partial', ref: REF, audio: () => wav('partial', say('Hello, I am')), expect: 'ok-low' },
  { id: 'slow',    ref: REF, audio: () => wav('slow', say(REF, ['-af', 'atempo=0.6'])), expect: 'ok' },
  { id: 'silence', ref: REF, audio: () => wav('silence', ['-f', 'lavfi', '-t', '3', '-i', 'anullsrc=r=16000:cl=mono']), expect: 'fail' },
  { id: 'noise',   ref: REF, audio: () => wav('noise', ['-f', 'lavfi', '-t', '3', '-i', 'anoisesrc=r=16000:a=0.3:c=white']), expect: 'fail-or-low' },
  { id: 'too_long', ref: REF, audio: () => wav('long', ['-f', 'lavfi', '-t', '30', '-i', 'anullsrc=r=16000:cl=mono']), expect: 'too_long' },
  /* AI 친구 «집중 교정»: 기준은 낱말 하나, 녹음은 문장 전체 (pron-focus.ts 와 같은 호출) */
  { id: 'focus_ok',  ref: 'student', focus: 'student', audio: () => wav('focus_ok', say(REF)), expect: 'ok' },
  { id: 'focus_bad', ref: 'student', focus: 'student', audio: () => wav('focus_bad', say('I am a stoo dint.')), expect: 'ok' },
];

const env = {
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || 'proxy-injected-placeholder-key',
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'koreacentral',
};

/* 키 없이 재기: AZURE_TOKEN_URL=https://mangoi.ai/api/voice/azure-token
 * 학생 브라우저가 받는 공개 10분 토큰을 받아, 정본이 보내는 요청에서 키 헤더만 토큰으로 바꿉니다.
 * 나머지(발음평가 헤더·본문·응답 해석)는 정본 그대로 — 토큰 값은 찍지 않습니다. */
if (process.env.AZURE_TOKEN_URL) {
  const t = await (await fetch(process.env.AZURE_TOKEN_URL)).json();
  if (!t.ok || !t.token) { console.log('⚠ 토큰을 못 받았습니다:', t.error || 'unknown'); process.exit(2); }
  env.AZURE_SPEECH_REGION = t.region;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, init = {}) => {
    if (!/\.stt\.speech\.microsoft\.com\//.test(String(u))) return realFetch(u, init);
    const h = { ...(init.headers || {}) };
    delete h['Ocp-Apim-Subscription-Key'];
    h.Authorization = 'Bearer ' + t.token;
    return realFetch(u, { ...init, headers: h });
  };
}

let authFail = false;
const rows = [];
for (const c of CASES) {
  const t0 = Date.now();
  const r = await assessPronunciation(env, c.audio(), c.ref, 'en');
  const ms = Date.now() - t0;
  const ev = referenceReadingEvidence(r, c.ref, 'en');
  if (!r.ok && /^http_40[13]/.test(r.reason)) authFail = true;
  rows.push({
    case: c.id, expect: c.expect, ms,
    ok: r.ok, reason: r.ok ? '' : String(r.reason).slice(0, 90),
    acc: r.ok ? r.accuracy : null, flu: r.ok ? r.fluency : null,
    comp: r.ok ? r.completeness : null, pron: r.ok ? r.pron : null,
    fields: r.ok ? r.scoreFieldsPresent : null,
    heard: r.ok ? r.text.slice(0, 40) : '',
    evidence: ev ? `pron ${ev.skills.pronunciation} / flu ${ev.skills.fluency}` : '—',
    focus: c.focus ? JSON.stringify(r.ok ? { w: r.words.find(w => w.word.toLowerCase() === c.focus), fix: pronFixFromResult(r, c.focus) } : null) : '',
  });
}
/* 같은 음성 두 번 — 결과가 흔들리는지(재시도 안정성) */
const again = await assessPronunciation(env, wav('normal2', say(REF)), REF, 'en');
console.table(rows);
console.log('retry normal:', again.ok ? `acc ${again.accuracy} flu ${again.fluency}` : again.reason);
if (authFail) {
  console.log('⚠ Azure 가 키를 거절했습니다(401/403). 키·지역(koreacentral)·헤더(Ocp-Apim-Subscription-Key)를 확인하세요.');
  process.exit(2);
}
const bad = rows.filter(r =>
  (r.expect === 'ok' && !(r.ok && r.fields)) ||
  (r.expect === 'too_long' && r.reason !== 'too_long') ||
  (r.expect === 'fail' && r.evidence !== '—'));
console.log(bad.length ? `⚠ 기대와 다름: ${bad.map(b => b.case).join(', ')}` : '✅ 기대대로');
process.exit(bad.length ? 1 : 0);
