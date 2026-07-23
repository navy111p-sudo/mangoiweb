// ═══════════════════════════════════════════════════════════════
// adm-s17.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  var SRC='https://mangoi-ai-avatar-cf.navy111p.workers.dev';   // 루트(/)=관리자 'AI 운영 비서'(ops). 학생용은 /student.html(고객 상담사)로 분리됨.
  var back=document.getElementById('mi-ops-av-back'),
      wrap=document.getElementById('mi-ops-av'),
      frame=document.getElementById('mi-ops-av-frame'),
      xbtn=document.getElementById('mi-ops-av-close');
  function sendLang(){ try{ var lg=(window.adminLang==='en')?'en':'ko'; frame.contentWindow.postMessage({type:'mangoi-lang', lang:lg}, '*'); }catch(e){} }
  function greetPing(){ try{ frame.contentWindow && frame.contentWindow.postMessage({type:'mangoi-greet'}, '*'); }catch(e){} }  // 아바타가 인사말 먼저 음성으로
  function openAv(){
    var fresh=false;
    try{ if(!frame.getAttribute('src')){
          var dev=(window.matchMedia && window.matchMedia('(min-width:481px)').matches) ? 'pc' : 'mobile';  // PC면 얼굴 30% 확대
          frame.setAttribute('src', SRC + '/?dev=' + dev); fresh=true;
          frame.addEventListener('load', function(){ sendLang(); setTimeout(greetPing, 150); }); } }catch(e){}
    wrap.style.display='block'; back.style.display='block';
    if(!fresh){ sendLang(); greetPing(); }                              // 이미 로드됨(재오픈) → 즉시 인사
    else { setTimeout(function(){ sendLang(); greetPing(); }, 900); }   // 최초 로드 보강(load 이벤트 누락 대비)
  }
  function closeAv(){
    wrap.style.display='none'; back.style.display='none';
    try{ frame.contentWindow && frame.contentWindow.postMessage('mangoi-stop','*'); }catch(e){}   // 닫으면 음성 정지
  }
  if(xbtn) xbtn.onclick=closeAv;
  if(back) back.onclick=closeAv;
  // 범용 메뉴 라우터 — 대상 id(카드/손자)와 그 모든 상위 <details> 를 펼치고 스크롤
  function miOpsNavigate(targetId){
    var el=document.getElementById(targetId);
    if(!el) return false;
    // 📢 공지 스튜디오: 게시/만들기 패널 대상이면 해당 탭 전환
    try{ if((targetId==='card-popups-mgmt'||targetId==='card-poster-maker') && typeof window.noticeStudioTab==='function') window.noticeStudioTab(targetId==='card-popups-mgmt'?'publish':'make'); }catch(e){}
    var node=el;
    while(node){ if(node.tagName==='DETAILS'){ node.open=true; } node=node.parentElement; }
    setTimeout(function(){
      try{
        el.scrollIntoView({behavior:'smooth',block:'start'});
        // ✅ 정확히 열렸음을 보이도록 잠깐 강조(사이드바 ph85-sub 와 동일한 노란 테두리 플래시)
        var o=el.style.boxShadow;
        el.style.boxShadow='0 0 0 3px rgba(251,191,36,0.6)';
        setTimeout(function(){ el.style.boxShadow=o; }, 1800);
      }catch(e){}
    }, 120);
    return true;
  }
  // ══════════════ 🎓 AI 운영비서 자동 수강등록 (2026-07-23) ══════════════
  //  비서 iframe 은 관리자 세션이 없어 DB 를 못 만진다. 그래서 확인까지만 iframe 이 하고,
  //  실제 등록은 이 부모 창이 관리자 세션(credentials:'include')으로 /api/admin/ai-action 을 호출한다.
  //  ⚠️ 반드시 아바타 워커 출처에서 온 메시지만 처리한다(임의 사이트가 iframe 을 심어도 등록 못 하게).
  function miOpsEnroll(frameWin, payload){
    var reply=function(res){
      var m={type:'mangoi-enroll-result'};
      for(var k in (res||{})){ if(Object.prototype.hasOwnProperty.call(res,k)) m[k]=res[k]; }
      try{ frameWin.postMessage(m, SRC); }catch(e){}
    };
    var p=payload||{};
    var args={
      student:{
        login_id: String((p.student&&p.student.login_id)||''),
        password: String((p.student&&p.student.password)||''),
        name:     String((p.student&&p.student.name)||'')
      },
      teacher_name: String(p.teacher_name||''),
      days: Array.isArray(p.days)?p.days:[],
      time: String(p.time||''),
      duration_min: Number(p.duration_min)||20,
      class_type: String(p.class_type||'regular')
    };
    fetch('/api/admin/ai-action', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name:'enroll_student', args:args })
    })
    .then(function(r){ return r.json().catch(function(){ return {ok:false, error:'bad_response_'+r.status}; }); })
    .then(function(j){
      reply(j||{ok:false,error:'empty_response'});
      // 성공 시 화면 갱신 — POST 가 나갔으므로 adm-perf 클라이언트 캐시는 이미 비워졌다.
      if(j && j.ok){ try{ if(window.MangoClassTime && window.MangoClassTime.reload) window.MangoClassTime.reload(); }catch(e){} }
    })
    .catch(function(e){ reply({ok:false, error:'network_error', message:'네트워크 오류로 등록하지 못했습니다: '+e, message_en:'Network error — the enrollment was not saved: '+e}); });
  }

  // 아바타(iframe) → 부모: 닫기 신호 처리(학생용과 동일)
  window.addEventListener('message', function(ev){
    var d=ev&&ev.data;
    if(d && d.type==='mangoi-enroll'){
      if(ev.origin!==SRC) return;                                      // 아바타 워커 출처만 허용
      if(!frame || ev.source!==frame.contentWindow) return;            // 우리 iframe 이 보낸 것만
      miOpsEnroll(ev.source, d.payload);
      return;
    }
    if(d==='mangoi-avatar-close'){ closeAv(); return; }
    if(!(d && d.type==='mangoi-open' && d.go)) return;
    // '포인트' 질문 → 「🎁 포인트 & 기프티콘 → 💰 학생 포인트 잔액」 열고, 언급된 학생을 검색
    if(d.go==='points' || d.go==='sub-points-balances'){
      closeAv();
      try{
        if(window.hubJump){ hubJump('acc', ['card-accounting-mgmt','card-points-mgmt']); }
        var card=document.getElementById('card-points-mgmt');
        if(card && card.tagName==='DETAILS') card.open=true;
        var sub=document.getElementById('sub-points-balances');
        if(sub && sub.tagName==='DETAILS') sub.open=true;
        if(card) card.scrollIntoView({behavior:'smooth',block:'start'});
        var qmsg=(d.q||'').toString();
        Promise.resolve(window.ptLoadBalances ? window.ptLoadBalances() : null).then(function(){
          var name = window.ptGuessStudentFromText ? window.ptGuessStudentFromText(qmsg) : '';
          if(name){
            var s=document.getElementById('pt-search');
            if(s) s.value=name;
            if(window.ptFilterBalances) window.ptFilterBalances(name);
            setTimeout(function(){ if(sub) sub.scrollIntoView({behavior:'smooth',block:'start'}); }, 250);
          }
        }).catch(function(){});
      }catch(e){}
      return;
    }
    // 환불규정 → 관리자에는 해당 카드가 없어 공개 환불규정 페이지를 새 탭으로 연다
    if(d.go==='refund'){ closeAv(); try{ window.open('/refund.html','_blank'); }catch(e){} return; }
    // 회계 alias → 카드 id 로 변환
    var tid = (d.go==='accounting') ? 'card-accounting-mgmt' : d.go;
    // 그 외 모든 메뉴: 대상 id 로 펼치고 이동(손자 메뉴면 상위 카드까지 자동 펼침)
    closeAv();
    try{ miOpsNavigate(tid); }catch(e){}
    return;
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && wrap.style.display==='block') closeAv(); });
  // 🔁 AI 운영비서 = 아바타 Worker iframe 사용(입력창·전송 화살표·🎤마이크·음성·인사영상 모두 동작, 음성='재선').
  //    FAB/메뉴가 호출하는 miAsstOpen 을 이 iframe 오픈으로 교체(입력창 없는 옛 커스텀 패널 대체). (2026-06-16)
  window.miOpsAvatarOpen=openAv;
  // ✅ FAB/메뉴의 miAsstOpen = 새 아바타 iframe(성우 '재선' 녹음 음성 + 검색/입력창 + 🎤마이크 + 인사영상 + 메뉴 라우팅). 옛 커스텀 슬라이드 패널(#mi-asst-panel, 기계음·입력창 없음)을 대체. (2026-06-17 복구)
  window.miAsstOpen=openAv;
})();
