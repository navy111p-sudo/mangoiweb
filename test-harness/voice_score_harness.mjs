/**
 * 🗣 voice_score_harness.mjs — 음성코치 채점기(src/voice-score.ts) 변별력 회귀 하니스
 *
 * 왜 필요한가 (2026-07-24 직원 피드백의 재발 방지)
 *   기존 채점("단어 집합 겹침")은 순서·중복·딴소리를 못 걸러 **잘하든 못하든 점수가 비슷**했다.
 *   voice-score.ts 가 그걸 '단어 단위 정렬' 결정론 채점으로 바꿨다 → 이 하니스가 그 변별력을 고정한다.
 *   핵심 계약:
 *     ① 완벽 발화 > 부분 발화 > 딴소리  (점수가 실제로 벌어져야 한다)
 *     ② "the the the" 중복으로 100% 못 넘는다
 *     ③ 뜻 바뀌는 실수(dog→cat)는 억양 흔들림(dog→dawg)보다 더 깎인다  ← [[speak-scoring-alignment]]
 *     ④ 영어 목표에 한국어 발화 = langMismatch=true, 0점
 *     ⑤ 모든 점수 0~100 클램프
 *
 * 방식: .ts 라 런타임 import 불가 → 소스에서 순수 함수 전부 추출해 실행(enroll 하니스와 동일 패턴).
 */
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, unlinkSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// ── TS 를 esbuild 로 실제 트랜스파일해 import (정규식 스트리핑은 취약 → 검증된 방식) ──
// voice-score.ts 는 import 0 · 순수함수라 번들이 작다. 다른 하니스(pii_mask 등)와 동일 패턴.
const TS = resolve(root, 'cloudflare-deploy', 'src', 'voice-score.ts');
const OUT = resolve(root, 'test-harness', '.voice-score.built.mjs');
let scoreVoiceCoach, scoreTier;
try {
  execSync(`npx --yes esbuild "${TS}" --bundle --format=esm --platform=node --outfile="${OUT}"`, { stdio: 'pipe' });
  const mod = await import(pathToFileURL(OUT).href + '?t=' + Date.now());
  scoreVoiceCoach = mod.scoreVoiceCoach; scoreTier = mod.scoreTier;
  if (typeof scoreVoiceCoach !== 'function') throw new Error('scoreVoiceCoach export 없음');
} catch (e) {
  console.error('FAIL: voice-score.ts 컴파일/로드 실패 —', (e && e.message ? String(e.message).split('\n')[0] : e));
  process.exit(1);
} finally {
  try { if (existsSync(OUT)) unlinkSync(OUT); } catch { /* 정리 실패 무시 */ }
}

let pass = 0, fail = 0;
const S = (target, spoken) => scoreVoiceCoach(target, spoken);
const ok = (label, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.log(`FAIL ${label}${detail ? '\n  ' + detail : ''}`); }
};

const T = 'I have a big dog';

console.log('── ① 변별력: 완벽 > 부분 > 딴소리 (점수가 벌어진다) ──');
const perfect = S(T, 'I have a big dog').overall;
const partial = S(T, 'I have dog').overall;
const wrong = S(T, 'banana purple running').overall;
ok(`완벽 발화 높음 (overall=${perfect} ≥ 90)`, perfect >= 90, `got ${perfect}`);
ok(`완벽(${perfect}) > 부분(${partial})`, perfect > partial);
ok(`부분(${partial}) > 딴소리(${wrong})`, partial > wrong);
ok(`딴소리 낮음 (overall=${wrong} < 45)`, wrong < 45, `got ${wrong}`);
ok('점수 차이가 유의미(완벽−딴소리 ≥ 40)', (perfect - wrong) >= 40, `diff ${perfect - wrong}`);

console.log('\n── ② 중복 단어로 100% 못 넘는다 ("the the the") ──');
const repeat = S('the cat sat', 'the the the');
ok(`중복 도배 overall ≤ 60 (got ${repeat.overall})`, repeat.overall <= 60);
ok('accuracy 100 초과 없음', repeat.accuracy <= 100 && repeat.completeness <= 100);

console.log('\n── ③ 뜻 바뀌는 실수 > 억양 흔들림 감점 ──');
const contentErr = S(T, 'I have a big cat').overall;   // dog→cat: 뜻 바뀜
const accentErr = S(T, 'I have a big dawg').overall;    // dog→dawg: 억양 흔들림(edit distance 1)
ok(`억양(${accentErr}) ≥ 뜻바뀜(${contentErr})`, accentErr >= contentErr, `dawg=${accentErr} cat=${contentErr}`);
ok('억양 흔들림은 큰 감점 아님(≥ 80)', accentErr >= 80, `got ${accentErr}`);

console.log('\n── ④ 언어 불일치 (영어 목표 + 한국어 발화) ──');
const koMismatch = S('I have a big dog', '나는 큰 개를 키워요');
ok('langMismatch=true', koMismatch.langMismatch === true);
ok(`불일치 overall=0 (got ${koMismatch.overall})`, koMismatch.overall === 0);

console.log('\n── ⑤ 경계·안전 ──');
ok('빈 발화 → 0점, 안 터짐', S(T, '').overall === 0);
ok('빈 목표 → 0점', S('', 'anything').overall === 0);
const all = ['I have a big dog', 'I have dog', 'banana', 'the the the', ''].map((s) => S(T, s));
ok('모든 점수 0~100 클램프', all.every((r) => [r.accuracy, r.pronunciation, r.fluency, r.completeness, r.overall]
   .every((v) => Number.isFinite(v) && v >= 0 && v <= 100)));
ok('결정론적(같은 입력 = 같은 출력)', S(T, 'I have dog').overall === S(T, 'I have dog').overall);

console.log('\n── ⑥ 등급(scoreTier) 임계값 ──');
ok('95→S', scoreTier(96).tier === 'S');
ok('85→A', scoreTier(88).tier === 'A');
ok('70→B', scoreTier(72).tier === 'B');
ok('50→C', scoreTier(55).tier === 'C');
ok('49→D', scoreTier(40).tier === 'D');
ok('등급 라벨 한/영 두 벌', ['S', 'A', 'B', 'C', 'D'].every((_, i) => {
  const t = scoreTier([96, 88, 72, 55, 40][i]);
  return t.label_ko && t.label_en && t.label_ko !== t.label_en;
}));

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — pass ${pass} / fail ${fail}`);
const report = join(root, 'test-harness', 'voice_score_report.txt');
try { readFileSync; } catch {}
import('fs').then((fs) => fs.writeFileSync(report, `PASS=${pass} FAIL=${fail}\n생성=${new Date().toISOString()}\n`, 'utf8'));
process.exit(fail === 0 ? 0 : 1);
