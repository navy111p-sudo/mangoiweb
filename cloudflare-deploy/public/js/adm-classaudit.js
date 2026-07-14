// ═══════════════════════════════════════════════════════════════
// adm-classaudit.js — 📜 수업 변경 이력 (연기·삭제·종료) 조회 카드
//   GET /api/admin/class-audit — 누가·언제·무엇을 했는지 감사 로그.
//   card-class-audit (admin.html) 전용. 전역 스코프 공유(classic script).
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const isEn = () => (window.adminLang === 'en');
  const fmtTs = (ms) => {
    if (!ms) return '-';
    try { return new Date(ms).toLocaleString(isEn()?'en-US':'ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }
    catch(e){ return '-'; }
  };

  // 작업 유형 배지 (색·라벨)
  function actBadge(action){
    const M = {
      postpone:   ['⏸ 연기', '⏸ Postpone',   '#fef3c7', '#92400e'],
      reschedule: ['🔀 이동', '🔀 Reschedule', '#dbeafe', '#1e40af'],
      remove:     ['🗑 삭제', '🗑 Remove',     '#fee2e2', '#991b1b'],
      end:        ['⏹ 종료', '⏹ End',         '#e5e7eb', '#374151'],
      restore:    ['↩ 복구', '↩ Restore',     '#dcfce7', '#166534'],
    };
    const m = M[action] || [action, action, '#f1f5f9', '#475569'];
    return `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11.5px;font-weight:800;background:${m[2]};color:${m[3]}">${isEn()?m[1]:m[0]}</span>`;
  }
  function roleLabel(role){
    if (role === 'teacher') return isEn()?'Teacher':'강사';
    if (role === 'system')  return isEn()?'System':'시스템';
    return isEn()?'Admin':'관리자';
  }
  function srcLabel(src){
    const M = { 'ui':['화면','UI'], 'ai-command':['AI 명령','AI cmd'], 'schedule-request':['연기요청','Request'], 'api':['API','API'] };
    const m = M[src]; return m ? (isEn()?m[1]:m[0]) : (src||'');
  }

  window.caudLoad = async function(){
    const box = document.getElementById('cau-table');
    if (!box) return;
    box.innerHTML = `<div style="padding:20px;text-align:center;color:#6b7280">${isEn()?'Loading…':'불러오는 중…'}</div>`;
    const action = (document.getElementById('cau-action')||{}).value || 'all';
    const teacher = ((document.getElementById('cau-teacher')||{}).value || '').trim();
    try {
      const qs = new URLSearchParams();
      if (action && action !== 'all') qs.set('action', action);
      if (teacher) qs.set('teacher_name', teacher);
      const r = await fetch('/api/admin/class-audit?' + qs.toString());
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'load failed');
      const rows = d.rows || [];
      const sEl = document.getElementById('cau-summary');
      if (sEl) sEl.textContent = isEn() ? `${rows.length} record(s)` : `총 ${rows.length}건`;
      if (!rows.length) {
        box.innerHTML = `<div style="padding:26px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">${isEn()?'No change history yet.':'아직 변경 이력이 없습니다.'}</div>`;
        return;
      }
      const T = isEn()
        ? { time:'When', action:'Action', actor:'By', teacher:'Teacher', student:'Student', lesson:'Lesson', note:'Reason / Detail' }
        : { time:'시각', action:'작업', actor:'작업자', teacher:'강사', student:'학생', lesson:'수업', note:'사유 / 상세' };
      const body = rows.map(r => {
        const lesson = [esc(r.lesson_date||''), esc(r.lesson_time||'')].filter(Boolean).join(' ') || '-';
        const note = [r.reason, r.detail].filter(Boolean).map(esc).join(' · ') || '<span style="color:#9ca3af">—</span>';
        return `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:9px 12px;white-space:nowrap;color:#6b7280">${fmtTs(r.created_at)}</td>
          <td style="padding:9px 12px;text-align:center">${actBadge(r.action)}</td>
          <td style="padding:9px 12px;white-space:nowrap"><b>${esc(r.actor||'-')}</b><br><span style="font-size:10.5px;color:#9ca3af">${roleLabel(r.actor_role)}${r.source?' · '+esc(srcLabel(r.source)):''}</span></td>
          <td style="padding:9px 12px">${esc(r.teacher_name||'-')}</td>
          <td style="padding:9px 12px">${esc(r.student_name||'-')}</td>
          <td style="padding:9px 12px;white-space:nowrap">${lesson}</td>
          <td style="padding:9px 12px;color:#475569">${note}</td>
        </tr>`;
      }).join('');
      box.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:#eef2ff"><tr>
          <th style="text-align:left;padding:9px 12px;color:#3730a3">${T.time}</th>
          <th style="text-align:center;padding:9px 12px;color:#3730a3">${T.action}</th>
          <th style="text-align:left;padding:9px 12px;color:#3730a3">${T.actor}</th>
          <th style="text-align:left;padding:9px 12px;color:#3730a3">${T.teacher}</th>
          <th style="text-align:left;padding:9px 12px;color:#3730a3">${T.student}</th>
          <th style="text-align:left;padding:9px 12px;color:#3730a3">${T.lesson}</th>
          <th style="text-align:left;padding:9px 12px;color:#3730a3">${T.note}</th>
        </tr></thead><tbody>${body}</tbody></table>`;
    } catch(e) {
      box.innerHTML = `<div style="padding:16px;color:#ef4444">${isEn()?'Failed: ':'로드 실패: '}${esc(e.message)}</div>`;
    }
  };

  // 강사명 입력 디바운스
  let _caudTimer = null;
  window.caudDebounced = function(){
    clearTimeout(_caudTimer);
    _caudTimer = setTimeout(() => window.caudLoad(), 400);
  };

  // 카드를 처음 펼칠 때 자동 로드
  document.addEventListener('DOMContentLoaded', function(){
    const card = document.getElementById('card-class-audit');
    if (card) card.addEventListener('toggle', function(){ if (card.open && !document.getElementById('cau-table').innerHTML.trim()) window.caudLoad(); });
  });
})();
