/* ═══════════════════════════════════════════════════════════════════════
 * 🔊 ai-dubbing-guide-voice.js — A.i영화더빙 «사용방법» 음성 안내 (2026-10-26)
 *   요청(사장님): 안내를 «클릭하면 바로 들리게» · «끄기» 버튼
 *
 *   · 소리는 «사람이 누를 때만» 난다 — 위쪽 ‘❓ 사용방법’으로 열 때, 안내창 안 ‘🔊 소리로 듣기’를 누를 때.
 *     ⛔ 페이지에 들어와 안내창이 «저절로» 뜰 때는 소리 0 (브라우저도 막고, 수업 중 갑자기 소리가 나면 안 된다).
 *   · 끄기 — 안내창 안 버튼이 ‘🔊 소리로 듣기’ ↔ ‘■ 소리 끄기’ 로 바뀐다.
 *     ‘시작하기’로 닫으면 안내가 이어지고 화면 아래 «■ 끄기» 막대가 남는다(그 화면을 보며 따라 하라고).
 *     ✕ · Esc · ‘오늘은 다시 보지 않기’로 닫으면 소리도 함께 꺼진다(안내를 치운다는 뜻).
 *   · 녹음·감상을 시작하는 버튼을 누르거나(STOP_ON) 화면의 다른 영상이 재생되면 바로 끈다
 *     — 녹음에 안내 목소리가 섞이지 않게. 페이지를 떠나면(pagehide) 끈다.
 *   · 언어를 바꾸면 «그 장면 처음부터» 다른 언어로 이어 간다(장면 시작 시각 OFFSETS).
 *   · 음원: /audio/dubbing-guide/guide-<ko|en>.mp3 — 장면 11개(대본 docs/A.i영화더빙_음성안내_AI성우대본.md),
 *     모노 64kbps · 잔잔한 배경음악이 함께 섞여 있다(따로 틀지 않는다 — 소리 요소 하나). 처음 누를 때 받는다(preload=none) → 안 듣는 사람은 0바이트.
 *   · 안내창(js/ai-dubbing-guide.js)은 열림·닫힘만 알린다(guideOpened·guideClosed) — 소리 판단은 여기 한 곳.
 *   · ⛔ 마이크(getUserMedia)·AudioContext·speechSynthesis 0. ⛔ data-ko/data-en 0 — 언어는 그릴 때 고른다.
 *   · 이 파일이나 css/ai-dubbing-guide.css 를 고치면 ai-dubbing.html 의 ?v= 를 올린다.
 *     음원을 다시 만들면 AUDIO_V 를 올리고 OFFSETS 를 함께 바꾼다(하니스가 파일 길이와 대조한다).
 * ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var AUDIO_V = '2';
  /* 장면 시작 시각(초) — 11장면(인트로 … 아웃트로). 장면 사이 0.8초 틈
     v2(2026-10-27): 알아듣기 힘든 말 다시 녹음 + 배경음악 — tools/dubbing-guide-audio/build_guide.py 가 찍어 준 값 */
  var OFFSETS = {
    ko: [0, 10.12, 24.32, 37.4, 52.07, 70.54, 88.84, 103.17, 113.87, 130.88, 141.08],
    en: [0, 10.73, 24.82, 39.26, 52, 68.26, 87.21, 99.54, 111.96, 126.8, 135.44]
  };
  /* 누르면 안내 소리를 먼저 끄는 버튼 — 녹음 시작(#dub-start·#dub-all) · 감상 시작(‘👀 보기’·이어 보기 둘).
     감상은 숨은 소리 요소부터 깨우고 영상은 받은 «뒤» 에 틀어서, 영상 재생만 기다리면 몇 초 겹친다 */
  var STOP_ON = '#dub-start, #dub-all, button[data-watch], #dub-w-film, #dub-w-all';
  var FAIL_MS = 4000;                     // «못 틀었어요» 를 보여 주는 시간

  /* ── 판정(순수 함수) ─────────────────────────────────────────────────── */
  /** t 초가 몇 번째 장면(0부터)인가 — 경계 0.05초 앞부터 다음 장면으로 본다 */
  function sceneAt(offs, t) {
    var n = 0, x = Number(t) || 0;
    for (var i = 1; i < offs.length; i++) if (x + 0.05 >= offs[i]) n = i;
    return n;
  }
  function audioUrl(lang) { return '/audio/dubbing-guide/guide-' + (lang === 'en' ? 'en' : 'ko') + '.mp3?v=' + AUDIO_V; }

  var api = { sceneAt: sceneAt, audioUrl: audioUrl, OFFSETS: OFFSETS, AUDIO_V: AUDIO_V, STOP_ON: STOP_ON };
  root.MangoiDubVoice = api;
  if (typeof document === 'undefined' || !document.getElementById) return;   // 하니스(vm)에서는 판정만 쓴다

  function isEn() { try { return !!(root.getLang && root.getLang() === 'en'); } catch (e) { return false; } }
  function T(pair) { return isEn() ? pair[1] : pair[0]; }
  var UI = {
    listen: ['🔊 소리로 듣기', '🔊 Listen'],
    off: ['■ 소리 끄기', '■ Sound off'],
    loading: ['⏳ 소리 준비 중…', '⏳ Loading sound…'],
    failed: ['⚠️ 소리를 못 틀었어요 · 다시 누르기', '⚠️ Couldn’t play · Tap again'],
    now: ['🔊 음성 안내 중', '🔊 Voice guide'],
    barOff: ['■ 끄기', '■ Turn off'],
    region: ['음성 안내', 'Voice guide']
  };

  var audio = null, curUrl = '', lang = 'ko', state = 'idle';   // state: idle | loading | playing
  var run = 0, failedAt = 0, lastScene = -1, buttons = [], bar = null, barText = null, barBtn = null;

  function guideShown() {
    try { return !!(root.MangoiDubGuide && root.MangoiDubGuide.isOpen && root.MangoiDubGuide.isOpen()); } catch (e) { return false; }
  }
  function now() { return audio ? Number(audio.currentTime) || 0 : 0; }

  function ensureAudio() {
    if (audio) return audio;
    audio = document.createElement('audio');   // 문서에 붙이지 않는다 — 화면의 «다른 소리» 감시에 자기가 걸리지 않게
    audio.preload = 'none';
    audio.addEventListener('playing', function () { if (state !== 'idle') { state = 'playing'; render(); } });
    audio.addEventListener('timeupdate', function () {
      if (state === 'idle') return;
      var n = sceneAt(OFFSETS[lang], now());
      if (n !== lastScene) { lastScene = n; drawBar(); }
    });
    audio.addEventListener('ended', function () { stop('ended'); });
    audio.addEventListener('error', function () { fail(run); });
    return audio;
  }

  /** at 초부터 지금 언어로 튼다(사람이 누른 클릭 안에서 불려야 브라우저가 허락한다) */
  function begin(at) {
    var a = ensureAudio(), my = ++run;
    lang = isEn() ? 'en' : 'ko';
    state = 'loading'; failedAt = 0; lastScene = -1;
    var url = audioUrl(lang);
    if (curUrl !== url) { curUrl = url; a.src = url; }
    if (at > 0 && !(a.readyState >= 1)) {
      /* 아직 길이를 모르면 받은 뒤에 그 자리로 옮긴다 */
      var seek = function () { a.removeEventListener('loadedmetadata', seek); if (my === run) { try { a.currentTime = at; } catch (e) {} } };
      a.addEventListener('loadedmetadata', seek);
    } else { try { a.currentTime = at > 0 ? at : 0; } catch (e) {} }
    render();
    var p;
    try { p = a.play(); } catch (e) { fail(my); return; }
    if (p && typeof p.then === 'function') {
      p.then(function () { if (my === run && state === 'loading') { state = 'playing'; render(); } }, function () { fail(my); });
    }
  }
  /* 멈추기만(상태·자리) — stop·fail·언어 바꾸기가 같이 쓴다. run 을 올려 늦게 온 응답을 버린다 */
  function halt() {
    run++; state = 'idle'; lastScene = -1;
    if (audio) { try { audio.pause(); } catch (e) {} }
  }
  /** 이미 멈춘 뒤 늦게 온 실패(끄기를 눌러 생긴 AbortError 등)는 «못 틀었어요» 로 말하지 않는다 */
  function fail(my) {
    if (my !== run || state === 'idle') return;
    halt();
    failedAt = Date.now();
    render();
    setTimeout(render, FAIL_MS + 50);
  }
  function start() { if (state === 'idle') begin(0); render(); }
  function stop(why) {   // 다시 누르면 begin(0) 이 처음 자리로 돌린다
    var was = state !== 'idle';
    halt();
    failedAt = 0;
    render();
    return was;
  }
  function toggle() { if (state === 'idle') start(); else stop('button'); }

  /* ── 그리기 ──────────────────────────────────────────────────────────── */
  function render() {
    var failed = failedAt && Date.now() - failedAt < FAIL_MS;
    var label = state === 'loading' ? UI.loading : state === 'playing' ? UI.off : failed ? UI.failed : UI.listen;
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].textContent = T(label);
      buttons[i].className = 'dg-voice' + (state !== 'idle' ? ' dgv-on' : '');
    }
    drawBar();
  }
  function buildBar() {
    bar = document.createElement('div'); bar.className = 'dgv-bar'; bar.id = 'dub-voice-bar';
    bar.setAttribute('role', 'region'); bar.hidden = true;
    barText = document.createElement('span'); barText.className = 'dgv-now';
    barBtn = document.createElement('button'); barBtn.type = 'button'; barBtn.className = 'dgv-off';
    barBtn.addEventListener('click', function () {
      stop('bar');
      /* 막대가 사라지면 포커스가 갈 곳이 없다 — 다시 열 수 있는 ‘❓ 사용방법’ 으로 */
      var back = document.getElementById('dub-guide-open');
      if (back) { try { back.focus({ preventScroll: true }); } catch (e) { try { back.focus(); } catch (_) {} } }
    });
    bar.appendChild(barText); bar.appendChild(barBtn);
    document.body.appendChild(bar);
  }
  /* 아래 막대 — 소리가 나는데 안내창이 닫혀 있을 때만(창이 열려 있으면 창 안 버튼이 끄기다) */
  function drawBar() {
    var show = state !== 'idle' && !guideShown();
    if (!show) { if (bar) bar.hidden = true; return; }
    if (!bar) buildBar();
    var offs = OFFSETS[lang];
    barText.textContent = T(UI.now) + ' · ' + (sceneAt(offs, now()) + 1) + '/' + offs.length;
    barBtn.textContent = T(UI.barOff);
    bar.setAttribute('aria-label', T(UI.region));
    bar.hidden = false;
  }

  /* ── 안내창이 부르는 곳 ──────────────────────────────────────────────── */
  /** 안내창 안에 ‘🔊 소리로 듣기’ 버튼을 단다 */
  api.mount = function (container) {
    if (!container || typeof container.appendChild !== 'function') return null;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'dg-voice';
    b.addEventListener('click', toggle);
    container.appendChild(b); buttons.push(b);
    render();
    return b;
  };
  /** byUser = 사람이 ‘❓ 사용방법’으로 열었다(클릭 안) → 바로 소리. 저절로 열렸으면 소리 0 */
  api.guideOpened = function (byUser) { if (byUser) start(); else render(); };
  /** why = 'start'(시작하기)면 이어 듣기, 그 밖(✕·Esc·오늘 숨김)은 끈다 */
  api.guideClosed = function (why) { if (why !== 'start') stop('close'); else render(); };
  api.start = start;
  api.stop = function () { return stop('api'); };
  api.isPlaying = function () { return state !== 'idle'; };
  api.state = function () { return state; };

  /* 다른 영상·소리(문서 안의 video·audio)가 재생되면 끈다 — 미디어 이벤트는 거품이 없어 «잡기 단계» 로 듣는다 */
  document.addEventListener('play', function (e) { if (state !== 'idle' && e.target !== audio) stop('media'); }, true);
  /* 녹음 시작 — 영상보다 먼저 마이크를 연다. 누르는 순간 끈다 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (state !== 'idle' && t && typeof t.closest === 'function' && t.closest(STOP_ON)) stop('record');
  }, true);
  root.addEventListener('pagehide', function () { stop('leave'); });

  function relang() {
    var next = isEn() ? 'en' : 'ko';
    if (state !== 'idle' && next !== lang && audio) {
      var n = sceneAt(OFFSETS[lang], now());
      halt();
      begin(OFFSETS[next][n]);   // 그 장면 처음부터 다른 언어로
      return;
    }
    render();
  }
  root.addEventListener('mangoi:lang-changed', relang);
  document.addEventListener('mangoi:lang-changed', relang);
})(typeof window !== 'undefined' ? window : this);
