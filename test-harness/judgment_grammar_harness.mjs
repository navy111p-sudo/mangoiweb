// -*- coding: utf-8 -*-
// 🧐 판단력 훈련 — 영어 문장 품질(문법) 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/judgment_grammar_harness.mjs
//   대상:  cloudflare-deploy/src/judgment-english.ts (순수 모듈 — 직접 import)
//          cloudflare-deploy/src/api-judgment.ts / judgment-level.ts (소스 대조)
//
//   발단(2026-08-24 사장님 지적): 실서비스 문항에 «Want play with me» (to 누락) 같은
//   깨진 영어가 선택지로 그대로 나갔습니다. 문항은 문제은행이 아니라 LLM 실시간 생성이라
//   «데이터 수정»으로는 못 고치고, 생성 규칙·검증이 정본입니다. 이 하니스가 지키는 것:
//     A. 품질 규칙 — 기본 문항은 «모든» 선택지가 문법이 맞아야 한다고 못 박는다
//     B. 예외는 학생이 문법 유형(형태/시제) 연습을 «직접 고른» 문항뿐이다
//     C. 교정(검증) 프롬프트가 줄 번호·strict JSON 계약을 지킨다
//     D. 생성기가 규칙을 프롬프트에 넣고, 결과를 검사해 어긋나면 다시 뽑는다
//        (지시만으로는 안 지켜진다 — 단어 수 실측과 같은 뿌리)
//     E. 밴드 프롬프트가 「단어 수 맞추려고 문법 깨기」를 금지한다
//        (첫걸음의 5단어 상한이 to 탈락 전보문을 유도했던 실사고)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const E = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/judgment-english.ts').replace(/\\/g, '/'));
const L = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/judgment-level.ts').replace(/\\/g, '/'));
const SRVJ = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

console.log('\n[ A. 품질 규칙 — 기본 문항은 모든 선택지가 문법이 맞아야 한다 ]');
{
  const base = E.englishQualityRules(false);
  check('규칙 문자열이 실제로 나온다', typeof base === 'string' && base.length > 100);
  check('«모든 선택지»의 문법을 요구한다', /EVERY option/.test(base) && /grammatically correct/.test(base));
  check('오답은 말투·적합성만 어긋나야 한다고 못 박는다', /ONLY in politeness, tone, or fit/.test(base));
  check('문법으로 틀린 오답을 명시적으로 금지한다', /NEVER in grammar/.test(base));
  // 실사고의 그 문장을 반례로 프롬프트에 박아 둔다 — 모델이 가장 잘 알아듣는 형식
  check('실사고 반례("Want play with me")를 예시로 든다', /Want play with me/.test(base));
  check('단어 수 때문에 단어를 떨어뜨리지 말라고 지시한다', /never make it fit by dropping words/.test(base));
}

console.log('\n[ B. 예외 — 문법 연습을 «직접 고른» 문항에서만 틀린 오답 허용 ]');
{
  const prac = E.englishQualityRules(true);
  check('문법 연습용 규칙은 기본 규칙과 다르다', prac !== E.englishQualityRules(false));
  check('연습 문항도 상황문·해설·정답은 흠 없어야 한다', /situation[\s\S]{0,80}BEST option must be complete, natural, grammatically correct/.test(prac));
  check('오답에는 «정확히 한 개»의 사실적 실수만 심는다', /exactly ONE realistic grammar mistake/.test(prac));
  check('허용 유형이 형태·시제 둘뿐이다',
    JSON.stringify([...E.GRAMMAR_PRACTICE_MISCONCEPTIONS].sort()) === JSON.stringify(['GRAMMAR_FORM', 'TENSE_CONFUSION']),
    JSON.stringify(E.GRAMMAR_PRACTICE_MISCONCEPTIONS));
  check('직접 고른 코드만 허용한다(대소문자·공백 견딤)',
    E.allowsBrokenDistractors('grammar_form') === true && E.allowsBrokenDistractors(' TENSE_CONFUSION ') === true);
  check('다른 유형·빈 값은 허용하지 않는다',
    ['REGISTER_MISMATCH', 'WORD_CHOICE', '', null, undefined].every((v) => E.allowsBrokenDistractors(v) === false));
  // ★ 자동 추정(취약 유형)이 문법이어도 오답을 깨면 안 됩니다 — 서버가 pickedMisc(직접 선택)로만 판정하는지
  check('생성기는 «직접 고른» 유형으로만 예외를 판정한다', /allowsBrokenDistractors\(pickedMisc\)/.test(SRVJ));
}

