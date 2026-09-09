// 📅 «오늘의 학습» 회귀 감시 (2026-09-03)
//
//   왜 필요한가 —
//     AI 학습도구 8종이 각각은 돌지만 서로 이어져 있지 않았다(2026-09-03 D1 실측: 최근 30일
//     AI 도구를 쓴 학생 60명 중 2개 이상 도구를 쓴 학생 7명). 그래서 «오늘 할 순서» 를 정하는
//     정본(src/today-plan.ts)과 그것을 부르는 API(/api/student/today)·화면(today.html)·
//     도구 화면의 «돌아가기» 알약(js/today-bar.js)을 한 줄로 이었다.
//
//   이 하니스가 못 박는 것 —
//     ① 🔴 정본을 esbuild 로 번들해 **실제로 돌린다** — 수업일/집/미배정/완료 상태별 답.
//        문자열 검사는 「함수가 있는가」만 볼 뿐 「무슨 답이 나오는가」는 못 본다(CLAUDE.md 2장).
//     ② 레벨 눈금이 한 벌이다 — 밴드 n ↔ 웜업 'n' ↔ AI 친구 'Sn' (세 화면이 같은 레벨에서 시작)
//     ③ 요일 파서가 정본 admDowMatches(api-admin.ts) 와 같은 답을 낸다 — '목'·'Thu'·'1,3,5'
//     ④ API 핸들러 «중괄호 안» 에 소유자 판정(resolveOwnerScope)이 있고, index.ts 허용목록에 올라 있다
//     ⑤ 도구 화면 8종 전부에 today-bar.js 가 실려 있다 — 하나만 빠져도 그 도구에서 흐름이 끊긴다
//     ⑥ 계획이 가리키는 화면(url)이 저장소에 실제로 있다 — 없는 화면으로 보내면 «눌러도 홈» 이 된다
//     ⑦ today.html 이 사이트 구성표에 있고 한자 글꼴 CSS 를 싣는다
//
//   변이시험(수동 확인, 2026-09-03): levelKeys 의 'S' 접두를 지우면 ②, 미배정에 레벨테스트를
//   빼면 ①-3, 수업일 웜업을 빼면 ①-1, dowMatches 의 한글 표를 지우면 ③ 이 실제로 FAIL 난다.
//
//   실행: node test-harness/today_plan_harness.mjs
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const CF = join(ROOT, 'cloudflare-deploy');
const PUB = join(CF, 'public');
const rd = (p) => readFileSync(p, 'utf8');

let PASS = 0, FAIL = 0;
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};
/**
 * 부정 검사는 주석을 벗긴 사본으로 — 블록주석은 줄 단위로 «지금 주석 안인가» 를 추적한다.
 * 🔴 (2026-09-04 함정 대조 지적) HTML 주석(«<!-- -->»)도 벗긴다. 안 벗기면 .html 파일에서
 *    「이 이름이 있는가」류 검사가 «자기 설명 주석» 을 잡아 통과한다 — 실측: 홈 큰 버튼 라벨을
 *    옛 이름으로 되돌려도 index.html 검사가 초록이었다(잡힌 것은 그날 새로 넣은 설명 주석).
 *    그 위에 「주석을 벗기고 본다」고 적어 두었는데 .html 에 대해서는 사실이 아니었다.
 * ⚠️ HTML 주석은 중첩이 없어 non-greedy 로 안전하다. 그래도 «코드를 통째로 먹지 않았는가» 를
 *    아래 ⓪절이 전제 검사로 확인한다(CLAUDE.md 2장 「블록주석을 정규식 한 줄로 지웠더니」).
 */
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
/** `needle` 이 나오는 if 문의 본문을 중괄호 짝으로 잘라 낸다 */
function handlerBlock(src, needle) {
  const at = src.indexOf(needle); if (at < 0) return null;
  const open = src.indexOf('{', at); if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

// ═══ 0) 정본 번들 ═══
const RUN_ESBUILD = (args) => (process.platform === 'win32'
  ? execFileSync(process.execPath, [join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), ...args])
  : execFileSync(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), args));
