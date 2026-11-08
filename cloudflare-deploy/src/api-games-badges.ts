// 배지 카탈로그·자동 지급·조회 API. 외부 액션도 같은 지급 함수를 사용한다.
import { json } from './api-util';
import { evaluationScoreProjection } from './evaluation-scores';
import type { MangoEnv } from './api-mango';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { ATTENDANCE_BY_UID, attUidBinds } from './attendance-uid';
import { computeAttendanceStreak } from './api-games-attendance-streak';

export const BADGE_CATALOG = [
      { code: 'first_login',       icon: '🎉', name: '첫 발걸음',         name_en: 'First Steps',          desc: '망고아이 첫 로그인',           desc_en: 'First login to Mangoi',                      rule: 'manual' },
      { code: 'first_class',       icon: '🎓', name: '첫 수업 입장',       name_en: 'First Class',          desc: '첫 화상수업 참여',             desc_en: 'Joined a first video class',                 rule: 'attendance_1' },
      { code: 'streak_7',          icon: '📅', name: '7일 연속 출석',      name_en: '7-Day Streak',         desc: '일주일 매일 출석',             desc_en: 'Attended every day for a week',              rule: 'streak_7' },
      { code: 'streak_30',         icon: '🔥', name: '30일 연속 출석',     name_en: '30-Day Streak',        desc: '한달 매일 출석',               desc_en: 'Attended every day for a month',             rule: 'streak_30' },
      { code: 'eval_perfect',      icon: '⭐', name: '평가서 만점',        name_en: 'Perfect Score',        desc: '확인된 평가서 종합 만점',             desc_en: 'Perfect score on a verified evaluation',       rule: 'eval_10' },
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
        const projection = await evaluationScoreProjection(env.DB);
        const e: any = await env.DB.prepare(`${projection} SELECT MAX(score_normalized_100) AS m FROM normalized_evaluations WHERE student_uid = ?`).bind(userId).first();
        if (e?.m === 100) await award('eval_perfect');
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


export async function handleBadgesApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
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



  return null;
}
