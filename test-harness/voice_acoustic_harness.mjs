/**
 * 🎧 voice_acoustic_harness.mjs — 음성코치 '음향 기반' 채점 회귀 하니스
 *
 * 왜 필요한가 (2026-07-29~30 사고의 재발 방지)
 *   발음을 엉망으로 해도 100점(S등급)이 나왔다. 원인은 두 겹이었다:
 *     ① speech-coach.html 이 목표 문장을 Whisper 에 initial_prompt 로 넘겼다 → '정답 유출'.
 *        디코더가 정답 쪽으로 기울어, 소리가 어떻든 정답 문장이 그대로 전사됐다.
 *     ② 채점기가 '전사된 텍스트'만 봤다. Whisper 는 뭉갠 발음을 정상 문장으로 복원하도록
 *        훈련된 모델이라, 텍스트가 맞으면 accuracy·pronunciation·fluency 가 전부 100 →
 *        4개 점수가 사실상 같은 값 하나였다. 텍스트만으로는 '또렷함'을 잴 수 없다.
 *
 *   ①은 코드를 지워서 끝났지만, ②는 채점기가 음향 신호(avg_logprob·단어 타이밍)를 쓰도록
 *   바꿔야 한다. 이 하니스가 그 계약을 고정한다.
 *
 * ⚠️ 기존 voice_score_harness.mjs 는 텍스트 채점만 검사한다 — 이번 버그를 구조적으로 못 잡는다.
 *    그래서 별도 파일로 둔다.
 *
 * 핵심 계약:
 *   ① 텍스트가 완벽해도 음향 신뢰도가 낮으면(웅얼거림) 만점이 안 나온다  ← 이번 사고의 핵심
 *   ② 같은 텍스트라도 또렷한 발화 > 뭉갠 발화 (점수가 실제로 벌어진다)
 *   ③ no_speech_prob 이 높으면(잡음·침묵) 크게 감점
 *   ④ 단어 사이 공백이 길면(머뭇거림) 흐름 감점
 *   ⑤ 말이 너무 빠르거나 너무 느리면 흐름 감점
 *   ⑥ 음향정보가 없으면 옛 텍스트 채점과 100% 동일 (구 whisper 폴백 하위호환)
 *   ⑦ 언어 불일치(0점)는 음향으로 되살아나지 않는다
 *   ⑧ 모든 점수 0~100 클램프 · 결정론적
 *
 * 방식: .ts 라 런타임 import 불가 → esbuild 로 트랜스파일해 import (voice_score_harness 와 동일 패턴).
 */
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, unlinkSync, writeFileSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TS = resolve(root, 'cloudflare-deploy', 'src', 'voice-score.ts');
const OUT = resolve(root, 'test-harness', '.voice-acoustic.built.mjs');
let scoreVoiceCoach, analyzeAcoustic, TUNE;
try {
  execSync(`npx --yes esbuild "${TS}" --bundle --format=esm --platform=node --outfile="${OUT}"`, { stdio: 'pipe' });
  const mod = await import(pathToFileURL(OUT).href + '?t=' + Date.now());
  scoreVoiceCoach = mod.scoreVoiceCoach; analyzeAcoustic = mod.analyzeAcoustic; TUNE = mod.ACOUSTIC_TUNING;
  if (typeof scoreVoiceCoach !== 'function') throw new Error('scoreVoiceCoach export 없음');
  if (typeof analyzeAcoustic !== 'function') throw new Error('analyzeAcoustic export 없음');
} catch (e) {
  console.error('FAIL: voice-score.ts 컴파일/로드 실패 —', (e && e.message ? String(e.message).split('\n')[0] : e));
  process.exit(1);
} finally {
  try { if (existsSync(OUT)) unlinkSync(OUT); } catch { /* 정리 실패 무시 */ }
}

