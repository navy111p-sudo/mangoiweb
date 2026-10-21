/* 🎵 A.i영화더빙 — 배경음악·효과음 엔진(브라우저 안에서 «합성» — 파일·저작권·내려받기 없음)
 * ─────────────────────────────────────────────────────────────────────────────
 * 화면(js/ai-dubbing.js)이 섞개(AudioContext)를 넘겨주면 그 안에 음악·효과음 갈래를 만든다.
 *   create(ctx, outs) → 엔진. outs = [스피커 갈래, 완성영상 갈래(없으면 null)]
 *     engine.setPalette('jungle')   작품마다 악기 색(정글·우주·바다·로봇…)
 *     engine.music('tense')         분위기 음악 시작·바꾸기(바꿀 때 살짝 겹쳐 넘어간다)
 *     engine.stopMusic(초)          천천히 끈다
 *     engine.duck(0~1)              대사 동안 음악을 줄인다(1 = 원래 크기)
 *     engine.sfx('roar')            효과음 한 번
 *     engine.cue(신호)              매니페스트 신호 하나(분위기 바꾸기·효과음)
 *     engine.enterScene(악기색, 분위기, 배경음악파일있음)   장면에 들어갈 때(파일이 있으면 합성 음악을 끈다)
 *     engine.setEnabled(음악, 효과음) / pause() / resume() / dispose()
 *
 * ⚠️ 이름 목록(MOODS·PALETTES·SFX)은 정본(js/ai-dubbing-core.js 의 SOUND_*)과 «같은 말» 을 해야 한다 —
 *    test-harness/ai_dubbing_harness.mjs ⑪ 이 두 목록을 대조하고, 효과음·분위기를 «전부 실제로» 울려 본다.
 * ⛔ 상주 타이머를 두지 않는다 — 음악 박자 타이머는 음악이 도는 동안만 산다(stopMusic·pause 가 끈다).
 */
