// ═══════════════════════════════════════════════════════════════
// adm-q2.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function isEn(){ return window.adminLang === 'en'; }
  let mtwLevel = 'A1', mtwTopic = 'daily life', mtwTopicLabel = '일상생활';
  const post = (u, b) => fetch(u, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b) }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));

  // ── 마법사 선택 ──
  window.mtwPickLevel = function(btn){
    document.querySelectorAll('[data-mtw-level]').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on'); mtwLevel = btn.getAttribute('data-mtw-level');
  };
  window.mtwPickTopic = function(btn){
    document.querySelectorAll('[data-mtw-topic]').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on'); mtwTopic = btn.getAttribute('data-mtw-topic');
    mtwTopicLabel = (btn.querySelector('span')||{}).textContent || mtwTopic;
    const c = document.getElementById('mtw-topic-custom'); if (c) c.value = '';
  };
  window.mtwCustomTopic = function(inp){
    if (inp.value.trim()) {
      document.querySelectorAll('[data-mtw-topic]').forEach(b=>b.classList.remove('on'));
      mtwTopic = inp.value.trim(); mtwTopicLabel = inp.value.trim();
    }
  };

  // ── 🤖 원클릭: 시험 생성 → 듣기 AI 출제 → 읽기 AI 출제 ──
  window.mtwRun = async function(){
    const en = isEn();
    const lc = Number(document.getElementById('mtw-lcount').value||0);
    const rc = Number(document.getElementById('mtw-rcount').value||0);
    const dur = Number(document.getElementById('mtw-dur').value||20);
    if (lc + rc === 0) { alert(en?'Pick at least one question.':'듣기 또는 읽기 문제 수를 1개 이상 골라주세요.'); return; }
    let title = (document.getElementById('mtw-title').value||'').trim();
    if (!title) {
      const d = new Date();
      title = `${d.getMonth()+1}월 ${mtwTopicLabel} 미니토익 (${mtwLevel})`;
    }
    const go = document.getElementById('mtw-go');
    const prog = document.getElementById('mtw-progress');
    go.disabled = true; go.style.opacity = '.55';
    prog.style.display = 'block';
    const step = (t) => { prog.innerHTML += t + '<br>'; prog.scrollTop = prog.scrollHeight; };
    prog.innerHTML = '';
    step(`⏳ 1/3 ${en?'Creating exam':'시험 만드는 중'} — <b>${esc(title)}</b>`);
    try {
      const cr = await post('/api/admin/exam/create', { title, level: mtwLevel, listening_count: lc, reading_count: rc, duration_min: dur });
      if (!cr.ok) throw new Error(cr.error||'create_failed');
      const eid = cr.exam_id;
      step(`✅ ${en?'Exam created':'시험 생성 완료'} (#${eid})`);
      let made = 0, fails = [];
      if (lc > 0) {
        step(`⏳ 2/3 🎧 ${en?`AI writing ${lc} listening questions...`:`AI가 듣기 문제 ${lc}개를 만드는 중... (30초 정도)`}`);
        const g1 = await post('/api/admin/exam/question/ai-generate', { exam_id: eid, section:'listening', count: lc, topic: mtwTopic });
        if (g1.ok) { made += g1.generated_count; step(`✅ 🎧 ${en?'Listening done':'듣기 문제 완성'} (${g1.generated_count}${en?'':'개'})`); }
        else { fails.push('듣기'); step(`⚠️ 🎧 ${en?'Listening failed':'듣기 생성 실패'} — ${esc(g1.error||'')}`); }
      }
      if (rc > 0) {
        step(`⏳ 3/3 📖 ${en?`AI writing ${rc} reading questions...`:`AI가 읽기 문제 ${rc}개를 만드는 중...`}`);
        const g2 = await post('/api/admin/exam/question/ai-generate', { exam_id: eid, section:'reading', count: rc, topic: mtwTopic });
        if (g2.ok) { made += g2.generated_count; step(`✅ 📖 ${en?'Reading done':'읽기 문제 완성'} (${g2.generated_count}${en?'':'개'})`); }
        else { fails.push('읽기'); step(`⚠️ 📖 ${en?'Reading failed':'읽기 생성 실패'} — ${esc(g2.error||'')}`); }
      }
      if (made > 0) {
        step(`<b style="color:#86efac">🎉 ${en?`All done! ${made} questions ready. Students can take it now.`:`완성! 문제 ${made}개가 준비됐어요. 학생 화면에 바로 나옵니다.`}</b>`);
        if (fails.length) step(`💡 ${en?'Retry the failed part with [🤖 Generate more] in the list below.':`실패한 ${fails.join('·')}는 아래 목록의 [🤖 AI로 더 만들기]로 다시 시도하세요.`}`);
        document.getElementById('mtw-title').value = '';
      } else {
        step(`❌ ${en?'Generation failed. Please press the button again.':'문제 생성에 실패했어요. 버튼을 한 번 더 눌러주세요.'}`);
      }
      mtLoad();
    } catch(e) {
      step(`❌ ${esc(e.message||'')} — ${en?'Please try again.':'다시 시도해주세요.'}`);
    }
    go.disabled = false; go.style.opacity = '1';
  };

  // ── 시험 목록 ──
  window.mtLoad = async function(){
    const en = isEn();
    const box = document.getElementById('mt-list');
    box.innerHTML = `<div style="color:#a5b4fc;padding:10px">⏳ ${en?'Loading...':'불러오는 중...'}</div>`;
    try {
      const r = await fetch('/api/admin/exams').then(x=>x.json());
      if (!r.ok) throw new Error(r.error||'failed');
      const list = r.list || [];
      // 수동 입력 폼의 시험 선택 드롭다운도 같이 채움
      const sel = document.getElementById('mt-q-eid');
      if (sel) sel.innerHTML = `<option value="">${en?'— pick an exam —':'— 시험을 고르세요 —'}</option>` + list.map(x=>`<option value="${x.id}">#${x.id} ${esc(x.title)}</option>`).join('');
      if (!list.length) { box.innerHTML = `<div style="color:#64748b;padding:24px;text-align:center;background:#0f172a;border:1px dashed #334155;border-radius:12px">${en?'No exams yet — use the AI wizard above! 👆':'아직 시험이 없어요 — 위의 🤖 AI 마법사로 첫 시험을 만들어보세요! 👆'}</div>`; return; }
      box.innerHTML = list.map(x => `
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:12px;margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="min-width:180px">
              <div style="font-weight:800;color:#e2e8f0;font-size:14px">${esc(x.title)} <span style="font-size:11px;color:#94a3b8">#${x.id}</span></div>
              <div style="font-size:11.5px;color:#94a3b8;margin-top:2px">
                ${esc(x.level)} · 🎧${x.lq_count||0} + 📖${x.rq_count||0} = ${x.question_count||0}${en?'Q':'문제'} · ⏱️${x.duration_min}${en?'min':'분'}
                · ${en?'Attempts':'응시'} ${x.attempt_count||0} · ${en?'Avg':'평균'} <b style="color:#fbbf24">${x.avg_score!=null?Number(x.avg_score).toFixed(0)+(en?'':'점'):'-'}</b>
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="mt-act-btn" onclick="mtToggleDetail(${x.id})" style="background:#4f46e5;color:#fff">📄 ${en?'Manage Qs':'문제 관리'}</button>
              <button class="mt-act-btn" onclick="mtToggleActive(${x.id})" style="background:${x.active?'#065f46':'#7f1d1d'};color:#fff">${x.active?('✅ '+(en?'Public':'공개중')):('⛔ '+(en?'Hidden':'숨김'))}</button>
              <button class="mt-act-btn" onclick="mtDelExam(${x.id}, '${esc(x.title).replace(/'/g,'&#39;')}')" style="background:#334155;color:#fca5a5">🗑 ${en?'Delete':'삭제'}</button>
            </div>
          </div>
          <div id="mt-detail-${x.id}" style="display:none;margin-top:10px;border-top:1px dashed #334155;padding-top:10px"></div>
        </div>`).join('');
    } catch(e) { box.innerHTML = `<div style="color:#fca5a5">❌ ${esc(e.message)}</div>`; }
  };

  // ── 문제 관리 (펼침: 문제 목록 + AI 추가 + 리더보드) ──
  window.mtToggleDetail = async function(id){
    const en = isEn();
    const d = document.getElementById('mt-detail-'+id);
    if (!d) return;
    if (d.style.display !== 'none') { d.style.display = 'none'; return; }
    d.style.display = 'block';
    d.innerHTML = `<div style="color:#a5b4fc;font-size:12px">⏳ ${en?'Loading...':'불러오는 중...'}</div>`;
    const r = await fetch('/api/admin/exam/'+id).then(x=>x.json()).catch(()=>({ok:false}));
    if (!r.ok) { d.innerHTML = `<div style="color:#fca5a5;font-size:12px">❌ ${esc(r.error||'')}</div>`; return; }
    const qs = r.questions || [];
    const lb = (r.leaderboard||[]).slice(0,10);
    d.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#0f172a;border:1px solid #6366f1;border-radius:10px;padding:10px;margin-bottom:10px">
        <b style="color:#fcd34d;font-size:12.5px">🤖 ${en?'Generate more with AI:':'AI로 문제 더 만들기:'}</b>
        <select id="mt-more-sec-${id}" style="background:#1e293b;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:6px;font-size:12px">
          <option value="reading">📖 ${en?'Reading':'읽기'}</option><option value="listening">🎧 ${en?'Listening':'듣기'}</option>
        </select>
        <select id="mt-more-cnt-${id}" style="background:#1e293b;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:6px;font-size:12px">
          <option value="3">3${en?'':'개'}</option><option value="5" selected>5${en?'':'개'}</option><option value="10">10${en?'':'개'}</option>
        </select>
        <input id="mt-more-topic-${id}" placeholder="${en?'topic (e.g. travel)':'주제 (예: 여행)'}" style="background:#1e293b;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:6px;font-size:12px;width:140px">
        <button class="mt-act-btn" onclick="mtGenMore(${id}, this)" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff">🤖 ${en?'Generate':'만들기'}</button>
      </div>
      ${qs.length ? qs.map((q,i) => `
        <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:9px 10px;margin-bottom:6px;font-size:12px">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <div style="color:#e2e8f0;line-height:1.5"><b style="color:#a5b4fc">${i+1}.</b> ${q.section==='listening'?'🎧':'📖'} ${esc(q.question_text)}
              ${q.audio_url?`<a href="${esc(q.audio_url)}" target="_blank" style="color:#86efac;text-decoration:none;font-size:11px">▶ ${en?'audio':'소리듣기'}</a>`:''}
            </div>
            <button class="mt-act-btn" onclick="mtDelQ(${q.id}, ${id})" style="background:#334155;color:#fca5a5;align-self:flex-start">🗑</button>
          </div>
          <div style="color:#94a3b8;margin-top:4px;line-height:1.6">
            ${['a','b','c','d'].map(L => `<span style="${q.correct_answer===L.toUpperCase()?'color:#86efac;font-weight:700':''}">${L.toUpperCase()}. ${esc(q['choice_'+L]||'')}${q.correct_answer===L.toUpperCase()?' ✓':''}</span>`).join(' &nbsp; ')}
          </div>
        </div>`).join('') : `<div style="color:#64748b;font-size:12px;padding:8px">${en?'No questions yet — press 🤖 Generate above.':'아직 문제가 없어요 — 위의 🤖 만들기를 누르세요.'}</div>`}
      ${lb.length ? `<div style="margin-top:8px;font-size:12px;color:#a5b4fc"><b>🏆 ${en?'Top scores':'점수 순위'}:</b> ${lb.map((x,i)=>`${i+1}. ${esc(x.user_id)} ${x.score}${en?'':'점'}`).join(' · ')}</div>` : ''}`;
  };

  window.mtGenMore = async function(id, btn){
    const en = isEn();
    const section = document.getElementById('mt-more-sec-'+id).value;
    const count = Number(document.getElementById('mt-more-cnt-'+id).value||5);
    const topic = (document.getElementById('mt-more-topic-'+id).value||'').trim() || 'daily life';
    const orig = btn.innerHTML; btn.innerHTML = '⏳'; btn.disabled = true;
    const r = await post('/api/admin/exam/question/ai-generate', { exam_id: id, section, count, topic });
    btn.innerHTML = orig; btn.disabled = false;
    if (!r.ok) { alert('❌ ' + (en?'Failed: ':'실패: ') + (r.error||'')); return; }
    const d = document.getElementById('mt-detail-'+id);
    if (d) { d.style.display = 'none'; mtToggleDetail(id); }
    mtLoad2Silent();
  };
  // 목록 숫자만 조용히 갱신 (펼친 문제 관리 패널이 닫히지 않게 mtLoad 대신 사용)
  async function mtLoad2Silent(){ /* 문항수 배지는 다음 새로고침 때 갱신 — 펼침 유지가 더 중요 */ }

  window.mtDelQ = async function(qid, examId){
    const en = isEn();
    if (!confirm(en?'Delete this question?':'이 문제를 지울까요?')) return;
    const r = await post('/api/admin/exam/question/delete', { question_id: qid });
    if (!r.ok) { alert('❌ ' + (r.error||'')); return; }
    const d = document.getElementById('mt-detail-'+examId);
    if (d) { d.style.display = 'none'; mtToggleDetail(examId); }
  };

  window.mtToggleActive = async function(id){
    const r = await post('/api/admin/exam/toggle', { exam_id: id });
    if (!r.ok) { alert('❌ ' + (r.error||'')); return; }
    mtLoad();
  };

  window.mtDelExam = async function(id, title){
    const en = isEn();
    if (!confirm(en?`Delete exam "${title}" and all its questions/records?`:`시험 "${title}" 을(를) 문제·응시기록까지 전부 지울까요?\n(되돌릴 수 없어요)`)) return;
    const r = await post('/api/admin/exam/delete', { exam_id: id });
    if (!r.ok) { alert('❌ ' + (r.error||'')); return; }
    mtLoad();
  };

  // ── 수동 문제 추가 (고급) ──
  window.mtAddQ = async function(){
    const en = isEn();
    const exam_id = Number((document.getElementById('mt-q-eid')||{}).value);
    const question_text = (document.getElementById('mt-q-text')||{}).value;
    if (!exam_id) { alert(en?'Pick an exam first.':'시험을 먼저 골라주세요.'); return; }
    if (!question_text) { alert(en?'Question text required.':'문제 내용을 입력하세요.'); return; }
    const r = await post('/api/admin/exam/question/add', {
      exam_id,
      section: (document.getElementById('mt-q-sec')||{}).value,
      question_text,
      choice_a: (document.getElementById('mt-q-a')||{}).value,
      choice_b: (document.getElementById('mt-q-b')||{}).value,
      choice_c: (document.getElementById('mt-q-c')||{}).value,
      choice_d: (document.getElementById('mt-q-d')||{}).value,
      correct_answer: (document.getElementById('mt-q-correct')||{}).value || 'A',
      audio_url: (document.getElementById('mt-q-audio')||{}).value || null,
      points: 5
    });
    alert(r.ok ? (en?'Question added!':'문제 추가 완료!') : '❌ '+(r.error||''));
    if (r.ok) { ['mt-q-text','mt-q-a','mt-q-b','mt-q-c','mt-q-d','mt-q-audio'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';}); mtLoad(); }
  };

  document.getElementById('card-mini-toeic')?.addEventListener('toggle', function(){ if (this.open) mtLoad(); });
})();
