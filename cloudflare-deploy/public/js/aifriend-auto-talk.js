/* AI friend hands-free turns. Keep the existing Whisper recorder and streaming
 * reply pipeline; only schedule the next mic after the whole reply is quiet.
 * A saved preference never grants permission to start recording on page load. */
(function () {
  'use strict';
  var mode = 'button', active = false, paused = false;
  var timer = null, speaking = 0, generation = 0, sending = false, misses = 0, turn = 0;
  var embedded = window.parent !== window;
  /* AI 말이 끝난 뒤 이만큼 기다렸다 마이크를 연다(스피커 잔향).
     ⚡ (2026-11-06 사장님 「휴대폰 A.i 말하기 3카드 모두 더 빨리」) 700 → 안드로이드 300 · 그 밖 600 — 웜업(js/warmup-auto-talk.js
        ARM_DELAY_MS)과 «같은 값». 이 화면은 기기와 상관없이 늘 녹음 경로(getUserMedia 에코 제거 + 소음 바닥 판정)다.
     ⛔ 아이폰·PC 는 600 아래로 내리지 않는다 — 블루투스 스피커는 소리가 0.3초 넘게 늦게 나올 수 있다(웜업 함정 대조와 같은 이유).
     ⛔ 200ms 아래로 내리지 말 것(스피커 잔향을 학생 말로 받음). */
  var ARM_DELAY_MS = /Android/i.test((navigator && navigator.userAgent) || '') ? 300 : 600;
  try { mode = localStorage.getItem('mangoi_aifriend_talk_mode') === 'auto' ? 'auto' : 'button'; } catch (_) {}
  function en() { return typeof isEn === 'function' && isEn(); }
  function text(ko, eng) { return en() ? eng : ko; }
  function face() { return window.MangoiFaceTalk && MangoiFaceTalk.isActive(); }
  function on() { return mode === 'auto' && active && !paused && !embedded && !face(); }
  function clear() { clearTimeout(timer); timer = null; }
  function status(ko, eng) {
    var el = document.getElementById('friendTalkStatus');
    if (el) { el.dataset.ko = ko; el.dataset.en = eng; el.textContent = text(ko, eng); }
  }
  function cancelListening() {
    clear();
    if (typeof cancelFriendMic === 'function') cancelFriendMic();
  }
  function pause() {
    paused = true; cancelListening();
    if (mode === 'auto') status('자동 말하기가 쉬고 있어요. ✨ 자동으로를 누르면 다시 시작해요.', 'Auto paused. Tap ✨ Auto to resume.');
  }
  function arm() {
    clear();
    if (!on() || sending || speaking) return;
    timer = setTimeout(function () {
      timer = null;
      var input = document.getElementById('msgInput');
      if (!on() || sending || speaking || document.hidden || _whisperOn ||
          (window.MangoiVoice && MangoiVoice.busy()) ||
          document.body.classList.contains('sheet-open') ||
          (input && (input.value.trim() || document.activeElement === input))) return;
      var audio = window.MangoiTTS && MangoiTTS.getAudioEl();
      if ((audio && !audio.paused && !audio.ended) || (window.speechSynthesis && speechSynthesis.speaking)) return;
      micViaWhisper(true);
    }, ARM_DELAY_MS);
  }
  function paint() {
    var el = document.getElementById('friendTalkSwitch');
    if (!el) return;
    el.hidden = embedded;
    el.setAttribute('aria-label', text('말하는 방법', 'How to talk'));
    el.innerHTML = '<span>' + text('말하는 방법', 'How to talk') + '</span>'
      + '<button type="button" data-mode="button" aria-pressed="' + (mode === 'button') + '">' + text('🎤 버튼으로', '🎤 Tap mic') + '</button>'
      + '<button type="button" data-mode="auto" aria-pressed="' + (mode === 'auto') + '">' + text('✨ 자동으로', '✨ Auto') + ' <small>' + text('베타', 'beta') + '</small></button>';
  }
  function setMode(value) {
    cancelListening();
    mode = value === 'auto' ? 'auto' : 'button'; active = mode === 'auto'; paused = false; misses = 0;
    try { localStorage.setItem('mangoi_aifriend_talk_mode', mode); } catch (_) {}
    paint();
    if (mode === 'auto') {
      if (!isSoundOn()) { try { localStorage.setItem('mangoi_aifriend_sound', '1'); } catch (_) {} updateSoundBtn(); }
      document.getElementById('msgInput').blur();
      status('AI 말이 끝나면 마이크가 켜지고, 말을 멈추면 자동으로 보내져요.', 'The mic opens after the AI finishes. Stop speaking to send.');
      arm();
    } else status('마이크를 눌러 말하거나 글로 입력해 주세요.', 'Tap the mic to speak, or type a message.');
  }
  window.FriendAutoTalk = {
    on: on, mode: function () { return mode; }, setMode: setMode, pause: pause, arm: arm,
    press: function () { active = mode === 'auto'; paused = false; misses = 0; clear(); },
    stop: function () { clear(); speaking = 0; generation++; },
    aiStart: function () {
      cancelListening(); speaking = ++generation;
      if (on()) status('🔊 AI가 말하고 있어요.', '🔊 The AI is speaking.');
      return generation;
    },
    aiDone: function (id) { if (id !== generation) return; speaking = 0; arm(); },
    begin: function () { sending = true; cancelListening(); return ++turn; },
    settled: function (ok, id) {
      if (id !== turn) return;
      sending = false;
      if (!on()) return;
      if (!ok) return pause();
      misses = 0; arm();
    },
    micState: function (s) {
      if (!on()) return;
      if (s === 'waiting') status('👂 지금 말해보세요.', '👂 Speak now.');
      else if (s === 'speaking') status('🎤 듣고 있어요. 말을 마치면 자동으로 보내져요.', '🎤 Listening. Finish speaking to send.');
      else if (s === 'thinking') status('🤖 말한 내용을 확인하고 있어요.', '🤖 Checking what you said.');
    },
    empty: function (reason) {
      if (!on()) return;
      if ((reason && reason !== 'no_audio') || ++misses >= 2) {
        pause();
        if (reason === 'denied') status('마이크 권한을 허용한 뒤 ✨ 자동으로를 다시 눌러 주세요.', 'Allow microphone permission, then tap ✨ Auto again.');
        else if (reason === 'server') status('음성 인식에 실패했어요. ✨ 자동으로를 눌러 다시 시도해 주세요.', 'Voice input failed. Tap ✨ Auto to try again.');
        return;
      }
      status('소리가 잘 안 들렸어요. 한 번 더 말해보세요.', 'I could not hear you. Please try again.');
      arm();
    }
  };
  var sw = document.getElementById('friendTalkSwitch');
  sw.addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  var input = document.getElementById('msgInput');
  input.addEventListener('focus', function () { if (on()) pause(); });
  input.addEventListener('input', function () { if (on()) pause(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('pagehide', pause);
  window.addEventListener('mangoi:lang-changed', function () {
    paint(); var s = document.getElementById('friendTalkStatus');
    if (s && s.dataset.ko) s.textContent = text(s.dataset.ko, s.dataset.en);
  });
  paint();
  status(mode === 'auto' ? '✨ 자동으로를 누르면 자동 대화를 시작해요.' : '마이크를 눌러 말하거나 글로 입력해 주세요.',
    mode === 'auto' ? 'Tap ✨ Auto to start hands-free chat.' : 'Tap the mic to speak, or type a message.');
})();
