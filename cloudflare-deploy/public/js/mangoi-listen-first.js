/*!
 * 🎧 mangoi-listen-first.js — 「듣기 관문」 (Listen-First Gate)
 *
 * 왜 만들었나 (2026-08-03)
 * ─────────────────────────────────────────────────────────────
 * 우리 게임 21종은 TTS 를 재생하지만, **학생은 소리를 안 들어도 클리어할 수 있었다.**
 * 화면에 한국어 뜻이 항상 떠 있어서, 뇌가 택하는 최단경로는 "한글만 보고 고르기"다.
 * 그래서 듣기는 훈련이 아니라 그냥 **배경음(BGM)** 이 되어 있었다.
 *
 * 근거 — Vandergrift 의 「메타인지 청취 순환」(Metacognitive Pedagogical Cycle)
 *   예측(predict) → 검증(verify) → 반성(reflect)
 *   ‘예측’ 단계를 앞에 두면 학생은 **듣지 않고는 답할 수 없다**. 구조로 강제하는 것이지
 *   잔소리로 시키는 게 아니다.
 * 근거 — Mayer 의 멀티미디어 설계원리 메타-메타분석(2022)
 *   제2언어 자료에서 **자막(captioning)** 이 효과가 가장 큰 원리 중 하나였다.
 *   → 예측을 틀렸을 때 영어 글자를 같이 보여주며 다시 들려준다.
 * 근거 — Krashen 의 정의적 여과기(Affective Filter)
 *   틀렸다고 벌을 주면 학생은 **안 들으려 한다**. 그래서 여긴 **감점이 절대 없다.**
 *
 * 사용자 배려 (사장님 지시 2026-08-03) — 어린이·청소년 + 어르신이 같이 쓴다
 *   · 보기는 **딱 2개** (4개는 어린이에게 부하가 크다)
 *   · 글자 최소 20px, 버튼 최소 높이 68px, 명암비 높게
 *   · **시간 압박 없음** (자동 넘김은 있지만 카운트다운을 무섭게 보여주지 않는다)
 *   · **언제든 건너뛰기** 가능 · 3번 연속 건너뛰면 그 판은 더 안 묻는다(자율성)
 *   · 설정으로 완전히 끌 수 있다 (localStorage: mangoi_listen_gate = 'off')
 *   · prefers-reduced-motion 존중
 *
 * 비용: 0원. 기존 gameSpeak / MangoiTTS 만 쓴다. 새 API 없음. 서버 호출 없음.
 *
 * 사용법:
 *   await MangoiListen.gate({
 *     en: 'apple', ko: '사과',
 *     other: { en:'banana', ko:'바나나' },   // 오답 보기(없으면 관문을 건너뛴다)
 *     kind: 'word' | 'sent',
 *     mount: document.getElementById('game-area')   // 없으면 화면 전체 오버레이
 *   });
 *   // → 항상 resolve 된다. 절대 게임을 막지 않는다.
 */
