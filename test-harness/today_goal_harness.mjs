// 🎯 «오늘의 몫» 회귀 감시 (2026-09-21)
//
//   왜 필요한가 —
//     2026-09-21 D1 실측: 게임 한 판 길이 **중앙값 40초**(1,127판 중 643판이 1분 미만),
//     발음은 하루 **중앙값 1문장**인데 화면이 내건 목표는 **100문장**이었다. 100문장 완주
//     보상은 전 기간 6건. 화면 어디에도 «오늘 어디까지 하면 끝인가» 가 없었다 —
//     게임 HTML 14개·발음코치에 날짜 기준 진행을 세는 코드가 0줄이고, 정본 today-plan.ts
//     조차 «했다/안 했다» 이진으로만 봤다(개수는 이미 오고 있었는데 `> 0` 으로 버렸다).
//     사장님 제보: 「무작정 언제까지 해야 끝나는지 모르니 몇 번 하다가 나가게 돼요.」
//
//   이 하니스가 못 박는 것 —
//     ① 🔴 정본(goalOf)을 esbuild 로 번들해 **실제로 돌린다** — 경계값 0·goal-1·goal·goal+1.
//        문자열 검사는 「그 줄이 있는가」만 볼 뿐 「무슨 답이 나오는가」는 못 본다.
//     ② 📜 games 는 2026-09-21 **오전까지** goal 이 null 이었다 — 「«판» 중앙값이 40초라
//        목표로 두면 들락날락도 «달성»」이 그 근거였고 지금도 옳다. 같은 날 오후에 세는 단위를
//        `game_sessions.items`(학습 항목)로 바꾸자 «들락날락 한 판» 은 items 0 이라 안 세어진다.
//        ⟹ 경계를 「목표가 있다 + «판» 이 아니라 «문제» 로 센다」로 **옮겨 적었다**(느슨하게 푸는 것과 다르다).
//        ⛔ 단위를 «판» 으로 되돌리지 말 것.
//     ③ 🔴 「완료」의 뜻이 «오늘 몫을 채웠나» 다 — 2026-09-21 에 바뀌었다. 옛 뜻(«한 번이라도»)
//        으로 두면 화면이 「✓ 완료」와 「3문장 더!」를 나란히 말하는 자기모순이 된다.
//        ⛔ «목표 없음» 갈래를 지우지 않는다 — 표에 없는 새 도구가 그리로 떨어진다(짝 검사).
//     ④ 화면 goalRow 를 **오려 내 실제로 돌려** «무슨 글자가 나오는가» 를 본다 —
//        진행 중/달성/목표 없음/맛보기 네 경우를 짝으로.
//     ⑤ 화면이 목표 숫자를 다시 적지 않았다 — 두 곳에 적으면 어긋나는 날 화면이 거짓말한다.
//     ⑥ 채움이 인라인이 아니다(display:block) + 0 을 «폭 0» 으로 그리지 않는다(min-width).
//        CLAUDE.md 2장 「막대·게이지의 채움이 안 보임」 — 실제로 밟은 사고다.
//     ⑦ 헬퍼가 스크립트 최상위에 있다(중괄호 깊이) — 함수 «안» 에 있으면 밖의 호출부가
//        전부 ReferenceError 인데 문자열 검사는 「선언도 호출도 있다」로 통과한다.
//     ⑧ 고친 js 를 부르는 HTML 의 ?v= 가 함께 올라갔다.
//     ⑨ 영어 복수 규칙이 실제로 돈다 — «sentence» 하나만 보면 s 만 붙이는 옛 판도 통과한다.
//        -s·-z·-x·-ch·-sh·자음+y 를 직접 넣어 보고, 짝으로 «평범한 말은 예전 그대로» 도 본다.
//        ⛔ 그 규칙은 불규칙 복수를 못 만든다 — TOOL_GOALS 에 그런 단위를 넣는 것을 ②절이 막는다.
//     ⑩ goalRow 의 세 갈래가 모두 esc 를 지난다 — ④절은 esc 를 가짜로 바꿔 돌리므로 못 본다.
//     🔴 esbuild 가 «있는데» 번들이 실패하면 FAIL 이다(SKIP 아님) — 조용히 건너뛰면 검사 25건이
//        사라지는데 종료코드는 0 이라 «확인 안 한 것» 이 «문제없음» 으로 위장한다.
//        esbuild 가 «없을» 때만 환경 사유로 건너뛰고, 그 건수를 마지막 줄에 찍는다.
//
//   변이시험 — 2026-09-21 에 **17종을 실제로 넣어 돌렸고 전부 FAIL** 했다(잡힌 건수):
//     ① speech 목표를 null 로 …………… 3건   ② games 에 goal 3 넣기 ………… 2건
//     ③ done 을 reached 로 바꾸기 ……… 2건   ④ 맛보기 가드 제거 ……………… 2건
//     ④ «달성» 분기 제거 ………………… 2건   ⑤ 화면에 숫자 5 를 다시 적기 … 1건
//     ⑥ .gfill 의 display 제거 ………… 1건   ⑥ min-width 제거 ……………… 1건
//     ⑦ goalRow 를 render 안으로 ……… 2건   ⑧ ?v= 를 안 올리기 …………… 1건
//     ⑨ 복수 규칙을 옛 판(s 만)으로 … 2건   ② 단위를 quiz 로 되돌리기 …… 1건
//     ⑩ 맛보기 갈래의 esc 빼기 ……… 1건   🔴 번들 실패(esbuild 는 있음) … 1건 + exit 1
//     ③ 정본 조건 뒤집기(`count >= goal` → `<`) … 9건   ④ 화면 `hit` 뒤집기 …… 4건
//     ② goal 에 0 넣기 …………………… 1건
//        ← 둘 다 「그 줄이 있는가」로는 못 잡는 종류다(글자가 그대로 남는다).
//   ⚠️ ⑦ 은 처음에 «다른 이름 함수를 render 안에 넣는» 부정확한 변이로 시험해 **0건** 이
//      나왔다 — 검사가 헛돈 것이 아니라 변이가 그 검사를 겨냥하지 못한 것이었다.
//      변이는 «원래 구조 그대로» 재현해야 한다(CLAUDE.md 2장).
//
//   실행: node test-harness/today_goal_harness.mjs
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const CF = join(ROOT, 'cloudflare-deploy');
const rd = (p) => readFileSync(p, 'utf8');

