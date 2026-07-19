// ═══════════════════════════════════════════════════════════════
// adm-r21.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var ROLE_INFO = {
    'hq_exec':       { label: '👑 본사 · 경영진',    short:'경영진', color: 'rgba(217,119,6,0.4)',  text: '#FCD34D', desc: '최고 권한 — 전체 데이터' },
    'hq_mgr':        { label: '🛠 본사 · 관리자',    short:'관리자', color: 'rgba(220,38,38,0.4)',  text: '#FECACA', desc: '운영 관리 — 전체 데이터' },
    'admin':         { label: '🛠 본사 · 관리자',    short:'관리자', color: 'rgba(220,38,38,0.4)',  text: '#FECACA', desc: '운영 관리' },
    'hq_t_001':      { label: '👨‍🏫 본사 · 강사',      short:'강사',  color: 'rgba(139,92,246,0.4)', text: '#C4B5FD', desc: '본인 수업 데이터만' },
    'branch_busan':  { label: '🏬 지사 · 부산',      short:'지사',  color: 'rgba(245,158,11,0.4)', text: '#FCD34D', desc: '산하 대리점 데이터' },
    'branch_daegu':  { label: '🏬 지사 · 대구',      short:'지사',  color: 'rgba(245,158,11,0.4)', text: '#FCD34D', desc: '산하 대리점' },
    'agency_gn001':  { label: '🤝 대리점 · 강남001', short:'대리점',color: 'rgba(34,197,94,0.4)',  text: '#86EFAC', desc: '본인 학생만' },
    'agency_sc002':  { label: '🤝 대리점 · 송파002', short:'대리점',color: 'rgba(34,197,94,0.4)',  text: '#86EFAC', desc: '본인 학생만' }
  };

  function getUser(){
    try { return JSON.parse(localStorage.getItem('admin_session') || 'null'); } catch(e){ return null; }
  }
  function saveUser(u){ try { localStorage.setItem('admin_session', JSON.stringify(u)); } catch(e){} }

  // EN 버튼 옆에 ph115 사용자 버튼 mount
  function ph115Mount(){
    var enBtn = document.querySelector('button[onclick="toggleAdminLang()"]');
    if (!enBtn) {
      // EN 버튼이 없으면 ▲ 토글 옆에라도
      enBtn = document.getElementById('th-collapse-btn');
    }
    if (!enBtn) return;

    var existing = document.getElementById('ph115-user');
    if (existing && existing.parentElement === enBtn.parentElement) {
      // 이미 마운트됨 — 라벨만 갱신
      updateUserButton(existing);
      return;
    }
    if (existing) existing.remove();

    var user = getUser() || { uid: 'hq_mgr', name: '정우영', email: 'navy111p@gmail.com', branch: '본사' };
    saveUser(user);

    var btn = document.createElement('button');
    btn.id = 'ph115-user';
    btn.type = 'button';
    btn.setAttribute('onclick', 'ph115OpenModal(event);');
    enBtn.parentElement.insertBefore(btn, enBtn.nextSibling);
    updateUserButton(btn);

    // 모달 컨테이너 (한 번만 생성)
    if (!document.getElementById('ph115-modal-overlay')) {
      var ov = document.createElement('div');
      ov.id = 'ph115-modal-overlay';
      ov.innerHTML = '<div id="ph115-modal"></div>';
      ov.onclick = function(e){ if (e.target === ov) ph115CloseModal(); };
      document.body.appendChild(ov);
    }

    console.log('[ph115] EN 옆에 사용자 버튼 mount 완료');
  }

  function updateUserButton(btn){
    var user = getUser() || { uid: 'hq_mgr', name: '정우영' };
    var role = ROLE_INFO[user.uid] || { short: '사용자' };
    var initial = (user.name || user.uid || 'U').charAt(0).toUpperCase();
    btn.innerHTML =
      '<span class="ph115-avatar">' + initial + '</span>' +
      '<span class="ph115-name">' + (user.name || user.uid) + '</span>' +
      '<span class="ph115-role">' + role.short + '</span>';
  }

  window.ph115OpenModal = function(e){
    if (e) e.stopPropagation();
    var user = getUser() || { uid: 'hq_mgr', name: '정우영', email: 'navy111p@gmail.com', branch: '본사' };
    saveUser(user);
    var initial = (user.name || user.uid || 'U').charAt(0).toUpperCase();
    var role = ROLE_INFO[user.uid] || { label: '👤 ' + user.uid, color: 'rgba(59,130,246,0.4)', text: '#93C5FD', desc: '' };
    var modal = document.getElementById('ph115-modal');
    if (!modal) return;
    modal.innerHTML =
      '<div class="ph115-mh">' +
        '<button class="ph115-mh-close" type="button" onclick="ph115CloseModal()">✕</button>' +
        '<div class="ph115-mh-avatar">' + initial + '</div>' +
        '<div class="ph115-mh-name">' + (user.name || user.uid) + '</div>' +
        '<div class="ph115-mh-uid">@' + user.uid + '</div>' +
        '<div class="ph115-mh-role" style="background:' + role.color + ';color:' + role.text + ';border-color:' + role.color + '">' + role.label + '</div>' +
        '<div class="ph115-mh-meta">' +
          '📧 ' + (user.email || '-') + '<br>' +
          '📞 ' + (user.phone || '-') + ' &nbsp;·&nbsp; 🏢 ' + (user.branch || '-') + '<br>' +
          '<span style="opacity:0.85;font-size:10.5px;font-style:italic">' + role.desc + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="ph115-menu">' +
        '<a class="ph115-mi" href="/admin/mypage"><span class="ph115-mi-icon">👤</span>마이페이지</a>' +
        '<a class="ph115-mi" href="javascript:void(0)" onclick="ph115ChangePw()"><span class="ph115-mi-icon">🔑</span>비밀번호 변경</a>' +
        '<a class="ph115-mi" href="/docs/" target="_blank"><span class="ph115-mi-icon">📘</span>자료실 / 사용 안내서</a>' +
        '<a class="ph115-mi" href="/admin/health" target="_blank"><span class="ph115-mi-icon">🩺</span>셀프 진단</a>' +
        '<a class="ph115-mi" href="javascript:void(0)" onclick="ph115Help()"><span class="ph115-mi-icon">❓</span>도움말 / FAQ</a>' +
        /* 🔐 (2026-07-14) 역할 전환·다른 계정 로그인 제거 — 역할 드리프트 방지 */
        '<div class="ph115-divider"></div>' +
        '<a class="ph115-mi danger" href="javascript:void(0)" onclick="ph115Logout()"><span class="ph115-mi-icon">🚪</span>로그아웃</a>' +
      '</div>';
    document.getElementById('ph115-modal-overlay').classList.add('show');
  };

  window.ph115CloseModal = function(){
    var ov = document.getElementById('ph115-modal-overlay');
    if (ov) ov.classList.remove('show');
  };

  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') ph115CloseModal(); });

  window.ph115Logout = function(){
    if (!confirm('정말 로그아웃 하시겠습니까?\n현재 세션이 종료됩니다.')) return;
    try { localStorage.removeItem('admin_session'); sessionStorage.clear(); } catch(e){}
    if (typeof window.adminLogout === 'function') try { window.adminLogout(); } catch(e){}
    alert('🚪 로그아웃 되었습니다.');
    var lo = document.getElementById('admin-login-overlay');
    if (lo) lo.style.display = 'flex';
    else window.location.reload();
  };
  window.ph115Login = function(){
    var lo = document.getElementById('admin-login-overlay');
    if (lo) { ph115CloseModal(); lo.style.display = 'flex'; return; }
    var uid = prompt('새 계정 ID:'); if (!uid) return;
    var name = prompt('이름:', uid) || uid;
    saveUser({ uid: uid, name: name, email: uid+'@mangoi.com', branch: ROLE_INFO[uid]?ROLE_INFO[uid].label:'-', phone: '010-0000-0000', lastLogin: new Date().toLocaleString('ko-KR').slice(5,17) });
    alert('✅ 로그인 완료'); window.location.reload();
  };
  window.ph115ChangePw = function(){
    var c=prompt('🔑 현재 비밀번호:'); if(!c)return;
    var n=prompt('🔑 새 비밀번호 (8자 이상):'); if(!n||n.length<8){alert('비밀번호는 8자 이상');return;}
    var c2=prompt('🔑 새 비밀번호 확인:'); if(n!==c2){alert('비밀번호 불일치');return;}
    alert('🔑 비밀번호 변경 요청 — 실서비스에서 백엔드 API');
  };
  window.ph115Help = function(){
    alert('❓ 망고아이 관리자 도움말\n\n▸ 좌측 사이드바 — 8개 그룹 73개 메뉴\n▸ 그룹 클릭 → 펼침/접힘\n▸ 하위 메뉴 클릭 → 해당 카드 자동 스크롤\n▸ 우측 상단 사용자 버튼 → 로그인/로그아웃/자료실\n\n문의: navy111p@gmail.com');
  };
  window.ph115SwitchRole = function(){
    var roles = Object.keys(ROLE_INFO).map(function(k){ return k + ' — ' + ROLE_INFO[k].label; }).join('\n');
    var sel = prompt('테스트할 역할 ID:\n\n' + roles); if (!sel || !ROLE_INFO[sel]) { if(sel)alert('알 수 없는 역할'); return; }
    var name = prompt('이름:', '정우영') || '테스트';
    saveUser({ uid: sel, name: name, phone:'010-1234-5678', email: sel+'@mangoi.com', branch: ROLE_INFO[sel].label, lastLogin: new Date().toLocaleString('ko-KR').slice(5,17) });
    alert('역할 전환 완료'); window.location.reload();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph115Mount);
  else ph115Mount();
  (window.__admSettleRun ? window.__admSettleRun(ph115Mount) : setInterval(ph115Mount, 1500));
})();
