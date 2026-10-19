/* 🎬 A.i영화더빙 — 에피소드 자료(매니페스트) 연결 (2026-10-20)
 *
 *  자료 정본: /data/dubbing/<에피소드>.json (schema «mangoi.dub.v1»)
 *    원본 대본·검수 기록은 저장소 content/dubbing/<에피소드>/ 에 있다(배포되지 않는 곳).
 *
 *  ⛔ 검수가 끝나기 전에는 화면을 한 글자도 바꾸지 않는다.
 *     장면 칸은 sceneProblems() 가 빈 목록일 때만 «열린 칸» 으로 바뀌고,
 *     그 밖에는 ai-dubbing.html 의 «영상 준비 중» 칸이 그대로 남는다(자료를 못 읽어도 같다).
 *  ⛔ 바깥 주소(http·https·//)의 영상·음성은 열지 않는다 — 생성 서비스 주소는 영구 보관이 아니다.
 *     우리 저장소·CDN 으로 옮긴 «/…» 경로만 받는다.
 *  ⚠️ 이 판은 «원어민 대사로 미리 보기» 까지만 연결한다.
 *     학생 녹음·AI 발음 평가·완성 영상 합성은 별도 검증 뒤에 연다(버튼은 잠긴 채로 그 사실을 말한다).
 */
