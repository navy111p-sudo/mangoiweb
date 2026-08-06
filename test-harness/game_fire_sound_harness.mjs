// -*- coding: utf-8 -*-
// 🧪 «쏴도 소리가 안 나고, 발사가 안 된다» 회귀 하니스 (2026-08-06)
//   실행:  node test-harness/game_fire_sound_harness.mjs
//   대상:  ① student-game-space-monster.html — 소리 토글이 '상태'인지 '동작'인지 구분이 안 됐다
//          ② student-game-p38-3d.html        — 발사 버튼이 조종간을 안 따라가 실제 누르는 자리가 어긋났다
//                                            + 세로 폰에서 캐노피 사진 배율이 3.13배라 프레임이 두꺼웠다
//   방식:  화면을 띄우지 않고 **소스에서 실제 계산식을 떼어 그대로 실행**한다.
//          (숫자를 여기에 다시 적으면 가짜 검사가 된다 — 실제로 그런 사고가 있었다)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB  = join(ROOT, 'cloudflare-deploy', 'public');
const SM   = readFileSync(join(PUB, 'student-game-space-monster.html'), 'utf8');
const P38  = readFileSync(join(PUB, 'student-game-p38-3d.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) { PASS++; } else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }

/* ═══════════════════════════════════════════════════════════════
   ① 우주 괴물 사냥 — 소리 토글
   신고: "쏴서 맞추면 소리가 안 난다"
   실제: 소리가 꺼져 있었다. 버튼이 ♫/♪ 음표 한 글자와 ON/OFF 로만 달라서
        '지금 상태'인지 '누르면 될 일'인지 구분이 안 됐다.
        게다가 낭독(TTS)은 sfxOn 과 무관하게 계속 나오므로 «게임은 말하는데
        총소리만 없는» 상태가 되어 더 헷갈린다.
   ═══════════════════════════════════════════════════════════════ */
console.log('\n① 우주 괴물 사냥 — 소리 토글이 «꺼짐»을 분명히 보여 주는가');

check('① 효과음은 sfxOn 하나로만 잠근다 (tone/noise 둘 다 검사)',
  /function\s+tone\([^)]*\)\s*\{[\s\S]{0,120}!sfxOn/.test(SM) &&
  /function\s+noise\([^)]*\)\s*\{[\s\S]{0,120}!sfxOn/.test(SM));

// 라벨을 만드는 곳이 한 군데여야 초기 HTML 과 토글 결과가 어긋나지 않는다
check('② 라벨을 그리는 함수가 하나로 모여 있다 (renderSfxBtn)',
  /function\s+renderSfxBtn\s*\(/.test(SM));
check('③ 첫 화면에서도 그 함수를 부른다 (HTML 하드코딩과 어긋나지 않게)',
  /renderSfxBtn\(\);/.test(SM));

const offBranch = (SM.match(/sfxBtn\.innerHTML\s*=\s*sfxOn\s*\?\s*'([^']*)'\s*:\s*'([^']*)'/) || []);
const labelOn = offBranch[1] || '', labelOff = offBranch[2] || '';
check('④ 켜짐/꺼짐 라벨이 둘 다 있다', !!labelOn && !!labelOff);
// 🔑 예전 실패 지점: OFF 라벨이 'OFF' 라는 영문 세 글자뿐이라 «누르면 꺼진다»로 읽혔다
check('⑤ 꺼짐 라벨에 «꺼짐» 이 한글로 적혀 있다 (ON/OFF 만으로는 방향을 알 수 없다)',
  /꺼짐/.test(labelOff));
check('⑥ 아이콘도 서로 다르다 — 켜짐 🔊(1F50A) / 꺼짐 🔇(1F507)',
  /128266|1F50A/i.test(labelOn) && /128263|1F507/i.test(labelOff));
// Win10 두부 방지 — 이 저장소 규칙: 이모지는 Unicode 13 미만만
check('⑦ 쓰인 이모지가 Win10 안전 범위 (🔊·🔇 = Unicode 6.0)',
  !/12855[6-9]|1285[6-9][0-9]|129[0-9]{3}/.test(labelOn + labelOff));

check('⑧ 꺼짐일 때 클래스 off 가 붙는다',
  /classList\.toggle\('off',\s*!sfxOn\)/.test(SM));
check('⑨ #sfxBtn.off 를 붉게 칠하는 CSS 가 실제로 있다',
  /#sfxBtn\.off\s*\{[^}]*239,\s*68,\s*68/.test(SM));

/* 라벨이 길면 좁은 폰 상단바가 가로로 넘쳐 화면이 밀린다(실측: 360px 화면에서 424px).
   HTML 엔티티(&#128266;)는 1글자로 세어야 실제 렌더 길이에 가깝다. */
const visLen = (s) => s.replace(/&#\d+;/g, 'x').replace(/&[a-z]+;/gi, 'x').length;
check(`⑩ 꺼짐 라벨이 상단바를 넘치지 않을 길이 (${visLen(labelOff)}자 ≤ 12)`, visLen(labelOff) <= 12);

/* ═══════════════════════════════════════════════════════════════
   ② P-38 — 발사 버튼이 조종간을 따라간다
   신고: "발사가 안돼"
   실제: 보이는 빨간 버튼은 조종간과 함께 최대 ±30px 움직이는데,
        누르는 자리(투명 버튼)는 layoutCockpit() 이 잡아 준 자리에 붙박이였다.
   ═══════════════════════════════════════════════════════════════ */
console.log('\n② P-38 — 보이는 빨간 버튼과 «실제 눌리는 자리»가 같은가');

check('⑪ 조종간은 여전히 --ykY 로 상하 이동한다(전제)',
  /--ykY',\s*\(uy\*30\)/.test(P38));
check('⑫ 같은 루프에서 발사 버튼도 함께 움직인다',
  /_hubEl[\s\S]{0,260}style\.transform\s*=\s*'translateY\(/.test(P38));
check('⑬ 그 이동량에 조종간과 «같은» uy*30 항이 들어 있다',
  /var\s+dy\s*=\s*uy\*30\s*\+/.test(P38));
check('⑭ 확대 기준점(50% 40%) 과 허브(47%) 차이 보정항도 있다',
  /0\.07\s*\*\s*\(_yokeH/.test(P38));
check('⑮ _yokeH 를 layoutCockpit 이 실제로 채운다',
  /_yokeH\s*=\s*yh;/.test(P38));

/* 🔬 실제 식을 소스에서 떼어 그대로 돌린다 — 여기에 숫자를 다시 적으면 가짜 검사가 된다 */
const dyExpr = (P38.match(/var\s+dy\s*=\s*(uy\*30\s*\+[^;]+);/) || [])[1];
check('⑯ 이동량 식을 소스에서 떼어낼 수 있다', !!dyExpr);
if (dyExpr) {
  const dyFn = new Function('uy', 'ykS', '_yokeH', '_yokeEl', 'return ' + dyExpr + ';');
  const YH = 162;                                   // 360x800 실측 조종간 높이
  const worst = [-1, -0.5, 0.5, 1].map(uy => {
    const ykS = 1 - uy * 0.055;                     // 소스와 같은 배율식(#ykS)
    const yokeVisual = uy * 30 + 0.07 * YH * (ykS - 1);   // 보이는 허브가 실제로 가는 곳
    return Math.abs(yokeVisual - dyFn(uy, ykS, YH, null));
  });
  const gap = Math.max(...worst);
  check(`⑰ 어떤 조작에서도 보이는 버튼과 눌리는 자리가 겹친다 (최대 어긋남 ${gap.toFixed(2)}px < 1px)`, gap < 1);
}

const hubMin = Number((P38.match(/var\s+hs\s*=\s*Math\.max\((\d+),/) || [])[1] || 0);
check(`⑱ 움직이는 표적이므로 최소 크기를 키웠다 (${hubMin}px ≥ 88)`, hubMin >= 88);

/* ═══════════════════════════════════════════════════════════════
   ③ P-38 — 캐노피 프레임 두께
   신고: "캐노피 프레임이 너무 두꺼워"
   실제: 사진이 화면 «맨 아래»까지 닿게 강제(minK)해 세로 폰 배율이 3.13배였다.
        아래는 계기판 사진이 덮으므로 거기까지만 내려오면 된다.
   ═══════════════════════════════════════════════════════════════ */
console.log('\n③ P-38 — 세로 폰 캐노피 배율 (프레임 두께는 배율에 정비례)');

const AR  = Number((P38.match(/var\s+CP_AR\s*=\s*([\d.]+)/) || [])[1]);
const FY  = Number((P38.match(/CP_FY\s*=\s*([\d.]+)/) || [])[1]);
const COV = Number((P38.match(/var\s+CP_COVER\s*=\s*([\d.]+)/) || [])[1]);
check('⑲ CP_COVER 가 선언돼 있다', Number.isFinite(COV));
check('⑳ 화면 맨 아래(1.0)까지 강제하지 않는다 — 되돌리면 두께 문제가 그대로 돌아온다',
  COV > 0.5 && COV < 1.0);

const minKExpr = (P38.match(/var\s+minK\s*=\s*(\(\(CP_COVER[^;]+);/) || [])[1];
check('㉑ minK 식을 소스에서 떼어낼 수 있다', !!minKExpr);
if (minKExpr && AR && FY && COV) {
  const minKFn = new Function('CP_COVER', 'CP_FY', 'CP_AR', 'H', 'W', 'return ' + minKExpr + ';');
  const kOf = (W, H) => {
    const a = W / H;
    let k = (a >= 1.9) ? 1.16 : (a < 1.0 ? 1.62 : 1.34);
    const mk = minKFn(COV, FY, AR, H, W);
    if (k < mk) k = mk;
    if (k < 1) k = 1;
    return k;
  };
  const oldK = (W, H) => {                            // 고치기 전 식 — 실패 재현용
    const a = W / H;
    let k = (a >= 1.9) ? 1.16 : (a < 1.0 ? 1.62 : 1.34);
    const mk = (0.5 / (1 - FY)) * (H / W) * AR;
    if (k < mk) k = mk;
    return k < 1 ? 1 : k;
  };
  const phone = kOf(360, 800);
  check(`㉒ 세로 폰(360x800) 배율이 얇아졌다 (${oldK(360, 800).toFixed(2)} → ${phone.toFixed(2)})`,
    phone < oldK(360, 800) * 0.8);
  // 사진 아래끝이 계기판 윗선(0.674H)보다 아래여야 캐노피와 계기판 사이가 안 벌어진다
  const bot = (W, H) => { const ih = kOf(W, H) * W / AR; return (0.5 * H - FY * ih + ih) / H; };
  check(`㉓ 사진 아래끝이 계기판 윗선(0.674)보다 아래다 (${bot(360, 800).toFixed(3)})`, bot(360, 800) > 0.674);
  check('㉔ 가로 화면(PC·태블릿 가로)은 예전 그대로다',
    Math.abs(kOf(1280, 800) - oldK(1280, 800)) < 1e-9 &&
    Math.abs(kOf(2400, 1080) - oldK(2400, 1080)) < 1e-9);
}

/* 배율을 낮추면 코밍 선(0.585)도 같이 올라와 계기판이 커진다 — 하늘이 도로 좁아진다.
   세로 화면의 계기판 자리는 예전 값(0.674H)으로 고정해야 이득이 유지된다. */
check('㉕ 세로 화면 계기판 윗선을 0.674H 로 고정한다',
  /if\(a\s*<\s*1\.0\)\s*dashTop\s*=\s*H\*0\.674;/.test(P38));

/* 발사 자체가 막히는 다른 경로가 남아 있지 않은지 — 최소 확인 */
console.log('\n④ 발사 경로 자체');
check('㉖ 발사 버튼은 pointer-events 가 살아 있다(조종석 오버레이는 전부 none)',
  /#hubFire\{[^}]*z-index:9/.test(P38) && !/#hubFire\{[^}]*pointer-events:\s*none/.test(P38));
check('㉗ 폰에서 발사 버튼이 보인다', /body\.mob\s+#hubFire\{display:block\}/.test(P38));
check('㉘ 안내문이 빨간 버튼 = 발사라고 알려 준다', /빨간 버튼 = 발사/.test(P38));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
