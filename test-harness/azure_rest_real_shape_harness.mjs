#!/usr/bin/env node
/* Azure REST 실제 응답 모양 회귀 하니스 (2026-11-08)
 * Regression harness: real Azure REST response shape
 *
 * fixtures/azure-rest/*.json 은 2026-11-08 Korea Central 실제 응답 그대로입니다(합성 음성, 개인정보 없음).
 * REST 는 점수를 «평평하게» 줍니다: NBest[0].AccuracyScore · Words[].AccuracyScore/ErrorType.
 * 예전 정본은 PronunciationAssessment 중첩만 읽어 늘 no_assessment 였고, 기존 하니스는
 * «코드가 기대한 모양» 으로 가짜 응답을 만들어 그 버그를 못 봤습니다 — 여기는 실제 모양만 씁니다.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const FX = join(ROOT, 'test-harness', 'fixtures', 'azure-rest');
const tmp = mkdtempSync(join(tmpdir(), 'azure-rest-'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

/* 경로는 JSON.stringify 로 — Windows 역슬래시가 문자열 이스케이프로 먹히지 않게. esbuild 는 저장소 것(고정판). */
const entry = join(tmp, 'entry.ts');
const from = f => JSON.stringify(join(SRC, f));
writeFileSync(entry, `export { assessPronunciation } from ${from('azure-pronunciation')};\n`
  + `export { referenceReadingEvidence } from ${from('speaking-audio-evidence')};\n`
  + `export { pronFixFromResult } from ${from('pron-focus')};\n`);
