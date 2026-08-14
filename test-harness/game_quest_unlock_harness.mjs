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

import { readFileSync } from 'node:fs';
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
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
