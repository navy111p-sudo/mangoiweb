// -*- coding: utf-8 -*-
// 🎚️ 판단력 훈련 — 읽기 밴드(읽기 난이도) 정확성 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/judgment_level_harness.mjs
//   대상:  cloudflare-deploy/src/judgment-level.ts 의 순수 함수 (node 타입 스트리핑으로 직접 import)
//   설계서: docs/판단력훈련_레벨시스템_제안서.md
//
//   이 파일이 지키는 것 — 학생이 실제로 받는 문제의 난이도를 결정하는 성질들:
//     A. 밴드 정규화가 언제나 1~8 안에 갇힌다
//     B. 교재 Lv 1~34 가 빈틈·겹침 없이 8밴드를 덮는다 (구간 누락 = 특정 레벨 학생이 배정 불가)
//     C. 밴드가 올라갈수록 문장이 길어진다 (단조성)
//     D. 자동 조절이 정답률 85% 목표에 '앉는다' — 5/6(83.3%)에서 올리지 않는다
//     E. 창이 다 차기 전에는 움직이지 않는다 (표본 부족 흔들림 방지)
//     F. 위아래 경계를 넘지 않는다
//     G. 프롬프트에 "판단은 쉬워지면 안 된다"가 항상 들어간다
//        (이게 빠지면 낮은 밴드가 단순 어휘 문제로 전락 = 판단력 훈련이 아니게 됨)
//     H. 실력에 맞는 밴드를 찾아가 그 자리에 머문다 (통합 시뮬레이션)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dir = dirname(fileURLToPath(import.meta.url));
const L = await import('file://' + resolve(__dir, '../cloudflare-deploy/src/judgment-level.ts').replace(/\\/g, '/'));
const { BAND_COUNT, DEFAULT_BAND, BAND_WINDOW, BAND_UP_CORRECT, BAND_DOWN_CORRECT, BAND_SPECS,
        normalizeBand, bandSpec, bandFromTextbookLevel, bandLabel, bandPromptLine,
        bandCatalog, bandName, pushResult, nextBand, nudgeBand } = L;
import { readFileSync } from 'node:fs';
const HTML = readFileSync(resolve(__dir, '../cloudflare-deploy/public/judgment.html'), 'utf8');
const SRVP = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-points.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
/** 정답 n개 + 오답(창 크기까지) 로 채운 최근 결과 창 */
const win = (correct, size = BAND_WINDOW) =>
  Array.from({ length: size }, (_, i) => (i < correct ? 1 : 0));

console.log('\n[ A. 밴드 정규화가 1~8 안에 갇히는가 ]');
{
  check('0 → 1 로 올라붙는다', normalizeBand(0) === 1, `현재 ${normalizeBand(0)}`);
  check('99 → 8 로 잘린다', normalizeBand(99) === BAND_COUNT, `현재 ${normalizeBand(99)}`);
  check('-5 → 1', normalizeBand(-5) === 1);
  check('null → 기본 밴드', normalizeBand(null) === DEFAULT_BAND, `현재 ${normalizeBand(null)}`);
  check('빈 문자열·문자 → 기본 밴드', normalizeBand('abc') === DEFAULT_BAND && normalizeBand(undefined) === DEFAULT_BAND);
  check('기본 밴드는 중앙(4)보다 낮다 — 쉬운 쪽에서 시작', DEFAULT_BAND < Math.ceil(BAND_COUNT / 2) + 1, `기본=${DEFAULT_BAND}`);
  let inRange = true;
  for (const v of [-9, 0, 1, 3, 8, 9, 1000, '7', 2.4, 2.6]) {
    const b = normalizeBand(v);
    if (!(b >= 1 && b <= BAND_COUNT)) inRange = false;
  }
  check('어떤 입력을 넣어도 1~8 밖으로 못 나간다', inRange);
}

