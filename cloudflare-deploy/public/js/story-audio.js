/* Shared English MP3 playback for storybooks and the reading ladder.
   The existing same-origin endpoint works without installed device TTS voices.
   Completion means audible playback ended, never a request/playback failure. */
(function () {
  'use strict';
  var audio = null, seq = 0, busy = false, timer = 0, utterance = null, notice = null;
  function message(text, retry) {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'position:fixed;bottom:18px;left:5%;right:5%;z-index:9999;padding:16px;background:#fff;color:#222;border:2px solid #287d38;border-radius:12px;font:16px sans-serif';
      document.body.appendChild(notice);
    }
    notice.textContent = text;
    notice.hidden = !text;
    if (retry) {
      var button = document.createElement('button');
      button.textContent = '▶ 다시 재생 / Play';
      button.style.cssText = 'margin-left:12px;padding:10px;font:inherit';
      button.onclick = retry;
      notice.appendChild(button);
    }
  }
  function stop() {
    ++seq; busy = false; clearTimeout(timer);
    if (audio) { audio.onended = audio.onerror = audio.onplaying = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
    utterance = null;
    if (notice) notice.hidden = true;
  }
  function chunks(text) {
    var out = [], rest = String(text || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
    // Keep each request within one upstream clip so partial server results cannot
    // silently omit the middle of a sentence (the endpoint accepts longer text).
    while (rest.length > 180) {
      var part = rest.slice(0, 180), cut = Math.max(part.lastIndexOf('. '), part.lastIndexOf('? '), part.lastIndexOf('! '), part.lastIndexOf(' '));
      if (cut < 1) cut = 179;
      out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
  }
  function speak(text, rate, onend) {
    stop();
    var mine = seq, parts = chunks(text), index = 0;
    if (!parts.length) return;
    rate = Math.max(0.5, Math.min(1.5, Number(rate) || 0.88));
    busy = true;
    function failed() {
      if (mine !== seq) return;
      stop();
      message('음성을 재생하지 못했어요. 인터넷과 스피커를 확인한 뒤 다시 눌러 주세요. / Audio unavailable. Check your connection and speakers.', function () { speak(text, rate, onend); });
    }
    function next() {
      if (mine !== seq) return;
      clearTimeout(timer);
      if (index >= parts.length) { busy = false; if (onend) onend(); return; }
      var part = parts[index++], settled = false;
      function ended() { if (settled || mine !== seq) return; settled = true; clearTimeout(timer); next(); }
      function fallback() {
        if (settled || mine !== seq) return;
        settled = true; clearTimeout(timer);
        if (audio) { audio.onended = audio.onerror = audio.onplaying = null; audio.pause(); }
        try {
          var synth = window.speechSynthesis;
          var voices = synth ? synth.getVoices().filter(function (v) { return /^en[-_]/i.test(v.lang); }) : [];
          if (!voices.length || !window.SpeechSynthesisUtterance) { failed(); return; }
          var u = utterance = new window.SpeechSynthesisUtterance(part);
          u.lang = 'en-US'; u.voice = voices.filter(function (v) { return /^en[-_]US$/i.test(v.lang); })[0] || voices[0]; u.rate = rate;
          var finished = false;
          u.onend = function () { if (finished || mine !== seq) return; finished = true; clearTimeout(timer); utterance = null; next(); };
          u.onerror = function () { if (finished || mine !== seq) return; finished = true; failed(); };
          timer = setTimeout(failed, Math.max(30000, part.length * 200 / rate));
          synth.speak(u);
        } catch (_) { failed(); }
      }
      function rejected(error) {
        if (settled || mine !== seq) return;
        if (error && error.name === 'NotAllowedError') {
          clearTimeout(timer); busy = false;
          message('소리 재생을 허용하려면 재생 버튼을 눌러 주세요. / Tap Play to allow audio.', play);
        } else fallback();
      }
      function play() {
        if (settled || mine !== seq) return;
        message(''); busy = true;
        timer = setTimeout(fallback, 20000);
        try { var pending = audio.play(); if (pending && pending.catch) pending.catch(rejected); } catch (error) { rejected(error); }
      }
      try {
        if (!audio) audio = new window.Audio();
        audio.onended = ended; audio.onerror = fallback;
        audio.onplaying = function () {
          if (mine !== seq || settled) return;
          clearTimeout(timer);
          var duration = Number(audio.duration);
          timer = setTimeout(fallback, isFinite(duration) && duration > 0 ? duration * 1000 / rate + 15000 : 180000);
        };
        // Set src and call play synchronously in the user's click, without fetch/blob waits.
        audio.src = '/api/tts-free?lang=en&q=' + encodeURIComponent(part);
        audio.playbackRate = rate;
        play();
      } catch (_) { fallback(); }
    }
    next();
  }
  window.StoryAudio = { speak: speak, stop: stop, isSpeaking: function () { return busy; } };
  window.addEventListener('pagehide', stop);
})();
