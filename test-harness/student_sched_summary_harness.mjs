#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   📘 학생 「예약」 칸 — 회귀 감시
   ───────────────────────────────────────────────────────────────────────────
   왜 (2026-09-15 사장님 「수업 입력했고 스케줄에도 있는데 왜 여기 없어?」)
     학생 목록·상세 카드의 「결제타입·수강 시작일·수강 종료일·수업회수(주)」는
     `students_erp` 의 칸이고 **카페24가 정본**이라(created_at 센티넬
     1751500000000) 관리자 화면에서 수업을 넣어도(그건 class_schedules 에만 쓴다)
     늘 «—» 였다. 실측: lee 활성 2건 · jeong 활성 5건인데 두 화면 다 «—».
     ⟹ 기존 칸을 채우는 대신 「예약」 칸을 새로 달았다.

   ⚠️ 문자열 하니스로는 못 잡는 종류다 — 함수도 값도 다 «있고» 틀린 것은
      «무슨 답이 나오는가» 뿐이다. 그래서 정본을 **실제로 돌린다.**
   ⚠️ 「센다」 옆에 **「안 세는 것도 안 센다」를 짝으로** 둔다. 앞만 보면
      «전부 0» 이나 «전부 1» 같은 엉터리도 통과한다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0; const fails = [];
const check = (name, ok) => { if (ok) { pass++; console.log('  ✅ ' + name); } else { fail++; fails.push(name); console.log('  ❌ ' + name); } };

const SRC   = 'cloudflare-deploy/src/student-schedule-summary.ts';
const TS    = rd(SRC);
const MANGO = rd('cloudflare-deploy/src/api-mango.ts');
const CORE  = rd('cloudflare-deploy/public/js/adm-core.js');
const DETAIL= rd('cloudflare-deploy/public/admin/student.html');
const CONFL = rd('cloudflare-deploy/src/schedule-conflict.ts');

/* 정본을 «타입만 지워» 실제로 돌린다. */
const esbuild = (() => {
  try { return createRequire(join(ROOT, 'cloudflare-deploy/package.json'))('esbuild'); }
  catch { return null; }
})();
const NO_ESBUILD = !esbuild;
if (NO_ESBUILD) console.log('\n[ 일부 건너뜀 ] esbuild 없음 — ①②(정본을 돌리는 절)만 건너뜁니다.');
const holder = { exports: {} };
if (!NO_ESBUILD) {
  const built = esbuild.transformSync(TS, { loader: 'ts', format: 'cjs' }).code;
  new Function('exports', 'module', 'require', 'console', built)(holder.exports, holder, createRequire(import.meta.url), console);
}
const M = holder.exports;

console.log('\n[ ① 세는 규칙 — 정본을 실제로 돌린다 ]');
if (!NO_ESBUILD) {
  const TODAY = '2026-09-15';
  const r = rows => M.summarizeStudentSchedules(rows, TODAY);

  // 사장님이 제보한 두 학생의 «실제» D1 행 모양 그대로
  const jeong = r([
    { schedule_kind: 'one_off',   scheduled_date: '2026-09-14' },   // 지남
    { schedule_kind: 'recurring', scheduled_date: null },           // 화
    { schedule_kind: 'recurring', scheduled_date: null },           // 수
    { schedule_kind: 'recurring', scheduled_date: null },           // 목
    { schedule_kind: 'recurring', scheduled_date: null },           // 금
  ]);
  check(`jeong(반복4 + 지난 단건1) → 주 4회 · 지난 1 (weekly=${jeong.weekly} upcoming=${jeong.upcoming} past=${jeong.past})`,
    jeong.weekly === 4 && jeong.upcoming === 0 && jeong.past === 1 && jeong.total === 5);
  check(`jeong 라벨이 「주 4회」 — ${jeong.label_ko}`, jeong.label_ko === '주 4회');

  const lee = r([
    { schedule_kind: 'one_off', scheduled_date: '2026-09-18' },
    { schedule_kind: 'one_off', scheduled_date: '2026-09-21' },
  ]);
  check(`lee(앞으로 단건2) → 단건 2회 (upcoming=${lee.upcoming})`,
    lee.weekly === 0 && lee.upcoming === 2 && lee.past === 0);
  check(`lee 라벨이 「단건 2회」 — ${lee.label_ko}`, lee.label_ko === '단건 2회');

  // ⚠️ 짝 — «예약이 없으면 «—»» 만 두면 «전부 —» 도 통과한다. 위 둘이 그 짝이다.
  const none = r([]);
  check('예약이 없으면 «—»', none.total === 0 && none.label_ko === '—' && none.label_en === '—');

  check('오늘 수업은 «앞으로» 로 센다(지난 것 아님)',
    r([{ schedule_kind: 'one_off', scheduled_date: TODAY }]).upcoming === 1);

  // ⛔ 날짜가 없는 일회성을 «지난 것» 으로 떨어뜨리면 화면에서 조용히 사라진다
  check('날짜 없는 일회성은 «지난 것» 으로 버리지 않는다',
    r([{ schedule_kind: 'one_off', scheduled_date: null }]).upcoming === 1);

  const both = r([
    { schedule_kind: 'recurring', scheduled_date: null },
    { schedule_kind: 'one_off',   scheduled_date: '2026-09-30' },
  ]);
  check(`반복과 단건을 «한 숫자로 합치지» 않는다 — ${both.label_ko}`,
    both.label_ko === '주 1회 · 단건 1회' && both.weekly === 1 && both.upcoming === 1);
  check(`영어 라벨도 만든다 — ${both.label_en}`, /1\/wk/.test(both.label_en) && /one-off/.test(both.label_en));

  check('KST 기준으로 오늘을 잡는다 (UTC 로 재면 하루 밀린다)',
    M.kstToday(Date.parse('2026-09-15T16:30:00Z')) === '2026-09-16');
}