let PASS = 0, FAIL = 0, SKIPPED = 0;
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/** 주석을 벗긴 사본 — 부정 검사가 «자기 설명 주석» 을 잡는 것을 막는다(CLAUDE.md 2장) */
function strip(src) {
  src = String(src).replace(/<!--[\s\S]*?-->/g, '');
  const out = []; let inBlock = false;
  for (const line of String(src).split('\n')) {
    let res = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) { if (line[i] === '*' && line[i + 1] === '/') { inBlock = false; i++; } continue; }
      if (line[i] === '/' && line[i + 1] === '*') { inBlock = true; i++; continue; }
      if (line[i] === '/' && line[i + 1] === '/') break;
      res += line[i];
    }
    out.push(res);
  }
  return out.join('\n');
}
/** 이름 있는 함수의 몸통을 «중괄호 짝» 으로 잘라 낸다(길이로 자르지 않는다) */
function fnBody(src, name) {
  const at = src.indexOf('function ' + name); if (at < 0) return null;
  const open = src.indexOf('{', at); if (open < 0) return null;
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return null;
}

const TP_SRC = join(CF, 'src', 'today-plan.ts');
const PAGE = join(CF, 'public', 'js', 'today-page.js');
const HTML = join(CF, 'public', 'today.html');
const tpSrc = rd(TP_SRC), pageSrc = rd(PAGE), htmlSrc = rd(HTML);

/* ════════════════════════════════════════════════════════════════════
   ① 정본을 실제로 돌린다 — goalOf 경계값
   ════════════════════════════════════════════════════════════════════ */
