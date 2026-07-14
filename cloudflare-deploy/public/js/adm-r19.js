// ═══════════════════════════════════════════════════════════════
// adm-r19.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // === 사용자 메뉴 toggle 글로벌 함수 (inline onclick에서 호출) ===
  window.ph113ToggleUser = function(e){
    if (e) { e.stopPropagation(); }
    var popup = document.getElementById('topUserPopup');
    if (!popup) {
      alert('사용자 팝업을 찾을 수 없습니다. 페이지를 새로고침해주세요.');
      return;
    }
    // ph111 renderUserPopup 재호출 (있다면)
    if (typeof window.ph111Toggle === 'function') {
      window.ph111Toggle();
      return;
    }
    // fallback: 직접 토글 + 사용자 정보 채우기
    popup.classList.toggle('ph111-show');
    if (popup.classList.contains('ph111-show') && popup.innerHTML.trim().length < 100) {
      // ph111 안 들어왔으면 직접 채움
      var user = null;
      try { user = JSON.parse(localStorage.getItem('admin_session') || 'null'); } catch(e){}
      if (!user) {
        user = { uid: 'hq_mgr', name: '정우영', email: 'navy111p@gmail.com', branch: '본사' };
        localStorage.setItem('admin_session', JSON.stringify(user));
      }
      popup.innerHTML =
        '<div style="background:linear-gradient(135deg,#1E3A8A,#2563EB);border-radius:10px;padding:14px 16px;margin-bottom:6px;color:#fff">' +
          '<div style="font-size:16px;font-weight:800;display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
            '<span style="width:36px;height:36px;background:rgba(255,255,255,0.25);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900">' + (user.name||'U').charAt(0) + '</span>' +
            (user.name || user.uid) +
          '</div>' +
          '<div style="font-size:11.5px;color:#BFDBFE;font-family:Consolas,monospace">@' + user.uid + '</div>' +
          '<div style="margin-top:8px"><span style="background:rgba(220,38,38,0.25);color:#FCA5A5;border:1px solid rgba(220,38,38,0.6);padding:4px 10px;border-radius:999px;font-size:10.5px;font-weight:800">🛠 본사 · 관리자</span></div>' +
          '<div style="font-size:11px;color:#BFDBFE;margin-top:8px">📧 ' + (user.email||'-') + ' · 🏢 ' + (user.branch||'-') + '</div>' +
        '</div>' +
        '<a href="/admin/mypage" style="display:block;padding:10px 14px;font-size:13.5px;border-radius:8px;color:#F8FAFC;text-decoration:none">👤 마이페이지</a>' +
        '<a href="javascript:void(0)" onclick="ph113ChangePw()" style="display:block;padding:10px 14px;font-size:13.5px;border-radius:8px;color:#F8FAFC;text-decoration:none">🔑 비밀번호 변경</a>' +
        '<a href="/docs/" target="_blank" style="display:block;padding:10px 14px;font-size:13.5px;border-radius:8px;color:#F8FAFC;text-decoration:none">📘 자료실 / 사용 안내서</a>' +
        '<a href="/admin/health" target="_blank" style="display:block;padding:10px 14px;font-size:13.5px;border-radius:8px;color:#F8FAFC;text-decoration:none">🩺 셀프 진단</a>' +
        '<a href="javascript:void(0)" onclick="alert(\'관리자 도움말 — 우측 사이드바 그룹별 매뉴얼 자동 표시 (다음 phase)\');" style="display:block;padding:10px 14px;font-size:13.5px;border-radius:8px;color:#F8FAFC;text-decoration:none">❓ 도움말 / FAQ</a>' +
        '<a href="javascript:void(0)" onclick="ph113SwitchRole()" style="display:block;padding:10px 14px;font-size:13.5px;border-radius:8px;color:#F8FAFC;text-decoration:none">🔄 역할 전환 (테스트)</a>' +
        '<div style="height:1px;background:rgba(96,165,250,0.3);margin:6px 8px"></div>' +
        '<button type="button" onclick="ph113Logout()" style="display:block;width:100%;text-align:left;background:rgba(239,68,68,0.15);border:0;padding:10px 14px;color:#FCA5A5;font-size:13.5px;font-weight:700;border-radius:8px;cursor:pointer;margin-top:4px">🚪 로그아웃</button>';
    }
    console.log('[ph113] 사용자 메뉴 토글');
  };

  // === 외부 클릭 시 닫기 ===
  document.addEventListener('click', function(e){
    var btn = document.getElementById('topUserBtn');
    var popup = document.getElementById('topUserPopup');
    if (!btn || !popup) return;
    if (!btn.contains(e.target) && !popup.contains(e.target)) {
      popup.classList.remove('ph111-show');
    }
  }, true);

  // === 로그아웃 ===
  window.ph113Logout = function(){
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;
    // 🔐 adminLogout 이 서버 세션(쿠키)까지 종료 + /admin/login 이동 — reload/오버레이는 fetch를 끊어 쿠키가 살아남음
    if (typeof window.adminLogout === 'function') window.adminLogout();
    else location.replace('/admin/login');
  };

  // === 비밀번호 변경 ===
  window.ph113ChangePw = function(){
    var current = prompt('🔑 현재 비밀번호:');
    if (!current) return;
    var next = prompt('🔑 새 비밀번호 (8자 이상):');
    if (!next || next.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }
    var confirm2 = prompt('🔑 새 비밀번호 확인:');
    if (next !== confirm2) { alert('비밀번호가 일치하지 않습니다.'); return; }
    alert('🔑 비밀번호 변경 요청 — 실서비스에서는 백엔드 API 호출');
  };

  // === 역할 전환 (테스트) ===
  window.ph113SwitchRole = function(){
    var roles = [
      'hq_exec — 👑 본사 경영진',
      'hq_mgr — 🛠 본사 관리자',
      'hq_t_001 — 👨‍🏫 본사 강사',
      'branch_busan — 🏬 지사 부산',
      'branch_daegu — 🏬 지사 대구',
      'agency_gn001 — 🤝 대리점 강남001',
      'agency_sc002 — 🤝 대리점 송파002'
    ].join('\n');
    var sel = prompt('테스트할 역할 ID 입력:\n\n' + roles + '\n\n예: hq_exec, branch_busan');
    if (!sel) return;
    var name = prompt('이름:', '정우영') || '테스트';
    var session = {
      uid: sel.split(' ')[0],
      name: name,
      phone: '010-1234-5678',
      email: sel + '@mangoi.com',
      branch: '본사',
      lastLogin: new Date().toLocaleString('ko-KR').slice(5, 17)
    };
    try { localStorage.setItem('admin_session', JSON.stringify(session)); } catch(e){}
    alert('역할 전환 완료 — 페이지 새로고침');
    window.location.reload();
  };

  // === 사용자 버튼에 inline onclick 강제 부착 (재바인딩) ===
  function ph113ForceUserBtnClick(){
    var btn = document.getElementById('topUserBtn');
    if (!btn) return;
    // inline onclick 속성 강제 (다른 모든 핸들러 우회)
    btn.setAttribute('onclick', 'ph113ToggleUser(event);');
    btn.style.cursor = 'pointer';

    // 라벨 안 보이면 강제 채움
    var label = document.getElementById('topUserLabel');
    if (label && (!label.textContent || label.textContent === '👤 관리자' || label.textContent.trim() === '')) {
      var user = null;
      try { user = JSON.parse(localStorage.getItem('admin_session') || 'null'); } catch(e){}
      if (!user) user = { uid: 'hq_mgr', name: '정우영' };
      label.innerHTML = '<span style="width:24px;height:24px;background:rgba(255,255,255,0.25);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;margin-right:6px">' + (user.name||'U').charAt(0) + '</span>' +
        '<span>' + (user.name || user.uid) + '</span>' +
        '<span style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:99px;font-size:10.5px;margin-left:6px">관리자</span>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph113ForceUserBtnClick);
  else ph113ForceUserBtnClick();
  setInterval(ph113ForceUserBtnClick, 1500);

  console.log('[ph113] 사용자 메뉴 inline onclick 강제 부착 — 클릭하면 로그인/로그아웃/자료실/도움말');
})();
