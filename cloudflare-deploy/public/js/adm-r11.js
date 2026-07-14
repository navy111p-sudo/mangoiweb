// ═══════════════════════════════════════════════════════════════
// adm-r11.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const fmtTs = (ms) => {
    if (!ms) return '-';
    const d = new Date(Number(ms));
    const p = (n) => (n<10?'0':'')+n;
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
  };
  const myName = () => {
    try { const s = JSON.parse(localStorage.getItem('mangoi_admin_session')||'null'); return (s && s.name) || '관리자'; } catch(e){ return '관리자'; }
  };

  window.srqLoad = async function(){
    const isEn = (window.adminLang === 'en');
    const status = (document.getElementById('srq-filter')||{}).value || 'pending';
    const box = document.getElementById('srq-table');
    box.innerHTML = `<div style="padding:20px;color:#6b7280;text-align:center">${isEn?'Loading…':'불러오는 중…'}</div>`;
    try {
      const r = await fetch(`/api/admin/schedule-requests?status=${status}&limit=200`, { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'load failed');
      const rows = d.rows || [];
      const badge = document.getElementById('srq-badge');
      if (badge){
        if (d.pending_count > 0){ badge.style.display=''; badge.textContent = (isEn?'Pending ':'대기 ')+d.pending_count; }
        else badge.style.display='none';
      }
      document.getElementById('srq-summary').innerHTML = isEn
        ? `Pending <b style="color:#dc2626">${d.pending_count}</b> · Showing ${rows.length}`
        : `대기 중 <b style="color:#dc2626">${d.pending_count}</b>건 · 표시 ${rows.length}건`;
      if (!rows.length){
        box.innerHTML = `<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">${isEn?'No requests. 🎉':'요청이 없습니다. 🎉'}</div>`;
        return;
      }
      const H = isEn
        ? { at:'Requested at', teacher:'Teacher', type:'Type', student:'Student', orig:'Original class', want:'Requested change', reason:'Reason', status:'Status', act:'Actions', approve:'✅ Approve', reject:'❌ Reject', postpone:'⏸ Postpone', change:'🔀 Move', pending:'⏳ Pending', approved:'✅ Approved', rejected:'❌ Rejected', hold:'(hold — pick later)' }
        : { at:'요청 시각', teacher:'강사', type:'유형', student:'학생', orig:'원래 수업 일시', want:'희망 변경 일시', reason:'사유', status:'상태', act:'처리', approve:'✅ 승인', reject:'❌ 거절', postpone:'⏸ 연기', change:'🔀 변경', pending:'⏳ 대기', approved:'✅ 승인됨', rejected:'❌ 거절됨', hold:'(보류 — 추후 협의)' };
      box.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:linear-gradient(135deg,#fef3c7,#fde68a)"><tr>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.at}</th>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.teacher}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.type}</th>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.student}</th>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.orig}</th>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.want}</th>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.reason}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.status}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.act}</th>
        </tr></thead>
        <tbody>${rows.map(r => {
          const typBase = r.request_type === 'change'
            ? `<span style="padding:3px 9px;border-radius:99px;font-size:11px;font-weight:800;background:#dbeafe;color:#1e40af">${H.change}</span>`
            : r.request_type === 'cancel'
            ? `<span style="padding:3px 9px;border-radius:99px;font-size:11px;font-weight:800;background:#fee2e2;color:#b91c1c">${isEn?'🗑 Cancel':'🗑 취소'}</span>`
            : `<span style="padding:3px 9px;border-radius:99px;font-size:11px;font-weight:800;background:#fef9c3;color:#854d0e">${H.postpone}</span>`;
          // 🆕 유료/무료 배지 (연기·취소 요청에만 fee_type 존재)
          const feeBadge = r.fee_type === 'paid'
            ? `<br><span style="display:inline-block;margin-top:3px;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:800;background:#fef3c7;color:#b45309">${isEn?'💰 Paid':'💰 유료'}</span>`
            : r.fee_type === 'free'
            ? `<br><span style="display:inline-block;margin-top:3px;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:800;background:#dcfce7;color:#15803d">${isEn?'🆓 Free':'🆓 무료'}</span>`
            : '';
          const typ = typBase + feeBadge;
          const st = r.status === 'approved'
            ? `<span style="color:#10b981;font-weight:700">${H.approved}</span><br><span style="font-size:10px;color:#9ca3af">${fmtTs(r.decided_at)}<br>${esc(r.decided_by||'')}</span>`
            : r.status === 'rejected'
            ? `<span style="color:#ef4444;font-weight:700">${H.rejected}</span><br><span style="font-size:10px;color:#9ca3af">${fmtTs(r.decided_at)}<br>${esc(r.decided_by||'')}</span>`
            : `<span style="color:#d97706;font-weight:800">${H.pending}</span>`;
          const want = r.new_date
            ? `<b style="color:#1e40af">${esc(r.new_date)} ${esc(r.new_time||'')}</b>`
            : `<span style="color:#9ca3af">${H.hold}</span>`;
          const act = r.status === 'pending'
            ? `<button onclick="srqDecide(${r.id},'approve')" style="padding:5px 10px;font-size:11px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">${H.approve}</button>
               <button onclick="srqDecide(${r.id},'reject')" style="padding:5px 10px;font-size:11px;background:#ef4444;color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700;margin-left:4px">${H.reject}</button>`
            : (r.decide_memo ? `<span style="font-size:11px;color:#6b7280">💬 ${esc(r.decide_memo)}</span>` : '<span style="color:#d1d5db">—</span>');
          return `<tr style="border-bottom:1px solid #e5e7eb;${r.status==='pending'?'background:#fffbeb':''}">
            <td style="padding:9px 12px;white-space:nowrap;color:#374151">${fmtTs(r.created_at)}</td>
            <td style="padding:9px 12px;font-weight:700">${esc(r.teacher_name||'-')}</td>
            <td style="padding:9px 12px;text-align:center">${typ}</td>
            <td style="padding:9px 12px">${esc(r.student_name||'-')}</td>
            <td style="padding:9px 12px;white-space:nowrap"><b>${esc(r.orig_date||'-')}</b> ${esc(r.orig_time||'')}</td>
            <td style="padding:9px 12px;white-space:nowrap">${want}</td>
            <td style="padding:9px 12px;max-width:200px;color:#4b5563">${esc(r.reason||'-')}</td>
            <td style="padding:9px 12px;text-align:center">${st}</td>
            <td style="padding:8px 10px;text-align:center;white-space:nowrap">${act}</td>
          </tr>`;}).join('')}</tbody>
      </table>`;
    } catch(e) {
      box.innerHTML = `<div style="padding:20px;color:#ef4444">${isEn?'Failed: ':'로드 실패: '}${esc(e.message)}</div>`;
    }
  };

  window.srqDecide = async function(id, action){
    const isEn = (window.adminLang === 'en');
    const approving = action === 'approve';
    const memo = prompt(approving
      ? (isEn?'Memo for approval (optional):':'승인 메모 (선택):')
      : (isEn?'Reason for rejection (shown to the teacher):':'거절 사유 (강사에게 표시돼요):'), '');
    if (memo === null) return;
    try {
      const r = await fetch('/api/admin/schedule-requests/decide', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id, action, memo, decided_by: myName() })
      });
      const d = await r.json();
      if (d.ok){
        alert(approving
          ? (d.applied === 'moved'
              ? (isEn?'✅ Approved — the class was moved to the new date/time.':'✅ 승인 완료 — 수업이 새 일시로 이동됐어요.')
              : d.applied === 'postponed'
              ? (isEn?'✅ Approved — the class is now on hold (postponed).':'✅ 승인 완료 — 수업이 연기(보류) 처리됐어요.')
              : d.applied === 'recorded'
              ? (isEn?'✅ Approved & recorded. This is a weekly recurring class, so the timetable was not auto-changed — please adjust that week manually in the schedule.':'✅ 승인·기록 완료. 매주 반복 수업이라 시간표는 자동 변경하지 않았어요 — 해당 주만 시간표에서 직접 조정해 주세요.')
              : (isEn?'✅ Approved.':'✅ 승인 완료.'))
          : (isEn?'❌ Rejected.':'❌ 거절 처리했어요.'));
        srqLoad();
      } else alert('⚠️ ' + (d.error||(isEn?'failed':'실패')));
    } catch(e){ alert('⚠️ '+e.message); }
  };

  function bind(){
    const card = document.getElementById('card-schedule-requests');
    if (card && !card.__srqBound){
      card.__srqBound = true;
      card.addEventListener('toggle', () => { if (card.open) srqLoad(); });
    }
    // 대기 건수 배지는 카드를 안 열어도 보이게 1회 미리 로드
    fetch('/api/admin/schedule-requests?status=pending&limit=1', { credentials:'include' })
      .then(r=>r.json()).then(d=>{
        const badge = document.getElementById('srq-badge');
        if (badge && d && d.ok && d.pending_count > 0){ badge.style.display=''; badge.textContent = (window.adminLang==='en'?'Pending ':'대기 ')+d.pending_count; }
      }).catch(()=>{});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  document.addEventListener('mangoi:lang-changed', function(){
    const card = document.getElementById('card-schedule-requests');
    if (card && card.open) srqLoad();
  });
})();
