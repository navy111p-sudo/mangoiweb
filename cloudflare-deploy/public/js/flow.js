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
    { key: 'vocab',  emoji: '📖', label: '단어장',        again: '단어장 다시' },
    { key: 'aifriend', emoji: '🤖', label: 'AI 친구',     again: 'AI 친구 다시' },
    { key: 'aiwrite', emoji: '✍️', label: 'AI 글쓰기',    again: 'AI 글쓰기 다시' },
    { key: 'miniquiz', emoji: '⚡', label: '미니퀴즈',     again: '미니퀴즈 다시' },
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
        case 'vocab': nav('/vocab.html'); break;           // 📖 단어장
        case 'aifriend': nav('/ai-friend.html'); break;    // 🤖 AI 친구 대화
        case 'aiwrite': nav('/ai-write.html'); break;      // ✍️ AI 글쓰기
        case 'miniquiz': nav('/micro-quiz.html'); break;   // ⚡ 미니퀴즈
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
      '<div class="mg-flow-card" style="width:100%;max-width:400px;max-height:86vh;overflow-y:auto;background:#0b1220;border:1px solid #1e293b;border-radius:22px;' +
      'padding:22px 18px;box-shadow:0 30px 80px -12px rgba(0,0,0,.75)">' +
        '<div style="text-align:center;margin-bottom:16px">' +
          (fromTxt ? '<div class="mg-flow-sub" style="font-size:13px;color:#94a3b8;font-weight:700;margin-bottom:5px">✅ ' + fromTxt + ' 완료</div>' : '') +
          '<div class="mg-flow-title" style="font-size:20px;font-weight:800;color:#f8fafc">🚀 다음은 어디로 이동할까요?</div>' +
        '</div>' +
        '<div class="mg-flow-list" style="display:flex;flex-direction:column;gap:9px">' + rows + '</div>' +
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
      '.mg-flow-row:active{transform:scale(.98)}' +
      /* 🖥️ PC(넓은 화면) — 이동 메뉴 약 30% 확대 */
      '@media (min-width:820px){' +
        '.mg-flow-card{max-width:530px!important;padding:30px 26px!important;border-radius:26px!important}' +
        '.mg-flow-title{font-size:26px!important}' +
        '.mg-flow-sub{font-size:16px!important}' +
        '.mg-flow-list{gap:12px!important}' +
        '.mg-flow-row{padding:19px 22px!important;border-radius:18px!important;gap:16px!important}' +
        '.mg-flow-row>span:nth-child(1){font-size:19px!important;width:28px!important;flex-basis:28px!important}' +
        '.mg-flow-row>span:nth-child(2){font-size:29px!important;flex-basis:34px!important}' +
        '.mg-flow-row>span:nth-child(3){font-size:21px!important}' +
        '.mg-flow-row>span:nth-child(4){font-size:15px!important;padding:5px 15px!important}' +
      '}';
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
  // 🔎 로그인 감지 — 이미 홈에서 로그인한 학생을 최대한 폭넓게 인식(재로그인 방지).
  //   여러 저장키·상위창 헬퍼·URL 파라미터까지 확인한다. (서버는 mango_token 서명으로
  //   본인만 재생 가능하므로, uid 를 넓게 인식해도 남의 녹화가 노출되지 않는다 — IDOR 안전)
  function pickUid(o) {
    if (!o) return null;
    var id = o.uid || o.id || o.user_id;
    if (!id) return null;
    return { uid: String(id), name: String(o.name || o.user_name || o.username || '') };
  }
  function readStore(store, key) {
    try { return JSON.parse((store && store.getItem(key)) || 'null'); } catch (_) { return null; }
  }
  function studentUid() {
    // 1) 표준 사용자 객체 키 (자기 창 + 상위창 저장소 모두)
    var stores = [];
    try { stores.push(w.localStorage); } catch (_) {}
    try { var tw = topWin(); if (tw !== w && tw.localStorage) stores.push(tw.localStorage); } catch (_) {}
    var keys = ['mangoi_logged_user', 'mango_user', 'mangoi_user', 'currentUser'];
    for (var s = 0; s < stores.length; s++) {
      for (var i = 0; i < keys.length; i++) {
        var hit = pickUid(readStore(stores[s], keys[i]));
        if (hit) return hit;
      }
    }
    // 2) 상위창(index.html 등)의 로그인 헬퍼 / 전역 사용자 객체
    try { var t = topWin(); var pu = t.getCurrentUser && t.getCurrentUser(); var h1 = pickUid(pu); if (h1) return h1; } catch (_) {}
    try { var t2 = topWin(); var h2 = pickUid(t2.currentUser); if (h2) return h2; } catch (_) {}
    // 3) 단일 uid 문자열 키
    var idKeys = ['mangoi_uid', 'mango_user_id', 'user_id'];
    for (var j = 0; j < idKeys.length; j++) {
      for (var s2 = 0; s2 < stores.length; s2++) {
        var v = null; try { v = stores[s2].getItem(idKeys[j]); } catch (_) {}
        if (v && v !== 'null' && v !== 'undefined') return { uid: String(v), name: '' };
      }
    }
    // 4) 수업 링크로 진입한 경우 — URL 파라미터의 uid (서버 토큰이 최종 검증)
    //    ⚠️ 'login' 은 recDoLogin 리다이렉트 플래그(?login=1)와 충돌하므로 uid 후보에서 제외
    try {
      var qs = new URLSearchParams(w.location.search);
      var qu = qs.get('uid') || qs.get('student');
      if (qu) return { uid: String(qu), name: '' };
    } catch (_) {}
    return null;
  }

  // 🔐 본인 인증 토큰 — 자기 창/상위창 localStorage, URL 파라미터에서 두루 찾음
  function authToken() {
    var stores = [];
    try { stores.push(w.localStorage); } catch (_) {}
    try { var tw = topWin(); if (tw !== w && tw.localStorage) stores.push(tw.localStorage); } catch (_) {}
    for (var s = 0; s < stores.length; s++) {
      var t = null; try { t = stores[s].getItem('mango_token'); } catch (_) {}
      if (t) return t;
    }
    try { var q = new URLSearchParams(w.location.search).get('token'); if (q) return q; } catch (_) {}
    return '';
  }

  // 🔑 토큰 자동 재발급 — 이미 로그인한 학생이 mango_token 이 없어도 재로그인 없이 재생.
  //   (AI 친구 채팅 getAuth 와 동일 패턴: 비밀번호 미설정 계정은 user_id 만으로 서버가
  //    로그인과 동일 보안수준에서 토큰을 재발급한다)
  function tokenUid(tok) {
    try { return JSON.parse(atob(String(tok).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).uid || null; } catch (_) { return null; }
  }
  function saveToken(t) {
    try { w.localStorage.setItem('mango_token', t); } catch (_) {}
    try { var tw = topWin(); if (tw !== w) tw.localStorage.setItem('mango_token', t); } catch (_) {}
  }
  function ensureToken(who) {
    var t = authToken();
    if (t && tokenUid(t) === who.uid) return Promise.resolve(t);
    return fetch('/api/student/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: who.uid })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok && d.token) { saveToken(d.token); return d.token; } return t || ''; })
      .catch(function () { return t || ''; });
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
    if (!who) { recShowLoginNeeded(); return; }
    recShell(recMsgBox(
      '<div style="font-size:38px;margin-bottom:10px">📼</div>' +
      '<div style="font-size:15px;font-weight:700;color:#e2e8f0">최근 수업 녹화를 불러오는 중…</div>'
    ));
    var tried = {}, authFail = false, authOk = false, _tok = '';
    function query(q) {
      tried[q] = 1;
      return fetch('/api/student/recordings?limit=1&uid=' + encodeURIComponent(q) + (_tok ? '&token=' + encodeURIComponent(_tok) : ''), { credentials: 'include' })  // 🔐 본인 인증
        .then(function (r) { if (r.status === 401 || r.status === 403) authFail = true; return r.json(); })
        .then(function (d2) {
          if (d2 && d2.ok === false && /auth/i.test(String(d2.error || ''))) authFail = true;
          else authOk = true;  // 인증 통과한 응답이 하나라도 있으면 빈 결과 = '녹화 없음'
          return (d2 && (d2.rows || d2.recordings)) || [];
        })
        .catch(function () { return []; });
    }
    ensureToken(who).then(function (tok) {
      _tok = tok || '';
      return query(who.uid);
    }).then(function (rows) {
      if ((!rows || !rows.length) && who.name && !tried[who.name]) return query(who.name);
      return rows;
    }).then(function (rows) {
      var rec = (rows && rows.length) ? rows[0] : null;
      // 이미 로그인된(인증 성공한) 학생에게는 절대 재로그인을 요구하지 않는다
      if (!rec || !rec.url) { (authFail && !authOk) ? recShowLoginNeeded() : recShowEmpty(); return; }
      recShowPlayer(rec);
    }).catch(function () { (authFail && !authOk) ? recShowLoginNeeded() : recShowEmpty(); });
  }

  // 🔒 로그인/본인 인증이 필요할 때 — '닫기'만 주지 말고 바로 로그인할 수 있게 버튼 제공
  function recShowLoginNeeded() {
    recShell(recMsgBox(
      '<div style="font-size:40px;margin-bottom:8px">🔒</div>' +
      '<div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#f8fafc">로그인이 필요해요</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">녹화는 본인 확인 후에만 볼 수 있어요.<br>로그인하면 지난 수업 녹화를 바로 볼 수 있어요.</div>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
        '<button data-rec-login style="background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff;border:0;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:800;cursor:pointer">로그인하기</button>' +
        '<button data-rec-close style="background:#334155;color:#e2e8f0;border:0;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer">닫기</button>' +
      '</div>'
    ));
    bindRecButtons();
  }

  // 로그인 실행 — 상위창(index.html)의 로그인 모달이 있으면 그걸 열고, 없으면 홈으로 이동(로그인 후 되돌아옴)
  function recDoLogin() {
    var back = '';
    try { back = w.location.pathname + w.location.search; } catch (_) {}
    try {
      var t = topWin();
      if (t.openLoginModal) { recClose(); t.openLoginModal(); return; }
      if (t !== w && t.MangoFlow) { /* 상위창에도 없으면 아래 이동 */ }
    } catch (_) {}
    nav('/?login=1' + (back ? '&next=' + encodeURIComponent(back) : ''));
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
      '<div style="width:100%;max-width:1400px;background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:18px;box-shadow:0 30px 80px -12px rgba(0,0,0,.75)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">' +
          '<div style="color:#f8fafc;font-weight:800;font-size:16px;min-width:0">📼 최근 수업 녹화' +
            (meta ? ' <span style="color:#94a3b8;font-weight:600;font-size:13px">· ' + meta + '</span>' : '') + '</div>' +
          '<button data-rec-close style="flex:0 0 auto;background:rgba(255,255,255,.1);color:#e2e8f0;border:0;width:34px;height:34px;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;line-height:1">✕</button>' +
        '</div>' +
        '<video src="' + String(rec.url).replace(/"/g, '&quot;') + '" controls autoplay playsinline ' +
          'style="width:100%;max-height:86vh;border-radius:12px;background:#000;display:block"></video>' +
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
    [].forEach.call(ov.querySelectorAll('[data-rec-login]'), function (b) {
      b.addEventListener('click', recDoLogin);
    });
  }

  w.MangoFlow = { open: open, close: close, playRecording: openLatestRecording, closeRec: recClose };
})(window, document);
