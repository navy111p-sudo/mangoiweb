// ═══════════════════════════════════════════════════════════════
// adm-s2.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function getRoom(){ return (document.getElementById('rt-room-id').value||'').trim(); }
  function getUid(){ return (document.getElementById('rt-user-id').value||'').trim(); }
  function getRole(){ return (document.getElementById('rt-role').value||'student').trim(); }

  window.rtInvite = async function(){
    const roomId = getRoom(); const uid = getUid(); const role = getRole();
    if (!roomId || !uid) { alert('강의실 ID 와 학생 UID 를 입력해주세요'); return; }
    const out = document.getElementById('rt-result');
    try {
      const r = await fetch('/api/rooms/' + encodeURIComponent(roomId) + '/invite', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, role, invited_by: 'admin' })
      });
      const d = await r.json();
      out.innerHTML = d.ok
        ? '<div style="padding:12px;color:#86efac;background:rgba(16,185,129,0.10);border-radius:8px">✅ 초대 완료: <b>' + esc(roomId) + '</b> · <b>' + esc(uid) + '</b> (' + esc(role) + ')</div>'
        : '<div style="padding:12px;color:#fca5a5;background:rgba(239,68,68,0.10);border-radius:8px">⚠ ' + esc(d.error||'') + '</div>';
    } catch(e){ out.innerHTML = '<div style="padding:12px;color:#fca5a5">네트워크 오류</div>'; }
  };

  window.rtLoadMembers = async function(){
    const roomId = getRoom();
    if (!roomId) { alert('강의실 ID 를 입력해주세요'); return; }
    const out = document.getElementById('rt-result');
    out.innerHTML = '<div style="padding:10px;color:#a3b3d1">멤버 조회 중…</div>';
    try {
      const r = await fetch('/api/rooms/' + encodeURIComponent(roomId) + '/members');
      const d = await r.json();
      if (!d.ok || !d.items.length) {
        out.innerHTML = '<div style="padding:14px;color:#94a3b8">아직 초대된 멤버가 없습니다.</div>'; return;
      }
      const rows = d.items.map(it => {
        const dt = new Date(it.invited_at).toLocaleString('ko-KR');
        return '<tr><td>' + esc(it.user_id) + '</td><td>' + esc(it.user_name||'') + '</td><td><span style="padding:2px 8px;background:rgba(139,92,246,0.18);color:#c4b5fd;border-radius:99px;font-size:11px">' + esc(it.role) + '</span></td><td>' + dt + '</td></tr>';
      }).join('');
      out.innerHTML = '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="background:rgba(139,92,246,0.18)"><th style="padding:8px;text-align:left">학생 UID</th><th style="padding:8px;text-align:left">이름</th><th style="padding:8px;text-align:left">역할</th><th style="padding:8px;text-align:left">초대 시각</th></tr></thead><tbody>' + rows + '</tbody></table>';
    } catch(e){ out.innerHTML = '<div style="padding:12px;color:#fca5a5">네트워크 오류</div>'; }
  };

  window.rtTestJoin = async function(){
    const roomId = getRoom(); const uid = getUid();
    if (!roomId || !uid) { alert('강의실 ID 와 학생 UID 를 입력해주세요'); return; }
    const out = document.getElementById('rt-result');
    try {
      const r = await fetch('/api/rooms/' + encodeURIComponent(roomId) + '/join', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, allow_open: true })
      });
      const d = await r.json();
      if (!d.ok) { out.innerHTML = '<div style="padding:12px;color:#fca5a5">⚠ ' + esc(d.error||'') + ' — ' + esc(d.message||'') + '</div>'; return; }
      out.innerHTML = `<div style="padding:14px;background:rgba(16,185,129,0.10);border:1px solid rgba(16,185,129,0.30);border-radius:10px">
        <div style="color:#86efac;font-weight:800;margin-bottom:8px">✅ 토큰 발급 성공 (${d.expires_in}초 유효)</div>
        <div style="font-size:11.5px;color:#a3b3d1;margin-bottom:6px">role: <b style="color:#fcd34d">${esc(d.role)}</b> · jti: <code style="font-size:10.5px">${esc(d.jti)}</code></div>
        <textarea readonly style="width:100%;height:80px;background:#0c1a3a;color:#e6ecff;border:1px solid rgba(99,102,241,0.30);border-radius:6px;padding:8px;font-size:11px;font-family:monospace;resize:vertical">${esc(d.room_token)}</textarea>
        <div style="font-size:11px;color:#94a3b8;margin-top:6px">💡 이 토큰을 시그널링 URL 에 첨부: <code>?token=...</code></div>
      </div>`;
    } catch(e){ out.innerHTML = '<div style="padding:12px;color:#fca5a5">네트워크 오류</div>'; }
  };

  window.rtKick = async function(){
    const roomId = getRoom(); const uid = getUid();
    if (!roomId || !uid) { alert('강의실 ID 와 학생 UID 를 입력해주세요'); return; }
    if (!confirm(uid + ' 학생의 모든 토큰을 회수합니다 (강제 퇴장).')) return;
    try {
      const r = await fetch('/api/rooms/' + encodeURIComponent(roomId) + '/kick', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid })
      });
      const d = await r.json();
      const out = document.getElementById('rt-result');
      out.innerHTML = d.ok
        ? '<div style="padding:12px;color:#fca5a5;background:rgba(239,68,68,0.10);border-radius:8px">🚫 ' + esc(uid) + ' 토큰 회수 완료 — 다음 시그널링 연결 시 차단됩니다.</div>'
        : '<div style="padding:12px;color:#fca5a5">⚠ ' + esc(d.error||'') + '</div>';
    } catch(e){}
  };
})();
