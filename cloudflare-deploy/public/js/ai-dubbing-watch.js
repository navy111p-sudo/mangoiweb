/* 👀 A.i영화더빙 — «먼저 보기»(감상) 진행기
 * ─────────────────────────────────────────────────────────────────────────────
 * 더빙하기 전에 에피소드를 원어민 목소리 + 배경음악 + 효과음으로 «그대로» 본다(마이크·녹음·채점 없음).
 * 화면(js/ai-dubbing.js)이 재료(영상 요소·자막 그리기·TTS·섞개·소리 엔진)를 kit 으로 넘기고, 이 파일은 «순서» 만 정한다.
 *
 *   create(kit) → { start(items), stop(), pause(), resume(), togglePause(), next(), prev(), state() }
 *   items = [{ ep, scIdx, first }]   ep = MangoiDubCore.normalizeEpisode 결과 · first = 그 작품의 첫 장면(제목 카드 소리)
 *   kit.route(audio, kind) — kind 'voice' | 'bgm'. 화면이 섞개에 «녹화 갈래 없이» 잇는다(감상 소리는 완성 영상에 안 들어간다).
 *
 * 장면 두 가지(정본 core 가 정한 timing 그대로):
 *   · turn   — 영상은 배경으로 돌고, 대사를 차례로 원어민 목소리(TTS)로 들려준다. 효과음은 대사 앞뒤·장면 처음·끝.
 *   · synced — 영상·배경음악 파일·캐릭터 음성 파일이 함께 흐른다(아무도 음소거하지 않는다). 효과음은 영상 시각(timedCues).
 *
 * ⚠️ 멈춤은 «한 곳» 에서: 도는 소리·영상(run.media)·기다리는 타이머(run.timers)를 붙잡았다가 그 자리에서 이어 간다.
 *    새 소리를 틀기 직전마다 gate() 로 «멈춰 있나» 를 다시 본다(받는 사이에 멈추면 받은 뒤에도 안 튼다).
 * ⚠️ 이전·다음·그만은 run.jump / run.aborted 를 세우고 기다리던 것을 모두 깨운다(wake) — 장면은 매 단계 cut() 을 본다.
 * ⚠️ «봤어요» 는 장면이 «끝까지» 돌았을 때만 적는다(넘기거나 그만두면 안 적는다).
 * ⛔ 상주 타이머 없음 — 동기 장면의 박자 타이머는 그 장면 동안만 산다.
 */
