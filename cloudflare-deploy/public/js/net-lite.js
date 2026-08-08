/*!
 * net-lite.js — 「좁은 회선·싼 폰」 자동 절약 장치 (2026-08-08)
 * ═══════════════════════════════════════════════════════════════════════════
 * 왜 만들었나
 *   필리핀 강사·매니저가 쓰는 회선은 대역폭보다 «지연과 손실»이 문제고,
 *   기기는 대개 저사양 안드로이드다. 그런데 관리자 계열 화면에는
 *   1.5~2초마다 영원히 도는 타이머가 20개 넘게 살아 있다.
 *
 *   실측(2026-08-08, admin.html):
 *     setInterval  500ms×2 · 600ms×2 · 1000ms×2 · 1500ms×8 · 2000ms×6 · …
 *
 *   그런데 이것들은 성격이 두 가지로 갈린다 —
 *     ⓐ 네트워크 폴러  : 타이머 안에서 fetch/XHR 을 쏜다. 좁은 회선을 갉아먹는다.
 *     ⓑ UI 보정 루프   : 색·정렬을 다시 칠하기만 한다. 회선은 안 쓰고 CPU·배터리를 태운다.
 *
 *   정적 분석으로는 못 가른다(이름만 넘기는 호출이 대부분). 그래서 **실행 중에 관찰**한다.
 *   타이머 콜백이 도는 동안 fetch/XHR 이 나갔으면 ⓐ, 한 번도 안 나갔으면 ⓑ 로 표시해 두고
 *   각각 다르게 늦춘다.
 *
 * 무엇을 하나
 *   · 숨은 탭         → ⓐⓑ 모두 늦춘다. 아무도 안 보므로 부작용이 없다.
 *   · 느린 회선 + ⓐ   → 늦춘다. 폴링이 정작 필요한 요청과 대역폭을 다투지 않게.
 *   · 느린 회선 + ⓑ   → 늦추지 않는다. 화면이 늦게 칠해지면 «고장 난 것처럼» 보인다.
 *   · 다시 보이면     → 원래 주기로 즉시 복구하고, ⓑ 는 그 자리에서 한 번 실행해
 *                        돌아온 순간 화면이 이미 맞게 칠해져 있도록 한다.
 *
 * 안 하는 것 (일부러)
 *   · 200ms 미만은 건드리지 않는다 — 애니메이션·짧은 폴백 루프다.
 *   · 10분 초과도 건드리지 않는다 — 이미 충분히 느리다.
 *   · ⓐ 를 «다시 보일 때 몰아서 호출»하지 않는다. 좁은 회선에서 20개가 동시에 터진다.
 *     다음 주기를 기다리면 된다(길어야 몇 초).
 *   · rAF·CSS transition 은 손대지 않는다.
 *
 * 함정 메모
 *   · 이 파일은 **다른 스크립트보다 먼저, defer 없이** 실려야 한다.
 *     늦게 실리면 그 전에 등록된 타이머는 영영 못 잡는다.
 *   · iOS Safari 에는 navigator.connection 이 **아예 없다.** 그래서 회선 판정을
 *     실제 리소스 전송 실적(Resource Timing)으로 대신 계산한다.
 *   · clearInterval 은 우리가 돌려준 id 로 들어온다. 내부에서 실제 id 를 바꿔 달기 때문에
 *     반드시 매핑을 거쳐 지워야 한다. 안 그러면 «지웠는데 계속 도는» 유령 타이머가 남는다.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__netLite) return;                  // 두 번 실리는 것 방지

  var W = window;
  var origSet = W.setInterval;
  var origClearI = W.clearInterval;
  var origClearT = W.clearTimeout;

  var MIN_MS = 200;            // 이보다 짧으면 손대지 않는다 (애니메이션·폴백)
  var MAX_MS = 10 * 60 * 1000; // 이보다 길면 손대지 않는다 (이미 느림)
  var CAP_MS = 30 * 1000;      // 아무리 늘려도 30초를 넘기지 않는다

  var recs = Object.create(null);   // publicId → 기록
  var netDepth = 0;                 // 지금 도는 콜백이 네트워크를 썼는지 감시하는 카운터
  var sawNetwork = false;

  // ── 회선 판정 ────────────────────────────────────────────────────────────
  //   0 = 빠름 / 1 = 보통 / 2 = 느림
  var slowLevel = 0;

  function median(a) { if (!a.length) return 0; a.sort(function (x, y) { return x - y; }); return a[a.length >> 1]; }

  function measureFromResourceTiming() {
    // 실제로 받아 본 실적으로 회선을 판정한다.
    //
    //   🪤 처음엔 «바이트 ÷ 각 요청의 duration 합» 으로 쟀다. 틀렸다.
    //      요청 80개가 «동시에» 돌면 겹치는 시간을 80번 더하게 되어, 아무리 빨라도 느리게 나온다.
    //      → 실제 걸린 «구간(span)» 으로 나눠야 진짜 처리량이다.
    //
    //   🪤 그리고 대역폭만 봐도 틀린다. 실측(2026-08-08)에서 admin.html 은 압축 950KB 인데
    //      400KB/s 회선에서 **23초** 걸렸다. 순수 전송은 2~3초다. 나머지는 전부 «기다림»이다.
    //      필리핀에서 아픈 건 굵기가 아니라 **한 번 왕복에 걸리는 시간**이다.
    //      → 응답 대기시간(TTFB) 중앙값을 함께 본다. 둘 중 나쁜 쪽을 택한다.
    try {
      var list = performance.getEntriesByType('resource');
      var bytes = 0, first = Infinity, last = 0, ttfbs = [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e.transferSize || e.transferSize < 1000) continue;  // 캐시 히트·초소형 제외
        bytes += e.transferSize;
        if (e.startTime < first) first = e.startTime;
        if (e.responseEnd > last) last = e.responseEnd;
        // requestStart 는 교차출처면 0 이다 — 그 경우 표본에서 뺀다
        if (e.requestStart > 0 && e.responseStart > e.requestStart) ttfbs.push(e.responseStart - e.requestStart);
      }
      if (bytes < 30000 || !(last > first)) return null;         // 표본이 모자라면 판단 보류

      var lvl = 0;
      var kbps = (bytes / 1024) / ((last - first) / 1000);
      if (kbps < 50) lvl = 2;
      else if (kbps < 150) lvl = 1;

      if (ttfbs.length >= 5) {
        var t = median(ttfbs);
        if (t >= 450 && lvl < 2) lvl = 2;
        else if (t >= 220 && lvl < 1) lvl = 1;
      }
      return lvl;
    } catch (e) { return null; }
  }

  function evaluate() {
    var lvl = 0;
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c) {
      if (c.saveData === true) lvl = 2;                       // 사용자가 «데이터 절약»을 켰다 = 명시적 의사
      var t = String(c.effectiveType || '');
      if (t === 'slow-2g' || t === '2g') lvl = 2;
      else if (t === '3g' && lvl < 1) lvl = 1;
      if (typeof c.rtt === 'number' && c.rtt >= 500 && lvl < 2) lvl = 2;
      else if (typeof c.rtt === 'number' && c.rtt >= 270 && lvl < 1) lvl = 1;
    }
    // 🪤 (2026-08-08) 처음엔 navigator.connection 이 «있으면» 그것만 믿었다. 그런데
    //    이 API 는 **회선의 이름표**를 말할 뿐 실제 속도를 말하지 않는다.
    //    필리핀에서 흔한 «표시는 4G/WiFi 인데 실속도는 형편없는» 경우를 통째로 놓친다.
    //    그래서 실제로 받아 본 실적과 **둘 중 나쁜 쪽**을 택한다.
    var m = measureFromResourceTiming();
    if (m !== null && m > lvl) lvl = m;

    if (lvl !== slowLevel) {
      slowLevel = lvl;
      reschedule();
      try {
        if (lvl > 0) console.info('[net-lite] 느린 회선 감지(level ' + lvl + ') — 네트워크 폴링 주기를 늘립니다');
      } catch (e) { }
    }
  }

  // ── 유효 주기 계산 ───────────────────────────────────────────────────────
  function effective(rec) {
    var d = rec.base;
    if (document.hidden) {
      // 숨은 탭 — 보는 사람이 없으니 ⓐⓑ 가리지 않고 늦춘다.
      d = Math.max(d * 5, 5000);
    } else if (rec.net && slowLevel > 0) {
      // 보이는 중 + 네트워크 폴러 + 느린 회선.
      // UI 보정 루프(rec.net === false)는 여기서 걸리지 않는다 — 늦추면 «고장 난 화면»이 된다.
      d = d * (slowLevel === 2 ? 4 : 2);
    }
    if (d > CAP_MS) d = CAP_MS;
    if (d < rec.base) d = rec.base;
    return d;
  }

  function arm(rec) {
    var delay = effective(rec);
    rec.cur = delay;
    rec.real = origSet.call(W, function () { tick(rec); }, delay);
  }

  function tick(rec) {
    // 콜백이 도는 동안 네트워크가 나갔는지 관찰한다 → ⓐ/ⓑ 분류
    var before = sawNetwork;
    sawNetwork = false;
    netDepth++;
    try {
      rec.fn.apply(W, rec.args);
    } catch (e) {
      try { console.warn('[net-lite] 타이머 콜백 오류', e); } catch (_) { }
    } finally {
      netDepth--;
      if (sawNetwork) rec.net = true;   // 한 번이라도 네트워크를 썼으면 영구히 ⓐ 로 본다
      sawNetwork = before;
    }
    // 주기가 바뀌어야 하면 다시 건다 (setInterval 은 주기를 못 바꾸므로)
    if (rec.dead) return;
    var want = effective(rec);
    if (want !== rec.cur) {
      origClearI.call(W, rec.real);
      arm(rec);
    }
  }

  function reschedule() {
    for (var k in recs) {
      var rec = recs[k];
      if (rec.dead) continue;
      var want = effective(rec);
      if (want !== rec.cur) {
        origClearI.call(W, rec.real);
        arm(rec);
      }
    }
  }

  // ── setInterval / clearInterval 갈아끼우기 ───────────────────────────────
  W.setInterval = function (fn, delay) {
    // 문자열 콜백(eval 형)·범위 밖 주기는 원본 그대로 흘려보낸다.
    if (typeof fn !== 'function') return origSet.apply(W, arguments);
    var d = Number(delay) || 0;
    if (d < MIN_MS || d > MAX_MS) return origSet.apply(W, arguments);

    var rec = {
      fn: fn,
      args: Array.prototype.slice.call(arguments, 2),
      base: d,
      net: false,      // 아직 모름 → 첫 실행에서 관찰한다
      dead: false
    };
    arm(rec);
    rec.publicId = rec.real;      // 처음 잡힌 진짜 id 를 «대표 번호»로 돌려준다
    recs[rec.publicId] = rec;
    return rec.publicId;
  };

  function kill(id) {
    var rec = recs[id];
    if (!rec) return false;
    rec.dead = true;
    origClearI.call(W, rec.real);
    delete recs[id];
    return true;
  }
  W.clearInterval = function (id) { if (kill(id)) return; return origClearI.apply(W, arguments); };
  // 실수로 clearTimeout 을 쓰는 코드도 있다 — 같이 받아준다.
  W.clearTimeout = function (id) { if (kill(id)) return; return origClearT.apply(W, arguments); };

  // ── 네트워크 관찰기 + 「동시 중복 GET 합치기」 (fetch) ────────────────────
  //
  //   실측(2026-08-08, admin.html 첫 화면): API 요청 72건인데 고유 주소는 31개였다.
  //   특히 /api/admin/students/erp-list?limit=2000 (학생 2,000명 명부)이 **5개가 동시에** 나갔다.
  //   카드 세 곳이 각자 «내가 필요하니 내가 받는다» 로 짜여 있어서다.
  //   같은 순간에 나가는 똑같은 GET 은 어차피 같은 답이 온다. 하나만 보내고 나눠 주면 된다.
  //
  //   ⚠️ 이건 «캐시»가 아니다. 이미 날아가고 있는 요청에만 올라탄다(in-flight).
  //      응답이 끝나면 즉시 잊는다. 그래서 «수정하고 새로고침했더니 옛날 값» 같은 사고가 없다.
  //   ⚠️ 안 합치는 것 — POST/PUT/DELETE(부작용이 있다), 다른 출처(외부 API),
  //      AbortController 가 달린 요청(한쪽을 취소하면 다른 쪽까지 죽는다).
  var inflight = Object.create(null);
  var coalesced = 0;
  if (typeof W.fetch === 'function') {
    var origFetch = W.fetch;
    W.fetch = function (input, init) {
      if (netDepth > 0) sawNetwork = true;

      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var url = String((input && input.url) || input || '');
      var sameOrigin = (url.indexOf('://') < 0) || (url.indexOf(location.origin + '/') === 0);
      var hasSignal = !!((init && init.signal) || (input && input.signal));

      if (method !== 'GET' || !sameOrigin || hasSignal || !url) {
        return origFetch.apply(this, arguments);
      }

      var key = url;
      var pending = inflight[key];
      if (pending) {
        coalesced++;
        // 같은 답을 각자 «따로» 읽을 수 있게 복제해서 준다.
        return pending.then(function (res) { return res.clone(); });
      }

      var p = origFetch.apply(this, arguments).then(function (res) {
        // 원본은 아무도 읽지 않은 상태로 두고, 부르는 쪽마다 복제본을 준다.
        return res;
      });
      inflight[key] = p;
      var forget = function () { delete inflight[key]; };
      p.then(forget, forget);
      return p.then(function (res) { return res.clone(); });
    };
  }
  try {
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () { if (netDepth > 0) sawNetwork = true; return origSend.apply(this, arguments); };
  } catch (e) { }

  // ── 탭 전환 ─────────────────────────────────────────────────────────────
  //   ⚠️ 여기서 «미디어 트랙»을 만지지 않는다. 과거에 visibilitychange 로 카메라를 끄는
  //      코드가 강사 화면을 검게 만든 적이 있다. 이 파일은 타이머만 다룬다.
  document.addEventListener('visibilitychange', function () {
    reschedule();
    if (document.hidden) return;
    // 돌아온 순간 화면이 이미 맞게 칠해져 있도록, UI 보정 루프(ⓑ)만 즉시 한 번 돌린다.
    // 네트워크 폴러(ⓐ)는 몰아서 부르지 않는다 — 좁은 회선에서 동시에 터진다.
    for (var k in recs) {
      var rec = recs[k];
      if (rec.dead || rec.net) continue;
      try { rec.fn.apply(W, rec.args); } catch (e) { }
    }
  });

  // 회선 상태는 바뀐다 — 처음 한 번, 그리고 가끔 다시 잰다.
  //
  //   🪤 (2026-08-08) 처음엔 «load 이벤트 뒤에» 한 번만 쟀다. 그런데 느린 회선에서는
  //      load 가 **24초 뒤**에 온다. 정작 아껴야 할 그 24초 동안 «빠른 회선»으로 알고 있었다.
  //      느린 회선일수록 판정이 늦어지는 정반대 구조였다. → 로딩 «중»에 여러 번 잰다.
  evaluate();
  [700, 1500, 3000, 6000, 12000].forEach(function (t) { setTimeout(evaluate, t); });
  W.addEventListener('load', function () { setTimeout(evaluate, 500); });
  origSet.call(W, evaluate, 30000);
  try {
    var cc = navigator.connection;
    if (cc && cc.addEventListener) cc.addEventListener('change', evaluate);
  } catch (e) { }

  // 디버그·검증용
  W.__netLite = {
    level: function () { return slowLevel; },
    coalesced: function () { return coalesced; },   // 합쳐서 «안 보낸» 요청 수
    timers: function () {
      var out = [];
      for (var k in recs) out.push({ base: recs[k].base, now: recs[k].cur, net: recs[k].net });
      return out.sort(function (a, b) { return a.base - b.base; });
    },
    force: function (l) { slowLevel = l; reschedule(); return slowLevel; }
  };
})();
