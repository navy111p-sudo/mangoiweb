// ═══════════════════════════════════════════════════════════════
// adm-r30.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var autoHideTimer = null;
  var AUTO_HIDE_MS = 3500;  // 3.5초 무동작 시 자동 닫힘

  function isMobile(){ return window.matchMedia('(max-width: 920px)').matches; }

  function openSidebar(){
    if (!isMobile()) return;
    document.body.classList.add('ph134-sidebar-open');
    resetTimer();
    console.log('[ph141] 사이드바 열림 — 3.5초 후 자동 닫힘');
  }

  function closeSidebar(){
    document.body.classList.remove('ph134-sidebar-open');
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
    console.log('[ph141] 사이드바 닫힘');
  }

  function resetTimer(){
    if (autoHideTimer) clearTimeout(autoHideTimer);
    if (!document.body.classList.contains('ph134-sidebar-open')) return;
    autoHideTimer = setTimeout(function(){
      closeSidebar();
      console.log('[ph141] 자동 닫힘 (3.5초 무동작)');
    }, AUTO_HIDE_MS);
  }

  // 기존 ph134 close override
  window.ph134Close = closeSidebar;
  window.ph134Open = openSidebar;
  window.ph134Toggle = function(){
    if (document.body.classList.contains('ph134-sidebar-open')) closeSidebar();
    else openSidebar();
  };

  // 1) 좌측 가장자리 탭 / 인디케이터 탭 → 열림
  function bindEdge(){
    var edge = document.getElementById('ph141-edge');
    var ind = document.getElementById('ph141-edge-indicator');
    [edge, ind].forEach(function(el){
      if (!el || el.__ph141) return;
      el.__ph141 = true;
      el.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        openSidebar();
      });
      el.addEventListener('touchstart', function(e){
        if (!isMobile()) return;
        e.preventDefault();
        openSidebar();
      }, { passive: false });
    });
  }

  // 2) 사이드바 안에서 클릭 / 터치 시 타이머 reset (아직 활성 중)
  function bindSidebarActivity(){
    var sb = document.getElementById('admin-sidebar') || document.querySelector('.admin-sidebar');
    if (!sb || sb.__ph141 ) return;
    sb.__ph141 = true;

    sb.addEventListener('click', function(e){
      resetTimer();
      // 메뉴 항목 (a / 하위 sidebar-item) 클릭 시 자동 닫힘
      var link = e.target.closest('a[href], .sidebar-item, [data-menu-target]');
      if (link) setTimeout(closeSidebar, 200);
    });
    sb.addEventListener('touchstart', resetTimer, { passive: true });
    sb.addEventListener('mouseenter', resetTimer);
  }

  // 3) 본문 영역 클릭 시 즉시 닫힘
  document.addEventListener('click', function(e){
    if (!isMobile()) return;
    if (!document.body.classList.contains('ph134-sidebar-open')) return;
    var inside = e.target.closest('.admin-sidebar, #admin-sidebar, #ph141-edge, #ph141-edge-indicator');
    if (inside) return;
    closeSidebar();
  }, true);

  // 4) 스와이프 닫기 (사이드바 좌로 밀기)
  function bindSwipeClose(){
    var sb = document.getElementById('admin-sidebar') || document.querySelector('.admin-sidebar');
    if (!sb || sb.__ph141swipe) return;
    sb.__ph141swipe = true;
    var sx = 0, sy = 0, dx = 0, tracking = false;
    sb.addEventListener('touchstart', function(e){
      if (!isMobile() || !document.body.classList.contains('ph134-sidebar-open')) return;
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; tracking = true;
    }, { passive: true });
    sb.addEventListener('touchmove', function(e){
      if (!tracking) return;
      var t = e.touches[0]; var d = t.clientX - sx; var dy = Math.abs(t.clientY - sy);
      if (d < 0 && dy < 60) { dx = d; sb.style.transform = 'translateX(' + d + 'px)'; }
    }, { passive: true });
    sb.addEventListener('touchend', function(){
      tracking = false; sb.style.transform = '';
      if (dx < -50) closeSidebar();
    });
  }

  // 5) ESC 키
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') closeSidebar();
  });

  // 6) 화면 회전 / 데스크탑 전환
  window.addEventListener('resize', function(){
    if (!isMobile()) closeSidebar();
  });

  // 초기화
  function init(){
    bindEdge();
    bindSidebarActivity();
    bindSwipeClose();
    closeSidebar();  // 페이지 로드 시 무조건 닫힘 상태
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 600);
  setTimeout(init, 1500);

  console.log('[ph141] 사이드바 자동 hover + 20vw + 3.5초 auto-hide 활성');
})();
