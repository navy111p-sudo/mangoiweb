/* idx-vc-fastentry.js — 로그인한 학생은 «수업 입장 로비» 를 보지 않는다 (2026-08-23 사장님 지시)
   ═══════════════════════════════════════════════════════════════════════════════
   [무엇이 문제였나]
     학생 홈에서 이미 로그인했는데 «수업 입장» 을 누르면 로비(아이디·비밀번호 칸)가 한 번 더 뜬다.
     그런데 그 비밀번호는 **아무도 검사하지 않는다** — idx-main.js 의 vcJoinRoom 이
     `const vcPassword = …` 로 읽어 localStorage 에 저장만 하고 서버로 보내지 않는다.
     로그인한 학생에게는 코드가 '0000' 을 대신 채워 주기까지 한다(index.html ph59FillVcInputs 등 4곳).
     즉 이 화면은 로그인한 학생에게 **인증이 아니라 통과의례**다. 아무것도 지키지 않으면서
     수업 시작 직전 1분에 문을 하나 더 세운다. CLAUDE.md 2장 「로그인했는데 또 로그인하래요」와 같은 뿌리.

   [왜 «자동입장 코드를 새로 짜지» 않았나]
     자동입장은 이미 네 벌 있다 — idx-main.js(showView +220ms) · index.html(mangoiJoinClass +350ms) ·
     index.html(armAutoEnter) · idx-vc-room.js(armAutoEnter). 넷이 `window.__vcLobbyAutoJoined`
     하나로 서로를 막고 있다. 여기서 다섯 번째 입장 경로를 만들면 **소켓이 두 개 열려 유령
     참가자**가 된다(idx-vc-room.js 머리말이 그 사고를 그대로 적어 두었다).
     ⇒ 이 파일은 **입장을 시키지 않는다.** 이미 도는 자동입장이 끝날 때까지 «화면만 덮는다».

   [그래서 하는 일은 딱 하나]
     로비가 열리는 그 순간(0ms) 덮개를 씌우고, 결과에 따라 걷는다.
       · 수업에 들어갔다            → 덮개만 사라짐. 학생은 로비를 본 적이 없다
       · 촬영동의·입장시간 대기창    → 즉시 걷는다 (사람이 눌러야 하는 화면이므로)
       · 오늘 예약 없음·이미 종료    → 걷고 **이유를 로비에 적고 「방 코드 직접 입력」을 펴 준다**
                                      (사장님 선택 ①번 — 매니저가 방 번호를 주는 실제 운용 경로)
       · 자동입장이 아예 안 돌았다   → 1.5초 안에 조용히 걷는다 (예전과 100% 같은 로비)

   ⛔ 주의 — 새로 만질 때
     · body class 를 MutationObserver 로 지켜보지 말 것(CLAUDE.md: 홈 전체가 멎는다).
       여기서는 «덮개가 떠 있는 동안만» 도는 setInterval 을 쓴다. 상주 타이머가 아니다.
     · 덮개 z-index 는 A.i 상담사 위젯(2147483000) 바로 한 칸 위다. 그래서 촬영동의 모달(99999)과
       입장대기창(11000)은 덮개 «아래» 로 깔린다 → 그 둘이 뜨면 **반드시 덮개를 먼저 걷는다**
       (아래 wrapOnce 로 확정적으로, watch() 로 한 번 더). 이 순서를 바꾸면 「보이는데 안 눌린다」가 된다.
     · 이 파일은 defer 다. idx-main.js(849KB, blocking)에 넣으면 첫 화면 예산이 바로 빨간불이다.
     · 덮개보다 «위» 로 남겨 둔 것이 둘 있다 — #mg-fab-wrap(2147483200)·#vc-reconnect-banner(2147483646).
       일부러다. 재연결 안내가 가려지면 수업이 끊긴 걸 학생이 모른다(CLAUDE.md).
     · position:fixed 는 스크롤바 폭(≈15px)을 못 덮는다. 그걸 덮겠다고 html 에 overflow:hidden 을
       걸지 말 것 — position:sticky 가 통째로 죽는다(CLAUDE.md 「좁은 화면에서만 안 붙음」).  */
