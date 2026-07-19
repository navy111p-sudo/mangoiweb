// ═══════════════════════════════════════════════════════════════
// adm-s15.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // === 모든 사이드바 메뉴의 짧은 설명 (호버 툴팁용) ===
  var TIPS = {
    // 평가서 통합
    'card-eval-mgmt':              '📝 학생별 평가서 작성·수정·발행',
    'card-bulk-eval':              '📋 여러 학생 동시 평가 일괄 작성',
    'card-ai-lesson-report':       '🤖 수업 STT → AI 자동 리포트 생성',
    'card-ai-eval-draft':          '✨ AI 가 평가 초안 자동 작성',
    'card-monthly-report':         '📅 학생별 월간 종합 리포트',
    'card-comparison-report':      '📊 학생 간 / 기간 간 비교 분석',

    // 알림 센터
    'card-webpush-mgmt':           '🔔 브라우저 푸시 알림 (무료, VAPID)',
    'card-kakao-mgmt':             '💬 카카오 알림톡 발송 (SOLAPI)',
    'card-poster-maker':           '🎨 공지·안내 포스터 만들기 (크기조절·동영상·서버저장/재사용)',
    'card-popups-mgmt':            '📌 사이트 팝업 광고/공지 관리',
    'card-notifications':          '📢 이벤트/행사 알림 발송',
    'card-notice-board':           '📌 학원 공식 공지 게시판',

    // 강사 통합
    'card-teacher-mgmt':           '🧑‍🏫 강사 등록·수정·평가',
    'card-payroll-auto':           '💰 강사 급여 자동 계산',
    'card-payroll':                '💵 이번달 급여 명세 + PDF',
    'card-mbti-mgmt':              '🧠 강사·학생 MBTI 매칭',
    'card-praise-stats':           '🌟 강사 칭찬 카운트 + 랭킹',
    'card-supervisor':             '👁 강사 라이브 참관 + 노트',
    'card-room-invite':            '📨 학생 수업 방 초대 링크',
    'card-timetable':              '🗓 강사·학생 통합 시간표',
    'card-lesson-log':             '📝 매 수업 후 일지 + 학부모 자동 공유',
    'card-report-forms':           '📋 휴가·기안 결재 양식 관리',

    // 통계 / KPI
    'card-kpi-dashboard':          '📊 핵심 운영 지표 한눈에',
    'card-daily-charts':           '📈 일별 트렌드 차트',
    'card-rankings':               '🏆 학생·강사·학원 랭킹',
    'card-retention-risk':         '⚠ 이탈 위험 학생 자동 감지',
    'card-retention':              '🗑 녹화/출결/카카오ID 데이터 보관 기간 자동 파기',
    'card-active-rooms':           '🔴 현재 진행 중인 실시간 수업 방 모니터링',
    'card-nps-monthly':            '😊 월별 NPS (순추천지수)',
    'card-ai-forecast':            '🔮 AI 매출/학생 증감 예측',
    'card-voice-stats':            '🎙 학생 발화량/발음 통계',

    // 회계 / 포인트
    'card-accounting-mgmt':        '💰 결제·환불·세금계산서 통합',
    'card-payments-b2b':           '🏢 본사 ↔ 대리점 결제 내역',
    'card-payments-b2c':           '👨‍👩‍👧 학원 → 학부모 직판매 결제',
    'card-recurring-billing':      '🔄 매월 자동 정기 결제',
    'card-auto-dunning':           '💸 미납 자동 독촉 알림',
    'card-settlement-stats':       '📊 일별·월별 정산 통계',
    'card-points-mgmt':            '⭐ 학생 포인트 적립/사용 관리',

    // 학생 / 학부모
    'card-students-mgmt':          '👨‍🎓 학생 등록·검색·상세 관리',
    'card-school-attendance-stats':'📊 학원별 학생 출석률 통계',
    'card-family-mgmt':            '👨‍👩‍👧‍👦 가족(형제자매) 통합 관리',
    'card-inquiry-mgmt':           '📞 신규 문의 → 상담 → 등록',
    'card-enrollments':            '✏ 이번달 등록·대기·휴학 관리',
    'card-badges-mgmt':            '🏅 학생 뱃지 발급/관리',
    'card-community':              '💬 학원 커뮤니티 게시판',
    'card-counseling-booking':     '📅 학부모-강사 상담 예약',
    'card-parent-digest':          '📰 학부모 주간/월간 요약 발송',
    'card-parent-faq-bot':         '🤖 학부모 FAQ 자동 응답 챗봇',
    'card-referral':               '🎁 친구 추천 코드 + 보상',
    'card-alumni':                 '🎓 졸업생 동문 커뮤니티',
    'card-gallery':                '📷 학원 사진/영상 갤러리',

    // 교육 / 콘텐츠
    'card-textbooks':              '📚 교재 콘텐츠 + 단원 관리',
    'card-microlearn':             '📖 5분 마이크로러닝 콘텐츠',
    'card-mini-toeic':             '🎯 미니 토익 모의고사',
    'card-pronunciation':          '🗣 AI 발음 교정',
    'card-video-dict':             '🎬 영상 사전 단어 학습',
    'card-voice-diary':            '🎙 음성 일기 (AI 첨삭)',
    'card-level-tests':            '📊 레벨 테스트 응시·결과',
    'card-battle-mgmt':            '⚔ 영어 배틀 (게임)',
    'card-recording-storage':      '💾 수업 녹화 영상 보관',
    'card-homework':               '📚 숙제 출제·제출·채점',

    // 시스템
    'card-permissions':            '🔐 역할별 메뉴/데이터 권한 설정',
    'card-franchises':             '🏬 가맹점·지사·대리점 관리',
    'card-centers':                '🏢 본사 직영 센터 관리',
    'card-data-export':            '📤 학생/강사/결제 CSV 다운로드',
    'card-admin-alerts':           '🔔 관리자 알림 (시스템 경고)',
    'card-admin-ghost':            '👻 실시간 수업 참관 (Ghost View)',
    'card-admin-whisper':          '💬 학생/강사에게 귓속말',
    'card-attendance-status':      '📋 학생별 개별 출결 기록',
    'card-auto-attendance':        '📷 QR 코드 자동 출결 체크',
    'card-class-attendance':       '📝 수업별 출결 일괄 관리'
  };

  function ph127ApplyTips(){
    // 🌐 EN 토글 시 영어 data-tip 으로 교체(언어 바뀌면 다음 주기에 자동 갱신)
    var en = (window.adminLang && window.adminLang!=='ko');
    document.querySelectorAll('#ph85-sidebar .ph85-sub').forEach(function(sub){
      var cardId = sub.dataset.card;
      if (!cardId) return;
      var tip = (en && window.TIP_EN && window.TIP_EN[cardId]) ? window.TIP_EN[cardId] : TIPS[cardId];
      if (tip && sub.getAttribute('data-tip') !== tip) {
        sub.setAttribute('data-tip', tip);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph127ApplyTips);
  else ph127ApplyTips();
  (window.__admSettleRun ? window.__admSettleRun(ph127ApplyTips) : setInterval(ph127ApplyTips, 1500));

  console.log('[ph127] 사이드바 73개 메뉴 호버 툴팁 활성 (투명 + 테두리)');
})();
