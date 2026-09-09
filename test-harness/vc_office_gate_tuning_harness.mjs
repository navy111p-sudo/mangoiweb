/* vc_office_gate_tuning_harness.mjs — 사무실 모드 노이즈 게이트의 «값끼리 앞뒤가 맞는가» (2026-09-09)
 *
 * 왜 필요한가
 *   이 값들(js/idx-vc-officemode.js 의 OPEN_DB·HYST_DB·DUCK…)은 «사무실에서 들어 보고» 정하는
 *   숫자라 앞으로도 계속 손대게 된다. 2026-09-08 첫 판(12 / -22dB) → 2026-09-09 사장님
 *   「옆자리 목소리가 아직 조금 들려. 문턱 좀 더 세게」로 16 / -30dB 이 됐다.
 *   그런데 이 값들은 «한 벌» 이라, 하나만 움직이면 **에러 없이 기능이 통째로 무의미해지거나**
 *   **교사 목소리가 잘리는** 두 방향으로 조용히 무너진다.
 *
 * ⛔ «숫자» 를 못 박지 않는다 — 그러면 다음에 정당하게 조정할 때 멀쩡한 수리가 빨간불이 된다
 *    (CLAUDE.md 「숫자를 정규식으로 못 박으면 그 숫자를 바로잡는 순간 FAIL」).
 *    대신 **«근거»**(값끼리의 관계)를 본다. 사람이 12↔16 사이를 오가는 것은 여기서 자유롭다.
 *
 * 무엇을 잡나
 *   ① DUCK 이 0  → 게이트가 «완전 무음». 교사가 조용히 말하면 첫 음절이 통째로 사라진다.
 *   ② HYST_DB >= OPEN_DB → «닫는 문턱» 이 학습된 바닥 아래로 내려가 게이트가 **영영 안 닫힌다**.
 *      = 스위치는 켜져 있는데 아무 일도 안 하는 상태. 화면·로그 어디에도 표시가 없다.
 *   ③ ATTACK >= RELEASE → 열기가 닫기보다 느려져 말 첫머리가 잘린다.
 *   ④ HOLD_MS < TICK_MS → 홀드가 한 틱도 못 버텨 뜻이 없다(말 사이 공백마다 딸꾹거린다).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'public', 'js', 'idx-vc-officemode.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ 사무실 모드 게이트 — 값끼리 앞뒤가 맞는가');

let src = '';
try { src = readFileSync(SRC, 'utf8'); } catch (e) { src = ''; }
ok(!!src, '정본 js/idx-vc-officemode.js 를 읽었다', '못 읽으면 아래 검사가 통째로 헛돕니다');

/* 🔑 판정은 «위치» 로 한다 — 파일 전체에서 문자열을 찾으면 무관한 옛 주석이 대신 걸려
      검사가 조용히 헛돈다(2026-09-09 함정 대조가 아래 ⑪번에서 실제로 그 상태를 잡았습니다).
      그래서 «상수 블록»(바로 앞 주석 ~ var TICK_MS 줄까지)만 오려 내 그 안에서만 본다. */
const ai = src.indexOf('var ATTACK');
const ci = ai > 0 ? src.lastIndexOf('/*', ai) : -1;
const tvar = src.indexOf('var TICK_MS');
const ti = tvar > 0 ? src.indexOf('\n', tvar) : -1;
const BLOCK = (ai > 0 && ti > ai) ? src.slice(ci >= 0 && ci < ai ? ci : ai, ti) : '';

/* 값은 그 블록 «안의 선언 자리» 로 읽는다 — 이름만 어딘가에 나오는 것으로 세면 주석·설명에 걸린다. */
function num(name) {
  const m = new RegExp('var\\s+' + name + '\\s*=\\s*(-?[0-9]*\\.?[0-9]+)\\s*;').exec(BLOCK);
  return m ? Number(m[1]) : NaN;
}
const V = {};
for (const k of ['ATTACK', 'RELEASE', 'HOLD_MS', 'DUCK', 'OPEN_DB', 'HYST_DB', 'ABS_DB', 'TICK_MS']) V[k] = num(k);

/* 전제 — 블록을 «제대로» 오려 냈는가. 너무 크면 파일 절반을 삼킨 것이라 위치 판정이 뜻을 잃는다. */
ok(BLOCK.length > 0 && BLOCK.length < 3000 && BLOCK.includes('var TICK_MS'),
  '전제: 상수 블록을 오려 냈다 (' + BLOCK.length + '자)',
  '못 오려 냈거나 너무 크면 아래 «위치» 판정이 통째로 헛돕니다');

/* 전제 — 여덟 값을 «실제로» 읽어 냈는가. 이걸 안 박아 두면 정규식이 어긋난 날
   아래 비교가 전부 NaN 이 되어 조용히 통과합니다(NaN 비교는 언제나 false). */
