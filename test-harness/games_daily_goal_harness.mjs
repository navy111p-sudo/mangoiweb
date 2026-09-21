/* 🎯 게임 «오늘 몫» 가드 — 2026-09-21
 *
 * 📜 사장님 「게임을 몇 번 하다가 나가요.」
 *    D1 실측이 그 말을 뒷받침했습니다 — 게임 학생-일 65일 중 **25일(38.5%)이
 *    «켰지만 한 문제도 안 푼 날»**. 그래서 허브가 「오늘 이만큼」을 말하게 했습니다.
 *
 * 🔴 여기서 지켜야 할 것은 넷입니다.
 *    ① «판» 이 아니라 «문제» 로 센다 — 판으로 세면 들락날락도 달성이 된다.
 *    ② 게임과 학습도구를 겹쳐 세지 않는다 — game_sessions 에 둘이 함께 들어 있다.
 *    ③ 모르는 이름은 «게임» 으로 본다 — 새 게임이 조용히 빠지면 막대가 영영 0이다.
 *    ④ 화면은 숫자를 다시 계산하지 않는다 — 두 화면의 답이 갈린다.
 *
 * ⚠️ 문자열로 「그 함수가 있는가」만 물으면 아무것도 안 지켜집니다.
 *    정본을 실제로 돌리고, 화면 함수는 중괄호 짝으로 오려 내 돌려 «무슨 글자가 나오는가» 를 봅니다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PLAN = read('cloudflare-deploy/src/today-plan.ts');
const API = read('cloudflare-deploy/src/api-students.ts');
const TODAYJS = read('cloudflare-deploy/public/js/today-page.js');
const TODAYHTML = read('cloudflare-deploy/public/today.html');
const HUBJS = read('cloudflare-deploy/public/js/games-daily-goal.js');
const HUBHTML = read('cloudflare-deploy/public/student-games.html');

/* 부정 검사는 주석을 벗긴 사본으로 — 「왜 이렇게 했나」 주석이 그 낱말을 담고 있어
   검사가 «자기 주석» 을 잡는다. ⛔ `//` 를 정규식으로 일괄 지우면 문자열 안 `https://` 가 잘린다. */
const strip = (src) => {
  let out = '', i = 0; const n = src.length;
  let inBlock = false, inLine = false, q = '';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; } else i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
};

/** 중괄호 짝으로 함수 몸통 자르기. ⚠️ TS 는 반환 타입·제네릭 안에도 `{` 가 있어
    괄호·꺾쇠 깊이가 0인 여는 중괄호만 몸통으로 본다(CLAUDE.md 2장). */
const bodyAt = (src, anchor) => {
  const at = src.indexOf(anchor);
  if (at < 0) return null;
  let i = at + anchor.length, par = 0, ang = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '(') par++; else if (c === ')') par--;
    else if (c === '<') ang++; else if (c === '>') ang--;
    else if (c === '{' && par <= 0 && ang <= 0) break;
    i++;
  }
  if (i >= src.length) return null;
  let depth = 0; const start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(start, i + 1); }
  }
  return null;
};

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, why = '') => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
};

const esbuild = (() => {
  try { return createRequire(join(ROOT, 'cloudflare-deploy/package.json'))('esbuild'); }
  catch { return null; }
})();
const NO_ESBUILD = !esbuild;
if (NO_ESBUILD) {
  console.log('\n[ 일부 건너뜀 ] esbuild 없음 — ①②(정본을 실제로 돌리는 절)만 건너뜁니다.');
  console.log('  ⚠️ 그 두 절은 「확인 안 함」이지 「문제없음」이 아닙니다. ③④ 는 그대로 돕니다.');
}
let mod = {};
if (!NO_ESBUILD) {
  /* 🔴 transformSync + 빈 require 로 두면 안 된다 — judgment-level 의 BAND_COUNT 가 undefined 가 되어
     `band <= undefined` 가 false → 계획이 «언제나 레벨 미배정» 이 되고 games 칸이 한 번도 안 생긴다.
     그러면 그 칸을 보는 검사가 FAIL 이 아니라 «조용히 사라진다»(2026-09-21 변이시험에서 실제로 밟음).
     그래서 의존성까지 **번들**해서 정본 그대로 돌린다. */
  const out = esbuild.buildSync({
    entryPoints: [join(ROOT, 'cloudflare-deploy/src/today-plan.ts')],
    bundle: true, format: 'cjs', write: false, platform: 'neutral', logLevel: 'silent',
  });
  const holder = { exports: {} };
  new Function('exports', 'module', 'require', out.outputFiles[0].text)(holder.exports, holder, () => ({}));
  mod = holder.exports;
}

