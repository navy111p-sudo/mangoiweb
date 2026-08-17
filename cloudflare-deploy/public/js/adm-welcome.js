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

  function L() { try { return (window.getLang && window.getLang() === 'en') ? 'en' : 'ko'; } catch (e) { return 'ko'; } }

  // ── 슬라이드(핵심 사용법) — 실제 가이드 이미지 + 짧은 설명 ──
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  // 🌐 (2026-07-23) 슬라이드 이미지도 언어를 따라간다.
  //   그동안 겉 문구만 영어로 바뀌고 **그림은 한국어 데크가 그대로** 떴다.
  //   필리핀 강사·매니저에게는 정작 읽어야 할 안내서 본문이 한국어였다.
  //   영어 데크(24장)는 이미 만들어져 있다: /guide/admin-easy-en/  (adm-s18.js 상세뷰어가 쓰는 것)
  //   ko_n / en_n = 같은 내용이 각 데크에서 몇 번째 장인지. 두 데크는 장수·순서가 다르다
  //   (KO 18장 / EN 24장 — EN 은 목차 2장 + 뒤쪽 A–Z 색인 3장이 더 있다).
  //   ⚠️ 데크를 다시 만들면 이 번호가 어긋난다. adm-s18.js 의 DECKS.titles 로 대조할 것.
  var SLIDES = [
    { n: 1,  en_n: 1,  ko_t: '망고아이 관리자 콘솔',        en_t: 'Mangoi Admin Console',
      ko_d: '학원 운영에 필요한 모든 기능이 한 화면에 모여 있어요. 아래 화살표로 넘겨 보세요.',
      en_d: 'Everything you need to run the academy, all in one place. Swipe through with the arrows below.' },
    { n: 5,  en_n: 6,  ko_t: '왼쪽 사이드바 = 모든 메뉴',    en_t: 'Left sidebar = every menu',
      ko_d: '왼쪽의 9개 그룹(평가서·알림·강사·통계·회계·학생·교육·자료실·시스템)을 누르면 원하는 기능으로 바로 이동해요.',
      en_d: 'Tap any of the 9 groups on the left (Reports, Alerts, Teachers, Stats, Finance, Students, Content, Library, System) to jump straight to a feature.' },
    { n: 15, en_n: 17, ko_t: '자주 쓰는 기능 3가지',        en_t: 'The 3 you\'ll use most',
      ko_d: '① 평가서 작성 · ② 공지/알림 보내기 · ③ 통계·KPI 확인. 이 세 가지만 익혀도 절반은 끝!',
      en_d: '① Write reports · ② Send notices/alerts · ③ Check stats & KPIs. Master these three and you\'re halfway there.' },
    { n: 16, en_n: 18, ko_t: '공지 보내보기',              en_t: 'Send your first notice',
      ko_d: '"알림 센터"에서 학부모·강사에게 공지와 카카오 알림톡을 몇 번의 클릭으로 보낼 수 있어요.',
      en_d: 'In "Alert Center" you can send notices and KakaoTalk alerts to parents and teachers in just a few clicks.' },
    { n: 17, en_n: 20, ko_t: '도움이 필요하면 ❓ 버튼',      en_t: 'Need help? The ❓ button',
      ko_d: '헷갈릴 땐 왼쪽 위 파란 "❓ 사용 방법" 버튼을 누르세요. 그림으로 된 18단계 안내가 언제든 다시 열려요.',
      en_d: 'Stuck? Tap the blue "❓ How to use" button at the top-left. The 24-page picture guide is always one click away.' }
  ];

  // 지금 언어에 맞는 슬라이드 이미지 경로. 영어 데크에 해당 장이 없으면 한국어로 폴백(빈 화면 방지).
  // 🖼 (2026-08-04) .jpg → .webp — 같은 그림인데 용량이 1/3 이다(21장 4.4MB → 1.5MB).
  //   혹시 .webp 가 없는 그림이 있어도 화면이 비지 않도록, 아래 onErrorFallback 이
  //   자동으로 원본 .jpg 로 되돌린다(원본 파일은 지우지 않고 그대로 둔다).
  function slideSrc(s) {
    if (L() === 'en' && s.en_n) return '/guide/admin-easy-en/' + pad(s.en_n) + '.webp';
    return '/guide/admin-easy/' + pad(s.n) + '.webp';
  }
  // .webp 로드 실패 → 같은 이름의 .jpg 로 한 번만 되돌린다(무한 재시도 방지)
  function onErrorFallback(el) {
    if (!el || el.__fellBack) return;
    el.__fellBack = true;
    if (typeof el.src === 'string' && /\.webp$/.test(el.src)) el.src = el.src.replace(/\.webp$/, '.jpg');
  }

  var idx = 0, root = null, built = false;

  function css() {
    if (document.getElementById('aw-style')) return;
    var s = document.createElement('style');
    s.id = 'aw-style';
    s.textContent = [
      // 📐 (2026-08-16) 화면 한가운데 대형 팝업 → **오른쪽 위 작은 패널**로.
      //   요청: "지금보다 3분의 1 크기로 오른쪽 위에". 카드 폭 640px → 360px.
      //   구석의 작은 패널에 전면 블러를 깔면 어색해서, 뒷배경 어둡기도 낮추고 blur 는 뺐다.
      // 📐 (2026-08-16, 같은 날 2차) "조금 더 크게" → 360px → **440px**(1.22배).
      //   원래(640px) 대비 넓이는 여전히 절반 이하(약 47%)라 오른쪽 위 패널 성격은 그대로다.
      //   ⚠️ 폰트·여백·버튼·화살표·점을 **전부 같은 비율로** 올려야 비례가 유지된다.
      //      폭만 키우면 글자가 작아 보이고 여백만 뜬다. 다시 조절할 땐 아래 값을 한 벌로 볼 것.
      '#aw-overlay{position:fixed;inset:0;z-index:2147483000;display:none;align-items:flex-start;justify-content:flex-end;',
      '  padding:14px;background:rgba(10,14,25,.42);',
      "  font-family:MangoiHanSC,'Malgun Gothic','Apple SD Gothic Neo',sans-serif}",
      '#aw-overlay.aw-on{display:flex;animation:awFade .22s ease}',
      '@keyframes awFade{from{opacity:0}to{opacity:1}}',
      '#aw-card{position:relative;width:100%;max-width:440px;max-height:92vh;overflow:hidden auto;border-radius:16px;',
      '  background:linear-gradient(160deg,#38bdf8 0%,#2563eb 60%,#1d4ed8 100%);color:#fff;',
      '  box-shadow:0 20px 54px -16px rgba(0,0,0,.7);animation:awPop .28s cubic-bezier(.32,.72,0,1)}',
      '@keyframes awPop{from{transform:translateY(-12px) scale(.97);opacity:0}to{transform:none;opacity:1}}',
      '#aw-top{display:flex;align-items:center;justify-content:space-between;padding:11px 12px 3px}',
      '#aw-detail{display:inline-flex;align-items:center;gap:5px;cursor:pointer;border:none;',
      '  background:rgba(255,255,255,.22);color:#fff;font-weight:800;font-size:12.5px;padding:6px 11px;border-radius:99px}',
      '#aw-detail:hover{background:rgba(255,255,255,.32)}',
      '#aw-x{cursor:pointer;border:none;background:rgba(255,255,255,.22);color:#fff;width:29px;height:29px;',
      '  border-radius:50%;font-size:15px;font-weight:900;line-height:1;display:flex;align-items:center;justify-content:center}',
      '#aw-x:hover{background:rgba(255,255,255,.34)}',
      '#aw-hero{padding:4px 18px 2px}',
      '#aw-hello{font-size:22px;font-weight:900;letter-spacing:-.5px;line-height:1.15;margin:4px 0 3px}',
      '#aw-sub{font-size:12.5px;font-weight:600;color:#e6f0ff;opacity:.95;line-height:1.45}',
      '#aw-stage{position:relative;margin:10px 12px 0;border-radius:11px;overflow:hidden;background:#0b1220;',
      '  box-shadow:0 8px 22px rgba(0,0,0,.35)}',
      '#aw-img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top center;transition:opacity .15s}',
      '.aw-nav{position:absolute;top:50%;transform:translateY(-50%);width:29px;height:29px;border-radius:50%;border:none;',
      '  cursor:pointer;background:rgba(255,255,255,.92);color:#0f172a;font-size:17px;font-weight:900;display:flex;',
      '  align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.35);z-index:2;line-height:1}',
      '.aw-nav:active{transform:translateY(-50%) scale(.9)}.aw-nav[disabled]{opacity:0;pointer-events:none}',
      '#aw-prev{left:8px}#aw-next{right:8px}',
      '#aw-caption{margin:9px 13px 0;background:rgba(255,255,255,.14);border-radius:10px;padding:10px 11px}',
      '#aw-ctitle{font-size:14px;font-weight:800;margin-bottom:3px}',
      '#aw-cdesc{font-size:12px;font-weight:600;line-height:1.55;color:#eaf2ff}',
      '#aw-dots{display:flex;gap:6px;justify-content:center;margin:10px 0 3px}',
      '.aw-dot{width:7px;height:7px;border-radius:99px;background:rgba(255,255,255,.4);cursor:pointer;transition:all .2s}',
      '.aw-dot.on{width:18px;background:#fff}',
      '#aw-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 13px 15px}',
      '#aw-again{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#dbeafe;cursor:pointer;user-select:none;margin-right:auto}',
      '#aw-again input{width:15px;height:15px;accent-color:#fff;cursor:pointer}',
      '.aw-btn{cursor:pointer;border:none;font-weight:800;font-size:12.5px;padding:9px 15px;border-radius:10px;line-height:1}',
      '#aw-more{background:rgba(255,255,255,.2);color:#fff}#aw-more:hover{background:rgba(255,255,255,.3)}',
      '#aw-start{background:#fff;color:#1d4ed8;box-shadow:0 5px 12px -5px rgba(0,0,0,.5)}#aw-start:hover{background:#f1f5ff}',
      '@media(max-width:540px){#aw-overlay{padding:10px}#aw-hello{font-size:19px}#aw-hero{padding:4px 14px 2px}',
      '  #aw-foot{padding:10px 12px 13px}#aw-again{width:100%;margin:0 0 4px}.aw-btn{flex:1}}'
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
    root.setAttribute('aria-label', '관리자 페이지 환영 안내');
    root.innerHTML = [
      '<div id="aw-card">',
      '  <div id="aw-top">',
      '    <button id="aw-detail" type="button"><span>📖</span><span data-ko="자세히 보기" data-en="See full guide">자세히 보기</span> <span aria-hidden="true">↗</span></button>',
      '    <button id="aw-x" type="button" aria-label="닫기">✕</button>',
      '  </div>',
      '  <div id="aw-hero">',
      '    <div id="aw-hello" data-ko="환영합니다! 👋" data-en="Welcome! 👋">환영합니다! 👋</div>',
      '    <div id="aw-sub" data-ko="망고아이 관리자 콘솔 사용법을 30초 만에 알려드릴게요." data-en="Here\'s how the Mangoi Admin Console works — in 30 seconds.">망고아이 관리자 콘솔 사용법을 30초 만에 알려드릴게요.</div>',
      '  </div>',
      '  <div id="aw-stage">',
      '    <button class="aw-nav" id="aw-prev" type="button" aria-label="이전">‹</button>',
      '    <img id="aw-img" src="" alt="사용법 미리보기" draggable="false">',
      '    <button class="aw-nav" id="aw-next" type="button" aria-label="다음">›</button>',
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

    // 이미지 미리 로딩 — 처음 2장만.
    //   (2026-08-04) 예전엔 여기서 18장을 «전부» 미리 받았다. 안내 이미지 폴더가 7.5MB 라
    //   첫 접속 세션마다 보지도 않을 장까지 통째로 내려받고 있었다. 필리핀 회선에서 특히 부담.
    //   다음 장 미리받기는 아래 go() 안에 이미 있으니(넘길 때 tmp = new Image()) 넘김은 그대로 매끄럽다.
    SLIDES.slice(0, 2).forEach(function (s) { var im = new Image(); im.src = slideSrc(s); });

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

    // 언어 변경 시 캡션 다시 그림
    document.addEventListener('mangoi:lang-changed', function () { paint(); });
  }

  function paint() {
    if (!root) return;
    var s = SLIDES[idx], en = (L() === 'en');
    var img = root.querySelector('#aw-img');
    var next = slideSrc(s);
    if (img.getAttribute('src') !== next) {
      img.style.opacity = '0';
      img.onerror = function () { onErrorFallback(img); img.style.opacity = '1'; };
      var tmp = new Image();
      tmp.onload = function () { img.__fellBack = false; img.src = next; img.style.opacity = '1'; };
      // .webp 를 못 받으면 원본 .jpg 로 (그림이 안 뜨는 것보다 낫다)
      tmp.onerror = function () { img.__fellBack = false; img.src = next.replace(/\.webp$/, '.jpg'); img.style.opacity = '1'; };
      tmp.src = next;
      if (tmp.complete) { img.__fellBack = false; img.src = next; img.style.opacity = '1'; }
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
    set(0);
    // 초기 언어에 맞춰 data-ko/en 텍스트 반영 (applyLang 미실행 상태 대비)
    if (L() === 'en') {
      root.querySelectorAll('[data-en]').forEach(function (el) { var t = el.getAttribute('data-en'); if (t != null) el.textContent = t; });
    }
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
