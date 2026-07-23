/*!
 * 🎤 mangoi-voice-input.js — 녹음 → 서버 Whisper 전사 (브라우저 음성인식의 폴백/정확 모드)
 *
 * 왜 필요한가 (2026-07-23):
 *   webkitSpeechRecognition 은 **앱 WebView·카카오 인앱 브라우저·구형 iOS 에 아예 없다.**
 *   그동안 그 학생들에게는 "이 브라우저는 지원하지 않아요" 안내만 나가서 마이크를 못 썼다.
 *   서버에는 이미 /api/voice/transcribe (Workers AI @cf/openai/whisper) 가 살아 있다.
 *   Whisper 는 한국 학생의 억양 섞인 영어에도 브라우저 인식보다 강하고, 우리가 녹음 길이를
 *   직접 통제하므로 "말 중간에 꺼지는" 문제도 없다.
 *
 * ⚠️ 브라우저 음성인식과 **동시에 쓰지 말 것.** 안드로이드 일부 기기는 오디오 입력 세션을
 *    하나만 허용해서, 병행하면 오히려 음성인식이 죽는다. 반드시 둘 중 하나만.
 *
 * 사용:
 *   MangoiVoice.supported()                     // 이 브라우저에서 녹음이 가능한가
 *   MangoiVoice.record({ onState, maxMs, silenceMs }) -> Promise<string>   // 전사 텍스트
 *   MangoiVoice.stop()                          // 사용자가 ⏹ 를 누른 경우 (지금까지 녹음분으로 전사)
 *   MangoiVoice.cancel()                        // 취소 (전사하지 않음)
 *
 * onState(state, info) 로 화면에 상태를 표시한다:
 *   'ready'    마이크 권한 요청 중
 *   'waiting'  말을 기다리는 중 (아직 소리 없음)
 *   'speaking' 말하는 중
 *   'thinking' 전사 중 (서버 대기)
 *   'error'    실패 — info.reason = 'unsupported' | 'denied' | 'no_audio' | 'server'
 */
