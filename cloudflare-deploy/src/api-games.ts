// ═══════════════════════════════════════════════════════════════════════
// 🎮 api-games.ts — 게임/학습 도메인 API (api-mango.ts 에서 분리)
//   docs/REFACTOR_PLAN.md 1단계 · 2026-07-14 · 로직 무변경 이동
//   포함: 📚 Phase VOC (단어장+플래시카드+게이미피케이션 10라우트)
//         🧠 Phase ML  (마이크로러닝: AI동의어·자동퀴즈·카톡발송 8라우트)
//   라우트: /api/vocab/* 전체 + /api/admin/microlearn/*
//   매칭 안 되면 null 반환 → handleMangoApi 가 나머지 라우팅 계속.
// ═══════════════════════════════════════════════════════════════════════
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';  // 🔐 소유자 검증(IDOR 방지)
import { checkAdminSession } from './auth-admin';
import type { MangoEnv } from './api-mango';

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
      // 🔐 [IDOR] 본인(토큰) 또는 관리자만 — 남의 단어장 조회 차단 (2026-07-11)
      const vlAdmin = await checkAdminSession(request, env as any);
      const vlAuth = await authUidGlobal(request, url, env);
      if (!vlAdmin.ok && (!vlAuth || vlAuth !== uid)) return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 단어장만 조회할 수 있습니다.' }, 401);
      const rs = await env.DB.prepare(`SELECT id, word, korean, example, level, next_review_at, correct_count, wrong_count, created_at FROM vocabulary WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`).bind(uid).all();
      return json({ ok: true, count: rs.results?.length || 0, words: rs.results || [] });
    }

    // ── GET /api/vocab/due?uid=X — 오늘 복습할 단어 ──
    if (method === 'GET' && path === '/api/vocab/due') {
      await ensureVocab();
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      // 🔐 [IDOR] 본인(토큰) 또는 관리자만 — 남의 단어장 조회 차단 (2026-07-11)
      const vdAdmin = await checkAdminSession(request, env as any);
      const vdAuth = await authUidGlobal(request, url, env);
      if (!vdAdmin.ok && (!vdAuth || vdAuth !== uid)) return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 단어장만 조회할 수 있습니다.' }, 401);
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

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
