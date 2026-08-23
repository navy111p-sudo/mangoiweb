/* idx-home-opening.js — 홈 화면 «오프닝 사운드» (2026-08-23)
 * ─────────────────────────────────────────────────────────────────────────────
 * [사장님 지시] 「홈페이지 오픈 음악을 켜 줘. 소리는 클릭하면 무조건 사라지게 —
 *               어디든 화면 클릭하거나 모바일에선 터치하면. 버튼도 만들어 줘. 둘 다.」
 *   → 끄는 길이 둘이다. ① 화면 아무 데나 클릭·터치 ② 🔊 버튼.
 *     버튼은 «다시 듣기» 도 겸한다(꺼진 뒤 누르면 처음부터 다시 울린다).
 *
 * [무엇을 소리내나] 슈트라우스 «짜라투스트라는 이렇게 말했다» 서주 «일출» — 약 82초.
 *   (사장님이 지정하신 «처음부터 1분 20초까지»)
 *   낮은 도(C) 지속음 위로 «도–솔–도» 가 세 번 올라가고, 그때마다 단3화음이 장3화음으로
 *   열린다. 세 번째가 가장 크고 팀파니와 함께 길게 남으며 끝난다.
 *   ⛔ 반복(loop)하지 않는다. 한 번 울리고 끝이다 — 홈에 머무는 학생 폰을 계속 깨우지 않는다.
 *
 * [🔓 저작권 — 왜 이 곡은 되나] 두 가지를 갈라서 봐야 한다.
 *   ・**작곡**(1896년 작, 슈트라우스 1949년 몰) → 사후 70년이 지나 **퍼블릭 도메인**이다.
 *     그래서 «연주하는 것» 자체는 자유롭다.
 *   ・**녹음** → 완전히 별개의 권리다(실연자·음반제작자). 요즘 오케스트라 녹음은 아직 살아 있다.
 *   ⛔ 그래서 유튜브·시판 음원에서 소리를 **가져오지 않는다.** 대신 이 코드가 오실레이터로
 *      **직접 연주**한다 — «작곡은 PD, 연주는 우리 것» 이라 어느 쪽에도 걸리지 않는다.
 *   ⚠️ 진짜 오케스트라 음색을 원하면 **퍼블릭 도메인 녹음 파일**을 구해 넣으면 된다.
 *      그때는 이 합성 대신 <audio> 를 쓰고, 1~2MB 를 «소리를 켤 때만» 받도록 지연 로딩할 것.
 *
 * [왜 파일이 아니라 «합성» 인가 — 무게]
 *   mp3 를 두면 학생 29,000명이 그 바이트를 받는다. 여기는 **음원 0바이트**다.
 *   (CLAUDE.md 2장 「index.html 에 기능을 더했는데 첫 화면 무게로 FAIL」)
 *   ⚠️ 그래서 이 파일은 반드시 defer 다. blocking 으로 옮기면 예산 하니스가 FAIL 낸다.
 *
 * [언제 울리나 — 안 울려야 할 때가 더 중요하다]
 *   ・수업 중(body.vc-in-call) 절대 금지. 수업 소리와 겹치면 그 자체로 사고다.
 *   ・인트로(#mango-intro-overlay)가 떠 있는 동안 금지 — 인트로에 자기 내레이션이 있다.
 *     그래서 «인트로가 끝난 뒤» 다(B안). 인트로 영상은 한 줄도 건드리지 않았다.
 *   ・한 세션에 한 번만. 화면을 오갈 때마다 다시 울리지 않는다.
 *   ・«소리 끔» 을 고른 사람에게는 다음 방문에도 안 울린다(localStorage).
 *
 * [자동재생 정책] 브라우저는 사용자가 한 번 건드리기 전엔 소리를 안 낸다.
 *   그래서 «첫 제스처» 는 시작 신호로 쓰고, 그 뒤의 클릭·터치부터 정지 신호로 쓴다.
 *   ⚠️ 이 구분이 없으면 시작시킨 바로 그 탭이 곧바로 자기를 끄고, 소리가 영영 안 난다.
 *   인트로를 탭해서 닫는 동작이 대개 그 «첫 제스처» 가 된다.
 *
 * [버튼 자리] 왼쪽 아래 bottom:76px.
 *   ⚠️ 이 구석은 이미 붐빈다 — #mg-fab-wrap(left:16, bottom:20, 32px) 과
 *      #ph52-cache-fab(left:16, bottom:16) 이 있다. 그 위로 비켜 놓은 값이다.
 *   ⚠️ z-index 는 «A.i 상담사» 위젯(#mangoi-widget, 2147483000) «아래» 로 둔다.
 *      좌우가 갈려 안 겹치지만, 위로 올리면 그 위젯을 가리는 순간 클릭을 뺏는다
 *      (CLAUDE.md 2장 「떠 있는 창을 만들었더니 보이는데 안 눌린다」).
 *
 * ⛔ body 의 class 를 MutationObserver 로 지켜보지 않는다 — 2026-07-14 홈 전체 먹통의 뿌리다.
 *    수업 전환은 showView 를 감싸서 «그 순간에만» 본다(CLAUDE.md 2장 권장 방식).
 */
