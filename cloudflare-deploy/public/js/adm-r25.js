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
      { ko:'📅 학원 전체 스케줄',   en:'📅 All Schedules',    anchor:'sm-all-schedules' },
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
    t = String(t).split(/ℹ️|💡|\n/)[0].replace(/\s+/g, ' ').trim();
    if (t.length > 26) t = t.slice(0, 25) + '…';
    return t;
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

  /* 카드 제목 — 묶음 항목에서 «카드 자체» 를 손자 한 줄로 세울 때 쓴다. */
  function cardTitle(card, attr){
    var sp = card.querySelector(':scope > summary [' + attr + '], :scope > summary span');
    var t = (sp && (sp.getAttribute(attr) || sp.textContent)) || card.getAttribute('data-menu-label-' + attr.slice(-2)) || '';
    t = String(t).split(/ℹ️|💡|\n/)[0].replace(/\s+/g, ' ').trim();
    if (t.length > 26) t = t.slice(0, 25) + '…';
    return t;
  }

  /* 🔑 (2026-08-18) 사이드바 한 항목이 카드를 «여러 장» 맡는다 — 새 사이드바(adm-ia6.js)가
     그렇게 묶었다(예: 「직원·권한」 = 권한 설정 + 카페24 명부, 「출결」 = 카드 3장).
     그런데 지금까지 손자는 data-card(=대표 카드 «첫 장») 에서만 나왔다.
     → 사장님 화면에서 「직원·권한」을 펴도 **「카페24 명부」가 목록에 없었다.**
     이제 data-cards(맡은 카드 전부)를 읽는다. 칸이 없는 카드는 «그 카드 자체» 를 한 줄로 세운다
     — 묶음 안에 있는데 목록에 안 보이면 그 카드는 영영 못 찾는다. */
  function itemsForSub(sub){
    var attr = (sub.getAttribute('data-cards') || '').trim();
    var ids = attr ? attr.split(/\s+/) : (sub.dataset.card ? [sub.dataset.card] : []);
    var multi = ids.length > 1;
    var out = [];
    for (var i = 0; i < ids.length; i++){
      var id = ids[i];
      var card = document.getElementById(id);
      if (!card) continue;
      var list = itemsFor(id, card);
      if (list.length){
        for (var j = 0; j < list.length; j++){
          var it = list[j];
          out.push({ ko: it.ko, en: it.en, el: it.el, anchor: it.anchor, card: it.card || id, fn: it.fn, host: id });
        }
      } else if (multi){
        var ko = cardTitle(card, 'data-ko');
        if (ko) out.push({ ko: ko, en: cardTitle(card, 'data-en') || ko, el: card, host: id });
      }
      if (out.length >= 24) break;      // 한 항목이 사이드바를 다 먹지 않게
    }
    return out;
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
      if (!cardId) return;
      var card = document.getElementById(cardId);
      if (!card){
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
        box.dataset.parent = cardId;
        var en = EN();
        box.innerHTML = items.map(function(it, i){
          /* 🌐 보이는 글자는 화면 언어를 따르고, 설명 사전 조회 키(data-gc-name)는 «항상» 한국어. */
          return '<div class="ph125-gc" data-gc-name="' + esc(it.ko) + '">' +
                   '<span class="ph125-num">' + (i + 1) + '</span>' +
                   '<span class="ph125-text">' + esc((en && it.en) ? it.en : it.ko) + '</span>' +
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
          bar.querySelectorAll('.ph85-sub.ph125-open').forEach(function(s){
            if (s !== sub) { s.classList.remove('ph125-open'); fitBox(s); }
          });
          sub.classList.toggle('ph125-open');
          fitBox(sub);
        });
      }
    });
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
      if (par) [].forEach.call(par.children, function(x){
        if (x !== target && x.tagName === 'DETAILS' && x.classList.contains('sub-item')) x.open = false;
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

  function go(cardId, desc){
    closeDrawer();                                   // ① 먼저 닫는다
    var hostId = desc.card || cardId;
    if (typeof window.jumpToMenu === 'function') window.jumpToMenu(hostId);
    var card = document.getElementById(hostId);
    if (!card) { alert('카드 미구현: ' + hostId); return; }
    setTimeout(function(){
      if (desc.fn && typeof window[desc.fn] === 'function'){ window[desc.fn](); return; }
      var t = desc.el || (desc.anchor ? document.getElementById(desc.anchor) : null);
      reveal(card, t || card);
    }, 120);                                          // jumpToMenu 의 rAF 재보정(≈32ms) 뒤에 온다
  }

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
