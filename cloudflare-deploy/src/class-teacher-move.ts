/* ═══════════════════════════════════════════════════════════════════════════
   🧑‍🏫 class-teacher-move.ts — 수업 «담당 강사 변경» 게이트의 정본 (2026-09-11)

   [왜 파일을 따로 뺐나] 판정을 라우트 «안» 에만 두면 하니스가 «그 글자가 있는가» 로만
   검사하게 되고, 조건을 `!==` → `===` 로 뒤집거나 `if (false && …)` 로 죽여도 그 글자가
   그대로 남아 **통과합니다.** 2026-09-11 함정 대조가 실제로 그 변이 두 개를 통과시켰고,
   하필 그 자리가 **강사 급여** 를 지키는 자리입니다.
   (CLAUDE.md 2장 「비용이 나가는 API … 판정을 순수 함수로 빼서 하니스가 실제로 돌리게」)

   [무엇을 지키나]
     · 수업이 곧 급여다(no-show-truth.ts·payroll). 강사가 남의 수업을 자기에게 가져오거나
       남에게 떠넘길 수 있으면 안 된다.
     · 이 PATCH 는 TEACHER_BLOCKED_PREFIXES 에 없어서 **강사도 부를 수 있다.**
     · «모른다» 를 «본사» 로 읽지 않는다 — getAdminActor 는 스코프를 못 구해도
       scopeType='none' → resolveRole 이 'staff'(본사 동급)로 떨어뜨린다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { isOrgScopedRole } from './auth-admin';

export type MoveDeny = { error: string; message: string; status: number } | null;

/** 담당 강사를 바꿀 수 있는 사람인가. 막을 이유가 있으면 그 사유를, 없으면 null.
 *
 *  ⛔ canEditOrg() 로 대신하지 말 것 — 그 함수는 scope 'none'(내부직원·**교사**)에도
 *     true 라 강사를 못 막는다(CLAUDE.md 2장 「본사 전용으로 막았는데 강사가 그대로 실행됨」).
 *  🔴 scopeType 이 null(«모름») 이면 **막는다.** 되돌릴 수 없는 조작이라 그 방향이 맞다. */
export function teacherMoveDenyReason(a: { ok: boolean; isTeacher: boolean; scopeType: string | null }): MoveDeny {
  if (!a.ok) return { error: 'auth_required', message: '로그인이 필요합니다.', status: 401 };
  const denyTeacher = { error: 'forbidden_teacher', message: '담당 강사 변경은 강사 권한으로 할 수 없습니다.', status: 403 };
  if (a.isTeacher) return denyTeacher;
  if (a.scopeType == null || String(a.scopeType).trim() === '') {
    return { error: 'scope_unknown', message: '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', status: 403 };
  }
  const st = String(a.scopeType).trim();
  /* 이름 기반 강사 판정을 못 탄 계정까지 여기서 한 번 더 막는다. */
  if (st === 'teacher') return denyTeacher;
  if (isOrgScopedRole(st)) {
    return { error: 'forbidden_scope', message: '담당 강사 변경은 본사만 할 수 있습니다.', status: 403 };
  }
  return null;
}

/** 이 행에 «그 칸» 을 써도 되는가 — 반복 수업에 날짜를 박으면 «매주» 가 죽는다.
 *
 *  🔴 sessions/today 는 `if (s.scheduled_date) … else if (day_of_week) …` 라 **날짜가 이긴다.**
 *     그래서 schedule_kind='recurring' 행에 scheduled_date 를 넣으면 그 하루만 열리고
 *     나머지 주는 「오늘 예약된 수업이 없어요」 → 공용방 폴백이 된다. PATCH 에는 그 칸을
 *     **비우는 길이 없어** 화면으로 되돌릴 수도 없다.
 *  ⚠️ 반대 방향(날짜가 정해진 행에 day_of_week)은 **거절하지 않는다** — 예전부터 그렇게
 *     보내던 화면이 있고(js/adm-q6.js), 그 경우 날짜가 이기므로 조용히 무해하다.
 *     여기서 새로 막으면 «되던 것» 을 깨는 변경이 된다. */
export function moveFieldConflict(
  row: { schedule_kind?: any; scheduled_date?: any } | null,
  body: { scheduled_date?: any },
): MoveDeny {
  if (!row) return null;                       // 행을 못 읽었으면 여기서 판단하지 않는다(부르는 쪽이 막는다)
  if (body.scheduled_date == null) return null;
  const kind = String(row.schedule_kind ?? '').trim();
  const hasDate = row.scheduled_date != null && String(row.scheduled_date).trim() !== '';
  if (kind === 'recurring' && !hasDate) {
    return {
      error: 'recurring_needs_dow',
      message: '매주 반복 수업은 날짜가 아니라 요일로 옮겨야 합니다. 화면을 새로고침한 뒤 다시 시도해 주세요.',
      status: 400,
    };
  }
  return null;
}
