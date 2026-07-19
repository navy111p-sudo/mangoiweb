// ═══════════════════════════════════════════════════════════════
// idx-x8.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  var ABC = ['A','B','C','D','E','F'];
  var st = { quiz:null, idx:0, answers:[], loadedOnce:false, rec:null, chunks:[], recIdx:-1 };
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function isEn(){ return (window.langCurrent === 'en') || (document.documentElement.lang === 'en'); }
  function me(){
    try { var u = (typeof getCurrentUser==='function') ? getCurrentUser() : null; if (u && u.uid) return { uid:u.uid, name:u.name||u.uid, level:u.level||u.student_level||'' }; } catch(e){}
    try { var a = JSON.parse(localStorage.getItem('mangoi_logged_user')||localStorage.getItem('mango_user')||'null'); if (a && (a.uid||a.id)) return { uid:a.uid||a.id, name:a.name||'', level:a.level||a.student_level||'' }; } catch(e){}
    var g; try { g = localStorage.getItem('rqv_guest'); if(!g){ g='guest_'+Math.random().toString(36).slice(2,9); localStorage.setItem('rqv_guest',g);} }catch(e){ g='guest'; }
    return { uid:g, name:'게스트', level:'' };
  }
  // 이 수업의 교재/레벨/레슨 컨텍스트 추정
  function ctx(){
    var textbook = '';
    try { textbook = window.__mangoiCurrentBookId || window.__mangoiLastVideoBook || ''; } catch(e){}
    var level = '';
    try { level = me().level || localStorage.getItem('mangoi_current_level') || ''; } catch(e){}
    var lesson = 0;
    try { lesson = parseInt(localStorage.getItem('mangoi_current_lesson')||'0',10) || 0; } catch(e){}
    return { textbook: String(textbook||'').trim(), level: String(level||'').trim(), lesson_no: lesson };
  }
  function setCtxLabel(){
    var c = ctx(); var parts = [];
    if (c.textbook) parts.push('📚 '+c.textbook);
    if (c.level) parts.push('📊 '+c.level);
    if (c.lesson_no) parts.push('Lesson '+c.lesson_no);
    var el = $('rqv-ctx'); if (el) el.textContent = parts.length ? parts.join('  ·  ') : (isEn()?'(general)':'(공통 퀴즈)');
  }
  window.rqvOnEnter = function(){
    setCtxLabel();
    if (st.loadedOnce) return;
    st.loadedOnce = true;
    rqvAuto(false);
  };
  // 🤖 이 수업 맞춤: 교재/레벨/레슨 매칭 → 없으면 AI 자동 출제
  window.rqvAuto = async function(force){
    var body = $('rqv-body'); if (!body) return;
    setCtxLabel();
    var c = ctx();
    if (!c.textbook && !c.level && !force) { rqvLoadList(); return; }
    body.innerHTML = '<div style="text-align:center;padding:40px 16px;color:#a3b3d1;font-size:13.5px">'
      + '🤖 ' + (isEn()?'Preparing a quiz matched to this class…':'이 수업 교재·레벨·레슨에 맞는 퀴즈를 준비하고 있어요…')
      + '<div style="margin-top:10px;font-size:11.5px;color:#64748b">' + (isEn()?'AI may take ~10s to create one.':'없으면 AI가 약 10초 안에 새로 만들어요.') + '</div></div>';
    try {
      var r = await fetch('/api/review-quiz/auto', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ textbook:c.textbook, level:c.level, lesson_no:c.lesson_no, auto_generate:1 }) }).then(function(x){return x.json();});
      if (r && r.ok && r.quiz) { startQuiz(r.quiz, r.generated); return; }
      if (r && r.ok && !r.quiz) { body.innerHTML = '<div style="text-align:center;padding:30px;color:#a3b3d1;font-size:13px">'+(isEn()?'No matching quiz. Showing all quizzes.':'맞춤 퀴즈가 아직 없어요. 전체 목록을 보여드릴게요.')+'</div>'; setTimeout(rqvLoadList, 600); return; }
      throw new Error((r&&r.error)||'auto_fail');
    } catch(e){
      body.innerHTML = '<div style="text-align:center;padding:24px;color:#fca5a5;font-size:13px">⚠️ '+(isEn()?'Could not prepare quiz. ':'퀴즈 준비 실패. ')+esc(e.message)
        +'<div style="margin-top:12px"><button onclick="rqvLoadList()" style="padding:8px 16px;border:0;border-radius:8px;background:#fbbf24;color:#1a1a1a;font-weight:800;cursor:pointer">📋 '+(isEn()?'See all quizzes':'전체 퀴즈 보기')+'</button></div></div>';
    }
  };
  // 📋 전체 목록 (학생 사이드바와 동일)
  window.rqvLoadList = async function(){
    var body = $('rqv-body'); if (!body) return;
    setCtxLabel();
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#a3b3d1;font-size:13px">⏳ '+(isEn()?'Loading…':'불러오는 중…')+'</div>';
    try {
      var r = await fetch('/api/review-quiz/list?user_id='+encodeURIComponent(me().uid)+'&token='+encodeURIComponent((function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })())).then(function(x){return x.json();});
      if (!r.ok) throw new Error(r.error||'load_fail');
      if (!r.quizzes.length){ body.innerHTML = '<div style="text-align:center;padding:34px;color:#a3b3d1;font-size:13.5px">📭 '+(isEn()?'No quizzes yet.':'아직 등록된 퀴즈가 없어요.<br>위 [🤖 이 수업 맞춤 퀴즈]를 눌러 AI 출제를 받아보세요.')+'</div>'; return; }
      body.innerHTML = r.quizzes.map(function(q){
        var srcBadge = q.source==='ai' ? '<span style="font-size:10px;background:rgba(251,191,36,0.18);color:#fbbf24;padding:1px 7px;border-radius:99px;font-weight:800">AI</span>' : '';
        var tags = []; if (q.textbook) tags.push('📚 '+esc(q.textbook)); if (q.level) tags.push('📊 '+esc(q.level)); if (q.lesson_no) tags.push('L'+q.lesson_no);
        var meta = '<span>📝 '+q.question_count+(isEn()?' Q':'문항')+'</span>';
        if (q.best_score!=null) meta += '<span style="color:#6ee7b7;font-weight:700">🏆 '+(isEn()?'Best ':'최고 ')+q.best_score+'/'+q.question_count+'</span>';
        return '<button onclick="rqvOpen('+q.id+')" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:#14213b;border:1px solid rgba(251,191,36,0.18);border-radius:13px;padding:14px 16px;margin-bottom:9px;cursor:pointer;color:#e6ecff;font-family:inherit">'
          + '<span style="font-size:24px">🧠</span><span style="flex:1;min-width:0">'
          + '<div style="font-size:14.5px;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px">'+esc(q.title)+' '+srcBadge+'</div>'
          + (tags.length?'<div style="font-size:11px;color:#fbbf24;margin-top:3px">'+tags.join(' · ')+'</div>':'')
          + (q.description?'<div style="font-size:11.5px;color:#a3b3d1;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(q.description)+'</div>':'')
          + '<div style="font-size:11px;color:#a3b3d1;margin-top:5px;display:flex;gap:10px;flex-wrap:wrap">'+meta+'</div></span>'
          + '<span style="font-size:13px;color:#fbbf24;font-weight:800">'+(isEn()?'Start ▶':'풀기 ▶')+'</span></button>';
      }).join('');
    } catch(e){ body.innerHTML = '<div style="text-align:center;padding:24px;color:#fca5a5;font-size:13px">⚠️ '+esc(e.message)+'</div>'; }
  };
  window.rqvOpen = async function(id){
    var body = $('rqv-body');
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#a3b3d1">⏳…</div>';
    try { var r = await fetch('/api/review-quiz/get?id='+id).then(function(x){return x.json();}); if(!r.ok)throw new Error(r.error); startQuiz(r.quiz,false); }
    catch(e){ alert(isEn()?'Could not open quiz.':'퀴즈를 열 수 없어요.'); rqvLoadList(); }
  };
  function startQuiz(quiz, generated){
    st.quiz = quiz; st.idx = 0; st.answers = new Array(quiz.questions.length).fill(null);
    if (generated) { var t=$('rqv-ctx'); if(t) t.textContent='🤖 '+(isEn()?'AI just created this':'AI가 방금 만든 퀴즈')+' · '+(t.textContent||''); }
    renderQ();
  }
  var TYPE_ICON = { choice:'📝', listen:'🎧', write:'✍️', speak:'🎤' };
  var TYPE_KO = { choice:'객관식', listen:'듣기', write:'쓰기', speak:'말하기' };
  function renderQ(){
    var qz=st.quiz, i=st.idx, q=qz.questions[i], total=qz.questions.length;
    var pct=Math.round((i/total)*100);
    var typ = q.type||'choice';
    var head = '<div style="height:6px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;margin-bottom:14px"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#fbbf24,#f59e0b);border-radius:99px"></div></div>'
      + '<div style="background:#14213b;border:1px solid rgba(251,191,36,0.18);border-radius:16px;padding:22px;max-width:620px;margin:0 auto">'
      + '<div style="font-size:11.5px;color:#fbbf24;font-weight:800;margin-bottom:8px">'+esc(qz.title)+' — '+TYPE_ICON[typ]+' '+(isEn()?typ:TYPE_KO[typ])+' · Q'+(i+1)+'/'+total+'</div>';
    var inner = '';
    if (typ==='choice' || typ==='listen'){
      if (typ==='listen'){
        inner += '<div style="text-align:center;margin-bottom:16px"><button id="rqv-play" onclick="rqvPlay('+i+')" style="padding:14px 26px;border:0;border-radius:99px;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;font-size:15px;font-weight:800;cursor:pointer">🔊 '+(isEn()?'Play audio':'음성 듣기')+'</button>'
          + '<div style="font-size:11px;color:#a3b3d1;margin-top:7px">'+(isEn()?'Listen and pick the answer (replayable)':'잘 듣고 정답을 고르세요 (여러 번 들을 수 있어요)')+'</div></div>';
      }
      inner += '<div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:16px;line-height:1.4">'+esc(q.q)+'</div>';
      inner += q.opts.map(function(o,k){
        return '<button class="rqv-opt" onclick="rqvPick('+k+')" style="display:block;width:100%;text-align:left;padding:13px 16px;margin-bottom:8px;background:'+(st.answers[i]===k?'rgba(59,130,246,0.22)':'rgba(15,23,42,0.6)')+';color:#e6ecff;border:1px solid '+(st.answers[i]===k?'#3b82f6':'rgba(148,163,184,0.2)')+';border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit">'
          + '<span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:rgba(251,191,36,0.18);color:#fbbf24;border-radius:50%;font-weight:800;font-size:12px;margin-right:10px">'+ABC[k]+'</span>'+esc(o)+'</button>';
      }).join('');
    } else if (typ==='write'){
      inner += '<div style="font-size:16px;font-weight:800;color:#fff;margin-bottom:14px;line-height:1.5">'+esc(q.q)+'</div>';
      inner += '<input id="rqv-text" value="'+esc(st.answers[i]||'')+'" oninput="st_setText(this.value)" placeholder="'+(isEn()?'Type the English sentence':'영어 문장을 입력하세요')+'" autocomplete="off" style="width:100%;padding:14px 16px;border-radius:10px;border:1px solid rgba(148,163,184,0.4);background:rgba(255,255,255,0.95);color:#111;font-size:15px;font-family:inherit" />';
    } else if (typ==='speak'){
      inner += '<div style="font-size:14px;color:#a3b3d1;margin-bottom:8px">'+esc(q.q)+'</div>';
      inner += '<div style="font-size:20px;font-weight:800;color:#fff;background:rgba(251,191,36,0.10);border:1px dashed rgba(251,191,36,0.4);border-radius:12px;padding:18px;text-align:center;margin-bottom:14px;line-height:1.4">'+esc(q.target||'')+'</div>';
      inner += '<div style="text-align:center"><button id="rqv-mic" onclick="rqvMic('+i+')" style="padding:14px 26px;border:0;border-radius:99px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:15px;font-weight:800;cursor:pointer">🎤 '+(isEn()?'Record':'녹음하고 말하기')+'</button>'
        + '<div id="rqv-mic-status" style="font-size:12px;color:#a3b3d1;margin-top:10px">'+(st.answers[i]?('🗣 '+esc(st.answers[i])):(isEn()?'Tap to record your voice':'버튼을 누르고 또박또박 말해보세요'))+'</div></div>';
    }
    var navNext = (i<total-1)
      ? '<button id="rqv-next" '+(st.answers[i]==null||st.answers[i]===''?'disabled':'')+' onclick="rqvMove(1)" style="flex:1;padding:13px;border:0;border-radius:10px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;font-weight:800;cursor:pointer;font-size:13px;opacity:'+(st.answers[i]==null||st.answers[i]===''?'0.45':'1')+'">'+(isEn()?'Next →':'다음 →')+'</button>'
      : '<button id="rqv-next" '+(st.answers[i]==null||st.answers[i]===''?'disabled':'')+' onclick="rqvSubmit()" style="flex:1;padding:13px;border:0;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;cursor:pointer;font-size:13px;opacity:'+(st.answers[i]==null||st.answers[i]===''?'0.45':'1')+'">✅ '+(isEn()?'Submit':'제출하기')+'</button>';
    var nav = '<div style="display:flex;gap:10px;margin-top:16px">'
      + (i>0?'<button onclick="rqvMove(-1)" style="flex:1;padding:13px;background:rgba(255,255,255,0.06);color:#e6ecff;border:1px solid rgba(251,191,36,0.18);border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">← '+(isEn()?'Prev':'이전')+'</button>':'')
      + navNext + '</div>'
      + '<div style="text-align:center;margin-top:10px"><button onclick="rqvLoadList()" style="padding:8px 16px;background:transparent;color:#a3b3d1;border:1px solid rgba(148,163,184,0.3);border-radius:8px;font-size:12px;cursor:pointer">'+(isEn()?'Quit':'그만두기')+'</button></div>';
    $('rqv-body').innerHTML = head + inner + nav + '</div>';
    if (typ==='listen') setTimeout(function(){ rqvPlay(i); }, 350);
  }
  window.st_setText = function(v){ st.answers[st.idx]=v; var n=$('rqv-next'); if(n){ n.disabled=!v.trim(); n.style.opacity=v.trim()?'1':'0.45'; } };
  window.rqvPick = function(k){ st.answers[st.idx]=k; renderQ(); };
  window.rqvMove = function(d){ st.idx+=d; renderQ(); $('rqv-body').scrollTop=0; };
  // 🔊 듣기 음성 재생 (서버 TTS — 정답 원문 비공개)
  window.rqvPlay = async function(i){
    var btn=$('rqv-play'); if(btn){ btn.disabled=true; btn.textContent='🔊 …'; }
    try {
      var resp = await fetch('/api/review-quiz/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ quiz_id:st.quiz.id, idx:(st.quiz.questions[i] && st.quiz.questions[i].idx!=null ? st.quiz.questions[i].idx : i) }) });
      if(!resp.ok) throw new Error('tts');
      var blob = await resp.blob(); var a = new Audio(URL.createObjectURL(blob)); a.play().catch(function(){});
    } catch(e){ if(btn) btn.textContent='⚠️ '+(isEn()?'audio failed':'음성 실패'); }
    finally { if(btn){ setTimeout(function(){ btn.disabled=false; btn.textContent='🔊 '+(isEn()?'Play again':'다시 듣기'); }, 700);} }
  };
  // 🎤 말하기 녹음 → 서버 STT → 텍스트 답안 저장
  window.rqvMic = async function(i){
    var btn=$('rqv-mic'), stt=$('rqv-mic-status');
    if (st.rec && st.recIdx===i){ // 정지
      try { st.rec.stop(); } catch(e){}
      return;
    }
    if (!navigator.mediaDevices || !window.MediaRecorder){ if(stt) stt.textContent=isEn()?'Mic not supported':'이 기기는 녹음을 지원하지 않아요'; return; }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      st.chunks=[]; st.recIdx=i;
      var mime = MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'';
      st.rec = new MediaRecorder(stream, mime?{mimeType:mime}:undefined);
      st.rec.ondataavailable = function(e){ if(e.data && e.data.size) st.chunks.push(e.data); };
      st.rec.onstop = async function(){
        try { stream.getTracks().forEach(function(t){t.stop();}); } catch(e){}
        if(btn){ btn.textContent='🎤 '+(isEn()?'Record':'녹음하고 말하기'); btn.style.background='linear-gradient(135deg,#10b981,#059669)'; }
        if(stt) stt.textContent='🧠 '+(isEn()?'Recognizing…':'음성 인식 중…');
        var blob = new Blob(st.chunks, { type:'audio/webm' });
        st.rec=null; st.recIdx=-1;
        if (blob.size < 600){ if(stt) stt.textContent=isEn()?'Too short, try again':'너무 짧아요. 다시 시도해주세요'; return; }
        try {
          var fd = new FormData(); fd.append('audio', blob, 'speak.webm');
          var r = await fetch('/api/voice/transcribe', { method:'POST', body: fd }).then(function(x){return x.json();});
          var text = (r && r.ok && r.text) ? String(r.text).trim() : '';
          if (!text){ if(stt) stt.textContent=isEn()?'Could not hear you. Try again.':'잘 못 들었어요. 다시 말해볼까요?'; return; }
          st.answers[i]=text;
          if(stt) stt.innerHTML='🗣 '+esc(text);
          var n=$('rqv-next'); if(n){ n.disabled=false; n.style.opacity='1'; }
        } catch(e){ if(stt) stt.textContent=isEn()?'Recognition failed':'인식 실패. 다시 시도해주세요'; }
      };
      st.rec.start();
      if(btn){ btn.textContent='⏹ '+(isEn()?'Stop':'정지'); btn.style.background='linear-gradient(135deg,#ef4444,#dc2626)'; }
      if(stt) stt.textContent='🔴 '+(isEn()?'Recording… tap Stop when done':'녹음 중… 끝나면 정지를 누르세요');
    } catch(e){ if(stt) stt.textContent=isEn()?'Mic permission needed':'마이크 권한이 필요해요'; }
  };
  window.rqvSubmit = async function(){
    var btn=$('rqv-next'); if(btn){ btn.disabled=true; btn.textContent=isEn()?'Scoring…':'채점 중…'; }
    var u=me();
    try {
      // 🔐 실계정은 mango_token 으로 본인 확인(서버 IDOR 가드). 게스트(guest_*)는 토큰 불필요.
      var _tok=(function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })();
      var _payload={ quiz_id:st.quiz.id, user_id:u.uid, user_name:u.name, answers:st.answers, served: st.quiz.questions.map(function(q){ return (q && q.idx!=null) ? q.idx : 0; }), token:_tok };
      var r = await fetch('/api/review-quiz/submit', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(_payload) }).then(function(x){return x.json();});
      if(!r.ok && r.error==='auth_required'){
        // 토큰 없는 옛 세션 폴백: 게스트 uid 로 재제출(점수 표시 유지 — 수업 흐름 안 끊김)
        _payload.user_id=(function(){ try { var g=localStorage.getItem('rqv_guest'); if(!g){ g='guest_'+Math.random().toString(36).slice(2,9); localStorage.setItem('rqv_guest',g);} return g; } catch(e){ return 'guest_fb'; } })();
        r = await fetch('/api/review-quiz/submit', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(_payload) }).then(function(x){return x.json();});
      }
      if(!r.ok) throw new Error(r.error||'submit');
      showResult(r);
    } catch(e){ alert(isEn()?'Submit failed.':'제출 실패. 다시 시도해주세요.'); renderQ(); }
  };
  function showResult(r){
    var qz=st.quiz;
    var color = r.percent>=80?'#10b981':(r.percent>=50?'#fbbf24':'#ef4444');
    var msg = r.percent===100?(isEn()?'🎉 Perfect!':'🎉 만점! 완벽해요!')
      : r.percent>=80?(isEn()?'🌟 Great job!':'🌟 훌륭해요! 거의 다 맞췄어요!')
      : r.percent>=50?(isEn()?'💪 Good try!':'💪 잘했어요! 틀린 건 한 번 더 복습해요.')
      : (isEn()?'📚 Keep going!':'📚 괜찮아요! 복습하고 다시 도전해요.');
    var review = r.detail.map(function(d,i){
      var q = qz.questions[i]; var typ=d.type||'choice';
      var line='';
      if (typ==='choice'||typ==='listen'){
        var your=(d.your_answer!=null && q.opts && q.opts[d.your_answer]!=null)?(ABC[d.your_answer]+'. '+q.opts[d.your_answer]):(isEn()?'(no answer)':'(무응답)');
        var ans=(q.opts&&q.opts[d.answer]!=null)?(ABC[d.answer]+'. '+q.opts[d.answer]):'';
        line='<div style="font-size:12.5px;color:'+(d.correct?'#6ee7b7':'#fca5a5')+'">'+(isEn()?'My answer: ':'내 답: ')+esc(your)+'</div>'
           + (!d.correct?'<div style="font-size:12.5px;color:#6ee7b7">'+(isEn()?'Answer: ':'정답: ')+esc(ans)+'</div>':'')
           + (typ==='listen'&&d.audio_text?'<div style="font-size:11.5px;color:#a3b3d1;margin-top:2px">🎧 '+esc(d.audio_text)+'</div>':'');
      } else {
        line='<div style="font-size:12.5px;color:'+(d.correct?'#6ee7b7':'#fca5a5')+'">'+(isEn()?'You said/wrote: ':'내 답: ')+esc(d.your_text||'-')+(d.accuracy!=null?' ('+d.accuracy+'%)':'')+'</div>'
           + '<div style="font-size:12.5px;color:#6ee7b7">'+(isEn()?'Target: ':'정답: ')+esc(d.answer_text||'')+'</div>';
      }
      return '<div style="text-align:left;background:rgba(15,23,42,0.55);border:1px solid rgba(148,163,184,0.18);border-radius:12px;padding:13px 15px;margin-top:9px">'
        + '<div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:5px">'+(d.correct?'⭕':'❌')+' '+TYPE_ICON[typ]+' Q'+(i+1)+'. '+esc(q.q)+'</div>'+line
        + (d.explain?'<div style="font-size:11.5px;color:#a3b3d1;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(148,163,184,0.25)">💡 '+esc(d.explain)+'</div>':'')+'</div>';
    }).join('');
    $('rqv-body').innerHTML = '<div style="background:#14213b;border:1px solid rgba(251,191,36,0.18);border-radius:16px;padding:26px 20px;text-align:center;max-width:620px;margin:0 auto">'
      + '<div style="font-size:13px;color:#a3b3d1;font-weight:700;margin-bottom:8px">'+esc(qz.title)+'</div>'
      + '<div style="font-size:50px;font-weight:900;line-height:1;color:'+color+'">'+r.score+' / '+r.total+'</div>'
      + '<div style="font-size:13px;color:#a3b3d1;margin-top:6px">'+(isEn()?'Score ':'점수 ')+r.percent+(isEn()?' pts':'점')+'</div>'
      + '<div style="margin-top:13px;padding:12px 16px;background:rgba(251,191,36,0.10);border-radius:10px;font-size:13.5px;color:#fde68a">'+msg+'</div>'
      + review
      + '<div style="display:flex;gap:10px;margin-top:16px"><button onclick="rqvLoadList()" style="flex:1;padding:12px;background:rgba(255,255,255,0.06);color:#e6ecff;border:1px solid rgba(251,191,36,0.18);border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">📋 '+(isEn()?'Quiz list':'퀴즈 목록')+'</button>'
      + '<button onclick="rqvOpen('+qz.id+')" style="flex:1;padding:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;border:0;border-radius:10px;font-weight:800;cursor:pointer;font-size:13px">🔄 '+(isEn()?'Try again':'다시 도전')+'</button></div></div>';
    $('rqv-body').scrollTop=0;
  }
})();
