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
import { authUidFromRequest as authUidGlobal } from './auth-token';  // 🔐 소유자 검증(IDOR 방지)
import { resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정(게스트 예외+관리자/토큰)
import { recordJudgmentEvents, guessMisconception } from './api-judgment';  // 🧠 판단력 캡처(D3)
import { scoreVoiceCoach, scoreTier } from './voice-score';  // 🗣 음성코치 결정론 채점(변별력 하니스 검증)
import type { MangoEnv } from './api-mango';


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

    // ── GET /api/vocab/list?uid=X — 학생 단어장 목록 ──
    if (method === 'GET' && path === '/api/vocab/list') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [IDOR] 본인(토큰) 또는 관리자만 — 남의 단어장 조회 차단. [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, uid))) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 단어장만 조회할 수 있습니다.' }, 401);
      }
      const rs = await env.DB.prepare(`SELECT id, word, korean, example, level, next_review_at, correct_count, wrong_count, created_at FROM vocabulary WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, words: rs.results || [] });
    }

    // ── GET /api/vocab/due?uid=X — 오늘 복습할 단어 ──
    if (method === 'GET' && path === '/api/vocab/due') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [IDOR] 본인(토큰) 또는 관리자만 — 남의 단어장 조회 차단. [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, uid))) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 단어장만 조회할 수 있습니다.' }, 401);
      }
      const now = Date.now();
      const rs = await env.DB.prepare(`SELECT id, word, korean, example, level FROM vocabulary WHERE user_id = ? AND next_review_at <= ? ORDER BY next_review_at ASC LIMIT 20`).bind(uid, now).all();
      return json({ ok: true, due_count: rs.results?.length || 0, words: rs.results || [] });
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
      // 멱등: 같은 award_id 는 1회만
      const ins = await env.DB.prepare(`INSERT OR IGNORE INTO vocab_rewards (award_id, user_id, kind, amount, created_at) VALUES (?,?,?,?,?)`)
        .bind(awardId, uid, kind, amount, now).run();
      if (!ins.meta || (ins.meta as any).changes === 0) return json({ ok: true, awarded: 0, duplicate: true });
      // 학생 전체 포인트(student_points → 기프트콘 경제)에 적립
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER);`);
      const sname = String(b.student_name || '').trim() || uid;
      await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, last_earned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?, lifetime_earned = lifetime_earned + ?, last_earned_at = ?, updated_at = ?`)
        .bind(uid, sname, amount, amount, now, now, amount, amount, now, now).run();
      const bal: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id = ?`).bind(uid).first();
      return json({ ok: true, awarded: amount, kind, balance: bal?.balance || amount });
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
      const rs = await env.DB.prepare(
        `SELECT l.user_id, COALESCE(sp.student_name, l.user_id) AS name, SUM(l.correct) AS correct_count, COUNT(*) AS review_count
         FROM vocab_review_log l LEFT JOIN student_points sp ON sp.user_id = l.user_id
         WHERE l.reviewed_at >= ? GROUP BY l.user_id HAVING SUM(l.correct) > 0
         ORDER BY correct_count DESC, review_count DESC LIMIT 50`
      ).bind(since).all();
      const rows = (rs.results || []) as any[];
      const top = rows.slice(0, 10).map((r, i) => ({ rank: i + 1, user_id: r.user_id, name: r.name, correct: r.correct_count, reviews: r.review_count, me: r.user_id === uid }));
      let myRank = null, myCorrect = 0;
      const idx = rows.findIndex(r => r.user_id === uid);
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
            korean = String(parsed.korean || '').trim();
            example = String(parsed.example || '').trim();
            synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms.slice(0,5) : [];
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
      try { const p = JSON.parse(mm ? mm[0] : raw); words = Array.isArray(p.words) ? p.words : []; } catch {}

      // 폴백: AI 실패 시 레벨별 기본 단어
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
      let added = 0, skipped = 0;
      const inserted: any[] = [];
      for (const w of words.slice(0, count)) {
        const word = String(w.word || '').trim();
        if (!word || existing.has(word.toLowerCase())) { skipped++; continue; }
        try {
          const r: any = await env.DB.prepare(
            `INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`
          ).bind(userId, word, String(w.korean || '').trim(), String(w.example || '').trim(), now + 86400000, now).run();
          inserted.push({ id: r.meta?.last_row_id, word, korean: w.korean, example: w.example });
          added++;
        } catch { skipped++; }
      }
      return json({ ok: true, added, skipped, level, topic, words: inserted });
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
        const rs: any = await env.DB.prepare(
          `SELECT id, word, korean, example FROM vocabulary WHERE user_id = ?
           ORDER BY (COALESCE(wrong_count,0)*3 - COALESCE(correct_count,0)
                     + CASE WHEN last_reviewed_at IS NULL THEN 1 ELSE 0 END
                     + (ABS(RANDOM()) % 6)) DESC
           LIMIT ?`
        ).bind(userId, count).all();
        words = (rs.results || []) as any[];
        if (!words.length) return json({ ok: false, error: 'no_words', message: '단어장이 비어있어요. 단어를 먼저 추가해주세요!' });
      }

      // 오답 선택지 풀 (은행 출제면 은행에서, 내 단어장이면 전체 학생 단어에서)
      const distRs: any = source === 'textbook'
        ? await env.DB.prepare(`SELECT ko AS korean FROM en_vocab WHERE active=1 AND type='word' AND ko IS NOT NULL AND ko != '' ORDER BY RANDOM() LIMIT 60`).all()
        : await env.DB.prepare(`SELECT korean FROM vocabulary WHERE user_id != ? AND korean IS NOT NULL AND korean != '' ORDER BY RANDOM() LIMIT 60`).bind(userId).all();
      const distractors = (distRs.results || []).map((x: any) => x.korean).filter(Boolean);
      const myDistractors = words.map(w => w.korean).filter(Boolean);

      const now = Date.now();
      const quizzes: any[] = [];
      for (const w of words) {
        if (!w.korean) continue;
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
        const explain = String(q?.explain || '').trim();
        let text = String(q?.q || '').trim();
        if (type === 'choice' || type === 'listen') {
          const opts = Array.isArray(q?.opts) ? q.opts.map((o: any) => String(o || '').trim()) : [];
          const answer = Number(q?.answer);
          if (type === 'listen' && !text) text = '🎧 잘 듣고 알맞은 답을 고르세요.';
          if (!text) return { ok: false, error: 'question_text_required' };
          if (opts.length < 2 || opts.length > 6 || opts.some((o: string) => !o)) return { ok: false, error: 'options_required' };
          if (!Number.isInteger(answer) || answer < 0 || answer >= opts.length) return { ok: false, error: 'answer_index_invalid' };
          const audioText = String(q?.audio_text || '').trim();
          if (type === 'listen' && !audioText) return { ok: false, error: 'audio_text_required' };
          const item: any = { type, q: text, opts, answer, explain };
          if (type === 'listen') item.audio_text = audioText.slice(0, 300);
          clean.push(item);
        } else {
          const answerText = String(q?.answer_text || '').trim();
          if (!answerText) return { ok: false, error: 'answer_text_required' };
          if (type === 'speak' && !text) text = '🎤 아래 문장을 또박또박 읽어보세요.';
          if (type === 'write' && !text) return { ok: false, error: 'question_text_required' };
          const accept = (Array.isArray(q?.accept) ? q.accept : []).map((a: any) => String(a || '').trim()).filter((a: string) => !!a).slice(0, 8);
          clean.push({ type, q: text, answer_text: answerText.slice(0, 300), accept, explain });
        }
      }
      return { ok: true, list: clean };
    };
    // 채점 보조 — 텍스트 정규화 + 단어 일치율
    const rqNorm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣\s']/g, ' ').replace(/\s+/g, ' ').trim();
    const rqWordAcc = (target: string, said: string) => {
      const t = rqNorm(target).split(' ').filter(Boolean);
      const s = rqNorm(said).split(' ').filter(Boolean);
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
    // 🤖 AI 자동 출제 — 교재/레벨/레슨 기반 (Workers AI llama-3.3-70b)
    const rqAiGenerate = async (o: { level?: string; textbook?: string; lesson_no?: number | null; topic?: string; counts?: any }) => {
      const ai = (env as any).AI;
      if (!ai) return { ok: false as const, error: 'workers_ai_not_bound' };
      const c = o.counts || {};
      const lim = (v: any, dft: number) => Math.min(Math.max(Number(v ?? dft) || 0, 0), 5);
      const nListen = lim(c.listen, 2), nWrite = lim(c.write, 2), nSpeak = lim(c.speak, 2), nChoice = lim(c.choice, 0);
      if (nListen + nWrite + nSpeak + nChoice === 0) return { ok: false as const, error: 'counts_required' };
      const ctx = [
        o.textbook ? `Textbook: ${o.textbook}` : '',
        o.level ? `Level: ${o.level}` : '',
        (o.lesson_no != null && o.lesson_no > 0) ? `Lesson number: ${o.lesson_no}` : '',
        o.topic ? `Key vocabulary / topic from this lesson: ${o.topic}` : '',
      ].filter(Boolean).join('\n');
      const prompt = `You are an English quiz writer for a Korean kids' English academy (망고아이).
Create a review quiz for this class:
${ctx || 'General elementary English'}

Difficulty must match the textbook level and lesson (younger learners = very short, simple sentences).
Make exactly:
- ${nChoice} "choice" questions: {"type":"choice","q":"<Korean question>","opts":["..","..","..",".."],"answer":<correct index 0-3>,"explain":"<short Korean explanation>"}
- ${nListen} "listen" questions: {"type":"listen","q":"🎧 잘 듣고 알맞은 답을 고르세요.","audio_text":"<short English sentence to be spoken aloud>","opts":["..","..","..",".."],"answer":<index>,"explain":"<Korean>"}
- ${nWrite} "write" questions: {"type":"write","q":"<Korean prompt, e.g. 다음 뜻의 영어 문장을 쓰세요: ...>","answer_text":"<correct English sentence>","accept":["<acceptable variation>"],"explain":"<Korean>"}
- ${nSpeak} "speak" questions: {"type":"speak","q":"🎤 아래 문장을 또박또박 읽어보세요.","answer_text":"<short English sentence to read aloud>","explain":"<Korean>"}

Rules: English sentences max 8 words. Korean for instructions/explanations. Vocabulary must fit the textbook/lesson. The "listen" options must include the audio sentence itself as the correct option.
Reply with a JSON array ONLY. No markdown, no commentary.`;
      try {
        const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: 'You write JSON quizzes for Korean children learning English. Output a raw JSON array only.' },
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
        return { ok: true as const, questions: parsed.list };
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
      const rs = await env.DB.prepare(`SELECT id, title, description, questions, level, textbook, lesson_no, source, draw, created_at FROM review_quizzes WHERE active = 1 ORDER BY id DESC`).all();
      const quizzes: any[] = [];
      for (const row of (((rs.results as any[]) || []))) {
        let count = 0; try { count = (JSON.parse(row.questions) || []).length; } catch {}
        let drawTotal = 0; try { if (row.draw) { const d = JSON.parse(row.draw); drawTotal = (d.listen || 0) + (d.speak || 0) + (d.choice || 0) + (d.write || 0); } } catch {}
        const shown = drawTotal > 0 ? Math.min(drawTotal, count) : count;
        const item: any = { id: row.id, title: row.title, description: row.description || '', question_count: shown, bank_size: count, draw_total: drawTotal, level: row.level || '', textbook: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', created_at: row.created_at, best_score: null, attempts: 0 };
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
      const row: any = await env.DB.prepare(`SELECT id, title, description, questions, active, level, textbook, lesson_no, source, draw FROM review_quizzes WHERE id = ?`).bind(id).first();
      if (!row || !row.active) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      let draw: any = null; try { draw = row.draw ? JSON.parse(row.draw) : null; } catch {}
      let safe: any[];
      if (draw && qs.length) { const idxs = rqDrawIndices(qs, draw); safe = idxs.map((i: number) => rqSafeOne(qs[i], i)); }
      else { safe = rqSafeQuestions(qs); }
      return json({ ok: true, quiz: { id: row.id, title: row.title, description: row.description || '', level: row.level || '', textbook: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', draw: draw || null, questions: safe } });
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
        if (amount > 0) {
          const ins2: any = await env.DB.prepare(`INSERT OR IGNORE INTO review_quiz_rewards (award_id, user_id, amount, created_at) VALUES (?,?,?,?)`)
            .bind(`rq:${quizId}:${userId}:${resultId}`, userId, amount, now).run();
          if (ins2 && ins2.meta && (ins2.meta as any).changes > 0) {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER DEFAULT 0, lifetime_earned INTEGER DEFAULT 0, lifetime_spent INTEGER DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER);`);
            await env.DB.prepare(`INSERT INTO student_points (user_id, student_name, balance, lifetime_earned, last_earned_at, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?, lifetime_earned = lifetime_earned + ?, last_earned_at = ?, updated_at = ?`)
              .bind(userId, userName || userId, amount, amount, now, now, amount, amount, now, now).run();
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
      const row: any = await env.DB.prepare(`SELECT questions FROM review_quizzes WHERE id = ? AND active = 1`).bind(quizId).first();
      if (!row) return json({ ok: false, error: 'quiz_not_found' }, 404);
      let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
      const q = qs[idx];
      const text = (q && q.type === 'listen') ? String(q.audio_text || '').trim().slice(0, 300) : '';
      if (!text) return json({ ok: false, error: 'not_a_listen_question' }, 400);
      const ai = (env as any).AI;
      if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);
      const audioHeaders = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' };
      // 🔁 R2 캐시: 같은 듣기 문항은 1회만 생성 → 이후엔 뉴런 소모 없이 즉시 제공 (무료 뉴런 절약 + quota 소진 후에도 캐시본 재생)
      let cacheKey = '';
      try {
        const enc = new TextEncoder().encode('aura-asteria|' + text);
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
      // fix: AI 에러 Response 를 음성으로 내보내지 않도록 ok+audio 확인. 429(무료뉴런 소진) 는 quota 로 구분.
      const isQuota = (m: any) => /429|neuron|allocation|free allocation/i.test(String(m || ''));
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
      const level = String(b.level || '').trim();
      const textbook = String(b.textbook || '').trim();
      const lessonNo = Number(b.lesson_no) > 0 ? Number(b.lesson_no) : null;
      const topic = String(b.topic || '').trim().slice(0, 300);
      const allowGenerate = b.auto_generate !== 0 && b.auto_generate !== false;
      const pickSafe = (row: any) => {
        let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
        let draw: any = null; try { draw = row.draw ? JSON.parse(row.draw) : null; } catch {}
        let safe: any[];
        if (draw && qs.length) { const idxs = rqDrawIndices(qs, draw); safe = idxs.map((i: number) => rqSafeOne(qs[i], i)); }
        else { safe = rqSafeQuestions(qs); }
        return { id: row.id, title: row.title, description: row.description || '', level: row.level || '', textbook: row.textbook || '', lesson_no: row.lesson_no, source: row.source || 'manual', draw: draw || null, questions: safe };
      };
      // 1) 교재+레슨 → 2) 교재 전체용 → 3) 레벨 전체용 순서로 매칭
      const tries: Array<{ sql: string; binds: any[] }> = [];
      if (textbook && lessonNo) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND textbook IS NOT NULL AND LOWER(textbook)=LOWER(?) AND lesson_no=? ORDER BY id DESC LIMIT 1`, binds: [textbook, lessonNo] });
      if (textbook) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND textbook IS NOT NULL AND LOWER(textbook)=LOWER(?) AND lesson_no IS NULL ORDER BY id DESC LIMIT 1`, binds: [textbook] });
      if (level) tries.push({ sql: `SELECT * FROM review_quizzes WHERE active=1 AND level IS NOT NULL AND LOWER(level)=LOWER(?) AND (textbook IS NULL OR textbook='') ORDER BY id DESC LIMIT 1`, binds: [level] });
      for (const t of tries) {
        const row: any = await env.DB.prepare(t.sql).bind(...t.binds).first();
        if (row) return json({ ok: true, matched: true, quiz: pickSafe(row) });
      }
      if (!allowGenerate || (!textbook && !level && !topic)) return json({ ok: true, matched: false, quiz: null });
      // 🤖 매칭 퀴즈가 없으면 AI 가 교재/레벨/레슨에 맞춰 즉석 출제 → 저장 (관리자 페이지에서 확인·조정 가능)
      const gen = await rqAiGenerate({ level, textbook, lesson_no: lessonNo, topic, counts: { listen: 2, write: 2, speak: 2 } });
      if (!gen.ok) return json({ ok: false, error: gen.error }, 502);
      const title = `[AI] ${textbook || level || '오늘의 수업'}${lessonNo ? ` Lesson ${lessonNo}` : ''} 복습퀴즈`;
      const desc = `AI 자동 출제 (듣기/쓰기/말하기) — ${new Date().toISOString().slice(0, 10)}`;
      const now = Date.now();
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, created_at, updated_at) VALUES (?,?,?,1,?,?,?,'ai',?,?)`)
        .bind(title, desc, JSON.stringify(gen.questions), level || null, textbook || null, lessonNo, now, now).run();
      const newId = (ins as any).meta?.last_row_id;
      const nrow: any = await env.DB.prepare(`SELECT * FROM review_quizzes WHERE id=?`).bind(newId).first();
      return json({ ok: true, matched: false, generated: true, quiz: pickSafe(nrow) });
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
      return json({ ok: true, questions: gen.questions });
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
      qs = qs.concat(gen.questions);
      if (qs.length > target) qs = qs.slice(0, target);
      const drawJson = JSON.stringify({ listen: 4, write: 3, speak: 3 });
      const now = Date.now();
      if (existing) {
        await env.DB.prepare(`UPDATE review_quizzes SET questions=?, draw=?, active=1, updated_at=? WHERE id=?`).bind(JSON.stringify(qs), drawJson, now, existing.id).run();
        return json({ ok: true, id: existing.id, bank_size: qs.length, target, done: qs.length >= target });
      }
      const title = textbook ? `\u{1F4DA} ${textbook}` : `\u{1F3F7}\uFE0F ${level}`;
      const ins = await env.DB.prepare(`INSERT INTO review_quizzes (title, description, questions, active, level, textbook, lesson_no, source, draw, created_at, updated_at) VALUES (?,?,?,1,?,?,?,'bank',?,?,?)`)
        .bind(title, '교재 은행에서 듣기4·쓰기3·말하기3 랜덤 10출제', JSON.stringify(qs), level || null, textbook || null, null, drawJson, now, now).run();
      return json({ ok: true, id: (ins as any).meta?.last_row_id, bank_size: qs.length, target, done: qs.length >= target });
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

    if (method === 'GET' && path === '/api/streak/leaderboard') {
      await ensureStreakSchema();
      const rs = await env.DB.prepare(
        `SELECT student_uid, current_streak, longest_streak, gems FROM student_streaks ORDER BY current_streak DESC, gems DESC LIMIT 20`
      ).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // 🔁 관리자 수동 트리거 — 전 학생 streak 일괄 정합화 (출결 기준)
    //   야간 cron(KST 03:00)과 동일한 reconcileAllStreaks 를 즉시 1회 실행.
    //   인증: 상단 /api/admin/* 관리자 세션 미들웨어가 이미 401 게이트.
    //   POST = 실행, 실행 후 갱신된 리더보드 상위 20명을 함께 반환해 효과 확인.
    if (method === 'POST' && path === '/api/admin/streak/reconcile') {
      const rc = await reconcileAllStreaks(env);
      const rs = await env.DB.prepare(
        `SELECT student_uid, current_streak, longest_streak, gems FROM student_streaks ORDER BY current_streak DESC, gems DESC LIMIT 20`
      ).all();
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
          const enc = new TextEncoder().encode('v3|' + lang + '|' + String(b.speaker || 'asteria') + '|' + text);
          const dig = await crypto.subtle.digest('SHA-256', enc);
          cacheKey = 'tts/' + [...new Uint8Array(dig)].map((x) => x.toString(16).padStart(2, '0')).join('') + '.mp3';
        } catch {}
        if (cacheKey && r2) {
          try { const hit = await r2.get(cacheKey); if (hit) return new Response(hit.body, { headers: audioHeaders }); } catch {}
        }
        const putCache = async (bytes: ArrayBuffer | Uint8Array) => {
          if (!cacheKey || !r2) return;
          try { await r2.put(cacheKey, bytes, { httpMetadata: { contentType: 'audio/mpeg' } }); } catch {}
        };
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
          const buf = await auraRun('@cf/deepgram/aura-2-en', AURA2.has(requested) ? requested : 'asteria');
          await putCache(buf);
          return new Response(buf, { headers: audioHeaders });
        } catch (a2Err: any) {
          if (isQuota(a2Err?.message)) quota = true;
          console.warn('[voice/tts] aura-2 failed, fallback aura-1:', a2Err?.message);
        }
        try {
          // Aura-1 폴백: 요청 화자가 Aura-1 에 없으면 성별만 맞춰 대체 (남=orion / 여=asteria)
          const spk1 = AURA1.has(requested) ? requested : (AURA2_MALE.has(requested) ? 'orion' : 'asteria');
          const buf = await auraRun('@cf/deepgram/aura-1', spk1);
          await putCache(buf);
          return new Response(buf, { headers: audioHeaders });
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
        if (ct.includes('multipart/form-data')) {
          const fd = await request.formData();
          const file = fd.get('audio') as File | null;
          if (!file) return json({ ok: false, error: 'no_audio_file' }, 400);
          audio = await file.arrayBuffer();
          hintLang = String(fd.get('lang') || '').trim().toLowerCase();
        } else {
          audio = await request.arrayBuffer();
          hintLang = String(url.searchParams.get('lang') || '').trim().toLowerCase();
        }
        if (!audio || audio.byteLength < 100) return json({ ok: false, error: 'audio_too_small' }, 400);
        if (audio.byteLength > 25 * 1024 * 1024) return json({ ok: false, error: 'audio_too_large', max: '25MB' }, 400);

        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        // 기대 언어 정규화(ISO-639-1). 지원 밖이면 힌트 없이 자동감지로 둔다.
        const langMap: Record<string, string> = { en: 'en', ko: 'ko', zh: 'zh', 'zh-cn': 'zh' };
        const lang = langMap[hintLang] || '';

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
            const turbo: any = await ai.run('@cf/openai/whisper-large-v3-turbo', { audio: b64, language: lang, task: 'transcribe' });
            const tt = String(turbo?.text || '').trim();
            if (tt) return json({ ok: true, text: tt, vtt: turbo?.vtt || null, word_count: turbo?.word_count || 0, lang });
          } catch (turboErr: any) {
            console.warn('[voice/transcribe] turbo failed, fallback base whisper:', turboErr?.message);
          }
        }

        // 폴백: 구 whisper (언어 힌트 미지원, 자동감지)
        const arr = [...new Uint8Array(audio)];
        const result = await ai.run('@cf/openai/whisper', { audio: arr });
        return json({ ok: true, text: result?.text || '', vtt: result?.vtt || null, word_count: result?.word_count || 0, lang: lang || null });
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
      const sc = scoreVoiceCoach(target, spoken);
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
      await env.DB.prepare(
        `INSERT INTO voice_coaching (student_uid, student_name, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, audio_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(studentUid, studentName, target, spoken, accuracy, pronunciation, fluency, aiFeedback, suggestion, b.audio_url || null, now).run();

      return json({
        ok: true,
        scores: { accuracy, pronunciation, fluency, overall },
        tier,
        lang_mismatch: sc.langMismatch,
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
