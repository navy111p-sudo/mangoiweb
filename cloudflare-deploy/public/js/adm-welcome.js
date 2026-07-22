// ═══════════════════════════════════════════════════════════════
// adm-welcome.js — 관리자 페이지 환영/사용법 안내 모달 (NCP 스타일)
//   · 처음 접속 시 자동 팝업 (다시 보지 않기 체크 시 영구 숨김)
//   · 미니 캐러셀로 핵심 사용법 소개 → "자세히 보기"는 기존 18장 뷰어(openAdminGuide)로 연결
//   · 자체 완결형: CSS + DOM 을 스스로 주입. admin.html 은 <script> 한 줄만 추가.
//   · 언어: data-ko/data-en 규약 사용 + window.getLang() 로 초기 언어 결정.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  var HIDE_KEY = 'mangoi_admin_welcome_v1_hide';   // 영구 숨김(다시 보지 않기)
  var SEEN_KEY = 'mangoi_admin_welcome_v1_seen';    // 세션당 1회 (세션스토리지)

  // 🌐 언어 판정 — getLang 하나만 믿지 않는다.
  //   adm-core.js 가 window.getLang 을 정의하지만 defer 라 순서가 밀릴 수 있고,
  //   그때 'ko' 로 굳으면 영문 계정 화면에 한국어 모달이 뜬다(실제로 그랬다).
  //   adm-lang-boot 이 head 에서 미리 넣는 값들까지 순서대로 본다.
  //   ⚠️ '어느 하나라도 en 이면 en' 으로 짜면 안 된다. 그러면 최신 값이 ko 여도
  //      뒤쪽의 낡은 값(예: 아직 안 바뀐 <html lang="en">) 때문에 영어로 굳는다.
  //      우선순위대로 보되, 확정된 답(ko/en)을 주는 첫 소스가 이긴다.
  function ok(v) { return (v === 'en' || v === 'ko') ? v : null; }
  function L() {
    var v;
    try { if (window.getLang) { v = ok(window.getLang()); if (v) return v; } } catch (e) {}
    try { v = ok(window.adminLang);                       if (v) return v; } catch (e) {}
    try { v = ok(document.documentElement.lang);           if (v) return v; } catch (e) {}
    try { v = ok(localStorage.getItem('mangoi_lang'));     if (v) return v; } catch (e) {}
    try { v = ok(window.__ADM_BOOT_LANG);                  if (v) return v; } catch (e) {}
    return 'ko';
  }

  // 🖼 슬라이드 이미지는 '그림 안에 한국어가 박힌' 캡처다. 코드로 번역할 수 없으므로
  //    영어일 때는 영어판 덱을 쓴다. (전체 가이드 뷰어 adm-s18.js 도 같은 규칙)
  function DIR() { return L() === 'en' ? '/guide/admin-easy-en/' : '/guide/admin-easy/'; }

  // ── 슬라이드(핵심 사용법) — 실제 가이드 이미지 + 짧은 설명 ──
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var SLIDES = [
    { n: 1,  ko_t: '망고아이 관리자 콘솔',        en_t: 'Mangoi Admin Console',
      ko_d: '학원 운영에 필요한 모든 기능이 한 화면에 모여 있어요. 아래 화살표로 넘겨 보세요.',
      en_d: 'Everything you need to run the academy, all in one place. Swipe through with the arrows below.' },
    { n: 5,  ko_t: '왼쪽 사이드바 = 모든 메뉴',    en_t: 'Left sidebar = every menu',
      ko_d: '왼쪽의 9개 그룹(평가서·알림·강사·통계·회계·학생·교육·자료실·시스템)을 누르면 원하는 기능으로 바로 이동해요.',
      en_d: 'Tap any of the 9 groups on the left (Reports, Alerts, Teachers, Stats, Finance, Students, Content, Library, System) to jump straight to a feature.' },
    { n: 15, ko_t: '자주 쓰는 기능 3가지',        en_t: 'The 3 you\'ll use most',
      ko_d: '① 평가서 작성 · ② 공지/알림 보내기 · ③ 통계·KPI 확인. 이 세 가지만 익혀도 절반은 끝!',
      en_d: '① Write reports · ② Send notices/alerts · ③ Check stats & KPIs. Master these three and you\'re halfway there.' },
    { n: 16, ko_t: '공지 보내보기',              en_t: 'Send your first notice',
      ko_d: '"알림 센터"에서 학부모·강사에게 공지와 카카오 알림톡을 몇 번의 클릭으로 보낼 수 있어요.',
      en_d: 'In "Alert Center" you can send notices and KakaoTalk alerts to parents and teachers in just a few clicks.' },
    { n: 17, ko_t: '도움이 필요하면 ❓ 버튼',      en_t: 'Need help? The ❓ button',
      ko_d: '헷갈릴 땐 왼쪽 위 파란 "❓ 사용 방법" 버튼을 누르세요. 그림으로 된 18단계 안내가 언제든 다시 열려요.',
      en_d: 'Stuck? Tap the blue "❓ How to use" button at the top-left. The 18-step picture guide is always one click away.' }
  ];

  var idx = 0, root = null, built = false;

  function css() {
    if (document.getElementById('aw-style')) return;
    var s = document.createElement('style');
    s.id = 'aw-style';
    s.textContent = [
      '#aw-overlay{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;',
      '  padding:16px;background:rgba(10,14,25,.66);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
      "  font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif}",
      '#aw-overlay.aw-on{display:flex;animation:awFade .22s ease}',
      '@keyframes awFade{from{opacity:0}to{opacity:1}}',
      '#aw-card{position:relative;width:100%;max-width:640px;max-height:92vh;overflow:hidden auto;border-radius:22px;',
      '  background:linear-gradient(160deg,#38bdf8 0%,#2563eb 60%,#1d4ed8 100%);color:#fff;',
      '  box-shadow:0 30px 80px -20px rgba(0,0,0,.7);animation:awPop .28s cubic-bezier(.32,.72,0,1)}',
      '@keyframes awPop{from{transform:translateY(18px) scale(.97);opacity:0}to{transform:none;opacity:1}}',
      '#aw-top{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 4px}',
      '#aw-detail{display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:none;',
      '  background:rgba(255,255,255,.22);color:#fff;font-weight:800;font-size:13px;padding:8px 14px;border-radius:99px}',
      '#aw-detail:hover{background:rgba(255,255,255,.32)}',
      '#aw-x{cursor:pointer;border:none;background:rgba(255,255,255,.22);color:#fff;width:34px;height:34px;',
      '  border-radius:50%;font-size:17px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center}',
      '#aw-x:hover{background:rgba(255,255,255,.34)}',
      '#aw-hero{padding:6px 26px 2px}',
      '#aw-hello{font-size:30px;font-weight:900;letter-spacing:-.5px;line-height:1.15;margin:6px 0 4px}',
      '#aw-sub{font-size:13.5px;font-weight:600;color:#e6f0ff;opacity:.95;line-height:1.5}',
      '#aw-stage{position:relative;margin:14px 18px 0;border-radius:14px;overflow:hidden;background:#0b1220;',
      '  box-shadow:0 10px 30px rgba(0,0,0,.35)}',
      '#aw-img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top center;transition:opacity .15s}',
      '.aw-nav{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;border:none;',
      '  cursor:pointer;background:rgba(255,255,255,.92);color:#0f172a;font-size:22px;font-weight:900;display:flex;',
      '  align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.35);z-index:2;line-height:1}',
      '.aw-nav:active{transform:translateY(-50%) scale(.9)}.aw-nav[disabled]{opacity:0;pointer-events:none}',
      '#aw-prev{left:10px}#aw-next{right:10px}',
      '#aw-caption{margin:12px 20px 0;background:rgba(255,255,255,.14);border-radius:12px;padding:12px 14px}',
      '#aw-ctitle{font-size:15px;font-weight:800;margin-bottom:4px}',
      '#aw-cdesc{font-size:13px;font-weight:600;line-height:1.6;color:#eaf2ff}',
      '#aw-dots{display:flex;gap:7px;justify-content:center;margin:14px 0 4px}',
      '.aw-dot{width:8px;height:8px;border-radius:99px;background:rgba(255,255,255,.4);cursor:pointer;transition:all .2s}',
      '.aw-dot.on{width:22px;background:#fff}',
      '#aw-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 20px 20px}',
      '#aw-again{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:#dbeafe;cursor:pointer;user-select:none;margin-right:auto}',
      '#aw-again input{width:16px;height:16px;accent-color:#fff;cursor:pointer}',
      '.aw-btn{cursor:pointer;border:none;font-weight:800;font-size:13.5px;padding:11px 20px;border-radius:12px;line-height:1}',
      '#aw-more{background:rgba(255,255,255,.2);color:#fff}#aw-more:hover{background:rgba(255,255,255,.3)}',
      '#aw-start{background:#fff;color:#1d4ed8;box-shadow:0 6px 16px -6px rgba(0,0,0,.5)}#aw-start:hover{background:#f1f5ff}',
      '@media(max-width:540px){#aw-hello{font-size:24px}#aw-hero{padding:6px 20px 2px}',
      '  #aw-foot{padding:12px 16px 18px}#aw-again{width:100%;margin:0 0 4px}.aw-btn{flex:1}}'
    ].join('');
    document.head.appendChild(s);
  }

  function build() {
    if (built) return; built = true;
    css();
    root = document.createElement('div');
    root.id = 'aw-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('data-ko-aria', '관리자 페이지 환영 안내');
    root.setAttribute('data-en-aria', 'Admin page welcome guide');
    root.innerHTML = [
      '<div id="aw-card">',
      '  <div id="aw-top">',
      '    <button id="aw-detail" type="button"><span>📖</span><span data-ko="자세히 보기" data-en="See full guide">자세히 보기</span> <span aria-hidden="true">↗</span></button>',
      '    <button id="aw-x" type="button" data-ko-aria="닫기" data-en-aria="Close">✕</button>',
      '  </div>',
      '  <div id="aw-hero">',
      '    <div id="aw-hello" data-ko="환영합니다! 👋" data-en="Welcome! 👋">환영합니다! 👋</div>',
      '    <div id="aw-sub" data-ko="망고아이 관리자 콘솔 사용법을 30초 만에 알려드릴게요." data-en="Here\'s how the Mangoi Admin Console works — in 30 seconds.">망고아이 관리자 콘솔 사용법을 30초 만에 알려드릴게요.</div>',
      '  </div>',
      '  <div id="aw-stage">',
      '    <button class="aw-nav" id="aw-prev" type="button" data-ko-aria="이전" data-en-aria="Previous">‹</button>',
      '    <img id="aw-img" src="" data-ko-alt="사용법 미리보기" data-en-alt="Guide preview" draggable="false">',
      '    <button class="aw-nav" id="aw-next" type="button" data-ko-aria="다음" data-en-aria="Next">›</button>',
      '  </div>',
      '  <div id="aw-caption">',
      '    <div id="aw-ctitle"></div>',
      '    <div id="aw-cdesc"></div>',
      '  </div>',
      '  <div id="aw-dots"></div>',
      '  <div id="aw-foot">',
      '    <label id="aw-again"><input type="checkbox" id="aw-again-cb"><span data-ko="다시 보지 않기" data-en="Don\'t show again">다시 보지 않기</span></label>',
      '    <button class="aw-btn" id="aw-more" type="button" data-ko="📖 전체 사용법" data-en="📖 Full guide">📖 전체 사용법</button>',
      '    <button class="aw-btn" id="aw-start" type="button" data-ko="시작하기" data-en="Get started">시작하기</button>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(root);

    // 점(dots) 생성
    var dots = root.querySelector('#aw-dots');
    SLIDES.forEach(function (_, k) {
      var d = document.createElement('span');
      d.className = 'aw-dot'; d.setAttribute('data-i', k);
      d.addEventListener('click', function () { set(k); });
      dots.appendChild(d);
    });

    // 이미지 미리 로딩
    SLIDES.forEach(function (s) { var im = new Image(); im.src = DIR() + pad(s.n) + '.jpg'; });

    root.querySelector('#aw-prev').addEventListener('click', function () { go(-1); });
    root.querySelector('#aw-next').addEventListener('click', function () { go(1); });
    root.querySelector('#aw-x').addEventListener('click', close);
    root.querySelector('#aw-start').addEventListener('click', close);
    root.querySelector('#aw-detail').addEventListener('click', openDetail);
    root.querySelector('#aw-more').addEventListener('click', openDetail);
    root.querySelector('#aw-again-cb').addEventListener('change', function () {
      try { localStorage.setItem(HIDE_KEY, this.checked ? '1' : '0'); } catch (e) {}
    });
    // 배경 클릭으로 닫기
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    // 키보드
    document.addEventListener('keydown', function (e) {
      if (!root || !root.classList.contains('aw-on')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    // 스와이프
    var sx = 0, sy = 0, mv = false, stage = root.querySelector('#aw-stage');
    stage.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; mv = false; }, { passive: true });
    stage.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) mv = true; }, { passive: true });
    stage.addEventListener('touchend', function (e) { var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (mv && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1); }, { passive: true });

    // 언어 변경 시 — 캡션뿐 아니라 버튼·라벨·슬라이드 이미지(한/영 덱)까지 전부 다시 반영
    document.addEventListener('mangoi:lang-changed', function () { applyLangTexts(); paint(); });
  }

  // 🌐 모달 안의 모든 언어 의존 텍스트를 한 번에 반영한다.
  //   ⚠️ 예전에는 open() 에서 '영어로 바꾸는' 코드만 있고 '한국어로 되돌리는' 코드가 없었다.
  //      그래서 영어로 한 번 열면 언어를 한국어로 바꿔도 영어 문구가 그대로 남았다.
  //      여기서 양방향을 모두 처리한다.
  function applyLangTexts() {
    if (!root) return;
    var en = (L() === 'en');
    var pick = function (el, a) { var v = el.getAttribute(en ? ('data-en' + a) : ('data-ko' + a)); return v; };

    root.querySelectorAll('[data-ko],[data-en]').forEach(function (el) {
      var t = pick(el, '');
      if (t != null) el.textContent = t;
    });
    root.querySelectorAll('[data-ko-aria],[data-en-aria]').forEach(function (el) {
      var t = pick(el, '-aria');
      if (t != null) el.setAttribute('aria-label', t);
    });
    root.querySelectorAll('[data-ko-alt],[data-en-alt]').forEach(function (el) {
      var t = pick(el, '-alt');
      if (t != null) el.setAttribute('alt', t);
    });
    var ra = root.getAttribute(en ? 'data-en-aria' : 'data-ko-aria');
    if (ra) root.setAttribute('aria-label', ra);
  }

  function paint() {
    if (!root) return;
    var s = SLIDES[idx], en = (L() === 'en');
    var img = root.querySelector('#aw-img');
    var next = DIR() + pad(s.n) + '.jpg';
    if (img.getAttribute('src') !== next) {
      img.style.opacity = '0';
      var tmp = new Image();
      tmp.onload = function () { img.src = next; img.style.opacity = '1'; };
      tmp.src = next;
      if (tmp.complete) { img.src = next; img.style.opacity = '1'; }
    }
    root.querySelector('#aw-ctitle').textContent = en ? s.en_t : s.ko_t;
    root.querySelector('#aw-cdesc').textContent = en ? s.en_d : s.ko_d;
    root.querySelector('#aw-prev').disabled = (idx === 0);
    root.querySelector('#aw-next').disabled = (idx === SLIDES.length - 1);
    root.querySelectorAll('.aw-dot').forEach(function (d, k) { d.classList.toggle('on', k === idx); });
  }
  function set(n) { idx = Math.max(0, Math.min(SLIDES.length - 1, n)); paint(); }
  function go(d) { set(idx + d); }

  function open() {
    build();
    root.classList.add('aw-on');
    document.documentElement.style.overflow = 'hidden';
    applyLangTexts();   // i18n-sweep 실행 여부와 무관하게 직접 반영
    set(0);
    try { var cb = root.querySelector('#aw-again-cb'); if (cb) cb.checked = false; } catch (e) {}
  }
  function close() {
    if (!root) return;
    root.classList.remove('aw-on');
    document.documentElement.style.overflow = '';
  }
  function openDetail() {
    close();
    if (window.openAdminGuide) window.openAdminGuide();
  }

  // 외부에서 다시 열 수 있게 노출 (사이드바 ❓ 버튼 등에서 재사용 가능)
  window.openAdminWelcome = open;
  window.closeAdminWelcome = close;

  // ── 최초 접속 자동 표시 ──
  function maybeAutoShow() {
    var hide = false, seen = false;
    try { hide = localStorage.getItem(HIDE_KEY) === '1'; } catch (e) {}
    try { seen = sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) {}
    if (hide || seen) return;
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {}
    // 다른 인트로/팝업과 겹치지 않게 살짝 지연
    setTimeout(open, 900);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAutoShow);
  } else {
    maybeAutoShow();
  }
})();