const out = join(tmp, 'bundle.mjs');
let M;
try {
  const esbuild = createRequire(join(ROOT, 'cloudflare-deploy', 'package.json'))('esbuild');
  esbuild.buildSync({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
  M = await import(pathToFileURL(out).href);
} catch (e) { ok('전제: 정본을 묶었다', false, e.message); console.log(`결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

const fx = n => JSON.parse(readFileSync(join(FX, n + '.json'), 'utf8'));
/* 16kHz mono 16bit PCM WAV 1초(무음) — 정본의 형식 검사만 통과시키면 된다(응답은 가짜 fetch 가 준다) */
function wav() {
  const n = 16000, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
  return b;
}
const env = { AZURE_SPEECH_KEY: 'x'.repeat(32), AZURE_SPEECH_REGION: 'koreacentral' };
const REF = 'Hello, I am a student.';
/* body 가 배열이면 n 번째 호출에 n 번째 응답(재시도 경로를 실제 모양으로 재기 위해) */
async function run(body) {
  let calls = 0;
  globalThis.fetch = async () => { const b = Array.isArray(body) ? body[Math.min(calls, body.length - 1)] : body; calls++; return new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json' } }); };
  const r = await M.assessPronunciation(env, wav(), REF, 'en');
  return { r, calls };
}

/* ⓪ 전제: 고정 파일이 정말 «평평한» 실제 모양이다 — 누가 중첩으로 바꿔 넣으면 이 하니스가 뜻을 잃는다 */
for (const n of ['normal', 'partial', 'wrong', 'noise']) {
  const b = fx(n).NBest[0];
  ok(`⓪ ${n}: 실제 응답은 PronunciationAssessment 중첩이 없다`, !('PronunciationAssessment' in b) && typeof b.AccuracyScore === 'number');
}

/* ① 정상 낭독 — 점수·단어·음소를 읽고 근거가 된다 (예전 코드: no_assessment2) */
{
  const { r, calls } = await run(fx('normal'));
  ok('① normal: ok', r.ok === true, r.reason);
  ok('① normal: 점수 98/98/100/98', r.accuracy === 98 && r.fluency === 98 && r.completeness === 100 && r.pron === 98, JSON.stringify(r));
  ok('① normal: 점수 칸이 다 있음', r.scoreFieldsPresent === true);
  ok('① normal: 재시도 없음(한 번 호출)', calls === 1, String(calls));
  ok('① normal: 단어 정확도·오류 종류를 읽음', r.words?.[0]?.word === 'hello' && r.words[0].accuracy === 94 && r.words[0].errorType === 'None', JSON.stringify(r.words?.[0]));
  ok('① normal: 음소 점수를 읽음(0 이 아님)', r.words?.[0]?.phonemes?.length > 0 && r.words[0].phonemes.some(p => p.acc > 0), JSON.stringify(r.words?.[0]?.phonemes));
  const ev = M.referenceReadingEvidence(r, REF, 'en');
  ok('① normal: 읽기 근거가 됨', ev?.skills?.pronunciation === 98 && ev.skills.fluency === 98, JSON.stringify(ev));
}

/* ② 일부만 읽음 — 빠진 말은 Omission, 낮은 완성도 */
{
  const { r } = await run(fx('partial'));
  ok('② partial: ok·완성도 60', r.ok === true && r.completeness === 60, JSON.stringify(r));
  ok('② partial: 빠진 «student» 는 Omission', r.words?.find(w => w.word === 'student')?.errorType === 'Omission');
  ok('② partial: 빠뜨림은 발음 교정 대상이 아님', M.pronFixFromResult(r, 'student') === null);
}

/* ③ 다른 문장 — 낮은 점수지만 실제 측정값 */
{
  const { r } = await run(fx('wrong'));
  ok('③ wrong: ok·정확도 48·유창성 29', r.ok === true && r.accuracy === 48 && r.fluency === 29, JSON.stringify(r));
}

/* ④ 잡음 — Azure 는 Success·0점을 주지만 «말 없음» 이다. 점수·근거를 만들지 않는다 */
{
  const { r } = await run(fx('noise'));
  ok('④ noise: recog_no_words 로 거절', r.ok === false && r.reason === 'recog_no_words', JSON.stringify(r));
  ok('④ noise: 근거 없음', M.referenceReadingEvidence(r, REF, 'en') === null);
}

/* ⑤ 짝: Display 에 글자가 없어도 Lexical 에 말이 있으면 측정값이다(«seven» → «7») */
{
  const b = fx('normal'); b.NBest[0].Display = '7.'; b.DisplayText = '7.'; b.NBest[0].Lexical = 'seven';
  const { r } = await run(b);
  ok('⑤ 숫자로 바뀐 말도 측정값으로 받음', r.ok === true && r.accuracy === 98, JSON.stringify(r));
}

/* ⑥ 발음 교정: 실제 모양에서 Mispronunciation·낮은 정확도 낱말을 짚는다 / 잘 읽은 낱말은 안 짚는다 */
{
  const { r } = await run(fx('normal'));
  ok('⑥ 잘 읽은 «student» 는 교정 안 함', M.pronFixFromResult(r, 'student') === null);
  const b = fx('normal'); const w = b.NBest[0].Words.find(x => x.Word === 'student'); w.AccuracyScore = 40; w.ErrorType = 'Mispronunciation';
  const { r: r2 } = await run(b);
  const fix = M.pronFixFromResult(r2, 'student');
  ok('⑥ 틀리게 읽은 «student» 를 짚음', fix?.word === 'student' && fix.accuracy === 40, JSON.stringify(fix));
}

/* ⑦ 짝: SDK 식 중첩 모양도 계속 받는다(기존 하니스·브라우저 SDK 결과와 같은 모양) */
{
  const { r } = await run({ RecognitionStatus: 'Success', NBest: [{ Display: 'Hello I am a student.', Lexical: 'hello i am a student', PronunciationAssessment: { AccuracyScore: 70, FluencyScore: 80, CompletenessScore: 100, PronScore: 75 }, Words: [{ Word: 'hello', PronunciationAssessment: { AccuracyScore: 55, ErrorType: 'Mispronunciation' } }] }] });
  ok('⑦ 중첩 모양: ok·점수', r.ok === true && r.accuracy === 70 && r.words[0].accuracy === 55 && r.words[0].errorType === 'Mispronunciation', JSON.stringify(r));
}

/* ⑧ 점수가 정말 없으면 지어내지 않는다 — 재시도 뒤 no_assessment2 */
{
  const { r, calls } = await run({ RecognitionStatus: 'Success', NBest: [{ Display: 'Hello I am a student.', Lexical: 'hello i am a student' }] });
  ok('⑧ 점수 없음: no_assessment2', r.ok === false && /^no_assessment2/.test(r.reason), JSON.stringify(r));
  ok('⑧ 점수 없음: 한 번만 재시도', calls === 2, String(calls));
}

/* ⑨ 재시도 경로도 실제 «평평한» 모양을 읽는다 — 첫 응답에 점수가 없고 재시도에 실제 응답이 오면 */
{
  const none = { RecognitionStatus: 'Success', NBest: [{ Display: 'Hello I am a student.', Lexical: 'hello i am a student' }] };
  const { r, calls } = await run([none, fx('normal')]);
  ok('⑨ 재시도: 실제 모양 점수를 읽음 98/98/100', r.ok === true && r.accuracy === 98 && r.fluency === 98 && r.completeness === 100 && calls === 2, JSON.stringify(r));
  const { r: rn } = await run([none, fx('noise')]);
  ok('⑨ 재시도: 잡음은 여기서도 recog_no_words', rn.ok === false && rn.reason === 'recog_no_words', JSON.stringify(rn));
}

/* ⑩ 점수가 «일부만» 오면 빠진 칸을 0 으로 지어내지 않는다(재시도의 기본 Dimension 은 정확도만 줄 수 있음) */
{
  const part = fx('normal'); for (const k of ['FluencyScore', 'CompletenessScore', 'PronScore']) delete part.NBest[0][k];
  const { r, calls } = await run(part);
  ok('⑩ 일부 점수: ok 로 내보내지 않음', r.ok === false && /^no_assessment2/.test(r.reason) && calls === 2, JSON.stringify(r));
}

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
