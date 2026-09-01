/* idx-vc-dupghost.js — 화상수업 「같은 사람이 두 명으로 보인다」 유령 타일 청소 (2026-08-20)
 * ─────────────────────────────────────────────────────────────────────────────
 * [신고] 2026-08-20 사장님 — "왜 3명이 나와?" / "학생이 두 명 나와" / "jeong 이 두 명이야"
 *        + 그 유령 타일에 「🎤 상대 소리가 안 와요」 빨간 띠가 계속 떠 있었다.
 *
 * [원인] 서버(video-call-room.ts)에 «N초 응답 없으면 내보낸다» 판정이 없어서,
 *        휴대폰이 종료 신호 없이 끊기면 죽은 소켓이 방 명단에 그대로 남는다.
 *        D1 실측: 25분간 학생 7회 재입장, 2건은 퇴장 기록조차 없음.
 *        퇴장 시각은 HTTP 로 기록되는데 WebSocket 만 먼저 죽으므로,
 *        **출석표는 「정상 퇴장」인데 화상방엔 계속 앉아 있는** 어긋남이 생긴다.
 *
 * [이 파일의 역할 — 화면 쪽 즉효 완화책]
 *        서버 청소(생존 판정 알람)는 최장 2분 걸린다. 그 2분 동안에도
 *        ① 「3명」으로 보이고 ② 오경보 띠가 뜨고 ③ 고착 워치독이 유령을 살리려고
 *        피어당 최대 4회 강제 재연결을 걸어 **진짜 교사 연결을 흔든다.**
 *        그래서 화면 쪽에서 먼저 지운다. 서버 대책(A-1)과 짝이지 대체재가 아니다.
 *
 * [지우는 조건 — 좁게 잡는다. 진짜 참가자를 지우면 그게 더 큰 사고다]
 *        아래 ①②를 모두 만족할 때만 지운다.
 *        ① 그 타일이 GHOST_MS 넘게 «영상도 소리도 한 번도 못 받은» 상태
 *           (수신 트랙이 하나도 live 가 아니고 「📷 연결 중…」 힌트가 그대로)
 *        ② 그리고 둘 중 하나
 *           · 이름이 **내 이름과 같다** → 내 옛 세션이 확실하다. 남일 수가 없다.
 *           · 같은 이름의 **다른 원격 타일이 실제로 영상을 받고 있다** → 그쪽이 진짜다.
 *
 * ⚠️ 이름이 같기만 하면 지우는 식으로 넓히지 말 것.
 *    가족 공용 계정처럼 «같은 이름 두 사람» 이 실제로 있을 수 있고,
 *    양쪽이 서로를 지우면 CLAUDE.md 가 경고하는 «무한 킥 루프» 가 된다.
 *    반드시 «한쪽은 멀쩡히 영상이 오는» 비대칭이 확인될 때만 지운다.
 *
 * ⚠️ idx-main.js 에 넣지 않고 별도 파일 + defer 로 둔 이유 —
 *    idx-main.js 는 849KB 이고 학생 29,000명이 첫 화면에서 전부 받는다.
 *    first_paint_budget_harness 의 여유가 12KB 뿐이다(CLAUDE.md 함정표).
 */
