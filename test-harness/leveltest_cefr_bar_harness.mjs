// leveltest_cefr_bar_harness.mjs — 레벨테스트 결과의 CEFR 막대가 «실제로 그려지는가» (2026-09-09)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 사장님 제보 「A1, A2 와 4/4, 3/4 사이의 막대에 색상이 추가되어 시각적으로 내 점수를
// 더 쉽게 볼 수 있었으면 좋겠음」.
//
// 재 보니 «색을 더하는» 문제가 아니었다 — 색은 **이미 코드에 있었고**(보라 그라데이션)
// 채움 막대가 한 번도 그려지지 않고 있었다. `.bkfill` 이 <span> 인데 부모 `.bkbar` 가
// flex 컨테이너가 아니라 기본값이 `display:inline` 이고, **인라인 요소는 width·height 를
// 무시**하기 때문이다.
//   [잰 것 — 2026-09-09 브라우저 실측] A1(지시 100%)·A2(75%)·C2(0%) 가 전부
//   fillWidth 0.0px / fillHeight 0.0px. ⟹ 4/4 와 0/4 가 화면에서 «똑같이» 빈 막대였다.
//   같은 파일의 진행 막대(.progfill)는 <div> 라 멀쩡했다 — 이 한 줄만 달랐다.
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   ① `.bkfill` 이 «상자» 다 (display 가 inline 계열이면 폭·높이가 통째로 죽는다)
//   ② 점수별 색 다섯 등급이 CSS 에 «서로 다른» 값으로 실재한다
//   ③ 등급을 고르는 함수를 **소스에서 오려 내 실제로 돌려** 0~4 가 서로 다른 등급이 되는지
//   ④ 0점도 «측정됐다» 를 남긴다(폭 0 이 아니다) · 문항이 없는 밴드(total=0)는 채우지 않는다
//   ⑤ 기본 색을 지우지 않았다 — 등급 클래스가 안 붙는 날에도 «보이는» 쪽으로 실패해야 한다
//
// ⚠️ 「그 규칙이 있는가」로만 보면 이 사고를 원리상 못 잡는다 — 사고 당시에도
//    규칙도 색도 전부 «있었다». 틀린 것은 «그려지는가» 하나뿐이었다.
//    그래서 ③은 문자열이 아니라 **실행**이고, 화면 실측은 아래 브라우저 검사가 맡는다:
//      node test-harness/manual/hero-cta-and-cefr-bar-browser.mjs
//
// 실행: node test-harness/leveltest_cefr_bar_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dir, '../cloudflare-deploy/public/level-test-ai.html');
const SRC = readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

console.log('┌────────────────────────────────────────────────');
console.log('│ 📊 레벨테스트 CEFR 막대 — 그려지는가 · 점수별 색');
console.log('├────────────────────────────────────────────────');

/* ── ① 채움이 «상자» 인가 ──────────────────────────────────────────────────
   ⚠️ 「display:block 이라고 적혀 있는가」가 아니라 「인라인이 아닌가」로 묻는다.
      flex·inline-flex·grid 로 바꿔도 폭·높이는 살아나므로 그 수리를 빨간불로 만들면 안 된다.
      ⛔ 반대로 `display` 를 아예 안 적으면 기본값이 inline 이라 사고가 그대로 재현된다. */
const fillRule = (SRC.match(/^\s*\.bkfill\s*\{([^}]*)\}/m) || [])[1] || '';
ok('① .bkfill 규칙이 있다', !!fillRule.trim(), '규칙 자체를 못 찾음');
const disp = (fillRule.match(/(?:^|;)\s*display\s*:\s*([a-z-]+)/i) || [])[1] || '';
ok('① .bkfill 이 «상자» 다 (display 를 정하고, 인라인이 아니다)',
  !!disp && !/^inline$|^inline-block$/.test(disp),
  `display=${disp || '(없음 — 기본값 inline 이라 폭·높이가 죽는다)'}`);

/* ── ② 점수별 색이 서로 다른가 ──────────────────────────────────────────── */
const grades = ['s4', 's3', 's2', 's1', 's0'];
const gradeBg = {};
for (const g of grades) {
  const m = SRC.match(new RegExp('\\.bkfill\\.' + g + '\\s*\\{([^}]*)\\}'));
  gradeBg[g] = m ? (m[1].match(/background\s*:\s*([^;]+)/i) || [])[1] : null;
}
ok('② 다섯 등급 색이 모두 정의돼 있다', grades.every((g) => !!gradeBg[g]),
  grades.filter((g) => !gradeBg[g]).join(',') + ' 없음');
ok('② 다섯 등급이 «서로 다른» 색이다',
  new Set(grades.map((g) => String(gradeBg[g] || '').trim())).size === grades.length,
  JSON.stringify(gradeBg));

/* ── ⑤ 기본 색을 지우지 않았다 (등급이 안 붙어도 보여야 한다) ───────────── */
ok('⑤ .bkfill 기본 배경이 남아 있다 (등급 클래스가 안 붙는 날의 안전망)',
  /background\s*:/i.test(fillRule), fillRule.trim().slice(0, 80));

