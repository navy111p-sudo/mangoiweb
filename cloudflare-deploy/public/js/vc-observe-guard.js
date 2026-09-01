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

   [2026-08-26 추가 — ⑤ 「나는 Teacher 로 보이는데 Mel 선생님은 안 보인다」]
   운영 D1 실측 결과 «계정 차이» 가 아니라 «누른 버튼» 이 달랐다. 참관(/?observe=)은 유령이라
   출석 행조차 안 남는데, 같은 방에 이름 「교사」인 실제 참가자가 있었다 — 그 이름은
   직접 입장 링크에 vc_name 이 없을 때의 기본값(idx-main.js)이라 출처가 하나뿐이다.
   ⚠️ 8/20 에 ③(카메라 끄기)으로 고친 것은 증상의 «절반» 이었다. 카메라는 꺼졌지만
      사람은 그대로 보였고, 그래서 이번엔 「이름이 Teacher 로 보인다」로 다시 올라왔다.
   → 들어간 «뒤에» 화면이 지금 상태를 계속 말해 준다. 참관이면 «안 보입니다»,
     직접 입장이면 «보입니다». 기억에 맡기지 않는다(Zoom 웨비나의 attendee 표시와 같은 취지).
   ⛔ pointer-events:none 을 반드시 유지할 것 — 수업 화면 위에 뜨는 상자는 «가려서 안 눌린다»
      사고를 반복해서 냈다(CLAUDE.md 2장). 이 배지는 읽기만 하는 것이라 클릭을 받을 이유가 없다.
   ⛔ 자리는 «상단바 아래» 로 계산한다(고정 좌표 금지) — 상단바 높이가 화면마다 다르고,
      맨 위에 두면 상단바 버튼을 덮는다.

   [2026-08-26 추가 — ⑥ 학생 화면의 «교재 업로드» 감추기]
   마이마이 요청(8/20 ①) — 학생은 수업 중에 교재를 올릴 일이 없다. 실측해 보니 그 버튼에
   역할 구분이 «전혀» 없어 학생에게 그대로 보이고 있었다(index.html 의 pdf-controls).
   ⚠️ 판정은 vcIsStudentNow() «확실한 학생만 true» 정본을 쓴다. !vcIsStaffNow() 로 뒤집어
      쓰면 역할이 아직 확정되지 않은 강사가 학생으로 오판돼 «강사가 교재를 못 올리는» 사고가
      난다(2026-08-10 필리핀 매니저 재신고와 같은 뿌리). 모르면 그대로 보여 준다.
   ℹ️ 서버는 이미 막고 있다(video-call-room.ts 의 staffOnly) — 이건 화면에서 지우는 것뿐이다.

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
    return window._vcObserverMode === true || (typeof vcIsObserver !== 'undefined' && vcIsObserver === true);
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
      'body.vc-observer #vc-btn-cam,body.vc-observer #vc-mic-select{display:none!important}' +
      /* ⑥ 학생에게는 교재 «업로드» 버튼을 감춘다. 라이브러리·다운로드는 그대로 둔다
         (요청은 «올리기» 만이고, 보는 기능까지 뺏으면 복습이 막힌다). */
      'body.vc-hide-upload .pdf-controls > button[onclick*="triggerUpload(\'pdf\')"]{display:none!important}' +
      /* ⑤ 모드 배지 — 읽기 전용이라 클릭을 통과시킨다(pointer-events:none) */
      '#vc-mode-badge{position:fixed;left:50%;transform:translateX(-50%);z-index:2147483000;' +
        /* width:max-content 가 없으면 left:50% 때문에 «화면의 오른쪽 절반» 만 쓸 수 있는 것으로
           계산돼, 390px 폰에서 250px 로 좁아져 두 줄이 된다(실측). */
        'pointer-events:none;width:max-content;max-width:min(92vw,460px);' +
        'padding:6px 14px;border-radius:99px;' +
        'font-size:12.5px;font-weight:800;line-height:1.45;text-align:center;' +
        'box-shadow:0 8px 24px -10px rgba(0,0,0,.6)}' +
      /* 참관 실패 안내(#vc-observe-note)와 겹치지 않게 그 상자를 아래로 내린다 */
      'body.vc-mode-badge-on #vc-observe-note{top:64px}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* body 클래스 동기화.
     ⚠️ body 의 class 를 보면서 body 의 class 를 바꾸므로 무한루프를 조심해야 한다
        (index.html 에 같은 사고 주석이 있다). 두 겹으로 막는다 —
        ① classList.toggle 은 값이 같으면 attribute 를 안 건드린다(콜백이 안 돈다)
        ② 그래도 busy 플래그로 재진입을 막는다. */
  /* ── ⑥ 학생 화면의 «교재 업로드» 감추기 ─────────────────────────────────
     ⛔ !vcIsStaffNow() 로 뒤집어 쓰지 말 것 — 역할이 아직 확정되지 않은 강사를 학생으로
        오판해 «강사가 교재를 못 올리는» 사고가 난다. «확실한 학생만 true» 정본을 쓴다.
     모르면 그대로 보여 준다(고치기 전과 같은 상태 = 안전한 실패). */
  function syncUploadVisibility(inCall) {
    try {
      var student = false;
      if (typeof window.vcIsStudentNow === 'function') student = window.vcIsStudentNow() === true;
      var hide = inCall && student;
      if (hide) ensureStyle();
      document.body.classList.toggle('vc-hide-upload', hide);
    } catch (_) {}
  }

  /* ── ⑤ 모드 배지 — «지금 내가 보이는가» 를 화면이 계속 말해 준다 ──────────
     [판정] 두 가지뿐이다. 그 외(평소 학생·강사 수업)에는 아무것도 그리지 않는다.
       · 참관   = observing()            → 학생·강사에게 안 보임
       · 직접입장 = ?vc_autojoin=1 & vc_cam=off  → 관리자·매니저 화면의 «직접 입장» 버튼 셋이
                  만드는 링크. 강사 화면(teacher.html)·마이페이지 링크에는 vc_cam=off 가
                  없으므로 진짜 강사에게는 이 빨간 배지가 뜨지 않는다. */
  function visibleEntry() {
    var q = location.search || '';
    return /[?&]vc_autojoin=1(?:&|$)/i.test(q) && /[?&]vc_cam=off(?:&|$)/i.test(q);
  }

  function badgeText(mode) {
    var en = isEn();
    if (mode === 'observe') {
      return en ? '\uD83D\uDC41 Observing \u00B7 students and the teacher cannot see you'
                : '\uD83D\uDC41 \uCC38\uAD00 \uC911 \u00B7 \uD559\uC0DD\u00B7\uAC15\uC0AC\uC5D0\uAC8C \uBCF4\uC774\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4';
    }
    return en ? '\uD83D\uDD34 Joined as a participant \u00B7 students and the teacher see you'
              : '\uD83D\uDD34 \uCC38\uAC00\uC790\uB85C \uC785\uC7A5 \u00B7 \uD559\uC0DD\u00B7\uAC15\uC0AC\uC5D0\uAC8C \uBCF4\uC785\uB2C8\uB2E4';
  }

  /* 자리는 «상단바 아래» 로 잰다. 고정 좌표로 두면 상단바 버튼을 덮는다 —
     상단바 높이는 화면·방향마다 다르고, 세로 수업화면에서는 min-height 로 자리를 잡는다. */
  function placeBadge(el) {
    try {
      var top = 8;
      var tb = document.querySelector('.toolbar');
      if (tb) {
        var r = tb.getBoundingClientRect();
        if (r && r.bottom > 0) top = Math.round(r.bottom) + 6;
      }
      el.style.top = top + 'px';
    } catch (_) { el.style.top = '8px'; }
  }

  var badgeMode = '';
  function syncModeBadge(inCall) {
    try {
      var mode = observing() ? 'observe' : (visibleEntry() ? 'visible' : '');
      var el = document.getElementById('vc-mode-badge');
      if (!inCall || !mode) {
        if (el) el.remove();
        badgeMode = '';
        /* ⛔ contains 확인 없이 remove() 를 부르면 안 된다 — remove() 는 토큰이 «없어도»
           class attribute 를 다시 써서(121줄의 toggle 과 다르다) 위의 MutationObserver 가
           재발화한다. sync → remove → 재발화 → sync … 마이크로태스크 무한루프로
           2026-08-27 아침 홈 화면 전체(PC·모바일)가 멎었다. */
        if (document.body.classList.contains('vc-mode-badge-on')) document.body.classList.remove('vc-mode-badge-on');
        return;
      }
      ensureStyle();
      if (!el) {
        el = document.createElement('div');
        el.id = 'vc-mode-badge';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
      }
      if (badgeMode !== mode) {
        badgeMode = mode;
        el.style.cssText += (mode === 'observe')
          /* 보라 = 참관. 관리자 화면의 색 규칙과 같게 둔다(참관 보라 · 직접입장 주황·빨강) */
          ? ';background:#2e1065;border:1px solid #a78bfa;color:#ede9fe'
          : ';background:#3b1111;border:1px solid #f87171;color:#fecaca';
      }
      el.textContent = badgeText(mode);
      placeBadge(el);
      /* add() 는 이미 있으면 attribute 를 안 건드리지만(스펙), 위 remove 와 짝을 맞춰
         «바뀔 때만 쓴다» 를 눈에 보이게 남긴다 — 이 파일의 관찰자는 body class 다. */
      if (!document.body.classList.contains('vc-mode-badge-on')) document.body.classList.add('vc-mode-badge-on');
    } catch (_) {}
  }

  /* 화면이 돌아가거나 상단바 높이가 바뀌면 자리를 다시 잡는다.
     ⛔ 상주 setInterval·MutationObserver 를 새로 두지 않는다 — 홈에 머무는 학생 폰을
        계속 깨우고, body class 감시는 홈 전체를 멎게 한 전력이 있다(CLAUDE.md 2장). */
  try {
    ['resize', 'orientationchange'].forEach(function (ev) {
      window.addEventListener(ev, function () {
        var el = document.getElementById('vc-mode-badge');
        if (el) placeBadge(el);
      }, { passive: true });
    });
    window.addEventListener('mangoi:lang-changed', function () {
      setTimeout(function () {
        var el = document.getElementById('vc-mode-badge');
        if (el && badgeMode) el.textContent = badgeText(badgeMode);
      }, 60);
    });
  } catch (_) {}

  var busy = false;
  function sync() {
    if (busy) return;
    busy = true;
    try {
      var inCall = document.body.classList.contains('vc-in-call');
      var want = observing() && inCall;
      if (want) ensureStyle();
      document.body.classList.toggle('vc-observer', want);
      syncUploadVisibility(inCall);
      syncModeBadge(inCall);
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
      /* ⑤⑥ 은 역할·상단바가 «입장 뒤에» 확정되므로 확인이 몇 번 더 필요하다.
         끝이 있는 확인만 둔다(상주 타이머 금지). */
      [300, 1200, 3000, 6000, 12000].forEach(function (ms) { setTimeout(sync, ms); });
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

/* ============================================================================
   ⑦ 🎧 소리만 참관 · ⑧ 💬 귓속말 패널 자동 열기   (2026-08-31 STEP 2 — 사장님 지시)
   ----------------------------------------------------------------------------
   [무엇을 푸는가]
   · 「보다」의 «관리용 모니터링»(보면서 지시) 과 «회선 부담 없이 수업이 도는지만 확인».
   · 귓속말 «기능» 은 2026-08-26 부터 이미 있었다(참관 화면 채팅칸이 곧 귓속말).
     빠져 있던 것은 «그 칸이 열려 있지 않다» 는 것뿐이라, 여기서는 열어 주기만 한다.

   [소리만 참관이 진짜로 회선을 아끼는 이유 — 화면만 끄는 것이 아니다]
   참관자는 자기가 **offer 를 만드는 쪽**이고(idx-main.js vcCreatePeerAndOffer),
   그 offer 의 m-line 은 vcCreatePeer 가 넣는 recvonly transceiver 두 개다(video·audio).
   그래서 **offer 를 만들기 전에** 비디오 transceiver 를 inactive 로 돌리면 상대(강사)가
   아예 영상을 «보내지 않는다» — 받아 놓고 숨기는 것이 아니라 오지 않는다.
   ⚠️ 그래서 이 선택은 «입장할 때» 정해진다. 도중에 바꾸려면 재협상이 필요한데 이 앱에는
      자동 재협상이 없다 → 배너의 [영상도 보기] 는 파라미터를 빼고 **다시 여는** 방식이다
      (순회 참관이 20초마다 하는 것과 같은 길이라 새로운 위험이 아니다).

   ⛔ 영상 미수신 감시를 반드시 먼저 꺼야 한다 — 안 끄면 소리만 참관이 «고장» 으로 오인돼
      ① 「영상이 안 옵니다」 배너가 뜨고 ② vcObserverRetryStalled 가 TURN 릴레이를 강제하며
      모든 피어에 offer 를 다시 던진다(강사 업로드에 부담). 기존 플래그를 그대로 세운다.

   [왜 여기인가] idx-main.js(850KB blocking, 첫 화면 예산)를 안 고치려고 window 의 함수를
     감싼다 — 이 파일이 이미 쓰는 방식 그대로다. index.html 은 ?v= 한 글자만 바뀐다.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__vcObserveExt) return;
  window.__vcObserveExt = true;

  var qs;
  try { qs = new URLSearchParams(location.search); } catch (_) { return; }
  if (!qs.get('observe')) return;                 // 참관 화면에서만 동작한다

  var observeRoom = qs.get('observe');
  var audioOnly = qs.get('audio') === '1';
  var wantWhisper = qs.get('whisper') === '1';

  /* ── ⑨ 참관 중에는 주소에 «?room=» 을 남기지 않는다  (2026-08-31 브라우저 검사로 발견) ──
     [무엇이 위험한가] index.html 의 «수업 중 새로고침 = 그 수업으로 되돌아오기» 블록이
     수업 중이면 history.replaceState 로 ?room=<방> 을 주소에 붙인다. 그런데 그 블록의
     currentRoom() 은 «수업 관찰 중» 이라는 제목까지 벗겨 내므로 **참관 화면에서도 붙는다.**
     그리고 ?room= 은 다른 블록이 700ms 뒤 mangoiJoinClass(room) 으로 **실제 참가자 입장**에
     쓴다 — 저장된 아이디·비밀번호가 있으면 그대로 vcJoinRoom() 까지 간다.
     ⟹ 참관 중 F5(또는 그 주소를 다시 열기) = «참관하려다 카메라 켜고 수업에 등장».
     이 파일이 막으려고 만들어진 바로 그 사고다(머리말 ②·③).
     [왜 이렇게 고치나] index.html 은 공동 금지구역이고, 그 블록의 mark() 는 닫힌 스코프라
     window 로 덮을 수도 없다. 그래서 «주소를 쓰는 문» 하나만 참관 중에 좁힌다.
     ⛔ 상주 setInterval 로 지우지 않는다(홈을 멎게 한 전력 — CLAUDE.md 2장). */
  if (observeRoom) {
    try {
      var _origRS = history.replaceState;
      history.replaceState = function (a, b, url) {
        try {
          if (typeof url === 'string' && /[?&]room=/.test(url)) {
            var u = new URL(url, location.href);
            u.searchParams.delete('room');
            url = u.pathname + (u.search === '?' ? '' : u.search) + u.hash;
          }
        } catch (_) {}
        return _origRS.apply(history, [a, b, url]);
      };
      if (/[?&]room=/.test(location.search)) {
        var u0 = new URL(location.href);
        u0.searchParams.delete('room');
        _origRS.call(history, null, '', u0.pathname + (u0.search === '?' ? '' : u0.search) + u0.hash);
      }
    } catch (_) {}
  }

  if (!audioOnly && !wantWhisper) return;

  function en() {
    try {
      var g = (typeof window.getLang === 'function') ? window.getLang()
            : (localStorage.getItem('mangoi_lang') || 'ko');
      return String(g).toLowerCase() === 'en';
    } catch (_) { return false; }
  }
  function L(ko, e) { return en() ? e : ko; }

  /* ── ⑦ 소리만 참관 ────────────────────────────────────────────────────── */
  if (audioOnly) {
    /* 이 두 플래그는 idx-main.js 의 감시 함수가 «맨 앞에서 보고 그냥 돌아가는» 값이다.
       (vcObserverMediaWatch / vcObserverRetryStalled) — 새 코드를 넣지 않고 끄는 방법. */
    window.__vcObserveMediaWatching = true;
    window.__vcObserveRetried = true;

    var origCreatePeer = window.vcCreatePeer;
    if (typeof origCreatePeer === 'function') {
      window.vcCreatePeer = function () {
        var pc = origCreatePeer.apply(this, arguments);
        try {
          var n = 0;
          (pc.getTransceivers() || []).forEach(function (t) {
            var kind = '';
            try { kind = (t && t.receiver && t.receiver.track && t.receiver.track.kind) || ''; } catch (_) {}
            if (kind === 'video') { t.direction = 'inactive'; n++; }
          });
          if (n) { window.__vcAudioOnlyOn = true; showAudioNote(); }
        } catch (e) {
          /* 못 껐으면 «고치기 전» 그대로 — 영상이 오고, 배너도 뜨지 않는다(거짓말하지 않는다) */
          console.warn('[vc-observe-ext] 소리만 적용 실패(참관은 계속):', e);
        }
        return pc;
      };
    }
  }

  /* 배너 — 실제로 «껐을 때만» 그린다. 못 껐는데 «소리만 받는 중» 이라고 적으면 거짓말이 된다. */
  function showAudioNote() {
    if (document.getElementById('vc-audio-only-note')) return;
    try {
      var st = document.createElement('style');
      st.textContent = '#vc-audio-only-note{position:fixed;top:104px;left:50%;transform:translateX(-50%);'
        + 'z-index:2147482990;width:max-content;max-width:min(92vw,520px);'
        + 'padding:8px 14px;border-radius:99px;background:#1e1b4b;color:#ddd6fe;'
        + 'border:1px solid #6d28d9;font-size:12.5px;font-weight:800;line-height:1.5;'
        + 'display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px -10px rgba(0,0,0,.6)}'
        + '#vc-audio-only-note button{font:inherit;font-size:12px;cursor:pointer;border-radius:8px;'
        + 'padding:4px 10px;background:#6d28d9;color:#fff;border:0}';
      (document.head || document.documentElement).appendChild(st);
      var box = document.createElement('div');
      box.id = 'vc-audio-only-note';
      box.innerHTML = '<span>' + L('🎧 소리만 참관 중 — 영상은 받지 않습니다 (회선 절약)',
                                   '🎧 Audio-only — video is not being received (saves bandwidth)') + '</span>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = L('🎥 영상도 보기', '🎥 Show video');
      btn.addEventListener('click', function () {
        /* 도중 전환은 재협상이 필요하고 이 앱에는 그것이 없다 → 다시 연다.
           ⚠️ 지금 주소를 «물려받지» 않는다 — 화면이 그 사이에 ?room= 을 붙여 놓으면
              그 주소로 다시 여는 순간 «실제 참가자» 로도 입장한다(⑨절 참고).
              필요한 것만 손으로 조립한다. */
        try {
          var q = '?observe=' + encodeURIComponent(observeRoom || '');
          if (wantWhisper) q += '&whisper=1';
          location.href = location.origin + location.pathname + q;
        } catch (_) { location.reload(); }
      });
      box.appendChild(btn);
      document.body.appendChild(box);
    } catch (_) {}
  }

  /* ── ⑧ 귓속말 패널 자동 열기 ──────────────────────────────────────────────
     참관 입장은 DOMContentLoaded + 500ms 뒤에 시작한다(idx-main.js). 그보다 뒤에 연다.
     ⚠️ vcToggleChat 이 아니라 vcOpenChat 을 쓴다 — 토글이면 두 번째 호출이 도로 닫는다. */
  if (wantWhisper) {
    [1600, 3600].forEach(function (ms) {
      setTimeout(function () {
        try {
          var panel = document.getElementById('vc-chat-panel');
          if (panel && panel.classList.contains('open')) return;
          if (typeof window.vcOpenChat === 'function') window.vcOpenChat();
        } catch (_) {}
      }, ms);
    });
    setTimeout(function () {
      try {
        if (typeof window.vcAddChatSystem === 'function') {
          window.vcAddChatSystem(L('💬 여기에 쓰면 학생에게는 보이지 않고 강사에게만 갑니다. 이름 칩을 고르면 그 사람에게만 갑니다.',
                                   '💬 What you type here is invisible to students and goes to the teacher only. Pick a name chip to send to one person.'));
        }
      } catch (_) {}
    }, 2200);
  }
})();

