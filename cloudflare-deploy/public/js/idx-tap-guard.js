// ═══════════════════════════════════════════════════════════════
// idx-tap-guard.js — «탭» 과 «스크롤» 가르기 (2026-10-28 사장님 제보)
//   Tell a real tap from a scroll/swipe before acting on 'touchend'.
//
//   증상: 폰에서 살짝만 건드려도(스크롤하려고 스치기만 해도) 화면이 바뀐다.
//   원인: touchend 만 보고 바로 «실행» 하는 코드들이 손가락이 움직였는지 안 봤다.
//     터치 이벤트의 target 은 손가락이 미끄러져도 «처음 닿은 요소» 그대로라,
//     큰 버튼(수업 입장·오늘의 A.i 학습) 위에서 스크롤을 시작하면 그 버튼의
//     touchend 가 그대로 온다. 브라우저는 이때 click 을 안 보내는데(정상),
//     우리 코드가 대신 눌러 버렸다(ph166 터치 보충 — 아래 ②로 옮김).
//
//   ✅ 정본 판정 window.mgIsTap(e) — touchend 로 무언가 실행하는 코드는 이것부터 묻는다.
//     아래 중 하나라도 해당하면 «탭이 아니다»:
//       · 손가락이 10px 넘게 움직였다 (idx-legacy-domain-notice.js 와 같은 기준)
//       · 두 손가락 이상(핀치)이었다 · 터치가 취소됐다(touchcancel)
//       · 닿기 직전·닿는 동안 화면이 스크롤 중이었다 (관성 스크롤을 멈추려는 터치)
//   ⚠️ «아니다» 로 잘못 판정해도 안전하다 — 진짜 탭이면 브라우저의 click 이 그대로
//     처리한다(부르는 자리마다 click 핸들러가 함께 있다). 그래서 애매하면 «아니다».
//     같은 이유로 이 파일이 없으면 부르는 쪽은 touchend 실행을 건너뛴다.
//   ⛔ 전역에서 touchend 를 삼키는 방식으로 바꾸지 마세요 — 교재 드래그·스와이프,
//     연기/변경 드래그가 touchend 로 «끝» 을 알아야 합니다.
//   감시: test-harness/tap_guard_harness.mjs
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.mgIsTap) return;

  var SLOP = 10;          // px — 이만큼까지는 손떨림으로 본다
  var FLING_MS = 150;     // 스크롤이 이 시간 안에 있었으면 «멈추려는 터치»
  var g = null;           // 지금 제스처 { x, y, moved }
  var lastScrollAt = 0;

  function note(x, y) {
    if (g && (Math.abs(x - g.x) > SLOP || Math.abs(y - g.y) > SLOP)) g.moved = true;
  }

  // ① 판정 재료 모으기 — 캡처 단계라 다른 처리보다 먼저 본다(아무것도 막지 않음)
  var OPT = { capture: true, passive: true };
  window.addEventListener('touchstart', function (e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    if (e.touches.length > 1) { if (g) g.moved = true; return; }
    g = { x: t.clientX, y: t.clientY, moved: (Date.now() - lastScrollAt) < FLING_MS };
  }, OPT);
  window.addEventListener('touchmove', function (e) {
    var t = e.touches && e.touches[0];
    if (!g || !t) return;
    if (e.touches.length > 1) g.moved = true;
    else note(t.clientX, t.clientY);
  }, OPT);
  window.addEventListener('touchcancel', function () { if (g) g.moved = true; }, OPT);
  window.addEventListener('scroll', function () {
    lastScrollAt = Date.now();
    if (g) g.moved = true;
  }, OPT);

  window.mgIsTap = function (e) {
    if (!e || String(e.type).indexOf('touch') !== 0) return true;   // 마우스·키보드는 판정 대상 아님
    if (!g) return false;
    // 지난 제스처의 기록이면 탭이 아니다 — 앞선 캡처 핸들러가 이번 touchstart 를 삼키면 g 가 그대로 남는다.
    // 같은 touchend 를 여러 핸들러가 물어도 이벤트 객체가 같아 답이 같다.
    if (g.end && g.end !== e) return false;
    g.end = e;
    var c = e.changedTouches && e.changedTouches[0];
    if (c) note(c.clientX, c.clientY);   // touchmove 를 건너뛴 기기 대비 — 뗀 자리로 한 번 더
    return !g.moved;
  };

  // ② 홈 큰 버튼 터치 보충 (index.html ph166 에서 옮김)
  //   «iOS 일부 환경에서 click 이 안 온다» 대비 — 탭 뒤 click 이 끝내 안 오면 대신 누른다.
  //   🔴 예전엔 움직임을 안 보고 50ms 뒤 무조건 눌렀다 → 스크롤만 해도 화면이 넘어갔고,
  //      click 이 50ms 넘어 늦게 오는 기기에서는 두 번 실행됐다.
  var RESCUE = '.ai-quick-btn, .cta-pay, .cta-enter';
  var pressed = null;
  document.addEventListener('touchstart', function (e) {
    pressed = (e.target && e.target.closest) ? e.target.closest(RESCUE) : null;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    var btn = pressed;
    pressed = null;
    if (!btn || !window.mgIsTap(e)) return;
    // click 도착은 window 캡처에서 본다 — 버튼에 단 리스너는 다른 캡처 핸들러가
    // stopImmediatePropagation 하면(ph73 「연기/변경」) 못 봐서 한 번 더 눌렀다.
    var clicked = false;
    var mark = function (ev) { if (ev.target && btn.contains(ev.target)) clicked = true; };
    window.addEventListener('click', mark, true);
    setTimeout(function () {
      window.removeEventListener('click', mark, true);
      if (!clicked) { try { btn.click(); } catch (_) {} }
    }, 300);
  }, { passive: true });
})();
