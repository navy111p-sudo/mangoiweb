/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   🎮 게임을 «허브 밖에서» 열었을 때만 나가는 문을 띄운다 (2026-09-01 사장님 지시)

   왜 필요한가
   - 학생 게임 16개는 게임 허브(student-games.html)가 <iframe> 으로 감싸 엽니다.
     그래서 게임 파일 자체에는 나가는 문이 없어도 됩니다 — 허브 좌상단의
     「← 게임 선택」이 그 역할을 합니다(2026-09-01 점검에서 실측).
   - 그런데 «게임 주소로 직접» 열면(북마크·카톡 링크·관리자 사이트 구성표) 그 문이
     없습니다. 화면은 멀쩡히 돌아가는데 나갈 길만 없습니다.

   ⛔ 리다이렉트로 «막지» 않습니다 — 관리자 사이트 구성표가 게임을 href 로 직접 열도록
      링크해 두었습니다(2026-09-01 실측: `admin/site-structure-map.html` **14개** ·
      `admin/site-structure-more.html` **16개** — 합쳐서 16개 전부). 되돌려보내면 그
      관리자 도구가 깨집니다. 게다가 «허브 안인가» 판정이 한 번이라도 틀리면 수업 중
      학생이 게임에서 튕겨나갑니다.
      (2026-09-01 사장님 선택: 「나갈 문을 준다」)

   ⚠️ 판정을 게임 16개에 복제하지 않으려고 이 파일 하나로 둡니다. 각 게임은
      이 파일을 script 태그 한 줄로만 싣습니다(?v= 는 자산원장이 관리 — 숫자를 여기 적지 않습니다).
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(function () {
  'use strict';
  if (window.__mangoiGameExit) return;
  window.__mangoiGameExit = true;

  var HUB = '/student-games.html';

  /* 허브 안(iframe)이면 아무것도 하지 않는다 — 그쪽에는 이미 「← 게임 선택」이 있다.
     ⚠️ 크로스오리진이면 window.top 접근이 던지므로 try 로 감싸고, 던지면 «남의 프레임
        안» 이라는 뜻이니 역시 아무것도 하지 않는다(우리 허브가 아니어도 마찬가지). */
  var standalone = true;
  try { standalone = (window.top === window.self); } catch (e) { standalone = false; }
  if (!standalone) return;

  /* 이미 나가는 문이 «보이는» 게임은 건드리지 않는다(shooter·battle-3d·p38-3d 등은
     자기 ← 버튼이 있고, 단독 실행일 때 게임 목록으로 가도록 이미 짜여 있다).
     ⚠️ back-nav.js 의 hasVisibleBack 과 같은 판정이다 — 그 파일을 여기서 싣지는 않는다.
        실으면 그쪽이 «보이는 ← 가 없다» 고 판단해 자기 동그란 ← 를 넣어 문이 둘이 된다. */
  function hasVisibleExit() {
    try {
      var els = document.querySelectorAll('a,button');
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || '').trim();
        if (!t) continue;
        var c = t.charAt(0);
        if ((c === '←' || c === '⬅' || c === '‹' ||
             /^(나가기|exit|back)/i.test(t)) && els[i].offsetParent !== null) return true;
      }
    } catch (e) {}
    return false;
  }

  /* 라벨은 «←» 하나다 — 글자를 붙이지 않는다.
     실측(2026-09-01, student-game-space-monster 390px): 「← 게임 목록」(98px)은 HUD 를
     피해 내려가도 **문제 문장**("고양이는 물고기를 좋아해요")의 왼쪽을 가렸다. 게임 화면은
     가로가 빠듯해서 «가리지 않는 폭» 이 사실상 34px 뿐이다.
     ⚠️ 이 저장소는 「아이콘만 두고 title 로 설명하지 말라」를 규칙으로 두고 있지만(폰에는
        hover 가 없다), 여기서는 **같은 화면의 다른 게임들이 이미 그렇게 하고 있다**
        (shooter·battle-3d 의 나가기 버튼이 «←» 하나다). 관례가 곧 설명인 자리다.
     ℹ️ 그래도 스크린리더용 aria-label 과 title 은 붙인다. */
  function title() {
    var en = false;
    try { en = (localStorage.getItem('mangoi_lang') === 'en'); } catch (e) {}
    return en ? 'Back to games' : '게임 목록으로';
  }

  function inject() {
    if (document.getElementById('mangoi-game-exit')) return;
    if (!document.body) return;
    if (hasVisibleExit()) return;

    var b = document.createElement('a');
    b.id = 'mangoi-game-exit';
    b.href = HUB;                     /* JS 가 죽어도 이 링크는 동작한다 */
    b.textContent = '←';
    b.title = title();
    b.setAttribute('aria-label', title());
    b.style.cssText = [
      /* 자리는 좌상단(사람이 나가는 문을 찾는 자리). 다만 게임 HUD 를 덮으면 아래로
         비켜선다 — 아래 avoidOverlap() 참고. 네 모서리를 다 재 본 근거는 그 함수 주석에. */
      /* z-index 는 A.i 상담사 위젯(#mangoi-widget)과 «같은 값» 이다 — 그 위젯 위에 겹치면
         「보이는데 안 눌린다」가 되므로 규칙상 한 칸 위(2147483001)까지만 허용된다.
         2026-09-01 실측: 이 16개 파일 중 그 위젯이나 #mg-fab-wrap 을 싣는 것은 0개라
         지금은 겹칠 일이 없다. ⚠️ 게임 화면에 그 위젯이 들어오면 이 값을 다시 재세요
         (판정은 document.elementsFromPoint 로 «맨 위가 누구인가»). */
      'position:fixed', 'top:10px', 'left:10px', 'z-index:2147483000',
      'display:inline-flex', 'align-items:center', 'justify-content:center',
      'width:34px', 'height:34px', 'padding:0', 'border-radius:99px',
      'font-family:inherit', 'font-size:17px', 'font-weight:800', 'line-height:1',
      'text-decoration:none', 'cursor:pointer',
      'background:rgba(20,33,59,0.92)', 'color:#fbbf24',
      'border:1px solid rgba(251,191,36,0.50)',
      'box-shadow:0 6px 18px -2px rgba(0,0,0,0.4)',
      '-webkit-backdrop-filter:blur(8px)', 'backdrop-filter:blur(8px)',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');
    document.body.appendChild(b);
    avoidOverlap(b);
  }

  /* 🔴 좌상단이 비어 있지 않은 게임이 있다 — 그때만 «아래로» 비켜선다.
     실측(2026-09-01, 390px): `student-game-space-monster` 는 상단이 폭 전체(0,0 390x49)
     점수·언어·소리 바여서 좌상단에 두면 **SCORE·0·LEVEL·1/6 네 칸을 덮었다.**
     ⛔ 그래서 좌«하»단으로 옮겨 봤더니 더 나빴다 — `avatar`(이 친구로 시작하기)·
        `escape-voice`(▶ 방에 들어가기)·`tank-battle`(💥 발사) 에서 **누를 수 있는 버튼**을
        덮었다. 글자를 덮는 것보다 탭 표적을 덮는 것이 나쁘다. 그래서 좌상단으로 되돌리고
        «가려질 때만 내려가기» 로 풀었다.

     🔴 «무엇을 덮었나» 는 요소 상자로 재면 안 된다 — 두 방향으로 다 틀린다.
        ① 가운데정렬 글자는 상자가 폭 전체라도 **글자는 가운데에만** 있다
           (space-monster 문장 상자 x=12..378 인데 글자는 x=137..253) → 덮지도 않았는데
           «덮었다» 로 읽고 쓸데없이 내려간다.
        ② 반대로 상자 «왼쪽 한 줄만» 찍어 보면(옛 판) escape-school·escape-zombie·
           escape-voice 의 「성공 0」, grammar-pizza·wordfighter 의 제목·점수처럼
           **오른쪽에 있는 글자를 통째로 놓친다** — 실측으로 5개 게임이 그 상태였다.
        ✅ 그래서 글자는 **텍스트 노드마다 Range.getClientRects()** 로 실제 글자 자리를 재고,
           누를 수 있는 것은 **상자 그대로**(상자가 곧 탭 표적) 센다.
     ⚠️ 화면 전체를 덮는 시작 오버레이·배경은 세지 않는다(장식이고 어느 모서리에나 있다).
     ⛔ 상주 감시로 계속 따라다니게 하지 않는다 — 한 번만 본다(홈을 멎게 한 전례). */
  function blockedBottom(b) {
    var B = b.getBoundingClientRect();
    function hits(r) {
      return !(B.right < r.left || B.left > r.right || B.bottom < r.top || B.top > r.bottom);
    }
    function usable(el) {
      if (!el || el === b || b.contains(el)) return null;
      var box = el.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      if (box.width > window.innerWidth * 0.7 && box.height > window.innerHeight * 0.5) return null;
      var cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return null;
      if (parseFloat(cs.opacity) < 0.05) return null;
      return box;
    }

    var lowest = 0;

    /* ① 누를 수 있는 것 — 상자가 곧 탭 표적이다 */
    var taps = document.querySelectorAll('a,button,[onclick],[role="button"]');
    for (var i = 0; i < taps.length; i++) {
      var tb = usable(taps[i]);
      if (tb && hits(tb) && tb.bottom > lowest) lowest = tb.bottom;
    }

    /* ② 글자 — 텍스트 노드의 «실제 글자 자리» 만 센다 */
    try {
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        if (!usable(n.parentElement)) continue;
        var rg = document.createRange();
        rg.selectNodeContents(n);
        var rects = rg.getClientRects();
        for (var j = 0; j < rects.length; j++) {
          if (hits(rects[j]) && rects[j].bottom > lowest) lowest = rects[j].bottom;
        }
      }
    } catch (e) {}

    return lowest;
  }

  /* 가리는 것이 있으면 그 아래로. 한 번 내려간 자리에 또 무언가 있을 수 있으니
     몇 번만 되풀이한다.
     ⚠️ 상한 160px 은 «844px 화면의 19% = 아직 위쪽» 이라는 뜻이다(390x844 실측 기준).
        더 내려가면 나가는 문이 화면 가운데로 와서, 가리는 것을 피한 이득보다 손해가 크다.
        ⛔ 이 숫자를 «대충» 정하지 말 것 — 처음에 120 으로 두었더니 grammar-pizza 가
           왼쪽 위를 y=132 까지 쓰고 있어서, 상한에 걸려 포기하고 **「🏷️ 성분 ON」 버튼을
           덮은 채 멈췄다**(누를 수 있는 것을 덮는 것이 가장 나쁘다). 실측으로 정한 값이다. */
  function avoidOverlap(b) {
    try {
      for (var k = 0; k < 5; k++) {
        var bottom = blockedBottom(b);
        if (!bottom) return;
        var next = Math.round(bottom + 8);
        if (next > 160 || next <= b.getBoundingClientRect().top) return;
        b.style.top = next + 'px';
      }
    } catch (e) {}
  }

  /* 게임이 자기 UI(시작 오버레이 등)를 그린 뒤에 판정해야 «이미 있는 ←» 를 볼 수 있다.
     ⛔ 상주 MutationObserver·setInterval 금지 — 홈 화면을 통째로 멎게 한 전례가 있다.
        처음 두 번만 본다. */
  function boot() { inject(); setTimeout(inject, 700); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 350); });
  } else {
    setTimeout(boot, 350);
  }
})();
