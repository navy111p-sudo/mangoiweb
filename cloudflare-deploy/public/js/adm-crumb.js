// ═══════════════════════════════════════════════════════════════════════════
// adm-crumb.js — 🧭 본문 맨 위 «경로 줄» (2026-08-19 사장님 지시)
//
//   [무엇]  [← 뒤로]  [🏠 홈]  │  강사 ›  급여·정산
//           나가는 문 두 개와 «지금 어디인지» 를 한 줄에. 스크롤해도 맨 위에 붙어 따라간다.
//
//   [왜 만들었나]
//     관리자 화면에는 뒤로도 홈도 없었다. 사이트의 다른 화면에는 js/back-nav.js 가
//     동그란 ← 를 띄우지만 admin.html 만 «홈이라 갈 곳이 없다» 는 이유로 제외돼 있었다.
//     그런데 이 화면은 한 페이지 안에서 카드만 바꿔 보여 주는 구조라, 안에서 메뉴를
//     열 번 옮겨 다녀도 «직전으로» 가 없고, 깊이 들어가면 대시보드로 돌아올 길도 없다.
//     카드가 85장이라 「내가 어디 왔는지」 표시도 하나 필요했다.
//
//   [«뒤로» 는 브라우저 뒤로가기가 아니다]
//     여기서 history.back() 을 부르면 **관리자 화면 밖(로그인 화면)으로 나가 버린다** —
//     메뉴 이동은 주소를 바꾸지 않기 때문이다. 그래서 우리가 지나온 항목을 직접 기억한다.
//     ⏳ 아직 안 한 것: 메뉴를 고를 때 history.pushState 로 주소에도 흔적을 남기면
//        **휴대폰 뒤로 버튼**까지 같은 뜻이 된다. 지금은 앱에서 뒤로를 누르면 앱이 꺼진다.
//
//   [되돌아가는 방법 — 새 이동 코드를 만들지 않는다]
//     기억해 둔 항목의 **사이드바 원본을 그대로 click()** 한다. 드로어 닫기·카드 필터·
//     맨 위 맞추기가 이미 그 경로에 다 들어 있고, 흉내 내면 그 셋 중 하나를 반드시 빠뜨린다.
//     (js/adm-recent-menus.js 가 쓰는, 검증된 길을 그대로 쓴다.)
//
//   [발자국을 세는 곳도 한 곳]
//     사이드바 항목 `[data-ia6-item]` 의 클릭만 본다. ⚡자주 쓰는 기능·🕘최근 본 메뉴·
//     통합검색·AI 어디서 뛰어오든 결국 그 항목의 click() 으로 모인다(adm-recent-menus.js 주석 참고).
//
//   [📐 제목이 이 줄에 가리지 않게 — 이미 한 번 겪은 문제다]
//     사이드바 메뉴는 전부 scrollIntoView({block:'start'}) 로 뛴다 = 「카드 맨 위를 화면 맨 위에」.
//     그 자리가 바로 이 줄 «밑» 이라, 그대로 두면 카드 제목이 정확히 가려진다.
//     2026-08-04 옛 상단바(.top-header)에서 똑같은 신고가 있었고(「메뉴를 열면 그 화면 제목이
//     상단 바에 가려 내가 어디 왔는지 알 수가 없다」), 그때 해결책이 이것이다 —
//     **호출 83곳을 각각 고치지 않고** 카드 쪽에 scroll-margin-top 을 줘서 그만큼 덜 스크롤한다.
//     그 블록은 헤더가 없어진 2026-08-15 에 «죽은 코드» 로 지워졌다(그 자리 주석: 「헤더를
//     되살릴 일이 생기면 되찾을 것」). 여기가 그 되살린 자리다. 함정 셋도 그대로 가져왔다:
//       ① body{zoom:1.3} — getBoundingClientRect().height 는 1.3 이 곱해진 값이다.
//          scroll-margin-top 은 zoom «안쪽» 좌표계이므로 반드시 offsetHeight(배율 전 px)로 잰다.
//       ② rAF 만 쓰면 안 된다 — 백그라운드 탭에서는 «한 번도» 안 돈다(실측 400ms 동안 0회).
//          rAF 와 타이머 중 먼저 오는 쪽을 쓴다.
//       ③ 줄이 sticky 가 아니거나 안 보이면 0 — 쓸데없이 화면 위가 비지 않게.
//     ⚠️ 이 값은 adm-ia6.js 의 topGap() 도 함께 읽는다(window.__miCrumbGap). 거기는 고른 카드에
//        scroll-margin-top 을 **인라인으로** 쓰는데, 인라인은 위 CSS 규칙을 이기기 때문이다.
//        한쪽만 고치면 «어떤 메뉴는 가려지고 어떤 메뉴는 멀쩡한» 반쪽 상태가 된다.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__admCrumb) return;
  window.__admCrumb = 1;

  var LS_IA6 = 'mangoi_admin_ia6';   // adm-ia6.js 가 «마지막으로 보던 항목» 을 적어 두는 칸
  var GAP    = 0;                    // 줄과 제목 사이 숨 쉴 틈. 카드 자체 여백(≈19px)이 이미 있다
  var MAX    = 30;                   // 발자국 상한 — 하루 종일 눌러도 메모리가 늘지 않게

  var trail = [];      // 지나온 항목 key. **맨 뒤가 «지금»**
  var back  = false;   // ← 로 되돌아가는 중 — 그 클릭은 발자국으로 세지 않는다

  function $(id) { return document.getElementById(id); }
  function isEn() {
    try { return localStorage.getItem('adminLang') === 'en'; } catch (e) { return false; }
  }

  function itemEl(key) {
    if (!key) return null;
    try {
      return document.querySelector('#ph85-sidebar [data-ia6-item="' + String(key).replace(/"/g, '\\"') + '"]');
    } catch (e) { return null; }
  }

  /* ── 그리기 ──────────────────────────────────────────────────────────────
     ⚠️ 라벨은 **글자만 담은 요소** 에 data-ko/data-en 을 단다. 바깥 상자에 달면
        adm-core 의 applyAdminLangDom() 이 textContent 를 통째로 갈아치우면서 안의
        아이콘까지 지운다(adm-quick-access.js·adm-recent-menus.js 가 같은 함정을 적어 두었다). */
  function setLabel(el, ko, en) {
    if (!el) return;
    ko = ko || ''; en = en || ko;
    el.setAttribute('data-ko', ko);
    el.setAttribute('data-en', en);
    el.textContent = isEn() ? en : ko;
  }

  function render() {
    var bar = $('mi-crumb');
    if (!bar) return;

    var key = trail.length ? trail[trail.length - 1] : '';
    var el  = itemEl(key);

    /* 첫 화면(대시보드)에서는 줄 자체를 감춘다 — 뒤로 갈 곳도, 알려 줄 위치도 없다.
       ⚠️ [hidden] 속성을 쓰지 않는다. 작성자 CSS 가 display 를 정하면 브라우저 기본
          [hidden]{display:none} 을 이겨서 계속 보인다(CLAUDE.md 의 teacher.html 사례,
          바로 옆 #ph164-recent 도 같은 이유로 클래스를 쓴다). */
    if (!el) { bar.classList.add('mi-crumb-off'); measure(); return; }

    var grp = el.closest ? el.closest('.ph85-group') : null;
    var gt  = grp ? grp.querySelector('.ph85-title') : null;
    setLabel($('mi-crumb-group'), gt ? (gt.getAttribute('data-ko') || '') : '',
                                  gt ? (gt.getAttribute('data-en') || '') : '');
    /* 이름은 «카드 제목» 이 아니라 «사이드바에서 누른 항목» 이다.
       항목 44개 중 23개가 카드를 여러 장 묶기 때문에(data-cards), 카드 제목을 쓰면
       대표 첫 장 이름만 나와 실제로 누른 것과 어긋난다. */
    setLabel($('mi-crumb-item'), el.getAttribute('data-ko') || '', el.getAttribute('data-en') || '');

    bar.classList.remove('mi-crumb-off');
    measure();
  }

  /* ── ← 뒤로 ─────────────────────────────────────────────────────────────── */
  function goBack() {
    /* 발자국이 하나뿐이면 직전 화면은 대시보드였다 — 없는 곳을 있는 척하지 않는다. */
    while (trail.length >= 2) {
      trail.pop();
      var el = itemEl(trail[trail.length - 1]);
      if (!el) continue;                  // 권한 변경·메뉴 개편으로 사라진 항목은 조용히 건너뛴다
      back = true;
      try { el.click(); } catch (e) { /* 무시 */ }
      back = false;
      render();
      return;
    }
    goHome();
  }

  /* ── 🏠 홈 ──────────────────────────────────────────────────────────────── */
  function goHome() {
    trail = [];
    try { localStorage.removeItem(LS_IA6); } catch (e) { /* 사파리 시크릿 등 — 무시 */ }
    // 카드 감춤을 푼다 — 새 이동 코드를 만들지 않고 IA6 가 이미 가진 기계를 부른다
    try { if (window.mangoiIA6 && window.mangoiIA6.showAll) window.mangoiIA6.showAll(); } catch (e) { /* 무시 */ }
    // 사이드바의 «고른 표시» 도 지운다 — 대시보드인데 아직 그 메뉴라고 말하면 안 된다
    try {
      var on = document.querySelectorAll('#ph85-sidebar .ph85-sub.ia6-on');
      for (var i = 0; i < on.length; i++) on[i].classList.remove('ia6-on');
    } catch (e) { /* 무시 */ }
    render();
    /* behavior:'smooth' 금지 — 「오른쪽이 왔다갔다 해서 정신없다」로 이미 걷어낸 규칙이고,
       숨은 탭에서는 smooth 가 애니메이션을 못 돌려 «움직이지 않는» 결과가 되기도 한다. */
    try { window.scrollTo(0, 0); } catch (e) { /* 무시 */ }
  }

  /* ── 발자국 세기 — 사이드바 항목 클릭 한 곳만 본다 ────────────────────────
     🔴 window «캡처» 로 듣는다. 사이드바에 직접 리스너를 달면 영원히 발화하지 않는다 —
        adm-s11.js(ph97)가 window 캡처에서 stopPropagation() 을 부르기 때문이다. */
  window.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    // ▸ 손자 토글·손자 항목은 «메뉴 이동» 이 아니다 — 카드 안에서 움직일 뿐이다
    if (t.closest('#ph85-sidebar .ph125-toggle') || t.closest('#ph85-sidebar .ph125-gc')) return;
    var it = t.closest('#ph85-sidebar [data-ia6-item]');
    if (!it) return;
    var key = it.getAttribute('data-ia6-item');
    if (!key || back) return;
    if (trail[trail.length - 1] === key) return;   // 같은 곳을 다시 눌러도 발자국은 하나
    trail.push(key);
    if (trail.length > MAX) trail.shift();
    // IA6 가 ia6-on 을 붙이고 카드를 고른 «뒤» 에 그린다
    setTimeout(render, 0);
  }, true);

  /* ── 📐 착지점 내리기 (--adm-jump-offset) ─────────────────────────────────── */
  try {
    var st = document.createElement('style');
    st.id = 'adm-jump-offset';
    /* details.sub-item 도 포함 — 사이드바 「대리점」처럼 카드가 아니라 카드 «안의 한 칸» 으로
       바로 뛰는 항목이 있다(adm-ia6.js 의 openSub). 뛰는 대상이 아니면 여백은 아무 영향이 없다. */
    st.textContent = '[id^="card-"],.menu-card,details.sub-item{scroll-margin-top:var(--adm-jump-offset,0px)}';
    (document.head || document.documentElement).appendChild(st);
  } catch (e) { /* 스타일을 못 넣어도 줄 자체는 동작해야 한다 */ }

  function crumbGap() {
    var bar = $('mi-crumb');
    if (!bar || bar.classList.contains('mi-crumb-off')) return 0;
    var pos = '';
    try { pos = getComputedStyle(bar).position; } catch (e) { return 0; }
    if (pos !== 'sticky' && pos !== 'fixed') return 0;   // ③ 같이 흘러가면 가릴 일이 없다
    return (bar.offsetHeight || 0) + GAP;                // ① zoom 전 px 로 잰다
  }
  // adm-ia6.js 의 topGap() 이 읽는다 — 거기는 인라인으로 쓰므로 이 CSS 규칙을 이긴다
  window.__miCrumbGap = crumbGap;

  function measure() {
    var v = crumbGap();
    var s = (v ? v : 0) + 'px';
    var root = document.documentElement;
    if (root.style.getPropertyValue('--adm-jump-offset') !== s) root.style.setProperty('--adm-jump-offset', s);
  }

  var pending = 0;
  function schedule() {
    if (pending) return;
    pending = 1;
    var done = function () { if (!pending) return; pending = 0; try { measure(); } catch (e) { /* 무시 */ } };
    try { requestAnimationFrame(done); } catch (e) { /* 무시 */ }
    setTimeout(done, 60);   // ② 숨은 탭 보강 — rAF 는 거기서 한 번도 안 돈다
  }

  /* ── 시동 ───────────────────────────────────────────────────────────────── */
  function bind() {
    var bar = $('mi-crumb');
    if (!bar || bar.__bound) return !!bar;
    bar.__bound = 1;
    var b = $('mi-crumb-back'), h = $('mi-crumb-home');
    if (b) b.addEventListener('click', function (e) { e.preventDefault(); goBack(); });
    if (h) h.addEventListener('click', function (e) { e.preventDefault(); goHome(); });
    try { if (window.ResizeObserver) new ResizeObserver(schedule).observe(bar); } catch (e) { /* 무시 */ }
    return true;
  }

  var tries = 0;
  function boot() {
    bind();
    /* 사이드바는 adm-ia6.js 가 나중에 그리고, 마지막으로 보던 항목도 그때 되살아난다.
       그래서 «항목이 생길 때까지» 잠깐 기다렸다가 한 번 맞춘다(최대 12초). */
    if (!trail.length) {
      var on  = document.querySelector('#ph85-sidebar .ph85-sub.ia6-on');
      var key = on ? on.getAttribute('data-ia6-item') : '';
      if (!key) { try { key = localStorage.getItem(LS_IA6) || ''; } catch (e) { /* 무시 */ } }
      if (key && itemEl(key)) trail = [key];
    }
    render();
    if (!trail.length && tries++ < 30) setTimeout(boot, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  /* 🌐 다른 탭에서 언어를 바꾼 경우 — 그 탭의 applyAdminLangDom() 은 여기까지 오지 않는다 */
  try {
    window.addEventListener('storage', function (e) {
      if (e && e.key === 'adminLang') render();
    });
  } catch (e) { /* 무시 */ }
})();
