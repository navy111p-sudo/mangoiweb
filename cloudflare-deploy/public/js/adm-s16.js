// ═══════════════════════════════════════════════════════════════
// adm-s16.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  function isMobile(){ return window.matchMedia('(max-width: 920px)').matches; }

  function getSidebar(){
    return document.getElementById('admin-sidebar') || document.querySelector('.admin-sidebar');
  }

  function setState(open){
    var sb = getSidebar();
    var btn = document.getElementById('ph142-toggle');
    var body = document.body;
    if (!sb) return;

    if (open && isMobile()) {
      sb.style.setProperty('transform', 'translateX(0)', 'important');
      body.classList.add('ph142-open');
      if (btn) { btn.textContent = '✕'; btn.classList.add('is-open'); btn.setAttribute('aria-label', '메뉴 닫기'); }
      console.log('[ph142] 사이드바 열림');
    } else {
      sb.style.setProperty('transform', 'translateX(-100%)', 'important');
      body.classList.remove('ph142-open');
      if (btn) { btn.textContent = '☰'; btn.classList.remove('is-open'); btn.setAttribute('aria-label', '메뉴 열기'); }
      console.log('[ph142] 사이드바 닫힘');
    }
  }

  function toggle(){
    if (!isMobile()) return;
    setState(!document.body.classList.contains('ph142-open'));
  }

  // 전역 함수로도 expose (다른 코드 호환)
  window.ph142Toggle = toggle;
  window.ph142Open = function(){ setState(true); };
  window.ph142Close = function(){ setState(false); };
  // 이전 ph134/ph141 API 호환
  window.ph134Toggle = toggle;
  window.ph134Open = window.ph142Open;
  window.ph134Close = window.ph142Close;

  // 1) 토글 버튼 클릭
  function bindToggle(){
    var btn = document.getElementById('ph142-toggle');
    if (!btn || btn.__ph142) return;
    btn.__ph142 = true;
    btn.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      toggle();
    });
  }

  // 2) 오버레이 클릭 → 닫힘
  function bindOverlay(){
    var ov = document.getElementById('ph142-overlay');
    if (!ov || ov.__ph142) return;
    ov.__ph142 = true;
    ov.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      setState(false);
    });
  }

  // 3) 본문 영역 클릭 → 닫힘 (사이드바/토글 제외)
  document.addEventListener('click', function(e){
    if (!isMobile()) return;
    if (!document.body.classList.contains('ph142-open')) return;
    var inside = e.target.closest('.admin-sidebar, #admin-sidebar, #ph142-toggle, #ph142-overlay');
    if (inside) {
      // 사이드바 안의 메뉴/링크 선택 시 자동 닫힘
      var link = e.target.closest('a[href], .sidebar-item, [data-menu-target]');
      if (link && (link.closest('.admin-sidebar') || link.closest('#admin-sidebar'))) {
        setTimeout(function(){ setState(false); }, 200);
      }
      return;
    }
    setState(false);
  }, true);

  // 4) ESC 키
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') setState(false);
  });

  // 5) 화면 리사이즈 / 회전
  window.addEventListener('resize', function(){
    if (!isMobile()) setState(false);
  });

  // 6) 페이지 로드 시 강제 닫힘
  function init(){
    bindToggle();
    bindOverlay();
    setState(false);  // 시작 시 무조건 닫힘
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  setTimeout(init, 500);
  setTimeout(init, 1500);

  console.log('[ph142] 단일 사이드바 toggle FINAL 활성 — 노란 ☰ 탭 = 열기/닫기');
})();