(function () {
  'use strict';

  var cur = null;   // 진행 중인 녹음 세션

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  function stopTracks(stream) {
    try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
  }

  /**
   * 녹음 → 전사. 말이 끝나고 조용해지면 스스로 멈춘다.
   * @returns {Promise<string>} 전사된 텍스트 (실패하면 빈 문자열)
   */
  function record(opts) {
    opts = opts || {};
    var onState = typeof opts.onState === 'function' ? opts.onState : function () {};
    var MAX_MS      = opts.maxMs      || 20000;   // 안전 상한
    var SILENCE_MS  = opts.silenceMs  || 2500;    // 말이 끝난 뒤 이만큼 조용하면 종료
    var FIRST_MS    = opts.firstMs    || 9000;    // 첫 마디를 기다리는 시간 (아이들은 오래 뜸들인다)

    if (!supported()) { onState('error', { reason: 'unsupported' }); return Promise.resolve(''); }
    if (cur) { try { cur.cancel(); } catch (e) {} }

    return new Promise(function (resolve) {
      /* ⏹ 는 **언제 눌러도** 들어야 한다.
         (2026-07-23) 예전에는 stop/cancel 을 getUserMedia 가 끝난 뒤에야 붙여서,
         마이크 권한 대기 중에 ⏹ 를 누르면 아무 반응이 없고 버튼이 '듣는 중'에 굳었다.
         → 지금 바로 정의해 두고, 녹음기가 준비되면 밀린 요청을 반영한다. */
      var session = { canceled: false, wantStop: false, _stopRec: null };
      session.stop = function () { session.wantStop = true; if (session._stopRec) session._stopRec(); };
      session.cancel = function () { session.canceled = true; session.wantStop = true; if (session._stopRec) session._stopRec(); };
      cur = session;
      var finished = false;
      function finish(text) {
        if (finished) return; finished = true;
        if (cur === session) cur = null;
        resolve(text || '');
      }

      onState('ready', {});
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }).then(function (stream) {
        if (session.canceled) { stopTracks(stream); return finish(''); }

        /* 🍎 iOS 사파리는 webm 을 못 만들고 audio/mp4 로 녹음한다.
           형식을 확인하지 않고 무조건 'speech.webm' 으로 보내면 서버가 형식을 오인할 수 있다.
           → 이 브라우저가 실제로 지원하는 형식을 골라 쓰고, 파일 이름도 그 형식에 맞춘다. */
        var chunks = [], mr, pickedMime = '';
        try {
          var CAND = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
          if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
            for (var ci = 0; ci < CAND.length; ci++) {
              if (MediaRecorder.isTypeSupported(CAND[ci])) { pickedMime = CAND[ci]; break; }
            }
          }
        } catch (e) { pickedMime = ''; }
        try { mr = pickedMime ? new MediaRecorder(stream, { mimeType: pickedMime }) : new MediaRecorder(stream); }
        catch (e) { try { mr = new MediaRecorder(stream); } catch (e2) { stopTracks(stream); onState('error', { reason: 'unsupported' }); return finish(''); } }

        var stopped = false, heardSpeech = false, silenceTimer = null, maxTimer = null, firstTimer = null;
        var ac = null, raf = null;

        function clearTimers() {
          if (silenceTimer) clearTimeout(silenceTimer);
          if (maxTimer) clearTimeout(maxTimer);
          if (firstTimer) clearTimeout(firstTimer);
          if (raf) cancelAnimationFrame(raf);
          silenceTimer = maxTimer = firstTimer = raf = null;
        }
        function stopRec() {
          if (stopped) return; stopped = true;
          clearTimers();
          try { mr.stop(); } catch (e) {}
          try { if (ac) ac.close(); } catch (e) {}
        }
        session._stopRec = stopRec;

        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          stopTracks(stream);
          if (session.canceled) return finish('');
          var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' });
          if (!blob.size || blob.size < 1200) { onState('error', { reason: 'no_audio' }); return finish(''); }
          onState('thinking', {});
          // 실제 녹음 형식에 맞는 파일 이름으로 보낸다 (iOS = mp4/m4a, 그 외 = webm)
          var bt = String(blob.type || pickedMime || '');
          var ext = /mp4|aac|m4a/i.test(bt) ? 'm4a' : (/ogg/i.test(bt) ? 'ogg' : 'webm');
          var fd = new FormData();
          fd.append('audio', blob, 'speech.' + ext);
          fetch('/api/voice/transcribe', { method: 'POST', body: fd })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              if (session.canceled) return finish('');
              if (!d || !d.ok) { onState('error', { reason: 'server' }); return finish(''); }
              finish(String(d.text || '').trim());
            })
            .catch(function () { onState('error', { reason: 'server' }); finish(''); });
        };

        try { mr.start(); } catch (e) { stopTracks(stream); onState('error', { reason: 'unsupported' }); return finish(''); }
        // 준비되는 동안 ⏹(또는 취소)를 눌렀으면 지금 반영한다
        if (session.wantStop) { stopRec(); return; }
        onState('waiting', {});
        maxTimer = setTimeout(stopRec, MAX_MS);
        firstTimer = setTimeout(function () { if (!heardSpeech) stopRec(); }, FIRST_MS);

        /* 말이 끝났는지 판정 — 소리 크기를 보고 조용해지면 종료.
           AudioContext 를 못 쓰는 환경이면 상한(MAX_MS)까지 녹음하고 끝낸다. */
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          ac = new AC();
          var src = ac.createMediaStreamSource(stream);
          var an = ac.createAnalyser();
          an.fftSize = 1024;
          src.connect(an);
          var buf = new Uint8Array(an.fftSize);
          var tick = function () {
            if (stopped) return;
            an.getByteTimeDomainData(buf);
            var peak = 0;
            for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i] - 128); if (v > peak) peak = v; }
            if (peak > 8) {                       // 사람 목소리로 볼 만한 크기
              if (!heardSpeech) { heardSpeech = true; onState('speaking', {}); }
              if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
            } else if (heardSpeech && !silenceTimer) {
              silenceTimer = setTimeout(stopRec, SILENCE_MS);
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        } catch (e) { /* 소리 분석 불가 — 상한까지 녹음 */ }
      }).catch(function (err) {
        var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        onState('error', { reason: denied ? 'denied' : 'unsupported' });
        finish('');
      });
    });
  }

  function stop()   { if (cur && cur.stop) try { cur.stop(); } catch (e) {} }
  function cancel() { if (cur && cur.cancel) try { cur.cancel(); } catch (e) {} }
  function busy()   { return !!cur; }

  window.MangoiVoice = { supported: supported, record: record, stop: stop, cancel: cancel, busy: busy };
})();
