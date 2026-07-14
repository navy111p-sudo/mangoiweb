// ═══════════════════════════════════════════════════════════════════════
// 🤖 api-ai.ts — AI 영작 첨삭(AW) + AI 영어친구 챗봇(CF) (25차 분리)
//   게임화 포인트/배지는 api-points·api-games 의 export 헬퍼 사용.
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal, signUidToken } from './auth-token';
import { ensurePointTables, applyPointTransaction } from './api-points';
import { checkAndAwardBadges, BADGE_CATALOG } from './api-games';
import { processAiCommand, executeAction, processStudentCommand } from './ai-command';
import { checkAdminSession } from './auth-admin';
import { parseJsonBody } from './api-util';
import type { MangoEnv } from './api-mango';

export async function handleAiApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // ✍️ Phase AW — AI 영작 첨삭 (Grammarly + GPT)
    // ═══════════════════════════════════════════════════════════════
    const ensureWriteSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_writing_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, original_text TEXT NOT NULL, corrected_text TEXT, feedback TEXT, level TEXT, score INTEGER, created_at INTEGER NOT NULL);`);
    };

    if (method === 'POST' && path === '/api/ai/write-correct') {
      await ensureWriteSchema();
      const b: any = await request.json().catch(() => ({}));
      const text = String(b.text || '').trim();
      const level = String(b.level || 'A2').trim();
      const uid = String(b.uid || '').trim();
      if (!text || text.length < 3) return json({ ok: false, error: 'text_too_short' }, 400);
      if (text.length > 2000) return json({ ok: false, error: 'text_too_long' }, 400);

      const prompt = `You are Mango, a friendly English writing tutor for a Korean student at CEFR level ${level}. The student wrote the following text. Your job:
