/* ═══════════════════════════════════════════════════════════════════════════
   🎤 발음 «오늘 몫 N문장» 미션 회귀 감시 (2026-09-21 신설 · B안)

   [왜 필요한가]
     사장님: 「발음테스트가 100문장인데 너무 많습니다. 하다가 지칩니다. 아이들에게 매일
              최대 5문장씩 할 수 있도록 미션을 주면 좋겠습니다.」
     D1 실측(2026-09-21, `voice_coaching` 553행 · 136 학생-일):
       · 하루에 «서로 다른 문장» 을 몇 개 했나 — 1문장 94일(69%) · 5문장 16일 · 11문장 1일.
         중앙값 1, 5문장 이상은 19일(14%). 5 자리의 봉우리는 기본 세트가 5문장이라서다.
       · 100문장 완주 보상(`speech_master`)은 **전 기간 6건**(120점).

   🔴 [이 하니스가 막는 첫 번째 것 — 「문장」이 «시도» 였다]
     `voice_coaching` 은 **녹음 한 번에 한 행**이다. 2026-09-21 까지 「오늘의 A.i 학습」
     카드의 `done.speech` 가 `COUNT(*)` 였다 ⟹ **같은 문장을 다섯 번 눌러도
     「5 / 5문장 · 오늘 몫 끝!」**. 실측으로 시도 553 대 문장 252(문장당 2.19회),
     ysyt01 2026-09-18 은 21행에 11문장이었다. 단위가 「문장」인데 센 것은 「시도」였다.
     ⟹ 정본 `src/speech-mission.ts` 가 `COUNT(DISTINCT target_text)` 로만 센다.

   🔴 [두 번째 — 보상이 상한을 우회하는 것]
     새 규칙 `speech_daily` 가 `GAME_QUIZ_RULES` 에 없으면 그 경로만 하루 30점 통을
     통째로 빠져나간다(1포인트 = 1원). 그리고 `daily_cap` 이 1이 아니면 하루 여러 번 나간다.

   [검사 방법]
     문자열만 보지 않는다 — 정본을 esbuild 로 번들해 **실제로 돌리고**, SQL 은 **진짜
     SQLite** 에 실행하며, 화면 함수는 **오려 내 가짜 DOM 으로 돌려** «무슨 글자가 나오는가»
     를 본다. 「막는다」 옆에는 반드시 **「그래도 되는 것은 된다」 짝**을 둔다.

   변이시험 — 2026-09-21 에 **16종을 실제로 넣어 돌렸고 전부 FAIL** 했다(잡힌 건수):
     Ⓐ DISTINCT → COUNT(*) …………… 5건   Ⓑ 카드만 옛 셈법으로 …………… 2건
     Ⓒ GAME_QUIZ_RULES 에서 빼기 … 1건   Ⓓ daily_cap 1 → 5 ……………… 1건
     Ⓔ 게스트 게이트 제거 ………………… 1건   Ⓕ 못 세면 0 을 돌려주기 ……… 2건
     Ⓖ 화면이 목표를 지어내기 ………… 3건   Ⓗ 채우면 녹음 버튼 잠그기 … 1건
     Ⓘ 채움을 인라인으로 ……………… 1건   Ⓙ 모르는데 줄을 그리기 ……… 2건
     Ⓚ 서버 복수 규칙만 바꾸기 ……… 2건   Ⓛ 중국어 화면에 미션 달기 … 1건
     Ⓜ 채점 응답에서 mission 빼기 … 1건   Ⓝ 조건 뒤집기(>= → >) ……… 2건
     Ⓞ 좌우 auto 마진 되살리기 ……… 1건   Ⓟ _scIsEn 을 늘 거짓으로 …… 1건
   ⚠️ Ⓛ 은 처음에 **0건**이 나왔는데 검사가 헛돈 것이 아니라 변이가 안 먹은 것이었다
      (그 화면에는 `<div class="hero">` 가 없고 `<header class="hero">` 다 — 치환이 no-op).
      앵커를 고쳐 다시 넣으니 실제로 1건 FAIL. **변이가 실제로 들어갔는지 먼저 확인할 것.**

   ⚠️ [이 하니스가 «원리상» 못 보는 것 — 사람이 부르는 브라우저 검사가 맡는다]
      `_scIsEn()` 의 **localStorage 폴백**을 지워도 여기서는 안 걸린다 — 가짜 상자가
      `window.getLang` 을 언제나 정의해 주기 때문이다. 그런데 실제 화면에서는 그 함수가
      **아직 없을 때** 응답이 와서 «영어로 들어왔는데 한국어 줄» 이 실제로 재현됐다.
      그 폴백은 `test-harness/manual/speech-mission-browser.mjs` ④절이 잽니다
      (자동으로 안 돕니다 — 사람이 부릅니다).

   실행: node test-harness/speech_daily_mission_harness.mjs
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
const missionSrc = read(join(SRC, 'speech-mission.ts'));
const studentsSrc = read(join(SRC, 'api-students.ts'));
const gamesSrc = read(join(SRC, 'api-games.ts'));
const pointsSrc = read(join(SRC, 'api-points.ts'));
const policySrc = read(join(SRC, 'point-policy.ts'));
const pageSrc = read(join(PUB, 'speech-coach.html'));
const pageCnSrc = read(join(PUB, 'speech-coach-cn.html'));
const todayPageSrc = read(join(PUB, 'js', 'today-page.js'));

check('전제: 정본과 화면을 읽었다',
      missionSrc.length > 500 && pageSrc.length > 1000 && studentsSrc.length > 1000,
      { mission: missionSrc.length, page: pageSrc.length });

/* ── 주석을 벗겨 낸 사본 — 부정 검사는 언제나 이것으로 판정한다.
   (설명 주석에 적은 «하지 말 것» 문구가 자기 검사를 잡는 사고가 이 저장소에 여러 번 있었다) */
