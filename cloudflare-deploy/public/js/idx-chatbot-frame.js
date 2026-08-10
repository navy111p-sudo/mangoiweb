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

    // 아바타가 보내는 '페이지 열기' 요청 처리 (화이트리스트만 허용)
    function mangoiOpenPage(go){
      var map={
        "lesson-enter":  function(){ if(window.showView) window.showView("view-videocall-lobby"); },
        "lesson-change": function(){ if(window.mgGo) window.mgGo("lesson-change"); },
        "leveltest":     function(){ if(window.showLevelTestModal) window.showLevelTestModal(); else if(window.mgGo) window.mgGo("leveltest"); else location.href="/?menu=leveltest"; },
        "library":       function(){ if(window.mgGo) window.mgGo("library"); },
        "report":        function(){ if(window.mgGo) window.mgGo("report"); },
        "mypage":        function(){ location.href="/parent.html"; },
        "payment":       function(){ if(window.mgGo) window.mgGo("payment"); },
        "booking":       function(){ if(window.mgGo) window.mgGo("booking"); },
        "precheck":      function(){ if(window.mgGo) window.mgGo("precheck"); },
        "teachers":      function(){ if(window.gridActions&&window.gridActions.teachers) window.gridActions.teachers(); },
        "review-quiz":   function(){ location.href="/review-quiz.html"; },
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
        "contact":       function(){ if(window.mgGo) window.mgGo("contact"); },
        "inquiry":       function(){ if(window.mgGo) window.mgGo("inquiry"); },
        "diagnosis":     function(){ if(window.mgGo) window.mgGo("diagnosis"); },
        "notice":        function(){ if(window.mgGo) window.mgGo("notice"); },
        "event":         function(){ if(window.mgGo) window.mgGo("event"); },
        "trial":         function(){ if(window.mgGo) window.mgGo("trial"); },
        "reviews":       function(){ if(window.mgGo) window.mgGo("reviews"); },
        "recordings":    function(){ if(window.mgGo) window.mgGo("recordings"); },
        // 🥭 (2026-07-07) 나머지 전 메뉴 커버 — 전용 페이지가 있으면 직접, 없으면 관련 카드/기능으로.
        "admin":         function(){ if(window.mgGo) window.mgGo("admin"); },
        "mbti-test":     function(){ location.href="/mbti.html"; },
        "monthly-report":function(){ location.href="/monthly-report.html"; },
        "parent-dashboard": function(){ location.href="/parent.html"; },
        "enroll":        function(){ if(window.mgGo) window.mgGo("enroll"); },
        "videolesson":   function(){ if(window.openVideoLessons) window.openVideoLessons(); else if(window.mgGo) window.mgGo("videolesson"); },
        "franchise":     function(){ if(window.mgGo) window.mgGo("franchise"); },
        "callcenter":    function(){ if(window.mgGo) window.mgGo("contact"); },
        "remote":        function(){ if(window.mgGo) window.mgGo("contact"); },
        "goals":         function(){ location.href="/parent.html"; },
        "leaderboard":   function(){ location.href="/streak.html"; },
        "focus":         function(){ if(window.openAllMenuOverlay) window.openAllMenuOverlay(); },
        "installguide":  function(){ try{ if(window.mgDrawerClose) window.mgDrawerClose(); }catch(e){} if(window.openFaqOverlay) window.openFaqOverlay(); }
      };
      var fn=map[go];
      if(!fn && go){
        // data-go 카드가 있으면 그 카드를 클릭, 없으면 전체메뉴 오버레이로 — '빈 클릭'(아무 반응 없음) 방지.
        var card=document.querySelector('.ai-quick-btn[data-go="'+go+'"]')||document.querySelector('.gm-card[data-go="'+go+'"]');
        if(card && window.mgGo) fn=function(){ window.mgGo(go); };
        else if(window.openAllMenuOverlay) fn=function(){ window.openAllMenuOverlay(); };
      }
      if(!fn) return;
      setOpen(false);
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

