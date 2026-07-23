// ═══════════════════════════════════════════════════════════════
// adm-s1.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const $ = id => document.getElementById(id);
  const v = id => ($(id)?.value||'').trim();

  // 👁 Ghost
  let _curObsId = null;

  /* 🔴 (2026-07-23) 진행 중인 수업 목록 — 매니저가 강의실 ID 를 몰라도 바로 참관/입장.
     기존 /api/active-rooms 를 그대로 쓴다(신규 API 없음).
     줄을 누르면 강의실 ID 칸이 채워지고, 버튼으로 참관 또는 직접 입장까지 이어진다. */
  function _ghIsEn(){ try { return localStorage.getItem('adminLang') === 'en'; } catch(e){ return false; } }
  window.ghPickRoom = function(roomId){
    const el = $('gh-room-id');
    if (!el) return;
    el.value = roomId;
    el.focus();
    try { el.style.outline = '2px solid #8b5cf6'; setTimeout(function(){ el.style.outline = ''; }, 1200); } catch(e){}
  };
  /* 🚪 매니저 직접 입장 — 강사가 못 들어왔을 때 대신 수업을 맡기 위한 통로.
     참관(ghost)과 달리 실제 참가자로 들어간다. 새 창으로 열어 관리자 화면은 그대로 둔다. */
  window.ghEnterRoom = function(roomId){
    const en = _ghIsEn();
    const msg = en ? ('Enter class "' + roomId + '" as a participant?\n(Students and the teacher will see you.)')
                   : ('수업 "' + roomId + '" 에 직접 입장할까요?\n(참관이 아니라 실제 참가자로 들어갑니다 — 학생·강사에게 보입니다.)');
    if (!confirm(msg)) return;
    const url = location.origin + '/?vc_autojoin=1&vc_role=teacher&vc_room=' + encodeURIComponent(roomId);
    window.open(url, '_blank', 'noopener');
  };
  window.ghLoadLive = async function(){
    const box = $('gh-live-list'), cnt = $('gh-live-count');
    const en = _ghIsEn();
    if (!box) return;
    box.textContent = en ? 'Loading…' : '불러오는 중…';
    try {
      const r = await fetch('/api/active-rooms', { credentials: 'include' });
      const rooms = await r.json();
      if (!Array.isArray(rooms) || !rooms.length) {
        box.innerHTML = '<div style="padding:10px 0;color:#94a3b8">'
          + (en ? 'No classes in progress right now.' : '지금 진행 중인 수업이 없습니다.') + '</div>';
        if (cnt) cnt.textContent = '';
        return;
      }
      if (cnt) cnt.textContent = en ? ('· ' + rooms.length + ' room(s)') : ('· ' + rooms.length + '개 방');
      box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
        + '<thead><tr style="color:#94a3b8;text-align:left">'
        +   '<th style="padding:6px 8px">' + (en ? 'Room' : '강의실') + '</th>'
        +   '<th style="padding:6px 8px">' + (en ? 'People' : '인원') + '</th>'
        +   '<th style="padding:6px 8px">' + (en ? 'Participants' : '참가자') + '</th>'
        +   '<th style="padding:6px 8px">' + (en ? 'Action' : '액션') + '</th>'
        + '</tr></thead><tbody>'
        + rooms.map(function(rm){
            const names = (rm.users || []).map(function(u){ return esc(u.username); }).join(', ') || '-';
            const rid = esc(rm.roomId);
            const ridAttr = encodeURIComponent(rm.roomId);
            /* 👤 한 명뿐이면 상대가 아직 안 들어온 상태 — 매니저가 가장 먼저 봐야 할 줄이라 표시 */
            const alone = (rm.userCount === 1)
              ? ' <span style="color:#fbbf24;font-weight:800">' + (en ? '⚠ waiting alone' : '⚠ 혼자 대기중') + '</span>' : '';
            return '<tr style="border-top:1px solid rgba(255,255,255,0.06)">'
              + '<td style="padding:6px 8px"><code style="color:#c4b5fd">' + rid + '</code>' + alone + '</td>'
              + '<td style="padding:6px 8px">' + (rm.userCount || 0) + '</td>'
              + '<td style="padding:6px 8px;color:#cbd5e1">' + names + '</td>'
              + '<td style="padding:6px 8px;white-space:nowrap">'
              +   '<button type="button" onclick="ghPickRoom(decodeURIComponent(\'' + ridAttr + '\'))" '
              +     'style="padding:4px 10px;font-size:11.5px;margin-right:4px;background:rgba(139,92,246,0.22);color:#ddd6fe;border:1px solid rgba(139,92,246,0.5);border-radius:6px;font-weight:700;cursor:pointer">'
              +     (en ? '👁 Select' : '👁 참관 선택') + '</button>'
              +   '<button type="button" onclick="ghEnterRoom(decodeURIComponent(\'' + ridAttr + '\'))" '
              +     'style="padding:4px 10px;font-size:11.5px;background:rgba(16,185,129,0.22);color:#a7f3d0;border:1px solid rgba(16,185,129,0.5);border-radius:6px;font-weight:700;cursor:pointer">'
              +     (en ? '🚪 Enter' : '🚪 직접 입장') + '</button>'
              + '</td></tr>';
          }).join('')
        + '</tbody></table>';
    } catch(e) {
      box.innerHTML = '<div style="padding:10px 0;color:#fca5a5">⚠ ' + esc(e.message || e) + '</div>';
    }
  };

  window.ghStart = async function(){
    const admin_uid = v('gh-admin-uid'), room_id = v('gh-room-id'), reason = v('gh-reason');
    if (!admin_uid || !room_id || !reason) { alert('관리자 UID, 강의실 ID, 사유 모두 필수입니다'); return; }
    const r = await fetch('/api/admin/ghost/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid, room_id, reason }) });
    const d = await r.json();
    if (d.ok) {
      _curObsId = d.observation_id;
      const viewerUrl = '/admin/ghost-view.html?room_id=' + encodeURIComponent(room_id) + '&obs_id=' + d.observation_id + '&admin_uid=' + encodeURIComponent(admin_uid);
      $('gh-result').innerHTML = `
        <div style="padding:16px;background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(124,58,237,0.08));border:1px solid rgba(139,92,246,0.40);border-radius:12px;color:#c4b5fd">
          <div style="font-weight:800;color:#ddd6fe;margin-bottom:10px;font-size:14px">✅ 참관 시작 (관찰 ID: <b>${d.observation_id}</b>)</div>
          <div style="font-size:12px;color:#a3b3d1;margin-bottom:14px">📡 학생·강사에게 알림 안 보냄 · 모든 행동은 감사 로그에 기록</div>
          <a href="${viewerUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 22px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:14px;box-shadow:0 6px 18px rgba(139,92,246,0.5)">🎬 라이브 화면 열기 (새 창)</a>
          <span style="margin-left:10px;font-size:11.5px;color:#94a3b8">└ 강의실 채팅·참가자·알림을 3초마다 실시간 표시</span>
        </div>`;
    } else $('gh-result').innerHTML = '<div style="padding:12px;color:#fca5a5">⚠ ' + esc(d.error||'') + (d.message?'<br>'+esc(d.message):'') + '</div>';
  };
  window.ghEnd = async function(){
    if (!_curObsId) { alert('진행 중인 참관 세션이 없습니다'); return; }
    const admin_uid = v('gh-admin-uid');
    const r = await fetch('/api/admin/ghost/end', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid, observation_id: _curObsId }) });
    const d = await r.json();
    $('gh-result').innerHTML = d.ok ? '<div style="padding:12px;color:#86efac">⏹ 참관 종료 (지속 ' + d.duration_sec + '초)</div>' : '<div style="color:#fca5a5">⚠ ' + esc(d.error||'') + '</div>';
    if (d.ok) _curObsId = null;
  };
  window.ghLoadSessions = async function(){
    const r = await fetch('/api/admin/ghost/sessions');
    const d = await r.json();
    if (!d.ok || !d.items.length) { $('gh-result').innerHTML = '<div style="padding:14px;color:#94a3b8">참관 기록이 없습니다.</div>'; return; }
    const rows = d.items.map(it => {
      const j = new Date(it.joined_at).toLocaleString('ko-KR');
      const dur = it.left_at ? Math.round((it.left_at - it.joined_at)/1000) + '초' : '<span style="color:#86efac">진행중</span>';
      return '<tr><td>' + esc(it.admin_uid) + '</td><td>' + esc(it.room_id) + '</td><td>' + esc(it.reason||'') + '</td><td>' + j + '</td><td>' + dur + '</td></tr>';
    }).join('');
    $('gh-result').innerHTML = '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="background:rgba(139,92,246,0.18)"><th style="padding:8px;text-align:left">관리자</th><th style="padding:8px;text-align:left">강의실</th><th style="padding:8px;text-align:left">사유</th><th style="padding:8px;text-align:left">시작</th><th style="padding:8px;text-align:left">지속</th></tr></thead><tbody>' + rows + '</tbody></table>';
  };

  // 📢 Whisper
  window.whSend = async function(){
    const admin_uid = v('wh-admin-uid'), room_id = v('wh-room-id'), teacher_uid = v('wh-teacher-uid');
    const message_type = v('wh-type') || 'text', urgency = v('wh-urgency') || 'normal', payload = v('wh-payload');
    if (!admin_uid || !room_id || !teacher_uid || !payload) { alert('모든 필드 필수'); return; }
    const r = await fetch('/api/admin/whisper/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid, room_id, teacher_uid, message_type, urgency, payload }) });
    const d = await r.json();
    $('wh-result').innerHTML = d.ok
      ? '<div style="padding:12px;color:#fde68a;background:rgba(245,158,11,0.10);border-radius:8px">📢 귓속말 큐 등록 완료 (ID: ' + d.whisper_id + ', 상태: ' + esc(d.delivery_status) + ')<br><span style="font-size:11px;color:#a3b3d1">' + esc(d.learning_note||'') + '</span></div>'
      : '<div style="padding:12px;color:#fca5a5">⚠ ' + esc(d.error||'') + '</div>';
  };
  window.whLoadLogs = async function(){
    const r = await fetch('/api/admin/whisper/logs');
    const d = await r.json();
    if (!d.ok || !d.items.length) { $('wh-result').innerHTML = '<div style="padding:14px;color:#94a3b8">발송 기록이 없습니다.</div>'; return; }
    const rows = d.items.map(it => {
      const t = new Date(it.sent_at).toLocaleString('ko-KR');
      const preview = (it.payload||'').slice(0, 50);
      return '<tr><td>' + esc(it.admin_uid) + '</td><td>' + esc(it.target_teacher_uid) + '</td><td><span style="padding:2px 8px;background:rgba(245,158,11,0.18);color:#fcd34d;border-radius:99px;font-size:11px">' + esc(it.message_type) + '</span></td><td>' + esc(preview) + '…</td><td>' + t + '</td></tr>';
    }).join('');
    $('wh-result').innerHTML = '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="background:rgba(245,158,11,0.18)"><th style="padding:8px;text-align:left">관리자</th><th style="padding:8px;text-align:left">강사</th><th style="padding:8px;text-align:left">유형</th><th style="padding:8px;text-align:left">내용</th><th style="padding:8px;text-align:left">시각</th></tr></thead><tbody>' + rows + '</tbody></table>';
  };

  // 🚨 Alerts
  window.alLoad = async function(){
    const r = await fetch('/api/admin/alerts');
    const d = await r.json();
    if (!d.ok || !d.items.length) { $('al-result').innerHTML = '<div style="padding:14px;color:#94a3b8">알림이 없습니다.</div>'; return; }
    const rows = d.items.map(it => {
      const t = new Date(it.triggered_at).toLocaleString('ko-KR');
      const sev = it.severity === 'high' ? '#fca5a5' : it.severity === 'medium' ? '#fcd34d' : '#94a3b8';
      const ack = it.acknowledged_at ? '✅ 확인' : '<button onclick="alAck(' + it.id + ')" style="padding:3px 10px;background:rgba(16,185,129,0.18);color:#86efac;border:1px solid rgba(16,185,129,0.35);border-radius:6px;cursor:pointer;font-size:11px">✓ 확인</button>';
      return '<tr><td>' + it.id + '</td><td>' + esc(it.room_id) + '</td><td><span style="color:' + sev + ';font-weight:800">' + esc(it.alert_type) + '</span></td><td>' + esc(it.severity) + '</td><td>' + esc((it.detail||'').slice(0, 80)) + '</td><td>' + t + '</td><td>' + ack + '</td></tr>';
    }).join('');
    $('al-result').innerHTML = '<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr style="background:rgba(239,68,68,0.18)"><th style="padding:8px;text-align:left">#</th><th style="padding:8px;text-align:left">강의실</th><th style="padding:8px;text-align:left">유형</th><th style="padding:8px;text-align:left">심각</th><th style="padding:8px;text-align:left">상세</th><th style="padding:8px;text-align:left">시각</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
  };
  window.alAck = async function(id){
    const admin_uid = prompt('관리자 UID 를 입력하세요:');
    if (!admin_uid) return;
    await fetch('/api/admin/alerts/' + id + '/ack', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ admin_uid }) });
    alLoad();
  };
  window.alTestFire = async function(){
    const room_id = prompt('테스트 강의실 ID (예: test-room):') || 'test-room';
    const alert_type = prompt('알림 유형 (silence_20s / forbidden_word / low_engagement):') || 'silence_20s';
    await fetch('/api/admin/alerts/test-fire', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ room_id, alert_type, severity: 'medium' }) });
    alLoad();
  };

  // 📝 Forbidden words
  window.fwLoad = async function(){
    const r = await fetch('/api/admin/forbidden-words');
    const d = await r.json();
    let html = '<div style="margin-bottom:10px"><input id="fw-word" type="text" placeholder="금지 단어" style="padding:7px 10px;background:#142950;color:#e6ecff;border:1px solid rgba(99,102,241,0.30);border-radius:6px;font-size:12.5px"> <select id="fw-sev" style="padding:7px;background:#142950;color:#e6ecff;border:1px solid rgba(99,102,241,0.30);border-radius:6px;font-size:12px"><option value="low">낮음</option><option value="medium" selected>보통</option><option value="high">높음</option></select> <button onclick="fwAdd()" style="padding:7px 14px;background:rgba(239,68,68,0.20);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);border-radius:6px;cursor:pointer;font-size:12.5px">+ 추가</button></div>';
    if (d.ok && d.items.length) {
      const rows = d.items.map(it => '<tr><td>' + esc(it.word) + '</td><td><span style="padding:2px 8px;background:rgba(239,68,68,0.15);color:#fca5a5;border-radius:99px;font-size:11px">' + esc(it.severity) + '</span></td><td>' + esc(it.language) + '</td><td>' + (it.enabled?'✅':'❌') + '</td><td><button onclick="fwDel(' + it.id + ')" style="padding:3px 10px;background:rgba(239,68,68,0.18);color:#fca5a5;border:1px solid rgba(239,68,68,0.35);border-radius:6px;cursor:pointer;font-size:11px">🗑</button></td></tr>').join('');
      html += '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead><tr style="background:rgba(239,68,68,0.15)"><th style="padding:8px;text-align:left">단어</th><th style="padding:8px;text-align:left">심각</th><th style="padding:8px;text-align:left">언어</th><th style="padding:8px;text-align:left">사용</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';
    } else html += '<div style="padding:14px;color:#94a3b8">등록된 금지 단어가 없습니다.</div>';
    $('al-result').innerHTML = html;
  };
  window.fwAdd = async function(){
    const word = $('fw-word').value.trim(), severity = $('fw-sev').value;
    if (!word) { alert('단어를 입력하세요'); return; }
    await fetch('/api/admin/forbidden-words', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ word, severity, added_by: 'admin' }) });
    fwLoad();
  };
  window.fwDel = async function(id){
    if (!confirm('이 단어를 비활성화할까요?')) return;
    await fetch('/api/admin/forbidden-words/' + id, { method:'DELETE' });
    fwLoad();
  };
})();
