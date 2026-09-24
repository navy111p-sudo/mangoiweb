/* ═══════════════════════════════════════════════════════════════════════
   warmup-auto-talk.js — A.i 말하기 연습 «자동 말하기 (베타)» (2026-09-24)
   EN: Hands-free turn taking for /warmup.html. After the AI finishes speaking,
       the mic opens by itself; when the student stops talking it closes and sends.
   KO: 🎤 를 누르지 않아도 «AI 말이 끝나면» 마이크가 저절로 열리고, 학생 말이 끝나면
       저절로 닫혀 전송된다. 기존 🎤 버튼 모드는 한 글자도 안 바뀐다(기본값도 버튼 모드).

   무엇을 «새로» 하나 / what is new
   - 켜는 시점만 새로 정한다. 듣고 · 말 끝을 판단하고 · 보내는 일은 «기존 코드 그대로»
     (warmup.html 의 toggleMic / micViaWhisper — 침묵 타이머·문장 끝 판단·Whisper 폴백).
     ⛔ 여기서 음성인식을 새로 만들지 않는다 — 판정이 두 벌이 되면 한쪽만 고쳐진다.
   - 안드로이드는 녹음+Whisper 경로(micViaWhisper)로 연다 — 브라우저 음성인식은 켤 때마다
     «삐» 소리가 나서 자동으로 켜면 매 턴 삐 소리가 난다(2026-09-24 사장님 결정).
     그 경로는 getUserMedia 에 echoCancellation·noiseSuppression·autoGainControl 이 켜져 있다.

   AI 목소리를 학생 말로 받아 적지 않게 / echo guard
   - AI 가 «말하는 동안» 에는 절대 열지 않는다(끼어들기 없음 — 2026-09-24 결정).
   - AI 말이 «끝나고» ARM_DELAY_MS 뒤에 연다(스피커 잔향이 가라앉을 시간).
   - 열려 있는데 AI 가 다시 말을 시작하면(다시 듣기 등) 그 듣기를 «보내지 않고» 닫는다.
   - 중간에 끊긴 낭독(학생이 멈춤·글 입력)으로는 열지 않는다 — warmup.html 이 «끝까지 읽은
     낭독» 에서만 aiDone 을 보낸다(_speakSeq 비교).

   ⛔ 화상수업 안(iframe)에서는 베타 동안 «꺼 둔다» — 진짜 선생님 목소리(WebRTC)가 스피커로
      나오는데 브라우저 음성인식에는 에코 제거를 걸 방법이 없다. 선생님 발화 신호를 받으려면
      공동 금지구역(index.html·idx-main.js) 수정이 필요해 별건이다(2026-09-24 결정).
   ⛔ 저장값은 «사람이 고른 것» 만 쓴다 — 기본(버튼 모드)을 미리 써 넣지 않는다.
   ⛔ 상주 타이머·MutationObserver 없음 — 타이머는 «열기 대기 한 번» 뿐이다.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.WarmupAutoTalk) return;

  var KEY = 'mangoi_warmup_talk_mode';   // 'auto' | 'button' — 사람이 고를 때만 쓴다
  var ARM_DELAY_MS = 600;                // AI 말이 끝난 뒤 이만큼 기다렸다 연다(잔향)
  var MISS_SETTLE_MS = 900;              // 듣기가 끝난 뒤 «Whisper 한 번 더» 가 이어지는지 기다림
  var MISS_LIMIT = 2;                    // 아무 말 없이 연속 N번이면 쉰다

  var EMBEDDED = (function () { try { return window.parent !== window; } catch (e) { return true; } })();
  var ANDROID = /Android/i.test(navigator.userAgent || '');

  var S = {
    armTimer: null, missTimer: null,
    session: false,   // 지금 열린 듣기가 «자동» 으로 연 것인가
    gotSend: false,   // 그 듣기(또는 이어지는 Whisper 재시도)에서 전송이 일어났나
    misses: 0, resting: false, opening: false,
    phase: ''         // '' | listen | speak | check | done
  };

  function readMode() { try { return localStorage.getItem(KEY) === 'auto' ? 'auto' : 'button'; } catch (e) { return 'button'; } }
  function isOn() { return !EMBEDDED && readMode() === 'auto'; }
  function g(name) { try { return window[name]; } catch (e) { return undefined; } }

  /* ── 상태 표시 — 어린 학생용 네 가지뿐 ───────────────────────── */
  var PHASE_TXT = {
    listen: { ko: '👂 듣는 중', en: '👂 Listening' },
    speak:  { ko: '🗣️ 말하는 중', en: '🗣️ Speaking' },
    check:  { ko: '🤖 AI 확인 중', en: '🤖 AI checking' },
    done:   { ko: '✅ 완료', en: '✅ Done' }
  };
  function uiEn() { try { return (typeof window.getLang === 'function' ? window.getLang() : localStorage.getItem('mangoi_lang')) === 'en'; } catch (e) { return false; } }
  function pill() {
    var p = document.getElementById('autoTalkPill');
    if (p) return p;
    var st = document.getElementById('wgState');
    if (!st || !st.parentNode) return null;
    p = document.createElement('div');
    p.id = 'autoTalkPill'; p.className = 'autotalk-pill';
    p.setAttribute('role', 'status'); p.setAttribute('aria-live', 'polite');
    p.hidden = true;
    st.parentNode.insertBefore(p, st);
    return p;
  }
  function setPhase(ph) {
    S.phase = ph || '';
    var p = pill(); if (!p) return;
    if (!isOn() || !S.phase || !PHASE_TXT[S.phase]) { p.hidden = true; return; }
    var t = PHASE_TXT[S.phase];
    p.hidden = false;
    p.setAttribute('data-phase', S.phase);
    p.innerHTML = '<span class="at-tag">' + (uiEn() ? 'Auto · beta' : '자동 · 베타') + '</span> '
      + '<span class="at-txt">' + (uiEn() ? t.en : t.ko) + '</span>';
  }

  function note(msg) { try { var st = document.getElementById('wgState'); if (st) st.textContent = msg; } catch (e) {} }

  /* ── 열 수 있는 때인가 ─────────────────────────────────────── */
  function canOpen() {
    if (!isOn() || S.resting) return false;
    if (document.hidden) return false;
    if (g('_warmPaused') || g('sending') || g('_recognizing') || g('_whisperOn')) return false;
    if (!g('_audioUnlocked')) return false;          // 한 번도 안 눌렀으면 브라우저가 마이크를 막는다
    var su = document.getElementById('wuSetup'); if (su && !su.hidden) return false;
    var mp = document.getElementById('menuPanel'); if (mp && mp.classList.contains('open')) return false;   // ⋮ 설정을 고르는 중
    var inp = document.getElementById('inp');
    if (inp && (document.activeElement === inp || String(inp.value || '').trim())) return false;   // 글로 쓰는 중
    var au = g('_ttsAudio'); if (au && !au.paused && !au.ended) return false;                       // 아직 말하는 중
    try { if (window.speechSynthesis && window.speechSynthesis.speaking) return false; } catch (e) {}
    return true;
  }
  function clearArm() { if (S.armTimer) { clearTimeout(S.armTimer); S.armTimer = null; } }
  function arm() {
    clearArm();
    if (!isOn() || S.resting) return;
    S.armTimer = setTimeout(function () {
      S.armTimer = null;
      if (!canOpen()) { if (S.phase === 'done') setPhase(''); return; }
      S.opening = true; S.session = true; S.gotSend = false;
      try {
        if (ANDROID && typeof window.micViaWhisper === 'function') window.micViaWhisper();
        else if (typeof window.toggleMic === 'function') window.toggleMic();
      } catch (e) { S.session = false; }
      S.opening = false;
    }, ARM_DELAY_MS);
  }

  function rest() {
    S.resting = true; S.misses = 0; clearArm(); setPhase('');
    note(uiEn() ? 'Auto talk is resting — tap 🎤 to start again.'
                : '자동 말하기가 잠깐 쉬어요 — 🎤 를 누르면 다시 시작해요.');
  }
  function wake() { S.resting = false; S.misses = 0; }

  /* ── warmup.html 이 보내는 신호 ─────────────────────────────── */
  function on(ev, a) {
    switch (ev) {
      case 'aiStart':             // AI 가 말을 시작함 — 열 예정이면 취소, 열려 있으면 조용히 닫기
        clearArm();
        if (isOn() && S.session && (g('_recognizing') || g('_whisperOn'))) {
          S.session = false;
          try { if (typeof window._micAbortQuiet === 'function') window._micAbortQuiet(); } catch (e) {}
        }
        break;
      case 'aiDone':              // AI 가 «끝까지» 말함 → 잠시 뒤 연다
        arm();
        break;
      case 'press':               // 사람이 🎤 를 직접 누름(자동이 연 것이 아니면)
        if (!S.opening) { clearArm(); wake(); S.session = false; setPhase(''); }
        break;
      case 'mic':                 // setMicState(on)
        if (a) {
          if (S.missTimer) { clearTimeout(S.missTimer); S.missTimer = null; }
          if (S.session && S.phase !== 'speak') setPhase('listen');   // 브라우저가 세션을 다시 켤 때 «말하는 중» 을 되돌리지 않는다
        } else if (S.session) {
          if (S.missTimer) clearTimeout(S.missTimer);
          S.missTimer = setTimeout(function () {
            S.missTimer = null;
            if (g('_recognizing') || g('_whisperOn')) return;   // Whisper 재시도가 이어짐
            var sent = S.gotSend; S.session = false;
            if (sent) return;
            setPhase('');
            if (++S.misses >= MISS_LIMIT) rest();
          }, MISS_SETTLE_MS);
        }
        break;
      case 'phase':               // 'speak' | 'check' — 듣는 중 세부
        if (S.session && isOn()) setPhase(a);
        break;
      case 'sent':                // 학생 말이 전송됨(말로든 글로든)
        S.gotSend = true; S.misses = 0; clearArm();
        if (isOn()) setPhase('check');
        break;
      case 'reply':               // AI 답이 도착함(곧 낭독 시작)
        if (isOn()) setPhase('done');
        break;
      case 'settled':             // 전송 흐름이 끝남 — 답을 못 받았으면 표시를 걷는다
        if (S.phase === 'check') setPhase('');
        break;
    }
  }

  /* ── 모드 고르기 ───────────────────────────────────────────── */
  function setMode(mode) {
    try { localStorage.setItem(KEY, mode === 'auto' ? 'auto' : 'button'); } catch (e) {}
    wake(); clearArm();
    if (mode !== 'auto') setPhase('');
    paint();
    // 고른 «그 순간» 이 조용하면 바로 연다 — 전에는 다음 AI 말이 끝날 때까지 가만히 있었다(2026-09-24 제보).
    // ⋮ 메뉴 안에서 고르면 메뉴가 열려 있어 canOpen 이 막고, 메뉴를 닫는 순간 아래 hookMenuClose 가 다시 연다.
    if (mode === 'auto') arm();
  }
  /* ⋮ 메뉴를 닫으면 — 열려 있는 동안 막아 둔 자동 듣기를 다시 건다(닫기 경로 전부가 closeMenu 한 곳을 지난다). */
  function hookMenuClose() {
    var orig = window.closeMenu;
    if (typeof orig !== 'function' || orig.__autoTalk) return;
    var wrapped = function () {
      var mp = document.getElementById('menuPanel');
      var wasOpen = !!(mp && mp.classList.contains('open'));
      var r = orig.apply(this, arguments);
      if (wasOpen && isOn()) arm();
      return r;
    };
    wrapped.__autoTalk = true;
    window.closeMenu = wrapped;
  }
  function btnsHtml(cls) {
    var auto = readMode() === 'auto';
    return '<button type="button" class="' + cls + (auto ? '' : ' on') + '" data-talk="button">'
      + '<span class="wus-name">🎤 버튼으로 말하기' + (auto ? '' : '<span class="wus-now">지금</span>') + '</span>'
      + '<span class="wus-desc">마이크를 눌러서 말해요 (기본)</span></button>'
      + '<button type="button" class="' + cls + (auto ? ' on' : '') + '" data-talk="auto">'
      + '<span class="wus-name">✨ 자동으로 말하기 <span class="at-beta">베타</span>' + (auto ? '<span class="wus-now">지금</span>' : '') + '</span>'
      + '<span class="wus-desc">AI 말이 끝나면 마이크가 저절로 켜져요 · 이어폰을 쓰면 더 정확해요</span></button>';
  }
  function paint() {
    var a = document.getElementById('wusTalkBtns'); if (a) a.innerHTML = btnsHtml('wus-card');
    var b = document.getElementById('menuTalkBtns');
    if (b) {
      var auto = readMode() === 'auto';
      b.innerHTML = '<button type="button" data-talk="button"' + (auto ? '' : ' class="on"') + '>🎤 버튼</button>'
                  + '<button type="button" data-talk="auto"' + (auto ? ' class="on"' : '') + '>✨ 자동 (베타)</button>';
      var v = document.getElementById('talkVal'); if (v) v.textContent = auto ? '자동 (베타)' : '버튼';
    }
  }
  function bindPick(el, fromMenu) {
    el.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-talk]') : null;
      if (!t) return;
      var m = t.getAttribute('data-talk');
      setMode(m);
      // ⋮ 메뉴에서 «자동» 을 고르면 메뉴를 닫는다 — 열린 채로 두면 canOpen 이 막아 «눌렀는데 안 켜진다» 가 된다
      // (2026-09-24 두 번째 제보: 고른 뒤 메뉴를 열어 둔 채 기다림). 닫히면 hookMenuClose 가 켠다.
      if (fromMenu && m === 'auto') { try { if (typeof window.closeMenu === 'function') window.closeMenu(); } catch (e2) {} }
    });
  }
  /* 모양 — 이 파일 안에 둔다(warmup.html 은 연결 지점만 바뀐다). 어두운 화면 기준 색. */
  function mountCss() {
    if (document.getElementById('autotalk-css')) return;
    var st = document.createElement('style'); st.id = 'autotalk-css';
    st.textContent =
      '.autotalk-pill{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 auto 6px;'
      + 'padding:6px 14px;border-radius:999px;font-weight:800;font-size:15px;line-height:1.3;white-space:nowrap;'
      + 'width:max-content;max-width:100%;background:rgba(56,189,248,.16);border:1px solid rgba(56,189,248,.55);color:#e0f2fe}'
      + '.autotalk-pill[hidden]{display:none!important}'
      + '.autotalk-pill[data-phase="speak"]{background:rgba(52,211,153,.18);border-color:rgba(52,211,153,.6);color:#d1fae5}'
      + '.autotalk-pill[data-phase="check"]{background:rgba(251,191,36,.16);border-color:rgba(251,191,36,.6);color:#fef3c7}'
      + '.autotalk-pill[data-phase="done"]{background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.45);color:#d1fae5}'
      + '.autotalk-pill .at-tag{font-size:11px;font-weight:700;opacity:.8}'
      + '.at-beta{display:inline-block;margin-left:4px;padding:0 6px;border-radius:6px;font-size:11px;'
      + 'background:#f59e0b;color:#1f2937;vertical-align:middle}'
      + '#wusTalkSec{margin-top:6px}'
      + '#menuTalkBtns{grid-template-columns:1fr 1fr}';
    document.head.appendChild(st);
  }
  function mountUi() {
    if (EMBEDDED) return;
    mountCss();   // 수업 안에서는 고르는 칸도 안 보인다(베타 동안 꺼 둠)
    var cta = document.querySelector('#wuSetup .wus-ctabar');
    if (cta && !document.getElementById('wusTalkSec')) {
      var sec = document.createElement('div');
      sec.id = 'wusTalkSec';
      sec.innerHTML = '<div class="wus-sub">🎤 어떻게 말할까요?</div>'
        + '<div class="wus-hint">자동으로 고르면 <b>AI 말이 끝난 뒤</b> 마이크가 저절로 켜지고, 말을 멈추면 저절로 보내져요.</div>'
        + '<div class="wus-grid" id="wusTalkBtns"></div>';
      cta.parentNode.insertBefore(sec, cta);
      bindPick(document.getElementById('wusTalkBtns'));
    }
    var scroll = document.querySelector('#menuPanel .menu-scroll');
    if (scroll && !document.getElementById('menuTalkGroup')) {
      var grp = document.createElement('div');
      grp.id = 'menuTalkGroup'; grp.className = 'menu-group';
      grp.innerHTML = '<div class="menu-label"><span>🎤 말하는 방법</span><span class="ls-now" id="talkVal"></span></div>'
        + '<div class="voice-btns" id="menuTalkBtns" role="radiogroup" aria-label="말하는 방법"></div>';
      scroll.insertBefore(grp, scroll.firstChild);
      bindPick(document.getElementById('menuTalkBtns'), true);
    }
    var inp = document.getElementById('inp');
    if (inp) {
      inp.addEventListener('focus', clearArm);
      inp.addEventListener('input', clearArm);
    }
    hookMenuClose();
    paint();
  }

  window.WarmupAutoTalk = {
    on: on, isOn: isOn, setMode: setMode, mode: readMode,
    _state: S, _cfg: { ARM_DELAY_MS: ARM_DELAY_MS, MISS_LIMIT: MISS_LIMIT, EMBEDDED: EMBEDDED, ANDROID: ANDROID }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUi);
  else mountUi();
})();
