/* 🎬 A.i영화더빙 — 화면·재생·녹음·채점·완성영상
 * ─────────────────────────────────────────────────────────────────────────────
 * 판정(대사 배정·음소거·시각 검사·녹음 길이)은 js/ai-dubbing-core.js(MangoiDubCore) 한 곳. 여기는 «부르기만».
 * 연동 규격: docs/A.i영화더빙_화면연동_설명서.md
 *
 * 두 가지 재생 방식(장면마다 core 가 정한다):
 *   · turn(차례) — 대사 시각을 아직 믿을 수 없을 때. 영상은 소리 없이 배경으로 돌고 대사가 차례로 나온다.
 *                  원어민 차례 = 음성 파일 또는 TTS, 학생 차례 = 마이크가 열리고 말이 끝나면 다음.
 *   · synced(동기) — ChatGPT 가 영상에 맞춘 시각 + 캐릭터별 음성 파일을 주면. 영상·BGM·캐릭터 음성이
 *                  함께 흐르고, 학생이 고른 캐릭터의 음성만 0 으로 끈다(그 구간에 마이크를 연다).
 *
 * ⚠️ 원본 영상 소리는 기본으로 끈다 — AI 영상 생성기가 넣은 의미 없는 목소리 조각이 섞여 있다.
 * ⚠️ 채점 순서는 speech-coach.html 과 같다: 전사(Whisper) → Azure 음소평가(브라우저 SDK) → /api/voice/coach.
 *    ⛔ /api/voice/transcribe 에 prompt(정답 문장)를 보내지 말 것 — 2026-07-29 «전부 100점» 사고.
 * ⚠️ 완성 영상은 이 기기에만 만든다(서버 저장 API 는 아직 없다 — 새 API 는 src/index.ts 승인이 필요).
 */
