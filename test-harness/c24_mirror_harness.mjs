// -*- coding: utf-8 -*-
// 🪞 카페24 → 망고아이 시간표 미러 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/c24_mirror_harness.mjs
//   대상:  cloudflare-deploy/src/c24-mirror.ts  (순수 모듈 — 직접 import 해 «실제로 돌립니다»)
//          cloudflare-deploy/src/accounting-reports.ts / api-admin.ts (배선·판정 대조)
//
//   발단(2026-08-31 사장님 지시): 파일럿이 끝나면 카페24 수업을 망고아이로 «한날 한시»에
//   옮겨야 하는데, 그날 처음 해 보면 늦습니다. 지금부터 매일 «옮겼다면 어떻게 됐을지»를
//   세어 두고, 전환일에는 스위치만 올리는 구조로 갑니다.
//
//   이 하니스가 못 박는 것:
//     A. 모드 — off(그림자)는 아무것도 만들지 않는다 / whitelist 는 «켠 강사만» / all 은 전원
//     B. 🔴 사람 손이 이긴다 — 도장(c24-mirror:manual)이 찍힌 수업은 어떤 모드에서도 안 만든다
//     C. ⛔ 모르면 만들지 않는다 — 강사·학생을 못 이으면 추측하지 않는다(남의 이름 사고 예방)
//     D. 미러는 «자기가 만든 행»만 손댄다 — 파일럿(adm-enroll)·수동 수업은 건드리지 않는다
//     E. 시각·길이 변환 (KST, 이상값 방어)
//     F. 강사 이름 정규화가 api-admin.ts 의 정본과 «같은 답» 을 낸다
//     G. 창(window)은 양쪽 경계가 있다 — 상한 없이 지우면 미래 예약이 전멸한다
//     H. Neo4j 가 안 되면 «0건(깨끗함)» 이 아니라 «못 냈다» 고 말한다
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/src/' + f), 'utf8');

/* 📦 대상 모듈을 «있는 그대로» 돌린다(빌드 도구 없이).
   node 22 는 .ts 를 타입만 벗겨 실행하지만 확장자 없는 상대 import(`./d1-chunk`)는
   ESM 규칙상 못 찾는다. 그래서 그 한 줄만 절대경로로 바꾼 사본을 임시로 만들어 import 한다.
   ⛔ 로직은 한 글자도 안 바꾼다 — 바꾸면 «검사한 코드»와 «배포될 코드»가 달라진다. */
const srcDir = resolve(__dir, '../cloudflare-deploy/src');
const tmpFile = resolve(tmpdir(), `c24-mirror.harness.${process.pid}.ts`);
writeFileSync(tmpFile, SRC('c24-mirror.ts').replace(
  /from '\.\/([\w-]+)'/g, (_m, n) => `from '${pathToFileURL(resolve(srcDir, n + '.ts')).href}'`));
