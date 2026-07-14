// ═══════════════════════════════════════════════════════════════
// adm-r4.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function getVal(id) { const e = document.getElementById(id); return e ? (e.value||'').trim() : ''; }
  async function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function _en(){ return window.adminLang === 'en'; }
  // ⭐ 저장된 녹화본 목록 불러오기 → 드롭다운 채우기 (업로드 불필요)
  window.alrLoadRecordings = async function(){
    const uid = getVal('alr-uid');
    const sel = document.getElementById('alr-rec-select');
    if (!uid) { alert(_en()?'Enter student UID first.':'먼저 학생 UID 를 입력하세요.'); return; }
    sel.innerHTML = '<option value="">'+(_en()?'Loading…':'불러오는 중…')+'</option>';
    try {
      const r = await fetch('/api/student/recordings?uid='+encodeURIComponent(uid)+'&limit=30', { credentials:'include' });
      const d = await r.json();
      const rows = (d.rows || d.recordings || []);
      if (!rows.length) { sel.innerHTML = '<option value="">'+(_en()?'No recordings found for this student':'이 학생의 녹화본이 없습니다')+'</option>'; return; }
      sel.innerHTML = '<option value="">'+(_en()?'— Select a recording —':'— 녹화본 선택 —')+'</option>' +
        rows.map(function(x){
          var label = (x.date||'') + ' · ' + (x.topic||'') + (x.duration?(' · '+x.duration):'');
          return '<option value="'+esc(x.url||'')+'">'+esc(label)+'</option>';
        }).join('');
    } catch(e) {
      sel.innerHTML = '<option value="">'+(_en()?'Load failed':'불러오기 실패')+'</option>';
    }
  };
  // 🤖 AI 추천 — 집중도·끊김·참여율로 점수 매겨 최고의 수업 자동 선택
  window.alrAIPick = async function(){
    const uid = getVal('alr-uid');
    const sel = document.getElementById('alr-rec-select');
    const note = document.getElementById('alr-rec-note');
    if (!uid) { alert(_en()?'Enter student UID first.':'먼저 학생 UID 를 입력하세요.'); return; }
    sel.innerHTML = '<option>'+(_en()?'🤖 AI analyzing recordings…':'🤖 AI 분석 중…')+'</option>';
    if (note) note.textContent = '';
    try {
      const r = await fetch('/api/admin/student/best-recording?uid='+encodeURIComponent(uid), { credentials:'include' });
      const d = await r.json();
      if (!d.ok || !d.items || !d.items.length) {
        sel.innerHTML = '<option value="">'+(_en()?'No scored recordings':'점수 매길 녹화본이 없습니다')+'</option>';
        if (note) note.textContent = '';
        return;
      }
      sel.innerHTML = d.items.map(function(x, idx){
        var star = idx===0 ? '⭐ ' : '';
        var bits = [(_en()?'score ':'점수 ')+x.score];
        if (x.gaze!=null) bits.push((_en()?'focus ':'집중 ')+x.gaze);
        bits.push((_en()?'drops ':'끊김 ')+x.disconnect+(_en()?'':'회'));
        if (x.active_pct!=null) bits.push((_en()?'active ':'참여 ')+x.active_pct+'%');
        var label = star+(x.date||'')+' · '+bits.join(' · ');
        return '<option value="'+esc(x.recording_key||'')+'" data-kind="key"'+(idx===0?' selected':'')+'>'+esc(label)+'</option>';
      }).join('');
      var best = d.best;
      if (best) {
        var idInput=document.getElementById('alr-recording-id'); var urlInput=document.getElementById('alr-recording-url');
        if (idInput) idInput.value = best.recording_key || '';
        if (urlInput) urlInput.value = '';
      }
      if (note) note.textContent = (_en()?'🤖 AI picked the best lesson — ':'🤖 AI가 최고의 수업 선택 — ')+(d.reason||'');
    } catch(e) {
      sel.innerHTML = '<option value="">'+(_en()?'AI pick failed':'AI 추천 실패')+'</option>';
    }
  };
  // 녹화본 선택 → R2 키(data-kind=key)면 recording_id, blob URL이면 키 추출, http면 recording_url
  window.alrPickRecording = function(){
    const sel = document.getElementById('alr-rec-select');
    const opt = sel ? sel.options[sel.selectedIndex] : null;
    const val = sel ? sel.value : '';
    const idInput = document.getElementById('alr-recording-id');
    const urlInput = document.getElementById('alr-recording-url');
    if (idInput) idInput.value = '';
    if (urlInput) urlInput.value = '';
    if (!val) return;
    if (opt && opt.getAttribute('data-kind') === 'key') { if (idInput) idInput.value = val; return; }  // R2 키 직접
    const marker = '/api/recordings/blob/';
    const i = val.indexOf(marker);
    if (i >= 0) {
      if (idInput) idInput.value = decodeURIComponent(val.slice(i + marker.length));   // 정확한 R2 키
    } else if (/^https?:\/\//.test(val)) {
      if (urlInput) urlInput.value = val;
    } else {
      if (urlInput) urlInput.value = location.origin + val;
    }
  };
  window.alrGenerate = async function(){
    const uid = getVal('alr-uid');
    if (!uid) { alert('학생 UID 를 입력해주세요'); return; }
    const btn = document.getElementById('alr-go-btn');
    btn.disabled = true; btn.innerHTML = '⏳ AI 분석 중… (STT → LLM, 20~40초)';
    const out = document.getElementById('alr-result');
    out.innerHTML = '<div style="padding:18px;text-align:center;color:#a3b3d1"><div style="font-size:36px;animation:alr-spin 1.2s linear infinite;display:inline-block">🎙</div><br>녹음 분석 중… 잠시만 기다려주세요</div><style>@keyframes alr-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>';

    const payload = {
      student_uid: uid,
      student_name: getVal('alr-name'),
      teacher_name: getVal('alr-teacher'),
      lesson_title: getVal('alr-title'),
      recording_id: getVal('alr-recording-id') || undefined,
      recording_url: getVal('alr-recording-url') || undefined,
      transcript: getVal('alr-transcript') || undefined,
      auto_save: true,
    };

    // 파일 업로드 처리 (base64)
    const file = document.getElementById('alr-audio-file').files[0];
    if (file) {
      try {
        const b64 = await fileToBase64(file);
        payload.audio_base64 = b64;
      } catch(e) { alert('파일 읽기 실패'); btn.disabled = false; btn.innerHTML = '🚀 AI 리포트 자동 생성'; return; }
    }

    try {
      const r = await fetch('/api/eval/ai-lesson-report', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) {
        out.innerHTML = '<div style="padding:14px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#fca5a5">⚠ 분석 실패: ' + esc(d.error || 'unknown') + (d.message ? '<br><span style="font-size:12px;color:#fde68a">' + esc(d.message) + '</span>' : '') + '</div>';
        return;
      }
      // 결과 렌더
      const errs = (d.grammar_errors || []).map(e =>
        `<div style="padding:10px 14px;background:rgba(239,68,68,0.10);border-left:3px solid #ef4444;border-radius:6px;margin-bottom:6px"><div style="font-size:12px"><span style="text-decoration:line-through;color:#fca5a5">${esc(e.original||'')}</span> → <b style="color:#86efac">${esc(e.corrected||'')}</b></div><div style="font-size:11.5px;color:#a3b3d1;margin-top:3px">💡 ${esc(e.reason||'')}</div></div>`
      ).join('');
      const alts = (d.alternatives || []).map(a =>
        `<div style="padding:10px 14px;background:rgba(59,130,246,0.10);border-left:3px solid #3b82f6;border-radius:6px;margin-bottom:6px"><div style="font-size:12px"><span style="color:#93c5fd">${esc(a.learned||'')}</span> → <b style="color:#c4b5fd">${esc(a.better||'')}</b></div><div style="font-size:11.5px;color:#a3b3d1;margin-top:3px">💬 ${esc(a.when_to_use||'')}</div></div>`
      ).join('');
      const words = (d.word_freq || []).map(w => `<span style="display:inline-block;padding:3px 10px;background:rgba(251,191,36,0.15);color:#fde68a;border-radius:99px;font-size:11.5px;margin:2px">${esc(w.word||'')} (${w.count||0})</span>`).join('');
      const sc = d.overall_score || 0;
      const color = sc>=85?'#10b981':sc>=70?'#f59e0b':'#ef4444';

      out.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(139,92,246,0.10),rgba(99,102,241,0.06));border:1px solid rgba(139,92,246,0.30);border-radius:14px;padding:18px">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap">
            <div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#fff;background:${color};box-shadow:0 6px 18px ${color}66">${sc}</div>
            <div style="flex:1;min-width:200px">
              <div style="font-size:11px;color:#a3b3d1;font-weight:700">종합 점수 (0~100)</div>
              <div style="font-size:15px;color:#fff;font-weight:800;margin-top:3px">${esc(d.summary_ko || '')}</div>
              <div style="font-size:11.5px;color:#94a3b8;margin-top:4px">📝 ${d.total_words || 0} 단어 · ⏱ ${d.speaking_seconds || 0}초 발화</div>
            </div>
            <button onclick="alrViewFull(${d.report_id})" style="padding:8px 14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e6ecff;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">📖 전체 STT 보기</button>
          </div>
          ${errs ? '<div style="font-size:12.5px;font-weight:800;color:#fca5a5;margin:14px 0 8px 0">⚠️ 문법 교정 (' + (d.grammar_errors||[]).length + '건)</div>' + errs : ''}
          ${alts ? '<div style="font-size:12.5px;font-weight:800;color:#93c5fd;margin:14px 0 8px 0">💡 더 자연스러운 표현 (' + (d.alternatives||[]).length + '건)</div>' + alts : ''}
          ${words ? '<div style="font-size:12.5px;font-weight:800;color:#fcd34d;margin:14px 0 8px 0">🔥 다빈도 단어</div><div>' + words + '</div>' : ''}
          ${(d.strengths||[]).length ? '<div style="font-size:12.5px;font-weight:800;color:#86efac;margin:14px 0 6px 0">✨ 강점</div><ul style="margin:0 0 8px 18px;color:#d1fae5;font-size:12.5px;line-height:1.7">' + (d.strengths||[]).map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>' : ''}
          ${(d.weaknesses||[]).length ? '<div style="font-size:12.5px;font-weight:800;color:#fcd34d;margin:14px 0 6px 0">📌 보완할 점</div><ul style="margin:0 0 8px 18px;color:#fde68a;font-size:12.5px;line-height:1.7">' + (d.weaknesses||[]).map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : ''}
          ${(d.next_goals||[]).length ? '<div style="font-size:12.5px;font-weight:800;color:#fbbf24;margin:14px 0 6px 0">🎯 다음 목표</div><ul style="margin:0 0 8px 18px;color:#fef3c7;font-size:12.5px;line-height:1.7">' + (d.next_goals||[]).map(g => '<li>' + esc(g) + '</li>').join('') + '</ul>' : ''}
          <div style="margin-top:14px;padding:10px 12px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.30);border-radius:8px;font-size:12.5px;color:#86efac">
            ✅ 평가서 자동 저장됨 (평가서 ID: ${d.evaluation_id || '-'}, 리포트 ID: ${d.report_id || '-'})<br>
            <span style="font-size:11.5px;color:#cbd5e1">→ "📝 학생 평가서" 카드에서 검토·발송하거나, "📄 월별 보고서" 에 자동 반영됩니다.</span>
          </div>
        </div>`;
    } catch(e){ out.innerHTML = '<div style="padding:14px;color:#fca5a5">네트워크 오류</div>'; }
    finally { btn.disabled = false; btn.innerHTML = '🚀 AI 리포트 자동 생성'; }
  };

  window.alrViewFull = async function(id){
    try {
      const r = await fetch('/api/eval/ai-lesson-report/' + id);
      const d = await r.json();
      if (!d.ok) { alert('전체 보기 실패: ' + (d.error||'')); return; }
      const w = window.open('', '_blank', 'width=900,height=700');
      if (!w) { alert('팝업이 차단되어 리포트를 열 수 없습니다. 브라우저 팝업 차단을 해제한 뒤 다시 시도해 주세요.'); return; }
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>AI 학습 리포트 #' + id + '</title></head><body style="font-family:-apple-system,sans-serif;padding:24px;background:#0a1530;color:#e6ecff;line-height:1.7"><h1>🎙 AI 학습 리포트 #' + id + '</h1><h2>📝 전체 STT (' + (d.item.total_words||0) + ' 단어)</h2><pre style="white-space:pre-wrap;background:#14213b;padding:14px;border-radius:10px;color:#cbd5e1">' + (d.item.transcript || '').replace(/[<>]/g,'') + '</pre></body></html>');
      } catch(e) { console.error('alrViewFull broken:', e); }
    };
})();
