/* 엘리더잼 Level 1 기본과정 — A.i 말하기(warmup.html)에 «허용된 학생에게만» 책 22권을 붙인다.
 * (2026-10-25 사장님 지시: ed/1234 로 로그인하면 아바타와 A.i 말하기로 대화)
 *
 * - 서버(/api/ai/eleader/l1/books)가 허용한 계정에서만 그린다. 403·오류면 아무것도 안 그린다(다른 학생은 예전 그대로).
 * - 책을 고르면 웜업 대화가 /api/ai/eleader/l1/chat 으로 간다(주제·난이도·연령은 서버가 정함, 하루 상한 있음).
 * - 아바타·마이크·음성 재생은 웜업 화면의 것을 그대로 쓴다 — 여기서 새로 만들지 않는다.
 * - 대화 엔진 호출은 warmupFetch 를 감싸 «엘리더잼 모드일 때만» 주소를 바꾼다. 모드가 아니면 손대지 않는다.
 */
(function () {
  'use strict';
  var anchor = document.getElementById('eleaderEntry');
  if (!anchor || typeof window.warmupFetch !== 'function') return;

  var en = function () { try { return localStorage.getItem('mangoi_lang') === 'en'; } catch (e) { return false; } };
  var T = function (ko, e) { return en() ? e : ko; };
  var token = function () { try { return localStorage.getItem('mango_token') || ''; } catch (e) { return ''; } };

  var box = document.createElement('section');
  box.id = 'eleaderL1'; box.hidden = true;
  box.setAttribute('aria-label', 'Eleader Jam Level 1');
  anchor.insertAdjacentElement('afterend', box);

  var data = null;       // 서버가 준 책 목록
  var state = null;      // { book, title, n, q, sid, last, tok, wish }
  var bar = null;

  function css() {
    if (document.getElementById('eleaderL1Css')) return;
    var s = document.createElement('style'); s.id = 'eleaderL1Css';
    s.textContent = '#eleaderL1{margin:12px 0;padding:14px;border:2px solid #16a34a;border-radius:14px;background:#f0fdf4;color:#14532d}'
      + '#eleaderL1 h3{margin:0 0 4px;font-size:17px}#eleaderL1 p{margin:4px 0 10px;font-size:13px;color:#166534}'
      + '#eleaderL1 select{width:100%;padding:10px;font-size:15px;border:1px solid #86efac;border-radius:10px;background:#fff;color:#14532d;margin-bottom:8px}'
      + '#eleaderL1 .l1-go{width:100%;padding:12px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}'
      + '#eleaderL1Bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 8px;padding:8px 12px;border-radius:12px;background:#f0fdf4;border:1px solid #86efac;color:#14532d;font-size:14px}'
      + '#eleaderL1Bar b{font-weight:700}#eleaderL1Bar button{border:1px solid #86efac;background:#fff;color:#14532d;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer}'
      + '#eleaderL1Bar .l1-hint{flex-basis:100%;color:#166534}#eleaderL1Bar .l1-hint[hidden]{display:none}';
    document.head.appendChild(s);
  }

  function render() {
    if (!data) { box.hidden = true; box.replaceChildren(); return; }
    css();
    var h = document.createElement('h3'); h.textContent = '📗 ' + T('엘리더잼 Level 1 기본과정', 'Eleader Jam Level 1 Basic Course');
    var p = document.createElement('p');
    p.textContent = T('책을 고르면 선생님이 책 질문을 하나씩 물어봐요. 마이크로 답하거나 글로 적어 보세요.',
      'Pick a book and your teacher will ask its questions one by one. Answer with the microphone or by typing.');
    var sel = document.createElement('select'); sel.id = 'eleaderL1Book';
    sel.setAttribute('aria-label', T('책 고르기', 'Choose a book'));
    data.books.forEach(function (b) { sel.appendChild(new Option(b.title + ' (' + b.questions.length + T('문항', ' questions') + ')', b.id)); });
    if (state) sel.value = state.book;
    var go = document.createElement('button'); go.type = 'button'; go.className = 'l1-go';
    go.textContent = T('🎤 이 책으로 말하기 시작', '🎤 Start talking with this book');
    go.onclick = function () { start(sel.value); };
    box.replaceChildren(h, p, sel, go);
    box.hidden = false;
  }

  function current() { return state ? (data.books.filter(function (b) { return b.id === state.book; })[0] || null) : null; }

  function drawBar() {
    var b = current(); if (!b) { if (bar) bar.remove(); bar = null; return; }
    var log = document.getElementById('log');
    if (!log || !log.parentNode) return;
    css();
    if (!bar) { bar = document.createElement('div'); bar.id = 'eleaderL1Bar'; bar.setAttribute('role', 'status'); log.parentNode.insertBefore(bar, log); }
    var i = Math.min(state.q, b.questions.length - 1), q = b.questions[i];
    var done = state.q >= b.questions.length;
    var t = document.createElement('span');
    var strong = document.createElement('b'); strong.textContent = '📗 ' + b.title;
    t.appendChild(strong);
    t.appendChild(document.createTextNode(done ? T(' · 다 했어요! 🎉 · 계속 이야기해요', ' · All done! 🎉 · Keep talking') : (' · ' + T('질문 ', 'Question ') + (i + 1) + ' / ' + b.questions.length)));
    // 🐶 학생이 고른 주제(서버가 X-Eleader-Topic 으로 알려 줌) — 책 질문을 그 주제로 바꿔 묻는 중이라는 표시
    if (state.wish) t.appendChild(document.createTextNode(' · 🔄 ' + T('주제: ', 'Topic: ') + state.wish));
    var hb = document.createElement('button'); hb.type = 'button'; hb.textContent = T('💡 힌트', '💡 Hint');
    var hint = document.createElement('span'); hint.className = 'l1-hint'; hint.hidden = true; hint.lang = 'ko';
    hint.textContent = q.hint + ' — ' + T('예: ', 'e.g. ') + q.model
      + (state.wish ? T(' (책 예시예요 — 지금은 «' + state.wish + '» 이야기로 바꿔서 말해 보세요)', ' (book example — say it about "' + state.wish + '" now)') : '');
    hb.onclick = function () { hint.hidden = !hint.hidden; };
    var out = document.createElement('button'); out.type = 'button'; out.textContent = T('책 그만하기', 'Leave book');
    out.onclick = function () { stop(); try { window.addMsg(T('📗 엘리더잼 책 연습을 마쳤어요. 이제 자유 대화예요.', '📗 Book practice ended. Free talk now.'), 'sys'); } catch (e) {} };
    bar.replaceChildren(t, hb, out, hint);
  }

  function stop() {
    state = null;
    try { if (window.WCTX && /^엘리더잼 L1/.test(window.WCTX.textbook || '')) { window.WCTX.textbook = ''; window.updateTopicChip && window.updateTopicChip(); } } catch (e) {}
    drawBar(); render();
  }

  function start(bookId) {
    var b = (data.books.filter(function (x) { return x.id === bookId; })[0]);
    if (!b) return;
    try { if (typeof window.clearBtsBook === 'function') window.clearBtsBook(false); } catch (e) {}
    try { if (typeof window.setLevel === 'function') window.setLevel(1, false); } catch (e) {}
    try { if (typeof window.setAge === 'function') window.setAge('kid', false); } catch (e) {}
    // 책은 영어 과정 — 중국어로 두면 인사·얼굴·목소리가 중국어 선생님으로 나간다(서버는 영어로 답함).
    try { if (typeof window.isZh === 'function' && window.isZh() && typeof window.setWarmLang === 'function') window.setWarmLang('en', false); } catch (e) {}
    state = { book: b.id, title: b.title, n: b.questions.length, q: 0, sid: window.SESSION_ID, last: null, tok: token(), wish: '' };
    try {
      window.WCTX.textbook = '엘리더잼 L1 · ' + b.title; window.WCTX.level = ''; window.WCTX.lesson_no = 0; window.WCTX.sentences = [];
    } catch (e) {}
    var started = !!window._warmStarted;
    try { window.startWarmup(); } catch (e) {}
    drawBar();
    if (started) kick();   // 이미 대화 중이면 첫 인사(initGreeting)가 다시 안 돈다 — 첫 질문을 직접 부른다
  }

  async function kick() {
    if (window.sending) return;   // 답이 오가는 중이면 겹쳐 보내지 않는다(그 답 다음 턴부터 책 질문)
    try {
      var body = window.withCtx({ session_id: window.SESSION_ID, kickoff: 1, student_input: "Let's start the book." });
      var r = await window.warmupFetch(window.warmupEndpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { if ([429, 401, 403].indexOf(r.status) < 0) note(r.status); return; }   // 그 셋은 감싼 쪽이 이미 알렸다
      var d = await r.json();
      if (d && d.ai_response) { window.addMsg(d.ai_response, 'ai'); try { window.showAnswerChips(d.answer_chips, d.speaking_help); } catch (e) {} }
    } catch (e) {}
  }

  function note(status) {
    var msg = status === 429 ? T('오늘 엘리더잼 대화 횟수를 다 썼어요. 내일 다시 해요.', "You've used today's Eleader Jam turns. Try again tomorrow.")
      : status === 403 || status === 401 ? T('로그인이 바뀌었어요. 다시 로그인해 주세요.', 'Your login changed. Please log in again.')
      : T('답을 받지 못했어요. 잠시 후 다시 해 주세요.', 'No reply yet. Please try again shortly.');
    try { window.addMsg(msg, 'sys'); } catch (e) {}
  }

  /* 웜업 대화 요청을 «엘리더잼 모드일 때만» 서버의 l1 통로로 돌린다. */
  var origFetch = window.warmupFetch;
  window.warmupFetch = function (url, options) {
    if (!state || window.API_BASE || !/\/api\/warmup\/chat$/.test(String(url)) || !options || typeof options.body !== 'string') return origFetch(url, options);
    var tk = token();
    if (!tk || tk !== state.tok) { stop(); return origFetch(url, options); }   // 로그인이 바뀌면 손을 뗀다
    var body; try { body = JSON.parse(options.body); } catch (e) { return origFetch(url, options); }
    // 🗑 새 대화(세션이 바뀜)면 책도 처음부터.
    if (body.session_id !== state.sid) { state.sid = body.session_id; state.q = 0; state.last = null; state.wish = ''; }
    var answering = -1;
    if (body.kickoff === 1) {
      body.eleader_q = Math.min(state.q, state.n - 1);
    } else {
      var input = String(body.student_input || ''), now = Date.now(), last = state.last;
      /* 재시도는 «스트림이 빈손으로 끊겨 같은 본문을 stream 없이 바로 다시 보내는» 경우 하나뿐(warmup.html sendMsg).
         ⛔ 내용만 같다고 재시도로 보지 않는다 — 아이는 「Yes.」를 연달아 답한다. */
      var retry = !!(last && last.stream && body.stream !== 1 && last.input === input && now - last.at < 30000);
      /* 📗 책을 다 끝낸 뒤에는 n(=«다 했어요») 을 보낸다 — 예전처럼 마지막 문항(n-1)을 다시 보내면
         서버가 매 턴 마무리 인사만 되풀이하고 새 질문을 안 했다(2026-10-27 「great job 만 하고 질문을 더 안 해요」). */
      answering = retry ? last.q : Math.min(state.q, state.n);
      body.eleader_q = answering;
      state.last = { input: input, at: now, stream: body.stream === 1, q: answering };
    }
    body.eleader_book = state.book;
    delete body.lesson_topic; delete body.textbook; delete body.level; delete body.lesson_no;
    var opts = Object.assign({}, options, { body: JSON.stringify(body), headers: Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + tk }) });
    var p = origFetch('/api/ai/eleader/l1/chat', opts);
    /* 문항은 «답을 받았을 때만» 넘긴다 — 실패(상한·장애·끊김)면 같은 문항을 다시 답하게 둔다. */
    var mine = state;
    p.then(function (r) {
      if (r && r.ok && state === mine) {
        /* 🔁 서버가 «이미 다룬 책 문항» 을 건너뛰고 뒷 문항을 물었으면(X-Eleader-Q) 진행 번호·힌트를 그 문항으로 맞춘다
           (2026-10-28 「같은 질문 두 번 금지」). 헤더가 없으면 예전처럼 한 칸만 넘긴다. 뒤로는 절대 안 간다. */
        var hq = r.headers.get('X-Eleader-Q') || '', nq = /^\d{1,3}$/.test(hq) ? Number(hq) : -1;
        if (nq >= 0 && nq < state.n && (answering >= 0 ? nq > answering : nq >= state.q)) state.q = Math.max(state.q, nq);
        else if (answering >= 0) state.q = Math.max(state.q, Math.min(answering + 1, state.n));
      }
      if (r && r.ok && state === mine) { var w = r.headers.get('X-Eleader-Topic') || ''; state.wish = /^[a-z]{2,20}( [a-z]{2,20}){0,2}$/.test(w) ? w : ''; }
      if (r && (r.status === 429 || r.status === 401 || r.status === 403)) note(r.status);
      drawBar();
    }, function () {});
    return p;
  };

  var epoch = 0;
  async function load() {
    var mine = ++epoch, tk = token();
    data = null; render();
    if (!tk) return;
    try {
      var r = await fetch('/api/ai/eleader/l1/books', { headers: { Authorization: 'Bearer ' + tk }, cache: 'no-store', credentials: 'omit' });
      if (mine !== epoch || token() !== tk || !r.ok) return;
      var d = await r.json();
      if (!d || d.ok !== true || !Array.isArray(d.books) || !d.books.length) return;
      data = d; render();
    } catch (e) { /* 다른 학생은 예전 화면 그대로 */ }
  }
  window.addEventListener('storage', function (e) { if (e.key === 'mango_token' || e.key === null) { if (state && token() !== state.tok) stop(); load(); } });
  window.addEventListener('mangoi:lang-changed', function () { render(); drawBar(); });
  load();
})();