/* D1 실측(2026-09-21) — game_sessions.game 에 실제로 들어 있는 이름들 */
const REAL_GAMES = ['grammar-pizza', 'space-monster', 'avatar', 'shooter', 'escape-voice',
  'tank-battle', 'p38-3d', 'escape-zombie', 'escape-school', 'tetris', 'language-ace',
  'rescue-voyage', 'battle-3d'];

if (!NO_ESBUILD) {
  console.log('\n[ ① 게임/학습도구 가르기 — 정본을 실제로 돌린다 ]');
  const { isGameKind, NON_GAME_KINDS, NON_GAME_SQL, TOOLS } = mod;
  check('전제: 정본을 읽었다', typeof isGameKind === 'function' && Array.isArray(NON_GAME_KINDS),
    typeof isGameKind);
  check(`학습도구 ${(NON_GAME_KINDS || []).length}종은 게임이 아니다`,
    (NON_GAME_KINDS || []).every((k) => isGameKind(k) === false),
    JSON.stringify((NON_GAME_KINDS || []).filter((k) => isGameKind(k))));
  /* 🔴 짝 — 없으면 «전부 게임 아님»(=막대가 영영 0) 도 통과한다 */
  check(`실측 게임 ${REAL_GAMES.length}종은 게임이다 (짝)`,
    REAL_GAMES.every((g) => isGameKind(g) === true),
    JSON.stringify(REAL_GAMES.filter((g) => !isGameKind(g))));
  check('모르는 이름(새 게임)은 게임으로 본다 — 빠지는 쪽으로 실패하지 않는다',
    isGameKind('brand-new-game-2027') === true);
  check('빈 값·null 은 게임이 아니다', !isGameKind('') && !isGameKind(null) && !isGameKind(undefined));
  check('대소문자·앞뒤 공백을 무시한다', isGameKind('  Warmup ') === false && isGameKind(' SHOOTER ') === true);
  check('games 에 «오늘 몫» 이 정해져 있다', Number(TOOLS?.games?.goal) > 0, String(TOOLS?.games?.goal));

  console.log('\n[ ①-b SQL 조각 — 정본에서 만들어진 그대로인가 ]');
  check('목록의 이름이 모두 SQL 에 들어 있다',
    (NON_GAME_KINDS || []).every((k) => NON_GAME_SQL.includes("'" + k + "'")),
    NON_GAME_SQL);
  check('NOT IN 이다 (IN 으로 뒤집히면 게임만 빠진다)', /NOT\s+IN\s*\(/i.test(NON_GAME_SQL));
  check('소문자로 견준다 (game 칸 표기가 섞여도 걸린다)', /LOWER\s*\(/i.test(NON_GAME_SQL));
  /* 이름은 코드 안 고정 상수 — 따옴표가 섞여 들어오면 조건이 통째로 깨진다 */
  check('이름에 따옴표·세미콜론이 없다 (주입 여지)',
    (NON_GAME_KINDS || []).every((k) => !/['"`;]/.test(k)));

  console.log('\n[ ② 계획 정본을 실제로 돌린다 — 몫이 그대로 실리는가 ]');
  const { buildTodayPlan } = mod;
  const base = {
    band: 3, textbook: null, dow: 3, nowMin: 600, classes: [],
    weekClassDows: [], weekClassTimes: {}, done: {},
  };
  const p2 = buildTodayPlan({ ...base, gameItems: 2 });
  check('전제: 계획을 만들었다', !!p2 && Array.isArray(p2.steps));
  check('오늘 푼 문제 수가 그대로 실린다 (2 → 2)', p2.gameItems === 2, String(p2.gameItems));
  check('목표는 정본 TOOLS 에서 온다', p2.gameGoal === TOOLS.games.goal, String(p2.gameGoal));
  /* 🔴 games 가 오늘 계획에 «없는» 날도 허브는 숫자를 보여 줘야 한다 */
  const hasGames = p2.steps.some((s) => s.key === 'games');
  check(`games 가 계획에 없어도 최상위 값은 있다 (오늘 games=${hasGames})`,
    Number.isFinite(p2.gameGoal) && Number.isFinite(p2.gameItems));
  check('안 넘기면 0 — 값을 지어내지 않는다', buildTodayPlan({ ...base }).gameItems === 0);
  check('음수·NaN 은 0 으로 (막대가 뒤로 가지 않는다)',
    buildTodayPlan({ ...base, gameItems: -5 }).gameItems === 0 &&
    buildTodayPlan({ ...base, gameItems: NaN }).gameItems === 0);
  check('소수는 내림 (2.9문제 → 2)', buildTodayPlan({ ...base, gameItems: 2.9 }).gameItems === 2);

  /* ⛔ games 칸이 없는 날로 재면 그 아래 검사가 «조용히 사라진다» — 있는 요일을 찾아 쓰고,
     못 찾으면 건너뛰지 말고 FAIL 낸다(전제가 깨진 것이지 «문제없음» 이 아니다). */
  const gStep = (pl) => (pl.steps || []).find((s) => s.key === 'games');
  let pg = null, gs = null;
  for (let d = 0; d <= 6 && !gs; d++) {
    const cand = buildTodayPlan({ ...base, band: 3, textbook: 'BTS 1', dow: d, gameItems: 3 });
    const g = gStep(cand);
    if (g) { pg = cand; gs = g; }
  }
  check('전제: games 가 계획에 실제로 들어가는 날을 찾았다', !!gs,
    'HOME_WEEK 에 games 가 없거나 계획이 늘 레벨 미배정이다');
  check('games 칸에 goal·progress 가 함께 실린다',
    !!gs && gs.goal === TOOLS.games.goal && gs.progress === 3,
    JSON.stringify(gs ? { goal: gs.goal, progress: gs.progress } : null));
  /* 🔴 짝 — 없으면 «모든 도구에 goal 붙이기» 도 통과한다(막대가 전부 뜬다) */
  const others = ((pg || p2).steps || []).filter((s) => s.key !== 'games' && s.key !== 'leveltest');
  check(`몫이 없는 도구 ${others.length}종에는 goal 칸이 없다 (짝)`,
    others.every((s) => s.goal === undefined),
    JSON.stringify(others.filter((s) => s.goal !== undefined).map((s) => s.key)));
}

console.log('\n[ ③ 서버 배선 — 두 축을 갈라 세는가 ]');
const apiS = strip(API);
/* ⚠️ 「그 함수를 부르는가」가 아니라 «그 조건을 실제로 붙이는가» 로 묻는다 */
const gsQueries = [...apiS.matchAll(/cnt\(`([^`]*game_sessions[^`]*)`([^)]*)\)/g)];
check(`game_sessions 를 세는 자리를 찾았다 (${gsQueries.length}곳)`, gsQueries.length === 2,
  JSON.stringify(gsQueries.map((m) => m[1].slice(0, 60))));
check('두 자리 모두 게임만으로 좁힌다 (NON_GAME_SQL 을 붙인다)',
  gsQueries.length === 2 && gsQueries.every((m) => /NON_GAME_SQL/.test(m[0])),
  JSON.stringify(gsQueries.map((m) => m[0].slice(-40))));
check('한 자리는 «판 수»(COUNT), 다른 자리는 «문제 수»(SUM items) — 다른 축이다',
  gsQueries.some((m) => /COUNT\(\*\)/i.test(m[1])) &&
  gsQueries.some((m) => /SUM\(\s*items\s*\)/i.test(m[1])),
  JSON.stringify(gsQueries.map((m) => m[1])));
/* ⛔ 조건을 호출부에 베끼면 목록이 늘 때 한 곳만 고쳐진다 */
check('호출부가 학습도구 이름을 손으로 적지 않았다',
  !/(['"])(warmup|speech-coach|micro-quiz|review-quiz)\1/.test(apiS.replace(/from '\.\/today-plan'/g, '')),
  (apiS.match(/(['"])(warmup|speech-coach|micro-quiz|review-quiz)\1/g) || []).join(','));
check('계획 정본에 문제 수를 넘긴다', /gameItems:\s*gameItemsToday/.test(apiS));
check('정본에서 SQL 조각을 import 한다', /import\s*\{[^}]*NON_GAME_SQL[^}]*\}\s*from\s*'\.\/today-plan'/.test(apiS));

console.log('\n[ ④ 화면 — 「오늘 몫」 을 실제로 그리는가 ]');
const tjs = strip(TODAYJS);
/* 🔴 「그 이름이 있는가」로 물으면 **선언**(`function goalBar(s)`)이 걸려 호출을 통째로
   지워도 통과한다 — 2026-09-21 변이 Ⓙ 로 실측(CLAUDE.md 「선언이 잡혀 통과」). 선언을 지운
   사본에서 «카드를 만드는 그 식 안에» 호출이 있는지 본다. */
const tjsNoDecl = tjs.replace(/function\s+goalBar\s*\([\s\S]*?\n    \}/, '');
check('today 카드가 막대 함수를 실제로 부른다 (선언 말고 호출)',
  /\+\s*goalBar\s*\(\s*s\s*\)\s*\+/.test(tjsNoDecl),
  (tjsNoDecl.match(/goalBar[^\n]*/g) || []).join(' | ').slice(0, 120));
const gbBody = bodyAt(TODAYJS, 'function goalBar');
check('전제: 막대 함수를 오려 냈다', !!gbBody, String(gbBody).slice(0, 40));
if (gbBody) {
  const T = (ko) => ko;
  const esc = (s) => String(s == null ? '' : s);
  const run = new Function('T', 'esc', 'return function goalBar(s)' + gbBody)(T, esc);
  const out5of5 = run({ goal: 5, progress: 5 });
  const out2of5 = run({ goal: 5, progress: 2 });
  const out0of5 = run({ goal: 5, progress: 0 });
  check('미달이면 남은 개수를 말한다', /2 \/ 5문제/.test(out2of5) && /3문제 더/.test(out2of5), out2of5);
  check('채우면 «끝» 이라고 말한다', /오늘 몫 끝/.test(out5of5), out5of5);
  check('0 도 «0 / 5» 라고 분명히 말한다 (빈 막대를 «측정 안 됨» 으로 읽지 않게)',
    /0 \/ 5문제/.test(out0of5), out0of5);
  check('막대 폭이 진행도를 따라간다 (2/5 → 40%)', /width:40%/.test(out2of5), out2of5);
  check('넘겨도 100% 를 안 넘는다', /width:100%/.test(run({ goal: 5, progress: 99 })));
  /* 🔴 짝 — 없으면 «모든 카드에 막대 그리기» 도 통과한다 */
  check('몫이 없는 도구에는 아무것도 안 그린다 (짝)', run({ goal: 0, progress: 3 }) === '' &&
    run({}) === '');
}
check('today.html 이 막대 스타일을 갖고 있다', /\.step\s+\.goal\b/.test(TODAYHTML));
/* ⚠️ 채움이 span 이면 브라우저가 글자로 봐 width 가 통째로 무시된다 */
check('막대 채움이 인라인이 아니다 (display:block)', /\.prog\s*>\s*i\s*\{[^}]*display:\s*block/.test(TODAYHTML));

console.log('\n[ ④-b 허브 — 서버 값을 읽기만 하는가 ]');
const hub = strip(HUBJS);
check('허브가 서버가 준 목표·진행도를 읽는다',
  /\.gameGoal\b/.test(hub) && /\.gameItems\b/.test(hub));
/* ⛔ 화면이 따로 세면 today 카드와 답이 갈린다 */
check('허브가 game_sessions 를 스스로 세지 않는다',
  !/game_sessions|SUM\(|items\s*\+=/.test(hub));
check('로그인 모양 세 가지를 모두 본다 (uid·user_id·id)',
  /u\.uid\s*\|\|\s*u\.user_id\s*\|\|\s*u\.id/.test(hub));
check('«성공이라고 말했는가» 로 판정한다 (ok === true)', /d\.ok\s*!==\s*true/.test(hub));
check('비로그인이면 아무것도 안 그린다', /if\s*\(!u\)\s*return/.test(hub));
/* ⛔ 상주 타이머·MutationObserver 는 홈을 두 번 멎게 했다 */
check('상주 setInterval·MutationObserver 가 없다',
  !/setInterval\s*\(|new\s+MutationObserver/.test(hub));
check('돌아왔을 때만 다시 읽는다 (pageshow·visibilitychange)',
  /pageshow/.test(hub) && /visibilitychange/.test(hub));
/* ⚠️ 관리자 화면은 document, 나머지는 window 로 쏜다 — 한쪽만 들으면 조용히 침묵한다 */
check('🌐 다시 그리기를 window·document 양쪽에서 듣는다',
  /window\.addEventListener\('mangoi:lang-changed'/.test(hub) &&
  /document\.addEventListener\('mangoi:lang-changed'/.test(hub));
/* ⛔ data-ko/data-en 을 상자에 달면 두 i18n 엔진이 textContent 를 갈아끼워 막대가 사라진다 */
/* 🔴 HTML 문자열만 보면 `el.setAttribute('data-ko', …)` 로 상자에 다는 변이를 못 본다
   (2026-09-21 변이 Ⓜ 로 실측). «상자 요소에 그 속성을 다는 코드» 자체를 금지한다. */
check('data-ko/data-en 을 «글자만 담은 span» 에만 단다',
  /class="gdg-t"\s+data-ko=/.test(hub));
check('상자 요소에는 data-ko 를 달지 않는다 (짝 — 막대가 DOM 에서 사라진다)',
  !/\bel\.setAttribute\s*\(\s*['"]data-(ko|en)/.test(hub) &&
  !/id="?gdg-box"?[^>]*data-ko/.test(hub),
  (hub.match(/setAttribute\([^)]*data-[^)]*\)/g) || []).join(','));
check('허브가 그 파일을 defer 로 싣는다',
  /<script src="\/js\/games-daily-goal\.js\?v=\d+"\s+defer><\/script>/.test(HUBHTML));
check('허브 CSS 가 막대 채움을 block 으로 명시한다',
  /\.gdg-bar\s*>\s*i\s*\{[^}]*display:\s*block/.test(HUBHTML));
check('비었을 때 자리를 안 먹는다 (:empty)', /#gdg-box:empty\s*\{\s*display:\s*none/.test(HUBHTML));

console.log('\n[ ④-c 캐시 — 고친 파일의 ?v= 를 올렸는가 ]');
const vTd = (TODAYHTML.match(/today-page\.js\?v=(\d+)/) || [])[1];
check(`today.html 이 today-page.js 를 버전과 함께 부른다 (v=${vTd})`, Number(vTd) >= 9, String(vTd));

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) { console.log('⚠ 실제 확인 필요:\n  - ' + FAILS.join('\n  - ')); process.exit(1); }
