// 🪙 게임 허브 결과 화면 — 이번 판 코인 + «오늘 게임으로 받은 망고 포인트» (2026-11-03)
//   js/game-hub-points.js 를 가짜 창에서 «실제로 실행» 해 감싸기·세기·문구를 확인합니다.
//   HUB_PTS_SRC=<변형 사본> 으로 변이시험을 돌릴 수 있습니다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const SRC = process.env.HUB_PTS_SRC || 'cloudflare-deploy/public/js/game-hub-points.js';
const HTML = readFileSync('cloudflare-deploy/public/student-games.html', 'utf8');
const code = readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('❌ FAIL', m); } };

// ① 감싸는 이름이 원본에 «함수 선언» 으로 실재하는가 (이름이 바뀌면 조용히 헛돕니다)
for (const n of ['gameInit', '_addCoins', '_gameShowResult', '_gameOver'])
  ok(new RegExp('^function ' + n + '\\(', 'm').test(HTML), '원본에 function ' + n + ' 가 있다');
ok(/const _gameState = \{[^}]*started:/.test(HTML), '원본 _gameState 에 started 칸이 있다');
ok(/<script defer src="\/js\/game-hub-points\.js\?v=\d+"><\/script>/.test(HTML), 'student-games.html 이 defer 로 싣는다');

function run(lang) {
  const calls = { init: 0, add: [], show: 0, over: 0 };
  const win = {
    gameInit() { calls.init++; }, _addCoins(n) { calls.add.push(n); },
    _gameShowResult() { calls.show++; }, _gameOver() { calls.over++; },
    MangoiGameVocab: { getUserId: () => '' },
  };
  const ctx = { window: win, document: { documentElement: { getAttribute: () => lang || 'ko' }, getElementById: () => null },
    _gameState: { started: false }, localStorage: { getItem: () => '' }, fetch: () => Promise.reject(new Error('x')) };
  vm.createContext(ctx);
  try { vm.runInContext(code, ctx, { timeout: 2000 }); } catch (e) { ok(false, '실행 실패: ' + e.message); }
  return { win, calls, ctx };
}

const { win, calls, ctx } = run('ko');
const api0 = win.__mgHubPts;
// 변이가 던져도 «깔끔한 FAIL» 이 되게 감쌉니다
const api = api0 && { round: api0.round,
  mangoLine: (...a) => { try { return api0.mangoLine(...a); } catch (e) { return { cls: 'THREW', ko: '', en: '' }; } },
  coinLine: (...a) => { try { return api0.coinLine(...a); } catch (e) { return { ko: '', en: '' }; } } };
ok(!!api && typeof api.mangoLine === 'function', '정본 함수를 내보낸다');
if (api) {
  // ② 코인 세기 — 판 안에서만, 새 판이면 0
  win.gameInit(); ctx._gameState.started = true;
  win._addCoins(3); win._addCoins(15);
  ok(api.round() === 18, '판 안 코인은 더한다(18)');
  ctx._gameState.started = false; win._addCoins(50);
  ok(api.round() === 18, '판 밖(룰렛 등) 코인은 안 센다');
  win._addCoins(-5); ok(api.round() === 18, '음수는 안 센다');
  ok(calls.add.length === 4 && calls.init === 1, '원래 함수는 그대로 불린다');
  win.gameInit(); ok(api.round() === 0, '새 판이면 0 부터');
  win._gameShowResult(); win._gameOver();
  ok(calls.show === 1 && calls.over === 1, '결과 함수도 원래 것이 불린다(화면 없음에도 안 던짐)');

  // ③ 망고 포인트 줄 — 지어내지 않기
  const g = api.mangoLine({ ok: true, points_by_tool: { games: 15 } }, false, false);
  ok(g.cls === 'ok' && /\+15P/.test(g.ko) && /\+15P/.test(g.en), '서버가 준 게임 포인트를 그대로 보인다');
  const z = api.mangoLine({ ok: true, points_today: 20, points_by_tool: { write: 20 } }, false, false);
  ok(z.cls === 'muted' && !/\+\d/.test(z.ko), '게임 포인트가 없으면 «아직 없어요» (다른 활동 20P 를 가져오지 않음)');
  const nu = api.mangoLine({ ok: true, points_by_tool: null }, false, false);
  ok(nu.cls === 'warn', '서버가 null(조회 실패)이면 «확인 못 함» — 0 으로 지어내지 않음');
  ok(api.mangoLine(null, false, true).cls === 'warn', '통신 실패 = 확인 못 함');
  ok(api.mangoLine({ ok: false, points_by_tool: { games: 5 } }, false, false).cls === 'warn', 'ok:false 면 칸이 있어도 확인 못 함');
  ok(api.mangoLine({ error: 'Not Found' }, false, false).cls === 'warn', 'ok 칸 없는 404 본문 = 확인 못 함');
  ok(api.mangoLine({ ok: true, points_by_tool: { games: 15 } }, true, false).cls === 'muted', '비로그인이면 서버 값이 있어도 로그인 안내');
  ok(/구조선/.test(api.mangoLine({ ok: true, points_by_tool: {} }, false, false).ko), '어디서 받는지(구조선) 말한다');
  // ④ 코인 줄은 «망고 포인트와 다르다» 고 말한다
  const c = api.coinLine(7);
  ok(/\+7/.test(c.ko) && /망고 포인트와 달라요/.test(c.ko) && /not Mangoi points/.test(c.en), '코인 줄: +7 · 망고 포인트 아님');
  ok(!/\+/.test(api.coinLine(0).ko), '코인 0 이면 +0 을 쓰지 않는다');
}

// ⑤ 원본이 없으면(이름이 바뀜) 아무것도 안 덮는다
{
  const win2 = { gameInit() {}, _addCoins() {} };
  const ctx2 = { window: win2, document: {}, localStorage: {} };
  vm.createContext(ctx2); vm.runInContext(code, ctx2);
  ok(!win2.__mgHubPts, '결과 함수가 없으면 손대지 않는다');
}

console.log(`game_hub_points_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
