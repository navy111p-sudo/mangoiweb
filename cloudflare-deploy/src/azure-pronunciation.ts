// ═══════════════════════════════════════════════════════════════════════
// 🎤 Azure AI Speech — 발음평가(Pronunciation Assessment)
//
// 왜 붙였나 (2026-08-08)
//   지금까지 «또렷함» 은 Whisper 의 avg_logprob 으로 쟀다. 그건 발음이 아니라
//   **«Whisper 가 자기 전사를 얼마나 확신하는가»** 다. Whisper 는 언어모델이라
//   흔한 문장은 문맥으로 메워서 웅얼거려도 확신한다.
//     실측(2026-08-08, 사장님 녹음 20건):
//       "Thank you very much for your help."  또렷 -0.286 / 뭉갬 -0.374  ← 차이 없음
//       "I love studying English with Mangoi." 또렷 -0.436 / 뭉갬 -0.817  ← 크게 벌어짐
//     차이는 발음 실력이 아니라 «Mangoi 가 Whisper 가 모르는 단어» 라는 것뿐이었다.
//   → 상수를 어떻게 조정해도 «흔한 문장을 뭉갠 경우» 는 못 잡는다. 자(尺)를 바꿔야 한다.
//   Azure 발음평가는 **음소(phoneme) 단위로 소리를 직접** 잰다. 문맥으로 못 메운다.
//
// 왜 Azure 인가 (2026-08-08 비교)
//   · **초 단위 과금.** 우리 발화는 3~7초인데 경쟁사(Speechace·SpeechSuper·
//     Language Confidence)는 «15초 블록/건당» 이라 5초를 말해도 15초 값을 낸다.
//   · **중국어·한국어 지원.** speech-coach-cn.html 을 이미 운영 중이다(Speechace 는 영어뿐).
//   · **한국 리전(koreacentral).** 학생 목소리가 국외로 안 나간다.
//   · **REST 로 호출된다.** SDK/WebSocket 이면 Cloudflare Worker 에서 못 썼다.
//
// ⛔ 이 파일은 «없으면 없는 대로» 동작해야 한다.
//   키가 없거나 Azure 가 실패하면 **반드시 null 을 돌려주고 예외를 던지지 않는다.**
//   그러면 호출부는 지금까지의 Whisper 채점으로 그대로 굴러간다. 발음평가는 «덤» 이지
//   수업을 세울 이유가 아니다.
//
// ⚠️ 오디오 형식 — Azure 짧은오디오 REST 는 **webm 을 받지 않는다.**
//   브라우저 MediaRecorder 기본값이 webm/opus 라, 프론트에서 16kHz mono WAV 로 녹음해
//   보낸다(speech-coach.html). WAV 가 아니면 여기서 조용히 건너뛴다.
// ═══════════════════════════════════════════════════════════════════════

/** 조정용 상수 — Azure 점수를 우리 점수판에 어떻게 얹을지. 여기만 고치면 된다. */
export const AZURE_TUNING = {
  /* 종합은 «또렷함 + 이 값» 을 넘지 못한다.
     🔑 음소 근거가 있을 때만 건다. 글자가 맞아도 소리가 엉망이면 «좋아요» 라고 하지 않기 위함.
        (Whisper 확신도는 근거가 약해서 이 상한을 걸지 않는다 — 억울한 학생이 생긴다) */
  OVERALL_CAP_OVER_PRON: 30,
  /** 이 초 이상이면 Azure 에 보내지 않는다(짧은오디오 REST 한도는 발음평가 30초). */
  MAX_SECONDS: 28,
  /** Azure 응답을 기다리는 최대 시간(ms). 넘으면 포기하고 Whisper 채점으로 간다. */
  TIMEOUT_MS: 8000,
};

export interface AzureWordScore {
  word: string;
  accuracy: number;
  /** omission=빠뜨림 · insertion=없는 말 추가 · mispronunciation=틀리게 발음 */
  errorType?: string;
}

/* 🔍 «왜 발음평가가 안 붙었나» 를 화면에서 바로 알 수 있게 사유를 돌려준다 (2026-08-08).
   이게 없으면 실패가 전부 «조용한 null» 이라, 키가 틀린 건지 소리를 못 알아들은 건지
   구분이 안 된다. 실제로 붙이는 날 밤에 그 구분이 안 돼서 한참을 헤맸다.
   ⛔ 키·응답 본문 같은 민감한 값은 절대 담지 않는다. 사유 «이름» 뿐이다. */
export interface AzurePronFail { ok: false; reason: string; }