(function (root) {
  'use strict';

  function drop(list, x) { var i = list.indexOf(x); if (i >= 0) list.splice(i, 1); }

  function create(kit) {
    var C = kit.C;
    var opt = kit.opt || {};
    var CARD_MS = opt.cardMs != null ? opt.cardMs : 2200;     // 에피소드 제목 카드
    var GAP_MS = opt.gapMs != null ? opt.gapMs : 350;         // 대사 사이
    var END_MS = opt.endMs != null ? opt.endMs : 900;         // 장면 끝 효과음이 울릴 시간
    var STALL_MS = opt.stallMs != null ? opt.stallMs : 6000;  // 동기 장면 시계가 이만큼 안 움직이면 넘어간다
    var TICK_MS = opt.tickMs != null ? opt.tickMs : 100;
    var VIDEO_MS = opt.videoMs != null ? opt.videoMs : 10000;
    var DUCK = opt.duck != null ? opt.duck : 0.35;            // 대사 동안 합성 음악 크기
    var now = kit.now || function () { return Date.now(); };
    var cur = null;
    var rate = 1;

    function setRate(value) {
      value = Number(value);
      if ([0.5, 0.75, 1, 1.25, 1.5, 2].indexOf(value) < 0) return;
      var old = rate;
      rate = value;
      if (cur) {
        cur.timers.forEach(function (t) {
          if (t.id) { clearTimeout(t.id); t.id = null; t.left = Math.max(0, t.left - (now() - t.at)); }
          t.left = t.left * old / rate;
          if (!cur.paused) arm(cur, t);
        });
        cur.media.forEach(function (el) { try { el.playbackRate = rate; el.preservesPitch = true; } catch (e) {} });
      }
      return rate;
    }
    function seek(seconds) {
      if (!cur || cur.aborted || !cur.seek || !isFinite(Number(seconds))) return false;
      return cur.seek(Number(seconds));
    }

    function snd() { try { return kit.sound ? kit.sound() : null; } catch (e) { return null; } }
    function duck(v) { var s = snd(); if (s) s.duck(v); }
    function sfx(name, vol) { var s = snd(); if (s) s.sfx(name, vol); }
    function fire(sc, slot, i, when) {
      var s = snd();
      if (!s) return;
      C.sceneCues(sc, slot, i, when).forEach(function (c) { s.cue(c); });
    }
    function cut(run) { return run.aborted || run.jump !== null; }

    /* ── 멈출 수 있는 타이머·기다림 ───────────────────────────────────── */
    function arm(run, t) { t.at = now(); t.id = setTimeout(function () { t.id = null; drop(run.timers, t); t.fn(); }, t.left); }
    function ptimer(run, ms, fn) {
      var t = { left: Math.max(0, ms) / rate, fn: fn, id: null, at: 0 };
      run.timers.push(t);
      if (!run.paused) arm(run, t);
      return t;
    }
    function cancel(run, t) { if (!t) return; if (t.id) clearTimeout(t.id); t.id = null; drop(run.timers, t); }
    /* setup(fin) 이 기다림을 걸고 «치우는 함수» 를 돌려준다. fin(값) 이나 wake() 로 끝난다(한 번만). */
    function wait(run, setup) {
      return new Promise(function (resolve) {
        var done = false, cleanup = null, val;
        function fin(v) {
          if (done) return;
          done = true; val = v;
          drop(run.wakers, fin);
          if (cleanup) { try { cleanup(); } catch (e) {} }
          resolve(val);
        }
        run.wakers.push(fin);
        try { cleanup = setup(fin) || null; } catch (e) { fin(); }
        if (done && cleanup) { try { cleanup(); } catch (e) {} }
      });
    }
    function sleep(run, ms) { return wait(run, function (fin) { var t = ptimer(run, ms, fin); return function () { cancel(run, t); }; }); }
    /* 끝을 모르는 약속(영상 불러오기 등)도 «다음·그만» 에 바로 풀리게 */
    function guard(run, p) {
      return wait(run, function (fin) {
        var alive = true;
        Promise.resolve(p).then(function (v) { if (alive) fin(v); }, function () { if (alive) fin(); });
        return function () { alive = false; };
      });
    }
    function gate(run) {
      if (!run.paused || cut(run)) return Promise.resolve();
      return new Promise(function (r) { run.gates.push(r); });
    }
    function wake(run) {
      run.wakers.slice().forEach(function (w) { try { w(); } catch (e) {} });
      run.gates.splice(0).forEach(function (g) { try { g(); } catch (e) {} });
    }
    function playEl(run, el) {
      try { el.playbackRate = rate; el.preservesPitch = true; } catch (e) {}
      if (run.media.indexOf(el) < 0) run.media.push(el);
      if (run.paused) return;
      try { var p = el.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }
    /* kit.release — 화면이 빌려준 소리 요소(아이폰용으로 클릭 때 미리 깨워 둔 것)를 돌려받는다. 없으면 아무 일도 안 한다 */
    function stopEl(run, el) { try { el.pause(); } catch (e) {} drop(run.media, el); drop(run.held, el); if (kit.release) { try { kit.release(el); } catch (e) {} } }

    /* ── 소리 ─────────────────────────────────────────────────────────── */
    function maxMsFor(line) { return Math.max(4000, String(line.en).split(/\s+/).length * 700 + 3000); }
    function playClip(run, url, maxMs) {
      return wait(run, function (fin) {
        var a = new kit.Audio();
        a.preload = 'auto'; a.src = url;
        var route = kit.route ? kit.route(a, 'voice') : { cut: function () {} };
        var t = ptimer(run, maxMs, fin);
        a.onended = function () { fin(); }; a.onerror = function () { fin(); };
        playEl(run, a);
        return function () { cancel(run, t); stopEl(run, a); try { route.cut(); } catch (e) {} };
      });
    }
    function speakDevice(run, text, maxMs) {
      var synth = kit.synth, U = kit.Utter;
      if (!synth || !U) return sleep(run, 900);
      return wait(run, function (fin) {
        var t = ptimer(run, maxMs, fin);
        run.synthOn = true;
        try {
          var u = new U(text); u.lang = 'en-US'; u.rate = 0.95 * rate;
          u.onend = function () { fin(); }; u.onerror = function () { fin(); };
          synth.speak(u);
        } catch (e) { fin(); }
        return function () { cancel(run, t); run.synthOn = false; try { synth.cancel(); } catch (e) {} };
      });
    }
    function speakerFor(ep, line) { return C.ttsSpeakerFor(ep, line.speaker); }
    function speak(run, ep, line, stale) {
      return guard(run, kit.tts(line.en, speakerFor(ep, line))).then(function (url) {
        return gate(run).then(function () {
          if (cut(run) || (stale && stale())) return;
          return url ? playClip(run, url, maxMsFor(line)) : speakDevice(run, line.en, maxMsFor(line));
        });
      });
    }
    function prefetch(item) {
      if (!item) return;
      var sc = item.ep.scenes[item.scIdx];
      if (!sc || sc.timing === 'synced') return;
      sc.lines.forEach(function (l) { try { kit.tts(l.en, speakerFor(item.ep, l)); } catch (e) {} });
    }

    /* ── 장면: 차례(turn) ─────────────────────────────────────────────── */
    function turnScene(run, ep, sc, nextItem) {
      var v = kit.video();
      if (v) playEl(run, v);                    // 영상은 배경으로 돈다(소리는 정본 videoAudio 대로 — kit.prepVideo)
      fire(sc, 'start');
      var i = 0, revision = 0;
      function publishLine(k) {
        if (kit.onProgress) kit.onProgress({ current: k, duration: Math.max(0, sc.lines.length - 1),
          seekable: sc.lines.length > 1, unit: 'line', count: sc.lines.length, rate: rate });
      }
      run.seek = function (position) {
        i = Math.max(0, Math.min(sc.lines.length - 1, Math.floor(position)));
        revision++;
        run.media.slice().forEach(function (el) { if (el !== v) { try { el.pause(); } catch (e) {} } });
        if (run.synthOn && kit.synth) { try { kit.synth.cancel(); } catch (e) {} }
        wake(run);
        publishLine(i);
        return true;
      };
      publishLine(0);
      function next() {
        if (cut(run) || i >= sc.lines.length) return Promise.resolve();
        var k = i++, line = sc.lines[k], rev = revision;
        return gate(run).then(function () {
          if (cut(run) || rev !== revision) return;
          publishLine(k);
          if (k === sc.lines.length - 1) prefetch(nextItem);   // 마지막 대사에서 다음 장면 목소리를 미리 받아 둔다
          fire(sc, 'line', k, 'before');
          kit.showLine(ep, line);
          duck(DUCK);
          return speak(run, ep, line, function () { return rev !== revision; }).then(function () {
            duck(1);
            if (cut(run) || rev !== revision) return;
            fire(sc, 'line', k, 'after');
            return sleep(run, GAP_MS);
          });
        }).then(next);
      }
      return next().then(function () {
        run.seek = null;
        if (v) stopEl(run, v);
        if (cut(run)) return false;
        kit.clearLine();
        fire(sc, 'end');
        return sleep(run, END_MS).then(function () { return !cut(run); });
      });
    }

    /* ── 장면: 동기(synced) ───────────────────────────────────────────── */
    function syncedScene(run, ep, sc, videoOk) {
      var v = kit.video();
      var tracks = [];
      /* kind 를 넘긴다 — 화면이 «배경음악 끄기» 를 배경음악 파일에도 걸 수 있게(목소리는 언제나 켠다) */
      function addTrack(url, kind) {
        var a = new kit.Audio(); a.crossOrigin = 'anonymous'; a.preload = 'auto'; a.src = url;
        tracks.push({ el: a, route: kit.route ? kit.route(a, kind) : { cut: function () {} } });
      }
      if (sc.bgm) addTrack(sc.bgm, 'bgm');
      Object.keys(sc.voices || {}).forEach(function (cid) { addTrack(sc.voices[cid], 'voice'); });   // 먼저 보기 = 아무도 음소거하지 않는다
      function dropTracks() { tracks.forEach(function (t) { stopEl(run, t.el); try { t.route.cut(); } catch (e) {} }); }
      var ready = Promise.all(tracks.map(function (t) {
        return new Promise(function (r) {
          if (t.el.readyState >= 3) { r(); return; }
          var to = setTimeout(r, 8000);
          t.el.addEventListener('canplaythrough', function () { clearTimeout(to); r(); }, { once: true });
          t.el.addEventListener('error', function () { clearTimeout(to); r(); }, { once: true });
        });
      }));
      return guard(run, ready).then(function () { return gate(run); }).then(function () {
        if (cut(run)) { dropTracks(); return false; }
        /* 시계 = 영상(못 불렀으면 첫 소리 파일) — 영상이 죽어도 자막·효과음은 소리에 맞춰 흐른다 */
        var clock = (videoOk || !tracks.length) ? v : tracks[0].el;
        var cues = C.timedCues(sc), fired = {};
        var limit = sc.durationSec || 0;
        var completed = false;
        return wait(run, function (fin) {
          // Keep the original timeline for voices, captions and cues when skipping an embedded title.
          var start = sc.playbackStartSec || 0;
          try { if (v) v.currentTime = start; } catch (e) {}
          tracks.forEach(function (t) { try { t.el.currentTime = start; } catch (e) {} });
          if (v && videoOk) playEl(run, v);
          tracks.forEach(function (t) { playEl(run, t.el); });
          var shown = -2, last = -1, lastAt = now();
          /* 목소리가 영상을 따라가게 — 영상이 받는 중(버퍼링)이면 같이 서고, 다시 움직이면 같은 시각에서 같이 출발(정본 core) */
          var follow = C.clockFollower({ now: now, lines: sc.lines }), els = tracks.map(function (tr) { return tr.el; });
          function endTime() {
            var duration = clock && clock.duration;
            return limit && isFinite(duration) && duration > 0 ? Math.min(limit, duration) : limit || (isFinite(duration) ? duration : 0);
          }
          function publish() {
            if (kit.onProgress) kit.onProgress({ current: Math.max(0, ((clock && clock.currentTime) || start) - start),
              duration: Math.max(0, endTime() - start), seekable: endTime() > start, rate: rate });
          }
          run.seek = function (seconds) {
            var end = endTime();
            if (!(end > start)) return false;
            var target = Math.max(start, Math.min(end - 0.06, start + seconds));
            try { if (clock) clock.currentTime = target; } catch (e) { return false; }
            if (v && v !== clock) { try { v.currentTime = target; } catch (e) {} }
            tracks.forEach(function (tr) { try { tr.el.currentTime = target; } catch (e) {} });
            // Discard the follower's pre-seek stall state, including while paused.
            follow = C.clockFollower({ now: now, lines: sc.lines });
            cues.forEach(function (x, k) { fired[k] = x.at <= target; });
            last = target; lastAt = now();
            shown = C.lineIndexAt(sc.lines, target);
            if (shown < 0) { kit.clearLine(); duck(1); }
            else { kit.showLine(ep, sc.lines[shown]); duck(DUCK); }
            if (!run.paused) {
              if (v && videoOk) playEl(run, v);
              tracks.forEach(function (tr) { playEl(run, tr.el); });
            } else {
              run.held = tracks.map(function (tr) { return tr.el; });
              if (v && videoOk && run.held.indexOf(v) < 0) run.held.push(v);
            }
            publish();
            return true;
          };
          publish();
          var timer = setInterval(function () {
            publish();
            if (run.paused) { lastAt = now(); return; }
            var t = (clock && clock.currentTime) || 0;
            follow.step(t, els, clock);
            var li = C.lineIndexAt(sc.lines, t);
            if (li !== shown) {
              shown = li;
              if (li < 0) { kit.clearLine(); duck(1); } else { kit.showLine(ep, sc.lines[li]); duck(DUCK); }
            }
            cues.forEach(function (x, k) { if (!fired[k] && t >= x.at) { fired[k] = true; var s = snd(); if (s) s.cue(x.cue); } });
            if (t > last + 0.01) { last = t; lastAt = now(); }
            else if (now() - lastAt > STALL_MS) { fin(); return; }   // 시계가 멈췄다 — 영원히 기다리지 않는다
            var end = limit || (clock && clock.duration) || 0;
            if ((clock && clock.ended) || (end && t >= end - 0.05)) { completed = true; fin(); }
          }, TICK_MS);
          return function () {
            run.seek = null;
            clearInterval(timer);
            if (v) stopEl(run, v);
            dropTracks();
            kit.clearLine(); duck(1);
          };
        }).then(function () {
          if (!completed || cut(run)) return false;
          return sleep(run, END_MS).then(function () { return !cut(run); });
        });
      });
    }

    /* ── 한 항목(= 에피소드 하나): 제목 카드 → 장면 ─────────────────────── */
    function playItem(run, items, idx) {
      var item = items[idx], ep = item.ep, sc = ep.scenes[item.scIdx], v = kit.video();
      run.seek = null;
      if (kit.onProgress) kit.onProgress({ current: 0, duration: 0, seekable: false, rate: rate });
      prefetch(item);
      if (v && kit.prepVideo) kit.prepVideo(v, sc);
      var s = snd();
      if (s) s.enterScene(ep.palette, sc.mood, !!sc.bgm);
      var showTitle = !run.titleShown;
      run.titleShown = true;
      kit.card(showTitle ? item : null);
      sfx(item.first ? 'chime' : 'whoosh', 0.8);
      var vReady = v && kit.waitVideo ? guard(run, kit.waitVideo(v, VIDEO_MS)) : Promise.resolve(false);
      return Promise.all([vReady, sleep(run, showTitle ? CARD_MS : 0)]).then(function (r) {
        kit.card(null);
        if (cut(run)) return false;
        var videoOk = !!r[0];
        if (!videoOk && kit.note) kit.note('video');
        return gate(run).then(function () {
          if (cut(run)) return false;
          return sc.timing === 'synced' ? syncedScene(run, ep, sc, videoOk) : turnScene(run, ep, sc, items[idx + 1]);
        });
      }).then(function (completed) {
        kit.clearLine();
        if (kit.note) kit.note('');
        return !!completed && !cut(run);
      });
    }

    /* ── 멈춤·이어 가기 ───────────────────────────────────────────────── */
    function hold(run) {
      run.paused = true;
      run.timers.forEach(function (t) { if (t.id) { clearTimeout(t.id); t.id = null; t.left = Math.max(0, t.left - (now() - t.at)); } });
      run.held = run.media.filter(function (m) { return !m.paused; });
      run.held.forEach(function (m) { try { m.pause(); } catch (e) {} });
      if (run.synthOn && kit.synth) { try { kit.synth.pause(); } catch (e) {} }
      var s = snd(); if (s) s.pause();
      if (kit.onPause) kit.onPause(true);
    }
    /* replay=false 면 붙잡았던 소리를 다시 틀지 않는다(«다음·그만» — 어차피 치운다) */
    function unhold(run, replay) {
      run.paused = false;
      run.timers.forEach(function (t) { if (!t.id) arm(run, t); });
      var held = run.held.splice(0);
      if (replay) held.forEach(function (m) { try { var p = m.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} });
      if (run.synthOn && kit.synth) { try { kit.synth.resume(); } catch (e) {} }
      var s = snd(); if (s) s.resume();
      run.gates.splice(0).forEach(function (g) { try { g(); } catch (e) {} });
      if (kit.onPause) kit.onPause(false);
    }
    function pause() { var run = cur; if (run && !run.paused && !run.aborted) hold(run); }
    function resume() { var run = cur; if (run && run.paused) unhold(run, true); }
    function togglePause() { var run = cur; if (!run) return; if (run.paused) resume(); else pause(); }
    function jump(dir) {
      var run = cur;
      if (!run || run.aborted) return;
      if (run.paused) unhold(run, false);
      run.jump = dir;
      wake(run);
    }
    function stop() {
      var run = cur;
      if (!run) return;
      run.aborted = true;
      if (run.paused) unhold(run, false);
      wake(run);
    }

    function start(items) {
      if (cur) stop();
      var list = (items || []).filter(function (it) { return it && it.ep && it.ep.scenes && it.ep.scenes[it.scIdx]; });
      var run = { aborted: false, paused: false, jump: null, wakers: [], timers: [], gates: [], media: [], held: [], synthOn: false, idx: 0, total: list.length };
      cur = run;
      function step() {
        if (run.aborted) return Promise.resolve(false);
        if (run.idx >= list.length) return Promise.resolve(true);
        run.jump = null;
        if (kit.onItem) kit.onItem(run.idx, list.length, list[run.idx]);
        return playItem(run, list, run.idx).then(function (completed) {
          if (run.aborted) return false;
          var it = list[run.idx];
          if (completed && kit.onSeen) kit.onSeen(it.ep.id, it.ep.scenes[it.scIdx].no);
          var j = run.jump;
          run.jump = null;
          run.idx = j === 'prev' ? Math.max(0, run.idx - 1) : run.idx + 1;
          return step();
        });
      }
      run.done = step().then(function (finished) {
        if (finished && cur === run && list.length) {
          kit.card({ end: true });
          sfx('fanfare', 0.7);
          return sleep(run, CARD_MS).then(function () { return !run.aborted; });
        }
        return false;
      }).catch(function (e) {
        try { console.warn('[ai-dubbing-watch] 진행 중 오류', e); } catch (x) {}
        return false;
      }).then(function (finished) {
        if (cur !== run) return finished;           // 그새 새 판이 시작됐다 — 그 판의 화면을 건드리지 않는다
        cur = null;
        var s = snd(); if (s) { s.stopMusic(0.6); s.duck(1); }
        kit.card(null); kit.clearLine();
        if (kit.onEnd) kit.onEnd(!!finished);
        return finished;
      });
      return run.done;
    }

    function state() {
      var run = cur;
      return run ? { running: true, paused: run.paused, idx: run.idx, total: run.total, rate: rate } : { running: false, paused: false, idx: -1, total: 0, rate: rate };
    }

    return {
      start: start, stop: stop, pause: pause, resume: resume, togglePause: togglePause,
      seek: seek, setRate: setRate,
      next: function () { jump('next'); }, prev: function () { jump('prev'); }, state: state,
    };
  }

  var api = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MangoiDubWatch = api;
})(typeof window !== 'undefined' ? window : this);
