/* ↔ (2026-09-24) 수업 화면 경계 드래그로 폭 조절 — PC(≥1025px) 전용
   ─────────────────────────────────────────────────────────────────────
   ① 교재 | 얼굴 경계  → 얼굴 칸 폭(#vc-video-pane)
   ② 얼굴 | 채팅 경계  → 채팅 패널 폭(#vc-chat-panel)
   [가볍게] 상주 타이머·MutationObserver 없음. 손잡이를 «누를 때만» 포인터 이벤트가 돌고,
            그리는 동안에는 CSS 변수 한 칸만 바꾸며(rAF 1회/프레임), 칠판·교재 다시 그리기는
            «손을 뗀 뒤 한 번» 만 합니다.
   [수업 지장 없음] 연결·영상·녹화 코드는 한 줄도 안 건드립니다(폭만 바꿉니다).
            ⛔ 폭을 인라인 style 로 쓰지 않습니다 — 클래스(.vc-split-on) + 변수라서 크기바·
            전체영상·자유크기·솔로·접기로 바뀌면 CSS 가 저절로 비켜섭니다.
            크기바 버튼을 누르면 드래그 폭은 풀리고 그 버튼의 크기로 돌아갑니다.
   [되돌리기] 손잡이를 두 번 누르면 원래 폭. 얼굴 폭은 이번 수업 동안만,
            채팅 폭은 이 기기에 기억합니다(얼굴 폭을 기억하면 학생 기본 크기와 싸웁니다). */
