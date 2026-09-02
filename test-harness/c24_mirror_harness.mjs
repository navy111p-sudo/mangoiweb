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
//     L. 퇴사 강사 «잔재» 와 «원부에 없는 사람» 을 가른다 — 할 일이 정반대라 한 숫자로 못 합친다
//     M. 재직 여부가 두 표(teachers.active · teacher_profiles.status)에 있다 — 쓰는 곳에서 맞춘다
//     N. 명부에서 «숨긴» 학생(시험용 계정 등)의 카페24 수업은 만들지 않는다 — 사실대로 말한다
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/src/' + f), 'utf8');
const PUB = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/public/' + f), 'utf8');

/* 📦 대상 모듈을 «있는 그대로» 돌린다(빌드 도구 없이).
   node 22 는 .ts 를 타입만 벗겨 실행하지만 확장자 없는 상대 import(`./d1-chunk`)는
   ESM 규칙상 못 찾는다. 그래서 그 한 줄만 절대경로로 바꾼 사본을 임시로 만들어 import 한다.
   ⛔ 로직은 한 글자도 안 바꾼다 — 바꾸면 «검사한 코드»와 «배포될 코드»가 달라진다. */
const srcDir = resolve(__dir, '../cloudflare-deploy/src');
const _tmps = [], _made = new Map();
/* ⚠️ .ts 를 그냥 import 하면 확장자 없는 상대 import(`./d1-chunk`)가 ESM 규칙상 안 풀린다.
     그러면 그 줄이 «예외» 가 되고, 부르는 쪽이 try/catch 로 삼키면 **검사가 헛돈다**
     (실제로 밟음: loadHiddenStudents 가 늘 빈 집합을 돌려줘 「못 찾는다」 검사만 통과했다).
   ✅ 그래서 상대 import 를 «사본의 절대경로» 로 바꾼 임시 사본을 만든다 — 사본이 가리키는
      모듈도 사본이어야 하므로 **재귀**로 만든다(원본을 가리키면 그 안의 import 가 또 안 풀린다).
   ⛔ 로직은 한 글자도 안 바꾼다 — 바꾸면 «검사한 코드»와 «배포될 코드»가 달라진다. */
const mkCopy = (name) => {
  if (_made.has(name)) return _made.get(name);
  const f = resolve(tmpdir(), `${name}.harness.${process.pid}.ts`);
  _made.set(name, f); _tmps.push(f);            // 순환 import 대비: 경로를 먼저 등록
  writeFileSync(f, SRC(name + '.ts').replace(
    /from '\.\/([\w-]+)'/g, (_m, n) => `from '${pathToFileURL(mkCopy(n)).href}'`));
  return f;
};
const loadTs = (name) => import(pathToFileURL(mkCopy(name)).href);
/* ⚠️ 사본은 «실행이 끝날 때» 지운다 — 곧바로 지우면 뒤쪽 절(N)에서 다시 부를 때
     이미 만든 것으로 기억(memo)하고 파일은 없어 ERR_MODULE_NOT_FOUND 가 난다(실제로 밟음). */
process.on('exit', () => { for (const f of _tmps) { try { rmSync(f); } catch {} } });
const M = await loadTs('c24-mirror');
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