console.log('\n① 정본 goalOf — 실제로 돌려 본다');
const tmp = mkdtempSync(join(tmpdir(), 'todaygoal-'));
const out = join(tmp, 'tp.mjs');
let mod = null;
const ESB = join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild');
try {
  /* ⚠️ esbuild 는 ELF 바이너리다 — 리눅스/맥에서 node 로 실행하면 «MODULE_NOT_FOUND» 가 난다.
     윈도우에서만 node 를 거친다(기존 today_plan_harness 와 같은 규약). */
  const ARGS = [TP_SRC, '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error'];
  if (process.platform === 'win32') execFileSync(process.execPath, [ESB, ...ARGS]);
  else execFileSync(ESB, ARGS);
  mod = await import(pathToFileURL(out).href);
} catch (e) {
  /* ⛔ 여기서 «조용히 건너뛰지» 않는다 — 그러면 검사 25건이 사라지는데 종료코드는 0 이라
     «확인 안 한 것» 이 «문제없음» 으로 위장한다(CLAUDE.md 2장).
     갈라서 판정한다 — esbuild 가 «없으면» 환경 사유(SKIP, 마지막 줄에 숫자로 찍는다),
     «있는데 실패했으면» 그건 코드 판정이므로 FAIL 이다. */
  if (existsSync(ESB)) {
    check('① 정본을 번들해 돌릴 수 있다(esbuild 는 있는데 실패했다 = 코드 판정)', false, e && e.message);
  } else {
    SKIPPED = 25;
    console.log('  ⏭ esbuild 가 없어 ①~③ 25건을 건너뜀 — «환경 사유»(node_modules 미설치)');
    console.log('     ⚠️ 건너뛴 것은 «문제없음» 이 아니다. `npm ci --legacy-peer-deps` 뒤 다시 돌릴 것.');
  }
}

