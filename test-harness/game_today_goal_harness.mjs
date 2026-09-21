/* ═══════════════════════════════════════════════════════════════════════════
   🎮 게임 «오늘 몫 N문제» 회귀 감시 (2026-09-21 신설 · C안)

   [왜 필요한가]
     사장님: 「게임을하면 내가 얼만큼 더해야하는지 얼마나 남았는지 시각적으로 보이면
              좋겠어요. 무작정 언제까지 해야 끝나는지 모르니 몇번하다가 나가게돼요.」

   🔴 [첫 번째 — «판» 으로 세면 목표를 둘 수 없다]
     2026-09-21 오전까지 `TOOL_GOALS.games.goal` 은 **null** 이었고 그 이유가 적혀 있었다 —
     「목표를 «3판» 으로 두면 **아무것도 안 하고 세 번 들락날락한 학생이 «달성»** 이 된다」.
     한 판의 중앙값이 40초다. 그 반론은 지금도 옳다.
     ✅ 그런데 **`items`(학습 항목)로 세면** 그 판은 0 이라 한 문제도 안 세어진다 —
        반론이 그 자리에서 사라진다. ⟹ 단위를 «판» → **«문제»** 로 바꿨다.
     ⛔ 「판 수」(`COUNT(*)`)로 되돌리지 말 것.

   🔴 [두 번째 — `game_sessions` 에는 «게임이 아닌 것» 이 섞여 있다]
     `game-track.js` 는 게임 14종만이 아니라 **학습 도구 7종**(warmup·speech-coach·vocab·
     judgment·micro-quiz·review-quiz·ai-write)에도 실린다. D1 실측(1,127행)에서 가장 많은
     `game` 값이 **`warmup` 403행**이었다. 그대로 세면 「발음 5문장」이 「게임 5문제」로
     **두 번 세어진다**(도구마다 자기 칸이 따로 있다).
     ✅ 빼는 목록은 `TOOLS` 표에서 **계산한다**(`TOOL_GAME_IDS`) — ⛔ 손으로 적지 말 것.

   🔴 [세 번째 — `finished` 는 «완주» 가 아니다]
     `MangoiGame.finish()` 를 부르는 게임이 저장소에 **0곳**(2026-09-21 grep 실측)이라
     실제 뜻은 «학습 항목이 있었나» 이고, D1 실측에서 게임 20종 전부
     `SUM(finished) == SUM(items>0)` 이었다. ⛔ 완주율로 쓰지 말 것.

   [검사 방법]
     문자열만 보지 않는다 — 정본을 esbuild 로 번들해 **실제로 돌리고**, SQL 은 **진짜
     SQLite** 에 실행하며, 화면 함수는 **오려 내 가짜 DOM 으로 돌려** «무슨 글자가 나오는가»
     를 본다. 「막는다」 옆에는 반드시 **「그래도 되는 것은 된다」 짝**을 둔다.

   ⚠️ [이 하니스가 «원리상» 못 보는 것 — 사람이 부르는 브라우저 검사가 맡는다]
      「그 줄이 실제로 몇 px 로 그려지는가」·「대비가 읽을 만한가」는 여기서 못 본다.
      실제로 그 검사가 **`display:none` 을 기본값으로 둔 사고**(세 폭 모두 칸 0px)를 잡았다.
      `test-harness/manual/game-today-goal-browser.mjs`(자동으로 안 돕니다 — 사람이 부릅니다).

   실행: node test-harness/game_today_goal_harness.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const SRC = join(CF, 'src');
const PUB = join(CF, 'public');

let PASS = 0, FAIL = 0, SKIPPED = 0;
const ok = (n) => { console.log('  ✅ ' + n); PASS++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w !== undefined ? '\n       ' + JSON.stringify(w) : '')); FAIL++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const gmSrc = read(join(SRC, 'game-mission.ts'));
const planSrc = read(join(SRC, 'today-plan.ts'));
const studentsSrc = read(join(SRC, 'api-students.ts'));
const hubSrc = read(join(PUB, 'student-games.html'));
const trackSrc = read(join(PUB, 'js', 'game-track.js'));

check('전제: 정본과 화면을 읽었다',
      gmSrc.length > 800 && hubSrc.length > 5000 && studentsSrc.length > 1000 && trackSrc.length > 500,
      { gm: gmSrc.length, hub: hubSrc.length, track: trackSrc.length });

/* ── 주석을 벗겨 낸 사본 — 부정 검사는 언제나 이것으로 판정한다. */
function strip(t) {
  let out = '', i = 0; const n = t.length;
  let inBlock = false, inLine = false, q = '';
  while (i < n) {
    const c = t[i], d = t[i + 1];
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}
function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) return '';
  const i = src.indexOf('{', m.index);
  if (i < 0) return '';
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(m.index, j + 1); }
  }
  return '';
}

