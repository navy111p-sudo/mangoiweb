#!/usr/bin/env node
/**
 * 🎚 음성코치 채점 «변별력» 보정 하니스 (2026-08-07)
 *
 * ── 왜 만들었나 ────────────────────────────────────────────────────────────
 * 「발음을 뭉개도 점수가 높다」는 지적이 오래 남아 있었다. 원인을 실측해 보니
 * 한 가지가 분명했다 — **소리를 못 들었을 때(음향정보 없음) 텍스트만으로 100점 S** 가 나왔다.
 * S 는 «발음이 완벽하다» 는 주장인데, Whisper 는 웅얼거려도 맞는 글자를 곧잘 뱉으므로
 * 텍스트는 발음의 증거가 못 된다. 못 들은 것을 «완벽» 이라 부르면 안 된다.
 *
 * ── 이 하니스가 지키는 것 (숫자가 아니라 «성질») ──────────────────────────
 *   ① 소리 증거가 없으면 최고 등급(S)이 나오지 않는다
 *   ② 소리가 있을 때, 또렷함이 나빠질수록 종합이 «반드시» 내려간다
 *   ③ 딴말은 아무리 또렷해도 «한 단어 틀림» 을 이기지 못한다
 *   ④ 잡음만 녹음(말이 아님)은 크게 눌린다
 *
 * ⚠️ 여기서 «절대 점수» 는 검사하지 않는다. 절대값은 실제 녹음으로 맞출 값이고,
 *    지금 값은 추정이다. 추정을 하니스에 박으면 나중에 옳게 고쳐도 깨진다.
 *
 * ── 실제 녹음이 생기면 (조정은 10분) ──────────────────────────────────────
 *   1) 학생 녹음 6개만 모은다 — {또렷/보통/뭉갬} × {정확히 읽음 / 한 단어 틀림}
 *   2) 각 녹음의 Whisper 응답에서 segments[].avg_logprob · no_speech_prob · words[] 를 꺼내
 *      아래 PROFILES 자리에 그대로 넣는다(값을 지어내지 말고 응답 그대로).
 *   3) `node test-harness/voice_score_calibration_harness.mjs --table` 로 표를 보고
 *      cloudflare-deploy/src/voice-score.ts 의 ACOUSTIC_TUNING 만 조정한다.
 *   4) 이 하니스가 계속 통과하면 «성질» 은 안 깨진 것이다.
 */
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TS = join(ROOT, 'cloudflare-deploy', 'src', 'voice-score.ts');
const OUT = join(ROOT, 'test-harness', '.calib-voice-score.mjs');

let scoreVoiceCoach, scoreTier;
try {
  // TS 를 esbuild 로 실제 트랜스파일해 import (정규식 스트리핑은 취약 — 다른 음성 하니스와 같은 방식)
  execSync(`npx --yes esbuild "${TS}" --bundle --format=esm --platform=node --outfile="${OUT}"`, { stdio: 'pipe' });
  const mod = await import(pathToFileURL(OUT).href + '?t=' + Date.now());
  scoreVoiceCoach = mod.scoreVoiceCoach; scoreTier = mod.scoreTier;
  if (typeof scoreVoiceCoach !== 'function') throw new Error('scoreVoiceCoach export 없음');
} catch (e) {
  console.error('FAIL: voice-score.ts 컴파일/로드 실패 —', (e && e.message ? String(e.message).split('\n')[0] : e));
  process.exit(1);
} finally {
  try { if (existsSync(OUT)) unlinkSync(OUT); } catch {}
}

// ── 음향 프로필 — 실제 녹음이 생기면 이 자리에 Whisper 응답을 그대로 넣는다 ──
const seg = (lp, ns, words) => ({ start: 0, end: 2.0, avg_logprob: lp, no_speech_prob: ns, words });
const W = (n, gap = 0.15) => {
  const out = []; let t = 0;
  for (let i = 0; i < n; i++) { out.push({ word: 'w' + i, start: t, end: t + 0.28 }); t += 0.28 + gap; }
  return out;
};
// ⚠️ 순서가 곧 «또렷함이 나빠지는 순서» 다. 검사 ②가 이 순서에 기댄다.
const LADDER = [
  ['또렷함', { segments: [seg(-0.20, 0.02, W(4))] }],
  ['보통',   { segments: [seg(-0.60, 0.05, W(4))] }],
  ['뭉갬',   { segments: [seg(-1.00, 0.10, W(4))] }],
];
const NOISE = { segments: [seg(-1.20, 0.85, W(4))] };   // 말이 아닌 소리(no_speech 높음)
const TARGET = 'I have a dog';

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, detail = '') => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (detail ? '  → ' + detail : '')); }
};
const S = (spoken, prof) => scoreVoiceCoach(TARGET, spoken, prof);

