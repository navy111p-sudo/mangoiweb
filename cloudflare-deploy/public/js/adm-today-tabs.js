// ═══════════════════════════════════════════════════════════════════════════
// adm-today-tabs.js — 「오늘 수업」 한 항목 안에서 탭으로 보기 (A안)   2026-09-01
//
//   사장님: 「오늘수업과 오늘의 수업이 헷갈려 … 이거 두개를 같은 메뉴에 넣으면 어떨까?」
//     · B안(먼저 한 것) — 이름을 뜻대로 갈라 「오늘」 맨 위에 나란히
//     · A안(이 파일)   — 그 둘을 **한 항목**으로 합치고 안에서 탭으로 가른다
//
//   왜 합칠 수 있나 — 두 화면은 «다른 기능» 이 아니라 **«같은 목록의 두 가지 보기»** 다.
//     실시간 카드의 왼쪽 숫자(「지금 수업 N」)도 예약 기준이라 오늘 목록과 뿌리가 같다.
//
//   [무엇을 하나] 두 카드는 admin.html 에서 **바로 옆에 붙은 형제**다
//     (card-active-rooms 1762행 → card-students-mgmt 1794행, 사이에 다른 카드 없음).
//     그래서 그 «앞» 에 탭 줄을 한 줄 끼우고, 어느 카드를 보일지만 정한다.
//       · 전체 / 🔴 진행 중 → 오늘 목록(card-students-mgmt 의 sm-today-classes 칸)
//                              «진행 중» 은 그 칸에 이미 있는 「지금 들어갈 수 있는 것만」을 켠다
//       · 🎥 화상방 접속    → 실시간 카드(card-active-rooms)
//
//   ⛔ 카드를 DOM 째로 옮기지 않는다 — admin.html 은 1.3MB 이고, 옮기면 사고 반경이 커진다.
//   ⛔ .ia6-hide 를 재사용하지 않는다 — 그건 사이드바 showOnly 전용이라, 항목을 한 번 누르면
//      우리 숨김이 통째로 풀린다(CLAUDE.md 2장). 우리 클래스 .tdt-hide 를 쓴다.
//   ⛔ 상주 MutationObserver·setInterval 을 두지 않는다(홈을 두 번 멎게 한 전력).
//      «언제 다시 볼까» 는 사이드바 클릭·해시 변경·처음 몇 번으로 끝이 있다.
//   ⚠️ 사이드바 클릭은 **window 캡처**로 듣는다 — #ph85-sidebar 클릭을 가로채는 캡처 핸들러가
//      둘 있어서(adm-s11 ph97 · adm-ia6 wireDelegate) 사이드바에 직접 달면 안 불린다.
//   ⚠️ 숨김 CSS 는 id 를 앞에 붙여 센 선택자로 쓴다 — `#legacy-cards details{display:block!important}`
//      (≥1024px)가 인라인·약한 클래스를 이긴다(CLAUDE.md 2장, 실측된 사고).
//
//   감시: test-harness/today_menu_split_harness.mjs · manual/today-menu-split-browser.mjs
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var LIST_CARD = 'card-students-mgmt';   // 오늘 목록이 든 카드
  var LIVE_CARD = 'card-active-rooms';    // 실시간(화상방 접속) 카드
  var SEC       = 'sm-today-classes';     // 그 카드 «안» 의 오늘 목록 칸
  var HIDE      = 'tdt-hide';
  var BAR       = 'tdt-tabs';
  var TAB_KEY   = 'mangoi_today_tab';     // 마지막으로 보던 탭 (전체가 기본)

  var TABS = [
    { id: 'all',   ko: '전체',          en: 'All' },
    { id: 'live',  ko: '🔴 진행 중',    en: '🔴 In class' },
    { id: 'rooms', ko: '🎥 화상방 접속', en: '🎥 In a room' }
  ];

  var counts = { total: null, live: null, rooms: null };
  var cur = 'all';

  function $(id) { return document.getElementById(id); }
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }

  function css() {
    if ($('tdt-css')) return;
    var st = document.createElement('style');
    st.id = 'tdt-css';
    st.textContent =
      /* ⚠️ id 를 앞에 붙여 `#legacy-cards details{display:block!important}` 를 이긴다 */
      '#legacy-cards .' + HIDE + ',#legacy-cards details.' + HIDE + ',.' + HIDE + '{display:none !important}' +
      '#' + BAR + '{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0 6px}' +
      '#' + BAR + '[hidden]{display:none !important}' +
      '#' + BAR + ' button.tdt-tab{' +
        'padding:5px 13px !important;font-size:12.5px !important;font-weight:700 !important;' +
        'border:1px solid #d8dee9 !important;border-radius:999px !important;' +
        'background:#ffffff !important;background-image:none !important;color:#475467 !important;' +
        /* ⚠️ line-height 를 못 박는다 — 안 정하면 바깥에서 1.5~1.7 을 상속받아 한 줄짜리 알약이
         쓸데없이 높아진다(CLAUDE.md 2장 「한 줄로 바꿨는데 높이가 그만큼 안 줄어듦」). */
      'line-height:1.25 !important;cursor:pointer;white-space:nowrap;box-shadow:none !important;margin:0 !important}' +
      '#' + BAR + ' button.tdt-tab:hover{border-color:#b8c2d0 !important}' +
      '#' + BAR + ' button.tdt-tab:focus-visible{outline:2px solid #b45309 !important;outline-offset:1px}' +
      '#' + BAR + ' button.tdt-tab.on{' +
        'background:#fef3c7 !important;border-color:#f0b23a !important;color:#92400e !important}' +
      '#' + BAR + ' .tdt-n{margin-left:6px;font-size:11.5px;opacity:.85;font-variant-numeric:tabular-nums}';
    /* ⚠️ body 에 넣는다 — admin-inline-c.css 가 <body> 안에서 링크돼 있어서 head 에 넣으면
       문서 순서상 앞이라 같은 특이도에서 진다(CLAUDE.md 2장). */
    (document.body || document.documentElement).appendChild(st);
  }

  /** 「오늘 수업」 항목이 골라져 있는가 = 두 카드가 «둘 다» 안 감춰져 있는가. */
  function bothShown() {
    var a = $(LIST_CARD), b = $(LIVE_CARD);
    if (!a || !b) return false;
    return !a.classList.contains('ia6-hide') && !b.classList.contains('ia6-hide');
  }

  function label(t) {
    var n = counts[t.id === 'all' ? 'total' : t.id === 'live' ? 'live' : 'rooms'];
    var txt = isEn() ? t.en : t.ko;
    return txt + (n === null || n === undefined ? '' : '<span class="tdt-n">' + n + '</span>');
  }

  function paint() {
    var bar = $(BAR);
    if (!bar) return;
    TABS.forEach(function (t) {
      var b = bar.querySelector('[data-tdt="' + t.id + '"]');
      if (!b) return;
      b.innerHTML = label(t);
      b.classList.toggle('on', t.id === cur);
      b.setAttribute('aria-selected', t.id === cur ? 'true' : 'false');
    });
  }

  function apply(tab) {
    cur = tab;
    try { localStorage.setItem(TAB_KEY, tab); } catch (e) { /* 시크릿 */ }
    var list = $(LIST_CARD), live = $(LIVE_CARD), sec = $(SEC);
    if (!list || !live) return;
    var showList = (tab !== 'rooms');
    /* ⚠️ toggle(클래스, 상태) 로 «상태를 지정» 한다 — add/remove 를 조건 없이 부르면
       속성을 매번 다시 써서 이 화면의 관찰자들을 헛되이 깨운다(CLAUDE.md 2장). */
    list.classList.toggle(HIDE, !showList);
    live.classList.toggle(HIDE, showList);

    if (showList && sec) {
      if (!sec.open) sec.open = true;      // 이미 열려 있으면 건드리지 않는다
      var chk = $('tc-only-live');
      if (chk && chk.checked !== (tab === 'live')) {
        chk.checked = (tab === 'live');
        /* 그 칸의 필터는 change 로 다시 그린다 — 우리가 목록을 다시 그리지 않는다(정본은 그쪽). */
        try { chk.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      }
    }
    paint();
  }

  function build() {
    if ($(BAR)) return $(BAR);
    var live = $(LIVE_CARD);
    if (!live || !live.parentNode) return null;
    css();
    var bar = document.createElement('div');
    bar.id = BAR;
    bar.setAttribute('role', 'tablist');
    bar.hidden = true;
    TABS.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tdt-tab';
      b.setAttribute('data-tdt', t.id);
      b.setAttribute('role', 'tab');
      /* 🌐 JS 로 그린 글자는 🌐 를 눌러도 안 따라온다 — 다시 그려서 맞춘다(아래 lang 이벤트).
         ⛔ data-ko/data-en 은 달지 않는다: 숫자 칸(<span>)이 함께 든 상자라
            i18n 엔진이 textContent 를 통째로 갈아끼우면 숫자가 사라진다(CLAUDE.md 2장). */
      b.addEventListener('click', function (e) { e.preventDefault(); apply(t.id); });
      bar.appendChild(b);
    });
    live.parentNode.insertBefore(bar, live);
    paint();
    return bar;
  }

  /** 「오늘 수업」을 보고 있을 때만 탭 줄을 띄우고, 아니면 우리 숨김을 전부 되돌린다. */
  function sync() {
    var bar = build();
    if (!bar) return;
    var on = bothShown();
    if (bar.hidden === on) bar.hidden = !on;      // 상태가 같으면 안 쓴다
    if (!on) {
      /* 다른 메뉴로 갔다 — 우리가 감춘 것을 반드시 풀어 준다.
         안 풀면 그 카드가 «어느 메뉴에서도 안 보이는» 상태로 남는다. */
      [$(LIST_CARD), $(LIVE_CARD)].forEach(function (el) {
        if (el && el.classList.contains(HIDE)) el.classList.remove(HIDE);
      });
      return;
    }
    apply(cur);
  }

  function boot() {
    try { cur = localStorage.getItem(TAB_KEY) || 'all'; } catch (e) { cur = 'all'; }
    if (!TABS.some(function (t) { return t.id === cur; })) cur = 'all';

    /* ⚠️ 사이드바 클릭은 window 캡처로 듣는다 — 사이드바에 직접 달면 ph97 의 stopPropagation 에
       삼켜져 영원히 안 불린다(CLAUDE.md 2장). 클릭 «뒤» 에 봐야 하므로 한 틱 미룬다. */
    window.addEventListener('click', function (e) {
      var t = e && e.target;
      if (!t || !t.closest) return;
      if (!t.closest('#ph85-sidebar') && !t.closest('#ph161-quick')) return;
      setTimeout(sync, 60);
      setTimeout(sync, 400);          // IA6 가 늦게 그리는 경우까지 (끝이 있는 확인이다)
    }, true);
    window.addEventListener('hashchange', function () { setTimeout(sync, 60); });
    /* 🌐 KO/EN — 관리자 화면은 document 에서 쏘고, 다른 화면은 window 에서 쏜다. 둘 다 듣는다. */
    document.addEventListener('mangoi:lang-changed', paint);
    window.addEventListener('mangoi:lang-changed', paint);

    /* 숫자 — 세는 곳이 정본이다. 우리는 받아 적기만 한다(같은 계산을 두 벌 두지 않는다). */
    document.addEventListener('mangoi:today-counts', function (e) {
      var d = (e && e.detail) || {};
      if (typeof d.total === 'number') counts.total = d.total;
      if (typeof d.live === 'number') counts.live = d.live;
      paint();
    });
    document.addEventListener('mangoi:rooms-counts', function (e) {
      var d = (e && e.detail) || {};
      if (typeof d.rooms === 'number') counts.rooms = d.rooms;
      paint();
    });

    // 처음 몇 번만 본다 — 카드와 사이드바가 늦게 그려질 수 있다. 끝이 있는 확인이다.
    [0, 300, 900, 2000].forEach(function (ms) { setTimeout(sync, ms); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.mangoiTodayTabs = { apply: apply, sync: sync, tabs: TABS };
})();
