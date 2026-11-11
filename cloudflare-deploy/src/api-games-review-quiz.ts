// 복습퀴즈 HTTP 처리·문제은행 생성·응시 기록. 기존 라우트 정책을 유지한다.
import { looksGarbledKo } from './ko-readable';
import { json } from './api-util';
import { applyPointTransaction } from './api-points';
import { dailyAllowance } from './point-policy';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { resolveOwnerScope } from './auth-admin';
import { recordJudgmentEvents, guessMisconception } from './api-judgment';
import { ttsShortText } from './tts-short-text';
import type { MangoEnv } from './api-mango';
import { PUNCTUATION_PROMPT_RULE } from './sentence-punct';
import { resolveZhTextbook, zhDisplayTextbook, zhDisplayDesc } from './zh-textbook';
import { filterQuizQuestions, summarizeRejects } from './quiz-quality';
import { BAND_SPECS, bandFromTextbookLevel } from './judgment-level';
import { rqParseQuestions, rqSafeQuestions, rqSafeOne, rqShuffle, rqDrawIndices, rqGrade } from './api-games-review-scoring';

export async function handleReviewQuizApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
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
        /* 🔤 (2026-11-01) AI 가 만든 문항의 한국어가 깨졌으면 — 문제 글이 깨진 문항은 빼고, 해설만 깨졌으면 해설을 비웁니다.
           ⚠️ 이 자리는 «AI 생성» 갈래만입니다(rqParseQuestions 는 선생님이 쓴 문항도 읽으므로 거기엔 안 둡니다). */
        parsed.list = parsed.list.filter((q: any) => !looksGarbledKo(q && q.q));
        for (const q of parsed.list) if (q && looksGarbledKo(q.explain)) q.explain = '';
        if (!parsed.list.length) return { ok: false as const, error: 'ai_invalid_questions' };
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
      /* 🪙 (2026-11-02) 결과 화면이 «왜 이만큼(또는 0)» 인지 말하게 — 계산 그대로 실어 보낸다(지어내지 않음).
         points_full = 한도 전 금액 · points_cap = 'quiz'(복습퀴즈 하루 500) | 'daily'(게임 30·전체 100) | null
         points_dup = 같은 결과로 이미 받음 · points_unknown = 적립 단계가 실패해 모름 */
      let pointsFull = 0, pointsCap: string | null = null, pointsDup = false, pointsUnknown = false;
      try {
        const dayStart = Math.floor((now + 32400000) / 86400000) * 86400000 - 32400000;
        const resultId = (insRes && insRes.meta && insRes.meta.last_row_id) ? insRes.meta.last_row_id : now;
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS review_quiz_rewards (award_id TEXT PRIMARY KEY, user_id TEXT, amount INTEGER, created_at INTEGER);`);
        const prev: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM review_quiz_results WHERE quiz_id = ? AND user_id = ? AND id < ?`).bind(quizId, userId, resultId).first();
        firstClear = (Number(prev?.n) || 0) === 0 && score > 0;
        let amount = score * 10 + (percent === 100 ? 50 : 0) + (firstClear ? 30 : 0);
        pointsFull = amount;
        const used: any = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM review_quiz_rewards WHERE user_id = ? AND created_at >= ?`).bind(userId, dayStart).first();
        amount = Math.max(0, Math.min(amount, 500 - (Number(used?.t) || 0)));
        if (amount < pointsFull) pointsCap = 'quiz';
        const beforeDaily = amount;
      /* 🧢 (2026-09-01 사장님 결정) 하루 총량 100점을 **이 경로도 지난다.**
         그전에는 이 표의 자기 상한(단어장 400 · 복습퀴즈 500)만 걸려서, 정책이 「하루 100점」
         이라고 적혀 있는데 실제로는 열 배가 나가고 있었다(실효 1,050점).
         ⚠️ 막지 않고 «남은 만큼 깎아서» 준다 — 이 경로는 원래부터 그렇게 동작했고,
            한 판을 다 풀고 0점을 받는 쪽이 더 나쁘다.
         ⚠️ 상한 조회가 실패하면 전액을 돌려주므로 «조회 실패로 점수를 잃는» 일은 없다. */
        amount = Math.min(amount, await dailyAllowance(env as any, userId, 'review_quiz_done'));
        if (amount < beforeDaily) pointsCap = 'daily';
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
          } else pointsDup = true;
        }
        const bal: any = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id = ?`).bind(userId).first();
        balance = bal ? Number(bal.balance) : null;
        // 🔥 복습 스트릭 — KST 기준 연속 복습일 (오늘/어제부터 이어진 만큼)
        const days: any = await env.DB.prepare(`SELECT DISTINCT CAST((created_at + 32400000) / 86400000 AS INTEGER) AS d FROM review_quiz_results WHERE user_id = ? ORDER BY d DESC LIMIT 90`).bind(userId).all();
        const ds = (((days.results as any[]) || [])).map((r: any) => Number(r.d));
        const today = Math.floor((now + 32400000) / 86400000);
        if (ds.length && (ds[0] === today || ds[0] === today - 1)) { streak = 1; for (let i = 1; i < ds.length && ds[i] === ds[i - 1] - 1; i++) streak++; }
      } catch { if (!awarded) pointsUnknown = true; }
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

      return json({ ok: true, score, total, percent, detail, awarded, balance, streak, first_clear: firstClear,
        points_full: pointsFull, points_cap: pointsCap, points_dup: pointsDup, points_unknown: pointsUnknown,
        points_guest: /^guest/i.test(userId) });
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
      const isZh = row.lang === 'zh';
      // 🔊 짧은 영어 낱말은 `Study.` 모양으로(정본 ttsShortText) — 중국어는 한 글자도 안 바꾼다
      const text = ttsShortText((q && q.type === 'listen') ? String(q.audio_text || '').trim().slice(0, 300) : '', isZh ? 'zh' : 'en');
      if (!text) return json({ ok: false, error: 'not_a_listen_question' }, 400);
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



  return null;
}
