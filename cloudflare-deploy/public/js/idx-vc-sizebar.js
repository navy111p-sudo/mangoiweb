/* 🖥 얼굴 크기 컨트롤 «그림 4칸»(2안) — 표시 맞추기 + «⋯» 메뉴 여닫기만 한다.
 * 크기 계산·CSS 폭 규칙에는 손대지 않는다(누르면 마크업의 onclick 이 vcSetVideoSize 를 그대로 부른다).
 *
 * ⛔ body class 를 MutationObserver 로 지켜보지 말 것 — 2026-07-14 홈 전체 먹통 전력.
 * ⛔ 상주 setInterval 도 두지 말 것 — 홈에 머무는 학생 폰을 계속 깨운다.
 * ⛔ index.html 에서 반드시 defer 로 부를 것 — 첫 화면 blocking 예산이 수백 바이트뿐이다.
 * ⚠️ 표시의 정본은 .active 클래스가 아니라 «#vc-main-row 의 모드 클래스» 다
 *    (하단 독 시트 vcScreenSet 은 .active 를 안 건드려 두 곳이 조용히 어긋난다).
 * ⚠️ vcScreenSet 은 «수업 입장 때» 만들어진다 — 그래서 접근자로 대입 순간을 낚아챈다.
 *
 * 📜 왜 이렇게 했는지: docs/작업기록/260825_얼굴크기컨트롤_그림4칸_2안.md
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

  /* 바깥을 누르면 닫기 — «메뉴가 열려 있는 동안만» 문서에 붙인다.
     ⛔ 상시로 달아 두면 수업 내내 모든 탭·클릭마다 이 함수가 돕니다.
        필리핀·중국 회선의 저사양 폰을 생각하면 안 도는 것이 제일 가볍습니다.
     ⚠️ 캡처 단계인 이유 — 이 화면에는 클릭을 가로채는 핸들러가 여럿이라
        버블링만 믿으면 메뉴가 안 닫힙니다. */
  function onDocDown(e) {
    var t = e.target;
    if (!t || !t.closest) { closeMenu(); return; }
    if (!t.closest('#' + MENU) && !t.closest('#' + MORE)) closeMenu();
  }
  function onDocKey(e) { if (e.key === 'Escape') closeMenu(); }

  function openMenu(open) {
    var m = $(MENU), b = $(MORE);
    if (!m || !b) return;
    m.hidden = !open;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey);
    if (open) {
      document.addEventListener('pointerdown', onDocDown, true);
      document.addEventListener('keydown', onDocKey);
    }
  }
  function closeMenu() { openMenu(false); }

  function boot() {
    var bar = $(BAR);
    if (!bar) return;

    var more = $(MORE), menu = $(MENU);
    if (more && !more.__vsb2) {
      more.__vsb2 = true;
      more.addEventListener('click', function (e) {
        if (!menu) return;
        e.stopPropagation();
        openMenu(menu.hidden);
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

    wrap('vcSetVideoSize');
    wrap('vcScreenSet');
    wrap('vcToggleFreeResize');
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
