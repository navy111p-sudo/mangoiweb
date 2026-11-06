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
import { handleReviewQuizApi } from './api-games-review-quiz';
import { handleVoiceApi } from './api-games-voice';
import { loadVocabTags } from './vocab-tags';   // 🏷️ 단어장 «어색한 표현» 꼬리표(2026-11-02)
import { json } from './api-util';
import { KOREAN_GLOSS_RULE, hasForeignGloss, normalizeKoreanGloss, isKoreanGloss, repairKoreanGlosses, readableKoreanVocabulary } from './korean-vocab';
import { applyPointTransaction } from './api-points';   // 🧾 포인트는 원장(point_transactions)을 거친다
import { dailyAllowance } from './point-policy';        // 🧢 하루 총량 상한(100점)을 이 경로도 지난다
import { authUidFromRequest as authUidGlobal } from './auth-token';  // 🔐 소유자 검증(IDOR 방지)
import { resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정(게스트 예외+관리자/토큰)
import type { MangoEnv } from './api-mango';
// ✒️ 문장 종결부호 정본 — 문제문·해설·읽을 문장에만 씁니다(2026-08-26).
//    ⛔ 보기(opts)는 「어려운」·「你好」·「go to school」 같은 «낱말·구» 라 찍지 않습니다.
//    ℹ️ answer_text 를 다듬어도 채점은 안 흔들립니다 — rqNorm 이 구두점을 통째로 지웁니다.
import { endSentence } from './sentence-punct';
import { ATTENDANCE_BY_UID, attUidBinds } from './attendance-uid';


// ═══════════════════════════════════════════════════════════════════════
// 🎮 게이미피케이션 공용부 — api-mango.ts 에서 이동 (3차, 2026-07-14)
//   checkAndAwardBadges 는 api-mango(영작 첨삭)도 import 해서 사용한다.
// ═══════════════════════════════════════════════════════════════════════
/**
 * 🔤 한국어 퀴즈 뜻 검사 — 깨진 글자와 한자·가나 혼입을 걸러냅니다.
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
  return t.indexOf(String.fromCharCode(0xFFFD)) === -1 && isKoreanGloss(t);
}

/** 📅 단어 간격 반복(SRS) 정본 — 플래시카드 복습(/api/vocab/review)과 단어 퀴즈(/api/vocab/quiz-submit)가 같이 쓴다.
 *  정답이면 level+1(최대 7), 오답이면 0. 다음 복습까지 일수: 0=1, 1=2, 2=4, 3=7, 4=14, 5=30, 6=60, 7=120.
 *  ⛔ 간격표를 다른 경로에 다시 적지 말 것 — 한쪽만 바뀌면 같은 단어가 경로마다 다른 날짜에 돌아온다. */
export const VOCAB_SRS_INTERVALS = [1, 2, 4, 7, 14, 30, 60, 120];
export function vocabSrsNext(level: any, correct: boolean, now: number): { level: number; days: number; next: number } {
  const cur = Number.isFinite(Number(level)) ? Math.max(0, Math.min(7, Math.floor(Number(level)))) : 0;
  const lv = correct ? Math.min(cur + 1, 7) : 0;
  const days = VOCAB_SRS_INTERVALS[lv] || 1;
  return { level: lv, days, next: now + days * 86400000 };
}

/** 🔐 (2026-10-19) 단어장 «쓰기» 본인 확인 — 남이 다른 학생의 단어장에 낱말·오답을 심지 못하게.
 *  그 오답(«단어장 약점»)은 웜업 대화·A.i 친구 프롬프트와 게임 복습 큐에 그대로 실린다(src/vocab-weak.ts).
 *  판정은 /api/vocab/review·reward·DELETE 와 같은 resolveOwnerScope 하나 — 게스트(guest*)는 통과,
 *  관리자·교사 세션은 통과, 그 밖에는 서명 토큰 uid 가 «그 단어장 주인» 과 같아야 한다.
 *  막히면 401 응답, 통과면 null. ⛔ 판정을 라우트마다 다시 적지 말 것(한쪽만 느슨해진다). */
export async function vocabWriteDenied(request: Request, url: URL, env: any, ownerUid: string, body?: any): Promise<Response | null> {
  if ((await resolveOwnerScope(request, url, env, String(ownerUid || ''), body)) !== 'deny') return null;
  return json({
    ok: false, error: 'auth_required',
    message: '🔑 로그인 정보가 만료됐어요. 다시 로그인한 뒤 해 주세요.',
    message_en: '🔑 Your login has expired. Please log in again.',
  }, 401);
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

    // Owner-gated legacy repair. Preserve original values and concurrent teacher edits.
    // 🏷️ 카드에 꼬리표(tag) 붙이기 — 단어장 목록·복습 퀴즈가 같은 것을 씀(2026-11-02). 못 읽으면 표시만 빠짐.
    const attachVocabTags = async (words: any[], uid: string) => {
      const tags = await loadVocabTags(env.DB, uid);
      if (tags.size) for (const w of words as any[]) { const t = tags.get(Number(w?.id)); if (t) w.tag = t; }
      return words;
    };
    const readableVocab = async (rows: any[], uid: string) => {
      const clean = await readableKoreanVocabulary(rows, env.AI);
      const changed = clean.map((row, i) => ({ row, before: rows[i].korean }))
        .filter(({ row, before }) => row.id && isKoreanGloss(row.korean) && row.korean !== before);
      if (changed.length) {
        try {
          await env.DB.prepare(`CREATE TABLE IF NOT EXISTS vocab_korean_repair_backup (vocab_id INTEGER NOT NULL, user_id TEXT NOT NULL, original_korean TEXT NOT NULL, repaired_korean TEXT NOT NULL, repaired_at INTEGER NOT NULL, UNIQUE(vocab_id, original_korean))`).run();
          for (let offset = 0; offset < changed.length; offset += 20) {
            const statements = changed.slice(offset, offset + 20).flatMap(({ row, before }) => [
              env.DB.prepare(`INSERT OR IGNORE INTO vocab_korean_repair_backup (vocab_id,user_id,original_korean,repaired_korean,repaired_at) SELECT id,user_id,korean,?,? FROM vocabulary WHERE id=? AND user_id=? AND korean=?`).bind(row.korean, Date.now(), row.id, uid, before),
              env.DB.prepare(`UPDATE vocabulary SET korean=? WHERE id=? AND user_id=? AND korean=?`).bind(row.korean, row.id, uid, before),
            ]);
            await env.DB.batch(statements);
          }
        } catch (error) { console.error('[vocab] Korean meaning repair persistence failed'); }
      }
      return clean;
    };

    // ── POST /api/vocab/add — 단어 추가 (AI 가 자동으로 한국어/예문 생성) ──
    if (method === 'POST' && path === '/api/vocab/add') {
      await ensureVocab();
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      const word = String(b.word || '').trim();
      if (!userId || !word) return json({ ok: false, error: 'user_id_and_word_required' }, 400);
      { const deny = await vocabWriteDenied(request, url, env, userId, b); if (deny) return deny; }   // 🔐 AI 호출(비용) 전에
      let korean = String(b.korean || '').trim();
      let example = String(b.example || '').trim();
      // AI 가 한국어/예문 자동 생성 (옵션)
      if ((!korean || !example) && (env as any).AI) {
        try {
          const resp: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You output Korean meaning and short English example. JSON only. ' + KOREAN_GLOSS_RULE },
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
      korean = (await repairKoreanGlosses([{ word, korean, example }], env.AI))[0].korean;
      if (hasForeignGloss(korean)) return json({ ok: false, error: 'invalid_korean_meaning', message: '뜻을 한글로 바꾼 뒤 다시 저장해주세요.' }, 422);
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
              { role: 'system', content: 'You extract an English vocabulary list from messy text. Output ONLY a JSON array, no prose. ' + KOREAN_GLOSS_RULE },
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
          const repaired = await repairKoreanGlosses(items, env.AI);
          if (repaired.some(it => hasForeignGloss(it.korean))) return json({ ok: false, error: 'invalid_korean_meaning', message: '일부 뜻을 한글로 바꾸지 못했어요. 원본 뜻을 확인해주세요.' }, 422);
          return json({ ok: true, items: repaired });
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
      { const deny = await vocabWriteDenied(request, url, env, userId, b); if (deny) return deny; }
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
                { role: 'system', content: 'You output Korean meanings and short English examples for vocabulary words. JSON array only, no prose. ' + KOREAN_GLOSS_RULE },
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
      const repaired = await repairKoreanGlosses(fresh, env.AI);
      if (repaired.some(it => hasForeignGloss(it.korean))) return json({ ok: false, error: 'invalid_korean_meaning', message: '일부 뜻을 한글로 바꾸지 못했어요. 확인 후 다시 저장해주세요.' }, 422);
      repaired.forEach((it, i) => { fresh[i].korean = it.korean; });
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
      const words = await attachVocabTags(await readableVocab((rs.results || []) as any[], uid), uid);
      return json({ ok: true, count: rs.results?.length || 0, words, trial: gate.trial });
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
      // 🏷️ 복습 퀴즈도 «원어민 표현» 카드를 표시(2026-11-02) — 목록과 같은 꼬리표
      return json({ ok: true, due_count: rs.results?.length || 0, words: await attachVocabTags(await readableVocab((rs.results || []) as any[], uid), uid), trial: gate.trial });
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
      // 간격 반복 — 정본 vocabSrsNext(정답 level+1 · 오답 0)
      const now = Date.now();
      const srs = vocabSrsNext(row.level, correct, now);
      const newLevel = srs.level, nextDays = srs.days, next = srs.next;
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
      { const deny = await vocabWriteDenied(request, url, env, userId, b); if (deny) return deny; }   // 🔐 AI 호출(비용) 전에

      let korean = '', example = '', synonyms: any[] = [];
      if (env.AI) {
        const prompt = `For English word "${word}", provide JSON only. ${KOREAN_GLOSS_RULE}
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
      korean = (await repairKoreanGlosses([{ word, korean, example }], env.AI))[0].korean;
      if (hasForeignGloss(korean)) return json({ ok: false, error: 'invalid_korean_meaning', message: '한국어 뜻을 만들지 못했어요. 다시 시도해주세요.' }, 422);
      synonyms = await repairKoreanGlosses(synonyms.filter((sy: any) => sy && typeof sy === 'object').map((sy: any) => ({ ...sy, korean: sy.meaning_ko })), env.AI);
      synonyms = synonyms.filter((sy: any) => isKoreanGloss(sy.korean)).map((sy: any) => ({ ...sy, meaning_ko: sy.korean }));
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
      { const deny = await vocabWriteDenied(request, url, env, userId, b); if (deny) return deny; }   // 🔐 AI 호출(비용) 전에
      if (!env.AI) return json({ ok: false, error: 'AI_binding_missing' }, 503);

      // 기존 단어 (중복 방지)
      const existRs: any = await env.DB.prepare(`SELECT word FROM vocabulary WHERE user_id = ?`).bind(userId).all();
      const existing = new Set((existRs.results || []).map((r: any) => String(r.word).toLowerCase()));

      const topicStr = topic ? ` related to "${topic}"` : '';
      const prompt = `Generate ${count + 5} useful English vocabulary words for a Korean student at CEFR level ${level}${topicStr}. For each word provide: English word, Korean meaning, short English example sentence. ${KOREAN_GLOSS_RULE}

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
      words = await repairKoreanGlosses(words.filter((w: any) => w && typeof w === 'object'), env.AI);
      const aiTotal = words.length;
      words = words.filter((w: any) => String(w?.word || '').trim() && String(w?.korean || '').trim());
      words = words.filter((w: any) => !hasForeignGloss(w.korean));
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
      // 🔐 그 학생 단어장으로 문제를 만든다 = 단어장을 «읽는» 것이기도 하다(/api/vocab/list 와 같은 본인 확인 — 단 게스트 체험 시간 제한은 안 건다).
      { const deny = await vocabWriteDenied(request, url, env, userId, b); if (deny) return deny; }

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
      words = words.map(w => ({ ...w, korean: normalizeKoreanGloss(w.korean) }));
      // 마지막 방어선 — DB 필터를 빠져나온 깨진 문자열은 여기서 버립니다(어느 경로로 들어왔든).
      const distractors = (distRs.results || []).map((x: any) => normalizeKoreanGloss(x.korean)).filter((s: any) => isCleanText(s));
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
        if (!wrong.length) continue; // Never issue a question with only the answer.
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
      /* 🔐 (2026-10-19) 그 퀴즈의 «주인» 인지 — 정수 quiz_id 를 훑으며 남의 단어에 오답을 찍으면
         그 낱말이 «단어장 약점» 이 되어 그 학생의 웜업·A.i 친구 대화에 실린다. 정답(correct_index)도 이 뒤에서만 돌려준다. */
      { const deny = await vocabWriteDenied(request, url, env, String(row.user_id || ''), b); if (deny) return deny; }
      const isCorrect = row.correct_index === answer;
      /* 🔁 (2026-10-18) 같은 문제를 다시 제출해도 채점은 돌려주되, 기록·복습 일정은 «처음 한 번» 만 반영한다.
         퀴즈는 출제할 때마다 새 행이라 정상 흐름은 한 번 제출이고, 되풀이 제출로 단어를 level 7 까지
         밀어 올리는 길을 막는다.
         ⚛️ 완료 표시·복습 이력·SRS 갱신을 «한 batch» 로 묶는다 — 따로 쓰면 완료만 남고 SRS 가 실패했을 때
         재제출이 «이미 완료» 로 걸러져 그 답이 복습 일정에 영영 안 들어간다(Codex 리뷰 #1608).
         뒤 두 문장은 `changes() > 0` 으로 «앞 문장이 실제로 바꿨을 때만» 돈다(처음 제출 판정의 사슬). */
      let vr: any = null;
      if (row.source_word) {
        try {
          vr = await env.DB.prepare(`SELECT id, level FROM vocabulary WHERE user_id = ? AND word = ? LIMIT 1`).bind(row.user_id, row.source_word).first();
        } catch (e: any) {
          console.warn('[vocab quiz-submit] vocab lookup failed:', e?.message || e);
          return json({ ok: false, error: 'submit_failed', retryable: true, correct: isCorrect, correct_index: row.correct_index }, 503);
        }
      }
      const now = Date.now();
      const stmts: any[] = [env.DB.prepare(
        `UPDATE vocab_quizzes SET completed = 1, user_answer = ?, is_correct = ?, completed_at = ? WHERE id = ? AND COALESCE(completed, 0) = 0`
      ).bind(answer, isCorrect ? 1 : 0, now, quizId)];
      // 정답/오답 카운트 + 📅 복습 일정(SRS) 갱신 + 복습 이력(vocab_review_log → 일일미션·스트릭·주간랭킹 공용)
      //   ⚠️ 2026-10-18 전에는 카운트만 올리고 next_review_at 을 안 건드려, 퀴즈에서 틀린 단어가 복습에 다시 안 나왔다.
      if (row.source_word) {
        stmts.push(env.DB.prepare(
          `INSERT INTO vocab_review_log (user_id, vocab_id, correct, reviewed_at) SELECT ?, ?, ?, ? WHERE changes() > 0`
        ).bind(row.user_id, vr?.id || null, isCorrect ? 1 : 0, now));
        if (vr) {
          const srs = vocabSrsNext(vr.level, isCorrect, now);
          stmts.push(env.DB.prepare(isCorrect
            ? `UPDATE vocabulary SET correct_count = correct_count + 1, level = ?, next_review_at = ?, last_reviewed_at = ? WHERE user_id = ? AND word = ? AND changes() > 0`
            : `UPDATE vocabulary SET wrong_count = wrong_count + 1, level = ?, next_review_at = ?, last_reviewed_at = ? WHERE user_id = ? AND word = ? AND changes() > 0`
          ).bind(srs.level, srs.next, now, row.user_id, row.source_word));
        }
      }
      try {
        await env.DB.batch(stmts);
      } catch (e: any) {
        // 아무것도 안 써졌으므로(batch = 한 트랜잭션) 다시 제출하면 처음 제출로 반영된다.
        console.warn('[vocab quiz-submit] batch failed:', e?.message || e);
        return json({ ok: false, error: 'submit_failed', retryable: true, correct: isCorrect, correct_index: row.correct_index }, 503);
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

