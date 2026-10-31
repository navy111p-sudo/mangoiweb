/* 🔊 기기 목소리(speechSynthesis)도 짧은 영어 낱말을 «한 문장» 모양으로 (2026-09-24)
   서버 음성 입구(src/tts-short-text.ts)와 «같은 규칙»이다 — 낱말 하나(`study`)를 읽을 때
   `Study.` 처럼 첫 글자 대문자 + 마침표로 끝맺어 첫소리 잘림·어색한 억양을 막는다.
   화면이 30곳 넘게 각자 SpeechSynthesisUtterance 를 만들므로 화면마다 고치지 않고,
   읽기 직전 한 곳(speechSynthesis.speak)만 감싼다. 화면 글자는 그대로다.
   ⛔ 영어(lang 이 비었거나 en…)일 때만 — 중국어·한국어 음성은 한 글자도 안 바꾼다.
   ⛔ 규칙을 바꾸면 서버 정본과 함께 바꿀 것(test-harness/tts_short_text_harness.mjs 가 둘을 대조한다). */
(function(){
  'use strict';
  var MAX_WORDS = 3;
  function ttsShortText(text, lang){
    var t = String(text == null ? '' : text).trim();
    if (!t) return t;
    if (!/^en/i.test(String(lang || ''))) return t;
    if (/[.!?]$/.test(t)) return t;
    if (!/^[A-Za-z][A-Za-z0-9' ,\-]*$/.test(t)) return t;
    if (t.split(/\s+/).filter(Boolean).length > MAX_WORDS) return t;
    return t.charAt(0).toUpperCase() + t.slice(1).replace(/[\s,]+$/, '') + '.';
  }
  window.mgTtsShortText = ttsShortText;
  try {
    var ss = window.speechSynthesis;
    if (!ss || ss.__mgShortWrapped || typeof ss.speak !== 'function') return;
    var orig = ss.speak;
    ss.speak = function(u){
      try {
        if (u && typeof u.text === 'string') {
          // lang 이 비어 있으면 문서 언어로 본다(비어 있으면 영어로 본다) — 영어 화면의 기본값
          var lang = u.lang || (u.voice && u.voice.lang) || document.documentElement.lang || 'en';
          if (/^ko/i.test(lang) && /^[A-Za-z]/.test(u.text)) lang = 'en';   // 한국어 화면이 영어 낱말을 lang 없이 읽는 경우
          var nt = ttsShortText(u.text, lang);
          if (nt !== u.text) u.text = nt;
        }
      } catch (_) {}
      return orig.apply(this, arguments);
    };
    ss.__mgShortWrapped = true;
  } catch (_) {}
})();
