/* 🦴🔄 아바타 턱 내리기 · 고개 좌우 돌리기 (js/mango-avatar.js v21, 2026-11-09)
 *
 * 왜: 사장님 「영상 앱처럼 입모양·고개·표정 모두」 — 입 칸만 바뀌고(턱 고정) 고개는 «기울기» 만 하던 얼굴에
 *     ① 입이 열린 만큼 턱이 내려가는 띠(JAW) ② 이목구비만 옆으로 미는 고개 돌림(yaw)을 더했습니다.
 *
 * 무엇을 보는가 (표·숫자를 «소스에서» 읽어 서로 대조합니다 — 숫자를 베끼지 않습니다)
 *   ① JAW 표: 그림 입모양 캐릭터(PRECISION)만 · 순서 top < b0 ≤ b1 < bot · 좌우 x0 < x1
 *   ② 접힘 없음: D < (b0-top) 이고 턱 밑 목 줄임 (bot-b1)/(bot-b1-D) ≤ 1.5 — 넘으면 목이 접혀 보입니다
 *   ③ 자리: 입술 선(top)은 입 칸 «안», 턱끝(b1)은 입 칸 «아래», 띠는 눈 칸과 안 겹치고 그림 안
 *   ④ JAW_OPEN: 다문 입(X·A) 0 · «아»(D) 1 · 모두 0~1
 *   ⑤ jawOpen(): 소스의 함수를 그대로 돌려 — 앵커는 표 값, 중간 그림은 step/5 만큼 두 값 사이(짝: 끝값 아님)
 *   ⑥ 고개 돌림 크기: SWAY_YAW ≤ 0.1 · 말할 때(×SWAY_TALK)도 볼 띠(0.55 반폭)보다 작아 접히지 않는다
 *   ⑦ 연결: 입을 그린 «뒤» 턱을 늘이고, 턱 띠를 매 프레임 다시 깔고, 머리 층에서만 고개를 돌린다
 *   ⑧ 섞기: 두 띠 모두 destination-out → lighter (source-over 로 얹으면 투명한 가장자리에 옛 윤곽이 남음)
 *
 * 실제 픽셀(턱이 몇 px 내려가는가 · 이목구비가 윤곽보다 더 움직이는가 · 옛 판과의 짝)은 브라우저 검사가 잽니다:
 *   test-harness/manual/avatar-jaw-yaw-browser.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(process.env.AVATAR_SRC || join(ROOT, 'cloudflare-deploy/public/js/mango-avatar.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, why = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ FAIL ' + m + (why ? '\n       → ' + why : ''))); };
const grab = (re) => { const m = SRC.match(re); try { return m && new Function('return ' + m[1])(); } catch { return null; } };

console.log('■ 아바타 턱 내리기 · 고개 좌우 돌리기 (mango-avatar.js v21)');
const JAW = grab(/var JAW\s*=\s*(\{[^;]*\});/);
const OPEN = grab(/var JAW_OPEN\s*=\s*(\{[^;]*\});/);
const PREC = grab(/var PRECISION\s*=\s*(\{[\s\S]*?\}\});/);
const EYES = grab(/var EYES\s*=\s*(\{[^;]*\});/);
const HEAD = grab(/var HEAD\s*=\s*(\{[\s\S]*?\}\});/);
const num = (re) => { const m = SRC.match(re); return m ? +m[1] : NaN; };
const YAW = num(/var SWAY_YAW\s*=\s*([\d.]+)/), TALK = num(/SWAY_TALK\s*=\s*([\d.]+)/);
ok(JAW && OPEN && PREC && EYES && HEAD && YAW > 0 && TALK > 0, '(전제) JAW·JAW_OPEN·PRECISION·EYES·HEAD·SWAY_YAW 를 소스에서 읽었다');
if (!JAW || !OPEN || !PREC || !EYES || !HEAD) { console.log(`\n${pass} PASS / ${fail + 1} 실패`); process.exit(1); }

// ① ~ ③
const names = Object.keys(JAW);
ok(names.length >= 2 && names.every(n => PREC[n]), `① 턱 표는 그림 입모양 캐릭터만 (${names.join(', ')})`);
for (const n of names) {
  const j = JAW[n], r = PREC[n], e = EYES[n], h = HEAD[n];
  ok(j.x0 < j.x1 && j.top < j.b0 && j.b0 <= j.b1 && j.b1 < j.bot && j.D > 0, `① ${n}: 순서 top<b0≤b1<bot · x0<x1 · D>0`);
  const squeeze = (j.bot - j.b1) / (j.bot - j.b1 - j.D);
  ok(j.D < j.b0 - j.top && squeeze > 0 && squeeze <= 1.5, `② ${n}: 접힘 없음 (턱 밑 목 ${squeeze.toFixed(2)}배 줄임 ≤ 1.5)`);
  ok(j.top > r.y && j.top < r.y + r.h && j.b1 > r.y + r.h, `③ ${n}: 입술 선은 입 칸 안, 턱끝은 입 칸 아래 (top ${j.top} · b1 ${j.b1} · 입 칸 ${r.y}~${r.y + r.h})`);
  ok(!e || j.top > e.y + e.h, `③ ${n}: 턱 띠가 눈 칸과 안 겹친다`);
  ok(!h || (j.x0 >= 0 && j.x1 <= h.w && j.bot <= h.h), `③ ${n}: 띠가 그림(${h && h.w}x${h && h.h}) 안`);
  ok(j.fl > 0 && j.fr > 0 && j.fl + j.fr < j.x1 - j.x0, `③ ${n}: 좌우 섞는 폭이 띠 안에 들어간다`);
}

// ④ ⑤
ok(OPEN.X === 0 && OPEN.A === 0 && OPEN.D === 1 && Object.values(OPEN).every(v => v >= 0 && v <= 1) &&
  'XABCDEFGH'.split('').every(p => p in OPEN), '④ JAW_OPEN: 다문 입 0 · «아» 1 · 아홉 입모양 모두 0~1');
const fm = SRC.match(/function jawOpen\(s,pose\)\{[\s\S]*?\n    \}/);
let jawOpen = null; try { jawOpen = fm && new Function('JAW_OPEN', fm[0] + '; return jawOpen;')(OPEN); } catch { jawOpen = null; }
ok(typeof jawOpen === 'function', '(전제) jawOpen 을 소스에서 떼어 돌릴 수 있다');
if (jawOpen) {
  ok(jawOpen(null, 'D') === 1 && jawOpen({ pose: 'X', tile: -1 }, 'X') === 0 && jawOpen(null, '?') === 0, '⑤ 앵커는 표 값 · 모르는 입모양은 0');
  // tile = (from*8 + (to<from?to:to-1))*4 + step-1  — avatar-visemes.js 의 frame() 과 같은 식
  const tile = (f, t, step) => { const a = 'XABCDEFGH'.indexOf(f), b = 'XABCDEFGH'.indexOf(t); return (a * 8 + (b < a ? b : b - 1)) * 4 + step - 1; };
  const v2 = jawOpen({ pose: 'D', from: 'A', to: 'D', tile: tile('A', 'D', 2) }, 'D');
  ok(Math.abs(v2 - 0.4) < 1e-9, `⑤ 중간 그림 A→D step2 = 0.4 (${v2})`);
  const v4 = jawOpen({ pose: 'X', from: 'D', to: 'X', tile: tile('D', 'X', 4) }, 'X');
  ok(Math.abs(v4 - 0.2) < 1e-9 && v4 !== OPEN.X && v4 !== OPEN.D, `⑤ (짝) D→X step4 = 0.2 — 끝값으로 «뚝» 바뀌지 않는다 (${v4})`);
}

// ⑥
ok(YAW <= 0.1, `⑥ 고개 돌림은 작게 — SWAY_YAW ${YAW} ≤ 0.1 (얼굴 폭 약 ±3%)`);
ok(YAW * TALK < 0.55, `⑥ 말할 때(×${TALK})도 볼 띠(반폭 0.55)보다 작아 접히지 않는다 (${(YAW * TALK).toFixed(3)})`);
const yawChars = Object.keys(HEAD).filter(n => EYES[n]);
ok(yawChars.length >= 6, `⑥ 고개 돌림은 눈 칸이 있는 머리 캐릭터 모두 (${yawChars.join(', ')})`);
for (const n of yawChars) {
  const e = EYES[n], h = HEAD[n], hw = e.w / 2, c = e.x + hw;
  ok(c - 1.15 * hw >= 0 && c + 1.15 * hw <= h.w && e.y - 0.35 * e.h >= 0 && e.y + 2.6 * e.h <= h.y2,
    `⑥ ${n}: 고개 띠가 그림 안 · 목 경계(y2) 위에서 끝난다`);
}

// ⑦ ⑧
const body = (name) => { const m = SRC.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n    \\}')); return m ? m[0] : ''; };
const compose = body('composeFrame'), restore = body('preciseRestore'), layers = body('swayLayers');
const iSprite = compose.indexOf('ctx.drawImage(sprite'), iJaw = compose.indexOf('jawWarp(jawOpen(sampled,pose)');
ok(iSprite > 0 && iJaw > iSprite, '⑦ 입을 그린 «뒤» 에 턱을 늘인다 (입까지 함께 내려간다)');
ok(/JAW\[curChar\]/.test(restore) && /if \(j\) boxes\.push\(\[j\.x0, j\.top, j\.x1 - j\.x0, j\.bot - j\.top\]\)/.test(restore), '⑦ 턱 띠를 매 프레임 원본으로 다시 깐다 (안 하면 다음 프레임에 또 늘어남)');
ok(/x\.drawImage\(comp, 0, 0, W, H\);\s*yawFace\(x, W, H, yaw\)/.test(layers), '⑦ 고개 돌림은 머리 층(swayLayers)에서만 — 몸은 그대로');
ok(/swayLayers\(W, H, tilt, pose\.yaw\)/.test(SRC) && /if \(!HEAD\[curChar\] \|\| swayReduced\(\)\) return null;/.test(SRC), '⑦ «움직임 줄이기» 면 자세(pose)가 없어 고개도 안 돈다');
const blend = body('blendBand');
ok(/'destination-out'[\s\S]*'lighter'/.test(blend) && !/'source-over'; c\.drawImage/.test(blend), '⑧ 띠 섞기는 destination-out → lighter');
ok((SRC.match(/blendBand\(/g) || []).length >= 3, '⑧ 턱·고개 두 띠가 같은 섞기(blendBand)를 쓴다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
