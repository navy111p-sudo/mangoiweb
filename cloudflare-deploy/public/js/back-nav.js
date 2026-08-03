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
    /* (2026-08-03) 히스토리가 없는 진입 — 앱/PWA 첫 화면, 카톡·문자 링크, target=_blank 새 탭 —
       에서는 back() 이 아무 데도 못 간다. 여기서 곧장 홈으로 보내면 ← 가 [🏠 홈] 버튼과
       똑같아진다. 같은 사이트에서 넘어온 흔적(referrer)이 있으면 그 페이지를 직전 페이지로 본다.
       사장님 지시: "뒤로가기는 바로 직전 페이지로, 홈 버튼은 처음 페이지로." */
    try {
      var ref = document.referrer || '';
      if (ref.indexOf(location.origin + '/') === 0 &&
          ref.split('#')[0] !== location.href.split('#')[0]) {
        location.href = ref; return;
      }
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
