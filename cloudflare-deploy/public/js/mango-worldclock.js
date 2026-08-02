/* ───────────────────────────────────────────────────────────────
 * mango-worldclock.js — 🇰🇷한국시간 · 🇵🇭필리핀시간 플로팅 듀얼 시계
 *  · 어디에도 겹치지/가리지 않음: 아주 작은 반투명 캡슐, 드래그로 이동 가능
 *  · 위치는 localStorage에 기억 (화면 벗어나면 자동 보정)
 *  · 마우스/터치 드래그로 움직이고, "탭(클릭)"하면 이동(기본 홈 '/')
 *  · 빼면 즉시 원복: 이 <script> 한 줄만 제거하면 됨
 *  적용: index.html(학생·수업입장), admin.html(관리자), parent.html(마이페이지)
 * ─────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.__mangoWorldClock) return;      // 중복 로드 방지
  window.__mangoWorldClock = true;

  // 클릭 시 이동할 곳 (data-clock-go 속성으로 페이지별 덮어쓰기 가능)
  var GO_URL = (document.currentScript && document.currentScript.getAttribute('data-clock-go')) || '/';
  var LS_KEY = 'mangoWorldClockPos';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    // ── 스타일 ──
    var css = ''
      + '#mgWorldClock{position:fixed;z-index:2147483000;left:12px;bottom:96px;'
      + '  display:flex;flex-direction:column;gap:2px;padding:7px 11px;'
      + '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Malgun Gothic",sans-serif;'
      + '  background:rgba(12,20,40,.62);color:#eaf1ff;border:1px solid rgba(255,255,255,.18);'
      + '  border-radius:14px;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);'
      + '  box-shadow:0 6px 22px rgba(0,0,0,.35);cursor:grab;user-select:none;-webkit-user-select:none;'
      + '  touch-action:none;opacity:.94;transition:opacity .18s,box-shadow .18s;line-height:1.1;'
      + '  min-width:118px}'
      + '#mgWorldClock:hover{opacity:1;box-shadow:0 8px 28px rgba(0,0,0,.5)}'
      + '#mgWorldClock.dragging{cursor:grabbing;opacity:.85}'
      + '#mgWorldClock .mgwc-row{display:flex;align-items:center;justify-content:space-between;gap:8px;white-space:nowrap}'
      + '#mgWorldClock .mgwc-lbl{font-size:11px;font-weight:600;opacity:.82}'
      + '#mgWorldClock .mgwc-time{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.3px}'
      + '#mgWorldClock .mgwc-sep{height:1px;background:rgba(255,255,255,.13);margin:1px 0}'
      + '#mgWorldClock .mgwc-hint{font-size:9px;opacity:.5;text-align:center;margin-top:1px}'
      + '#mgWorldClock .mgwc-close{position:absolute;top:-8px;right:-8px;width:20px;height:20px;'
      + '  border-radius:50%;background:rgba(18,26,48,.96);border:1px solid rgba(255,255,255,.4);'
      + '  color:#eaf1ff;font-size:12px;font-weight:700;line-height:1;display:flex;align-items:center;'
      + '  justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.45);'
      + '  transition:background .15s,transform .15s;z-index:1}'
      + '#mgWorldClock .mgwc-close:hover{background:rgba(220,60,60,.95);transform:scale(1.12)}'
      + '#mgWorldClock.mgwc-off{display:none!important}'
      + '@media(max-width:600px){#mgWorldClock{padding:6px 9px;min-width:104px;left:8px;bottom:78px}'
      + '  #mgWorldClock .mgwc-time{font-size:13px}'
      + '  #mgWorldClock .mgwc-close{width:22px;height:22px;font-size:13px;top:-9px;right:-9px}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    // ── DOM ──
    var box = document.createElement('div');
    box.id = 'mgWorldClock';
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', '한국시간 필리핀시간 · 눌러서 홈으로');
    box.innerHTML =
        '<div class="mgwc-close" id="mgwcClose" role="button" aria-label="시계 닫기" title="시계 닫기">✕</div>'
      + '<div class="mgwc-row"><span class="mgwc-lbl">🇰🇷 한국</span><span class="mgwc-time" id="mgwcKR">--:--:--</span></div>'
      + '<div class="mgwc-sep"></div>'
      + '<div class="mgwc-row"><span class="mgwc-lbl">🇵🇭 필리핀</span><span class="mgwc-time" id="mgwcPH">--:--:--</span></div>'
      + '<div class="mgwc-hint">드래그 이동 · 탭하면 홈</div>';
    document.body.appendChild(box);

    var elKR = box.querySelector('#mgwcKR');
    var elPH = box.querySelector('#mgwcPH');

    // ── 표시/숨김 관리 ──
    //  · 사용자가 X로 끄면(userHidden) localStorage에 기억 → 계속 숨김
    //  · 사이드바/메뉴(드로어)가 열려 있는 동안엔 시계가 메뉴를 가리지 않도록 자동 숨김
    var HIDE_KEY = 'mangoWorldClockHidden';
    var userHidden = false;
    try { userHidden = localStorage.getItem(HIDE_KEY) === '1'; } catch (e) {}

    // 열리면 화면을 덮어 시계와 겹치는 메뉴/드로어들 (페이지별)
    var MENU_SELECTORS = ['#mg-drawer.open', '#mg-drawer-overlay.open',
                          '.mg-drawer.open', '.drawer.open', '.sidebar.open', 'body.menu-open'];
    function menuOpen() {
      for (var i = 0; i < MENU_SELECTORS.length; i++) {
        try { if (document.querySelector(MENU_SELECTORS[i])) return true; } catch (e) {}
      }
      return false;
    }
    // 📱 [2026-08-02] 모바일 '홈' 화면에서는 시계를 숨긴다 (사장님 지시).
    //   왜: 홈 좌하단은 이미 붐빈다. 수업 시각은 '수업 입장' 쪽에서 보면 되는 정보라,
    //       홈에서까지 초 단위 시계를 띄울 이유가 없다.
    //   ⚠️ 수업 입장(로비·통화 중)에서는 그대로 보인다 — 홈 뷰일 때만 숨긴다.
    //   ⚠️ 이 파일은 admin.html·parent.html 도 함께 쓴다. 그 페이지엔 #view-home 이
    //      없으므로 이 조건은 항상 false 가 되어 아무 영향이 없다.
    //   ⚠️ PC 는 공간이 넉넉하므로 그대로 둔다(모바일 한정).
    //   되돌리려면 아래 함수와 syncVisibility 의 호출 한 곳만 지우면 된다.
    var MOBILE_Q = '(max-width:600px)';        // 위 CSS 의 모바일 분기와 같은 기준
    function hiddenOnMobileHome() {
      try {
        if (!window.matchMedia || !window.matchMedia(MOBILE_Q).matches) return false;
        return !!document.querySelector('#view-home.active');
      } catch (e) { return false; }            // 판정 실패는 '숨기지 않음'으로 (기존 동작 유지)
    }

    function syncVisibility() {
      // toggle(force): 이미 상태가 같으면 속성을 안 건드림 → 옵저버 무한루프 없음
      box.classList.toggle('mgwc-off', userHidden || menuOpen() || hiddenOnMobileHome());
    }
    // 메뉴 열림/닫힘(class 변경)을 감지해 즉시 표시/숨김
    //  (rAF 디바운스 없이 동기 실행: 백그라운드/WebView에서 rAF가 멈춰도 확실히 동작)
    try {
      new MutationObserver(syncVisibility).observe(document.documentElement,
        { subtree: true, attributes: true, attributeFilter: ['class'] });
    } catch (e) {}
    // 모바일↔PC 경계 통과는 matchMedia 로 직접 감지한다 (2026-08-02).
    //   resize 이벤트가 전달되지 않는 환경(개발도구 뷰포트 변경 등)에서도 확실히 발화한다.
    try {
      var mqMobile = window.matchMedia(MOBILE_Q);
      if (mqMobile.addEventListener) mqMobile.addEventListener('change', syncVisibility);
      else if (mqMobile.addListener) mqMobile.addListener(syncVisibility);   // 구형 브라우저
    } catch (e) {}
    syncVisibility();

    // X 버튼: 시계 끄기(기억). 드래그/탭-홈 이벤트로 새지 않게 전파 차단.
    //  · 닫기 동작을 pointerup·click 양쪽에 걸어 터치/마우스/구형에서 모두 확실히 작동
    var closeBtn = box.querySelector('#mgwcClose');
    if (closeBtn) {
      var closeNow = function (e) {
        e.stopPropagation();
        userHidden = true;
        try { localStorage.setItem(HIDE_KEY, '1'); } catch (x) {}
        syncVisibility();
      };
      var eat = function (e) { e.stopPropagation(); };        // 드래그 시작 방지(box로 전파 차단)
      closeBtn.addEventListener('pointerdown', eat);
      closeBtn.addEventListener('mousedown', eat);
      closeBtn.addEventListener('touchstart', eat, { passive: true });
      closeBtn.addEventListener('pointerup', closeNow);
      closeBtn.addEventListener('click', closeNow);
    }

    // ── 시간 포맷 (해당 타임존의 현재 시각) ──
    function fmt(tz) {
      try {
        return new Intl.DateTimeFormat('ko-KR', {
          timeZone: tz, hour12: false,
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).format(new Date());
      } catch (e) { return '--:--:--'; }
    }
    function tick() {
      elKR.textContent = fmt('Asia/Seoul');
      elPH.textContent = fmt('Asia/Manila');
    }

    // ── 시계 구동: 모바일 WebView가 백그라운드에서 setInterval을 멈춰도
    //    화면 복귀 시 즉시 다시 살아나도록 이중으로 보강 ──
    var timer = null;
    function startClock() {
      tick();                                  // 즉시 1회 갱신(멈춤 방지)
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 1000);
    }
    startClock();

    // 탭 복귀 / 앱 포그라운드 / 뒤로가기 복원 시 재동기화 + 인터벌 재가동
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) startClock();
    });
    window.addEventListener('focus', startClock);
    window.addEventListener('pageshow', startClock);   // bfcache 복원(모바일 뒤로가기)

    // ── 위치 복원 + 화면 안으로 보정 ──
    function clamp() {
      var vw = window.innerWidth, vh = window.innerHeight;
      if (!vw || !vh) return;                 // 뷰포트가 아직 0(레이아웃 전)이면 건드리지 않음
      var r = box.getBoundingClientRect();
      // 🛡 [2026-08-02] 숨겨져 있을 때(display:none → rect 가 전부 0)는 보정하지 않는다.
      //   안 막으면 0,0 을 기준으로 계산해 위치를 좌상단(4,4)으로 밀어버리고,
      //   다시 표시될 때 시계가 엉뚱한 자리에 나타난다. 모바일 홈에서 상시 숨김이 되면서
      //   clamp 가 숨김 상태로 실행될 일이 많아졌기 때문에 특히 중요해졌다.
      if (!r.width || !r.height) return;
      var maxX = vw - r.width - 4;
      var maxY = vh - r.height - 4;
      var x = Math.min(Math.max(4, r.left), Math.max(4, maxX));
      var y = Math.min(Math.max(4, r.top), Math.max(4, maxY));
      setPos(x, y);
    }
    function setPos(x, y) {
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    }
    try {
      var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (saved && typeof saved.x === 'number') { setPos(saved.x, saved.y); }
    } catch (e) {}
    // 초기 1프레임 뒤 화면 안 보정 (bottom/left 기본값 → px 좌표화)
    requestAnimationFrame(clamp);
    window.addEventListener('resize', clamp);
    // 📱 화면 회전·창 크기 변경은 MutationObserver(class 감시)로는 안 잡힌다.
    //    모바일↔PC 경계를 넘나들 때 표시 여부를 다시 판정한다.
    window.addEventListener('resize', syncVisibility);
    window.addEventListener('orientationchange', syncVisibility);

    // ── 드래그 (마우스+터치 공용) / 탭 구분 ──
    var dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0, pid = null;
    var DRAG_THRESHOLD = 5; // px 이상 움직이면 드래그(=클릭 아님)

    function down(e) {
      dragging = true; moved = false; pid = e.pointerId;
      var r = box.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      box.classList.add('dragging');
      // 포인터를 위젯에 고정 → 손가락/마우스가 위젯 밖으로 나가도 계속 따라옴
      try { box.setPointerCapture(e.pointerId); } catch (x) {}
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!dragging || (pid !== null && e.pointerId !== pid)) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) moved = true;
      setPos(ox + dx, oy + dy);
      if (e.cancelable) e.preventDefault();
    }
    function up(e) {
      if (!dragging) return;
      dragging = false; pid = null;
      box.classList.remove('dragging');
      try { box.releasePointerCapture(e.pointerId); } catch (x) {}
      clamp();
      if (moved) {
        var r = box.getBoundingClientRect();
        try { localStorage.setItem(LS_KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (x) {}
      } else {
        // 안 움직였으면 = 탭/클릭 → 이동
        if (GO_URL) location.href = GO_URL;
      }
    }

    if (window.PointerEvent) {
      box.addEventListener('pointerdown', down);
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    } else {
      // 아주 오래된 브라우저 폴백 (마우스+터치)
      var wrap = function (fn) { return function (e) { var p = e.touches ? e.touches[0] : e; if (p) { e.clientX = p.clientX; e.clientY = p.clientY; } e.pointerId = 1; fn(e); }; };
      box.addEventListener('mousedown', wrap(down));
      window.addEventListener('mousemove', wrap(move));
      window.addEventListener('mouseup', wrap(up));
      box.addEventListener('touchstart', wrap(down), { passive: false });
      window.addEventListener('touchmove', wrap(move), { passive: false });
      window.addEventListener('touchend', wrap(up));
    }
  });
})();
