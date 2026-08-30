/* 🧭 (2026-08-28) test.mangoi.co.kr 로 들어온 사람에게 "잘못된 주소" 라는 것만 인지시킴.
   ⛔ 서버 리다이렉트가 아니고, 클릭 한 번으로 넘어가는 "바로가기" 버튼·링크도 일부러 안 둔다
   (사장님 결정 2026-08-28 — 그런 바로가기는 또 다른 문제를 만들 수 있어, 인지만 시키면 충분).
   그 이유의 배경: CLAUDE.md 0장에 이미 못 박혀 있듯 test.mangoi.co.kr 을 자동으로
   mangoi.ai 로 돌리면(또는 한 번의 클릭으로 옮기면) 그 도메인에 등록된 패스키(6건)가
   무효화되고 앱 사용자의 localStorage 로그인이 날아갈 수 있다 — 링크를 없애면 이 위험도
   함께 없어진다. 대상은 역할 구분 없이 test.mangoi.co.kr 로 들어온 사람 전원(학생·교사·
   관리자 모두 이제 mangoi.ai 만 쓰는 것이 맞다는 사장님 확인).
   닫으면 이 기기에서는 다시 안 뜬다(관리자 "환영 안내"와 같은 방식). */
(function(){
  'use strict';
  if (location.hostname !== 'test.mangoi.co.kr') return;
  try { if (localStorage.getItem('mangoi_legacy_domain_notice_dismissed') === '1') return; } catch(e){}
  if (document.getElementById('mg-legacy-domain-notice')) return;

  function isEn(){
    try { if (typeof window.getLang === 'function') return String(window.getLang()).toLowerCase().indexOf('en') === 0; } catch(e){}
    try { return String(localStorage.getItem('mangoi_lang') || document.documentElement.lang || 'ko').toLowerCase().indexOf('en') === 0; } catch(e){ return false; }
  }
  var en = isEn();

  var style = document.createElement('style');
  style.textContent = 'body.vc-in-call #mg-legacy-domain-notice{display:none!important}';
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'mg-legacy-domain-notice';
  box.setAttribute('style', 'position:fixed;top:16px;right:16px;z-index:2147482000;width:320px;max-width:86vw;background:rgba(15,23,42,0.72);backdrop-filter:blur(16px) saturate(140%);-webkit-backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(251,191,36,0.45);border-radius:16px;box-shadow:0 18px 50px -16px rgba(0,0,0,0.7);color:#fff;font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;padding:14px 14px 14px 16px');
  box.innerHTML =
    '<div style="display:flex;align-items:flex-start;gap:8px">'
    + '<div style="font-size:19px;line-height:1.3;flex:0 0 auto">⚠️</div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-size:13px;font-weight:800;color:#fcd34d;margin-bottom:5px">' + (en ? 'Wrong address' : '잘못된 주소로 접속했습니다') + '</div>'
    + '<div style="font-size:12px;color:#e2e8f0;line-height:1.5">' + (en ? 'This is an old address (test.mangoi.co.kr). Please use mangoi.ai instead.' : '이 주소(test.mangoi.co.kr)는 옛 주소입니다. mangoi.ai 로 접속해 주세요.') + '</div>'
    + '</div>'
    + '<button type="button" id="mg-legacy-domain-notice-x" aria-label="' + (en ? 'Close' : '닫기') + '" style="flex:0 0 auto;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.22);color:#fff;font-size:13px;font-weight:800;cursor:pointer;line-height:1">✕</button>'
    + '</div>';
  document.body.appendChild(box);

  /* 📐 (2026-08-30) 우상단은 «비어 있는 자리» 가 아니다 — 홈 첫 화면의 칩 한 줄
     (#ph50-chip-row: 🌤 밝기·⭐ 포인트·🌐 EN·🔐 관리자)이 바로 거기에 있다. 16px 에 그냥
     띄웠더니 실측(2026-08-30 헤드리스)에서 PC 는 밝기·포인트 칩을, 폰 390 은 EN·관리자 칩을
     통째로 덮었다 — 「보이는데 안 눌린다」 가 되는 자리다(CLAUDE.md 2장의 그 함정).
     ⛔ 칩을 옮기거나 배너를 화면 밖으로 밀지 않는다 — 비켜서는 쪽은 «나중에 온» 이 배너다.
     ⚠️ 칩 줄은 JS(ph50MoveChips)가 나중에 만든다 — 그래서 «지금» 재고, 그 줄이 생긴 뒤
        한 번 더 재고, 창 크기가 바뀌면 다시 잰다. ⛔ 상주 MutationObserver·setInterval 금지
        (body class 감시가 홈을 통째로 멎게 한 전력이 있다 — 같은 장). */
  var TOP_SEL = ['#ph50-chip-row', '#home-theme-toggle', '#points-chip', '#lang-toggle', '#admin-shortcut-chip', '#topUserBtn'];
  function place(){
    if (!box.parentNode) return;
    box.style.top = '16px';                      // 잰 값이 «지금 밀린 위치» 에 끌려가지 않게 먼저 되돌린다
    var bb = box.getBoundingClientRect();
    var bottom = 0;
    for (var i = 0; i < TOP_SEL.length; i++) {
      var el = document.querySelector(TOP_SEL[i]);
      if (!el) continue;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.top > 200) continue;                 // 위쪽 줄만 본다(본문 버튼까지 피하지는 않는다)
      /* 가로로 «내 자리와 겹치는» 것만 — 화면 폭으로 어림하면 폰에서 왼쪽 요소까지 걸려
         배너가 이유 없이 아래로 밀린다. 내 상자의 좌우와 실제로 겹치는지로 판정한다. */
      if (r.right <= bb.left || bb.right <= r.left) continue;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    var top = bottom > 0 ? Math.min(Math.round(bottom) + 10, 160) : 16;
    box.style.top = Math.max(16, top) + 'px';
  }
  place();
  setTimeout(place, 1200);      // 칩 줄이 만들어진 뒤 한 번 더 — 끝이 있는 확인(상주 아님)
  window.addEventListener('resize', place, { passive: true });

  function dismiss(){
    try { localStorage.setItem('mangoi_legacy_domain_notice_dismissed', '1'); } catch(e){}
    if (box.parentNode) box.parentNode.removeChild(box);
  }
  var x = document.getElementById('mg-legacy-domain-notice-x');
  if (x) { x.addEventListener('click', dismiss); x.addEventListener('touchend', function(ev){ ev.preventDefault(); dismiss(); }); }
})();