/* ═══ L. 퇴사 강사 — «잔재» 와 «원부에 없는 사람» 을 가른다 (2026-09-01) ═══
   발단: 사장님이 Mariane 을 퇴사 처리하자 그 사람의 카페24 잔재 30건이 화면에서
   **말없이** 사라졌다 — 판정이 no_teacher 가 되는데 화면은 그리지도 세지도 않았다.
   (그리고 「강사 못 이음 N개」 경고는 세려는 행이 이미 걸러진 뒤라 **영원히 0** 인 죽은 코드였다.)

   ⛔ 이 절이 지키는 것
     · 둘을 한 숫자로 합치지 않는다 — 할 일이 정반대다(잔재=그냥 둠 / 원부에 없음=등록 필요)
     · 퇴사자는 어떤 모드에서도 만들어지지 않는다 (mode='all' 포함)
     · 재직이 언제나 이긴다 — 같은 이름이 양쪽에 있으면 재직 쪽으로 잇는다
     · 화면은 «그리지 않는» 것과 «세지 않는» 것을 구분한다
*/
console.log('\n[ L. 퇴사 강사 잔재 vs 원부에 없는 강사 ]');
{
  const Q6 = PUB('js/adm-q6.js');

  // ── ① 판정: 퇴사자 링크가 있으면 no_teacher_left 로 간다
  const linksLeft = new Map([['24', { name: 'Teacher Mariane', teacherId: null, leftTeacherId: '11' }]]);
  const rLeft = M.planMirror([cls({ tid: '24' })], linksLeft, STUDENTS, [], 'all', new Set())[0];
  check('L① 퇴사 강사는 no_teacher_left 로 가른다', rLeft.verdict === 'no_teacher_left', rLeft.verdict);
  check('L① 이유에 «퇴사» 라고 적는다', /퇴사/.test(rLeft.detail || ''), rLeft.detail);

  // ── ② 🔴 퇴사자는 mode='all'(전환일) 에서도 절대 만들어지지 않는다
  for (const mode of ['off', 'whitelist', 'all']) {
    const r = M.planMirror([cls({ tid: '24' })], linksLeft, STUDENTS, [], mode, new Set(['11']))[0];
    check(`🔴 L② mode='${mode}' 에서도 퇴사자는 ok 가 안 된다`, r.verdict !== 'ok', r.verdict);
  }

  // ── ③ 원부에 «아예 없는» 사람은 그대로 no_teacher (경고 대상이라 뭉치면 안 된다)
  const rGhost = M.planMirror([cls({ tid: '99' })], LINKS, STUDENTS, [], 'all', new Set())[0];
  check('L③ 원부에 없는 사람은 no_teacher 그대로', rGhost.verdict === 'no_teacher', rGhost.verdict);
  check('🔴 L③ 그래서 둘은 서로 다른 판정이다', rGhost.verdict !== rLeft.verdict);

  // ── ④ summarize 가 둘을 따로 센다
  const sum = M.summarize([rLeft, rGhost]);
  check('L④ summarize 에 no_teacher_left 칸이 있다', typeof sum.no_teacher_left === 'number', Object.keys(sum));
  check('L④ 둘을 따로 센다', sum.no_teacher_left === 1 && sum.no_teacher === 1, sum);

  // ── ⑤ 링크 만들 때 «재직이 이긴다» — 같은 이름이 양쪽에 있으면 재직 쪽
  const dbBoth = {
    exec: async () => {},
    prepare(sql) {
      const pick = () => {
        if (/FROM teachers WHERE active = 1/.test(sql)) return [{ id: 7, name: 'ANA' }];
        if (/FROM teachers WHERE active = 0/.test(sql)) return [{ id: 99, name: 'ANA' }];   // 동명 퇴사자
        if (/FROM teacher_payroll_auto/.test(sql)) return [{ c24: '182', teacher_name: 'Teacher Ana' }];
        return [];
      };
      const st = { bind: () => st, all: async () => ({ results: pick() }), first: async () => null, run: async () => ({}) };
      return st;
    },
  };
  const linksBoth = await M.loadTeacherLinks({ DB: dbBoth }, ['182']);
  check('🔴 L⑤ 같은 이름이 양쪽에 있으면 «재직» 으로 잇는다',
    linksBoth.get('182')?.teacherId === '7', linksBoth.get('182'));
  check('L⑤ 그때는 퇴사자 번호를 달지 않는다', !linksBoth.get('182')?.leftTeacherId, linksBoth.get('182'));

  // ── ⑥ 퇴사자만 있을 때는 leftTeacherId 가 채워진다 (실제로 돌려서 확인)
  const dbLeftOnly = {
    exec: async () => {},
    prepare(sql) {
      const pick = () => {
        if (/FROM teachers WHERE active = 1/.test(sql)) return [];
        if (/FROM teachers WHERE active = 0/.test(sql)) return [{ id: 11, name: 'MARIANE' }];
        if (/FROM teacher_payroll_auto/.test(sql)) return [{ c24: '24', teacher_name: 'Teacher Mariane' }];
        return [];
      };
      const st = { bind: () => st, all: async () => ({ results: pick() }), first: async () => null, run: async () => ({}) };
      return st;
    },
  };
  const linksOnlyLeft = await M.loadTeacherLinks({ DB: dbLeftOnly }, ['24']);
  check('L⑥ 퇴사자 명부에서 찾으면 leftTeacherId 를 단다',
    linksOnlyLeft.get('24')?.leftTeacherId === '11', linksOnlyLeft.get('24'));
  check('🔴 L⑥ 그래도 teacherId 는 비어 있다(만들면 안 되므로)',
    linksOnlyLeft.get('24')?.teacherId === null, linksOnlyLeft.get('24'));

  // ── ⑦ 화면: 로드 단계에서 «세기 전에» 버리지 않는다
  check('🔴 L⑦ 로드가 판정으로 통째로 거르지 않는다',
    !/filter\(function\(x\)\{ return x && PH54_C24_SHOW\[x\.verdict\]; \}\)/.test(Q6),
    '거르면 「원부에 없는 강사 N개」가 영원히 0 이 된다(죽은 코드였다)');
  check('L⑦ 그리는 판정은 여전히 PH54_C24_SHOW 로 고른다', /if \(!PH54_C24_SHOW\[r\.verdict\]\) return;/.test(Q6));

  // ── ⑧ 화면: 두 숫자를 따로 센다 · 따로 그린다
  check('L⑧ 퇴사 잔재를 따로 센다', /c24Left\+\+/.test(Q6));
  check('L⑧ 원부에 없는 강사를 따로 센다', /c24NoTeacher\+\+/.test(Q6));
  check('🔴 L⑧ 범례가 둘을 다른 줄로 말한다',
    /퇴사 강사 잔재/.test(Q6) && /원부에 없는 강사/.test(Q6));
  check('🔴 L⑧ 경고색은 «원부에 없는 강사» 에만 쓴다(잔재는 늘 켜져 있어 경고가 무뎌진다)',
    /ph54-count-warn[^]{0,120}원부에 없는 강사/.test(Q6));
  check('L⑧ 퇴사 잔재는 «안 그림» 이라고 밝힌다', /안 그림/.test(Q6));
}

