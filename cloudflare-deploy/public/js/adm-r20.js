// ═══════════════════════════════════════════════════════════════
// adm-r20.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  function getUser(){
    try {
      var raw = localStorage.getItem('admin_session');
      if (raw) return JSON.parse(raw);
    } catch(e){}
    return null;
  }
  function saveUser(u){
    try { localStorage.setItem('admin_session', JSON.stringify(u)); } catch(e){}
  }

  var ROLE_INFO = {
    'hq_exec':       { label: '👑 본사 · 경영진',    color: 'rgba(217,119,6,0.4)', text: '#FCD34D', desc: '최고 권한 — 전체 데이터 조회/수정' },
    'hq_mgr':        { label: '🛠 본사 · 관리자',    color: 'rgba(220,38,38,0.4)', text: '#FECACA', desc: '운영 관리 — 전체 데이터 조회/수정' },
    'admin':         { label: '🛠 본사 · 관리자',    color: 'rgba(220,38,38,0.4)', text: '#FECACA', desc: '운영 관리 — 전체 데이터' },
    'hq_t_001':      { label: '👨‍🏫 본사 · 강사',      color: 'rgba(139,92,246,0.4)', text: '#C4B5FD', desc: '강사 — 본인 수업 데이터만' },
    'branch_busan':  { label: '🏬 지사 · 부산',      color: 'rgba(245,158,11,0.4)', text: '#FCD34D', desc: '지사장 — 산하 대리점 데이터' },
    'branch_daegu':  { label: '🏬 지사 · 대구',      color: 'rgba(245,158,11,0.4)', text: '#FCD34D', desc: '지사장' },
    'agency_gn001':  { label: '🤝 대리점 · 강남001', color: 'rgba(34,197,94,0.4)', text: '#86EFAC', desc: '대리점장 — 본인 학생만' },
    'agency_sc002':  { label: '🤝 대리점 · 송파002', color: 'rgba(34,197,94,0.4)', text: '#86EFAC', desc: '대리점장' }
  };

  // Floating 버튼 + 모달 DOM 생성
  function ph114Mount(){
    if (document.getElementById('ph114-user-fab')) return;
    var user = getUser();
    if (!user) {
      user = { uid: 'hq_mgr', name: '정우영', email: 'navy111p@gmail.com', branch: '본사', phone: '010-1234-5678' };
      saveUser(user);
    }
    var initial = (user.name || user.uid || 'U').charAt(0).toUpperCase();
    var role = ROLE_INFO[user.uid] || { label: '👤 ' + user.uid, color: 'rgba(59,130,246,0.4)', text: '#93C5FD', desc: '' };
    var roleShort = role.label.replace(/^[^\s]+\s/, '');

    // FAB 버튼
    var fab = document.createElement('button');
    fab.id = 'ph114-user-fab';
    fab.type = 'button';
    fab.innerHTML =
      '<span class="ph114-avatar">' + initial + '</span>' +
      '<span>' + (user.name || user.uid) + '</span>' +
      '<span class="ph114-badge">' + roleShort + '</span>';
    fab.onclick = function(e){
      if (e) e.stopPropagation();
      ph114OpenModal();
    };
    document.body.appendChild(fab);

    // 모달 (closed)
    var overlay = document.createElement('div');
    overlay.id = 'ph114-modal-overlay';
    overlay.onclick = function(e){
      if (e.target === overlay) ph114CloseModal();
    };
    overlay.innerHTML = '<div id="ph114-modal"></div>';
    document.body.appendChild(overlay);

    console.log('[ph114] floating user FAB + modal mounted');
  }

  window.ph114OpenModal = function(){
    var user = getUser();
    if (!user) {
      user = { uid: 'hq_mgr', name: '정우영', email: 'navy111p@gmail.com', branch: '본사' };
      saveUser(user);
    }
    var initial = (user.name || user.uid || 'U').charAt(0).toUpperCase();
    var role = ROLE_INFO[user.uid] || { label: '👤 ' + user.uid, color: 'rgba(59,130,246,0.4)', text: '#93C5FD', desc: '' };
    var modal = document.getElementById('ph114-modal');
    if (!modal) return;
    modal.style.setProperty('--role-color', role.color);
    modal.style.setProperty('--role-text', role.text);
    modal.innerHTML =
      '<div class="ph114-header">' +
        '<button class="ph114-close" type="button" onclick="ph114CloseModal()">✕</button>' +
        '<div class="ph114-header-avatar">' + initial + '</div>' +
        '<div class="ph114-header-name">' + (user.name || user.uid) + '</div>' +
        '<div class="ph114-header-uid">@' + user.uid + '</div>' +
        '<div class="ph114-header-role" style="background:' + role.color + ';color:' + role.text + ';border-color:' + role.color + '">' + role.label + '</div>' +
        '<div class="ph114-header-meta">' +
          '📧 ' + (user.email || '-') + '<br>' +
          '📞 ' + (user.phone || '-') + ' &nbsp;·&nbsp; 🏢 ' + (user.branch || '-') + '<br>' +
          '<span style="opacity:0.8;font-size:10.5px;font-style:italic">' + role.desc + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="ph114-menu">' +
        '<a class="ph114-menu-item" href="/admin/mypage"><span class="ph114-menu-icon">👤</span>마이페이지</a>' +
        '<a class="ph114-menu-item" href="javascript:void(0)" onclick="ph114ChangePw()"><span class="ph114-menu-icon">🔑</span>비밀번호 변경</a>' +
        '<a class="ph114-menu-item" href="/docs/" target="_blank"><span class="ph114-menu-icon">📘</span>자료실 / 사용 안내서</a>' +
        '<a class="ph114-menu-item" href="/admin/health" target="_blank"><span class="ph114-menu-icon">🩺</span>셀프 진단</a>' +
        '<a class="ph114-menu-item" href="javascript:void(0)" onclick="ph114Help()"><span class="ph114-menu-icon">❓</span>도움말 / FAQ</a>' +
        /* 🔐 (2026-07-14) 역할 전환·다른 계정 로그인 제거 — 역할 드리프트 방지 */
        '<div class="ph114-divider"></div>' +
        '<a class="ph114-menu-item danger" href="javascript:void(0)" onclick="ph114Logout()"><span class="ph114-menu-icon">🚪</span>로그아웃</a>' +
      '</div>';
    document.getElementById('ph114-modal-overlay').classList.add('show');
    console.log('[ph114] 모달 열림 — 사용자:', user.uid);
  };

  window.ph114CloseModal = function(){
    var ov = document.getElementById('ph114-modal-overlay');
    if (ov) ov.classList.remove('show');
  };

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') ph114CloseModal();
  });

  // 로그아웃
  window.ph114Logout = function(){
    if (!confirm('정말 로그아웃 하시겠습니까?\n\n현재 세션이 종료됩니다.')) return;
    // 🔐 adminLogout 이 서버 세션(쿠키)까지 종료 + /admin/login 이동 — reload/오버레이는 fetch를 끊어 쿠키가 살아남음
    if (typeof window.adminLogout === 'function') window.adminLogout();
    else location.replace('/admin/login');
  };

  // 로그인 (다른 계정)
  window.ph114Login = function(){
    var lo = document.getElementById('admin-login-overlay');
    if (lo) {
      ph114CloseModal();
      lo.style.display = 'flex';
      return;
    }
    var uid = prompt('새 계정 ID:');
    if (!uid) return;
    var name = prompt('이름:', uid);
    var session = {
      uid: uid, name: name || uid,
      email: uid + '@mangoi.com',
      branch: ROLE_INFO[uid] ? ROLE_INFO[uid].label : '-',
      phone: '010-0000-0000',
      lastLogin: new Date().toLocaleString('ko-KR').slice(5, 17)
    };
    saveUser(session);
    alert('✅ 로그인 완료 — 페이지 새로고침');
    window.location.reload();
  };

  // 비밀번호 변경
  window.ph114ChangePw = function(){
    var c = prompt('🔑 현재 비밀번호:');
    if (!c) return;
    var n = prompt('🔑 새 비밀번호 (8자 이상):');
    if (!n || n.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }
    var c2 = prompt('🔑 새 비밀번호 확인:');
    if (n !== c2) { alert('비밀번호가 일치하지 않습니다.'); return; }
    alert('🔑 비밀번호 변경 요청 — 실서비스에서는 백엔드 API 호출');
  };

  // 도움말
  window.ph114Help = function(){
    alert('❓ 망고아이 관리자 도움말\n\n' +
      '▸ 좌측 사이드바 — 8개 그룹 73개 메뉴\n' +
      '▸ 그룹 클릭 → 펼침/접힘 토글\n' +
      '▸ 하위 메뉴 클릭 → 해당 카드로 자동 스크롤\n' +
      '▸ 상단 "모두 펼치기" — 모든 그룹 한 번에 열기\n' +
      '▸ 우측 상단 사용자 버튼 → 로그인/로그아웃/자료실\n\n' +
      '문의: navy111p@gmail.com');
  };

  // 역할 전환
  window.ph114SwitchRole = function(){
    var roles = Object.keys(ROLE_INFO).map(function(k){
      return k + ' — ' + ROLE_INFO[k].label;
    }).join('\n');
    var sel = prompt('테스트할 역할 ID 입력:\n\n' + roles + '\n\n예: hq_exec, branch_busan, agency_gn001');
    if (!sel || !ROLE_INFO[sel]) { if (sel) alert('알 수 없는 역할: ' + sel); return; }
    var name = prompt('이름:', '정우영') || '테스트사용자';
    var session = {
      uid: sel, name: name,
      phone: '010-1234-5678',
      email: sel + '@mangoi.com',
      branch: ROLE_INFO[sel].label,
      lastLogin: new Date().toLocaleString('ko-KR').slice(5, 17)
    };
    saveUser(session);
    alert('역할 전환: ' + sel + ' → 페이지 새로고침');
    window.location.reload();
  };

  // 마운트 + 주기 재확인
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph114Mount);
  else ph114Mount();
  setInterval(function(){
    if (!document.getElementById('ph114-user-fab')) ph114Mount();
  }, 2000);
})();
