// ═══════════════════════════════════════════════════════════════
// adm-q11.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // === 카드별 손자 메뉴 데모 매핑 (실제 카드에 sub-item 없어도 의미 있는 메뉴 표시) ===
  var GRANDCHILDREN_MAP = {
    'card-eval-mgmt':           ['평가서 작성 폼','템플릿 선택','학생별 평가 이력','평가 통계','평가서 PDF 출력'],
    'card-bulk-eval':           ['일괄 평가 폼','학생 그룹 선택','일괄 발송','진행 상황 추적'],
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
    'card-supervisor':          ['멘토 배정','라이브 참관 (Ghost)','노트 보내기','우선노트'],
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

    'card-accounting-mgmt':     ['수강료 미납','학생 결제','법인카드','손익·재무'],
    'card-payments-b2b':        ['거래 내역','거래 통계','수수료 정산','CSV 다운로드'],
    'card-payments-b2c':        ['주문 내역','매출 통계','세금계산서 발행','환불 처리'],
    'card-recurring-billing':   ['정기 구독자','결제 예정','실패 처리','구독 변경'],
    'card-auto-dunning':        ['미납 자동 알림','독촉 일정','연체율','회수 이력'],
    'card-settlement-stats':    ['일별 정산','대리점별','상품별','수수료별'],
    'card-points-mgmt':         ['포인트 충전','적립 내역','사용 내역','만료 관리'],

    'card-students-mgmt':       ['학생 등록·검색','학생 상세 프로필','학생 그룹 관리','학년별 통계','비활성 학생'],
    'card-family-mgmt':         ['가족 그룹','형제자매 묶기','가족 할인','연락처 통합'],
    'card-inquiry-mgmt':        ['신규 문의','진행 중','종결','전환율'],
    'card-enrollments':         ['이번달 등록','대기자','휴학 처리','재등록'],
    'card-badges-mgmt':         ['뱃지 발급','뱃지 디자인','학생별 보유','이벤트 뱃지'],
    'card-community':           ['게시판','댓글 관리','신고 처리','공지'],
    'card-counseling-booking':  ['상담 예약 신청','상담 일정','상담 이력','후속 조치'],
    'card-parent-digest':       ['주간 요약','월간 요약','이메일 발송','학부모 반응'],
    'card-parent-faq-bot':      ['FAQ 등록','자주 묻는 질문','학부모 답변','챗봇 학습'],
    'card-referral':            ['추천 코드 발급','추천 통계','보상 지급','이벤트'],
    'card-alumni':              ['졸업생 등록','졸업생 목록','멘토 활동','동문 게시판','수신노트','Ghost View'],
    'card-gallery':             ['사진 업로드','자녀별 앨범','월별 하이라이트','졸업 앨범'],
    'card-school-attendance-stats': ['전체 출석률','학원별 통계','위험군 학부모 알림','월별 비교'],

    'card-textbooks':           ['교재 목록','단원 관리','학습 진도','과제'],
    'card-microlearn':          ['오늘의 학습','진도 추적','퀴즈','복습'],
    'card-review-quiz':         ['퀴즈 출제','문항 작성','응시 결과','복습퀴즈'],
    'card-mini-toeic':          ['모의고사','오답 노트','진도','등급'],
    'card-pronunciation':       ['발음 평가','녹음 보관','AI 채점','학습 가이드'],
    'card-video-dict':          ['영상 사전','단어 검색','자막 학습','즐겨찾기'],
    'card-voice-diary':         ['오늘 일기','녹음 보관','AI 첨삭','월간 모음'],
    'card-level-tests':         ['레벨 테스트 응시','결과 조회','레벨 변경','히스토리'],
    'card-battle-mgmt':         ['오늘의 배틀','리그 운영','순위','뱃지'],
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
    'card-auto-attendance':     ['QR 생성','스캔 이력','출결 자동 기록','부정 출결 감지'],
    'card-class-attendance':    ['수업별 출결','강사 체크인','지각·결석','학부모 알림']
  };

  // 기존 getGrandchildren override — 데모 매핑 우선, 없으면 DOM 추출 fallback
  var origGetGrandchildren = window.__ph123_getGrandchildren;

  // ph123의 showFlyout 이 호출하는 getGrandchildren 를 우리 새 버전으로 교체
  // (ph123 코드가 클로저 안이라 직접 override 어려움 → DOM 호버 이벤트 자체를 재바인딩)

  // 기존 ph123 호버 핸들러 제거 후 새 핸들러 부착
  var flyout = null;
  var hideTimer = null;
  var showTimer = null;   // 호버 의도 지연 — 커서가 스쳐 지나가면 안 열리게
  var currentSub = null;

  function getGrandchildrenV2(cardId, subTitle){
    // 1순위: 데모 매핑
    if (GRANDCHILDREN_MAP[cardId]) {
      return GRANDCHILDREN_MAP[cardId].map(function(t, i){
        return { idx: i, title: t, demo: true };
      });
    }
    // 2순위: DOM 에서 details 추출
    var card = document.getElementById(cardId);
    if (!card) return [];
    var items = [];
    card.querySelectorAll('details.sub-item, .sub-menu > details, .menu-body > details, .sub-body > details').forEach(function(item, idx){
      var summary = item.querySelector(':scope > summary');
      if (summary) {
        items.push({ idx: idx, title: summary.textContent.trim().substring(0, 50), element: item });
      }
    });
    // 3순위: h3/h4 헤더
    if (items.length === 0) {
      card.querySelectorAll('h3, h4').forEach(function(h, idx){
        items.push({ idx: idx, title: h.textContent.trim().substring(0, 50), header: true });
      });
    }
    return items;
  }

  function showFlyoutV2(subEl){
    var cardId = subEl.dataset.card;
    if (!cardId) return;
    var subTitle = subEl.textContent.trim().replace(/⭐신규$/, '').trim();
    var grandchildren = getGrandchildrenV2(cardId, subTitle);

    if (currentSub) currentSub.classList.remove('ph123-active');
    subEl.classList.add('ph123-active');
    currentSub = subEl;

    if (flyout) { flyout.remove(); flyout = null; }

    var rect = subEl.getBoundingClientRect();
    flyout = document.createElement('div');
    flyout.id = 'ph123-flyout';

    var headerHtml = '<div class="ph123-header">' +
      '🧭 ' + subTitle +
      '<div class="ph123-header-sub">손자 메뉴 ' + grandchildren.length + '개</div>' +
    '</div>';

    var directHtml = '<a class="ph123-direct" onclick="ph124JumpCard(\'' + cardId + '\')">📂 카드 전체 열기</a>';

    var listHtml = '';
    if (grandchildren.length === 0) {
      listHtml = '<div class="ph123-empty">하위 항목 매핑 없음 — "카드 전체 열기" 사용</div>';
    } else {
      listHtml = grandchildren.map(function(g, i){
        var safeTitle = String(g.title).replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return '<a class="ph123-gc" onclick="ph124JumpGrandchild(\'' + cardId + '\',' + g.idx + ',\'' + safeTitle + '\')">' +
          '<span class="ph123-num">' + (i + 1) + '</span>' +
          '<span class="ph123-text">' + g.title + '</span>' +
        '</a>';
      }).join('');
    }

    flyout.innerHTML = headerHtml + directHtml + listHtml;
    document.body.appendChild(flyout);

    var fw = 320;
    var fh = Math.min(grandchildren.length * 40 + 120, window.innerHeight * 0.7);
    var left = rect.right + 6;
    var top = rect.top;
    if (left + fw > window.innerWidth) left = rect.left - fw - 6;
    if (top + fh > window.innerHeight) top = window.innerHeight - fh - 10;
    if (top < 10) top = 10;
    flyout.style.left = left + 'px';
    flyout.style.top = top + 'px';

    flyout.addEventListener('mouseenter', function(){ if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } if (showTimer) { clearTimeout(showTimer); showTimer = null; } });
    flyout.addEventListener('mouseleave', function(){ hideFlyoutV2(150); });
  }

  function hideFlyoutV2(delay){
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function(){
      if (flyout) { flyout.remove(); flyout = null; }
      if (currentSub) { currentSub.classList.remove('ph123-active'); currentSub = null; }
    }, delay || 200);
  }

  window.ph124JumpCard = function(cardId){
    var card = document.getElementById(cardId);
    if (!card) { alert('카드 미구현: ' + cardId); return; }
    if (card.tagName === 'DETAILS') card.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.style.boxShadow = '0 0 0 4px rgba(251,191,36,0.7), 0 12px 40px rgba(251,191,36,0.3)';
    setTimeout(function(){ card.style.boxShadow = ''; }, 2500);
    hideFlyoutV2(0);
  };

  window.ph124JumpGrandchild = function(cardId, idx, title){
    var card = document.getElementById(cardId);
    if (!card) { alert('카드 미구현: ' + cardId); return; }
    if (card.tagName === 'DETAILS') card.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // DOM 에서 같은 idx 의 sub-item 찾아서 열기
    var items = card.querySelectorAll('details.sub-item, .sub-menu > details, .menu-body > details');
    var target = items[idx];
    if (target) {
      target.open = true;
      setTimeout(function(){
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.boxShadow = '0 0 0 3px rgba(251,191,36,0.6), 0 12px 40px rgba(251,191,36,0.3)';
        setTimeout(function(){ target.style.boxShadow = ''; }, 2500);
      }, 300);
    } else {
      // 카드 자체로 이동 + 안내
      card.style.boxShadow = '0 0 0 4px rgba(251,191,36,0.7), 0 12px 40px rgba(251,191,36,0.3)';
      setTimeout(function(){ card.style.boxShadow = ''; }, 2500);
      console.log('[ph124] 손자 idx', idx, '없음 — 카드 전체로 이동:', cardId, '(' + title + ')');
    }
    hideFlyoutV2(0);
  };

  // ph123 의 호버 핸들러 모두 제거 + 새로 부착
  function ph124RebindHover(){
    var bar = document.getElementById('ph85-sidebar');
    if (!bar) return;
    bar.querySelectorAll('.ph85-sub').forEach(function(sub){
      if (sub.__ph124) return;
      // 기존 ph123 핸들러 무력화 — cloneNode 로 핸들러 모두 제거
      var fresh = sub.cloneNode(true);
      sub.parentNode.replaceChild(fresh, sub);
      fresh.__ph124 = true;
      fresh.__ph123 = true; // ph123 의 setInterval 도 skip
      fresh.__ph92 = true;  // ph92 capture-phase 도 skip
      fresh.addEventListener('mouseenter', function(){
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        // 약 0.35초 머문 뒤에만 손자 메뉴 표시 (빠른 전환 방지)
        if (showTimer) clearTimeout(showTimer);
        showTimer = setTimeout(function(){ showFlyoutV2(fresh); }, 350);
      });
      fresh.addEventListener('mouseleave', function(){
        if (showTimer) { clearTimeout(showTimer); showTimer = null; }
        hideFlyoutV2(300);
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph124RebindHover);
  else ph124RebindHover();
  setInterval(ph124RebindHover, 1500);

  console.log('[ph124] 손자 메뉴 데모 매핑 73개 카드 활성 — 호버 시 의미 있는 손자 메뉴 표시');
})();
