/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Mangoi 공통 뒤로가기 버튼 (Phase BK)
   - 좌측 상단에 ← 버튼을 자동 주입 (이미 보이는 ← / ‹ 버튼이 있으면 생략)
   - history.back() 우선, 히스토리가 없으면 홈(/) 또는 /admin.html 로 이동
   - 학생/관리자 공용 · 모바일 반응형 · 글로벌 바([🏠][🌐], 우측 상단)와 충돌 없음
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';
  var p = location.pathname;
  // 홈 화면(학생 메인/관리자 메인)에서는 뒤로 갈 곳이 없으므로 표시하지 않음
  if (p === '/' || p === '/index.html' || p === '/admin.html' || p === '/admin') return;
  if (window.__mangoiBackNav) return;
  window.__mangoiBackNav = true;

  function hasVisibleBack() {
    try {
      var els = document.querySelectorAll('a,button');
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || '').trim();
        if (!t) continue;
        if ((t.charAt(0) === '←' || t.charAt(0) === '‹') && els[i].offsetParent !== null) return true; // ← or ‹
      }
    } catch (e) {}
    return false;
  }

  function goBack() {
    var fallback = (p.indexOf('/admin') === 0) ? '/admin.html' : '/';
    try {
      if (history.length > 1) { history.back(); return; }
    } catch (e) {}
    location.href = fallback;
  }

  function inject() {
    if (document.getElementById('mangoi-back-btn')) return;
    if (hasVisibleBack()) return; // 이미 뒤로가기 표시가 있는 페이지는 생략
    if (!document.body) return;

    var isMobile = window.innerWidth <= 480;
    var b = document.createElement('button');
    b.id = 'mangoi-back-btn';
    b.type = 'button';
    b.title = '뒤로 가기';
    b.setAttribute('aria-label', '뒤로 가기 (이전 페이지)');
    b.innerHTML = '<span style="line-height:1;display:block;transform:translateY(-1px)">←</span>';
    b.style.cssText = [
      'position:fixed',
      'top:' + (isMobile ? '8px' : '14px'),
      'left:' + (isMobile ? '8px' : '14px'),
      'z-index:99999',
      'width:' + (isMobile ? '34px' : '38px'),
      'height:' + (isMobile ? '34px' : '38px'),
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(20,33,59,0.92)',
      'color:#fbbf24',
      'border:1px solid rgba(251,191,36,0.50)',
      'border-radius:99px',
      'font-size:' + (isMobile ? '16px' : '18px'),
      'font-weight:800',
      'cursor:pointer',
      'box-shadow:0 6px 18px -2px rgba(0,0,0,0.4)',
      'backdrop-filter:blur(8px)',
      '-webkit-backdrop-filter:blur(8px)',
      'transition:all .15s',
      'user-select:none',
      '-webkit-tap-highlight-color:transparent',
      'padding:0'
    ].join(';');
    b.onmouseenter = function () { b.style.background = 'rgba(251,191,36,0.22)'; b.style.transform = 'translateY(-1px)'; };
    b.onmouseleave = function () { b.style.background = 'rgba(20,33,59,0.92)'; b.style.transform = 'none'; };
    b.onclick = goBack;
    document.body.appendChild(b);
  }

  // i18n 글로벌 바 등 다른 주입 스크립트가 끝난 뒤 검사하도록 약간 지연
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(inject, 350); });
  } else {
    setTimeout(inject, 350);
  }
})();
