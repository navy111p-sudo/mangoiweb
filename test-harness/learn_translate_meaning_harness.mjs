// -*- coding: utf-8 -*-
// 🗣️ 「뜻 보기」 의역 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/learn_translate_meaning_harness.mjs
//   대상:  cloudflare-deploy/src/learn-phrase-ko.ts  (순수 모듈 — 직접 import 해 «실제로 돌립니다»)
//          cloudflare-deploy/src/api-mango.ts        (learn 모드 배선 대조)
//          public/{ai-friend,warmup,speech-coach,student-game-shooter,english-mastery-suite}.html
//
//   발단(2026-08-31 사장님 제보): AI 영어친구 말풍선의 「뜻」 버튼이
//     「Good job! 🦊 Do you have a pet animal?」 를
//     「훌륭한 직업! 당신은 애완 동물이 있습니까?」 로 보여 주었습니다.
//   뿌리가 둘이었습니다 —
//     ① ai-friend.html 이 /api/translate 를 «모드 없이» 불러 m2m100 직역 경로를 탔습니다.
//        웜업(warmup.html)은 2026-08-24 에 이미 mode:'learn' 으로 고쳐져 있었는데
//        AI 친구 화면만 빠져 있었습니다(같은 판정이 두 곳, 한쪽만 수리).
//     ② learn 모드도 «확률» 이라, 제일 자주 나오고 제일 크게 틀리는 말머리 칭찬 상투구는
//        src/learn-phrase-ko.ts 로 «결정론» 처리합니다.
//
//   이 하니스가 지키는 것:
//     A. 상투구 표가 성립한다 (소문자 키·한국어 값·직역 잔재 없음)
//     B. 말머리를 실제로 떼어 낸다 — 이모지·겹칭찬·문장 전체가 상투구인 경우까지
//     C. ⛔ 떼면 안 되는 것은 안 뗀다 — 종결부호 없는 「Good job on ...」·「Goodbye!」·문장 속 job
//     D. 서버 배선 — 캐시 접두사가 올라갔고, 번역에 «뗀 나머지» 를 넘기고, 다시 잇는다
//     E. 화면 배선 — 학생이 읽는 «뜻» 은 전부 mode:'learn' 로 부른다
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const P = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/learn-phrase-ko.ts').replace(/\\/g, '/'));
const SRC = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/' + f), 'utf8');
const MANGO = SRC('src/api-mango.ts');
const PUB = (f) => SRC('public/' + f);

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const peel = (s) => P.peelLearnLead(s);
const lead = (input, wantKo, wantRest) => {
  const r = peel(input);
  check(`${JSON.stringify(input)} → 「${wantKo}」 + ${JSON.stringify(wantRest)}`,
    r.leadKo === wantKo && r.rest === wantRest,
    `실제: 「${r.leadKo}」 + ${JSON.stringify(r.rest)}`);
};

console.log('\n[ A. 상투구 표가 성립한다 ]');
{
  const T = P.LEARN_LEAD_KO;
  const keys = Object.keys(T);
  check('표에 항목이 넉넉히 있다 (30개 이상)', keys.length >= 30, `${keys.length}개`);
  check('키는 전부 소문자다 (조회가 toLowerCase 라 대문자 키는 영영 안 걸린다)',
    keys.every((k) => k === k.toLowerCase()), keys.filter((k) => k !== k.toLowerCase()).join(', '));
  check('값은 전부 한글이다', keys.every((k) => /[가-힣]/.test(T[k])),
    keys.filter((k) => !/[가-힣]/.test(T[k])).join(', '));
  check('⛔ 값에 직역 잔재가 없다 (직업·재판·시도해)',
    keys.every((k) => !/직업|재판/.test(T[k])), keys.filter((k) => /직업|재판/.test(T[k])).join(', '));
  check('⛔ 값에 「당신」이 없다 — 아이가 읽는 카드다',
    keys.every((k) => !/당신/.test(T[k])));
  check('⛔ 값이 「~습니까」로 끝나지 않는다 — 해요체 고정',
    keys.every((k) => !/습니(다|까)$/.test(T[k])));
  check('이번 사고의 당사자가 표에 있다',
    T['good job'] === '잘했어요' && T['great try'] === '좋은 시도예요' && T['nice answer'] === '좋은 대답이에요');
  check('프롬프트 예시가 「Good job ≠ 직업」을 못 박는다',
    /Good job/.test(P.LEARN_GLOSS_HINT) && /잘했어요/.test(P.LEARN_GLOSS_HINT) && /직업/.test(P.LEARN_GLOSS_HINT));
}

