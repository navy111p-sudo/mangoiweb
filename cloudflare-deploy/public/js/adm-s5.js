// ═══════════════════════════════════════════════════════════════
// adm-s5.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function isEn(){ return window.adminLang === 'en'; }
  function v(id){ const el = document.getElementById(id); return el ? el.value : ''; }
  function showOK(box, msg){ box.innerHTML = `<div style="background:#dcfce7;border:1px solid #86efac;color:#14532d;padding:10px;border-radius:8px">✅ ${esc(msg)}</div>`; }
  function showErr(box, msg){ box.innerHTML = `<div style="background:#fee2e2;border:1px solid #fca5a5;color:#7f1d1d;padding:10px;border-radius:8px">❌ ${esc(msg)}</div>`; }

  window.supAssign = async function(){
    const en = isEn();
    const out = document.getElementById('sup-assign-result');
    const mentor_uid = v('sup-mentor').trim();
    const junior_uid = v('sup-junior').trim();
    const room_id    = v('sup-room').trim();
    if (!mentor_uid || !junior_uid || !room_id) { showErr(out, en?'All 3 fields required':'3개 필드 모두 입력'); return; }
    out.innerHTML = `<div style="color:#a5b4fc">⏳ ${en?'Assigning…':'배정 중…'}</div>`;
    try {
      const r = await fetch('/api/supervisor/assign', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({mentor_uid, junior_uid, room_id}) }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));
      if (r.ok) showOK(out, (en?'Assigned. ID ':'배정 완료. ID ')+(r.assignment_id||'-'));
      else showErr(out, r.error || 'failed');
    } catch(e){ showErr(out, e.message); }
  };

  window.supLoadActive = async function(){
    const en = isEn();
    const box = document.getElementById('sup-active-list');
    box.innerHTML = `<div style="color:#a5b4fc;padding:14px">⏳ ${en?'Loading…':'불러오는 중…'}</div>`;
    try {
      const qs = new URLSearchParams();
      if (v('sup-active-mentor').trim()) qs.set('mentor_uid', v('sup-active-mentor').trim());
      const r = await fetch('/api/supervisor/active?'+qs.toString()).then(x=>x.json()).catch(()=>({ok:false}));
      if (!r.ok) throw new Error(r.error || 'failed');
      const list = r.list || [];
      if (!list.length) { box.innerHTML = `<div style="color:#94a3b8;padding:14px;text-align:center">📭 ${en?'No active assignments':'활성 배정 없음'}</div>`; return; }
      box.innerHTML = list.map(a => `
        <div style="background:linear-gradient(180deg,#f8fafc,#eef2ff);border:1px solid rgba(99,102,241,0.25);border-radius:10px;padding:10px 12px;box-shadow:0 2px 6px rgba(0,0,0,0.18);display:flex;justify-content:space-between;align-items:center">
          <div style="color:#0f172a;font-size:13px">
            <b>#${esc(a.id)}</b> · 🧑‍🏫 ${esc(a.mentor_uid)} → 👤 ${esc(a.junior_uid)}
            <span style="color:#475569;font-size:11px;margin-left:6px">📍 ${esc(a.room_id)}</span>
          </div>
          <div style="display:flex;gap:4px">
            <button class="sup-btn sup-btn-ghost" style="padding:5px 10px;font-size:11px" onclick="document.getElementById('sup-ghost-room').value='${esc(a.room_id)}';supOpenGhost()" data-ko="👁 참관" data-en="👁 Observe">👁 참관</button>
            <button class="sup-btn" style="padding:5px 10px;font-size:11px" onclick="document.getElementById('sup-note-aid').value='${esc(String(a.id))}';" data-ko="📝 노트" data-en="📝 Note">📝 노트</button>
          </div>
        </div>
      `).join('');
    } catch(e){ box.innerHTML = `<div style="color:#fca5a5">❌ ${esc(e.message)}</div>`; }
  };

  window.supSendNote = async function(){
    const en = isEn();
    const out = document.getElementById('sup-note-result');
    const assignment_id = Number(v('sup-note-aid'));
    const message = v('sup-note-msg').trim();
    const priority = v('sup-note-pri') || 'normal';
    if (!assignment_id || !message) { showErr(out, en?'Assignment ID + message required':'배정 ID + 메시지 필수'); return; }
    out.innerHTML = `<div style="color:#a5b4fc">⏳ ${en?'Sending…':'전송 중…'}</div>`;
    try {
      const r = await fetch('/api/supervisor/note', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({assignment_id, message, priority}) }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));
      if (r.ok) { showOK(out, en?'Note sent.':'노트 전송 완료.'); document.getElementById('sup-note-msg').value=''; }
      else showErr(out, r.error || 'failed');
    } catch(e){ showErr(out, e.message); }
  };

  window.supLoadIncoming = async function(){
    const en = isEn();
    const box = document.getElementById('sup-incoming-list');
    const uid = v('sup-inc-uid').trim();
    if (!uid) { box.innerHTML = `<div style="color:#fca5a5">${en?'Enter junior UID':'후배 UID 입력'}</div>`; return; }
    box.innerHTML = `<div style="color:#a5b4fc;padding:14px">⏳ ${en?'Polling…':'폴링 중…'}</div>`;
    try {
      const r = await fetch('/api/supervisor/notes/incoming?junior_uid='+encodeURIComponent(uid)).then(x=>x.json()).catch(()=>({ok:false}));
      if (!r.ok) throw new Error(r.error || 'failed');
      const list = r.list || [];
      if (!list.length) { box.innerHTML = `<div style="color:#94a3b8;padding:14px;text-align:center">📭 ${en?'No incoming notes':'수신 노트 없음'}</div>`; return; }
      box.innerHTML = list.map(n => {
        const pc = n.priority==='urgent' ? '#dc2626' : n.priority==='high' ? '#d97706' : '#16a34a';
        const pl = n.priority==='urgent' ? '🔴 URGENT' : n.priority==='high' ? '🟡 HIGH' : '🟢 NORMAL';
        return `<div style="background:linear-gradient(180deg,#f8fafc,#eef2ff);border-left:4px solid ${pc};border:1px solid rgba(99,102,241,0.25);border-left:4px solid ${pc};border-radius:8px;padding:10px 12px;box-shadow:0 2px 6px rgba(0,0,0,0.18)">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="color:${pc};font-weight:800;font-size:11px">${pl}</span>
            <span style="color:#64748b;font-size:11px">${esc((n.created_at||'').slice(0,16).replace('T',' '))}</span>
          </div>
          <div style="color:#0f172a;font-size:13px;line-height:1.5;white-space:pre-wrap">${esc(n.message||'-')}</div>
          <div style="color:#475569;font-size:11px;margin-top:4px">— ${esc(n.mentor_uid||'mentor')}</div>
        </div>`;
      }).join('');
    } catch(e){ box.innerHTML = `<div style="color:#fca5a5">❌ ${esc(e.message)}</div>`; }
  };

  window.supOpenGhost = function(){
    const en = isEn();
    const room = v('sup-ghost-room').trim();
    if (!room) { alert(en?'Enter room ID':'강의실 ID 입력'); return; }
    window.open('/admin/ghost-view.html?room_id='+encodeURIComponent(room), '_blank', 'width=1280,height=820');
  };

  document.getElementById('card-supervisor')?.addEventListener('toggle', function(){
    if (this.open) supLoadActive();
  });
})();
