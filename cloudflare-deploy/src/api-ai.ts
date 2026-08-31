// ═══════════════════════════════════════════════════════════════════════
// 🤖 api-ai.ts — AI 영작 첨삭(AW) + AI 영어친구 챗봇(CF) (25차 분리)
//   게임화 포인트/배지는 api-points·api-games 의 export 헬퍼 사용.
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal, signUidToken } from './auth-token';
import { ensurePointTables, applyPointTransaction } from './api-points';
import { checkAndAwardBadges, BADGE_CATALOG } from './api-games';
import { processAiCommand, executeAction, processStudentCommand } from './ai-command';
import { recordJudgmentEvents, guessMisconception } from './api-judgment';  // 🧠 판단력 캡처(D3)
import { checkAdminSession } from './auth-admin';
import { explainCorrection } from './correction-reason';   // 🔤 «왜 고쳤는지» 결정론 설명
import { aiFriendLevelSpec, aiFriendMeasureReply, aiFriendShortenHint,
         aiFriendTrimSentences, aiFriendNormalizeLevel,
         AI_FRIEND_DEFAULT_LEVEL } from './ai-friend-level';   // 🎚 눈높이(레벨) 정본
import { resolveFriendName } from './ai-friends';   // 🧑 AI 친구 이름 정본(Emma·Jake·Lily·Noah)
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
3. List 2-5 specific issues found, each with: original phrase, suggested phrase, and a REQUIRED brief reason IN KOREAN (one short sentence explaining WHY, e.g. tense, article, preposition, word order). Never leave "reason" empty.
4. Provide one encouraging tip in Korean (1-2 sentences).
5. Reply to the CONTENT of the student's writing like a pen-pal friend, in English appropriate for ${level} level (1-2 short sentences, warm, may end with a small question).
6. Suggest 1-3 vocabulary upgrades: pick a plain word or phrase the student ACTUALLY WROTE and offer a more natural / more advanced English word for CEFR ${level} (e.g. "thing you own" -> "property", "bad guy who steals" -> "thief"). "from" MUST appear in the student's text exactly. "why" is REQUIRED and must be a short Korean sentence saying WHY the new word is better (nuance, register, precision) — an item with an empty "why" is DISCARDED, so never leave it blank. If nothing is worth upgrading, use an empty list.

