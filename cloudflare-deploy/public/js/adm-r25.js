// ═══════════════════════════════════════════════════════════════
// adm-r25.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ph124 의 GRANDCHILDREN_MAP 재사용 — global 로 노출
  if (!window.GRANDCHILDREN_MAP) {
    // ph124 에서 정의했지만 클로저 안일 경우 대비 — 기본 빈 매핑
    window.GRANDCHILDREN_MAP = {};
  }

  // 데모 매핑 (ph124와 동일 — fallback)
  var MAP = {
    'card-eval-mgmt':           [
      { ko:'➕ 빠른 평가서 작성',                en:'➕ Quick Evaluation', anchor:'sub-eval-create' },
      { ko:'📋 평가서 목록 + 통계',              en:'📋 List & Stats', anchor:'sub-eval-list' }
    ],
    'card-bulk-eval':           ['일괄 평가 폼','학생 그룹 선택','일괄 발송','진행 상황'],
    'card-ai-lesson-report':    ['AI 리포트 생성','음성 STT 검토','자동 요약 편집','학부모 발송'],
    'card-ai-eval-draft':       ['초안 생성','수정·다듬기','승인·확정','발송'],
    'card-monthly-report':      ['이번달 리포트','지난달 비교','커리큘럼 진도','출석 통계'],
    'card-comparison-report':   ['학생 간 비교','기간별 추이','학원 평균 대비','학년별 분포'],
    'card-webpush-mgmt':        [
      { ko:'📡 푸시 상태 + VAPID',  en:'📡 Push Status + VAPID', anchor:'sub-webpush-1' },
      { ko:'👥 구독자 목록',                   en:'👥 Subscribers', anchor:'sub-webpush-2' },
      { ko:'📤 푸시 발송',                    en:'📤 Send Push', anchor:'sub-webpush-3' },
      { ko:'📜 발송 이력',                    en:'📜 Send History', anchor:'sub-webpush-4' }
    ],
    'card-kakao-mgmt':          [
      { ko:'🔌 API 연동 상태',                en:'🔌 API Status', anchor:'sub-kakao-status' },
      { ko:'📨 K5: 학부모 답장 수신',            en:'📨 K5: Parent Replies', anchor:'sub-kakao-inbound' },
      { ko:'📖 SOLAPI 가입 가이드',            en:'📖 SOLAPI Setup Guide', anchor:'sub-kakao-guide' }
    ],
    'card-popups-mgmt':         [
      { ko:'📋 팝업 목록',          en:'📋 Popup List',    anchor:'sub-popup-list' },
      { ko:'📖 사용법 가이드',      en:'📖 Usage Guide',   anchor:'sub-popup-guide' }
    ],
    /* 📢 공지 스튜디오 = 카드 하나에 탭 두 개다.
         card-poster-maker  = ① 만들기 탭(data-nspanel="make")
         card-popups-mgmt   = ② 게시·팝업 탭(data-nspanel="publish", div 라 details 가 아니다)
       그래서 손자도 «자기 탭 것» 만 갖는다 — 넷을 두 벌 보여 주면 같은 줄이 사이드바에 두 번 뜬다.
       탭 전환은 ph125Jump 가 data-nspanel 을 보고 noticeStudioTab() 으로 켜 준다. */
    'card-poster-maker':        [
      { ko:'🖼 내 포스터',          en:'🖼 Saved Posters', anchor:'sub-poster-3' },
      { ko:'📖 사용 안내',          en:'📖 Guide',         anchor:'sub-poster-guide' }
    ],
    'card-notifications':       ['이벤트 등록','수신자 그룹','발송 예약','수신 확인'],
    'card-notice-board':        ['공지 작성','대상 선택','상단 고정','댓글 관리'],
    'card-teacher-mgmt':        [
      { ko:'📊 강사 가동률',                   en:'📊 Teacher Utilization', anchor:'sub-teacher-util' },
      { ko:'⭐ 강사 평가·품질',                 en:'⭐ Teacher Quality', anchor:'sub-teacher-quality' },
      { ko:'👩‍🏫 강사 명부',                  en:'👩‍🏫 Teacher Roster', anchor:'sub-teacher-roster' },
      { ko:'🧑‍💼 직원 명부',                  en:'🧑‍💼 Staff Roster', anchor:'sub-staff-roster' },
      { ko:'📚 교재 명부',                    en:'📚 Book List', anchor:'sub-book-roster' },
      { ko:'🔄 결석 강사 자동 대체',              en:'🔄 Auto Substitute Teacher', anchor:'sub-auto-sub' },
      { ko:'📋 강사 정보',                    en:'📋 Teacher Profile', anchor:'sub-teacher-7' }
    ],
    'card-payroll-auto':        ['자동 정산 설정','결산 미리보기','지급 일정','지급 이력'],
    'card-payroll':             ['이번달 급여','지급 내역','수정·조정','정산서 PDF'],
    'card-mbti-mgmt':           ['MBTI 등록','강사 매칭','학생 추천','분석 리포트'],
    'card-praise-stats':        ['이번주 칭찬','강사별 통계','학생별 받은 칭찬','월별 추이'],
    'card-supervisor':          [
      { ko:'🔗 멘토 배정',                    en:'🔗 Assign Mentor', anchor:'sub-sup-1' },
      { ko:'📋 활성 배정 목록',                 en:'📋 Active Assignments', anchor:'sub-sup-2' },
      { ko:'📝 노트 보내기',                   en:'📝 Send Note', anchor:'sub-sup-3' },
      { ko:'📥 수신 노트',                    en:'📥 Incoming Notes', anchor:'sub-sup-4' },
      { ko:'👀 수업 관찰 — 라이브 참관',           en:'👀 Class Observation — Live', anchor:'sub-sup-5' }
    ],
    'card-room-invite':         ['방 초대 발송','초대 링크','참여 현황','만료 관리'],
    'card-timetable':           ['주간 시간표','월간 시간표','강사별 보기','강의실 충돌'],
    'card-lesson-log':          ['오늘 일지 작성','AI 초안','학부모 발송','일지 타임라인'],
    'card-report-forms':        ['🌴 휴가 계획서','📄 기안 및 지출서','신규 양식 등록','발송 이력'],
    'card-kpi-dashboard':       ['오늘 KPI','이번달 추이','매출 추세','학생 변동'],
    'card-daily-charts':        ['오늘 차트','일별 비교','시간대별','지역별'],
    'card-rankings':            ['학생 랭킹','강사 랭킹','학원 랭킹','월별 변동'],
    'card-retention-risk':      ['위험군 알림','상담 우선순위','이탈 원인 분석','조치 이력'],
    'card-retention':           ['파기 일정 설정','오늘 파기 실행','파기 이력','파기 로그'],
    'card-active-rooms':        ['활성 룸 목록','참여자 수','강제 입장','녹화 시작'],
    'card-nps-monthly':         ['이번달 NPS','전월 비교','피드백 분석','액션 아이템'],
    'card-ai-forecast':         ['매출 예측','학생 증감','이탈 예측','시나리오 비교'],
    'card-voice-stats':         ['오늘 발화량','학생별 점수','녹음 시간','발음 분석'],
    'card-accounting-mgmt':     [
      { ko:'🔔 수강료 미연장 자동 알림',            en:'🔔 Non-renewal Auto-Notify', anchor:'sub-overdue' },
      { ko:'💳 학생 결제 내역',                 en:'💳 Student Payments', anchor:'sub-acc-2' },
      { ko:'🧾 강사 급여 / 정산',               en:'🧾 Teacher Payroll', anchor:'sub-acc-3' },
      { ko:'🌍 국가별 강사료 환전',               en:'🌍 Multi-currency Payout', anchor:'sub-acc-4' },
      { ko:'🏢 지점/가맹점 정산',                en:'🏢 Branch Settlement Dashboard', anchor:'sub-acc-5' },
      { ko:'↩️ 환불 / 취소 관리',              en:'↩️ Refund / Cancel', anchor:'sub-acc-6' },
      { ko:'🎁 쿠폰 · 할인 · 포인트',            en:'🎁 Coupons · Discount · Points', anchor:'sub-acc-7' },
      { ko:'🧮 세무',                       en:'🧮 Tax', anchor:'sub-acc-8' },
      { ko:'🧾 카페24 회계 실데이터',             en:'🧾 Cafe24 Finance', anchor:'sub-c24-finance' },
      { ko:'📒 회계 전표 / 분개장',              en:'📒 Journal Entries', anchor:'sub-acc-10' },
      { ko:'📊 매출 대시보드',                  en:'📊 Sales Dashboard', anchor:'sub-acc-11' },
      { ko:'💼 미수금 / 미지급금',               en:'💼 Receivables / Payables', anchor:'sub-receivables' },
      { ko:'📈 손익 / 재무제표',                en:'📈 P&L / Financials', anchor:'acc-financials' },
      { ko:'🔍 매출–입금 대사',                 en:'🔍 Revenue vs Deposits', anchor:'sub-acc-14' },
      { ko:'💳 법인카드 사용내역',                en:'💳 Corporate Card', anchor:'acc-corpcard' },
      { ko:'📥 회계 리포트 다운로드',              en:'📥 Accounting Reports', anchor:'sub-acc-16' },
      { ko:'🏪 배정 못 한 결제 아이디 — 대리점 연결',   en:'🏪 Unassigned payer IDs', anchor:'acc-payer-box' },
      { ko:'🏦 배정 못 한 B2B 입금 — 가맹점 연결',   en:'🏦 Unassigned B2B deposits', anchor:'acc-b2b-box' },
      { ko:'🏷️ 지출 계정과목 분류 — 「기타출금」 쪼개기',  en:'🏷️ Expense categories', anchor:'acc-payee-box' }
    ],
    'card-payments-b2b':        ['거래 내역','거래 통계','수수료 정산','CSV 다운로드'],
    'card-payments-b2c':        ['주문 내역','매출 통계','세금계산서','환불 처리'],
    'card-recurring-billing':   ['정기 구독자','결제 예정','실패 처리','구독 변경'],
    'card-auto-dunning':        ['미납 자동 알림','독촉 일정','연체율','회수 이력'],
    'card-settlement-stats':    ['일별 정산','대리점별','상품별','수수료별'],
    'card-points-mgmt':         [
      { ko:'🔌 자동발송 API 연동 상태',           en:'🔌 Auto-send API Status', anchor:'sub-points-api' },
      { ko:'💰 학생 포인트 잔액',                en:'💰 Student Balances', anchor:'sub-points-balances' },
      { ko:'🛍️ 기프티콘 카탈로그',               en:'🛍️ Gift Catalog', anchor:'sub-points-catalog' },
      { ko:'📦 교환 신청 내역',                 en:'📦 Redemptions', anchor:'sub-points-redemptions' },
      { ko:'⚙ 자동 적립 규칙',                 en:'⚙ Auto-earn Rules', anchor:'sub-points-rules' }
    ],
    /* 👨‍🎓 학생 명부 (2026-08-18 사장님 지적 «여기서 어디로 가?») —
       여기 있던 다섯 줄('학생 등록·검색','학생 상세 프로필','학생 그룹 관리','학년별 통계','비활성 학생')은
       위 머리말이 말하는 «데모 매핑» 이었다. 카드 안에 그런 칸이 없는데 이름만 지어 넣은 것이라,
       옛 방식(«카드 안 N번째 details» 로 점프)이 이름과 전혀 다른 칸을 열고 있었다 —
         2 학생 상세 프로필 → 실제로는 «⏰ 만료 임박 학생» 이 열렸다.
       이 카드는 진짜 하위칸이 8개 있으므로, 지어낸 이름을 버리고 **있는 것 그대로** 적는다.
       ⚠️ 객체 형태({ko,en,anchor})는 새로 만든 길이 아니다 — 아래 card-level-tests 가 쓰던 방식이고,
          ph125Jump 가 anchor 를 찾아 그 칸을 펴 준다. 문자열로 되돌리지 말 것(이름이 다시 어긋난다).
       ⚠️ anchor id 는 admin.html 의 그 <details> 에 달려 있다. 한쪽만 바꾸면 조용히 카드 전체만 반짝인다. */
    'card-students-mgmt':       [
      { ko:'학생 목록',            en:'Student List',        anchor:'sm-student-list' },
      { ko:'⏰ 만료 임박 학생',     en:'⏰ Expiring Soon',     anchor:'sm-expiring' },
      { ko:'🚪 오늘 수업',          en:'🚪 Today\'s Classes',  anchor:'sm-today-classes' },
      { ko:'📅 오늘 출결',          en:'📅 Today\'s Attendance', anchor:'sm-today-attendance' },
      { ko:'📅 학원 전체 스케줄',   en:'📅 All Schedules',    anchor:'sm-all-schedules' },
      { ko:'🏆 연속 출석 랭킹',     en:'🏆 Streak Ranking',   anchor:'sm-streak-rank' },
      { ko:'📞 최근 상담 통합',     en:'📞 Recent Consults',  anchor:'sm-recent-consult' },
      { ko:'💭 단체 메시지',        en:'💭 Bulk Message',     anchor:'sm-bulk-section' }
    ],
    'card-family-mgmt':         ['가족 그룹','형제자매 묶기','가족 할인','연락처 통합'],
    'card-inquiry-mgmt':        [
      { ko:'🪑 대기자 명단',                   en:'🪑 Waitlist', anchor:'sub-waitlist' },
      { ko:'📈 전환률 통계',                   en:'📈 Conversion Stats', anchor:'sub-inquiry-stats' },
      { ko:'📋 상담 목록',                    en:'📋 Inquiries', anchor:'sub-inquiry-list' }
    ],
    'card-enrollments':         ['이번달 등록','대기자','휴학 처리','재등록'],
    'card-badges-mgmt':         [
      { ko:'🏆 배지 카탈로그 + 통계',             en:'🏆 Badge Catalog + Stats', anchor:'sub-badge-1' },
      { ko:'🕹️ 3D 배틀 & 입체 배지 보상',        en:'🕹️ 3D Battle & Reward Badges', anchor:'sub-badge-2' },
      { ko:'🧪 학생 배지 자동 검사',              en:'🧪 Manual Award Check', anchor:'sub-badge-3' }
    ],
    'card-community':           ['게시판','댓글 관리','신고 처리','공지'],
    'card-counseling-booking':  ['상담 예약','상담 일정','상담 이력','후속 조치'],
    'card-parent-digest':       ['주간 요약','월간 요약','이메일 발송','학부모 반응'],
    'card-parent-faq-bot':      ['FAQ 등록','자주 묻는 질문','학부모 답변','챗봇 학습'],
    'card-referral':            ['추천 코드 발급','추천 통계','보상 지급','이벤트'],
    'card-alumni':              [
      { ko:'➕ 졸업생 등록',                   en:'➕ Register Alumnus', anchor:'sub-alumni-1' },
      { ko:'📋 졸업생 목록 + 필터',              en:'📋 Alumni List + Filter', anchor:'sub-alumni-2' },
      { ko:'📝 동문 게시판',                   en:'📝 Alumni Board', anchor:'sub-alumni-3' }
    ],
    'card-gallery':             ['사진 업로드','자녀별 앨범','월별 하이라이트','졸업 앨범'],
    'card-school-attendance-stats': ['전체 출석률','학원별 통계','위험군 알림','월별 비교'],
    'card-textbooks':           [
      { ko:'📚 컨텐츠 교재 관리',                en:'📚 Content Textbook Management', anchor:'sub-book-1' },
      { ko:'📂 컨텐츠 교재그룹 관리',              en:'📂 Content Textbook Group Management', anchor:'sub-book-2' },
      { ko:'📂 교재 파일 라이브러리',              en:'📂 Textbook File Library', anchor:'sub-textbook-files' },
      { ko:'🎬 망고아이 비디오 관리',              en:'🎬 Mango-i Videos', anchor:'sub-mango-videos' },
      { ko:'🛒 판매 교재 관리',                 en:'🛒 Sales Textbook Management', anchor:'sub-book-5' },
      { ko:'📦 판매 교재 그룹 관리',              en:'📦 Sales Textbook Group', anchor:'sub-book-6' },
      { ko:'🏷️ 판매 구분 관리',                en:'🏷️ Sales Category Management', anchor:'sub-book-7' }
    ],
    'card-microlearn':          ['오늘의 학습','진도 추적','퀴즈','복습'],
    'card-review-quiz':         ['퀴즈 출제','문항 작성','응시 결과','복습퀴즈'],
    'card-mini-toeic':          ['모의고사','오답 노트','진도','등급'],
    'card-pronunciation':       ['발음 평가','녹음 보관','AI 채점','학습 가이드'],
    'card-video-dict':          ['영상 사전','단어 검색','자막 학습','즐겨찾기'],
    'card-voice-diary':         ['오늘 일기','녹음 보관','AI 첨삭','월간 모음'],
    /* 🎯 (2026-08-06) 레벨테스트 손자 — 여기만 «진짜 목적지» 방식이다.
       예전 4개(레벨 테스트/결과 조회/레벨 변경/히스토리)는 이름만 다르고 동작이 전부 같았다.
       아래 ph125Jump 가 «카드 안 N번째 details» 로 찾아가는데 이 카드엔 그런 게 0개라
       무엇을 눌러도 카드 전체가 한 번 반짝이고 끝났다(에러 0 — 그래서 아무도 몰랐다).
       ⚠️ 문자열로 되돌리지 말 것. 문자열은 곧 «위치로 찾아감» 이고, 카드 구조가 바뀌면
          아무 소리 없이 다시 엉뚱한 데로 간다. 새 항목도 anchor/card/fn 중 하나를 반드시 줄 것. */
    'card-level-tests':         [
      { ko:'🆕 신청 현황',      en:'🆕 Applications',  anchor:'lt-sec-apps' },
      { ko:'📊 응시 결과',      en:'📊 Test Results',  anchor:'lt-sec-results' },
      { ko:'🏅 배치 현황',      en:'🏅 Placement',     card:'card-leveltest' },
      { ko:'📅 캘린더에서 보기', en:'📅 On Calendar',   fn:'ltGotoCalendar' },
      { ko:'+ 결과 수동 등록',  en:'+ Add Result',    anchor:'lt-sec-add' }
    ],
    'card-recording-storage':   ['오늘 녹화','학생별 보관','용량 관리','자동 삭제'],
    'card-homework':            ['새 숙제 출제','제출 현황','채점','피드백 발송'],
    'card-permissions':         [
      { ko:'👥 역할별 권한 매트릭스',              en:'👥 Role Permission Matrix', anchor:'sub-perm-1' },
      { ko:'➕ 본사 직원 등록',                 en:'➕ Register HQ Employee', anchor:'sub-perm-2' },
      { ko:'👤 역할별 사용자 관리',               en:'👤 Users by Role', anchor:'sub-perm-3' },
      { ko:'📜 권한 변경 이력',                 en:'📜 Audit Log', anchor:'sub-perm-4' }
    ],
    'card-franchises':          [
      { ko:'🏛️ 대표지사',                    en:'🏛️ Master Branch', anchor:'card-master-branches' },
      { ko:'🏢 지사',                       en:'🏢 Branch', anchor:'sub-branches' },
      { ko:'🏪 대리점',                      en:'🏪 Agency', anchor:'card-centers' },
      { ko:'🏯 본사 관리',                    en:'🏯 HQ Management', anchor:'card-hq-orgs' }
    ],
    'card-centers':             ['센터 목록','센터 등록','강사 배정','매출 조회'],
    'card-data-export':         ['학생 CSV','강사 CSV','결제 CSV','출결 CSV'],
    'card-admin-alerts':        ['오늘 알림','중요 알림','시스템 경고','읽음 처리'],
    'card-admin-ghost':         ['활성 룸 참관','녹화 확인','강제 입장','참관 이력'],
    'card-admin-whisper':       ['귓속말 발송','이력','강사 알림','학생 알림'],
    'card-attendance-status':   ['오늘 출결','월별 통계','학생별 이력','자동 알림'],
    'card-auto-attendance':     ['QR 생성','스캔 이력','출결 자동','부정 출결'],
    'card-class-attendance':    ['수업별 출결','강사 체크인','지각·결석','학부모 알림']
  };

  var hoverTimer = null;
  var lastOpened = null;

  // === sub 옆에 토글 화살표 + 손자 메뉴 컨테이너 추가 ===
  function ph125Build(){
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return;
    bar.querySelectorAll('.ph85-sub').forEach(function(sub){
      if (sub.__ph125) return;
      var cardId = sub.dataset.card;
      if (!cardId) return;
      var children = MAP[cardId];
      if (!children || children.length === 0) return;
      sub.__ph125 = true;

      // ▸ 토글 추가
      if (!sub.querySelector('.ph125-toggle')) {
        var toggle = document.createElement('span');
        toggle.className = 'ph125-toggle';
        toggle.textContent = '▸';
        sub.appendChild(toggle);
      }

      // 다음 sibling 으로 손자 메뉴 컨테이너 추가
      var existing = sub.nextElementSibling;
      if (!existing || !existing.classList.contains('ph125-grandchildren')) {
        var gcContainer = document.createElement('div');
        gcContainer.className = 'ph125-grandchildren';
        gcContainer.dataset.parent = cardId;
        gcContainer.innerHTML = children.map(function(raw, i){
          /* 항목은 두 가지 — 문자열(옛 방식: 카드 안 N번째로) 또는 객체(새 방식: 진짜 목적지).
             🌐 라벨은 화면 언어를 따른다. 손자 이름만 한국어로 남으면 필리핀 강사·매니저가
                무엇을 여는 메뉴인지 못 읽는다. */
          var isObj = raw && typeof raw === 'object';
          var en = !!(window.adminLang && window.adminLang !== 'ko');
          var t = isObj ? ((en && raw.en) ? raw.en : raw.ko) : raw;
          var safe = String(t).replace(/'/g, "\\'");
          // 🌐 원본 한국어 이름을 data-gc-name 으로 보존(i18n 영어 스윕은 보이는 텍스트만 바꾸므로 설명 사전 조회 키가 안 깨짐)
          //    ⚠️ 여기는 «항상» 한국어여야 한다 — 위 t 는 화면 언어를 타므로 t 를 쓰면 영어 모드에서 키가 깨진다.
          var koName = isObj ? raw.ko : raw;
          var attr = String(koName).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          /* 🌐 (2026-08-18) data-ko/data-en 을 «그릴 때 함께» 박는다.
             CLAUDE.md 2장 「JS 로 그린 라벨」 — textContent 로 직접 쓴 글자는 언어 토글의
             data-ko/data-en 루프도, i18n-sweep 의 restore() 도 못 고친다.
             toggleAdminLang() 은 새로고침 없이 DOM 만 갈아서, 이게 없으면 🌐 를 눌러도
             손자 메뉴만 옛 언어로 남는다(필리핀 강사·매니저가 보는 화면이다).
             ⚠️ 문자열 항목(옛 데모 매핑)은 번역이 없으므로 ko/en 둘 다 같은 값을 넣는다 —
                빈 data-en 을 넣으면 영어로 바꿀 때 라벨이 «사라진다». */
          var koT = isObj ? raw.ko : raw;
          var enT = (isObj && raw.en) ? raw.en : koT;
          var esc = function (x) { return String(x).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
          return '<div class="ph125-gc" data-gc-name="' + attr + '" onclick="event.stopPropagation();ph125Jump(\'' + cardId + '\',' + i + ',\'' + safe + '\')">' +
            '<span class="ph125-num">' + (i + 1) + '</span>' +
            '<span class="ph125-text" data-ko="' + esc(koT) + '" data-en="' + esc(enT) + '">' + t + '</span>' +
          '</div>';
        }).join('');
        sub.parentNode.insertBefore(gcContainer, sub.nextSibling);
      }

      // 🗑️ (2026-07-27 사장님 지시 "메뉴가 자기 멋대로 나왔다 들어갔다") 호버 자동 펼침 제거.
      //   마우스를 올리기만 해도 손자 메뉴가 열리고(mouseenter) 벗어나면 타이머로 닫혀서(mouseleave)
      //   사이드바 위에서 마우스를 움직일 때마다 메뉴가 저절로 열렸다 닫혔다 했다.
      //   → 아래 ▸ 토글 '클릭'으로만 열고 닫는다. 재추가 금지.

      // === 토글 화살표 클릭 → 명시적 토글 (호버 없이도 작동) ===
      var toggleBtn = sub.querySelector('.ph125-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function(e){
          e.stopPropagation();
          e.preventDefault();
          // 다른 sub 닫기
          bar.querySelectorAll('.ph85-sub.ph125-open').forEach(function(s){
            if (s !== sub) s.classList.remove('ph125-open');
          });
          sub.classList.toggle('ph125-open');
        });
      }
    });

    // (2026-07-27) 손자 컨테이너 호버 유지/닫기 리스너도 제거 — 호버 자동 펼침 폐지에 맞춤.
    //   열림/닫힘은 ▸ 클릭 토글만 담당하므로 마우스 위치로 상태가 바뀔 일이 없다.
  }

  /* 노란 테두리로 «여기다» 표시 — 어디로 왔는지 모르면 점프한 의미가 없다 */
  function ph125Flash(el, strong){
    el.style.boxShadow = strong
      ? '0 0 0 4px rgba(251,191,36,0.7), 0 12px 40px rgba(251,191,36,0.3)'
      : '0 0 0 3px rgba(251,191,36,0.6), 0 12px 40px rgba(251,191,36,0.3)';
    setTimeout(function(){ el.style.boxShadow = ''; }, 2500);
  }

  window.ph125Jump = function(cardId, idx, title){
    var card = document.getElementById(cardId);
    if (!card) { alert('카드 미구현: ' + cardId); return; }

    /* ── 새 방식: 항목이 «진짜 목적지» 를 들고 있으면 그대로 간다 ──────────────
       옛 방식(아래)은 «카드 안 N번째 details» 라, 그런 게 없는 카드에서는 항목이 몇 개든
       전부 같은 동작(카드 전체 반짝임)이 됐다. 에러가 안 나서 죽은 줄도 몰랐다. */
    var descList = MAP[cardId];
    var desc = (descList && typeof descList[idx] === 'object') ? descList[idx] : null;
    if (desc) {
      var host = desc.card ? document.getElementById(desc.card) : card;
      if (!host) { alert('카드 미구현: ' + desc.card); return; }
      if (host.tagName === 'DETAILS') host.open = true;
      var anc = desc.anchor ? document.getElementById(desc.anchor) : null;
      // 앵커가 접힌 details 안에 있으면 펼쳐 준다 — 안 그러면 스크롤만 하고 아무것도 안 보인다
      if (anc) { var p = anc; while (p && p !== host) { if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; } }
      /* 🪤 (2026-08-18) <details> 조상만 펴는 것으로는 모자란다.
         「공지 스튜디오」는 탭 두 개(div.ns-panel[data-nspanel])이고 안 고른 쪽은 display:none 이다.
         숨은 상자에 scrollIntoView 를 해도 화면은 꿈쩍도 안 한다 — 에러도 안 난다.
         그래서 앵커가 어느 탭 안인지 보고, 그 탭을 먼저 켠다. */
      if (anc) {
        var panel = anc.closest ? anc.closest('[data-nspanel]') : null;
        if (panel && typeof window.noticeStudioTab === 'function') {
          try { window.noticeStudioTab(panel.getAttribute('data-nspanel')); } catch (e) { /* 무시 */ }
        }
      }
      host.scrollIntoView({ behavior:'auto', block:'start' });
      setTimeout(function(){
        if (desc.fn && typeof window[desc.fn] === 'function') { window[desc.fn](); return; }
        var t = anc || host;
        t.scrollIntoView({ behavior:'auto', block: anc ? 'center' : 'start' });
        ph125Flash(t, !anc);
      }, 300);
      console.log('[ph125] 손자 점프(앵커):', desc.card || cardId, desc.anchor || desc.fn || '(카드)');
      return;
    }

    if (card.tagName === 'DETAILS') card.open = true;
    card.scrollIntoView({ behavior:'auto', block:'start' });
    var items = card.querySelectorAll('details.sub-item, .sub-menu > details');
    var target = items[idx];
    if (target) {
      target.open = true;
      setTimeout(function(){
        target.scrollIntoView({ behavior:'auto', block:'center' });
        target.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.6), 0 12px 40px rgba(251,191,36,0.3)';
        setTimeout(function(){ target.style.boxShadow = ''; }, 2500);
      }, 300);
    } else {
      card.style.boxShadow = '0 0 0 4px rgba(251,191,36,0.7), 0 12px 40px rgba(251,191,36,0.3)';
      setTimeout(function(){ card.style.boxShadow = ''; }, 2500);
    }
    console.log('[ph125] 손자 점프:', cardId, '[' + idx + ']', title);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph125Build);
  else ph125Build();

  /* 🌐 언어를 바꾸면 손자 메뉴를 다시 그린다.
     ph125Build 는 sub.__ph125 와 «컨테이너가 이미 있는가» 로 두 번 그리지 않게 막혀 있어서,
     그 표시를 지워 주지 않으면 다시 불러도 아무 일이 안 일어난다.
     ⚠️ 펼쳐 둔 상태(.ph125-open)는 sub 에 붙어 있으므로 다시 그려도 그대로 남는다. */
  window.addEventListener('mangoi:lang-changed', function () {
    try {
      var bar = document.getElementById('ph85-sidebar');
      if (!bar) return;
      bar.querySelectorAll('.ph125-grandchildren').forEach(function (g) { g.remove(); });
      bar.querySelectorAll('.ph85-sub').forEach(function (sub) {
        sub.__ph125 = false;
        var tg = sub.querySelector('.ph125-toggle');
        if (tg) tg.remove();          // ph125Build 가 다시 달아 준다(리스너 중복 방지)
      });
      ph125Build();
    } catch (e) { /* 언어 전환이 이것 때문에 죽지 않게 */ }
  });
  (window.__admSettleRun ? window.__admSettleRun(ph125Build) : setInterval(ph125Build, 1500));

  console.log('[ph125] 인라인 아코디언 손자 메뉴 활성 — 호버 자동 펼침 + ▸ 클릭 토글');
})();
