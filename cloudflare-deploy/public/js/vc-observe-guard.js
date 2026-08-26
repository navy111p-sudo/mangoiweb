/* ============================================================
   vc-observe-guard.js — 참관(Ghost) 안전장치 + «직접 입장» 카메라 끄기
   (2026-08-20 · 필리핀 매니저 제보 「참관 중인 사람 카메라가 수업에 보인다」)
   ------------------------------------------------------------
   [무엇을 고치나]
   ① 참관 모드(/?observe=방ID)에서 하단 조작 독의 «보내는» 버튼이 그대로 보였다.
      idx-main.js 의 vcJoinAsObserver 는 #vc-bottom-toolbar 를 숨기는데, 그 id 는 지금
      어느 HTML 에도 없다(하단 조작이 vc-dock.js 의 #vc-dock 으로 바뀌면서 사라진 옛 id).
      → 참관자에게 마이크·카메라·화면공유 버튼이 계속 보였다.
   ② 그 마이크 버튼은 «장식» 이 아니다. vcToggleMic 은 오디오 트랙이 없으면 마이크를
      새로 획득해 모든 피어에 addTrack 한다. 참관자는 항상 빈 스트림(트랙 0개)이라
      버튼 한 번이면 그대로 수업에 등장한다.
   ③ 관리자 화면의 «직접 입장»(/?vc_autojoin=1&vc_role=teacher…)은 참관이 아니라 실제
      참가자다. 카메라가 켜진 채 들어가 수업 중간에 학생 화면에 낯선 얼굴이 뜬다.
      → &vc_cam=off 가 붙어 있으면 카메라를 끈 채로 시작한다(버튼 한 번으로 켤 수 있다).

   [왜 별도 파일인가]
   · idx-main.js 는 학생 29,000명이 첫 화면에서 받는 850KB blocking 파일이다.
     first_paint_budget_harness 의 여유가 사실상 0KB 이고, ?v= 를 올리면 전원이
     850KB 를 다시 받는다. 관리자·매니저만 쓰는 기능이라 defer 로 뺀다(CLAUDE.md 2장).
   · 그래서 idx-main.js 는 한 줄도 고치지 않는다. 붙는 방식은 mango-consent.js 와 같다
     (window 의 함수를 감싼다 — 인라인 onclick·독·모바일 버튼이 모두 window 를 거친다).
   · 되돌리기: index.html 의 이 <script> 한 줄만 지우면 즉시 원복된다.

   [2026-08-26 추가 — ④ 「여기 어디에 귓속말이 있어?」]
   참관자가 채팅창에 쓴 글은 방에 뿌려지지 않는다. 서버가 귓속말로 돌린다
   (video-call-room.ts handleObserverWhisper). 그런데 화면 어디에도 «귓속말» 이라는 말이
   없어서 사장님이 그냥 채팅인 줄 알고 쓰셨고, 아무 반응이 없어 「안 나타난다」가 됐다.
   → 참관 중일 때만 이름표를 사실에 맞게 고친다(기능은 이미 있었다).
     · 하단 독 버튼 «채팅» → «귓속말»
     · 대상 칩 «👥 전체» → «👩‍🏫 강사에게만»  (참관자에게 «전체» 라는 것은 없다)
     · 입력칸 안내문도 지금 누구에게 가는지로 바꾼다
   ⛔ 원본 함수를 고치지 않는다 — idx-main.js 는 첫 화면 blocking 예산에 들어간다.
      window 의 함수를 감싸서 «그린 뒤에» 이름표만 덧쓴다.

   [일부러 안 한 것]
   · 채팅·나가기·설정은 참관자에게도 남긴다 — 나가야 하고, 보기는 해야 한다.
   · 참관 사실을 학생에게 «알리지» 않는다. 서버(video-call-room.ts handleJoinObserve)가
     참관자를 인원수·입퇴장 방송 어디에도 안 넣는 «투명 유령» 설계라, 여기서 화면에만
     표시를 만들면 서버 설계와 어긋난다.
   · idx-main.js 의 죽은 #vc-bottom-toolbar 참조는 그대로 뒀다. 지우려면 ?v= 를 올려야
     하고, 그 한 줄 청소 때문에 전원이 850KB 를 다시 받는 것은 손해다.
   ============================================================ */
