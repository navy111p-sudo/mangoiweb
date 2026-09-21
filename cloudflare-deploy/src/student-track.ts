// ═══════════════════════════════════════════════════════════════════════
// 🎯 student-track.ts — «이 학생이 화상수업을 하는가» 판정 «정본»
//
// [왜 이 파일이 생겼나 — 2026-09-21]
//   레벨테스트는 흐름이 «하나» 뿐이라, 화상수업 학생과 AI 학습도구만 쓰는 학생이
//   같은 표에 같은 모양으로 쌓였다. 그런데 둘은 AI 점수의 «무게» 가 다르다:
//     · 화상수업 + AI → AI 점수는 참고값. 선생님이 5개 항목을 매겨 최종 확정한다.
//     · AI 전용       → 선생님이 없다. AI 점수가 «유일한 근거» 이고 그대로 굳는다.
//   그 차이를 아무도 안 보고 있었다(2026-09-21 D1 실측: 선생님 평가 0건 ·
//   진단 7건 중 6건이 이미 화상수업 학생 · students_erp.level 이 채워진 7명이 곧 그들).
//
// [판정 근거는 «활성 예약» 하나뿐이다]
//   결제 상품(`ai_content`, 2026-09-09 신설)이 뜻으로는 더 정확하지만 실측 결제 0건이고
//   «안 사도 AI 도구를 쓸 수 있는» 상태라(게이트 미구현) 지금은 근거가 못 된다.
//   그래서 `class_schedules` 의 활성 예약 수로 본다.
//
// [📊 잰 것 — 2026-09-21, D1 SELECT 만]
//   이 규칙(`status='active'` + 자리표시 제외)으로 «예약이 있다» 가 되는 학생 = 502명.
//   ⚠️ 그 502명은 «앞으로 수업이 잡힌» 학생이 아니다 — 지난 날짜인데 여태 `active` 인
//      행이 1,808건(495명) 있어서 그것까지 센다(같은 날 CLAUDE.md 에 들어간 줄).
//      날짜가 오늘 이후이거나 반복(NULL)인 학생만 세면 159명이다.
//   ⛔ 그렇다고 날짜로 좁히지 마세요 — 좁히면 343명이 AI 전용으로 넘어가
//      그 학생들의 진단이 선생님 대기에서 빠진다. 넓은 쪽이 «사람이 한 번 보는» 방향이다.
//
// [⚠️ 이 판정은 «추측» 이다 — 그렇게 부르고 그렇게 쓴다]
//   활성 예약 행이 «하나도» 없어야 AI 전용으로 잡힌다.
//   ⛔ 「수강이 끝난 학생은 저절로 AI 전용이 된다」로 읽지 마세요 — 위 1,808건처럼
//      끝난 수업의 행이 `active` 로 남아 있으면 그 학생은 여전히 «화상수업» 쪽이다.
//   그래서 이 값으로 무엇을 «막지» 않는다. 하는 일은 둘뿐이다:
//     · AI 전용 진단 건을 관리자 «처리 대기» 에서 빼 둔다(사람이 되돌릴 수 있다)
//     · 화면이 «AI 자동» 과 «선생님 확정» 을 구분해 말하게 한다
//
// [⛔ students_erp 에 «AI 전용» 칸을 만들지 말 것]
//   그 표는 카페24가 정본이라 매일 밤 03:00 동기화가 덮어쓴다
//   (CLAUDE.md 「학생 이름·계정을 D1 에서 고쳤는데 다음날 원복됨」).
// ═══════════════════════════════════════════════════════════════════════

/** 'live_ai' = 화상수업 + AI · 'ai_only' = AI 학습도구만 · 'unknown' = 못 물어봤다 */
export type StudentTrack = 'live_ai' | 'ai_only' | 'unknown';

export interface StudentTrackResult {
  track: StudentTrack;
  /** 활성 예약 수. track 이 'unknown' 이면 -1(「0건」과 「모름」은 다른 사실이다). */
  live_count: number;
}

/* ⛔ 자리표시(LMS 임포트·시연 시드)는 «진짜 수업» 이 아니다 — 세면 모든 학생이 화상수업
   학생으로 잡힌다. 같은 문자열이 schedule-conflict.ts · api-admin.ts · api-teacher.ts ·
   churn-graph.ts · enroll-ops.ts 에도 있다(CLAUDE.md 「수강신청 확정 화면에서 강사가
   비어 있는데 «그 시간 다른 수업 있음»」). 한 곳만 고치면 조용히 어긋난다. */
const NOT_PLACEHOLDER = `LOWER(COALESCE(user_id,'')) NOT IN ('lms','type_seed')`;

/**
 * 그 학생이 화상수업을 하는지 본다.
 *
 * ⚠️ 조회가 실패하면 'unknown' 이다 — 'ai_only' 로 떨어뜨리지 않는다.
 *    한 번 흔들렸다고 화상수업 학생의 진단 건이 «대기» 에서 빠지면,
 *    선생님이 평가해야 할 건이 조용히 목록에서 사라진다.
 */
export async function resolveStudentTrack(env: any, uid: string | null | undefined): Promise<StudentTrackResult> {
  const id = String(uid || '').trim();
  if (!id) return { track: 'unknown', live_count: -1 };
  try {
    const r: any = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM class_schedules
        WHERE user_id = ? AND status = 'active' AND ${NOT_PLACEHOLDER}`
    ).bind(id).first();
    // ⚠️ 이 줄을 `Number(r && r.n)` 로 줄이지 말 것 — 행이 없으면 `Number(null) === 0` 이라
    //    유한수로 통과해 «몰람» 이 «ai_only» 로 떨어진다(위 ⚠️ 와 정반대 방향).
    if (!r || r.n == null) return { track: 'unknown', live_count: -1 };
    const n = Number(r.n);
    if (!Number.isFinite(n)) return { track: 'unknown', live_count: -1 };
    return { track: n > 0 ? 'live_ai' : 'ai_only', live_count: n };
  } catch (e: any) {
    console.warn('[student-track] lookup failed:', e && e.message);
    return { track: 'unknown', live_count: -1 };
  }
}

/**
 * 진단 결과를 어느 상태로 적을지. 'ai_done' = 선생님 단계를 건너뛴 건.
 *
 * ⚠️ 'unknown' 은 'pending' 이다 — 모르면 «사람이 한 번 보는» 쪽으로 실패한다.
 */
export function leveltestStatusFor(track: StudentTrack): 'pending' | 'ai_done' {
  return track === 'ai_only' ? 'ai_done' : 'pending';
}
