/* 🖥 얼굴 화면 크기 컨트롤 — «레이아웃 그림 4칸»(2안)   2026-08-25
 * ─────────────────────────────────────────────────────────────────────────
 * 왜 만들었나
 *   크기바에 버튼이 7개(1/4·1/2·3/4·전체 + PIP·솔로·자유)라 좁아지면 두 줄로 접혀
 *   수업 화면 위쪽을 먹었다. 폰 세로에서는 아예 display:none 이라 «크기를 바꿀 방법이 0개»,
 *   폰 가로에서는 8.5px 글자로 1/4·3/4 를 숨겨 겨우 넣고 있었다.
 *   → 앞의 넷은 «하나의 축»(얼굴이 차지하는 공간)이므로 결과를 그린 그림 4칸으로 합치고,
 *     수업 중 거의 안 쓰는 뒤의 셋(PIP·솔로·자유)은 «⋯» 안으로 넣었다.
 *
 * ⛔ 이 파일이 «하지 않는» 것 — 크기 계산·CSS 폭 규칙에는 손대지 않는다.
 *    누르면 기존 vcSetVideoSize() 를 그대로 부른다(마크업의 onclick). 여기 있는 것은
 *    ① «지금 어느 칸인가» 표시 맞추기 ② «⋯» 메뉴 여닫기 뿐이다.
 *
 * 🪤 밟지 않으려고 일부러 이렇게 한 것들
 *   · body class 를 MutationObserver 로 지켜보지 않는다.
 *     이 저장소에는 body class 를 자주 다시 쓰는 코드가 여럿이라 콜백이 쉴 새 없이 돌아
 *     메인스레드가 잠긴다(2026-07-14 홈 전체 먹통 전력, CLAUDE.md 2장).
 *     대신 vcSetVideoSize/vcScreenSet 를 «감싸» 그 순간에만 확인한다.
 *   · 상주 setInterval 도 두지 않는다 — 홈에 머무는 학생 폰을 계속 깨운다.
 *   · 표시의 정본은 idx-main.js 가 붙이는 .active 클래스가 아니라
 *     «#vc-main-row 의 모드 클래스» 다. 하단 독 「화면 분할」 시트(vcScreenSet)는
 *     .active 를 건드리지 않아서, .active 만 보면 두 곳이 조용히 어긋난다.
 *   · 첫 화면 무게 예산 여유가 177바이트뿐이라(first_paint_budget_harness)
 *     이 파일은 반드시 defer 로 부른다. index.html 에는 마크업·CSS 만 둔다.
 */
(function () {
  'use strict';

  var BAR = 'vc-size-bar', MORE = 'vc-size-more', MENU = 'vc-size-menu';
  /* #vc-main-row 의 모드 클래스 → 칸의 data-size */
  var SIZE_OF = {
    'video-quarter': 'quarter',
    'video-half': 'half',
    'video-threequarter': 'threequarter',
    'video-full': 'full'
  };

  function $(id) { return document.getElementById(id); }

  /* 지금 어느 칸이 켜져 있는지 화면에서 다시 읽어 표시를 맞춘다.
     ⚠️ pip/solo/free/facepip 처럼 «네 칸 중 어느 것도 아닌» 모드에서는 전부 끈다 —
        아무것도 안 눌린 상태가 사실이다(억지로 하나를 켜면 거짓말이 된다). */
  function sync() {
    var bar = $(BAR);
    if (!bar) return;
    var row = document.getElementById('vc-main-row');
    var cur = '';
    if (row) {
      for (var k in SIZE_OF) {
        if (row.classList.contains(k)) { cur = SIZE_OF[k]; break; }
      }
    }
    var segs = bar.querySelectorAll('.vsb-seg');
    for (var i = 0; i < segs.length; i++) {
      var on = !!cur && segs[i].getAttribute('data-size') === cur;
      segs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      segs[i].classList.toggle('active', on);
    }
  }
  window.vcSizeBarSync = sync;

  /* 원본 함수를 감싸 «그 순간에만» 표시를 맞춘다.
     두 번 감싸지 않게 표시를 남긴다(다른 파일이 같은 함수를 또 감쌀 수 있다). */
  function mk(orig) {
    if (orig.__vsb2) return orig;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { sync(); } catch (e) {}
      return r;
    };
    wrapped.__vsb2 = true;
    return wrapped;
  }

  /* 🔴 이름이 «아직 없을 수도» 있다 — vcScreenSet 은 하단 독 시트와 함께
        «수업에 들어갈 때» 만들어진다(window.vcScreenSet = function…). 이 파일은 defer 라
        그보다 먼저 도므로, 그냥 감싸면 typeof 가 'undefined' 라 조용히 아무 일도 안 한다
        (2026-08-25 실측: 독 시트로 크기를 바꿔도 바 표시가 안 따라왔다).
     ⛔ setInterval 로 «생겼나» 를 기다리지 않는다 — 홈에 머무는 학생 폰을 계속 깨운다.
        대신 그 이름에 접근자를 걸어 두고 **대입되는 순간** 감싼다. */
  function wrap(name) {
    var orig = window[name];
    if (typeof orig === 'function') {
      if (orig.__vsb2) return;
      try { window[name] = mk(orig); } catch (e) {}
      return;
    }
    var box;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () { return box; },
        set: function (fn) { box = (typeof fn === 'function') ? mk(fn) : fn; }
      });
    } catch (e) {}
  }

  function closeMenu() {
    var m = $(MENU), b = $(MORE);
    if (m) m.hidden = true;
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  function boot() {
    var bar = $(BAR);
    if (!bar) return;

    var more = $(MORE), menu = $(MENU);
    if (more && !more.__vsb2) {
      more.__vsb2 = true;
      more.addEventListener('click', function (e) {
        if (!menu) return;
        e.stopPropagation();
        var open = menu.hidden;
        menu.hidden = !open;
        more.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    /* 메뉴 안 버튼은 자기 onclick(vcTogglePip 등)이 먼저 돌고 나서 닫는다 */
    if (menu && !menu.__vsb2) {
      menu.__vsb2 = true;
      menu.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('button')) setTimeout(closeMenu, 0);
      });
    }
    /* 바깥을 누르면 닫기 — 캡처 단계로 받는다.
       ⚠️ 이 화면에는 클릭을 가로채는 핸들러가 여럿이라 버블링만 믿으면 안 닫힐 수 있다. */
    document.addEventListener('pointerdown', function (e) {
      var t = e.target;
      if (!t || !t.closest) { closeMenu(); return; }
      if (!t.closest('#' + MENU) && !t.closest('#' + MORE)) closeMenu();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    wrap('vcSetVideoSize');
    wrap('vcScreenSet');
    wrap('vcToggleFreeResize');
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