console.log('\n[ B. 교재 Lv 1~34 가 빈틈·겹침 없이 8밴드를 덮는가 ]');
{
  check('밴드가 정확히 8개다', BAND_SPECS.length === BAND_COUNT, `현재 ${BAND_SPECS.length}개`);
  check('첫 밴드는 Lv 1 부터', BAND_SPECS[0].lvFrom === 1, `현재 ${BAND_SPECS[0].lvFrom}`);
  check('마지막 밴드는 Lv 34 까지', BAND_SPECS[BAND_SPECS.length - 1].lvTo === 34, `현재 ${BAND_SPECS[BAND_SPECS.length - 1].lvTo}`);
  let contiguous = true, detail = '';
  for (let i = 1; i < BAND_SPECS.length; i++) {
    if (BAND_SPECS[i].lvFrom !== BAND_SPECS[i - 1].lvTo + 1) { contiguous = false; detail = `밴드${i}과 ${i + 1} 사이`; }
  }
  check('밴드 구간이 끊기지도 겹치지도 않는다', contiguous, detail);
  // 실제 커리큘럼 전 레벨이 배정 가능한지 — 하나라도 null 이면 그 레벨 학생이 밴드를 못 받습니다
  let allMapped = true; const unmapped = [];
  for (let lv = 1; lv <= 34; lv++) { const b = bandFromTextbookLevel('Lv ' + lv); if (!b) { allMapped = false; unmapped.push(lv); } }
  check('Lv 1~34 전부가 밴드를 받는다', allMapped, unmapped.length ? `미배정 Lv ${unmapped.join(',')}` : '');
  check('Lv 1 → 밴드 1', bandFromTextbookLevel('Lv 1') === 1);
  check('Lv 4 → 밴드 1 (구간 끝)', bandFromTextbookLevel('Lv 4') === 1);
  check('Lv 5 → 밴드 2 (구간 시작)', bandFromTextbookLevel('Lv 5') === 2);
  check('Lv 34 → 밴드 8', bandFromTextbookLevel('Lv 34') === 8);
  check('Lv 35 이상 → 최상단 밴드(커리큘럼 확장 대비)', bandFromTextbookLevel('Lv 50') === BAND_COUNT);
  check('표기가 달라도 같게 읽는다 (Lv 12 / Lv12 / 12 / L12 / 레벨 12)',
    [ 'Lv 12', 'Lv12', '12', 'L12', '레벨 12' ].every((s) => bandFromTextbookLevel(s) === 3),
    JSON.stringify([ 'Lv 12', 'Lv12', '12', 'L12', '레벨 12' ].map(bandFromTextbookLevel)));
  check('숫자가 없으면 null (다른 소스로 폴백)', bandFromTextbookLevel('Beginner') === null && bandFromTextbookLevel(null) === null);
  check('0·음수는 null', bandFromTextbookLevel('Lv 0') === null);
  check('밴드 라벨이 Lv 구간을 보여준다', bandLabel(3) === 'Lv 9–12', bandLabel(3));
}

console.log('\n[ C. 밴드가 올라갈수록 문장이 길어지는가 ]');
{
  let mono = true, detail = '';
  for (let i = 1; i < BAND_SPECS.length; i++) {
    if (BAND_SPECS[i].maxWords <= BAND_SPECS[i - 1].maxWords) { mono = false; detail = `밴드${i + 1}=${BAND_SPECS[i].maxWords} ≤ 밴드${i}=${BAND_SPECS[i - 1].maxWords}`; }
  }
  check('단어 수 상한이 밴드마다 실제로 늘어난다', mono, detail);
  // ★ 하한이 없으면 위쪽 범주가 무력해집니다 — 라이브에서 상한 18인 중고급에 7단어가 나왔던 회귀
  let monoMin = true, dmin = '';
  for (let i = 1; i < BAND_SPECS.length; i++) {
    if (BAND_SPECS[i].minWords <= BAND_SPECS[i - 1].minWords) { monoMin = false; dmin = `밴드${i + 1}=${BAND_SPECS[i].minWords} ≤ 밴드${i}=${BAND_SPECS[i - 1].minWords}`; }
  }
  check('모든 밴드에 단어 수 하한이 있다', BAND_SPECS.every((s) => Number.isFinite(s.minWords) && s.minWords >= 1));
  check('하한도 밴드마다 실제로 늘어난다', monoMin, dmin);
  check('하한이 상한보다 작다', BAND_SPECS.every((s) => s.minWords < s.maxWords));
  check('위쪽 밴드의 하한이 아래쪽 밴드 상한보다 높다(구간이 실제로 갈린다)',
    BAND_SPECS[BAND_COUNT - 1].minWords > BAND_SPECS[0].maxWords,
    `최상 하한 ${BAND_SPECS[BAND_COUNT - 1].minWords} vs 최하 상한 ${BAND_SPECS[0].maxWords}`);
  check('최저 밴드가 충분히 짧다(≤6단어)', BAND_SPECS[0].maxWords <= 6, `현재 ${BAND_SPECS[0].maxWords}단어`);
  check('모든 밴드에 문법 범위 설명이 있다', BAND_SPECS.every((s) => typeof s.grammar === 'string' && s.grammar.length > 10));
  check('bandSpec 은 범위 밖 입력에도 항상 사양을 준다', !!bandSpec(0) && !!bandSpec(99) && !!bandSpec(null));
}