(function () {
  'use strict';
  if (window.__vcObserveGuard) return;
  window.__vcObserveGuard = true;

  function isEn() {
    try {
      var g = (typeof window.getLang === 'function') ? window.getLang()
            : (localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang') || 'ko');
      return String(g).toLowerCase() === 'en';
    } catch (_) { return false; }
  }

  /* 안내 한 줄 — 수업 화면에 이미 있는 토스트를 그대로 쓴다(새 UI 를 만들지 않는다). */
  function note(msg) {
    try { if (typeof window.vcShowEarnToast === 'function') { window.vcShowEarnToast(msg); return; } } catch (_) {}
    try { if (typeof window.vcAddChatSystem === 'function') window.vcAddChatSystem(msg); } catch (_) {}
  }

  /* 참관 중인가 — vcIsObserver 는 idx-main.js 안의 let 이라 window 에 없을 수 있다.
     _vcObserverMode 가 «별도 스크립트용 미러» 로 만들어진 값이라 이것을 정본으로 본다. */
  function observing() {
    return window._vcObserverMode === true || window.vcIsObserver === true;
  }

  /* ── ① 참관 중에는 «보내는» 버튼을 화면에서 없앤다 ──────────────────────────
     인라인 style 이 아니라 클래스로 숨긴다 — 독은 나중에 다시 그려질 수 있고,
     작성자 CSS 가 !important 면 인라인 style 이 지기도 한다(CLAUDE.md 2장).
     선택자가 body 클래스 기준이라 독이 나중에 그려져도 그대로 적용된다. */
  function ensureStyle() {
    if (document.getElementById('vc-observer-style')) return;
    var st = document.createElement('style');
    st.id = 'vc-observer-style';
    st.textContent =
      'body.vc-observer #vc-dock-mic,body.vc-observer #vc-dock-cam,' +
      'body.vc-observer #vc-dock-share,body.vc-observer #vc-btn-mic,' +
      'body.vc-observer #vc-btn-cam,body.vc-observer #vc-mic-select{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* body 클래스 동기화.
     ⚠️ body 의 class 를 보면서 body 의 class 를 바꾸므로 무한루프를 조심해야 한다
        (index.html 에 같은 사고 주석이 있다). 두 겹으로 막는다 —
        ① classList.toggle 은 값이 같으면 attribute 를 안 건드린다(콜백이 안 돈다)
        ② 그래도 busy 플래그로 재진입을 막는다. */
  var busy = false;
  function sync() {
    if (busy) return;
    busy = true;
    try {
      var want = observing() && document.body.classList.contains('vc-in-call');
      if (want) ensureStyle();
      document.body.classList.toggle('vc-observer', want);
    } catch (_) {} finally { busy = false; }
  }

  function watchBody() {
    try {
      if (!document.body) { setTimeout(watchBody, 200); return; }
      sync();
      if (typeof MutationObserver === 'function') {
        new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }
      /* 참관 입장은 DOMContentLoaded + 500ms 라, 관찰자를 붙이기 전에 이미 끝났을 수 있다.
         (그때는 class 가 더 안 바뀌어 콜백이 영영 안 돈다) → 몇 번 더 확인한다. */
      [300, 1200, 3000].forEach(function (ms) { setTimeout(sync, ms); });
    } catch (_) {}
  }
  watchBody();

  /* ── ② 마이크·카메라 가드 ────────────────────────────────────────────────
     버튼은 위에서 숨겼지만 호출 경로가 여럿이다 — 옛 상단 툴바의 인라인 onclick,
     타일 위 아이콘, vcMobileToggleMic/Cam, 그리고 앞으로 생길 무엇이든.
     그래서 «함수 자체» 를 막는다. 원본은 한 줄도 안 고치고 감싸기만 한다. */
  function blockedNote() {
    note(isEn() ? '👁 Observing — mic and camera stay off'
                : '👁 참관 중 — 마이크·카메라는 꺼진 채로 유지됩니다');
  }
  function wrap(name) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__vcObsWrapped) return;
    var f = function () {
      if (observing()) { blockedNote(); return; }
      return orig.apply(this, arguments);
    };
    f.__vcObsWrapped = true;
    try { window[name] = f; } catch (_) {}
  }
  function attach() { wrap('vcToggleMic'); wrap('vcToggleCam'); }
  attach();
  /* defer 라 idx-main.js 뒤에 실행되므로 지금 이미 붙는다. 혹시 순서가 바뀌어도
     조용히 실패하지 않도록 두 번 더 시도한다(wrap 은 두 번 감싸지 않는다). */
  [1500, 5000].forEach(function (ms) { setTimeout(attach, ms); });

  /* ── ④ 참관 중 «채팅» 은 사실 귓속말이다 — 이름표를 사실에 맞춘다 ───────────
     (2026-08-26 사장님 「여기 어디에 귓속말이 있어?」 · 「채팅창에 아무것도 안 나타나」)
     ⚠️ 라벨은 textContent 만 바꾸면 안 된다 — i18n 엔진이 data-ko/data-en 으로 textContent 를
        통째로 덮어쓰기 때문에, 🌐 를 누르는 순간(또는 sweep 타이밍에) «채팅» 으로 돌아간다
        (CLAUDE.md 2장 「JS 로 그린 라벨」). 세 값을 함께 갱신한다.
     ⚠️ 그렇다고 아이콘 버튼 «자체» 에 data-ko/data-en 을 달면 안 된다 — 그 두 속성은
        «설명» 이 아니라 «본문 갈아끼우기» 라 아이콘이 문장으로 바뀐다(같은 장의 형제 함정).
        여기서는 독이 이미 만들어 둔 <span class="lbl"> 글자 칸에만 쓴다. */
  function relabelDockChat() {
    try {
      var b = document.getElementById('vc-dock-chat');
      if (!b) return false;
      var lbl = b.querySelector('.lbl');
      if (!lbl) return false;
      var en = isEn();
      lbl.setAttribute('data-ko', '귓속말');
      lbl.setAttribute('data-en', 'Whisper');
      lbl.textContent = en ? 'Whisper' : '귓속말';
      b.title = en ? 'Whisper — only the person you pick can see it (not shown in class)'
                   : '귓속말 — 고른 사람에게만 보입니다 (수업 화면에는 안 뜹니다)';
      return true;
    } catch (_) { return false; }
  }

  function relabelChatTargets() {
    try {
      var en = isEn();
      var bar = document.getElementById('vc-chat-target-bar');
      if (bar) {
        var chips = bar.querySelectorAll('.chat-target-chip');
        for (var i = 0; i < chips.length; i++) {
          var c = chips[i];
          if (c.classList.contains('dm')) {            // 🔒 이름 칩 — 글자는 그대로 두고 설명만
            c.title = en ? 'Whisper to this person only' : '이 사람에게만 귓속말';
            continue;
          }
          c.textContent = en ? '\uD83D\uDC69\u200D\uD83C\uDFEB Teacher only' : '\uD83D\uDC69\u200D\uD83C\uDFEB 강사에게만';
          c.title = en ? 'Only the teachers in the room can see it' : '방에 있는 강사에게만 갑니다';
        }
      }
      var inp = document.getElementById('vc-chat-input');
      if (inp) {
        var t = window.vcChatTarget;
        inp.placeholder = (t && t.userId)
          ? (en ? ('Whisper to ' + t.username + ' only...') : ('\uD83D\uDD12 ' + t.username + ' 님에게만 귓속말...'))
          : (en ? 'Whisper to the teacher only...' : '강사에게만 보내는 귓속말...');
      }
    } catch (_) {}
  }

  /* 원본이 «다 그린 뒤에» 이름표를 덧쓴다. 참관 중이 아니면 손대지 않는다. */
  function wrapChat(name) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__vcObsChat) return;
    var f = function () {
      var r = orig.apply(this, arguments);
      if (observing()) { relabelChatTargets(); relabelDockChat(); }
      return r;
    };
    f.__vcObsChat = true;
    try { window[name] = f; } catch (_) {}
  }

  /* ⛔ 참관자가 쓴 글은 D1 채팅 이력에 남으면 안 된다 (2026-08-26 확인).
     idx-main.js 의 vcSendChat 은 «대상 없음» 일 때 소켓 전송에 더해 /api/chat/messages 로
     한 번 더 저장한다(sender_role:'observer'). 그런데 그 이력은 학생이 채팅창의
     「이전 대화 보기」로 그대로 불러온다 — GET /api/chat/messages 는 그 방 참가자면 통과한다
     (api-notify.ts 의 vc_roster 확인). 즉 «강사에게만» 한 귓속말이 학생 손에 닿는다.
     → 참관 중에는 소켓으로만 보내고 저장은 하지 않는다. 서버는 그 소켓 메시지를
       귓속말로 돌리므로(handleObserverWhisper) 방에도 안 뿌려진다.
     ⚠️ 원본을 고치지 않는다 — idx-main.js 는 첫 화면 blocking 예산에 들어간다.
        감싸기는 이 화면의 관행이다(idx-vc-chat.js·vc-judgment-capture.js 가 같은 방식). */
  function observerSendChat() {
    try {
      var input = document.getElementById('vc-chat-input');
      if (!input) return;
      var text = String(input.value || '').trim();
      if (!text) return;
      /* vcConn 은 window 에도 노출돼 있지만(idx-main.js), 그 줄이 사라져도 살아남게
         어휘 바인딩을 먼저 본다 — window.vcUserId 함정과 같은 사정(CLAUDE.md 2장). */
      var conn = null;
      try { conn = (typeof vcConn !== 'undefined' && vcConn) ? vcConn : window.vcConn; }
      catch (_) { conn = window.vcConn; }
      if (!conn || typeof conn.send !== 'function') {
        note(isEn() ? 'Not connected yet — try again in a moment'
                    : '아직 연결 중입니다 — 잠시 뒤 다시 보내 주세요');
        return;
      }
      var t = window.vcChatTarget;
      conn.send({
        type: 'chat-message',
        data: (t && t.userId) ? { message: text, toUserId: t.userId } : { message: text },
      });
      input.value = '';
    } catch (e) { console.warn('[vc-observe-guard] 귓속말 전송 실패:', e); }
  }

  function wrapSend() {
    var orig = window.vcSendChat;
    if (typeof orig !== 'function' || orig.__vcObsSend) return;
    var f = function () {
      if (observing()) { observerSendChat(); return; }
      return orig.apply(this, arguments);
    };
    f.__vcObsSend = true;
    try { window.vcSendChat = f; } catch (_) {}
  }
  /* 참관 여부는 «부를 때» 보므로 지금 감싸도 평소 화면은 그대로다. */
  wrapSend();
  [1500, 5000].forEach(function (ms) { setTimeout(wrapSend, ms); });

  function chatLabels() {
    if (!observing()) return;
    wrapChat('vcRefreshChatTargets');
    wrapChat('vcSetChatTarget');
    wrapChat('vcOpenChat');
    relabelDockChat();
    relabelChatTargets();
  }
  /* 독은 수업에 들어간 뒤에 만들어지고, 언어를 바꾸면 i18n 이 라벨을 다시 쓴다.
     ⛔ 상주 setInterval 을 두지 않는다 — 홈에 머무는 학생 폰까지 계속 깨운다(CLAUDE.md 2장).
        «끝이 있는» 확인 몇 번 + 언어 변경 신호만 받는다. */
  [800, 2000, 4000, 8000, 15000].forEach(function (ms) { setTimeout(chatLabels, ms); });
  try { window.addEventListener('mangoi:lang-changed', function () { setTimeout(chatLabels, 60); }); } catch (_) {}

  /* ── ③ &vc_cam=off — «직접 입장» 은 카메라를 끈 채로 시작 ──────────────────
     [방식] 트랙을 «안 만드는» 게 아니라 앱 자신의 vcToggleCam() 을 한 번 부른다.
       · 트랙은 살아 있고 enabled 만 false → sender 가 있으므로 나중에 [카메라] 버튼
         한 번으로 켜진다(이 앱은 최초 협상 뒤 자동 재협상을 하지 않는다).
       · idx-main.js 안의 vcCamOn(let)까지 정확히 false 가 된다. 트랙만 직접 끄면
         그 값이 true 로 남아, 나중에 버튼을 눌러도 «켜짐 → 꺼짐» 으로 뒤집혀
         두 번 눌러야 켜지는 상태가 된다.
     [타이밍] 미디어 획득(vcJoinRoom 안)이 WebSocket 연결보다 «먼저» 다. 트랙이 생기는
       즉시(80ms 간격 감시) 끄므로, 상대와 연결이 맺히기 전에 이미 꺼져 있다. */
  if (/[?&]vc_cam=off(?:&|$)/i.test(location.search)) {
    var applied = false;
    var t0 = Date.now();
    var timer = setInterval(function () {
      try {
        if (applied || Date.now() - t0 > 30000) { clearInterval(timer); return; }
        if (observing()) { clearInterval(timer); return; }   // 참관은 애초에 보낼 트랙이 없다
        var s = window.vcLocalStream;
        var vt = (s && typeof s.getVideoTracks === 'function') ? s.getVideoTracks() : [];
        if (!vt.length) return;
        applied = true;
        clearInterval(timer);

        if (window.vcCamOn !== false && typeof window.vcToggleCam === 'function') {
          window.vcToggleCam();
        } else {
          vt.forEach(function (t) { try { t.enabled = false; } catch (_) {} });
        }

        /* 내 타일에 «왜 까맣게 보이는지» 를 적어 둔다. 안 적으면 3초 안전망이
           '카메라가 안 들어온다'(camera-fail)로 오진해 다른 안내를 띄운다. */
        try {
          if (typeof window.vcShowLocalPlaceholder === 'function') {
            window.vcShowLocalPlaceholder('camera-off', isEn()
              ? 'Joined with the camera off — press [Camera] below to turn it on.'
              : '카메라를 끈 채로 입장했습니다 — 아래 [카메라] 버튼을 누르면 켜집니다.');
          }
        } catch (_) {}
        note(isEn() ? '📷 Joined with camera off — press [Camera] to turn it on'
                    : '📷 카메라를 끈 채로 입장했습니다 — [카메라] 버튼으로 켤 수 있어요');

        /* 이미 들어와 있던 사람에게 «내가 껐다» 를 알린다. 안 알리면 그쪽 화면에서는
           '이유 없는 검은 화면' 이라 자가복구 워치독이 재협상을 반복한다.
           (나중에 들어오는 사람에게는 idx-main 의 user-joined 핸들러가 같은 값을 보낸다) */
        [3000, 8000].forEach(function (ms) {
          setTimeout(function () {
            try {
              if (window.vcCamOn === false && typeof window.vcBroadcastCamState === 'function') {
                window.vcBroadcastCamState(false, 'user');
              }
            } catch (_) {}
          }, ms);
        });
      } catch (e) {
        clearInterval(timer);
        console.warn('[vc-observe-guard] vc_cam=off 적용 실패(입장은 계속):', e);
      }
    }, 80);
  }
})();
