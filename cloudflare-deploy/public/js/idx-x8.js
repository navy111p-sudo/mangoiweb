// ═══════════════════════════════════════════════════════════════
// idx-x8.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  var ABC = ['A','B','C','D','E','F'];
  var st = { quiz:null, idx:0, answers:[], loadedOnce:false, rec:null, chunks:[], recIdx:-1, lang:'en' };
  // 🈶 (2026-07-31) 복습퀴즈 언어 — 게임 탭에서 학생이 골라둔 언어(mangoi_game_lang)를 기본값으로 이어받는다.
  try { st.lang = (localStorage.getItem('mangoi_review_lang') || localStorage.getItem('mangoi_game_lang')) === 'zh' ? 'zh' : 'en'; } catch(e){}
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function isEn(){ return (window.langCurrent === 'en') || (document.documentElement.lang === 'en'); }
  function me(){
    try { var u = (typeof getCurrentUser==='function') ? getCurrentUser() : null; if (u && u.uid) return { uid:u.uid, name:u.name||u.uid, level:u.level||u.student_level||'' }; } catch(e){}
    try { var a = JSON.parse(localStorage.getItem('mangoi_logged_user')||localStorage.getItem('mango_user')||'null'); if (a && (a.uid||a.id)) return { uid:a.uid||a.id, name:a.name||'', level:a.level||a.student_level||'' }; } catch(e){}
    var g; try { g = localStorage.getItem('rqv_guest'); if(!g){ g='guest_'+Math.random().toString(36).slice(2,9); localStorage.setItem('rqv_guest',g);} }catch(e){ g='guest'; }
    return { uid:g, name:'게스트', level:'' };
  }
  /* ═══ 🙋 (2026-08-12 강사 Shas 5-b·5-c) 수업 안에서 강사 ↔ 학생 퀴즈 잇기 ═══
     [무엇이 문제였나] 강사와 학생이 «각자 다른 퀴즈» 를 풀고 있었다. 양쪽 모두 rqvAuto() 로
     자기 교재·레벨에 맞는 퀴즈를 따로 받아오는데(AI 자동 출제라 같은 조건이어도 다를 수 있다),
     서로를 잇는 메시지가 한 줄도 없었다. 그래서
       · 5-b 「학생이 고른 답이 강사 화면에 안 보인다」 — 볼 방법이 애초에 없었다
       · 5-c 「학생 쪽에선 퀴즈가 사라지는데 강사 화면엔 남는다」 — 문항 수가 서로 달라
              학생이 먼저 마지막 문항에 닿아 제출·결과 화면으로 넘어간 것이다
     [고치는 방향] 강사가 «퀴즈를 정하고», 학생의 진행 상황이 강사에게 보이게 한다.
     ⚠️ 학생을 강사와 «같은 문항에 묶지는» 않는다. 묶으면 학생이 스스로 못 넘기게 되어
        LEN ① 「학생이 퀴즈를 넘길 수가 없다」를 반대 방향으로 다시 만든다.
        같은 «퀴즈» 를 풀되, 문항 진도는 각자 — 대신 강사가 그 진도를 눈으로 본다. */
  function rqvIsStaff(){
    try { return !!(window.vcIsStaffNow && window.vcIsStaffNow()); }
    catch(e){ return window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'; }
  }
  function rqvInClass(){
    try { return document.body.classList.contains('vc-in-call') && !!window.vcConn; } catch(e){ return false; }
  }
  function rqvSend(type, data){
    /* 수업 밖(학생 사이드바에서 혼자 풀기)에서는 아무 데도 보내지 않는다 — 예전과 똑같이 동작한다. */
    if (!rqvInClass()) return;
    try { window.vcConn.send({ type: type, data: data }); } catch(e){}
  }
  /* 강사 화면에 뜨는 «학생 현황» — uid 별 마지막 상태만 들고 있는다(쌓지 않는다). */
  var live = {};
  function rqvLiveRender(){
    var el = $('rqv-live'); if (!el) return;
    var ids = Object.keys(live);
    if (!rqvIsStaff() || !ids.length) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    var rows = ids.map(function(uid){
      var s = live[uid];
      var who = '<b>🙋 ' + esc(s.name || uid) + '</b>';
      if (s.quit) return who + ' — <span style="color:#fca5a5">' + (isEn()?'left the quiz':'퀴즈를 그만뒀어요') + '</span>';
      if (s.done) return who + ' — <span style="color:#6ee7b7;font-weight:800">✅ ' + (isEn()?'submitted':'제출 완료')
                        + (s.score != null ? ' ' + s.score + '/' + s.total : '') + '</span>';
      var pos = (isEn()?'Q':'문항 ') + (s.idx + 1) + '/' + s.total;
      var pick = (s.text != null && s.text !== '')
        ? '<span style="color:#fde68a;font-weight:800">' + esc(s.text) + '</span>'
        : '<span style="color:#94a3b8">' + (isEn()?'not answered yet':'아직 안 골랐어요') + '</span>';
      return who + ' — ' + pos + ' · ' + pick;
    });
    /* innerHTML 을 쓰지만 학생이 넣은 값(name·text)은 전부 esc() 를 거친다 */
    el.innerHTML = '<div style="font-size:10.5px;font-weight:800;color:#6ee7b7;margin-bottom:3px">'
      + (isEn() ? '🙋 What students are doing right now' : '🙋 학생이 지금 무엇을 고르고 있는지')
      + '</div>' + rows.join('<br>');
  }
  /* 학생이 «지금 고른 것» 을 강사에게 알린다. 사람이 읽을 글자까지 함께 보내
     강사 쪽에서 퀴즈 원문을 다시 뒤지지 않아도 되게 한다(문항이 달라도 읽힌다). */
  function rqvReportPick(){
    if (rqvIsStaff() || !st.quiz) return;
    var i = st.idx, a = st.answers[i], q = st.quiz.questions[i] || {};
    var text = '';
    if (a != null && a !== '') {
      text = (typeof a === 'number')
        ? (ABC[a] + '. ' + String((q.opts && q.opts[a]) || ''))
        : String(a);
    }
    var u = me();
    rqvSend('quiz-pick', { uid: u.uid, name: u.name || ((typeof vcUsername !== 'undefined' && vcUsername) || ''),
                           idx: i, total: st.quiz.questions.length, text: text.slice(0, 80) });
  }
  /* 수업 메시지 수신 — idx-main.js 의 소켓 switch 가 여기로 넘겨 준다. */
  window.rqvOnClassMsg = function(type, d){
    try {
      d = d || {};
      if (type === 'quiz-share') {
        /* 강사가 연 퀴즈를 학생도 «같은 것» 으로 연다. 강사 자신은 이미 열려 있으니 무시. */
        if (rqvIsStaff() || !d.id) return;
        if (st.quiz && String(st.quiz.id) === String(d.id)) return;   // 이미 같은 퀴즈다
        st.loadedOnce = true;              // rqvOnEnter 의 자동 출제가 이걸 덮어쓰지 않게
        window.rqvOpen(d.id);
        return;
      }
      if (type === 'quiz-pick' || type === 'quiz-done') {
        if (!rqvIsStaff() || !d.uid) return;             // 학생 화면에는 남의 답을 띄우지 않는다
        var prev = live[d.uid] || {};
        live[d.uid] = {
          name: d.name || prev.name, idx: d.idx != null ? d.idx : prev.idx,
          total: d.total != null ? d.total : prev.total, text: d.text != null ? d.text : prev.text,
          done: type === 'quiz-done' && !d.quit, quit: type === 'quiz-done' && !!d.quit,
          score: d.score != null ? d.score : prev.score
        };
        rqvLiveRender();
      }
    } catch(e){}
  };

  // 이 수업의 교재/레벨/레슨 컨텍스트 추정
  function ctx(){
    var textbook = '';
    try { textbook = window.__mangoiCurrentBookId || window.__mangoiLastVideoBook || ''; } catch(e){}
    var level = '';
    try { level = me().level || localStorage.getItem('mangoi_current_level') || ''; } catch(e){}
    var lesson = 0;
    try { lesson = parseInt(localStorage.getItem('mangoi_current_lesson')||'0',10) || 0; } catch(e){}
    textbook = String(textbook||'').trim(); level = String(level||'').trim();
    // 🈶 중국어는 아직 다락원 Lv3 단일 커리큘럼뿐 — 수업화면이 교재를 못 읽어와도 기본값으로 채워
    //   "맞춤 퀴즈" 버튼이 항상 뭔가 만들어내도록 한다(교재가 늘면 이 기본값은 자연히 안 쓰이게 됨).
    if (st.lang === 'zh' && !textbook && !level) { textbook = '다락원'; level = 'Lv 3'; }
    return { textbook: textbook, level: level, lesson_no: lesson };
  }
  function setCtxLabel(){
    var c = ctx(); var parts = [];
    if (c.textbook) parts.push('📚 '+c.textbook);
    if (c.level) parts.push('📊 '+c.level);
    if (c.lesson_no) parts.push('Lesson '+c.lesson_no);
    var el = $('rqv-ctx'); if (el) el.textContent = parts.length ? parts.join('  ·  ') : (isEn()?'(general)':'(공통 퀴즈)');
    var lb = $('rqv-lang-btn'); if (lb) lb.textContent = (st.lang==='zh') ? '🇨🇳 中文' : '🇬🇧 EN';
  }
  // 🈶 EN ↔ 中文 토글 — 게임탭과 같은 키(mangoi_game_lang 겸용)에 저장해 다음에도 이어짐
  window.rqvToggleLang = function(){
    st.lang = (st.lang === 'zh') ? 'en' : 'zh';
    try { localStorage.setItem('mangoi_review_lang', st.lang); } catch(e){}
    st.loadedOnce = true;
    rqvAuto(true);
  };
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
        body: JSON.stringify({ textbook:c.textbook, level:c.level, lesson_no:c.lesson_no, lang:st.lang, auto_generate:1 }) }).then(function(x){return x.json();});
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
    /* 🙋 (Shas 5-c) 학생이 「그만두기」로 퀴즈를 떠나면 강사에게 알린다 —
       예전엔 학생 화면에서만 퀴즈가 사라져 「내 화면엔 남아 있는데?」가 됐다. */
    if (!rqvIsStaff() && st.quiz) {
      var _uq = me();
      rqvSend('quiz-done', { uid: _uq.uid, name: _uq.name || ((typeof vcUsername !== 'undefined' && vcUsername) || ''), quit: true });
      st.quiz = null;
    }
    setCtxLabel();
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#a3b3d1;font-size:13px">⏳ '+(isEn()?'Loading…':'불러오는 중…')+'</div>';
    try {
      /* 🈶 (2026-08-21) 언어 필터를 «반드시» 보낸다 — 서버는 lang 이 없으면 예전 호환을 위해
         활성 퀴즈를 «전부» 돌려준다(api-games.ts 의 listLang). 그래서 중국어 수업에서
         이 목록에 BTS·SIU 같은 영어 퀴즈가 그대로 섞여 나왔다(2026-08-21 사장님 제보).
         학생 사이드바(review-quiz-cn.html)는 2026-08-17 에 &lang=zh 로 고쳤는데
         «수업 화면 안» 인 이 파일만 같이 안 고쳐져 있었다. */
      var r = await fetch('/api/review-quiz/list?user_id='+encodeURIComponent(me().uid)+'&lang='+encodeURIComponent(st.lang==='zh'?'zh':'en')+'&token='+encodeURIComponent((function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })())).then(function(x){return x.json();});
      if (!r.ok) throw new Error(r.error||'load_fail');
      if (!r.quizzes.length){ var _lz = (st.lang==='zh'); body.innerHTML = '<div style="text-align:center;padding:34px;color:#a3b3d1;font-size:13.5px">📭 '+(isEn()?('No '+(_lz?'Chinese':'English')+' quizzes yet.'):('아직 등록된 '+(_lz?'중국어':'영어')+' 퀴즈가 없어요.<br>위 [🤖 이 수업 맞춤 퀴즈]를 눌러 출제를 받아보세요.'))+'</div>'; return; }
      body.innerHTML = r.quizzes.map(function(q){
        var srcBadge = q.source==='ai' ? '<span style="font-size:10px;background:rgba(251,191,36,0.18);color:#fbbf24;padding:1px 7px;border-radius:99px;font-weight:800">AI</span>'
          : q.source==='passage' ? '<span style="font-size:10px;background:rgba(16,185,129,0.18);color:#6ee7b7;padding:1px 7px;border-radius:99px;font-weight:800">📖 교재본문</span>' : '';
        var langBadge = q.lang==='zh' ? '<span style="font-size:10px;background:rgba(239,68,68,0.18);color:#fca5a5;padding:1px 7px;border-radius:99px;font-weight:800">中文</span>' : '';
        var tags = []; if (q.textbook) tags.push('📚 '+esc(q.textbook)); if (q.level) tags.push('📊 '+esc(q.level)); if (q.lesson_no) tags.push('L'+q.lesson_no);
        var meta = '<span>📝 '+q.question_count+(isEn()?' Q':'문항')+'</span>';
        if (q.best_score!=null) meta += '<span style="color:#6ee7b7;font-weight:700">🏆 '+(isEn()?'Best ':'최고 ')+q.best_score+'/'+q.question_count+'</span>';
        return '<button onclick="rqvOpen('+q.id+')" style="display:flex;align-items:center;gap:13px;width:100%;text-align:left;background:#14213b;border:1px solid rgba(251,191,36,0.18);border-radius:13px;padding:14px 16px;margin-bottom:9px;cursor:pointer;color:#e6ecff;font-family:inherit">'
          + '<span style="font-size:24px">🧠</span><span style="flex:1;min-width:0">'
          + '<div style="font-size:14.5px;font-weight:800;color:#fff;display:flex;align-items:center;gap:6px">'+esc(q.title)+' '+srcBadge+' '+langBadge+'</div>'
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
    // 🈶 목록에서 직접 연 퀴즈는 EN/中文 토글과 무관하게 실제 퀴즈 언어를 따른다(말하기 STT 힌트용).
    st.lang = (quiz.lang === 'zh') ? 'zh' : 'en';
    if (generated) { var t=$('rqv-ctx'); if(t) t.textContent='🤖 '+(isEn()?'AI just created this':'AI가 방금 만든 퀴즈')+' · '+(t.textContent||''); }
    /* 🙋 (Shas 5-b·5-c) 강사가 퀴즈를 열면 학생도 «같은 퀴즈» 를 연다.
       id 만 보낸다 — 문항 전체를 실어 보내면 회선을 먹고, 학생은 어차피 같은 API 로 받을 수 있다.
       ⚠️ 새 퀴즈를 열면 앞 퀴즈의 학생 현황은 지운다(남으면 옛 답이 새 문항 옆에 붙어 보인다). */
    if (rqvIsStaff() && quiz && quiz.id != null) {
      live = {}; rqvLiveRender();
      rqvSend('quiz-share', { id: quiz.id, title: quiz.title || '', n: quiz.questions.length });
    }
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
    /* 💡 (2026-08-11 강사 LEN ①) "학생이 퀴즈를 넘길 수가 없다"
       「다음 →」 은 답을 고르기 전에는 disabled 다(위 navNext). 그런데 화면에는 «흐린 버튼» 만
       보이고 왜 안 눌리는지 한 글자도 없었다 — 학생 눈에는 «고장난 버튼» 이다.
       특히 듣기 문항은 소리를 못 들으면 답을 고를 수 없어 영영 흐린 채로 남는다
       (자동재생이 막히면 소리가 안 난다) → 그때는 「다시 듣기」 를 함께 안내한다.
       ⚠️ 버튼을 «항상 켜는» 것으로 고치면 안 된다. 답 없이 넘어가면 채점이 빈칸으로 제출된다. */
    var _need = (st.answers[i] == null || st.answers[i] === '');
    var _needMsg = _need
      ? '<div style="margin-top:14px;padding:9px 12px;border-radius:10px;background:rgba(251,191,36,0.12);'
        + 'border:1px solid rgba(251,191,36,0.35);color:#fcd34d;font-size:12.5px;line-height:1.5;text-align:center">'
        + (isEn() ? 'Pick an answer first — then “Next” turns on.' : '먼저 답을 고르세요 — 그래야 「다음」이 켜집니다.')
        + (typ === 'listen'
            ? '<br>' + (isEn() ? 'Can’t hear it? Tap ▶ Play again above.' : '소리가 안 들리면 위의 ▶ 다시 듣기를 눌러 주세요.')
            : '')
        + '</div>'
      : '';
    var nav = _needMsg + '<div style="display:flex;gap:10px;margin-top:16px">'
      + (i>0?'<button onclick="rqvMove(-1)" style="flex:1;padding:13px;background:rgba(255,255,255,0.06);color:#e6ecff;border:1px solid rgba(251,191,36,0.18);border-radius:10px;font-weight:700;cursor:pointer;font-size:13px">← '+(isEn()?'Prev':'이전')+'</button>':'')
      + navNext + '</div>'
      + '<div style="text-align:center;margin-top:10px"><button onclick="rqvLoadList()" style="padding:8px 16px;background:transparent;color:#a3b3d1;border:1px solid rgba(148,163,184,0.3);border-radius:8px;font-size:12px;cursor:pointer">'+(isEn()?'Quit':'그만두기')+'</button></div>';
    $('rqv-body').innerHTML = head + inner + nav + '</div>';
    /* 🔊 auto=true — «사람이 누른 게 아니라 화면이 스스로 튼 것» 이라고 알려 준다.
       막히는 것은 정상이므로 실패로 취급하지 않고 «눌러 주세요» 안내로만 바꾼다(rqvSoundState). */
    if (typ==='listen') setTimeout(function(){ rqvPlay(i, true); }, 350);
  }
  window.st_setText = function(v){ st.answers[st.idx]=v; var n=$('rqv-next'); if(n){ n.disabled=!v.trim(); n.style.opacity=v.trim()?'1':'0.45'; } rqvReportPick(); };
  window.rqvPick = function(k){ st.answers[st.idx]=k; renderQ(); rqvReportPick(); };
  /* 문항을 옮길 때도 알린다 — 강사가 «어디까지 갔는지» 를 봐야 5-c 의 어긋남을 눈치챈다 */
  window.rqvMove = function(d){ st.idx+=d; renderQ(); $('rqv-body').scrollTop=0; rqvReportPick(); };
  // 🔊 듣기 음성 재생 (서버 TTS — 정답 원문 비공개)
  /* 🔊 (2026-08-11 강사 Shas 5-a) "듣기 오디오가 강사에게는 들리는데 학생에게는 안 들린다"
     [원인] 이 함수는 `a.play().catch(function(){})` 로 **재생 거부를 아무 말 없이 삼켰다.**
       듣기 문항은 그려진 뒤 350ms 에 «자동으로» 재생한다. 그런데 브라우저는 사용자가 그 페이지를
       한 번도 누르지 않았으면 소리를 막는다(자동재생 정책).
         · 강사 — 퀴즈를 고르고 버튼을 누르며 들어왔다 = 이미 «눌렀음» → 소리가 난다
         · 학생 — 강사가 탭을 바꿔 «따라 넘어온» 것이라 누른 적이 없다 → 차단 → 조용
       게다가 실패해도 버튼은 700ms 뒤 «다시 듣기» 로 되돌아가 아무 흔적도 남지 않았다.
       그래서 학생은 «소리가 안 나는데 왜인지 모르는» 상태가 되고, 듣기 문제라 답을 고를 수 없어
       「다음」이 영영 꺼져 있다 = LEN ① 「학생이 퀴즈를 못 넘긴다」의 뿌리.
     [수정] 거부를 삼키지 않는다. 막혔으면 «한 번 눌러 주세요» 를 눈에 띄게 띄운다(한/영).
       한 번 누르면 그때부터 이 페이지는 소리가 허용되므로 다음 문항부터는 자동으로 들린다. */
  function rqvSoundState(btn, s){
    var hintId = 'rqv-sound-hint';
    var old = document.getElementById(hintId); if (old) old.remove();
    if (!btn) return;
    btn.disabled = false;
    if (s.failed){ btn.textContent = '⚠️ ' + (isEn()?'audio failed':'음성 실패'); return; }
    if (s.blocked){
      btn.textContent = '🔊 ' + (isEn()?'Tap to hear the question':'눌러서 문제 듣기');
      btn.style.background = 'linear-gradient(135deg,#f59e0b,#d97706)';
      btn.style.animation = 'none';
      var h = document.createElement('div');
      h.id = hintId;
      h.style.cssText = 'margin-top:8px;font-size:12px;font-weight:700;line-height:1.5;color:#fcd34d';
      h.textContent = isEn()
        ? 'Your browser blocked the sound. Tap the button once — after that it plays by itself.'
        : '브라우저가 소리를 막았어요. 버튼을 한 번만 눌러 주세요 — 그 뒤로는 저절로 들립니다.';
      try { btn.parentNode.appendChild(h); } catch(_){}
      return;
    }
    btn.style.background = 'linear-gradient(135deg,#3b82f6,#6366f1)';
    btn.textContent = '🔊 ' + (isEn()?'Play again':'다시 듣기');
  }

  window.rqvPlay = async function(i, auto){
    var btn=$('rqv-play'); if(btn){ btn.disabled=true; btn.textContent='🔊 …'; }
    var blocked = false, failed = false;
    try {
      var resp = await fetch('/api/review-quiz/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ quiz_id:st.quiz.id, idx:(st.quiz.questions[i] && st.quiz.questions[i].idx!=null ? st.quiz.questions[i].idx : i) }) });
      if(!resp.ok) throw new Error('tts');
      var blob = await resp.blob();
      var url = URL.createObjectURL(blob);
      var a = new Audio(url);
      try { a.addEventListener('ended', function(){ try { URL.revokeObjectURL(url); } catch(_){} }); } catch(_){}
      st.audio = a;
      /* 여기가 핵심 — 거부를 잡아서 «막혔다» 로 남긴다(예전엔 빈 catch 로 버렸다) */
      try { await a.play(); } catch(err){ blocked = true; }
    } catch(e){ failed = true; }
    setTimeout(function(){ rqvSoundState(btn, { blocked: blocked, failed: failed }); }, blocked || failed ? 0 : 700);
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
          // 🈶 언어 힌트 필수 — 안 보내면 Whisper 가 자동감지하다 짧은 발화를 엉뚱한 언어로 오인식한다
          //   (영어를 한국어로 오인식하는 사고가 실제로 있었음). 중국어는 특히 짧은 단어일수록 치명적.
          var fd = new FormData(); fd.append('audio', blob, 'speak.webm'); fd.append('lang', st.lang==='zh'?'zh':'en');
          var r = await fetch('/api/voice/transcribe', { method:'POST', body: fd }).then(function(x){return x.json();});
          var text = (r && r.ok && r.text) ? String(r.text).trim() : '';
          if (!text){ if(stt) stt.textContent=isEn()?'Could not hear you. Try again.':'잘 못 들었어요. 다시 말해볼까요?'; return; }
          st.answers[i]=text;
          if(stt) stt.innerHTML='🗣 '+esc(text);
          var n=$('rqv-next'); if(n){ n.disabled=false; n.style.opacity='1'; }
          rqvReportPick();   // 🙋 말하기 답도 강사 현황에 — 객관식(rqvPick)과 같은 규칙
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
      /* 🙋 (Shas 5-c) 학생이 제출하면 강사 화면의 현황이 «✅ 제출 완료 + 점수» 로 바뀐다.
         예전엔 이 순간 학생 화면만 결과로 넘어가 «동기화가 깨진 것» 처럼 보였다 —
         이제 강사가 그 순간을 눈으로 본다. */
      if (!rqvIsStaff() && st.quiz) {
        var _u2 = me();
        rqvSend('quiz-done', { uid: _u2.uid, name: _u2.name || ((typeof vcUsername !== 'undefined' && vcUsername) || ''),
                               total: st.quiz.questions.length,
                               score: (r.score != null ? r.score : null) });
      }
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
