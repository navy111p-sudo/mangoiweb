// -*- coding: utf-8 -*-
// 🧑‍🎓 판단력 훈련 — 성인 카테고리(누구를 위한 문제인가) 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/judgment_agegroup_harness.mjs
//   대상:  cloudflare-deploy/src/judgment-level.ts · judgment-english.ts (순수 모듈 — 직접 import)
//          cloudflare-deploy/src/api-judgment.ts · public/judgment.html (소스 대조)
//
//   배경(2026-08-24 제안서): 「학생 나이에 따라 질문·대답 수준이 달라야 하지 않을까」에서
//   출발해, 벤치마킹(Cambridge 등)에서 확인한 「실력 축과 소재·어투 축은 분리한다」 원칙과
//   사장님이 정리한 「최소 범위 — 성인 카테고리 하나만, 기존 것은 그대로」를 합쳐 구현했다.
//   이 하니스가 지키는 것:
//     A. AgeGroup 정규화가 항상 'child'/'adult' 둘 중 하나로 떨어진다(옛 저장값 호환)
//     B. bandPromptLine·englishQualityRules·grammarCheckPrompt 가 나이대로 문구를 가른다
//        (기본값은 지금까지의 문구와 완전히 같다 — 기존 학생 29,000명 무영향)
//     C. 밴드(읽기 실력) 자체는 나이대와 무관하게 그대로 재사용된다(숫자 스펙 불변)
//     D. api-judgment.ts 가 나이대를 밴드처럼 KV 상태에 저장·복원하고, 바뀔 때만 쓴다
//     E. 성인 소재 풀이 아이 소재 풀과 완전히 분리돼 있고, 생성·검증 양쪽에 실제로 꽂혀 있다
//     F. 채점(evaluateJudgmentAnswer) 피드백도 서버가 기억한 나이대를 따른다(클라이언트 자기신고 아님)
//     G. 화면(judgment.html)에 토글이 있고, 기존 난이도 모드 토글과 서로 안 겹친다
//     H. 나이대를 바꾸면 미리 받아둔 문제(prefetch)를 버린다(밴드 전환과 같은 원칙)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const L = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/judgment-level.ts').replace(/\\/g, '/'));
const E = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/judgment-english.ts').replace(/\\/g, '/'));
const SRVJ = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8');
const HTML = readFileSync(resolve(__dir, '../cloudflare-deploy/public/judgment.html'), 'utf8');
// ⚠️ /api/judgment/scenario 의 실제 HTTP 핸들러는 src/index.ts 가 아니라 api-points.ts 에 있다.
//   generatePersonalizedScenario() 를 아무리 고쳐도 여기서 body.age_group 을 안 읽으면
//   화면 토글이 조용히 무동작한다(trap-check 2026-08-24 실측 — 에러 없이 계속 아이 문제만 나감).
const SRVP = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-points.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

console.log('\n[ A. AgeGroup 정규화 — 항상 child/adult 둘 중 하나 ]');
{
  check('기본값은 child', L.DEFAULT_AGE_GROUP === 'child', L.DEFAULT_AGE_GROUP);
  check('adult 는 그대로 읽는다', L.normalizeAgeGroup('adult') === 'adult');
  check('대소문자·공백을 견딘다', L.normalizeAgeGroup(' ADULT ') === 'adult');
  check('모르는 값·빈 값·null 은 전부 child(옛 저장값 호환)',
    ['', null, undefined, 'xx', 0, {}, 'kid', 'teen'].every((v) => L.normalizeAgeGroup(v) === 'child'));
  check('child 를 명시해도 child', L.normalizeAgeGroup('child') === 'child');
}