(function () {
  'use strict';

  // ── 판정(순수 함수 — 하니스가 이 파일을 그대로 실행해 검사한다) ──
  var LOCAL_PATH = /^\/(?!\/)[A-Za-z0-9._\-\/]+$/;
  function isLocalPath(p) {
    return typeof p === 'string' && LOCAL_PATH.test(p) && p.indexOf('..') < 0;
  }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function hasText(s) { return typeof s === 'string' && s.trim().length > 0; }

  /** 이 장면을 열 수 없는 이유 목록. 빈 목록이면 열 수 있다. 모르면 «못 연다» 쪽으로 실패한다. */
  function sceneProblems(ep, sc) {
    var out = [];
    if (!ep || typeof ep !== 'object') return ['episode_missing'];
    if (!sc || typeof sc !== 'object') return ['scene_missing'];
    if (ep.qaApproved !== true) out.push('episode_not_approved');
    if (sc.qaApproved !== true) out.push('scene_not_approved');
    if (sc.linesSynced !== true) out.push('lines_not_synced');   // 대사 시각이 아직 초안(영상·입 모양과 안 맞춤)
    if (!sc.video) out.push('video_missing');
    else if (!isLocalPath(sc.video)) out.push('video_not_local');
    if (!sc.bgm) out.push('bgm_missing');
    else if (!isLocalPath(sc.bgm)) out.push('bgm_not_local');
    if (sc.thumb && !isLocalPath(sc.thumb)) out.push('thumb_not_local');
    var dur = sc.durationSec;
    if (!isNum(dur) || dur <= 0) out.push('duration_missing');
    var chars = (ep.characters && typeof ep.characters === 'object') ? ep.characters : {};
    var voices = (sc.voices && typeof sc.voices === 'object') ? sc.voices : {};
    var lines = Array.isArray(sc.lines) ? sc.lines : [];
    if (!lines.length) out.push('no_lines');
    var prevEnd = -1, seen = {};
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i] || {};
      if (!hasText(ln.en)) push('line_text_missing');
      if (!hasText(ln.ko)) push('line_ko_missing');
      if (!isNum(ln.start) || !isNum(ln.end) || ln.start < 0 || ln.end <= ln.start ||
          (isNum(dur) && ln.end > dur)) push('line_bad_time');
      else {
        if (ln.start < prevEnd) push('line_overlap');
        prevEnd = Math.max(prevEnd, ln.end);
      }
      if (!Object.prototype.hasOwnProperty.call(chars, ln.speaker)) push('unknown_speaker');
      else if (!isLocalPath(voices[ln.speaker])) push('voice_missing');
    }
    function push(code) { if (!seen[code]) { seen[code] = 1; out.push(code); } }
    return out;
  }
  function sceneReady(ep, sc) { return sceneProblems(ep, sc).length === 0; }

  /** 지금 시각(초)에 말하고 있는 대사. 없으면 null. */
  function lineAt(lines, t) {
    if (!Array.isArray(lines) || !isNum(t)) return null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln && t >= ln.start && t < ln.end) return ln;
    }
    return null;
  }

  var api = { isLocalPath: isLocalPath, sceneProblems: sceneProblems, sceneReady: sceneReady, lineAt: lineAt };
  if (typeof window !== 'undefined') window.MangoiDub = api;
  if (typeof document === 'undefined') return;

  // ── 화면 ──
  function lang() {
    try { return (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'ko'; }
    catch (e) { return 'ko'; }
  }
  function pick(o) { return (o && (o[lang()] || o.ko || o.en)) || ''; }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function biSpan(ko, en) {            // 🌐 를 눌러도 따라오게 data-ko/data-en 을 함께 단다
    var s = el('span', null, lang() === 'en' ? en : ko);
    s.setAttribute('data-ko', ko); s.setAttribute('data-en', en);
    return s;
  }

  var EP = null;

  function upgradeCard(card, sc) {
    var label = sc.label || {};
    var btn = el('button', card.className + ' is-ready');
    btn.type = 'button';
    btn.setAttribute('data-scene', String(sc.no));
    var thumb = el('div', 'thumb');
    if (sc.thumb) {
      var img = el('img');
      img.src = sc.thumb; img.alt = ''; img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      thumb.appendChild(biSpan('▶ 미리 보기', '▶ Preview'));
    }
    var oldTag = card.querySelector('.tag');
    var tag = el('span', oldTag ? oldTag.className : 'tag');
    tag.appendChild(biSpan(sc.no + '. ' + (label.ko || ''), sc.no + '. ' + (label.en || label.ko || '')));
    btn.appendChild(thumb); btn.appendChild(tag);
    btn.addEventListener('click', function () { openPlayer(sc); });
    card.parentNode.replaceChild(btn, card);
  }

  // ── 미리 보기(원어민 대사) ──
  var P = null;
  function closePlayer() {
    if (!P) return;
    try { P.video.pause(); } catch (e) {}
    P.audios.forEach(function (a) { try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {} });
    document.removeEventListener('keydown', P.onKey, true);
    if (P.box.parentNode) P.box.parentNode.removeChild(P.box);
    document.body.classList.remove('dub-open');
    if (P.opener && P.opener.focus) { try { P.opener.focus(); } catch (e) {} }
    P = null;
  }

  function syncAudios(force) {
    if (!P) return;
    var t = P.video.currentTime;
    P.audios.forEach(function (a) {
      if (force || Math.abs((a.currentTime || 0) - t) > 0.25) { try { a.currentTime = t; } catch (e) {} }
    });
  }

  function renderSub() {
    if (!P) return;
    var ln = lineAt(P.sc.lines, P.video.currentTime);
    if (ln === P.lastLine && !P.langDirty) return;
    P.lastLine = ln; P.langDirty = false;
    P.sub.textContent = '';
    if (!ln) return;
    var who = (EP.characters && EP.characters[ln.speaker]) || {};
    P.sub.appendChild(el('b', 'dub-who', pick(who.name) || ln.speaker));
    P.sub.appendChild(el('span', 'dub-en', ln.en));
    P.sub.appendChild(el('span', 'dub-ko', ln.ko));
  }

  function openPlayer(sc) {
    closePlayer();
    var box = el('div', 'dub-player');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    var panel = el('div', 'dub-panel');
    var head = el('div', 'dub-head');
    var title = el('h3');
    title.appendChild(biSpan(sc.no + '. ' + ((sc.label && sc.label.ko) || ''), sc.no + '. ' + ((sc.label && (sc.label.en || sc.label.ko)) || '')));
    var x = el('button', 'dub-x'); x.type = 'button';
    x.setAttribute('data-ko-aria', '닫기'); x.setAttribute('data-en-aria', 'Close');
    x.setAttribute('aria-label', lang() === 'en' ? 'Close' : '닫기');
    x.textContent = '✕';
    head.appendChild(title); head.appendChild(x);

    var stage = el('div', 'dub-stage');
    var video = el('video');
    video.src = sc.video; video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.setAttribute('playsinline', '');
    if (sc.thumb) video.poster = sc.thumb;
    var sub = el('div', 'dub-sub'); sub.setAttribute('aria-live', 'polite');
    stage.appendChild(video); stage.appendChild(sub);

    var audios = [];
    function addAudio(src) {
      if (!isLocalPath(src)) return;
      var a = el('audio'); a.src = src; a.preload = 'auto'; audios.push(a);
    }
    addAudio(sc.bgm);
    Object.keys(sc.voices || {}).forEach(function (k) { addAudio(sc.voices[k]); });

    var bar = el('div', 'dub-bar');
    var play = el('button', 'dub-play'); play.type = 'button';
    play.appendChild(biSpan('▶ 원어민 대사로 보기', '▶ Watch with native voices'));
    var again = el('button', 'dub-again'); again.type = 'button';
    again.appendChild(biSpan('↺ 처음부터', '↺ Restart'));
    var rec = el('button', 'dub-rec'); rec.type = 'button'; rec.disabled = true;
    rec.appendChild(biSpan('🎤 내 목소리로 더빙 — 녹음·AI 평가는 검증 뒤 열려요',
      '🎤 Dub with my voice — recording and AI feedback open after review'));
    bar.appendChild(play); bar.appendChild(again); bar.appendChild(rec);

    panel.appendChild(head); panel.appendChild(stage); panel.appendChild(bar);
    box.appendChild(panel);

    P = { box: box, video: video, audios: audios, sub: sub, sc: sc, lastLine: undefined, langDirty: false,
          opener: document.activeElement, onKey: null };
    P.onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); closePlayer(); } };
    document.addEventListener('keydown', P.onKey, true);

    x.addEventListener('click', closePlayer);
    box.addEventListener('click', function (e) { if (e.target === box) closePlayer(); });
    play.addEventListener('click', function () {
      if (!P) return;
      if (P.video.paused) { var r = P.video.play(); if (r && r.catch) r.catch(function () {}); }
      else P.video.pause();
    });
    again.addEventListener('click', function () {
      if (!P) return;
      P.video.currentTime = 0; syncAudios(true);
      var r = P.video.play(); if (r && r.catch) r.catch(function () {});
    });
    video.addEventListener('play', function () {
      syncAudios(true);
      audios.forEach(function (a) { var r = a.play(); if (r && r.catch) r.catch(function () {}); });
    });
    video.addEventListener('pause', function () { audios.forEach(function (a) { try { a.pause(); } catch (e) {} }); });
    video.addEventListener('seeked', function () { syncAudios(true); renderSub(); });
    video.addEventListener('timeupdate', function () { syncAudios(false); renderSub(); });
    video.addEventListener('ended', function () { audios.forEach(function (a) { try { a.pause(); } catch (e) {} }); });

    document.body.appendChild(box);
    document.body.classList.add('dub-open');
    try { play.focus(); } catch (e) {}
  }

  function onLang() { if (P) { P.langDirty = true; renderSub(); } }
  window.addEventListener('mangoi:lang-changed', onLang);
  document.addEventListener('mangoi:lang-changed', onLang);

  function boot() {
    var m = /[?&]ep=(dub-\d{3})(?:&|$)/.exec(location.search || '');
    var ep = m ? m[1] : 'dub-001';
    var r;
    try { r = fetch('/data/dubbing/' + ep + '.json', { cache: 'no-cache' }); } catch (e) { return; }
    r.then(function (res) { return res && res.ok ? res.json() : null; }).then(function (data) {
      if (!data || data.schema !== 'mangoi.dub.v1' || !Array.isArray(data.scenes)) return;
      EP = data;
      var cards = document.querySelectorAll('.scenes > .scene');
      var opened = 0;
      data.scenes.forEach(function (sc) {
        var probs = sceneProblems(data, sc);
        var card = sc && isNum(sc.no) ? cards[sc.no - 1] : null;
        if (!probs.length && card) { upgradeCard(card, sc); opened++; }
        else if (window.console && console.info) console.info('[dub] ' + ep + ' 장면 ' + (sc && sc.no) + ' 준비 중:', probs.join(', '));
      });
      if (opened && opened === cards.length) {
        var nt = document.querySelector('.notice');
        if (nt) nt.hidden = true;
      }
    }).catch(function () { /* 자료를 못 읽으면 «준비 중» 화면 그대로 */ });
  }
  boot();
})();