/* ═══ M. 재직 여부가 두 표에 있다 — 쓰는 곳 한 군데에서 맞춘다 (2026-09-01) ═══
   발단: 사장님 「Mariane 은 퇴사했는데 왜 아직 명부에 있나」.
     · teacher_profiles.status … 명부 화면
     · teachers.active        … 스케줄·배정·카페24 미러
   같은 날 **양쪽 방향으로** 어긋났다(원부만 내린 것 2명 · 화면에서 명부만 내린 것 2명).
*/
console.log('\n[ M. 명부 ↔ 원부 재직 여부 맞추기 ]');
{
  const CORE = PUB('js/adm-core.js');
  /* 검사 범위는 길이가 아니라 «중괄호 짝» 으로 자른다 — 길이로 자르면 옆 핸들러가 딸려 온다
     (CLAUDE.md 2장: 「검사 범위를 길이로 자르지 마세요」). */
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
  const patch = blockAt(ADMIN, "if (method === 'PATCH') {");
  check('M① 프로필 PATCH 블록을 찾았다', patch.length > 200, patch.length);
  /* ⚠️ 이 검사는 한 번 헛돌았다 — 같은 파일에 `b.hasOwnProperty('status')` 가 세 곳 있어서
       (감사로그·before 담기) 내 동기화를 통째로 지워도 통과했다. 그래서 «그 줄이 있는가» 가
       아니라 «동기화 코드가 그 가드 «안» 에 있는가» 를 위치로 판정한다(CLAUDE.md 2장). */
  const _mSync = patch.indexOf("const wantLive = String(b.status");
  check('M① 원부 동기화 코드가 있다', _mSync > 0, _mSync);
  check('🔴 M① status 를 보냈을 때만 원부를 건드린다',
    _mSync > 0 && /hasOwnProperty\('status'\)/.test(patch.slice(Math.max(0, _mSync - 200), _mSync)),
    '동기화가 status 가드 밖에 있으면 전화번호만 고쳐도 원부가 바뀐다');
  check('M① 원부의 active 를 실제로 고친다',
    /UPDATE teachers SET active = \?/.test(patch));
  check('🔴 M② 연결이 없으면 «추측해서» 잇지 않는다',
    /not_linked/.test(patch) && !/LIKE '%' \+/.test(patch));
  check('🔴 M③ 내릴 때는 카페24 미러도 함께 막는다',
    /c24_mirror_teachers[^]{0,400}enabled = 0/.test(patch));
  check('🔴 M③ 되살릴 때는 자동으로 켜지 않는다',
    /if \(!wantLive\) \{/.test(patch) && !/enabled = 1/.test(patch));
  check('🔴 M④ 원부 반영이 실패해도 프로필 저장을 실패로 만들지 않는다',
    /rosterSync = \{ changed: 0, error:/.test(patch));
  check('M④ 무엇이 됐는지 응답에 싣는다', /roster_sync: rosterSync/.test(patch));
  check('🔴 M⑤ 「안보임」(list_hidden)은 재직 여부가 아니라 손대지 않는다',
    !/list_hidden[^]{0,200}UPDATE teachers/.test(patch));

  // 읽는 쪽 — «다르다는 사실» 만 보여 준다(자동으로 고치지 않는다)
  check('M⑥ 목록이 원부 상태를 함께 내려준다', /ROSTER_ACTIVE/.test(ADMIN) && /roster_active/.test(ADMIN));
  check('M⑥ 어긋난 건수를 세어 함께 준다', /roster_mismatch/.test(ADMIN));
  check('M⑥ 끊어진 연결도 따로 알린다', /roster_broken_link/.test(ADMIN));
  check('🔴 M⑥ 읽는 곳에서 «자동으로 맞추지» 않는다',
    !/roster_mismatch[^]{0,300}UPDATE (teachers|teacher_profiles)/.test(ADMIN));
  check('M⑥ 조인이 아니라 서브쿼리다(조인은 행을 늘린다)',
    /\(SELECT t\.active FROM teachers t/.test(ADMIN));

  // 화면 — 최상위 선언이어야 다른 곳에서 부를 수 있다
  check('M⑦ 명부가 어긋남을 그린다', /_tpRenderRosterMismatch/.test(CORE));
  check('🔴 M⑦ 그 함수는 «최상위» 선언이다',
    /^function _tpRenderRosterMismatch\(/m.test(CORE),
    '다른 함수 안에 넣으면 호출부가 전부 ReferenceError 인데 문자열 검사는 통과한다');
  check('M⑦ 어긋남이 없으면 상자를 지운다', /box\.remove\(\)/.test(CORE));
  check('🔴 M⑦ 화면이 자동으로 고치지 않는다(사람에게 알리기만)',
    !/_tpRenderRosterMismatch[^]{0,800}fetch\([^)]*method:\s*'PATCH'/.test(CORE));
}


/* ═══ N. 명부에서 «숨긴» 학생은 미러가 만들지 않는다 (2026-09-01) ═══
   발단: 사장님 확인 「MANGO AI는 테스트 계정이야, 미러에서 빼줘」.
   카페24에 그 계정으로 앞으로 10건이 있고, 그중 3자리는 여러 강사가 같은 시각에 겹쳐 있었다.

   ⛔ 이 절이 지키는 것
     · no_student(「계정이 없다」)로 뭉뚱그리지 않는다 — 거짓이고 화면에 경고로 뜬다
     · 숨긴 학생은 어떤 모드에서도(전환일 포함) 만들어지지 않는다
     · 못 읽으면 «아무도 안 뺀다»(fail-open) — 거꾸로 전원을 빼면 시간표가 통째로 안 생긴다
*/
console.log('\n[ N. 숨긴 학생 제외 ]');
{
  const Q6 = PUB('js/adm-q6.js');
  const OVR = SRC('student-override.ts');
  const hid = new Set(['stu2']);

  // ① 숨긴 학생은 student_hidden 으로 «사실대로»
  const rH = M.planMirror([cls({ uid: 'stu2' })], LINKS, STUDENTS, [], 'all', new Set(), hid)[0];
  check('N① 숨긴 학생은 student_hidden 으로 가른다', rH.verdict === 'student_hidden', rH.verdict);
  check('🔴 N① no_student(거짓)로 뭉뚱그리지 않는다', rH.verdict !== 'no_student');
  check('N① 이유에 «숨긴» 이라고 적는다', /숨긴/.test(rH.detail || ''), rH.detail);

  // ② 어떤 모드에서도 안 만든다
  for (const mode of ['off', 'whitelist', 'all']) {
    const r = M.planMirror([cls({ uid: 'stu2' })], LINKS, STUDENTS, [], mode, new Set(['28']), hid)[0];
    check(`🔴 N② mode='${mode}' 에서도 숨긴 학생은 ok 가 안 된다`, r.verdict !== 'ok', r.verdict);
  }

  // ③ 안 숨긴 학생은 그대로 만들어진다 (헛돌이 방지 — «못 만든다» 검사만 있으면 늘 통과한다)
  const rOk = M.planMirror([cls({ uid: 'stu1' })], LINKS, STUDENTS, [], 'all', new Set(), hid)[0];
  check('🔴 N③ 숨기지 «않은» 학생은 그대로 만든다', rOk.verdict === 'ok', rOk.verdict);

  // ④ 기본값 — 인자를 안 넘겨도 옛 동작 그대로
  const rDef = M.planMirror([cls({ uid: 'stu2' })], LINKS, STUDENTS, [], 'all', new Set())[0];
  check('N④ 숨김 목록을 안 넘기면 아무도 안 빠진다', rDef.verdict === 'ok', rDef.verdict);

  // ⑤ summarize 에 칸이 있다
  check('N⑤ summarize 에 student_hidden 칸이 있다',
    typeof M.summarize([rH]).student_hidden === 'number');
  check('N⑤ 따로 센다', M.summarize([rH, rOk]).student_hidden === 1);

  // ⑥ 헬퍼가 fail-open — 표가 없어도 던지지 않고 «아무도 안 숨김»
  {
    const boomDb = { prepare() { throw new Error('no such table'); }, exec: async () => {} };
    const mod = await loadTs('student-override');
    let threw = false, got = null;
    try { got = await mod.loadHiddenStudents({ DB: boomDb }, ['a', 'b']); } catch { threw = true; }
    check('🔴 N⑥ 표가 없어도 던지지 않는다', !threw);
    check('🔴 N⑥ 그때는 «아무도 안 숨김»(빈 집합)', !!got && got.size === 0, got && got.size);
  }

  // ⑦ 진짜로 «숨긴 사람만» 골라 온다 (헛돌이 방지 짝 검사)
  {
    const db = {
      exec: async () => {},
      prepare(sql) {
        const st = {
          bind: () => st,
          all: async () => ({ results: /hidden = 1/.test(sql) ? [{ user_id: 'mangoai1' }] : [] }),
          first: async () => null, run: async () => ({}),
        };
        return st;
      },
    };
    const mod = await loadTs('student-override');
    const got = await mod.loadHiddenStudents({ DB: db }, ['mangoai1', 'jeong']);
    check('N⑦ 숨긴 계정을 실제로 찾아온다', got.has('mangoai1'), Array.from(got));
    check('N⑦ 안 숨긴 계정은 안 담는다', !got.has('jeong'));
  }

  // ⑧ 배선 — 두 호출부가 숨김 목록을 넘긴다
  /* ⚠️ 인자를 하나 늘렸다고 깨지는 «모양» 검사로 못 박지 않는다 — 뜻으로 본다(CLAUDE.md 2장).
     실제로 2026-09-01 에 slotSeen 을 더하면서 옛 정규식이 통째로 안 맞아 거짓 FAIL 이 났다. */
  const calls = [...MIRROR_TS.matchAll(/planMirror\(classes, links, students, existing, mode, enabled([^)]*)\)/g)];
  check('N⑧ planMirror 호출 두 곳이 모두 숨김 목록을 넘긴다',
    calls.length === 2 && calls.every(m => /\bhidden\b/.test(m[1])), calls.map(m => m[0]));
  check('N⑧ 숨김 목록을 실제로 읽어 온다', /await loadHiddenStudents\(/.test(MIRROR_TS));

  // ⑨ 표를 지우지 않는다 — 숨김은 «안 보여주는 것» 이지 «지우는 것» 이 아니다
  /* ⚠️ 부정 검사는 «주석을 벗겨 낸 사본» 으로 판정한다 — 이 파일 머리말이 야간 동기화의
       DELETE 문을 «설명» 하고 있어서, 원본으로 검사하면 자기 주석을 잡는다(CLAUDE.md 2장). */
  const ovrCode = OVR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('🔴 N⑨ 숨김 처리에 DELETE 를 쓰지 않는다',
    !/DELETE\s+FROM\s+students_erp/i.test(ovrCode));

  // ⑩ 화면 — 경고색이 아니라 회색으로, 따로 센다
  check('N⑩ 화면이 숨긴 계정을 따로 센다', /c24Hidden\+\+/.test(Q6));
  check('N⑩ 범례가 «숨긴 계정» 이라고 말한다', /숨긴 계정/.test(Q6));
  check('🔴 N⑩ 경고색을 쓰지 않는다(할 일이 없다)',
    !/ph54-count-warn[^]{0,100}숨긴 계정/.test(Q6));

  // ⑪ 머리말의 «읽는 쪽» 목록에 미러가 등재됐다(한쪽만 고치면 불일치가 난다고 적힌 그 목록)
  check('N⑪ student-override.ts 머리말에 미러가 등재됐다', /c24-mirror\.ts\s+planMirror/.test(OVR));
}

console.log('\n[ O. 강사 변경 잔재 막기 — 2026-09-01 Zee 실사고 (재발 방지) ]');
{
  /* 📜 실사고: Zee 를 켠 날 강사 화면에 «없는 수업» 이 떴다 — 9/1 17:40 허윤아(카페24 511745).
       카페24가 강사를 바꿀 때 옛 예약을 안 지우고 남기는데 미러가 그대로 만들었다.
     아래 이력 숫자는 그날 운영 D1 에서 **실제로 잰 값** 그대로다.
     ⛔ 「같은 학생·같은 날 2건이면 막는다」로 고치면 안 된다 — 허윤아는 진짜로 하루 두 번
        (17:00·21:30) 수업한다. 그래서 O-2 가 «막으면 안 되는 쪽» 을 함께 못 박는다. */
  const LINKS_O = new Map([['192', { name: 'Teacher Zee', teacherId: '9' }],
                           ['35',  { name: 'Teacher Far', teacherId: '5' }]]);
  const STU_O = new Map([['hya1897', '허윤아']]);
  const K = M.slotKey;
  const co = (id, date, time, tid, dur = 30) => ({
    class_id: id, user_id: 'hya1897', date, start_ms: KST(date, time),
    end_ms: KST(date, time) + dur * 60000, class_state: 1, teacher_id: tid,
  });
  const runO = (list, seen, existing = []) =>
    M.planMirror(list, LINKS_O, STU_O, existing, 'whitelist', new Set(['9', '5']), new Set(), seen);
  const vmap = (rows) => Object.fromEntries(rows.map(r => [r.class_id, r.verdict]));

  // 2026-09-01 D1 실측 이력 (attendance 의 c24-* 행을 (학생·강사·시각)으로 센 값)
  const SEEN = new Map([
    [K('hya1897', '192', '21:30'), 4],   // 8/31·9/1·9/2·9/4 — 진짜 자리
    [K('hya1897', '192', '17:40'), 1],   // 그 유령 자신뿐   — 잔재
    [K('hya1897', '192', '17:00'), 3],   // 9/2·9/3·9/4      — 진짜 자리
    [K('hya1897', '35',  '17:00'), 2],   // 8/27·9/1
  ]);

  // ── O-1 그날의 실제 배치 — 유령«만» 막힌다 ──
  const day1 = [co('511745', '2026-09-01', '17:40', '192'),
                co('512025', '2026-09-01', '21:30', '192'),
                co('511746', '2026-09-01', '17:00', '35')];
  const v1 = vmap(runO(day1, SEEN));
  check('🔴 O-1 유령(17:40 · 이력 1건)은 만들지 않는다', v1['511745'] === 'suspect_dup', JSON.stringify(v1));
  check('O-1 같은 날 진짜 수업(21:30 · 이력 4건)은 그대로 만든다', v1['512025'] === 'ok', JSON.stringify(v1));
  check('O-1 그날 다른 강사 수업(17:00 Far)도 그대로 만든다', v1['511746'] === 'ok', JSON.stringify(v1));

  // ── O-2 ⛔ 진짜로 하루 두 번 수업하는 날은 «한 건도» 막으면 안 된다 ──
  const day2 = [co('512026', '2026-09-02', '17:00', '192'),
                co('512028', '2026-09-02', '21:30', '192')];
  const v2 = vmap(runO(day2, SEEN));
  check('🔴 O-2 하루 두 번이어도 둘 다 되풀이되는 자리면 둘 다 만든다',
    v2['512026'] === 'ok' && v2['512028'] === 'ok', JSON.stringify(v2));

  // ── O-3 입구 조건 — 그날 한 건뿐이면 이력이 없어도 막지 않는다(새 주간 수업이 전멸한다) ──
  const v3 = vmap(runO([co('999001', '2026-09-05', '11:11', '192')], SEEN));
  check('🔴 O-3 그날 한 건뿐이면 이력이 0건이어도 만든다', v3['999001'] === 'ok', JSON.stringify(v3));

  // ── O-4 이력을 «못 읽었을 때» 는 판정을 통째로 건너뛴다(0건과 «안 봤다»는 다르다) ──
  const v4 = vmap(runO(day1, new Map()));
  check('🔴 O-4 이력이 비면 잔재 판정을 건너뛴다 — 옛 동작 그대로',
    v4['511745'] === 'ok' && v4['512025'] === 'ok', JSON.stringify(v4));

  // ── O-5 이미 만들어진 행은 건드리지 않는다(지난 일을 되짚어 지우지 않는다) ──
  const had = [{ id: 1045, user_id: 'hya1897', teacher_id: '9', scheduled_date: '2026-09-01',
                 start_time: '17:40', duration_min: 30, source: 'c24-mirror', status: 'active',
                 notes: 'c24:511745' }];
  check('🔴 O-5 이미 있는 행은 already 로 남는다 — 잔재 판정이 덮지 않는다',
    vmap(runO(day1, SEEN, had))['511745'] === 'already');
  const stamped = [{ ...had[0], source: 'c24-mirror:manual', status: 'cancelled' }];
  check('🔴 O-5 사람이 내린 행(도장)은 다시 만들지 않는다',
    runO([day1[0]], SEEN, stamped)[0].verdict !== 'ok');

  // ── O-6 안 켠 강사의 집계는 흐트러뜨리지 않되, 켜기 전에 볼 수 있게 한 줄 남긴다 ──
  const notOn = M.planMirror(day1, LINKS_O, STU_O, [], 'whitelist', new Set(['5']), new Set(), SEEN);
  const ghost = notOn.find(r => r.class_id === '511745');
  check('O-6 안 켠 강사는 판정이 not_whitelisted 그대로다', ghost.verdict === 'not_whitelisted');
  check('🔴 O-6 그래도 «잔재 의심» 을 detail 에 알려 준다 — 다음 강사를 켤 때 보라고',
    /잔재/.test(String(ghost.detail || '')), ghost.detail);

  // ── O-7 열쇠 모양 + 집계 칸 ──
  check('O-7 slotKey 는 (학생|강사|시각)', K('a', '1', '17:40') === 'a|1|17:40');
  check('O-7 강사번호가 없으면 빈 칸으로 센다', K('a', null, '17:40') === 'a||17:40');
  check('O-7 summarize 에 suspect_dup 칸이 있다', M.summarize([]).suspect_dup === 0);

  // ── O-8 🔴 «정본 함수를 진짜 SQLite 에 물려» 돌린다 ──────────────────────────
  /* ⚠️ 처음에는 SQL 을 손으로 «베껴» 돌렸는데, 그러면 정본을 한 번도 실행하지 않는다.
       trap-check 가 그 상태에서 정본만 망가뜨려 보고 잡았다 — slotKey 인자를 뒤바꿔도,
       COUNT(*) 를 1 로 바꿔도 하니스는 246/0 초록이었다. 두 변이 모두 실서비스에서는
       «모든 자리가 1건» 이 되어 하루 2건인 날의 수업을 무더기로 차단한다.
     ✅ 그래서 진짜 SQLite 를 D1 모양으로 감싸 정본 loadSlotHistory 를 그대로 부른다.
        (같은 저장소의 본보기: 위 N⑥·N⑦ 이 loadHiddenStudents 를 가짜 DB 로 실제로 돌린다) */
  {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL,
             user_id TEXT NOT NULL, joined_at INTEGER NOT NULL, teacher_uid TEXT)`);
    const ins = db.prepare(`INSERT INTO attendance (room_id, user_id, joined_at, teacher_uid) VALUES (?,?,?,?)`);
    ins.run('c24-512025', 'hya1897', KST('2026-09-01', '21:30'), '192');
    ins.run('c24-512028', 'hya1897', KST('2026-09-02', '21:30'), '192');
    ins.run('c24-511745', 'hya1897', KST('2026-09-01', '17:40'), '192');   // 유령 — 한 번뿐
    ins.run('c24-511746', 'hya1897', KST('2026-09-01', '17:00'), '35');    // 다른 강사
    ins.run('c24-999', 'other',   KST('2026-09-01', '21:30'), '192');      // 다른 학생 — 섞이면 안 된다
    ins.run('class-1-20260901', 'hya1897', KST('2026-09-01', '21:30'), '192'); // 망고아이 방 — 세면 안 된다

    // D1 모양 얇은 껍데기 (prepare → bind → all)
    const d1 = {
      prepare(sql) {
        const st = {
          _b: [],
          bind(...a) { st._b = a; return st; },
          async all() { return { results: db.prepare(sql).all(...st._b) }; },
          async first() { return db.prepare(sql).get(...st._b) ?? null; },
          async run() { return {}; },
        };
        return st;
      },
      exec: async () => {},
    };

    const seen = await M.loadSlotHistory({ DB: d1 }, ['hya1897', 'nobody']);
    const K2 = M.slotKey;
    check('🔴 O-8 정본이 되풀이되는 자리를 «제대로 센다»(2건)',
      seen.get(K2('hya1897', '192', '21:30')) === 2, JSON.stringify([...seen]));
    check('🔴 O-8 정본이 유령 자리를 «1건» 으로 센다',
      seen.get(K2('hya1897', '192', '17:40')) === 1, JSON.stringify([...seen]));
    check('🔴 O-8 학생·강사를 뒤바꾸지 않는다 (다른 강사는 다른 열쇠)',
      seen.get(K2('hya1897', '35', '17:00')) === 1
      && seen.get(K2('hya1897', '192', '17:00')) === undefined, JSON.stringify([...seen]));
    check('🔴 O-8 다른 학생은 안 섞인다', !seen.has(K2('other', '192', '21:30')));
    check('🔴 O-8 망고아이 방(class-*)은 안 센다 — 자기가 만든 행이 자기를 «진짜» 로 만든다',
      seen.get(K2('hya1897', '192', '21:30')) === 2);

    /* 그 Map 을 그대로 planMirror 에 물려 «끝에서 끝까지» 한 번 더 확인한다 */
    const e2e = runO([co('511745', '2026-09-01', '17:40', '192'),
                      co('512025', '2026-09-01', '21:30', '192')], seen);
    check('🔴 O-8 정본 이력으로 돌려도 유령만 막힌다(끝에서 끝까지)',
      vmap(e2e)['511745'] === 'suspect_dup' && vmap(e2e)['512025'] === 'ok', JSON.stringify(vmap(e2e)));
    db.close();
  }

  // ── O-8b 부분 실패는 «불완전한 Map» 이 아니라 «빈 Map» 이어야 한다 ──
  /* 🔴 청크 하나가 실패했는데 나머지를 이어 붙이면 size>0 게이트를 통과해 그 학생들의
       이력이 0으로 읽힌다 ⟹ 멀쩡한 수업이 차단된다(trap-check 지적). 던지지도 않아야 한다. */
  {
    /* ⚠️ 성공한 청크가 «빈 결과» 면 이 검사가 헛돈다 — 올바른 코드도 망가진 코드도 똑같이
         빈 Map 이 나오기 때문이다(실제로 처음에 그렇게 짜서 변이가 안 잡혔다).
         그래서 **첫 청크는 진짜 행을 돌려주고** 두 번째만 실패시킨다. */
    let n = 0;
    const flaky = {
      exec: async () => {},
      prepare() {
        const st = { bind: () => st, first: async () => null, run: async () => ({}),
          all: async () => {
            n++;
            if (n === 2) throw new Error('D1_ERROR');
            return { results: [{ user_id: 'u1', teacher_uid: '192', hm: '21:30', n: 7 }] };
          } };
        return st;
      },
    };
    const many = Array.from({ length: 200 }, (_, i) => 'u' + i);   // 90개씩 → 청크 3개
    let threw = false, got = null;
    try { got = await M.loadSlotHistory({ DB: flaky }, many); } catch { threw = true; }
    check('🔴 O-8b 한 청크가 실패해도 던지지 않는다', !threw);
    check('🔴 O-8b 그때는 «빈 Map»(판정 건너뜀) — 불완전한 Map 을 흘리지 않는다',
      !!got && got.size === 0, got && JSON.stringify([...got]));
    check('🔴 O-8b (헛돎 방지 짝 검사) 다 성공하면 그 행들이 실제로 담긴다',
      (await M.loadSlotHistory({ DB: {
        exec: async () => {},
        prepare() { const st = { bind: () => st, first: async () => null, run: async () => ({}),
          all: async () => ({ results: [{ user_id: 'u1', teacher_uid: '192', hm: '21:30', n: 7 }] }) };
          return st; },
      } }, ['u1'])).get(M.slotKey('u1', '192', '21:30')) === 7);
    const boom = { exec: async () => {}, prepare() { throw new Error('no such table: attendance'); } };
    let threw2 = false, got2 = null;
    try { got2 = await M.loadSlotHistory({ DB: boom }, ['a']); } catch { threw2 = true; }
    check('🔴 O-8b 표가 아예 없어도 던지지 않고 빈 Map', !threw2 && !!got2 && got2.size === 0);
  }

  // ── O-9 배선 — 두 호출부가 모두 이력을 넘긴다(한쪽만 넘기면 쓰기 경로가 그대로 뚫린다) ──
  /* ⚠️ «칸을 하나 늘리면 깨지는» 정규식으로 못 박지 않는다(CLAUDE.md 2장) — 뜻으로 검사한다. */
  const callsO = [...MIRROR_TS.matchAll(/planMirror\(classes, links, students, existing, mode, enabled([^)]*)\)/g)];
  check('🔴 O-9 planMirror 호출 두 곳이 모두 이력을 넘긴다',
    callsO.length === 2 && callsO.every(m => /\bslotSeen\b/.test(m[1])), callsO.map(m => m[0]));
  check('O-9 스위치가 꺼지면 빈 Map 을 넘긴다(판정 건너뜀)',
    /dupGuard \? await loadSlotHistory\([\s\S]{0,80}: new Map<string, number>\(\)/.test(MIRROR_TS));
  check('O-9 스위치 정본은 c24_mirror_config.dup_guard', /k='dup_guard'/.test(MIRROR_TS));
  check('O-9 스위치 기본값은 «켬»', /String\(r\?\.v \?\? 'on'\) !== 'off'/.test(MIRROR_TS));

  // ── O-10 화면이 이 줄을 말한다 (안 보이면 아무도 확인하지 않는다) ──
  const MIRROR_HTML = PUB('admin/c24-mirror.html');
  check('O-10 성적표에 «잔재 의심» 이름표가 있다', /suspect_dup:/.test(MIRROR_HTML));
  check('🔴 O-10 0건이어도 감추지 않는다', /VERDICT_LABEL\.suspect_dup, v:s\.suspect_dup\|\|0/.test(MIRROR_HTML));

  // ── O-11 카페24에 물어볼 근거 — 속성 이름을 성적표에 싣는다(판정에는 쓰지 않는다) ──
  check('O-11 :Class 속성 이름을 읽어 온다', /UNWIND keys\(c\) AS k/.test(MIRROR_TS));
  check('O-11 성적표가 그것을 내려준다', /prop_keys: await fetchC24ClassPropKeys\(/.test(MIRROR_TS));
  /* 🔴 «내려준다» 와 «사람이 본다» 는 다르다 — 주석이 「성적표에 싣는다」고 약속해 놓고
       화면이 안 그리던 것을 trap-check 가 잡았다. 그리는지까지 검사한다. */
  check('🔴 O-11 화면이 그 목록을 실제로 그린다', /r\.prop_keys/.test(MIRROR_HTML));
  check('🔴 O-11 스위치가 꺼져 있으면 화면이 그렇게 말한다', /r\.dup_guard === false/.test(MIRROR_HTML));
  /* ⛔ 부정 검사는 주석을 벗겨 낸 사본으로 — 위 주석들이 그 이름을 «설명» 하고 있다(CLAUDE.md 2장) */
  const bare = MIRROR_TS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('🔴 O-11 그 속성으로 «판정» 하지 않는다 — 뜻을 확인하기 전까지는 보여 주기만 한다',
    !/prop_keys[\s\S]{0,200}(verdict|push\()/.test(bare));
}


/* ═══════════════ P. «켜짐 / 꺼짐 / 막힘» 세 상태 (2026-09-02) ═══════════════
   발단 — 사장님이 CINDY 를 켠 직후 화면의 «끄기» 를 누르셨는데, 그 버튼이 `enabled = 0`
   을 보냈다. 그런데 이 저장소에서 `enabled = 0` 은 «아직 안 켬» 이 아니라 **«켜지 마라»**
   (퇴사 강사용)라, CINDY 가 퇴사자와 같은 «막힘» 칸으로 들어갔고 화면은 막힌 줄의 버튼을
   비활성으로 그리므로 **되돌릴 길이 화면에 없었다**(D1 을 직접 손대야 했다).
   ⚠️ 문자열 검사로는 못 잡힌다 — 함수도 값도 다 «있고» 틀린 것은 «무슨 뜻인가» 뿐이다.
   ✅ 그래서 진짜 SQLite 를 D1 모양으로 감싸 정본을 **실제로 돌려** 세 상태를 확인한다. */
{
  console.log('\nP. 켜짐/꺼짐/막힘 세 상태');

  const db = new DatabaseSync(':memory:');
  const d1 = {
    prepare(sql) {
      const st = {
        _b: [],
        bind(...a) { st._b = a; return st; },
        async all() { return { results: db.prepare(sql).all(...st._b) }; },
        async first() { return db.prepare(sql).get(...st._b) ?? null; },
        async run() { const r = db.prepare(sql).run(...st._b); return { meta: { changes: Number(r.changes || 0) } }; },
      };
      return st;
    },
    async exec(sql) { db.exec(sql); },
  };
  /* class_schedules 가 없으면 ensureMirrorTables 의 부분 유니크 인덱스가 던지는데,
     정본이 그것을 try 로 삼키므로 표만 있으면 된다 — 없어도 나머지는 그대로 돈다. */
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, notes TEXT, source TEXT)`);
  const env = { DB: d1 };

  await M.setMirrorTeacher(env, '5', true, 'harness');
  await M.setMirrorTeacher(env, '11', false, 'harness');       // 퇴사 = 막힘
  let on = await M.getMirrorTeachers(env), blocked = await M.getMirrorBlocked(env);
  check('P① 켜기는 «켜짐»', on.has('5') && !blocked.has('5'));
  check('P② setMirrorTeacher(false) 는 «막힘»(전환일에도 안 만듦)', blocked.has('11') && !on.has('11'));

  const removed = await M.clearMirrorTeacher(env, '5');
  on = await M.getMirrorTeachers(env); blocked = await M.getMirrorBlocked(env);
  check('P③ 🔴 끄기(clearMirrorTeacher)는 행을 «지운다»', removed === 1);
  check('P④ 🔴 그래서 «꺼짐» 이다 — 켜짐도 막힘도 아니다',
    !on.has('5') && !blocked.has('5'), JSON.stringify([[...on], [...blocked]]));
  await M.setMirrorTeacher(env, '5', true, 'harness');
  on = await M.getMirrorTeachers(env);
  check('P⑤ 🔴 끈 뒤에 다시 켤 수 있다 (되돌릴 길이 있다)', on.has('5'));
  /* 헛돎 방지 짝 검사 — «지운다» 만 보면 아무 id 나 지워도 통과한다 */
  check('P⑥ 남의 행을 지우지 않는다', (await M.clearMirrorTeacher(env, '9999')) === 0 && (await M.getMirrorBlocked(env)).has('11'));

  /* ── 라우트 계약 (accounting-reports.ts) ──
     ⛔ 검사 범위를 «길이» 로 자르지 않는다 — 처음에 {0,900} 으로 뒀는데 그 블록이 이미 837자라
        주석 두어 줄만 더해도 매치가 통째로 실패해 네 건이 한꺼번에 거짓 FAIL 났다(CLAUDE.md 2장).
        중괄호 짝으로 자른다. */
  const blockAt = (txt, anchor) => {
    const i = txt.indexOf(anchor); if (i < 0) return '';
    const j = txt.indexOf('{', i); if (j < 0) return '';
    let d = 0;
    for (let k = j; k < txt.length; k++) {
      if (txt[k] === '{') d++;
      else if (txt[k] === '}' && --d === 0) return txt.slice(i, k + 1);
    }
    return txt.slice(i);
  };
  const RT = blockAt(REPORTS, "if (p === 'c24-mirror/teacher')");
  check('P⑦-0 라우트 블록을 중괄호 짝으로 잘랐다 (길이로 자르지 않는다)', RT.length > 200 && RT.trim().endsWith('}'), RT.length);
  check('P⑦ 라우트가 action 으로 갈라 받는다', /body\?\.action/.test(RT) && /'block'/.test(RT), RT ? '' : 'block 못 찾음');
  check("P⑧ 🔴 action:'off' 는 clearMirrorTeacher 를 부른다", /act === 'off'[\s\S]{0,160}clearMirrorTeacher\(/.test(RT));
  /* ⚠️ 식을 통째로 못 박지 않는다 — 뜻이 같은 재작성(=== false → !== true)에 거짓 FAIL 난다.
       물어야 할 것은 «옛 불리언이 block 이 아니라 off 로 가는가» 다. */
  const oldContract = RT.match(/body\?\.enabled[^\n]*\?[^\n]*:[^\n]*/);
  check("P⑨ 🔴 옛 계약 { enabled:false } 는 «막힘» 이 아니라 «꺼짐» 으로 떨어진다",
    !!oldContract && /'off'/.test(oldContract[0]) && !/'block'/.test(oldContract[0]),
    oldContract ? oldContract[0] : '옛 계약 분기 없음');
  check("P⑩ setMirrorTeacher 로 켜고/막는 것은 'on'·'block' 일 때만",
    /setMirrorTeacher\(env as any, tid, act === 'on'/.test(RT));

  // ── 화면 (되돌릴 길이 화면에 있어야 한다) ──
  const H = PUB('admin/c24-mirror.html');
  check('P⑪ 🔴 «끄기» 는 action:off 를 보낸다', /action: enabled \? 'on' : 'off'/.test(H));
  check('P⑫ 🔴 막힌 줄에 «막힘 풀기» 버튼이 있다', /막힘 풀기/.test(H) && /unblockTeacher\(g\)/.test(H));
  /* ⛔ 부정 검사는 주석을 벗겨 낸 사본으로(위 주석들이 그 이름을 «설명» 한다) —
       그리고 «그 한 줄» 이 아니라 «어떤 형태로든 비활성으로 두는가» 를 본다. */
  const bareH = H.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  check('P⑬ 🔴 막힌 줄의 버튼을 비활성으로 두지 않는다 (그러면 화면에서 못 푼다)',
    !/toggleBtn\.disabled\s*=/.test(bareH));
  /* ⚠️ 길이로 자르면 창이 다음 함수(runApply)로 흘러든다 — 함수 블록만 중괄호 짝으로 자른다. */
  const UNB = blockAt(H, 'function unblockTeacher');
  check('P⑭ 막힘 풀기는 강사 이름을 그대로 입력받는다 (퇴사자 오해제 방지)',
    /typed\.trim\(\) !== nm/.test(UNB), UNB.length);
  check("P⑮ 🔴 풀어도 곧바로 켜지지 않는다 — 'off'(꺼짐)까지만",
    /action: 'off'/.test(UNB) && !/action: 'on'/.test(UNB));
  check('P⑯ «끄기» 안내가 «다시 켤 수 있다» 고 말한다', /다시 켤 수 있습니다/.test(H));
  /* 🔴 「풀어도 수업이 안 생긴다」는 mode='all' 에서 거짓이다(touch() 가 mode==='all' 이면 만든다).
       화면이 그 말을 하는지까지 본다 — trap-check 가 잡은 거짓 단정이다. */
  check("P⑰ 🔴 확인창이 «전환일(all)에는 꺼짐도 만들어진다» 를 말한다",
    /전환일/.test(UNB) && /all/.test(UNB));
  check('P⑱ 확인창이 «메모도 함께 지워진다» 를 말한다 (되돌릴 수 없다)',
    /메모도 함께 지워집니다/.test(UNB));
}

console.log(`\n${'─'.repeat(52)}`);
console.log(`  PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach(f => console.log('  · ' + f)); }
console.log(`${'─'.repeat(52)}\n`);
process.exit(FAIL ? 1 : 0);
