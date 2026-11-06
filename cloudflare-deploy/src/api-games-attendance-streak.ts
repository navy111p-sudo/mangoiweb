// 출결 기반 연속일 계산과 야간·관리자 일괄 정합화의 정본.
// ── 🔥 연속 출석(Streak) 그래프 DFS — 출결의 단일 권위(source of truth) ──────
// attendance 의 날짜들을 (수업)<-[:NEXT_LESSON]-(이전수업) 연결 리스트로 간주하고,
// 가장 최근 출석일(anchor)을 기점으로 하루씩 역방향으로 사슬을 타며
// (학생)-[:ATTENDED]->(수업) 엣지(EXISTS)가 끊길 때까지의 깊이를 잰다.
//   · 재귀 1스텝 = NEXT_LESSON 1홉, EXISTS = ATTENDED 엣지 확인, n<30 = 깊이(Depth) 캡
//   · idx_attendance_user_date(user_id,date) 를 그대로 타므로 전체 로그 풀스캔이 아니라
//     O(streak) 인덱스 시크(최대 30회)로 끝난다 → 7/30일 배지·status 판정에 충분.
//   · COUNT(DISTINCT date) 류와 달리 "진짜 연속(consecutive)" 을 계산한다.
// 배지 판정(checkAndAwardBadges)과 /api/streak/status 가 공유하는 단일 함수.
export async function computeAttendanceStreak(env: { DB: D1Database }, userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const row: any = await env.DB.prepare(`
      WITH RECURSIVE
        anchor(d) AS (
          SELECT MAX(date) FROM attendance
          WHERE user_id = ? AND date IS NOT NULL AND date <> ''
        ),
        walk(d, n) AS (
          SELECT (SELECT d FROM anchor), 1
          WHERE (SELECT d FROM anchor) IS NOT NULL
          UNION ALL
          SELECT date(walk.d, '-1 day'), walk.n + 1
          FROM walk
          WHERE walk.n < 30
            AND EXISTS (
              SELECT 1 FROM attendance
              WHERE user_id = ? AND date = date(walk.d, '-1 day')
            )
        )
      SELECT COALESCE(MAX(n), 0) AS streak FROM walk
    `).bind(userId, userId).first();
    return Number(row?.streak || 0);
  } catch { return 0; }
}

// 🔁 전체 학생 streak 일괄 정합화 (cron 야간 배치, KST 03:00) ─────────────────
// per-student 루프(N쿼리) 대신 gaps-and-islands 윈도우 쿼리 1방으로 모든 학생의
// 현재/최장 연속 출석을 산출하고 student_streaks 에 UPSERT(gems 는 보존)한다.
// → 리더보드(저장된 current_streak 를 읽음)를 한 번도 status/체크인을 안 거친
//   학생까지 출결 기준으로 일관화. computeAttendanceStreak 과 동일하게 30 캡.
export async function reconcileAllStreaks(env: { DB: D1Database }): Promise<{ scanned: number; updated: number }> {
  try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_streaks (student_uid TEXT PRIMARY KEY, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, last_check_date TEXT, gems INTEGER DEFAULT 0, total_gems_earned INTEGER DEFAULT 0, updated_at INTEGER);`); } catch {}
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}

  const now = Date.now();
  const CAP = 30;

  // gaps-and-islands: 연속 날짜는 (julianday - 행번호) 값이 동일 → 그 그룹의 크기가 연속 길이.
  //   current = 가장 최근 출석일로 끝나는 run 의 길이, longest = 모든 run 중 최대.
  const rs = await env.DB.prepare(`
    WITH days AS (
      SELECT DISTINCT user_id, date
      FROM attendance
      WHERE date IS NOT NULL AND date <> '' AND (role IS NULL OR role = 'student')
    ),
    grp AS (
      SELECT user_id, date,
             CAST(julianday(date) AS INTEGER) - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY date) AS g
      FROM days
    ),
    runs AS (
      SELECT user_id, g, COUNT(*) AS run_len, MAX(date) AS run_end
      FROM grp
      GROUP BY user_id, g
    )
    SELECT
      r.user_id AS user_id,
      MAX(r.run_len) AS longest_streak,
      (SELECT run_len FROM runs r2 WHERE r2.user_id = r.user_id ORDER BY r2.run_end DESC LIMIT 1) AS current_streak
    FROM runs r
    GROUP BY r.user_id
  `).all();

  const rows = (rs.results || []) as any[];
  if (!rows.length) return { scanned: 0, updated: 0 };

  const upsert = env.DB.prepare(`
    INSERT INTO student_streaks (student_uid, current_streak, longest_streak, gems, total_gems_earned, updated_at)
    VALUES (?, ?, ?, 0, 0, ?)
    ON CONFLICT(student_uid) DO UPDATE SET
      current_streak = excluded.current_streak,
      longest_streak = MAX(student_streaks.longest_streak, excluded.longest_streak),
      updated_at = excluded.updated_at
  `);

  let updated = 0;
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r: any) =>
      upsert.bind(
        String(r.user_id),
        Math.min(Number(r.current_streak || 0), CAP),
        Math.min(Number(r.longest_streak || 0), CAP),
        now,
      )
    );
    try { await env.DB.batch(batch); updated += batch.length; } catch { /* 일부 실패는 다음 배치에 영향 없음 */ }
  }

  return { scanned: rows.length, updated };
}

