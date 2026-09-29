/* ══════════════════════════════════════════════════════════════
   🔊 수업 교재 «이 쪽 문장 듣기» 버튼 (2026-09-28 사장님 승인)
   ──────────────────────────────────────────────────────────────
   [왜] 수업 화면의 교재 칸은 그림(JPG)만 받아서, 새 BTS 교재의 🔊 가 수업에서는 사라졌다.
        교재 파일을 통째로 여는 방식은 무겁고(권당 5~6MB) 선생님·학생 쪽 맞추기를 새로 만들어야
        해서 택하지 않았다. 대신 «지금 보이는 쪽» 의 문장만 누를 때 읽어 준다.
   [어떻게]
     - 쪽마다 읽을 문장은 /data/tb-say/bts-NN.json 에 있다(교재 만들 때 뽑음 — 키는 사이트 파일 이름
       「[BTS 1 001 (…)] New / Slide3.JPG」 그대로). 그 권을 열었을 때만 한 번 받는다(16~32KB).
     - 소리는 «내 화면에서만» 난다 — 방에 아무것도 보내지 않는다(쪽 넘기기는 기존 동기화 그대로).
     - 목소리는 사이트 서버(/api/voice/tts, 영어) — 웜업·AI 친구와 같은 목소리.
   ⛔ 상주 setInterval·MutationObserver 를 두지 않는다(홈 정지 전력) — 쪽이 바뀌는 정본
      (pdfRender·pdfSyncSeqIdx)을 한 겹 감싸 그때만 다시 판단한다.
   ⛔ 버튼에 data-ko/data-en 을 달지 않는다(i18n 엔진이 textContent 를 갈아끼운다) — title·aria 로만.
   ⚠️ 문장이 없는 쪽(사진만 있는 쪽)·옛 교재·다른 교재에서는 버튼이 아예 안 보인다.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var TTS = '/api/voice/tts';
  var NAME_RE = /^\[BTS (\d{1,2}) [^\]]*\] New \/ Slide\d+\.JPG$/;
  var data = {};        // 'NN' → 객체(받는 중이면 Promise, 실패하면 null)
  var btn = null, box = null;
  var seq = 0, cur = null, urlCache = {};

  function isEn() { try { return typeof window.miIsEn === 'function' && window.miIsEn(); } catch (e) { return false; } }
  function tx(ko, en) { return isEn() ? en : ko; }

  // 지금 화면에 보이는 교재 파일 이름 — 시퀀스가 있으면 «보이는 URL» 로 찾은 항목을 믿는다
  function currentName() {
    try {
      var u = String(window._vcShownPdfUrl || '');
      var s = window._libSequence;
      if (u && s && s.length) {
        for (var i = 0; i < s.length; i++) {
          var su = String(s[i].url || '');
          if (su && (u === su || (su.charAt(0) === '/' && u.indexOf(su) >= 0))) return s[i].name || '';
        }
      }
      return String(window._vcShownPdfName || '');
    } catch (e) { return ''; }
  }
  /* 새 SIU(2026-09-29): 「[SIU BASIC 001 - …] New Easy / Slide3.JPG」 — 파일은 권마다 하나
     (/data/tb-say/siu-basic-001.json · siu-adv-001.json, 쉬운·어려운 판 키가 함께 들어 있다).
     BTS 는 예전 그대로 'NN' 을 돌려준다(bts-NN.json). */
  var SIU_RE = /^\[SIU (BASIC|ADVANCE) (\d{3}) [^\]]*\] New (?:Easy|Hard) \/ Slide\d+\.JPG$/;
  function volOf(name) {
    var n = String(name || ''), m = NAME_RE.exec(n);
    if (m) return ('0' + m[1]).slice(-2);
    m = SIU_RE.exec(n);
    return m ? (m[1] === 'BASIC' ? 'siu-basic-' : 'siu-adv-') + m[2] : '';
  }

  function load(vol) {
    if (Object.prototype.hasOwnProperty.call(data, vol)) return Promise.resolve(data[vol]);
    var p = fetch('/data/tb-say/' + (/^\d+$/.test(vol) ? 'bts-' + vol : vol) + '.json').then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) { data[vol] = d; return d; });
    data[vol] = p;
    return p;
  }
  function linesFor(name) {
    var vol = volOf(name);
    if (!vol) return Promise.resolve(null);
    return load(vol).then(function (d) { return (d && d[name]) || null; });
  }

  function stop() {
    seq++;
    try { if (cur) cur.pause(); } catch (e) {}
    cur = null;
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
    if (box) { var on = box.querySelectorAll('.tbs-on'); for (var i = 0; i < on.length; i++) on[i].classList.remove('tbs-on'); }
  }
  // 한 문장 읽기 — 서버가 안 되면 기기 목소리로 (소리가 아예 안 나는 것이 가장 나쁘다)
  function playOne(text, male, my) {
    var sp = male ? 'orion' : 'asteria', key = sp + '|' + text;
    var get = urlCache[key] ? Promise.resolve(urlCache[key]) :
      fetch(TTS, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, lang: 'en', speaker: sp }) })
        .then(function (r) {
          if (!r.ok || !/audio/.test(r.headers.get('content-type') || '')) throw new Error('tts ' + r.status);
          // 고른 화자가 아닌 목소리로 떨어졌으면 캐시하지 않는다(CLAUDE.md 목소리 폴백 함정)
          var got = r.headers.get('X-TTS-Speaker');
          return r.blob().then(function (b) { var u = URL.createObjectURL(b); if (!got || got === sp) urlCache[key] = u; return u; });
        });
    return get.then(function (u) {
      if (my !== seq) return;
      return new Promise(function (res) {
        var a = new Audio(u); cur = a;
        a.onended = a.onerror = function () { res(); };
        a.play().catch(function () { res(); });
      });
    }).catch(function () {
      if (my !== seq) return;
      return new Promise(function (res) {
        try {
          var ut = new SpeechSynthesisUtterance(text); ut.lang = 'en-US';
          ut.onend = ut.onerror = function () { res(); };
          speechSynthesis.speak(ut);
        } catch (e) { res(); }
      });
    });
  }
  function playList(items, rows) {
    stop(); var my = seq, i = 0;
    (function next() {
      if (my !== seq || i >= items.length) { if (my === seq && rows[i - 1]) rows[i - 1].classList.remove('tbs-on'); return; }
      if (rows[i - 1]) rows[i - 1].classList.remove('tbs-on');
      if (rows[i]) rows[i].classList.add('tbs-on');
      var it = items[i++];
      playOne(it[0], !!it[1], my).then(next);
    })();
  }

  function css() {
    if (document.getElementById('tbs-css')) return;
    var st = document.createElement('style'); st.id = 'tbs-css';
    st.textContent =
      '#tbs-btn{position:absolute;left:10px;z-index:55;width:44px;height:44px;border-radius:50%;border:2px solid #fff;' +
      'background:#e07a00;color:#fff;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0}' +
      '#tbs-btn[hidden],#tbs-box[hidden]{display:none!important}' +
      '#tbs-box{position:absolute;left:10px;z-index:56;max-width:min(420px,calc(100% - 20px));max-height:60%;overflow-y:auto;' +
      'background:#fff;color:#101828;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:8px;font:500 15px/1.35 system-ui,sans-serif}' +
      '#tbs-box .tbs-h{display:flex;align-items:center;gap:6px;margin:2px 2px 6px}' +
      '#tbs-box .tbs-h b{flex:1;font-size:13px;color:#475467}' +
      '#tbs-box button{font:inherit;cursor:pointer;border-radius:8px}' +
      '#tbs-box .tbs-all{background:#e07a00;color:#fff;border:0;padding:5px 10px;font-size:13px;font-weight:700}' +
      '#tbs-box .tbs-x{background:#f2f4f7;color:#101828;border:0;width:30px;height:30px}' +
      '#tbs-box .tbs-row{display:block;width:100%;text-align:left;background:#f8fafc;color:#101828;border:1px solid #e4e7ec;padding:7px 9px;margin:4px 0}' +
      '#tbs-box .tbs-row.tbs-on{background:#fff4e6;border-color:#e07a00}';
    document.head.appendChild(st);
  }
  function ensure() {
    var host = document.getElementById('tab-pdf');
    if (!host) return false;
    if (btn && btn.parentNode === host) return true;
    css();
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'tbs-btn'; btn.hidden = true; btn.textContent = '🔊';
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggle(); });
    box = document.createElement('div'); box.id = 'tbs-box'; box.hidden = true;
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    host.appendChild(btn); host.appendChild(box);
    return true;
  }
  function place() {
    var sw = document.getElementById('pdf-scroll-wrap');
    var top = sw ? sw.offsetTop + 8 : 60;
    btn.style.top = top + 'px'; box.style.top = (top + 52) + 'px';
    btn.title = tx('이 쪽 영어 문장 듣기 (내 화면에서만)', 'Listen to this page (only on my screen)');
    btn.setAttribute('aria-label', btn.title);
  }
  function close() { stop(); if (box) box.hidden = true; }
  function toggle() {
    if (!box.hidden) { close(); return; }
    var name = currentName();
    linesFor(name).then(function (items) {
      if (!items || !items.length) { btn.hidden = true; return; }
      box.innerHTML = '';
      var h = document.createElement('div'); h.className = 'tbs-h';
      var all = document.createElement('button'); all.className = 'tbs-all'; all.textContent = tx('▶ 전체 듣기', '▶ Play all');
      var b = document.createElement('b'); b.textContent = tx('내 화면에서만 소리가 나요', 'Plays only on my screen');
      var x = document.createElement('button'); x.className = 'tbs-x'; x.textContent = '✕';
      x.title = tx('닫기', 'Close'); x.setAttribute('aria-label', x.title);
      h.appendChild(all); h.appendChild(b); h.appendChild(x); box.appendChild(h);
      var rows = items.map(function (it, i) {
        var r = document.createElement('button'); r.className = 'tbs-row'; r.textContent = '🔊 ' + it[0];
        r.addEventListener('click', function () { playList([it], [r]); });
        box.appendChild(r); return r;
      });
      all.addEventListener('click', function () { playList(items, rows); });
      x.addEventListener('click', close);
      place(); box.hidden = false;
    });
  }
  // 쪽이 바뀔 때마다: 그 쪽에 읽을 문장이 있을 때만 버튼을 보인다
  var lastName = null;
  function refresh() {
    try {
      var name = currentName();
      if (name === lastName) return;
      lastName = name;
      close();
      if (!volOf(name)) { if (btn) btn.hidden = true; return; }
      linesFor(name).then(function (items) {
        if (name !== currentName()) return;          // 그 사이 또 넘어갔다
        if (!ensure()) return;
        btn.hidden = !(items && items.length);
        if (!btn.hidden) place();
      });
    } catch (e) {}
  }
  function wrap(fname) {
    var f = window[fname];
    if (typeof f !== 'function' || f.__tbsWrapped) return;
    var w = function () {
      var r = f.apply(this, arguments);
      try { if (r && typeof r.then === 'function') r.then(refresh, refresh); else setTimeout(refresh, 0); } catch (e) {}
      return r;
    };
    w.__tbsWrapped = true;
    window[fname] = w;
  }
  wrap('pdfRender');
  wrap('pdfSyncSeqIdx');
  wrap('selectFromTextbookLibrary');
  window.__mgTbSay = { refresh: refresh, currentName: currentName, volOf: volOf };
})();
