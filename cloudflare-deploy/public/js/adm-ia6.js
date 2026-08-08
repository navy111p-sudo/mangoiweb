// ═══════════════════════════════════════════════════════════════════════════
// adm-ia6.js — 관리자 메뉴를 «6그룹 36항목» 으로 (2026-08-08)
//
//   왜 —
//     사이드바가 9그룹 87항목이었다. 「강사 통합」 혼자 17개다.
//     직원이 기능을 못 찾는 이유는 기능이 없어서가 아니라 87개 중에서 못 찾아서였다.
//     그리고 87개를 다 세운 채로 카드 88개를 한 화면에 전부 그리고 있었다(3.63MB).
//     즉 «찾기 힘들다» 와 «느리다» 는 같은 원인의 두 얼굴이라 같이 고친다.
//
//   무엇을 하나 —
//     ① 사이드바를 6그룹 36항목으로 다시 세운다. 옛 9그룹은 지우지 않고 감춰 둔다(되돌리기용).
//     ② 항목을 누르면 **그 항목이 맡은 카드만 화면에 남긴다.** 나머지는 감춘다.
//        지금까지 「자료실」을 보려고 88장 사이를 스크롤하던 것이, 5장만 남은 화면이 된다.
//
//   ⚠️ 카드를 «지우지» 않는다. class 로 감출 뿐이다. 이게 중요하다 —
//      부팅 스크립트 여러 개가 getElementById 로 카드 안 요소를 찾는다(319곳).
//      DOM 에서 빼면 그것들이 조용히 죽는다. display:none 은 찾기에 아무 영향이 없다.
//      (역할별 숨김 _applyMenuVisibility 도 이미 같은 방식이라 검증된 길이다.)
//
//   ⚠️ 역할 권한을 건드리지 않는다.
//      역할 숨김은 인라인 style.display 로 걸린다. 여기서는 class 만 쓰므로
//      «지사에게 안 보이던 카드»가 이 기능 때문에 보이게 되는 일은 없다.
//
//   ⚠️ 검색은 그대로 동작한다.
//      새 항목도 옛것과 같은 class(.ph85-group/.ph85-title/.ph85-sub) 를 쓰므로
//      admin.html 의 검색 핸들러가 손대지 않아도 걸린다.
//      그리고 검색을 시작하면 카드 필터를 자동으로 푼다 — 검색 결과가 감춰져 있으면 안 되니까.
//
//   되돌리기 — 이 <script> 한 줄을 빼면 옛 9그룹 87항목이 그대로 돌아온다.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var LS_KEY = 'mangoi_admin_ia6';       // 마지막으로 보던 항목
  var HIDE = 'ia6-hide';

  // ── 6그룹 36항목 ─────────────────────────────────────────────────────────
  //   기준은 «누가 언제 하는 일인가». 부서(회계·강사)와 시점(오늘)을 섞지 않았다.
  //   cards[0] 이 그 항목의 «대표 카드» — 누르면 이것부터 펼친다.
  var GROUPS = [
    {
      key: 'today', ko: '오늘', en: 'Today',
      ico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      items: [
        { ko: '오늘의 수업', en: "Today's classes", cards: ['card-active-rooms'] },
        { ko: '출결',       en: 'Attendance',      cards: ['card-attendance-status', 'card-auto-attendance', 'card-class-attendance'] },
        { ko: '수업 관찰',  en: 'Observe class',   cards: ['card-admin-ghost', 'card-admin-whisper'] },
        { ko: '연기·변경',  en: 'Reschedule',      cards: ['card-schedule-requests'] },
        { ko: '방 초대',    en: 'Room invites',    cards: ['card-room-invite'] },
        { ko: '문의·버그',  en: 'Inbox',           cards: ['card-inquiry-mgmt', 'card-bug-reports'] },
        { ko: '알림함',     en: 'Alerts',          cards: ['card-admin-alerts', 'card-notifications'] }
      ]
    },
    {
      key: 'student', ko: '학생', en: 'Students',
      ico: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
      items: [
        { ko: '학생 명부',       en: 'Students',       cards: ['card-students-mgmt', 'card-school-attendance-stats', 'card-family-mgmt'] },
        { ko: '수강신청',        en: 'Enrollment',     cards: ['card-enrollments'] },
        { ko: '레벨테스트',      en: 'Level test',     cards: ['card-level-tests', 'card-leveltest'] },
        { ko: '상담 예약',       en: 'Counseling',     cards: ['card-counseling-booking'] },
        { ko: '학부모 소통',     en: 'Parents',        cards: ['card-parent-digest', 'card-parent-faq-bot'] },
        { ko: '커뮤니티·리워드', en: 'Community',      cards: ['card-community', 'card-alumni', 'card-referral', 'card-badges-mgmt'] }
      ]
    },
    {
      key: 'teacher', ko: '강사', en: 'Teachers',
      ico: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
      items: [
        { ko: '강사 명부',   en: 'Teachers',        cards: ['card-teacher-mgmt', 'card-mbti-mgmt', 'card-teacher-link', 'card-teacher-contact'] },
        { ko: '시간표·근무', en: 'Schedule',        cards: ['card-timetable', 'card-calendar', 'card-auto-schedule'] },
        { ko: '수업 일지',   en: 'Lesson log',      cards: ['card-lesson-log'] },
        { ko: '급여',        en: 'Payroll',         cards: ['card-payroll-auto', 'card-payroll'] },
        { ko: '강사 평가',   en: 'Teacher review',  cards: ['card-class-ratings', 'card-praise-stats', 'card-supervisor'] },
        { ko: '품질·이력',   en: 'Quality & audit', cards: ['card-vc-quality', 'card-class-audit', 'card-report-forms', 'card-no-shows'] }
      ]
    },
    {
      key: 'lesson', ko: '수업·콘텐츠', en: 'Lessons',
      ico: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
      items: [
        { ko: '평가서',      en: 'Evaluations',       cards: ['card-eval-mgmt', 'card-bulk-eval', 'card-ai-lesson-report', 'card-ai-eval-draft', 'card-monthly-report', 'card-comparison-report', 'card-monthly-ai-report', 'card-lesson-insight'] },
        { ko: '교재',        en: 'Textbooks',         cards: ['card-textbooks', 'card-video-dict'] },
        { ko: '학습 콘텐츠', en: 'Learning content',  cards: ['card-review-quiz', 'card-microlearn', 'card-mini-toeic', 'card-pronunciation', 'card-voice-diary'] },
        { ko: '숙제',        en: 'Homework',          cards: ['card-homework'] },
        { ko: '녹화',        en: 'Recordings',        cards: ['card-recording-storage'] },
        { ko: '학습 분석',   en: 'Learning analytics',cards: ['card-battle-mgmt', 'card-voice-stats', 'card-selfscore'] }
      ]
    },
    {
      key: 'money', ko: '정산·매출', en: 'Finance',
      ico: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
      items: [
        { ko: '회계',        en: 'Accounting',  cards: ['card-accounting-mgmt'] },
        { ko: '결제',        en: 'Payments',    cards: ['card-payments-b2b', 'card-payments-b2c', 'card-recurring-billing', 'card-auto-dunning'] },
        { ko: '포인트',      en: 'Points',      cards: ['card-points-mgmt'] },
        { ko: '지사 정산',   en: 'Settlement',  cards: [], href: '/admin/capitown-settlement.html' },
        { ko: '가맹점·센터', en: 'Franchises',  cards: ['card-franchises', 'card-centers'] }
      ]
    },
    {
      key: 'ops', ko: '경영·설정', en: 'Management',
      ico: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      items: [
        { ko: '경영 지표',   en: 'Dashboard',     cards: ['card-dashboard', 'card-kpi-dashboard', 'card-daily-charts', 'card-rankings', 'card-nps-monthly'] },
        { ko: '이탈·예측',   en: 'Retention',     cards: ['card-retention-risk', 'card-ai-forecast'] },
        { ko: '공지 발송',   en: 'Announcements', cards: ['card-webpush-mgmt', 'card-kakao-mgmt', 'card-poster-maker', 'card-popups-mgmt', 'card-notice-board'] },
        { ko: '자료실',      en: 'Library',       cards: ['card-lib-admin', 'card-lib-teacher', 'card-lib-branch', 'card-lib-agency', 'card-lib-student'] },
        { ko: '직원·권한',   en: 'Staff & roles', cards: ['card-permissions', 'card-cafe24-lists'] },
        { ko: '데이터·보관', en: 'Data',          cards: ['card-data-export', 'card-retention', 'card-gallery', 'card-classroom-test'] }
      ]
    }
  ];

  function isEn() {
    try { return localStorage.getItem('adminLang') === 'en'; } catch (e) { return false; }
  }

  // ── 카드 감추기 ──────────────────────────────────────────────────────────
  //   본문은 «카드 71장이 나란히» 있는 평평한 목록이 아니었다. 실측해 보니 —
  //     · 「강사 관리」 카드가 출결 카드 2장을 **품고** 있다.
  //     · 「리텐션 센터」 카드가 졸업생·추천·NPS·이탈위험 4장을 품고 있다.
  //     · 통합 대시보드의 옛 카드 id 들은 이제 <details> 가 아니라 탭 <div> 다.
  //
  //   그래서 «가장 바깥 details 를 감춘다» 로는 안 된다 — 출결을 고르면 강사 관리째로,
  //   졸업생을 고르면 이탈위험째로 딸려 나오거나 사라진다.
  //
  //   → 감출 단위를 이렇게 정한다:
  //     그 카드에서 위로 올라가되, **다른 항목의 카드를 품는 조상은 넘지 않는다.**
  //     남을 품지 않는 한에서 가장 큰 덩어리가 그 항목의 단위다.
  var _root = null;
  function root() {
    if (!_root) _root = document.getElementById('legacy-cards') || document.body;
    return _root;
  }

  // id → 그 id 를 쓰는 항목 키. 「남의 카드인가」를 판정하는 데 쓴다.
  var ownerOf = {};
  var allEls = [];

  /** el 이 속한 «감출 단위» — 남의 카드를 품지 않는 가장 바깥 details */
  function unitOf(el, itemKey) {
    var r = root(), best = null, n = el;
    // 자기 자신이 details 가 아니면(탭 div 등) 가장 가까운 details 부터 시작
    while (n && n !== r && n !== document.body && n.tagName !== 'DETAILS') n = n.parentElement;
    if (!n || n === r || n === document.body) return el;
    best = n;
    var p = n.parentElement;
    while (p && p !== r && p !== document.body) {
      if (p.tagName === 'DETAILS') {
        var swallowsOther = false;
        for (var i = 0; i < allEls.length; i++) {
          var c = allEls[i];
          if (ownerOf[c.id] !== itemKey && p.contains(c)) { swallowsOther = true; break; }
        }
        if (swallowsOther) break;
        best = p;
      }
      p = p.parentElement;
    }
    return best;
  }

  // 이 기능이 «관리하는» 요소들. 여기 없는 것은 절대 건드리지 않는다(모르는 것은 안 감춘다).
  var managed = null;
  var unitsByItem = null;

  function collect() {
    ownerOf = {}; allEls = [];
    GROUPS.forEach(function (g) {
      g.items.forEach(function (it) {
        var key = g.key + ':' + it.ko;
        (it.cards || []).forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          ownerOf[id] = key;
          allEls.push(el);
        });
      });
    });
    managed = []; unitsByItem = {};
    GROUPS.forEach(function (g) {
      g.items.forEach(function (it) {
        var key = g.key + ':' + it.ko, us = [];
        (it.cards || []).forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          var u = unitOf(el, key);
          if (us.indexOf(u) === -1) us.push(u);
          if (managed.indexOf(u) === -1) managed.push(u);
        });
        unitsByItem[key] = us;
      });
    });
    // 단위들의 «조상 카드» 도 관리 대상에 넣는다.
    //   예: 「리텐션 센터」는 어느 항목의 대표 카드도 아니지만, 그 안에 졸업생·NPS·이탈위험이 들어 있다.
    //   관리 목록에 없으면 어느 화면에서나 빈 껍데기로 남는다.
    //   넣어 두면 아래 규칙(«남길 것을 품으면 살린다»)이 알아서 처리한다.
    var r = root();
    managed.slice().forEach(function (u) {
      var p = u.parentElement;
      while (p && p !== r && p !== document.body) {
        if (p.tagName === 'DETAILS' && managed.indexOf(p) === -1) managed.push(p);
        p = p.parentElement;
      }
    });
  }

  function showOnly(item, key) {
    if (!managed) collect();
    var keep = unitsByItem[key] || [];
    managed.forEach(function (el) {
      // 남길 것 자신 · 남길 것의 조상 · 남길 것의 자손 은 감추지 않는다.
      //   조상을 감추면 그 안의 «남길 것» 까지 같이 사라지기 때문이다.
      var needed = false;
      for (var i = 0; i < keep.length; i++) {
        var k = keep[i];
        if (el === k || el.contains(k) || k.contains(el)) { needed = true; break; }
      }
      if (needed) el.classList.remove(HIDE);
      else el.classList.add(HIDE);
    });
    // 대표 카드(첫 번째)는 펼쳐 준다 — 한 장뿐인 항목에서 또 한 번 누르게 하지 않는다.
    var lead = null;
    (item.cards || []).slice(0, 1).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { lead = el; if (el.tagName === 'DETAILS') el.open = true; }
    });
    /* 🔴 (2026-08-08) 예전엔 여기서 `window.scrollTo(0,0)` 였다. 「카드만 남기니 맨 위면 보인다」는
       전제였는데 **틀렸다** — 대시보드 머리(hero·KPI·오늘 KPI·빠른메뉴 ≈ 1,200px)는 카드가 아니라
       감춰지지 않는다. 실측: 레벨테스트 카드가 top 1203px 에 있는데 화면은 0 으로 올라가
       «눌렀는데 아무 데도 안 갔다» 로 보였다. → 대표 카드를 화면에 올린다.
       ⚠️ 배치가 끝난 뒤에 한 번 더 보정한다. 방금 display 를 되돌린 카드들의 높이가
          아직 안 정해져서, 곧바로 재면 엉뚱한 위치로 간다(ph97 주석의 content-visibility 문제).
       ⚠️ 🔴 rAF 를 쓰지 않는다 — **백그라운드 탭에서는 rAF 가 아예 안 돈다**(실측: 발화 0회).
          그러면 스크롤이 영영 안 일어나 또 «눌러도 안 움직인다» 가 된다. 타이머는 돈다.
       ⚠️ behavior:'auto' — smooth 금지(「오른쪽이 왔다갔다 해서 정신없다」로 이미 제거된 규칙.
          숨은 탭에서는 smooth 가 애니메이션을 못 돌려 «움직이지 않는» 결과가 되기도 한다). */
    if (lead) {
      var toLead = function () {
        try { lead.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) { /* 무시 */ }
      };
      toLead();                    // 우선 한 번
      setTimeout(toLead, 60);      // 배치가 끝난 뒤 보정
      setTimeout(toLead, 260);     // 늦게 그려지는 카드(표·차트)까지 감안한 마지막 보정
    } else {
      try { window.scrollTo(0, 0); } catch (e) { /* 무시 */ }
    }
  }

  function showAll() {
    if (!managed) collect();
    managed.forEach(function (el) { el.classList.remove(HIDE); });
  }

  // ── 사이드바 만들기 ──────────────────────────────────────────────────────
  function svg(paths) {
    return '<svg fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
           'stroke-linejoin="round" width="18" height="18" viewBox="0 0 24 24">' + paths + '</svg>';
  }

  function build(bar) {
    var olds = bar.querySelectorAll('.ph85-group:not([data-ia6])');
    if (!olds.length) return false;
    var anchor = olds[0];
    var en = isEn();
    var frag = document.createDocumentFragment();

    GROUPS.forEach(function (g) {
      var grp = document.createElement('div');
      grp.className = 'ph85-group';
      grp.setAttribute('data-ia6', g.key);

      var head = document.createElement('div');
      head.className = 'ph85-head';
      head.innerHTML =
        '<div class="ph85-ico">' + svg(g.ico) + '</div>' +
        '<div class="ph85-title" data-ko="' + g.ko + '" data-en="' + g.en + '">' + (en ? g.en : g.ko) + '</div>' +
        '<div class="ph85-arrow">›</div>';
      head.setAttribute('data-ia6-head', g.key);   // 아코디언도 위임으로 처리(위 주석과 같은 이유)
      grp.appendChild(head);

      var subs = document.createElement('div');
      subs.className = 'ph85-subs';
      g.items.forEach(function (it) {
        var d = document.createElement('div');
        d.className = 'ph85-sub';
        d.setAttribute('data-ko', it.ko);
        d.setAttribute('data-en', it.en);
        d.setAttribute('data-ia6-item', g.key + ':' + it.ko);
        if (it.cards && it.cards[0]) d.setAttribute('data-card', it.cards[0]);
        d.textContent = en ? it.en : it.ko;
        // ⚠️ 요소마다 리스너를 붙이지 않는다.
        //    사이드바 노드를 나중에 통째로 다시 그리는 스크립트가 있어서(실측: 붙인 리스너가
        //    발화하지 않았다) 각 요소에 건 리스너는 조용히 사라진다.
        //    → 사이드바 «한 곳» 에 위임해 둔다. 노드가 복제돼도 data 속성은 남으므로 계속 동작한다.
        subs.appendChild(d);
      });
      grp.appendChild(subs);
      frag.appendChild(grp);
    });

    // 전체 보기 — 아무도 갇히지 않게. 옛 화면(카드 전부)이 필요하면 여기로.
    var all = document.createElement('div');
    all.className = 'ph85-group';
    all.setAttribute('data-ia6', 'all');
    all.innerHTML = '<div class="ph85-head" data-ia6-head="__all" style="opacity:.75"><div class="ph85-ico">' +
      svg('<path d="M3 6h18M3 12h18M3 18h18"/>') + '</div>' +
      '<div class="ph85-title" data-ko="전체 보기" data-en="Show all">전체 보기</div></div>';
    frag.appendChild(all);

    anchor.parentNode.insertBefore(frag, anchor);

    // 옛 9그룹은 지우지 않고 감춘다 — 되돌리기와, 혹시 남은 참조를 위해.
    olds.forEach(function (g) { g.style.display = 'none'; g.setAttribute('data-ia6-legacy', '1'); });
    return true;
  }

  // ── 클릭 위임 ────────────────────────────────────────────────────────────
  //   사이드바 한 곳에서만 듣는다. 항목 노드가 나중에 다시 그려져도 계속 동작한다.
  function itemByKey(key) {
    var found = null;
    GROUPS.forEach(function (g) {
      g.items.forEach(function (it) { if (g.key + ':' + it.ko === key) found = it; });
    });
    return found;
  }

  function select(key) {
    var it = itemByKey(key);
    if (!it) return false;
    if (it.href) { location.href = it.href; return true; }
    showOnly(it, key);
    try { localStorage.setItem(LS_KEY, key); } catch (e) { /* 무시 */ }
    var bar = document.getElementById('ph85-sidebar');
    if (bar) {
      bar.querySelectorAll('.ph85-sub.ia6-on').forEach(function (x) { x.classList.remove('ia6-on'); });
      var el = bar.querySelector('[data-ia6-item="' + key + '"]');
      if (el) el.classList.add('ia6-on');
    }
    return true;
  }

  /* 🔴🔴 (2026-08-08) 「눌러도 아무 데도 안 간다」 —
     사이드바(#ph85-sidebar)에 리스너를 달면 **영원히 발화하지 않는다.**
     `adm-s11.js`(ph97)가 **window 캡처**에서 `.ph85-sub`·`.ph85-head` 를 잡고
     `e.stopPropagation()` 을 부른다(그 파일 주석: «어떤 stopPropagation 도 막을 수 없음»).
     캡처는 window → … → 사이드바 순서라, 거기서 끊기면 이벤트가 사이드바까지 **내려오지 않는다.**
     → 우리도 **window 캡처**로 올라간다. ph97 은 `stopImmediatePropagation` 이 아니라
       `stopPropagation` 이므로, **같은 노드·같은 단계의 다른 리스너는 그대로 실행된다.**
       (등록 순서: adm-s11 이 문서상 위 → 먼저 실행. 우리는 그 다음에 실행된다.)

     ⚠️ 아코디언(그룹 헤더 펼치기)은 **ph97 에게 맡긴다.** 둘 다 토글하면 서로 상쇄돼
        (ph97 이 열고 → 우리가 «이미 열림» 으로 보고 닫는다) 그룹이 영영 안 열린다.
        우리가 헤더에서 처리할 것은 「전체 보기」 하나뿐이다.
     ⚠️ 여기서 stopPropagation 하지 않는다 — 더 아래 리스너를 우리가 굶기지 않기 위해서다. */
  function wireDelegate(bar) {
    if (window.__ia6Deleg) return;
    window.__ia6Deleg = true;
    window.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var sub = t.closest('[data-ia6-item]');
      if (sub) {
        select(sub.getAttribute('data-ia6-item'));
        var sb = document.getElementById('ph85-sidebar');
        if (sb && window.matchMedia('(max-width: 1023px)').matches) sb.classList.remove('open');
        return;
      }
      var head = t.closest('[data-ia6-head]');
      if (head && head.getAttribute('data-ia6-head') === '__all') {
        showAll();
        try { localStorage.removeItem(LS_KEY); } catch (er) { /* 무시 */ }
        document.querySelectorAll('#ph85-sidebar .ph85-sub.ia6-on')
          .forEach(function (x) { x.classList.remove('ia6-on'); });
      }
      // 그 밖의 그룹 헤더 = 아코디언 → ph97 이 처리한다. 여기서 손대면 상쇄된다.
    }, true);   // ← 반드시 캡처. 버블로 두면 ph97 의 stopPropagation 에 막힌다.
  }

  // ── 검색을 쓰면 필터를 푼다 ──────────────────────────────────────────────
  //   검색 결과가 «감춰진 카드» 를 가리키면 눌러도 아무 일이 없는 것처럼 보인다.
  function wireSearch() {
    var s = document.getElementById('ph85-search');
    if (!s || s.__ia6) return;
    s.__ia6 = true;
    s.addEventListener('input', function () {
      if (s.value.trim()) showAll();
    });
  }

  function css() {
    if (document.getElementById('ia6-css')) return;
    var st = document.createElement('style');
    st.id = 'ia6-css';
    // hover 강조는 «색만» — 크기·위치를 움직이지 않는다(과거에 «정신없다»고 제거된 규칙).
    // ⚠️ 선택자를 일부러 세게 쓴다.
    //    admin-inline-c.css 에 `details.menu-card{...!important}` 류가 있어서
    //    `.ia6-hide{display:none!important}` 만으로는 **특이도에서 진다**(실측: 클래스는 붙었는데
    //    computed display 가 block 이었다). id 를 앞에 붙여 확실히 이기게 한다.
    st.textContent =
      '#legacy-cards .' + HIDE + ',' +
      '#legacy-cards details.' + HIDE + ',' +
      '#admin-main-scale .' + HIDE + ',' +
      '.' + HIDE + '{display:none !important}' +
      // 옛 9그룹을 인라인 style 로 감추면 admin.html 의 검색 핸들러가
      // g.style.display='' 로 되돌려 놓는다(실측으로 잡힘). 그래서 CSS 로 못박는다.
      '#ph85-sidebar .ph85-group[data-ia6-legacy]{display:none !important}' +
      '#ph85-sidebar .ph85-sub.ia6-on{background:rgba(251,191,36,.18);color:#fde68a;font-weight:800}';
    document.head.appendChild(st);
  }

  function init() {
    var bar = document.getElementById('ph85-sidebar');
    if (!bar || bar.__ia6) return;
    if (!document.getElementById('legacy-cards')) return;   // 본문이 아직이면 다음 기회에
    if (!build(bar)) return;
    bar.__ia6 = true;
    css();
    collect();
    wireDelegate(bar);
    wireSearch();

    // 마지막으로 보던 항목으로 복귀. 처음이면 「오늘」의 첫 항목.
    var want = null;
    try { want = localStorage.getItem(LS_KEY); } catch (e) { /* 무시 */ }
    var picked = null, pickedKey = null;
    if (want) {
      GROUPS.forEach(function (g) {
        g.items.forEach(function (it) {
          if (g.key + ':' + it.ko === want) { picked = it; pickedKey = want; }
        });
      });
    }
    if (!picked) { picked = GROUPS[0].items[0]; pickedKey = GROUPS[0].key + ':' + picked.ko; }
    showOnly(picked, pickedKey);
    var el = bar.querySelector('[data-ia6-item="' + pickedKey + '"]');
    if (el) el.classList.add('ia6-on');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // 본문·역할 적용이 늦게 끝나는 경우가 있어 한 번 더 시도한다(중복 실행은 __ia6 로 막힘).
  setTimeout(init, 900);

  // 다른 코드가 필요할 때 쓰도록 최소한만 노출
  window.mangoiIA6 = { showAll: showAll, select: select, groups: GROUPS };
})();
