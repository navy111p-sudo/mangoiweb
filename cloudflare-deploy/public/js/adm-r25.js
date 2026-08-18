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
    'card-eval-mgmt':           ['평가서 작성 폼','템플릿 선택','학생별 평가 이력','평가 통계','평가서 PDF 출력'],
    'card-bulk-eval':           ['일괄 평가 폼','학생 그룹 선택','일괄 발송','진행 상황'],
    'card-ai-lesson-report':    ['AI 리포트 생성','음성 STT 검토','자동 요약 편집','학부모 발송'],
    'card-ai-eval-draft':       ['초안 생성','수정·다듬기','승인·확정','발송'],
    'card-monthly-report':      ['이번달 리포트','지난달 비교','커리큘럼 진도','출석 통계'],
    'card-comparison-report':   ['학생 간 비교','기간별 추이','학원 평균 대비','학년별 분포'],
    'card-webpush-mgmt':        ['VAPID 키 관리','구독자 목록','푸시 발송','발송 이력'],
    'card-kakao-mgmt':          ['SOLAPI 설정','템플릿 등록','발송 이력','발송 통계'],
    'card-popups-mgmt':         ['신규 팝업','노출 일정','대상 선택','클릭률'],
    'card-poster-maker':        ['새 포스터','크기·동영상','저장 목록','다시 사용'],
    'card-notifications':       ['이벤트 등록','수신자 그룹','발송 예약','수신 확인'],
    'card-notice-board':        ['공지 작성','대상 선택','상단 고정','댓글 관리'],
    'card-teacher-mgmt':        ['강사 정보 등록','강사 목록','평가·평점','수업 배정'],
    'card-payroll-auto':        ['자동 정산 설정','결산 미리보기','지급 일정','지급 이력'],
    'card-payroll':             ['이번달 급여','지급 내역','수정·조정','정산서 PDF'],
    'card-mbti-mgmt':           ['MBTI 등록','강사 매칭','학생 추천','분석 리포트'],
    'card-praise-stats':        ['이번주 칭찬','강사별 통계','학생별 받은 칭찬','월별 추이'],
    'card-supervisor':          ['멘토 배정','라이브 참관','노트 보내기','우선노트'],
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
    /* 💰 회계관리 (2026-08-18 사장님 제보 «손익/재무제표가 메뉴에서 안 보인다») —
       이 카드의 하위칸은 16개다. 그런데 여기 이름 넷은 문자열이라 옛 방식(«카드 안 N번째 details»)으로
       점프했고, 그 순서가 실제와 달랐다:
         3 법인카드   → 실제로는 «🧾 강사 급여 / 정산» 이 열렸고
         4 손익·재무  → 실제로는 «🌍 국가별 강사료 환전 / 🏢 지점·가맹점 정산» 근처가 열렸다.
       손익/재무제표는 16칸 중 13번째라 손으로 찾으려면 한참 스크롤해야 한다 → «메뉴에 없다» 로 보인다.
       card-students-mgmt 와 같은 방식(앵커 객체)으로 «진짜 목적지» 를 들려 보낸다.
       ⚠️ anchor id 는 admin.html 의 그 <details> 에 달려 있다. 한쪽만 바꾸면 조용히 옛 방식으로
          되돌아가 또 엉뚱한 칸이 열린다(에러가 안 나서 알아채기 어렵다).
       ⚠️ ko 이름은 바꾸지 말 것 — 손자 메뉴 설명 사전(admin-tip-i18n.js)이 이 이름을 키로 쓴다. */
    'card-accounting-mgmt':     [
      { ko:'수강료 미납', en:'Unpaid Tuition',    anchor:'sub-overdue' },
      { ko:'학생 결제',   en:'Student Payments',  anchor:'acc-student-payments' },
      { ko:'법인카드',    en:'Corporate Card',    anchor:'acc-corpcard' },
      { ko:'손익·재무',   en:'P&L · Financials',  anchor:'acc-financials' }
    ],
    'card-payments-b2b':        ['거래 내역','거래 통계','수수료 정산','CSV 다운로드'],
    'card-payments-b2c':        ['주문 내역','매출 통계','세금계산서','환불 처리'],
    'card-recurring-billing':   ['정기 구독자','결제 예정','실패 처리','구독 변경'],
    'card-auto-dunning':        ['미납 자동 알림','독촉 일정','연체율','회수 이력'],
    'card-settlement-stats':    ['일별 정산','대리점별','상품별','수수료별'],
    'card-points-mgmt':         ['포인트 충전','적립 내역','사용 내역','만료 관리'],
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
      { ko:'💭 단체 메시지',        en:'💭 Bulk Message',     anchor:'sm-bulk-msg' }
    ],
    'card-family-mgmt':         ['가족 그룹','형제자매 묶기','가족 할인','연락처 통합'],
    'card-inquiry-mgmt':        ['신규 문의','진행 중','종결','전환율'],
    'card-enrollments':         ['이번달 등록','대기자','휴학 처리','재등록'],
    'card-badges-mgmt':         ['뱃지 발급','뱃지 디자인','학생별 보유','이벤트 뱃지'],
    'card-community':           ['게시판','댓글 관리','신고 처리','공지'],
    'card-counseling-booking':  ['상담 예약','상담 일정','상담 이력','후속 조치'],
    'card-parent-digest':       ['주간 요약','월간 요약','이메일 발송','학부모 반응'],
    'card-parent-faq-bot':      ['FAQ 등록','자주 묻는 질문','학부모 답변','챗봇 학습'],
    'card-referral':            ['추천 코드 발급','추천 통계','보상 지급','이벤트'],
    'card-alumni':              ['졸업생 등록','졸업생 목록','멘토 활동','동문 게시판'],
    'card-gallery':             ['사진 업로드','자녀별 앨범','월별 하이라이트','졸업 앨범'],
    'card-school-attendance-stats': ['전체 출석률','학원별 통계','위험군 알림','월별 비교'],
    'card-textbooks':           ['교재 목록','단원 관리','학습 진도','과제'],
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
    'card-permissions':         ['역할 관리','메뉴 권한','데이터 권한','감사 로그'],
    'card-franchises':          ['가맹점 목록','신규 가맹','계약 관리','로열티 정산'],
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
          return '<div class="ph125-gc" data-gc-name="' + attr + '" onclick="event.stopPropagation();ph125Jump(\'' + cardId + '\',' + i + ',\'' + safe + '\')">' +
            '<span class="ph125-num">' + (i + 1) + '</span>' +
            '<span class="ph125-text">' + t + '</span>' +
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
  (window.__admSettleRun ? window.__admSettleRun(ph125Build) : setInterval(ph125Build, 1500));

  console.log('[ph125] 인라인 아코디언 손자 메뉴 활성 — 호버 자동 펼침 + ▸ 클릭 토글');
})();
