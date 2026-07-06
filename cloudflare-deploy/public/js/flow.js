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

  // 고정 메뉴 (순서·번호 고정). again = 이 항목이 '현재 기능'일 때 "다시"로 표시할 라벨
  var MENU = [
    { key: 'class',  emoji: '🎥', label: '수업 입장',    again: '수업 다시 입장' },
    { key: 'warmup', emoji: '🗣️', label: 'AI 웜업',      again: 'AI 웜업 다시' },
    { key: 'quiz',   emoji: '🧠', label: '복습퀴즈',      again: '복습퀴즈 다시' },
    { key: 'game',   emoji: '🎮', label: '학생게임',      again: '학생게임 다시' },
    { key: 'rec',    emoji: '📼', label: '녹화 다시보기', again: '녹화 다시보기' },
    { key: 'speech', emoji: '🎤', label: '단계별 발음',   again: '단계별 발음 다시' },
    { key: 'exit',   emoji: '🚪', label: '나가기',        again: '나가기' }
  ];

  // 방금 끝낸 기능 → 추천 항목
  //   웜업→게임→수업→복습→발음→게임 …  (복습 뒤 발음, 발음 뒤 게임 = 이해→발화→강화 흐름)
  var REC = { warmup: 'game', game: 'class', class: 'quiz', quiz: 'speech', speech: 'game' };

  // 방금 끝낸 기능 → 메뉴에서 '나 자신'에 해당하는 항목(있으면 "다시"로 표기)
  var SELF = { warmup: 'warmup', class: 'class', game: 'game', quiz: 'quiz', speech: 'speech' };

  var FROM_LABEL = { warmup: 'AI 웜업', game: '학생게임', class: '화상수업', quiz: '복습퀴즈', speech: '단계별 발음' };

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
        case 'warmup': nav('/warmup.html'); break;
        case 'quiz': nav('/review-quiz.html'); break;
        case 'game': nav('/student-games.html'); break;
        case 'speech': nav('/speech-coach.html'); break;   // 🎤 단계별 발음
        case 'rec':  openLatestRecording(); break;   // 직전 수업 녹화 바로 재생
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

  // ─────────────────────────────────────────────────────────
  // 📼 녹화 다시 보기 — 로그인 학생의 '가장 최근 수업 녹화'를 바로 재생
  // ─────────────────────────────────────────────────────────
  function studentUid() {
    var keys = ['mangoi_logged_user', 'mango_user', 'mangoi_user'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var o = JSON.parse(w.localStorage.getItem(keys[i]) || 'null');
        if (o && (o.uid || o.id || o.user_id)) return { uid: String(o.uid || o.id || o.user_id), name: String(o.name || '') };
      } catch (_) {}
    }
    return null;
  }

  function recDoc() { return topWin().document; }
  function recClose() {
    var doc = recDoc(), el = doc.getElementById('mango-rec-overlay');
    if (el) { try { var v = el.querySelector('video'); if (v) v.pause(); } catch (_) {} el.parentNode && el.parentNode.removeChild(el); }
  }
  function recShell(inner) {
    var doc = recDoc();
    recClose();
    var ov = doc.createElement('div');
    ov.id = 'mango-rec-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483001;background:rgba(2,6,23,.93);' +
      'display:flex;align-items:center;justify-content:center;padding:16px;' +
      'font-family:"Noto Sans KR",-apple-system,sans-serif;animation:mgFlowFade .2s ease-out';
    ov.addEventListener('click', function (e) { if (e.target === ov) recClose(); });
    ov.innerHTML = inner;
    doc.body.appendChild(ov);
    return ov;
  }
  function recMsgBox(html) {
    return '<div style="width:100%;max-width:380px;background:#0b1220;border:1px solid #1e293b;' +
      'border-radius:18px;padding:26px 22px;text-align:center;color:#e2e8f0">' + html + '</div>';
  }

  function openLatestRecording() {
    var who = studentUid();
    if (!who) {
      recShell(recMsgBox(
        '<div style="font-size:40px;margin-bottom:8px">🔒</div>' +
        '<div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#f8fafc">로그인이 필요해요</div>' +
        '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">로그인하면 지난 수업 녹화를 볼 수 있어요.</div>' +
        '<button data-rec-close style="background:#334155;color:#e2e8f0;border:0;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer">닫기</button>'
      ));
      bindRecButtons();
      return;
    }
    recShell(recMsgBox(
      '<div style="font-size:38px;margin-bottom:10px">📼</div>' +
      '<div style="font-size:15px;font-weight:700;color:#e2e8f0">최근 수업 녹화를 불러오는 중…</div>'
    ));
    var tried = {};
    function query(q) {
      tried[q] = 1;
      return fetch('/api/student/recordings?limit=1&uid=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (d2) { return (d2 && (d2.rows || d2.recordings)) || []; })
        .catch(function () { return []; });
    }
    query(who.uid).then(function (rows) {
      if ((!rows || !rows.length) && who.name && !tried[who.name]) return query(who.name);
      return rows;
    }).then(function (rows) {
      var rec = (rows && rows.length) ? rows[0] : null;
      if (!rec || !rec.url) { recShowEmpty(); return; }
      recShowPlayer(rec);
    }).catch(function () { recShowEmpty(); });
  }

  function recShowEmpty() {
    recShell(recMsgBox(
      '<div style="font-size:40px;margin-bottom:8px">🎬</div>' +
      '<div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#f8fafc">아직 녹화된 수업이 없어요</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">선생님과 화상수업을 하면 여기서 다시 볼 수 있어요.</div>' +
      '<button data-rec-close style="background:#334155;color:#e2e8f0;border:0;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer">닫기</button>'
    ));
    bindRecButtons();
  }

  function recShowPlayer(rec) {
    var meta = [rec.date, rec.teacher].filter(function (x) { return x && x !== '-'; }).join(' · ');
    recShell(
      '<div style="width:100%;max-width:920px;background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:14px;box-shadow:0 30px 80px -12px rgba(0,0,0,.75)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">' +
          '<div style="color:#f8fafc;font-weight:800;font-size:16px;min-width:0">📼 최근 수업 녹화' +
            (meta ? ' <span style="color:#94a3b8;font-weight:600;font-size:13px">· ' + meta + '</span>' : '') + '</div>' +
          '<button data-rec-close style="flex:0 0 auto;background:rgba(255,255,255,.1);color:#e2e8f0;border:0;width:34px;height:34px;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;line-height:1">✕</button>' +
        '</div>' +
        '<video src="' + String(rec.url).replace(/"/g, '&quot;') + '" controls autoplay playsinline ' +
          'style="width:100%;max-height:74vh;border-radius:12px;background:#000;display:block"></video>' +
        '<div style="text-align:center;margin-top:10px"><a href="/parent.html" style="color:#38bdf8;font-size:13px;text-decoration:none;font-weight:700">📚 전체 녹화 목록 보기 →</a></div>' +
      '</div>'
    );
    bindRecButtons();
  }

  function bindRecButtons() {
    var doc = recDoc(), ov = doc.getElementById('mango-rec-overlay');
    if (!ov) return;
    [].forEach.call(ov.querySelectorAll('[data-rec-close]'), function (b) {
      b.addEventListener('click', recClose);
    });
  }

  w.MangoFlow = { open: open, close: close, playRecording: openLatestRecording, closeRec: recClose };
})(window, document);
