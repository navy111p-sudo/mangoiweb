// ═══════════════════════════════════════════════════════════════
// adm-r25.js — 사이드바 3단계 «손자 메뉴»(ph125)
//   외부 classic script, 전역 스코프 공유. 원복=admin.html 의 이 위치에 인라인.
//
// 🔑 (2026-08-18 전면 교체) 손자 이름을 «손으로 적지 않는다».
//   예전엔 카드마다 이름 4개씩을 손으로 적어 둔 MAP 이 있었는데, 그 머리말이 스스로
//   «데모 매핑» 이라고 밝히고 있었다 — 카드에 그런 칸이 없어도 메뉴가 비어 보이지 않게
//   **이름만 지어 넣은 것**이다. 누르면 「카드 안 N번째 details」로 가는 방식이라,
//   그런 칸이 0개인 카드(63개)에서는 무엇을 눌러도 카드 전체가 한 번 반짝이고 끝났다.
//   에러가 안 나서 죽은 줄도 몰랐고, 실제로 「학생 명부 ▸ 2 학생 상세 프로필」을 누르면
//   엉뚱하게 「⏰ 만료 임박 학생」이 열렸다(사장님 지적).
//
//   → 이제 손자는 **카드 안에 진짜로 있는 접이칸(details)을 화면에서 그대로 읽어** 만든다.
//      · 이름   = 그 칸의 summary 글자 그대로 → 어긋날 수가 없다
//      · 목적지 = 그 칸 자체(DOM 참조) → id 가 없어도, 같은 id 가 두 벌 있어도 정확하다
//      · 용량   = 목록을 안 들고 다니므로 **다운로드가 늘지 않는다**(오히려 6KB 줄었다)
//   ⛔ 없는 칸을 이름으로 지어 넣지 말 것. 그러면 위 사고가 그대로 재현된다.
//      카드에 손자를 만들고 싶으면 **카드 안에 진짜 칸(details.sub-item)을 만드세요.**
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  /* MAP — «수기 anchor 목록». 하니스(admin_grandchild_menu_harness ②-2)가
     이 16+1개 카드는 객체({ko,en,anchor}) 형태를 유지하라고 못 박고 있다(2026-08-18 main).
     여기 없는 카드는 아래 scan() 이 카드 안 실제 칸(details.sub-item / [data-gc])을 읽어 그린다.
     ⚠️ 문자열 목록으로 되돌리지 말 것 — 문자열은 «카드 안 N번째로 점프» 라 카드 구조가
        바뀌면 아무 소리 없이 엉뚱한 칸이 열린다(옛 «데모 매핑» 사고).
     ⚠️ anchor id 는 admin.html 의 그 <details> 에 달려 있고 문서 안에서 유일해야 한다
        (sm-bulk-msg 가 안의 textarea id 와 겹쳐 발송이 깨졌던 실사고 — 하니스가 감시). */
  var MAP = {
    'card-eval-mgmt':           [
      { ko:'➕ 빠른 평가서 작성',                en:'➕ Quick Evaluation', anchor:'sub-eval-create' },
      { ko:'📋 평가서 목록 + 통계',              en:'📋 List & Stats', anchor:'sub-eval-list' }
    ],

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

    'card-teacher-mgmt':        [
      { ko:'📊 강사 가동률',                   en:'📊 Teacher Utilization', anchor:'sub-teacher-util' },
      { ko:'⭐ 강사 평가·품질',                 en:'⭐ Teacher Quality', anchor:'sub-teacher-quality' },
      { ko:'👩‍🏫 강사 명부',                  en:'👩‍🏫 Teacher Roster', anchor:'sub-teacher-roster' },
      { ko:'🧑‍💼 직원 명부',                  en:'🧑‍💼 Staff Roster', anchor:'sub-staff-roster' },
      { ko:'📚 교재 명부',                    en:'📚 Book List', anchor:'sub-book-roster' },
      { ko:'🔄 결석 강사 자동 대체',              en:'🔄 Auto Substitute Teacher', anchor:'sub-auto-sub' },
      { ko:'📋 강사 정보',                    en:'📋 Teacher Profile', anchor:'sub-teacher-7' }
    ],

    'card-supervisor':          [
      { ko:'🔗 멘토 배정',                    en:'🔗 Assign Mentor', anchor:'sub-sup-1' },
      { ko:'📋 활성 배정 목록',                 en:'📋 Active Assignments', anchor:'sub-sup-2' },
      { ko:'📝 노트 보내기',                   en:'📝 Send Note', anchor:'sub-sup-3' },
      { ko:'📥 수신 노트',                    en:'📥 Incoming Notes', anchor:'sub-sup-4' },
      { ko:'👀 수업 관찰 — 라이브 참관',           en:'👀 Class Observation — Live', anchor:'sub-sup-5' }
    ],

    /* 💰 회계관리 (2026-08-18 사장님 제보 «손익/재무제표가 메뉴에서 안 보인다») —
       이름 넷이 문자열이라 옛 방식(«카드 안 N번째 details»)으로 점프했고 그 순서가 실제와 달랐다:
         3 법인카드   → 실제로는 «🧾 강사 급여 / 정산» 이 열렸고
         4 손익·재무  → 실제로는 «🌍 국가별 강사료 환전 / 🏢 지점·가맹점 정산» 근처가 열렸다.
       손익/재무제표는 뒤쪽 칸이라 손으로 찾으려면 한참 스크롤해야 한다 → «메뉴에 없다» 로 보인다.
       ⚠️ (2026-08-18 2차) 그때는 넷만 앵커로 바꿨는데, 이 카드의 하위칸은 **19개 전부**가
          갈 만한 자리다. 넷만 두면 나머지 15칸은 여전히 스크롤로 찾아야 한다 → 전부 실었다.
       ⚠️ anchor id 는 admin.html 의 그 <details> 에 달려 있다. 한쪽만 바꾸면 조용히 옛 방식으로
          되돌아가 또 엉뚱한 칸이 열린다(에러가 안 나서 알아채기 어렵다).
       ⚠️ ko 이름은 «화면에 적힌 그대로» 다. 짧게 줄이면 손자 메뉴 설명 사전(admin-tip-i18n.js)
          조회가 어긋나므로, 줄일 때는 그 사전도 함께 볼 것. */
    'card-accounting-mgmt':     [
      { ko:'🔔 수강료 미연장 자동 알림',            en:'🔔 Non-renewal Auto-Notify', anchor:'sub-overdue' },
      { ko:'💳 학생 결제 내역',                 en:'💳 Student Payments', anchor:'acc-student-payments' },
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
      { ko:'🏦 신한 계좌 입출금 (지출 분석)',      en:'🏦 Shinhan Bank Expenses', anchor:'acc-bankacct' },
      { ko:'📥 회계 리포트 다운로드',              en:'📥 Accounting Reports', anchor:'sub-acc-16' },
      { ko:'🏪 배정 못 한 결제 아이디 — 대리점 연결',   en:'🏪 Unassigned payer IDs', anchor:'acc-payer-box' },
      { ko:'🏦 배정 못 한 B2B 입금 — 가맹점 연결',   en:'🏦 Unassigned B2B deposits', anchor:'acc-b2b-box' },
      { ko:'🏷️ 지출 계정과목 분류 — 「기타출금」 쪼개기',  en:'🏷️ Expense categories', anchor:'acc-payee-box' }
    ],

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
      { ko:'📅 전체 스케줄',       en:'📅 All Schedules',    anchor:'sm-all-schedules' },
      { ko:'🏆 연속 출석 랭킹',     en:'🏆 Streak Ranking',   anchor:'sm-streak-rank' },
      { ko:'📞 최근 상담 통합',     en:'📞 Recent Consults',  anchor:'sm-recent-consult' },
      { ko:'💭 단체 메시지',        en:'💭 Bulk Message',     anchor:'sm-bulk-section' }
    ],

    'card-inquiry-mgmt':        [
      { ko:'🪑 대기자 명단',                   en:'🪑 Waitlist', anchor:'sub-waitlist' },
      { ko:'📈 전환률 통계',                   en:'📈 Conversion Stats', anchor:'sub-inquiry-stats' },
      { ko:'📋 상담 목록',                    en:'📋 Inquiries', anchor:'sub-inquiry-list' }
    ],

    'card-badges-mgmt':         [
      { ko:'🏆 배지 카탈로그 + 통계',             en:'🏆 Badge Catalog + Stats', anchor:'sub-badge-1' },
      { ko:'🕹️ 3D 배틀 & 입체 배지 보상',        en:'🕹️ 3D Battle & Reward Badges', anchor:'sub-badge-2' },
      { ko:'🧪 학생 배지 자동 검사',              en:'🧪 Manual Award Check', anchor:'sub-badge-3' }
    ],

    'card-alumni':              [
      { ko:'➕ 졸업생 등록',                   en:'➕ Register Alumnus', anchor:'sub-alumni-1' },
      { ko:'📋 졸업생 목록 + 필터',              en:'📋 Alumni List + Filter', anchor:'sub-alumni-2' },
      { ko:'📝 동문 게시판',                   en:'📝 Alumni Board', anchor:'sub-alumni-3' }
    ],

    'card-textbooks':           [
      { ko:'📚 컨텐츠 교재 관리',                en:'📚 Content Textbook Management', anchor:'sub-book-1' },
      { ko:'📂 컨텐츠 교재그룹 관리',              en:'📂 Content Textbook Group Management', anchor:'sub-book-2' },
      { ko:'📂 교재 파일 라이브러리',              en:'📂 Textbook File Library', anchor:'sub-textbook-files' },
      { ko:'🎬 망고아이 비디오 관리',              en:'🎬 Mango-i Videos', anchor:'sub-mango-videos' },
      { ko:'🛒 판매 교재 관리',                 en:'🛒 Sales Textbook Management', anchor:'sub-book-5' },
      { ko:'📦 판매 교재 그룹 관리',              en:'📦 Sales Textbook Group', anchor:'sub-book-6' },
      { ko:'🏷️ 판매 구분 관리',                en:'🏷️ Sales Category Management', anchor:'sub-book-7' }
    ],

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
    ],   /* ← 끝 쉼표 유지: 하니스가 「'],'」 로 각 목록의 끝을 찾는다 */
  };


  /* 카드 안 «진짜 칸» 선택자 — 여기 걸리는 것만 손자가 된다.
     · details.sub-item / .sub-menu > details — 접이칸. 이름은 summary 글자 그대로.
     · [data-gc="이름"]                        — 접이칸이 아닌 구역에 사람이 붙인 «이름표».
       접이식이 아닌 화면(필터+표 한 벌 같은 것)에도 손자를 만들고 싶을 때 쓴다.
       ⚠️ 이름표는 «그 구역 자체» 에 단다. 목록을 딴 파일에 적으면 화면이 바뀔 때 또 어긋난다.
       영어 이름은 data-gc-en 에 함께 적는다(없으면 한국어가 그대로 나온다). */
  var SEL = 'details.sub-item, .sub-menu > details, [data-gc]';
  var EN  = function(){ return !!(window.adminLang && window.adminLang !== 'ko'); };

  /* summary 글자에서 메뉴 이름만 뽑는다.
     summary 안에는 ℹ️ 도움말·건수 배지가 같이 들어 있는 경우가 많아서 그대로 쓰면 한 줄이 길어진다. */
  function labelOf(sum, attr){
    var sp = sum.querySelector('[' + attr + ']');
    var t  = sp ? sp.getAttribute(attr) : '';
    if (!t) t = sum.textContent || '';
    /* ⚠️ 여기서 길이를 자르지 않는다. 자른 이름이 그대로 `data-gc-name`(설명 사전 조회 키)이 되면
       사전에 그런 키가 없어 말풍선이 통째로 사라진다(사전에 «…» 로 끝나는 키는 0개다).
       또 잘린 끝이 「… (관리용 · 장부 …」 처럼 괄호 중간이면 아래 pretty 가 설명 괄호를 못 알아본다.
       **자르기는 보이는 글자에서만** 한다 — pretty() 참고. */
    return String(t).split(/ℹ️|💡|\n/)[0].replace(/\s+/g, ' ').trim();
  }

  /* 카드에서 손자 목록을 읽는다. 목적지는 DOM 참조(el)라 id 가 없어도 정확하다. */
  function scan(card){
    var list = [], seen = [];
    var nodes = card.querySelectorAll(SEL);
    for (var i = 0; i < nodes.length; i++){
      var d = nodes[i];
      if (seen.indexOf(d) >= 0) continue;   // 두 선택자에 겹쳐 걸린 것 제거
      seen.push(d);
      var ko, en;
      if (d.hasAttribute('data-gc')){
        ko = (d.getAttribute('data-gc') || '').trim();
        en = (d.getAttribute('data-gc-en') || '').trim() || ko;
      } else {
        var sum = d.querySelector('summary');
        if (!sum || sum.parentElement !== d) continue;
        ko = labelOf(sum, 'data-ko');
        en = labelOf(sum, 'data-en') || ko;
      }
      if (!ko) continue;
      list.push({ ko: ko, en: en, el: d });
      if (list.length >= 20) break;         // 한 메뉴가 화면을 다 먹지 않게
    }
    return list;
  }

  function itemsFor(cardId, card){
    var m = MAP[cardId];
    if (m) return m;
    return scan(card);
  }

  /* 🍃 (2026-08-19 사장님) 「메뉴 ▸ 자식 ▸ 손자」를 **모든 항목에서**.
     여기까지 오는 것은 카드 «안의 한 칸» 을 가리키는 항목이다(「지사」·「대리점」·「지사 정산」…).
     예전에는 손자를 아예 만들지 않았다 — 카드 «전체» 를 읽으면 형제 항목들과 똑같은 4줄이
     네 번 나왔기 때문이다(2026-08-18 「중복」 지적). 이제 카드가 아니라 **그 칸 안** 만 읽는다.
     칸마다 안이 다르므로 중복이 생기지 않고, 항목마다 자기 손자를 갖는다.
     ⚠️ 겹치는 것 중 «바깥» 은 버린다 — 이름표를 감싸는 상자(.sub-body 등)까지 세면
        「그 칸 전체로 가는 줄」이 목록 맨 위에 하나 더 붙어 무엇을 눌러야 할지 헷갈린다. */
  function scanLeaf(leaf){
    var nodes = [].slice.call(leaf.querySelectorAll('[data-gc], details'));
    var picked = nodes.filter(function(d){
      if (d === leaf) return false;
      for (var i = 0; i < nodes.length; i++){
        if (nodes[i] !== d && d.contains(nodes[i])) return false;   // 남을 품은 상자는 버린다
      }
      return true;
    });
    var list = [];
    for (var i = 0; i < picked.length && list.length < 20; i++){
      var d = picked[i], ko, en;
      if (d.hasAttribute('data-gc')){
        ko = (d.getAttribute('data-gc') || '').trim();
        en = (d.getAttribute('data-gc-en') || '').trim() || ko;
      } else {
        var sum = d.querySelector('summary');
        if (!sum || sum.parentElement !== d) continue;
        ko = labelOf(sum, 'data-ko');
        en = labelOf(sum, 'data-en') || ko;
      }
      if (!ko) continue;
      list.push({ ko: ko, en: en, el: d });
    }
    return list;
  }

  /* 🔗 딴 페이지로 가는 항목의 손자 — 그 페이지의 «구역 목록» 은 화면에서 읽을 수 없다(다른 문서다).
     adm-ia6.js 가 data-ia6-secs 로 실어 준 것을 그대로 쓴다. 목적지는 주소 뒤 #id.
     ⚠️ 이 목록은 손으로 적은 것이라 어긋날 수 있다 → sidebar_three_level_harness 가 파일을 열어 확인한다. */
  function itemsFromSecs(sub){
    var raw = sub.getAttribute('data-ia6-secs');
    var page = sub.getAttribute('data-ia6-href') || '';
    if (!raw || !page) return [];
    var arr;
    try { arr = JSON.parse(raw); } catch (e) { return []; }
    if (!arr || !arr.length) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++){
      var it = arr[i];
      if (!it || !it.ko || !it.id) continue;
      out.push({ ko: it.ko, en: it.en || it.ko, href: page + '#' + it.id });
    }
    return out;
  }

  /* 카드 제목 — 묶음 항목에서 «카드 자체» 를 손자 한 줄로 세울 때 쓴다.
     ⚠️ 제목이 붙어 있는 자리가 카드마다 다르다. 하나만 보면 대부분 빈 문자열이 나오고,
        그러면 그 항목이 «손자 0개» 로 판정돼 ▸ 가 아예 안 생긴다(2026-08-18 실측:
        「결제」·「직원·권한」이 그렇게 통째로 사라졌다). 세 자리를 순서대로 본다. */
  function cardTitle(card, attr){
    var ko = attr.slice(-2);                                   // 'ko' | 'en'
    var t = card.getAttribute('data-menu-label-' + ko) || '';
    if (!t){
      var sum = card.querySelector(':scope > summary');
      if (sum){
        t = sum.getAttribute(attr) || '';                      // ① summary 자신에 붙은 경우
        if (!t){
          var sp = sum.querySelector('[' + attr + ']');
          t = sp ? (sp.getAttribute(attr) || sp.textContent) : sum.textContent;   // ② 안쪽 span ③ 글자 그대로
        }
      }
    }
    /* ⚠️ labelOf 와 같은 이유로 여기서도 자르지 않는다(자르기는 pretty 가 «보이는 글자» 에만). */
    return String(t).split(/ℹ️|💡|\n/)[0].replace(/\s+/g, ' ').trim();
  }

  /* 🔑 (2026-08-18) 사이드바 한 항목이 카드를 «여러 장» 맡는다 — 새 사이드바(adm-ia6.js)가
     그렇게 묶었다(예: 「직원·권한」 = 권한 설정 + 카페24 명부, 「출결」 = 카드 3장).
     그런데 지금까지 손자는 data-card(=대표 카드 «첫 장») 에서만 나왔다.
     → 사장님 화면에서 「직원·권한」을 펴도 **「카페24 명부」가 목록에 없었다.**
     이제 data-cards(맡은 카드 전부)를 읽는다. 칸이 없는 카드는 «그 카드 자체» 를 한 줄로 세운다
     — 묶음 안에 있는데 목록에 안 보이면 그 카드는 영영 못 찾는다. */
  function itemsForSub(sub){
    /* 🍃 이 항목이 카드 «안의 한 칸» 을 가리키면(=잎) 손자는 **그 칸 안** 에서 읽는다.
       「대표지사」·「지사」·「대리점」·「지사 정산」이 그렇다. 카드 «전체» 를 읽으면 넷이
       똑같은 4줄을 보여 준다(2026-08-18 「중복」 지적) — 그래서 칸 안만 본다. */
    var leafId = sub.getAttribute('data-ia6-sub');
    if (leafId){
      var leaf = document.getElementById(leafId);
      return leaf ? scanLeaf(leaf) : [];
    }

    /* 🔗 카드가 아니라 딴 페이지로 가는 항목 — 그 페이지의 구역들이 손자가 된다. */
    if (sub.getAttribute('data-ia6-secs')) return itemsFromSecs(sub);

    var attr = (sub.getAttribute('data-cards') || '').trim();
    var ids = attr ? attr.split(/\s+/) : (sub.dataset.card ? [sub.dataset.card] : []);
    var out = [];

    /* 📐 (2026-08-18 사장님 «1안» 결정) 손자에는 «이름이 서로 다른 것» 만 올린다.
       ① 항목이 카드를 여러 장 맡으면 → 손자는 그 **카드 이름들**. 카드 안 칸까지 내려가지 않는다.
          내려가면 「결제」가 11줄이 되면서 어느 카드 것인지 알 수 없고, 「자료실」은
          «잠금 해제 / 자료 목록» 이 다섯 번 반복된다(실측).
       ② 항목이 카드 한 장이면 → 그 카드 안 칸들. 그게 유일하게 서로 다른 목적지다. */
    if (ids.length > 1){
      for (var i = 0; i < ids.length; i++){
        var c = document.getElementById(ids[i]);
        if (!c) continue;
        var ko = cardTitle(c, 'data-ko');
        if (ko){
          out.push({ ko: ko, en: cardTitle(c, 'data-en') || ko, el: c, host: ids[i] });
          continue;
        }
        /* 제목이 없는 카드(<div id="card-…"> 로만 된 것)는 이름을 지어낼 수 없다.
           그 카드에 한해 «안의 칸» 으로 대신한다 — 칸에는 이름이 붙어 있다.
           ⛔ 여기서 그냥 건너뛰면 그 카드는 사이드바에서 영영 사라진다. */
        var inner = itemsFor(ids[i], c);
        for (var k = 0; k < inner.length && k < 6; k++){
          var iv = inner[k];
          out.push({ ko: iv.ko, en: iv.en, el: iv.el, anchor: iv.anchor, card: iv.card || ids[i], fn: iv.fn, host: ids[i] });
        }
      }
      return out;
    }

    var id = ids[0];
    var card = id && document.getElementById(id);
    if (!card) return out;
    var list = itemsFor(id, card);
    for (var j = 0; j < list.length; j++){
      var it = list[j];
      out.push({ ko: it.ko, en: it.en, el: it.el, anchor: it.anchor, card: it.card || id, fn: it.fn, host: id });
    }
    return out;
  }

  /* ── ✂️ (2026-08-19 사장님 「손자 메뉴 이름들도 다 보기 좋게 정리해줘」) ─────────────
     손자 이름은 카드 제목·칸 제목에서 «그대로» 가져온다(그게 어긋나지 않는 유일한 방법이다).
     그런데 그 제목들은 «본문에서 읽히려고» 쓴 문장이라 사이드바 한 줄에는 군더더기가 붙는다 —
       · 뒤에 붙은 설명 괄호  「학생 수업 평가 (수업 직후 별 7개)」
       · 뒤에 붙은 설명 줄표  「배정 못 한 결제 아이디 — 대리점 연결」
       · 폼을 여는 「+ 」      「+ 지사 신규 등록」
     실측(43개 항목·146줄): 괄호 설명 24줄 · 16자 초과 14줄 · 잘려서 «…» 로 끝나던 줄 1개.
     한 줄이 길면 사이드바 폭에서 잘리고, 잘리면 «무엇인지 모르는 줄» 이 된다.

     ⚠️ **보이는 글자만** 손질한다. `data-gc-name`(설명 말풍선 사전 GC_DESC 의 조회 키)과
        검색 색인은 «원본 그대로» 둔다 — 그래야 사전·검색이 안 어긋난다
        (CLAUDE.md 「ko 이름은 화면에 적힌 그대로」 함정. 짧게 줄인 이름을 키로 쓰면 조용히 빗나간다).
     ⚠️ 괄호를 뗐더니 형제와 이름이 같아지는 경우가 있다(예: 같은 카드의 «(월간)/(주간)»).
        그때는 **원본을 그대로 쓴다** — 이름이 겹치는 것이 긴 것보다 나쁘다.
     ⛔ 이름을 여기 표로 적어 두지 말 것. 그게 2026-08-18 에 지운 «지어낸 이름» 사고의 뿌리다. */
  function pretty(s){
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    t = t.replace(/^\+\s*/, '');                       // 「+ 지사 신규 등록」 → 「지사 신규 등록」
    t = t.replace(/\s+[—–]\s+.*$/, '');                // 줄표 뒤 부연 설명
    t = t.replace(/\s+[(（][^)）]*[)）]\s*$/, '');       // 뒤에 붙은 설명 괄호(앞에 «띄어쓰기» 가 있는 것만)
    t = t.trim();
    /* 남은 게 너무 짧으면(「(AI)」 만 떼서 두 글자가 되는 식) 원본이 낫다 */
    if (t.length < 2) t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    /* 그래도 긴 줄은 여기서만 자른다 — 사이드바 폭(약 20자)을 넘으면 어차피 화면에서 잘린다.
       화면이 소리 없이 자르면 «어디까지가 이름인지» 모르지만, 「…」 가 있으면 «더 있다» 가 보인다. */
    if (t.length > 20) t = t.slice(0, 19).replace(/[\s(（·]+$/, '') + '…';
    return t;
  }

  /* 한 목록 안에서 «정리한 이름» 이 겹치면 그 줄만 원본으로 되돌린다. */
  function prettyList(items, useEn){
    var raw = items.map(function(it){ return (useEn && it.en) ? it.en : it.ko; });
    var out = raw.map(pretty);
    var count = {};
    out.forEach(function(x){ count[x] = (count[x] || 0) + 1; });
    return out.map(function(x, i){ return count[x] > 1 ? raw[i] : x; });
  }

  var esc = function(s){
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  };

  // ── ▸ 토글 + 손자 컨테이너 만들기 ───────────────────────────────
  function ph125Build(){
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return;
    bar.querySelectorAll('.ph85-sub').forEach(function(sub){
      if (sub.__ph125) return;
      var cardId = sub.dataset.card;
      /* 🔗 (2026-08-19) 카드가 없는 항목도 손자를 가질 수 있다 — 딴 페이지로 가는 항목이다.
         예전엔 여기서 그냥 빠져나가서 그 항목만 «2단짜리» 로 남았다. */
      if (!cardId && !sub.getAttribute('data-ia6-secs')) return;
      var card = cardId ? document.getElementById(cardId) : null;
      if (cardId && !card){
        /* 카드가 아직 안 그려졌을 수 있다 — 몇 번만 다시 본다.
           무한 재시도는 느린 PC(필리핀 가정 회선 포함)에서 그냥 낭비다. */
        sub.__ph125try = (sub.__ph125try || 0) + 1;
        if (sub.__ph125try > 5) sub.__ph125 = true;
        return;
      }
      var items = itemsForSub(sub);
      if (!items.length){
        sub.__ph125try = (sub.__ph125try || 0) + 1;
        if (sub.__ph125try > 5) sub.__ph125 = true;   // 칸이 없는 카드 = «화면 하나». ▸ 를 안 붙인다
        return;
      }
      sub.__ph125 = true;

      if (!sub.querySelector('.ph125-toggle')){
        var toggle = document.createElement('span');
        toggle.className = 'ph125-toggle';
        toggle.textContent = '▸';
        sub.appendChild(toggle);
      }

      var next = sub.nextElementSibling;
      if (!next || !next.classList.contains('ph125-grandchildren')){
        var box = document.createElement('div');
        box.className = 'ph125-grandchildren';
        box.dataset.parent = cardId || '';
        var en = EN();
        var shown = prettyList(items, en);          // ✂️ 보이는 글자만 손질(위 pretty 주석 참고)
        box.innerHTML = items.map(function(it, i){
          /* 🌐 보이는 글자는 화면 언어를 따르고, 설명 사전 조회 키(data-gc-name)는 «항상» 원본 한국어. */
          return '<div class="ph125-gc" data-gc-name="' + esc(it.ko) + '">' +
                   '<span class="ph125-num">' + (i + 1) + '</span>' +
                   '<span class="ph125-text">' + esc(shown[i]) + '</span>' +
                 '</div>';
        }).join('');
        // 목적지를 DOM 참조로 직접 물려 준다 — 문자열 id 를 안 거치므로
        // 같은 id 가 문서에 두 벌 있어도(예: sub-popup-list) 엉뚱한 곳으로 안 간다.
        var gcs = box.children;
        for (var i = 0; i < gcs.length; i++){ gcs[i].__gc = items[i]; gcs[i].__card = items[i].host || cardId; }
        sub.parentNode.insertBefore(box, sub.nextSibling);
      }

      // 🗑️ (2026-07-27 사장님 «메뉴가 자기 멋대로 나왔다 들어갔다») 호버 자동 펼침 제거. 재추가 금지.
      var t = sub.querySelector('.ph125-toggle');
      if (t && !t.__bound){
        t.__bound = true;
        t.addEventListener('click', function(e){
          e.stopPropagation(); e.preventDefault();
          openGc(sub, true);                 // ▸ 는 여닫이 — 접는 방법이 여기 하나뿐이다
        });
      }
    });
  }

  /* 🔀 (2026-08-19) 손자를 여는 곳은 여기 한 곳이다 — ▸ 를 눌러도, 자식 메뉴 글자를 눌러도 같다.
     toggle=true 면 여닫이, false 면 «열기만».

     ⚠️ 처음에는 자식 클릭을 «열기만» 으로 두었다. «두 번 눌렀을 때 방금 편 손자가 사라지면
        「눌렀더니 없어졌다」로 느껴진다» 는 판단이었는데, **실제로 써 보니 반대였다**
        (2026-08-19 사장님 「사이드바 다시 누르면 접혀지지 않아」).
        접는 방법이 ▸ 하나뿐인데 그 글자는 12px 라 특히 휴대폰에서 사실상 못 누른다.
        게다가 그룹(메뉴)과 ▸ 는 여닫이인데 «자식만» 아니라서 더 헷갈렸다.
        → 세 단계 모두 «다시 누르면 접힌다» 로 통일한다. */
  function openGc(sub, toggle){
    var bar = document.getElementById('ph85-sidebar');
    var box = sub.nextElementSibling;
    if (!bar || !box || !box.classList.contains('ph125-grandchildren')) return;
    bar.querySelectorAll('.ph85-sub.ph125-open').forEach(function(s){
      if (s !== sub) { s.classList.remove('ph125-open'); fitBox(s); }
    });
    if (toggle) sub.classList.toggle('ph125-open');
    else sub.classList.add('ph125-open');
    fitBox(sub);
    keepGroupOpen(sub);
  }

  /* 🪤 자식 메뉴를 누르면 adm-s11.js(ph97) 가 «모든 그룹 접기» 를 한다 —
     원래 그 클릭은 «카드로 이동» 이라 사이드바를 정리하는 것이 맞았다. 그런데 이제 같은 클릭이
     손자를 여는 클릭이기도 해서, 그대로 두면 방금 편 손자가 그룹째 접혀 사라진다
     — 쓰는 사람에게는 «눌러도 아무 일이 없다» 로 보인다.
     ph97 은 window 캡처에서 우리보다 «먼저» 돌므로(문서상 adm-s11 이 위) 여기서 되돌리면 된다.
     ⚠️ 그래도 뒤늦게 접는 코드가 있을 수 있어 다음 틱에 한 번 더 확인한다. 손자를 접어 두었으면
        (ph125-open 이 없으면) 아무 일도 하지 않는다 — 예전 «누르면 정리» 동작 그대로다. */
  function keepGroupOpen(sub){
    var g = sub.closest ? sub.closest('.ph85-group') : null;
    if (!g) return;
    /* ⚠️ 예전에는 «손자가 펴져 있을 때만» 되살렸다. 그랬더니 손자를 «접는» 클릭에서
       ph97 의 그룹 접기가 그대로 살아, 손자만 접으려 했는데 **그룹째 접혀** 메뉴가 통째로
       사라졌다(2026-08-19 여닫이로 바꾸자마자 실측: 그룹열림 true → false).
       자식을 누르는 행동은 «그 그룹 안에서 뭔가를 하는 것» 이므로, 열고 닫고와 무관하게
       그룹은 열어 둔다. 그룹을 접는 것은 그룹 머리를 누르는 «다른 클릭» 이고 여기 안 걸린다. */
    var again = function(){ g.classList.add('open'); };
    again();
    setTimeout(again, 0);
    setTimeout(again, 120);
  }

  /* 📏 (2026-08-18) 「▸ 를 눌렀는데 손자가 안 보인다」의 두 번째 원인 — **잘림**.
       CSS 가 두 곳에서 높이를 자른다. 둘 다 `overflow:hidden` 이라 넘친 부분은 «없는 것» 이 된다.
         · 손자 상자          `.ph125-grandchildren` … 열렸을 때 max-height 600px
           → 회계관리 손자 19개는 713px 다. 아래 3개가 잘려 있었다(실측).
         · 그룹 목록          `.ph85-subs`          … 열렸을 때 max-height 900px
           → 손자를 펴면 그룹 내용이 그만큼 길어져, 아래쪽 항목이 통째로 잘린다.
       상한 숫자를 키우는 방법은 쓰지 않는다 — 그 주석이 설명하듯 상한이 클수록 «닫는데 반응이
       없는 시간» 이 길어지고, 언젠가 또 넘친다. 대신 **열 때만 실제 내용 높이를 넣는다.**
       ⚠️ CSS 가 !important 라 `style.maxHeight=` 로는 못 이긴다. setProperty(...,'important') 필수. */
  function fitBox(sub){
    var box = sub.nextElementSibling;
    if (!box || !box.classList.contains('ph125-grandchildren')) return;
    var open = sub.classList.contains('ph125-open');
    if (open) box.style.setProperty('max-height', box.scrollHeight + 'px', 'important');
    else      box.style.removeProperty('max-height');

    var subs = sub.parentElement;                       // .ph85-subs (그룹 목록)
    if (!subs || !subs.classList.contains('ph85-subs')) return;
    if (open) subs.style.setProperty('max-height', (subs.scrollHeight + box.scrollHeight + 24) + 'px', 'important');
    else      subs.style.removeProperty('max-height');
  }

  function flash(el){
    el.classList.remove('ph96-highlight');
    void el.offsetWidth;
    el.classList.add('ph96-highlight');
    setTimeout(function(){ el.classList.remove('ph96-highlight'); }, 1600);
  }

  /* 「눌렀는데 그 화면이 안 보인다」를 없애는 곳 —
     ① 모바일 드로어를 «스크롤보다 먼저» 닫는다. 드로어가 열린 동안 body 는 overflow:hidden 이라
        그 상태에서 scrollIntoView 를 부르면 브라우저가 통째로 무시한다(adm-s11 에서 밟은 함정).
     ② 목적지 칸을 펴고, 같은 줄의 형제 칸은 접는다 — 그래야 그 칸이 «맨 위» 로 온다.
     ③ 카드 이동은 jumpToMenu 에 맡긴다(급여 접근제어·legacy-cards 표시·공지 탭 전환이 거기 있다). */
  function closeDrawer(){
    window.__ph125OpenedUntil = 0;        // «방금 폈다» 표시를 거둔다 — 이제는 닫고 이동할 차례다
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    var sb = document.getElementById('ph85-sidebar');
    if (sb) sb.classList.remove('open');
    try { if (typeof window.mgaClose === 'function') window.mgaClose(); } catch(e){}
    document.body.classList.remove('mga-open');
  }

  function reveal(card, target){
    var p = target;
    while (p && p !== card){ if (p.tagName === 'DETAILS') p.open = true; p = p.parentElement; }
    if (card.tagName === 'DETAILS') card.open = true;
    if (target.tagName === 'DETAILS'){
      target.open = true;
      var par = target.parentElement;
      /* 🔴 (2026-09-18 v=24 — trap-check 실측으로 발견) 이 형제 자동닫기는 예전부터 있었지만
         admin-inline-c.css v=81 이전에는 <details>{display:block!important} 가 open 속성과
         무관하게 늘 펴서 그려서 «닫아도 안 보이지 않는» 상태라 무해했다. v=81 로 native
         open/closed 를 실제로 존중하게 되돌리자 이 줄이 처음으로 «진짜로 닫는» 일을 하게
         됐고, 그 결과 회계 「배정 못 한 결제/B2B/지출분류」 3형제(acc-payer-box·acc-b2b-box·
         acc-payee-box, 전부 class="sub-item")를 사이드바 손자로 하나 열 때마다 나머지 둘이
         닫혔다 — admin.html 이 그 셋에 open 속성을 남겨 «동시 열람»을 예외로 지켜 두려던
         것과 정반대로 깨졌다(실측: window.ph125Jump 로 하나를 열면 둘이 자동으로 닫힘).
         ⛔ 이 자동닫기 자체를 지우지 않는다 — 등록 폼/엑셀 일괄 등록처럼 «하나만 보여야
         하는» 형제 쌍에는 그대로 필요하다(admin-inline-c.css 3138행 주석 참고).
         ✅ 그래서 «동시에 열려 있어야 한다»고 admin.html 이 표시해 둔 요소만 예외로 둔다 —
         data-keep-open 속성이 있으면 건너뛴다(acc-payer-box·acc-b2b-box·acc-payee-box 셋에
         붙여 뒀다). 새로 «동시 열람» 예외를 만들 때는 그 요소에 이 속성을 붙이면 된다. */
      if (par) [].forEach.call(par.children, function(x){
        if (x !== target && x.tagName === 'DETAILS' && x.classList.contains('sub-item') && !x.hasAttribute('data-keep-open')) x.open = false;
      });
    }
    /* 🪤 (2026-08-18 main) <details> 조상만 펴는 것으로는 모자란다.
       「공지 스튜디오」는 탭 두 개(div.ns-panel[data-nspanel])이고 안 고른 쪽은 display:none 이다.
       숨은 상자에 scrollIntoView 를 해도 화면은 꿈쩍도 안 한다 — 에러도 안 난다.
       그래서 목적지가 어느 탭 안인지 보고, 그 탭을 먼저 켠다. */
    var panel = target.closest ? target.closest('[data-nspanel]') : null;
    if (panel && typeof window.noticeStudioTab === 'function') {
      try { window.noticeStudioTab(panel.getAttribute('data-nspanel')); } catch(e) { /* 무시 */ }
    }
    target.scrollIntoView({ behavior:'auto', block:'start' });
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      target.scrollIntoView({ behavior:'auto', block:'start' });   // 카드가 펴지며 높이가 변한 뒤 재보정
      flash(target);
    }); });
  }

  /* 🔁 (2026-08-19 사장님 「손자 메뉴도 다시 누르면 접히게」) 마지막으로 연 손자와 그 칸.
     손자는 사이드바의 마지막 단계라 «그 밑에» 접을 것이 없다 — 대신 누르면 본문의 «그 칸» 이 열린다.
     그래서 «다시 누르면 접힌다» 는 그 칸에 적용한다. 그룹·자식과 규칙이 이어진다.
     ⚠️ «같은 손자를 연속으로» 누른 경우만 접는다. 다른 데를 보다가 돌아와서 누른 것은
        「보러 온 것」이므로 접으면 안 된다(스크롤이 안 맞아 한 번 더 누르는 일도 흔하다). */
  var lastGo = null;

  function go(cardId, desc){
    closeDrawer();                                   // ① 먼저 닫는다
    /* 🔗 딴 페이지의 구역 — 주소 뒤 #id 로 그 구역까지 바로 간다(브라우저가 스크롤해 준다).
       enroll-ops.html 처럼 탭 하나만 그리는 화면은 그 파일이 해시를 보고 탭을 켠다. */
    if (desc.href) { lastGo = null; location.href = desc.href; return; }

    /* ② 같은 손자를 다시 눌렀고 그 칸이 열려 있으면 → 접는다(이동·스크롤 없이 여기서 끝).
       ⚠️ 접을 수 있는 것은 <details> 인 칸뿐이다. 표·구역 이름표(data-gc)처럼 접이식이 아닌
          목적지는 접을 것이 없으므로 예전처럼 «그리로 이동» 만 한다. */
    var prev = (lastGo && lastGo.desc === desc) ? lastGo.target : null;
    if (prev && prev.tagName === 'DETAILS' && prev.open) {
      prev.open = false;
      lastGo = null;
      return;
    }

    var hostId = desc.card || cardId;
    if (typeof window.jumpToMenu === 'function') window.jumpToMenu(hostId);
    var card = document.getElementById(hostId);
    if (!card) { alert('카드 미구현: ' + hostId); return; }
    setTimeout(function(){
      if (desc.fn && typeof window[desc.fn] === 'function'){ lastGo = null; window[desc.fn](); return; }
      var t = desc.el || (desc.anchor ? document.getElementById(desc.anchor) : null);
      lastGo = { desc: desc, target: t || card };     // 다음 클릭에서 «같은 곳인가» 를 본다
      reveal(card, t || card);
    }, 120);                                          // jumpToMenu 의 rAF 재보정(≈32ms) 뒤에 온다
  }

  /* 👆 (2026-08-19 사장님) 「자식 메뉴를 누르면 손자 메뉴가 나오게 — 모든 메뉴를 이렇게」
     지금까지는 **▸ 를 정확히 눌러야만** 열렸다. ▸ 는 12px 짜리 글자라 휴대폰에서는 거의 못 누르고,
     자식 메뉴 글자를 누르면 카드로 이동만 하고 손자는 안 나왔다.
     ⚠️ 이동을 막지 않는다 — 여기서 stopPropagation 을 부르면 ph97·adm-ia6 가 굶어
        «눌러도 화면이 안 바뀐다» 가 된다. 우리는 «펴는 일» 만 더한다.
     ⚠️ window 캡처여야 한다. 사이드바에 걸면 ph97 의 stopPropagation 에 막혀 영영 안 불린다
        (CLAUDE.md 2장 「사이드바 클릭이 안 먹거나 엉뚱하게 동작」). */
  window.addEventListener('click', function(e){
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#ph85-sidebar .ph125-toggle')) return;   // ▸ 는 자기 리스너가 «여닫이» 로 처리
    if (t.closest('#ph85-sidebar .ph125-gc')) return;       // 손자 자신을 누른 것
    var sub = t.closest('#ph85-sidebar .ph85-sub');
    if (!sub) return;
    var box = sub.nextElementSibling;
    if (!box || !box.classList.contains('ph125-grandchildren')) return;

    /* 📱 휴대폰 — 드로어를 «닫지 않는다».
       세 곳이 자식 메뉴 클릭에 드로어를 닫는다(ph97 · adm-ia6 · admin.html 의 pointerdown 감시).
       그건 그 클릭이 «카드로 이동» 이던 시절의 규칙이다. 이제는 같은 클릭이 손자를 여는
       클릭이라, 닫아 버리면 **방금 편 손자를 아무도 못 본다.**
       ⛔ 그렇다고 그 세 곳을 «항상 안 닫게» 만들면 안 된다 — 손자를 골라 화면으로 갈 때는
          반드시 닫아야 한다(닫기 전에는 body 가 overflow:hidden 이라 스크롤이 통째로 무시된다).
       ✅ 그래서 «지금 여는 중» 이라는 표시를 짧게 남기고, 그 셋은 그 표시가 있을 때만 건너뛴다.
       ⚠️ 이미 펴져 있는 자식을 한 번 더 누르면 표시를 남기지 않는다 — 두 번째 누름은
          「이 화면으로 가겠다」는 뜻이므로 예전처럼 닫히고 카드로 간다. */
    /* 이미 펴져 있으면 이번 누름은 «접기» 다 — 표시를 세우지 않는다.
       그래서 휴대폰에서는 접히면서 드로어도 닫히고 카드로 이동한다(예전 두 번째 누름과 같다). */
    var already = sub.classList.contains('ph125-open');
    if (!already){
      /* 🔖 «방금 폈다» 표시. 두 곳이 이걸 본다 —
           📱 드로어를 닫는 세 곳(ph97 · adm-ia6 · admin.html) → 닫지 않는다
           🔗 딴 페이지로 가는 항목(adm-ia6 의 select) → 이동을 한 박자 미룬다.
              안 미루면 「수업 길이 변경」·「수강 운영」은 손자를 보여 줄 새도 없이 페이지가 바뀐다. */
      window.__ph125OpenedEl = sub;
      window.__ph125OpenedUntil = Date.now() + 800;
      if (window.matchMedia('(max-width: 1023px)').matches){
        try { if (typeof window.mgaOpen === 'function') window.mgaOpen(); } catch(e){}
      }
    }
    openGc(sub, true);          // 다시 누르면 접힌다 — 그룹·▸ 와 같은 규칙(위 주석 참고)
  }, true);

  /* 🧹 (2026-08-19) 그룹(메뉴)을 접으면 그 안에 펴 둔 손자도 같이 접는다.
     안 그러면 그룹만 접혔다가 다시 펼 때 손자가 그대로 펼쳐진 채 나와서
     「접었는데 안 접힌다」로 보인다(사장님 제보의 두 번째 갈래).
     ⚠️ 접기는 ph97 이 «그 다음에» 하므로 클래스를 곧바로 읽으면 아직 열려 있다.
        다음 틱에 «정말 접혔는지» 보고 나서 손자를 접는다. */
  window.addEventListener('click', function(e){
    var t = e.target;
    if (!t || !t.closest) return;
    var head = t.closest('#ph85-sidebar .ph85-head');
    if (!head) return;
    var g = head.closest('.ph85-group');
    if (!g) return;
    setTimeout(function(){
      if (g.classList.contains('open')) return;          // 편 것이면 건드리지 않는다
      g.querySelectorAll('.ph85-sub.ph125-open').forEach(function(s){
        s.classList.remove('ph125-open'); fitBox(s);
      });
    }, 30);
  }, true);

  // 손자 클릭 — 위임 한 곳에서 받는다(항목마다 onclick 문자열을 안 만들어 그만큼 가볍다)
  document.addEventListener('click', function(e){
    var gcEl = e.target.closest && e.target.closest('#ph85-sidebar .ph125-gc');
    if (!gcEl || !gcEl.__gc) return;
    e.stopPropagation(); e.preventDefault();
    go(gcEl.__card, gcEl.__gc);
  }, true);

  /* 옛 이름 유지 — 다른 화면(퀵메뉴·안내)이 부를 수 있다. 이제 «위치로 찾아감» 은 하지 않는다. */
  window.ph125Jump = function(cardId, idx){
    var card = document.getElementById(cardId);
    if (!card) { alert('카드 미구현: ' + cardId); return; }
    var items = itemsFor(cardId, card);
    if (items[idx]) go(cardId, items[idx]);
    else { closeDrawer(); if (typeof window.jumpToMenu === 'function') window.jumpToMenu(cardId); }
  };

  /* ── 🔍 손자를 통합 검색에 색인 ─────────────────────────────────────
     「출결」이라 치면 카드가 아니라 «그 안의 출결 칸» 이 바로 뜨게 한다.
     _globalSearchIndex 는 adm-core.js 의 최상위 let — classic script 끼리는
     전역 렉시컬 스코프를 공유하므로 여기서 그대로 읽고 쓸 수 있다(window 에는 없다).
     buildMenuIndex 가 색인을 통째로 다시 만들므로(RBAC 갱신 때마다), 우리 항목은
     _gc 표식을 달아 두고 매번 «지우고 다시 넣는» 방식으로 어긋남을 막는다. */
  function indexGc(){
    try {
      if (typeof _globalSearchIndex === 'undefined' || !Array.isArray(_globalSearchIndex)) return;
      var bar = document.getElementById('ph85-sidebar');
      if (!bar) return;
      var fresh = [];
      bar.querySelectorAll('.ph125-grandchildren').forEach(function(box){
        var sub = box.previousElementSibling;
        if (!sub || !sub.classList.contains('ph85-sub')) return;
        if (sub.classList.contains('rbac-hide')) return;        // 역할로 감춘 메뉴는 검색에도 안 띄움
        var pKo = (sub.getAttribute('data-ko') || sub.textContent || '').replace(/\s+/g,' ').trim();
        var pEn = (sub.getAttribute('data-en') || pKo).replace(/\s+/g,' ').trim();
        [].forEach.call(box.children, function(gcEl){
          var d = gcEl.__gc, cid = gcEl.__card;
          if (!d) return;
          fresh.push({
            _gc: true, kind: 'menu',
            kindLabelKo: '📂 하위 메뉴', kindLabelEn: '📂 Sub-menu',
            label: d.ko, labelEn: d.en || d.ko,
            sub: pKo, subEn: pEn,
            action: (function(c, item){ return function(){ go(c, item); }; })(cid, d)
          });
        });
      });
      _globalSearchIndex = _globalSearchIndex.filter(function(x){ return !x._gc; }).concat(fresh);
    } catch(e) { /* 검색 색인은 부가 기능 — 실패해도 손자 메뉴 자체는 동작해야 한다 */ }
  }

  function buildAndIndex(){ ph125Build(); indexGc(); }

  // buildMenuIndex(RBAC 갱신·언어 전환 뒤 재실행됨)가 색인을 갈아엎은 «뒤» 우리 것을 다시 얹는다
  (function wrapBMI(){
    var tries = 0;
    var t = setInterval(function(){
      if (typeof window.buildMenuIndex === 'function'){
        clearInterval(t);
        var orig = window.buildMenuIndex;
        window.buildMenuIndex = function(){ var r = orig.apply(this, arguments); indexGc(); return r; };
      } else if (++tries > 40) clearInterval(t);
    }, 250);
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildAndIndex);
  else buildAndIndex();
  (window.__admSettleRun ? window.__admSettleRun(buildAndIndex) : setInterval(buildAndIndex, 1500));

  console.log('[ph125] 손자 메뉴 — 카드 안 실제 칸을 읽어 그림(▸ 클릭 토글)');
})();
