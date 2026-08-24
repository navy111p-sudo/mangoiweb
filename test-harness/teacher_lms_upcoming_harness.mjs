// ════════════════════════════════════════════════════════════════════════════
// teacher_lms_upcoming_harness.mjs — 강사 화면에 «카페24 LMS 예약 수업» 이 뜨는가
//   (2026-08-24 Hannah 「내일 수업이 안 보인다」)
//
// [무엇이 문제였나] 강사 포털의 오늘 목록·주간 시간표·앞으로 7일은 전부 D1
//   `class_schedules` 만 본다. 그런데 카페24 예약은 그 표에 **한 줄도 안 들어온다**
//   (`cafe24-sync.ts` 는 class_schedules 를 쓰지 않는다). 들어오는 곳은 `attendance` 의
//   `c24-*` 씨앗뿐인데, 포털이 그것을 `date <= 오늘` 로 잘라 «끝난 수업» 으로만 읽고 있었다.
//   → 카페24 수업이 «미래» 로 보일 경로가 아예 없었다.
//   겹친 두 번째 원인: `mangoi_###` 계정은 표시이름이 아이디 그대로(`Mangoi_167`)라
//   카페24 번호 해석(teacher_profiles 완전일치)이 **영원히 0건**이었다.
//
// [왜 문자열 검사로는 모자란가] 이 사고는 「함수가 있나」가 아니라 「행이 실제로 실리나」다.
//   CLAUDE.md 2장 「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」과 같은 종류라,
//   **컴파일해서 가짜 DB 로 실제로 돌린다**(no_show_false_alarm_harness ⑩ 과 같은 방식).
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src/api-teacher.ts');
const src = readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const failed = [];
function check(name, ok) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failed.push(name); console.log('  ❌ ' + name); }
}

// ── ① 코드 모양 (컴파일이 안 되는 환경에서도 최소한 이건 지킨다) ──────────────
console.log('\n[ ① 예약 수업을 읽는 자리가 있는가 ]');
check('예약(scheduled) 행을 따로 읽는다', src.includes('lmsFutureRs'));
check('주간 시간표에 싣는다', /weekDays\[wi\]\.items\.push/.test(src));
check('앞으로 7일에 싣는다', /upcoming\.push\(\{[\s\S]{0,400}source: 'lms'/.test(src));
check('카페24 번호 해석에 원부 이름을 먼저 쓴다', /nameKeys[\s\S]{0,240}resolvedRows/.test(src));

// ── ② 컴파일해서 진짜로 돌린다 ────────────────────────────────────────────────
console.log('\n[ ② 컴파일해 가짜 DB 로 실제 실행 ]');

const KST = 9 * 3600 * 1000;
const ymd = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const NOW = Date.now();
const TODAY = ymd(NOW);
const TOMORROW = ymd(NOW + 86400000);
// 내일 09:00 KST → UTC ms (카페24 씨앗의 joined_at 과 같은 눈금)
const TOMORROW_0900 = Date.parse(TOMORROW + 'T09:00:00Z') - KST;

/* 가짜 D1 — SQL 문자열과 바인드값을 보고 답한다.
   ⚠️ 모르는 SQL 은 빈 결과를 준다(운영 DB 도 표가 없으면 그렇게 실패한다). */
function makeDB(plan, log) {
  const answer = (sql, args) => {
    log.push({ sql: sql.replace(/\s+/g, ' ').trim(), args });
    for (const [match, rows] of plan) {
      if (typeof match === 'function' ? match(sql, args) : sql.includes(match)) {
        return typeof rows === 'function' ? rows(sql, args) : rows;
      }
    }
    return [];
  };
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: answer(sql, args) }),
    first: async () => answer(sql, args)[0] ?? null,
    run: async () => ({}),
  });
  return { prepare: (sql) => stmt(sql, []), exec: async () => ({}), batch: async () => [] };
}

