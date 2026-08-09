// -*- coding: utf-8 -*-
// 🧪 수업 일지 Phase 0 회귀 하니스 (2026-08-09)
//   실행: node test-harness/lesson_log_phase0_harness.mjs
//
//   무엇을 지키는가 — 실측으로 확인된 두 가지 사고를 되돌아가지 못하게 못 박는다.
//
//   ① 급여 공제 판정이 「1분 평가」를 못 본 문제
//      강사가 /teacher 에서 쓴 평가는 student_evaluations 에 들어가는데,
//      공제 판정(fbOk)은 teacher_class_feedback / 승인된 feedback_drafts 두 곳만 봤다
//      → 성실하게 쓴 강사도 «미작성» 으로 잡혀 수업 1건당 ₱25 씩 깎였다.
//
//   ② 강사가 쓴 평가가 학부모에게 한 번도 안 간 문제
//      서버는 body 에 전화번호가 실려 올 때만 보내는데 강사 화면은 그 값을 보내지 않았다
//      (번호는 화면이 다룰 값이 아니다) → 운영 104건 중 학부모 열람 0건.
//      이제 `notify_parent: true` 면 **서버가** students_erp 에서 번호를 찾는다.
//      ⚠️ 관리자 화면(adm-q1/adm-r6)은 이 플래그를 보내면 안 된다 —
//         보내는 순간 관리자가 평가를 저장할 때마다 학부모에게 문자가 나간다.
//
//   ③ 야간 발송 금지 (22:00~07:59 KST)
//      운영 시간표에 21:30 이후 시작 수업이 65건 있다. 그대로 두면 자정 넘어 문자가 간다.

import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSrc } from './_srcbundle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const SRC = allSrc();
const TEACHER = read(join(PUB, 'teacher.html'));
const ADM_Q1 = read(join(PUB, 'js', 'adm-q1.js'));
const ADM_R6 = read(join(PUB, 'js', 'adm-r6.js'));

console.log('\n════════ 수업 일지 Phase 0 ════════');

// ── ① 공제 판정이 평가서를 본다 ────────────────────────────────────────
console.log('\n[1] 급여 공제 — 「1분 평가」도 당일 피드백으로 인정');

// 판정 소스를 채우는 구간만 잘라서 본다(파일 전체에서 단어만 찾으면 엉뚱한 곳에 걸린다).
const fbBlock = (() => {
  const i = SRC.indexOf('const fbs: any = await env.DB.prepare(`SELECT room_id, teacher_name, created_at FROM teacher_class_feedback');
  const j = SRC.indexOf('let fbOk: boolean | null = null;');
  return (i >= 0 && j > i) ? SRC.slice(i, j) : '';
})();

check('판정 소스 구간을 찾았다', fbBlock.length > 0);
check('teacher_class_feedback 를 본다 (기존)', /FROM teacher_class_feedback/.test(fbBlock));
check('승인된 feedback_drafts 를 본다 (기존)', /FROM feedback_drafts WHERE status = 'approved'/.test(fbBlock));
check('🔑 student_evaluations 도 본다 (이번 수정)', /FROM student_evaluations/.test(fbBlock));
check('평가서는 room_id 가 있는 행만 인정', /room_id IS NOT NULL/.test(fbBlock));
check('평가서로 fbByRoom 을 채운다', /fbByRoom\[e\.room_id\]\s*=\s*kstDay\(e\.created_at\)/.test(fbBlock));
check('⚠ 평가서에는 «강사명+같은 날» 폴백을 주지 않는다 (1건으로 하루 전체가 면제되면 안 됨)',
  !/fbByTeacherDay\[[^\]]*e\./.test(fbBlock));

// 공제 계산 미러 — fbOk 가 true 면 no_feedback_day 가 붙지 않아야 한다
function deductions({ status, fbOk, feeNoFb = 25 }) {
  const d = [];
  if (status === 'finish' && fbOk === false && feeNoFb > 0) d.push('no_feedback_day');
  return d;
}
check('평가를 쓴 수업은 공제 없음', deductions({ status: 'finish', fbOk: true }).length === 0);
check('아무것도 안 쓴 수업은 공제 있음', deductions({ status: 'finish', fbOk: false })[0] === 'no_feedback_day');
check('완료 아닌 수업은 공제 없음', deductions({ status: 'postponed', fbOk: null }).length === 0);