if (mod) {
  const { goalOf, TOOL_GOALS, buildTodayPlan } = mod;
  check('goalOf 와 TOOL_GOALS 를 내보낸다', typeof goalOf === 'function' && !!TOOL_GOALS);

  const G = TOOL_GOALS.speech.goal;
  check('speech 목표가 정해져 있다(사장님 지정 5)', G === 5, G);

  // 경계값 — «닿았나» 를 실제로 물어본다
  const at = (n) => goalOf('speech', n);
  check('0개 → 달성 아님·count 0', at(0).count === 0 && at(0).reached === false);
  check('목표-1 → 달성 아님', at(G - 1).reached === false, at(G - 1));
  check('목표 정각 → 달성', at(G).reached === true, at(G));
  check('목표+1 → 달성(넘겨도 유지)', at(G + 1).reached === true, at(G + 1));
  check('음수·NaN·null 은 0 으로 본다', at(-3).count === 0 && at(NaN).count === 0 && at(null).count === 0);
  check('소수는 내림한다', at(4.9).count === 4 && at(4.9).reached === false);
  check('단위를 함께 준다(화면이 지어내지 않게)', at(1).unitKo === '문장' && at(1).unitEn === 'sentence');

  /* ── ② games — 2026-09-21 에 «판» → «문제» 로 바뀌었다 ──
     📜 이 자리에는 2026-09-21 오전까지 「games.goal 은 null 이다 ⛔ 숫자를 채우지 말 것」이
        있었다. 그 근거는 「한 판 중앙값이 40초라 «3판» 을 목표로 두면 들락날락도 «달성»」이었고
        그 반론은 지금도 옳다. ✅ 그런데 같은 날 오후에 세는 단위를 **`game_sessions.items`(학습 항목)**
        로 바꾸자 그 판은 items 0 이라 한 문제도 안 세어진다 — 반론이 그 자리에서 사라졌다.
        ⟹ 검사를 «느슨하게 푸는» 것이 아니라 **새 경계로 옮겨 적는다** — 「목표가 있다」 옆에
           **「«판» 이 아니라 «문제» 로 센다」**를 짝으로 둔다. ⛔ 단위를 «판» 으로 되돌리지 말 것. */
  console.log('\n② games — «판» 이 아니라 «문제» (2026-09-21 변경)');
  check('games 에 오늘 몫이 있다', TOOL_GOALS.games.goal >= 1, TOOL_GOALS.games);
  check('⛔ 단위가 «판» 으로 되돌아가지 않았다 — «문제» 로 센다',
        TOOL_GOALS.games.unitKo === '문제' && TOOL_GOALS.games.unitEn === 'question', TOOL_GOALS.games);
  const gG = TOOL_GOALS.games.goal;
  check('목표를 채우면 달성이라 말한다', goalOf('games', gG).reached === true, goalOf('games', gG));
  check('짝: 목표 미만은 달성이 아니다', goalOf('games', gG - 1).reached === false, goalOf('games', gG - 1));
  const g99 = goalOf('games', 99);
  check('그래도 개수는 싣는다(사실은 말한다)', g99.count === 99);
  /* «목표 없음» 길은 «표에 없는 도구» 로 남아 있다 — 새 도구가 표에 없을 때 그리로 떨어진다 */
  const unkTool = goalOf('__아직_표에_없는_도구__', 99);
  check('짝: 표에 없는 도구는 여전히 «목표 없음» 이고 달성이라 말하지 않는다',
        unkTool.goal === null && unkTool.reached === false, unkTool);
  // 짝 — 목표가 있는 도구는 여전히 달성한다(«전부 목표 없음» 으로 만드는 변이를 잡는다)
  const goalsSet = Object.keys(TOOL_GOALS).filter(k => TOOL_GOALS[k].goal != null);
  check('짝: 목표가 있는 도구가 여럿 남아 있다', goalsSet.length >= 7, goalsSet);
  check('짝: 모든 도구가 단위를 갖는다', Object.keys(TOOL_GOALS).every(k => !!TOOL_GOALS[k].unitKo && !!TOOL_GOALS[k].unitEn));
  /* 화면의 복수 규칙은 «-s·-z·-x·-ch·-sh → es», «자음+y → ies», 나머지 s 뿐이라
     불규칙 복수를 못 만든다(quiz → «quizes»). 그런 말을 표에 넣으면 에러 없이 화면에만
     없는 말이 나오므로, 아는 불규칙을 여기서 막는다. ⛔ 목록을 지우지 말 것. */
  const IRREGULAR = ['quiz', 'child', 'person', 'man', 'woman', 'foot', 'tooth', 'goose',
                     'mouse', 'leaf', 'life', 'half', 'knife', 'wolf', 'shelf'];
  const bad = Object.keys(TOOL_GOALS)
    .filter(k => IRREGULAR.includes(String(TOOL_GOALS[k].unitEn || '').toLowerCase()));
  check('단위에 불규칙 복수를 쓰지 않았다(화면 규칙이 못 만든다)', bad.length === 0, bad);
  /* goal 0 은 서버(«영영 미완료»)와 화면(`if (!g)` → «목표 없음»)이 다른 말을 하는 값이다.
     목표를 두지 않으려면 null 이다. */
  check('goal 은 null 이거나 1 이상이다(0 을 두지 않았다)',
        Object.keys(TOOL_GOALS).every(k => TOOL_GOALS[k].goal === null || TOOL_GOALS[k].goal >= 1),
        Object.keys(TOOL_GOALS).map(k => k + ':' + TOOL_GOALS[k].goal).join(' '));

  /* ── ③ 「완료」의 뜻 — 2026-09-21 에 «오늘 몫» 으로 바뀌었다 ──
     🔄 옛 경계는 「1마디만 해도 done 이 true」 였다. 그것을 «느슨하게 푼» 것이 아니라
        사람이 뜻을 바꾼 것이다 — 그대로 두면 화면이 「✓ 완료」 와 「3문장 더!」 를 나란히
        말하는 자기모순이 되고(2026-09-21 브라우저 실측), 「한 번 열면 완료」 자체가
        사장님이 고쳐 달라고 한 그것이다.
     ⛔ 옛 경계로 되돌리지 말 것. 아래 짝 검사가 그 방향을 막는다. */
  console.log('\n③ 「완료」의 뜻 — 오늘 몫을 채웠는가');
  const inp = (done) => ({ band: 3, textbook: null, zh: false, dow: 1, nowMin: 600,
                           classes: [], weekClassDows: [], done });
  const stepOf = (p, k) => p.steps.find(s => s.key === k);
  const one = stepOf(buildTodayPlan(inp({ friend: 1 })), 'friend');
  check('1마디만 하면 아직 «완료» 가 아니다', !!one && one.done === false, one && { c: one.count, g: one.goal });
  check('그래도 한 만큼은 싣는다(1마디)', !!one && one.count === 1);
  const full = stepOf(buildTodayPlan(inp({ friend: 5 })), 'friend');
  check('짝: 오늘 몫(5마디)을 채우면 «완료» 가 된다', !!full && full.done === true);
  check('짝: 넘겨도 «완료» 가 유지된다', stepOf(buildTodayPlan(inp({ friend: 9 })), 'friend').done === true);
  /* 목표가 없는 도구까지 false 로 떨어뜨리면 games 는 무엇을 해도 영영 «안 한 것» 이 된다 */
  /* 📜 2026-09-21: games 가 마지막으로 목표를 가졌다(표의 도구 아홉이 전부 goal 이 있다).
     ⟹ «목표가 없으면 한 번이라도면 완료» 갈래는 buildTodayPlan 으로는 더 닿지 않는다 —
     ⛔ 그렇다고 그 갈래를 지우지 말 것(표에 없는 새 도구가 그리로 떨어집니다). 두 줄로 나눠 본다. */
  const gm = stepOf(buildTodayPlan({ ...inp({ games: 1 }), dow: 0 }), 'games');
  check('games 도 이제 목표가 있다 — 1문제로는 완료가 아니다',
        !!gm && gm.goal >= 1 && gm.done === false, gm && { c: gm.count, g: gm.goal, d: gm.done });
  const gmF = stepOf(buildTodayPlan({ ...inp({ games: TOOL_GOALS.games.goal }), dow: 0 }), 'games');
  check('짝: 오늘 몫을 채우면 완료가 된다', !!gmF && gmF.done === true, gmF && { c: gmF.count, d: gmF.done });
  check('⛔ «목표가 없으면 한 번이라도» 갈래가 정본에 그대로 남아 있다(표에 없는 새 도구용)',
        /goal\s*!=\s*null\s*\)\s*\?\s*reached\s*:/.test(strip(tpSrc)), 'today-plan.ts');
  const gm0 = stepOf(buildTodayPlan({ ...inp({}), dow: 0 }), 'games');
  check('짝: 그 도구도 0개면 완료가 아니다', !!gm0 && gm0.done === false);
  const p0 = buildTodayPlan(inp({}));
  check('아무것도 안 했으면 count 0 · done false', p0.steps.every(s => s.count === 0 && s.done === false));
  check('doneCount 가 그 판정을 그대로 센다(홈 히어로도 같은 값을 읽는다)',
        buildTodayPlan(inp({ friend: 5 })).doneCount ===
        buildTodayPlan(inp({ friend: 5 })).steps.filter(s => s.done).length);
  check('모든 step 이 count·goal·unit 을 갖는다(레벨테스트 포함)',
        buildTodayPlan({ band: null, textbook: null, zh: false, dow: 1, nowMin: 600, classes: [], weekClassDows: [], done: {} })
          .steps.every(s => typeof s.count === 'number' && ('goal' in s) && !!s.unitKo));
  check('⛔ reached 칸을 다시 만들지 않았다(판정은 done 하나다)',
        !('reached' in (stepOf(buildTodayPlan(inp({ friend: 5 })), 'friend') || {})));
}
rmSync(tmp, { recursive: true, force: true });