let M;
try { M = await import(pathToFileURL(tmpFile).href); } finally { try { rmSync(tmpFile); } catch {} }
const MIRROR_TS = SRC('c24-mirror.ts');
const REPORTS = SRC('accounting-reports.ts');
const ADMIN = SRC('api-admin.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/* ── 가짜 데이터 만들기 ── */
const KST = (d, hm) => {                       // 'YYYY-MM-DD','HH:MM'(KST) → epoch ms
  const [h, m] = hm.split(':').map(Number);
  return Date.parse(`${d}T00:00:00Z`) + (h - 9) * 3600000 + m * 60000;
};
const cls = (o) => ({
  // ⚠️ `o.uid || 'stu1'` 로 쓰면 «빈 아이디» 시험이 기본값으로 바뀌어 늘 통과한다(실제로 밟음)
  class_id: o.id || 'c1', user_id: o.uid === undefined ? 'stu1' : o.uid, date: o.date || '2026-09-01',
  start_ms: KST(o.date || '2026-09-01', o.time || '20:00'),
  end_ms: KST(o.date || '2026-09-01', o.time || '20:00') + (o.dur ?? 20) * 60000,
  class_state: o.state ?? 1, teacher_id: o.tid === undefined ? '37' : o.tid,
});
const row = (o) => ({
  id: o.id || 1, user_id: o.uid || 'stu1', teacher_id: o.teacher_id ?? '28',
  scheduled_date: o.date || '2026-09-01', start_time: o.time || '20:00',
  duration_min: o.dur ?? 20, source: o.source || 'c24-mirror', status: o.status || 'active',
});
const LINKS = new Map([['37', { name: 'Teacher Janice', teacherId: '28' }],
                       ['184', { name: 'Teacher Kaye', teacherId: '8' }],
                       ['99', { name: 'Teacher Ghost', teacherId: null }]]);   // 이름은 있는데 원부 연결 없음
const STUDENTS = new Map([['stu1', '김하나'], ['stu2', '이두리']]);
const plan1 = (c, existing = [], mode = 'all', enabled = []) =>
  M.planMirror([c], LINKS, STUDENTS, existing, mode, new Set(enabled))[0];

console.log('\n[ A. 모드 — off 는 그림자, whitelist 는 켠 강사만, all 은 전원 ]');
{
  check('all → 만든다(ok)', plan1(cls({}), [], 'all').verdict === 'ok');
  check('off → 아무것도 안 만든다', plan1(cls({}), [], 'off').verdict === 'not_whitelisted');
  check('off 는 «그림자» 라고 이유를 말해 준다',
    /그림자/.test(plan1(cls({}), [], 'off').detail || ''));
  check('whitelist + 안 켠 강사 → 안 만든다', plan1(cls({}), [], 'whitelist', []).verdict === 'not_whitelisted');
  check('whitelist + 켠 강사(28) → 만든다', plan1(cls({}), [], 'whitelist', ['28']).verdict === 'ok');
  check('whitelist 는 «원부번호» 로 켠다 — 카페24 번호(37)로 켜면 안 걸린다',
    plan1(cls({}), [], 'whitelist', ['37']).verdict === 'not_whitelisted');
}

console.log('\n[ B. 🔴 사람 손이 이긴다 — 도장이 찍힌 수업은 어떤 모드에서도 안 건드린다 ]');
{
  const manualSame = [row({ source: 'c24-mirror:manual', time: '20:00' })];
  const manualDiff = [row({ source: 'c24-mirror:manual', time: '20:30' })];
  check('도장 + 같은 시각 → manual_locked', plan1(cls({}), manualSame, 'all').verdict === 'manual_locked');
  check('도장 + 다른 시각 → diverged(어긋남)', plan1(cls({}), manualDiff, 'all').verdict === 'diverged');
  check('어긋남은 «양쪽 값» 을 함께 말해 준다',
    /20:00/.test(plan1(cls({}), manualDiff, 'all').detail || '') &&
    /20:30/.test(plan1(cls({}), manualDiff, 'all').detail || ''));
  for (const mode of ['off', 'whitelist', 'all']) {
    const v = plan1(cls({}), manualDiff, mode, ['28']).verdict;
    check(`${mode} 모드에서도 도장은 절대 ok/update 가 안 된다 (${v})`, v !== 'ok' && v !== 'update' && v !== 'already');
  }
  check('도장 값이 정본과 같다', M.MIRROR_SOURCE_MANUAL === 'c24-mirror:manual');
}

console.log('\n[ C. ⛔ 모르면 만들지 않는다 — 추측해서 잇지 않는다 ]');
{
  check('학생 계정이 없으면 no_student', plan1(cls({ uid: 'nobody' }), [], 'all').verdict === 'no_student');
  check('학생 아이디가 비면 no_student', plan1(cls({ uid: '' }), [], 'all').verdict === 'no_student');
  check('카페24에 강사번호가 없으면 no_teacher', plan1(cls({ tid: null }), [], 'all').verdict === 'no_teacher');
  const ghost = plan1(cls({ tid: '99' }), [], 'all');
  check('이름은 알지만 원부 연결이 없으면 no_teacher', ghost.verdict === 'no_teacher');
  check('그때 «누구인지» 를 말해 준다', /Ghost/.test(ghost.detail || ''), ghost.detail);
  const unknown = plan1(cls({ tid: '12345' }), [], 'all');
  check('모르는 카페24 번호도 no_teacher (조용히 만들지 않는다)', unknown.verdict === 'no_teacher');
  check('못 이은 건에는 teacher_id 를 채우지 않는다', unknown.teacher_id === null && ghost.teacher_id === null);
}

console.log('\n[ D. 미러는 «자기가 만든 행» 만 손댄다 ]');
{
  check('같은 값이면 already', plan1(cls({}), [row({})], 'all').verdict === 'already');
  check('길이가 달라졌으면 update', plan1(cls({ dur: 30 }), [row({ dur: 20 })], 'all').verdict === 'update');
  check('강사가 달라졌으면 update', plan1(cls({}), [row({ teacher_id: '99' })], 'all').verdict === 'update');
  const pilot = [row({ source: 'adm-enroll:78' })];
  check('파일럿 수업이 그 자리에 있으면 conflict — 덮지 않는다', plan1(cls({}), pilot, 'all').verdict === 'conflict');
  check('conflict 는 무엇이 막고 있는지 말해 준다', /adm-enroll/.test(plan1(cls({}), pilot, 'all').detail || ''));
  check('취소된 행은 «없는 것» 으로 본다', plan1(cls({}), [row({ status: 'cancelled' })], 'all').verdict === 'ok');
  check('다른 학생의 같은 시간은 방해하지 않는다', plan1(cls({}), [row({ uid: 'stu2' })], 'all').verdict === 'ok');
  // 미러가 «자기 source» 만 지운다는 계약이 코드에 남아 있는가
  check('MIRROR_SOURCE 는 c24-mirror 하나뿐', M.MIRROR_SOURCE === 'c24-mirror');
}

console.log('\n[ E. 시각·길이 변환 ]');
{
  check('KST 20:00 → 20:00', M.msToKstHm(KST('2026-09-01', '20:00')) === '20:00');
  check('KST 06:30 → 06:30', M.msToKstHm(KST('2026-09-01', '06:30')) === '06:30');
  check('자정 넘김도 시:분만 본다', M.msToKstHm(KST('2026-09-01', '00:10')) === '00:10');
  check('20분 수업', M.classMinutes(0, 20 * 60000) === 20);
  check('0분이면 기본 20분으로 방어', M.classMinutes(0, 0) === 20);
  check('음수면 기본 20분으로 방어', M.classMinutes(60000, 0) === 20);
  check('하루짜리 이상값이면 기본 20분', M.classMinutes(0, 24 * 3600000) === 20);
  check('30분 수업은 그대로', M.classMinutes(0, 30 * 60000) === 30);
}

console.log('\n[ F. 강사 이름 정규화가 api-admin 정본과 같은 답을 낸다 ]');
{
  // api-admin.ts 의 normTeacherName 을 «오려 내» 실제로 돌려 비교한다(문자열 비교가 아니다)
  const m = ADMIN.match(/function normTeacherName\(v: any\): string \{([\s\S]*?)\n\}/);
  check('api-admin 에서 정본 함수를 찾았다', !!m);
  if (m) {
    const canon = new Function('v', m[1].replace(/: any|: string/g, ''));
    const samples = ['Teacher Janice', 'JANICE', '  teacher   kaye ', 'HT NESS', 'Teacher Far', 'MELCA', ''];
    for (const s of samples) {
      check(`«${s}» 두 함수가 같은 답`, M.mirrorNormTeacherName(s) === canon(s),
        `미러=${M.mirrorNormTeacherName(s)} / 정본=${canon(s)}`);
    }
  }
}

console.log('\n[ F-2. 🔗 원부 이름 판정 — 접두어(HT)를 넘되 «스치는» 매칭은 금지 ]');
{
  // 2026-08-31 그림자 1일차: 막힌 14건 중 13건이 «Teacher Ness ↔ HT NESS» 하나였다.
  const ROSTER = [
    { id: 22, name: 'FAR' }, { id: 3, name: 'HT FARRAH' }, { id: 10, name: 'HT NESS' },
    { id: 27, name: 'MAIMAI' }, { id: 8, name: 'KAYE' }, { id: 28, name: 'JANICE' },
    { id: 30, name: 'WAN' }, { id: 29, name: '중국어 강선생님' },
  ];
  const R = M.buildRosterResolver(ROSTER);
  check('🔴 「Teacher Ness」 → 10 (HT NESS 를 낱말 단위로 찾는다)', R('Teacher Ness') === '10', String(R('Teacher Ness')));
  check('완전일치가 먼저 — 「Teacher Far」 → 22 (HT FARRAH 3 이 아니다)', R('Teacher Far') === '22');
  check('접두사 없는 이름도 찾는다 (MAIMAI → 27)', R('MAIMAI') === '27');
  check('「Teacher Janice」 → 28', R('Teacher Janice') === '28');
  check('「Teacher Wan」 → 30', R('Teacher Wan') === '30');
  check('한글 이름도 완전일치 (중국어 강선생님 → 29)', R('중국어 강선생님') === '29');
  check('⛔ «스치는» 매칭 금지 — 「Teacher Farr」 는 FARRAH 에 안 걸린다', R('Teacher Farr') === null, String(R('Teacher Farr')));
  check('⛔ 부분일치 금지 — 「Ne」 는 NESS 에 안 걸린다', R('Ne') === null);
  check('⛔ 여럿이 나눠 갖는 낱말은 «모름» — 「HT」 는 null', R('HT') === null, String(R('HT')));
  check('모르는 이름은 null (엉뚱한 사람으로 안 떨어진다)', R('Teacher Nobody') === null);
  check('빈 입력에 안 죽는다', R('') === null && R(null) === null && R(undefined) === null);
  // 같은 이름이 둘이면 잇지 않는다
  const R2 = M.buildRosterResolver([{ id: 1, name: 'KIM' }, { id: 2, name: 'Teacher Kim' }]);
  check('⛔ 같은 이름이 둘이면 잇지 않는다', R2('Teacher Kim') === null, String(R2('Teacher Kim')));
  // 같은 사람이 두 번 실려도(중복 행) 흔들리지 않는다
  const R3 = M.buildRosterResolver([{ id: 7, name: 'ANA' }, { id: 7, name: 'ANA' }]);
  check('같은 id 가 두 번 실려도 정상 (7)', R3('Teacher Ana') === '7');
  // 실제로 미러 판정까지 이어지는가 — no_teacher 가 사라져야 한다
  const links = new Map([['68', { name: 'Teacher Ness', teacherId: R('Teacher Ness') }]]);
  const v = M.planMirror([cls({ tid: '68' })], links, STUDENTS, [], 'all', new Set())[0];
  check('🔴 그래서 Ness 수업이 no_teacher 를 벗어난다', v.verdict === 'ok', `${v.verdict} / ${v.detail || ''}`);
}

console.log('\n[ G. 창(window)은 양쪽 경계가 있다 ]');
{
  const cy = MIRROR_TS.match(/MATCH \(c:Class\)[\s\S]*?LIMIT \$lim/);
  check('카페24 조회 Cypher 를 찾았다', !!cy);
  check('시작 경계(since)가 있다', !!cy && /c\.date >= \$since/.test(cy[0]));
  check('끝 경계(until)가 있다 — 상한이 없으면 미래 예약이 전멸한다', !!cy && /c\.date <= \$until/.test(cy[0]));
  check('기존 시간표 조회도 양쪽 경계', /scheduled_date >= \? AND scheduled_date <= \?/.test(MIRROR_TS));
  // ⛔ 손으로 90개씩 자르지 않는다 — 공용 헬퍼가 실제 바인드 개수를 세서 자른다(d1_bind_limit_harness 계약)
  // ⚠️ `selectInChunks<any>(` 처럼 제네릭이 붙으므로 여는 괄호를 붙여 찾으면 못 잡는다(실제로 밟음)
  check('IN 목록은 공용 selectInChunks 로 자른다', /\bselectInChunks\b/.test(MIRROR_TS));
  check('손수 만든 90개 청크 루프가 없다', !/i \+= 90/.test(MIRROR_TS) && !/map\(\(\) => '\?'\)/.test(MIRROR_TS));
  // 그림자 단계에서는 쓰기가 한 줄도 없어야 한다
  const writes = (MIRROR_TS.match(/\b(INSERT INTO|UPDATE |DELETE FROM)\s+class_schedules/g) || []);
  check('그림자 단계 — class_schedules 에 쓰는 문장이 0건', writes.length === 0, `발견: ${writes.join(', ')}`);
}

console.log('\n[ H. 못 냈으면 «못 냈다» 고 말한다 · 배선 ]');
{
  check('리포트가 /api/admin/reports/ 밑에 등록돼 있다', /p === 'c24-mirror'/.test(REPORTS));
  check('Neo4j 실패를 0건이 아니라 502 로 알린다', /c24_unreachable/.test(REPORTS));
  check('index.ts(공동 금지구역)를 안 건드려도 되는 이유가 적혀 있다', /금지구역/.test(REPORTS.slice(REPORTS.indexOf("p === 'c24-mirror'") - 600, REPORTS.indexOf("p === 'c24-mirror'") + 200)));
  check('모드 기본값은 가장 안전한 off(그림자)', /return 'off'/.test(MIRROR_TS));
  const sum = M.summarize([plan1(cls({}), [], 'all'), plan1(cls({ uid: 'x' }), [], 'all')]);
  check('요약이 판정별로 세어진다', sum.ok === 1 && sum.no_student === 1);
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach(f => console.log('  · ' + f)); }
console.log(`${'─'.repeat(52)}\n`);
process.exit(FAIL ? 1 : 0);
