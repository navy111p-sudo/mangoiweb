// Voice coaching: transcription, scoring, history and statistics.
import { isReadableKo } from './ko-readable';
import { json } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { resolveOwnerScope } from './auth-admin';
import { scoreVoiceCoach, scoreTier, analyzeAcoustic, applyAzurePronunciation } from './voice-score';
import { assessPronunciation } from './azure-pronunciation';
import type { MangoEnv } from './api-mango';
import { isSttRepeatLoop } from './stt-loop';
import { sttRejectReason } from './stt-confidence';
import { focusedPrepositionFix } from './focused-correction';
import { handleVoiceTtsApi } from './api-voice-tts';
import { referenceReadingEvidence } from './speaking-audio-evidence';
import { logSpeakingGrowth } from './speaking-growth';

export async function handleVoiceApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;
    // ═══════════════════════════════════════════════════════════════
    // 🎙 Phase AV — AI 음성 코칭 (Workers AI Whisper 전사 + LLM 피드백)
    //   POST /api/voice/transcribe — multipart/form-data 의 audio 파일 받아 Whisper 로 전사
    //   POST /api/voice/coach      — 학생 발화 텍스트 + 모범 텍스트 → AI 피드백 + 점수
    //   GET  /api/voice/history    — 학생별 최근 음성 코칭 이력
    // ═══════════════════════════════════════════════════════════════
    const ensureVoiceTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, target_text TEXT, transcribed_text TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, ai_feedback TEXT, suggestion TEXT, audio_url TEXT, created_at INTEGER NOT NULL);`);
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_voice_student ON voice_coaching(student_uid, created_at DESC)`); } catch {}
      // 🎧 (2026-07-30) 음향 채점 보정용 원자료. 임계값(ACOUSTIC_TUNING)이 아직 잠정치라,
      //   실사용 분포를 봐야 "웅얼거림"의 실제 경계를 정할 수 있다. 점수가 아니라 원값을 남긴다.
      //   ADD COLUMN 은 기존 행을 건드리지 않는다(추가만). 이미 있으면 예외 → 무시.
      // 🎤 (2026-08-08) Azure 음소 발음평가 원값. Whisper 확신도 방식과 «나란히» 남겨야
      //   두 자(尺)가 얼마나 다른지 실측으로 비교할 수 있다(도입 판단의 근거).
      for (const col of ['avg_logprob REAL', 'no_speech_prob REAL', 'speech_rate REAL', 'max_gap REAL', 'acoustic_used INTEGER',
                         'azure_accuracy REAL', 'azure_fluency REAL', 'azure_completeness REAL', 'azure_used INTEGER',
                         'azure_diag TEXT']) {
        try { await env.DB.exec(`ALTER TABLE voice_coaching ADD COLUMN ${col}`); } catch { /* 이미 존재 */ }
      }
    };

    const ttsResponse = await handleVoiceTtsApi(request, url, env);
    if (ttsResponse) return ttsResponse;

    /* ── GET /api/voice/azure-token — 브라우저 발음평가용 «10분 임시 출입증» (2026-08-08) ──
       왜: Azure 의 REST 짧은오디오 창구는 Pronunciation-Assessment 헤더를 **무시한다**(실측 확정).
           평가는 브라우저 Speech SDK 가 직접 해야 한다. 그런데 SDK 에 구독 키를 주면
           **키가 학생 브라우저로 나간다** — 그건 절대 안 된다.
       → Azure 가 주는 «임시 토큰»(유효 10분)만 내려보낸다. 키는 서버에만 남는다.
       ⛔ 이 토큰으로 할 수 있는 일은 우리 Speech 리소스의 음성 인식뿐이고, 10분 뒤 죽는다. */
    if (method === 'GET' && path === '/api/voice/azure-token') {
      const key = String((env as any).AZURE_SPEECH_KEY || '').trim();
      const region = String((env as any).AZURE_SPEECH_REGION || '').trim().toLowerCase();
      if (!key || !region) return json({ ok: false, error: 'azure_not_configured' }, 503);
      try {
        const r = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
          method: 'POST',
          headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Length': '0' },
        });
        if (!r.ok) {
          console.warn('[azure-token] http', r.status);
          return json({ ok: false, error: 'issue_failed_' + r.status }, 502);
        }
        const token = (await r.text()).trim();
        if (!token) return json({ ok: false, error: 'empty_token' }, 502);
        // 실제 유효기간은 10분. 화면이 9분마다 새로 받도록 여유를 두고 알려 준다.
        return json({ ok: true, token, region, expires_in: 540 });
      } catch (e: any) {
        console.warn('[azure-token] error', e?.message);
        return json({ ok: false, error: 'issue_error' }, 502);
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
        let hintPrompt = '';
        let strictSpeech = false;
        let checkPreposition = false;
        let paReference = '';   // 🎤 Azure 발음평가 모범 문장 (Whisper 로는 절대 안 넘어간다)
        if (ct.includes('multipart/form-data')) {
          const fd = await request.formData();
          strictSpeech = fd.get('strict') === '1';
          checkPreposition = fd.get('check_preposition') === '1';
          const file = fd.get('audio') as File | null;
          if (!file) return json({ ok: false, error: 'no_audio_file' }, 400);
          audio = await file.arrayBuffer();
          hintLang = String(fd.get('lang') || '').trim().toLowerCase();
          // ⛔ (2026-07-30) 채점 화면에서는 이걸 절대 보내지 말 것.
          //   initial_prompt 는 디코더를 그 텍스트 쪽으로 기울인다. 발음을 채점하는 화면
          //   (speech-coach)에서 모범 문장을 넣으면 발음이 엉망이어도 정답 문장이 그대로
          //   전사돼, 텍스트 비교 채점기(voice-score.ts)가 항상 100점을 준다.
          //   07-29 에 음성코치가 이걸 보내다가 만점만 나와서 07-30 에 제거했다.
          //   자유발화 받아쓰기(고유명사 힌트 등) 용도로만 쓸 것.
          hintPrompt = String(fd.get('prompt') || '').trim().slice(0, 300);
          /* 🎤 (2026-08-08) Azure 발음평가용 «모범 문장». ⛔ 위 hintPrompt 와 절대 섞지 말 것 —
             이 값이 Whisper 의 initial_prompt 로 흘러가면 07-29 만점 사고가 그대로 재현된다.
             Azure 는 소리를 음소 단위로 재므로 모범 문장을 알아도 점수가 후해지지 않는다. */
          paReference = String(fd.get('reference') || '').trim().slice(0, 500);
        } else {
          audio = await request.arrayBuffer();
          hintLang = String(url.searchParams.get('lang') || '').trim().toLowerCase();
          hintPrompt = String(url.searchParams.get('prompt') || '').trim().slice(0, 300);
          strictSpeech = url.searchParams.get('strict') === '1';
        }
        if (!audio || audio.byteLength < 100) return json({ ok: false, error: 'audio_too_small' }, 400);
        if (audio.byteLength > 25 * 1024 * 1024) return json({ ok: false, error: 'audio_too_large', max: '25MB' }, 400);

        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        // 기대 언어 정규화(ISO-639-1). 지원 밖이면 힌트 없이 자동감지로 둔다.
        const langMap: Record<string, string> = { en: 'en', ko: 'ko', zh: 'zh', 'zh-cn': 'zh' };
        const lang = langMap[hintLang] || '';
        if (strictSpeech && !lang) return json({ ok: false, error: 'speech_language_required' }, 400);

        /* 🎤 (2026-08-08) Azure 음소 발음평가 — Whisper 전사와 «동시에» 돌린다.
           · 키(AZURE_SPEECH_KEY·AZURE_SPEECH_REGION)가 없으면 assessPronunciation 이
             그냥 null 을 준다 → 지금까지의 동작과 100% 동일. 없는 채로도 서비스는 굴러간다.
           · 실패·타임아웃도 전부 null 이다. 발음평가 때문에 수업이 멈추면 안 된다.
           · WAV 가 아니면(구 브라우저의 webm 폴백) 역시 null — Azure 는 webm 을 못 받는다.
           Promise 를 먼저 띄워 두고 Whisper 가 끝난 뒤 await 한다 = 왕복이 겹쳐 지연이 안 늘어난다. */
        /* 🔴 (2026-08-08 실측) Whisper 와 «동시에» 부르면 안 된다.
           처음엔 왕복을 겹쳐 지연을 줄이려고 Promise 를 먼저 띄웠는데, 그러면 Azure 쪽이
           **본문 없는 400** 또는 «Network connection lost» 로 들쭉날쭉 실패했다.
           같은 오디오 버퍼를 두 소비자가 물고, 그 사이에 Workers AI 호출이 끼면서
           바깥 요청이 성립하지 않는다. 사본을 떠도 마찬가지였다.
           → **전사가 끝난 뒤 순차로** 부른다. 0.5~1초 늘지만 결과가 확실하다. */
        const runAzure = async (): Promise<any> => {
          if (!paReference) return { ok: false, reason: 'no_reference' };
          try { return await assessPronunciation(env as any, audio, paReference, lang || 'en'); }
          catch (e: any) { return { ok: false, reason: 'throw ' + String(e?.message || e).slice(0, 80) }; }
        };
        /* 🔍 결과를 «점수» 와 «사유» 로 나눠 돌려준다. 사유가 없으면 실패가 전부 조용한 null 이라
           «키가 틀렸나 / 소리를 못 알아들었나» 를 구분할 수 없다(붙이던 날 밤에 실제로 헤맸다).
           ⛔ azure_diag 에는 사유 «이름» 만 담긴다 — 키도, 응답 본문도 들어가지 않는다. */
        const azureOut = async () => {
          const r: any = await runAzure();
          const evidence=referenceReadingEvidence(r,paReference,lang);
          if(evidence){try{
            const owner=await authUidGlobal(request,url,env);
            if(owner&&!/^(guest|anon)/i.test(owner)){
              const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',audio!))).map(x=>x.toString(16).padStart(2,'0')).join('');
              const key=hash+':'+lang+':'+paReference;
              const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(x=>x.toString(16).padStart(2,'0')).join('');
              await logSpeakingGrowth(env.DB,owner,'speech-coach',{source:'warmup-verified-turn',sessionId:'reading-'+digest},digest,evidence);
            }
          }catch{console.warn('[speaking-growth] audio evidence unavailable');}}
          return { azure: (r && r.ok) ? r : null, azure_diag: r ? (r.ok ? 'ok' : r.reason) : 'none' };
        };

        const readTranscript = async (raw: any) => {
          if (raw instanceof Response && !raw.ok) throw new Error('whisper_http_' + raw.status);
          const result = raw instanceof Response ? await raw.json() : raw;
          if (typeof result?.text !== 'string') throw new Error('invalid_whisper_transcript');
          return result;
        };

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
            const turboParams: any = {
              audio: b64, language: lang, task: 'transcribe', vad_filter: true,
              // 🚫 환각 억제 — 07-29 에 initial_prompt(정답 유출)로 잡으려다 만점 사고가 났다.
              //   Whisper 가 제공하는 정식 수단은 이쪽이다. 정답을 알려주지 않으므로 채점에 안전하다.
              condition_on_previous_text: false,   // 앞 문맥에 이끌린 반복·환각 루프 차단
              hallucination_silence_threshold: 2,  // 2초 이상 침묵 구간은 건너뜀(무음에서 문장 지어내기 방지)
            };
            if (hintPrompt) turboParams.initial_prompt = hintPrompt;
            const turbo = await readTranscript(await ai.run('@cf/openai/whisper-large-v3-turbo', turboParams));
            const ttRaw = turbo.text.trim();
            // A successful empty/VAD rejection is terminal, never a reason to try base Whisper.
            // Confidence rejection is for chat. Pronunciation coaching still needs weak speech to score it.
            const rejected = !ttRaw ? 'no_speech' : (strictSpeech ? sttRejectReason(turbo) : null);
            if (rejected) {
              console.info('[voice/transcribe] dropped=' + rejected);
              return json({ ok: true, text: '', dropped: rejected, lang, segments: null,
                transcription_info: null, azure: null, azure_diag: 'dropped' });
            }
            // 🔁 (2026-10-02) 「oah, oah, oah …」 같은 반복 환각은 «들은 것 없음» 으로 돌려준다(src/stt-loop.ts)
            if (ttRaw && isSttRepeatLoop(ttRaw)) {
              console.warn('[voice/transcribe] repeat-loop dropped len=' + ttRaw.length);
              return json({ ok: true, text: '', dropped: 'repeat_loop', lang, segments: null, transcription_info: null, azure: null, azure_diag: 'dropped' });
            }
            // shortcut: check this known normalization only, widen after paired audio confirms other prepositions.
            const normalize = (text: string) => text.trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
            const expected = normalize(ttRaw).replace(/\binterested in\b/, 'interested on');
            if (checkPreposition && lang === 'en' && !strictSpeech && !paReference && !hintPrompt &&
                audio.byteLength <= 512 * 1024 && expected !== normalize(ttRaw) && focusedPrepositionFix(expected)) {
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                const alternate = await Promise.race([
                  ai.run('@cf/openai/whisper', { audio: [...new Uint8Array(audio)] }).then(readTranscript),
                  new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1700); }),
                ]);
                if (alternate && normalize(alternate.text) === expected) {
                  return json({ ok: true, text: alternate.text.trim(), lang, vtt: alternate.vtt || null,
                    word_count: alternate.word_count || 0, azure: null, azure_diag: 'no_reference', preposition_recheck: 'recovered' });
                }
              } catch {
                // Keep the first transcript if the second recognizer is unavailable.
              } finally { clearTimeout(timer); }
            }
            const tt = ttRaw;
            // 🎧 (2026-07-30) segments/transcription_info 를 함께 돌려준다 — 발음 채점(또렷함·흐름)이
            //   avg_logprob·no_speech_prob·단어 타이밍을 쓴다. 텍스트만으로는 또렷함을 잴 수 없다.
            //   구 whisper 폴백 경로에는 이 정보가 없다 → 그때는 채점이 옛 텍스트 방식으로 자동 복귀.
            if (tt) return json({
              ok: true, text: tt, vtt: turbo?.vtt || null, word_count: turbo?.word_count || 0, lang,
              segments: Array.isArray(turbo?.segments) ? turbo.segments.slice(0, 30) : null,
              transcription_info: turbo?.transcription_info || null,
              // 🎤 발음평가 결과(없으면 null) + 왜 없는지. 프론트는 azure 를 /api/voice/coach 로 넘긴다.
              ...(await azureOut()),
            });
          } catch (turboErr: any) {
            if (strictSpeech) {
              console.warn('[voice/transcribe] strict recognizer unavailable');
              return json({ ok: false, error: 'speech_recognizer_unavailable' }, 503);
            }
            console.warn('[voice/transcribe] turbo failed, fallback base whisper:', turboErr?.message);
          }
        }

        // 폴백: 구 whisper (언어 힌트 미지원, 자동감지)
        const arr = [...new Uint8Array(audio)];
        const result = await readTranscript(await ai.run('@cf/openai/whisper', { audio: arr }));
        const baseText = result.text;
        if (isSttRepeatLoop(baseText)) return json({ ok: true, text: '', dropped: 'repeat_loop', lang: lang || null, azure: null, azure_diag: 'dropped' });
        return json({ ok: true, text: baseText, vtt: result?.vtt || null, word_count: result?.word_count || 0, lang: lang || null, ...(await azureOut()) });
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
      // 🎧 (2026-07-30) 전사 때 받은 Whisper 음향정보를 함께 넘긴다 — 또렷함/흐름을 텍스트가 아닌
      //   음향(avg_logprob·단어 타이밍)으로 잰다. 없으면 채점기가 알아서 옛 텍스트 방식으로 동작.
      //   ⚠️ 프론트가 보내는 값이라 위조 가능하지만, spoken(전사 텍스트)도 원래 프론트가 보낸다.
      //      서버가 오디오를 다시 받지 않는 한 신뢰모델은 이전과 동일하다.
      const acousticIn = (b && typeof b.acoustic === 'object' && b.acoustic) ? {
        segments: Array.isArray(b.acoustic.segments) ? b.acoustic.segments.slice(0, 30) : undefined,
        transcription_info: (b.acoustic.transcription_info && typeof b.acoustic.transcription_info === 'object')
          ? b.acoustic.transcription_info : undefined,
      } : null;
      /* 🎤 (2026-08-08) Azure 음소 발음평가가 있으면 «또렷함·흐름» 을 그것으로 대체한다.
         Whisper 확신도는 흔한 문장을 뭉갠 경우를 원리적으로 못 잡는다(voice-score.ts 한계 4).
         ⚠️ 프론트가 보내는 값이라 위조 가능하다 — 단 spoken(전사 텍스트)도 원래 프론트가 보내므로
            신뢰모델은 이전과 동일하다. 0~100 범위 밖은 채점기가 잘라낸다. */
      const azureIn = (b && typeof b.azure === 'object' && b.azure && b.azure.ok === true) ? {
        accuracy: Number(b.azure.accuracy), fluency: Number(b.azure.fluency),
        completeness: Number(b.azure.completeness), pron: Number(b.azure.pron),
      } : null;
      const sc = applyAzurePronunciation(scoreVoiceCoach(target, spoken, acousticIn), azureIn);
      const ac = analyzeAcoustic(acousticIn);   // 보정용 원자료(점수가 아니라 raw 값)를 함께 남긴다
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
  "feedback": "<one short, natural Korean sentence ending in ~요. about what was good and what to improve>",
  "suggestion": "<one short, natural Korean tip ending in ~요. for next time>"
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
              // 🔤 깨진 한국어(「지도 알는 어 지도 었다…」류 — 2026-11-01 영작 첨삭 실사고)는 버리고 아래 기본 문구를 씁니다.
              if (j.feedback && isReadableKo(j.feedback)) aiFeedback = String(j.feedback).slice(0, 300);
              if (j.suggestion && isReadableKo(j.suggestion)) suggestion = String(j.suggestion).slice(0, 300);
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
      // 🎧 음향 원자료도 같이 저장 — ACOUSTIC_TUNING 임계값을 실사용 분포로 보정하기 위한 것.
      //   옛 컬럼만 있는 DB 에서도 죽지 않게, 실패하면 원래 컬럼만으로 한 번 더 시도한다.
      try {
        await env.DB.prepare(
          `INSERT INTO voice_coaching (student_uid, student_name, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, audio_url, created_at, avg_logprob, no_speech_prob, speech_rate, max_gap, acoustic_used, azure_accuracy, azure_fluency, azure_completeness, azure_used, azure_diag) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(studentUid, studentName, target, spoken, accuracy, pronunciation, fluency, aiFeedback, suggestion, b.audio_url || null, now,
               ac.ok ? ac.lp : null, ac.ok ? ac.noSpeech : null, ac.ok ? ac.rate : null, ac.ok ? ac.maxGap : null, sc.acoustic ? 1 : 0,
               azureIn ? azureIn.accuracy : null, azureIn ? azureIn.fluency : null, azureIn ? azureIn.completeness : null, azureIn ? 1 : 0,
               String(b?.azure_diag || '').slice(0, 120) || null).run();
      } catch {
        await env.DB.prepare(
          `INSERT INTO voice_coaching (student_uid, student_name, target_text, transcribed_text, accuracy_score, pronunciation_score, fluency_score, ai_feedback, suggestion, audio_url, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(studentUid, studentName, target, spoken, accuracy, pronunciation, fluency, aiFeedback, suggestion, b.audio_url || null, now).run();
      }

      return json({
        ok: true,
        scores: { accuracy, pronunciation, fluency, overall },
        tier,
        lang_mismatch: sc.langMismatch,
        acoustic: sc.acoustic,   // 🎧 true=음향 기반 채점, false=텍스트만(구 whisper 폴백 등). 보정 확인용
        phoneme: !!sc.phoneme,   // 🎤 true=Azure 음소 발음평가 반영(소리를 «직접» 잰 점수)
        // 어느 단어가 틀렸는지 — Azure 가 있을 때만. 학생 화면에서 그 단어만 짚어 줄 수 있다.
        word_scores: (b?.azure && Array.isArray(b.azure.words)) ? b.azure.words.slice(0, 40) : null,
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
  return null;
}
