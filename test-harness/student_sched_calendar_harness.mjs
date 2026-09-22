// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📅 학생 상세 스케줄 — 요일 판정 정본 + 입력칸 색 + 배선 (2026-09-22 신설)

   [왜] 2026-09-22 사장님 제보 「일정변경·취소가 작동 안 하고 캘린더에도 반영이 안 된다」.
   실측 결과 버튼·API 는 멀쩡했고 진짜 원인은 넷이었다:
     ① 입력칸이 «흰 바탕에 흰 글자»(대비 1.14) — 값이 보이지 않아 «고장» 으로 읽혔다
     ② 주간 캘린더의 `dowToIdx={sun:0,…}` 가 실제 저장값('3'·'Wed')을 하나도 못 읽었다
     ③ 월간 캘린더에는 예약 수업 레이어가 **통째로 없었다**
     ④ 등록 성공 뒤 캘린더를 다시 읽지 않았다
   ⚠️ 색과 배치는 이 하니스가 못 본다 — 그쪽은
      test-harness/manual/student-schedule-calendar-browser.mjs 가 브라우저에서 잰다.
      여기서는 «판정이 옳은가»·«그 판정을 실제로 부르는가»·«옛 표가 되살아나지 않았는가».
   ═══════════════════════════════════════════════════════════════════════════ */
/* 🔴 시간대를 «먼저» 고정한다 — Date 를 한 번이라도 쓰기 전에.
   이 컨테이너도 CI(ci.yml 에 TZ 설정 없음)도 기본이 UTC 라, 그냥 두면
   「날짜를 로컬 기준으로 읽는다」 검사가 «원리상 늘 참» 이 된다
   (mgsYmd 를 toISOString().slice(0,10) 으로 되돌려도 UTC 에서는 답이 같다.
    Asia/Seoul 에서만 하루가 밀려 실제로 FAIL 한다 — 2026-09-22 실측). */
process.env.TZ = 'Asia/Seoul';

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.SSC_SRC || join(ROOT, 'cloudflare-deploy', 'public', 'admin', 'student.html');
const src = readFileSync(FILE, 'utf8');

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

/** 여는 중괄호를 찾아 «짝이 맞는» 닫는 중괄호까지. ⛔ 길이로 자르지 않는다. */
function bodyAt(code, from) {
  const open = code.indexOf('{', from);
  if (open < 0) return '';
  let d = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') d++;
    else if (code[i] === '}') { d--; if (d === 0) return code.slice(open, i + 1); }
  }
  return '';
}
/** `function 이름(...) { … }` 를 통째로. */
function funcAt(code, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(code);
  if (!m) return '';
  return code.slice(m.index, code.indexOf('{', m.index) + bodyAt(code, m.index).length);
}

/** 그 자리에서 «이 블록이 닫힐 때까지». ⛔ 길이(slice(i, i+N))로 자르지 않는다 —
    그 함수가 조금만 자라면 정작 볼 부분이 창 밖으로 나가 거짓 통과한다. */
function restOfBlock(code, from) {
  let d = 0;
  for (let i = from; i < code.length; i++) {
    if (code[i] === '{') d++;
    else if (code[i] === '}') { if (d === 0) return code.slice(from, i); d--; }
  }
  return code.slice(from);
}

console.log('\n── ① 입력칸은 «밝은» 값인가 (안 보이던 그 칸들) ─────');
/* 페인터(js/adm-light-surfaces.js)가 배경만 밝히고 input·select 의 글자는 원리상 못 고친다
   (fixText 첫 줄 `if (!el.firstChild) return;` — void 요소는 자식 텍스트 노드가 없다).
   그래서 이 화면의 입력칸은 처음부터 밝은 값이어야 한다. */