const missing = Object.keys(V).filter((k) => !Number.isFinite(V[k]));
ok(missing.length === 0, '전제: 값 여덟 개를 선언 자리에서 읽어 냈다', missing.length ? '못 읽음: ' + missing.join(', ') : '');

if (missing.length === 0) {
  console.log('     · 지금 값 — ' + Object.keys(V).map((k) => k + '=' + V[k]).join(' · '));

  ok(V.DUCK > 0,
    'DUCK > 0 — 게이트가 닫혀도 «완전 무음» 이 아니다',
    '0 이면 교사가 조용히 말할 때 첫 음절이 통째로 사라진다 — 고치려던 것보다 나쁘다');
  ok(V.DUCK < 1,
    'DUCK < 1 — 닫혔을 때 실제로 줄어든다',
    '1 이면 닫아도 그대로 나가 기능이 아무 일도 안 한다');

  ok(V.OPEN_DB > V.HYST_DB,
    'OPEN_DB > HYST_DB — «닫는 문턱» 이 학습된 바닥보다 위에 남는다',
    `지금 ${V.OPEN_DB} vs ${V.HYST_DB}. 뒤집히면 닫는 문턱(바닥+OPEN_DB-HYST_DB)이 바닥 아래라 `
    + '게이트가 영영 안 닫힌다 — 스위치는 켜져 있는데 아무 일도 안 하는 상태가 되고 에러도 안 난다');

  ok(V.ATTACK < V.RELEASE,
    'ATTACK < RELEASE — 열기는 빨리, 닫기는 느리게',
    '뒤집히면 말 첫머리가 잘리고 말 사이 공백마다 딸꾹거린다');

  ok(V.HOLD_MS >= V.TICK_MS,
    'HOLD_MS >= TICK_MS — 홀드가 최소 한 틱은 버틴다',
    `지금 ${V.HOLD_MS}ms vs 틱 ${V.TICK_MS}ms. 짧으면 홀드가 뜻이 없다`);

  ok(V.ABS_DB < 0,
    'ABS_DB 는 음수(dBFS) — 문턱 절대 하한이 뜻을 가진다');

  /* 범위 — «오타» 만 잡는 넓은 그물이다(사람의 조정은 이 안에서 자유롭다).
     아래로 너무 낮으면 아무 소리에나 열려 기능이 없고, 위로 너무 높으면 책상 마이크로는
     닿을 수 없어 교사 목소리가 통째로 잘린다. */
  ok(V.OPEN_DB >= 4 && V.OPEN_DB <= 24,
    'OPEN_DB 가 4~24dB 안에 있다 — 오타 방어',
    `지금 ${V.OPEN_DB}. 4 아래면 아무 소리에나 열려 기능이 없고, 24 위면 `
    + '책상 마이크(입에서 30~50cm)로는 닿기 어려워 교사 목소리가 잘린다');

  ok(V.DUCK >= 0.005 && V.DUCK <= 0.3,
    'DUCK 가 0.005~0.3(-46~-10dB) 안에 있다 — 오타 방어',
    `지금 ${V.DUCK}`);
}

/* 「너무 세다」를 어떻게 알아보는지가 «상수 옆에» 적혀 있는가 — 이 값들은 사람이 귀로 정하는 것이라
   «증상과 되돌리는 값» 이 코드 옆에 없으면 다음 사람이 무엇을 되돌릴지 모른다.
   🔴 처음에 이것을 «파일 전체» 에서 찾게 썼다가 함정 대조에 잡혔습니다 — 무관한 옛 주석
      (「…으로 되돌린다」·「체인이 끊긴다」)이 대신 걸려 **안내 블록을 통째로 지워도 통과**했습니다.
      검사 이름은 «상수 옆에» 인데 판정은 파일 전체였던 것입니다. 지금은 BLOCK 안에서만 봅니다. */
ok(/되돌리세요|되돌리면|되돌린다/.test(BLOCK) && /끊긴다|잘린다/.test(BLOCK),
  '「너무 세면 어떤 증상이고 무엇을 되돌리는지」가 «상수 블록 안» 에 적혀 있다',
  '귀로 정하는 값이라 그 두 줄이 없으면 다음 사람이 되돌릴 수 없다');

/* 되돌릴 «값» 까지 적혀 있는가 — 「되돌리세요」만 있고 숫자가 없으면 다음 사람이 무엇으로 되돌릴지 모른다. */
ok(/OPEN_DB\s*를?\s*1?[0-9]/.test(BLOCK) || /12/.test(BLOCK),
  '되돌릴 «값»(첫 판 숫자)이 상수 블록 안에 함께 적혀 있다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
