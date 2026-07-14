// ═══════════════════════════════════════════════════════════════
// adm-s4.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function isEn(){ return window.adminLang === 'en'; }
  function v(id){ const el = document.getElementById(id); return el ? el.value : ''; }

  window.vdLoadList = async function(){
    const en = isEn();
    const uid = v('vd-uid').trim();
    const month = v('vd-month');
    const list = document.getElementById('vd-list');
    const summary = document.getElementById('vd-summary');
    if (!uid) { list.innerHTML = `<div style="color:#fca5a5">${en?'Enter student UID':'학생 UID를 입력하세요'}</div>`; return; }
    list.innerHTML = `<div style="color:#a5b4fc;padding:14px">⏳ ${en?'Loading…':'불러오는 중…'}</div>`;
    summary.innerHTML = '';
    try {
      const qs = new URLSearchParams({ user_id: uid });
      if (month) qs.set('month', month);
      const r = await fetch('/api/diary/list?'+qs.toString()).then(x=>x.json()).catch(()=>({ok:false}));
      if (!r.ok) throw new Error(r.error || 'failed');
      const items = r.entries || r.list || [];
      const total = items.length;
      const avg = total ? (items.reduce((s,x)=>s+(Number(x.score)||0),0)/total).toFixed(1) : '-';
      const totalSec = items.reduce((s,x)=>s+(Number(x.duration_seconds)||0),0);
      summary.innerHTML = `<div class="vd-light" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
        <div><div style="font-size:11px;color:#475569">${en?'Entries':'일기 수'}</div><div style="font-size:22px;font-weight:800;color:#4f46e5">${total}</div></div>
        <div><div style="font-size:11px;color:#475569">${en?'Avg Score':'평균 점수'}</div><div style="font-size:22px;font-weight:800;color:#16a34a">${avg}</div></div>
        <div><div style="font-size:11px;color:#475569">${en?'Total Time':'총 녹음'}</div><div style="font-size:22px;font-weight:800;color:#d97706">${Math.round(totalSec)}s</div></div>
      </div>`;
      if (!total) { list.innerHTML = `<div style="color:#94a3b8;padding:14px;text-align:center">📭 ${en?'No entries this month':'이 달에 작성된 일기가 없습니다'}</div>`; return; }
      list.innerHTML = items.map(x => `
        <div class="vd-row">
          <div style="display:flex;gap:10px;align-items:center">
            <span style="background:#6366f1;color:#fff;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">${esc((x.date||'').slice(5))}</span>
            <span style="color:#0f172a;font-size:12px">${en?'Score':'점수'}: <b style="color:#16a34a">${x.score!=null?x.score:'-'}</b></span>
            <span style="color:#475569;font-size:11px">${Math.round(x.duration_seconds||0)}s</span>
          </div>
          <button class="vd-btn" style="padding:5px 12px;font-size:12px" onclick="vdShow(${x.id})" data-ko="상세" data-en="Detail">상세</button>
        </div>
      `).join('');
    } catch(e){ list.innerHTML = `<div style="color:#fca5a5">❌ ${esc(e.message)}</div>`; }
  };

  window.vdShow = async function(id){
    const en = isEn();
    const backdrop = document.getElementById('vd-modal-backdrop');
    const body = document.getElementById('vd-modal-body');
    backdrop.classList.add('open');
    body.innerHTML = `<div style="color:#475569;padding:30px;text-align:center">⏳ ${en?'Loading…':'불러오는 중…'}</div>`;
    try {
      const r = await fetch('/api/diary/'+id).then(x=>x.json()).catch(()=>({ok:false}));
      if (!r.ok) throw new Error(r.error || 'failed');
      const d = r.entry || r.diary || {};
      body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0;color:#0f172a">📔 ${en?'Diary Detail':'일기 상세'} — ${esc(d.date||'-')}</h3>
          <button onclick="document.getElementById('vd-modal-backdrop').classList.remove('open')" style="background:#e5e7eb;color:#1f2937;border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:700">✕</button>
        </div>
        ${d.audio_url ? `<audio controls style="width:100%;margin-bottom:12px" src="${esc(d.audio_url)}"></audio>` : ''}
        <div style="background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:12px;margin-bottom:10px">
          <div style="font-size:11.5px;color:#4338ca;font-weight:700;margin-bottom:4px">📝 ${en?'Transcript':'영문 전사'}</div>
          <div style="color:#0f172a;font-size:13px;line-height:1.6">${esc(d.transcript_en||d.transcript||'-')}</div>
        </div>
        <div style="background:#fff;border:1px solid #fcd34d;border-radius:10px;padding:12px;margin-bottom:10px">
          <div style="font-size:11.5px;color:#b45309;font-weight:700;margin-bottom:4px">🤖 ${en?'AI Correction':'AI 첨삭'}</div>
          <div style="color:#0f172a;font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(d.ai_correction||d.correction||(en?'(not corrected yet)':'(아직 첨삭 없음)'))}</div>
        </div>
        <div style="background:#fff;border:1px solid #86efac;border-radius:10px;padding:12px;margin-bottom:10px">
          <div style="font-size:11.5px;color:#15803d;font-weight:700;margin-bottom:4px">🌟 ${en?'Encouragement':'한국어 격려'}</div>
          <div style="color:#0f172a;font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(d.ai_encouragement_ko||d.encouragement||'-')}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#0f172a">
          <span>${en?'Score':'점수'}: <b style="color:#16a34a;font-size:18px">${d.score!=null?d.score:'-'}</b></span>
          <span>${en?'Duration':'녹음 길이'}: ${Math.round(d.duration_seconds||0)}s</span>
        </div>
      `;
    } catch(e){ body.innerHTML = `<div style="color:#dc2626;padding:20px">❌ ${esc(e.message)}</div>
      <button onclick="document.getElementById('vd-modal-backdrop').classList.remove('open')" style="background:#e5e7eb;color:#1f2937;border:0;border-radius:6px;padding:6px 10px;margin-top:10px;cursor:pointer">Close</button>`; }
  };

  document.getElementById('vd-modal-backdrop')?.addEventListener('click', function(e){
    if (e.target === this) this.classList.remove('open');
  });

  document.getElementById('card-voice-diary')?.addEventListener('toggle', function(){
    if (this.open) {
      const m = document.getElementById('vd-month');
      if (m && !m.value) {
        const d = new Date(); m.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      }
    }
  });
})();
