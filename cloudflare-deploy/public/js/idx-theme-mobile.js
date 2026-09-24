/* idx-theme-mobile.js — 📱 모바일은 시간대 자동(2026-09-24~, 옛: 다크 고정) · 🖥 데스크탑만 테마 선택 (2026-08-30, v4 제안서 05)
 * ─────────────────────────────────────────────────────────────────────────────
 * [요구사항] 「휴대폰으로 들어오면 무조건 어둡게. 상단의 [자동/밝게/어둡게] 버튼도 없앤다.
 *            데스크탑에서는 지금처럼 고를 수 있게.」
 *
 * [왜 index.html 을 안 고쳤나]
 *   그 파일은 공동 금지구역이고 첫 화면 blocking 예산이 걸려 있다(CLAUDE.md 4-2·2장).
 *   여기는 defer 라 blocking 0바이트다.
 *
 * [어떻게 «고정» 하나 — 함정 하나를 피해서]
 *   홈 배경은 index.html 인라인 스크립트의 applyHomeTheme() 가
 *   `body.classList.toggle('home-bright', bright)` 로 정한다. 그 함수는
 *     ① DOMContentLoaded 때 ② **60초마다** (6시/18시 경계 자동 전환용) 다시 돈다.
 *   그래서 여기서 클래스만 벗기면 **1분 뒤 되살아난다**(낮 시간대에는 매분 깜빡인다).
 *   ⟹ 클래스를 건드리는 대신 **판단의 근거인 저장값**(mangoi_home_theme_mode)을 'dark' 로 둔다.
 *      getMode() 가 그 값을 먼저 읽으므로 60초 루프도, 다음 방문도 전부 다크로 간다.
 *   ⚠️ localStorage 는 «브라우저별» 이다 — 휴대폰에 적는 값이 데스크탑 선택을 지우지 않는다.
 *
 * [버튼 숨김] CSS 미디어쿼리 한 줄. JS 로 매번 지우지 않으므로 되살아날 일이 없다.
 *   ⚠️ <body> 끝에 붙인다 — <head> 에 붙이면 index.html 의 body <style> 들에게
 *      같은 특정성에서 진다(CLAUDE.md 2장 「JS 로 스타일을 얹었는데 짐」).
 *
 * ⛔ 수업 화면 테마(#mango-theme-toggle · body.vc-theme-light)는 건드리지 않는다.
 *    요구사항이 말한 것은 «홈 상단 헤더의 [자동/밝게/어둡게]» 이고, 수업 화면 밝기는
 *    교재 가독성이 걸린 별건이다.
 */
(function () {
  'use strict';

  var MODE_KEY = 'mangoi_home_theme_mode';
  var MOBILE_MAX = 767;            // 사양서: Viewport < 768px = 모바일

  // ── ① 버튼·라벨 숨김 (CSS — 되살아나지 않는다) ─────────────────────────
  try {
    if (!document.getElementById('mgtm-style')) {
      var st = document.createElement('style');
      st.id = 'mgtm-style';
      st.textContent =
        '@media (max-width:' + MOBILE_MAX + 'px){' +
        '#home-theme-toggle,#home-theme-toggle.home-theme-chip{display:none !important;}' +
        '}';
      (document.body || document.documentElement).appendChild(st);
    }
  } catch (e) {}

  // ── ② 휴대폰은 «자동»(06:00~17:59 밝게 · 그 밖 어둡게) 고정 ─────────────────
  /* 📌 2026-09-24 사장님 지시 「휴대폰도 아침 6시부터 저녁 6시까지는 다시 밝은 바탕으로 자동으로」.
     2026-08-30 에는 「휴대폰은 무조건 어둡게」였다 — 그때 폰 브라우저 저장값에 'dark' 를
     써 두었으므로, 이제는 그 값을 'auto' 로 «되돌려» 쓴다(안 되돌리면 옛 폰은 영영 어둡다).
     시간 판정은 index.html 의 autoBright() 가 정본이다(60초 루프가 저장값 'auto' 를 읽어 스스로 맞춘다).
     여기서는 «지금 화면» 만 같은 규칙으로 한 번 맞춘다 — 기다리면 최대 60초 동안 어둡게 보인다.
     ⛔ 버튼은 여전히 폰에서 숨긴다(고를 수 없으니 자동 하나로 둔다).
     ⚠️ 주소에 ?home=... 을 붙여 연 미리보기는 그쪽이 이기므로 여기서 화면을 건드리지 않는다. */
  function autoOnMobile() {
    var w = 0;
    try { w = window.innerWidth || document.documentElement.clientWidth || 0; } catch (e) {}
    if (!w || w > MOBILE_MAX) return;
    try {
      if (localStorage.getItem(MODE_KEY) !== 'auto') localStorage.setItem(MODE_KEY, 'auto');
    } catch (e) {}
    try {
      if (/[?&]home=/.test(location.search)) return;
      var h = new Date().getHours();
      document.body && document.body.classList.toggle('home-bright', h >= 6 && h < 18);
    } catch (e) {}
  }

  autoOnMobile();

  /* 화면을 돌리거나 창을 좁혔을 때도 같은 규칙이 되게 한다.
     ⛔ 상주 setInterval·MutationObserver 는 두지 않는다 — 홈 전체를 멎게 한 전력이 있다
        (CLAUDE.md 2장). resize 는 «그 순간에만» 도는 이벤트라 안전하다. */
  var t = 0;
  try {
    window.addEventListener('resize', function () {
      if (t) return;
      t = setTimeout(function () { t = 0; autoOnMobile(); }, 300);
    }, { passive: true });
  } catch (e) {}
})();
