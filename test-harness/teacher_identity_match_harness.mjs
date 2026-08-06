#!/usr/bin/env node
/**
 * 🔗 강사 계정 → 강사원부 확정 규칙 (2026-08-06)
 *
 * 사고 내용
 *   필리핀 강사 교육 중 "수업 입장 버튼이 없다" 는 제보를 파다가 **반대쪽 사고**를 찾았다.
 *
 *   계정 `hq_t_anna` 의 표시이름은 'Anna' 다. 강사원부(teachers)에 'Anna' 는 없다.
 *   그런데 이름 대조가 «양방향 부분일치» 라서
 *
 *        'HANNAH' LIKE '%Anna%'      →  H-ANNA-H  ✔ 걸린다
 *
 *   'HANNAH'(id 24) 에 붙어 버렸다. Anna 로 로그인하면 HANNAH 의 오늘 수업 5건과
 *   **학생 이름**이 보이고, [수업 입장] 으로 **남의 방에 들어갈 수 있었다.**
 *
 *   뿌리는 두 파일의 규칙이 서로 달랐던 것이다.
 *     · api-mango.ts  (화상수업 입장)   — «완전일치가 있으면 그쪽만» 규칙이 **있었다**
 *     · api-teacher.ts(강사 마이페이지) — 그 규칙이 **없어서** 걸린 사람을 전부 담당으로 붙였다
 *
 * 이 하니스가 지키는 것
 *   ① 두 파일 모두 '완전일치 우선' 을 갖고 있을 것 (한쪽만 고치면 또 어긋난다)
 *   ② 부분일치가 2명 이상이면 **아무도 붙이지 않을 것** — 이게 이 수정의 핵심이다.
 *      «모르면 안 보여준다» 가 «아무나 보여준다» 보다 낫다. 못 보는 건 문의하면 끝이지만
 *      남의 학생 이름과 방은 되돌릴 수 없다.
 *   ③ 확정 실패를 «수업 없음» 이 아니라 별도 상태로 응답에 실을 것
 *   ④ 화면이 그 상태를 «연결 안 됨» 과도 다른 문구로 말할 것 (본사가 할 일이 다르다)
 *   ⑤ 실제 운영 원부 이름으로 Anna→HANNAH 가 재현되고, 새 규칙이 그걸 막을 것
 *
 * ⚠️ 규칙을 베껴 쓰지 않는다. api-teacher.ts 의 확정 코드를 **소스에서 그대로 떼어** 돌린다.
 *    베껴 쓰면 베낀 쪽만 통과하는 가짜 검사가 된다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEACHER_TS = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-teacher.ts'), 'utf8');
const MANGO_TS = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-mango.ts'), 'utf8');
const HTML = readFileSync(join(ROOT, 'cloudflare-deploy/public/teacher.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); }
};

console.log('\n════════ 강사 계정 ↔ 강사원부 확정 규칙 ════════\n');

/* ── 실제 운영 원부(2026-08-06 D1 실측 29명) ──────────────────────────────
   Anna·FAR 같은 «남의 이름에 통째로 들어가는» 짧은 이름이 실제로 있다.
   이 목록을 줄이지 말 것 — 사고는 이 조합에서만 재현된다. */
const ROSTER = [
  [1,'KES'],[2,'BELLE'],[3,'HT FARRAH'],[4,'RICA'],[5,'CINDY'],[6,'JANE'],[7,'ANA'],
  [8,'KAYE'],[9,'ZEE'],[10,'HT NESS'],[11,'MARIANE'],[12,'JINETTE'],[13,'JENNY'],
  [14,'SID'],[15,'CHAINE'],[16,'KRYSTEL'],[17,'SHAS'],[18,'LEN'],[19,'WIN'],[20,'JED'],
  [21,'FAYE'],[22,'FAR'],[23,'JP'],[24,'HANNAH'],[25,'KARL'],[26,'MELCA'],[27,'MAIMAI'],
  [28,'JANICE'],[29,'중국어 강선생님'],
];

// SQL 의 WHERE 절을 그대로 옮긴 «후보 뽑기». 확정 규칙이 아니라 입력을 만드는 부분이다.
//   name = ?  OR  name LIKE '%tname%'  OR  tname LIKE '%name%'
const like = (hay, needle) => hay.toUpperCase().includes(needle.toUpperCase());
function candidates(tname) {
  return ROSTER
    .filter(([, n]) => n === tname || like(n, tname) || (n.length > 0 && like(tname, n)))
    .map(([id, name]) => ({ tid: String(id), name, exact: n_eq(name, tname) ? 1 : 0 }));
}
const n_eq = (a, b) => a.toUpperCase() === b.toUpperCase();   // SQL 의 `= ? COLLATE NOCASE`

// ── ⓪ 배포되는 확정 코드를 소스에서 떼어 온다 ──────────────────────────────
//   `const tidRows = …` 부터 `ambiguousNames` 선언이 끝나는 곳까지.
const block = (() => {
  const s = TEACHER_TS.indexOf('const tidRows =');
  if (s < 0) return null;
  const e = TEACHER_TS.indexOf('for (const x of resolvedRows)', s);
  return e < 0 ? null : TEACHER_TS.slice(s, e);
})();
check('⓪ api-teacher.ts 에서 확정 코드를 떼어낼 수 있다', !!block);
if (!block) { console.log('\n  소스 구조가 바뀌었다. 하니스를 먼저 맞출 것.\n'); process.exit(1); }

