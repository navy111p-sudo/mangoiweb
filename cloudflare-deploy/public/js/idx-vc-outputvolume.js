/* 🔊 (2026-08-26 학생 제보) 안드로이드 일부 기기(삼성 실측)에서 하드웨어 볼륨키가 "통화" 스트림을
   움직이는데, 실제 소리 출력은 "미디어" 스트림을 따라간다 — 버튼을 눌러도 안 커지고, 시스템 볼륨
   패널을 펼쳐 «미디어» 슬라이더를 직접 올려야 소리가 났다. 어느 안드로이드 오디오 스트림을 쓸지는
   크로미움이 내부적으로 정하고 웹페이지에는 그걸 고르는 표준 API 가 없다 — 그래서 "OS 스트림 자체를
   하나로 통일" 하는 것은 이 파일이 할 수 없다. 대신 OS 스트림이 무엇이든 항상 먹는 자체 음량을 둔다.

   ⛔ «0~100% 슬라이더» 로는 이 제보를 풀 수 없다 — HTMLMediaElement.volume 은 상한이 1(=지금 소리)이라
      «작게» 만 되고 «크게» 는 안 된다. 제보는 「소리가 안 커진다」였다. 그래서 100% 를 넘는 구간은
      WebAudio 의 GainNode 로 실제로 증폭한다(최대 300%). 100% 이하는 WebAudio 를 아예 안 쓴다.

   ⛔ 그리고 element.volume 만 바꿔서는 «값이 유지되지 않는다» — idx-main.js 에는 소리 자가복구가 둘 있고
      (`vcEnsureRemoteAudio` = 화면을 만질 때마다, `vcAudioWatchdog` = 3초마다) 둘 다 `volume = 1` 로
      되돌린다. 그래서 학생이 값을 내려도 화면을 한 번 만지면 튕겨 올라갔다. 지금은 그 두 곳이
      `vcOutVol()` 을 읽고, 증폭 중(`window.vcOutBoost`)에는 아예 손을 떼도록 함께 고쳤다.

   ⚠️ 안전 원칙 — 실패하면 «고치기 전» 으로 되돌아간다. 증폭은 학생이 슬라이더를 100% 위로 «직접 올릴 때»
      (=사용자 제스처) 에만 켜지고, AudioContext 가 실제로 running 인 것을 확인한 뒤에만 타일을 음소거한다.
      어느 단계든 실패하면 그 자리에서 원래 경로(element 재생)로 돌아간다 — 최악이어도 오늘과 같아진다.

   ⛔ 상주 setInterval 을 두지 않는다(CLAUDE.md 「홈에 머무는 학생 폰을 계속 깨운다」). 새 참가자 타일은
      `#vc-video-grid` 로 «범위를 좁힌» MutationObserver(childList)로 알아채고, 수업을 나가면 끊는다.
      ⛔ body class 감시는 절대 쓰지 않는다 — 홈 전체를 멎게 한 전력이 있다.

   idx-main.js 는 위 «자가복구 두 곳» 말고는 건드리지 않는다(849KB blocking · 첫 화면 예산). */