console.log('\n════════ 음성코치 채점 변별력 ════════\n');

// ── ① 소리 증거가 없으면 S 가 나오지 않는다 ────────────────────────────
{
  const r = S(TARGET, null);
  check('① 소리를 못 들었으면 최고 등급(S)이 아니다 — 텍스트는 발음의 증거가 못 된다',
    scoreTier(r.overall).tier !== 'S', `종합 ${r.overall} 등급 ${scoreTier(r.overall).tier}`);
  check('① 그래도 «잘한 편»(A 이상)은 유지한다 — 점수를 깎는 게 목적이 아니다',
    r.overall >= 85, `종합 ${r.overall}`);
  check('① 음향 없음이 표시된다 (화면이 «측정함/못함» 을 구분할 수 있게)', r.acoustic === false);
}

// ── ② 소리가 있으면 또렷함이 나빠질수록 종합이 내려간다 ────────────────
{
  const seq = LADDER.map(([, p]) => S(TARGET, p).overall);
  const mono = seq.every((v, i) => i === 0 || v <= seq[i - 1]);
  check('② 또렷할수록 높고, 뭉갤수록 낮다 (단조 감소)', mono, seq.join(' → '));
  check('② 또렷함과 뭉갬 사이에 실제로 차이가 난다 (변별력 있음)',
    (seq[0] - seq[seq.length - 1]) >= 10, `차이 ${seq[0] - seq[seq.length - 1]}점`);
  check('② 또렷하게 정확히 읽으면 최고 등급이 나온다 (S 가 도달 불가능하면 안 된다)',
    scoreTier(S(TARGET, LADDER[0][1]).overall).tier === 'S');
}

// ── ③ 딴말은 또렷해도 «한 단어 틀림» 을 못 이긴다 ──────────────────────
{
  const other = S('the weather is nice today', LADDER[0][1]).overall;   // 딴말인데 또렷
  const oneOff = S('I have a cat', LADDER[2][1]).overall;               // 한 단어 틀림인데 뭉갬
  check('③ 딴말·또렷 < 한단어틀림·뭉갬 (또렷함이 «내용 틀림» 을 덮지 못한다)',
    other < oneOff, `딴말 ${other} vs 한단어틀림 ${oneOff}`);
}

// ── ④ 잡음만 녹음은 크게 눌린다 ────────────────────────────────────────
{
  const noise = S(TARGET, NOISE).overall;
  const clear = S(TARGET, LADDER[0][1]).overall;
  check('④ 말이 아닌 소리(no_speech 높음)는 또렷함이 크게 깎인다', noise < clear - 15,
    `잡음 ${noise} vs 또렷 ${clear}`);
}

// ── 표 (조정용) — `--table` 일 때만 ────────────────────────────────────
if (process.argv.includes('--table')) {
  const rows = [];
  for (const [sp, label] of [[TARGET, '정확'], ['I have a cat', '한단어틀림'], ['the weather is nice today', '딴말']]) {
    for (const [pn, prof] of [...LADDER, ['잡음', NOISE], ['(음향 없음)', null]]) {
      const r = S(sp, prof);
      rows.push({ 발화: label, 음향: pn, 정확도: r.accuracy, 또렷: r.pronunciation,
                  흐름: r.fluency, 종합: r.overall, 등급: scoreTier(r.overall).tier });
    }
  }
  console.log('\n[조정용 표] ACOUSTIC_TUNING 을 고친 뒤 이 표로 확인하세요');
  console.table(rows);
}

console.log('\n─────────────────────────────────────────────');
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}    ${FAIL ? '❌' : '⚠'} FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach((f) => console.log('    - ' + f)); }
console.log('  ℹ 절대 점수는 검사하지 않습니다 — 실제 녹음으로 맞출 값입니다(파일 머리말 참고).');
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