(function () {
  'use strict';
  var C = window.MangoiDubCore;
  if (!C) return;

  var $ = function (id) { return document.getElementById(id); };
  var EP_ID_RE = /^[a-z0-9-]{1,40}$/;
  var CAST_KEY = 'mangoi_dub_cast_v1';
  var SPEECH_RMS = 0.03;           // 이보다 크면 «말하고 있다»
  var SILENCE_STOP_MS = 1300;      // 말한 뒤 이만큼 조용하면 그 대사는 끝난 것으로 본다

  var S = {
    ep: null, problems: [],
    cast: [],          // [{ name, character }] — 0번은 로그인 계정 주인(있으면)
    run: null,         // 지금 도는 더빙 한 판
    results: [],       // [{ key, sceneNo, line, studentIdx, status, spoken, score, tier, words, err }]
    movies: [],        // [{ title, url, mime, size }]
  };
  window.__dub = { S: S };   // 브라우저 검사용(개인정보 없음)

  /* ── 글자 ─────────────────────────────────────────────────────────────── */
  function isEn() { try { return !!(window.getLang && window.getLang() === 'en'); } catch (e) { return false; } }
  function T(ko, en) { return isEn() ? en : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 🌐 를 눌러도 따라오게 data-ko/data-en 을 함께 단다(글자만 담은 span 에만 — 그릇에 달면 내용이 지워진다) */
  function L(ko, en) { return '<span data-ko="' + esc(ko) + '" data-en="' + esc(en) + '">' + esc(T(ko, en)) + '</span>'; }
  function charName(cid) { var c = S.ep && S.ep.characters[cid]; return c ? T(c.name.ko, c.name.en) : cid; }
  function charL(cid) { var c = S.ep && S.ep.characters[cid]; return c ? L(c.name.ko, c.name.en) : esc(cid); }
  function studentName(i) {
    var c = S.cast[i];
    return (c && c.name) ? c.name : T('학생 ' + (i + 1), 'Student ' + (i + 1));
  }

  /* ── 로그인 계정 (speech-coach.html mgAcctUid/mgAcctName 과 같은 규칙) ── */
  function acctUid() {
    try { var a = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null'); if (a && (a.uid || a.user_id || a.id)) return a.uid || a.user_id || a.id; } catch (e) {}
    try { var u = JSON.parse(localStorage.getItem('mango_user') || 'null'); if (u && (u.user_id || u.uid || u.id)) return u.user_id || u.uid || u.id; } catch (e) {}
    return null;
  }
  function acctName() {
    var nm = '';
    try { var a = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null'); if (a && (a.name || a.user_name)) nm = a.name || a.user_name; } catch (e) {}
    if (!nm) { try { var u = JSON.parse(localStorage.getItem('mango_user') || 'null'); if (u && (u.name || u.user_name)) nm = u.name || u.user_name; } catch (e) {} }
    return (nm && String(nm) !== String(acctUid() || '')) ? nm : '';   // ⛔ 이름 == 아이디면 안 보낸다(서버에서 진짜 이름을 덮는다)
  }
  function acctToken() { try { return localStorage.getItem('mango_token') || ''; } catch (e) { return ''; } }

  function sleep(ms, run) {
    return new Promise(function (res) {
      var t = setTimeout(res, ms);
      if (run) run.wakers.push(function () { clearTimeout(t); res(); });
    });
  }

  /* ── 매니페스트 ─────────────────────────────────────────────────────────── */
  function episodeId() {
    var m = /[?&]ep=([^&#]+)/.exec(location.search);
    var id = m ? decodeURIComponent(m[1]) : 'dub-001';
    return EP_ID_RE.test(id) ? id : 'dub-001';
  }
  function loadEpisode() {
    return fetch('/data/dubbing/' + episodeId() + '.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then(function (raw) {
        var res = C.normalizeEpisode(raw);
        S.problems = res.problems;
        if (res.problems.length) console.warn('[ai-dubbing] 매니페스트 문제', res.problems);
        if (!res.ok) throw new Error('manifest_unplayable');
        S.ep = res.episode;
      });
  }

  /* ── 학생 명단 ─────────────────────────────────────────────────────────── */
  function defaultCast(n) {
    var p = S.ep.playable, out = [];
    for (var i = 0; i < n; i++) out.push({ name: '', character: p[i % p.length] });
    return out;
  }
  function loadCast() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(CAST_KEY + ':' + S.ep.id) || 'null'); } catch (e) {}
    var ok = Array.isArray(saved) && saved.length && !C.castProblems(saved, S.ep).length;
    S.cast = ok ? saved.map(function (c) { return { name: String(c.name || '').slice(0, 12), character: c.character }; }) : defaultCast(1);
    var me = acctName();
    if (me && !S.cast[0].name) S.cast[0].name = String(me).slice(0, 12);
  }
  function saveCast() { try { localStorage.setItem(CAST_KEY + ':' + S.ep.id, JSON.stringify(S.cast)); } catch (e) {} }

  function renderCast() {
    var box = $('dub-cast');
    if (!box || !S.ep) return;
    var meIdx = acctUid() ? 0 : -1;
    var h = '<div class="cnts">' + L('몇 명이 하나요?', 'How many students?');
    for (var n = 1; n <= C.MAX_STUDENTS; n++) {
      h += ' <button type="button" class="cnt" data-n="' + n + '" aria-pressed="' + (S.cast.length === n) + '">' + n + '</button>';
    }
    h += '</div>';
    S.cast.forEach(function (c, i) {
      h += '<div class="stu"><span class="stu-no">' + (i + 1) + '</span>'
        + '<input class="stu-name" data-i="' + i + '" maxlength="12" value="' + esc(c.name) + '" placeholder="' + esc(T('학생 ' + (i + 1), 'Student ' + (i + 1))) + '" aria-label="' + esc(T('학생 ' + (i + 1) + ' 이름', 'Student ' + (i + 1) + ' name')) + '">'
        + (i === meIdx ? '<span class="stu-me">' + L('내 계정', 'my account') + '</span>' : '')
        + '<div class="chips">';
      S.ep.playable.forEach(function (cid) {
        var ch = S.ep.characters[cid];
        h += '<button type="button" class="chip" data-i="' + i + '" data-c="' + esc(cid) + '" aria-pressed="' + (c.character === cid) + '">'
          + esc(ch.emoji) + ' ' + charL(cid) + '</button>';
      });
      h += '</div></div>';
    });
    var muted = C.mutedCharacters(S.cast);
    var mutedL = [], nativeL = [];
    Object.keys(S.ep.characters).forEach(function (cid) {
      var speaks = S.ep.scenes.some(function (sc) { return sc.lines.some(function (l) { return l.speaker === cid; }); });
      if (!speaks) return;
      (muted[cid] ? mutedL : nativeL).push(esc(S.ep.characters[cid].emoji) + ' ' + charL(cid));
    });
    h += '<div class="mutesum">🔇 ' + L('학생이 말해요(원어민 목소리 끔):', 'Students speak (native voice off):') + ' <b>' + (mutedL.join(', ') || '—') + '</b>'
      + '<br>🔊 ' + L('원어민이 말해요:', 'Native voice:') + ' <b>' + (nativeL.join(', ') || '—') + '</b></div>';
    box.innerHTML = h;
  }

  function onCastClick(e) {
    if (S.run) return;
    var b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('cnt')) {
      var n = Number(b.getAttribute('data-n'));
      var next = defaultCast(n);
      for (var i = 0; i < Math.min(n, S.cast.length); i++) next[i] = S.cast[i];
      S.cast = next;
    } else if (b.classList.contains('chip')) {
      var idx = Number(b.getAttribute('data-i')), cid = b.getAttribute('data-c');
      if (S.cast[idx] && S.ep.playable.indexOf(cid) >= 0) S.cast[idx].character = cid;
    } else return;
    saveCast(); renderCast();
  }
  function onCastInput(e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('stu-name')) return;
    var i = Number(el.getAttribute('data-i'));
    if (S.cast[i]) { S.cast[i].name = String(el.value || '').slice(0, 12); saveCast(); }
  }

  /* ── 장면 목록 ─────────────────────────────────────────────────────────── */
  function renderScenes() {
    var box = $('dub-scenes');
    if (!box || !S.ep) return;
    var h = '';
    S.ep.scenes.forEach(function (sc, i) {
      var who = {};
      sc.lines.forEach(function (l) { who[l.speaker] = true; });
      var emo = Object.keys(who).map(function (cid) { return S.ep.characters[cid].emoji; }).join('');
      var playable = !!(sc.video && sc.lines.length);
      h += '<div class="scene">'
        + '<div class="thumb' + (playable ? ' on' : '') + '">' + (playable ? esc(emo) : L('영상 준비 중', 'Video coming')) + '</div>'
        + '<span class="tag s' + ((i % 6) + 1) + '">' + L(sc.no + '. ' + sc.label.ko, sc.no + '. ' + sc.label.en) + '</span>'
        + '<span class="meta">' + L('대사 ' + sc.lines.length + '줄', sc.lines.length + ' lines') + ' · '
        + (sc.timing === 'synced' ? L('영상에 맞춰 진행', 'synced to video') : L('차례대로 진행', 'turn by turn')) + '</span>'
        + '<button type="button" class="btn go" data-scene="' + i + '"' + (playable ? '' : ' disabled') + '>' + L('▶ 이 장면 더빙', '▶ Dub this scene') + '</button>'
        + '</div>';
    });
    box.innerHTML = h;
  }

  function renderStatus() {
    var el = $('dub-status');
    if (!el || !S.ep) return;
    var ep = S.ep;
    var anyTts = ep.scenes.some(function (s) { return s.voiceMode === 'tts'; });
    var h = '<b>' + L(ep.title.ko, ep.title.en) + '</b>';
    if (ep.status !== 'final') {
      h += ' · ' + (ep.note.ko ? L(ep.note.ko, ep.note.en)
        : L('미리보기예요', 'Preview'));
    } else if (anyTts) {
      h += ' · ' + L('일부 장면은 임시 AI 음성으로 나와요.', 'Some scenes use temporary AI voices.');
    }
    el.className = 'notice';
    el.innerHTML = h;
  }
  function renderLoadError() {
    var el = $('dub-status');
    if (!el) return;
    el.className = 'notice err';
    el.innerHTML = '<b>' + L('더빙 이야기를 불러오지 못했어요', 'Could not load the dubbing story') + '</b> · '
      + L('잠시 뒤 새로고침해 주세요.', 'Please reload in a moment.');
  }

  /* ── 소리 엔진 ─────────────────────────────────────────────────────────────
   * 하나의 AudioContext 에 모은다: 원어민 음성·BGM → 스피커 + 완성영상, 마이크 → 완성영상(스피커 X — 되울림 방지) */
  var MIX = null;
  function ensureMix() {
    if (MIX) { try { MIX.ctx.resume(); } catch (e) {} return MIX; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      var ctx = new AC();
      var out = ctx.createGain(); out.connect(ctx.destination);
      var rec = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
      MIX = { ctx: ctx, out: out, rec: rec };
      try { ctx.resume(); } catch (e) {}
      return MIX;
    } catch (e) { return null; }
  }
  /* 미디어 요소를 섞개에 잇는다. 끊으려면 돌려준 함수를 부른다. */
  function routeEl(el, gainVal) {
    if (!MIX) return { gain: null, cut: function () {} };
    try {
      var src = MIX.ctx.createMediaElementSource(el);
      var g = MIX.ctx.createGain(); g.gain.value = gainVal == null ? 1 : gainVal;
      src.connect(g); g.connect(MIX.out); if (MIX.rec) g.connect(MIX.rec);
      return { gain: g, cut: function () { try { src.disconnect(); g.disconnect(); } catch (e) {} } };
    } catch (e) { return { gain: null, cut: function () {} }; }
  }

  /* 원어민 대사 TTS — 서버 /api/voice/tts(영어 화자 지정). 같은 문장은 다시 받지 않는다. */
  var TTS_CACHE = {};
  function fetchTtsOnce(text, speaker) {
    return fetch('/api/voice/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, lang: 'en', speaker: speaker }),
    }).then(function (r) {
      if (!r.ok) throw new Error('tts_http_' + r.status);
      var got = (r.headers.get('X-TTS-Speaker') || '').toLowerCase();
      return r.blob().then(function (b) {
        if (!b || b.size < 200) throw new Error('tts_empty');
        return { url: URL.createObjectURL(b), sameVoice: !got || got === speaker };
      });
    });
  }
  function getTts(text, speaker) {
    var key = speaker + '|' + text;
    if (TTS_CACHE[key]) return Promise.resolve(TTS_CACHE[key]);
    return fetchTtsOnce(text, speaker)
      .catch(function () { return new Promise(function (r) { setTimeout(r, 400); }).then(function () { return fetchTtsOnce(text, speaker); }); })
      .then(function (res) {
        if (res.sameVoice) TTS_CACHE[key] = res.url;   // ⛔ 다른 화자로 대체된 음성은 캐시하지 않는다(그 문장이 굳는다)
        return res.url;
      })
      .catch(function () { return null; });
  }
  /* 미리 받아 두기 — 장면을 시작하면 그 장면 원어민 대사를 뒤에서 받아 둔다(차례 사이 멈춤을 줄인다) */
  function prefetchScene(sc) {
    var muted = C.mutedCharacters(S.cast);
    sc.lines.forEach(function (l) { if (!muted[l.speaker]) getTts(l.en, C.ttsSpeakerFor(S.ep, l.speaker)); });
  }

  function playUrl(run, url, maxMs) {
    return new Promise(function (resolve) {
      var a = new Audio();
      a.preload = 'auto';
      a.src = url;
      var route = routeEl(a, 1);
      var done = false;
      function fin() { if (done) return; done = true; clearTimeout(t); try { a.pause(); } catch (e) {} route.cut(); resolve(); }
      var t = setTimeout(fin, maxMs);
      a.onended = fin; a.onerror = fin;
      run.wakers.push(fin);
      var p = a.play(); if (p && p.catch) p.catch(fin);
    });
  }
  /* TTS 를 못 받았을 때 마지막 폴백 — 기기 목소리(완성 영상에는 안 담긴다) */
  function speakDevice(run, text, maxMs) {
    return new Promise(function (resolve) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { setTimeout(resolve, 600); return; }
      var done = false;
      function fin() { if (done) return; done = true; clearTimeout(t); try { speechSynthesis.cancel(); } catch (e) {} resolve(); }
      var t = setTimeout(fin, maxMs);
      run.wakers.push(fin);
      try {
        var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 0.95;
        u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
        run.deviceVoiceUsed = true;
      } catch (e) { fin(); }
    });
  }
  function speakNative(run, line) {
    var words = line.en.split(/\s+/).length;
    var maxMs = Math.max(4000, words * 700 + 3000);
    return getTts(line.en, C.ttsSpeakerFor(S.ep, line.speaker)).then(function (url) {
      if (run.aborted) return;
      return url ? playUrl(run, url, maxMs) : speakDevice(run, line.en, maxMs);
    });
  }

  /* ── 마이크 ────────────────────────────────────────────────────────────── */
  function openMic(run) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('no_mic_api'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (stream) {
        var mic = { stream: stream, analyser: null, gain: null, src: null, buf: null };
        if (MIX) {
          try {
            mic.src = MIX.ctx.createMediaStreamSource(stream);
            mic.analyser = MIX.ctx.createAnalyser(); mic.analyser.fftSize = 1024;
            mic.buf = new Float32Array(mic.analyser.fftSize);
            mic.src.connect(mic.analyser);
            mic.gain = MIX.ctx.createGain(); mic.gain.gain.value = 0;     // 학생 차례에만 완성영상으로 연다
            mic.src.connect(mic.gain); if (MIX.rec) mic.gain.connect(MIX.rec);  // ⛔ 스피커로는 안 보낸다(되울림)
          } catch (e) {}
        }
        run.mic = mic;
        return mic;
      });
  }
  function micLevel(mic) {
    if (!mic || !mic.analyser) return 0;
    try {
      if (mic.analyser.getFloatTimeDomainData) mic.analyser.getFloatTimeDomainData(mic.buf);
      var s = 0; for (var i = 0; i < mic.buf.length; i++) s += mic.buf[i] * mic.buf[i];
      return Math.sqrt(s / mic.buf.length);
    } catch (e) { return 0; }
  }
  function closeMic(mic) {
    if (!mic) return;
    try { mic.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { mic.src && mic.src.disconnect(); mic.gain && mic.gain.disconnect(); } catch (e) {}
  }

  /* 한 대사 녹음 — WAV(16k mono, Azure 용) 우선, 없으면 MediaRecorder(webm, 전사만).
   * 돌려주는 handle.stop() → Promise<{ blob, heard, sec }> */
  function startCapture(run) {
    var mic = run.mic;
    var wav = (window.SpeechAzure && window.SpeechAzure.createRecorder) ? window.SpeechAzure.createRecorder() : null;
    var wavOk = !!(wav && wav.start(mic.stream));
    var mr = null, chunks = [];
    if (!wavOk && window.MediaRecorder) {
      try { mr = new MediaRecorder(mic.stream); mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); }; mr.start(); } catch (e) { mr = null; }
    }
    if (mic.gain) mic.gain.gain.value = 1;
    var h = { t0: Date.now(), heard: false, lastLoud: 0, stopped: false, meterTimer: null };
    (function tick() {
      if (h.stopped) return;
      var lv = micLevel(mic);
      if (lv > SPEECH_RMS) { h.heard = true; h.lastLoud = Date.now(); }
      var m = $('dub-meter'); if (m) m.style.width = Math.min(100, Math.round(lv * 900)) + '%';
      h.meterTimer = setTimeout(tick, 50);
    })();
    h.stop = function () {
      if (h.stopped) return Promise.resolve({ blob: null, heard: h.heard, sec: 0 });
      h.stopped = true; clearTimeout(h.meterTimer);
      if (mic.gain) mic.gain.gain.value = 0;
      var m = $('dub-meter'); if (m) m.style.width = '0%';
      var sec = (Date.now() - h.t0) / 1000;
      if (wavOk) return Promise.resolve({ blob: wav.stopToWav(), heard: h.heard, sec: sec });
      if (!mr) return Promise.resolve({ blob: null, heard: h.heard, sec: sec });
      return new Promise(function (res) {
        mr.onstop = function () { res({ blob: chunks.length ? new Blob(chunks, { type: chunks[0].type || 'audio/webm' }) : null, heard: h.heard, sec: sec }); };
        try { mr.stop(); } catch (e) { res({ blob: null, heard: h.heard, sec: sec }); }
      });
    };
    return h;
  }

  /* ── 채점 (한 줄씩, 뒤에서 차례로 — Azure 를 동시에 여러 번 부르지 않는다) ── */
  var QUEUE = [], QBUSY = false;
  function enqueueScore(res, blob) { QUEUE.push({ res: res, blob: blob }); pump(); }
  function pump() {
    if (QBUSY) return;
    var job = QUEUE.shift();
    if (!job) return;
    QBUSY = true;
    scoreOne(job.res, job.blob)
      .catch(function (e) { job.res.status = 'error'; job.res.err = String((e && e.message) || e).slice(0, 80); })
      .then(function () { QBUSY = false; renderResults(); pump(); });
  }
  function scoreOne(res, blob) {
    res.status = 'scoring'; renderResults();
    var target = res.line.en;
    var isWav = String(blob.type || '').indexOf('wav') >= 0;
    var trimP = (isWav && window.SpeechAzure && SpeechAzure.trimWav) ? SpeechAzure.trimWav(blob).catch(function () { return { blob: blob }; }) : Promise.resolve({ blob: blob });
    return trimP.then(function (t) {
      var audio = t.blob || blob;
      var fd = new FormData();
      fd.append('audio', audio, isWav ? 'rec.wav' : 'rec.webm');
      fd.append('lang', 'en');                         // ⛔ prompt 는 보내지 않는다
      return fetch('/api/voice/transcribe', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (tr) {
          if (!tr || !tr.ok) throw new Error('transcribe_' + ((tr && tr.error) || 'fail'));
          var azP = (isWav && window.SpeechAzure && SpeechAzure.assess)
            ? SpeechAzure.assess({ wavBlob: audio, reference: target, locale: 'en-US', rawSeconds: t.rawSec })
            : Promise.resolve({ ok: false, reason: isWav ? 'svc_missing' : 'not_wav' });
          return azP.then(function (az) { return { tr: tr, az: (az && az.ok) ? az : null, azReason: az && az.reason }; });
        })
        .then(function (o) {
          var spoken = (o.az && String(o.az.text || '').trim()) || String(o.tr.text || '').trim();
          res.spoken = spoken;
          if (!spoken) { res.status = 'no_speech'; return; }
          var mine = (res.studentIdx === 0 && !!acctUid());
          var payload = {
            target: target, spoken: spoken,
            student_uid: mine ? acctUid() : 'guest',
            student_name: mine ? (acctName() || undefined) : undefined,
            token: mine ? acctToken() : undefined,
            acoustic: (o.tr.segments || o.tr.transcription_info) ? { segments: o.tr.segments, transcription_info: o.tr.transcription_info } : null,
            azure: o.az,
            azure_diag: o.az ? 'ok(sdk)' : ('sdk:' + String(o.azReason || 'none')),
          };
          var post = function (p) {
            return fetch('/api/voice/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
              .then(function (r) { return r.json(); });
          };
          return post(payload).then(function (cd) {
            if (cd && !cd.ok && cd.error === 'auth_required') { payload.student_uid = 'guest'; payload.token = undefined; payload.student_name = undefined; return post(payload); }
            return cd;
          }).then(function (cd) {
            if (!cd || !cd.ok || !cd.scores) throw new Error('coach_' + ((cd && cd.error) || 'fail'));
            res.score = cd.scores; res.tier = cd.tier || null; res.feedback = cd.feedback || '';
            res.words = (o.az && o.az.words) ? o.az.words : null;
            res.status = 'done';
          });
        });
    });
  }

  /* ── 결과 화면 ─────────────────────────────────────────────────────────── */
  var STATUS_TXT = {
    queued: ['⏳ 채점 대기', '⏳ Waiting'], scoring: ['⏳ 채점 중', '⏳ Checking'],
    no_speech: ['🤫 소리가 안 들렸어요', '🤫 No voice heard'], skipped: ['⏭ 넘어감', '⏭ Skipped'],
    no_audio: ['⚠ 녹음 실패', '⚠ Recording failed'], error: ['⚠ 채점 실패', '⚠ Check failed'],
  };
  function renderResults() {
    var panel = $('dub-results');
    if (!panel) return;
    if (!S.results.length) { panel.hidden = true; return; }
    panel.hidden = false;
    var sum = C.summarize(S.results.map(function (r) { return { studentIdx: r.studentIdx, score: r.score, status: r.status }; }), S.cast);
    $('dub-sum').innerHTML = sum.filter(function (s) { return s.lines; }).map(function (s) {
      return '<div class="sumc"><b>' + esc(studentName(s.idx)) + '</b> · ' + charL(s.character)
        + '<div class="big">' + (s.avg == null ? '—' : s.avg) + '</div>'
        + L('말한 대사 ' + s.lines + '줄 · 채점 ' + s.scored + '줄', s.lines + ' lines · ' + s.scored + ' checked') + '</div>';
    }).join('');
    $('dub-lines').innerHTML = S.results.map(function (r) {
      var right;
      if (r.status === 'done' && r.score) {
        right = '<span class="sc">' + esc((r.tier && r.tier.emoji) || '') + ' ' + r.score.overall + '</span>';
      } else {
        var st = STATUS_TXT[r.status] || STATUS_TXT.queued;
        right = '<span class="sc">' + L(st[0], st[1]) + '</span>';
      }
      return '<div class="ln"><span class="who">' + esc(studentName(r.studentIdx)) + ' · ' + charL(r.line.speaker) + '</span>'
        + '<span><b>' + esc(r.line.en) + '</b>' + (r.spoken ? '<br><span class="said">🎤 ' + esc(r.spoken) + '</span>' : '') + '</span>'
        + right + '</div>';
    }).join('');
  }

  function renderMovies() {
    var panel = $('dub-movies-panel'), box = $('dub-movies'), fin = $('dub-final');
    if (!panel || !box) return;
    panel.hidden = !S.movies.length;
    box.innerHTML = S.movies.map(function (m, i) {
      var ext = /mp4/.test(m.mime) ? 'mp4' : 'webm';
      return '<div class="mv"><b>' + esc(m.title) + '</b>'
        + '<video controls playsinline preload="metadata" src="' + esc(m.url) + '"></video>'
        + '<a href="' + esc(m.url) + '" download="mangoi-' + esc(S.ep.id) + '-' + (i + 1) + '.' + ext + '">' + L('⬇ 저장', '⬇ Save') + '</a>'
        + (m.deviceVoice ? '<span class="hint">' + L('※ 일부 원어민 대사는 기기 목소리로 나와서 영상에 담기지 않았어요.', '※ Some native lines used the device voice and are not in the movie.') + '</span>' : '')
        + '</div>';
    }).join('');
    if (fin) {
      fin.disabled = !S.movies.length;
      fin.innerHTML = S.movies.length ? L('▶ 완성 영상 보기', '▶ Watch my movie')
        : L('▶ 완성 영상 보기 (더빙을 마치면 열려요)', '▶ Watch the finished movie (opens after you dub)');
    }
    /* 브라우저가 구운 webm 에는 «전체 길이» 가 안 적혀 있어 0:00 으로 보이고 구간 이동이 안 된다.
     * 끝으로 한 번 보내 길이를 재게 한 뒤 처음으로 되돌린다(널리 쓰는 우회). */
    Array.prototype.forEach.call(box.querySelectorAll('video'), function (v) {
      v.addEventListener('loadedmetadata', function () {
        if (v.duration !== Infinity && !isNaN(v.duration)) return;
        var back = function () { if (v.duration !== Infinity && !isNaN(v.duration)) { v.removeEventListener('durationchange', back); v.currentTime = 0; } };
        v.addEventListener('durationchange', back);
        try { v.currentTime = 1e7; } catch (e) {}
      }, { once: true });
    });
  }

  /* ── 완성 영상(이 기기) ────────────────────────────────────────────────────
   * 화면의 영상 + 자막을 캔버스에 그리고, 섞개(원어민 음성·BGM·마이크)를 소리로 붙여 MediaRecorder 로 굽는다. */
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    var list = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }
  function startMovie(run) {
    if (!MIX || !MIX.rec || !window.MediaRecorder) return null;
    var cv = document.createElement('canvas');
    cv.width = 960; cv.height = 540;
    if (!cv.captureStream) return null;
    var g = cv.getContext('2d');
    var probe = document.createElement('canvas'); probe.width = probe.height = 2;
    var pg = probe.getContext('2d');
    /* 영상 장면은 따로 붙잡아 둔다 — 장면을 넘어가며 영상을 새로 불러오는 동안 완성 영상이 «검은 화면» 이 되지 않게
     * (불러오는 사이에는 마지막 장면을 그대로 그린다) */
    var frame = document.createElement('canvas'); frame.width = cv.width; frame.height = cv.height;
    var fg = frame.getContext('2d');
    var mv = { cv: cv, chunks: [], tainted: false, checked: false, timer: null, rec: null, mime: pickMime(), hasFrame: false };
    function draw() {
      var v = $('dub-video');
      if (v && v.readyState >= 2 && v.videoWidth) {
        if (!mv.checked) {               // 다른 출처 영상이 캔버스를 «오염» 시키면 녹화가 죽는다 — 먼저 시험해 본다
          mv.checked = true;
          try { pg.drawImage(v, 0, 0, 2, 2); pg.getImageData(0, 0, 1, 1); } catch (e) { mv.tainted = true; }
        }
        if (!mv.tainted) {
          var r = Math.min(frame.width / v.videoWidth, frame.height / v.videoHeight);
          var w = v.videoWidth * r, hh = v.videoHeight * r;
          try {
            fg.fillStyle = '#000'; fg.fillRect(0, 0, frame.width, frame.height);
            fg.drawImage(v, (frame.width - w) / 2, (frame.height - hh) / 2, w, hh);
            mv.hasFrame = true;
          } catch (e) {}
        }
      }
      g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
      if (mv.hasFrame) g.drawImage(frame, 0, 0);
      var sub = run.sub;
      if (sub && sub.en) {
        g.fillStyle = 'rgba(5,8,14,.78)';
        g.fillRect(40, cv.height - 128, cv.width - 80, 104);
        g.textAlign = 'center';
        g.fillStyle = sub.student ? '#34d399' : '#f5b83d';
        g.font = 'bold 20px MangoiHanSC,"Noto Sans KR",sans-serif';
        g.fillText(sub.who || '', cv.width / 2, cv.height - 98);
        g.fillStyle = '#fff'; g.font = 'bold 30px MangoiHanSC,"Noto Sans KR",sans-serif';
        g.fillText(sub.en, cv.width / 2, cv.height - 62, cv.width - 110);
        if (sub.ko) { g.fillStyle = '#cbd5e1'; g.font = '18px MangoiHanSC,"Noto Sans KR",sans-serif'; g.fillText(sub.ko, cv.width / 2, cv.height - 34, cv.width - 110); }
      }
      g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.65)'; g.font = 'bold 16px MangoiHanSC,"Noto Sans KR",sans-serif';
      g.fillText('mangoi.ai', cv.width - 18, 28);
    }
    try {
      var stream = cv.captureStream(24);
      MIX.rec.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
      mv.rec = mv.mime ? new MediaRecorder(stream, { mimeType: mv.mime, videoBitsPerSecond: 1500000 }) : new MediaRecorder(stream);
      mv.rec.ondataavailable = function (e) { if (e.data && e.data.size) mv.chunks.push(e.data); };
      draw();
      mv.timer = setInterval(draw, 1000 / 24);    // 녹화하는 동안만 돈다(stopMovie 가 끈다)
      /* 첫 장면이 그려진 뒤에 녹화를 시작한다 — 안 그러면 완성 영상의 첫 화면(미리보기)이 검정이다.
       * 영상을 끝내 못 불러와도(4초) 소리라도 담기게 그때는 그냥 시작한다. */
      var t0 = Date.now();
      (function go() {
        if (!mv.rec || mv.rec.state !== 'inactive' || mv.stopped) return;
        if (mv.hasFrame || mv.tainted || Date.now() - t0 > 4000) { try { mv.rec.start(1000); } catch (e) {} return; }
        mv.startTimer = setTimeout(go, 100);
      })();
      return mv;
    } catch (e) { clearInterval(mv.timer); return null; }
  }
  function stopMovie(mv) {
    if (!mv) return Promise.resolve(null);
    clearInterval(mv.timer); clearTimeout(mv.startTimer); mv.stopped = true;
    if (!mv.rec || mv.rec.state === 'inactive') return Promise.resolve(null);
    return new Promise(function (res) {
      mv.rec.onstop = function () {
        if (!mv.chunks.length) { res(null); return; }
        var type = mv.rec.mimeType || mv.mime || 'video/webm';
        res(new Blob(mv.chunks, { type: type }));
      };
      try { mv.rec.stop(); } catch (e) { res(null); }
    });
  }

  /* ── 무대(화면 위 자막·차례 안내) ──────────────────────────────────────── */
  function showLine(run, line, performer) {
    var student = performer.type === 'student';
    var who = (S.ep.characters[line.speaker].emoji + ' ' + charName(line.speaker))
      + (student ? ' — 🎤 ' + studentName(performer.idx) : '');
    run.sub = { who: who, en: line.en, ko: line.ko, student: student };
    var box = $('dub-sub');
    box.hidden = false;
    box.classList.toggle('me', student);
    $('dub-sub-who').textContent = who;
    $('dub-sub-en').textContent = line.en;
    $('dub-sub-ko').textContent = line.ko || '';
  }
  function clearLine(run) { run.sub = null; var b = $('dub-sub'); if (b) b.hidden = true; }
  function setTurn(text) { var t = $('dub-turn'); if (!t) return; t.hidden = !text; t.textContent = text || ''; }
  function setNote(text) { var n = $('dub-stage-note'); if (!n) return; n.hidden = !text; n.textContent = text || ''; }
  function setProg(text) { var p = $('dub-prog'); if (p) p.textContent = text || ''; }
  function setButtons(mode) {   // mode: 'student' | 'native' | 'idle'
    $('dub-done').disabled = mode !== 'student';
    $('dub-skip').disabled = mode === 'idle';
  }

  function waitVideo(v, ms) {
    return new Promise(function (resolve) {
      if (v.readyState >= 2) { resolve(true); return; }
      var done = false;
      function fin(ok) { if (done) return; done = true; clearTimeout(t); v.removeEventListener('loadeddata', on); v.removeEventListener('error', off); resolve(ok); }
      function on() { fin(true); } function off() { fin(false); }
      var t = setTimeout(function () { fin(v.readyState >= 2); }, ms);
      v.addEventListener('loadeddata', on); v.addEventListener('error', off);
    });
  }

  /* 학생 한 줄(차례 모드) — 준비 신호 → 마이크 → 말이 끝나면(조용 1.3초)·최대 시간·«다 말했어요» 중 먼저 오는 것에서 끝 */
  function studentTurn(run, sc, it) {
    var idx = it.performer.idx;
    var res = { key: sc.no + ':' + it.line.id + ':' + Date.now(), sceneNo: sc.no, line: it.line, studentIdx: idx, status: 'queued' };
    setButtons('student');
    setTurn('🎤 ' + studentName(idx) + T(' 차례예요!', "'s turn!"));
    return sleep(700, run).then(function () {
      if (run.aborted) return;
      var cap = startCapture(run);
      var maxMs = C.recordWindowSec(it.line, 'turn') * 1000;
      var skipped = false;
      return new Promise(function (resolve) {
        var done = false;
        function fin() { if (done) return; done = true; clearTimeout(watch); resolve(); }
        var watch;
        (function check() {
          var now = Date.now();
          if (now - cap.t0 >= maxMs) { fin(); return; }
          if (cap.heard && now - cap.lastLoud >= SILENCE_STOP_MS) { fin(); return; }
          watch = setTimeout(check, 100);
        })();
        run.doneNow = fin;
        run.skipNow = function () { skipped = true; fin(); };
        run.wakers.push(fin);
      }).then(function () {
        run.doneNow = null; run.skipNow = null;
        return cap.stop();
      }).then(function (r) {
        setTurn('');
        if (run.aborted) return;
        S.results.push(res);
        if (skipped) { res.status = 'skipped'; }          // 넘어간 줄은 채점하지 않는다(녹음은 버림)
        else if (!r.blob) { res.status = 'no_audio'; }
        else if (!r.heard) { res.status = 'no_speech'; }
        else { res.status = 'queued'; enqueueScore(res, r.blob); }
        renderResults();
      });
    });
  }

  function playTurns(run, sc) {
    var items = C.assignLines(sc, S.cast, run.counters);
    var i = 0;
    function next() {
      if (run.aborted || i >= items.length) return Promise.resolve();
      var it = items[i++];
      setProg(T('장면 ' + sc.no + ' · ' + i + ' / ' + items.length + ' 줄', 'Scene ' + sc.no + ' · line ' + i + ' / ' + items.length));
      showLine(run, it.line, it.performer);
      var p;
      if (it.performer.type === 'student') p = studentTurn(run, sc, it);
      else {
        setButtons('native');
        run.skipNow = function () { run.wakers.splice(0).forEach(function (w) { try { w(); } catch (e) {} }); };
        p = speakNative(run, it.line).then(function () { run.skipNow = null; });
      }
      return p.then(function () { return sleep(350, run); }).then(next);
    }
    return next();
  }

  /* 동기 모드 — 영상·BGM·캐릭터 음성이 함께 흐르고, 학생 캐릭터 음성만 0. 학생 대사 구간에 마이크를 연다. */
  function playSynced(run, sc) {
    var v = $('dub-video');
    var items = C.assignLines(sc, S.cast, run.counters);
    var muted = C.mutedCharacters(S.cast);
    var tracks = [];
    function addTrack(url, kind, cid, gain) {
      var a = new Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; a.src = url;
      var route = routeEl(a, gain);
      if (!route.gain) a.muted = gain === 0;           // 섞개가 없으면 요소 음소거로라도 끈다
      tracks.push({ el: a, kind: kind, cid: cid, route: route, gain: gain });
    }
    if (sc.bgm) addTrack(sc.bgm, 'bgm', null, 1);
    Object.keys(sc.voices).forEach(function (cid) { addTrack(sc.voices[cid], 'voice', cid, muted[cid] ? 0 : 1); });
    run.tracks = tracks;
    return Promise.all(tracks.map(function (t) {
      return new Promise(function (r) {
        if (t.el.readyState >= 3) { r(); return; }
        var to = setTimeout(r, 8000);
        t.el.addEventListener('canplaythrough', function () { clearTimeout(to); r(); }, { once: true });
        t.el.addEventListener('error', function () { clearTimeout(to); r(); }, { once: true });
      });
    })).then(function () {
      if (run.aborted) return;
      try { v.currentTime = 0; } catch (e) {}
      tracks.forEach(function (t) { try { t.el.currentTime = 0; } catch (e) {} });
      var pv = v.play(); if (pv && pv.catch) pv.catch(function () {});
      tracks.forEach(function (t) { var p = t.el.play(); if (p && p.catch) p.catch(function () {}); });
      setButtons('native');
      return new Promise(function (resolve) {
        var caps = {}, shown = -2, ended = false;
        var limit = sc.durationSec || 0;
        var tick = setInterval(function () {
          if (run.aborted) { finish(); return; }
          var t = v.currentTime || 0;
          tracks.forEach(function (tr) { if (!tr.el.paused && Math.abs(tr.el.currentTime - t) > 0.3) { try { tr.el.currentTime = t; } catch (e) {} } });
          var li = C.lineIndexAt(sc.lines, t);
          if (li !== shown) {
            shown = li;
            if (li < 0) { clearLine(run); setTurn(''); }
            else { showLine(run, items[li].line, items[li].performer); setTurn(items[li].performer.type === 'student' ? '🎤 ' + studentName(items[li].performer.idx) : ''); }
          }
          items.forEach(function (it, k) {
            if (it.performer.type !== 'student') return;
            var l = it.line, cap = caps[k];
            if (!cap && t >= l.start - 0.25 && t < l.end) caps[k] = { h: startCapture(run), it: it };
            else if (cap && !cap.closed && t >= l.end + 0.9) closeCap(k);
          });
          if (v.ended || (limit && t >= limit - 0.05) || (!limit && v.duration && t >= v.duration - 0.05)) finish();
        }, 100);
        function closeCap(k) {
          var cap = caps[k]; cap.closed = true;
          var res = { key: sc.no + ':' + cap.it.line.id + ':' + Date.now(), sceneNo: sc.no, line: cap.it.line, studentIdx: cap.it.performer.idx, status: 'queued' };
          cap.h.stop().then(function (r) {
            if (run.aborted) return;
            S.results.push(res);
            if (!r.blob) res.status = 'no_audio'; else if (!r.heard) res.status = 'no_speech'; else enqueueScore(res, r.blob);
            renderResults();
          });
        }
        function finish() {
          if (ended) return; ended = true;
          clearInterval(tick);
          Object.keys(caps).forEach(function (k) { if (!caps[k].closed) closeCap(k); });
          tracks.forEach(function (tr) { try { tr.el.pause(); } catch (e) {} tr.route.cut(); });
          run.tracks = [];
          clearLine(run); setTurn('');
          resolve();
        }
        run.skipNow = function () { try { v.currentTime = Math.max(0, (v.duration || limit || 0) - 0.05); } catch (e) {} finish(); };
        run.wakers.push(finish);
      });
    });
  }

  /* 영상 자체 소리 — «clean»(대사 없는 깨끗한 소리)일 때만 켠다. 켤 때 섞개에 이어야 완성 영상에도 담긴다.
   * ⚠️ 미디어 요소는 섞개에 «한 번만» 이을 수 있어서, 이은 뒤에는 이득(gain)으로 켜고 끈다. */
  var VID_ROUTE = null;
  function setVideoAudio(v, clean) {
    v.muted = !clean;
    if (clean && !VID_ROUTE && MIX) VID_ROUTE = routeEl(v, 1);
    if (VID_ROUTE && VID_ROUTE.gain) VID_ROUTE.gain.gain.value = clean ? 1 : 0;
  }

  function playScene(run, sc) {
    var v = $('dub-video');
    setNote(''); clearLine(run); setTurn('');
    setProg(T('장면 ' + sc.no + ' 불러오는 중…', 'Loading scene ' + sc.no + '…'));
    if (sc.voiceMode === 'tts') prefetchScene(sc);
    setVideoAudio(v, sc.videoAudio === 'clean');
    v.loop = sc.timing !== 'synced';
    v.src = sc.video;
    try { v.load(); } catch (e) {}
    return waitVideo(v, 10000).then(function (ok) {
      if (run.aborted) return;
      if (!ok) setNote(T('영상을 불러오지 못했어요 — 대사만 진행해요', 'Could not load the video — lines only'));
      else if (S.ep.status !== 'final') setNote(T('미리보기 · 영상과 대사가 아직 안 맞아요', 'Preview · video and lines not matched yet'));
      if (sc.timing === 'synced') return playSynced(run, sc);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      return playTurns(run, sc);
    }).then(function () {
      try { v.pause(); } catch (e) {}
      clearLine(run); setTurn('');
    });
  }

  function setRunning(on) {
    $('dub-player').hidden = !on;                    // 결과·완성 영상은 따로 된 칸에 남는다
    Array.prototype.forEach.call(document.querySelectorAll('#dub-scenes button, #dub-all, #dub-cast button, #dub-cast input, #dub-make-movie'), function (b) { b.disabled = on; });
    $('dub-stop').disabled = !on;
    if (!on) { setButtons('idle'); setProg(''); }
  }

  function startRun(sceneIdxs) {
    if (S.run || !S.ep) return;
    var probs = C.castProblems(S.cast, S.ep);
    if (probs.length) { alert(T('학생마다 캐릭터를 골라 주세요.', 'Please pick a character for each student.')); return; }
    ensureMix();                                     // ⚠️ 클릭 안에서 만들어야 소리가 난다(자동재생 정책)
    var run = { aborted: false, counters: {}, wakers: [], sub: null, mic: null, movie: null, tracks: [], deviceVoiceUsed: false };
    S.run = run;
    setRunning(true);
    $('dub-player').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var title = sceneIdxs.length > 1
      ? T('처음부터 끝까지', 'Whole story')
      : T('장면 ' + S.ep.scenes[sceneIdxs[0]].no + ' · ' + S.ep.scenes[sceneIdxs[0]].label.ko, 'Scene ' + S.ep.scenes[sceneIdxs[0]].no + ' · ' + S.ep.scenes[sceneIdxs[0]].label.en);
    openMic(run).catch(function () {
      throw new Error('mic');
    }).then(function () {
      if ($('dub-make-movie') && $('dub-make-movie').checked) run.movie = startMovie(run);
      var k = 0;
      function nextScene() {
        if (run.aborted || k >= sceneIdxs.length) return Promise.resolve();
        var sc = S.ep.scenes[sceneIdxs[k++]];
        return playScene(run, sc).then(function () { return sleep(500, run); }).then(nextScene);
      }
      return nextScene();
    }).catch(function (e) {
      if (String(e && e.message) === 'mic') alert(T('마이크를 쓸 수 없어요. 브라우저에서 마이크를 허용해 주세요.', 'The microphone is not available. Please allow the microphone.'));
      else console.warn('[ai-dubbing] 재생 중 오류', e);
    }).then(function () {
      var mv = run.movie;
      closeMic(run.mic);
      return stopMovie(mv).then(function (blob) {
        if (blob && blob.size > 2000 && !run.aborted) {
          S.movies.push({ title: title, url: URL.createObjectURL(blob), mime: blob.type, size: blob.size, deviceVoice: run.deviceVoiceUsed });
          renderMovies();
        }
      });
    }).then(function () {
      S.run = null;
      setRunning(false);
      renderResults();
    });
  }
  function stopRun() {
    var run = S.run;
    if (!run) return;
    run.aborted = true;
    run.wakers.splice(0).forEach(function (w) { try { w(); } catch (e) {} });
    try { $('dub-video').pause(); } catch (e) {}
    try { speechSynthesis.cancel(); } catch (e) {}
  }

  /* ── 시작 ─────────────────────────────────────────────────────────────── */
  function wire() {
    var cast = $('dub-cast');
    cast.addEventListener('click', onCastClick);
    cast.addEventListener('input', onCastInput);
    $('dub-scenes').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-scene]');
      if (b && !b.disabled) startRun([Number(b.getAttribute('data-scene'))]);
    });
    $('dub-all').addEventListener('click', function () {
      var all = [];
      S.ep.scenes.forEach(function (sc, i) { if (sc.video && sc.lines.length) all.push(i); });
      if (all.length) startRun(all);
    });
    $('dub-done').addEventListener('click', function () { if (S.run && S.run.doneNow) S.run.doneNow(); });
    $('dub-skip').addEventListener('click', function () { if (S.run && S.run.skipNow) S.run.skipNow(); });
    $('dub-stop').addEventListener('click', stopRun);
    $('dub-final').addEventListener('click', function () { var p = $('dub-movies-panel'); if (p && !p.hidden) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    var redraw = function () { if (!S.ep) return; renderStatus(); if (!S.run) { renderCast(); renderScenes(); } renderResults(); renderMovies(); };
    window.addEventListener('mangoi:lang-changed', redraw);
    document.addEventListener('mangoi:lang-changed', redraw);
  }

  function boot() {
    loadEpisode().then(function () {
      loadCast();
      renderStatus(); renderCast(); renderScenes();
      $('dub-cast-panel').hidden = false;
      $('dub-all-row').hidden = false;
      wire();
    }).catch(function (e) {
      console.warn('[ai-dubbing] 불러오기 실패', e);
      renderLoadError();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
