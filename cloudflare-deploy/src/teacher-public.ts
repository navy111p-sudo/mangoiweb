/* 👨‍🏫 공개 강사 목록(/api/teacher-profiles — 로그인 없이 누구나 부름)에 실어도 되는 값만 남긴다.
 *
 * 🔴 (2026-11-05) teacher_profiles.notes 는 «선생님 한마디» 가 아니라 «내부 관리 메모» 다.
 *   실측(운영 D1, 활동중 25명): 전원이 「아이디:mangoi_026 / 프랜차이즈:에듀비전 / 80분연강:제한 /
 *   평점: 5.0 (2 reviews)」 꼴이고, 일부는 「역할: 관리자(수업 안 함)」·「[2026-09-01 사장님 지시 …]」
 *   같은 작업 메모다. 강사의 로그인 아이디까지 들어 있다.
 *   새 강사 소개 창이 이 칸을 «선생님 한마디» 로 그려 학부모 화면에 그대로 보였다(사장님 캡처).
 * ✅ 공개 API 는 이 칸에서 «평점 조각» 하나만 남긴다 — 그 칸을 읽는 공개 화면 둘
 *   (lesson-booking-demo·lesson-postpone-demo)이 `평점: X` · `(N reviews)` 만 정규식으로 꺼내 쓰므로
 *   모양을 그대로 맞춰 둔다(옛 화면도 고칠 필요가 없다).
 * ⛔ 원문 메모를 공개 응답에 다시 싣지 마세요. 그 칸의 «선생님 한마디» 는 career 칸입니다.
 */
export function publicTeacherNotes(notes: unknown): string | null {
  const s = typeof notes === 'string' ? notes : '';
  const m = s.match(/평점\s*:\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const c = s.match(/\(\s*(\d+)\s*reviews?\s*\)/i);
  return '평점: ' + m[1] + (c ? ' (' + c[1] + ' reviews)' : '');
}

/** 공개 목록 한 줄 — 내부 메모를 걸러 낸 사본을 돌려준다(원본 행은 안 건드림). */
export function publicTeacherRow<T extends { notes?: unknown }>(row: T): T {
  return { ...row, notes: publicTeacherNotes(row && row.notes) };
}

/* 🧑‍💼 (2026-11-05 사장님 「매니저는 빼줘」) 수업을 안 하는 매니저는 공개 강사 목록에 안 싣는다.
 *   근거는 데이터 두 가지(운영 D1 실측 — 활동중 25명 중 매니저 3명):
 *   ① 메모에 「역할: 관리자(수업 안 함)」 — Melca·Maimai
 *   ② 명부 분류(group_name)가 «Head Teacher» — Maimai·Karl (Karl 은 메모가 비어 있어 ①로는 안 잡힌다)
 *   ⚠️ 나중에 «수업하는» Head Teacher 가 생기면 이 규칙이 그 사람도 뺀다 — 그때는 분류를 바꾸거나 이 줄을 고친다.
 *   ⚠️ 원본 행(메모 원문 포함)으로 판정해야 한다 — publicTeacherRow 를 거친 뒤에는 메모가 평점 조각뿐이다.
 *   ℹ️ 관리자 명부·수업·급여에는 영향 없다(이 함수는 공개 목록에서만 부른다). */
export function isPublicTeacher(row: { group_name?: unknown; notes?: unknown } | null | undefined): boolean {
  if (!row) return false;
  const g = typeof row.group_name === 'string' ? row.group_name.trim().toLowerCase() : '';
  if (g === 'head teacher') return false;
  const n = typeof row.notes === 'string' ? row.notes : '';
  if (/역할\s*:\s*관리자/.test(n) || /수업\s*안\s*함/.test(n)) return false;
  return true;
}