/* ════════════════════════════════════════════════════════════════════
   ④ 화면 goalRow 를 오려 내 실제로 돌린다 — «무슨 글자가 나오는가»
   ════════════════════════════════════════════════════════════════════ */
console.log('\n④ 화면 goalRow — 오려 내 실제로 돌린다');
const body = fnBody(pageSrc, 'goalRow');
const uKo = fnBody(pageSrc, 'unitKo'), uEn = fnBody(pageSrc, 'unitEn');
check('전제: goalRow·unitKo·unitEn 을 잘라 냈다', !!body && !!uKo && !!uEn);
let goalRow = null;
if (body && uKo && uEn) {
  try {
    /* T·esc 는 그 파일의 최상위 헬퍼다 — 같은 규약으로 주입한다(화면 로직은 원본 그대로 돈다) */
    goalRow = new Function('T', 'esc', body + '\n' + uKo + '\n' + uEn + '\nreturn goalRow;')(
      (ko, en) => ko, (s) => String(s));
  } catch (e) { check('goalRow 를 평가할 수 있다', false, e.message); }
}
if (goalRow) {
  const step = (o) => Object.assign({ count: 0, goal: 5, unitKo: '문장', unitEn: 'sentence' }, o);
  const mid = goalRow(step({ count: 2 }), false, false);
  check('진행 중 — 남은 개수를 말한다', /2 \/ 5문장/.test(mid) && /3문장 더/.test(mid), mid.slice(0, 90));
  check('진행 중 — 막대를 그린다', /class="gtrack"/.test(mid) && /width:40%/.test(mid), mid.slice(0, 120));
  const hit = goalRow(step({ count: 5 }), false, false);
  check('달성 — «오늘 몫 끝» 이라고 말한다', /오늘 몫 끝/.test(hit), hit.slice(0, 90));
  check('달성 — 막대가 100% 이고 색이 바뀐다', /width:100%/.test(hit) && /gfill hit/.test(hit));
  const over = goalRow(step({ count: 9 }), false, false);
  check('넘겨도 막대가 100% 를 안 넘는다', /width:100%/.test(over) && !/width:1[1-9]\d/.test(over));
  // 짝 — 목표 없는 도구
  const noGoal = goalRow(step({ goal: null, count: 3, unitKo: '판', unitEn: 'round' }), false, false);
  /* ⚠️ 여기서 «/» 하나로 물으면 안 된다 — 닫는 태그 «</p>» 의 슬래시가 걸려 멀쩡한 코드가
     FAIL 난다(2026-09-21 실제로 밟았다). 물어야 할 것은 «2 / 5» 라는 진행 모양이다. */
  check('목표 없음 — 개수만 말하고 «남았다» 고 안 한다',
        /3판/.test(noGoal) && !/더!/.test(noGoal) && !/\d+\s*\/\s*\d+/.test(noGoal), noGoal);
  check('목표 없음 — 막대를 안 그린다(채울 목표가 없으므로)', !/gtrack/.test(noGoal));
  const noGoalZero = goalRow(step({ goal: null, count: 0 }), false, false);
  check('목표 없음 + 0개 — 아무 말도 안 한다', noGoalZero === '', noGoalZero);
  // 짝 — 맛보기
  const smp = goalRow(step({ count: 0 }), true, false);
  check('맛보기 — 목표만 말하고 «0 / 5» 는 안 쓴다', /오늘 몫 5문장/.test(smp) && !/0 \/ 5/.test(smp), smp);
  check('맛보기 — 막대를 안 그린다(남의 기록이 없는 화면)', !/gtrack/.test(smp));
  // 짝 — 맛보기가 아니면 진행을 그린다(«전부 감추기» 변이를 잡는다)
  check('짝: 맛보기가 아니면 진행을 그린다', /gtrack/.test(mid));
  // 영어 복수
  const goalRowEn = new Function('T', 'esc', body + '\n' + uKo + '\n' + uEn + '\nreturn goalRow;')(
    (ko, en) => en, (s) => String(s));
  const e1 = goalRowEn(step({ count: 1 }), false, true);
  check('영어 — 1이면 단수, 여럿이면 복수', /1 \/ 5 sentences/.test(e1) && /4 to go/.test(e1), e1.slice(0, 90));

  /* ⚠️ 위 한 줄은 «sentence» 하나만 본다 — 그 말은 s 만 붙이면 맞아서, «-s·-z·-x·-ch·-sh 면 es»
     규칙이 통째로 죽어도 통과한다(실제로 그 상태였다: quiz → «quizs»). 그래서 규칙이 갈리는
     말들을 직접 넣어 본다. 짝으로 «규칙이 필요 없는 말은 예전 그대로» 도 함께 본다. */
  let unitEnFn = null;
  try { unitEnFn = new Function(uEn + '\nreturn unitEn;')(); } catch (e) {}
  check('전제: unitEn 을 따로 평가했다', typeof unitEnFn === 'function');
  if (unitEnFn) {
    const pl = (u, n) => unitEnFn({ unitEn: u }, n);
    check('영어 복수 — 하나면 규칙을 안 쓴다', pl('quiz', 1) === 'quiz' && pl('round', 1) === 'round');
    check('영어 복수 — -s·-z·-x·-ch·-sh 는 es', [
      ['pass', 'passes'], ['quiz', 'quizes'], ['box', 'boxes'], ['match', 'matches'], ['dash', 'dashes'],
    ].every(([a, b]) => pl(a, 2) === b), [pl('pass', 2), pl('quiz', 2), pl('box', 2), pl('match', 2), pl('dash', 2)]);
    check('영어 복수 — 자음+y 는 ies', pl('story', 2) === 'stories' && pl('try', 3) === 'tries',
          [pl('story', 2), pl('try', 3)]);
    check('짝: 모음+y 는 그냥 s (day → days)', pl('day', 2) === 'days', pl('day', 2));
    check('짝: 평범한 말은 예전 그대로 s', [
      ['sentence', 'sentences'], ['word', 'words'], ['turn', 'turns'], ['round', 'rounds'],
      ['question', 'questions'], ['session', 'sessions'], ['piece', 'pieces'],
    ].every(([a, b]) => pl(a, 2) === b));
    /* ⛔ 이 규칙은 불규칙 복수(quiz → quizzes)를 «못» 만든다 — 위 기대값이 «quizes» 인 것은
       그것이 옳아서가 아니라 «지금 규칙이 그렇다» 를 못 박은 것이다. 그래서 TOOL_GOALS 의
       단위는 규칙으로 되는 말만 쓴다(아래 ②절이 그것을 검사한다). */
  }
}