export interface AzurePronResult {
  ok: true;
  /** 음소 단위 발음 정확도 0~100 — 이게 «또렷함» 을 대체한다 */
  accuracy: number;
  /** 끊김·머뭇거림 0~100 */
  fluency: number;
  /** 모범 문장 중 실제로 발음한 비율 0~100 */
  completeness: number;
  /** Azure 종합 발음점수 0~100 */
  pron: number;
  /** Azure 가 알아들은 텍스트(참고용 — 채점의 «정확도» 축은 여전히 Whisper 전사를 쓴다) */
  text: string;
  /** 단어별 점수 — 어느 단어가 틀렸는지 학생에게 보여주기 위함 */
  words: AzureWordScore[];
}

/** UTF-8 을 그대로 base64 로. 🪤 btoa 는 한글·중국어에서 그냥 던진다(문자코드 255 초과). */
function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
  }
  return btoa(bin);
}

/** 우리 언어코드 → Azure 로케일. 지원 밖이면 null(=발음평가 건너뜀). */
export function azureLocale(lang: string): string | null {
  const m: Record<string, string> = {
    en: 'en-US', 'en-us': 'en-US', 'en-gb': 'en-GB',
    ko: 'ko-KR', zh: 'zh-CN', 'zh-cn': 'zh-CN', ja: 'ja-JP',
  };
  return m[String(lang || '').toLowerCase()] || null;
}

/** 16kHz 16bit mono WAV 의 길이(초). 헤더를 못 읽으면 null. */
export function wavSeconds(buf: ArrayBuffer): number | null {
  try {
    const dv = new DataView(buf);
    if (dv.byteLength < 44) return null;
    // "RIFF" .... "WAVE"
    if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null;
    const byteRate = dv.getUint32(28, true);          // fmt 청크의 byteRate
    if (!byteRate) return null;
    return (dv.byteLength - 44) / byteRate;
  } catch { return null; }
}

/**
 * Azure 발음평가 호출. **실패는 전부 null** — 호출부는 그대로 Whisper 채점을 쓴다.
 *
 * @param env      Worker env (AZURE_SPEECH_KEY · AZURE_SPEECH_REGION 시크릿)
 * @param audio    WAV(PCM) 바이트. webm 등 다른 형식이면 호출부에서 걸러 보내지 말 것.
 * @param reference 모범 문장. Azure 는 이 문장의 음소와 실제 소리를 맞춰 본다.
 * @param lang     'en' | 'ko' | 'zh' …
 */
