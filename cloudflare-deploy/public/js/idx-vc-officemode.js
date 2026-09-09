/* 🏢 사무실 모드 — 옆자리 교사 목소리가 학생에게 덜 들리게 «내 마이크 입력» 을 가공한다.
   (2026-09-08 사장님 요청 — 「사무실에서 주변 교사 목소리가 들리지 않게」)

   🔛 기본값 = 켜짐 (2026-09-09 사장님 「교사한테 항상 켜지는 것을 디폴트값으로」)
      · 저장값이 «없으면» 켜고, «'0'(사람이 껐음)» 이면 켜지 않는다 — 아래 pref()/wantOn() 참고.
      · «교사인가» 는 저장값이 아니라 실제로 거는 자리(armOnce → isStaff)가 봅니다.
        학생 브라우저에서는 armOnce 가 돌아도 아무 일도 안 하고 20초 뒤 끝납니다.

   ⚠️ 먼저 알아 둘 것 — 브라우저의 noiseSuppression 은 «사람 목소리» 를 못 지운다.
      그 엔진은 에어컨·팬·키보드 같은 «일정한 잡음» 을 겨냥해 만든 것이고, 옆자리 목소리는
      «지워야 할 잡음» 이 아니라 «지켜야 할 음성» 으로 분류된다. 그래서 잡음 제거를 켜 두어도
      (이미 기본 켜짐 — idx-main.js:424) 옆 소리는 그대로 넘어간다.
      ⇒ 이 파일이 하는 일은 «지우기» 가 아니라 «가까운 소리만 통과시키기» 다.
      ⛔ 그러니 이것만으로 완전히 없어지지 않는다. 가장 확실한 것은 붐 마이크 헤드셋(입에서 3~5cm)이고,
         그다음이 Krisp 같은 가상 마이크다(그건 장치 목록에 뜨므로 이 파일과 무관하게 그냥 고르면 된다).

   무엇을 하는가 — 세 가지뿐이고, 셋 다 «가까운 소리와 먼 소리의 차이» 를 벌린다.
     ① 자동 게인(autoGainControl) 끄기 — 켜져 있으면 내가 말을 쉬는 동안 마이크 감도를 자동으로 올려
        옆자리 소리를 «오히려 키운다». 사무실에서는 이게 제일 큰 역효과다.
     ② 하이패스 120Hz — 방 웅웅거림·책상 진동을 덜어 낸다(사람 목소리 기본 주파수 아래).
     ③ 노이즈 게이트 — 바닥 소음보다 충분히 큰 소리(=내 목소리)만 통과시키고 그 아래는 «줄인다».

   ⛔ 게이트는 «완전 무음» 으로 만들지 않는다(-22dB 감쇠까지만). 완전히 끊으면 교사가 조용히 말할 때
      첫 음절이 통째로 사라져서, 고치려던 것보다 나쁜 상태가 된다. 줄이기만 해도 옆 소리는 충분히 묻힌다.
   ⛔ 문턱을 «고정 숫자» 로 두지 않는다 — 사무실마다 바닥 소음이 다르다. 조용한 구간의 바닥을 배워
      그 위 몇 dB 로 잡는다. ⚠️ 그때 «위로는 아주 느리게» 만 따라간다 — 시끄러운 값을 평소로 배우면
      게이트가 스스로 열려 버려 아무 일도 안 하게 된다(CLAUDE.md 「기준값을 매 틱 올리면」과 같은 함정).

   ⚠️ 안전 원칙 — 어느 단계든 실패하면 «켜기 전» 으로 되돌아간다. 마이크는 수업 그 자체라
      «안 들리는» 실패가 «옆소리가 들리는» 것보다 훨씬 나쁘다. 그래서:
        · AudioContext 는 스위치를 누르는 «사용자 제스처» 안에서만 만든다(자동재생 정책).
        · 탭이 숨으면(다른 창으로 전환) 게이트를 활짝 열고 손을 뗀다 — 타이머가 느려진 사이
          게이트가 «닫힌 채 굳어» 목소리가 안 나가는 것을 원천 차단한다.
        · 음소거 상태(track.enabled)는 트랙을 갈아끼울 때 반드시 물려준다.

   ⛔ 상주 setInterval·body class MutationObserver 를 두지 않는다(CLAUDE.md — 홈 전체를 멎게 한 전력).
      타이머는 «사무실 모드가 켜진 동안» 에만 살고 끄면 즉시 사라진다.
   idx-main.js 는 한 줄도 고치지 않는다(849KB blocking · 첫 화면 예산 여유 116바이트) — 전역 함수를
   밖에서 감싸는 방식이다. ⚠️ 그래서 그 함수 이름이 바뀌면 조용히 헛돈다(원본이 없으면 건너뛴다). */
