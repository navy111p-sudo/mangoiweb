/* ═══════════════════════════════════════════════════════════════════════
 * 📅 today-bar.js — «오늘의 학습» 에서 열린 도구 화면에 «돌아가기» 알약을 띄운다 (2026-09-03)
 *
 *   왜 필요한가 —
 *     /today.html 이 「1단계 웜업 → 2단계 복습퀴즈 → …」 로 도구를 차례로 열어 주는데,
 *     도구 화면에는 그 순서가 안 보인다. 하나를 끝낸 학생이 «다음이 무엇인지» 모르면
 *     거기서 끝난다(2026-09-03 실측: 최근 30일 AI 도구 사용 학생 60명 중 2개 이상 쓴 학생 7명).
 *
 *   어떻게 —
 *     · 주소에 `?from=today` 가 있으면(또는 이 탭에서 그렇게 들어온 뒤 같은 화면 안에서
 *       이동했으면 — sessionStorage) 화면 아래 가운데에 작은 알약 하나를 그린다.
 *       「📅 오늘의 학습 2/3 · 돌아가기」 — 누르면 /today.html 로 간다.
 *     · «했나» 판정은 이 파일이 하지 않는다 — /today.html 이 서버(/api/student/today)에서
 *       다시 읽는다(도구마다 «끝» 의 정의가 달라 화면에서 짐작하면 틀린다).
 *
 *   ⚠️ 원칙 — 아무것도 막지 않는다. 이 파일이 통째로 실패해도 도구 화면은 그대로 동작한다.
 *   ⚠️ z-index 는 99990 — 수업 화면 독(99993)·재연결 배너(2147483646)보다 «아래».
 *      이 알약이 그것들을 가리면 안 된다. 도구 화면은 수업 화면이 아니라 겹칠 일이 없지만,
 *      같은 파일이 다른 화면에 실릴 때를 위해 못 박아 둔다.
 *   ⚠️ 아이콘 버튼에 data-ko/data-en 을 달지 않는다 — i18n 엔진이 textContent 를 통째로
 *      갈아 끼운다(CLAUDE.md 2장). 글자는 이 파일이 mangoi_lang 을 읽어 직접 쓴다.
 *   ⛔ 상주 MutationObserver·setInterval 금지(홈을 멎게 한 전력) — 한 번 그리고 끝.
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
      ? ('📅 Today\'s plan' + (total ? ' ' + step + '/' + total : '') + ' · back')
      : ('📅 오늘의 학습' + (total ? ' ' + step + '/' + total : '') + ' · 돌아가기');

    function draw() {
      if (document.getElementById('mangoi-today-bar')) return;
      var a = document.createElement('a');
      a.id = 'mangoi-today-bar';
      a.href = '/today.html';
      a.textContent = label;
      a.setAttribute('aria-label', en ? 'Back to today\'s plan' : '오늘의 학습으로 돌아가기');
      a.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:14px', 'transform:translateX(-50%)',
        'z-index:99990', 'padding:8px 14px', 'border-radius:999px',
        'background:rgba(20,33,59,.94)', 'color:#fbbf24', 'border:1px solid rgba(251,191,36,.45)',
        'font:700 13px/1.2 MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif',
        'text-decoration:none', 'white-space:nowrap', 'box-shadow:0 6px 18px rgba(0,0,0,.35)',
        'max-width:calc(100vw - 24px)', 'overflow:hidden', 'text-overflow:ellipsis'
      ].join(';');
      (document.body || document.documentElement).appendChild(a);
    }
    if (document.body) draw(); else document.addEventListener('DOMContentLoaded', draw, { once: true });
  } catch (e) { /* 아무것도 막지 않는다 */ }
})();
