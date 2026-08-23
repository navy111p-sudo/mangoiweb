// game_quest_unlock_harness.mjs — 학생 게임 허브의 단계별 해금(Lock/Unlock) 로직 (2026-08-13)
//
//   원장님 제안(의정부 미보영, 2026-08-13): 21개 게임을 한 번에 열어 두니 아이가
//   한 게임에 3분도 못 머물고 탐색만 반복한다 → 처음엔 2개만 열고 하나씩 해금.
//
//   이 하니스가 지키는 것 — 잘못되면 서비스가 조용히 망가지는 지점들:
//     ① 기존 학생 29,000명이 잠기지 않는다 (코인·순서·기록이 있으면 전체 개방)
//     ② 같은 게임을 반복해서 깨는 것으로 21개를 다 열 수 없다
//        (해금은 «서로 다른 게임을 몇 개 깼는가»로 센다 — 이게 깨지면 해금이 무의미해진다)
//     ③ 학생이 스스로 퀘스트 모드를 켜고 끌 수 있다
//
//   허브 원문(student-games.html)에서 해금 블록을 **그대로 오려내** 실행한다.
//   따로 베낀 사본을 검사하면 원문이 바뀌어도 초록불이 유지된다.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

const html = readFileSync(join(PUB, 'student-games.html'), 'utf8');
const s = html.indexOf("var QUEST_KEY = 'mangoi_quest_mode';");
const e = html.indexOf('\nfunction hubRenderMenu(', s);

