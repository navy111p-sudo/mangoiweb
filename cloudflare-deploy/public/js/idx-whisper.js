/* ══════════════════════════════════════════════════════════════════════════════
   📢 관리자·참관자 → 강사 귓속말 표시            (2026-08-19 Melca 8/19 제보 2-③)

   왜 만들었나
     제보 원문: 「Chat is not visible as observer send message at the classroom.
                 In case we want to communicate teacher during the classes.」
     참관자가 교실에서 메시지를 보내도 강사 화면에 **아무것도 뜨지 않았다.** 원인이 둘:
       ① 참관자는 «유령»(joined:false)이라 서버가 채팅을 조용히 버렸다
          (video-call-room.ts handleChatMessage 의 usernameOf() 게이트)
       ② /api/admin/whisper/send 는 D1 에 기록만 하고 전송을 안 했다
          (`// GM-4 미구현: 실제 WebSocket push 는 추후` 가 그대로 남아 있었다)
     둘 다 고쳤고, 이 파일은 그 결과를 **보여 주는** 쪽이다.

   왜 별도 파일인가
     idx-main.js 는 849KB 이고 index.html 의 **첫 화면 blocking 예산**에 들어간다
     (first_paint_budget_harness 가 감시). 강사만 쓰는 기능을 학생 29,000명에게도
     내려보낼 이유가 없다 → defer 로 뒤에 받는다.
     ⚠️ 이 파일이 오기 전에 메시지가 올 수 있다 → idx-main.js 가 window.__vcWhisperQ 에
        담아 두고, 여기서 로드되자마자 비운다. 큐가 없으면 첫 메시지 하나가 사라진다.

   ⛔ 학생에게 보이면 안 된다
     서버가 staff 소켓에만 보내지만(video-call-room.ts isStaffAtt), 여기서 한 겹 더 막는다.
     서버 쪽이 언젠가 회귀하면 학생 화면에 관리자 지시가 바로 뜬다 — 이중 방어가 값싸다.

   ── 2026-08-26 확장 (사장님 지시) ────────────────────────────────────────────
   ① «학생에게도» 보낼 수 있게 했다. 참관자가 채팅 대상 칩(🔒 이름)을 고르고 쓰면 서버가
      그 사람 소켓 «하나» 에만 보낸다(video-call-room.ts handleObserverWhisper 의 toUserId).
      그때 payload 에 direct:true 와 to:<받는사람 id> 가 실린다.
      ⛔ 그렇다고 위 «학생 차단» 을 푼 것이 아니다 — 대상을 안 고른 귓속말은 지금도
         staff 소켓에만 간다. 학생이 그리는 것은 «자기를 콕 집어 보낸 것» 뿐이고,
         그 판정도 to === 내 id 로 한 번 더 확인한다(서버 회귀 대비 이중 방어).
   ② 「채팅창에 아무것도 안 나타난다」를 고쳤다. 참관자 메시지는 방에 안 뿌려지므로
      «에코» 가 없어 화면에 흔적이 하나도 없었다(사장님이 「왜 안들어와요?」를 쓰고
      아무것도 안 뜬 그 상태). 이제 서버가 ack 에 본문을 실어 주고, 여기서 자기
      채팅창에 «보낸 기록» 을 남긴다.

   ── 2026-11-04 확장 (필리핀 매니저 「BODA 처럼 알림이 바로 떠서 강사가 바로 답하게」) ──
   [잰 것] 매니저가 «Teacher mangoi_172» 칩을 골라 보낸 「Hello teacher」는 서버가
      delivered=1 로 회신했다(화면의 「Sent to … only」 문구가 그 증거). 즉 «안 간» 것이 아니라
      «갔는데 못 본» 것이다.
   [원인] 강사 화면 표시가 ⓐ 오른쪽 위 «구석» ⓑ 수업 화면과 거의 같은 «남색» ⓒ 소리 없음
      ⓓ 8초 뒤 스스로 사라짐 ⓔ 새 메시지가 오면 앞의 것을 지움 — 교재·학생 얼굴을 보며
      수업하는 강사가 알아챌 수 없는 모양이었다. 그리고 강사가 «답할 길» 이 없었다
      (참관자는 유령이라 1:1 채팅이 「상대방이 방에 없어」로 끝나고, 방 채팅은 학생이 본다).
   [바꾼 것 — 강사·직원 화면만. 학생 화면의 작은 상자는 그대로다]
      ① 화면 위쪽 가운데 «밝은 카드» 로 띄우고 **「확인」을 누를 때까지 남긴다**(스스로 안 사라짐).
      ② 짧은 알림음 — idx-main.js 의 공용 AudioContext(vcGetSharedAC, 화면을 누를 때 이미 풀림)를 쓴다.
      ③ 다른 탭·다른 창에 있으면 탭 제목을 깜빡이고, 알림 권한이 있으면 브라우저 알림도 띄운다.
         ⛔ 수업 중에 권한을 «먼저 묻지» 않는다 — 카드의 「🔔」 버튼을 사람이 눌렀을 때만 묻는다.
      ④ 받은 글을 채팅창에도 한 줄 남긴다(내 화면에만 — vcAddChatSystem 은 순수 화면 함수).
      ⑤ 카드 안에서 «참관자에게만» 답장한다(빠른 답장 3개 + 직접 입력). 서버의
         handleObserverWhisperReply 가 그 참관자 소켓 «하나» 에만 보낸다.
      ⑥ 「확인」·답장을 누르면 참관자 화면에 «✓ 읽음» 이 남는다(BODA 와 같은 «봤다» 표시).
   [일부러 안 한 것]
      · 학생에게 온 귓속말(direct·toStaff:false)은 예전 작은 상자 그대로 둔다 — 학생 화면에
        수업 중 큰 카드·소리가 나는 것은 요청 범위가 아니다.
      · 입력칸에 자동으로 포커스를 주지 않는다 — 강사가 다른 칸에 치던 글이 카드로 새어 들어간다.
      · 소리 끄기 설정은 두지 않았다 — 요청이 «놓치지 않게» 이고, 한 번 «딩» 하고 끝난다.
        ⚠️ 그 소리가 강사 마이크로 들어가 학생에게 작게 들릴 수는 있다(브라우저 반향 제거가
           대부분 지우지만 보장은 없다).

   되돌리기: index.html 의 이 <script> 한 줄만 지우면 된다. idx-main.js 의 위임 5줄은
     window.vcWhisperOn 이 없으면 큐에만 쌓고 아무 일도 하지 않는다(무해).
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.vcWhisperOn) return;               // 중복 로드 방지

  var BOX_ID = 'vc-whisper-box';                // 학생용 작은 상자 (예전 그대로)
  var CARD_ID = 'vc-whisper-alert';             // 강사·참관자용 «확인 전까지 남는» 카드 (2026-11-04)
  var STYLE_ID = 'vc-whisper-style';
  /* 카드 높이(z-index) — 수업 입장 때 «화면 전체» 로 자동으로 뜨는 사용법 안내 창(idx-vc-guide.js,
     #vc-guide-ov · 2147483001)보다 위여야 한다. 같은 값이면 나중에 열린 안내 창이 카드를 덮어
     «눌러도 안 눌리는» 카드가 된다(2026-11-04 브라우저 실측). 카드에는 「확인」이 있어 덮어도 닫을 수 있다. */
  var CARD_Z = 2147483646;

  function isEn() {
    try { return typeof getLang === 'function' && getLang() === 'en'; } catch (e) { return false; }
  }

  /* 내 참가자 id — «나를 콕 집어» 보낸 것인지 가릴 때 쓴다.
     ⚠️ window.vcUserId 로 읽으면 «항상 빈 값» 이다. vcUserId 는 idx-main.js 의 let 이라
        window 에 속성을 만들지 않는다(CLAUDE.md 2장 「값을 넣었는데 payload 에는 늘 빈 값」).
        고전 스크립트끼리는 전역 «어휘» 스코프를 공유하므로 이름 그대로 읽어야 한다. */
  function myUid() {
    try { return String((typeof vcUserId !== 'undefined' && vcUserId) || '').trim(); }
    catch (e) { return ''; }
  }

  /* 소켓 — idx-main.js 의 let vcConn 이 정본이다(재연결하면 새 객체로 바뀐다).
     window.vcConn 은 «만들 때» 맞춰 두는 사본이라 어휘 바인딩이 비어 있을 때만 쓴다. */
  function conn() {
    try { if (typeof vcConn !== 'undefined' && vcConn) return vcConn; } catch (e) {}
    return window.vcConn || null;
  }
  /* 보냈으면 true. ⚠️ vcConn.send 는 끊긴 동안 «알려진 타입» 만 재전송 큐에 넣는다 —
     답장은 그 목록에 없으므로 false 가 오면 «안 갔다» 가 사실이다(보낸 척 하지 않는다). */
  function sendWs(msg) {
    try {
      var c = conn();
      return !!(c && typeof c.send === 'function' && c.send(msg) === true);
    } catch (e) { return false; }
  }

  function chatLine(t) {
    try { if (typeof window.vcAddChatSystem === 'function') window.vcAddChatSystem(t); } catch (e) {}
  }
  function toast(t) {
    try { if (typeof showToast === 'function') showToast(t); } catch (e) {}
  }
  function hhmm(at) {
    try {
      var d = new Date(Number(at) || Date.now());
      var h = d.getHours(), m = d.getMinutes();
      if (isEn()) {
        var ap = h >= 12 ? 'PM' : 'AM', h12 = (h % 12) || 12;
        return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
      }
      return (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m;
    } catch (e) { return ''; }
  }

  function kill() {
    // ⚠️ querySelectorAll 로 **전부** 지운다. 같은 id 가 두 벌 쌓이면 하나만 지워
    //    «닫아도 안 사라지는» 상자가 남는다(CLAUDE.md 2장의 실제 사고).
    try {
      var list = document.querySelectorAll('#' + BOX_ID);
      for (var i = 0; i < list.length; i++) {
        if (list[i].parentNode) list[i].parentNode.removeChild(list[i]);
      }
    } catch (e) {}
  }
  function killCard() {
    try {
      var list = document.querySelectorAll('#' + CARD_ID);   // 같은 이유로 «전부»
      for (var i = 0; i < list.length; i++) {
        if (list[i].parentNode) list[i].parentNode.removeChild(list[i]);
      }
    } catch (e) {}
  }

  /* 학생에게 «나를 콕 집어» 온 귓속말 — 예전 작은 상자 그대로 (2026-11-04 에도 바꾸지 않았다). */
  function show(d) {
    var text = String((d && d.message) || '').trim();
    if (!text) return;
    var en = isEn();
    var from = String((d && d.from) || (en ? 'Office' : '사무실')).slice(0, 40);
    var urgent = String((d && d.urgency) || 'normal') === 'urgent';

    kill();                                      // 여러 건이 와도 쌓지 않는다 — 화면을 덮으면 더 나쁘다

    var box = document.createElement('div');
    box.id = BOX_ID;
    box.setAttribute('role', 'status');
    /* ⚠️ opacity:0 으로 시작하지 않는다 — 백그라운드 탭·저전력 모드에서 CSS transition 이
       멈춰 «영영 안 보이는» 사고가 난다(CLAUDE.md 2장). 처음부터 보이게 그린다. */
    box.style.cssText =
        'position:fixed;top:14px;right:14px;z-index:2147483000;max-width:min(88vw,340px);'
      + 'padding:11px 13px;border-radius:12px;cursor:pointer;'
      + 'background:' + (urgent ? 'rgba(180,40,20,.97)' : 'rgba(28,38,54,.97)') + ';'
      + 'color:#fff;font-size:13.5px;line-height:1.5;'
      + 'box-shadow:0 8px 26px rgba(0,0,0,.38);border:1px solid rgba(255,255,255,.18)';

    var h = document.createElement('div');
    h.style.cssText = 'font-size:11px;font-weight:800;opacity:.8;margin-bottom:3px';
    /* 보낸 사람 이름이 없으면(=학생에게 가는 것) «사무실» 로 그린다.
       ⚠️ 그대로 이어 붙이면 「사무실 님의 메시지」가 되어 말이 안 된다 — 사람 이름일 때와
          기관 이름일 때를 갈라 쓴다. */
    var named = !!(d && d.from);
    h.textContent = en
      ? (named ? ('📢 Message from ' + from) : '📢 Message from the office')
      : (named ? ('📢 ' + from + ' 님의 메시지') : '📢 사무실에서 보낸 메시지');

    var b = document.createElement('div');
    b.style.cssText = 'font-weight:600;word-break:break-word';
    b.textContent = text;                        // ⚠️ textContent — 관리자가 쓴 글을 HTML 로 넣지 않는다

    /* 받는 사람이 학생이면 «학생에게는 보이지 않습니다» 를 말하면 안 된다 — 자기가 학생이다.
       (2026-08-26) 그 줄은 강사·관리자에게 «이건 학생 몰래 온 지시다» 를 알리는 문구다. */
    var toMe = !!(d && d.direct === true && d.toStaff === false);
    var f = document.createElement('div');
    f.style.cssText = 'font-size:10.5px;opacity:.65;margin-top:5px';
    f.textContent = toMe ? (en ? 'Tap to dismiss · only you can see this'
                               : '눌러서 닫기 · 나에게만 보낸 메시지입니다')
                         : (en ? 'Tap to dismiss · students cannot see this'
                               : '눌러서 닫기 · 학생에게는 보이지 않습니다');

    box.appendChild(h); box.appendChild(b); box.appendChild(f);
    box.addEventListener('click', kill);
    box.addEventListener('touchend', kill);      // 인앱 브라우저에서 click 이 안 오는 경우 대비
    document.body.appendChild(box);
    /* 안 닫아도 스스로 사라지는 안전망.
       학생은 교재를 보다가 뒤늦게 알아채는 일이 많아 조금 더 오래 띄운다.
       ⚠️ 타이머는 «하나» 여야 한다 — 8000 과 14000 을 둘 다 걸면 8초에 먼저 지워져
          14초는 아무 일도 안 한다. */
    setTimeout(kill, toMe ? 14000 : 8000);
  }

  /* ══════════════════ 2026-11-04 — 강사가 «놓칠 수 없는» 알림 ══════════════════ */

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    /* ⚠️ 깜빡임은 «테두리 그림자» 만 움직인다 — 처음부터 보이는 상태가 기본이라
          애니메이션이 멈춰도(백그라운드 탭) 카드는 그대로 보인다(CLAUDE.md 2장). */
    st.textContent =
      '@keyframes vcwPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,165,36,.85),0 18px 48px -12px rgba(0,0,0,.6)}' +
        '50%{box-shadow:0 0 0 14px rgba(245,165,36,0),0 18px 48px -12px rgba(0,0,0,.6)}}' +
      '#' + CARD_ID + '{animation:vcwPulse 1.1s ease-in-out 0s 6}' +
      '#' + CARD_ID + ' button{font:inherit;cursor:pointer;margin:0;line-height:1.2;' +
        'box-sizing:border-box;text-transform:none;letter-spacing:normal}' +
      '#' + CARD_ID + ' button:focus-visible,#' + CARD_ID + ' input:focus-visible{outline:3px solid #1a73e8;outline-offset:2px}' +
      '#' + CARD_ID + ' input::placeholder{color:#7a6a45}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* 카드 높이 — 상단바 «아래» 로 계산한다(고정 좌표 금지: 상단바 높이가 화면마다 다르고,
     맨 위에 두면 상단바 버튼을 덮는다). 참관 중이면 모드 배지(#vc-mode-badge) 아래로. */
  function cardTop() {
    var top = 10;
    try {
      var sel = ['.toolbar', '#vc-mode-badge'];
      for (var i = 0; i < sel.length; i++) {
        var el = document.querySelector(sel[i]);
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (r && r.bottom > 0 && r.bottom < (window.innerHeight || 800) * 0.5) top = Math.max(top, Math.round(r.bottom) + 8);
      }
    } catch (e) {}
    return top;
  }

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;     // ⚠️ 언제나 textContent — HTML 로 넣지 않는다
    return n;
  }
  /* 버튼 누르기 — 인앱 브라우저는 click 이 안 오기도 해서 touchend 도 받는다.
     touchend 에서 preventDefault 로 뒤따르는 click 을 막아 «두 번 실행» 을 피한다. */
  function tap(btn, fn) {
    btn.addEventListener('click', function (e) { try { e.stopPropagation(); fn(); } catch (_) {} });
    btn.addEventListener('touchend', function (e) {
      try { e.preventDefault(); e.stopPropagation(); fn(); } catch (_) {}
    });
  }

  /* 🔔 짧은 «딩–동» — 공용 AudioContext 를 쓴다. 그것이 없을 때만 내 것을 하나 만든다.
     ⚠️ 매번 새로 만들지 않는다(브라우저가 동시에 열 수 있는 수가 정해져 있다). */
  function ding(urgent) {
    try {
      var ac = null;
      try { if (typeof vcGetSharedAC === 'function') ac = vcGetSharedAC(); } catch (e) {}
      if (!ac) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = window.__vcWhisperAC || (window.__vcWhisperAC = new AC());
      }
      if (ac.state === 'suspended' && ac.resume) { try { ac.resume(); } catch (e) {} }
      var notes = urgent ? [988, 740, 988] : [880, 1318.5];
      var t0 = ac.currentTime + 0.02;
      for (var i = 0; i < notes.length; i++) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = notes[i];
        var s = t0 + i * 0.17;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.22, s + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.3);
        o.connect(g); g.connect(ac.destination);
        o.start(s); o.stop(s + 0.32);
      }
    } catch (e) {}
  }

  /* 다른 탭·다른 창에 있을 때 — 탭 제목 깜빡임 + (권한이 있으면) 브라우저 알림.
     ⚠️ 깜빡임 타이머는 «안 보이는 동안만» 돈다 — 보이면 그 자리에서 멈춘다(상주 타이머 금지). */
  var flashTimer = 0, baseTitle = '', flashText = '', lastSet = '';
  function away() {
    try { return document.hidden === true || (typeof document.hasFocus === 'function' && !document.hasFocus()); }
    catch (e) { return false; }
  }
  /* ⚠️ 되돌릴 때 «지금 깜빡이는 글자» 가 아니라 «내가 마지막으로 써 넣은 글자» 와 견준다 —
     깜빡이는 도중 두 번째 귓속말이 와 flashText 가 바뀌면, 화면 제목은 아직 옛 글자라
     «새 메시지 (1)» 이 영영 남았다(2026-11-04 함정 대조가 잡음). 남이 바꾼 제목은 건드리지 않는다. */
  function stopFlash() {
    if (flashTimer) { clearInterval(flashTimer); flashTimer = 0; }
    try { if (lastSet && document.title === lastSet && baseTitle) document.title = baseTitle; } catch (e) {}
    flashText = ''; lastSet = '';
  }
  function startFlash(label) {
    try {
      if (flashTimer) { flashText = label; return; }
      baseTitle = document.title;
      flashText = label;
      var on = false;
      flashTimer = setInterval(function () {
        if (!away()) { stopFlash(); return; }
        on = !on;
        try { document.title = lastSet = (on ? flashText : baseTitle); } catch (e) {}
      }, 1000);
    } catch (e) {}
  }
  try {
    document.addEventListener('visibilitychange', function () { if (!away()) stopFlash(); });
    window.addEventListener('focus', function () { stopFlash(); });
  } catch (e) {}

  /* 브라우저 알림 — 「확인」을 누르면 함께 닫는다(requireInteraction 이라 안 닫으면 바탕화면에 남는다). */
  var lastNote = null;
  function closeNote() {
    try { if (lastNote && lastNote.close) lastNote.close(); } catch (e) {}
    lastNote = null;
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (r) {
          if (r && r.getNotifications) r.getNotifications({ tag: 'vc-whisper' }).then(function (l) {
            for (var i = 0; i < l.length; i++) { try { l[i].close(); } catch (_) {} }
          }).catch(function () {});
        }).catch(function () {});
      }
    } catch (e) {}
  }
  function osNotify(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var opt = { body: String(body || '').slice(0, 140), tag: 'vc-whisper', renotify: true, requireInteraction: true };
      try {
        var n = new Notification(title, opt);
        n.onclick = function () { try { window.focus(); n.close(); } catch (e) {} };
        lastNote = n;
        return;
      } catch (e) { /* 안드로이드 크롬은 new Notification 을 막는다 — 아래 서비스워커로 */ }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(function (r) {
          if (r && r.showNotification) r.showNotification(title, opt);
        }).catch(function () {});
      }
    } catch (e) {}
  }

  /* 화면 공유 중인가 — idx-main.js 가 공유를 시작·멈출 때 세우는 표시(window.__vcScreenSharing).
     공유 중이면 카드가 학생 화면에 그대로 비친다 → 내용을 가려 두고 강사가 눌러야 보이게 한다. */
  function sharing() {
    try { return window.__vcScreenSharing === true; } catch (e) { return false; }
  }

  /* 수업을 나가면 카드를 치운다 — 카드가 «떠 있는 동안만» 2초마다 body class 를 «읽어서» 본다.
     ⛔ MutationObserver 로 body class 를 지켜보지 않는다(홈이 두 번 멎은 전력 — CLAUDE.md 2장).
     ⛔ 상주 타이머가 아니다 — 카드가 없어지면 그 자리에서 멈춘다.
     ⚠️ «수업 중에 그렸던 카드» 만 치운다 — 처음부터 vc-in-call 이 없던 화면에서 그린 카드를
        2초 만에 지우면 「못 봤다」가 그대로 재현된다. */
  var leaveTimer = 0;
  function inCall() {
    try { return !!(document.body && document.body.classList && document.body.classList.contains('vc-in-call')); }
    catch (e) { return false; }
  }
  function watchLeave() {
    if (leaveTimer || !inCall()) return;
    leaveTimer = setInterval(function () {
      if (!document.getElementById(CARD_ID)) { clearInterval(leaveTimer); leaveTimer = 0; return; }
      if (!inCall()) {
        clearInterval(leaveTimer); leaveTimer = 0;
        pending = []; killCard(); stopFlash(); closeNote();   // 나갔으니 «읽음» 은 보내지 않는다
      }
    }, 2000);
  }
  function alertAway(title, body) {
    if (!away()) return;
    startFlash(title);
    osNotify(title, body);
  }

  /* 확인 안 한 귓속말 — 카드는 «가장 최근 것» 을 보여 주고, 앞의 것은 채팅창에 남아 있다. */
  var pending = [];

  /* 참관자 이름 — 지금 화면은 참관 입장 때 늘 '관찰자' 를 보낸다(idx-main.js join-observe).
     그 기본값을 사람 이름처럼 이어 붙이면 「관찰자 관찰자 님의 메시지」·영어 화면에 한글이 된다
     (2026-11-04 함정 대조가 잡음). 기본값이면 «수업 관찰자» 로 일반화하고, 진짜 이름이 오면 그 이름을 쓴다. */
  var OBS_DEFAULT = { '': 1, '관찰자': 1, 'observer': 1, 'Observer': 1 };
  function obsName(d) {
    var n = String((d && d.from) || '').trim().slice(0, 40);
    return OBS_DEFAULT[n] ? '' : n;
  }
  function headOf(d, en) {
    var from = String((d && d.from) || '').slice(0, 40);
    if (d && d.observer === true) {
      var who = obsName(d);
      return en ? (who ? ('📢 Message from ' + who + ' (observer)') : '📢 Message from the class observer')
                : (who ? ('📢 관찰자 ' + who + ' 님의 메시지') : '📢 수업 관찰자의 메시지');
    }
    return en ? ('📢 Message from ' + (from || 'the office'))
              : (from ? ('📢 ' + from + ' 님의 메시지') : '📢 사무실에서 보낸 메시지');
  }

  /* 읽음 표시 — 참관자마다 한 번씩. 답장을 보낸 상대(exceptId)는 답장 자체가 «읽었다» 이므로 뺀다. */
  function markRead(exceptId) {
    var seen = {};
    for (var i = 0; i < pending.length; i++) {
      var d = pending[i];
      var id = String((d && d.fromId) || '');
      if (!id || id === exceptId || seen[id]) continue;
      seen[id] = 1;
      sendWs({ type: 'observer-whisper-reply',
               data: { toUserId: id, read: true, ref: Number(d.at) || 0 } });
    }
  }
  function closeStaffCard() {
    pending = [];
    killCard();
    stopFlash();
    closeNote();
  }

  function renderStaffCard() {
    var d = pending[pending.length - 1];
    if (!d) { killCard(); return; }
    var en = isEn();
    var text = String(d.message || '').trim();
    var urgent = String(d.urgency || 'normal') === 'urgent';
    var canReply = !!String(d.fromId || '');

    /* 답장을 쓰는 도중 새 귓속말이 오면 카드를 다시 그린다 — 쓰던 글을 잃지 않게 옮겨 담는다.
       ⚠️ «같은 참관자» 일 때만 — 다른 참관자의 글이 왔는데 옮기면 A 에게 쓰던 답이 B 에게 간다. */
    var draft = '', draftFocus = false;
    try {
      var prevCard = document.getElementById(CARD_ID);
      var prevInp = prevCard && prevCard.querySelector('[data-vcw-input]');
      if (prevInp && prevCard.getAttribute('data-vcw-to') === String(d.fromId || '')) {
        draft = prevInp.value;
        draftFocus = document.activeElement === prevInp;
      }
    } catch (e) {}

    ensureStyle();
    killCard();
    var card = el('div',
        'position:fixed;left:50%;transform:translateX(-50%);top:' + cardTop() + 'px;z-index:' + CARD_Z + ';'
      + 'width:min(92vw,440px);box-sizing:border-box;padding:14px 16px 12px;border-radius:16px;'
      + 'background:' + (urgent ? '#fff1ef' : '#fff8db') + ';color:#1b1f27;'
      + 'border:3px solid ' + (urgent ? '#d93025' : '#f5a524') + ';'
      + 'font-family:inherit;font-size:14px;line-height:1.5;text-align:left;'
      + 'box-shadow:0 18px 48px -12px rgba(0,0,0,.6)');
    card.id = CARD_ID;
    card.setAttribute('data-vcw-to', String(d.fromId || ''));
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-live', 'assertive');
    card.setAttribute('aria-label', headOf(d, en));
    /* 자동 번역(i18n-sweep)이 보낸 사람의 글을 사전 문구로 바꿔 끼우지 않게 한다 — 표준 옵트아웃. */
    card.setAttribute('translate', 'no');
    card.className = 'notranslate';
    /* 카드 안에서 치는 글자가 수업 화면 단축키로 새지 않게 막는다. */
    ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown'].forEach(function (ev) {
      card.addEventListener(ev, function (e) { e.stopPropagation(); });
    });

    var top = el('div', 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px');
    top.appendChild(el('div', 'flex:1;min-width:0;font-size:13px;font-weight:900;color:' + (urgent ? '#a61b12' : '#8a5a00'), headOf(d, en)));
    top.appendChild(el('div', 'flex:0 0 auto;font-size:11.5px;font-weight:700;color:#6b6b6b', hhmm(d.at)));
    card.appendChild(top);

    var b = el('div', 'font-size:17px;font-weight:800;word-break:break-word;white-space:pre-wrap;margin:2px 0 6px');
    /* 🖥 화면 공유 중이면 이 카드가 학생 화면에 그대로 비친다 — 내용을 가려 두고, 강사가 눌러야 보인다.
       (2026-11-04 함정 대조: 카드가 「확인」 전까지 남게 되면서 노출 시간이 길어졌다) */
    var masked = sharing();
    if (masked) {
      card.appendChild(el('div', 'font-size:12px;font-weight:800;color:#a61b12;margin:2px 0 6px',
        en ? '⚠ You are sharing your screen — the message is hidden so students cannot read it.'
           : '⚠ 화면 공유 중 — 학생 화면에 비칠 수 있어 내용을 가려 두었어요.'));
      var reveal = el('button',
        'padding:7px 12px;border-radius:10px;border:1.5px solid #b58a2a;background:#fff;color:#4a3b12;font-size:13px;font-weight:800',
        en ? '👁 Show message' : '👁 내용 보기');
      reveal.type = 'button';
      reveal.setAttribute('data-vcw-reveal', '1');
      tap(reveal, function () {
        try { b.textContent = text; if (reveal.parentNode) reveal.parentNode.removeChild(reveal); } catch (_) {}
      });
      b.appendChild(reveal);
    } else {
      b.textContent = text;                      // ⚠️ textContent — 보낸 사람이 쓴 글을 HTML 로 넣지 않는다
    }
    card.appendChild(b);

    if (pending.length > 1) {
      card.appendChild(el('div', 'font-size:12px;font-weight:700;color:#8a5a00;margin-bottom:6px',
        en ? (pending.length + ' new messages · earlier ones are in the chat')
           : ('새 메시지 ' + pending.length + '개 · 앞의 메시지는 채팅창에 있습니다')));
    }

    var err = el('div', 'display:none;font-size:12px;font-weight:800;color:#b3261e;margin:4px 0');
    function fail(msg) { err.textContent = msg; err.style.display = 'block'; }

    function reply(msg) {
      var t = String(msg || '').trim().slice(0, 500);
      if (!t) return false;
      var ok = sendWs({ type: 'observer-whisper-reply',
                        data: { toUserId: String(d.fromId), message: t, ref: Number(d.at) || 0 } });
      if (!ok) {
        fail(en ? 'Not sent — the class connection is down. Please try again.'
                : '수업 연결이 끊겨 보내지 못했어요. 다시 눌러 주세요.');
        return false;
      }
      markRead(String(d.fromId));
      closeStaffCard();
      return true;                               // 「보냈다/못 갔다」는 서버 회신(ack)이 채팅창에 남긴다
    }

    if (canReply) {
      card.appendChild(el('div', 'font-size:11.5px;font-weight:700;color:#5f5a4c;margin:2px 0 6px',
        masked ? (en ? '🔒 Reply goes to the observer only (not sent to students)'
                     : '🔒 답장은 관찰자에게만 갑니다 (학생에게는 안 보냅니다)')
               : (en ? '🔒 Reply goes to the observer only · students cannot see it'
                     : '🔒 답장은 관찰자에게만 갑니다 · 학생에게는 보이지 않습니다')));
      var quick = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px');
      var QUICK = en ? ['👍 OK', '✅ Got it, thank you', '⏳ One moment, please']
                     : ['👍 네', '✅ 확인했습니다', '⏳ 잠시만요'];
      QUICK.forEach(function (q) {
        var qb = el('button',
          'padding:7px 11px;border-radius:99px;border:1.5px solid #e0b34a;background:#fff;color:#4a3b12;font-size:13px;font-weight:800', q);
        qb.type = 'button';
        qb.setAttribute('data-vcw-quick', '1');
        tap(qb, function () { reply(q); });
        quick.appendChild(qb);
      });
      card.appendChild(quick);

      var row = el('div', 'display:flex;gap:6px;align-items:stretch');
      var inp = el('input',
        'flex:1;min-width:0;padding:9px 11px;border-radius:10px;border:1.5px solid #e0b34a;background:#fff;color:#1b1f27;font-size:14px');
      inp.type = 'text';
      inp.maxLength = 500;
      inp.setAttribute('data-vcw-input', '1');
      inp.placeholder = en ? 'Type a reply to the observer…' : '관찰자에게 답장 쓰기…';
      inp.setAttribute('aria-label', en ? 'Reply to the observer' : '관찰자에게 답장');
      var send = el('button',
        'flex:0 0 auto;padding:9px 14px;border-radius:10px;border:0;background:#1a73e8;color:#fff;font-size:14px;font-weight:900',
        en ? 'Send' : '보내기');
      send.type = 'button';
      send.setAttribute('data-vcw-send', '1');
      tap(send, function () { reply(inp.value); });
      inp.addEventListener('keydown', function (e) {
        /* ⚠️ 한글 입력 중(조합 중) Enter 는 «글자 확정» 이다 — 그때 보내면 마지막 글자가 빠진다. */
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); reply(inp.value); }
      });
      row.appendChild(inp); row.appendChild(send);
      card.appendChild(row);
    } else if (!masked) {
      card.appendChild(el('div', 'font-size:11.5px;font-weight:700;color:#5f5a4c;margin:2px 0 4px',
        en ? '🔒 Students cannot see this message' : '🔒 학생에게는 보이지 않는 메시지입니다'));
    }
    card.appendChild(err);

    var foot = el('div', 'display:flex;align-items:center;gap:8px;margin-top:10px');
    var spacer = el('div', 'flex:1;min-width:0');
    try {
      /* 🔔 브라우저 알림 권한 — 사람이 눌렀을 때만 묻는다(수업 중 갑자기 묻는 창을 띄우지 않는다). */
      if ('Notification' in window && Notification.permission === 'default' && Notification.requestPermission) {
        var nb = el('button',
          'padding:6px 9px;border-radius:8px;border:1px dashed #b58a2a;background:transparent;color:#6b4f10;font-size:12px;font-weight:700',
          en ? '🔔 Alert me in other tabs too' : '🔔 다른 탭에서도 알림 받기');
        nb.type = 'button';
        tap(nb, function () {
          try {
            var p = Notification.requestPermission();
            if (p && p.then) p.then(function () { try { nb.remove(); } catch (_) {} });
          } catch (_) {}
        });
        spacer.appendChild(nb);
      }
    } catch (e) {}
    foot.appendChild(spacer);
    var okb = el('button',
      'flex:0 0 auto;padding:9px 18px;border-radius:10px;border:0;background:' + (urgent ? '#d93025' : '#f5a524') + ';color:#1b1f27;font-size:14px;font-weight:900',
      en ? 'OK, got it' : '확인');
    okb.type = 'button';
    okb.setAttribute('data-vcw-ok', '1');
    tap(okb, function () { markRead(''); closeStaffCard(); });
    foot.appendChild(okb);
    card.appendChild(foot);

    document.body.appendChild(card);
    if (draft) {
      try {
        var ni = card.querySelector('[data-vcw-input]');
        if (ni) { ni.value = draft; if (draftFocus) ni.focus(); }
      } catch (e) {}
    }
    watchLeave();
  }

  /* 강사·직원에게 온 귓속말 — 카드 + 소리 + (다른 탭이면) 제목 깜빡임·브라우저 알림 + 채팅창 기록 */
  function showStaff(d) {
    var text = String((d && d.message) || '').trim();
    if (!text) return;
    var en = isEn();
    pending.push(d);
    if (pending.length > 20) pending.shift();
    /* 화면 공유 중이면 채팅창·브라우저 알림에도 내용을 싣지 않는다(둘 다 공유 화면에 비칠 수 있다). */
    var masked = sharing();
    chatLine(headOf(d, en) + (masked
      ? (en ? ' (hidden while screen sharing — open it on the card)' : ' (화면 공유 중이라 내용은 카드에서 확인)')
      : (': “' + text + '”')));
    renderStaffCard();
    ding(String(d.urgency || 'normal') === 'urgent');
    alertAway(en ? ('📢 New message (' + pending.length + ')') : ('📢 새 메시지 (' + pending.length + ')'),
              masked ? headOf(d, en) : (headOf(d, en) + ' — ' + text));
  }

  /* ── 참관자 화면 — 강사가 보낸 답장·읽음 표시 ───────────────────────────────── */
  function showReply(d) {
    var text = String((d && d.message) || '').trim();
    if (!text) return;
    var en = isEn();
    var from = String(d.from || '').slice(0, 40) || (en ? 'The teacher' : '강사');
    var head = en ? ('💬 Reply from ' + from) : ('💬 ' + from + ' 님의 답장');
    chatLine(head + ': “' + text + '”');

    ensureStyle();
    killCard();
    var card = el('div',
        'position:fixed;left:50%;transform:translateX(-50%);top:' + cardTop() + 'px;z-index:' + CARD_Z + ';'
      + 'width:min(92vw,420px);box-sizing:border-box;padding:13px 15px 11px;border-radius:16px;'
      + 'background:#eaf7ee;color:#13261a;border:3px solid #2e9e5b;'
      + 'font-family:inherit;font-size:14px;line-height:1.5;text-align:left;'
      + 'box-shadow:0 18px 48px -12px rgba(0,0,0,.6)');
    card.id = CARD_ID;
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-live', 'assertive');
    card.setAttribute('aria-label', head);
    card.setAttribute('translate', 'no');
    card.className = 'notranslate';
    var top = el('div', 'display:flex;align-items:baseline;gap:8px;margin-bottom:4px');
    top.appendChild(el('div', 'flex:1;min-width:0;font-size:13px;font-weight:900;color:#1d6b3c', head));
    top.appendChild(el('div', 'flex:0 0 auto;font-size:11.5px;font-weight:700;color:#5c6b61', hhmm(d.at)));
    card.appendChild(top);
    var b = el('div', 'font-size:17px;font-weight:800;word-break:break-word;white-space:pre-wrap;margin:2px 0 8px');
    b.textContent = text;
    card.appendChild(b);
    var foot = el('div', 'display:flex;align-items:center;gap:8px');
    foot.appendChild(el('div', 'flex:1;min-width:0;font-size:11.5px;font-weight:700;color:#4b5a50',
      en ? '🔒 Only you can see this · write back in the whisper box'
         : '🔒 나에게만 보이는 답장 · 다시 보내려면 귓속말 칸에 쓰세요'));
    var okb = el('button',
      'flex:0 0 auto;padding:8px 16px;border-radius:10px;border:0;background:#2e9e5b;color:#fff;font-size:14px;font-weight:900',
      en ? 'OK' : '확인');
    okb.type = 'button';
    okb.setAttribute('data-vcw-ok', '1');
    tap(okb, function () { killCard(); stopFlash(); });
    foot.appendChild(okb);
    card.appendChild(foot);
    document.body.appendChild(card);
    watchLeave();

    ding(false);
    alertAway(en ? '💬 Teacher replied' : '💬 강사 답장', head + ' — ' + text);
  }
  function showRead(d) {
    var en = isEn();
    var from = String((d && d.from) || '').slice(0, 40) || (en ? 'The teacher' : '강사');
    var line = en ? ('✓ ' + from + ' has read your message.') : ('✓ ' + from + ' 님이 메시지를 확인했습니다.');
    chatLine(line);
    toast(line);
  }

  /* 참관자 본인에게 오는 회신. 「보냈다/못 보냈다」를 **두 곳**에 남긴다.
     ⚠️ 토스트만 띄우면 안 된다 — 참관자 메시지는 방에 안 뿌려지므로 채팅창에 에코가 없고,
        토스트는 몇 초 뒤 사라진다. 그래서 2026-08-26 사장님 화면에서 「채팅창에 아무것도
        문자 써도 안 나타난다」가 됐다(시스템 안내만 있고 내가 쓴 글은 흔적이 없었다).
        → 채팅창에 «보낸 기록» 을 한 줄 남긴다. 이건 내 화면에만 그리는 것이라
          방에는 한 글자도 나가지 않는다(vcAddChatSystem 은 순수 화면 함수다).
     (2026-11-04) 강사가 참관자에게 보낸 «답장» 의 회신(kind:'reply-ack')도 여기로 온다. */
  function ack(d) {
    d = d || {};
    var n = Number(d.delivered || 0), en = isEn();
    var who = String(d.toName || d.to || '').trim() || (en ? 'that person' : '그 사람');
    var line;
    if (d.kind === 'reply-ack') {
      /* 참관자 이름은 늘 '관찰자' 라(obsName 주석) 이름 대신 «관찰자» 로 말한다.
         실패는 서버가 준 이유(reason)로 갈라 말한다 — 문구 하나로 뭉치면 «왜» 를 알 수 없다. */
      if (n > 0) {
        line = en ? 'Reply sent to the observer only.' : '관찰자에게만 답장했습니다.';
      } else if (d.reason === 'send_failed') {
        line = en ? 'The reply could not be sent because of a connection error. Please try again.'
                  : '연결 오류로 답장이 가지 않았습니다. 다시 보내 주세요.';
      } else {
        line = en ? 'The observer has left or reconnected, so the reply was not delivered. You can reply when they message again.'
                  : '관찰자가 방을 나갔거나 다시 접속해 답장이 전달되지 않았습니다. 관찰자가 다시 보내면 답할 수 있어요.';
      }
    } else if (d.to) {
      line = n > 0
        ? (en ? ('Sent to ' + who + ' only.') : (who + ' 님에게만 전달했습니다.'))
        : (en ? (who + ' is not in the room, so it was not delivered.')
              : (who + ' 님이 방에 없어 전달되지 않았습니다.'));
    } else {
      line = n > 0
        ? (en ? ('Sent to ' + n + ' teacher(s).') : ('강사 ' + n + '명에게 전달했습니다.'))
        : (en ? 'No teacher is in the room right now.' : '지금 방에 강사가 없어 전달되지 않았습니다.');
    }
    var mark = n > 0 ? (d.kind === 'reply-ack' ? '↩ ' : '📢 ') : '⚠ ';
    try {
      var body = String(d.message || '').trim();
      if (typeof window.vcAddChatSystem === 'function') {
        window.vcAddChatSystem(mark + line + (body ? (' — \"' + body + '\"') : ''));
      }
    } catch (e) {}
    try { if (typeof showToast === 'function') showToast(mark + line); } catch (e) {}
  }

  window.vcWhisperOn = function (type, data) {
    try {
      if (type === 'admin-whisper-ack') { ack(data); return; }
      var d = data || {};
      /* 🎯 «나를 콕 집어» 보낸 귓속말 — 학생도 받는다 (2026-08-26 사장님 지시).
         서버는 그 사람 소켓 하나에만 보내지만, 여기서도 받는 사람 id 를 확인한다.
         서버가 언젠가 회귀해 전원에게 뿌려도 남에게 간 글이 내 화면에 뜨지 않는다.
         ⚠️ 내 id 는 window 가 아니라 어휘 바인딩으로 읽는다(myUid 주석 참고). */
      if (d.direct === true) {
        var me = myUid();
        if (!me || !d.to || String(d.to) !== me) return;
        /* ↩ (2026-11-04) 강사가 참관자에게 보낸 답장·읽음 — 서버가 «진짜 참관자» 소켓에만 보낸다. */
        if (d.kind === 'reply') { showReply(d); return; }
        if (d.kind === 'read') { showRead(d); return; }
        /* 직원(강사)을 콕 집은 것 → 확인 전까지 남는 카드. 학생 → 예전 작은 상자 그대로. */
        if (d.toStaff === true) { showStaff(d); return; }
        show(d);
        return;
      }
      /* 🔒 이중 방어 — 서버가 staff 소켓에만 보내지만 여기서 한 번 더 본다.
         내 역할이 강사·관리자가 아니면 **그리지 않는다.** */
      var role = window.vcMyRole || '';
      if (role !== 'teacher' && role !== 'admin') return;
      showStaff(d);
    } catch (e) {}
  };

  // 이 파일이 오기 전에 쌓인 것을 비운다(idx-main.js 가 담아 둔다)
  try {
    var q = window.__vcWhisperQ;
    if (q && q.length) {
      window.__vcWhisperQ = [];
      for (var i = 0; i < q.length; i++) window.vcWhisperOn(q[i][0], q[i][1]);
    }
  } catch (e) {}
})();
