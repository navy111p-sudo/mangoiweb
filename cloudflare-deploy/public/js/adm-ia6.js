// ═══════════════════════════════════════════════════════════════════════════
// adm-ia6.js — 관리자 메뉴를 «6그룹 38항목» 으로 (2026-08-08, 지금은 40항목)
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
//      역할 숨김은 «.rbac-hide» class 로 걸린다(2026-08-18 변경 — 그 전에는 인라인
//      style.display 였는데, #legacy-cards 의 display:block !important 에 져서 PC 에서
//      아예 안 먹고 있었다. admin-inline-c.css 의 .rbac-hide 주석에 경위가 있다).
//      여기서 쓰는 class 는 «.ia6-hide» 로 이름이 달라 서로 안 겹치므로,
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
  /* 🔐 (2026-08-18) 사이드바 «항목» 을 역할 권한으로 감출 때 쓰는 class.
     ⛔ 위 HIDE(.ia6-hide)를 재사용하면 안 된다 — 그건 «카드» 를 감추는 showOnly 전용이고,
        showOnly 가 매번 managed 전체에서 그 class 를 벗겨 내므로(아래 showOnly 참고)
        같은 이름을 쓰면 항목 감춤이 항목 클릭 한 번에 통째로 풀린다. */
  var ROLE_HIDE = 'ia6-role-hide';

  // ── 6그룹 40항목 (2026-08-17 「수업 길이 변경」·「수강 운영」 +2) ─────────
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
        { ko: '장기 결석생', en: 'Long absent',     cards: ['card-long-absent'],
          tip: '🚨 연속 결석이 쌓인 학생 — 연락할 순서대로', tipEn: '🚨 Students with the longest absence streaks' },
        { ko: '수업 관찰',  en: 'Observe class',   cards: ['card-admin-ghost', 'card-admin-whisper'] },
        { ko: '연기·변경',  en: 'Reschedule',      cards: ['card-schedule-requests'],
          tip: '📅 수업 연기·시간 변경 요청 처리', tipEn: '📅 Handle postpone / time-change requests' },
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
        { ko: '시간표·근무', en: 'Schedule',        cards: ['card-timetable', 'card-calendar', 'card-auto-schedule', 'card-schedule-seed'] },
        /* 📅 수업 길이 변경 신청함 (2026-08-17 사장님) — 카드가 아니라 별도 페이지다.
           href 배선은 capiHref 와 같은 계약으로 이미 있었다(select() 참고). 여기가 첫 사용처다.
           ⚠️ href 항목은 select() 가 localStorage 에 «마지막으로 보던 항목» 으로 저장하지 않는다
              (저장 전에 location.href 로 빠진다). 저장되면 admin.html 을 열 때마다 여기로
              튕겨 나가므로, 그 순서를 바꾸지 말 것.
           자리 — 「시간표·근무」 바로 아래. 길이를 바꾸면 뒤 학생 시각이 밀리므로 시간표 일이다. */
        /* 🧭 (2026-08-19 사장님) 「메뉴 ▸ 자식 ▸ 손자」를 **모든 항목에서** 보이게 —
           카드가 아니라 딴 페이지로 가는 항목은 손자를 만들 재료가 화면에 없다(다른 문서다).
           그래서 그 페이지의 «구역 이름»만 여기 적고, 주소 뒤 #id 로 바로 그 구역까지 간다.
           ⚠️ id 는 그 파일에 진짜로 있어야 한다 — 손으로 적은 목록이라 어긋나면 조용히
              페이지 맨 위만 열린다. `sidebar_three_level_harness.mjs` 가 파일을 열어 확인한다.
           ⛔ 없는 구역 이름을 지어 넣지 말 것(2026-08-18 「데모 매핑」 사고와 같은 함정). */
        { ko: '수업 길이 변경', en: 'Class length', href: '/admin/duration-requests.html',
          tip: '📅 20·30·40분 변경 신청 — 매달 1일에 한꺼번에 반영',
          tipEn: '📅 Class-length requests — applied on the 1st of each month',
          secs: [
            { ko: '❓ 이 화면이 뭔가요',       en: '❓ What is this page', id: 'dr-guide' },
            { ko: '🔍 미리보기 · 이번 달 반영', en: '🔍 Preview & apply',  id: 'dr-apply' },
            { ko: '📋 대기 중인 신청',        en: '📋 Pending requests', id: 'dr-pending' }
          ] },
        { ko: '수업 일지',   en: 'Lesson log',      cards: ['card-lesson-log'] },
        { ko: '급여',        en: 'Payroll',         cards: ['card-payroll-auto', 'card-payroll'] },
        /* 📚 수강 운영 관리 (2026-08-17 사장님) — 이것도 메뉴에 없어 주소를 쳐야만 들어갔다.
           안에 «강사 배율»과 «긴 수업 하루 정원»이 있다. 강사별 돈·정원을 다루므로 급여 옆이다.
           별도 페이지라 href (위 「수업 길이 변경」과 같은 꼴).
           ⚠️ 이 화면은 /admin/ 아래가 아니라 사이트 루트에 있다. 그래서 isAdminPath 의
              «/admin/ 이면 무조건 인증» 규칙이 걸리지 않는다 — 대신 안의 자료는 전부
              checkAdminSession 을 거치는 API 로 받는다(빈 표만 보인다). 새 자료를 HTML 에
              직접 박지 말 것. */
        /* 📚 이 화면은 «탭 하나만 그리는» 구조라 id 가 아니라 탭 이름(data-t)이 주소가 된다.
           /enroll-ops.html#rates 처럼 열면 그 탭으로 시작한다(그 파일의 applyHashTab). */
        { ko: '수강 운영', en: 'Enrollment ops', href: '/enroll-ops.html',
          tip: '📚 강사 배율 · 긴 수업 정원 · 공휴일 · 환불 계산',
          tipEn: '📚 Teacher rates, long-class capacity, holidays, refunds',
          secs: [
            { ko: '🎌 공휴일',          en: '🎌 Holidays',        id: 'holidays' },
            { ko: '⏰ 종료 후보 명단',   en: '⏰ Ending soon',     id: 'ending' },
            { ko: '🧑‍🏫 강사 등급 배율', en: '🧑‍🏫 Teacher rates', id: 'rates' },
            { ko: '💸 환불 계산기',      en: '💸 Refund calc',     id: 'refund' },
            { ko: '🏖 강사 휴가 대체',   en: '🏖 Leave cover',     id: 'leave' },
            { ko: '🔔 자동 작업 점검',   en: '🔔 Auto jobs',       id: 'sweeps' }
          ] },
        { ko: '강사 평가',   en: 'Teacher review',  cards: ['card-class-ratings', 'card-praise-stats', 'card-supervisor'],
          tip: '⭐ 수업 직후 학생 별점 · 칭찬 통계 · 참관', tipEn: '⭐ Post-class ratings, praise stats, observation' },
        { ko: '품질·이력',   en: 'Quality & audit', cards: ['card-vc-quality', 'card-class-audit', 'card-report-forms', 'card-no-shows'],
          tip: '📶 화상 회선 품질 · 수업 변경 이력 · 노쇼', tipEn: '📶 Call quality, class change history, no-shows' }
      ]
    },
    {
      key: 'lesson', ko: '수업·콘텐츠', en: 'Lessons',
      ico: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
      items: [
        { ko: '평가서',      en: 'Evaluations',       cards: ['card-eval-mgmt', 'card-bulk-eval', 'card-ai-lesson-report', 'card-ai-eval-draft', 'card-monthly-report', 'card-comparison-report', 'card-monthly-ai-report', 'card-lesson-insight'] },
        { ko: '교재',        en: 'Textbooks',         cards: ['card-textbooks', 'card-video-dict'] },
        { ko: '학습 콘텐츠', en: 'Learning content',  cards: ['card-review-quiz', 'card-microlearn', 'card-mini-toeic', 'card-pronunciation', 'card-voice-diary'],
          tip: '🧩 복습퀴즈 · 마이크로러닝 · 발음교정 · 음성일기', tipEn: '🧩 Review quiz, micro-learning, pronunciation, voice diary' },
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
        /* 📊 (2026-08-18 사장님 요청) 「매출 대시보드」 를 사이드바에서 바로 —
           회계 카드 «안의» 접이식 줄(sub-acc-11)이라 회계를 열고 또 찾아야 했다.
           대표지사·지사·대리점(org 그룹)과 같은 방식: 카드 열기 + openSub 로 그 칸까지 펼친다. */
        /* 🗑 (2026-08-18 사장님 결정) 「매출 대시보드」 항목을 뺐다 — 「회계」와 이름만 다르고
           가리키는 카드가 같아서, 손자 19줄이 글자까지 똑같이 두 벌 나왔다.
           ⚠️ 기능은 안 없앴다. 「회계 ▸ 📊 매출 대시보드」 손자로 한 번에 간다(검색으로도 나온다).
              2026-08-18 «사이드바에서 바로» 요청(#283)은 그 손자 줄이 대신한다. */
        { ko: '결제',        en: 'Payments',    cards: ['card-payments-b2b', 'card-payments-b2c', 'card-recurring-billing', 'card-auto-dunning'] },
        { ko: '포인트',      en: 'Points',      cards: ['card-points-mgmt'] },
        /* 💸 환불 처리 (2026-08-25 사장님 「사이드바에도 넣어줘」) — 별도 페이지라 href 다
           (위 「수업 길이 변경」·「수강 운영」과 같은 꼴, 주소는 확장자까지 적는다 —
            확장자를 빼면 site_map_drift_harness 가 «죽은 링크» 로 FAIL 낸다).
           자리 — 「결제」 바로 아래. 결제의 반대 방향 동작이라 나란히 두는 것이 찾기 쉽다.
           ⚠️ 이 항목은 **역할 필터를 받지 않는다** — applyRoleFilter 가 `[data-cards]` 인
              항목만 보기 때문에 카드가 없는 href 항목은 강사·지사에게도 «보인다».
              기존 href 항목 셋(수업 길이 변경·수강 운영·영업 실적·평가)도 같은 상태다.
              들어가도 자료는 안 나온다 — 서버(api-pay-refund.ts refundGate)가 강사는
              forbidden_teacher, 지사·대리점은 forbidden_scope 로 막고 화면이 그 이유를 띄운다.
              «메뉴를 아예 감추는» 일을 하려면 href 항목용 역할 판정을 새로 만들어야 하고,
              그건 사이드바 공용 로직이라 별건이다(반경이 네 항목 전부).
           ⚠️ secs 의 id 는 refunds.html 에 진짜로 있어야 한다(하니스가 파일을 열어 대조).
           ⛔ 「② 확인」(#pv-card)은 secs 에 넣지 않았다 — 주문을 불러오기 전에는 `hide` 라
              그리로 보내면 «눌러도 아무 일도 안 일어난» 것으로 보인다. */
        { ko: '환불 처리', en: 'Refunds', href: '/admin/refunds.html',
          tip: '💸 결제를 되돌리고 그 사실을 장부에 남깁니다 (본사 전용)',
          tipEn: '💸 Cancel a payment and record it (HQ only)',
          secs: [
            { ko: '① 환불할 결제 고르기', en: '① Pick a payment', id: 'rf-pick' },
            { ko: '📒 환불 내역',          en: '📒 Refund history', id: 'rf-history' }
          ] },
        // 🏬 (2026-08-12 수정요청 #04) 「지사 정산」이 역할 무관하게 캐피타운 전용 페이지로
        //    직행하던 것을 고친다 — 캐피타운이 아닌 지사 관리자는 그 페이지의 게이트에서
        //    무조건 「접근 권한이 없습니다」를 봤다. 이제 기본은 권한 스코프가 이미 걸려 있는
        //    지사정산 카드(card-franchises · /api/admin/settlement/branch-summary)이고,
        //    캐피타운 계열 계정(role capitown/franchise · uid capi*)만 capiHref 로 보낸다.
        /* 🏢 (2026-08-18) 가리키는 곳을 고쳤다. 이름은 「정산」인데 실제로는 조직 명부 카드
           (card-franchises)를 열고 있어서, 대표지사·지사·대리점 항목과 손자가 똑같았다.
           진짜 정산 화면은 회계 카드 안 「🏢 지점/가맹점 정산 (한눈에)」(sub-acc-5) 다.
           ⚠️ 캐피타운 계열 계정은 그대로 전용 페이지로 보낸다(capiHref) — 그 분기는 건드리지 않았다. */
        { ko: '지사 정산',   en: 'Settlement',  cards: ['card-accounting-mgmt'], openSub: 'sub-acc-5', capiHref: '/admin/capitown-settlement.html',
          /* 대표 카드가 회계라, 두지 않으면 「회계」와 «똑같은 툴팁» 이 뜬다(무엇이 다른지 알 수 없다). */
          tip: '🏢 지점·가맹점 정산 — 수수료 비율 설정', tipEn: '🏢 Branch settlement — commission rates' },
        /* 🚗 (2026-08-21 사장님 「영업 메뉴가 어디 있냐」) — 사이드바 어디에도 없었다.
           링크를 admin.html 의 사용자 메뉴(#topUserPopup)에만 달아 뒀는데, 그 메뉴는
           admin-inline-c.css 가 `display:none !important` 로 통째로 감춘다
           (화면에 실제로 보이는 계정 메뉴는 adm-r21.js 가 따로 그리고, 거기엔 이 링크가 없다).
           메뉴 검색으로도 못 찾는다 — 색인(buildMenuIndex)이 `details.menu-card` 만 훑는데
           이 화면은 별도 페이지라 카드가 없다. 그래서 주소를 아는 사람만 들어갈 수 있었다.
           ⚠️ secs(손자)를 일부러 적지 않는다 — 이 화면은 카드를 **JS 로 그려서** 문서가
              로드된 시점에는 그 id 들이 없다. 주소 뒤 #id 로 보내면 에러 없이 «맨 위만»
              열린다(2026-08-18 「데모 매핑」과 같은 함정). 손자가 필요하면 그 화면에
              먼저 진짜 앵커를 만들고 나서 적을 것.
           ⚠️ 주소를 `/admin/sales-hr` (확장자 없이)로 쓰지 말 것 — 그 주소는 src/index.ts 의
              재작성으로만 열리는데 `site_map_drift_harness` 는 그걸 모르고 «죽은 링크» 로
              FAIL 낸다(그 하니스가 실제로 잡아 줬다). 이 파일의 다른 항목들과 같이 실제
              파일 경로를 쓴다(/admin/duration-requests.html · /enroll-ops.html). */
        { ko: '영업 실적·평가', en: 'Sales & review', href: '/admin/sales-hr.html',
          tip: '🚗 영업담당자 방문·계약·성과급·반기 평가',
          tipEn: '🚗 Sales rep visits, deals, incentives, half-year review',
          secs: [
            { ko: '📊 이번 달 요약',     en: '📊 This month',      id: 'sh-kpi' },
            { ko: '🗺 오늘 어디부터',    en: '🗺 Where to go',     id: 'sh-visits' },
            { ko: '⚠️ 위험한 학원',      en: '⚠️ At-risk academies', id: 'sh-risk' },
            { ko: '📝 영업일지',         en: '📝 Activity log',    id: 'sh-diary' },
            { ko: '🎯 자동 채점',        en: '🎯 Auto scoring',    id: 'sh-score' },
            { ko: '✅ 평가 확정',        en: '✅ Confirm review',  id: 'evalCard' },
            { ko: '🧭 성과가 낮을 때',   en: '🧭 If underperforming', id: 'sh-low' }
          ] }
        /* 🏢 (2026-08-18 사장님 수정요청 #04) 여기 있던 「조직 (지사·대리점)」 을 아래
           「운영자 (본사·지사·대리점)」 그룹으로 옮겼다 — 조직 «관리» 는 돈 계산이 아니라
           회사 구조를 세우는 일이라, 정산 옆에 있으면 «정산하러 왔다가 조직을 고치는» 자리가 된다.
           ⛔ 되돌리지 말 것. 「지사 정산」(캐피타운 분기 포함)은 정산이므로 여기 그대로 둔다. */
      ]
    },
    {
      /* 🏢 (2026-08-18 사장님 수정요청 #03·#04) 「운영자 (본사·지사·대리점)」 —
         회사 구조를 세우는 자리를 한 곳으로 모은다.
           · #04 — 「조직 (지사·대리점)」 이 「정산·매출」 밑에 있었다. 조직을 고치러 온 사람이
                   정산 메뉴를 뒤져야 했다. 그 항목을 이름 그대로 여기로 옮겼다.
           · #03 — 그 아래에 「대표지사」·「지사」·「대리점」 세 칸을 새로 낸다. 셋 다 같은 카드
                   (card-franchises) 안의 «하위 항목» 이라, openSub 로 그 칸을 바로 펼친다.
         ⚠️ 항목 키는 `org:항목이름` 이다. 이름을 바꿀 때는 아래 RENAMED 이사표에 한 줄 적을 것 —
            안 그러면 「어제 보던 화면이 아침에 딴 데 가 있다」 로 신고가 들어온다. */
      /* ✂️ (2026-08-19 사장님) 그룹 이름에서 「운영자」를 빼고 «본사·지사·대리점» 만 남긴다.
         다른 그룹은 2~6자(오늘·학생·강사·시스템)인데 여기만 15자라 유독 길었고,
         괄호 안은 결국 «안에 든 항목 이름» 을 미리 적어 둔 것이었다.
         ⚠️ 그룹 «키» 는 여전히 'org' 다 — 저장된 「마지막으로 보던 항목」(`org:지사` 등)은
            그룹 이름이 아니라 이 키를 쓰므로 이름을 바꿔도 안 깨진다(항목 이름을 바꿀 때만
            RENAMED 이사표가 필요하다). */
      key: 'org', ko: '본사·지사·대리점', en: 'HQ · Branches · Agencies',
      ico: '<path d="M3 21h18"/><path d="M5 21V7l7-4v18"/><path d="M12 9h7v12"/><path d="M9 9v0M9 13v0M9 17v0M16 13v0M16 17v0"/>',
      items: [
        /* 🗑 (2026-08-18 사장님 결정) 「조직 (지사·대리점)」 을 뺐다 — 아래 세 항목과 같은 카드를
           가리켜 손자 4줄이 네 번 반복됐다. 대신 그 카드의 네 번째 칸 「🏯 본사 관리」 를
           항목으로 세운다. 그렇게 하지 않으면 「조직」 을 없앤 순간 본사 관리로 갈 길이 사라진다. */
        /* 💬 (2026-08-19) 넷은 «같은 카드의 다른 칸» 이라, 카드 기준 툴팁(adm-s15)을 그대로 받으면
           「🏬 가맹점·지사·대리점 관리」 한 줄이 네 번 똑같이 뜬다 — 무엇이 다른지 알 수 없다.
           그래서 항목마다 «자기» 설명을 준다(아래 tip). 카드 툴팁보다 이것이 우선한다. */
        { ko: '대표지사', en: 'Master branch', cards: ['card-franchises'], openSub: 'card-master-branches',
          tip: '🏛️ 여러 지사를 묶는 권역 단위', tipEn: '🏛️ Regional group of several branches' },
        { ko: '지사',     en: 'Branch',        cards: ['card-franchises'], openSub: 'sub-branches',
          tip: '🏢 지사 명부 — 소속 대리점 찾기', tipEn: '🏢 Branch list — find agencies under a branch' },
        { ko: '대리점',   en: 'Agency',        cards: ['card-franchises'], openSub: 'card-centers',
          tip: '🏪 대리점(학원) 명부 — 소속 지사 · 결제유형', tipEn: '🏪 Agency list — branch and payment type' },
        { ko: '본사 관리', en: 'HQ',           cards: ['card-franchises'], openSub: 'card-hq-orgs',
          tip: '🏯 본사 법인 정보 (사업자번호 · 대표이사)', tipEn: '🏯 HQ corporate info' }
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
        { ko: '경영 지표',   en: 'Dashboard',     cards: ['card-dashboard', 'card-kpi-dashboard', 'card-daily-charts', 'card-rankings', 'card-nps-monthly'],
          tip: '📊 매출 · 학생 · 강사 핵심 지표 한눈에', tipEn: '📊 Revenue, students, teachers at a glance' },
        { ko: '이탈·예측',   en: 'Retention',     cards: ['card-retention-risk', 'card-ai-forecast'] },
        { ko: '공지 발송',   en: 'Announcements', cards: ['card-webpush-mgmt', 'card-kakao-mgmt', 'card-poster-maker', 'card-popups-mgmt', 'card-notice-board'] },
        { ko: '자료실',      en: 'Library',       cards: ['card-lib-admin', 'card-lib-teacher', 'card-lib-branch', 'card-lib-agency', 'card-lib-student'],
          tip: '📚 관리자 · 강사 · 지사 · 대리점 · 학생 자료실', tipEn: '📚 Libraries for admin, teachers, branches, agencies, students' },
        { ko: '직원·권한',   en: 'Staff & roles', cards: ['card-permissions', 'card-cafe24-lists'] },
        { ko: '데이터·보관', en: 'Data',          cards: ['card-data-export', 'card-retention', 'card-gallery', 'card-classroom-test'] },
        /* 🐞 (2026-08-24 사장님) 「오늘」에서 옮겨옴 — 버그·피드백은 «오늘 할 일» 이 아니라
           운영 전반에 걸쳐 쌓이는 신고함이라 시스템 쪽이 맞다는 지적. cards/카드 자체는
           그대로(card-bug-reports) — 어느 그룹 items 배열에 있느냐만 바뀐다. */
        { ko: '버그·피드백', en: 'Bug reports',    cards: ['card-bug-reports'],
          tip: '🐞 쓰다가 신고된 오류·건의', tipEn: '🐞 Reported bugs and suggestions' }
        /* 🗺 (2026-08-16 사장님) 여기 있던 「사이트 구조도」를 뺐다 —
           «어차피 메뉴판 맨 위 「메뉴 지도」와 같은 것». 실제로 같은 페이지로 갔다.
           같은 곳으로 가는 문을 둘 두면 «둘이 다른 건가?» 를 매번 생각하게 만든다.
           ⛔ 되살리지 말 것. 지도로 가는 길은 맨 위 「메뉴 지도」 하나면 충분하다
              (그 배선은 openMenuMap() — 읽어 주고 나서 연다). */
      ]
    }
  ];

  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
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
  /* ── 📱 (2026-08-16 사장님 요청 ①) 모바일의 «맨 위» 는 0 이 아니다 ────────────────
     왼쪽 맨 위에 «줄 3개»(#mgv2-burger) 가 떠 있다. 카드를 top:0 에 딱 붙이면
     그 버튼이 카드 제목을 덮는다(실측: 「실시간 수업 현황」 글자가 절반 가림).
     그래서 모바일에서만 버튼 아래까지를 «맨 위» 로 본다.
     ⚠️ 버튼 크기를 코드에 박지 않고 **실제로 재서** 쓴다 — 안전영역(노치) 때문에
        기기마다 다르고, CSS 를 고쳤을 때 이 값만 옛것으로 남는 일을 막는다.
     ⚠️ 데스크톱은 0 그대로다(버튼이 없다). 기존 동작을 하나도 바꾸지 않는다. */
  /* 🧭 (2026-08-19) 본문 맨 위 «경로 줄»(#mi-crumb) 이 sticky 로 맨 위를 덮는다.
     그 높이만큼 더 내려가지 않으면 카드 제목이 정확히 그 줄에 가린다 — 2026-08-04 옛
     상단바에서 이미 한 번 겪은 신고다(js/adm-crumb.js 머리말 참고).
     ⚠️ 그 줄은 카드 쪽 CSS 규칙(scroll-margin-top:var(--adm-jump-offset))으로도 보정하는데,
        여기서 쓰는 값은 **인라인 스타일**이라 그 규칙을 이긴다. 그래서 여기도 같이 더해야
        한다 — 한쪽만 고치면 «사이드바로 들어간 메뉴만 가려지는» 반쪽 상태가 된다.
     ⚠️ 높이는 adm-crumb.js 가 offsetHeight(=body{zoom:1.3} 곱해지기 «전» px)로 재서 준다.
        getBoundingClientRect 로 재면 데스크톱에서 1.3 배 부풀어 그만큼 더 내려간다. */
  function topGap() {
    var gap = 0;
    if (window.matchMedia('(max-width: 1023px)').matches) {
      var b = document.getElementById('mgv2-burger');
      if (b) {
        var r = b.getBoundingClientRect();
        if (r.height) gap = Math.round(r.bottom + 8);
      }
    }
    try {
      var c = window.__miCrumbGap ? window.__miCrumbGap() : 0;
      if (c > gap) gap = c;
    } catch (e) { /* 경로 줄이 없어도 기존 동작 그대로 */ }
    return gap;
  }

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
      /* + topGap() — 모바일은 카드를 «줄 3개 버튼 아래» 까지 올려야 하므로
         그만큼 더 내려갈 수 있어야 한다. 데스크톱은 0 이라 계산이 예전 그대로다. */
      var gap = lowest.getBoundingClientRect().top + (window.pageYOffset || 0) + window.innerHeight - docH + topGap();
      if (gap > window.innerHeight) gap = window.innerHeight;   // 한 화면 넘게는 안 넣는다
      if (Math.abs(gap) <= 2 || (gap < 0 && css <= 0)) break;
      var shown = t.getBoundingClientRect().height;             // 지금 css px 이 화면에서 몇 px 인가
      if (css > 0 && shown > 0) ratio = css / shown;            // 배율의 역수 — 재서 알아낸다
      css = Math.max(0, css + gap * ratio);
      t.style.height = Math.ceil(css) + 'px';
    }
  }

  /* ═══ 🔐 역할 필터 — 「눌러도 빈 화면」인 사이드바 항목을 감춘다 (2026-08-18) ═══════
     경위: 역할별 카드 숨김(_applyMenuVisibility)이 PC 에서 안 먹던 것을 .rbac-hide 로 고치자,
       이번엔 «카드는 제대로 감춰졌는데 그 카드를 가리키는 사이드바 항목은 그대로» 가 되었다.
       ia6 사이드바는 아래 GROUPS 라는 «정적 목록» 으로 그려서 역할을 전혀 안 보기 때문이다.
       예: 본사 매니저에게 「데이터·보관」은 card-retention(경영진 전용) 하나만 가리키는데,
           그 카드가 감춰져 눌러도 아무 일이 없었다.
     판정: 항목이 가리키는 카드가 «전부» 감춰졌을 때만 감춘다(하나라도 열려 있으면 남긴다).
     ⚠️ DOM 에 없는 카드 id 는 «판단 보류» 로 세지 않는다 — 오래된 id 가 목록에 남아 있을 수
        있는데, 그것 때문에 멀쩡한 항목이 사라지면 그게 더 큰 사고다. 하나도 못 찾으면 남긴다. */
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

  function cardRoleHidden(id) {
    var el = document.getElementById(id);
    if (!el) return null;                                  // 없는 카드 = 판단 보류
    // 판정 정본 = adm-core.js 의 window.mangoiCardHidden (역할 · 권한매트릭스 · 옛 인라인)
    return !!_cardHidden(el);
  }

  function applyRoleFilter() {
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return;
    var subs = bar.querySelectorAll('.ph85-group[data-ia6] .ph85-sub[data-cards]');
    for (var i = 0; i < subs.length; i++) {
      var d = subs[i];
      var ids = (d.getAttribute('data-cards') || '').split(' ');
      var known = 0, blocked = 0;
      for (var j = 0; j < ids.length; j++) {
        if (!ids[j]) continue;
        var r = cardRoleHidden(ids[j]);
        if (r === null) continue;
        known++; if (r) blocked++;
      }
      var hide = known > 0 && blocked === known;
      if (hide) d.classList.add(ROLE_HIDE); else d.classList.remove(ROLE_HIDE);
    }
    // 그룹 머리 — 그 안 항목이 하나도 안 남으면 그룹째 감춘다(빈 아코디언을 남기지 않는다)
    var grps = bar.querySelectorAll('.ph85-group[data-ia6]');
    for (var g = 0; g < grps.length; g++) {
      var all = grps[g].querySelectorAll('.ph85-sub');
      var alive = 0;
      for (var k = 0; k < all.length; k++) {
        if (!all[k].classList.contains(ROLE_HIDE)) alive++;
      }
      if (all.length > 0 && alive === 0) grps[g].classList.add(ROLE_HIDE);
      else grps[g].classList.remove(ROLE_HIDE);
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
    /* 🔝 먼저 «내려갈 자리» 를 만들고 나서 올린다. 순서를 바꾸면 자리가 없어서 못 올라간다.
       📱 모바일은 줄3개 버튼(#mgv2-burger) 아래에 세운다. scroll-margin-top 은
          scrollIntoView 가 그대로 지켜 주는 «표준» 속성이라, 검증된 scrollIntoView
          호출부를 손대지 않고도 도착 지점만 내릴 수 있다. 값은 매번 재서 넣는다
          (버튼 크기·노치가 기기마다 다르다). 데스크톱은 topGap()==0 이라 예전 그대로.
       ⚠️ 설명은 여기 «위» 에 적는다. fitTail() 과 scrollIntoView 사이에 길게 적으면
          admin_sidebar_ia6_click_harness 의 «여백부터 만든다» 검사(둘 사이 220자 이내)에
          걸린다 — 순서는 맞는데 주석 길이 때문에 실패한다(2026-08-16 실제로 밟음). */
    var toLead = function () {
      try { fitTail(); } catch (e) { /* 무시 */ }
      try { lead.style.scrollMarginTop = topGap() + 'px'; } catch (e) { /* 무시 */ }
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
      // 모바일의 «맨 위» 는 0 이 아니라 줄3개 버튼 아래(topGap)다.
      var off = 0, g = topGap();
      try { off = lead.getBoundingClientRect().top; } catch (e) { /* 무시 */ }
      if (off < g - 2 || off > g + 2) toLead();
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

  /* ── 🗺 메뉴 지도 열기 — «지도가 먼저, 안내 음성은 도착해서» ──────────────────────
     (2026-08-15 사장님) ① 「메뉴 지도 아무리 눌러도 안 보여, 조직도와 페이지가」
                        ② 「메뉴 지도에 무엇이 들어 있는지 음성이 안 나와. 이것도 추가해줘」
     ①은 옛 동작이 «감춘 카드를 다시 보이게» 하는 것뿐이라 화면에 아무 변화가 없어서였다.
       이제 진짜 지도 문서를 연다(/admin/site-structure-map.html — 사람 다섯 갈래로 그린 그림).
     ②를 넣을 때는 «다 읽고 나서 옮기는» 순서로 했다. 말을 시작해 놓고 페이지를 옮기면
       그 순간 소리가 끊기기 때문이다. 그런데 그 대가가 너무 컸다 —
     🐢 (2026-08-17 사장님) 「메뉴 지도 누르면 지도가 빨리 나오지 않아」 — 그 순서가 원인이었다.
       안내문이 95자라 구글 TTS 로 12~14초짜리 소리가 되고, 그러면 adm-r15 의 9초 안전장치
       (setTimeout(done, 9000))가 먼저 터진다. 즉 **누르면 정확히 9초 뒤에** 이동이 시작됐다.
       그 9초 동안 화면에는 스피너도 「여는 중」도 없으니, 쓰는 사람에게는 «먹통» 으로 보인다.
     [지금] 누르면 **곧바로** 지도로 간다. 안내 음성은 «도착한 지도 페이지가» 읽는다
       (site-structure-map.html 맨 아래 「🔊 도착해서 읽어 준다」 블록이 ?speak=1 을 보고 읽는다).
       지도는 즉시 뜨고, 음성은 페이지 이동에 끊기지 않는다 — 두 요청이 다 살아 있다.
     ⛔ 다시 admVoiceSay(…, go) 로 «읽고 나서 옮기는» 형태로 되돌리지 말 것. 그게 9초 먹통의 정체다.
        읽는 자리는 «떠나는 쪽» 이 아니라 «도착한 쪽» 이다.
     ⚠️ 음성이 꺼져 있거나 소리가 안 나와도 **반드시 지도로 간다**. 안 그러면 또 «눌러도 안 열린다» 다.
     ⚠️ 지도로 들어가는 문은 이제 여기 하나다(2026-08-16 「시스템 ▸ 사이트 구조도」 제거). */
  var MAP_HREF = '/admin/site-structure-map.html';

  /* 📍 지도에 «지금 여기» 를 찍어 주기 위해 지금 페이지 주소를 넘긴다.
     지도는 referrer 로도 알아내지만, referrer 는 브라우저 설정·앱 내장 브라우저에서
     빈 값이 되는 일이 있다. 확실한 쪽을 같이 보낸다.
     🔊 speak=1 = «사람이 「메뉴 지도」를 눌러서 온 이동» 이라는 표시. 지도 페이지는 이 표시가
        있을 때만 안내를 읽는다 — 링크·북마크로 그냥 열어 본 사람에게 갑자기 소리가 나면 안 된다. */
  function mapUrl() {
    try { return MAP_HREF + '?here=' + encodeURIComponent(location.pathname) + '&speak=1'; }
    catch (e) { return MAP_HREF + '?speak=1'; }
  }

  function openMenuMap() {
    /* 🔇 이 화면에서 진행 중인 안내가 있으면 끊는다. 어차피 이동하면 끊기지만,
          떠나는 순간 반 마디만 튀어나오는 소리를 남기지 않는다.
          (adm-r15 는 「메뉴 지도」 머리를 읽지 않으므로 보통은 아무것도 없다 — 앞서 누른
           다른 항목의 안내가 아직 남아 있는 경우를 위한 것이다.) */
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* 무시 */ }
    try { location.href = mapUrl(); } catch (e) { /* 무시 */ }
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

    /* 🧾 결재함 — 그룹들 «위» 에 고정으로 한 줄. (2026-08-20 사장님 지시)
       [왜 그룹 안에 안 넣었나] 그룹은 접혀 있는 것이 기본이라, 접힌 동안에는 대기 건수가
          보이지 않는다. 결재는 «누가 답을 기다리는» 일이라 접힌 채로 묻히면 안 된다.
       [왜 <a> 인가] 이 사이드바의 클릭은 window 캡처 핸들러 둘(adm-s11 ph97 · IA6 wireDelegate)이
          가로챈다. 다만 그들은 `.ph85-head` / `.ph85-sub` / `.ph86-action-btn` 만 본다.
          그래서 **다른 class 의 진짜 링크**로 두면 어느 쪽에도 안 걸리고, 리스너 없이
          브라우저가 그냥 이동시킨다 — 가로채기와 싸울 일이 없다.
       ⛔ class 를 .ph85-head/.ph85-sub 로 바꾸지 말 것(그 순간 삼켜진다).
       [배지] 숫자는 admin.html 의 결재 블록이 **같은 API 호출 한 번**으로 채운다.
          여기서 또 부르면 첫 화면에서 같은 요청이 두 번 나간다. */
    var appr = document.createElement('a');
    appr.id = 'ia6-appr';
    appr.href = '/work';
    appr.setAttribute('data-ko', '결재함');
    appr.setAttribute('data-en', 'Approvals');
    appr.innerHTML =
      '<div class="ph85-ico">' + svg('<path d="M3 13h4l2 3h6l2-3h4"/>' +
        '<path d="M5.5 5h13l2.5 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>') + '</div>' +
      '<div class="ia6-appr-t">' + (en ? 'Approvals' : '결재함') + '</div>' +
      '<span id="ia6-appr-n" class="ia6-appr-n"></span>';
    frag.appendChild(appr);

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
        // 🔐 역할 필터용 — 이 항목이 가리키는 카드 «전부». data-card 는 대표(첫) 장뿐이라
        //    「대표는 보이는데 나머지는 다 막힌」 경우를 판정할 수 없다.
        d.setAttribute('data-cards', (it.cards || []).join(' '));
        /* 🧭 (2026-08-18) 이 항목이 카드 «안의 한 칸» 을 바로 가리키면 그 id 를 실어 둔다.
           손자 메뉴(adm-r25.js)가 이걸 보고 «여기는 잎이다 → 손자를 만들지 않는다» 로 판단한다.
           안 실어 주면 손자 생성기가 카드 «전체» 를 읽어, 「대표지사·지사·대리점」 세 항목이
           전부 똑같은 4줄을 보여 준다(2026-08-18 실측 — 사장님 「중복」 지적의 원인). */
        if (it.openSub) d.setAttribute('data-ia6-sub', it.openSub);
        /* 🔗 (2026-08-19) 딴 페이지로 가는 항목의 «구역 목록» 을 DOM 에 실어 둔다.
           손자 생성기(adm-r25.js)는 이 화면의 카드만 읽을 수 있어서, 이걸 안 실어 주면
           그 항목만 손자가 없는 «2단짜리» 로 남는다. */
        if (it.href) d.setAttribute('data-ia6-href', it.href);
        /* 💬 (2026-08-19) 이 항목만의 설명. 툴팁을 붙이는 곳은 adm-s15.js 한 곳인데, 거기는
           «대표 카드» 기준이라 ① 카드를 여럿 맡거나 ② 같은 카드의 다른 칸을 가리키거나
           ③ 카드가 아예 없는(딴 페이지) 항목에서는 엉뚱하거나 빈 설명이 된다.
           그래서 항목이 자기 설명을 가지면 그것을 싣고, adm-s15 가 이 값을 우선한다. */
        if (it.tip) d.setAttribute('data-ia6-tip', it.tip);
        if (it.tipEn) d.setAttribute('data-ia6-tip-en', it.tipEn);
        if (it.href && it.secs && it.secs.length) {
          try { d.setAttribute('data-ia6-secs', JSON.stringify(it.secs)); } catch (e) { /* 무시 */ }
        }
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
       ⚠️ 지도로 들어가는 문은 이제 여기 하나다 — 「시스템 ▸ 사이트 구조도」는 뺐다(중복). 여기는 «지도»로 바로 간다 —
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

  /* 🏢 카드 «안의 하위 항목» 까지 펼친다 (openSub).
     조직 관리 카드 하나에 대표지사·지사·대리점 세 칸이 들어 있어서, 카드만 열어 주면
     쓰는 사람이 또 한 번 그 칸을 찾아 눌러야 한다. 형제 칸은 건드리지 않는다 —
     닫아 버리면 «방금 열어 둔 게 왜 닫히지» 가 된다.
     ⚠️ 여기서 scrollIntoView 를 «직접» 부르지 않는다. 바로 앞의 showOnly 가 alignTop 으로
        1.8초 동안 «대표 카드를 맨 위로» 를 계속 다시 맞추기 때문에, 여기서 스크롤하면
        곧바로 되돌려져 «눌렀는데 화면이 튄다» 가 된다.
        대신 **연 칸을 돌려주고, 부르는 쪽에서 alignTop 의 «목표» 를 그 칸으로 바꾼다** —
        같은 기계를 그대로 쓰므로 서로 싸우지 않는다(alignTop 은 진행 중인 따라가기를
        스스로 취소한다). 스크롤 코드를 새로 만들지 않는 것이 요점이다.

     🔴 (2026-08-19) 「눌러도 안 열린다」 — 원래는 카드만 맨 위로 올리고 말았다.
        전제가 «카드가 맨 위면 그 칸 제목줄도 첫 화면 안에 들어온다» 였는데,
        그건 조직 관리 카드처럼 **한 줄짜리 칸이 세 개뿐일 때만** 맞다.
        회계 카드는 칸이 12개고 「📊 매출 대시보드」는 그중 9번째다.
        실측(1440×900): 칸은 open=true 인데 제목줄이 top 1492px — 화면 아래로 592px
        벗어나 있었다. 쓰는 사람에게는 «열리지 않았다» 로 보인다(2026-08-19 사장님 제보).
        비교로 조직 그룹 「대리점」은 top 440px 이라 화면 안이었다 — 그래서 그동안 안 걸렸다. */
  function openSubSection(item) {
    if (!item || !item.openSub) return null;
    var el = document.getElementById(item.openSub);
    if (!el) return null;
    var n = el;
    while (n && n.tagName === 'DETAILS') { n.open = true; n = n.parentElement ? n.parentElement.closest('details') : null; }
    return el;
  }

  function select(key) {
    var it = itemByKey(key);
    if (!it) return false;
    if (it.capiHref && isCapiAccount()) { location.href = it.capiHref; return true; }
    /* 카드가 아니라 «다른 페이지» 로 가는 항목은 여기서 빠진다.
       지금은 쓰는 항목이 없다(「사이트 구조도」를 뺀 뒤로 — 2026-08-16). 배선은 남겨 둔다:
       capiHref 와 같은 계약이고, 나중에 문서 항목을 붙일 때 이 한 줄이면 된다.
       ⚠️ 지도로 보내는 항목을 다시 만든다면 mapUrl() 을 써서 ?here= 를 붙일 것 —
          그래야 지도가 «지금 여기» 를 찍을 수 있다. */
    if (it.href) { location.href = it.href; return true; }
    showOnly(it, key);
    /* 연 칸이 있으면 «그 칸» 을 맨 위로 — showOnly 가 방금 시작한 카드 따라가기를
       alignTop 이 스스로 취소하고 목표를 바꾼다(위 openSubSection 주석 참고). */
    var openedSub = openSubSection(it);
    if (openedSub) alignTop(openedSub);
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
      /* 🔴 (2026-08-18) ▸ 손자 메뉴 토글·손자 항목은 «그냥 지나가게» 둔다.
         이 핸들러는 항목 안의 «모든» 클릭을 「항목 선택」으로 처리하는데, ▸ 토글은
         그 항목의 자식이라 함께 잡혔다. 그래서 ▸ 를 눌러도 손자가 펴지는 대신
         카드 필터만 바뀌었다 — 쓰는 사람에게는 «손자 메뉴가 안 뜬다» 로 보인다.
         adm-s11.js(ph97)가 2026-08-06 에 똑같은 사고를 냈고 같은 예외로 고쳤다.
         ⛔ 지우지 말 것. 지우면 새 사이드바에서 3단계 메뉴를 여는 방법이 없어진다. */
      if (t.closest('#ph85-sidebar .ph125-toggle') || t.closest('#ph85-sidebar .ph125-gc')) return;
      var sub = t.closest('[data-ia6-item]');
      if (sub) {
        /* 📱 (2026-08-16 사장님 요청 ④) 모바일은 «닫고 나서» 고른다 — 순서가 핵심이다.
           [옛 코드] select() 를 먼저 부르고 그 다음에 sb.classList.remove('open') 이었다.
             ① 지우는 클래스가 틀렸다. 드로어를 여는 것은 사이드바의 'open' 이 아니라
                **body.mga-open** 이다(2026-06 mga 교체 때 이 줄이 안 따라왔다).
                → 항목을 눌러도 드로어가 화면을 그대로 덮고 있었다. adm-s11.js(ph97) 에도
                  똑같은 줄이 있었고 같은 날 함께 고쳤다. 여기가 그 두 번째 자리다.
             ② 순서도 틀렸다. 드로어가 열려 있는 동안 body 는 overflow:hidden 이라
                그 상태에서 select() 안의 scrollIntoView 는 **브라우저가 통째로 무시한다.**
                닫기를 먼저 해야 스크롤이 먹는다.
           실측(390×844): 「강사 ▸ 시간표·근무」 클릭 2.6초 뒤에도 드로어=열림,
                          고른 카드가 화면 위(-258px)로 벗어나 있었다. */
        /* 📱 (2026-08-19) «손자를 펴는 중» 이면 닫지 않는다 — adm-s11.js 와 같은 이유·같은 표시.
           adm-r25.js 가 우리보다 «먼저» 돌면서(문서상 위) 그 표시를 남긴다. */
        if (window.matchMedia('(max-width: 1023px)').matches && !(window.__ph125OpenedUntil > Date.now())) {
          var sb = document.getElementById('ph85-sidebar');
          if (sb) sb.classList.remove('open');
          try { if (typeof window.mgaClose === 'function') window.mgaClose(); } catch (err) { /* 무시 */ }
          document.body.classList.remove('mga-open');
        }
        /* 🔗 (2026-08-19) 딴 페이지로 가는 항목은 **한 번 더 눌러야** 간다.
           첫 누름은 손자(그 페이지의 구역들)를 펴는 누름이다 — 곧바로 이동하면
           손자가 화면에 나타날 새가 없어 「이 메뉴만 3단이 아니다」가 된다.
           표시는 adm-r25.js 가 남긴다(우리보다 먼저 돈다 — 문서상 위). 800ms 뒤 저절로 풀린다. */
        if (sub.getAttribute('data-ia6-secs') && window.__ph125OpenedEl === sub &&
            window.__ph125OpenedUntil > Date.now()) return;
        select(sub.getAttribute('data-ia6-item'));
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
      // 🔐 역할로 감춘 사이드바 항목·그룹 (applyRoleFilter). id 를 앞에 붙여 확실히 이기게 한다.
      '#ph85-sidebar .' + ROLE_HIDE + '{display:none !important}' +
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
    applyRoleFilter();   // 🔐 역할로 못 여는 항목은 그리자마자 감춘다(깜빡임 방지)
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
    var RENAMED = {
      'today:문의·버그': 'today:신규상담',
      // 🏢 (2026-08-18) 「정산·매출 ▸ 조직 (지사·대리점)」 → 「운영자 ▸ 조직 (지사·대리점)」
      'money:조직 (지사·대리점)': 'org:대표지사',
      // 🗑 (2026-08-18) 없앤 두 항목을 잇는다. 안 이으면 어제 보던 화면이 「오늘의 수업」으로 튄다.
      'org:조직 (지사·대리점)': 'org:대표지사',
      'money:매출 대시보드': 'money:회계',
      /* ✂️ (2026-08-19) 「수강 운영(배율·정원)」 → 「수강 운영」. 괄호 설명은 툴팁으로 옮겼다.
         이 줄이 없으면 그 메뉴를 마지막으로 보던 사람이 아침에 「오늘의 수업」으로 튄다. */
      'teacher:수강 운영(배율·정원)': 'teacher:수강 운영'
    };
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
    /* 🏠 (2026-08-19) 경로 줄의 «홈» 을 누르면 이 칸에 '__home' 표시가 남는다(js/adm-crumb.js).
       그 표시가 있으면 **아무 항목도 고르지 않는다** = 카드가 전부 보이는 대시보드.
       [왜] 이 줄이 없으면 홈을 눌러 대시보드를 봐도 **새로고침 한 번에 「오늘의 수업」으로
         돌아온다**(바로 아래 «처음이면 「오늘」의 첫 항목» 때문). 사장님 지적.
       ⚠️ 문자열 '__home' 은 adm-crumb.js 와 짝이다. 한쪽만 고치면 조용히 옛 동작으로 돌아간다.
       ⚠️ 항목 key 는 `그룹키:한글이름` 꼴이라 '__home' 과 절대 겹치지 않는다. */
    if (want === '__home') return;
    if (!picked) { picked = GROUPS[0].items[0]; pickedKey = GROUPS[0].key + ':' + picked.ko; }
    showOnly(picked, pickedKey);
    openSubSection(picked);
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
         우리와 목적지가 같으므로 그대로 둔다.

         🔴 (2026-08-19) «조상» 으로 오는 스크롤도 양보하면 안 된다 — 그게 「눌러도 안 열린다」의
            정체였다. openSub 항목은 카드 «안의 칸» 을 목적지로 삼는데, adm-s11(ph97)이 같은
            클릭에서 50ms 뒤 **그 칸이 든 카드** 를 따로 scrollIntoView 한다(smooth + rAF 로 두 번).
            카드는 우리 목적지가 아니므로 이 줄이 곧바로 손을 떼 버렸고, 그래서 칸은 open=true 인데
            화면은 카드 맨 위에 머물렀다(실측 1440×900: 칸 제목줄 top 1492px — 화면 밖 592px).
            조상으로 오는 스크롤은 «다른 곳» 이 아니라 **같은 목적지의 거친 판** 이다. 양보하지 않는다. */
      try {
        if (!alignSelf && alignRelease && alignLead &&
            this !== alignLead && !this.contains(alignLead)) alignRelease();
      } catch (e) { /* 무시 */ }
      return orig.apply(this, arguments);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // 본문·역할 적용이 늦게 끝나는 경우가 있어 한 번 더 시도한다(중복 실행은 __ia6 로 막힘).
  setTimeout(init, 900);

  /* 🔐 역할 필터를 다시 거는 시점 (2026-08-18)
     ① adm-core 가 역할을 적용한 직후 — 로그인·세션 갱신마다 온다.
        ⚠️ 순서가 정해져 있지 않다: 역할 적용이 사이드바 그리기보다 먼저일 수도, 나중일 수도 있다.
           그래서 «이벤트를 받았을 때» 와 «init 이 끝났을 때» 양쪽에서 건다(init 안에도 있음).
     ② 늦게 오는 경우 대비 — init 재시도와 같은 이유로 두 번 더 훑는다.
        ⛔ setInterval 로 계속 돌리지 않는다. 사이드바 스크롤이 끊긴 전례가 있다(위 ph85 주석). */
  document.addEventListener('mangoi:menu-visibility', function () {
    try { applyRoleFilter(); } catch (e) { /* 무시 — 사이드바를 못 그리게 만들지 않는다 */ }
  });
  setTimeout(function () { try { applyRoleFilter(); } catch (e) {} }, 1500);
  setTimeout(function () { try { applyRoleFilter(); } catch (e) {} }, 3500);
  wireRevealOnJump();   // init 성공 여부와 무관하게 건다(감춘 게 없으면 cardOf 가 늘 null)

  // 다른 코드가 필요할 때 쓰도록 최소한만 노출
  window.mangoiIA6 = { showAll: showAll, select: select, groups: GROUPS, applyRoleFilter: applyRoleFilter };
})();
