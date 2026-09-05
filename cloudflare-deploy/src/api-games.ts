// ═══════════════════════════════════════════════════════════════════════
// 🎮 api-games.ts — 게임/학습 도메인 API (api-mango.ts 에서 분리)
//   docs/REFACTOR_PLAN.md 1단계 · 2026-07-14 · 로직 무변경 이동
//   포함: 📚 Phase VOC (단어장+플래시카드+게이미피케이션 10라우트)
//         🧠 Phase ML  (마이크로러닝: AI동의어·자동퀴즈·카톡발송 8라우트)
//         🧩 Phase RQ  (복습퀴즈: 학생 6 + 관리자 6 라우트, 2026-07-14 2차 이동)
//         🎮 Phase BG + 🔥 Phase ST (배지·스트릭, 2026-07-14 3차 이동 — env 파라미터화)
//   라우트: /api/vocab/* + /api/admin/microlearn/* + /api/review-quiz/* + /api/admin/review-quiz/*
//   매칭 안 되면 null 반환 → handleMangoApi 가 나머지 라우팅 계속.
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { applyPointTransaction } from './api-points';   // 🧾 포인트는 원장(point_transactions)을 거친다
import { dailyAllowance } from './point-policy';        // 🧢 하루 총량 상한(100점)을 이 경로도 지난다
import { authUidFromRequest as authUidGlobal } from './auth-token';  // 🔐 소유자 검증(IDOR 방지)
import { resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정(게스트 예외+관리자/토큰)
import { recordJudgmentEvents, guessMisconception } from './api-judgment';  // 🧠 판단력 캡처(D3)
import { scoreVoiceCoach, scoreTier, analyzeAcoustic, applyAzurePronunciation } from './voice-score';  // 🗣 음성코치 결정론 채점(변별력 하니스 검증)
import { assessPronunciation } from './azure-pronunciation';  // 🎤 Azure 음소 발음평가(키 없으면 자동으로 건너뜀)
import type { MangoEnv } from './api-mango';
// ✒️ 문장 종결부호 정본 — 문제문·해설·읽을 문장에만 씁니다(2026-08-26).
//    ⛔ 보기(opts)는 「어려운」·「你好」·「go to school」 같은 «낱말·구» 라 찍지 않습니다.
//    ℹ️ answer_text 를 다듬어도 채점은 안 흔들립니다 — rqNorm 이 구두점을 통째로 지웁니다.
import { endSentence, PUNCTUATION_PROMPT_RULE } from './sentence-punct';
// 🈶 중국어 교재 이름 해석 정본 — 라이브러리(「다락원 중국어 마스터 3」)와 콘텐츠(「다락원」)의
//    표기가 달라 매칭이 영영 안 되던 것을 잇습니다. 표시 이름은 「중국어 마스터」(2026-08-26 사장님).
import { resolveZhTextbook, zhDisplayTextbook, zhDisplayDesc } from './zh-textbook';
import { filterQuizQuestions, summarizeRejects } from './quiz-quality';
import { BAND_SPECS, bandFromTextbookLevel } from './judgment-level';       // 📏 레벨별 문장 길이 정본  // 🧪 AI 문항 검사(2026-09-02)


// ═══════════════════════════════════════════════════════════════════════
// 🎮 게이미피케이션 공용부 — api-mango.ts 에서 이동 (3차, 2026-07-14)
//   checkAndAwardBadges 는 api-mango(영작 첨삭)도 import 해서 사용한다.
// ═══════════════════════════════════════════════════════════════════════
/**
 * 🔤 학생에게 글자를 보여줘도 되는지 — 인코딩이 깨진 문자열을 걸러냅니다.
 *   U+FFFD(replacement character)는 "여기 바이트를 못 읽었다"는 표시라, 한 글자라도 있으면
 *   그 문자열은 이미 원본을 잃은 것입니다(되살릴 수 없음). 화면에 내보내지 않습니다.
 *
 *   왜 필요한가 — 셸에서 한글을 인라인으로 POST 하면 EUC-KR 바이트가 그대로 저장됩니다
 *   (CLAUDE.md §2 함정). 그렇게 들어온 QA 데이터가 실제 학생 퀴즈의 보기로 새어 나온 사고가
 *   2026-08-03 에 있었습니다. 넣는 쪽을 다 막기는 어려우니 보여주는 쪽에서 한 번 더 거릅니다.
 *
 *   ⚠️ 리터럴 대신 String.fromCharCode(0xFFFD) 로 만듭니다 — 소스에 깨진 문자를 직접 박아 두면
 *      이 파일이 다른 인코딩으로 저장되는 순간 검사 자체가 조용히 망가집니다.
 */
export function isCleanText(s: any): boolean {
  if (s == null) return false;
  const t = String(s).trim();
  if (!t) return false;
  return t.indexOf(String.fromCharCode(0xFFFD)) === -1;
}

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
        const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS days FROM attendance WHERE user_id = ?`).bind(userId).first();
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

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase VOC — 단어장 + 플래시카드 (간격 반복 학습)
    // ═══════════════════════════════════════════════════════════════
    const ensureVocab = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_vocab_user_review ON vocabulary(user_id, next_review_at ASC)`); } catch {}
      // 게이미피케이션: 복습 이력(스트릭/미션/랭킹 계산용) + 포인트 지급 멱등 기록
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_review_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, vocab_id INTEGER, correct INTEGER NOT NULL, reviewed_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_vocab_log_user ON vocab_review_log(user_id, reviewed_at DESC)`); } catch {}
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_rewards (award_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT, amount INTEGER NOT NULL, created_at INTEGER NOT NULL);`);
    };
    // KST 기준 일수 (스트릭/일일미션 경계)
    const vocabKstDay = (t: number) => Math.floor((t + 32400000) / 86400000);

    // 🎁 게스트 체험: 복습게임·단어도감을 비로그인으로도 맛보게 하되, 하루 10분·총 3일까지만.
    //   (2026-07-26) IDOR 강화 이후 게스트가 아예 못 쓰게 막혀있던 것을 시간제한 체험으로 완화.
    const GUEST_TRIAL_MS = 10 * 60 * 1000;
    const GUEST_TRIAL_DAYS = 3;
    const ensureGuestTrial = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_guest_trial (uid TEXT NOT NULL, trial_day INTEGER NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY (uid, trial_day));`);
    };
    const checkGuestTrial = async (uid: string) => {
      await ensureGuestTrial();
      const now = Date.now();
      const today = vocabKstDay(now);
      const rows = ((await env.DB.prepare(`SELECT trial_day, started_at FROM vocab_guest_trial WHERE uid = ? ORDER BY trial_day ASC`).bind(uid).all()).results || []) as any[];
      const todayRow = rows.find(r => r.trial_day === today);
      if (todayRow) {
        const elapsed = now - todayRow.started_at;
        if (elapsed > GUEST_TRIAL_MS) {
          return { ok: false, error: 'guest_trial_expired', message: '오늘 체험 시간(10분)이 끝났어요! 로그인하면 계속 복습할 수 있어요.' };
        }
        return { ok: true, remaining_ms: GUEST_TRIAL_MS - elapsed, day_index: rows.findIndex(r => r.trial_day === today) + 1, days_total: GUEST_TRIAL_DAYS };
      }
      if (rows.length >= GUEST_TRIAL_DAYS) {
        return { ok: false, error: 'guest_trial_used_up', message: `체험 ${GUEST_TRIAL_DAYS}일을 모두 사용했어요! 로그인하면 계속 복습할 수 있어요.` };
      }
      // due·list 가 Promise.all 로 동시에 들어오면 오늘 첫 방문 시 둘 다 이 지점에 동시 도달 →
      // 같은 (uid, trial_day) 를 동시에 INSERT 하려다 PK 충돌. OR IGNORE + 재조회로 경쟁을 흡수.
      await env.DB.prepare(`INSERT OR IGNORE INTO vocab_guest_trial (uid, trial_day, started_at) VALUES (?, ?, ?)`).bind(uid, today, now).run();
      const fresh: any = await env.DB.prepare(`SELECT started_at FROM vocab_guest_trial WHERE uid = ? AND trial_day = ?`).bind(uid, today).first();
      const startedAt = (fresh && fresh.started_at) || now;
      return { ok: true, remaining_ms: Math.max(0, GUEST_TRIAL_MS - (now - startedAt)), day_index: rows.length + 1, days_total: GUEST_TRIAL_DAYS };
    };
    // /api/vocab/due·list 공용 게이트: admin/self=무제한, guest=체험 게이트, 그 외=차단
    const gateVocabOwner = async (uid: string) => {
      const scope = await resolveOwnerScope(request, url, env as any, uid);
      if (['admin', 'self'].includes(scope)) return { allow: true as const };
      if (scope === 'guest') {
        const trial = await checkGuestTrial(uid);
        if (!trial.ok) return { allow: false as const, error: trial.error!, message: trial.message! };
        return { allow: true as const, trial };
      }
      return { allow: false as const, error: 'auth_required', message: '로그인 후 본인 단어장만 조회할 수 있습니다.' };
    };

    // ── POST /api/vocab/add — 단어 추가 (AI 가 자동으로 한국어/예문 생성) ──
    if (method === 'POST' && path === '/api/vocab/add') {
      await ensureVocab();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      const word = String(b.word || '').trim();
      if (!userId || !word) return json({ ok: false, error: 'user_id_and_word_required' }, 400);
      let korean = String(b.korean || '').trim();
      let example = String(b.example || '').trim();
      // AI 가 한국어/예문 자동 생성 (옵션)
      if ((!korean || !example) && (env as any).AI) {
        try {
          const resp: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You output Korean meaning and short English example. JSON only.' },
              { role: 'user', content: `Word: "${word}"\n\nReturn JSON: { "korean": "<한국어 뜻 한줄>", "example": "<짧은 영어 예문 1개>" }` }
            ],
            max_tokens: 200,
          });
          let text = '';
          if (typeof resp === 'string') text = resp;
          else if (resp && typeof resp.response === 'string') text = resp.response;
          else if (resp && resp.response) text = JSON.stringify(resp.response);
          text = String(text || '');
          const m = text.match(/\{[\s\S]*\}/);
          if (m) { const j = JSON.parse(m[0]); korean = korean || j.korean || ''; example = example || j.example || ''; }
        } catch {}
      }
      const now = Date.now();
      await env.DB.prepare(`INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(userId, word, korean, example, 0, now, now).run();
      return json({ ok: true, word, korean, example });
    }

    // ── POST /api/vocab/extract — 파일(엑셀/워드/PDF/CSV/TXT)에서 텍스트 추출, 또는 텍스트→AI 단어쌍 추출 ──
    //   multipart(file) → { ok, text }  (Workers AI toMarkdown 으로 문서→마크다운 변환)
    //   JSON { text }   → { ok, items:[{word,korean}] }  (규칙 파싱 실패분을 AI 가 구조화)
    if (method === 'POST' && path === '/api/vocab/extract') {
      const ct = (request.headers.get('content-type') || '').toLowerCase();
      // (B) 텍스트 → AI 단어쌍 추출
      if (ct.includes('application/json')) {
        const b: any = await request.json().catch(() => ({}));
        const text = String(b.text || '').slice(0, 8000).trim();
        if (!text) return json({ ok: false, error: 'text_required' }, 400);
        if (!(env as any).AI) return json({ ok: false, error: 'ai_unavailable' }, 503);
        try {
          const resp: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You extract an English vocabulary list from messy text. Output ONLY a JSON array, no prose.' },
              { role: 'user', content: `Extract English vocabulary words (and their Korean meaning if present) from the text below.\nRules: word = single English word or short phrase (max 4 words). korean = Korean meaning if given in the text, else "".\nSkip sentences, headers, page numbers. Max 150 entries.\nReturn JSON array: [{"word":"...","korean":"..."}]\n\nTEXT:\n${text}` }
            ],
            max_tokens: 3000,
          });
          let out = '';
          if (typeof resp === 'string') out = resp;
          else if (resp && typeof resp.response === 'string') out = resp.response;
          else if (resp && resp.response) out = JSON.stringify(resp.response);
          const m = String(out || '').match(/\[[\s\S]*\]/);
          const arr = m ? JSON.parse(m[0]) : [];
          const items = (Array.isArray(arr) ? arr : []).map((x: any) => ({
            word: String(x?.word || '').trim().slice(0, 60),
            korean: String(x?.korean || '').trim().slice(0, 80),
          })).filter((x: any) => /[A-Za-z]/.test(x.word) && x.word.length >= 2).slice(0, 200);
          return json({ ok: true, items });
        } catch (e: any) {
          return json({ ok: false, error: 'ai_extract_failed' }, 500);
        }
      }
      // (A) 파일 → 텍스트 변환
      const form = await request.formData().catch(() => null);
      const file: any = form && form.get('file');
      if (!file || typeof file.arrayBuffer !== 'function') return json({ ok: false, error: 'file_required' }, 400);
      const fname = String(file.name || 'upload').toLowerCase();
      const ext = (fname.match(/\.([a-z0-9]+)$/) || [])[1] || '';
      if (ext === 'hwp' || ext === 'hwpx') {
        return json({ ok: false, error: 'hwp_not_supported', message: '한글(HWP) 파일은 아직 지원되지 않아요. 한글에서 "다른 이름으로 저장 → PDF/워드/엑셀"로 저장한 뒤 다시 올려주세요.' }, 415);
      }
      const buf = await file.arrayBuffer();
      if (buf.byteLength > 10 * 1024 * 1024) return json({ ok: false, error: 'file_too_large', message: '파일이 너무 커요 (최대 10MB).' }, 413);
      // 텍스트 계열은 그대로 디코딩
      if (['txt', 'csv', 'tsv', 'md'].includes(ext)) {
        let text = new TextDecoder('utf-8').decode(buf);
        // 한글 깨짐(�) 많으면 EUC-KR 재시도
        if ((text.match(/�/g) || []).length > 3) {
          try { text = new TextDecoder('euc-kr' as any).decode(buf); } catch {}
        }
        return json({ ok: true, text: text.slice(0, 20000), format: ext });
      }
      // 그 외(엑셀/워드/PDF 등)는 Workers AI 문서→마크다운 변환
      if (!(env as any).AI || typeof (env as any).AI.toMarkdown !== 'function') {
        return json({ ok: false, error: 'convert_unavailable', message: '이 형식은 현재 변환할 수 없어요. CSV/TXT 로 저장해 올려주세요.' }, 503);
      }
      try {
        const results: any = await (env as any).AI.toMarkdown([{ name: fname, blob: new Blob([buf], { type: file.type || 'application/octet-stream' }) }]);
        const first = Array.isArray(results) ? results[0] : results;
        const text = String(first?.data || '').trim();
        if (!text) return json({ ok: false, error: 'empty_result', message: '파일에서 글자를 찾지 못했어요.' }, 422);
        return json({ ok: true, text: text.slice(0, 20000), format: first?.format || ext });
      } catch (e: any) {
        return json({ ok: false, error: 'convert_failed', message: '파일 변환에 실패했어요. 엑셀은 .xlsx, 문서는 PDF 로 저장해 다시 시도해 주세요.' }, 422);
      }
    }

    // ── POST /api/vocab/bulk-add — 단어 일괄 추가 (중복 건너뜀 + 빈 뜻은 AI 일괄 생성) ──
    //   body: { user_id, items:[{word, korean?}] }  (1회 최대 60개, 클라이언트가 청크로 나눠 호출)
    if (method === 'POST' && path === '/api/vocab/bulk-add') {
      await ensureVocab();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      const raw: any[] = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
      if (!userId || !raw.length) return json({ ok: false, error: 'user_id_and_items_required' }, 400);
      // 정규화 + 배치 내 중복 제거
      const seen = new Set<string>();
      const items: { word: string; korean: string; example: string }[] = [];
      for (const x of raw) {
        const word = String(x?.word || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (!/[A-Za-z]/.test(word) || word.length < 2) continue;
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ word, korean: String(x?.korean || '').trim().slice(0, 80), example: String(x?.example || '').trim().slice(0, 200) });
      }
      if (!items.length) return json({ ok: false, error: 'no_valid_items' }, 400);
      // 이미 갖고 있는 단어는 건너뜀
      const existRs = await env.DB.prepare(`SELECT word FROM vocabulary WHERE user_id = ? LIMIT 3000`).bind(userId).all();
      const existing = new Set((existRs.results || []).map((r: any) => String(r.word || '').trim().toLowerCase()));
      const skipped: string[] = [];
      const fresh = items.filter(it => {
        if (existing.has(it.word.toLowerCase())) { skipped.push(it.word); return false; }
        return true;
      });
      // 빈 뜻/예문은 AI 가 한 번에 생성 (20개씩 묶음, 실패해도 추가는 진행)
      const needAi = fresh.filter(it => !it.korean || !it.example);
      if (needAi.length && (env as any).AI) {
        for (let i = 0; i < needAi.length; i += 20) {
          const chunk = needAi.slice(i, i + 20);
          try {
            const resp: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You output Korean meanings and short English examples for vocabulary words. JSON array only, no prose.' },
                { role: 'user', content: `For each word, give its Korean meaning (one short line) and one short simple English example sentence.\nWords: ${chunk.map(c => c.word).join(', ')}\nReturn JSON array in the same order: [{"word":"...","korean":"...","example":"..."}]` }
              ],
              max_tokens: 2500,
            });
            let out = '';
            if (typeof resp === 'string') out = resp;
            else if (resp && typeof resp.response === 'string') out = resp.response;
            else if (resp && resp.response) out = JSON.stringify(resp.response);
            const m = String(out || '').match(/\[[\s\S]*\]/);
            const arr: any[] = m ? JSON.parse(m[0]) : [];
            const byWord = new Map(arr.map((a: any) => [String(a?.word || '').trim().toLowerCase(), a]));
            for (const c of chunk) {
              const hit: any = byWord.get(c.word.toLowerCase());
              if (hit) {
                if (!c.korean) c.korean = String(hit.korean || '').trim().slice(0, 80);
                if (!c.example) c.example = String(hit.example || '').trim().slice(0, 200);
              }
            }
          } catch {}
        }
      }
      const now = Date.now();
      if (fresh.length) {
        const stmt = env.DB.prepare(`INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,?,?,?)`);
        await env.DB.batch(fresh.map(it => stmt.bind(userId, it.word, it.korean, it.example, 0, now, now)));
      }
      return json({ ok: true, added: fresh.length, skipped_dup: skipped.length, skipped, items: fresh });
    }

    // ── GET /api/vocab/list?uid=X — 학생 단어장 목록 (게스트=하루10분·총3일 체험) ──
    if (method === 'GET' && path === '/api/vocab/list') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const gate = await gateVocabOwner(uid);
      if (!gate.allow) return json({ ok: false, error: gate.error, message: gate.message }, 401);
      const rs = await env.DB.prepare(`SELECT id, word, korean, example, level, next_review_at, correct_count, wrong_count, created_at FROM vocabulary WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, words: rs.results || [], trial: gate.trial });
    }

    // ── GET /api/vocab/due?uid=X — 오늘 복습할 단어 (게스트=하루10분·총3일 체험) ──
    if (method === 'GET' && path === '/api/vocab/due') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const gate = await gateVocabOwner(uid);
      if (!gate.allow) return json({ ok: false, error: gate.error, message: gate.message }, 401);
      const now = Date.now();
      const rs = await env.DB.prepare(`SELECT id, word, korean, example, level FROM vocabulary WHERE user_id = ? AND next_review_at <= ? ORDER BY next_review_at ASC LIMIT 20`).bind(uid, now).all();
      return json({ ok: true, due_count: rs.results?.length || 0, words: rs.results || [], trial: gate.trial });
    }

    // ── POST /api/vocab/review — 단어 복습 결과 (correct/wrong → 다음 복습 일정 자동 조정) ──
    if (method === 'POST' && path === '/api/vocab/review') {
      await ensureVocab();
      const b: any = await request.json().catch(() => ({}));
      const id = parseInt(b.id, 10);
      const correct = !!b.correct;
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT user_id, level, correct_count, wrong_count FROM vocabulary WHERE id = ?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      /* 🔐 (2026-08-28) 그 단어의 «주인» 인지 확인한다 — 바로 아래 DELETE /api/vocab/:id 는
         같은 검사를 하는데 이 쓰기 경로만 빠져 있었다. 정수 id 를 훑으며 남의 단어에
         복습 기록을 밀어 넣어 그 학생의 복습 일정과 주간 단어왕 순위를 오염시킬 수 있었다. */
      if ((await resolveOwnerScope(request, url, env as any, String(row.user_id || ''), b)) === 'deny') {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      // 간격 반복: 정답 시 level+1, 오답 시 level=0 으로 리셋
      const newLevel = correct ? Math.min((row.level || 0) + 1, 7) : 0;
      // 다음 복습 간격 (일): 0=1, 1=2, 2=4, 3=7, 4=14, 5=30, 6=60, 7=120 (망각곡선 기반)
      const intervals = [1, 2, 4, 7, 14, 30, 60, 120];
      const nextDays = intervals[newLevel] || 1;
      const now = Date.now();
      const next = now + nextDays * 86400000;
      await env.DB.prepare(`UPDATE vocabulary SET level = ?, next_review_at = ?, last_reviewed_at = ?, correct_count = correct_count + ?, wrong_count = wrong_count + ? WHERE id = ?`)
        .bind(newLevel, next, now, correct ? 1 : 0, correct ? 0 : 1, id).run();
      // 스트릭/미션/랭킹 계산용 이력 (실패해도 복습 자체는 성공)
      try {
        await env.DB.prepare(`INSERT INTO vocab_review_log (user_id, vocab_id, correct, reviewed_at) VALUES (?,?,?,?)`)
          .bind(row.user_id, id, correct ? 1 : 0, now).run();
      } catch {}
      return json({ ok: true, new_level: newLevel, next_review_in_days: nextDays });
    }

    // ── POST /api/vocab/reward — 복습 포인트 적립 (멱등, 서버가 금액 계산/상한) ──
    //   body: { user_id, student_name?, kind: 'session'|'mission'|'speak', correct_count?, bonus?, session_id? }
    //   session: 정답당 10P + 콤보보너스(상한), mission: 하루 10단어 복습 시 50P (1일 1회), speak: 따라말하기 성공 20P
    if (method === 'POST' && path === '/api/vocab/reward') {
      await ensureVocab();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.user_id || '').trim();
      const kind = String(b.kind || '').trim();
      if (!uid || !['session', 'mission', 'speak'].includes(kind)) return json({ ok: false, error: 'user_id_and_valid_kind_required' }, 400);
      /* 🔐 (2026-08-28) 소유자 판정 — 바로 옆 /api/vocab/list·due 는 gateVocabOwner 로 막혀 있는데
         **정작 포인트를 주는 이 경로에만 아무 검사가 없었다.** uid 를 본문에서 그대로 받으므로
         무인증 요청이 남의 계정에도 포인트를 찍을 수 있었고, 그 포인트는 기프티콘으로 나간다.
         ⚠️ 게스트(guest_*)는 종전대로 통과 — 비로그인 체험 흐름은 안 깨진다.
         ⛔ kind:'session' 의 correct_count 를 본문 그대로 믿는 문제는 **따로 남아 있다**
            (일일 상한 안에서는 부풀릴 수 있다). 서버 집계로 바꾸는 건 별건 — 작업기록 참고. */
      if ((await resolveOwnerScope(request, url, env as any, uid, b)) === 'deny') {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      const now = Date.now();
      const today = vocabKstDay(now);
      const dayStart = today * 86400000 - 32400000;

      let amount = 0;
      let awardId = '';
      if (kind === 'mission') {
        // 오늘 실제로 10단어 이상 복습했는지 서버에서 검증
        const c: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM vocab_review_log WHERE user_id = ? AND reviewed_at >= ?`).bind(uid, dayStart).first();
        if ((c?.n || 0) < 10) return json({ ok: false, error: 'mission_not_complete', reviewed: c?.n || 0 }, 400);
        amount = 50;
        awardId = `vocab:mission:${uid}:${today}`;
      } else if (kind === 'speak') {
        amount = 20;
        awardId = `vocab:speak:${uid}:${String(b.session_id || now)}`;
      } else {
        const correct = Math.max(0, Math.min(parseInt(b.correct_count, 10) || 0, 20));
        const bonus = Math.max(0, Math.min(parseInt(b.bonus, 10) || 0, correct * 5)); // 콤보보너스 ≤ 정답×5P
        amount = correct * 10 + bonus;
        if (amount <= 0) return json({ ok: true, awarded: 0 });
        awardId = `vocab:session:${uid}:${String(b.session_id || now)}`;
      }
      // 일일 상한 400P (미션 50P 별도) — 무한 파밍 방지
      if (kind !== 'mission') {
        const s: any = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM vocab_rewards WHERE user_id = ? AND created_at >= ? AND kind != 'mission'`).bind(uid, dayStart).first();
        const remain = Math.max(0, 400 - (s?.t || 0));
        amount = Math.min(amount, remain);
        if (amount <= 0) return json({ ok: true, awarded: 0, daily_cap: true });
      }
      /* 🧢 (2026-09-01 사장님 결정) 하루 총량 100점을 **이 경로도 지난다.**
         그전에는 이 표의 자기 상한(단어장 400 · 복습퀴즈 500)만 걸려서, 정책이 「하루 100점」
         이라고 적혀 있는데 실제로는 열 배가 나가고 있었다(실효 1,050점).
         ⚠️ 막지 않고 «남은 만큼 깎아서» 준다 — 이 경로는 원래부터 그렇게 동작했고,
            한 판을 다 풀고 0점을 받는 쪽이 더 나쁘다.
         ⚠️ 상한 조회가 실패하면 전액을 돌려주므로 «조회 실패로 점수를 잃는» 일은 없다. */
      {
        const allow = await dailyAllowance(env as any, uid, 'vocab_review');
        amount = Math.min(amount, allow);
        if (amount <= 0) return json({ ok: true, awarded: 0, daily_cap: true });
      }
      // 멱등: 같은 award_id 는 1회만
      const ins = await env.DB.prepare(`INSERT OR IGNORE INTO vocab_rewards (award_id, user_id, kind, amount, created_at) VALUES (?,?,?,?,?)`)
        .bind(awardId, uid, kind, amount, now).run();
      if (!ins.meta || (ins.meta as any).changes === 0) return json({ ok: true, awarded: 0, duplicate: true });
      /* 🧾 (2026-09-01) 잔액만 올리던 것을 **원장(point_transactions)을 거치도록** 바꾼다.
         [왜] 그 전에는 이 적립이 원장에 한 줄도 안 남아서, **학생 본인의 포인트 내역**
           (최근 30건)·**학부모 대시보드**(최근 10건)·**관리자 월간 합계** 어디에도 안 보였다.
           잔액만 늘고 «왜 늘었는지» 가 없었다(실측: 원장 밖 적립 2,746점).
         ⚠️ 금액은 한 푼도 안 바뀐다 — 위의 하루 400점 상한이 이미 먼저 걸렸고,
            applyPointTransaction 자체는 상한을 걸지 않는다. 총량 상한 계산에서도 빼 둔다
            (point-policy.ts 의 CAP_UNCOUNTED_RULES — 넣고 빼는 것은 사장님 결정).
         ⚠️ rule_code 는 정책이 **이미 이름 붙여 둔 것**을 쓴다(GAME_QUIZ_RULES 의 'vocab_review').
            그동안 그 이름이 «적혀만 있고 아무도 안 쓰던» 상태였다. */
      /* 🔴 이름은 «진짜 이름이 있을 때만» 넘긴다 — 정본은 `student_name = COALESCE(?, student_name)`
         이라 빈 값 대신 uid 를 넘기면 **기존에 들어 있던 진짜 이름이 아이디로 바뀐다.**
         그 칸은 무인증 공개 리더보드가 그대로 내보내는데, 이 저장소는 「이름이 없을 때 아이디로
         폴백하지 말 것」을 명시적으로 못 박아 두었다(2026-08-28 무인증 수리) —
         비밀번호가 설정된 학생이 0명이라 **아이디를 아는 것이 곧 로그인**이기 때문이다.
         ⚠️ 2026-09-01 실측: student_points 88행 중 이미 12행이 이름 칸에 아이디를 갖고 있다.
            여기서 uid 를 넘기면 그 상태를 굳히게 된다. */
      const sname = String(b.student_name || '').trim();
      let rp: any = null;
      try {
        rp = await applyPointTransaction(env as any, {
          userId: uid, studentName: sname || undefined, type: 'earn', amount,
          reason: '단어장 학습 보상', ruleCode: 'vocab_review', meta: { kind, awardId },
        });
      } catch (e: any) {
        /* ⚠️ 옛 직접 UPSERT 는 «논리적 실패» 가 없었는데 정본에는 있다(잔액 조건·동시 첫 INSERT).
           여기서 던지면 요청이 통째로 500 이 된다 — 보상 하나 때문에 화면을 깨뜨리지 않는다.
           ⚠️ 다만 원장 INSERT 단계에서 실패하면 **잔액은 이미 올라간 뒤**라 고치려던 상태가
              그대로 재생산된다. 그래서 조용히 넘기지 않고 크게 남긴다. */
        console.error('[vocab-reward] 원장 적립 실패(잔액만 올랐을 수 있음):', uid, amount, e?.message);
      }
      const balRow: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id = ?`).bind(uid).first().catch(() => null);
      return json({ ok: true, awarded: amount, kind, balance: rp?.newBalance ?? (balRow?.balance ?? amount) });
    }

    // ── GET /api/vocab/stats?uid=X — 게임 대시보드 (스트릭/미션/성장/오늘포인트) ──
    if (method === 'GET' && path === '/api/vocab/stats') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const now = Date.now();
      const today = vocabKstDay(now);
      const dayStart = today * 86400000 - 32400000;
      const tot: any = await env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN level >= 5 THEN 1 ELSE 0 END),0) AS mastered, COALESCE(SUM(correct_count),0) AS lifetime_correct FROM vocabulary WHERE user_id = ?`).bind(uid).first();
      const td: any = await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS c FROM vocab_review_log WHERE user_id = ? AND reviewed_at >= ?`).bind(uid, dayStart).first();
      const pt: any = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM vocab_rewards WHERE user_id = ? AND created_at >= ?`).bind(uid, dayStart).first();
      const mi: any = await env.DB.prepare(`SELECT award_id FROM vocab_rewards WHERE award_id = ?`).bind(`vocab:mission:${uid}:${today}`).first();
      // 연속 복습일: KST 일수 DISTINCT 역방향 (오늘 또는 어제부터 이어진 만큼)
      let streak = 0;
      try {
        const days: any = await env.DB.prepare(`SELECT DISTINCT CAST((reviewed_at + 32400000) / 86400000 AS INTEGER) AS d FROM vocab_review_log WHERE user_id = ? ORDER BY d DESC LIMIT 90`).bind(uid).all();
        const ds = ((days.results || []) as any[]).map(r => Number(r.d));
        if (ds.length && (ds[0] === today || ds[0] === today - 1)) {
          streak = 1;
          for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) streak++;
        }
      } catch {}
      return json({
        ok: true,
        total_words: tot?.total || 0,
        mastered: tot?.mastered || 0,
        lifetime_correct: tot?.lifetime_correct || 0,
        today_reviewed: td?.n || 0,
        today_correct: td?.c || 0,
        points_today: pt?.t || 0,
        mission_done: !!mi,
        streak_days: streak,
      });
    }

    // ── GET /api/vocab/leaderboard?uid=X — 주간 단어왕 (최근 7일 정답 수 TOP 10 + 내 순위) ──
    if (method === 'GET' && path === '/api/vocab/leaderboard') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      const since = Date.now() - 7 * 86400000;
      /* 🔴 (2026-09-05) 이 엔드포인트는 «무인증 공개» 다 — 아이디를 내보내면 안 된다.
         [왜] 학생 로그인은 «비밀번호가 설정된 경우만» 검사하는데(api-students.ts) 실측상
              비밀번호가 있는 학생이 0명이다 → **아이디를 아는 것이 곧 로그인**이다.
              그런데 여기가 `user_id` 를 그대로 담고, 이름이 없으면 `COALESCE(..., l.user_id)`
              로 **이름 자리에까지 아이디를 넣어** 두 겹으로 새고 있었다.
         [경위] 2026-08-28 에 /api/points/leaderboard 를 같은 이유로 고치면서 그 주석에
              「단어왕 리더보드가 이미 그 방식이다」라고 적었지만 **사실이 아니었다** —
              이쪽은 안 고쳐져 있었다. 그 문장 때문에 아무도 다시 안 봤다.
         ⛔ user_id 를 되살리지 말 것. 이름이 없을 때 아이디로 폴백하지도 말 것.
            본인 표시는 서버가 판정해 `me` 로만 준다.
         ⛔ 게스트(guest_*)는 순위에서 뺀다 — 맛보기로 들어온 익명 이용자가 TOP 10 을
            차지하면 진짜 학생의 동기 장치가 죽는다(영작 랭킹·게임 분석도 같은 방식). */
      const rs = await env.DB.prepare(
        `SELECT l.user_id, sp.student_name AS name, SUM(l.correct) AS correct_count, COUNT(*) AS review_count
         FROM vocab_review_log l LEFT JOIN student_points sp ON sp.user_id = l.user_id
         WHERE l.reviewed_at >= ? AND LOWER(COALESCE(l.user_id,'')) NOT LIKE 'guest%'
         GROUP BY l.user_id HAVING SUM(l.correct) > 0
         ORDER BY correct_count DESC, review_count DESC LIMIT 50`
      ).bind(since).all();
      const rows = (rs.results || []) as any[];
      /* ⚠️ «정확일치» 다 — 대소문자를 무시하면 안 된다. `Kim`/`kim`(김민수)·`Lee`/`lee`(이병엽)
         처럼 대소문자만 다른 «별개 행» 이 실재하고(CLAUDE.md 2장), 둘 다 기록이 있으면
         두 줄에 「(나)」가 붙고 findIndex 가 먼저 만난 쪽을 집어 my_rank·my_correct 에
         «남의 숫자» 가 실린다. 로그인·lookup·set-password 네 곳도 「정확일치 먼저」다. */
      const same = (a: any) => !!uid && String(a || '') === uid;
      /* 🔴 (2026-09-05) 이름 칸이 «아이디 그 자체» 인 행이 실재한다 — D1 실측 student_points
         94행 중 **18행**(`jeong`·`lee`·`kang`·`Lee`…). 카페24에 이름이 없는 계정은 명부에
         아이디로 찍히기 때문이다. ⟹ user_id 를 뺐어도 **그 이름으로 아이디가 그대로 나간다.** */
      const showName = (r: any) => {
        const nm = String(r.name || '').trim();
        return (nm && nm !== String(r.user_id || '')) ? nm : null;
      };
      const top = rows.slice(0, 10).map((r, i) => ({ rank: i + 1, name: showName(r), correct: r.correct_count, reviews: r.review_count, me: same(r.user_id) }));
      let myRank = null, myCorrect = 0;
      const idx = rows.findIndex(r => same(r.user_id));
      if (idx >= 0) { myRank = idx + 1; myCorrect = rows[idx].correct_count; }
      return json({ ok: true, top, my_rank: myRank, my_correct: myCorrect, total_players: rows.length });
    }

    // ── DELETE /api/vocab/:id — 단어 삭제 ──
    if (method === 'DELETE' && /^\/api\/vocab\/\d+$/.test(path)) {
      await ensureVocab();
      const id = parseInt(path.split('/').pop() || '0', 10);
      // 🔐 [무결성/IDOR] 단어는 user_id 소유물 — 남의 단어를 정수 id 열거로 삭제하는 것을 차단 (2026-07-19 self-pentest).
      //   소유자 확인: 게스트(guest_*)는 통과(익명), 실계정은 토큰 uid 일치 OR 관리자.
      const vdRow: any = await env.DB.prepare(`SELECT user_id FROM vocabulary WHERE id = ?`).bind(id).first();
      if (!vdRow) return json({ ok: true, deleted: 0 });   // 이미 없음 — 멱등
      const vdOwner = String(vdRow.user_id || '');
      // 🔐 소유자(게스트 예외 + 관리자/토큰) — 토큰은 ?token= 쿼리(DELETE 라 body 없음)
      if ((await resolveOwnerScope(request, url, env as any, vdOwner)) === 'deny') {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      await env.DB.prepare(`DELETE FROM vocabulary WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // 📚 Phase VOC 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase ML — 마이크로러닝 (AI 동의어 + 자동 퀴즈 + 카톡)
    //   Phase VOC 의 단어장을 확장 — 동의어 자동, 자동 퀴즈 5문항, 카카오 발송
    // ═══════════════════════════════════════════════════════════════
    const ensureMicroLearnSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_synonyms (id INTEGER PRIMARY KEY AUTOINCREMENT, vocab_id INTEGER NOT NULL, synonym TEXT NOT NULL, meaning_ko TEXT, example TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocab_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, correct_index INTEGER NOT NULL, hint TEXT, source_word TEXT, quiz_type TEXT, completed INTEGER DEFAULT 0, user_answer INTEGER, is_correct INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS microlearn_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, parent_phone TEXT, content TEXT NOT NULL, channel TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
    };

    // ── POST /api/vocab/add-with-ai — 단어 + AI 동의어 + 의미·예문 자동 생성 ──
    if (method === 'POST' && path === '/api/vocab/add-with-ai') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || b.uid || '').trim();
      const word = String(b.word || '').trim();
      if (!userId || !word) return json({ ok: false, error: 'uid_and_word_required' }, 400);

      let korean = '', example = '', synonyms: any[] = [];
      if (env.AI) {
        const prompt = `For English word "${word}", provide JSON only:
{"korean":"<Korean meaning>","example":"<short English example sentence>","synonyms":[{"word":"<syn1>","meaning_ko":"<Korean>","example":"<sentence>"},{"word":"<syn2>","meaning_ko":"<Korean>","example":"<sentence>"},{"word":"<syn3>","meaning_ko":"<Korean>","example":"<sentence>"}]}`;
        try {
          const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct','@cf/meta/llama-3-8b-instruct'];
          let raw = '';
          for (const mdl of models) {
            try {
              const resp: any = await env.AI.run(mdl, { messages: [{ role:'user', content: prompt }], max_tokens: 600, temperature: 0.4 });
              if (typeof resp === 'string') raw = resp;
              else if (resp?.response) raw = typeof resp.response === 'string' ? resp.response : JSON.stringify(resp.response);
              if (raw) break;
            } catch (e: any) { console.error('[vocab-ai]', mdl, e?.message); }
          }
          const mm = raw.match(/\{[\s\S]*\}/);
          if (mm) {
            const parsed = JSON.parse(mm[0]);
            // ⛔ korean 은 «낱말 뜻» 이라 그대로. ✅ example 은 문장이라 종결부호를 보장합니다.
            korean = String(parsed.korean || '').trim();
            example = endSentence(String(parsed.example || '').trim());
            synonyms = (Array.isArray(parsed.synonyms) ? parsed.synonyms.slice(0,5) : [])
              .map((sy: any) => (sy && typeof sy === 'object') ? { ...sy, example: endSentence(String(sy.example || '').trim()) } : sy);
          }
        } catch (e: any) { console.error('[vocab-ai] failed:', e?.message); }
      }
      // 기본 폴백
      if (!korean) korean = '(AI 미생성)';
      if (!example) example = `I learned the word "${word}" today.`;

      const now = Date.now();
      const r: any = await env.DB.prepare(
        `INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`
      ).bind(userId, word, korean, example, now + 86400000, now).run();
      const vocabId = r.meta?.last_row_id;

      for (const s of synonyms) {
        try {
          await env.DB.prepare(
            `INSERT INTO vocab_synonyms (vocab_id, synonym, meaning_ko, example, created_at) VALUES (?,?,?,?,?)`
          ).bind(vocabId, String(s.word || '').trim(), String(s.meaning_ko || '').trim(), String(s.example || '').trim(), now).run();
        } catch {}
      }
      return json({ ok: true, id: vocabId, word, korean, example, synonyms });
    }

    // ── POST /api/vocab/auto-generate — AI가 학생 레벨/주제 기반 단어장 자동 생성 ──
    if (method === 'POST' && path === '/api/vocab/auto-generate') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || b.uid || '').trim();
      const level = String(b.level || 'A2').trim();
      const topic = String(b.topic || '').trim(); // 선택: 'school', 'food', 'travel' 등
      const count = Math.min(30, Math.max(5, Number(b.count) || 10));
      if (!userId) return json({ ok: false, error: 'uid_required' }, 400);
      if (!env.AI) return json({ ok: false, error: 'AI_binding_missing' }, 503);

      // 기존 단어 (중복 방지)
      const existRs: any = await env.DB.prepare(`SELECT word FROM vocabulary WHERE user_id = ?`).bind(userId).all();
      const existing = new Set((existRs.results || []).map((r: any) => String(r.word).toLowerCase()));

      const topicStr = topic ? ` related to "${topic}"` : '';
      const prompt = `Generate ${count + 5} useful English vocabulary words for a Korean student at CEFR level ${level}${topicStr}. For each word provide: English word, Korean meaning, short English example sentence.

Respond in strict JSON only:
{"words":[{"word":"...","korean":"...","example":"..."},...]}

Avoid these common already-known words: a, the, is, are, have, do, go.
Variety: mix of nouns, verbs, adjectives.`;

      let raw = '';
      const models = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/meta/llama-3.1-8b-instruct','@cf/meta/llama-3-8b-instruct'];
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, { messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.7 });
          if (typeof resp === 'string') raw = resp;
          else if (resp?.response) raw = typeof resp.response === 'string' ? resp.response : JSON.stringify(resp.response);
          if (raw) break;
        } catch (e: any) { console.error('[auto-gen]', m, e?.message); }
      }
      const mm = raw.match(/\{[\s\S]*\}/);
      let words: any[] = [];
      try { const p = JSON.parse(mm ? mm[0] : raw); words = Array.isArray(p.words) ? p.words : []; }
      catch (e: any) { console.error('[auto-gen] JSON parse failed:', e?.message, '| raw head:', raw.slice(0, 120)); }

      // 🛡️ 뜻(korean) 없는 단어는 버린다 — AI 가 example 만 주고 korean 을 비워서 응답하는 경우가 실제로 있었다.
      //    빈 뜻으로 저장되면 gen-quiz 의 출제 대상에서 영영 제외돼(뜻이 정답 보기라서),
      //    학생 입장에서는 "단어를 담았는데 퀴즈에 안 나오는" 상태가 된다. 그래서 저장 전에 거른다.
      //    (2026-08-03 조사: 운영 D1 에 이렇게 생긴 빈 뜻 90행 확인 — 시도 14회 중 9회)
      const aiTotal = words.length;
      words = words.filter((w: any) => String(w?.word || '').trim() && String(w?.korean || '').trim());
      if (aiTotal && words.length < aiTotal) {
        console.error(`[auto-gen] dropped ${aiTotal - words.length}/${aiTotal} AI words with no Korean meaning (level=${level}, topic=${topic || '-'})`);
      }

      // 폴백: AI 실패 시(또는 쓸 만한 단어가 하나도 안 남았을 때) 레벨별 기본 단어
      if (!words.length) {
        const fallback: any = {
          A1: [
            { word:'apple', korean:'사과', example:'I eat an apple every day.' },
            { word:'school', korean:'학교', example:'I go to school by bus.' },
            { word:'family', korean:'가족', example:'My family is very kind.' },
            { word:'friend', korean:'친구', example:'She is my best friend.' },
            { word:'happy', korean:'행복한', example:'I am happy today.' },
            { word:'book', korean:'책', example:'This book is interesting.' },
            { word:'study', korean:'공부하다', example:'I study English every day.' },
            { word:'water', korean:'물', example:'Please give me some water.' },
            { word:'morning', korean:'아침', example:'Good morning, everyone!' },
            { word:'play', korean:'놀다', example:'Children love to play games.' },
          ],
          A2: [
            { word:'travel', korean:'여행하다', example:'I want to travel around the world.' },
            { word:'enjoy', korean:'즐기다', example:'I enjoy reading books.' },
            { word:'weather', korean:'날씨', example:'The weather is nice today.' },
            { word:'remember', korean:'기억하다', example:'I remember my first day at school.' },
            { word:'practice', korean:'연습하다', example:'You should practice every day.' },
            { word:'decide', korean:'결정하다', example:'I decided to learn English.' },
            { word:'important', korean:'중요한', example:'Family is very important.' },
            { word:'beautiful', korean:'아름다운', example:'The sunset was beautiful.' },
            { word:'difficult', korean:'어려운', example:'This question is difficult.' },
            { word:'experience', korean:'경험', example:'I have a lot of experience.' },
          ],
          B1: [
            { word:'achieve', korean:'달성하다', example:'I want to achieve my goals.' },
            { word:'opportunity', korean:'기회', example:'This is a great opportunity.' },
            { word:'environment', korean:'환경', example:'We must protect the environment.' },
            { word:'consider', korean:'고려하다', example:'Please consider my opinion.' },
            { word:'culture', korean:'문화', example:'Korean culture is rich.' },
            { word:'challenge', korean:'도전', example:'Learning English is a challenge.' },
            { word:'communicate', korean:'의사소통하다', example:'We need to communicate clearly.' },
            { word:'recognize', korean:'인식하다', example:'I recognize his voice.' },
            { word:'improve', korean:'향상시키다', example:'I want to improve my skills.' },
            { word:'responsible', korean:'책임감 있는', example:'He is a responsible person.' },
          ],
          B2: [
            { word:'sustainable', korean:'지속 가능한', example:'We need a sustainable energy source.' },
            { word:'perspective', korean:'관점', example:'I see things from a different perspective.' },
            { word:'innovate', korean:'혁신하다', example:'Companies must innovate to survive.' },
            { word:'persistent', korean:'끈질긴', example:'Be persistent and you will succeed.' },
            { word:'comprehensive', korean:'포괄적인', example:'We need a comprehensive plan.' },
            { word:'collaborate', korean:'협력하다', example:'Teams collaborate to solve problems.' },
            { word:'demonstrate', korean:'보여주다', example:'She demonstrated her skills.' },
            { word:'fundamental', korean:'근본적인', example:'These are fundamental rights.' },
            { word:'integrate', korean:'통합하다', example:'We need to integrate new ideas.' },
            { word:'evident', korean:'명백한', example:'His talent is evident to all.' },
          ],
          C1: [
            { word:'paradigm', korean:'패러다임', example:'This is a new paradigm in education.' },
            { word:'ambiguous', korean:'애매한', example:'The instructions were ambiguous.' },
            { word:'mitigate', korean:'완화하다', example:'We must mitigate the risks.' },
            { word:'inevitable', korean:'불가피한', example:'Change is inevitable.' },
            { word:'leverage', korean:'활용하다', example:'We can leverage our resources.' },
            { word:'discrepancy', korean:'차이', example:'There is a discrepancy in the data.' },
            { word:'plausible', korean:'그럴듯한', example:'That is a plausible explanation.' },
            { word:'intricate', korean:'복잡한', example:'The design is intricate.' },
            { word:'unprecedented', korean:'전례없는', example:'These are unprecedented times.' },
            { word:'ubiquitous', korean:'어디에나 있는', example:'Smartphones are ubiquitous.' },
          ],
        };
        words = fallback[level] || fallback['A2'];
      }

      const now = Date.now();
      let added = 0, skipped = 0, skippedNoMeaning = 0;
      const inserted: any[] = [];
      for (const w of words.slice(0, count)) {
        const word = String(w.word || '').trim();
        const korean = String(w.korean || '').trim();
        if (!word || existing.has(word.toLowerCase())) { skipped++; continue; }
        // 위에서 이미 걸렀지만, 저장 직전에 한 번 더 막는다 (빈 뜻은 어떤 경로로도 DB 에 들어가지 않게)
        if (!korean) { skippedNoMeaning++; continue; }
        try {
          const r: any = await env.DB.prepare(
            `INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`
          ).bind(userId, word, korean, String(w.example || '').trim(), now + 86400000, now).run();
          inserted.push({ id: r.meta?.last_row_id, word, korean, example: w.example });
          added++;
        } catch (e: any) { skipped++; console.error('[auto-gen] insert failed:', word, e?.message || e); }
      }
      return json({ ok: true, added, skipped, skipped_no_meaning: skippedNoMeaning, level, topic, words: inserted });
    }

    // ── POST /api/vocab/gen-quiz — 학생 단어장 기반 자동 퀴즈 5문항 ──
    //   source: 'mywords'(기본, 약한 단어 가중 출제) | 'textbook'(en_vocab 어휘은행, 학생 레벨 밴드 매칭)
    if (method === 'POST' && path === '/api/vocab/gen-quiz') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || b.uid || '').trim();
      const count = Math.min(20, Math.max(1, Number(b.count) || 5));
      const source = String(b.source || 'mywords').trim();
      if (!userId) return json({ ok: false, error: 'uid_required' }, 400);

      let words: any[] = [];
      let band = '';
      if (source === 'textbook') {
        // 학생 배정 레벨(students_erp) → 어휘은행 난이도 밴드 매핑
        let lv = '';
        try {
          const s: any = await env.DB.prepare(`SELECT level, textbook FROM students_erp WHERE user_id = ? LIMIT 1`).bind(userId).first();
          lv = String(s?.level || s?.textbook || '').toLowerCase();
        } catch {}
        band = /c1|c2|b2|고급|상급|adv|[56]/.test(lv) ? 'hard' : /b1|중급|inter|[34]/.test(lv) ? 'mid' : 'easy';
        const rs: any = await env.DB.prepare(
          `SELECT id, en AS word, ko AS korean, NULL AS example FROM en_vocab WHERE active=1 AND type='word' AND band=? AND ko IS NOT NULL AND ko != '' ORDER BY RANDOM() LIMIT ?`
        ).bind(band, count).all();
        words = (rs.results || []) as any[];
        if (words.length < count) {
          const more: any = await env.DB.prepare(
            `SELECT id, en AS word, ko AS korean, NULL AS example FROM en_vocab WHERE active=1 AND type='word' AND band != ? AND ko IS NOT NULL AND ko != '' ORDER BY RANDOM() LIMIT ?`
          ).bind(band, count - words.length).all();
          words = words.concat((more.results || []) as any[]);
        }
        if (!words.length) return json({ ok: false, error: 'no_bank', message: '어휘은행이 비어있어요.' });
      } else {
        // 약한 단어 가중 출제: 오답 많을수록·정답 적을수록·미복습 단어 우선 (+무작위 지터로 매번 조금씩 변화)
        //   뜻이 빈 단어는 애초에 뽑지 않는다 — 뜻이 곧 정답 보기라 출제가 불가능하고,
        //   LIMIT 안을 빈 단어가 차지하면 멀쩡한 단어까지 밀려나 출제 수가 줄어든다.
        const rs: any = await env.DB.prepare(
          `SELECT id, word, korean, example FROM vocabulary
           WHERE user_id = ? AND korean IS NOT NULL AND TRIM(korean) != ''
           ORDER BY (COALESCE(wrong_count,0)*3 - COALESCE(correct_count,0)
                     + CASE WHEN last_reviewed_at IS NULL THEN 1 ELSE 0 END
                     + (ABS(RANDOM()) % 6)) DESC
           LIMIT ?`
        ).bind(userId, count).all();
        words = (rs.results || []) as any[];
        if (!words.length) {
          // "단어장이 비었다" 와 "단어는 있는데 뜻이 없어 못 낸다" 는 학생이 할 일이 다르므로 구분해서 알린다.
          const anyRow: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM vocabulary WHERE user_id = ?`).bind(userId).first();
          if (Number(anyRow?.n || 0) > 0) {
            console.error('[gen-quiz] user has words but none usable (empty korean):', userId, 'total=', anyRow?.n);
            return json({
              ok: false, error: 'no_usable_words',
              message: '단어장에 단어는 있지만 뜻이 저장되지 않아 문제를 만들 수 없어요. 단어를 다시 추가해주세요!',
              message_en: 'Your list has words, but their meanings were not saved, so no questions can be made. Please add the words again!',
            });
          }
          return json({
            ok: false, error: 'no_words',
            message: '단어장이 비어있어요. 단어를 먼저 추가해주세요!',
            message_en: 'Your vocab list is empty. Please add some words first!',
          });
        }
      }

      // 오답 선택지 풀 (은행 출제면 은행에서, 내 단어장이면 전체 학생 단어에서)
      //   ⚠️ 2026-08-03: 학생 화면에 보기 하나가 대체문자(U+FFFD)로 깨져 나온 사고.
      //     원인은 두 겹이었습니다.
      //       ① QA 계정(`__qa_vocab_...`)이 셸에서 한글을 인라인으로 넣어 EUC-KR 바이트가 그대로 저장됨
      //          (CLAUDE.md §2 '셸에서 한글 POST' 함정)
      //       ② 오답 풀이 `user_id != ?` 라 **다른 사람 전부**를 긁어와, QA·테스트 계정 데이터가
      //          실제 학생 문제의 보기로 새어 들어감
      //     ②가 진짜 원인입니다. 깨진 행을 지워도 테스트 계정이 또 생기면 그대로 재발합니다.
      //     그래서 여기서 두 가지를 막습니다 — 내부(`__`) 계정 제외 + 깨진 문자(U+FFFD) 제외.
      const distRs: any = source === 'textbook'
        ? await env.DB.prepare(`SELECT ko AS korean FROM en_vocab WHERE active=1 AND type='word' AND ko IS NOT NULL AND ko != '' AND ko NOT LIKE '%'||char(65533)||'%' ORDER BY RANDOM() LIMIT 60`).all()
        : await env.DB.prepare(`SELECT korean FROM vocabulary WHERE user_id != ? AND korean IS NOT NULL AND korean != '' AND korean NOT LIKE '%'||char(65533)||'%' AND user_id NOT LIKE '\\_\\_%' ESCAPE '\\' ORDER BY RANDOM() LIMIT 60`).bind(userId).all();
      // 마지막 방어선 — DB 필터를 빠져나온 깨진 문자열은 여기서 버립니다(어느 경로로 들어왔든).
      const distractors = (distRs.results || []).map((x: any) => x.korean).filter((s: any) => isCleanText(s));
      const myDistractors = words.map(w => w.korean).filter((s: any) => isCleanText(s));

      const now = Date.now();
      const quizzes: any[] = [];
      for (const w of words) {
        // 정답(뜻)이 깨진 단어는 아예 출제하지 않습니다 — 문제 자체가 읽을 수 없게 되므로.
        //   (그 단어는 학생 단어장에는 그대로 남아 있어 확인·수정할 수 있습니다)
        if (!isCleanText(w.korean)) continue;
        const pool = [...distractors, ...myDistractors].filter(d => d !== w.korean);
        // 중복 제거 + 셔플 + 3개 선택
        const uniq = [...new Set(pool)];
        for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [uniq[i],uniq[j]] = [uniq[j],uniq[i]]; }
        const wrong = uniq.slice(0, 3);
        const opts = [w.korean, ...wrong];
        for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [opts[i],opts[j]] = [opts[j],opts[i]]; }
        const correctIndex = opts.indexOf(w.korean);

        const r: any = await env.DB.prepare(
          `INSERT INTO vocab_quizzes (user_id, question, options, correct_index, hint, source_word, quiz_type, created_at) VALUES (?,?,?,?,?,?,?,?)`
        ).bind(userId, `"${w.word}" 의 한국어 뜻은?`, JSON.stringify(opts), correctIndex, w.example || null, w.word, 'word_to_korean', now).run();
        quizzes.push({
          id: r.meta?.last_row_id,
          question: `"${w.word}" 의 한국어 뜻은?`,
          options: opts,
          correct_index: correctIndex,
          hint: w.example || '',
          source_word: w.word,
        });
      }

      // 🚫 거짓 성공 금지: 뜻이 전부 비었거나 깨져서 한 문제도 못 만든 경우,
      //    quizzes:[] 를 ok:true 로 내보내면 화면이 "성공"으로 판단해
      //    문제를 하나도 보여주지 않은 채 0점 결과창으로 떨어진다.
      //    "단어장이 빔"(no_words) 과 달리 학생이 할 일이 다르므로 코드를 나눠 안내한다.
      if (!quizzes.length) {
        console.error('[gen-quiz] produced 0 quizzes from', words.length, 'words (source=' + source + ') uid=', userId);
        return json({
          ok: false, error: 'no_usable_words',
          message: '지금은 문제를 만들 수 없어요. 뜻이 있는 단어를 추가한 뒤 다시 시도해주세요!',
          message_en: 'No questions could be made right now. Please add words that have meanings and try again!',
        });
      }

      return json({ ok: true, quizzes, total: quizzes.length, source, band });
    }

    // ── POST /api/vocab/quiz-submit — 퀴즈 답 제출 + 채점 ──
    if (method === 'POST' && path === '/api/vocab/quiz-submit') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const quizId = Number(b.quiz_id);
      const answer = Number(b.answer);
      if (!quizId || isNaN(answer)) return json({ ok: false, error: 'quiz_id_and_answer_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT user_id, correct_index, source_word FROM vocab_quizzes WHERE id = ?`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      const isCorrect = row.correct_index === answer;
      await env.DB.prepare(
        `UPDATE vocab_quizzes SET completed = 1, user_answer = ?, is_correct = ?, completed_at = ? WHERE id = ?`
      ).bind(answer, isCorrect ? 1 : 0, Date.now(), quizId).run();
      // 정답/오답 카운트 갱신 + 복습 이력(vocab_review_log → 일일미션·스트릭·주간랭킹 공용)
      if (row.source_word) {
        try {
          await env.DB.prepare(isCorrect
            ? `UPDATE vocabulary SET correct_count = correct_count + 1, last_reviewed_at = ? WHERE user_id = ? AND word = ?`
            : `UPDATE vocabulary SET wrong_count = wrong_count + 1, last_reviewed_at = ? WHERE user_id = ? AND word = ?`
          ).bind(Date.now(), row.user_id, row.source_word).run();
        } catch {}
        try {
          const v: any = await env.DB.prepare(`SELECT id FROM vocabulary WHERE user_id = ? AND word = ?`).bind(row.user_id, row.source_word).first();
          await env.DB.prepare(`INSERT INTO vocab_review_log (user_id, vocab_id, correct, reviewed_at) VALUES (?,?,?,?)`)
            .bind(row.user_id, v?.id || null, isCorrect ? 1 : 0, Date.now()).run();
        } catch {}
      }
      return json({ ok: true, correct: isCorrect, correct_index: row.correct_index });
    }

    // ── POST /api/admin/microlearn/send-one — 학생 1명에게 마이크로러닝 카톡 발송 ──
    if (method === 'POST' && path === '/api/admin/microlearn/send-one') {
      await ensureMicroLearnSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);

      // 무작위 단어 1개 + 동의어 추출
      const w: any = await env.DB.prepare(
        `SELECT id, word, korean, example FROM vocabulary WHERE user_id = ? ORDER BY RANDOM() LIMIT 1`
      ).bind(uid).first();
      if (!w) return json({ ok: false, error: 'no_words', message: '발송할 단어가 없습니다. 학생의 단어장에 단어를 먼저 추가해주세요.' });
      const syns: any = await env.DB.prepare(`SELECT synonym, meaning_ko FROM vocab_synonyms WHERE vocab_id = ? LIMIT 3`).bind(w.id).all();
      const synList = (syns.results || []).map((s: any) => `${s.synonym} (${s.meaning_ko || '-'})`).join(', ');

      // 부모 전화번호
      let parentPhone = '';
      try {
        const s: any = await env.DB.prepare(`SELECT parent_phone FROM students_erp WHERE user_id = ?`).bind(uid).first();
        parentPhone = s?.parent_phone || '';
      } catch {}

      const msg = `🥭 오늘의 단어 [${w.word}]
━━━━━━━━━━━━━━
📖 뜻: ${w.korean || '-'}
✍️ 예문: ${w.example || '-'}
${synList ? `\n🔗 비슷한 표현: ${synList}` : ''}

💡 미니 퀴즈로 확인해보세요!
앱에서 "${w.word}" 단어 카드 + 퀴즈를 풀어보세요.`;

      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO microlearn_logs (user_id, parent_phone, content, channel, sent_at, status) VALUES (?,?,?,?,?,?)`
      ).bind(uid, parentPhone, msg, 'kakao', now, parentPhone ? 'queued' : 'no_phone').run();
      return json({ ok: true, sent: parentPhone ? 1 : 0, message: msg, parent_phone: parentPhone, word: w.word });
    }

    // ── POST /api/admin/microlearn/send-all — 모든 학생에게 일괄 발송 ──
    if (method === 'POST' && path === '/api/admin/microlearn/send-all') {
      await ensureMicroLearnSchema();
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_phone TEXT);`); } catch {}
      const rs: any = await env.DB.prepare(`SELECT DISTINCT user_id FROM vocabulary`).all();
      const list = (rs.results || []) as any[];
      let sent = 0, failed = 0;
      const now = Date.now();
      for (const r of list) {
        try {
          const w: any = await env.DB.prepare(`SELECT id, word, korean, example FROM vocabulary WHERE user_id = ? ORDER BY RANDOM() LIMIT 1`).bind(r.user_id).first();
          if (!w) { failed++; continue; }
          const s: any = await env.DB.prepare(`SELECT parent_phone FROM students_erp WHERE user_id = ?`).bind(r.user_id).first();
          const phone = s?.parent_phone || '';
          const msg = `🥭 오늘의 단어 [${w.word}]\n📖 뜻: ${w.korean || '-'}\n✍️ ${w.example || '-'}\n\n💡 망고아이 앱에서 미니 퀴즈로 확인하세요!`;
          await env.DB.prepare(`INSERT INTO microlearn_logs (user_id, parent_phone, content, channel, sent_at, status) VALUES (?,?,?,?,?,?)`)
            .bind(r.user_id, phone, msg, 'kakao', now, phone ? 'queued' : 'no_phone').run();
          if (phone) sent++; else failed++;
        } catch { failed++; }
      }
      return json({ ok: true, total: list.length, sent, no_phone: failed });
    }

    // ── GET /api/admin/microlearn/logs — 발송 기록 ──
    if (method === 'GET' && path === '/api/admin/microlearn/logs') {
      await ensureMicroLearnSchema();
      const rs: any = await env.DB.prepare(`SELECT id, user_id, parent_phone, content, status, sent_at FROM microlearn_logs ORDER BY sent_at DESC LIMIT 100`).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── GET /api/vocab/synonyms?vocab_id=N — 단어의 동의어 목록 ──
    if (method === 'GET' && path === '/api/vocab/synonyms') {
      await ensureMicroLearnSchema();
      const vid = Number(url.searchParams.get('vocab_id'));
      if (!vid) return json({ ok: false, error: 'vocab_id_required' }, 400);
      const rs: any = await env.DB.prepare(`SELECT id, synonym, meaning_ko, example FROM vocab_synonyms WHERE vocab_id = ?`).bind(vid).all();
      return json({ ok: true, items: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🧠 Phase ML 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 🧩 Phase RQ — 복습퀴즈 (관리자 출제 → 학생 풀이 + 자동 채점/기록)
    //   관리자: /api/admin/review-quiz/{list,save,toggle,results}, DELETE /api/admin/review-quiz/:id
    //   학생  : /api/review-quiz/{list,get,submit}  (get 은 정답 미포함, 채점은 서버에서)
    // ═══════════════════════════════════════════════════════════════
    const ensureReviewQuizTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS review_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, questions TEXT NOT NULL, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS review_quiz_results (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL, user_id TEXT NOT NULL, user_name TEXT, score INTEGER NOT NULL, total INTEGER NOT NULL, answers TEXT, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_rq_results_quiz ON review_quiz_results(quiz_id, created_at DESC);`); } catch {}
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_rq_results_user ON review_quiz_results(user_id, created_at DESC);`); } catch {}
      // Phase RQ2 — 레벨/교재/레슨 매칭 + AI 자동출제 메타 컬럼
      for (const col of ['level TEXT', 'textbook TEXT', 'lesson_no INTEGER', "source TEXT DEFAULT 'manual'", 'draw TEXT']) {
        try { await env.DB.exec(`ALTER TABLE review_quizzes ADD COLUMN ${col};`); } catch {}
      }
      // Phase RQ3 (2026-07-31) — 언어 컬럼. NULL = 기존 영어 퀴즈(하위호환), 'zh' = 중국어.
      try { await env.DB.exec(`ALTER TABLE review_quizzes ADD COLUMN lang TEXT;`); } catch {}
      // 웜업 개인화(warmup-graph.ts) — 제출 시 채점 상세(JSON)를 보존해 오답 문장을 정확히 추출
      try { await env.DB.exec(`ALTER TABLE review_quiz_results ADD COLUMN detail TEXT;`); } catch {}
    };
    // 문항 검증 (Phase RQ2 — 유형: choice 객관식 / listen 듣기 / write 쓰기 / speak 말하기)
    //   choice/listen: { type, q, opts:[2~6], answer:index, explain?, audio_text(listen 필수) }
    //   write        : { type, q, answer_text, accept?:string[], explain? }
    //   speak        : { type, q?, answer_text(말할 문장), explain? }
    const rqParseQuestions = (raw: any): { ok: boolean; error?: string; list?: any[] } => {
      let list: any[] = [];
      if (Array.isArray(raw)) list = raw;
      else { try { list = JSON.parse(String(raw || '[]')); } catch { return { ok: false, error: 'questions_invalid_json' }; } }
      if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'questions_required' };
      const clean: any[] = [];
      for (const q of list) {
        const type = ['choice', 'listen', 'write', 'speak'].includes(String(q?.type)) ? String(q.type) : 'choice';
        // ✒️ 문장인 칸만 종결부호를 보장합니다. 한국어는 종결어미로 «?»·«.» 를 가르고,
        //    「…단어는」처럼 판정이 안 서면 endSentence 가 손대지 않고 그대로 돌려줍니다.
        const explain = endSentence(String(q?.explain || '').trim());
        let text = endSentence(String(q?.q || '').trim());
        if (type === 'choice' || type === 'listen') {
          // ⛔ choice 의 보기는 「어려운」·「你好」 같은 낱말이라 그대로 둡니다.
          // ✅ listen 의 보기만 «들려준 문장 + 오답 문장» 이라 문장으로 다듬습니다 —
          //    대본(audio_text)과 정답 보기가 «마침표 하나 차이» 로 어긋나지 않게 둘을 함께 처리합니다.
          const opts = Array.isArray(q?.opts)
            ? q.opts.map((o: any) => { const v = String(o || '').trim(); return type === 'listen' ? endSentence(v) : v; })
            : [];
          const answer = Number(q?.answer);
          if (type === 'listen' && !text) text = '🎧 잘 듣고 알맞은 답을 고르세요.';
          if (!text) return { ok: false, error: 'question_text_required' };
          if (opts.length < 2 || opts.length > 6 || opts.some((o: string) => !o)) return { ok: false, error: 'options_required' };
          if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length) return { ok: false, error: 'answer_index_invalid' };
          const audioText = String(q?.audio_text || '').trim();
          if (type === 'listen' && !audioText) return { ok: false, error: 'audio_text_required' };
          const item: any = { type, q: text, opts, answer, explain };
          if (type === 'listen') item.audio_text = endSentence(audioText.slice(0, 300));
          clean.push(item);
        } else {
          const answerText = String(q?.answer_text || '').trim();
          if (!answerText) return { ok: false, error: 'answer_text_required' };
          if (type === 'speak' && !text) text = '🎤 아래 문장을 또박또박 읽어보세요.';
          if (type === 'write' && !text) return { ok: false, error: 'question_text_required' };
          const accept = (Array.isArray(q?.accept) ? q.accept : []).map((a: any) => String(a || '').trim()).filter((a: string) => !!a).slice(0, 8);
          clean.push({ type, q: text, answer_text: endSentence(answerText.slice(0, 300)), accept, explain });
        }
      }
      return { ok: true, list: clean };
    };
    // 채점 보조 — 텍스트 정규화 + 단어 일치율
    // 🈶 (2026-07-31) 한자(一-鿿) 를 허용문자에 추가 — 원래는 중국어를 전부 걸러내서
    //   쓰기/말하기 채점이 항상 빈 문자열끼리 비교돼 정답이어도 오답 처리됐다.
    // 🔤 (2026-08-21) 병음의 «성조 부호» 를 먼저 벗긴다.
    //   그 전에는 dǎgōng 이 허용문자(a-z) 밖이라 통째로 공백이 되어 «d g ng» 이 됐고,
    //   학생이 dagong 이라고 치면 영원히 오답이었다. 그래서 write 문항의 accept 에 병음을
    //   넣어 둔 것이 «있는 척만» 하고 실제로는 한자를 직접 칠 수 있는 사람만 풀 수 있었다.
    //   ⚠️ NFD 로 분해한 뒤 «반드시» NFC 로 되돌려야 한다 — 한글이 자모로 쪼개진 채 남으면
    //      아래 가-힣 범위에 안 걸려 한국어 답이 통째로 사라진다.
    const rqStripTone = (s: string) => { try { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC'); } catch { return s; } };
    const rqNorm = (s: any) => rqStripTone(String(s || '').toLowerCase()).replace(/[^a-z0-9가-힣一-鿿\s']/g, ' ').replace(/\s+/g, ' ').trim();
    // 🈶 중국어는 띄어쓰기가 없어 공백 분리로 쪼개면 문장 전체가 토큰 1개가 되어 부분점수 없이
    //   전부/전무로만 채점된다(발음 인식의 사소한 오차에도 0점). 한자가 섞이면 글자 단위로 쪼갠다.
    const rqTokenize = (s: string) => {
      const norm = rqNorm(s);
      if (/[一-鿿]/.test(norm)) return norm.replace(/\s+/g, '').split('');
      return norm.split(' ').filter(Boolean);
    };
    const rqWordAcc = (target: string, said: string) => {
      const t = rqTokenize(target);
      const s = rqTokenize(said);
      if (!t.length) return 0;
      const pool = s.slice();
      let hit = 0;
      for (const w of t) { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } }
      return hit / t.length;
    };
    // 학생에게 안전한 문항 형태 (정답/듣기 원문 제외)
    const rqSafeQuestions = (qs: any[]) => qs.map((q: any, i: number) => {
      const type = q.type || 'choice';
      const out: any = { idx: i, type, q: q.q };
      if (type === 'choice' || type === 'listen') out.opts = q.opts;
      if (type === 'speak') out.target = q.answer_text;
      if (type === 'listen') out.has_audio = true;
      return out;
    });
    // 🎲 랜덤 출제(draw) — 유형별로 무작위 N개 뽑되 원본 bank index(idx) 보존
    const rqSafeOne = (q: any, i: number) => {
      const type = q.type || 'choice';
      const out: any = { idx: i, type, q: q.q };
      if (type === 'choice' || type === 'listen') out.opts = q.opts;
      if (type === 'speak') out.target = q.answer_text;
      if (type === 'listen') out.has_audio = true;
      return out;
    };
    const rqShuffle = (arr: any[]) => { const a = arr.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); const t = a[k]; a[k] = a[j]; a[j] = t; } return a; };
    const rqDrawIndices = (qs: any[], draw: any) => {
      const by: any = { listen: [], speak: [], choice: [], write: [] };
      qs.forEach((q: any, i: number) => { const t = (q && q.type) || 'choice'; (by[t] || by.choice).push(i); });
      let out: number[] = [];
      out = out.concat(rqShuffle(by.listen).slice(0, draw.listen || 0));
      out = out.concat(rqShuffle(by.speak).slice(0, draw.speak || 0));
      out = out.concat(rqShuffle(by.choice).slice(0, draw.choice || 0));
      out = out.concat(rqShuffle(by.write).slice(0, draw.write || 0));
      return rqShuffle(out);
    };
    // 채점 (유형별) — answers[i]: choice/listen=보기 index, write/speak=텍스트
    const rqGrade = (qs: any[], answers: any[]) => {
      let score = 0;
      const detail = qs.map((q: any, i: number) => {
        const type = q.type || 'choice';
        const a = answers[i];
        if (type === 'choice' || type === 'listen') {
          const ans = (a == null || a === '') ? NaN : Number(a);   // fix: 무응답(null/빈값)을 0으로 오채점하지 않도록 NaN 처리
          const correct = Number.isInteger(ans) && ans === Number(q.answer);
          if (correct) score++;
          const d: any = { idx: i, type, correct, your_answer: Number.isInteger(ans) ? ans : null, answer: Number(q.answer), explain: q.explain || '' };
          if (type === 'listen') d.audio_text = q.audio_text || '';
          return d;
        }
        const said = String(a == null ? '' : a).slice(0, 500);
        let accuracy = Math.round(rqWordAcc(q.answer_text, said) * 100);
        let correct = false;
        if (type === 'write') {
          const cands = [rqNorm(q.answer_text), ...((q.accept || []).map((x: string) => rqNorm(x)))].filter(Boolean);
          correct = !!said.trim() && (cands.includes(rqNorm(said)) || accuracy >= 85);
          if (correct) accuracy = Math.max(accuracy, 100 * Number(cands.includes(rqNorm(said))) || accuracy);
        } else {
          correct = accuracy >= 60;
        }
        if (correct) score++;
        return { idx: i, type, correct, accuracy, your_text: said, answer_text: q.answer_text, explain: q.explain || '' };
      });
      return { score, detail };
    };
    // 🈶 (2026-07-31) 중국어 복습퀴즈 그라운딩용 실제 어휘 샘플 — zh_vocab(다락원 Lv3 등, 검수된 실교재 데이터)
    //   AI가 존재하지 않는 한자/병음을 지어내지 않도록, 실제 DB 어휘를 골라 프롬프트에 그대로 박아 넣는다.
    const rqZhVocabSample = async (level?: string, textbook?: string, lessonNo?: number | null) => {
      const tries: Array<{ sql: string; binds: any[] }> = [];
      if (textbook && lessonNo) tries.push({ sql: `SELECT hanzi, pinyin, ko FROM zh_vocab WHERE active=1 AND LOWER(textbook)=LOWER(?) AND lesson_no=? ORDER BY RANDOM() LIMIT 24`, binds: [textbook, lessonNo] });
      if (textbook) tries.push({ sql: `SELECT hanzi, pinyin, ko FROM zh_vocab WHERE active=1 AND LOWER(textbook)=LOWER(?) ORDER BY RANDOM() LIMIT 24`, binds: [textbook] });
      if (level) tries.push({ sql: `SELECT hanzi, pinyin, ko FROM zh_vocab WHERE active=1 AND LOWER(level)=LOWER(?) ORDER BY RANDOM() LIMIT 24`, binds: [level] });
      tries.push({ sql: `SELECT hanzi, pinyin, ko FROM zh_vocab WHERE active=1 ORDER BY RANDOM() LIMIT 24`, binds: [] });
      for (const t of tries) {
        try {
          const rs = await env.DB.prepare(t.sql).bind(...t.binds).all();
          const rows = (rs.results as any[]) || [];
          if (rows.length >= 8) return rows;
        } catch {}
      }
      return [];
    };
    /* 🈶 (2026-08-26) 중국어 «콘텐츠» 교재 표기 목록 — zh_passage·zh_vocab 에 실제로 있는 이름.
     *   교재 이름 해석(zh-textbook.ts)의 후보로 쓴다. ⛔ 이름을 코드에 하드코딩하지 않는 이유가 이것.
     *   ⚠️ active=1 을 «일부러» 안 건다 — 하는 일이 «중국어인지 알아보기» 라 넓게 잡는 쪽이 안전하다
     *      (좁게 잡으면 비활성 과만 있는 교재가 «영어» 로 새어 나간다).
     *   ⚠️ 표가 없을 수도 있으니 각각 try 로 감싼다 — 한쪽이 없다고 영어 수업까지 멈추면 안 된다. */
    let _zhBookCache: string[] | null = null;
    const loadZhTextbookNames = async (): Promise<string[]> => {
      if (_zhBookCache) return _zhBookCache;
      const out = new Set<string>();
      for (const t of ['zh_passage', 'zh_vocab']) {
        try {
          const rs: any = await env.DB.prepare(`SELECT DISTINCT textbook FROM ${t} WHERE textbook IS NOT NULL AND textbook <> ''`).all();
          for (const r of (((rs.results as any[]) || []))) { const v = String(r.textbook || '').trim(); if (v) out.add(v); }
        } catch {}
      }
      _zhBookCache = Array.from(out);
      return _zhBookCache;
    };
    // 🈶 (2026-07-31) zh_passage(다락원 과별 본문 — 사람이 직접 쓴 지문+정답 있는 이해문제) 조회.
    //   textbook+lesson 정확매칭 우선, 없으면 그 교재의 첫 과(제일 낮은 lesson_no)로.
    const rqZhPassageFind = async (textbook?: string, level?: string, lessonNo?: number | null) => {
      if (textbook && lessonNo) {
        const r: any = await env.DB.prepare(`SELECT * FROM zh_passage WHERE active=1 AND LOWER(textbook)=LOWER(?) AND lesson_no=? LIMIT 1`).bind(textbook, lessonNo).first();
        if (r) return r;
      }
      if (textbook) {
        const r: any = await env.DB.prepare(`SELECT * FROM zh_passage WHERE active=1 AND LOWER(textbook)=LOWER(?) ORDER BY lesson_no ASC LIMIT 1`).bind(textbook).first();
        if (r) return r;
      }
      if (level) {
        const r: any = await env.DB.prepare(`SELECT * FROM zh_passage WHERE active=1 AND LOWER(level)=LOWER(?) ORDER BY lesson_no ASC LIMIT 1`).bind(level).first();
        if (r) return r;
      }
      return null;
    };
    /* 🈶 zh_passage 한 과 → 복습퀴즈 조립. AI 를 전혀 안 쓴다 —
       지문의 이해문제(questions)는 사람이 만든 정답이 이미 있고, 문장(sentences)·핵심단어(keywords)도
       검수된 실데이터라 그대로 문제로 바꾸면 100% 정확하다.

       ⚠️ 2026-08-21 개편 — 그 전에는 «객3·듣2·쓰3·말2» 였는데 사장님이 「말하기·쓰기가 이상하다」고
       지적하셨고, 실제로 그랬다:
         · 쓰기가 «한자를 직접 타이핑» 이라 중국어 입력기가 없으면 풀 수 없었다.
           accept 에 병음을 넣어 뒀지만 rqNorm 이 성조 부호를 통째로 지워(dǎgōng → «d g ng»)
           병음으로 답해도 무조건 오답이었다(같은 날 rqStripTone 으로 수리).
         · 말하기는 STT 검증이 안 된 채였다(같은 파일 rqAiGenerate 에는 「중국어는 listen/speak 0으로
           강제」라고 적혀 있는데 이 함수만 그 판단을 안 지키고 있었다).
       그래서 «고르는 문제» 를 중심으로 넓히고, 쓰기는 알파벳 자판으로 칠 수 있는 «병음 쓰기» 로 바꿨다.
       말하기는 연습용으로 1문항만 남긴다.

       구성(12문항) — 📖 본문이해 3 · 🎧 듣기 2 · 🈶 뜻→한자 2 · 🔤 병음→한자 1 ·
                      ✏️ 문맥 빈칸 2 · 🔤 병음 쓰기 1 · 🎤 말하기 1
       ⛔ 문항 «유형» 은 서버 스키마상 choice/listen/write/speak 넷뿐이다. 새로 넓힌 것들은 전부
          choice 의 변형이라 화면에는 「객관식」으로 뜬다 — 그래서 지문 앞에 꼬리표(🈶·🔤·✏️)를 붙여
          학생이 무엇을 묻는지 알 수 있게 한다.
       @param pool 다른 과의 핵심단어(오답 보기용). 비어 있으면 이 과 단어들끼리만 섞는다. */
    const rqBuildZhFromPassage = (p: any, pool: any[] = []) => {
      let sentences: any[] = []; try { sentences = JSON.parse(p.sentences || '[]') || []; } catch {}
      let questions: any[] = []; try { questions = JSON.parse(p.questions || '[]') || []; } catch {}
      let keywords: any[] = []; try { keywords = JSON.parse(p.keywords || '[]') || []; } catch {}
      const qs: any[] = [];
      const label = p.title_ko || p.title_zh || '';
      const tag = (t: string) => (label ? `[${label}] ` : '') + t;

      const kw = keywords.filter((k: any) => k && k.hz && k.ko);
      // 오답 보기 풀 — 이 과 단어 + 다른 과 단어(복습 효과). 같은 한자는 한 번만.
      const seenHz = new Set<string>();
      const poolAll: any[] = [];
      for (const x of [...kw, ...pool]) {
        if (!x || !x.hz || !x.ko || seenHz.has(x.hz)) continue;
        seenHz.add(x.hz); poolAll.push(x);
      }
      /* 오답 3개 — 글자 수가 비슷한 것을 먼저 고른다(1글자 정답에 4글자 오답이 섞이면 눈으로 걸러진다). */
      const distractors = (correctHz: string, n: number) => {
        const cand = poolAll.filter((x: any) => x.hz !== correctHz);
        const near = rqShuffle(cand.filter((x: any) => Math.abs([...x.hz].length - [...correctHz].length) <= 1));
        const rest = rqShuffle(cand.filter((x: any) => Math.abs([...x.hz].length - [...correctHz].length) > 1));
        return [...near, ...rest].slice(0, n).map((x: any) => x.hz);
      };
      const mcq = (qText: string, correct: string, explain: string) => {
        const ds = distractors(correct, 3);
        if (ds.length < 2) return null;                       // 보기가 모자라면 그 문항은 만들지 않는다
        const opts = rqShuffle([correct, ...ds]);
        return { type: 'choice', q: qText, opts, answer: opts.indexOf(correct), explain };
      };

      // ── 1) 📖 본문 이해 (원저작 정답 그대로) ─────────────────────────
      for (const q of questions.slice(0, 4)) {
        const opts = (Array.isArray(q.choices) ? q.choices : []).map((c: any) => String(c?.hz || ''));
        const ai2 = Number(q.answer);
        if (opts.length < 2 || opts.some((o: string) => !o) || !Number.isInteger(ai2) || ai2 < 0 || ai2 >= opts.length) continue;
        const cc = q.choices[ai2];
        qs.push({ type: 'choice', q: tag('📖 ' + String(q.q_ko || q.q || '')), opts, answer: ai2,
          explain: cc ? `정답: ${cc.hz}${cc.ko ? ' (' + cc.ko + ')' : ''}` : '' });
      }

      // ── 2) 🎧 듣기 — 문장을 듣고 뜻 고르기 ──────────────────────────
      const koPool = sentences.map((s2: any) => s2.ko).filter(Boolean);
      for (const s2 of rqShuffle(sentences.filter((x: any) => x.hz && x.ko)).slice(0, 2)) {
        const ds = rqShuffle(koPool.filter((k: string) => k !== s2.ko)).slice(0, 3);
        if (ds.length < 2) continue;
        const opts = rqShuffle([s2.ko, ...ds]);
        qs.push({ type: 'listen', q: '🎧 잘 듣고 무슨 뜻인지 고르세요.', audio_text: s2.hz, opts, answer: opts.indexOf(s2.ko),
          explain: `${s2.hz}${s2.py ? ' (' + s2.py + ')' : ''}` });
      }

      // ── 3~4) 어휘 — 뜻→한자 2문항, 병음→한자 1문항 (서로 다른 단어로) ──
      const kwShuffled = rqShuffle(kw);
      /* 병음 쓰기는 «두 글자 이상» 단어를 먼저 고른다 — 한 글자(寄 → jì)는 문제로서 너무 헐겁다.
         그 단어를 먼저 빼놓고 나머지를 뜻→한자·병음→한자에 배분해 네 문항이 서로 다른 단어가 되게 한다. */
      const writePick = kwShuffled.find((k: any) => k.py && [...String(k.hz)].length >= 2) || kwShuffled.find((k: any) => k.py);
      const restKw = kwShuffled.filter((k: any) => k !== writePick);
      const forMeaning = restKw.slice(0, 2);
      const forPinyin  = restKw.slice(2, 3);
      const forWrite   = writePick ? [writePick] : [];
      // ⚠️ 「"우체국" 를 …」 처럼 조사가 틀리지 않게 «…인 …는?» 꼴로 통일한다(받침 판별 불필요).
      for (const k of forMeaning) {
        const m = mcq(tag(`🈶 뜻이 "${k.ko}" 인 중국어 단어는?`), k.hz, `${k.hz}${k.py ? ' (' + k.py + ')' : ''} = ${k.ko}`);
        if (m) qs.push(m);
      }
      for (const k of forPinyin) {
        if (!k.py) continue;
        const m = mcq(tag(`🔤 병음이 "${k.py}" 인 한자는?`), k.hz, `${k.hz} (${k.py}) = ${k.ko}`);
        if (m) qs.push(m);
      }

      // ── 5) ✏️ 문맥 빈칸 — 본문 문장에서 그 단어를 가리고 고르게 한다 ──
      let blanks = 0;
      const usedSent = new Set<string>();
      for (const k of kwShuffled) {
        if (blanks >= 2) break;
        // 같은 문장을 두 번 쓰지 않는다(빈칸 위치만 다른 쌍둥이 문항 방지, 2026-08-21).
        const hit = sentences.find((s2: any) => s2 && s2.hz && String(s2.hz).includes(k.hz) && !usedSent.has(String(s2.hz)));
        if (!hit) continue;
        usedSent.add(String(hit.hz));
        /* ⚠️ 그 단어가 문장에 두 번 나오면 «첫 번째만» 가려서는 안 된다 — 정답이 뒷부분에
           그대로 남아 학생이 읽고 베낀다(2026-08-21 제5과 「不过小庆的头发长，小乐的头发短。」).
           split/join 으로 «전부» 가린다. */
        const blanked = String(hit.hz).split(k.hz).join('____');
        const m = mcq(tag(`✏️ 빈칸에 알맞은 단어는?  ${blanked}  (${hit.ko || ''})`), k.hz,
          `${hit.hz}${hit.py ? ' (' + hit.py + ')' : ''} — ${k.hz} = ${k.ko}`);
        if (m) { qs.push(m); blanks++; }
      }

      // ── 6) 🔤 병음 쓰기 — 알파벳 자판으로 칠 수 있다(성조 부호는 안 받아도 정답) ──
      for (const k of forWrite) {
        if (!k.py) continue;
        const plain = String(k.py).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
        const accept = [...new Set([plain, plain.replace(/\s+/g, '')])].filter((x) => x && x !== k.py);
        qs.push({ type: 'write', q: `🔤 다음 한자의 병음을 알파벳으로 쓰세요 (성조 부호는 없어도 됩니다): ${k.hz}`,
          answer_text: k.py, accept, explain: `${k.hz} (${k.py}) = ${k.ko}` });
      }

      // ── 7) 🎤 말하기 — 본문 문장 한 개 소리내어 읽기(연습) ──────────
      for (const s2 of rqShuffle(sentences.filter((x: any) => x.hz)).slice(0, 1)) {
        qs.push({ type: 'speak', q: `🎤 아래 문장을 또박또박 읽어보세요.${s2.py ? ' (' + s2.py + ')' : ''}`, answer_text: s2.hz, explain: s2.ko || '' });
      }
      return qs;
    };
    // 🤖 AI 자동 출제 — 교재/레벨/레슨 기반 (Workers AI llama-3.3-70b)
    /* 📏 (2026-09-02) 생성기에게 «검사기가 실제로 쓰는 상한» 을 알려 준다.
       [왜] 예전에는 레벨과 무관하게 「max 8 words」 고정이었는데 검사기는 레벨별
            상한(BAND_SPECS)을 쓴다. 두 곳이 다른 말을 하면, 높은 레벨에서는 모델이
            쓸데없이 짧게 쓰고 낮은 레벨에서는 검사에 걸린다(CLAUDE.md 「여러 곳이
            서로 같은 말을 하는가」). 레벨을 모르면 예전 값(8)을 그대로 쓴다. */
    const maxWordsForPrompt = (level?: string) => {
      const band = bandFromTextbookLevel(level);
      const spec = band ? BAND_SPECS[band - 1] : null;
      return spec ? spec.maxWords : 8;
    };
    const rqAiGenerate = async (o: { level?: string; textbook?: string; lesson_no?: number | null; topic?: string; counts?: any; lang?: string }) => {
      const ai = (env as any).AI;
      if (!ai) return { ok: false as const, error: 'workers_ai_not_bound' };
      const isZh = o.lang === 'zh';
      const c = o.counts || {};
      const lim = (v: any, dft: number) => Math.min(Math.max(Number(v ?? dft) || 0, 0), 5);
      // 🈶 중국어는 서버 TTS(구글)가 깨지고 STT 검증도 안 돼 있어 listen/speak 는 항상 0으로 강제 — choice/write만.
      const nListen = isZh ? 0 : lim(c.listen, 2), nWrite = lim(c.write, 2), nSpeak = isZh ? 0 : lim(c.speak, 2), nChoice = lim(c.choice, isZh ? 4 : 0);
      if (nListen + nWrite + nSpeak + nChoice === 0) return { ok: false as const, error: 'counts_required' };
      const ctx = [
        o.textbook ? `Textbook: ${o.textbook}` : '',
        o.level ? `Level: ${o.level}` : '',
        (o.lesson_no != null && o.lesson_no > 0) ? `Lesson number: ${o.lesson_no}` : '',
        o.topic ? `Key vocabulary / topic from this lesson: ${o.topic}` : '',
      ].filter(Boolean).join('\n');
      let prompt: string;
      let systemMsg: string;
      if (isZh) {
        const vocab = await rqZhVocabSample(o.level, o.textbook, o.lesson_no ?? null);
        if (!vocab.length) return { ok: false as const, error: 'zh_vocab_empty' };
        const vocabList = vocab.map((v: any) => `${v.hanzi} (${v.pinyin || ''}) = ${v.ko || ''}`).join('\n');
        systemMsg = 'You write JSON quizzes for Korean students learning Chinese. Output a raw JSON array only.';
        prompt = `You are a Chinese (중국어) quiz writer for a Korean kids' language academy (망고아이).
Create a review quiz for this class:
${ctx || 'General 중국어'}

${PUNCTUATION_PROMPT_RULE}

🔒 IMPORTANT: Use ONLY the Chinese words below (already verified/curated) — do NOT invent any other hanzi, pinyin, or meaning. Every question's correct answer AND every multiple-choice distractor must come from this exact list:
${vocabList}

Make exactly:
- ${nChoice} "choice" questions: {"type":"choice","q":"<Korean question, e.g. 다음 뜻에 해당하는 중국어 단어는?>","opts":["<hanzi from the list>","..","..","..(4 options, 1 correct + 3 distractors, all from the list)"],"answer":<correct index 0-3>,"explain":"<Korean explanation including pinyin>"}
- ${nWrite} "write" questions: {"type":"write","q":"<Korean prompt, e.g. 다음 우리말 뜻에 해당하는 중국어 단어를 한자로 쓰세요: ...>","answer_text":"<hanzi from the list>","accept":["<pinyin form>"],"explain":"<Korean explanation with pinyin>"}

Rules: All Chinese words must be copy-pasted exactly from the list above (no new characters). Questions/instructions/explanations in Korean.
Reply with a JSON array ONLY. No markdown, no commentary.`;
      } else {
        systemMsg = 'You write JSON quizzes for Korean children learning English. Output a raw JSON array only.';
        prompt = `You are an English quiz writer for a Korean kids' English academy (망고아이).
Create a review quiz for this class:
${ctx || 'General elementary English'}

${PUNCTUATION_PROMPT_RULE}

Difficulty must match the textbook level and lesson (younger learners = very short, simple sentences).
Make exactly:
- ${nChoice} "choice" questions: {"type":"choice","q":"<Korean question>","opts":["..","..","..",".."],"answer":<correct index 0-3>,"explain":"<short Korean explanation>"}
- ${nListen} "listen" questions: {"type":"listen","q":"🎧 잘 듣고 알맞은 답을 고르세요.","audio_text":"<short English sentence to be spoken aloud>","opts":["..","..","..",".."],"answer":<index>,"explain":"<Korean>"}
- ${nWrite} "write" questions: {"type":"write","q":"<Korean prompt, e.g. 다음 뜻의 영어 문장을 쓰세요: ...>","answer_text":"<correct English sentence>","accept":["<acceptable variation>"],"explain":"<Korean>"}
- ${nSpeak} "speak" questions: {"type":"speak","q":"🎤 아래 문장을 또박또박 읽어보세요.","answer_text":"<short English sentence to read aloud>","explain":"<Korean>"}

Rules: English sentences max ${maxWordsForPrompt(o.level)} words. Korean for instructions/explanations. Vocabulary must fit the textbook/lesson. The "listen" options must include the audio sentence itself as the correct option.
Reply with a JSON array ONLY. No markdown, no commentary.`;
      }
      try {
        const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt }
          ],
          max_tokens: 2400,
        });
        let text = '';
        if (typeof resp === 'string') text = resp;
        else if (resp && typeof resp.response === 'string') text = resp.response;
        else if (resp && resp.response) text = JSON.stringify(resp.response);
        const m = String(text || '').match(/\[[\s\S]*\]/);
        if (!m) return { ok: false as const, error: 'ai_no_json' };
        let arr: any[] = [];
        try { arr = JSON.parse(m[0]); } catch { return { ok: false as const, error: 'ai_bad_json' }; }
        const parsed = rqParseQuestions(arr);
        if (!parsed.ok || !parsed.list || !parsed.list.length) return { ok: false as const, error: parsed.error || 'ai_invalid_questions' };
        /* 🧪 (2026-09-02) 만든 것을 «실제로 검사한다» — 지금까지 영어 갈래는 프롬프트로
           지시만 하고 결과를 한 번도 확인하지 않았다. 이 저장소의 반복 실측이
           「지시만으로는 안 지켜진다」이고(판단력 「Want play with me」·AI친구 전보문),
           복습퀴즈는 학생이 **정답으로 외우는** 문장이라 더 나쁘다. 정본: quiz-quality.ts
           ⛔ 중국어에는 걸지 않는다 — 검사기는 영어용이라(isEnglishQuestion) 전부 떨어진다.
              중국어는 이미 zh_vocab 그라운딩으로 «목록 밖 글자 금지» 가 걸려 있다.
           ⚠️ 여기서는 «거르기만» 하고 정책은 부르는 쪽이 정한다 — 학생이 기다리는 즉석 출제와
              관리자 은행 생성은 «다 떨어졌을 때» 해야 할 일이 다르다. */
        if (isZh) return { ok: true as const, questions: parsed.list, dropped: [] as any[] };
        const f = filterQuizQuestions(parsed.list, o.level);
        if (f.dropped.length) console.warn('[rqAiGenerate] 문항 거름:', f.dropped.length, '/', parsed.list.length, '—', summarizeRejects(f.dropped));
        return { ok: true as const, questions: f.kept, dropped: f.dropped, raw_count: parsed.list.length };
      } catch (e: any) {
        return { ok: false as const, error: 'ai_failed: ' + (e?.message || 'unknown') };
      }
    };

    // ── GET /api/review-quiz/list?user_id=xxx — 학생: 활성 퀴즈 목록 (+내 최고점/시도수) ──
    if (method === 'GET' && path === '/api/review-quiz/list') {
      await ensureReviewQuizTables();
      let userId = (url.searchParams.get('user_id') || '').trim();
      // 🔐 [IDOR] 개인 기록(최고점·시도수)은 본인만 — 임의 user_id 로 남의 점수 열람 차단 (2026-07-19).
      //   게스트(guest_*, 클라 랜덤 생성·추측 불가·토큰 없음)는 그대로 허용해 게스트 흐름 안 깨짐.
      //   실계정 uid 인데 토큰 불일치면 401 대신 개인 필드만 생략(퀴즈 목록은 공개 설계 유지 → 페이지 안 깨짐).
      if (userId && !userId.startsWith('guest_')) {
        const rqAuth = await authUidGlobal(request, url, env);
        if (!rqAuth || rqAuth !== userId) userId = '';   // 통계만 익명화
      }
      /* 🈶 언어 필터 (2026-08-17) — review-quiz-cn.html 이 `&lang=zh` 를 보내는데 여기서
       *   **읽지 않아** 중국어 화면에 한국어·영어 퀴즈까지 다 나오고 있었다(실측: 활성 15건 중 zh 는 1건).
       *   규칙은 아래 자동생성부(langCond)와 똑같이 맞춘다:
       *     · zh → lang='zh' 인 행만
       *     · en → lang='en' + **예전에 만들어져 lang 이 NULL 인 행**(하위호환)
       *   ⚠️ lang 을 안 보내면 예전 그대로 «전부» 돌려준다 — 이 API 를 쓰는 다른 화면을 깨지 않기 위함. */
      const listLang = String(url.searchParams.get('lang') || '').trim().toLowerCase();
      let listSql = `SELECT id, title, description, questions, level, textbook, lesson_no, source, draw, lang, created_at FROM review_quizzes WHERE active = 1`;
      const listBinds: any[] = [];
      if (listLang === 'zh') { listSql += ` AND lang = ?`; listBinds.push('zh'); }
      else if (listLang) { listSql += ` AND (lang = ? OR lang IS NULL)`; listBinds.push(listLang); }
      listSql += ` ORDER BY id DESC`;
      const listStmt = env.DB.prepare(listSql);
      const rs = await (listBinds.length ? listStmt.bind(...listBinds) : listStmt).all();
      const quizzes: any[] = [];
      for (const row of (((rs.results as any[]) || []))) {
        let count = 0; try { count = (JSON.parse(row.questions) || []).length; } catch {}
        let drawTotal = 0; try { if (row.draw) { const d = JSON.parse(row.draw); drawTotal = (d.listen || 0) + (d.speak || 0) + (d.choice || 0) + (d.write || 0); } } catch {}
        const shown = drawTotal > 0 ? Math.min(drawTotal, count) : count;
        const item: any = { id: row.id, title: row.title, description: zhDisplayDesc(row.description || '', row.lang), question_count: shown, bank_size: count, draw_total: drawTotal, level: row.level || '', textbook: zhDisplayTextbook(row.textbook) || '', textbook_key: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', lang: row.lang || 'en', created_at: row.created_at, best_score: null, attempts: 0 };
        if (userId) {
          const best: any = await env.DB.prepare(`SELECT MAX(score) AS best, COUNT(*) AS n FROM review_quiz_results WHERE quiz_id = ? AND user_id = ?`).bind(row.id, userId).first();
          if (best && Number(best.n) > 0) { item.best_score = best.best; item.attempts = Number(best.n); }
        }
        quizzes.push(item);
      }
      return json({ ok: true, quizzes });
    }

    // ── GET /api/review-quiz/get?id=N — 학생: 퀴즈 1건 (정답/해설 제외) ──
    if (method === 'GET' && path === '/api/review-quiz/get') {
      await ensureReviewQuizTables();
      const id = parseInt(url.searchParams.get('id') || '0', 10);
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT id, title, description, questions, active, level, textbook, lesson_no, source, draw, lang FROM review_quizzes WHERE id = ?`).bind(id).first();
      if (!row || !row.active) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      let draw: any = null; try { draw = row.draw ? JSON.parse(row.draw) : null; } catch {}
      let safe: any[];
      if (draw && qs.length) { const idxs = rqDrawIndices(qs, draw); safe = idxs.map((i: number) => rqSafeOne(qs[i], i)); }
      else { safe = rqSafeQuestions(qs); }
      return json({ ok: true, quiz: { id: row.id, title: row.title, description: row.description || '', level: row.level || '', textbook: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', draw: draw || null, lang: row.lang || 'en', questions: safe } });
    }

    // ── POST /api/review-quiz/submit — 학생: 답안 제출 → 서버 채점 + 기록 저장 ──
    if (method === 'POST' && path === '/api/review-quiz/submit') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const quizId = Number(b.quiz_id);
      const userId = String(b.user_id || '').trim();
      const userName = String(b.user_name || '').trim() || null;
      const answers: any[] = Array.isArray(b.answers) ? b.answers : [];
      if (!quizId) return json({ ok: false, error: 'quiz_id_required' }, 400);
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);
      // 🔐 [IDOR 무결성] 실계정 user_id 로 남 대신 제출(기록 오염+포인트 적립) 차단 (2026-07-19).
      //   게스트(guest_*)는 토큰 없이 그대로 허용(게스트 흐름 유지). 실계정은 mango_token uid 일치 필수.
      //   프론트(review-quiz.html·idx-x8.js)는 body.token 전송 + 401 시 게스트 폴백 재시도(수업 흐름 안 끊김).
      // 🔐 실계정 남 대신 제출(기록 오염+포인트 적립) 차단. 게스트는 통과. [공용 헬퍼]
      if ((await resolveOwnerScope(request, url, env as any, userId, b)) === 'deny') {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      const row: any = await env.DB.prepare(`SELECT id, title, questions FROM review_quizzes WHERE id = ? AND active = 1`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      if (!qs.length) return json({ ok: false, error: 'quiz_empty' }, 400);
      // 🎲 학생이 받은 문항(서버 draw 결과)만 채점 — served = 원본 bank index 배열
      const served: number[] | null = Array.isArray(b.served)
        ? b.served.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n < qs.length)
        : null;
      const gradeQs = (served && served.length) ? served.map((i: number) => qs[i]) : qs;
      const { score, detail } = rqGrade(gradeQs, answers);
      const total = gradeQs.length;
      const now = Date.now();
      const insRes: any = await env.DB.prepare(`INSERT INTO review_quiz_results (quiz_id, user_id, user_name, score, total, answers, detail, created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(quizId, userId, userName, score, total, JSON.stringify(answers.slice(0, total)), JSON.stringify(detail), now).run();
      const percent = total ? Math.round((score / total) * 100) : 0;
      // 🎁 게임 경제 연동 — 복습퀴즈도 포인트 적립 (정답 10P + 만점 50P + 첫 클리어 30P, 일일 상한 500P)
      let awarded = 0, balance: number | null = null, streak = 0, firstClear = false;
      try {
        const dayStart = Math.floor((now + 32400000) / 86400000) * 86400000 - 32400000;
        const resultId = (insRes && insRes.meta && insRes.meta.last_row_id) ? insRes.meta.last_row_id : now;
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS review_quiz_rewards (award_id TEXT PRIMARY KEY, user_id TEXT, amount INTEGER, created_at INTEGER);`);
        const prev: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM review_quiz_results WHERE quiz_id = ? AND user_id = ? AND id < ?`).bind(quizId, userId, resultId).first();
        firstClear = (Number(prev?.n) || 0) === 0 && score > 0;
        let amount = score * 10 + (percent === 100 ? 50 : 0) + (firstClear ? 30 : 0);
        const used: any = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM review_quiz_rewards WHERE user_id = ? AND created_at >= ?`).bind(userId, dayStart).first();
        amount = Math.max(0, Math.min(amount, 500 - (Number(used?.t) || 0)));
      /* 🧢 (2026-09-01 사장님 결정) 하루 총량 100점을 **이 경로도 지난다.**
         그전에는 이 표의 자기 상한(단어장 400 · 복습퀴즈 500)만 걸려서, 정책이 「하루 100점」
         이라고 적혀 있는데 실제로는 열 배가 나가고 있었다(실효 1,050점).
         ⚠️ 막지 않고 «남은 만큼 깎아서» 준다 — 이 경로는 원래부터 그렇게 동작했고,
            한 판을 다 풀고 0점을 받는 쪽이 더 나쁘다.
         ⚠️ 상한 조회가 실패하면 전액을 돌려주므로 «조회 실패로 점수를 잃는» 일은 없다. */
        amount = Math.min(amount, await dailyAllowance(env as any, userId, 'review_quiz_done'));
        if (amount > 0) {
          const ins2: any = await env.DB.prepare(`INSERT OR IGNORE INTO review_quiz_rewards (award_id, user_id, amount, created_at) VALUES (?,?,?,?)`)
            .bind(`rq:${quizId}:${userId}:${resultId}`, userId, amount, now).run();
          if (ins2 && ins2.meta && (ins2.meta as any).changes > 0) {
            /* 🧾 (2026-09-01) 단어장 보상과 같은 이유로 원장을 거친다 — 위 주석 참고.
               금액은 그대로(하루 500점 상한이 이미 위에서 걸렸다). */
            /* 🔴 이름은 진짜 이름이 있을 때만 — uid 를 넘기면 공개 리더보드에 아이디가 샌다
               (위 단어장 보상 주석 참고). 여기는 바깥 try/catch 가 이미 감싸고 있다. */
            await applyPointTransaction(env as any, {
              userId, studentName: userName || undefined, type: 'earn', amount,
              reason: '복습퀴즈 보상', ruleCode: 'review_quiz_done',
              meta: { quiz_id: quizId, score, percent, first_clear: firstClear },
            });
            awarded = amount;
          }
        }
        const bal: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id = ?`).bind(userId).first();
        balance = bal ? Number(bal.balance) : null;
        // 🔥 복습 스트릭 — KST 기준 연속 복습일 (오늘/어제부터 이어진 만큼)
        const days: any = await env.DB.prepare(`SELECT DISTINCT CAST((created_at + 32400000) / 86400000 AS INTEGER) AS d FROM review_quiz_results WHERE user_id = ? ORDER BY d DESC LIMIT 90`).bind(userId).all();
        const ds = (((days.results as any[]) || [])).map((r: any) => Number(r.d));
        const today = Math.floor((now + 32400000) / 86400000);
        if (ds.length && (ds[0] === today || ds[0] === today - 1)) { streak = 1; for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) streak++; }
      } catch {}
      // 🧠 [판단력 D3] 복습퀴즈 채점 = 판단 이벤트. detail(정/오답)을 그대로 기록(재-LLM 없음).
      //   guest 는 제외(파밍/노이즈 방지). refId=결과행 id 로 멱등.
      try {
        if (userId && !userId.startsWith('guest_')) {
          const refId = (insRes && insRes.meta && (insRes.meta as any).last_row_id) ? (insRes.meta as any).last_row_id : now;
          const jList = (detail || []).slice(0, 5).map((d: any) => {
            const isWrite = d.type === 'write' || d.type === 'speak';
            return {
              situation: 'Review quiz (' + (d.type || 'choice') + ')', skill_tag: 'review_quiz',
              chosen: isWrite ? String(d.your_text || '') : '',
              better: isWrite ? String(d.answer_text || '') : String(d.audio_text || ''),
              is_optimal: d.correct ? 1 : 0,
              choice_score: isWrite ? (Number.isFinite(+d.accuracy) ? +d.accuracy : (d.correct ? 100 : 0)) : (d.correct ? 100 : 40),
              misconception: d.correct ? null : guessMisconception(String(d.explain || '')),
              feedback_ko: String(d.explain || '').slice(0, 200),
            };
          });
          if (jList.length) await recordJudgmentEvents(env, { studentUid: userId, studentName: userName, source: 'review_quiz', refId, judgments: jList });
        }
      } catch (e: any) { console.warn('[review-quiz] judgment capture skip:', e?.message); }

      return json({ ok: true, score, total, percent, detail, awarded, balance, streak, first_clear: firstClear });
    }

    // ── POST /api/review-quiz/check — 학생: 문항 1개 즉석 채점 (실시간 피드백, 답안 미기록) ──
    if (method === 'POST' && path === '/api/review-quiz/check') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const quizId = Number(b.quiz_id) || 0;
      const idx = Number(b.idx);
      if (!quizId || !Number.isInteger(idx) || idx < 0) return json({ ok: false, error: 'quiz_id_and_idx_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT questions FROM review_quizzes WHERE id = ? AND active = 1`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      const q = qs[idx];
      if (!q) return json({ ok: false, error: 'question_not_found' }, 404);
      const { detail } = rqGrade([q], [b.answer]);   // 단일 문항 채점은 기존 로직 재사용
      const d: any = detail[0];
      const type = q.type || 'choice';
      const out: any = { ok: true, correct: !!d.correct, type, explain: d.explain || '' };
      if (type === 'choice' || type === 'listen') {
        out.answer = d.answer;
        out.answer_text = (q.opts && q.opts[d.answer] != null) ? q.opts[d.answer] : '';
        if (type === 'listen') out.audio_text = q.audio_text || '';
      } else {
        out.answer_text = d.answer_text || '';
        out.accuracy = d.accuracy;
        out.your_text = d.your_text || '';
      }
      return json(out);
    }

    // ── POST /api/review-quiz/tts — 듣기 문항 음성 (정답 원문 비공개, 서버 TTS) ──
    if (method === 'POST' && path === '/api/review-quiz/tts') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const quizId = Number(b.quiz_id) || 0;
      const idx = Number(b.idx);
      if (!quizId || !Number.isInteger(idx) || idx < 0) return json({ ok: false, error: 'quiz_id_and_idx_required' }, 400);
      const row: any = await env.DB.prepare(`SELECT questions, lang FROM review_quizzes WHERE id = ? AND active = 1`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      const q = qs[idx];
      const text = (q && q.type === 'listen') ? String(q.audio_text || '').trim().slice(0, 300) : '';
      if (!text) return json({ ok: false, error: 'not_a_listen_question' }, 400);
      const isZh = row.lang === 'zh';
      const ai = (env as any).AI;
      if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);
      const audioHeaders = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' };
      // 🔁 R2 캐시: 같은 듣기 문항은 1회만 생성 → 이후엔 뉴런 소모 없이 즉시 제공 (무료 뉴런 절약 + quota 소진 후에도 캐시본 재생)
      let cacheKey = '';
      try {
        const enc = new TextEncoder().encode((isZh ? 'gtts-zh' : 'aura-asteria') + '|' + text);
        const dig = await crypto.subtle.digest('SHA-256', enc);
        cacheKey = 'tts/' + [...new Uint8Array(dig)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
      } catch {}
      const r2: any = (env as any).RECORDINGS;
      if (cacheKey && r2) {
        try { const hit = await r2.get(cacheKey); if (hit) return new Response(hit.body, { headers: audioHeaders }); } catch {}
      }
      const putCache = async (bytes: ArrayBuffer | Uint8Array) => {
        if (!cacheKey || !r2) return;
        try { await r2.put(cacheKey, bytes, { httpMetadata: { contentType: 'audio/mpeg' } }); } catch {}
      };
      const isQuota = (m: any) => /429|neuron|allocation|free allocation|capacity/i.test(String(m || ''));
      // 🈶 중국어 — Deepgram Aura 는 중국어를 지원 안 하고, Workers AI MeloTTS(zh)는 종종 빈 잡음
      // WAV("앙캉캉캉")를 돌려줘 크기검사로도 못 거른다([[/api/voice/tts]]에서 이미 검증된 대응).
      // 그래서 Google 번역 TTS(원어민 만다린)를 1순위로, MeloTTS(zh)는 최후 폴백으로만 쓴다.
      if (isZh) {
        try {
          const q2 = encodeURIComponent(text.slice(0, 190));
          const gurl = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=zh-CN&q=' + q2;
          const gr = await fetch(gurl, { headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
          } });
          if (gr.ok) {
            const gb = await gr.arrayBuffer();
            if (gb && gb.byteLength >= 300) { await putCache(gb); return new Response(gb, { headers: audioHeaders }); }
          }
        } catch {}
        try {
          const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: 'zh' });
          const b64 = typeof r === 'string' ? r : (r?.audio || '');
          if (b64) {
            const bin = atob(b64); const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            if (u8.byteLength >= 1000) { await putCache(u8); return new Response(u8, { headers: audioHeaders }); }
          }
        } catch (e: any) { if (isQuota(e?.message)) return json({ ok: false, error: 'ai_quota_exceeded', quota: true }, 503); }
        return json({ ok: false, error: 'zh_tts_failed' }, 502);
      }
      // fix: AI 에러 Response 를 음성으로 내보내지 않도록 ok+audio 확인. 429(무료뉴런 소진) 는 quota 로 구분.
      let quota = false;
      try {
        const raw: any = await ai.run('@cf/deepgram/aura-1', { text, speaker: 'asteria' }, { returnRawResponse: true });
        if (raw instanceof Response) {
          const ct = raw.headers.get('content-type') || '';
          if (raw.ok && /audio/i.test(ct)) { const buf = await raw.arrayBuffer(); await putCache(buf); return new Response(buf, { headers: audioHeaders }); }
          if (raw.status === 429) quota = true;
        }
      } catch (e: any) { if (isQuota(e?.message)) quota = true; }
      try {
        const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: 'en' });
        const b64 = typeof r === 'string' ? r : (r?.audio || '');
        if (b64) {
          const bin = atob(b64); const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          await putCache(u8);
          return new Response(u8, { headers: audioHeaders });
        }
      } catch (e: any) { if (isQuota(e?.message)) quota = true; }
      return json({ ok: false, error: quota ? 'ai_quota_exceeded' : 'tts_failed', quota }, quota ? 503 : 500);
    }

    // ── POST /api/review-quiz/auto — 화상수업: 교재/레벨/레슨 자동 매칭 (+없으면 AI 즉석 출제 후 저장) ──
    if (method === 'POST' && path === '/api/review-quiz/auto') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      let lang = String(b.lang || '').trim() === 'zh' ? 'zh' : 'en';
      let level = String(b.level || '').trim();
      let textbook = String(b.textbook || '').trim();
      /* 🈶 (2026-08-26) 언어를 «수업 교재» 로 판정한다 — 사장님 제보
       *   「중국어 수업 끝났는데 복습퀴즈가 왜 영어가 나와?」의 뿌리.
       *   [무엇이 문제였나] 클라이언트가 보내는 b.lang 은 «이 수업이 무슨 언어인가» 가 아니라
       *     **학생이 예전에 게임탭에서 골라둔 값**이다(js/idx-x8.js 의 st.lang — 기본값 'en').
       *     그래서 중국어 교재로 수업해도 영어로 조회했다. 게다가 교재 이름이 라이브러리와
       *     콘텐츠에서 서로 달라(「다락원 중국어 마스터 3」 대 「다락원」) 정확일치가 영영 안 맞았다.
       *   [고침] 교재가 zh_passage·zh_vocab 에 있는 중국어 교재로 «이어지면» 그것을 근거로
       *     zh 로 올리고, 교재 이름도 콘텐츠 표기로 바꿔 매칭이 성립하게 한다.
       *   ⛔ 이름만 보고 짐작하지 않는다 — 판정 근거는 그 두 표에 실제로 있는가이다(zh-textbook.ts).
       *   ⚠️ 반대 방향(zh → en)으로는 내리지 않는다. 학생이 손으로 中文 을 고른 것은 존중한다. */
      let zhBook: string | null = null;
      try {
        const known = await loadZhTextbookNames();
        zhBook = resolveZhTextbook(textbook, known);
        if (zhBook) { lang = 'zh'; textbook = zhBook; }
      } catch (e: any) { console.warn('[review-quiz/auto] zh textbook resolve skip:', e?.message); }
      // 🈶 (2026-07-31) 중국어는 아직 다락원 Lv3 단일 커리큘럼뿐이라, 수업 화면이 교재를 못 읽어와도
      //   비어 있지 않게 안전한 기본값으로 채운다(교재/레벨이 늘면 이 fallback 은 자연히 무해해짐).
      if (lang === 'zh' && !textbook && !level) { textbook = '다락원'; level = 'Lv 3'; }
      const lessonNo = Number(b.lesson_no) > 0 ? Number(b.lesson_no) : null;
      const topic = String(b.topic || '').trim().slice(0, 300);
      const allowGenerate = b.auto_generate !== 0 && b.auto_generate !== false;
      /* 🈶 (2026-08-26) 이 교재에 «몇 과» 가 있는지 함께 내려준다 — 화면의 과 고르기 줄이 쓴다.
       *   [왜 필요한가] 진도(과)를 자동으로 알아낼 방법이 지금은 없다. 교재 라이브러리의
       *     「다락원 중국어 마스터 3」 583쪽이 **전부 「미분류 레슨」이고 unit_no 도 583개 전부 NULL**
       *     이다(2026-08-26 D1 실측). 그래서 localStorage 의 mangoi_current_lesson 은 읽는 코드만
       *     둘이고 **저장하는 코드가 저장소 전체에 0곳**이었다 — 과별 퀴즈 14개가 있어도 영영 안 닿았다.
       *   [결정] 사장님 결정(2026-08-26): **학생이 과를 고르게** 한다. 그 목록이 이 값이다.
       *   ⛔ 교재에서 과를 «짐작» 하지 말 것 — 파일 이름에 단서가 한 글자도 없다. */
      let zhLessons: number[] = [];
      if (lang === 'zh') {
        try {
          const lr: any = await env.DB.prepare(`SELECT DISTINCT lesson_no FROM zh_passage WHERE active=1 AND lesson_no IS NOT NULL${textbook ? ' AND LOWER(textbook)=LOWER(?)' : ''} ORDER BY lesson_no ASC`)
            .bind(...(textbook ? [textbook] : [])).all();
          for (const r of (((lr.results as any[]) || []))) { const n = Number(r.lesson_no); if (n > 0) zhLessons.push(n); }
        } catch (e: any) { console.warn('[review-quiz/auto] zh lessons skip:', e?.message); }
      }
      // 모든 응답에 함께 실어 «지금 무슨 언어·교재·몇 과인지» 를 화면이 알 수 있게 한다.
      const meta = { lang, textbook: zhDisplayTextbook(textbook), lessons: zhLessons, lesson_no: lessonNo };
      const pickSafe = (row: any) => {
        let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
        let draw: any = null; try { draw = row.draw ? JSON.parse(row.draw) : null; } catch {}
        let safe: any[];
        if (draw && qs.length) { const idxs = rqDrawIndices(qs, draw); safe = idxs.map((i: number) => rqSafeOne(qs[i], i)); }
        else { safe = rqSafeQuestions(qs); }
        // 🈶 화면에 보여줄 교재 이름은 콘텐츠 표기(「다락원」)가 아니라 「중국어 마스터」(2026-08-26 사장님).
        //   ⚠️ D1 값은 그대로 둔다 — 매칭은 콘텐츠 표기로 하고, 바꾸는 것은 «보여줄 때» 뿐이다.
        return { id: row.id, title: row.title, description: zhDisplayDesc(row.description || '', row.lang), level: row.level || '', textbook: zhDisplayTextbook(row.textbook) || '', textbook_key: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', draw: draw || null, lang: row.lang || 'en', questions: safe };
      };
      // 🈶 언어 필터: en 은 예전에 만들어진 lang=NULL 행도 포함(하위호환), zh 는 lang='zh' 행만.
      const langCond = lang === 'zh' ? `lang = ?` : `(lang = ? OR lang IS NULL)`;
      const langBind = lang;
      // 1) 교재+레슨 → 2) 교재 전체용(무과) → 3) 레벨 전체용 순서로 매칭
      const tries: Array<{ sql: string; binds: any[] }> = [];
      if (textbook && lessonNo) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND ${langCond} AND textbook IS NOT NULL AND LOWER(textbook)=LOWER(?) AND lesson_no=? ORDER BY id DESC LIMIT 1`, binds: [langBind, textbook, lessonNo] });
      // 🈶 (버그수정) 중국어는 zh_passage 에 과별로 실제 다른 본문이 있다 — 특정 과를 물었는데
      //   이 "무과 전체용" 버킷으로 뭉뚱그려 매칭하면 엉뚱한 과 내용이 나온다. 영어는 과별 실콘텐츠가
      //   없어(AI 즉석출제뿐) 원래 의도대로 무과 캐치올로 폴백시키되, 중국어+특정과 요청일 땐 건너뛴다.
      if (textbook && !(lang === 'zh' && lessonNo)) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND ${langCond} AND textbook IS NOT NULL AND LOWER(textbook)=LOWER(?) AND lesson_no IS NULL ORDER BY id DESC LIMIT 1`, binds: [langBind, textbook] });
      if (level) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND ${langCond} AND level IS NOT NULL AND LOWER(level)=LOWER(?) AND (textbook IS NULL OR textbook='') ORDER BY id DESC LIMIT 1`, binds: [langBind, level] });
      for (const t of tries) {
        const row: any = await env.DB.prepare(t.sql).bind(...t.binds).first();
        if (row) return json({ ok: true, matched: true, quiz: pickSafe(row), ...meta });
      }
      if (!allowGenerate || (!textbook && !level && !topic)) return json({ ok: true, matched: false, quiz: null, ...meta });
      // 🈶 중국어 1순위: 다락원 본문(zh_passage) 기반 조립 — 사람이 만든 정답이라 AI보다 정확하고,
      //   듣기/말하기까지 전부 실제 교재 문장으로 채울 수 있다(영어 퀴즈와 동급 4유형 구성).
      if (lang === 'zh') {
        const passRow = await rqZhPassageFind(textbook, level, lessonNo);
        if (passRow) {
          // 오답 보기용으로 «다른 과» 핵심단어도 함께 넘긴다 — 같은 과 4단어끼리만 돌리면
          // 어휘 문항 세 개가 늘 같은 보기라 소거법으로 풀린다(2026-08-21).
          let kwPool: any[] = [];
          try {
            const pr: any = await env.DB.prepare(`SELECT keywords FROM zh_passage WHERE active=1 AND textbook=? AND id<>?`).bind(passRow.textbook, passRow.id).all();
            for (const r of (((pr.results as any[]) || []))) { try { kwPool.push(...(JSON.parse(r.keywords || '[]') || [])); } catch {} }
          } catch {}
          const qsList = rqBuildZhFromPassage(passRow, kwPool);
          if (qsList.length) {
            const label = passRow.title_ko || passRow.title_zh || `제${passRow.lesson_no}과`;
            const title = `[${label}] 복습퀴즈`;
            const desc = `${passRow.textbook}${passRow.level ? ' ' + passRow.level : ''} 제${passRow.lesson_no}과 본문 기반 (객관식/듣기/쓰기/말하기) — ${new Date().toISOString().slice(0, 10)}`;
            const now = Date.now();
            // 🔒 (버그수정) lesson_no 는 "요청이 물어본 값" 그대로 저장해야 한다 — passRow.lesson_no(내부적으로
            //   고른 실제 과)를 저장하면, 다음에 같은 lesson_no 없는 요청이 왔을 때 매칭 쿼리(lesson_no IS NULL
            //   버킷)가 이 행을 못 찾아 매번 새로 생성해버린다(중복 행 누적). 화면에 보이는 제목/설명은 어차피
            //   실제 고른 과(passRow.lesson_no) 기준이라 사용자에게는 문제 없다.
            const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, lang, created_at, updated_at) VALUES (?,?,?,1,?,?,?,'passage','zh',?,?)`)
              .bind(title, desc, JSON.stringify(qsList), level || passRow.level || null, textbook || passRow.textbook || null, lessonNo, now, now).run();
            const newId = (ins as any).meta?.last_row_id;
            const nrow: any = await env.DB.prepare(`SELECT * FROM review_quizzes WHERE id=?`).bind(newId).first();
            return json({ ok: true, matched: false, generated: true, quiz: pickSafe(nrow), ...meta });
          }
        }
        // 본문이 아예 없는 교재/레벨이면(향후 커리큘럼 확장 대비) zh_vocab 그라운딩 AI로 폴백.
      }
      // 🤖 매칭 퀴즈가 없으면 AI 가 교재/레벨/레슨에 맞춰 즉석 출제 → 저장 (관리자 페이지에서 확인·조정 가능)
      let gen = await rqAiGenerate({ level, textbook, lesson_no: lessonNo, topic, lang, counts: lang === 'zh' ? { choice: 4, write: 4 } : { listen: 2, write: 2, speak: 2 } });
      /* 🧪 (2026-09-02) 검사에서 다 떨어지면 학생이 «빈손» 이 된다 — 한 번만 더 뽑아 본다.
         ⛔ 떨어진 문항을 «그래도 낸다» 로 되돌리지 말 것: 여기서 걸러지는 것은
            «정답이 보기에 없는 문항»·«문법이 깨진 문장» 이라, 내보내면 학생이 그것을
            정답으로 외운다. 못 주는 것보다 나쁘다.
         ⚠️ 재시도는 한 번뿐이다 — 학생이 기다리는 경로라 왕복을 늘리면 그게 또 사고다. */
      if (gen.ok && (!gen.questions || !gen.questions.length)) {
        console.warn('[review-quiz/auto] 검사 통과 문항 0 — 한 번 더 출제');
        gen = await rqAiGenerate({ level, textbook, lesson_no: lessonNo, topic, lang, counts: lang === 'zh' ? { choice: 4, write: 4 } : { listen: 2, write: 2, speak: 2 } });
      }
      if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
      /* ⚠️ 검사에서 다 떨어졌을 때 «화면이 뭐라고 말하는가» 가 중요하다.
         [왜 502 가 아닌가] 502 + error 코드를 주면 학생 화면(js/idx-x8.js)이 그 코드를
           그대로 그린다 — 'quiz_quality_failed' 는 학생에게 아무 뜻이 없고 「고장」으로 읽힌다
           (CLAUDE.md 「상한·검증을 새로 걸 때 화면이 그 실패를 뭐라고 말하는지」).
         [지금] `{ok:true, quiz:null}` 로 답한다. 그 화면은 이 모양을 **이미** 알고
           「맞춤 퀴즈가 아직 없어요. 전체 목록을 보여드릴게요」로 그린 뒤 목록으로 데려간다.
           ⟹ 학생 화면(공동 금지구역인 index.html 의 blocking 스크립트)을 한 글자도 안 고치고
              사람이 읽을 수 있는 안내가 된다.
         ⚠️ quality_blocked 는 «기록용» 이다 — 화면은 안 쓰고 로그·하니스가 본다. */
      if (!gen.questions || !gen.questions.length) {
        console.warn('[review-quiz/auto] 검사 통과 문항 0 — 목록으로 보냄:', textbook || level);
        return json({ ok: true, matched: false, quiz: null, quality_blocked: true, ...meta });
      }
      const title = `[AI] ${textbook || level || '오늘의 수업'}${lessonNo ? ` Lesson ${lessonNo}` : ''} 복습퀴즈`;
      const desc = lang === 'zh'
        ? `AI 자동 출제 (객관식/쓰기, 다락원 어휘 기반) — ${new Date().toISOString().slice(0, 10)}`
        : `AI 자동 출제 (듣기/쓰기/말하기) — ${new Date().toISOString().slice(0, 10)}`;
      const now = Date.now();
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, lang, created_at, updated_at) VALUES (?,?,?,1,?,?,?,'ai',?,?,?)`)
        .bind(title, desc, JSON.stringify(gen.questions), level || null, textbook || null, lessonNo, lang === 'zh' ? 'zh' : null, now, now).run();
      const newId = (ins as any).meta?.last_row_id;
      const nrow: any = await env.DB.prepare(`SELECT * FROM review_quizzes WHERE id=?`).bind(newId).first();
      return json({ ok: true, matched: false, generated: true, quiz: pickSafe(nrow), ...meta });
    }

    // ── POST /api/admin/review-quiz/ai-generate — 관리자: AI 자동 출제 (저장 전 미리보기) ──
    if (method === 'POST' && path === '/api/admin/review-quiz/ai-generate') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const gen = await rqAiGenerate({
        level: String(b.level || '').trim(),
        textbook: String(b.textbook || '').trim(),
        lesson_no: Number(b.lesson_no) > 0 ? Number(b.lesson_no) : null,
        topic: String(b.topic || '').trim().slice(0, 300),
        counts: b.counts || { listen: 2, write: 2, speak: 2, choice: 2 },
      });
      if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
      /* 🧪 떨어진 문항도 «왜» 와 함께 돌려준다 — 감추면 관리자는 「왜 4개만 나왔지」만 보고
         AI 가 이상하다고 생각한다. 무엇이 걸렸는지 보여야 프롬프트·레벨을 고칠 수 있다. */
      return json({
        ok: true, questions: gen.questions,
        dropped: (gen as any).dropped || [], raw_count: (gen as any).raw_count,
        dropped_summary: summarizeRejects(((gen as any).dropped) || []),
      });
    }

    // ── POST /api/admin/review-quiz/build-bank — 관리자: 교재(또는 레벨)별 40문제 은행 점진 생성 ──
    //   한 번 호출 = AI 1배치(듣기4·말하기3·사지선다3 = 10문항) 생성 후 해당 교재 은행에 누적.
    //   클라이언트가 bank_size<target 동안 반복 호출 → ~40문제 은행 완성. draw 설정으로 학생은 랜덤 10출제.
    if (method === 'POST' && path === '/api/admin/review-quiz/build-bank') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const textbook = String(b.textbook || '').trim();
      const level = String(b.level || '').trim();
      const topic = String(b.topic || '').trim().slice(0, 300);
      const target = Math.min(Math.max(Number(b.target) || 40, 10), 60);
      if (!textbook && !level) return json({ ok: false, error: 'textbook_or_level_required' }, 400);
      const keyCol = textbook ? 'textbook' : 'level';
      const keyVal = textbook || level;
      const existing: any = await env.DB.prepare(`SELECT id, questions FROM review_quizzes WHERE source='bank' AND ${keyCol} = ? LIMIT 1`).bind(keyVal).first();
      let qs: any[] = []; if (existing) { try { qs = JSON.parse(existing.questions) || []; } catch {} }
      if (qs.length >= target) return json({ ok: true, id: existing.id, bank_size: qs.length, target, done: true });
      const gen = await rqAiGenerate({ level, textbook, lesson_no: null, topic, counts: { listen: 4, write: 3, speak: 3, choice: 0 } });
      if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
      /* 🧪 검사 통과분만 은행에 쌓는다. 한 배치가 통째로 떨어질 수 있는데(레벨이 낮은 교재에서
         모델이 긴 문장을 내는 경우) 그건 실패가 아니라 «이번엔 못 건졌다» 이다 —
         부르는 쪽이 반복 호출하므로 다음 배치에서 채워진다. 화면에 그 수를 알린다. */
      const dropped = ((gen as any).dropped || []) as any[];
      qs = qs.concat(gen.questions);
      if (qs.length > target) qs = qs.slice(0, target);
      const drawJson = JSON.stringify({ listen: 4, write: 3, speak: 3 });
      const now = Date.now();
      if (existing) {
        await env.DB.prepare(`UPDATE review_quizzes SET questions=?, draw=?, active=1, updated_at=? WHERE id=?`).bind(JSON.stringify(qs), drawJson, now, existing.id).run();
        return json({ ok: true, id: existing.id, bank_size: qs.length, target, done: qs.length >= target,
                      dropped: dropped.length, dropped_summary: summarizeRejects(dropped) });
      }
      const title = textbook ? `\u{1F4DA} ${textbook}` : `\u{1F3F7}\uFE0F ${level}`;
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, draw, created_at, updated_at) VALUES (?,?,?,1,?,?,?,'bank',?,?,?)`)
        .bind(title, '교재 은행에서 듣기4·쓰기3·말하기3 랜덤 10출제', JSON.stringify(qs), level || null, textbook || null, null, drawJson, now, now).run();
      return json({ ok: true, id: (ins as any).meta?.last_row_id, bank_size: qs.length, target, done: qs.length >= target,
                    dropped: dropped.length, dropped_summary: summarizeRejects(dropped) });
    }

    // ── GET /api/admin/review-quiz/list — 관리자: 전체 퀴즈 (정답 포함 + 응시수) ──
    if (method === 'GET' && path === '/api/admin/review-quiz/list') {
      await ensureReviewQuizTables();
      const rs = await env.DB.prepare(`SELECT q.*, (SELECT COUNT(*) FROM review_quiz_results r WHERE r.quiz_id = q.id) AS attempt_count FROM review_quizzes q ORDER BY q.id DESC`).all();
      const quizzes = (((rs.results as any[]) || [])).map((row: any) => {
        let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
        return { ...row, questions: qs };
      });
      return json({ ok: true, quizzes });
    }

    // ── POST /api/admin/review-quiz/save — 관리자: 생성/수정 (id 있으면 수정) ──
    if (method === 'POST' && path === '/api/admin/review-quiz/save') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const title = String(b.title || '').trim();
      if (!title) return json({ ok: false, error: 'title_required' }, 400);
      const description = String(b.description || '').trim();
      const parsed = rqParseQuestions(b.questions);
      if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);
      const active = (b.active === 0 || b.active === false) ? 0 : 1;
      const level = String(b.level || '').trim() || null;
      const textbook = String(b.textbook || '').trim() || null;
      const lessonNo = Number(b.lesson_no) > 0 ? Number(b.lesson_no) : null;
      const source = b.source === 'ai' ? 'ai' : 'manual';
      const now = Date.now();
      const id = Number(b.id) || 0;
      if (id) {
        const r = await env.DB.prepare(`UPDATE review_quizzes SET title=?, description=?, questions=?, active=?, level=?, textbook=?, lesson_no=?, updated_at=? WHERE id=?`)
          .bind(title, description, JSON.stringify(parsed.list), active, level, textbook, lessonNo, now, id).run();
        if (!((r as any).meta && (r as any).meta.changes)) return json({ ok: false, error: 'quiz_not_found' }, 404);
        return json({ ok: true, id });
      }
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(title, description, JSON.stringify(parsed.list), active, level, textbook, lessonNo, source, now, now).run();
      return json({ ok: true, id: (ins as any).meta?.last_row_id });
    }

    // ── POST /api/admin/review-quiz/toggle — 관리자: 활성/비활성 ──
    if (method === 'POST' && path === '/api/admin/review-quiz/toggle') {
      await ensureReviewQuizTables();
      const b: any = await request.json().catch(() => ({}));
      const id = Number(b.id) || 0;
      if (!id) return json({ ok: false, error: 'id_required' }, 400);
      const active = (b.active === 0 || b.active === false) ? 0 : 1;
      await env.DB.prepare(`UPDATE review_quizzes SET active=?, updated_at=? WHERE id=?`).bind(active, Date.now(), id).run();
      return json({ ok: true, id, active });
    }

    // ── DELETE /api/admin/review-quiz/:id — 관리자: 삭제 (결과 기록도 함께) ──
    if (method === 'DELETE' && /^\/api\/admin\/review-quiz\/\d+$/.test(path)) {
      await ensureReviewQuizTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM review_quizzes WHERE id=?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM review_quiz_results WHERE quiz_id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── GET /api/admin/review-quiz/results?quiz_id=N — 관리자: 학생 응시 결과 ──
    if (method === 'GET' && path === '/api/admin/review-quiz/results') {
      await ensureReviewQuizTables();
      const quizId = parseInt(url.searchParams.get('quiz_id') || '0', 10);
      let q = `SELECT r.*, q.title AS quiz_title FROM review_quiz_results r LEFT JOIN review_quizzes q ON q.id = r.quiz_id`;
      const binds: any[] = [];
      if (quizId) { q += ` WHERE r.quiz_id = ?`; binds.push(quizId); }
      q += ` ORDER BY r.created_at DESC LIMIT 500`;
      const rs = await env.DB.prepare(q).bind(...binds).all();
      return json({ ok: true, results: rs.results || [] });
    }


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
        `SELECT 1 FROM attendance WHERE user_id = ? AND date = ? LIMIT 1`
      ).bind(uid, today).first();
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

    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase AV — AI 음성 코칭 (Workers AI Whisper 전사 + LLM 피드백)
    //   POST /api/voice/transcribe — multipart/form-data 의 audio 파일 받아 Whisper 로 전사
    //   POST /api/voice/coach      — 학생 발화 텍스트 + 모범 텍스트 → AI 피드백 + 점수
    //   GET  /api/voice/history    — 학생별 최근 음성 코칭 이력
    // ═══════════════════════════════════════════════════════════════
    const ensureVoiceTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, target_text TEXT, transcribed_text TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, ai_feedback TEXT, suggestion TEXT, audio_url TEXT, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_voice_student ON voice_coaching(student_uid, created_at DESC)`); } catch {}
      // 🎧 (2026-07-30) 음향 채점 보정용 원자료. 임계값(ACOUSTIC_TUNING)이 아직 잠정치라,
      //   실사용 분포를 봐야 "웅얼거림"의 실제 경계를 정할 수 있다. 점수가 아니라 원값을 남긴다.
      //   ADD COLUMN 은 기존 행을 건드리지 않는다(추가만). 이미 있으면 예외 → 무시.
      // 🎤 (2026-08-08) Azure 음소 발음평가 원값. Whisper 확신도 방식과 «나란히» 남겨야
      //   두 자(尺)가 얼마나 다른지 실측으로 비교할 수 있다(도입 판단의 근거).
      for (const col of ['avg_logprob REAL', 'no_speech_prob REAL', 'speech_rate REAL', 'max_gap REAL', 'acoustic_used INTEGER',
                         'azure_accuracy REAL', 'azure_fluency REAL', 'azure_completeness REAL', 'azure_used INTEGER',
                         'azure_diag TEXT']) {
        try { await env.DB.exec(`ALTER TABLE voice_coaching ADD COLUMN ${col}`); } catch { /* 이미 존재 */ }
      }
    };

    // ── POST /api/voice/tts — 모범 음성 (원어민 TTS: Deepgram Aura-1 / MeloTTS) ──
    if (method === 'POST' && path === '/api/voice/tts') {
      try {
        const b: any = await request.json().catch(() => ({}));
        // 400자 컷은 문장 중간에서 낭독이 뚝 끊기는 원인이었다 — Aura 한도(2000자) 안에서 여유있게.
        const text = String(b.text || '').trim().slice(0, 1500);
        const lang = String(b.lang || 'en').toLowerCase();
        if (!text) return json({ ok: false, error: 'text_required' }, 400);
        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        const audioHeaders = {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=604800',
          'Access-Control-Allow-Origin': '*'
        };
        const b64ToBytes = (b64: string) => {
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          return u8;
        };
        // 🔁 R2 캐시: 같은 단어/문장은 1회만 생성 → 이후엔 뉴런 소모 없이 즉시 제공.
        //   무료 뉴런 소진(429) 후에도 캐시본이 있으면 계속 소리가 난다.
        const r2: any = (env as any).RECORDINGS;
        let cacheKey = '';
        try {
          // v2: 영어 TTS 를 Aura-2 로 올리면서 캐시 세대 교체 (v1 캐시본은 구형 Aura-1 음성)
          // v3: CF 발신 Google TTS 가 깨진 오디오를 반환하던 시기의 zh 캐시본 오염 제거(2026-07-18)
          //     ⚠️ zh 는 현재 서버 정상 경로 없음(Google=CF발 오염·MeloTTS zh=잡음) → 프론트가
          //     앱 네이티브 TTS/브라우저 음성을 우선하도록 정리됨. 서버 zh 는 최후 폴백일 뿐.
          // v4: Aura-1 폴백 음성이 «요청 화자» 키로 저장되던 오염 제거(2026-08-31).
          //     Lily(delia)가 한 번 폴백하면 그 문장은 영영 Emma 목소리(asteria)로 재생됐다.
          const enc = new TextEncoder().encode('v4|' + lang + '|' + String(b.speaker || 'asteria') + '|' + text);
          const dig = await crypto.subtle.digest('SHA-256', enc);
          cacheKey = 'tts/' + [...new Uint8Array(dig)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
        } catch {}
        if (cacheKey && r2) {
          /* 캐시본은 «실제로 쓴 화자» 키로만 저장하므로(아래 폴백 블록) 이 바이트는
             요청 화자 그대로다 → 진단 헤더도 그렇게 실어 준다. 없으면 화면이
             「지금 소리가 고른 목소리인가」를 캐시 적중 때만 판정하지 못한다. */
          try {
            const hit = await r2.get(cacheKey);
            if (hit) return new Response(hit.body, { headers: { ...audioHeaders,
              'X-TTS-Engine': 'r2-cache', 'X-TTS-Speaker': String(b.speaker || 'asteria').toLowerCase() } });
          } catch {}
        }
        /* 캐시 저장 — 키를 받는 형태로 둔다. Aura-1 폴백은 «요청 화자» 가 아니라
           «실제로 쓴 화자» 키로 저장해야 하기 때문이다(아래 폴백 블록 주석 참고). */
        const ttsKey = async (spk: string) => {
          const e = new TextEncoder().encode('v4|' + lang + '|' + spk + '|' + text);
          const d = await crypto.subtle.digest('SHA-256', e);
          return 'tts/' + [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
        };
        const putCacheAs = async (key: string, bytes: ArrayBuffer | Uint8Array) => {
          if (!key || !r2) return;
          try { await r2.put(key, bytes, { httpMetadata: { contentType: 'audio/mpeg' } }); } catch {}
        };
        const putCache = (bytes: ArrayBuffer | Uint8Array) => putCacheAs(cacheKey, bytes);
        const isQuota = (m: any) => /429|neuron|allocation|free allocation|capacity/i.test(String(m || ''));
        // MeloTTS — base64 MP3 반환 (en/zh 지원)
        //   ⚠️ 캐시 금지: Aura 일시 장애 때 만들어진 기계음이 Aura 화자 키에 저장되면
        //   장애가 끝나도 그 문장은 영원히 기계음으로 재생된다(캐시 오염). 폴백은 그때그때만.
        const melo = async (meloLang: string) => {
          const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: meloLang });
          const b64 = typeof r === 'string' ? r : (r?.audio || '');
          if (!b64) throw new Error('melotts_empty');
          const bytes = b64ToBytes(b64);
          return new Response(bytes, { headers: audioHeaders });
        };
        // MeloTTS 원본 바이트 (크기 검증용 — Workers AI 가 빈 WAV(44B) 반환하는 케이스 감지)
        const meloBytes = async (meloLang: string) => {
          const r: any = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang: meloLang });
          const b64 = typeof r === 'string' ? r : (r?.audio || '');
          return b64 ? b64ToBytes(b64) : new Uint8Array(0);
        };
        // Google 번역 TTS — 원어민 만다린 폴백 (MeloTTS zh 가 빈 오디오일 때).
        //   client=tw-ob 엔드포인트는 MP3 스트림 반환. 요청당 ~200자 제한이라 잘라서 전송.
        const gtts = async (txt: string, tl: string) => {
          const q = encodeURIComponent(String(txt).slice(0, 190));
          const gurl = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + tl + '&q=' + q;
          const gr = await fetch(gurl, { headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
          } });
          if (!gr.ok) throw new Error('gtts_' + gr.status);
          const gb = await gr.arrayBuffer();
          if (!gb || gb.byteLength < 300) throw new Error('gtts_empty');
          await putCache(gb);
          return new Response(gb, { headers: audioHeaders });
        };

        // 중국어 → 진짜 원어민 만다린. ⚠️ Cloudflare @cf/myshell-ai/melotts(zh) 는 비어있지 않은
        //   불량 WAV(51KB짜리 "앙캉캉캉" 잡음)를 반환해 크기검사로도 못 거른다. 그래서 zh 는
        //   Google 번역 TTS(원어민 만다린 MP3)를 1순위로 쓰고, 실패 시에만 MeloTTS 로 폴백한다.
        if (lang.startsWith('zh') || lang === 'cn') {
          try {
            return await gtts(text, 'zh-CN');
          } catch (gErr: any) {
            console.warn('[voice/tts] google zh failed, fallback melotts:', gErr?.message);
            try {
              const bytes = await meloBytes('zh');
              if (bytes.byteLength >= 1000) return new Response(bytes, { headers: audioHeaders });
            } catch {}
            return json({ ok: false, error: 'zh_tts_failed' }, 502);
          }
        }

        // 영어 → Deepgram Aura-2 (차세대, 훨씬 자연스러움) → Aura-1 → MeloTTS(en) 순 폴백
        //   ⚠️ 무료 뉴런 소진 시 Workers AI 는 200 이 아닌 429 에러 Response(JSON) 를 준다.
        //   예전 코드는 그 JSON 바디(~487B)를 audio/mpeg 로 그대로 브라우저에 내보내서
        //   "소리가 안 나는" 원인이 됐다. raw.ok + content-type=audio 로 진짜 음성만 통과시킨다.
        let quota = false;
        const auraRun = async (model: string, speaker: string): Promise<ArrayBuffer> => {
          const raw: any = await ai.run(model, { text, speaker }, { returnRawResponse: true });
          let buf: ArrayBuffer | null = null;
          if (raw instanceof Response) {
            const rct = raw.headers.get('content-type') || '';
            if (raw.ok && /audio/i.test(rct)) buf = await raw.arrayBuffer();
            else { if (raw.status === 429) quota = true; throw new Error('aura_http_' + raw.status); }
          }
          else if (raw instanceof ArrayBuffer) buf = raw;
          else if (raw && raw.body) buf = await new Response(raw.body).arrayBuffer();
          else if (raw && raw.audio) buf = b64ToBytes(String(raw.audio)).buffer as ArrayBuffer;
          if (!buf || buf.byteLength < 200) throw new Error('aura_empty');
          return buf;
        };
        const requested = String(b.speaker || 'asteria').toLowerCase();
        // Aura-2(en) 지원 화자 — 목록 밖 이름이 오면 여자 기본값으로 안전하게.
        const AURA2 = new Set(['amalthea','andromeda','apollo','arcas','aries','asteria','athena','atlas','aurora','callista','cora','cordelia','delia','draco','electra','harmonia','helena','hera','hermes','hyperion','iris','janus','juno','jupiter','luna','mars','minerva','neptune','odysseus','ophelia','orion','orpheus','pandora','phoebe','pluto','saturn','thalia','theia','vesta','zeus']);
        const AURA2_MALE = new Set(['apollo','arcas','aries','atlas','draco','hermes','hyperion','janus','jupiter','mars','neptune','odysseus','orion','orpheus','pluto','saturn','zeus']);
        const AURA1 = new Set(['angus','asteria','arcas','orion','orpheus','athena','luna','zeus','perseus','helios','hera','stella']);
        try {
          const spk2 = AURA2.has(requested) ? requested : 'asteria';
          /* 🔁 한 번 더 물어본다 — 「목소리가 계속 변해」(2026-08-31 사장님 제보)의 첫 겹.
             Aura-2 가 «한 번» 흔들리면 그 문장만 Aura-1 이 읽는데, 화자가 바뀌므로
             (Noah=aries → orion) 대화 중간에 다른 사람이 끼어든 것처럼 들린다.
             한 번 더 물어보면 일시적 흔들림은 여기서 끝나고 고른 목소리가 유지된다.
             ⛔ 뉴런 소진(429)에는 재시도하지 않는다 — 답이 같고 시간만 늘어난다.
             ⛔ 폴백 자체를 없애지는 않는다 — 소리가 아예 안 나는 것이 더 나쁘다. */
          let buf: ArrayBuffer;
          try {
            buf = await auraRun('@cf/deepgram/aura-2-en', spk2);
          } catch (firstErr: any) {
            if (quota || isQuota(firstErr?.message)) throw firstErr;
            console.warn('[voice/tts] aura-2 retry after:', firstErr?.message);
            await new Promise((r) => setTimeout(r, 150));
            buf = await auraRun('@cf/deepgram/aura-2-en', spk2);
          }
          await putCache(buf);
          // 진단 헤더 — 「고른 목소리가 아닌 소리가 난다」 제보를 코드가 아니라 응답으로 가른다
          return new Response(buf, { headers: { ...audioHeaders, 'X-TTS-Engine': 'aura-2', 'X-TTS-Speaker': spk2 } });
        } catch (a2Err: any) {
          if (isQuota(a2Err?.message)) quota = true;
          console.warn('[voice/tts] aura-2 failed, fallback aura-1:', a2Err?.message);
        }
        try {
          /* Aura-1 폴백 — 요청 화자가 Aura-1 목록에 없으면 성별을 맞춰 대체한다.
             ⛔ 여자 대체를 'asteria' 로 하면 안 된다 — 그것은 화면의 «Emma» 전용 목소리라,
                Lily(delia)가 한 번 폴백하는 순간 «Lily 를 골랐는데 Emma 목소리» 가 된다.
                2026-08-31 사장님 제보가 정확히 이것이었다(「번갈아를 안 눌렀는데 Emma 로 바뀜」).
             ✅ 그래서 사람마다 다른 목소리로 떨어지게 두고, 화면이 쓰는 네 친구의 기본 화자는
                폴백해도 서로 겹치지 않아야 한다(voice_fallback_harness 가 그것을 검사한다). */
          const AURA1_SUB: Record<string, string> = {
            // 여자 (Emma=asteria 는 대체값으로 쓰지 않는다)
            delia: 'luna', amalthea: 'athena', thalia: 'hera', aurora: 'luna',
            cora: 'athena', phoebe: 'hera', andromeda: 'stella',
            // 남자
            aries: 'orion', atlas: 'zeus', hermes: 'orpheus', apollo: 'perseus',
          };
          const spk1 = AURA1.has(requested)
            ? requested
            : (AURA1_SUB[requested] || (AURA2_MALE.has(requested) ? 'orion' : 'luna'));
          const buf = await auraRun('@cf/deepgram/aura-1', spk1);
          /* ⚠️ «요청 화자» 키로 저장하면 안 된다 — 일시 장애가 영구가 된다.
             바로 아래 melotts 주석이 같은 이유로 «캐시 금지» 를 못 박고 있었는데
             이 한 단계만 빠져 있었다. 실제로 쓴 화자(spk1) 키로 저장하면
             ① 요청 화자 키는 비어 있어 다음에 Aura-2 가 살아나면 제대로 만들고
             ② 그 화자를 진짜로 고른 사람은 이 캐시를 정상적으로 재사용한다. */
          await putCacheAs(await ttsKey(spk1), buf);
          return new Response(buf, { headers: { ...audioHeaders, 'X-TTS-Engine': 'aura-1', 'X-TTS-Speaker': spk1 } });
        } catch (auraErr: any) {
          if (isQuota(auraErr?.message)) quota = true;
          console.warn('[voice/tts] aura-1 failed, fallback melotts:', auraErr?.message);
          try {
            return await melo('en');
          } catch (meloErr: any) {
            if (isQuota(meloErr?.message)) quota = true;
            // 서버 TTS 전부 실패 → JSON 에러로 명확히 알린다(브라우저가 기기 음성으로 폴백하게).
            return json({ ok: false, error: quota ? 'ai_quota_exceeded' : 'tts_failed', quota }, quota ? 503 : 502);
          }
        }
      } catch (e: any) {
        console.warn('[voice/tts] error:', e?.message);
        return json({ ok: false, error: e?.message || 'tts_failed' }, 500);
      }
    }

    /* ── GET /api/voice/azure-token — 브라우저 발음평가용 «10분 임시 출입증» (2026-08-08) ──
       왜: Azure 의 REST 짧은오디오 창구는 Pronunciation-Assessment 헤더를 **무시한다**(실측 확정).
           평가는 브라우저 Speech SDK 가 직접 해야 한다. 그런데 SDK 에 구독 키를 주면
           **키가 학생 브라우저로 나간다** — 그건 절대 안 된다.
       → Azure 가 주는 «임시 토큰»(유효 10분)만 내려보낸다. 키는 서버에만 남는다.
       ⛔ 이 토큰으로 할 수 있는 일은 우리 Speech 리소스의 음성 인식뿐이고, 10분 뒤 죽는다. */
    if (method === 'GET' && path === '/api/voice/azure-token') {
      const key = String((env as any).AZURE_SPEECH_KEY || '').trim();
      const region = String((env as any).AZURE_SPEECH_REGION || '').trim().toLowerCase();
      if (!key || !region) return json({ ok: false, error: 'azure_not_configured' }, 503);
      try {
        const r = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
          method: 'POST',
          headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Length': '0' },
        });
        if (!r.ok) {
          console.warn('[azure-token] http', r.status);
          return json({ ok: false, error: 'issue_failed_' + r.status }, 502);
        }
        const token = (await r.text()).trim();
        if (!token) return json({ ok: false, error: 'empty_token' }, 502);
        // 실제 유효기간은 10분. 화면이 9분마다 새로 받도록 여유를 두고 알려 준다.
        return json({ ok: true, token, region, expires_in: 540 });
      } catch (e: any) {
        console.warn('[azure-token] error', e?.message);
        return json({ ok: false, error: 'issue_error' }, 502);
      }
    }

    // ── POST /api/voice/transcribe — 오디오 → 텍스트 (Whisper) ──
    //   ⚠️ (2026-07-24 직원 피드백 사고) 언어 힌트를 안 주면 Whisper 가 짧은 영어 발화를
    //      한국어로 오인식한다("Hello nice to meet you" → "안녕하세요 잘생겼어요"). 그러면
    //      /api/voice/coach 가 "한국어로 말했다"며 항상 0점을 준다. → 기대 언어를 반드시 전달.
    //      language 힌트를 받는 whisper-large-v3-turbo 를 우선 사용하고, 실패 시 구 whisper 로 폴백.
    if (method === 'POST' && path === '/api/voice/transcribe') {
      try {
        const ct = request.headers.get('content-type') || '';
        let audio: ArrayBuffer | null = null;
        let hintLang = '';
        let hintPrompt = '';
        let paReference = '';   // 🎤 Azure 발음평가 모범 문장 (Whisper 로는 절대 안 넘어간다)
        if (ct.includes('multipart/form-data')) {
          const fd = await request.formData();
          const file = fd.get('audio') as File | null;
          if (!file) return json({ ok: false, error: 'no_audio_file' }, 400);
          audio = await file.arrayBuffer();
          hintLang = String(fd.get('lang') || '').trim().toLowerCase();
          // ⛔ (2026-07-30) 채점 화면에서는 이걸 절대 보내지 말 것.
          //   initial_prompt 는 디코더를 그 텍스트 쪽으로 기울인다. 발음을 채점하는 화면
          //   (speech-coach)에서 모범 문장을 넣으면 발음이 엉망이어도 정답 문장이 그대로
          //   전사돼, 텍스트 비교 채점기(voice-score.ts)가 항상 100점을 준다.
          //   07-29 에 음성코치가 이걸 보내다가 만점만 나와서 07-30 에 제거했다.
          //   자유발화 받아쓰기(고유명사 힌트 등) 용도로만 쓸 것.
          hintPrompt = String(fd.get('prompt') || '').trim().slice(0, 300);
          /* 🎤 (2026-08-08) Azure 발음평가용 «모범 문장». ⛔ 위 hintPrompt 와 절대 섞지 말 것 —
             이 값이 Whisper 의 initial_prompt 로 흘러가면 07-29 만점 사고가 그대로 재현된다.
             Azure 는 소리를 음소 단위로 재므로 모범 문장을 알아도 점수가 후해지지 않는다. */
          paReference = String(fd.get('reference') || '').trim().slice(0, 500);
        } else {
          audio = await request.arrayBuffer();
          hintLang = String(url.searchParams.get('lang') || '').trim().toLowerCase();
          hintPrompt = String(url.searchParams.get('prompt') || '').trim().slice(0, 300);
        }
        if (!audio || audio.byteLength < 100) return json({ ok: false, error: 'audio_too_small' }, 400);
        if (audio.byteLength > 25 * 1024 * 1024) return json({ ok: false, error: 'audio_too_large', max: '25MB' }, 400);

        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        // 기대 언어 정규화(ISO-639-1). 지원 밖이면 힌트 없이 자동감지로 둔다.
        const langMap: Record<string, string> = { en: 'en', ko: 'ko', zh: 'zh', 'zh-cn': 'zh' };
        const lang = langMap[hintLang] || '';

        /* 🎤 (2026-08-08) Azure 음소 발음평가 — Whisper 전사와 «동시에» 돌린다.
           · 키(AZURE_SPEECH_KEY·AZURE_SPEECH_REGION)가 없으면 assessPronunciation 이
             그냥 null 을 준다 → 지금까지의 동작과 100% 동일. 없는 채로도 서비스는 굴러간다.
           · 실패·타임아웃도 전부 null 이다. 발음평가 때문에 수업이 멈추면 안 된다.
           · WAV 가 아니면(구 브라우저의 webm 폴백) 역시 null — Azure 는 webm 을 못 받는다.
           Promise 를 먼저 띄워 두고 Whisper 가 끝난 뒤 await 한다 = 왕복이 겹쳐 지연이 안 늘어난다. */
        /* 🔴 (2026-08-08 실측) Whisper 와 «동시에» 부르면 안 된다.
           처음엔 왕복을 겹쳐 지연을 줄이려고 Promise 를 먼저 띄웠는데, 그러면 Azure 쪽이
           **본문 없는 400** 또는 «Network connection lost» 로 들쭉날쭉 실패했다.
           같은 오디오 버퍼를 두 소비자가 물고, 그 사이에 Workers AI 호출이 끼면서
           바깥 요청이 성립하지 않는다. 사본을 떠도 마찬가지였다.
           → **전사가 끝난 뒤 순차로** 부른다. 0.5~1초 늘지만 결과가 확실하다. */
        const runAzure = async (): Promise<any> => {
          if (!paReference) return { ok: false, reason: 'no_reference' };
          try { return await assessPronunciation(env as any, audio, paReference, lang || 'en'); }
          catch (e: any) { return { ok: false, reason: 'throw ' + String(e?.message || e).slice(0, 80) }; }
        };
        /* 🔍 결과를 «점수» 와 «사유» 로 나눠 돌려준다. 사유가 없으면 실패가 전부 조용한 null 이라
           «키가 틀렸나 / 소리를 못 알아들었나» 를 구분할 수 없다(붙이던 날 밤에 실제로 헤맸다).
           ⛔ azure_diag 에는 사유 «이름» 만 담긴다 — 키도, 응답 본문도 들어가지 않는다. */
        const azureOut = async () => {
          const r: any = await runAzure();
          return { azure: (r && r.ok) ? r : null, azure_diag: r ? (r.ok ? 'ok' : r.reason) : 'none' };
        };

        // whisper-large-v3-turbo 는 audio 를 base64 문자열로 받고 language 힌트를 지원한다.
        if (lang) {
          try {
            const bytes = new Uint8Array(audio);
            let binary = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
              binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
            }
            const b64 = btoa(binary);
            const turboParams: any = {
              audio: b64, language: lang, task: 'transcribe', vad_filter: true,
              // 🚫 환각 억제 — 07-29 에 initial_prompt(정답 유출)로 잡으려다 만점 사고가 났다.
              //   Whisper 가 제공하는 정식 수단은 이쪽이다. 정답을 알려주지 않으므로 채점에 안전하다.
              condition_on_previous_text: false,   // 앞 문맥에 이끌린 반복·환각 루프 차단
              hallucination_silence_threshold: 2,  // 2초 이상 침묵 구간은 건너뜀(무음에서 문장 지어내기 방지)
            };
            if (hintPrompt) turboParams.initial_prompt = hintPrompt;
            const turbo: any = await ai.run('@cf/openai/whisper-large-v3-turbo', turboParams);
            const tt = String(turbo?.text || '').trim();
            // 🎧 (2026-07-30) segments/transcription_info 를 함께 돌려준다 — 발음 채점(또렷함·흐름)이
            //   avg_logprob·no_speech_prob·단어 타이밍을 쓴다. 텍스트만으로는 또렷함을 잴 수 없다.
            //   구 whisper 폴백 경로에는 이 정보가 없다 → 그때는 채점이 옛 텍스트 방식으로 자동 복귀.
            if (tt) return json({
              ok: true, text: tt, vtt: turbo?.vtt || null, word_count: turbo?.word_count || 0, lang,
              segments: Array.isArray(turbo?.segments) ? turbo.segments.slice(0, 30) : null,
              transcription_info: turbo?.transcription_info || null,
              // 🎤 발음평가 결과(없으면 null) + 왜 없는지. 프론트는 azure 를 /api/voice/coach 로 넘긴다.
              ...(await azureOut()),
            });
          } catch (turboErr: any) {
            console.warn('[voice/transcribe] turbo failed, fallback base whisper:', turboErr?.message);
          }
        }

        // 폴백: 구 whisper (언어 힌트 미지원, 자동감지)
        const arr = [...new Uint8Array(audio)];
        const result = await ai.run('@cf/openai/whisper', { audio: arr });
        return json({ ok: true, text: result?.text || '', vtt: result?.vtt || null, word_count: result?.word_count || 0, lang: lang || null, ...(await azureOut()) });
      } catch (e: any) {
        console.warn('[voice/transcribe] error:', e?.message);
        return json({ ok: false, error: e?.message || 'transcribe_failed' }, 500);
      }
    }

    // ── POST /api/voice/coach — 발음/유창성 평가 + LLM 피드백 ──
    if (method === 'POST' && path === '/api/voice/coach') {
      await ensureVoiceTable();
      const b: any = await request.json().catch(() => ({}));
      const target = String(b.target || '').trim();
      const spoken = String(b.spoken || '').trim();
      const studentUid = String(b.student_uid || '').trim() || 'guest';
      const studentName = String(b.student_name || '').trim();

      if (!target || !spoken) return json({ ok: false, error: 'target_and_spoken_required' }, 400);
      // 🔐 [무결성] 실계정 uid 로 남의 연습기록 오염 차단 (2026-07-19) — 기록이 발화이력/학부모 화면에 노출됨.
      //   게스트(guest*)는 통과(익명 연습 지원, 프론트 기본값 'guest'), 실계정은 토큰 소유자 OR 관리자.
      // 🔐 실계정 uid 로 남의 연습기록 오염 차단. 게스트(기본값 'guest' 포함) 통과. [공용 헬퍼]
      if ((await resolveOwnerScope(request, url, env as any, studentUid, b)) === 'deny') {
        return json({ ok: false, error: 'auth_required' }, 401);
      }

      // 🗣 (2026-07-24) 채점은 결정론적 정렬 채점기(voice-score.ts)로 — 변별력 확보(하니스로 검증).
      //   기존 '단어 집합 겹침'은 순서·중복·딴소리를 못 걸러 잘하든 못하든 점수가 비슷했다.
      // 🎧 (2026-07-30) 전사 때 받은 Whisper 음향정보를 함께 넘긴다 — 또렷함/흐름을 텍스트가 아닌
      //   음향(avg_logprob·단어 타이밍)으로 잰다. 없으면 채점기가 알아서 옛 텍스트 방식으로 동작.
      //   ⚠️ 프론트가 보내는 값이라 위조 가능하지만, spoken(전사 텍스트)도 원래 프론트가 보낸다.
      //      서버가 오디오를 다시 받지 않는 한 신뢰모델은 이전과 동일하다.
      const acousticIn = (b && typeof b.acoustic === 'object' && b.acoustic) ? {
        segments: Array.isArray(b.acoustic.segments) ? b.acoustic.segments.slice(0, 30) : undefined,
        transcription_info: (b.acoustic.transcription_info && typeof b.acoustic.transcription_info === 'object')
          ? b.acoustic.transcription_info : undefined,
      } : null;
      /* 🎤 (2026-08-08) Azure 음소 발음평가가 있으면 «또렷함·흐름» 을 그것으로 대체한다.
         Whisper 확신도는 흔한 문장을 뭉갠 경우를 원리적으로 못 잡는다(voice-score.ts 한계 4).
         ⚠️ 프론트가 보내는 값이라 위조 가능하다 — 단 spoken(전사 텍스트)도 원래 프론트가 보내므로
            신뢰모델은 이전과 동일하다. 0~100 범위 밖은 채점기가 잘라낸다. */
      const azureIn = (b && typeof b.azure === 'object' && b.azure && b.azure.ok === true) ? {
        accuracy: Number(b.azure.accuracy), fluency: Number(b.azure.fluency),
        completeness: Number(b.azure.completeness), pron: Number(b.azure.pron),
      } : null;
      const sc = applyAzurePronunciation(scoreVoiceCoach(target, spoken, acousticIn), azureIn);
      const ac = analyzeAcoustic(acousticIn);   // 보정용 원자료(점수가 아니라 raw 값)를 함께 남긴다
      const accuracy = sc.accuracy;
      const pronunciation = sc.pronunciation;
      const fluency = sc.fluency;
      const overall = sc.overall;
      const tier = scoreTier(overall);

      // Workers AI LLM 은 '피드백 문구'만 담당(점수는 위 결정론 채점기가 권위).
      let aiFeedback = '';
      let suggestion = '';
      const ai = (env as any).AI;
      // 언어 불일치(영어 목표에 다른 언어)는 LLM 없이 즉시 안내 — 헛도는 피드백 방지
      if (sc.langMismatch) {
        aiFeedback = '목표 문장은 이 언어가 아니에요. 모범 음성을 듣고 같은 언어로 말해보세요.';
        suggestion = '🔊 모범 음성을 먼저 듣고, 같은 언어로 또박또박 따라 말해보세요.';
      } else if (ai) {
        try {
          const prompt = `You are an English pronunciation coach for Korean students. Analyze this:

