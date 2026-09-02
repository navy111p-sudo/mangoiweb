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

  /* @param {string} [fallbackUrl] 히스토리도 referrer 도 없을 때 갈 곳. 안 주면 홈(/admin* 은 /admin.html).
       화면마다 «돌아갈 곳» 이 다르기 때문이다 — 게임 안 학습화면은 홈이 아니라 게임 허브로 가야 한다.
     @param {{sameOriginOnly?:boolean}} [opts] true 면 «앞 화면이 우리 사이트일 때만» 뒤로 간다
       (밖에서 들어온 사람을 밖으로 되돌려보내지 않고 홈으로 보낸다 — 웜업이 그 정책이었다). */
  function goBack(fallbackUrl, opts) {
    /* ⚠️ 첫 인자로 Event 가 올 수 있다 — 이 파일 안에 `b.onclick = goBack` 자리가 있고,
          리스너의 첫 인자는 Event 라 «항상 truthy» 다(이 저장소가 이미 밟은 함정).
          그래서 «문자열일 때만» 폴백으로 인정한다. */
    var fallback = (typeof fallbackUrl === 'string' && fallbackUrl)
      ? fallbackUrl
      : ((p.indexOf('/admin') === 0) ? '/admin.html' : '/');
    var sameOriginOnly = !!(opts && opts.sameOriginOnly);
    var sameRef = false;
    try {
      var r0 = document.referrer || '';
      sameRef = r0.indexOf(location.origin + '/') === 0;
    } catch (e) {}
    try {
      if (history.length > 1 && (!sameOriginOnly || sameRef)) { history.back(); return; }
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

  /* 🔗 (2026-09-01) 다른 화면이 «자기 헤더에 이미 있는 ←» 에 이 판정을 붙일 수 있게 내보낸다.
     왜 내보내나: 「직전 페이지로 가되, 히스토리가 없으면 같은 오리진 referrer, 그것도 없으면
     홈」이라는 판정을 화면마다 복제하면 한쪽만 고쳐진다(이 저장소가 반복해서 밟은 형태).
     ⚠️ 이 파일은 홈 화면(/, /index.html, /admin.html, /admin)에서 맨 위에서 곧바로 return 하므로
        그 화면에는 이 함수가 «없다» — 부르는 쪽은 반드시 「있으면 쓴다」로 감싸고, 없을 때를
        위해 `href` 를 남겨 두세요(그러면 최악이어도 홈으로는 갑니다).
     ⚠️ 이 파일은 `?v=` 없이 실려 캐시에 옛 사본이 남을 수 있다 — 그때도 위 폴백으로 버팁니다. */
  window.mangoiGoBack = goBack;

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
