// ═══════════════════════════════════════════════════════════════
// adm-r28.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // === 권한 관리 카드 한↔영 매핑 ===
  var PERM_I18N = {
    '🔐 권한 설정':
      '🔐 Permissions',
    '🎭 Role Permission Matrix':
      '🎭 Role Permission Matrix',
    '5개 역할 + 본사 3개 직급 — 각 메뉴/기능의 접근 권한을 설정합니다. 셀을 클릭하면 ✅ → 👁️ → ❌ 순환·즉시 저장됩니다.':
      '5 roles + 3 HQ ranks — set access permission per menu/feature. Click cells to cycle ✅ → 👁️ → ❌ (auto-saved).',
    '🎭 내 역할 시뮬레이션':
      '🎭 My Role Simulation',
    '내 역할 시뮬레이션':
      'My Role Simulation',
    '학생용 홈페이지에서 사용할 역할을 선택. 「📅 수업 연기/변경」 시 위 권한 설정 따라 시간 제한이 자동 적용됩니다.':
      'Select role for student homepage. When using 「📅 Postpone/Change Class」 the time limit applies based on permissions above.',
    '— 역할 선택 —': '— Select Role —',
    '역할 선택': 'Select Role',
    '역할 미설정 (기본 = student)':
      'Role not set (default = student)',
    '역할 미설정':
      'Role not set',
    '초기화': 'Reset',
    '기본값으로 재설정': 'Reset to Default',
    '전체 저장': 'Save All',
    '정책 다운로드 (JSON)': 'Download Policy (JSON)',
    '정책 다운로드': 'Download Policy',
    '본사 (HQ — 직급별)': 'HQ (by Rank)',
    '본사': 'HQ',
    '경영진': 'Executive',
    '관리자': 'Manager',
    '교사': 'Teacher',
    '지사': 'Branch',
    '대리점': 'Agency',
    '학부모': 'Parent',
    '학생': 'Student',

    // 권한 표 행 (메뉴명들)
    '대시보드': 'Dashboard',
    '메인 대시보드': 'Main Dashboard',
    '실시간 수업 현황': 'Live Classes',
    '학생 관리': 'Student Management',
    '학생 목록·상세보기': 'Student List · Detail',
    '내 학습 정보 조회': 'My Learning Info',
    '평가서 작성·수정': 'Write/Edit Evaluation',
    '수강신청 관리': 'Enrollment Management',
    '강사 관리': 'Teacher Management',
    '강사 목록·평가': 'Teacher List · Rating',
    '강사 급여·정산': 'Teacher Payroll · Settlement',
    '회계 관리': 'Accounting',
    '학생 결제 내역': 'Student Payments',
    '법인카드 사용내역': 'Corporate Card Usage',
    '손익·재무제표': 'P&L · Financial Statements',
    '환불·취소 처리': 'Refund · Cancellation',
    '회계 리포트 다운로드': 'Accounting Report Download',
    '콘텐츠·녹화': 'Content · Recording',
    '수업 녹화본 조회': 'View Class Recordings',
    '교재 콘텐츠 관리': 'Textbook Management',
    '운영': 'Operations',
    '학원 게시판 (소식·FAQ) 작성': 'Academy Board (News·FAQ)',
    '신규상담 처리': 'New Counseling',
    '카톡 공지 발송': 'KakaoTalk Notice',
    '수업 변경 권한': 'Class Change Permission',
    '수업 연기 시간 무제한 (30분룰 우회)': 'Postpone Unlimited (Bypass 30min Rule)',
    '수업 변경 시간 무제한 (24시간룰 우회)': 'Change Unlimited (Bypass 24h Rule)',
    '시스템': 'System',
    '권한 설정': 'Permission Settings',
    '감사 로그 조회': 'Audit Log',
    '가맹점·지사 관리': 'Franchise · Branch',
    '본사 직원 등록': 'HQ Employee Registration',
    '역할별 사용자 관리': 'User Management by Role',

    // 셀 액션
    '허용': 'Allow',
    '읽기 전용': 'Read Only',
    '차단': 'Block',
    '변경 즉시 저장 + 다음 로그인부터 적용':
      'Changes auto-saved + applied from next login',
    '※ 표 읽는 법:':
      '※ How to read:',
    '표 읽는 법':
      'How to read',
    '권한 부여': 'Grant Permission',
    '읽기 전용. 변경 즉시 저장 + 해당 역할 사용자 다음 로그인부터 적용.':
      'Read only. Changes saved instantly, applied from next login.',
    '범례':
      'Legend'
  };

  function ph131TranslateCard(){
    if (window.adminLang !== 'en') return;
    var card = document.getElementById('card-permissions');
    if (!card) return;

    // 모든 텍스트 노드 순회 → 매핑된 텍스트 교체
    var walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null, false);
    var node;
    var nodes = [];
    while (node = walker.nextNode()) {
      var txt = node.nodeValue.trim();
      if (txt.length === 0) continue;
      nodes.push(node);
    }
    nodes.forEach(function(n){
      var txt = n.nodeValue;
      // 정확 매칭 후 부분 매칭
      var trimmed = txt.trim();
      if (PERM_I18N[trimmed]) {
        if (!n.__ph131orig) n.__ph131orig = n.nodeValue;
        n.nodeValue = txt.replace(trimmed, PERM_I18N[trimmed]);
        return;
      }
      // 부분 치환
      var replaced = txt;
      var keys = Object.keys(PERM_I18N).sort(function(a,b){ return b.length - a.length; });
      keys.forEach(function(k){
        if (k.length < 2) return;
        if (replaced.indexOf(k) >= 0) {
          replaced = replaced.split(k).join(PERM_I18N[k]);
        }
      });
      if (replaced !== txt) {
        if (!n.__ph131orig) n.__ph131orig = n.nodeValue;
        n.nodeValue = replaced;
      }
    });
    // placeholder 도 번역
    card.querySelectorAll('input, textarea, select').forEach(function(el){
      var ph = el.getAttribute('placeholder');
      if (ph && PERM_I18N[ph.trim()]) {
        if (!el.__ph131origPh) el.__ph131origPh = ph;
        el.setAttribute('placeholder', PERM_I18N[ph.trim()]);
      }
      // option 텍스트
      if (el.tagName === 'SELECT') {
        el.querySelectorAll('option').forEach(function(opt){
          var t = opt.textContent.trim();
          if (PERM_I18N[t]) {
            if (!opt.__ph131orig) opt.__ph131orig = opt.textContent;
            opt.textContent = PERM_I18N[t];
          }
        });
      }
    });
    // 버튼 안 텍스트
    card.querySelectorAll('button').forEach(function(btn){
      var t = btn.textContent.trim();
      if (PERM_I18N[t]) {
        if (!btn.__ph131orig) btn.__ph131orig = btn.textContent;
        btn.textContent = PERM_I18N[t];
      }
    });
  }

  function ph131RestoreKO(){
    if (window.adminLang === 'en') return;
    var card = document.getElementById('card-permissions');
    if (!card) return;
    // 텍스트 노드 복원
    var walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while (node = walker.nextNode()) {
      if (node.__ph131orig) {
        node.nodeValue = node.__ph131orig;
        delete node.__ph131orig;
      }
    }
    card.querySelectorAll('input, textarea, select, button').forEach(function(el){
      if (el.__ph131origPh) { el.setAttribute('placeholder', el.__ph131origPh); delete el.__ph131origPh; }
      if (el.__ph131orig) { el.textContent = el.__ph131orig; delete el.__ph131orig; }
      if (el.tagName === 'SELECT') {
        el.querySelectorAll('option').forEach(function(opt){
          if (opt.__ph131orig) { opt.textContent = opt.__ph131orig; delete opt.__ph131orig; }
        });
      }
    });
  }

  // toggleAdminLang 후크
  var origToggle = window.toggleAdminLang;
  window.toggleAdminLang = function(){
    if (typeof origToggle === 'function') origToggle.apply(this, arguments);
    setTimeout(function(){
      if (window.adminLang === 'en') ph131TranslateCard();
      else ph131RestoreKO();
    }, 150);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph131TranslateCard);
  else ph131TranslateCard();
  setInterval(function(){
    if (window.adminLang === 'en') ph131TranslateCard();
  }, 2000);

  console.log('[ph131] 권한 관리 카드 i18n 사전 ' + Object.keys(PERM_I18N).length + '개 활성');
})();
