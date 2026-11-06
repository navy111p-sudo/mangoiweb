// 단어장 조회·복습·추가·보상 API.
import { json } from './api-util';
import { KOREAN_GLOSS_RULE, hasForeignGloss, repairKoreanGlosses } from './korean-vocab';
import { applyPointTransaction } from './api-points';
import { dailyAllowance } from './point-policy';
import { resolveOwnerScope } from './auth-admin';
import type { MangoEnv } from './api-mango';
import { vocabSrsNext, vocabWriteDenied } from './api-games-vocab-core';
import { createVocabContext } from './api-games-vocab-context';
export async function handleVocabApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
  const { ensureVocab, vocabKstDay, gateVocabOwner, attachVocabTags, readableVocab } = createVocabContext(request, url, env);


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


  return null;
}
