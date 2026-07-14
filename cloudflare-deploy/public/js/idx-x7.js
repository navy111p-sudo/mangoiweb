// ═══════════════════════════════════════════════════════════════
// idx-x7.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  // ═══ faq-v2 (2026-06-12) — KO/EN 이중언어. c/q/a=한국어, ce/qe/ae=영어 ═══
  var DATA=[
   {c:'레벨테스트',ce:'Level Test',
    q:'레벨테스트를 꼭 받아야 하나요?',
    qe:'Do I have to take a level test?',
    a:'레벨테스트는 실제 수업에 앞서 현재 영어 실력과 약점을 파악하여, 가장 알맞은 과정을 추천해 드리기 위한 무료 테스트입니다. 실력 향상을 위해 꼭 받아보시길 권장하지만, 테스트 없이 바로 수강 신청으로 과정을 선택하실 수도 있습니다.\n※ 신청 방법: 홈 화면의 [수업 진단] 또는 [신규상담]에서 무료로 신청하실 수 있습니다.',
    ae:'The level test is a free assessment that checks your current English level and weak points before classes begin, so we can recommend the course that fits you best. We highly recommend it, but you may also skip it and enroll directly in the course you want.\n※ How to apply: free of charge via [PreCheck] or [New Inquiry] on the home screen.'},
   {c:'레벨테스트',ce:'Level Test',
    q:'레벨 테스트 수업을 결석했어요. 다시 받을 수 있을까요?',
    qe:'I missed my level test. Can I take it again?',
    a:'네, 가능합니다. 화면 오른쪽 아래의 카카오상담 또는 [신규상담]으로 재신청을 요청해 주시면 일정을 다시 잡아드립니다.\n레벨테스트는 알맞은 과정을 고르기 위한 가이드라인일 뿐이니, 성적이 낮게 나와도 실망하지 않으셔도 됩니다.',
    ae:'Yes. Request a retake via KakaoTalk chat (bottom-right button) or [New Inquiry] and we will gladly reschedule it.\nThe level test is just a guideline for choosing the right course, so do not worry if your score seems low.'},
   {c:'수강문의',ce:'Enrollment',
    q:'수강을 하고 싶어요. 수강절차가 어떻게 되나요?',
    qe:'How do I enroll in classes?',
    a:'홈 화면의 [수업 신청]에서 원하는 강사의 성별·성향을 필터링하여 강사와 수업 시간을 선택한 뒤 결제하시면 됩니다.\n결제 후에는 [마이페이지]에서 수업 일정을 확인하고 강의실에 입장하실 수 있습니다.',
    ae:'Open [Book Class] on the home screen, filter teachers by gender and style, choose your teacher and class time, then complete payment.\nAfter payment, check your schedule and enter the classroom from [My Page].'},
   {c:'수강문의',ce:'Enrollment',
    q:'화상영어를 수강하려면 무엇이 필요한가요?',
    qe:'What do I need for video classes?',
    a:'인터넷이 연결된 PC·노트북·태블릿·스마트폰과 화상카메라(웹캠), 헤드셋(또는 마이크)이 필요합니다. 헤드셋은 필수이며, 화상카메라는 강사와 학생 간의 유대감 형성을 위해 준비를 권장합니다.\n별도 프로그램 설치 없이 브라우저에서 바로 수업이 진행되며, [수업 진단]에서 장비를 미리 점검하실 수 있습니다.',
    ae:'You need a PC, laptop, tablet or smartphone with internet, plus a webcam and a headset (or microphone). A headset is essential; a webcam is recommended to build rapport with your teacher.\nClasses run right in your browser — no installation needed — and you can test your devices in [PreCheck].'},
   {c:'수강문의',ce:'Enrollment',
    q:'수업시간이 어떻게 되나요?',
    qe:'What are the class hours?',
    a:'평일 월~금 주 5일, 오후 2시부터 11시까지 수업이 진행됩니다. (주말·오전 수업은 준비 중입니다.)\n화상영어 수업시간은 보통 20분이며, 개인 수업은 20분/40분으로 정해지고 단체 수업은 10분 단위로 추가되기도 합니다.',
    ae:'Classes run Monday to Friday, 2 PM to 11 PM. (Weekend and morning classes are coming soon.)\nA typical class is 20 minutes; private lessons are 20 or 40 minutes, and group lessons can be extended in 10-minute units.'},
   {c:'수업진행',ce:'Classes',
    q:'화상 수업 시 강사님이 입장하지 않았어요.',
    qe:'My teacher did not show up for class.',
    a:'강사님이 수업을 조금 늦게 시작하거나, 현지 사정(태풍·정전, 병결 등)으로 수업 연결이 되지 않는 경우가 간혹 있습니다.\n화면 오른쪽 아래의 카카오상담이나 [신규상담]으로 알려주시면 센터에 확인하여 보강 수업을 등록해 드리고, 사유에 대한 상담 전화를 드립니다.',
    ae:'Occasionally a teacher starts late, or local issues (typhoon, power outage, sick leave) prevent the connection.\nLet us know via KakaoTalk chat (bottom-right button) or [New Inquiry] — we will confirm with the center, register a make-up class, and follow up with you.'},
   {c:'수업진행',ce:'Classes',
    q:'연기신청은 어떻게 하나요?',
    qe:'How do I postpone a class?',
    a:'홈 화면 또는 사이드바의 [연기/변경] 메뉴에서 직접 신청하시거나, 수업 시작 30분 전까지 카카오상담으로 요청하실 수 있습니다.\n연기 횟수는 수강 횟수의 1/2까지 가능합니다. (예: 주 1회 수강 시 월 최대 2회, 주 3회 시 월 최대 6회)',
    ae:'Use the [Postpone/Change] menu on the home screen or sidebar, or request via KakaoTalk chat up to 30 minutes before class.\nYou can postpone up to half of your enrolled classes. (e.g., a once-a-week course: up to 2 per month; three times a week: up to 6.)'},
   {c:'수업진행',ce:'Classes',
    q:'결석처리는 어떻게 되나요?',
    qe:'How are absences handled?',
    a:'수업시간 동안 입장하지 않으시면 결석 처리되며, 수강생 과실로 인한 결석은 별도의 보강이 제공되지 않습니다.\n수강생 사정으로 수업 시작이 늦어진 경우에는 수업시간을 채우지 못했더라도 예정된 종료시간에 수업이 종료됩니다. (다음 예약 학생 수업 보호를 위해 불가피합니다.)',
    ae:'If you do not enter the classroom during class time, it is marked as an absence, and no make-up class is provided for absences caused by the student.\nIf you join late, the class still ends at the scheduled time. (This is unavoidable to protect the next student’s lesson.)'},
   {c:'수업진행',ce:'Classes',
    q:'사이트 장애나 문제로 수업을 못 할 경우에는 어떻게 되나요?',
    qe:'What happens if a site error stops my class?',
    a:'시스템 문제로 수업을 못 한 경우에는 연기 처리되어 보강이나 연기로 수업을 받게 됩니다. 학습의 지속성을 위해 연기보다는 보강으로 잡으시는 것을 추천드립니다.',
    ae:'If a system problem stops your class, it is postponed and you will receive a make-up or rescheduled class. We recommend a make-up class to keep your learning on track.'},
   {c:'수업진행',ce:'Classes',
    q:'공휴일이나 휴원일은 어디서 확인하나요?',
    qe:'Where can I check holidays and days off?',
    a:'홈페이지의 캘린더에서 공휴일·휴원 일정을 확인하실 수 있습니다. 휴일에는 수업이 진행되지 않으며, 보강이나 연기는 [연기/변경] 메뉴를 이용해 주세요.',
    ae:'Check the calendar on the homepage for public holidays and academy closures. There are no classes on holidays; use the [Postpone/Change] menu for make-ups or rescheduling.'},
   {c:'수업진행',ce:'Classes',
    q:'로그인이 안 될 때는 어떻게 해야 하나요?',
    qe:'What should I do if I cannot log in?',
    a:'아이디와 비밀번호가 맞는지 한 번 더 확인해 주세요. 그래도 안 되면 아래 방법을 시도해 주세요.\n① Ctrl + F5 (강력 새로고침)\n② 브라우저 캐시·쿠키 삭제 후 재접속\n③ 다른 브라우저(크롬 권장)로 접속\n모두 시도해도 안 되면 화면 오른쪽 아래의 카카오상담으로 문의해 주세요.',
    ae:'Double-check your ID and password. If it still fails, try the following:\n① Ctrl + F5 (hard refresh)\n② Clear your browser cache and cookies, then reconnect\n③ Try another browser (Chrome recommended)\nIf nothing works, contact us via KakaoTalk chat (bottom-right button).'},
   {c:'수업진행',ce:'Classes',
    q:'교사의 소리나 화면이 잘 들리거나 보이지 않을 경우에는 어떻게 되나요?',
    qe:'What if I cannot hear or see the teacher?',
    a:'화면 오른쪽 아래의 카카오상담으로 연락 주시면 원인을 파악하여 친절하게 안내해 드립니다. 수업이 제대로 진행되지 않은 경우 연기 처리하여 원하시는 다른 시간에 보강을 진행합니다.\n[수업 진단] 메뉴에서 카메라·마이크 상태를 미리 점검할 수 있으며, 필요 시 원격지원으로 컴퓨터 점검도 도와드립니다.',
    ae:'Contact us via KakaoTalk chat (bottom-right button) and we will find the cause and guide you through it. If the class could not proceed properly, it is postponed and a make-up class is arranged at a time you prefer.\nYou can also test your camera and microphone in [PreCheck], and we offer remote PC checkups if needed.'},
   {c:'스케줄',ce:'Schedule',
    q:'수업시간을 변경할 수 있나요?',
    qe:'Can I change my class time?',
    a:'네, 가능합니다. [연기/변경] 메뉴에서 교사 또는 수업 시간 중 선택하여 변경할 수 있습니다. 수업 시간을 변경하면 담당강사가 바뀔 수 있으니 신청 시 유의해 주세요.\n수업 시간 변경은 월 전체 수업 횟수의 1/2까지 가능합니다.',
    ae:'Yes. In the [Postpone/Change] menu you can change either the teacher or the class time. Note that changing the time may change your assigned teacher.\nTime changes are allowed for up to half of your monthly classes.'},
   {c:'스케줄',ce:'Schedule',
    q:'담당강사 변경이 가능한가요?',
    qe:'Can I change my teacher?',
    a:'네, 카카오상담 또는 [신규상담]을 통해 변경 신청이 가능합니다. 당일 수업 1일 전까지, 월 1회 변경하실 수 있습니다. (단, 강사의 불성실로 인한 교체는 제한 횟수에 포함되지 않습니다.)',
    ae:'Yes — request a change via KakaoTalk chat or [New Inquiry]. Changes are accepted up to 1 day before class, once per month. (Replacements due to teacher negligence do not count toward the limit.)'},
   {c:'부가서비스',ce:'Services',
    q:'수업 녹화(레슨 비디오)는 어떻게 보나요?',
    qe:'How do I watch class recordings?',
    a:'로그인 후 [마이페이지]에서 수업 녹화 영상을 확인하실 수 있습니다. 수업 전이나 후에 언제든지 다시 보며 복습하실 수 있습니다.',
    ae:'After logging in, you can watch your class recordings in [My Page] — anytime before or after class, as often as you like.'},
   {c:'부가서비스',ce:'Services',
    q:'복습 퀴즈는 어떻게 푸나요?',
    qe:'How do I take review quizzes?',
    a:'매 수업이 끝나면 A.I가 수업 내용을 바탕으로 맞춤 복습 퀴즈를 자동 생성합니다. 로그인 후 [마이페이지]에서 퀴즈를 풀고 결과표도 확인하실 수 있습니다.',
    ae:'After every class, our A.I automatically creates a personalized review quiz based on the lesson. Log in and take it in [My Page], where you can also check your results.'},
   {c:'AI·학습',ce:'AI Learning',
    q:'A.I 학습 기능은 어떤 것들이 있나요?',
    qe:'What A.I learning features are there?',
    a:'망고아이는 원어민 선생님의 수업과 A.I 학습관리가 함께 갑니다. 매 수업이 끝나면 A.I가 평가서와 맞춤 복습 퀴즈를 자동 생성하고, [단계별 발음]에서 A.I 발음 교정 연습을 할 수 있습니다.\n홈 화면의 AI 검색창에 궁금한 것을 입력하면 원하는 메뉴로 바로 안내해 드립니다.',
    ae:'At Mangoi, native teachers teach and A.I manages your learning. After every class, A.I generates an evaluation report and a personalized review quiz, and you can practice pronunciation with A.I in [Curriculum Pronunciation].\nType anything into the AI search bar on the home screen and it will take you straight to the right menu.'},
   {c:'AI·학습',ce:'AI Learning',
    q:'수업 진단(PreCheck)은 무엇인가요?',
    qe:'What is PreCheck (class diagnosis)?',
    a:'수업 전에 카메라·마이크·인터넷 상태와 수업 환경을 미리 점검하는 무료 서비스입니다. 홈 화면의 [수업 진단]에서 이용하실 수 있으며, 무료 레벨테스트 신청도 함께 하실 수 있습니다.',
    ae:'A free service that checks your camera, microphone, internet and class environment before lessons. Find it under [PreCheck] on the home screen — you can also request a free level test there.'},
   {c:'포인트',ce:'Points',
    q:'포인트는 어떻게 모으고 어디에 쓰나요?',
    qe:'How do I earn and spend points?',
    a:'출석, 복습 퀴즈 등 학습 활동을 통해 포인트가 적립됩니다. 모은 포인트는 홈 화면의 [포인트상점]에서 다양한 상품으로 교환하실 수 있습니다.',
    ae:'You earn points through learning activities such as attendance and review quizzes. Spend them on various rewards in the [Point Shop] on the home screen.'},
   {c:'강사',ce:'Teachers',
    q:'강사님들은 어느 나라 사람들인가요?',
    qe:'Where are the teachers from?',
    a:'필리핀 현지 교육센터에서 근무하는 필리핀(또는 미국계 혼혈) 강사님과, 재택근무로 진행되는 북미(미국·캐나다) 원어민 강사님으로 구성되어 있습니다. 무료 레벨테스트를 통해 직접 수업 품질을 확인해 보세요.',
    ae:'Our teachers are Filipino (or Filipino-American) instructors working at our education center in the Philippines, plus North American (US/Canada) native teachers working remotely. Try a free level test and see the quality for yourself.'},
   {c:'강사',ce:'Teachers',
    q:'강사님에게 전달하고 싶은 얘기가 있는데 말하기 능력이 부족합니다.',
    qe:'I want to tell my teacher something, but my English is not good enough.',
    a:'[마이페이지]의 요청사항에 남겨주시면 강사님이 확인합니다.\n영작이 어려우시면 [신규상담]이나 카카오상담에 한글로 남겨주세요. 센터로 전달해 드리겠습니다.',
    ae:'Leave a note in the request field of [My Page] and your teacher will see it.\nIf writing in English is difficult, send it in Korean via [New Inquiry] or KakaoTalk chat — we will pass it on to the center.'},
   {c:'단체수강',ce:'Group',
    q:'학원에서 단체로 수강하려고 합니다.',
    qe:'Our academy wants to enroll as a group.',
    a:'학원에서 단체 수강을 원하시는 경우 010-5893-0509로 연락 주시면 친절하게 안내해 드리겠습니다.',
    ae:'For group enrollment, please call 010-5893-0509 and we will gladly walk you through everything.'},
   {c:'이벤트',ce:'Events',
    q:'이벤트 참여는 아무나 할 수 있는 건가요?',
    qe:'Can anyone join the events?',
    a:'네, 그렇습니다. 홈페이지에서 회원가입을 하신 모든 회원님은 이벤트에 참여하실 수 있습니다.',
    ae:'Yes! Every member who has signed up on our website can participate in events.'},
   {c:'입금/환불',ce:'Refunds',
    q:'환불규정은 어떻게 되나요?',
    qe:'What is the refund policy?',
    a:'환불은 교육청 환불규정 및 관련 법령에 의거하여 수업 진행 정도에 따라 아래 기준으로 처리됩니다.',
    ae:'Refunds follow the Office of Education regulations and applicable laws, based on how much of the course has been completed, as shown below.',
    html:'<table style="width:100%;border-collapse:collapse;margin:10px 0 8px;font-size:12.5px"><tr style="background:rgba(251,191,36,0.16)"><th style="padding:7px 8px;text-align:left;border:1px solid rgba(148,163,184,0.22)">환불 요구 시기</th><th style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">환불 금액</th></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">수업 시작 전</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#fbbf24;font-weight:700">100%</td></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">총 수업시간의 1/3 이전</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#fbbf24;font-weight:700">70%</td></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">총 수업시간의 1/2 이전</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#fbbf24;font-weight:700">50%</td></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">총 수업시간의 1/2 이후</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#ef4444;font-weight:700">0%</td></tr></table><div style="font-size:12px;color:#a3b3d1;line-height:1.65">• 할인가로 결제한 수업은 환불 시 <b style="color:#fde68a">할인 전 정상가</b>로 재정산되어 차감됩니다.<br>• 연기신청 없이 빠진 수업은 결석으로 간주되어 수업료에 반영됩니다.<br>• 레벨테스트·체험수업은 무료입니다(단, 2년 이내 휴식 후 재시작 시 유료).</div><a href="/refund.html" style="display:inline-block;margin-top:9px;color:#fbbf24;font-weight:800;text-decoration:none;font-size:12.5px">📄 환불규정 전체 보기 →</a>',
    htmle:'<table style="width:100%;border-collapse:collapse;margin:10px 0 8px;font-size:12.5px"><tr style="background:rgba(251,191,36,0.16)"><th style="padding:7px 8px;text-align:left;border:1px solid rgba(148,163,184,0.22)">Time of request</th><th style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">Refund</th></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">Before classes begin</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#fbbf24;font-weight:700">100%</td></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">Before 1/3 of total hours</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#fbbf24;font-weight:700">70%</td></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">Before 1/2 of total hours</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#fbbf24;font-weight:700">50%</td></tr><tr><td style="padding:7px 8px;border:1px solid rgba(148,163,184,0.22)">After 1/2 of total hours</td><td style="padding:7px 8px;text-align:center;border:1px solid rgba(148,163,184,0.22);color:#ef4444;font-weight:700">0%</td></tr></table><div style="font-size:12px;color:#a3b3d1;line-height:1.65">• Discounted lessons are re-calculated at the <b style="color:#fde68a">full (non-discounted) price</b> upon refund.<br>• Lessons missed without a postponement request count as absences and are charged.<br>• Level test &amp; trial lesson are free (charged if you resume within 2 years after a break).</div><a href="/refund.html" style="display:inline-block;margin-top:9px;color:#fbbf24;font-weight:800;text-decoration:none;font-size:12.5px">📄 See full Refund Policy →</a>'}
  ];

  // ═══ UI 문자열 (KO/EN) ═══
  var L={
    ko:{ title:'❓ 자주 묻는 질문', sub:'망고아이 화상영어 FAQ — 궁금한 점을 빠르게 확인하세요',
         ph:'🔍 궁금한 내용을 검색해 보세요 (예: 환불, 연기, 레벨테스트)', all:'전체',
         empty:'검색 결과가 없습니다. 다른 키워드로 검색해 보세요.',
         foot1:'💬 <b>카카오상담</b> — 화면 오른쪽 아래 상담 버튼', foot2:'운영 10:00~20:00 (주말·공휴일 휴무)', foot3:'수업 14:00~23:00',
         close:'닫기', dialog:'자주 묻는 질문', search:'FAQ 검색' },
    en:{ title:'❓ FAQ', sub:'Mangoi Video English FAQ — find answers fast',
         ph:'🔍 Search the FAQ (e.g., refund, postpone, level test)', all:'All',
         empty:'No results found. Try a different keyword.',
         foot1:'💬 <b>KakaoTalk chat</b> — button at bottom right', foot2:'Support 10:00–20:00 (closed weekends/holidays)', foot3:'Classes 14:00–23:00',
         close:'Close', dialog:'Frequently Asked Questions', search:'Search FAQ' }
  };
  function lang(){ try{ return (window.getLang && window.getLang()==='en') ? 'en' : 'ko'; }catch(_){ return 'ko'; } }
  function T(){ return L[lang()]; }

  var cats=[]; // 표준 키 = 한국어 카테고리
  var CE={};   // 한국어 → 영어 카테고리 라벨
  DATA.forEach(function(d){ if(cats.indexOf(d.c)<0) cats.push(d.c); CE[d.c]=d.ce; });
  var curCat='*', curQ='';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function catLabel(c){ return c==='*' ? T().all : (lang()==='en' ? (CE[c]||c) : c); }

  function build(){
    var ov=document.createElement('div'); ov.id='mg-faq-ov';
    ov.innerHTML=
      '<div class="mg-faq-panel" role="dialog" aria-modal="true">'+
        '<div class="mg-faq-head"><div><h2></h2><div class="mg-faq-sub"></div></div>'+
        '<button class="mg-faq-x">✕</button></div>'+
        '<div class="mg-faq-tools"><input class="mg-faq-search" type="text"></div>'+
        '<div class="mg-faq-cats"></div>'+
        '<div class="mg-faq-list"></div>'+
        '<div class="mg-faq-foot"><span class="f1"></span><span class="f2"></span><span class="f3"></span></div>'+
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('.mg-faq-search').addEventListener('input',function(){ curQ=this.value.trim(); renderList(ov); });
    ov.querySelector('.mg-faq-x').onclick=close;
    ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
    document.addEventListener('keydown',function(e){ if(e.key==='Escape' && ov.classList.contains('open')) close(); });
    renderAll(ov);
    return ov;
  }

  function renderAll(ov){
    var t=T();
    ov.querySelector('.mg-faq-panel').setAttribute('aria-label',t.dialog);
    ov.querySelector('h2').textContent=t.title;
    ov.querySelector('.mg-faq-sub').textContent=t.sub;
    var inp=ov.querySelector('.mg-faq-search'); inp.placeholder=t.ph; inp.setAttribute('aria-label',t.search);
    ov.querySelector('.mg-faq-x').setAttribute('aria-label',t.close);
    ov.querySelector('.mg-faq-foot .f1').innerHTML=t.foot1;
    ov.querySelector('.mg-faq-foot .f2').textContent=t.foot2;
    ov.querySelector('.mg-faq-foot .f3').textContent=t.foot3;
    var catBox=ov.querySelector('.mg-faq-cats'); catBox.innerHTML='';
    ['*'].concat(cats).forEach(function(c){
      var b=document.createElement('button'); b.type='button';
      b.className='mg-faq-cat'+(c===curCat?' on':''); b.textContent=catLabel(c);
      b.onclick=function(){ curCat=c; catBox.querySelectorAll('.mg-faq-cat').forEach(function(x,i){ x.classList.toggle('on', (i===0?'*':cats[i-1])===c); }); renderList(ov); };
      catBox.appendChild(b);
    });
    renderList(ov);
  }

  function renderList(ov){
    var list=ov.querySelector('.mg-faq-list'); list.innerHTML='';
    var en=(lang()==='en'), q=curQ.toLowerCase(), t=T();
    var shown=DATA.filter(function(d){
      if(curCat!=='*' && d.c!==curCat) return false;
      if(q && (d.q+d.a+d.qe+d.ae).toLowerCase().indexOf(q)<0) return false;
      return true;
    });
    if(!shown.length){ list.innerHTML='<div class="mg-faq-empty"><img src="/img/mango-char.png" alt="" style="height:2.2em;width:auto;vertical-align:middle;margin-right:.3em">'+esc(t.empty)+'</div>'; return; }
    shown.forEach(function(d){
      var it=document.createElement('div'); it.className='mg-faq-item';
      it.innerHTML='<button type="button" class="mg-faq-q"><span class="qb">Q</span><span class="qc">'+esc(en?(CE[d.c]||d.c):d.c)+'</span><span>'+esc(en?d.qe:d.q)+'</span><span class="arr">▼</span></button>'+
                   '<div class="mg-faq-a">'+esc(en?d.ae:d.a)+(en?(d.htmle||''):(d.html||''))+'</div>';
      it.querySelector('.mg-faq-q').onclick=function(){
        var was=it.classList.contains('open');
        list.querySelectorAll('.mg-faq-item.open').forEach(function(x){x.classList.remove('open');});
        if(!was) it.classList.add('open');
      };
      list.appendChild(it);
    });
  }

  window.openFaqOverlay=function(){
    var existing=document.getElementById('mg-faq-ov');
    if(existing && existing.classList.contains('open')){ close(); return; }
    var ov=existing||build();
    renderAll(ov); // 열 때마다 현재 언어로 갱신
    ov.classList.add('open');
    try{ var s=ov.querySelector('.mg-faq-search'); if(s && window.innerWidth>700) s.focus(); }catch(_){}
  };
  function close(){ var ov=document.getElementById('mg-faq-ov'); if(ov) ov.classList.remove('open'); }

  // 언어 토글(<html lang>) 감지 → 열려 있으면 즉시 갱신
  try{
    new MutationObserver(function(){
      var ov=document.getElementById('mg-faq-ov');
      if(ov) renderAll(ov);
    }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  }catch(_){}

  // capture-phase 보조 핸들러 — 다른 글로벌 핸들러(stopPropagation) 간섭 대비 (v22 전체메뉴 패턴)
  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest&&e.target.closest('#mg-faq-btn');
    if(!b) return;
    e.preventDefault(); e.stopPropagation();
    try{ if(window.mgDrawerClose) window.mgDrawerClose(); }catch(_){}
    window.openFaqOverlay();
  },true);
  console.log('[faq-v2] FAQ 오버레이 활성 (KO/EN, '+DATA.length+'문항)');
})();
