// ═══════════════════════════════════════════════════════════════
// adm-q4.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  var rqCache = [];
  var rqEditing = 0;
  function rqEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  var RQ_ABC = ['A','B','C','D'];

  var RQ_TYPE_LABEL = { choice:'📝 객관식', listen:'🎧 듣기', write:'✍️ 쓰기', speak:'🎤 말하기' };
  window.rqAddQ = function(data){
    data = data || {};
    var type = ['choice','listen','write','speak'].indexOf(data.type)>=0 ? data.type : 'choice';
    var list = document.getElementById('rq-qlist');
    var n = list.children.length;
    if (n >= 30) { alert('문항은 최대 30개까지예요.'); return; }
    var div = document.createElement('div');
    div.className = 'rq-qblock';
    div.setAttribute('data-type', type);
    var explain = '<input class="rq-in rq-explain" style="margin-top:6px" placeholder="해설 (선택) — 정답 공개 시 학생에게 보여요" value="'+rqEsc(data.explain||'')+'" />';
    var inner = '';
    if (type==='choice' || type==='listen') {
      var opts = (data.opts && data.opts.length) ? data.opts : ['','','',''];
      var optHtml='';
      for (var k=0;k<4;k++) optHtml += '<div class="rq-opt-row"><b>'+RQ_ABC[k]+'</b><input class="rq-in rq-opt" placeholder="보기 '+RQ_ABC[k]+(k>1?' (선택)':' *')+'" value="'+rqEsc(opts[k]||'')+'" /></div>';
      var audioRow = (type==='listen')
        ? '<label style="color:#3b82f6">🔊 듣기 음성 문장 * (학생에게 TTS로 읽어줌, 정답 원문은 비공개)</label>'
          + '<input class="rq-in rq-audio" placeholder="예: The cat is sleeping on the bed." value="'+rqEsc(data.audio_text||'')+'" />'
        : '';
      inner = audioRow
        + '<input class="rq-in rq-q" style="margin-top:6px" placeholder="'+(type==='listen'?'질문 (선택, 비우면 🎧 잘 듣고 고르세요)':'문제를 입력하세요 *')+'" value="'+rqEsc(data.q||'')+'" />'
        + optHtml
        + '<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><span style="font-size:12px;font-weight:700">정답:</span>'
        + '<select class="rq-in rq-ans" style="width:auto;padding:6px 10px">'
        + '<option value="0"'+(data.answer===0||data.answer==null?' selected':'')+'>A</option>'
        + '<option value="1"'+(data.answer===1?' selected':'')+'>B</option>'
        + '<option value="2"'+(data.answer===2?' selected':'')+'>C</option>'
        + '<option value="3"'+(data.answer===3?' selected':'')+'>D</option></select></div>'
        + explain;
    } else if (type==='write') {
      inner = '<input class="rq-in rq-q" style="margin-top:6px" placeholder="문제(한국어 지시문) * 예: 다음 뜻의 영어 문장을 쓰세요 — 나는 사과를 좋아해요" value="'+rqEsc(data.q||'')+'" />'
        + '<label style="color:#059669">✍️ 정답 문장 *</label>'
        + '<input class="rq-in rq-answer-text" placeholder="예: I like apples." value="'+rqEsc(data.answer_text||'')+'" />'
        + '<label>✅ 추가 정답 (선택, 쉼표로 구분)</label>'
        + '<input class="rq-in rq-accept" placeholder="예: I love apples., I like apple" value="'+rqEsc((data.accept||[]).join(', '))+'" />'
        + explain;
    } else { // speak
      inner = '<input class="rq-in rq-q" style="margin-top:6px" placeholder="안내문 (선택, 비우면 🎤 또박또박 읽어보세요)" value="'+rqEsc(data.q||'')+'" />'
        + '<label style="color:#d97706">🎤 학생이 읽을(말할) 문장 *</label>'
        + '<input class="rq-in rq-answer-text" placeholder="예: How are you today?" value="'+rqEsc(data.answer_text||'')+'" />'
        + '<div style="font-size:11px;color:#6b7280;margin-top:3px">학생이 마이크로 말하면 음성인식으로 자동 채점돼요 (60% 이상 일치 시 정답).</div>'
        + explain;
    }
    div.innerHTML =
      '<button class="rq-del-q" onclick="this.parentNode.remove();rqRenum()">✕ 삭제</button>' +
      '<b class="rq-qnum" style="font-size:12.5px;color:#0369a1">Q'+(n+1)+'</b>' +
      '<span class="rq-type-badge" style="margin-left:8px;font-size:11px;font-weight:800;padding:2px 9px;border-radius:99px;background:rgba(99,102,241,0.12);color:#4338ca">'+RQ_TYPE_LABEL[type]+'</span>' +
      inner;
    list.appendChild(div);
  };
  window.rqRenum = function(){
    var blocks = document.querySelectorAll('#rq-qlist .rq-qblock .rq-qnum');
    for (var i=0; i<blocks.length; i++) blocks[i].textContent = 'Q'+(i+1);
  };
  function rqCollect(){
    var title = document.getElementById('rq-title').value.trim();
    if (!title) { alert('퀴즈 제목을 입력하세요.'); return null; }
    var blocks = document.querySelectorAll('#rq-qlist .rq-qblock');
    if (!blocks.length) { alert('문항을 1개 이상 추가하세요.'); return null; }
    var questions = [];
    for (var i=0; i<blocks.length; i++) {
      var b = blocks[i];
      var type = b.getAttribute('data-type') || 'choice';
      var qEl = b.querySelector('.rq-q'); var q = qEl ? qEl.value.trim() : '';
      var explain = (b.querySelector('.rq-explain')||{}).value ? b.querySelector('.rq-explain').value.trim() : '';
      if (type==='choice' || type==='listen') {
        if (type==='choice' && !q) { alert('Q'+(i+1)+' 문제를 입력하세요.'); return null; }
        var optEls = b.querySelectorAll('.rq-opt'); var opts=[];
        for (var k=0;k<optEls.length;k++){ var v=optEls[k].value.trim(); if(v) opts.push(v); }
        if (opts.length<2){ alert('Q'+(i+1)+' 보기를 2개 이상 입력하세요.'); return null; }
        var ans = parseInt(b.querySelector('.rq-ans').value,10)||0;
        if (ans>=opts.length){ alert('Q'+(i+1)+' 정답으로 고른 보기가 비어 있어요.'); return null; }
        var item = { type:type, q:q, opts:opts, answer:ans, explain:explain };
        if (type==='listen') {
          var at = (b.querySelector('.rq-audio')||{}).value ? b.querySelector('.rq-audio').value.trim() : '';
          if (!at){ alert('Q'+(i+1)+' 듣기 음성 문장을 입력하세요.'); return null; }
          item.audio_text = at;
        }
        questions.push(item);
      } else {
        var atxt = (b.querySelector('.rq-answer-text')||{}).value ? b.querySelector('.rq-answer-text').value.trim() : '';
        if (!atxt){ alert('Q'+(i+1)+' 정답 문장을 입력하세요.'); return null; }
        if (type==='write' && !q){ alert('Q'+(i+1)+' 문제(지시문)를 입력하세요.'); return null; }
        var accept = [];
        var acEl = b.querySelector('.rq-accept');
        if (acEl && acEl.value.trim()) accept = acEl.value.split(',').map(function(s){return s.trim();}).filter(Boolean);
        questions.push({ type:type, q:q, answer_text:atxt, accept:accept, explain:explain });
      }
    }
    var lessonV = parseInt(document.getElementById('rq-lesson').value,10);
    return {
      title:title,
      description: document.getElementById('rq-desc').value.trim(),
      textbook: document.getElementById('rq-textbook').value.trim(),
      level: document.getElementById('rq-level').value.trim(),
      lesson_no: (lessonV>0?lessonV:0),
      questions:questions
    };
  }
  // 🤖 AI 자동 출제
  window.rqAiGen = async function(){
    var msg = document.getElementById('rq-ai-msg');
    var counts = {
      listen: parseInt(document.getElementById('rq-ai-listen').value,10)||0,
      write:  parseInt(document.getElementById('rq-ai-write').value,10)||0,
      speak:  parseInt(document.getElementById('rq-ai-speak').value,10)||0,
      choice: parseInt(document.getElementById('rq-ai-choice').value,10)||0
    };
    if (counts.listen+counts.write+counts.speak+counts.choice === 0){ msg.textContent='⚠️ 문항 수를 1개 이상 지정하세요.'; return; }
    msg.style.color='#4338ca'; msg.textContent='🤖 AI가 문항을 만드는 중… (약 10초)';
    var lessonV = parseInt(document.getElementById('rq-lesson').value,10);
    try {
      var r = await fetch('/api/admin/review-quiz/ai-generate', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          textbook: document.getElementById('rq-textbook').value.trim(),
          level: document.getElementById('rq-level').value.trim(),
          lesson_no: (lessonV>0?lessonV:0),
          topic: document.getElementById('rq-ai-topic').value.trim(),
          counts: counts
        }) }).then(function(x){return x.json();});
      if (!r.ok) throw new Error(r.error||'ai_fail');
      var qs = r.questions||[];
      if (!qs.length) throw new Error('생성된 문항 없음');
      if (document.getElementById('rq-ai-replace').checked) document.getElementById('rq-qlist').innerHTML='';
      qs.forEach(function(qq){ rqAddQ(qq); });
      rqRenum();
      msg.style.color='#059669'; msg.textContent='✅ '+qs.length+'개 문항이 추가됐어요. 내용을 검토·수정 후 저장하세요.';
    } catch(e){ msg.style.color='#b91c1c'; msg.textContent='⚠️ 생성 실패: '+e.message+' (Workers AI 응답 문제일 수 있어요. 다시 시도하거나 수동 입력하세요.)'; }
  };
  // 🏗️ 전체 교재 40문제 은행 자동 생성 (교재 목록을 돌며 배치 생성)
  window.__rqBankStop = false;
  window.rqBuildAllBanks = async function(){
    var msg = document.getElementById('rq-bank-msg');
    var bar = document.getElementById('rq-bank-bar');
    var barWrap = document.getElementById('rq-bank-progress');
    var startBtn = document.getElementById('rq-bank-all-btn');
    var stopBtn = document.getElementById('rq-bank-stop-btn');
    if (!confirm('교재마다 40문제 은행을 AI로 생성합니다. 교재 수에 따라 수십 분 걸리고, 끝날 때까지 이 탭을 열어두어야 해요. 시작할까요?')) return;
    window.__rqBankStop = false;
    startBtn.disabled = true; stopBtn.style.display=''; barWrap.style.display='';
    var sleep = function(ms){ return new Promise(function(res){ setTimeout(res, ms); }); };
    msg.style.color='#047857'; msg.textContent='📚 교재 목록을 불러오는 중…';
    var books = [];
    try {
      var g = await fetch('/api/admin/textbook-files?group=1', { credentials:'include' }).then(function(x){return x.json();});
      books = (g.groups||[]).filter(function(b){ return b.book && b.book!=='(기타)'; });
    } catch(e){ msg.style.color='#b91c1c'; msg.textContent='⚠️ 교재 목록 로드 실패: '+e.message; startBtn.disabled=false; stopBtn.style.display='none'; return; }
    if (!books.length){ msg.textContent='⚠️ 교재가 없습니다.'; startBtn.disabled=false; stopBtn.style.display='none'; return; }
    var total = books.length, doneBooks = 0, okBooks = 0, failedBooks = 0, madeQ = 0, aborted = false;
    // 한 교재 은행 생성 — HTTP 상태/JSON을 정직하게 파싱
    async function buildOne(bk, lvl){
      var size = 0, guard = 0, lastErr = '';
      while (size < 40 && guard < 6){
        if (window.__rqBankStop) break;
        guard++;
        var status = 0, data = null, raw = '';
        try {
          var resp = await fetch('/api/admin/review-quiz/build-bank', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ textbook: bk.book, level: lvl, target: 40 }) });
          status = resp.status; raw = await resp.text();
          try { data = JSON.parse(raw); } catch(e){ data = null; }
        } catch(e){ lastErr='network'; await sleep(1500); continue; }
        // 엔드포인트 자체가 없거나(404/405) JSON이 아니면 = 백엔드 미배포 → 전체 중단
        if (status === 404 || status === 405 || (data === null && status !== 200)){ return { size:0, fatal:true, status:status }; }
        if (!data || data.ok !== true){ lastErr = (data && data.error) || ('http '+status); await sleep(700); break; }
        size = data.bank_size || 0;
        if (data.done) break;
      }
      return { size:size, fatal:false, err:lastErr };
    }
    for (var bi=0; bi<books.length; bi++){
      if (window.__rqBankStop){ aborted=true; break; }
      var bk = books[bi]; var lvl = bk.level || '';
      var res = await buildOne(bk, lvl);
      if (res.fatal){
        msg.style.color='#b91c1c';
        msg.innerHTML='❌ 생성 엔드포인트가 라이브에 없습니다 (HTTP '+res.status+'). <b>아직 배포되지 않았어요.</b><br>먼저 <b>mangoiweb(last) 폴더에서 deploy.bat 실행</b> 후 다시 시도하세요. (지금까지 실제로 저장된 은행: '+okBooks+'개)';
        startBtn.disabled=false; stopBtn.style.display='none';
        return;
      }
      doneBooks++;
      if (res.size >= 10) okBooks++; else failedBooks++;
      var pct = Math.round(doneBooks/total*100);
      bar.style.width = pct+'%';
      bar.style.background = failedBooks ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#10b981,#34d399)';
      msg.style.color='#047857';
      msg.textContent='🏗️ '+doneBooks+'/'+total+' 교재 ('+pct+'%) · 성공 '+okBooks+' · 실패 '+failedBooks+' — 최근: '+bk.book+' ('+res.size+'/40)';
      await sleep(120);
    }
    if (aborted){
      msg.style.color='#b45309';
      msg.textContent='⏹ 중단됨 — 성공 '+okBooks+' · 실패 '+failedBooks+' / '+total+' 교재. 다시 시작하면 이어서 진행돼요.';
    } else {
      bar.style.width='100%';
      if (failedBooks === 0){
        msg.style.color='#047857';
        msg.textContent='✅ 완료: '+okBooks+'/'+total+' 교재 은행 생성. 학생 복습퀴즈에서 교재별 랜덤 10문제로 출제됩니다.';
      } else {
        msg.style.color='#b45309';
        msg.textContent='⚠️ 완료: 성공 '+okBooks+' · 실패 '+failedBooks+' / '+total+' 교재. 실패분은 버튼을 다시 눌러 재시도하세요 (이미 된 교재는 건너뜀).';
      }
    }
    startBtn.disabled=false; stopBtn.style.display='none';
    if (window.rqLoad) try{ rqLoad(); }catch(e){}
  };
  window.rqSave = async function(){
    var body = rqCollect(); if (!body) return;
    if (rqEditing) body.id = rqEditing;
    var btn = document.getElementById('rq-save-btn');
    btn.disabled = true; btn.textContent = '저장 중…';
    try {
      var r = await fetch('/api/admin/review-quiz/save', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }).then(function(x){ return x.json(); });
      if (r && r.ok) {
        document.getElementById('rq-form-msg').textContent = '✅ 저장되었습니다. 학생 화면에 바로 반영돼요.';
        setTimeout(function(){ document.getElementById('rq-form-msg').textContent=''; }, 4000);
        rqCancelEdit(); rqLoad();
      } else alert('저장 실패: ' + (r && r.error || 'unknown'));
    } catch(e) { alert('오류: ' + e.message); }
    btn.disabled = false; btn.textContent = '💾 퀴즈 저장';
  };
  window.rqCancelEdit = function(){
    rqEditing = 0;
    document.getElementById('rq-title').value = '';
    document.getElementById('rq-desc').value = '';
    document.getElementById('rq-textbook').value = '';
    document.getElementById('rq-level').value = '';
    document.getElementById('rq-lesson').value = '';
    document.getElementById('rq-ai-msg').textContent = '';
    document.getElementById('rq-qlist').innerHTML = '';
    rqAddQ({type:'choice'});
    document.getElementById('rq-form-title').textContent = '➕ 새 퀴즈 만들기';
    document.getElementById('rq-cancel-edit').style.display = 'none';
  };
  window.rqEdit = function(id){
    var q = null;
    for (var i=0; i<rqCache.length; i++) if (rqCache[i].id === id) q = rqCache[i];
    if (!q) return;
    rqEditing = id;
    document.getElementById('rq-title').value = q.title || '';
    document.getElementById('rq-desc').value = q.description || '';
    document.getElementById('rq-textbook').value = q.textbook || '';
    document.getElementById('rq-level').value = q.level || '';
    document.getElementById('rq-lesson').value = (q.lesson_no!=null && q.lesson_no>0) ? q.lesson_no : '';
    var list = document.getElementById('rq-qlist'); list.innerHTML = '';
    (q.questions || []).forEach(function(qq){ rqAddQ(qq); });
    document.getElementById('rq-form-title').textContent = '✏️ 퀴즈 수정 — #' + id;
    document.getElementById('rq-cancel-edit').style.display = '';
    document.getElementById('card-review-quiz').scrollIntoView({behavior:'smooth'});
  };
  window.rqToggle = async function(id, active){
    try { await fetch('/api/admin/review-quiz/toggle', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:id, active:active?1:0 }) }); rqLoad(); }
    catch(e) { alert('오류: ' + e.message); }
  };
  function rqFind(id){ for (var i=0; i<rqCache.length; i++) if (rqCache[i].id === id) return rqCache[i]; return null; }
  window.rqDel = async function(id){
    var q = rqFind(id);
    if (!confirm('퀴즈를 삭제할까요? 학생 응시 기록도 함께 삭제됩니다. — ' + (q ? q.title : '#' + id))) return;
    try { await fetch('/api/admin/review-quiz/' + id, { method:'DELETE', credentials:'include' }); if (rqEditing === id) rqCancelEdit(); rqLoad(); }
    catch(e) { alert('오류: ' + e.message); }
  };
  window.rqResults = async function(id){
    var q0 = rqFind(id);
    var wrap = document.getElementById('rq-results-wrap');
    var box = document.getElementById('rq-results');
    document.getElementById('rq-results-title').textContent = q0 ? q0.title : ('#' + id);
    wrap.style.display = ''; box.innerHTML = '⏳ 불러오는 중…';
    try {
      var r = await fetch('/api/admin/review-quiz/results?quiz_id=' + id, { credentials:'include' }).then(function(x){ return x.json(); });
      var rows = (r && r.results) || [];
      if (!rows.length) { box.innerHTML = '<div style="font-size:12.5px;color:#6b7280;padding:8px 0">아직 응시한 학생이 없어요.</div>'; return; }
      box.innerHTML = '<table><thead><tr><th>학생</th><th>점수</th><th>백분율</th><th>응시 일시</th></tr></thead><tbody>' +
        rows.map(function(x){
          var pct = x.total ? Math.round(x.score / x.total * 100) : 0;
          var d = new Date(x.created_at);
          var when = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
          return '<tr><td>' + rqEsc(x.user_name || x.user_id) + '</td><td><b>' + x.score + ' / ' + x.total + '</b></td><td>' + pct + '점</td><td>' + when + '</td></tr>';
        }).join('') + '</tbody></table>';
    } catch(e) { box.innerHTML = '<div style="color:#b91c1c;font-size:12.5px">불러오기 실패: ' + rqEsc(e.message) + '</div>'; }
  };
  // 👁 교재(퀴즈) 제목 클릭 → 문항 펼침 + 자동 정검(오류 검출)
  window.rqPreview = function(id){
    var row = document.getElementById('rqprev-row-'+id);
    var box = document.getElementById('rqprev-'+id);
    if(!row || !box) return;
    if(row.style.display !== 'none'){ row.style.display='none'; return; }
    var q = (typeof rqFind==='function') ? rqFind(id) : (rqCache||[]).filter(function(x){return x.id===id;})[0];
    if(!q){ box.innerHTML='<div style="color:#b91c1c;padding:8px">데이터를 찾을 수 없어요. 새로고침 후 다시 시도하세요.</div>'; row.style.display=''; return; }
    box.innerHTML = rqRenderPreview(q);
    row.style.display='';
  };
  function rqRenderPreview(q){
    var TL={choice:'📝 객관식',listen:'🎧 듣기',write:'✍️ 쓰기',speak:'🎤 말하기'};
    var qs=q.questions||[]; var errs=0; var out=[];
    var norm=function(v){return String(v==null?'':v).trim().toLowerCase();};
    qs.forEach(function(x,i){
      var t=(x&&x.type)||'choice'; var warn=[]; var body='';
      if(t==='choice'||t==='listen'){
        var opts=x.opts||[]; var ans=Number(x.answer);
        if(opts.length<2) warn.push('보기 부족('+opts.length+'개)');
        if(!(typeof ans==='number' && ans%1===0 && ans>=0 && ans<opts.length)) warn.push('정답 번호 범위 밖('+x.answer+')');
        var seen={}; opts.forEach(function(o){var k=norm(o); if(k){ if(seen[k]) warn.push('보기 중복: '+o); seen[k]=1; }});
        if(t==='listen'){
          if(!norm(x.audio_text)) warn.push('듣기 음성텍스트 없음');
          else if(opts[ans]!=null && norm(x.audio_text)!==norm(opts[ans])) warn.push('음성텍스트 ≠ 정답보기');
        }
        body = (t==='listen'?('<div style="margin:2px 0 5px;font-size:11.5px;color:#475569">🔊 음성: <b>'+rqEsc(x.audio_text||'(없음)')+'</b></div>'):'')
          + opts.map(function(o,k){ var ok=(k===ans); return '<div style="padding:2px 7px;border-radius:5px;'+(ok?'background:#dcfce7;color:#15803d;font-weight:700':'')+'">'+String.fromCharCode(65+k)+'. '+rqEsc(o)+(ok?' ✅':'')+'</div>'; }).join('');
      } else if(t==='write'){
        if(!norm(x.answer_text)) warn.push('정답 문장 없음');
        body='<div style="font-size:12.5px">정답: <b style="color:#15803d">'+rqEsc(x.answer_text||'(없음)')+'</b>'+((x.accept&&x.accept.length)?(' <span style="color:#64748b">| 허용답: '+rqEsc(x.accept.join(', '))+'</span>'):'')+'</div>';
      } else {
        if(!norm(x.answer_text)) warn.push('읽을 문장 없음');
        body='<div style="font-size:12.5px">읽기 문장: <b>'+rqEsc(x.answer_text||'(없음)')+'</b></div>';
      }
      if(!norm(x.q) && t!=='speak') warn.push('문제 지문 없음');
      errs+=warn.length;
      var warnHtml = warn.length?('<div style="margin-top:5px;font-size:11.5px;color:#b91c1c;font-weight:700">⚠️ '+warn.map(rqEsc).join(' / ')+'</div>'):'';
      out.push('<div style="border:1px solid '+(warn.length?'#fecaca':'rgba(148,163,184,0.3)')+';border-radius:8px;padding:8px 11px;margin:7px 0;background:'+(warn.length?'#fef2f2':'#fff')+'">'
        +'<div style="font-size:11.5px;color:#475569;font-weight:700">Q'+(i+1)+' · '+(TL[t]||t)+'</div>'
        +'<div style="font-size:13px;margin:3px 0 5px;color:#0f172a">'+rqEsc(x.q||'(지문 없음)')+'</div>'
        +body
        +(x.explain?('<div style="font-size:11.5px;color:#64748b;margin-top:5px">💬 해설: '+rqEsc(x.explain)+'</div>'):'')
        +warnHtml+'</div>');
    });
    var head = errs ? ('⚠️ 오류 의심 '+errs+'건 — 아래 빨간 칸을 확인하세요') : '✅ 발견된 오류 없음';
    var summary='<div style="font-size:13px;font-weight:800;margin:6px 0 8px;color:'+(errs?'#b91c1c':'#15803d')+'">'+head+' · 총 '+qs.length+'문항</div>';
    return '<div style="padding:6px 2px 10px">'+summary+(out.join('')||'<div style="color:#6b7280">문항이 없습니다.</div>')+'</div>';
  }

  // 🔎 검색: 교재명·레벨·레슨·제목(+설명) 부분일치 필터
  function rqMatch(q, kw){
    if (!kw) return true;
    var hay = [ q.title, q.description, q.textbook, q.level,
                (q.lesson_no!=null ? ('L'+q.lesson_no+' '+q.lesson_no+'강 lesson'+q.lesson_no) : ''),
                (q.source==='ai' ? 'AI 자동출제' : '') ].join(' ').toLowerCase();
    return kw.split(/\s+/).every(function(tok){ return !tok || hay.indexOf(tok) !== -1; });
  }
  window.rqFilter = function(){
    var inp = document.getElementById('rq-search');
    var clr = document.getElementById('rq-search-clear');
    if (clr) clr.style.display = (inp && inp.value) ? 'block' : 'none';
    rqRender();
  };
  window.rqClearSearch = function(){
    var inp = document.getElementById('rq-search'); if (inp) inp.value='';
    rqFilter(); if (inp) inp.focus();
  };
  function rqRender(){
    var box = document.getElementById('rq-list');
    if (!box) return;
    var cntEl = document.getElementById('rq-search-count');
    if (!rqCache.length) {
      box.innerHTML = '<div style="padding:8px 0">아직 만든 퀴즈가 없어요. 위에서 첫 퀴즈를 만들어보세요!</div>';
      if (cntEl) cntEl.textContent = ''; return;
    }
    var inp = document.getElementById('rq-search');
    var kw = (inp ? inp.value : '').trim().toLowerCase();
    var list = kw ? rqCache.filter(function(q){ return rqMatch(q, kw); }) : rqCache;
    if (cntEl) cntEl.textContent = kw ? (list.length + ' / ' + rqCache.length + '개') : (rqCache.length + '개');
    if (!list.length) {
      box.innerHTML = '<div style="padding:10px 0;color:#6b7280">🔎 “' + rqEsc(inp.value) + '” 검색 결과가 없습니다.</div>';
      return;
    }
    box.innerHTML = '<table><thead><tr><th>제목</th><th>문항 구성</th><th>응시</th><th>상태</th><th>관리</th></tr></thead><tbody>' +
        list.map(function(q){
          var qs = q.questions||[];
          var cnt = { choice:0, listen:0, write:0, speak:0 };
          qs.forEach(function(x){ var t=(x&&x.type)||'choice'; if(cnt[t]!=null) cnt[t]++; });
          var comp = [];
          if (cnt.choice) comp.push('📝'+cnt.choice); if (cnt.listen) comp.push('🎧'+cnt.listen);
          if (cnt.write) comp.push('✍️'+cnt.write); if (cnt.speak) comp.push('🎤'+cnt.speak);
          var srcB = q.source==='ai' ? ' <span style="font-size:10px;background:#ede9fe;color:#6d28d9;padding:1px 6px;border-radius:99px;font-weight:800">AI</span>' : '';
          var metaTags = [];
          if (q.textbook) metaTags.push('📚'+rqEsc(q.textbook)); if (q.level) metaTags.push('📊'+rqEsc(q.level)); if (q.lesson_no) metaTags.push('L'+q.lesson_no);
          var metaLine = metaTags.length ? '<div style="font-size:10.5px;color:#4338ca;margin-top:2px">'+metaTags.join(' · ')+'</div>' : '';
          return '<tr><td><b style="cursor:pointer;color:#1d4ed8" onclick="rqPreview(' + q.id + ')" title="클릭하면 문제 미리보기/정검">📋 ' + rqEsc(q.title) + '</b>' + srcB + (q.description ? '<div style="font-size:11px;color:#6b7280">' + rqEsc(q.description) + '</div>' : '') + metaLine + '</td>' +
            '<td style="cursor:pointer" onclick="rqPreview(' + q.id + ')">' + (comp.length?comp.join(' '):qs.length) + '</td>' +
            '<td>' + (q.attempt_count||0) + '회</td>' +
            '<td><button class="rq-pill ' + (q.active?'on':'off') + '" onclick="rqToggle(' + q.id + ',' + (q.active?0:1) + ')">' + (q.active?'활성':'숨김') + '</button></td>' +
            '<td><button class="rq-mini" style="background:#eef2ff;color:#3730a3;font-weight:700" onclick="rqPreview(' + q.id + ')">👁 문제보기</button>' +
            '<button class="rq-mini" onclick="rqEdit(' + q.id + ')">✏️ 수정</button>' +
            '<button class="rq-mini" onclick="rqResults(' + q.id + ')">🏆 결과</button>' +
            '<button class="rq-mini" style="color:#b91c1c" onclick="rqDel(' + q.id + ')">🗑</button></td></tr>' +
            '<tr id="rqprev-row-' + q.id + '" style="display:none"><td colspan="5" style="background:rgba(2,6,23,0.04);padding:4px 12px"><div id="rqprev-' + q.id + '"></div></td></tr>';
        }).join('') + '</tbody></table>';
  }
  window.rqRender = rqRender;

  window.rqLoad = async function(){
    var box = document.getElementById('rq-list');
    try {
      var r = await fetch('/api/admin/review-quiz/list', { credentials:'include' }).then(function(x){ return x.json(); });
      rqCache = (r && r.quizzes) || [];
      rqRender();
    } catch(e) { if (box) box.innerHTML = '<div style="color:#b91c1c">목록 불러오기 실패: ' + rqEsc(e.message) + '</div>'; }
  };
  var card = document.getElementById('card-review-quiz');
  if (card) { card.addEventListener('toggle', function(){ if (card.open && !card._rqInit) { card._rqInit = true; rqAddQ({type:'choice'}); rqLoad(); } }); }
})();
