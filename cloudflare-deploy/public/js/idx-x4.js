// ═══════════════════════════════════════════════════════════════
// idx-x4.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  function isEn(){ return (window.langCurrent === 'en') || (document.documentElement.lang === 'en'); }
  function uid(){ try { return (window.currentUser && (window.currentUser.uid || window.currentUser.user_id)) || localStorage.getItem('user_id') || ''; } catch { return ''; } }
  const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  // ───── 📝 Mini TOEIC ─────
  let mtState = { examId:null, examTitle:'', durationMin:20, questions:[], idx:0, attemptId:null, started:0, timerHandle:null, answers:{} };

  window.openMiniToeicModal = function(){
    if (document.getElementById('mt-overlay')) { closeMtOverlay(); return; }
    const en = isEn();
    if (!uid()) { alert(en?'Please log in first.':'먼저 로그인하세요.'); return; }
    closeMtOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'mt-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:99999;display:flex;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(4px)';
    overlay.innerHTML = `<div style="background:#0f172a;border:2px solid #6366f1;border-radius:16px;padding:22px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;color:#e2e8f0;font-family:MangoiHanSC,system-ui,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:18px;font-weight:800;color:#a5b4fc">📝 ${en?'Mini TOEIC':'영어 능력 시험'}</div>
        <button onclick="closeMtOverlay()" style="background:#334155;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer">${en?'Close':'닫기'}</button>
      </div>
      <div id="mt-step-body"></div>
    </div>`;
    /* 🔒 (2026-08-07 QA #4) 시험 도중 배경을 잘못 눌러 답이 날아가지 않게 — 닫기 버튼으로만 */
    overlay.addEventListener('click', e => { if (e.target === overlay && (window.mgBackdropClosable ? window.mgBackdropClosable(overlay) : true)) closeMtOverlay(); });
    document.body.appendChild(overlay);
    mtShowList();
  };
  window.closeMtOverlay = function(){
    if (mtState.timerHandle) { clearInterval(mtState.timerHandle); mtState.timerHandle = null; }
    const o = document.getElementById('mt-overlay'); if (o) o.remove();
  };
  async function mtShowList(){
    const en = isEn();
    const body = document.getElementById('mt-step-body');
    if (!body) return;
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#a5b4fc">⏳ ${en?'Loading exams...':'시험 목록 불러오는 중...'}</div>`;
    try {
      const r = await fetch('/api/exam/list').then(x=>x.json());
      const list = r.list || [];
      if (!list.length) { body.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8">📭 ${en?'No exams available yet.':'아직 응시할 수 있는 시험이 없습니다.'}</div>`; return; }
      body.innerHTML = `<div style="font-size:13px;color:#94a3b8;margin-bottom:10px">${en?'Pick an exam to start':'시험을 선택하세요'}</div>
        ${list.map(e => `<div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div>
            <div style="font-weight:700;color:#e2e8f0">${esc(e.title)}</div>
            <div style="font-size:11px;color:#94a3b8">Lv ${esc(e.level)} · L:${e.listening_count}/R:${e.reading_count} · ${e.duration_min}${en?' min':'분'} · ${e.question_count||0} Q</div>
          </div>
          <button onclick="mtStartExam(${e.id}, ${JSON.stringify(e.title).replace(/"/g,'&quot;')}, ${e.duration_min})" style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">▶️ ${en?'Start':'시작'}</button>
        </div>`).join('')}
        <div style="margin-top:14px"><button onclick="mtShowResults()" style="background:#475569;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">📜 ${en?'My results':'내 응시기록'}</button></div>`;
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  }
  window.mtStartExam = async function(examId, title, durationMin){
    const en = isEn();
    const body = document.getElementById('mt-step-body');
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#a5b4fc">⏳ ${en?'Starting...':'시작하는 중...'}</div>`;
    try {
      const r = await fetch('/api/exam/attempt/start', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({exam_id: examId, user_id: uid()}) }).then(x=>x.json());
      if (!r.ok) throw new Error(r.error||'start_failed');
      mtState = { examId, examTitle: title, durationMin: durationMin||20, questions: r.questions||[], idx:0, attemptId: r.attempt_id, started: Date.now(), timerHandle:null, answers:{} };
      if (!mtState.questions.length) { body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${en?'This exam has no questions yet.':'아직 등록된 문제가 없습니다.'}</div>`; return; }
      mtRenderQuestion();
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  };
  function mtRenderQuestion(){
    const en = isEn();
    const body = document.getElementById('mt-step-body');
    if (!body) return;
    const q = mtState.questions[mtState.idx];
    if (!q) { mtFinish(); return; }
    const total = mtState.questions.length;
    // 타이머
    if (!mtState.timerHandle) {
      mtState.timerHandle = setInterval(() => {
        const el = document.getElementById('mt-timer');
        if (!el) return;
        const sec = Math.max(0, mtState.durationMin * 60 - Math.floor((Date.now() - mtState.started)/1000));
        const mm = String(Math.floor(sec/60)).padStart(2,'0'); const ss = String(sec%60).padStart(2,'0');
        el.textContent = `${mm}:${ss}`;
        if (sec <= 0) { clearInterval(mtState.timerHandle); mtState.timerHandle=null; mtFinish(); }
      }, 1000);
    }
    const sel = mtState.answers[q.id] || '';
    body.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:13px;color:#a5b4fc"><b>${esc(mtState.examTitle)}</b> · ${q.section==='listening'?'🎧 Listening':'📖 Reading'} · ${mtState.idx+1}/${total}</div>
        <div style="background:#1e293b;border:1px solid #6366f1;color:#fbbf24;padding:4px 10px;border-radius:8px;font-family:MangoiHanSC,monospace;font-weight:800"><span id="mt-timer">--:--</span></div>
      </div>
      ${q.audio_url ? `<audio controls src="${esc(q.audio_url)}" style="width:100%;margin-bottom:10px"></audio>` : ''}
      ${q.image_url ? `<img src="${esc(q.image_url)}" style="max-width:100%;border-radius:8px;margin-bottom:10px" />` : ''}
      <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:14px;margin-bottom:12px;font-size:14px;color:#e2e8f0;line-height:1.5">${esc(q.question_text||'')}</div>
      <div style="display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:12px">
        ${['A','B','C','D'].map(L => `<button onclick="mtPick('${L}')" style="text-align:left;background:${sel===L?'#4f46e5':'#1e293b'};border:1px solid ${sel===L?'#a5b4fc':'#475569'};color:#e2e8f0;border-radius:8px;padding:10px;cursor:pointer;font-size:13px">
          <b style="color:#fbbf24">${L}.</b> ${esc(q['choice_'+L.toLowerCase()]||'')}
        </button>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px">
        <button onclick="mtPrev()" ${mtState.idx===0?'disabled':''} style="background:#475569;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;opacity:${mtState.idx===0?'.4':'1'}">◀ ${en?'Prev':'이전'}</button>
        ${mtState.idx === total-1
          ? `<button onclick="mtFinish()" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:700">${en?'Submit & Grade':'제출 + 채점'} ✓</button>`
          : `<button onclick="mtNext()" style="background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:700">${en?'Next':'다음'} ▶</button>`}
      </div>`;
  }
  window.mtPick = async function(L){
    const q = mtState.questions[mtState.idx]; if (!q) return;
    mtState.answers[q.id] = L;
    try { await fetch('/api/exam/attempt/submit-answer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({attempt_id: mtState.attemptId, question_id: q.id, selected_answer: L}) }); } catch {}
    mtRenderQuestion();
  };
  window.mtPrev = function(){ if (mtState.idx>0){ mtState.idx--; mtRenderQuestion(); } };
  window.mtNext = function(){ if (mtState.idx < mtState.questions.length-1){ mtState.idx++; mtRenderQuestion(); } };
  window.mtFinish = async function(){
    const en = isEn();
    if (mtState.timerHandle) { clearInterval(mtState.timerHandle); mtState.timerHandle = null; }
    const body = document.getElementById('mt-step-body');
    if (body) body.innerHTML = `<div style="text-align:center;padding:30px;color:#a5b4fc">⏳ ${en?'Grading...':'채점 중...'}</div>`;
    try {
      const r = await fetch('/api/exam/attempt/finish', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({attempt_id: mtState.attemptId}) }).then(x=>x.json());
      if (!r.ok) throw new Error(r.error||'finish_failed');
      // AI 코멘트
      let comment = '';
      try {
        const ratio = r.total_questions ? r.correct_count / r.total_questions : 0;
        if (ratio >= 0.8) comment = en ? '🎉 Outstanding! Keep up the great work!' : '🎉 정말 잘했어요! 이대로만 가면 됩니다!';
        else if (ratio >= 0.5) comment = en ? '💪 Good effort. Review the missed questions.' : '💪 잘했어요. 틀린 문제를 다시 한 번 복습해 보세요.';
        else comment = en ? '📚 Keep practicing — every attempt makes you stronger!' : '📚 꾸준히 연습해 보세요. 다음 시험엔 더 좋은 점수를 받을 거예요!';
      } catch {}
      if (body) body.innerHTML = `<div style="text-align:center;padding:20px">
        <div style="font-size:24px;font-weight:800;color:#fbbf24;margin-bottom:8px">${r.score} ${en?'pts':'점'}</div>
        <div style="font-size:14px;color:#a5b4fc;margin-bottom:14px">${r.correct_count}/${r.total_questions} ${en?'correct':'정답'}</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-bottom:14px">
          <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 16px"><div style="font-size:11px;color:#94a3b8">🎧 Listening</div><div style="font-size:18px;color:#86efac;font-weight:800">${r.listening_score||0}</div></div>
          <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 16px"><div style="font-size:11px;color:#94a3b8">📖 Reading</div><div style="font-size:18px;color:#a5b4fc;font-weight:800">${r.reading_score||0}</div></div>
        </div>
        <div style="background:#1e293b;border:1px solid #6366f1;border-radius:10px;padding:12px;font-size:13px;color:#cbd5e1;line-height:1.6;margin-bottom:14px">${esc(comment)}</div>
        <button onclick="mtShowList()" style="background:#475569;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer;margin-right:8px">${en?'Back to list':'목록으로'}</button>
        <button onclick="closeMtOverlay()" style="background:#6366f1;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:700">${en?'Close':'닫기'}</button>
      </div>`;
    } catch(e){ if (body) body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  };
  window.mtShowResults = async function(){
    const en = isEn();
    const body = document.getElementById('mt-step-body');
    if (!body) return;
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#a5b4fc">⏳ ${en?'Loading...':'불러오는 중...'}</div>`;
    try {
      const _mtTok = (function(){ try{ return localStorage.getItem('mango_token') || ''; }catch(e){ return ''; } })();   // 🔐 본인 시험결과 인증(IDOR 방지)
      const r = await fetch('/api/exam/results?user_id=' + encodeURIComponent(uid()) + '&token=' + encodeURIComponent(_mtTok)).then(x=>x.json());
      const list = r.list || [];
      body.innerHTML = `<button onclick="mtShowList()" style="background:#475569;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;margin-bottom:10px">◀ ${en?'Back':'뒤로'}</button>
        ${list.length ? list.map(x => `<div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:10px;margin-bottom:6px;display:flex;justify-content:space-between;font-size:13px;color:#e2e8f0">
          <span>${esc(x.title||'?')} <span style="color:#94a3b8;font-size:11px">${x.finished_at?new Date(x.finished_at).toLocaleDateString():'-'}</span></span>
          <span style="color:#fbbf24;font-weight:800">${x.score||0}${en?' pts':'점'} <span style="color:#86efac;font-size:11px">L:${x.listening_score||0}</span> <span style="color:#a5b4fc;font-size:11px">R:${x.reading_score||0}</span></span>
        </div>`).join('') : `<div style="text-align:center;padding:30px;color:#94a3b8">📭 ${en?'No history':'응시 기록 없음'}</div>`}`;
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  };

  // ───── 🎮 영어 배틀 삭제 (2026-08-11, 사장님 결정) — 서버 API 7종 미구현/404. Mini TOEIC 은 위에 그대로 유지.
})();
