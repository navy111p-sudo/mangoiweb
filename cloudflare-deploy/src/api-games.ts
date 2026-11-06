// 학습 API 진입: 단어장·마이크로러닝·복습퀴즈·음성은 기능 모듈로 위임한다.
// 배지·출석 스트릭과 기존 외부 import용 export는 이 진입점에서 유지한다.
import { handleVocabApi } from './api-games-vocab';
import { handleMicrolearnApi } from './api-games-microlearn';
export { isCleanText, VOCAB_SRS_INTERVALS, vocabSrsNext, vocabWriteDenied } from './api-games-vocab-core';
import { handleReviewQuizApi } from './api-games-review-quiz';
import { handleVoiceApi } from './api-games-voice';
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';  // 🔐 소유자 검증(IDOR 방지)
import { resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정(게스트 예외+관리자/토큰)
import type { MangoEnv } from './api-mango';
import { ATTENDANCE_BY_UID, attUidBinds } from './attendance-uid';

// ═══════════════════════════════════════════════════════════════════════
// 🎮 게이미피케이션 공용부 — api-mango.ts 에서 이동 (3차, 2026-07-14)
//   checkAndAwardBadges 는 api-mango(영작 첨삭)도 import 해서 사용한다.
// ═══════════════════════════════════════════════════════════════════════


// ── 🔥 연속 출석(Streak) 그래프 DFS — 출결의 단일 권위(source of truth) ──────
// attendance 의 날짜들을 (수업)<-[:NEXT_LESSON]-(이전수업) 연결 리스트로 간주하고,
// 가장 최근 출석일(anchor)을 기점으로 하루씩 역방향으로 사슬을 타며
// (학생)-[:ATTENDED]->(수업) 엣지(EXISTS)가 끊길 때까지의 깊이를 잰다.
//   · 재귀 1스텝 = NEXT_LESSON 1홉, EXISTS = ATTENDED 엣지 확인, n<30 = 깊이(Depth) 캡
//   · idx_attendance_user_date(user_id,date) 를 그대로 타므로 전체 로그 풀스캔이 아니라
//     O(streak) 인덱스 시크(최대 30회)로 끝난다 → 7/30일 배지·status 판정에 충분.
//   · COUNT(DISTINCT date) 류와 달리 "진짜 연속(consecutive)" 을 계산한다.
// 배지 판정(checkAndAwardBadges)과 /api/streak/status 가 공유하는 단일 함수.
async function computeAttendanceStreak(env: { DB: D1Database }, userId: string): Promise<number> {
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

export const BADGE_CATALOG = [
      { code: 'first_login',       icon: '🎉', name: '첫 발걸음',         name_en: 'First Steps',          desc: '망고아이 첫 로그인',           desc_en: 'First login to Mangoi',                      rule: 'manual' },
      { code: 'first_class',       icon: '🎓', name: '첫 수업 입장',       name_en: 'First Class',          desc: '첫 화상수업 참여',             desc_en: 'Joined a first video class',                 rule: 'attendance_1' },
      { code: 'streak_7',          icon: '📅', name: '7일 연속 출석',      name_en: '7-Day Streak',         desc: '일주일 매일 출석',             desc_en: 'Attended every day for a week',              rule: 'streak_7' },
      { code: 'streak_30',         icon: '🔥', name: '30일 연속 출석',     name_en: '30-Day Streak',        desc: '한달 매일 출석',               desc_en: 'Attended every day for a month',             rule: 'streak_30' },
      { code: 'eval_perfect',      icon: '⭐', name: '평가서 만점',        name_en: 'Perfect Score',        desc: '평가서 종합 10점',             desc_en: 'Overall score of 10 on an evaluation',       rule: 'eval_10' },
      { code: 'voice_practice_10', icon: '🎙', name: '음성 코칭 10회',     name_en: '10 Voice Sessions',    desc: 'AI 음성 코칭 10회 완료',       desc_en: 'Completed 10 AI voice coaching sessions',    rule: 'voice_10' },
      { code: 'voice_score_90',    icon: '🌟', name: '발음 마스터',        name_en: 'Pronunciation Master', desc: 'AI 음성 코칭 90점 이상',       desc_en: 'Scored 90+ in AI voice coaching',            rule: 'voice_90' },
      { code: 'writing_first',     icon: '✍️', name: '첫 영작',            name_en: 'First Writing',        desc: 'AI 영작 첨삭 첫 도전',         desc_en: 'First try at AI writing feedback',           rule: 'writing_1' },
      { code: 'writing_10',        icon: '📝', name: '영작 10편',          name_en: '10 Writings',          desc: 'AI 영작 첨삭 10편 완성',       desc_en: 'Completed 10 AI-reviewed writings',          rule: 'writing_10' },
      { code: 'writing_30',        icon: '📖', name: '영작 작가',          name_en: 'Young Author',         desc: 'AI 영작 첨삭 30편 완성',       desc_en: 'Completed 30 AI-reviewed writings',          rule: 'writing_30' },
      { code: 'writing_90',        icon: '🏅', name: '영작 90점',          name_en: 'Writing Ace',          desc: 'AI 영작 첨삭 90점 이상',       desc_en: 'Scored 90+ on AI writing feedback',          rule: 'writing_90' },
      { code: 'writing_streak_7',  icon: '🖋️', name: '7일 연속 영작',      name_en: '7-Day Writer',         desc: '일주일 매일 영작하기',         desc_en: 'Wrote every day for a week',                 rule: 'writing_streak_7' },
      { code: 'vocab_first',       icon: '🌱', name: '첫 단어',            name_en: 'First Word',           desc: '나의 단어장에 첫 단어 추가',   desc_en: 'Added a first word to My Vocabulary',        rule: 'vocab_1' },
      { code: 'vocab_50',          icon: '📚', name: '단어 수집가',        name_en: 'Word Collector',       desc: '단어 50개 수집',               desc_en: 'Collected 50 words',                         rule: 'vocab_50' },
      { code: 'vocab_review_100',  icon: '🧠', name: '복습 챔피언',        name_en: 'Review Champion',      desc: '단어 복습 100회 달성',         desc_en: 'Reached 100 word reviews',                   rule: 'vocab_review_100' },
      { code: 'vocab_master_10',   icon: '🥇', name: '골드 카드 10장',     name_en: '10 Gold Cards',        desc: '단어 10개 마스터 (Lv5 이상)',  desc_en: 'Mastered 10 words (Lv5 or higher)',          rule: 'vocab_master_10' },
      { code: 'vocab_streak_7',    icon: '🔥', name: '7일 연속 복습',      name_en: '7-Day Reviewer',       desc: '일주일 매일 단어 복습',        desc_en: 'Reviewed words every day for a week',        rule: 'vocab_streak_7' },
      { code: 'points_1000',       icon: '💎', name: '포인트 1,000',       name_en: '1K Points',            desc: '누적 1,000 포인트',            desc_en: '1,000 points earned in total',               rule: 'points_1000' },
      { code: 'points_5000',       icon: '👑', name: '포인트 5,000',       name_en: '5K Points',            desc: '누적 5,000 포인트',            desc_en: '5,000 points earned in total',               rule: 'points_5000' },
      { code: 'monthly_top',       icon: '🏆', name: '월간 TOP',           name_en: 'Monthly TOP',          desc: '월간 학원 랭킹 TOP 3 진입',    desc_en: 'Reached TOP 3 in the monthly ranking',       rule: 'monthly_top' },
    ];

const ensureBadgeTables = async (env: MangoEnv) => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_badges (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, badge_code TEXT NOT NULL, awarded_at INTEGER NOT NULL, UNIQUE(user_id, badge_code));`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_badges_user ON student_badges(user_id, awarded_at DESC)`); } catch {}
      // Streak DFS(재귀 CTE)가 풀스캔 대신 인덱스 시크로 끝나도록 보장 (멱등)
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}
    };

    // 배지 자동 검사 + 부여 (다른 액션에서도 호출 가능)