(function () {
  'use strict';

  var SESSION_KEY = 'mangoi_home_opening_done';
  var MUTE_KEY    = 'mangoi_home_opening_mute';   // '1' = 이 사람은 소리를 원치 않음

  // ── 상태 ────────────────────────────────────────────────────────────────
  var ctx = null;         // AudioContext
  var master = null;      // 마스터 게인 (페이드아웃도 여기서)
  var nodes = [];         // 살아 있는 오실레이터 — 정지할 때 전부 stop()
  var playing = false;
  var finished = false;   // 이번 세션에서 할 일이 끝났음
  var armGesture = null;  // 시작 신호로 쓴 제스처 — 그 한 번은 정지로 세지 않는다
  var btn = null;
  var endTimer = null;

  var MASTER_VOL = 0.40;  // 아이들이 쓰는 화면이다. 크면 그 자체로 민원이다.
  var BTN_ID = 'mgo-sound-btn';

  function muted() {
    try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }

  // 🇵🇭 저사양·데이터절약이면 «스스로» 울리지 않는다 (버튼은 남겨 두어 원하면 들을 수 있게).
  //   소리 자체는 0바이트지만, 약한 기기에서 굳이 오실레이터를 돌릴 이유가 없다.
  //   ⚠️ 판정만 하고 저장하지 않는다 — 회선이 좋아지면 다음 방문엔 정상으로 울려야 한다.
  function thrifty() {
    try {
      if (document.documentElement.classList.contains('lite-mode')) return true;
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c) {
        if (c.saveData === true) return true;                       // «데이터 절약» = 명시적 의사
        if (/(^|-)2g$/.test(c.effectiveType || '')) return true;    // 2g·slow-2g
      }
    } catch (e) {}
    return false;
  }
  function setMuted(v) {
    try { if (v) localStorage.setItem(MUTE_KEY, '1'); else localStorage.removeItem(MUTE_KEY); } catch (e) {}
  }

  // ── 울리면 안 되는 상황 ─────────────────────────────────────────────────
  function inCall() {
    try { return !!(document.body && document.body.classList.contains('vc-in-call')); } catch (e) { return false; }
  }
  function introUp() {
    try {
      var ov = document.getElementById('mango-intro-overlay');
      return !!(ov && !ov.hidden && ov.style.display !== 'none');
    } catch (e) { return false; }
  }
  function blocked() {
    if (inCall() || introUp()) return true;
    try { if (document.hidden) return true; } catch (e) {}
    return false;
  }

  function alreadyDone() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }
  function markDone() {
    finished = true;
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
  }

  // ── 音色 ────────────────────────────────────────────────────────────────
  // ⚠️ 여기 있는 소리는 전부 오실레이터로 «그 자리에서 연주» 하는 것이다.
  //    남의 녹음을 가져다 쓰는 것이 아니다 — 그 구분이 이 파일의 핵심이다(머리말 참조).

  var noiseBuf = null;   // 팀파니 타격음용 (한 번만 만든다)
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    // ⛔ Math.random() 대신 결정론적 잡음 — 들을 때 차이가 없고, 매번 같은 소리가 난다.
    var seed = 12345;
    for (var i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x3fffffff) - 1;
    }
    return noiseBuf;
  }

  // 오르간 페달 — 배음을 쌓아 «바닥» 을 만든다. 아주 천천히 차오른다.
  function pedal(freq, at, dur, vol, dest) {
    var stack = [[1, 1], [2, 0.5], [4, 0.22], [8, 0.07]];
    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(vol, 0.001), at + Math.min(14, dur * 0.35));
    env.gain.setValueAtTime(vol, at + Math.max(0.1, dur - 3));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    env.connect(dest);
    for (var i = 0; i < stack.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * stack[i][0], at);
      var g = ctx.createGain();
      g.gain.setValueAtTime(stack[i][1], at);
      osc.connect(g); g.connect(env);
      osc.start(at); osc.stop(at + dur + 0.1);
      nodes.push(osc);
    }
  }

  // 금관 — 톱니파를 로우패스로 눌러 «붑» 하고 부푸는 관악기 결을 만든다.
  function brass(freq, at, dur, vol, dest) {
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.setValueAtTime(1.1, at);
    lp.frequency.setValueAtTime(freq * 1.6, at);
    lp.frequency.linearRampToValueAtTime(freq * 5.5, at + Math.min(0.5, dur * 0.4));
    lp.frequency.linearRampToValueAtTime(freq * 3.2, at + dur);

    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.13);          // 관악기다운 완만한 어택
    env.gain.setValueAtTime(vol, at + Math.max(0.2, dur - 0.5));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    lp.connect(env); env.connect(dest);

    // 살짝 흔들어 주면(비브라토) 기계음이 덜 난다
    var lfo = ctx.createOscillator(); lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.2, at);
    var lfoAmt = ctx.createGain(); lfoAmt.gain.setValueAtTime(freq * 0.004, at);
    lfo.connect(lfoAmt);
    lfo.start(at); lfo.stop(at + dur + 0.1);
    nodes.push(lfo);

    var detune = [0.997, 1, 1.003];   // 셋을 겹쳐 «여러 명이 분다» 는 두께
    for (var i = 0; i < detune.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * detune[i], at);
      lfoAmt.connect(osc.frequency);
      osc.connect(lp);
      osc.start(at); osc.stop(at + dur + 0.1);
      nodes.push(osc);
    }
  }

  // 팀파니 — 낮은 사인 «둥» + 아주 짧은 잡음 «탁»
  function timpani(freq, at, vol, dest) {
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.5, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.09);
    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
    osc.connect(env); env.connect(dest);
    osc.start(at); osc.stop(at + 1.6);
    nodes.push(osc);

    var src = ctx.createBufferSource();
    src.buffer = noise();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq * 3, at);
    var nEnv = ctx.createGain();
    nEnv.gain.setValueAtTime(vol * 0.5, at);
    nEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    src.connect(bp); bp.connect(nEnv); nEnv.connect(dest);
    src.start(at); src.stop(at + 0.2);
    nodes.push(src);
  }

  function chordAt(freqs, at, dur, vol, dest) {
    for (var i = 0; i < freqs.length; i++) brass(freqs[i], at, dur, vol, dest);
  }

  // ── 곡 ──────────────────────────────────────────────────────────────────
  // 리하르트 슈트라우스 「짜라투스트라는 이렇게 말했다」(1896) 서주 «일출».
  // 🔓 작곡가 사후 70년이 지나 **작곡은 퍼블릭 도메인**이다 — 그래서 «연주» 는 자유롭다.
  //    ⛔ 자유롭지 않은 것은 «남의 녹음» 이다. 그래서 음원을 가져오지 않고 여기서 직접 낸다.
  // 다 장조. 낮은 도(C) 지속음 위로 도–솔–도 가 세 번 올라가고, 그때마다 단3화음이
  // 장3화음으로 열린다. 세 번째가 가장 크고, 팀파니와 함께 끝까지 남는다.
  var C1 = 32.70, C2 = 65.41, C3 = 130.81;
  var C4 = 261.63, G4 = 392.00, C5 = 523.25;
  var Eb4 = 311.13, E4 = 329.63, G3 = 196.00, Eb3 = 155.56, E3 = 164.81;

  function compose(t0) {
    var span = 82;    // 사장님 요청 «처음부터 1분 20초까지»

    // 공간감 — 큰 홀 흉내. 리버브 임펄스가 없어 피드백 딜레이로 대신한다.
    var delay = ctx.createDelay(1.0);
    delay.delayTime.setValueAtTime(0.42, t0);
    var fb = ctx.createGain(); fb.gain.setValueAtTime(0.32, t0);
    var wet = ctx.createGain(); wet.gain.setValueAtTime(0.26, t0);
    delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(master);

    var bus = ctx.createGain(); bus.gain.setValueAtTime(1, t0);
    bus.connect(master); bus.connect(delay);
    nodes.push(delay, fb, wet, bus);

    // ① 바닥 — 낮은 도 지속음이 끝까지 깔린다 (거의 안 들리게 시작)
    pedal(C1, t0, span, 0.085, master);
    pedal(C2, t0, span, 0.055, master);

    // ②③④ 세 번의 «도–솔–도». 갈수록 커진다.
    //    [시작초, 금관세기, 화음세기, 팀파니세기, 화음길이]
    var passes = [
      [17.0, 0.115, 0.075, 0.30, 4.0],
      [35.0, 0.145, 0.095, 0.40, 4.0],
      [53.0, 0.180, 0.130, 0.52, 9.5]
    ];

    for (var p = 0; p < passes.length; p++) {
      var s = t0 + passes[p][0], bv = passes[p][1], cv = passes[p][2];
      var tv = passes[p][3], hold = passes[p][4];
      var last = (p === passes.length - 1);

      brass(C4, s,       3.1, bv,        bus);
      brass(G4, s + 3.2, 3.1, bv * 1.05, bus);
      brass(C5, s + 6.4, 3.2, bv * 1.10, bus);

      // 단3화음 → 장3화음 («어두움에서 빛으로»)
      var minorAt = s + 9.7, majorAt = minorAt + 1.9;
      if (!last) {
        chordAt([C3, Eb3, G3, C4, Eb4], minorAt, 2.0, cv, bus);
      } else {
        chordAt([C3, Eb3, G3, C4, Eb4], minorAt, 1.6, cv, bus);
      }
      chordAt([C2, C3, E3, G3, C4, E4, G4, C5], majorAt, hold, cv * 1.15, bus);

      // 팀파니 — 화음이 열리는 순간과 그 뒤 두 번
      timpani(C2, majorAt,        tv,        bus);
      timpani(C2, majorAt + 0.62, tv * 0.72, bus);
      timpani(C3, majorAt + 1.24, tv * 0.60, bus);

      if (last) {
        // 마지막은 팀파니가 한 번 더 밀어 주고, 화음이 길게 남으며 끝난다
        timpani(C2, majorAt + 2.0, tv * 0.85, bus);
        timpani(C2, majorAt + 2.6, tv * 0.65, bus);
        chordAt([C2, C3, G3, C4, E4, G4], majorAt + 4.2, span - (passes[p][0] + 15.8), cv * 0.8, bus);
      }
    }

    return span;
  }

  // ── 정지 — 짧게 페이드아웃해야 «툭» 끊기지 않는다 ──────────────────────
  function stop(byUser) {
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    if (!playing) { if (byUser) markDone(); syncBtn(); return; }
    playing = false;
    try {
      var now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.18);
    } catch (e) {}
    setTimeout(teardown, 260);
    markDone();
    syncBtn();
  }

  function teardown() {
    for (var i = 0; i < nodes.length; i++) {
      try { if (nodes[i].stop) nodes[i].stop(0); } catch (e) {}
      try { nodes[i].disconnect(); } catch (e) {}
    }
    nodes = [];
    try { if (ctx && ctx.close) ctx.close(); } catch (e) {}
    ctx = null; master = null;
    syncBtn();
  }

  // ── 재생 ────────────────────────────────────────────────────────────────
  function play() {
    if (playing || blocked()) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { markDone(); return; }

    try { ctx = new AC(); } catch (e) { markDone(); return; }

    // 정책상 잠겨 있으면 제스처를 기다린다 (resume 은 제스처 안에서만 통한다)
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) {}
      if (ctx.state === 'suspended') { try { ctx.close(); } catch (e) {} ctx = null; return; }
    }

    master = ctx.createGain();
    master.gain.setValueAtTime(MASTER_VOL, ctx.currentTime);

    // 🛡️ 마지막은 «리미터» 다 — 컴프레서가 아니라 한계를 못 넘게 막는 용도.
    //   마지막 화음은 금관 8성부 × (디튠 3개) 라 톱니파가 20개 넘게 겹친다. 그대로 두면
    //   합이 1.0 을 넘어 스피커에서 «지직» 거린다. ratio 20 · 빠른 어택으로 천장을 만든다.
    //   ⚠️ 헤드리스에서 오프라인 렌더로 피크를 재려 했으나 가상시간 안에 끝나지 않아
    //      **수치로 확인하지 못했다.** 그래서 «재서 맞추는» 대신 «넘을 수 없게» 막는 쪽을 택했다.
    var comp = ctx.createDynamicsCompressor();
    try {
      comp.threshold.setValueAtTime(-3, ctx.currentTime);
      comp.knee.setValueAtTime(0, ctx.currentTime);
      comp.ratio.setValueAtTime(20, ctx.currentTime);
      comp.attack.setValueAtTime(0.003, ctx.currentTime);
      comp.release.setValueAtTime(0.25, ctx.currentTime);
    } catch (e) {}
    master.connect(comp); comp.connect(ctx.destination);

    playing = true;
    syncBtn();
    var len = compose(ctx.currentTime + 0.06);
    endTimer = setTimeout(function () {
      endTimer = null;
      if (playing) { playing = false; markDone(); teardown(); }
    }, (len + 0.5) * 1000);
  }

  // ── 🔊 버튼 ─────────────────────────────────────────────────────────────
  // ⚠️ 스타일은 document.body 끝에 붙인다 — head 에 붙이면 index.html 의 body <style> 들에게
  //    같은 특정성에서 진다(CLAUDE.md 2장 「JS 로 스타일을 얹었는데 짐」).
  function injectStyle() {
    if (document.getElementById('mgo-sound-style')) return;
    var st = document.createElement('style');
    st.id = 'mgo-sound-style';
    st.textContent = [
      '#' + BTN_ID + '{position:fixed;left:16px;bottom:76px;width:34px;height:34px;',
      '  display:none;align-items:center;justify-content:center;padding:0;',
      '  border:1.5px solid rgba(245,158,11,.65);border-radius:50%;',
      '  background:rgba(18,12,2,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
      '  color:#fbbf24;font-size:15px;line-height:1;cursor:pointer;',
      '  box-shadow:0 0 10px rgba(245,158,11,.35);',
      '  -webkit-tap-highlight-color:transparent;z-index:2147482900;',
      '  transition:background .18s ease,border-color .18s ease;}',
      '#' + BTN_ID + '.mgo-show{display:flex;}',
      /* ⛔ hover 로 크기를 바꾸지 않는다 — 「hover 확대 금지」(CLAUDE.md 1-3) */
      '#' + BTN_ID + ':hover{background:rgba(245,158,11,.22);border-color:rgba(245,158,11,.95);}',
      '#' + BTN_ID + '.mgo-off{color:#94a3b8;border-color:rgba(148,163,184,.5);box-shadow:none;}',
      '@media (max-width:640px){#' + BTN_ID + '{bottom:72px;width:32px;height:32px;font-size:14px;}}'
    ].join('');
    (document.body || document.documentElement).appendChild(st);
  }

  function syncBtn() {
    if (!btn) return;
    var off = muted();
    // ⚠️ 이모지는 Unicode 13 미만만 쓴다 — Win10 에서 두부가 된다(CLAUDE.md 1-4).
    //    🔊 U+1F50A · 🔇 U+1F507 은 둘 다 Unicode 6.0 이라 안전하다.
    btn.textContent = off ? '🔇' : '🔊';
    btn.classList.toggle('mgo-off', off);
    var ko = off ? '오프닝 소리 켜기' : '오프닝 소리 끄기';
    var en = off ? 'Turn opening sound on' : 'Turn opening sound off';
    // 🌐 를 눌러도 따라오게 data-ko/data-en 을 함께 갱신한다(CLAUDE.md 2장 「JS 로 그린 라벨」)
    btn.setAttribute('data-ko', ko);
    btn.setAttribute('data-en', en);
    var isEn = false;
    try { isEn = (typeof window.getLang === 'function' && window.getLang() === 'en'); } catch (e) {}
    var label = isEn ? en : ko;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', off ? 'false' : 'true');
  }

  function showBtn(on) {
    if (!btn) return;
    btn.classList.toggle('mgo-show', !!on);
  }

  function makeBtn() {
    if (btn) return;
    injectStyle();
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    // 🔁 아이콘이 곧 «지금 설정» 이고, 누르면 그 설정이 뒤집힌다. 그게 전부다.
    //   ⚠️ 예전엔 «재생 중이면 끄기 / 멈춰 있으면 다시 듣기» 로 갈랐는데, 화면을 눌러 끈
    //      뒤에는 🔊 가 그대로인 채 «다시 듣기» 가 되어 — 끄려고 누른 사람에게 소리가
    //      다시 났다(헤드리스 실측으로 잡음). 아이콘과 동작이 어긋나면 안 된다.
    //   켜기를 고르면 그 자리에서 들려준다(그 클릭 자체가 자동재생 잠금을 푸는 제스처다).
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (muted()) {
        setMuted(false);
        finished = false;
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        play();
      } else {
        setMuted(true);
        stop(true);
      }
      syncBtn();
    });
    (document.body || document.documentElement).appendChild(btn);
    syncBtn();
  }

  // ── 사용자 입력: 첫 번째는 «시작», 그 뒤로는 «정지» ─────────────────────
  function onGesture(ev) {
    // 버튼 자신의 클릭은 여기서 처리하지 않는다 — 버튼에는 자기 핸들러가 있다
    try {
      var t = ev.target;
      if (t && t.closest && t.closest('#' + BTN_ID)) return;
    } catch (e) {}

    if (muted()) return;

    if (!playing) {
      if (finished || blocked()) return;
      // 아직 안 울렸다 = 이 제스처는 자동재생 잠금을 푸는 열쇠다.
      armGesture = ev;
      play();
      return;
    }
    // 시작시킨 바로 그 이벤트가 되돌아온 것이면 무시 (안 그러면 즉시 자기를 끈다)
    if (armGesture && ev === armGesture) { armGesture = null; return; }
    stop(true);
  }

  var EVENTS = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
  for (var ei = 0; ei < EVENTS.length; ei++) {
    try { window.addEventListener(EVENTS[ei], onGesture, { capture: true, passive: true }); } catch (e) {}
  }

  // ── 수업으로 들어가면 즉시 끈다 ────────────────────────────────────────
  // ⛔ body class 를 MutationObserver 로 지켜보지 않는다(2026-07-14 홈 먹통의 뿌리).
  try {
    var origShow = window.showView;
    if (typeof origShow === 'function' && !origShow.__openingWrapped) {
      window.showView = function (id) {
        var r = origShow.apply(this, arguments);
        try {
          if (id === 'view-videocall-call') { stop(false); showBtn(false); }
          else { showBtn(!introUp() && !inCall()); }
        } catch (e) {}
        return r;
      };
      window.showView.__openingWrapped = true;
    }
  } catch (e) {}

  try {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && playing) stop(false);
    });
  } catch (e) {}

  // 🌐 언어 전환 때 라벨을 다시 입힌다
  try { window.addEventListener('mangoi:lang-changed', syncBtn); } catch (e) {}

  // ── 시작 시점: 인트로가 물러난 «뒤» ────────────────────────────────────
  // ⛔ 상주 setInterval 을 두지 않는다 — 끝이 있는 확인이다(최대 30초).
  function boot() {
    makeBtn();

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (tries > 60) { clearInterval(timer); return; }   // 30초면 그만 본다
      if (inCall()) return;                                // 수업 중이면 계속 기다린다
      if (introUp()) return;                               // 인트로가 물러날 때까지
      clearInterval(timer);
      showBtn(true);
      if (thrifty()) { finished = true; return; }   // 약한 기기·데이터절약 — 버튼만 두고 조용히
      if (!muted() && !alreadyDone()) play();
      else finished = alreadyDone();
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 진단용 — 콘솔에서 다시 들어 볼 때
  try {
    window.mangoiOpeningReplay = function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
      setMuted(false);
      finished = false; playing = false; armGesture = null;
      play(); syncBtn();
    };
  } catch (e) {}
})();
