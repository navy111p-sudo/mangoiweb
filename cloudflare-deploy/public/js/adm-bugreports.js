// ═══════════════════════════════════════════════════════════════
// adm-bugreports.js — 🐞 교사 버그/피드백 접수함 (관리자)
//   /api/admin/bug-reports (GET 목록·counts, PATCH 상태/메모, DELETE)
//   adm-r7.js(상담 관리) 패턴 그대로. 전역 classic script.
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'}) : '-';
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const _isEn = () => (document.documentElement.lang === 'en' || window.adminLang === 'en');
  const STATUS_LABEL_KO = { new:'🆕 미접수', in_progress:'🔧 처리중', resolved:'✅ 완료' };
  const STATUS_LABEL_EN = { new:'🆕 New', in_progress:'🔧 In progress', resolved:'✅ Resolved' };
  const STATUS_LABEL = (st) => (_isEn()?STATUS_LABEL_EN:STATUS_LABEL_KO)[st] || st;
  const STATUS_COLOR = { new:'#ef4444', in_progress:'#f59e0b', resolved:'#10b981' };
  const CAT_LABEL_KO = { bug:'🐛 버그', improve:'💡 개선', etc:'💬 기타', unknown:'❓' };
  const CAT_LABEL_EN = { bug:'🐛 Bug', improve:'💡 Improve', etc:'💬 Other', unknown:'❓' };
  const CAT_LABEL = (c) => (_isEn()?CAT_LABEL_EN:CAT_LABEL_KO)[c] || (c||'');
  const ROLE_LABEL = (r) => ({ teacher:_isEn()?'Teacher':'교사', admin:_isEn()?'Admin':'관리자', student:_isEn()?'Student':'학생' }[r] || (r||'-'));

  window.brLoad = async function(){
    const el = document.getElementById('br-list');
    if (!el) return;
    el.innerHTML = '<div style="padding:14px;color:#6b7280;text-align:center">'+(_isEn()?'Loading…':'불러오는 중…')+'</div>';
    const filterEl = document.getElementById('br-filter');
    const filter = filterEl ? filterEl.value : '';
    try {
      const r = await fetch('/api/admin/bug-reports' + (filter?'?status='+filter:''));
      const d = await r.json();
      const rows = d.rows || [];
      const counts = d.counts || {};
      const cntEl = document.getElementById('br-count');
      if (cntEl) {
        const newN = counts.new || 0;
        cntEl.innerHTML = (_isEn()
          ? `Total <b>${fmt(rows.length)}</b>`
          : `총 <b>${fmt(rows.length)}</b>건`)
          + (newN ? ` · <span style="color:#ef4444;font-weight:800">${_isEn()?'New':'미접수'} ${fmt(newN)}</span>` : '');
      }
      if (!rows.length) { el.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">'+(_isEn()?'No bug reports.':'접수된 버그 신고가 없습니다.')+'</div>'; return; }
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:#f3f4f6"><tr>
          <th style="text-align:left;padding:9px 12px">${_isEn()?'Status':'상태'}</th>
          <th style="text-align:left;padding:9px 12px">${_isEn()?'Reporter':'신고자'}</th>
          <th style="text-align:left;padding:9px 12px">${_isEn()?'Type':'분류'}</th>
          <th style="text-align:left;padding:9px 12px">${_isEn()?'Message':'내용'}</th>
          <th style="text-align:left;padding:9px 12px">${_isEn()?'Received':'접수'}</th>
          <th style="text-align:left;padding:9px 12px">${_isEn()?'Note':'메모'}</th>
          <th style="text-align:center;padding:9px 12px">${_isEn()?'Actions':'처리'}</th>
        </tr></thead>
        <tbody>${rows.map(b => {
          const st = b.status || 'new';
          const c = STATUS_COLOR[st] || '#6b7280';
          const pageUrl = b.page_url || '';
          const pagePath = (function(){ try { return new URL(pageUrl).pathname + (new URL(pageUrl).hash||''); } catch(e){ return pageUrl; } })();
          return `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:9px 12px;white-space:nowrap"><span style="color:${c};font-weight:800;font-size:11.5px">${STATUS_LABEL(st)}</span></td>
            <td style="padding:9px 12px"><b>${esc(b.reporter_name||'-')}</b><br><span style="font-size:11px;color:#6b7280">${esc(ROLE_LABEL(b.reporter_role))}${b.reporter_uid?(' · '+esc(b.reporter_uid)):''}</span></td>
            <td style="padding:9px 12px;white-space:nowrap;font-size:11.5px">${CAT_LABEL(b.category||'bug')}</td>
            <td style="padding:9px 12px;font-size:12px;color:#111827;max-width:320px">${esc((b.message||'')).replace(/\n/g,'<br>')}${pageUrl?`<br><span style="font-size:10.5px;color:#9ca3af" title="${esc(pageUrl)}">📍 ${esc(pagePath.slice(0,60))}</span>`:''}</td>
            <td style="padding:9px 12px;font-size:11.5px;color:#9ca3af;white-space:nowrap">${fmtDate(b.created_at)}</td>
            <td style="padding:9px 12px;font-size:11.5px;color:#6b7280;max-width:150px">${esc((b.admin_note||'').slice(0,50))}</td>
            <td style="padding:8px 10px;text-align:center;white-space:nowrap">
              <select onchange="brUpdateStatus(${b.id}, this.value)" style="padding:5px 8px;font-size:11.5px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">
                <option value="">${_isEn()?'Change →':'변경 →'}</option>
                <option value="new">🆕 ${_isEn()?'New':'미접수'}</option>
                <option value="in_progress">🔧 ${_isEn()?'In progress':'처리중'}</option>
                <option value="resolved">✅ ${_isEn()?'Resolved':'완료'}</option>
              </select>
              <button onclick="brEditNote(${b.id})" style="padding:5px 8px;font-size:11px;background:#6366f1;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-left:3px">📝</button>
              <button onclick="brDelete(${b.id})" style="padding:5px 8px;font-size:11px;background:#ef4444;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-left:3px">🗑</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:14px;color:#ef4444">'+(_isEn()?'Load failed: ':'로드 실패: ')+esc(e.message)+'</div>';
    }
  };

  window.brUpdateStatus = async function(id, status){
    if (!status) return;
    try {
      const r = await fetch('/api/admin/bug-reports/'+id, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status })
      });
      const d = await r.json();
      if (d.ok) brLoad();
      else alert('❌ ' + (d.error||'실패'));
    } catch(e) { alert('❌ '+e.message); }
  };
  window.brEditNote = async function(id){
    const note = prompt(_isEn()?'Admin note (fix status, cause, etc.):':'처리 메모 (원인·수정 상황 등):', '');
    if (note === null) return;
    try {
      const r = await fetch('/api/admin/bug-reports/'+id, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ admin_note: note })
      });
      const d = await r.json();
      if (d.ok) brLoad();
      else alert('❌ ' + (d.error||'실패'));
    } catch(e) { alert('❌ '+e.message); }
  };
  window.brDelete = async function(id){
    if (!confirm((_isEn()?'Delete bug report #':'버그 신고 #')+id+(_isEn()?'?':'를 삭제하시겠습니까?'))) return;
    await fetch('/api/admin/bug-reports/'+id, { method:'DELETE' });
    brLoad();
  };

  function bindBugOpen(){
    const parent = document.getElementById('card-bug-reports');
    if (parent && !parent.__brBound) {
      parent.__brBound = true;
      parent.addEventListener('toggle', () => { if (parent.open) brLoad(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindBugOpen);
  else bindBugOpen();
})();
