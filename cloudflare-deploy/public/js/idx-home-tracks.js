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
      try { window.openAiFriendsOverlay(); return true; }
      catch (e) {
        /* ⛔ 여기서 주소로 이동하지 않는다 — 그 함수가 던지는 상태라면 새로고침 뒤에도
           똑같이 던져서 «눌렀더니 새로고침만 되고 아무 일도 안 나는» 것이 된다. */
        console.warn('[home-tracks] A.i 오버레이가 던졌습니다', e);
        return false;
      }
    }
    /* 폴백은 그 함수가 «아직 없을» 때만 — 같은 오버레이를 여는 주소가 이미 있다.
       ⛔ '/?menu=aitools' 로 통째로 갈아치우지 않는다. 지금 주소의 다른 쿼리·해시를
          조용히 잃는다(CLAUDE.md 「menu 만 지우세요」의 짝). */
    try {
      var u = new URL(location.href);
      u.searchParams.set('menu', 'aitools');
      location.href = u.toString();
      return true;
    } catch (e) {}
    console.warn('[home-tracks] A.i 학습 카드를 열지 못했습니다');
    return false;
  }

  /* 🌐 언어 판정은 반드시 getLang() 으로 — index.html 은 i18n 엔진이 «둘» 이고
     인라인 엔진의 전역 currentLang 은 나중 엔진이 안 건드린다(CLAUDE.md 「언어 판정」).
     이것을 안 보면 EN 으로 저장해 둔 사람이 🌐 를 한 번 누르기 전까지 한국어 툴팁을 본다. */
  function isEn() {
    try { if (typeof window.getLang === 'function') return window.getLang() === 'en'; } catch (e) {}
    try { return localStorage.getItem('mangoi_lang') === 'en'; } catch (e) {}
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
      'transition:filter .15s ease,color .15s ease}' +
      /* 2026-09-24 메탈 카드 — hover 는 «살짝 밝게» 로(색만 — 크기·자리 고정).
         ⛔ background 로 덮지 말 것: 메탈 그라데이션이 평평한 단색으로 바뀐다. */
      '.home-tracks .ht-track[role="button"]:hover{filter:brightness(1.06)}' +
      '.home-tracks .ht-track[role="button"]:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}' +
      /* ▸ (2026-09-21 사장님 지시) 폰에는 손가락 커서도 :hover 도 없어 «누를 수 있다» 는
         신호가 0개였다. 화살표를 «가상요소» 로 그린다 — ⛔ 글자로 넣으면 i18n 두 엔진이
         .ht-what 안 <span> 의 textContent 를 갈아끼울 때 함께 사라지고, 사전이 전체 문자열
         일치라 「원어민 화상수업」과 「원어민 화상수업 ›」를 다른 말로 본다(CLAUDE.md
         「data-ko 가 달린 표 머리글에 정렬 화살표를 달아야 할 때」). ::after 는 textContent 와
         무관해서 살아남는다. ⚠️ .ht-what 이 nowrap 이라 폭이 늘어난다 — 폰에서 재고 넣었다. */
      '.home-tracks .ht-track[role="button"] .ht-what::after{content:"\\203A";' +
      /* ⚠️ 두 줄로 «쌓습니다». 아래 «/ ""» 는 CSS 의 «대체 텍스트» — 화살표를 그리되
         **화면낭독기 이름에서는 뺍니다**. 이 줄은 role="button" 이라 가상요소의 글자가
         이름 계산에 그대로 섞입니다(CDP 접근성 트리 실측: 「…원어민 화상수업›」).
         그 문법을 모르는 옛 브라우저는 이 선언만 버리고 **윗줄이 남아 화살표는
         그대로 그려집니다.** ⚠️ 다만 그 브라우저에서는 «낭독에서 빼는» 효과도 함께
         사라져 화살표가 계속 읽힙니다(= 고치기 전과 같음) — «시각» 은 안 잃고
         «낭독 제외» 만 안 걸리는 것입니다. Chromium 141 에서만 쟀습니다.
         ⛔ 윗줄을 지우고 이 줄만 두지 마세요(옛 사파리에서 화살표가 통째로 사라집니다). */
      'content:"\\203A" / "";' +
      'margin-left:.28em;font-size:.95em;opacity:.85;font-weight:800;color:#b45309}';
    document.head.appendChild(st);
  }

  /* ⚠️ 돌려주는 값은 «전부 걸렸나» 다. «이번에 새로 건 수» 로 두면 한쪽이 늦게 그려질 때
     둘 다 걸린 뒤에도 재시도가 끝까지 돈다(트랙이 셋으로 늘면 더 어긋난다). */
  function arm() {
    var armedNow = 0;
    TRACKS.forEach(function (t) {
      var el = document.querySelector(t.sel);
      if (!el || el.__htArmed) return;
      el.__htArmed = 1;
      armedNow++;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('title', isEn() ? t.ten : t.tko);
      el.setAttribute('data-ko-title', t.tko);
      el.setAttribute('data-en-title', t.ten);
      el.addEventListener('click', function (e) { e.preventDefault(); t.go(); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault(); t.go();
        }
      });
    });
    if (armedNow) styleOnce();
    return TRACKS.every(function (t) {
      var el = document.querySelector(t.sel);
      return !!(el && el.__htArmed);
    });
  }

  function boot() {
    if (arm()) return;
    /* 늦게 그려지는 경우를 대비한 «끝이 있는» 재시도 — 상주 감시가 아니다. */
    var tries = 0;
    var id = setInterval(function () {
      if (arm() || ++tries >= 10) clearInterval(id);
    }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