/* ════════════════════════════════════════════════════════════════════
   ⑤ 화면이 목표 숫자를 다시 적지 않았다
   ════════════════════════════════════════════════════════════════════ */
console.log('\n⑤ 숫자를 두 곳에 적지 않았다');
const pageCode = strip(pageSrc);
const rowCode = fnBody(pageCode, 'goalRow') || '';
check('전제: 주석 벗긴 사본에서도 goalRow 를 잘라 냈다', rowCode.length > 200, rowCode.length);
// goalRow 안에 «목표로 쓰일 법한 맨숫자» 가 없어야 한다. 0·1·100(퍼센트 clamp)만 허용.
const nums = [...rowCode.matchAll(/(?<![\w.])(\d+)(?![\w%])/g)].map(m => Number(m[1]))
  .filter(n => ![0, 1, 100].includes(n));
check('goalRow 안에 목표 숫자를 손으로 적지 않았다', nums.length === 0, nums);
check('goal 은 서버가 준 값을 쓴다', /s\.goal/.test(rowCode));
check('단위도 서버가 준 값을 쓴다', /s\.unitKo/.test(strip(pageSrc)) && /s\.unitEn/.test(strip(pageSrc)));

/* 세 갈래(맛보기·목표없음·보통)가 모두 글자를 esc 로 감싼다 — 한 갈래만 빼도 그 갈래로
   오는 단위·문구가 날것으로 나간다. ⚠️ ④절은 esc 를 «그대로 돌려주는» 가짜로 바꿔 돌리므로
   원리상 이것을 못 본다(그래서 여기서 «모양» 으로 센다). */
