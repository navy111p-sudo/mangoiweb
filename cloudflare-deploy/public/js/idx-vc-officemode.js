/* 🏢 사무실 모드 — 옆자리 교사 목소리가 학생에게 덜 들리게 «내 마이크 입력» 을 가공한다.
   (2026-09-08 사장님 요청 — 「사무실에서 주변 교사 목소리가 들리지 않게」)

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
  var ctx = null, srcNode = null, hpNode = null, gainNode = null, anaNode = null, destNode = null;
  var rawStream = null;   // 우리가 새로 잡은 원본 마이크 (AGC off)
  var procTrack = null;   // peer 에게 실제로 보내는 가공 트랙
  var timer = null, buf = null, floorDb = -60, openUntil = 0, isOpen = false;
  var srcMicId = '';      // 켜기 «전» 에 쓰던 «진짜» 마이크 장치 id — 되돌릴 때 이것으로 다시 잡는다

  function saved() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} }
  function inCall() { try { return document.body.classList.contains('vc-in-call'); } catch (e) { return false; } }
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
    try { return localStorage.getItem('mangoi_vc_mic') || ''; } catch (e) { return ''; }
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

      if (!swapTrack(procTrack)) throw new Error('트랙 교체 실패');

      on = true; remember(true);
      timer = setInterval(tick, TICK_MS);
      console.log('[office] 사무실 모드 켜짐 — AGC off + 하이패스 120Hz + 노이즈 게이트');
      busy = false;
      return true;
    } catch (e) {
      console.warn('[office] 켜기 실패 — 원래대로 되돌립니다:', e);
      teardown(); on = false; busy = false;
      try { await restorePlainMic(); } catch (e2) {}
      remember(false);
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

  async function disable() {
    if (busy) return;
    busy = true;
    var was = on;
    on = false;
    teardown();
    remember(false);
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
  }

  /* 수업에 들어간 뒤 «저장된 값» 대로 한 번 건다.
     ⛔ body class 를 MutationObserver 로 지켜보지 않는다(홈 전체를 멎게 한 전력) —
        showView 를 감싸 그 순간에만 확인한다. */
  var pending = null;
  function armOnce() {
    if (pending) return;
    var tries = 0;
    pending = setInterval(function () {
      tries++;
      if (!inCall() || tries > 40) { clearInterval(pending); pending = null; return; }
      if (localStream() && audioTrack()) {
        clearInterval(pending); pending = null;
        if (saved() && !on) enable();
      }
    }, 500);
  }

  function hookShowView() {
    var orig = window.showView;
    if (typeof orig !== 'function' || orig.__officeHooked) return false;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { if (inCall()) { bootWraps(); if (saved()) armOnce(); } else if (on) disable(); } catch (e) {}
      return r;
    };
    wrapped.__officeHooked = true;
    window.showView = wrapped;
    return true;
  }

  function boot() {
    bootWraps();
    if (!hookShowView()) setTimeout(hookShowView, 1500);
    if (inCall() && saved()) armOnce();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
