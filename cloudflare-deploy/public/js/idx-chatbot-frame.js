// idx-chatbot-frame.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

  (function(){
    var w=document.getElementById("mangoi-widget"),
        t=document.getElementById("mangoi-toggle");
    function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

    // 버튼 위치를 보고 챗봇창이 화면 안쪽으로 열리도록 방향 결정
    function positionPanel(){
      var r=t.getBoundingClientRect();
      // PC(≥481px)에서는 패널이 2배 커지므로(588×1008) CSS 와 동일한 크기로 가장자리 판정 — 안 그러면 확대된 창이 화면 밖으로 열림
      var isPC=window.innerWidth>=481;
      var fw=Math.min(isPC?588:294, window.innerWidth-24);
      var fh=Math.min(isPC?660:504, window.innerHeight-80);
      w.classList.toggle("flip-down", r.top < fh+12);                       // 위 공간 부족 → 아래로
      w.classList.toggle("flip-left", (r.left + fw) > (window.innerWidth-6)); // 오른쪽 부족 → 왼쪽으로
    }
    // 🔴 (2026-07-31) 처음 열 때 한 번만 iframe 을 로드한다.
    //   반환값 true = 이번에 로드를 시작함(아직 contentWindow 가 준비되지 않았으므로
    //   언어·인사 메시지는 load 이후에 보내야 한다).
    function mangoiEnsureFrame(){
      var fr=document.getElementById('mangoi-frame');
      if(!fr) return false;
      var ds=fr.getAttribute('data-src');
      if(!ds) return false;                       // 이미 로드됨(data-src 를 지웠음)
      fr.removeAttribute('data-src');
      fr.src=ds;
      return true;
    }
    function mangoiHandshake(){                   // 언어 동기화 + 인사 (기존 로직 그대로)
      try{ var lg=(window.getLang?window.getLang():'ko'); var fr=document.getElementById('mangoi-frame');
        if(fr&&fr.contentWindow) fr.contentWindow.postMessage({type:'mangoi-lang', lang:lg}, '*'); }catch(e){}
      try{ var frG=document.getElementById('mangoi-frame');
        if(frG&&frG.contentWindow){ frG.contentWindow.postMessage({type:'mangoi-greet'},'*');
          setTimeout(function(){ try{ frG.contentWindow.postMessage({type:'mangoi-greet'},'*'); }catch(e){} }, 400); } }catch(e){}
    }
    function setOpen(open){
      if(open){
        positionPanel();
        try{ window.postMessage({type:"mangoi-typing"},"*"); }catch(e){}   // 열림 → 홍보영상 페이드아웃
        try{ var __pv=document.getElementById('mango-promo-vid'); if(__pv){ __pv.muted=true; __pv.pause(); } }catch(e){}  // 홍보영상 즉시 음소거(안전망)
        // 열 때 현재 사이트 언어 동기화 + 인사. 첫 열림이면 문서가 준비된 뒤에 보낸다.
        var justLoaded=false;
        try{ justLoaded=mangoiEnsureFrame(); }catch(e){}
        if(justLoaded){
          var frL=document.getElementById('mangoi-frame');
          if(frL) frL.addEventListener('load', mangoiHandshake, {once:true});
          setTimeout(mangoiHandshake, 2500);      // 안전망: load 가 안 와도 한 번 시도
        } else {
          mangoiHandshake();
        }
      }
      else { mangoiStopVoice(); mangoiResetWidget(); }   // 닫힐 때 음성 정지 + 위젯 초기화(다음에 깨끗하게 시작)
      w.classList.toggle("open", open);
      t.setAttribute("aria-label", open ? "AI 상담사 닫기" : "AI 상담사 열기");
    }

    // === 끌어서 이동 (4px 넘게 움직이면 드래그, 아니면 클릭=열기/닫기) ===
    var dragging=false, moved=false, sx=0, sy=0, ox=0, oy=0;
    function point(e){ return (e.touches && e.touches[0]) ? e.touches[0] : e; }
    function onDown(e){
      var now = Date.now();
      if (e.type === "touchstart") { window.__mgLastTouch = now; if (e.cancelable) e.preventDefault(); }
      else if (now - (window.__mgLastTouch || 0) < 700) { return; }
      var p=point(e);
      dragging=true; moved=false; sx=p.clientX; sy=p.clientY;
      var r=w.getBoundingClientRect(); ox=r.left; oy=r.top;
      t.classList.add("dragging");
      document.addEventListener("mousemove",onMove);
      document.addEventListener("mouseup",onUp);
      document.addEventListener("touchmove",onMove,{passive:false});
      document.addEventListener("touchend",onUp);
    }
    function onMove(e){
      if(!dragging) return;
      var p=point(e), dx=p.clientX-sx, dy=p.clientY-sy;
      if(!moved && (Math.abs(dx)>4 || Math.abs(dy)>4)){
        moved=true;  // 실제 이동 시작 → top/left 기준으로 전환
        w.style.left=ox+"px"; w.style.top=oy+"px"; w.style.right="auto"; w.style.bottom="auto";
      }
      if(!moved) return;
      if(e.cancelable) e.preventDefault();
      var nx=clamp(ox+dx, 6, window.innerWidth  - t.offsetWidth  - 6);
      var ny=clamp(oy+dy, 6, window.innerHeight - t.offsetHeight - 6);
      w.style.left=nx+"px"; w.style.top=ny+"px";
      if(w.classList.contains("open")) positionPanel();
    }
    function onUp(){
      dragging=false; t.classList.remove("dragging");
      document.removeEventListener("mousemove",onMove);
      document.removeEventListener("mouseup",onUp);
      document.removeEventListener("touchmove",onMove);
      document.removeEventListener("touchend",onUp);
      if(!moved){ setOpen(!w.classList.contains("open")); }
    }
    t.addEventListener("mousedown",onDown);
    t.addEventListener("touchstart",onDown,{passive:false});

    // 🩹 (2026-08-17) 상담사가 "열어드릴게요" 하고도 «아무 일이 없던» 버그의 뿌리.
    //   결제창(#payment-modal z-index:9999)과 정보모달(#info-modal 9998 — 강사소개·FAQ·
    //   커리큘럼·고객센터·공지 등 showModal 전부)은 아래 오버레이들 «밑» 에서 열린다:
    //     #mangoi-allmenu(전체메뉴) 2147483600 / #mg-drawer(사이드바) 100000 /
    //     #ai-friends-ov(AI와 친구하기) 99999 / #about-mangoi-ov(망고아이란?) 99999
    //   그런데 상담사 위젯은 z-index 2147483000 이라 저 오버레이 «위» 에 떠서, 오버레이를
    //   열어 둔 채로 상담사에게 "수업 결제창 열어줘" 를 시킬 수 있다. 그러면 결제창은
    //   실제로 열리지만 불투명한 오버레이(rgba(4,9,20,.96))에 완전히 가려 «안 열린다» 로 보인다.
    //   (2026-08-17 사장님 화면녹화 제보 — 「AI와 친구하기」 안에서 3회 모두 동일 재현)
    //   ⚠️ 그래서 이동 «직전» 에 위층 오버레이를 모두 닫는다. 지금까지 refund/faq/installguide
    //      세 곳만 mgDrawerClose() 로 개별 대응돼 있었는데, 그 땜질을 한곳으로 모은 것이다.
    //      새 목적지를 map 에 추가할 때 이 처리를 또 빠뜨리지 않게 하려는 목적도 있다.
    function mangoiCloseCoveringLayers(){
      // display:none 으로 숨기는 오버레이들 (각자의 닫기 버튼과 같은 동작)
      ["ai-friends-ov","about-mangoi-ov","mg-faq-ov","grid-menu"].forEach(function(id){
        var el=document.getElementById(id);
        if(el) el.style.display="none";
      });
      // 전체메뉴는 DOM 에서 통째로 제거하는 방식 + body 스크롤 잠금을 함께 푼다
      var am=document.getElementById("mangoi-allmenu");
      if(am && am.parentNode){ am.parentNode.removeChild(am); document.body.style.overflow=""; }
      // 좌측 사이드바(+백드롭)
      try{ if(window.mgDrawerClose) window.mgDrawerClose(); }catch(e){}
    }


    /* 🎯 (2026-08-17) 상담사 라우팅을 «직접 호출» 로 바꾼다 — A안.
       [무엇이 문제였나] 지금까지 목적지 대부분이 mgGo(go) 를 거쳤고, mgGo 는 실제 기능을
       부르는 게 아니라 «화면 어딘가의 카드를 찾아 대신 클릭» 한다:
           window.mgGo = go => (querySelector('.ai-quick-btn[data-go=..]')
                             || querySelector('.gm-card[data-go=..]'))?.click()
       카드가 없거나, 카드에 리스너가 아직 안 붙었거나, 다른 위임 핸들러가 그 클릭을
       가로채면 «엉뚱한 화면이 열리거나 아무 일도 안 일어난다». 그런데 그 어느 경우에도
       신호가 없다 — 사용자에겐 그냥 «안 열린다» 로만 보인다.
       (2026-08-17 사장님 제보: 상담사가 "수강료 페이지를 열어드릴게요" 하고 「AI와 친구하기」를
        열었다. 화면녹화 0.5초 간격 프레임에서 상담사가 닫히는 순간 그 오버레이가 «열리는» 것을
        확인했다 — 가려진 것이 아니라 목적지가 틀린 것이었다.)
       [어떻게 바꿨나] 실제 기능(window.gridActions[go])이 있으면 그걸 «직접» 부른다.
       없을 때만 예전처럼 mgGo 로 내려간다. 무엇을 실행했는지 __mangoiRoute 에 남긴다.
       ⚠️ 새 목적지를 map 에 추가할 때 mgGo 를 직접 부르지 말고 이 함수를 쓸 것. */
    function mangoiNote(go, how){
      try{
        window.__mangoiRoute = (window.__mangoiRoute||[]).slice(-19);
        window.__mangoiRoute.push({ go: go, how: how });
        console.info('[mangoi-open]', go, '→', how);
      }catch(e){}
    }
    function mangoiRun(go){
      if(window.gridActions && typeof window.gridActions[go]==='function'){
        mangoiNote(go, 'gridActions.'+go+'()');
        window.gridActions[go](); return true;
      }
      if(typeof window.mgGo==='function'){
        mangoiNote(go, 'mgGo("'+go+'") — 카드 대신 클릭');
        window.mgGo(go); return true;
      }
      mangoiNote(go, '실행할 수 있는 것이 없음');
      return false;
    }
    /* 💳 결제창은 «반드시» 열리게 한다 — 상담사가 가장 많이 안내하는 목적지다.
       실제 함수 → 그리드 액션 → 마지막으로 /?pay=1 (어느 페이지에서든 결제창을 여는 기존
       진입점, mg-sidebar.js 의 URLS 와 같은 주소). 어느 갈래로도 조용히 실패하지 않는다. */
    function mangoiOpenPayment(){
      if(typeof window.openPaymentModal==='function'){ mangoiNote('payment','openPaymentModal()'); window.openPaymentModal(); return; }
      if(window.gridActions && typeof window.gridActions.payment==='function'){ mangoiNote('payment','gridActions.payment()'); window.gridActions.payment(); return; }
      /* 여기까지 왔다면 결제 모듈(idx-payment-modal.js)·그리드(idx-grid-menu.js)가 둘 다 없다.
         그 상태에선 결제 카드를 눌러 봐야 리스너가 없어 아무 일도 안 난다 — 죽은 길이다.
         페이지를 다시 띄우는 딥링크로 간다. index.html 의 ?pay= 처리기가 결제 모듈이
         뜰 때까지 150ms×100회 기다렸다가 열어 준다. */
      mangoiNote('payment','/?pay=1 로 이동(결제 모듈 없음)');
      location.href='/?pay=1';
    }
    /* 📢 짧은 안내 배너. 공용 mangoToast 는 «호출부만 있고 정의가 없어»(전역에 없음)
       typeof 가드에 걸려 조용히 사라진다 — 그 함정을 그대로 밟지 않으려고 여기서 자급한다.
       z-index 는 전체메뉴(2147483600) «위» 라야 안내가 가려지지 않는다. */
    function mangoiSay(msg){
      try{
        var id='mangoi-say', old=document.getElementById(id);
        if(old && old.parentNode) old.parentNode.removeChild(old);
        var el=document.createElement('div');
        el.id=id; el.setAttribute('role','status'); el.textContent=msg;
        el.style.cssText='position:fixed;left:50%;bottom:96px;transform:translateX(-50%);'
          +'max-width:min(92vw,420px);z-index:2147483601;background:rgba(15,23,42,.96);color:#fde68a;'
          +'border:1px solid rgba(251,191,36,.5);border-radius:12px;padding:11px 15px;font-size:13.5px;'
          +'font-weight:600;line-height:1.5;text-align:center;box-shadow:0 10px 28px rgba(0,0,0,.45);'
          +'font-family:inherit;pointer-events:none';
        document.body.appendChild(el);
        setTimeout(function(){ try{ if(el.parentNode) el.parentNode.removeChild(el); }catch(e){} }, 4000);
      }catch(e){}
    }
    /* 모르는 코드가 오면 «조용히 아무 화면이나» 열지 않는다 — 그게 이번 제보처럼 읽힌다.
       무엇을 못 찾았는지 한 줄로 알려 주고, 그 다음에 전체 메뉴를 열어 길을 터 준다. */
    function mangoiUnknownGo(go){
      mangoiNote(go, '아는 목적지가 아님 — 전체 메뉴로 안내');
      var en=false;
      try{ en=(window.getLang && window.getLang()==='en'); }catch(e){}
      mangoiSay(en ? 'Sorry, I could not find that screen. Opening the full menu.'
                   : '요청하신 화면을 찾지 못했어요. 전체 메뉴를 열어 드릴게요.');
      if(window.openAllMenuOverlay) window.openAllMenuOverlay();
    }

    // 아바타가 보내는 '페이지 열기' 요청 처리 (화이트리스트만 허용)
    function mangoiOpenPage(go){
      var map={
        "lesson-enter":  function(){ if(window.showView) window.showView("view-videocall-lobby"); },
        "lesson-change": function(){ mangoiRun("lesson-change"); },
        "leveltest":     function(){ if(window.showLevelTestModal) window.showLevelTestModal(); else if(window.mgGo) window.mgGo("leveltest"); else location.href="/?menu=leveltest"; },
        "library":       function(){ mangoiRun("library"); },
        "report":        function(){ mangoiRun("report"); },
        "mypage":        function(){ location.href="/parent.html"; },
        "payment":       mangoiOpenPayment,
        "booking":       function(){ mangoiRun("booking"); },
        "precheck":      function(){ mangoiRun("precheck"); },
        "teachers":      function(){ if(window.gridActions&&window.gridActions.teachers) window.gridActions.teachers(); },
        "review-quiz":   function(){ location.href="/review-quiz.html"; },
        "review-quiz-cn":function(){ location.href="/review-quiz-cn.html"; },   // 🇨🇳 (2026-08-17 연결)
        "refund":        function(){ try{ if(window.mgDrawerClose) window.mgDrawerClose(); }catch(e){} location.href="/refund.html"; },
        "all-menu":      function(){ if(window.openAllMenuOverlay) window.openAllMenuOverlay(); },
        // 🥭 (2026-07-07) 상담직원 라우팅 확장 — 사이드바 직접링크 메뉴(게임·웜업·AI친구 등)는
        //  data-go 카드가 아니라 location.href 라 mgGo 폴백으로 안 열림 → 여기에 명시적으로 등록.
        "games":         function(){ location.href="/student-games.html"; },
        "warmup":        function(){ location.href="/warmup.html"; },
        "ai-friend":     function(){ location.href="/ai-friend.html"; },
        "ai-write":      function(){ location.href="/ai-write.html"; },
        "write":         function(){ location.href="/ai-write.html"; },
        "vocab":         function(){ location.href="/vocab.html"; },
        "microquiz":     function(){ location.href="/micro-quiz.html"; },
        "streak":        function(){ location.href="/streak.html"; },
        "checkin":       function(){ location.href="/streak.html"; },
        "mbti":          function(){ location.href="/mbti.html"; },
        "speech-coach":  function(){ location.href="/speech-coach.html"; },
        "speech":        function(){ if(window.mgGo) window.mgGo("speech"); else location.href="/speech-coach.html"; },
        "teacher-praise":function(){ location.href="/teacher-praise.html"; },
        "curriculum":    function(){ if(window.mgGo) window.mgGo("curriculum"); else location.href="/curriculum.html"; },
        "faq":           function(){ try{ if(window.mgDrawerClose) window.mgDrawerClose(); }catch(e){} if(window.openFaqOverlay) window.openFaqOverlay(); else if(window.mgGo) window.mgGo("faq"); },
        "about":         function(){ if(window.openAboutMangoi) window.openAboutMangoi(); else if(window.mgGo) window.mgGo("about"); },
        "points-shop":   function(){ if(window.showPointsShop) window.showPointsShop(); else if(window.mgGo) window.mgGo("points-shop"); },
        "mypoints":      function(){ if(window.showPointsShop) window.showPointsShop(); else if(window.mgGo) window.mgGo("points-shop"); },
        "contact":       function(){ mangoiRun("contact"); },
        "inquiry":       function(){ mangoiRun("inquiry"); },
        "diagnosis":     function(){ mangoiRun("diagnosis"); },
        "notice":        function(){ mangoiRun("notice"); },
        "event":         function(){ mangoiRun("event"); },
        "trial":         function(){ mangoiRun("trial"); },
        "reviews":       function(){ mangoiRun("reviews"); },
        "recordings":    function(){ mangoiRun("recordings"); },
        // 🥭 (2026-07-07) 나머지 전 메뉴 커버 — 전용 페이지가 있으면 직접, 없으면 관련 카드/기능으로.
        "admin":         function(){ mangoiRun("admin"); },
        "mbti-test":     function(){ location.href="/mbti.html"; },
        "monthly-report":function(){ location.href="/monthly-report.html"; },
        "parent-dashboard": function(){ location.href="/parent.html"; },
        "enroll":        function(){ mangoiRun("enroll"); },
        "videolesson":   function(){ if(window.openVideoLessons) window.openVideoLessons(); else if(window.mgGo) window.mgGo("videolesson"); },
        "franchise":     function(){ mangoiRun("franchise"); },
        "callcenter":    function(){ mangoiRun("contact"); },
        "remote":        function(){ mangoiRun("contact"); },
        "goals":         function(){ location.href="/parent.html"; },
        "leaderboard":   function(){ location.href="/streak.html"; },
        "focus":         function(){ if(window.openAllMenuOverlay) window.openAllMenuOverlay(); },
        "installguide":  function(){ try{ if(window.mgDrawerClose) window.mgDrawerClose(); }catch(e){} if(window.openFaqOverlay) window.openFaqOverlay(); }
      };
      var fn=map[go];
      if(!fn && go){
        // 아는 코드가 아니다. data-go 카드가 있으면 그거라도 눌러 보고,
        // 그것도 없으면 «못 찾았다» 고 «말한 뒤» 전체 메뉴로 안내한다(조용한 오이동 금지).
        var card=document.querySelector('.ai-quick-btn[data-go="'+go+'"]')||document.querySelector('.gm-card[data-go="'+go+'"]');
        if(card && window.mgGo) fn=function(){ mangoiNote(go,'map 에 없음 — data-go 카드 클릭'); window.mgGo(go); };
        else fn=function(){ mangoiUnknownGo(go); };
      }
      if(!fn) return;
      setOpen(false);
      mangoiCloseCoveringLayers();   // ← 목적지가 모달이면 위층 오버레이에 가려 안 보인다(위 주석)
      setTimeout(function(){ try{ fn(); }catch(e){} }, 150);
    }
    window.addEventListener("message", function(e){
      var d=e.data;
      if(d === "mangoi-avatar-close"){ setOpen(false); return; }
      if(d && typeof d==="object" && d.type==="mangoi-open" && typeof d.go==="string"){ mangoiOpenPage(d.go); }
    });
    window.addEventListener("resize", function(){ if(w.classList.contains("open")) positionPanel(); });

    // === 아바타 음성 정지: iframe 으로 'mangoi-stop' 전송 ===
    function mangoiStopVoice(){
      try{
        var fr=document.getElementById("mangoi-frame");
        if(fr && fr.contentWindow) fr.contentWindow.postMessage("mangoi-stop","*");
      }catch(e){}
    }
    // === 위젯 초기화: 닫을 때 iframe 으로 'mangoi-reset' 전송 → 다시 열면 처음부터 깨끗하게 ===
    function mangoiResetWidget(){
      try{
        var fr=document.getElementById("mangoi-frame");
        if(fr && fr.contentWindow) fr.contentWindow.postMessage("mangoi-reset","*");
      }catch(e){}
    }
    // 패널 열린 상태에서 위젯 바깥을 누르면 닫기(+정지). 위젯 내부/입력은 무시(iframe 내부 이벤트는 부모에 안 옴)
    document.addEventListener("pointerdown", function(e){
      if(!w.classList.contains("open")) return;
      if(w.contains(e.target)) return;
      setOpen(false);
    }, true);
    // 페이지 뷰 전환/이동 함수 진입 시 음성 정지
    ["showView","mgGo"].forEach(function(name){
      var orig=window[name];
      if(typeof orig==="function"){
        window[name]=function(){ mangoiStopVoice(); return orig.apply(this, arguments); };
      }
    });
    document.addEventListener("visibilitychange", function(){ if(document.hidden) mangoiStopVoice(); });
    window.addEventListener("pagehide", mangoiStopVoice);
    // 🔇 (2026-07-13) 수업 입장 시 상담사 iframe 물리 차단 — "수업 중 상담사 목소리" 신고 대응.
    //   display:none(CSS 숨김)은 iframe 내부 오디오를 못 끊고, postMessage("mangoi-stop")는
    //   외부 워커 페이지가 이행해야만 듣는 '부탁'이다. 수업 중에는 src 를 about:blank 로
    //   교체해 소리를 원천 차단하고, 수업이 끝나면 원래 주소로 복원한다.
    (function(){
      var fr = document.getElementById("mangoi-frame");
      if (!fr || !window.MutationObserver) return;
      // (2026-07-31) 지연 로드 대응 — 초기에는 src 가 없고 주소가 data-src 에 있다.
      //   src 만 읽으면 savedSrc 가 null 이 되어 수업 후 복원이 깨진다.
      var savedSrc = fr.getAttribute("src") || fr.getAttribute("data-src");
      var inCall = false;   // sync() 첫 호출이 현재 상태를 반영하도록 항상 false 에서 출발
      function sync(){
        var now = document.body.classList.contains("vc-in-call");
        if (now === inCall) return;
        inCall = now;
        if (now) {
          try { mangoiStopVoice(); } catch(e){}
          try { setOpen(false); } catch(e){}
          try {
            var cur = fr.getAttribute("src");
            if (cur && cur !== "about:blank") savedSrc = cur;
            // 아직 한 번도 열지 않아 로드조차 안 된 상태면 about:blank 로 바꿀 필요가 없다
            //   (오히려 data-src 지연로드를 무력화한다). 그대로 둔다.
            if (cur) fr.src = "about:blank";
          } catch(e){}
        } else {
          try {
            var c = fr.getAttribute("src");
            // 로드 이력이 있는 경우(about:blank)만 복원. 미로드 상태(src 없음)는 지연로드에 맡긴다.
            if (c === "about:blank" && savedSrc) fr.src = savedSrc;
          } catch(e){}
        }
      }
      new MutationObserver(sync).observe(document.body, { attributes:true, attributeFilter:["class"] });
      sync();
    })();
  })();

