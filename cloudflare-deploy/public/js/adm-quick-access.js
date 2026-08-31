/* adm-quick-access.js — ⚡ 매니저 자주 쓰는 기능 (사이드바 맨 위 고정)
 *   2026-07-23 최초 · 2026-08-08 개편(6개 → 10개 + 스스로 순서 학습)
 *
 * ── 왜 고쳤나 ────────────────────────────────────────────────────────────
 *   기존 6개는 2026-07-23 매니저가 «말로 부른 순서» 그대로였고 그 뒤로 검증된 적이 없다.
 *   운영 D1 을 실측하고(SELECT 만) 경쟁사 첫 화면을 조사해서 다시 매겼다.
 *
 *     · 출결   4,834건/30일 — 데이터량 1위인데 「오늘」 그룹 안이라 두 번 눌러야 닿았다
 *     · 결제·미납 — 독촉이 «매일 17건씩» 자동 발송 중(90일 934건) · 미납 119건.
 *                  월 1회로 보여 뺐다가 경쟁사(학원관리 5곳 전원이 첫 화면) 때문에 다시 찾았다
 *     · 평가서 104건/90일 — 사람이 직접 쓰는 작업 중 최대
 *     · 문의   13건이 «전부 미처리(new)» 상태로 남아 있었다
 *
 * ── 스스로 배우는 순서 (3층) ────────────────────────────────────────────
 *   1층 기본 순서(아래 ITEMS) → 2층 개인 사용기록(localStorage) → 3층 조직 집계(ux_events).
 *   최근 30일 클릭에 반감기 7일 가중치를 줘서 정렬한다. 동점이면 «항상» 기본 순서가 이긴다.
 *   글로벌 튜터링 SaaS 도 고정 순서를 포기하고 관리자별 커스텀으로 갔다 — 정답 한 줄은 없다.
 *
 * ── 경량·무버퍼링 원칙 (이 파일이 지키는 것) ────────────────────────────
 *   · 부팅 때 네트워크 요청 0건. 계측은 나갈 때 sendBeacon 한 번으로 몰아 보낸다(메인스레드 0ms).
 *   · 순서는 «페이지를 열 때 한 번만» 계산한다. 작업 중에 버튼이 움직이면 손이 헷갈린다.
 *   · MutationObserver·rAF·폴링 없음. 짧은 타이머 2개(역할 적용 대기)뿐.
 *   · 렌더는 문자열 한 번 조립 → innerHTML 한 번 대입. 레이아웃 반복 계산 없음.
 *
 * ── ⚠️ 손대기 전에 반드시 ───────────────────────────────────────────────
 *   · 항목 class 는 `.ph161-q` 그대로 둘 것. 아이보리 테마 글자색 !important 가 이 이름에 걸려 있다.
 *     바꾸면 멜카 매니저가 08-04 에 고쳐 달라던 «노란 글씨»로 되돌아간다.
 *   · 라벨에 이모지 금지. 왼쪽에 SVG 아이콘을 따로 그리므로 «아이콘 두 개»로 보인다(08-08 사장님 지적).
 *   · `card` 는 반드시 **adm-ia6.js 해당 항목의 cards[0]** 과 같아야 한다.
 *     ia6 버튼을 `data-card` 로 찾기 때문이다. 어긋나면 옛 경로로 빠져 «눌러도 반응 없음»이 된다.
 */
