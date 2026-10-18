/* ═══════════════════════════════════════════════════════════════════════
   📚 영어 독서 사다리 — 4단계 · 핵심 찾기 반복 (2026-10-18 사장님 지시)
   «적은 단계 + 충분한 글 + 핵심찾기 반복»
     1단계 쉬운 이야기(초1~3·A1) → 2단계 조금 긴 이야기(초4~6·A2)
     → 3단계 쉬운 지식 글(초6~중2·A2+/B1) → 4단계 고1 지식 글(중3~고1·B1+/B2)
   글은 /js/reading-ladder-data.js 의 window.READING_LADDER 한 곳이 정본.
   한 편마다: 읽기(듣기·해석) → ① 핵심 문장 찾기 → ② 중심 내용 고르기 → ③ 핵심 한 줄 영작.
   «🔁 핵심 찾기 반복» 은 같은 단계 글 5편의 중심 내용만 빠르게 다시 묻는다.

   ⛔ 정답을 맞혀야만 넘어가게 만들지 않는다 — 두 번 틀리면 «정답 보기» 가 열린다
      (CLAUDE.md 「정답을 맞혀야만 다음으로」: 못 푸는 학생이 갇힌다).
   ⛔ 포인트·서버 저장 없음 — 진행은 이 기기(localStorage)에만. 저장이 막혀도 화면은 그대로 동작.
   ⛔ 채점은 «핵심어가 들어갔나» 까지만 — 문법을 판정하지 않는다(AI 첨삭은 /ai-write.html 로 잇는다).
   하니스(reading_ladder_harness)가 아래 «CORE» 블록을 오려 내 실제로 돌린다.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* RL-CORE-START — DOM 없음. 하니스가 이 블록만 오려 내 실행한다. */
  var RLCore = {
    STORE_KEY: 'reading_ladder_v1',
    DRILL_SIZE: 5,
    WRONG_BEFORE_REVEAL: 2,
    // 다음 단계 추천: 그 단계 글의 2/3 이상을 끝내고, 중심 내용을 처음에 맞힌 비율이 70% 이상
    NEXT_DONE_RATIO: 2 / 3,
    NEXT_FIRST_TRY: 0.7,

    words: function (s) {
      return String(s || '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').split(/[\s-]+/).filter(Boolean);
    },
    wordCount: function (p) {
      var n = 0;
      (p.sentences || []).forEach(function (x) { n += RLCore.words(x.en).length; });
      return n;
    },
    // 핵심어가 학생 글에 들어 있나 — 낱말 단위 · 대소문자 무시 · 흔한 어미(s/es/ed/ing)까지 같은 낱말로 본다.
    stem: function (w) {
      w = String(w || '').toLowerCase().replace(/'s$/, '');
      if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
      if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
      if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
      if (w.length > 4 && /(ss|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);   // boxes·watches — homes 는 아래 -s 규칙
      if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
      return w;
    },
    checkSummary: function (text, keywords) {
      var have = {};
      RLCore.words(text).forEach(function (w) { have[RLCore.stem(w)] = 1; });
      var hit = [], miss = [];
      (keywords || []).forEach(function (k) {
        var parts = RLCore.words(k);
        var ok = parts.length > 0 && parts.every(function (w) { return have[RLCore.stem(w)]; });
        (ok ? hit : miss).push(k);
      });
      var hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(String(text || ''));
      var n = RLCore.words(text).length;
      var verdict = hasKorean ? 'korean' : n < 3 ? 'short' : hit.length === (keywords || []).length ? 'great' : hit.length >= 2 ? 'good' : 'try';
      return { hit: hit, miss: miss, verdict: verdict, total: (keywords || []).length };
    },
    // 결정론적 섞기(같은 글은 같은 순서) — 보기 순서가 다시 그릴 때마다 바뀌면 «방금 고른 자리» 가 움직인다.
    seededOrder: function (n, seed) {
      var idx = [], h = 2166136261, i;
      for (i = 0; i < String(seed).length; i++) { h ^= String(seed).charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      for (i = 0; i < n; i++) idx.push(i);
      for (i = n - 1; i > 0; i--) {
        h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
        var j = h % (i + 1), t = idx[i]; idx[i] = idx[j]; idx[j] = t;
      }
      return idx;
    },
    // 진행 기록 r = { k:'ok'|'retry'|'shown', m:..., s:'great'|'good'|'shown'|... }
    isDone: function (r) { return !!(r && r.k && r.m && r.s); },
    stageStats: function (passages, stage, prog) {
      var list = passages.filter(function (p) { return p.stage === stage; });
      var done = 0, first = 0, answered = 0;
      list.forEach(function (p) {
        var r = (prog || {})[p.id];
        if (RLCore.isDone(r)) done++;
        if (r && r.m) { answered++; if (r.m === 'ok') first++; }
      });
      return { total: list.length, done: done, answered: answered, firstTry: first,
        firstRatio: answered ? first / answered : 0 };
    },
    recommendNext: function (passages, stage, prog, maxStage) {
      if (stage >= maxStage) return false;
      var st = RLCore.stageStats(passages, stage, prog);
      return st.total > 0 && st.done >= Math.ceil(st.total * RLCore.NEXT_DONE_RATIO) && st.firstRatio >= RLCore.NEXT_FIRST_TRY;
    },
    // 단계 평균 단어 수(반올림) — 목록·전체 보기가 같은 값을 쓴다.
    stageAvgWords: function (passages, stage) {
      var list = passages.filter(function (p) { return p.stage === stage; });
      if (!list.length) return 0;
      return Math.round(list.reduce(function (a, p) { return a + RLCore.wordCount(p); }, 0) / list.length);
    },
    // 그 단계 주제 목록 — 처음 나온 순서 · 개수 함께 (주제 거르기 칩).
    topicsOf: function (passages, stage) {
      var seen = {}, out = [];
      passages.forEach(function (p) {
        if (p.stage !== stage || !p.topic) return;
        var k = p.topic.ko;
        if (!seen[k]) { seen[k] = { key: k, label: p.topic, count: 0 }; out.push(seen[k]); }
        seen[k].count++;
      });
      return out;
    },
    // 주제 거르기 — 모르는 주제(다른 단계에서 넘어온 값)면 거르지 않는다(빈 목록이 «글이 없다» 로 읽히지 않게).
    filterByTopic: function (list, topic) {
      if (!topic) return list;
      var f = list.filter(function (p) { return p.topic && p.topic.ko === topic; });
      return f.length ? f : list;
    },
    // 반복 연습 5편 — 아직 «처음에 맞히지» 못한 글을 먼저, 그다음 나머지(같은 날은 같은 순서).
    pickDrill: function (passages, stage, prog, seed) {
      var list = passages.filter(function (p) { return p.stage === stage; });
      var weak = [], rest = [];
      list.forEach(function (p) { var r = (prog || {})[p.id]; ((r && r.m === 'ok') ? rest : weak).push(p); });
      function shuf(a) { var o = RLCore.seededOrder(a.length, seed + ':' + a.length); return o.map(function (i) { return a[i]; }); }
      return shuf(weak).concat(shuf(rest)).slice(0, RLCore.DRILL_SIZE);
    }
  };
  /* RL-CORE-END */
  window.ReadingLadderCore = RLCore;

  var DATA = window.READING_LADDER;
  var root = document.getElementById('rlApp');
  if (!DATA || !root) return;
  // 그림 동화책은 2단계 안에 함께 그리므로 예비 목록 칸은 감춘다(이 스크립트를 못 받으면 그 칸이 그대로 보인다).
  var booksWrap = document.getElementById('booksWrap');
  if (booksWrap && window.__storyBooksHtml) booksWrap.hidden = true;
  var PASSAGES = DATA.passages;
  var STAGES = DATA.stages;
  var MAX_STAGE = STAGES.length;

  /* ── 저장(이 기기) — 막혀도 메모리로 계속 ── */
  // layout: 'all' = 4단계 한눈에(처음 오면 이것) · 'stage' = 한 단계 자세히
  var state = { stage: 1, prog: {}, layout: 'all' };
  try {
    var saved = JSON.parse(localStorage.getItem(RLCore.STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (saved.prog && typeof saved.prog === 'object') state.prog = saved.prog;
      if (saved.stage >= 1 && saved.stage <= MAX_STAGE) state.stage = saved.stage;
      if (saved.layout === 'stage' || saved.layout === 'all') state.layout = saved.layout;
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(RLCore.STORE_KEY, JSON.stringify(state)); } catch (e) {} }
  function rec(id) { return state.prog[id] || (state.prog[id] = {}); }

  function lang() { try { return (window.__storyLang && window.__storyLang()) || 'ko'; } catch (e) { return 'ko'; } }
  function T(ko, en) { return lang() === 'en' ? en : ko; }
  function L(o) { return o ? (lang() === 'en' ? o.en : o.ko) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function byId(id) { for (var i = 0; i < PASSAGES.length; i++) if (PASSAGES[i].id === id) return PASSAGES[i]; return null; }
  function stageMeta(n) { return STAGES[n - 1]; }
  // 🖼 글마다 같은 내용의 그림 동화책(story-<id>.html)이 있다. 도장 기록은 그 화면과 같은 키를 읽는다.
  var BOOK_STAMPS = ['read', 'key', 'sum', 'words', 'infer', 'write'];
  function bookStamps(id) {
    var st = {};
    try { st = JSON.parse(localStorage.getItem('story_' + id + '_stamps') || '{}') || {}; } catch (e) { st = {}; }
    return BOOK_STAMPS.filter(function (k) { return !!st[k]; }).length;
  }
  function bookTag(id) {
    var n = bookStamps(id);
    return '<span class="rl-pic">🖼 ' + esc(n >= 6 ? T('그림책 완주', 'Book done') : n > 0 ? T('그림책 ', 'Book ') + n + '/6' : T('그림책', 'Picture book')) + '</span>';
  }

  /* ── 🔊 듣기 — 기기 목소리(없으면 버튼을 안 그린다) ── */
  var canSpeak = !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  function stopSpeak() { try { if (canSpeak) window.speechSynthesis.cancel(); } catch (e) {} }
  function speak(text, stage) {
    if (!canSpeak) return;
    stopSpeak();
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = stage <= 1 ? 0.8 : stage === 2 ? 0.88 : 0.95;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ── 화면 상태 ── */
  var view = { mode: 'list', id: null, drill: null, topic: '', showKo: false, keyWrong: 0, mainWrong: 0, keyPicked: null, mainPicked: null, sumResult: null };

  function render() {
    stopSpeak();
    if (view.mode === 'read') return renderReader();
    if (view.mode === 'drill') return renderDrill();
    renderList();
  }

  /* ════ 목록 ════ */
  function cardStatus(p) {
    var r = state.prog[p.id];
    var done = RLCore.isDone(r);
    var stepN = r ? ((r.k ? 1 : 0) + (r.m ? 1 : 0) + (r.s ? 1 : 0)) : 0;
    return { done: done, text: done ? '✅ ' + T('핵심 찾기 완료', 'Done') : stepN ? '🟡 ' + T('진행 ' + stepN + ' / 3', 'In progress ' + stepN + ' / 3') : T('새 글', 'New') };
  }
  function layoutSwitch() {
    function b(k, ko, en) {
      return '<button type="button" class="rl-seg' + (state.layout === k ? ' on' : '') + '" data-act="layout" data-layout="' + k + '" aria-pressed="' + (state.layout === k) + '">' + esc(T(ko, en)) + '</button>';
    }
    return '<div class="rl-segs" role="group" aria-label="' + esc(T('보기 방식', 'View')) + '">' +
      b('all', '📋 단계별 한눈에', '📋 All steps') + b('stage', '📖 한 단계 자세히', '📖 One step') + '</div>';
  }
  function progBar(st, color) {
    var pct = st.total ? Math.round(st.done * 100 / st.total) : 0;
    return '<span class="rl-pbar" style="--sc:' + color + '" role="img" aria-label="' + esc(T('완료 ' + st.done + ' / ' + st.total, 'Done ' + st.done + ' of ' + st.total)) + '"><i style="width:' + pct + '%"></i></span>';
  }

  /* 📋 4단계 한눈에 — 단계마다 학년·CEFR·평균 단어·진행 + 글 목록(그림 동화책은 2단계 안에 «그림책» 표시) */
  function renderOverview() {
    var books = (window.__storyBookList && window.__storyBookList()) || [];
    var secs = STAGES.map(function (s) {
      var st = RLCore.stageStats(PASSAGES, s.n, state.prog);
      var rows = PASSAGES.filter(function (p) { return p.stage === s.n; }).map(function (p, i) {
        var cs = cardStatus(p);
        return '<li><button type="button" class="rl-li' + (cs.done ? ' done' : '') + '" data-act="open" data-id="' + p.id + '">' +
          '<span class="rl-li-no">' + (i + 1) + '</span>' +
          '<span class="rl-li-t">' + esc(p.title.en) + ' ' + bookTag(p.id) + '<small>' + esc(p.title.ko) + '</small></span>' +
          '<span class="rl-li-m">' + esc(L(p.topic)) + ' · ' + RLCore.wordCount(p) + T('단어', 'w') + '</span>' +
          '<span class="rl-li-s">' + esc(cs.text) + '</span></button></li>';
      }).join('');
      var bookRows = s.n === 2 ? books.map(function (b) {
        var prog = b.n >= 6 ? '🎉 ' + T('완주', 'Finished') : b.n > 0 ? '🏅 ' + b.n + ' / 6' : T('새 책', 'New');
        return '<li><a class="rl-li rl-li-book' + (b.n >= 6 ? ' done' : '') + '" href="/story-' + esc(b.id) + '.html">' +
          '<span class="rl-li-no">🖼</span>' +
          '<span class="rl-li-t">' + esc(b.title) + ' <span class="rl-pic">' + esc(T('그림책', 'Picture book')) + '</span><small>' + esc(lang() === 'en' ? b.en : b.ko) + '</small></span>' +
          '<span class="rl-li-m">' + esc(T('도장 6개 +10P', '6 stamps = +10P')) + '</span>' +
          '<span class="rl-li-s">' + esc(prog) + '</span></a></li>';
      }).join('') : '';
      return '<section class="rl-sec" style="--sc:' + s.color + '" aria-labelledby="rlSec' + s.n + '">' +
        '<div class="rl-sec-h"><div class="rl-sec-t">' +
          '<span class="rl-sec-n">' + esc(T(s.n + '단계', 'Step ' + s.n)) + '</span>' +
          '<h2 id="rlSec' + s.n + '">' + esc(L(s.name)) + '</h2>' +
          '<span class="rl-sec-g">' + esc(L(s.grade)) + ' · ' + esc(s.cefr) + ' · ' + esc(T('평균 ' + RLCore.stageAvgWords(PASSAGES, s.n) + '단어', 'avg ' + RLCore.stageAvgWords(PASSAGES, s.n) + ' words')) +
            ' · ' + esc(T((s.n <= 2 ? '이야기 ' : '지식 글 ') + st.total + '편' + (s.n === 2 && books.length ? ' + 그림책 ' + books.length + '권' : ''),
                          st.total + (s.n <= 2 ? ' stories' : ' non-fiction texts') + (s.n === 2 && books.length ? ' + ' + books.length + ' picture books' : ''))) + '</span>' +
          '<span class="rl-sec-d">' + esc(L(s.desc)) + '</span></div>' +
          '<div class="rl-sec-p">' + progBar(st, s.color) + '<span>' + esc(T('완료 ' + st.done + ' / ' + st.total, 'Done ' + st.done + ' / ' + st.total)) + '</span>' +
            '<button type="button" class="rl-btn rl-primary" data-act="stage" data-stage="' + s.n + '">' + esc(T('이 단계 공부하기 ▶', 'Study this step ▶')) + '</button></div></div>' +
        '<ol class="rl-list">' + rows + bookRows + '</ol></section>';
    }).join('');
    var jump = '<nav class="rl-jump" aria-label="' + esc(T('단계 바로가기', 'Jump to a step')) + '">' + STAGES.map(function (s) {
      var st = RLCore.stageStats(PASSAGES, s.n, state.prog);
      return '<button type="button" class="rl-jbtn" style="--sc:' + s.color + '" data-act="jump" data-stage="' + s.n + '">' +
        '<b>' + esc(T(s.n + '단계', 'Step ' + s.n)) + '</b> ' + esc(L(s.name)) + ' <span>' + st.done + '/' + st.total + '</span></button>';
    }).join('') + '</nav>';
    root.innerHTML = layoutSwitch() + jump +
      '<p class="rl-howto">' + esc(T('단계를 고르거나 글 제목을 바로 눌러 시작하세요. 1단계부터 차례로 올라가면 가장 좋아요.',
        'Pick a step or tap any title to start. Climbing from Step 1 works best.')) + '</p>' + secs;
  }

  function renderList() {
    if (state.layout === 'all') return renderOverview();
    var cur = state.stage;
    var tabs = STAGES.map(function (s) {
      var st = RLCore.stageStats(PASSAGES, s.n, state.prog);
      return '<button type="button" class="rl-tab' + (s.n === cur ? ' on' : '') + '" style="--sc:' + s.color + '" data-act="stage" data-stage="' + s.n + '" aria-pressed="' + (s.n === cur) + '">' +
        '<span class="rl-tab-n">' + esc(T(s.n + '단계', 'Step ' + s.n)) + '</span>' +
        '<span class="rl-tab-t">' + esc(L(s.name)) + '</span>' +
        '<span class="rl-tab-g">' + esc(L(s.grade)) + ' · ' + esc(s.cefr) + ' · ' + esc(T('평균 ' + RLCore.stageAvgWords(PASSAGES, s.n) + '단어', 'avg ' + RLCore.stageAvgWords(PASSAGES, s.n) + 'w')) + '</span>' +
        '<span class="rl-tab-p">' + progBar(st, s.color) + esc(T('완료 ', 'Done ') + st.done + ' / ' + st.total) + '</span></button>';
    }).join('');
    var meta = stageMeta(cur);
    var st = RLCore.stageStats(PASSAGES, cur, state.prog);
    var next = RLCore.recommendNext(PASSAGES, cur, state.prog, MAX_STAGE);
    var nextBox = next ? '<div class="rl-next" role="status">🎉 ' + esc(T(
        cur + '단계 글을 ' + st.done + '편 끝냈고 처음에 맞힌 비율이 ' + Math.round(st.firstRatio * 100) + '%예요. ' + (cur + 1) + '단계로 올라가 볼까요?',
        'You finished ' + st.done + ' texts with ' + Math.round(st.firstRatio * 100) + '% right on the first try. Ready for Step ' + (cur + 1) + '?')) +
        ' <button type="button" class="rl-btn rl-primary" data-act="stage" data-stage="' + (cur + 1) + '">' + esc(T((cur + 1) + '단계로 ▶', 'Go to Step ' + (cur + 1) + ' ▶')) + '</button></div>' : '';
    var stageList = PASSAGES.filter(function (p) { return p.stage === cur; });
    var topics = RLCore.topicsOf(PASSAGES, cur);
    var shown = RLCore.filterByTopic(stageList, view.topic);
    var topicOn = shown !== stageList;
    var chips = topics.length > 1 ? '<div class="rl-topics" role="group" aria-label="' + esc(T('주제로 거르기', 'Filter by topic')) + '">' +
      '<button type="button" class="rl-tchip' + (topicOn ? '' : ' on') + '" data-act="topic" data-topic="" aria-pressed="' + !topicOn + '">' + esc(T('전체', 'All')) + ' ' + stageList.length + '</button>' +
      topics.map(function (t) {
        var on = topicOn && view.topic === t.key;
        return '<button type="button" class="rl-tchip' + (on ? ' on' : '') + '" data-act="topic" data-topic="' + esc(t.key) + '" aria-pressed="' + on + '">' + esc(L(t.label)) + ' ' + t.count + '</button>';
      }).join('') + '</div>' : '';
    var cards = shown.map(function (p) {
      var cs = cardStatus(p), done = cs.done, status = cs.text;
      return '<button type="button" class="rl-card' + (done ? ' done' : '') + '" data-act="open" data-id="' + p.id + '">' +
        '<span class="rl-card-no">' + (stageList.indexOf(p) + 1) + '</span>' +
        '<span class="rl-card-b"><span class="rl-card-t">' + esc(p.title.en) + '</span>' +
        '<span class="rl-card-k">' + esc(p.title.ko) + ' ' + bookTag(p.id) + '</span>' +
        '<span class="rl-card-m">' + esc(L(p.topic)) + ' · ' + RLCore.wordCount(p) + T('단어', ' words') + ' · ' + esc(p.genre === 'story' ? T('이야기', 'Story') : T('지식 글', 'Non-fiction')) + '</span>' +
        '<span class="rl-card-s">' + esc(status) + '</span></span></button>';
    }).join('');
    var books = (cur === 2 && !topicOn && window.__storyBooksHtml) ? '<h3 class="rl-h3">' + esc(T('🖼 그림 동화책 (2단계 · 도장 6개 +10P)', '🖼 Picture storybooks (Step 2 · 6 stamps = +10P)')) + '</h3><div class="grid">' + window.__storyBooksHtml() + '</div>' : '';
    root.innerHTML = layoutSwitch() +
      '<div class="rl-tabs" role="group" aria-label="' + esc(T('단계 고르기', 'Choose a step')) + '">' + tabs + '</div>' +
      '<div class="rl-stagehead" style="--sc:' + meta.color + '">' +
        '<div><b>' + esc(T(cur + '단계 · ', 'Step ' + cur + ' · ') + L(meta.name)) + '</b> <span>' + esc(L(meta.desc)) + '</span></div>' +
        '<button type="button" class="rl-btn rl-primary" data-act="drill">🔁 ' + esc(T('핵심 찾기 반복 (' + RLCore.DRILL_SIZE + '문제)', 'Main-idea drill (' + RLCore.DRILL_SIZE + ')')) + '</button>' +
      '</div>' + nextBox +
      '<div class="rl-howto">' + esc(T('한 편마다: 📖 읽기 → ① 핵심 문장 찾기 → ② 중심 내용 고르기 → ③ 핵심을 영어 한 문장으로 쓰기',
        'Each text: 📖 read → ① find the key sentence → ② choose the main idea → ③ write the main idea in one English sentence')) + '</div>' +
      chips + '<div class="rl-cards">' + cards + '</div>' + books;
  }

  /* ════ 읽기 + 3단계 ════ */
  function passageHtml(p, pickable) {
    var r = state.prog[p.id] || {};
    return '<div class="rl-text' + (pickable ? ' pick' : '') + '">' + p.sentences.map(function (s, i) {
      var cls = 'rl-s';
      if (view.keyPicked === i) cls += (i === p.key ? ' ok' : ' no');
      if ((r.k && i === p.key) || (view.keyPicked === i && i === p.key)) cls += ' ok';
      var inner = '<span class="rl-en">' + esc(s.en) + '</span>' + (view.showKo ? '<span class="rl-ko">' + esc(s.ko) + '</span>' : '');
      return pickable ? '<button type="button" class="' + cls + '" data-act="key" data-i="' + i + '">' + inner + '</button> '
                      : '<span class="' + cls + '">' + inner + '</span> ';
    }).join('') + '</div>';
  }

  function renderReader() {
    var p = byId(view.id);
    if (!p) { view.mode = 'list'; return renderList(); }
    var r = state.prog[p.id] || {};
    var meta = stageMeta(p.stage);
    var keyDone = !!r.k;
    var mainDone = !!r.m;
    var sumDone = !!r.s;
    var list = PASSAGES.filter(function (x) { return x.stage === p.stage; });
    var idx = list.indexOf(p);
    var nextP = list[idx + 1];

    // ① 핵심 문장
    var s1 = '<section class="rl-step' + (keyDone ? ' fin' : ' cur') + '"><h3>① ' + esc(T('핵심 문장 찾기', 'Find the key sentence')) + (keyDone ? ' ✅' : '') + '</h3>';
    if (!keyDone) {
      s1 += '<p class="rl-q">' + esc(T('이 글에서 «가장 중요한 한 문장» 을 위 글에서 눌러 보세요.', 'Tap the one sentence above that matters most.')) + '</p>';
      if (view.keyPicked != null && view.keyPicked !== p.key) s1 += '<p class="rl-fb no">' + esc(T('다시 골라 볼까요?', 'Try another one.')) + ' ' +
        esc(view.keyWrong >= 1 ? T('힌트: 글 전체를 한마디로 말하는 문장은 보통 처음이나 끝, 또는 «그래서·하지만» 뒤에 있어요.', 'Hint: the sentence that sums up the whole text is often first, last, or right after "so" or "however".') : '') + '</p>';
      if (view.keyWrong >= RLCore.WRONG_BEFORE_REVEAL) s1 += '<button type="button" class="rl-btn" data-act="keyreveal">' + esc(T('정답 보기', 'Show the answer')) + '</button>';
    } else {
      s1 += '<p class="rl-fb ok">' + esc(L(p.keyWhy)) + '</p>';
    }
    s1 += '</section>';

    // ② 중심 내용
    var s2 = '';
    if (keyDone) {
      var order = RLCore.seededOrder(p.main.options.length, p.id);
      s2 = '<section class="rl-step' + (mainDone ? ' fin' : ' cur') + '"><h3>② ' + esc(T('중심 내용 고르기', 'Choose the main idea')) + (mainDone ? ' ✅' : '') + '</h3>' +
        '<p class="rl-q">' + esc(T('이 글이 말하려는 것으로 가장 알맞은 것은?', 'What is this text mainly about?')) + '</p><div class="rl-opts">' +
        order.map(function (oi) {
          var o = p.main.options[oi], cls = 'rl-opt';
          if (mainDone && oi === p.main.answer) cls += ' ok';
          else if (view.mainPicked === oi) cls += ' no';
          return '<button type="button" class="' + cls + '" data-act="main" data-o="' + oi + '"' + (mainDone ? ' disabled' : '') + '>' +
            '<span class="rl-en">' + esc(o.en) + '</span>' + (view.showKo || p.stage <= 2 ? '<span class="rl-ko">' + esc(o.ko) + '</span>' : '') + '</button>';
        }).join('') + '</div>';
      if (!mainDone && view.mainPicked != null) s2 += '<p class="rl-fb no">' + esc(T('아쉬워요. 그 보기는 글의 «일부» 이거나 글과 달라요. 다시 골라 봐요.', 'Not quite. That choice is only a detail or does not match. Try again.')) + '</p>';
      if (!mainDone && view.mainWrong >= RLCore.WRONG_BEFORE_REVEAL) s2 += '<button type="button" class="rl-btn" data-act="mainreveal">' + esc(T('정답 보기', 'Show the answer')) + '</button>';
      if (mainDone) s2 += '<p class="rl-fb ok">' + esc(L(p.main.why)) + '</p>';
      s2 += '</section>';
    }

    // ③ 핵심 한 줄 영작
    var s3 = '';
    if (mainDone) {
      var res = view.sumResult;
      var fb = '';
      if (res) {
        var msg = {
          great: T('핵심어 ' + res.total + '개가 모두 들어갔어요! 훌륭해요. 🌟', 'All ' + res.total + ' key words are in. Great job! 🌟'),
          good: T('좋아요! 핵심어 ' + res.hit.length + '개가 들어갔어요. 빠진 말: ', 'Good! ' + res.hit.length + ' key words are in. Missing: ') + res.miss.join(', '),
          try: T('핵심어가 조금 부족해요. 아래 힌트 낱말을 넣어 다시 써 볼까요?', 'A few key words are missing. Try again with the hint words.'),
          short: T('세 낱말 이상 영어로 써 주세요.', 'Please write at least three English words.'),
          korean: T('영어로만 써 주세요. (우리말은 위 해석에서 볼 수 있어요)', 'Please write in English only.')
        }[res.verdict];
        fb = '<p class="rl-fb ' + (res.verdict === 'great' || res.verdict === 'good' ? 'ok' : 'no') + '">' + esc(msg) + '</p>';
      }
      s3 = '<section class="rl-step' + (sumDone ? ' fin' : ' cur') + '"><h3>③ ' + esc(T('핵심을 영어 한 문장으로', 'Write the main idea in one sentence')) + (sumDone ? ' ✅' : '') + '</h3>' +
        '<p class="rl-q">' + esc(T('이 우리말을 영어로 써 보세요: ', 'Write this in English: ')) + '<b>' + esc(p.summary.ko) + '</b></p>' +
        '<div class="rl-chips"><span class="rl-chiplab">' + esc(T('힌트 낱말', 'Hint words')) + '</span>' +
        p.summary.keywords.map(function (k) { return '<span class="rl-chip">' + esc(k) + '</span>'; }).join('') + '</div>' +
        '<label class="rl-sr" for="rlSum">' + esc(T('내 영어 문장', 'My sentence')) + '</label>' +
        '<textarea id="rlSum" class="rl-sum" rows="2" maxlength="300" spellcheck="false" autocapitalize="sentences" placeholder="' + esc(T('여기에 영어로 써요', 'Write in English here')) + '">' + esc(r.sText || '') + '</textarea>' +
        '<div class="rl-row"><button type="button" class="rl-btn rl-primary" data-act="sumcheck">' + esc(T('확인하기', 'Check')) + '</button>' +
        '<button type="button" class="rl-btn" data-act="sumshow">' + esc(T('모범 문장 보기', 'Show model sentence')) + '</button>' +
        '<a class="rl-btn" href="/ai-write.html">✍️ ' + esc(T('AI 첨삭으로 더 길게 쓰기', 'Write more with AI correction')) + '</a></div>' + fb +
        (r.s === 'shown' || (res && (res.verdict === 'great' || res.verdict === 'good')) || r.showModel ? '<p class="rl-model">💡 ' + esc(p.summary.en) + '</p>' : '') +
        '</section>';
    }

    var words = '<div class="rl-words"><span class="rl-chiplab">' + esc(T('📒 오늘의 낱말', '📒 Words')) + '</span>' + p.words.map(function (w) {
      return '<span class="rl-word"><b>' + esc(w.en) + '</b> ' + esc(w.ko) + '</span>';
    }).join('') + '</div>';

    var end = (keyDone && mainDone && sumDone) ? '<div class="rl-end">🎉 ' + esc(T('이 글의 핵심 찾기를 끝냈어요!', 'You finished this text!')) + ' ' +
      (nextP ? '<button type="button" class="rl-btn rl-primary" data-act="open" data-id="' + nextP.id + '">' + esc(T('다음 글 ▶', 'Next text ▶')) + '</button>' : '') +
      '<button type="button" class="rl-btn" data-act="list">' + esc(T('목록으로', 'Back to list')) + '</button></div>' : '';

    root.innerHTML =
      '<div class="rl-bar"><button type="button" class="rl-btn" data-act="list">← ' + esc(T('목록', 'List')) + '</button>' +
        '<span class="rl-badge" style="--sc:' + meta.color + '">' + esc(T(p.stage + '단계', 'Step ' + p.stage) + ' · ' + L(meta.name)) + '</span>' +
        '<span class="rl-pos">' + (idx + 1) + ' / ' + list.length + '</span></div>' +
      '<article class="rl-read" aria-labelledby="rlTitle">' +
        '<h2 id="rlTitle">' + esc(p.title.en) + '</h2><p class="rl-sub">' + esc(p.title.ko) + ' · ' + esc(L(p.topic)) + ' · ' + RLCore.wordCount(p) + T('단어', ' words') + '</p>' +
        '<div class="rl-bg">🧠 <b>' + esc(T('배경지식', 'Background')) + '</b> ' + esc(L(p.bg)) + '</div>' +
        '<div class="rl-row">' + (canSpeak ? '<button type="button" class="rl-btn" data-act="speak">🔊 ' + esc(T('듣기', 'Listen')) + '</button>' : '') +
          '<a class="rl-btn rl-primary" href="/story-' + esc(p.id) + '.html">🖼 ' + esc(T('그림 동화책으로 읽기 (도장 6개 +10P · 하루 2권까지)', 'Read as a picture book (6 stamps = +10P · up to 2 books a day)')) + '</a>' +
          '<button type="button" class="rl-btn" data-act="ko" aria-pressed="' + view.showKo + '">🇰🇷 ' + esc(view.showKo ? T('해석 숨기기', 'Hide Korean') : T('해석 보기', 'Show Korean')) + '</button></div>' +
        passageHtml(p, !keyDone) + words +
      '</article>' + s1 + s2 + s3 + end;
  }

  /* ════ 핵심 찾기 반복 ════ */
  function renderDrill() {
    var d = view.drill;
    if (d.i >= d.list.length) {
      root.innerHTML = '<div class="rl-bar"><button type="button" class="rl-btn" data-act="list">← ' + esc(T('목록', 'List')) + '</button></div>' +
        '<div class="rl-end big">🏁 ' + esc(T(d.list.length + '문제 중 ' + d.first + '문제를 처음에 맞혔어요!', 'First-try correct: ' + d.first + ' of ' + d.list.length + '!')) +
        '<p>' + esc(d.first === d.list.length ? T('완벽해요! 다음 단계도 도전해 보세요.', 'Perfect! Try the next step too.') : T('틀린 글은 다시 읽고 ① 핵심 문장부터 찾아보면 실력이 쑥 늘어요.', 'Re-read the ones you missed and start from the key sentence.')) + '</p>' +
        '<button type="button" class="rl-btn rl-primary" data-act="drill">🔁 ' + esc(T('한 번 더', 'Again')) + '</button> ' +
        '<button type="button" class="rl-btn" data-act="list">' + esc(T('목록으로', 'Back to list')) + '</button></div>';
      return;
    }
    var p = d.list[d.i];
    var order = RLCore.seededOrder(p.main.options.length, p.id + ':drill');
    var answered = d.picked != null && (d.picked === p.main.answer || d.revealed);
    root.innerHTML =
      '<div class="rl-bar"><button type="button" class="rl-btn" data-act="list">← ' + esc(T('그만하기', 'Stop')) + '</button>' +
        '<span class="rl-badge" style="--sc:' + stageMeta(p.stage).color + '">🔁 ' + esc(T('핵심 찾기 반복', 'Main-idea drill')) + '</span>' +
        '<span class="rl-pos">' + (d.i + 1) + ' / ' + d.list.length + '</span></div>' +
      '<article class="rl-read"><h2>' + esc(p.title.en) + '</h2>' +
        '<div class="rl-row">' + (canSpeak ? '<button type="button" class="rl-btn" data-act="speak">🔊 ' + esc(T('듣기', 'Listen')) + '</button>' : '') +
        '<button type="button" class="rl-btn" data-act="ko" aria-pressed="' + view.showKo + '">🇰🇷 ' + esc(view.showKo ? T('해석 숨기기', 'Hide Korean') : T('해석 보기', 'Show Korean')) + '</button></div>' +
        passageHtml(p, false) + '</article>' +
      '<section class="rl-step cur"><h3>' + esc(T('중심 내용은?', 'Main idea?')) + '</h3><div class="rl-opts">' +
        order.map(function (oi) {
          var o = p.main.options[oi], cls = 'rl-opt';
          if (answered && oi === p.main.answer) cls += ' ok';
          else if (d.picked === oi && oi !== p.main.answer) cls += ' no';
          return '<button type="button" class="' + cls + '" data-act="dmain" data-o="' + oi + '"' + (answered ? ' disabled' : '') + '><span class="rl-en">' + esc(o.en) + '</span>' +
            (view.showKo || p.stage <= 2 ? '<span class="rl-ko">' + esc(o.ko) + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        (answered ? '<p class="rl-fb ok">' + esc(L(p.main.why)) + '</p><p class="rl-fb">🔑 ' + esc(T('핵심 문장: ', 'Key sentence: ')) + esc(p.sentences[p.key].en) + '</p>' +
          '<button type="button" class="rl-btn rl-primary" data-act="dnext">' + esc(T('다음 ▶', 'Next ▶')) + '</button>' :
          (d.picked != null ? '<p class="rl-fb no">' + esc(T('다시 골라 볼까요?', 'Try again.')) + '</p>' : '') +
          (d.wrong >= RLCore.WRONG_BEFORE_REVEAL ? '<button type="button" class="rl-btn" data-act="dreveal">' + esc(T('정답 보기', 'Show the answer')) + '</button>' : '')) +
      '</section>';
  }

  /* ════ 조작 ════ */
  function openPassage(id) {
    view = { mode: 'read', id: id, drill: null, topic: view.topic, showKo: view.showKo, keyWrong: 0, mainWrong: 0, keyPicked: null, mainPicked: null, sumResult: null };
    render();
    try { root.scrollIntoView({ block: 'start' }); } catch (e) {}
  }

  root.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!t || !root.contains(t)) return;
    var act = t.getAttribute('data-act');
    var p = view.id ? byId(view.id) : null;
    if (act === 'stage') { state.stage = Number(t.getAttribute('data-stage')) || 1; state.layout = 'stage'; view.topic = ''; save(); view.mode = 'list'; render(); try { root.scrollIntoView({ block: 'start' }); } catch (e) {} return; }
    if (act === 'layout') { state.layout = t.getAttribute('data-layout') === 'stage' ? 'stage' : 'all'; save(); view.mode = 'list'; render(); return; }
    if (act === 'jump') {
      var h = document.getElementById('rlSec' + t.getAttribute('data-stage'));
      var sec = h && h.closest ? h.closest('.rl-sec') : null;
      if (sec) { try { sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { sec.scrollIntoView(); } }
      return;
    }
    if (act === 'topic') { view.topic = t.getAttribute('data-topic') || ''; render(); return; }
    if (act === 'open') { openPassage(t.getAttribute('data-id')); return; }
    if (act === 'list') { view.mode = 'list'; view.id = null; render(); return; }
    if (act === 'ko') { view.showKo = !view.showKo; render(); return; }
    if (act === 'speak') {
      var sp = view.mode === 'drill' ? view.drill.list[view.drill.i] : p;
      if (sp) speak(sp.sentences.map(function (s) { return s.en; }).join(' '), sp.stage);
      return;
    }
    if (act === 'drill') {
      var seed = new Date().toISOString().slice(0, 10) + ':' + state.stage + ':' + Math.floor(Date.now() / 60000);
      view = { mode: 'drill', id: null, topic: view.topic, showKo: false, drill: { list: RLCore.pickDrill(PASSAGES, state.stage, state.prog, seed), i: 0, picked: null, wrong: 0, revealed: false, first: 0 } };
      render(); return;
    }
    if (act === 'key' && p) {
      var i = Number(t.getAttribute('data-i'));
      view.keyPicked = i;
      if (i === p.key) { rec(p.id).k = view.keyWrong ? 'retry' : 'ok'; save(); }
      else view.keyWrong++;
      render(); return;
    }
    if (act === 'keyreveal' && p) { rec(p.id).k = 'shown'; view.keyPicked = p.key; save(); render(); return; }
    if (act === 'main' && p) {
      var o = Number(t.getAttribute('data-o'));
      view.mainPicked = o;
      if (o === p.main.answer) { rec(p.id).m = view.mainWrong ? 'retry' : 'ok'; save(); }
      else view.mainWrong++;
      render(); return;
    }
    if (act === 'mainreveal' && p) { rec(p.id).m = 'shown'; save(); render(); return; }
    if (act === 'sumcheck' && p) {
      var ta = document.getElementById('rlSum');
      var txt = ta ? ta.value : '';
      var res = RLCore.checkSummary(txt, p.summary.keywords);
      view.sumResult = res;
      var r = rec(p.id); r.sText = txt.slice(0, 300);
      if (res.verdict === 'great' || res.verdict === 'good') r.s = res.verdict;
      save(); render(); return;
    }
    if (act === 'sumshow' && p) { var r2 = rec(p.id); r2.showModel = 1; if (!r2.s) r2.s = 'shown'; var ta2 = document.getElementById('rlSum'); if (ta2) r2.sText = ta2.value.slice(0, 300); save(); render(); return; }
    if (view.mode === 'drill') {
      var d = view.drill, dp = d.list[d.i];
      if (act === 'dmain') {
        var oo = Number(t.getAttribute('data-o'));
        d.picked = oo;
        if (oo === dp.main.answer) {
          if (!d.wrong) { d.first++; var rr = rec(dp.id); if (!rr.m || rr.m !== 'ok') rr.m = rr.m || 'ok'; save(); }
        } else d.wrong++;
        render(); return;
      }
      if (act === 'dreveal') { d.revealed = true; d.picked = dp.main.answer; render(); return; }
      if (act === 'dnext') { d.i++; d.picked = null; d.wrong = 0; d.revealed = false; render(); try { root.scrollIntoView({ block: 'start' }); } catch (e) {} return; }
    }
  });

  // 입력 중인 글은 다시 그려도 남게(언어 전환 등)
  root.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'rlSum' && view.id) { rec(view.id).sText = ev.target.value.slice(0, 300); save(); }
  });

  window.addEventListener('story:lang', render);
  window.addEventListener('pageshow', function () { if (view.mode === 'list') render(); });
  render();
})();
