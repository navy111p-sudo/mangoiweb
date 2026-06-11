/* ════════════════════════════════════════════════════════════════
   [media-guard v1] 전역 미디어 가드 (2026-06-12)
   목적: 메뉴/페이지/카드 전환 시 모든 음성·동영상 메시지를
         반드시 정지(안 들리게) + 숨김 상태에서 재생 금지(안 보이게).
   원칙:
   - WebRTC 실시간 스트림(srcObject)은 절대 건드리지 않음 (화상수업 보호)
   - 무음(muted) 장식용 루프 비디오는 유지하되, 화면에서 사라지면 일시정지
   - new Audio() 로 만든 내레이션도 전부 추적해서 정지
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__mediaGuardInstalled) return;
  window.__mediaGuardInstalled = true;

  /* ── 1) new Audio() 레지스트리: DOM 밖 오디오까지 추적 ── */
  var reg = [];
  try {
    var NativeAudio = window.Audio;
    var PatchedAudio = function (src) {
      var a = (src === undefined) ? new NativeAudio() : new NativeAudio(src);
      try {
        if (reg.indexOf(a) === -1) reg.push(a);
        if (reg.length > 100) reg.splice(0, reg.length - 100);
      } catch (e) {}
      return a;
    };
    PatchedAudio.prototype = NativeAudio.prototype;
    window.Audio = PatchedAudio;
  } catch (e) {}

  function isLive(el) { try { return !!el.srcObject; } catch (e) { return false; } }

  function pauseEl(el) {
    try {
      if (!el || isLive(el)) return;            /* 화상수업 스트림 보호 */
      if (!el.paused) el.pause();
      if (el.tagName === 'AUDIO') { try { el.currentTime = 0; } catch (e) {} }
    } catch (e) {}
  }

  function allMedia() {
    var list = [];
    try {
      var doms = document.querySelectorAll('audio,video');
      for (var i = 0; i < doms.length; i++) list.push(doms[i]);
    } catch (e) {}
    for (var j = 0; j < reg.length; j++) {
      if (list.indexOf(reg[j]) === -1) list.push(reg[j]);
    }
    return list;
  }

  /* ── 2) 전부 정지 (전역 공개) ── */
  function stopAll(except) {
    var list = allMedia();
    for (var i = 0; i < list.length; i++) {
      if (list[i] !== except) pauseEl(list[i]);
    }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }
  window.stopAllMedia = stopAll;

  /* ── 3) 동시 재생 방지: 새 미디어가 소리를 내면 기존 소리 정지 ── */
  try {
    var origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      var self = this;
      try {
        var silent = (self.tagName === 'VIDEO' && self.muted);
        if (!isLive(self) && !silent) {
          var list = allMedia();
          for (var i = 0; i < list.length; i++) {
            var el = list[i];
            if (el === self || isLive(el) || el.muted) continue;
            if (!el.paused) pauseEl(el);
          }
          try { if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel(); } catch (e) {}
        }
      } catch (e) {}
      return origPlay.apply(self, arguments);
    };
  } catch (e) {}

  /* ── 4) 화면 감시: 안 보이는 미디어는 소리도 안 나게 (0.4초마다) ── */
  function isVisible(el) {
    try { return el.getClientRects().length > 0; } catch (e) { return true; }
  }
  setInterval(function () {
    try {
      /* 숨겨진 비디오 / 컨트롤 달린 오디오 → 일시정지 */
      var els = document.querySelectorAll('video,audio[controls]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (isLive(el)) continue;
        if (!el.paused && !isVisible(el)) pauseEl(el);
        /* 장식용 무음 루프 비디오는 다시 보이면 자동 재개 */
        if (el.tagName === 'VIDEO' && el.paused && el.muted && el.loop &&
            el.autoplay && isVisible(el) && !el.ended) {
          try { var p = origPlay ? origPlay.call(el) : el.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        }
      }
    } catch (e) {}
  }, 400);

  /* ── 5) 페이지/뷰 전환 훅 ── */
  var navEvents = ['hashchange', 'popstate', 'pagehide', 'beforeunload'];
  for (var n = 0; n < navEvents.length; n++) {
    window.addEventListener(navEvents[n], function () { stopAll(); });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAll();
  });

  /* SPA 뷰 전환 함수 래핑 (정의 시점이 늦을 수 있어 재시도) */
  function wrapFn(name) {
    try {
      var fn = window[name];
      if (typeof fn === 'function' && !fn.__mgWrapped) {
        var wrapped = function () { stopAll(); return fn.apply(this, arguments); };
        wrapped.__mgWrapped = true;
        window[name] = wrapped;
      }
    } catch (e) {}
  }
  function wrapAll() { wrapFn('showView'); wrapFn('showSection'); wrapFn('showPage'); }
  wrapAll();
  document.addEventListener('DOMContentLoaded', wrapAll);
  setTimeout(wrapAll, 1500);
  setTimeout(wrapAll, 4000);

  /* ── 6) 메뉴/카드/링크 클릭 시 즉시 정지 (캡처 단계) ──
     클릭 후 새로 재생되는 음성은 핸들러에서 다시 play() 하므로 정상 재생됨 */
  var NAV_SEL = [
    'a[href]',
    '.gm-card', '.gm-cat-card', '.hero-chip',                 /* index 카드/칩 */
    '.sb-cat-head', '.sb-sub-item', '.sb-subsub-item',        /* admin 사이드바 */
    '.menu-card summary', '.tab-btn'                          /* admin 메뉴카드 / 탭 */
  ].join(',');
  var ONCLICK_RE = /(showView|showSection|showPage|location\.href|location\.assign|location\.replace|window\.open|showModal|openGrid|closeGrid|loadPage)/;
  var AUDIO_CTRL_RE = /(다시 듣기|소리 켜기|무음|음성|Audio|🔊|🔇|🔈)/;

  document.addEventListener('click', function (e) {
    try {
      var t = (e.target && e.target.closest) ? e.target.closest(NAV_SEL) : null;
      if (!t) {
        var node = e.target;
        while (node && node !== document) {
          var oc = node.getAttribute && node.getAttribute('onclick');
          if (oc && ONCLICK_RE.test(oc)) { t = node; break; }
          node = node.parentNode;
        }
      }
      if (!t) return;
      /* 음성 켜기/끄기·다시듣기 버튼은 예외 (자체 로직이 처리) */
      var label = '';
      try { label = (t.getAttribute('title') || '') + ' ' + (t.getAttribute('aria-label') || '') + ' ' + (t.textContent || '').slice(0, 80); } catch (e2) {}
      if (AUDIO_CTRL_RE.test(label)) return;
      stopAll();
    } catch (err) {}
  }, true);
})();