/* ════════════════════════════════════════════════════════════════════
   ① 정본을 esbuild 로 번들해 «실제로» 돌린다
   ════════════════════════════════════════════════════════════════════ */
console.log('\n① 정본 game-mission.ts — 실제로 돌려 본다');
const ESB = join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild');
const tmp = mkdtempSync(join(tmpdir(), 'gamemission-'));
const outFile = join(tmp, 'gm.mjs');
let M = null;
try {
  const ARGS = [join(SRC, 'game-mission.ts'), '--bundle', '--format=esm', '--platform=neutral',
                `--outfile=${outFile}`, '--log-level=error'];
  if (process.platform === 'win32') execFileSync(process.execPath, [ESB, ...ARGS]);
  else execFileSync(ESB, ARGS);
  M = await import(pathToFileURL(outFile).href);
} catch (e) {
  /* ⛔ 조용히 건너뛰지 않는다 — esbuild 가 «있는데» 실패하면 그것은 코드 판정이다. */
  if (existsSync(ESB)) check('① 정본을 번들해 돌릴 수 있다(esbuild 는 있는데 실패 = 코드 판정)', false, String(e && e.message).slice(0, 300));
  else { SKIPPED = 22; console.log('  ⏭ esbuild 가 없어 ①~② 22건을 건너뜀 — «환경 사유»(node_modules 미설치)'); }
}