console.log('\n[ ② 실패하면 «모름» 으로 — 명부가 통째로 사라지면 안 된다 ]');
if (!NO_ESBUILD) {
  const boom = { DB: { prepare() { throw new Error('no such table: class_schedules'); } } };
  /* ⚠️ «부를 때» 를 try 로 감싸야 한다. 안 감싸면 fail-open 을 없애는 변이가
        «깔끔한 FAIL» 이 아니라 **하니스를 크래시**시켜 결과줄조차 안 나온다
        (그 상태로 ❌ 를 세면 0건이라 «검출 못 함» 이 «통과» 로 위장한다 — 실측). */
  let map = null, mapThrew = false;
  try { map = await M.loadSchedSummaryMap(boom); } catch { mapThrew = true; }
  check('조회가 던져도 map 은 빈 Map (명부는 그대로 뜬다)',
    !mapThrew && map instanceof Map && map.size === 0);
  let one = null, oneThrew = false;
  try { one = await M.loadSchedSummaryOne(boom, 'lee'); } catch { oneThrew = true; }
  check('상세도 던지지 않고 «—» 를 준다',
    !oneThrew && one && one.label_ko === '—' && one.total === 0);

  // 짝 — «제대로 찾는다» 가 없으면 위 둘은 «늘 빈 값» 인 헛돎도 통과시킨다
  const fake = { DB: { prepare: () => ({
    bind: () => ({ all: async () => ({ results: [{ user_id: 'lee', schedule_kind: 'one_off', scheduled_date: '2099-01-01' }] }) }),
    all: async () => ({ results: [{ user_id: 'lee', schedule_kind: 'recurring', scheduled_date: null }] }),
  }) } };
  const okMap = await M.loadSchedSummaryMap(fake);
  check('짝: 행이 있으면 실제로 센다 (map)', okMap.get('lee')?.weekly === 1);
  const okOne = await M.loadSchedSummaryOne(fake, 'lee');
  check('짝: 행이 있으면 실제로 센다 (one)', okOne.upcoming === 1);
}

