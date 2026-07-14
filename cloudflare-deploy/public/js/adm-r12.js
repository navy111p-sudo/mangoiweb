// ═══════════════════════════════════════════════════════════════
// adm-r12.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const stars7 = (avg) => {
    const full = Math.round(avg);
    let h = '';
    for (let i = 1; i <= 7; i++) h += `<span style="color:${i <= full ? '#f59e0b' : '#d1d5db'};font-size:13px">★</span>`;
    return h;
  };
  const scoreColor = (avg) => avg >= 5.5 ? '#10b981' : (avg >= 4 ? '#f59e0b' : '#ef4444');

  window.crLoadSummary = async function(){
    const isEn = (window.adminLang === 'en');
    const days = document.getElementById('cr-days').value;
    const box = document.getElementById('cr-table');
    document.getElementById('cr-detail').innerHTML = '';
    box.innerHTML = `<div style="padding:20px;color:#6b7280;text-align:center">${isEn?'Loading…':'불러오는 중…'}</div>`;
    try {
      const r = await fetch(`/api/admin/ratings/summary?days=${days}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'load_failed');
      // 🎭🔐 유효 역할(미리보기 포함) 반영 — 강사=본인 평가만, 지사/대리점/학부모/학생=차단.
      const _crEff = (typeof window._effectiveRole === 'function') ? window._effectiveRole() : null;
      if (_crEff === 'branch' || _crEff === 'agency' || _crEff === 'parent' || _crEff === 'student') {
        document.getElementById('cr-summary').innerHTML = isEn ? 'Ratings are visible only to HQ and each teacher (own).' : '평가는 본사 관리자·경영진과 교사 본인만 볼 수 있습니다.';
        box.innerHTML = `<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">${isEn?'Access restricted.':'열람 권한이 없습니다.'}</div>`;
        return;
      }
      if (_crEff === 'hq_teacher') {
        const _crOwn = (typeof window._effectiveOwnName === 'function') ? window._effectiveOwnName() : '';
        d.rows = (d.rows || []).filter(row => window._payrollIsOwnRow({ teacher_name: row.teacher_name }, { name: _crOwn }));
        d.total = d.rows.reduce((a, row) => a + (row.count || 0), 0);
      }
      document.getElementById('cr-summary').innerHTML = isEn
        ? `Last ${d.days} days · <b>${d.total}</b> ratings · <b>${d.rows.length}</b> teachers`
        : `최근 ${d.days}일 · 평가 <b>${d.total}</b>건 · 강사 <b>${d.rows.length}</b>명`;
      if (!d.rows.length) {
        box.innerHTML = `<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">${isEn?'No ratings in this period yet.':'아직 이 기간의 평가가 없습니다. 학생이 수업을 마치면 여기에 쌓입니다.'}</div>`;
        return;
      }
      const H = isEn
        ? { teacher:'Teacher', count:'Ratings', avg:'Average (of 7)', low:'Low (≤2)', tags:'Top tags', detail:'Feedback' }
        : { teacher:'강사', count:'응답 수', avg:'평균 (7점 만점)', low:'낮은 점수(≤2)', tags:'주요 태그', detail:'건의사항' };
      box.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:linear-gradient(135deg,#fef3c7,#fde68a)"><tr>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.teacher}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.count}</th>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.avg}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.low}</th>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.tags}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.detail}</th>
        </tr></thead>
        <tbody>${d.rows.map(r => `
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:9px 12px"><b>${esc(r.teacher_name)}</b></td>
            <td style="padding:9px 12px;text-align:center;font-weight:700">${r.count}</td>
            <td style="padding:9px 12px;white-space:nowrap">${stars7(r.avg_score)} <b style="color:${scoreColor(r.avg_score)};margin-left:4px">${r.avg_score.toFixed(1)}</b></td>
            <td style="padding:9px 12px;text-align:center;${r.low_count ? 'color:#ef4444;font-weight:800' : 'color:#9ca3af'}">${r.low_count}</td>
            <td style="padding:9px 12px">${(r.top_tags||[]).map(t => `<span style="display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px;font-size:11px;color:#374151;margin:1px 2px"><span data-tr-tag="${esc(t.tag)}">${esc(t.tag)}</span> ${t.count}</span>`).join('') || '<span style="color:#9ca3af">-</span>'}</td>
            <td style="padding:9px 12px;text-align:center"><button onclick="crLoadDetail('${esc(r.teacher_name).replace(/'/g,"\\'")}')" style="padding:5px 10px;font-size:11px;background:#fff;border:1px solid #d1d5db;border-radius:5px;cursor:pointer">${isEn?'View':'보기'}</button></td>
          </tr>`).join('')}</tbody>
      </table>`;
      if (typeof window.applyRatingTr === 'function') window.applyRatingTr(box);
    } catch(e) {
      box.innerHTML = '<div style="padding:20px;color:#ef4444">불러오기 실패: '+esc(e.message)+'</div>';
    }
  };

  window.crLoadDetail = async function(teacherName){
    const isEn = (window.adminLang === 'en');
    const days = document.getElementById('cr-days').value;
    const box = document.getElementById('cr-detail');
    box.__lastTeacher = teacherName;
    box.innerHTML = `<div style="padding:14px;color:#6b7280">${isEn?'Loading…':'불러오는 중…'}</div>`;
    try {
      const r = await fetch(`/api/admin/ratings/list?days=${days}&limit=100&teacher_name=${encodeURIComponent(teacherName)}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'load_failed');
      const fmtDt = (ms) => new Date(ms).toLocaleString(isEn?'en-US':'ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      box.innerHTML = `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:800;color:#111827;margin-bottom:10px">💬 ${esc(teacherName)} — ${isEn?'individual ratings':'개별 평가'} (${d.rows.length})</div>
        ${d.rows.map(row => {
          let tags = [];
          try { tags = JSON.parse(row.tags||'[]'); } catch(e){}
          return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="white-space:nowrap">${stars7(row.score)}</span>
              <b style="color:${scoreColor(row.score)};font-size:12.5px">${row.score}/7</b>
              <span style="font-size:12px;color:#374151">${esc(row.student_name||'익명')}</span>
              <span style="font-size:11px;color:#9ca3af;margin-left:auto">${fmtDt(row.created_at)} · ${esc(row.room_id)}</span>
            </div>
            ${tags.length ? `<div style="margin-top:5px">${tags.map(t=>`<span data-tr-tag="${esc(t)}" style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;padding:2px 8px;font-size:11px;color:#78350f;margin:1px 2px">${esc(t)}</span>`).join('')}</div>` : ''}
            ${row.feedback ? `<div style="margin-top:6px;font-size:12.5px;color:#374151;background:#f9fafb;border-radius:6px;padding:7px 10px;line-height:1.6">💬 <span data-tr="${esc(row.feedback)}">${esc(row.feedback)}</span></div>` : ''}
          </div>`;
        }).join('') || `<div style="color:#9ca3af;font-size:12.5px">${isEn?'No ratings.':'평가가 없습니다.'}</div>`}
        <div id="rating-analysis-admin" style="margin-top:12px"></div>
      </div>`;
      if (typeof window.applyRatingTr === 'function') window.applyRatingTr(box);
      if (typeof window.renderRatingAnalysis === 'function') window.renderRatingAnalysis(document.getElementById('rating-analysis-admin'), teacherName, false);
      box.scrollIntoView({ behavior:'smooth', block:'nearest' });
    } catch(e) {
      box.innerHTML = '<div style="padding:14px;color:#ef4444">불러오기 실패: '+esc(e.message)+'</div>';
    }
  };

  function bindCrOpen(){
    const parent = document.getElementById('card-class-ratings');
    if (parent && !parent.__crBound) {
      parent.__crBound = true;
      parent.addEventListener('toggle', () => { if (parent.open) crLoadSummary(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindCrOpen);
  else bindCrOpen();
  document.addEventListener('mangoi:lang-changed', function(){
    const parent = document.getElementById('card-class-ratings');
    if (parent && parent.open) { crLoadSummary(); const det = document.getElementById('cr-detail'); if (det && det.__lastTeacher) crLoadDetail(det.__lastTeacher); }
  });
})();
