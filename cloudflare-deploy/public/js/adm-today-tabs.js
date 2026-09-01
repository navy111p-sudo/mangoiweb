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
//     그 «앞» 에 탭 줄을 한 줄 끼우고, **어느 카드를 «펴 둘지»** 만 정한다.
//
//   🔴 [처음에 display:none 으로 만들었다가 되돌린 이유] — trap-check 가 다섯 군데를 짚었다.
//     우리 클래스로 카드를 «감추면» 그 사실을 이 화면의 다른 코드가 전혀 모른다:
//       ① 🏠 홈·메뉴 검색은 ia6-hide 만 풀어서 **우리 숨김이 남는다**(대시보드에서도 안 보임)
//       ② adm-ia6 의 cardOf() 는 ia6-hide 만 보므로 `#card-active-rooms` 딥링크가
//          숨은 카드로 가서 **에러 없이 아무 일도 안 일어난다**
//       ③ ⚡「수업 종료 / 연장」이 그 카드로 오는데 우리가 60ms 뒤 다시 감췄다
//       ④ adm-core 의 _activeRoomsVisible() 도 ia6-hide 만 보므로 **안 보이는 카드에 15초 폴링**이 돈다
//       ⑤ 대리점 계정은 그 카드가 rbac-hide 라 🎥 탭이 **빈 화면**이 된다
//     ⟹ **감추지 않는다. `<details>` 를 접었다 편다.** 그러면
//        · 최악이어도 «접혀 있다» 이지 «없다» 가 아니다(제목이 보이고 한 번 누르면 열린다)
//        · `_activeRoomsVisible()` 이 `!c.open` 으로 이미 걸러 준다 → 폴링 문제도 함께 사라진다
//        · 딥링크·⚡·허브가 카드를 열면 그 `toggle` 이벤트를 보고 **우리가 탭을 따라간다**
//        · 역할로 감춰진 카드는 그 탭을 아예 안 그린다
//
//   ⛔ .ia6-hide 를 «붙이지» 않는다 — 그건 사이드바 showOnly 전용이라, 항목을 한 번 누르면
//      우리 조작이 통째로 풀린다(CLAUDE.md 2장). 읽기만 한다.
//   ⛔ 상주 MutationObserver·setInterval 을 두지 않는다(홈을 두 번 멎게 한 전력).
//      듣는 것은 «그 두 카드의 toggle» 과 «몇 개의 클릭·입력» 뿐이고 끝이 있다.
//   ⚠️ 사이드바 클릭은 **window 캡처**로 듣는다 — #ph85-sidebar 클릭을 가로채는 캡처 핸들러가
//      둘 있어서(adm-s11 ph97 · adm-ia6 wireDelegate) 사이드바에 직접 달면 안 불린다.
//
//   감시: test-harness/today_menu_split_harness.mjs · manual/today-menu-split-browser.mjs
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var LIST_CARD = 'card-students-mgmt';   // 오늘 목록이 든 카드
  var LIVE_CARD = 'card-active-rooms';    // 실시간(화상방 접속) 카드
  var SEC       = 'sm-today-classes';     // 그 카드 «안» 의 오늘 목록 칸
  /* 🔐 (2026-09-01 사장님 「지금 수업 쪽에 도로 묶어줘」) 초대(JWT 토큰) 카드는
     «화상방 접속» 과 한 짝이다. 다른 탭에서는 접어 두고, 그 탭에서만 자리에 남긴다.
     ⛔ 감추지 않는다 — 접기만 한다(위 머리말의 다섯 가지 이유). */
  var INV_CARD  = 'card-room-invite';
  var BAR       = 'tdt-tabs';

  /* ⚠️ 「진행 중」이라고 쓰지 않는다 — 세는 값은 join_open 이고, 그건 «들어갈 수 있는 시간대» 이지
     «실제로 접속해 있다» 가 아니다(CLAUDE.md 2장). 원래 체크박스 라벨이 정확했다. */
  var TABS = [
    { id: 'all',   ko: '전체',            en: 'All' },
    { id: 'live',  ko: '🚪 지금 입장 가능', en: '🚪 Joinable now' },
    { id: 'rooms', ko: '🎥 화상방 접속',   en: '🎥 In a room' }
  ];

  var counts = { total: null, live: null, rooms: null };
  var cur = 'all';                       // ⛔ 저장하지 않는다 — 「오늘 수업」을 눌렀는데 화상방이 뜨면 안 된다
  var busy = false;                      // toggle 이벤트가 우리 조작을 다시 부르지 않게

  function $(id) { return document.getElementById(id); }
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }

  /** 역할·필터로 «화면에서 사라진» 카드인가. 그런 카드의 탭은 아예 안 그린다. */
  function usable(id) {
    var el = $(id);
    if (!el) return false;
    if (el.classList.contains('rbac-hide') || el.classList.contains('ia6-hide')) return false;
    try { return getComputedStyle(el).display !== 'none'; } catch (e) { return true; }
  }

  function css() {
    if ($('tdt-css')) return;
    var st = document.createElement('style');
    st.id = 'tdt-css';
    st.textContent =
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

  /** 「오늘 수업」 항목을 보고 있는가 = 두 카드가 «둘 다» ia6 에 안 감춰져 있는가. */
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
      /* 🔐 역할로 감춰진 카드의 탭은 그리지 않는다 — 안 그러면 눌렀을 때 «빈 화면» 이 된다
         (대리점 계정은 card-active-rooms 가 rbac-hide 다). */
      var ok = (t.id === 'rooms') ? usable(LIVE_CARD) : usable(LIST_CARD);
      if (b.hidden !== !ok) b.hidden = !ok;
      b.innerHTML = label(t);
      b.classList.toggle('on', t.id === cur);
      b.setAttribute('aria-selected', t.id === cur ? 'true' : 'false');
    });
  }

  /** 탭을 고른다. `byUser` 면 그 칸을 펴고 화면을 맞춘다(스스로 따라갈 때는 건드리지 않는다). */
  function apply(tab, byUser) {
    var list = $(LIST_CARD), live = $(LIVE_CARD);
    if (!list || !live) return;
    if (tab === 'rooms' && !usable(LIVE_CARD)) tab = 'all';    // 못 보는 카드의 탭으로 가지 않는다
    cur = tab;
    var wantList = (tab !== 'rooms');

    busy = true;
    try {
      /* ⚠️ 감추지 않는다 — «편다/접는다» 다. 접혀 있어도 제목은 보이고 한 번 누르면 열린다.
         그리고 접힌 카드는 adm-core 의 _activeRoomsVisible() 이 이미 걸러 준다(폴링 정지). */
      if (list.open !== wantList) list.open = wantList;
      if (live.open === wantList) live.open = !wantList;
      /* 초대 카드는 «화상방 접속» 탭의 짝이다. 다른 탭에서는 접는다.
         ⛔ 그 탭이라고 «펴지도» 않는다 — 토큰 발급은 가끔 쓰는 도구라 필요할 때 사람이 편다. */
      var inv = $(INV_CARD);
      if (inv && wantList && inv.open) inv.open = false;

      if (wantList) {
        var sec = $(SEC);
        /* 사람이 직접 탭을 누른 때만 그 칸을 편다 — sync() 가 부를 때마다 펴면
           사용자가 접어 둔 것을 계속 되돌리게 된다. */
        if (sec && byUser && !sec.open) sec.open = true;
        var chk = $('tc-only-live');
        if (chk && chk.checked !== (tab === 'live')) {
          chk.checked = (tab === 'live');
          /* 그 칸의 필터는 change 로 다시 그린다 — 우리가 목록을 다시 그리지 않는다(정본은 그쪽). */
          try { chk.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
        }
      }
      if (byUser) {
        var goal = wantList ? ($(SEC) || list) : live;
        try { goal.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {}
      }
    } finally {
      /* ⚠️ details 의 `toggle` 은 **비동기**로 날아온다 — 여기서 곧바로 busy 를 내리면
         우리가 만든 toggle 을 «밖에서 연 것» 으로 오해해 탭이 도로 돌아간다(실측으로 잡음).
         큐 순서상 toggle 태스크가 이 setTimeout(0) 보다 먼저 돌므로 이렇게 내린다. */
      setTimeout(function () { busy = false; }, 0);
    }
    paint();
  }

  /** 밖에서 카드를 열면(딥링크 · ⚡자주 쓰는 기능 · 허브 · AI 명령) 탭이 «따라간다». */
  function onCardToggle(which) {
    if (busy) return;
    var el = $(which === 'rooms' ? LIVE_CARD : LIST_CARD);
    if (!el || !el.open) return;
    var want = (which === 'rooms') ? 'rooms' : 'all';
    if (cur === want) return;
    cur = want;
    paint();
    /* ⛔ 여기서 반대쪽을 접지 않는다 — 남이 연 것을 우리가 다시 닫으면
       「눌렀는데 아무 일도 안 일어남」이 된다. 표시만 따라간다. */
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
      b.addEventListener('click', function (e) { e.preventDefault(); apply(t.id, true); });
      bar.appendChild(b);
    });
    live.parentNode.insertBefore(bar, live);

    // 밖에서 연 카드를 따라가려고 그 두 카드의 toggle 만 듣는다(상주 감시자가 아니다)
    var l = $(LIST_CARD);
    if (l && !l.__tdt) { l.__tdt = 1; l.addEventListener('toggle', function () { onCardToggle('list'); }); }
    if (!live.__tdt) { live.__tdt = 1; live.addEventListener('toggle', function () { onCardToggle('rooms'); }); }

    paint();
    return bar;
  }

  /** 「오늘 수업」을 보고 있을 때만 탭 줄을 띄운다. 카드는 «감추지 않으므로» 되돌릴 것이 없다. */
  var wasOn = false;
  function sync() {
    var bar = build();
    if (!bar) return;
    var on = bothShown();
    /* 🔴 «들어올 때» 는 항상 「전체」다. IA6 의 showOnly 가 대표 카드(cards[0] = 실시간)에
       open=true 를 박는데, 그 toggle 을 우리가 «밖에서 열었다» 로 읽어 화상방 탭으로 시작하던
       것을 여기서 되돌린다(실측으로 잡음). ⛔ 고른 탭을 저장하지 않는 이유도 같다 —
       「오늘 수업」을 눌렀는데 화상방이 뜨면 이름과 첫 화면이 어긋난다.
       다만 `#card-active-rooms` 로 «곧바로» 온 경우(사이트 지도 링크)는 그 탭으로 시작한다. */
    if (on && !wasOn) {
      cur = (location.hash === '#' + LIVE_CARD) ? 'rooms' : 'all';
    }
    wasOn = on;
    if (bar.hidden === on) bar.hidden = !on;
    if (on) apply(cur, false);
  }

  function later() { setTimeout(sync, 60); setTimeout(sync, 400); }

  function boot() {
    /* ⚠️ 사이드바 클릭은 window 캡처로 듣는다 — 사이드바에 직접 달면 ph97 의 stopPropagation 에
       삼켜져 영원히 안 불린다(CLAUDE.md 2장). 클릭 «뒤» 에 봐야 하므로 한 틱 미룬다.
       🏠 경로 줄(#mi-crumb)은 <body> 직속이라 사이드바 안이 아니다 — 따로 받는다. */
    window.addEventListener('click', function (e) {
      var t = e && e.target;
      if (!t || !t.closest) return;
      if (t.closest('#ph85-sidebar') || t.closest('#ph161-quick') || t.closest('#mi-crumb')) later();
    }, true);
    // 사이드바 메뉴 검색은 click 이 아니라 input 으로 showAll() 한다
    window.addEventListener('input', function (e) {
      var t = e && e.target;
      if (t && t.id === 'ph85-search') later();
    }, true);
    window.addEventListener('hashchange', function () { setTimeout(sync, 60); });
    /* 🌐 KO/EN — 관리자 화면은 document 에서 쏘고, 다른 화면은 window 에서 쏜다. 둘 다 듣는다. */
    document.addEventListener('mangoi:lang-changed', paint);
    window.addEventListener('mangoi:lang-changed', paint);
    // 🔐 역할이 늦게 오면 탭 구성이 달라진다(대리점은 🎥 탭이 없다)
    document.addEventListener('mangoi:menu-visibility', paint);
    document.addEventListener('mangoi:identity', paint);

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