let pass = 0, fail = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}${detail ? '\n  ' + detail : ''}`); }
};

const T = 'I have a big dog';
const NW = T.split(' ').length;   // 5 단어

/**
 * 가짜 Whisper 음향정보 생성기.
 *   lp        : avg_logprob (또렷할수록 0 에 가깝다)
 *   wps       : 말속도(단어/초)
 *   gapAt/gap : 몇 번째 단어 앞에 얼마나 쉬었나(초) — 머뭇거림 재현
 *   noSpeech  : no_speech_prob
 */
function mkAcoustic({ lp = -0.2, wps = 2.6, words = NW, gapAt = -1, gap = 0, noSpeech = 0.02 } = {}) {
  const step = 1 / wps;           // 단어 하나가 차지하는 시간
  const dur = step * 0.75;        // 발성 시간(나머지는 자연스러운 짧은 공백)
  const list = [];
  let t = 0.5;                    // 녹음 시작 후 조금 뒤부터 말하기 시작
  for (let i = 0; i < words; i++) {
    if (i === gapAt) t += gap;
    list.push({ word: 'w' + i, start: Number(t.toFixed(3)), end: Number((t + dur).toFixed(3)) });
    t += step;
  }
  const end = list.length ? list[list.length - 1].end : 1;
  return {
    segments: [{ start: 0.5, end, text: T, avg_logprob: lp, no_speech_prob: noSpeech, words: list }],
    transcription_info: { duration: end + 0.5, duration_after_vad: end - 0.5, language_probability: 0.99 },
  };
}

console.log('── ① 텍스트가 완벽해도 음향이 나쁘면 만점이 아니다 (이번 사고의 핵심) ──');
const clearSpeech = scoreVoiceCoach(T, T, mkAcoustic({ lp: -0.15 }));
const mumbled = scoreVoiceCoach(T, T, mkAcoustic({ lp: -0.95 }));
ok(`또렷한 발화는 높다 (overall=${clearSpeech.overall} ≥ 90)`, clearSpeech.overall >= 90, `got ${clearSpeech.overall}`);
ok(`웅얼거림은 S등급(95+)이 안 나온다 (overall=${mumbled.overall} < 95)`, mumbled.overall < 95, `got ${mumbled.overall}`);
ok('음향 반영 표시 acoustic=true', clearSpeech.acoustic === true && mumbled.acoustic === true);
ok('정확도는 텍스트 기준 그대로 100 (음향은 또렷함/흐름만 건드린다)',
   clearSpeech.accuracy === 100 && mumbled.accuracy === 100,
   `clear=${clearSpeech.accuracy} mumble=${mumbled.accuracy}`);

console.log('\n── ② 같은 텍스트라도 또렷함에 따라 점수가 벌어진다 ──');
ok(`또렷(${clearSpeech.overall}) > 웅얼(${mumbled.overall})`, clearSpeech.overall > mumbled.overall);
ok(`또렷함 점수 차이가 유의미 (≥ 30점): ${clearSpeech.pronunciation} vs ${mumbled.pronunciation}`,
   (clearSpeech.pronunciation - mumbled.pronunciation) >= 30,
   `diff ${clearSpeech.pronunciation - mumbled.pronunciation}`);
const worst = scoreVoiceCoach(T, T, mkAcoustic({ lp: -1.4 }));
ok(`아주 낮은 신뢰도는 또렷함이 바닥 (pron=${worst.pronunciation} ≤ 35)`, worst.pronunciation <= 35, `got ${worst.pronunciation}`);
ok('단조성: 신뢰도가 높을수록 또렷함도 높다',
   [-1.4, -0.95, -0.6, -0.15].map(v => scoreVoiceCoach(T, T, mkAcoustic({ lp: v })).pronunciation)
     .every((v, i, arr) => i === 0 || v >= arr[i - 1]));

console.log('\n── ③ no_speech_prob 이 높으면(잡음만 녹음) 크게 감점 ──');
const noisy = scoreVoiceCoach(T, T, mkAcoustic({ lp: -0.15, noSpeech: 0.9 }));
ok(`잡음 판정 시 또렷함 급락 (${clearSpeech.pronunciation} → ${noisy.pronunciation})`,
   noisy.pronunciation < clearSpeech.pronunciation * 0.6,
   `clear=${clearSpeech.pronunciation} noisy=${noisy.pronunciation}`);
ok(`잡음이면 S등급 불가 (overall=${noisy.overall} < 95)`, noisy.overall < 95);

console.log('\n── ④ 머뭇거림(단어 사이 긴 공백) → 흐름 감점 ──');
const smooth = scoreVoiceCoach(T, T, mkAcoustic({ gapAt: -1 }));
const hesitant = scoreVoiceCoach(T, T, mkAcoustic({ gapAt: 2, gap: 1.5 }));
ok(`매끄러움(flow=${smooth.fluency}) > 머뭇거림(flow=${hesitant.fluency})`, smooth.fluency > hesitant.fluency,
   `smooth=${smooth.fluency} hesitant=${hesitant.fluency}`);
ok(`머뭇거림 흐름 낮음 (${hesitant.fluency} ≤ 80)`, hesitant.fluency <= 80, `got ${hesitant.fluency}`);

console.log('\n── ⑤ 말속도: 너무 느리거나 너무 빠르면 흐름 감점 ──');
const normal = scoreVoiceCoach(T, T, mkAcoustic({ wps: 2.6 }));
const tooSlow = scoreVoiceCoach(T, T, mkAcoustic({ wps: 0.6 }));
const tooFast = scoreVoiceCoach(T, T, mkAcoustic({ wps: 7.0 }));
ok(`적정 속도 흐름 높음 (${normal.fluency} ≥ 85)`, normal.fluency >= 85, `got ${normal.fluency}`);
ok(`너무 느림 감점 (${tooSlow.fluency} < ${normal.fluency})`, tooSlow.fluency < normal.fluency);
ok(`너무 빠름 감점 (${tooFast.fluency} < ${normal.fluency})`, tooFast.fluency < normal.fluency);

console.log('\n── ⑥ 음향정보 없으면 옛 텍스트 채점과 100% 동일 (구 whisper 폴백 하위호환) ──');
for (const spoken of [T, 'I have dog', 'banana purple running', '']) {
  const a = scoreVoiceCoach(T, spoken);
  const b = scoreVoiceCoach(T, spoken, null);
  const c = scoreVoiceCoach(T, spoken, { segments: [] });          // 빈 세그먼트 = 정보 없음
  const same = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(c);
  ok(`"${spoken || '(빈 발화)'}" — 음향 없음/null/빈배열 모두 동일`, same);
  ok(`"${spoken || '(빈 발화)'}" — acoustic=false 로 표시`, a.acoustic === false);
}
ok('avg_logprob 이 없는 세그먼트도 안전하게 무시', scoreVoiceCoach(T, T, { segments: [{ start: 0, end: 1, text: T }] }).acoustic === false);

console.log('\n── ⑦ 언어 불일치(0점)는 음향으로 되살아나지 않는다 ──');
const mismatch = scoreVoiceCoach(T, '나는 큰 개를 키워요', mkAcoustic({ lp: -0.05 }));
ok('langMismatch=true 유지', mismatch.langMismatch === true);
ok(`완벽한 음향이어도 overall=0 (got ${mismatch.overall})`, mismatch.overall === 0);

console.log('\n── ⑧ 딴소리는 음향이 좋아도 높은 점수를 못 받는다 ──');
const fluentNonsense = scoreVoiceCoach(T, 'banana purple running', mkAcoustic({ lp: -0.05, words: 3 }));
ok(`딴소리 overall 낮음 (${fluentNonsense.overall} < 50)`, fluentNonsense.overall < 50, `got ${fluentNonsense.overall}`);
ok(`딴소리는 흐름도 상한에 눌린다 (flow=${fluentNonsense.fluency} ≤ accuracy+15=${fluentNonsense.accuracy + 15})`,
   fluentNonsense.fluency <= fluentNonsense.accuracy + 15);

console.log('\n── ⑨ 경계·안전 ──');
const variants = [
  mkAcoustic({ lp: -0.15 }), mkAcoustic({ lp: -3 }), mkAcoustic({ lp: 0 }),
  mkAcoustic({ wps: 0.1 }), mkAcoustic({ wps: 30 }), mkAcoustic({ words: 1 }),
  { segments: [{ avg_logprob: -0.3 }] },                         // start/end/words 전부 없음
  { segments: [{ avg_logprob: -0.3, words: [{ word: 'x' }] }] },  // 타이밍 없는 단어
  { segments: [{ avg_logprob: NaN, no_speech_prob: 2 }] },        // 망가진 값
];
ok('모든 변형에서 점수 0~100 클램프 · NaN 없음', variants.every((v) => {
  const r = scoreVoiceCoach(T, T, v);
  return [r.accuracy, r.pronunciation, r.fluency, r.completeness, r.overall]
    .every((x) => Number.isFinite(x) && x >= 0 && x <= 100);
}), variants.map((v) => JSON.stringify(scoreVoiceCoach(T, T, v).overall)).join(','));
ok('깨진 입력에도 안 터진다', (() => {
  for (const bad of [{}, { segments: null }, { segments: [null, undefined] }, { segments: 'x' }]) {
    try { scoreVoiceCoach(T, T, bad); } catch { return false; }
  }
  return true;
})());
ok('결정론적(같은 입력 = 같은 출력)',
   JSON.stringify(scoreVoiceCoach(T, T, mkAcoustic({ lp: -0.5 }))) === JSON.stringify(scoreVoiceCoach(T, T, mkAcoustic({ lp: -0.5 }))));

console.log('\n── ⑩ 보정 상수가 노출돼 있다 (실제 녹음으로 조정 가능해야 한다) ──');
ok('ACOUSTIC_TUNING export 존재', TUNE && typeof TUNE.LP_GOOD === 'number' && typeof TUNE.LP_BAD === 'number');
ok('LP_BAD < LP_GOOD (구간이 뒤집히지 않았다)', TUNE.LP_BAD < TUNE.LP_GOOD);
ok('RATE_LO < RATE_HI', TUNE.RATE_LO < TUNE.RATE_HI);
ok('GAP_OK < GAP_BAD', TUNE.GAP_OK < TUNE.GAP_BAD);

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — pass ${pass} / fail ${fail}`);
try {
  writeFileSync(join(root, 'test-harness', 'voice_acoustic_report.txt'),
    `PASS=${pass} FAIL=${fail}\n생성=${new Date().toISOString()}\n` +
    `⚠️ 임계값(ACOUSTIC_TUNING)은 잠정치 — 실제 녹음으로 보정 필요\n`, 'utf8');
} catch { /* 리포트 실패는 무시 */ }
process.exit(fail === 0 ? 0 : 1);
