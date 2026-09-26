/*!
 * 😊 warmup-facetalk.js — A.i 말하기 연습(웜업) «선생님 얼굴과만 대화하기» (2026-09-26 사장님 1안)
 *
 * [무엇] 선생님 얼굴(#tavatar-ring)을 누르면 글·버튼·설정이 전부 사라지고 얼굴만 화면 가득 남는다.
 *        선생님이 말을 마치면 마이크가 저절로 열리고, 학생 말이 끝나면 저절로 보내진다.
 *        아래에는 반투명 «유리판» 이 얇게 붙어 있고, 열면 선생님 말·내가 한 말·대답 보기가 보인다.
 *        (A.i 영어친구의 js/aifriend-facetalk.js 와 «같은 화면» — 같은 #ftk 모양·같은 동작)
 *
 * [유리판은 «끌어올리기» 를 몰라도 된다]
 *   ① 막히면 저절로 열린다(말이 안 들렸을 때 — 대답 보기 칩과 함께)  ② 한 번 탭하면 열리고 닫힌다
 *   ③ 이 기기에서 처음 들어왔을 때 한 번 저절로 올라왔다 내려간다
 *
 * [어떻게 — 듣기·보내기는 새로 만들지 않는다]
 *   이 화면에는 이미 «✨ 자동으로 말하기(베타)» 엔진(js/warmup-auto-talk.js)이 있다.
 *   얼굴 화면은 그 엔진을 «켜고» 모양만 바꾼다 — 에코 방지(AI 말하는 동안 안 열기)·말 끝 판단·
 *   Whisper 폴백·두 번 못 들으면 쉬기가 전부 그 정본 그대로 돈다.
 *   ⛔ 여기서 음성인식을 새로 만들지 않는다(판정이 두 벌이 되면 한쪽만 고쳐진다).
 *   ⛔ 학생이 고른 «말하는 방법» 을 바꿔 두지 않는다 — 들어올 때 저장값을 기억했다가 나갈 때 되돌린다.
 *   ⛔ 상주 setInterval·body class MutationObserver 없음 — 상태 폴링은 이 화면이 켜진 동안만 산다.
 *   ⛔ 화상수업 안(iframe)에서는 안 켠다 — 자동 말하기가 거기서 꺼져 있는 것과 같은 이유(선생님 목소리 에코).
 */