export const checkAndAwardBadges = async (env: MangoEnv, userId: string): Promise<string[]> => {
      if (!userId) return [];
      await ensureBadgeTables(env);
      const earned: string[] = [];
      const now = Date.now();

      // 이미 가진 배지
      const haveRs = await env.DB.prepare(`SELECT badge_code FROM student_badges WHERE user_id = ?`).bind(userId).all();
      const have = new Set((haveRs.results || []).map((r: any) => r.badge_code));

      const award = async (code: string) => {
        if (have.has(code)) return;
        try {
          await env.DB.prepare(`INSERT OR IGNORE INTO student_badges (user_id, badge_code, awarded_at) VALUES (?, ?, ?)`).bind(userId, code, now).run();
          earned.push(code);
          have.add(code);
        } catch {}
      };

      // 출석 카운트
      try {
        const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS days FROM attendance WHERE ${ATTENDANCE_BY_UID}`).bind(...attUidBinds(userId)).first();
        if ((att?.days || 0) >= 1) await award('attendance_1');
        if ((att?.days || 0) >= 1) await award('first_class');
        // 연속 출석 — 날짜 연결 리스트를 역방향 DFS(재귀 CTE)로 "진짜 연속"을 계산 (풀스캔 X)
        const streakDays = await computeAttendanceStreak(env, userId);
        if (streakDays >= 7) await award('streak_7');
        if (streakDays >= 30) await award('streak_30');
      } catch {}

      // 평가서 만점
      try {
        const e: any = await env.DB.prepare(`SELECT MAX(score_overall) AS m FROM student_evaluations WHERE student_uid = ?`).bind(userId).first();
        if ((e?.m || 0) >= 10) await award('eval_perfect');
      } catch {}

      // 음성 코칭
      try {
        const v: any = await env.DB.prepare(`SELECT COUNT(*) AS n, MAX(accuracy_score) AS m FROM voice_coaching WHERE student_uid = ?`).bind(userId).first();
        if ((v?.n || 0) >= 10) await award('voice_practice_10');
        if ((v?.m || 0) >= 90) await award('voice_score_90');
      } catch {}

      // 포인트
      try {
        const p: any = await env.DB.prepare(`SELECT lifetime_earned FROM student_points WHERE user_id = ?`).bind(userId).first();
        if ((p?.lifetime_earned || 0) >= 1000) await award('points_1000');
        if ((p?.lifetime_earned || 0) >= 5000) await award('points_5000');
      } catch {}

      // 📚 나의 단어장 — 수집/마스터/복습 횟수/연속 복습일
      try {
        const vc: any = await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN level >= 5 THEN 1 ELSE 0 END),0) AS m FROM vocabulary WHERE user_id = ?`).bind(userId).first();
        if ((vc?.n || 0) >= 1) await award('vocab_first');
        if ((vc?.n || 0) >= 50) await award('vocab_50');
        if ((vc?.m || 0) >= 10) await award('vocab_master_10');
        const vr: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM vocab_review_log WHERE user_id = ?`).bind(userId).first();
        if ((vr?.n || 0) >= 100) await award('vocab_review_100');
        if (!have.has('vocab_streak_7') && (vr?.n || 0) >= 7) {
          const KST_OFF = 32400000;
          const days: any = await env.DB.prepare(
            `SELECT DISTINCT CAST((reviewed_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d FROM vocab_review_log WHERE user_id = ? ORDER BY d DESC LIMIT 60`
          ).bind(userId).all();
          const ds = ((days.results || []) as any[]).map(r => Number(r.d));
          const todayD = Math.floor((now + KST_OFF) / 86400000);
          let streak = 0;
          if (ds.length && (ds[0] === todayD || ds[0] === todayD - 1)) {
            streak = 1;
            for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) streak++;
          }
          if (streak >= 7) await award('vocab_streak_7');
        }
      } catch {}

      // ✍️ AI 영작 첨삭 — 편수/최고점/연속일 (KST 날짜 기준)
      try {
        const w: any = await env.DB.prepare(`SELECT COUNT(*) AS n, MAX(score) AS m FROM ai_writing_corrections WHERE student_uid = ?`).bind(userId).first();
        if ((w?.n || 0) >= 1) await award('writing_first');
        if ((w?.n || 0) >= 10) await award('writing_10');
        if ((w?.n || 0) >= 30) await award('writing_30');
        if ((w?.m || 0) >= 90) await award('writing_90');
        // 연속 영작일 — KST 일수(day number) DISTINCT 를 최신순으로 뽑아 오늘/어제부터 역방향으로 센다
        if (!have.has('writing_streak_7') && (w?.n || 0) >= 7) {
          const KST_OFF = 32400000; // +9h
          const days: any = await env.DB.prepare(
            `SELECT DISTINCT CAST((created_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d FROM ai_writing_corrections WHERE student_uid = ? ORDER BY d DESC LIMIT 60`
          ).bind(userId).all();
          const ds = ((days.results || []) as any[]).map(r => Number(r.d));
          const todayD = Math.floor((now + KST_OFF) / 86400000);
          let streak = 0;
          if (ds.length && (ds[0] === todayD || ds[0] === todayD - 1)) {
            streak = 1;
            for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) streak++;
          }
          if (streak >= 7) await award('writing_streak_7');
        }
      } catch {}

      return earned;
    };

    
export async function handleGamesApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    const vocabResponse = await handleVocabApi(request, url, env);
    if (vocabResponse) return vocabResponse;
    const microlearnResponse = await handleMicrolearnApi(request, url, env);
    if (microlearnResponse) return microlearnResponse;

    const reviewQuizResponse = await handleReviewQuizApi(request, url, env);
    if (reviewQuizResponse) return reviewQuizResponse;

    // ═══════════════════════════════════════════════════════════════
    // 🎮 Phase BG — 배지 라우트 (3차 이동)
    // ═══════════════════════════════════════════════════════════════
// ── POST /api/badges/check?uid=X — 배지 자동 검사 + 부여 (학생 클릭으로 트리거 가능) ──
    if (method === 'POST' && path === '/api/badges/check') {
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || b.user_id || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const earned = await checkAndAwardBadges(env, uid);
      return json({ ok: true, earned_count: earned.length, earned, catalog: BADGE_CATALOG });
    }

    // ── GET /api/badges/list?uid=X — 학생 배지 목록 ──
    if (method === 'GET' && path === '/api/badges/list') {
      await ensureBadgeTables(env);
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [PII] 본인 배지만 — 토큰 uid 일치 요구
      const bgAuth = await authUidGlobal(request, url, env);
      if (!bgAuth || bgAuth !== uid) return json({ ok: false, error: 'auth_required' }, 401);
      const rs = await env.DB.prepare(`SELECT badge_code, awarded_at FROM student_badges WHERE user_id = ? ORDER BY awarded_at DESC`).bind(uid).all();
      const earned = (rs.results || []) as any[];
      const earnedMap = new Map(earned.map(e => [e.badge_code, e.awarded_at]));
      // 카탈로그와 머지
      const badges = BADGE_CATALOG.map(c => ({
        ...c,
        earned: earnedMap.has(c.code),
        awarded_at: earnedMap.get(c.code) || null,
      }));
      return json({ ok: true, earned_count: earned.length, total_count: BADGE_CATALOG.length, badges });
    }

    // ── GET /api/admin/badges/stats — 전체 배지 통계 ──
    if (method === 'GET' && path === '/api/admin/badges/stats') {
      await ensureBadgeTables(env);
      const rs = await env.DB.prepare(`SELECT badge_code, COUNT(*) AS earned_by FROM student_badges GROUP BY badge_code ORDER BY earned_by DESC`).all();
      const stats = (rs.results || []) as any[];
      const statsMap = new Map(stats.map(s => [s.badge_code, s.earned_by]));
      const result = BADGE_CATALOG.map(c => ({ ...c, earned_by: statsMap.get(c.code) || 0 }));
      const totalAwards = stats.reduce((sum, s) => sum + (s.earned_by || 0), 0);
      return json({ ok: true, total_awards: totalAwards, badges: result });
    }


    // ═══════════════════════════════════════════════════════════════
    // 🔥 Phase ST — 데일리 스트릭 + 보석 시스템 (Duolingo)
    // ═══════════════════════════════════════════════════════════════
    const ensureStreakSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_streaks (student_uid TEXT PRIMARY KEY, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, last_check_date TEXT, gems INTEGER DEFAULT 0, total_gems_earned INTEGER DEFAULT 0, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS gem_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, balance_after INTEGER, created_at INTEGER NOT NULL);`);
      // 출결 기반 streak DFS 가 인덱스 시크로 끝나도록 보장 (멱등)
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}
    };

    // 오늘 날짜 (KST, YYYY-MM-DD)
    const todayKST = (): string => {
      const now = new Date(Date.now() + 9 * 3600 * 1000);
      return now.toISOString().slice(0, 10);
    };
    const dayDiff = (a: string, b: string): number => {
      const da = new Date(a + 'T00:00:00Z').getTime();
      const db = new Date(b + 'T00:00:00Z').getTime();
      return Math.round((db - da) / 86400000);
    };

    if (method === 'POST' && path === '/api/streak/check-in') {
      await ensureStreakSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [무결성] 본인만 출석 체크 — 임의 uid 로 남의 스트릭·보석 조작 차단 (2026-07-19).
      //   게스트(guest*)는 통과(랜덤 uid, 실계정 무관), 실계정은 토큰 소유자 OR 관리자 (earn-by-rule 과 동일 패턴).
      // 🔐 본인만 출석 체크(스트릭·보석 조작 차단). 게스트는 통과. [공용 헬퍼]
      if ((await resolveOwnerScope(request, url, env as any, uid, b)) === 'deny') {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인만 출석할 수 있습니다.' }, 401);
      }

      const today = todayKST();
      const now = Date.now();
      let row: any = await env.DB.prepare(
        `SELECT current_streak, longest_streak, last_check_date, gems, total_gems_earned FROM student_streaks WHERE student_uid = ?`
      ).bind(uid).first();

      let already_today = false;
      let earned = 0;
      let bonus_msg = '';
      let new_streak = 1;
      let new_longest = 1;
      let new_gems = 0;
      let new_total_earned = 0;

      if (!row) {
        // 신규 — 첫 출석
        earned = 10;
        new_streak = 1;
        new_longest = 1;
        new_gems = earned;
        new_total_earned = earned;
        await env.DB.prepare(
          `INSERT INTO student_streaks (student_uid, current_streak, longest_streak, last_check_date, gems, total_gems_earned, updated_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(uid, new_streak, new_longest, today, new_gems, new_total_earned, now).run();
        bonus_msg = '🎉 첫 출석! 보석 +10';
      } else {
        const last = row.last_check_date as string;
        if (last === today) {
          already_today = true;
          new_streak = row.current_streak;
          new_longest = row.longest_streak;
          new_gems = row.gems;
          new_total_earned = row.total_gems_earned;
          bonus_msg = '오늘 이미 출석했습니다';
        } else {
          const diff = dayDiff(last, today);
          new_streak = diff === 1 ? row.current_streak + 1 : 1;
          new_longest = Math.max(row.longest_streak, new_streak);

          // 기본 보상 10 + streak 보너스
          earned = 10;
          if (new_streak >= 30) { earned += 50; bonus_msg = '🏆 30일 연속! 보너스 +50'; }
          else if (new_streak >= 14) { earned += 30; bonus_msg = '🔥 2주 연속! 보너스 +30'; }
          else if (new_streak >= 7) { earned += 20; bonus_msg = '✨ 7일 연속! 보너스 +20'; }
          else if (new_streak >= 3) { earned += 5; bonus_msg = '💪 3일 연속! 보너스 +5'; }
          else { bonus_msg = `💎 출석 보석 +${earned}`; }

          new_gems = row.gems + earned;
          new_total_earned = row.total_gems_earned + earned;
          await env.DB.prepare(
            `UPDATE student_streaks SET current_streak = ?, longest_streak = ?, last_check_date = ?, gems = ?, total_gems_earned = ?, updated_at = ? WHERE student_uid = ?`
          ).bind(new_streak, new_longest, today, new_gems, new_total_earned, now, uid).run();
        }
      }

      if (earned > 0) {
        await env.DB.prepare(
          `INSERT INTO gem_transactions (student_uid, amount, reason, balance_after, created_at) VALUES (?,?,?,?,?)`
        ).bind(uid, earned, `daily_checkin_${new_streak}d`, new_gems, now).run();
      }

      return json({
        ok: true, already_today,
        current_streak: new_streak, longest_streak: new_longest,
        gems: new_gems, total_gems_earned: new_total_earned,
        earned, bonus_msg, today,
      });
    }

    if (method === 'GET' && path === '/api/streak/status') {
      await ensureStreakSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [IDOR] 본인(토큰) 또는 관리자만 — 남의 스트릭·보석 조회 차단. [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, uid))) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 스트릭만 조회할 수 있습니다.' }, 401);
      }
      const today = todayKST();
      const now = Date.now();

      // 🔗 단일 권위: 실제 출결(attendance)을 역방향 DFS 로 계산 → 게이미피케이션
      //    student_streaks 와 "두 수치"가 어긋나지 않도록 여기서 일원화한다.
      const attStreak = await computeAttendanceStreak(env, uid);
      const at: any = await env.DB.prepare(
        `SELECT 1 FROM attendance WHERE ${ATTENDANCE_BY_UID} AND date = ? LIMIT 1`
      ).bind(...attUidBinds(uid), today).first();
      const attended_today = !!at;

      const row: any = await env.DB.prepare(
        `SELECT current_streak, longest_streak, last_check_date, gems, total_gems_earned FROM student_streaks WHERE student_uid = ?`
      ).bind(uid).first();

      // gems 는 체크인 보상 레이어이므로 보존. streak 수치만 출결 기준으로 동기화.
      const longest = Math.max(Number(row?.longest_streak || 0), attStreak);
      if (!row) {
        // 출결은 있는데 게임 row 가 없던 학생 → 리더보드 일관성 위해 streak row 생성 (gems=0)
        if (attStreak > 0) {
          await env.DB.prepare(
            `INSERT INTO student_streaks (student_uid, current_streak, longest_streak, last_check_date, gems, total_gems_earned, updated_at) VALUES (?,?,?,?,?,?,?)`
          ).bind(uid, attStreak, longest, attended_today ? today : null, 0, 0, now).run();
        }
      } else if (row.current_streak !== attStreak || row.longest_streak !== longest) {
        // 저장된 수치가 출결과 다르면 출결 기준으로 정합화 (gems/체크인일은 건드리지 않음)
        await env.DB.prepare(
          `UPDATE student_streaks SET current_streak = ?, longest_streak = ?, updated_at = ? WHERE student_uid = ?`
        ).bind(attStreak, longest, now, uid).run();
      }

      return json({
        ok: true,
        current_streak: attStreak,           // 출결 기반 "진짜 연속" (단일 권위)
        longest_streak: longest,
        gems: Number(row?.gems || 0),
        total_gems_earned: Number(row?.total_gems_earned || 0),
        last_check_date: row?.last_check_date || null,
        attended_today,                       // 오늘 실제 출석 여부 (출결 기준)
        checked_today: attended_today,        // 하위호환: 기존 필드명 유지
        source: 'attendance',
        today,
      });
    }

    // 🏷 리더보드 SQL — 아이디(student_uid)에 «학생 이름» 을 붙여서 돌려준다.
    //   student_streaks 에는 아이디만 있다(출결 attendance.user_id 를 그대로 씀).
    //   관리자 화면이 예전엔 erp-list 를 받아 클라에서 이름을 맞췄는데,
    //   실데이터는 students_erp 에 없는 아이디가 많아 이름 칸에 아이디가 그대로 찍혔다.
    //   → 이름의 출처를 서버 한 곳으로 모은다:
    //      ① students_erp (PK user_id 로 join — 인덱스 있음)
    //      ② 없으면 attendance.username (출결에 남은 이름. idx_attendance_user_date 사용)
    //      ③ 둘 다 없으면 null → 화면이 아이디로 대체 표기
    //   상위 20명만 CTE 로 먼저 자르고 join 하므로 비용은 종전 스캔 + α (실측 0.8ms).
    const STREAK_LEADERBOARD_SQL = `
      WITH top AS (
        SELECT student_uid, current_streak, longest_streak, gems
        FROM student_streaks
        ORDER BY current_streak DESC, gems DESC
        LIMIT 20
      )
      SELECT t.student_uid, t.current_streak, t.longest_streak, t.gems,
             COALESCE(
               NULLIF(TRIM(COALESCE(e.korean_name, e.student_name, e.username, '')), ''),
               (SELECT a.username FROM attendance a
                 WHERE a.user_id = t.student_uid
                   AND a.username IS NOT NULL AND TRIM(a.username) <> ''
                 ORDER BY a.id DESC LIMIT 1)
             ) AS student_name
      FROM top t
      LEFT JOIN students_erp e ON e.user_id = t.student_uid
      ORDER BY t.current_streak DESC, t.gems DESC`;

    if (method === 'GET' && path === '/api/streak/leaderboard') {
      await ensureStreakSchema();
      const rs = await env.DB.prepare(STREAK_LEADERBOARD_SQL).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // 🔁 관리자 수동 트리거 — 전 학생 streak 일괄 정합화 (출결 기준)
    //   야간 cron(KST 03:00)과 동일한 reconcileAllStreaks 를 즉시 1회 실행.
    //   인증: 상단 /api/admin/* 관리자 세션 미들웨어가 이미 401 게이트.
    //   POST = 실행, 실행 후 갱신된 리더보드 상위 20명을 함께 반환해 효과 확인.
    if (method === 'POST' && path === '/api/admin/streak/reconcile') {
      const rc = await reconcileAllStreaks(env);
      const rs = await env.DB.prepare(STREAK_LEADERBOARD_SQL).all();
      return json({ ok: true, reconciled: rc, leaderboard: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🔥 Phase ST 끝
    // ═══════════════════════════════════════════════════════════════

    const voiceResponse = await handleVoiceApi(request, url, env);
    if (voiceResponse) return voiceResponse;


    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase AV 끝
    // ═══════════════════════════════════════════════════════════════

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}

