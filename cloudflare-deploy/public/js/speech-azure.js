/* ═══════════════════════════════════════════════════════════════════════
   speech-azure.js — Azure 발음평가 공용 서비스 계층 (2026-08-10)
   EN: Single service layer for Azure Speech pronunciation assessment.
       Used by speech-coach.html (en-US) and speech-coach-cn.html (zh-CN).
   KO: Azure 발음평가 호출을 이 파일 하나로 모은다 — 화면(컴포넌트)에서
       SDK 를 직접 부르지 않는다. 영어·중국어 코치 두 화면이 공유한다.

   책임 / Responsibilities:
   - SDK 지연 로드(369KB — 평가 직전 1회만) / lazy-load SDK once
   - 10분 임시 토큰(/api/voice/azure-token) — 구독 키는 절대 프론트에 없다
     / short-lived auth token only; subscription key never reaches the browser
   - VAD 묵음 트리밍 — 과금은 «전송한 오디오 초» 단위라 침묵을 돈 주고 보내지 않는다
     / trim leading·trailing silence so we never pay for silence
   - 과금 시간 집계 — 문장별 예상 과금 초 콘솔 출력 + 세션 누적(SpeechAzure.billing)
     / per-utterance billed-seconds console log + session totals
   - Prosody(운율) 평가 활성화 / prosody assessment enabled

   ⚠️ 이 파일은 «순수 서비스» 다 — DOM 을 만지지 않는다. UI 는 각 화면이 그린다.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── 상수 / constants (매직넘버 금지) ── */
  var SDK_URL = '/vendor/azure-speech-sdk.js?v=1';
  var TOKEN_URL = '/api/voice/azure-token';
  var TOKEN_REFRESH_MS = 8 * 60 * 1000;   // 실제 유효 10분 — 경계 만료 방지로 8분마다 갱신
  var SAMPLE_RATE = 16000;                // 16kHz mono PCM — Azure·Whisper 공통 입력
  var BYTES_PER_SAMPLE = 2;               // 16-bit
  var WAV_HEADER_BYTES = 44;
  var MAX_UTTER_SECONDS = 15;             // 문장 단위 상한 — 60초 초과 절대 금지(과금 단가 절벽)
  var VAD_FRAME_MS = 20;                  // 무음 판정 프레임
  var VAD_RMS_THRESHOLD = 0.012;          // 이 RMS 미만이면 무음으로 본다(16kHz PCM 정규화 기준)
  var VAD_PAD_MS = 150;                   // 발화 앞뒤로 남겨 두는 여유(자음 앞머리 보호)

  var _sdkPromise = null;
  var _token = null, _tokenAt = 0;

  /* ── SDK 지연 로드 / lazy-load ── */
  function loadSdk() {
    if (window.SpeechSDK) return Promise.resolve(window.SpeechSDK);
    if (!_sdkPromise) _sdkPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = SDK_URL;
      s.onload = function () { window.SpeechSDK ? res(window.SpeechSDK) : rej(new Error('sdk_no_global')); };
      s.onerror = function () { rej(new Error('sdk_load_failed')); };
      document.head.appendChild(s);
    });
    return _sdkPromise;
  }

  /* ── 토큰 / auth token (10분 유효 — 8분 캐시) ── */
  function getToken() {
    if (_token && (Date.now() - _tokenAt) < TOKEN_REFRESH_MS) return Promise.resolve(_token);
    return fetch(TOKEN_URL).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok || !d.token) throw new Error((d && d.error) || 'token_failed');
      _token = d; _tokenAt = Date.now();
      return _token;
    });
  }

  /* ── WAV 길이(초) = 과금 기준 / billed seconds of a 16k mono 16-bit WAV ── */
  function wavSeconds(blobOrBytes) {
    var bytes = typeof blobOrBytes === 'number' ? blobOrBytes : (blobOrBytes && blobOrBytes.size) || 0;
    var data = Math.max(0, bytes - WAV_HEADER_BYTES);
    return data / BYTES_PER_SAMPLE / SAMPLE_RATE;
  }

  /* ── VAD 묵음 트리밍 / trim silence ──
     우리가 만든 WAV(44바이트 헤더 + 16k mono PCM16)만 다룬다. 형식이 다르거나
     파싱에 실패하면 «원본 그대로» 돌려준다 — 트리밍은 절약이지 필수가 아니다. */
  function trimWav(blob) {
    return blob.arrayBuffer().then(function (buf) {
      try {
        var dv = new DataView(buf);
        if (dv.getUint32(0, false) !== 0x52494646) return { blob: blob, rawSec: wavSeconds(blob), sec: wavSeconds(blob), trimmed: false }; // 'RIFF' 아님
        var pcm = new Int16Array(buf, WAV_HEADER_BYTES);
        var frame = SAMPLE_RATE * VAD_FRAME_MS / 1000;           // 프레임당 샘플 수
        var nFrames = Math.floor(pcm.length / frame);
        if (nFrames < 3) return { blob: blob, rawSec: wavSeconds(blob), sec: wavSeconds(blob), trimmed: false };
        var first = -1, last = -1;
        for (var f = 0; f < nFrames; f++) {
          var sum = 0, off = f * frame;
          for (var i = 0; i < frame; i++) { var v = pcm[off + i] / 32768; sum += v * v; }
          if (Math.sqrt(sum / frame) >= VAD_RMS_THRESHOLD) { if (first < 0) first = f; last = f; }
        }
        if (first < 0) return { blob: blob, rawSec: wavSeconds(blob), sec: wavSeconds(blob), trimmed: false }; // 전부 무음 — 판단은 호출부가
        var pad = Math.round(SAMPLE_RATE * VAD_PAD_MS / 1000);
        var s0 = Math.max(0, first * frame - pad);
        var s1 = Math.min(pcm.length, (last + 1) * frame + pad);
        if (s1 - s0 >= pcm.length) return { blob: blob, rawSec: wavSeconds(blob), sec: wavSeconds(blob), trimmed: false };
        var cut = pcm.slice(s0, s1);
        var out = new ArrayBuffer(WAV_HEADER_BYTES + cut.length * BYTES_PER_SAMPLE);
        var od = new DataView(out);
        var ws = function (o, str) { for (var i = 0; i < str.length; i++) od.setUint8(o + i, str.charCodeAt(i)); };
        ws(0, 'RIFF'); od.setUint32(4, 36 + cut.length * BYTES_PER_SAMPLE, true); ws(8, 'WAVE'); ws(12, 'fmt ');
        od.setUint32(16, 16, true); od.setUint16(20, 1, true); od.setUint16(22, 1, true);
        od.setUint32(24, SAMPLE_RATE, true); od.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
        od.setUint16(32, BYTES_PER_SAMPLE, true); od.setUint16(34, 16, true);
        ws(36, 'data'); od.setUint32(40, cut.length * BYTES_PER_SAMPLE, true);
        new Int16Array(out, WAV_HEADER_BYTES).set(cut);
        var tb = new Blob([out], { type: 'audio/wav' });
        return { blob: tb, rawSec: wavSeconds(blob), sec: wavSeconds(tb), trimmed: true };
      } catch (e) {
        return { blob: blob, rawSec: wavSeconds(blob), sec: wavSeconds(blob), trimmed: false };
      }
    });
  }

  /* ── 과금 집계 / billing meter ── */
  var billing = { calls: 0, seconds: 0 };
  function meterLog(sec, rawSec) {
    billing.calls += 1;
    billing.seconds += sec;
    var saved = Math.max(0, rawSec - sec);
    // EN: expected billed audio for this sentence + session total (cost tracking)
    console.log('[SpeechAzure] 이 문장 과금 오디오 ' + sec.toFixed(1) + 's'
      + (saved > 0.05 ? ' (묵음 컷 -' + saved.toFixed(1) + 's)' : '')
      + ' · 세션 누적 ' + billing.seconds.toFixed(1) + 's / ' + billing.calls + '회');
  }

  /* ── 발음 평가 / pronunciation assessment ──
     assess({ wavBlob, reference, locale, prosody })
     → { ok, accuracy, fluency, completeness, pron, prosody?, text, words[], billedSeconds }
     실패 시 { ok:false, reason } — 호출부는 반드시 폴백을 갖는다(평가는 «덤»이다). */
  function assess(opts) {
    var wavBlob = opts && opts.wavBlob, reference = opts && opts.reference, locale = opts && opts.locale;
    if (!wavBlob || String(wavBlob.type || '').indexOf('wav') < 0) return Promise.resolve({ ok: false, reason: 'not_wav' });
    if (!reference) return Promise.resolve({ ok: false, reason: 'no_reference' });
    if (!locale) return Promise.resolve({ ok: false, reason: 'lang_unsupported' });
    var sec = wavSeconds(wavBlob);
    if (sec > MAX_UTTER_SECONDS + 1) return Promise.resolve({ ok: false, reason: 'too_long_' + Math.round(sec) + 's' }); // 상한은 녹음쪽에서 이미 막는다 — 이건 최후 방벽
    var rec = null;
    return loadSdk().then(function (SDK) {
      return getToken().then(function (tk) {
        var cfg = SDK.SpeechConfig.fromAuthorizationToken(tk.token, tk.region);
        cfg.speechRecognitionLanguage = locale;
        // 🔑 Phoneme = 음소 단위 · 마지막 true = 빠뜨린/없는 단어 잡기(miscue — 없으면 «절반만 읽어도 만점»)
        var pac = new SDK.PronunciationAssessmentConfig(
          reference,
          SDK.PronunciationAssessmentGradingSystem.HundredMark,
          SDK.PronunciationAssessmentGranularity.Phoneme,
          true);
        // 🎵 운율(억양·강세·리듬) 평가 — SDK 1.33+ / prosody assessment (harmless no-op on older SDK)
        try { pac.enableProsodyAssessment = true; } catch (e) {}
        var audio = SDK.AudioConfig.fromWavFileInput(new File([wavBlob], 'rec.wav', { type: 'audio/wav' }));
        rec = new SDK.SpeechRecognizer(cfg, audio);
        pac.applyTo(rec);
        return new Promise(function (resolve, reject) { rec.recognizeOnceAsync(resolve, reject); }).then(function (res) {
          if (res.reason !== SDK.ResultReason.RecognizedSpeech) return { ok: false, reason: 'recog_' + res.reason };
          meterLog(sec, (opts && opts.rawSeconds) || sec);   // 인식이 실제 수행된 경우만 과금 집계
          var p = SDK.PronunciationAssessmentResult.fromResult(res);
          var n = function (v) { var x = Number(v); return isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0; };
          var raw = (p.detailResult && p.detailResult.Words) ? p.detailResult.Words : [];
          var prosody = (p.prosodyScore != null && isFinite(Number(p.prosodyScore))) ? n(p.prosodyScore) : null;
          return {
            ok: true,
            accuracy: n(p.accuracyScore), fluency: n(p.fluencyScore),
            completeness: n(p.completenessScore), pron: n(p.pronunciationScore),
            prosody: prosody,
            text: res.text || '',
            billedSeconds: Math.round(sec * 10) / 10,
            words: raw.slice(0, 40).map(function (w) {
              return {
                word: String(w.Word || ''),
                accuracy: n(w.PronunciationAssessment && w.PronunciationAssessment.AccuracyScore),
                errorType: (w.PronunciationAssessment && w.PronunciationAssessment.ErrorType) || undefined,
              };
            }),
          };
        });
      });
    }).catch(function (e) {
      return { ok: false, reason: 'sdk_' + String((e && (e.message || e.errorDetails)) || e).slice(0, 60) };
    }).finally(function () {
      try { if (rec) rec.close(); } catch (e) {}
    });
  }

  /* ── 16k mono WAV 녹음기 / recorder ──
     speech-coach.html 의 pcm 파이프라인을 서비스로 옮긴 것 — CN 화면 등 «녹음기가 없는»
     화면이 쓴다. ScriptProcessor 는 deprecated 지만 모듈 파일 없이 전 브라우저에서 돈다. */
  function createRecorder() {
    var ctx = null, node = null, src = null, buf = [], rate = 0;
    return {
      start: function (stream) {
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          ctx = new AC();
          rate = ctx.sampleRate || 48000;
          src = ctx.createMediaStreamSource(stream);
          node = ctx.createScriptProcessor(4096, 1, 1);
          buf = [];
          node.onaudioprocess = function (e) { buf.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
          src.connect(node); node.connect(ctx.destination);
          return true;
        } catch (e) { ctx = null; return false; }
      },
      stopToWav: function () {
        try {
          if (!ctx) return null;
          try { node.disconnect(); src.disconnect(); } catch (e) {}
          var parts = buf; buf = [];
          try { ctx.close(); } catch (e) {}
          ctx = null;
          var len = 0; parts.forEach(function (p) { len += p.length; });
          if (!len) return null;
          var flat = new Float32Array(len), o = 0;
          parts.forEach(function (p) { flat.set(p, o); o += p.length; });
          var ratio = rate / SAMPLE_RATE, nOut = Math.floor(flat.length / ratio);
          if (nOut < SAMPLE_RATE / 10) return null;              // 0.1초 미만 = 빈 녹음
          var pcm = new Int16Array(nOut);
          for (var i = 0; i < nOut; i++) {                        // 선형 보간 리샘플
            var x = i * ratio, i0 = Math.floor(x), i1 = Math.min(i0 + 1, flat.length - 1), t = x - i0;
            var v = flat[i0] * (1 - t) + flat[i1] * t;
            v = Math.max(-1, Math.min(1, v));
            pcm[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
          }
          var out = new ArrayBuffer(WAV_HEADER_BYTES + pcm.length * BYTES_PER_SAMPLE);
          var dv = new DataView(out);
          var ws = function (off, s) { for (var j = 0; j < s.length; j++) dv.setUint8(off + j, s.charCodeAt(j)); };
          ws(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * BYTES_PER_SAMPLE, true); ws(8, 'WAVE'); ws(12, 'fmt ');
          dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
          dv.setUint32(24, SAMPLE_RATE, true); dv.setUint32(28, SAMPLE_RATE * BYTES_PER_SAMPLE, true);
          dv.setUint16(32, BYTES_PER_SAMPLE, true); dv.setUint16(34, 16, true);
          ws(36, 'data'); dv.setUint32(40, pcm.length * BYTES_PER_SAMPLE, true);
          new Int16Array(out, WAV_HEADER_BYTES).set(pcm);
          return new Blob([out], { type: 'audio/wav' });
        } catch (e) { return null; }
      }
    };
  }

  window.SpeechAzure = {
    loadSdk: loadSdk,
    getToken: getToken,
    assess: assess,
    trimWav: trimWav,
    wavSeconds: wavSeconds,
    createRecorder: createRecorder,
    billing: billing,
    MAX_UTTER_SECONDS: MAX_UTTER_SECONDS,
  };
})();