const escCalls = (rowCode.match(/esc\(/g) || []).length;
const retCalls = (rowCode.match(/return\s+'<p/g) || []).length;
check('goalRow 의 모든 갈래가 esc 를 지난다', escCalls >= 3 && escCalls >= retCalls,
      { esc: escCalls, returns: retCalls });

/* ════════════════════════════════════════════════════════════════════
   ⑥ 막대가 «인라인» 이 아니다 + 0 을 폭 0 으로 안 그린다
   ════════════════════════════════════════════════════════════════════ */
console.log('\n⑥ 막대 — 인라인 함정·폭 0 함정');
const css = strip(htmlSrc);
const rule = (sel) => {
  const at = css.indexOf(sel); if (at < 0) return '';
  const open = css.indexOf('{', at), close = css.indexOf('}', open);
  return (open < 0 || close < 0) ? '' : css.slice(open, close);
};
const fill = rule('.step .gfill'), track = rule('.step .gtrack');
check('.gfill 이 인라인이 아니다(display 를 명시했다)', /display\s*:\s*(block|flex|grid|inline-block)/.test(fill), fill.trim().slice(0, 80));
check('.gtrack 도 인라인이 아니다', /display\s*:\s*(block|flex|grid|inline-block)/.test(track), track.trim().slice(0, 80));
check('0 을 폭 0 으로 안 그린다(min-width)', /min-width\s*:\s*[1-9]/.test(fill), fill.trim().slice(0, 80));
check('.gfill 에 높이가 있다', /height/.test(fill));
check('달성 색이 진행 색과 다르다', rule('.step .gfill.hit').length > 0);

/* ════════════════════════════════════════════════════════════════════
   ⑦ 헬퍼가 스크립트 최상위에 있다(함수 «안» 에 숨지 않았다)
   ════════════════════════════════════════════════════════════════════ */
console.log('\n⑦ 선언 위치 — 최상위인가');
function depthAt(src, needle) {
  const at = src.indexOf(needle); if (at < 0) return -1;
  let d = 0;
  for (let i = 0; i < at; i++) { if (src[i] === '{') d++; else if (src[i] === '}') d--; }
  return d;
}
/* 중괄호 깊이를 세려면 «문자열 안» 의 괄호를 빼야 한다.
   ⛔ 정규식 한 줄로 문자열을 지우지 말 것 — 이 파일은 HTML 을 따옴표로 조립해서
      짝이 어긋나면 코드를 통째로 먹고, 그러면 찾는 함수가 «없다»(-1)로 나온다
      (2026-09-21 실제로 밟았다. CLAUDE.md 2장 「블록주석을 정규식 한 줄로 지웠더니」의 형제).
   ✅ 글자를 훑으며 «지금 문자열 안인가» 를 추적한다. */
function blankStrings(src) {
  let out = '', q = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '\\') { i++; continue; }
      if (ch === q) { q = null; out += ch; } else out += ' ';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; out += ch; continue; }
    out += ch;
  }
  return out;
}
/**
 * 중괄호 깊이를 세려면 «주석 안» 과 «문자열 안» 의 괄호를 둘 다 빼야 한다.
 * 🔴 둘을 «따로» 돌리면 어느 순서로 해도 깨진다 — 2026-09-21 에 두 번 다 밟았다:
 *    · 주석부터 → 코드 안 '…//…'(URL) 를 주석으로 보고 줄을 잘라 **따옴표 짝** 이 깨진다
 *    · 문자열부터 → 주석 안의 백틱·따옴표(이 파일 114행의 `students_erp.level`)를
 *      문자열 시작으로 보고 **파일 나머지가 통째로 문자열** 이 된다
 *    두 경우 다 찾는 함수가 «없다»(-1) 로 나와, 멀쩡한 코드가 FAIL 난다.
 * ✅ 한 번만 훑으면서 «지금 주석 안인가 · 문자열 안인가» 를 **함께** 추적한다
 *    (CLAUDE.md 2장 「글자를 훑으며 블록 안인가·문자열 안인가를 함께 추적하세요」).
 * ⚠️ 정규식 리터럴도 «반드시» 가려야 한다 — 이 파일의 esc() 안에 /[&<>"']/ 가 있어서,
 *    안 가리면 그 따옴표를 문자열 시작으로 보고 **파일 끝까지 갇힌다**(2026-09-21 실측).
 *    ⛔ 「`= /` 로 찾아 보니 없더라」로 넘기지 말 것 — 나는 그렇게 적었다가 세 번째로 밟았다.
 */