console.log('\n[ D. 자동 조절이 목표 85% 에 앉는가 — 이 기능의 핵심 ]');
{
  // 6문항 창의 가능한 정답률: 0 / 16.7 / 33.3 / 50 / 66.7 / 83.3 / 100%
  // 목표 85% 에 가장 가까운 값은 5/6 = 83.3% → 여기서 올리면 목표점에 머물 수가 없습니다.
  check('6/6(100%) → 올린다 (확실히 쉬움)', nextBand(4, win(6)).direction === 1, `현재 ${nextBand(4, win(6)).direction}`);
  check('5/6(83.3%) → 유지한다 ★목표 적중', nextBand(4, win(5)).direction === 0, `현재 ${nextBand(4, win(5)).direction} / reason=${nextBand(4, win(5)).reason}`);
  check('5/6 의 사유가 on_target 이다', nextBand(4, win(5)).reason === 'on_target', nextBand(4, win(5)).reason);
  check('4/6(66.7%) → 유지한다 (약간 어려움, 견딜 만함)', nextBand(4, win(4)).direction === 0);
  check('3/6(50%) → 내린다 (확실히 어려움)', nextBand(4, win(3)).direction === -1);
  check('0/6 → 내린다', nextBand(4, win(0)).direction === -1);
  check('한 번에 한 밴드씩만 움직인다', Math.abs(nextBand(4, win(6)).band - 4) === 1 && Math.abs(nextBand(4, win(0)).band - 4) === 1);
  check('밴드가 바뀌면 창을 비우라고 알려준다(연속 등락 방지)', nextBand(4, win(6)).reset === true && nextBand(4, win(0)).reset === true);
  check('유지일 때는 창을 비우지 않는다', nextBand(4, win(5)).reset === false);
  check('임계값 상수가 설계와 일치한다', BAND_UP_CORRECT === 6 && BAND_DOWN_CORRECT === 3, `up=${BAND_UP_CORRECT} down=${BAND_DOWN_CORRECT}`);
}

console.log('\n[ E. 창이 다 차기 전에는 움직이지 않는가 ]');
{
  let stable = true;
  for (let n = 0; n < BAND_WINDOW; n++) {
    const t = nextBand(4, win(n, n));            // n개 전부 정답인 짧은 창
    if (t.direction !== 0 || t.band !== 4 || t.reason !== 'window_not_full') stable = false;
  }
  check(`${BAND_WINDOW}문항이 쌓이기 전엔 절대 안 움직인다`, stable);
  check('5문항 전승도 안 움직인다', nextBand(4, win(5, 5)).direction === 0, `현재 ${nextBand(4, win(5, 5)).direction}`);
  check('빈 이력·잘못된 이력에도 안 터진다', nextBand(4, null).band === 4 && nextBand(4, 'x').band === 4 && nextBand(4, []).band === 4);
}

console.log('\n[ F. 위아래 경계를 넘지 않는가 ]');
{
  const top = nextBand(BAND_COUNT, win(6));
  const bot = nextBand(1, win(0));
  check('최상단에서 만점을 받아도 9로 안 간다', top.band === BAND_COUNT && top.direction === 0, `밴드=${top.band}`);
  check('최상단 사유가 at_ceiling', top.reason === 'at_ceiling', top.reason);
  check('최하단에서 전멸해도 0으로 안 간다', bot.band === 1 && bot.direction === 0, `밴드=${bot.band}`);
  check('최하단 사유가 at_floor', bot.reason === 'at_floor', bot.reason);
  check('경계에 부딪혀도 창은 비운다(같은 판정 반복 방지)', top.reset === true && bot.reset === true);
}

