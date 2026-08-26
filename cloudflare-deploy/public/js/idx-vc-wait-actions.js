// idx-vc-wait-actions.js — 「잠시만 기다려 주세요」 대기 카드 위의 교재 입구 (2026-08-24)
//
// [무엇이 문제였나] 안드로이드 폰으로 체험수업에 들어간 매니저 제보:
//   «라이브러리에서도, 폰 파일에서도 교재를 올릴 수가 없다».
//   화면은 「📚 라이브러리에서 교재를 선택하세요」라고 말하는데, 그 라이브러리로 가는
//   버튼이 폰 화면 안에 **하나도 없다.** 390×844 실측(2026-08-24, headless Chromium):
//     · 교재 툴바 `.pdf-controls` 는 ≤1024px 에서 `ph49-collapsed` → display:none
//       → 「📁 교재 업로드」·「📎 파일 업로드」·「📚 라이브러리」가 전부 안 보인다
//     · 탭바는 clientWidth 390 인데 scrollWidth 1865 —
//       「📚 교재도구 ▾」 칩은 x=735, 「📖 교재 고르기」(#vc-lib-open-btn)는 x=1157
//       → 둘 다 화면 밖. 옆으로 밀어야 나오는데 그걸 알 길이 없다
//     · 가로모드용 하단 폴더 바(vcFolderOpen('material'))는 세로에서 display:none
//   화면에 남는 유일한 입구는 「☰ 기능」 FAB 하나뿐인데, 그 이름만 보고 교재가 그 안에
//   있다고 알 수는 없다. CLAUDE.md 2장의 「탭바 칩이 x 659~870 이라 폰에서 안 보인다」와
//   같은 뿌리다 — 그때는 「📖 교재」 버튼만 맨 앞으로 되살렸고, 라이브러리·업로드 입구는
//   여전히 x≥735 에 남아 있었다.
//
// [고침] 교재가 없을 때 뜨는 그 대기 카드에 입구를 바로 붙인다. 강사가 «지금 보고 있는»
//   화면에 두는 것이라 폰이든 PC든 찾을 필요가 없다.
//
// [왜 별도 파일 + defer 인가] idx-vc-textbook.js 는 blocking 이고 index.html 의 첫 화면
//   예산 여유가 1,164바이트뿐이다(2026-08-24 실측). CLAUDE.md 함정표의 지시대로
//   «화상수업 기능은 별도 파일 + defer» 로 뺀다 — js/idx-vc-dupghost.js 와 같은 이유.
//
// ⚠️ 자체 타이머를 두지 않는다. 대기 카드는 idx-vc-textbook.js 가 600ms 마다
//    window.vcWaitCardSync() 로 갱신하므로 그 함수를 감싸 같은 틱에 얹는다
//    (홈에 머무는 학생 폰을 깨우는 상주 setInterval 을 늘리지 않는다 — CLAUDE.md).
(function(){
  'use strict';
  var BOX_ID = 'vc-wait-actions';

  /* 강사·관리자 판정은 정본(vcCanControlTextbook)을 쓴다 — 이 버튼이 부르는 두 함수가
     안에서 같은 판정으로 다시 거르므로, 여기서 다른 기준을 쓰면 «보이는데 거절당하는»
     버튼이 된다(CLAUDE.md 「버튼은 보이는데 누르면 거절」). */
  function staff(){
    try {
      return (typeof window.vcCanControlTextbook === 'function')
        ? !!window.vcCanControlTextbook()
        : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
    } catch(e){ return false; }
  }
  // 공통 언어 키는 mangoi_lang (mango_lang 은 구버전) — CLAUDE.md 함정표
  function isEn(){
    try { return String(localStorage.getItem('mangoi_lang') || '').toLowerCase().indexOf('en') === 0; }
    catch(e){ return false; }
  }

  /* ⚠️ 라벨은 «한 줄에 둘이 들어가는» 길이여야 한다. 「📚 라이브러리에서 고르기」처럼
     길면 390px 폰에서 두 줄로 접히고, 그만큼 카드 위를 비우다 보니 미스터망고와 안내문이
     266px 짜리 카드 밖으로 밀려 잘렸다(2026-08-24 실측: padTop 102px → 잘림).
     길이를 바꿀 때는 반드시 360·390px 에서 줄 수를 다시 재 볼 것. */
  var ITEMS = [
    { ko:'📚 교재 고르기', en:'📚 Choose textbook',
      bg:'linear-gradient(135deg,#3b82f6,#6366f1)',
      run:function(){ if (typeof window.openTextbookLibrary === 'function') window.openTextbookLibrary(); } },
    /* 📁 폰·PC 의 내 파일에서 바로. triggerUpload 가 숨은 #pdf-upload 를 그 자리에서
       click() 한다 — 사용자 제스처 안에서 동기로 불러야 안드로이드 크롬이 파일창을 연다.
       ⛔ setTimeout 으로 미루지 말 것. */
    { ko:'📁 내 파일 올리기', en:'📁 Upload a file',
      bg:'linear-gradient(135deg,#f59e0b,#d97706)',
      run:function(){ if (typeof window.triggerUpload === 'function') window.triggerUpload('pdf'); } }
  ];

  function build(card){
    var box = document.createElement('div');
    box.id = BOX_ID;
    /* ⚠️ #vc-wait-card 는 pointer-events:none 이다(아래 ◀▶ 화살표를 살리려고).
       그래서 이 상자와 버튼에 auto 를 되돌려 줘야 눌린다.
       ⚠️ 카드 «맨 위» 에 못 박는다 — 흐름대로 맨 아래에 두면 화면 아래쪽 떠 있는 것들이
          버튼 위에 얹힌다. 9점 실측(2026-08-24): 듀얼 시계 #mgWorldClock(left:8px,
          bottom:78px, z-index 2147483000)이 390·360·412 세로 전부에서 왼쪽 끝을 덮었고,
          가로 740×360 에서는 독의 «•••»(#vc-dock-more)가 버튼 «한가운데» 를 덮었다.
       ⛔ z-index 를 올려서 풀 수 없다 — #vc-wait-card 자체가 z-index:8 로 쌓임 맥락을
          만들어, 그 «안» 에서 아무리 올려도 바깥의 2147483000 을 못 이긴다.
          그래서 «겹치지 않는 자리» 로 옮기는 것이 유일한 해법이다(CLAUDE.md
          「떠 있는 창을 만들었더니 보이는데 안 눌린다」 함정과 같은 뿌리). */
    box.style.cssText = 'position:absolute;top:8px;left:8px;right:8px;'
                      + 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;'
                      + 'pointer-events:auto';
    ITEMS.forEach(function(it){
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'border:none;border-radius:999px;padding:10px 15px;font-size:13px;'
                      + 'font-weight:800;color:#fff;cursor:pointer;pointer-events:auto;'
                      + 'font-family:inherit;white-space:nowrap;background:' + it.bg + ';'
                      + 'box-shadow:0 4px 12px rgba(15,23,42,.28)';
      // 🌐 그릴 때 data-ko/data-en 도 함께 박는다 — textContent 로만 쓴 글자는
      //    🌐 를 눌러도 안 따라온다(CLAUDE.md 「JS 로 그린 라벨」 함정).
      b.setAttribute('data-ko', it.ko);
      b.setAttribute('data-en', it.en);
      b.textContent = isEn() ? it.en : it.ko;
      b.addEventListener('click', function(e){
        if (e && e.stopPropagation) e.stopPropagation();
        try { it.run(); } catch(_){}
      });
      box.appendChild(b);
    });
    card.appendChild(box);
    return box;
  }

  /* 띠가 흐름 밖(absolute)이라 카드 내용(미스터망고·안내문)은 그 자리를 모른다 →
     띠 높이만큼 카드 위쪽을 비워 준다. 좁은 폰에서는 버튼이 두 줄로 접히므로
     숫자를 박지 않고 실제 높이를 잰다. 값이 바뀔 때만 쓴다(600ms 틱 리페인트 방지). */
  function pad(card, box){
    try {
      var v = (box.offsetHeight + 14) + 'px';
      if (card.style.paddingTop !== v) card.style.paddingTop = v;
    } catch(e){}
  }

  function sync(){
    try {
      var card = document.getElementById('vc-wait-card');
      if (!card) return;
      var box = document.getElementById(BOX_ID);
      // 카드가 안 보이면(교재 도착·참관 모드·다른 탭) 버튼도 없다.
      var want = (card.style.display !== 'none') && staff();
      if (!want) {
        if (box && box.style.display !== 'none') box.style.display = 'none';
        if (card.style.paddingTop) card.style.paddingTop = '';
        return;
      }
      var made = false;
      if (!box) { box = build(card); made = true; }
      if (box.style.display !== 'flex') { box.style.display = 'flex'; made = true; }
      if (made || !card.style.paddingTop) pad(card, box);
      // 600ms 틱에서 도는 자리라 «값이 실제로 바뀔 때만» 쓴다(리페인트 방지).
      var en = isEn();
      for (var i = 0; i < box.children.length; i++) {
        var b = box.children[i];
        var t = en ? b.getAttribute('data-en') : b.getAttribute('data-ko');
        if (t && b.textContent !== t) b.textContent = t;
      }
    } catch(e){}
  }

  /* 화면이 돌아가거나 폭이 바뀌면 줄 수가 달라진다 → 그때만 다시 잰다.
     ⛔ 상주 setInterval 로 재지 않는다(홈에 머무는 폰을 계속 깨운다 — CLAUDE.md). */
  function remeasure(){
    try {
      var card = document.getElementById('vc-wait-card');
      var box = document.getElementById(BOX_ID);
      if (card && box && box.style.display === 'flex') pad(card, box);
    } catch(e){}
  }
  var _reT = 0;
  function later(ms){ try { clearTimeout(_reT); _reT = setTimeout(remeasure, ms); } catch(e){} }
  try {
    window.addEventListener('resize', function(){ later(150); });          // 키보드 열림까지 합쳐 한 번만
    window.addEventListener('orientationchange', function(){ later(400); });
  } catch(e){}

  var prev = window.vcWaitCardSync;
  window.vcWaitCardSync = function(){
    var r;
    try { if (typeof prev === 'function') r = prev.apply(this, arguments); } catch(e){}
    sync();
    return r;
  };
  try { sync(); } catch(e){}
})();
