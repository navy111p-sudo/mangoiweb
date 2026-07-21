/* 🧭 idx-onboard.js — 첫 로그인 30초 온보딩 안내 (2026-07-21, 크몽 회의 결정 "처음 쓰는 사람이 헤맨다")
   조건: index.html 홈 화면 + 로그인 상태 + 이 기기에서 처음(localStorage mangoi_onboard_v1 없음).
   구성: 카드 3장(수업 입장 → AI와 친구하기 → 길찾기), 한/영(mangoi_lang), 닫으면 다시 안 나옴.
   원칙: 화상수업 화면에서는 절대 표시하지 않는다. 실패는 조용히 무시. */
(function () {
  'use strict';
  var KEY = 'mangoi_onboard_v1';

  function lang() {
    try { return (localStorage.getItem('mangoi_lang') || 'ko').indexOf('en') === 0 ? 'en' : 'ko'; } catch (e) { return 'ko'; }
  }
  function loggedIn() {
    try { return !!(localStorage.getItem('mangoi_uid') || JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null')); } catch (e) { return false; }
  }
  function onHome() {
    try {
      if (/videocall/.test(location.hash)) return false;
      var call = document.getElementById('view-videocall-call');
      if (call && call.offsetParent !== null) return false;
      var lobby = document.getElementById('view-videocall-lobby');
      if (lobby && lobby.offsetParent !== null) return false;
      return true;
    } catch (e) { return false; }
  }

  var SLIDES = [
    { icon: '📺',
      ko: { t: '수업 입장은 여기!', d: '수업 시간이 되면 가운데 「수업 입장」 버튼을 누르세요. 오늘 내 수업이 자동으로 준비되어 있어요.' },
      en: { t: 'Enter your class here!', d: 'When it’s class time, press the "Enter Class" button in the middle. Today’s class is prepared for you automatically.' } },
    { icon: '🤖',
      ko: { t: 'AI와 친구하기', d: '「AI와 친구하기」에서 AI 친구와 영어 수다, 게임, 발음 연습, 판단력 훈련까지 — 매일 조금씩 하면 실력이 쑥쑥!' },
      en: { t: 'Play with AI', d: 'In "Play with AI": chat with your AI friend, play games, practice pronunciation, and train judgment — a little every day goes a long way!' } },
    { icon: '🧭',
      ko: { t: '길을 잃으면?', d: '왼쪽 메뉴를 열거나, 화면의 MANGO AI 검색창에 말로 물어보세요. "숙제 어디서 해?"라고 치면 바로 데려다줘요.' },
      en: { t: 'Lost?', d: 'Open the left menu, or just ask the MANGO AI search bar. Type "Where is my homework?" and it takes you right there.' } }
  ];

  function show() {
    var L = lang(), idx = 0;
    var ov = document.createElement('div');
    ov.id = 'mangoi-onboard';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(10,10,20,.62);display:flex;align-items:center;justify-content:center;padding:20px;';
    var card = document.createElement('div');
    card.style.cssText = 'max-width:340px;width:100%;background:#fffdf7;border:2px solid #f59e0b;border-radius:18px;padding:22px 20px 16px;text-align:center;font-family:inherit;box-shadow:0 12px 40px rgba(0,0,0,.35);';
    ov.appendChild(card);

    function render() {
      var s = SLIDES[idx], t = s[L];
      var last = idx === SLIDES.length - 1;
      card.innerHTML =
        '<div style="font-size:44px;line-height:1">' + s.icon + '</div>' +
        '<div style="font-size:18px;font-weight:800;color:#92400e;margin:10px 0 6px">' + t.t + '</div>' +
        '<div style="font-size:14px;color:#374151;line-height:1.55;min-height:66px">' + t.d + '</div>' +
        '<div style="margin:12px 0 10px;color:#d1a054;font-size:12px;letter-spacing:3px">' +
          SLIDES.map(function (_, i) { return i === idx ? '●' : '○'; }).join(' ') + '</div>' +
        '<button id="mob-next" style="width:100%;padding:11px 0;border:0;border-radius:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;font-weight:800;font-size:15px;cursor:pointer">' +
          (last ? (L === 'ko' ? '시작하기! 🥭' : 'Let’s go! 🥭') : (L === 'ko' ? '다음' : 'Next')) + '</button>' +
        '<button id="mob-skip" style="margin-top:8px;background:none;border:0;color:#9ca3af;font-size:12px;cursor:pointer">' +
          (L === 'ko' ? '건너뛰기' : 'Skip') + '</button>';
      card.querySelector('#mob-next').onclick = function () {
        if (idx < SLIDES.length - 1) { idx++; render(); }
        else close('done');
      };
      card.querySelector('#mob-skip').onclick = function () { close('skip'); };
    }
    function close(how) {
      try { localStorage.setItem(KEY, how + ':' + Date.now()); } catch (e) {}
      try { if (window.UXT) window.UXT.hit('onboard:' + how); } catch (e) {}
      try { ov.remove(); } catch (e) { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    }
    render();
    document.body.appendChild(ov);
    try { if (window.UXT) window.UXT.hit('onboard:shown'); } catch (e) {}
  }

  function maybe() {
    try {
      if (localStorage.getItem(KEY)) return;
      if (!loggedIn()) return;           /* 로그인 후 첫 방문에만 */
      if (!onHome()) return;             /* 수업 화면에서는 금지 */
      if (document.getElementById('mangoi-onboard')) return;
      show();
    } catch (e) {}
  }

  /* 홈 로드 2.5초 후 1회 + 로그인 직후를 놓치지 않게 8초 후 재시도 1회 */
  try {
    setTimeout(maybe, 2500);
    setTimeout(maybe, 8000);
  } catch (e) {}
})();
