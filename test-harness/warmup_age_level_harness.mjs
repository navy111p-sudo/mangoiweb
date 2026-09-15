// -*- coding: utf-8 -*-
// 🧑‍🎓 수업 전 AI 웜업 — «연령대 · 대화 수준» 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/warmup_age_level_harness.mjs
//   대상:  cloudflare-deploy/src/warmup-audience.ts   (순수 모듈 — 직접 import 해서 돌린다)
//          cloudflare-deploy/src/index.ts             (배선 대조)
//          cloudflare-deploy/src/judgment-level.ts    (같은 말을 쓰는지 대조)
//          cloudflare-deploy/public/warmup.html       (화면 목록 · 시작 순서)
//
//   발단(2026-08-26 사장님 지시): 「웜업도 판단력 훈련처럼 연령·수준에 맞춰 대화하게,
//   그리고 난이도 설정이 «처음에» 나와서 먼저 고르고 시작하게」.
//   웜업은 페이지를 열자마자 AI 가 첫 질문을 던지는 구조라, 고르기 «전에» 대화가 시작되면
//   이미 엉뚱한 눈높이로 나간 첫 질문을 되돌릴 수 없다. 이 하니스가 지키는 것:
//     A. 연령대 축이 실제로 프롬프트를 바꾸는가(모듈을 돌려서 확인)
//     B. 화면 목록과 서버가 아는 값이 «짝» 인가
//        (CLAUDE.md 2장 「화면에서 골랐는데 그 값만 저장이 안 됨」 — 화면에만 늘리면 조용히 무시된다)
//     C. 두 화면(웜업·판단력)이 같은 Lv 을 같은 이름으로 부르는가
//     D. 설정 화면을 닫기 «전에» 첫 인사가 나가지 않는가
//     E. 수준 찾기가 서버를 부르지 않는가(첫 화면 지연 방지)
//   ⚠️ 문자열만 보는 검사로는 «순서»를 못 잡는다 — 그래서 A 는 모듈을 실제로 돌린다.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const P = (...a) => resolve(__dir, '../cloudflare-deploy', ...a);
const W = await import('file://' + P('src/warmup-audience.ts').replace(/\\/g, '/'));
const L = await import('file://' + P('src/judgment-level.ts').replace(/\\/g, '/'));
const IDX = readFileSync(P('src/index.ts'), 'utf8');
const HTML = readFileSync(P('public/warmup.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

console.log('\n[ A. 연령대 축 — 실제로 돌려서 확인 ]');
{
  check('연령대가 4종이다(유아·초등고학년/중·고등·성인)', W.WARMUP_AGE_IDS.length === 4);
  check('기본값은 초등 고학년·중학생(child)', W.DEFAULT_WARMUP_AGE === 'child');
  // ⚠️ 모르는 값을 «가장 어린 쪽»으로 떨어뜨리면 성인 수강생이 유아 취급을 받는다
  check('모르는 값·빈 값은 기본값으로 떨어진다(가장 어린 쪽 아님)',
    ['', null, undefined, 'grown-up', 0, true].every((v) => W.normalizeWarmupAge(v) === 'child'));
  check('대소문자·공백을 흘려 보내지 않는다', W.normalizeWarmupAge('  ADULT ') === 'adult');
  const lines = W.WARMUP_AGE_IDS.map((id) => W.warmupAgeLine(id));
  check('연령대마다 «서로 다른» 지시가 나온다', new Set(lines).size === 4);
  check('모든 지시가 [연령대] 표지로 시작한다', lines.every((l) => l.startsWith('[연령대]')));
  // 실제로 겪은 어긋남: 성인에게 학교·선생님 이야기, 유아에게 진로·시험 이야기
  check('성인에게는 아동용 소재를 금지한다', /학교 숙제|선생님/.test(W.warmupAgeLine('adult')));
  check('유아에게는 시험·진로·직장을 금지한다', /시험|진로|직장/.test(W.warmupAgeLine('kid')));
  check('고등학생은 유치한 소재를 피하라고 적혀 있다', /유치한/.test(W.warmupAgeLine('teen')));
}

console.log('\n[ B. 화면 목록 ↔ 서버가 아는 값 — 「짝」 이어야 한다 ]');
// 화면(warmup.html)의 AGE_CATALOG id 를 그대로 뽑아 서버 목록과 «순서까지» 맞춘다
const ageBlock = (HTML.match(/var AGE_CATALOG\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || '';
const htmlAges = [...ageBlock.matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]);
check('화면 연령대 목록을 읽었다', htmlAges.length === 4, `읽은 값: ${htmlAges.join(',')}`);
check('화면 목록 == 서버 WARMUP_AGE_IDS (순서 포함)',
  htmlAges.join(',') === W.WARMUP_AGE_IDS.join(','), `${htmlAges.join(',')} vs ${W.WARMUP_AGE_IDS.join(',')}`);
// 대화 수준 1~8 — 화면 목록과 서버 WARMUP_LEVELS 키가 같아야 한다
const lvBlock = (HTML.match(/var LEVEL_CATALOG\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || '';
const htmlLevels = [...lvBlock.matchAll(/\{n:\s*(\d)/g)].map((m) => Number(m[1]));
const srvBlock = (IDX.match(/const WARMUP_LEVELS: Record<number, string> = \{([\s\S]*?)\n\};/) || [])[1] || '';
const srvLevels = [...srvBlock.matchAll(/^\s*(\d):\s*"/gm)].map((m) => Number(m[1]));
check('화면 수준 목록을 읽었다', htmlLevels.length === 8, `읽은 값: ${htmlLevels.join(',')}`);
check('서버 WARMUP_LEVELS 를 읽었다', srvLevels.length === 8, `읽은 값: ${srvLevels.join(',')}`);
check('화면 수준(1~8) == 서버가 아는 수준(1~8)',
  htmlLevels.join(',') === srvLevels.join(','), `${htmlLevels.join(',')} vs ${srvLevels.join(',')}`);

console.log('\n[ C. 웜업과 판단력 훈련이 같은 Lv 을 같은 이름으로 부르는가 ]');
{
  const norm = (s) => String(s).replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const names = [...lvBlock.matchAll(/ko:\s*'([^']+)'/g)].map((m) => m[1]);
  const lvs = [...lvBlock.matchAll(/lv:\s*'([^']+)'/g)].map((m) => m[1]);
  check('화면 수준 이름 8개를 읽었다', names.length === 8);
  check('이름이 판단력 훈련(BAND_SPECS)과 같다',
    names.join(',') === L.BAND_SPECS.map((b) => b.nameKo).join(','),
    `${names.join(',')} vs ${L.BAND_SPECS.map((b) => b.nameKo).join(',')}`);
  check('교재 Lv 구간이 판단력 훈련과 같다',
    lvs.map(norm).join(',') === L.BAND_SPECS.map((b) => norm(L.bandLabel(b.band))).join(','),
    `${lvs.map(norm).join(',')} vs ${L.BAND_SPECS.map((b) => norm(L.bandLabel(b.band))).join(',')}`);
}

console.log('\n[ D. 서버 배선 — 받은 연령대가 프롬프트까지 가는가 ]');
{
  check('index.ts 가 warmup-audience 를 불러온다', /from '\.\/warmup-audience'/.test(IDX));
  const chat = (IDX.match(/async function handleWarmupChat[\s\S]*?\n\}\n/) || [''])[0];
  check('대화(handleWarmupChat)가 age_group 을 읽는다', /normalizeWarmupAge\(body && body\.age_group\)/.test(chat));
  check('대화 프롬프트에 연령대 줄이 들어간다', /sys \+= ' ' \+ warmupAgeLine\(/.test(chat));
  const qs = (IDX.match(/async function handleWarmupQuestions[\s\S]*?\n\}\n/) || [''])[0];
  check('추가질문(handleWarmupQuestions)도 age_group 을 읽는다', /normalizeWarmupAge\(body\.age_group\)/.test(qs));
  check('추가질문 프롬프트에도 연령대 줄이 들어간다', /warmupAgeLine\(ageGroup\)/.test(qs));
  // 난이도와 «독립» 인 축이어야 한다 — 하나로 묶으면 「성인인데 유아 문장」이 생긴다
  /* 📜 2026-09-13 — 중국어가 붙으며 이 줄이 «언어로 표를 고르는» 모양이 됐습니다
     (`${(ctxLang === 'zh' ? WARMUP_ZH_LEVELS : WARMUP_LEVELS)[ctxDifficulty]}`).
     지켜야 할 것은 그대로입니다 — «난이도 줄은 ctxDifficulty 로 고른다»(연령대가 아니다).
     ⛔ 식 모양으로 다시 못 박지 마세요(CLAUDE.md 2장). */
  check('연령대가 난이도(WARMUP_LEVELS)를 덮어쓰지 않는다',
    /if \(ctxDifficulty\) sys \+= ` \[난이도\] \$\{[^`]*WARMUP_LEVELS[^`]*\[ctxDifficulty\][^`]*\}`/.test(chat));
  check('🀄 중국어면 중국어 레벨표를 쓴다 (짝)',
    /\[난이도\][^`]*WARMUP_ZH_LEVELS/.test(chat),
    '이 짝이 없으면 중국어 대화가 «영어 낱말 수» 기준으로 길이를 받습니다');
}

console.log('\n[ E. 화면 — 고르기 전에는 대화가 시작되지 않는가 ]');
{
  // 🔴 이 검사가 이 하니스의 핵심이다. 예전에는 즉시실행(IIFE)이라 페이지를 여는 순간 첫 질문이 나갔다.
  check('첫 인사가 즉시실행(IIFE)이 아니다', !/\(async function initGreeting\(\)\{/.test(HTML.replace(/\s/g, '')) );
  check('첫 인사는 이름 있는 함수다', /async function initGreeting\(\)\s*\{/.test(HTML));
  check('시작 버튼(startWarmup)만 첫 인사를 부른다',
    /function startWarmup\(\)\{[\s\S]{0,600}initGreeting\(\)/.test(HTML.replace(/\n/g, '')));
  check('부팅이 설정 화면을 먼저 연다', /function bootWarmup\(\)[\s\S]{0,300}openSetup\(false\)/.test(HTML));
  check('?setup=0 으로 건너뛸 수 있다', /Q\.get\('setup'\)[\s\S]{0,60}startWarmup\(\)/.test(HTML));
  check('설정 화면 · 시작 버튼이 있다', /id="wuSetup"/.test(HTML) && /id="wusStart"/.test(HTML));
  check('연령·수준 목록 자리가 있다', /id="wusAges"/.test(HTML) && /id="wusLevels"/.test(HTML));
  // ⚠️ 작성자 CSS 가 display 를 정하면 브라우저 기본 [hidden]{display:none} 을 이긴다(CLAUDE.md 2장)
  check('[hidden] 이 이기도록 못 박아 두었다', /\.wu-setup\[hidden\]\{display:none !important\}/.test(HTML));
  check('매 요청에 연령대와 난이도를 함께 보낸다',
    /body\.difficulty = _warmLevel/.test(HTML) && /body\.age_group = _warmAge/.test(HTML));
  check('⋮ 메뉴에서 언제든 다시 고를 수 있다', /openSetup\(true\)/.test(HTML) && /id="ageBtns"/.test(HTML));
  check('연령대를 골라 두면 다음에도 그대로다', /localStorage\.setItem\('mangoi_warmup_age'/.test(HTML));
}

console.log('\n[ F. 🎯 수준 찾기 — 서버를 부르지 않고 3문항으로 끝나는가 ]');
{
  const probe = (HTML.match(/function startProbe\(\)[\s\S]*?function finishProbe\(\)[\s\S]*?\n\}/) || [''])[0];
  check('수준 찾기 코드를 읽었다', probe.length > 200);
  // 첫 화면부터 AI 호출인 화면이라, 고르는 단계에서 또 부르면 시작이 그만큼 늦어진다
  check('수준 찾기가 서버를 부르지 않는다(fetch 없음)', !/fetch\s*\(/.test(probe));
  check('3문항으로 끝난다', /var PROBE_ITEMS = 3/.test(HTML));
  check('가운데(4)에서 시작해 보폭을 줄인다(판단력 배치와 같은 규칙)',
    /_pbBand = 4, _pbStep = 2/.test(HTML) && /_pbStep = Math\.max\(1, _pbStep - 1\)/.test(HTML));
  check('찾은 값이 1~8 밖으로 나가지 않는다', /_pbBand = Math\.max\(1, Math\.min\(8, _pbBand\)\)/.test(HTML));
  check('찾은 결과가 실제로 대화 수준으로 저장된다', /function finishProbe\(\)\{?[\s\S]{0,120}setLevel\(_pbBand/.test(HTML));
}

// ⚠️ 「'」 가 든 값("No, I'm not.")을 «따옴표 종류만» 보고 자르면 조용히 잘린다 — 실제로 밟았다.
const jsStrings = (src) => [...String(src).matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
  .map((m) => (m[1] !== undefined ? m[1] : m[2]).replace(/\\(.)/g, '$1'));

console.log('\n[ G. 🎚️ 낮은 단계 첫 인사 — 레벨을 실제로 지키는가 ]');
// 🔴 발단(2026-08-26): 첫 인사가 «레벨을 안 보고» 있었다. 서버는 레벨 1 을 「3~5단어」로
//    못 박아 두었는데 화면의 고정 인사는 15단어였다 — 즉 시스템이 첫 문장부터 자기 규칙을
//    어기고 있었다. 「그 문자열이 있는가」로는 이걸 못 잡는다(문자열은 늘 «있다»).
//    그래서 여기서는 인사말을 뽑아 «단어를 세고», «질문의 형태»를 본다.
{
  const gBlock = (HTML.match(/var BEGINNER_GREETINGS\s*=\s*\{([\s\S]*?)\n\};/) || [])[1] || '';
  const greet = {};
  for (const m of gBlock.matchAll(/(\d):\s*\{\s*en:\s*"([^"]+)"\s*,\s*ko:\s*'([^']+)'\s*,\s*chips:\s*\[([^\]]*)\]/g)) {
    const chips = jsStrings(m[4]);
    greet[Number(m[1])] = { en: m[2], ko: m[3], chips };
  }
  check('낮은 단계 인사말 표를 읽었다', Object.keys(greet).length >= 2, `읽은 단계: ${Object.keys(greet).join(',')}`);
  /* 🪜 2026-08-31 — 「1·2단계만」에서 «여덟 단계 모두» 로 넓혔다.
     전에는 3단계 이상이 공용 문장 하나를 써서 「8단계인데 첫마디는 사실상 3단계」였고,
     그 문장은 고른 친구 이름도 안 따라갔다(Lily 를 골라도 "Mangoi AI friend").
     ⛔ 이 검사를 「3단계 이상은 표에 없다」로 되돌리지 마세요 — 그때로 돌아갑니다. */
  check('여덟 단계 모두 전용 인사가 있다', [1,2,3,4,5,6,7,8].every((n) => !!greet[n]),
    `있는 단계: ${Object.keys(greet).join(',')}`);
  check('단계마다 서로 다른 인사다(복사본이 아니다)',
    new Set([1,2,3,4,5,6,7,8].map((n) => (greet[n] || {}).en)).size === 8);
  /* 폴백은 «지우는» 것이 아니라 «안전망으로 남기는» 것이다 — 레벨이 1~8 밖일 때 온다.
     ⚠️ 이 두 줄을 파일 전체(HTML)에 대고 물으면 안 된다 — 옛 문장을 «설명하는» 주석과
        옛 문장을 번역해 주는 curatedMeaning() 정규식에 그대로 걸린다(실제로 밟았다).
        중괄호 짝으로 fallbackGreeting() 본문만 잘라 내고 주석을 벗겨서 묻는다. */
  const fbBody = (() => {
    const i = HTML.indexOf('function fallbackGreeting()');
    if (i < 0) return '';
    let d = 0, st = HTML.indexOf('{', i);
    for (let j = st; j < HTML.length; j++) {
      if (HTML[j] === '{') d++;
      else if (HTML[j] === '}' && --d === 0) return HTML.slice(st, j + 1);
    }
    return '';
  })().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('폴백 인사 본문을 읽었다', fbBody.length > 200);
  check('폴백 인사가 안전망으로 남아 있다', /Let\\?'s warm up before class\. How are you today\?/.test(fbBody));
  // ⚠️ 그 폴백도 «고른 친구 이름» 을 써야 한다(예전에는 "your Mangoi AI friend" 로 박혀 있었다)
  check('폴백 인사가 고른 친구 이름을 쓴다', /_friendLabelNow\(\)/.test(fbBody));
  check('폴백 인사에 옛 고정 이름이 남아 있지 않다', !/your Mangoi AI friend/.test(fbBody));

  // ── 서버가 정한 단어 수 상한을 «화면이 지키는가» — 두 파일이 같은 말을 하는지 대조한다 ──
  const srvMax = {};
  for (const m of srvBlock.matchAll(/^\s*(\d):\s*"[^"]*?(\d+)~(\d+)단어/gm)) srvMax[Number(m[1])] = Number(m[3]);
  check('서버에서 단어 수 상한을 읽었다(1~7단계)', [1,2,3,4,5,6,7].every((n) => srvMax[n] > 0),
    `상한: ${[1,2,3,4,5,6,7].map((n) => srvMax[n]).join('/')}`);
  // 문장별로 센다 — 서버 규칙이 「한 번에 N단어의 짧은 문장」이라 문장 단위가 맞는 눈금이다.
  const sentences = (en) => String(en).split(/[.?!]+/).map((s) => s.trim()).filter(Boolean);
  const words = (s) => s.replace(/[^\x20-\x7E]/g, ' ').replace(/[,;:—-]/g, ' ')
    .split(/\s+/).filter(Boolean).length;
  for (const lv of [1, 2, 3, 4, 5, 6, 7, 8]) {
    if (!greet[lv] || !srvMax[lv]) continue;
    const longest = Math.max(...sentences(greet[lv].en).map(words));
    check(`${lv}단계 인사말이 서버 상한(${srvMax[lv]}단어)을 지킨다`, longest <= srvMax[lv],
      `가장 긴 문장 ${longest}단어 — "${greet[lv].en}"`);
  }

  // ── 🔴 초보에게 진짜 벽은 «길이» 가 아니라 «열린 질문» 이다 ──
  //    길이를 줄여도 wh- 열린 질문이면 답을 스스로 만들어야 해서 그대로 막힌다.
  //    Yes/No 이거나 양자택일(고를 말이 질문 안에 들어 있음)이어야 한다.
  for (const lv of [1, 2]) {
    if (!greet[lv]) continue;
    const q = sentences(greet[lv].en).filter((s) => greet[lv].en.includes(s + '?')).pop() || '';
    const yesNo = /^(?:🥭\s*)?(are|do|is|does|did|can|will|have)\b/i.test(q.replace(/[^\x20-\x7E]/g, '').trim());
    const eitherOr = /\bor\b/i.test(q);
    check(`${lv}단계 질문이 Yes/No 이거나 양자택일이다`, !!q && (yesNo || eitherOr), `질문: "${q}"`);
  }

  // ── 🔴 한국어를 영어 말풍선에 섞으면 «영어 TTS 가 한글을 읽어» 소리가 뭉개진다 ──
  //    (서버 WARMUP_LEVELS 1번 주석이 같은 사고를 이미 경고하고 있다)
  for (const lv of [1, 2]) {
    if (!greet[lv]) continue;
    check(`${lv}단계 영어 말풍선에 한글이 없다`, !/[가-힣]/.test(greet[lv].en), greet[lv].en);
    check(`${lv}단계 한국어 뜻이 준비되어 있다`, /[가-힣]/.test(greet[lv].ko));
  }
  // 한국어는 말풍선 «안에 글자로» 들어가면 안 된다 — 영어 TTS 가 그 한글을 읽는다.
  //    (뜻은 아래 J절의 «자동 뜻» 이 별도 칩으로 열어 준다)
  /* ⚠️ 이 검사를 «그 코드 «모양»이 있는가» 로 쓰면 안 된다 — 표현만 바꿔도 FAIL 난다
     (2026-08-31 이름을 {name} 으로 끼우면서 변수를 거치게 하자 실제로 깨졌다).
     물어야 할 것은 «영어 인사를 ai 말풍선에 넣는가» + «그 문자열에 한글이 없는가» 다. */
  check('영어 말풍선은 영어만 넣어 부른다',
    /addMsg\((?:g\.en|gEn)[^)]*, 'ai'\)/.test(HTML));
  check('겹치는 안내 줄을 따로 두지 않는다(보기 카드 제목과 같은 말)',
    !/아래 보기를 눌러 말해 보세요/.test(HTML));
  // 「뜻」 은 손으로 다듬은 의역을 쓴다 — 기계번역이 "warm up" 을 「따뜻하게하자」로 옮긴 전례(2026-08-24)
  check('「뜻」이 기계번역을 부르지 않는다(_koCache 선주입)',
    /_koCache\[(?:g\.en|gEn)\] = (?:g\.ko|gKo)/.test(HTML));
}

console.log('\n[ H. 📊 웜업 기록 — 「몇 단계로 쓰는가」를 셀 수 있는가 ]');
// 발단: 대화 수준·연령대가 localStorage 에만 있어 «낮은 단계 학생이 몇 명인지» 조차 못 셌다.
// ⚠️ 「히스토리가 비었으면 첫 턴」 판정은 «틀린다» — kickoff 합성 발화가 user 로 저장되기 때문.
//    그래서 문자열이 아니라 판정 함수를 «직접 돌려» 확인한다.
{
  const G = await import('file://' + P('src/warmup-log.ts').replace(/\\/g, '/'));
  const u = (n) => Array.from({ length: n }, () => ({ role: 'user', content: 'x' }));

  check('kickoff(화면이 시킨 합성 발화)는 「입을 뗐다」로 세지 않는다',
    G.warmupShouldMarkFirstReply([], true) === false);
  check('자유 대화 — 학생의 첫마디를 잡는다', G.warmupShouldMarkFirstReply([], false) === true);
  // 🔴 이 줄이 이 절의 핵심이다. kickoff 를 지나온 학생을 놓치면 교재 배정 학생이 통째로 빠진다.
  check('교재 연동 — kickoff 뒤 학생의 첫마디도 잡는다', G.warmupShouldMarkFirstReply(u(1), false) === true);
  check('두 마디 넘게 한 뒤에는 더 쓰지 않는다(발화마다 쓰기 금지)',
    G.warmupShouldMarkFirstReply(u(2), false) === false && G.warmupShouldMarkFirstReply(u(9), false) === false);
  check('망가진 히스토리에도 죽지 않는다',
    G.warmupShouldMarkFirstReply(null, false) === true && G.warmupShouldMarkFirstReply([null, 'x'], false) === true);

  // ── 스키마·쓰기 규칙을 «진짜 SQLite» 에 돌려 본다 (운영 DB 는 건드리지 않는다) ──
  let DatabaseSync = null;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
  if (!DatabaseSync) {
    console.log('  ⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)');
  } else {
    const db = new DatabaseSync(':memory:');
    let ddlOk = true;
    try { for (const sql of G.WARMUP_LOG_DDL) db.exec(sql); } catch (e) { ddlOk = false; FAILS.push('DDL: ' + e.message); }
    check('DDL 이 실제 SQLite 에서 돈다', ddlOk);
    const ins = `INSERT OR IGNORE INTO warmup_session_log
        (session_id, user_id, difficulty, age_group, textbook, level, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.prepare(ins).run('s1', 'jeong', 1, 'kid', 'BTS 1', 'Lv 3', 1000);
    // 같은 세션이 두 번 와도 «시작할 때 고른 값» 이 덮이면 안 된다(대화 중 ⋮ 로 바꿔도 마찬가지)
    db.prepare(ins).run('s1', 'jeong', 8, 'adult', 'BTS 1', 'Lv 3', 2000);
    const row = db.prepare(`SELECT * FROM warmup_session_log WHERE session_id='s1'`).get();
    check('세션은 한 줄만 남는다(INSERT OR IGNORE)',
      db.prepare(`SELECT COUNT(*) n FROM warmup_session_log`).get().n === 1);
    check('시작할 때 고른 수준·연령대가 덮이지 않는다', row.difficulty === 1 && row.age_group === 'kid',
      `difficulty=${row.difficulty} age=${row.age_group}`);
    check('아직 입을 떼지 않은 세션은 first_reply_at 이 비어 있다', row.first_reply_at == null);
    const upd = `UPDATE warmup_session_log SET first_reply_at = ? WHERE session_id = ? AND first_reply_at IS NULL`;
    db.prepare(upd).run(3000, 's1');
    db.prepare(upd).run(4000, 's1');   // 두 번째 발화에서 한 번 더 불려도 첫 시각이 정본이어야 한다
    check('첫마디 시각은 «처음 값» 이 남는다',
      db.prepare(`SELECT first_reply_at f FROM warmup_session_log WHERE session_id='s1'`).get().f === 3000);
    db.close();
  }

  // ── CREATE 는 한 곳뿐이어야 한다 — 두 벌이면 먼저 도는 쪽이 이겨 새 DB 에서 칸이 갈린다 ──
  const srcDir = P('src');
  const creators = readdirSync(srcDir).filter((f) => f.endsWith('.ts'))
    .filter((f) => /CREATE TABLE[\s\S]{0,80}warmup_session_log/i.test(readFileSync(resolve(srcDir, f), 'utf8')));
  check('warmup_session_log 의 CREATE 가 한 파일뿐이다', creators.length === 1, `찾은 곳: ${creators.join(', ') || '없음'}`);
  check('그 파일은 src/warmup-log.ts 다', creators[0] === 'warmup-log.ts');

  // ── ⛔ 이 표에만 쓴다 — 학생 자료를 건드리지 않는다 ──
  const LOG = readFileSync(P('src/warmup-log.ts'), 'utf8');
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const logCode = strip(LOG);
  check('학생 표(students_erp·attendance)를 건드리지 않는다', !/students_erp|attendance/.test(logCode));
  check('DELETE·DROP 이 없다', !/\bDELETE\b|\bDROP\b/i.test(logCode));
  // 「몇 번 나오나」로 세지 말고 «쓰기의 대상 표» 를 하나씩 꺼내 본다
  const wTargets = [...logCode.matchAll(/\b(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE)\s+([A-Za-z_]\w*)/gi)].map((m) => m[1]);
  check('쓰기는 warmup_session_log 에만 한다',
    wTargets.length >= 2 && wTargets.every((t) => t === 'warmup_session_log'),
    `쓰기 대상: ${wTargets.join(', ') || '없음'}`);
  // ⚠️ 삼키되 «조용히» 삼키면 안 된다 — 기록이 안 들어온 것과 「학생이 안 왔다」가 구분이 안 된다
  //    (silent_catch_harness 가 지키는 규칙과 같은 뿌리)
  const catches = [...logCode.matchAll(/catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\n  \}/g)].map((m) => m[1]);
  check('기록이 실패해도 웜업을 멈추지 않는다(던지지 않음)', catches.length >= 2, `catch ${catches.length}개`);
  check('그 실패가 조용히 묻히지 않는다(로그 한 줄)', catches.every((c) => /console\.(error|warn)/.test(c)));

  // ── 배선: 서버 두 곳 · 화면 ──
  /* 📜 2026-09-13 — 「앞 900자 안에 있나」로 묻던 것을 «그 함수 몸통 안에 있나» 로 바꿨습니다.
     중국어 언어 힌트(hint=1) 갈래가 앞에 들어오자 900자를 넘겨 «보장은 그대로인데»
     빨간불이 났습니다(CLAUDE.md 2장 「검사 범위를 «길이» 로 자르지 마세요」). */
  const ctxBody = (() => {
    const i = IDX.indexOf('async function handleWarmupContext');
    if (i < 0) return '';
    const o = IDX.indexOf('{', IDX.indexOf(')', i));   // 인자 목록 뒤의 여는 중괄호
    let d = 0;
    for (let k = o; k < IDX.length; k++) {
      if (IDX[k] === '{') d++;
      else if (IDX[k] === '}') { d--; if (!d) return IDX.slice(o, k + 1); }
    }
    return '';
  })();
  check('전제: handleWarmupContext 몸통을 잘라 냈다', ctxBody.length > 200, 'len=' + ctxBody.length);
  check('세션 시작을 /api/warmup/context 에서 기록한다',
    /logWarmupSessionStart\(env, \{/.test(ctxBody));
  /* ⚠️ «위치» 로 묻는 검사는 주석을 벗겨 낸 사본으로 판정한다 — 그러지 않으면 이 함수의
     설명 주석에 적힌 logWarmupSessionStart 가 «먼저» 잡혀 늘 FAIL 이다(실제로 밟았다). */
  const ctxCode = ctxBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('🀄 언어 힌트(hint=1)는 세션 시작을 기록하지 않는다',
    (() => {
      const h = ctxCode.indexOf("searchParams.get('hint')");
      const l = ctxCode.indexOf('logWarmupSessionStart');
      return h >= 0 && l >= 0 && h < l && /return new Response[\s\S]{0,200}suggest_lang/.test(ctxCode.slice(h, l));
    })(),
    '힌트 갈래가 기록보다 앞에서 돌아가지 않으면 세션 시작이 «설정 화면을 열 때» 남습니다');
  check('그때 화면이 고른 수준·연령대를 받는다',
    /searchParams\.get\('diff'\)/.test(IDX) && /normalizeWarmupAge\(u\.searchParams\.get\('age'\)\)/.test(IDX));
  check('대화 첫 턴에도 안전망 기록이 있다(비로그인 세션)',
    /if \(history\.length === 0\) \{[\s\S]{0,300}logWarmupSessionStart\(env/.test(IDX));
  check('kickoff 를 서버가 읽는다', /const ctxKickoff = !!\(body && body\.kickoff\)/.test(IDX));
  check('첫마디 표시는 판정 함수를 거친다', /warmupShouldMarkFirstReply\(history, ctxKickoff\)/.test(IDX));
  check('화면이 세션·수준·연령대를 함께 보낸다',
    /qs\.set\('session_id', SESSION_ID\)/.test(HTML) && /qs\.set\('diff', String\(_warmLevel\)\)/.test(HTML)
    && /qs\.set\('age', _warmAge\)/.test(HTML));
  check('화면이 kickoff 를 표시해 보낸다', /kickoff: 1/.test(HTML));
}

console.log('\n[ I. 💬 대답 보기 칩 — 결정론으로 «맞는 영어» 만 내는가 ]');
// 🔴 이 칩은 학생이 «그대로 따라 말하는» 문장이다. 틀린 문장이 하나라도 섞이면 그걸 배운다.
//    그래서 LLM 을 쓰지 않고 AI 질문에서 유도하며, 여기서는 그 함수를 «실제로 돌려» 확인한다.
{
  const A = await import('file://' + P('src/warmup-answers.ts').replace(/\\/g, '/'));
  const E = await import('file://' + P('src/english-only.ts').replace(/\\/g, '/'));

  // ① 서버 단어 수 상한과 «짝» 인가 — 한쪽만 고치면 「레벨 1인데 8단어 보기」가 조용히 나간다
  const srvCap = {};
  for (const m of srvBlock.matchAll(/^\s*(\d):\s*"[^"]*?(\d+)~(\d+)단어/gm)) srvCap[Number(m[1])] = Number(m[3]);
  for (const lv of [1, 2, 3]) {
    check(`${lv}단계 보기 상한이 서버 WARMUP_LEVELS 와 같다`, A.WARMUP_CHIP_WORD_CAP[lv] === srvCap[lv],
      `칩 ${A.WARMUP_CHIP_WORD_CAP[lv]} vs 서버 ${srvCap[lv]}`);
  }

  // ② 실제 질문을 넣어 «나온 문장» 을 본다
  const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
  const cases = [
    { q: "Hi! I'm Mango. 🥭 Are you happy today?", lv: 1, want: ['Yes, I am.', "No, I'm not."] },
    { q: 'Hi! I\'m Mango. 🥭 How are you today, happy or tired?', lv: 2, want: ['I am happy.', 'I am tired.'] },
    { q: 'Nice! Do you like pizza or chicken?', lv: 1, want: ['I like pizza.', 'I like chicken.'] },
    { q: 'Do you like ice cream or cake?', lv: 2, want: ['I like ice cream.', 'I like cake.'] },
    { q: 'Are you a student or a teacher?', lv: 2, want: ['I am a student.', 'I am a teacher.'] },
    { q: 'Wow! Do you have a pet?', lv: 1, want: ['Yes, I do.', "No, I don't."] },
    { q: 'Can you swim?', lv: 2, want: ['Yes, I can.', "No, I can't."] },
    { q: 'Would you like some water?', lv: 2, want: ['Yes, please.', 'No, thank you.'] },
    { q: 'Is it hot today?', lv: 3, want: ['Yes, it is.', "No, it isn't."] },
  ];
  for (const c of cases) {
    const got = A.warmupAnswerChips(c.q, c.lv);
    check(`보기가 맞다 — "${c.q.slice(-34)}"`, c.want.every((w, i) => got[i] === w), `나온 값: ${JSON.stringify(got)}`);
  }

  // ③ 🔴 실제로 밟은 사고 — 관사를 떼어 「I am student.」 가 나왔다. 다시는 안 나와야 한다.
  const all = cases.flatMap((c) => A.warmupAnswerChips(c.q, c.lv));
  check('관사가 빠진 비문(I am student.)이 없다', !all.some((x) => /^I am (student|teacher)\./.test(x)), all.join(' | '));
  check('모든 보기가 마침표로 끝난다', all.every((x) => /[.!]$/.test(x)));
  check('보기에 물음표가 없다(칩은 «대답» 이다)', all.every((x) => x.indexOf('?') < 0));
  check('모든 보기가 그 단계의 단어 수 상한 안이다',
    cases.every((c) => A.warmupAnswerChips(c.q, c.lv).every((x) => words(x) <= A.WARMUP_CHIP_WORD_CAP[c.lv])));
  check('보기는 3개를 넘지 않는다(폰에서 입력칸이 밀린다)',
    cases.every((c) => A.warmupAnswerChips(c.q, c.lv).length <= 3));

  // ④ ⛔ 만들 수 없으면 «만들지 않는다» — 모르는 것보다 틀린 게 나쁘다
  check('열린 질문(wh-)에는 보기를 지어내지 않는다',
    A.warmupAnswerChips('What is your favorite color?', 3).length === 0);
  check('부정사가 섞이면 억지로 만들지 않는다',
    !A.warmupAnswerChips('Do you like to swim or to run?', 2).some((x) => /I like (swim|run)\./.test(x)));
  check('4단계 이상은 보기를 내지 않는다(스스로 답하는 것이 훈련)',
    A.warmupAnswerChips('Do you like soccer?', 4).length === 0 && A.warmupAnswerChips('Are you okay?', 8).length === 0);
  check('낮은 단계는 막혔을 때 탈출구를 준다',
    A.warmupAnswerChips('What did you eat today?', 1).length === 2);
  check('망가진 입력에도 죽지 않는다',
    A.warmupAnswerChips(null, 1).length >= 0 && A.warmupAnswerChips('Are you ok?', null).length === 0);

  // ⑤ 병음·한자가 칩으로 새면 안 된다 — english-only 정본과 «같은 말» 을 하는지 대조
  const bad = ['cāochǎng', '你好', 'こんにちは', '안녕'];
  for (const b of bad) {
    const chips = A.warmupAnswerChips(`Do you like ${b} or cake?`, 2);
    check(`영어가 아닌 보기는 안 나온다 — ${b}`,
      !chips.some((x) => x.indexOf(b) >= 0) && !E.isEnglishText(b, 30), JSON.stringify(chips));
  }

  // ⑥ 첫 인사의 보기는 «손으로 적었지만» 정본 함수의 결과와 같아야 한다(둘이 어긋날 수 없게)
  const gB = (HTML.match(/var BEGINNER_GREETINGS\s*=\s*\{([\s\S]*?)\n\};/) || [])[1] || '';
  for (const m of gB.matchAll(/(\d):\s*\{\s*en:\s*"([^"]+)"[\s\S]*?chips:\s*\[([^\]]*)\]/g)) {
    const lv = Number(m[1]);
    const chips = jsStrings(m[3]);
    const want = A.warmupAnswerChips(m[2], lv);
    check(`${lv}단계 인사말 보기 == 서버 정본이 만드는 값`, chips.join(' | ') === want.join(' | '),
      `화면 ${JSON.stringify(chips)} vs 정본 ${JSON.stringify(want)}`);
  }

  // ⑦ 배선 — 서버 세 자리, 화면 네 자리
  /* 📜 2026-09-13 — 언어마다 칩 정본이 달라져(영어 warmupAnswerChips · 중국어 warmupZhAnswerChips)
     식 모양 대신 «그 값으로 칩을 만들어 싣는가» 로 묻습니다.
     ⚠️ 중국어에 영어 정본을 쓰면 1·2단계에서 «막혔을 때» 영어 칩이 조건 없이 붙습니다. */
  check('대화 응답이 보기를 함께 내려준다',
    /answer_chips:[^\n]*\bwarmupAnswerChips\(aiText, ctxDifficulty\)/.test(IDX));
  check('🀄 중국어 대화는 중국어 칩 정본을 쓴다 (짝)',
    /answer_chips:[^\n]*\bwarmupZhAnswerChips\(aiText, ctxDifficulty\)/.test(IDX));
  check('고른 질문(pick)에도 보기를 내려준다',
    /picked: pick,[\s\S]{0,160}warmupAnswerChips\(pick, difficulty\)/.test(IDX));
  check('🀄 고른 질문도 중국어면 중국어 칩 (짝)',
    /picked: pick,[\s\S]{0,160}warmupZhAnswerChips\(pick, difficulty\)/.test(IDX));
  check('화면이 목록을 «만들지» 않고 받아서 그린다',
    !/Yes, I do\./.test(HTML.replace(/chips:\s*\[[^\]]*\]/g, '')), '화면에 칩 문구가 흩어져 있으면 정본이 둘이 된다');
  for (const [name, re] of [['첫 인사', /showAnswerChips\(g\.chips\)/], ['대화 답변', /showAnswerChips\(d\.answer_chips\)/],
                            ['교재 첫 인사', /showAnswerChips\(kd\.answer_chips\)/], ['고른 질문', /showAnswerChips\(d\.answer_chips\)/]]) {
    check(`${name} 뒤에 보기를 그린다`, re.test(HTML));
  }
  check('누르면 «평소 전송 경로»로 보낸다(콤보·마이크 정리가 갈라지지 않게)',
    /function pickAnswer\(txt\)\{[\s\S]{0,260}sendMsg\(\)/.test(HTML.replace(/\n/g, '')));
  check('내가 말하면 이전 보기는 걷는다', /ansCardClear\(\);\s*\/\/ 💬 내가 말했으니/.test(HTML));
  check('보기 카드 제목에 data-ko·data-en 이 달려 있다(🌐 를 눌러도 따라온다)',
    /ans-title[\s\S]{0,200}data-ko[\s\S]{0,200}data-en/.test(HTML));
  // ⚠️ 「질문 추천」 카드는 «AI 가 물어볼 질문» 이다 — 옛 이름표가 «내 대답» 처럼 읽혀 새 카드와 겹쳤다
  check('「질문 추천」 카드 이름표가 사실과 맞다', /골라 누르면 AI 가 이 질문을 해요/.test(HTML)
    && !/💡 이 중에서 골라 대답해 보세요/.test(HTML));
}

console.log('\n[ J. 🇰🇷 낮은 단계 자동 뜻 — 탭하지 않아도 보이는가 ]');
{
  // 「뜻」 버튼은 초보가 있는 줄도 모른다. 다만 «듣기 훈련» 을 깨면 안 된다.
  check('레벨 1~2 에서만 자동으로 연다', /if\(_warmLevel <= 2 && _subMode === 'on'\)\{/.test(HTML));
  check('그 자리가 AI 말풍선 분기 안이다',
    /mb\.onclick[\s\S]{0,700}_warmLevel <= 2 && _subMode === 'on'/.test(HTML));
  check('자막이 「가리기·완전 끄기」면 열지 않는다(듣기 훈련 보호)',
    /_subMode === 'on'\)\{\s*try\{ toggleMeaning/.test(HTML.replace(/\n\s*/g, ' ').replace(/ \{/g, '{')));
  check('실패해도 대화가 멈추지 않는다(try/catch)',
    /try\{ toggleMeaning\(text, mb, d\); \}catch\(e\)\{\}/.test(HTML));
}

console.log('\n[ K. 다시 고르기에 손이 닿는가 — 되돌리기 방지 (2026-09-15) ]');
{
  /* 📜 사장님 「PC에서 너무 밑에 있어서 잘 보이지 않고 오른쪽 카드에서도 찾기가 힘들어」.
     재 보니 «안 보인다» 가 아니라 «화면 밖» 이었다 — ⋮ 카드가 792px 고정이라 아래 끝이 853px 인데
     1280x800 · 1366x768 노트북은 화면이 그보다 짧고 카드에 스크롤도 없었다.
     2번안(상단바 지름길) + 3번안(안쪽만 스크롤 + 바닥 고정)을 함께 넣었다.
     ⚠️ 여기서 재는 것은 «되돌아가지 않았는가» 까지다 — «실제로 화면에 들어오는가 · 눌리는가» 는
        문자열로 원리상 못 본다. 그쪽은 manual/warmup-setup-reach-browser.mjs 가 좌표로 잰다
        (자동으로 안 돕니다, 사람이 부릅니다). */
  const css = (HTML.match(/\.menu-panel\{[\s\S]*?\}/) || [''])[0];
  check('⋮ 카드가 화면 높이를 넘지 않게 묶여 있다', /max-height:calc\(100[sv]h - \d+px\)/.test(css), css.slice(0, 80));
  check('카드가 flex 라 안쪽만 굴러간다', /display:flex/.test(css) && /flex-direction:column/.test(css));
  const sc = (HTML.match(/\.menu-scroll\{[\s\S]*?\}/) || [''])[0];
  check('굴러가는 칸(.menu-scroll)이 있다', /overflow-y:auto/.test(sc), sc.slice(0, 80));
  /* ⚠️ 카드를 실제로 붙잡는 것은 바로 위의 overflow-y:auto 입니다 — 그것만 되돌리면
     1366x768 에서 «다시 고르기» 가 다시 화면 밖으로 나갑니다(변이시험 실측).
     min-height:0 은 안전벨트입니다: flex 자식의 자동 최소 크기는 계산된 overflow 가
     visible 일 때만 걸리므로 지금은 겹쳐 있는 보호이고, overflow 를 되돌리는 날 일합니다.
     ⛔ 「min-height:0 을 빼면 아무것도 안 고쳐진다」로 적지 마세요 — 제가 그렇게 적었다가
        그 줄만 지운 판이 브라우저 검사 72/0 으로 통과하는 것을 보고 정정했습니다. */
  check('그 칸에 min-height:0 도 함께 있다(overflow 를 되돌릴 때의 안전벨트)', /min-height:0/.test(sc));
  check('마크업에도 그 칸이 있다', /<div class="menu-scroll">/.test(HTML));

  const re = (HTML.match(/\.menu-reopen\{[\s\S]*?\}/) || [''])[0];
  /* ⛔ 회색으로 되돌리면 위 설정 버튼들과 구분이 안 되어 «찾기 힘들다» 던 그 상태가 된다 */
  check('«다시 고르기» 가 눈에 띄는 색이다(회색 아님)',
    /linear-gradient/.test(re) && !/rgba\(255,255,255,\.06\)/.test(re), re.slice(0, 90));
  /* ⛔ 카드 안 버튼을 빼지 마세요 — 늘 하던 자리에서도 찾을 수 있어야 하고,
     manual/warmup-setup-browser.mjs 가 .menu-reopen 을 «실제로 눌러» 검사합니다. */
  check('카드 안 «다시 고르기» 버튼이 그대로 있다',
    /class="menu-reopen" onclick="openSetup\(true\)"/.test(HTML));

  // 🎚️ 상단바 지름길 — ⋮ 를 열지 않고 한 번에
  const tune = (HTML.match(/<button id="setupBtn"[\s\S]{0,260}?<\/button>/) || [''])[0];
  check('상단바에 🎚️ 지름길 버튼이 있다', tune.length > 20, '(못 찾음)');
  check('그 버튼이 설정 화면을 연다', /onclick="openSetup\(true\)"/.test(tune));
  check('그 버튼에 설명이 달려 있다(폰에는 hover 가 없다)',
    /title="[^"]+"/.test(tune) && /aria-label="[^"]+"/.test(tune));
  /* ⛔ 아이콘 버튼에 data-ko/data-en 을 달지 마세요 — 두 i18n 엔진이 textContent 를 통째로
     갈아끼워 34px 상자에 문장이 들어앉습니다(CLAUDE.md 2장). 설명은 title/aria-label 로. */
  check('그 버튼에 data-ko/data-en 이 없다(아이콘이 문장으로 바뀌는 함정)',
    !/data-(ko|en)=/.test(tune));
  /* 🔗 두 입구가 «같은 말» 을 해야 합니다 — 카드 안 버튼은 2026-09-15 에 «교재» 를 넣어
     「이 이름이 교재를 암시하지 않아 아무도 못 찾는다」를 고쳤는데(#987), 새로 낸 상단바
     지름길이 옛 말을 그대로 쓰면 그 수리가 새 입구에서 되살아납니다.
     ⛔ 기대 글자를 여기 손으로 적지 마세요 — 둘을 «서로» 대조해야 한쪽만 바꿔도 잡힙니다. */
  const reopenLabel = ((HTML.match(/class="menu-reopen"[^>]*>([^<]+)</) || [, ''])[1] || '')
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9·]/g, '');
  const tuneLabel = ((tune.match(/title="([^"]+)"/) || [, ''])[1] || '')
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9·]/g, '');
  check('상단바 지름길과 카드 안 버튼이 같은 말을 한다',
    !!tuneLabel && tuneLabel === reopenLabel, `상단바 "${tuneLabel}" / 카드 "${reopenLabel}"`);
  /* 📌 «교재» 라는 낱말은 2026-09-15 결정입니다 — 그 전 이름(연령·수준 다시 고르기)은
     교재를 암시하지 않아, 대화 중에 교재를 바꾸는 유일한 길인데도 아무도 못 찾았습니다(#987).
     ⛔ 지워서 짧게 만들지 마세요. 위 대조만으로는 «둘 다» 옛 말로 돌아가면 잡지 못합니다. */
  check('그 이름이 교재를 바꾸는 길이라고 말해 준다(#987)',
    /교재/.test(reopenLabel) && /교재/.test(tuneLabel), `카드 "${reopenLabel}"`);

  // 🎗️ 설정 화면 확정 버튼을 띠로 감싸 «여기서 끝» 이라고 말해 준다
  const bar = (HTML.match(/\.wus-ctabar\{[\s\S]*?\}/) || [''])[0];
  check('확정 버튼이 띠에 담겨 바닥에 붙는다', /position:sticky/.test(bar), bar.slice(0, 80));
  check('마크업에도 그 띠가 있다', /<div class="wus-ctabar">/.test(HTML));
  /* ⛔ 값을 못 구하면 「—」를 남기지 말고 줄째 감춘다(빈 값은 «고장» 으로 읽힌다).
     ⚠️ 이것을 «pick.hidden = !parts.length» 라는 식 모양으로 못 박지 마세요 —
        뜻이 같은 리팩터(parts.length === 0)에 거짓 FAIL 이 납니다(CLAUDE.md 2장).
        그 블록을 오려 내 «실제로 돌려» 답으로 묻습니다. 그래야 조건을 뒤집는 변이
        (pick.hidden = false)도 잡힙니다 — 글자로 물으면 그 변이가 그대로 통과합니다. */
  const pickSrc = (HTML.match(/var pick = document\.getElementById\('wusPickNow'\);[\s\S]*?\n  \}/) || [''])[0];
  check('«고른 것» 줄을 채우는 코드를 오려 냈다(전제)', pickSrc.length > 80, pickSrc.slice(0, 70));
  if (pickSrc.length > 80) {
    const runPick = (lv, ag) => {
      const el = { textContent: '(안 건드림)', hidden: '(안 건드림)' };
      const doc = { getElementById: (id) => (id === 'wusPickNow' ? el : null) };
      const LEV = [{ n: 3, ko: '기초' }, { n: 4, ko: '중급' }];
      const AGE = [{ id: 'kid', ko: '유아' }, { id: 'adult', ko: '어른' }];
      try {
        new Function('document', 'LEVEL_CATALOG', 'AGE_CATALOG', '_warmLevel', '_warmAge', pickSrc)(doc, LEV, AGE, lv, ag);
      } catch (e) { return { err: String((e && e.message) || e) }; }
      return el;
    };
    const both = runPick(3, 'kid');
    check('고른 값이 있으면 그 이름을 적고 줄을 보여 준다',
      both.hidden === false && /기초/.test(String(both.textContent)) && /유아/.test(String(both.textContent)),
      JSON.stringify(both));
    // ⛔ 짝 — 이것이 없으면 «언제나 보여주기»(조건 뒤집기) 변이가 통과합니다
    const none = runPick(99, 'zzz');
    check('값을 하나도 못 구하면 줄째 감춘다(빈 값을 남기지 않음)',
      none.hidden === true && !/고른 것/.test(String(none.textContent)),
      JSON.stringify(none));
    const half = runPick(3, 'zzz');
    check('한쪽만 알아도 아는 것만 적고 보여 준다',
      half.hidden === false && /기초/.test(String(half.textContent)) && !/zzz/.test(String(half.textContent)),
      JSON.stringify(half));
  }
  /* ⛔ 마크업에 «고른 것: —» 를 적어 두지 마세요 — 첫 렌더 전(또는 renderSetup 이 예외로
     빠졌을 때) 그 글자가 그대로 남아 위 ⛔ 와 정면으로 어긋납니다. */
  check('마크업의 그 줄은 처음부터 감춰져 있다(«—» 잔상 방지)',
    /<p class="wus-hint2" id="wusPickNow" hidden><\/p>/.test(HTML));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`웜업 연령·수준 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
