// -*- coding: utf-8 -*-
// ✒️ 문장 종결부호 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/sentence_punct_harness.mjs
//   대상:  cloudflare-deploy/src/sentence-punct.ts (순수 모듈 — 직접 import 해 «실제로 돌립니다»)
//          cloudflare-deploy/src/api-judgment.ts / api-exam.ts / api-games.ts (적용 자리 대조)
//
//   발단(2026-08-26 사장님 지시): 판단력 훈련 보기 A 는 «What's wrong with you?» 로 끝나는데
//   B·C·D 는 «Sorry, that was my fault» 처럼 맨몸이라 한 카드 안에서 규칙이 갈려 보였습니다.
//   물음표·느낌표는 뜻을 지고 가는 부호라 뺄 수 없으므로, 가지런하게 만드는 길은 마침표를 찍는 쪽뿐입니다.
//
//   이 하니스가 지키는 것:
//     A. 이미 끝난 문장·빈 값을 두 번 찍지 않는다
//     B. 부호를 «고른다» — 영어 의문문은 ?, 평서문은 . / 한국어는 종결어미로 가른다
//     C. ⛔ 확신이 없으면 «찍지 않는 쪽» 으로 실패한다 (한자·이모지·빈칸·판정불가)
//     D. 부호 «자리» — 따옴표에 싸인 문장은 안쪽, 끝에 달린 괄호 주석은 뒤
//     E. 실제로 적용돼 있다 — 판단력(보기·상황문·해설)·시험(문제문)·복습퀴즈(문제문·해설)
//     F. ⛔ 낱말 보기(choice opts)에는 찍지 않는다 — 「어려운.」 은 고장입니다
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const P = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/sentence-punct.ts').replace(/\\/g, '/'));
const SRC = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/src/' + f), 'utf8');
const JUD = SRC('api-judgment.ts'), EXAM = SRC('api-exam.ts'), GAMES = SRC('api-games.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const eq = (input, want) => check(`${JSON.stringify(input)} → ${JSON.stringify(want)}`,
  P.endSentence(input) === want, `실제: ${JSON.stringify(P.endSentence(input))}`);

console.log('\n[ A. 이미 끝난 문장·빈 값을 두 번 찍지 않는다 ]');
{
  eq("What's wrong with you?", "What's wrong with you?");
  eq('Elevator doors close on my briefcase.', 'Elevator doors close on my briefcase.');
  eq('Sounds good!', 'Sounds good!');
  eq('Wait...', 'Wait...');
  eq('Mr. Kim', 'Mr. Kim.');           // 약어 뒤에 낱말이 더 있으면 문장 끝이 아닙니다
  eq('', ''); eq('   ', ''); eq(null, ''); eq(undefined, '');
  eq('?', '?'); eq('...', '...');
  check('두 번 돌려도 같다(멱등)',
    ['Sorry, that was my fault', '맞나요', 'Can you help me'].every((s) => P.endSentence(P.endSentence(s)) === P.endSentence(s)));
}

console.log('\n[ B. 부호를 «고른다» — 의문문 ? · 평서문 . ]');
{
  eq('Sorry, that was my fault', 'Sorry, that was my fault.');
  eq("You're really careless", "You're really careless.");
  eq('Be more careful next time', 'Be more careful next time.');
  eq('Can you help me', 'Can you help me?');
  eq('What do you think', 'What do you think?');
  eq("Don't you have a pen", "Don't you have a pen?");
  eq('🎧 잘 듣고 알맞은 답을 고르세요', '🎧 잘 듣고 알맞은 답을 고르세요.');
  eq('이 문장이 맞나요', '이 문장이 맞나요?');
  eq('무엇입니까', '무엇입니까?');
  eq('오늘은 날씨가 좋다', '오늘은 날씨가 좋다.');
  check('부호 고르기 함수가 셋 중 하나만 돌려준다',
    ['', '.', '?'].includes(P.terminalMarkFor('아무 말')) && P.terminalMarkFor('Can you') === '?' && P.terminalMarkFor('') === '');
}

