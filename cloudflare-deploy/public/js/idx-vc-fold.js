/* idx-vc-fold.js — 펼친 폴더블·태블릿 «넓은 화면» 수업 + 교재 확대 (2026-08-25)
   ─────────────────────────────────────────────────────────────────────────────
   짝: css/vc-fold.css. 왜 필요한지는 그 파일 머리말에 다 적어 두었다.
   여기서는 CSS 로 못 하는 네 가지만 한다.

     ⓐ body 에 «넓은 화면» 표시(vc-wide)를 붙였다 뗀다 — 폴드를 접고 펼 때마다.
     ⓑ 세로폰 전용 모드(PIP·얼굴PIP·자유크기)로 들어와 있으면 1/2 로 되돌린다.
        그 모드들은 얼굴을 «떠 있는 창» 으로 만들어 교재를 덮는다.
     ⓒ 상대(교사) 영상을 타일에 꽉 채운다(object-fit:cover).
        ⚠️ CSS 로는 못 이긴다 — idx-main.js 의 vcSmartFitVideo 가 **인라인 !important**
           로 contain 을 박는데, 그 조건이 «≤920 + 세로» 라 펼친 폴드는 빠진다.
           그래서 16:9 교사 영상이 위아래 검은 띠로 작아 보였다(제보 ②).
           인라인을 이기는 방법은 인라인뿐이라 style 속성을 지켜보다 되돌린다.
     ⓓ 「선생님은 교재를 키웠는데 학생은 그대로」(제보 ⑤) — 교사의 확대 배율을
        학생에게 보낸다. 서버(video-call-room.ts)의 일반 중계 목록에
        'pdf-zoom' 한 줄을 더해 두었다.

   ⚠️ 이 파일은 반드시 defer 다. index.html 첫 화면 blocking 예산의 여유가
      **100바이트 남짓**이라(CLAUDE.md 「첫 화면 예산」 함정) 여기에 넣는 것이
      idx-main.js 에 한 줄 더하는 것보다 안전하다.
   ⚠️ body 의 class 를 MutationObserver 로 «상시» 지켜보지 않는다 — 홈 전체를
      멎게 한 전력이 있다(CLAUDE.md). 크기 변화(resize/orientationchange)와
      «수업 화면이 켜지는 순간» 에만 확인한다. */
