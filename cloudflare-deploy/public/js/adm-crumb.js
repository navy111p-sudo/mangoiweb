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
//   [🔙 뒤로는 «브라우저 뒤로가기» 와 같은 것이 되었다 — 2026-08-19 2차]
//     처음에는 우리끼리 발자국을 기억했다. 그러면 화면의 ← 는 되지만 **휴대폰 뒤로
//     버튼은 그대로 앱을 껐다** — 메뉴를 옮겨도 주소가 안 바뀌니 브라우저가 보기엔
//     «이 페이지에서 아무 일도 없었다» 이기 때문이다.
//     → 이제 메뉴를 고를 때마다 history.pushState 로 칸을 하나 쌓는다. 그래서
//       **화면의 ← · PC 뒤로가기 · 휴대폰 뒤로 버튼 셋이 모두 같은 뜻**이 된다.
//     ⚠️ 발자국을 «두 벌»(우리 배열 + 브라우저 history) 갖지 않는다. 둘은 반드시
//        어긋난다(사람이 브라우저 뒤로가기를 섞어 쓰는 순간). 정본은 **브라우저 history**
//        하나이고, 우리는 «지금 어디»(current)와 «우리가 쌓은 칸 수»(pushed)만 센다.
//     ⚠️ 주소는 바꾸지 않는다(pushState 의 url 인자를 안 준다). 관리자 화면 주소에
//        `#m=강사:급여` 같은 것이 붙으면 그 주소를 그대로 복사해 공유하는 사람이 생기고,
//        권한이 다른 사람이 열면 «없는 메뉴» 가 된다. 칸만 쌓으면 뒤로가기에는 충분하다.
//     ⚠️ 부팅 때 adm-ia6.js 가 «마지막으로 보던 메뉴» 를 자동으로 여는 것은 **누른 것이
//        아니므로 칸을 쌓지 않는다.** 그 상태에서 ← 는 history.back() 이 아니라 홈으로
//        간다(pushed === 0). 안 그러면 첫 화면에서 ← 한 번에 관리자 밖으로 나간다.
//
//   [되돌아가는 방법 — 새 이동 코드를 만들지 않는다]
//     기억해 둔 항목의 **사이드바 원본을 그대로 click()** 한다. 드로어 닫기·카드 필터·
//     맨 위 맞추기가 이미 그 경로에 다 들어 있고, 흉내 내면 그 셋 중 하나를 반드시 빠뜨린다.
//     (js/adm-recent-menus.js 가 쓰는, 검증된 길을 그대로 쓴다.)
//
//   [🏠 홈은 새로고침해도 유지된다 — 2026-08-19 2차]
//     adm-ia6.js 는 부팅할 때 «마지막으로 보던 항목» 을, 없으면 **「오늘」의 첫 항목**을
//     무조건 고른다. 그래서 홈을 눌러 대시보드를 봐도 새로고침 한 번에 「오늘의 수업」으로
//     돌아왔다. → 홈을 누르면 그 칸(localStorage `mangoi_admin_ia6`)에 **'__home' 표시**를
//     남기고, adm-ia6.js 가 그 표시를 보면 아무 항목도 고르지 않는다(그 파일 boot 참고).
//     ⚠️ 두 파일이 이 문자열 하나로 짝을 이룬다. 한쪽만 고치면 조용히 옛 동작으로 돌아간다.
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
  var HOME   = '__home';             // ⚠️ adm-ia6.js 의 boot() 와 짝. 한쪽만 고치지 말 것
  var GAP    = 0;                    // 줄과 제목 사이 숨 쉴 틈. 카드 자체 여백(≈19px)이 이미 있다

  var current = '';      // 지금 보고 있는 항목 key. '' = 대시보드
  var pushed  = 0;       // 우리가 history 에 쌓은 칸 수 (0 이면 뒤로 갈 «우리» 칸이 없다)
  var quiet   = false;   // 되돌아가는 중 — 그 클릭은 새 발자국이 아니다
  var armed   = false;   // 사이드바가 다 그려졌나 — 부팅 중의 자동 스크롤을 «이동» 으로 세지 않기 위해

  function $(id) { return document.getElementById(id); }
  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }

  function itemEl(key) {
    if (!key || key === HOME) return null;
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

    var el = itemEl(current);

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

  /* ── 이동 ───────────────────────────────────────────────────────────────── */
  function applyKey(key) {
    var el = itemEl(key);
    if (!el) return false;
    quiet = true;                       // 이 클릭은 «되돌아가기» 다 — 칸을 새로 쌓지 않는다
    try { el.click(); } catch (e) { /* 무시 */ }
    quiet = false;
    current = key;
    render();
    return true;
  }

  function pushStep(key) {
    pushed += 1;
    /* ⚠️ url 인자를 주지 않는다 — 주소는 그대로 두고 «칸» 만 쌓는다(머리말 참고). */
    try { history.pushState({ __miCrumb: 1, key: key, depth: pushed }, ''); }
    catch (e) { pushed -= 1; }          // 못 쌓았으면 세지도 않는다(← 가 엉뚱하게 나가지 않게)
  }

  /* ── ← 뒤로 ─────────────────────────────────────────────────────────────── */
  function goBack() {
    /* 우리가 쌓은 칸이 있으면 브라우저에게 맡긴다 — 휴대폰 뒤로 버튼과 «완전히 같은 길». */
    if (pushed > 0) { try { history.back(); return; } catch (e) { /* 무시 */ } }
    /* 쌓은 칸이 없다 = 부팅 때 자동으로 열린 첫 메뉴다. 직전 화면은 대시보드였다.
       여기서 history.back() 을 부르면 관리자 밖으로 나간다. */
    goHome();
  }

  /* ── 🏠 홈 ──────────────────────────────────────────────────────────────── */
  function goHome(fromPop) {
    armed = true;
    current = '';
    /* 새로고침해도 대시보드로 남게 표시를 남긴다 — adm-ia6.js 의 boot() 가 이 값을 본다. */
    try { localStorage.setItem(LS_IA6, HOME); } catch (e) { /* 사파리 시크릿 등 — 무시 */ }
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
    if (!fromPop) pushStep('');          // 홈도 «이동» 이다 — 뒤로 누르면 방금 보던 메뉴로
  }

  /* ── 뒤로가기(브라우저·휴대폰 버튼) ────────────────────────────────────────
     ⚠️ 우리가 쌓지 않은 칸(state 가 없는 칸)까지 돌아왔다면 그것은 «이 페이지에 처음
        들어온 칸» 이다. 거기서는 대시보드를 보여 준다 — 한 번 더 누르면 그때 페이지를 뜬다. */
  window.addEventListener('popstate', function (e) {
    var s = e && e.state;
    if (s && s.__miCrumb) {
      pushed = s.depth || 0;
      if (s.key) {
        // 항목이 사라졌다면(권한 변경·메뉴 개편) 대시보드로 — «눌렀는데 아무 일 없음» 을 남기지 않는다
        if (!applyKey(s.key)) goHome(true);
      } else {
        goHome(true);
      }
      return;
    }
    pushed = 0;
    goHome(true);
  });

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
    if (!key || quiet) return;
    if (key === current) return;         // 같은 곳을 다시 눌러도 칸은 하나
    armed = true;
    current = key;
    pushStep(key);
    // IA6 가 ia6-on 을 붙이고 카드를 고른 «뒤» 에 그린다
    setTimeout(render, 0);
  }, true);

  /* ── 🧭 «점프» 도 이동으로 센다 (2026-08-19 3차) ───────────────────────────
     [무엇이 안 됐나] 🏠 홈을 누른 뒤처럼 **카드가 전부 보이는 상태**에서 ⚡자주 쓰는 기능·
       통합검색·카드 안 「…하러 가기」 로 옮겨 가면 **경로 줄이 안 따라왔다**(사장님 제보).
     [왜] 그런 «점프» 는 사이드바 항목을 누르는 게 아니라 카드로 scrollIntoView 하는 것이다.
       adm-ia6.js 의 wireRevealOnJump 가 그걸 가로채 «사이드바 항목을 대신 눌러» 주는데,
       그 되살리기는 **가려던 카드가 감춰져 있을 때만** 한다(cardOf 가 .ia6-hide 인 카드만 찾는다).
       카드가 이미 보이면 아무도 누르지 않으니 우리 클릭 감시에도 안 걸린다.
       실측(1440×900): 메뉴에 들어가 있을 때 점프 → 「강사 › 강사 평가」 정상 /
                       홈 직후 같은 점프 → 줄이 감춰진 채 그대로.
     [고침] 카드로 뛰는 것을 **한 곳에서** 본다 — 감춰졌든 보이든 상관없이 그 카드를 맡은
       항목을 찾아 줄만 맞춘다. ⚡·검색·AI·카드 안 버튼·딥링크가 전부 이 길로 모인다.
     ⚠️ 우리 래퍼는 adm-ia6.js «보다 먼저» 설치된다(문서 순서: adm-crumb 9352행, adm-ia6 12436행).
        그래서 IA6 래퍼가 우리를 감싸고 → 되살리기(항목 클릭)가 먼저 끝난 뒤 우리가 돈다.
        그 경우 이미 current 가 같아져 있어 아무 일도 하지 않는다(이중 처리 없음).
     ⚠️ 부팅 중에는 세지 않는다(armed). adm-ia6.js 가 «마지막으로 보던 메뉴» 를 자동으로 열면서
        스크롤하는데, 그걸 이동으로 세면 history 에 칸이 하나 쌓여 **첫 화면의 ← 가 관리자 밖으로
        나가 버린다**(위 goBack 주석 참고).
     ⚠️ 카드 하나를 여러 항목이 나눠 맡기도 한다(조직 카드 = 대표지사·지사·대리점·본사 관리).
        그래서 **먼저 «카드 안의 그 칸»(data-ia6-sub)** 으로 찾고, 없을 때만 카드로 찾는다. */
  function itemForCard(cardId) {
    var bar = document.getElementById('ph85-sidebar');
    if (!bar || !cardId) return null;
    var list = bar.querySelectorAll('[data-ia6-item][data-cards]'), i;
    for (i = 0; i < list.length; i++) {
      var cards = (list[i].getAttribute('data-cards') || '').split(/\s+/);
      if (cards.indexOf(cardId) >= 0) return list[i];
    }
    return null;
  }

  function itemForJump(el) {
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return null;
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (!n.id) continue;
      var sub = null;
      try { sub = bar.querySelector('[data-ia6-sub="' + n.id.replace(/"/g, '\\"') + '"]'); } catch (e) { /* 무시 */ }
      if (sub) return sub;                       // 카드 «안의 그 칸» 을 정확히 맡은 항목
      if (/^card-/.test(n.id)) {
        var byCard = itemForCard(n.id);
        if (byCard) return byCard;
      }
    }
    return null;
  }

  function noteJump(el) {
    if (!armed || quiet) return;
    var it = itemForJump(el);
    if (!it) return;                             // 카드가 아닌 곳으로 가는 스크롤은 이동이 아니다
    var key = it.getAttribute('data-ia6-item');
    if (!key || key === current) return;         // 같은 곳으로의 재보정 스크롤 — 아무 일도 하지 않는다
    current = key;
    pushStep(key);
    render();
  }

  try {
    var origSIV = Element.prototype.scrollIntoView;
    if (typeof origSIV === 'function') {
      Element.prototype.scrollIntoView = function () {
        try { noteJump(this); } catch (e) { /* 점프는 어떤 경우에도 막지 않는다 */ }
        return origSIV.apply(this, arguments);
      };
    }
  } catch (e) { /* 무시 */ }

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
       그래서 «항목이 생길 때까지» 잠깐 기다렸다가 한 번 맞춘다(최대 12초).
       ⚠️ 여기서 칸(pushStep)을 쌓지 않는다 — 사람이 누른 것이 아니다(머리말 참고). */
    if (!current) {
      var on  = document.querySelector('#ph85-sidebar .ph85-sub.ia6-on');
      var key = on ? on.getAttribute('data-ia6-item') : '';
      if (!key) { try { key = localStorage.getItem(LS_IA6) || ''; } catch (e) { /* 무시 */ } }
      if (key && key !== HOME && itemEl(key)) current = key;
    }
    render();
    /* 사이드바 항목이 생겼다 = adm-ia6.js 의 부팅이 이미 끝났다(그 자리에서 항목을 고르고
       카드를 맞춘다). 그때부터 «점프» 를 이동으로 센다 — 그 전 자동 스크롤은 세지 않는다. */
    if (!armed && document.querySelector('#ph85-sidebar [data-ia6-item]')) armed = true;
    if (!armed && tries++ < 30) setTimeout(boot, 400);
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
