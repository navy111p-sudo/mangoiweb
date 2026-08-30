/* idx-home-opening.js — 홈 화면 «오프닝 사운드» (2026-08-23)
 * ─────────────────────────────────────────────────────────────────────────────
 * [사장님 지시] 「홈페이지 오픈 음악을 켜 줘. 소리는 클릭하면 무조건 사라지게 —
 *               어디든 화면 클릭하거나 모바일에선 터치하면. 버튼도 만들어 줘. 둘 다.」
 *   → 끄는 길이 둘이다. ① 화면 아무 데나 클릭·터치 ② 🔊 버튼.
 *     버튼은 «다시 듣기» 도 겸한다(꺼진 뒤 누르면 처음부터 다시 울린다).
 *
 * [무엇을 소리내나] 슈트라우스 «짜라투스트라는 이렇게 말했다» 서주 «일출».
 *   1순위 — **진짜 녹음** `/audio/zarathustra-opening.mp3` 의 3초~1분 20초 (2026-08-24 사장님 지정).
 *     Sascha Ende 연주(filmmusic.io), 위키미디어 커먼즈의 **CC-BY 4.0** 파일.
 *     ⚠️ CC-BY 조건 = 출처 표기. 재생 중 왼쪽 아래에 뜨는 출처 한 줄(#mgo-sound-credit)을
 *        지우면 **라이선스 위반**이 된다. 디자인이 거슬리면 옮기되 없애지 말 것.
 *   2순위 — 파일이 없거나 못 읽으면 아래 compose() 의 **웹오디오 합성**(약 82초)으로 폴백.
 *     낮은 도 지속음 위로 «도–솔–도» 세 번, 단3화음 → 장3화음, 팀파니.
 *   ⛔ 반복(loop)하지 않는다. 한 번 울리고 끝이다 — 홈에 머무는 학생 폰을 계속 깨우지 않는다.
 *
 * [🔓 저작권 — 무엇이 되고 무엇이 안 되나]
 *   ・**작곡**(1896년 작, 슈트라우스 1949년 몰) → 사후 70년이 지나 **퍼블릭 도메인**.
 *   ・**녹음** → 별개 권리. 유튜브·시판 음원은 안 되고, **CC-BY·PD 로 공개된 녹음**만 된다.
 *     지금 파일이 그 CC-BY 녹음이다. ⛔ 다른 녹음으로 바꿀 때도 라이선스부터 확인할 것.
 *
 * [무게] mp3 는 **재생을 시작할 때만** 받는다(new Audio 가 그때 요청) — 첫 화면 무게 0바이트.
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
  var startedAt = 0;      // 재생을 시작한 시각(ms) — 시작시킨 클릭이 자기를 끄지 못하게
  var START_GRACE_MS = 700;   // 한 번의 손짓이 만드는 형제 이벤트를 다 덮을 만큼

  // ── 🎼 진짜 녹음 (2026-08-24 사장님 지정) ────────────────────────────────
  // Sascha Ende — «Also Sprach Zarathustra (feat. Richard Strauss)», filmmusic.io
  // 위키미디어 커먼즈에서 받은 CC-BY 4.0 녹음. 재생 중 왼쪽 아래에 출처 한 줄을 띄운다
  // (CC-BY 는 «출처 표기» 가 조건이다 — 그 줄을 지우면 라이선스 위반이 된다).
  // 지정 구간: 3초 ~ 1분 20초. 파일은 자르지 않고 «재생만» 그 구간으로 한다
  //   (이 컨테이너의 ffmpeg 은 오디오 코덱이 없는 축소 빌드라 자르기가 불가능하고,
  //    자를 필요도 없다 — currentTime 으로 시작점을, timeupdate 로 끝점을 잡으면 된다).
  // ⚠️ 파일이 없거나(404)·못 읽으면 **웹오디오 합성(아래 compose)** 으로 자동 폴백한다.
  // ⚠️ 파일은 «재생을 시작할 때만» 받는다 — 첫 화면 무게에 0바이트.
  var AUDIO_URL   = '/audio/zarathustra-opening.mp3';
  var AUDIO_START = 3;      // 초 — 사장님 지정 «3초부터»
  var AUDIO_END   = 80;     // 초 — «1분 20초까지»
  var AUDIO_VOL   = 0.85;   // 음반은 이미 마스터링돼 있어 합성(0.40)보다 높여도 안전
  var audioEl = null;
  var audioFailed = false;  // 한 번 실패하면 이 세션에서는 합성으로만 간다
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
    // «웅장하게» (2026-08-23) — 필터를 더 열어 금관의 쨍한 윗배음을 살린다.
    //   숫자만 키우면 낮은 음이 답답하고 높은 음이 날카로워지므로 상한을 함께 둔다.
    lp.frequency.setValueAtTime(freq * 2.0, at);
    lp.frequency.linearRampToValueAtTime(Math.min(freq * 9, 9500), at + Math.min(0.5, dur * 0.4));
    lp.frequency.linearRampToValueAtTime(Math.min(freq * 5, 7000), at + dur);

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

  // 심벌즈 — 잡음을 하이패스로 걸러 «촤아» 하고 길게 사라진다 (2026-08-23 사장님 «고음도» 요청)
  function cymbal(at, dur, vol, dest) {
    var src = ctx.createBufferSource();
    src.buffer = noise(); src.loop = true;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5200, at);
    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(hp); hp.connect(env); env.connect(dest);
    src.start(at); src.stop(at + dur + 0.1);
    nodes.push(src);
  }

  // 높은 현(스트링) — 사인 셋을 미세 디튠해 «반짝이며 떠 있는» 고음층
  function shimmer(freq, at, dur, vol, dest) {
    var detune = [0.996, 1, 1.004];
    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(vol, at + Math.min(0.9, dur * 0.3));
    env.gain.setValueAtTime(vol, at + Math.max(0.9, dur - 1.2));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    env.connect(dest);
    for (var i = 0; i < detune.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * detune[i], at);
      osc.connect(env);
      osc.start(at); osc.stop(at + dur + 0.1);
      nodes.push(osc);
    }
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

    var G5 = 783.99, C6 = 1046.50, E5 = 659.26;   // «고음» (2026-08-23 사장님 요청)

    for (var p = 0; p < passes.length; p++) {
      var s = t0 + passes[p][0], bv = passes[p][1], cv = passes[p][2];
      var tv = passes[p][3], hold = passes[p][4];
      var last = (p === passes.length - 1);

      brass(C4, s,       3.1, bv,        bus);
      brass(G4, s + 3.2, 3.1, bv * 1.05, bus);
      brass(C5, s + 6.4, 3.2, bv * 1.10, bus);

      // 🎺 옥타브 위 겹침 — 2·3번째는 트럼펫이 한 옥타브 위에서 같이 분다 (원곡의 «쨍한» 층)
      if (p >= 1) {
        var ov = bv * (last ? 0.55 : 0.40);
        brass(C5, s,       3.1, ov,        bus);
        brass(G5, s + 3.2, 3.1, ov * 1.05, bus);
        brass(C6, s + 6.4, 3.2, ov * 1.10, bus);
      }

      // 단3화음 → 장3화음 («어두움에서 빛으로»)
      var minorAt = s + 9.7, majorAt = minorAt + 1.9;
      if (!last) {
        chordAt([C3, Eb3, G3, C4, Eb4], minorAt, 2.0, cv, bus);
      } else {
        chordAt([C3, Eb3, G3, C4, Eb4], minorAt, 1.6, cv, bus);
      }
      chordAt([C2, C3, E3, G3, C4, E4, G4, C5], majorAt, hold, cv * 1.15, bus);
      // 화음 위에도 고음층 — 높은 현이 E5·G5·C6 로 떠 있는다
      if (p >= 1) {
        shimmer(E5, majorAt, Math.min(hold, 6), cv * 0.30, bus);
        shimmer(G5, majorAt, Math.min(hold, 6), cv * 0.26, bus);
        if (last) shimmer(C6, majorAt, Math.min(hold, 6), cv * 0.22, bus);
      }

      // 팀파니 — 화음이 열리는 순간과 그 뒤 두 번. 열릴 때 심벌즈가 «촤아» (2번째부터)
      timpani(C2, majorAt,        tv,        bus);
      if (p >= 1) cymbal(majorAt, last ? 3.2 : 2.2, last ? 0.16 : 0.10, bus);
      timpani(C2, majorAt + 0.62, tv * 0.72, bus);
      timpani(C3, majorAt + 1.24, tv * 0.60, bus);

      if (last) {
        // 마지막은 팀파니가 한 번 더 밀어 주고, 화음이 길게 남으며 끝난다
        timpani(C2, majorAt + 2.0, tv * 0.85, bus);
        timpani(C2, majorAt + 2.6, tv * 0.65, bus);
        var tailAt = majorAt + 4.2, tailDur = span - (passes[p][0] + 15.8);
        chordAt([C2, C3, G3, C4, E4, G4], tailAt, tailDur, cv * 0.8, bus);
        shimmer(E5, tailAt, Math.min(tailDur, 8), cv * 0.20, bus);
        shimmer(G5, tailAt, Math.min(tailDur, 8), cv * 0.17, bus);
      }
    }

    return span;
  }

  // ── 정지 — 짧게 페이드아웃해야 «툭» 끊기지 않는다 ──────────────────────
  function stop(byUser) {
    if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    if (!playing) { if (byUser) markDone(); syncBtn(); return; }
    playing = false;

    if (audioEl) {
      // 진짜 녹음 — 0.18초 페이드아웃 후 정리
      var a = audioEl, steps = 6, i = 0;
      var iv = setInterval(function () {
        i++;
        try { a.volume = Math.max(0, a.volume * (1 - i / steps)); } catch (e) {}
        if (i >= steps) { clearInterval(iv); if (a === audioEl) cleanupAudio(); else { try { a.pause(); } catch (e) {} } }
      }, 30);
      markDone();
      syncBtn();
      return;
    }

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
  // 진짜 녹음을 먼저 시도하고, 실패하면(파일 없음·재생 불가) 합성으로 폴백한다.
  function play() {
    if (playing || blocked()) return;
    // 🔴 시작 «절차가 진행 중» 이면(파일을 받는 중 — play() 약속이 아직 안 풀림) 또 만들지 않는다.
    //    안 막으면 그 사이 클릭마다 Audio 가 하나씩 더 생겨 **같은 곡이 겹쳐** 울린다
    //    (느린 회선일수록 이 창이 길다 — 헤드리스 실측으로 재현하고 막았다).
    if (audioEl) return;
    if (!audioFailed) { playAudio(); return; }
    playSynth();
  }

  function cleanupAudio() {
    var a = audioEl; audioEl = null;
    if (!a) return;
    try { a.pause(); } catch (e) {}
    try { a.removeAttribute('src'); a.load(); } catch (e) {}   // 내려받기 중단
    showCredit(false);
  }

  function finishAudio() {
    playing = false;
    markDone();
    cleanupAudio();
    syncBtn();
  }

  function playAudio() {
    var a = null;
    try { a = new Audio(); } catch (e) { audioFailed = true; playSynth(); return; }
    audioEl = a;
    a.preload = 'auto';
    // #t=3 (미디어 프래그먼트) 로 시작점을 요청하고, 못 알아듣는 브라우저를 위해
    // loadedmetadata 에서 한 번 더 currentTime 으로 잡는다.
    a.src = AUDIO_URL + '#t=' + AUDIO_START;
    a.volume = AUDIO_VOL;

    a.addEventListener('loadedmetadata', function () {
      try { if (a.currentTime < AUDIO_START - 0.5) a.currentTime = AUDIO_START; } catch (e) {}
    });
    a.addEventListener('timeupdate', function () {
      if (a !== audioEl || !playing) return;
      var t = a.currentTime;
      if (t >= AUDIO_END) { finishAudio(); return; }
      // 끝 2초는 페이드아웃 — 1:20 에서 «툭» 끊기지 않게
      if (t >= AUDIO_END - 2) {
        try { a.volume = Math.max(0, AUDIO_VOL * (AUDIO_END - t) / 2); } catch (e) {}
      }
    });
    a.addEventListener('ended', function () { if (a === audioEl && playing) finishAudio(); });
    a.addEventListener('error', function () {
      // 소스가 깨졌다(404·디코드 실패) — 이 세션은 합성으로
      if (a !== audioEl) return;
      audioFailed = true;
      var wasPlaying = playing; playing = false;
      cleanupAudio();
      if (!wasPlaying && !finished) playSynth();
    });

    // 🛡️ 워치독 — 내려받기가 멎어 play() 약속이 «영영 안 풀리면» 이 세션은 합성으로 간다.
    //   안 두면 audioEl 이 잡힌 채로 남아 재생도 폴백도 없는 «무음 세션» 이 된다.
    //   12초는 느린 회선의 정상 버퍼링을 해치지 않을 만큼 길게 잡은 값이다.
    var watchdog = setTimeout(function () {
      if (a !== audioEl || playing) return;
      audioFailed = true;
      cleanupAudio();
      if (!finished && !blocked() && !muted()) playSynth();
    }, 12000);

    var p = null;
    try { p = a.play(); } catch (e) { clearTimeout(watchdog); audioFailed = true; cleanupAudio(); playSynth(); return; }
    if (p && typeof p.then === 'function') {
      p.then(function () {
        clearTimeout(watchdog);
        if (a !== audioEl) return;
        playing = true;
        startedAt = Date.now();
        syncBtn();
        showCredit(true);
      }, function () {
        clearTimeout(watchdog);
        if (a !== audioEl) return;
        if (a.error) {
          // 파일 쪽 문제 → 합성 폴백
          audioFailed = true; cleanupAudio();
          if (!finished) playSynth();
        } else {
          // 자동재생 잠김 → 정리하고 사용자 제스처를 기다린다 (onGesture 가 다시 부른다)
          cleanupAudio();
        }
      });
    } else {
      playing = true; startedAt = Date.now(); syncBtn(); showCredit(true);
    }
  }

  // ── ♪ 출처 표기 (CC-BY 조건) — 페이지 «맨 아래» 정적 한 줄 ──────────────
  // 처음엔 재생 중 왼쪽 아래에 떠 있는 상자였는데 사장님이 「제목은 삭제」 지시(2026-08-24).
  // ⛔ 표기를 아예 없애면 CC-BY 위반이라 «위치» 만 옮겼다 — CC BY 4.0 §3(a)(2)는
  //    «매체·맥락에 맞는 합리적 방식» 을 허용하므로, 사이트 바닥글 방식이 통용된다.
  //    스크롤 맨 끝의 10px 정적 한 줄이라 화면에는 사실상 안 보인다.
  // showCredit(on) 시그니처는 유지 — 재생 경로의 호출부를 안 건드리기 위해서다.
  //    on=true 면 «존재 보장» 만 하고, false 여도 지우지 않는다(정적 표기니까).
  var creditEl = null;
  function showCredit(on) {
    if (!on || creditEl) return;
    if (document.getElementById('mgo-sound-credit')) { creditEl = document.getElementById('mgo-sound-credit'); return; }
    try {
      var d = document.createElement('div');
      d.id = 'mgo-sound-credit';
      d.textContent = 'Music: Also Sprach Zarathustra — Sascha Ende (filmmusic.io) · CC BY 4.0';
      // ⚠️ position 없음(정적) — 문서 흐름의 맨 끝. 떠 있지 않으니 아무것도 안 가린다.
      d.style.cssText = 'font:10px/1.6 sans-serif;color:rgba(255,255,255,.45);' +
        'text-align:center;padding:6px 12px 10px;pointer-events:none;';
      (document.body || document.documentElement).appendChild(d);
      creditEl = d;
    } catch (e) {}
  }

  function playSynth() {
    if (playing || blocked()) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { markDone(); return; }

    if (ctx) drop(ctx);   // 앞선 시도가 잠긴 채 남아 있으면 정리 (컨텍스트는 페이지당 개수 제한이 있다)
    try { ctx = new AC(); } catch (e) { markDone(); return; }

    // 제스처 «안» 에서 만든 컨텍스트는 대개 'running' 으로 시작한다.
    // 🔴 'suspended' 면 resume() 을 부르는데, 이건 **약속(Promise)** 이라
    //    바로 뒤에서 state 를 봐도 여전히 'suspended' 다. 예전 코드가 그렇게 봐서
    //    자동재생 시도를 늘 실패로 판정하고 컨텍스트를 닫아 버렸다.
    //    ✅ 약속이 풀린 «뒤에» 이어서 시작한다.
    if (ctx.state === 'suspended') {
      var pending = ctx, promise = null;
      try { promise = pending.resume(); } catch (e) {}
      if (promise && typeof promise.then === 'function') {
        promise.then(function () {
          if (ctx !== pending || playing || blocked() || muted() || finished) { drop(pending); return; }
          if (pending.state !== 'running') { drop(pending); return; }
          begin();
        }, function () { drop(pending); });
      } else {
        drop(pending);
      }
      return;
    }
    begin();
  }

  function drop(c) {
    try { if (c && c.close) c.close(); } catch (e) {}
    if (ctx === c) { ctx = null; master = null; }
  }

  // 실제로 소리를 만드는 부분 — 컨텍스트가 «깨어 있는» 것이 확인된 뒤에만 불린다.
  function begin() {
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
    startedAt = Date.now();
    syncBtn();
    var len = compose(ctx.currentTime + 0.06);
    endTimer = setTimeout(function () {
      endTimer = null;
      if (playing) { playing = false; markDone(); teardown(); syncBtn(); }
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
      /* 🛡 안전망 — 아이콘 말고 «글자» 가 들어오는 사고가 한 번 있었다(위 syncBtn 주석).
         다시 그런 일이 생겨도 화면으로 쏟아지지는 않게 동그라미 안에서 자른다. */
      '  overflow:hidden;white-space:nowrap;',
      '  transition:background .18s ease,border-color .18s ease;}',
      '#' + BTN_ID + '.mgo-show{display:flex;}',
      /* ⛔ hover 로 크기를 바꾸지 않는다 — 「hover 확대 금지」(CLAUDE.md 1-3) */
      '#' + BTN_ID + ':hover{background:rgba(245,158,11,.22);border-color:rgba(245,158,11,.95);}',
      '#' + BTN_ID + '.mgo-off{color:#94a3b8;border-color:rgba(148,163,184,.5);box-shadow:none;}',
      '@media (max-width:640px){#' + BTN_ID + '{bottom:72px;width:32px;height:32px;font-size:14px;}}',
      /* 🌊 재생 중 «파동» (v4 제안서 18). 상자 밖으로 번지는 링이라 overflow:hidden 에 잘리지
         않도록 box-shadow 로 그린다(가상요소를 쓰면 위 overflow 에 잘린다).
         ⛔ 크기(transform)는 건드리지 않는다 — 「hover 확대 금지」와 같은 이유로 자리가 흔들린다.
         ⚠️ 저사양(html.lite-mode)·«움직임 줄이기» 설정에서는 끈다. */
      '@keyframes mgoWave{0%{box-shadow:0 0 0 0 rgba(245,158,11,.45),0 0 0 0 rgba(245,158,11,.28);}',
      '  100%{box-shadow:0 0 0 10px rgba(245,158,11,0),0 0 0 18px rgba(245,158,11,0);}}',
      '#' + BTN_ID + '.mgo-playing{animation:mgoWave 1.6s ease-out infinite;}',
      '@media (prefers-reduced-motion:reduce){#' + BTN_ID + '.mgo-playing{animation:none;}}',
      'html.lite-mode #' + BTN_ID + '.mgo-playing{animation:none;}'
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
    // 🌊 재생 중에만 파동 (v4 제안서 18) — 아이콘·설명은 그대로 두고 «상태» 만 더한다
    btn.classList.toggle('mgo-playing', !!playing && !off);
    var ko = off ? '오프닝 소리 켜기' : '오프닝 소리 끄기';
    var en = off ? 'Turn opening sound on' : 'Turn opening sound off';
    // 🔴 이 버튼에는 data-ko/data-en 을 «절대» 달지 않는다.
    //    그 두 속성은 i18n 엔진이 **textContent 를 통째로 갈아끼우는** 열쇠라,
    //    아이콘 자리에 문장이 들어앉는다. 34px 짜리 동그란 버튼이라 그 문장이
    //    «오프 / 닝 소 / 리 끄 / 기» 로 쪼개져 밖으로 넘친다.
    //    (2026-08-24 사장님 제보 「글자가 이상해」. 실측 390px: textContent='오프닝 소리 끄기',
    //     scrollHeight 44 > 상자 32 → 세 줄. 아이콘은 사라진 상태였다.)
    //    ⚠️ 엔진이 둘이다 — index.html 인라인 엔진과 js/mango-i18n.js. 규칙이 같으니
    //       한쪽만 피해도 소용없다. 설명은 «-title / -aria» 접미사로 단다(둘 다 지원하고,
    //       그쪽은 title·aria-label 만 건드려 글자를 그리지 않는다).
    try { btn.removeAttribute('data-ko'); btn.removeAttribute('data-en'); } catch (e) {}
    btn.setAttribute('data-ko-title', ko);
    btn.setAttribute('data-en-title', en);
    btn.setAttribute('data-ko-aria', ko);
    btn.setAttribute('data-en-aria', en);
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
      play();
      return;
    }
    // 🔴 «막 시작시킨 그 클릭» 이 자기를 끄지 못하게 한다.
    //   손가락 한 번에 이벤트가 여럿 온다 — 마우스는 pointerdown+mousedown,
    //   터치는 pointerdown+touchstart. 예전엔 «시작 신호로 쓴 이벤트 객체와 같은가» 로
    //   갈랐는데, 뒤따라오는 형제 이벤트는 «다른 객체» 라 그대로 정지로 읽혔다.
    //   → 클릭 한 번에 시작하자마자 꺼졌고, markDone() 까지 불려 그 세션엔 영영 안 울렸다.
    //   (2026-08-23 사장님 「아무 음악소리도 안 들린다」의 원인. CLAUDE.md 게임허브 함정의 형제)
    //   ✅ 객체 동일성이 아니라 «시작한 지 얼마나 지났나» 로 판단한다.
    if (startedAt && (Date.now() - startedAt) < START_GRACE_MS) return;
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
      finished = false; playing = false; startedAt = 0; audioFailed = false;
      cleanupAudio();
      play(); syncBtn();
    };
  } catch (e) {}
})();