const tmp = mkdtempSync(join(tmpdir(), 'today-plan-'));
const out = join(tmp, 'today-plan.mjs');
let mod;
try {
  RUN_ESBUILD([join(CF, 'src', 'today-plan.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
  mod = await import(pathToFileURL(out).href);
} catch (e) {
  console.log('  ❌ esbuild 번들 실패 — ' + (e && e.message));
  FAIL++;
}

if (mod) {
  const { buildTodayPlan, TOOLS, HOME_WEEK, CLASS_DAY, dowMatches, dowList, aiStreak, hhmmToMin, bandFromLevelCell } = mod;
  const base = { band: 3, textbook: 'BTS 3 Korea (My family)', dow: 4, nowMin: 10 * 60, classes: [], weekClassDows: [2, 4], done: {} };

  console.log('\n[ ① 정본을 실제로 돌린다 ]');
  {
    // ①-1 수업일 — 웜업(전) → 복습퀴즈(후) → 집
    const p = buildTodayPlan({ ...base, classes: [{ start: '19:00', minutes: 50, source: 'mangoi' }] });
    check('①-1 수업일이면 mode=class · 첫 단계가 웜업(전)', p.mode === 'class' && p.steps[0].key === 'warmup' && p.steps[0].slot === 'before', p.steps.map(s => s.key + '/' + s.slot));
    check('①-1 두 번째가 복습퀴즈(후) · 세 번째가 집', p.steps[1].key === 'review' && p.steps[1].slot === 'after' && p.steps[2].slot === 'home');
    check('①-1 10시에는 phase=before', p.phase === 'before', p.phase);
    const p2 = buildTodayPlan({ ...base, nowMin: 21 * 60, classes: [{ start: '19:00', minutes: 50, source: 'mangoi' }] });
    check('①-1 수업 끝난 뒤에는 phase=after', p2.phase === 'after', p2.phase);
    const p3 = buildTodayPlan({ ...base, nowMin: 19 * 60 + 20, classes: [{ start: '19:00', minutes: 50, source: 'mangoi' }] });
    check('①-1 수업 도중에는 phase=in_class', p3.phase === 'in_class', p3.phase);
    // ①-2 집 — 요일 묶음. 화요일(2)은 말하기(음성코치)+복습+단어
    const h = buildTodayPlan({ ...base, dow: 2 });
    check('①-2 수업 없는 화요일: mode=home · HOME_WEEK[2] 그대로', h.mode === 'home' && JSON.stringify(h.steps.map(s => s.key)) === JSON.stringify(HOME_WEEK[2]), h.steps.map(s => s.key));
    check('①-2 집 묶음에는 말하기 하나가 반드시 있다(친구 또는 음성코치)', [0, 1, 2, 3, 4, 5, 6].every(d => (HOME_WEEK[d] || []).some(k => k === 'friend' || k === 'speech')));
    // ①-3 미배정 — 레벨테스트가 1번
    const u = buildTodayPlan({ ...base, band: null });
    check('①-3 레벨 미배정이면 mode=unassigned · 1번이 레벨테스트', u.mode === 'unassigned' && u.steps[0].key === 'leveltest' && u.steps[0].url === '/level-test-ai.html', u.steps.map(s => s.key));
    check('①-3 미배정에서는 levelKeys 가 비어 있다(지어내지 않는다)', u.levelKeys.warmup === null && u.levelKeys.aifriend === null);
    // ①-4 완료 — done 은 «오늘 그 도구 기록이 있는가»
    const d = buildTodayPlan({ ...base, dow: 2, done: { speech: 2, review: 1 } });
    check('①-4 기록이 있는 단계만 done · doneCount 가 맞다', d.steps.filter(s => s.done).map(s => s.key).join(',') === 'speech,review' && d.doneCount === 2);
    // ①-5 글쓰기는 밴드 3 미만이면 AI 친구로
    const lo = buildTodayPlan({ ...base, band: 1, dow: 5 });
    check('①-5 밴드 1 금요일: 글쓰기 대신 AI 친구', !lo.steps.some(s => s.key === 'write') && lo.steps.some(s => s.key === 'friend'), lo.steps.map(s => s.key));
    const hi = buildTodayPlan({ ...base, band: 5, dow: 5 });
    check('①-5 밴드 5 금요일: 글쓰기 그대로', hi.steps.some(s => s.key === 'write'));
    // ①-6 중국어 교재 — 복습퀴즈·음성코치가 중국어 화면으로
    const zh = buildTodayPlan({ ...base, dow: 2, zh: true, textbook: '다락원' });
    check('①-6 중국어 교재면 복습퀴즈가 /review-quiz-cn.html', zh.steps.find(s => s.key === 'review')?.url === '/review-quiz-cn.html');
    check('①-6 중국어 교재면 음성코치가 /speech-coach-cn.html', zh.steps.find(s => s.key === 'speech')?.url === '/speech-coach-cn.html');
    // ①-7 주간표 — 수업 요일에는 수업일 묶음, 아니면 요일 묶음, 오늘 표시 하나
    check('①-7 주간표 7칸 · 오늘 표시 정확히 1칸 · 수업 요일 2칸', h.week.length === 7 && h.week.filter(w => w.isToday).length === 1 && h.week.filter(w => w.isClass).length === 2);
    /* ⚠️ «오늘이 아닌» 수업일 칸으로 본다 — 오늘 칸은 실제 steps 로 맞춰지므로(①-7c),
       「이번 주 화요일에 수업이 있다」와 「오늘(화) 수업 시각을 모른다」가 함께 오면
       오늘 칸은 집 묶음이 되는 것이 «맞다»(그때는 웜업을 언제 할지 정할 수 없다). */
    check('①-7 수업 요일 칸은 웜업→복습→단어', h.week.find(w => w.isClass && !w.isToday)?.tools.join(',') === [...CLASS_DAY.before, ...CLASS_DAY.after, ...CLASS_DAY.home].join(','));
    // ①-7b 리듬 띠(2026-09-04) — 시각 라벨과 분 수. «수업일인가» 의 정본은 weekClassDows 하나다
    const wk = buildTodayPlan({ ...base, weekClassTimes: { 2: '19:00', 4: '19:00', 6: '11:00' } }).week;
    check('①-7b 수업일 칸에 시각이 붙는다', wk[2].start === '19:00' && wk[4].start === '19:00', wk.map(w => w.start));
    check('①-7b weekClassDows 에 없는 요일의 시각은 «버린다»(정본은 하나)',
      wk[6].isClass === false && wk[6].start === null, [wk[6].isClass, wk[6].start]);
    check('①-7b 집인 날은 start 가 언제나 null', wk.filter(w => !w.isClass).every(w => w.start === null));
    check('①-7b 시각을 안 주면 수업일이어도 start 는 null(지어내지 않는다)',
      buildTodayPlan({ ...base }).week[2].start === null);
    check('①-7b 잘못된 시각은 버린다', buildTodayPlan({ ...base, weekClassTimes: { 2: '25:99' } }).week[2].start === null);
    // 분 수는 «그날 tools 의 합» — 지어낸 값이 아니라 계획의 합계여야 한다
    check('①-7b 오늘이 «아닌» 날 minutes = tools 의 TOOLS[k].minutes 합',
      wk.filter(w => !w.isToday).every(w => w.minutes === w.tools.reduce((n, k) => n + TOOLS[k].minutes, 0)), wk.map(w => w.minutes));
    check('①-7b 모든 날 minutes 가 0 보다 크다(빈 칸이 «0분» 으로 그려지지 않게)', wk.every(w => w.minutes > 0));

    /* ①-7c 🔴 «오늘» 칸은 실제 steps 와 «같은 말» 을 해야 한다 — 띠 바로 아래 펼침 상자가
       같은 steps 를 나열하므로, 어긋나면 한 화면이 두 값을 말한다.
       ⚠️ 레벨 미배정(band=null)이 예외가 아니라 «거의 전원» 이다 —
          2026-09-04 운영 D1 실측: students_erp 29,475명 중 level 채워진 사람 1명.
       고치기 전에는 금요일 띠=14분 / 상자=17분 이었다(변이시험으로 되돌리면 재현된다). */
    for (const [nm, inp] of [
      ['레벨 미배정 · 집인 날', { ...base, band: null, dow: 5 }],
      ['레벨 미배정 · 수업일',  { ...base, band: null, dow: 2, weekClassTimes: { 2: '19:00' } }],
      ['레벨 있음 · 수업일',    { ...base, dow: 2, classes: [{ start: '19:00', minutes: 20, source: 'mangoi' }], weekClassTimes: { 2: '19:00' } }],
      ['레벨 있음 · 집인 날',   { ...base, dow: 5 }],
      ['밴드 1 · 금요일(글쓰기 대신 친구)', { ...base, band: 1, dow: 5 }],
    ]) {
      const pl = buildTodayPlan(inp);
      const td = pl.week[inp.dow];
      const stepMin = pl.steps.reduce((n, st) => n + st.minutes, 0);
      check(`①-7c ${nm} — 오늘 칸 분 수 == 오늘 할 일 합(${stepMin}분)`, td.minutes === stepMin, [td.minutes, stepMin]);
      check(`①-7c ${nm} — 오늘 칸 tools == steps(레벨테스트 제외)`,
        td.tools.join(',') === pl.steps.map(st => st.key).filter(k => k !== 'leveltest').join(','), [td.tools, pl.steps.map(st => st.key)]);
      check(`①-7c ${nm} — totalMinutes 와도 같다`, pl.totalMinutes === stepMin, [pl.totalMinutes, stepMin]);
    }
    check('①-7c 오늘이 수업일이면 금색 테두리 칸에도 시각이 붙는다',
      buildTodayPlan({ ...base, dow: 2, weekClassTimes: { 2: '19:00' } }).week[2].isToday === true
      && buildTodayPlan({ ...base, dow: 2, weekClassTimes: { 2: '19:00' } }).week[2].start === '19:00');
    check('①-7c 오늘 칸을 맞춰도 «다른 날» 은 안 건드린다',
      buildTodayPlan({ ...base, band: null, dow: 5 }).week[1].tools.join(',') === HOME_WEEK[1].join(','));
    // ①-8 두 수업 — 첫 수업 전·마지막 수업 뒤
    const two = buildTodayPlan({ ...base, nowMin: 18 * 60, classes: [{ start: '20:00', minutes: 20, source: 'cafe24' }, { start: '17:00', minutes: 20, source: 'cafe24' }] });
    check('①-8 수업이 둘이면 표시는 첫 수업(17:00) · 18시는 두 수업 사이라 in_class', two.cls?.start === '17:00' && two.phase === 'in_class', [two.cls, two.phase]);
    // ①-9 시간 파서
    check('①-9 hhmmToMin: 19:05→1145 · 잘못된 값→null', hhmmToMin('19:05') === 1145 && hhmmToMin('25:00') === null && hhmmToMin('') === null);
  }

  console.log('\n[ ② 레벨 눈금은 한 벌 ]');
  for (const b of [1, 3, 8]) {
    const p = buildTodayPlan({ ...base, band: b });
    check(`② 밴드 ${b} → 웜업 '${b}' · AI 친구 'S${b}'`, p.levelKeys.warmup === String(b) && p.levelKeys.aifriend === 'S' + b, p.levelKeys);
  }
  {
    const p9 = buildTodayPlan({ ...base, band: 9 });
    check('② 범위 밖(9)은 미배정으로 — 지어내지 않는다', p9.mode === 'unassigned' && p9.band === null);
    check('② students_erp.level 칸 → 밴드 (정본 bandFromTextbookLevel): "Lv 9"→3 · "Lv 1"→1 · 빈 값→null',
      bandFromLevelCell('Lv 9') === 3 && bandFromLevelCell('Lv 1') === 1 && bandFromLevelCell('') === null && bandFromLevelCell(null) === null);
    const p = buildTodayPlan({ ...base, band: 3 });
    check('② 밴드 이름·CEFR 이 정본 표에서 온다 (3 = 초급 · A2+)', p.bandKo === '초급' && p.cefr === 'A2+', [p.bandKo, p.cefr]);
  }

  console.log('\n[ ③ 요일 파서가 정본과 같은 답을 낸다 ]');
  {
    // api-admin.ts 의 admDowMatches 를 오려 내 함께 돌린다 — 두 함수가 같은 입력에 같은 답
    const adminSrc = rd(join(CF, 'src', 'api-admin.ts'));
    const mapAt = adminSrc.indexOf('const ADM_DOW_MAP');
    const fnAt = adminSrc.indexOf('function admDowMatches');
    const fnEnd = adminSrc.indexOf('\n}\n', fnAt) + 3;
    let ref = null;
    try { ref = new Function(adminSrc.slice(mapAt, fnEnd).replace(/: Record<string, number>/, '').replace(/\(raw: any, target: number\): boolean/, '(raw, target)') + '\nreturn admDowMatches;')(); }
    catch (e) { check('③ 정본 admDowMatches 를 오려 낼 수 있다', false, e.message); }
    if (ref) {
      const cases = ['4', 'Thu', 'thu', '목', '목요일', '1,3,5', 'Mon,Thu', 'Tue/Thu', '', null, 'Fri 5', '0', 'sunday'];
      let same = true; const diff = [];
      for (const c of cases) for (let d = 0; d <= 6; d++) if (dowMatches(c, d) !== ref(c, d)) { same = false; diff.push([c, d]); }
      check('③ 13가지 표기 × 7요일 전부 정본과 같은 답', same, diff.slice(0, 5));
      check('③ dowList("1,3,5") → [1,3,5] · "목" → [4]', dowList('1,3,5').join() === '1,3,5' && dowList('목').join() === '4');
    }
  }

  console.log('\n[ ④ 연속일 계산 ]');
  {
    check('④ 오늘 포함 3일 연속', aiStreak(['2026-09-01', '2026-09-02', '2026-09-03'], '2026-09-03') === 3);
    check('④ 오늘 아직 안 했으면 어제까지로 센다(끊긴 것이 아니다)', aiStreak(['2026-09-01', '2026-09-02'], '2026-09-03') === 2);
    check('④ 그제까지만 있으면 0', aiStreak(['2026-09-01'], '2026-09-03') === 0);
    check('④ 중복 날짜는 한 번만', aiStreak(['2026-09-03', '2026-09-03', '2026-09-02'], '2026-09-03') === 2);
  }

  console.log('\n[ ⑥ 계획이 가리키는 화면이 실재한다 ]');
  for (const t of Object.values(TOOLS)) {
    check(`⑥ ${t.key} → ${t.url}`, existsSync(join(PUB, t.url.replace(/^\//, ''))));
    if (t.urlZh) check(`⑥ ${t.key}(중국어) → ${t.urlZh}`, existsSync(join(PUB, t.urlZh.replace(/^\//, ''))));
  }
  check('⑥ 레벨테스트 화면 /level-test-ai.html', existsSync(join(PUB, 'level-test-ai.html')));
}

console.log('\n[ ④ API — 소유자 판정 + 허용목록 ]');
{
  const students = rd(join(CF, 'src', 'api-students.ts'));
  const blk = handlerBlock(students, `path === '/api/student/today'`);
  check('④ /api/student/today 핸들러가 있다', !!blk);
  check('④ 그 핸들러 «안» 에 resolveOwnerScope 가 있고 self·admin 만 통과한다',
    !!blk && /resolveOwnerScope\s*\(/.test(strip(blk)) && /scope !== 'self' && scope !== 'admin'/.test(strip(blk)),
    '무인증으로 남의 아이 이름·수업 시각이 나간다');
  check('④ 핸들러가 정본 buildTodayPlan 을 «부른다» (규칙을 다시 적지 않는다)', !!blk && /buildTodayPlan\s*\(/.test(strip(blk)) && !/HOME_WEEK/.test(strip(blk)));
  check('④ 응답에 Cache-Control: private, no-store', !!blk && /private, no-store/.test(blk));
  check('④ 자리표시(lms·type_seed)를 오늘 수업에서 뺀다', !!blk && /NOT IN \('lms','type_seed'\)/.test(blk));
  const idx = rd(join(CF, 'src', 'index.ts'));
  check('④ index.ts 허용목록에 /api/student/today 가 있다 (없으면 404 「Not Found」)', /path === '\/api\/student\/today'/.test(strip(idx)));
}

console.log('\n[ ⑤ 도구 화면 8종이 «돌아가기» 알약을 싣는다 ]');
/* ⚠️ 8종을 손으로 적지 않는다 — 계획이 «가리키는» 모든 화면(중국어 갈래·게임·레벨테스트 포함)에서
   센다. 2026-09-03 함정 대조 검사가 잡은 누락: review-quiz-cn·speech-coach-cn·student-games·level-test-ai. */
{
  const urls = new Set(['/level-test-ai.html']);
  if (mod) for (const t of Object.values(mod.TOOLS)) { urls.add(t.url); if (t.urlZh) urls.add(t.urlZh); }
  for (const u of [...urls].sort()) {
    const h = rd(join(PUB, u.replace(/^\//, '')));
    check(`⑤ ${u} 에 today-bar.js`, /<script[^>]*src="\/js\/today-bar\.js\?v=\d+"/.test(h));
  }
  check('⑤ 검사한 화면이 12개 이상이다(목록이 비어 헛돌지 않는다)', urls.size >= 12, urls.size);
}
{
  const bar = strip(rd(join(PUB, 'js', 'today-bar.js')));
  check('⑤ today-bar 는 from=today 일 때만 그린다', /get\('from'\) === 'today'/.test(bar));
  check('⑤ today-bar 에 상주 MutationObserver·setInterval 이 없다(홈을 멎게 한 전력)', !/MutationObserver|setInterval/.test(bar));
  check('⑤ today-bar z-index 가 수업 독(99993)보다 아래', /z-index:99990/.test(bar));
  check('⑤ today-bar 가 «무엇을 덮는가» 를 재서 비켜선다(elementFromPoint · 조작 요소)', /elementFromPoint/.test(bar) && /button|a\[href\]|input/.test(bar) && /function\s+covers/.test(bar));
}

console.log('\n[ ⑦ today.html — 구성표·글꼴·입구 ]');
{
  const html = rd(join(PUB, 'today.html'));
  const map = rd(join(PUB, 'admin', 'site-structure-map.html'));
  check('⑦ 사이트 구성표에 /today.html 이 있다', /href="\/today\.html"/.test(map));
  check('⑦ today.html 이 mangoi-han.css 를 싣는다', /\/css\/mangoi-han\.css/.test(html));
  check('⑦ today.html 이 today-page.js 를 싣는다 (판정은 서버·그리기는 이 파일)', /\/js\/today-page\.js\?v=\d+/.test(html));
  const page = strip(rd(join(PUB, 'js', 'today-page.js')));
  check('⑦ 화면이 «성공이라고 말했는가»(ok === true) 로 판정한다', /d\.ok === true && d\.plan/.test(page));
  check('⑦ 서버 레벨은 도구 키에 «비어 있을 때만» 심는다', /!localStorage\.getItem\('mangoi_warmup_level'\)/.test(page) && /!localStorage\.getItem\('mangoi_aifriend_level'\)/.test(page));
  check('⑦ 화면에 상주 MutationObserver·setInterval 이 없다', !/MutationObserver|setInterval/.test(page));
  /* 주간표 «리듬 띠»(2026-09-04 결정) — 되돌리면 여기서 FAIL 난다.
     ⛔ 「그 글자가 있는가」로 쓰지 말 것 — 주석에 그 낱말을 적기만 해도 통과한다. 주석을 벗긴 사본을 본다. */
  check('⑦ 주간표가 서버가 준 start·minutes 를 그린다(화면이 다시 계산하지 않는다)',
    /w\.start/.test(page) && /w\.minutes/.test(page));
  check('⑦ 주간표에 이모지 묶음(tools.map → ICON)이 되살아나지 않았다',
    !/tools\.map\(/.test(page) && !/var ICON\s*=/.test(page));
  check('⑦ 오늘 칸 펼침은 p.steps 를 쓴다(도구 목록을 두 벌로 적지 않는다)',
    /td-week-today/.test(page) && /p\.steps\.map/.test(page));
  /* 요약은 «주간표를 세어» 나와야 한다 — 숫자를 박아 두면 시간표가 바뀌어도 안 따라온다.
     (문자열로는 여기까지가 한계다. «정말 그 숫자가 나오는가» 는 브라우저 검사 manual/today-week-band-browser.mjs) */
  check('⑦ 요약(수업 N회 · AI N분)을 주간표에서 «센다»(숫자를 박지 않는다)',
    /td-week-sum/.test(page) && /nCls\+\+/.test(page) && /minutes \|\| 0/.test(page)
    && !/수업 [0-9]+회/.test(page));
  check('⑦ today.html 에 리듬 띠 칸 셋이 있다(띠 · 오늘 펼침 · 요약)',
    /id="td-week"/.test(html) && /id="td-week-today"/.test(html) && /id="td-week-sum"/.test(html));
  check('⑦ 수업일/집 색이 CSS 로 갈린다(색이 곧 범례)', /\.day\.cls\s*\{/.test(html) && /\.day\.today\s*\{/.test(html));
  const menu = strip(rd(join(PUB, 'js', 'idx-allmenu.js')));
  const home = strip(rd(join(PUB, 'js', 'idx-ai-home.js')));
  const signup = rd(join(PUB, 'signup.html'));
  check('⑦ 입구 셋 — 전체메뉴 · 홈 검색 · 가입 완료 카드', /url:'\/today\.html'/.test(menu) && /location\.href='\/today\.html'/.test(home) && /href="\/today\.html"/.test(signup));

  /* ── ⑧ 이름과 자리 (2026-09-04 사장님 지시)
     이름: 「오늘의 학습」 → 「오늘의 A.i 학습」. 여러 곳이 «같은 말» 을 해야 한다 —
           한 곳만 고치면 에러 없이 어긋나고, 그때가 「이거 같은 거야 다른 거야」가 다시 나오는 때다.
     자리: 드로어 「AI 학습 도구」 «맨 위» + 로그인한 학생의 홈 큰 버튼.
     ⚠️ «보이는가 · 눌리는가» 는 문자열로 못 본다 — manual/today-entry-browser.mjs 가 그려서 잰다. */
  const idx = rd(join(PUB, 'index.html'));
  const bar = rd(join(PUB, 'js', 'today-bar.js'));
  /* ⚠️ 주석을 «벗긴» 사본에서 자른다 — 안 벗기면 「왜 바꿨나」 설명 주석에 남긴 옛 이름을
     부정 검사가 잡아 «아직 남아 있다» 로 FAIL 낸다(2026-09-04 실제로 밟았다). */
  const idxS = strip(idx);
  /* ⓪ 전제 — strip 이 코드를 통째로 먹으면 아래 검사가 «전부 통과» 로 헛돈다
     (CLAUDE.md 2장 「블록주석을 정규식 한 줄로 지웠더니 코드가 함께 사라짐」) */
  check('⓪ strip 이 index.html 을 통째로 먹지 않았다', strip(idx).length > idx.length * 0.5,
    [strip(idx).length, idx.length]);
  check('⓪ strip 이 today-bar.js 를 통째로 먹지 않았다', strip(bar).length > bar.length * 0.4);
  const NAME = '오늘의 A.i 학습';
  /* ⚠️ 주석을 «벗기고» 본다 — 안 벗기면 「왜 이 이름으로 바꿨나」 설명 주석이 자기를 잡아
     알약 글자를 옛 이름으로 되돌려도 통과한다(2026-09-04 변이시험에서 실제로 안 잡혔다). */
  for (const [nm, txt] of [['화면 제목', html], ['돌아가기 알약', bar], ['전체메뉴 타일', menu],
                           ['홈 검색 라벨', home], ['가입 완료 카드', signup], ['홈(드로어·큰 버튼)', idx]])
    check(`⑧ «${NAME}» — ${nm}`, strip(txt).includes(NAME));
  /* 알약은 «화면에 그리는 글자» 를 콕 집어 본다 — 그 파일에서 이름이 나오는 곳이 여럿이다 */
  check('⑧ 돌아가기 알약이 그리는 «글자» 가 새 이름',
    /'📅 오늘의 A\.i 학습' \+ \(total/.test(strip(bar)), (strip(bar).match(/'📅[^']*'/g) || []).slice(0, 3));
  check('⑧ 옛 이름이 화면 글자로 남아 있지 않다(주석은 무관)',
    !/'📅 오늘의 학습'/.test(strip(bar)) && !/data-ko="📅 오늘의 학습"/.test(strip(html)));
  check('⑧ 화면 제목 태그도 새 이름', /<title>오늘의 A\.i 학습/.test(html));
  /* 옛 낱말로 찾던 사람이 못 찾게 되면 안 된다 — 검색어(kws)에는 «옛 말 + 새 말» 이 함께 있어야 한다 */
  const kwLine = (home.split(/\r?\n/).find(l => /kws:/.test(l) && /\/today\.html/.test(l)) || '');
  check('⑧ 홈 검색이 «옛 말» 로도 찾아 준다(오늘의 학습 · 계획표)',
    /'오늘의 학습'/.test(kwLine) && /'계획표'/.test(kwLine), kwLine.slice(0, 90));
  check('⑧ 홈 검색이 «새 말» 로도 찾아 준다(오늘의 ai 학습)', /'오늘의 ai 학습'/.test(kwLine));

  /* 드로어 「AI 학습 도구」 묶음 — 그 안에서만 본다(파일 전체를 보면 딴 곳이 걸린다) */
  const g = idxS.indexOf('data-ko="AI 학습 도구"');
  const gBody = g > 0 ? idxS.slice(idxS.indexOf('mg-acc-body', g), idxS.indexOf('</details>', g)) : '';
  const gBtns = [...gBody.matchAll(/<button[^>]*data-ko="([^"]+)"/g)].map(m => m[1]);
  check('⑧ 드로어 「AI 학습 도구」 «맨 위» 가 오늘의 A.i 학습', /오늘의 A\.i 학습/.test(gBtns[0] || ''), gBtns.slice(0, 3));
  check('⑧ 그 아래 도구가 그대로(8종 이상)', gBtns.length >= 9, gBtns.length);
  /* 🔴 (2026-09-04 함정 대조 지적) 로그인한 학생의 홈 큰 버튼 — 이 자리가 «탭 1번» 이고
     이번 지시의 핵심인데, 검사가 manual/ 에만 있어 게이트가 못 지키고 있었다.
     「보이는가·눌리는가」는 브라우저 몫이지만 «무엇으로 가는 버튼인가» 는 여기서 볼 수 있다. */
  const hm = idxS.indexOf('id="hero-member"');
  const hmBlock = hm > 0 ? idxS.slice(hm, idxS.indexOf('</div>', idxS.indexOf('</button>', hm))) : '';
  check('⑧ 홈 큰 버튼(#hero-member)에 /today.html 로 가는 버튼이 있다',
    /onclick="location\.href='\/today\.html'"/.test(hmBlock), hmBlock.slice(0, 80));
  check('⑧ 그 버튼 라벨이 새 이름이다', /data-ko="오늘의 A\.i 학습"/.test(hmBlock));
  check('⑧ 옛 「AI와 친구하기」가 그 자리에 남아 있지 않다', hm > 0 && !/AI와 친구하기/.test(hmBlock));
  check('⑧ 「수업 입장」은 그대로 있다(같이 지우지 않았다)', /showView\('view-videocall-lobby'\)/.test(hmBlock));

  /* ⛔ 「학습 공간」에는 넣지 않는다 — 거기는 레벨테스트·수업 신청처럼 «한 번씩 하는 학원 업무» 다 */
  const sp = idxS.indexOf('data-ko="학습 공간"');
  const spBody = sp > 0 ? idxS.slice(idxS.indexOf('mg-acc-body', sp), idxS.indexOf('</details>', sp)) : '';
  check('⑧ 「학습 공간」에는 «안» 넣었다', sp > 0 && !/오늘의 A\.i 학습/.test(spBody));

  /* 되돌아가는 길 — 도구 «목록» 을 없앤 것이 아니다. 없애면 「그냥 다른 것도」 하려는 학생의 길이 사라진다 */
  check('⑧ ?menu=aitools 로 도구 목록을 여는 길이 있다',
    /p\.get\('menu'\) === 'aitools'/.test(idx) && /openAiFriendsOverlay/.test(idx));
  check('⑧ today.html 꼬리말이 «안내 글» 이 아니라 그 주소로 가는 링크다',
    /href="\/\?menu=aitools"/.test(html) && !/도구를 전부 보려면 홈 왼쪽 메뉴/.test(html));

  /* 🔎 (2026-09-05) 사장님 「이거 좀더 크게 잘 보이게 해줘」 — 12px 밑줄 글씨였다.
     ⛔ 「밑줄이 있는가」·「17px 인가」로 못 박지 말 것 — 모양을 바꾸면 보장은 그대로인데
        검사만 깨진다(CLAUDE.md 2장). 물어야 할 것은 «손가락으로 누를 수 있는 크기인가» 다.
     ⚠️ 이건 «선언된 값» 을 읽는 문자열 검사다 — 실제로 그려진 크기는
        manual/today-entry-browser.mjs 가 잰다. */
  {
    const m = html.match(/\.foot a\s*\{([\s\S]*?)\}/);
    const blk = m ? m[1] : '';
    const num = (prop) => { const x = blk.match(new RegExp(prop + '\\s*:\\s*(\\d+(?:\\.\\d+)?)px')); return x ? Number(x[1]) : 0; };
    check('⑧ 그 링크가 «누를 수 있는 크기» 다 (높이 44px↑ · 글자 15px↑ · 한 줄 글씨가 아님)',
      !!m && num('min-height') >= 44 && num('font-size') >= 15
        && /display\s*:\s*(flex|block|inline-flex|grid)/.test(blk),
      `min-height=${num('min-height')} font-size=${num('font-size')} display=${/display\s*:\s*([a-z-]+)/.exec(blk)?.[1]}`);
  }
  check('⑧ 도구 목록 자체는 그대로 살아 있다(전체메뉴 · 드로어 · 오버레이)',
    /openAiFriendsOverlay = function/.test(idx) && gBtns.length >= 9);
}


/* ═══════════════════════════════════════════════════════════════════════
 * ⑨ 안내 영상 입구 두 곳 (2026-09-05 사장님 지시 — A안 + B안)
 *    A안 홈 「망고아이란?」 맨 앞 카드 · B안 today.html 첫 방문자 한 줄
 *
 *   ⛔ «그 글자가 있는가» 로 끝내지 않는다. 여기서 못 박는 것은 셋이다 —
 *      ① 가리키는 파일이 «실재하는가»(그림·영상을 커밋에 안 담는 사고 — 아바타 전례)
 *      ② 화면이 말하는 길이가 «영상의 진짜 길이와 같은가»(mp4 헤더를 읽어 대조)
 *      ③ 누르기 전에 «영상을 안 받는가»(24.4MB — 카드를 여는 것만으로 내려가면 안 된다)
 *   ⚠️ «보이는가·눌리는가» 는 문자열로 못 본다 → test-harness/manual/video-entry-browser.mjs
 * ═══════════════════════════════════════════════════════════════════════ */
{
  const promo  = readFileSync(join(PUB, 'promo.html'), 'utf8');
  const about  = readFileSync(join(PUB, 'js', 'idx-about.js'), 'utf8');
  /* ⛔ «이 글자가 없어야 한다» 류는 반드시 주석을 벗겨 낸 사본으로 판정할 것 —
        「왜 지웠는지」 적은 설명 주석이 그 글자를 담고 있어 검사가 «자기 주석» 을 잡는다
        (CLAUDE.md 2장 — 실제로 이 자리에서 한 번 밟았다). */
  const aboutC = strip(about);
  const todayJs2 = readFileSync(join(PUB, 'js', 'today-page.js'), 'utf8');

  /* ── 프리셋 표 — 주소·길이·포스터가 «한 줄» 에서 나온다 ── */
  /* 프리셋이 «둘» 이다 — 3분 35초(원장·강사) · 39초(학생·학부모).
     ⛔ 한쪽만 검사하지 말 것: 각 프리셋은 «자기 영상» 의 사실을 말해야 한다. */
  const readPreset = (key) => {
    /* ⚠️ 키는 따옴표가 있을 수도(‘ai-tools’ — 하이픈 때문) 없을 수도(brand) 있다.
          따옴표 친 것만 읽으면 새 프리셋이 «없는 것» 으로 조용히 통과한다(2026-09-09 실측). */
    const m = promo.match(new RegExp("(?:'" + key + "'|" + key + ")\\s*:\\s*\\{([\\s\\S]*?)\\n    \\}"));
    const blk = m ? m[1] : '';
    const pick = (k) => { const x = blk.match(new RegExp(k + ":\\s*'([^']+)'")); return x ? x[1] : ''; };
    return { ok: !!m, blk, src: pick('src'), len: pick('len'), poster: pick('poster') };
  };
  const P_LONG = readPreset('ai-tools'), P_SHORT = readPreset('ai-tools-short');
  /* 🎬 2026-09-09 신설 — 사람 목소리 나레이션으로 만든 짧은 홍보영상.
     ⛔ 프리셋을 늘리면 «여기» 에도 더할 것. 안 더하면 파일이 없어도 조용히 통과한다. */
  const P_BRAND = readPreset('brand');
  const vsrc = P_LONG.src, vposter = P_LONG.poster;

  /* mp4 헤더(mvhd)에서 «진짜 길이» 를 읽는다 */
  const realSecOf = (rel) => {
    try {
      const d = readFileSync(join(PUB, String(rel).split('?')[0].replace(/^\//, '')));
      const k = d.indexOf(Buffer.from('mvhd'));
      if (k <= 0) return -1;
      const ver = d[k + 4];
      return ver === 0 ? d.readUInt32BE(k + 20) / d.readUInt32BE(k + 16)
                       : Number(d.readBigUInt64BE(k + 28)) / d.readUInt32BE(k + 24);
    } catch { return -1; }
  };

  /* 🔴 캐시용 쿼리(?v=)는 «주소» 의 일부이지 «파일» 이 아니다 — 파일을 찾을 때는 뗀다.
        ⚠️ 영상을 «같은 이름으로» 갈아 끼우면 src/index.ts 의 미디어 Cache-Control 이
           7일(max-age=604800)이라 **옛 영상이 최대 7일 남는다**. 그래서 내용이 바뀌면
           ?v= 를 올려 주소를 갈라야 하고, 즉 src 에 쿼리가 «붙는 것이 정상» 이다.
           (2026-09-09: 목소리를 바꿔 놓고 ?v= 를 안 붙여, 제보하신 사장님 화면에는
            옛 37초 AI 목소리 판이 그대로 나올 뻔했다 — 함정 대조가 잡았다.) */
  const assetRel = (u) => String(u || '').split('?')[0].replace(/^\//, '');

  for (const [nm, P] of [['긴 판', P_LONG], ['짧은 판', P_SHORT], ['홍보 판', P_BRAND]]) {
    check(`⑨ [${nm}] promo.html 에 프리셋이 있다`, P.ok && !!P.src && !!P.len && !!P.poster,
      `src=${P.src} len=${P.len} poster=${P.poster}`);
    /* ① 가리키는 파일이 실재하는가 — 없으면 «누르면 아무것도 안 나오는» 버튼이 된다 */
    check(`⑨ [${nm}] 영상 파일이 저장소에 실제로 있다`, !!P.src && existsSync(join(PUB, assetRel(P.src))), P.src);
    check(`⑨ [${nm}] 포스터 그림이 저장소에 실제로 있다`, !!P.poster && existsSync(join(PUB, assetRel(P.poster))), P.poster);
    /* ② 화면이 말하는 길이가 진짜 길이와 같은가 — 숫자를 정규식으로 못 박지 않는다.
          영상을 갈아 끼우면 이 검사가 어긋남을 알린다. */
    const real = realSecOf(P.src);
    const [mm, ss] = String(P.len).split(':').map(Number);
    const said = (mm * 60) + ss;
    check(`⑨ [${nm}] 화면이 말하는 길이가 영상의 진짜 길이와 같다 (±5초)`,
      real > 0 && Math.abs(real - said) <= 5, `화면 ${P.len}(${said}s) vs 실제 ${real.toFixed(1)}s`);
    let kb = 0;
    try { kb = readFileSync(join(PUB, assetRel(P.poster))).length / 1024; } catch {}
    check(`⑨ [${nm}] 포스터가 120KB 이하다`, kb > 0 && kb <= 120, kb.toFixed(1) + 'KB');
    /* 🔴 Cloudflare Workers 정적자산은 «파일 하나 25 MiB» 가 한도다 — Free·Paid 동일
          (developers.cloudflare.com/workers/platform/limits — 2026-09-05 문서 확인).
          넘으면 «배포가 그 자리에서 깨진다». 2026-09-05 에 긴 판이 24.98 MiB(여유 22 KiB)까지
          붙은 적이 있어 이 검사를 넣었고, 그날 crf 를 한 단계 낮춰 되돌렸다.
          ⚠️ 여유 숫자를 이 주석에 적지 말 것 — 영상을 갈 때마다 낡는다. 검사가 statSync 로
             «매번 재서» 남은 여유를 출력하므로 그 출력이 정본이다.
       ⛔ 한도를 늘려서 통과시키지 말 것 — 그건 Cloudflare 가 정하는 숫자다.
          넘으면 길이를 줄이거나 화질(crf)을 낮추거나 R2 로 옮겨야 한다. */
    let mib = 0;
    /* ⛔ src 가 비면 join(PUB,'') 이 «폴더» 를 재서 통과해 버린다 — 먼저 막는다 */
    try { if (P.src) mib = statSync(join(PUB, assetRel(P.src))).size / 1048576; } catch {}
    check(`⑨ [${nm}] 정적자산 한도(25 MiB) 안이다`, !!P.src && mib > 0 && mib < 25,
      `${mib.toFixed(2)} MiB · 남은 여유 ${((25 - mib) * 1024).toFixed(0)} KiB`);
  }
  /* 🔴 짧은 판은 «같은 이름으로» 여러 번 갈아 끼운 파일이다(2026-09-05 부터 네 번).
        ?v= 가 없으면 옛 판이 최대 7일 남아 「고쳤는데 안 고쳐졌다」가 된다.
        ⛔ 영상 내용을 바꾸면 이 번호를 «반드시» 올릴 것 — 그래야 주소가 갈린다.
        ℹ️ 긴 판은 이번에 내용이 안 바뀌어 일부러 안 붙였다(붙이면 24MB 를 전원이 다시 받는다).
           다음에 갈아 끼울 때 함께 붙일 것. */
  check('⑨ 짧은 판 주소에 캐시를 가르는 ?v= 가 있다', /[?&]v=/.test(String(P_SHORT.src)),
    P_SHORT.src);

  /* 짧은 판이 «짧은가» — 학생 화면에 3분짜리를 걸어 두면 이 기능의 취지가 사라진다 */
  check('⑨ 짧은 판이 실제로 1분 미만이다', realSecOf(P_SHORT.src) > 0 && realSecOf(P_SHORT.src) < 60,
    realSecOf(P_SHORT.src).toFixed(1) + 's');
  check('⑨ 두 판이 서로 다른 영상이다', !!P_LONG.src && !!P_SHORT.src && P_LONG.src !== P_SHORT.src);

  /* ③ 누르기 전엔 0바이트 — 어느 입구도 mp4 를 «미리» 걸어 두지 않는다 */
  const mp4InPage = (t) => new RegExp(vsrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t);
  check('⑨ today.html 이 mp4 를 직접 걸지 않는다 (누르기 전 0바이트)', !mp4InPage(readFileSync(join(PUB, 'today.html'), 'utf8')));
  check('⑨ 「망고아이란?」 카드가 mp4 를 직접 걸지 않는다', !mp4InPage(about));

  /* 🪤 포스터 주소가 «두 곳» 에 있다(promo 프리셋 · about 카드의 <img>).
        개명하면 카드 그림만 조용히 404 가 된다 → «같은 파일을 가리키는가» 로 대조한다. */
  /* 🔴 (2026-09-09 사장님 지시) 「망고아이란?」 카드의 «▶ 안내 영상 — 3분 48초로 보기» 줄은
        **없앴습니다** — 「이거 그냥 삭제해줘. 필요없어. 완전히 없애」.
        ⛔ 되살리지 말 것(CLAUDE.md 1-3 «되살리면 안 되는 것»). 아래 검사가 그것을 못 박는다.
        ℹ️ 영상 자체와 /promo.html?v=ai-tools 주소는 그대로 살아 있다 — 없앤 것은 «그 줄» 이다.
     📌 같은 날 사장님 지시로 «1분 21초 홍보영상(사장님 목소리)» 줄을 맨 앞에 두었습니다.
        지운 «3분 48초 합성목소리 판» 과 다른 영상이라 «되살린 것» 이 아닙니다.
        ⛔ 그래서 이 절은 «promo 링크가 없다» 가 아니라 «어느 영상으로 가는가» 로 묻습니다. */
  const aboutPoster = (aboutC.match(/<img src="(\/img\/promo\/[^"]+)"/) || [])[1] || '';
  /* ⛔ «어느 프리셋의 포스터인가» 를 글자로 못 박지 말 것 — 어느 영상을 거는지는 사람이 정한다.
        물어야 할 것은 «그 카드가 «자기가 여는» 프리셋의 포스터를 그리는가» 다. */
  /* ⛔ 주석이 든 원본에서 «첫 매치» 를 잡지 말 것 — 설명 주석이 다른 프리셋 이름을 담고 있으면
        그것을 집어 «엉뚱한 영상의 포스터와 대조» 하게 된다(실제로 밟았다). */
  const leadV = (aboutC.match(/promo\.html\?v=([\w-]+)/) || [])[1] || '';
  const leadP = leadV ? readPreset(leadV) : { poster: '' };
  check('⑨ 맨 앞 카드가 «자기가 여는 영상» 의 포스터를 그린다',
    !!aboutPoster && !!leadP.poster && aboutPoster === leadP.poster,
    `card=${aboutPoster} preset(${leadV})=${leadP.poster}`);

  /* ── A안(「망고아이란?」 카드의 안내 영상 줄) — 2026-09-09 에 사장님 지시로 삭제 ── */
  /* ⚠️ 이 `cards` 는 «파일에 그 객체가 적혀 있는가» 일 뿐 «화면에 그려지는가» 가 아니다 —
        변이시험에서 배열을 통째로 딴 이름으로 옮겨도 이 정규식은 그대로 13장을 셌다.
        «정말 그려지는가» 는 `manual/video-entry-browser.mjs` A절(실제 DOM)이 본다. */
  const cards = [...aboutC.matchAll(/\{ic:\s*'([^']*)',\s*t:\s*'([^']*)'/g)].map(m => m[2]);
  /* ⛔ «지웠다» 를 «promo 링크가 하나도 없다» 로 못 박지 말 것 — 같은 날 사장님이 새 영상을
        그 자리에 두라고 정하셨다. 지켜야 하는 것은 «지운 그 줄이 안 돌아왔는가» 다. */
  check('⑨ 「망고아이란?」 카드에 «안내 영상(3분 48초)» 줄이 없다 (2026-09-09 지시)',
    cards.length > 1 && !cards.some(t => /안내 영상/.test(t)) && !/promo\.html\?v=ai-tools(?!-short)/.test(aboutC),
    `카드 ${cards.length}장 · 첫 장 「${cards[0] || '(없음)'}」`);
  /* ⛔ «홍보영상» 이라는 «글자» 로 못 박지 말 것 — 어느 영상을 맨 앞에 두는가는 사람이 정한다.
        지켜야 하는 것은 «맨 앞이 영상 카드인가» 와 «그 카드가 실재하는 프리셋으로 가는가» 다. */
  check('⑨ A안 — 영상 카드가 BENEFITS 맨 앞이다',
    cards.length > 1 && /^▶/.test(cards[0]), (cards[0] || '(없음)') + ' … 총 ' + cards.length + '장');
  check('⑨ A안 — 그 카드가 실재하는 promo 프리셋으로 간다',
    !!leadV && leadP.ok && !!leadP.src, `v=${leadV} src=${leadP.src}`);
  /* ⚠️ 인앱 브라우저는 새 창을 못 열고 null 만 준다 — 폴백이 없으면 카톡에서 «눌러도 아무 일 없음» */
  check('⑨ A안 — window.open 이 막히면 location.href 로 폴백한다',
    /w\s*=\s*window\.open\([^)]*\)/.test(about) && /else\s*\{\s*location\.href\s*=\s*u;?\s*\}/.test(about));
  check('⑨ A안 — 기능 문자열에 noopener 를 주지 않는다 (반환이 늘 null 이 된다)',
    !/window\.open\([^)]*'noopener'/.test(aboutC));

  /* ── B안 — today.html 첫 방문자 한 줄 ── */
  const todayHtml2 = readFileSync(join(PUB, 'today.html'), 'utf8');
  check('⑨ B안 — today.html 에 안내 자리(#td-intro)가 있다', /id="td-intro"/.test(todayHtml2));
  /* ⛔ 범위를 «길이» 로 자르지 말 것 — 설명 주석이 길어지면 그대로 헛돈다(실제로 밟았다).
        로그인 카드는 그 다음 형제 주석까지가 경계다. */
  const loginI = todayHtml2.indexOf('id="td-login"');
  const loginEnd = todayHtml2.indexOf('<!-- 읽는 중', loginI);
  const loginBlk = (loginI > 0 && loginEnd > loginI) ? todayHtml2.slice(loginI, loginEnd) : '';
  check('⑨ B안 — 로그인 전 화면에도 그 길이 있다', /promo\.html\?v=ai-tools-short/.test(loginBlk),
    loginBlk ? '(카드 ' + loginBlk.length + '자)' : '카드 경계를 못 찾음');
  /* 🪤 «renderIntro(p)» 로 찾으면 «function renderIntro(p) {» 라는 «선언» 이 잡혀,
        호출을 통째로 지워도 통과한다(변이시험에서 실제로 놓쳤다).
        물어야 할 것은 «부르는가» 이므로 «그 줄 하나짜리 문장» 인지로 본다. */
  check('⑨ B안 — 그리는 코드를 render 가 부른다', /^\s*renderIntro\(p\);\s*$/m.test(todayJs2));
  /* 🔴 판정 — 2026-09-05 D1 실측: `students_erp.level` 은 29,481명 중 «1명» 만 채워져 있다.
     그래서 «레벨이 없나»(p.band) 하나로는 «처음» 을 하나도 못 거르고 전원에게 뜬다.
     실제로 거르는 것은 «이 화면을 연 횟수» 다. 셋이 모두 있어야 한다 —
     ⛔ 「늘 뜨게」 만드는 변이가 통과하지 않도록 조건을 하나씩 확인한다. */
  const showLine = (todayJs2.match(/var show = [^;]+;/) || [''])[0];
  check('⑨ B안 — 닫았으면 안 뜬다', /!st\.dismissed/.test(showLine), showLine);
  check('⑨ B안 — 처음 몇 번만 뜬다(연 횟수로 거른다)', /st\.opens < INTRO_MAX_OPENS/.test(showLine), showLine);
  check('⑨ B안 — 레벨이 생기면 그때부터 안 뜬다', /!p\.band/.test(showLine), showLine);
  check('⑨ B안 — 보여 줄 때 연 횟수를 센다', /setItem\(INTRO_KEY, String\(st\.opens \+ 1\)\)/.test(todayJs2));
  /* 닫기 — 못 읽으면 «보여 주는» 쪽으로 실패해야 한다(안내를 잃는 것보다 낫다) */
  check('⑨ B안 — 표시를 못 읽으면 그냥 보여 준다(fail-open)',
    /function introState\(\)[\s\S]{0,320}catch \(e\) \{ return \{ dismissed: false, opens: 0 \}; \}/.test(todayJs2));
  /* ⛔ 닫음 표시를 «숫자» 로 쓰지 말 것 — 연 횟수와 같은 칸이라 첫 번째로 세는 순간
        «닫았다» 로 읽혀 한 번만 뜨고 그친다(실제로 밟았다). */
  check('⑨ B안 — 닫으면 다시 안 뜨게 기록한다', /localStorage\.setItem\(INTRO_KEY, 'closed'\)/.test(todayJs2));
  check('⑨ B안 — 닫음 표시가 «횟수» 와 안 겹친다', /v === 'closed'/.test(todayJs2) && !/v === '1'/.test(todayJs2));
  /* 🔴 «누구에게 하는 말인가» — 입구마다 가리키는 영상이 다르다.
     ⛔ 학생 화면(today)이 긴 판을 가리키면 안 된다: 그 대본은 선생님께 하는 말이라
        아이가 듣다가 «내 이야기가 아니네» 로 나간다. 반대로 「망고아이란?」 카드는
        그 판을 가리키므로 «원장님·선생님» 대상임을 밝혀야 한다. */
  check('⑨ 학생 화면 두 곳이 «짧은 판» 을 가리킨다',
    /promo\.html\?v=ai-tools-short/.test(todayJs2) && /promo\.html\?v=ai-tools-short/.test(todayHtml2));
  check('⑨ 학생 화면이 긴 판을 가리키지 않는다',
    !/promo\.html\?v=ai-tools(?!-short)/.test(todayJs2) && !/promo\.html\?v=ai-tools(?!-short)/.test(todayHtml2));
  /* 2026-09-09: «3분 48초 안내 영상» 줄은 없앴고(사장님 「완전히 없애」), 같은 날 그 자리에
        «1분 21초 홍보영상(사장님 목소리)» 을 넣기로 정하셨다. 지켜야 하는 것은 «지운 그 판으로
        가지 않는가» 이지 «영상이 하나도 없는가» 가 아니다.
        ⛔ !/promo\.html/ 로 되돌리지 말 것 — 사장님이 넣으라고 하신 줄이 빨간불이 된다.
        ⚠️ 주석을 벗긴 사본(aboutC)으로 볼 것 — 설명 주석이 그 주소를 담고 있다. */
  check('⑨ 「망고아이란?」 카드가 «지운 3분 48초 판» 으로 가지 않는다',
    !/promo\.html\?v=ai-tools(?!-short)/.test(aboutC));
  check('⑨ 긴 판 프리셋이 대상을 밝힌다', /원장님·선생님/.test(P_LONG.blk));
  /* ⛔ 짧은 판은 아이에게 하는 말이다 — 거기서 «원장님·선생님께» 라고 하면 안 된다 */
  check('⑨ 짧은 판 프리셋은 «원장님·선생님» 이라고 말하지 않는다', !/원장님·선생님/.test(P_SHORT.blk));
}


// ═══ ⑩ 🍯 맛보기 — 로그인 없이 하루쯤 둘러보기 (2026-09-05) ═══
//   🔴 문자열로 «그 낱말이 있는가» 를 보면 안 된다 — 물어야 할 것은
//      ① 서버가 맛보기에서 «DB 를 안 읽는가»(개인정보가 실릴 자리가 없는가)
//      ② 그 갈래가 인증 게이트 «앞» 인가(뒤에 있으면 영원히 안 닿는다)
//      ③ 정본을 그 값으로 실제로 돌리면 «집에서 하는 날» 계획이 나오는가
//      ④ 화면이 그 사실을 «맛보기» 라고 말하는가 · 가짜 레벨을 기기에 심지 않는가
console.log('\n[ ⑩ 맛보기(로그인 없이) ]');
{
  const stuSrc = readFileSync(join(CF, 'src', 'api-students.ts'), 'utf8');
  const todaySrc = handlerBlock(stuSrc, "path === '/api/student/today'") || '';
  const sampleBlk = handlerBlock(todaySrc, "url.searchParams.get('sample')") || '';
  check('⑩ 맛보기 갈래가 있다', !!sampleBlk, sampleBlk ? '(' + sampleBlk.length + '자)' : '못 찾음');

  /* ② 순서 — 인증 게이트보다 «앞» 이어야 한다. 뒤면 로그인 안 한 사람은 401 을 먼저 받는다. */
  const iSample = todaySrc.indexOf("url.searchParams.get('sample')");
  const iGate = todaySrc.indexOf('resolveOwnerScope');
  check('⑩ 맛보기가 인증 게이트보다 앞에 있다', iSample > 0 && iGate > iSample,
    'sample@' + iSample + ' · gate@' + iGate);
  /* ⛔ 게이트 자체가 사라지면 안 된다 — 맛보기를 연 것이지 본 화면을 연 것이 아니다 */
  check('⑩ 본 화면의 인증 게이트는 그대로다',
    /resolveOwnerScope/.test(todaySrc) && /auth_required/.test(todaySrc));

  /* ① 맛보기 갈래 안에서는 DB 를 한 줄도 읽지 않는다 */
  check('⑩ 맛보기는 DB 를 읽지 않는다', !!sampleBlk && !/env\.DB/.test(sampleBlk),
    sampleBlk && /env\.DB/.test(sampleBlk) ? '⚠️ env.DB 를 부른다' : '');
  /* 이름을 지어내지 않는다 — «측정할 수 없는 값을 그럴듯하게 채우지 말 것» */
  check('⑩ 맛보기는 이름을 지어내지 않는다(name: null)', /name:\s*null/.test(sampleBlk));
  check('⑩ 응답이 «맛보기» 라고 스스로 말한다(sample: true)', /sample:\s*true/.test(sampleBlk));
  /* ⛔ «오늘 19시 수업» 이라고 말하면 그 시각에 아무도 안 온다 */
  check('⑩ 맛보기에 수업을 만들어 넣지 않는다(classes: [])',
    /classes:\s*\[\s*\]/.test(sampleBlk) && /weekClassDows:\s*\[\s*\]/.test(sampleBlk));

  /* ③ 정본을 «서버가 넘기는 그 값» 으로 실제로 돌린다 */
  if (mod) {
    const { buildTodayPlan, SAMPLE_BAND, SAMPLE_TEXTBOOK, BAND_COUNT } = mod;
    check('⑩ 맛보기 값이 정본에 선언돼 있다',
      typeof SAMPLE_BAND === 'number' && SAMPLE_BAND >= 1 && SAMPLE_BAND <= 8,
      'SAMPLE_BAND=' + String(SAMPLE_BAND));
    /* ⛔ 교재 이름을 지어 넣지 않는다 — 그 화면은 «네 교재는 …» 이라고 말하는 셈이 된다 */
    check('⑩ 맛보기가 교재를 지어내지 않는다', SAMPLE_TEXTBOOK == null, String(SAMPLE_TEXTBOOK));
    const sp = buildTodayPlan({
      band: SAMPLE_BAND, textbook: SAMPLE_TEXTBOOK, zh: false,
      dow: 3, nowMin: 15 * 60, classes: [], weekClassDows: [], done: {},
    });
    check('⑩ 맛보기 계획이 «집에서 하는 날» 이다', sp.mode === 'home', sp.mode);
    check('⑩ 맛보기 계획에 할 일이 실제로 담긴다', sp.steps.length >= 2,
      sp.steps.length + '개 · ' + sp.steps.map(x => x.key).join(','));
    check('⑩ 맛보기 계획에 수업 시각이 없다', sp.cls == null && sp.phase == null);
    /* «맛보기니까 전부 done» 처럼 보이면 «다 했다» 는 거짓말이 된다 */
    check('⑩ 맛보기가 «다 했다» 로 보이지 않는다', sp.doneCount === 0, 'doneCount=' + sp.doneCount);
  }

  /* ④ 화면 */
  const tjs = readFileSync(join(PUB, 'js', 'today-page.js'), 'utf8');
  const thtml = readFileSync(join(PUB, 'today.html'), 'utf8');
  check('⑩ 로그인 안 한 사람에게 맛보기를 부른다', /sample=1/.test(tjs));
  /* ⛔ 저장이 막힌 기기(사생활 보호 창)에서 «못 연다» 로 실패하면 고치려던 벽이 그대로다 */
  const openFn = (tjs.match(/function sampleOpen\(\)[\s\S]{0,420}?\n  \}/) || [''])[0];
  check('⑩ 저장을 못 하는 기기에서도 열린다(fail-open)',
    /catch \(e\) \{ return true; \}/.test(openFn), openFn ? '' : 'sampleOpen 를 못 찾음');
  check('⑩ 창은 «처음 연 시각» 부터 잰다(계속 되살아나지 않는다)',
    /SAMPLE_KEY[\s\S]{0,200}?setItem\(SAMPLE_KEY/.test(tjs) && /now - v\) < SAMPLE_MS/.test(tjs));
  check('⑩ 하루가 지나면 로그인 안내로 돌아간다',
    /if \(!sampleOpen\(\)\) \{ show\('td-login'\); return; \}/.test(tjs));
  /* 맛보기를 못 읽어도 빈 화면으로 두지 않는다 */
  check('⑩ 맛보기를 못 읽으면 로그인 안내를 보여 준다',
    (tjs.match(/show\('td-login'\)/g) || []).length >= 3);
  /* 화면이 «맛보기» 라고 말해야 한다 — 안 말하면 이 계획을 «내 계획» 으로 읽는다 */
  check('⑩ 화면에 맛보기 배너가 있다', /id="td-sample"/.test(thtml) && /맛보기/.test(thtml));
  check('⑩ 배너를 맛보기일 때만 켠다', /sb\.hidden = !d\.sample/.test(tjs));
  check('⑩ 배너에서 로그인·가입으로 갈 수 있다',
    /id="td-sample"[\s\S]{0,900}?href="\/"[\s\S]{0,400}?href="\/signup\.html"/.test(thtml));
  /* ⛔ 보기용 레벨을 기기에 심으면, «비어 있을 때만» 규칙 때문에 진짜 레벨이 와도 안 덮인다 */
  check('⑩ 맛보기 레벨을 기기에 심지 않는다', /if \(!d\.sample\) seedLevel\(p\);/.test(tjs));
  /* 0 인 값을 그리면 «너는 아무것도 안 했다» 로 읽힌다 */
  check('⑩ 맛보기에서 연속일·포인트 칩을 그리지 않는다',
    /if \(!d\.sample\) \{[\s\S]{0,400}?chip streak[\s\S]{0,400}?chip pts/.test(tjs));
  /* ?v= 원장 — 화면 코드를 고쳤으면 번호가 올라가야 한다(immutable 캐시).
     ⛔ 번호를 «글자 그대로» 못 박지 말 것 — 규칙대로 올릴 때마다 «보장은 세졌는데 검사만»
        빨간불이 된다(2026-09-09 실제로 밟음: v=7 → v=8 로 올리자 이 줄이 FAIL).
     ✅ 물어야 할 것은 «몇 번인가» 가 아니라 «버전을 달고 부르는가 + 그 번호가 원장에 있는가».
        «내용이 바뀌었는데 번호를 안 올렸다» 는 asset_version_harness 가 따로 잡는다. */
  const tpv = (thtml.match(/today-page\.js\?v=(\d+)/) || [])[1];
  let tpvInLedger = false;
  try {
    const led = JSON.parse(rd(join(__dir, 'asset-versions.json')));
    tpvInLedger = Object.prototype.hasOwnProperty.call(led, '/js/today-page.js?v=' + tpv);
  } catch { /* 원장을 못 읽으면 아래에서 FAIL 로 드러난다 */ }
  check('⑩ today.html 이 today-page.js 를 «버전을 달고» 부르고 그 번호가 원장에 있다',
    !!tpv && tpvInLedger, `?v=${tpv || '(없음)'} · 원장에 ${tpvInLedger ? '있음' : '없음'}`);
}

try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n📅 today_plan_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