/* ============================================================================
   ⑩ 참관자는 «얼굴 칸» 도 만들지 않는다        (2026-09-01 사장님 지시로 수리)
   ----------------------------------------------------------------------------
   [제보] 「이거 수업 관찰 할 때 참가자가 안 보이게 할 수 있어?」 — 강사(Krystel) 화면
     왼쪽 얼굴 열에 이름표가 「참가자」인 **온통 검은 칸**이 하나 더 있었다.

   [뿌리] 참관은 «투명 유령» 설계다 — src/video-call-room.ts 의 handleJoinObserve 가
     joined:false 로 붙이고 방송을 하나도 하지 않는다. 그래서 인원수에도, 입퇴장에도,
     로스터(existing-users·user-joined)에도 안 나온다. 그런데 참관자는 영상을 받으려고
     **recvonly offer 를 직접 보내고**, 그 offer 를 중계하던 handleOffer 가
     `this.usernameOf(userId) || '참가자'` 로 **이름을 지어내고 있었다**(usernameOf 는
     joined 인 사람만 이름을 준다 → 참관자는 항상 null → 항상 «참가자»).
     받는 쪽(js/idx-main.js vcHandleOffer)은 그 이름으로 피어를 만들고, 그 이름이 그대로
     얼굴 칸 이름표가 된다(`escHtml(username || '참가자')`).

   [무엇을 고쳤나] 서버가 그 offer 에 `fromObserver:true` 를 실어 준다(위 handleOffer).
     여기서는 그 표시를 받은 id 에 대해서만 **칸을 만드는 세 경로를 전부** 막는다.
   ⛔ 이름이 «참가자» 인 칸을 지우는 식으로 풀지 말 것 — 이름이 아직 안 붙은 진짜 학생의
      칸까지 지운다. 판정 근거는 **서버가 참관자라고 말한 id** 하나뿐이다.
   ⛔ vcRemovePeer(id, 'left') 로 지우지 말 것 — index.html 이 'left' 를 «수업 종료» 로
      읽어 학생 화면에 「수업이 끝났어요」가 뜬다(CLAUDE.md 2장). DOM 칸만 걷어낸다.
   ⛔ 상주 setInterval·body class MutationObserver 로 감시하지 말 것(홈 전체가 멎은 전력).
      offer 를 받은 그 순간부터 «끝이 있는» 몇 번의 확인만 한다.

   [왜 이 파일인가] js/idx-main.js 는 849KB blocking 이고 첫 화면 예산 여유가 100바이트대라
     한 줄도 못 넣는다. 이 파일은 defer 라 예산 밖이고, 이미 window 함수를 감싸는 방식을 쓴다.
     ⚠️ 이 절은 «참관자» 가 아니라 **참관을 당하는 쪽(강사·학생)** 에서 돌아야 한다.
        그래서 위 ⑦⑧ 처럼 `?observe=` 로 걸러서는 안 된다.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__vcObserverTileGuard) return;
  window.__vcObserverTileGuard = true;

  /* 서버가 «참관자» 라고 말해 준 peer id 들. 추측으로는 절대 채우지 않는다. */
  var OBS = (window.__vcObserverPeers = window.__vcObserverPeers || {});

  function dropBox(userId) {
    try {
      var box = document.getElementById('vc-video-' + userId);
      if (box && box.parentNode) box.parentNode.removeChild(box);
      if (typeof window.vcUpdateGridCount === 'function') window.vcUpdateGridCount();
      if (typeof window.vcRefreshChatTargets === 'function') window.vcRefreshChatTargets();
    } catch (_) {}
  }

  /* (가) offer 에 실려 온 표시를 기억한다. 원래 처리는 그대로 이어서 한다 —
     answer 는 보내야 참관자가 영상을 받는다(참관 자체를 막는 것이 아니다). */
  var _offer = window.vcHandleOffer;
  if (typeof _offer === 'function') {
    window.vcHandleOffer = function (data) {
      try {
        if (data && data.fromObserver && data.fromUserId) {
          OBS[data.fromUserId] = true;
          /* 이미 만들어져 있으면 걷어낸다. 끝이 있는 확인만 한다(상주 감시 금지). */
          [0, 400, 1500, 4000].forEach(function (ms) {
            setTimeout(function () { dropBox(data.fromUserId); }, ms);
          });
        }
      } catch (_) {}
      return _offer.apply(this, arguments);
    };
  }

  /* (나) 칸을 «만드는» 두 곳에서 참관자면 만들지 않는다.
     둘 다 idx-main.js 최상위 function 선언이라 window 속성이고, 호출부도 같은 바인딩을
     본다(classic script) → 여기서 덮으면 호출부가 이 함수를 부른다. */
  var _ensure = window.vcEnsureParticipantBox;
  if (typeof _ensure === 'function') {
    window.vcEnsureParticipantBox = function (userId) {
      if (userId && OBS[userId]) return null;
      return _ensure.apply(this, arguments);
    };
  }

  var _add = window.vcAddRemoteVideo;
  if (typeof _add === 'function') {
    window.vcAddRemoteVideo = function (userId) {
      if (userId && OBS[userId]) { dropBox(userId); return; }
      return _add.apply(this, arguments);
    };
  }
})();
