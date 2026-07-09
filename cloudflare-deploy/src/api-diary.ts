// ═══════════════════════════════════════════════════════════════════════
// 🎙️ [Phase VDI] AI Voice Diary — api-mango.ts 에서 분리 (docs/REFACTOR_PLAN.md 1단계)
//   - Daily voice diary -> Whisper STT -> Llama correction + Korean encouragement
//   - R2 store: env.RECORDINGS, key: diary/{user_id}/{date}.webm
//   라우트: /api/diary/upload · correct · list · {id} · parent-notify
//   매칭 안 되면 null 반환 → handleMangoApi 가 나머지 라우팅 계속.
// ═══════════════════════════════════════════════════════════════════════
import { json, parseJsonBody } from './api-util';
import type { MangoEnv } from './api-mango';

export async function handleDiaryApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/diary/upload' && method === 'POST') {
    try {
      const body = await parseJsonBody(request);
      if (!body || !body.user_id || !body.audio_base64 || !body.date) return json({ ok: false, error: 'missing_fields' }, 400);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);

      let audioBytes: Uint8Array | null = null;
      try {
        const b64 = String(body.audio_base64).replace(/^data:[^;]+;base64,/, '');
        const bin = atob(b64);
        audioBytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) audioBytes[i] = bin.charCodeAt(i);
      } catch {
        return json({ ok: false, error: 'invalid_audio_base64' }, 400);
      }

      const key = `diary/${body.user_id}/${body.date}.webm`;
      let audioUrl = '';
      try {
        const bucket: any = (env as any).RECORDINGS;
        if (bucket && bucket.put && audioBytes) {
          await bucket.put(key, audioBytes, { httpMetadata: { contentType: 'audio/webm' } });
          audioUrl = `r2://${key}`;
        }
      } catch (e) {
        console.warn('[diary] R2 upload failed (continuing):', (e as any)?.message || e);
      }

      let transcript = '';
      try {
        if (env.AI && audioBytes) {
          const ai: any = await env.AI.run('@cf/openai/whisper', { audio: Array.from(audioBytes) });
          transcript = (ai?.text || ai?.transcript || '').toString().trim();
        }
      } catch (e) {
        console.warn('[diary] Whisper STT failed (stub):', (e as any)?.message || e);
      }

      const now = Date.now();
      const result: any = await env.DB.prepare(`INSERT INTO voice_diary (user_id, date, audio_url, transcript_en, ai_correction, ai_encouragement_ko, score, duration_seconds, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(
          String(body.user_id),
          String(body.date),
          audioUrl,
          transcript,
          '',
          '',
          0,
          Number(body.duration_seconds) || 0,
          now
        ).run();

      return json({ ok: true, diary_id: result?.meta?.last_row_id, audio_url: audioUrl, transcript, created_at: now });
    } catch (e: any) {
      return json({ ok: false, error: e?.message || 'diary_upload_failed' }, 500);
    }
  }

  if (path === '/api/diary/correct' && method === 'POST') {
    try {
      const body = await parseJsonBody(request);
      if (!body || !body.diary_id) return json({ ok: false, error: 'missing_diary_id' }, 400);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
      const row: any = await env.DB.prepare('SELECT * FROM voice_diary WHERE id = ?').bind(Number(body.diary_id)).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      const transcript = String(row.transcript_en || '').trim();
      if (!transcript) return json({ ok: false, error: 'empty_transcript' }, 400);

      let correction = '';
      let encouragement = '';
      let score = 70;
      try {
        if (env.AI) {
          const prompt = `Student wrote (voice diary, English): "${transcript}"\n\n1) Correct grammar/spelling and return the corrected English sentence(s).\n2) Score the writing from 0 to 100.\n3) Then write a warm, friendly Korean encouragement comment (2-3 sentences) like a kind English coach.\n\nReturn strictly JSON: {"corrected":"...","score":85,"encouragement_ko":"..."}.`;
          const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: 'You are a friendly Korean-English coach for kids. Always reply in valid JSON.' },
              { role: 'user', content: prompt }
            ],
            max_tokens: 512,
            temperature: 0.2,
            response_format: { type: 'json_object' },
          });
          // Workers AI: JSON 모드면 response 가 이미 객체이거나 JSON 문자열. 둘 다 대응.
          const raw = ai?.response ?? ai?.result?.response ?? '';
          let obj: any = null;
          if (raw && typeof raw === 'object') {
            obj = raw;
          } else {
            const text = String(raw || '');
            try { obj = JSON.parse(text); }
            catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch {} } }
          }
          if (obj) {
            correction = String(obj.corrected || obj.correction || '').trim();
            encouragement = String(obj.encouragement_ko || obj.encouragement || '').trim();
            const sc = Number(obj.score);
            if (Number.isFinite(sc)) score = Math.max(0, Math.min(100, Math.round(sc)));
          }
          if (!correction) correction = transcript;
          if (!encouragement) encouragement = '오늘도 일기를 쓰다니 정말 멋져요! 매일 조금씩 쓰면 영어 실력이 쑥쑥 자랄 거예요. 👏';
        }
      } catch (e) {
        console.warn('[diary] AI correction failed:', (e as any)?.message || e);
        correction = transcript;
        encouragement = '오늘도 일기를 쓰다니 정말 멋져요! 계속 이렇게 써보아요. 👏';
      }

      await env.DB.prepare('UPDATE voice_diary SET ai_correction = ?, ai_encouragement_ko = ?, score = ? WHERE id = ?')
        .bind(correction, encouragement, score, Number(body.diary_id)).run();
      return json({ ok: true, correction, encouragement_ko: encouragement, score });
    } catch (e: any) {
      return json({ ok: false, error: e?.message || 'diary_correct_failed' }, 500);
    }
  }

  if (path === '/api/diary/list' && method === 'GET') {
    try {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
      const userId = url.searchParams.get('user_id');
      const month = url.searchParams.get('month');
      if (!userId) return json({ ok: false, error: 'missing_user_id' }, 400);
      let sql = 'SELECT id, user_id, date, audio_url, transcript_en, score, duration_seconds, created_at FROM voice_diary WHERE user_id = ?';
      const params: any[] = [userId];
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        sql += ' AND date LIKE ?';
        params.push(`${month}%`);
      }
      sql += ' ORDER BY date DESC LIMIT 100';
      const rs = await env.DB.prepare(sql).bind(...params).all();
      return json({ ok: true, entries: rs.results || [] });
    } catch (e: any) {
      return json({ ok: false, error: e?.message || 'diary_list_failed' }, 500);
    }
  }

  {
    const mDiary = path.match(/^\/api\/diary\/(\d+)$/);
    if (mDiary && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
        const row = await env.DB.prepare('SELECT * FROM voice_diary WHERE id = ?').bind(Number(mDiary[1])).first();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        return json({ ok: true, entry: row });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'diary_get_failed' }, 500);
      }
    }
  }

  if (path === '/api/diary/parent-notify' && method === 'POST') {
    try {
      const body = await parseJsonBody(request);
      if (!body || !body.diary_id) return json({ ok: false, error: 'missing_diary_id' }, 400);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
      const row: any = await env.DB.prepare('SELECT * FROM voice_diary WHERE id = ?').bind(Number(body.diary_id)).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      const msg = `[Mangoi Voice Diary] ${row.date} - "${String(row.transcript_en || '').slice(0, 80)}..." (score ${row.score || 0})`;
      // TODO: real kakao send via solapi-client. For now, queue to digest_logs.
      await env.DB.prepare('INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)')
        .bind(row.user_id, '', msg, Date.now(), 'queued_diary').run();
      return json({ ok: true, queued: true, preview: msg });
    } catch (e: any) {
      return json({ ok: false, error: e?.message || 'diary_notify_failed' }, 500);
    }
  }

  return null;
}
