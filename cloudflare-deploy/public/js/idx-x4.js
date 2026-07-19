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
    overlay.innerHTML = `<div style="background:#0f172a;border:2px solid #6366f1;border-radius:16px;padding:22px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;color:#e2e8f0;font-family:system-ui,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:18px;font-weight:800;color:#a5b4fc">📝 ${en?'Mini TOEIC':'영어 능력 시험'}</div>
        <button onclick="closeMtOverlay()" style="background:#334155;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer">${en?'Close':'닫기'}</button>
      </div>
      <div id="mt-step-body"></div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeMtOverlay(); });
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
        <div style="background:#1e293b;border:1px solid #6366f1;color:#fbbf24;padding:4px 10px;border-radius:8px;font-family:monospace;font-weight:800"><span id="mt-timer">--:--</span></div>
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

  // ───── 🎮 영어 배틀 ─────
  let btlState = { tab:'home', poller:null, gameWords:[], gameIdx:0, gameScore:0, currentBattleId:null, currentBattleType:'word_quiz' };

  window.openBattleModal = function(){
    if (document.getElementById('btl-overlay')) { closeBtlOverlay(); return; }
    const en = isEn();
    if (!uid()) { alert(en?'Please log in first.':'먼저 로그인하세요.'); return; }
    closeBtlOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'btl-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:99999;display:flex;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(4px)';
    overlay.innerHTML = `<div style="background:#0f172a;border:2px solid #f43f5e;border-radius:16px;padding:22px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;color:#e2e8f0;font-family:system-ui,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:18px;font-weight:800;color:#fda4af">🎮 ${en?'English Battle':'친구와 영어 배틀'}</div>
        <button onclick="closeBtlOverlay()" style="background:#334155;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer">${en?'Close':'닫기'}</button>
      </div>
      <div id="btl-tabs" style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap"></div>
      <div id="btl-body"></div>
    </div>`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeBtlOverlay(); });
    document.body.appendChild(overlay);
    btlShowTab('home');
    // 폴링 5초마다
    btlState.poller = setInterval(()=>{ if (btlState.tab==='incoming') btlShowIncoming(); else if (btlState.tab==='active') btlShowActive(); }, 5000);
  };
  window.closeBtlOverlay = function(){
    if (btlState.poller) { clearInterval(btlState.poller); btlState.poller = null; }
    const o = document.getElementById('btl-overlay'); if (o) o.remove();
  };
  function renderTabs(){
    const en = isEn();
    const tabs = [
      {id:'home', ko:'🎯 도전장', en:'🎯 Challenge'},
      {id:'incoming', ko:'📥 받음', en:'📥 Incoming'},
      {id:'active', ko:'▶️ 진행중', en:'▶️ Active'},
      {id:'history', ko:'📜 전적', en:'📜 History'},
      {id:'leaderboard', ko:'🏆 랭킹', en:'🏆 Top10'},
    ];
    const el = document.getElementById('btl-tabs'); if (!el) return;
    el.innerHTML = tabs.map(t => `<button onclick="btlShowTab('${t.id}')" style="background:${btlState.tab===t.id?'#f43f5e':'#1e293b'};color:${btlState.tab===t.id?'#fff':'#cbd5e1'};border:1px solid ${btlState.tab===t.id?'#fda4af':'#475569'};border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer">${en?t.en:t.ko}</button>`).join('');
  }
  window.btlShowTab = function(tab){
    btlState.tab = tab; renderTabs();
    if (tab==='home') btlShowHome();
    else if (tab==='incoming') btlShowIncoming();
    else if (tab==='active') btlShowActive();
    else if (tab==='history') btlShowHistory();
    else if (tab==='leaderboard') btlShowLeaderboard();
  };
  function btlShowHome(){
    const en = isEn();
    const body = document.getElementById('btl-body'); if (!body) return;
    body.innerHTML = `<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px">
      <div style="font-size:13px;color:#fda4af;font-weight:700;margin-bottom:10px">🎯 ${en?'Send a Challenge':'도전장 보내기'}</div>
      <input id="btl-opp" placeholder="${en?'Friend UID':'친구 UID'}" style="width:100%;background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:8px;font-size:13px;margin-bottom:8px">
      <select id="btl-game" style="width:100%;background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:8px;font-size:13px;margin-bottom:8px">
        <option value="word_quiz">🔤 ${en?'Word Quiz (5 Qs)':'영단어 퀴즈 (5문항)'}</option>
        <option value="flash_card">⚡ ${en?'Flash Card (30s)':'플래시카드 (30초)'}</option>
        <option value="pronunciation">🎤 ${en?'Pronunciation':'발음 점수'}</option>
      </select>
      <input id="btl-reward" type="number" value="100" placeholder="${en?'Reward Points':'보상 포인트'}" style="width:100%;background:#0f172a;border:1px solid #475569;color:#e2e8f0;border-radius:6px;padding:8px;font-size:13px;margin-bottom:8px">
      <button onclick="btlSend()" style="width:100%;background:linear-gradient(135deg,#f43f5e,#e11d48);color:#fff;border:0;border-radius:8px;padding:10px;cursor:pointer;font-weight:700">⚔️ ${en?'Send Challenge':'도전장 보내기'}</button>
    </div>`;
  }
  window.btlSend = async function(){
    const en = isEn();
    const opp = (document.getElementById('btl-opp')||{}).value;
    const gt = (document.getElementById('btl-game')||{}).value || 'word_quiz';
    const rp = Number((document.getElementById('btl-reward')||{}).value || 100);
    if (!opp) { alert(en?'Enter friend UID':'친구 UID를 입력하세요'); return; }
    const r = await fetch('/api/battle/challenge', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({challenger_uid: uid(), opponent_uid: opp, game_type: gt, reward_points: rp}) }).then(x=>x.json()).catch(()=>({ok:false}));
    alert(r.ok ? (en?'Challenge sent!':'도전장을 보냈습니다!') : '❌ '+(r.error||''));
  };
  async function btlShowIncoming(){
    const en = isEn();
    const body = document.getElementById('btl-body'); if (!body) return;
    try {
      const r = await fetch('/api/battle/incoming?user_id=' + encodeURIComponent(uid())).then(x=>x.json());
      const list = r.list || [];
      body.innerHTML = list.length ? list.map(b => `<div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:8px">
        <div style="font-size:13px;color:#e2e8f0;margin-bottom:8px">⚔️ <b>${esc(b.challenger_uid)}</b> ${en?'wants to battle':'님이 도전장을 보냈습니다'} (${esc(b.game_type)} · ${b.reward_points}P)</div>
        <div style="display:flex;gap:6px"><button onclick="btlAccept(${b.id},'${esc(b.game_type)}')" style="flex:1;background:#10b981;color:#fff;border:0;border-radius:6px;padding:8px;cursor:pointer;font-weight:700">✓ ${en?'Accept':'수락'}</button>
        <button onclick="btlDecline(${b.id})" style="flex:1;background:#475569;color:#fff;border:0;border-radius:6px;padding:8px;cursor:pointer">✗ ${en?'Decline':'거절'}</button></div>
      </div>`).join('') : `<div style="text-align:center;padding:30px;color:#94a3b8">📭 ${en?'No incoming challenges':'받은 도전장 없음'}</div>`;
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  }
  window.btlAccept = async function(id, gt){
    const r = await fetch('/api/battle/accept', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({battle_id: id}) }).then(x=>x.json()).catch(()=>({ok:false}));
    if (r.ok) { btlPlayGame(id, gt); }
  };
  window.btlDecline = async function(id){
    await fetch('/api/battle/decline', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({battle_id: id}) }).catch(()=>{});
    btlShowIncoming();
  };
  async function btlShowActive(){
    const en = isEn();
    const body = document.getElementById('btl-body'); if (!body) return;
    try {
      const r = await fetch('/api/battle/active?user_id=' + encodeURIComponent(uid())).then(x=>x.json());
      const list = r.list || [];
      body.innerHTML = list.length ? list.map(b => `<div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:8px">
        <div style="font-size:13px;color:#e2e8f0;margin-bottom:6px">⚔️ ${esc(b.challenger_uid)} vs ${esc(b.opponent_uid)} (${esc(b.game_type)})</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${en?'Score':'점수'}: ${b.challenger_score||0} : ${b.opponent_score||0} · ${b.reward_points}P</div>
        <button onclick="btlPlayGame(${b.id},'${esc(b.game_type)}')" style="background:#f43f5e;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:700">▶️ ${en?'Play':'시작'}</button>
      </div>`).join('') : `<div style="text-align:center;padding:30px;color:#94a3b8">📭 ${en?'No active battles':'진행 중인 배틀 없음'}</div>`;
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  }
  window.btlPlayGame = async function(battleId, gameType){
    const en = isEn();
    btlState.currentBattleId = battleId; btlState.currentBattleType = gameType || 'word_quiz';
    const body = document.getElementById('btl-body'); if (!body) return;
    if (gameType === 'pronunciation' || gameType === 'flash_card') {
      // stub — 즉시 random score 제출
      body.innerHTML = `<div style="text-align:center;padding:30px;color:#a5b4fc">⏳ ${en?'Loading game...':'게임 준비 중...'}</div>`;
      const score = Math.floor(Math.random()*40) + 60;  // 60~99
      setTimeout(async () => {
        const r = await fetch('/api/battle/submit-score', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({battle_id: battleId, user_id: uid(), score, game_data: {type: gameType}}) }).then(x=>x.json()).catch(()=>({ok:false}));
        body.innerHTML = `<div style="text-align:center;padding:20px">
          <div style="font-size:24px;font-weight:800;color:#fbbf24;margin-bottom:10px">🎯 ${score}</div>
          <div style="font-size:13px;color:#cbd5e1;margin-bottom:14px">${en?'Score submitted. Wait for your opponent.':'점수가 제출되었습니다. 상대를 기다려 주세요.'}</div>
          <button onclick="btlShowTab('active')" style="background:#475569;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer">◀ ${en?'Back':'뒤로'}</button>
        </div>`;
      }, 1200);
      return;
    }
    // word_quiz: 5문제 풀이
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#a5b4fc">⏳ ${en?'Loading words...':'단어 불러오는 중...'}</div>`;
    try {
      const r = await fetch('/api/battle/word-set?count=5&game_type=word_quiz').then(x=>x.json());
      btlState.gameWords = r.words || []; btlState.gameIdx = 0; btlState.gameScore = 0;
      btlRenderGameQ();
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  };
  function btlRenderGameQ(){
    const en = isEn();
    const body = document.getElementById('btl-body'); if (!body) return;
    const w = btlState.gameWords[btlState.gameIdx];
    if (!w) { btlSubmitGameScore(); return; }
    const choices = Array.isArray(w.choices) ? w.choices : [w.korean, 'A','B','C'];
    body.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:12px;color:#94a3b8;margin-bottom:10px"><span>🔤 Word Quiz ${btlState.gameIdx+1}/${btlState.gameWords.length}</span><span>🎯 ${btlState.gameScore}</span></div>
      <div style="background:#1e293b;border:1px solid #f43f5e;border-radius:12px;padding:20px;text-align:center;margin-bottom:14px">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">${en?'What does this mean?':'이 단어의 뜻은?'}</div>
        <div style="font-size:32px;font-weight:800;color:#fbbf24">${esc(w.word||'?')}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${choices.map((c,i) => `<button onclick="btlPickWord('${['A','B','C','D'][i]}','${esc(w.correct||'A')}')" style="background:#1e293b;border:1px solid #475569;color:#e2e8f0;border-radius:8px;padding:14px;cursor:pointer;font-size:14px;font-weight:700">
          <b style="color:#fbbf24">${['A','B','C','D'][i]}.</b> ${esc(c)}
        </button>`).join('')}
      </div>`;
  }
  window.btlPickWord = function(picked, correct){
    if (picked === correct) btlState.gameScore += 20;
    btlState.gameIdx++;
    btlRenderGameQ();
  };
  async function btlSubmitGameScore(){
    const en = isEn();
    const body = document.getElementById('btl-body'); if (!body) return;
    body.innerHTML = `<div style="text-align:center;padding:30px;color:#a5b4fc">⏳ ${en?'Submitting...':'제출 중...'}</div>`;
    try {
      const r = await fetch('/api/battle/submit-score', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({battle_id: btlState.currentBattleId, user_id: uid(), score: btlState.gameScore, game_data: {type:'word_quiz'}}) }).then(x=>x.json());
      const b = r.battle || {};
      const isMe = b.winner_uid === uid();
      const tied = b.status==='finished' && !b.winner_uid;
      let resultText = en?'Waiting for opponent...':'상대 점수 대기 중...';
      if (b.status === 'finished') {
        if (tied) resultText = en?'🤝 Tied! Both earn half reward.':'🤝 무승부! 양쪽 절반 보상';
        else if (isMe) resultText = en?'🏆 You WON!':'🏆 승리! 보상 포인트 획득!';
        else resultText = en?'😢 You lost. Try again!':'😢 졌어요. 다시 도전하세요!';
      }
      body.innerHTML = `<div style="text-align:center;padding:20px">
        <div style="font-size:28px;font-weight:800;color:#fbbf24;margin-bottom:10px">${btlState.gameScore} ${en?'pts':'점'}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-bottom:14px">${resultText}</div>
        <button onclick="btlShowTab('active')" style="background:#475569;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;margin-right:6px">◀ ${en?'Active':'진행중'}</button>
        <button onclick="btlShowTab('history')" style="background:#f43f5e;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:700">📜 ${en?'History':'전적'}</button>
      </div>`;
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  }
  async function btlShowHistory(){
    const en = isEn();
    const body = document.getElementById('btl-body'); if (!body) return;
    try {
      const r = await fetch('/api/battle/history?user_id=' + encodeURIComponent(uid())).then(x=>x.json());
      const list = r.list || [];
      const me = uid();
      const wins = list.filter(b => b.winner_uid === me).length;
      const losses = list.filter(b => b.winner_uid && b.winner_uid !== me).length;
      const ties = list.filter(b => !b.winner_uid).length;
      body.innerHTML = `<div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-around;text-align:center">
          <div><div style="font-size:11px;color:#94a3b8">${en?'Wins':'승'}</div><div style="font-size:20px;color:#86efac;font-weight:800">${wins}</div></div>
          <div><div style="font-size:11px;color:#94a3b8">${en?'Losses':'패'}</div><div style="font-size:20px;color:#fca5a5;font-weight:800">${losses}</div></div>
          <div><div style="font-size:11px;color:#94a3b8">${en?'Ties':'무'}</div><div style="font-size:20px;color:#94a3b8;font-weight:800">${ties}</div></div>
        </div>
        ${list.length ? list.map(b => `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px;margin-bottom:5px;font-size:12px;display:flex;justify-content:space-between;color:#e2e8f0">
          <span>${b.winner_uid===me?'🏆':(b.winner_uid?'😢':'🤝')} vs ${esc(b.challenger_uid===me?b.opponent_uid:b.challenger_uid)}</span>
          <span style="color:#fbbf24">${b.challenger_score}:${b.opponent_score}</span>
        </div>`).join('') : `<div style="text-align:center;padding:20px;color:#94a3b8">📭 ${en?'No history':'전적 없음'}</div>`}`;
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  }
  async function btlShowLeaderboard(){
    const en = isEn();
    const body = document.getElementById('btl-body'); if (!body) return;
    try {
      const r = await fetch('/api/battle/leaderboard').then(x=>x.json());
      const list = r.list || [];
      body.innerHTML = list.length ? list.map((x,i) => `<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px;margin-bottom:5px;display:flex;justify-content:space-between;font-size:13px;color:#e2e8f0">
        <span>${i<3?['🥇','🥈','🥉'][i]:(i+1)+'.'} ${esc(x.user_id)}</span><span style="color:#fbbf24;font-weight:700">${x.wins} ${en?'wins':'승'}</span>
      </div>`).join('') : `<div style="text-align:center;padding:30px;color:#94a3b8">📭 ${en?'No winners yet':'아직 승자 없음'}</div>`;
    } catch(e){ body.innerHTML = `<div style="color:#fca5a5;padding:20px">❌ ${esc(e.message)}</div>`; }
  }
})();
