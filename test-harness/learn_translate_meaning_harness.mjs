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

/* 🧹 주석을 벗긴 «살아 있는 코드» — 부정 검사(「이 글자가 없어야 한다」)는 반드시 이것으로 합니다.
   설명 주석에 「예전엔 chatTranslate(t) 였다」 한 줄만 적어도 거짓 FAIL 이 납니다.
   ⛔ 정규식 한 줄(/\/\*[\s\S]*?\*\//g)로 지우지 마세요 — 짝 없는 «별표+슬래시» 하나에
      뒷부분이 통째로 사라집니다(이 저장소가 실제로 두 번 밟았습니다). 줄 단위로 추적합니다. */
const noComment = (t) => {
  let inBlock = false;
  return t.split('\n').map((l) => {
    let out = '', i = 0;
    while (i < l.length) {
      if (inBlock) { const e = l.indexOf('*/', i); if (e < 0) { i = l.length; } else { inBlock = false; i = e + 2; } continue; }
      const b = l.indexOf('/*', i), ln = l.indexOf('//', i);
      if (ln >= 0 && (b < 0 || ln < b)) { out += l.slice(i, ln); break; }
      if (b >= 0) { out += l.slice(i, b); inBlock = true; i = b + 2; continue; }
      out += l.slice(i); break;
    }
    return out;
  }).join('\n');
};

const LIVE = noComment(MANGO);   // 주석을 벗긴 «살아 있는» api-mango.ts
/* 번역 루프만 잘라 낸다 — ⛔ 길이로 자르지 말 것(같은 모양의 루프가 이 파일에 두 벌 있다).
   learn 모드 캐시키 선언에서 시작해 그 «다음» 루프까지로 좁힌다. */
const loopSrc = () => {
  const at = MANGO.indexOf("const cacheKey = (t: string) => (learnMode");
  const s0 = MANGO.indexOf('if (need.length && ai) {', at);
  return MANGO.slice(s0, MANGO.indexOf('} else if (need.length) {', s0));
};

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