Respond in this strict JSON format only, no markdown:
{
  "corrected": "...",
  "score": 85,
  "issues": [{"original":"...","suggested":"...","reason":"..."}],
  "tip": "...",
  "reply": "...",
  "upgrades": [{"from":"...","to":"...","why":"..."}]
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
      // ✍️ [2026-07-27] 첨삭에 '왜 고쳤는지'가 안 보이던 문제(직원 피드백 #14).
      //   프롬프트는 이유(reason)를 한국어로 요구하고 화면도 이유를 렌더링한다 — 그런데
      //   모델이 reason 을 비워 보내도 서버가 그대로 통과시켜, 학생 화면에 "with → to" 만 떴다.
      //   (폴백 소형 모델로 내려갈수록 잘 비운다.) 여기서 두 가지를 보장한다:
      //     ① 이유가 비면 원본/교정 형태를 보고 규칙 기반으로 최소한의 설명을 채운다
      //     ② 그래도 못 채우면 그 항목은 아예 내보내지 않는다(빈 "💡" 만 뜨는 것보다 낫다)
      //   문구는 학생 대상이므로 '틀렸다'가 아니라 '이렇게 하면 더 자연스럽다' 톤을 지킨다.
      /* 🔤 [2026-08-31] «왜 고쳤는지» 는 프롬프트에 기대지 않는다.
         운영 D1 실측: 최근 8건의 교정 **21건 전부** 이유가 폴백 일반 문구였다 —
         즉 모델이 reason 을 매번 비워 보낸다. 학생은 «무엇을» 만 보고 «왜» 는 못 배웠다.
         정본은 `src/correction-reason.ts` 의 explainCorrection(원문→교정 낱말 diff 분류).
         ⛔ 분류가 안 되면 null 을 돌려주고, 그때만 일반 문구를 쓴다 — 지어내지 않는다. */
      const _guessReason = (orig: string, sug: string): string =>
        explainCorrection(orig, sug) || '더 자연스러운 표현으로 바꿨어요.';
      const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
        .slice(0, 8)
        .map((it: any) => {
          const original = String(it?.original || '').trim();
          const suggested = String(it?.suggested || '').trim();
          let reason = String(it?.reason || '').trim();
          /* ⚠️ 모델 이유는 «한국어로 6자 이상» 일 때만 씁니다 — 빈 값·영어 한 낱말이 그대로
             학생 화면에 나가던 것을 막습니다. 그 밖에는 결정론 설명(explainCorrection). */
          if (!/[가-힣]/.test(reason) || reason.length < 6) reason = _guessReason(original, suggested);
          return { original, suggested, reason };
        })
        .filter((it: any) => it.original && it.suggested && it.reason);
      const tip = String(parsed.tip || '꾸준히 영작 연습을 이어가세요! 매일 한 문장씩만 써도 한 달이면 30문장입니다.');
      // 💬 망고 선생님의 답장 — 첨삭을 '검사'가 아니라 '대화'로 만드는 펜팔 답장
      const reply = String(parsed.reply || '').trim().slice(0, 400);
      // ⬆️ [2026-08-30] 어휘 업그레이드 — 쉬운 단어를 더 자연스러운 원어민 표현으로.
      //   ⚠️ 모델이 «학생이 쓰지도 않은 단어» 를 고쳐 준 것처럼 지어내는 일이 있다.
      //      그러면 학생 화면에 «내가 안 쓴 말» 이 내 글에서 고쳐진 것처럼 뜬다 →
      //      from 이 실제 원문에 있는 경우만 통과시킨다(없으면 그 항목을 버린다).
      //   ⚠️ to 는 화면에 «따라 쓸 영어» 로 나가므로 한글·한자가 섞이면 안 된다.
      /* 🔤 [2026-08-31] why 가 비면 **그 항목을 아예 내보내지 않는다**(사장님 결정 — A안).
         운영 D1 실측: 이 기능이 나간 뒤 실제로 나온 업그레이드 1건의 why 가
         **서버 폴백 문구 그대로**였다(「더 자연스럽고 어른스러운 표현이에요」) — 즉 모델이
         why 를 비워 보내고 서버가 채우고 있었다. 교정 이유(reason)가 21/21 폴백이던 것과 같은 패턴.
         ⛔ 어휘 «왜» 는 의미 판단이라 교정 이유처럼 결정론으로 만들 수 없다
            (`special → memorable` 이 왜 나은지는 낱말 diff 로 셀 수 없다).
            그래서 지어내는 대신 **버립니다** — 같은 화면의 교정 이유(issues)가 이미 그 규칙이다.
         ⚠️ 그래서 업그레이드는 «가끔 0건» 이 정상입니다. 화면이 비었다고 고장이 아닙니다. */
      const _lowText = text.toLowerCase();
      const upgrades = (Array.isArray(parsed.upgrades) ? parsed.upgrades : [])
        .slice(0, 6)
        .map((u: any) => ({
          from: String(u?.from || '').trim().slice(0, 60),
          to: String(u?.to || '').trim().slice(0, 60),
          why: String(u?.why || '').trim().slice(0, 160),
        }))
        .filter((u: any) =>
          u.from && u.to &&
          u.from.toLowerCase() !== u.to.toLowerCase() &&
          /^[A-Za-z][A-Za-z' -]{0,59}$/.test(u.to) &&
          // ⚠️ 이유는 «한국어로 6자 이상» 일 때만 인정한다(issues 와 같은 기준).
          //    빈 값·영어 한 낱말이 그대로 학생 화면에 나가던 것을 막는다.
          /[가-힣]/.test(u.why) && u.why.length >= 6 &&
          _lowText.includes(u.from.toLowerCase()))
        .slice(0, 3);

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
        ).bind(uid || null, text, corrected, JSON.stringify({ issues, tip, reply, upgrades, mission_words: missionWords, mission_used: missionUsed, meta }), level, score, now).run();
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

        // 🧠 [판단력 D3] 영작 교정 = 판단 이벤트. issues(원문→교정)를 그대로 기록(재-LLM 없음).
        //   issue 있으면 각 issue = "더 나은 표현을 지나친 판단"(오답유형 매핑), 없으면 최적 판단 1건.
        try {
          const jList = issues.length
            ? issues.slice(0, 3).map((iss: any) => ({
                situation: 'AI writing correction', skill_tag: 'writing',
                chosen: String(iss?.original || '').slice(0, 300),
                better: String(iss?.suggested || '').slice(0, 300),
                is_optimal: 0, choice_score: score,
                misconception: guessMisconception(String(iss?.reason || '')),
                feedback_ko: String(iss?.reason || '').slice(0, 200),
              })).filter((j: any) => j.chosen || j.better)
            : [{ situation: 'AI writing correction', skill_tag: 'writing',
                 chosen: text.slice(0, 200), better: corrected.slice(0, 200),
                 is_optimal: 1, choice_score: score }];
          if (jList.length) await recordJudgmentEvents(env, { studentUid: uid, source: 'writing', refId: Date.now(), judgments: jList });
        } catch (e: any) { console.warn('[write-correct] judgment capture skip:', e?.message); }
      }

      // raw 도 lastErr 도 없을 일이 거의 없지만, 어느쪽이든 결과는 반환 (ok: true)
      // 단 진짜로 AI 가 완전히 안 됐으면 errCode 도 표시
      return json({
        ok: true,
        corrected, score, issues, tip, reply, upgrades, level,
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
      // 🐢 세 조회는 서로 무관(같은 uid, 다른 집계) — 순서대로 기다리지 않고 한꺼번에 보낸다.
      const [tc, lc, dr]: any[] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=?`).bind(uid, todayMs).first(),
        env.DB.prepare(`SELECT COUNT(*) AS c FROM ai_friend_chats WHERE student_uid=? AND role='user'`).bind(uid).first(),
        env.DB.prepare(`SELECT DISTINCT CAST((created_at + 32400000) / 86400000 AS INTEGER) AS d FROM ai_friend_chats WHERE student_uid=? AND role='user' AND created_at>=? ORDER BY d DESC LIMIT 40`).bind(uid, Date.now() - 40 * 86400000).all(),
      ]);
      const days = new Set(((dr.results || []) as any[]).map(r => Number(r.d)));
      const todayIdx = Math.floor((Date.now() + KST_OFF) / 86400000);
      let streak = 0;
      while (days.has(todayIdx - streak)) streak++;
      // 오늘 아직 안 보냈어도 어제까지의 스트릭은 이어짐 표시 (끊긴 건 아님)
      if (streak === 0 && days.has(todayIdx - 1)) { let s = 0; while (days.has(todayIdx - 1 - s)) s++; streak = s; }
      return { today: tc?.c || 0, lifetime: lc?.c || 0, streak, word: aiFriendWordOfDay() };
    };

    /* 🔁 (2026-07-23 제보) "I 한 마디만 했는데 지난번 답을 그대로 길게 다시 한다".
       웜업(handleWarmupChat)에는 반복 감지 후 재생성이 있었지만 AI 친구에는 없었다.
       모델은 입력이 짧거나 애매하면 직전 답변을 거의 그대로 복사한다 → 직전 AI 발화와
       (거의) 같으면 한 번 다시 생성한다. 판정은 웜업과 동일한 방식. */
    const aiFriendNorm = (s: string) =>
      String(s || '').toLowerCase().replace(/[^a-z0-9가-힣' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const aiFriendIsRepeat = (text: string, hist: any[]) => {
      const t = aiFriendNorm(text);
      if (t.length < 12) return false;                 // 짧은 리액션("Nice try!")은 반복 허용
      for (const m of hist.filter((h) => h && h.role === 'assistant').slice(-3)) {
        const p = aiFriendNorm(String(m.content || ''));
        if (!p) continue;
        if (p === t) return true;
        const shorter = p.length < t.length ? p : t;
        const longer = p.length < t.length ? t : p;
        // 앞부분이 통째로 같으면(길이의 80% 이상) 사실상 같은 답으로 본다
        if (shorter.length >= 24 && longer.startsWith(shorter.slice(0, Math.floor(shorter.length * 0.8)))) return true;
      }
      return false;
    };
    /* 🎤 음성 인식이 잘라먹은 조각인가.
       ⚠️ (2026-07-29 학생 제보 · 화면녹화 증거) "또박또박 말하는데 계속 다시 말하래요".
       진범은 오인식이 아니라 이 판정이었다. 옛 판정은 ①두 단어 이하면 무조건 잘림,
       ②마지막 단어가 흔한 기능어면 무조건 잘림으로 봤는데, 그 목록에 it/you/me/do/can/is
       처럼 "문장을 정상적으로 끝내는" 말이 들어 있었다. 그래서 Whisper 가 **완벽하게**
       받아적은
         "I like watching movies, but I don't do it."   (→ 끝 단어 it)
         "I like watching movies. What about you?"      (→ 끝 단어 you)
       가 연달아 '잘림'으로 찍혀 학생은 네 번 내리 "Can you say the whole sentence again?"
       만 들었다. 아이는 결국 "Why do you always think again to me?" 라고 물었다.
       이제는 ①문장부호로 끝나면 완결로 보고, ②영어로 문장을 끝낼 수 없는 말(관사·전치사·
       접속사·소유격)로 끝날 때만 잘림으로 본다. 놓치는 쪽(되묻지 않고 그냥 답하기)이
       잘못 되묻는 쪽보다 학생에게 훨씬 낫다. */
    // 이 말로 끝나면 영어 문장이 성립하지 않는다 — 명백한 조각
    const AI_FRIEND_DANGLING = /^(a|an|the|and|or|but|to|of|in|on|at|for|with|from|about|my|your|his|her|their|our|because|than|very|really|going)$/i;
    // 뒤에 말이 와야만 뜻이 되는 be동사류 ("My favorite movie is" → 조각)
    const AI_FRIEND_DANGLING_BE = /^(i|is|are|am|was|were|want|need|going)$/i;
    // 짧은 대답은 이 말로 끝나도 정상("Yes, I can.") — 두 단어 이하일 때만 조각으로 본다("I like")
    const AI_FRIEND_DANGLING_SHORT = /^(do|does|did|can|will|would|have|has|like|that|this|it|there)$/i;
    const aiFriendLooksCut = (s: string) => {
      const raw = String(s || '').trim();
      if (!raw) return false;
      if (/[.!?…"')\]]$/.test(raw)) return false;      // 문장부호로 끝나면 다 말한 것
      const w = raw.split(/\s+/).filter(Boolean);
      if (!w.length) return false;
      const last = w[w.length - 1].replace(/[^a-z']/gi, '');
      if (!last) return false;
      if (AI_FRIEND_DANGLING.test(last) || AI_FRIEND_DANGLING_BE.test(last)) return true;
      return w.length <= 2 && AI_FRIEND_DANGLING_SHORT.test(last);
    };
    /* 🔁 직전 답이 이미 "다시 말해줄래?" 였는가 — 두 번 연속 되묻는 것은 금지.
       한 번 못 알아들었으면 두 번째는 알아들은 만큼이라도 받아주고 대화를 이어가야 한다. */
    const aiFriendJustAskedAgain = (hist: any[]) => {
      const last = [...hist].reverse().find((h) => h && h.role === 'assistant');
      if (!last) return false;
      return /(say (it|that|the whole sentence) again|one more time|didn'?t catch|only caught|다시 말)/i
        .test(String(last.content || ''));
    };
    /* 🐢 "천천히 말해줘 / 다시 말해줘" 같은 부탁인가 — 무시하고 제 얘기만 하면 안 된다 */
    const aiFriendIsMetaAsk = (s: string) =>
      /(천천히|느리게|빠르|다시\s*(말|얘기|해)|못\s*알아|모르겠|쉽게|짧게)/.test(String(s || '')) ||
      /\b(slow(ly| down)?|too fast|say (it|that) again|again please|repeat|i don'?t (know|understand)|simpler|easier|shorter)\b/i.test(String(s || ''));
    /* 🈚 (2026-07-27 사장님 신고) Llama 가 한국어 팁을 쓰다 중국어 단어를 섞는다
       ("💡猴子들은 바나나와 많은 과일들을 좋아해요"). 영어친구챗 답변에 한자가 정당하게
       나올 일은 없다 — 한자가 섞인 💡팁은 통째로 떼고(팁은 선택 요소·반쪽 문장을 남기지
       않기 위해), 본문에 흘러든 한자 낱글자는 지운다. 한글(가-힣)은 건드리지 않는다. */
    const aiFriendStripHanzi = (s: string) => {
      let r = String(s || '');
      const HAN = /[㐀-䶿一-鿿]/;
      r = r.replace(/\(?\s*💡[^\n)]*\)?/g, (m) => (HAN.test(m) ? '' : m));
      return r.replace(/[㐀-䶿一-鿿]+/g, '').replace(/[ \t]{2,}/g, ' ').trim();
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
      /* 🪜 여덟 칸으로 넓히면서, 학생 브라우저에 남아 있는 옛 키(A1…C1)도 그대로 받습니다.
         ⛔ 정규화를 빼면 옛 값이 «모르는 값» 이 되어 조용히 기본값으로 떨어집니다 —
            학생이 고른 레벨이 리셋된 것처럼 보입니다. */
      const level = aiFriendNormalizeLevel(b.level);
      const persona = String(b.persona || 'friendly').trim(); // friendly | playful | serious | tutor
      /* 🗺 (2026-07-29 학생 제보) "영화 주제로 들어왔는데 처음엔 동물 얘기를 물어봤어요".
         지금까지 주제 카드는 영어 문장 한 줄을 대신 보내주는 게 전부였고, 그 다음 턴부터는
         모델이 주제를 붙잡아 둘 근거가 아무것도 없었다(게다가 시스템 프롬프트가 재미난
         사실 예시로 'animals' 를 맨 앞에 박아둬서 첫 턴부터 동물로 새기 쉬웠다).
         이제 고른 주제를 매 요청에 실어 보내 대화 내내 유지한다. */
      const topic = String(b.topic || '').trim().slice(0, 40);
      if (!uid || !msg) return json({ ok: false, error: 'uid_and_msg_required' }, 400);
      if (msg.length > 500) return json({ ok: false, error: 'msg_too_long' }, 400);
      // 🔐 IDOR 방지 — 서명 토큰의 uid 와 요청 uid 일치 필수
      const authUid = await authUidGlobal(request, url, env, b);
      if (!authUid) return json({ ok: false, error: 'auth_required', message: '로그인 후 이용해주세요.' }, 401);
      if (authUid !== uid) return json({ ok: false, error: 'uid_mismatch' }, 403);

      // 🐢 (2026-07-27) 응답 지연 최소화 — 서로 무관한 조회들을 순서대로 기다리지 않고 한꺼번에 보낸다.
      //   (gamSnapshot 은 "오늘 몇 번째 대화인가"를 이번 메시지가 기록된 뒤에 세야 정확해서
      //   여기서 같이 시작하지 않는다 — 채팅 로그 저장 이후에 계산한다.)
      const [recent, st, wk]: any[] = await Promise.all([
        env.DB.prepare(`SELECT role, content FROM ai_friend_chats WHERE student_uid = ? ORDER BY id DESC LIMIT 10`).bind(uid).all(),
        env.DB.prepare(`SELECT english_name, korean_name, textbook, level FROM students_erp WHERE user_id = ? LIMIT 1`).bind(uid).first().catch(() => null),
        env.DB.prepare(`SELECT item, ko FROM game_progress WHERE user_id = ? AND lang = 'en' AND wrong_count > 0 AND wrong_count >= correct_count ORDER BY wrong_count DESC LIMIT 5`).bind(uid).all().catch(() => null),
      ]);
      const history = (recent.results || []).reverse();

      /* 🧑 이름은 학생이 고른다(Emma·Jake·Lily·Noah) — 예전에는 네 갈래가 전부 "named Mango" 라,
         화면이 "Hi! I'm Lily." 라고 인사해 놓고 학생이 이름을 물으면 AI 가 다른 이름을 댔다
         (2026-08-31 사장님 제보). ⛔ 화면이 보낸 문자열을 그대로 넣지 말 것 — 정본 표를 거친다. */
      const friendName = resolveFriendName(b.friend);
      const personaMap: any = {
        friendly: `a warm, cheerful English friend named ${friendName} who loves cheering kids on`,
        playful: `a silly, joke-loving English buddy named ${friendName} who makes English feel like a game`,
        serious: `a calm, kind English study partner named ${friendName} who explains things clearly`,
        tutor: `a supportive English tutor named ${friendName} who gently corrects mistakes and celebrates progress`,
      };
      // 🎓 개인화(26-07-21) — 그 학생의 이름·교재·약점 단어를 아는 친구 (웜업 엔진과 동일 데이터 재사용).
      //    실패하면 조용히 일반 친구로 동작 — 채팅 흐름에 절대 영향 금지.
      /* 🎚 눈높이 규격 — 이 아래의 프롬프트·검사가 전부 이 하나를 봅니다(정본 src/ai-friend-level.ts).
         ⚠️ 여기서 만들어야 합니다 — 아래 stuCtx(약점 단어)가 lvSpec.plain 을 읽습니다. */
      const lvSpec = aiFriendLevelSpec(level);
      let stuCtx = '';
      try {
        const sname = String(st?.english_name || st?.korean_name || '').trim().slice(0, 40);
        const textbook = String(st?.textbook || '').trim().slice(0, 60);
        const weak = (((wk?.results as any[]) || []).map((r: any) => (r.ko ? `${r.item} (${r.ko})` : String(r.item))).filter(Boolean)).slice(0, 5);
        const parts: string[] = [];
        if (sname) parts.push(`Their name is "${sname}" — greet or cheer them by name sometimes.`);
        if (textbook) parts.push(`They study the textbook "${textbook}" — occasionally relate the chat to what they learn there.`);
        if (weak.length && !lvSpec.plain) parts.push(`Words they recently got wrong in games/quizzes: ${weak.join(', ')}. Once in a while, weave ONE of these words naturally into your reply or question (never quiz the whole list at once). Cheer loudly when they use one correctly.`);
        if (parts.length) stuCtx = `\nAbout THIS student (use naturally in conversation — never recite this list):\n- ${parts.join('\n- ')}`;
      } catch { /* 개인화 실패 무시 */ }

      const wodNow = aiFriendWordOfDay();
      // 🗺 학생이 고른 주제 — 대화 내내 이 주제 안에서 논다. 학생이 스스로 다른 얘기를 꺼내면 따라간다.
      const topicCtx = topic
        ? `\nThe student chose the topic "${topic}". Stay on THIS topic for the whole chat — every question you ask must be about "${topic}". Do NOT switch to another subject on your own. (If the student clearly starts a different subject, follow them.)`
        : '';
      /* 🎚 기초 단계(A1·A2)에서는 «길이를 늘리는 규칙» 을 끕니다.
         재미있는 사실 한 줄이 붙는 순간 3~5단어 문장은 지킬 수 없습니다 — 실측된 45단어짜리
         A1 답변이 정확히 그 모양이었습니다(칭찬+사실+설명+질문). 약점 단어 끼워 넣기도 같은 이유로
         위 stuCtx 에서 함께 껐습니다. ⛔ 대신 «오늘의 단어» 는 남깁니다 — 그건 학생이 쓰면
         포인트를 받는 퀘스트라, 빼면 기초 학생만 그 퀘스트를 못 깨게 됩니다. */
      const funFactRule = lvSpec.plain ? ''
        : '- Sprinkle in tiny fun facts kids enjoy when it fits — but the fact must be about whatever you are BOTH talking about right now. Never drag in a new subject just to share a fact.\n';
      const system = `You are ${personaMap[persona] || personaMap.friendly}. You chat with a young Korean student at CEFR level ${level}.${stuCtx}${topicCtx}
Rules:
- Your name is ${friendName}. If the student asks your name, say "${friendName}" — never invent a different name.
- LEVEL — this is the MOST IMPORTANT rule. Obey it even if it means dropping something else you wanted to say. ${lvSpec.rule}
- Always finish with exactly ONE short follow-up question so the student answers again. That question is counted inside the sentence limit above.
- When the student writes in English, start with a short cheer like "Nice sentence!" or "Great try!".
- Use 1-2 fun emojis per reply. Kids love them.
- If the student writes Korean, warmly invite them to try English and give one simple example sentence they can copy.
- If you spot a grammar or spelling mistake, add ONE short Korean tip at the very end in exactly this format: (💡 ~가 더 자연스러워요)
- The Korean tip must be written ONLY in Hangul. NEVER use Chinese characters (한자) or Japanese anywhere in your reply.
${funFactRule}- Today's special word is "${wodNow.w}" (Korean: ${wodNow.ko}). Use it naturally sometimes, and cheer loudly if the student uses it.
- NEVER repeat a reply you already gave. Every reply must be new — new words, a new question.
- A short answer is a GOOD answer. "Yes.", "Movies!", "I like it." are complete — just reply happily and keep the chat going. Only ask them to repeat when the message truly breaks off mid-word ("I", "and my"), and NEVER ask twice in a row: if your last reply already asked them to repeat, answer whatever you did understand this time.
- If the student asks you to slow down, repeat, or speak more simply (in English or Korean), FIRST say yes to that request and then do it — use shorter, easier sentences right away. Never ignore the request and carry on with your own topic.
- Never break character. Never say you are an AI. Never use words far above the student's level.`;

      const messages: any[] = [{ role: 'system', content: system }];
      for (const h of history) {
        messages.push({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content });
      }
      /* 🎤/🐢 이번 발화가 '잘린 조각' 이거나 '천천히 해달라'는 부탁이면, 그 사실을 모델에게
         명시적으로 알려준다. 규칙만으로는 모델이 직전 답변을 그대로 복사해 버린다. */
      /* 🔁 두 번 연속 되묻기 금지 — 직전 답이 이미 "다시 말해줄래?" 였으면 이번엔 되묻지 않고
         알아들은 만큼이라도 받아준다. (제보 영상에서 네 턴 내리 되물어 학생이 포기했다.) */
      const cutHint = (aiFriendLooksCut(msg) && !aiFriendJustAskedAgain(history))
        ? ` [The student's message is very short or cut off — do NOT guess and do NOT repeat your last reply. Reply in ONE short line and ask them to say the whole sentence again.]`
        : (aiFriendLooksCut(msg)
          ? ` [You already asked them to repeat last time — do NOT ask again. Warmly answer whatever you did understand and ask ONE easy question.]` : '');
      const metaHint = aiFriendIsMetaAsk(msg)
        ? ` [The student is asking you to slow down / repeat / speak more simply. Say yes to that first, then answer again in much shorter and easier words.]` : '';
      messages.push({ role: 'user', content: msg + cutHint + metaHint });

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
      /* 🔁 직전 답변과 (거의) 같은 말이 또 나오면 1회 재생성 — temperature 를 올리고 명시적으로 지시.
         (웜업 handleWarmupChat 과 동일한 방식. "I" 한 마디에 지난 답이 그대로 나오던 문제) */
      if (reply && usedModel && aiFriendIsRepeat(reply, history)) {
        try {
          const retry: any = await env.AI.run(usedModel, {
            messages: messages.concat([
              { role: 'assistant', content: reply },
              { role: 'user', content: '(You already said that. Say something completely different in new words, and ask a different question. Keep it to 1-2 short sentences.)' },
            ]),
            max_tokens: 220, temperature: 0.95,
          });
          const rt = String((retry && (retry.response || retry.result)) || '').trim();
          if (rt && !aiFriendIsRepeat(rt, history)) reply = rt;
        } catch (e: any) {
          console.error('[chat-friend] repeat retry failed:', e?.message || e);
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
      // 🈚 한자 섞임 정리 — 프롬프트 지시만으로는 모델이 가끔 어겨서, 저장·응답 전에 결정론적으로 거른다.
      reply = aiFriendStripHanzi(reply) || reply;

      /* 🎚 눈높이 강제 (2026-08-31) — 「지시만으로는 안 지켜진다」의 그 자리입니다.
         만든 답을 실제로 세어 보고 ① 넘치면 한 번 더 뽑고 ② 그래도 넘치면 문장 «수» 만 줄입니다.
         ⛔ 문장 «안» 의 단어는 자르지 마세요 — 아이가 그대로 따라 읽는 문장이라 깨진 영어를 배웁니다.
         ⛔ 다시 뽑은 것을 무조건 받지 마세요 — 빈 답이나 더 긴 답으로 바꾸면 고치려던 것이 나빠집니다. */
      const lvBefore = aiFriendMeasureReply(reply, level);
      if (!lvBefore.ok) {
        if (usedModel) {
          try {
            const shorter: any = await env.AI.run(usedModel, {
              messages: messages.concat([
                { role: 'assistant', content: reply },
                { role: 'user', content: aiFriendShortenHint(reply, level) },
              ]),
              max_tokens: 160, temperature: 0.4,
            });
            const st2 = aiFriendStripHanzi(String((shorter && (shorter.response || shorter.result)) || '').trim());
            const m2 = st2 ? aiFriendMeasureReply(st2, level) : null;
            if (st2 && m2 && (m2.ok || (m2.worstWords <= lvBefore.worstWords && m2.sentences <= lvBefore.sentences))) {
              reply = st2;
            }
          } catch (e: any) {
            console.error('[chat-friend] level shorten retry failed:', e?.message || e);
          }
        }
        reply = aiFriendTrimSentences(reply, level) || reply;
        const lvAfter = aiFriendMeasureReply(reply, level);
        if (!lvAfter.ok) {
          // 한 문장이 여전히 길 수 있다(단어는 안 자르므로). 조용히 넘기지 말고 남긴다.
          console.error('[chat-friend] level ' + level + ' still long: '
            + lvAfter.sentences + '/' + lvAfter.maxSentences + ' sentences, worst '
            + lvAfter.worstWords + '/' + lvAfter.maxWordsPerSentence + ' words');
        }
      }

      // ⚠️ 이 저장은 반드시 기다린다 — 바로 아래 gam 스냅샷("오늘 몇 번째 대화")이
      //   이 INSERT 가 끝난 뒤의 개수를 세어야 정확하다. 백그라운드로 미루면 그 숫자가
      //   이번 메시지를 못 세거나(레이스) 다음 새로고침에야 반영돼 부정확해진다.
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
        gam.awarded = 0; gam.word_bonus = 0; gam.voice_bonus = 0; gam.listen_bonus = 0;
        if (!/^guest/i.test(uid)) {
          await ensurePointTables(env);
          const KST_OFF = 9 * 3600 * 1000;
          const todayMs = Math.floor((Date.now() + KST_OFF) / 86400000) * 86400000 - KST_OFF;
          const usedToday = async (code: string) => {
            const c: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM point_rule_log WHERE user_id=? AND rule_code=? AND triggered_at>=?`).bind(uid, code, todayMs).first();
            return c?.c || 0;
          };
          // ⚠️ 적립 자체(logAward)는 잔액을 읽고-쓰는 순서라 같은 유저에 대해 동시 실행하면
          //   레이스로 한쪽 적립이 유실될 수 있다 — 반드시 순서대로. "오늘 이미 썼나" 조회만
          //   서로 무관한 읽기라 한꺼번에 보낸다.
          const logAward = async (code: string, amount: number, label: string) => {
            const r = await applyPointTransaction(env, { userId: uid, type: 'earn', amount, reason: label, ruleCode: code });
            await env.DB.prepare(`INSERT INTO point_rule_log (user_id, rule_code, amount, triggered_at, txn_id, meta) VALUES (?,?,?,?,?,NULL)`).bind(uid, code, amount, Date.now(), r.txnId).run();
          };
          const wod = gam.word;
          const wantWord = !!(wod && new RegExp(`\\b${wod.w}\\b`, 'i').test(msg));
          const wantVoice = String(b.via || '') === 'voice';
          /* 🎧 (2026-08-07) 자막을 가리거나 끈 채로 대화하면 덤 1P.
             듣기 훈련은 «켠 쪽에 벌점» 이 아니라 «끈 쪽에 덤» 이어야 한다 —
             어려워서 자막을 켠 학생이 손해 보는 느낌을 받으면 그 학생부터 그만둔다.
             ⚠️ 화면이 알려주는 값이라 마음먹으면 속일 수 있다. 이미 있는 via:'voice' 와 같은 수준의
                신뢰도이고, 하루 5회로 묶여 있어 최대 5P다. 여기에 더 큰 보상을 걸지 말 것. */
          const wantListen = ['blur', 'off'].includes(String(b.sub || ''));
          const [chatUsed, wordUsed, voiceUsed, listenUsed] = await Promise.all([
            usedToday('ai_friend_chat'),
            wantWord ? usedToday('ai_friend_word') : Promise.resolve(Infinity),
            wantVoice ? usedToday('ai_friend_voice') : Promise.resolve(Infinity),
            wantListen ? usedToday('ai_friend_listen') : Promise.resolve(Infinity),
          ]);
          if (chatUsed < 10) { await logAward('ai_friend_chat', 2, '망고와 영어 수다'); gam.awarded = 2; }
          if (wantWord && wordUsed < 1) { await logAward('ai_friend_word', 5, `오늘의 단어(${wod.w}) 사용`); gam.word_bonus = 5; }
          if (wantVoice && voiceUsed < 5) { await logAward('ai_friend_voice', 1, '영어로 말하기'); gam.voice_bonus = 1; }
          if (wantListen && listenUsed < 5) { await logAward('ai_friend_listen', 1, '자막 없이 듣기'); gam.listen_bonus = 1; }
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
