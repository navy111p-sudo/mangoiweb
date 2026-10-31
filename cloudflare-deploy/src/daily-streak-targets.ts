/* ═══════════════════════════════════════════════════════════════════════════
   🔔 매일 KST 19:00 «오늘 영어 한 마디» 푸시 — 받을 사람 정하기 (정본 한 곳)
   ───────────────────────────────────────────────────────────────────────────
   🔴 2026-10-18 실측 (개선안 3순위 ⑩, D1 SELECT)
     · push_queue 의 daily-* 186건이 전부 «사장님 계정(admin)» 과 «계정이 비어 있는
       구독» 으로만 갔습니다. 학생 구독은 한 건도 없었습니다.
     · 뿌리가 셋이었습니다:
       ① 받을 사람을 «학생인가» 로 안 걸렀습니다 — 결재함·강사 화면도 같은 표
          (push_subscriptions)에 구독을 넣으므로 직원·강사가 매일 «오늘 학습
          안 했어요» 를 받게 됩니다(그들은 학생 출석이 없으니 언제나 대상).
       ② «오늘 출석했나» 를 attendance.user_id 로 봤습니다 — 그 칸은 화상방이
          접속마다 새로 주는 «기기 임시번호» 라 계정과 안 맞습니다
          (src/attendance-uid.ts 머리말과 같은 뿌리). 계정은 account_uid 입니다.
       ③ 날짜를 UTC 로 셌습니다 — attendance.date 는 KST 입니다(실측 14일 273행
          전부 KST 와 일치). 19:00 KST 에는 우연히 같은 날이라 지금은 안 터지지만
          cron 시각을 옮기는 날 하루가 어긋납니다.
     · (덤) 학생 화면의 구독은 mango_user.user_id 를 보냈는데 로그인 정본이 적는
       모양은 {uid, name, role} 이라 user_id 칸이 없어 «계정 없는 구독» 이 됐습니다
       — public/js/idx-push-sw.js 에서 함께 고쳤습니다.

   ✅ 규칙
     · 학생 계정(students_erp.user_id 완전일치)인 구독만
     · 관리자·강사 계정(admin_account.username)이면 빼기 — 같은 아이디가 양쪽에
       있으면 «직원» 쪽으로 보고 안 보냅니다(사장님에게 학생 독촉이 가는 쪽이 더 나쁨)
     · 오늘(KST) 그 계정의 attendance 행이 있으면 빼기 — account_uid 또는 user_id
       (카페24 예약 씨앗은 user_id 가 계정이라 «오늘 수업이 잡힌 학생» 도 빠집니다.
        «오늘 학습 안 했어요» 라고 말하기엔 그 학생은 오늘 수업이 있으니 맞는 방향)
     · 실패하면 «아무에게도 안 보냄» — 독촉 알림은 빠지는 쪽이 잘못 가는 쪽보다 낫습니다
   ⛔ 이 SQL 을 «쓰기» 에 쓰지 마세요(읽기 전용).
   ⚠️ 배달 자체(푸시가 실제로 폰에 뜨는가)는 이 파일이 고치지 못합니다 —
      2026-10-18 실측 push_queue 326건 중 fetched_at 이 찍힌 행이 0건입니다
      (결재 알림 포함). VAPID 시크릿·구독 상태를 사람이 확인해야 합니다.

   감시: test-harness/daily_streak_push_harness.mjs (진짜 SQLite 로 실제 실행)
   ═══════════════════════════════════════════════════════════════════════════ */

/** 한국 시간(KST) 기준 'YYYY-MM-DD'. attendance.date 와 같은 눈금. */
export function kstTodayYmd(nowMs: number = Date.now()): string {
  return new Date(nowMs + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 받을 구독 목록. 바인드는 [오늘, 오늘] (account_uid · user_id 두 갈래). */
export const STREAK_TARGET_SQL = `
  SELECT DISTINCT s.user_id AS user_id, s.endpoint AS endpoint
    FROM push_subscriptions s
   WHERE s.enabled = 1
     AND s.user_id IS NOT NULL AND TRIM(s.user_id) <> ''
     AND EXISTS (SELECT 1 FROM students_erp e WHERE e.user_id = s.user_id)
     AND NOT EXISTS (SELECT 1 FROM admin_account a WHERE a.username = s.user_id)
     AND NOT EXISTS (SELECT 1 FROM attendance t WHERE t.account_uid = s.user_id AND t.date = ?)
     AND NOT EXISTS (SELECT 1 FROM attendance t WHERE t.user_id = s.user_id AND t.date = ?)`;

export interface StreakTarget { user_id: string; endpoint: string }

/** 오늘 푸시를 받을 학생 구독. 조회가 실패하면 빈 배열(= 아무에게도 안 보냄)과 사유. */
export async function loadStreakTargets(db: any, today: string): Promise<{ targets: StreakTarget[]; error: string | null }> {
  try {
    const rs = await db.prepare(STREAK_TARGET_SQL).bind(today, today).all();
    const rows = ((rs && rs.results) || []) as any[];
    const targets = rows
      .filter((r) => r && r.endpoint && r.user_id)
      .map((r) => ({ user_id: String(r.user_id), endpoint: String(r.endpoint) }));
    return { targets, error: null };
  } catch (e: any) {
    return { targets: [], error: String((e && e.message) || e) };
  }
}
