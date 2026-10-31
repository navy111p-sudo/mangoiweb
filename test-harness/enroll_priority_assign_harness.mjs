// 🧑‍🏫 수강신청 «등록 화면» 항목 정리 + ③ 배정 우선순위 하니스 — 2026-08-12
//
//   배경: 「수업 등록 창에서 강사를 직접 지정할 수 있게 되어 있다 — 요구사항과 불일치」.
//     등록 때 사람이 «입력·선택» 하는 것은 아래 6가지뿐이어야 한다.
//       ① 학생 아이디  ② 레벨 구분(레벨/체험/정규)  ③ 요일·시간 우선 / 강사 우선
//       ④ 그룹수업 여부(1:1 / 그룹)  ⑤ 시작일  ⑥ 수업 기간(1~12개월 / 무기한)
//     강사를 «이름으로 지명» 하는 «항상 떠 있는» 칸은 이 화면에 두지 않는다. 최종적으로
//     누구를 붙일지는 ③ 과 «그 시간에 실제로 비어 있는가» 로 「▸ 처리」 단계에서 정해진다.
//
//   🔄 2026-08-14 갱신 (현장 피드백 ③④) — 위 규칙 중 두 가지가 바뀌었다:
//     ③ «강사 우선» 을 골라도 강사 목록이 안 나와서, 운영자 눈에는 눌러도 아무 일도
//        안 일어나는 칸으로 보였다. → 「강사 우선」일 때**만** 강사 목록(select)이 열린다.
//        이건 «지명» 이 아니라 «희망» 이다 — 서버는 enrollments.teacher_name 으로 이미 받고 있고,
//        그 시간에 실제로 비는지는 여전히 「▸ 처리」 가 본다. 자유 입력 칸은 여전히 금지다.
//     ④ 몇 개월 할지 고르는 칸이 아예 없었다. → ⑥ 수업 기간을 «필수» 로 추가.
//
//   이 하니스가 못 박는 것 — 전부 조용히 되돌아가기 쉬운 것들:
//     ① 등록 표에 «항상 떠 있는» 강사 이름 칸이 다시 생기면 안 된다
//        (강사 목록은 ③ 이 「강사 우선」일 때만 열리는 select 하나뿐)
//     ② 없앤 칸(이름·패키지·수강료)의 «값» 까지 사라지면 서버 필수값이 깨진다 → hidden 유지
//     ③ ✕ 초기화가 학생 아이디를 안 지우면 «지웠는데 옛 학생으로 등록» 된다
//        (옛 코드는 `input[type="text"]` 로 잡았는데 아이디 칸엔 type 속성이 없었다)
//     ④ 우선순위가 서버까지 실제로 실려 가야 한다 (단건·일괄 POST 둘 다)
//     ⑤ 우선순위대로 강사가 «이름 없이» 정해져야 한다 — 아무도 안 비면 멋대로 배정하지 말고 막는다
//
//   실행: node test-harness/enroll_priority_assign_harness.mjs
import { readFileSync, mkdtempSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CF = join(ROOT, 'cloudflare-deploy');

const adminHtml = readFileSync(join(CF, 'public', 'admin.html'), 'utf8');
const coreSrc = readFileSync(join(CF, 'public', 'js', 'adm-core.js'), 'utf8');
const actSrc = readFileSync(join(CF, 'src', 'enroll-activate.ts'), 'utf8');
const admSrc = readFileSync(join(CF, 'src', 'api-admin.ts'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 등록 표 <thead> 만 잘라 본다 */
const theadM = /<table id="en-multi-table"[\s\S]*?<thead>([\s\S]*?)<\/thead>/.exec(adminHtml);
const thead = theadM ? theadM[1] : '';
const headers = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
  .map(m => m[1].replace(/<[^>]*>/g, '').trim());

console.log('\n════════ 1부. 등록 표에 남아야 할 칸 / 없어야 할 칸 ════════');
check('등록 표 <thead> 를 찾았다', !!thead);
check('① 학생 아이디 칸이 있다', headers.some(h => h.includes('학생 아이디')), headers);
check('② 레벨 구분(레벨/체험/정규) 칸이 있다', headers.some(h => h.includes('레벨 구분')), headers);
check('③ 배정 우선순위 칸이 있다', headers.some(h => h.includes('배정 우선순위')), headers);
check('④ 그룹수업 여부 칸이 있다', headers.some(h => h.includes('그룹수업')), headers);
check('⑤ 시작일 칸이 있다', headers.some(h => h.includes('시작일')), headers);
// ⛔ 되살아나면 안 되는 칸들
check('⛔ 강사 이름 칸이 없다', !/강사|teacher/i.test(thead), headers);
check('⛔ 「학생 이름」 칸이 없다 (아이디로 찾는다)', !headers.some(h => h.includes('학생 이름')), headers);
check('⛔ 「패키지」 칸이 없다', !headers.some(h => h.includes('패키지')), headers);
check('⛔ 「월 수강료」 칸이 없다', !headers.some(h => h.includes('수강료')), headers);
check('⛔ 「인원 방식」(1:2~1:6 낱개) 칸이 없다', !headers.some(h => h.includes('인원 방식')), headers);

console.log('\n════════ 2부. 행을 그리는 코드 (adm-core.js) ════════');
const rowFnM = /function _addEnrollmentRow\(prefill\)[\s\S]*?\n\}\n/.exec(coreSrc);
const rowFn = rowFnM ? rowFnM[0] : '';
check('_addEnrollmentRow 를 찾았다', !!rowFn);
check('학생 아이디 입력칸(.en-row-uid)이 보이는 칸이다',
  /class="en-row-uid"/.test(rowFn) && !/type="hidden" class="en-row-uid"/.test(rowFn));
check('② 이름·패키지·수강료는 hidden 으로 «값만» 남았다 (서버 필수값 + 자동 요약이 읽는다)',
  /type="hidden" class="en-row-name"/.test(rowFn) &&
  /type="hidden" class="en-row-package"/.test(rowFn) &&
  /type="hidden" class="en-row-fee"/.test(rowFn));
check('③ 우선순위 select 는 schedule / teacher 두 값뿐',
  /v: 'schedule'/.test(rowFn) && /v: 'teacher'/.test(rowFn) && !/v: 'name'/.test(rowFn));
check('④ 그룹수업 여부는 1:1 / 1:N 두 개뿐 (1:2~1:6 낱개 선택 없음)',
  /v: '1:1'/.test(rowFn) && /v: '1:N'/.test(rowFn) && !/'1:2'|'1:3'|'1:4'/.test(rowFn));

/* 🧑‍🏫 2026-08-14 피드백 ③ — 「강사 우선」일 때만 강사 목록이 열린다 */
check('③ 「강사 우선」용 강사 목록 select 가 있다 (en-row-teacher)',
  /class="en-row-teacher"/.test(rowFn));
check('⛔ 강사는 «고르는» 것이지 «치는» 것이 아니다 (자유 입력 칸 금지)',
  !/<input[^>]*class="en-row-teacher"/.test(rowFn));
check('③ 강사 목록은 기본값(요일·시간 우선)에서 접혀 있다',
  /_prioCur === 'teacher' \? '' : ';display:none'/.test(rowFn));
check('③ 우선순위를 바꾸면 강사 목록이 열리고/닫힌다',
  /tsel\.style\.display = \(val === 'teacher'\) \? '' : 'none'/.test(coreSrc));
check('③ 「요일·시간 우선」으로 되돌리면 고른 강사도 비운다 (안 보이는 값이 몰래 등록되지 않게)',
  /if \(val !== 'teacher'\) tsel\.value = ''/.test(coreSrc));
check('③ 강사 목록은 «teachers» 표에서 온다 — 확정 파이프라인이 teacher_name 을 되찾는 그 표',
  /fetch\('\/api\/admin\/teachers'/.test(coreSrc));
check('③ 목록이 비면 «등록된 강사가 없습니다» 라고 말한다 (조용한 빈 칸 금지)',
  /등록된 강사가 없습니다/.test(coreSrc));
check('③ 목록을 못 받으면 그 사실을 말한다 (로딩 중인 채로 두지 않는다)',
  /강사 목록을 불러오지 못했습니다/.test(coreSrc));
check('③ 강사 목록은 한 번만 받아 캐시한다 (행 10개에 10번 부르지 않는다)',
  /__enTeachers \|\| __enTeachersLoading/.test(coreSrc));
check('③ 고른 희망 강사는 「강사 우선」일 때만 서버로 간다',
  /priority === 'teacher'\)\s*\?\s*\(tr\.querySelector\('\.en-row-teacher'\)/.test(coreSrc));

/* 🗓️ 2026-08-14 피드백 ④ — ⑥ 수업 기간(회차) */
check('⑥ 수업 기간 select 가 있다 (en-row-duration)', /class="en-row-duration"/.test(rowFn));
// 🗓️ 2026-08-20 사장님 지시 — 1·3·6·12 «수강권 단위» 만 있어서 2·4·5개월을 넣을 방법이 없었다.
//   1~12 전부 + 무기한으로 넓혔다. ⚠️ 아래 «서버가 아는 값» 검사와 **짝**이다 —
//   한쪽만 넓히면 화면에서 고른 2개월이 서버에서 **에러 없이 null** 이 된다.
check('⑥ 선택지는 1~12개월 전부 + 무기한',
  /for \(let _dm = 1; _dm <= 12; _dm\+\+\)/.test(rowFn) &&
  /durOptionsList\.push\(\{ v: 'unlimited'/.test(rowFn));
check('⑥ 기본값을 몰래 넣지 않는다 («— 선택 —» 이 기본)', /— 선택 —/.test(rowFn));
check('⑥ 안 고르면 등록을 막는다', /const noDur = records\.filter\(r => !r\._duration\)/.test(coreSrc));
check('⑥ 숫자 개월이면 종료일(end_date)을 시작일 + N개월로 함께 저장한다',
  /_enAddMonths\(start, parseInt\(duration, 10\)\)/.test(coreSrc));
check('⑥ 말일 넘침 처리 (1/31 + 1개월이 3/2 로 튀지 않게)',
  /Math\.min\(d, lastDay\)/.test(coreSrc));
check('⑥ 단건·일괄 POST 두 곳 모두 duration_months 를 보낸다',
  (coreSrc.match(/duration_months: r\.duration_months/g) || []).length === 2);
check('⑥ 서버가 enrollments.duration_months 컬럼을 보강한다',
  /_addEnrCol2\('duration_months', 'TEXT'\)/.test(admSrc));
check('⑥ 서버는 아는 값만 저장한다 (오타·옛 폼이 보낸 값 금지) — 1~12 또는 무기한',
  /_durRaw === 'unlimited' \|\| \/\^\(\[1-9\]\|1\[0-2\]\)\$\/\.test\(_durRaw\)/.test(admSrc));
check('⑥ 화면 목록과 서버 허용 범위가 «같은 12개월» 이다 (한쪽만 넓히면 조용히 null)',
  /_dm <= 12/.test(rowFn) && /1\[0-2\]/.test(admSrc));
check('③ 초기 포커스는 학생 아이디 칸 (이름 칸이 없어졌으므로)',
  /querySelector\('\.en-row-uid'\); if \(inp\) inp\.focus\(\)/.test(rowFn));

// ③ ✕ 초기화 — type 선택자로 잡으면 아이디가 안 지워진다
check('✕ 초기화가 type 이 아니라 input 전체를 훑는다 (아이디 칸엔 type 속성이 없다)',
  /querySelectorAll\('input'\)\.forEach/.test(rowFn) &&
  !/input\[type="text"\], input\[type="number"\]/.test(rowFn));
check('✕ 초기화가 아이디 조회 기억(enUidDone)도 지운다 — 같은 아이디 다시 쳐도 조회된다',
  /dataset\.enUidDone = ''/.test(rowFn));

console.log('\n════════ 3부. 우선순위가 서버까지 실려 가는가 ════════');
check('_readEnrollmentRows 가 assign_priority 를 담는다', /assign_priority: priority/.test(coreSrc));
check('이름 칸이 없어졌으므로 student_name 은 «조회된 이름 → 없으면 아이디»',
  /\.en-row-name'\)\?\.value \|\| ''\)\.trim\(\) \|\| uid/.test(coreSrc));
check('필수값 검증이 «이름» 이 아니라 «학생 아이디» 다',
  /records\.filter\(r => !r\.student_user_id/.test(coreSrc));
const postCount = (coreSrc.match(/assign_priority: r\.assign_priority/g) || []).length;
check('단건·일괄 POST 두 곳 모두 assign_priority 를 보낸다', postCount === 2, { postCount });
/* 👨‍🏫 (2026-08-13 #03) 고른 강사가 «저장까지» 가야 한다 (완료 기준 3) */
const teacherPostCount = (coreSrc.match(/teacher_name: r\.teacher_name/g) || []).length;
check('단건·일괄 POST 두 곳 모두 teacher_name 을 보낸다', teacherPostCount === 2, { teacherPostCount });
/* ⚠️ 변수명은 2026-08-14 현장 피드백 반영 때 teacherName → wantTeacher 로 바뀌었다.
   검사의 «뜻» 은 그대로다 — 「강사 우선」일 때만 읽고, 빈 값은 null 로 보낸다. */
check('_readEnrollmentRows 가 teacher_name 을 담는다 (시간 우선이면 빈 값)',
  /teacher_name: wantTeacher \|\| null/.test(coreSrc) &&
  /priority === 'teacher'\)[\s\S]{0,120}\.en-row-teacher'\)\?\.value/.test(coreSrc));
check('빈 값은 null 로 보낸다 — \'\' 를 넣으면 서버가 «이름이 있다» 로 읽는다',
  /teacher_name: wantTeacher \|\| null/.test(coreSrc));
check('서버 INSERT 가 teacher_name 을 받는다 (이미 있던 컬럼)',
  /_addEnrCol2\('teacher_name', 'TEXT'\)/.test(admSrc) && /b\.teacher_name \|\| null/.test(admSrc));
check('「▸ 처리」가 적혀 있는 이름을 자동 배정보다 «먼저» 본다',
  /\} else if \(e\.teacher_name\) \{/.test(actSrc));
check('서버가 enrollments.assign_priority 컬럼을 보강한다',
  /_addEnrCol2\('assign_priority', 'TEXT'\)/.test(admSrc));
check('서버 INSERT 에 assign_priority 가 들어간다',
  // ⚠️ 뒤에 컬럼이 더 붙을 수 있다(2026-08-14 duration_months). 마지막 칸이라고 가정하지 않는다.
  /assign_priority(,\s*\w+)*\)\s*VALUES/.test(admSrc) && /const _prio = b\.assign_priority === 'teacher'/.test(admSrc));
check('알 수 없는 값은 schedule 로 떨어진다 (자유 문자열 저장 금지)',
  /b\.assign_priority === 'teacher' \? 'teacher' : 'schedule'/.test(admSrc));

console.log('\n════════ 4부. 「▸ 처리」 — 이름을 대지 않아도 강사가 정해지는가 ════════');
check('plan 이 assign_priority 를 내려 준다', /assign_priority: assignPriority/.test(actSrc));
check('자동 배정 근거(continuity / free)를 함께 내려 준다', /auto: autoAssigned/.test(actSrc));
// (2026-08-13 #03 로 이름을 «고를 수는» 있게 됐지만, 비워 두고 넘어가는 길은 그대로다 → 막힘 없음)
check('⛔ 「강사를 골라 주세요」 라는 막힘은 없다 — 이름을 안 대도 배정된다',
  !/blockers\.push\('강사를 골라 주세요/.test(actSrc));
check('아무도 안 비고 가르치던 강사도 없으면 «막는다» (멋대로 배정하지 않는다)',
  /blockers\.push\('배정할 강사가 없습니다/.test(actSrc));

// 실제로 돌려 본다 — esbuild 로 번들해 가짜 D1 을 물린다
console.log('\n──────── 4-2. buildEnrollPlan 실행 (가짜 D1, 운영 DB 무접촉) ────────');
// ⚠️ (2026-08-12) bin/esbuild 를 node 로 직접 실행하면 안 된다 — Windows 에선 JS 심이라
//   돌지만, Linux(CI)에선 그 자리가 네이티브 ELF 바이너리라 node 가 «\x7fELF …» 를 JS 로
//   읽다 죽는다. 이걸로 main 자동배포가 3연속 차단됐다. → JS API(buildSync)로 크로스플랫폼.
let esbuildApi = null;
try {
  const { createRequire } = await import('node:module');
  esbuildApi = createRequire(join(CF, 'package.json'))('esbuild');
} catch (e) { /* 미설치 → 아래에서 건너뜀 */ }
if (!esbuildApi) {
  console.log('  ⏭ esbuild 없음 — 실행 검증 건너뜀 (정적 검사만 유효)');
} else {
  const out = join(mkdtempSync(join(tmpdir(), 'enrollplan-')), 'bundle.mjs');
  esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'enroll-activate.ts')],
    bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent' });
  const { buildEnrollPlan } = await import('file://' + out.replace(/\\/g, '/'));

  const TEACHERS = [{ id: 't1', name: 'Melca' }, { id: 't2', name: 'Anna' }, { id: 't3', name: 'Belle' }];
  const makeEnv = ({ enrollment, freeIds, keepTeacher }) => {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const mk = (sql, binds) => ({
      bind: (...b) => mk(sql, b),
      async first() {
        const s = norm(sql);
        if (s.startsWith('SELECT * FROM enrollments')) return enrollment;
        if (s.includes('FROM students_erp')) return { user_id: enrollment.student_user_id, korean_name: '김원당', parent_phone: '010-1234-5678' };
        if (s.includes('FROM class_schedules cs JOIN teachers t')) return keepTeacher || null;
        if (s.includes('FROM teachers WHERE id =')) return TEACHERS.find(t => t.id === binds[0]) || null;
        if (s.includes('FROM teachers WHERE name =')) return TEACHERS.find(t => t.name === binds[0]) || null;
        if (s.includes('COUNT(*) AS n FROM class_schedules')) return { n: 0 };
        return null;
      },
      async all() {
        const s = norm(sql);
        if (s.includes('FROM teachers WHERE active = 1')) return { results: TEACHERS };
        if (s.includes('FROM class_schedules')) {
          return { results: TEACHERS.filter(t => !freeIds.includes(t.id)).map(t => ({
            teacher_id: t.id, scheduled_date: '2026-09-07', start_time: '19:20',
            duration_min: 20, day_of_week: null, status: 'active' })) };
        }
        return { results: [] };
      },
      async run() { return { meta: {} }; },
    });
    return { DB: { prepare: (sql) => mk(sql, []), exec: async () => {} } };
  };

  const BASE = {
    id: 1, student_user_id: 'wondang01', student_name: '김원당', package: '정규수업',
    days_of_week: '월수', time: '19:20', class_size: '1:1', type: '정규수업',
    started_at: Date.parse('2026-09-01T00:00:00Z'),
  };
  const cases = [
    ['요일·시간 우선 — 비는 강사로 자동 배정 (이름 안 댐)',
      { ...BASE, assign_priority: 'schedule' }, ['t2', 't3'], null, 'Anna', 'free', true, null],
    ['요일·시간 우선 — 가르치던 강사가 비면 그 사람 유지',
      { ...BASE, assign_priority: 'schedule' }, ['t2', 't3'], { id: 't3', name: 'Belle' }, 'Belle', 'continuity', true, null],
    ['요일·시간 우선 — 가르치던 강사가 바쁘면 시간을 택한다',
      { ...BASE, assign_priority: 'schedule' }, ['t2'], { id: 't1', name: 'Melca' }, 'Anna', 'free', true, null],
    ['강사 우선 — 가르치던 강사가 바빠도 유지 + 경고',
      { ...BASE, assign_priority: 'teacher' }, ['t2'], { id: 't1', name: 'Melca' }, 'Melca', 'continuity', true, '강사 우선'],
    ['강사 우선인데 가르치던 강사가 없음 — 비는 사람 + 경고',
      { ...BASE, assign_priority: 'teacher' }, ['t3'], null, 'Belle', 'free', true, '가르치던 강사가 없습니다'],
    /* 👨‍🏫 (2026-08-13 수정요청 #03) 화면에서 고른 이름이 «실제로 그 강사를 붙이는가».
       등록 폼이 teacher_name 을 넣어 주므로, 가르치던 강사(Melca)가 있어도 고른 사람이 이긴다. */
    ['강사 우선 + 이름을 직접 고름 — 가르치던 강사보다 «고른 사람» 이 우선',
      { ...BASE, assign_priority: 'teacher', teacher_name: 'Belle' }, ['t2', 't3'],
      { id: 't1', name: 'Melca' }, 'Belle', null, true, null],
    ['강사 우선 + 명부에 없는 이름 — 막지 않고 경고 + 자동 배정으로 넘어간다',
      { ...BASE, assign_priority: 'teacher', teacher_name: 'NoSuchTeacher' }, ['t2'],
      null, 'Anna', 'free', true, '못 찾았습니다'],
    ['우선순위 없는 옛 데이터 — schedule 로 읽는다',
      { ...BASE, assign_priority: null }, ['t1'], null, 'Melca', 'free', true, null],
    ['아무도 안 비고 가르치던 강사도 없음 — 막는다',
      { ...BASE, assign_priority: 'schedule' }, [], null, null, null, false, null],
  ];
  for (const [name, enr, freeIds, keep, wantName, wantAuto, wantNoBlocker, wantWarn] of cases) {
    let p = null, err = null;
    try { p = await buildEnrollPlan(makeEnv({ enrollment: enr, freeIds, keepTeacher: keep }), 1, null); }
    catch (e) { err = e.message; }
    const ok = !err && p.teacher.name === wantName && p.teacher.auto === wantAuto &&
      (p.blockers.length === 0) === wantNoBlocker &&
      (!wantWarn || p.warnings.some(w => w.includes(wantWarn)));
    check(name, ok, err || (p && { name: p.teacher.name, auto: p.teacher.auto, blockers: p.blockers, warnings: p.warnings }));
  }
}

console.log('\n════════ 5부. 화면이 «누가 왜 붙었는지» 를 말해 주는가 ════════');
check('처리 패널이 자동 배정된 강사 이름을 글자로 보여 준다', /const autoWhy = !p\.teacher\.auto/.test(coreSrc));
check('처리 패널이 우선순위 칩을 보여 준다', /const prioChip =/.test(coreSrc));
check('목록 줄에도 우선순위가 나온다', /it\.assign_priority === 'teacher'/.test(coreSrc));
check('adm-core.js 캐시버스터를 올렸다 (?v= 안 올리면 옛 파일이 계속 나간다)',
  /adm-core\.js\?v=(6[3-9]|[7-9]\d|\d{3,})/.test(adminHtml),
  (adminHtml.match(/adm-core\.js\?v=\d+/) || [])[0]);

console.log('\n' + '─'.repeat(58));
console.log(fail === 0 ? `✅ ALL PASS (${pass})` : `⚠ PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