(function () {
  if (window.__vcDupGhost) return;
  window.__vcDupGhost = true;

  var GHOST_MS = 20000;   // 이 시간 넘게 아무것도 못 받으면 유령 후보
  var TICK_MS  = 3000;

  /** 이름표를 비교용으로 다듬는다 — 「jeong (나)」·「jeong (Me)」·「교사 강선생님」 앞뒤 공백 등 */
  function normName(s) {
    return String(s || '')
      .replace(/\s*\((?:나|Me)\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function myName() {
    var el = document.getElementById('vc-local-label');
    return normName(el && el.textContent);
  }

  /* 💀 (2026-09-01 class-1015) «한 번은 붙었다가 죽은» 연결 — 강사 재접속 때 남는 옛 연결이 이것이다.
     지금까지 이 파일은 «한 번도 못 받은» 타일만 유령으로 봤다. 그래서 붙었다가 죽은 연결은
     명단에도 화면에도 그대로 남았고, mesh 라 **내 업로드가 죽은 상대에게도 계속 나갔다.**
     ⚠️ 'disconnected' 는 넣지 않는다 — 필리핀·중국 회선에서 몇 초씩 흔한 «잠깐» 상태이고
        대개 스스로 돌아온다. 여기서 지우면 멀쩡한 수업이 끊긴다. 되돌아올 수 없는 상태만 본다.
     ⚠️ 그리고 이 판정만으로 지우지 않는다 — 아래 sweep 의 «비대칭 확인»(내 이름이거나,
        같은 이름의 다른 타일이 실제로 수신 중)을 그대로 통과해야 지운다. */
  function deadPc(userId) {
    try {
      var pc = (window.vcPeerConnections || {})[userId];
      if (!pc) return false;
      return pc.connectionState === 'failed' || pc.connectionState === 'closed'
          || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed';
    } catch (e) { return false; }
  }

  /** 이 피어에게서 지금 실제로 무언가 도착하고 있나 */
  function hasLiveTrack(userId) {
    try {
      var pc = (window.vcPeerConnections || {})[userId];
      if (!pc || !pc.getReceivers) return false;
      return pc.getReceivers().some(function (r) {
        return r.track && r.track.readyState === 'live';
      });
    } catch (e) { return false; }
  }

  /** 원격 참가자 타일만 모은다 (내 박스·이미 «재연결 중»으로 표시된 유령은 제외) */
  function remoteBoxes() {
    var grid = document.getElementById('vc-video-grid');
    if (!grid) return [];
    return Array.prototype.slice.call(grid.querySelectorAll(':scope > .video-box'))
      .filter(function (b) {
        var id = b.id || '';
        if (id.indexOf('vc-video-') !== 0) return false;      // vc-local-box·vcghost-* 제외
        return id.slice('vc-video-'.length) !== 'pane';
      });
  }

  function labelOf(box) {
    var l = box.querySelector('.video-label');
    return normName(l && l.textContent);
  }

  /* 👤 참여자 수는 서버가 준 숫자(userCount)를 그대로 그린다. 유령이 그 안에 들어 있으므로
     타일을 지워도 「3명」이 그대로 남는다 → 화면에 실제로 있는 타일 수로 상한을 건다.
     ⚠️ 서버 숫자를 «늘리는» 방향으로는 절대 건드리지 않는다(줄이기만 한다). */
  function visibleCount() {
    return 1 + remoteBoxes().length;   // 나 + 원격 타일
  }
  (function wrapCount() {
    var orig = window.updateUserCount;
    if (typeof orig !== 'function' || orig.__vcDupWrapped) return;
    var wrapped = function (count) {
      var n = count || 0;
      window.__vcServerUserCount = n;
      try { if (!window._vcObserverMode) n = Math.min(n, visibleCount()); } catch (e) {}
      return orig.call(this, n);
    };
    wrapped.__vcDupWrapped = true;
    window.updateUserCount = wrapped;
  })();

  function repaintCount() {
    try {
      if (typeof window.updateUserCount === 'function' && window.__vcServerUserCount != null) {
        window.updateUserCount(window.__vcServerUserCount);
      }
    } catch (e) {}
  }

  function drop(box, userId, why) {
    try { console.warn('[vc-dupghost] 유령 타일 정리:', userId, why); } catch (e) {}
    /* 🔴 사유(reason)를 **비워서** 부른다. 두 가지를 동시에 피하려면 이 값밖에 없다.
         · 'dropped' 로 부르면 → 20초짜리 «재연결 중» 유령 타일로 바뀐다(치우려던 것이 또 남는다).
         · 'left'    로 부르면 → index.html 의 vcRemovePeer 후킹이 «상대가 나갔다» 로 보고
                                 10초 뒤 remoteCount()===0 이면 **수업 종료 흐름(endOfClassFlow)** 을 돌린다.
                                 교사가 아직 안 들어온 학생 화면에서 내 옛 세션 하나를 치웠을 뿐인데
                                 「수업이 끝났어요」가 뜬다.
         · 사유 없음 → vcRemovePeer 의 `box && reason` 가 거짓이라 타일을 «완전히» 지우고,
                       후킹의 `if (reason !== 'left') return` 에 걸려 종료 흐름도 안 탄다. 둘 다 만족. */
    try {
      if (typeof window.vcRemovePeer === 'function') { window.vcRemovePeer(userId); }
      else { box.remove(); }
    } catch (e) { try { box.remove(); } catch (e2) {} }
    try { window.vcUpdateGridCount && window.vcUpdateGridCount(); } catch (e) {}
    repaintCount();
  }

  /* 🎤 (2026-08-20) 「🎤 상대 소리가 안 와요 (상대방 마이크 확인)」 오경보 차단.
   * [신고] 사장님 화면의 검은 유령 타일에 이 빨간 띠가 계속 떠 있었다 — 교사 마이크는 멀쩡했다.
   * [원인] idx-main.js 의 오디오 감시견이 «아직 한 번도 안 붙은 상대»(유령·협상 실패)와
   *        «붙었는데 마이크가 죽은 상대» 를 구분하지 않는다. 앞쪽은 마이크 문제가 아니라 연결 문제라,
   *        「상대방 마이크 확인」은 거짓말이고 학생·강사를 엉뚱한 곳으로 보낸다.
   * [왜 여기서 고치나] 감시견 안에서 고치는 것이 제자리지만, idx-main.js 는 849KB 이고
   *        first_paint 예산에 여유가 0KB 다(2026-08-20 실측: main 이 이미 상한 1549KB). 이 파일은 defer 라
   *        blocking 예산에 잡히지 않는다. 예산에 여유가 생기면 감시견 쪽으로 옮기는 것이 낫다.
   * [방법] 띄운 뒤 지우면 3초마다 깜빡인다. 그래서 «띄우기 전에» 막는다 —
   *        감시견은 pc.__audPrev.noTrack 이 3틱 연속이어야 띄우므로, 붙은 적 없는 상대의 그 값을 되돌린다.
   *        두 타이머 모두 3초라 값은 1을 못 넘는다. 이미 떠 있던 띠는 함께 걷는다(안전망). */
  function muteFalseAudioAlarm(box, userId, everConnected) {
    if (everConnected) return;
    try {
      var pc = (window.vcPeerConnections || {})[userId];
      if (pc && pc.__audPrev) pc.__audPrev.noTrack = 0;
      var h = box.querySelector('.vc-noaudio-hint');
      if (h) h.remove();
    } catch (e) {}
  }

  function sweep() {
    if (!document.body || !document.body.classList.contains('vc-in-call')) return;
    if (window._vcObserverMode) return;          // 👁 참관자 화면은 건드리지 않는다
    var boxes = remoteBoxes();
    if (!boxes.length) return;

    var now = Date.now();
    var mine = myName();

    /* 이름별로 «실제로 붙어 있는 타일이 있는가» 를 먼저 센다.
       판정은 두 가지를 OR 로 본다 —
         · 수신 트랙이 live 다
         · 「📷 연결 중…」 힌트가 이미 걷혔다 = vcAddRemoteVideo 가 한 번은 돌았다(영상이 왔었다)
       힌트 쪽이 더 확실하다. 트랙은 순간적으로 muted/전환 중일 수 있어 혼자 두면 오판한다. */
    var liveByName = {};
    var info = boxes.map(function (box) {
      var userId = box.id.slice('vc-video-'.length);
      var name = labelOf(box);
      var noHint = !box.querySelector('.vc-connecting-hint');
      var dead = deadPc(userId);                              // 💀 붙었다가 죽은 연결(위 helper)
      if (dead) { if (!box.__vcDeadSince) box.__vcDeadSince = now; }
      else box.__vcDeadSince = 0;
      var ok = (noHint || hasLiveTrack(userId)) && !dead;
      if (!box.__vcFirstSeen) box.__vcFirstSeen = now;
      if (ok) liveByName[name] = true;
      muteFalseAudioAlarm(box, userId, ok);   // 🎤 붙은 적 없는 상대에게 마이크 탓을 하지 않는다
      /* 죽은 연결은 «죽은 뒤로» 시간을 센다. 처음 본 시각으로 세면 수업 10분째에 죽자마자
         지워져서 «잠깐 흔들린 것» 과 구분이 안 된다. */
      var since = dead ? box.__vcDeadSince : box.__vcFirstSeen;
      return { box: box, userId: userId, name: name, ok: ok, age: now - since };
    });

    info.forEach(function (it) {
      if (it.ok) return;                                     // 붙어 있는 타일은 절대 안 건드린다
      if (it.age < GHOST_MS) return;                         // 아직 붙는 중일 수 있다
      if (!it.name) return;                                  // 이름을 못 읽으면 판단 불가 → 그냥 둔다

      if (mine && it.name === mine) { drop(it.box, it.userId, '내 이름과 같은 원격 타일 = 내 옛 세션'); return; }
      if (liveByName[it.name])      { drop(it.box, it.userId, '같은 이름의 다른 타일이 정상 수신 중'); return; }
    });

    // 유령이 없어도 서버 숫자가 타일보다 크면(=서버가 아직 안 지운 유령) 표시만 맞춘다
    repaintCount();
  }

  try { setInterval(sweep, TICK_MS); } catch (e) {}

  /* 🚪 (2026-08-20) 떠날 때 한 번 더 «나갑니다» 를 보낸다 — 유령이 생기는 것을 애초에 줄인다.
     [왜] 지금은 나가기 버튼(vcLeaveRoom)에서만 leave-room 을 보낸다. 그런데 실제 사고 기록을 보면
       25분간 7번 들어온 세션 중 2건은 **퇴장 기록조차 없었다** — 버튼을 안 누르고 뒤로가기·주소이동·
       탭닫기로 떠난 것이다. 그 경우 서버는 소켓이 실제로 끊길 때까지 그 사람을 방에 앉혀 둔다.
     [무엇] pagehide 는 뒤로가기·주소이동·탭닫기·앱전환에서 발화한다. 소켓이 아직 살아 있으면
       그 자리에서 정상 퇴장으로 처리돼 상대 화면의 타일이 즉시 사라진다.
     ⚠️ 소켓이 이미 죽어 있으면 이 신호도 못 간다 — 그때를 위한 것이 서버측 생존 판정(A-1)이다.
       둘은 짝이고, 어느 하나로 대체되지 않는다. */
  try {
    window.addEventListener('pagehide', function (e) {
      try {
        /* 🔴 e.persisted === true 는 «페이지가 살아 있는 채로 뒤로 물러난 것»(bfcache) 이다.
           앱 전환·화면잠금에서도 이 형태로 뜨는 브라우저가 있는데, 그때 leave-room 을 보내면
           서버가 reason='left' 로 방송하고 → index.html 의 vcRemovePeer 후킹이 10초 뒤
           **학생 화면에 「수업이 끝났어요」를 띄운다.** 교사가 폰을 잠깐 내려놓은 것뿐인데 수업이 끝난다.
           (CLAUDE.md: dropped 로는 종료하지 않지만 **left 로는 종료한다** — 그래서 left 는 함부로 못 보낸다)
           진짜로 문서가 헐리는 경우(persisted=false)에만 보낸다. */
        if (e && e.persisted) return;
        if (!document.body || !document.body.classList.contains('vc-in-call')) return;
        var c = window.vcConn;
        if (c && typeof c.send === 'function') c.send({ type: 'leave-room', data: {} });
      } catch (e2) {}
    });
  } catch (e) {}
})();