console.log('\n[ C. ⛔ 확신이 없으면 «찍지 않는 쪽» 으로 실패한다 ]');
{
  // 한자는 「。」를 쓰므로 여기서 손대면 안 됩니다
  eq('你好', '你好');
  eq('我很好', '我很好');
  // 이모지·쉼표로 끝나면 그대로
  eq('Sounds good 😊', 'Sounds good 😊');
  eq('Sorry,', 'Sorry,');
  // TOEIC 빈칸 문제문 — 밑줄로 끝나면 그대로
  eq('The manager ____', 'The manager ____');
  // ⚠️ do·have 는 명령문 머리로도 온다(2026-08-27 수리) — 뒤가 주어스러운 낱말일 때만 의문문.
  //    «Have a great day?» 가 실제로 나갈 뻔했던 오판. 명령문 쪽도 «.» 로 굳히지 않는다.
  eq('Have a great day', 'Have a great day');
  eq('Do your homework', 'Do your homework');
  check('«Do you…»·«Have you…» 는 여전히 의문문으로 확신한다',
    P.terminalMarkFor('Do you like pizza') === '?' && P.terminalMarkFor('Have you eaten lunch') === '?'
    && P.terminalMarkFor('Does she like pizza') === '?');
  // 🔴 그런데 «빈칸 표시 없이 그냥 잘린» 미완성 문장은 이 함수로 못 걸러 냅니다 —
  //    「I like to eat」(+ 보기 apple)에 마침표를 찍으면 문제가 깨집니다.
  //    그래서 그런 칸(시험 question_text)은 «호출하지 않는 것» 이 방어선입니다(E절에서 확인).
  check('⛔ 잘린 미완성 문장은 함수가 못 걸러 낸다 — 호출하지 않는 것이 방어선',
    P.endSentence('I like to eat') === 'I like to eat.');
  // 한국어인데 종결어미로 판정이 안 서면 그대로 («…단어는?» 인지 «…단어는.» 인지 알 수 없습니다)
  eq('다음 뜻에 해당하는 중국어 단어는', '다음 뜻에 해당하는 중국어 단어는');
  check('낱말 보기(한국어 뜻)는 손대지 않는다', P.endSentence('어려운') === '어려운');
  // ⚠️ 한국어 «반말» 은 평서문과 의문문의 어미가 같습니다(「고마워」 대 「뭐 해」) —
  //    그래서 일부러 판정을 보류합니다. 여기서 마침표를 찍으면 반말 의문문에 «.» 이 박힙니다.
  eq('고마워', '고마워');
  eq('뭐 해', '뭐 해');
  check('낱말 보기(영어)는 «호출하지 않는 것» 이 규칙이다(F절에서 실제로 확인)', true);
}

console.log('\n[ D. 부호 «자리» — 따옴표는 안쪽, 괄호 주석은 뒤 ]');
{
  eq('"Sorry"', '"Sorry."');
  eq('"Sorry."', '"Sorry."');
  eq('「Thank you」', '「Thank you.」');
  // ⚠️ 끝에 달린 괄호 주석은 «뒤» 에 찍어야 합니다 — 안쪽에 넣으면 「(nǐ hǎo.)」 가 됩니다
  eq('정답: 你好 (nǐ hǎo)', '정답: 你好 (nǐ hǎo).');
  eq('He said "hello"', 'He said "hello".');
  check('통째로 싸인 따옴표만 안쪽에 넣는다',
    P.endSentence('정답: 你好 (nǐ hǎo)').indexOf('.)') === -1);
}