/* ── ③④ 등급 고르는 코드를 «오려 내 실제로 돌린다» ────────────────────────
   ⚠️ 베껴 쓰면 검사가 소스를 한 번도 안 본다(이 저장소가 실제로 밟은 함정).
      잘라 내기에 실패하면 통과시키지 않는다 — 꺼진 검사가 초록불인 것이 가장 나쁘다. */
const A = SRC.indexOf('    var barCls = function (pct) {');
const B = SRC.indexOf('};', A);
if (A < 0 || B < 0) {
  console.log('  🚨 barCls 를 소스에서 잘라 내지 못했습니다 — 검사를 통과시키지 않습니다.');
  process.exit(1);
}
// eslint-disable-next-line no-new-func
const barCls = new Function('return (' + SRC.slice(A + '    var barCls = '.length, B + 1) + ')')();

const pct = (c, t) => (t ? Math.round((c / t) * 100) : 0);
const got = [0, 1, 2, 3, 4].map((c) => barCls(pct(c, 4)));
ok('③ 0~4점이 서로 다른 등급이 된다', new Set(got).size === 5, got.join(','));
ok('③ 만점이 가장 높은 등급(s4)', barCls(100) === 's4', barCls(100));
ok('③ 0점이 s0', barCls(0) === 's0', barCls(0));
ok('③ 문항 수가 4가 아니어도 뜻이 같다 (5문항 중 5개 = 만점)',
  barCls(pct(5, 5)) === 's4' && barCls(pct(0, 5)) === 's0');
ok('③ 3/6(50%) 은 절반 등급', barCls(pct(3, 6)) === 's2', barCls(pct(3, 6)));

/* ── ④ 0점 폭 · 문항 없음 ────────────────────────────────────────────────
   렌더 한 줄을 오려 내 폭 계산식을 그대로 평가한다. */
const RA = SRC.indexOf("      var w = !r.total ? 0 : (pct > 0 ? pct : 6);");
ok('④ 폭 계산식이 그 자리에 있다', RA >= 0);
if (RA >= 0) {
  // eslint-disable-next-line no-new-func
  const widthOf = new Function('r', 'pct', 'var w; ' + SRC.slice(RA, SRC.indexOf('\n', RA)).trim() + ' return w;');
  ok('④ 0/4 는 폭 0 이 아니다 (빈 막대는 «측정 안 됨» 으로 읽힌다)',
    widthOf({ total: 4 }, 0) > 0, String(widthOf({ total: 4 }, 0)));
  ok('④ 0/4 의 폭이 «조금 맞았다» 로 보일 만큼 크지 않다',
    widthOf({ total: 4 }, 0) <= 10, String(widthOf({ total: 4 }, 0)));
  ok('④ 문항이 없는 밴드(total=0)는 채우지 않는다 — «0점» 이 아니라 «모름»',
    widthOf({ total: 0 }, 0) === 0, String(widthOf({ total: 0 }, 0)));
  ok('④ 4/4 는 100% 를 채운다', widthOf({ total: 4 }, 100) === 100);
}

/* ── 색«만» 으로 뜻을 지지 않는가 (색약 대비) ─────────────────────────────
   🪤 처음에는 `… || SRC.includes("'</span>'")` 라는 폴백을 달아 두었는데, 그 글자가 파일에
      늘 있어서 **`.bkn` 칸을 통째로 지워도 초록불**이었습니다(함정 대조가 잡았습니다).
      하필 그 검사가 지키기로 한 것이 «색약이어도 숫자로 읽을 수 있다» 는 안전망입니다.
   ✅ 그래서 렌더 코드를 «오려 내 실제로 돌려» 그 칸에 correct/total 이 실제로 찍히는지 봅니다. */
{
  const A2 = SRC.indexOf("      return '<div class=\"bkrow\"");
  const B2 = SRC.indexOf("}).join('');", A2);
  ok('색약 대비: 렌더 코드를 잘라 냈다', A2 >= 0 && B2 > A2);
  if (A2 >= 0 && B2 > A2) {
    // eslint-disable-next-line no-new-func
    const rowHtml = new Function('r', 'esc', 'var pct=r.total?Math.round(r.correct/r.total*100):0;'
      + 'var w=!r.total?0:(pct>0?pct:6); var cls=r.total?(" "+(pct>=100?"s4":pct>=75?"s3":pct>=50?"s2":pct>0?"s1":"s0")):"";'
      + SRC.slice(A2, B2).replace(/^\s*return/, 'return'));
    const html = rowHtml({ cefr: 'A2', correct: 3, total: 4 }, (x) => String(x));
    ok('색약 대비: 막대 옆에 «3/4» 숫자가 실제로 그려진다 (색만으로 판단하지 않게)',
      /class="bkn">\s*3\/4\s*</.test(html), html.slice(0, 140));
  }
}

console.log('├────────────────────────────────────────────────');
console.log(`│ 📊 leveltest_cefr_bar_harness — PASS ${pass} / FAIL ${fail}`);
console.log('└────────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
