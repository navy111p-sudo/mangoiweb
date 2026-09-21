/* idx-home-tracks.js — 홈 히어로 «두 트랙 줄» 을 눌러 그 카드로 (2026-09-21)
 *
 * [왜] 사장님 제보 — 「1번, 2번 모두 눌러도 카드로 들어가지 않아」.
 *   고장이 아니라 «기능이 없었던» 것이다. #1046 이 만든 .home-tracks 는 마크업과 CSS
 *   뿐이고 href·onclick 이 한 줄도 없는 «설명 문구» 였다. 사장님이 화면을 보시고
 *   목적지를 직접 정해 주셨다(둘 다 스크린샷으로 지목).
 *     .ht-live (1:1 원어민 화상수업) → 「망고아이란?」의 «원어민 선생님과 1:1 / 1:2 수업» 카드
 *     .ht-ai   (8종 A.i 학습)        → 「AI와 친구하기」 카드 오버레이
 *
 * [왜 별도 파일인가] index.html 은 공동 금지구역이고 첫 화면 예산이 걸린다.
 *   여기는 defer 라 그 예산에 0바이트다 — 마크업은 한 글자도 안 건드리고 밖에서 입힌다.
 *   되돌리려면 index.html 의 <script defer src> 한 줄만 지우면 원래대로다.
 *
 * ⛔ 상주 setInterval·body class MutationObserver 를 두지 않는다 — 그 둘이 홈을 통째로
 *    멎게 한 전력이 두 번 있다(2026-07-14 · 2026-08-27). 여기는 «한 번 입히고 끝» 이다.
 * ⛔ 트랙에 data-ko/data-en 을 달지 않는다 — 두 i18n 엔진이 그 요소의 textContent 를
 *    «통째로» 갈아끼워 안의 <span> 들이 날아간다(CLAUDE.md 「아이콘 버튼에 달았더니」).
 *    설명은 data-ko-title/data-en-title 로만 단다(두 엔진 모두 title 만 건드린다).
 * ⛔ 로그인 여부를 여기서 다시 판정하지 않는다 — 목적지 둘 다 회원·비회원이 같다.
 */
(function () {
  'use strict';

  var LIVE_KEY = 'live-class';   /* js/idx-about.js 의 BENEFITS 항목이 든 key 와 짝 */

  function openLive() {
    /* 카드까지 간다. 못 가면 목록이라도 연다 — 사람이 눈으로 고를 수 있다.
       ⛔ 여기서 순번(data-i)으로 찾지 않는다. 정본은 idx-about.js 의 key 다. */
    if (typeof window.openAboutMangoiCard === 'function') {
      if (window.openAboutMangoiCard(LIVE_KEY)) return true;
    }
    if (typeof window.openAboutMangoi === 'function') {
      try { window.openAboutMangoi(); return true; } catch (e) {}
    }
    console.warn('[home-tracks] 화상수업 카드를 열지 못했습니다');
    return false;
  }

  function openAi() {
    if (typeof window.openAiFriendsOverlay === 'function') {
      try { window.openAiFriendsOverlay(); return true; } catch (e) {}
    }
    /* 폴백 — 같은 오버레이를 여는 주소가 이미 있다(index.html 의 ?menu=aitools 갈래).
       ⚠️ 이 줄이 없으면 스크립트가 늦게 올 때 «눌러도 아무 일도 안 나는» 버튼이 된다. */
    try { location.href = '/?menu=aitools'; return true; } catch (e) {}
    console.warn('[home-tracks] A.i 학습 카드를 열지 못했습니다');
    return false;
  }

  var TRACKS = [
    { sel: '.home-tracks .ht-live', go: openLive,
      tko: '원어민 1:1 / 1:2 수업 소개 보기', ten: 'About 1:1 / 1:2 live lessons' },
    { sel: '.home-tracks .ht-ai', go: openAi,
      tko: 'A.i 학습 도구 전부 보기', ten: 'See all A.i learning tools' }
  ];

  function styleOnce() {
    if (document.getElementById('ht-click-style')) return;
    var st = document.createElement('style');
    st.id = 'ht-click-style';
    /* «누를 수 있다» 를 눈에 보이게. 크기·자리는 그대로 두고 색만 바꾼다
       (관리자 쪽 hover 확대 금지와 같은 취지 — 글자가 움직이면 정신없다). */
    st.textContent =
      '.home-tracks .ht-track[role="button"]{cursor:pointer;border-radius:10px;' +
      'transition:background-color .15s ease,color .15s ease}' +
      '.home-tracks .ht-track[role="button"]:hover{background:rgba(255,255,255,.10)}' +
      '.home-tracks .ht-track[role="button"]:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}';
    document.head.appendChild(st);
  }

  function arm() {
    var armed = 0;
    TRACKS.forEach(function (t) {
      var el = document.querySelector(t.sel);
      if (!el || el.__htArmed) return;
      el.__htArmed = 1;
      armed++;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('title', t.tko);
      el.setAttribute('data-ko-title', t.tko);
      el.setAttribute('data-en-title', t.ten);
      el.addEventListener('click', function (e) { e.preventDefault(); t.go(); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault(); t.go();
        }
      });
    });
    if (armed) styleOnce();
    return armed;
  }

  function boot() {
    if (arm() === TRACKS.length) return;
    /* 늦게 그려지는 경우를 대비한 «끝이 있는» 재시도 — 상주 감시가 아니다. */
    var tries = 0;
    var id = setInterval(function () {
      if (arm() === TRACKS.length || ++tries >= 10) clearInterval(id);
    }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