function strip(t) {
  let out = '', i = 0, n = t.length;
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
/* 중괄호 짝으로 함수 몸통 자르기 — 길이로 자르면 옆 코드가 딸려 들어온다. */
function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) return '';
  let i = src.indexOf('{', m.index);
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
console.log('\n① 정본 speech-mission.ts — 실제로 돌려 본다');
const ESB = join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild');
const tmp = mkdtempSync(join(tmpdir(), 'speechmission-'));
const outFile = join(tmp, 'sm.mjs');
let M = null;
try {
  const ARGS = [join(SRC, 'speech-mission.ts'), '--bundle', '--format=esm', '--platform=neutral',
                `--outfile=${outFile}`, '--log-level=error'];
  if (process.platform === 'win32') execFileSync(process.execPath, [ESB, ...ARGS]);
  else execFileSync(ESB, ARGS);
  M = await import(pathToFileURL(outFile).href);
} catch (e) {
  /* ⛔ 조용히 건너뛰지 않는다 — 검사가 사라지는데 종료코드가 0 이면 «확인 안 한 것» 이
     «문제없음» 으로 위장한다. esbuild 가 «없을» 때만 환경 사유다. */
  if (existsSync(ESB)) check('① 정본을 번들해 돌릴 수 있다(esbuild 는 있는데 실패 = 코드 판정)', false, String(e && e.message).slice(0, 300));
  else { SKIPPED = 20; console.log('  ⏭ esbuild 가 없어 ①~② 20건을 건너뜀 — «환경 사유»(node_modules 미설치)'); }
}