console.log('\n[ B. 말머리를 실제로 떼어 낸다 ]');
{
  // 사장님 화면에 실제로 찍힌 세 줄 그대로
  lead('Good job! 🦊 Do you have a pet animal?', '잘했어요!', '🦊 Do you have a pet animal?');
  lead('Great try! Is the animal big?', '좋은 시도예요!', 'Is the animal big?');
  lead('Nice answer! 🐻 Are famous animals big?', '좋은 대답이에요!', '🐻 Are famous animals big?');
  // 문장 전체가 상투구
  lead('Good job!', '잘했어요!', '');
  lead('Perfect!', '완벽해요!', '');
  // 겹칭찬 — 두 개까지 떼어 낸다
  lead('Great try! Nice sentence! Do you like cats?', '좋은 시도예요! 문장 잘 만들었어요!', 'Do you like cats?');
  // 마침표·쉼표도 종결부호로 본다
  lead('Well done. What did you eat?', '잘했어요.', 'What did you eat?');
  lead('Wow, that is a big dog!', '와,', 'that is a big dog!');
  // 이모지가 사라지지 않는다
  check('떼어 낸 뒤에도 원문 이모지가 남는다', (() => {
    const r = peel('Nice sentence! 🎉 What is your name?');
    return r.leadKo === '문장 잘 만들었어요!' && r.rest.includes('🎉');
  })());
  // 대소문자·물결표
  lead('GOOD JOB! Try again.', '잘했어요!', 'Try again.');
  lead('Awesome~ Keep reading.', '최고예요~', 'Keep reading.');
  // 잇기
  check('joinLearnLead 가 한 줄로 잇는다',
    P.joinLearnLead('잘했어요!', '반려동물 키워요?') === '잘했어요! 반려동물 키워요?');
  check('joinLearnLead 는 한쪽이 비면 나머지만 준다',
    P.joinLearnLead('잘했어요!', '') === '잘했어요!' && P.joinLearnLead('', '반려동물 키워요?') === '반려동물 키워요?');
}

console.log('\n[ C. ⛔ 떼면 안 되는 것은 안 뗀다 ]');
{
  // 종결부호가 없으면 «문장의 일부» 일 수 있다 → 통째로 번역에 넘긴다
  lead('Good job on your sentence today', '', 'Good job on your sentence today');
  lead('Nice work if you can get it', '', 'Nice work if you can get it');
  // 낱말 경계 — Good 이 Goodbye 를 물면 안 된다
  lead('Goodbye! See you tomorrow.', '', 'Goodbye! See you tomorrow.');
  lead("Nicely done! Try one more.", '', 'Nicely done! Try one more.');
  // 문장 «안» 의 job 은 진짜 명사다 — 건드리지 않는다
  lead('I like your job.', '', 'I like your job.');
  lead('My dad has a good job.', '', 'My dad has a good job.');
  // 한국어 문장은 손대지 않는다
  lead('오늘 잘했어요!', '', '오늘 잘했어요!');
  check('빈 값·null 에도 안 죽는다', (() => {
    for (const v of ['', '   ', null, undefined]) { const r = peel(v); if (r.leadKo !== '') return false; }
    return true;
  })());
  check('두 번 돌려도 결과가 같다(멱등)', (() => {
    for (const s of ['Good job! Nice to meet you.', 'I like your job.', 'Perfect!']) {
      const a = peel(s); const b = peel(a.rest);
      if (b.leadKo && a.rest === s) return false;   // 안 뗀 것을 두 번째에 떼면 안 된다
    }
    return true;
  })());
}

console.log('\n[ C-2. 표 전수 — 모든 상투구가 실제로 떼어지고, 직역이 남지 않는다 ]');
{
  const T = P.LEARN_LEAD_KO;
  const bodies = ['Do you have a pet animal?', 'What is your name?', 'I like dogs.', '🦊 Is the animal big?'];
  let bad = [];
  for (const k of Object.keys(T)) {
    for (const body of bodies) {
      const en = k[0].toUpperCase() + k.slice(1) + '! ' + body;
      const r = peel(en);
      if (r.leadKo !== T[k] + '!') bad.push(`${en} → 「${r.leadKo}」`);
      else if (r.rest !== body) bad.push(`${en} → rest ${JSON.stringify(r.rest)}`);
    }
  }
  check(`표의 상투구 ${Object.keys(T).length}종 × 문장 ${bodies.length}종이 전부 정확히 떼어진다`,
    bad.length === 0, bad.slice(0, 4).join(' / '));
  check('⛔ 어느 조합에서도 「직업」이 나오지 않는다',
    Object.keys(T).every((k) => !/직업/.test(peel(k[0].toUpperCase() + k.slice(1) + '! Hello.').leadKo)));
}