// 떼어낸 TS 를 그대로 실행 가능한 JS 로 (타입 표기만 제거 — 로직은 손대지 않는다)
const runnable = block
  .replace(/\(tidRs\.results \|\| \[\]\)/, 'INPUT')
  .replace(/:\s*any/g, '')
  .replace(/\bconst\b/g, 'var');
const resolve = new Function('INPUT', runnable + '\n return { resolvedRows, ambiguousNames };');

// ── ① 두 파일이 같은 규칙을 갖고 있을 것 ────────────────────────────────
check('① api-teacher.ts 가 완전일치 우선을 갖는다',
  /exactRows\.length\s*\?\s*exactRows/.test(TEACHER_TS));
check('① api-mango.ts 도 완전일치 우선을 갖는다 (한쪽만 고치면 또 어긋난다)',
  /exact\.length\s*\?\s*exact\s*:\s*all/.test(MANGO_TS));
check('① 대소문자 차이로 완전일치를 놓치지 않는다 (COLLATE NOCASE)',
  /name\s*=\s*\?\s*COLLATE NOCASE/.test(TEACHER_TS));

// ── ② 핵심: 다중 부분일치는 아무도 붙이지 않는다 ────────────────────────
{
  const c = candidates('Anna');
  check('② 재현: 이름 Anna 가 원부의 HANNAH 에 걸린다 (사고 원인)',
    c.some((x) => x.name === 'HANNAH'));
  check('② 재현: Anna 는 완전일치가 없다 (그래서 부분일치로 떨어졌다)',
    c.every((x) => x.exact === 0));
  const r = resolve(c);
  check('② 🔴 Anna 에게 HANNAH 의 수업이 붙지 않는다',
    !r.resolvedRows.some((x) => x.name === 'HANNAH'));
}
{
  // 부분일치가 여럿일 때 «하나를 골라 주는» 것도 금지 — 고르면 절반은 남의 수업이다.
  const many = [
    { tid: '24', name: 'HANNAH', exact: 0 },
    { tid: '7', name: 'ANA', exact: 0 },
  ];
  const r = resolve(many);
  check('② 부분일치 2명 → 아무도 담당으로 붙지 않는다', r.resolvedRows.length === 0);
  check('② 그 대신 후보 2명을 그대로 알려 준다', r.ambiguousNames.length === 2);
}

// ── ③ 정상 경로가 좁아지지 않았을 것 (매칭은 «좁히기만» 한다) ────────────
{
  const r = resolve(candidates('MAIMAI'));
  check('③ 정확히 연결된 계정(MAIMAI)은 그대로 1명으로 확정된다',
    r.resolvedRows.length === 1 && r.resolvedRows[0].tid === '27');
}
{
  // 2026-07-24 에 부분일치를 도입한 이유 그 자체 — 이 구제는 살아 있어야 한다.
  const r = resolve(candidates('강선생님'));
  check('③ 표기가 다른 계정(강선생님 → 중국어 강선생님)은 예전처럼 구제된다',
    r.resolvedRows.length === 1 && r.resolvedRows[0].tid === '29');
}
{
  // FAR ⊂ HT FARRAH. 완전일치가 있으니 부분일치분은 버려야 한다.
  const c = candidates('FAR');
  const r = resolve(c);
  check('③ 완전일치가 있으면 부분일치분(HT FARRAH)은 버린다',
    c.length > 1 && r.resolvedRows.length === 1 && r.resolvedRows[0].tid === '22');
}
{
  const r = resolve(candidates('mangoi_006'));
  check('③ 원부에 없는 계정은 여전히 0명 = «연결 안 됨»', r.resolvedRows.length === 0);
  check('③ 연결 안 됨은 «헷갈림» 이 아니다 (후보 0명)', r.ambiguousNames.length === 0);
}

// ── ④ 응답이 두 상태를 구분해서 싣는다 ──────────────────────────────────
check('④ 응답에 identity_unlinked 가 실린다', /identity_unlinked:/.test(TEACHER_TS));
check('④ 응답에 identity_ambiguous 가 실린다', /identity_ambiguous:/.test(TEACHER_TS));
check('④ 응답에 후보 이름(identity_candidates)이 실린다',
  /identity_candidates:/.test(TEACHER_TS));
check('④ linked_teacher_ids 는 «확정된» 사람만 담는다 (후보 전부가 아님)',
  /linkedTeacherIds\s*=\s*resolvedRows\.map/.test(TEACHER_TS));

// ── ⑤ 화면이 세 상태를 다르게 말한다 ────────────────────────────────────
check('⑤ 화면이 identity_ambiguous 를 읽는다', /identity_ambiguous/.test(HTML));
check('⑤ 헷갈림 문구가 연결안됨 문구와 다르다',
  /여러 명과 겹쳐/.test(HTML) && /강사 명부와 연결돼 있지 않아/.test(HTML));
check('⑤ 헷갈림도 한/영 두 벌이다 (강사 다수가 필리핀)',
  /matches more than one teacher record/.test(HTML));
check('⑤ 후보 이름을 화면에 보여 준다 (본사가 누구인지 고를 수 있어야 한다)',
  /identity_candidates/.test(HTML));
check('⑤ 헷갈림을 «연결 안 됨» 보다 먼저 판정한다 (둘 다 참이라 순서가 곧 문구다)',
  HTML.indexOf('identity_ambiguous') < HTML.indexOf('DATA.me.identity_unlinked'));
check('⑤ 다시 그리기 지문에 신원 상태가 들어 있다 (본사가 고쳐도 옛 경고가 남지 않게)',
  /idState/.test(HTML));

console.log('\n─────────────────────────────────────────────');
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}    ${FAIL ? '❌' : '⚠'} FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach((f) => console.log('    - ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
