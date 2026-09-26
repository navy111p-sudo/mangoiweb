/*!
 * 😊 aifriend-facetalk.js — A.i 영어친구 «선생님 얼굴과만 대화하기» (2026-09-26 사장님 1안)
 *
 * [무엇] 선생님 얼굴(#tavatar-ring)을 누르면 글·버튼·설정이 전부 사라지고 얼굴만 화면 가득 남는다.
 *        학생이 말하면 → 선생님이 대답하고 → 다시 듣는다. 버튼을 누를 필요가 없다.
 *        아래에는 반투명 «유리판» 이 얇게 붙어 있고, 열면 선생님 말·내가 한 말·대답 보기가 보인다.
 *
 * [유리판은 «끌어올리기» 를 몰라도 된다 — 사장님 「자동으로 해줄 수 있어?」]
 *   ① 막히면 저절로 열린다 — 9초 동안 말이 없거나, 소리가 안 들렸거나, 받아적기가 실패했을 때
 *   ② 한 번 «탭» 해도 열리고 닫힌다(끌어올리기·내리기도 된다)
 *   ③ 이 기기에서 처음 들어왔을 때 한 번, 저절로 올라왔다 내려가며 «여기에 글이 있다» 를 보여 준다
 *
 * [어떻게 — 새 판정을 만들지 않고 화면의 정본을 그대로 부른다]
 *   - 듣기   : MangoiVoice.record (녹음 → 서버 Whisper, 조용함 2.5초면 끝)
 *   - 보내기 : sendMsg() — 교정 카드·포인트·스트리밍 낭독이 전부 예전 그대로 돈다
 *   - 멈추기 : stopSpeakingNow() — 문장 큐까지 끊는 유일한 정본
 *   - 얼굴   : #tavatar-ring 을 «옮겨» 온다(새 캔버스를 만들지 않음 — 립싱크가 그대로 산다)
 *
 * ⛔ 선생님이 말하는 동안에는 절대 녹음하지 않는다 — 스피커 소리를 학생 말로 받아적는다
 *    (2026-07-23 「음성인식이 AI 말을 받아 적던」 사고). 그래서 speakText 를 감싸 «아직 읽을 것이
 *    남았나» 를 세고, 0 이 된 뒤 0.7초 더 조용해야 듣기 시작한다.
 * ⛔ 말이 한 번도 안 들린 녹음은 전사 결과를 버린다 — Whisper 는 무음에서 "Thank you." 같은
 *    말을 지어낸다. 그걸 보내면 학생이 하지도 않은 말로 대화가 이어진다.
 * ⛔ 상주 setInterval·body class MutationObserver 를 두지 않는다(홈을 멎게 한 전력).
 *    상태는 이 모드가 켜진 동안만 살고, 끄면 전부 걷는다.
 */
