#!/usr/bin/env node
/**
 * feedback_reminder_c24_harness.mjs — 「수업일지 미작성 강사 리마인더」 안전장치 회귀 감시
 *   (2026-08-19 신설)
 *
 * [왜 이 감시가 필요한가]
 *   이 기능은 **실제 강사에게 문자를 보낸다**(SOLAPI, 한국 010·필리핀 09 해외문자).
 *   되돌릴 수 없는 바깥 행동이라, 코드가 조용히 바뀌면 그날 저녁 25명에게 잘못 나간다.
 *   그래서 «동작» 이 아니라 **«안전장치가 살아 있는가»** 를 못 박는다.
 *
 * [이 기능의 배경 — 왜 한 번도 안 보냈나]
 *   runFeedbackReminderSweep 은 매일 19:00 KST cron 으로 돌고 **기본 ON** 이다
 *   ('off' 일 때만 멈춘다). 그런데 대상 수업을 class_schedules 에서만 찾았고
 *   거기엔 정규 수업이 0건이라 늘 즉시 return 했다.
 *   증거: feedback_reminder_log 테이블이 아예 존재하지 않았다
 *   (그 표는 ended 가 있어야 만들어지는 자리에 있다).
 *
 * ⚠️ 파일을 읽어 규칙이 살아 있는지만 본다(소스 드리프트 가드). D1 에 붙지 않는다.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CD = resolve(ROOT, 'cloudflare-deploy');
const src = readFileSync(resolve(CD, 'src/lesson-reminder.ts'), 'utf8');

/* 부정 검사(«이 단어가 없어야 한다»)는 주석을 벗겨 낸 사본으로 판정한다 —
   「왜 그렇게 하면 안 되는지」 적은 설명 주석이 자기 검사에 걸리기 때문이다
   (CLAUDE.md 2장 «하니스에 부정 검사를 넣었는데 내 주석 때문에 FAIL» 항목). */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond, detail = '') => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};

console.log('\n① 발송 안전장치 — 새 대상은 «켜야» 동작한다');
{
  /* 스윕 자체는 기본 ON 이므로, 대상을 넓히는 이 경로만 반대 규칙(기본 OFF)이어야 한다.
     이게 뒤집히면 «사람이 dry 결과를 보기도 전에» 그날 저녁 문자가 나간다. */
  check('c24 경로는 명시적 opt-in (기본 꺼짐)',
    code.includes("'feedback_reminder_c24'") && code.includes("=== 'on'"),
    'KV 플래그가 on 일 때만 켜져야 한다');
  check('플래그가 꺼져 있으면 c24 수업을 대상에 넣지 않는다',
    /if\s*\(\s*c24On\s*\|\|\s*dry\s*\)/.test(code),
    'dry(미리보기)만 예외 — 확인이 목적이라 발송이 없다');
  check('킬스위치는 그대로 (기본 ON 인 전체 중단 플래그)',
    code.includes("'feedback_reminder_send'"));
  check('하루 1회 중복발송 방지 유지', code.includes('feedback_reminder_log'));
  check('발송 상한 유지', /budget\s*=\s*\d+/.test(code));
  check('dry 면 실제로 보내지 않는다', /if\s*\(\s*phone\s*&&\s*!dry\s*\)/.test(code));
}

console.log('\n② 「일지는 썼는데 안 썼다고 문자가 가는」 사고 방지');
{
  /* 강사가 [일지 쓰기] 로 남기는 곳은 student_evaluations 다(POST /api/eval/create).
     teacher_class_feedback·feedback_drafts 와는 **다른 표**라, 셋 다 봐야 한다. */
  check('피드백 판정에 teacher_class_feedback 포함', code.includes('teacher_class_feedback'));
  check('피드백 판정에 feedback_drafts 포함', code.includes('feedback_drafts'));
  check('피드백 판정에 student_evaluations(수업일지) 포함 🔴',
    code.includes('student_evaluations'),
    '빠지면 일지를 쓴 강사에게도 «안 썼다» 문자가 간다');
}

console.log('\n③ 강사 번호 두 갈래 — 남의 것에 붙지 않는다');
{
  /* attendance.teacher_uid = 카페24 강사번호(9~196) / teachers.id = 지역 일련번호(1~29).
     겹치는 자리에서 조용히 다른 사람이 걸린다(실측: 카페24 24=Mariane, teachers 24=HANNAH). */
  check('c24 수업을 teacher_uid 로 찾는다', code.includes('a.teacher_uid'));
  check('번호 → 이름은 teacher_payroll_auto 로만 해석',
    code.includes('teacher_payroll_auto'),
    '카페24가 번호와 이름을 함께 넣은 유일한 표');
  check('⛔ teachers.id 로 카페24 번호를 조회하지 않는다',
    !/FROM\s+teachers\s+WHERE\s+CAST\(id AS TEXT\)/.test(code),
    'teachers 원부로 카페24 번호를 풀면 남의 이름·수업이 붙는다');
  check('이름을 해석 못 하면 그 강사는 건너뛴다',
    code.includes('if (!r.teacher_name) continue;'),
    '모르는 것보다 틀린 게 나쁘다 — 추측해서 보내면 남에게 간다');
}

console.log('\n④ 시차 — LMS 수업은 하루 늦게 들어온다');
{
  /* 카페24 동기화는 03:00 KST 에 «전날치까지» 가져온다. 그래서 19:00 KST 에 도는 이 스윕이
     «오늘» 을 보면 영원히 0건이다(2026-08-19 실측: 오늘 0건 / 어제 103건).
     조용히 아무 일도 안 하는 상태로 되돌아가는 것을 막는다. */
  check('c24 조회 창은 «어제» 다 (오늘이 아니다) 🔴',
    /now \+ KST - 86400000/.test(code),
    'todayStr 로 되돌리면 이 경로는 영원히 0건이 된다');
  check('LMS 문구는 «어제 수업» 으로 말한다',
    code.includes('from yesterday have no class log yet'));
  check('LMS 문구에 «자정 전 공제» 를 쓰지 않는다',
    !/yesterday[\s\S]{0,200}before midnight/.test(code),
    '어제 수업엔 이미 자정이 지났다 — 그대로 쓰면 거짓말이 된다');
}

console.log('\n⑤ 배선 — cron 에 걸려 있는가');
{
  const idx = readFileSync(resolve(CD, 'src/index.ts'), 'utf8');
  check('index: 스윕이 cron 에 연결', idx.includes('runFeedbackReminderSweep'));
  check('sweep: export 유지', src.includes('export async function runFeedbackReminderSweep'));
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  결과: ✅ ${PASS} PASS   ❌ ${FAIL} FAIL`);
if (FAIL) { console.log('  실패: ' + FAILS.join(', ')); process.exit(1); }
console.log('  🎉 리마인더 안전장치 정상 — 확인 없이 문자가 나가지 않는다');
