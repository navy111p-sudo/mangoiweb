/*!
 * 🔁 mangoi-shadow-sync.js — 「발음 점수를 서버로 잇는 한 줄」
 *
 * 왜 만들었나 (2026-08-04)
 * ─────────────────────────────────────────────────────────────
 * 서버에는 발음 점수를 받는 API 가 **이미 있었다**:
 *     POST /api/games/shadow  →  game_progress(pron_best / pron_last / pron_count)
 *     GET  /api/games/weak    →  오답·약점 항목 조회 (기기를 바꿔도 남는다)
 * 그런데 실제로 호출하는 화면은 **허브(student-games.html) 하나뿐**이었다.
 * iframe 으로 도는 게임 15종은 한 건도 안 보냈다. 그래서 이런 일이 벌어졌다:
 *
 *   · 탱크대전에서 30번 틀린 문장이 교사 화면에는 아무 흔적도 없다
 *   · 기기를 바꾸면(태블릿 → 폰) 그동안의 발음 기록이 통째로 사라진다
 *     (게임들이 쓰는 기억 큐 mangoi-memory.js 는 localStorage 다)
 *
 * 어떻게 고쳤나 — **게임 11종의 채점 코드를 건드리지 않는다**
 * ─────────────────────────────────────────────────────────────
 * 그 11종은 이미 하나같이 이렇게 부르고 있다(실측으로 전수 확인):
 *     MangoiMemory.log({ en: 목표문장 }, 통과여부, { tags, goodTags, score })
 * 즉 **서버로 보낼 재료가 이미 그 호출에 다 들어 있다.**
 * 그래서 이 파일은 `MangoiMemory.log` 를 한 겹 감싸서, 점수가 실린 호출이 올 때마다
 * 서버에도 같이 보낸다. 게임 파일은 한 줄도 안 바뀐다.
 *   → 파일이 크다(최대 196KB). 11개를 각각 열어 채점부를 고치는 것이 훨씬 위험하다.
 *   → 앞으로 만들 게임도 기억 큐만 쓰면 서버 적립이 자동으로 따라온다.
 *
 * 쓰는 법 — **mangoi-memory.js 다음에** 이 파일을 실으면 끝이다.
 *     <script src="/js/mangoi-memory.js?v=1"></script>
 *     <script src="/js/mangoi-shadow-sync.js?v=1"></script>
 * 직접 보내고 싶으면: MangoiShadow.save('I have a dog', '나는 개가 있어요', 82)
 *
 * ⚠️ 지켜야 할 것
 *   · **게임을 절대 멈추게 하지 않는다.** 원래 log() 를 먼저 부르고, 전송 실패는 전부 삼킨다.
 *   · 로그인하지 않은 학생(uid 없음)은 아무것도 안 보낸다.
 *   · 점수가 없는 호출(퀴즈 정오답 등)은 안 보낸다 — 발음 기록이 아니다.
 *   · 같은 (문장, 점수)가 3초 안에 두 번 오면 한 번만 보낸다.
 *     (한 판정에서 log 가 두 번 불리는 화면이 있어 중복 쓰기가 생긴다)
 *   · 한 페이지에서 최대 200건. 무한 루프가 D1 을 두들기는 사고를 막는 마지막 방벽이다.
 */
(function () {
  'use strict';
  if (window.MangoiShadow) return;

  var MAX_PER_PAGE = 200;   // 폭주 방지 상한
  var DEDUP_MS     = 3000;  // 같은 (문장,점수) 중복 전송 차단 창
  var sentCount = 0;
  var lastSent = {};        // "문장|점수" → 마지막 전송 시각

  function uid() {
    try {
      var u = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      if (u && (u.uid || u.user_id)) return String(u.uid || u.user_id);
    } catch (_) {}
    try {
      var v = JSON.parse(localStorage.getItem('mango_user') || 'null');
      if (v && (v.user_id || v.uid)) return String(v.user_id || v.uid);
    } catch (_) {}
    return '';
  }

  function curLang() {
    try { return localStorage.getItem('mangoi_game_lang') === 'zh' ? 'zh' : 'en'; }
    catch (_) { return 'en'; }
  }

  /**
   * 발음 점수 한 건을 서버에 적립한다. 실패해도 조용히 넘어간다.
   * @returns {boolean} 실제로 보냈는가 (검증·시험용)
   */
  function save(item, ko, score, lang) {
    try {
      item = String(item || '').trim();
      if (!item) return false;
      var s = Math.round(Number(score));
      if (!isFinite(s) || s <= 0) return false;           // 0점·무음은 기록할 값이 아니다
      if (sentCount >= MAX_PER_PAGE) return false;

      var u = uid();
      if (!u) return false;                                // 비로그인 학생은 보낼 곳이 없다

      var key = item + '|' + s, now = Date.now();
      if (lastSent[key] && (now - lastSent[key]) < DEDUP_MS) return false;
      lastSent[key] = now;
      sentCount++;

      fetch('/api/games/shadow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({
          user_id: u,
          lang: (lang === 'zh' || lang === 'en') ? lang : curLang(),
          item: item.slice(0, 200),
          ko: String(ko || '').slice(0, 200),
          score: Math.max(0, Math.min(100, s))
        })
      }).catch(function () {});
      return true;
    } catch (_) { return false; }
  }

  /**
   * MangoiMemory.log 에 서버 적립을 덧붙인다.
   * 여러 번 불러도 안전하다(이미 감쌌으면 그냥 true 를 돌려준다).
   */
  function hook() {
    try {
      if (!window.MangoiMemory || typeof MangoiMemory.log !== 'function') return false;
      if (MangoiMemory.log.__mangoiShadowHooked) return true;

      var orig = MangoiMemory.log;
      var wrapped = function (item, ok, ex) {
        /* ⚠️ 원래 동작이 **먼저** 그리고 **반드시** 일어나야 한다.
           서버 전송이 실패하든 예외가 나든 기억 큐 적립은 영향을 받으면 안 된다. */
        try { return orig.apply(this, arguments); }
        finally {
          try {
            if (ex && typeof ex.score === 'number' && item && item.en) {
              save(item.en, item.ko || '', ex.score);
            }
          } catch (_) {}
        }
      };
      wrapped.__mangoiShadowHooked = true;
      MangoiMemory.log = wrapped;
      return true;
    } catch (_) { return false; }
  }

  /* 실을 때 바로 시도하고, mangoi-memory.js 가 뒤에 실린 경우를 대비해 몇 번 더 본다.
     (스크립트 순서를 잘못 놓아도 조용히 안 붙는 것보다 낫다 — 그런 실수는 눈에 안 띈다) */
  if (!hook()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (hook() || ++tries >= 20) clearInterval(timer);
    }, 250);
    try { document.addEventListener('DOMContentLoaded', function () { hook(); }); } catch (_) {}
  }

  window.MangoiShadow = {
    save: save,
    hook: hook,
    stats: function () { return { sent: sentCount, hooked: !!(window.MangoiMemory && MangoiMemory.log.__mangoiShadowHooked) }; }
  };
})();