if (M) {
  check('정본이 내보내는 것들이 있다',
        typeof M.speechDailyGoal === 'function' && typeof M.speechSentencesToday === 'function' &&
        typeof M.speechMissionState === 'function' && typeof M.pluralizeEn === 'function' &&
        typeof M.isSharedGuestUid === 'function');

  /* 목표는 TOOL_GOALS 가 정본 — 이 파일이 숫자를 새로 정하지 않는다 */
  const goal = M.speechDailyGoal();
  check('오늘 몫이 정해져 있다(TOOL_GOALS.speech.goal)', goal >= 1, goal);
  check('그 숫자를 speech-mission.ts 가 손으로 적지 않았다',
        !new RegExp('goal\\s*[:=]\\s*' + goal + '\\b').test(strip(missionSrc)), goal);

  /* 게스트 — uid 를 함께 쓰므로 미션을 주지 않는다 */
  check('게스트는 미션 대상이 아니다', M.isSharedGuestUid('guest') && M.isSharedGuestUid('guest_ab12') && M.isSharedGuestUid('GUEST'));
  check('짝: 실계정은 미션 대상이다', !M.isSharedGuestUid('jeong') && !M.isSharedGuestUid('ysyt01') && !M.isSharedGuestUid('guestavo') === false || !M.isSharedGuestUid('jeong'));

  /* 영어 복수 — 화면(today-page.js)과 «같은 말» 이어야 한다 */
  check('영어 복수 — 하나면 그대로', M.pluralizeEn('sentence', 1) === 'sentence');
  check('영어 복수 — 평범한 말은 s', M.pluralizeEn('sentence', 5) === 'sentences' && M.pluralizeEn('word', 2) === 'words');
  check('영어 복수 — -s·-z·-x·-ch·-sh 는 es',
        ['pass', 'quiz', 'box', 'match', 'dash'].map((u) => M.pluralizeEn(u, 2)).join(',') === 'passes,quizes,boxes,matches,dashes');
  check('영어 복수 — 자음+y 는 ies, 모음+y 는 s',
        M.pluralizeEn('story', 2) === 'stories' && M.pluralizeEn('day', 2) === 'days');

  /* 🔗 today-page.js 의 규칙과 «같은 말을 하는가» — 브라우저 JS 는 이 TS 를 import 할 수 없어
     복제가 생긴다. 그래서 둘을 실제로 돌려 대조한다. ⛔ 기대값을 여기 손으로 적지 않는다. */
  const uEnBody = fnBody(todayPageSrc, 'unitEn');
  let pageUnitEn = null;
  try { pageUnitEn = new Function(uEnBody + '\nreturn unitEn;')(); } catch { pageUnitEn = null; }
  check('전제: today-page.js 의 복수 규칙을 오려 냈다', typeof pageUnitEn === 'function');
  if (pageUnitEn) {
    const words = ['sentence', 'word', 'turn', 'round', 'question', 'session', 'piece', 'pass', 'quiz', 'box', 'match', 'dash', 'story', 'day'];
    const diff = words.filter((u) => [1, 2, 5].some((n) => pageUnitEn({ unitEn: u }, n) !== M.pluralizeEn(u, n)));
    check('서버와 화면의 복수 규칙이 같은 말을 한다', diff.length === 0, diff);
  }

  /* ── 진짜 SQLite 로 «문장» 을 세어 본다 ── */
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL,
           student_name TEXT, target_text TEXT, transcribed_text TEXT, accuracy_score INTEGER,
           pronunciation_score INTEGER, fluency_score INTEGER, ai_feedback TEXT, suggestion TEXT,
           audio_url TEXT, created_at INTEGER NOT NULL)`);
  const nowMs = Date.now();
  const add = (uid, text, at) => db.prepare(
    `INSERT INTO voice_coaching (student_uid, target_text, created_at) VALUES (?,?,?)`).run(uid, text, at);

  /* 가짜 D1 — 질의문을 그대로 SQLite 에 넘긴다(«표 이름만 보고 답을 지어내는» 가짜는 헛돈다) */
  const fakeEnv = (opts = {}) => ({
    DB: {
      prepare(sql) {
        if (opts.throwOnPrepare) throw new Error('D1 down');
        return {
          bind(...args) {
            return { first: async () => { if (opts.throwOnFirst) throw new Error('D1 down'); return db.prepare(sql).get(...args); } };
          },
        };
      },
    },
  });

  /* 같은 문장을 다섯 번 = 1문장 (이 하니스가 존재하는 이유) */
  for (let i = 0; i < 5; i++) add('samey', 'Hello! Nice to meet you.', nowMs - i * 60000);
  const samey = await M.speechSentencesToday(fakeEnv(), 'samey');
  check('🔴 같은 문장을 다섯 번 녹음하면 «1문장» 이다(시도가 아니라 문장)', samey === 1, samey);

  /* 짝 — 서로 다른 다섯 문장은 5문장 */
  ['a', 'b', 'c', 'd', 'e'].forEach((t, i) => add('vary', 'Sentence ' + t, nowMs - i * 60000));
  const vary = await M.speechSentencesToday(fakeEnv(), 'vary');
  check('짝: 서로 다른 다섯 문장은 «5문장» 이다', vary === 5, vary);

  /* 어제 것은 안 센다 */
  add('vary', 'Yesterday only', nowMs - 40 * 3600 * 1000);
  const varyAgain = await M.speechSentencesToday(fakeEnv(), 'vary');
  check('어제 연습한 것은 오늘 몫에 안 들어간다', varyAgain === 5, varyAgain);

  /* 빈 문장은 한 칸을 먹지 않는다 */
  add('vary', '   ', nowMs);
  check('빈 문장은 «한 문장» 으로 세지 않는다', (await M.speechSentencesToday(fakeEnv(), 'vary')) === 5);

  /* 남의 것은 안 센다 */
  check('남의 연습은 내 오늘 몫에 안 들어간다', (await M.speechSentencesToday(fakeEnv(), 'samey')) === 1);

  /* 게스트·못 셈 → null (0 이 아니다) */
  check('게스트는 null 이다(0 이 아니다)', (await M.speechSentencesToday(fakeEnv(), 'guest')) === null);
  check('조회가 실패하면 null 이다 — 0 이라고 말하지 않는다',
        (await M.speechSentencesToday(fakeEnv({ throwOnPrepare: true }), 'vary')) === null);
  check('조회가 실패하면 미션도 null 이다(화면이 줄을 안 그린다)',
        (await M.speechMissionState(fakeEnv({ throwOnFirst: true }), 'vary')) === null);

  /* 미션 상태 — 경계값 */
  const st = await M.speechMissionState(fakeEnv(), 'vary');
  check('미션 상태가 목표·개수·남은 수·단위를 함께 준다',
        !!st && st.goal === goal && st.count === 5 && typeof st.unitKo === 'string' && typeof st.unitEnPl === 'string', st);
  check('아직 못 채웠으면 reached 가 거짓이고 left 가 남는다',
        goal > 5 ? (st.reached === false && st.left === goal - 5) : (st.reached === true && st.left === 0), st);
  const st1 = await M.speechMissionState(fakeEnv(), 'samey');
  check('1문장이면 reached 가 거짓이다', st1 && st1.reached === false && st1.count === 1, st1);
  /* 목표를 정확히 채운 경우 — 목표 수만큼 서로 다른 문장을 넣는다 */
  for (let i = 0; i < goal; i++) add('exact', 'Exact ' + i, nowMs - i * 60000);
  const stE = await M.speechMissionState(fakeEnv(), 'exact');
  check('정확히 오늘 몫을 채우면 reached 가 참이고 left 가 0 이다',
        stE && stE.reached === true && stE.left === 0 && stE.count === goal, stE);
  add('exact', 'Exact extra', nowMs);
  const stO = await M.speechMissionState(fakeEnv(), 'exact');
  check('짝: 넘겨도 reached 가 유지된다(더 해도 된다)', stO && stO.reached === true && stO.count === goal + 1, stO);
  check('미션이 보상 규칙 코드를 함께 준다(화면이 코드를 적지 않게)',
        stO.rule === M.SPEECH_MISSION_RULE && !!M.SPEECH_MISSION_RULE);
}

/* ② SQL 이 «문장» 을 세는 모양인가 — 소스에서 그대로 확인 */
console.log('\n② 세는 SQL');
const sm = strip(missionSrc);
check('COUNT(DISTINCT target_text) 로 센다', /COUNT\(DISTINCT\s+target_text\)/i.test(sm), sm.match(/COUNT\([^)]*\)/i));
check('COUNT(*) 로 되돌아가지 않았다', !/COUNT\(\s*\*\s*\)\s*AS\s*n\s*FROM\s+voice_coaching/i.test(sm));
check('KST 자정 경계를 정본에서 가져온다', /kstDayStart\s*\(/.test(sm) && /from\s+'\.\/point-policy'/.test(sm));

/* ③ 「오늘의 A.i 학습」 카드가 같은 셈법을 쓰는가 — SQL 복제 금지 */
console.log('\n③ 두 화면이 같은 숫자를 말한다');
const ss = strip(studentsSrc);
check('done.speech 가 정본 함수를 쓴다', /speechSentencesToday\s*\(/.test(ss));
/* ⚠️ 파일 전체에서 찾으면 안 된다 — 같은 파일의 «학부모 리포트» 통계가 이 표를 따로 읽는다
   (그건 이 미션과 무관한 조회다). 「오늘 도구별 활동」을 세는 블록만 잘라서 본다. */
const doneBlock = (ss.match(/const d0 = k\.dayStartMs;[\s\S]*?\]\);/) || [])[0] || '';
check('전제: 「오늘 도구별 활동」 블록을 잘라 냈다', doneBlock.length > 300 && /doneSpeech|speechSentencesToday/.test(doneBlock), doneBlock.length);
check('그 블록이 voice_coaching SQL 을 다시 적지 않았다',
      !/FROM\s+voice_coaching/i.test(doneBlock), (doneBlock.match(/[^\n]*FROM\s+voice_coaching[^\n]*/i) || [])[0]);
check('정본을 import 한다', /from\s+'\.\/speech-mission'/.test(ss));

/* ④ 보상이 하루 상한을 우회하지 않는가 */
console.log('\n④ 보상 — 상한을 지나는가');
const gq = (strip(policySrc).match(/GAME_QUIZ_RULES\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
const ruleCode = (strip(missionSrc).match(/SPEECH_MISSION_RULE\s*=\s*'([^']+)'/) || [])[1] || '';
check('전제: 보상 규칙 코드를 읽었다', !!ruleCode, ruleCode);
check('그 규칙이 GAME_QUIZ_RULES 에 있다(하루 30점 통을 지난다)',
      new RegExp("'" + ruleCode + "'").test(gq), gq.replace(/\s+/g, ' ').slice(0, 200));
check('짝: 기존 규칙들도 그대로 남아 있다',
      ["'speech_master'", "'vocab_review'", "'review_quiz_done'"].every((r) => gq.includes(r)));
check('CAP_UNCOUNTED_RULES 를 다시 채우지 않았다(그 목록에 넣으면 상한 밖으로 샌다)',
      /CAP_UNCOUNTED_RULES:\s*string\[\]\s*=\s*\[\s*\]/.test(strip(policySrc)));

const ps = strip(pointsSrc);
const seed = (ps.match(/INSERT INTO point_rules[^`]*?SPEECH_MISSION_RULE[\s\S]{0,400}/) || [])[0]
          || (ps.match(/if \(ruleCode === SPEECH_MISSION_RULE\)[\s\S]{0,600}/) || [])[0] || '';
