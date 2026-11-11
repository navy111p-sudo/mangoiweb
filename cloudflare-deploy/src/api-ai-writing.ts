// 영작 첨삭·이력·성장 통계. 판정·포인트·배지는 기존 공용 정본을 사용한다.
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { ensurePointTables, applyPointTransaction } from './api-points';
import { checkEarnAllowed } from './point-policy';
import { checkAndAwardBadges, BADGE_CATALOG } from './api-games';
import { recordJudgmentEvents, guessMisconception } from './api-judgment';
import { triageIssues, isReadableKo, isEnglishReply } from './write-issue-triage';
import { markVocabTag, VOCAB_TAG_AWKWARD } from './vocab-tags';
import { handleStoryApi } from './story-correct';
import { recordAiFailure } from './ai-failure-log';
import { parseLlmJson } from './llm-json';
import { isRfRejection } from './warmup-correction';
import type { MangoEnv } from './api-mango';

/* 🧩 AI 답 길이 상한 — 2000자 글이면 수정본 ~600 + 고칠 곳(한국어 이유) ~600 + 표현·답장 ~700 토큰.
   옛 1500 은 긴 글에서 답이 잘려 «못 읽음» 이 됐다(잘림 = 닫는 } 없음). 값은 실제로 쓴 만큼만 과금된다. */