(function () {
  'use strict';
  if (window.__ph161v2) return;          // 중복 로드 방어
  window.__ph161v2 = 1;

  var LS_USE  = 'mangoi_qa_use';         // 개인 사용기록 {키:[[일련일,횟수],…]}
  var LS_MODE = 'mangoi_qa_mode';        // 'auto'(기본) | 'fixed'
  var HALF_LIFE = 7;                     // 가중치 반감기(일)
  var KEEP_DAYS = 30;                    // 이보다 오래된 기록은 잊는다

  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }

  /* ── 기본 순서 10개 ──────────────────────────────────────────────────────
     key  = 사용기록·계측 키 (서버 정규식 [0-9A-Za-z:._\-\/가-힣] 통과하도록 공백··  금지)
     card = 이동할 카드 id (= ia6 항목의 cards[0])
     sub  = 그 안에서 추가로 펼쳐 내려갈 요소 id (없으면 null) */
  var ITEMS = [
    /* 🧾 결재함 — **이 표의 첫 칸**. 다른 항목과 달리 이 화면의 카드가 아니라 딴 페이지로 간다.
       [왜 여기 넣었나] 2026-08-20 까지는 이 표 «위» 에 초록 줄이 따로 떠 있었다. 급히 만든
          입구라 표 밖에 있어 어색했고, 사이드바에도 결재함이 생기면서 입구가 셋이 됐다.
          표 안으로 들여 하나 줄인다.
       ⚠️ card 가 없으므로 usable()·roleHidden() 이 판정할 대상이 없다 — href 항목은 그대로 통과시킨다.
       ⚠️ 순서 학습(freezeOrder)이 이 칸을 아래로 밀지 않도록 pin 을 준다. 결재는 «누가 답을
          기다리는» 일이라 덜 눌렀다는 이유로 뒤로 가면 안 된다. */
    { key: '결재함', ko: '결재함', en: 'Approvals',
      card: null, sub: null, href: '/work', pin: true,
      ico: '<path d="M3 13h4l2 3h6l2-3h4"/><path d="M5.5 5h13l2.5 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>' },

    { key: '오늘수업',   ko: '오늘 수업 (바로 입장)',   en: "Today's classes (join)",
      card: 'card-students-mgmt', sub: 'sm-today-classes',
      ico: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },

    { key: '수업관찰',   ko: '수업 관찰', en: 'Class observation',
      card: 'card-admin-ghost', sub: null,
      ico: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },

    /* 🗼 (2026-08-30) 수업 관제탑 — 지금 열린 수업을 한 표로 보고 그 자리에서 참관·입장·종료.
       ⚠️ 결재함과 같은 href 항목이다(card 가 없으므로 usable()·roleHidden() 판정 대상이 아니다).
          강사·지사에게도 칸이 보이지만 화면 쪽이 스스로 막는다(monitor-wall 머리말 참고). */
    { key: '관제탑',     ko: '수업 관제탑 (전체 현황)', en: 'Class control tower',
      card: null, sub: null, href: '/admin/monitor-wall.html',
      ico: '<path d="M12 2v20"/><path d="M5 22l7-9 7 9"/><path d="M7 8h10"/><circle cx="12" cy="5" r="2"/>' },

    { key: '수업종료연장', ko: '수업 종료 / 연장', en: 'End / extend classes',
      card: 'card-active-rooms', sub: null,
      ico: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },

    /* 신규 — 30일 4,834건으로 데이터량 1위인데 지금까지 두 번 눌러야 닿았다 */
    { key: '출결현황',   ko: '출결 현황', en: 'Attendance',
      card: 'card-attendance-status', sub: null,
      ico: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>' },

    { key: '학생목록',   ko: '학생 목록 (대리점·학원)', en: 'Student list (by agency)',
      card: 'card-students-mgmt', sub: null,
      ico: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>' },

    { key: '수강신청',   ko: '수강신청 / 등록', en: 'Enrollment',
      card: 'card-enrollments', sub: null,
      ico: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },

    /* 신규 — card 는 ia6 「결제」의 cards[0](=b2b). sub 로 «미납 독촉» 카드까지 내려간다 */
    { key: '결제미납',   ko: '결제 · 미납', en: 'Payments & overdue',
      card: 'card-payments-b2b', sub: 'card-auto-dunning',
      ico: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>' },

    { key: '레벨테스트', ko: '레벨테스트', en: 'Level test',
      card: 'card-level-tests', sub: null,
      ico: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },

    /* 신규 — 104건/90일 */
    { key: '평가서',     ko: '평가서', en: 'Evaluations',
      card: 'card-eval-mgmt', sub: null,
      ico: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>' },

    /* 신규 — 13건 전부 «미처리» 상태였다 */
    { key: '문의상담',   ko: '문의 · 신규상담', en: 'Inquiries',
      card: 'card-inquiry-mgmt', sub: null,
      ico: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>' }
  ];

  /* ── 사용기록 ────────────────────────────────────────────────────────────
     KST 기준 «일련일»로 저장한다(날짜 문자열보다 짧고 뺄셈이 그대로 경과일). */
  function dayNo() { return Math.floor((Date.now() + 32400000) / 86400000); }

  function loadUse() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_USE) || '{}');
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
    } catch (e) { return {}; }
  }

  function saveUse(u) {
    try { localStorage.setItem(LS_USE, JSON.stringify(u)); } catch (e) { /* 용량 초과 등 — 무시 */ }
  }

  /** 최근 KEEP_DAYS 안의 클릭에 반감기 가중치. 기록이 없으면 0. */
  function scoreOf(rows, today) {
    if (!rows || !rows.length) return 0;
    var s = 0;
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i] && rows[i][0], n = rows[i] && rows[i][1];
      if (typeof d !== 'number' || typeof n !== 'number') continue;
      var age = today - d;
      if (age < 0 || age > KEEP_DAYS) continue;
      s += n * Math.pow(0.5, age / HALF_LIFE);
    }
    return s;
  }

  function mode() {
    try { return localStorage.getItem(LS_MODE) === 'fixed' ? 'fixed' : 'auto'; } catch (e) { return 'auto'; }
  }

  /* ── 순서 — 부팅 때 «한 번만» 계산해 얼린다 ───────────────────────────
     작업 중에 버튼이 움직이면 손이 헷갈린다. 클릭은 기록만 되고 순서는 다음 접속에 반영된다. */
  var ORDER = null;
  function freezeOrder() {
    if (mode() === 'fixed') { ORDER = ITEMS.slice(); return; }
    var use = loadUse(), t = dayNo();
    /* 📌 pin 항목은 «자동 정렬» 에서도 맨 앞에 고정한다.
       결재는 누가 답을 기다리는 일이라, 덜 눌렀다는 이유로 아래로 밀리면 안 된다.
       (이 표는 많이 누른 순으로 스스로 재배치된다 — 그 규칙에서만 예외를 둔다) */
    ORDER = ITEMS
      .map(function (it, i) { return { it: it, i: i, s: scoreOf(use[it.key], t) }; })
      .sort(function (a, b) {
        var ap = a.it.pin ? 1 : 0, bp = b.it.pin ? 1 : 0;
        return (bp - ap) || (b.s - a.s) || (a.i - b.i);   // 고정 → 많이 쓴 순 → 기본 순서
      })
      .map(function (x) { return x.it; });
  }

  /* ── 역할 권한으로 감춰진 항목은 빼고 그린다 ───────────────────────────
     역할 숨김(adm-core `_applyMenuVisibility`)은 **`details.menu-card` 자신에게만**
     인라인 `style.display='none'` 을 건다. 그래서 판정도 딱 그 범위에서만 한다.

     🔴 (2026-08-08 실측으로 잡은 버그) 처음엔 «조상 아무나 인라인 display:none 이면 권한 없음»
        으로 짰다가 바로가기가 **10개 중 1개만 남았다.** 범인은 권한이 아니라 화면 전환이었다 —
        카드들을 통째로 담은 컨테이너 `<div id="legacy-cards">` 가 잠깐 display:none 이 되는데,
        그걸 «권한 없음»으로 읽어 그 안의 카드 9개를 전부 지워 버린 것이다.
        (`card-payments-b2b` 만 그 컨테이너 밖에 있어서 혼자 살아남았다. 그 «1개»가 단서였다.)
     → 컨테이너의 display 는 «지금 무엇을 보여 주는가» 이지 «이 사람이 볼 수 있는가» 가 아니다.
        조상을 훑되 **menu-card 만** 본다(카드가 카드를 품는 구조가 실제로 있다 — ia6 주석 참고).
     ⚠️ ia6 의 카드 필터는 class(.ia6-hide) 라 인라인을 안 건드리지만, 과거에 인라인으로
        건드린 코드가 있었으므로 방어적으로 한 번 더 제외한다. */
  /* 🔐 카드 숨김 판정 — **규칙 정본은 adm-core.js 의 `window.mangoiCardHidden`** 이다.
     아래는 그것이 없을 때만 도는 안전장치다(하니스 단독 실행 · adm-core 로드 실패).
     ⚠️ 규칙을 여기서 «늘리지» 마세요. 새 숨김 방식이 생기면 정본만 고치고,
        정본이 있는 정상 경로에서는 이 줄이 아예 실행되지 않습니다. */
  function _cardHidden(el) {
    if (window.mangoiCardHidden) return window.mangoiCardHidden(el);
    if (!el) return true;
    if (el.classList && (el.classList.contains('rbac-hide') ||
                         el.classList.contains('ph118-card-hidden'))) return true;
    return !!(el.style && el.style.display === 'none');
  }

  function roleHidden(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      if (n.tagName !== 'DETAILS') continue;
      if (!n.classList || !n.classList.contains('menu-card')) continue;
      // 🔐 (2026-08-18) 역할 숨김이 인라인 display → «.rbac-hide» 클래스로 바뀌었다.
      //   위 주석의 «인라인에만 건다» 전제가 이때 깨졌으니 같이 읽는다(옛 인라인도 계속 인정).
      //   판정 정본은 adm-core.js 의 window.mangoiCardHidden 이다(세 가지 숨김을 한 곳에서 본다).
      //   ⚠️ 단 «.ia6-hide 는 권한이 아니다» 라는 위 예외는 여기서 계속 지킨다 —
      //      화면 전환으로 감춘 카드를 «권한 없음» 으로 읽으면 바로가기가 통째로 비워진다.
      if (n.classList && n.classList.contains('ia6-hide')) continue;
      if (_cardHidden(n)) return true;
    }
    return false;
  }

  function usable(it) {
    // 🔗 딴 페이지로 가는 항목은 이 화면의 카드를 안 쓴다 — 카드로 판정하면 «항상 없음» 이 된다.
    if (it.href) return true;
    var el = document.getElementById(it.card);
    return !!el && !roleHidden(el);
  }

  /* ── 3층: 조직 집계 ──────────────────────────────────────────────────────
     새 API 를 만들지 않는다 — 학생 화면이 쓰던 `POST /api/games/ux-track` 을 그대로 쓴다.
     클릭마다 보내지 않고 메모리에 모았다가 **화면을 떠날 때 sendBeacon 한 번**으로 흘린다.
     sendBeacon 은 브라우저가 백그라운드로 보내므로 클릭·이동이 1ms 도 느려지지 않는다.
     실패해도 아무 일도 일어나지 않아야 한다(통계일 뿐이다). */
  var pending = null;

  function track(key) {
    if (!pending) pending = {};
    pending[key] = (pending[key] || 0) + 1;
  }

  function flush() {
    if (!pending) return;
    var events = [], k;
    for (k in pending) if (Object.prototype.hasOwnProperty.call(pending, k)) {
      events.push({ k: 'adm:' + k, n: pending[k] });
    }
    pending = null;
    if (!events.length) return;
    try {
      var uid = (window._adminSession && window._adminSession.uid) || 'admin';
      var body = JSON.stringify({ user_id: String(uid), events: events });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/games/ux-track', new Blob([body], { type: 'application/json' }));
      } else if (window.fetch) {
        fetch('/api/games/ux-track', { method: 'POST', body: body, keepalive: true,
          headers: { 'Content-Type': 'application/json' } })['catch'](function () {});
      }
    } catch (e) { /* 통계는 실패해도 화면에 영향 없음 */ }
  }

  /* ── 이동 ────────────────────────────────────────────────────────────────
     🔴 (2026-08-08) ia6(6그룹 메뉴)가 켜지면 «고른 항목의 카드만» 남기고 나머지에
        .ia6-hide(display:none !important) 를 건다. 여기서 곧바로 scrollIntoView 를 하면
        감춰진 카드로 가느라 화면이 그대로다 — 「눌러도 아무 반응이 없다」가 이것이었다.
        → 우리가 감춤을 되돌리지 않는다(인라인 style 로는 !important 를 못 이긴다).
          대신 **그 항목의 사이드바 버튼을 대신 눌러 준다.** ia6 자신의 로직이 그대로 돈다.
        버튼은 한글 이름이 아니라 data-card 로 찾는다 — 항목 이름이 바뀌어도 안 깨지게. */
  function ia6Btn(cardId) {
    try {
      return document.querySelector('#ph85-sidebar [data-ia6-item][data-card="' + cardId + '"]');
    } catch (e) { return null; }
  }

  /* ⚠ 스크롤은 항상 'auto' — 부드러운 스크롤을 시작만 하고 끊으면 멀미가 난다는 지적이 이미 있었다.
        숨은 탭에서는 smooth 가 애니메이션을 못 돌려 «안 움직이는» 결과가 되기도 한다. */
  function goSub(subId) {
    var s = document.getElementById(subId);
    if (!s) return;
    if (s.tagName === 'DETAILS') s.open = true;
    try { s.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) { /* 무시 */ }
    flash(s);
  }

  window.ph161Go = function (cardId, subId) {
    /* ① ia6 가 켜져 있으면 그쪽에 맡긴다 */
    var btn = ia6Btn(cardId);
    if (btn) {
      btn.click();                       // ia6 의 window 캡처 위임이 받는다
      /* 하위 목표는 ia6 의 스크롤 보정(0·60·260ms)이 끝난 뒤에 다시 잡는다.
         먼저 잡으면 ia6 가 곧바로 대표 카드 맨 위로 되돌려 놓는다. */
      if (subId) setTimeout(function () { goSub(subId); }, 320);
      closeMobileNav();
      return;
    }

    /* ② ia6 가 없을 때(옛 9그룹 메뉴) — 예전 그대로 */
    var c = document.getElementById(cardId);
    if (!c) return;
    /* ia6 는 없는데 감춤 클래스만 남은 어중간한 상태에 대한 보험 */
    try {
      for (var n = c; n && n !== document.body; n = n.parentElement) n.classList.remove('ia6-hide');
    } catch (e) { /* 무시 */ }
    try { if (c.tagName === 'DETAILS') c.open = true; } catch (e) { /* 무시 */ }
    if (subId && document.getElementById(subId)) { goSub(subId); closeMobileNav(); return; }
    try { c.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) { /* 무시 */ }
    flash(c);
    closeMobileNav();
  };

  function flash(el) {
    try {
      var o = el.style.boxShadow;
      el.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.6)';
      setTimeout(function () { el.style.boxShadow = o; }, 1100);
    } catch (e) { /* 무시 */ }
  }

  /* 모바일에선 사이드바가 화면을 덮으므로, 이동했으면 닫아준다 */
  function closeMobileNav() {
    try { if (window.mgaClose) window.mgaClose(); } catch (e) { /* 무시 */ }
  }

  /* ── 렌더 ────────────────────────────────────────────────────────────────
     문자열 한 번 조립 → innerHTML 한 번 대입. 항목마다 노드를 만들지 않는다.

     ⚠️ data-ko/data-en 은 반드시 «글자를 담은 <span>» 에 붙인다. 바깥 div 에 붙이면 안 된다 —
        adm-core 의 `applyAdminLangDom()` 이 `[data-ko]` 를 훑어 **el.textContent = 라벨** 로
        통째로 갈아치우므로, 바깥 div 에 붙어 있으면 🌐 를 누르는 순간 **안의 SVG 아이콘이 지워진다.**
        (옛 버전이 실제로 그랬다. 아이콘이 사라지고 맨 글자만 남았다.) */
  var lastSig = '';

  function render() {
    var box = document.getElementById('ph161-quick-items');
    if (!box) return;
    if (!ORDER) freezeOrder();

    var list = ORDER.filter(usable);
    var en = isEn();
    var sig = (en ? 'en|' : 'ko|') + list.map(function (i) { return i.key; }).join(',');
    if (sig === lastSig) return;                 // 바뀐 게 없으면 DOM 을 건드리지 않는다
    lastSig = sig;

    var html = '', i;
    for (i = 0; i < list.length; i++) {
      var it = list[i];
      html += '<div class="ph161-q" role="button" tabindex="0"'
        + ' data-qa="' + it.key + '"'
        /* 🔎 (2026-08-08) 6개 → 10개가 되면서 «상자 하나가 사이드바보다 커지는» 문제가 생겼다.
           실측: 행 39.4px(관리자 확대 1.32배 → 화면 52px) × 10 = 520px 로
           사이드바 가시 높이 591px 를 상자 혼자 넘겨서 6그룹 메뉴가 통째로 접힘 아래로 밀렸다.
           → 여백 9→7px, 줄높이 1.65→1.35 로 행을 31.5px 로 줄인다(글자 크기는 그대로 13px).
              항목을 빼지 않고 «메뉴가 첫 화면에 보이는» 상태를 되찾는 가장 싼 방법이다. */
        + ' style="display:flex;align-items:center;gap:9px;padding:7px 12px;cursor:pointer;color:#fde68a;'
        + 'font-size:13px;line-height:1.35;font-weight:700;border-top:'
        + (i ? '1px solid rgba(251,191,36,0.14)' : '0')
        + ';min-width:0;overflow-wrap:anywhere">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round"'
        + ' stroke-linejoin="round" width="16" height="16" style="flex:none" aria-hidden="true">' + it.ico + '</svg>'
        + '<span style="flex:1" data-ko="' + it.ko + '" data-en="' + it.en + '">'
        + (en ? it.en : it.ko) + '</span>'
        + '</div>';
    }
    box.innerHTML = html;
  }

  /* ── 자동/기본 토글 — 아무도 순서에 갇히지 않게 ─────────────────────────
     ⚠️ 머리글 안에 넣지 않는다. 머리글 div 에는 data-ko 가 붙어 있어서
        `applyAdminLangDom()` 이 textContent 를 갈아치울 때 **자식이 통째로 지워진다.**
        → 목록 아래에 «형제»로 붙인다(#ph161-quick 자신은 data-ko 가 없다).
        HTML 파일은 건드리지 않는다. */
  function mountToggle() {
    var box = document.getElementById('ph161-quick-items');
    var quick = document.getElementById('ph161-quick');
    if (!box || !quick || quick.querySelector('.ph161-mode')) return;

    var b = document.createElement('div');
    b.className = 'ph161-mode';
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.style.cssText = 'padding:5px 12px 6px;text-align:right;cursor:pointer;font-size:10px;' +
      'font-weight:700;opacity:.7;border-top:1px solid rgba(251,191,36,0.14)';
    paintToggle(b);
    box.parentNode.insertBefore(b, box.nextSibling);
  }

  function paintToggle(b) {
    var auto = mode() === 'auto';
    var ko = auto ? '자동 정렬' : '기본 순서';
    var en = auto ? 'auto order' : 'default order';
    b.setAttribute('data-ko', ko);
    b.setAttribute('data-en', en);
    b.title = auto
      ? '내가 자주 쓰는 것이 위로 옵니다. 순서는 페이지를 열 때만 바뀝니다.'
      : '기본 순서로 고정되어 있습니다.';
    b.textContent = isEn() ? en : ko;
  }

  /* ── 클릭 — document 위임 1개 ────────────────────────────────────────────
     ⚠️ 항목마다 리스너를 달지 않는다(사이드바를 통째로 다시 그리는 스크립트가 있어 조용히 죽는다).
     ⚠️ 사이드바 클릭을 가로채는 adm-s11(ph97)은 .ph85-head/.ph85-sub 만 잡는다.
        .ph161-q 는 건드리지 않으므로 버블이 document 까지 정상적으로 올라온다(실측 확인). */
  function onActivate(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var mo = t.closest('.ph161-mode');
    if (mo) {
      e.preventDefault(); e.stopPropagation();
      try { localStorage.setItem(LS_MODE, mode() === 'auto' ? 'fixed' : 'auto'); } catch (er) { /* 무시 */ }
      paintToggle(mo);
      ORDER = null; lastSig = '';            // 다음 렌더에서 새 기준으로 다시 얼린다
      render();
      return;
    }

    var q = t.closest('.ph161-q');
    if (!q) return;
    e.stopPropagation();

    var key = q.getAttribute('data-qa');
    var it = null, i;
    for (i = 0; i < ITEMS.length; i++) if (ITEMS[i].key === key) { it = ITEMS[i]; break; }
    if (!it) return;

    /* 기록 먼저 — 이동 중 페이지가 바뀌어도 남게 */
    var use = loadUse(), rows = use[key] || (use[key] = []);
    var t0 = dayNo(), last = rows[rows.length - 1];
    if (last && last[0] === t0) last[1]++;
    else rows.push([t0, 1]);
    if (rows.length > KEEP_DAYS) rows.splice(0, rows.length - KEEP_DAYS);   // 오래된 것부터 버린다
    saveUse(use);
    track(key);

    if (it.href) { location.href = it.href; return; }   // 딴 페이지(결재함)
    window.ph161Go(it.card, it.sub);
  }

  function boot() {
    freezeOrder();
    render();
    mountToggle();

    document.addEventListener('click', onActivate);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!e.target || !e.target.closest) return;
      if (!e.target.closest('.ph161-q') && !e.target.closest('.ph161-mode')) return;
      e.preventDefault();
      onActivate(e);
    });

    /* 언어 토글 후에도 라벨이 따라오도록 (다른 탭에서 바꾼 경우) */
    try {
      window.addEventListener('storage', function (e) {
        if (e && e.key === 'adminLang') { lastSig = ''; render(); }
      });
    } catch (e) { /* 무시 */ }

    /* 계측은 «떠날 때» 한 번만. pagehide 는 모바일 백그라운드 전환까지 잡는다.
       visibilitychange 는 탭 전환에도 불리므로 둘 다 걸어 두고, flush 가 비면 즉시 반환한다. */
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });

    /* 역할 권한 적용(adm-core 는 DOMContentLoaded + 100ms 에 돈다)과 본문 지연 렌더를 감안해
       두 번만 다시 확인한다. 바뀐 게 없으면 render() 가 DOM 을 건드리지 않고 즉시 빠진다. */
    setTimeout(render, 800);
    setTimeout(render, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
