/* ============================================================
   mg-sidebar.js — 공용 좌측 슬라이드 사이드바
   - index.html 의 #mg-drawer 와 동일한 모습/동작을 모든 페이지에 주입
   - 관리자(admin) 페이지에서는 include 하지 않음
   - index.html 에는 이미 인라인 드로어가 있으므로(#mg-drawer 존재) 중복 주입하지 않음
   - mgGo(code): 각 메뉴를 해당 페이지 URL 로 이동시킴(다른 페이지에서도 동작)
   ============================================================ */
(function(){
  'use strict';

  // 이미 드로어가 있으면(=index.html 인라인) 아무것도 하지 않음
  if (document.getElementById('mg-drawer')) return;
  // 관리자 페이지 안전장치(혹시 실수로 include 되어도 동작 안 함)
  if (/\/admin(\.html|\/|$)/.test(location.pathname)) return;

  // 메뉴 코드 → 이동 URL (index.html URLS 맵과 일치)
  var URLS = {
    'about':'/', 'all-menu':'/', 'home':'/',
    'leveltest':'/level-test.html',
    'admin':'/admin.html',
    'mypage':'/parent.html',
    'report':'/report.html',
    'points-shop':'/streak.html',
    'speech':'/speech-coach.html',
    'lesson-change':'/lesson-postpone-demo.html',
    'refund':'/refund.html',
    'inquiry':'/contact.html',
    'precheck':'/precheck.html',
    'booking':'/lesson-booking-demo.html',
    'faq':'/faq.html',
    'warmup':'/warmup.html',
    'student-game':'/student-games.html',
    'review-quiz':'/review-quiz.html'
  };

  // 메뉴 항목 정의 (라벨/별점/아이콘)
  var ITEMS = [
    { go:'about',       cls:'mg-hl mg-s3', ko:'망고아이란?',        en:'About Mangoi',  img:'/img/Mangoi_Character.png' },
    { go:'leveltest',   cls:'mg-hl mg-s2', ko:'🎯 레벨테스트',       en:'🎯 Level Test' },
    { go:'admin',       cls:'mg-s1',       ko:'📊 관리자',          en:'📊 Admin' },
    { go:'mypage',      cls:'',            ko:'👤 마이페이지',       en:'👤 My Page' },
    { go:'report',      cls:'mg-s1',       ko:'📋 평가표(성적표)',    en:'📋 Report Card' },
    { go:'points-shop', cls:'',            ko:'🎁 포인트상점',       en:'🎁 Point Shop' },
    { go:'speech',      cls:'',            ko:'🎤 단계별 발음',       en:'🎤 Curriculum Pronunciation' },
    { go:'lesson-change',cls:'',           ko:'📅 연기/변경',        en:'📅 Postpone/Change' },
    { go:'refund',      cls:'',            ko:'💰 환불규정',         en:'💰 Refund Policy' },
    { go:'inquiry',     cls:'mg-hl mg-s2', ko:'💬 신규상담',         en:'💬 New Inquiry' },
    { go:'precheck',    cls:'mg-s1',       ko:'🎥 수업 진단',        en:'🎥 PreCheck' },
    { go:'booking',     cls:'mg-s2',       ko:'📝 수업 신청',        en:'📝 Book Class' },
    { go:'faq',         cls:'mg-hl mg-s2', ko:'❓ 자주 묻는 질문',    en:'❓ FAQ' },
    { go:'warmup',      cls:'mg-hl mg-s3', ko:'🗣️ 수업 전 AI 웜업',   en:'🗣️ Pre-class AI Warm-up' },
    { go:'student-game',cls:'mg-hl mg-s2', ko:'🎮 학생게임',         en:'🎮 Student Game' },
    { go:'review-quiz', cls:'',            ko:'🧠 복습퀴즈',         en:'🧠 Review Quiz' },
    { go:'all-menu',    cls:'mg-s3',       ko:'🏠 전체메뉴',         en:'🏠 All Menu' }
  ];

  // ---- CSS (index.html 인라인과 동일 + hover 확대 효과) ----
  var css = ''
    + '#mg-drawer{position:fixed;top:0;left:0;height:100%;width:250px;max-width:80vw;background:rgba(11,16,32,0.22);-webkit-backdrop-filter:blur(10px) saturate(130%);backdrop-filter:blur(10px) saturate(130%);box-shadow:6px 0 24px rgba(0,0,0,.3);transform:translateX(-100%);transition:transform .32s cubic-bezier(.4,0,.2,1);z-index:100000;display:flex;flex-direction:column;font-family:\'Noto Sans KR\',-apple-system,BlinkMacSystemFont,sans-serif;border-right:1px solid rgba(251,191,36,.25)}'
    + '#mg-drawer.open{transform:translateX(0)}'
    + '#mg-drawer-overlay{position:fixed;inset:0;background:rgba(2,6,18,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;visibility:hidden;transition:opacity .3s;z-index:99999}'
    + '#mg-drawer-overlay.open{opacity:1;visibility:visible}'
    + '.mg-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}'
    + '.mg-drawer-logo{font-size:18px;font-weight:800;color:#fbbf24;letter-spacing:.3px}'
    + '.mg-drawer-x{background:rgba(255,255,255,.08);border:0;color:#cbd5e1;width:30px;height:30px;border-radius:8px;font-size:15px;cursor:pointer}'
    + '.mg-drawer-nav{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:6px}'
    + '.mg-drawer-nav button{text-align:left;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);color:#e2e8f0;padding:12px 14px;border-radius:11px;font-size:14px;font-weight:600;cursor:pointer;transform-origin:left center;transition:background .18s ease,transform .18s ease,box-shadow .18s ease,border-color .18s ease}'
    + '.mg-drawer-nav button:hover{background:rgba(251,191,36,.13);border-color:rgba(251,191,36,.45);transform:scale(1.045);box-shadow:0 4px 14px rgba(251,191,36,.18)}'
    + '.mg-drawer-nav button:active{background:rgba(251,191,36,.22);transform:scale(.98)}'
    + '@media (hover:none){.mg-drawer-nav button:hover{transform:none;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.07);box-shadow:none}}'
    + '.mg-drawer-nav button.mg-s1::after,.mg-drawer-nav button.mg-s2::after,.mg-drawer-nav button.mg-s3::after{color:#fbbf24;margin-left:6px;font-size:9px;letter-spacing:1px;vertical-align:middle;text-shadow:0 1px 2px rgba(0,0,0,.4)}'
    + '.mg-drawer-nav button.mg-s1::after{content:\'\\2605\'}'
    + '.mg-drawer-nav button.mg-s2::after{content:\'\\2605\\2605\'}'
    + '.mg-drawer-nav button.mg-s3::after{content:\'\\2605\\2605\\2605\'}'
    + '#mg-drawer-tab{position:absolute;right:-46px;top:50%;transform:translateY(-50%);width:44px;height:78px;border:1.5px solid rgba(245,158,11,0.7);border-left:0;border-radius:0 14px 14px 0;background:rgba(18,12,2,0.42);color:#fbbf24;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 0 10px rgba(245,158,11,.45);display:flex;align-items:center;justify-content:center;padding:0;-webkit-tap-highlight-color:transparent}'
    + '#mg-drawer-tab #mg-tab-label{writing-mode:vertical-rl;text-orientation:upright;font-size:14px;font-weight:800;letter-spacing:1px;line-height:1.15}'
    + '@keyframes mgTabFadeIn{from{opacity:0}to{opacity:1}}'
    + '@keyframes mgTabGlow{0%,100%{box-shadow:0 0 12px rgba(251,191,36,.75),0 0 26px rgba(245,158,11,.45);border-color:rgba(251,191,36,.85)}50%{box-shadow:0 0 26px rgba(255,214,90,1),0 0 52px rgba(251,191,36,.9),0 0 72px rgba(251,191,36,.5);border-color:#ffe07a}}'
    + '#mg-drawer-tab{opacity:0;animation:mgTabFadeIn .9s ease-out 1.2s forwards, mgTabGlow 2.8s ease-in-out 2.1s infinite}'
    + '@media (prefers-reduced-motion: reduce){#mg-drawer-tab{animation:none !important;opacity:1 !important;box-shadow:0 0 16px rgba(251,191,36,.85),0 0 30px rgba(251,191,36,.5) !important;border-color:rgba(251,191,36,.95) !important}}';

  // ---- 마크업 ----
  function buildNav(){
    return ITEMS.map(function(it){
      var inner = it.img
        ? '<img src="'+it.img+'" alt="" style="height:20px;width:20px;object-fit:contain;vertical-align:middle;margin-right:6px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><span data-ko="'+it.ko+'" data-en="'+it.en+'">'+it.ko+'</span>'
        : '';
      var clsAttr = it.cls ? ' class="'+it.cls+'"' : '';
      if (it.img){
        return '<button'+clsAttr+' onclick="mgGo(\''+it.go+'\')">'+inner+'</button>';
      }
      return '<button'+clsAttr+' onclick="mgGo(\''+it.go+'\')" data-ko="'+it.ko+'" data-en="'+it.en+'">'+it.ko+'</button>';
    }).join('');
  }

  function inject(){
    if (document.getElementById('mg-drawer')) return;

    var style = document.createElement('style');
    style.id = 'mg-sidebar-style';
    style.textContent = css;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'mg-drawer-overlay';
    overlay.onclick = window.mgDrawerClose;

    var aside = document.createElement('aside');
    aside.id = 'mg-drawer';
    aside.setAttribute('aria-label','메뉴 사이드바');
    aside.setAttribute('data-ko-aria','메뉴 사이드바');
    aside.setAttribute('data-en-aria','Menu sidebar');
    aside.innerHTML = ''
      + '<div class="mg-drawer-head">'
      +   '<span class="mg-drawer-logo" onclick="mgDrawerClose();location.href=\'/\';" style="cursor:pointer" title="홈으로" data-ko-title="홈으로" data-en-title="Home" role="link" tabindex="0" onkeydown="if(event.key===\'Enter\'){mgDrawerClose();location.href=\'/\';}"><img src="/img/mango-ufo.png" alt="" style="height:24px;width:auto;vertical-align:middle;margin-right:5px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"> Mangoi</span>'
      +   '<button class="mg-drawer-x" onclick="mgDrawerClose()" aria-label="닫기" data-ko-aria="닫기" data-en-aria="Close">✕</button>'
      + '</div>'
      + '<nav class="mg-drawer-nav">' + buildNav() + '</nav>'
      + '<button id="mg-drawer-tab" onclick="mgDrawerToggle()" aria-label="메뉴 열기/닫기" data-ko-aria="메뉴 열기/닫기" data-en-aria="Open/close menu"><span id="mg-tab-label" data-ko="열림" data-en="Open">열림</span></button>';

    document.body.appendChild(overlay);
    document.body.appendChild(aside);

    // 언어 재적용(mango-i18n.js 로드돼 있으면)
    try { if (window.applyLang) window.applyLang(); else if (window.mangoApplyI18n) window.mangoApplyI18n(); } catch(e){}

    // "열림" 탭 fade-in 은 세션당 1회만
    try {
      var KEY='mgTabFadeDone', tab=document.getElementById('mg-drawer-tab');
      if(tab){
        var showNow=function(){ tab.style.animation='none'; tab.style.opacity='1'; };
        if(sessionStorage.getItem(KEY)==='1'){ showNow(); }
        else {
          var doneFn=function(){ try{sessionStorage.setItem(KEY,'1');}catch(e){} showNow(); };
          tab.addEventListener('animationend', doneFn, {once:true});
          setTimeout(doneFn, 3200);
        }
      }
    } catch(e){}
  }

  // ---- 동작 함수 (index.html 과 동일 시그니처) ----
  function mgSetLabel(open){
    var l=document.getElementById('mg-tab-label'); if(!l)return;
    var ko=open?'닫힘':'열림', en=open?'Close':'Open';
    l.setAttribute('data-ko',ko); l.setAttribute('data-en',en);
    var lg='ko';
    try{ lg=window.getLang?window.getLang():(localStorage.getItem('mangoi_lang')||'ko'); }catch(e){}
    l.textContent=(lg==='ko')?ko:en;
  }
  window.mgDrawerToggle = function(){
    var d=document.getElementById('mg-drawer'), o=document.getElementById('mg-drawer-overlay');
    if(!d)return; var open=d.classList.toggle('open');
    if(o)o.classList.toggle('open',open); mgSetLabel(open);
  };
  window.mgDrawerClose = function(){
    var d=document.getElementById('mg-drawer'), o=document.getElementById('mg-drawer-overlay');
    if(d)d.classList.remove('open'); if(o)o.classList.remove('open'); mgSetLabel(false);
  };
  // 다른 페이지에서는 해당 기능 URL 로 이동
  window.mgGo = function(go){
    var url = URLS[go] || '/';
    window.mgDrawerClose();
    location.href = url;
  };

  // overlay onclick 바인딩이 함수 정의 전에 잡힐 수 있어 재설정
  function bindOverlay(){
    var o=document.getElementById('mg-drawer-overlay');
    if(o) o.onclick = window.mgDrawerClose;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ inject(); bindOverlay(); });
  } else {
    inject(); bindOverlay();
  }
})();
