/*!
 * 🎤 mangoi-voice-input.js — 녹음 → 서버 Whisper 전사 (브라우저 음성인식의 폴백/정확 모드)
 *   브라우저 인식이 없는 앱 WebView·인앱·구형 iOS 도 마이크를 쓰게(2026-07-23). 내력: docs/작업기록/261105_*.
 * ⚠️ 브라우저 음성인식과 **동시에 쓰지 말 것** — 일부 안드로이드는 입력 세션이 하나뿐이라 둘 다 죽는다.
 *
 * 사용:
 *   MangoiVoice.supported()                     // 이 브라우저에서 녹음이 가능한가
 *   MangoiVoice.record({ onState, maxMs, silenceMs, lang }) -> Promise<string>   // 전사 텍스트
 *     lang: 서버 Whisper 언어 힌트 ('en'|'ko'|'zh' 등). 안 주면 옛 자동감지 모델로 떨어져
 *           "I like dog" 같은 짧은 영어를 한국어로 오인식할 수 있다(2026-07-24 사고 재발 방지).
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

  /* 🔇 말소리/조용함 판정(2026-11-05) — 고정 문턱(peak>8)만 보면 폰 자동음량이 키운 소음이 늘 «말소리» 라
     시끄러운 곳에서 20초(상한)까지 녹음됐다. 최근 3초 «소음 바닥»(0.2초 칸 최솟값)에 맞춰 가른다.
     바닥이 낮은 조용한 방은 예전(>8 / ≤8)과 같다. 1 말소리 · -1 조용 · 0 애매(그대로 둠). */
  function endGate() {
    var mins = [], cur = 1e9, t0 = -1;
    return function (p, now) {
      if (t0 < 0) t0 = now;
      if (now - t0 >= 200) { mins.push(cur); if (mins.length > 15) mins.shift(); cur = 1e9; t0 = now; }
      if (p < cur) cur = p;
      var f = Math.min.apply(null, mins.concat(cur));
      return p > Math.max(8, f * 3) ? 1 : (p <= Math.max(8, f * 2) ? -1 : 0);
    };
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
      /* ⏹ 는 권한 대기 중에도 들어야 한다(2026-07-23 — 늦게 붙이면 '듣는 중'에 굳었다). 지금 정의, 준비되면 반영. */
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

        /* 🍎 iOS 사파리는 webm 대신 mp4 — 지원 형식을 골라 쓰고 파일 이름도 맞춘다(서버 형식 오인 방지). */
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
          if (typeof opts.onAudio === 'function') { try { opts.onAudio(blob); } catch (e) {} }
          onState('thinking', {});
          var bt = String(blob.type || pickedMime || '');
          var ext = /mp4|aac|m4a/i.test(bt) ? 'm4a' : (/ogg/i.test(bt) ? 'ogg' : 'webm');
          var fd = new FormData();
          fd.append('audio', blob, 'speech.' + ext);
          if (opts.lang) fd.append('lang', opts.lang);
          var upload = typeof opts.transcribe === 'function'
            ? Promise.resolve().then(function(){ if(session.canceled)return null; return opts.transcribe(fd); })
            : fetch('/api/voice/transcribe', { method: 'POST', body: fd }).then(function (r) { return r.ok ? r.json() : null; });
          upload
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

        /* 말 끝 판단(endGate) — AudioContext 가 없으면 상한(MAX_MS)까지 녹음. */
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          ac = new AC();
          var src = ac.createMediaStreamSource(stream);
          var an = ac.createAnalyser();
          an.fftSize = 1024;
          src.connect(an);
          var buf = new Uint8Array(an.fftSize), gate = endGate();
          var tick = function () {
            if (stopped) return;
            an.getByteTimeDomainData(buf);
            var peak = 0;
            for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i] - 128); if (v > peak) peak = v; }
            var st = gate(peak, Date.now());
            if (st > 0) {                         // 말소리(소음 바닥보다 확실히 큼)
              if (!heardSpeech) { heardSpeech = true; onState('speaking', {}); }
              if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
            } else if (st < 0 && heardSpeech && !silenceTimer) {
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
