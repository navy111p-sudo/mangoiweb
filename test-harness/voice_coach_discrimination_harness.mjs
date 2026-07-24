/**
 * 🗣 음성코치 채점 '변별력' 하니스 — 2026-07-24 (직원 피드백 후속)
 *
 * 왜 필요한가:
 *   직원 피드백 — "위의 점수와 설명이 잘하거나 못해도 동일하게 나옵니다."
 *   기존 /api/voice/coach 채점은 '단어 집합 겹침'이라 순서·중복·딴소리를 못 걸러
 *   잘하든 못하든 점수가 비슷했다(변별력 없음). 채점을 정렬 방식(voice-score.ts)으로
 *   바꿨으니, 이 하니스가 **정말로 잘함/못함을 점수로 구분하는지**를 못박는다.
 *
 * 지키는 것:
 *   ① 완벽 발화 > 한 단어 실수 > 절반 > 딴소리 순으로 종합점수가 '단조 감소'한다.
 *   ② 다른 언어(영어 목표에 한국어)는 0점 + langMismatch 플래그.
 *   ③ 빈 발화는 0점.
 *   ④ 중복/군더더기 단어로 100%를 넘지 않는다("the the the").
 *   ⑤ 뜻이 달라지는 실수(dog→cat)는 억양 흔들림(dog→dawg)보다 확실히 낮다.
 *   ⑥ 중국어 목표도 글자 단위로 변별한다.
 *
 * 실행: node test-harness/voice_coach_discrimination_harness.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CD = join(ROOT, 'cloudflare-deploy');
const SRC = join(CD, 'src', 'voice-score.ts');

// voice-score.ts → JS 로 트랜스파일(esbuild JS API) 후 import (Windows 의 .cmd spawn 회피)
//   esbuild 가 없는 환경(드묾)에서는 배포를 막지 않도록 SKIP(exit 0) 처리.
let esbuild;
try {
  const require = createRequire(join(CD, 'package.json'));
  esbuild = require('esbuild');
} catch {
  console.log('⏭  esbuild 미설치 — voice-score 트랜스파일 불가, 이 하니스는 건너뜁니다(정상).');
  process.exit(0);
}
const ts = readFileSync(SRC, 'utf8');
const { code } = esbuild.transformSync(ts, { loader: 'ts', format: 'esm', platform: 'node' });
const outFile = join(mkdtempSync(join(tmpdir(), 'vscore-')), 'voice-score.mjs');
writeFileSync(outFile, code, 'utf8');
const { scoreVoiceCoach, scoreTier } = await import(pathToFileURL(outFile).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const T = 'Hello! Nice to meet you.';

// ── ① 잘할수록 점수가 높다 (단조 감소) ──
console.log('\n▶ ① 변별력 — 잘함 > 실수 > 절반 > 딴소리');
const perfect = scoreVoiceCoach(T, 'Hello nice to meet you');
const oneWrong = scoreVoiceCoach(T, 'Hello nice to greet you');   // meet→greet (뜻 다른 실수)
const half     = scoreVoiceCoach(T, 'Hello nice');                // 절반만
const garbage  = scoreVoiceCoach(T, 'apple banana orange table'); // 완전 딴소리(길이만 비슷)

console.log(`     perfect=${perfect.overall} oneWrong=${oneWrong.overall} half=${half.overall} garbage=${garbage.overall}`);
check('완벽 발화는 90점 이상', perfect.overall >= 90, `overall=${perfect.overall}`);
check('완벽 > 한 단어 실수', perfect.overall > oneWrong.overall, `${perfect.overall} vs ${oneWrong.overall}`);
check('한 단어 실수 > 절반만 말함', oneWrong.overall > half.overall, `${oneWrong.overall} vs ${half.overall}`);
check('절반 > 완전 딴소리', half.overall > garbage.overall, `${half.overall} vs ${garbage.overall}`);
check('완전 딴소리는 40점 미만', garbage.overall < 40, `overall=${garbage.overall}`);
// 점수 스프레드가 충분히 넓어야 '변별력'이 있다고 본다(완벽-딴소리 ≥ 60점 차)
check('완벽↔딴소리 점수차 60점 이상(변별력)', (perfect.overall - garbage.overall) >= 60, `차=${perfect.overall - garbage.overall}`);

// ── ② 다른 언어 = 0점 + 플래그 ──
console.log('\n▶ ② 언어 불일치(영어 목표에 한국어)');
const korean = scoreVoiceCoach(T, '안녕하세요 잘생겼어요');
console.log(`     korean overall=${korean.overall} langMismatch=${korean.langMismatch}`);
check('한국어 발화는 langMismatch=true', korean.langMismatch === true, `flag=${korean.langMismatch}`);
check('한국어 발화는 종합 10점 이하', korean.overall <= 10, `overall=${korean.overall}`);

// ── ③ 빈 발화 = 0점 ──
console.log('\n▶ ③ 빈 발화');
const empty = scoreVoiceCoach(T, '');
check('빈 발화는 0점', empty.overall === 0, `overall=${empty.overall}`);

// ── ④ 중복/군더더기로 100% 초과 불가 ──
console.log('\n▶ ④ 중복 단어 악용 방지');
const spam = scoreVoiceCoach('the cat', 'the the the the');
console.log(`     spam accuracy=${spam.accuracy} overall=${spam.overall}`);
check('중복 단어로 정확도 100 초과 안 함', spam.accuracy <= 100, `accuracy=${spam.accuracy}`);
check('중복 단어 스팸은 절반 미만', spam.overall < 60, `overall=${spam.overall}`);

// ── ⑤ 뜻 다른 실수 < 억양 흔들림 ──
console.log('\n▶ ⑤ 뜻이 다른 실수 vs 억양 흔들림');
const meaningErr = scoreVoiceCoach('I have a dog', 'I have a cat');   // dog→cat (뜻 다름)
const accentWob  = scoreVoiceCoach('I have a dog', 'I have a dawg');  // dog→dawg (소리 비슷)
console.log(`     meaningErr=${meaningErr.overall} accentWobble=${accentWob.overall}`);
check('억양 흔들림(dawg)은 70점 이상 유지', accentWob.overall >= 70, `overall=${accentWob.overall}`);
check('뜻 다른 실수(cat) < 억양 흔들림(dawg)', meaningErr.overall < accentWob.overall, `${meaningErr.overall} vs ${accentWob.overall}`);

// ── ⑥ 중국어 글자 단위 변별 ──
console.log('\n▶ ⑥ 중국어 목표');
const zhPerfect = scoreVoiceCoach('你好吗', '你好吗');
const zhWrong   = scoreVoiceCoach('你好吗', '再见了');
const zhKorean  = scoreVoiceCoach('你好吗', '안녕하세요');
console.log(`     zhPerfect=${zhPerfect.overall} zhWrong=${zhWrong.overall} zhKorean langMismatch=${zhKorean.langMismatch}`);
check('중국어 완벽은 90점 이상', zhPerfect.overall >= 90, `overall=${zhPerfect.overall}`);
check('중국어 완벽 > 완전 오답', zhPerfect.overall > zhWrong.overall, `${zhPerfect.overall} vs ${zhWrong.overall}`);
check('중국어 목표에 한국어 = langMismatch', zhKorean.langMismatch === true, `flag=${zhKorean.langMismatch}`);

// ── ⑦ 등급(동기부여) 매핑 ──
console.log('\n▶ ⑦ 등급 티어');
check('95+ = S 등급', scoreTier(97).tier === 'S', JSON.stringify(scoreTier(97)));
check('50점대 = C 등급', scoreTier(55).tier === 'C', JSON.stringify(scoreTier(55)));
check('낮은 점수 = D 등급', scoreTier(20).tier === 'D', JSON.stringify(scoreTier(20)));

// ── 요약 ──
console.log('\n' + '─'.repeat(52));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (failures.length) { console.log('\n실패 목록:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