console.log('\n[ F-2. 학생이 직접 누르는 탈출구 ]');
{
  check('"너무 어려워요"(-1) 는 즉시 한 밴드 내린다', nudgeBand(4, -1).band === 3);
  check('"너무 쉬워요"(+1) 는 즉시 한 밴드 올린다', nudgeBand(4, 1).band === 5);
  check('연타로 큰 값을 보내도 한 밴드만 움직인다', nudgeBand(4, 99).band === 5 && nudgeBand(4, -99).band === 3);
  check('최하단에서 더 내려달라 해도 1을 지킨다', nudgeBand(1, -1).band === 1 && nudgeBand(1, -1).reason === 'at_floor');
  check('최상단에서 더 올려달라 해도 8을 지킨다', nudgeBand(BAND_COUNT, 1).band === BAND_COUNT && nudgeBand(BAND_COUNT, 1).reason === 'at_ceiling');
  check('0·null 은 아무 것도 안 한다', nudgeBand(4, 0).band === 4 && nudgeBand(4, null).direction === 0);
  check('밴드를 옮기면 창을 비운다', nudgeBand(4, -1).reset === true);
}

console.log('\n[ F-3. 최근 결과 창 관리 ]');
{
  let h = [];
  for (let i = 0; i < 10; i++) h = pushResult(h, i % 2 === 0);
  check(`창 크기가 ${BAND_WINDOW}를 넘지 않는다`, h.length === BAND_WINDOW, `현재 ${h.length}`);
  check('가장 최근 결과가 맨 뒤에 온다', h[h.length - 1] === 0, JSON.stringify(h));
  check('오래된 것부터 밀려난다', JSON.stringify(pushResult([1, 1, 1, 1, 1, 1], false)) === JSON.stringify([1, 1, 1, 1, 1, 0]));
  check('불리언·숫자·잘못된 이력 모두 1/0 으로 정규화된다',
    JSON.stringify(pushResult(null, true)) === JSON.stringify([1]) &&
    JSON.stringify(pushResult('x', 1)) === JSON.stringify([1]));
}

console.log('\n[ G. 프롬프트가 "읽기만 쉽게, 판단은 그대로"를 지시하는가 ]');
{
  const lines = BAND_SPECS.map((s) => bandPromptLine(s.band));
  check('밴드마다 프롬프트가 서로 다르다', new Set(lines).size === BAND_COUNT, `고유 ${new Set(lines).size}개`);
  check('모든 프롬프트에 단어 수 상한이 박혀 있다',
    lines.every((l, i) => l.includes(String(BAND_SPECS[i].maxWords) + ' words')));
  check('모든 프롬프트에 교재 Lv 구간이 들어간다',
    lines.every((l, i) => l.includes(bandLabel(BAND_SPECS[i].band))));
  // ★ 이 지시가 빠지면 낮은 밴드가 '뻔한 보기'가 되어 판단력 훈련이 아니라 어휘 문제가 됩니다
  check('모든 프롬프트가 "판단은 쉬워지면 안 된다"를 명시한다',
    lines.every((l) => /just as challenging/i.test(l) && /NOT from long sentences or hard words/i.test(l)));
  // 상황문은 '범위'(하한 필수), 선택지는 '상한만'(억지로 늘리면 아이 말투가 아니게 됨)
  check('상황문에 단어 수 범위(하한+상한)를 못 박는다',
    lines.every((l, i) => l.includes(`SITUATION text must be ${BAND_SPECS[i].minWords}-${BAND_SPECS[i].maxWords} words`)));
  check('상황문에 "더 짧아도 안 된다"를 명시한다', lines.every((l) => /not shorter, not longer/i.test(l)));
  check('선택지에도 상한을 건다', lines.every((l) => /Each OPTION must be at most/i.test(l)));
  check('선택지는 아이가 할 법한 말로 유지하라고 한다', lines.every((l) => /a child would really say/i.test(l)));
  check('범위 밖 밴드를 넣어도 프롬프트가 나온다', bandPromptLine(0).length > 50 && bandPromptLine(99).length > 50);
}