console.log('\n[ B. 프롬프트가 나이대로 문구를 가르는가 — 기본값은 기존 문구와 완전히 같다 ]');
{
  const childLine = L.bandPromptLine(3);           // ageGroup 생략 → 기본값
  const childLineExplicit = L.bandPromptLine(3, 'child');
  const adultLine = L.bandPromptLine(3, 'adult');
  check('ageGroup 생략과 명시적 child 가 완전히 같다(하위호환)', childLine === childLineExplicit);
  check('아이용은 여전히 "the child reads" 를 쓴다', /the child reads/.test(childLine));
  check('성인용은 "the adult learner reads" 로 바뀐다', /the adult learner reads/.test(adultLine));
  check('성인용에는 "the child" 가 안 남는다', !/the child/.test(adultLine));
  check('아이용 "a child would really say" 유지', /a child would really say/.test(childLine));
  check('성인용은 "an adult would really say" 로 바뀐다', /an adult would really say/.test(adultLine));
  // 문법 지시(2026-08-24 앞선 사고 수리분)는 나이대와 무관하게 둘 다 유지돼야 합니다
  check('두 버전 다 문법 완전성 지시가 살아있다',
    /grammatically correct English/.test(childLine) && /grammatically correct English/.test(adultLine));
  check('두 버전 다 "never drop words" 안전장치가 살아있다',
    /never drop words like "to"/.test(childLine) && /never drop words like "to"/.test(adultLine));

  const eqBase = E.englishQualityRules(false);
  const eqBaseExplicit = E.englishQualityRules(false, 'child');
  check('englishQualityRules(false) 는 나이대 인자가 없어도 있어도 같다', eqBase === eqBaseExplicit);
  const eqBrokenChild = E.englishQualityRules(true, 'child');
  const eqBrokenAdult = E.englishQualityRules(true, 'adult');
  check('문법연습(child)은 "a Korean child" 를 쓴다', /a Korean child actually makes/.test(eqBrokenChild));
  check('문법연습(adult)은 "a Korean adult learner" 로 바뀐다', /a Korean adult learner actually makes/.test(eqBrokenAdult));
  check('문법연습(adult)에는 child 가 안 남는다', !/\bchild\b/.test(eqBrokenAdult));
  // 문법 오류 없는(기본) 규칙은 나이대와 무관 — "Want play with me" 반례는 둘 다 안 걸리는 쪽(오답전용 아님)
  check('허용 안 하는 기본 규칙엔 나이대 인자가 필요 없다(문법 반례는 그대로)',
    /Want play with me/.test(E.englishQualityRules(false, 'adult')));

  const gcChild = E.grammarCheckPrompt(['test'], 'child');
  const gcAdult = E.grammarCheckPrompt(['test'], 'adult');
  check('교정 프롬프트가 아이용/성인용을 가른다', gcChild !== gcAdult);
  check('성인용 교정 프롬프트에 "children" 이 안 남는다', !/children/.test(gcAdult));
  check('교정 프롬프트 인자 생략 시 기본은 child', E.grammarCheckPrompt(['test']) === gcChild);
}

console.log('\n[ C. 밴드(읽기 실력) 숫자 스펙은 나이대와 무관하게 재사용된다 ]');
{
  check('밴드 스펙 개수는 8개 그대로', L.BAND_SPECS.length === L.BAND_COUNT);
  check('bandLabel·bandCatalog 는 ageGroup 인자를 안 받는다(실력 축 = 그대로 재사용)',
    L.bandLabel.length <= 1 && L.bandCatalog.length === 0);
  // 아이용·성인용 문장이 같은 밴드에서 같은 단어 수 범위를 요구하는지(소재만 바뀌고 실력 스펙은 불변)
  const c1 = L.bandPromptLine(1, 'child'), a1 = L.bandPromptLine(1, 'adult');
  const wordsOf = (s) => (s.match(/(\d+)-(\d+) words long/) || [])[0];
  check('밴드 1의 단어 수 범위는 아이용·성인용이 동일하다', wordsOf(c1) === wordsOf(a1), `${wordsOf(c1)} vs ${wordsOf(a1)}`);
}

console.log('\n[ D. api-judgment.ts — 나이대를 밴드처럼 KV 상태에 저장·복원하는가 ]');
{
  check('BandState 에 ageGroup 필드가 있다', /ageGroup: AgeGroup;/.test(SRVJ));
  check('emptyBandState 의 기본 나이대는 DEFAULT_AGE_GROUP', /ageGroup: DEFAULT_AGE_GROUP, at: Date\.now\(\)/.test(SRVJ));
  check('readBandState 가 옛 저장값(ageGroup 없음)도 기본 child 로 읽는다',
    /ageGroup: normalizeAgeGroup\(j\?\.ageGroup\)/.test(SRVJ));
  check('요청에 age_group 이 오면 정규화해서 받는다', /wantAgeGroup = bandOpts\?\.ageGroup \? normalizeAgeGroup/.test(SRVJ));
  check('바뀌었을 때만 쓰기 조건에 들어간다(불필요한 KV 쓰기 방지)',
    /\|\| ageGroupChanged\) await writeBandState/.test(SRVJ));
  check('밴드(실력) 변경과 나이대 변경이 서로 독립으로 처리된다(같은 요청에 함께 와도 안 얽힘)',
    /if \(wantAgeGroup\) bandState = \{ \.\.\.bandState, ageGroup: wantAgeGroup/.test(SRVJ));
  check('레벨 찾기(배치테스트) 중에도 나이대는 학생이 저장해 둔 값을 그대로 쓴다(탐색은 밴드만)',
    /const ageGroup: AgeGroup = bandState\.ageGroup;/.test(SRVJ));
  check('응답에 age_group 을 함께 내려준다', /age_group: ageGroup,/.test(SRVJ));
  check('생성 실패 응답에도 age_group 이 실려 있다(화면이 계속 알 수 있게)',
    /error: 'scenario_unavailable', reading_band: askBand, age_group: ageGroup/.test(SRVJ));
}