(function () {
  'use strict';
  if (window.MangoiListen) return;

  var LS_KEY = 'mangoi_listen_gate';       // 'off' 면 완전 비활성
  var LS_STAT = 'mangoi_listen_stat';      // 참여/정답 누적 (학생에게 보여줄 정보형 피드백용)
  var skipStreak = 0;                      // 연속 건너뛰기 → 이 판에서는 그만 묻는다
  var mutedThisRun = false;
  var busy = false;

  function reduced() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (_) { return false; }
  }
  function enabled() {
    try { return localStorage.getItem(LS_KEY) !== 'off'; } catch (_) { return true; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(LS_KEY, on ? 'on' : 'off'); } catch (_) {}
  }
  function stat() {
    try { return JSON.parse(localStorage.getItem(LS_STAT) || '{"n":0,"ok":0}'); }
    catch (_) { return { n: 0, ok: 0 }; }
  }
  function bump(ok) {
    try {
      var s = stat(); s.n++; if (ok) s.ok++;
      localStorage.setItem(LS_STAT, JSON.stringify(s));
    } catch (_) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* 문장은 보기로 쓰기엔 길다 — 어르신·어린이 모두 한눈에 읽히도록 줄인다 */
  function shortKo(s, kind) {
    s = String(s || '').trim();
    var max = (kind === 'sent') ? 22 : 14;
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  /* 소리 재생 — 있는 것만 쓴다(무료). 끝나면 콜백. 안전장치로 최대 6초 뒤 강제 진행. */
  function say(text, done) {
    var fired = false;
    var fin = function () { if (!fired) { fired = true; done && done(); } };
    setTimeout(fin, 6000);
    try {
      if (typeof window.gameSpeak === 'function') { window.gameSpeak(text, fin); return; }
      if (window.MangoiTTS && MangoiTTS.speak) { MangoiTTS.speak(text, null, fin); return; }
      if (window.speechSynthesis) {
        var u = new SpeechSynthesisUtterance(String(text));
        u.lang = 'en-US'; u.rate = 0.95;
        u.onend = fin; u.onerror = fin;
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
        return;
      }
    } catch (_) {}
    fin();
  }

  function injectCss() {
    if (document.getElementById('mg-listen-css')) return;
    var st = document.createElement('style');
    st.id = 'mg-listen-css';
    st.textContent = [
      '.mg-lg{position:fixed;inset:0;z-index:99960;display:flex;align-items:center;justify-content:center;',
      '  background:rgba(2,6,23,.93);padding:16px;box-sizing:border-box}',
      '.mg-lg-card{width:100%;max-width:560px;text-align:center;color:#f8fafc;',
      '  font-family:inherit;-webkit-font-smoothing:antialiased}',
      /* 🔊 큰 스피커 — 지금 "듣는 시간"이라는 걸 글 없이도 알게 한다 */
      '.mg-lg-ico{font-size:clamp(56px,14vw,88px);line-height:1;margin-bottom:10px}',
      '.mg-lg-ico.on{animation:mgLgPulse 1s ease-in-out infinite}',
      '@keyframes mgLgPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}',
      '@media (prefers-reduced-motion: reduce){.mg-lg-ico.on{animation:none}}',
      '.mg-lg-q{font-size:clamp(19px,4.2vw,26px);font-weight:800;margin-bottom:4px}',
      '.mg-lg-sub{font-size:clamp(13px,3vw,16px);color:#94a3b8;margin-bottom:18px}',
      /* 보기 버튼 — 어르신 손가락에도 넉넉하게 */
      '.mg-lg-opts{display:grid;gap:12px;margin-bottom:14px}',
      '.mg-lg-opt{min-height:68px;padding:14px 16px;border-radius:16px;border:2px solid rgba(148,163,184,.45);',
      '  background:#1e293b;color:#f1f5f9;font-size:clamp(18px,4.4vw,24px);font-weight:700;cursor:pointer;',
      '  width:100%;box-sizing:border-box;transition:transform .12s,border-color .12s,background .12s}',
      '.mg-lg-opt:hover{border-color:#38bdf8;background:#243b53}',
      '.mg-lg-opt:active{transform:scale(.98)}',
      '.mg-lg-opt.ok{border-color:#22c55e;background:#14532d;color:#dcfce7}',
      '.mg-lg-opt.no{border-color:#f59e0b;background:#3f2d10;color:#fde68a}',
      /* 자막 — 틀렸을 때만 영어 글자를 같이 보여준다 (Mayer: L2 자막 효과 큼) */
      '.mg-lg-cap{font-size:clamp(24px,6vw,40px);font-weight:800;color:#fbbf24;margin:10px 0 4px;letter-spacing:.5px}',
      '.mg-lg-msg{font-size:clamp(15px,3.4vw,19px);font-weight:700;min-height:26px;margin-bottom:8px}',
      '.mg-lg-foot{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:6px}',
      '.mg-lg-mini{min-height:46px;padding:10px 18px;border-radius:999px;border:1px solid rgba(148,163,184,.4);',
      '  background:transparent;color:#cbd5e1;font-size:15px;font-weight:600;cursor:pointer}',
      '.mg-lg-mini:hover{background:rgba(148,163,184,.14)}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /**
   * 듣기 관문 한 번.
   * 절대 실패하지 않는다 — 어떤 이유로든 못 띄우면 즉시 resolve 해서 게임을 통과시킨다.
   */
  function gate(opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var done = function (r) { busy = false; resolve(r || { shown: false }); };

      try {
        // ── 안 띄우는 조건들 (조용히 통과) ────────────────────────────
        if (busy) return done();                         // 겹치기 방지
        if (!enabled() || mutedThisRun) return done();   // 학생이 껐거나 이 판은 그만
        if (skipStreak >= 3) return done();              // 3번 연속 건너뜀 = 지금은 하기 싫다
        var en = String(opt.en || '').trim();
        var ko = String(opt.ko || '').trim();
        var other = opt.other || null;
        if (!en || !ko || !other || !other.ko) return done();          // 보기를 못 만들면 안 한다
        if (String(other.ko).trim() === ko) return done();             // 뜻이 같으면 문제가 안 된다
        if (!document.body) return done();

        busy = true;
        injectCss();

        var kind = opt.kind === 'sent' ? 'sent' : 'word';
        var right = { ko: shortKo(ko, kind), correct: true };
        var wrong = { ko: shortKo(other.ko, kind), correct: false };
        var opts = Math.random() < 0.5 ? [right, wrong] : [wrong, right];

        var box = document.createElement('div');
        box.className = 'mg-lg';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', '듣기 문제');
        box.innerHTML =
          '<div class="mg-lg-card">' +
            '<div class="mg-lg-ico on" id="mg-lg-ico">🔊</div>' +
            '<div class="mg-lg-q">무슨 뜻이었을까요?</div>' +
            '<div class="mg-lg-sub">잘 듣고 골라요 · 틀려도 괜찮아요</div>' +
            '<div class="mg-lg-cap" id="mg-lg-cap" style="display:none"></div>' +
            '<div class="mg-lg-opts" id="mg-lg-opts">' +
              opts.map(function (o, i) {
                return '<button type="button" class="mg-lg-opt" data-i="' + i + '">' + esc(o.ko) + '</button>';
              }).join('') +
            '</div>' +
            '<div class="mg-lg-msg" id="mg-lg-msg"></div>' +
            '<div class="mg-lg-foot">' +
              '<button type="button" class="mg-lg-mini" id="mg-lg-again">🔊 다시 듣기</button>' +
              '<button type="button" class="mg-lg-mini" id="mg-lg-skip">건너뛰기</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(box);

        var closed = false;
        var autoT = null;
        function close(res) {
          if (closed) return; closed = true;
          if (autoT) clearTimeout(autoT);
          try { box.remove(); } catch (_) { try { box.parentNode.removeChild(box); } catch (__) {} }
          done(res);
        }

        var ico = box.querySelector('#mg-lg-ico');
        var cap = box.querySelector('#mg-lg-cap');
        var msg = box.querySelector('#mg-lg-msg');

        function play() {
          if (ico) ico.className = 'mg-lg-ico on';
          say(en, function () { if (ico) ico.className = 'mg-lg-ico'; });
        }
        play();

        /* 아무것도 안 누르면 12초 뒤 조용히 넘어간다 — 어르신·저학년이 멈춰 있지 않도록.
           카운트다운을 화면에 안 보여주는 건 의도적이다(시간 압박 금지). */
        autoT = setTimeout(function () {
          if (cap) { cap.style.display = ''; cap.textContent = en; }
          if (msg) { msg.style.color = '#94a3b8'; msg.textContent = '이건 "' + ko + '" 였어요 🌱'; }
          setTimeout(function () { close({ shown: true, answered: false }); }, 1400);
        }, 12000);

        box.querySelector('#mg-lg-again').onclick = function () { play(); };
        box.querySelector('#mg-lg-skip').onclick = function () {
          skipStreak++;
          if (skipStreak >= 3) mutedThisRun = true;
          close({ shown: true, skipped: true });
        };

        var btns = box.querySelectorAll('.mg-lg-opt');
        Array.prototype.forEach.call(btns, function (b) {
          b.onclick = function () {
            if (autoT) { clearTimeout(autoT); autoT = null; }
            skipStreak = 0;
            var picked = opts[+b.dataset.i];
            var ok = !!picked.correct;
            bump(ok);
            Array.prototype.forEach.call(btns, function (x) { x.disabled = true; });
            b.className = 'mg-lg-opt ' + (ok ? 'ok' : 'no');

            if (ok) {
              // 유능감 피드백 — 코인이 아니라 "무엇을 해냈는지"를 말해준다 (SDT)
              if (msg) { msg.style.color = '#4ade80'; msg.textContent = '👂 잘 들었어요!'; }
              setTimeout(function () { close({ shown: true, answered: true, correct: true }); }, reduced() ? 550 : 850);
            } else {
              // 틀림 = 벌이 아니라 배움 — 정답 표시 + 영어 자막 + 한 번 더 들려준다
              Array.prototype.forEach.call(btns, function (x, i) {
                if (opts[i].correct) x.className = 'mg-lg-opt ok';
              });
              if (cap) { cap.style.display = ''; cap.textContent = en; }
              if (msg) { msg.style.color = '#fbbf24'; msg.textContent = '들으면서 한 번 더 볼까요? 🌱'; }
              play();
              setTimeout(function () { close({ shown: true, answered: true, correct: false }); }, 2200);
            }
          };
        });
      } catch (_) {
        done();   // 무슨 일이 있어도 게임은 계속된다
      }
    });
  }

  /* 새 판이 시작될 때 호출 — "이 판은 그만 묻기" 상태를 푼다 */
  function resetRun() { skipStreak = 0; mutedThisRun = false; }

  window.MangoiListen = {
    gate: gate,
    enabled: enabled,
    setEnabled: setEnabled,
    stat: stat,
    resetRun: resetRun
  };
})();