console.log('\n[ H. 실력에 맞는 밴드를 찾아가 그 자리에 머무는가 — 통합 시뮬레이션 ]');
{
  // 가상의 학생: 진짜 실력은 밴드 5.
  //   자기 밴드보다 낮으면 전승(6/6), 딱 맞으면 목표치(5/6), 높으면 버거움(2/6).
  const ABILITY = 5;
  const roundResults = (band) => band < ABILITY ? win(6) : band === ABILITY ? win(5) : win(2);
  const trace = [];
  let band = 1, hist = [];
  for (let round = 0; round < 40; round++) {
    for (const ok of roundResults(band)) hist = pushResult(hist, ok);
    const mv = nextBand(band, hist);
    band = mv.band; if (mv.reset) hist = [];
    trace.push(band);
  }
  check('밴드 1에서 시작해도 실력 밴드(5)까지 올라간다', trace.includes(ABILITY), `경로 ${trace.slice(0, 8).join('→')}…`);
  check('실력 밴드에 도착한 뒤 그 자리에 머문다(과승급 없음)',
    trace.slice(10).every((b) => b === ABILITY), `후반 밴드 ${[...new Set(trace.slice(10))].join(',')}`);
  check('최종 밴드가 실력과 일치한다', band === ABILITY, `최종 ${band}`);
  // 반대 방향 — 너무 높은 곳에서 시작한 학생이 내려오는가
  let band2 = 8, hist2 = [], trace2 = [];
  for (let round = 0; round < 40; round++) {
    for (const ok of roundResults(band2)) hist2 = pushResult(hist2, ok);
    const mv = nextBand(band2, hist2);
    band2 = mv.band; if (mv.reset) hist2 = [];
    trace2.push(band2);
  }
  check('밴드 8에서 시작해도 실력 밴드(5)까지 내려온다', band2 === ABILITY, `최종 ${band2} / 경로 ${trace2.slice(0, 8).join('→')}…`);
  // 목표 정답률 검증 — 수렴한 자리에서의 실제 정답률이 85% 근처인가
  const settled = roundResults(ABILITY).reduce((a, b) => a + b, 0) / BAND_WINDOW * 100;
  check('수렴한 자리의 정답률이 목표 85% 근처다(±5%p)', Math.abs(settled - 85) <= 5, `${settled.toFixed(1)}%`);
}

console.log('\n[ I. 범주 이름 — 화면에는 숫자가 아니라 이름이 보이는가 ]');
{
  const cat = bandCatalog();
  check('목록이 8개다', cat.length === BAND_COUNT, `현재 ${cat.length}개`);
  check('모든 범주에 한/영/중 이름이 있다',
    cat.every((c) => c.ko && c.en && c.zh), JSON.stringify(cat.filter((c) => !(c.ko && c.en && c.zh)).map((c) => c.band)));
  check('모든 범주에 한/영/중 설명이 있다', cat.every((c) => c.dko && c.den && c.dzh));
  check('이름이 서로 겹치지 않는다(한국어)', new Set(cat.map((c) => c.ko)).size === BAND_COUNT);
  check('이름이 서로 겹치지 않는다(영어)', new Set(cat.map((c) => c.en)).size === BAND_COUNT);
  check('목록에 교재 Lv 구간이 함께 온다', cat.every((c) => /^Lv \d+[-–]\d+$/.test(c.lv)), cat[0] && cat[0].lv);
  // 화면마다 'Lv 9-12' / 'Lv 9–12' 로 갈리면 강사가 다른 레벨로 오해합니다
  check('Lv 표기가 bandLabel 과 완전히 같다', cat.every((c) => c.lv === bandLabel(c.band)));
  check('이름과 Lv 을 붙인 표기를 준다', L.bandLvName(3, 'ko') === '초급 (Lv 9–12)', L.bandLvName(3, 'ko'));
  check('붙인 표기도 언어를 따른다', /Elementary/.test(L.bandLvName(3, 'en')), L.bandLvName(3, 'en'));
  check('낮은 밴드가 쉬운 이름이다(첫걸음/기초)', /첫걸음|기초/.test(cat[0].ko), cat[0].ko);
  check('높은 밴드가 어려운 이름이다(고급/최상급)', /고급|최상급/.test(cat[BAND_COUNT - 1].ko), cat[BAND_COUNT - 1].ko);
  check('bandName 이 언어별로 다른 이름을 준다',
    bandName(3, 'ko') !== bandName(3, 'en') && bandName(3, 'zh') !== bandName(3, 'en'),
    `${bandName(3, 'ko')} / ${bandName(3, 'en')} / ${bandName(3, 'zh')}`);
  check('범위 밖 밴드도 이름을 받는다(빈 화면 방지)', !!bandName(0) && !!bandName(99));
}

