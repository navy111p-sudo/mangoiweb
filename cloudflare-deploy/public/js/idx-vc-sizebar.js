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

  /* 🖐 떠 있는(자유 크기) 얼굴 창을 «얼굴 영역» 을 잡고 끌어 옮긴다 (2026-11-10 강사 제보:
     「카메라 창이 필기도구를 가리는데 옮길 수가 없다」).
     [왜] 우상단 그립을 끌면 창이 자유 모드로 떠서 교재 위 도구를 덮는데, 옮기는 손잡이인
          제목줄(.video-size-bar)은 그림 4칸 개편(2026-08-25) 뒤 버튼으로 꽉 차 잡을 자리가 없었다.
     · 위치 계산·저장은 idx-main.js 의 vcApplyFreeBox / vcSaveFreeBox 를 그대로 쓴다.
     · 6px 넘게 움직여야 끌기로 본다 — 타일 안 버튼·탭(칭찬 등)은 그대로 눌린다.
     shortcut: 자유 모드에서는 얼굴 목록의 «터치 스크롤» 이 끌기에 먹힌다(휠 스크롤은 그대로),
               참가자가 많은 반에서 불편하다는 제보가 오면 손잡이를 따로 둘 것. */
  function armPaneDrag() {
    var pane = $('vc-video-pane'), row = $('vc-main-row');
    if (!pane || !row || pane.__vsbDrag) return;
    pane.__vsbDrag = true;
    var st = document.createElement('style');
    /* 둘째 줄: 가로 ≤1024px·높이 ≤600px 미디어쿼리가 얼굴 칸을 position:relative!important 로 못 박아,
       자유 모드의 화면 좌표(left/top)가 «제자리 + 그만큼» 으로 먹어 창이 화면 밖으로 나갔다
       (2026-11-10 실측 1024x700: left 1387). id 두 개로 이긴다 — 클래스로는 못 이긴다. */
    st.textContent = '#vc-main-row.video-free > #vc-video-pane #vc-video-grid{cursor:move;touch-action:none}' +
      'body.vc-in-call #vc-main-row.video-free > #vc-video-pane{position:fixed!important;z-index:60!important}';
    document.head.appendChild(st);
    var s = null;
    function move(e) {
      if (!s) return;
      var dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.on && Math.abs(dx) + Math.abs(dy) < 6) return;
      s.on = true;
      try { window.vcApplyFreeBox({ left: s.l + dx, top: s.t + dy, width: s.w, height: s.h }); } catch (_) {}
      e.preventDefault();
    }
    function end() {
      var moved = s && s.on;
      s = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (!moved) return;
      try { window.vcSaveFreeBox(); } catch (_) {}
      /* 끌고 난 뒤의 click 한 번은 삼킨다 — 놓은 자리의 타일이 «눌린 것» 이 되지 않게 */
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', eat, true);
      setTimeout(function () { document.removeEventListener('click', eat, true); }, 0);
    }
    pane.addEventListener('pointerdown', function (e) {
      if (!row.classList.contains('video-free') || e.button) return;
      var t = e.target;
      /* 제목줄은 idx-main.js 가 이미 옮긴다(두 번 잡지 않는다). 그립은 크기 조절. */
      if (!t || !t.closest || t.closest('button,a,input,select,textarea,.video-size-bar,#vc-vp-grip')) return;
      var r = pane.getBoundingClientRect();
      s = { x: e.clientX, y: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height, on: false };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
    });
  }

  function boot() {
    var bar = $(BAR);
    if (!bar) return;
    armPaneDrag();
    // Keep the existing controls and their role checks/handlers; give them their own
    // wrapping row instead of the overflowing textbook tabs beneath the video pane.
    var content = $('vc-content-pane');
    if (content && !$('vc-operation-controls')) {
      var controls = document.createElement('div');
      controls.id = 'vc-operation-controls';
      content.insertBefore(controls, content.firstChild);
      ['vc-studentctl-label', 'vc-miclock-btn', 'vc-drawlock-btn', 'vc-focuslock-btn'].forEach(function (id) {
        var el = $(id); if (el) controls.appendChild(el);
      });
      var style = document.createElement('style');
      style.textContent = 'body.vc-in-call #vc-operation-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex:0 0 auto;max-width:100%;box-sizing:border-box;padding:6px;background:#172334;position:relative;z-index:61}' +
        '#vc-operation-controls button{max-width:100%;white-space:normal!important;min-height:32px;overflow-wrap:anywhere}' +
        '#vc-operation-controls #vc-studentctl-label{margin-left:0!important;border-left:0!important}' +
        'body:not(.vc-in-call) #vc-operation-controls{display:none}' +
        'body.vc-theme-light #vc-operation-controls{background:#edf2f7}';
      document.body.appendChild(style);
      if (typeof window.vcqOperationMount === 'function') window.vcqOperationMount();
    }

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
