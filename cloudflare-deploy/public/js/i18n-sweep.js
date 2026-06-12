// ═══ i18n-sweep v1 (2026-06-12) — EN 전역 번역 스위퍼 ═══
// 사전(DICT) 기반: lang=en이면 텍스트 노드/속성을 영어로 치환, ko로 돌아오면 원문 복원.
// 동적 생성 UI(전체메뉴·망고아이란?·수업신청·관리자로그인 등)는 MutationObserver로 자동 처리.
(function(){
  'use strict';
  var DICT = {
"전체 메뉴": "All Menu",
"관리자 페이지": "Admin Page",
"마이페이지": "My Page",
"학생 관리": "Student Management",
"내 주간 스케줄": "My Weekly Schedule",
"고객센터": "Customer Center",
"커리큘럼": "Curriculum",
"수업 자료": "Lesson Materials",
"평가서": "Evaluations",
"리포트": "Reports",
"AI 친구": "AI Friend",
"AI 작문": "AI Writing",
"영어 발음 코치": "English Pronunciation Coach",
"중국어 발음 코치": "Chinese Pronunciation Coach",
"교재 업로더": "Textbook Uploader",
"단어장": "Vocabulary",
"미니 퀴즈": "Mini Quiz",
"MBTI 매칭": "MBTI Matching",
"MBTI 테스트": "MBTI Test",
"연속 출석": "Attendance Streak",
"칭찬 스티커": "Praise Stickers",
"수업 신청": "Book Class",
"수업 연기·변경": "Postpone / Change",
"학부모 페이지": "Parent Page",
"시스템 진단": "System Check",
"관리자 로그인": "Admin Login",
"망고아이란?": "About Mangoi",
"📊 관리자": "📊 Admin",
"👤 마이페이지": "👤 My Page",
"🎁 포인트상점": "🎁 Point Shop",
"🎤 단계별 발음": "🎤 Curriculum Pronunciation",
"📅 연기/변경": "📅 Postpone/Change",
"💬 신규상담": "💬 New Inquiry",
"🎥 수업 진단": "🎥 PreCheck",
"📝 수업 신청": "📝 Book Class",
"👨‍🏫 교사 소개": "👨‍🏫 Our Teachers",
"🏠 전체메뉴": "🏠 All Menu",
"열림": "Open",
"닫힘": "Close",
"20년 전통 · 국내 최초의 화상영어 기업": "20 Years of Tradition · Korea's First Video English Company",
"원어민 1:1 화상수업과 A.I 학습관리로, 합리적인 비용에 최고의 영어 말하기 효과를 드립니다.": "Native 1:1 video lessons plus A.I learning management — the best English speaking results at a reasonable cost.",
"카드를 누르면 자세히 볼 수 있어요 👆": "Tap a card to see details 👆",
"무료 상담 신청하기": "Request a Free Consultation",
"교사와 A.I가 함께 학생 실력 향상": "Teachers and A.I Improve Skills Together",
"원어민 선생님의 1:1 화상수업과 A.I 학습관리가 하나의 시스템 안에서 맞물려 돌아갑니다. 수업은 사람이 이끌고, 예습·복습·평가·발음 교정은 A.I가 24시간 도와 학습의 빈틈을 메웁니다.": "Native-teacher 1:1 video lessons and A.I learning management run as one system. Teachers lead the class, while A.I supports preview, review, evaluation and pronunciation correction 24/7 to fill every gap in learning.",
"원어민 선생님과 1:1 / 1:2 수업": "1:1 / 1:2 Lessons with Native Teachers",
"엄격하게 검증된 원어민 전담 선생님과 1:1 또는 1:2 소수정예로 진행합니다. 같은 선생님이 꾸준히 관리하기 때문에 아이의 성향과 약점을 정확히 파악해 맞춤 지도를 합니다.": "Classes are taught 1:1 or 1:2 by strictly vetted, dedicated native teachers. The same teacher manages your child consistently, accurately understanding their traits and weaknesses for tailored teaching.",
"영어 커뮤니케이션 능력의 향상": "Better English Communication Skills",
"문법 암기가 아니라 실제로 입이 트이는 말하기 중심 수업입니다. 매 수업 충분한 발화량과 즉각적인 교정으로 머릿속 영어를 살아있는 회화로 바꿔 줍니다.": "Speaking-centered lessons that actually open your mouth — not grammar memorization. Plenty of speaking time and instant correction in every class turn head knowledge into living conversation.",
"저렴한 비용으로 최고의 학습 효과": "Top Learning Results at a Low Cost",
"필리핀 현지 교육센터를 직접 운영해 불필요한 중간 비용을 없앴습니다. 영미권 원어민 화상영어 대비 합리적인 가격으로, 같은 예산이면 더 자주 수업할 수 있습니다.": "We run our own education center in the Philippines, removing unnecessary middleman costs. Compared with US/UK native video English, the price is reasonable — the same budget buys more classes.",
"최고의 강사진과 체계적인 관리 시스템": "Great Teachers, Systematic Management",
"엄격한 채용과 정기 교육을 거친 강사진이 수업을 맡고, 출결·진도·성취를 데이터로 관리합니다. 담당 매니저가 학습 전반을 함께 챙겨 드립니다.": "Teachers pass strict hiring and regular training, and attendance, progress and achievement are managed with data. A dedicated manager looks after the whole learning journey with you.",
"시간과 장소에 구애받지 않는 시스템": "Learn Anytime, Anywhere",
"집, 학교, 여행지 어디서나 PC·태블릿·휴대폰으로 수업에 입장합니다. 원하는 시간대로 예약하고, 갑작스러운 일정은 연기·변경으로 유연하게 조정할 수 있습니다.": "Join classes from home, school or anywhere with a PC, tablet or phone. Book the time you want, and flexibly postpone or change when plans suddenly shift.",
"우수한 교재로 영어 말하기 동기 부여": "Great Textbooks That Motivate Speaking",
"연령과 레벨에 맞춰 설계된 자체 교재와 CEFR 기반 커리큘럼으로 학습합니다. 아이가 흥미를 느끼는 주제로 구성해 스스로 말하고 싶게 만듭니다.": "Learn with our own textbooks designed by age and level on a CEFR-based curriculum. Topics kids find interesting make them want to speak up on their own.",
"편리하고 다양한 기능의 앱과 홈페이지": "A Convenient All-in-One App & Website",
"수업 입장부터 예습·복습, 평가 확인, 결제, 상담까지 하나의 앱과 홈페이지에서 끝납니다. A.I 검색으로 원하는 기능을 말 한마디로 바로 찾을 수 있습니다.": "From entering class to preview, review, evaluations, payment and consultation — everything is done in one app and website. With A.I search, one phrase takes you straight to any feature.",
"즐겁고 효과적인 예습·복습 비디오와 퀴즈": "Fun, Effective Preview & Review Videos and Quizzes",
"수업 전 예습 영상으로 미리 준비하고, 수업 후에는 복습 퀴즈와 단어 게임으로 반복 학습합니다. 배운 내용을 놀이처럼 익혀 오래 기억하게 합니다.": "Prepare with preview videos before class, then reinforce with review quizzes and word games afterward. Learning feels like play, so it stays in memory longer.",
"A.I를 활용한 수업 평가 · 복습 · 소통": "A.I-Powered Evaluation · Review · Communication",
"매 수업이 끝나면 A.I가 발음·표현·참여도를 분석해 평가서를 자동으로 만들고, 아이에게 꼭 필요한 맞춤 복습을 추천합니다. 월간 리포트로 성장 흐름도 정리해 드립니다.": "After every class, A.I analyzes pronunciation, expressions and participation to auto-generate an evaluation, and recommends the review your child needs most. Monthly reports sum up growth at a glance.",
"직영 필리핀 현지 교육센터 운영": "Our Own Education Center in the Philippines",
"외주 업체가 아니라 망고아이가 직접 운영하는 필리핀 현지 교육센터입니다. 안정적인 인터넷과 근무 환경에서 검증된 정규 교사가 책임감 있게 수업합니다.": "Not an outsourced vendor — Mangoi directly runs its education center in the Philippines. Verified full-time teachers teach responsibly in a stable internet and work environment.",
"20년 전통, 국내 최초의 화상영어 기업": "20 Years of Tradition — Korea's First Video English Company",
"국내에서 화상영어를 가장 먼저 시작한 20년 전통의 기업입니다. 오랜 노하우와 수많은 학생 데이터가 쌓인, 시간으로 검증된 교육 시스템을 제공합니다.": "The first company to start video English in Korea, with 20 years of history. A time-tested education system built on long know-how and data from countless students.",
"학생 정보를 카카오톡으로 실시간 제공": "Real-Time Student Updates via KakaoTalk",
"수업 출결, 평가, 진도, 공지를 학부모님 카카오톡으로 실시간 전송합니다. 따로 앱을 열지 않아도 아이의 학습 상황을 바로 확인할 수 있습니다.": "Attendance, evaluations, progress and notices are sent to parents via KakaoTalk in real time. Check your child's learning instantly without opening another app.",
"수업(사람) + 학습관리(A.I)를 한 곳에서 — 수업만 제공하는 캠블리·링글과 다릅니다": "Lessons (people) + learning management (A.I) in one place — unlike Cambly or Ringle, which offer lessons only",
"매 수업이 끝나면 A.I가 자동으로 평가서와 맞춤 복습 퀴즈를 생성": "After every class, A.I automatically creates an evaluation and a personalized review quiz",
"교사 피드백과 A.I 학습 데이터가 서로 연동되어 약점을 정확히 보완": "Teacher feedback and A.I learning data are linked to precisely fix weaknesses",
"매번 바뀌는 랜덤 매칭이 아닌 전담 선생님제로 안정적인 관리": "A dedicated-teacher system, not random matching — stable, consistent care",
"형제·친구와 함께하는 1:2 수업으로 비용 부담은 낮추고 효과는 그대로": "1:2 classes with siblings or friends lower the cost while keeping the results",
"직영 센터에서 근무하는 정규 교사 — 검증된 수업 품질": "Full-time teachers at our own center — verified lesson quality",
"수업 외 시간에도 A.I 발음 코치로 무제한 말하기 연습": "Unlimited speaking practice with the A.I pronunciation coach outside class",
"발화량과 발음 점수를 데이터로 기록해 성장 과정을 확인": "Speaking volume and pronunciation scores recorded as data to track growth",
"실생활 표현 중심 커리큘럼으로 바로 쓰는 영어": "A real-life-expression curriculum you can use right away",
"직영 운영으로 거품을 뺀 합리적인 수강료": "Reasonable tuition with no bubble, thanks to direct operation",
"1:2 수업을 선택하면 1인당 비용을 한 번 더 절감": "Choose 1:2 classes to cut the per-person cost even further",
"월 단위 부담 없이 시작 — 무료 상담으로 맞춤 견적 제공": "Start without monthly pressure — free consultation with a personalized quote",
"매 수업 평가표를 자동으로 생성해 성장 추이를 한눈에": "Auto-generated evaluations every class show growth at a glance",
"전담 매니저의 학습 케어와 정기 상담": "Learning care and regular consultations from a dedicated manager",
"데이터 기반 진도 관리로 빠짐없는 학습": "Data-driven progress management leaves nothing out",
"모바일까지 완벽 대응 — 언제 어디서나 수업 입장": "Fully mobile-ready — join class anytime, anywhere",
"수업 연기·변경 기능으로 일정 변동에도 빠짐없이": "Postpone/change features keep you on track despite schedule changes",
"원하는 시간대 자유 예약": "Free booking at the time you want",
"CEFR 국제 기준에 맞춘 단계별 커리큘럼": "Step-by-step curriculum aligned to the international CEFR standard",
"디지털 교재 뷰어로 예습·복습이 간편": "Digital textbook viewer makes preview and review easy",
"연령·관심사 맞춤 주제로 학습 동기 부여": "Topics tailored to age and interests keep motivation high",
"여러 앱을 오갈 필요 없는 올인원 통합 플랫폼": "One integrated all-in-one platform — no juggling multiple apps",
"A.I 음성·텍스트 검색으로 원하는 기능 즉시 이동": "A.I voice/text search jumps straight to any feature",
"전체 메뉴 한눈에 보기": "See the entire menu at a glance",
"게임형 마이크로 퀴즈로 지루하지 않은 복습": "Game-style micro quizzes make review fun, never boring",
"단어장·연속 학습(스트릭)으로 꾸준한 습관 형성": "Vocabulary book and learning streaks build steady habits",
"예습 영상으로 수업 이해도 향상": "Preview videos boost class comprehension",
"수업마다 A.I 자동 평가서 생성": "A.I auto-generates an evaluation for every class",
"약점을 짚어 주는 맞춤형 복습 추천": "Personalized review recommendations that target weaknesses",
"월간 A.I 리포트로 한 달 성장 요약": "A monthly A.I report summarizes a month of growth",
"외주가 아닌 직영 운영 — 수업 품질과 비용을 직접 관리": "Directly operated, not outsourced — we control quality and cost ourselves",
"전용 인터넷·장비를 갖춘 안정적인 수업 환경": "A stable class environment with dedicated internet and equipment",
"정규직 교사의 책임 있는 전담 관리": "Responsible, dedicated care from full-time teachers",
"신생 스타트업과는 다른 20년의 운영 노하우": "20 years of operating know-how — unlike young startups",
"수많은 학생을 지도하며 다듬어 온 커리큘럼": "A curriculum refined by teaching countless students",
"실제 학부모·학생 후기로 검증된 신뢰": "Trust verified by real parent and student reviews",
"수업 출결·평가를 카카오톡으로 실시간 알림": "Real-time KakaoTalk alerts for attendance and evaluations",
"월간 A.I 리포트도 카카오톡으로 발송": "Monthly A.I reports also delivered via KakaoTalk",
"학부모와 센터 간 빠른 소통 창구": "A fast communication channel between parents and the center",
"🤖 AI 학습 친구 만나기": "🤖 Meet Your AI Learning Friend",
"📝 수업 신청하러 가기": "📝 Book a Class",
"🎤 AI 발음 코치 체험": "🎤 Try the AI Pronunciation Coach",
"💳 수강료·결제 안내": "💳 Tuition & Payment Info",
"📋 평가표 살펴보기": "📋 View Evaluations",
"📅 수업 연기·변경 보기": "📅 Postpone / Change Classes",
"📚 교육과정 보기": "📚 View Curriculum",
"🏠 전체 메뉴 열기": "🏠 Open All Menu",
"🎯 복습 퀴즈 체험": "🎯 Try a Review Quiz",
"📊 월간 AI 리포트 보기": "📊 View Monthly AI Report",
"🌟 망고아이 특장점": "🌟 Why Mangoi",
"⭐ 수강 후기 보기": "⭐ Read Reviews",
"💬 카카오톡 채널 가기": "💬 Go to KakaoTalk Channel",
"📝 마스터 클래스 디자인 — 망고아이": "📝 Master Class Design — Mangoi",
"📝 마스터 클래스 디자인": "📝 Master Class Design",
"당신의 목표를 세우고 시간을 예술처럼 디자인하세요.": "Set your goals and design your schedule like art.",
"① 시간 선택": "① Time",
"② 교사 선택": "② Teacher",
"③ 결제": "③ Payment",
"🏠 홈": "🏠 Home",
"👥 수업 형태": "👥 Class Type",
"1:1 마스터": "1:1 Master",
"그룹 토론": "Group Discussion",
"🔍 선택 방식": "🔍 Selection Mode",
"📅 날짜로 선택": "📅 By Date",
"🧑‍🏫 교사로 선택": "🧑‍🏫 By Teacher",
"🎯 주간 수업 횟수 설정": "🎯 Classes per Week",
"📅 날짜 선택 (요일 자유 이동)": "📅 Select Dates (move freely)",
"⏰ 시간 선택 (최소 20분 자동 블록 + 연속 확장)": "⏰ Select Time (20-min auto blocks, extendable)",
"⏰ 위에서 시간을 선택하세요": "⏰ Select a time above",
"➕ 장바구니에 담기": "➕ Add to Cart",
"🛒 선택된 마스터 예약 목록": "🛒 Selected Bookings",
"요일을 이동하며 일정을 장바구니에 채워보세요.": "Move between days and fill your cart with sessions.",
"완벽한 일정 디자인! 결제로 이동 ➡️": "Perfect schedule! Proceed to Payment ➡️",
"😢 이 시간에 가능한 교사가 없어요. 다른 시간을 선택해 주세요.": "😢 No teachers are available at this time. Please pick another.",
"🧑‍🏫 교사 선택 — 먼저 선생님을 고르세요": "🧑‍🏫 Choose Your Teacher First",
"🧑‍🏫 먼저 위에서 교사를 선택하세요": "🧑‍🏫 Select a teacher above first",
"🧑‍🏫 이 시간에 가능한 교사 — 누르면 바로 등록돼요": "🧑‍🏫 Teachers available at this time — tap to book",
"월": "Mon",
"화": "Tue",
"수": "Wed",
"목": "Thu",
"금": "Fri",
"토": "Sat",
"일": "Sun",
"관리자 로그인 — 망고아이": "Admin Login — Mangoi",
"역할에 맞는 데이터 범위가 자동 적용됩니다.": "Data scope is applied automatically based on your role.",
"👤 아이디": "👤 Username",
"🔑 비밀번호": "🔑 Password",
"💾 아이디 저장": "💾 Remember ID",
"🔧 비밀번호 찾기": "🔧 Forgot Password",
"✅ 로그인": "✅ Log In",
"또는 소셜 계정으로 로그인": "Or sign in with a social account",
"💬 카카오": "💬 Kakao",
"네이버": "Naver",
"구글": "Google",
"▸ 💡 시연용 데모 계정 보기": "▸ 💡 View Demo Accounts",
"문의:": "Contact:",
"· 망고아이 화상수업 운영 시스템": "· Mangoi Video Class Operating System",
"🏠 홈으로": "🏠 Home",
"👑 본사·경영진": "👑 HQ · Executives",
"🛠️ 본사·관리자": "🛠️ HQ · Admin",
"🏬 지사": "🏬 Branch",
"🤝 대리점": "🤝 Agency",
"👨‍🏫 교사": "👨‍🏫 Teacher",
"💁‍♀️ 상담직원 인사말": "💁‍♀️ Staff Greeting",
"나가기": "Exit",
"멈춤": "Pause",
"멈춤/재생": "Pause/Play",
"무음": "Mute",
"무음/소리 전환": "Toggle sound",
"🔊 소리 켜고 다시 듣기": "🔊 Listen Again with Sound",
"비밀번호 보기/숨기기": "Show/hide password"
};
  var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var PATTERNS = [
    { re:/^(\d{1,2})월$/, fn:function(m){ var i=+m[1]; return (i>=1&&i<=12)?MONTHS[i-1]:m[0]; } },
    { re:/^주 (\d+)회$/, fn:function(m){ return m[1]+'x / week'; } },
    { re:/^\((\d+)\s*\/\s*(\d+)회 완료\)$/, fn:function(m){ return '('+m[1]+' / '+m[2]+' done)'; } },
    { re:/^주 (\d+)회 일정을 장바구니에 모두 담아주세요\.(?:\s*\(현재 (\d+)회\))?$/, fn:function(m){ return 'Add all '+m[1]+' weekly sessions to your cart.'+(m[2]!==undefined?' (currently '+m[2]+')':''); } }
  ];
  var ATTRS=['placeholder','title','aria-label','alt'];
  var SKIP=/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/;
  var records=[];

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
    if(v===undefined) return null;
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
  function walk(root){
    if(!root) return;
    if(root.nodeType===3){ applyTextNode(root); return; }
    if(root.nodeType!==1 && root.nodeType!==11) return;
    if(root.nodeType===1){ if(SKIP.test(root.tagName)) return; applyEl(root); }
    var w=document.createTreeWalker(root, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT, {
      acceptNode:function(nd){
        if(nd.nodeType===1) return SKIP.test(nd.tagName)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
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
    if(isEn()) sweep();
    // 동적 노드 감시
    try{
      new MutationObserver(function(muts){
        if(!isEn()) return;
        for(var i=0;i<muts.length;i++){
          var m=muts[i];
          if(m.type==='characterData') applyTextNode(m.target);
          if(m.addedNodes) for(var j=0;j<m.addedNodes.length;j++) walk(m.addedNodes[j]);
        }
      }).observe(document.body,{childList:true,subtree:true,characterData:true});
    }catch(e){}
    // 언어 전환 감지 (<html lang> — applyLang()이 갱신)
    try{
      var last=lang();
      new MutationObserver(function(){
        var l=lang();
        if(l===last) return;
        last=l;
        if(l==='en') sweep(); else restore();
      }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    }catch(e){}
    // 다른 탭/페이지에서 언어 변경
    try{
      window.addEventListener('storage', function(ev){
        if(ev.key!=='mangoi_lang') return;
        if(ev.newValue==='en') sweep(); else restore();
      });
    }catch(e){}
    console.log('[i18n-sweep] 활성 — '+Object.keys(DICT).length+' entries, lang='+lang());
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
