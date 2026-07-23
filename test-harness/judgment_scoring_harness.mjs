// -*- coding: utf-8 -*-
// 🧠 판단력 채점·성장지수 정확성 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/judgment_scoring_harness.mjs
//   대상:  cloudflare-deploy/src/judgment-scoring.ts 의 순수 함수 (node 타입 스트리핑으로 직접 import)
//
//   이 파일이 지키는 것 — 학생 점수와 관리자 통계의 원천이라 회귀가 나면 안 되는 성질들:
//     A. 100점과 45점이 지수를 서로 다르게 움직인다 (원래 신고된 버그)
//     B. 자기교정력이 정답을 쌓으면 회복된다 (영구 고정 버그)
//     C. 오답이 등급으로 갈린다 — 아깝게 틀림 > 완전히 엉뚱함
//     D. 오답 점수가 정답 점수를 넘지 못한다
//     E. 쉬운 문제만 반복해서는 지수 상단에 닿을 수 없다 (변별력)
//     F. 실력 순서대로 지수 순서가 나온다 (단조성)
//     G. 값이 없을 때 안전 폴백(기존 100·45)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dir = dirname(fileURLToPath(import.meta.url));
const S = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/judgment-scoring.ts').replace(/\\/g, '/'));
const { axesFromRows, normalizeOptionScores, normalizeDifficulty, difficultyAdjust, scoreChoice,
        recencyAvg, DIFFICULTY_CEILING, WRONG_OPTION_CAP } = S;

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

// 판단 기록 1건 만들기
const row = (o = {}) => ({
  choice_score: o.c ?? 100,
  reasoning_score: o.r ?? 70,
  misconception_tag: o.m ?? null,
  is_optimal: (o.c ?? 100) >= 95 ? 1 : 0,
  created_at: 1,
  reasoning_features_json: JSON.stringify({
    has_reasoning: true, register_awareness: o.g ?? 70, difficulty: o.d ?? 3,
  }),
});
const hist = (n, o) => Array.from({ length: n }, () => row(o));
const idx = (rows) => axesFromRows(rows).judgment_index;

console.log('\n[ A. 잘 본 판단과 못 본 판단이 지수를 다르게 움직이는가 ]');
{
  const base = hist(26, { c: 100, g: 70, d: 3 });
  const good = idx([...base, row({ c: 100, r: 90, g: 90, d: 3 })]);
  const bad = idx([...base, row({ c: 22, r: 20, g: 25, d: 3, m: 'REGISTER_MISMATCH' })]);
  check('26회 이력 뒤 100점과 22점의 지수가 다르다', good !== bad, `100점=${good} / 22점=${bad}`);
  check('나쁜 판단이 지수를 낮춘다', bad < good, `${bad} < ${good}`);
  check('차이가 눈에 보일 만큼(≥3점) 벌어진다', good - bad >= 3, `차이 ${good - bad}점`);
}

console.log('\n[ B. 자기교정력이 회복되는가 — 영구 고정 버그 ]');
{
  // 같은 오답유형을 반복해 자기교정력을 바닥까지 떨어뜨린다
  const sunk = Array.from({ length: 12 }, () => row({ c: 22, m: 'REGISTER_MISMATCH' }));
  const before = axesFromRows(sunk).axis_selfcorrection;
  const after = axesFromRows([...sunk, ...hist(12, { c: 100 })]).axis_selfcorrection;
  check('바닥을 친 뒤 정답 12회를 쌓으면 자기교정력이 오른다', after > before, `${before} → ${after}`);
  check('정답만 쌓으면 100까지 회복된다', after === 100, `현재 ${after}`);
  // 옛 방식(오답 배열만 분모)이었다면 정답을 아무리 쌓아도 값이 그대로였음
  check('회복 폭이 실질적이다(≥50점)', after - before >= 50, `${after - before}점 회복`);
}

