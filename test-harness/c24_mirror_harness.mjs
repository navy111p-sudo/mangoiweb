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
//     J. 2단계 «실제로 만든다» — applyMirror 를 가짜 D1 에 물려 실제로 돌린다
//     K. 자동 실행(cron) — 새 cron 을 안 만들고, 끄는 스위치가 실제로 먹는지 돌려서 확인
//     I. 화면 겹쳐 그리기 — 카페24 수업을 «보기 전용» 으로만 그린다(class_schedules 를 안 만든다)
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/src/' + f), 'utf8');
const PUB = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/public/' + f), 'utf8');

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
  /* 🔴 2단계(2026-08-31 사장님 승인 «Ana 한 사람만»)부터 쓰기가 생겼다.
     그래서 못은 「쓰지 마라」가 아니라 **「무엇을 쓰느냐」** 로 바뀐다.
     ⛔ 지우기는 여전히 0건이어야 한다 — 되돌릴 수 없는 것은 만들지 않는다. */
  check('⛔ class_schedules 를 물리적으로 지우는 문장이 0건',
    !/\bDELETE\s+FROM\s+class_schedules/.test(MIRROR_TS));
  check('내리는 것은 status=cancelled 뿐(되돌릴 수 있다)',
    /SET status='cancelled'/.test(MIRROR_TS));
  // 미러가 손대는 UPDATE 는 전부 «내 행인지» 를 WHERE 에서 확인해야 한다
  const upd = [...MIRROR_TS.matchAll(/UPDATE class_schedules SET[\s\S]{0,200}?WHERE[^`]*/g)].map(m => m[0]);
  check('UPDATE 가 최소 2개(고치기·내리기)', upd.length >= 2, upd.length);
  check('🔴 모든 UPDATE 가 source = ? 로 «내 행» 만 손댄다',
    upd.length >= 2 && upd.every(u => /source\s*=\s*\?/.test(u)), upd);
  check('INSERT 가 source 를 미러 표식으로 넣는다',
    /INSERT INTO class_schedules[\s\S]{0,400}?MIRROR_SOURCE/.test(MIRROR_TS));
  check('INSERT 가 notes 에 카페24 수업번호를 남긴다(사라진 수업 되짚기용)',
    /MIRROR_NOTE_PREFIX \+ r\.class_id/.test(MIRROR_TS));
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

/* ═══ I. 화면 겹쳐 그리기 (js/adm-q6.js — 강사 스케줄 주간 캘린더) ═══
   발단(2026-08-31 사장님): 「카페24에 있는 수업이 mangoi.ai 도 잡히도록. 바로 잡는 게 어렵다면
   잡힌 것처럼 보이게라도」. 같은 날 카페24에 «없는 수업»(허윤아 17:00 의 Kes·Sid)이 확인돼
   행을 «만드는» 것은 아직 못 합니다 — 그래서 보기 전용 겹쳐 그리기가 먼저입니다.
   ⛔ 여기서 못 박는 것은 «그 겹쳐 그리기가 진짜 시간표를 건드리지 않는다» 입니다. */
console.log('\n[ I. 화면 겹쳐 그리기 — 보기 전용 ]');
{
  const Q6 = PUB('js/adm-q6.js');
  const HTML = PUB('admin.html');
  const cardFn = (Q6.match(/function ph54C24Card\(s\)\{[\s\S]*?\n  \}/) || [''])[0];

  check('캘린더가 그림자 성적표를 그대로 읽는다(판정을 화면에서 다시 만들지 않는다)',
    /\/api\/admin\/reports\/c24-mirror\?since=/.test(Q6));
  check('카페24 카드 함수가 있다', cardFn.length > 200);
  // 🔴 이게 이 절의 핵심 — records 인덱스와 섞이면 «카페24 카드를 끌었더니 엉뚱한 수업에 PATCH»
  check('🔴 카페24 카드에 data-idx 를 달지 않는다', !/data-idx/.test(cardFn));
  check('🔴 카페24 카드는 드래그할 수 없다(draggable 없음)', !/draggable/.test(cardFn));
  check('카페24 카드는 차단 삭제 경로에 안 걸린다(data-block 없음)', !/data-block/.test(cardFn));
  check('카드가 «카페24에만 있음» 이라고 사실을 말한다',
    /카페24에만 있음/.test(cardFn) && /Cafe24 only/.test(cardFn));
  // 이미 망고아이에 행이 있는 판정은 그리지 않는다 — 그리면 같은 수업이 두 번 보인다
  const show = (Q6.match(/var PH54_C24_SHOW = \{[^}]*\}/) || [''])[0];
  /* 🔴 (2026-09-01) conflict 는 «그린다» 로 바뀌었다 — 강사 필터를 걸면 그 «진짜 카드» 는
     다른 강사 것이라 화면에 없어서, 안 그리면 아무 데도 안 보였다(실측 Mariane 30 → 28). */
  check('이미 같은 카드로 그려지는 판정(already/update/manual_locked/diverged)은 안 그린다',
    !!show && !/already|update|manual_locked|diverged/.test(show));
  check('🔴 conflict 는 그린다(강사 필터에서 통째로 사라지던 것)', !!show && /conflict\s*:\s*1/.test(show));
  check('conflict 카드는 «같은 시각 다른 수업» 이라고 말한다',
    /⚠️ 같은 시각 다른 수업/.test(Q6) && /Clashes with another class/.test(Q6));
  check('conflict 는 «확인필요» 로 따로 센다(대기 건수에 섞지 않는다)',
    /else if \(r\.verdict === 'conflict'\) c24Clash\+\+/.test(Q6) && /겹침 확인필요/.test(Q6));
  check('그릴 것은 «망고아이에 아직 없는» 것뿐', /ok\s*:\s*1/.test(show) && /not_whitelisted\s*:\s*1/.test(show));
  // 강사를 못 이은 것은 «아무 칸에나» 놓지 않는다
  check('강사를 못 이으면 그리지 않고 건수만 알린다', /if \(!r\.teacher_id\)\{ c24NoTeacher\+\+; return; \}/.test(Q6));
  // 화면이 class_schedules 를 만들지 않는다(겹쳐 그리기는 «보기» 다)
  check('🔴 캘린더가 수업 행을 새로 만들지 않는다',
    !/fetch\('\/api\/admin\/class-schedules'[\s\S]{0,200}POST/.test(Q6));
  // 못 읽었으면 «없다» 가 아니라 «못 읽었다»
  check('못 읽으면 이유를 화면에 적는다', /ph54State\.c24Msg/.test(Q6) && /읽지 못했습니다/.test(Q6));
  check('권한 없음(403/401)은 «고장» 으로 알리지 않는다', /r\.status === 403 \|\| r\.status === 401/.test(Q6));
  check('성공은 «ok === true» 로만 판정한다(404 본문에는 ok 칸이 없다)', /j\.ok !== true/.test(Q6));
  // 캐시 무효화 — 파일이 바뀌었으면 ?v= 도 올라가야 한다(asset_version_harness 와 같은 계약)
  /* 🔴 (2026-09-01 사장님 화면 확인) 지난 주를 열면 「수업 0개 · 카페24 58개」 가 뜨고
     카드마다 「미러를 켜면 만들어집니다」 라고 적혀 있었다. 미러 창은 «오늘부터» 라
     지난 수업은 영영 안 만들어지므로 **거짓말**이었고, 「58건이 빠졌다」 로 읽힌다.
     ⛔ 감추는 것도 답이 아니다 — 그러면 「지난주에 수업이 없었다」 는 반대쪽 거짓이 된다. */
  check('🔴 I⑩ 지난 날짜인지 판정한다', /var isPast\s*=\s*String\(s\.date \|\| ''\) < ph54TodayKst\(\)/.test(Q6));
  check('🔴 I⑩ 지난 카드에는 «만들어집니다» 를 붙이지 않는다',
    /var why\s*=\s*isPast \? null : PH54_C24_WHY\[s\.verdict\]/.test(Q6));
  check('I⑩ 지난 카드는 «지난 수업 (카페24 기록)» 이라고 말한다',
    /지난 수업 \(카페24 기록\)/.test(Q6) && /Past class \(Cafe24 record\)/.test(Q6));
  check('I⑩ 지난 것을 감추지 않는다(그리기는 그대로)',
    /c24Events\.push\(\{ rec: r, col: dateToCol\[r\.date\] \}\);/.test(Q6));
  check('🔴 I⑪ 건수를 «지난 것 / 겹침 / 앞으로 것» 으로 갈라 센다',
    /c24Past\+\+;/.test(Q6) && /c24Clash\+\+;/.test(Q6) && /c24Ahead\+\+;/.test(Q6)
    && /카페24 대기/.test(Q6) && /지난 카페24 기록/.test(Q6) && /겹침 확인필요/.test(Q6));
  check('I⑪ 한 숫자로 합친 옛 표기가 남아 있지 않다', !/카페24 수업 \(망고아이엔 아직 없음\)/.test(Q6));

  const v = Number((HTML.match(/adm-q6\.js\?v=(\d+)/) || [])[1] || 0);
  check('admin.html 의 adm-q6.js ?v= 가 11 이상', v >= 11, `v=${v}`);
}


/* ═══ J. 2단계 «실제로 만든다» — applyMirror 를 진짜로 돌린다 ═══
   2026-08-31 사장님 승인: 「Ana 한 사람만 켜서 실제로 만들어 보자」.

   문자열 검사로는 «무엇을 쓰는가» 를 못 봅니다. 그래서 가짜 D1 을 물려 **함수를 실행하고
   실제로 나간 SQL 을 세어** 봅니다. 되돌리면 여기서 FAIL 납니다.

   ⛔ 이 절이 지키는 것
     · dry_run 이 기본 — 실수로 인자를 빠뜨려도 한 줄도 안 쓴다
     · 화이트리스트 밖 강사는 손대지 않는다 (only_teacher_id 를 줘도 화이트리스트를 못 건너뛴다)
     · 사람이 손댄 행(c24-mirror:manual)·다른 출처 행은 절대 안 건드린다
     · 카페24 조회가 0건이면 «취소» 단계를 통째로 건너뛴다(조회 실패와 구분할 수 없으므로)
*/
console.log('\n[ J. 2단계 — 실제로 만든다 (함수를 돌려서 확인) ]');
{
  // 가짜 D1 — 나간 SQL 을 전부 적어 두고, 조회에는 시나리오 값을 돌려준다
  const makeDb = (scn) => {
    const sqls = [];
    const pick = (sql) => {
      if (/FROM c24_mirror_config/.test(sql)) return { first: { v: scn.mode } };
      /* ⚠️ enabled=1(켠 강사)과 enabled=0(막은 강사)은 **같은 표**를 본다.
         표 이름으로만 가르면 둘이 같은 답을 받아 «켠 강사가 곧 막힌 강사» 가 된다(실제로 밟음). */
      if (/FROM c24_mirror_teachers WHERE enabled = 0/.test(sql)) return { all: (scn.blocked || []).map((t) => ({ teacher_id: t })) };
      if (/FROM c24_mirror_teachers/.test(sql)) return { all: (scn.enabled || []).map((t) => ({ teacher_id: t })) };
      if (/FROM teachers WHERE active/.test(sql)) return { all: scn.roster || [] };
      if (/FROM teacher_payroll_auto/.test(sql)) return { all: scn.payroll || [] };
      if (/FROM students_erp/.test(sql)) return { all: scn.students || [] };
      if (/FROM class_schedules/.test(sql)) return { all: scn.existing || [] };
      return { all: [], first: null };
    };
    return {
      sqls,
      exec: async () => {},
      prepare(sql) {
        const r = pick(sql);
        const stmt = {
          bind: (...b) => { stmt._b = b; return stmt; },
          all: async () => ({ results: r.all || [] }),
          first: async () => r.first ?? null,
          run: async () => { sqls.push({ sql: sql.replace(/\s+/g, ' ').trim(), binds: stmt._b || [] }); return {}; },
        };
        return stmt;
      },
    };
  };
  const cls = (o) => ({
    class_id: o.cid, user_id: o.uid, date: o.date || '2026-09-01',
    start_ms: Date.UTC(2026, 8, 1, 6, 0) , end_ms: Date.UTC(2026, 8, 1, 6, 20),
    class_state: 1, teacher_id: o.t24 || '182',
  });
  const runCypherFake = (rows) => async () => ({
    fields: ['class_id', 'user_id', 'start_ms', 'end_ms', 'date', 'class_state', 'teacher_id'],
    values: rows.map((c) => [c.class_id, c.user_id, c.start_ms, c.end_ms, c.date, c.class_state, c.teacher_id]),
  });
  const BASE = {
    mode: 'whitelist', enabled: ['7'],
    roster: [{ id: 7, name: 'ANA' }, { id: 9, name: 'HT NESS' }],
    payroll: [{ c24: '182', teacher_name: 'Teacher Ana' }, { c24: '150', teacher_name: 'Teacher Ness' }],
    students: [{ user_id: 'stu1', korean_name: '이도혁' }, { user_id: 'stu2', korean_name: '김나은' }],
    existing: [],
  };
  const run = async (scn, classes, opt) => {
    const db = makeDb(scn);
    const r = await M.applyMirror({ DB: db }, runCypherFake(classes), opt);
    return { r, writes: db.sqls };
  };

  // ① dry_run 이 «기본» — 인자를 안 주면 한 줄도 안 쓴다
  {
    const { r, writes } = await run(BASE, [cls({ cid: 'c1', uid: 'stu1' })], {});
    check('① dry_run 이 기본값이다', r.dry_run === true);
    check('① 계획은 1건 세운다', r.planned.create === 1, r.planned);
    check('🔴 ① 인자를 빠뜨리면 한 줄도 안 쓴다', writes.length === 0, writes);
  }
  // ② dry_run:false 여야 실제로 쓴다
  {
    const { r, writes } = await run(BASE, [cls({ cid: 'c1', uid: 'stu1' })], { dry_run: false });
    check('② 실행하면 만들어진다', r.applied.created === 1, r.applied);
    check('② INSERT 한 건이 나갔다', writes.filter((w) => /^INSERT INTO class_schedules/.test(w.sql)).length === 1, writes.map(w => w.sql));
    const ins = writes.find((w) => /^INSERT INTO class_schedules/.test(w.sql));
    check('② source 가 미러 표식이다', ins.binds.includes('c24-mirror'), ins && ins.binds);
    check('② notes 에 카페24 수업번호가 남는다', ins.binds.includes('c24:c1'), ins && ins.binds);
    check('② status 는 active 로 만든다', /'active'/.test(ins.sql));
  }
  // ③ 🔴 화이트리스트 밖 강사는 손대지 않는다
  {
    const scn = { ...BASE, enabled: ['9'] };   // Ness 만 켜 둠
    const { r, writes } = await run(scn, [cls({ cid: 'c1', uid: 'stu1', t24: '182' })], { dry_run: false });
    check('🔴 ③ 안 켠 강사(Ana)는 만들지 않는다', r.applied.created === 0 && writes.length === 0, r.applied);
    check('③ 판정은 not_whitelisted 로 남는다', r.summary.not_whitelisted === 1, r.summary);
  }
  // ④ 🔴 only_teacher_id 는 «더 좁히는» 것이지 화이트리스트를 건너뛰는 것이 아니다
  {
    const scn = { ...BASE, enabled: [] };      // 아무도 안 켬
    const { r, writes } = await run(scn, [cls({ cid: 'c1', uid: 'stu1' })], { dry_run: false, only_teacher_id: '7' });
    check('🔴 ④ only_teacher_id 로 화이트리스트를 건너뛸 수 없다', r.applied.created === 0 && writes.length === 0, r.applied);
  }
  {
    const { r } = await run(BASE, [cls({ cid: 'c1', uid: 'stu1', t24: '182' }), cls({ cid: 'c2', uid: 'stu2', t24: '150' })],
      { dry_run: true });
    check('④ 화이트리스트가 Ana 만이면 계획도 Ana 것만', r.planned.create === 1, r.planned);
  }
  // ⑤ 🔴 사람이 손댄 행·다른 출처 행은 건드리지 않는다
  {
    const scn = { ...BASE, existing: [
      { id: 11, user_id: 'stu1', teacher_id: '7', scheduled_date: '2026-09-01', start_time: '15:00',
        duration_min: 30, source: 'c24-mirror:manual', status: 'active', notes: 'c24:c1' },
    ] };
    const { r, writes } = await run(scn, [cls({ cid: 'c1', uid: 'stu1' })], { dry_run: false });
    check('🔴 ⑤ 도장 찍힌 행은 안 만들고 안 고친다', writes.length === 0, writes.map(w => w.sql));
    check('⑤ 대신 «어긋남» 으로 알린다', r.summary.diverged === 1 || r.summary.manual_locked === 1, r.summary);
  }
  {
    const scn = { ...BASE, existing: [
      { id: 12, user_id: 'stu1', teacher_id: '7', scheduled_date: '2026-09-01', start_time: '15:00',
        duration_min: 20, source: 'adm-enroll:78', status: 'active', notes: null },
    ] };
    const { r, writes } = await run(scn, [cls({ cid: 'c1', uid: 'stu1' })], { dry_run: false });
    check('🔴 ⑤ 파일럿 수업(adm-enroll)과 겹치면 만들지 않는다', writes.length === 0 && r.summary.conflict === 1, r.summary);
  }
  // ⑥ 고칠 때는 «내 행» 만 (WHERE source)
  {
    const scn = { ...BASE, existing: [
      { id: 13, user_id: 'stu1', teacher_id: '7', scheduled_date: '2026-09-01', start_time: '15:00',
        duration_min: 30, source: 'c24-mirror', status: 'active', notes: 'c24:c1' },
    ] };
    const { r, writes } = await run(scn, [cls({ cid: 'c1', uid: 'stu1' })], { dry_run: false });
    check('⑥ 길이가 달라졌으면 고친다', r.applied.updated === 1, r.applied);
    const up = writes.find((w) => /^UPDATE class_schedules SET start_time/.test(w.sql));
    check('🔴 ⑥ UPDATE 가 source 로 «내 행» 인지 확인한다', !!up && /source = \?/.test(up.sql) && up.binds.includes('c24-mirror'), up);
  }
  // ⑦ 카페24에서 사라진 수업은 «취소» 로만 내린다
  {
    const scn = { ...BASE, existing: [
      { id: 14, user_id: 'stu2', teacher_id: '7', scheduled_date: '2026-09-01', start_time: '20:00',
        duration_min: 20, source: 'c24-mirror', status: 'active', notes: 'c24:gone' },
    ] };
    const { r, writes } = await run(scn, [cls({ cid: 'c1', uid: 'stu1' })], { dry_run: false });
    check('⑦ 사라진 수업을 1건 내린다', r.applied.cancelled === 1, r.applied);
    const cn = writes.find((w) => /status='cancelled'/.test(w.sql));
    check("⑦ 지우지 않고 status='cancelled' 로만", !!cn && !/DELETE/.test(cn.sql));
    check('🔴 ⑦ 그 UPDATE 도 source 로 «내 행» 인지 확인한다', !!cn && /source = \?/.test(cn.sql), cn);
  }
  // ⑧ 🔴 카페24 조회가 0건이면 취소 단계를 통째로 건너뛴다 (조회 실패로 전멸 방지)
  {
    const scn = { ...BASE, existing: [
      { id: 15, user_id: 'stu2', teacher_id: '7', scheduled_date: '2026-09-01', start_time: '20:00',
        duration_min: 20, source: 'c24-mirror', status: 'active', notes: 'c24:gone' },
    ] };
    const { r, writes } = await run(scn, [], { dry_run: false });
    check('🔴 ⑧ 카페24가 0건이면 아무것도 안 내린다', r.applied.cancelled === 0 && writes.length === 0, r.applied);
    check('⑧ 건너뛴 «이유» 를 말한다(0건과 구분)', typeof r.cancel_skipped === 'string' && r.cancel_skipped.length > 5, r.cancel_skipped);
  }
  // ⑨ 이미 만들어져 있고 값도 같으면 아무 일도 하지 않는다
  {
    const scn = { ...BASE, existing: [
      { id: 16, user_id: 'stu1', teacher_id: '7', scheduled_date: '2026-09-01', start_time: '15:00',
        duration_min: 20, source: 'c24-mirror', status: 'active', notes: 'c24:c1' },
    ] };
    const { r, writes } = await run(scn, [cls({ cid: 'c1', uid: 'stu1' })], { dry_run: false });
    check('⑨ 두 번 돌려도 두 번 만들지 않는다(멱등)', writes.length === 0 && r.summary.already === 1, { w: writes.length, s: r.summary });
  }
  // ⑩ 학생 계정이 없으면 만들지 않는다
  {
    const { r, writes } = await run(BASE, [cls({ cid: 'c9', uid: 'nobody' })], { dry_run: false });
    check('🔴 ⑩ 학생 계정이 없으면 만들지 않는다', writes.length === 0 && r.summary.no_student === 1, r.summary);
  }
  // ⑪ 「사람 손이 이긴다」 도장이 화면 쪽(PATCH·DELETE)에 실제로 붙어 있다
  {
    const ADMIN = SRC('api-admin.ts');
    check('⑪ PATCH 가 미러 행에 도장을 찍는다',
      /=== MIRROR_SOURCE\)\s*\{[\s\S]{0,120}?sets\.push\('source = \?'\)/.test(ADMIN));
    check('⑪ 도장을 «같은 UPDATE 안에서» 찍는다(따로 찍으면 그 사이 미러가 되돌린다)',
      /sets\.push\('source = \?'\); binds\.push\(MIRROR_SOURCE_MANUAL\);/.test(ADMIN));
    check('⑪ DELETE(취소)도 도장을 찍는다', /_delMirror[\s\S]{0,200}MIRROR_SOURCE_MANUAL/.test(ADMIN));
  }
  // ⑫ 쓰기 API 가 강사·조직계정을 «따로» 막는다
  {
    const R = SRC('accounting-reports.ts');
    /* ⚠️ 검사 범위를 «길이» 로 자르면 블록이 잘려 멀쩡한 코드가 FAIL 한다(실제로 밟음).
       중괄호 짝으로 그 if 블록만 정확히 오려 낸다(CLAUDE.md 2장 «범위를 길이로 자르지 말 것»). */
    const blockAt = (src, marker) => {
      const i = src.indexOf(marker); if (i < 0) return '';
      let j = src.indexOf('{', i); if (j < 0) return '';
      let d = 0;
      for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
      }
      return src.slice(i);
    };
    const blk = blockAt(R, "if (p.startsWith('c24-mirror/'))");
    check('⑫ 쓰기 블록을 찾았다', blk.length > 800, blk.length);
    check('⑫ 쓰기는 POST 만 받는다', /method[\s\S]{0,40}!== 'POST'/.test(blk));
    check('🔴 ⑫ 강사를 막는다(getAdminActor.isTeacher)', /actor\.isTeacher\)? return json\(\{ ok: false, error: 'forbidden_teacher'/.test(blk));
    check('🔴 ⑫ 지사·대리점을 막는다(isOrgScopedRole)', /isOrgScopedRole\([\s\S]{0,80}forbidden_scope/.test(blk));
    check('⑫ canEditOrg 로 막지 않는다(그 함수는 교사에게도 true)', !/canEditOrg/.test(blk));
    check('⑫ dry_run 은 «false 일 때만» 실행', /dry_run: body\?\.dry_run === false \? false : true/.test(blk));
  }
}


/* ═══ K. 자동 실행 (cron) — 배선과 «끄는 스위치» 를 실제로 돌려서 확인 ═══
   2026-08-31 사장님 지시: 「자동 실행도 넣어줘」.

   ⛔ 이 절이 지키는 것
     · 새 cron 을 만들지 않는다 — 계정 한도 5/5 가 꽉 찼다(늘리면 배포가 code 10072 로 거절)
     · «시(hour)» 로 가르지 않는다 — 15분 트리거 때문에 하루 네 번 + 정각 동시 2회가 된다
     · 끄는 스위치는 mode='off' 하나 — 그때는 **카페24를 부르지도 않는다**
     · cron 이 부르는 함수는 **절대 던지지 않는다** — 던지면 사이트 감시견까지 함께 죽는다
*/
console.log('\n[ K. 자동 실행 (cron) ]');
{
  const IDX = SRC('index.ts');
  const TOML = readFileSync(resolve(__dir, '../cloudflare-deploy/wrangler.toml'), 'utf8');

  // ── 크론 표는 그대로여야 한다 (한도 5/5)
  const cm = TOML.match(/^crons\s*=\s*\[([^\]]*)\]/m);
  const crons = cm ? [...cm[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  check('K① 크론 표를 읽었다', crons.length > 0, crons);
  check('🔴 K① 새 cron 을 만들지 않았다 (한도 5개)', crons.length <= 5, `${crons.length}개 — 6번째는 배포가 code 10072 로 거절된다`);

  // ── 배선: 두 갈래가 서로 다른 트리거를 탄다
  const blockAt = (src, marker) => {
    const i = src.indexOf(marker); if (i < 0) return '';
    let j = src.indexOf('{', i); if (j < 0) return '';
    let d = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    return src.slice(i);
  };
  const wd = blockAt(IDX, 'if (isWatchdogTick) {');
  check('K② 15분 트리거로 도는 «좁은 창» 이 있다', /runMirrorSweep/.test(wd), wd.slice(0, 120));
  check('K② 좁은 창은 2일이다', /days: 2/.test(wd));
  check("K② 라벨이 'watchdog' 이다", /label: 'watchdog'/.test(wd));
  check('🔴 K② 예외를 삼킨다(감시견을 같이 죽이면 안 된다)', /try \{[\s\S]*?catch/.test(wd));

  const nightlyIdx = IDX.indexOf("cronIs('0 18 * * *')");
  const nightly = nightlyIdx >= 0 ? blockAt(IDX.slice(nightlyIdx), "cronIs('0 18 * * *')") : '';
  check('K③ 야간 cron 으로 도는 «넓은 창» 이 있다', /runMirrorSweep/.test(nightly));
  check('K③ 넓은 창은 14일이다', /days: 14/.test(nightly));
  check("K③ 라벨이 'nightly' 이다", /label: 'nightly'/.test(nightly));
  check('🔴 K③ 야간은 «어느 cron 인가» 로 가른다(hour 비교 아님)', nightlyIdx >= 0);

  // ⛔ 미러 호출이 hour 비교 안에 들어가면 하루 네 번 돈다 — 그 형태를 못 박아 막는다
  /* ⚠️ «이름이 몇 번 나오나» 로 세면 import 구조분해까지 함께 세어진다(실제로 밟음).
     세야 하는 것은 «부르는 자리» 뿐이다 — await 호출만 센다. */
  const sweepCalls = [...IDX.matchAll(/await runMirrorSweep\(/g)].length;
  check('K④ 미러 자동 실행 «호출» 은 정확히 두 곳(좁은 창·넓은 창)', sweepCalls === 2, `${sweepCalls}곳`);
  check('🔴 K④ hour 비교 안에서 부르지 않는다',
    !/hour === \d+[\s\S]{0,400}?runMirrorSweep/.test(IDX));

  // ── 「끄는 스위치」를 실제로 돌려서 확인
  const makeDb = (scn) => {
    const sqls = [];
    const pick = (sql) => {
      if (/FROM c24_mirror_config WHERE k='mode'/.test(sql)) return { first: { v: scn.mode } };
      /* ⚠️ enabled=1(켠 강사)과 enabled=0(막은 강사)은 **같은 표**를 본다.
         표 이름으로만 가르면 둘이 같은 답을 받아 «켠 강사가 곧 막힌 강사» 가 된다(실제로 밟음). */
      if (/FROM c24_mirror_teachers WHERE enabled = 0/.test(sql)) return { all: (scn.blocked || []).map((t) => ({ teacher_id: t })) };
      if (/FROM c24_mirror_teachers/.test(sql)) return { all: (scn.enabled || []).map((t) => ({ teacher_id: t })) };
      if (/FROM c24_mirror_config WHERE k LIKE/.test(sql)) return { all: [] };
      if (/FROM teachers WHERE active/.test(sql)) return { all: [{ id: 7, name: 'ANA' }] };
      if (/FROM teacher_payroll_auto/.test(sql)) return { all: [{ c24: '182', teacher_name: 'Teacher Ana' }] };
      if (/FROM students_erp/.test(sql)) return { all: [{ user_id: 'stu1', korean_name: '이다연' }] };
      if (/FROM class_schedules/.test(sql)) return { all: [] };
      return { all: [], first: null };
    };
    return {
      sqls, exec: async () => {},
      prepare(sql) {
        const r = pick(sql);
        const st = {
          bind: (...b) => { st._b = b; return st; },
          all: async () => ({ results: r.all || [] }),
          first: async () => r.first ?? null,
          run: async () => { sqls.push(sql.replace(/\s+/g, ' ').trim()); return {}; },
        };
        return st;
      },
    };
  };
  let cypherCalls = 0;
  const cypher = async () => {
    cypherCalls++;
    const s = Date.UTC(2026, 8, 1, 6, 0);
    return { fields: ['class_id', 'user_id', 'start_ms', 'end_ms', 'date', 'class_state', 'teacher_id'],
             values: [['c1', 'stu1', s, s + 1200000, '2026-09-01', 1, '182']] };
  };

  // mode='off' → 카페24를 부르지도 않는다
  {
    cypherCalls = 0;
    const db = makeDb({ mode: 'off' });
    const r = await M.runMirrorSweep({ DB: db }, cypher, { days: 2, label: 'watchdog' });
    check("🔴 K⑤ mode='off' 면 카페24를 부르지 않는다", cypherCalls === 0, `${cypherCalls}회 불렀다`);
    check("K⑤ 건너뛴 이유를 남긴다", r.skipped === 'mode_off', r);
    check('K⑤ 아무것도 쓰지 않는다', db.sqls.length === 0, db.sqls);
  }
  // whitelist 인데 켠 강사가 0명 → 역시 안 부른다
  {
    cypherCalls = 0;
    const db = makeDb({ mode: 'whitelist', enabled: [] });
    const r = await M.runMirrorSweep({ DB: db }, cypher, { days: 2, label: 'watchdog' });
    check('K⑥ 켠 강사가 없으면 조회를 아낀다', cypherCalls === 0 && r.skipped === 'no_teacher_enabled', r);
  }
  // 켠 강사가 있으면 실제로 만든다 + 마지막 실행을 남긴다
  {
    cypherCalls = 0;
    const db = makeDb({ mode: 'whitelist', enabled: ['7'] });
    const r = await M.runMirrorSweep({ DB: db }, cypher, { days: 2, label: 'watchdog' });
    check('K⑦ 켠 강사가 있으면 실제로 만든다', r.applied && r.applied.created === 1, r.applied);
    check('K⑦ 마지막 실행을 기록한다', db.sqls.some((q) => /INSERT INTO c24_mirror_config/.test(q)), db.sqls);
  }
  // 🔴 던지지 않는다 — 카페24가 죽어도 감시견은 살아야 한다
  {
    const db = makeDb({ mode: 'whitelist', enabled: ['7'] });
    const boom = async () => { throw new Error('neo4j down'); };
    let threw = false;
    let r = null;
    try { r = await M.runMirrorSweep({ DB: db }, boom, { days: 2, label: 'watchdog' }); }
    catch { threw = true; }
    check('🔴 K⑧ 카페24가 죽어도 던지지 않는다', !threw);
    check('K⑧ 대신 «못 돌았다» 를 이유와 함께 남긴다',
      !!r && Array.isArray(r.errors) && /neo4j down/.test(r.errors.join(' ')), r && r.errors);
  }
  /* 🔴 K⑨ 18:00 UTC 정각에는 15분 트리거와 야간 cron 이 «동시에» 운다.
     두 호출이 각각 «아직 없네» 로 읽고 나란히 INSERT 하면 같은 수업이 두 벌 생긴다.
     코드로는 못 막으므로 DB 가 보증해야 한다(부분 유니크 인덱스). */
  {
    const bothFireAt18 = crons.some((c) => c.startsWith('*')) && crons.includes('0 18 * * *');
    check('K⑨ 두 트리거가 18:00 에 겹치는 것이 사실이다(그래서 아래 보증이 필요하다)', bothFireAt18, crons);
    check('🔴 K⑨ 같은 카페24 수업이 두 벌 생기지 않게 DB 가 막는다',
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_c24_mirror_class ON class_schedules\(notes\)/.test(MIRROR_TS));
    check("K⑨ 그 인덱스는 미러 행에만 걸린다(사람 수업은 안 건드린다)",
      /idx_c24_mirror_class[\s\S]{0,120}WHERE source='c24-mirror'/.test(MIRROR_TS));
  }
  /* 🔴 K⑫ (2026-09-01 사장님 「마리안은 그만 두었어」) 퇴사 강사의 잔재가 전환일에 살아나면 안 된다.
     화이트리스트는 «적혀 있으면 켠다» 라 «없는 강사» 는 mode='all' 에서 전부 만들어진다.
     그래서 enabled=0 은 «아직 안 켬» 이 아니라 «켜지 마라» 여야 하고 'all' 도 이겨야 한다. */
  {
    // ⚠️ K 절은 J 절과 다른 블록이라 그쪽 헬퍼가 안 보인다 — K 자신의 cypher 를 쓴다
    const dbAll = makeDb({ mode: 'all', enabled: [], blocked: ['7'] });
    const r = await M.applyMirror({ DB: dbAll }, cypher, { dry_run: false });
    check('🔴 K⑫ 명시적으로 끈 강사는 mode=\'all\' 에서도 안 만든다',
      r.applied.created === 0 && dbAll.sqls.length === 0, { applied: r.applied, sqls: dbAll.sqls });
    check('K⑫ 결과에 «막은 강사» 가 실린다', Array.isArray(r.blocked_teachers) && r.blocked_teachers.includes('7'), r.blocked_teachers);
  }
  check('🔴 K⑫ 막기 검사가 mode 검사 «앞» 에 있다',
    MIRROR_TS.indexOf('if (blocked.has(tid)) return false;') < MIRROR_TS.indexOf("return mode === 'all' || enabled.has(tid);"));

  // 성적표가 「자동으로 도는가」를 함께 보여 준다
  check('K⑩ 성적표에 마지막 자동 실행이 실린다', /last_runs: lastRuns/.test(MIRROR_TS));
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach(f => console.log('  · ' + f)); }
console.log(`${'─'.repeat(52)}\n`);
process.exit(FAIL ? 1 : 0);