console.log('\n[ D. 서버 배선 — api-mango.ts learn 모드 ]');
{
  check('learn-phrase-ko 정본을 import 한다 (규칙을 복사하지 않는다)',
    /import \{[^}]*peelLearnLead[^}]*\} from '\.\/learn-phrase-ko'/.test(MANGO));
  check('캐시 접두사가 trl2 로 올라갔다 — 「훌륭한 직업!」이 담긴 trl1 캐시와 안 섞인다',
    /learnMode \? 'trl2:'/.test(MANGO) && !/learnMode \? 'trl1:'/.test(MANGO));
  check('learn 프롬프트가 정본 예시(LEARN_GLOSS_HINT)를 주입한다',
    /LEARN_GLOSS_HINT/.test(MANGO.slice(MANGO.indexOf('const learnSys'), MANGO.indexOf('const learnSys') + 1600)));
  check('learn 프롬프트가 「당신」·「~습니까」를 금지한다',
    /Never write 「당신」/.test(MANGO) && /Never translate a question as 「~습니까\?」/.test(MANGO));
  // ⚠️ 여기가 핵심 — 떼어 낸 «나머지(src)» 를 번역에 넘겨야 한다.
  //    누가 다시 t 로 되돌리면 뗀 한국어가 버려지고 사고가 그대로 재현된다.
  /* ⚠️ 앵커를 «본문 글자» 로 잡으면 안 된다 — 같은 모양의 루프가 이 파일에 두 벌 있어
     indexOf 가 앞의 무관한 블록을 잘라 온다(실제로 밟았습니다).
     learn 모드의 캐시키 선언에서 시작해 그 «다음» 루프까지로 좁힙니다. */
  const at = MANGO.indexOf("const cacheKey = (t: string) => (learnMode");
  const s0 = MANGO.indexOf('if (need.length && ai) {', at);
  const loop = MANGO.slice(s0, MANGO.indexOf('} else if (need.length) {', s0));
  check('learn 모드 번역 루프를 찾았다', at > 0 && s0 > at && loop.length > 200, `len=${loop.length}`);
  check('번역 루프가 말머리를 먼저 떼어 낸다', /peelLearnLead\(t\)/.test(loop));
  check('언어모델에 «뗀 나머지» 를 넘긴다', /chatTranslate\(src\)/.test(loop) && !/chatTranslate\(t\)/.test(loop));
  check('m2m100 폴백에도 «뗀 나머지» 를 넘긴다',
    /text: src, source_lang: srcOf\(src\)/.test(loop) && !/text: t, source_lang: srcOf\(t\)/.test(loop));
  check('번역 뒤 다시 잇는다', /joinLearnLead\(lead\.leadKo, out\)/.test(loop));
  check('남은 것이 이모지·부호뿐이면 번역하지 않는다', /const needsMt =/.test(loop) && /if \(!needsMt\)/.test(loop));
  check('⛔ learn 모드는 target=ko 일 때만 떼어 낸다', /learnMode && target === 'ko'/.test(loop));
}

console.log('\n[ E. 화면 배선 — 학생이 읽는 «뜻» 은 전부 mode:\'learn\' ]');
{
  // 「/api/translate 를 부르는 그 fetch 블록 안에 mode:'learn' 이 있는가」 를 봅니다.
  const callsLearn = (html, near) => {
    const i = html.indexOf(near);
    if (i < 0) return null;
    return /mode:\s*'learn'/.test(html.slice(i, i + 400));
  };
  check('ai-friend.html 「뜻」 — 이번 제보의 당사자',
    callsLearn(PUB('ai-friend.html'), "texts: [key], target: 'ko'") === true);
  check('warmup.html 「뜻」 (2026-08-24 부터)',
    callsLearn(PUB('warmup.html'), "texts:[key], target:'ko'") === true);
  check('speech-coach.html 목표 문장 「뜻」',
    callsLearn(PUB('speech-coach.html'), "texts: [t], target: 'ko'") === true);
  check('student-game-shooter.html 미션 문장 「뜻」',
    callsLearn(PUB('student-game-shooter.html'), "texts:[s], target:'ko'") === true);
  check('english-mastery-suite.html 목표 문장 「뜻」',
    callsLearn(PUB('english-mastery-suite.html'), "texts:[s], target:'ko'") === true);
  // 낱말 팝업(사전 뜻)과 space-monster 배치는 «일부러» 기본 경로 그대로 — 이유가 적혀 있어야 한다
  check('space-monster 배치는 기본 경로이고 «왜» 가 적혀 있다', (() => {
    const h = PUB('student-game-space-monster.html');
    return /여기만 mode:'learn'\(의역\)을 «안» 쓴다/.test(h) && /50/.test(h);
  })());
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} learn_translate_meaning_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