console.log('\n[ C. 오답이 등급으로 갈리는가 ]');
{
  const base = hist(10, { c: 100 });
  const near = idx([...base, row({ c: 68, m: 'REGISTER_MISMATCH' })]);   // 아깝게 틀림
  const wayOff = idx([...base, row({ c: 18, m: 'REGISTER_MISMATCH' })]); // 완전히 엉뚱함
  check('아깝게 틀린 쪽이 엉뚱하게 틀린 쪽보다 높다', near > wayOff, `아깝게=${near} / 엉뚱=${wayOff}`);
}

console.log('\n[ D. 선택지 점수 정규화 — 오답이 정답을 못 넘는다 ]');
{
  const n1 = normalizeOptionScores([98, 40, 30], 3, 1);   // LLM 이 오답에 98을 준 악성 케이스
  check('오답 98점이 상한으로 눌린다', n1[0] <= WRONG_OPTION_CAP, `→ ${n1[0]}`);
  check('정답이 최고점이 된다', n1[1] === Math.max(...n1), `정답=${n1[1]} / 전체=${JSON.stringify(n1)}`);
  check('정답은 95 이상', n1[1] >= 95, `${n1[1]}`);

  const n2 = normalizeOptionScores([10, 97, 52, 30], 3, 1);  // 점수가 선택지보다 많은 경우(잘라 맞춤)
  check('점수가 더 많으면 선택지 수에 맞춰 자른다', Array.isArray(n2) && n2.length === 3, JSON.stringify(n2));

  check('점수가 모자라면 null(→ 폴백)', normalizeOptionScores([10, 97], 3, 1) === null);
  check('배열이 아니면 null', normalizeOptionScores(null, 3, 1) === null);
  check('숫자가 아니면 null', normalizeOptionScores([10, 'x', 30], 3, 1) === null);
  check('범위를 벗어난 값은 0~100으로 조인다', (() => {
    const r = normalizeOptionScores([-40, 500, 20], 3, 1);
    return r[0] === 0 && r[1] === 100;
  })());
}

console.log('\n[ E. 난이도가 실제로 변별하는가 ]');
{
  // ⚠️ 난이도를 '가중평균의 가중치'로만 쓰면 모든 문항 난이도가 같을 때 상쇄되어 무효가 된다.
  //    아래 두 학생은 난이도만 다르고 나머지가 완전히 동일 — 반드시 달라야 한다.
  const easyOnly = hist(20, { c: 100, r: 70, g: 70, d: 1 });
  const hardOnly = hist(20, { c: 100, r: 70, g: 70, d: 5 });
  const e = axesFromRows(easyOnly), h = axesFromRows(hardOnly);
  check('쉬운 문제만 vs 어려운 문제만 — 선택 축이 다르다', e.axis_choice !== h.axis_choice, `쉬움=${e.axis_choice} / 어려움=${h.axis_choice}`);
  check('쉬운 문제만 전부 맞혀도 선택 축 상한에 걸린다', e.axis_choice <= DIFFICULTY_CEILING[0], `${e.axis_choice} ≤ ${DIFFICULTY_CEILING[0]}`);
  check('어려운 문제를 다 맞히면 선택 축 100', h.axis_choice === 100, `${h.axis_choice}`);
  check('지수도 어려운 쪽이 높다', h.judgment_index > e.judgment_index, `쉬움=${e.judgment_index} / 어려움=${h.judgment_index}`);
  check('난이도 상한이 단조 증가', DIFFICULTY_CEILING.every((v, i, a) => i === 0 || a[i - 1] < v), JSON.stringify(DIFFICULTY_CEILING));
  check('쉬운 문제 오답이 더 아프다', difficultyAdjust(20, 1) < difficultyAdjust(20, 5), `${difficultyAdjust(20, 1)} < ${difficultyAdjust(20, 5)}`);
  check('난이도 없는 옛 기록은 보통(3)으로 본다', difficultyAdjust(100, undefined) === difficultyAdjust(100, 3));
  check('난이도 범위 밖은 조인다', normalizeDifficulty(9) === 5 && normalizeDifficulty(0) === 1 && normalizeDifficulty('x') === 3);
}

