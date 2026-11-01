/* 🔒 대리점 로그인 계정 «만들기·비밀번호 바꾸기» 는 본사(hq) 계정만 — 판정 정본(순수 함수)
 *
 *  (2026-10-28 사장님 「본사 계정만 만들 수 있게 좁혀줘」)
 *
 *  왜 따로 두나
 *    대리점 저장(POST·PATCH /api/admin/centers) 자체는 canEditOrg() 로 막는데, 그 함수는
 *    scope_type 'none'(내부 직원) 에도 true 다(scope.ts). 그래서 «대리점 정보 고치기» 는 그대로 두고
 *    «로그인 계정 만들기·비밀번호 바꾸기» 만 한 단계 더 좁힌다 — 남의 비밀번호를 바꾸는 일이라.
 *
 *  판정 (scopeRow 는 admin_scope 를 «삼키지 않고» 다시 읽은 값)
 *    · undefined = 조회 실패(모름) → 막는다. ⛔ getScope() 는 실패를 삼켜 'none' 이나 이름 추측으로
 *      떨어지므로(CLAUDE.md 「getAdminActor().role 로 막았는데 D1 이 흔들리면 그대로 통과」) 그 값을 쓰지 않는다.
 *    · null = 행 없음 → 시스템 전체권한 계정(FULL_ACCESS_ACCOUNTS — admin·cfo·ops_lead)만 통과.
 *      (2026-10-28 실측: 본사 계정 중 행이 없는 것은 ops_lead 하나. 그 밖의 «행 없음» 은 agency_sc002·capitown)
 *    · 'teacher' → 강사 차단 · 'hq' 가 아니면 → 본사 전용 거절.
 *  ⚠️ 반환은 단순 객체(판별 유니온 금지 — strictNullChecks:false 라 좁혀지지 않는다).
 *  ⚠️ 문구는 화면에 그대로 뜨므로 한/영을 함께 적는다. */

export type AgencyLoginGateActor = { ok: boolean; isTeacher: boolean; username: string };
export type AgencyLoginGateResult = { ok: boolean; error: string; message: string; status: number };

const HQ_ONLY_MSG = '대리점 로그인 계정은 본사 계정만 만들거나 비밀번호를 바꿀 수 있습니다. / '
  + 'Only HQ accounts can create agency logins or reset their passwords.';

export function agencyLoginGate(
  actor: AgencyLoginGateActor,
  scopeRow: { scope_type?: string | null } | null | undefined,
  fullAccess: Set<string>,
): AgencyLoginGateResult {
  if (!actor || !actor.ok || !actor.username) {
    return { ok: false, error: 'auth_required', message: '로그인이 필요합니다. / Please log in.', status: 401 };
  }
  if (actor.isTeacher) {
    return { ok: false, error: 'forbidden_teacher', message: HQ_ONLY_MSG, status: 403 };
  }
  if (scopeRow === undefined) {
    return { ok: false, error: 'scope_unknown',
      message: '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요. / Could not verify your permission. Please try again.',
      status: 403 };
  }
  if (scopeRow === null) {
    if (fullAccess.has(String(actor.username).toLowerCase())) return { ok: true, error: '', message: '', status: 200 };
    return { ok: false, error: 'forbidden_scope', message: HQ_ONLY_MSG, status: 403 };
  }
  const st = String(scopeRow.scope_type ?? '').trim();
  if (st === 'teacher') return { ok: false, error: 'forbidden_teacher', message: HQ_ONLY_MSG, status: 403 };
  if (st !== 'hq') return { ok: false, error: 'forbidden_scope', message: HQ_ONLY_MSG, status: 403 };
  return { ok: true, error: '', message: '', status: 200 };
}
