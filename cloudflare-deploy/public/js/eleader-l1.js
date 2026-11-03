/* 엘리더잼 Level 1 기본과정 — A.i 말하기(warmup.html)에 «허용된 학생에게만» 책 22권을 붙인다.
 * (2026-10-25 사장님 지시: ed/1234 로 로그인하면 아바타와 A.i 말하기로 대화)
 *
 * - 서버(/api/ai/eleader/l1/books)가 허용한 계정에서만 그린다. 403·오류면 아무것도 안 그린다(다른 학생은 예전 그대로).
 * - 책을 고르면 웜업 대화가 /api/ai/eleader/l1/chat 으로 간다(주제·난이도·연령은 서버가 정함, 하루 상한 있음).
 * - 아바타·마이크·음성 재생은 웜업 화면의 것을 그대로 쓴다 — 여기서 새로 만들지 않는다.
 * - 대화 엔진 호출은 warmupFetch 를 감싸 «엘리더잼 모드일 때만» 주소를 바꾼다. 모드가 아니면 손대지 않는다.
 * 📚 (2026-11-02) Level 2~5(캐피 기본 레벨5 · 캐피 심화 1·2·3) 주제 말하기 — 서버가 books 응답에 levels 를 주면
 *    «레벨 탭 + 검색 + 목록» 으로 그린다. Level 1 은 책(20문항) 진행, Level 2~5 는 주제 대화(문항 번호 없음)이고
 *    대화 요청에는 eleader_topic 만 싣는다(주제·수준·연령은 서버가 정한다). levels 가 없으면 Level 1 탭 하나만 나온다.
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
  /* 📏 하루 대화 횟수(2026-10-28 사장님 「대화가 최대 몇 건인지 페이지에 표시」) — 서버가 센 값만 그린다.
     책 목록(daily_cap·used_today)으로 시작하고, 대화마다 응답 헤더(X-Eleader-Used·X-Eleader-Cap)로 바꾼다. */
  var quota = { used: null, cap: null };

  function css() {
    if (document.getElementById('eleaderL1Css')) return;
    var s = document.createElement('style'); s.id = 'eleaderL1Css';
    s.textContent = '#eleaderL1{margin:12px 0;padding:14px;border:2px solid #16a34a;border-radius:14px;background:#f0fdf4;color:#14532d}'
      + '#eleaderL1 h3{margin:0 0 4px;font-size:17px}#eleaderL1 p{margin:4px 0 10px;font-size:13px;color:#166534}'
      + '#eleaderL1 select{width:100%;padding:10px;font-size:15px;border:1px solid #86efac;border-radius:10px;background:#fff;color:#14532d;margin-bottom:8px}'
      + '#eleaderL1 .l1-go{width:100%;padding:12px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}'
      + '#eleaderL1Bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 8px;padding:8px 12px;border-radius:12px;background:#f0fdf4;border:1px solid #86efac;color:#14532d;font-size:14px}'
      + '#eleaderL1Bar.l1-in-composer{margin:0 0 10px}'
      + '#eleaderL1Bar b{font-weight:700}#eleaderL1Bar button{border:1px solid #86efac;background:#fff;color:#14532d;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer}'
      + '#eleaderL1Bar .l1-hint{flex-basis:100%;color:#166534}#eleaderL1Bar .l1-hint[hidden]{display:none}'
      + '#eleaderL1 .l1-quota{margin:-4px 0 10px;font-size:13px;font-weight:700;color:#166534}'
      + '#eleaderL1Bar .l1-quota{font-size:13px;color:#166534}.l1-quota.l1-low{color:#b45309 !important}'
      /* 📚 레벨 탭 · 검색 · 목록(2026-11-02) — 탭이 늘어나도 옆으로 밀어서 본다(폰에서 줄바꿈으로 칸이 깨지지 않게) */
      + '#eleaderL1 .l1-tabs{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;margin-bottom:4px;scrollbar-width:thin}'
      + '#eleaderL1 .l1-tab{flex:0 0 auto;border:1px solid #86efac;background:#fff;color:#166534;border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer;white-space:nowrap}'
      + '#eleaderL1 .l1-tab[aria-selected="true"]{background:#16a34a;border-color:#16a34a;color:#fff;font-weight:700}'
      + '#eleaderL1 .l1-note{margin:0 0 8px;font-size:12px;color:#166534}'
      + '#eleaderL1 .l1-search{width:100%;box-sizing:border-box;padding:9px 12px;font-size:15px;border:1px solid #86efac;border-radius:10px;background:#fff;color:#14532d;margin-bottom:8px}'
      + '#eleaderL1 .l1-list{display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;margin-bottom:8px;padding:2px}'
      + '#eleaderL1 .l1-item{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;border:1px solid #bbf7d0;background:#fff;color:#14532d;border-radius:10px;padding:8px 10px;font:inherit;cursor:pointer}'
      + '#eleaderL1 .l1-item[aria-pressed="true"]{border:2px solid #16a34a;background:#dcfce7}'
      + '#eleaderL1 .l1-no{flex:0 0 auto;min-width:46px;text-align:center;font-size:12px;font-weight:700;color:#fff;background:#16a34a;border-radius:8px;padding:3px 4px}'
      + '#eleaderL1 .l1-t{display:block;font-size:15px;font-weight:700;line-height:1.35}'
      + '#eleaderL1 .l1-s{display:block;font-size:12.5px;color:#4b6b57;margin-top:2px;line-height:1.4}'
      + '#eleaderL1 .l1-empty{font-size:13px;color:#4b6b57;text-align:center;padding:14px 0}'
      + '#eleaderL1 .l1-pick{margin:0 0 6px;font-size:13px;color:#166534;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
    document.head.appendChild(s);
  }

  /* 📏 «하루 최대 N번» 문구. full=책 고르는 칸(긴 설명), 아니면 진행 막대(짧게). 상한을 모르면 빈 문자열. */
  function quotaText(full) {
    var cap = quota.cap, used = quota.used;
    if (!(cap > 0)) return '';
    var u = used == null ? null : Math.min(used, cap);
    if (!full) return u == null ? T('💬 하루 ' + cap + '번', '💬 ' + cap + ' a day') : T('💬 오늘 ' + u + ' / ' + cap, '💬 Today ' + u + ' / ' + cap);
    return T('💬 하루 최대 ' + cap + '번 대화할 수 있어요', '💬 You can talk up to ' + cap + ' times a day')
      + (u == null ? '' : T(' · 오늘 ' + u + '번 했어요', ' · ' + u + ' used today'));
  }
  function quotaEl(full) {
    var q = document.createElement(full ? 'p' : 'span');
    q.className = 'l1-quota' + (quota.cap > 0 && quota.used != null && quota.cap - quota.used <= 10 ? ' l1-low' : '');
    q.textContent = quotaText(full);
    return q;
  }
  /* 응답 헤더로 받은 횟수를 반영한다. 숫자가 아니면 손대지 않는다(옛 서버·다른 응답). */
  function takeQuota(r) {
    try {
      var u = parseInt(r.headers.get('X-Eleader-Used'), 10), c = parseInt(r.headers.get('X-Eleader-Cap'), 10);
      if (c > 0) quota.cap = c;
      if (u >= 0) quota.used = u;
    } catch (e) {}
  }

  /* 401 = 다른 기기에서 새로 로그인해 옛 토큰이 죽은 것 → 칸을 숨기지 않고 이유를 말한다.
     403(허용 안 된 계정)은 예전처럼 조용히 숨긴다. */
  var notice = '';
  function render() {
    if (!data) {
      if (!notice) { box.hidden = true; box.replaceChildren(); panelQuota = null; return; }
      css();
      var nh = document.createElement('h3'); nh.textContent = '📗 ' + T('엘리더잼 기본과정', 'Eleader Jam Basic Course');
      var np = document.createElement('p'); np.textContent = notice;
      box.replaceChildren(nh, np); panelQuota = null; box.hidden = false; return;
    }
    css();
    var lvs = levels(), lv = levelOf(ui.lv) || lvs[0];
    ui.lv = lv.id;
    if (!itemOf(lv, ui.pick)) ui.pick = lv.items.length ? lv.items[0].id : null;   // 레벨을 바꾸면 그 레벨 첫 항목(예전 select 기본값과 같은 동작)
    var h = document.createElement('h3');
    var lvPre = lv.id === 'l1' ? '' : lv.label + ' ';   // 기본과정은 «Level 1» 을 안 붙인다(2026-11-03 사장님)
    h.textContent = '📗 ' + T('엘리더잼 ' + lvPre + lv.ko, 'Eleader Jam ' + lvPre + lv.en);
    var p = document.createElement('p');
    p.textContent = lv.id === 'l1'
      ? T('책을 고르면 선생님이 책 질문을 하나씩 물어봐요. 마이크로 답하거나 글로 적어 보세요.',
        'Pick a book and your teacher will ask its questions one by one. Answer with the microphone or by typing.')
      : T('주제를 고르면 선생님이 그 주제로 내 경험과 생각을 물어봐요. 내 이야기로 자유롭게 답해 보세요.',
        'Pick a topic and your teacher will ask about your own experiences and ideas. Answer in your own words.');
    panelQuota = quotaEl(true);
    var kids = [h, p, panelQuota];
    if (lvs.length > 1) {   // 레벨이 하나뿐이면(옛 서버) 탭을 안 그린다
      var tabs = document.createElement('div'); tabs.className = 'l1-tabs'; tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', T('레벨 고르기', 'Choose a level'));
      lvs.forEach(function (l) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'l1-tab'; b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(l.id === lv.id)); b.dataset.lv = l.id;
        b.textContent = (l.id === 'l1' ? '' : l.label + ' · ') + T(l.ko, l.en) + ' (' + l.items.length + ')';
        b.onclick = function () { if (ui.lv === l.id) return; ui.lv = l.id; ui.pick = null; ui.q = ''; saveLv(); render(); };
        tabs.appendChild(b);
      });
      kids.push(tabs);
      var note = document.createElement('p'); note.className = 'l1-note';
      note.textContent = T('총 ' + lv.items.length + lv.unit.ko, lv.items.length + ' ' + lv.unit.en + (lv.items.length > 1 ? 's' : ''))
        + (lv.id === 'l1' ? T(' · 책 질문에 차례로 답해요', ' · answer the book questions in order') : T(' · 주제를 내 상황에 맞게 이야기해요', ' · talk about the topic in your own way'));
      kids.push(note);
    }
    var search = document.createElement('input'); search.type = 'search'; search.className = 'l1-search';
    search.placeholder = T('이름으로 찾기 (예: 여행, 음식)', 'Search (e.g. travel, food)');
    search.setAttribute('aria-label', T('책·주제 찾기', 'Search books and topics')); search.value = ui.q;
    var list = document.createElement('div'); list.className = 'l1-list'; list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', T('책·주제 목록', 'Books and topics'));
    var pick = document.createElement('p'); pick.className = 'l1-pick';
    var go = document.createElement('button'); go.type = 'button'; go.className = 'l1-go';
    function paintList() {
      var q = ui.q.trim().toLowerCase(), shown = 0;
      list.replaceChildren();
      lv.items.forEach(function (it) {
        if (q && (it.ko + ' ' + it.en + ' ' + (it.sub || '')).toLowerCase().indexOf(q) < 0) return;
        shown++;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'l1-item'; b.setAttribute('role', 'option');
        b.dataset.id = it.id; b.setAttribute('aria-pressed', String(it.id === ui.pick));
        var no = document.createElement('span'); no.className = 'l1-no'; no.textContent = (it.no < 10 ? '0' : '') + it.no + T(lv.unit.ko, '');
        var tx = document.createElement('span');
        var t1 = document.createElement('span'); t1.className = 'l1-t'; t1.textContent = T(it.ko, it.en || it.ko); tx.appendChild(t1);
        if (it.sub) { var t2 = document.createElement('span'); t2.className = 'l1-s'; t2.textContent = it.sub; tx.appendChild(t2); }
        b.appendChild(no); b.appendChild(tx);
        b.onclick = function () { ui.pick = it.id; paintList(); };
        list.appendChild(b);
      });
      if (!shown) { var e = document.createElement('div'); e.className = 'l1-empty'; e.textContent = T('찾는 이름이 없어요.', 'Nothing found.'); list.appendChild(e); }
      var cur = itemOf(lv, ui.pick);
      pick.textContent = cur ? T('고른 것: ', 'Selected: ') + T(cur.ko, cur.en || cur.ko) : T('책이나 주제를 골라 주세요', 'Choose a book or topic');
      go.disabled = !cur;
      go.textContent = lv.id === 'l1' ? T('🎤 이 책으로 말하기 시작', '🎤 Start talking with this book') : T('🎤 이 주제로 말하기 시작', '🎤 Start talking about this topic');
    }
    search.oninput = function () { ui.q = search.value; paintList(); };   // 목록만 다시 그린다(입력칸 포커스 유지)
    go.onclick = function () { var cur = itemOf(lv, ui.pick); if (!cur) return; if (lv.id === 'l1') start(cur.id); else startTopic(lv, cur); };
    paintList();
    kids.push(search, list, pick, go);
    box.replaceChildren.apply(box, kids);
    box.hidden = false;
  }

  /* 📚 레벨 목록 — Level 1(책) + 서버가 준 Level 2~5(주제). 화면이 그리는 모양 하나로 맞춘다. */
  var ui = { lv: loadLv(), pick: null, q: '' };
  function loadLv() { try { return localStorage.getItem('eleader_lv') || 'l1'; } catch (e) { return 'l1'; } }
  function saveLv() { try { localStorage.setItem('eleader_lv', ui.lv); } catch (e) {} }
  function levels() {
    var out = [{ id: 'l1', label: 'Level 1', ko: '기본과정', en: 'Basic Course', unit: { ko: '권', en: 'Book' }, difficulty: 1, age: 'kid',
      items: data.books.map(function (b, i) {
        return { id: b.id, no: i + 1, ko: String(b.title || '').replace(/^\d+\s*권\s*·\s*/, ''), en: '', sub: b.questions.length + T('문항', ' questions') };
      }) }];
    (Array.isArray(data.levels) ? data.levels : []).forEach(function (l) {
      if (!l || typeof l.id !== 'string' || !Array.isArray(l.topics) || !l.topics.length) return;
      out.push({ id: l.id, label: String(l.label || l.id), ko: String(l.ko || ''), en: String(l.en || l.ko || ''),
        unit: l.unit && l.unit.ko ? l.unit : { ko: '단원', en: 'Unit' }, difficulty: l.difficulty, age: l.age,
        items: l.topics.map(function (t) { return { id: t.id, no: t.no, ko: t.ko, en: t.en, sub: t.point || '' }; }) });
    });
    return out;
  }
  function levelOf(id) { return data ? (levels().filter(function (l) { return l.id === id; })[0] || null) : null; }
  function itemOf(lv, id) { return lv && id ? (lv.items.filter(function (x) { return x.id === id; })[0] || null) : null; }
  var panelQuota = null;
  /* 횟수가 바뀌면 책 고르는 칸의 문구와 진행 막대를 함께 고친다(칸은 통째로 다시 그리지 않는다 — 고르던 책이 풀리지 않게). */
  function paintQuota() {
    if (panelQuota) { var q = quotaEl(true); panelQuota.replaceWith(q); panelQuota = q; }
    drawBar();
  }

  function current() { return state && state.book ? (data.books.filter(function (b) { return b.id === state.book; })[0] || null) : null; }

  function drawBar() {
    if (state && state.topic) return drawTopicBar();
    var b = current(); if (!b) { if (bar) bar.remove(); bar = null; return; }
    if (!barEl()) return;
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
    bar.replaceChildren(t, quotaEl(false), hb, out, hint);
  }

  /* 📍 진행 막대 자리(2026-11-02 사장님 「중간에 있으니 이상해」 → B안 «입력칸 위»).
     예전엔 #log 바로 앞이라 무대(아바타·대화창) 한가운데 떠 보였다. 이제 답하는 칸(.wg-composer) 맨 위 —
     질문 보고 → 💡 힌트 → 바로 답하기가 한곳에 모인다. 그 칸이 없는 화면(옛 판)이면 예전 자리(#log 앞)로. */
  function barEl() {
    var comp = document.querySelector('.wg-composer'), log = document.getElementById('log');
    var host = comp || (log && log.parentNode);
    if (!host) return null;
    css();
    if (!bar) { bar = document.createElement('div'); bar.id = 'eleaderL1Bar'; bar.setAttribute('role', 'status'); }
    if (comp) { if (bar.parentNode !== comp || comp.firstChild !== bar) comp.insertBefore(bar, comp.firstChild); bar.className = 'l1-in-composer'; }
    else if (!bar.parentNode) log.parentNode.insertBefore(bar, log);
    return bar;
  }

  /* 📚 Level 2~5 주제 대화 막대 — 문항 번호가 없다. 💡 은 주제 안내(Level 2 는 책 요점 원문). */
  function drawTopicBar() {
    if (!barEl()) return;
    var t = document.createElement('span');
    var strong = document.createElement('b'); strong.textContent = '📗 ' + state.level + ' · ' + T(state.title, state.titleEn || state.title);
    t.appendChild(strong);
    var hb = document.createElement('button'); hb.type = 'button'; hb.textContent = T('💡 주제 안내', '💡 Topic tip');
    var hint = document.createElement('span'); hint.className = 'l1-hint'; hint.hidden = true;
    hint.textContent = (state.point ? T('요점: ', 'Key question: ') + state.point + ' — ' : '')
      + T('내 경험이나 생각을 영어로 말해 보세요. 영어 주제: ', 'Talk about your own experience or ideas. Topic: ') + state.titleEn;
    hb.onclick = function () { hint.hidden = !hint.hidden; };
    var out = document.createElement('button'); out.type = 'button'; out.textContent = T('주제 그만하기', 'Leave topic');
    out.onclick = function () { stop(); try { window.addMsg(T('📗 엘리더잼 주제 연습을 마쳤어요. 이제 자유 대화예요.', '📗 Topic practice ended. Free talk now.'), 'sys'); } catch (e) {} };
    bar.replaceChildren(t, quotaEl(false), hb, out, hint);
  }

  function stop() {
    state = null;
    try { if (window.WCTX && /^엘리더잼 L\d/.test(window.WCTX.textbook || '')) { window.WCTX.textbook = ''; window.updateTopicChip && window.updateTopicChip(); } } catch (e) {}
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
    ui.lv = 'l1'; ui.pick = b.id;
    try {
      window.WCTX.textbook = '엘리더잼 L1 · ' + b.title; window.WCTX.level = ''; window.WCTX.lesson_no = 0; window.WCTX.sentences = [];
    } catch (e) {}
    var started = !!window._warmStarted;
    try { window.startWarmup(); } catch (e) {}
    drawBar();
    if (started) kick();   // 이미 대화 중이면 첫 인사(initGreeting)가 다시 안 돈다 — 첫 질문을 직접 부른다
  }

  /* 📚 Level 2~5 주제로 시작 — 수준·연령 표시는 서버가 쓸 값(levels 의 difficulty·age)에 맞춘다. 서버는 본문 값을 안 믿는다. */
  function startTopic(lv, it) {
    try { if (typeof window.clearBtsBook === 'function') window.clearBtsBook(false); } catch (e) {}
    try { if (lv.difficulty >= 1 && typeof window.setLevel === 'function') window.setLevel(lv.difficulty, false); } catch (e) {}
    try { if (lv.age && typeof window.setAge === 'function') window.setAge(lv.age, false); } catch (e) {}
    try { if (typeof window.isZh === 'function' && window.isZh() && typeof window.setWarmLang === 'function') window.setWarmLang('en', false); } catch (e) {}
    var unit = (it.no < 10 ? '0' : '') + it.no;
    state = { topic: it.id, level: lv.label, title: unit + lv.unit.ko + ' ' + it.ko, titleEn: it.en, point: it.sub || '',
      n: 0, q: 0, sid: window.SESSION_ID, last: null, tok: token(), wish: '' };
    ui.lv = lv.id; ui.pick = it.id; saveLv();
    try {
      window.WCTX.textbook = '엘리더잼 ' + lv.id.toUpperCase() + ' · ' + it.ko; window.WCTX.level = ''; window.WCTX.lesson_no = 0; window.WCTX.sentences = [];
    } catch (e) {}
    var started = !!window._warmStarted;
    try { window.startWarmup(); } catch (e) {}
    drawBar();
    if (started) kick();
  }

  async function kick() {
    if (window.sending) return;   // 답이 오가는 중이면 겹쳐 보내지 않는다(그 답 다음 턴부터 책 질문)
    try {
      var body = window.withCtx({ session_id: window.SESSION_ID, kickoff: 1, student_input: state && state.topic ? "Let's start the topic." : "Let's start the book." });
      var r = await window.warmupFetch(window.warmupEndpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { if ([429, 401, 403].indexOf(r.status) < 0) note(r.status); return; }   // 그 셋은 감싼 쪽이 이미 알렸다
      var d = await r.json();
      if (d && d.ai_response) { window.addMsg(d.ai_response, 'ai'); try { window.showAnswerChips(d.answer_chips, d.speaking_help); } catch (e) {} }
    } catch (e) {}
  }

  function note(status) {
    var c = quota.cap > 0 ? quota.cap : 0;
    var msg = status === 429 ? T('오늘 엘리더잼 대화 ' + (c ? c + '번을' : '횟수를') + ' 다 썼어요. 내일 다시 해요.',
        "You've used " + (c ? 'all ' + c + ' of ' : '') + "today's Eleader Jam turns. Try again tomorrow.")
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
    if (state.topic) {
      body.eleader_topic = state.topic;   // 📚 주제 대화 — 문항 번호가 없다(서버가 주제 지시를 만든다)
    } else if (body.kickoff === 1) {
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
    if (!state.topic) body.eleader_book = state.book;
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
      if (r && state === mine) takeQuota(r);   // 그 사이 로그인·책이 바뀌었으면 옛 계정의 횟수를 그리지 않는다
      /* 사유를 여기서 말했으면 표시를 남긴다 — warmup.html 이 «답변을 받아오지 못했어요» 를 겹쳐 쓰지 않게
         (2026-10-28 원장님 화면: 두 줄이 함께 떠 «고장» 으로 읽혔다). 이 콜백은 화면의 await 보다 먼저 돈다(같은 프로미스에 먼저 건 반응). */
      if (r && (r.status === 429 || r.status === 401 || r.status === 403)) { try { r.__eleaderNoted = true; } catch (e) {} note(r.status); }
      paintQuota();
    }, function () {});
    return p;
  };

  var epoch = 0;
  async function load() {
    var mine = ++epoch, tk = token();
    data = null; notice = ''; quota = { used: null, cap: null }; render();
    if (!tk) return;
    try {
      var r = await fetch('/api/ai/eleader/l1/books', { headers: { Authorization: 'Bearer ' + tk }, cache: 'no-store', credentials: 'omit' });
      if (mine !== epoch || token() !== tk) return;
      if (r.status === 401) {
        notice = T('다른 기기에서 새로 로그인되어 이 화면의 연결이 끊겼어요. 로그아웃 후 다시 로그인해 주세요.',
          'You logged in on another device, so this session ended. Please log out and log in again.');
        render(); return;
      }
      if (!r.ok) return;
      var d = await r.json();
      if (!d || d.ok !== true || !Array.isArray(d.books) || !d.books.length) return;
      quota = { used: typeof d.used_today === 'number' ? d.used_today : null, cap: d.daily_cap > 0 ? d.daily_cap : null };
      data = d; render(); drawBar();
    } catch (e) { /* 다른 학생은 예전 화면 그대로 */ }
  }
  window.addEventListener('storage', function (e) { if (e.key === 'mango_token' || e.key === null) { if (state && token() !== state.tok) stop(); load(); } });
  window.addEventListener('mangoi:lang-changed', function () { render(); drawBar(); });
  load();
})();