(function () {
  var KEY = 'mangoi_vc_out_vol';   // 0 ~ MAX (1 = 원래 소리)
  var MAX = 3;                     // 300% — 이보다 키우면 잡음까지 커져 오히려 못 알아듣는다
  /* 🔇 (2026-10-09 class-4586 — 학생 폰에 선생님 소리 패킷은 손실 0% 로 왔는데 수업 내내 무음·재접속해도 무음)
     이 값은 localStorage 라 «다음 수업에도» 그대로 남는다. 슬라이더를 왼쪽 끝(0%)까지 한 번 밀면
     그 기기는 그 뒤로 모든 수업이 무음이 되고, 다시 들어가도 안 풀리며, 화면은 아무 말도 안 한다.
     ⟹ 하한을 10% 로 두고, 그보다 작은 «저장값» 은 불러올 때 지운다(= 원래 소리 100%).
     ⛔ 0% 를 다시 허용하지 마세요 — 소리를 끄고 싶으면 기기 볼륨이나 타일 음소거가 있습니다. */
  var MIN = 0.1;
  var ctx = null;                  // AudioContext — 100% 를 넘겨야 «처음» 만든다
  var nodes = Object.create(null); // 오디오 트랙 id -> { src, gain }
  var mo = null;                   // #vc-video-grid 감시 (수업 중에만)
  var reTimer = null;

  function saved() {
    try {
      var v = parseFloat(localStorage.getItem(KEY));
      return (isFinite(v) && v >= MIN && v <= MAX) ? v : 1;
    } catch (e) { return 1; }
  }

  /* 저장값이 하한보다 작으면(옛 0% 포함) 지운다 — idx-main.js 의 vcOutVol() 도 같은 키를 직접 읽으므로
     «읽을 때만 1 로 보는» 것으로는 그쪽 자가복구가 여전히 0 을 다시 넣는다. 키 자체를 지워야 둘 다 100% 가 된다. */
  function heal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw === null) return;
      var v = parseFloat(raw);
      if (isFinite(v) && v < MIN) {
        localStorage.removeItem(KEY);
        try { console.warn('[vc-outvol] 저장된 출력 음량 ' + Math.round(v * 100) + '% 가 너무 작아 100% 로 되돌렸습니다'); } catch (e) {}
      }
    } catch (e) {}
  }
  heal();

  /* 소리를 내는 요소들. 내 미리보기는 항상 음소거라 건드릴 이유가 없다. */
  function targets() {
    var out = [];
    try {
      var els = document.querySelectorAll('#vc-video-grid video, audio[id^="vc-aud-"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.closest && el.closest('#vc-local-box')) continue;
        out.push(el);
      }
    } catch (e) {}
    return out;
  }

  /* ── 100% 이하: WebAudio 를 쓰지 않는다(가장 단순한 경로 = 가장 안전한 경로) ── */
  function applyPlain(v) {
    var els = targets();
    for (var i = 0; i < els.length; i++) { try { els[i].volume = v; } catch (e) {} }
  }

  /* ── 증폭 끄기: 노드를 끊고, idx-main.js 의 자가복구에게 «원래대로» 를 맡긴다 ── */
  function boostOff() {
    for (var k in nodes) {
      try { nodes[k].src.disconnect(); } catch (e) {}
      try { nodes[k].gain.disconnect(); } catch (e) {}
      if (nodes[k].lim) { try { nodes[k].lim.disconnect(); } catch (e) {} }
      delete nodes[k];
    }
    window.vcOutBoost = false;
    // 음소거·재생 상태 복구는 이미 있는 함수가 정확히 안다(보조 오디오 경로까지 함께 본다)
    try { if (typeof window.vcEnsureRemoteAudio === 'function') window.vcEnsureRemoteAudio(); } catch (e) {}
  }

  /* ── 증폭 켜기 ── */
  function boostBuild(v) {
    var els = targets(), seen = Object.create(null), any = false;
    for (var i = 0; i < els.length; i++) {
      var el = els[i], st = null, tracks = null;
      try { st = el.srcObject; tracks = st && st.getAudioTracks ? st.getAudioTracks() : null; } catch (e) {}
      if (!tracks || !tracks.length) { try { el.volume = 1; } catch (e) {} continue; }
      /* ⚠️ «스트림 id» 가 아니라 «트랙 id» 로 묶는다 — 보조 오디오(vc-aud-*)는 같은 트랙을
         새 MediaStream 에 담아 쓰므로, 스트림으로 세면 같은 소리를 두 번 증폭한다. */
      var tid = tracks[0].id;
      seen[tid] = 1;
      if (!nodes[tid]) {
        try {
          var src = ctx.createMediaStreamSource(new MediaStream([tracks[0]]));
          var g = ctx.createGain();
          /* 리미터 — 300% 로 올리면 큰 소리가 잘려 «찢어지는» 소리가 난다. 한 노드로 그것만 막는다. */
          var lim = ctx.createDynamicsCompressor();
          try {
            lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20;
            lim.attack.value = 0.003; lim.release.value = 0.1;
          } catch (e) {}
          src.connect(g); g.connect(lim); lim.connect(ctx.destination);
          nodes[tid] = { src: src, gain: g, lim: lim };
        } catch (e) { try { el.volume = 1; } catch (_) {} continue; }
      }
      try { nodes[tid].gain.gain.value = v; } catch (e) {}
      // 소리는 WebAudio 가 낸다 — element 는 음소거(이중재생 방지). idx-main.js 쪽은 vcOutBoost 로 손을 뗀다.
      try { el.volume = 1; el.muted = true; } catch (e) {}
      any = true;
    }
    for (var k in nodes) {
      if (!seen[k]) {                              // 나간 사람의 노드는 정리한다
        try { nodes[k].src.disconnect(); } catch (e) {}
        try { nodes[k].gain.disconnect(); } catch (e) {}
        if (nodes[k].lim) { try { nodes[k].lim.disconnect(); } catch (e) {} }
        delete nodes[k];
      }
    }
    return any;
  }

  function boostOn(v) {
    if (!ctx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { window.vcOutBoost = false; applyPlain(1); return; }
        ctx = new AC();
        /* 🔇 증폭 중에 엔진이 멈추면(폰 화면잠금·앱 전환·오디오 포커스를 뺏김) 타일은 음소거된 채
           WebAudio 도 소리를 안 내 «완전 무음» 이 된다. 멈추는 그 순간 원래 경로로 되돌리고,
           다시 돌면 한 번 더 먹인다. ⛔ 지우지 마세요 — 지우면 그 무음이 수업 끝까지 갑니다. */
        ctx.onstatechange = function () {
          try {
            if (!ctx) return;
            if (ctx.state !== 'running') { if (window.vcOutBoost) { boostOff(); applyPlain(1); } }
            else if (saved() > 1 && !window.vcOutBoost) reapply();
          } catch (e) {}
        };
      } catch (e) { ctx = null; window.vcOutBoost = false; applyPlain(1); return; }
    }
    /* 🔊 (2026-08-10 장치 도우미와의 관계) WebAudio 출력은 element 의 setSinkId 를 따르지 않는다.
       최신 크롬은 AudioContext 자체에 setSinkId 가 있어 그때만 고른 스피커를 따라간다. */
    try {
      var spk = localStorage.getItem('mangoi_vc_spk_id');
      if (spk && typeof ctx.setSinkId === 'function') ctx.setSinkId(spk);
    } catch (e) {}
    var go = function () {
      if (!ctx || ctx.state !== 'running') { window.vcOutBoost = false; applyPlain(1); return; }
      window.vcOutBoost = true;      // ⚠️ 반드시 «타일을 음소거하기 전» 에 켠다(감시견 오경보 방지)
      if (!boostBuild(v)) { boostOff(); applyPlain(1); }   // 붙일 트랙이 하나도 없으면 되돌린다
    };
    try {
      var p = ctx.resume();
      if (p && p.then) p.then(go, function () { window.vcOutBoost = false; applyPlain(1); });
      else go();
    } catch (e) { window.vcOutBoost = false; applyPlain(1); }
  }

  function apply(v) {
    if (v > 1) boostOn(v);
    else { if (window.vcOutBoost) boostOff(); applyPlain(v); }
  }

  /* ── 새 참가자 타일이 붙으면 다시 먹인다. 상주 setInterval 대신 «수업 중에만» 도는 감시. ── */
  function reapply() {
    if (reTimer) return;
    reTimer = setTimeout(function () { reTimer = null; apply(saved()); }, 300);
  }
  function watchOn() {
    if (mo) return;
    var grid = document.getElementById('vc-video-grid');
    if (!grid) return;
    try {
      mo = new MutationObserver(reapply);
      mo.observe(grid, { childList: true, subtree: true });
    } catch (e) { mo = null; }
  }
  function watchOff() {
    if (mo) { try { mo.disconnect(); } catch (e) {} mo = null; }
    if (reTimer) { clearTimeout(reTimer); reTimer = null; }
  }

  window.vcSavedOutputVolume = saved;
  window.vcOutputVolumeMax = MAX;
  window.vcOutputVolumeMin = MIN;
  window.vcSetOutputVolume = function (vol) {
    vol = parseFloat(vol);
    if (!isFinite(vol)) return;
    vol = Math.max(MIN, Math.min(MAX, vol));
    try { localStorage.setItem(KEY, String(vol)); } catch (e) {}
    apply(vol);
  };

  /* 수업에 들어가는 순간에만 감시를 켜고, 나가면 끈다(CLAUDE.md 「상주 setInterval·body class 감시 금지」).
     ⚠️ showView 를 감싸는 방식은 js/idx-vc-toprow.js 의 선례를 그대로 따른다. */
  function boot() {
    try {
      var orig = window.showView;
      if (typeof orig === 'function' && !orig.__outVolWrapped) {
        window.showView = function (id) {
          var r = orig.apply(this, arguments);
          if (id === 'view-videocall-call') { watchOn(); reapply(); }
          else { watchOff(); if (window.vcOutBoost) boostOff(); }
          return r;
        };
        window.showView.__outVolWrapped = true;
      }
    } catch (e) {}
    if (document.body && document.body.classList.contains('vc-in-call')) { watchOn(); reapply(); }
  }
  window.addEventListener('pagehide', function () { watchOff(); if (window.vcOutBoost) boostOff(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
