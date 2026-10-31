/* ═══════════════════════════════════════════════════════════════════════════
   🗓 수업 일지의 «수업 출결» · «학생 레벨» 칸 (2026-10-27 사장님 요청 4번)
      «강사 화면 일지에 학생 레벨과 출석·지각·결석을 넣어 달라»

   [출결] 강사가 일지 창(teacher.html openEval)에서 확인·고른 값이다.
     화면은 입장 기록 판정(class-today-extras.ts judgeStudentAttendance 의 attended/late/absent)으로
     미리 골라 두고, 강사가 바꿀 수 있다. 그래서 여기 값은 «기계 판정» 이 아니라 «강사가 확인한 값» 이다.
     ⛔ 목록 밖 값은 버린다(null = 고르지 않음). «모름» 을 «출석» 으로 채우지 않는다.
     ⚠️ 이 값은 급여·노쇼 판정에 쓰지 않는다 — 그 정본은 class_no_show + no-show-truth.ts 다.

   [레벨] 저장하는 순간의 students_erp.level 을 그대로 «사진» 으로 남긴다(레벨은 나중에 바뀐다).
     본문 값은 받지 않는다 — 서버가 학생 원부에서 직접 읽는다. 못 읽으면 null.
   ═══════════════════════════════════════════════════════════════════════════ */

export const EVAL_ATTENDANCE_STATES = ['attended', 'late', 'absent'] as const;
export type EvalAttendance = typeof EVAL_ATTENDANCE_STATES[number];

/** 강사가 고른 출결 — 목록 안의 값만, 아니면 null. */
export function normalizeEvalAttendance(raw: unknown): EvalAttendance | null {
  const v = String(raw == null ? '' : raw).trim().toLowerCase();
  return (EVAL_ATTENDANCE_STATES as readonly string[]).includes(v) ? (v as EvalAttendance) : null;
}

/** 학생 원부의 레벨 칸 — 빈 값·공백은 null, 너무 긴 값은 자른다. */
export function normalizeStudentLevel(raw: unknown): string | null {
  const v = String(raw == null ? '' : raw).trim();
  return v ? v.slice(0, 40) : null;
}
