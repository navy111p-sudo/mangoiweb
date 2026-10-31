// -*- coding: utf-8 -*-
// 🔤 «왜 고쳤는지» 설명 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/correction_reason_harness.mjs
//   대상:  cloudflare-deploy/src/correction-reason.ts  ← **직접 import 해 실제로 돌립니다**
//          cloudflare-deploy/src/api-ai.ts             ← 배선(그 함수를 정말 쓰는가)
//          cloudflare-deploy/src/api-judgment.ts       ← guessMisconception 계약
//
//   발단(2026-08-31 운영 D1 실측): AI 영작 첨삭 최근 8건, 교정 **21건 전부** 이유가
//   서버 폴백 일반 문구였습니다. 모델이 reason 을 매번 비워 보내고 있어서, 학생은
//   «무엇을» 고쳤는지는 보지만 «왜» 는 한 번도 배우지 못했습니다.
//   그래서 설명을 프롬프트가 아니라 **결정론 분류**로 만들고, 이 하니스가 지킵니다.
//
//   이 하니스가 지키는 것:
//     A. 실제 운영 교정 쌍이 «맞는 갈래» 로 분류된다 (문자열 검사가 아니라 실행)
//     B. ⛔ 모르는 것은 null — 지어내지 않는다 (틀린 설명은 «설명 없음» 보다 나쁩니다)
//     C. 조사(을/를)가 영어 낱말의 한국어 발음을 따른다 — 「'an'을」·「'and'를」
//     D. 표시는 **학생이 쓴 대소문자 그대로** (자기 글에서 어디를 보라는지가 분명해집니다)
//     E. guessMisconception(api-judgment.ts) 이 이 문구에서 오답유형을 뽑을 수 있다
//        ⛔ 특히 철자 교정이 TENSE_CONFUSION 으로 새면 안 됩니다
//     F. 되돌리면 FAIL — 실제로 소스를 변이시켜 보장이 살아 있는지 확인
//     G. api-ai.ts 가 그 함수를 정말 쓴다 (import 만 해 두고 안 쓰면 아무 소용 없습니다)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const SRCDIR = resolve(__dir, '../cloudflare-deploy/src');
const SRC = (f) => readFileSync(resolve(SRCDIR, f), 'utf8');
const CR_PATH = resolve(SRCDIR, 'correction-reason.ts');
const CR_SRC = readFileSync(CR_PATH, 'utf8');
const { explainCorrection } = await import('file://' + CR_PATH.replace(/\\/g, '/'));
const AI = SRC('api-ai.ts'), JUD = SRC('api-judgment.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
/** 원문→교정 쌍의 설명에 이 낱말들이 들어 있는가 (갈래 판정) */
const says = (o, s, ...must) => {
  const r = explainCorrection(o, s);
  check(`${JSON.stringify(o)} → ${must.join('·')}`,
    !!r && must.every((m) => r.includes(m)), `실제: ${JSON.stringify(r)}`);
  return r;
};
const isNull = (o, s) => check(`⛔ 모른다 → null: ${JSON.stringify(o)}`,
  explainCorrection(o, s) === null, `실제: ${JSON.stringify(explainCorrection(o, s))}`);

console.log('\n[ A. 실제 운영 교정 쌍이 «맞는 갈래» 로 분류된다 ]');
{
  // ── 관사 (2026-08-31 D1 실측 쌍)
  says('This place is lab', 'This place is a lab', '관사', "'a'");
  says('I ate amusement park', 'I ate an amusement park', '관사', "'an'");
  says('food was delicious', 'the food was delicious', '관사', "'the'");
  // ── 전치사
  says('I was at in my house', 'I was at my house', '전치사', "'in'");
  says('I go in school', 'I go to school', '전치사', 'to');
  // ── 시제
  says('I go there yesterday', 'I went there yesterday', '과거형', '시제');
  says('It is fun yesterday', 'It was fun yesterday', '과거형');
  says('I LOSED my watch', 'I lost my watch', '불규칙 과거형', 'LOSED');
  says('I runned fast', 'I ran fast', '불규칙 과거형');
  says('I never forget', 'I will never forget', 'will', '시제');
  // ── 철자 (편집거리가 길이에 따라 달라야 잡힙니다)
  says('I like junggle', 'I like jungle', '철자', 'junggle');
  says('many sutentents', 'many students', '철자', 'sutentents');   // 거리 4·10글자
  says('I play pootball', 'I play football', '철자', 'pootball');   // 첫 글자가 다름
  // ── 겹침·중복
  says('I went I went to the park', 'I went to the park', '두 번');
  says('playing with the soccer', 'playing soccer', '뺐어요');
  // ── 이어 주는 말
  says('I like it It is fun', 'I like it and it is fun', "'and'", '이어');
  // ── 어순
  says('I soccer play', 'I play soccer', '어순');
  // ── 대소문자·부호만
  says('i like it', 'I like it.', '대문자');
}

console.log('\n[ B. ⛔ 모르는 것은 null — 지어내지 않는다 ]');
{
  isNull('VERY BIG PRICE', 'a lot of money');
  isNull('I felt very nice', 'I felt really happy');
  isNull('soccer can not use hands', 'In soccer we can not use our hands');
  isNull('Maryland Juno', 'In Maryland with Juno');
  isNull('', 'anything');
  isNull('anything', '');
  isNull('   ', '   ');
  check('한 낱말이 통째로 다른 낱말이면 «철자» 라고 하지 않는다', (() => {
    const r = explainCorrection('I can lighting', 'I can ride');
    return !!r && !r.includes('철자');
  })());
  check('비율이 큰 낱말 바꿈(peoples→players)은 «철자» 가 아니다', (() => {
    const r = explainCorrection('11 peoples', '11 players');
    return !!r && !r.includes('철자');
  })());
}

console.log('\n[ C. 조사(을/를)가 한국어 발음을 따른다 ]');
{
  const j = (o, s) => explainCorrection(o, s) || '';
  check("'an' 뒤에는 을", j('I saw amusement park', 'I saw an amusement park').includes("'an'을"));
  check("'a' 뒤에는 를", j('This place is lab', 'This place is a lab').includes("'a'를"));
  check("'the' 뒤에는 를", j('food was good', 'the food was good').includes("'the'를"));
  check("'and' 뒤에는 를", j('I like it It is fun', 'I like it and it is fun').includes("'and'를"));
  check('⛔ 끝 글자로 어림하지 않는다(and 는 d 로 끝나지만 «앤드» 라 를)',
    !j('I like it It is fun', 'I like it and it is fun').includes("'and'을"));
}

console.log('\n[ D. 표시는 학생이 쓴 대소문자 그대로 ]');
{
  check('대문자로 쓴 낱말은 대문자로 보여 준다',
    (explainCorrection('I LOSED my watch', 'I lost my watch') || '').includes('LOSED'));
  check('원문 그대로라 소문자로 바꿔 보여 주지 않는다',
    !(explainCorrection('I LOSED my watch', 'I lost my watch') || '').includes('losed →'));
  check('앞뒤 문장부호는 떼고 보여 준다',
    (explainCorrection('I go there yesterday,', 'I went there yesterday,') || '').includes('go → went'));
}

console.log('\n[ E. guessMisconception 계약 — 오답유형이 조용히 null 이 되지 않는다 ]');
{
  // api-judgment.ts 에서 그 함수를 «오려 내» 실제로 돌립니다(문자열 검사로는 못 봅니다).
  const m = JUD.match(/export function guessMisconception\(reason: string\): string \| null \{[\s\S]*?\n\}/);
  check('api-judgment.ts 에서 guessMisconception 을 오려 냈다', !!m);
  const guess = m ? new Function('reason', m[0]
    .replace(/export function guessMisconception\(reason: string\): string \| null \{/, '')
    .replace(/\n\}$/, '')) : () => null;
  const typeOf = (o, s) => guess(explainCorrection(o, s) || '');
  check('과거형 설명 → TENSE_CONFUSION', typeOf('I go there yesterday', 'I went there yesterday') === 'TENSE_CONFUSION');
  check('불규칙 과거형 설명 → TENSE_CONFUSION', typeOf('I LOSED it', 'I lost it') === 'TENSE_CONFUSION');
  check('관사 설명 → GRAMMAR_FORM', typeOf('This place is lab', 'This place is a lab') === 'GRAMMAR_FORM');
  check('전치사 설명 → GRAMMAR_FORM', typeOf('I was at in my house', 'I was at my house') === 'GRAMMAR_FORM');
  check('어순 설명 → GRAMMAR_FORM', typeOf('I soccer play', 'I play soccer') === 'GRAMMAR_FORM');
  check('⛔ 철자 설명이 TENSE_CONFUSION 으로 새지 않는다',
    typeOf('I like junggle', 'I like jungle') !== 'TENSE_CONFUSION',
    `실제: ${typeOf('I like junggle', 'I like jungle')}`);
  check('⛔ 철자 교정 문구에 「과거」·「시제」가 없다', (() => {
    const r = explainCorrection('I like junggle', 'I like jungle') || '';
    return !/과거|시제/.test(r);
  })());
}

console.log('\n[ F. 되돌리면 FAIL — 소스를 실제로 변이시켜 확인 ]');
{
  // 변이체를 임시 .ts 로 써서 import 합니다. 보장이 살아 있으면 «변이 후 결과가 달라야» 합니다.
  const tmp = resolve(SRCDIR, '__cr_mutant.ts');
  let n = 0;
  const mutate = async (name, from, to, judge) => {
    if (!CR_SRC.includes(from)) { check(`변이 대상이 소스에 있다: ${name}`, false, `못 찾음: ${from.slice(0, 40)}`); return; }
    writeFileSync(tmp, CR_SRC.replace(from, to), 'utf8');
    try {
      const mod = await import('file://' + tmp.replace(/\\/g, '/') + '?v=' + (++n));
      check(`되돌리면 깨진다: ${name}`, judge(mod.explainCorrection));
    } catch (e) {
      check(`되돌리면 깨진다: ${name}`, false, '변이체 로드 실패 ' + e.message);
    } finally { try { unlinkSync(tmp); } catch { /* 이미 없음 */ } }
  };
  // ① 철자 허용거리를 옛 «고정 2» 로 되돌리면 긴 오타를 놓친다
  await mutate('철자 허용거리를 길이에 맞춘다',
    'return n >= 10 ? 4 : n >= 8 ? 3 : 2;', 'return 2;',
    (f) => !(f('many sutentents', 'many students') || '').includes('철자'));
  // ② 불규칙 과거형을 철자보다 «먼저» 보지 않으면 losed→lost 가 오타로 샌다
  await mutate('불규칙 과거형을 철자보다 먼저 본다',
    'for (const st of edStems(a)) {\n      if (PAST[st] === b)', 'for (const st of []) {\n      if (PAST[st] === b)',
    (f) => !(f('I LOSED it', 'I lost it') || '').includes('불규칙'));
  // ③ 조사 표를 지우면 「'an'를」 이 된다
  await mutate('조사 표(을/를)',
    "if (EUL_WORDS.has(k)) return '을';", "if (false) return '을';",
    (f) => !(f('I saw amusement park', 'I saw an amusement park') || '').includes("'an'을"));
  // ④ «모르면 null» 을 없애면 지어내기 시작한다
  await mutate('⛔ 모르면 null (지어내지 않는다)',
    '  return null;   // ⛔ 여기까지 왔으면 «모른다» — 지어내지 않는다',
    "  return '더 자연스럽게 다듬었어요.';",
    (f) => f('VERY BIG PRICE', 'a lot of money') !== null);
  // ⑤ 대소문자·부호만 다른 교정을 «원문 통째 비교» 로 되돌리면 설명이 사라진다
  await mutate('대소문자·부호만 다름은 «낱말 열» 로 비교한다',
    'if (oJoin === sJoin && digits(original) === digits(suggested)) {',
    'if (norm(original).toLowerCase() === norm(suggested).toLowerCase()) {',
    (f) => f('i like it', 'I like it.') === null);
  // ⑥ 표시를 소문자로 되돌리면 학생 글의 대문자가 사라진다
  await mutate('표시는 학생이 쓴 그대로',
    'const R = (i: number) => strip(remRaw[i]) || rem[i];', 'const R = (i: number) => rem[i];',
    (f) => !(f('I LOSED it', 'I lost it') || '').includes('LOSED'));
}

console.log('\n[ G. api-ai.ts 배선 — import 만 해 두고 안 쓰면 소용없다 ]');
{
  check("api-ai.ts 가 correction-reason 을 import 한다",
    /import \{ explainCorrection \} from '\.\/correction-reason'/.test(AI));
  check('폴백 문구는 explainCorrection 이 null 일 때만 쓴다',
    /explainCorrection\(orig, sug\) \|\| '[^']+'/.test(AI));
  check('모델 이유는 «한국어 6자 이상» 일 때만 쓴다',
    /if \(!\/\[가-힣\]\/\.test\(reason\) \|\| reason\.length < 6\) reason = _guessReason\(original, suggested\)/.test(AI));
  check('⛔ 옛 규칙기반 추측(_guessReason 본체)이 남아 있지 않다',
    !/_guessReason\s*=\s*\(orig: string, sug: string\): string => \{/.test(AI));
  check('이유가 비면 그 항목을 아예 내보내지 않는다',
    /\.filter\(\(it: any\) => it\.original && it\.suggested && it\.reason\)/.test(AI));
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} correction_reason_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