console.log('\n[ ③ 조회 조건 — 활성만 · LMS/시드 자리표시 제외 ]');
const whereM = /export const SCHED_SUMMARY_WHERE\s*=\s*\n?\s*`([^`]*)`/.exec(TS);
check('전제: 조건절을 읽어 냈다', !!whereM);
const WHERE = whereM ? whereM[1] : '';
check("활성 예약만 센다 (status = 'active')", /status\s*=\s*'active'/.test(WHERE));
check("자리표시(lms·type_seed)를 제외한다", /NOT IN\s*\('lms','type_seed'\)/.test(WHERE));
/* ⚠️ schedule-conflict.ts 의 NOT_PLACEHOLDER 와 «같은 말» 이어야 한다. 한쪽만 고치면
      「LMS 칸이 진짜 수업으로 세어지는」 2026-08-24 사고가 이 칸에서 되살아난다. */
const confl = /const NOT_PLACEHOLDER = `([^`]*)`/.exec(CONFL)?.[1] || '';
check(`정본 두 곳이 같은 제외식을 쓴다 — ${confl.trim().slice(0, 48)}…`,
  !!confl && WHERE.includes(confl.replace(/^AND\s+/, '').trim()));

console.log('\n[ ④ 배선 — 두 API 가 «같은» 정본을 쓴다 ]');
check('목록(erp-list)이 정본 Map 을 부른다', /loadSchedSummaryMap\(/.test(MANGO));
check('상세(student/:uid/full)가 정본 One 을 부른다', /loadSchedSummaryOne\(/.test(MANGO));
check('정본에서 import 한다 (판정을 복제하지 않았다)',
  /from '\.\/student-schedule-summary'/.test(MANGO));
/* ⚠️ «부르는가» 만 보면 결과를 안 실어도 통과한다 — 응답에 실리는지까지 본다. */
check('목록 응답의 행에 sched 가 실린다', /_it\.sched\s*=/.test(MANGO));
check('상세 응답에 sched 가 실린다', /\n\s*sched:\s*_fullSched,/.test(MANGO));

console.log('\n[ ⑤ 화면 — 문장을 화면이 조립하지 않는다 ]');
/* 두 화면이 각자 조립하면 한쪽만 고쳐져 「화면마다 답이 다른」 상태가 된다. */
const stripJs = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const coreNC = stripJs(CORE), detailNC = stripJs(DETAIL);
check('목록은 서버 라벨을 고르기만 한다', /q\.label_en\s*:\s*q\.label_ko/.test(coreNC));
check('상세도 서버 라벨을 고르기만 한다', /q\.label_en\s*:\s*q\.label_ko/.test(detailNC));
/* ⚠️ 부정 검사를 «파일 전체» 에 걸면 무관한 코드를 잡는다 — 실제로 adm-core.js 의
      딴 기능(10899행 `schedule: '주 ' + classes_per_week + '회'`)이 걸려 거짓 FAIL 이
      났다. 그 칸을 그리는 «그 자리» 만 잘라서 본다. */
const cut = (t, anchor, len) => { const i = t.indexOf(anchor); return i < 0 ? '' : t.slice(i, i + len); };
const schedTd = cut(coreNC, 'const _schedTd', 420);
check('전제: 목록의 「예약」 칸 코드를 잘라 냈다', schedTd.length > 100);
check('목록이 «주 N회» 문장을 그 칸에서 만들지 않는다', !!schedTd && !/'주 '\s*\+/.test(schedTd));
const bookedRow = cut(detailNC, "[t('qBooked')", 320);
check('전제: 상세의 「예약 수업」 줄을 잘라 냈다', bookedRow.length > 60);
check('상세가 «주 N회» 문장을 그 줄에서 만들지 않는다', !!bookedRow && !/'주 '\s*\+/.test(bookedRow));

console.log('\n[ ⑥ 기존 칸을 예약값으로 «채우지» 않았다 ]');
/* ⛔ 「수강 종료일」에 마지막 예약일을 넣으면 수업을 더 잡을 때마다 늘어나 거짓이 된다.
      「수업회수(주)」도 일회성 예약은 주당 회수가 아니다. CLAUDE.md 「지어내지 마세요」. */
check('수강 종료일은 여전히 erp.end_date 만 본다',
  /\[t\('qEnd'\), erp\.end_date \|\| '—'\]/.test(detailNC));
check('주당 수업은 여전히 erp.classes_per_week 만 본다',
  /\[t\('qClassesPW'\), \(erp\.classes_per_week\|\|'—'\)/.test(detailNC));
check('목록의 수강 시작/종료도 그대로다',
  /<td>\$\{_d\(s\.signup_date\)\}<\/td>/.test(coreNC) && /<td>\$\{_d\(s\.end_date\)\}<\/td>/.test(coreNC));

console.log('\n' + '─'.repeat(45));
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fails.length) { console.log('  실패 항목:'); for (const f of fails) console.log('   · ' + f); }
console.log('─'.repeat(45));
process.exit(fail ? 1 : 0);
