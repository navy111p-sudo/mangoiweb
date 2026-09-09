/* idx-cta-status.js — 홈 큰 버튼 두 개 안에 «오늘 상태» 한 줄 (2026-09-09)
 *
 * [왜] 사장님 지시 — 「메인 화면에 오늘의 AI 학습과 수업 입장 버튼이 있기는 하나 눈에 잘 띄지 않음」.
 *   색은 index.html 에서 골드 채움을 되살려 해결했고(A안), 이 파일은 «내용»(C안) 을 맡는다:
 *   버튼이 «지금 눌러야 할 것» 을 직접 말하게 한다.
 *     수업 입장       → 「오전 6:00 · 강사 강선생님」 / 「지금 입장할 수 있어요」
 *     오늘의 A.i 학습 → 「3개 중 1개 남음」 / 「오늘 계획 완료 🎉」
 *
 * [왜 별도 파일인가] index.html 은 첫 화면 용량 예산이 몇백 바이트뿐이라 새 코드를 못 넣는다.
 *   여기는 defer 라 첫 페인트를 막지 않는다 — CLAUDE.md 「첫 화면 예산」 항목.
 *
 * ⛔ 값을 «지어내지» 않는다. 모르면 그 줄을 아예 안 그린다 —
 *    「오전 6:00 수업」이라고 써 놓고 그 시각에 아무도 안 오는 것이 빈칸보다 나쁘다
 *    (CLAUDE.md 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).
 * ⛔ 다음 수업을 «다시 조회하지» 않는다. 바로 아래 카드(#next-class-countdown)를 그리는
 *    idx-next-class.js 가 이미 /api/class/sessions/today 를 부르므로, 그 «그려진 결과» 를 읽는다.
 *    같은 판정을 두 벌로 두면 둘이 어긋나는 날 화면이 조용히 거짓말한다.
 * ⛔ 상주 setInterval·MutationObserver 를 두지 않는다 — body class 관찰자가 홈을 통째로
 *    멎게 한 전력이 두 번 있다(2026-07-14 · 2026-08-27). 여기서는 «끝이 있는» 확인만 한다.
 * ⛔ 버튼이나 라벨에 data-ko/data-en 을 달지 않는다 — 두 i18n 엔진이 그 요소의 textContent 를
 *    «통째로» 갈아끼워 아이콘·자식이 날아간다(CLAUDE.md 「아이콘 버튼에 달았더니」).
 *    그래서 이 파일이 언어 변화를 직접 듣고 자기 줄만 다시 쓴다.
 */