console.log('\n[ D-2. 기존 학생(child)에게 실제로 들어가는 프롬프트 문자열이 글자 하나까지 그대로인가 ]');
{
  // ★ trap-check 실측(2026-08-24): 나이대 분기를 만들면서 삼항연산자 밖에 있던 문장이
  //   child/adult 구분 없이 통째로 바뀌어 기존 29,000명 학생의 채점 프롬프트가 미세하게
  //   달라질 뻔했다("this child"→"the child", "a child who picked"→그냥 "picking"으로 누락).
  //   이 저장소는 프롬프트 한 줄 차이로 실사고를 겪은 전례가 있어(Want play with me),
  //   존재 여부가 아니라 "child 분기일 때 원문과 100% 같은가"를 정확 문자열로 대조한다.
  check('생성 프롬프트: 난이도 설명이 아이 분기에서 "this child" 로 나간다(소스상 삼항연산자 확인)',
    /how hard this judgment is for \$\{isAdult \? 'this learner' : 'this child'\}:/.test(SRVJ));
  check('채점 프롬프트: register_awareness 가 "a child who picked" 를 그대로 쓴다(아이 분기)',
    /Judge the CHOICE FIRST — \$\{isAdultAnswer \? 'a learner' : 'a child'\} who picked the right register/.test(SRVJ));
  check('같은 줄이 성인 분기에서는 "a learner" 로 갈린다', /'a learner' : 'a child'/.test(SRVJ));
  check('난이도 설명도 성인 분기에서 "this learner" 로 갈린다', /'this learner' : 'this child'/.test(SRVJ));
}

console.log('\n[ E. 성인 소재 풀이 실제로 분리돼 있고 생성·검증에 꽂혀 있는가 ]');
{
  check('ADULT_SCENARIO_THEMES 가 따로 있다', /const ADULT_SCENARIO_THEMES = \[/.test(SRVJ));
  const themeMatch = SRVJ.match(/const SCENARIO_THEMES = \[([\s\S]*?)\];/);
  const adultMatch = SRVJ.match(/const ADULT_SCENARIO_THEMES = \[([\s\S]*?)\];/);
  check('두 소재 풀 다 실제로 채워져 있다(빈 배열 아님)',
    !!themeMatch && !!adultMatch && themeMatch[1].trim().length > 20 && adultMatch[1].trim().length > 20);
  check('성인 풀에 아이 전용 소재(학교·놀이터·생일파티)가 안 섞여 있다',
    !!adultMatch && !/playground|birthday party|school cafeteria|classroom/.test(adultMatch[1]));
  check('아이 풀에는 성인 전용 소재(사무실·집세·면접)가 안 섞여 있다',
    !!themeMatch && !/coworker|landlord|job interview/.test(themeMatch[1]));
  check('판단 각도(SCENARIO_ANGLES)는 둘이 공유한다(나이·언어 중립 축이라 별도 목록 없음)',
    !/ADULT_SCENARIO_ANGLES/.test(SRVJ));
  check('생성기가 나이대로 소재 풀을 고른다', /const themeSet = isAdult \? ADULT_SCENARIO_THEMES : SCENARIO_THEMES;/.test(SRVJ));
  check('생성 프롬프트가 나이대로 "Korean child"/"Korean adult" 를 가른다',
    /const who = isAdult \? 'a Korean adult English learner' : 'a Korean child';/.test(SRVJ));
  check('levelLine 이 ageGroup 을 실제로 넘겨받는다', /bandPromptLine\(askBand, ageGroup\)/.test(SRVJ));
  check('qualityLine 이 ageGroup 을 실제로 넘겨받는다', /englishQualityRules\(allowBroken, ageGroup\)/.test(SRVJ));
  check('생성 결과 문법 재검증도 나이대를 넘겨받는다',
    /englishLooksCorrect\(ai, situation, opts4, allowBroken \? ci : null, ageGroup\)/.test(SRVJ));
  check('성인은 "교재" 프레이밍을 안 쓴다(성인 트랙에 교재 개념이 없음)',
    /const tbLine = \(!isAdult && tb\.textbook\)/.test(SRVJ));
}

console.log('\n[ F. 채점 피드백도 서버가 기억한 나이대를 따르는가(클라이언트 자기신고 아님) ]');
{
  check('출제 시 age_group 을 정답지 KV 에 함께 저장한다', /age_group: ageGroup,\n      \}\), \{ expirationTtl: SCENARIO_KEY_TTL \}\);/.test(SRVJ));
  check('채점은 서버 KV 의 age_group 만 믿는다(클라이언트가 안 보낸다)',
    /const askedAgeGroup: AgeGroup = \(trusted && keyed\?\.age_group != null\) \? normalizeAgeGroup\(keyed\.age_group\) : DEFAULT_AGE_GROUP;/.test(SRVJ));
  check('피드백 프롬프트가 나이대로 화자 표현을 가른다',
    /const learner = isAdultAnswer \? 'An adult learner' : 'A child';/.test(SRVJ));
  check('채점 시스템 프롬프트도 나이대로 갈린다',
    /You coach English decision-making for \$\{isAdultAnswer \? 'adult learners' : 'children'\}/.test(SRVJ));
}

