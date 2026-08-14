// canvas_dpr_harness.mjs — 캔버스가 화면 배율에서 폭주하지 않는가 (2026-08-14)
//
//   무슨 사고였나:
//     PC 에서 아바타 게임을 켜 두면 «어두웠던 화면이 약 20초 뒤 밝게 바뀌어 글씨가 안 보인다».
//     원인은 색이나 테마가 아니라 **캔버스 크기 폭주**였다.
//
//     <canvas> 는 «대체 요소»라 position:absolute; inset:0 만으로는 늘어나지 않는다.
//     CSS 로 크기를 안 주면 **width/height 속성값이 곧 CSS 크기**가 된다.
//     그 상태에서 fitCanvas 가 매 프레임 «CSS크기 × devicePixelRatio» 를 속성에 다시 써 넣으므로,
//     배율이 1 이 아닌 화면에서는 크기가 프레임마다 곱해진다(300 → 375 → 468 → …).
//     실측: 20초 남짓에 4,194만 × 4,194만 px 까지 자라고 배경이 흰색으로 덮여 글자 대비가 무너졌다.
//
//   ⚠️ 이 사고가 오래 안 잡힌 이유가 이 하니스의 존재 이유다:
//      개발 PC·헤드리스 브라우저는 배율이 100%(dpr=1)라 곱셈이 1 → **절대 재현되지 않는다.**
//      정작 학생·선생님이 쓰는 윈도우 노트북은 대부분 125% 나 150% 다.
//      «내 화면에선 멀쩡한데 현장에서만 깨지는» 종류라 사람 눈으로는 못 잡는다.
//
//   검사: fitCanvas 를 쓰는 화면의 모든 <canvas> 가
//         ① CSS 로 크기를 갖거나(width/height 지정) ② fitCanvas 에 상한이 걸려 있는가.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

/* fitCanvas 류(캔버스 크기를 dpr 로 다시 계산하는 함수)를 가진 화면들 */
const FILES = ['student-game-avatar.html'];

for (const f of FILES) {
  const path = join(PUB, f);
  if (!existsSync(path)) { check(f + ' 존재', false, '파일 없음'); continue; }
  const s = readFileSync(path, 'utf8');
  console.log('\n▶ ' + f);

  // ① 전면 캔버스에 CSS 크기가 있는가 — 없으면 속성값이 CSS 크기가 되어 폭주한다
  const ids = [...s.matchAll(/<canvas[^>]*\bid=["']([^"']+)["']/g)].map(m => m[1]);
  for (const id of ids) {
    const rule = new RegExp('#' + id + '\\s*\\{([^}]*)\\}').exec(s);
    const css = rule ? rule[1] : '';
    const sized = /(^|;|\s)width\s*:/.test(css) && /(^|;|\s)height\s*:/.test(css);
    check(`#${id} 에 CSS 크기가 지정돼 있다`, sized,
      rule ? `현재 규칙: {${css.trim().slice(0, 80)}}` : `#${id} 규칙이 아예 없다`);
  }

  // ② fitCanvas 자체에 상한이 있는가 — 새 캔버스가 ①을 빠뜨려도 폭주만은 막는다
  const fit = /function fitCanvas\(cv\)\{[\s\S]{0,900}?\n\}/.exec(s);
  check('fitCanvas 에 크기 상한(clamp)이 있다',
    !!fit && /Math\.min\(\s*LIMIT|LIMIT\s*,/.test(fit[0]),
    'r.width 를 그대로 쓰면 CSS 크기가 없는 캔버스에서 값이 매 프레임 커진다');

  // ③ 속성에 정수를 넣는가 — 소수를 넣으면 잘려서 비교가 어긋나 매 프레임 재할당된다
  check('캔버스 속성에 정수를 넣는다(Math.round)',
    !!fit && /cv\.width\s*=\s*aw|Math\.round\(\s*w\s*\*\s*dpr\s*\)/.test(fit[0]),
    'cv.width = w * dpr 는 소수가 될 수 있다');
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
