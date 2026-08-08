/* 🎮 game-track.js — 게임별 학습 계측 (2026-08-08 신설)
   ────────────────────────────────────────────────────────────────────────────
   왜: `game_progress` 에 «어느 게임에서 나온 기록인지» 칸이 없었다.
       UNIQUE(user_id, lang, item) 뿐이라 게임 8종이 한 표에 섞였고,
       13종 중 6종(shooter·wordfighter·grammar-pizza·rescue-voyage·
       suspect-mystery·battle-3d)은 정오답을 아예 안 보냈다.
       → 「테트리스가 잘 되고 있나」를 물어볼 수조차 없었다.

   사용: <script src="/js/game-track.js?v=N" defer></script> **한 줄만.** (N=현재 버전)
        게임 로직은 한 글자도 고치지 않는다. 13개 파일 내부를 고치면
        사고 반경이 게임 13개가 된다 — 그래서 바깥에서 붙인다.

   하는 일
     ① 게임 이름을 파일명에서 스스로 알아낸다 (student-game-tetris.html → 'tetris')
     ② 나가는 /api/games/progress · /api/games/shadow 본문에 game 을 **자동으로 끼워 넣는다**
     ③ 정답/오답/학습항목을 그 본문에서 세어 둔다 (게임에 물어보지 않는다)
     ④ 창을 닫거나 탭을 숨길 때 판(session) 1행을 sendBeacon 으로 보낸다

   원칙 — 이 파일은 «절대 게임을 방해하면 안 된다»
     · 모든 구간 try/catch. 계측이 죽어도 게임은 그대로 돈다.
     · fetch 를 감싸지만 **원본 인자·반환값을 그대로 통과**시킨다(본문만 덧칠).
     · 전송은 sendBeacon — 응답을 기다리지 않으므로 프레임에 영향 0.
     · 판당 요청 1건. 단어마다 서버를 부르면 필리핀 회선에서 게임이 끊긴다.
*/
(function () {
  'use strict';

  var API = '/api/games/session';

  /* ── 게임 이름 ──────────────────────────────────────────────────────────
     우선순위: script 태그의 data-game → window.MANGOI_GAME_ID → 파일명 추론 */
  function detectGame() {
    try {
      var s = document.currentScript;
      if (!s) {
        var all = document.querySelectorAll('script[src*="game-track.js"]');
        s = all.length ? all[all.length - 1] : null;
      }
      var attr = s && s.getAttribute && s.getAttribute('data-game');
      if (attr) return String(attr).trim();
      if (window.MANGOI_GAME_ID) return String(window.MANGOI_GAME_ID).trim();

      var f = (location.pathname.split('/').pop() || '').replace(/\.html?$/, '');
      if (!f) return 'other';
      // student-game-tetris → tetris,  review-quiz-cn → review-quiz,  speech-coach-cn → speech-coach
      f = f.replace(/^student-game-/, '').replace(/-cn$/, '');
      if (f === 'student-games') return 'other';     // 허브는 게임이 아니다
      return f;
    } catch (e) { return 'other'; }
  }

  /* ── 학생 식별 (ux-track.js 와 같은 규약) ───────────────────────────── */
  function uid() {
    try {
      var u = localStorage.getItem('mangoi_uid');
      if (u) return u;
      var raw = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      if (raw && raw.uid) return String(raw.uid);
      if (raw && raw.user_id) return String(raw.user_id);
    } catch (e) {}
    return 'guest';
  }

  function lang() {
    try {
      if (/-cn(\.html)?$/.test(location.pathname)) return 'zh';
      var g = localStorage.getItem('mangoi_game_lang') || localStorage.getItem('mangoi_lang') || '';
      return (String(g).toLowerCase().indexOf('zh') === 0) ? 'zh' : 'en';
    } catch (e) { return 'en'; }
  }

  var GAME = detectGame();
  var started = Date.now();
  var items = 0, correct = 0, wrong = 0, coins = 0;
  var finishedFlag = false;
  var sent = false;

  /* 정오답을 «따로» 안 보내는 학습 앱들 — 제출 1회를 학습 1항목으로 센다.
     (게임마다 채점 방식이 달라 정답 여부까지는 알 수 없다. 모르는 건 세지 않는다.) */
  var ANSWER_ENDPOINTS = [
    '/api/vocab/review', '/api/vocab/quiz-submit', '/api/review-quiz/submit',
    '/api/voice/coach', '/api/ai/write-correct', '/api/judgment/answer',
    '/api/games/space-monster/hit'
  ];

  /* ── 나가는 요청을 관찰하고 game 을 끼워 넣는다 ───────────────────────
     반환값은 «원본 문자열»이다. 못 고치면 그냥 원본을 돌려준다 — 절대 던지지 않는다. */
  function observeAndStamp(url, bodyText) {
    try {
      var u = String(url || '');

      for (var i = 0; i < ANSWER_ENDPOINTS.length; i++) {
        if (u.indexOf(ANSWER_ENDPOINTS[i]) !== -1) { items++; return bodyText; }
      }

      var isProgress = u.indexOf('/api/games/progress') !== -1;
      var isShadow   = u.indexOf('/api/games/shadow') !== -1;
      var isCoins    = u.indexOf('/api/games/coins') !== -1;
      if (!isProgress && !isShadow && !isCoins) return bodyText;
      if (typeof bodyText !== 'string' || !bodyText) return bodyText;

      var o = JSON.parse(bodyText);
      if (!o || typeof o !== 'object') return bodyText;

      if (isCoins) { coins += Math.max(0, Number(o.add) || 0); return bodyText; }

      o.game = GAME;                                   // ← 이 한 줄이 «게임별 분석» 을 만든다

      if (isProgress && Object.prototype.toString.call(o.events) === '[object Array]') {
        for (var j = 0; j < o.events.length; j++) {
          items++;
          if (o.events[j] && o.events[j].correct) correct++; else wrong++;
        }
      } else if (isShadow) {
        items++;
        // 발음은 맞고 틀림이 아니라 점수다 — 80점 이상만 «해냈다» 로 본다.
        if ((Number(o.score) || 0) >= 80) correct++; else wrong++;
      }
      return JSON.stringify(o);
    } catch (e) { return bodyText; }
  }

  /* ── 게임이 직접 알려주는 정오답 ────────────────────────────────────────
     6종(shooter·wordfighter·grammar-pizza·rescue-voyage·suspect-mystery·battle-3d)은
     정오답을 서버로 보낸 적이 없다. 밖에서는 알 수 없는 «내부 판정»이라, 이 문을 통해
     게임이 한 줄로 알려준다:  MangoiGame.answer(true, 'apple', '사과')

     ⚠️ 익명(guest)은 단어 기록을 보내지 않는다 — 학생별 약점 분석에 못 쓰는데 표만 불린다.
        (판 기록 session 은 guest 도 보낸다. 참여·이탈은 익명이라도 의미가 있다.) */
  var pq = [], pTimer = null;

  function queueAnswer(ok, item, ko) {
    try {
      items++; if (ok) correct++; else wrong++;
      var it = String(item == null ? '' : item).trim().slice(0, 200);
      if (!it) return;
      if (uid() === 'guest') return;
      pq.push({ item: it, ko: String(ko == null ? '' : ko).trim().slice(0, 200), correct: ok ? 1 : 0 });
      if (pq.length >= 20) flushProgress();
      else if (!pTimer) pTimer = setTimeout(function () { flushProgress(); }, 10000);
    } catch (e) {}
  }

  function flushProgress(useBeacon) {
    try {
      if (pTimer) { clearTimeout(pTimer); pTimer = null; }
      if (!pq.length) return;
      var payload = JSON.stringify({ user_id: uid(), lang: lang(), game: GAME, events: pq });
      pq = [];
      // ⚠️ 반드시 «원본» 으로 보낸다. 감싼 fetch 로 보내면 observeAndStamp 가 이 요청을
      //    다시 세어 정답 수가 두 배가 된다.
      if (useBeacon && _origBeacon) {
        _origBeacon('/api/games/progress', new Blob([payload], { type: 'application/json' }));
      } else if (_origFetch) {
        _origFetch('/api/games/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                            body: payload, keepalive: true })['catch'](function () {});
      }
    } catch (e) {}
  }

  var _origFetch = null, _origBeacon = null;

  /* fetch 감싸기 — 원본 동작을 절대 바꾸지 않는다(본문 문자열만 교체). */
  try {
    var origFetch = window.fetch;
    _origFetch = origFetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (input, init) {
        try {
          var url = (typeof input === 'string') ? input : (input && input.url) || '';
          if (init && typeof init.body === 'string') {
            var nb = observeAndStamp(url, init.body);
            if (nb !== init.body) {
              init = Object.assign({}, init, { body: nb });
            }
          }
        } catch (e) { /* 관찰 실패는 무시 — 요청은 그대로 나간다 */ }
        return origFetch.apply(this, arguments.length > 1 ? [input, init] : [input]);
      };
    }
  } catch (e) {}

  /* sendBeacon 감싸기 — 일부 게임이 이탈 시 beacon 으로 progress 를 보낸다. */
  try {
    var origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
    _origBeacon = origBeacon;
    if (origBeacon) {
      navigator.sendBeacon = function (url, data) {
        try {
          if (typeof data === 'string') {
            var nb = observeAndStamp(url, data);
            if (nb !== data) return origBeacon(url, nb);
          }
        } catch (e) {}
        return origBeacon(url, data);
      };
    }
  } catch (e) {}

  /* ── 판(session) 전송 ────────────────────────────────────────────────
     한 번만 보낸다. 학생이 돌아와서 더 놀면 새 판으로 다시 무장한다. */
  function send(why) {
    try {
      flushProgress(true);          // 단어 기록을 먼저 흘려보내고 판을 닫는다
      if (sent) return;
      var now = Date.now();
      var dur = now - started;
      // 아무 일도 없었고 3초도 안 있었으면 보내지 않는다(표가 쓰레기로 찬다).
      if (!items && !coins && dur < 3000) return;
      sent = true;

      var payload = JSON.stringify({
        uid: uid(), game: GAME, lang: lang(),
        started_at: started, ended_at: now,
        items: items, correct: correct, wrong: wrong,
        // «완주» = 게임이 알려준 경우 or 한 문제라도 실제로 푼 경우.
        //   추측하지 않는다 — 한 문제도 못 풀고 나간 판이 곧 «포기» 신호다.
        finished: (finishedFlag || items > 0) ? 1 : 0,
        coins: coins, why: why || ''
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(API, new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                     body: payload, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  /* 학생이 탭으로 돌아와 계속 논다 → 다음 판으로 새로 시작 */
  function rearm() {
    try {
      if (!sent) return;
      sent = false; started = Date.now();
      items = 0; correct = 0; wrong = 0; coins = 0; finishedFlag = false; pq = [];
    } catch (e) {}
  }

  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') send('hidden');
      else rearm();
    });
    window.addEventListener('pagehide', function () { send('pagehide'); });

    // 게임이 스스로 알려 주고 싶을 때 쓰는 문
    window.MangoiGame = {
      id: GAME,
      /** 정오답 1건. 정오답을 서버로 안 보내던 게임이 이 한 줄로 계측에 들어온다.
       *  @param ok    맞았나
       *  @param item  단어/문장 (약점 분석의 열쇠)
       *  @param ko    한국어 뜻 (있으면) */
      answer: function (ok, item, ko) { queueAnswer(!!ok, item, ko); },
      finish: function () { try { finishedFlag = true; send('finish'); } catch (e) {} },
      note: function (n) { try { items += Math.max(0, Number(n) || 1); } catch (e) {} }
    };
  } catch (e) {}
})();