if (s < 0 || e < 0) {
  check('해금 블록 추출', false, '표지(QUEST_KEY / hubRenderMenu)를 못 찾음');
} else {
  const block = html.slice(s, e);
  // 21개짜리 가짜 게임 목록 — 실제 카드 구성이 바뀌어도 로직만 본다
  const HUB_GAMES = Array.from({ length: 21 }, (_, i) => ({ mode: 'g' + i, ico: '🎮', ttl: '게임' + i + ' (Game)' }));

  function makeCtx(coins) {
    const store = {};
    const ctx = {
      HUB_GAMES, ORDER_KEY: 'mangoi_game_order',
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
      _coinsEarned: () => coins,
      document: {
        getElementById: () => null,
        createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        body: { appendChild() {} },
      },
      setTimeout: () => 0, clearTimeout: () => {}, console,
      hubRenderMenu: () => {},
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(block, ctx);
    return ctx;
  }

  console.log('\n▶ 신규 학생 — 처음엔 2개만 열린다');
  const A = makeCtx(0);
  check('퀘스트 모드가 기본 ON', A._questMode === true);
  check('처음 열린 게임 2개', A._unlockedCount() === 2, String(A._unlockedCount()));
  check('첫 게임은 열려 있음', A._isUnlocked('g0') === true);
  check('세 번째 게임은 잠김', A._isUnlocked('g2') === false);

  console.log('\n▶ 게임을 깨면 다음 게임이 하나 열린다');
  A._questClear('g0');
  check('클리어 1개 → 3개 열림', A._unlockedCount() === 3, String(A._unlockedCount()));
  check('세 번째 게임이 열림', A._isUnlocked('g2') === true);

  console.log('\n▶ 같은 게임을 반복해서 깨도 더 열리지 않는다');
  /* 🔴 여기가 핵심이다. 클리어 **횟수**로 세면 한 게임만 스무 번 깨서 21개를 다 열 수 있다.
     그러면 "선택의 패러독스를 없앤다"는 제안의 목적이 통째로 사라진다. */
  for (let i = 0; i < 10; i++) A._questClear('g0');
  check('같은 게임 10번 더 깨도 3개 그대로', A._unlockedCount() === 3, String(A._unlockedCount()));

  console.log('\n▶ 서로 다른 게임을 깨야 연쇄 해금된다');
  A._questClear('g1');
  check('다른 게임 클리어 → 4개', A._unlockedCount() === 4, String(A._unlockedCount()));
  for (let i = 2; i < 19; i++) A._questClear('g' + i);
  check('서로 다른 19개 클리어 → 21개 전부', A._unlockedCount() === 21, String(A._unlockedCount()));
  A._questClear('g19');
  check('전부 열린 뒤에도 상한을 넘지 않음', A._unlockedCount() === 21, String(A._unlockedCount()));

  console.log('\n▶ 기존 학생(코인 보유) — 절대 잠기면 안 된다');
  /* 🔴 실서비스 학생 29,000명이 이미 전 게임을 쓰고 있다.
     새 기능이 이들을 2개로 잠그면 그 자체가 장애다. */
  const B = makeCtx(1200);
  check('기존 학생은 퀘스트 모드 OFF', B._questMode === false);
  check('모든 게임이 열려 있음', B._isUnlocked('g20') === true);

  console.log('\n▶ 학생이 스스로 켜고 끌 수 있다');
  B.toggleQuestMode();
  check('켜면 ON 이 되고', B._questMode === true);
  check('열린 게임이 2개로 좁혀진다', B._unlockedCount() === 2, String(B._unlockedCount()));
  B.toggleQuestMode();
  check('다시 끄면 전체 개방', B._isUnlocked('g20') === true);

  /* ══════════════════════════════════════════════════════════════
     🎫 두 번째 해금 경로 — 레벨테스트 통과 (2026-08-22 사장님 지시)
     "3번째 게임부터: 이전 게임 클리어 **또는** 레벨테스트 통과 중 하나로 해제"
     ══════════════════════════════════════════════════════════════ */
  console.log('\n▶ 몇 개를 더 깨야 하는지 정확히 센다');
  const C = makeCtx(0);
  check('세 번째 게임은 1개 더', C._needToUnlock('g2') === 1, String(C._needToUnlock('g2')));
  check('여섯 번째 게임은 4개 더', C._needToUnlock('g5') === 4, String(C._needToUnlock('g5')));
  check('이미 열린 게임은 0', C._needToUnlock('g0') === 0, String(C._needToUnlock('g0')));

  console.log('\n▶ 레벨테스트를 통과하면 순서 없이 전부 열린다');
  check('통과 전에는 잠겨 있음', C._isUnlocked('g20') === false);
  C._setLeveltestPass(true);
  check('통과하면 21개 전부', C._unlockedCount() === 21, String(C._unlockedCount()));
  check('마지막 게임도 열림', C._isUnlocked('g20') === true);
  check('더 깰 게임 수는 0', C._needToUnlock('g20') === 0, String(C._needToUnlock('g20')));
  check('퀘스트 모드 자체는 켜진 채다', C._questMode === true);

  console.log('\n▶ 서버 응답 한 벌로 판정이 전달된다');
  const D = makeCtx(0);
  D._questApplyServer({ ok: true, leveltest_passed: true, attempts: 0 });
  check('leveltest_passed:true → 전체 개방', D._isUnlocked('g20') === true);
  /* 🔴 되돌릴 수 있어야 한다. 레벨테스트 기록은 관리자가 정정할 수 있고,
     한 번 켜면 못 끄게 만들면 그 정정이 학생 화면에 영영 반영되지 않는다. */
  D._questApplyServer({ ok: true, leveltest_passed: false, attempts: 0 });
  check('leveltest_passed:false → 다시 순차 잠금', D._isUnlocked('g20') === false);
  check('기억(localStorage)도 지워진다', D._leveltestPassed() === false);

  console.log('\n▶ 레벨테스트가 «기존 학생 개방» 판정을 대신하지 않는다');
  /* leveltest_passed 는 잠금만 «면제»한다. 기존 학생 판정(attempts>=20)은 그대로 따로 돈다. */
  const E = makeCtx(0);
  E._questApplyServer({ ok: true, leveltest_passed: true, attempts: 0 });
  check('퀘스트 모드는 여전히 ON', E._questMode === true);
}

/* ══════════════════════════════════════════════════════════════════
   🖼 화면 — 「미리보기 + 순차 잠금」 (2026-08-22)
   문자열 검사다. 「이 구조로 그리는가」만 본다 — 좌표는 사람이 브라우저로 확인한다.
   ══════════════════════════════════════════════════════════════════ */
console.log('\n▶ 잠긴 카드는 «미리보기가 열리는 카드» 다');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const code = strip(html);
/* 👀 미리보기 창은 **별도 파일**이다 — student-games.html 의 첫 화면 무게 예산에 여유가
   1KB 도 없어 defer 로 뺐다(first_paint_budget_harness). 그래서 여기서 함께 읽는다.
   ⛔ 이 파일을 다시 HTML 안으로 되돌리면 예산이 즉시 넘친다. */
const pvSrc = readFileSync(join(PUB, 'js/game-preview.js'), 'utf8');
const pv = strip(pvSrc);

check('허브가 미리보기 모듈을 defer 로 부른다',
  /<script src="\/js\/game-preview\.js\?v=\d+" defer><\/script>/.test(html));
check('잠긴 카드를 누르면 미리보기가 열린다',
  /!_isUnlocked\(mode\)\)\{[\s\S]{0,200}window\.hubPreviewGame\(mode\);\s*return;/.test(code));
/* 느린 회선에서 defer 파일이 아직 안 왔을 때 «아무 반응 없음» 이 되면 학생에겐 고장으로 보인다 */
check('모듈이 아직 안 왔으면 토스트로 폴백한다',
  /typeof window\.hubPreviewGame === 'function'/.test(code) && /_toastHub\('🔒 게임 '/.test(code));
check('미리보기 함수가 있다', /function hubPreviewGame\(/.test(pv));
check('레벨테스트로 바로 열기 경로가 있다', /function hubGoLeveltest\(/.test(pv));
check('레벨테스트 주소는 홈 모달(/?menu=leveltest)', /'\/\?menu=leveltest'/.test(pv),
  '옛 /level-test.html 은 2026-08-07 폐지');
/* 🔴 HUB_GAMES 는 const 다 — window 에 «저절로» 안 올라간다(CLAUDE.md 2장).
   허브가 이 한 줄을 내보내지 않으면 미리보기의 「지금 열린 게임부터 하기」가 조용히 사라진다. */
check('허브가 HUB_GAMES 를 window 로 내보낸다', /window\.HUB_GAMES = HUB_GAMES;/.test(code));
check('미리보기는 window.HUB_GAMES 로 읽는다', /window\.HUB_GAMES/.test(pv));
/* 미리보기는 «보여만 주는» 화면이다 — 여기서 실제 게임이 시작되면 잠금이 무의미해진다.
   hubOpenGame 호출은 «열린 게임으로 가는» 버튼 하나뿐이고, 그 인자는 _nextPlayable() 이 고른다. */
check('미리보기가 잠긴 그 게임을 바로 실행하지 않는다',
  !/hubOpenGame\(\\'\s*\+\s*mode/.test(pv) && !/hubOpenGame\(mode\)/.test(pv));

/* 🔴 자물쇠가 글자를 가리면 안 된다 — 사장님 지시의 핵심.
   카드 한가운데를 덮던 .lockveil 은 제거했다. 되살아나면 제목·설명이 다시 가려진다. */
check('카드 한가운데를 덮는 .lockveil 이 없다', !/lockveil/.test(code) && !/lockveil/.test(pv));
check('자물쇠는 사진 위 칩(.lockchip)', /class="lockchip"/.test(code));
check('해금 조건은 설명 아래 제 줄(.locknote)', /class="locknote"/.test(code));
/* .locknote 는 .body 안(제목·설명과 형제)이라 겹칠 수 없다. 순서까지 못 박는다. */
check('.locknote 는 설명(.dsc) 바로 뒤에 온다',
  /class="dsc">'\+g\.dsc\+'<\/span>'[\s\S]{0,120}class="locknote"/.test(code));
check('사진을 회색으로 죽이지 않는다', !/grayscale\(\.85\)/.test(html),
  '미리보기가 목적인데 무슨 게임인지 안 보이면 기대감이 안 생긴다');

console.log('\n▶ 미리보기 미디어 표에 «없는 파일» 이 없다');
/* 없는 파일을 적으면 미리보기를 열 때마다 404 가 난다(전체메뉴 아이콘에서 이미 밟은 함정). */
{
  const m = pvSrc.match(/var GAME_PREVIEW = \{([\s\S]*?)\n  \};/);
  const bodyTxt = m ? strip(m[1]) : '';
  const paths = (bodyTxt.match(/'(\/(?:img|video)\/[^']+)'/g) || []).map((x) => x.slice(1, -1));
  const missing = paths.filter((f) => !existsSync(join(PUB, f.replace(/^\//, '').split('?')[0])));
  check('표에 적힌 미디어가 전부 실재한다 (' + paths.length + '개)', missing.length === 0, missing.join(', '));
}

console.log('\n▶ 서버는 «결과 확정» 만 통과로 센다');
{
  const idx = readFileSync(join(__dir, '../cloudflare-deploy/src/index.ts'), 'utf8');
  const q = idx.slice(Math.max(0, idx.indexOf('FROM leveltest_applications')) - 400,
                      idx.indexOf('FROM leveltest_applications') + 500);
  check('recommend 응답이 leveltest_passed 를 실어 보낸다', /leveltest_passed:/.test(idx));
  check('final_level 이 채워진 신청만 통과', /final_level IS NOT NULL AND TRIM\(final_level\) <> ''/.test(q));
  /* ⛔ 'confirmed'(일정만 잡힘)를 통과로 세면 «신청만 하고 안 본» 학생까지 전부 열린다.
     그러면 「레벨테스트로 바로 열기」가 사실상 «잠금 해제 버튼» 이 된다. */
  check("일정만 잡힌 'confirmed' 는 통과가 아니다", !/status = 'confirmed'/.test(q));
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
