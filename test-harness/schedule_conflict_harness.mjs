// -*- coding: utf-8 -*-
// 🗓 수업 예약 «시간 겹침 / 강사 이중배정» 검사 하네스 (2026-08-04)
//   실행: node test-harness/schedule_conflict_harness.mjs
//
//   왜 있나 —
//     예약 등록(POST /api/admin/class-schedules)의 중복 검사가 오랫동안
//       ① `start_time = ?` 로 «시작 시각이 완전히 같은» 예약만 잡았고   → 09:00(50분) 옆에 09:30 을 넣으면 통과
//       ② user_id(학생) 기준만 봐서 «같은 강사·겹치는 시간» 을 아무도 막지 않았다 → 강사가 동시에 두 방
//     이 하네스는 그 두 가지가 되살아나지 못하게 막는다.
//
//   방식 — 규칙을 베껴 쓰지 않고 **실제 src 에서 판정 함수를 꺼내 실행**한다.
//          (베껴 쓰면 소스가 바뀌어도 테스트만 통과하는 가짜 초록불이 된다)
import { allSrc } from './_srcbundle.mjs';

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const src = allSrc();

// ── 소스에서 판정 함수 2개를 꺼낸다 ────────────────────────────────
function cut(re, what) {
  const m = re.exec(src);
  if (!m) { FAIL++; FAILS.push(`소스에서 ${what} 를 찾지 못함`); console.log(`  ❌ 소스에서 ${what} 를 찾지 못함`); return null; }
  return m[1].replace(/\s*:\s*any\b/g, '').replace(/\s*:\s*string\b/g, '');
}

// (2026-08-04) 판정이 src/schedule-conflict.ts 한 곳으로 모였다 — 거기서 꺼낸다.
const toMinBody   = cut(/export function toMinutes\(hhmm[^)]*\)[^{]*\{([\s\S]*?)\n\}/, 'toMinutes');
const overlapBody = cut(/export function rowOverlaps\([^)]*\)[^{]*\{([\s\S]*?)\n\}/, 'rowOverlaps');

let overlapsAt = null;
if (toMinBody && overlapBody) {
  try {
    // ⚠️ 꺼낸 본문의 마지막 줄이 «// 주석» 으로 끝날 수 있다.
    //    닫는 중괄호를 같은 줄에 붙이면 주석에 삼켜져 함수가 안 닫힌다 → 반드시 줄바꿈 먼저.
    const toMin = new Function('hhmm', toMinBody + '\n');
    const overlap = new Function('newStart', 'newEnd', 'rowStart', 'rowDur', 'fallbackDur', `
      const toMinutes = (hhmm) => {${toMinBody}
      };
      if (fallbackDur === undefined) fallbackDur = 30;
      ${overlapBody}
    `);
    overlapsAt = (start, dur) => {
      const s = toMin(start), e = s + dur;
      return (rowStart, rowDur) => overlap(s, e, rowStart, rowDur, undefined);
    };
  } catch (e) {
    FAIL++; FAILS.push('판정 함수 실행 준비 실패: ' + e.message);
    console.log('  ❌ 판정 함수 실행 준비 실패: ' + e.message);
  }
}

console.log('\n[ 구간 겹침 판정 — 실제 src 함수 실행 ]');
if (overlapsAt) {
  const at = (s, d) => overlapsAt(s, d);

  // 🔴 예전에 조용히 통과하던 진짜 사고 케이스
  check('09:30(30분) 등록 ← 09:00(50분) 기존과 겹침',            at('09:30', 30)('09:00', 50) === true);
  check('08:45(30분) 등록 ← 09:00(30분) 기존과 겹침(앞쪽 물림)',  at('08:45', 30)('09:00', 30) === true);
  check('09:00(50분) 등록 ← 09:30(30분) 기존과 겹침(뒤쪽 물림)',  at('09:00', 50)('09:30', 30) === true);

  // 경계 — 반개구간이라 «딱 붙는» 것은 겹침이 아니다
  check('09:50 등록 ← 09:00(50분) 은 딱 끝나 겹치지 않음',        at('09:50', 30)('09:00', 50) === false);
  check('08:30(30분) 등록 ← 09:00 은 딱 붙어 겹치지 않음',        at('08:30', 30)('09:00', 30) === false);

  // 완전히 떨어진 시간
  check('10:00 등록 ← 09:00(30분) 안 겹침',                      at('10:00', 30)('09:00', 30) === false);
  check('같은 시각은 당연히 겹침',                                at('09:00', 30)('09:00', 30) === true);

  // duration 이 비어 있는 과거 행 → 30분으로 간주해야 함
  check('기존 행 duration 없음 → 30분 취급(09:00 ← 09:20 겹침)',  at('09:20', 30)(  '09:00', null) === true);
  check('기존 행 duration 0   → 30분 취급(09:40 은 안 겹침)',     at('09:40', 30)(  '09:00', 0) === false);

  // 긴 수업
  check('120분 수업 안에 들어오는 예약은 겹침',                   at('10:00', 30)('09:00', 120) === true);
}

// ── 되살아나면 안 되는 것들 (소스 게이트) ──────────────────────────
console.log('\n[ 회귀 가드 — 소스에 반드시 남아 있어야 하는 것 ]');
check('판정이 한 곳(schedule-conflict.ts)에 모여 있다',
  /export async function findScheduleConflicts/.test(src));
check('강사 기준으로도 기존 수업을 조회한다',
  /activeRowsBy\(env,\s*['"]teacher_id['"]/.test(src));
check('학생 기준 조회도 그대로 있다',
  /activeRowsBy\(env,\s*['"]user_id['"]/.test(src));
check('«옮길 때» 자기 자신을 겹침에서 뺄 수 있다 (excludeId)',
  /excludeId/.test(src) && /String\(row\.id\) !== exclude/.test(src));
check('수업 이동(연기·변경 승인)에서도 겹침을 본다',
  /findScheduleConflicts\(env, \{[\s\S]{0,300}?excludeId: row\.schedule_id/.test(src));
check('겹치면 옮기지 않고 conflict 로 남긴다 (조용히 겹치게 두지 않음)',
  /applied = 'conflict'/.test(src));
check('합반(같은 시각·같은 길이)은 강사 겹침에서 제외한다',
  /sameSlot/.test(src) && /if \(sameSlot\) continue;/.test(src));
check('같은 학생 행은 강사 겹침에서 중복으로 세지 않는다',
  /row\.user_id[\s\S]{0,80}continue;/.test(src));
check('응답 코드는 프론트 호환을 위해 conflict 를 유지한다',
  /bad\(\s*['"]conflict['"]/.test(src));
check('teacher_conflicts 를 응답에 실어 화면이 이유를 보여줄 수 있다',
  /teacher_conflicts/.test(src));
check('시작시각 완전일치 방식(start_time = ?)으로 되돌아가지 않았다',
  !/class_schedules\s+WHERE user_id = \? AND status = 'active' AND schedule_kind = 'recurring' AND start_time = \?/.test(src));
check('강사 근무불가(휴가·휴식) 검사는 그대로 살아 있다',
  /teacher_unavailable/.test(src) && /teacherBlocks/.test(src));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
