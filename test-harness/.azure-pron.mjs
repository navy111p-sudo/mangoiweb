// cloudflare-deploy/src/azure-pronunciation.ts
var AZURE_TUNING = {
  /* 종합은 «또렷함 + 이 값» 을 넘지 못한다.
     🔑 음소 근거가 있을 때만 건다. 글자가 맞아도 소리가 엉망이면 «좋아요» 라고 하지 않기 위함.
        (Whisper 확신도는 근거가 약해서 이 상한을 걸지 않는다 — 억울한 학생이 생긴다) */
  OVERALL_CAP_OVER_PRON: 30,
  /** 이 초 이상이면 Azure 에 보내지 않는다(짧은오디오 REST 한도는 발음평가 30초). */
  MAX_SECONDS: 28,
  /** Azure 응답을 기다리는 최대 시간(ms). 넘으면 포기하고 Whisper 채점으로 간다. */
  TIMEOUT_MS: 8e3
};
function b64utf8(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const CHUNK = 32768;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}
function azureLocale(lang) {
  const m = {
    en: "en-US",
    "en-us": "en-US",
    "en-gb": "en-GB",
    ko: "ko-KR",
    zh: "zh-CN",
    "zh-cn": "zh-CN",
    ja: "ja-JP"
  };
  return m[String(lang || "").toLowerCase()] || null;
}
function wavSeconds(buf) {
  try {
    const dv = new DataView(buf);
    if (dv.byteLength < 44) return null;
    if (dv.getUint32(0, false) !== 1380533830 || dv.getUint32(8, false) !== 1463899717) return null;
    const byteRate = dv.getUint32(28, true);
    if (!byteRate) return null;
    return (dv.byteLength - 44) / byteRate;
  } catch {
    return null;
  }
}
async function assessPronunciation(env, audio, reference, lang) {
  const key = String(env?.AZURE_SPEECH_KEY || "").trim();
  const region = String(env?.AZURE_SPEECH_REGION || "").trim().toLowerCase();
  if (!key || !region) return { ok: false, reason: key ? "no_region" : "no_key" };
  const locale = azureLocale(lang);
  if (!locale) return { ok: false, reason: "lang_unsupported:" + lang };
  const ref = String(reference || "").trim();
  if (!ref) return { ok: false, reason: "no_reference" };
  const secs = wavSeconds(audio);
  if (secs === null) return { ok: false, reason: "not_wav" };
  if (secs > AZURE_TUNING.MAX_SECONDS) return { ok: false, reason: "too_long" };
  const paCfg = b64utf8(JSON.stringify({
    ReferenceText: ref.slice(0, 500),
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    EnableMiscue: true
  }));
  const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale)}&format=detailed`;
  const bodyCopy = audio.slice(0);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), AZURE_TUNING.TIMEOUT_MS);
  if (key.length < 20) return { ok: false, reason: "key_too_short" };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
        "Pronunciation-Assessment": paCfg,
        "Accept": "application/json"
      },
      body: bodyCopy,
      signal: ctl.signal
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
      console.warn("[azure-pron] http", res.status, body);
      const hint = [
        res.headers.get("content-type") || "",
        res.headers.get("content-length") || "",
        res.headers.get("apim-err-reason") || res.headers.get("x-requestid") || ""
      ].filter(Boolean).join("|").slice(0, 100);
      return { ok: false, reason: "http_" + res.status + (body ? " " + body : "") + (hint ? " [" + hint + "]" : "") };
    }
    const d = await res.json();
    if (String(d?.RecognitionStatus || "") !== "Success") {
      console.warn("[azure-pron] status", d?.RecognitionStatus);
      return { ok: false, reason: "recog_" + String(d?.RecognitionStatus || "unknown") };
    }
    const best = Array.isArray(d?.NBest) ? d.NBest[0] : null;
    const pa = best?.PronunciationAssessment;
    if (!pa) {
      const heard = String(best?.Display || d?.DisplayText || "").slice(0, 60);
      try {
        const r2 = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
            "Accept": "application/json;text/xml",
            "Pronunciation-Assessment": b64utf8(JSON.stringify({
              ReferenceText: ref.slice(0, 500),
              GradingSystem: "HundredMark",
              Granularity: "Phoneme"
            }))
          },
          body: audio.slice(0)
        });
        if (r2.ok) {
          const d2 = await r2.json();
          const b2 = Array.isArray(d2?.NBest) ? d2.NBest[0] : null;
          const pa2 = b2?.PronunciationAssessment;
          if (pa2) {
            const n2 = (v) => {
              const x = Number(v);
              return isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0;
            };
            return {
              ok: true,
              accuracy: n2(pa2.AccuracyScore),
              fluency: n2(pa2.FluencyScore),
              completeness: n2(pa2.CompletenessScore),
              pron: n2(pa2.PronScore),
              text: String(b2?.Display || d2?.DisplayText || "").trim(),
              words: Array.isArray(b2?.Words) ? b2.Words.slice(0, 40).map((w) => ({
                word: String(w?.Word || ""),
                accuracy: n2(w?.PronunciationAssessment?.AccuracyScore),
                errorType: w?.PronunciationAssessment?.ErrorType || void 0
              })) : []
            };
          }
          return { ok: false, reason: `no_assessment2 heard="${heard}"` };
        }
        return { ok: false, reason: `no_assessment retry_http_${r2.status} heard="${heard}"` };
      } catch (e2) {
        return { ok: false, reason: `no_assessment retry_throw heard="${heard}"` };
      }
    }
    const num = (v) => {
      const n = Number(v);
      return isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    };
    const words = Array.isArray(best?.Words) ? best.Words.slice(0, 40).map((w) => ({
      word: String(w?.Word || ""),
      accuracy: num(w?.PronunciationAssessment?.AccuracyScore),
      errorType: w?.PronunciationAssessment?.ErrorType || void 0
    })) : [];
    return {
      ok: true,
      accuracy: num(pa.AccuracyScore),
      fluency: num(pa.FluencyScore),
      completeness: num(pa.CompletenessScore),
      pron: num(pa.PronScore),
      text: String(best?.Display || d?.DisplayText || "").trim(),
      words
    };
  } catch (e) {
    console.warn("[azure-pron] failed:", e?.name === "AbortError" ? "timeout" : e?.message || e);
    return { ok: false, reason: e?.name === "AbortError" ? "timeout" : "error " + String(e?.message || e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}
export {
  AZURE_TUNING,
  assessPronunciation,
  azureLocale,
  wavSeconds
};