let mod = null, why = '';
try {
  const ts = (await import(pathToFileURL(
    resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  const stripped = src.replace(/^import\s*\{[^}]*\}\s*from\s*'\.\/[^']+';\s*$/gm, '');
  const js = ts.transpileModule(stripped, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  /* 바깥 의존은 전부 스텁 — 이 하니스가 보는 것은 «예약 행이 실리는가» 하나뿐이다.
     신원(actor)은 globalThis 로 갈아끼워 시나리오마다 다른 계정으로 돌린다. */
  const stub = `
    const PH_MANAGERS = [];
    const otherAccountOf = () => null;
    const getReadingBandFor = async () => null;
    const selectInChunks = async () => [];
    const getAdminActor = async () => globalThis.__ACTOR;
  `;
  mod = await import('data:text/javascript;base64,'
    + Buffer.from(stub + js, 'utf8').toString('base64'));
} catch (e) { why = String(e && e.message || e); }

if (!mod) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + why.slice(0, 100) + ')');
  console.log('     → cloudflare-deploy 에서 npm ci 를 먼저 돌리면 이 묶음이 살아난다.');
} else {
  const TEACHER = { ok: true, username: 'Mangoi_167', name: 'Mangoi_167', role: 'teacher', isTeacher: true };

  /* 카페24 씨앗 두 줄 — 강사번호 189(진짜 Hannah).
       · 내일 09:00 «예정»(scheduled)  ← 이번에 고친 것
       · 어제 09:00 «완료»(present)    ← 예전부터 되던 것이 안 깨졌는지 함께 본다 */
  const YESTERDAY = ymd(NOW - 86400000);
  const YESTERDAY_0900 = Date.parse(YESTERDAY + 'T09:00:00Z') - KST;
  const c24Rows = [
    {
      room_id: 'c24-99001', user_id: 's7001', username: '김민준',
      joined_at: TOMORROW_0900, left_at: TOMORROW_0900 + 25 * 60000,
      date: TOMORROW, status: 'scheduled', teacher_uid: '189',
      student_en: 'Minjun Kim', level: 'L3', textbook: 'BTS 2',
    },
    {
      room_id: 'c24-98002', user_id: 's7002', username: '이서연',
      joined_at: YESTERDAY_0900, left_at: YESTERDAY_0900 + 30 * 60000,
      date: YESTERDAY, status: 'present', teacher_uid: '189',
      student_en: 'Seoyeon Lee', level: 'L2', textbook: 'BTS 1',
    },
  ];

  async function run(plan) {
    globalThis.__ACTOR = TEACHER;
    const log = [];
    const env = { DB: makeDB(plan, log) };
    const url = new URL('https://mangoi.ai/api/teacher/portal');
    const res = await mod.handleTeacherApi(new Request(url, { method: 'GET' }), url, env);
    return { body: await res.json(), log };
  }

  // 표 이름으로 갈래를 나눈다(정확히 그 표를 물었을 때만 답한다).
  const LINKED = [
    ['FROM teacher_account_links', [{ teacher_id: '24', teacher_name: 'HANNAH' }]],
    ['FROM teachers', []],   // 표시이름이 'Mangoi_167' 이라 원부에는 없다 — 실제와 같다
  ];
  const PROFILE_HANNAH = ['FROM teacher_profiles',
    (sql, a) => (String(a[0]).toUpperCase() === 'HANNAH'
      ? [{ korean_name: 'HANNAH', english_name: 'Teacher Hannah' }] : [])];
  const PAYROLL_189 = ['FROM teacher_payroll_auto',
    (sql, a) => (String(a[0]) === 'Teacher Hannah' ? [{ teacher_id: '189' }] : [])];
  /* 🔴 attendance 는 «진짜 DB 처럼» 거른다.
     처음엔 두 조회 모두에 같은 행을 돌려주는 헐거운 스텁이었는데, 그러면 「끝난 수업」
     조회까지 내일 행을 받아 **없는 버그**를 만들어 낸다(실제로 한 번 그렇게 나왔다).
     조건절을 그대로 흉내 내야 「오늘 목록에 안 넣는다」가 진짜 검사가 된다. */
  const ATT = [(sql) => sql.includes('FROM attendance'), (sql, a) => {
    if (!a.includes('189')) return [];                       // 다른 강사 번호로는 아무것도 안 준다
    if (sql.includes("a.status = 'present'")) {               // 끝난 LMS 수업: [since, today]
      const [since, until] = a;
      return c24Rows.filter((r) => r.status === 'present' && r.date >= since && r.date <= until);
    }
    const [ws, we, today, ahead] = a;                         // 예약·주간: [주시작, 주끝, 오늘, 오늘+7]
    return c24Rows.filter((r) => (r.date >= ws && r.date <= we) || (r.date > today && r.date <= ahead));
  }];

  // ── A. 본사가 계정을 연결해 준 뒤 (고침이 실제로 먹는가) ──────────────────
  console.log('\n  ── A. 계정 연결 완료 · 내일 카페24 수업 1건 ──');
  {
    const { body, log } = await run([...LINKED, PROFILE_HANNAH, PAYROLL_189, ATT]);
    check('신원이 «연결됨» 으로 잡힌다', body.ok === true && body.me.identity_unlinked === false);
    check('🔴 내일 수업이 «앞으로 7일» 에 실린다',
      (body.upcoming || []).length === 1 && body.upcoming[0].date === TOMORROW);
    const day = (body.week.days || []).find((d) => d.date === TOMORROW);
    check('🔴 내일 수업이 «주간 시간표» 에도 실린다', !!day && day.items.length === 1);
    /* ⚠️ 회귀가 나면 목록이 «비어» 있다. 그때 `[0].xxx` 를 그냥 읽으면 예외로 죽어
       나머지 검사가 통째로 안 돌고 원인도 흐려진다 — 반드시 빈 값을 견디게 쓴다. */
    const wk0 = (day && day.items[0]) || {};
    const up0 = (body.upcoming && body.upcoming[0]) || {};
    check('시각·길이·학생이 그대로 실린다',
      wk0.start_time === '09:00' && wk0.duration_min === 25 && wk0.student_name === '김민준');
    check('출처를 밝힌다(화면이 LMS 배지를 붙이는 근거)',
      up0.source === 'lms' && wk0.source === 'lms');
    check('⛔ 유형을 추측하지 않는다 (체험이라고 적지 않음)',
      up0.class_kind === 'regular' && up0.is_level_test === false);
    /* 🔴 여기가 사고가 날 자리다 — 예약 행에는 망고아이 «방» 이 없다. 오늘 목록에 끼우면
       [입장] 이 붙어 아무도 없는 방으로 보내게 된다.
       ⚠️ 「classes 가 비었나」로 재면 안 된다 — 끝난 LMS 수업(어제)은 **들어가는 게 맞다**.
          내일 행(c24-99001)이 거기 없는지만 본다. */
    check('🔴 «오늘 목록» 에는 예약 행을 넣지 않는다 (방이 없어 빈 방으로 보내게 된다)',
      !(body.classes || []).some((c) => c.room_id === 'c24-99001'));
    check('주간 시간표에서 흐리게 처리되지 않는다 (진짜 수업이다)', wk0.kind === 'class');
    /* ⚠️ 예전부터 되던 것이 안 깨졌는지 — 끝난 LMS 수업은 그대로 «오늘 목록» 밖의
       일지 대상으로 남아야 한다. 이 하니스가 그 경로까지 함께 붙잡아 둔다. */
    const yDay = (body.week.days || []).find((d) => d.date === YESTERDAY);
    check('끝난 카페24 수업도 주간 시간표에 남는다 (지난 주로 이동해도 시간표가 빈칸이 아니다)',
      !yDay || (yDay.items.length === 1 && (yDay.items[0] || {}).student_name === '이서연'));
    check('⛔ 끝난 수업은 «앞으로 7일» 에 들어가지 않는다',
      !(body.upcoming || []).some((u) => u.date === YESTERDAY));
    // 조회가 «예정» 을 실제로 물었는지 — date<=오늘 로만 자르면 이 사고가 그대로 재발한다
    const q = log.find((e) => e.sql.includes('FROM attendance') && e.args.includes('189')
                              && e.sql.includes('a.date >') );
    check('예약 구간을 실제로 조회한다 (a.date > 오늘)', !!q && q.args.includes(TODAY));
  }

  // ── B. 연결 전 = 2026-08-24 사장님이 본 화면 그대로 ────────────────────────
  console.log('\n  ── B. 계정 미연결 (제보 당시 상태) ──');
  {
    const { body } = await run([
      ['FROM teacher_account_links', []], ['FROM teachers', []],
      PROFILE_HANNAH, PAYROLL_189, ATT,
    ]);
    check('«연결 안 됨» 으로 알린다 (수업 없음이라고 말하지 않는다)',
      body.me.identity_unlinked === true);
    check('⛔ 그래도 남의 수업을 보여주지 않는다',
      (body.upcoming || []).length === 0 && (body.classes || []).length === 0);
  }

  // ── C. 카페24 이름 후보가 둘이면 아무것도 붙이지 않는다 ────────────────────
  console.log('\n  ── C. 카페24 번호 후보가 2개 (누구인지 모름) ──');
  {
    const { body } = await run([
      ...LINKED, PROFILE_HANNAH,
      ['FROM teacher_payroll_auto', [{ teacher_id: '189' }, { teacher_id: '24' }]],
      ATT,
    ]);
    check('⛔ 모르면 안 보여주는 쪽으로 실패한다 (남의 수업 금지)',
      (body.upcoming || []).length === 0);
  }
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log('  실패 항목:'); failed.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