// ── ② 학부모 발송 배선 ─────────────────────────────────────────────────
console.log('\n[2] 학부모 발송 — 번호는 서버가 찾는다');

check('서버에 번호 조회 함수가 있다', /const lookupParentPhone\s*=/.test(SRC));
check('students_erp 에서 학부모/학생 번호를 찾는다',
  /FROM students_erp WHERE user_id = \? OR login_id = \?[\s\S]{0,400}parent_phone \|\| stu\.student_phone/.test(SRC));
check('🔑 notify_parent === true 일 때만 서버가 번호를 찾는다 (관리자 저장이 문자로 새지 않게)',
  /body\.notify_parent === true/.test(SRC));
check('강사 화면이 notify_parent 를 보낸다', /notify_parent:\s*true/.test(TEACHER));
check('강사 화면은 전화번호를 보내지 않는다 (PII 는 화면이 다루지 않는다)',
  !/parent_phone/.test(TEACHER) && !/student_phone/.test(TEACHER));
check('⚠ 관리자 화면(adm-q1)은 notify_parent 를 보내지 않는다', ADM_Q1.length > 0 && !/notify_parent/.test(ADM_Q1));
check('⚠ 관리자 화면(adm-r6)은 notify_parent 를 보내지 않는다', ADM_R6.length > 0 && !/notify_parent/.test(ADM_R6));
check('문자 본문은 한국어 고정 템플릿 + 링크 (강사가 쓴 영어를 그대로 보내지 않는다)',
  /fallbackSmsText: `\[망고아이\]/.test(SRC) && /평가서가 도착했어요/.test(SRC));
check('발송에 성공해야 parent_notified 를 세운다',
  /notifyResult\.sent\.length > 0[\s\S]{0,200}SET parent_notified=1/.test(SRC));

// ── ③ 야간 발송 금지 ───────────────────────────────────────────────────
console.log('\n[3] 야간(22:00~07:59 KST)에는 보내지 않고 미룬다');

check('야간 판정 함수가 있다', /const isQuietHour\s*=/.test(SRC));
check('KST 로 시각을 잰다 (UTC+9)', /Date\.now\(\) \+ 9 \* 3600 \* 1000\)\.getUTCHours\(\)/.test(SRC));
check('야간이면 보내지 않고 notify_pending 으로 미룬다',
  /if \(isQuietHour\(\)\)[\s\S]{0,300}SET notify_pending = 1/.test(SRC));
check('미뤄 둔 발송을 내보내는 경로가 있다', /const flushPendingEvalNotifies\s*=/.test(SRC));
check('flush 는 조용한 시간엔 아무것도 하지 않는다',
  /flushPendingEvalNotifies = async \(\) => \{\s*\n?\s*if \(isQuietHour\(\)\) return;/.test(SRC));
check('flush 는 한 번에 20건까지만 (곁다리 경로가 길어지면 안 된다)',
  /notify_pending = 1[\s\S]{0,300}LIMIT 20/.test(SRC));
check('평가 작성 때 flush 를 함께 돈다', /await flushPendingEvalNotifies\(\);/.test(SRC));
check('보류 컬럼이 마이그레이션 목록에 있다',
  /\['notify_pending','INTEGER'\],\['notify_phone','TEXT'\]/.test(SRC));

/* 시간 경계 — ⚠️ 미러 함수만 두면 소스를 지워도 하니스가 통과한다(실제로 겪음).
   그래서 «소스에 그 경계식이 실제로 있는지» 를 먼저 못 박고, 그 다음에 경계를 계산한다. */
check('🔑 소스에 22시~08시 경계식이 그대로 있다', /h >= 22 \|\| h < 8/.test(SRC));
const quietAt = (kstHour) => kstHour >= 22 || kstHour < 8;
check('21시는 발송 시간', quietAt(21) === false);
check('22시는 야간(보류)', quietAt(22) === true);
check('자정은 야간(보류)', quietAt(0) === true);
check('07시는 야간(보류)', quietAt(7) === true);
check('08시는 발송 시간', quietAt(8) === false);
check('15시(수업 한창)는 발송 시간', quietAt(15) === false);

// ── 결과 ───────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────');
console.log(`  총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n  실패 항목:'); FAILS.forEach(f => console.log('   - ' + f)); }
process.exit(FAIL ? 1 : 0);
