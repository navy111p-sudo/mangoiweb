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
    { key: 'warmup', emoji: '🗣️', label: 'A.i 말하기 연습', again: 'A.i 말하기 연습 다시' },
    { key: 'quiz',   emoji: '🧠', label: '복습퀴즈',      again: '복습퀴즈 다시' },
    { key: 'game',   emoji: '🎮', label: '학생게임',      again: '학생게임 다시' },
    { key: 'rec',    emoji: '📼', label: '녹화 다시보기', again: '녹화 다시보기' },
    { key: 'speech', emoji: '🎤', label: 'AI 음성코치',   again: 'AI 음성코치 다시' },   // 인트로 카드와 같은 이름으로 통일(2026-08-14, 구명 «단계별 발음»)
    { key: 'vocab',  emoji: '📖', label: '단어장',        again: '단어장 다시' },
    { key: 'aifriend', emoji: '🤖', label: 'AI 친구',     again: 'AI 친구 다시' },
    { key: 'aiwrite', emoji: '✍️', label: 'AI 글쓰기',    again: 'AI 글쓰기 다시' },
    { key: 'miniquiz', emoji: '⚡', label: 'AI 단어 퀴즈', again: 'AI 단어 퀴즈 다시' },   // 화면 제목과 같은 이름으로 통일(2026-08-14)
    { key: 'exit',   emoji: '🚪', label: '나가기',        again: '나가기' }
  ];

  // 방금 끝낸 기능 → 추천 항목
  //   웜업→게임→수업→복습→발음→게임 …  (복습 뒤 발음, 발음 뒤 게임 = 이해→발화→강화 흐름)
  //   AI 친구·AI 글쓰기는 자유대화/작문형이라 뒤에 게임으로 강화 추천
  var REC = { warmup: 'game', game: 'class', class: 'quiz', quiz: 'speech', speech: 'game', aifriend: 'game', aiwrite: 'game' };

  // 방금 끝낸 기능 → 메뉴에서 '나 자신'에 해당하는 항목(있으면 "다시"로 표기)
  var SELF = { warmup: 'warmup', class: 'class', game: 'game', quiz: 'quiz', speech: 'speech', aifriend: 'aifriend', aiwrite: 'aiwrite' };

  var FROM_LABEL = { warmup: 'A.i 말하기 연습', game: '학생게임', class: '화상수업', quiz: '복습퀴즈', speech: 'AI 음성코치', aifriend: 'AI 친구', aiwrite: 'AI 글쓰기' };

  // 최상위 창(아이프레임 안에서 실행 시 상위창을 대상으로 이동) — 교차출처면 자기 자신
  function topWin() {
    try { return (w.top && w.top !== w.self) ? w.top : w; } catch (_) { return w; }
  }

  /* 🌐 (2026-08-13) 녹화 화면 문구 한/영 두 벌 — 강사 다수가 필리핀이고, 이 화면은
       Karl «Double Login Issue» 수정으로 강사도 쓰게 됐는데 통째로 한국어뿐이었다.
     ⚠️ 언어 판정은 반드시 getLang() 으로 한다 — 인라인 전역 currentLang 을 읽으면
        🌐 토글을 눌러도 안 따라온다(CLAUDE.md 2절). 저장키는 mangoi_lang(구키 mango_lang 아님). */
  function isEn() {
    try {
      var t = topWin();
      if (typeof t.getLang === 'function') return t.getLang() === 'en';
    } catch (_) {}
    try { if (typeof w.getLang === 'function') return w.getLang() === 'en'; } catch (_) {}
    try { return w.localStorage.getItem('mangoi_lang') === 'en'; } catch (_) {}
    return false;
  }
  function T(ko, en) { return isEn() ? en : ko; }
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
        case 'speech': nav('/speech-coach.html'); break;   // 🎤 AI 음성코치
        case 'vocab': nav('/vocab.html'); break;           // 📖 단어장
        case 'aifriend': nav('/ai-friend.html'); break;    // 🤖 AI 친구 대화
        case 'aiwrite': nav('/ai-write.html'); break;      // ✍️ AI 글쓰기
        case 'miniquiz': nav('/micro-quiz.html'); break;   // ⚡ AI 단어 퀴즈
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
      'align-items:center;justify-content:center;padding:20px;font-family:MangoiHanSC,"Noto Sans KR",-apple-system,sans-serif;' +
      'animation:mgFlowFade .25s ease-out';
    ov.onclick = function (e) { if (e.target === ov && (window.mgBackdropClosable ? window.mgBackdropClosable(ov) : true)) close(); };   /* QA#4 */

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

  /* 🧑‍🏫 (2026-08-13, 필리핀 IT매니저 Karl «Double Login Issue»)
     [사고] 상단바에 «Teacher Win» 으로 이미 로그인돼 있는데, 메뉴 → 「녹화 보기」를 누르면
            로그인 창이 한 번 더 떴다.
     [원인] 교사·본사·지사 로그인은 `mangoi_admin_session` 만 만들고 학생 키
            (`mangoi_logged_user`)는 **일부러** 만들지 않는다(idx-user-session.js 116줄 —
            교사 계정으로 학생 전용 기능이 열리면 안 되므로). 그런데 studentUid() 는
            학생 키만 봐서 «로그인 안 한 사람» 으로 판정했다.
     [해결] 학생 신분을 만들지 않고, **녹화 조회용 신원**만 따로 읽는다. 서버도 같은 날
            관리자·교사 세션 쿠키를 목록 API 에서 인정하도록 맞췄다(api-mango.ts).
     ⚠️ studentUid() 자체는 건드리지 않는다 — 그걸 고치면 학생 전용 기능 전체가 함께 열린다. */
  function adminViewer() {
    var stores = [];
    try { stores.push(w.localStorage); } catch (_) {}
    try { var tw = topWin(); if (tw !== w && tw.localStorage) stores.push(tw.localStorage); } catch (_) {}
    for (var s = 0; s < stores.length; s++) {
      var o = readStore(stores[s], 'mangoi_admin_session');
      if (o && (o.uid || o.name)) {
        return { uid: String(o.uid || o.name), name: String(o.name || ''), admin: true };
      }
    }
    return null;
  }

  // 녹화 화면이 쓰는 신원 — 학생이면 학생, 아니면 교사·관리자 세션.
  function recViewer() { return studentUid() || adminViewer(); }

  /* 조회 후보 아이디 목록 (앞에서부터 시도).
     녹화 행의 teacher_name·participant_names 에는 «화상수업 입장 때 입력한 이름» 이 들어간다
     (mango-rec.js 859줄 = vcUsername). 계정 아이디·표시이름과 다를 수 있어 함께 본다. */
  function recKeys(who) {
    if (!who) return [];
    var cand = [who.uid, who.name];
    if (who.admin) {
      var stores = [];
      try { stores.push(w.localStorage); } catch (_) {}
      try { var tw = topWin(); if (tw !== w && tw.localStorage) stores.push(tw.localStorage); } catch (_) {}
      for (var s = 0; s < stores.length; s++) {
        try { cand.push(stores[s].getItem('mangoi_vc_uid')); } catch (_) {}
      }
    }
    var out = [], seen = {};
    for (var i = 0; i < cand.length; i++) {
      var k = String(cand[i] == null ? '' : cand[i]).trim();
      if (!k) continue;
      var lk = k.toLowerCase();
      if (seen[lk]) continue;
      seen[lk] = 1; out.push(k);
    }
    return out;
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
  // ⏰ 만료 토큰은 서버가 거부(401→재로그인 요구)하므로, 클라에서 미리 걸러 재발급을 태운다
  function tokenExpired(tok) {
    try {
      var p = JSON.parse(atob(String(tok).split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      return !!(p.exp && p.exp < Date.now());
    } catch (_) { return true; }
  }
  function saveToken(t) {
    try { w.localStorage.setItem('mango_token', t); } catch (_) {}
    try { var tw = topWin(); if (tw !== w) tw.localStorage.setItem('mango_token', t); } catch (_) {}
  }
  function ensureToken(who) {
    var t = authToken();
    if (t && tokenUid(t) === who.uid && !tokenExpired(t)) return Promise.resolve(t);
    // 🧑‍🏫 교사·관리자 세션에는 학생 계정이 없다 — /api/student/login 은 404(user_not_found)만
    //    돌려주므로 부르지 않는다. 인증은 admin_sessions 쿠키(credentials:'include')로 통과한다.
    if (who.admin) return Promise.resolve('');
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
      'font-family:MangoiHanSC,"Noto Sans KR",-apple-system,sans-serif;animation:mgFlowFade .2s ease-out';
    ov.addEventListener('click', function (e) { if (e.target === ov && (window.mgBackdropClosable ? window.mgBackdropClosable(ov) : true)) recClose(); });   /* QA#4 */
    ov.innerHTML = inner;
    doc.body.appendChild(ov);
    return ov;
  }
  function recMsgBox(html) {
    return '<div style="width:100%;max-width:380px;background:#0b1220;border:1px solid #1e293b;' +
      'border-radius:18px;padding:26px 22px;text-align:center;color:#e2e8f0">' + html + '</div>';
  }

  // 📚 전체 녹화 목록 — 인증된 본인 녹화 API로 최대 30건(uid+이름 두 경로 합침).
  //   (기존 그리드 '녹화본 복습' 모달은 /api/recordings/list-recent 사용인데 2026-07-10 PII
  //    잠금으로 관리자 전용이 됨 → 학생은 항상 빈 목록. 그래서 여기서 본인 API로 직접 보여준다)
  var _recWho = null;       // 마지막으로 조회한 학생(목록 버튼 재사용)
  var _recListRows = [];    // 렌더된 목록 행(클릭 재생용)

  function recAuthedQuery(who) {
    return ensureToken(who).then(function (tok) {
      var t = tok || '';
      function q(key) {
        return fetch('/api/student/recordings?limit=30&uid=' + encodeURIComponent(key) + (t ? '&token=' + encodeURIComponent(t) : ''), { credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (d) { return (d && (d.rows || d.recordings)) || []; })
          .catch(function () { return []; });
      }
      var jobs = recKeys(who).map(q);
      return Promise.all(jobs).then(function (parts) {
        var seen = {}, merged = [];
        parts.forEach(function (rows) {
          (rows || []).forEach(function (r) {
            if (r && r.id != null && !seen[r.id]) { seen[r.id] = 1; merged.push(r); }
          });
        });
        return merged;
      });
    });
  }

  /* 서버가 내려주는 제목·길이는 한국어로 조립돼 온다(api-mango.ts: '방 X 수업' / '25분' · '30초').
     행 전체를 영어로 갈아 끼우는 대신, 화면에 그릴 때만 두 갈래를 알아본다 —
     서버 응답 형식을 바꾸면 관리자 화면·리포트까지 함께 흔들린다. */
  function recTopic(topic) {
    var s = String(topic == null ? '' : topic).trim();
    if (!s) return T('수업 녹화', 'Class recording');
    if (!isEn()) return s;
    var m = /^방\s+(.+?)\s+수업$/.exec(s);
    return m ? ('Room ' + m[1] + ' class') : s;
  }
  function recDuration(dur) {
    var s = String(dur == null ? '' : dur).trim();
    if (!s || !isEn()) return s;
    return s.replace(/^(\d+)분$/, '$1 min').replace(/^(\d+)초$/, '$1 sec');
  }

  function recListBox(html) {
    return '<div style="width:100%;max-width:640px;max-height:88vh;display:flex;flex-direction:column;' +
      'background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:20px 18px;color:#e2e8f0">' + html + '</div>';
  }

  // 전체 목록 화면
  function recShowList() {
    var who = _recWho || recViewer();
    if (!who) { recShowLoginNeeded(); return; }
    _recWho = who;
    recShell(recMsgBox(
      '<div style="font-size:34px;margin-bottom:10px">📚</div>' +
      '<div style="font-size:15px;font-weight:700;color:#e2e8f0">' + T('전체 녹화 목록을 불러오는 중…', 'Loading all recordings…') + '</div>'
    ));
    recAuthedQuery(who).then(function (rows) {
      _recListRows = (rows || []).slice();
      if (!_recListRows.length) { recShowEmpty(); return; }
      var esc = function (s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]); }); };
      var items = _recListRows.map(function (r, i) {
        // 🔴 2026-08-04: 업로드가 실패한 녹화는 DB status 가 'completed' 여도 실물 파일이 없다.
        //   예전엔 초록 ▶재생 이 떠서 누르면 "녹화를 재생할 수 없어요"(=보관기간 만료로 오해)만
        //   나왔다. 서버가 내려주는 failed 플래그로 «저장 실패»를 솔직하게 표시한다.
        var failed = !!r.failed || String(r.status || '') === 'upload_failed';
        var playable = !failed && !!r.url && String(r.status || 'completed') === 'completed';
        var meta = [r.date, r.teacher, recDuration(r.duration)].filter(function (x) { return x && x !== '-'; }).map(esc).join(' · ');
        var badge = playable
          ? '<span style="flex:0 0 auto;background:#10b981;color:#04231a;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:800">' + T('▶ 재생', '▶ Play') + '</span>'
          : failed
          ? '<span style="flex:0 0 auto;background:#7f1d1d;color:#fecaca;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700">' + T('⚠ 저장 실패', '⚠ Upload failed') + '</span>'
          : '<span style="flex:0 0 auto;background:#334155;color:#94a3b8;border-radius:8px;padding:6px 10px;font-size:12px;font-weight:700">' + T('⏳ 준비중', '⏳ Processing') + '</span>';
        // ⬇ 저장 — 목록에서 바로 내 PC·휴대폰으로. (재생 URL 에 &dl=1 만 붙이면 서버가
        //   Content-Disposition: attachment 로 내려준다. 우리 play 엔드포인트일 때만 —
        //   외부 http(s) 녹화는 우리가 헤더를 못 붙이므로 저장 버튼을 걸지 않는다)
        var dlUrl = playable && /^\/api\/recording\/play\?/.test(String(r.url || '')) ? String(r.url) + '&dl=1' : '';
        var dlBtn = dlUrl
          // 📱 휴대폰에서 누를 버튼이다 — 높이 44px 는 이 저장소가 쓰는 터치 타깃 기준.
          //    (실측: 그냥 두면 31px 라 손가락으로 겨냥이 어렵다)
          ? '<a href="' + esc(dlUrl) + '" download data-rec-dl title="' + T('내 기기에 저장', 'Save to my device') + '" ' +
            'style="flex:0 0 auto;display:inline-flex;align-items:center;min-height:44px;' +
            'background:rgba(148,163,184,.14);color:#cbd5e1;border-radius:8px;' +
            'padding:6px 12px;font-size:12px;font-weight:800;text-decoration:none;white-space:nowrap">' + T('⬇ 저장', '⬇ Save') + '</a>'
          : '';
        // 행 = [재생 버튼(제목·정보·배지)] + [저장 링크].
        //   버튼 안에 버튼을 넣을 수 없어(중첩 불가) 바깥을 div 로 감싸고 클릭 영역만 button 으로 둔다.
        return '<div style="display:flex;align-items:center;gap:10px;width:100%;' +
          'background:' + (playable ? 'rgba(56,189,248,.08)' : failed ? 'rgba(248,113,113,.07)' : 'rgba(148,163,184,.06)') + ';' +
          'border:1px solid ' + (playable ? 'rgba(56,189,248,.28)' : failed ? 'rgba(248,113,113,.26)' : 'rgba(148,163,184,.18)') + ';' +
          'border-radius:12px;padding:12px 14px;margin-bottom:8px">' +
          '<button data-rec-play="' + i + '"' + (playable ? '' : ' disabled') +
          ' style="display:flex;align-items:center;gap:12px;flex:1 1 auto;min-width:0;text-align:left;' +
          'background:transparent;border:0;padding:0;color:#e2e8f0;' +
          'cursor:' + (playable ? 'pointer' : 'default') + '">' +
          '<span style="flex:0 0 auto;font-size:24px">📼</span>' +
          '<span style="flex:1 1 auto;min-width:0">' +
            '<span style="display:block;font-weight:800;font-size:14px;color:#f8fafc">' + esc(recTopic(r.topic)) + '</span>' +
            '<span style="display:block;font-size:12px;color:#94a3b8;margin-top:2px">' + (meta || '&nbsp;') + '</span>' +
          '</span>' + badge + '</button>' + dlBtn + '</div>';
      }).join('');
      recShell(recListBox(
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex:0 0 auto">' +
          '<div style="font-weight:800;font-size:17px;color:#f8fafc">' + T('📚 내 녹화 수업', '📚 My recorded classes') +
            ' <span style="color:#94a3b8;font-weight:600;font-size:13px">· ' + _recListRows.length + T('개', '') + '</span></div>' +
          '<button data-rec-close style="flex:0 0 auto;background:rgba(255,255,255,.1);color:#e2e8f0;border:0;width:34px;height:34px;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;line-height:1">✕</button>' +
        '</div>' +
        '<div style="flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch">' + items + '</div>' +
        '<div style="flex:0 0 auto;color:#64748b;font-size:11px;margin-top:10px;line-height:1.6">' +
          T('※ 본인 수업 녹화만 표시됩니다. ⬇ 저장을 누르면 내 PC·휴대폰에 파일로 받을 수 있어요(보관 기간이 지나면 삭제되니 필요하면 미리 받아두세요). ⚠ 저장 실패는 업로드 도중 파일이 저장되지 못한 수업이라 재생할 수 없어요.',
            '※ Only your own class recordings are listed. Tap ⬇ Save to download a copy to your PC or phone (recordings are deleted once the retention period ends, so save anything you need in advance). ⚠ Upload failed means the file was never stored during upload, so it cannot be played.') + '</div>'
      ));
      var doc = recDoc(), ov = doc.getElementById('mango-rec-overlay');
      if (ov) {
        [].forEach.call(ov.querySelectorAll('[data-rec-play]'), function (b) {
          b.addEventListener('click', function () {
            var idx = parseInt(b.getAttribute('data-rec-play'), 10);
            var row = _recListRows[idx];
            if (row) recShowPlayer([row], 0);
          });
        });
      }
      bindRecButtons();
    }).catch(function () { recShowEmpty(); });
  }

  // 💌 수업 피드백 목록 (2026-07-22, 학부모 컴플레인 #3) — 선생님이 남긴 피드백을
  //    학생/학부모가 직접 본다. 인증·조회 구조는 녹화 목록과 동일(/api/student/feedbacks).
  function fbShowList() {
    var who = _recWho || studentUid();
    if (!who) { recShowLoginNeeded(); return; }
    _recWho = who;
    recShell(recMsgBox(
      '<div style="font-size:34px;margin-bottom:10px">💌</div>' +
      '<div style="font-size:15px;font-weight:700;color:#e2e8f0">수업 피드백을 불러오는 중…</div>'
    ));
    ensureToken(who).then(function (tok) {
      var t = tok || '';
      function q(key) {
        return fetch('/api/student/feedbacks?limit=30&uid=' + encodeURIComponent(key) + (t ? '&token=' + encodeURIComponent(t) : ''), { credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (d) { return (d && d.rows) || []; })
          .catch(function () { return []; });
      }
      var jobs = [q(who.uid)];
      if (who.name && who.name !== who.uid) jobs.push(q(who.name));
      return Promise.all(jobs).then(function (parts) {
        var seen = {}, merged = [];
        parts.forEach(function (rows) {
          (rows || []).forEach(function (r) {
            if (r && r.id != null && !seen[r.id]) { seen[r.id] = 1; merged.push(r); }
          });
        });
        merged.sort(function (a, b) { return (b.class_at || 0) - (a.class_at || 0); });
        return merged;
      });
    }).then(function (rows) {
      var esc = function (s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]); }); };
      if (!rows.length) {
        recShell(recMsgBox(
          '<div style="font-size:38px;margin-bottom:10px">💌</div>' +
          '<div style="font-size:15px;font-weight:700;color:#e2e8f0">아직 등록된 피드백이 없어요</div>' +
          '<div style="font-size:12.5px;color:#94a3b8;margin-top:8px;line-height:1.6">수업이 끝나면 선생님이 당일 피드백을 남겨드려요.<br>등록되면 문자로도 알려드립니다.</div>' +
          '<button data-rec-close style="margin-top:16px;background:rgba(255,255,255,.1);color:#e2e8f0;border:0;padding:10px 22px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer">닫기</button>'
        ));
        bindRecButtons();
        return;
      }
      var items = rows.map(function (r) {
        var d = r.class_at ? new Date(r.class_at) : null;
        var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var dateStr = d ? (d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate())) : '';
        // content 는 "한국어\n\n[EN] English" 형태 — 한국어 본문만 기본 표시
        var bodyRaw = String(r.content || r.summary || '');
        var koBody = bodyRaw.split('\n\n[EN]')[0];
        return '<div style="background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.22);border-radius:12px;padding:14px 16px;margin-bottom:10px">' +
          '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#94a3b8;margin-bottom:6px">' +
            '<span>👩‍🏫 ' + esc(r.teacher_name || '담당 선생님') + '</span><span>' + esc(dateStr) + '</span>' +
          '</div>' +
          '<div style="font-size:13.5px;color:#e2e8f0;line-height:1.7;white-space:pre-wrap">' + esc(koBody) + '</div>' +
        '</div>';
      }).join('');
      recShell(recListBox(
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex:0 0 auto">' +
          '<div style="font-weight:800;font-size:17px;color:#f8fafc">💌 수업 피드백 <span style="color:#94a3b8;font-weight:600;font-size:13px">· ' + rows.length + '개</span></div>' +
          '<button data-rec-close style="flex:0 0 auto;background:rgba(255,255,255,.1);color:#e2e8f0;border:0;width:34px;height:34px;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;line-height:1">✕</button>' +
        '</div>' +
        '<div style="flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch">' + items + '</div>' +
        '<div style="flex:0 0 auto;color:#64748b;font-size:11px;margin-top:10px;line-height:1.6">※ 선생님이 수업 당일 남긴 피드백입니다. 새 피드백은 문자로도 안내돼요.</div>'
      ));
      bindRecButtons();
    }).catch(function () { recShowEmpty(); });
  }

  function openLatestRecording() {
    var who = recViewer();
    if (!who) { recShowLoginNeeded(); return; }
    _recWho = who;
    recShell(recMsgBox(
      '<div style="font-size:38px;margin-bottom:10px">📼</div>' +
      '<div style="font-size:15px;font-weight:700;color:#e2e8f0">' + T('최근 수업 녹화를 불러오는 중…', 'Loading your latest class recording…') + '</div>'
    ));
    var tried = {}, authFail = false, authOk = false, _tok = '';
    function query(q) {
      tried[q] = 1;
      // limit=5 — 맨 위 행이 녹화중/중단본이어도 그 아래 '재생 가능한 완료본'을 고를 수 있게
      return fetch('/api/student/recordings?limit=5&uid=' + encodeURIComponent(q) + (_tok ? '&token=' + encodeURIComponent(_tok) : ''), { credentials: 'include' })  // 🔐 본인 인증
        .then(function (r) { if (r.status === 401 || r.status === 403) authFail = true; return r.json(); })
        .then(function (d2) {
          if (d2 && d2.ok === false && /auth/i.test(String(d2.error || ''))) authFail = true;
          else authOk = true;  // 인증 통과한 응답이 하나라도 있으면 빈 결과 = '녹화 없음'
          return (d2 && (d2.rows || d2.recordings)) || [];
        })
        .catch(function () { return []; });
    }
    // 재생 후보 목록 — 완료본을 앞에, 그다음 나머지(녹화중·중단본). URL 있는 행만.
    //   (완료본이라도 R2 파일이 만료·삭제돼 404 날 수 있어, 플레이어가 순서대로 폴백한다)
    function playableList(rows) {
      if (!rows || !rows.length) return [];
      var done = [], rest = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r || !r.url) continue;
        if (r.failed || String(r.status || '') === 'upload_failed') continue;  // 저장 실패본은 후보에서 제외
        (String(r.status || 'completed') === 'completed' ? done : rest).push(r);
      }
      return done.concat(rest);
    }
    // 후보 아이디를 앞에서부터 시도 — 재생 가능한 녹화가 나오면 거기서 멈춘다.
    //   (학생: 아이디 → 등록이름 / 교사: 계정아이디 → 표시이름 → 수업 입장 때 쓴 이름)
    function queryKeys(keys, i, prev) {
      if (i >= keys.length) return Promise.resolve(prev || []);
      if (tried[keys[i]]) return queryKeys(keys, i + 1, prev);
      return query(keys[i]).then(function (rows) {
        if (playableList(rows).length) return rows;
        return queryKeys(keys, i + 1, (prev && prev.length) ? prev : rows);
      });
    }
    ensureToken(who).then(function (tok) {
      _tok = tok || '';
      return queryKeys(recKeys(who), 0, []);
    }).then(function (rows) {
      var list = playableList(rows);
      // 이미 로그인된(인증 성공한) 학생에게는 절대 재로그인을 요구하지 않는다
      if (!list.length) { (authFail && !authOk) ? recShowLoginNeeded() : recShowEmpty(); return; }
      recShowPlayer(list, 0);
    }).catch(function () { (authFail && !authOk) ? recShowLoginNeeded() : recShowEmpty(); });
  }

  // 🔒 로그인/본인 인증이 필요할 때 — '닫기'만 주지 말고 바로 로그인할 수 있게 버튼 제공
  function recShowLoginNeeded() {
    recShell(recMsgBox(
      '<div style="font-size:40px;margin-bottom:8px">🔒</div>' +
      '<div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#f8fafc">' + T('로그인이 필요해요', 'Sign-in required') + '</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">' +
        T('녹화는 본인 확인 후에만 볼 수 있어요.<br>로그인하면 지난 수업 녹화를 바로 볼 수 있어요.',
          'Recordings open only after we confirm who you are.<br>Sign in to watch your past classes right away.') + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
        '<button data-rec-login style="background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff;border:0;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:800;cursor:pointer">' + T('로그인하기', 'Sign in') + '</button>' +
        '<button data-rec-close style="background:#334155;color:#e2e8f0;border:0;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer">' + T('닫기', 'Close') + '</button>' +
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
      '<div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#f8fafc">' + T('아직 녹화된 수업이 없어요', 'No recorded classes yet') + '</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">' +
        T('선생님과 화상수업을 하면 여기서 다시 볼 수 있어요.',
          'Once a video class is recorded, you can watch it back here.') + '</div>' +
      '<button data-rec-close style="background:#334155;color:#e2e8f0;border:0;border-radius:10px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer">' + T('닫기', 'Close') + '</button>'
    ));
    bindRecButtons();
  }

  // list = 재생 후보 배열, idx = 현재 시도할 인덱스.
  //   영상 로드 실패(파일 만료·404 등) 시 자동으로 다음 후보로 넘어간다.
  function recShowPlayer(list, idx) {
    // 배열이 아닌 단일 rec 로 불러도 동작하도록 방어
    if (!Array.isArray(list)) list = list ? [list] : [];
    idx = idx || 0;
    if (idx >= list.length) { recShowUnplayable(); return; }
    var rec = list[idx];
    var meta = [rec.date, rec.teacher].filter(function (x) { return x && x !== '-'; }).join(' · ');
    // ⬇ 저장 — 보고 있는 이 녹화를 그대로 내 기기로. (목록 행과 같은 규칙: 우리 play URL 만)
    var pDl = /^\/api\/recording\/play\?/.test(String(rec.url || '')) ? String(rec.url) + '&dl=1' : '';
    var pEsc = function (s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]); }); };
    recShell(
      '<div style="width:100%;max-width:1400px;background:#0b1220;border:1px solid #1e293b;border-radius:18px;padding:18px;box-shadow:0 30px 80px -12px rgba(0,0,0,.75)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">' +
          '<div style="color:#f8fafc;font-weight:800;font-size:16px;min-width:0">' + T('📼 최근 수업 녹화', '📼 Latest class recording') +
            (meta ? ' <span style="color:#94a3b8;font-weight:600;font-size:13px">· ' + meta + '</span>' : '') + '</div>' +
          '<div style="flex:0 0 auto;display:flex;align-items:center;gap:8px">' +
            (pDl ? '<a href="' + pEsc(pDl) + '" download data-rec-dl title="' + T('내 PC·휴대폰에 저장', 'Save to my PC or phone') + '" ' +
              'style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#052e16;border-radius:10px;' +
              'padding:8px 14px;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap">' + T('⬇ 저장', '⬇ Save') + '</a>' : '') +
            '<button data-rec-close style="background:rgba(255,255,255,.1);color:#e2e8f0;border:0;width:34px;height:34px;border-radius:10px;font-size:16px;font-weight:800;cursor:pointer;line-height:1">✕</button>' +
          '</div>' +
        '</div>' +
        '<video data-rec-video controls autoplay playsinline ' +
          'style="width:100%;max-height:86vh;border-radius:12px;background:#000;display:block"></video>' +
        '<div style="text-align:center;margin-top:10px"><button data-rec-list style="background:transparent;border:0;color:#38bdf8;font-size:13px;font-weight:700;cursor:pointer;padding:4px 8px">' + T('📚 전체 녹화 목록 보기 →', '📚 See all recordings →') + '</button></div>' +
      '</div>'
    );
    var doc = recDoc(), vid = doc.querySelector('#mango-rec-overlay [data-rec-video]');
    if (vid) {
      // 로드 실패 시 다음 후보로 자동 폴백 (한 번만 발동)
      vid.addEventListener('error', function () { recShowPlayer(list, idx + 1); }, { once: true });
      vid.src = String(rec.url);
      try { vid.load(); } catch (_) {}
    }
    bindRecButtons();
  }

  // 후보를 모두 시도했으나 재생 불가할 때
  function recShowUnplayable() {
    recShell(recMsgBox(
      '<div style="font-size:40px;margin-bottom:8px">🎞️</div>' +
      '<div style="font-size:16px;font-weight:800;margin-bottom:6px;color:#f8fafc">' + T('녹화를 재생할 수 없어요', 'This recording cannot be played') + '</div>' +
      '<div style="font-size:13px;color:#94a3b8;margin-bottom:16px">' +
        T('업로드 도중 파일이 저장되지 못했거나, 보관 기간이 지났을 수 있어요.<br>전체 목록에서 다른 녹화를 확인해 보세요.',
          'The file may have failed to upload, or its retention period may have passed.<br>Try another recording from the full list.') + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
        '<button data-rec-list style="background:linear-gradient(135deg,#38bdf8,#2563eb);color:#fff;border:0;border-radius:10px;padding:11px 20px;font-size:14px;font-weight:800;cursor:pointer">' + T('📚 전체 목록', '📚 Full list') + '</button>' +
        '<button data-rec-close style="background:#334155;color:#e2e8f0;border:0;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:700;cursor:pointer">' + T('닫기', 'Close') + '</button>' +
      '</div>'
    ));
    bindRecButtons();
  }

  /* 📱 ⬇저장 폴백 (2026-08-14, «저장을 눌러도 아무 반응이 없어요») ─────────────
     카톡·문자앱 인앱 브라우저(WebView)와 홈 화면 설치형(standalone)은 파일 다운로드
     기능 자체가 없어서, <a download> 를 눌러도 **에러조차 없이 조용히 무시**된다
     (window.open null 함정과 같은 계열 — CLAUDE.md 2절). 일반 크롬·사파리는 이 코드가
     개입하지 않고 기본 <a download> 그대로 둔다.
       ① 안드로이드 카톡 인앱 → 외부 브라우저(크롬)로 다운로드 URL 을 바로 연다
          (inapp-escape.js 의 kakaotalk://web/openExternal 방식). 열린 크롬엔 로그인
          쿠키가 없지만, 서버가 URL 에 동봉한 &sig=/&token= 만으로 인증된다(2026-08-13).
       ② 그 외 인앱·설치형 → 안내 시트를 띄워 버튼으로 잇는다(아래 recDlGuide).
     🪤 1차 시도(같은 날)는 window.open 자동 시도 + «다른 브라우저로 열기» 토스트였는데,
        갤럭시 설치형(PWA)에서 새 창이 조용히 안 열렸고, 설치형 앱엔 «다른 브라우저로
        열기» 메뉴 자체가 없어 사용자가 «이게 무슨 뜻이냐»고 했다(원장님 실사용 피드백).
        그래서 자동 시도 대신 **눌러서 실행하는 큰 버튼 2개**로 바꿨다 —
        · «크롬(브라우저)으로 저장» = 안드로이드는 intent:// 로 기본 브라우저 앱을 직접
          호출(설치형·인앱 모두에서 외부 브라우저가 뜬다), 그 외는 window.open→location.
        · «저장 주소 복사» = 어떤 환경에서도 통하는 최후 수단. 주소만 있으면 아무
          브라우저에서나 받아진다(&sig=/&token= 이 인증을 대신하므로 로그인 불필요). */
  function recDlEnv() {
    var ua = '';
    try { ua = String(navigator.userAgent || '').toLowerCase(); } catch (_) {}
    // '; wv)' = 안드로이드 WebView 공식 마커. 나머지는 국내에서 실제로 만나는 인앱들.
    var inapp = /kakaotalk|naver\(inapp|line\/|instagram|fbav|fban|daumapps|; wv\)/.test(ua);
    var standalone = false;
    try {
      standalone = (w.matchMedia && w.matchMedia('(display-mode: standalone)').matches) ||
        (topWin().matchMedia && topWin().matchMedia('(display-mode: standalone)').matches) ||
        (navigator.standalone === true);
    } catch (_) {}
    // 📥 자사 망고아이 앱 v2.0+ — UA 에 «MangoiApp/» 마커가 있으면 앱에 네이티브
    //   다운로드 장치(DownloadListener→DownloadManager)가 있다(mobile-app MainActivity).
    //   가로채지 않고 기본 <a download> 를 그대로 태우면 앱이 받아서 알림창에 저장한다.
    //   (마커 없는 구버전 앱은 여전히 안내 시트 — 실행 시 앱 업데이트 안내가 뜬다)
    var nativeDl = ua.indexOf('mangoiapp/') !== -1;
    return {
      blocked: (inapp || standalone) && !nativeDl,
      kakaoAndroid: ua.indexOf('kakaotalk') !== -1 && ua.indexOf('android') !== -1
    };
  }
  // intent:// = 안드로이드가 «기본 브라우저 앱»을 직접 띄우는 공식 통로.
  //   설치형(PWA)·대부분의 인앱에서 window.open 이 조용히 죽는 것과 달리 앱 전환이
  //   눈에 보이고, 열린 브라우저가 첨부 응답을 받아 바로 다운로드한다.
  function recDlIntent(abs) {
    try {
      var u = new URL(abs);
      topWin().location.href = 'intent://' + u.host + u.pathname + u.search + '#Intent;scheme=https;action=android.intent.action.VIEW;end';
      return true;
    } catch (_) { return false; }
  }
  // 다운로드가 막힌 환경용 안내 시트 — 설명 + 실행 버튼. (토스트 한 줄은 «뭘 하라는
  // 거냐»는 반응만 남겼다. 사용자가 직접 누르는 버튼이어야 팝업 차단에도 안 걸린다)
  //   autoTried=true 면 저장 탭 순간 이미 크롬을 띄운 뒤다(아래 recDlClick «바로 저장») —
  //   시트는 «크롬이 안 열렸을 때» 를 위한 예비 통로로만 깔린다. 문구도 그에 맞춘다.
  function recDlGuide(abs, autoTried) {
    var doc = recDoc(), ov = doc.getElementById('mango-rec-overlay');
    if (!ov) return;
    var old = ov.querySelector('[data-rec-dl-guide]');
    if (old) { old.parentNode.removeChild(old); }
    var isAndroid = /android/i.test(navigator.userAgent || '');
    var sheet = doc.createElement('div');
    sheet.setAttribute('data-rec-dl-guide', '1');
    sheet.style.cssText = 'position:absolute;left:50%;bottom:20px;transform:translateX(-50%);width:min(92%,420px);' +
      'background:#0f172a;color:#e2e8f0;border:1px solid #475569;border-radius:16px;' +
      'padding:18px 16px;font-size:14px;line-height:1.65;box-shadow:0 16px 50px rgba(0,0,0,.65)';
    sheet.innerHTML =
      '<div style="font-weight:800;font-size:15px;margin-bottom:6px">' + T('📥 파일 저장 안내', '📥 How to save the file') + '</div>' +
      '<div style="color:#94a3b8;font-size:13px;margin-bottom:12px">' +
        (autoTried
          ? T('크롬이 열리면서 저장이 시작됐어요. 크롬이 열리지 않았다면 아래 버튼을 이용해 주세요.',
              'Chrome should have opened and started the download. If it did not open, use a button below.')
          : T('지금 보시는 화면(설치한 앱·카톡 등)은 파일 다운로드를 지원하지 않아요. 아래 버튼으로 브라우저에서 저장해 주세요.',
              'This screen (installed app / in-app viewer) cannot download files. Use a button below to save via your browser.')) + '</div>' +
      '<button data-dlg-open style="display:block;width:100%;background:linear-gradient(135deg,#22c55e,#16a34a);color:#052e16;border:0;border-radius:12px;padding:13px;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:8px">' +
        T('🌐 크롬(브라우저)으로 저장', '🌐 Save via Chrome/browser') + '</button>' +
      '<button data-dlg-copy style="display:block;width:100%;background:rgba(148,163,184,.16);color:#e2e8f0;border:0;border-radius:12px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px">' +
        T('🔗 저장 주소 복사 (브라우저에 붙여넣기)', '🔗 Copy download link (paste in a browser)') + '</button>' +
      '<button data-dlg-close style="display:block;width:100%;background:transparent;color:#94a3b8;border:0;padding:8px;font-size:13px;font-weight:700;cursor:pointer">' + T('닫기', 'Close') + '</button>';
    ov.appendChild(sheet);
    var bOpen = sheet.querySelector('[data-dlg-open]');
    bOpen.addEventListener('click', function () {
      if (isAndroid && recDlIntent(abs)) return;
      var wn = null;
      try { wn = w.open(abs, '_blank'); } catch (_) { wn = null; }
      if (!wn) { try { topWin().location.href = abs; } catch (_) {} }   // 새 창이 막히면 같은 창(첨부 응답이라 화면 유지)
    });
    sheet.querySelector('[data-dlg-copy]').addEventListener('click', function (ev) {
      var btn = ev.currentTarget;
      var done = function (ok) {
        btn.textContent = ok
          ? T('✅ 복사됐어요! 크롬 주소창에 붙여넣으면 저장돼요', '✅ Copied! Paste it into the Chrome address bar to save')
          : T('복사가 막혔어요 — 아래 주소를 길게 눌러 복사해 주세요', 'Copy blocked — long-press the address below');
        if (!ok) {
          var box = doc.createElement('div');
          box.style.cssText = 'margin-top:8px;padding:8px;background:#1e293b;border-radius:8px;font-size:11px;word-break:break-all;user-select:all;-webkit-user-select:all';
          box.textContent = abs;
          btn.parentNode.insertBefore(box, btn.nextSibling);
        }
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(abs).then(function () { done(true); }, function () { done(false); });
        } else { done(false); }
      } catch (_) { done(false); }
    });
    sheet.querySelector('[data-dlg-close]').addEventListener('click', function () {
      try { sheet.parentNode.removeChild(sheet); } catch (_) {}
    });
  }
  function recDlClick(e, a) {
    var env = recDlEnv();
    if (!env.blocked) return;                     // 일반 브라우저 — 기본 <a download> 그대로
    e.preventDefault();
    var abs = '';
    try { abs = new URL(a.getAttribute('href'), topWin().location.href).href; } catch (_) { abs = a.href; }
    if (env.kakaoAndroid) {
      // 카톡 안드로이드: 외부 크롬으로 직접 — 열리면서 바로 저장이 시작된다
      try { topWin().location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(abs); return; } catch (_) {}
    }
    // 📱 «바로 저장» (2026-08-14 사장님 «바로는 힘들어?») — 안드로이드는 시트를 띄워
    //   버튼을 한 번 더 누르게 하지 않고, 저장 탭 즉시 intent:// 로 크롬을 연다
    //   (한 번 탭 = 크롬 전환 + 저장 시작). 시트는 «크롬이 안 열렸을 때» 예비용으로만
    //   깔아 둔다 — intent 실패를 코드로 감지할 방법이 없어서, 성공 시엔 돌아와서
    //   닫기만 누르면 되는 수준의 비용으로 실패 시의 막다른 길을 없앤다.
    if (/android/i.test(navigator.userAgent || '') && recDlIntent(abs)) {
      recDlGuide(abs, true);
      return;
    }
    recDlGuide(abs, false);
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
    [].forEach.call(ov.querySelectorAll('[data-rec-list]'), function (b) {
      b.addEventListener('click', recShowList);
    });
    [].forEach.call(ov.querySelectorAll('[data-rec-dl]'), function (a) {
      a.addEventListener('click', function (e) { recDlClick(e, a); });
    });
  }

  w.MangoFlow = { open: open, close: close, playRecording: openLatestRecording, showList: recShowList, showFeedbacks: fbShowList, closeRec: recClose };
})(window, document);
