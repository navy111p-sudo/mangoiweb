/* 🧑‍🏫 강사 «상태» 판정 정본 — teacher_profiles.status / list_hidden  (2026-09-01)
   ═══════════════════════════════════════════════════════════════════════════
   [왜 이 파일이 생겼나]
     사장님 지시: 「퇴사한 강사를 강사 명부에서 비활동으로 바꾸고 싶다.
     안보임이 아니라 비활동으로 — 즉 활동, 비활동, 그리고 안보임.」

     조사해 보니 상태 세 값(활동중·비활동·퇴사)은 **이미 있었다** — 수정 모달
     드롭다운·필터·배지 색·PATCH 까지. 그런데 2026-09-01 운영 D1 실측으로
     33행 중 활동중 32 · 퇴사 1 · **비활동 0**, 퇴사일이 적힌 강사도 0명이었다.
     한 번도 안 쓰인 이유는 바꾸는 길이 멀어서다(수정 → 모달 → 스크롤 → 저장).
     그래서 명부에서 사람을 빼는 실제 수단이 **🗑 영구 삭제뿐**이었다.

   [두 축인 이유]  ⛔ 「안보임」을 status 값으로 만들지 말 것
     한 축으로 합치면 아래 둘을 동시에 표현할 방법이 사라진다 —
       · 퇴사했지만 이번 달 정산이 남아 **명부에 남겨 둘** 사람
       · 활동중인데 **명부에서 감추고 싶은** 행
     뒤쪽은 가정이 아니다. 2026-09-01 실측으로 명부에 「테스트강사」·「파라테스트」가
     활동중으로 섞여 34명에 포함돼 있었다. 사람이 아니라 시험용 행이다.
     그래서 상태(status, 세 값)와 노출(list_hidden, 0/1)을 **따로** 둔다.

   [읽는 쪽 규칙]
     · status 가 NULL·'' 이면 «활동중» 으로 본다 — 옛 행이 그렇게 들어 있다.
     · '재직' 은 옛 별칭이다. api-admin.ts 두 곳이 실제로 `IN ('활동중','재직')`
       으로 읽고 있어, 쓰는 쪽에서 '활동중' 으로 눕혀 준다.
     ⚠️ 이 파일을 만들었다고 기존 8곳의 `status='활동중' OR status IS NULL` 을
        건드리지 않았다 — 그 조건은 비활동·퇴사를 **이미** 제외하므로 동작이
        옳다. 새로 쓰는 코드만 여기를 보게 하고, 옛 조건 정리는 별건으로 둔다.

   ⛔ 이 규칙을 다른 파일에 복사하지 말 것. import 해서 쓴다.
      (감시: test-harness/teacher_status_inline_harness.mjs — 함수를 실제로 돌린다) */

export const TEACHER_STATUS_ACTIVE = '활동중';
export const TEACHER_STATUS_INACTIVE = '비활동';
export const TEACHER_STATUS_LEFT = '퇴사';

/** 화면 드롭다운·서버 허용목록이 함께 보는 목록. 순서 = 화면에 그리는 순서. */
export const TEACHER_STATUSES: string[] = [
  TEACHER_STATUS_ACTIVE,
  TEACHER_STATUS_INACTIVE,
  TEACHER_STATUS_LEFT,
];

/** 옛 별칭 → 정본. 읽기 경로가 '재직' 을 활동중으로 취급하고 있어 쓰기에서 눕힌다. */
const TEACHER_STATUS_ALIAS: Record<string, string> = {
  '재직': TEACHER_STATUS_ACTIVE,
  'active': TEACHER_STATUS_ACTIVE,
  'inactive': TEACHER_STATUS_INACTIVE,
  'resigned': TEACHER_STATUS_LEFT,
};

/** 아는 값이면 정본 문자열, 모르면 '' 를 돌려준다.
 *  ⛔ 모르는 값을 조용히 null 로 바꾸지 않는다 — 부르는 쪽이 400 으로 거절해야 한다.
 *     (CLAUDE.md 2장 「화면에서 골랐는데 그 값만 저장이 안 됨」의 반대편 실수) */
export function canonTeacherStatus(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (TEACHER_STATUSES.indexOf(s) >= 0) return s;
  const alias = TEACHER_STATUS_ALIAS[s] || TEACHER_STATUS_ALIAS[s.toLowerCase()];
  return alias || '';
}

/** 저장해도 되는 상태값인가. PATCH 허용목록이 이것으로 판정한다. */
export function isTeacherStatus(raw: unknown): boolean {
  return canonTeacherStatus(raw) !== '';
}

/** 「지금 수업을 맡을 수 있는 강사인가」 — NULL·'' 은 옛 행이라 활동중으로 본다. */
export function isActiveTeacherStatus(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  const s = String(raw).trim();
  if (!s) return true;
  return canonTeacherStatus(s) === TEACHER_STATUS_ACTIVE;
}

/** 명부에서 감춘 행인가. 칸이 없는 옛 DB(undefined)는 «보임» 이다. */
export function isTeacherListHidden(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'string' && raw.trim() === '') return false;
  return Number(raw) === 1;
}

/** 화면 체크박스 → DB 값(0/1). */
export function toTeacherListHidden(raw: unknown): number {
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 1;
  return 0;
}

/** 「명부에 보이는 행만」 SQL 조건. 칸이 없던 옛 행(NULL)도 보이게 COALESCE 한다. */
export function teacherVisibleSql(alias = ''): string {
  const p = alias ? alias + '.' : '';
  return `COALESCE(${p}list_hidden, 0) = 0`;
}
