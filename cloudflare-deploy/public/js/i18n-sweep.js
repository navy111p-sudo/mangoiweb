// ═══ i18n-sweep v1 (2026-06-12) — EN 전역 번역 스위퍼 ═══
// 사전(DICT) 기반: lang=en이면 텍스트 노드/속성을 영어로 치환, ko로 돌아오면 원문 복원.
// 동적 생성 UI(전체메뉴·망고아이란?·수업신청·관리자로그인 등)는 MutationObserver로 자동 처리.
(function(){
  'use strict';
  var DICT = {};   // ← 사전 본체는 /js/i18n-dict.json 으로 옮겼다 (loadBaked 가 EN 일 때만 받는다)
  var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var PATTERNS = [
    { re:/^(\d{1,2})월$/, fn:function(m){ var i=+m[1]; return (i>=1&&i<=12)?MONTHS[i-1]:m[0]; } },
    { re:/^주 (\d+)회$/, fn:function(m){ return m[1]+'x / week'; } },
    { re:/^\((\d+)\s*\/\s*(\d+)회 완료\)$/, fn:function(m){ return '('+m[1]+' / '+m[2]+' done)'; } },
    { re:/^주 (\d+)회 일정을 장바구니에 모두 담아주세요\.(?:\s*\(현재 (\d+)회\))?$/, fn:function(m){ return 'Add all '+m[1]+' weekly sessions to your cart.'+(m[2]!==undefined?' (currently '+m[2]+')':''); } },
    { re:/^(\d+)개$/, fn:function(m){ return m[1]; } },
    { re:/^(\d{1,2})단계$/, fn:function(m){ return 'Stage '+m[1]; } },
    { re:/^레벨 (\d{1,2})$/, fn:function(m){ return 'Level '+m[1]; } },
    { re:/^(\d+)년차$/, fn:function(m){ return m[1]+' yrs'; } },
    { re:/^⭐ (\d(?:\.\d)?) · (\d+)년차$/, fn:function(m){ return '⭐ '+m[1]+' · '+m[2]+' yrs'; } },
    { re:/^✓ 본사 ERP 등록 강사 (\d+)명 표시$/, fn:function(m){ return '✓ Showing '+m[1]+' HQ ERP-registered teachers'; } },
    { re:/^📌 현재 수업 \((\d+)회\)$/, fn:function(m){ return '📌 Current classes ('+m[1]+')'; } },
    { re:/^✅ 주 (\d+)회를 모두 담았어요$/, fn:function(m){ return '✅ All '+m[1]+' weekly sessions added'; } },
    { re:/^(.+) 선생님$/, fn:function(m){ return m[1]+' (Teacher)'; } },
    { re:/^1회당 ₩([\d,]+)$/, fn:function(m){ return '₩'+m[1]+' / session'; } },
    { re:/^\/(\d+)회$/, fn:function(m){ return '/ '+m[1]+' sessions'; } },
    { re:/^월 (\d+)회\/주 \((\d+)분\)$/, fn:function(m){ return m[1]+'x / week ('+m[2]+' min)'; } },
  ];
  var REPL = [["레벨 1 · 기본 문장", "Level 1 · Basic sentences"], ["레벨 2 · 확장 문장", "Level 2 · Expanded sentences"], ["레벨 3 · 도전 문장", "Level 3 · Challenge sentences"], ["문장 순서대로 재료를 올려 보세요!", "Put the toppings on in sentence order!"], ["(월)", "(Mon)"], ["(화)", "(Tue)"], ["(수)", "(Wed)"], ["(목)", "(Thu)"], ["(금)", "(Fri)"], ["(토)", "(Sat)"], ["(일)", "(Sun)"], ["님의 학습 평가서", "'s Learning Evaluations"], ["의 평가서", " evaluations"], ["평가서 #", "Evaluation #"], ["선생님 ·", "(Teacher) ·"], ["Mbps · 충분 ✓", "Mbps · sufficient ✓"], ["Mbps · 빠듯", "Mbps · tight"], ["Mbps · 부족", "Mbps · insufficient"], ["ms · 매우 빠름 ✓", "ms · very fast ✓"], ["ms · 양호", "ms · good"], ["ms · 다소 느림", "ms · a bit slow"], ["ms · 매우 느림", "ms · very slow"], ["에코 캔슬·노이즈 억제 ✓ · peak", "Echo cancel · noise suppression ✓ · peak"], ["입력 레벨 매우 작음 (peak", "Input level very low (peak"], ["입력 레벨 작음 (peak", "Input level low (peak"], ["날짜로 연기", "Postpone by Date"], ["교사로 연기", "Postpone by Teacher"], ["날짜로 변경", "Change by Date"], ["교사로 변경", "Change by Teacher"], ["연기 장바구니", "Postpone Cart"], ["변경 장바구니", "Change Cart"], ["⏩ 전체 일정 한 수업씩 뒤로 밀기", "⏩ Push all classes back one session"], ["(자동 연기)", "(auto postpone)"], ["(자동 변경)", "(auto change)"], ["일정을 더 담아주세요", "Add more sessions"], ["와 잘 맞는 선생님 — 눌러서 선택하세요!", " — matching teachers, tap to choose!"], ["와 잘 맞는 선생님을 찾는 중…", " — finding matching teachers…"], ["에서 정밀 검사도 추천드려요.", " — we also recommend a full test there."]];
  var ATTRS=['placeholder','title','aria-label','alt'];
  var SKIP=/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/;
  var records=[];

  // 🧊 (2026-08-08) 미리 구워 둔 번역 사전 — EN 일 때만 한 번 받아온다.
  //   왜 필요했나: 사전(DICT)에 없는 한국어는 전부 클릭 시점에 서버 AI 로 번역하고 있었다.
  //   실측(2026-08-08) — admin.html 은 미번역 1,126개 → 병렬 요청 23개, 요청 하나가 콜드 16.2초.
  //   해외(필리핀) 강사가 "EN 누르면 5분 걸린다"고 제보한 것이 이것이다.
  //   이 파일에 직접 넣지 않고 따로 받는 이유: 한국어 학생(대다수)은 EN 을 누르지 않는데
  //   모든 페이지가 수십 KB 를 더 내려받게 되기 때문. EN 일 때만 1회, 그 뒤엔 CDN 캐시.
  var BAKED = {};
  var bakedState = 0;          // 0=안받음 1=받는중 2=끝(성공/실패 무관)
  var bakedWaiters = [];
  function loadBaked(cb){
    if (bakedState === 2) { cb(); return; }
    bakedWaiters.push(cb);
    if (bakedState === 1) return;
    bakedState = 1;
    var settled = false;
    function finish(){
      if (settled) return; settled = true;
      bakedState = 2;
      var list = bakedWaiters; bakedWaiters = [];
      for (var i = 0; i < list.length; i++) { try { list[i](); } catch(e){} }
    }
    // 네트워크가 느리거나 파일이 없어도 화면이 인질이 되면 안 된다 → 3초 뒤엔 그냥 진행.
    setTimeout(finish, 3000);

    // 📖 (2026-08-08) 사전 본체(DICT)도 여기서 받는다 — 예전엔 이 파일에 통째로 박혀 있었다.
    //
    //   왜 옮겼나 — DICT 는 **영어일 때만** 쓰인다(sweep 은 isEn() 뒤에서만 돈다).
    //   그런데 파일에 박혀 있어서 한국어 사용자도 무조건 받았다. 실측: 전체 gzip 74KB 중
    //   68KB 가 사전이었고, 이 사전을 부르는 화면이 42개다. 한국 본사 직원에게는 100% 낭비다.
    //   (오늘 강사·대리점·필리핀 매니저를 경량 화면으로 옮겼으므로, admin 계열에 남은
    //    사용자는 대부분 한국어 사용자다 — 낭비의 비중이 더 커졌다.)
    //
    //   ⚠️ 3초 폴백이 먼저 터져도 화면이 한국어로 굳지 않게, 사전이 «늦게라도» 도착하면
    //      그때 다시 한 번 훑는다. 느린 회선에서 68KB 가 3초를 넘길 수 있기 때문이다.
    //      (이게 없으면 「EN 인데 한국어가 그대로」 라는 옛 증상이 회선 탓으로 되살아난다.)
    var lateSweep = function(){
      try { if (typeof isEn === 'function' && isEn() && typeof sweep === 'function') sweep(); } catch(e){}
    };
    try {
      var pDict = fetch('/js/i18n-dict.json?v=1')
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ if (j) { DICT = j; if (settled) lateSweep(); } })
        .catch(function(){});
      var pBaked = fetch('/js/i18n-en-baked.json?v=1')
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){ if (j) { BAKED = j; if (settled) lateSweep(); } })
        .catch(function(){});
      Promise.all([pDict, pBaked]).then(finish, finish);
    } catch(e){ finish(); }
  }

  // 🌐 자동번역 폴백 — 사전에 없는 한국어는 서버 AI로 번역 후 localStorage 캐시
  var AUTO = {};
  try { AUTO = JSON.parse(localStorage.getItem('mangoi_i18n_en') || '{}') || {}; } catch(e) { AUTO = {}; }
  var MISS = {};        // 이번 배치 대상
  var TRIED = {};       // 세션 내 1회만 시도 (무한루프 방지)
  var flushTimer = null;
  function hasKo(s){ return /[가-힣]/.test(s); }
  // 📊 (2026-08-08) 번역할 것이 없는 «데이터» 는 서버로 보내지 않는다.
  //   "247건" "₩23,026만" "0명" 같은 표 숫자는 번역해도 그대로인데, 값이 바뀔 때마다
  //   새 문자열이라 캐시가 영원히 빗나간다 — 화면을 볼 때마다 AI 를 부르는 셈이었다.
  function looksLikeData(s){
    return /^[\d,.\s]+$/.test(s) || /^₩[\d,]+(만|억)?$/.test(s) || /^\d+(건|명|개|회|원|점)$/.test(s);
  }
  function maybeQueue(k){
    if (TRIED[k]) return;
    if (!hasKo(k) || k.length > 200) return;
    if (looksLikeData(k)) return;
    TRIED[k] = true; MISS[k] = true; scheduleFlush();
  }
  function scheduleFlush(){ if (flushTimer) return; flushTimer = setTimeout(flushMiss, 250); }
  function flushMiss(){
    flushTimer = null;
    var items = Object.keys(MISS); MISS = {};
    if (!items.length || !isEn()) return;
    // ⚡ (2026-07-22) 청크를 순차(await 루프)로 돌리던 것을 병렬로 — 해외(필리핀) 회선에서
    //   미번역 문장이 수백 개면 왕복이 그만큼 쌓여 "한참 뒤에야 영어로 바뀌는" 원인이었다.
    (async function(){
      var chunks = [];
      for (var i = 0; i < items.length; i += 50) chunks.push(items.slice(i, i + 50));
      // ⚡ (2026-08-08) 동시 요청 수 제한 — 예전엔 청크를 전부 한꺼번에 던졌다.
      //   미번역이 많은 화면(admin.html: 1,126개 → 요청 23개)에서 서버 AI 가 밀려
      //   서로를 기다리다 몇 분씩 걸렸다. 4개씩 흘려보내면 총 시간이 오히려 짧다.
      var results = new Array(chunks.length);
      var cursor = 0;
      async function worker(){
        while (cursor < chunks.length){
          var my = cursor++;
          results[my] = await fetch('/api/i18n/translate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ texts: chunks[my], target: 'en' }) })
            .then(function(x){ return x.json(); })
            .catch(function(){ return null; });
        }
      }
      var lanes = [];
      for (var w = 0; w < Math.min(4, chunks.length); w++) lanes.push(worker());
      await Promise.all(lanes);
      var changed = false;
      for (var c = 0; c < results.length; c++){
        var r = results[c];
        if (!r || !r.map) continue;
        for (var key in r.map){ var en = r.map[key]; if (en && en !== key){ AUTO[key] = en; changed = true; } }
      }
      if (changed){ try { localStorage.setItem('mangoi_i18n_en', JSON.stringify(AUTO)); } catch(e){} }
      if (changed && isEn()){ try { sweep(document.body); } catch(e){} }
    })();
  }

  function lang(){
    try{ if(window.getLang) return window.getLang(); }catch(e){}
    try{ var l=localStorage.getItem('mangoi_lang'); if(l) return l; }catch(e){}
    return document.documentElement.lang || 'ko';
  }
  function isEn(){ return lang()==='en'; }

  function trText(t){
    var k=t.trim(); if(!k) return null;
    var v=DICT[k];
    if(v===undefined){
      for(var i=0;i<PATTERNS.length;i++){ var m=k.match(PATTERNS[i].re); if(m){ v=PATTERNS[i].fn(m); break; } }
    }
    if(v===undefined){
      var r=k, hit=false;
      for(var j=0;j<REPL.length;j++){ var nr=r.split(REPL[j][0]).join(REPL[j][1]); if(nr!==r){ r=nr; hit=true; } }
      if(hit) v=r;
    }
    // 구워 둔 사전이 localStorage 캐시보다 우선 — 손으로 고친 번역이 옛 캐시에 밀리지 않게.
    if(v===undefined && BAKED[k]!==undefined) v=BAKED[k];
    if(v===undefined && AUTO[k]!==undefined) v=AUTO[k];
    if(v===undefined){ maybeQueue(k); return null; }
    return t.replace(k, v);
  }

  function applyTextNode(n){
    var out=trText(n.nodeValue||'');
    if(out!==null && out!==n.nodeValue){ records.push({n:n,a:null,o:n.nodeValue}); n.nodeValue=out; }
  }
  function applyEl(el){
    for(var i=0;i<ATTRS.length;i++){
      var a=ATTRS[i], v=el.getAttribute && el.getAttribute(a);
      if(v){ var out=trText(v); if(out!==null && out!==v){ records.push({n:el,a:a,o:v}); el.setAttribute(a,out); } }
    }
  }
  // 🌐 (2026-07-25) data-ko/data-en 이 붙은 요소는 applyLang(mango-i18n)이 '권위'를 가진다.
  //   sweep 이 이런 요소까지 EN 으로 치환하면, 사이드바가 다시 그려질 때 원문 복원이
  //   어긋나 한국어 모드인데 영어로 굳는 사고가 났다(강사 제보: 사이드바 자식 메뉴 영어 혼용).
  //   → i18n 관리 요소는 sweep 이 손대지 않고 applyLang 에 맡긴다.
  //   ➕ (2026-08-08) 표준 옵트아웃 translate="no" / class="notranslate" 도 함께 존중한다.
  //      학생 이름·아이디처럼 «번역하면 안 되는» 표 내용에 이 표시를 달면 스윕이 건너뛰고,
  //      서버 번역기로도 보내지 않는다.
  function _i18nManaged(el){
    if (!el || !el.hasAttribute) return false;
    if (el.hasAttribute('data-ko') || el.hasAttribute('data-en')) return true;
    if (el.getAttribute('translate') === 'no') return true;
    if (el.classList && el.classList.contains('notranslate')) return true;
    return false;
  }
  function walk(root){
    if(!root) return;
    if(root.nodeType===3){
      var _p=root.parentElement;
      if(_p && _i18nManaged(_p)) return;   // applyLang 관리 텍스트는 건너뜀
      applyTextNode(root); return;
    }
    if(root.nodeType!==1 && root.nodeType!==11) return;
    if(root.nodeType===1){ if(SKIP.test(root.tagName)) return; if(_i18nManaged(root)) return; applyEl(root); }
    /* 📝 (2026-07-23) TEXTAREA 의 placeholder 만 따로 번역한다.
       SKIP 에 TEXTAREA 가 들어 있어 워커가 통째로 걸러내는데, 그건 '사용자가 입력한 내용'을
       건드리지 않으려는 것이라 맞다. 문제는 그 바람에 placeholder 속성까지 같이 빠져서,
       영어 모드인데 이 칸만 한국어로 남았다(강사 제보: '참관 사유 (필수, …)').
       applyEl 은 속성만 만지므로 입력 내용에는 영향이 없다. */
    try {
      if (root.tagName === 'TEXTAREA') applyEl(root);
      else if (root.querySelectorAll) {
        var _tas = root.querySelectorAll('textarea');
        for (var _i = 0; _i < _tas.length; _i++) applyEl(_tas[_i]);
      }
    } catch(e){}
    var w=document.createTreeWalker(root, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT, {
      acceptNode:function(nd){
        if(nd.nodeType===1){
          if(SKIP.test(nd.tagName)) return NodeFilter.FILTER_REJECT;
          if(_i18nManaged(nd)) return NodeFilter.FILTER_REJECT;   // data-ko/en = applyLang 관리, 서브트리째 제외
          return NodeFilter.FILTER_ACCEPT;
        }
        var _pp=nd.parentElement;
        if(_pp && _i18nManaged(_pp)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nd;
    while((nd=w.nextNode())){
      if(nd.nodeType===3) applyTextNode(nd);
      else applyEl(nd);
    }
  }
  // 참고: 번역 결과(영어)는 DICT 키(한국어)와 다시 매칭되지 않으므로 무한루프 없음 → 가드 플래그 불필요
  function sweep(root){
    if(!isEn()) return;
    walk(root||document.body);
    try{ var t=trText(document.title); if(t!==null) document.title=t; }catch(e){}
  }
  function restore(){
    for(var i=0;i<records.length;i++){
      var r=records[i];
      try{ if(r.a){ r.n.setAttribute(r.a, r.o); } else { r.n.nodeValue=r.o; } }catch(e){}
    }
    records=[];
  }

  function start(){
    // 🌐 (2026-07-22) 첫 스윕이 끝났으니 본문 표시 허용 — admin.html 이 영어 부팅 시
    //   한글이 잠깐 보이지 않도록 body 를 감춰 두고 여기서 푼다(안전장치 타이머도 있음).
    function unhide(){ try { if (window.__admEnReady) window.__admEnReady(); } catch(e){} }
    if(isEn()) loadBaked(function(){ sweep(); unhide(); });
    else unhide();
    // 동적 노드 감시
    //  ⚡ (2026-07-22, 강사 피드백 #2 "왼쪽에서 옵션을 고르면 버벅인다")
    //     예전엔 옵저버 콜백 '안에서' 추가된 subtree 를 그 자리에서 walk() 했다.
    //     관리자 화면은 메뉴 하나를 열 때 큰 표·카드를 통째로 주입하므로, 그 번역이
    //     클릭한 프레임을 그대로 잡아먹었다. 한국어 모드는 isEn()=false 로 즉시 빠져나가서
    //     멀쩡했고 — 그래서 영어로 쓰는 해외 강사만 버벅임을 겪었다.
    //     추가된 노드를 모아 다음 유휴 시간에 한 번에 처리한다(화면에는 한 프레임 차이).
    var pendQ = [], pendTimer = null;
    var idle = window.requestIdleCallback
      ? function(fn){ return window.requestIdleCallback(fn, { timeout: 200 }); }
      : function(fn){ return setTimeout(fn, 16); };
    function drainPend(){
      pendTimer = null;
      var list = pendQ; pendQ = [];
      for(var i=0;i<list.length;i++){
        var nd = list[i];
        // 그 사이 화면에서 사라진 노드는 번역할 필요가 없다 (표를 다시 그리는 화면에서 특히 큼)
        if(!nd || nd.isConnected === false) continue;
        try{ walk(nd); }catch(e){}
      }
    }
    try{
      new MutationObserver(function(muts){
        if(!isEn()) return;
        for(var i=0;i<muts.length;i++){
          var m=muts[i];
          if(m.type==='characterData') pendQ.push(m.target);
          if(m.addedNodes) for(var j=0;j<m.addedNodes.length;j++) pendQ.push(m.addedNodes[j]);
        }
        if(pendQ.length && !pendTimer) pendTimer = idle(drainPend);
      }).observe(document.body,{childList:true,subtree:true,characterData:true});
    }catch(e){}
    // 언어 전환 감지 (<html lang> — applyLang()이 갱신)
    try{
      var last=lang();
      new MutationObserver(function(){
        var l=lang();
        if(l===last) return;
        last=l;
        if(l==='en') loadBaked(function(){ sweep(); }); else restore();
      }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    }catch(e){}
    // 다른 탭/페이지에서 언어 변경
    try{
      window.addEventListener('storage', function(ev){
        if(ev.key!=='mangoi_lang') return;
        if(ev.newValue==='en') loadBaked(function(){ sweep(); }); else restore();
      });
    }catch(e){}
    console.log('[i18n-sweep] 활성 — '+Object.keys(DICT).length+' entries, lang='+lang());
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
