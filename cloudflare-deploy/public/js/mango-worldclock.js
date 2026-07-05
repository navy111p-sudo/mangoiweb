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
      + '@media(max-width:600px){#mgWorldClock{padding:6px 9px;min-width:104px;left:8px;bottom:78px}'
      + '  #mgWorldClock .mgwc-time{font-size:13px}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    // ── DOM ──
    var box = document.createElement('div');
    box.id = 'mgWorldClock';
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', '한국시간 필리핀시간 · 눌러서 홈으로');
    box.innerHTML =
        '<div class="mgwc-row"><span class="mgwc-lbl">🇰🇷 한국</span><span class="mgwc-time" id="mgwcKR">--:--:--</span></div>'
      + '<div class="mgwc-sep"></div>'
      + '<div class="mgwc-row"><span class="mgwc-lbl">🇵🇭 필리핀</span><span class="mgwc-time" id="mgwcPH">--:--:--</span></div>'
      + '<div class="mgwc-hint">드래그 이동 · 탭하면 홈</div>';
    document.body.appendChild(box);

    var elKR = box.querySelector('#mgwcKR');
    var elPH = box.querySelector('#mgwcPH');

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
    tick();
    setInterval(tick, 1000);

    // ── 위치 복원 + 화면 안으로 보정 ──
    function clamp() {
      var vw = window.innerWidth, vh = window.innerHeight;
      if (!vw || !vh) return;                 // 뷰포트가 아직 0(레이아웃 전)이면 건드리지 않음
      var r = box.getBoundingClientRect();
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