console.log('\n[ C-3. 고정 인사말 의역이 «서버 한 곳» 에 있다 ]');
{
  const G = (name, topic) => `Hi! I'm ${name}${name === 'your Mangoi AI friend' ? '' : '.'} \u{1F96D} `
    + (topic ? `Today's topic is "${topic}". ` : '') + `Let's warm up before class. How are you today?`;
  const ok = (s) => P.curatedLearnMeaning(s);
  check('옛 인사말(이름이 박혀 있던 것)을 받는다',
    /망고아이 AI 친구/.test(ok(G('your Mangoi AI friend'))) && /입을 풀어/.test(ok(G('your Mangoi AI friend'))));
  check('«고른 친구 이름» 이 들어간 새 인사말도 받는다 — 옛 정규식은 이걸 못 맞췄다',
    /저는 Lily 예요/.test(ok(G('Lily'))) && /저는 Noah 예요/.test(ok(G('Noah'))));
  check('오늘의 주제가 있으면 그대로 싣는다', /오늘의 주제는 "Animals"예요/.test(ok(G('Lily', 'Animals'))));
  check('⛔ 인사말이 아니면 빈 값 — 일반 번역 경로로 넘어간다',
    ok("Hi! I'm Lily. \u{1F96D} What is your name?") === '' && ok('Good job!') === '' && ok('') === '');
  // 배선 — 서버가 번역보다 «먼저» 이것을 보고, 화면에는 같은 판정이 남아 있지 않아야 한다
  check('서버가 번역 전에 고정 인사말을 먼저 본다',
    /curatedLearnMeaning\(t\)/.test(loopSrc()) &&
    loopSrc().indexOf('curatedLearnMeaning(t)') < loopSrc().indexOf('peelLearnLead(t)'));
  check('⛔ warmup.html 에 같은 판정이 남아 있지 않다 (정본은 서버 한 곳)',
    !/function\s+curatedMeaning\s*\(/.test(noComment(PUB('warmup.html'))));
  check('warmup 의 «자기가 쓴 한국어 미리 넣기» 는 그대로다 — 그건 판정이 아니라 빠른 길',
    /_koCache\[gEn\] = gKo/.test(PUB('warmup.html')));
}

console.log('\n[ D. 서버 배선 — api-mango.ts learn 모드 ]');
{
  check('learn-phrase-ko 정본을 import 한다 (규칙을 복사하지 않는다)',
    /import \{[^}]*peelLearnLead[^}]*\} from '\.\/learn-phrase-ko'/.test(MANGO));
  check('캐시 접두사가 trl2 로 올라갔다 — 「훌륭한 직업!」이 담긴 trl1 캐시와 안 섞인다',
    /learnMode \? 'trl2:'/.test(LIVE) && !/learnMode \? 'trl1:'/.test(LIVE));
  /* ⛔ 검사 범위를 «길이» 로 자르지 마세요 — 프롬프트에 줄만 더해도 보장은 그대로인데
     검사만 깨집니다. 「그 선언의 끝」(다음 선언)까지로 자릅니다. */
  const p0 = MANGO.indexOf('const learnSys');
  const learnSysBlock = MANGO.slice(p0, MANGO.indexOf('async function chatTranslate', p0));
  check('learn 프롬프트 선언을 찾았다', p0 > 0 && learnSysBlock.length > 300, `len=${learnSysBlock.length}`);
  check('learn 프롬프트가 정본 예시(LEARN_GLOSS_HINT)를 주입한다', /LEARN_GLOSS_HINT/.test(learnSysBlock));
  check('learn 프롬프트가 「당신」·「~습니까」를 금지한다',
    /Never write 「당신」/.test(MANGO) && /Never translate a question as 「~습니까\?」/.test(MANGO));
  // ⚠️ 여기가 핵심 — 떼어 낸 «나머지(src)» 를 번역에 넘겨야 한다.
  //    누가 다시 t 로 되돌리면 뗀 한국어가 버려지고 사고가 그대로 재현된다.
  const loop = loopSrc();
  const loopLive = noComment(loop);   // 부정 검사는 주석을 벗긴 사본으로
  check('learn 모드 번역 루프를 찾았다', loop.length > 200, `len=${loop.length}`);
  check('번역 루프가 말머리를 먼저 떼어 낸다', /peelLearnLead\(t\)/.test(loop));
  check('언어모델에 «뗀 나머지» 를 넘긴다', /chatTranslate\(src\)/.test(loopLive) && !/chatTranslate\(t\)/.test(loopLive));
  check('m2m100 폴백에도 «뗀 나머지» 를 넘긴다',
    /text: src, source_lang: srcOf\(src\)/.test(loopLive) && !/text: t, source_lang: srcOf\(t\)/.test(loopLive));
  check('어느 갈래로 가든 뗀 말머리를 다시 잇는다',
    (loopLive.match(/joinLearnLead\(lead\.leadKo,/g) || []).length >= 2);
  /* 🔴 여기가 이번 수리에서 «내가 만든» 결함이었습니다(trap-check 가 잡았습니다).
     고치기 전에는 번역 실패 시 out = t(원문)라서 `out !== t` 가 거짓이 되어 저절로 캐시를 비켜 갔는데,
     말머리를 떼면 실패해도 「잘했어요! Do you have a pet animal?」처럼 t 와 «달라져서»
     그 반쪽짜리가 KV 에 180일 굳습니다. 실패는 캐시하면 안 됩니다. */
  check('⛔ 번역 실패는 KV 에 캐시하지 않는다 (mtOk 로 가른다)',
    /mtOk = !!mt/.test(loopLive) && /if \(kv && mtOk &&/.test(loopLive));
  check('실패해도 원문을 붙여 보여는 준다 (mt || src)', /joinLearnLead\(lead\.leadKo, mt \|\| src\)/.test(loopLive));
  check('남은 것이 이모지·부호뿐이면 번역하지 않는다', /const needsMt =/.test(loopLive) && /if \(!needsMt\)/.test(loopLive));
  // ⛔ 그 지름길이 learn 밖(기본·chat)으로 새면, 이 글자범위에 없는 언어(가나·키릴)가 번역 없이 나간다
  check('⛔ 지름길은 «말머리를 실제로 뗀» 경우에만 — 기본·chat 경로는 예전 그대로',
    /const needsMt = !lead\.leadKo \|\|/.test(loopLive));
  check('⛔ learn 모드는 target=ko 일 때만 떼어 낸다', /learnMode && target === 'ko'/.test(loop));
}

console.log('\n[ E. 화면 배선 — 학생이 읽는 «뜻» 은 전부 mode:\'learn\' ]');
{
  // 「/api/translate 를 부르는 그 fetch 블록 안에 mode:'learn' 이 있는가」 를 봅니다.
  /* ⛔ 길이(i+400)로 자르지 마세요 — 그 자리에 줄만 더해도 검사가 깨집니다.
     이 저장소의 호출은 `body: JSON.stringify({ texts:…, target:'ko', mode:'learn' })` 가
     «한 줄» 이므로, 그 표식이 있는 «그 줄» 하나만 봅니다(구조적으로 정확합니다). */
  const callsLearn = (html, near) => {
    const line = html.split('\n').find((l) => l.includes(near));
    if (line == null) return null;
    return /mode:\s*'learn'/.test(line);
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
  check('student-game-space-monster.html 배치도 의역이다 — 화면마다 답이 갈리지 않는다',
    callsLearn(PUB('student-game-space-monster.html'), "texts: need.slice(0, 50)") === true);
  /* 그 배치를 켤 수 있게 된 근거 — 서버가 문장을 «동시에» 번역한다.
     이 상한이 사라지면 게임 시작이 50번 순차 호출만큼 막힌다. */
  check('서버가 번역을 동시에 돌린다 (배치가 순차로 막히지 않는다)',
    /const TRANSLATE_CONCURRENCY = \d+/.test(LIVE) && /queue\.shift\(\)/.test(LIVE));
  check('⛔ 동시 상한이 과하지 않다 (뉴런 소진 429 방어)', (() => {
    const m = LIVE.match(/const TRANSLATE_CONCURRENCY = (\d+)/);
    return !!m && Number(m[1]) >= 2 && Number(m[1]) <= 6;
  })());
  // 낱말 팝업(사전 뜻)은 «일부러» 기본 경로 그대로 — 낱말 하나는 직역이 정답이다
  check('낱말 팝업은 기본 경로 그대로', (() => {
    const h = PUB('student-game-shooter.html');
    const line = h.split('\n').find((l) => l.includes("texts:[key], target:'ko'"));
    return line != null && !/mode:\s*'learn'/.test(line);
  })());
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} learn_translate_meaning_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