(function () {
  'use strict';

  var COVER_ID  = 'vc-fastentry-cover';
  var NOTE_ID   = 'vc-fastentry-note';
  var LOBBY_ID  = 'view-videocall-lobby';
  var ARM_MS    = 1500;    // 이 안에 자동입장이 «시작» 안 하면 덮개를 조용히 걷는다
  var MAX_MS    = 20000;   // 시작은 했는데 끝나지 않을 때의 안전망
  var ESCAPE_MS = 3000;    // 이 뒤부터 「로비 보기」 탈출 버튼을 보여 준다

  var timer = null, t0 = 0, armed = false, gaveUp = false;

  function lang() {
    try { if (typeof window.getLang === 'function') return window.getLang(); } catch (_) {}
    return 'ko';   // 🌐 판정은 반드시 getLang() — 인라인 currentLang 을 직접 읽으면 🌐 를 눌러도 안 따라온다
  }
  function lobbyActive() {
    var el = document.getElementById(LOBBY_ID);
    return !!(el && el.classList.contains('active'));
  }
  function inCall() {
    try { return document.body.classList.contains('vc-in-call'); } catch (_) { return false; }
  }
  /** 사람이 «눌러야» 하는 화면이 떴는가 — 촬영동의 모달 · 입장시간 대기창 */
  function needsHand() {
    return !!(document.getElementById('mangoi-consent-modal') || document.getElementById('vc-class-gate'));
  }

  /* 자동입장이 실제로 돌 조건 — idx-main.js 의 +220ms 블록과 «글자까지» 같게 둔다.
     한쪽만 달라지면 「덮개는 씌웠는데 입장은 안 하는」 최악의 상태가 된다. */
  function willAutoEnter() {
    try {
      if (window.__vcLobbyAutoJoined) return false;
      var raw = localStorage.getItem('mangoi_logged_user');
      if (!raw || raw === 'null' || raw === '{}') return false;
      var u = JSON.parse(raw);
      return !!(u && (u.uid || u.id) && u.name);
    } catch (_) { return false; }
  }

  function ensureStyle() {
    if (document.getElementById('vc-fastentry-css')) return;
    var s = document.createElement('style');
    s.id = 'vc-fastentry-css';
    /* ⚠️ opacity:0 으로 시작하지 않는다 — 백그라운드 탭·저전력 모드에서 transition 이 멈추면
          영영 안 보인다(CLAUDE.md 함정). 처음부터 불투명하게 그린다. */
    s.textContent =
      '#' + COVER_ID + '{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;' +
      'background:linear-gradient(180deg,#0b1024 0%,#131a35 60%,#0b1024 100%);' +
      'font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,sans-serif;color:#e2e8f0}' +
      '#' + COVER_ID + ' img{width:92px;height:92px;object-fit:contain;' +
      'filter:drop-shadow(0 8px 20px rgba(124,58,237,.45))}' +
      '#' + COVER_ID + ' .fe-ko{font-size:clamp(19px,3.4vw,26px);font-weight:800;color:#fbbf24;letter-spacing:-.5px}' +
      '#' + COVER_ID + ' .fe-en{font-size:clamp(14px,2.3vw,17px);font-weight:700;color:#cbd5e1}' +
      '#' + COVER_ID + ' .fe-dot{width:34px;height:34px;border-radius:50%;border:3px solid rgba(148,163,184,.28);' +
      'border-top-color:#7dd3fc;animation:feSpin .9s linear infinite}' +
      '@keyframes feSpin{to{transform:rotate(360deg)}}' +
      '@media(prefers-reduced-motion:reduce){#' + COVER_ID + ' .fe-dot{animation:none}}' +
      '#' + COVER_ID + ' .fe-esc{display:none;margin-top:6px;background:rgba(148,163,184,.14);color:#cbd5e1;' +
      'border:1px solid rgba(148,163,184,.3);border-radius:11px;padding:9px 18px;font-size:13px;' +
      'font-weight:700;cursor:pointer}' +
      '#' + COVER_ID + '.fe-slow .fe-esc{display:block}' +
      /* 걷은 이유를 로비에 적는 줄 — ①번(방 코드 직접 입력으로 이어 주기)의 안내문 */
      '#' + NOTE_ID + '{margin:2px 0 8px;padding:10px 12px;border-radius:10px;text-align:left;font-size:12.5px;' +
      'line-height:1.6;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.38);color:#fcd34d}' +
      '#' + NOTE_ID + ' b{color:#fde68a}';
    document.head.appendChild(s);
  }

  function showCover() {
    if (document.getElementById(COVER_ID)) return;
    ensureStyle();
    var ko = lang() !== 'en';
    var d = document.createElement('div');
    d.id = COVER_ID;
    d.setAttribute('role', 'status');
    d.setAttribute('aria-live', 'polite');
    var img = document.createElement('img');
    img.src = '/img/mango-char.png'; img.alt = 'Mr.Mango';
    img.onerror = function () { this.onerror = null; this.src = '/img/Mangoi_Character.png'; };
    var k = document.createElement('div'); k.className = 'fe-ko'; k.textContent = '🎓 수업에 들어가는 중이에요…';
    var e = document.createElement('div'); e.className = 'fe-en'; e.textContent = 'Joining your class…';
    var sp = document.createElement('div'); sp.className = 'fe-dot';
    var esc = document.createElement('button');
    esc.type = 'button'; esc.className = 'fe-esc';
    esc.textContent = ko ? '로비 화면 보기' : 'Show the lobby';
    esc.onclick = function () { hideCover(''); };
    d.appendChild(img); d.appendChild(k); d.appendChild(e); d.appendChild(sp); d.appendChild(esc);
    document.body.appendChild(d);
    // 덮개 뒤에서 환영 음성이 혼자 흘러나오지 않게 (로비 진입 +80ms 에 재생된다)
    try { if (typeof window.lobbyStopWelcome === 'function') window.lobbyStopWelcome(); } catch (_) {}
  }

  /** 덮개를 걷는다. reason 이 있으면 로비에 이유를 적고 「방 코드 직접 입력」을 펴 준다. */
  function hideCover(reason) {
    if (timer) { clearInterval(timer); timer = null; }
    unwatchHand();
    armed = false;
    var d = document.getElementById(COVER_ID);
    // ⚠️ 같은 id 가 두 벌 쌓였을 수 있다 — 전부 지운다(CLAUDE.md 「닫아도 안 사라짐」 함정)
    var all = document.querySelectorAll('#' + COVER_ID);
    for (var i = 0; i < all.length; i++) { try { all[i].remove(); } catch (_) {} }
    if (d || all.length) gaveUp = true;
    if (reason) showNote(reason);
  }

  function markSlow() {
    var d = document.getElementById(COVER_ID);
    if (d) d.classList.add('fe-slow');
  }

  /* 걷은 이유를 로비에 적는다. 🌐 한/영을 «둘 다» 보여 준다 —
     언어 설정이 어긋난 학생이나, 대신 봐 주는 필리핀 매니저가 읽지 못하면 안내가 없는 것과 같다. */
  function showNote(reason) {
    try {
      var box = document.querySelector('#' + LOBBY_ID + ' .lobby-box');
      if (!box) return;
      var old = document.getElementById(NOTE_ID);
      if (old) old.remove();
      var n = document.createElement('div');
      n.id = NOTE_ID;
      n.innerHTML =
        '<div><b>' + esc(reason.ko) + '</b></div>' +
        '<div style="color:#e2e8f0">' + esc(reason.en) + '</div>' +
        '<div style="margin-top:5px;color:#fcd34d">⚙️ 아래 <b>「방 코드 직접 입력」</b>에 매니저에게 받은 방 번호를 넣어 주세요.<br>' +
        'Enter the room code your manager gave you in <b>“Enter room code manually”</b> below.</div>';
      // 안내는 입장 버튼 «바로 위» 에 — 학생이 다음에 눌러야 할 것 옆에 붙여 둔다
      var anchor = document.getElementById('vc-join-myclass');
      if (anchor && anchor.parentNode === box) box.insertBefore(n, anchor);
      else box.appendChild(n);
      // ①번 — 방 코드 칸을 펴서 바로 보이게 한다(접혀 있으면 있는 줄도 모른다)
      var det = box.querySelector('details');
      if (det) det.open = true;
    } catch (_) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function watch() {
    if (timer) clearInterval(timer);
    t0 = Date.now();
    // ⚠️ 덮개가 떠 있는 동안만 돈다 — 상주 타이머가 아니다(홈에 머무는 학생 폰을 계속 깨우지 않는다)
    timer = setInterval(function () {
      try {
        if (!document.getElementById(COVER_ID)) { clearInterval(timer); timer = null; return; }
        if (inCall())      { hideCover(''); return; }   // ✅ 성공 — 학생은 로비를 본 적이 없다
        if (needsHand())   { hideCover(''); return; }   // 사람이 눌러야 하는 화면이 떴다
        if (!lobbyActive()){ hideCover(''); return; }   // 다른 화면으로 떠났다
        var el = Date.now() - t0;
        if (!armed && window.__vcLobbyAutoJoined) armed = true;   // 자동입장이 «시작» 했다
        if (el > ESCAPE_MS) markSlow();
        if (!armed && el > ARM_MS) { hideCover(''); return; }     // 아예 안 돌았다 → 예전 로비 그대로
        if (el > MAX_MS) {
          hideCover({ ko: '수업 연결이 오래 걸리고 있어요.',
                      en: 'Connecting to your class is taking too long.' });
        }
      } catch (_) { try { clearInterval(timer); } catch (_2) {} timer = null; }
    }, 200);
  }

  function maybeCover() {
    if (gaveUp) return;              // 이번 로비 방문에서 이미 걷었다 — 다시 덮지 않는다
    if (inCall()) return;
    if (!willAutoEnter()) return;    // 비로그인·강사 세션 → 예전과 100% 동일한 로비
    showCover();
    watchHand();
    watch();
  }

  /* ── showView 를 감싼다 (body class 감시 금지 — CLAUDE.md) ──
     덮개는 prev() «전» 에 씌운다. 그래야 로비가 한 프레임도 안 보인다. */
  function hookShowView() {
    var prev = window.showView;
    if (typeof prev !== 'function' || prev.__feWrapped) return false;
    var wrapped = function (id) {
      if (id === LOBBY_ID) { gaveUp = false; maybeCover(); }
      var r = prev.apply(this, arguments);
      if (id !== LOBBY_ID) { gaveUp = false; hideCover(''); }
      return r;
    };
    wrapped.__feWrapped = true;
    window.showView = wrapped;
    return true;
  }

  /* 사람이 눌러야 하는 화면이 «붙는 순간» 확정적으로 걷는다.
     watch() 의 200ms 폴링만 믿으면 그 사이 모달이 덮개 아래 깔려 「보이는데 안 눌린다」가 된다.

     ⛔ 「촬영동의 함수를 감싸면 되겠다」로 풀지 말 것 — 실제로 그렇게 짰다가 밟았다.
        mangoConsentEnsure 는 **모달을 안 띄우고 그냥 돌아오는 경우가 대부분**이다
        (이미 동의한 학생 = 거의 전원). 그걸 감싸면 정상 입장마다 덮개가 240ms 에 걷혀
        고치려던 로비가 그대로 다시 보인다(2026-08-23 브라우저 검사가 잡아냄).
        판정은 «함수가 불렸나» 가 아니라 **«그 상자가 화면에 붙었나»** 여야 한다.

     ⚠️ body 의 **class** 를 지켜보는 것과는 다르다 — 그건 이 저장소에서 홈 전체를 멎게 한
        전력이 있다(CLAUDE.md). 여기는 childList 만 보고, 덮개가 떠 있는 동안만 붙어 있다. */
  var mo = null;
  var HAND_IDS = { 'mangoi-consent-modal': 1, 'vc-class-gate': 1 };
  function watchHand() {
    if (mo || typeof MutationObserver !== 'function') return;
    mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var added = recs[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n && n.nodeType === 1 && HAND_IDS[n.id]) { hideCover(''); return; }
        }
      }
    });
    mo.observe(document.body, { childList: true });
  }
  function unwatchHand() {
    if (mo) { try { mo.disconnect(); } catch (_) {} mo = null; }
  }

  function wrapOnce(name) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__feWrapped) return;
    var w = function () { try { hideCover(''); } catch (_) {} return orig.apply(this, arguments); };
    w.__feWrapped = true;
    window[name] = w;
  }

  /* alert 로 막히는 경우(오늘 예약 없음·이미 종료·조회 실패)를 이유로 바꿔 준다.
     alert 는 브라우저 모달이라 덮개가 가리지는 않지만, 닫고 나면 덮개만 남은 화면이 된다. */
  function hookAlert() {
    var orig = window.alert;
    if (typeof orig !== 'function' || orig.__feWrapped) return;
    var w = function (msg) {
      try {
        if (document.getElementById(COVER_ID)) {
          var s = String(msg == null ? '' : msg);
          var head = s.split('\n')[0] || '';
          var en = (s.split('\n\n')[1] || '').split('\n')[0] || '';
          hideCover({ ko: head, en: en });
        }
      } catch (_) {}
      return orig.apply(this, arguments);
    };
    w.__feWrapped = true;
    window.alert = w;
  }

  function init() {
    hookAlert();
    wrapOnce('vcShowClassGate');   // 이건 «부르면 반드시» 대기창을 그린다 — 감싸도 안전하다
    if (!hookShowView()) {
      // showView 가 아직 없다 — 잠깐만 기다린다(최대 3초). 끝이 있는 확인이라 상주 타이머가 아니다.
      var n = 0, t = setInterval(function () {
        if (hookShowView() || ++n > 30) clearInterval(t);
      }, 100);
    }
    // 새로고침 등으로 «이미» 로비가 열린 채 시작한 경우
    if (lobbyActive()) maybeCover();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