console.log('\n[ C. 교정(검증) 프롬프트 계약 ]');
{
  const p = E.grammarCheckPrompt(['Snow stops our bike ride.', 'Want play with me']);
  check('줄마다 번호를 붙인다', /1\. Snow stops our bike ride\./.test(p) && /2\. Want play with me/.test(p));
  check('strict JSON({"bad": …})을 요구한다', /STRICT JSON/.test(p) && /"bad"/.test(p));
  check('구어체는 허용한다고 알려준다(과잉 검열 방지)', /Wanna play\?/.test(p));
  check('빠진 단어·어순·동사형을 콕 집는다', /missing required word/.test(p) && /word order/.test(p) && /verb form/.test(p));
  check('빈 입력에도 안 터진다', typeof E.grammarCheckPrompt([]) === 'string' && typeof E.grammarCheckPrompt(null) === 'string');
}

console.log('\n[ D. 생성기가 규칙을 넣고, 결과를 검사해 다시 뽑는가 ]');
{
  // 2026-08-24: 성인 카테고리가 추가되며 englishQualityRules 가 나이대 인자를 받는다(judgment_agegroup_harness.mjs 참고).
  check('생성 프롬프트에 품질 규칙이 들어간다', /\$\{qualityLine\}/.test(SRVJ) && /const qualityLine = englishQualityRules\(allowBroken, ageGroup\)/.test(SRVJ));
  // ★ 지시만으로는 안 지켜집니다 — 결과를 실제로 검사하고 어긋나면 다시 뽑아야 합니다(단어 수 검사와 같은 원칙)
  check('생성 결과를 문법 검사해 어긋나면 다시 뽑는다', /attempt < 3 && !\(await englishLooksCorrect\(/.test(SRVJ));
  check('끝까지 안 맞으면 그래도 문제를 준다(마지막 시도는 수용)', /attempt < 3 && !\(await englishLooksCorrect/.test(SRVJ),
    '검증이 서비스 제공을 막으면 안 됩니다');
  check('문법 연습 문항은 상황문·정답만 검사한다(오답은 일부러 틀림)', /allowBroken \? ci : null/.test(SRVJ));
  check('검증기가 죽어도 통과로 취급한다(문제 제공 우선)', /englishLooksCorrect[\s\S]{0,1200}catch \{ return true; \}/.test(SRVJ));
  check('검증도 하우스 모델을 쓴다(추가 외부 의존 없음)', /englishLooksCorrect[\s\S]{0,600}ai\.run\(JUDGE_MODEL/.test(SRVJ));
  // 채점 루브릭의 "wrong option" 이 «문법이 틀린 보기»로 읽히던 것 — 상황 부적합으로 못 박음
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('루브릭이 «상황에 안 맞는 오답»이라고 말한다(깨진 영어가 아니라)',
    /clearly wrong-for-the-situation option/.test(SRVJ) && !/A clearly rude or wrong option/.test(strip(SRVJ)));
}

console.log('\n[ E. 밴드 프롬프트 — 단어 수 제약이 문법을 깨게 두지 않는가 ]');
{
  const lines = L.BAND_SPECS.map((s) => L.bandPromptLine(s.band));
  check('모든 밴드가 «문법은 지키라»를 명시한다', lines.every((l) => /grammatically correct English/.test(l)));
  check('단어를 떨어뜨려 맞추지 말라고 지시한다(to 탈락 전보문 방지)',
    lines.every((l) => /never drop words like "to"/.test(l)));
  check('대신 더 짧은 자연스러운 표현을 고르라고 안내한다',
    lines.every((l) => /different shorter natural expression/.test(l)));
  // 첫걸음(선택지 5단어 이하)이 이 사고의 진앙 — 그 밴드에서 반드시 나와야 합니다
  check('최저 밴드(첫걸음)에도 그 지시가 들어간다', /grammatically correct English/.test(L.bandPromptLine(1)));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`판단력 영어품질 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