if (M) {
  check('정본이 내보내는 것들이 있다',
        typeof M.gameDailyGoal === 'function' && typeof M.gameItemsToday === 'function' &&
        typeof M.gameMissionState === 'function' && typeof M.gameIdFromUrl === 'function' &&
        Array.isArray(M.TOOL_GAME_IDS));

  const goal = M.gameDailyGoal();
  check('오늘 몫이 정해져 있다(TOOL_GOALS.games.goal)', goal >= 1, goal);
  /* 📜 2026-09-21 오전까지 null 이었다 — 되돌리면 화면이 목표를 «말하지 않게» 된다 */
  check('⛔ goal 을 null 로 되돌리지 않았다', goal !== 0 && goal != null, goal);
  /* 🔴 「그 숫자를 안 적었는가」만 물으면 `return 5;` 한 줄에 뚫린다(2026-09-21 함정 대조 실측 — 0건 FAIL).
     ✅ **표를 바꿔 넣어 답이 따라오는지** 본다 = 정말 TOOL_GOALS 를 읽는가. */
  check('그 숫자를 game-mission.ts 가 손으로 적지 않았다',
        !new RegExp('goal\\s*[:=]\\s*' + goal + '\\b').test(strip(gmSrc)), goal);
  {
    const gdBody = fnBody(gmSrc, 'gameDailyGoal');
    check('전제: gameDailyGoal 몸통을 잘라 냈다', gdBody.length > 20, gdBody.length);
    let ran = null, err = null;
    try {
      const f = new Function('TOOL_GOALS', gdBody.replace(/^[^{]*\{/, '').replace(/\}\s*$/, ''));
      ran = [f({ games: { goal: 9 } }), f({ games: { goal: 2 } }), f({ games: { goal: null } }), f({})];
    } catch (e) { err = String(e && e.message).slice(0, 120); }
    check('🔴 목표를 «표에서 읽는다» — 표를 바꾸면 답도 따라온다(하드코딩이 아니다)',
          !err && ran && ran[0] === 9 && ran[1] === 2, err || ran);
    check('짝: 표가 «목표 없음» 이면 0 이다(화면이 줄을 안 그린다)',
          !err && ran && ran[2] === 0 && ran[3] === 0, err || ran);
  }

  /* 🔴 빼는 목록은 TOOLS 에서 «계산» 돼야 한다 — 손으로 적으면 도구가 늘 때 조용히 게임으로 센다 */
  const ids = M.TOOL_GAME_IDS;
  check('학습 도구를 게임에서 뺀다 — warmup·speech-coach·vocab',
        ids.includes('warmup') && ids.includes('speech-coach') && ids.includes('vocab'), ids);
  check('micro-quiz·review-quiz·judgment·ai-write 도 뺀다',
        ['micro-quiz', 'review-quiz', 'judgment', 'ai-write'].every((x) => ids.includes(x)), ids);
  check('«모를 때» 값(other)도 게임으로 세지 않는다', ids.includes('other'), ids);
  check('허브 자신(student-games)도 게임이 아니다', ids.includes('student-games'), ids);
  /* 짝 — 진짜 게임은 빼지 «않는다»(없으면 «전부 빼기» 도 통과한다) */
  check('짝: 진짜 게임은 목록에 없다(tetris·shooter·space-monster·avatar)',
        !ids.includes('tetris') && !ids.includes('shooter') && !ids.includes('space-monster') && !ids.includes('avatar'), ids);
  /* ⛔ 이름을 소스에 손으로 적지 않았는가 — TOOLS 에서 계산한다 */
  check('⛔ 그 이름들을 game-mission.ts 에 손으로 적지 않았다(TOOLS 에서 계산)',
        !/'warmup'|'speech-coach'|'micro-quiz'|'review-quiz'/.test(strip(gmSrc)),
        (strip(gmSrc).match(/'(warmup|speech-coach|micro-quiz|review-quiz)'/g) || []));

  /* 🔗 game-track.js 의 detectGame 과 «같은 다듬기» 인가 — 둘이 어긋나면 조용히 안 걸러진다 */
  const detect = fnBody(trackSrc, 'detectGame');
  check('전제: game-track.js 의 detectGame 을 찾았다', detect.length > 100, detect.length);
  check('🔗 정본의 다듬기가 detectGame 과 같은 말을 한다(student-game- · -cn · .html)',
        /student-game-/.test(detect) && /-cn\$/.test(detect.replace(/\\/g, '')) &&
        M.gameIdFromUrl('/student-game-tetris.html') === 'tetris' &&
        M.gameIdFromUrl('/speech-coach-cn.html') === 'speech-coach' &&
        M.gameIdFromUrl('/warmup.html') === 'warmup',
        [M.gameIdFromUrl('/student-game-tetris.html'), M.gameIdFromUrl('/speech-coach-cn.html')]);

  /* 게스트 — uid 를 함께 쓴다(speech-mission 과 같은 규약)
     ⚠️ «null 인가» 로만 물으면 이 검사가 헛돕니다 — `{}` 를 넘기면 env.DB.prepare 가 던져
        catch 가 어차피 null 을 주므로 **게이트를 통째로 지워도 통과합니다**(실측으로 밟았습니다).
        그래서 «조회까지 갔는가» 를 스파이로 재고, «안 간다 / 간다» 를 짝으로 둡니다. */
  const spyEnv = () => {
    const s = { reached: false };
    return [{ DB: { prepare() { s.reached = true; return { bind() { return { first: async () => ({ n: 3 }) }; } }; } } }, s];
  };
  for (const g of ['guest', 'guest_ab', 'GUEST_7']) {
    const [se, sp] = spyEnv();
    const r = await M.gameItemsToday(se, g);
    check('게스트(' + g + ')는 대상이 아니다 — 조회까지 가지 않는다', r === null && sp.reached === false, { r, reached: sp.reached });
  }
  {
    const [se, sp] = spyEnv();
    const r = await M.gameItemsToday(se, 'guestavo');
    check('짝: guest 로 «시작만» 하는 실계정은 게스트가 아니다 — 조회까지 간다', r === 3 && sp.reached === true, { r, reached: sp.reached });
  }
  {
    const [se, sp] = spyEnv();
    const r = await M.gameItemsToday(se, 'jeong');
    check('짝: 실계정은 조회까지 간다', r === 3 && sp.reached === true, { r, reached: sp.reached });
  }
  for (const u of ['', null]) {
    const [se, sp] = spyEnv();
    check('빈 uid(' + JSON.stringify(u) + ')는 대상이 아니다 — 조회까지 가지 않는다',
          await M.gameItemsToday(se, u) === null && sp.reached === false);
  }

  /* 못 세면 null — 0 이 아니다 */
  const throwDb = { DB: { prepare() { throw new Error('boom'); } } };
  check('못 세면 null 이다 — 0 이 아니다(조회 한 번 실패가 오늘을 지우지 않게)',
        await M.gameItemsToday(throwDb, 'jeong') === null);
  check('그래서 미션 상태도 null 이다(화면이 «0 문제» 라 말하지 않는다)',
        await M.gameMissionState(throwDb, 'jeong') === null);

  /* 상태 조립 */
  const fake = (n) => ({ DB: { prepare() { return { bind() { return { first: async () => ({ n }) }; } }; } } });
  const mid = await M.gameMissionState(fake(2), 'jeong');
  check('2문제면 「남은 것」이 goal-2 다', mid && mid.count === 2 && mid.left === goal - 2 && mid.reached === false, mid);
  const done = await M.gameMissionState(fake(goal), 'jeong');
  check('목표를 채우면 reached 다', done && done.reached === true && done.left === 0, done);
  const over = await M.gameMissionState(fake(goal + 7), 'jeong');
  check('짝: 더 해도 막지 않는다 — 넘쳐도 left 는 0 이고 reached 다',
        over && over.reached === true && over.left === 0 && over.count === goal + 7, over);
  check('단위를 서버가 준다(문제/question)', mid && mid.unitKo && mid.unitEn && mid.unitEnPl, mid);
  check('영어 복수형을 서버가 만든다(화면이 규칙을 복제하지 않게)',
        done && done.unitEnPl === done.unitEn + 's', [done && done.unitEn, done && done.unitEnPl]);
}

/* ════════════════════════════════════════════════════════════════════
   ② SQL — 진짜 SQLite 에 돌려 본다
   ════════════════════════════════════════════════════════════════════ */
console.log('\n② SQL — 진짜 SQLite 에 돌린다');
if (M) {
  /* 정본이 실제로 쓰는 SQL 을 «그 함수를 돌려» 잡아낸다 — 여기에 SQL 을 베껴 적지 않는다 */
  let caught = null;
  const spy = { DB: { prepare(sql) { caught = { sql, binds: null };
    return { bind(...b) { caught.binds = b; return { first: async () => ({ n: 0 }) }; } }; } } };
  await M.gameItemsToday(spy, 'jeong');
  check('전제: 정본이 쓰는 SQL 을 잡았다', !!(caught && caught.sql), caught && caught.sql);
  const sql = (caught && caught.sql) || '';
  check('🔴 «판 수»(COUNT(*))가 아니라 «문제»(SUM(items))를 센다',
        /SUM\s*\(\s*items\s*\)/i.test(sql) && !/COUNT\s*\(\s*\*\s*\)/i.test(sql), sql.slice(0, 160));
  check('그 학생으로 좁힌다(남의 기록이 섞이지 않게)', /uid\s*=\s*\?/i.test(sql), sql.slice(0, 160));
  check('오늘로 좁힌다', /created_at\s*>=\s*\?/i.test(sql), sql.slice(0, 160));
  /* ⛔ «목록을 펼지 않는다» — 모양이 아니라 「도구가 늘어도 바인드 수가 안 늘는가」를 묻는다.
     📜 2026-09-21: 처음엔 `game NOT IN (?,?,…)` 였는데 `d1_bind_limit_harness` 가 잡았다
        (D1 바인드 100개 한도). 콤마 문자열 한 개 + `instr` 로 바꿨다. */
  check('⛔ 목록을 `IN (?,?,…)` 로 펼지 않았다(D1 바인드 한도)',
        !/\bIN\s*\(\s*\?/i.test(sql), sql.slice(0, 220));
  check('도구가 몇 개든 바인드는 세 개다(uid·오늘·제외목록)',
        !!(caught && caught.binds && caught.binds.length === 3), caught && caught.binds);
  check('제외 목록을 그 한 칸에 실어 보낸다(TOOL_GAME_IDS 전부)',
        !!(caught && caught.binds && M.TOOL_GAME_IDS.every((g) => String(caught.binds[2]).includes(',' + g + ','))),
        caught && caught.binds && caught.binds[2]);
  check('NULL 게임명도 게임으로 세지 않는다(COALESCE)', /COALESCE\s*\(\s*game/i.test(sql), sql.slice(0, 220));

  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE game_sessions (uid TEXT, game TEXT, items INTEGER, finished INTEGER, created_at INTEGER)`);
  const d0 = Date.now() - 3600000, old = Date.now() - 3 * 86400000;
  const rows = [
    ['jeong', 'tetris', 3, 1, d0], ['jeong', 'shooter', 4, 1, d0],
    ['jeong', 'tetris', 0, 0, d0],                 // 들락날락 — 한 문제도 안 세어져야 한다
    ['jeong', 'warmup', 9, 1, d0],                 // 학습 도구 — 게임으로 세면 이중계산
    ['jeong', 'speech-coach', 5, 1, d0],           // 〃
    ['jeong', 'other', 7, 1, d0],                  // 모를 때 — 세지 않는다
    ['jeong', 'tetris', 50, 1, old],               // 어제 — 오늘이 아니다
    ['lee', 'tetris', 30, 1, d0],                  // 남 — 섞이면 안 된다
  ];
  const ins = db.prepare(`INSERT INTO game_sessions (uid,game,items,finished,created_at) VALUES (?,?,?,?,?)`);
  for (const r of rows) ins.run(...r);
  /* 정본이 만든 SQL 과 bind 를 **그대로** 돌린다 — 베껴 적지 않는다 */
  const spy2 = { DB: { prepare(s) { return { bind(...b) {
    const st = db.prepare(s); const got = st.get(...b);
    return { first: async () => got };
  } }; } } };
  const n = await M.gameItemsToday(spy2, 'jeong');
  check('오늘·그 학생·게임만 세어 7 이다(3+4, 0판·도구·other·어제·남 제외)', n === 7, n);
  const n2 = await M.gameItemsToday(spy2, 'lee');
  check('짝: 다른 학생은 자기 것만 센다(30)', n2 === 30, n2);
  /* 한 행도 없을 때 — null 이 아니라 0 이어야 한다(«아직 안 했다» 는 «모름» 이 아니다) */
  const n3 = await M.gameItemsToday(spy2, 'nobody');
  check('짝: 기록이 없으면 0 이다(«모름»(null) 과 구분한다)', n3 === 0, n3);
}

/* ════════════════════════════════════════════════════════════════════
   ③ today-plan — 단위와 목표
   ════════════════════════════════════════════════════════════════════ */
console.log('\n③ today-plan.ts — 단위가 «판» 이 아니라 «문제» 인가');
{
  const g = (planSrc.match(/games:\s*\{\s*goal:[^}]*\}/) || [])[0] || '';
  check('전제: TOOL_GOALS.games 줄을 찾았다', g.length > 10, g);
  check('🔴 단위가 «판» 이 아니다 — 세는 것은 items(문제)다', !/'판'/.test(g), g);
  check('단위가 «문제» 다', /'문제'/.test(g), g);
  check('영어 단위도 round 가 아니다', !/'round'/.test(g) && /'question'/.test(g), g);
  check('⛔ goal 이 null 로 되돌아가지 않았다', !/goal:\s*null/.test(g), g);
}

/* ════════════════════════════════════════════════════════════════════
   ④ 배선 — 카드와 허브가 «같은 함수» 를 쓰는가
   ════════════════════════════════════════════════════════════════════ */
console.log('\n④ 서버 배선');
{
  const ss = strip(studentsSrc);
  check('「오늘의 A.i 학습」 카드가 정본으로 센다', /gameItemsToday\s*\(/.test(ss), true);
  /* ⛔ 그 자리에 SQL 을 다시 적지 않았는가 — 두 화면이 다른 숫자를 말하지 않게 */
  const doneBlock = (() => { const i = ss.indexOf('const d0 = k.dayStartMs;'); const j = ss.indexOf(']);', i);
    return i > 0 && j > i ? ss.slice(i, j) : ''; })();
  check('전제: done 조립 블록을 잘라 냈다', doneBlock.length > 200, doneBlock.length);
  check('⛔ 그 자리에 game_sessions SQL 을 다시 적지 않았다',
        !/FROM\s+game_sessions/i.test(doneBlock), (doneBlock.match(/FROM\s+game_sessions[^\n]*/gi) || []));
  /* 🔴 「그 이름이 응답에 있는가」로 물으면 `games_today: null` 한 글자에 뚫린다(2026-09-21 함정 대조 실측).
     ✅ **게이트가 채운 «그 변수»** 를 싣는지 — 변수 이름을 소스에서 «읽어» 대조한다. */
  const gtVar = (ss.match(/(\w+)\s*=\s*await\s+gameMissionState\s*\(/) || [])[1] || '';
  check('전제: gameMissionState 의 결과를 담는 변수를 찾았다', gtVar.length > 0, gtVar);
  check('허브가 쓸 값을 응답에 싣는다 — 그 게이트가 채운 «그 변수» 를',
        !!gtVar && new RegExp('games_today\\s*:\\s*' + gtVar + '\\s*[,}]').test(ss),
        (ss.match(/games_today\s*:[^,\n]*/) || [])[0]);
  check('그 조회가 실패해도 응답은 나간다(try 로 감쌌다)',
        /try\s*\{\s*gamesToday\s*=\s*await gameMissionState/.test(ss), true);
  check('새 라우트를 만들지 않았다(src/index.ts 는 공동 금지구역)',
        !/\/api\/(game-?mission|games\/today)/.test(ss), true);
}

/* ════════════════════════════════════════════════════════════════════
   ⑤ 화면 — 숫자를 다시 적지 않았는가 · 배선이 실제로 있는가
   ════════════════════════════════════════════════════════════════════ */
console.log('\n⑤ 화면 student-games.html');
{
  const hub = strip(hubSrc);
  const js = fnBody(hubSrc, '_gmRender');
  check('전제: 화면 함수를 잘라 냈다', js.length > 300, js.length);
  check('화면이 목표 숫자를 손으로 적지 않았다(서버가 준다)',
        !/\bgoal\s*[:=]\s*\d+/.test(js) && !/['"]문제['"]\s*[,;)]/.test(js), (js.match(/goal\s*[:=]\s*\d+/g) || []));
  check('단위도 서버가 준 값을 쓴다', /m\.unitKo/.test(js) && /m\.unitEn/.test(js), true);
  check('화면에 영어 복수 규칙을 복제하지 않았다', !/\+\s*'es'|\+\s*'ies'/.test(js), true);
  check('다 채워도 «잠그지» 않는다', !/disabled\s*=\s*true/.test(js) && !/pointerEvents/.test(js), true);
  check('오늘 한 문제 수를 localStorage 로 세지 않는다(서버가 센다)',
        !/localStorage[^\n]*(count|done|items)/i.test(js), (js.match(/localStorage[^\n]*/g) || []).slice(0, 3));
  /* 🔴 «호출» 을 찾을 때 `이름(` 로 물으면 함수 «선언» 이 잡혀 호출을 지워도 통과한다 */
  check('들어오자마자 한 번 물어본다(선언이 아니라 «호출»)',
        /(^|[^\w.])_gmLoad\s*\(\s*\)\s*;/m.test(hub), (hub.match(/_gmLoad[^\n]*/g) || []).slice(0, 4));
  check('짝: _gmLoad 선언은 정확히 하나다', (hub.match(/function\s+_gmLoad\s*\(/g) || []).length === 1);
  /* 🔴 「부르는가」가 아니라 «닿는가» — 응답을 받아 놓고 다시 그리지 않는 변이가 0건으로 통과했다
     (2026-09-21 함정 대조 실측). ✅ 몸통을 오려 내 **가짜 fetch 로 실제로 돌린다**. */
  {
    const body = fnBody(hubSrc, '_gmLoad');
    check('전제: _gmLoad 몸통을 잘라 냈다', body.length > 80, body.length);
    /* 선언을 그대로 쓰고 이름으로 되돌려 받아 부른다 — 몸통만 떼어 내면 선언·호출이 섞여 헷갈린다 */
    let res = null, err2 = null;
    try {
      const src = body + '\nreturn _gmLoad;';
      const mk = new Function('_gameUid', 'localStorage', 'fetch', '_gmRender', 'setToday', src);
      const calls = { render: 0, fetch: 0, last: null, url: '' };
      const ls = { getItem: (k) => (k === 'mango_token' ? 'T' : null) };
      const mkFetch = (payload) => (u) => { calls.fetch++; calls.url = String(u);
        return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }); };
      const render = (m) => { calls.render++; calls.last = m; };
      const mission = { goal: 5, count: 2, left: 3, reached: false, unitKo: '문제', unitEn: 'question', unitEnPl: 'questions' };
      const go = async (uid, ls2, payload) => {
        calls.render = 0; calls.fetch = 0; calls.last = null;
        const fn = mk(() => uid, ls2, mkFetch(payload), render, () => {});
        fn(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
        return { r: calls.render, f: calls.fetch, last: calls.last, url: calls.url };
      };
      res = {
        ok: await go('jeong', ls, { ok: true, games_today: mission }),
        noField: await go('jeong', ls, { ok: true }),
        nullField: await go('jeong', ls, { ok: true, games_today: null }),
        noTok: await go('jeong', { getItem: () => null }, { ok: true, games_today: mission }),
        noUid: await go('', ls, { ok: true, games_today: mission }),
      };
    } catch (e) { err2 = String(e && e.message).slice(0, 160); }
    check('전제: _gmLoad 를 실제로 돌렸다', !err2 && !!res, err2);
    check('🔴 받아 온 값으로 «실제로 다시 그린다»(받아 놓고 안 그리는 변이를 잡는다)',
          !!res && res.ok.r === 1 && res.ok.last && res.ok.last.goal === 5, res && res.ok);
    check('짝: 그 칸이 없으면 안 그린다(0 이라 말하지 않는다)',
          !!res && res.noField.r === 0 && res.nullField.r === 0, res && [res.noField.r, res.nullField.r]);
    check('짝: 토큰·로그인이 없으면 물어보지도 않는다',
          !!res && res.noTok.f === 0 && res.noUid.f === 0, res && [res.noTok.f, res.noUid.f]);
    check('짝: 이미 인증을 지나는 /api/student/today 에 묻는다(새 라우트를 안 만든다)',
          !!res && res.ok.url.indexOf('/api/student/today') === 0, res && res.ok.url);
  }
  /* 🔴 「배선했다」와 「닿는다」는 다르다 — 2026-09-21 실측으로 밟은 자리다.
     이 화면은 `js/mango-i18n.js` 를 안 실고 `js/i18n-sweep.js` 는 `mangoi:lang-changed` 를
     **발행하지 않으므로**, 그 발행만 듣는 배선은 한 번도 안 불리는 죽은 줄이다.
     ✅ 이 화면의 토글은 `toggleSiteLang()` 이므로 **그것을 감싸야** 닿는다. */
  const hasPub = /dispatchEvent\s*\(\s*new\s+(Custom)?Event\s*\(\s*['"]mangoi:lang-changed/.test(hub) ||
                 /mango-i18n\.js/.test((hubSrc.match(/<script[^>]*>/g) || []).join(' '));
  check('전제: 이 화면은 mangoi:lang-changed 를 발행하지 않는다(그래서 토글을 감싸야 한다)',
        hasPub === false, hasPub);
  check('🌐 이 화면의 토글(toggleSiteLang)을 감싸 다시 그린다',
        /window\.toggleSiteLang\s*=\s*function[\s\S]{0,400}_gmRender/.test(hub),
        (hub.match(/toggleSiteLang[^\n]*/g) || []).slice(0, 4));
  check('짝: 원래 토글을 버리지 않고 그대로 부른다(저장값·<html lang> 이 안 바뀌면 사이트 언어가 통째로 죽는다)',
        /_gmOldToggle\.apply\s*\(/.test(hub), true);
  check('그래도 발행처가 생기는 날을 위해 그 행사도 둘다 듣는다(window·document)',
        /window\.addEventListener\(\s*'mangoi:lang-changed'/.test(hub) &&
        /document\.addEventListener\(\s*'mangoi:lang-changed'/.test(hub), true);
  
  /* 🔴 display:none 을 «기본값» 으로 두면 el.hidden=false 로 안 열린다 — 브라우저 실측으로 밟았다 */
  const css = (hubSrc.match(/#gm-today\{[^}]*\}/) || [])[0] || '';
  check('전제: #gm-today CSS 를 찾았다', css.length > 30, css);
  check('🔴 display:none 을 기본값으로 두지 않았다(el.hidden 으로 열 수 없게 된다)',
        !/display:\s*none/.test(css), css);
  check('숨김은 [hidden] 한 곳으로 한다(작성자 CSS 가 UA 기본을 이긴다)',
        /#gm-today\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(hubSrc), true);
  const fill = (hubSrc.match(/#gm-today \.gmt-fill\{[^}]*\}/) || [])[0] || '';
  check('전제: 채움 CSS 를 찾았다', fill.length > 30, fill);
  check('채움이 인라인이 아니다(display:block)', /display:\s*block/.test(fill), fill);
  check('0 일 때도 «측정 안 됨» 과 구분된다(min-width)', /min-width:\s*[1-9]/.test(fill), fill);
  check('글자 줄이 <p> 다(flex 로 감싸면 낱글자로 쪼개진다)', /<p class="gmt-t"/.test(hubSrc), true);
}

/* ════════════════════════════════════════════════════════════════════
   ⑥ 화면 함수를 «실제로» 돌려 무슨 글자가 나오는지 본다
   ════════════════════════════════════════════════════════════════════ */
console.log('\n⑥ _gmRender — 오려 내 실제로 돌린다');
{
  const rBody = fnBody(hubSrc, '_gmRender');
  const enBody = fnBody(hubSrc, '_gmIsEn');
  check('전제: _gmIsEn 도 잘라 냈다', enBody.length > 40, enBody.length);
  const mk = () => ({ textContent: '', className: '', hidden: false, style: {} });
  const sandbox = 'var document = { getElementById: function(id){ return __els[id] || null; } };\n'
                + 'var localStorage = { getItem: function(k){ return k === "mangoi_lang" ? __lang : null; } };\n'
                + 'var window = { getLang: function(){ return __lang; } };\n'
                + 'var getLang = window.getLang;\n' + enBody + '\n' + rBody + '\nreturn _gmRender;';
  let mkFn = null;
  try { mkFn = new Function('__els', '__lang', sandbox); } catch (e) { check('_gmRender 를 평가할 수 있다', false, e.message); }
  if (mkFn) {
    const run = (m, lang = 'ko') => {
      const e = { 'gm-today': mk(), 'gm-today-t': mk(), 'gm-today-fill': mk(), __err: '' };
      try { mkFn(e, lang)(m); } catch (err) { e.__err = String((err && err.message) || err); }
      return e;
    };
    const base = { goal: 5, count: 2, left: 3, reached: false, unitKo: '문제', unitEn: 'question', unitEnPl: 'questions' };
    const mid = run(base);
    check('돌려도 던지지 않는다', mid.__err === '', mid.__err);
    check('진행 중 — 「2 / 5문제 · 3문제 더!」', /2 \/ 5문제/.test(mid['gm-today-t'].textContent) && /3문제 더/.test(mid['gm-today-t'].textContent),
          mid['gm-today-t'].textContent);
    check('진행 중 — 막대를 그 비율로 그린다', mid['gm-today-fill'].style.width === '40%', mid['gm-today-fill'].style.width);
    check('진행 중 — 줄을 보여준다', mid['gm-today'].hidden === false);
    const hit = run({ ...base, count: 5, left: 0, reached: true });
    check('채웠을 때 — «끝» 이라고 말한다', /끝/.test(hit['gm-today-t'].textContent), hit['gm-today-t'].textContent);
    check('채웠을 때 — «더 해도 좋아요» 를 함께 말한다(잠그지 않는다)', /더 해도/.test(hit['gm-today-t'].textContent), hit['gm-today-t'].textContent);
    check('채웠을 때 — 막대 색이 바뀐다(hit)', /hit/.test(hit['gm-today-fill'].className) && /hit/.test(hit['gm-today-t'].className));
    const en = run(base, 'en');
    check('영어 — 「2 / 5 questions · 3 to go」',
          /2 \/ 5 questions/.test(en['gm-today-t'].textContent) && /3 to go/.test(en['gm-today-t'].textContent),
          en['gm-today-t'].textContent);
    const nul = run(null);
    check('짝: 모르면(null) 줄을 그리지 않는다 — 0 이라 말하지 않는다',
          nul['gm-today'].hidden === true && nul['gm-today-t'].textContent === '', nul['gm-today-t'].textContent);
    const zero = run({ ...base, goal: 0 });
    check('짝: 목표가 없으면 줄을 그리지 않는다', zero['gm-today'].hidden === true);
  }
}

/* ════════════════════════════════════════════════════════════════════
   ⑦ finished 를 «완주» 로 쓰지 않는가
   ════════════════════════════════════════════════════════════════════ */
console.log('\n⑦ finished 는 «완주» 가 아니다');
{
  /* 🔴 MangoiGame.finish() 를 부르는 게임이 0곳이라 그 값은 «학습 항목이 있었나» 일 뿐이다.
        그래서 «완주율» 로 쓰면 화면이 거짓말한다. */
  check('⛔ 정본이 finished 를 안 읽는다', !/\bfinished\b/.test(strip(gmSrc).replace(/[A-Za-z_]*finished[A-Za-z_]*\s*[:=]/g, '')),
        (strip(gmSrc).match(/finished/g) || []).length);
  const tf = strip(trackSrc);
  check('game-track.js 의 finished 는 여전히 «items>0» 이다(뜻이 바뀌면 이 주석부터 고칠 것)',
        /finished:\s*\(finishedFlag\s*\|\|\s*items\s*>\s*0\)/.test(tf), true);
  /* 🔴 목록을 손으로 적지 않는다 — 허브가 «실제로 여는» 주소에서 계산한다.
        (손목록이던 2026-09-21 판에는 speaking-quiz 가 빠져 있었고, 오타 항목은
         `read()` 가 '' 를 줘 **조용히 통과**했다 — 함정 대조가 잡았다.) */
  const hubUrls = [...new Set((hubSrc.match(/return\s*'\/[a-z0-9-]+\.html[^']*'/g) || [])
    .map((m) => (m.match(/'\/([a-z0-9-]+\.html)/) || [])[1]).filter(Boolean))];
  check('전제: 허브가 여는 게임 목록을 읽었다(손으로 적지 않았다)', hubUrls.length >= 12, hubUrls.length);
  const missing = hubUrls.filter((f) => !existsSync(join(PUB, f)));
  check('짝: 그 주소가 전부 실재한다(오타가 조용히 통과하지 않게)', missing.length === 0, missing);

  /* 그 전제가 깨지는 날 — 즉 게임이 finish() 를 부르기 시작하면 — 이 줄이 먼저 빨간불이 된다 */
  const callers = hubUrls.filter((f) => /MangoiGame\s*\.\s*finish\s*\(/.test(read(join(PUB, f))));
  check('📌 아직 MangoiGame.finish() 를 부르는 화면이 없다 — 생기면 «완주» 를 다시 정의할 것',
        callers.length === 0, callers);

  /* 📌 «추적을 아예 안 하는 게임» — FAIL 로 만들지 않는다(고치는 것은 사람이 정할 일).
        이름을 찍어 둔다: 그 게임만 하는 학생에게는 막대가 «늦는» 것이 아니라 영영 0 이다.
        ⛔ 이 목록이 비면 그것도 이상하다(허브를 못 읽었다는 뜻) — 그때는 위 전제가 먼저 빨간불. */
  const noTrack = hubUrls.filter((f) => !/game-track\.js/.test(read(join(PUB, f))));
  const noApi = noTrack.filter((f) => !/\/api\//.test(read(join(PUB, f))));
  console.log(`    📌 추적을 안 하는 게임 ${noTrack.length}종 — 그 학생의 막대는 영영 0 입니다:`);
  for (const f of noTrack) console.log(`       · ${f}${noApi.includes(f) ? '  (서버 호출 0건 — 구조적으로 셀 수 없음)' : '  (game-track.js 한 줄만 실으면 세어짐)'}`);
  check('📌 그 목록을 실제로 세어 봤다(위 목록이 이 작업의 «남은 것» 이다)', noTrack.length <= hubUrls.length, noTrack);
}

console.log('\n─────────────────────────────────────────────');
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}` + (SKIPPED ? ` / SKIP ${SKIPPED}(환경)` : ''));
if (FAIL > 0) { console.log('⚠ 실제 확인 필요'); process.exit(1); }