(function ctaStatus() {
  'use strict';

  var ROW = 'hero-member';
  var SUB = 'mgcs-sub';                 // 우리가 만든 줄
  var TODAY_CACHE = 'mgcs_today_v1';    // 세션 안에서만 재사용(5분)
  var CACHE_MS = 5 * 60 * 1000;

  function L() { try { return (window.getLang ? window.getLang() : 'ko') !== 'en'; } catch (e) { return true; } }
  function row() { return document.getElementById(ROW); }
  function shown(el) { return !!(el && el.offsetParent !== null); }

  function style() {
    if (document.getElementById('mgcs-style')) return;
    var st = document.createElement('style');
    st.id = 'mgcs-style';
    /* ⛔ 이 줄에 `opacity` 를 넣지 마세요 — 그 요소를 통째로 흐리게 만들어 대비를 떨어뜨립니다.
       [잰 것 — 2026-09-09 브라우저] opacity:.8 이면 골드 그라데이션의 «가장 어두운 끝»
       rgb(217,119,6) 에서 대비 4.12:1 로 기준(작은 글자 4.5)에 미달했습니다. 빼니 5.46:1.
       가운데정렬이라 평소엔 5점대여서 «가끔 멀쩡» 해 보입니다 — 줄이 길어지면 그 구간에 걸립니다.
       위계는 «크기»(11px 대 16px)로 냅니다. ⛔ 색도 못 박지 마세요(버튼 색이 바뀌면 글자만 안 읽힙니다).
       🪤 그리고 이 주석을 «문자열 사이» 에 넣지 마세요 — 「따옴표 + 블록주석 + 따옴표」는 단항 +가 되어
          `'aNaN'` 이 되고 CSS 규칙이 통째로 깨집니다. 실제로 한 번 그렇게 짜서, 변이시험이
          「고쳤는데 되돌려도 통과」로 그것을 드러냈습니다. */
    /* ⚠️ `.ai-cta-row > *` 가 gap:8px · inline-flex 한 줄이라, 우리 줄을 그냥 넣으면
       아이콘 옆에 나란히 붙는다. flex-wrap 으로 둘째 줄로 내리고 세로 gap 만 0 으로 만든다.
       선택자에 #hero-member 를 붙여 그 규칙(0,1,0)을 특정성으로 이긴다 — !important 를 쓰지 않는다. */
    st.textContent =
      '#' + ROW + ' > .mgcs-has-sub{flex-wrap:wrap;row-gap:0;height:auto}'
      + '#' + ROW + ' > .mgcs-has-sub > .' + SUB + '{flex:0 0 100%;text-align:center;'
      + 'font-size:11px;font-weight:700;line-height:1.25;letter-spacing:-.2px;'
      + 'margin-top:1px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
      + 'position:relative;z-index:1}'
      + '@media(max-width:640px){#' + ROW + ' > .mgcs-has-sub > .' + SUB + '{font-size:10px}}';
    document.head.appendChild(st);
  }

  /** 버튼에 우리 줄을 «있으면 고치고 없으면 만든다». text 가 비면 줄을 지운다. */
  function paint(btn, text) {
    if (!btn) return;
    var el = btn.querySelector('.' + SUB);
    if (!text) {
      if (el) { el.parentNode.removeChild(el); btn.classList.remove('mgcs-has-sub'); }
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.className = SUB;
      btn.appendChild(el);
      btn.classList.add('mgcs-has-sub');
    }
    /* textContent 로만 쓴다 — 강사 이름은 DB 값이라 innerHTML 로 붙이면 안 된다 */
    if (el.textContent !== text) el.textContent = text;
  }

  /* ── ① 수업 입장 — 아래 카드가 «이미 그려 놓은 것» 을 읽는다 ────────────── */
  function classSub() {
    var c = document.getElementById('next-class-countdown');
    if (!shown(c)) return '';                       // 오늘 수업이 없거나 아직 안 그려짐 → 안 그린다
    if (c.querySelector('.ncc-card.ncc-live')) return L() ? '지금 입장할 수 있어요' : 'You can join now';
    var s = c.querySelector('.ncc-sub');            // 「오전 6:00 · 강사 강선생님」
    var t = s ? String(s.textContent || '').replace(/\s+/g, ' ').trim() : '';
    return t.length > 40 ? t.slice(0, 39) + '…' : t;
  }

  /* ── ② 오늘의 A.i 학습 — /api/student/today 의 doneCount·steps ────────────
   *  ⚠️ 이 조회는 today.html 이 부르는 «같은» API 다. 홈에서 매번 부르지 않도록
   *     세션 안에서 5분 캐시한다(도구를 하나 끝내고 돌아오면 그 안에 갱신된다).
   *  ⚠️ 실패·미로그인·계획 없음은 전부 «모름» 이다 — 그때는 줄을 안 그린다. */
  var todayState = null;   // { dn, n } | null

  function todaySub() {
    if (!todayState || !todayState.n) return '';
    var left = todayState.n - todayState.dn;
    if (left <= 0) return L() ? '오늘 계획 완료 🎉' : 'All done today 🎉';
    return L() ? (todayState.n + '개 중 ' + left + '개 남음')
               : (left + ' of ' + todayState.n + ' left');
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(TODAY_CACHE);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || (Date.now() - (o.t || 0)) > CACHE_MS) return null;
      return { dn: o.dn | 0, n: o.n | 0 };
    } catch (e) { return null; }
  }

  function fetchToday() {
    var u = null;
    try { u = window.getCurrentUser ? window.getCurrentUser() : null; } catch (e) { u = null; }
    var uid = u && (u.uid || u.user_id || u.id);
    if (!uid) return;                               // 게스트 → 이 버튼 자체가 안 보인다
    var cached = readCache();
    if (cached) { todayState = cached; render(); return; }
    var tok = '';
    try { tok = localStorage.getItem('mango_token') || ''; } catch (e) {}
    fetch('/api/student/today?uid=' + encodeURIComponent(uid) + '&token=' + encodeURIComponent(tok),
          { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        /* ⛔ «성공이라고 말했는가» 로 판정한다 — 종단 404 본문에는 ok 칸이 아예 없어
           `d.ok === false` 로만 보면 그냥 통과한다(CLAUDE.md 「새 API 추가」 함정). */
        if (!d || d.ok !== true || !d.plan || !Array.isArray(d.plan.steps)) return;
        var n = d.plan.steps.length;
        if (!n) return;                             // 계획이 없는 날 → 안 그린다
        todayState = { dn: Math.max(0, Math.min(n, d.plan.doneCount | 0)), n: n };
        try { sessionStorage.setItem(TODAY_CACHE, JSON.stringify({ t: Date.now(), dn: todayState.dn, n: n })); } catch (e) {}
        render();
      })
      .catch(function () { /* 모르면 그냥 안 그린다 */ });
  }

  /* ── 그리기 ────────────────────────────────────────────────────────────── */
  function render() {
    var r = row();
    if (!shown(r)) return;                          // 비회원 히어로 → 우리 줄 없음
    style();
    paint(r.querySelector('.cta-enter'), classSub());
    paint(r.querySelector('.cta-pay'), todaySub());
  }

  /* ⏱ «끝이 있는» 확인 — 아래 카드가 늦게 그려지므로 몇 번만 다시 본다. 상주하지 않는다. */
  var WHEN = [300, 1200, 3000, 8000, 20000];
  function boot() {
    try { render(); } catch (e) {}
    for (var i = 0; i < WHEN.length; i++) {
      setTimeout(function () { try { render(); } catch (e) {} }, WHEN[i]);
    }
    try { fetchToday(); } catch (e) {}
  }

  /* 🌐 언어 전환 — 관리자 화면은 document, 홈은 window 에서 쏜다. 둘 다 듣는다
     (CLAUDE.md 「mangoi:lang-changed 를 듣게 해 뒀는데 한 번도 안 불림」). */
  ['mangoi:lang-changed', 'mangoi:langchange'].forEach(function (ev) {
    try { window.addEventListener(ev, function () { try { render(); } catch (e) {} }); } catch (e) {}
    try { document.addEventListener(ev, function () { try { render(); } catch (e) {} }); } catch (e) {}
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
