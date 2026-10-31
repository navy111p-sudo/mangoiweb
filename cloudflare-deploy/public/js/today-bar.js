/* ═══════════════════════════════════════════════════════════════════════
 * 📅 today-bar.js — «오늘의 A.i 학습» 에서 열린 도구 화면에 «돌아가기» 알약을 띄운다 (2026-09-03)
 *
 *   왜 필요한가 —
 *     /today.html 이 「1단계 웜업 → 2단계 복습퀴즈 → …」 로 도구를 차례로 열어 주는데,
 *     도구 화면에는 그 순서가 안 보인다. 하나를 끝낸 학생이 «다음이 무엇인지» 모르면
 *     거기서 끝난다(2026-09-03 실측: 최근 30일 AI 도구 사용 학생 60명 중 2개 이상 쓴 학생 7명).
 *
 *   어떻게 —
 *     · 주소에 `?from=today` 가 있으면(또는 이 탭에서 그렇게 들어온 뒤 같은 화면 안에서
 *       이동했으면 — sessionStorage) 화면 아래 가운데에 작은 알약 하나를 그린다.
 *       「📅 오늘의 A.i 학습 2/3 · 돌아가기」 — 누르면 /today.html 로 간다.
 *     · «했나» 판정은 이 파일이 하지 않는다 — /today.html 이 서버(/api/student/today)에서
 *       다시 읽는다(도구마다 «끝» 의 정의가 달라 화면에서 짐작하면 틀린다).
 *
 *   🔴 (2026-09-03 함정 대조 검사) «보이는 것» 과 «손이 닿는 것» 은 다르다 —
 *     처음 판은 bottom:14px 고정이라 AI 친구의 「🚀 다음 활동 고르기」(flow.js, 화면 맨 아래)와
 *     웜업 첫 화면(연령·수준 고르기 오버레이)의 레벨 카드 «가운데» 를 덮었다. 그 자리를 탭하면
 *     도구가 아니라 알약이 눌려 /today.html 로 되돌아간다. 계획의 1단계가 웜업인데 그 첫 화면에서.
 *     ✅ 지금은 그리고 나서 **무엇을 덮는지 잰다**(covers): 알약 상자 안을 격자로 훑어
 *        elementFromPoint 가 «조작 요소»(button · a[href] · input · select · [role=button] · label)
 *        위에 있으면 56px 씩 위로 비켜선다(최대 6번). 그래도 안 비면 화면 위 가운데로 간다.
 *        flow.js 버튼처럼 «나중에 생기는» 것이 있으니 1.2초 뒤와 resize 때 한 번 더 잰다.
 *     ⛔ 상주 MutationObserver·setInterval 금지(홈을 멎게 한 전력) — 잰 횟수가 정해져 있다.
 *     ⛔ 비켜서는 쪽은 언제나 «나중에 온» 이 알약이다. 도구 화면의 버튼을 옮기지 않는다.
 *
 *   ⚠️ 원칙 — 아무것도 막지 않는다. 이 파일이 통째로 실패해도 도구 화면은 그대로 동작한다.
 *   ⚠️ z-index 는 99990 — 수업 화면 독(99993)·재연결 배너(2147483646)보다 «아래».
 *   ⚠️ 아이콘 버튼에 data-ko/data-en 을 달지 않는다 — i18n 엔진이 textContent 를 통째로
 *      갈아 끼운다(CLAUDE.md 2장). 글자는 이 파일이 mangoi_lang 을 읽어 직접 쓴다.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    var KEY = 'mangoi_today_from';
    var q = new URLSearchParams(location.search);
    var here = location.pathname;
    var from = q.get('from') === 'today';
    var step = parseInt(q.get('step') || '0', 10) || 0;
    var total = parseInt(q.get('total') || '0', 10) || 0;
    if (from) {
      try { sessionStorage.setItem(KEY, JSON.stringify({ path: here, step: step, total: total })); } catch (e) {}
    } else {
      try {
        var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
        if (saved && saved.path === here) { from = true; step = saved.step || 0; total = saved.total || 0; }
      } catch (e) {}
    }
    if (!from) return;

    var en = false;
    try { en = (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) {}
    var label = en
      ? ('📅 Today\'s AI plan' + (total ? ' ' + step + '/' + total : '') + ' · back')
      : ('📅 오늘의 A.i 학습' + (total ? ' ' + step + '/' + total : '') + ' · 돌아가기');

    var INTERACTIVE = 'button, a[href], input, select, textarea, label, [role="button"], [onclick]';
    var STEP = 56, MAX_STEPS = 6, BASE = 14;

    /** 알약 상자 안 격자 9점 중 하나라도 «조작 요소» 위에 있으면 true (알약 자신은 제외) */
    function covers(el) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      var xs = [r.left + 4, r.left + r.width / 2, r.right - 4];
      var ys = [r.top + 3, r.top + r.height / 2, r.bottom - 3];
      var prev = el.style.visibility;
      el.style.visibility = 'hidden';                 // 알약 «밑» 에 무엇이 있는지 본다
      var hit = false;
      try {
        for (var i = 0; i < xs.length && !hit; i++) for (var j = 0; j < ys.length && !hit; j++) {
          var t = document.elementFromPoint(xs[i], ys[j]);
          if (t && t !== el && !el.contains(t) && (t.matches(INTERACTIVE) || t.closest(INTERACTIVE))) hit = true;
        }
      } catch (e) {}
      el.style.visibility = prev;
      return hit;
    }

    /** 아래 가운데에서 시작해 덮는 것이 없을 때까지 위로. 안 되면 위 가운데. */
    function place(el) {
      el.style.top = 'auto';
      for (var n = 0; n <= MAX_STEPS; n++) {
        el.style.bottom = (BASE + n * STEP) + 'px';
        if (!covers(el)) return;
      }
      el.style.bottom = 'auto';
      el.style.top = '8px';
    }

    function draw() {
      if (document.getElementById('mangoi-today-bar')) return;
      var a = document.createElement('a');
      a.id = 'mangoi-today-bar';
      a.href = '/today.html';
      a.textContent = label;
      a.setAttribute('aria-label', en ? 'Back to today\'s AI plan' : '오늘의 A.i 학습으로 돌아가기');
      a.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:14px', 'transform:translateX(-50%)',
        'z-index:99990', 'padding:8px 14px', 'border-radius:999px',
        'background:rgba(20,33,59,.94)', 'color:#fbbf24', 'border:1px solid rgba(251,191,36,.45)',
        'font:700 13px/1.2 MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif',
        'text-decoration:none', 'white-space:nowrap', 'box-shadow:0 6px 18px rgba(0,0,0,.35)',
        'max-width:calc(100vw - 24px)', 'overflow:hidden', 'text-overflow:ellipsis'
      ].join(';');
      (document.body || document.documentElement).appendChild(a);
      place(a);
      /* 나중에 생기는 버튼(flow.js 등)·첫 화면 오버레이를 위해 정해진 횟수만 다시 잰다 — 상주 감시 없음 */
      setTimeout(function () { try { place(a); } catch (e) {} }, 1200);
      setTimeout(function () { try { place(a); } catch (e) {} }, 3000);
      window.addEventListener('resize', function () { try { place(a); } catch (e) {} });
    }
    if (document.body) draw(); else document.addEventListener('DOMContentLoaded', draw, { once: true });
  } catch (e) { /* 아무것도 막지 않는다 */ }
})();
