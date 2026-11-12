/*! MangoiVoice: record(opts)->Promise<string>, stop, cancel, busy, supported, post.
 * Recording fallback; do not run alongside browser SpeechRecognition on Android.
 * Blocking asset: keep size bounded. History and regression: voice_early_harness.mjs.
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

  function post(fd) {
    var ac = new AbortController(), timer;
    return Promise.race([
      fetch('/api/voice/transcribe', { method: 'POST', body: fd, signal: ac.signal }).then(function (r) { return r.ok ? r.json() : null; }),
      new Promise(function (_, reject) { timer = setTimeout(function () { ac.abort(); reject(new Error('timeout')); }, 30000); })
    ]).finally(function () { clearTimeout(timer); });
  }

  /* Adaptive noise floor; 1 speech, -1 quiet, 0 ambiguous. */
  function endGate() {
    var lows = [], a = 1e9, b = 1e9, t0 = -1, mid = 0;
    return function (p, now) {
      if (!p) { mid = 0; return -1; }
      if (t0 < 0 || now < t0) t0 = now;
      if (now - t0 >= 200) { lows.push(b < 1e9 ? b : a); if (lows.length > 15) lows.shift(); a = b = 1e9; t0 = now; }
      if (p < a) { b = a; a = p; } else if (p < b) b = p;
      var f = Math.min.apply(null, lows.concat(b < 1e9 ? b : a));
      if (p <= Math.max(8, f * 2)) { mid = 0; return -1; }
      return p > f * 3 || ++mid >= 5 ? 1 : 0;
    };
  }

  /** 녹음 → 전사. 말이 끝나고 조용해지면 스스로 멈춘다. @returns {Promise<string>} 실패하면 '' */
  function record(opts) {
    opts = opts || {};
    var onState = typeof opts.onState === 'function' ? opts.onState : function () {};
    var early = function (x) { try { if (opts.early) opts.early(x); } catch (e) {} };
    var MAX_MS      = opts.maxMs      || 20000;   // 안전 상한
    var SILENCE_MS  = opts.silenceMs  || 2500;    // 말이 끝난 뒤 이만큼 조용하면 종료
    var FIRST_MS    = opts.firstMs    || 9000;    // 첫 마디 대기(아이들은 뜸들인다)

    if (!supported()) { onState('error', { reason: 'unsupported' }); return Promise.resolve(''); }
    if (cur) { try { cur.cancel(); } catch (e) {} }

    return new Promise(function (resolve) {
      /* ⏹ 는 권한 대기 중에도 들어야 한다(2026-07-23) — 지금 정의, 준비되면 반영. */
      var session = { canceled: false, wantStop: false, _stopRec: null };
      session.stop = function () { session.wantStop = true; if (session._stopRec) session._stopRec(); };
      session.cancel = function () { session.canceled = true; session.wantStop = true; if (session._stopRec) session._stopRec(); early(0); finish(''); };
      cur = session;
      var finished = false, uploadTimer;
      function finish(text) {
        if (finished) return; finished = true; clearTimeout(uploadTimer);
        if (cur === session) cur = null;
        resolve(text || '');
      }

      onState('ready', {});
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }).then(function (stream) {
        if (session.canceled) { stopTracks(stream); return finish(''); }

        /* 🍎 iOS 는 mp4 — 형식을 골라 쓰고 파일 이름도 맞춘다(서버 오인 방지). */
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
        var ac = null, raf = null, want = null;

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
        function whole() { return new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' }); }
        function form(blob) {
          var bt = String(blob.type || pickedMime || ''), fd = new FormData();
          fd.append('audio', blob, 'speech.' + (/mp4|aac|m4a/i.test(bt) ? 'm4a' : (/ogg/i.test(bt) ? 'ogg' : 'webm')));
          if (opts.lang) fd.append('lang', opts.lang);
          return fd;
        }
        var ctl = { mime: pickedMime, stop: stopRec, snap: function () {
          return new Promise(function (r) { if (want) want(null); want = r; try { mr.requestData(); } catch (e) { want = null; r(null); } });
        } };

        mr.ondataavailable = function (e) {
          if (e.data && e.data.size) chunks.push(e.data);
          if (want) { var w = want, b = whole(); want = null; w(b.size < 1200 ? null : form(b)); }
        };
        mr.onstop = function () {
          stopTracks(stream);
          if (session.canceled || finished) return finish('');
          var blob = whole();
          if (!blob.size || blob.size < 1200) { onState('error', { reason: 'no_audio' }); return finish(''); }
          if (typeof opts.onAudio === 'function') { try { opts.onAudio(blob); } catch (e) {} }
          onState('thinking', {});
          uploadTimer = setTimeout(function () {
            session.canceled = true; early(0);
            onState('error', { reason: 'timeout' }); finish('');
          }, 30000);
          var fd = form(blob);
          var upload = typeof opts.transcribe === 'function'
            ? Promise.resolve().then(function(){ if(session.canceled)return null; return opts.transcribe(fd); })
            : post(fd);
          upload
            .then(function (d) {
              if (session.canceled || finished) return finish('');
              if (!d || !d.ok) { onState('error', { reason: 'server' }); return finish(''); }
              finish(String(d.text || '').trim());
            })
            .catch(function () { if (!session.canceled && !finished) onState('error', { reason: 'server' }); finish(''); });
        };

        mr.onerror = function () {
          session.canceled = true; stopRec(); stopTracks(stream); early(0);
          onState('error', { reason: 'no_audio' }); finish('');
        };
        try { mr.start(); } catch (e) { stopTracks(stream); onState('error', { reason: 'unsupported' }); return finish(''); }
        if (session.wantStop) { stopRec(); return; }
        onState('waiting', {});
        maxTimer = setTimeout(stopRec, MAX_MS);
        firstTimer = setTimeout(function () { if (!heardSpeech) stopRec(); }, FIRST_MS);

        /* 말 끝 판단(endGate) — AudioContext 가 없으면 상한(MAX_MS)까지 녹음. */
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          ac = new AC();
          if (ac.state === 'suspended') ac.resume().catch(function () {});
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
            if (st > 0) {
              if (!heardSpeech) { heardSpeech = true; onState('speaking', {}); }
              if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; early(0); }
            } else if (st < 0 && heardSpeech && !silenceTimer) {
              silenceTimer = setTimeout(stopRec, SILENCE_MS); early(ctl);
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        } catch (e) {}
      }).catch(function (err) {
        if (session.canceled || finished) return finish('');
        var denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        onState('error', { reason: denied ? 'denied' : 'unsupported' });
        finish('');
      });
    });
  }

  function stop()   { if (cur && cur.stop) try { cur.stop(); } catch (e) {} }
  function cancel() { if (cur && cur.cancel) try { cur.cancel(); } catch (e) {} }
  function busy()   { return !!cur; }

  window.MangoiVoice = { supported: supported, record: record, stop: stop, cancel: cancel, busy: busy, post: post };
})();