(function () {
  'use strict';
  if (window.__wftkReady) return;
  window.__wftkReady = true;

  var PEEK_KEY = 'mangoi_ftk_peeked';          // A.i 친구하기와 같은 키 — 한 번 본 기기는 다시 안 보여 준다
  var MODE_KEY = 'mangoi_warmup_talk_mode';    // warmup-auto-talk.js 의 저장 키
  var POLL_MS = 250;
  var IDLE_REARM_MS = 1500;                    // 아무 일도 없이 이만큼 지나면 다시 듣기를 건다

  function g(name) { try { return window[name]; } catch (e) { return undefined; } }
  function AT() { return window.WarmupAutoTalk || null; }
  function en() { try { return (typeof window.getLang === 'function' ? window.getLang() : localStorage.getItem('mangoi_lang')) === 'en'; } catch (e) { return false; } }
  function zh() { try { return typeof window.isZh === 'function' && window.isZh(); } catch (e) { return false; } }
  function t(ko, e) { return en() ? e : ko; }
  function embedded() { var a = AT(); return !!(a && a._cfg && a._cfg.EMBEDDED); }

  /* ── 화면 — js/aifriend-facetalk.js 와 같은 모양(같은 id·같은 색) ── */
  var CSS = ''
    + '#ftk{position:fixed;inset:0;z-index:2147483050;background:radial-gradient(circle at 50% 38%,#1d2550,#070a18 72%);'
    + ' display:none;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;--st:#fb923c}'
    + '#ftk.on{display:block}'
    + '#ftk[data-s="listen"]{--st:#22c55e}#ftk[data-s="think"]{--st:#facc15}#ftk[data-s="speak"]{--st:#fb923c}#ftk[data-s="pause"]{--st:#64748b}'
    + '#ftk .ftk-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}'
    /* 옮겨 온 얼굴 — mango-avatar.js·refitAvatar 가 넣는 인라인 높이를 !important 로 이긴다 */
    + '#ftk #tavatar-ring{width:100%!important;height:100%!important;padding:0!important;border-radius:0!important;'
    + ' background:none!important;box-shadow:none!important;animation:none!important;transform:none!important;cursor:pointer}'
    + '#ftk #tavatar-ring::after{display:none!important}'
    /* 폰 세로(화면이 얼굴보다 길쭉)에서는 얼굴이 화면 가득, PC·가로에서는 잘리지 않게 전체를 보인다 */
    + '#ftk #tavatar-canvas{width:100%!important;height:100%!important;border-radius:0!important;object-fit:contain;object-position:50% 40%}'
    + '@media (max-aspect-ratio:4/5){#ftk #tavatar-canvas{object-fit:cover}}'
    + '#ftk #tavatar-video{display:none!important}'
    + '#ftk .ftk-edge{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 0 4px var(--st),inset 0 0 40px -10px var(--st);transition:box-shadow .35s;z-index:3}'
    + '#ftk .ftk-x{position:absolute;top:calc(env(safe-area-inset-top,0px) + 12px);right:12px;z-index:5;width:44px;height:44px;border-radius:50%;'
    + ' border:0;background:rgba(0,0,0,.45);color:#fff;font-size:20px;cursor:pointer;display:grid;place-items:center}'
    + '#ftk .ftk-x:focus-visible{outline:3px solid #fff;outline-offset:2px}'
    + '#ftk .ftk-bars{position:absolute;left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:flex-end;height:24px;z-index:4;'
    + ' bottom:calc(var(--gl-h,64px) + 16px);transition:bottom .4s}'
    + '#ftk .ftk-bars span{width:6px;height:6px;border-radius:3px;background:var(--st)}'
    + '#ftk[data-s="speak"] .ftk-bars span,#ftk.heard .ftk-bars span{animation:ftkEq 1s infinite ease-in-out}'
    + '#ftk .ftk-bars span:nth-child(2){animation-delay:.15s}#ftk .ftk-bars span:nth-child(3){animation-delay:.3s}#ftk .ftk-bars span:nth-child(4){animation-delay:.45s}'
    + '@keyframes ftkEq{0%,100%{height:6px}50%{height:24px}}'
    + '#ftk[data-s="think"] .ftk-bars span{animation:ftkDot 1.2s infinite ease-in-out}'
    + '@keyframes ftkDot{0%,100%{opacity:.3}50%{opacity:1}}'
    /* 유리판 */
    + '#ftk .ftk-glass{position:absolute;left:0;right:0;bottom:0;z-index:4;color:#eef1ff;'
    + ' background:rgba(8,12,32,.74);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);'
    + ' border-top:3px solid var(--st);border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);'
    + ' max-height:62%;overflow:hidden;transition:transform .4s ease,border-color .35s}'
    + '#ftk .ftk-grab{display:block;width:100%;border:0;background:none;padding:10px 0 12px;cursor:pointer}'
    + '#ftk .ftk-grab i{display:block;width:44px;height:5px;border-radius:3px;background:#8a95c7;margin:0 auto}'
    + '#ftk .ftk-grab:focus-visible i{outline:2px solid #fff;outline-offset:3px}'
    + '#ftk .ftk-body{padding:0 18px 16px;max-height:calc(62vh - 40px);overflow-y:auto}'
    + '#ftk .ftk-teacher{font-size:18px;line-height:1.5;text-align:center;margin:0 0 8px;font-weight:600}'
    + '#ftk .ftk-me{font-size:14px;line-height:1.45;text-align:center;color:#9fe8b8;margin:0 0 10px}'
    + '#ftk .ftk-me:empty,#ftk .ftk-teacher:empty{display:none}'
    + '#ftk .ftk-note{font-size:13px;text-align:center;color:#fde68a;margin:0 0 10px}'
    + '#ftk .ftk-note:empty{display:none}'
    + '#ftk .ftk-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}'
    + '#ftk .ftk-chips button{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.12);color:#fff;'
    + ' border-radius:999px;padding:9px 14px;font-size:14px;cursor:pointer;min-height:40px}'
    + '#ftk .ftk-chips button small{display:block;font-size:11px;color:#c7cdf0}'
    + '#ftk .ftk-chips:empty{display:none}'
    + '@media (min-width:760px){#ftk .ftk-glass{left:50%;right:auto;width:min(640px,94vw);transform:translateX(-50%)}}'
    + '@media (prefers-reduced-motion:reduce){#ftk *{animation:none!important;transition:none!important}}'
    /* 들어가는 입구 — 얼굴 카드 모서리의 작은 표시 */
    + '#tavatar-ring.ftk-door{cursor:pointer}'
    + '#tavatar-ring .ftk-badge{position:absolute;right:-4px;bottom:-4px;z-index:5;width:22px;height:22px;border-radius:50%;'
    + ' background:#22c55e;color:#fff;font-size:12px;display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.4);pointer-events:none}'
    + '#ftk .ftk-badge{display:none}';

  var root, glass, teacherEl, meEl, noteEl, chipsEl;
  var state = 'pause', open = false, active = false, homeParent = null, homeNext = null;
  var poll = null, idleSince = 0, rearmedForIdle = false, stuckShownAt = -1;
  var prevMode = null, speechForced = false, lastTeacher = '', lastMe = '';

  function build() {
    if (root) return;
    if (!document.getElementById('ftk-style')) {
      var st = document.createElement('style'); st.id = 'ftk-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    root = document.createElement('div');
    root.id = 'ftk'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    root.innerHTML = ''
      + '<div class="ftk-stage" id="ftkStage"></div>'
      + '<div class="ftk-edge"></div>'
      + '<button type="button" class="ftk-x" id="ftkX">✕</button>'
      + '<div class="ftk-bars" aria-hidden="true"><span></span><span></span><span></span><span></span></div>'
      + '<div class="ftk-glass" id="ftkGlass">'
      + '  <button type="button" class="ftk-grab" id="ftkGrab"><i></i></button>'
      + '  <div class="ftk-body" id="ftkBody">'
      + '    <p class="ftk-teacher" id="ftkTeacher"></p>'
      + '    <p class="ftk-me" id="ftkMe"></p>'
      + '    <p class="ftk-note" id="ftkNote"></p>'
      + '    <div class="ftk-chips" id="ftkChips"></div>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(root);
    glass = root.querySelector('#ftkGlass');
    teacherEl = root.querySelector('#ftkTeacher'); meEl = root.querySelector('#ftkMe');
    noteEl = root.querySelector('#ftkNote'); chipsEl = root.querySelector('#ftkChips');

    root.querySelector('#ftkX').addEventListener('click', exit);
    root.querySelector('#ftkGrab').addEventListener('click', function () { setOpen(!open, true); });
    var y0 = null;
    glass.addEventListener('pointerdown', function (e) { y0 = e.clientY; });
    glass.addEventListener('pointerup', function (e) {
      if (y0 == null) return; var dy = e.clientY - y0; y0 = null;
      if (dy < -30) setOpen(true, true); else if (dy > 30) setOpen(false, true);
    });
    root.querySelector('#ftkStage').addEventListener('click', onFaceTap);
    document.addEventListener('keydown', function (e) { if (active && e.key === 'Escape') exit(); });
    labels();
  }
  function labels() {
    if (!root) return;
    var x = root.querySelector('#ftkX');
    x.setAttribute('aria-label', t('얼굴 대화 끝내기', 'Close face chat'));
    x.title = t('끝내기', 'Close');
    root.setAttribute('aria-label', t('선생님 얼굴과 대화하기', 'Face-to-face chat'));
    root.querySelector('#ftkGrab').setAttribute('aria-label', open ? t('글 닫기', 'Hide text') : t('글 보기', 'Show text'));
  }
  function setState(s, heard) {
    state = s;
    root.setAttribute('data-s', s);
    root.classList.toggle('heard', s === 'listen' && !!heard);
  }
  function setOpen(on, byUser) {
    open = !!on;
    if (!glass) return;
    var grab = root.querySelector('#ftkGrab');
    var closedH = grab ? grab.offsetHeight : 34, full = glass.offsetHeight;
    var shift = open ? 0 : Math.max(0, full - closedH);
    var wide = window.matchMedia && window.matchMedia('(min-width:760px)').matches;
    glass.style.transform = (wide ? 'translateX(-50%) ' : '') + 'translateY(' + shift + 'px)';
    root.style.setProperty('--gl-h', (open ? full : closedH) + 'px');
    labels();
    if (byUser) { try { window.UXT && UXT.hit('ux:warmup-facetalk-glass-' + (open ? 'open' : 'close')); } catch (e) {} }
  }
  function refreshOpen() { if (glass) setOpen(open, false); }

  /* ── 대화 글 — 화면(#log)에 그려진 것을 그대로 읽는다 ── */
  function lastOf(sel) { var els = document.querySelectorAll(sel); return els.length ? els[els.length - 1] : null; }
  function teacherText() { var el = lastOf('#log .msg.ai .wu-text'); return el ? (el.textContent || '').trim() : ''; }
  function meText() {
    var el = lastOf('#log .msg.me'); if (!el) return '';
    var c = el.cloneNode(true); var w = c.querySelector('.who'); if (w) w.remove();
    return (c.textContent || '').trim();
  }
  function sysText() {                          // 🎤 권한 꺼짐 같은 안내는 화면이 #log 에 «sys» 로 남긴다
    var log = document.getElementById('log'); var last = log && log.lastElementChild;
    return last && last.classList && last.classList.contains('sys') ? (last.textContent || '').trim() : '';
  }
  function fillText() {
    var tt = teacherText(), me = meText(), ch = false;
    if (tt !== lastTeacher) { lastTeacher = tt; teacherEl.textContent = tt; ch = true; }
    if (me !== lastMe) { lastMe = me; meEl.textContent = me ? t('나: ', 'Me: ') + me : ''; ch = true; }
    if (ch) refreshOpen();
  }
  /* 💬 «대답 보기» 목록 — 정본은 서버가 답과 함께 준 것(showAnswerChips 의 인자)이다.
     화면은 그것을 8초 «기다렸다가» 카드로 그리는데(스스로 만들어 볼 틈, 2026-08-31), 얼굴 화면에서
     막혔을 때는 기다릴 이유가 없으니 받은 목록을 그대로 쓴다. 가로채기만 하고 원래 동작은 그대로 부른다.
     ⚠️ showAnswerChips 는 인라인 스크립트의 최상위 함수 선언이라 window 속성과 같은 바인딩 —
        여기서 갈아 끼우면 sendMsg 안의 맨이름 호출도 이 판을 부른다. */
  var lastChips = [];
  (function wrapChips() {
    var orig = window.showAnswerChips;
    if (typeof orig !== 'function' || orig.__wftk) return;
    var wrapped = function (list) {
      lastChips = Array.isArray(list) ? list.map(function (x) { return String(x || '').trim(); }).filter(Boolean) : [];
      return orig.apply(this, arguments);
    };
    wrapped.__wftk = true;
    window.showAnswerChips = wrapped;
  })();
  function chipList() {
    /* 떠 있는 카드 → 받아 둔 목록 → (둘 다 없으면) 누구에게나 맞는 두 마디 */
    var list = [].map.call(document.querySelectorAll('#ansCard .ans-chip'), function (b) { return (b.textContent || '').trim(); })
      .filter(function (s) { return s; });
    if (!list.length) list = lastChips.slice();
    if (!list.length) list = zh() ? ['请再说一遍。', '我不知道。'] : ['Can you say that again?', "I don't know. Can you help me?"];
    return list.slice(0, 4);
  }
  function fillChips() {
    chipsEl.innerHTML = '';
    chipList().forEach(function (txt) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
      b.addEventListener('click', function (e) { e.stopPropagation(); pickChip(txt); });
      chipsEl.appendChild(b);
    });
  }
  function clearHelp() { noteEl.textContent = ''; chipsEl.innerHTML = ''; refreshOpen(); }
  function showStuck() {
    var sys = sysText();
    noteEl.textContent = sys || t('뭐라고 할지 모르겠으면 아래에서 골라 보세요. 다시 말해도 돼요.',
                                  'Not sure what to say? Pick one below, or just try again.');
    fillChips();
    setOpen(true, false);                       // ← «끌어올리기» 를 몰라도 저절로 열린다
  }
  function showPauseNote() {
    noteEl.textContent = t('잠깐 쉬는 중이에요. 선생님 얼굴을 누르면 다시 시작해요.', 'Paused. Tap the teacher to start again.');
    chipsEl.innerHTML = '';
    setOpen(true, false);
  }

  /* ── 지금 무엇을 하는 중인가 — 정본 상태를 읽기만 한다 ── */
  function speaking() {
    var au = g('_ttsAudio'); if (au && !au.paused && !au.ended) return true;
    try { if (window.speechSynthesis && window.speechSynthesis.speaking) return true; } catch (e) {}
    var w = document.getElementById('tavatar-wrap'); return !!(w && w.classList.contains('speaking'));
  }
  function listening() { return !!(g('_recognizing') || g('_whisperOn')); }
  function tick() {
    if (!active) return;
    var a = AT(), S = (a && a._state) || {};
    fillText();
    // 폰: 화면이 보내기 뒤 입력칸에 초점을 주면 키보드가 얼굴 뒤에서 튀어나온다(자동 듣기도 막힌다)
    var inp = document.getElementById('inp'); if (inp && document.activeElement === inp) { try { inp.blur(); } catch (e) {} }
    var s;
    if (g('sending') || S.phase === 'check') s = 'think';
    else if (speaking()) s = 'speak';
    else if (listening()) s = 'listen';
    else if (S.resting) s = 'pause';
    else s = 'idle';

    if (s !== 'idle') { idleSince = 0; rearmedForIdle = false; }
    if (s === 'listen' && S.phase === 'speak' && noteEl.textContent) clearHelp();   // 학생이 말하기 시작하면 도움말을 걷는다
    if (s === 'think' && (noteEl.textContent || chipsEl.firstChild)) clearHelp();
    if (s === 'pause') {
      if (state !== 'pause') showPauseNote();
      setState('pause'); return;
    }
    if (s === 'idle') {
      /* 쉬기 전 «못 들음» — 엔진은 다음 AI 말까지 기다리지만, 얼굴 화면에는 버튼이 없으니
         대답 보기를 펼치고 한 번 더 듣는다. 못 들은 횟수는 엔진이 세어 두 번이면 쉰다. */
      if (!idleSince) idleSince = Date.now();
      if (S.misses > 0 && stuckShownAt !== S.misses) { stuckShownAt = S.misses; showStuck(); }
      if (!rearmedForIdle && !S.armTimer && Date.now() - idleSince >= IDLE_REARM_MS) {
        rearmedForIdle = true;
        try { a && typeof a.arm === 'function' && a.arm(); } catch (e) {}
      }
      setState(S.armTimer ? 'listen' : 'think');
      return;
    }
    if (S.misses === 0) stuckShownAt = -1;
    setState(s, s === 'listen' && S.phase === 'speak');
  }

  function pickChip(txt) {
    if (g('sending')) return;
    try { if (typeof window._micAbortQuiet === 'function') window._micAbortQuiet(); } catch (e) {}
    try { if (typeof window._stopSpeak === 'function') window._stopSpeak(); } catch (e) {}
    clearHelp();
    if (typeof window.pickAnswer === 'function') window.pickAnswer(txt);
  }
  function onFaceTap() {
    if (!active || g('sending')) return;
    /* 말하는 중 → 끊고 바로 듣기 / 듣는 중 → 다 말했으니 보내기 / 쉬는 중 → 다시 시작
       전부 🎤 버튼과 같은 정본(toggleMic) — 쉬던 엔진도 그 «누름» 으로 깨어난다. */
    clearHelp();
    try { if (typeof window.toggleMic === 'function') window.toggleMic(); } catch (e) {}
  }

  /* ── 켜기·끄기 ── */
  function enter() {
    if (active) return;
    var ring = document.getElementById('tavatar-ring');
    var su = document.getElementById('wuSetup');
    if (!ring || !AT() || embedded() || (su && !su.hidden)) return;
    build();
    active = true;
    homeParent = ring.parentNode; homeNext = ring.nextSibling;
    root.querySelector('#ftkStage').appendChild(ring);
    root.classList.add('on');
    document.documentElement.style.overflow = 'hidden';
    var inp = document.getElementById('inp');
    if (inp) { inp.__ftkRO = inp.readOnly; inp.readOnly = true; try { inp.blur(); } catch (e) {} }
    try { var mp = document.getElementById('menuPanel'); if (mp && mp.classList.contains('open') && typeof window.closeMenu === 'function') window.closeMenu(); } catch (e) {}
    // 이 화면은 «목소리로 하는 대화» 다 — 소리를 꺼 두었으면 이 동안만 켠다
    speechForced = false;
    if (g('_speechOn') === false && typeof window.toggleSpeech === 'function') { window.toggleSpeech(); speechForced = true; }
    // 자동 말하기 켜기 — 원래 고른 값을 기억했다가 나갈 때 되돌린다
    try { prevMode = localStorage.getItem(MODE_KEY); } catch (e) { prevMode = null; }
    try { AT().setMode('auto'); } catch (e) {}
    try { window.UXT && UXT.hit('ux:warmup-facetalk-open'); } catch (e) {}
    lastTeacher = lastMe = ''; stuckShownAt = -1; idleSince = 0; rearmedForIdle = false;
    clearHelp(); fillText();
    setState('think');
    setOpen(false, false);
    root.querySelector('#ftkX').focus({ preventScroll: true });
    firstPeek();
    poll = setInterval(tick, POLL_MS);
  }
  function firstPeek() {
    var seen = false;
    try { seen = localStorage.getItem(PEEK_KEY) === '1'; localStorage.setItem(PEEK_KEY, '1'); } catch (e) { seen = true; }
    if (seen) return;
    setTimeout(function () { if (active && !open) { setOpen(true, false);
      setTimeout(function () { if (active && !noteEl.textContent) setOpen(false, false); }, 3500); } }, 1200);
  }
  function exit() {
    if (!active) return;
    active = false;
    if (poll) { clearInterval(poll); poll = null; }
    try { if (typeof window._micAbortQuiet === 'function') window._micAbortQuiet(); } catch (e) {}
    // 말하는 방법을 들어오기 전으로 — 저장값이 없던 사람은 «없음» 으로(기본 버튼 모드)
    try {
      if (prevMode !== 'auto') { AT().setMode('button'); if (prevMode == null) localStorage.removeItem(MODE_KEY); }
    } catch (e) {}
    if (speechForced && g('_speechOn') === true && typeof window.toggleSpeech === 'function') window.toggleSpeech();
    speechForced = false;
    var ring = document.getElementById('tavatar-ring');
    if (ring && homeParent) {
      if (homeNext && homeNext.parentNode === homeParent) homeParent.insertBefore(ring, homeNext);
      else homeParent.appendChild(ring);
    }
    root.classList.remove('on');
    document.documentElement.style.overflow = '';
    var inp = document.getElementById('inp');
    if (inp) inp.readOnly = !!inp.__ftkRO;
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}   // 원래 자리 얼굴 크기 다시 맞추기
    try { window.UXT && UXT.hit('ux:warmup-facetalk-close'); } catch (e) {}
    var log = document.getElementById('log'); if (log) log.scrollTop = log.scrollHeight;
  }

  /* ── 입구: 선생님 얼굴 카드 ── */
  function arm() {
    var ring = document.getElementById('tavatar-ring');
    if (!ring || ring.__ftkArmed || embedded()) return;
    ring.__ftkArmed = true;
    ring.classList.add('ftk-door');
    ring.setAttribute('role', 'button'); ring.setAttribute('tabindex', '0');
    var setLbl = function () { var l = t('선생님 얼굴과만 대화하기', 'Talk face to face'); ring.setAttribute('aria-label', l); ring.title = l; };
    setLbl();
    if (!document.getElementById('ftk-style')) {
      var st = document.createElement('style'); st.id = 'ftk-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    var badge = document.createElement('span'); badge.className = 'ftk-badge'; badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '▶'; ring.appendChild(badge);
    ring.addEventListener('click', function () { if (!active) enter(); });
    ring.addEventListener('keydown', function (e) { if (!active && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enter(); } });
    var onLang = function () { setLbl(); labels(); if (active) { lastMe = null; fillText(); } };
    document.addEventListener('mangoi:lang-changed', onLang);
    window.addEventListener('mangoi:lang-changed', onLang);
    window.addEventListener('resize', function () { if (active) refreshOpen(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();

  window.WarmupFaceTalk = { enter: enter, exit: exit, isActive: function () { return active; } };
})();