TARGET: "${target}"
STUDENT SAID: "${spoken}"
SCORE: accuracy ${accuracy}, pronunciation ${pronunciation}, fluency ${fluency} (already computed — do NOT change scores).

Respond in JSON ONLY:
{
  "feedback": "<one short Korean sentence about what was good and what to improve>",
  "suggestion": "<one Korean tip to practice next time>"
}`;
          const resp = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You are a friendly Korean-English pronunciation coach. Reply in JSON only.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 300,
          });
          let text = '';
          if (typeof resp === 'string') text = resp;
          else if (resp && typeof resp.response === 'string') text = resp.response;
          else if (resp && resp.response) text = JSON.stringify(resp.response);
          text = String(text || '');
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              const j = JSON.parse(m[0]);
              if (j.feedback) aiFeedback = String(j.feedback).slice(0, 300);
              if (j.suggestion) suggestion = String(j.suggestion).slice(0, 300);
            } catch (e) { /* fall back */ }
          }
        } catch (e: any) {
          console.warn('[voice/coach] AI fail:', e?.message);
        }
      }

      // 기본값 채우기 — 점수 구간별 동기부여 문구(긴장감·성취감)
      if (!aiFeedback) {
        aiFeedback = overall >= 95 ? '🏆 완벽해요! 발음이 아주 정확합니다.' :
                     overall >= 85 ? '🌟 훌륭해요! 거의 원어민 같아요.' :
                     overall >= 70 ? '👍 좋아요! 대부분의 단어를 잘 발음했어요.' :
                     overall >= 50 ? '💪 조금만 더! 몇 단어만 다듬으면 돼요.' :
                                     '🌱 괜찮아요, 모범 음성을 듣고 다시 도전해요!';
      }
      if (!suggestion) suggestion = '모범 문장을 3번 듣고 큰 소리로 따라 말해보세요.';

      // 저장
      const now = Date.now();
      // 🎧 음향 원자료도 같이 저장 — ACOUSTIC_TUNING 임계값을 실사용 분포로 보정하기 위한 것.
      //   옛 컬럼만 있는 DB 에서도 죽지 않게, 실패하면 원래 컬럼만으로 한 번 더 시도한다.
      try {
        await env.DB.prepare(
          `INSERT INTO voice_coaching (student_uid, student_name, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, audio_url, created_at, avg_logprob, no_speech_prob, speech_rate, max_gap, acoustic_used, azure_accuracy, azure_fluency, azure_completeness, azure_used, azure_diag) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(studentUid, studentName, target, spoken, accuracy, pronunciation, fluency, aiFeedback, suggestion, b.audio_url || null, now,
               ac.ok ? ac.lp : null, ac.ok ? ac.noSpeech : null, ac.ok ? ac.rate : null, ac.ok ? ac.maxGap : null, sc.acoustic ? 1 : 0,
               azureIn ? azureIn.accuracy : null, azureIn ? azureIn.fluency : null, azureIn ? azureIn.completeness : null, azureIn ? 1 : 0,
               String(b?.azure_diag || '').slice(0, 120) || null).run();
      } catch {
        await env.DB.prepare(
          `INSERT INTO voice_coaching (student_uid, student_name, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, audio_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(studentUid, studentName, target, spoken, accuracy, pronunciation, fluency, aiFeedback, suggestion, b.audio_url || null, now).run();
      }

      return json({
        ok: true,
        scores: { accuracy, pronunciation, fluency, overall },
        tier,
        lang_mismatch: sc.langMismatch,
        acoustic: sc.acoustic,   // 🎧 true=음향 기반 채점, false=텍스트만(구 whisper 폴백 등). 보정 확인용
        phoneme: !!sc.phoneme,   // 🎤 true=Azure 음소 발음평가 반영(소리를 «직접» 잰 점수)
        // 어느 단어가 틀렸는지 — Azure 가 있을 때만. 학생 화면에서 그 단어만 짚어 줄 수 있다.
        word_scores: (b?.azure && Array.isArray(b.azure.words)) ? b.azure.words.slice(0, 40) : null,
        feedback: aiFeedback,
        suggestion,
        word_stats: { completeness: sc.completeness, matched: sc.counts.ok, wrong: sc.counts.wrong, missing: sc.counts.missing, extra: sc.counts.extra },
      });
    }

    // ── GET /api/voice/history?uid=X — 학생별 음성 코칭 이력 ──
    if (method === 'GET' && path === '/api/voice/history') {
      await ensureVoiceTable();
      const uid = (url.searchParams.get('uid') || 'guest').trim();
      // 🔐 [PII] 본인 발화연습 이력만 — 토큰 uid 일치 요구(남의 전사·발음점수 조회 차단)
      const vhAuth = await authUidGlobal(request, url, env);
      if (!vhAuth || vhAuth !== uid) return json({ ok: false, error: 'auth_required' }, 401);
      const rs = await env.DB.prepare(
        `SELECT id, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, created_at FROM voice_coaching WHERE student_uid = ? ORDER BY created_at DESC LIMIT 30`
      ).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── GET /api/voice/stats?uid=X — 학생별 음성 코칭 통계 (그래프용)
    //   반환: 일별 평균 점수 + 총 연습 횟수 + 최고/최근 점수
    if (method === 'GET' && path === '/api/voice/stats') {
      await ensureVoiceTable();
      const uid = (url.searchParams.get('uid') || 'guest').trim();
      // 🔐 [PII] 본인(학생/학부모 토큰) 만 발음 통계 조회 — IDOR 차단
      const vsAuth = await authUidGlobal(request, url, env);
      if (!vsAuth || vsAuth !== uid) return json({ ok: false, error: 'auth_required' }, 401);
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10), 90);
      const sinceMs = Date.now() - days * 86400000;
      const rs = await env.DB.prepare(
        `SELECT accuracy_score, pronunciation_score, fluency_score, created_at FROM voice_coaching WHERE student_uid = ? AND created_at >= ? ORDER BY created_at ASC`
      ).bind(uid, sinceMs).all();
      const rows = (rs.results || []) as any[];
      // 일별 집계
      const byDay: Record<string, { acc: number[], pron: number[], flu: number[] }> = {};
      for (const r of rows) {
        const d = new Date(r.created_at).toISOString().slice(0, 10);
        if (!byDay[d]) byDay[d] = { acc: [], pron: [], flu: [] };
        byDay[d].acc.push(r.accuracy_score || 0);
        byDay[d].pron.push(r.pronunciation_score || 0);
        byDay[d].flu.push(r.fluency_score || 0);
      }
      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
      const daily = Object.keys(byDay).sort().map(d => ({
        date: d,
        accuracy: avg(byDay[d].acc),
        pronunciation: avg(byDay[d].pron),
        fluency: avg(byDay[d].flu),
        overall: Math.round((avg(byDay[d].acc) * 0.5) + (avg(byDay[d].pron) * 0.3) + (avg(byDay[d].flu) * 0.2)),
        count: byDay[d].acc.length,
      }));
      // 전체 통계
      const allAcc = rows.map(r => r.accuracy_score || 0);
      const allPron = rows.map(r => r.pronunciation_score || 0);
      const allFlu = rows.map(r => r.fluency_score || 0);
      const totalAvg = {
        accuracy: avg(allAcc),
        pronunciation: avg(allPron),
        fluency: avg(allFlu),
        overall: Math.round((avg(allAcc) * 0.5) + (avg(allPron) * 0.3) + (avg(allFlu) * 0.2)),
      };
      const best = rows.length ? Math.max(...rows.map(r => Math.round((r.accuracy_score || 0) * 0.5 + (r.pronunciation_score || 0) * 0.3 + (r.fluency_score || 0) * 0.2))) : 0;
      const latest = rows.length ? Math.round((rows[rows.length - 1].accuracy_score || 0) * 0.5 + (rows[rows.length - 1].pronunciation_score || 0) * 0.3 + (rows[rows.length - 1].fluency_score || 0) * 0.2) : 0;
      return json({
        ok: true,
        total_sessions: rows.length,
        days_active: daily.length,
        average: totalAvg,
        best_score: best,
        latest_score: latest,
        daily,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase AV 끝
    // ═══════════════════════════════════════════════════════════════

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
