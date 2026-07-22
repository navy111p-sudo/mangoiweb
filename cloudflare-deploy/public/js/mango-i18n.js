/**
 * 🌐 Mangoi Shared i18n System (v2 — 5 languages: KO → EN → ZH → JA → VI)
 *   - data-ko / data-en / data-zh / data-ja / data-vi 속성으로 textContent 전환
 *   - data-{lang}-placeholder / -ph / -title / -aria 도 동일 fallback
 *   - 누락 시 EN 으로 fallback (그 다음 KO)
 *   - localStorage.mangoi_lang 으로 영속화
 *   - window.applyI18n(root) 으로 동적 컨텐츠에도 적용 가능
 *
 * 사용법: <head> 에 <script src="/js/mango-i18n.js" defer></script> 로드
 *        토글 버튼: <button onclick="toggleLang()">🌐 EN</button>
 *        동적 렌더 후: window.applyI18n(modalElement); 호출
 */
(function(){
  'use strict';
  // admin.html 은 자체 toggleAdminLang() 시스템을 가지고 있어서 충돌 방지 — 비활성화
  if (typeof window.toggleAdminLang === 'function' || document.getElementById('admin-lang-label')) {
    window.toggleLang = function(){ try { window.toggleAdminLang(); } catch(e){} };
    window.setLang = function(){ try { window.toggleAdminLang(); } catch(e){} };
    window.getLang = function(){ return (typeof window.adminLang !== 'undefined') ? window.adminLang : 'ko'; };
    window.applyI18n = function(){};
    return;
  }

  // ━━━━ 지원 언어 + 순환 순서 ━━━━
  var LANG_CYCLE = ['ko', 'en'];           // 한국어·영어만 순환 (중국어·일본어·베트남어 제외)
  var LANG_LABEL = { ko:'KO', en:'EN' };
  // 토글 버튼은 "다음" 언어를 표시 (현재 KO 면 → 다음 EN 표시)
  function nextLangOf(l){ var i = LANG_CYCLE.indexOf(l); return LANG_CYCLE[(i + 1) % LANG_CYCLE.length]; }

  var currentLang = 'ko';
  try {
    var saved = localStorage.getItem('mangoi_lang');
    if (saved && LANG_CYCLE.indexOf(saved) >= 0) currentLang = saved;
  } catch(e){}

  // ━━━━ 핵심: 한 element 에서 특정 lang 의 텍스트를 꺼낸다 (fallback: en → ko) ━━━━
  function pickAttr(el, lang, suffix) {
    // suffix: '' / '-placeholder' / '-ph' / '-title' / '-aria'
    var v = el.getAttribute('data-' + lang + suffix);
    if (v !== null && v !== undefined) return v;
    if (lang !== 'en') {
      v = el.getAttribute('data-en' + suffix);
      if (v !== null && v !== undefined) return v;
    }
    if (lang !== 'ko') {
      v = el.getAttribute('data-ko' + suffix);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }

  // ━━━━ 핵심 적용 함수 ━━━━
  function applyI18n(root) {
    root = root || document;

    // textContent 전환 (data-ko 가 anchor — 다른 lang 은 없을 수 있음)
    root.querySelectorAll('[data-ko], [data-en]').forEach(function(el){
      var txt = pickAttr(el, currentLang, '');
      if (txt !== null) el.textContent = txt;
    });

    // placeholder (-ph)
    root.querySelectorAll('[data-ko-ph], [data-en-ph]').forEach(function(el){
      var ph = pickAttr(el, currentLang, '-ph');
      if (ph !== null) el.placeholder = ph;
    });

    // placeholder (-placeholder)
    root.querySelectorAll('[data-ko-placeholder], [data-en-placeholder]').forEach(function(el){
      var ph = pickAttr(el, currentLang, '-placeholder');
      if (ph !== null) el.placeholder = ph;
    });

    // title 속성
    root.querySelectorAll('[data-ko-title], [data-en-title]').forEach(function(el){
      var t = pickAttr(el, currentLang, '-title');
      if (t !== null) el.title = t;
    });

    // aria-label
    root.querySelectorAll('[data-ko-aria], [data-en-aria]').forEach(function(el){
      var a = pickAttr(el, currentLang, '-aria');
      if (a !== null) el.setAttribute('aria-label', a);
    });

    // <html lang> 동기화
    try { document.documentElement.lang = currentLang; } catch(e){}

    // 토글 라벨 동기화 (다음 언어 표시)
    var nextLabel = LANG_LABEL[nextLangOf(currentLang)];
    root.querySelectorAll('.lang-label-sync, #lang-label, [data-lang-label]').forEach(function(el){
      el.textContent = nextLabel;
    });

    // ━━━━ 30개 공용 어휘 즉시 번역 (data-i18n-key="home" 같은 element 가 있으면) ━━━━
    try {
      root.querySelectorAll('[data-i18n-key]').forEach(function(el){
        var k = el.getAttribute('data-i18n-key');
        if (k && DICT[k] && DICT[k][currentLang]) el.textContent = DICT[k][currentLang];
      });
    } catch(e) {}
  }

  // ━━━━ 30+ 공용 어휘 (ZH/JA/VI 즉시 번역용) ━━━━
  //   사용: <span data-i18n-key="home">홈</span>
  //   data-ko/data-en 도 같이 있으면 그게 우선 (textContent 전환 후 덮어쓰기 차순)
  var DICT = {
    home:        { ko:'홈',         en:'Home',         zh:'首页',       ja:'ホーム',      vi:'Trang chủ' },
    login:       { ko:'로그인',     en:'Login',        zh:'登录',       ja:'ログイン',    vi:'Đăng nhập' },
    logout:      { ko:'로그아웃',   en:'Logout',       zh:'退出登录',   ja:'ログアウト',  vi:'Đăng xuất' },
    mypage:      { ko:'마이페이지', en:'My Page',      zh:'我的',       ja:'マイページ',  vi:'Trang của tôi' },
    settings:    { ko:'설정',       en:'Settings',     zh:'设置',       ja:'設定',        vi:'Cài đặt' },
    video:       { ko:'비디오',     en:'Video',        zh:'视频',       ja:'動画',        vi:'Video' },
    video_lesson:{ ko:'비디오 레슨', en:'Video Lessons', zh:'视频课程',   ja:'ビデオレッスン', vi:'Bài học video' },
    vocab:       { ko:'단어장',     en:'Vocabulary',   zh:'单词本',     ja:'単語帳',      vi:'Từ vựng' },
    point:       { ko:'포인트',     en:'Points',       zh:'积分',       ja:'ポイント',    vi:'Điểm' },
    attendance:  { ko:'출석',       en:'Attendance',   zh:'出勤',       ja:'出席',        vi:'Điểm danh' },
    ranking:     { ko:'랭킹',       en:'Ranking',      zh:'排名',       ja:'ランキング',  vi:'Xếp hạng' },
    goal:        { ko:'학습 목표', en:'Learning Goal', zh:'学习目标',   ja:'学習目標',    vi:'Mục tiêu học tập' },
    parent:      { ko:'학부모',     en:'Parent',       zh:'家长',       ja:'保護者',      vi:'Phụ huynh' },
    student:     { ko:'학생',       en:'Student',      zh:'学生',       ja:'生徒',        vi:'Học sinh' },
    teacher:     { ko:'강사',       en:'Teacher',      zh:'老师',       ja:'先生',        vi:'Giáo viên' },
    admin:       { ko:'관리자',     en:'Admin',        zh:'管理员',     ja:'管理者',      vi:'Quản trị' },
    class:       { ko:'수업',       en:'Class',        zh:'课程',       ja:'授業',        vi:'Lớp học' },
    schedule:    { ko:'일정',       en:'Schedule',     zh:'日程',       ja:'スケジュール', vi:'Lịch trình' },
    chat:        { ko:'채팅',       en:'Chat',         zh:'聊天',       ja:'チャット',    vi:'Trò chuyện' },
    notice:      { ko:'공지',       en:'Notice',       zh:'通知',       ja:'お知らせ',    vi:'Thông báo' },
    help:        { ko:'도움말',     en:'Help',         zh:'帮助',       ja:'ヘルプ',      vi:'Trợ giúp' },
    save:        { ko:'저장',       en:'Save',         zh:'保存',       ja:'保存',        vi:'Lưu' },
    cancel:      { ko:'취소',       en:'Cancel',       zh:'取消',       ja:'キャンセル',  vi:'Hủy' },
    confirm:     { ko:'확인',       en:'Confirm',      zh:'确认',       ja:'確認',        vi:'Xác nhận' },
    submit:      { ko:'제출',       en:'Submit',       zh:'提交',       ja:'送信',        vi:'Gửi' },
    next:        { ko:'다음',       en:'Next',         zh:'下一步',     ja:'次へ',        vi:'Tiếp theo' },
    prev:        { ko:'이전',       en:'Previous',     zh:'上一步',     ja:'前へ',        vi:'Trước' },
    search:      { ko:'검색',       en:'Search',       zh:'搜索',       ja:'検索',        vi:'Tìm kiếm' },
    loading:     { ko:'불러오는 중', en:'Loading',     zh:'加载中',     ja:'読み込み中',  vi:'Đang tải' },
    welcome:     { ko:'환영합니다', en:'Welcome',      zh:'欢迎',       ja:'ようこそ',    vi:'Chào mừng' },
    family:      { ko:'가족',       en:'Family',       zh:'家庭',       ja:'家族',        vi:'Gia đình' },
    dictionary:  { ko:'사전',       en:'Dictionary',   zh:'词典',       ja:'辞書',        vi:'Từ điển' },
    subtitle:    { ko:'자막',       en:'Subtitles',    zh:'字幕',       ja:'字幕',        vi:'Phụ đề' },
  };

  // 외부에서 즉시 사전 조회용 헬퍼
  window.mangoiI18nT = function(key) {
    var entry = DICT[key];
    if (!entry) return key;
    return entry[currentLang] || entry.en || entry.ko || key;
  };

  // ━━━━ 외부 노출 ━━━━
  window.applyI18n = applyI18n;
  window.getLang = function(){ return currentLang; };
  // 🌐 (2026-07-23) by === 'user' 면 "사람이 직접 고른 선택"으로 기록한다.
  //   adm-lang-boot.js 가 계정 자동판정(영문 이름·강사 → 영어)보다 이 기록을 **항상 우선**하므로,
  //   한국인 강사가 KO 를 한 번 누르면 다음 로그인·다른 페이지에서도 한국어로 뜬다.
  //   이 표시가 없으면 자동판정이 매번 영어로 되돌려 놓아 "아무리 눌러도 영어로 돌아온다"가 된다.
  //   ⚠️ 코드가 자동으로 부르는 setLang(예: 마이페이지 강사 기본 영어)은 by 를 넘기지 말 것.
  window.setLang = function(l, by){
    if (LANG_CYCLE.indexOf(l) < 0) return;
    currentLang = l;
    try { localStorage.setItem('mangoi_lang', l); } catch(e){}
    if (by === 'user') { try { localStorage.setItem('mangoi_lang_by', 'user'); } catch(e){} }
    applyI18n();
    window.dispatchEvent(new CustomEvent('mangoi:lang-changed', { detail: { lang: l } }));
  };
  window.toggleLang = function(){
    window.setLang(nextLangOf(currentLang), 'user');
  };

  // ━━━━ 우측 상단 [🏠 Home] + [🌐 EN] 두 버튼 한 쌍 자동 inject ━━━━
  function injectGlobalToggle() {
    if (document.getElementById('mangoi-global-bar')) return;
    if (document.getElementById('admin-lang-label')) return;
    if (document.querySelector('[data-mangoi-lang-toggle]')) return;
    var noBarMeta = document.querySelector('meta[name="mangoi-no-global-bar"]');
    if (noBarMeta) return;

    var isHome = location.pathname === '/' || location.pathname === '/index.html';

    var isMobile = window.innerWidth <= 480;
    var baseTop = isMobile ? '8px' : '14px';
    var baseRight = isMobile ? '8px' : '14px';
    var pad = isMobile ? '6px 11px' : '8px 14px';
    var fs = isMobile ? '11.5px' : '12.5px';

    var bar = document.createElement('div');
    bar.id = 'mangoi-global-bar';
    bar.style.cssText = [
      'position:fixed', 'top:' + baseTop, 'right:' + baseRight, 'z-index:99999',
      'display:flex', 'gap:8px', 'align-items:center',
      'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif',
    ].join(';');

    if (!isHome && !document.getElementById('lang-toggle')) {
      var home = document.createElement('a');
      home.id = 'mangoi-global-home';
      home.href = '/';
      var homeLabel = (DICT.home && DICT.home[currentLang]) || (currentLang === 'ko' ? '홈' : 'Home');
      home.innerHTML = '<span style="font-size:13px;line-height:1">🏠</span> <span class="mangoi-home-label" data-i18n-key="home" data-ko="홈" data-en="Home" data-zh="首页" data-ja="ホーム" data-vi="Trang chủ">' + homeLabel + '</span>';
      home.style.cssText = [
        'padding:' + pad, 'background:rgba(20,33,59,0.92)', 'color:#fbbf24',
        'border:1px solid rgba(251,191,36,0.50)', 'border-radius:99px',
        'text-decoration:none', 'font-size:' + fs, 'font-weight:800',
        'cursor:pointer', 'box-shadow:0 6px 18px -2px rgba(0,0,0,0.4)',
        'display:inline-flex', 'align-items:center', 'gap:6px',
        'transition:all .15s', 'user-select:none', 'backdrop-filter:blur(8px)',
        '-webkit-tap-highlight-color:transparent',
      ].join(';');
      home.onmouseenter = function(){ home.style.background = 'rgba(251,191,36,0.22)'; home.style.transform = 'translateY(-1px)'; };
      home.onmouseleave = function(){ home.style.background = 'rgba(20,33,59,0.92)'; home.style.transform = 'none'; };
      bar.appendChild(home);
    }

    if (!document.getElementById('lang-toggle')) {
      var btn = document.createElement('button');
      btn.id = 'mangoi-global-lang-toggle';
      btn.type = 'button';
      var nextL = nextLangOf(currentLang);
      btn.title = 'Switch language (' + LANG_LABEL[currentLang] + ' → ' + LANG_LABEL[nextL] + ')';
      btn.innerHTML = '<span style="font-size:13px;line-height:1">🌐</span> <span class="lang-label-sync" style="font-weight:800;letter-spacing:0.5px">' + LANG_LABEL[nextL] + '</span>';
      btn.style.cssText = [
        'padding:' + pad, 'background:linear-gradient(135deg,#fbbf24,#f59e0b)',
        'color:#1a1a1a', 'border:none', 'border-radius:99px',
        'font-family:inherit', 'font-size:' + fs, 'font-weight:800',
        'cursor:pointer', 'box-shadow:0 6px 18px -2px rgba(245,158,11,0.45)',
        'display:inline-flex', 'align-items:center', 'gap:6px',
        'transition:all .15s', 'user-select:none',
        '-webkit-tap-highlight-color:transparent',
      ].join(';');
      btn.onmouseenter = function(){ btn.style.transform = 'translateY(-1px)'; btn.style.filter = 'brightness(1.05)'; };
      btn.onmouseleave = function(){ btn.style.transform = 'none'; btn.style.filter = 'none'; };
      btn.onclick = function(){ window.toggleLang(); };
      bar.appendChild(btn);
    }

    document.body.appendChild(bar);

    var existingHome = document.querySelector('a.home-btn');
    if (existingHome && existingHome !== bar.querySelector('#mangoi-global-home')) {
      existingHome.style.display = 'none';
    }
  }

  // ━━━━ 글로벌 바 버튼 추가 API ━━━━
  window.mangoiAddBarButton = function(opts) {
    opts = opts || {};
    var bar = document.getElementById('mangoi-global-bar');
    if (!bar) {
      setTimeout(function(){ window.mangoiAddBarButton(opts); }, 100);
      return null;
    }
    var existing = opts.id ? document.getElementById(opts.id) : null;
    if (existing) {
      if (opts.text !== undefined) existing.innerHTML = opts.text;
      if (opts.onclick) existing.onclick = opts.onclick;
      return existing;
    }
    var isMobile = window.innerWidth <= 480;
    var btn = document.createElement('button');
    if (opts.id) btn.id = opts.id;
    btn.type = 'button';
    btn.innerHTML = opts.text || '';
    if (opts.title) btn.title = opts.title;
    btn.style.cssText = [
      'padding:' + (isMobile ? '6px 11px' : '8px 14px'),
      'background:rgba(20,33,59,0.92)',
      'color:' + (opts.color || '#e6ecff'),
      'border:1px solid ' + (opts.borderColor || 'rgba(251,191,36,0.35)'),
      'border-radius:99px',
      'font-family:inherit',
      'font-size:' + (isMobile ? '11.5px' : '12.5px'),
      'font-weight:700',
      'cursor:pointer',
      'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
      'display:inline-flex', 'align-items:center', 'gap:6px',
      'transition:all .15s', 'user-select:none',
      'backdrop-filter:blur(8px)',
      '-webkit-tap-highlight-color:transparent',
    ].join(';');
    btn.onmouseenter = function(){ btn.style.transform = 'translateY(-1px)'; btn.style.filter = 'brightness(1.1)'; };
    btn.onmouseleave = function(){ btn.style.transform = 'none'; btn.style.filter = 'none'; };
    if (opts.onclick) btn.onclick = opts.onclick;
    bar.insertBefore(btn, bar.firstChild);
    return btn;
  };

  // ━━━━ 페이지 로드 후 즉시 적용 ━━━━
  function init() {
    applyI18n();
    injectGlobalToggle();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ━━━━ MutationObserver — 동적 컨텐츠 자동 번역 ━━━━
  try {
    var pendingNodes = [];
    var pendingTimer = null;
    var observer = new MutationObserver(function(mutations){
      var found = false;
      for (var i = 0; i < mutations.length; i++) {
        var mut = mutations[i];
        if (mut.type === 'childList' && mut.addedNodes.length > 0) {
          for (var j = 0; j < mut.addedNodes.length; j++) {
            var node = mut.addedNodes[j];
            if (node.nodeType === 1 /* ELEMENT_NODE */) {
              if (node.hasAttribute && (node.hasAttribute('data-ko') || node.hasAttribute('data-en') || node.hasAttribute('data-ko-placeholder') || node.hasAttribute('data-ko-title') || node.hasAttribute('data-i18n-key'))) {
                pendingNodes.push(node); found = true;
              } else if (node.querySelector && node.querySelector('[data-ko],[data-en],[data-ko-placeholder],[data-ko-title],[data-i18n-key]')) {
                pendingNodes.push(node); found = true;
              }
            }
          }
        }
      }
      if (found) {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function(){
          var nodes = pendingNodes.splice(0, pendingNodes.length);
          nodes.forEach(function(n){ applyI18n(n); });
          pendingTimer = null;
        }, 30);
      }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch(e) {
    console.warn('[mango-i18n] MutationObserver fail:', e);
  }
})();
