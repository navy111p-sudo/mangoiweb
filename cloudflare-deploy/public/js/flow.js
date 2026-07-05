/* ============================================================
   flow.js — 학생 학습 흐름 연결기 (2026-07)
   각 기능(웜업·게임·화상수업·복습퀴즈·학생게임) 마지막 화면에서
   "다음은 어디로 이동할까요?" 메뉴를 띄우고, 눌러서 바로 이동.

   · 메뉴 5개 항목·번호는 항상 고정 (학생이 위치를 손으로 기억)
   · 방금 끝낸 기능에 맞춰 (추천) 배지만 자동으로 이동
   · 로그인은 전역(쿠키)이라 location.href 이동만으로 세션 유지

   사용법:  MangoFlow.open('quiz')   // 복습퀴즈 끝났을 때
   fromKey ∈ warmup | game | class | quiz
   ============================================================ */
(function (w, d) {
  if (w.MangoFlow) return;

  // 고정 메뉴 (순서·번호 고정). own = 이 항목이 '현재 기능'일 때 "다시"로 표시할 키
  var MENU = [
    { key: 'class', emoji: '🎥', label: '수업 입장',    again: '수업 다시 입장' },
    { key: 'quiz',  emoji: '🧠', label: '복습퀴즈',      again: '복습퀴즈 다시' },
    { key: 'game',  emoji: '🎮', label: '학생게임',      again: '학생게임 다시' },
    { key: 'rec',   emoji: '📼', label: '녹화 다시보기', again: '녹화 다시보기' },
    { key: 'exit',  emoji: '🚪', label: '나가기',        again: '나가기' }
  ];

  // 방금 끝낸 기능 → 추천 항목 (부드러운 순환: 웜업→게임→수업→복습→게임…)
  var REC = { warmup: 'game', game: 'class', class: 'quiz', quiz: 'game' };

  // 방금 끝낸 기능 → 메뉴에서 '나 자신'에 해당하는 항목(있으면 "다시"로 표기)
  var SELF = { game: 'game', quiz: 'quiz' };

  var FROM_LABEL = { warmup: 'AI 웜업', game: '학생게임', class: '화상수업', quiz: '복습퀴즈' };

  // 최상위 창(아이프레임 안에서 실행 시 상위창을 대상으로 이동) — 교차출처면 자기 자신
  function topWin() {
    try { return (w.top && w.top !== w.self) ? w.top : w; } catch (_) { return w; }
  }
  function nav(url) { var t = topWin(); try { t.location.href = url; } catch (_) { w.location.href = url; } }

  // 항목 클릭 시 이동 동작 (아이프레임/일반 페이지 모두 대응)
  function goTo(key) {
    close();
    var t = topWin();
    try {
      switch (key) {
        case 'class':
          // index.html(또는 상위창)이면 SPA 전환, 아니면 홈으로 이동하며 로비 요청
          if (typeof t.showView === 'function' && t.document.getElementById('view-videocall-lobby')) {
            t.showView('view-videocall-lobby');
            try { t.scrollTo(0, 0); } catch (_) {}
          } else {
            nav('/?go=class');
          }
          break;
        case 'quiz': nav('/review-quiz.html'); break;
        case 'game': nav('/student-games.html'); break;
        case 'rec':  nav('/parent.html'); break;   // 마이페이지 = 수업 녹화 보기
        case 'exit':
          if (typeof t.showView === 'function' && t.document.getElementById('view-home')) t.showView('view-home');
          else nav('/');
          break;
      }
    } catch (e) { try { nav('/'); } catch (_) {} }
  }

  function close() {
    var el = d.getElementById('mango-flow-overlay');
    if (el) el.parentNode && el.parentNode.removeChild(el);
    d.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= MENU.length) { e.preventDefault(); goTo(MENU[n - 1].key); }
  }

  function open(fromKey) {
    // 같은 출처 아이프레임 안이고 상위창에도 MangoFlow가 있으면, 전체화면 중앙에 뜨도록 상위창에 위임
    try {
      if (w.top && w.top !== w.self && w.top.MangoFlow && w.top.MangoFlow.open && w.top.MangoFlow !== w.MangoFlow) {
        w.top.MangoFlow.open(fromKey);
        return;
      }
    } catch (_) { /* 교차출처 → 아래에서 자기 창에 렌더 */ }
    close();
    var recKey = REC[fromKey] || null;
    var selfKey = SELF[fromKey] || null;
    var fromTxt = FROM_LABEL[fromKey] || '';

    var ov = d.createElement('div');
    ov.id = 'mango-flow-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', '다음 이동 선택');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.82);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;' +
      'align-items:center;justify-content:center;padding:20px;font-family:"Noto Sans KR",-apple-system,sans-serif;' +
      'animation:mgFlowFade .25s ease-out';
    ov.onclick = function (e) { if (e.target === ov) close(); };

    var rows = MENU.map(function (m, i) {
      var isRec = m.key === recKey;
      var label = (m.key === selfKey) ? m.again : m.label;
      var base = 'display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;' +
        'border-radius:14px;padding:14px 16px;margin:0;font-family:inherit;transition:transform .08s;';
      var style = isRec
        ? base + 'background:linear-gradient(135deg,rgba(56,189,248,.22),rgba(37,99,235,.28));' +
                 'border:2px solid #38bdf8;box-shadow:0 6px 20px -4px rgba(56,189,248,.5);'
        : base + 'background:rgba(30,41,59,.7);border:1px solid #334155;';
      var numColor = isRec ? '#38bdf8' : '#64748b';
      var labelColor = isRec ? '#e0f2fe' : '#e2e8f0';
      var labelWeight = isRec ? '800' : '700';
      var badge = isRec
        ? '<span style="margin-left:auto;background:#38bdf8;color:#08213a;font-size:12.5px;font-weight:800;' +
          'padding:4px 12px;border-radius:20px;white-space:nowrap">추천</span>'
        : '';
      return '<button class="mg-flow-row" data-key="' + m.key + '" style="' + style + '">' +
        '<span style="width:22px;flex:0 0 22px;font-size:15px;font-weight:800;color:' + numColor + '">' + (i + 1) + '</span>' +
        '<span style="font-size:22px;flex:0 0 26px">' + m.emoji + '</span>' +
        '<span style="font-size:16.5px;font-weight:' + labelWeight + ';color:' + labelColor + '">' + label + '</span>' +
        badge + '</button>';
    }).join('');

    ov.innerHTML =
      '<div style="width:100%;max-width:400px;background:#0b1220;border:1px solid #1e293b;border-radius:22px;' +
      'padding:22px 18px;box-shadow:0 30px 80px -12px rgba(0,0,0,.75)">' +
        '<div style="text-align:center;margin-bottom:16px">' +
          (fromTxt ? '<div style="font-size:13px;color:#94a3b8;font-weight:700;margin-bottom:5px">✅ ' + fromTxt + ' 완료</div>' : '') +
          '<div style="font-size:20px;font-weight:800;color:#f8fafc">🚀 다음은 어디로 이동할까요?</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:9px">' + rows + '</div>' +
      '</div>';

    d.body.appendChild(ov);
    // 클릭 바인딩
    [].forEach.call(ov.querySelectorAll('.mg-flow-row'), function (b) {
      b.addEventListener('click', function () { goTo(b.getAttribute('data-key')); });
    });
    d.addEventListener('keydown', onKey, true);
  }

  // 애니메이션 키프레임 1회 주입
  if (!d.getElementById('mango-flow-style')) {
    var st = d.createElement('style');
    st.id = 'mango-flow-style';
    st.textContent = '@keyframes mgFlowFade{from{opacity:0}to{opacity:1}}' +
      '.mg-flow-row:active{transform:scale(.98)}';
    d.head.appendChild(st);
  }

  // index.html 진입 시 ?go=class 면 자동으로 화상수업 로비 열기 (다른 페이지→수업 입장 연결)
  function handleGoParam() {
    try {
      if (/[?&]go=class(\b|&|$)/.test(w.location.search) &&
          typeof w.showView === 'function' && d.getElementById('view-videocall-lobby')) {
        w.showView('view-videocall-lobby');
      }
    } catch (_) {}
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', handleGoParam);
  else handleGoParam();

  w.MangoFlow = { open: open, close: close };
})(window, document);
