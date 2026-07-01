/* ============================================================================
 *  streak.js — 스픽식 "학습 불꽃 🔥" 공용 유틸 (클라이언트 우선 + 서버 동기화)
 * ----------------------------------------------------------------------------
 *  [이 파일이 하는 일]
 *   - 학생이 게임/퀴즈에서 "오늘 학습 달성"을 하면 연속 학습일(불꽃)을 갱신한다.
 *   - 자정(로컬 날짜) 기준: 어제 활동→+1 / 오늘 이미→유지 / 끊김→1 리셋 / 최고기록 갱신.
 *   - 즉시 동작은 localStorage 로 하고(오프라인/서버 없어도 OK),
 *     window.MANGOI_API_BASE 가 설정돼 있으면 FastAPI 백엔드
 *     (POST {API_BASE}/api/streak/complete-quiz) 로도 조용히 동기화한다.
 *
 *  [기존 망고아이와의 관계 — 중요]
 *   - 이 "학습 불꽃"은 Workers의 기존 "출석 스트릭(/api/streak/status·check-in)"과
 *     다른 개념이라, 서버 경로 충돌을 피하려 기본은 localStorage 로만 동작한다.
 *   - student_id 는 로그인 사용자(mango_user.user_id)가 있으면 그대로 쓰고,
 *     없으면 안정적인 익명 id(mangoi_anon_id)를 만들어 재사용한다.
 *
 *  [사용법]
 *   <script src="/js/streak.js" defer></script>
 *   MangoiStreak.complete('game');                 // 오늘 학습 달성 기록(불꽃 갱신)
 *   MangoiStreak.mountBadge(el, {compact:true});   // 🔥 배지 UI 부착(자동 갱신)
 *   MangoiStreak.getStatus();                       // { current, longest, todayDone, last }
 * ========================================================================== */
