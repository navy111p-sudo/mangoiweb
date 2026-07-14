// ═══════════════════════════════════════════════════════════════
// adm-q9.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // 역할 매핑 (사용자 ID → 표시 정보)
  var ROLE_MAP = {
    'hq_exec':       { label: '👑 본사 · 경영진',    badge: 'exec',    desc: '최고 권한 — 전체 데이터' },
    'hq_mgr':        { label: '🛠 본사 · 관리자',    badge: 'admin',   desc: '운영 관리 — 전체 데이터' },
    'admin':         { label: '🛠 본사 · 관리자',    badge: 'admin',   desc: '운영 관리 — 전체 데이터' },
    'cfo01':         { label: '💼 본사 · CFO',       badge: 'admin',   desc: '회계 총괄' },
    'ops_lead':      { label: '🛠 본사 · 운영',      badge: 'admin',   desc: '운영팀' },
    'hq_t_001':      { label: '👨‍🏫 본사 · 강사',      badge: 'teacher', desc: '강사 — 본인 수업 데이터' },
    'hq_teacher':    { label: '👨‍🏫 본사 · 강사',      badge: 'teacher', desc: '강사' },
    'branch_busan':  { label: '🏬 지사 · 부산',      badge: 'branch',  desc: '지사장 — 산하 대리점 데이터' },
    'branch_daegu':  { label: '🏬 지사 · 대구',      badge: 'branch',  desc: '지사장' },
    'agency_gn001':  { label: '🤝 대리점 · 강남001', badge: 'agency',  desc: '대리점장 — 본인 학생만' },
    'agency_sc002':  { label: '🤝 대리점 · 송파002', badge: 'agency',  desc: '대리점장' }
  };

  function getCurrentUser(){
    // localStorage 우선, 그 다음 window.currentAdminUser, 마지막 기본값
    try {
      var raw = localStorage.getItem('admin_session');
      if (raw) return JSON.parse(raw);
    } catch(e){}
    if (window.currentAdminUser) return window.currentAdminUser;
    return null;
  }

  function renderUserPopup(){
    var popup = document.getElementById('topUserPopup');
    var btn = document.getElementById('topUserBtn');
    var label = document.getElementById('topUserLabel');
    if (!popup || !btn) return;

    var user = getCurrentUser();
    var html = '';

    if (user && user.uid) {
      // === 로그인 상태 ===
      var role = ROLE_MAP[user.uid] || { label: '👤 ' + (user.role || '사용자'), badge: 'student', desc: user.role || '' };
      var initial = (user.name || user.uid || 'U').charAt(0).toUpperCase();

      // 버튼 라벨 — 이름 + 역할
      if (label) {
        label.innerHTML = '<span style="width:24px;height:24px;background:rgba(255,255,255,0.25);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;margin-right:6px">' + initial + '</span>' +
          '<span>' + (user.name || user.uid) + '</span>' +
          '<span style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:99px;font-size:10.5px;margin-left:6px">' + role.label.replace(/^[^\s]+\s/, '') + '</span>';
      }

      html =
        '<div class="ph111-userinfo">' +
          '<div class="ph111-name">' +
            '<span style="width:36px;height:36px;background:rgba(255,255,255,0.25);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:18px">' + initial + '</span>' +
            (user.name || user.uid) +
          '</div>' +
          '<div class="ph111-uid">@' + user.uid + '</div>' +
          '<div class="ph111-role-row">' +
            '<span class="ph111-role-badge ' + role.badge + '">' + role.label + '</span>' +
          '</div>' +
          '<div class="ph111-meta">' +
            '<span class="ph111-meta-key">📞 연락처</span><span>' + (user.phone || '-') + '</span>' +
            '<span class="ph111-meta-key">📧 이메일</span><span>' + (user.email || '-') + '</span>' +
            '<span class="ph111-meta-key">🏢 소속</span><span>' + (user.branch || user.org || '-') + '</span>' +
            '<span class="ph111-meta-key">🕐 마지막</span><span>' + (user.lastLogin || new Date().toLocaleString('ko-KR').slice(5, 17)) + '</span>' +
          '</div>' +
          '<div style="margin-top:8px;font-size:11px;color:#BFDBFE;font-style:italic">' + role.desc + '</div>' +
        '</div>' +
        '<a href="/admin/mypage">👤 마이페이지</a>' +
        '<a href="javascript:void(0)" onclick="ph111ChangePw()">🔑 비밀번호 변경</a>' +
        '<a href="/admin/health" target="_blank">🩺 셀프 진단</a>' +
        '<a href="/docs/" target="_blank">📘 사용 안내서</a>' +
        '<a href="javascript:void(0)" onclick="ph111SwitchRole()">🔄 역할 전환 (테스트)</a>' +
        '<div class="th-user-popup-divider"></div>' +
        '<button type="button" class="ph111-logout" onclick="ph111Logout()">🚪 로그아웃</button>';
    } else {
      // === 로그아웃 상태 ===
      if (label) {
        label.innerHTML = '<span style="width:24px;height:24px;background:rgba(255,255,255,0.2);border-radius:50%;display:inline-flex;align-items:center;justify-content:center">?</span>' +
          '<span>로그인 필요</span>';
      }
      html =
        '<div class="ph111-userinfo">' +
          '<div class="ph111-name">🔐 로그인이 필요합니다</div>' +
          '<div style="margin-top:8px;font-size:12px;color:#BFDBFE">관리자 페이지에 접근하려면 로그인해주세요.</div>' +
        '</div>' +
        '<button type="button" class="ph111-login" onclick="ph111Login()">✅ 로그인</button>' +
        '<div class="th-user-popup-divider"></div>' +
        '<a href="/admin/health" target="_blank">🩺 셀프 진단 (비로그인)</a>' +
        '<a href="/docs/" target="_blank">📘 사용 안내서</a>';
    }
    popup.innerHTML = html;
  }

  // 버튼 클릭 → 팝업 토글
  function ph111Toggle(){
    var popup = document.getElementById('topUserPopup');
    if (!popup) return;
    renderUserPopup();
    popup.classList.toggle('ph111-show');
    console.log('[ph111] user menu toggled');
  }

  // 외부 클릭 시 닫기
  document.addEventListener('click', function(e){
    var btn = document.getElementById('topUserBtn');
    var popup = document.getElementById('topUserPopup');
    if (!btn || !popup) return;
    if (btn.contains(e.target)) {
      ph111Toggle();
      e.stopPropagation();
    } else if (!popup.contains(e.target)) {
      popup.classList.remove('ph111-show');
    }
  }, true);

  // 로그인 함수
  window.ph111Login = function(){
    var overlay = document.getElementById('admin-login-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    } else {
      var uid = prompt('사용자 ID (예: admin, hq_exec, branch_busan, agency_gn001):');
      if (!uid) return;
      var name = prompt('이름 (예: 정우영):') || uid;
      var session = {
        uid: uid,
        name: name,
        phone: '010-0000-0000',
        email: uid + '@mangoi.com',
        branch: ROLE_MAP[uid] ? ROLE_MAP[uid].label : '본사',
        lastLogin: new Date().toLocaleString('ko-KR').slice(5, 17)
      };
      localStorage.setItem('admin_session', JSON.stringify(session));
      window.location.reload();
    }
  };

  // 로그아웃
  window.ph111Logout = function(){
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;
    console.log('[ph111] 로그아웃');
    // 🔐 adminLogout 이 서버 세션(쿠키)까지 종료 + /admin/login 이동 — reload 하면 fetch가 끊겨 쿠키가 살아남음
    if (typeof window.adminLogout === 'function') window.adminLogout();
    else location.replace('/admin/login');
  };

  // 비밀번호 변경
  window.ph111ChangePw = function(){
    var current = prompt('현재 비밀번호:');
    if (!current) return;
    var next = prompt('새 비밀번호 (8자 이상):');
    if (!next || next.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }
    var confirm2 = prompt('새 비밀번호 확인:');
    if (next !== confirm2) { alert('비밀번호가 일치하지 않습니다.'); return; }
    alert('🔑 비밀번호 변경 요청 — 실서비스에서는 백엔드 API 호출');
  };

  // 역할 전환 (테스트용)
  window.ph111SwitchRole = function(){
    var roles = Object.keys(ROLE_MAP).map(function(k){ return k + ' — ' + ROLE_MAP[k].label; }).join('\n');
    var sel = prompt('테스트할 역할 ID를 선택하세요 (위 목록 중 하나):\n\n' + roles + '\n\n예: hq_exec, branch_busan, agency_gn001');
    if (!sel || !ROLE_MAP[sel]) return;
    var name = prompt('이름:', '정우영') || '테스트사용자';
    var session = {
      uid: sel,
      name: name,
      phone: '010-1234-5678',
      email: sel + '@mangoi.com',
      branch: ROLE_MAP[sel].label,
      lastLogin: new Date().toLocaleString('ko-KR').slice(5, 17)
    };
    localStorage.setItem('admin_session', JSON.stringify(session));
    window.location.reload();
  };

  // 초기 렌더 + 주기적 재바인딩
  function ph111Init(){
    var btn = document.getElementById('topUserBtn');
    if (!btn) return;
    // 기본 사용자 (없으면 → 진짜 로그인 세션을 우선 반영, 그것도 없으면 관리자 데모)
    if (!getCurrentUser()) {
      // fix (2026-06-02) — 실제 로그인은 'mangoi_admin_session'에 저장됨. 그게 있으면 그 역할(지사/대리점/교사)을
      //   cosmetic 레이어(admin_session)에 연결해, 역할 배너·드롭다운이 '진짜 로그인한 사람'을 표시하게 함.
      var _real = null;
      try { _real = JSON.parse(localStorage.getItem('mangoi_admin_session') || 'null'); } catch(e){}
      if (_real && _real.uid) {
        localStorage.setItem('admin_session', JSON.stringify({
          uid: _real.uid,
          name: _real.name || _real.uid,
          phone: _real.phone || '010-1234-5678',
          email: _real.email || (_real.uid + '@mangoi.com'),
          branch: _real.branch || '',
          role: _real.role || '',
          lastLogin: new Date().toLocaleString('ko-KR').slice(5, 17)
        }));
      } else {
        var defaultSession = {
          uid: 'hq_mgr',
          name: '정우영',
          phone: '010-1234-5678',
          email: 'navy111p@gmail.com',
          branch: '본사',
          lastLogin: new Date().toLocaleString('ko-KR').slice(5, 17)
        };
        localStorage.setItem('admin_session', JSON.stringify(defaultSession));
      }
    }
    renderUserPopup();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph111Init);
  else ph111Init();
  setInterval(function(){
    var label = document.getElementById('topUserLabel');
    if (label && (label.textContent === '👤 관리자' || label.textContent === '로딩 중…')) {
      renderUserPopup();
    }
  }, 1500);

  console.log('[ph111] 사용자 드롭다운 초기화 완료 — 역할 뱃지 + 로그인/로그아웃');
})();
