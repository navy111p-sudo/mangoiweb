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

   되돌리기: index.html 의 이 <script> 한 줄만 지우면 된다. idx-main.js 의 위임 5줄은
     window.vcWhisperOn 이 없으면 큐에만 쌓고 아무 일도 하지 않는다(무해).
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.vcWhisperOn) return;               // 중복 로드 방지

  var BOX_ID = 'vc-whisper-box';

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

  /* 참관자 본인에게 오는 회신. 「보냈다/못 보냈다」를 **두 곳**에 남긴다.
     ⚠️ 토스트만 띄우면 안 된다 — 참관자 메시지는 방에 안 뿌려지므로 채팅창에 에코가 없고,
        토스트는 몇 초 뒤 사라진다. 그래서 2026-08-26 사장님 화면에서 「채팅창에 아무것도
        문자 써도 안 나타난다」가 됐다(시스템 안내만 있고 내가 쓴 글은 흔적이 없었다).
        → 채팅창에 «보낸 기록» 을 한 줄 남긴다. 이건 내 화면에만 그리는 것이라
          방에는 한 글자도 나가지 않는다(vcAddChatSystem 은 순수 화면 함수다). */
  function ack(d) {
    d = d || {};
    var n = Number(d.delivered || 0), en = isEn();
    var who = String(d.toName || d.to || '').trim() || (en ? 'that person' : '그 사람');
    var line;
    if (d.to) {
      line = n > 0
        ? (en ? ('Sent to ' + who + ' only.') : (who + ' 님에게만 전달했습니다.'))
        : (en ? (who + ' is not in the room, so it was not delivered.')
              : (who + ' 님이 방에 없어 전달되지 않았습니다.'));
    } else {
      line = n > 0
        ? (en ? ('Sent to ' + n + ' teacher(s).') : ('강사 ' + n + '명에게 전달했습니다.'))
        : (en ? 'No teacher is in the room right now.' : '지금 방에 강사가 없어 전달되지 않았습니다.');
    }
    var mark = n > 0 ? '📢 ' : '⚠ ';
    try {
      var body = String(d.message || '').trim();
      if (typeof window.vcAddChatSystem === 'function') {
        window.vcAddChatSystem(mark + line + (body ? (' \u2014 \"' + body + '\"') : ''));
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
        show(d);
        return;
      }
      /* 🔒 이중 방어 — 서버가 staff 소켓에만 보내지만 여기서 한 번 더 본다.
         내 역할이 강사·관리자가 아니면 **그리지 않는다.** */
      var role = window.vcMyRole || '';
      if (role !== 'teacher' && role !== 'admin') return;
      show(d);
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