(function () {
  'use strict';

  /* 짧은 변 600px 이상 · 짧은변/긴변 0.62 이상 · 폭 1024px 이하 = «넓은 화면».
     실측 근거 — 폰 세로 390×844(비 0.46, 짧은 변 390) 는 걸리지 않고,
     펼친 Z 폴드 738×830(비 0.89) · 아이패드 세로 768×1024(비 0.75) 는 걸린다.
     PC(≥1025)는 이미 제 레이아웃이 있으므로 건드리지 않는다. */
  var MIN_SIDE = 600, MIN_RATIO = 0.62, MAX_W = 1024;

  function isWide() {
    var w = window.innerWidth || 0, h = window.innerHeight || 0;
    if (!w || !h || w > MAX_W) return false;
    var lo = Math.min(w, h), hi = Math.max(w, h);
    return lo >= MIN_SIDE && (lo / hi) >= MIN_RATIO;
  }

  function inCall() { return document.body.classList.contains('vc-in-call'); }
  function isStaff() {
    var r = String(window.vcMyRole || '');
    return r === 'teacher' || r === 'admin';
  }

  /* ⓑ 세로폰 전용 «떠 있는 얼굴창» 모드는 넓은 화면에서 교재를 덮는다 → 1/2 로 되돌린다.
     ⛔ 사용자가 «전체»·«솔로» 를 고른 것은 존중한다(일부러 고른 것이다).
     ⛔ **넓은 화면으로 «바뀌는 순간» 에만** 부른다 — 매 resize 마다 부르면 태블릿에서
        주소창이 접히기만 해도 사용자가 고른 PIP 가 계속 반강제로 풀린다.
     ⚠️ `vcScreenSet` 의 초기화 목록에는 **`video-free` 가 없다**(idx-main.js 3368행).
        게다가 자유크기는 `#vc-video-pane` 에 인라인 top/left/width/height 를 박아 둔다 —
        그 둘을 함께 걷는 것은 `vcSetVideoSize()` 뿐이라 먼저 그것을 부른다.
        그 다음 `vcScreenSet('half')` 도 부르는 이유는, 세로 진입 기본값(pip)을 다시
        입히는 idx-vc-screenmode 의 maybeDefault 에게 «사용자가 골랐다» 고 알리기 위함이다. */
  var FLOATY = ['video-pip', 'video-facepip', 'video-free'];
  function normalizeMode() {
    try {
      var row = document.getElementById('vc-main-row');
      if (!row || !inCall()) return;
      var hit = FLOATY.some(function (c) { return row.classList.contains(c); });
      if (!hit) return;
      if (typeof window.vcSetVideoSize === 'function') window.vcSetVideoSize('half');
      if (typeof window.vcScreenSet === 'function') window.vcScreenSet('half');
    } catch (e) {}
  }

  /* ⓒ 상대 타일 꽉 채우기 — vcSmartFitVideo 가 인라인으로 contain 을 박은 뒤 되돌린다.
     ⛔ 두 가지는 건드리지 않는다:
        · 내 타일(#vc-local-box) — 가상배경·세로 카메라의 잘림 방지가 거기 걸려 있다(2026-07-13).
        · `.vid-portrait` 타일 — 상대가 «세로 카메라» 인 경우다. index.html 의
          <style id="vid-portrait-fix"> 가 일부러 contain 으로 두어 얼굴이 안 잘리게 한다.
          cover 로 덮으면 그 의도를 지우게 된다. */
  var _coverRaf = 0;
  function enforceCover() {
    if (!document.body.classList.contains('vc-wide')) return;
    try {
      var vs = document.querySelectorAll('#vc-video-grid .video-box:not(#vc-local-box):not(.vid-portrait) video');
      for (var i = 0; i < vs.length; i++) {
        // 이미 cover 면 쓰지 않는다 — 안 그러면 감시자가 제 글씨를 보고 또 돈다
        if (vs[i].style.objectFit !== 'cover') vs[i].style.setProperty('object-fit', 'cover', 'important');
      }
    } catch (e) {}
  }
  function scheduleCover() {
    if (_coverRaf) return;
    _coverRaf = requestAnimationFrame(function () { _coverRaf = 0; enforceCover(); });
  }
  var _coverObs = null;
  function watchCover() {
    if (_coverObs) return;
    var grid = document.getElementById('vc-video-grid');
    if (!grid || !window.MutationObserver) return;
    // 얼굴 격자 «안» 의 style/타일 추가만 본다. body class 감시와는 무게가 다르다.
    _coverObs = new MutationObserver(scheduleCover);
    _coverObs.observe(grid, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
  }

  /* 교재를 다시 맞춰 그린다 — 얼굴 칸 폭이 바뀌면 교재 칸도 바뀌는데,
     그때는 window resize 가 안 난다(창 크기는 그대로다). 그래서 교재 상자를 직접 본다.
     ⚠️ 되돌이(ResizeObserver 루프) 방지: 12px 넘게 달라졌을 때만, 400ms 에 한 번만. */
  var _lastW = 0, _lastH = 0, _lastAt = 0, _fitTimer = null;
  function refitTextbook(force) {
    try {
      var wrap = document.getElementById('pdf-scroll-wrap');
      if (!wrap || typeof window.pdfRender !== 'function') return;
      var w = wrap.clientWidth, h = wrap.clientHeight;
      if (!w || !h) return;
      var now = Date.now();
      if (!force && Math.abs(w - _lastW) < 12 && Math.abs(h - _lastH) < 12) return;
      if (now - _lastAt < 400) return;
      _lastW = w; _lastH = h; _lastAt = now;
      window.pdfRender();          // 교재가 없으면 그 함수가 스스로 곧바로 돌아온다
    } catch (e) {}
  }
  function scheduleRefit(force) {
    if (_fitTimer) clearTimeout(_fitTimer);
    _fitTimer = setTimeout(function () { _fitTimer = null; refitTextbook(force); }, 250);
  }
  var _fitObs = null;
  function watchTextbook() {
    if (_fitObs || !window.ResizeObserver) return;
    var wrap = document.getElementById('pdf-scroll-wrap');
    if (!wrap) return;
    _fitObs = new ResizeObserver(function () { scheduleRefit(false); });
    _fitObs.observe(wrap);
  }

  function apply() {
    var on = isWide();
    var had = document.body.classList.contains('vc-wide');
    if (on !== had) document.body.classList.toggle('vc-wide', on);
    if (on && !had) normalizeMode();       // «바뀌는 순간» 에만 — 위 ⓑ 주석 참고
    if (on) scheduleCover();
    if (inCall()) { watchCover(); watchTextbook(); scheduleRefit(on !== had); }
  }

  /* ⓓ 교재 확대 동기화 — 교사가 키우면 학생 화면도 같이 커진다.
     ⛔ 학생 → 교사 방향은 보내지 않는다(각자 보던 배율이 제멋대로 바뀐다).
     보내는 쪽에 role 을 실어 두고 받는 쪽에서 한 번 더 거른다 — 다른 중계
     (device-report·quiz-pick 등)와 같은 규칙이다. */
  var _remote = false, _sendAt = 0, _sendTimer = null, _pending = 0;
  function sendZoom(z) {
    try {
      var c = window.vcConn;
      if (!c || typeof c.send !== 'function') return;
      c.send({ type: 'pdf-zoom', data: { zoom: z, role: window.vcMyRole || '' } });
    } catch (e) {}
  }
  function queueZoom(z) {
    _pending = z;
    var now = Date.now();
    if (now - _sendAt > 200) { _sendAt = now; sendZoom(_pending); return; }
    if (_sendTimer) return;
    _sendTimer = setTimeout(function () {
      _sendTimer = null; _sendAt = Date.now(); sendZoom(_pending);
    }, 220);
  }

  function wrapZoom() {
    var orig = window.pdfSetZoom;
    if (typeof orig !== 'function' || orig.__foldWrap) return;
    /* ⚠️ pdfSetZoom 은 «최상위 function 선언» 이라 전역 변수와 window 속성이 같은 칸이다.
       그래서 window 에 덮으면 pdfZoomIn()·더블탭 같은 내부 호출도 이 함수를 지난다. */
    var f = function (z) {
      var out = orig.apply(this, arguments);
      if (!_remote && isStaff() && inCall()) queueZoom(out);
      return out;
    };
    f.__foldWrap = 1;
    window.pdfSetZoom = f;
  }

  function wrapHandler() {
    var orig = window.vcHandleMessage;
    if (typeof orig !== 'function' || orig.__foldWrap) return;
    var h = function (msg) {
      try {
        if (msg && msg.type === 'pdf-zoom') {
          var d = msg.data || {};
          var z = Number(d.zoom);
          var fromStaff = (d.role === 'teacher' || d.role === 'admin');
          if (isFinite(z) && z > 0 && fromStaff && !isStaff() && typeof window.pdfSetZoom === 'function') {
            _remote = true;
            try { window.pdfSetZoom(z); } finally { _remote = false; }
          }
          return;                       // 이 종류는 여기서 끝 — 원래 처리기에 없다
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    h.__foldWrap = 1;
    window.vcHandleMessage = h;
  }

  /* 📏 핀치 확대 보강 — idx-main.js 의 ph260 핀치는 vcJoinRoom «안» 에서 붙는다.
     그 전에(또는 그 설치가 늦어) 손가락으로 키워도 안 되는 구간이 있다.
     여기 것은 계산식이 같아(시작 거리 대비 배율) 둘이 함께 있어도 같은 값이 나온다. */
  function installPinch() {
    var wrap = document.getElementById('pdf-scroll-wrap');
    if (!wrap || wrap.__foldPinch) return;
    wrap.__foldPinch = 1;
    var d0 = 0, z0 = 1, on = false, raf = 0;
    function dist(a, b) { var x = a.clientX - b.clientX, y = a.clientY - b.clientY; return Math.sqrt(x * x + y * y); }
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 2) return;
      on = true; d0 = dist(e.touches[0], e.touches[1]);
      z0 = (typeof window.pdfGetZoom === 'function') ? window.pdfGetZoom() : 1;
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (!on || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      var z = z0 * (dist(e.touches[0], e.touches[1]) / (d0 || 1));
      z = Math.max(0.05, Math.min(5, z));
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (typeof window.pdfSetZoom === 'function') window.pdfSetZoom(z);
      });
    }, { passive: false });
    // ⚠️ touchcancel 도 받는다 — 브라우저가 제스처를 가져가면 touchend 는 안 온다
    function off() { on = false; }
    wrap.addEventListener('touchend', off);
    wrap.addEventListener('touchcancel', off);

    /* 🤚 한 손가락 이동도 여기서 한 벌 더 받는다.
       css/vc-fold.css 가 touch-action:none 을 걸어 브라우저 스크롤을 껐는데,
       idx-main.js 의 이동 처리는 vcJoinRoom «안» 에서 300~3000ms 뒤에 붙는다 →
       그 사이 교재가 «안 움직이는» 구간이 생긴다. 계산식이 같아(시작점 대비 이동량)
       둘이 함께 있어도 같은 값이 나온다. */
    var sx = 0, sy = 0, ox = 0, oy = 0, pan = false;
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { pan = false; return; }
      if (document.querySelector('.pdf-anno.active')) return;   // 필기 중이면 그리는 쪽 일이다
      var t = e.touches[0];
      sx = t.clientX; sy = t.clientY; ox = wrap.scrollLeft; oy = wrap.scrollTop; pan = true;
    }, { passive: true });
    wrap.addEventListener('touchmove', function (e) {
      if (!pan || on || e.touches.length !== 1) return;
      var t = e.touches[0];
      /* ⚠️ `wrap.scrollLeft = …` 로 쓰면 CSS 의 scroll-behavior:smooth 가 걸려
         매 프레임 애니메이션이 새로 시작돼 «거의 안 움직인다»(실측 0px).
         scrollTo 의 behavior:'auto' 는 그 CSS 를 이 호출에서만 무시한다. */
      var nx = ox - (t.clientX - sx), ny = oy - (t.clientY - sy);
      if (wrap.scrollTo) wrap.scrollTo({ left: nx, top: ny, behavior: 'auto' });
      else { wrap.scrollLeft = nx; wrap.scrollTop = ny; }
    }, { passive: true });
    function panOff() { pan = false; }
    wrap.addEventListener('touchend', panOff);
    wrap.addEventListener('touchcancel', panOff);
  }

  function boot() {
    apply();
    wrapZoom();
    wrapHandler();
    installPinch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('resize', function () { setTimeout(apply, 60); });
  window.addEventListener('orientationchange', function () { setTimeout(apply, 320); });
  /* 수업에 들어가는 순간에도 한 번 — 그때 처음으로 얼굴 격자·교재 상자가 생긴다.
     showView 를 감싼다(상시 감시 대신, CLAUDE.md 「body class 감시 금지」). */
  try {
    var _sv = window.showView;
    if (typeof _sv === 'function' && !_sv.__foldWrap) {
      var w = function () {
        var r = _sv.apply(this, arguments);
        setTimeout(boot, 300); setTimeout(boot, 1500);
        return r;
      };
      w.__foldWrap = 1;
      window.showView = w;
    }
  } catch (e) {}
})();