function codeShell(src) {
  let out = '', q = null, block = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (block) { if (c === '*' && n === '/') { block = false; out += '  '; i++; } else out += (c === '\n' ? '\n' : ' '); continue; }
    if (q) {
      if (c === '\\') { out += '  '; i++; continue; }
      if (c === q) { q = null; out += c; } else out += (c === '\n' ? '\n' : ' ');
      continue;
    }
    if (c === '/' && n === '*') { block = true; out += '  '; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } out += '\n'; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; continue; }
    /* 정규식 리터럴 — «나눗셈» 과 가르는 실용 규칙: 직전 의미 글자가 연산자·여는 괄호면 정규식 */
    if (c === '/') {
      let j = out.length - 1;
      while (j >= 0 && /\s/.test(out[j])) j--;
      const prev = j >= 0 ? out[j] : '(';
      if ('(,=:[!&|?{};+*%~^<>'.includes(prev)) {
        out += ' ';
        for (i++; i < src.length; i++) {
          if (src[i] === '\\') { out += '  '; i++; continue; }
          if (src[i] === '[') { while (i < src.length && src[i] !== ']') { out += ' '; i++; } }
          if (src[i] === '/' || src[i] === '\n') break;
          out += ' ';
        }
        out += ' ';
        continue;
      }
    }
    out += c;
  }
  return out;
}
const codeOnly = codeShell(pageSrc);
const dRow = depthAt(codeOnly, 'function goalRow');
const dEsc = depthAt(codeOnly, 'function esc');   // 이 파일의 «최상위» 기준점(IIFE 안)
check('전제: 기준점 esc 를 찾았다', dEsc >= 0, dEsc);
check('goalRow 가 esc 와 같은 깊이다(= 최상위)', dRow === dEsc, { goalRow: dRow, esc: dEsc });
check('unitKo·unitEn 도 최상위다',
      depthAt(codeOnly, 'function unitKo') === dEsc && depthAt(codeOnly, 'function unitEn') === dEsc);

/* ════════════════════════════════════════════════════════════════════
   ⑧ 고친 js 의 ?v= 가 함께 올라갔다
   ════════════════════════════════════════════════════════════════════ */
console.log('\n⑧ 캐시 버전');
const m = htmlSrc.match(/today-page\.js\?v=(\d+)/);
check('today.html 이 today-page.js 를 ?v= 로 부른다', !!m, m && m[0]);
check('버전이 8보다 크다(이번 수정분이 반영되게)', !!m && Number(m[1]) >= 9, m && m[1]);
check('goalRow 가 화면 카드에서 실제로 불린다', /goalRow\(s,/.test(strip(pageSrc)));

console.log('\n─────────────────────────────────────────────');
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}` + (SKIPPED ? ` / SKIP ${SKIPPED}(환경)` : ''));
if (FAIL > 0) { console.log('⚠ 실제 확인 필요'); process.exit(1); }