console.log('\n[ F. 실력 순서대로 지수 순서가 나오는가 (단조성) ]');
{
  const mk = (acc, near, reason, reg, d) => {
    let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const MIS = ['REGISTER_MISMATCH', 'LITERAL_TRANSLATION', 'POLITENESS_OVER'];
    return Array.from({ length: 24 }, (_, i) => {
      const ok = rnd() < acc, isNear = rnd() < near;
      return row({ c: ok ? 100 : (isNear ? 68 : 22), r: reason, g: ok ? reg : reg - 15, d, m: ok ? null : MIS[i % 3] });
    });
  };
  const A = idx(mk(.92, .8, 88, 88, 5));   // 최상위: 어려운 문제·정답 대부분·이유 탄탄
  const B = idx(mk(.80, .7, 70, 72, 3));   // 상위
  const C = idx(mk(.62, .8, 55, 58, 1));   // 중위: 쉬운 문제만·아깝게 틀림 많음
  const D = idx(mk(.40, .15, 28, 35, 2));  // 하위: 엉뚱한 선택 많음·이유 부실
  console.log(`     A=${A}  B=${B}  C=${C}  D=${D}   (변별 폭 ${A - D})`);
  check('A > B > C > D 순서가 유지된다', A > B && B > C && C > D, `${A}/${B}/${C}/${D}`);
  check('최상위–하위 변별 폭이 충분하다(≥30점)', A - D >= 30, `${A - D}점`);
  check('최상위가 90점대에 든다', A >= 90, `${A}`);
}

console.log('\n[ G. 값이 없을 때 안전 폴백 ]');
{
  check('option_scores 없으면 정답=100', scoreChoice(null, 1, 1, true) === 100);
  check('option_scores 없으면 오답=45', scoreChoice(null, 0, 1, false) === 45);
  check('정답 인덱스 자체가 없으면 70(중립)', scoreChoice(null, 0, null, false) === 70);
  check('점수가 있으면 그 값을 쓴다', scoreChoice([18, 97, 52], 2, 1, false) === 52);
  check('정답인데 점수가 낮게 왔으면 95로 올린다', scoreChoice([18, 60, 52], 1, 1, true) === 95);
  check('기록이 없으면 지수는 null', axesFromRows([]).judgment_index === null);
  check('기록 1건이면 prev 계산 없이도 지수가 나온다', typeof idx([row({ c: 100 })]) === 'number');
  check('빈 배열 recencyAvg = null', recencyAvg([]) === null);
  check('전부 null 이면 recencyAvg = null', recencyAvg([null, null]) === null);
}

console.log('\n[ H. 최근 판단에 더 무게가 실리는가 ]');
{
  const oldGood = [...hist(10, { c: 100 }), ...hist(10, { c: 22, m: 'X' })];   // 예전엔 잘했지만 최근에 무너짐
  const newGood = [...hist(10, { c: 22, m: 'X' }), ...hist(10, { c: 100 })];   // 예전엔 못했지만 최근에 잘함
  const a = axesFromRows(oldGood).axis_choice, b = axesFromRows(newGood).axis_choice;
  check('최근에 잘한 쪽의 선택 축이 더 높다', b > a, `과거우수=${a} / 최근우수=${b}`);
}

