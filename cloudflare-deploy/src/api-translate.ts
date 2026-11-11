/** Translation routes, extracted without changing prompts, cache keys or fallbacks.
 * The caller keeps the shared API error boundary and route ordering.
 */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';
import { looksGarbledKo } from './ko-readable';   // 🔤 학부모 번역 깨진 한국어 거르기(2026-11-01)
import { hasForeignGloss, KOREAN_GLOSS_RULE } from './korean-vocab';
import { peelLearnLead, joinLearnLead, curatedLearnMeaning, LEARN_GLOSS_HINT } from './learn-phrase-ko';  // 🗣️ 「뜻 보기」 칭찬 상투구 한국어 정본 (Good job! ≠ 훌륭한 직업)
import { isUsableKoMeaning, stripJamoRuns } from './learn-meaning-check';  // 🧹 «뜻» 카드에 'ㅋㅋㅋㅋ' 가 나가지 않게(2026-10-02)

export async function handleTranslateApi(
  request: Request,
  url: URL,
  env: MangoEnv,
  ctx?: ExecutionContext
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // ═══════════════════════════════════════════════════════════════
  // 🌐 i18n 자동번역 — 사전(DICT)에 없는 한국어 UI 텍스트를 AI로 ko→en 번역 (+KV 캐시)
  //   클라이언트(i18n-sweep.js)가 미번역 한국어를 모아 배치 호출 → localStorage 캐시.
  // ═══════════════════════════════════════════════════════════════
  if (method === 'POST' && path === '/api/i18n/translate') {
    const b: any = await request.json().catch(() => ({}));
    let texts: string[] = Array.isArray(b.texts) ? b.texts.map((t: any) => String(t || '')).filter((t: string) => t.trim()) : [];
    texts = Array.from(new Set(texts)).slice(0, 50);
    if (!texts.length) return json({ ok: true, map: {} });
    const ai = (env as any).AI;
    const kv = (env as any).SESSION_STATE;
    const map: Record<string, string> = {};
    const need: string[] = [];
    // ⚡ (2026-08-08) KV 조회를 순차 await 로 돌던 것을 병렬로 — 50개면 왕복이 50번 쌓여
    //   전부 캐시 적중이어도 1.5초 넘게 걸렸다(강사 제보: "EN 누르면 한참 기다린다").
    const cachedList = await Promise.all(texts.map(async (t) => {
      if (!kv) return null;
      try { return await kv.get('i18n:en:' + t) as string | null; } catch { return null; }
    }));
    for (let i = 0; i < texts.length; i++) {
      if (cachedList[i] != null) map[texts[i]] = cachedList[i] as string; else need.push(texts[i]);
    }
    const kvPuts: Promise<any>[] = [];
    if (need.length && ai) {
      // ⚡ (2026-08-08) 20개씩 끊은 청크를 순차로 돌던 것을 병렬로 — 50개 요청 하나가
      //   AI 왕복 3번을 줄줄이 기다려 실측 16.2초였다. 병렬이면 가장 느린 1번으로 줄어든다.
      const aiChunks: string[][] = [];
      for (let i = 0; i < need.length; i += 20) aiChunks.push(need.slice(i, i + 20));
      await Promise.all(aiChunks.map(async (chunk) => {
        // ⚠️ llama 는 "JSON 배열로만" 지시를 자주 무시 → 번호 줄 형식이 훨씬 안정적.
        //    (JSON 파싱 실패 시 원문을 그대로 돌려줘 자동번역이 통째로 무력화되던 버그 수정 2026-07-21)
        const numbered = chunk.map((s, k) => (k + 1) + '. ' + s).join('\n');
        const prompt = `Translate each numbered Korean app-UI string into natural, concise English for a button/menu/label.
Keep emojis, numbers, punctuation and placeholders (\${...}, {x}, %s) unchanged.
Output EXACTLY one line per item, same order, formatted as:
1. <english>
2. <english>
No quotes, no notes, no blank lines, no Korean.

${numbered}`;
        let got: string[] = [];
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content: 'You are a precise Korean-to-English UI translator. Reply with numbered lines only, never Korean.' },
                { role: 'user', content: prompt }
              ],
              max_tokens: 1800,
            });
            const txt = String(typeof resp === 'string' ? resp : (resp && typeof resp.response === 'string' ? resp.response : '') || '');
            const clean = txt.replace(/```[a-zA-Z]*|```/g, '');
            const tmp: string[] = [];
            for (const ln of clean.split(/\r?\n/)) {
              const lm = ln.match(/^\s*(\d{1,2})\s*[.)]\s*(.+?)\s*$/);
              if (!lm) continue;
              const idx = parseInt(lm[1], 10) - 1;
              if (idx >= 0 && idx < chunk.length) tmp[idx] = lm[2].replace(/^["']|["']$/g, '');
            }
            // 혹시 JSON 배열로 왔으면 그것도 받아줌(이중 파서)
            if (!tmp.filter(Boolean).length) {
              const mm = clean.match(/\[[\s\S]*\]/);
              if (mm) { try { const arr = JSON.parse(mm[0]); if (Array.isArray(arr)) arr.forEach((v: any, k: number) => { if (typeof v === 'string') tmp[k] = v; }); } catch { /* 무시 */ } }
            }
            if (tmp.filter(Boolean).length > got.filter(Boolean).length) got = tmp;
            if (got.filter(Boolean).length >= chunk.length) break;   // 다 받았으면 재시도 불필요
          } catch { /* 다음 시도 */ }
        }
        for (let j = 0; j < chunk.length; j++) {
          let en = (typeof got[j] === 'string' && got[j].trim()) ? got[j].trim() : '';
          if (!en || /[가-힣]/.test(en)) en = chunk[j];   // 번역 실패(빈값·한글 잔존) → 원문 유지, 캐시 안 함
          map[chunk[j]] = en;
          // ⚡ 캐시 쓰기는 응답을 붙잡지 않는다 — 아래 waitUntil 로 넘긴다.
          if (kv && en !== chunk[j]) kvPuts.push(kv.put('i18n:en:' + chunk[j], en, { expirationTtl: 60 * 60 * 24 * 180 }).catch(() => {}));
        }
      }));
    } else if (need.length) { for (const c of need) map[c] = c; }
    if (kvPuts.length) {
      const allPuts = Promise.all(kvPuts).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(allPuts); else await allPuts;
    }
    return json({ ok: true, map });
  }

  // ── POST /api/translate — 양방향 번역 (평가 글·건의사항 등 실제 콘텐츠) ──
  //   body: { texts: string[], target: 'en'|'ko'|'zh' } → { map: { 원문: 번역 } }
  //   이미 목표 언어면 그대로 통과, 아니면 Workers AI 번역 + KV 캐시(방향별)
  //   🌐 (2026-07-29) 'zh' 추가 — 화상수업 채팅 번역(한↔영·한↔중). 기존 en/ko 동작은 그대로.
  if (method === 'POST' && path === '/api/translate') {
    const b: any = await request.json().catch(() => ({}));
    const target = (b.target === 'ko') ? 'ko' : (b.target === 'zh') ? 'zh' : 'en';
    // 💬 (2026-07-29) mode='chat' — 화상수업 채팅 전용. 번역모델(m2m100) 대신 언어모델을 쓴다.
    //   m2m100 은 짧은 구어체 한국어에 약해 실측에서 '숙제'를 job·집안일로 옮겼다(수업 대화에선 오해가 난다).
    //   언어모델엔 '온라인 영어수업 채팅'이라는 맥락을 줄 수 있어 훨씬 정확하다.
    //   ⚠️ 새 경로를 만들지 않고 이 엔드포인트에 모드만 더한 이유: index.ts 게이트가
    //      path === '/api/translate' **정확 일치**라, 새 경로는 등록 없이는 404 가 된다.
    const chatMode = b.mode === 'chat';
    // 🗣️ (2026-08-24) mode='learn' — 학생 화면의 «뜻 보기» 전용(웜업·AI친구·음성코치·게임). AI 튜터의 영어 문장을
    //   학생이 이해하도록 한국어로 «의역» 한다. 모드 없는 기본 경로(m2m100)가
    //   "Let's warm up before class" 를 「수업 전에 따뜻하게하자」로 직역한 제보가 출발점.
    //   대상 언어가 ko 가 아니면 결과 검증(hasHangul)에서 걸러져 m2m100 으로 넘어간다.
    //   🔴 (2026-08-31) 「Good job!」 → 「훌륭한 직업!」 제보 — 뿌리가 둘이었다.
    //      ① ai-friend.html 이 이 모드를 «안 쓰고» 있었다(웜업만 고쳐져 있었다) → 화면 쪽 수리.
    //      ② 모드를 켜도 확률이라, 말머리 칭찬 상투구는 src/learn-phrase-ko.ts 로 «결정론» 처리한다.
    const learnMode = b.mode === 'learn';

    /* ═══════════════════════════════════════════════════════════════════════
       📝 mode='note' — 수업 일지 전용 (2026-08-10)

       필리핀 강사가 **영어로 편하게 쓰면** 한 번의 호출로 둘을 받는다.
         ① en — 문법·표현을 다듬은 영어 (강사가 «내가 무엇을 승인하는지» 확인용)
         ② ko — 학부모에게 나가는 한국어

       ⛔ mode='chat' 을 그대로 쓰면 안 되는 이유(실제 코드에서 확인):
          · 응답에서 **첫 줄만** 취한다(아래 chatTranslate 의 `split(/\r?\n/)[0]`)
            → 세 문장짜리 일지가 한 문장이 되어 학부모에게 간다.
          · max_tokens 300 — 일지 길이에 모자란다.
          · KV 캐시가 원문 전체를 키로 180일 저장 — 일지는 매번 다른 문장이라
            재사용률이 0 인데 KV 만 쌓인다. → 이 모드는 **캐시하지 않는다**.

       🔒 학생 실명은 {{STUDENT}} 로 가려서 보내고 돌아오면 되돌린다
          (번역 API 로 학생 실명이 새던 전례가 있다).
       🔴 한국어가 안 나오면 ok:false 를 준다 — 화면이 **발송을 막아야** 한다.
          (아래 일반 경로의 m2m100 폴백은 실패 시 «원문 그대로» 를 돌려주므로,
           그 경로를 타면 학부모에게 영어가 나간다.)
       ═══════════════════════════════════════════════════════════════════════ */
    if (b.mode === 'note') {
      const raw = String(b.text || '').trim().slice(0, 2000);
      if (!raw) return json({ ok: false, error: 'empty_text' }, 400);
      const ai0 = (env as any).AI;
      if (!ai0) return json({ ok: false, error: 'ai_unavailable' }, 503);

      const stuName = String(b.student_name || '').trim();
      const MASK = '{{STUDENT}}';
      const masked = stuName ? raw.split(stuName).join(MASK) : raw;

      const sys = 'You help a Filipino English teacher write a short after-class note for the KOREAN PARENT of a child. '
        + 'You do two things at once: (1) rewrite the teacher\'s English so it is correct and natural, '
        + '(2) translate that into Korean for the parent. '
        + 'Keep every fact the teacher wrote. Never invent skills, topics, scores or quotes that are not there. '
        + 'Keep it to 2-4 short sentences. Do not add greetings or sign-offs. '
        + `Keep the placeholder ${MASK} exactly as it is if it appears. `
        // 학부모가 읽는 글이다 — 존댓말과 어투는 타협하지 않는다(chat 모드와 같은 규칙).
        + 'The Korean MUST use polite speech (합니다체 or 해요체). Never 반말. '
        + 'Write natural Korean: 합니다 / 해요 / 좋겠습니다. Never stack endings (합니다요 is not Korean). '
        + 'In a school context "숙제" is school homework, never housework or a job. '
        // 학부모에게 통보처럼 읽히면 안 된다.
        + 'Soften blunt or judgemental wording into what the child did and what will help next '
        + '(e.g. "he is lazy" becomes "found it hard to stay focused"). Never compare the child with other students. '
        + 'Reply with STRICT JSON only: {"en":"<polished English>","ko":"<Korean for the parent>"}';

      let outEn = '', outKo = '';
      const dbgNote: any = { raw: null, err: null, fallback: false };
      try {
        const resp: any = await ai0.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: sys },
            // 🪤 JSON 지시를 system 에만 두면 모델이 설명문을 붙여 내보낸다(실측).
            //    user 쪽에도 한 번 더 못 박아야 «{...}» 만 나온다.
            { role: 'user', content: `Teacher's note:\n${masked}\n\nReturn ONLY this JSON, nothing else:\n{"en":"...","ko":"..."}` },
          ],
          max_tokens: 700,
        });
        const text = typeof resp === 'string' ? resp : (typeof resp?.response === 'string' ? resp.response : '');
        dbgNote.raw = String(text || '').slice(0, 500);
        const m = String(text || '').match(/\{[\s\S]*\}/);
        if (m) {
          try { const j = JSON.parse(m[0]); outEn = String(j.en || '').trim(); outKo = String(j.ko || '').trim(); }
          catch (pe: any) { dbgNote.err = 'parse:' + String(pe?.message || pe).slice(0, 80); }
        }
      } catch (e: any) {
        dbgNote.err = 'ai:' + String(e?.message || e).slice(0, 120);
        console.warn('[translate:note] ai err:', e?.message);
      }

      /* 🛟 폴백 — JSON 이 깨졌거나 한국어가 비면 «번역만» 한 번 더 시킨다.
         한 문장짜리 지시라 모델이 훨씬 안정적이다(chat 모드가 이미 이 방식으로 돌고 있다).
         강사를 두 번 기다리게 하지 않으려고 **실패했을 때만** 탄다. */
      if (!/[가-힣]/.test(outKo)) {
        dbgNote.fallback = true;
        try {
          const base = outEn || masked;
          const r2: any = await ai0.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content:
                  'You translate a teacher\'s after-class note into Korean for the child\'s parent. '
                + 'Reply with ONLY the Korean sentences — no quotes, no notes, no English. '
                + 'Always polite Korean (합니다체 or 해요체), never 반말. Keep it to 2-4 short sentences. '
                + 'In a school context "숙제" is school homework. '
                + `Keep the placeholder ${MASK} exactly as it is if it appears.` },
              { role: 'user', content: base },
            ],
            max_tokens: 500,
          });
          const t2 = typeof r2 === 'string' ? r2 : (typeof r2?.response === 'string' ? r2.response : '');
          let ko2 = String(t2 || '').trim().replace(/^```[a-zA-Z]*\s*|\s*```$/g, '').trim();
          ko2 = ko2.replace(/^(translation|번역|korean)\s*[:：]\s*/i, '').trim();
          if (ko2.length > 1 && /^["'“”「『]/.test(ko2) && /["'“”」』]$/.test(ko2)) ko2 = ko2.slice(1, -1).trim();
          if (/[가-힣]/.test(ko2)) outKo = ko2;
        } catch (e: any) { dbgNote.err = (dbgNote.err || '') + ' fb:' + String(e?.message || e).slice(0, 80); }
      }

      // 어미 중첩 교정 — 존댓말을 시키면 모델이 -습니다 뒤에 「요」를 한 번 더 붙인다(chat 모드와 같은 처리)
      outKo = outKo
        .replace(/(습니다|합니다|입니다|ㅂ니다)요(?=[\s.!?,]|$)/g, '$1')
        .replace(/(습니까|합니까|입니까|니까)요(?=[\s.!?,]|$)/g, '$1')
        .replace(/(이에요|예요|어요|아요|해요|세요)요(?=[\s.!?,]|$)/g, '$1');

      // 가림막 복원
      if (stuName) { outEn = outEn.split(MASK).join(stuName); outKo = outKo.split(MASK).join(stuName); }

      const noteDebug = url.searchParams.get('debug') === '1';
      // 🔤 깨진 한국어(2026-11-01 영작 첨삭 실사고와 같은 모양)는 «못 만들었다» 로 — 학부모에게 그대로 나가지 않게.
      const hasKo = /[가-힣]/.test(outKo) && !looksGarbledKo(outKo);
      if (!hasKo) {
        return json({ ok: false, error: 'no_korean', message: '한국어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
                      ...(noteDebug ? { _debug: dbgNote } : {}) }, 502);
      }
      if (!outEn) outEn = raw;   // 영어 다듬기만 실패하면 원문을 그대로 보여 준다(발송은 한국어로 나가므로 무해)
      return json({ ok: true, en: outEn, ko: outKo, ...(noteDebug ? { _debug: dbgNote } : {}) });
    }

    /* 🚩 mode='learn_report' — 학생이 «뜻이 이상해요» 를 눌렀을 때 그 문장·뜻을 적어 둔다(2026-10-02 피드백 1번).
       ⚠️ 새 경로를 안 만든 이유는 위 chat 모드와 같다(index.ts 허용목록이 정확일치).
       ⚠️ 무인증 공개 경로라 «적기만» 한다 — 캐시를 지우거나 번역을 바꾸지 않는다(사람이 보고 고친다).
       ⚠️ 길이 300자 · 같은 (문장, 뜻) 은 한 줄 · 하루 500줄 상한(전체 공유 — IP 별 상한은 없다) — 넘으면 stored:false.
       ⛔ 이 표를 화면에 그릴 때는 반드시 이스케이프 — text·meaning 은 아무나 넣을 수 있는 값이다(저장형 XSS).
       지금은 읽는 화면이 없다 — SELECT text, meaning, count FROM learn_meaning_reports ORDER BY count DESC. */
    if (b.mode === 'learn_report') {
      const rText = String(b.text || '').trim().slice(0, 300);
      const rMean = String(b.meaning || '').trim().slice(0, 300);
      const rPage = String(b.page || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30);
      if (!rText || !rMean) return json({ ok: false, error: 'missing' }, 400);
      let stored = false;
      try {
        if (!(globalThis as any).__learnReportTable) await env.DB.prepare(`CREATE TABLE IF NOT EXISTS learn_meaning_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, meaning TEXT NOT NULL,
          page TEXT, count INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
          UNIQUE(text, meaning))`).run();
        (globalThis as any).__learnReportTable = true;   // 같은 워커 인스턴스에선 표 만들기를 한 번만
        const now = Date.now();
        const day: any = await env.DB.prepare('SELECT COUNT(*) AS n FROM learn_meaning_reports WHERE last_at > ?')
          .bind(now - 86400000).first();
        if (Number(day && day.n) < 500) {
          await env.DB.prepare(`INSERT INTO learn_meaning_reports (text, meaning, page, count, created_at, last_at)
            VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(text, meaning) DO UPDATE SET count = count + 1, last_at = excluded.last_at`)
            .bind(rText, rMean, rPage, now, now).run();
          stored = true;
        }
      } catch (e) { console.warn('[learn_report] store failed', String(e)); }
      return json({ ok: true, stored });
    }

    //   ⚠️ 채팅 캐시 접두사에 번호를 붙인다. 프롬프트를 고치면 반드시 올릴 것 —
    //      안 올리면 옛 프롬프트로 만든 번역이 180일 동안 그대로 나온다.
    //      trc2: 존댓말 고정 / trc3: 어미 중첩 금지(프롬프트) / trc4: 어미 중첩 코드 교정(2026-07-29).
    //      trl1: learn 모드 첫 프롬프트(2026-08-24) — 접두사가 달라 기존 tr:/trc4: 캐시(직역)와 안 섞인다.
    //      trl2: learn 모드 «말머리 상투구 결정론 + 직역금지 예시»(2026-08-31) — 「훌륭한 직업!」이 담긴 trl1 캐시와 안 섞인다.
    const cacheKey = (t: string) => (learnMode ? 'trl2:' : chatMode ? 'trc4:' : 'tr:') + target + ':' + t;
    let texts: string[] = Array.isArray(b.texts) ? b.texts.map((t: any) => String(t || '')).filter((t: string) => t.trim()) : [];
    texts = Array.from(new Set(texts)).slice(0, 50);
    if (!texts.length) return json({ ok: true, map: {} });
    const hasHangul = (s: string) => /[가-힣ᄀ-ᇿ㄰-㆏]/.test(s);
    const hasHan = (s: string) => /[一-鿿]/.test(s);
    const ai = (env as any).AI;
    const kv = (env as any).SESSION_STATE;
    const map: Record<string, string> = {};
    const need: string[] = [];
    for (const t of texts) {
      const isKo = hasHangul(t);
      // 이미 목표 언어면 번역 불필요
      //   zh 판정은 '한글이 없고 한자가 있으면 중국어'. 한자를 섞어 쓴 한국어는 한글이 있으니 걸러진다.
      const already = (target === 'en') ? !isKo && !hasHan(t)
                    : (target === 'ko') ? (isKo && !hasForeignGloss(t))
                    : (!isKo && hasHan(t));
      if (already) { map[t] = t; continue; }
      let cached: string | null = null;
      if (kv) { try { cached = await kv.get(cacheKey(t)); } catch {} }
      // 🧹 learn 모드는 저장된 뜻도 다시 본다 — 'ㅋㅋㅋㅋ' 처럼 이미 굳은 값은 버리고 새로 번역한다(learn-meaning-check.ts).
      if (cached != null && !(target === 'ko' && hasForeignGloss(cached))
          && !(learnMode && target === 'ko' && !isUsableKoMeaning(cached, t))) map[t] = cached; else need.push(t);
    }
    const dbg: any = { ai: !!ai, need: need.length, raw: null, err: null };
    // 번역 전용 모델 m2m100 (LLM 프롬프트보다 안정적). 텍스트별 번역.
    // 원문 언어 감지: 한글이 있으면 korean, 한자면 chinese, 나머지는 english.
    //   ⚠️ 한글 검사를 한자보다 먼저 해야 한다 — 순서를 바꾸면 한자 섞인 한국어가 중국어로 잡힌다.
    const srcOf = (s: string) => hasHangul(s) ? 'korean' : (hasHan(s) ? 'chinese' : 'english');
    const tgtLang = target === 'en' ? 'english' : (target === 'zh' ? 'chinese' : 'korean');
    // 💬 채팅 모드 — 언어모델로 한 문장씩. 실패하면 아래 m2m100 이 그대로 받아준다.
    const LANG_NAME: Record<string, string> = { en: 'English', ko: 'Korean', zh: 'Simplified Chinese' };
    // 🗣️ learn 모드 프롬프트 — 「뜻 보기」는 «영어가 무슨 뜻인지» 를 학생에게 알려 주는 카드다.
    //   직역이 아니라 의역을 시키고(warm up ≠ 따뜻하게), 학생이 읽는 글이라 친근한 해요체로 고정한다.
    const learnSys = 'You translate what an AI English tutor or an English practice app said, '
      + 'so a young Korean student (elementary or middle school) can understand what the English means. '
      + 'Give the MEANING in natural, friendly Korean — a free translation, never word-for-word. '
      + 'Cheers, greetings and set phrases must be translated as what a Korean teacher would actually say, '
      + 'NOT by translating each word: ' + LEARN_GLOSS_HINT + ' '
      + 'Reply with ONLY the Korean. No quotes, no notes, no romanization, no explanation. '
      + 'Use friendly polite 해요체 (해요 / 볼까요? / 어때요?). Never 반말, never stiff formal 합니다체. '
      + 'Never translate a question as 「~습니까?」 — a child reads this. Use 「~예요?」 / 「~해요?」. '
      + 'Never write 「당신」 for "you" — Korean drops it. "Do you have a pet?" is 「반려동물 키워요?」, not 「당신은 애완동물이 있습니까?」. '
      + 'Keep names, numbers, quoted titles and emoji exactly as they are. '
      + 'Never stack endings — 해요요, 습니다요 are not Korean.';
    async function chatTranslate(t: string): Promise<string> {
      const from = srcOf(t) === 'korean' ? 'Korean' : (srcOf(t) === 'chinese' ? 'Simplified Chinese' : 'English');
      const to = LANG_NAME[target] || 'English';
      const chatSys = 'You translate one chat message at a time for a live online English class. '
        + 'Speakers are Korean office staff and Filipino or Chinese teachers talking about lessons, '
        + 'homework, schedules and students. Reply with ONLY the translated message. '
        + 'No quotes, no notes, no romanization, no explanation. '
        + 'Keep it short and natural, the way a person actually speaks in chat. '
        + 'Keep names, @mentions, numbers, times and emoji exactly as they are. '
        + 'In a school context "숙제" is school homework, never housework or a job. '
        // 존댓말 고정 — 상대가 강사·학부모·직원이라 반말이 섞이면 무례하게 읽힌다.
        //   모델이 영어 원문의 캐주얼한 말투를 그대로 옮겨 "숙제는 끝냈어?" 처럼 반말이 나왔다.
        + 'When the target language is Korean, ALWAYS use polite speech (해요체 or 합니다체). '
        + 'Never use 반말 / plain form, even if the source sounds casual. '
        // ⚠️ "문장을 요/니다로 끝내라" 고 못박았더니 모델이 곧이곧대로 따라
        //    "죄송합니다요" 같은 없는 말을 만들었다. 규칙이 아니라 예시로 보여준다.
        + 'Write natural Korean: 합니다 / 해요 / 하셨어요 / 죄송합니다 / 감사합니다. '
        + 'Never stack endings — 합니다요, 습니다요, 이에요요 are not Korean. '
        + 'When the target language is Chinese, use polite 您 rather than 你 when addressing a person.';
      const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: (learnMode ? learnSys : chatSys) + (target === 'ko' ? ' ' + KOREAN_GLOSS_RULE : '') },
          { role: 'user', content: learnMode
              ? `Translate this ${from} message into natural ${to} (free translation of the meaning):\n${t}`
              : `Translate this ${from} chat message into ${to}:\n${t}` },
        ],
        max_tokens: 300,
      });
      let out = String(typeof resp === 'string' ? resp : (resp && typeof resp.response === 'string' ? resp.response : '') || '').trim();
      // 모델이 가끔 따옴표로 감싸거나 "Translation:" 을 붙인다 → 벗겨낸다
      out = out.replace(/^```[a-zA-Z]*\s*|\s*```$/g, '').trim();
      out = out.replace(/^(translation|번역)\s*[:：]\s*/i, '').trim();
      if (out.length > 1 && /^["'“”「『]/.test(out) && /["'“”」』]$/.test(out)) out = out.slice(1, -1).trim();
      // 여러 줄로 떠들면 — 채팅은 첫 줄만(한 메시지 = 한 줄), learn 은 여러 문장짜리
      // 말풍선이 있어 첫 줄만 취하면 뜻이 잘린다 → 한 줄로 이어 붙인다.
      out = learnMode ? out.replace(/\s*\r?\n\s*/g, ' ').trim() : out.split(/\r?\n/)[0].trim();
      /* 어미 중첩 교정 — 프롬프트로 금지해도 모델이 "죄송합니다요" 를 계속 만든다.
         존댓말을 시켰더니 이미 존댓말인 -습니다/-습니까 뒤에 요를 한 번 더 붙인다.
         확률에 맡기지 말고 여기서 확정적으로 떼어낸다. */
      if (target === 'ko') {
        out = out.replace(/(습니다|합니다|입니다|ㅂ니다)요(?=[\s.!?,]|$)/g, '$1')
                 .replace(/(습니까|합니까|입니까|니까)요(?=[\s.!?,]|$)/g, '$1')
                 .replace(/(이에요|예요|어요|아요|해요|세요)요(?=[\s.!?,]|$)/g, '$1');
      }
      // 목표 언어가 아니면(그대로 되뇌었거나 엉뚱한 언어) 실패로 본다 → m2m100 으로 넘긴다
      if (!out || out === t) return '';
      if (target === 'ko' && (!hasHangul(out) || hasForeignGloss(out))) return '';
      if (target === 'zh' && !hasHan(out)) return '';
      if (target === 'en' && (hasHangul(out) || hasHan(out))) return '';
      return out;
    }

    /* ⏱ (2026-09-01) 여러 문장을 «동시에» 번역한다 — 순차로는 배치 호출이 못 쓴다.
       [왜] 우주몬스터 게임은 게임 시작을 막고 한 번에 최대 50문장을 물어보는데, 이 루프가
            문장마다 모델을 하나씩 기다렸다. 그래서 그 화면만 「뜻」 의역(mode:'learn')을
            못 켜고 직역으로 남아 «같은 영어가 화면마다 다른 한국어» 가 되고 있었다.
       [무엇을 바꿨나] 호출 «횟수» 는 그대로다. 바뀐 것은 «동시에 몇 개를 기다리는가» 뿐이다.
       ⛔ 상한을 크게 올리지 말 것 — Workers AI 는 뉴런이 소진되면 429 를 주고, 이 루프는
          실패를 재시도하지 않고 원문으로 떨어뜨린다(그러면 그 문장은 게임에서 빠진다).
       ℹ️ 각 반복은 서로 독립이다 — `map` 은 문장마다 다른 키에 쓰고, KV 키도 문장마다 다르다.
          `dbg` 만 마지막 것이 남는데 그건 ?debug=1 전용이라 무해하다. */
    const TRANSLATE_CONCURRENCY = 4;
    /* 💬 (2026-11-04) chat 모드 언어모델에 쓰는 «총» 시간(재시도 포함) — 화면은 8초를 기다린다
       (idx-vc-chat.js WAIT_MS). 5초 + m2m100 ~1초 = 화면 상한 안쪽. 둘을 함께 고칠 것. */
    const CHAT_LLM_TIMEOUT_MS = 5000;
    if (need.length && ai) {
      const queue = need.slice();
      const runOne = async (t: string) => {
        try {
          /* 🗣️ learn 모드 — 말머리 칭찬 상투구는 «모델에게 맡기지 않고» 여기서 떼어 낸다.
             「Good job!」을 m2m100 이 「훌륭한 직업!」으로 옮긴 제보(2026-08-31)가 출발점이고,
             언어모델로 바꿔도 확률이라 자주 나오는 상투구는 결정론으로 못 박는다.
             정본 표: src/learn-phrase-ko.ts. 종결부호가 없으면 떼지 않으므로
             「Good job on your sentence」 같은 진짜 문장은 그대로 통째로 번역된다. */
          /* 고정 인사말은 손으로 다듬은 의역이 정본이다(learn-phrase-ko.ts).
             ⛔ 이 판정을 화면 쪽에 다시 만들지 말 것 — 2026-09-01 에 warmup.html 의
                같은 정규식(curatedMeaning)을 지우고 여기 한 곳으로 모았다. */
          if (learnMode && target === 'ko') {
            const greet = curatedLearnMeaning(t);
            if (greet) {
              map[t] = greet;
              if (kv) { try { await kv.put(cacheKey(t), greet, { expirationTtl: 60 * 60 * 24 * 180 }); } catch {} }
              return;   // 이 문장은 여기서 끝 — 번역을 부르지 않는다
            }
          }
          const lead = (learnMode && target === 'ko') ? peelLearnLead(t) : { leadKo: '', rest: t };
          const src = lead.rest;
          /* 남은 것이 이모지·부호뿐이면 번역하지 않는다 — 모델에 넣어 봐야 엉뚱한 글자가 돌아온다.
             ⚠️ 말머리를 «실제로 뗀» 경우에만 이 지름길을 쓴다. 조건을 넓히면 기본·chat 경로까지
                바뀌어, 이 글자범위에 없는 언어(가나·키릴 등)가 번역 없이 원문 그대로 나간다. */
          const needsMt = !lead.leadKo || /[A-Za-z\u3131-\uD79D\u4E00-\u9FFF]/.test(src);
          let out = '';
          /* 🔴 번역이 «실제로» 나왔는가 — 캐시(180일) 판정에 쓴다.
             예전에는 실패하면 out = t(원문)라서 `out !== t` 가 거짓이 되어 저절로 캐시를 비켜 갔다.
             말머리를 떼면 실패해도 「잘했어요! Do you have a pet animal?」처럼 t 와 «달라져서»
             그 반쪽짜리가 180일 굳는다. 같은 사고 전례: 폴백 음성을 «요청 화자» 키로 캐시해
             그 문장이 영원히 다른 목소리가 됐던 건(CLAUDE.md 2장). 실패는 캐시하지 않는다. */
          let mtOk = true;
          if (!needsMt) {
            out = joinLearnLead(lead.leadKo, src);
          } else {
            let mt = '';
            if (chatMode) {
              /* 💬 (2026-11-04 Kaye 「한국어 번역을 켰는데 채팅이 번역되지 않는다」)
                 [실측 2026-11-03 class-4065] 같은 영어 문장이 9초 간격으로 두 번 «번역 없이» 나갔다.
                 두 번째도 안 됐으니 «느렸다» 만이 아니라 «실패했다» 다 — 첫 번째가 늦게라도 성공했다면
                 180일 캐시에 남아 두 번째는 즉시 나갔어야 한다.
                 ① 언어모델 호출이 던지면(일시적 용량 초과 등) 한 번만 다시 부른다.
                 ② 화면(idx-vc-chat.js)이 기다리는 시간 안에 답하도록 상한을 둔다 — 넘기면 아래 m2m100 이 받는다.
                 ⛔ learn 모드에는 걸지 않는다(게임이 한 번에 50문장을 물어 상한에 걸리면 직역으로 떨어진다). */
              const chatDeadline = Date.now() + CHAT_LLM_TIMEOUT_MS;
              for (let attempt = 0; attempt < 2 && !mt; attempt++) {
                const left = chatDeadline - Date.now();
                if (left < 800) break;   // 재시도할 시간이 없다 — m2m100 으로
                let timedOut = false;
                try {
                  mt = await Promise.race([
                    chatTranslate(src),
                    new Promise<string>((_, rej) => setTimeout(() => { timedOut = true; rej(new Error('chat-timeout')); }, left)),
                  ]);
                } catch (e: any) {
                  dbg.err = 'chat#' + (attempt + 1) + ':' + String(e?.message || e);
                  console.warn('[translate:chat] 언어모델 실패', attempt + 1, String(e?.message || e).slice(0, 120));
                  if (timedOut) break;   // 시간을 다 썼다 — 재시도 대신 빠른 m2m100 으로
                }
              }
            } else if (learnMode) {
              try { mt = await chatTranslate(src); }
              catch (e: any) { dbg.err = 'chat:' + String(e?.message || e); }
            }
            /* 💬 (2026-11-04) chat 모드에서 언어모델이 실패·시간초과해 m2m100 으로 떨어진 결과는 캐시하지 않는다 —
               180일 캐시에 직역(「숙제→job」 류)이 굳으면 다음에 언어모델이 살아나도 그 문장은 영영 직역이다. */
            const chatFellBack = chatMode && !mt;
            if (!mt) {
              const resp: any = await ai.run('@cf/meta/m2m100-1.2b', { text: src, source_lang: srcOf(src), target_lang: tgtLang });
              if (dbg.raw == null) dbg.raw = JSON.stringify(resp).slice(0, 300);
              mt = (resp && typeof resp.translated_text === 'string' && resp.translated_text.trim()) ? String(resp.translated_text) : '';
            }
            if (target === 'ko' && hasForeignGloss(mt)) mt = '';
            // 🧹 learn 모드: 자모 반복을 걷어내고, 완성 음절이 없으면 «번역 실패» 로 본다(저장도 안 함).
            if (learnMode && target === 'ko' && mt) { mt = stripJamoRuns(mt); if (!isUsableKoMeaning(mt, src)) mt = ''; }
            mtOk = !!mt && !chatFellBack;
            // 번역이 없으면 원문(src)을 그대로 붙여 둔다 — 뗀 말머리만이라도 보여 주는 편이 낫다.
            // 다만 «다음에 다시 시도» 할 수 있게 캐시는 하지 않는다(mtOk=false).
            out = joinLearnLead(lead.leadKo, mt || src);
          }
          map[t] = out;
          if (kv && mtOk && out && out !== t) { try { await kv.put(cacheKey(t), out, { expirationTtl: 60 * 60 * 24 * 180 }); } catch {} }
        } catch (e: any) { dbg.err = String(e?.message || e); map[t] = t; }
      };
      await Promise.all(
        Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, queue.length) }, async () => {
          for (;;) { const t = queue.shift(); if (t === undefined) return; await runOne(t); }
        }),
      );
    } else if (need.length) { for (const c of need) map[c] = c; }
    // Failed translations must not expose mixed-script source text as a Korean meaning.
    /* 💬 (2026-11-04) chat 모드는 이 안내문을 쓰지 않는다 — 화면이 map 값을 «그대로 채팅으로 보낸다».
       중국어 → 한국어 번역이 실패하면 강사 메시지 대신 「뜻을 불러오지 못했어요…」가 학생에게 나갔다.
       원문을 돌려주면 화면이 «번역 실패» 로 알아보고 원문을 보내며 강사에게 그 사실을 말한다. */
    if (target === 'ko') for (const t of texts) {
      if (hasForeignGloss(map[t])) map[t] = chatMode ? t : '뜻을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
    if (url.searchParams.get('debug') === '1') return json({ ok: true, map, _debug: dbg });
    return json({ ok: true, map });
  }

  return null;
}
