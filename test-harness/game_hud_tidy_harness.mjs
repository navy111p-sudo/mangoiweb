// -*- coding: utf-8 -*-
// 🧪 «상단 HUD 가 적을 가린다» 회귀 하니스 (2026-08-06)
//   실행:  node test-harness/game_hud_tidy_harness.mjs
//   신고:  P-38  — "이게 가려서 적전투기가 안보여. 투명으로 하고 최대한 꼭대기에"
//          탱크대전 — "너무 복잡하고 이것 때문에 적전차가 안보여. 위로 최대한 올리고 깨끗하게"
//   공통 원인: 상단에 **띠가 세 개**(버튼 줄 / 점수 줄 / 문장 줄) 쌓였고,
//              문장이 길수록 아래 띠가 전장 한복판까지 내려왔다.
//   방식:  화면 없이 소스만 본다. 숫자는 소스에서 떼어 쓰고, 다시 적지 않는다.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB  = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const P38  = readFileSync(join(PUB, 'student-game-p38-3d.html'), 'utf8');
const TANK = readFileSync(join(PUB, 'student-game-tank-battle.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) { PASS++; } else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }

// 규칙 하나를 통째로 떼어 온다(중괄호 균형 없이 첫 '}' 까지 — 이 파일들은 중첩 규칙이 없다)
const rule = (css, sel) => {
  const i = css.indexOf(sel + '{');
  return i < 0 ? '' : css.slice(i + sel.length + 1, css.indexOf('}', i));
};

/* ═══ ① P-38 — 문장판을 «판»에서 «투명한 칸»으로 ═══ */
console.log('\n① P-38 — 문장 바가 캐노피를 덮지 않는가');

const sw = rule(P38, '#sentWrap');
check('① #sentWrap 에 올리브 금속판(그라데이션 배경)이 없다', !/linear-gradient/.test(sw));
check('② 배경 자체를 껐다 (background:none)', /background:\s*none/.test(sw));
check('③ 테두리·그림자도 없다', /border:\s*0/.test(sw) && /box-shadow:\s*none/.test(sw));
check('④ 리벳 장식(::before/::after 판못)을 뗐다',
  !/#sentWrap::before\s*,\s*#sentWrap::after\{[^}]*radial-gradient/.test(P38));

const wc = rule(P38, '.wchip');
const rgbaBg = (wc.match(/background:\s*rgba\(([\d.,\s]+)\)/) || [])[1];
check('⑤ 낱말 칸이 반투명이다 (뒤로 적기가 비친다)', !!rgbaBg);
if (rgbaBg) {
  const a = Number(rgbaBg.split(',')[3]);
  check(`⑥ 그 투명도가 «비치는» 수준이다 (alpha ${a} ≤ 0.5)`, a > 0 && a <= 0.5);
}
check('⑦ 밝은 하늘에서도 읽히게 글자 그림자를 넣었다', /text-shadow:[^;]*#000/.test(wc));
// 가려진 낱말의 '— — —' 이 어두운 색이면 하늘 위에서 안 보인다(판이 있던 시절 색)
check('⑧ 가림표(— — —)도 하늘 위에서 보이는 밝은 색이다',
  /\.wchip\.hide::after\{[^}]*color:#[b-f]/i.test(P38));

console.log('\n② P-38 — 상단 띠를 셋에서 둘로');
check('⑨ 폰에서 점수 게이지가 버튼 줄(top:8px)로 올라갔다',
  /body\.mob\s+#gauges\{[^}]*top:8px/.test(P38));
check('⑩ 나가기·점3개 버튼 사이 빈칸에 놓았다 (left/right 로 자리 확보)',
  /body\.mob\s+#gauges\{[^}]*left:92px[^}]*right:56px/.test(P38));
check('⑪ 좁은 폰이라 라벨(SCORE·격추 KILLS)은 숨긴다',
  /body\.mob\s+\.gzL\{display:none\}/.test(P38));
check('⑫ 문장 바는 폰에서 화면 최상단에 붙박이 (layoutCockpit)',
  /if\(MOBILE\)\s*sy\s*=\s*\d+;/.test(P38));
{
  const sy = Number((P38.match(/if\(MOBILE\)\s*sy\s*=\s*(\d+);/) || [])[1]);
  // 버튼 줄이 top:8 + 높이 38 = 46 에서 끝난다. 그 바로 밑이어야 «최대한 꼭대기».
  check(`⑬ 그 위치가 버튼 줄 바로 밑이다 (${sy}px, 46~60 사이)`, sy >= 46 && sy <= 60);
}

/* ═══ ③ 탱크대전 ═══ */
console.log('\n③ 탱크대전 — 점수 알약이 전장으로 내려오지 않는가');

check('⑭ 폰 판정 함수가 있다 (세로·가로 모두)', /function\s+syncMobTidy\s*\(/.test(TANK));
check('⑮ 화면이 바뀔 때마다 다시 판정한다', /resize[\s\S]{0,80}syncMobTidy\(\)/.test(TANK));
check('⑯ 첫 로드에서도 한 번 부른다', /^\s*syncMobTidy\(\);\s*$/m.test(TANK));

/* 🔴 여기가 핵심. CSS 만 고치면 syncHudTop() 이 인라인 top 을 덮어써서 도로 내려온다. */
check('⑰ syncHudTop() 이 폰에서는 인라인 top 을 넣지 않는다 (안 그러면 CSS 가 진다)',
  /function\s+syncHudTop\s*\(\)\s*\{[\s\S]{0,600}?mobTidy[\s\S]{0,80}?hud\.style\.top\s*=\s*''/.test(TANK));
check('⑱ 폰에서 점수 알약이 조작버튼(🔊⏸) 줄로 올라간다',
  /body\.mobTidy\s+#hud\{[^}]*top:8px\s*!important/.test(TANK));
check('⑲ 조작버튼 자리를 비켜 놓는다 (right 로 확보)',
  /body\.mobTidy\s+#hud\{[^}]*right:92px/.test(TANK));

const tbNarrow = rule(TANK, 'body.mobTidy #topbar');
check('⑳ 좁은 폰(세로)은 문장이 알약 줄 밑에서 시작한다',
  /padding:\s*4[0-9]px/.test(tbNarrow));
check('㉑ 넓은 폰(가로)·태블릿은 문장을 맨 윗줄로 끌어올린다',
  /@media\s*\(min-width:620px\)\{[\s\S]{0,200}?body\.mobTidy\s+#topbar\{[^}]*padding:\s*2px/.test(TANK));

/* 「너무 복잡하다」 = 글자가 크고 그림자가 겹겹이었다 */
const koM = Number((TANK.match(/body\.mobTidy\s+#sentKo\{[^}]*font-size:([\d.]+)px/) || [])[1]);
const koD = Number((TANK.match(/#sentKo\{[^}]*font-size:([\d.]+)px/) || [])[1]);
const tkM = Number((TANK.match(/body\.mobTidy\s+\.wtok\{[^}]*font-size:([\d.]+)px/) || [])[1]);
const tkD = Number((TANK.match(/\.wtok\{font-size:([\d.]+)px/) || [])[1]);
check(`㉒ 폰에서 한국어 뜻 글자를 줄였다 (${koD} → ${koM}px)`, koM > 0 && koM < koD);
check(`㉓ 폰에서 낱말 글자를 줄였다 (${tkD} → ${tkM}px)`, tkM > 0 && tkM < tkD);
{
  const shD = ((TANK.match(/\.wtok\{[^}]*text-shadow:([^;}]+)/) || [])[1] || '').split(',').length;
  const shM = ((TANK.match(/body\.mobTidy\s+\.wtok\{[^}]*text-shadow:([^;}]+)/) || [])[1] || '').split(',').length;
  check(`㉔ 겹겹이 쌓인 글자 그림자도 덜어냈다 (${shD}겹 → ${shM}겹)`, shM > 0 && shM < shD);
}
check('㉕ 가로 폰(세로가 짧은 화면)은 한 단계 더 줄인다',
  /@media\s*\(orientation:landscape\)[^{]*\{[\s\S]{0,240}?body\.mobTidy\s+\.wtok/.test(TANK));
check('㉖ 아주 좁은 폰에서 알약이 버튼과 겹치지 않게 더 줄인다',
  /@media\s*\(max-width:390px\)\{[\s\S]{0,260}?body\.mobTidy\s+#timeBar/.test(TANK));

/* PC 는 건드리지 않았는가 — 원래 규칙이 그대로 남아 있어야 한다 */
check('㉗ PC 배치는 그대로다 (문장 아래 줄 규칙이 살아 있다)',
  /#hud\{position:absolute;top:60px/.test(TANK) &&
  /hud\.style\.top\s*=\s*Math\.round\(tb\.getBoundingClientRect\(\)\.height/.test(TANK));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