(function () {
  'use strict';
  if (window.__ftkReady) return;
  window.__ftkReady = true;

  var PEEK_KEY = 'mangoi_ftk_peeked';
  var QUIET_MS = 700;          // 선생님 말이 끝난 뒤 이만큼 더 조용하면 듣기 시작
  var SPEAK_WAIT_MS = 60000;   // 한 턴 낭독을 기다리는 최대 시간(안전망)

  function en() { try { return typeof isEn === 'function' && isEn(); } catch (e) { return false; } }
  function t(ko, e) { return en() ? e : ko; }

  /* ── 🔊 «아직 읽을 것이 남았나» — speakText 를 감싸 센다 ───────────────────
     ⚠️ 이 파일은 defer 라 화면의 인라인 스크립트가 먼저 돈다. speakText 는 그 스크립트의
        최상위 함수 선언이라 window 속성과 «같은 바인딩» 이다 — 여기서 갈아 끼우면 화면 안의
        맨이름 호출(stmSpeak·sendMsg)도 이 감싼 판을 부른다. */
  var pending = 0, lastSpeakEnd = 0, spokeThisTurn = false;
  (function wrapSpeak() {
    if (typeof window.speakText !== 'function' || window.speakText.__ftk) return;
    var orig = window.speakText;
    var wrapped = function (text, btn, row, onDone) {
      var fired = false;
      pending++; spokeThisTurn = true;
      var fin = function () {
        if (fired) return; fired = true;
        pending = Math.max(0, pending - 1); lastSpeakEnd = Date.now();
        if (typeof onDone === 'function') { try { onDone(); } catch (e) {} }
      };
      /* 원본이 조용히 돌아가 버리는 경우(빈 글·⚠️ 줄·TTS 없음)에도 세기가 영영 안 남도록 */
      var safety = setTimeout(fin, 25000);
      try { orig(text, btn, row, function () { clearTimeout(safety); fin(); }); }
      catch (e) { clearTimeout(safety); fin(); }
    };
    wrapped.__ftk = true;
    window.speakText = wrapped;
  })();
  function avatarSpeaking() {
    var w = document.getElementById('tavatar-wrap');
    return !!(w && w.classList.contains('speaking'));
  }

  /* ── 화면 ───────────────────────────────────────────────────────────── */
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

  var root, glass, body, teacherEl, meEl, noteEl, chipsEl;
  var state = 'pause', open = false, active = false, homeParent = null, homeNext = null;
  var silentRuns = 0, turnSeq = 0;

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
    glass = root.querySelector('#ftkGlass'); body = root.querySelector('#ftkBody');
    teacherEl = root.querySelector('#ftkTeacher'); meEl = root.querySelector('#ftkMe');
    noteEl = root.querySelector('#ftkNote'); chipsEl = root.querySelector('#ftkChips');

    root.querySelector('#ftkX').addEventListener('click', exit);
    root.querySelector('#ftkGrab').addEventListener('click', function () { setOpen(!open, true); });
    /* 끌어올리기·내리기 — 알면 편하고, 몰라도 위의 탭·자동 열림으로 충분하다 */
    var y0 = null;
    glass.addEventListener('pointerdown', function (e) { y0 = e.clientY; });
    glass.addEventListener('pointerup', function (e) {
      if (y0 == null) return; var dy = e.clientY - y0; y0 = null;
      if (dy < -30) setOpen(true, true); else if (dy > 30) setOpen(false, true);
    });
    /* 얼굴을 누르면 — 말하는 중이면 끊고 바로 듣기, 쉬는 중이면 다시 시작 */
    root.querySelector('#ftkStage').addEventListener('click', onFaceTap);
    document.addEventListener('keydown', function (e) { if (active && e.key === 'Escape') exit(); });
    document.addEventListener('visibilitychange', function () {
      if (active && document.hidden) { stopAll(); setState('pause'); showPauseNote(); }
    });
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

  function setState(s) { state = s; if (root) root.setAttribute('data-s', s); if (s !== 'listen') root && root.classList.remove('heard'); }
  function glassHeight() {
    /* 닫힌 유리판은 «손잡이» 만 보인다. 높이를 재서 막대가 그 위에 뜨게 한다. */
    var grab = root.querySelector('#ftkGrab');
    var closedH = grab ? grab.offsetHeight : 34;
    var full = glass.offsetHeight;
    return { closedH: closedH, full: full };
  }
  function setOpen(on, byUser) {
    open = !!on;
    if (!glass) return;
    var h = glassHeight();
    var shift = open ? 0 : Math.max(0, h.full - h.closedH);
    var wide = window.matchMedia && window.matchMedia('(min-width:760px)').matches;
    glass.style.transform = (wide ? 'translateX(-50%) ' : '') + 'translateY(' + shift + 'px)';
    root.style.setProperty('--gl-h', (open ? h.full : h.closedH) + 'px');
    labels();
    if (byUser) { try { window.UXT && UXT.hit('ux:aifriend-facetalk-glass-' + (open ? 'open' : 'close')); } catch (e) {} }
  }
  function refreshOpen() { if (glass) setOpen(open, false); }

  function lastUserText() {
    var els = document.querySelectorAll('#chat .msg.user');
    return els.length ? (els[els.length - 1].textContent || '').trim() : '';
  }
  function lastTeacherText() {
    try { if (typeof lastAiText === 'function') { var s = lastAiText(); if (s) return s; } } catch (e) {}
    return '';
  }
  function fillText() {
    if (!root) return;
    teacherEl.textContent = lastTeacherText();
    var me = lastUserText();
    meEl.textContent = me ? t('나: ', 'Me: ') + me : '';
    refreshOpen();
  }
  function fillChips() {
    chipsEl.innerHTML = '';
    var list = [];
    try { if (typeof helpChipsFor === 'function') list = helpChipsFor(lastTeacherText()) || []; } catch (e) {}
    try { if (typeof HELP_ALWAYS !== 'undefined') list = list.concat(HELP_ALWAYS); } catch (e) {}
    /* ⚠️ «빈칸(___)» 칩은 이 모드에서 못 쓴다 — 입력창에 넣고 채우게 하는 칩인데 입력창이 없다 */
    list = list.filter(function (c) { return c && c.en && c.en.indexOf('___') < 0; }).slice(0, 4);
    list.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = c.en;
      if (c.ko && !en()) { var sm = document.createElement('small'); sm.textContent = c.ko; b.appendChild(sm); }
      b.addEventListener('click', function (e) { e.stopPropagation(); pickChip(c.en); });
      chipsEl.appendChild(b);
    });
    refreshOpen();
  }
  function clearHelp() { noteEl.textContent = ''; chipsEl.innerHTML = ''; refreshOpen(); }
  function showStuck(reasonKo, reasonEn) {
    noteEl.textContent = t(reasonKo, reasonEn);
    fillChips();
    setOpen(true, false);                      // ← «끌어올리기» 를 몰라도 저절로 열린다
  }
  function showPauseNote() {
    noteEl.textContent = t('잠깐 쉬는 중이에요. 선생님 얼굴을 누르면 다시 시작해요.', 'Paused. Tap the teacher to start again.');
    chipsEl.innerHTML = '';
    setOpen(true, false);
  }

  /* ── 대화 순서 ────────────────────────────────────────────────────── */
  function stopAll() {
    turnSeq++;
    try { window.MangoiVoice && MangoiVoice.cancel(); } catch (e) {}
    try { if (typeof stopSpeakingNow === 'function') stopSpeakingNow(); } catch (e) {}
  }
  function waitQuiet(my) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() {
        if (my !== turnSeq || !active) return res(false);
        var quiet = pending === 0 && !avatarSpeaking() && Date.now() - lastSpeakEnd >= QUIET_MS;
        if (quiet || Date.now() - t0 > SPEAK_WAIT_MS) return res(true);
        setTimeout(tick, 150);
      })();
    });
  }
  async function listen() {
    var my = ++turnSeq;
    await waitQuiet(my);
    if (my !== turnSeq || !active) return;
    if (!window.MangoiVoice || !MangoiVoice.supported()) {
      setState('pause');
      noteEl.textContent = t('이 브라우저는 마이크를 쓸 수 없어요. ✕ 를 눌러 글로 대화해 주세요.',
                             'This browser cannot use the microphone. Tap ✕ to type instead.');
      setOpen(true, false); return;
    }
    setState('listen');
    var heard = false, errReason = '';
    var said = await MangoiVoice.record({
      lang: 'en',
      onState: function (s, info) {
        if (my !== turnSeq) return;
        if (s === 'speaking') { heard = true; root.classList.add('heard'); if (open && noteEl.textContent) clearHelp(); }
        else if (s === 'thinking') setState('think');
        else if (s === 'error') errReason = (info && info.reason) || 'server';
      }
    });
    if (my !== turnSeq || !active) return;
    said = String(said || '').trim();
    if (!heard) said = '';                     // ⛔ 무음에서 Whisper 가 지어낸 말은 버린다
    if (errReason === 'denied' || errReason === 'unsupported') {
      setState('pause');
      noteEl.textContent = errReason === 'denied'
        ? t('🎤 마이크 권한이 꺼져 있어요. 주소창의 자물쇠(🔒)에서 마이크를 «허용» 한 뒤 선생님 얼굴을 눌러 주세요.',
            'Mic permission is off. Allow the microphone (🔒 in the address bar), then tap the teacher.')
        : t('이 브라우저는 마이크를 쓸 수 없어요. ✕ 를 눌러 글로 대화해 주세요.', 'This browser cannot use the microphone. Tap ✕ to type instead.');
      chipsEl.innerHTML = ''; setOpen(true, false); return;
    }
    if (!said) {
      silentRuns++;
      if (silentRuns >= 2) { setState('pause'); showPauseNote(); return; }   // 두 번 조용하면 쉬기(마이크 끔)
      if (errReason === 'server') showStuck('잘 못 알아들었어요. 다시 말해 보거나 아래에서 골라 보세요.',
                                            "I didn't catch that. Try again or pick one below.");
      else showStuck('뭐라고 할지 모르겠으면 아래에서 골라 보세요. 다시 말해도 돼요.',
                     'Not sure what to say? Pick one below, or just try again.');
      return listen();
    }
    silentRuns = 0;
    await send(said, my);
  }
  async function send(text, my) {
    clearHelp();
    meEl.textContent = t('나: ', 'Me: ') + text; teacherEl.textContent = '';
    refreshOpen();
    setState('think');
    spokeThisTurn = false;
    var input = document.getElementById('msgInput');
    if (!input || typeof window.sendMsg !== 'function') { exit(); return; }
    input.value = text;
    /* 🎤 음성으로 보낸 턴 — 서버가 «말하기» 보너스를 셉니다(🎤 버튼과 같은 값) */
    try { _pendingVoice = true; } catch (e) {}
    watchSpeakState(my);
    try { await window.sendMsg(); } catch (e) {}
    try { input.blur(); } catch (e) {}
    if (my !== turnSeq || !active) return;
    fillText();
    /* 답을 못 만든 턴(서버 오류·AI 불가)은 소리가 없다 — 그대로 다시 들으면 오류가 반복된다 */
    if (!spokeThisTurn) {
      setState('pause');
      noteEl.textContent = t('선생님이 지금 대답을 못 했어요. 잠시 뒤 선생님 얼굴을 누르면 다시 시작해요.',
                             'The teacher could not answer just now. Tap the teacher to try again.');
      setOpen(true, false); return;
    }
    listen();
  }
  /* 선생님이 말하기 시작하면 주황 — 폴링은 이 턴 동안만 산다 */
  function watchSpeakState(my) {
    (function tick() {
      if (my !== turnSeq || !active) return;
      if (state === 'think' && (avatarSpeaking() || pending > 0 && spokeThisTurn)) {
        setState('speak');
        var s = lastTeacherText(); if (s) { teacherEl.textContent = s; refreshOpen(); }
      }
      if (state === 'think' || state === 'speak') setTimeout(tick, 200);
    })();
  }
  function pickChip(text) {
    stopAll(); silentRuns = 0;
    var my = ++turnSeq;
    send(text, my);
  }
  function onFaceTap() {
    if (!active) return;
    if (state === 'speak' || state === 'think' && pending > 0) { stopAll(); silentRuns = 0; clearHelp(); listen(); return; }
    if (state === 'listen') { try { MangoiVoice.stop(); } catch (e) {} return; }   // 다 말했으면 눌러서 바로 보내기
    if (state === 'pause') { silentRuns = 0; clearHelp(); listen(); }
  }

  /* ── 켜기·끄기 ────────────────────────────────────────────────────── */
  function enter() {
    if (active) return;
    var ring = document.getElementById('tavatar-ring');
    if (!ring) return;
    build();
    active = true;
    homeParent = ring.parentNode; homeNext = ring.nextSibling;
    root.querySelector('#ftkStage').appendChild(ring);
    root.classList.add('on');
    document.documentElement.style.overflow = 'hidden';
    /* ⌨️ sendMsg() 는 끝에 input.focus() 를 한다 — 얼굴 화면 뒤에서 폰 키보드가 튀어나오지 않게
          이 모드 동안만 읽기 전용으로 둔다(값은 스크립트로 넣을 수 있다). 끌 때 원래대로. */
    var inp0 = document.getElementById('msgInput');
    if (inp0) { inp0.__ftkRO = inp0.readOnly; inp0.readOnly = true; }
    /* 이 모드는 «목소리로 하는 대화» 다 — 소리를 꺼 두었으면 켠다 */
    try {
      if (typeof isSoundOn === 'function' && !isSoundOn()) {
        localStorage.setItem('mangoi_aifriend_sound', '1');
        if (typeof updateSoundBtn === 'function') updateSoundBtn();
      }
    } catch (e) {}
    try { window.UXT && UXT.hit('ux:aifriend-facetalk-open'); } catch (e) {}
    stopAll(); silentRuns = 0;
    clearHelp(); fillText();
    setOpen(false, false);
    root.querySelector('#ftkX').focus({ preventScroll: true });
    firstPeek();
    var hasTalk = !!lastTeacherText();
    if (!hasTalk) greet(); else listen();
  }
  function greet() {
    var my = ++turnSeq;
    var hi = '';
    try { if (typeof friendOf === 'function') hi = friendOf(personNow()).hi || ''; } catch (e) {}
    if (!hi || typeof window.speakText !== 'function') return listen();
    teacherEl.textContent = hi; refreshOpen();
    setState('speak');
    window.speakText(hi, null, null, function () {});
    if (my === turnSeq) listen();
  }
  /* 처음 한 번은 저절로 올라왔다 내려가며 «여기에 글이 있다» 를 보여 준다 */
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
    stopAll();
    var ring = document.getElementById('tavatar-ring');
    if (ring && homeParent) {
      if (homeNext && homeNext.parentNode === homeParent) homeParent.insertBefore(ring, homeNext);
      else homeParent.appendChild(ring);
    }
    root.classList.remove('on');
    document.documentElement.style.overflow = '';
    var inp1 = document.getElementById('msgInput');
    if (inp1) { inp1.readOnly = !!inp1.__ftkRO; try { inp1.blur(); } catch (e) {} }
    setState('pause');
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}   // 원래 자리 얼굴 비율 다시 맞추기
    try { window.UXT && UXT.hit('ux:aifriend-facetalk-close'); } catch (e) {}
    var chat = document.getElementById('chat'); if (chat) chat.scrollTop = chat.scrollHeight;
  }

  /* ── 입구: 선생님 얼굴 카드 ───────────────────────────────────────── */
  function arm() {
    var ring = document.getElementById('tavatar-ring');
    if (!ring || ring.__ftkArmed) return;
    ring.__ftkArmed = true;
    ring.classList.add('ftk-door');
    ring.setAttribute('role', 'button'); ring.setAttribute('tabindex', '0');
    var setLbl = function () {
      var l = t('선생님 얼굴과만 대화하기', 'Talk face to face');
      ring.setAttribute('aria-label', l); ring.title = l;
    };
    setLbl();
    if (!document.getElementById('ftk-style')) {
      var st = document.createElement('style'); st.id = 'ftk-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    var badge = document.createElement('span'); badge.className = 'ftk-badge'; badge.setAttribute('aria-hidden', 'true');
    badge.textContent = '▶'; ring.appendChild(badge);
    ring.addEventListener('click', function () { if (!active) enter(); });
    ring.addEventListener('keydown', function (e) { if (!active && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enter(); } });
    var onLang = function () { setLbl(); labels(); };
    document.addEventListener('mangoi:lang-changed', onLang);
    window.addEventListener('mangoi:lang-changed', onLang);
    window.addEventListener('resize', function () { if (active) refreshOpen(); });
  }
  arm();

  window.MangoiFaceTalk = { enter: enter, exit: exit, isActive: function () { return active; } };
})();