export async function assessPronunciation(
  env: any, audio: ArrayBuffer, reference: string, lang: string,
): Promise<AzurePronResult | AzurePronFail> {
  const key = String(env?.AZURE_SPEECH_KEY || '').trim();
  const region = String(env?.AZURE_SPEECH_REGION || '').trim().toLowerCase();
  if (!key || !region) return { ok: false, reason: key ? 'no_region' : 'no_key' };
  const locale = azureLocale(lang);
  if (!locale) return { ok: false, reason: 'lang_unsupported:' + lang };
  const ref = String(reference || '').trim();
  if (!ref) return { ok: false, reason: 'no_reference' };

  const secs = wavSeconds(audio);
  if (secs === null) return { ok: false, reason: 'not_wav' };   // Azure 는 webm 을 못 받는다
  if (secs > AZURE_TUNING.MAX_SECONDS) return { ok: false, reason: 'too_long' };

  /* 🔑 Granularity: 'Phoneme' — 음소까지 받아야 «어느 소리가 틀렸나» 를 말해 줄 수 있다.
     🔑 EnableMiscue: true — 빠뜨린 단어·없는 단어를 잡는다. 이게 없으면 «절반만 읽어도 만점».
     ⛔ 이 ReferenceText 를 **Whisper 쪽으로 넘기면 안 된다.** 2026-07-29 에 모범 문장을
        Whisper initial_prompt 로 넣었다가, 발음이 엉망이어도 정답이 그대로 전사돼
        텍스트 채점기가 늘 100점을 줬다. Azure 는 소리를 직접 재므로 안전하지만,
        전사 경로와는 반드시 분리해서 쓴다. */
  const paCfg = b64utf8(JSON.stringify({
    ReferenceText: ref.slice(0, 500),
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: true,
  }));

  const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`
    + `?language=${encodeURIComponent(locale)}&format=detailed`;

  /* 🔴 (2026-08-08 실측) **오디오 사본을 반드시 따로 뜬다.**
     호출부는 같은 ArrayBuffer 를 Whisper 전사에도 쓰고, 우리는 그걸 «동시에» 보낸다.
     원본을 그대로 body 로 넘기면 두 소비자가 같은 버퍼를 물어 Azure 쪽 본문이 깨지고,
     Azure 는 **본문도 헤더도 없는 400** 만 돌려준다 — 원인을 짚을 단서가 하나도 안 남는다.
     (재시도로 확인하려다 «Network connection lost» 까지 겹쳐 한참 헤맸다.)
     slice(0) 는 여기서 «동기» 로 실행되므로 Whisper 가 버퍼를 만지기 전에 복사가 끝난다. */
  const bodyCopy = audio.slice(0);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), AZURE_TUNING.TIMEOUT_MS);

  /* 🪤 (2026-08-08) 키가 짧게 들어가도 Azure 는 **본문 없는 400** 만 준다 — 401 이 아니다.
     그래서 «키가 틀렸다» 는 걸 응답만 봐서는 알 수 없었다(붙여넣기 실패로 2글자가 들어가
     있었는데 한참 못 찾았다). 명백히 틀린 길이는 여기서 미리 잘라 사유로 알려 준다.
     ⛔ 키 «값» 은 어디에도 담지 않는다. 길이 판정만 한다. */
  if (key.length < 20) return { ok: false, reason: 'key_too_short' };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment': paCfg,
        'Accept': 'application/json',
      },
      body: bodyCopy,
      signal: ctl.signal,
    });
    if (!res.ok) {
      /* Azure 가 «왜» 거절했는지는 본문에만 있다. 로그는 표본에서 빠지면 안 보이므로
         사유에 짧게 실어 보낸다(160자). ⛔ 본문에 키는 들어가지 않는다 — 오류 설명뿐이다. */
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      console.warn('[azure-pron] http', res.status, body);
      /* 🔬 400 은 본문이 비어 오는 일이 많다. 그러면 «헤더가 문제인가 / 오디오가 문제인가» 를
         알 수 없다. 발음평가 헤더만 빼고 한 번 더 찔러 보면 그 둘이 갈린다.
         한 번뿐이고 400 일 때만 한다(정상 경로에는 왕복이 늘지 않는다). */
      /* 본문이 비어 오는 400 이 있다. 그럴 땐 헤더에 단서가 남는다(게이트웨이가 막았는지 등).
         ⛔ 여기서 재시도하지 말 것 — 같은 요청을 한 번 더 보내면 Workers 가
            «Network connection lost» 를 던져 진짜 원인을 덮어 버린다(2026-08-08 실측). */
      const hint = [
        res.headers.get('content-type') || '',
        res.headers.get('content-length') || '',
        res.headers.get('apim-err-reason') || res.headers.get('x-requestid') || '',
      ].filter(Boolean).join('|').slice(0, 100);
      return { ok: false, reason: 'http_' + res.status + (body ? ' ' + body : '') + (hint ? ' [' + hint + ']' : '') };
    }
    const d: any = await res.json();
    // RecognitionStatus: Success | NoMatch | InitialSilenceTimeout | ...
    if (String(d?.RecognitionStatus || '') !== 'Success') {
      console.warn('[azure-pron] status', d?.RecognitionStatus);
      // 🔑 여기까지 왔다는 건 «키는 통과했고 소리를 못 알아들었다» 는 뜻이다. 진단에서 아주 중요.
      return { ok: false, reason: 'recog_' + String(d?.RecognitionStatus || 'unknown') };
    }
    const best = Array.isArray(d?.NBest) ? d.NBest[0] : null;
    const pa = best?.PronunciationAssessment;
    if (!pa) return { ok: false, reason: 'no_assessment' };

    const num = (v: any) => {
      const n = Number(v);
      return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    };
    const words: AzureWordScore[] = Array.isArray(best?.Words)
      ? best.Words.slice(0, 40).map((w: any) => ({
          word: String(w?.Word || ''),
          accuracy: num(w?.PronunciationAssessment?.AccuracyScore),
          errorType: w?.PronunciationAssessment?.ErrorType || undefined,
        }))
      : [];

    return {
      ok: true,
      accuracy: num(pa.AccuracyScore),
      fluency: num(pa.FluencyScore),
      completeness: num(pa.CompletenessScore),
      pron: num(pa.PronScore),
      text: String(best?.Display || d?.DisplayText || '').trim(),
      words,
    };
  } catch (e: any) {
    // 타임아웃(abort) 포함 — 전부 «없던 일» 로 만들고 Whisper 채점으로 돌아간다
    console.warn('[azure-pron] failed:', e?.name === 'AbortError' ? 'timeout' : (e?.message || e));
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : ('error ' + String(e?.message || e).slice(0, 120)) };
  } finally {
    clearTimeout(timer);
  }
}
