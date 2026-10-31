/* ═══════════════════════════════════════════════════════════════════════
   📚 영어 독서 사다리 — 4단계 · 핵심 찾기 반복 (2026-10-18 사장님 지시)
   «적은 단계 + 충분한 글 + 핵심찾기 반복»
     1단계 쉬운 이야기(초1~3·A1) → 2단계 조금 긴 이야기(초4~6·A2)
     → 3단계 쉬운 지식 글(초6~중2·A2+/B1) → 4단계 비문학(중3~고1·B1+/B2)
   글은 /js/reading-ladder-data.js 의 window.READING_LADDER 한 곳이 정본.
   한 편마다: 읽기(듣기·해석) → ① 핵심 문장 찾기 → ② 중심 내용 고르기 → ③ 핵심 한 줄 영작.
   «🔁 핵심 찾기 반복» 은 같은 단계 글 5편의 중심 내용만 빠르게 다시 묻는다.
   📋 고르기 화면(C안 · 2026-10-18 사장님 「스크롤 없이 한 장에 · 드롭다운」): 툴바 드롭다운 + 왼쪽 목록 + 오른쪽 상세.

   ⛔ 정답을 맞혀야만 넘어가게 만들지 않는다 — 두 번 틀리면 «정답 보기» 가 열린다
      (CLAUDE.md 「정답을 맞혀야만 다음으로」: 못 푸는 학생이 갇힌다).
   ⛔ 포인트·서버 저장 없음 — 진행은 이 기기(localStorage)에만. 저장이 막혀도 화면은 그대로 동작.
   ⛔ 채점은 «핵심어가 들어갔나» 까지만 — 문법을 판정하지 않는다(AI 첨삭은 /ai-write.html 로 잇는다).
   하니스(reading_ladder_harness)가 아래 «CORE» 블록을 오려 내 실제로 돌린다.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function artBadge(p) {
    var catalog = window.READING_LADDER_ART;
    var style = catalog && catalog.styles[catalog.books[p.id]];
    return style ? '<span class="rl-art">' + esc(style.emoji + ' ' + L(style)) + '</span>' : '';
  }

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
    // ③ 은 «핵심문장 응용해서 쓰기» — 핵심 문장의 구조·시제는 두고 표시된 낱말 하나만 바꾼다(2026-10-22 main).
    // 그래서 모범 문장은 «핵심 문장에서 그 낱말만 바꾼 것» 이고, 본문과 많이 겹치는 것 자체는 정상이다.
    // 막는 것은 두 가지뿐(2026-10-20 사장님 「베껴쓰기 아닌가요?」):
    //   'copy' — 본문 한 문장과 낱말이 COPY_RATIO 이상 겹치고, 모범 문장보다 그 본문 문장에 더 가까울 때
    //            (= 표시된 낱말을 안 바꾸고 그대로 옮김. 모범 문장과 똑같이 가까우면(동점) 막지 않는다 —
    //             다른 낱말로 바꾼 것도 «바꾼 것» 이다)
    //   'list' — 힌트 낱말(+관사)만 늘어놓았을 때(«puppy smell home» 도 예전엔 만점이었다)
    // ⛔ 통과 문턱을 올리지 않는다(1단계에 «핵심어 3개 전부» 를 강제하면 못 쓰는 학생이 갇힌다) — 막힌 학생은 «모범 문장 보기» 로 나간다.
    COPY_RATIO: 0.8,
    stemSet: function (text) {
      var s = {};
      RLCore.words(text).forEach(function (w) { s[RLCore.stem(w)] = 1; });
      return s;
    },
    // 두 글의 낱말 겹침 — 짧은 쪽 기준이 아니라 «양쪽 모두에서» 겹친 비율의 작은 값(한쪽이 다른 쪽을 거의 다 담을 때만 높다).
    overlap: function (a, b) {
      var A = RLCore.stemSet(a), B = RLCore.stemSet(b), na = 0, nb = 0, both = 0, k;
      for (k in A) { na++; if (B[k]) both++; }
      for (k in B) nb++;
      return na && nb ? Math.min(both / na, both / nb) : 0;
    },
    copiedFrom: function (text, sentences, model) {
      var best = 0;
      (sentences || []).forEach(function (s) { best = Math.max(best, RLCore.overlap(text, s)); });
      return best >= RLCore.COPY_RATIO && best > (model ? RLCore.overlap(text, model) : 0);
    },
    checkSummary: function (text, keywords, src) {
      var have = RLCore.stemSet(text);
      var hit = [], miss = [], kwStem = {};
      (keywords || []).forEach(function (k) {
        var parts = RLCore.words(k);
        parts.forEach(function (w) { kwStem[RLCore.stem(w)] = 1; });
        var ok = parts.length > 0 && parts.every(function (w) { return have[RLCore.stem(w)]; });
        (ok ? hit : miss).push(k);
      });
      var hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(String(text || ''));
      var n = RLCore.words(text).length;
      var other = 0, w;
      for (w in have) if (!kwStem[w] && !/^(a|an|the|and)$/.test(w)) other++;
      var copied = !!(src && RLCore.copiedFrom(text, src.sentences, src.model));
      var verdict = hasKorean ? 'korean' : n < 3 ? 'short' : copied ? 'copy' : (hit.length && !other) ? 'list' :
        hit.length === (keywords || []).length ? 'great' : hit.length >= 2 ? 'good' : 'try';
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
    },
    // 📋 고르기 화면(C안 · 2026-10-18) — 글 상태 · 거르기·정렬 · 상세에 띄울 글. 화면은 이 셋을 «부르기만» 한다.
    STATUSES: ['new', 'doing', 'done'],
    SORTS: ['no', 'short', 'long'],
    statusOf: function (r) {
      if (RLCore.isDone(r)) return 'done';
      return r && (r.k || r.m || r.s) ? 'doing' : 'new';
    },
    // 주제 → 상태 → 정렬. 모르는 주제는 안 거른다(filterByTopic) · 상태로 걸러 0편이면 그건 사실이라 빈 목록.
    // 길이 정렬은 같은 길이면 원래 번호 순 — 다시 그릴 때마다 줄이 흔들리지 않게.
    browse: function (passages, stage, prog, opt) {
      opt = opt || {};
      var base = passages.filter(function (p) { return p.stage === stage; });
      var list = RLCore.filterByTopic(base, opt.topic);
      if (RLCore.STATUSES.indexOf(opt.status) >= 0) list = list.filter(function (p) { return RLCore.statusOf((prog || {})[p.id]) === opt.status; });
      var dir = opt.sort === 'short' ? 1 : opt.sort === 'long' ? -1 : 0;
      if (!dir) return list;
      return list.map(function (p) { return { p: p, w: RLCore.wordCount(p), i: base.indexOf(p) }; })
        .sort(function (a, b) { return (a.w - b.w) * dir || a.i - b.i; })
        .map(function (x) { return x.p; });
    },
    // 상세에 띄울 글 — 고른 글(그 단계 글일 때만) → 하던 글 → 새 글 → 첫 글.
    pickActive: function (passages, stage, prog, selId) {
      var list = passages.filter(function (p) { return p.stage === stage; });
      var st = function (p) { return RLCore.statusOf((prog || {})[p.id]); };
      for (var i = 0; i < list.length; i++) if (list[i].id === selId) return list[i];
      return list.filter(function (p) { return st(p) === 'doing'; })[0] || list.filter(function (p) { return st(p) === 'new'; })[0] || list[0] || null;
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
  var state = { stage: 1, prog: {} };
  try {
    var saved = JSON.parse(localStorage.getItem(RLCore.STORE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      if (saved.prog && typeof saved.prog === 'object') state.prog = saved.prog;
      if (saved.stage >= 1 && saved.stage <= MAX_STAGE) state.stage = saved.stage;
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
  // 2026-10-19 부터 176편 모두 그림책이 있다. 그림책이 없는 글(데이터에 book:false)이 생기면 그림책 표시·버튼을 그리지 않는다(없는 페이지로 보내지 않게).
  function hasBook(p) { return !!p && p.book !== false; }
  // Reuse the first picture on the storybook page; lazy-load offscreen rows.
  function bookThumbnail(p) {
    return '<span class="rl-thumb" aria-hidden="true">📖' + (hasBook(p) ?
      '<img src="/img/story/' + esc(p.id) + '-cover.webp?v=2" alt="" width="1024" height="688" loading="lazy" decoding="async">' : '') + '</span>';
  }
  // A missing picture leaves a book placeholder without changing the row size.
  root.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG' && e.target.parentNode && e.target.parentNode.classList.contains('rl-thumb')) e.target.hidden = true;
  }, true);
  function bookTag(p) {
    if (!hasBook(p)) return '';
    var n = bookStamps(p.id);
    return '<span class="rl-pic">🖼 ' + esc(n >= 6 ? T('그림책 완주', 'Book done') : n > 0 ? T('그림책 ', 'Book ') + n + '/6' : T('그림책', 'Picture book')) + '</span>';
  }

  /* ── English server audio, including devices without speechSynthesis ── */
  var canSpeak = !!window.StoryAudio;
  function stopSpeak() { if (window.StoryAudio) window.StoryAudio.stop(); }
  function speak(text, stage) {
    if (window.StoryAudio) window.StoryAudio.speak(text, stage <= 1 ? 0.8 : stage === 2 ? 0.88 : 0.95);
  }

  /* ── 화면 상태 ── */
  // view = 읽기·반복 연습의 그때그때 상태 · filt = 고르기 화면의 고른 글·거르기(글을 읽고 돌아와도 남는다)
  var view = { mode: 'list', id: null, drill: null, keyWrong: 0, mainWrong: 0, keyPicked: null, mainPicked: null, sumResult: null };
  var filt = { topic: '', status: '', sort: 'no', sel: null };
  var FILTER_VALUES = { status: RLCore.STATUSES, sort: RLCore.SORTS };

  // 다시 그려도 포커스가 같은 버튼에 남게(키보드로 고르는 학생) — data-act 와 그 값들로 «같은 버튼» 을 찾는다.
  var FOCUS_ATTRS = ['data-act', 'data-id', 'data-stage', 'data-key', 'data-v', 'data-topic', 'data-o', 'data-i'];
  function focusKey(el) {
    if (!el || !el.getAttribute || !el.getAttribute('data-act') || !root.contains(el)) return null;
    return FOCUS_ATTRS.map(function (a) { return el.getAttribute(a) || ''; }).join('|');
  }
  function restoreFocus(k) {
    if (!k) return;
    var els = root.querySelectorAll('[data-act]');
    for (var i = 0; i < els.length; i++) {
      if (focusKey(els[i]) !== k) continue;
      var dd = els[i].closest ? els[i].closest('details:not([open])') : null;
      var target = dd ? dd.querySelector('summary') : els[i];
      try { target.focus({ preventScroll: true }); } catch (e) {}
      return;
    }
  }

  function render() {
    stopSpeak();
    var fk = focusKey(document.activeElement);
    // 고르기 화면만 «한 장에 꽉 차는» 배치 — 읽기·반복 연습은 예전처럼 아래로 스크롤.
    // ⛔ toggle 에 force 를 준다(상태가 그대로면 class 속성을 다시 쓰지 않는다 — CLAUDE.md classList 항목).
    document.documentElement.classList.toggle('rl-browse', view.mode === 'list');
    renderOverall();
    if (view.mode === 'read') renderReader();
    else if (view.mode === 'drill') renderDrill();
    else renderBrowse();
    restoreFocus(fk);
  }

  /* ════ 📋 고르기 화면 (C안 · 2026-10-18 사장님 「스크롤 없이 한 장에 · 드롭다운」) ════
     툴바(단계 계단 · 단계/주제/상태/정렬 드롭다운 · 그림 동화책 4권 · 반복 연습) + 왼쪽 글 목록 + 오른쪽 «고른 글» 상세.
     ⛔ 예전 «단계별 한눈에»(48편 긴 스크롤)·«한 단계 자세히» 두 보기는 이 한 화면으로 합쳤다.
     거르기·정렬·상세에 띄울 글은 RL-CORE(browse · pickActive · statusOf)가 정본 — 여기서는 그리기만 한다. */
  function svg(body, sw, cls) {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (cls ? ' class="' + cls + '"' : '') + '>' + body + '</svg>';
  }
  var ICON = {
    chev: svg('<path d="M6 9l6 6 6-6"/>', 2, 'rl-chev'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3.2),
    play: svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
    book: svg('<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5V5.5M8 7h8"/>')
  };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stLabel(s) { return s === 'done' ? T('완료', 'Done') : s === 'doing' ? T('하는 중', 'In progress') : T('새 글', 'New'); }
  function statusIcon(s, label) {
    var lab = label || stLabel(s);
    return '<span class="rl-si ' + s + '" role="img" aria-label="' + esc(lab) + '" title="' + esc(lab) + '">' + (s === 'done' ? ICON.check : '') + '</span>';
  }
  function statusChip(s) { return '<span class="rl-stchip ' + s + '">' + (s === 'done' ? ICON.check : '') + esc(stLabel(s)) + '</span>'; }
  function stageName(s) { return T(s.n + '단계 ', 'Step ' + s.n + ' ') + L(s.name); }

  function renderOverall() {
    var box = document.getElementById('rlOverall');
    if (!box) return;
    var done = PASSAGES.filter(function (p) { return RLCore.isDone(state.prog[p.id]); }).length;
    var total = PASSAGES.length;
    box.innerHTML = '<span>' + esc(T('전체 진도', 'Progress')) + '</span><b>' + done + ' / ' + total + '</b>' +
      '<span class="rl-meter" role="img" aria-label="' + esc(T(total + '편 중 ' + done + '편 완료', done + ' of ' + total + ' done')) + '">' +
      '<i style="width:' + (total ? Math.round(done * 100 / total) : 0) + '%"></i></span>';
  }

  // 드롭다운 — <details> 라 스크립트 없이도 열리고, Esc·바깥 누르기·다른 것 열기에 닫힌다(아래 조작).
  function dd(label, curHtml, opts, cls) {
    return '<details class="rl-dd' + (cls ? ' ' + cls : '') + '"><summary class="rl-dd-btn">' +
      (label ? '<span class="rl-dd-lab">' + esc(label) + '</span>' : '') + curHtml + ICON.chev + '</summary>' +
      '<div class="rl-dd-menu" role="menu">' + opts.join('') + '</div></details>';
  }
  function ddOpt(attrs, on, inner, hint) {
    return '<button type="button" class="rl-dd-opt" role="menuitemradio" aria-checked="' + (on ? 'true' : 'false') + '" ' + attrs + '>' +
      inner + (hint != null ? '<small>' + esc(hint) + '</small>' : '') + '</button>';
  }

  function toolbarHtml(cur, stageList, shownN) {
    var meta = stageMeta(cur);
    var stair = '<div class="rl-stair" role="group" aria-label="' + esc(T('단계', 'Step')) + '">' + STAGES.map(function (s) {
      return '<button type="button" class="' + (s.n < cur ? 'past' : '') + '" style="--sc:' + s.color + '" data-act="stage" data-stage="' + s.n +
        '" aria-pressed="' + (s.n === cur) + '" title="' + esc(stageName(s)) + '" aria-label="' + esc(stageName(s)) + '"></button>';
    }).join('') + '</div>';
    var stageDd = dd(T('단계', 'Step'), '<span class="rl-sw" style="--sc:' + meta.color + '"></span><span class="rl-dd-val">' + esc(stageName(meta)) + '</span>',
      STAGES.map(function (s) {
        var st = RLCore.stageStats(PASSAGES, s.n, state.prog);
        return ddOpt('data-act="stage" data-stage="' + s.n + '"', s.n === cur,
          '<span class="rl-sw" style="--sc:' + s.color + '"></span><span>' + esc(stageName(s)) + '<em>' + esc(L(s.grade) + ' · ' + s.cefr) + '</em></span>',
          st.done + '/' + st.total);
      }), 'rl-dd-stage');
    var topics = RLCore.topicsOf(PASSAGES, cur);
    var curTopic = topics.filter(function (x) { return x.key === filt.topic; })[0] || null;
    var topicDd = dd(T('주제', 'Topic'), '<span class="rl-dd-val">' + esc(curTopic ? L(curTopic.label) : T('전체', 'All')) + '</span>',
      [ddOpt('data-act="topic" data-topic=""', !curTopic, '<span>' + esc(T('전체', 'All')) + '</span>', stageList.length)].concat(topics.map(function (x) {
        return ddOpt('data-act="topic" data-topic="' + esc(x.key) + '"', curTopic === x, '<span>' + esc(L(x.label)) + '</span>', x.count);
      })), 'rl-dd-cols');
    var stOpts = [''].concat(RLCore.STATUSES);
    var statusDd = dd(T('상태', 'Status'), '<span class="rl-dd-val">' + esc(filt.status ? stLabel(filt.status) : T('전체', 'All')) + '</span>',
      stOpts.map(function (v) {
        var n = RLCore.browse(PASSAGES, cur, state.prog, { topic: filt.topic, status: v }).length;
        return ddOpt('data-act="filter" data-key="status" data-v="' + v + '"', filt.status === v, '<span>' + esc(v ? stLabel(v) : T('전체', 'All')) + '</span>', n);
      }));
    var sortLab = { no: T('번호순', 'By number'), short: T('짧은 글부터', 'Shortest first'), long: T('긴 글부터', 'Longest first') };
    var sortDd = dd(T('정렬', 'Sort'), '<span class="rl-dd-val">' + esc(sortLab[filt.sort] || sortLab.no) + '</span>',
      RLCore.SORTS.map(function (v) { return ddOpt('data-act="filter" data-key="sort" data-v="' + v + '"', filt.sort === v, '<span>' + esc(sortLab[v]) + '</span>'); }), 'rl-dd-sort');
    // 그림 동화책 4권(따로 만든 책) — 2단계에서만. 책은 각자 화면이라 고르면 바로 그 책으로 간다.
    var books = (cur === 2 && window.__storyBookList && window.__storyBookList()) || [];
    var booksDd = books.length ? dd('', ICON.book + '<span class="rl-dd-val">' + esc(T('그림 동화책 ' + books.length + '권', books.length + ' picture books')) + '</span>',
      books.map(function (b) {
        var s = b.n >= 6 ? 'done' : b.n > 0 ? 'doing' : 'new';
        var prog = b.n >= 6 ? T('완주', 'Finished') : T('도장 ' + b.n + '/6', 'Stamps ' + b.n + '/6');
        return '<a class="rl-dd-opt rl-dd-item" role="menuitem" href="/story-' + esc(b.id) + '.html">' + statusIcon(s, prog) +
          '<span class="rl-dd-tx"><b>' + esc(b.title) + '</b><small>' + esc((lang() === 'en' ? b.en : b.ko) + ' · ' + prog) + '</small></span></a>';
      }), 'rl-dd-right') : '';
    var st = RLCore.stageStats(PASSAGES, cur, state.prog);
    var next = RLCore.recommendNext(PASSAGES, cur, state.prog, MAX_STAGE) ? '<button type="button" class="rl-tb-btn rl-tb-next" data-act="stage" data-stage="' + (cur + 1) +
      '" title="' + esc(T('처음에 맞힌 비율 ' + Math.round(st.firstRatio * 100) + '%', 'First-try correct ' + Math.round(st.firstRatio * 100) + '%')) + '">🎉 ' +
      esc(T((cur + 1) + '단계로 올라가기', 'Go up to Step ' + (cur + 1))) + '</button>' : '';
    return '<div class="rl-tb">' + stair + stageDd + topicDd + statusDd + sortDd + booksDd +
      '<button type="button" class="rl-tb-btn" data-act="drill">🔁 ' + esc(T('핵심 찾기 반복', 'Main-idea drill')) + '</button>' + next +
      '<span class="rl-count"><b>' + shownN + '</b> / ' + esc(T(stageList.length + '편', stageList.length + ' texts')) + '</span></div>';
  }

  function itemHtml(p, no, on) {
    var s = RLCore.statusOf(state.prog[p.id]), book = hasBook(p), tag = book ? 'a' : 'button';
    return '<' + tag + ' class="rl-item ' + s + (on ? ' sel' : '') + '" data-act="sel" data-id="' + esc(p.id) + '"' +
      (book ? ' href="/story-' + esc(p.id) + '.html"' + (on ? ' aria-current="true"' : '') : ' type="button" aria-pressed="' + on + '"') + '>' +
      '<span class="rl-no">' + pad2(no) + '</span>' + bookThumbnail(p) +
      '<span class="rl-tt"><b lang="en">' + esc(p.title.en) + '</b>' + (lang() === 'en' ? '' : '<span>' + esc(p.title.ko) + '</span>') + '</span>' +
      '<span class="rl-topic">' + esc(L(p.topic)) + '</span>' +
      '<span class="rl-wc">' + RLCore.wordCount(p) + esc(T('단어', 'w')) + '</span>' + statusIcon(s) + '</' + tag + '>';
  }

  // 이전·다음 글 — 넓은 창은 글자, 좁은 창(stories.html CSS)은 화살표만 보인다. 글자는 화면에서만 감추고
  // 낭독기 이름으로 남긴다(aria-label 로 덮지 않음 — 보이는 말과 이름이 어긋나지 않게).
  function stepBtn(dir, off, label) {
    return '<button type="button" class="rl-ghost rl-pn" data-act="step" data-v="' + dir + '"' + (off ? ' disabled' : '') + ' title="' + esc(label) + '">' +
      (dir < 0 ? '<span class="rl-garr" aria-hidden="true">‹</span>' : '') + '<span class="rl-gtx">' + esc(label) + '</span>' +
      (dir > 0 ? '<span class="rl-garr" aria-hidden="true">›</span>' : '') + '</button>';
  }

  function detailHtml(p, stageList) {
    if (!p) return '';
    var meta = stageMeta(p.stage), r = state.prog[p.id] || {}, s = RLCore.statusOf(r);
    var i = stageList.indexOf(p), st = RLCore.stageStats(PASSAGES, p.stage, state.prog);
    var steps = [
      [r.k, T('핵심 문장 찾기', 'Find the key sentence'), T('글에서 가장 중요한 한 문장을 눌러요.', 'Tap the one sentence that matters most.')],
      [r.m, T('중심 내용 고르기', 'Choose the main idea'), T('글이 말하려는 것을 보기 4개에서 골라요.', 'Pick what the text is mainly about.')],
      [r.s, T('영어 한 문장으로', 'One English sentence'), T('핵심을 영어 한 문장으로 써요.', 'Write the main idea in one English sentence.')]
    ];
    var cta = s === 'done' ? T('다시 읽기', 'Read again') : s === 'doing' ? T('이어서 하기', 'Continue') : T('읽기 시작', 'Start reading');
    return '<article class="rl-detail" id="rlDetail" aria-live="polite">' +
      '<div class="rl-hero"><span class="rl-hero-no" aria-hidden="true">' + pad2(i + 1) + '</span>' +
        '<div class="rl-hero-top"><span class="rl-eyebrow">' + esc(stageName(meta) + T(' · ' + (i + 1) + '번', ' · No. ' + (i + 1))) + '</span>' + statusChip(s) + '</div>' +
        '<h2 lang="en">' + esc(p.title.en) + '</h2>' + (lang() === 'en' ? '' : '<p class="rl-hero-ko">' + esc(p.title.ko) + '</p>') +
        '<div class="rl-facts"><span>' + esc(L(p.topic)) + '</span><span>' + RLCore.wordCount(p) + esc(T('단어', ' words')) + '</span><span>' + esc(meta.cefr) +
          '</span><span>' + esc(L(meta.grade)) + '</span><span>' + esc(p.genre === 'story' ? T('이야기', 'Story') : T('지식 글', 'Non-fiction')) + '</span>' + bookTag(p) + artBadge(p) + '</div>' +
        '<p class="rl-hero-bg">🧠 ' + esc(L(p.bg)) + '</p></div>' +
      '<div class="rl-how"><h3>' + esc(T('이렇게 읽어요', 'How it works')) + '</h3><ol>' + steps.map(function (x, n) {
        return '<li class="' + (x[0] ? 'done' : '') + '"><span class="rl-hn">' + (x[0] ? ICON.check : n + 1) + '</span><b>' + esc(x[1]) + '</b><p>' + esc(x[2]) + '</p></li>';
      }).join('') + '</ol></div>' +
      '<div class="rl-foot"><div class="rl-prog"><span class="rl-dots' + (stageList.length > 12 ? ' rl-many' : '') + '" role="img" aria-label="' + esc(T('완료 ' + st.done + ' / ' + st.total, 'Done ' + st.done + ' of ' + st.total)) + '">' +
        stageList.map(function (q) { return '<i class="' + RLCore.statusOf(state.prog[q.id]) + '"></i>'; }).join('') + '</span>' +
        '<span>' + esc(T('완료 ' + st.done + ' / ' + st.total, 'Done ' + st.done + ' / ' + st.total)) + '</span></div>' +
        '<div class="rl-acts">' + stepBtn(-1, i <= 0, T('이전 글', 'Previous')) + stepBtn(1, i >= stageList.length - 1, T('다음 글', 'Next')) +
          (hasBook(p) ? '<a class="rl-ghost" href="/story-' + esc(p.id) + '.html">🖼 ' + esc(T('그림책', 'Picture book')) + '</a>' : '') +
          '<button type="button" class="rl-cta" data-act="open" data-id="' + esc(p.id) + '">' + ICON.play + esc(cta) + '</button></div></div>' +
      '</article>';
  }

  function renderBrowse() {
    var cur = state.stage, meta = stageMeta(cur);
    var stageList = PASSAGES.filter(function (p) { return p.stage === cur; });
    var shown = RLCore.browse(PASSAGES, cur, state.prog, filt);
    var active = RLCore.pickActive(PASSAGES, cur, state.prog, filt.sel);
    // 목록이 길면(rl-long) 다시 그릴 때 칸 스크롤이 0으로 돌아가 «고른 글» 이 목록 밖으로 사라진다 —
    // 같은 단계면 옛 위치를 되살리고, 고른 줄이 칸 밖이면 «칸 안에서만» 보이게 맞춘다(⛔ 페이지 스크롤은 안 건드림).
    var oldList = root.querySelector('.rl-list');
    var oldTop = (oldList && listStage === cur) ? (oldList.scrollTop || 0) : 0;
    listStage = cur;
    root.innerHTML = '<div class="rl-app" style="--sc:' + meta.color + '">' + toolbarHtml(cur, stageList, shown.length) +
      '<div class="rl-split"><div class="rl-list' + (shown.length > 12 ? ' rl-long' : '') + '">' + (shown.length ? shown.map(function (p) { return itemHtml(p, stageList.indexOf(p) + 1, p === active); }).join('') :
        '<p class="rl-empty">' + esc(T('조건에 맞는 글이 없어요. 상태나 주제를 바꿔 보세요.', 'No texts match. Try another status or topic.')) + '</p>') + '</div>' +
      detailHtml(active, stageList) + '</div></div>';
    keepListPlace(root.querySelector('.rl-list'), oldTop);
  }

  var listStage = null;   // 목록을 마지막으로 그린 단계 — 단계가 바뀌면 맨 위부터
  function keepListPlace(list, top) {
    if (!list || typeof list.getBoundingClientRect !== 'function') return;
    list.scrollTop = top || 0;
    var sel = list.querySelector && list.querySelector('.rl-item.sel');
    if (!sel || typeof sel.getBoundingClientRect !== 'function' || list.scrollHeight <= list.clientHeight) return;
    var lr = list.getBoundingClientRect(), sr = sel.getBoundingClientRect();
    if (sr.top < lr.top) list.scrollTop += sr.top - lr.top;
    else if (sr.bottom > lr.bottom) list.scrollTop += sr.bottom - lr.bottom;
  }

  /* ════ 읽기 + 3단계 ════ */
  function passageHtml(p, pickable) {
    var r = state.prog[p.id] || {};
    return '<div class="rl-text' + (pickable ? ' pick' : '') + '">' + p.sentences.map(function (s, i) {
      var cls = 'rl-s';
      if (view.keyPicked === i) cls += (i === p.key ? ' ok' : ' no');
      if ((r.k && i === p.key) || (view.keyPicked === i && i === p.key)) cls += ' ok';
      var inner = '<span class="rl-en">' + esc(s.en) + '</span>';
      return pickable ? '<button type="button" class="' + cls + '" data-act="key" data-i="' + i + '">' + inner + '</button> '
                      : '<span class="' + cls + '">' + inner + '</span> ';
    }).join('') + '</div>';
  }

  function renderReader() {
    var p = byId(view.id);
    if (!p) { view.mode = 'list'; return renderBrowse(); }
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
            '<span class="rl-en">' + esc(o.en) + '</span></button>'; // 보기엔 우리말 해석을 붙이지 않는다(2026-10-21 — 아이들이 영어 대신 해석만 읽음)
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
          korean: T('영어로만 써 주세요.', 'Please write in English only.'),
          copy: T('핵심 문장을 그대로 옮겼어요 — 표시된 낱말을 바꿔서 써 봐요', 'You copied the key sentence as-is — change the marked word.'),
          list: T('힌트 낱말만 늘어놓았어요. 낱말을 이어서 문장으로 써 주세요. (누가 + 무엇을 했다)', 'You only listed the hint words. Please join them into a sentence.')
        }[res.verdict];
        fb = '<p class="rl-fb ' + (res.verdict === 'great' || res.verdict === 'good' ? 'ok' : 'no') + '">' + esc(msg) + '</p>';
      }
      s3 = '<section class="rl-step' + (sumDone ? ' fin' : ' cur') + '"><h3>③ ' + esc(T('핵심문장 응용해서 쓰기', 'Adapt the key sentence')) + (sumDone ? ' ✅' : '') + '</h3>' +
        '<p class="rl-q">' + esc(T('핵심문장의 구조와 시제는 그대로 두고, 표시된 요소 하나만 바꿔 써 보세요.', 'Keep the sentence structure and tense. Change only the indicated element.')) + '</p>' +
        '<p class="rl-q">' + esc(T('핵심문장: ', 'Key sentence: ')) + '<span class="rl-en">' + esc(p.sentences[p.key].en) + '</span></p>' +
        '<p class="rl-q">' + esc(T('바꿀 표현: ', 'Change: ')) + '<b>' + esc(p.summary.change.from) + ' → ' + esc(p.summary.change.to) + '</b></p>' +
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
          (hasBook(p) ? '<a class="rl-btn rl-primary" href="/story-' + esc(p.id) + '.html">🖼 ' + esc(T('그림 동화책으로 읽기 (도장 6개 +10P · 하루 2권까지)', 'Read as a picture book (6 stamps = +10P · up to 2 books a day)')) + '</a>' : '') +
          '</div>' +
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
          '</div>' +
        passageHtml(p, false) + '</article>' +
      '<section class="rl-step cur"><h3>' + esc(T('중심 내용은?', 'Main idea?')) + '</h3><div class="rl-opts">' +
        order.map(function (oi) {
          var o = p.main.options[oi], cls = 'rl-opt';
          if (answered && oi === p.main.answer) cls += ' ok';
          else if (d.picked === oi && oi !== p.main.answer) cls += ' no';
          return '<button type="button" class="' + cls + '" data-act="dmain" data-o="' + oi + '"' + (answered ? ' disabled' : '') + '><span class="rl-en">' + esc(o.en) + '</span>' +
            '</button>'; // 보기엔 해석 없음(위와 같음)
        }).join('') + '</div>' +
        (answered ? '<p class="rl-fb ok">' + esc(L(p.main.why)) + '</p><p class="rl-fb">🔑 ' + esc(T('핵심 문장: ', 'Key sentence: ')) + esc(p.sentences[p.key].en) + '</p>' +
          '<button type="button" class="rl-btn rl-primary" data-act="dnext">' + esc(T('다음 ▶', 'Next ▶')) + '</button>' :
          (d.picked != null ? '<p class="rl-fb no">' + esc(T('다시 골라 볼까요?', 'Try again.')) + '</p>' : '') +
          (d.wrong >= RLCore.WRONG_BEFORE_REVEAL ? '<button type="button" class="rl-btn" data-act="dreveal">' + esc(T('정답 보기', 'Show the answer')) + '</button>' : '')) +
      '</section>';
  }

  /* ════ 조작 ════ */
  function openPassage(id) {
    var op = byId(id);
    // 읽고 돌아오면 그 글이 고른 글로 남는다(목록 위치를 잃지 않게)
    if (op) { state.stage = op.stage; filt.sel = id; save(); }
    view = { mode: 'read', id: id, drill: null, keyWrong: 0, mainWrong: 0, keyPicked: null, mainPicked: null, sumResult: null };
    render();
    try { root.scrollIntoView({ block: 'start' }); } catch (e) {}
  }

  root.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!t || !root.contains(t)) return;
    var act = t.getAttribute('data-act');
    var p = view.id ? byId(view.id) : null;
    if (act === 'stage') {
      var n = Number(t.getAttribute('data-stage'));
      if (n >= 1 && n <= MAX_STAGE && n !== state.stage) { state.stage = n; filt.sel = null; filt.topic = ''; }   // 주제는 단계마다 달라 비운다
      save(); view.mode = 'list'; view.id = null; render(); return;
    }
    if (act === 'topic') { filt.topic = t.getAttribute('data-topic') || ''; render(); return; }
    if (act === 'filter') {
      var fk = t.getAttribute('data-key'), fv = t.getAttribute('data-v') || '';
      if (FILTER_VALUES[fk] && (fv === '' || FILTER_VALUES[fk].indexOf(fv) >= 0)) filt[fk] = fv || (fk === 'sort' ? 'no' : '');
      render(); return;
    }
    if (act === 'sel') {
      // Native links open the picture book from both its thumbnail and title.
      if (t.getAttribute('href')) return;
      filt.sel = t.getAttribute('data-id'); render();
      // 폰에서는 상세가 목록 아래라, 고르면 상세로 옮겨 준다
      var det = document.getElementById('rlDetail');
      if (det && narrow()) { try { det.scrollIntoView({ block: 'start' }); } catch (e) {} }
      return;
    }
    if (act === 'step') {
      var sl = PASSAGES.filter(function (x) { return x.stage === state.stage; });
      var j = sl.indexOf(RLCore.pickActive(PASSAGES, state.stage, state.prog, filt.sel)) + (Number(t.getAttribute('data-v')) || 0);
      if (j >= 0 && j < sl.length) filt.sel = sl[j].id;
      render(); return;
    }
    if (act === 'open') { openPassage(t.getAttribute('data-id')); return; }
    if (act === 'list') { view.mode = 'list'; view.id = null; render(); return; }
    if (act === 'speak') {
      var sp = view.mode === 'drill' ? view.drill.list[view.drill.i] : p;
      if (sp) speak(sp.sentences.map(function (s) { return s.en; }).join(' '), sp.stage);
      return;
    }
    if (act === 'drill') {
      var seed = new Date().toISOString().slice(0, 10) + ':' + state.stage + ':' + Math.floor(Date.now() / 60000);
      view = { mode: 'drill', id: null, drill: { list: RLCore.pickDrill(PASSAGES, state.stage, state.prog, seed), i: 0, picked: null, wrong: 0, revealed: false, first: 0 } };
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
      var res = RLCore.checkSummary(txt, p.summary.keywords, { sentences: p.sentences.map(function (s) { return s.en; }), model: p.summary.en });
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

  function narrow() { try { return window.matchMedia('(max-width: 820px)').matches; } catch (e) { return false; } }

  // 드롭다운 — 바깥을 누르거나 다른 것을 열거나 Esc 면 닫는다
  function closeDropdowns(keep) {
    var open = root.querySelectorAll('details.rl-dd[open]');
    for (var i = 0; i < open.length; i++) if (!keep || !open[i].contains(keep)) open[i].open = false;
  }
  document.addEventListener('click', function (ev) { closeDropdowns(ev.target); });
  root.addEventListener('toggle', function (ev) { if (ev.target.open && ev.target.classList && ev.target.classList.contains('rl-dd')) closeDropdowns(ev.target); }, true);
  root.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      var o = root.querySelector('details.rl-dd[open]');
      if (o) { o.open = false; var sm = o.querySelector('summary'); if (sm) sm.focus(); }
      return;
    }
    // ↑/↓ 로 글 목록을 옮겨 다닌다
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    var it = ev.target.closest ? ev.target.closest('.rl-item') : null;
    if (!it) return;
    var items = root.querySelectorAll('.rl-item');
    var idx = Array.prototype.indexOf.call(items, it) + (ev.key === 'ArrowDown' ? 1 : -1);
    if (idx < 0 || idx >= items.length) return;
    ev.preventDefault();
    var id = items[idx].getAttribute('data-id');
    filt.sel = id; render();
    var nx = root.querySelector('.rl-item[data-id="' + id + '"]');
    if (nx) { try { nx.focus(); } catch (e) {} }
  });

  window.addEventListener('story:lang', render);
  window.addEventListener('pageshow', function () { if (view.mode === 'list') render(); });
  render();
})();
