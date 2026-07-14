// ═══════════════════════════════════════════════════════════════
// adm-s3.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function isEn(){ return window.adminLang === 'en'; }
  function v(id){ const el = document.getElementById(id); return el ? el.value : ''; }
  function showErr(box, msg){ box.innerHTML = `<div style="background:#fee2e2;border:1px solid #fca5a5;color:#7f1d1d;padding:10px;border-radius:8px">❌ ${esc(msg)}</div>`; }

  window.aluRegister = async function(){
    const en = isEn();
    const out = document.getElementById('alu-reg-result');
    const payload = {
      user_id: v('alu-uid').trim(),
      grad_month: v('alu-grad'),
      status: v('alu-status'),
      field: v('alu-field').trim(),
      region: v('alu-region').trim(),
      message: v('alu-msg').trim(),
      mentor_available: !!(document.getElementById('alu-mentor')||{}).checked
    };
    if (!payload.user_id || !payload.grad_month) { showErr(out, en?'user_id + graduation required':'학생 + 졸업년월 필수'); return; }
    out.innerHTML = `<div style="color:#a5b4fc">⏳ ${en?'Saving…':'저장 중…'}</div>`;
    try {
      const r = await fetch('/api/alumni/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));
      if (r.ok) out.innerHTML = `<div style="background:#dcfce7;border:1px solid #86efac;color:#14532d;padding:10px;border-radius:8px">✅ ${en?'Registered!':'등록 완료!'} (${esc(payload.user_id)})</div>`;
      else showErr(out, r.error || 'failed');
    } catch(e){ showErr(out, e.message); }
  };

  window.aluLoadList = async function(){
    const en = isEn();
    const box = document.getElementById('alu-list');
    box.innerHTML = `<div style="grid-column:1/-1;color:#a5b4fc;padding:20px;text-align:center">⏳ ${en?'Loading…':'불러오는 중…'}</div>`;
    try {
      const qs = new URLSearchParams();
      if (v('alu-f-year')) qs.set('year', v('alu-f-year'));
      if (v('alu-f-field')) qs.set('field', v('alu-f-field'));
      const r = await fetch('/api/alumni/list?'+qs.toString()).then(x=>x.json()).catch(()=>({ok:false}));
      if (!r.ok) throw new Error(r.error || 'failed');
      const list = r.list || [];
      if (!list.length) { box.innerHTML = `<div style="grid-column:1/-1;color:#94a3b8;padding:20px;text-align:center">📭 ${en?'No alumni found':'해당하는 졸업생 없음'}</div>`; return; }
      box.innerHTML = list.map(a => {
        const photo = a.photo_url ? `<img src="${esc(a.photo_url)}" alt="" style="width:54px;height:54px;border-radius:50%;object-fit:cover">` :
          `<div style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px">${esc(String(a.name||a.user_id||'?').charAt(0))}</div>`;
        const mentor = a.mentor_available ? `<span style="background:#fbbf24;color:#7c2d12;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px">${en?'MENTOR':'멘토'}</span>` : '';
        return `<div style="background:linear-gradient(180deg,#f8fafc,#eef2ff);border:1px solid rgba(99,102,241,0.25);border-radius:10px;padding:12px;box-shadow:0 2px 6px rgba(0,0,0,0.18)">
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
            ${photo}
            <div style="flex:1">
              <div style="color:#0f172a;font-weight:700;font-size:14px">${esc(a.name||a.user_id||'-')}${mentor}</div>
              <div style="color:#475569;font-size:11px">${esc(a.grad_month||'-')} · ${esc(a.status||'-')}</div>
            </div>
          </div>
          <div style="color:#0f172a;font-size:12px"><b>${en?'Field':'분야'}:</b> ${esc(a.field||'-')}</div>
          <div style="color:#0f172a;font-size:12px"><b>${en?'Region':'지역'}:</b> ${esc(a.region||'-')}</div>
          ${a.message ? `<div style="color:#334155;font-size:12px;margin-top:6px;font-style:italic">"${esc(a.message)}"</div>` : ''}
        </div>`;
      }).join('');
    } catch(e){ box.innerHTML = `<div style="grid-column:1/-1;color:#fca5a5">❌ ${esc(e.message)}</div>`; }
  };

  window.aluPost = async function(){
    const en = isEn();
    const title = v('alu-p-title').trim();
    const body = v('alu-p-body').trim();
    const tags = v('alu-p-tags').split(',').map(s=>s.trim()).filter(Boolean);
    if (!title || !body) { alert(en?'Title + body required':'제목과 내용 필수'); return; }
    const r = await fetch('/api/alumni/post', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title, body, tags}) }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));
    alert(r.ok ? (en?'Posted!':'게시 완료!') : '❌ '+(r.error||''));
    if (r.ok) { document.getElementById('alu-p-title').value=''; document.getElementById('alu-p-body').value=''; document.getElementById('alu-p-tags').value=''; aluLoadPosts(); }
  };

  window.aluLoadPosts = async function(){
    const en = isEn();
    const box = document.getElementById('alu-posts');
    box.innerHTML = `<div style="color:#a5b4fc;padding:14px">⏳ ${en?'Loading…':'불러오는 중…'}</div>`;
    try {
      const r = await fetch('/api/alumni/posts?limit=20').then(x=>x.json()).catch(()=>({ok:false}));
      if (!r.ok) throw new Error(r.error || 'failed');
      const list = r.list || [];
      if (!list.length) { box.innerHTML = `<div style="color:#94a3b8;padding:14px;text-align:center">📭 ${en?'No posts yet':'게시글이 없습니다'}</div>`; return; }
      box.innerHTML = list.map(p => `
        <div style="background:linear-gradient(180deg,#f8fafc,#eef2ff);border:1px solid rgba(99,102,241,0.25);border-radius:10px;padding:12px;box-shadow:0 2px 6px rgba(0,0,0,0.18)">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
            <div style="color:#0f172a;font-weight:700;font-size:14px">${esc(p.title||'-')}</div>
            <div style="color:#64748b;font-size:11px">${esc(p.author||'?')} · ${esc((p.created_at||'').slice(0,10))}</div>
          </div>
          <div style="color:#1e293b;font-size:13px;line-height:1.5;white-space:pre-wrap">${esc(p.body||'')}</div>
          ${(p.tags||[]).length ? `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${(p.tags||[]).map(t=>`<span style="background:#e0e7ff;color:#3730a3;padding:2px 6px;border-radius:4px;font-size:10.5px;font-weight:700">#${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      `).join('');
    } catch(e){ box.innerHTML = `<div style="color:#fca5a5">❌ ${esc(e.message)}</div>`; }
  };

  document.getElementById('card-alumni')?.addEventListener('toggle', function(){
    if (this.open) { aluLoadList(); aluLoadPosts(); }
  });
})();