const WRITE_MAX_TOKENS = 3000;
let _awTopicColTried = false;   // 📅 topic_id 지연 ALTER — 워커당 한 번
export async function handleWritingApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
    // ═══════════════════════════════════════════════════════════════
    // ✍️ Phase AW — AI 영작 첨삭 (Grammarly + GPT)
    // ═══════════════════════════════════════════════════════════════
    const ensureWriteSchema = async () => {
      // D1 의 exec() 는 멀티라인 SQL 미지원 — 반드시 한 줄로
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS ai_writing_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, original_text TEXT NOT NULL, corrected_text TEXT, feedback TEXT, level TEXT, score INTEGER, created_at INTEGER NOT NULL);`);
      // 📅 (2026-10-26 제안 6) 어느 주제(선생님 숙제·내 주제)로 쓴 글인가 — 지연 ALTER, 한 워커에 한 번만 시도
      if (!_awTopicColTried) {
        _awTopicColTried = true;
        try { await env.DB.exec(`ALTER TABLE ai_writing_corrections ADD COLUMN topic_id INTEGER`); }
        catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) _awTopicColTried = false; }   // 일시 장애면 다음 요청에서 다시 시도
        try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_awc_topic ON ai_writing_corrections(topic_id)`); } catch { /* 칸이 없으면 실패 — 무해 */ }
      }
    };

    if (method === 'POST' && path === '/api/ai/write-correct') {
      await ensureWriteSchema();
      const b: any = await request.json().catch(() => ({}));
      const text = String(b.text || '').trim();
      const level = String(b.level || 'A2').trim();
      const uid = String(b.uid || '').trim();
      if (!text || text.length < 3) return json({ ok: false, error: 'text_too_short' }, 400);
      if (text.length > 2000) return json({ ok: false, error: 'text_too_long' }, 400);

      // ⚠️ 학생 글을 """…""" 로 감싸 보내면 모델이 답에도 """ 를 따라 써서 JSON 이 깨졌다(운영 6/8건) — 끝에 JSON 문자열로 보낸다
      const prompt = `You are Mango, a friendly English writing tutor for a Korean student at CEFR level ${level}. The student wrote the following text. Your job:
1. Provide a corrected version (preserve student's meaning). Fix ALL the problems you list in "issues" (both "error" and "unnatural" items) and ONLY those; keep every other word exactly as the student wrote it.
2. Provide a numeric score 0-100 for overall quality.
3. List ONLY real problems (0-5 items — an EMPTY list is correct when the writing has no problems). Each item: original phrase (copied EXACTLY from the student's text), suggested phrase, category, and a REQUIRED brief reason IN KOREAN (one short, simple, grammatical Korean sentence ending in "~요." that explains WHY, e.g. tense, article, preposition, word order). Never leave "reason" empty. If you cannot write natural Korean, write the reason in simple English instead.
   - category "error": grammar, spelling, or a wrong word.
   - category "unnatural": grammatical, but a native speaker would clearly not say it this way (often a word-for-word translation from Korean). These MUST be corrected too, not just mentioned: "suggested" is the ONE most common native expression closest to the student's meaning and tone. Example: "My condition is not good today." -> "I'm not feeling well today." (reason: "condition" usually means a medical state; natives say "I'm not feeling well.").
     Optional "alternatives" (0-3 items, unnatural only): OTHER natural ways a native speaker would say the same thing, if any exist (e.g. for "I'm happy": "I feel great", "I'm so glad"). Each item: {"text":"<English only>","when":"<short Korean note on nuance or when to use it, e.g. 친구와 가볍게 말할 때>"}. Do not repeat "suggested" or list near-identical copies; use an empty list if there are none. Choose only the MOST suitable ones: the best fit for the student's meaning and ${level} level, ordered from most common/natural to less common.
   - Do NOT list phrasing that is already correct and natural just because another way exists. Examples to leave alone: "When the water boils" (do not change to "Once the water has boiled"); "I'll teach you how to make it" (do not change "teach" to "show").
   - Never list an item whose suggested phrase is the same as the original.
4. Provide one encouraging tip in natural Korean (1-2 short sentences ending in "~요.").
5. Reply to the CONTENT of the student's writing like a pen-pal friend, in ENGLISH ONLY appropriate for ${level} level (1-2 short sentences, warm, may end with a small question). Never write Korean in "reply".
6. Suggest 1-3 vocabulary upgrades: pick a plain word or phrase the student ACTUALLY WROTE and offer a more natural / more advanced English word for CEFR ${level} (e.g. "thing you own" -> "property", "bad guy who steals" -> "thief"). "from" MUST appear in the student's text exactly. "why" is REQUIRED and must be a short Korean sentence saying WHY the new word is better (nuance, register, precision) — an item with an empty "why" is DISCARDED, so never leave it blank. If nothing is worth upgrading, use an empty list.

Respond with ONE valid JSON object only, no markdown. Inside JSON strings write line breaks as \\n — never use triple quotes ("""):
{
  "corrected": "...",
  "score": 85,
  "issues": [{"original":"...","suggested":"...","category":"error","reason":"..."},{"original":"...","suggested":"...","category":"unnatural","reason":"...","alternatives":[{"text":"...","when":"..."}]}],
  "tip": "...",
  "reply": "...",
  "upgrades": [{"from":"...","to":"...","why":"..."}]
}

Student text (as a JSON string): ${JSON.stringify(text)}`;

      if (!env.AI) {
        return json({ ok: false, error: 'AI_binding_missing' }, 503);
      }

      const models = [
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3.1-8b-instruct',
        '@cf/meta/llama-3-8b-instruct',
      ];
      let parsed: any = null;
      let lastErr: any = null;
      let unreadable = 0, empty = 0;
      /* 🧩 JSON 모드(response_format) — 모델이 «올바른 JSON» 만 내게 한다(같은 모델로 웜업·일기·결재·마케팅이 이미 씀).
         거부하는 모델(옛 8b)이면 그 모델만 끄고 한 번 더. ⛔ 429·5xx·시간초과는 «제약 탓» 이 아니다 — 판정 정본 isRfRejection(CLAUDE.md). */
      const runModel = async (m: string): Promise<any> => {
        const opts: any = { messages: [{ role: 'user', content: prompt }], max_tokens: WRITE_MAX_TOKENS, temperature: 0.3, response_format: { type: 'json_object' } };
        try { return await env.AI.run(m, opts); }
        catch (e: any) {
          if (!isRfRejection(e)) throw e;
          console.warn(`[write-correct] model ${m} rejected response_format, retrying without:`, e?.message || e);
          delete opts.response_format;
          return await env.AI.run(m, opts);
        }
      };
      // 🧩 «읽을 수 있는 답(corrected 있음)» 이 나올 때까지 다음 모델로 — 글자만 왔다고 멈추면 못 읽는 답이 그대로 나간다(2026-11-11)
      for (const m of models) {
        try {
          const resp: any = await runModel(m);
          // JSON 모드면 response 가 «이미 객체» 일 수 있다 — String() 하면 "[object Object]"(CLAUDE.md 2026-09-08 실사고)
          const body = resp?.response ?? resp?.result?.response ?? resp?.result ?? resp;
          if (body == null || (typeof body === 'string' && !body.trim())) { empty++; continue; }
          parsed = parseLlmJson(body);
          if (parsed && String(parsed.corrected || '').trim()) break;
          parsed = null; unreadable++;
          // ⛔ 답 내용은 로그에 안 남긴다 — 수정본 = 학생 글(이름·학교가 들어갈 수 있음, AGENTS.md «개인정보 로그 금지»)
          console.warn(`[write-correct] model ${m} reply unreadable: type=${typeof body} len=${typeof body === 'string' ? body.length : JSON.stringify(body)?.length ?? 0}`);
        } catch (e: any) {
          lastErr = e;
          console.error(`[write-correct] model ${m} failed:`, e?.message || e);
        }
      }

      /* ⛔ [2026-11-11 엘리더잼 원장님 피드백] 못 읽었으면 «원문 = 수정본 · 75점» 으로 지어내지 않고 솔직히 실패로 돌려준다.
         (그 가짜 결과에 포인트까지 적립되고 기록에도 «고칠 곳 없음» 으로 남았다 — 운영 45건 중 8건) */
      if (!parsed) {
        try {
          await recordAiFailure(env, { feature: 'write-correct', models: models.join(','), err: String(lastErr?.message || lastErr || 'unreadable_json'), rf: 1, plain: unreadable, empty, level });
        } catch (e: any) { console.error('[write-correct] recordAiFailure failed:', e?.message || e); }
        return json({ ok: false, error: 'ai_unreadable', detail: 'AI 답을 읽지 못했어요. 한 번 더 «AI 첨삭 받기» 를 눌러 주세요.\nCould not read the AI reply. Please press «Get AI Correction» again.' }, 502);
      }

      // 모델이 원문을 그대로 돌려줬을 때 — 첫 글자 대문자·마침표만 다듬는다
      let corrected = String(parsed.corrected || '').trim();
      if (!corrected || corrected === text) {
        // 기본 폴백: 첫 글자 대문자화 + 마침표 추가
        corrected = text.charAt(0).toUpperCase() + text.slice(1);
        if (!/[.!?]$/.test(corrected.trim())) corrected = corrected.trim() + '.';
      }
      // 모델이 점수를 "high"·85.5 로 줄 때도 0~100 정수로(그전엔 NaN → 화면 «null점»). 0·없음은 예전처럼 75.
      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score)) || 75));
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
      /* 🚦 [2026-11-01 엘리더잼 원장님 피드백] 맞게 쓴 표현까지 «고칠 곳» 으로 띄우던 것을 막습니다.
         정본은 `src/write-issue-triage.ts` — 원문과 같은 수정안·학생이 안 쓴 말은 버리고,
         🔴 오류만 issues(빨간 줄)로, 🟡 «문법은 맞지만 원어민이 안 쓰는 표현» 은 suggestions 로 가릅니다.
         ✏️ [2026-11-02 사장님 결정] 🟡 는 «참고» 가 아니라 «원어민 표현으로 고쳐 주기» 입니다 — corrected 에도 반영되고,
            대표 표현 1개 + 말투·상황이 다른 표현 최대 2개(alternatives, «언제 쓰는지» 와 함께)를 보냅니다.
         ⚠️ issues 는 아래에서 단어장 저장·판단력 오답 기록에 쓰입니다 — 단어장에는 🟡 도 넣고(2026-11-02), 판단력 오답 기록에는 🟡 를 넣지 않습니다
            (맞게 쓴 표현을 오답으로 기록하면 원장님이 지적한 그 일이 기록에서 되풀이됩니다). */
      const _tri = triageIssues(text, parsed.issues);
      const issues = _tri.issues.map(({ original, suggested, reason }) => ({ original, suggested, reason }));
      const suggestions = _tri.suggestions.map(({ original, suggested, reason, alternatives }) => ({ original, suggested, reason, alternatives: alternatives || [] }));
      if (_tri.dropped.length) console.log('[write-correct] triage dropped:', JSON.stringify(_tri.dropped.map(d => d.why)));
      /* 🔤 [2026-11-01 실사고] 한국어에 약한 보조 모델이 «낱말 조각» 을 늘어놓은 글(「지도 알는 어 지도 었다…」)이
         그대로 학생 화면에 나갔습니다. 읽을 수 있는 한국어가 아니면 기본 문구로 바꿉니다(정본 isReadableKo). */
      const _tipRaw = String(parsed.tip || '').trim().slice(0, 300);
      const tip = isReadableKo(_tipRaw) ? _tipRaw : '꾸준히 영작 연습을 이어가세요! 매일 한 문장씩만 써도 한 달이면 30문장입니다.';
      // 💬 망고 선생님의 답장 — 첨삭을 '검사'가 아니라 '대화'로 만드는 펜팔 답장
      // 💬 답장은 «영어로만» — 한글이 섞이면(깨진 한국어가 이 칸에 온 실사고) 답장을 아예 안 보입니다.
      const _replyRaw = String(parsed.reply || '').trim().slice(0, 400);
      const reply = isEnglishReply(_replyRaw) ? _replyRaw : '';
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
          isReadableKo(u.why) &&   // 깨진 한국어(「지도 알는 어 지도 었다…」)는 버림 — 2026-11-01 실사고
          _lowText.includes(u.from.toLowerCase()))
        .slice(0, 3);

      // 📚 미션 단어 검증 — 클라이언트가 보낸 미션 단어 중 실제 글에 쓰인 단어를 서버가 판정
      //   (보너스 포인트 지급 근거이므로 클라이언트 자가신고를 믿지 않고 서버가 단어경계로 확인)
      const missionWords: string[] = Array.isArray(b.mission_words)
        ? b.mission_words.slice(0, 5).map((w: any) => String(w || '').trim()).filter((w: string) => /^[a-zA-Z' -]{1,30}$/.test(w))
        : [];
      const missionUsed = missionWords.filter(w =>
        // 복수형(-s/-es)도 «썼다» 로 센다 — 그림 속 미션 단어는 단수로 주는데 아이들은 «candles» 로 쓴다(2026-10-08)
        new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s|es)?\\b`, 'i').test(text));

      const meta = { parsed: true };

      // 📅 어느 주제로 쓴 글인가(숙제 제출 확인용) — 양의 정수만. 화면이 보낸 번호라 «제출» 의 근거일 뿐 권한·포인트에는 안 쓴다.
      const _tid = Number(b.topic_id);
      const topicId = Number.isInteger(_tid) && _tid > 0 && _tid < 1e9 ? _tid : null;
      let topicRecorded = false;   // 📅 «그 주제로 냈다» 가 정말 적혔는가 — 화면은 이것이 true 일 때만 ✓ 를 그린다
      try {
        const now = Date.now();
        const fb = JSON.stringify({ issues, suggestions, tip, reply, upgrades, mission_words: missionWords, mission_used: missionUsed, meta });
        try {
          await env.DB.prepare(
            `INSERT INTO ai_writing_corrections (student_uid, original_text, corrected_text, feedback, level, score, created_at, topic_id) VALUES (?,?,?,?,?,?,?,?)`
          ).bind(uid || null, text, corrected, fb, level, score, now, topicId).run();
          topicRecorded = topicId !== null && !!uid;
        } catch (e1: any) {
          // ⚠️ topic_id 칸이 아직 없으면(ALTER 실패) 그 칸 없이라도 남긴다 — 첨삭 기록이 통째로 사라지지 않게
          console.warn('[write-correct] insert with topic_id failed, retry without:', e1?.message || e1);
          await env.DB.prepare(
            `INSERT INTO ai_writing_corrections (student_uid, original_text, corrected_text, feedback, level, score, created_at) VALUES (?,?,?,?,?,?,?)`
          ).bind(uid || null, text, corrected, fb, level, score, now).run();
        }
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
      // 🪙 결과 화면이 «왜 포인트가 없는지» 를 말할 수 있게 — 로그인 안 한(또는 남의 아이디) 첨삭은 적립 대상이 아니다(2026-11-02)
      const pointsGuest = !(awAuthUid && awAuthUid === uid && !uid.startsWith('guest_'));
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
            /* 🪙 (2026-09-01) 하루 전체 상한(100점)·게임묶음 상한(30점)도 함께 본다.
               정본은 checkEarnAllowed 하나이고, 그 전에는 이 경로가 통째로 건너뛰고 있었다. */
            const allow = await checkEarnAllowed(env, uid, code, Number(rule.amount) || 0);
            if (!allow.ok) return { capped: true, cap: allow.cap, used: allow.used };
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
          // 🔴 오류 먼저, 그다음 🟡 어색한 표현(원어민 표현으로 고친 것)도 단어장에 — 2026-11-02 사장님 지시.
          //    ⚠️ 판단력 오답 기록(jList)은 그대로 «오류만» 입니다 — 🟡 는 틀린 것이 아니라서.
          const vocabCands = [...issues.slice(0, 6).map((iss: any) => ({ iss, awkward: false })), ...suggestions.slice(0, 6).map((iss: any) => ({ iss, awkward: true }))];
          for (const { iss, awkward } of vocabCands) {
            if (vocabSaved.length >= 3) break;
            const sug = String(iss?.suggested || '').trim();
            const reason = String(iss?.reason || '').trim().slice(0, 80);
            if (!sug || sug.length > 40 || !/[a-zA-Z]/.test(sug)) continue;
            const dup: any = await env.DB.prepare(`SELECT id FROM vocabulary WHERE user_id=? AND LOWER(word)=LOWER(?) LIMIT 1`).bind(uid, sug).first();
            if (dup) continue;
            const vIns: any = await env.DB.prepare(`INSERT INTO vocabulary (user_id, word, korean, example, level, next_review_at, created_at) VALUES (?,?,?,?,0,?,?)`)
              .bind(uid, sug, reason || '영작 첨삭에서 배운 표현', corrected.slice(0, 120), nowV, nowV).run();
            // 🏷️ 🟡 어색한 표현이면 단어장 화면이 따로 표시하도록 꼬리표(던지지 않음 — 실패해도 카드는 저장됨)
            if (awkward) await markVocabTag(env.DB, Number(vIns?.meta?.last_row_id), uid, VOCAB_TAG_AWKWARD);
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

      return json({
        ok: true,
        corrected, score, issues, suggestions, tip, reply, upgrades, level,
        mission_words: missionWords, mission_used: missionUsed,
        points: pointsEarned, mission_bonus: missionBonus, streak_bonus: streakBonus, points_guest: pointsGuest,
        earned_badges: earnedBadges, vocab_saved: vocabSaved,
        topic_recorded: topicRecorded,
      });
    }

    // 📖 동화책 «바꿔 쓰기» — 이미 등록된 경로의 «비어 있는 POST» 에 얹습니다(src/index.ts 무수정).
    //    action 이 story_fix·story_log 가 아니면 story-correct.ts 가 400 으로 거절합니다. 판정·상한은 전부 그 파일 정본.
    if (method === 'POST' && path === '/api/ai/write-history') {
      return handleStoryApi(request, env, { json, authUid: (b: any) => authUidGlobal(request, url, env, b), recordFailure: (f: any) => recordAiFailure(env, f) });
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
      /* ⚠️ 게스트 패턴은 `guest%` 다 — `guest_%` 로 좁히면 «밑줄 없는» bare `guest` 가 샙니다.
         그 값은 실제로 화면이 만듭니다(js/game-track.js·js/idx-daily-checkin.js 의 기본값,
         js/idx-x8.js 의 폴백)이고 auth-admin.ts 의 resolveOwnerScope 도 `/^guest/i` 로 봅니다.
         2026-09-05 D1 실측으로는 이 표에 아직 0건이지만, 같은 날 «맛보기»(로그인 없이 하루)를
         열어 게스트 유입이 늘므로 지금 넓혀 둡니다. */
      await ensureWriteSchema();
      const KST_OFF = 32400000;
      const todayD = Math.floor((Date.now() + KST_OFF) / 86400000);
      const weekStartMs = (todayD - ((todayD + 3) % 7)) * 86400000 - KST_OFF;
      const rs = await env.DB.prepare(
        `SELECT student_uid, COUNT(*) AS n, ROUND(AVG(score)) AS avg_score FROM ai_writing_corrections
         WHERE created_at >= ? AND student_uid IS NOT NULL AND student_uid != '' AND LOWER(student_uid) NOT LIKE 'guest%'
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
               WHERE created_at >= ? AND student_uid IS NOT NULL AND student_uid != '' AND LOWER(student_uid) NOT LIKE 'guest%'
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

  return null;
}
