/* ══════════════════════════════════════════════════════════════════════
   💬 채팅 패널 ✕ — «눌러도 안 닫힘» 안전장치 (2026-08-19)

   [제보] 사장님: 수업 중 채팅창의 ✕ 를 눌러도 아무 일도 일어나지 않는다.
          같은 화면에서 상단바/독의 💬 버튼으로는 «닫힌다».
   [뜻] 닫는 기능(vcToggleChat)은 멀쩡하고, ✕ «에 클릭이 닿지 않는» 것이다.
        무엇이 덮고 있는지는 특정하지 못했다 — 로컬에서 PC 폭 1024·1280·1366·1440px
        전부 정상으로 닫혔다(모바일 세로에서만 '가로로 돌려주세요' 안내가 덮는다).
   [그래서] 「무엇이 위에 있나」를 묻지 않고 «좌표»로 판정한다.
        누른 자리가 ✕ 의 사각형 안이면, 그 클릭이 ✕ 에 닿았든 아니든 채팅을 닫는다.
   ⛔ 이 파일을 elementFromPoint(히트테스트) 기반으로 «정리» 하지 마세요 —
      그 히트테스트가 실패하는 상황을 고치려고 만든 코드입니다.
   ⚠️ 정상 상황(=✕ 가 클릭을 제대로 받는 경우)에는 아무것도 하지 않습니다.
      인라인 onclick 이 닫고, 여기서 또 닫으면 «닫았다 열렸다» 가 됩니다.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PANEL_ID = 'vc-chat-panel';
  var PAD = 8;              // 손가락·마우스가 살짝 빗나가도 받아 준다(px)

  function panel()  { return document.getElementById(PANEL_ID); }
  function isOpen() { var p = panel(); return !!(p && p.classList.contains('open')); }
  function xBtn()   { var p = panel(); return p ? p.querySelector('.chat-header button') : null; }

  /* ✕ 를 조금 키운다 — 원래 19×22px 이라 살짝만 빗나가도 «반응이 없다» 가 된다.
     자리(레이아웃)는 그대로 두고 «누를 수 있는 넓이» 만 넓힌다. */
  function widen(b) {
    if (!b || b.dataset.mgWide === '1') return;
    b.dataset.mgWide = '1';
    b.type = 'button';
    b.style.padding   = '8px 10px';
    b.style.margin    = '-8px -6px -8px 0';
    b.style.lineHeight = '1';
    b.style.cursor    = 'pointer';
  }

  function closeChat(why, topEl) {
    var p = panel(); if (!p) return;
    try {
      console.warn('[chat-x] ✕ 가 가려져 클릭이 안 닿았습니다 → 좌표로 닫습니다.',
                   { 위에있던것: topEl && (topEl.tagName + (topEl.id ? '#' + topEl.id : '') +
                     (typeof topEl.className === 'string' && topEl.className ? '.' + topEl.className.trim().split(/\s+/).join('.') : '')),
                     경로: why });
    } catch (_) {}
    if (typeof window.vcToggleChat === 'function') { try { window.vcToggleChat(); } catch (_) {} }
    p.classList.remove('open');   // 토글이 어떤 이유로 실패해도 확실히 닫는다
  }

  function onDown(e) {
    if (!isOpen()) return;
    var b = xBtn(); if (!b) return;
    widen(b);
    var r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    var x = (e.clientX != null) ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
    var y = (e.clientY != null) ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
    if (x == null || y == null) return;
    if (x < r.left - PAD || x > r.right + PAD || y < r.top - PAD || y > r.bottom + PAD) return;

    // ✕ 가 클릭을 «제대로 받는» 정상 상황이면 손대지 않는다 — 인라인 onclick 이 닫는다
    var top = null;
    try { top = document.elementFromPoint(x, y); } catch (_) {}
    if (top && (top === b || b.contains(top))) return;

    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
    closeChat(e.type, top);
  }

  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('touchstart',  onDown, true);   // 포인터 이벤트가 없는 구형 대비

  /* 채팅을 열 때마다 ✕ 넓히기를 한 번 적용한다(패널은 다시 그려지지 않지만, 안전하게) */
  try {
    document.addEventListener('click', function () { if (isOpen()) widen(xBtn()); }, true);
  } catch (_) {}
})();
