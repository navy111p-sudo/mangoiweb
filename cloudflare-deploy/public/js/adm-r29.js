// ═══════════════════════════════════════════════════════════════
// adm-r29.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  function isMobile(){ return window.matchMedia('(max-width: 920px)').matches; }
  function isDesktop(){ return window.matchMedia('(min-width: 921px)').matches; }

  // ── 1) 모바일 — 좌측 엣지 스와이프로 사이드바 열기 ──
  function bindEdgeSwipe(){
    var zone = document.getElementById('ph135-edge-zone');
    if (!zone || zone.__ph135) return;
    zone.__ph135 = true;

    var startX = 0, startY = 0, tracking = false;

    zone.addEventListener('touchstart', function(e){
      var t = e.touches[0];
      if (t.clientX > 20) return; // 엣지에서만
      startX = t.clientX; startY = t.clientY; tracking = true;
    }, { passive: true });

    zone.addEventListener('touchmove', function(e){
      if (!tracking) return;
      var t = e.touches[0];
      var dx = t.clientX - startX;
      var dy = Math.abs(t.clientY - startY);
      // 가로 우측 스와이프 + 수직 움직임 작을 때만 (의도 분리)
      if (dx > 30 && dy < 40) {
        tracking = false;
        if (window.ph134Open) window.ph134Open();
        console.log('[ph135] 엣지 스와이프 — 사이드바 열림');
      }
    }, { passive: true });

    zone.addEventListener('touchend', function(){ tracking = false; });

    // 클릭/탭 으로도 열림 (스와이프 모르는 사용자용)
    zone.addEventListener('click', function(){
      if (isMobile() && window.ph134Open) {
        window.ph134Open();
        console.log('[ph135] 엣지 탭 — 사이드바 열림');
      }
    });
  }

  // ── 2) 모바일 — 사이드바를 좌로 스와이프하면 닫기 ──
  function bindSidebarSwipeClose(){
    var sidebar = document.getElementById('admin-sidebar');
    if (!sidebar || sidebar.__ph135swipe) return;
    sidebar.__ph135swipe = true;

    var startX = 0, startY = 0, currentDx = 0, tracking = false;

    sidebar.addEventListener('touchstart', function(e){
      if (!isMobile() || !document.body.classList.contains('ph134-sidebar-open')) return;
      var t = e.touches[0];
      startX = t.clientX; startY = t.clientY; currentDx = 0; tracking = true;
      sidebar.classList.add('ph135-dragging');
    }, { passive: true });

    sidebar.addEventListener('touchmove', function(e){
      if (!tracking) return;
      var t = e.touches[0];
      var dx = t.clientX - startX;
      var dy = Math.abs(t.clientY - startY);
      // 좌측으로 미는 동작만
      if (dx < 0 && dy < 60) {
        currentDx = dx;
        sidebar.style.transform = 'translateX(' + dx + 'px)';
      }
    }, { passive: true });

    sidebar.addEventListener('touchend', function(){
      if (!tracking) return;
      tracking = false;
      sidebar.classList.remove('ph135-dragging');
      sidebar.style.transform = '';
      // -80px 이상 밀었으면 닫기
      if (currentDx < -80) {
        if (window.ph134Close) window.ph134Close();
        console.log('[ph135] 사이드바 스와이프 닫기');
      }
    });
  }

  // ── 3) 데스크탑 — 미니 모드 ↔ 확장 토글 (핀 버튼) ──
  window.ph135TogglePin = function(){
    if (!isDesktop()) return;
    var body = document.body;
    var sb = document.getElementById('admin-sidebar');
    var pin = document.getElementById('ph135-pin-btn');
    if (body.classList.contains('ph135-mini')) {
      body.classList.remove('ph135-mini');
      if (sb) sb.classList.remove('ph135-pinned');
      if (pin) { pin.classList.remove('is-pinned'); pin.textContent = '📌'; pin.title = '사이드바 미니 모드'; }
      try { localStorage.setItem('ph135_mini', '0'); } catch(e){}
      console.log('[ph135] 미니 모드 해제');
    } else {
      body.classList.add('ph135-mini');
      if (pin) { pin.classList.add('is-pinned'); pin.textContent = '📍'; pin.title = '미니 모드 — 호버 시 펼침'; }
      try { localStorage.setItem('ph135_mini', '1'); } catch(e){}
      console.log('[ph135] 미니 모드 활성 — 호버 시 자동 펼침');
    }
  };

  // localStorage 복원
  try {
    if (localStorage.getItem('ph135_mini') === '1' && isDesktop()) {
      document.body.classList.add('ph135-mini');
      var pin = document.getElementById('ph135-pin-btn');
      if (pin) { pin.classList.add('is-pinned'); pin.textContent = '📍'; }
    }
  } catch(e){}

  // ── 초기화 ──
  function init(){ bindEdgeSwipe(); bindSidebarSwipeClose(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 600);

  // 화면 회전 시 mini 모드 끔 (모바일 시)
  window.addEventListener('resize', function(){
    if (isMobile() && document.body.classList.contains('ph135-mini')) {
      document.body.classList.remove('ph135-mini');
    }
  });

  console.log('[ph135] 사이드바 종합 UX 활성 — 엣지 스와이프/탭, 좌측 스와이프 닫기, 데스크탑 미니 모드');
})();