console.log('\n[ J. 학생이 직접 고르는 길이 열려 있는가 ]');
{
  check('라우트가 set_band 를 넘긴다', /setBand: Number\(body\.set_band\)/.test(SRVP));
  check('화면이 set_band 를 보낸다', /body\.set_band = setBand/.test(HTML));
  check('화면에 레벨 고르기 목록이 있다', /function showBandPicker\(\)/.test(HTML));
  check('목록을 서버 카탈로그로 그린다(이름 하드코딩 금지)', /BAND_CATALOG\.map/.test(HTML) && !/첫걸음/.test(HTML.replace(/\/\/.*$/gm, '')),
    '화면에 범주 이름을 직접 적어 두면 서버와 어긋납니다');
  check('고른 범주가 자동조절·±1 보다 우선한다',
    /const nudge = picked \? 0 :/.test(readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8')));
  // 미리 받아둔 문제는 '바꾸기 전' 난이도·모드로 만들어진 것이라 반드시 버려야 합니다
  check('고르거나 모드를 바꾸면 미리 받아둔 문제를 버린다', /if\(focusMisc \|\| nudge \|\| setBand \|\| mode\)/.test(HTML));
  check('같은 범주를 다시 고르면 서버를 부르지 않는다', /if\(b===CUR_BAND\)/.test(HTML));
  // 사장님 지시(2026-08-03): Lv 숫자 옆에 범주 이름이 보여야 한다
  check('목록에서 이름 옆에 교재 Lv 을 괄호로 붙인다', /lvp-lv">\('\+esc\(b\.lv\)\+'\)/.test(HTML));
  check('문제 화면에도 현재 범주를 이름+Lv 으로 보여준다',
    /var lvChip = lvName[\s\S]{0,400}reading_band_label/.test(HTML));
  check('칩이 어느 모드인지 아이콘으로 알려준다', /CUR_MODE==='manual' \? '🖐️ ' : '🤖 '/.test(HTML));
}

console.log('\n[ J-2. 지시를 어긴 결과를 서버가 걸러내는가 ]');
{
  const { countWords, situationFitsBand } = L;
  check('단어 수를 센다', countWords('I am in the library now.') === 6, String(countWords('I am in the library now.')));
  check('구두점만 있는 토큰은 안 센다', countWords('Hello , world !') === 2, String(countWords('Hello , world !')));
  check('빈 문장은 0', countWords('') === 0 && countWords(null) === 0);
  // 라이브 실측 회귀: 고급(밴드7, 16~22단어) 지정에 14단어가 왔다 → 여유(75%)로도 12 이상이면 통과,
  //   그보다 확실히 짧은 것은 걸러져야 한다
  const short = 'I am in the library.';                                   // 5단어
  check('고급 범주에 5단어짜리는 걸러진다', situationFitsBand(short, 7) === false);
  check('첫걸음 범주에는 5단어가 통과한다', situationFitsBand(short, 1) === true);
  const long = Array.from({ length: 40 }, () => 'word').join(' ');
  check('첫걸음 범주에 40단어짜리는 걸러진다', situationFitsBand(long, 1) === false);
  check('빈 상황문은 언제나 걸러진다', situationFitsBand('', 3) === false);
  // 여유가 없으면 재시도만 반복하다 문제를 못 줍니다
  check('여유값이 하한 아래·상한 위로 열려 있다', L.BAND_LEN_UNDER < 1 && L.BAND_LEN_OVER > 1,
    `under=${L.BAND_LEN_UNDER} over=${L.BAND_LEN_OVER}`);
  const SRVJ2 = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8');
  check('생성기가 길이를 검사해 다시 뽑는다', /if \(attempt < 2 && !situationFitsBand\(situation, bandState\.band\)\)/.test(SRVJ2));
  check('끝까지 안 맞으면 그래도 문제를 준다(재시도는 앞 2회만)', /attempt < 2 && !situationFitsBand/.test(SRVJ2));
}

console.log('\n[ K. 두 가지 모드 — AI가 맞춤 / 내가 고름 ]');
{
  const { normalizeBandMode, shouldAutoAdjust, DEFAULT_BAND_MODE } = L;
  check('기본은 AI 자동', DEFAULT_BAND_MODE === 'auto', DEFAULT_BAND_MODE);
  check('manual 은 그대로 읽는다', normalizeBandMode('manual') === 'manual');
  check('대소문자·공백을 견딘다', normalizeBandMode(' MANUAL ') === 'manual');
  check('모르는 값·빈 값은 전부 auto (옛 저장값 호환)',
    ['', null, undefined, 'xx', 0, {}].every((v) => normalizeBandMode(v) === 'auto'));
  check('auto 에서만 자동 조절이 돈다', shouldAutoAdjust('auto') === true && shouldAutoAdjust('manual') === false);
  check('값이 없으면 자동 조절이 돈다(기존 학생 동작 유지)', shouldAutoAdjust(null) === true);

  const SRVJ = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8');
  // ★ 이게 빠지면 "직접 골랐는데 AI 가 다시 옮겨" 고르는 기능이 무의미해집니다
  check('채점 뒤 자동 조절을 모드로 막는다', /if \(!shouldAutoAdjust\(st\.mode\)\)/.test(SRVJ));
  check('직접 모드에서도 정오 이력은 계속 쌓는다(자동으로 되돌릴 때 이어서 판단)',
    /if \(!shouldAutoAdjust\(st\.mode\)\)[\s\S]{0,200}hist,/.test(SRVJ));
  check('범주를 고르면 자동으로 직접 모드가 된다', /mode: wantMode \|\| 'manual'/.test(SRVJ));
  check('응답이 현재 모드를 알려준다', /band_mode: bandState\.mode/.test(SRVJ));
  check('라우트가 band_mode 를 넘긴다', /mode: \(body\.band_mode/.test(SRVP));

  check('화면에 모드 버튼 두 개가 있다',
    /data-m="auto"/.test(HTML) && /data-m="manual"/.test(HTML));
  check('화면이 band_mode 를 보낸다', /body\.band_mode = mode/.test(HTML));
  check('현재 모드가 버튼에 표시된다', /CUR_MODE==='auto'\?' cur'/.test(HTML));
}

console.log('\n[ L. 범주 이름이 화면 언어를 따르는가 — 회귀 방지 ]');
{
  // 🐛 라이브 사고: 한국어 화면인데 칩이 'Elementary' 로 떴다.
  //    문제 지문은 항상 영어라 서버에 lang:'en' 을 보내는데, 이름까지 그 언어를 따라갔기 때문.
  check('화면은 목록에서 이름을 고른다(서버의 reading_band_name 을 그대로 쓰지 않는다)',
    /function bandNameOf\(band\)/.test(HTML) && /var lvName = bandNameOf\(scenario\.reading_band\)/.test(HTML));
  check('칩이 reading_band_name 을 직접 쓰지 않는다',
    !/esc\(scenario\.reading_band_name\)/.test(HTML),
    '그 값은 문제 지문의 언어(en)를 따라갑니다');
  check('bandNameOf 가 화면 언어(LANG)를 쓴다', /function bandText\(b, key\)[\s\S]{0,240}LANG==='en'/.test(HTML));
  check('서버는 그 함정을 주석으로 남겨 두었다',
    /lang 은 '문제 지문의 언어'/.test(readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8')));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`판단력 읽기밴드 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