(function () {
  'use strict';
  if (window.__vcSplitterReady) return;
  window.__vcSplitterReady = true;

  var MQ = '(min-width: 1025px)';
  var CHAT_KEY = 'vc_chat_w';
  var VID_MIN = 180, CONTENT_MIN = 320, CHAT_MIN = 260, CHAT_MAX = 760;

  function $(id) { return document.getElementById(id); }
  function desk() { try { return window.matchMedia(MQ).matches; } catch (_) { return false; } }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function isEn() {
    try { if (typeof getLang === 'function') return getLang() === 'en'; } catch (_) {}
    try { return localStorage.getItem('mangoi_lang') === 'en'; } catch (_) {}
    return false;
  }

  /* 폭 조건은 여기 한 곳. :not() 목록 = 드래그 폭을 «양보» 하는 모드들. */
  var css = '' +
    '.vc-split-h{display:none;}' + /* 미디어쿼리 «밖» — 폰·태블릿에서는 아예 안 그립니다 */
    '@media ' + MQ + '{' +
    'html body.vc-in-call #vc-main-row.vc-split-on:not(.video-full):not(.video-free):not(.video-solo):not(.video-pip):not(.video-facepip):not(.vc-side-collapsed):not(.ph49-face-hidden):not(.content-full) > #vc-video-pane{' +
      'width:var(--vc-split-w) !important;flex:0 0 var(--vc-split-w) !important;max-width:none !important;min-width:0 !important;}' +
    'html body.vc-in-call #vc-chat-panel.chat-panel.vc-chat-sized{width:var(--vc-chat-w) !important;max-width:none !important;}' +
    '.vc-split-h{position:absolute;top:0;bottom:0;left:0;width:7px;z-index:45;cursor:col-resize;touch-action:none;display:none;background:transparent;}' +
    '.vc-split-h::after{content:"";position:absolute;top:50%;left:2px;width:3px;height:44px;margin-top:-22px;border-radius:3px;background:rgba(148,163,184,.45);transition:background .15s;}' +
    '.vc-split-h:hover::after,.vc-split-h.drag::after{background:#f59e0b;}' +
    'body.vc-in-call #vc-main-row:not(.video-full):not(.video-free):not(.video-solo):not(.video-pip):not(.video-facepip):not(.vc-side-collapsed):not(.ph49-face-hidden):not(.content-full) > #vc-video-pane > #vc-split-a{display:block;}' +
    'body.vc-in-call #vc-chat-panel.open > #vc-split-b{display:block;}' +
    'body.vc-splitting,body.vc-splitting *{cursor:col-resize !important;user-select:none !important;}' +
    'body.vc-splitting #vc-video-pane,body.vc-splitting #vc-chat-panel{transition:none !important;}' +
    'body.vc-splitting iframe{pointer-events:none !important;}' +
    '}';

  function reflow() {
    setTimeout(function () {
      try { if (typeof wbResize === 'function') wbResize(); } catch (_) {}
      try { if (typeof pdfResize === 'function') pdfResize(); } catch (_) {}
      try { if (typeof pdfRenderCurrent === 'function') pdfRenderCurrent(); } catch (_) {}
    }, 60);
  }

  function label(el) {
    var ko = '끌어서 폭 조절 · 두 번 누르면 원래대로';
    var en = 'Drag to resize · double-click to reset';
    el.setAttribute('data-ko-title', ko); el.setAttribute('data-en-title', en);
    el.setAttribute('data-ko-aria', ko); el.setAttribute('data-en-aria', en);
    el.title = isEn() ? en : ko;
    el.setAttribute('aria-label', el.title);
    el.setAttribute('role', 'separator');
    el.setAttribute('aria-orientation', 'vertical');
  }

  /* ── 공용 드래그 — onMove(clientX) 는 rAF 로 한 프레임에 한 번 ── */
  function makeDrag(handle, onStart, onMove, onEnd) {
    var raf = 0, lastX = 0, active = false, pid = null;
    handle.addEventListener('pointerdown', function (e) {
      if (!desk() || (e.button != null && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation();
      active = true; pid = e.pointerId; lastX = e.clientX;
      try { handle.setPointerCapture(pid); } catch (_) {}
      handle.classList.add('drag');
      document.body.classList.add('vc-splitting');
      onStart(e.clientX);
    });
    handle.addEventListener('pointermove', function (e) {
      if (!active || e.pointerId !== pid) return;
      lastX = e.clientX;
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; try { onMove(lastX); } catch (_) {} });
    });
    function stop(e) {
      if (!active || (e && e.pointerId !== pid)) return;
      active = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      try { onMove(lastX || (e && e.clientX)); } catch (_) {}
      try { handle.releasePointerCapture(pid); } catch (_) {}
      handle.classList.remove('drag');
      document.body.classList.remove('vc-splitting');
      try { onEnd(); } catch (_) {}
    }
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);
  }

  /* ── ① 교재 | 얼굴 ── */
  function setVid(w) {
    var row = $('vc-main-row');
    if (!row) return;
    var rr = row.getBoundingClientRect();
    var max = Math.max(VID_MIN, rr.width - CONTENT_MIN);
    row.style.setProperty('--vc-split-w', Math.round(clamp(w, VID_MIN, max)) + 'px');
    row.classList.add('vc-split-on');
  }
  function clearVid() {
    var row = $('vc-main-row');
    if (!row) return;
    row.classList.remove('vc-split-on');
    row.style.removeProperty('--vc-split-w');
  }
  function mountA() {
    var pane = $('vc-video-pane');
    if (!pane || $('vc-split-a')) return;
    var h = document.createElement('div');
    h.id = 'vc-split-a'; h.className = 'vc-split-h';
    label(h);
    pane.appendChild(h);
    var sx = 0, sw = 0;
    makeDrag(h, function (x) {
      sx = x; sw = pane.getBoundingClientRect().width;
      setVid(sw); /* 누른 순간의 폭에서 «움직인 만큼» 만 — 잡는 순간 튀지 않게 */
    }, function (x) {
      setVid(sw + (sx - x));
    }, reflow);
    h.addEventListener('dblclick', function (e) { e.preventDefault(); clearVid(); reflow(); });
  }

  /* ── ② 얼굴 | 채팅 ── */
  function setChat(w, save) {
    var p = $('vc-chat-panel');
    if (!p) return;
    var max = Math.min(CHAT_MAX, Math.round(window.innerWidth * 0.6));
    var v = Math.round(clamp(w, CHAT_MIN, Math.max(CHAT_MIN, max)));
    p.style.setProperty('--vc-chat-w', v + 'px');
    p.classList.add('vc-chat-sized');
    if (save) { try { localStorage.setItem(CHAT_KEY, String(v)); } catch (_) {} }
  }
  function clearChat() {
    var p = $('vc-chat-panel');
    if (!p) return;
    p.classList.remove('vc-chat-sized');
    p.style.removeProperty('--vc-chat-w');
    try { localStorage.removeItem(CHAT_KEY); } catch (_) {}
  }
  function mountB() {
    var p = $('vc-chat-panel');
    if (!p || $('vc-split-b')) return;
    var h = document.createElement('div');
    h.id = 'vc-split-b'; h.className = 'vc-split-h';
    label(h);
    p.appendChild(h);
    var sx = 0, sw = 0;
    makeDrag(h, function (x) { sx = x; sw = p.getBoundingClientRect().width; }, function (x) {
      setChat(sw + (sx - x), false);
    }, function () {
      var cur = parseInt(p.style.getPropertyValue('--vc-chat-w'), 10);
      if (cur) setChat(cur, true);
    });
    h.addEventListener('dblclick', function (e) { e.preventDefault(); clearChat(); });
    try {
      var saved = parseInt(localStorage.getItem(CHAT_KEY) || '', 10);
      if (saved > 0) setChat(saved, false);
    } catch (_) {}
  }

  /* 크기바를 누르면 드래그 폭을 풀고 그 버튼의 크기로 — 사람이 고른 것이 이깁니다 */
  function hookSizeBar() {
    var orig = window.vcSetVideoSize;
    if (typeof orig !== 'function' || orig.__vcSplit) return;
    var wrapped = function () { try { clearVid(); } catch (_) {} return orig.apply(this, arguments); };
    wrapped.__vcSplit = true;
    window.vcSetVideoSize = wrapped;
  }

  function onResize() {
    var row = $('vc-main-row');
    if (row && row.classList.contains('vc-split-on')) {
      setVid(parseInt(row.style.getPropertyValue('--vc-split-w'), 10) || VID_MIN);
    }
    var p = $('vc-chat-panel');
    if (p && p.classList.contains('vc-chat-sized')) {
      setChat(parseInt(p.style.getPropertyValue('--vc-chat-w'), 10) || CHAT_MIN, false);
    }
  }

  function boot() {
    try {
      if (!$('vc-splitter-style')) {
        var s = document.createElement('style');
        s.id = 'vc-splitter-style';
        s.textContent = css;
        document.body.appendChild(s);
      }
      mountA(); mountB(); hookSizeBar();
      window.addEventListener('resize', onResize);
      var relabel = function () {
        ['vc-split-a', 'vc-split-b'].forEach(function (id) { var el = $(id); if (el) label(el); });
      };
      document.addEventListener('mangoi:lang-changed', relabel);
      window.addEventListener('mangoi:lang-changed', relabel);
    } catch (e) { try { console.warn('[vc-splitter]', e); } catch (_) {} }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.__vcSplitter = { clearVid: clearVid, clearChat: clearChat };
})();