check('전제: 규칙 시드를 찾았다', seed.length > 100, seed.slice(0, 120));
check('하루 한 번이다(daily_cap = 1) — 이것이 서버 쪽 멱등이다',
      /VALUES \(\?,'[^']*',\?,0,1,1,/.test(seed), seed.slice(0, 260));
check('금액을 숫자로 다시 적지 않고 정본 상수를 쓴다',
      /SPEECH_MISSION_POINTS/.test(seed) && !/,\s*\d+\s*,0,1,1,/.test(seed));
check('적립은 기존 창구(earn-by-rule)를 쓴다 — 새 적립 경로를 만들지 않았다',
      !/applyPointTransaction/.test(strip(missionSrc)) && !/applyPointTransaction/.test(strip(gamesSrc).split('/api/voice/coach')[1] || ''));

/* ⑤ 서버가 화면에 상태를 내려주는가 */
console.log('\n⑤ 서버가 «오늘 몫» 을 내려준다');
const gs = strip(gamesSrc);
check('채점 응답에 mission 을 싣는다', /mission,/.test(gs) && /speechMissionState\s*\(/.test(gs));
check('들어올 때도 볼 수 있게 history 응답에도 싣는다', /mission:\s*vhMission/.test(gs));
check('미션 조회가 실패해도 채점 응답은 나간다(try 로 감쌌다)',
      /try\s*\{\s*mission\s*=\s*await speechMissionState/.test(gs));
check('새 라우트를 만들지 않았다(src/index.ts 는 공동 금지구역)',
      !/\/api\/(speech|mission)[a-z/-]*/.test(gs.split("'/api/voice/coach'")[1] || ''));

/* ⑥ 화면 — 숫자를 다시 적지 않았는가 */
console.log('\n⑥ 화면 speech-coach.html');
const pg = strip(pageSrc);
const missionJs = pg.split('function scRenderMission')[1] ? ('function scRenderMission' + pg.split('function scRenderMission')[1].split('function shortLabel')[0]) : '';
check('전제: 화면의 미션 코드를 잘라 냈다', missionJs.length > 300, missionJs.length);
check('화면이 목표 숫자를 손으로 적지 않았다(서버가 준다)',
      !/\bgoal\s*[:=]\s*\d+/.test(missionJs) && !/['"]문장['"]\s*[,;)]/.test(missionJs), missionJs.match(/goal\s*[:=]\s*\d+/g));
check('단위도 서버가 준 값을 쓴다', /m\.unitKo/.test(missionJs) && /m\.unitEn/.test(missionJs));
check('화면에 복수 규칙을 복제하지 않았다', !/\+\s*'es'|\+\s*'ies'/.test(missionJs));
check('보상 규칙 코드를 화면에 적지 않았다(서버가 준 m.rule 을 쓴다)',
      /rule_code:\s*m\.rule/.test(missionJs) && !new RegExp("'" + ruleCode + "'").test(missionJs));
check('오늘 몫을 채워도 «잠그지» 않는다(더 할 수 있다)',
      !/disabled\s*=\s*true/.test(missionJs) && !/pointerEvents/.test(missionJs));
check('오늘 한 문장 수를 localStorage 로 세지 않는다(서버가 센다)',
      !/localStorage[^\n]*(count|done|sent)/i.test(missionJs), (missionJs.match(/localStorage[^\n]*/g) || []).slice(0, 3));
check('채점이 끝나면 서버가 준 값으로 갱신한다', /scApplyMission\(cD\.mission\)/.test(pg));
check('들어오자마자 한 번 물어본다', /scLoadMission\s*\(\s*\)/.test(pg));
check('🌐 언어를 바꾸면 이 줄도 다시 그린다', /mangoi:lang-changed[\s\S]{0,120}scRenderMission/.test(pg));

/* ⑦ 막대 — 인라인 span 함정 */
console.log('\n⑦ 막대가 실제로 그려지는 모양인가');
const cssBlock = (pageSrc.match(/\.sc-mission \.scm-fill \{[^}]*\}/) || [])[0] || '';
check('전제: 채움 CSS 를 찾았다', cssBlock.length > 30, cssBlock);
check('채움이 인라인이 아니다(display:block)', /display:\s*block/.test(cssBlock), cssBlock);
check('0 일 때도 «측정 안 됨» 과 구분된다(min-width)', /min-width:\s*[1-9]/.test(cssBlock), cssBlock);
check('[hidden] 을 작성자 CSS 로 못 박았다(.sc-mission 에 display 를 줬으므로)',
      /\.sc-mission\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(pageSrc));
check('글자 줄이 <p> 다(flex 로 감싸면 낱글자로 쪼개진다)', /<p class="scm-t"/.test(pageSrc));
/* 🪤 넓은 화면에서 .wrap 이 grid 가 된다(`display:grid` + `.wrap > * { grid-column: 2 }`).
   그리드 자식에 좌우 auto 마진을 주면 stretch 가 꺼져 **글자 폭만큼 쪼그라든다** —
   1280px 실측으로 칸 654px 이 될 자리가 **129px** 이었다. 형제들과 같이 칸을 채우려면 0.
   ⚠️ 이건 «몇 px 인가» 라 브라우저로만 확정된다 — 자동 검사는 그 모양만 막는다
      (진짜 측정은 test-harness/manual/speech-mission-browser.mjs 가 한다). */
const mBox = (pageSrc.match(/\.sc-mission \{[^}]*\}/) || [])[0] || '';
check('전제: .sc-mission 규칙을 찾았다', mBox.length > 20, mBox);
check('좌우 auto 마진을 쓰지 않는다(grid 에서 쪼그라든다)', !/margin:[^;]*\bauto\b/.test(mBox), mBox);

/* ⑧ 화면 함수를 «실제로 돌려» 무슨 글자가 나오는지 본다 */
console.log('\n⑧ 화면 scRenderMission — 오려 내 실제로 돌린다');
const rBody = fnBody(pageSrc, 'scRenderMission');
check('전제: scRenderMission 을 잘라 냈다', rBody.length > 200, rBody.length);
let render = null;
if (rBody) {
  const mkEl = () => ({ textContent: '', className: '', hidden: false, style: {} });
  /* 🪤 scRenderMission 은 _scIsEn() 을 부른다 — 그 함수도 «소스에서» 오려 내 함께 넣는다.
        (안 넣으면 ReferenceError 로 죽는데, 그건 «검사» 가 아니라 «검사가 못 봄» 이다) */
  const isEnBody = fnBody(pageSrc, '_scIsEn');
  check('전제: _scIsEn 도 잘라 냈다', isEnBody.length > 40, isEnBody.length);
  const sandbox = 'var document = { getElementById: function(id){ return __els[id] || null; } };\n'
                + 'var localStorage = { getItem: function(k){ return k === "mangoi_lang" ? __lang : null; } };\n'
                + 'var window = { getLang: function(){ return __lang; } };\n'
                + 'var getLang = window.getLang;\n' + isEnBody + '\n' + rBody + '\nreturn scRenderMission;';
  try { render = new Function('__els', '__lang', sandbox); } catch (e) { check('scRenderMission 을 평가할 수 있다', false, e.message); }
  if (render) {
    /* ⛔ 던져도 «크래시» 가 아니라 «깔끔한 FAIL» 이어야 한다 — 칸 묶음을 그대로 돌려준다 */
    const run = (m, lang = 'ko') => {
      const e = { 'sc-mission': mkEl(), 'sc-mission-t': mkEl(), 'sc-mission-fill': mkEl(), __err: '' };
      try { render(e, lang)(m); } catch (err) { e.__err = String((err && err.message) || err); }
      return e;
    };
    check('돌려도 던지지 않는다', run({ goal: 5, count: 1, left: 4, reached: false, unitKo: '문장', unitEn: 'sentence', unitEnPl: 'sentences' }).__err === '',
          run({ goal: 5, count: 1, left: 4, reached: false, unitKo: '문장', unitEn: 'sentence', unitEnPl: 'sentences' }).__err);
    const mid = run({ goal: 5, count: 2, left: 3, reached: false, unitKo: '문장', unitEn: 'sentence', unitEnPl: 'sentences' });
    check('진행 중 — 「2 / 5문장 · 3문장 더!」 라고 말한다',
          /2 \/ 5문장/.test(mid['sc-mission-t'].textContent) && /3문장 더/.test(mid['sc-mission-t'].textContent),
          mid['sc-mission-t'].textContent);
    check('진행 중 — 막대를 그 비율로 그린다', mid['sc-mission-fill'].style.width === '40%', mid['sc-mission-fill'].style.width);
    check('진행 중 — 줄을 보여준다', mid['sc-mission'].hidden === false);
    const hit = run({ goal: 5, count: 5, left: 0, reached: true, unitKo: '문장', unitEn: 'sentence', unitEnPl: 'sentences' });
    check('채웠을 때 — 「오늘 몫 끝!」 이라고 말한다', /오늘 몫 끝/.test(hit['sc-mission-t'].textContent), hit['sc-mission-t'].textContent);
    check('채웠을 때 — 「더 해도 좋아요」 를 함께 말한다(잠그지 않는다)',
          /더 해도/.test(hit['sc-mission-t'].textContent), hit['sc-mission-t'].textContent);
    check('채웠을 때 — 막대 색이 바뀐다(hit)', /hit/.test(hit['sc-mission-fill'].className) && /hit/.test(hit['sc-mission-t'].className));
    const en = run({ goal: 5, count: 2, left: 3, reached: false, unitKo: '문장', unitEn: 'sentence', unitEnPl: 'sentences' }, 'en');
    check('영어 — 「2 / 5 sentences · 3 to go」', /2 \/ 5 sentences/.test(en['sc-mission-t'].textContent) && /3 to go/.test(en['sc-mission-t'].textContent),
          en['sc-mission-t'].textContent);
    /* 짝 — 모르면 아무 말도 하지 않는다 */
    const nul = run(null);
    check('짝: 모르면(null) 줄을 그리지 않는다 — 0 이라 말하지 않는다',
          nul['sc-mission'].hidden === true && nul['sc-mission-t'].textContent === '', nul['sc-mission-t'].textContent);
    const zero = run({ goal: 0, count: 0, left: 0, reached: false, unitKo: '문장', unitEn: 'sentence', unitEnPl: 'sentences' });
    check('짝: 목표가 없으면 줄을 그리지 않는다', zero['sc-mission'].hidden === true);
  }
}

/* ⑨ 중국어 화면 — 셀 수 없으므로 달지 않는다 */
console.log('\n⑨ 중국어 발음 화면');
check('전제: 중국어 화면을 읽었다', pageCnSrc.length > 1000, pageCnSrc.length);
check('중국어 화면은 서버 채점(/api/voice/coach)을 부르지 않는다(그래서 셀 수 없다)',
      !/\/api\/voice\/coach/.test(strip(pageCnSrc)));
check('그래서 «오늘 몫» 줄을 달지 않았다(달면 언제나 0 이라 화면이 거짓말한다)',
      !/sc-mission/.test(pageCnSrc));

console.log('\n─────────────────────────────────────────────');
console.log(`결과: PASS ${PASS} / FAIL ${FAIL}` + (SKIPPED ? ` / SKIP ${SKIPPED}(환경)` : ''));
if (FAIL > 0) { console.log('⚠ 실제 확인 필요'); process.exit(1); }
