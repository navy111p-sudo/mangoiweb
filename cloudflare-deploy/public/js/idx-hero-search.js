/* js/idx-hero-search.js — 🔍 홈 검색창 «한 줄로 접기»(C안) 의 편의 담당
 * (2026-09-16 사장님 지시 «C안으로 해줘»)
 *
 * [무엇을 하나]  펼치면 커서를 넣어 주고, 폰에서 키보드가 올라와도 그 줄이 화면 안에 남게 한다.
 *               Esc 로 닫는다.
 * [무엇을 «안» 하나]  «펼치기» 자체는 안 한다 — 그건 <details> 의 브라우저 기본 동작이다.
 *   ⟹ 이 파일이 못 와도(캐시 문제·차단·오류) 검색은 그대로 열리고 동작한다.
 *      그래서 이 파일은 defer 여도 되고, 첫 화면 예산도 0바이트다.
 *   ⛔ 여는 동작을 이 파일로 가져오지 말 것 — 그 순간 «JS 가 죽으면 검색이 통째로 사라지는»
 *      상태가 된다. 검색은 메뉴가 빠뜨린 기능을 찾는 마지막 길이라 그 방향으로 실패하면 안 된다.
 *
 * ⛔ 등장 애니메이션(fade/slide) 금지 — index.html 의 «🔒 붙박이» 규칙(2026-07-22 사장님 지시).
 *    opacity 0→1 은 저전력 모드·백그라운드 탭에서 투명(0)에 영영 멈춰 «안 보인다» 는
 *    치명적 신고를 낸 전력이 있다. 펼침은 display 전환(브라우저 기본)뿐이어야 한다.
 * ⛔ 상주 setInterval·body class MutationObserver 금지 — 홈 전체가 멎은 전력이 두 번 있다.
 *    이 파일은 #hs 에 리스너 둘만 단다.
 */
(function () {
  var d = document.getElementById('hs');
  if (!d) return;

  function input() { return document.getElementById('ai-home-input'); }

  d.addEventListener('toggle', function () {
    if (!d.open) return;

    /* 커서를 넣어 준다 — 안 그러면 «한 번 더 눌러야» 한다(접어 둔 것의 유일한 대가).
       ⚠️ readonly 를 먼저 떼는 이유: 그 속성은 브라우저 자동완성을 막으려고 일부러 달아 둔 것이고
          (index.html 의 onfocus 가 떼 준다), 프로그램이 부르는 focus 에서도 확실히 떨어지게 한다.
       ⚠️ preventScroll: 여기서 브라우저가 제멋대로 스크롤하면 아래 scrollIntoView 와 싸운다.
       ℹ️ 일부 모바일 브라우저는 «사람이 직접 누른 것이 아닌» focus 로 키보드를 안 올린다.
          그때는 학생이 칸을 한 번 더 누르면 된다 — 기능이 깨지지는 않는다. */
    try {
      var el = input();
      if (el) { el.removeAttribute('readonly'); el.focus({ preventScroll: true }); }
    } catch (e) {}

    /* 폰에서는 키보드가 올라오면서 이 줄이 화면 밖으로 밀린다. 키보드가 뜬 «뒤» 에 맞춘다.
       block:'nearest' — 이미 화면 안이면 아무것도 안 움직인다(PC 에서 화면이 튀지 않게). */
    setTimeout(function () {
      try { d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      catch (e) { try { d.scrollIntoView(false); } catch (e2) {} }
    }, 260);
  });

  /* Esc 로 닫기 — 열려 있을 때만. 닫은 뒤 커서를 요약줄로 돌려 키보드만 쓰는 사람이 길을 잃지 않게. */
  d.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !d.open) return;
    d.open = false;
    try { var s = document.getElementById('hs-sum'); if (s) s.focus(); } catch (e2) {}
  });
})();