const INPUT_IDS = ['ns-kind', 'ns-date', 'ns-time', 'ns-dur', 'ns-teacher-sel', 'ns-teacher'];
for (const id of INPUT_IDS) {
  const m = new RegExp('id="' + id + '"[^>]*style="([^"]*)"').exec(src)
         || new RegExp('id="' + id + '"[^>]*?style="([^"]*)"').exec(src);
  const st = m ? m[1] : '';
  check('#' + id + ' 은 어두운 배경·밝은 글자가 아니다',
    !!st && !/rgba\(15,\s*23,\s*42/.test(st) && !/color:\s*#e2e8f0/i.test(st), st.slice(0, 80));
}
/* (짝) «색을 통째로 지우기» 도 막는다 — 지우면 부모 <label style="color:#94a3b8"> 를
   물려받아 대비가 2.56 으로 떨어지는데 위의 부정 검사만으로는 통과한다. */
for (const id of INPUT_IDS) {
  const m = new RegExp('id="' + id + '"[^>]*style="([^"]*)"').exec(src);
  check('(짝) #' + id + ' 에 실제로 밝은 배경·어두운 글자가 적혀 있다',
    !!m && /background:\s*#(fff|ffffff)\b/i.test(m[1]) && /color:\s*#(101828|0f172a)/i.test(m[1]),
    m ? m[1].slice(0, 80) : '없음');
}
const inpVar = /var inp = '([^']*)'/.exec(src);
check('일정변경 편집기 입력칸도 밝은 값이다',
  !!inpVar && !/rgba\(15,\s*23,\s*42/.test(inpVar[1]) && !/#e2e8f0/i.test(inpVar[1]), inpVar ? inpVar[1] : '없음');
/* (짝) 색을 «비워» 버리는 엉터리 수리도 막는다 — 실제로 밝은 값이 적혀 있어야 한다. */
check('(짝) 입력칸에 실제로 글자색이 적혀 있다',
  !!inpVar && /color:\s*#(101828|0f172a)/i.test(inpVar[1]), inpVar ? inpVar[1] : '없음');

console.log('\n── ② 요일 판정 정본을 실제로 돌린다 ────────────────');
const tblIdx = src.indexOf('var MGS_DOW_IN = {');
const canon = tblIdx < 0 ? '' : src.slice(tblIdx, src.indexOf('function mgsAiColors') + funcAt(src.slice(src.indexOf('function mgsAiColors')), 'mgsAiColors').length);
check('전제 — 정본 블록을 오려 냈다', canon.length > 400, 'len=' + canon.length);

let F = null;
try {
  F = new Function(canon + '\nreturn { mgsDowIdx: mgsDowIdx, mgsSchedHitsDate: mgsSchedHitsDate, mgsYmd: mgsYmd, mgsSchedTime: mgsSchedTime, mgsAiColors: mgsAiColors };')();
} catch (e) { check('정본이 실제로 돌아간다', false, e.message); }
if (F) {
  check('정본이 실제로 돌아간다', typeof F.mgsDowIdx === 'function');
  // 숫자 표기 — 등록 폼 경로가 저장하는 값
  check('숫자 \'3\' 을 수요일(3)로 읽는다', F.mgsDowIdx('3') === 3);
  check('숫자 \'0\' 을 일요일(0)로 읽는다', F.mgsDowIdx('0') === 0);
  check('숫자 0(숫자형)도 읽는다', F.mgsDowIdx(0) === 0);
  // 영문 표기 — 운영 D1 정본 / PATCH 가 저장하는 값
  check('\'Wed\' 를 읽는다', F.mgsDowIdx('Wed') === 3);
  check('\'wed\' 도 읽는다', F.mgsDowIdx('wed') === 3);
  check('\'Friday\' 도 읽는다', F.mgsDowIdx('Friday') === 5);
  // 한글 표기 — AI 명령 경로
  check('\'수\' 를 읽는다', F.mgsDowIdx('수') === 3);
  check('\'월요일\' 을 읽는다', F.mgsDowIdx('월요일') === 1);
  // (짝) 모르는 값은 지어내지 않는다 — 없으면 «전부 0(일요일)» 같은 엉터리도 통과한다
  check('(짝) 모르는 값은 null 이다', F.mgsDowIdx('요일아님') === null && F.mgsDowIdx('') === null
    && F.mgsDowIdx(null) === null && F.mgsDowIdx('7') === null);

  console.log('\n   ② -2 「이 날 열리는가」');
  const D = (y, m, d) => new Date(y, m - 1, d);
  const wed = D(2026, 9, 23), thu = D(2026, 9, 24), mon = D(2026, 9, 21), fri = D(2026, 9, 25);
  const one  = { schedule_kind: 'one_off',  day_of_week: null,  scheduled_date: '2026-09-23', start_time: '16:00', status: 'active' };
  const num  = { schedule_kind: 'recurring', day_of_week: '3',   scheduled_date: null, start_time: '14:20', status: 'active' };
  const eng  = { schedule_kind: 'recurring', day_of_week: 'Wed', scheduled_date: null, start_time: '15:00', status: 'active' };
  const many = { schedule_kind: 'recurring', day_of_week: 'Mon,Wed', scheduled_date: null, start_time: '15:00', status: 'active' };
  const both = { schedule_kind: 'recurring', day_of_week: '1',   scheduled_date: '2026-09-25', start_time: '20:00', status: 'active' };
  const dead = { schedule_kind: 'recurring', day_of_week: '3',   scheduled_date: null, start_time: '18:00', status: 'cancelled' };
  check('1회차는 그 날짜에만 열린다', F.mgsSchedHitsDate(one, wed) === true && F.mgsSchedHitsDate(one, thu) === false);
  check('숫자 반복이 매주 그 요일에 열린다', F.mgsSchedHitsDate(num, wed) === true && F.mgsSchedHitsDate(num, thu) === false);
  check('영문 반복이 매주 그 요일에 열린다', F.mgsSchedHitsDate(eng, wed) === true);
  check('쉼표로 여러 요일도 읽는다', F.mgsSchedHitsDate(many, mon) === true && F.mgsSchedHitsDate(many, wed) === true);
  /* 🔴 sessions/today 가 `if (scheduled_date) … else if (day_of_week)` 라 날짜가 이긴다.
     화면이 요일을 먼저 보면 두 칸이 다 찬 행이 엉뚱한 요일에 «매주» 그려진다. */
  /* 구분자는 서버 정본 admDowMatches(api-admin.ts)와 같은 집합 — 쉼표만 보면
     '1 3 5'·'Mon Thu'·'월/수'·'화·목' 이 조용히 한 칸도 안 그려진다. */
  for (const [raw, hitMon, hitWed] of [['1 3 5', true, true], ['Mon Thu', true, false],
                                       ['월/수', true, true], ['화·목', false, false]]) {
    const r = { schedule_kind: 'recurring', day_of_week: raw, scheduled_date: null, start_time: '15:00', status: 'active' };
    check('구분자 «' + raw + '» 를 정본과 같은 집합으로 읽는다',
      F.mgsSchedHitsDate(r, mon) === hitMon && F.mgsSchedHitsDate(r, wed) === hitWed);
  }
  check('두 칸이 다 차면 날짜가 이긴다', F.mgsSchedHitsDate(both, fri) === true && F.mgsSchedHitsDate(both, mon) === false);
  check('(짝) 취소된 예약은 열리지 않는다', F.mgsSchedHitsDate(dead, wed) === false);
  /* ⚠️ 날짜 비교를 new Date('YYYY-MM-DD') 로 하면 UTC 자정이라 한국 시간대에서 하루 밀린다. */
  check('날짜를 로컬 기준으로 읽는다(하루 안 밀린다)', F.mgsYmd(D(2026, 1, 5)) === '2026-01-05');
  check('시각은 HH:MM 만 받는다', !!F.mgsSchedTime({ start_time: '09:05' }) && F.mgsSchedTime({ start_time: '' }) === null);
}

console.log('\n── ③ 그 판정을 «실제로 부르는가» (배선) ──────────────');
/* ⛔ 「그 이름이 파일에 있는가」로 묻지 않는다 — 두 뷰 각각의 몸통 안에서 찾는다. */
const weekBody  = funcAt(src, 'renderDSchedWeek');
const monthBody = funcAt(src, 'renderDSchedMonth');
check('전제 — 두 뷰 함수를 오려 냈다', weekBody.length > 800 && monthBody.length > 800,
  'week=' + weekBody.length + ' month=' + monthBody.length);
check('주간 뷰가 정본을 부른다', /mgsSchedHitsDate\s*\(/.test(weekBody));
check('월간 뷰도 정본을 부른다 — 예약 레이어가 있다', /mgsSchedHitsDate\s*\(/.test(monthBody));
check('월간 뷰가 aiSchedules 를 실제로 돈다', /_dSchedState\.aiSchedules/.test(monthBody));
/* 옛 표가 어느 쪽에도 되살아나지 않았는가 — 되살리면 같은 사고가 그대로 재현된다.
   ⚠️ 주석을 벗긴 사본으로 판정한다(설명 주석이 그 글자를 담고 있다). */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
check('옛 dowToIdx 표가 되살아나지 않았다',
  !/dowToIdx/.test(strip(weekBody)) && !/dowToIdx/.test(strip(monthBody)));
check('요일 표를 두 뷰에 복제하지 않았다(정본은 한 곳)',
  (src.match(/MGS_DOW_IN\s*=/g) || []).length === 1);
/* 🪤 「그 이름을 부르는가」만 물으면 `if (false) continue;` 한 글자로 뚫린다 — 정본은 그대로
   두고 그 답을 «안 쓰게» 만드는 변이다(브라우저 검사에서 실제로 카드가 전부 그려졌다).
   ⛔ `if (!mgsSchedHitsDate(` 라는 «식 모양» 을 글자로 못 박지 않는다(정당한 리팩터가 빨간불).
   «죽은 조건이 없는가» 로 묻는다 — 뜻은 같고 리팩터에는 걸리지 않는다. */
const deadCond = /if\s*\(\s*(false|true)\s*\)|&&\s*false\b|\|\|\s*true\b/;
check('주간 뷰에 «항상 참/거짓» 인 죽은 조건이 없다', !deadCond.test(strip(weekBody)));
check('월간 뷰에 «항상 참/거짓» 인 죽은 조건이 없다', !deadCond.test(strip(monthBody)));

console.log('\n── ④ 성공하면 캘린더도 다시 읽는가 (세 경로 전부) ──');
/* ⛔ 파일 어딘가에 그 이름이 있는가로 묻지 않는다 — 각 성공 갈래 «안» 인지 본다.
   🔴 경로가 «셋» 이다(등록·일정변경·취소). 2026-09-22 에 등록만 고치고 취소를 빠뜨려
      사장님 제보의 절반(「취소가 반영 안 됨」)이 그대로 남았다 — 함정 대조가 잡았다.
   ⚠️ loadAiSchedules() 는 목록 HTML 만 갈아끼우고 _dSchedState.aiSchedules 를 안 건드린다.
      그래서 둘 다 불러야 캘린더가 따라온다. */
/* ⛔ 함수를 통째로 보면 «catch 로 옮기는» 변이도 통과한다 — 성공 갈래 «안» 만 자른다.
   ⚠️ 취소는 `if (j.ok) { … }` 라 여는 중괄호 «뒤» 부터, 나머지 둘은 성공 메시지 뒤부터. */
const PATHS = [
  // ⚠️ (2026-09-23) 인자 끝(`);`)까지 못 박지 않는다 — say 에 3번째 인자('submit')가 붙자 거짓 FAIL 이 났다.
  ['등록',     () => restOfBlock(src, src.indexOf("say(out, '#4ade80'"))],
  ['일정변경', () => { const f = funcAt(src, 'submitReschedule');
                      return restOfBlock(f, f.indexOf("say('✅ 일정을 옮겼습니다")); }],
  ['취소',     () => { const f = funcAt(src, 'cancelAiSchedule');
                      return restOfBlock(f, f.indexOf('{', f.indexOf('if (j.ok)')) + 1); }],
];
for (const [name, cut] of PATHS) {
  const blk = cut();
  check('전제 — ' + name + ' 성공 갈래를 잘라 냈다', blk.length > 60, 'len=' + blk.length);
  check(name + ' 뒤 목록을 다시 읽는다', /loadAiSchedules\s*\(\s*\)/.test(blk));
  check(name + ' 뒤 캘린더도 다시 읽는다', /loadDStudentSchedule/.test(blk));
}

console.log('\n── ⑤ 주간 격자를 «실제로 그려» 카드를 센다 ──────────');
/* 🔴 ③절(「그 정본을 부르는가」)만으로는 `if (!mgsSchedHitsDate(…)) continue;` 를
   `mgsSchedHitsDate(…);` 로 바꾸는 변이를 못 잡는다 — 이름도 «있고» 죽은 조건도 «없다».
   실측: 그 변이로 주간 카드가 2장 → 21장(취소·격자 밖까지 전부)인데 PASS 38 / FAIL 0.
   그래서 가짜 DOM 에 실제로 그려 «몇 장이 어느 칸에» 나오는가를 답으로 묻는다. */
const weekFn = funcAt(src, 'renderDSchedWeek');
check('전제 — 주간 렌더 함수를 잘라 냈다', weekFn.length > 2000, 'len=' + weekFn.length);
let drew = null, drawErr = '';
try {
  const sandbox = new Function(
    canon + '\n' + weekFn + '\n' +
    'function mgsEnrHasLiveClass(){ return true; }\n' +
    'function mgsSetGhostNote(){}\n' +
    'return function (state) {\n' +
    '  var out = { label: "", html: "" };\n' +
    '  var _dSchedState = state;\n' +
    '  var document = { getElementById: function (id) {\n' +
    '    return { set textContent(v){ out.label = v; }, set innerHTML(v){ out.html = v; } };\n' +
    '  } };\n' +
    '  (' + weekFn + ')();\n' +
    '  return out;\n' +
    '};'
  )();
  /* 2026-09-20(일) ~ 09-26(토). 수요일은 09-23 = i 3. */
  const st = (dow, date, time, extra) => Object.assign({
    schedule_kind: date ? 'one_off' : 'recurring',
    day_of_week: dow, scheduled_date: date, start_time: time,
    status: 'active', class_type: 'regular'
  }, extra || {});
  drew = sandbox({
    weekStart: new Date(2026, 8, 20),
    enrollments: [],
    aiSchedules: [
      st('3', null, '14:20'),                      // 숫자 반복 → 수 1장
      st('Wed', null, '15:00'),                    // 영문 반복 → 수 1장
      st(null, '2026-09-23', '16:00'),             // 1회차    → 수 1장
      st('Mon,Wed', null, '17:00'),                // 나열     → 월·수 2장
      st('3', null, '18:00', { status: 'cancelled' }),   // 취소     → 0장
      st(null, '2026-10-05', '19:00'),             // 격자 밖  → 0장
    ]
  });
} catch (e) { drawErr = e.message; }
check('주간 격자가 실제로 그려진다', !!drew && !!drew.html, drawErr);
if (drew && drew.html) {
  const cards = drew.html.match(/title="🤖 AI 등록[^"]*"/g) || [];
  const cols  = (drew.html.match(/\* (\d) \/ 7 \+ 2px/g) || []).map(x => x.match(/(\d)/)[1]);
  check('그려야 할 것은 그린다 — 카드 5장', cards.length === 5, '실제 ' + cards.length + '장');
  /* 🪤 «없는가» 를 drew.html 전체로 묻지 말 것 — 격자의 시간 눈금(>18:00<)이 걸려
     멀쩡한 코드가 거짓 FAIL 이 난다(CLAUDE.md 가 적어 둔 그 함정을 실제로 밟았다).
     카드 title 만 본다. */
  check('(짝) 취소된 예약은 안 그린다', !cards.some(c => /18:00/.test(c)), cards.slice(0, 3).join(' | ') + (cards.length > 3 ? ' …(' + cards.length + '장)' : ''));
  check('(짝) 이 주 밖의 1회차는 안 그린다',
    !cards.some(c => /2026-10-05|19:00/.test(c)), cards.slice(0, 3).join(' | ') + (cards.length > 3 ? ' …(' + cards.length + '장)' : ''));
  check('수요일 칸(i=3)에 4장이 놓인다', cols.filter(c => c === '3').length === 4, cols.join(','));
  check('월요일 칸(i=1)에 1장이 놓인다', cols.filter(c => c === '1').length === 1, cols.join(','));
  check('그 밖의 요일에는 안 놓인다', cols.every(c => c === '1' || c === '3'), cols.join(','));
}

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) process.exit(1);