console.log('\n[ I. 배선 — 정답지가 서버에서 오는가 (클라이언트 조작 방어) ]');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8');
  const pts = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-points.ts'), 'utf8');
  const html = readFileSync(resolve(__dir, '../cloudflare-deploy/public/judgment.html'), 'utf8');
  check('출제 때 정답지를 KV 에 보관한다', /kv\.put\(scenKey\(/.test(src));
  check('채점 때 KV 정답지를 먼저 읽는다', /kv\.get\(scenKey\(/.test(src));
  check('KV 값이 있으면 클라이언트 값을 무시한다', /trusted \? keyed\.option_scores : input\.optionScores/.test(src));
  check('선택지 수가 다르면 KV 값을 신뢰하지 않는다', /Number\(keyed\.n\) === opts\.length/.test(src));
  check('정답 인덱스를 자른 뒤 길이로 제한한다(정답 유실 방지)', /Math\.min\(opts4\.length - 1, \+j\.correct_index\)/.test(src));
  check('라우트가 sid 를 채점 함수로 넘긴다', /sid: body\.sid/.test(pts));
  check('화면이 sid 를 함께 전송한다', /sid:scenario\.sid/.test(html));
  check('선택지별 점수·난이도도 함께 전송한다', /option_scores:scenario\.option_scores/.test(html) && /difficulty:scenario\.difficulty/.test(html));
  check('다음 문제 프리페치가 살아 있다', /function prefetchNext\(\)/.test(html) && /prefetchNext\(\);/.test(html));
  check('오답 등급별 배너가 있다', /function bannerText\(/.test(html));
  check('성장 화면에 이번 판단·지수 변화를 보여준다', /delta_index/.test(html) && /이번 판단/.test(html));
  check('옛 이분법 채점(100:45)이 채점 경로에서 사라졌다', !/isOptimal \? 100 : \(correctIdx/.test(src));

  // 경쟁 서비스 벤치마크 반영분 (Duolingo Max=Explain My Answer / ELSA=대조 피드백 / 산타=해석·추세)
  check('채점 응답이 선택지 채점표를 함께 준다', /options: opts, option_scores: optScores/.test(src));
  check('내가 고른 답에 대한 해설을 LLM 에 요구한다', /why_chosen_ko/.test(src) && /why_chosen_en/.test(src));
  check('해설이 응답에 실린다', /why_chosen_ko: whyChosenKo/.test(src));
  check('중국어 화면에도 해설이 간다', /why_chosen_zh/.test(src));
  check('화면에 선택지 채점표가 있다', /function optionTable\(/.test(html));
  check('채점표가 내 선택·정답을 구분 표시한다', /ot-m|내 선택/.test(html) && /ot-b|가장 자연스러움/.test(html));
  check('화면에 내가 고른 표현 해설 블록이 있다', /class="mypick"/.test(html));
  check('축마다 해석 문구(밴드)를 붙인다', /function band\(/.test(html) && /집중 연습이 필요해요/.test(html));
  check('지난달 대비 추세를 보여준다', /function monthTrend\(/.test(html));
  check('추세 문구가 3개 언어 모두 있다', /지난달보다[\s\S]{0,120}from last month[\s\S]{0,120}比上个月/.test(html));

  // 취약 유형 → 즉시 그 유형 연습 (산타의 "취약 개념에서 바로 학습으로 이동")
  check('생성기가 지정 오답유형을 받는다', /focusMisconception\?: string \| null/.test(src));
  check('사전에 없는 코드는 무시한다(프롬프트 주입 차단)', /taxonomy\.some\(\(t\) => t\.code === wanted\)/.test(src));
  check('지정 유형이 자동 추정보다 우선한다', /const focus = pickedMisc[\s\S]{0,400}\? `The student CHOSE to practice/.test(src));
  check('라우트가 focus_misconception 을 넘긴다', /body\.focus_misconception/.test(pts));
  check('화면이 취약 유형을 버튼으로 만든다', /class="mi-go" data-misc=/.test(html));
  check('결과 화면에 이 유형 재연습 버튼이 있다', /id="again" data-misc=/.test(html));
  check('지정 연습은 미리 받아둔 일반 문제를 쓰지 않는다', /if\(focusMisc\)\{[\s\S]{0,120}prefetch = null/.test(html));
  check('클릭 핸들러가 이벤트 객체를 인자로 넘기지 않는다',
    !/addEventListener\('click', loadScenario\)/.test(html));
}

console.log('\n════════════════════════════════════════');
// ⚠️ 요약 문구 주의 — run.mjs 는 tail 에서 `숫자+FAIL/실패` 패턴을 실패로 판정합니다.
//    "PASS 36  FAIL 0" 처럼 쓰면 앞의 36 이 실패 건수로 오인됩니다. 실패 수를 먼저 씁니다.
console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
if (FAIL) { FAILS.forEach((f) => console.log('   ❌ ' + f)); process.exitCode = 1; }
console.log('════════════════════════════════════════\n');