1. Provide a corrected version (preserve student's meaning).
2. Provide a numeric score 0-100 for overall quality.
3. List 2-5 specific issues found, each with: original phrase, suggested phrase, brief reason (in Korean).
4. Provide one encouraging tip in Korean (1-2 sentences).
5. Reply to the CONTENT of the student's writing like a pen-pal friend, in English appropriate for ${level} level (1-2 short sentences, warm, may end with a small question).

Respond in this strict JSON format only, no markdown:
{
  "corrected": "...",
  "score": 85,
  "issues": [{"original":"...","suggested":"...","reason":"..."}],
  "tip": "...",
  "reply": "..."
}

Student text: """${text}"""`;

      if (!env.AI) {
        return json({ ok: false, error: 'AI_binding_missing' }, 503);
      }

      const models = [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
      ];
      let raw = '';
      let lastErr: any = null;
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, {
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1500, temperature: 0.3,
          });
          if (typeof resp === 'string') raw = resp;
          else if (resp && typeof resp.response === 'string') raw = resp.response;
          else if (resp && resp.response) raw = JSON.stringify(resp.response);
          else if (resp && resp.result && typeof resp.result === 'string') raw = resp.result;
          raw = String(raw || '').trim();
          if (raw) break;
        } catch (e: any) {
          lastErr = e;
          console.error(`[write-correct] model ${m} failed:`, e?.message || e);
        }
      }

      // JSON 추출 시도 — 다양한 응답 형식 대응
      const mm = raw.match(/\{[\s\S]*\}/);
      let parsed: any = {};
      try { parsed = JSON.parse(mm ? mm[0] : raw); } catch {}

      // AI 가 JSON 으로 응답 안 했을 때 안전한 폴백
      let corrected = String(parsed.corrected || '').trim();
      if (!corrected || corrected === text) {
        // 기본 폴백: 첫 글자 대문자화 + 마침표 추가
        corrected = text.charAt(0).toUpperCase() + text.slice(1);
        if (!/[.!?]$/.test(corrected.trim())) corrected = corrected.trim() + '.';
      }
      const score = Math.max(0, Math.min(100, Number(parsed.score || 75)));
      const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 8) : [];
      const tip = String(parsed.tip || '꾸준히 영작 연습을 이어가세요! 매일 한 문장씩만 써도 한 달이면 30문장입니다.');
      // 💬 망고 선생님의 답장 — 첨삭을 '검사'가 아니라 '대화'로 만드는 펜팔 답장
      const reply = String(parsed.reply || '').trim().slice(0, 400);

      // 📚 미션 단어 검증 — 클라이언트가 보낸 미션 단어 중 실제 글에 쓰인 단어를 서버가 판정
      //   (보너스 포인트 지급 근거이므로 클라이언트 자가신고를 믿지 않고 서버가 단어경계로 확인)
      const missionWords: string[] = Array.isArray(b.mission_words)
        ? b.mission_words.slice(0, 5).map((w: any) => String(w || '').trim()).filter((w: string) => /^[a-zA-Z' -]{1,30}$/.test(w))
        : [];
      const missionUsed = missionWords.filter(w =>
        new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));

      // raw 가 있긴 한데 JSON 파싱 실패 → AI 응답 텍스트를 tip 에 일부 포함
      const meta = raw && !Object.keys(parsed).length
        ? { ai_raw_excerpt: raw.slice(0, 500), parsed: false }
        : { parsed: true };

      try {
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO ai_writing_corrections (student_uid, original_text, corrected_text, feedback, level, score, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(uid || null, text, corrected, JSON.stringify({ issues, tip, reply, mission_words: missionWords, mission_used: missionUsed, meta }), level, score, now).run();
      } catch (e: any) {
        console.error('[write-correct] DB insert failed:', e?.message || e);
      }

      // 🎁 포인트 적립 + 배지 검사 — 서명 토큰의 uid 와 요청 uid 가 일치하는 로그인 사용자만.
      //   (토큰 없이 uid 만 넣어 호출하는 무인증 요청은 첨삭은 되지만 포인트는 안 쌓임 → 파밍 방지)
      let pointsEarned: any = null;
      let missionBonus: any = null;
      let streakBonus: any = null;
      let earnedBadges: any[] = [];
      const vocabSaved: string[] = [];
      const awAuthUid = await authUidGlobal(request, url, env, b);
      if (awAuthUid && awAuthUid === uid && !uid.startsWith('guest_')) {
        // 규칙 기반 적립 인라인 헬퍼 — 쿨다운/일일한도는 point_rule_log 기준(KST 자정 경계)
        const earnWritingRule = async (code: string, label: string, amount: number, dailyCap: number, description: string, cooldownSec = 0) => {
          try {
            await ensurePointTables(env);
            const now = Date.now();
            await env.DB.prepare(`INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(code) DO NOTHING`)
              .bind(code, label, amount, cooldownSec, dailyCap, description, now).run();
            const rule: any = await env.DB.prepare(`SELECT * FROM point_rules WHERE code=? AND enabled=1`).bind(code).first();
            if (!rule) return null;
            if ((rule.cooldown_sec || 0) > 0) {
              const last: any = await env.DB.prepare(`SELECT triggered_at FROM point_rule_log WHERE user_id=? AND rule_code=? ORDER BY triggered_at DESC LIMIT 1`).bind(uid, code).first();
              if (last && (now - last.triggered_at) < rule.cooldown_sec * 1000) return { cooldown: true };
            }
            if (rule.daily_cap) {
              const KST_OFF = 9 * 3600 * 1000;
              const todayMs = Math.floor((now + KST_OFF) / 86400000) * 86400000 - KST_OFF;
              const cnt: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(uid, code, todayMs).first();
              if ((cnt?.c || 0) >= rule.daily_cap) return { capped: true, cap: rule.daily_cap };
            }
            const r = await applyPointTransaction(env, { userId: uid, type: 'earn', amount: rule.amount, reason: rule.label, ruleCode: code, meta: { score, level } });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,?)`)
              .bind(uid, code, rule.amount, now, r.txnId, JSON.stringify({ score, level })).run();
            return { amount: rule.amount, label: rule.label, newBalance: r.newBalance };
          } catch (e: any) {
            console.error(`[write-correct] earn ${code} failed:`, e?.message || e);
            return null;
          }
        };
        pointsEarned = await earnWritingRule('ai_writing', 'AI 영작 첨삭 완료', 10, 5, 'AI 영작 첨삭을 받을 때마다 지급 (하루 5회)');
        if (missionWords.length >= 3 && missionUsed.length >= 3) {
          missionBonus = await earnWritingRule('ai_writing_mission', '영작 미션 단어 달성', 15, 2, '미션 단어 3개 이상을 글에 사용하면 보너스 (하루 2회)');
        }
        // 🔥 연속 영작 마디 보상 — 7·14·21…일마다 +50P (쿨다운 6일로 같은 마디 중복 방지)
        try {
          const KST_OFF = 32400000;
          const days: any = await env.DB.prepare(
            `SELECT DISTINCT CAST((created_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d FROM ai_writing_corrections WHERE student_uid = ? ORDER BY d DESC LIMIT 120`
          ).bind(uid).all();
          const ds = ((days.results || []) as any[]).map(r => Number(r.d));
          const todayD = Math.floor((Date.now() + KST_OFF) / 86400000);
          let wStreak = 0;
          if (ds.length && ds[0] === todayD) {
            wStreak = 1;
            for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) wStreak++;
          }
          if (wStreak >= 7 && wStreak % 7 === 0) {
            streakBonus = await earnWritingRule('ai_writing_streak', '연속 영작 7일 달성', 50, 1, '7일 연속 영작할 때마다 지급', 6 * 86400);
            if (streakBonus && streakBonus.amount) (streakBonus as any).streak = wStreak;
          }
        } catch (e: any) { console.error('[write-correct] streak bonus failed:', e?.message || e); }
        // 📗 첨삭 표현 → 단어장 자동 저장 (짧은 교정 표현만, 사용자별 중복 방지, 회당 최대 3개)
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);`);
          const nowV = Date.now();
          for (const iss of issues.slice(0, 6)) {
            if (vocabSaved.length >= 3) break;
            const sug = String(iss?.suggested || '').trim();
            const reason = String(iss?.reason || '').trim().slice(0, 80);
            if (!sug || sug.length > 40 || !/[a-zA-Z]/.test(sug)) continue;
            const dup: any = await env.DB.prepare(`SELECT id FROM vocabulary WHERE user_id=? AND LOWER(word)=LOWER(?) LIMIT 1`).bind(uid, sug).first();
            if (dup) continue;
            await env.DB.prepare(`INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`)
              .bind(uid, sug, reason || '영작 첨삭에서 배운 표현', corrected.slice(0, 120), nowV, nowV).run();
            vocabSaved.push(sug);
          }
        } catch (e: any) { console.error('[write-correct] vocab save failed:', e?.message || e); }
        try {
          const earned = await checkAndAwardBadges(env, uid);
          earnedBadges = earned
            .map(code => BADGE_CATALOG.find(c => c.code === code))
            .filter(Boolean);
        } catch (e: any) {
          console.error('[write-correct] badge check failed:', e?.message || e);
        }
      }

      // raw 도 lastErr 도 없을 일이 거의 없지만, 어느쪽이든 결과는 반환 (ok: true)
      // 단 진짜로 AI 가 완전히 안 됐으면 errCode 도 표시
      return json({
        ok: true,
        corrected, score, issues, tip, reply, level,
        mission_words: missionWords, mission_used: missionUsed,
        points: pointsEarned, mission_bonus: missionBonus, streak_bonus: streakBonus,
        earned_badges: earnedBadges, vocab_saved: vocabSaved,
        ...(raw ? {} : { ai_unavailable: true, fallback: true }),
      });
    }

    if (method === 'GET' && path === '/api/ai/write-history') {
      await ensureWriteSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰(mango_token)의 uid 와 요청 uid 가 일치해야만 조회.
      //   (예전엔 uid 만 알면 남의 첨삭 이력을 볼 수 있었음 → uid-token-auth 관례 적용)
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid !== uid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      }
      const rs = await env.DB.prepare(
        `SELECT id, original_text, corrected_text, feedback, level, score, created_at FROM ai_writing_corrections WHERE student_uid = ? ORDER BY created_at DESC LIMIT 30`
      ).bind(uid).all();
      return json({ ok: true, items: rs.results || [] });
    }

    // ── GET /api/ai/write-stats?uid=&token= — 영작 성장 리포트 (스트릭·통계·30일 추이) ──
    if (method === 'GET' && path === '/api/ai/write-stats') {
      await ensureWriteSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 본인 통계만 — write-history 와 동일한 서명 토큰 인증
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid || authUid !== uid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      }
      const KST_OFF = 32400000;
      const now = Date.now();
      const todayD = Math.floor((now + KST_OFF) / 86400000);
      // 전체 통계
      const tot: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n, ROUND(AVG(score)) AS avg_score, MAX(score) AS best_score FROM ai_writing_corrections WHERE student_uid = ?`
      ).bind(uid).first();
      // 최근 30일 일별 시리즈 (성장 그래프용)
      const sinceMs = (todayD - 29) * 86400000 - KST_OFF;
      const daily = await env.DB.prepare(
        `SELECT CAST((created_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d, COUNT(*) AS n, ROUND(AVG(score)) AS avg_score, MAX(score) AS best_score
         FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ? GROUP BY d ORDER BY d ASC`
      ).bind(uid, sinceMs).all();
      const series = ((daily.results || []) as any[]).map(r => ({
        date: new Date(Number(r.d) * 86400000).toISOString().slice(0, 10),
        count: r.n || 0, avg_score: r.avg_score || 0, best_score: r.best_score || 0,
      }));
      // 연속 영작일 (오늘 또는 어제부터 역방향)
      const days: any = await env.DB.prepare(
        `SELECT DISTINCT CAST((created_at + ${KST_OFF}) / 86400000 AS INTEGER) AS d FROM ai_writing_corrections WHERE student_uid = ? ORDER BY d DESC LIMIT 120`
      ).bind(uid).all();
      const ds = ((days.results || []) as any[]).map(r => Number(r.d));
      let streak = 0;
      if (ds.length && (ds[0] === todayD || ds[0] === todayD - 1)) {
        streak = 1;
        for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) streak++;
      }
      const wroteToday = ds.length > 0 && ds[0] === todayD;
      // 이번주 vs 지난주 평균점 (성장 한 줄 메시지용) — 주 경계는 KST 월요일
      const dow = (todayD + 3) % 7;               // 1970-01-01(목)=day0, 목→3 이므로 +3 하면 월=0
      const weekStartD = todayD - dow;
      const weekStartMs = weekStartD * 86400000 - KST_OFF;
      const prevWeekStartMs = (weekStartD - 7) * 86400000 - KST_OFF;
      const thisW: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n, ROUND(AVG(score)) AS avg_score FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ?`
      ).bind(uid, weekStartMs).first();
      const lastW: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n, ROUND(AVG(score)) AS avg_score FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ? AND created_at < ?`
      ).bind(uid, prevWeekStartMs, weekStartMs).first();
      return json({
        ok: true,
        total: tot?.n || 0, avg_score: tot?.avg_score || 0, best_score: tot?.best_score || 0,
        streak, wrote_today: wroteToday,
        series,
        this_week: { count: thisW?.n || 0, avg_score: thisW?.avg_score || 0 },
        last_week: { count: lastW?.n || 0, avg_score: lastW?.avg_score || 0 },
      });
    }

    // ── GET /api/ai/write-leaderboard?uid=&token= — 🏆 이번 주 영작왕 (작성 편수 기준) ──
    //   점수 경쟁은 저학년에 역효과 → "많이 쓴 사람" 기준. 이름은 마스킹해 PII 비노출,
    //   uid+token 이 오면 내 순위(me)도 함께 반환. uid 없이 호출해도 목록은 조회 가능.
    if (method === 'GET' && path === '/api/ai/write-leaderboard') {
      await ensureWriteSchema();
      const KST_OFF = 32400000;
      const todayD = Math.floor((Date.now() + KST_OFF) / 86400000);
      const weekStartMs = (todayD - ((todayD + 3) % 7)) * 86400000 - KST_OFF;
      const rs = await env.DB.prepare(
        `SELECT student_uid, COUNT(*) AS n, ROUND(AVG(score)) AS avg_score FROM ai_writing_corrections
         WHERE created_at >= ? AND student_uid IS NOT NULL AND student_uid != '' AND student_uid NOT LIKE 'guest_%'
         GROUP BY student_uid ORDER BY n DESC, avg_score DESC LIMIT 10`
      ).bind(weekStartMs).all();
      const rows = ((rs.results || []) as any[]);
      // 이름 조회(students_erp) 후 마스킹 — "김민준" → "김✱✱", "Amy" → "A✱✱"
      const maskName = (s: string) => {
        const t = String(s || '').trim();
        if (!t) return '익명';
        return t.charAt(0) + '✱✱';
      };
      const nameMap = new Map<string, string>();
      if (rows.length) {
        try {
          const qs = rows.map(() => '?').join(',');
          const ns = await env.DB.prepare(
            `SELECT user_id, korean_name, english_name FROM students_erp WHERE user_id IN (${qs})`
          ).bind(...rows.map(r => r.student_uid)).all();
          for (const r of ((ns.results || []) as any[])) {
            nameMap.set(r.user_id, String(r.korean_name || r.english_name || '').trim());
          }
        } catch {}
      }
      const items = rows.map((r, i) => ({
        rank: i + 1,
        name: maskName(nameMap.get(r.student_uid) || r.student_uid),
        count: r.n || 0, avg_score: r.avg_score || 0,
      }));
      // 내 순위 — 토큰 인증된 본인만
      let me: any = null;
      const lbUid = String(url.searchParams.get('uid') || '').trim();
      if (lbUid) {
        const authUid = await authUidGlobal(request, url, env);
        if (authUid && authUid === lbUid) {
          const mine: any = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM ai_writing_corrections WHERE student_uid = ? AND created_at >= ?`
          ).bind(lbUid, weekStartMs).first();
          const myN = mine?.n || 0;
          if (myN > 0) {
            const above: any = await env.DB.prepare(
              `SELECT COUNT(*) AS c FROM (SELECT student_uid FROM ai_writing_corrections
               WHERE created_at >= ? AND student_uid IS NOT NULL AND student_uid != '' AND student_uid NOT LIKE 'guest_%'
               GROUP BY student_uid HAVING COUNT(*) > ?)`
            ).bind(weekStartMs, myN).first();
            me = { rank: (above?.c || 0) + 1, count: myN };
          } else {
            me = { rank: null, count: 0 };
          }
        }
      }
      return json({ ok: true, week_start: new Date(weekStartMs + KST_OFF).toISOString().slice(0, 10), items, me });
    }
    // ═══════════════════════════════════════════════════════════════
    // ✍️ Phase AW 끝
    // ═══════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase CF — AI 24시간 영어 친구 챗봇
    // ═══════════════════════════════════════════════════════════════
    const ensureChatSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_friend_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, level TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_chat_uid ON ai_friend_chats(student_uid, created_at);`);
    };

    // ✨ 오늘의 단어 — KST 날짜로 결정되는 순환 목록. 클라이언트 HUD 와 서버 보너스 판정의 단일 정본.
    const AI_FRIEND_WORDS: Array<{ w: string; ko: string; e: string }> = [
      { w: 'amazing', ko: '놀라운', e: '🤩' }, { w: 'delicious', ko: '아주 맛있는', e: '🍕' },
      { w: 'brave', ko: '용감한', e: '🦁' }, { w: 'curious', ko: '호기심 많은', e: '🔍' },
      { w: 'favorite', ko: '가장 좋아하는', e: '💖' }, { w: 'exciting', ko: '신나는', e: '🎢' },
      { w: 'together', ko: '함께', e: '🤝' }, { w: 'weekend', ko: '주말', e: '📅' },
      { w: 'weather', ko: '날씨', e: '🌤' }, { w: 'special', ko: '특별한', e: '🌟' },
      { w: 'adventure', ko: '모험', e: '🗺' }, { w: 'friendly', ko: '다정한', e: '😊' },
      { w: 'hungry', ko: '배고픈', e: '🍚' }, { w: 'awesome', ko: '끝내주는', e: '👍' },
      { w: 'dream', ko: '꿈', e: '💭' }, { w: 'travel', ko: '여행하다', e: '✈' },
      { w: 'animal', ko: '동물', e: '🐾' }, { w: 'happy', ko: '행복한', e: '😄' },
      { w: 'library', ko: '도서관', e: '📚' }, { w: 'practice', ko: '연습하다', e: '💪' },
      { w: 'beautiful', ko: '아름다운', e: '🌸' }, { w: 'question', ko: '질문', e: '❓' },
      { w: 'birthday', ko: '생일', e: '🎂' }, { w: 'important', ko: '중요한', e: '📌' },
      { w: 'vacation', ko: '방학·휴가', e: '🏖' }, { w: 'surprise', ko: '깜짝 놀람', e: '🎁' },
      { w: 'healthy', ko: '건강한', e: '🥗' }, { w: 'famous', ko: '유명한', e: '⭐' },
      { w: 'monster', ko: '괴물', e: '👾' }, { w: 'rainbow', ko: '무지개', e: '🌈' },
    ];
    const aiFriendWordOfDay = () => {
      const dayIdx = Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
      return AI_FRIEND_WORDS[dayIdx % AI_FRIEND_WORDS.length];
    };
    // 🎮 HUD 스냅샷 — 오늘/누적 메시지 수 + 🔥연속 대화 일수(KST). 채팅·히스토리 응답에 공용.
    const aiFriendGamSnapshot = async (uid: string) => {
      const KST_OFF = 9 * 3600 * 1000;
      const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
      const tc: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=?`).bind(uid, todayMs).first();
      const lc: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user'`).bind(uid).first();
      const dr: any = await env.DB.prepare(`SELECT DISTINCT CAST((created_at + 32400000) / 86400000 AS INTEGER) AS d FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=? ORDER BY d DESC LIMIT 40`).bind(uid, Date.now() - 40 * 86400000).all();
      const days = new Set(((dr.results || []) as any[]).map(r => Number(r.d)));
      const todayIdx = Math.floor((Date.now() + KST_OFF) / 86400000);
      let streak = 0;
      while (days.has(todayIdx - streak)) streak++;
      // 오늘 아직 안 보냈어도 어제까지의 스트릭은 이어짐 표시 (끊긴 건 아님)
      if (streak === 0 && days.has(todayIdx - 1)) { let s = 0; while (days.has(todayIdx - 1 - s)) s++; streak = s; }
      return { today: tc?.c || 0, lifetime: lc?.c || 0, streak, word: aiFriendWordOfDay() };
    };

    // ── POST /api/ai/chat-guest-token — 비로그인 게스트용 세션 스코프 uid + 서명 토큰 발급 ──
    //   클라이언트가 임의 uid 를 만들어 보내는 것을 금지 (IDOR 방지). 게스트 uid 는
    //   서버가 발급한 추측 불가 랜덤값 + 단기 토큰만 허용, sessionStorage 에만 보관.
    if (method === 'POST' && path === '/api/ai/chat-guest-token') {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const guestUid = 'guest_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      return json({ ok: true, uid: guestUid, token: await signUidToken(guestUid, env, 7 * 86400 * 1000) });
    }

    if (method === 'POST' && path === '/api/ai/chat-friend') {
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      const msg = String(b.msg || '').trim();
      const level = String(b.level || 'A2').trim();
      const persona = String(b.persona || 'friendly').trim(); // friendly | playful | serious | tutor
      if (!uid || !msg) return json({ ok: false, error: 'uid_and_msg_required' }, 400);
      if (msg.length > 500) return json({ ok: false, error: 'msg_too_long' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수
      const authUid = await authUidGlobal(request, url, env, b);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);

      // 최근 10개 메시지 컨텍스트
      const recent: any = await env.DB.prepare(
        `SELECT role, content FROM ai_friend_chats WHERE student_uid = ? ORDER BY id DESC LIMIT 10`
      ).bind(uid).all();
      const history = (recent.results || []).reverse();

      const personaMap: any = {
        friendly: 'a warm, cheerful mango-shaped English friend named Mango who loves cheering kids on',
        playful: 'a silly, joke-loving mango buddy named Mango who makes English feel like a game',
        serious: 'a calm, kind English study partner named Mango who explains things clearly',
        tutor: 'a supportive English tutor named Mango who gently corrects mistakes and celebrates progress',
      };
      const wodNow = aiFriendWordOfDay();
      const system = `You are ${personaMap[persona] || personaMap.friendly}. You chat with a young Korean student at CEFR level ${level}.
Rules:
- Reply in English matched to ${level} (A1 = very short simple sentences with easy words; C1 = natural and fluent).
- Keep replies 1-3 short sentences, then ask exactly ONE fun follow-up question so the student answers again.
- When the student writes in English, start with a short cheer like "Nice sentence!" or "Great try!".
- Use 1-2 fun emojis per reply. Kids love them.
- If the student writes Korean, warmly invite them to try English and give one simple example sentence they can copy.
- If you spot a grammar or spelling mistake, add ONE short Korean tip at the very end in exactly this format: (💡 ~가 더 자연스러워요)
- Sprinkle in tiny fun facts kids enjoy (animals, space, food, games) when it fits.
- Today's special word is "${wodNow.w}" (Korean: ${wodNow.ko}). Use it naturally sometimes, and cheer loudly if the student uses it.
- Never break character. Never say you are an AI. Never use words far above the student's level.`;

      const messages: any[] = [{ role: 'system', content: system }];
      for (const h of history) {
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
      }
      messages.push({ role: 'user', content: msg });

      // env.AI 가 binding 안되어 있을 가능성 방어
      if (!env.AI) {
        return json({ ok: false, error: 'AI_binding_missing', detail: 'env.AI binding not configured' }, 503);
      }

      // 여러 모델 후보로 폴백 — 일부 모델이 지역/계정에서 사용 불가일 수 있음
      const models = [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
      ];
      let reply = '';
      let lastErr: any = null;
      let usedModel = '';
      for (const m of models) {
        try {
          const resp: any = await env.AI.run(m, {
            messages, max_tokens: 300, temperature: 0.8,
          });
          if (typeof resp === 'string') reply = resp;
          else if (resp && typeof resp.response === 'string') reply = resp.response;
          else if (resp && resp.response) reply = JSON.stringify(resp.response);
          else if (resp && resp.result && typeof resp.result === 'string') reply = resp.result;
          reply = String(reply || '').trim();
          if (reply) { usedModel = m; break; }
        } catch (e: any) {
          lastErr = e;
          console.error(`[chat-friend] model ${m} failed:`, e?.message || e);
        }
      }
      if (!reply) {
        // AI 호출이 다 실패한 경우 — 친근한 폴백
        const fallbacks = [
          "Hi! 😊 I'm here. Tell me about your day in English!",
          "Hello! Let's practice some English together. What's on your mind?",
          "Hey there! 🥭 Try writing one sentence in English about what you ate today!",
        ];
        reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        console.error('[chat-friend] all models failed, using fallback. last error:', lastErr?.message || lastErr);
      }

      try {
        const now = Date.now();
        await env.DB.prepare(`INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)`).bind(uid, 'user', msg, level, now).run();
        await env.DB.prepare(`INSERT INTO ai_friend_chats (student_uid, role, content, level, created_at) VALUES (?,?,?,?,?)`).bind(uid, 'assistant', reply, level, now + 1).run();
      } catch (e: any) {
        console.error('[chat-friend] DB insert failed:', e?.message || e);
        // DB 실패해도 reply는 반환
      }

      // 🎮 게임화 — 포인트/스트릭/오늘의 단어 보너스. 실패해도 채팅 응답은 정상 반환.
      //   메시지당 2P(하루 10회) · 오늘의 단어 사용 +5P(하루 1회) · 🎤말하기 +1P(하루 5회)
      //   게스트(guest*)는 HUD 숫자만 주고 포인트는 적립하지 않음(기프티콘 교환 불가 계정).
      let gam: any = null;
      try {
        gam = await aiFriendGamSnapshot(uid);
        gam.awarded = 0; gam.word_bonus = 0; gam.voice_bonus = 0;
        if (!/^guest/i.test(uid)) {
          await ensurePointTables(env);
          const KST_OFF = 9 * 3600 * 1000;
          const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
          const usedToday = async (code: string) => {
            const c: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(uid, code, todayMs).first();
            return c?.c || 0;
          };
          const logAward = async (code: string, amount: number, label: string) => {
            const r = await applyPointTransaction(env, { userId: uid, type: 'earn', amount, reason: label, ruleCode: code });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,NULL)`).bind(uid, code, amount, Date.now(), r.txnId).run();
          };
          if ((await usedToday('ai_friend_chat')) < 10) { await logAward('ai_friend_chat', 2, '망고와 영어 수다'); gam.awarded = 2; }
          const wod = gam.word;
          if (wod && new RegExp(`\\b${wod.w}\\b`, 'i').test(msg) && (await usedToday('ai_friend_word')) < 1) {
            await logAward('ai_friend_word', 5, `오늘의 단어(${wod.w}) 사용`); gam.word_bonus = 5;
          }
          if (String(b.via || '') === 'voice' && (await usedToday('ai_friend_voice')) < 5) {
            await logAward('ai_friend_voice', 1, '영어로 말하기'); gam.voice_bonus = 1;
          }
        }
      } catch (e: any) {
        console.error('[chat-friend] gamification failed:', e?.message || e);
      }

      return json({ ok: true, reply, level, persona, model: usedModel || 'fallback', gam });
    }

    if (method === 'GET' && path === '/api/ai/chat-history') {
      await ensureChatSchema();
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수 (타인 대화 열람 차단)
      const authUid = await authUidGlobal(request, url, env);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
      const rs = await env.DB.prepare(
        `SELECT id, role, content, created_at FROM ai_friend_chats WHERE student_uid = ? ORDER BY id ASC LIMIT 200`
      ).bind(uid).all();
      // 🎮 HUD 초기 데이터(오늘/누적/스트릭/오늘의 단어) — 실패해도 히스토리는 정상 반환
      let gam: any = null;
      try { gam = await aiFriendGamSnapshot(uid); } catch {}
      return json({ ok: true, items: rs.results || [], gam });
    }

    if (method === 'POST' && path === '/api/ai/chat-clear') {
      await ensureChatSchema();
      const b: any = await request.json().catch(() => ({}));
      const uid = String(b.uid || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수 (타인 대화 삭제 차단)
      const authUid = await authUidGlobal(request, url, env, b);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);
      await env.DB.prepare(`DELETE FROM ai_friend_chats WHERE student_uid = ?`).bind(uid).run();
      return json({ ok: true });
    }
    // ═══════════════════════════════════════════════════════════════
    // 💬 Phase CF 끝
    // ═══════════════════════════════════════════════════════════════

    // 🥭 Phase 21 — AI 명령 (Workers AI Llama 3.3 70B)
    //   POST /api/admin/ai-command  { command: string }
    //     · 자연어 명령을 의도 분류 (answer / navigate / query / action)
    //     · query intent 는 서버에서 자동 도구 실행 후 결과 반환
    //     · action intent 는 confirm_text 만 반환 (실행은 ai-action 엔드포인트)
    //   POST /api/admin/ai-action   { name: string, args: object }
    //     · 사용자가 confirm 다이얼로그 OK 한 후 호출
    //     · 화이트리스트 액션만 실행 (send_kakao_self/issue_sticker/mark_intervention)
    // ════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/admin/ai-command') {
      if (!env.AI) {
        return json({ ok: false, error: 'ai_binding_missing',
                      hint: 'wrangler.toml 에 [ai] binding=AI 설정 후 재배포 필요' }, 503);
      }
      const body = await parseJsonBody(request);
      const command = body?.command || '';
      if (!command) return json({ ok: false, error: 'command_required' }, 400);
      // 🌐 프런트에서 전달한 언어 힌트 (en/ko) — AI 답변 언어 결정
      const lang = (body?.lang === 'en') ? 'en' : 'ko';
      const result = await processAiCommand(env, command, lang);
      return json(result, result.ok === false ? 500 : 200);
    }

    // 🎒 학생 검색창 AI — 관리자 ai-command 와 동일 엔진, 학생 스코프 (공개)
    //   POST /api/student/ai-command  { command }
    if (method === 'POST' && path === '/api/student/ai-command') {
      const body = await parseJsonBody(request);
      const command = body?.command || '';
      if (!command) return json({ intent: 'answer', answer: '검색어를 입력해주세요.' }, 200);
      const result = await processStudentCommand(env, command);
      return json(result, 200);
    }

    if (method === 'POST' && path === '/api/admin/ai-action') {
      const body = await parseJsonBody(request);
      const name = body?.name || '';
      const args = body?.args || {};
      if (!name) return json({ ok: false, error: 'name_required' }, 400);
      // 🔒 adminUserId 는 감사로그(created_by/by) 귀속용 — 클라이언트가 임의로 보낼 수 있는
      //   x-admin-user-id 헤더 대신, 세션쿠키에서 검증된 실제 로그인 사용자로 고정한다.
      const _aiSess = await checkAdminSession(request, env as any);
      const adminUserId = _aiSess.ok ? (_aiSess.username || null) : null;
      const result = await executeAction(env, name, args, adminUserId);
      return json(result, result.ok === false ? 400 : 200);
    }

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