console.log('\n[ G. 화면(judgment.html) — 토글이 있고 기존 난이도 모드 토글과 안 겹치는가 ]');
{
  check('나이대 토글 버튼 두 개가 있다', /data-g="child"/.test(HTML) && /data-g="adult"/.test(HTML));
  check('CUR_AGE 상태가 있고 기본은 child', /var CUR_AGE = 'child';/.test(HTML));
  check('captureBand 가 age_group 을 잡아 온다', /if\(d\.age_group\) CUR_AGE = \(d\.age_group==='adult'\) \? 'adult' : 'child';/.test(HTML));
  check('requestScenario 가 age_group 을 함께 보낸다', /if\(ageGroup\) body\.age_group = ageGroup;/.test(HTML));
  // ★ 이게 없으면 나이대 버튼을 눌러도 기존 밴드 모드 핸들러가 잘못 먹습니다(같은 .lvm-btn 클래스 재사용 때문)
  check('기존 난이도 모드 핸들러가 data-m 있는 것만 골라 듣는다(나이대 버튼과 안 겹침)',
    /querySelectorAll\('\.lvm-btn\[data-m\]'\)/.test(HTML));
  check('나이대 버튼 전용 클릭 핸들러가 별도로 있다', /querySelectorAll\('\.lva-btn'\)/.test(HTML));
  check('나이대 버튼 클릭이 loadScenario 에 g 를 5번째 인자로 넘긴다',
    /loadScenario\(null, 0, 0, null, g\);/.test(HTML));
  check('토글 두 줄 다 게임 연출(캐릭터·콘페티 등)은 안 건드린다(문구만 다름)',
    !/confetti\(\)[\s\S]{0,200}age_group/.test(HTML));
}

console.log('\n[ D-3. HTTP 핸들러(api-points.ts)가 age_group 을 실제로 서버까지 배선하는가 ]');
{
  // ★ 이 절이 핵심이다 — 2026-08-24 trap-check 실측: generatePersonalizedScenario 가 ageGroup 을
  //   받도록 다 고쳐 놓고도, 그 함수를 실제로 부르는 HTTP 핸들러(/api/judgment/scenario, src/index.ts
  //   가 아니라 api-points.ts 안에 있다)가 body.age_group 을 안 읽으면 화면 토글이 통째로 무동작한다.
  //   에러도, 타입 에러도, tsc 실패도 없다 — "값을 넣었는데 payload 엔 늘 빈 값" 계열 함정과 같은 뿌리.
  check('/api/judgment/scenario 핸들러가 존재한다', /generatePersonalizedScenario\(/.test(SRVP));
  check('그 핸들러가 body.age_group 을 읽어 bandOpts 로 넘긴다',
    /ageGroup: \(body\.age_group \|\| ''\)\.toString\(\)\.trim\(\) \|\| null/.test(SRVP));
  check('기존 밴드 옵션(nudge·setBand·mode·probeBand·src) 배선 방식과 같은 자리·같은 패턴이다',
    /setBand: Number\(body\.set_band\)[\s\S]{0,400}ageGroup: \(body\.age_group/.test(SRVP));
}

console.log('\n[ H. 나이대를 바꾸면 미리 받아둔 문제를 버리는가(밴드 전환과 같은 원칙) ]');
{
  check('loadScenario 가 ageGroup 도 폐기 조건에 넣는다',
    /if\(focusMisc \|\| nudge \|\| setBand \|\| mode \|\| ageGroup\)\{/.test(HTML));
  check('요청도 ageGroup 을 실제로 실어 보낸다(폐기만 하고 새 값을 안 보내면 무의미)',
    /p = requestScenario\(focusMisc, nudge, setBand, mode, 0, null, ageGroup\);/.test(HTML));
  check('전환 중 안내 문구가 따로 있다(그냥 "맞춤 문제를 만들고 있어요" 로 뭉개지 않음)',
    /성인용 문제로 바꾸고 있어요/.test(HTML) && /학생용 문제로 바꾸고 있어요/.test(HTML));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`판단력 성인카테고리 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