(function () {
  var KEY = 'mangoi_vc_office';

  var ATTACK   = 0.005;  // 열림 — 즉시(첫 음절을 자르지 않는다)
  var RELEASE  = 0.12;   // 닫힘 — 느리게(말 사이 공백에 딸꾹거리지 않는다)
  var HOLD_MS  = 260;    // 문턱 아래로 떨어져도 이만큼은 열어 둔다
  var DUCK     = 0.08;   // 게이트가 닫혔을 때 남기는 크기 (-22dB)
  var OPEN_DB  = 12;     // 바닥 + 이만큼 크면 «내 목소리»
  var HYST_DB  = 6;      // 한 번 열리면 이만큼 낮아질 때까지 유지
  var ABS_DB   = -55;    // 문턱 절대 하한 — 너무 조용한 방에서 게이트가 예민해지지 않게
  var TICK_MS  = 25;

  var on = false, busy = false;
  /* 이 «페이지» 에서 켜기가 한 번 실패했는가 — 자동 적용만 그만둔다(사람이 스위치를 누르면 다시 시도).
     ⚠️ 저장값('0')으로 적지 않는 이유는 아래 enable() 의 실패 처리 주석에 있다. */
  var autoFailed = false;
  var ctx = null, srcNode = null, hpNode = null, gainNode = null, anaNode = null, destNode = null;
  var rawStream = null;   // 우리가 새로 잡은 원본 마이크 (AGC off)
  var procTrack = null;   // peer 에게 실제로 보내는 가공 트랙
  var timer = null, buf = null, floorDb = -60, openUntil = 0, isOpen = false;
  var srcMicId = '';      // 켜기 «전» 에 쓰던 «진짜» 마이크 장치 id — 되돌릴 때 이것으로 다시 잡는다

  /* 🔛 저장값은 «셋» 이다 — '1'(켬) · '0'(사람이 껐음) · 없음(아직 안 정함).
     2026-09-09 사장님 「교사한테 항상 켜지는 것을 디폴트값으로」 → «없음» 을 «켬» 으로 읽는다.
     ⛔ 두 값으로 뭉개지 마세요 — «아직 안 정함» 과 «사람이 껐음» 이 같아지면
        교사가 끈 것이 다음 수업에 되살아납니다(CLAUDE.md 「상태가 셋인데 저장이 둘」).
     ⚠️ 「교사면」 이라는 조건은 여기서 묻지 않습니다 — 이 함수가 불리는 시점에는 역할이
        아직 안 왔을 수 있습니다. 실제로 거는 자리(armOnce)가 isStaff() 를 «폴링하며» 봅니다.
        그래서 학생 브라우저에서도 armOnce 는 돌지만 20초 뒤 아무것도 안 하고 끝납니다. */
  function pref() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function wantOn() { return pref() !== '0'; }
  function remember(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} }
  /* 「아직 안 정함」으로 되돌린다 — «켜다가 실패한 것» 을 «사람이 껐다» 로 적으면
     한 번의 일시 장애가 그 교사의 기본값을 영영 꺼 버립니다(다음 수업에 다시 시도해야 합니다). */
  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function inCall() { try { return document.body.classList.contains('vc-in-call'); } catch (e) { return false; } }

  /* 🎭 «선생님 + 관리자 로그인» — 2026-09-08 「선생님만 쓰게 막아줘」 → 2026-09-09 「사장님 계정도 보이게 넓혀줘」.
     판정은 정본 `vcIsStaffNow()` 하나만 봅니다(그 주석이 「강사 전용 기능은 전부 이걸 쓴다」).
     ⛔ «강사가 아니면 학생»(`!vcIsStaffNow()`)으로 판정하지 않습니다 — 그 판정은 **역할이 아직
        확정되지 않은 강사를 학생으로 오판**합니다(같은 파일 `vcIsStudentNow` 주석의 8/10 사고).
        여기서는 그 오판이 «교사가 자기 기능을 못 쓰는» 쪽이라, 아래 두 곳이 그것을 견딥니다:
        · 설정을 «열 때마다» 다시 판정합니다(역할이 늦게 오면 다시 열면 보입니다)
        · 수업 진입 자동 적용은 «교사가 될 때까지» 기다립니다(폴링)
     ⛔ 역할 정본을 고쳐서 풀지 마세요 — 그 값에는 화면공유·교재 넘김·장치 도우미 권한이
        함께 걸려 있습니다(CLAUDE.md). 여기서는 «묻기만» 합니다.
     ℹ️ 이것은 보안 게이트가 아닙니다 — 사무실 모드는 «자기 마이크» 만 가공하므로 학생이
        콘솔로 불러도 남에게 영향이 없습니다. 화면을 어지럽히지 않는 것이 목적입니다. */
  /* 🔑 (2026-09-09 사장님 「사장님 계정도 보이게 넓혀줘」) — 축을 «둘» 로 늘렸습니다.
     [왜 필요했나] 사장님이 수업 방에 들어가면 화면이 «학생» 으로 잡히는 경우가 있습니다.
       `index.html` 의 입장 판정(`js/idx-main.js:2625~2642`)이 관리자 로그인을 발견하면
       「스태프로 입장할까요?」를 묻는데, **취소하면 그 세션은 `vcMyRole='student'`** 입니다.
       그러면 위 `vcIsStaffNow()` 가 false 라 그 줄이 정상적으로 감춰집니다 — 사장님 화면에
       「사무실 모드가 없다」로 보이던 것이 이 자리입니다(2026-09-09).
     [무엇을 봤나] 그 브라우저에 **관리자 로그인이 있는가**(`mangoi_admin_session.uid`).
       그 키는 교사·본사·지사가 관리자 화면에 로그인할 때만 생기고, 학생 로그인은
       `mangoi_logged_user` 라 **키 자체가 다릅니다** — 그래서 진짜 학생 브라우저에는 없습니다.
       같은 키를 같은 뜻으로 이미 읽는 곳: `idx-main.js:2626`.
     ⛔ **정본 `vcIsStaffNow()` 를 고쳐서 넓히지 않았습니다** — 그 값에는 화면공유·교재 넘김·
        장치 도우미 «권한» 이 함께 걸려 있어, 거기를 넓히면 사무실 모드와 무관한 것까지 열립니다
        (CLAUDE.md 「역할 정본을 고쳐서 풀지 마세요」). 넓힌 것은 **이 게이트 하나**입니다.
     ℹ️ 보안 게이트가 아니라 «화면을 어지럽히지 않기» 가 목적이라 넓혀도 잃는 것이 없습니다 —
        사무실 모드는 «자기 마이크» 만 가공하므로 남에게 영향이 없습니다.
     ⚠️ localStorage 를 못 읽으면(사생활 보호 모드 등) false 로 떨어집니다 — 그때도 교사는
        위 `vcIsStaffNow()` 로 그대로 보이므로, 잃는 것은 «관리자인데 학생으로 입장한» 경우뿐입니다. */
  function hasAdminLogin() {
    try {
      var s = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {};
      return !!String(s.uid || '').trim();
    } catch (e) { return false; }
  }
  function isStaff() {
    try { if (typeof window.vcIsStaffNow === 'function' && window.vcIsStaffNow()) return true; }
    catch (e) {}
    return hasAdminLogin();
  }
  window.vcOfficeModeAllowed = isStaff;
  function localStream() { try { return window.vcLocalStream || null; } catch (e) { return null; } }
  function audioTrack() { var s = localStream(); try { return (s && s.getAudioTracks && s.getAudioTracks()[0]) || null; } catch (e) { return null; } }

  /* 모든 상대에게 보내는 오디오를 새 트랙으로 갈아끼운다.
     ⚠️ 음소거 상태를 물려주지 않으면 «음소거했는데 소리가 나가는» 사고가 된다. */
  function swapTrack(next) {
    var stream = localStream();
    if (!stream || !next) return false;
    var old = audioTrack();
    try { next.enabled = old ? old.enabled : true; } catch (e) {}
    try {
      if (old) { stream.removeTrack(old); try { old.stop(); } catch (e) {} }
      stream.addTrack(next);
    } catch (e) { console.warn('[office] 스트림 교체 실패:', e); return false; }
    try {
      var pcs = window.vcPeerConnections || {};
      Object.keys(pcs).forEach(function (k) {
        try {
          var sender = pcs[k].getSenders().find(function (s) { return s.track && s.track.kind === 'audio'; });
          if (sender) sender.replaceTrack(next).catch(function () {});
        } catch (e) {}
      });
    } catch (e) {}
    return true;
  }

  /* 게이트 한 틱 — 지금 소리가 «바닥보다 충분히 큰가» 만 본다. */
  function tick() {
    if (!on || !ctx || !anaNode || !gainNode) return;
    /* ⛔ 탭이 숨으면 판정을 멈추고 활짝 연다 — 타이머가 느려진 사이 닫힌 채 굳으면 목소리가 안 나간다. */
    if (document.hidden) {
      try { gainNode.gain.setTargetAtTime(1, ctx.currentTime, ATTACK); } catch (e) {}
      return;
    }
    try {
      anaNode.getFloatTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      var db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);

      /* 바닥 소음 학습 — 아래로는 빨리, 위로는 아주 느리게.
         ⛔ 위로 빨리 따라가면 시끄러운 사무실을 «평소» 로 배워 게이트가 영영 열린 채로 남는다. */
      floorDb += (db < floorDb) ? (db - floorDb) * 0.25 : (db - floorDb) * 0.0015;
      if (!isFinite(floorDb) || floorDb < -90) floorDb = -90;

      var thr = Math.max(floorDb + OPEN_DB, ABS_DB);
      var now = Date.now();
      if (db > thr) { isOpen = true; openUntil = now + HOLD_MS; }
      else if (isOpen && db < thr - HYST_DB && now > openUntil) { isOpen = false; }

      gainNode.gain.setTargetAtTime(isOpen ? 1 : DUCK, ctx.currentTime, isOpen ? ATTACK : RELEASE);
    } catch (e) {
      /* 재는 데 실패하면 «열어 두는» 쪽으로 실패한다 — 목소리가 막히는 것이 최악이다. */
      try { gainNode.gain.setTargetAtTime(1, ctx.currentTime, ATTACK); } catch (e2) {}
    }
  }

  function teardown() {
    if (timer) { clearInterval(timer); timer = null; }
    try { if (srcNode) srcNode.disconnect(); } catch (e) {}
    try { if (hpNode) hpNode.disconnect(); } catch (e) {}
    try { if (gainNode) gainNode.disconnect(); } catch (e) {}
    try { if (anaNode) anaNode.disconnect(); } catch (e) {}
    try { if (ctx && ctx.state !== 'closed') ctx.close(); } catch (e) {}
    try { if (rawStream) rawStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); } catch (e) {}
    ctx = srcNode = hpNode = gainNode = anaNode = destNode = null;
    rawStream = null; procTrack = null; buf = null;
    floorDb = -60; isOpen = false; openUntil = 0;
  }

  /* 지금 쓰는 «진짜» 마이크 장치 id.
     🔴 켜져 있는 동안 vcLocalStream 의 트랙은 WebAudio 가 만든 «가공 트랙» 이라 실제 장치 id 가 없다.
        그것을 deviceId:{exact:…} 로 넘기면 OverconstrainedError 가 나고, 되돌리기가 통째로 실패해
        «무음 가공 트랙» 이 그대로 남는다 = 사무실 모드를 껐는데 소리가 아예 안 나간다.
        (2026-09-08 브라우저 검사가 실제로 이 상태를 잡았다 — 문자열 검사로는 안 보인다.)
     ⇒ 켜져 있을 때는 «켤 때 기억해 둔 값» 이 정본이다. */
  function currentMicId() {
    if (on && srcMicId) return srcMicId;
    try {
      var t = audioTrack();
      var s = t && t.getSettings ? t.getSettings() : null;
      if (s && s.deviceId) return s.deviceId;
    } catch (e) {}
    /* ⛔ 키 이름을 여기에 복제하지 않는다 — 처음에 'mangoi_vc_mic' 이라고 적었는데 그건 «죽은 키» 였다
       (정본은 idx-main.js 의 VC_MIC_PREF_KEY = 'mangoi_vc_mic_id'). 읽으면 늘 null 이라 에러 없이
       «교사가 고른 마이크» 대신 기본 마이크를 잡는다. 정본 함수를 그대로 쓴다. */
    try { if (typeof window.vcSavedMicId === 'function') return window.vcSavedMicId() || ''; } catch (e) {}
    try { return localStorage.getItem('mangoi_vc_mic_id') || ''; } catch (e) { return ''; }
  }

  function micConstraints(officeOn, id) {
    var a = {
      echoCancellation: true,
      noiseSuppression: true,
      /* ① 사무실 모드에서는 자동 게인을 끈다 — 말을 쉴 때 옆자리 소리를 키우는 주범이다. */
      autoGainControl: !officeOn,
      channelCount: 1
    };
    if (id) a.deviceId = { exact: id };
    return { audio: a, video: false };
  }

  async function enable() {
    if (on || busy) return true;
    /* ⛔ 선생님·관리자 전용. ⚠️ 여기서 저장값을 지우지 않습니다 — 역할이 늦게 오는 강사의 저장값이
       그 한 번의 오판으로 사라지면 «다음 수업에도 안 켜지는» 상태가 굳습니다.
       저장값은 사람이 스위치를 눌렀을 때만 바뀝니다. */
    if (!isStaff()) { console.log('[office] 선생님·관리자 전용입니다 — 건너뜁니다'); return false; }
    if (!inCall() || !localStream()) { remember(true); return true; }  // 수업에 들어갈 때 다시 건다
    busy = true;
    try {
      var id = currentMicId();
      srcMicId = id;   // 되돌릴 때 쓸 «진짜» 장치 id — 켜고 나면 트랙에서 못 읽는다
      rawStream = await navigator.mediaDevices.getUserMedia(micConstraints(true, id));

      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('AudioContext 없음');
      ctx = new AC();
      /* ⚠️ 사용자 제스처 안에서만 실제로 resume 된다 — 스위치 onclick 에서 부르는 이유다. */
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
      if (ctx.state !== 'running') throw new Error('AudioContext 가 running 이 아님');

      srcNode  = ctx.createMediaStreamSource(rawStream);
      hpNode   = ctx.createBiquadFilter();  hpNode.type = 'highpass'; hpNode.frequency.value = 120;  // ②
      gainNode = ctx.createGain();          gainNode.gain.value = 1;                                 // ③
      anaNode  = ctx.createAnalyser();      anaNode.fftSize = 1024; anaNode.smoothingTimeConstant = 0;
      destNode = ctx.createMediaStreamDestination();

      srcNode.connect(hpNode);
      hpNode.connect(anaNode);          // 재는 것은 게이트 «앞» — 게이트가 줄인 소리로 다시 판정하면 굳는다
      hpNode.connect(gainNode);
      gainNode.connect(destNode);

      buf = new Float32Array(anaNode.fftSize);
      procTrack = destNode.stream.getAudioTracks()[0];
      if (!procTrack) throw new Error('가공 트랙 없음');

      /* 🔴 원본 마이크가 죽으면(USB 를 뽑거나 OS 가 장치를 뺏음) «스스로 손을 뗀다».
         왜 필요한가 — idx-main.js 의 마이크 자가치유(vcHealLocalMic)는
         「살아 있는 트랙이 하나라도 있으면 그만둔다」로 판정하는데,
         WebAudio 가 만든 가공 트랙은 **원본이 죽어도 계속 'live'** 다(실측).
         ⇒ 우리가 끼어 있는 동안에는 그 자가치유가 원리상 못 돈다 = 교사가 조용히 무음이 되고
            「🎤 마이크가 자동으로 다시 연결됐어요」 안내도 안 나온다.
         여기서 사무실 모드를 끄면 표준 마이크로 돌아가고, 그때부터 자가치유가 다시 일한다.
         ⚠️ 저장값은 «켜짐» 으로 둔다(keepPref) — 사람이 끈 것이 아니다. */
      try {
        var rawT = rawStream.getAudioTracks()[0];
        if (rawT) rawT.onended = function () {
          if (!on) return;
          console.warn('[office] 원본 마이크가 끊겨 사무실 모드를 해제합니다 — 마이크 자가치유에 넘깁니다');
          try { disable(true); } catch (e) {}
        };
      } catch (e) {}

      if (!swapTrack(procTrack)) throw new Error('트랙 교체 실패');

      /* 한 번이라도 성공했으면 «이 기기에서는 된다» 는 뜻 — 자동 적용 차단을 푼다.
         (사람이 스위치로 켜서 성공한 경우도 여기로 온다.) */
      on = true; remember(true); autoFailed = false;
      timer = setInterval(tick, TICK_MS);
      console.log('[office] 사무실 모드 켜짐 — AGC off + 하이패스 120Hz + 노이즈 게이트');
      busy = false;
      return true;
    } catch (e) {
      console.warn('[office] 켜기 실패 — 원래대로 되돌립니다:', e);
      teardown(); on = false; busy = false;
      try { await restorePlainMic(); } catch (e2) {}
      /* ⛔ remember(false) 로 적지 않는다 — 그러면 «일시 장애» 가 «사람이 껐다» 로 굳어
         기본 켜짐(2026-09-09)이 그 브라우저에서 영영 사라진다. 「아직 안 정함」으로 되돌린다.
         ⚠️ 대신 이 페이지에서는 «자동으로» 다시 시도하지 않는다 — 계속 실패하는 기기에서
            수업마다 마이크를 다시 잡는 일이 되풀이되지 않게. 사람이 스위치를 누르면 다시 시도한다. */
      forget();
      autoFailed = true;
      return false;
    }
  }

  /* 표준 제약(자동 게인 켬)으로 마이크를 다시 잡아 원래 경로로 되돌린다.
     ⚠️ 여기는 «절대 실패하면 안 되는» 경로다 — 실패하면 무음 가공 트랙이 그대로 남아 소리가 안 나간다.
        그래서 ① 기억해 둔 장치로 잡아 보고 ② 안 되면 «아무 마이크나» 로 한 번 더 잡는다.
        ⛔ 장치 지정을 «먼저» 포기하지는 않는다 — 교사가 고른 마이크가 아닌 것으로 바뀌면 그것도 사고다. */
  async function restorePlainMic() {
    if (!inCall() || !localStream()) return;
    var s = null;
    var id = srcMicId || currentMicId();
    if (id) {
      try { s = await navigator.mediaDevices.getUserMedia(micConstraints(false, id)); }
      catch (e) { console.warn('[office] 원래 장치로 못 잡음 — 기본 마이크로 되돌립니다:', e && e.name); s = null; }
    }
    if (!s) s = await navigator.mediaDevices.getUserMedia(micConstraints(false, ''));
    var t = s.getAudioTracks()[0];
    if (t) swapTrack(t);
  }

  /* keepPref=true 면 저장값을 «켜짐» 그대로 둔다.
     🔴 왜 갈라야 하나 — 수업에서 나갈 때도 이 함수를 부르는데, 무조건 remember(false) 로 두면
        «사람이 끈 것» 과 «수업이 끝난 것» 이 같은 값이 되어 **설정이 다음 수업으로 안 넘어간다.**
        (2026-09-08 함정 대조가 잡음: 나가기 전 '1' → 나간 뒤 '0'.)
        CLAUDE.md 「화면의 «끄기»를 눌렀더니 다시 켤 수가 없음 — 상태가 셋인데 저장이 둘」의 형제. */
  async function disable(keepPref) {
    if (busy) return;
    busy = true;
    var was = on;
    on = false;
    teardown();
    if (keepPref !== true) remember(false);
    if (was) {
      try { await restorePlainMic(); }
      catch (e) {
        /* 🔴 여기까지 왔으면 무음이 될 수 있다 — 조용히 넘기지 않는다. 마지막으로 한 번 더 잡아 본다. */
        console.error('[office] 🔴 마이크 되돌리기 실패 — 소리가 안 나갈 수 있습니다:', e);
        try {
          var s2 = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          var t2 = s2.getAudioTracks()[0];
          if (t2) swapTrack(t2);
        } catch (e2) { console.error('[office] 🔴 마지막 시도도 실패:', e2); }
      }
    }
    srcMicId = '';
    console.log('[office] 사무실 모드 꺼짐');
    busy = false;
  }

  window.vcSetOfficeMode = function (want) {
    return want ? enable() : disable();
  };
  window.vcOfficeModeOn = function () { return on; };

  /* ── 다른 기능이 마이크 트랙을 갈아끼우면 우리 체인이 끊긴다 — 그 뒤에 다시 건다.
        ⚠️ 원본이 없으면 아무것도 하지 않는다(이름이 바뀌면 조용히 헛돈다는 뜻이기도 하다). ── */
  function rewrap(name) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__officeWrapped) return;
    var wrapped = async function () {
      var wasOn = on;
      if (wasOn) { teardown(); on = false; }   // 우리 체인을 먼저 접는다(그쪽이 옛 트랙을 stop 한다)
      var r;
      try { r = await orig.apply(this, arguments); }
      finally { if (wasOn) { try { await enable(); } catch (e) {} } }
      return r;
    };
    wrapped.__officeWrapped = true;
    window[name] = wrapped;
  }

  function bootWraps() {
    rewrap('vcSetNoiseSuppression');
    rewrap('vcSetMicDevice');
    /* 🔴 vcSwitchMic 은 «직접» 불리는 경로가 둘이라 반드시 감싸야 한다 —
          index.html 의 <select id="vc-mic-select" onchange="vcSwitchMic(...)"> 와
          idx-main.js 의 강사→학생 「장치 도우미」 원격 전환.
          그 함수는 vcLocalStream 의 오디오 트랙을 전부 stop·remove 하므로 우리 가공 트랙이 날아가는데,
          감싸지 않으면 vcOfficeModeOn() 이 계속 true 라 «켜졌다고 말하는데 아무 일도 안 하는» 상태가 되고
          게이트 타이머·AudioContext·두 번째 마이크 캡처가 수업 내내 그대로 남는다.
          (2026-09-08 함정 대조 실측: trackChanged:true · nowRealMic:true 인데 officeSaysOn:true) */
    rewrap('vcSwitchMic');
  }

  /* 수업에 들어간 뒤 «저장된 값» 대로 한 번 건다.
     ⛔ body class 를 MutationObserver 로 지켜보지 않는다(홈 전체를 멎게 한 전력) —
        showView 를 감싸 그 순간에만 확인한다. */
  var pending = null;
  /* 🔴 여기서 「지금 수업인가」를 보고 아니면 그만두면 «한 번도 안 도는» 코드가 된다 —
        입장 순서가 `showView('view-videocall-call')` → `body.classList.add('vc-in-call')` 이라
        (idx-main.js:2869~2870 · 관찰자 입장 3830~3831도 같음) 우리 훅이 도는 순간 inCall() 은 아직 false 다.
        (2026-09-08 함정 대조 실측: 그 순서에서 vcOfficeModeOn() 이 영영 false 였다.)
     ⇒ «수업이 시작되기를» 잠깐 기다렸다가, 시작된 뒤에 마이크가 서면 건다. */
  function armOnce() {
    if (pending || autoFailed) return;
    var tries = 0, sawCall = false;
    pending = setInterval(function () {
      tries++;
      if (tries > 40) { clearInterval(pending); pending = null; return; }   // 20초면 포기
      if (inCall()) sawCall = true;
      else if (sawCall) { clearInterval(pending); pending = null; return; } // 들어갔다 나갔으면 그만
      if (!sawCall) return;                                                  // 아직 입장 전 — 더 기다린다
      if (!isStaff()) return;   // 역할이 아직 안 왔을 수 있다 — 학생이면 그대로 20초 뒤 포기한다
      if (localStream() && audioTrack()) {
        clearInterval(pending); pending = null;
        if (wantOn() && !on) enable();
      }
    }, 500);
  }

  function hookShowView() {
    var orig = window.showView;
    if (typeof orig !== 'function' || orig.__officeHooked) return false;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        bootWraps();
        /* ⛔ 여기서 inCall() 로 가르지 않는다 — 위 armOnce 주석대로 입장 때는 아직 false 다.
           수업 화면으로 «가는» 전환이면 걸고, 수업 «밖» 으로 나가는 전환이면 끈다. */
        var toCall = false;
        try { toCall = String(arguments[0] || '').indexOf('videocall') >= 0; } catch (e2) {}
        if (toCall) { if (wantOn()) armOnce(); }
        else if (on) disable(true);   // 수업이 끝난 것 — «사람이 끈 것» 이 아니므로 저장값은 지킨다
      } catch (e) {}
      return r;
    };
    wrapped.__officeHooked = true;
    window.showView = wrapped;
    return true;
  }

  function boot() {
    bootWraps();
    if (!hookShowView()) setTimeout(hookShowView, 1500);
    /* 이미 수업 중에 이 파일이 늦게 실린 경우 — armOnce 가 스스로 «입장했나» 를 확인하므로 그냥 건다. */
    if (wantOn()) armOnce();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
