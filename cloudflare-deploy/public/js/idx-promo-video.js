// idx-promo-video.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

/* 홍보 영상 정책 (2026-06-12)
   ① 인트로 영상이 떠 있는 동안엔 절대 표시 안 함 — 인트로가 사라진 뒤에만 표시
   ② 표시된 뒤 화면 아무 곳이나 클릭(모달·카드·메뉴 열기 포함)하면 즉시 제거
   ③ 한 번 사라지면 같은 세션에서는 다시 표시 안 함 (홈 첫 화면 전용) */
(function(){
  var v=document.getElementById('mango-promo-vid'), mb=document.getElementById('mango-promo-mute'),
      cb=document.getElementById('mango-promo-close'), box=document.getElementById('mango-promo-video');
  if(!box) return;
  var KEY='mango_promo_dismissed';

  // ═══════════════════════════════════════════════════════════════════
  // 🔇 (2026-06-15) 사용자 요청 — 상담직원 홍보영상 음성 "영구" 차단
  //   ① 영상은 항상 무음 유지: 어떤 코드가 unmute 해도 즉시 다시 무음 처리
  //   ② 화면 아무 곳이나 한 번이라도 클릭/터치/키입력 → 영구 숨김(localStorage 기억)
  //   ③ 한 번 끈 적 있으면 다음 방문에도 아예 표시 안 함(다시는 소리 안 남)
  // ═══════════════════════════════════════════════════════════════════
  var HARD_KEY = 'mango_promo_voice_off';
  function forceMute(){ try{ v.muted = true; v.volume = 0; }catch(_){ } }
  forceMute();
  try{
    v.addEventListener('volumechange', forceMute);
    v.addEventListener('play', forceMute);
    v.addEventListener('playing', forceMute);
    v.addEventListener('loadeddata', forceMute);
  }catch(_){}
  // 이전에 영구 차단한 적 있으면 아예 표시조차 안 함
  try{ if(localStorage.getItem(HARD_KEY)==='1'){ if(box.parentNode) box.parentNode.removeChild(box); return; } }catch(_){}
  var _killedForever = false;
  function killForever(){
    if(_killedForever) return; _killedForever = true;
    try{ localStorage.setItem(HARD_KEY,'1'); }catch(_){}
    try{ v.muted = true; v.volume = 0; v.pause(); }catch(_){}
    try{ if(box.parentNode) box.parentNode.removeChild(box); }catch(_){}
    document.removeEventListener('pointerdown', killForever, true);
    document.removeEventListener('touchstart', killForever, true);
    document.removeEventListener('click', killForever, true);
    document.removeEventListener('keydown', killForever, true);
  }
  // 가장 먼저 등록 → 첫 사용자 동작에서 즉시 차단(다른 핸들러보다 우선)
  document.addEventListener('pointerdown', killForever, true);
  document.addEventListener('touchstart', killForever, true);
  document.addEventListener('click', killForever, true);
  document.addEventListener('keydown', killForever, true);
  var fading=false, phase='intro', greetingArmed=false, disarmGreeting=null;
  function detachListeners(){
    if(disarmGreeting){ try{ disarmGreeting(); }catch(e){} }
    document.removeEventListener('click', onAnyClick, true);
    window.removeEventListener('hashchange', fadeOut);
    window.removeEventListener('popstate', fadeOut);
    window.removeEventListener('message', onMsg);
    var hi=document.getElementById('ai-home-input');
    if(hi){ hi.removeEventListener('focus', fadeOut); hi.removeEventListener('input', fadeOut); }
  }
  function killBox(){                          // 최종 제거(페이드 후)
    try{ sessionStorage.setItem(KEY,'1'); }catch(e){}
    try{ v&&v.pause(); }catch(e){}
    detachListeners();
    if(box&&box.parentNode) box.parentNode.removeChild(box);
  }
  function fadeOut(){                          // 부드럽게 사라짐(타이핑/클릭/이동/자동)
    if(fading) return; fading=true;
    if(disarmGreeting){ try{ disarmGreeting(); }catch(e){} }
    box.classList.remove('promo-in');
    box.style.opacity='0'; box.style.transform='translateY(-8px)';
    try{ if(v){ v.muted=true; v.pause(); } }catch(e){}   // 즉시 음소거(재생 중이던 음성도 차단)
    setTimeout(killBox, 450);                  // .4s 트랜지션 후 DOM 제거
  }
  try{ if(sessionStorage.getItem(KEY)==='1'){ if(box.parentNode)box.parentNode.removeChild(box); return; } }catch(e){}
  function onAnyClick(e){
    if(mb && (e.target===mb || mb.contains(e.target))) return; // 🔇 음소거 토글만 예외
    if(phase==='intro' || phase==='greeting') return;          // 인트로/인사 재생 중엔 클릭으로 안 닫음
    fadeOut();
  }
  function onMsg(e){                           // iframe(아바타)/패널 열림 → 질문 의도 → 페이드아웃
    var d=e.data;
    if(d && typeof d==='object' && (d.type==='mangoi-typing' || d.type==='mangoi-open')) fadeOut();
  }
  function upd(){ if(mb) mb.textContent = v.muted ? '🔇' : '🔊'; }
  if(mb) mb.onclick=function(e){ e.stopPropagation(); v.muted=!v.muted; if(!v.muted){ var p=v.play(); if(p&&p.catch)p.catch(function(){}); } upd(); };
  if(cb) cb.onclick=function(e){ e.stopPropagation(); fadeOut(); };
  upd();
  // 🔒 AI 상담사(#mangoi-widget)를 누르는 순간 — 단계/대기상태와 무관하게 —
  //    홍보영상 음성을 즉시 차단(음소거+정지)하고 숨김. (가장 먼저 등록해 경쟁 방지)
  function killOnCounselor(e){
    try{
      var t=e&&e.target;
      if(t&&t.closest&&t.closest('#mangoi-widget')){
        if(v){ try{ v.muted=true; }catch(_){} try{ v.pause(); }catch(_){} }
        fadeOut();
      }
    }catch(_){}
  }
  document.addEventListener('pointerdown', killOnCounselor, true);
  document.addEventListener('touchstart', killOnCounselor, true);
  document.addEventListener('click', killOnCounselor, true);
  var shown=false;
  // 인트로(무음) 끝 → 인사를 '소리'로 1회 재생. 자동재생 차단되면 첫 제스처에서 재생.
  function playGreeting(){
    try{
      v.muted=true; v.volume=0; upd();       // 🔇 (2026-06-15) 인사 음성도 무음 — 소리 절대 재생 안 함
      v.currentTime=0;
      var p=v.play();
      if(p&&p.then){ p.then(function(){ greetingArmed=false; }).catch(function(){ armGreeting(); }); }
    }catch(e){ armGreeting(); }
  }
  function armGreeting(){                    // unmute 재생 차단 → 사용자 제스처 대기(모바일 주 경로)
    if(greetingArmed) return; greetingArmed=true;
    function disarm(){
      greetingArmed=false; disarmGreeting=null;
      document.removeEventListener('pointerdown',onArm,true);
      document.removeEventListener('keydown',onArm,true);
      document.removeEventListener('touchstart',onArm,true);
      window.removeEventListener('scroll',onArm,true);
    }
    function onArm(e){ disarm();
      // 첫 동작이 'AI 상담사' 위젯이면 인사 음성 없이 즉시 숨김(목소리 안 새어나오게)
      try{ var tg=e&&e.target; if(tg&&tg.closest&&tg.closest('#mangoi-widget')){ fadeOut(); return; } }catch(_){}
      playGreeting();
    }
    disarmGreeting=disarm;
    document.addEventListener('pointerdown',onArm,true);
    document.addEventListener('keydown',onArm,true);
    document.addEventListener('touchstart',onArm,true);
    window.addEventListener('scroll',onArm,true);
  }
  function onVidEnded(){
    if(phase==='intro'){ phase='greeting'; playGreeting(); return; }  // 무음 인트로 끝 → 소리 인사
    if(phase==='greeting'){ phase='done'; }                          // 소리 인사 끝 → 표시 유지(자동 숨김 없음)
  }
  function showBox(){
    if(shown) return;
    // 🇵🇭 (2026-07-23) 느린 회선에서는 홍보영상을 아예 띄우지 않는다.
    //   교사 다수가 필리핀 민다나오 CDO 콜센터의 '공유 회선' 을 함께 쓴다. 한 명이 1.3MB 를
    //   받는 동안 같은 회선에서 진행 중인 다른 교사의 화상수업이 밀린다 = 튕김 원인.
    //   수업은 필수, 홍보영상은 장식이므로 회선이 좁으면 장식을 버린다.
    if (window.mgIsSlowNet && window.mgIsSlowNet()) {
      try{ if(box.parentNode) box.parentNode.removeChild(box); }catch(_){}
      return;
    }
    shown=true;
    // 🐢 표시가 확정된 지금에서야 src 를 붙인다 (HTML 에 박아두면 숨겨진 채로도 받는다)
    try{
      if(v && !v.getAttribute('src')){
        var _psrc = v.getAttribute('data-src');
        if(_psrc){ v.setAttribute('src', _psrc); v.load(); }
      }
    }catch(_){}
    box.style.display='block';
    box.style.cursor='pointer';
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ box.classList.add('promo-in'); }); }); // fade in
    if(v){
      try{ v.loop=false; }catch(e){}                       // 끝나면 ended 발생하도록 loop 해제
      var p=v.play(); if(p&&p.catch)p.catch(function(){});
      v.addEventListener('ended', onVidEnded);
      v.addEventListener('error', function(){ if(phase==='intro') fadeOut(); });
      // 안전장치: 인트로가 안 끝나면(스톨) duration 기반으로 다음 단계 강제
      var setSafety=function(){
        var ms=(v.duration && isFinite(v.duration)) ? (v.duration*1000+6000) : 15000;
        setTimeout(function(){ if(phase==='intro') onVidEnded(); }, ms);
      };
      if(v.readyState>=1 && v.duration) setSafety();
      else v.addEventListener('loadedmetadata', setSafety, {once:true});
    }
    setTimeout(function(){
      document.addEventListener('click', onAnyClick, true);  // 클릭(인트로/인사 중 제외) → 페이드아웃
      window.addEventListener('hashchange', fadeOut);         // 페이지/메뉴 전환
      window.addEventListener('popstate', fadeOut);
      window.addEventListener('message', onMsg);             // 아바타 타이핑/패널 열림
      var hi=document.getElementById('ai-home-input');       // 홈 AI 질문 입력 → 페이드아웃
      if(hi){ hi.addEventListener('focus', fadeOut); hi.addEventListener('input', fadeOut); }
    },0);
  }
  function introGone(){
    var ov=document.getElementById('mango-intro-overlay');
    if(!ov || !document.body.contains(ov)) return true;
    if(ov.hidden || ov.style.display==='none') return true;
    if(ov.classList.contains('is-hiding')) return true;
    return false;
  }
  function waitIntro(){
    if(introGone()){ showBox(); return; }
    var iv=setInterval(function(){ if(introGone()){ clearInterval(iv); showBox(); } },250);
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', waitIntro); }
  else { waitIntro(); }
})();