console.log('\n[ E. 실제로 적용돼 있다 — 생성 결과를 코드에서 다듬는가 ]');
{
  check('정본 모듈은 import 가 없는 순수 모듈이다',
    !/^\s*import\s/m.test(readFileSync(resolve(__dir, '../cloudflare-deploy/src/sentence-punct.ts'), 'utf8')));
  // 판단력 훈련 — 보기·상황문·해설
  check('판단력: 보기를 다듬는다', /const opts4 = endSentences\(/.test(JUD));
  check('판단력: 상황문을 다듬는다', /const situation = endSentence\(/.test(JUD));
  check('판단력: 해설(영어·한국어)을 다듬는다',
    /why: endSentence\(/.test(JUD) && /why_ko: endSentence\(/.test(JUD));
  // 시험 — 문제문·듣기 대본 (⛔ 보기는 TOEIC 식 낱말·구라 제외)
  // 🔴 시험 문제문은 «찍지 않습니다» — 2026-08-26 실서비스 실측으로 되돌린 결정.
  //    이 칸에는 완결된 의문문(「What do I like?」)과 «빈칸이 끝에 오는 미완성 문장»
  //    (「I like to eat」 + 보기 apple)이 섞여 있고(10건 중 5건이 후자), 구별할 방법이 없습니다.
  check('⛔ 시험 문제문은 다듬지 않는다(빈칸이 끝에 오는 미완성 문장이 섞여 있다)',
    !/question_text: endSentence\(/.test(EXAM));
  check('시험: 듣기 대본은 다듬는다', /audio_script: endSentence\(/.test(EXAM));
  check('⛔ 시험 보기(choice_a~d)는 다듬지 않는다', !/choice_[abcd]: endSentence\(/.test(EXAM));
  // 복습퀴즈 — 문제문·해설·읽을 문장
  check('복습퀴즈: 문제문·해설을 다듬는다',
    /const explain = endSentence\(/.test(GAMES) && /let text = endSentence\(/.test(GAMES));
  check('복습퀴즈: 듣기 대본·정답 문장을 다듬는다',
    /item\.audio_text = endSentence\(/.test(GAMES) && /answer_text: endSentence\(/.test(GAMES));
  check('단어장: 예문을 다듬는다', /example = endSentence\(/.test(GAMES));
  // 프롬프트 보조 규칙 — 셋 다
  check('생성 프롬프트에도 구두점 규칙을 넣는다(보조)',
    [JUD, EXAM, GAMES].every((t) => /\$\{PUNCTUATION_PROMPT_RULE\}/.test(t)));
  check('프롬프트 규칙이 «낱말 보기에는 찍지 말라» 고 못 박는다',
    /take NO ending punctuation/.test(P.PUNCTUATION_PROMPT_RULE) && /A question ends with "\?"/.test(P.PUNCTUATION_PROMPT_RULE));
}

console.log('\n[ F. ⛔ 낱말 보기에는 찍지 않는다 — 「어려운.」 은 고장입니다 ]');
{
  // 소스 대조: choice 의 보기는 그대로, listen 의 보기만 문장으로 다듬는다
  check('복습퀴즈 보기는 listen 일 때만 다듬는다',
    /type === 'listen' \? endSentence\(v\) : v/.test(GAMES));
  check('⛔ 단어퀴즈 보기(한국어 뜻)는 다듬지 않는다', !/const opts = endSentences\(/.test(GAMES));
  // 실제 동작 재현 — 그 조건식을 그대로 옮겨 와 돌립니다(문자열 검사만으로는 못 잡습니다)
  const applyOpts = (type, opts) => opts.map((o) => (type === 'listen' ? P.endSentence(String(o).trim()) : String(o).trim()));
  check('choice 의 낱말 보기는 그대로 남는다',
    JSON.stringify(applyOpts('choice', ['어려운', '你好', 'go to school'])) === JSON.stringify(['어려운', '你好', 'go to school']));
  check('listen 의 문장 보기는 대본과 짝이 맞는다', (() => {
    const audio = P.endSentence('I like apples');
    const opts = applyOpts('listen', ['I like apples', 'I like grapes']);
    return audio === 'I like apples.' && opts[0] === audio;
  })());
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} sentence_punct_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
