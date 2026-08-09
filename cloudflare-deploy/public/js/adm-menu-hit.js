// ═══════════════════════════════════════════════════════════════════════════
// adm-menu-hit.js — 「어떤 메뉴가 실제로 쓰이나」를 잰다 (2026-08-08)
//
//   왜 —
//     관리자 메뉴를 87개에서 36개로 줄였는데, 그 배치의 근거가 인터뷰와 감이었다.
//     찾아보니 메뉴 클릭이 서버에 **한 번도 기록된 적이 없다.**
//     adm-quickmenu.js 의 «최근 사용 6개» 는 각자 브라우저 localStorage 에만 남아서
//     그 사람 화면 밖으로 나오지 않는다 — 회사는 아무것도 모른다.
//     2주만 쌓이면 「아무도 안 여는 메뉴」가 사실로 드러난다.
//
//   ⚠️ 클릭 이벤트를 듣지 않는다. 이 화면에서는 그게 안 되기 때문이다 —
//     adm-s10.js 가 window 캡처에서 사이드바 클릭을 stopImmediatePropagation 으로
//     삼키는 경우가 있고(모바일 폭 판정), 그러면 나중에 등록한 리스너는 영원히 0회다.
//     실제로 이 저장소에서 «요소에 직접 건 리스너가 발화하지 않는» 것을 실측했다.
//
//   그래서 «클릭» 대신 **결과** 두 가지를 본다. 어느 길로 왔든 결과는 같기 때문이다:
//     ① details 의 toggle 이벤트 — 카드가 열리는 «모든» 경로가 여기를 지난다
//        (사이드바·검색·자주쓰는기능·AI 명령 라우터·직접 스크롤 전부).
//        toggle 은 click 과 달리 아무도 가로채지 않는다.
//     ② window.mangoiIA6.select 감싸기 — 새 사이드바에서 «어느 항목» 을 골랐는지.
//        ①만으로는 카드는 알아도 «메뉴 항목» 단위를 모른다.
//
//   보내는 방식 —
//     모아서 보낸다. 클릭마다 요청을 날리면 필리핀 회선에서 그냥 낭비다.
//     10초마다, 그리고 탭을 떠날 때 sendBeacon 으로 한 번에.
//     ⚠️ beacon 은 Content-Type 을 우리 뜻대로 못 정할 때가 있어 서버가 본문을 직접 파싱한다.
//
//   개인정보 — **누가 눌렀는지는 보내지 않는다.** 카드 id·라벨·경로뿐이고
//   역할(role)은 서버가 세션에서 붙인다. 감시 도구가 되면 이 기능은 켜 둘 수 없다.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__admMenuHit) return;
  window.__admMenuHit = true;

  var URL_HIT = '/api/admin/menu-hit';
  var FLUSH_MS = 10000;     // 모아 보내는 주기
  var MAX_QUEUE = 40;       // 이만큼 쌓이면 주기를 기다리지 않고 보낸다
  var DEDUP_MS = 1500;      // 같은 카드가 «항목 선택 → 카드 열림» 으로 두 번 잡히는 것 방지

  var queue = [];           // {card, ko, via, n}
  var lastKey = '';
  var lastAt = 0;

  // ⚠️ 첫 몇 초는 세지 않는다.
  //   실측: 페이지가 뜨는 동안 다른 스크립트들이 카드 몇 장을 «스스로» 연다.
  //   그것까지 세면 **접속만 해도 같은 카드가 매번 쌓여** 순위가 그 카드로 굳는다.
  //   사람이 실제로 고른 것만 세야 「안 눌리는 메뉴」가 드러난다.
  var WARMUP_MS = 4000;
  var bootAt = Date.now();
  function warmingUp() { return (Date.now() - bootAt) < WARMUP_MS; }

  function record(card, ko, via) {
    if (!card || !/^card-[a-z0-9-]+$/.test(card)) return;
    var now = Date.now();
    // 같은 카드가 «사이드바 선택» 과 «카드 열림» 으로 연달아 잡히면 한 번만 센다.
    // 먼저 온 쪽(사이드바)이 더 의미 있는 정보라 그것을 남긴다.
    if (card === lastKey && (now - lastAt) < DEDUP_MS) return;
    lastKey = card; lastAt = now;

    for (var i = 0; i < queue.length; i++) {
      if (queue[i].card === card && queue[i].via === via) { queue[i].n++; return; }
    }
    queue.push({ card: card, ko: String(ko || '').slice(0, 60), via: via, n: 1 });
    if (queue.length >= MAX_QUEUE) flush();
  }

  function flush(useBeacon) {
    if (!queue.length) return;
    var body = JSON.stringify({ items: queue });
    queue = [];
    try {
      if (useBeacon !== false && navigator.sendBeacon) {
        // 탭을 떠나는 순간에도 확실히 나가는 유일한 방법
        navigator.sendBeacon(URL_HIT, body);
        return;
      }
    } catch (e) { /* 아래 fetch 로 */ }
    try {
      fetch(URL_HIT, { method: 'POST', body: body, credentials: 'same-origin', keepalive: true })
        .catch(function () { /* 계측 실패는 화면에 알릴 일이 아니다 */ });
    } catch (e) { /* 무시 */ }
  }

  // ── ① 카드가 열리는 모든 경로 ──────────────────────────────────────────
  //   toggle 은 버블링하지 않으므로 **캡처** 로 받는다.
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open) return;
    var id = d.id || '';
    if (id.indexOf('card-') !== 0) return;
    if (warmingUp()) return;                 // 화면이 뜨면서 스스로 열린 것 — 사람이 고른 게 아니다
    var s = d.querySelector('summary');
    record(id, s ? s.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '', 'card');
  }, true);

  // ── ② 새 사이드바에서 고른 «항목» ──────────────────────────────────────
  //   adm-ia6.js 가 늦게 로드될 수 있어 잠깐 기다렸다 감싼다.
  function wrapSelect(tries) {
    var ia6 = window.mangoiIA6;
    if (!ia6 || typeof ia6.select !== 'function') {
      if ((tries || 0) < 20) setTimeout(function () { wrapSelect((tries || 0) + 1); }, 300);
      return;
    }
    if (ia6.__hitWrapped) return;
    ia6.__hitWrapped = true;
    var orig = ia6.select;
    ia6.select = function (key) {
      try {
        // key = 'group:항목이름'. 대표 카드 id 를 찾아 함께 남긴다.
        var card = '', label = String(key || '');
        (ia6.groups || []).forEach(function (g) {
          (g.items || []).forEach(function (it) {
            if (g.key + ':' + it.ko === key && it.cards && it.cards[0]) card = it.cards[0];
          });
        });
        if (card) record(card, label, 'sidebar');
      } catch (e) { /* 계측이 이동을 막으면 안 된다 */ }
      return orig.apply(this, arguments);
    };
  }
  wrapSelect(0);

  // ── 보내기 시점 ────────────────────────────────────────────────────────
  setInterval(function () { flush(false); }, FLUSH_MS);
  // 탭을 닫거나 숨길 때 — pagehide 가 모바일에서 더 확실하다
  window.addEventListener('pagehide', function () { flush(true); }, { capture: true });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });
})();
