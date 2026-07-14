// ═══════════════════════════════════════════════════════════════
// idx-x1.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  // ── 음소거 선호도만 저장 ('0' = 명시적 mute). 'mango_intro_shown' 은 저장하지 않음.
  var KEY = 'mango_intro_shown';            // 호환용 (제거 시도)
  var UNMUTED_KEY = 'mango_intro_unmuted';

  // 콘솔 헬퍼
  try {
    window.resetIntro = function(){
      try { localStorage.removeItem(KEY); localStorage.removeItem(UNMUTED_KEY); } catch(e){}
      location.reload();
    };
  } catch(e){}

  // URL ?intro=1 / ?reset=1 정리만 (어차피 매번 표시되므로 logic은 단순)
  try {
    var sp = new URLSearchParams(location.search);
    if (sp.has('intro') || sp.has('reset')) {
      try { localStorage.removeItem(KEY); } catch(e){}
      sp.delete('intro'); sp.delete('reset');
      var rest = sp.toString();
      var clean = location.pathname + (rest ? '?' + rest : '') + location.hash;
      try { history.replaceState(null, '', clean); } catch(e){}
    }
  } catch(e){}

  var overlay = document.getElementById('mango-intro-overlay');
  if(!overlay) { console.warn('[mango-intro] overlay element not found'); return; }

  // 🎬 새 정책: 처음 진입할 때만 인트로 영상 표시
  //   - localStorage 'mango_intro_shown' = '1' 이면 skip (영구 한 번만)
  //   - sessionStorage 'mango_intro_shown_session' = '1' 이면 skip (이 세션에서 이미 봤음)
  //   - URL ?intro=1 또는 ?reset=1 으로 강제 재생 가능
  var forceShow = false;
  try {
    var sp2 = new URLSearchParams(location.search);
    forceShow = sp2.has('intro') || sp2.has('reset');
  } catch(e){}
  var alreadySeen = false;
  try {
    if (localStorage.getItem(KEY) === '1') alreadySeen = true;
    if (sessionStorage.getItem('mango_intro_shown_session') === '1') alreadySeen = true;
  } catch(e){}
  // 💳 결제 딥링크(/?pay=1)로 들어온 경우 인트로 없이 바로 결제 모달로
  var payDeepLink = false;
  try { payDeepLink = new URLSearchParams(location.search).has('pay'); } catch(e){}

  if ((alreadySeen || payDeepLink) && !forceShow) {
    // 이미 봤음 — 인트로 skip
    overlay.hidden = true;
    overlay.style.display = 'none';
    console.log('[mango-intro] skipped (already seen)');
    return;
  }

  overlay.hidden = false;
  overlay.style.display = 'flex';   // hidden 속성·인라인 CSS 양쪽 강제
  document.documentElement.style.overflow = 'hidden';
  document.body && (document.body.style.overflow = 'hidden');
  console.log('[mango-intro] overlay shown (first visit)');

  var video = document.getElementById('mango-intro-video');
  var skip  = document.getElementById('mango-intro-skip');
  var mute  = document.getElementById('mango-intro-mute');
  var hint  = document.getElementById('mango-intro-hint');
  // 🆕 EN/KO 자막 시스템 — 음성에 싱크. 영상 음성(1.4배속·끝 20% 트림) 타임라인 기준.
  var ccEl   = document.getElementById('mango-intro-cc');
  var langBtn= document.getElementById('mango-intro-lang');
  // ⏱️ (2026-07-05) 인트로 재편집 — 맨 앞 인사말("안녕하세요…학부모님!") 제거 + 전체 10% 감속.
  //   컷 지점 2.13s('우주에서' 발성 시작). 타이밍 = (기존시간 - 2.13) / 0.90 로 재계산.
  var INTRO_CC = [
    { t0:0.0, t1:2.02, ko:'우주에서 가장 신나는 공부 모험,', en:'The most exciting study adventure in the universe—' },
    { t0:2.02, t1:4.92, ko:'망고아이에 오신 것을 진심으로 환영합니다!', en:'a heartfelt welcome to MangoI!' },
    { t0:4.92, t1:7.26, ko:'망고아이에서는 매일매일이 즐겁습니다.', en:'At MangoI, every single day is fun.' },
    { t0:7.26, t1:10.31, ko:'똑똑한 AI 친구와 함께 재미있는 게임을 즐기고,', en:'Enjoy fun games with your smart AI friend,' },
    { t0:10.31, t1:14.96, ko:'팡팡 터지는 퀴즈를 풀다 보면 우리 아이 실력이 마법처럼 쑥쑥 자라납니다.', en:'and as the quizzes pop, your child\'s skills grow like magic.' },
    { t0:14.96, t1:20.07, ko:'친절한 외국인 선생님과 직접 만나 생생하게 대화하는 화상 수업까지 준비되어 있습니다.', en:'There are even live video lessons to meet friendly foreign teachers and chat face to face.' },
    { t0:20.07, t1:23.07, ko:'이제 모두 함께 망고 우주선에 탑승해 볼까요?', en:'Now, shall we all board the Mango spaceship together?' },
    { t0:23.07, t1:25.67, ko:'지금 바로 화면에 수업 입장 버튼을 꾹 누르시고,', en:'Tap the \'Enter Class\' button on your screen right now,' },
    { t0:25.67, t1:29.42, ko:'설레는 우주 탐험을 시작해 보세요. 자, 출발합니다!', en:'and begin your thrilling space adventure. Ready — let\'s blast off!' }
  ];
  var capLang = 'ko';
  try { var _cl = localStorage.getItem('mango_intro_caplang'); if (_cl==='en'||_cl==='ko') capLang=_cl; } catch(e){}
  function renderCap(){
    if(!ccEl) return;
    var t = video.currentTime || 0, cur = null;
    for(var i=0;i<INTRO_CC.length;i++){ if(t>=INTRO_CC[i].t0 && t<INTRO_CC[i].t1){ cur=INTRO_CC[i]; break; } }
    if(cur){ ccEl.textContent = (capLang==='en'? cur.en : cur.ko); ccEl.classList.add('show'); }
    else { ccEl.classList.remove('show'); }
  }
  function syncLangBtn(){
    if(!langBtn) return;
    langBtn.textContent = (capLang==='en' ? '🌐 KO' : '🌐 EN');   // 누르면 전환될 언어 표시
    langBtn.setAttribute('aria-label', capLang==='en' ? '한국어 자막 보기' : 'Show English subtitles');
  }
  if(langBtn){
    langBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      capLang = (capLang==='en' ? 'ko' : 'en');
      try{ localStorage.setItem('mango_intro_caplang', capLang); }catch(e){}
      syncLangBtn(); renderCap();
    });
  }
  video.addEventListener('timeupdate', renderCap);
  syncLangBtn(); renderCap();
  var dismissed = false;
  var soundLocked = false;   // 🔒 (2026-07-05) 소리 재생이 한 번 확정되면 true — 재생 도중 muted 토글로 인한 미디어 재시작(중간에 껐다 처음부터 다시)을 원천 차단

  // explicitlyMuted: 사용자가 🔇 명시적 음소거 누른 적 있으면 true
  var explicitlyMuted = false;
  try { explicitlyMuted = localStorage.getItem(UNMUTED_KEY) === '0'; } catch(e){}

  // 시작은 항상 muted (autoplay 보장). 아래 then() 에서 explicitlyMuted=false 면 즉시 unmute.
  video.muted = true;

  function syncMuteIcon(){
    if (!mute) return;
    mute.textContent = video.muted ? '🔇' : '🔊';
    mute.setAttribute('aria-pressed', video.muted ? 'true' : 'false');
    mute.setAttribute('aria-label', video.muted ? '소리 켜기' : '소리 끄기');
  }
  // 🔊 음소거 토글 — 재생 중인 영상은 play() 재호출 없이 muted 속성만 바꿔 '재시작' 방지.
  if (mute) {
    mute.addEventListener('click', function(ev){
      ev.stopPropagation();
      if (video.muted) {
        video.muted = false;                 // 재생 위치 그대로 소리만 켬(재시작 X)
        if (video.paused) { var q = video.play(); if (q && q.catch) q.catch(function(){}); }
        try { localStorage.removeItem(UNMUTED_KEY); } catch(e){}
        explicitlyMuted = false; soundLocked = true;
      } else {
        video.muted = true;
        try { localStorage.setItem(UNMUTED_KEY, '0'); } catch(e){}
        explicitlyMuted = true;
      }
      syncMuteIcon();
    });
  }

  function dismiss(){
    if (dismissed) return;
    dismissed = true;
    // 🎬 인트로를 봤다는 플래그 저장 — 영구(localStorage) + 세션(sessionStorage)
    //   다음 방문부터는 인트로 자동 skip
    try { localStorage.setItem(KEY, '1'); } catch(e){}
    try { sessionStorage.setItem('mango_intro_shown_session', '1'); } catch(e){}
    overlay.classList.add('is-hiding');
    document.documentElement.style.overflow = '';
    document.body && (document.body.style.overflow = '');
    setTimeout(function(){ overlay.parentNode && overlay.parentNode.removeChild(overlay); }, 480);
  }

  // 스마트 클릭: 아직 '소리로' 재생된 적 없으면 첫 클릭은 소리 켜고 처음부터 1회(닫지 않음),
  //   이미 소리로 재생 중이면 클릭 = 입장(dismiss).
  overlay.addEventListener('click', function(){
    if (!soundLocked && !explicitlyMuted) {
      playFromStartWithSound();   // 소리 확정 → 재시작은 이 한 번뿐, 이후 잠금
      return;
    }
    dismiss();
  });
  skip.addEventListener('click', function(ev){ ev.stopPropagation(); dismiss(); });
  video.addEventListener('ended', dismiss);

  // 🔧 (2026-06-26 FIX) 안전장치: 영상이 로드/재생에 실패해도 인트로가 검은 화면으로
  //   영구히 남지 않도록 자동으로 닫는다. (정상 동작에는 영향 없음)
  video.addEventListener('error', dismiss);
  var _introSrc = video.querySelector('source');
  if (_introSrc) _introSrc.addEventListener('error', dismiss);
  // 안전장치: 정상 종료는 'ended' 이벤트가 처리. 스톨/로드 실패 대비 영상 길이+3초(기본 45초) 뒤 강제 닫기
  var _introSafety = setTimeout(function(){ if(!dismissed) dismiss(); }, 45000);
  video.addEventListener('loadedmetadata', function(){
    if (isFinite(video.duration) && video.duration > 1) {
      clearTimeout(_introSafety);
      _introSafety = setTimeout(function(){ if(!dismissed) dismiss(); }, Math.ceil(video.duration*1000) + 3000);
    }
  });

  syncMuteIcon();

  // ─────────────────────────────────────────────────────────────
  // 🎬 재생 제어 (2026-07-05 재작성): "한 번, 매끄럽게"
  //   · 음소거 여부를 '재생 시작 전에' 확정 → 재생 도중 muted 토글로 인한
  //     미디어 재시작(중간에 껐다 처음부터 다시)을 원천 차단.
  //   · 1) 소리 켜고 자동재생 시도 → 되면 그대로 한 번에 재생(재시작 없음)
  //     2) 막히면 무음으로 재생 + 첫 사용자 동작에서 '0초부터' 소리로 딱 한 번, 이후 잠금.
  //   (기존: muted 자동재생 → 200ms 뒤 unmute+play() 재호출 = 모바일에서 처음부터 재로드 → '중간에 껐다 다시' 버그)
  // ─────────────────────────────────────────────────────────────
  function playFromStartWithSound(){
    if (soundLocked || dismissed) return;
    // 🛡️ 이미 소리로 재생 중이면(음소거 아님·재생 중·0초 지남) 되감지 않는다 → 음성 반복 방지
    if (!video.muted && !video.paused && video.currentTime > 0.1) { soundLocked = true; return; }
    soundLocked = true;
    try { video.currentTime = 0; } catch(e){}
    video.muted = false;
    try { localStorage.removeItem(UNMUTED_KEY); } catch(e){}
    explicitlyMuted = false;
    syncMuteIcon();
    var pp = video.play();
    if (pp && typeof pp.catch === 'function') {
      pp.catch(function(){ video.muted = true; soundLocked = false; syncMuteIcon(); });
    }
  }
  // 첫 제스처(키보드·스크롤·휠) 대기 → 소리로 재생. (탭/클릭은 위 overlay click 이 처리하므로 중복 없음)
  function armFirstGesture(){
    var evs = ['keydown','wheel','scroll'];
    function on(){ off(); if (!soundLocked && !dismissed) playFromStartWithSound(); }
    function off(){ evs.forEach(function(ev){ window.removeEventListener(ev, on, true); }); }
    evs.forEach(function(ev){ window.addEventListener(ev, on, { passive:true, capture:true }); });
  }

  if (explicitlyMuted) {
    // 사용자가 예전에 명시적 음소거 → 무음으로 한 번만 재생(소리 시도 안 함)
    video.muted = true; syncMuteIcon();
    var pm = video.play();
    if (pm && pm.catch) pm.catch(function(){ hint && (hint.textContent = '▶ 화면을 클릭해 영상 재생'); });
  } else {
    // 소리 켜고 바로 시도 (사이트와 상호작용 후면 대개 허용됨)
    video.muted = false; syncMuteIcon();
    // 🔒 (2026-07-06 FIX) 낙관적 '동기' 잠금 — 소리 자동재생이 되는 경우, .then()이
    //   비동기로 늦게 잠그는 찰나에 사용자가 탭하면 playFromStartWithSound()가 currentTime=0으로
    //   되감아 오프닝("우주에서…")이 소리와 함께 두 번 재생되는 '음성 반복' 버그를 원천 차단.
    //   → 재생 시작과 '동시에' 잠그고, 자동재생이 막힌 경우에만(.catch) 다시 풀어 제스처를 기다린다.
    soundLocked = true;
    var pu = video.play();
    if (pu && typeof pu.then === 'function') {
      pu.then(function(){
        console.log('[mango-intro] sound autoplay OK');   // 소리로 성공 → 잠금 유지(탭=입장)
      }).catch(function(){
        // 막힘 → 잠금 해제하고 무음으로 재생 + 첫 사용자 동작에서 소리로 딱 한 번
        soundLocked = false;
        video.muted = true; syncMuteIcon();
        var pv = video.play(); if (pv && pv.catch) pv.catch(function(){});
        hint && (hint.textContent = '🔊 화면을 누르면 소리와 함께 시작합니다');
        armFirstGesture();
        console.log('[mango-intro] sound blocked — muted play, waiting for gesture');
      });
    } else {
      // play() 가 Promise 를 안 주는 구형 브라우저 — 무음 폴백 + 제스처 대기
      soundLocked = false;
      armFirstGesture();
    }
  }
})();
