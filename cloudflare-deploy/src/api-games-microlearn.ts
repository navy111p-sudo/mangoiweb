// 마이크로러닝 단어 생성·퀴즈·발송 API. 단어장과 같은 SRS·쓰기 권한 정본을 사용한다.
import { json } from './api-util';
import { KOREAN_GLOSS_RULE, hasForeignGloss, normalizeKoreanGloss, isKoreanGloss, repairKoreanGlosses } from './korean-vocab';
import type { MangoEnv } from './api-mango';
import { endSentence } from './sentence-punct';
import { isCleanText, vocabSrsNext, vocabWriteDenied } from './api-games-vocab-core';
export async function handleMicrolearnApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
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


  return null;
}
