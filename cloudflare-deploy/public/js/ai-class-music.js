/* AI 선생님 수업 — 소리 모듈 (배경음악·시작 징글·단계 신호·효과음·Hello Song·마무리 음악)
   AI class sound module (BGM, opening jingle, stage sting, sound effects, Hello Song, ending music)

   2026-10-10 사장님 지시: «선생님이 말할 때 지루하지 않게 배경음악», «처음 시그널·엔딩 음악»,
   «잘 대답하면 특수효과 사운드», «Hello song 은 첫 레슨만 따라 말하기, 그다음부터는 노래로».

   ⚠️ 음악 파일을 새로 만들지 않습니다 — 생성형 이미지 도구는 음악을 못 만들고, 저장소가 공개라 남의 음원을
      올릴 수 없습니다. 그래서 배경음악·징글·노래 반주는 브라우저 WebAudio 로 «그 자리에서» 만듭니다(파일 0바이트).
      마무리 음악만 이미 저장소에 있는 /audio/new-bts/goodbye_inst.mp3 를 씁니다(없거나 막히면 만든 음악으로).
   ⛔ 상주 setInterval 을 두지 않습니다 — 배경음악은 setTimeout 으로 «켜진 동안만» 다음 마디를 미리 예약합니다.
   ⛔ «소리 끔» 이면 아무것도 안 냅니다(그 버튼이 정본). 배경음악은 따로 끌 수 있습니다(aiClassBgm).
   ⚠️ 학생이 말할 차례(마이크)에는 배경음악을 끕니다 — 음성인식이 음악을 말로 받아 적지 않게.
*/
(function () {
  'use strict';
  var ctx = null, master = null, bgmBus = null, sound = true, bgmPref = true, bgmLv = 0, schedTO = 0, nextAt = 0, beat = 0, outroEl = null, outroTO = 0, songSeq = 0;
  var LEVEL = { talk: 0.07, model: 0.03, off: 0 };
  var BPM = 96, SPB = 60 / BPM;
  // C - Am - F - G (마디마다 화음 하나) — 밝고 부드럽게
  var CHORDS = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];

  function ac() {
    if (!sound) return null;
    try {
      if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); bgmBus = ctx.createGain(); bgmBus.gain.value = 0; bgmBus.connect(master); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(f, t, len, vol, type, dest) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + len + 0.05);
  }

  // 배경음악 — 켜진 동안만 0.8초 앞까지 다음 박을 예약한다(setTimeout 재귀, 꺼지면 멈춤)
  function schedule() {
    schedTO = 0;
    if (!ctx || bgmLv <= 0) return;
    while (nextAt < ctx.currentTime + 0.8) {
      var ch = CHORDS[Math.floor(beat / 4) % CHORDS.length], b = beat % 4;
      if (b === 0) tone(ch[0] / 2, nextAt, SPB * 3.6, 0.5, 'sine', bgmBus);           // 낮은 베이스
      tone(ch[(b === 3 ? 1 : b)] * 2, nextAt, SPB * 0.9, 0.22, 'triangle', bgmBus);    // 퉁기는 아르페지오
      if (b === 2) tone(ch[2] * 2, nextAt + SPB / 2, SPB * 0.5, 0.12, 'triangle', bgmBus);
      nextAt += SPB; beat++;
    }
    schedTO = setTimeout(schedule, 250);
  }
  function bgm(level) {
    var v = bgmPref ? (LEVEL[level] || 0) : 0;
    if (v <= 0 && bgmLv <= 0) return;
    if (!ac()) { clearTimeout(schedTO); schedTO = 0; bgmLv = 0; if (bgmBus) try { bgmBus.gain.value = 0; } catch (e) {} return; }
    var t = ctx.currentTime;
    bgmBus.gain.cancelScheduledValues(t); bgmBus.gain.setValueAtTime(bgmBus.gain.value, t); bgmBus.gain.linearRampToValueAtTime(v, t + 0.6);
    var was = bgmLv; bgmLv = v;   // ⚠️ 먼저 적는다 — schedule() 이 bgmLv 를 보고 멈추므로
    if (v > 0 && was <= 0) { nextAt = t + 0.05; if (!schedTO) schedule(); }
    if (v <= 0) { clearTimeout(schedTO); schedTO = 0; }
  }

  // 시작 징글 — 약 1.6초. 끝나면 Promise 가 풀린다
  function jingle() {
    if (!ac()) return Promise.resolve();
    var t = ctx.currentTime + 0.05;
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, t + i * 0.12, 0.35, 0.13, 'triangle'); });
    [523.25, 659.25, 783.99].forEach(function (f) { tone(f, t + 0.55, 1.0, 0.09, 'sine'); tone(f * 2, t + 0.55, 0.9, 0.04, 'triangle'); });
    tone(130.81, t + 0.55, 1.0, 0.25, 'sine');
    return new Promise(function (r) { setTimeout(r, 1600); });
  }
  // 단계가 바뀔 때 짧은 신호
  function sting() { if (!ac()) return; var t = ctx.currentTime + 0.02; [659.25, 880.0].forEach(function (f, i) { tone(f, t + i * 0.1, 0.3, 0.09, 'sine'); }); }

  // 효과음 — ok(통과) · great(연속 정답·내 말로 대답) · find(낱말 찾기 성공)
  function sfx(kind) {
    if (!ac()) return false;
    var t = ctx.currentTime + 0.02;
    if (kind === 'great') {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) { tone(f, t + i * 0.07, 0.3, 0.11, 'square'); });
      [1046.5, 1318.5, 1567.98].forEach(function (f) { tone(f, t + 0.4, 0.7, 0.07, 'triangle'); });
    } else if (kind === 'find') {
      [1567.98, 2093.0, 2637.0].forEach(function (f, i) { tone(f, t + i * 0.05, 0.25, 0.07, 'sine'); });
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, t + i * 0.07, 0.32, 0.12, 'triangle'); });
    }
    return true;
  }

  // Hello Song — 줄마다 정해진 가락. 줄의 음절 수만큼 가락을 돌려 쓴다
  var MEL = [[523.25, 659.25, 783.99, 783.99], [880.0, 880.0, 783.99, 698.46, 698.46, 659.25], [587.33, 587.33, 659.25, 698.46, 783.99], [659.25, 523.25, 587.33, 523.25]];
  function sylls(line) { return String(line).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).reduce(function (n, w) { var v = (w.match(/[aeiouy]+/g) || []).length; if (w.length > 2 && /[^aeiouy]e$/.test(w)) v--; return n + Math.max(1, v); }, 0) || 1; }
  // 한 줄을 반주와 함께 연주한다. 연주 시간(초)을 돌려준다
  function phrase(line, li) {
    var n = sylls(line), mel = MEL[li % MEL.length], step = SPB * 0.75, len = n * step + SPB;
    if (!ac()) return len;
    var t = ctx.currentTime + 0.05, ch = CHORDS[li % CHORDS.length];
    for (var k = 0; k < n; k++) tone(mel[k % mel.length], t + k * step, step * 1.1, 0.1, 'triangle');
    tone(ch[0] / 2, t, len, 0.18, 'sine'); tone(ch[1], t, len, 0.04, 'sine'); tone(ch[2], t, len, 0.04, 'sine');
    return len;
  }
  // 노래 — 1절: 선생님이 가락에 맞춰 부르고(singLine 이 소리 내기를 맡음), 2절: 반주만 — 학생이 부른다
  //  onLine(pass, i) 으로 지금 줄을 알려 준다(가사 강조). 다른 차례가 시작되면(stopAll) 그 자리에서 멈춘다
  async function song(lines, singLine, onLine) {
    var my = ++songSeq; bgm('off');
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < lines.length; i++) {
        if (my !== songSeq) return false;
        if (onLine) onLine(pass, i);
        var len = phrase(lines[i], i) * 1000, t0 = Date.now();
        if (pass === 0 && singLine) await singLine(lines[i]);
        var left = len - (Date.now() - t0);
        if (left > 0) await new Promise(function (r) { setTimeout(r, left); });
      }
    }
    if (onLine && my === songSeq) onLine(-1, -1);
    return my === songSeq;
  }

  // 마무리 음악 — 저장소의 반주 파일을 30초쯤 틀고 서서히 줄인다. 못 틀면 만든 음악으로
  function outro() {
    stopOutro(); bgm('off');
    if (!sound) return;
    try {
      var a = new Audio('/audio/new-bts/goodbye_inst.mp3'); a.volume = 0.45; outroEl = a;
      var fallback = function () { if (outroEl === a) { outroEl = null; jingle(); } };
      a.addEventListener('error', fallback);
      var p = a.play(); if (p && p.catch) p.catch(fallback);
      outroTO = setTimeout(function fade() { if (outroEl !== a) return; a.volume = Math.max(0, a.volume - 0.05); if (a.volume <= 0.01) return stopOutro(); outroTO = setTimeout(fade, 200); }, 28000);
    } catch (e) { jingle(); }
  }
  function stopOutro() { clearTimeout(outroTO); var a = outroEl; outroEl = null; if (a) try { a.pause(); a.src = ''; } catch (e) {} }
  function stopAll() { songSeq++; stopOutro(); bgm('off'); }

  function readPref() { try { return localStorage.getItem('aiClassBgm') !== '0'; } catch (e) { return true; } }
  bgmPref = readPref();
  window.AiClassMusic = {
    bgm: bgm, jingle: jingle, sting: sting, sfx: sfx, song: song, outro: outro, stopAll: stopAll, sylls: sylls,
    setSound: function (on) { sound = !!on; if (!sound) stopAll(); },
    setBgm: function (on) { bgmPref = !!on; try { localStorage.setItem('aiClassBgm', on ? '1' : '0'); } catch (e) {} if (!on) bgm('off'); },
    bgmOn: function () { return bgmPref; },
    _state: function () { return { bgmLv: bgmLv, scheduling: !!schedTO, outro: !!outroEl, songSeq: songSeq }; }
  };
})();