(function (global) {
  'use strict';

  var LS_STREAK = 'mangoi_learn_streak';   // 불꽃 상태 저장 키
  var LS_ANON = 'mangoi_anon_id';          // 익명 학생 id 저장 키

  /* ── 날짜 유틸: 로컬 자정 기준 'YYYY-MM-DD' 문자열 ───────────────── */
  function ymd(d) {
    var y = d.getFullYear();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  function todayStr() { return ymd(new Date()); }
  function yesterdayStr() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return ymd(d);
  }

  /* ── 학생 식별자: 로그인 유저 우선, 없으면 안정적 익명 id ─────────── */
  function getStudentId() {
    try {
      var u = JSON.parse(localStorage.getItem('mango_user') || 'null');
      if (u && u.user_id) return String(u.user_id);
    } catch (e) {}
    var anon = localStorage.getItem(LS_ANON);
    if (!anon) {
      anon = 'anon_' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(LS_ANON, anon); } catch (e) {}
    }
    return anon;
  }

  /* ── 저장된 불꽃 상태 읽기(없으면 초기값) ───────────────────────── */
  function readState() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_STREAK) || 'null');
      if (s && typeof s.current === 'number') return s;
    } catch (e) {}
    return { current: 0, longest: 0, last: null };
  }
  function writeState(s) {
    try { localStorage.setItem(LS_STREAK, JSON.stringify(s)); } catch (e) {}
  }

  /* ── 외부에서 조회하는 현재 상태(오늘 완료 여부 포함) ───────────── */
  function getStatus() {
    var s = readState();
    return {
      current: s.current || 0,
      longest: s.longest || 0,
      last: s.last || null,
      todayDone: s.last === todayStr()
    };
  }

  /* ── API_BASE 결정: window 전역 또는 localStorage 설정 ──────────────
     기본값은 '' (빈 문자열) = 같은 오리진 상대경로. 라이브(test.mangoi.co.kr)에서는
     정적 페이지와 API 를 같은 워커가 서빙하므로 별도 설정 없이 서버 동기화가 동작한다.
     (백엔드가 없는 환경이면 fetch 가 조용히 실패 → localStorage 로만 동작) */
  function getApiBase() {
    if (global.MANGOI_API_BASE) return String(global.MANGOI_API_BASE).replace(/\/$/, '');
    try {
      var b = localStorage.getItem('mangoi_api_base');
      if (b) return String(b).replace(/\/$/, '');
    } catch (e) {}
    return '';                         // '' = 같은 오리진(/api/streak/...)
  }

  /* ── 서버 동기화: 같은 오리진(또는 지정 API_BASE)으로 조용히 POST ── */
  function syncToServer() {
    var base = getApiBase();           // '' 이면 상대경로 = 같은 오리진
    try {
      fetch(base + '/api/streak/complete-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: getStudentId() })
      }).catch(function () { /* 서버 없거나 꺼져 있어도 무시(로컬로 동작) */ });
    } catch (e) {}
  }

  /* ── 핵심: 오늘 학습 달성 기록 → 불꽃 갱신 ──────────────────────── */
  function complete(source) {
    var s = readState();
    var today = todayStr();
    var yday = yesterdayStr();
    var changed = false;

    if (s.last === today) {
      // 오늘 이미 달성 → 유지(중복 카운트 방지)
      changed = false;
    } else if (s.last === yday) {
      // 어제 활동 → 연속 성공
      s.current = (s.current || 0) + 1;
      changed = true;
    } else {
      // 처음이거나 이틀 이상 끊김 → 1로 리셋
      s.current = 1;
      changed = true;
    }
    if (changed) {
      s.last = today;
      if (s.current > (s.longest || 0)) s.longest = s.current;
      writeState(s);
      syncToServer();
      celebrate(s.current);            // 올랐을 때만 축하 애니메이션
    }
    // UI들이 즉시 갱신되도록 이벤트 방송(변화 없어도 배지 상태 최신화)
    broadcast();
    return { changed: changed, current: s.current, longest: s.longest, source: source || '' };
  }

  /* ── 상태 변경 방송: 부착된 모든 배지가 스스로 갱신 ─────────────── */
  function broadcast() {
    try {
      global.dispatchEvent(new CustomEvent('mangoi-streak-updated', { detail: getStatus() }));
    } catch (e) {}
  }

  /* ── 배지 HTML 만들기(현재/오늘완료 반영) ───────────────────────── */
  function badgeHtml(compact) {
    var st = getStatus();
    var active = st.todayDone;         // 오늘 달성 → 활활, 미달성 → 흐리게
    var flameClass = active ? 'ms-flame ms-flame--on' : 'ms-flame';
    var num = st.current || 0;
    var label = compact ? (num + '일') : (num + '일 연속');
    var sub = active ? '오늘 달성! 🔥' : '오늘 학습하고 불꽃 유지!';
    return (
      '<span class="' + flameClass + '">🔥</span>' +
      '<span class="ms-txt"><b class="ms-num">' + num + '</b>' +
      '<span class="ms-lbl">' + (compact ? '일 연속' : '일 연속 학습') + '</span></span>' +
      (compact ? '' : '<span class="ms-sub">' + sub + '</span>')
    );
  }

  /* ── 배지 부착: 대상 엘리먼트에 렌더 + 자동 갱신 구독 ───────────── */
  function mountBadge(el, opts) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return;
    opts = opts || {};
    injectStyleOnce();
    el.classList.add('ms-badge');
    if (opts.compact) el.classList.add('ms-badge--compact');
    function render() { el.innerHTML = badgeHtml(!!opts.compact); }
    render();
    global.addEventListener('mangoi-streak-updated', render);
  }

  /* ── 올랐을 때 축하: 화면 중앙에 팝업 토스트 + 불꽃 튀는 연출 ────── */
  function celebrate(current) {
    injectStyleOnce();
    try {
      var pop = document.createElement('div');
      pop.className = 'ms-celebrate';
      pop.innerHTML =
        '<div class="ms-celebrate-flame">🔥</div>' +
        '<div class="ms-celebrate-num">' + current + '일 연속!</div>' +
        '<div class="ms-celebrate-sub">오늘도 학습 달성 🎉</div>';
      document.body.appendChild(pop);
      // 작은 불꽃 파티클 몇 개 튀기기
      for (var i = 0; i < 8; i++) {
        var sp = document.createElement('div');
        sp.className = 'ms-spark';
        var ang = (Math.PI * 2 * i) / 8;
        sp.style.setProperty('--dx', Math.cos(ang) * 90 + 'px');
        sp.style.setProperty('--dy', Math.sin(ang) * 90 + 'px');
        pop.appendChild(sp);
      }
      setTimeout(function () { pop.classList.add('ms-out'); }, 1500);
      setTimeout(function () { if (pop.parentNode) pop.parentNode.removeChild(pop); }, 2100);
    } catch (e) {}
  }

  /* ── 필요한 CSS를 한 번만 주입(외부 CSS 의존 없이 자립) ─────────── */
  var _styled = false;
  function injectStyleOnce() {
    if (_styled) return; _styled = true;
    var css =
      '.ms-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;' +
      'background:linear-gradient(135deg,rgba(249,115,22,.18),rgba(251,191,36,.14));' +
      'border:1px solid rgba(251,191,36,.4);color:#fde68a;font-family:inherit;line-height:1.1;' +
      'box-shadow:0 4px 14px -4px rgba(249,115,22,.4)}' +
      '.ms-badge--compact{padding:5px 10px;gap:5px;font-size:12px}' +
      '.ms-flame{font-size:22px;filter:grayscale(.7) opacity(.55);transition:filter .3s,transform .3s}' +
      '.ms-badge--compact .ms-flame{font-size:16px}' +
      '.ms-flame--on{filter:none;animation:ms-flicker 1.1s ease-in-out infinite}' +
      '@keyframes ms-flicker{0%,100%{transform:scale(1) rotate(-2deg)}50%{transform:scale(1.14) rotate(2deg)}}' +
      '.ms-txt{display:inline-flex;align-items:baseline;gap:4px;font-weight:800}' +
      '.ms-num{font-size:18px;color:#fbbf24}.ms-badge--compact .ms-num{font-size:14px}' +
      '.ms-lbl{font-size:12px;color:#fcd34d;font-weight:700}' +
      '.ms-sub{font-size:11px;color:#fca5a5;font-weight:600;margin-left:4px;opacity:.9}' +
      /* 축하 팝업 */
      '.ms-celebrate{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(.4);' +
      'z-index:99999;text-align:center;pointer-events:none;opacity:0;' +
      'animation:ms-pop .45s cubic-bezier(.2,1.4,.4,1) forwards}' +
      '.ms-celebrate.ms-out{animation:ms-fade .6s ease forwards}' +
      '@keyframes ms-pop{to{opacity:1;transform:translate(-50%,-50%) scale(1)}}' +
      '@keyframes ms-fade{to{opacity:0;transform:translate(-50%,-58%) scale(.9)}}' +
      '.ms-celebrate-flame{font-size:72px;line-height:1;filter:drop-shadow(0 6px 16px rgba(249,115,22,.6));' +
      'animation:ms-flicker .9s ease-in-out infinite}' +
      '.ms-celebrate-num{font-size:30px;font-weight:900;color:#fbbf24;margin-top:4px;' +
      'text-shadow:0 2px 10px rgba(0,0,0,.4)}' +
      '.ms-celebrate-sub{font-size:14px;font-weight:700;color:#fde68a;margin-top:2px}' +
      '.ms-spark{position:absolute;left:50%;top:34px;width:10px;height:10px;border-radius:50%;' +
      'background:radial-gradient(circle,#fde68a,#f97316);pointer-events:none;' +
      'animation:ms-spark .9s ease-out forwards}' +
      '@keyframes ms-spark{0%{transform:translate(-50%,-50%) scale(1);opacity:1}' +
      '100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(0);opacity:0}}';
    var tag = document.createElement('style');
    tag.setAttribute('data-mangoi-streak', '1');
    tag.textContent = css;
    (document.head || document.documentElement).appendChild(tag);
  }

  /* ── 전역 공개 API ──────────────────────────────────────────────── */
  global.MangoiStreak = {
    complete: complete,
    getStatus: getStatus,
    getStudentId: getStudentId,
    mountBadge: mountBadge,
    setApiBase: function (url) {
      try { localStorage.setItem('mangoi_api_base', String(url)); } catch (e) {}
    }
  };
})(window);
