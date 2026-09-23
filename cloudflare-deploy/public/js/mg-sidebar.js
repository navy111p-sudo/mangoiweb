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
    'about':'/', 'home':'/',
    /* 🏠 «전체메뉴»는 홈에서만 도는 함수(openAllMenuOverlay)라 줄 주소가 없어 오래도록
       '/' 였다 — 눌러도 «홈으로 가기만 하고» 오버레이는 아무도 안 열었다(2026-09-14 수리).
       ⛔ '/' 로 되돌리지 말 것. 받는 쪽은 js/idx-allmenu.js 의 ?menu=all-menu 절(짝). */
    'all-menu':'/?menu=all-menu',
    'leveltest':'/level-start.html',   // 2026-09-22: 아이용 입구(카드 3장). 그 안 «선생님+로봇» 카드가 /?menu=leveltest 홈 신청 모달로 이어짐

    'admin':'/admin.html',
    'mypage':'/parent.html',
    'payment':'/?pay=1',
    'report':'/report.html',
    'points-shop':'/?shop=1',
    'speech':'/speech-coach.html',
    'lesson-change':'/lesson-postpone-demo.html',
    'refund':'/refund.html',
    'inquiry':'https://pf.kakao.com/_xlqnSxd',            // 2026-08-14 피드백 ⑤: 문의/신규상담 페이지 폐지 → 카카오 채널
    'precheck':'/precheck.html',
    'booking':'/lesson-booking-demo.html',
    'faq':'/faq.html',
    'warmup':'/warmup.html',
    'student-game':'/student-games.html',
    'review-quiz':'/review-quiz.html',
    'review-quiz-cn':'/review-quiz-cn.html',  // 🇨🇳 중국어 복습퀴즈 (2026-08-17 연결)

    /* 🤖 2026-09-12 — AI 학습 도구 7개를 홈 드로어에서 옮겨 왔다.
       그동안 이 목록에 없어서, 홈 밖 25개 화면에서는 사이드바를 열어도 이 도구들로
       갈 길이 아예 없었다(AI 글쓰기 화면에서 «AI 글쓰기»조차 안 보였다).
       ⚠️ 주소는 지어내지 말고 index.html 의 #mg-drawer 에서 그대로 가져올 것. */
    'today':'/today.html',
    'judgment':'/judgment.html',
    'ai-friend':'/ai-friend.html',
    'ai-write':'/ai-write.html',
    'micro-quiz':'/micro-quiz.html',
    'vocab':'/vocab.html'
  };

  // 🗂 [2026-07-27] 대분류 묶음 (직원 피드백 #5)
  //   그동안 아래 ITEMS 18개를 **그룹 없이 평면 나열**해서, 학부모가 "관리자"와 "학생게임"을
  //   같은 층에서 훑어야 했다. 한 번에 훑을 수 있는 한계를 넘는 개수다.
  //   ⚠️ 접기(accordion)로 만들지 않았다 — 접으면 모든 항목이 클릭 1회씩 더 든다.
  //      대분류 제목만 얹어 '어디를 보면 되는지'를 주고, 항목은 그대로 1클릭으로 둔다.
  //   ⚠️ 제목은 i18n 사전이 아니라 data-ko/data-en 으로 직접 준다(사전은 전체문자열 일치라
  //      새 문구를 넣으면 번역이 비는데, 여기서 명시하면 그 위험이 없다).
  var GROUPS = [
    { ko:'우리 아이 학습', en:'My Child',      go:['mypage','report','lesson-change'] },
    { ko:'수업',          en:'Classes',        go:['booking','precheck','warmup','leveltest'] },
    /* 2026-09-12 — 홈 드로어의 «AI 학습 도구» 차례를 그대로 따른다.
       ⛔ 웜업(warmup)은 옮기지 않았다 — 아래 «수업» 그룹에 그대로 둔다(배치 변경 최소화). */
    { ko:'학습 도구',     en:'Learning Tools', go:['today','judgment','speech','ai-friend','ai-write','review-quiz','review-quiz-cn','micro-quiz','vocab','student-game','points-shop'] },
    { ko:'결제 · 문의',   en:'Billing & Help', go:['payment','refund','inquiry','faq'] }
  ];
  // 그룹에 넣지 않고 맨 위/맨 아래에 그대로 두는 것 (성격이 달라 분류가 어색한 항목)
  var PINNED_TOP    = ['about'];
  var PINNED_BOTTOM = ['all-menu','admin'];

  // 메뉴 항목 정의 (라벨/별점/아이콘)
  var ITEMS = [
    { go:'about',       cls:'mg-hl mg-s3', ko:'망고아이란?',        en:'About Mangoi',  img:'/img/Mangoi_Character.png' },
    { go:'leveltest',   cls:'mg-hl mg-s2', ko:'🎯 레벨테스트',       en:'🎯 Level Test' },
    { go:'admin',       cls:'mg-s1',       ko:'📊 관리자',          en:'📊 Admin' },
    { go:'mypage',      cls:'',            ko:'👤 마이페이지',       en:'👤 My Page' },
    { go:'payment',     cls:'mg-hl mg-s2', ko:'💳 결제하기',         en:'💳 Payment' },
    { go:'report',      cls:'mg-s1',       ko:'📋 평가표(성적표)',    en:'📋 Report Card' },
    { go:'points-shop', cls:'',            ko:'🎁 포인트상점',       en:'🎁 Point Shop' },
    { go:'speech',      cls:'',            ko:'🎤 AI 음성코치',       en:'🎤 AI Voice Coach' },
    { go:'lesson-change',cls:'',           ko:'📅 연기/변경',        en:'📅 Postpone/Change' },
    { go:'refund',      cls:'',            ko:'💰 환불규정',         en:'💰 Refund Policy' },
    { go:'inquiry',     cls:'mg-hl mg-s2', ko:'💬 카카오 상담',      en:'💬 KakaoTalk Chat' },  // 2026-09-12 홈과 이름 통일(가는 곳은 그대로 카카오 채널)
    { go:'precheck',    cls:'mg-s1',       ko:'🎥 수업 진단',        en:'🎥 PreCheck' },
    { go:'booking',     cls:'mg-s2',       ko:'📝 수업 신청',        en:'📝 Book Class' },
    { go:'faq',         cls:'mg-hl mg-s2', ko:'❓ 자주 묻는 질문',    en:'❓ FAQ' },
    { go:'warmup',      cls:'mg-hl mg-s3', ko:'🗣️ A.i 말하기 연습',   en:'🗣️ A.i Speaking Practice' },
    { go:'student-game',cls:'mg-hl mg-s2', ko:'🎮 학생게임',         en:'🎮 Student Game' },
    { go:'review-quiz', cls:'',            ko:'🧠 복습퀴즈',         en:'🧠 Review Quiz' },
    /* 🤖 2026-09-12 추가 — 라벨·별점(cls)은 홈 드로어(index.html #mg-drawer)와 «같은 값»이어야 한다.
       한쪽만 고치면 화면마다 다른 이름이 뜬다. */
    { go:'today',       cls:'mg-hl mg-s3', ko:'📅 오늘의 A.i 학습',   en:'📅 Today\'s AI Plan' },
    { go:'judgment',    cls:'mg-hl mg-s2', ko:'🧠 판단력 훈련',       en:'🧠 Decision Training' },
    { go:'ai-friend',   cls:'',            ko:'🤖 AI 친구 대화',      en:'🤖 AI Friend Chat' },
    { go:'ai-write',    cls:'',            ko:'✍️ AI 글쓰기',         en:'✍️ AI Writing' },
    { go:'micro-quiz',  cls:'',            ko:'⚡ AI 단어 퀴즈',      en:'⚡ AI Vocab Quiz' },
    { go:'review-quiz-cn', cls:'',         ko:'🇨🇳 중국어 복습퀴즈',   en:'🇨🇳 Chinese Review Quiz' },
    { go:'vocab',       cls:'',            ko:'📖 단어장',            en:'📖 Vocabulary' },
    { go:'all-menu',    cls:'mg-s3',       ko:'🏠 전체메뉴',         en:'🏠 All Menu' }
  ];

  // ---- CSS (index.html 인라인과 동일 + hover 확대 효과) ----
  /* 🔑 배경은 «94~97% 그라디언트» — 투명 22% 로 되돌리지 말 것 (2026-08-22).
     backdrop-filter 가 안 되는 브라우저(카톡 인앱·구형 WebView·저전력)에서는 흐림이 통째로
     무시돼 얇은 색 한 겹만 남고 뒤 화면이 다 비친다. 어둡게 하는 힘은 배경에 직접 굽는다.
     ⚠️ index.html 인라인 드로어에 같은 줄이 한 벌 더 있다 — 둘 다 고쳐야 한다. */
  var css = ''
    + '#mg-drawer{position:fixed;top:0;left:0;height:100%;width:250px;max-width:80vw;background:linear-gradient(180deg,rgba(12,18,38,0.94),rgba(6,10,22,0.97));-webkit-backdrop-filter:blur(14px) saturate(135%);backdrop-filter:blur(14px) saturate(135%);box-shadow:6px 0 24px rgba(0,0,0,.3);transform:translateX(-100%);transition:transform .3s ease-in-out;z-index:100000;display:flex;flex-direction:column;font-family:MangoiHanSC,\'Noto Sans KR\',-apple-system,BlinkMacSystemFont,sans-serif;border-right:1px solid rgba(251,191,36,.25)}'
    + '#mg-drawer.open{transform:translateX(0)}'
    + '#mg-drawer-overlay{position:fixed;inset:0;background:rgba(2,6,18,.55);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;visibility:hidden;transition:opacity .3s;z-index:99999}'
    + '#mg-drawer-overlay.open{opacity:1;visibility:visible}'
    + '.mg-drawer-head{display:flex;align-items:center;justify-content:flex-start;padding:18px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)}'
    /* ⚠️ space-between 을 쓰지 않는다 — 자식이 늘거나 줄 때 라벨이 밀린다(CLAUDE.md 2장 «hover 때 글자가 움직임»).
       오른쪽 정렬은 margin-left:auto 로 한다. */
    + '.mg-head-btns{margin-left:auto;display:flex;align-items:center;gap:8px;flex-shrink:0}'
    + '.mg-drawer-lang{display:flex;align-items:center;gap:5px;height:34px;padding:0 12px;border-radius:99px;background:rgba(251,191,36,.13);border:1px solid rgba(251,191,36,.45);color:#fbbf24;font-family:inherit;font-size:12px;font-weight:800;letter-spacing:.4px;cursor:pointer;flex-shrink:0;transition:background .2s ease,border-color .2s ease}'
    + '.mg-drawer-lang:hover{background:rgba(251,191,36,.26);border-color:rgba(251,191,36,.85)}'
    + '.mg-drawer-lang:active{background:rgba(251,191,36,.34)}'
    + '.mg-drawer-logo{font-size:18px;font-weight:800;color:#fbbf24;letter-spacing:.3px}'
    + '.mg-drawer-x{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#e2e8f0;width:34px;height:34px;border-radius:50%;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform .25s ease,background .2s ease,color .2s ease,border-color .2s ease}'
    + '.mg-drawer-x:hover{background:rgba(251,191,36,.18);color:#fbbf24;border-color:rgba(251,191,36,.55);transform:rotate(90deg)}'
    + '.mg-drawer-nav{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:10px 12px;padding-bottom:24px;display:flex;flex-direction:column;gap:6px}'
    + '.mg-drawer-nav>*{flex:0 0 auto}'
    + '.mg-grp-h{margin:12px 2px 2px;padding:0 2px 5px;font-size:11px;font-weight:800;letter-spacing:.6px;color:rgba(253,230,138,.82);text-transform:none;border-bottom:1px solid rgba(251,191,36,.18)}'
    + '.mg-drawer-nav>.mg-grp-h:first-child{margin-top:2px}'
    + '.mg-drawer-nav button{text-align:left;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);color:#e2e8f0;padding:12px 14px;border-radius:11px;font-size:14px;font-weight:600;cursor:pointer;transform-origin:left center;transition:background .18s ease,transform .18s ease,box-shadow .18s ease,border-color .18s ease}'
    + '.mg-drawer-nav button:hover{background:rgba(251,191,36,.13);border-color:rgba(251,191,36,.45);transform:scale(1.045);box-shadow:0 4px 14px rgba(251,191,36,.18)}'
    + '.mg-drawer-nav button:active{background:rgba(251,191,36,.22);transform:scale(.98)}'
    + '@media (hover:none){.mg-drawer-nav button:hover{transform:none;background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.07);box-shadow:none}}'
    + '.mg-drawer-nav button.mg-s1::after,.mg-drawer-nav button.mg-s2::after,.mg-drawer-nav button.mg-s3::after{color:#fbbf24;margin-left:6px;font-size:9px;letter-spacing:1px;vertical-align:middle;text-shadow:0 1px 2px rgba(0,0,0,.4)}'
    + '.mg-drawer-nav button.mg-s1::after{content:\'\\2605\'}'
    + '.mg-drawer-nav button.mg-s2::after{content:\'\\2605\\2605\'}'
    + '.mg-drawer-nav button.mg-s3::after{content:\'\\2605\\2605\\2605\'}'
    + '#mg-drawer-tab{position:absolute;right:-46px;top:50%;transform:translateY(-50%);width:44px;height:76px;border:1.5px solid rgba(245,158,11,0.7);border-left:0;border-radius:0 16px 16px 0;background:rgba(18,12,2,0.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fbbf24;cursor:pointer;box-shadow:0 0 10px rgba(245,158,11,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:0;-webkit-tap-highlight-color:transparent;transition:background .2s ease}'
    + '#mg-drawer-tab:hover{background:rgba(35,23,4,0.72)}'
    + '.mg-burger{position:relative;width:20px;height:15px;display:block;flex-shrink:0}'
    + '.mg-burger span{position:absolute;left:0;width:100%;height:2.2px;border-radius:2px;background:linear-gradient(90deg,#fde68a,#fbbf24);box-shadow:0 0 6px rgba(251,191,36,.7);transition:transform .3s ease-in-out,opacity .2s ease,top .3s ease-in-out}'
    + '.mg-burger span:nth-child(1){top:0}'
    + '.mg-burger span:nth-child(2){top:6.25px}'
    + '.mg-burger span:nth-child(3){top:12.5px}'
    + '#mg-drawer-tab.mg-open .mg-burger span:nth-child(1){top:6.25px;transform:rotate(45deg)}'
    + '#mg-drawer-tab.mg-open .mg-burger span:nth-child(2){opacity:0;transform:scaleX(.2)}'
    + '#mg-drawer-tab.mg-open .mg-burger span:nth-child(3){top:6.25px;transform:rotate(-45deg)}'
    + '.mg-tab-cap{font-size:9px;font-weight:800;letter-spacing:1px;color:rgba(253,230,138,.95);text-shadow:0 1px 3px rgba(0,0,0,.5);line-height:1}'
    + '@keyframes mgTabFadeIn{from{opacity:0}to{opacity:1}}'
    + '@keyframes mgTabGlow{0%,100%{box-shadow:0 0 12px rgba(251,191,36,.75),0 0 26px rgba(245,158,11,.45);border-color:rgba(251,191,36,.85)}50%{box-shadow:0 0 26px rgba(255,214,90,1),0 0 52px rgba(251,191,36,.9),0 0 72px rgba(251,191,36,.5);border-color:#ffe07a}}'
    + '#mg-drawer-tab{opacity:0;animation:mgTabFadeIn .9s ease-out 1.2s forwards, mgTabGlow 2.8s ease-in-out 2.1s infinite}'
    + '@media (prefers-reduced-motion: reduce){#mg-drawer-tab{animation:none !important;opacity:1 !important;box-shadow:0 0 16px rgba(251,191,36,.85),0 0 30px rgba(251,191,36,.5) !important;border-color:rgba(251,191,36,.95) !important}}';

  /* 🌐 언어 — 이 사이드바는 «스스로» 번역한다 (2026-08-21)
     ═══════════════════════════════════════════════════════════════════
     [증상] 마이마이: 「사이드바에 영어 번역을 넣어 줄 수 있나요?」
     [실측] 번역은 **처음부터 다 있었다** — 아래 ITEMS/GROUPS 의 en: 필드가
        data-ko/data-en 으로 DOM 에 그대로 박힌다. 그런데 그걸 «적용» 하는 것은
        공용 i18n 엔진(js/mango-i18n.js)이고, inject() 끝에서 window.applyLang 을
        부를 뿐이라 **그 엔진이 없는 페이지에서는 아무 일도 안 일어난다.**
        이 사이드바를 쓰는 25개 화면 중 9개에 엔진이 없고, 하필 마이마이가 온종일 쓰는
        textbook-viewer.html · textbook-uploader.html 이 둘 다 거기에 있었다.
     📏 [잰 것 — 2026-09-13] 세는 법: `grep -rl '<script[^>]*src=...mg-sidebar.js' --include=*.html` → 25개, 그중 같은 방식으로 mango-i18n.js 가 «없는» 것 9개.
        ⛔ 주석에 적힌 파일 이름까지 세지 말 것 — 주석만 있고 <script> 는 없는
        화면이 실재한다(textbook-viewer.html). 세다가 실제로 한 번 틀렸다.
     [고침] 엔진에 기대지 않고 드로어 «안» 만 직접 번역한다. 엔진이 있으면 그대로 두고
        (중복 적용은 무해 — 같은 값을 다시 쓴다) 없으면 이 함수가 대신한다.
     ⚠️ 언어 판정은 반드시 getLang() 을 거친다(CLAUDE.md 2장 «언어 판정»).
        인라인 currentLang 을 직접 읽으면 🌐 를 눌러도 안 따라온다.
     ⚠️ 공통 키는 mangoi_lang 이다. mango_lang 은 구버전 키라 쓰지 않는다. */
  function mgLang(){
    try { return window.getLang ? window.getLang() : (localStorage.getItem('mangoi_lang') || 'ko'); }
    catch(e){ return 'ko'; }
  }
  // 공용 엔진과 «같은» 우선순위: 그 언어 → en → ko
  function mgPick(el, lang, sfx){
    var v = el.getAttribute('data-' + lang + sfx);
    if (v !== null) return v;
    if (lang !== 'en'){ v = el.getAttribute('data-en' + sfx); if (v !== null) return v; }
    if (lang !== 'ko'){ v = el.getAttribute('data-ko' + sfx); if (v !== null) return v; }
    return null;
  }
  function mgApplyLang(){
    var root = document.getElementById('mg-drawer');
    if (!root) return;
    var lg = mgLang();
    root.querySelectorAll('[data-ko],[data-en]').forEach(function(el){
      var t = mgPick(el, lg, ''); if (t !== null) el.textContent = t;
    });
    root.querySelectorAll('[data-ko-title],[data-en-title]').forEach(function(el){
      var t = mgPick(el, lg, '-title'); if (t !== null) el.title = t;
    });
    // ⚠️ querySelectorAll 은 root 자신을 포함하지 않는다 — aside 의 aria-label 을 따로 챙긴다
    [root].concat(Array.prototype.slice.call(root.querySelectorAll('[data-ko-aria],[data-en-aria]')))
      .forEach(function(el){
        var a = mgPick(el, lg, '-aria'); if (a !== null) el.setAttribute('aria-label', a);
      });
    var cap = root.querySelector('.mg-lang-cap');
    if (cap) cap.textContent = (lg === 'ko') ? 'EN' : 'KO';   // «다음» 언어를 보여 준다
  }

  // ---- 마크업 ----
  function btnHtml(it){
    if (!it) return '';
    var clsAttr = it.cls ? ' class="'+it.cls+'"' : '';
    if (it.img){
      var inner = '<img src="'+it.img+'" alt="" style="height:20px;width:20px;object-fit:contain;vertical-align:middle;margin-right:6px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))"><span data-ko="'+it.ko+'" data-en="'+it.en+'">'+it.ko+'</span>';
      return '<button'+clsAttr+' onclick="mgGo(\''+it.go+'\')">'+inner+'</button>';
    }
    return '<button'+clsAttr+' onclick="mgGo(\''+it.go+'\')" data-ko="'+it.ko+'" data-en="'+it.en+'">'+it.ko+'</button>';
  }
  function byGo(code){
    for (var i=0;i<ITEMS.length;i++){ if (ITEMS[i].go === code) return ITEMS[i]; }
    return null;
  }
  function buildNav(){
    var used = {};
    var html = PINNED_TOP.map(function(c){ used[c]=1; return btnHtml(byGo(c)); }).join('');

    html += GROUPS.map(function(g){
      var items = g.go.map(function(c){ used[c]=1; return btnHtml(byGo(c)); }).join('');
      if (!items) return '';
      return '<div class="mg-grp-h" data-ko="'+g.ko+'" data-en="'+g.en+'">'+g.ko+'</div>' + items;
    }).join('');

    // 🛟 그룹에도 PINNED 에도 없는 항목이 생기면 조용히 사라지지 않게 맨 아래로 모은다.
    //   (나중에 ITEMS 에 메뉴를 추가하고 GROUPS 등록을 잊어도 메뉴가 없어지지 않는다)
    var rest = ITEMS.filter(function(it){ return !used[it.go] && PINNED_BOTTOM.indexOf(it.go) < 0; });
    var bottom = PINNED_BOTTOM.map(function(c){ return btnHtml(byGo(c)); }).join('');
    if (rest.length || bottom){
      html += '<div class="mg-grp-h" data-ko="기타" data-en="More">기타</div>' + rest.map(btnHtml).join('') + bottom;
    }
    return html;
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
      +   '<div class="mg-head-btns">'
      +     '<button class="mg-drawer-lang" onclick="mgToggleLang()" aria-label="언어 전환" data-ko-aria="언어 전환" data-en-aria="Switch language" title="한국어 / English" data-ko-title="한국어 / English" data-en-title="Korean / English">'
      +       '<span aria-hidden="true">🌐</span><span class="lang-label-sync mg-lang-cap">EN</span>'
      +     '</button>'
      +     '<button class="mg-drawer-x" onclick="mgDrawerClose()" aria-label="닫기" data-ko-aria="닫기" data-en-aria="Close">✕</button>'
      +   '</div>'
      + '</div>'
      + '<nav class="mg-drawer-nav">' + buildNav() + '</nav>'
      + '<button id="mg-drawer-tab" onclick="mgDrawerToggle()" aria-label="메뉴 열기" data-ko-aria="메뉴 열기" data-en-aria="Open menu" aria-expanded="false" aria-controls="mg-drawer">'
      +   '<span class="mg-burger" aria-hidden="true"><span></span><span></span><span></span></span>'
      +   '<span class="mg-tab-cap" data-ko="메뉴" data-en="MENU">메뉴</span>'
      + '</button>';

    document.body.appendChild(overlay);
    document.body.appendChild(aside);

    // 언어 재적용(mango-i18n.js 로드돼 있으면 화면 전체를)
    try { if (window.applyLang) window.applyLang(); else if (window.mangoApplyI18n) window.mangoApplyI18n(); } catch(e){}
    // …그리고 엔진이 있든 없든 드로어 안은 «항상» 우리가 맞춘다(위 머리말 참고)
    try { mgApplyLang(); } catch(e){}

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
    var t=document.getElementById('mg-drawer-tab'); if(!t)return;
    t.classList.toggle('mg-open',!!open);
    t.setAttribute('aria-expanded',open?'true':'false');
    var lg='ko';
    try{ lg=window.getLang?window.getLang():(localStorage.getItem('mangoi_lang')||'ko'); }catch(e){}
    var ko=open?'메뉴 닫기':'메뉴 열기', en=open?'Close menu':'Open menu';
    t.setAttribute('data-ko-aria',ko); t.setAttribute('data-en-aria',en);
    t.setAttribute('aria-label',(lg==='ko')?ko:en);
    var c=t.querySelector('.mg-tab-cap');
    if(c){
      var cko=open?'닫기':'메뉴', cen=open?'CLOSE':'MENU';
      c.setAttribute('data-ko',cko); c.setAttribute('data-en',cen);
      c.textContent=(lg==='ko')?cko:cen;
    }
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
  /* 🌐 언어 전환 — 엔진이 있으면 그쪽에 맡기고, 없으면 사이드바가 스스로 한다.
     ⛔ 엔진이 있는 페이지에서 우리가 직접 localStorage 를 건드리면 화면 본문과 사이드바의
        언어가 갈린다(엔진의 currentLang 은 그대로이므로). 반드시 위임이 먼저다. */
  window.mgToggleLang = function(){
    var delegated = false;
    try {
      if (typeof window.toggleLang === 'function'){ window.toggleLang(); delegated = true; }
    } catch(e){ delegated = false; }

    if (!delegated){
      // 공용 엔진이 없는 화면(교재 뷰어·업로더 등) — 여기서만 우리가 직접 바꾼다
      var next = (mgLang() === 'ko') ? 'en' : 'ko';
      try { localStorage.setItem('mangoi_lang', next); } catch(e){}
      try { document.documentElement.lang = next; } catch(e){}
      try { window.dispatchEvent(new CustomEvent('mangoi:lang-changed', { detail:{ lang: next } })); } catch(e){}
    }

    try { mgApplyLang(); } catch(e){}
    var d = document.getElementById('mg-drawer');
    try { mgSetLabel(!!(d && d.classList.contains('open'))); } catch(e){}
  };

  /* 화면 어딘가의 🌐 로 언어가 바뀌면 사이드바도 따라간다.
     (엔진이 setLang 끝에서 이 이벤트를 쏜다 — CLAUDE.md 2장 «JS 로 그린 라벨») */
  window.addEventListener('mangoi:lang-changed', function(){
    try { mgApplyLang(); } catch(e){}
  });

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
