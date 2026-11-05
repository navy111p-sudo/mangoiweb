/*!
 * 🎤 mangoi-voice-input.js — 녹음 → 서버 Whisper 전사 (브라우저 음성인식의 폴백/정확 모드)
 *   인식이 없는 WebView·인앱·구형 iOS 용(2026-07-23). 내력: 작업기록 261105 «녹음말끝»·«미리받아쓰기».
 * ⚠️ 브라우저 음성인식과 **동시에 쓰지 말 것** — 일부 안드로이드는 입력 세션이 하나뿐이라 둘 다 죽는다.
 * ⚠️ 첫 화면(blocking)에 실린다 — 여유가 수십 바이트. 새 판단은 따로 둘 것(본보기 mangoi-voice-early.js).
 *
 * MangoiVoice.supported() · stop()(⏹ 지금까지 녹음분으로 전사) · cancel()(전사 안 함) · post(fd)(기본 전사)
 * MangoiVoice.record({ onState, maxMs, silenceMs, firstMs, lang, onAudio, transcribe, early }) -> Promise<string>
 *   lang: Whisper 언어 힌트('en'|'ko'|'zh'). 안 주면 짧은 영어를 한국어로 오인식한다(2026-07-24).
 *   early(x): 말이 멎으면 x={snap,stop,mime}(snap()=지금까지 녹음분 FormData), 다시 말하면 0.
 * onState(state, info): ready · waiting · speaking · thinking · error(info.reason = unsupported|denied|no_audio|server)
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
    return fetch('/api/voice/transcribe', { method: 'POST', body: fd }).then(function (r) { return r.ok ? r.json() : null; });
  }

  /* 🔇 말/조용 판정(2026-11-05) — 고정 문턱(>8)이면 폰 자동음량이 키운 소음이 늘 «말» 이라 20초까지 녹음됐다.
     최근 3초 소음 바닥(0.2초 칸의 둘째로 작은 값)에 맞춘다. 0(빈 프레임)은 조용이되 바닥 제외.
     바닥×2~3 은 0.1초 이어지면 말. 1 말·-1 조용·0 애매 */
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
          if (session.canceled) return finish('');
          var blob = whole();
          if (!blob.size || blob.size < 1200) { onState('error', { reason: 'no_audio' }); return finish(''); }
          if (typeof opts.onAudio === 'function') { try { opts.onAudio(blob); } catch (e) {} }
          onState('thinking', {});
          var fd = form(blob);
          var upload = typeof opts.transcribe === 'function'
            ? Promise.resolve().then(function(){ if(session.canceled)return null; return opts.transcribe(fd); })
            : post(fd);
          upload
            .then(function (d) {
              if (session.canceled) return finish('');
              if (!d || !d.ok) { onState('error', { reason: 'server' }); return finish(''); }
              finish(String(d.text || '').trim());
            })
            .catch(function () { onState('error', { reason: 'server' }); finish(''); });
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