(function (root) {
  'use strict';

  /* 음계(반음 간격) */
  var MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], LYD = [0, 2, 4, 6, 7, 9, 11];

  /* 분위기 — 박자·음계·4마디 화음 진행(음계 몇 번째 음에서 쌓는 3화음)·16칸 무늬 */
  var MOODS = {
    bright:  { bpm: 112, mode: MAJ, prog: [0, 4, 5, 3], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.....x.x.......', arp: 'x.x.x.x.x.x.x.x.', pad: 0.5, lead: 1 },
    wonder:  { bpm: 84,  mode: LYD, prog: [0, 1, 4, 5], kick: '', snare: '', hat: '....x.......x...', bass: 'x.......x.......', arp: 'x..x..x..x..x...', pad: 0.9, lead: 0.8 },
    mystery: { bpm: 78,  mode: DOR, prog: [0, 0, 5, 4], kick: 'x.........x.....', snare: '', hat: '..x...x...x...x.', bass: 'x...x.......x...', arp: 'x....x....x.....', pad: 0.8, lead: 0.6 },
    tense:   { bpm: 132, mode: MIN, prog: [0, 0, 5, 6], kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', bass: 'x.xxx.xxx.xxx.x.', arp: 'x.x.x.x.x.x.x.x.', pad: 0.6, lead: 0.9 },
    action:  { bpm: 144, mode: MIN, prog: [0, 6, 5, 4], kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', bass: 'xx.xxx.xxx.xxx.x', arp: 'xxxxxxxxxxxxxxxx', pad: 0.5, lead: 1 },
    sad:     { bpm: 68,  mode: MIN, prog: [0, 5, 3, 4], kick: '', snare: '', hat: '', bass: 'x...............', arp: 'x...x...x...x...', pad: 1, lead: 0.6 },
    warm:    { bpm: 92,  mode: MAJ, prog: [0, 3, 4, 0], kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x...x...x...x...', arp: 'x..x..x.x..x..x.', pad: 0.8, lead: 0.8 },
    triumph: { bpm: 120, mode: MAJ, prog: [0, 3, 4, 4], kick: 'x...x...x...x...', snare: '....x.......x.x.', hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', arp: 'x.xxx.xxx.xxx.x.', pad: 0.7, lead: 1.1 },
    calm:    { bpm: 76,  mode: MAJ, prog: [0, 3, 0, 4], kick: '', snare: '', hat: '', bass: 'x.......x.......', arp: 'x...x...x...x...', pad: 0.9, lead: 0.5 },
  };
  /* 작품마다 악기 색 — 기준음(MIDI)·파형·필터·메아리 */
  var PALETTES = {
    adventure: { root: 50, pad: 'sawtooth', padCut: 1100, arp: 'triangle', arpDecay: 0.22, bass: 'triangle', echo: 0.12 },
    space:     { root: 52, pad: 'sine',     padCut: 2400, arp: 'sine',     arpDecay: 0.4,  bass: 'sine',     echo: 0.32 },
    jungle:    { root: 48, pad: 'triangle', padCut: 1400, arp: 'triangle', arpDecay: 0.12, bass: 'triangle', echo: 0.06 },
    sea:       { root: 53, pad: 'triangle', padCut: 1600, arp: 'sine',     arpDecay: 0.35, bass: 'sine',     echo: 0.24 },
    robot:     { root: 45, pad: 'sawtooth', padCut: 900,  arp: 'square',   arpDecay: 0.1,  bass: 'square',   echo: 0.1 },
    cinematic: { root: 50, pad: 'sawtooth', padCut: 1300, arp: 'triangle', arpDecay: 0.3,  bass: 'triangle', echo: 0.18 },
  };
  var SFX_NAMES = ['stomp', 'boing', 'sparkle', 'magic', 'whoosh', 'birds', 'roar', 'squeak', 'rumble', 'tada', 'clap',
    'fanfare', 'beep', 'engine', 'rocket', 'alarm', 'zap', 'powerup', 'crack', 'swing', 'rustle', 'drumroll', 'purr',
    'creak', 'crash', 'cheer', 'waves', 'horn', 'chime', 'wind', 'camera', 'heartbeat', 'thunder', 'pop'];

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  /* 음계 몇 번째 음(옥타브 넘김 포함) → 기준음에서 반음 몇 개 */
  function deg(mode, d) { var o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return mode[i] + 12 * o; }

  function create(ctx, outs) {
    if (!ctx) return null;
    var master = ctx.createGain(); master.gain.value = 0.9;
    var comp = ctx.createDynamicsCompressor ? ctx.createDynamicsCompressor() : null;
    if (comp) { try { comp.threshold.value = -16; comp.ratio.value = 4; } catch (e) {} master.connect(comp); }
    var tail = comp || master;
    (outs || []).forEach(function (o) { if (o) { try { tail.connect(o); } catch (e) {} } });

    var musicBus = ctx.createGain(); musicBus.gain.value = 0;          // 음악 갈래(켜고 끄기·겹쳐 넘기기)
    var duckGain = ctx.createGain(); duckGain.gain.value = 1;          // 대사 동안 줄이기
    var sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85;
    musicBus.connect(duckGain); duckGain.connect(master); sfxBus.connect(master);
    /* 메아리(우주·바다에서 크게) */
    var delay = ctx.createDelay ? ctx.createDelay(1) : null, fb = null, wet = null;
    if (delay) {
      delay.delayTime.value = 0.32; fb = ctx.createGain(); fb.gain.value = 0.32; wet = ctx.createGain(); wet.gain.value = 0;
      musicBus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(duckGain);
    }
    var noiseBuf = null;
    function noise() {
      if (noiseBuf) return noiseBuf;
      var n = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return noiseBuf;
    }

    var st = { palette: PALETTES.adventure, mood: null, cfg: null, on: false, musicOn: true, sfxOn: true,
      timer: null, next: 0, step: 0, paused: false, level: 0.3, duck: 1, disposed: false };
    var MUSIC_LEVEL = 0.3;

    /* ── 소리 조각 ── */
    function env(g, t0, a, peak, dur) {
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.01, dur));
    }
    /* 오실레이터 한 음: f0→f1 으로 미끄러진다 */
    function tone(dest, type, f0, f1, t0, dur, vol, cut) {
      var o = ctx.createOscillator(), g = ctx.createGain(), last = g;
      o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t0);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      if (cut) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut; o.connect(f); f.connect(g); } else o.connect(g);
      env(g, t0, Math.min(0.02, dur / 4), vol, dur);
      last.connect(dest);
      o.start(t0); o.stop(t0 + dur + 0.05);
      return o;
    }
    /* 잡음 한 덩이: 필터 주파수가 f0→f1 으로 움직인다 */
    function hiss(dest, t0, dur, vol, type, f0, f1, q, attack) {
      var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise(); s.loop = true;
      f.type = type || 'bandpass'; f.Q.value = q == null ? 1 : q;
      f.frequency.setValueAtTime(Math.max(30, f0), t0);
      if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      s.connect(f); f.connect(g); g.connect(dest);
      env(g, t0, attack || 0.005, vol, dur);
      s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
      return s;
    }

    /* ── 효과음 34가지 — 레시피는 (시각, 내보낼 곳) 을 받는다 ── */
    var RECIPES = {
      stomp: function (t, S) { tone(S, 'sine', 140, 38, t, 0.38, 0.95); hiss(S, t, 0.22, 0.45, 'lowpass', 400, 120, 0.7); },
      boing: function (t, S) { tone(S, 'sine', 150, 620, t, 0.32, 0.6); tone(S, 'triangle', 300, 980, t + 0.02, 0.3, 0.22); },
      sparkle: function (t, S) { [2093, 2637, 3136, 2349, 3520].forEach(function (f, i) { tone(S, 'sine', f, f * 1.01, t + i * 0.055, 0.32, 0.18); }); },
      magic: function (t, S) {
        [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(S, i % 2 ? 'triangle' : 'sine', f, f, t + i * 0.07, 0.45, 0.2); });
        hiss(S, t, 0.9, 0.12, 'highpass', 3000, 8000, 0.5, 0.2);
      },
      whoosh: function (t, S) { hiss(S, t, 0.55, 0.55, 'bandpass', 300, 3200, 1.2, 0.18); },
      birds: function (t, S) { [0, 0.16, 0.42, 0.58, 0.9].forEach(function (d, i) { tone(S, 'sine', 2400 + i * 140, 3700 - i * 90, t + d, 0.09, 0.16); }); },
      roar: function (t, S) {
        tone(S, 'sawtooth', 95, 58, t, 1.25, 0.42, 700); tone(S, 'sawtooth', 101, 61, t, 1.2, 0.32, 600);
        hiss(S, t, 1.1, 0.35, 'lowpass', 900, 300, 0.8, 0.12);
      },
      squeak: function (t, S) { tone(S, 'sine', 900, 1500, t, 0.1, 0.3); tone(S, 'sine', 1500, 1100, t + 0.11, 0.1, 0.25); },
      rumble: function (t, S) { hiss(S, t, 1.8, 0.6, 'lowpass', 160, 90, 0.7, 0.3); tone(S, 'sine', 44, 36, t, 1.6, 0.4); },
      tada: function (t, S) {
        [523, 659, 784].forEach(function (f) { tone(S, 'triangle', f, f, t, 0.16, 0.22); });
        [1047, 1319, 1568, 2093].forEach(function (f) { tone(S, 'triangle', f, f, t + 0.18, 0.9, 0.18); });
      },
      clap: function (t, S) { for (var i = 0; i < 6; i++) hiss(S, t + i * 0.13 + Math.random() * 0.03, 0.07, 0.45, 'bandpass', 1500, 1300, 0.9); },
      fanfare: function (t, S) {
        var n = [392, 523, 659, 784];
        n.forEach(function (f, i) { var d = i === 3 ? 0.9 : 0.16; tone(S, 'sawtooth', f, f, t + i * 0.17, d, 0.17, 1800); tone(S, 'triangle', f / 2, f / 2, t + i * 0.17, d, 0.12); });
      },
      beep: function (t, S) { tone(S, 'square', 880, 880, t, 0.08, 0.14, 3000); tone(S, 'square', 1175, 1175, t + 0.12, 0.08, 0.14, 3000); },
      engine: function (t, S) {
        var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 58; f.type = 'lowpass'; f.frequency.value = 500;
        lfo.frequency.value = 9; lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
        o.connect(f); f.connect(g); g.connect(S);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        o.frequency.linearRampToValueAtTime(85, t + 1.3);
        o.start(t); lfo.start(t); o.stop(t + 1.5); lfo.stop(t + 1.5);
      },
      rocket: function (t, S) { hiss(S, t, 1.6, 0.55, 'lowpass', 200, 2400, 0.8, 0.25); tone(S, 'sine', 70, 320, t, 1.5, 0.3); },
      alarm: function (t, S) { for (var i = 0; i < 4; i++) tone(S, 'square', i % 2 ? 960 : 720, i % 2 ? 960 : 720, t + i * 0.2, 0.18, 0.12, 2500); },
      zap: function (t, S) { tone(S, 'sawtooth', 1900, 90, t, 0.26, 0.3, 4000); hiss(S, t, 0.12, 0.2, 'highpass', 3000, 6000, 0.7); },
      powerup: function (t, S) { for (var i = 0; i < 8; i++) { var f = mtof(60 + i * 3); tone(S, 'square', f, f * 1.03, t + i * 0.045, 0.09, 0.11, 3500); } },
      crack: function (t, S) { hiss(S, t, 0.06, 0.7, 'highpass', 2200, 1800, 0.7); hiss(S, t + 0.03, 0.2, 0.45, 'bandpass', 700, 400, 1.4); },
      swing: function (t, S) { hiss(S, t, 0.38, 0.45, 'bandpass', 900, 220, 1.5, 0.12); tone(S, 'sine', 620, 960, t + 0.05, 0.28, 0.12); },
      rustle: function (t, S) { for (var i = 0; i < 7; i++) hiss(S, t + i * 0.09 + Math.random() * 0.04, 0.1, 0.22, 'bandpass', 3200, 2600, 0.6); },
      drumroll: function (t, S) {
        for (var i = 0; i < 22; i++) hiss(S, t + i * 0.055, 0.06, 0.18 + i * 0.012, 'bandpass', 1800, 1500, 0.8);
        hiss(S, t + 1.24, 0.8, 0.45, 'highpass', 4500, 3500, 0.5); tone(S, 'sine', 120, 50, t + 1.24, 0.3, 0.5);
      },
      purr: function (t, S) {
        var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = 70; lfo.frequency.value = 24; lg.gain.value = 0.18;
        var amp = ctx.createGain(); amp.gain.value = 0.2; lfo.connect(lg); lg.connect(amp.gain);
        var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
        o.connect(f); f.connect(amp); amp.connect(g); g.connect(S);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.start(t); lfo.start(t); o.stop(t + 1.2); lfo.stop(t + 1.2);
      },
      creak: function (t, S) {
        var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(180, t + 0.35); o.frequency.linearRampToValueAtTime(130, t + 0.65);
        f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 9;
        o.connect(f); f.connect(g); g.connect(S); env(g, t, 0.05, 0.5, 0.7);
        o.start(t); o.stop(t + 0.75);
      },
      crash: function (t, S) { hiss(S, t, 1.3, 0.55, 'highpass', 5000, 3000, 0.4); tone(S, 'sine', 110, 45, t, 0.4, 0.6); hiss(S, t, 0.3, 0.45, 'lowpass', 900, 200, 0.6); },
      cheer: function (t, S) {
        hiss(S, t, 1.7, 0.45, 'bandpass', 700, 1600, 0.5, 0.4);
        hiss(S, t + 0.1, 1.5, 0.3, 'bandpass', 2200, 1800, 0.7, 0.4);
        tone(S, 'sine', 1800, 2600, t + 0.5, 0.25, 0.08); tone(S, 'sine', 2000, 2900, t + 0.9, 0.22, 0.07);
      },
      waves: function (t, S) { hiss(S, t, 2.6, 0.5, 'lowpass', 300, 1100, 0.6, 1.1); hiss(S, t + 1.2, 1.6, 0.3, 'lowpass', 1100, 350, 0.6, 0.2); },
      horn: function (t, S) { tone(S, 'sawtooth', 147, 147, t, 1.1, 0.3, 700); tone(S, 'sawtooth', 220, 220, t, 1.1, 0.2, 800); },
      chime: function (t, S) { [1047, 1319, 1568].forEach(function (f, i) { tone(S, 'sine', f, f, t + i * 0.09, 1.2, 0.16); tone(S, 'sine', f * 2.76, f * 2.76, t + i * 0.09, 0.4, 0.03); }); },
      wind: function (t, S) { hiss(S, t, 2.2, 0.4, 'bandpass', 420, 950, 2.2, 0.8); },
      camera: function (t, S) { hiss(S, t, 0.03, 0.6, 'highpass', 3500, 3000, 0.7); hiss(S, t + 0.09, 0.05, 0.45, 'bandpass', 1500, 1200, 1.2); },
      heartbeat: function (t, S) { [0, 0.18, 0.75, 0.93].forEach(function (d, i) { tone(S, 'sine', 70, 45, t + d, 0.16, i % 2 ? 0.45 : 0.7); }); },
      thunder: function (t, S) { hiss(S, t, 0.12, 0.6, 'highpass', 1800, 1200, 0.5); hiss(S, t + 0.05, 2.4, 0.7, 'lowpass', 260, 80, 0.6, 0.15); },
      pop: function (t, S) { tone(S, 'sine', 600, 180, t, 0.09, 0.4); },
    };

    function sfx(name, vol) {
      if (st.disposed || !st.sfxOn || st.paused) return false;
      var r = RECIPES[name];
      if (!r) return false;
      try {
        var g = ctx.createGain();           // 한 번 울릴 때마다 따로 — 겹쳐 울려도 서로의 크기를 안 건드린다
        g.gain.value = (vol != null && isFinite(vol)) ? Math.max(0.05, Math.min(1.5, vol)) : 1;
        g.connect(sfxBus);
        r(ctx.currentTime + 0.02, g);
        setTimeout(function () { try { g.disconnect(); } catch (e) {} }, 4000);
        return true;
      } catch (e) { return false; }
    }

    /* ── 음악(박자 맞춰 미리 예약 — 0.25초 앞까지) ── */
    function drum(kind, t) {
      var b = musicBus;
      if (kind === 'k') tone(b, 'sine', 150, 42, t, 0.28, 0.9);
      else if (kind === 's') { hiss(b, t, 0.14, 0.32, 'bandpass', 1800, 1400, 0.8); tone(b, 'triangle', 220, 160, t, 0.08, 0.18); }
      else if (kind === 'h') hiss(b, t, 0.04, 0.12, 'highpass', 7000, 7000, 0.6);
    }
    function playStep(t, step, cfg, pal) {
      var i = step % 16, bar = Math.floor(step / 16) % 4;
      var spb = 60 / cfg.bpm / 4;
      var chordDeg = cfg.prog[bar];
      var root = pal.root;
      if (cfg.kick && cfg.kick[i] === 'x') drum('k', t);
      if (cfg.snare && cfg.snare[i] === 'x') drum('s', t);
      if (cfg.hat && cfg.hat[i] === 'x') drum('h', t);
      if (cfg.bass && cfg.bass[i] === 'x') {
        var bf = mtof(root - 12 + deg(cfg.mode, chordDeg));
        tone(musicBus, pal.bass, bf, bf, t, spb * 1.8, 0.42, 600);
      }
      if (cfg.arp && cfg.arp[i] === 'x') {
        var steps = [0, 2, 4, 7, 4, 2];
        var n = steps[(step >> 1) % steps.length];
        var af = mtof(root + 12 + deg(cfg.mode, chordDeg + n));
        tone(musicBus, pal.arp, af, af, t, pal.arpDecay, 0.13 * cfg.lead, 3200);
      }
      if (i === 0) {
        [0, 2, 4].forEach(function (d) {
          var f = mtof(root + deg(cfg.mode, chordDeg + d));
          tone(musicBus, pal.pad, f, f, t, spb * 16 * 0.98, 0.07 * cfg.pad, pal.padCut);
          tone(musicBus, pal.pad, f * 1.004, f * 1.004, t, spb * 16 * 0.98, 0.05 * cfg.pad, pal.padCut);
        });
      }
    }
    function tick() {
      st.timer = null;
      if (!st.on || st.paused || st.disposed) return;
      var cfg = st.cfg, pal = st.palette;
      var spb = 60 / cfg.bpm / 4;
      var now = ctx.currentTime;
      if (st.next < now - 0.5) st.next = now + 0.05;            // 탭이 숨었다 돌아오면 밀린 박자를 몰아 치지 않는다
      while (st.next < now + 0.25) {
        try { playStep(st.next, st.step, cfg, pal); } catch (e) {}
        st.next += spb; st.step++;
      }
      st.timer = setTimeout(tick, 60);
    }
    function ramp(param, to, sec) {
      var t = ctx.currentTime;
      try { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); param.linearRampToValueAtTime(to, t + Math.max(0.02, sec)); } catch (e) { param.value = to; }
    }
    function applyEcho() { if (wet) ramp(wet.gain, st.palette.echo || 0, 0.3); }
    function music(mood) {
      if (st.disposed) return false;
      var cfg = MOODS[mood];
      if (!cfg) return false;
      st.mood = mood;
      if (!st.musicOn) return true;                               // 꺼져 있으면 기억만 해 둔다(켜면 그 분위기로)
      if (st.on && st.cfg === cfg) return true;
      var wasOn = st.on && !st.paused;
      if (wasOn) {
        /* 겹쳐 넘어가기 — 0.35초 줄였다가 다음 마디부터 새 분위기 */
        ramp(musicBus.gain, MUSIC_LEVEL * 0.25, 0.35);
        setTimeout(function () {
          if (st.disposed || st.mood !== mood) return;
          st.cfg = cfg; st.step = 0;
          if (st.on && !st.paused) ramp(musicBus.gain, MUSIC_LEVEL, 0.8);
        }, 380);
        return true;
      }
      st.cfg = cfg; st.step = 0; st.on = true;
      st.next = ctx.currentTime + 0.08;
      applyEcho();
      if (!st.paused) { ramp(musicBus.gain, MUSIC_LEVEL, 1.0); if (!st.timer) tick(); }
      return true;
    }
    function stopMusic(sec) {
      st.on = false;
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      ramp(musicBus.gain, 0, sec == null ? 0.8 : sec);
    }
    function duck(level) {
      var v = Math.max(0, Math.min(1, level == null ? 1 : level));
      st.duck = v;
      ramp(duckGain.gain, v, v < 1 ? 0.18 : 0.6);
    }
    function setPalette(name) { var p = PALETTES[name]; if (p) { st.palette = p; applyEcho(); } return !!p; }
    function setEnabled(musicOn, sfxOn) {
      st.sfxOn = sfxOn !== false;
      var m = musicOn !== false;
      if (m === st.musicOn) return;
      st.musicOn = m;
      if (!m) stopMusic(0.4);
      else if (st.mood) { var md = st.mood; st.mood = null; music(md); }
    }
    function pause() {
      if (st.paused) return;
      st.paused = true;
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      ramp(musicBus.gain, 0, 0.2);
    }
    function resume() {
      if (!st.paused) return;
      st.paused = false;
      if (st.on && st.musicOn) { st.next = ctx.currentTime + 0.06; ramp(musicBus.gain, MUSIC_LEVEL, 0.5); if (!st.timer) tick(); }
    }
    function dispose() {
      stopMusic(0.2); st.disposed = true;
      setTimeout(function () { try { master.disconnect(); } catch (e) {} }, 400);
    }
    function state() { return { on: st.on, mood: st.mood, paused: st.paused, musicOn: st.musicOn, sfxOn: st.sfxOn, duck: st.duck, timer: !!st.timer }; }
    /* 매니페스트 신호 하나(정본 sceneCues·timedCues 가 돌려준 것) — 분위기 바꾸기·효과음 */
    function cue(c) {
      if (!c || st.disposed) return false;
      var ok = false;
      if (c.mood) ok = music(c.mood) || ok;
      if (c.name) ok = sfx(c.name, c.gain) || ok;
      return ok;
    }
    /* 장면에 들어갈 때 — 작품 악기 색 + 장면 분위기. 장면에 배경음악 «파일» 이 있으면 그 파일이 이긴다(합성 음악은 끈다) */
    function enterScene(palette, mood, hasBgmFile) {
      if (st.disposed) return false;
      if (palette) setPalette(palette);
      if (hasBgmFile) { st.mood = null; if (st.on) stopMusic(0.6); return false; }
      return mood ? music(mood) : false;
    }

    return { music: music, stopMusic: stopMusic, duck: duck, sfx: sfx, cue: cue, enterScene: enterScene, setPalette: setPalette,
      setEnabled: setEnabled, pause: pause, resume: resume, dispose: dispose, state: state };
  }

  var api = {
    create: create,
    MOODS: Object.keys(MOODS),
    PALETTES: Object.keys(PALETTES),
    SFX: SFX_NAMES.slice(),
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MangoiDubSound = api;
})(typeof window !== 'undefined' ? window : this);
