// ═══════════════════════════════════════════════════════════════
// adm-r22.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // === 7가지 역할 정의 ===
  var ROLES_117 = [
    {
      uid: 'hq_exec', name: '정우영', label: '👑 경영진', en: 'EXECUTIVE',
      color: '#7F1D1D', colorAlpha: 'rgba(127,29,29,0.4)',
      desc: '최고 권한 — 모든 데이터 조회·수정·승인',
      perms: ['전체 메뉴', '재무 승인', '정책 결정', '본사·지사·대리점 전체']
    },
    {
      uid: 'hq_mgr', name: '정우영', label: '🛠 관리자', en: 'MANAGER',
      color: '#B91C1C', colorAlpha: 'rgba(185,28,28,0.4)',
      desc: '본사 운영 관리 — 일상 운영 + 강사·학생 관리',
      perms: ['전체 메뉴', '강사 관리', '학생 관리', '결제 조회']
    },
    {
      uid: 'hq_t_001', name: 'Teacher Len', label: '🧑‍🏫 교사', en: 'TEACHER',
      color: '#F59E0B', colorAlpha: 'rgba(245,158,11,0.4)',
      desc: '강사 — 본인 수업·평가서·일지만',
      perms: ['수업 일지', '평가서 작성', '본인 시간표', '본인 급여']
    },
    {
      uid: 'branch_busan', name: '박부산 지사장', label: '🏬 지사', en: 'BRANCH',
      color: '#D97706', colorAlpha: 'rgba(217,119,6,0.4)',
      desc: '지사장 — 산하 대리점 통합 관리',
      perms: ['산하 대리점', '지사 매출', '지사 강사', '신규 가맹']
    },
    {
      uid: 'agency_gn001', name: '이강남 원장', label: '🤝 대리점', en: 'AGENCY',
      color: '#10B981', colorAlpha: 'rgba(16,185,129,0.4)',
      desc: '대리점장 — 본인 학원·학생 관리',
      perms: ['학원 학생', '학원 강사', '본인 매출', '학원 등록']
    },
    {
      uid: 'parent_001', name: '최학부모', label: '👨‍👩‍👧 학부모', en: 'PARENT',
      color: '#3B82F6', colorAlpha: 'rgba(59,130,246,0.4)',
      desc: '학부모 — 자녀의 학습·평가·결제만',
      perms: ['자녀 출결', '자녀 평가서', '학습 일지', '수업료 결제']
    },
    {
      uid: 'student_001', name: '홍길동', label: '🎓 학생', en: 'STUDENT',
      color: '#8B5CF6', colorAlpha: 'rgba(139,92,246,0.4)',
      desc: '학생 — 본인 학습·평가·뱃지·콘텐츠',
      perms: ['수업 입장', '본인 평가서', '뱃지·포인트', '학습 콘텐츠']
    }
  ];

  function getCurrentUid(){
    try {
      var u = JSON.parse(localStorage.getItem('admin_session') || 'null');
      return u && u.uid;
    } catch(e){ return null; }
  }

  // === 역할 선택 모달 열기 ===
  window.ph117OpenRole = function(){
    var grid = document.getElementById('ph117-grid');
    var currentUid = getCurrentUid();
    var currentInfo = document.getElementById('ph117-current-info');
    var current = ROLES_117.find(function(r){ return r.uid === currentUid; });
    if (current) {
      currentInfo.innerHTML = '✓ 현재 로그인: <b>' + current.label + '</b> (' + current.name + ' @' + current.uid + ')';
    } else {
      currentInfo.innerHTML = '⚠ 로그인된 사용자 없음';
    }
    grid.innerHTML = '';
    ROLES_117.forEach(function(r){
      var card = document.createElement('div');
      card.className = 'ph117-rc' + (r.uid === currentUid ? ' current' : '');
      card.style.setProperty('--rc-color', r.color);
      card.style.setProperty('--rc-color-alpha', r.colorAlpha);
      card.onclick = function(){ ph117SelectRole(r.uid); };
      var permsHtml = r.perms.map(function(p){ return '<span class="ph117-rc-perm">' + p + '</span>'; }).join('');
      card.innerHTML =
        '<div class="ph117-rc-icon">' + r.label.split(' ')[0] + '</div>' +
        '<div class="ph117-rc-label">' + r.label.split(' ').slice(1).join(' ') + '</div>' +
        '<div class="ph117-rc-en">' + r.en + '</div>' +
        '<div class="ph117-rc-uid">' + r.uid + '</div>' +
        '<div class="ph117-rc-desc">' + r.desc + '</div>' +
        '<div class="ph117-rc-perms">' + permsHtml + '</div>';
      grid.appendChild(card);
    });
    document.getElementById('ph117-role-modal').classList.add('show');
  };

  window.ph117CloseRole = function(){
    document.getElementById('ph117-role-modal').classList.remove('show');
  };

  window.ph117SelectRole = function(uid){
    var role = ROLES_117.find(function(r){ return r.uid === uid; });
    if (!role) return;
    if (!confirm(role.label + ' (' + role.name + ') 으로 로그인할까요?\n\n권한 범위: ' + role.desc)) return;
    try {
      localStorage.setItem('admin_session', JSON.stringify({
        uid: role.uid,
        name: role.name,
        email: role.uid + '@mangoi.com',
        branch: role.label,
        phone: '010-1234-5678',
        lastLogin: new Date().toLocaleString('ko-KR').slice(5,17)
      }));
    } catch(e){}
    alert('✅ ' + role.label + ' 로그인 완료 — 페이지 새로고침');
    window.location.reload();
  };

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') ph117CloseRole();
  });

  // === 기존 ph115 사용자 버튼의 "역할 전환" 메뉴를 ph117 로 교체 ===
  // ph115OpenModal 이후 모달 안의 "🔄 역할 전환" 링크의 onclick 교체
  var origOpenModal = window.ph115OpenModal;
  if (typeof origOpenModal === 'function') {
    window.ph115OpenModal = function(e){
      origOpenModal(e);
      setTimeout(function(){
        document.querySelectorAll('#ph115-modal .ph115-mi').forEach(function(a){
          if (a.textContent.indexOf('역할 전환') >= 0) {
            a.setAttribute('onclick', 'ph115CloseModal();ph117OpenRole();');
            // 라벨도 좀 더 정확하게
            var icon = a.querySelector('.ph115-mi-icon');
            if (icon) a.innerHTML = icon.outerHTML + '🎭 역할 선택 (7가지)';
          }
          if (a.textContent.indexOf('다른 계정') >= 0 || a.textContent.indexOf('로그인') >= 0 && !a.textContent.indexOf('로그아웃')) {
            a.setAttribute('onclick', 'ph115CloseModal();ph117OpenRole();');
          }
        });
      }, 50);
    };
  }

  console.log('[ph117] 7가지 역할 카드 모달 초기화 완료 — ph117OpenRole() 호출 가능');
})();
