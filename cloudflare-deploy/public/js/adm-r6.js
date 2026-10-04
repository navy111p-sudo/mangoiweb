// ═══════════════════════════════════════════════════════════════
// adm-r6.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'}) : '-';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  window.evClearForm = function(){
    ['ev-student-uid','ev-student-name','ev-teacher-name','ev-lesson-title','ev-lesson-date',
     'ev-s-part','ev-s-comp','ev-s-hw','ev-s-att','ev-s-spk',
     'ev-strengths','ev-improvements','ev-goals','ev-parent-phone','ev-student-phone'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('ev-feedback').textContent = '';
  };

  window.evSubmit = async function(){
    const uid = document.getElementById('ev-student-uid').value.trim();
    const strengths = document.getElementById('ev-strengths').value.trim();
    if (!uid) { alert('학생 UID 는 필수입니다.'); return; }
    if (!strengths) { if (!confirm('잘한 점이 비어있습니다. 그래도 저장할까요?')) return; }
    const fb = document.getElementById('ev-feedback');
    fb.textContent = '저장 중…';
    fb.style.color = '#6b7280';
    const body = {
      student_uid: uid,
      student_name: document.getElementById('ev-student-name').value.trim(),
      teacher_name: document.getElementById('ev-teacher-name').value.trim(),
      lesson_title: document.getElementById('ev-lesson-title').value.trim(),
      lesson_date: document.getElementById('ev-lesson-date').value || new Date().toISOString().slice(0,10),
      score_participation: parseInt(document.getElementById('ev-s-part').value, 10) || null,
      score_comprehension: parseInt(document.getElementById('ev-s-comp').value, 10) || null,
      score_homework: parseInt(document.getElementById('ev-s-hw').value, 10) || null,
      score_attitude: parseInt(document.getElementById('ev-s-att').value, 10) || null,
      score_speaking: parseInt(document.getElementById('ev-s-spk').value, 10) || null,
      strengths,
      improvements: document.getElementById('ev-improvements').value.trim(),
      next_goals: document.getElementById('ev-goals').value.trim(),
      parent_phone: document.getElementById('ev-parent-phone').value.trim(),
      student_phone: document.getElementById('ev-student-phone').value.trim(),
    };
    try {
      const r = await fetch('/api/eval/manual-create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.ok) { fb.style.color='#ef4444'; fb.textContent='❌ '+(d.error||'실패'); return; }
      const evalUrl = location.origin + '/eval.html?id=' + d.id;
      const notifyMsg = d.notify
        ? ` · 카톡 ${d.notify.sent.length}건 발송${d.notify.failed.length?' (실패 '+d.notify.failed.length+')':''}`
        : '';
      fb.style.color='#10b981';
      fb.innerHTML = `✅ 평가서 #${d.id} 저장 (종합 ${d.overall == null ? '-' : d.overall + '/5'}점)${notifyMsg} → <a href="${evalUrl}" target="_blank" style="color:#2563eb">미리보기</a>`;
      // 폼 일부만 초기화 (학생 UID/이름/강사는 다음 평가서에 재사용 편의)
      ['ev-lesson-title','ev-s-part','ev-s-comp','ev-s-hw','ev-s-att','ev-s-spk',
       'ev-strengths','ev-improvements','ev-goals'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      // 목록 새로고침 (열려있으면)
      if (window.evLoadList) setTimeout(evLoadList, 500);
    } catch(e) {
      fb.style.color='#ef4444'; fb.textContent='❌ '+e.message;
    }
  };

  window.evLoadList = async function(){
    const el = document.getElementById('ev-list-table');
    if (!el) return;
    const statsEl = document.getElementById('ev-stats-line');
    if (statsEl) statsEl.innerHTML = '통계 불러오는 중…';
    el.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/eval/list');
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || '평가서를 불러오지 못했습니다.');
      const rows = d.rows || [];
      const s = d.stats || {};
      const avg = s.avg_score_scale === 100 && typeof s.avg_score === 'number' && Number.isFinite(s.avg_score) ? s.avg_score.toFixed(1) + '/100' : '-';
      const excluded = Number(s.excluded_score_count) || 0;
      document.getElementById('ev-stats-line').innerHTML =
        `총 <b>${fmt(s.total)}</b>건 · 이번 달 <b style="color:#10b981">${fmt(s.this_month)}</b>건 · 평균 종합 <b style="color:#d97706">${avg}</b>점 (100점 환산 · ${fmt(s.scored_count)}건 기준) · 카톡발송 ${fmt(s.notified)} · 학부모열람 ${fmt(s.viewed)}` +
        (excluded ? `<br><span style="color:#b45309">척도 미확인 ${fmt(s.unknown_scale_count)}건 · 점수/척도 오류 ${fmt(s.invalid_score_count)}건은 평균에서 제외했습니다.</span>` : '');
      if (!rows.length) { el.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">아직 작성된 평가서가 없습니다.</div>'; return; }
      const html = rows.map(e => {
        // The API owns provenance/normalization. Never guess /5 vs /10 vs /100 from magnitude.
        const overall = e.score_value;
        const evMax = e.score_max;
        const known = e.score_status === 'ok' && typeof e.score_normalized_100 === 'number' && Number.isFinite(e.score_normalized_100);
        const on5 = known ? Math.max(0, Math.min(5, Math.round(e.score_normalized_100 / 20))) : 0;
        const stars = known ? '★'.repeat(on5) + '☆'.repeat(5 - on5) : '-';
        const scoreText = known ? esc(overall) + '<span style="font-size:10.5px;color:#9ca3af;font-weight:600">/' + esc(evMax) + '</span>'
          : e.score_status === 'missing' ? '-' : esc(overall == null ? '-' : overall) + ' <small>척도·점수 확인 필요</small>';
        const nameStates = { uid_conflict: '학생 UID 불일치', ambiguous: '학생 이름 중복 확인 필요', not_found: '학생 이름 미확인', missing_name: '학생 이름 미기록', missing_uid: '학생 UID 미기록', lookup_failed: '학생 이름 조회 실패' };
        const studentName = e.display_student_name || String(e.student_name || '').trim() || nameStates[e.student_name_status] || '학생 이름 미확인';
        const uidText = e.student_identity_status === 'uid_conflict'
          ? 'UID 불일치: ' + (e.student_uid || '-') + ' / ' + (e.user_id || '-')
          : 'UID: ' + (e.display_student_uid || e.student_uid || e.user_id || '미기록');
        const authorName = e.display_author_name || String(e.teacher_name || '').trim();
        const author = authorName ? (e.display_author_role === 'evaluator' ? '평가자: ' : '강사: ') + authorName : '강사·평가자 미기록';
        const dateLabels = { lesson_date: '수업일', eval_at: '평가일 (KST)', created_at: '기록일 (KST)' };
        const date = e.display_date ? (dateLabels[e.display_date_source] || '날짜') + ': ' + e.display_date : '날짜 미기록';
        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:9px 12px;font-size:11px;color:#9ca3af">#${e.id}</td>
          <td style="padding:9px 12px"><b>${esc(studentName)}</b><br><span style="font-size:11px;color:#9ca3af">${esc(uidText)}</span><br><span style="font-size:11px;color:#9ca3af">${esc(e.lesson_title||'')}</span></td>
          <td style="padding:9px 12px;font-size:12px;color:#6b7280">${esc(author)}</td>
          <td style="padding:9px 12px;text-align:center"><span style="color:#fbbf24;font-size:13px">${stars}</span><br><b style="color:#d97706">${scoreText}</b></td>
          <td style="padding:9px 12px;font-size:11.5px;color:#6b7280">${esc(date)}${e.display_date_source && e.display_date_source !== 'lesson_date' ? '<br><small>' + (String(e.lesson_date || '').trim() ? '수업일 확인 필요' : '수업일 미기록') + '</small>' : ''}${e.date_status === 'invalid_date' ? '<br><small>날짜 확인 필요</small>' : ''}</td>
          <td style="padding:9px 12px;text-align:center">${e.parent_notified?'<span style="color:#10b981">✓ 발송</span>':'<span style="color:#9ca3af">-</span>'}<br>${e.viewed_by_parent?'<span style="color:#3b82f6;font-size:11px">👁 열람</span>':''}</td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap">
            <a href="/eval.html?id=${e.id}" target="_blank" style="padding:5px 10px;font-size:11px;background:#3b82f6;color:#fff;border-radius:5px;text-decoration:none">미리보기</a>
            <button onclick="evDelete(${e.id})" style="padding:5px 8px;font-size:11px;background:#ef4444;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-left:3px">🗑</button>
          </td>
        </tr>`;
      }).join('');
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:#f3f4f6"><tr>
          <th style="text-align:left;padding:9px 12px">ID</th>
          <th style="text-align:left;padding:9px 12px">학생·수업</th>
          <th style="text-align:left;padding:9px 12px">강사·평가자</th>
          <th style="text-align:center;padding:9px 12px">종합점수</th>
          <th style="text-align:left;padding:9px 12px">날짜·기준</th>
          <th style="text-align:center;padding:9px 12px">학부모</th>
          <th style="text-align:center;padding:9px 12px">조작</th>
        </tr></thead><tbody>${html}</tbody></table>`;
    } catch(e) {
      if (statsEl) statsEl.innerHTML = '통계 확인 불가';
      el.innerHTML = '<div style="padding:20px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };
  window.evDelete = async function(id){
    if (!confirm('평가서 #'+id+'를 삭제하시겠습니까?')) return;
    await fetch('/api/eval/'+id, { method:'DELETE' });
    evLoadList();
  };
  function bindEvalOpen(){
    const list = document.getElementById('sub-eval-list');
    if (list && !list.__evBound) {
      list.__evBound = true;
      list.addEventListener('toggle', () => { if (list.open && window.evLoadList) window.evLoadList(); });
    }
    const parent = document.getElementById('card-eval-mgmt');
    if (parent && !parent.__evBound) {
      parent.__evBound = true;
      parent.addEventListener('toggle', () => { if (parent.open) {
        const dtIn = document.getElementById('ev-lesson-date');
        if (dtIn && !dtIn.value) dtIn.value = new Date().toISOString().slice(0,10);
      }});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindEvalOpen);
  else bindEvalOpen();
})();
