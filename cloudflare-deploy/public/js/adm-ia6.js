// ═══════════════════════════════════════════════════════════════════════════
// adm-ia6.js — 관리자 메뉴를 «6그룹 38항목» 으로 (2026-08-08)
//
//   왜 —
//     사이드바가 9그룹 87항목이었다. 「강사 통합」 혼자 17개다.
//     직원이 기능을 못 찾는 이유는 기능이 없어서가 아니라 87개 중에서 못 찾아서였다.
//     그리고 87개를 다 세운 채로 카드 88개를 한 화면에 전부 그리고 있었다(3.63MB).
//     즉 «찾기 힘들다» 와 «느리다» 는 같은 원인의 두 얼굴이라 같이 고친다.
//
//   무엇을 하나 —
//     ① 사이드바를 6그룹 38항목으로 다시 세운다. 옛 9그룹은 지우지 않고 감춰 둔다(되돌리기용).
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

  // ── 6그룹 38항목 ─────────────────────────────────────────────────────────
  //   기준은 «누가 언제 하는 일인가». 부서(회계·강사)와 시점(오늘)을 섞지 않았다.
  //   cards[0] 이 그 항목의 «대표 카드» — 누르면 이것부터 펼친다.
  var GROUPS = [
    {
      key: 'today', ko: '오늘', en: 'Today',
      ico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      items: [
        { ko: '오늘의 수업', en: "Today's classes", cards: ['card-active-rooms'] },
        { ko: '출결',       en: 'Attendance',      cards: ['card-attendance-status', 'card-auto-attendance', 'card-class-attendance'] },
        /* 🚷 (2026-08-13 수정요청 #05) 「담당자가 클릭 한 번으로」 가 요구사항이라 「출결」 안에
           끼워 넣지 않고 자기 항목을 준다. 출결 항목은 카드 3장을 한 화면에 펴 놓기 때문에,
           거기 넣으면 장기 결석생 표를 보려고 아래로 스크롤해야 한다(그게 이 카드의 요점이 아니다). */
        { ko: '장기 결석생', en: 'Long absent',     cards: ['card-long-absent'] },
        { ko: '수업 관찰',  en: 'Observe class',   cards: ['card-admin-ghost', 'card-admin-whisper'] },
        { ko: '연기·변경',  en: 'Reschedule',      cards: ['card-schedule-requests'] },
        { ko: '방 초대',    en: 'Room invites',    cards: ['card-room-invite'] },
        /* 🐞 (2026-08-13 수정요청 #04) 「문의·버그」 한 항목이 신규상담 카드와 버그 카드를
           **함께** 띄우고 있었다. 버그·문의를 보러 온 사람 화면 맨 위에 «신규상담 → 등록 전환»
           (대기자 명단·전환율·상담 목록)이 통째로 깔려서 «이 화면에 왜 이게 있나» 가 됐다.
           원래 admin.html 에서는 서로 다른 카드다(card-inquiry-mgmt / card-bug-reports).
           2026-08-08 IA 6그룹 개편 때 한 칸으로 묶으면서 붙은 것이라, 다시 떼어 놓는다.
           ⚠️ card-inquiry-mgmt 를 그냥 지우면 안 된다 — 새 사이드바에서 이 카드를 맡은
              항목이 여기 하나뿐이라, 지우면 신규상담 화면 자체가 메뉴에서 사라진다.
              «버그 화면에서만 빼고 다른 화면에서는 그대로» 이려면 항목을 둘로 쪼개야 한다.
           🎁 덤 — card-bug-reports 가 이제 자기 항목의 «대표 카드(cards[0])» 가 된다.
              wireRevealOnJump 가 data-card 로 항목을 찾으므로, 옛 사이드바·검색·허브에서
              버그 카드로 점프할 때 지금까지 showAll() 로 새던 것이 제 항목으로 간다. */
        { ko: '신규상담',    en: 'Inquiries',      cards: ['card-inquiry-mgmt'] },
        { ko: '버그·피드백', en: 'Bug reports',    cards: ['card-bug-reports'] },
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
        { ko: '학습 분석',   en: 'Learning analytics',cards: ['card-voice-stats', 'card-selfscore'] }
      ]
    },
    {
      key: 'money', ko: '정산·매출', en: 'Finance',
      ico: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
      items: [
        { ko: '회계',        en: 'Accounting',  cards: ['card-accounting-mgmt'] },
        { ko: '결제',        en: 'Payments',    cards: ['card-payments-b2b', 'card-payments-b2c', 'card-recurring-billing', 'card-auto-dunning'] },
        { ko: '포인트',      en: 'Points',      cards: ['card-points-mgmt'] },
        // 🏬 (2026-08-12 수정요청 #04) 「지사 정산」이 역할 무관하게 캐피타운 전용 페이지로
        //    직행하던 것을 고친다 — 캐피타운이 아닌 지사 관리자는 그 페이지의 게이트에서
        //    무조건 「접근 권한이 없습니다」를 봤다. 이제 기본은 권한 스코프가 이미 걸려 있는
        //    지사정산 카드(card-franchises · /api/admin/settlement/branch-summary)이고,
        //    캐피타운 계열 계정(role capitown/franchise · uid capi*)만 capiHref 로 보낸다.
        { ko: '지사 정산',   en: 'Settlement',  cards: ['card-franchises'], capiHref: '/admin/capitown-settlement.html' },
        // 🏢 조직 = 본사 › 지사 › 대리점(학원). 카드는 이제 card-franchises 하나뿐이다 —
        //    card-centers(대리점 목록)는 그 카드 «안의 하위항목» 으로 합쳤다(2026-08-09).
        //    (예전 «가맹점·센터» 는 두 단계가 한 칸씩 밀린 이름이었다)
        { ko: '조직 (지사·대리점)', en: 'Organization', cards: ['card-franchises'] }
      ]
    },
    {
      /* 🏷 (2026-08-15 사장님) 「경영·설정」 → 「시스템」. 2026-08-08 개편 전 이름으로 되돌린다 —
         「시스템 메뉴가 안 보인다」로 두 번 신고가 들어왔다. 사람들이 찾는 이름이 그것이다.
         ⚠️ 항목 키는 `ops:항목이름` 이라 **그룹 이름을 바꿔도 저장된 «마지막으로 보던 항목»은 안 깨진다**
            (키에 쓰이는 것은 key='ops' 이지 여기 ko 가 아니다). 항목 이름을 바꿀 때만 RENAMED 이사표가 필요하다. */
      key: 'ops', ko: '시스템', en: 'System',
      ico: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      items: [
        { ko: '경영 지표',   en: 'Dashboard',     cards: ['card-dashboard', 'card-kpi-dashboard', 'card-daily-charts', 'card-rankings', 'card-nps-monthly'] },
        { ko: '이탈·예측',   en: 'Retention',     cards: ['card-retention-risk', 'card-ai-forecast'] },
        { ko: '공지 발송',   en: 'Announcements', cards: ['card-webpush-mgmt', 'card-kakao-mgmt', 'card-poster-maker', 'card-popups-mgmt', 'card-notice-board'] },
        { ko: '자료실',      en: 'Library',       cards: ['card-lib-admin', 'card-lib-teacher', 'card-lib-branch', 'card-lib-agency', 'card-lib-student'] },
        { ko: '직원·권한',   en: 'Staff & roles', cards: ['card-permissions', 'card-cafe24-lists'] },
        { ko: '데이터·보관', en: 'Data',          cards: ['card-data-export', 'card-retention', 'card-gallery', 'card-classroom-test'] },
        /* 🗺 (2026-08-15) 「사이트 구조도」는 카드가 아니라 **다른 페이지**다(/admin/site-structure.html,
           같은 날 추가됨). 그런데 옛 사이드바의 「시스템」 그룹 안에만 들어 있었고, 그 그룹은
           ia6 가 통째로 감추고 있어서 **아무도 볼 수 없었다** — 「시스템이 안 보인다」 신고의
           실제 알맹이가 이것이었다. 새 사이드바에도 자리를 준다.
           ⚠️ cards 가 비어 있어도 된다 — select() 가 href 를 먼저 보고 그 페이지로 보낸다
              (지사 정산의 capiHref 와 같은 방식). 카드 필터는 아예 돌지 않는다. */
        /* 📱 휴대폰에서는 목차(허브)를 건너뛰고 지도로 바로 간다 — mobileHref.
           site-structure.html 자체도 좁은 화면이면 지도로 넘기지만, 여기서 먼저 갈라 두면
           그 «넘어가는 한 박자»(흰 화면 깜빡임 + 왕복 한 번)가 아예 없다. */
        { ko: '사이트 구조도', en: 'Site structure', cards: [],
          href: '/admin/site-structure.html', mobileHref: '/admin/site-structure-map.html' }
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

  /* ── 🔝 (2026-08-15 사장님) 「사이드바 메뉴를 눌러도 그 화면이 «정확히» 맨 위에 안 온다 —
        위에 경영지표(KPI) 카드가 그대로 남는다」 ────────────────────────────────────
     [원인] 여기서 감출 수 있는 것은 카드뿐이다. 대시보드 머리(hero·KPI 8타일·빠른메뉴)는
       카드가 아니라 그대로 남는다. 그런데 **머리를 감추는 것으로는 못 고친다** —
       위쪽 X px 을 감추면 카드 위치도 X 만큼 올라가지만 문서 높이도 X 만큼 줄어서
       (= 내려갈 수 있는 거리도 X 만큼 줄어서) 차이가 **그대로 남는다**.
       진짜 원인은 «문서가 짧아서 더 내려갈 수가 없는» 것이다. 카드 한 장만 남기면 문서가
       화면보다 조금 큰 정도라, scrollIntoView 를 세 번 불러도 브라우저가 갈 수 있는 끝까지만 간다.
       실측(1600×900 · zoom 1.3): 「오늘의 수업」 → 스크롤 끝(270px)까지 갔는데도 카드 top 380px.
                                 「방 초대」 430px · 「버그·피드백」 380px.
     [해결] 마지막 카드 아래에 «모자란 만큼만» 빈 자리를 둔다. 그러면 실제로 더 내려갈 수
       있어서 고른 카드가 화면 맨 위에 온다. 아무것도 감추지 않으므로 위로 올리면 KPI 는 그대로 있다.
     ⚠️ body{zoom} 때문에 «내가 적는 CSS px» 와 «화면 px» 이 다르다(1.3배, 게다가 폭에 따라 유동).
        배율을 읽어서 나누지 않는다 — 재고·늘리기를 두어 번 반복해 수렴시킨다(배율이 바뀌어도 안 깨짐).
     ⚠️ 한 화면(innerHeight)을 넘게는 절대 넣지 않는다. 끝없는 빈 화면이 생기면 그게 또 신고다.
     ⚠️ rAF 금지(숨은 탭에서 안 돈다) · smooth 금지 — 이 파일의 기존 규칙 그대로. */
  var TAIL_ID = 'ia6-tail';

  /* 🔻 여백은 **body 맨 끝**에 붙인다. #legacy-cards 안이 아니다 —
        카드가 전부 그 안에 있지 않다(card-payments-b2b·card-timetable·card-lesson-log·
        card-homework 등은 «밖»에 있다). 컨테이너 안에 붙이면 그 뒤의 카드들에게는
        여백이 «위»가 돼 아무 소용이 없다. 실측으로 밟은 함정이다(수업 일지 326px 남음). */
  function tailEl() {
    var t = document.getElementById(TAIL_ID);
    if (!t) {
      if (!document.body) return null;
      t = document.createElement('div');
      t.id = TAIL_ID;
      t.setAttribute('aria-hidden', 'true');
      t.style.cssText = 'height:0;pointer-events:none';
      document.body.appendChild(t);
    }
    return t;
  }

  /** 지금 보이는 카드 중 가장 아래 것이 화면 맨 위까지 올라올 수 있도록 꼬리 여백을 맞춘다. */
  function fitTail() {
    var t = tailEl();
    if (!t) return;
    t.style.height = '0px';
    var cards = document.querySelectorAll('details.menu-card'), i, lowest = null, lowTop = -1e9;
    for (i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (!c.offsetWidth && !c.offsetHeight) continue;          // 감춰진 것은 세지 않는다
      var top = c.getBoundingClientRect().top;
      if (top > lowTop) { lowTop = top; lowest = c; }
    }
    if (!lowest) return;
    /* 화면·스크롤·getBoundingClientRect 는 모두 «화면 px» 로 같은 자다(zoom 이 이미 반영됨).
       모자란 양 = (그 카드의 문서상 위치 + 화면 하나) − 문서 전체 높이 */
    var css = 0, ratio = 1;
    for (i = 0; i < 4; i++) {
      var docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      var gap = lowest.getBoundingClientRect().top + (window.pageYOffset || 0) + window.innerHeight - docH;
      if (gap > window.innerHeight) gap = window.innerHeight;   // 한 화면 넘게는 안 넣는다
      if (Math.abs(gap) <= 2 || (gap < 0 && css <= 0)) break;
      var shown = t.getBoundingClientRect().height;             // 지금 css px 이 화면에서 몇 px 인가
      if (css > 0 && shown > 0) ratio = css / shown;            // 배율의 역수 — 재서 알아낸다
      css = Math.max(0, css + gap * ratio);
      t.style.height = Math.ceil(css) + 'px';
    }
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
      alignTop(lead);
    } else {
      try { window.scrollTo(0, 0); } catch (e) { /* 무시 */ }
    }
  }

  /* ── 🔝 «자리가 잡힐 때까지» 잠깐 따라가며 맨 위에 맞춘다 ──────────────────────────
     한 번·두 번 보정으로는 부족했다(실측). 화면을 바꾼 뒤 1초 안에 이런 일들이 더 일어난다 —
       · content-visibility:auto 로 «180px 자리표시자» 였던 카드가 진짜 높이로 펴진다
       · 표·차트가 늦게 그려져 위쪽 형제 카드의 높이가 바뀐다(실측: 출결 화면에서 816px 밀림)
       · 본문 폭이 바뀌어 admin.html 의 자동 body{zoom} 이 배율을 다시 잡는다(1.229 ↔ 1.3)
     그래서 «지금 맨 위인가» 만 싸게 확인하면서(rect 한 번) 어긋났을 때만 다시 맞춘다.
     ⚠️ 사람이 스크롤을 시작하면 **즉시 손을 뗀다.** 안 그러면 「읽고 있는데 화면이 되돌아간다」가 된다.
     ⚠️ 시한(1.8초)이 반드시 있어야 한다. 시한 없이 붙잡으면 영영 스크롤을 못 하게 된다.
     ⚠️ rAF 금지 — 숨은 탭에서는 아예 안 돈다(그러면 «눌러도 안 움직인다»). 타이머는 돈다. */
  var alignRelease = null;   // 진행 중인 따라가기는 하나뿐 — 메뉴를 연달아 눌러도 겹치지 않는다
  var alignLead = null;      // 지금 맞추는 중인 카드 (다른 곳으로 가는 스크롤을 구분하려고)
  var alignSelf = false;     // 우리가 스스로 부른 scrollIntoView 인가

  function alignTop(lead) {
    if (alignRelease) alignRelease();
    alignLead = lead;
    var toLead = function () {
      /* 🔝 먼저 «내려갈 자리» 를 만들고 나서 올린다. 순서를 바꾸면 자리가 없어서 못 올라간다. */
      try { fitTail(); } catch (e) { /* 무시 */ }
      alignSelf = true;
      try { lead.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) { /* 무시 */ }
      alignSelf = false;
    };
    var until = Date.now() + 1800, timer = 0;
    var release = function () {
      if (timer) clearTimeout(timer);
      timer = 0;
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchstart', release);
      window.removeEventListener('keydown', release);
      if (alignRelease === release) { alignRelease = null; alignLead = null; }
    };
    var toLeadAgain = function () {
      timer = 0;
      // 싼 확인 먼저 — 이미 맨 위면 1.3MB DOM 을 다시 재지 않는다.
      var off = 0;
      try { off = lead.getBoundingClientRect().top; } catch (e) { /* 무시 */ }
      if (off < -2 || off > 2) toLead();
      if (Date.now() < until) timer = setTimeout(toLeadAgain, 140);
      else release();
    };
    toLead();                          // 누른 즉시 한 번
    timer = setTimeout(toLeadAgain, 60);
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchstart', release, { passive: true });
    window.addEventListener('keydown', release);
    alignRelease = release;
  }

  /* ── 🗺 메뉴 지도 열기 — «읽어 주고 → 그다음 연다» ────────────────────────────────
     (2026-08-15 사장님) ① 「메뉴 지도 아무리 눌러도 안 보여, 조직도와 페이지가」
                        ② 「메뉴 지도에 무엇이 들어 있는지 음성이 안 나와. 이것도 추가해줘」
     ①은 옛 동작이 «감춘 카드를 다시 보이게» 하는 것뿐이라 화면에 아무 변화가 없어서였다.
       이제 진짜 지도 문서를 연다(/admin/site-structure-map.html — 사람 다섯 갈래로 그린 그림).
     ②는 순서가 중요하다 — 말을 시작해 놓고 페이지를 옮기면 그 순간 소리가 끊긴다.
       그래서 **다 읽은 뒤에** 옮긴다(adm-r15 의 admVoiceSay 가 다 읽으면 알려 준다).
     ⚠️ 음성이 꺼져 있거나 소리가 안 나와도 **반드시 지도로 간다**. 안 그러면 또 «눌러도 안 열린다» 다.
     ⚠️ 「시스템 ▸ 사이트 구조도」는 허브(지도 1장 + 구성표 3장)로 간다. 여기는 지도로 바로 간다. */
  var MAP_HREF = '/admin/site-structure-map.html';

  function menuMapSpeech() {
    return isEn()
      ? 'Menu map. A picture of every Mangoi screen, grouped by who uses it: guests, students, parents, teachers and operators. Opening the map now.'
      : '메뉴 지도입니다. 망고아이의 모든 화면을 쓰는 사람에 따라 손님, 학생, 부모님, 선생님, 운영자 다섯 갈래로 나눠 그린 그림입니다. 지금 지도를 엽니다.';
  }

  function openMenuMap() {
    var went = false;
    var go = function () {
      if (went) return; went = true;
      try { location.href = MAP_HREF; } catch (e) { /* 무시 */ }
    };
    var speaking = false;
    try { speaking = !!(window.admVoiceSay && window.admVoiceSay(menuMapSpeech(), go)); }
    catch (e) { speaking = false; }
    if (!speaking) go();          // 음성이 꺼져 있으면 곧바로 연다
  }

  function showAll() {
    if (!managed) collect();
    managed.forEach(function (el) { el.classList.remove(HIDE); });
    // 전체 보기에서는 카드가 다 있으니 꼬리 여백이 필요 없다 — 빈 화면이 남지 않게 되돌린다.
    try { var t = tailEl(); if (t) t.style.height = '0px'; } catch (e) { /* 무시 */ }
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

    /* 🗺 메뉴 지도 — 「망고아이 사이트 지도」 문서로 간다(/admin/site-structure-map.html).
       [옛 동작] 원래 이 자리는 「전체 보기」였고, 하는 일은 감춰 둔 카드를 전부 다시 보이게 하는
         것뿐이었다. 그런데 그건 **화면에 아무 변화가 없다** — 지금 보고 있는 자리는 그대로고
         카드는 화면 «아래»에 늘어날 뿐이라, 누른 사람 눈에는 아무 일도 안 일어난다.
         2026-08-15 사장님: 「메뉴 지도 아무리 눌러도 안 보여, 조직도와 페이지가」 — 그 말 그대로다.
       [지금] 실제로 «지도»를 연다. 같은 날 만들어진 그림 문서가 이미 있다(사람 5덩어리 · 화면 93개).
       ⚠️ 카드 감춤을 푸는 기능(showAll)은 남아 있다 — 사이드바 검색창에 뭐든 입력하면 자동으로 풀린다
          (wireSearch). 눌러도 티가 안 나는 버튼으로 사이드바 한 칸을 쓰지 않는 것뿐이다.
       ⚠️ 「시스템 ▸ 사이트 구조도」는 허브(지도 1장 + 구성표 3장)로 간다. 여기는 «지도»로 바로 간다 —
          이름이 「메뉴 지도」이므로 한 번에 지도가 나와야 한다. */
    var all = document.createElement('div');
    all.className = 'ph85-group';
    all.setAttribute('data-ia6', 'all');
    /* ⚠️ 라벨에 이모지를 넣지 않는다 — 왼쪽에 SVG 아이콘을 따로 그리므로 «아이콘 두 개»로 보인다
          (2026-08-08 사장님 지적으로 ⚡자주 쓰는 기능에서 이미 걷어낸 규칙). 아이콘을 지도 모양으로 바꾼다. */
    all.innerHTML = '<div class="ph85-head" data-ia6-head="__all" style="opacity:.75"><div class="ph85-ico">' +
      svg('<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>' +
          '<line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>') + '</div>' +
      '<div class="ph85-title" data-ko="메뉴 지도" data-en="Menu map">메뉴 지도</div></div>';
    /* 🔝 (2026-08-16 사장님) 메뉴 지도를 사이드바 **맨 위** 로 올린다.
       [왜] 지도는 «어디 있는지 모를 때» 쓰는 물건이다. 맨 아래에 있으면 끝까지 스크롤한
         사람만 발견하는데, 그건 이미 사이드바를 다 아는 사람 — 정작 지도가 필요 없는 사람이다.
         다른 메뉴(오늘·학생·강사…)는 «내 일이 어느 칸인지 이미 알 때» 누르지만
         지도는 그걸 모를 때 누른다. 그래서 카테고리들과 같은 줄이 아니라 그 위가 맞다.
       [높이] 줄을 «추가» 하는 게 아니라 순서만 바꾼 것이라, 6그룹+지도가 첫 화면에 들어오는
         기존 계산(줄당 44px × 7 = 304px)이 그대로 유지된다.
       ⚠️ 카테고리처럼 보이면 안 된다 — 아래에 가는 구분선을 둬서 «여기부터 진짜 메뉴» 임을
          눈으로 구분해 준다. 머리 자체는 이미 opacity:.75 로 죽여 놨다. */
    var sep = document.createElement('div');
    sep.className = 'ia6-sep';
    frag.insertBefore(sep, frag.firstChild);
    frag.insertBefore(all, frag.firstChild);

    anchor.parentNode.insertBefore(frag, anchor);

    // 옛 9그룹은 지우지 않고 감춘다 — 되돌리기와, 혹시 남은 참조를 위해.
    olds.forEach(function (g) { g.style.display = 'none'; g.setAttribute('data-ia6-legacy', '1'); });
    liftGroupsUp(bar);
    return true;
  }

  /* ── 📐 (2026-08-15 사장님) 「사이드바에서 시스템 메뉴가 안 보인다」 ──────────────
     [원인] 메뉴 6그룹 위에 «메뉴가 아닌 것»이 잔뜩 쌓여 있었다. 실측(1919×740 · zoom 1.3,
       CSS px 환산): 접기 30 + 검색 72 + 음성 안내 37 + AI 운영비서 52 + 사용법 안내 58 +
       ⚡자주 쓰는 기능 387 = 636px. 사이드바에서 실제로 보이는 높이는 569px 이고 바닥에
       계정 도크(128px)가 늘 붙어 있어 «첫 화면»은 441px 뿐이다. 그래서 6그룹은 처음에
       **한 줄도 안 보였고**, 아래 3그룹(수업·콘텐츠·정산·매출·시스템)은 더더욱 못 봤다.
       옛 「시스템」은 2026-08-08 개편에서 「경영·설정」으로 이름이 바뀐 채 그 맨 아래에 있었다(이름은 08-15 에 되돌림).
     [해결] 메뉴를 맨 위로 올린다 — 검색 바로 밑에 6그룹. 접기 30 + 검색 72 + 6그룹 332 = 434px
       로 첫 화면(441px)에 **여섯 그룹이 다 들어온다**(실측으로 맞춘 값).
     ⚠️ 아무것도 지우지 않는다. 음성 안내·AI 운영비서·사용법 안내·⚡자주 쓰는 기능은
        그대로 두고 메뉴 «아래»로 옮길 뿐이다(있던 것이 없어지면 그게 또 신고가 된다).
     ⚠️ 순서만 바꾼다. 각 요소의 id·class·리스너를 건드리지 않는다 — 그것들에 걸린
        다른 스크립트(ph161 자주쓰는기능·ph160 레일·음성안내)가 그대로 동작해야 한다. */
  function liftGroupsUp(bar) {
    try {
      var firstGroup = bar.querySelector('.ph85-group[data-ia6]');
      if (!firstGroup) return;
      ['ph85-voice-toggle', 'ph85-ai-asst', 'ph85-howto', 'ph161-quick'].forEach(function (id) {
        var el = document.getElementById(id);
        // 메뉴보다 «위»에 있는 것만 내린다. 이미 아래면 그대로 둔다(다시 부를 때 순서가 흔들리지 않게).
        if (!el || el.parentNode !== bar) return;
        if (!(firstGroup.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)) return;
        var back = document.getElementById('ph85-backtop');
        if (back && back.parentNode === bar) bar.insertBefore(el, back);
        else bar.appendChild(el);
      });
    } catch (e) { /* 순서 조정 실패가 메뉴 자체를 막지 않게 */ }
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

  // 🏢 캐피타운 계열 계정인가 — capiHref 분기 전용. 경영진(exec)은 여기 넣지 않는다:
  //    경영진은 전체 조직 카드(card-franchises)가 더 맞고, 캐피타운 페이지는 별도 항목으로도 간다.
  function isCapiAccount() {
    try {
      var s = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}');
      var r = String(s.role || '').toLowerCase(), u = String(s.uid || '').toLowerCase();
      return r === 'capitown' || r === 'franchise' || u === 'capitown' || u.indexOf('capi') === 0;
    } catch (e) { return false; }
  }

  // 📱 휴대폰·좁은 창인가 — mobileHref 분기 전용. site-structure.html 의 자체 넘김과 같은 기준(820px).
  function isNarrow() {
    try { return !!(window.matchMedia && window.matchMedia('(max-width:820px)').matches); }
    catch (e) { return false; }
  }

  function select(key) {
    var it = itemByKey(key);
    if (!it) return false;
    if (it.capiHref && isCapiAccount()) { location.href = it.capiHref; return true; }
    /* 📱 좁은 화면 전용 목적지가 있으면 그쪽으로. 폭으로만 판정한다 —
       기기 종류(userAgent)가 아니라 «지금 화면이 좁은가» 가 실제 문제이기 때문이다. */
    if (it.mobileHref && isNarrow()) { location.href = it.mobileHref; return true; }
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
        openMenuMap();
      }
      // 그 밖의 그룹 헤더 = 아코디언 → ph97 이 처리한다. 여기서 손대면 상쇄된다.
    }, true);   // ← 반드시 캡처. 버블로 두면 ph97 의 stopPropagation 에 막힌다.
  }

  /* ── 🧷 그룹을 펼치면 «계정 도크» 밑에 깔리지 않게 스크롤한다 ─────────────────
     [무슨 일이 있었나] 2026-08-15 상단바를 없애고 🩺 진단·🌐 EN·계정 버튼을
       사이드바 바닥 도크(#ph162-dock)로 내렸다. 그 도크는 position:sticky·z-index:3 라
       스크롤과 무관하게 바닥 167px 를 늘 덮고 있다.
       그래서 그룹을 펼쳤을 때 **아래쪽 항목 서너 개가 도크 밑에 들어가 눌리지 않았다.**
       보이기는 하는데 클릭이 도크로 먹히니, 쓰는 사람에게는 «눌러도 아무 일이 없다» 였다.
       실측(1440×900, [시스템] 그룹): 직원·권한 · 데이터·보관 · 사이트 구조도 세 개가 먹통.
       조금만 스크롤을 내리면 멀쩡히 눌렸다 — 즉 링크가 아니라 «놓인 자리» 문제였다.

     [고치는 법] 펼친 그룹의 마지막 항목이 도크 윗변보다 아래면, 그만큼 사이드바를 내린다.
       도크를 건드리지 않는다(그 쪽은 다른 작업의 영역이고, 높이도 계정·언어에 따라 변한다).
       도크가 없거나 sticky 가 아니면 아무 일도 하지 않는다.

     ⚠️ 그룹 헤더뿐 아니라 «항목을 누른 뒤» 에도 다시 재야 한다. 항목을 누르면 카드가 바뀌며
        사이드바 높이·스크롤이 달라져, 방금 확보한 여유가 도로 사라진다(실측: 직원·권한을
        누르고 나면 사이트 구조도가 다시 도크 밑으로 들어갔다).
     ⚠️ «덮였을 때만, 덮인 만큼만» 내린다. 그래서 이미 잘 보이는 상태에서는 아무 일도
        일어나지 않는다 — 보던 자리가 제멋대로 튀지 않는다. */
  function wireDockClearance(bar) {
    if (bar.__ia6Dock) return;
    bar.__ia6Dock = true;

    function clear(group) {
      if (!group || !group.classList.contains('open')) return;
      var dock = document.getElementById('ph162-dock');
      if (!dock) return;
      var subs = group.querySelector('.ph85-subs');
      if (!subs) return;
      var last = subs.lastElementChild;
      if (!last) return;

      var lastBottom = last.getBoundingClientRect().bottom;
      var dockTop = dock.getBoundingClientRect().top;
      var over = lastBottom - dockTop + 8;                 // 8px 는 숨 쉴 틈
      if (over <= 0) return;                               // 이미 도크 위 — 건드리지 않는다

      var max = bar.scrollHeight - bar.clientHeight;
      bar.scrollTop = Math.min(bar.scrollTop + over, max);
    }

    // 아코디언은 ph97 이 연다 → 클래스가 붙은 «뒤에» 재야 한다. 두 번 재는 것은
    // 펼침 애니메이션(transition)이 끝난 뒤 높이가 달라지기 때문이다.
    // ⚠️ 반드시 window 캡처. 사이드바에 버블로 걸면 ph97 의 stopPropagation 에 막혀
    //    아예 호출되지 않는다(wireDelegate 와 같은 이유 — 실측으로 확인함).
    window.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var hit = t.closest('#ph85-sidebar .ph85-head, #ph85-sidebar .ph85-sub');
      if (!hit) return;
      // 헤더면 그 그룹, 항목이면 그 항목이 속한 그룹 — 어느 쪽이든 «지금 열려 있는 그룹»
      var group = hit.closest('.ph85-group');
      setTimeout(function () { clear(group); }, 60);
      setTimeout(function () { clear(group); }, 380);
    }, true);
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
      '#ph85-sidebar .ph85-sub.ia6-on{background:rgba(251,191,36,.18);color:#fde68a;font-weight:800}' +
      /* 📐 (2026-08-15) 그룹 줄을 조금 낮춰 «6그룹 + 메뉴 지도»가 첫 화면에 다 들어오게 한다.
         실측(1919×740 · zoom 1.3 · CSS px): 메뉴가 시작되는 자리 134.6, 도크가 시작되는 자리 440.8
         → 쓸 수 있는 높이 306px. 줄 하나가 62px(머리 54 + 사이 6)이라 6개면 366px 로 넘쳤다.
         머리 위아래 여백 13→5, 사이 6→4 로 줄 하나를 44px 로 만들면 7줄이 304px 에 들어온다.
         ⚠️ 글자 크기(16px)는 그대로다. 줄만 낮춘다 — 「글씨가 작아졌다」가 되면 안 된다.
         ⚠️ 누르는 높이는 화면 기준 52px(40 × zoom 1.3)로 손가락·마우스 모두 충분하다. */
      '#ph85-sidebar .ph85-group[data-ia6]{margin-bottom:4px !important}' +
      '#ph85-sidebar .ph85-group[data-ia6] > .ph85-head{padding-top:5px !important;padding-bottom:5px !important}' +
      /* 🔝 메뉴 지도(맨 위)와 진짜 메뉴 사이의 경계. 지도가 «7번째 카테고리» 로
         보이지 않게 하는 장치다 — 선 하나로 «안내판 / 메뉴» 를 갈라 준다. */
      '#ph85-sidebar .ia6-sep{height:1px;margin:2px 4px 8px;background:rgba(148,163,184,.28)}';
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
    wireDockClearance(bar);

    // 마지막으로 보던 항목으로 복귀. 처음이면 「오늘」의 첫 항목.
    var want = null;
    try { want = localStorage.getItem(LS_KEY); } catch (e) { /* 무시 */ }
    /* 🔁 (2026-08-13) 항목 이름이 키다(`그룹키:한글이름`). 이름을 바꾸면 저장된 «마지막으로
       보던 항목» 이 미아가 되고, 아래에서 조용히 「오늘의 수업」으로 튄다. 쓰는 사람에게는
       어제 보던 화면이 아침에 딴 데 가 있는 것이라 «메뉴가 없어졌다» 로 신고가 들어온다.
       그래서 옛 키를 새 키로 옮겨 준다. 옛 「문의·버그」는 신규상담 카드를 먼저 펼치던
       항목이었으므로(cards[0] = card-inquiry-mgmt) 그쪽으로 잇는다. */
    var RENAMED = { 'today:문의·버그': 'today:신규상담' };
    if (want && RENAMED[want]) {
      want = RENAMED[want];
      try { localStorage.setItem(LS_KEY, want); } catch (e) { /* 무시 */ }
    }
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

  /* ── 🔴 (2026-08-09) 감춰진 카드로 «점프» 하는 것들을 되살린다 ─────────────────
     ia6 는 사이드바만 바꾼 게 아니라 **본문 카드를 감춘다**. 그래서 사이드바 «밖» 에서
     카드로 데려가던 것들이 전부 «눌러도 아무 일 없음» 이 된다 — 감춰진 요소에
     scrollIntoView 를 해도 화면은 안 움직이기 때문이다. 에러도 콘솔도 0.
     실제로 당한 것: ⚡자주 쓰는 기능(먼저 개별 수리됨) · 📅「#852 ✓」배지(calGotoDate) ·
     달력 칩(calGotoLT) · jumpToMenu · goCard · 해시 딥링크 · 카드 안 «…하러 가기» 버튼들.

     한 곳에서 막는다 — 카드로 가려는 scrollIntoView 를 보고, 그 카드가 우리 손에
     감춰져 있으면 **그 카드를 맡은 사이드바 항목을 대신 눌러 준다.**
     ⚠️ 감춤 class 를 직접 지우지 않는다. 그러면 필터가 반쯤 풀린 어중간한 화면이 된다.
        버튼을 누르면 ia6 자신의 로직(복원·펼치기·스크롤 3단 보정·선택 표시)이 그대로 돈다.
     ⚠️ 이 파일을 빼면(되돌리기) 래퍼도 같이 사라진다 — 원래 동작으로 완전히 되돌아간다. */
  function cardOf(el) {
    // 점프 대상이 카드 «안» 요소일 수도 있다(예: sm-all-schedules). 감춰진 카드까지 올라간다.
    var n = el;
    while (n && n !== document.body) {
      if (n.classList && n.classList.contains(HIDE) && /^card-/.test(n.id || '')) return n;
      n = n.parentElement;
    }
    return null;
  }
  function wireRevealOnJump() {
    if (window.__ia6Reveal) return;
    window.__ia6Reveal = true;
    var orig = Element.prototype.scrollIntoView;
    if (typeof orig !== 'function') return;
    var busy = false;                       // 되살리는 중의 재진입을 막는다
    Element.prototype.scrollIntoView = function () {
      if (!busy) {
        try {
          var card = cardOf(this);
          if (card) {
            busy = true;
            try {
              var btn = document.querySelector(
                '#ph85-sidebar [data-ia6-item][data-card="' + card.id + '"]');
              // 🔑 한글 항목명이 아니라 data-card 로 찾는다 — 이름이 바뀌어도 안 깨진다.
              if (btn) btn.click();
              else showAll();               // 어느 항목도 안 맡은 카드 → 필터를 푼다(갇히지 않게)
            } finally { busy = false; }
          }
        } catch (e) { /* 무시 — 점프는 어떤 경우에도 막지 않는다 */ }
      }
      /* 🔝 (2026-08-15) 우리가 «맨 위 맞추기»를 하는 동안 **다른 곳으로 가려는 스크롤**이
         들어오면 그쪽에 양보하고 손을 뗀다. 예: ⚡자주 쓰는 기능의 「오늘 수업 (바로 입장)」은
         카드 안의 하위 항목(sm-today-classes)까지 내려가야 하는데, 우리가 계속 카드 맨 위로
         되돌리면 그 이동이 매번 취소된다. 대표 카드 자신으로 오는 스크롤(jumpToMenu 등)은
         우리와 목적지가 같으므로 그대로 둔다. */
      try {
        if (!alignSelf && alignRelease && alignLead && this !== alignLead) alignRelease();
      } catch (e) { /* 무시 */ }
      return orig.apply(this, arguments);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // 본문·역할 적용이 늦게 끝나는 경우가 있어 한 번 더 시도한다(중복 실행은 __ia6 로 막힘).
  setTimeout(init, 900);
  wireRevealOnJump();   // init 성공 여부와 무관하게 건다(감춘 게 없으면 cardOf 가 늘 null)

  // 다른 코드가 필요할 때 쓰도록 최소한만 노출
  window.mangoiIA6 = { showAll: showAll, select: select, groups: GROUPS };
})();
