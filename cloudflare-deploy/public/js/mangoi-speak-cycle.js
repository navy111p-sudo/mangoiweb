/*!
 * 🗣 mangoi-speak-cycle.js — 「말하기 4단 선순환」 공용 모듈
 *
 * 왜 만들었나 (2026-08-04)
 * ─────────────────────────────────────────────────────────────
 * 게임이 21종인데 **말하기가 진짜로 필수인 것은 11종뿐**이었다.
 *   · 아예 없음 4종 — 우주 괴물 사냥(대표 게임!)·우주 배틀·단어 매칭·풍선 터뜨리기
 *   · 옛 채점기 3종 — 낚시·용의자 추리·말하기 퀴즈 (어순이 뒤바뀌어도 통과)
 *   · 버튼일 뿐  2종 — 문장 벽돌·빈칸 채우기 (2.8초 뒤 자동으로 다음 문제)
 *   · 기록 안 남김 1종 — 아바타 키우기
 *
 * 더 큰 문제는 **「단어 → 문장」 사다리가 게임마다 복제**돼 있다는 것이었다.
 * 슈팅 게임에 「문장 완성 → 원어민 듣고 3번 말하기」라는 원형이 이미 있는데
 * 그 게임 파일 안에만 있어서, 다른 게임으로 퍼지지 않았다.
 * 고치려면 11곳을 각각 고쳐야 하고, 새 게임을 만들면 또 새로 짜게 된다.
 *
 * 그래서 절차를 **여기 한 곳에** 모은다. 게임은 한 줄만 부른다.
 *
 * 사용법
 * ─────────────────────────────────────────────────────────────
 *   // ① 게임이 시작될 때 한 번 — 서버에서 이 학생의 약점을 미리 받아둔다
 *   MangoiCycle.warmWeak('en');
 *
 *   // ② 한 판이 끝난 지점에서
 *   MangoiCycle.run({
 *     en:    'I have a red apple',
 *     ko:    '나는 빨간 사과를 가지고 있어요',
 *     words: ['red', 'apple'],   // 이 판에서 학생이 획득한 낱말 (없으면 문장에서 자동 선택)
 *     lang:  'en'                // 'en' | 'zh'
 *   }).then(function(r){
 *     // r = { ran, skipped, passed, wordScore, sentScore, shadowScore, score, tags }
 *     // r.ran === false 면 이번엔 건너뛸 차례였다는 뜻 — 게임은 그냥 진행하면 된다
 *   });
 *
 * 4단계 — 게임 학습 근거 페이지(/game-learning-science.html)의 이론표와 1:1 대응
 * ─────────────────────────────────────────────────────────────
 *   ① 듣기   뜻을 **가리고** 소리만 2번 → 그 다음 뜻 공개
 *            근거: 메타인지 청취(Vandergrift) — 미리 짐작해 보게 하면 그때부터 귀가 열린다
 *            근거: 멀티미디어 학습(Mayer) — 소리가 나오는 동안 화면과 타이머를 멈춘다
 *   ② 단어   핵심 낱말 1~2개만. 짧아서 성공률이 높다
 *            근거: 출력 가설(Swain) 진입점 · 말할 의지(MacIntyre) — 성공 경험이 먼저
 *   ③ 문장   문장 전체. 틀리면 **모범 문장을 다시 들려주고** 재도전(최대 2회)
 *            근거: 출력 가설 본체 — 말하려다 막히는 순간이 배움의 지점
 *   ④ 따라   원어민 낭독 직후 즉시 따라 말하기 1회 (섀도잉)
 *            근거: 바람직한 어려움(Bjork) — 다시 읽기보다 기억에서 꺼내는 연습
 *
 * 설계 원칙
 * ─────────────────────────────────────────────────────────────
 *   · **신규 서버 API 0개.** 필요한 것은 이미 다 있다:
 *       POST /api/games/shadow  발음 점수 적립 (game_progress.pron_best/pron_count)
 *       GET  /api/games/weak    오답 많은 항목 조회 (기기를 바꿔도 남는다)
 *     → src/index.ts(공동 금지구역)를 한 글자도 안 건드린다.
 *   · **채점기를 새로 만들지 않는다.** js/mangoi-speak-score.js 가 이미 문장 채점을 한다
 *     (단어 정렬 + 누락/치환 구분 + 기능어 가중치 + 길이별 통과기준). 호출만 한다.
 *   · **게임을 절대 멈추게 하지 않는다.** 전부 try/catch, 어떤 경로로도 Promise 는 반드시 resolve.
 *     모듈이 죽어도 게임은 `r.ran === false` 를 받고 그냥 진행한다.
 *   · **말하기를 강제하지 않는다.** 3초 뒤 「지금은 소리를 낼 수 없어요」가 뜬다.
 *     대신 건너뛰면 점수를 안 주고, 그 문장을 **약점으로 적립**해 다음에 다시 만나게 한다.
 *     (도서관·버스·마이크 없는 기기·카톡 인앱 브라우저를 막지 않기 위해서다)
 *
 * ⚠️ 함정 (전부 과거에 실제로 터진 것들)
 *   · 낭독이 끝나기 **전에** 마이크를 열면 음성인식이 **AI 목소리를 학생 말로** 받아 적는다.
 *     → 반드시 MangoiTTS.stop() + speechSynthesis.cancel() 을 부른 뒤에 연다.
 *   · 브라우저 음성인식과 MangoiVoice(녹음)를 **동시에 쓰면 안 된다.** 둘 중 하나만.
 *   · 백그라운드 탭·저전력 모드에서 CSS transition 이 멈춘다.
 *     → opacity:0 으로 시작하는 요소를 두지 않는다(영영 안 보일 수 있다).
 *   · 이모지는 Unicode 13 미만만 쓴다(Windows 10 에서 두부로 표시됨).
 *   · 화면 문구는 이 파일의 STR 표가 직접 갖는다(i18n-sweep 을 건드리면 금지구역 ?v= 가 딸려온다).
 */
(function () {
  'use strict';
  if (window.MangoiCycle) return;

  /* ══════════════════════════════════════════════════════════
     설정
     ══════════════════════════════════════════════════════════ */
  var EVERY_N        = 3;      // 몇 문제에 한 번 4단을 돌릴 것인가 (약점 문장은 항상 돌린다)
  var SKIP_AFTER_MS  = 3000;   // 「지금은 소리를 낼 수 없어요」가 뜨기까지
  var SENT_TRIES     = 2;      // 문장 말하기 재도전 횟수
  var LISTEN_PLAYS   = 2;      // ① 듣기 단계에서 몇 번 들려줄 것인가
  var MIC_MAX_MS     = 12000;  // 한 번 말하기의 상한 (인식이 안 끝나도 여기서 채점)
  var WEAK_TTL_MS    = 10 * 60 * 1000;

  /* ══════════════════════════════════════════════════════════
     화면 문구 — 이 모듈은 **자기 번역표를 직접 갖는다**
     ⚠️ js/i18n-sweep.js 의 DICT 에 넣지 않은 이유:
        그 파일은 index.html·admin.html(공동 금지구역)까지 22개 HTML 이 참조한다.
        한 글자만 고쳐도 asset_version_harness 가 22곳의 `?v=` 를 전부 올리라고 막는다.
        문구 몇 줄 때문에 금지구역 파일을 건드릴 수는 없다. → 여기서 자체 해결한다.
     UI 언어 키는 공통 규약대로 `mangoi_lang` ('en' 이면 영어, 그 외 한국어).
     ══════════════════════════════════════════════════════════ */
  var STR = {
    step1: ['1 듣기', '1 Listen'],
    step2: ['2 단어', '2 Word'],
    step3: ['3 문장', '3 Sentence'],
    step4: ['4 따라', '4 Repeat'],
    skip:  ['지금은 소리를 낼 수 없어요', 'I can’t speak out loud right now'],

    t1:    ['1단계 · 잘 들어보세요', 'Step 1 · Listen carefully'],
    s1:    ['무슨 말일까요? 소리만 들려드려요', 'What could it be? Sound only'],
    play:  ['다시 한 번', 'Once more'],
    play1: ['잘 들어보세요', 'Listen carefully'],
    reveal:['이 문장이었어요!', 'That was the sentence!'],

    t2:    ['2단계 · 낱말부터', 'Step 2 · Start with the word'],
    s2:    ['이 낱말을 소리 내어 말해보세요', 'Say this word out loud'],

    t3:    ['3단계 · 이제 문장으로', 'Step 3 · Now the whole sentence'],
    t3r:   ['3단계 · 다시 한 번', 'Step 3 · One more try'],
    model: ['모범 문장을 다시 들어볼까요?', 'Let’s hear the model sentence again'],

    t4:    ['4단계 · 듣고 바로 따라 말하기', 'Step 4 · Listen, then repeat'],
    s4:    ['잘 듣고 바로 따라 하세요', 'Listen, then repeat right away'],

    mic:   ['말해보세요… (천천히 해도 괜찮아요)', 'Say it… (take your time)'],
    hear:  ['듣고 있어요…', 'Listening…'],
    think: ['발음 확인 중…', 'Checking your pronunciation…'],
    micerr:['마이크를 못 썼어요', 'Couldn’t use the microphone'],

    ok:    ['좋아요!', 'Nice!'],
    okWord:['정확해요!', 'Spot on!'],
    okSent:['문장으로 말했어요!', 'You said the whole sentence!'],
    okShad:['완벽해요!', 'Perfect!'],
    almost:['조금만 더!', 'Almost there!'],
    silent:['소리가 안 들렸어요', 'I didn’t hear anything'],

    fin1:  ['해냈어요!', 'You did it!'],
    fin0:  ['오늘도 한 발 나아갔어요', 'One more step forward today'],
    score: ['발음 점수', 'Pronunciation'],
    pts:   ['점', 'pts'],
    /* 마이크를 한 번도 못 쓴 경우 — 「0점」이라고 하면 안 된다.
       마이크가 없거나 권한이 막힌 학생에게 점수를 매긴 것처럼 보인다. */
    nomic: ['소리를 못 들었어요 — 다음에 마이크로 만나요',
            'Couldn’t hear you — let’s try with a microphone next time'],
    again: ['다음에 이 문장을 다시 만나요 — 그때 더 잘하면 돼요',
            'You’ll meet this sentence again — you can do even better then']
  };
  function T(k) {
    var row = STR[k];
    if (!row) return '';
    var en = false;
    try { en = localStorage.getItem('mangoi_lang') === 'en'; } catch (_) {}
    return en ? row[1] : row[0];
  }

  /* ══════════════════════════════════════════════════════════
     공통 유틸
     ══════════════════════════════════════════════════════════ */
  function uid() {
    try {
      var u = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      if (u && (u.uid || u.user_id)) return String(u.uid || u.user_id);
    } catch (_) {}
    try {
      var v = JSON.parse(localStorage.getItem('mango_user') || 'null');
      if (v && (v.user_id || v.uid)) return String(v.user_id || v.uid);
    } catch (_) {}
    return '';
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9一-鿿\s']/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* 기능어 — 핵심 낱말을 고를 때 제외한다 (채점기의 FUNC 와 같은 취지) */
  var FUNC = {};
  ('a an the of to in on at is am are was were be been do does did i you he she it we they my your his her its our their and or but for with from this that these those there here not no so as by if then than have has had will would can could should may might up out about into over after').split(' ')
    .forEach(function (w) { FUNC[w] = 1; });

  /**
   * 핵심 낱말 고르기 — 게임이 words 를 안 주면 문장에서 뽑는다.
   * 기능어를 빼고, 긴 낱말 순으로 최대 2개. (짧은 낱말은 인식기가 잘 흘린다)
   */
  function pickWords(en, given) {
    var out = [];
    var body = norm(en);
    if (given && given.length) {
      for (var i = 0; i < given.length && out.length < 2; i++) {
        var g = norm(given[i]);
        if (g && !FUNC[g] && body.indexOf(g) >= 0 && out.indexOf(g) < 0) out.push(g);
      }
    }
    if (!out.length) {
      var ws = body.split(' ').filter(function (w) { return w && !FUNC[w]; });
      ws.sort(function (a, b) { return b.length - a.length; });
      out = ws.slice(0, 2);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     채점 — 영어는 공용 채점기, 중국어는 글자 겹침
     (채점기 mangoi-speak-score.js 는 영어 전용이다)
     ══════════════════════════════════════════════════════════ */
  function grade(said, target, lang) {
    var empty = { score: 0, accuracy: 0, pass: false, words: [], tip: '' };
    if (!target) return empty;
    if (!said) return empty;
    if (lang === 'zh') {
      var t = norm(target).replace(/\s/g, ''), s = norm(said).replace(/\s/g, '');
      if (!t) return empty;
      var hit = 0, pool = s;
      for (var i = 0; i < t.length; i++) {
        var k = pool.indexOf(t[i]);
        if (k >= 0) { hit++; pool = pool.slice(0, k) + pool.slice(k + 1); }
      }
      var acc = hit / t.length;
      return { score: Math.round(acc * 100), accuracy: acc, pass: acc >= 0.7, words: [], tip: '' };
    }
    if (window.MangoiScore && typeof MangoiScore.grade === 'function') {
      try { return MangoiScore.grade(said, target); } catch (_) {}
    }
    /* 채점기가 아직 안 실렸을 때의 최소 폴백 — 순서는 못 보지만 게임은 안 멈춘다 */
    var tw = norm(target).split(' ').filter(Boolean), sw = norm(said).split(' ');
    var h = 0;
    tw.forEach(function (w) { if (sw.indexOf(w) >= 0) h++; });
    var a = tw.length ? h / tw.length : 0;
    return { score: Math.round(a * 100), accuracy: a, pass: a >= 0.75, words: [], tip: '' };
  }

  /** 발음 처방 한 줄 — 「rice 를 lice 라고 말하면 → 혀끝을 입천장에 안 대고 r」 */
  function prescribe(g) {
    try {
      if (!window.MangoiPron) return { tip: '', tags: [], goodTags: [] };
      var d = MangoiPron.analyze(g) || { tags: [], goodTags: [] };
      return { tip: MangoiPron.tipFor(d.tags) || '', tags: d.tags || [], goodTags: d.goodTags || [] };
    } catch (_) { return { tip: '', tags: [], goodTags: [] }; }
  }

  /* ══════════════════════════════════════════════════════════
     서버 배선 — 신규 API 없음. 이미 있는 두 개를 쓴다.
     ══════════════════════════════════════════════════════════ */
  var _weak = { at: 0, lang: '', set: null };

  /**
   * 이 학생의 약점 항목을 서버에서 받아둔다 (게임 시작 시 1회).
   * 기기를 바꿔도 남는다 — localStorage 기억큐가 못 하는 일이다.
   */
  function warmWeak(lang) {
    lang = (lang === 'zh') ? 'zh' : 'en';
    var u = uid();
    if (!u) return Promise.resolve(null);
    if (_weak.set && _weak.lang === lang && (Date.now() - _weak.at) < WEAK_TTL_MS) {
      return Promise.resolve(_weak.set);
    }
    return fetch('/api/games/weak?user_id=' + encodeURIComponent(u) + '&lang=' + lang + '&limit=40')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var set = {};
        if (d && d.ok && d.weak) d.weak.forEach(function (w) { if (w && w.item) set[norm(w.item)] = 1; });
        _weak = { at: Date.now(), lang: lang, set: set };
        return set;
      })
      .catch(function () { return null; });
  }

  /** 서버가 「이건 약점」이라고 표시해 둔 항목인가 — 이런 문장은 게이트를 건너뛰고 항상 돌린다 */
  function isWeak(en) {
    try { return !!(_weak.set && _weak.set[norm(en)]); } catch (_) { return false; }
  }

  /** 발음 점수 적립 → game_progress.pron_best / pron_count (교사가 학생별 향상 확인) */
  function sendShadow(item, ko, score, lang) {
    try {
      var u = uid();
      if (!u || !item) return;
      fetch('/api/games/shadow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({
          user_id: u, lang: (lang === 'zh') ? 'zh' : 'en',
          item: String(item), ko: String(ko || ''), score: Math.max(0, Math.min(100, Math.round(score)))
        })
      }).catch(function () {});
    } catch (_) {}
  }

  /** 기억큐 적립 — 다음 게임이 pickDue 로 이 문장을 다시 꺼내온다 */
  function remember(en, ko, ok, extra) {
    try {
      if (window.MangoiMemory) MangoiMemory.log({ en: en, ko: ko || '' }, !!ok, extra || {});
    } catch (_) {}
  }

  /* ══════════════════════════════════════════════════════════
     낭독 — 낭독이 **끝난 뒤에** 마이크를 연다
     ══════════════════════════════════════════════════════════ */
  function say(text, lang, rate) {
    return new Promise(function (resolve) {
      var done = false;
      var fin = function () { if (!done) { done = true; resolve(); } };
      /* 낭독 종료 신호가 유실될 때를 대비한 상한 — 이게 없으면 4단이 여기서 굳는다 */
      setTimeout(fin, Math.max(3000, String(text || '').length * 130));
      try {
        if (window.MangoiTTS) {
          try { MangoiTTS.setLang(lang === 'zh' ? 'zh' : 'en'); } catch (_) {}
          MangoiTTS.speak(text, rate || 1, fin);
          return;
        }
        if (window.gameSpeak) { window.gameSpeak(text, fin); return; }
        if (window.speechSynthesis) {
          var u = new SpeechSynthesisUtterance(String(text));
          u.lang = (lang === 'zh') ? 'zh-CN' : 'en-US';
          u.rate = 0.95 * (rate || 1);
          u.onend = fin; u.onerror = fin;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
          return;
        }
        fin();
      } catch (_) { fin(); }
    });
  }

  /** 🔇 마이크를 열기 직전에 반드시 — 안 부르면 인식기가 AI 목소리를 받아 적는다 */
  function hushTTS() {
    try { if (window.MangoiTTS && MangoiTTS.stop) MangoiTTS.stop(); } catch (_) {}
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
  }

  /* ══════════════════════════════════════════════════════════
     마이크 — 브라우저 음성인식이 있으면 그것, 없으면 녹음 + 서버 Whisper
     (동시에 쓰면 안드로이드 일부 기기에서 오디오 세션이 죽는다)
     ══════════════════════════════════════════════════════════ */
  var _activeRec = null;   // 지금 열려 있는 인식 세션 — 건너뛰기를 눌렀을 때 확실히 닫기 위해

  /** 마이크를 강제로 닫는다 — 건너뛰기·정리 시 호출. 안 닫으면 마이크가 켜진 채로 남는다. */
  function micOff() {
    try { if (_activeRec) _activeRec.stop(); } catch (_) {}
    try { if (_activeRec) _activeRec.abort(); } catch (_) {}
    _activeRec = null;
    try { if (window.MangoiVoice && MangoiVoice.cancel) MangoiVoice.cancel(); } catch (_) {}
  }

  function listen(target, lang, onPartial) {
    hushTTS();
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return listenWhisper(lang, onPartial);
    return new Promise(function (resolve) {
      var rec, done = false, said = '', silence = null, hardStop = null;
      function finish() {
        if (done) return; done = true;
        if (silence) clearTimeout(silence);
        if (hardStop) clearTimeout(hardStop);
        try { rec.stop(); } catch (_) {}
        if (_activeRec === rec) _activeRec = null;
        resolve(said.trim());
      }
      function arm() { if (silence) clearTimeout(silence); silence = setTimeout(function () { try { rec.stop(); } catch (_) {} }, 2500); }
      try {
        rec = new SR();
        rec.lang = (lang === 'zh') ? 'zh-CN' : 'en-US';
        rec.interimResults = true;
        rec.maxAlternatives = 3;
        rec.continuous = true;
      } catch (_) { return resolve(''); }

      rec.onstart = function () { arm(); };
      rec.onresult = function (e) {
        if (done) return;
        said = '';
        for (var i = 0; i < e.results.length; i++) said += (e.results[i][0].transcript || '') + ' ';
        try { if (onPartial) onPartial(said.trim()); } catch (_) {}
        /* 충분히 맞으면 기다리지 않고 바로 통과 — 아이들은 "언제 끝나지?"를 못 견딘다 */
        if (grade(said, target, lang).pass) { finish(); return; }
        arm();
      };
      rec.onerror = function () { finish(); };
      rec.onend = function () { if (!done) finish(); };
      /* 안드로이드 크롬은 continuous 를 무시하고 첫 결과 뒤 세션을 스스로 닫는다 → 공용 보호막 */
      try { if (window.MangoiSTT) MangoiSTT.harden(rec, { isDone: function () { return done; }, onRestart: arm, maxMs: MIC_MAX_MS }); } catch (_) {}
      hardStop = setTimeout(finish, MIC_MAX_MS);
      _activeRec = rec;
      try { rec.start(); } catch (_) { finish(); }
    });
  }

  /** 음성인식 미지원(앱 WebView·카톡 인앱·구형 iOS) → 녹음 후 서버 Whisper 전사 */
  function listenWhisper(lang, onPartial) {
    if (!window.MangoiVoice || !MangoiVoice.supported()) return Promise.resolve('');
    return MangoiVoice.record({
      firstMs: 8000, silenceMs: 2000, maxMs: MIC_MAX_MS,
      lang: (lang === 'zh') ? 'zh' : 'en',
      onState: function (st) {
        try {
          if (!onPartial) return;
          if (st === 'waiting') onPartial('__waiting');
          else if (st === 'speaking') onPartial('__speaking');
          else if (st === 'thinking') onPartial('__thinking');
          else if (st === 'error') onPartial('__error');
        } catch (_) {}
      }
    }).catch(function () { return ''; });
  }

  /* ══════════════════════════════════════════════════════════
     화면 — 게임 위에 덮는 오버레이 하나
     ⚠️ opacity:0 으로 시작하는 요소를 두지 않는다.
        백그라운드 탭·저전력 모드에서 transition 이 멈춰 영영 안 보인다.
     ══════════════════════════════════════════════════════════ */
  var CSS = [
    '#mcyc-back{position:fixed;inset:0;z-index:2147483000;background:rgba(8,14,28,.93);',
    '  display:flex;align-items:center;justify-content:center;padding:14px;',
    '  font-family:system-ui,"Malgun Gothic","맑은 고딕",sans-serif;}',
    '#mcyc-card{width:min(560px,96vw);background:#111c33;border:3px solid #fbbf24;border-radius:18px;',
    '  padding:clamp(14px,3vmin,26px);box-shadow:0 18px 50px rgba(0,0,0,.6);text-align:center;color:#f8fafc;}',
    '#mcyc-steps{display:flex;gap:6px;justify-content:center;margin-bottom:10px;}',
    '#mcyc-steps span{flex:0 0 auto;min-width:56px;padding:4px 8px;border-radius:999px;font-size:clamp(10px,1.6vmin,13px);',
    '  font-weight:700;background:#1e293b;color:#64748b;border:1px solid #334155;}',
    '#mcyc-steps span.on{background:#fbbf24;color:#3b2a00;border-color:#fbbf24;}',
    '#mcyc-steps span.done{background:#166534;color:#bbf7d0;border-color:#22c55e;}',
    '#mcyc-title{font-size:clamp(15px,2.4vmin,20px);font-weight:800;color:#fbbf24;margin-bottom:8px;}',
    '#mcyc-main{font-size:clamp(20px,4.2vmin,34px);font-weight:800;line-height:1.35;margin:10px 0;',
    '  word-break:break-word;min-height:1.4em;}',
    '#mcyc-sub{font-size:clamp(13px,2vmin,17px);color:#cbd5e1;min-height:1.3em;margin-bottom:6px;}',
    '#mcyc-feed{font-size:clamp(13px,2vmin,17px);font-weight:700;min-height:1.6em;margin-top:8px;color:#94a3b8;}',
    '#mcyc-tip{font-size:clamp(12px,1.8vmin,15px);color:#7dd3fc;min-height:1.2em;margin-top:4px;}',
    '#mcyc-mic{font-size:clamp(30px,6vmin,46px);line-height:1;margin:6px 0;}',
    '#mcyc-mic.live{animation:mcycPulse 1s ease-in-out infinite;}',
    '@keyframes mcycPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.16)}}',
    '#mcyc-skip{margin-top:12px;background:transparent;color:#64748b;border:1px solid #334155;',
    '  border-radius:9px;padding:7px 14px;font-size:clamp(11px,1.7vmin,14px);cursor:pointer;}',
    '#mcyc-skip:hover{color:#cbd5e1;border-color:#64748b;}',
    '.mcyc-w{display:inline-block;margin:0 .16em;}',
    '.mcyc-w.ok{color:#4ade80;}.mcyc-w.close{color:#a3e635;}',
    '.mcyc-w.wrong{color:#f87171;text-decoration:underline wavy #f87171;}',
    '.mcyc-w.missing{color:#64748b;text-decoration:line-through;}'
  ].join('\n');

  var ui = null;
  function openUI() {
    if (ui) return ui;
    try {
      if (!document.getElementById('mcyc-css')) {
        var st = document.createElement('style');
        st.id = 'mcyc-css'; st.textContent = CSS;
        document.head.appendChild(st);
      }
      var back = document.createElement('div');
      back.id = 'mcyc-back';
      back.innerHTML =
        '<div id="mcyc-card">' +
        '  <div id="mcyc-steps">' +
        '    <span data-s="0">'+T('step1')+'</span><span data-s="1">'+T('step2')+'</span>' +
        '    <span data-s="2">'+T('step3')+'</span><span data-s="3">'+T('step4')+'</span>' +
        '  </div>' +
        '  <div id="mcyc-title"></div>' +
        '  <div id="mcyc-main"></div>' +
        '  <div id="mcyc-sub"></div>' +
        '  <div id="mcyc-mic"></div>' +
        '  <div id="mcyc-feed"></div>' +
        '  <div id="mcyc-tip"></div>' +
        '  <button id="mcyc-skip" type="button">'+T('skip')+'</button>' +
        '</div>';
      document.body.appendChild(back);
      ui = {
        back: back,
        title: back.querySelector('#mcyc-title'),
        main: back.querySelector('#mcyc-main'),
        sub: back.querySelector('#mcyc-sub'),
        mic: back.querySelector('#mcyc-mic'),
        feed: back.querySelector('#mcyc-feed'),
        tip: back.querySelector('#mcyc-tip'),
        skip: back.querySelector('#mcyc-skip'),
        steps: back.querySelectorAll('#mcyc-steps span')
      };
      ui.skip.style.visibility = 'hidden';   // display 가 아니라 visibility — 자리가 안 흔들린다
      return ui;
    } catch (_) { return null; }
  }
  function closeUI() {
    try { if (ui && ui.back && ui.back.parentNode) ui.back.parentNode.removeChild(ui.back); } catch (_) {}
    ui = null;
  }
  function setStep(i) {
    if (!ui) return;
    for (var k = 0; k < ui.steps.length; k++) {
      ui.steps[k].className = (k < i) ? 'done' : (k === i ? 'on' : '');
    }
  }
  function set(el, html) { try { if (ui && ui[el]) ui[el].innerHTML = html || ''; } catch (_) {} }

  /** 채점 결과를 낱말 색으로 보여준다 — 「틀렸어요」 대신 **어디가** 틀렸는지 */
  function paint(g, target) {
    if (!g || !g.words || !g.words.length) return String(target || '');
    return g.words.map(function (w) {
      return '<span class="mcyc-w ' + (w.status || '') + '">' + w.w + '</span>';
    }).join(' ');
  }

  /* ══════════════════════════════════════════════════════════
     한 번 말하기 = 안내 → 마이크 → 채점 → 피드백
     ══════════════════════════════════════════════════════════ */
  function speakOnce(target, lang, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      set('mic', '🎤');
      if (ui) ui.mic.className = 'live';
      set('feed', '<span style="color:#fbbf24">'+T('mic')+'</span>');
      set('tip', '');
      listen(target, lang, function (partial) {
        if (partial === '__waiting') { set('feed', '<span style="color:#fbbf24">'+T('mic')+'</span>'); return; }
        if (partial === '__speaking') { set('feed', '<span style="color:#fbbf24">'+T('hear')+'</span>'); return; }
        if (partial === '__thinking') { set('feed', '<span style="color:#94a3b8">'+T('think')+'</span>'); return; }
        if (partial === '__error') { set('feed', '<span style="color:#94a3b8">'+T('micerr')+'</span>'); return; }
        if (partial) set('feed', '<span style="color:#fbbf24">…' + partial + '</span>');
      }).then(function (said) {
        if (ui) ui.mic.className = '';
        var g = grade(said, target, lang);
        var p = prescribe(g);
        if (g.pass) {
          set('mic', '✅');
          set('feed', '<span style="color:#4ade80">' + (opts.okText || T('ok')) + '</span>');
        } else {
          set('mic', '🎧');
          set('main', paint(g, target));
          set('feed', '<span style="color:#f87171">' + (said ? T('almost') : T('silent')) + '</span>');
          set('tip', p.tip || (g.tip || ''));
        }
        resolve({ said: said, g: g, p: p });
      })['catch'](function () {
        if (ui) ui.mic.className = '';
        resolve({ said: '', g: grade('', target, lang), p: { tip: '', tags: [], goodTags: [] } });
      });
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ══════════════════════════════════════════════════════════
     게이트 — 3문제에 1번. 단, 서버가 약점으로 표시한 문장은 항상.
     ══════════════════════════════════════════════════════════ */
  var _count = 0;
  function shouldRun(en, force) {
    if (force) return true;
    if (isWeak(en)) return true;        // 약점 문장은 게이트를 통과한다
    _count++;
    return (_count % EVERY_N) === 0;
  }

  /* ══════════════════════════════════════════════════════════
     본체 — 4단 사이클
     ══════════════════════════════════════════════════════════ */
  var _busy = false;

  function run(opts) {
    opts = opts || {};
    var en   = String(opts.en || '').trim();
    var ko   = String(opts.ko || '').trim();
    var lang = (opts.lang === 'zh') ? 'zh' : 'en';
    var none = { ran: false, skipped: false, passed: false, wordScore: 0, sentScore: 0, shadowScore: 0, score: 0, tags: [] };

    if (!en) return Promise.resolve(none);
    if (_busy) return Promise.resolve(none);                 // 겹쳐 열리는 것 방지
    if (!shouldRun(en, opts.force)) return Promise.resolve(none);
    /* 화면을 못 띄우면 아예 시작하지 않는다.
       (여기서 _busy 를 켠 뒤 실패하면 게임이 두 번 다시 4단을 못 돌린다) */
    if (!openUI()) return Promise.resolve(none);

    var words = pickWords(en, opts.words);
    var wordTarget = words.join(' ');
    _busy = true;

    var res = { ran: true, skipped: false, passed: false, wordScore: 0, sentScore: 0, shadowScore: 0, score: 0, tags: [] };
    var skipped = false, skipTimer = null;

    function done() {
      _busy = false;
      if (skipTimer) clearTimeout(skipTimer);
      hushTTS();
      micOff();                 // ⚠️ 안 부르면 건너뛰기 후에도 마이크가 켜진 채로 남는다
      closeUI();
      try { if (opts.onClose) opts.onClose(res); } catch (_) {}
      return res;
    }

    /* 어느 단계에서든 「지금은 소리를 낼 수 없어요」를 누르면 여기로 빠진다.
       점수는 안 주지만, 그 문장은 **약점으로 적립**해서 다음에 다시 만나게 한다. */
    var bail = new Promise(function (resolve) {
      var armSkip = function () {
        if (!ui) return;
        ui.skip.style.visibility = 'visible';
        ui.skip.onclick = function () {
          skipped = true;
          res.skipped = true;
          micOff();                                    // 마이크부터 닫는다
          remember(en, ko, false, { skipped: 1 });     // 점수는 없지만 **약점으로는 남는다**
          resolve('skip');
        };
      };
      skipTimer = setTimeout(armSkip, SKIP_AFTER_MS);
    });

    function stopped() { return skipped; }

    var flow = (function () {
      try { if (opts.onOpen) opts.onOpen(); } catch (_) {}

      /* ─── ① 듣기 — 뜻을 가리고 소리만 ───────────────────────
         근거: 메타인지 청취(Vandergrift). 미리 짐작해 보게 하면 그때부터 귀가 열린다.
         틀려도 감점이 없다 — 여기서 점수를 매기면 짐작을 안 하게 된다. */
      setStep(0);
      set('title', T('t1'));
      set('sub', T('s1'));
      /* 낱말 수와 길이만 점으로 보여준다 — 글자를 보여주면 짐작을 안 하고 읽어버린다 */
      set('main', '<span style="color:#475569">' + en.split(/\s+/).map(function (w) {
        var n = Math.max(1, Math.min(6, w.replace(/[^A-Za-z0-9一-鿿]/g, '').length));
        return new Array(n + 1).join('●');
      }).join(' ') + '</span>');
      set('mic', '🔊'); set('feed', ''); set('tip', '');

      var chain = Promise.resolve();
      for (var i = 0; i < LISTEN_PLAYS; i++) {
        (function (n) {
          chain = chain.then(function () {
            if (stopped()) return;
            set('feed', '<span style="color:#7dd3fc">' + (n === 0 ? T('play1') : T('play')) + '</span>');
            return say(en, lang, n === 0 ? 1 : 0.88).then(function () { return wait(320); });
          });
        })(i);
      }

      return chain
        /* 이제 뜻 공개 — 짐작한 다음에 답을 봐야 기억에 남는다 */
        .then(function () {
          if (stopped()) return;
          set('main', en);
          set('sub', ko || '');
          set('feed', '<span style="color:#4ade80">'+T('reveal')+'</span>');
          return wait(1400);
        })

        /* ─── ② 단어 말하기 ─────────────────────────────────
           근거: 출력 가설(Swain) 진입점 · 말할 의지(MacIntyre).
           짧아서 성공률이 높다 — 첫 성공이 있어야 그 다음 문장을 말한다. */
        .then(function () {
          if (stopped() || !wordTarget) return;
          setStep(1);
          set('title', T('t2'));
          set('sub', T('s2'));
          set('main', wordTarget);
          set('feed', ''); set('tip', '');
          return say(wordTarget, lang, 0.9)
            .then(function () { if (stopped()) return; return speakOnce(wordTarget, lang, { okText: T('okWord') }); })
            .then(function (r) {
              if (!r) return;
              res.wordScore = r.g.score || 0;
              remember(wordTarget, '', !!r.g.pass, { tags: r.p.tags, goodTags: r.p.goodTags, score: r.g.score });
              return wait(r.g.pass ? 700 : 1500);
            });
        })

        /* ─── ③ 문장 말하기 ─────────────────────────────────
           근거: 출력 가설 본체. 말하려다 막히는 순간이 배움의 지점이다.
           그 순간에 "다시 해보세요"만 주면 뭘 바꿔야 할지 모른 채 같은 말을 반복한다.
           → 틀리면 **모범 문장을 다시 들려주고** 처방 한 줄과 함께 재도전시킨다. */
        .then(function () {
          if (stopped()) return;
          setStep(2);
          var tries = 0;
          function attempt() {
            if (stopped()) return Promise.resolve();
            tries++;
            set('title', tries > 1 ? T('t3r') : T('t3'));
            set('sub', ko || '');
            set('main', en);
            set('feed', ''); set('tip', '');
            return speakOnce(en, lang, { okText: T('okSent') }).then(function (r) {
              res.sentScore = Math.max(res.sentScore, r.g.score || 0);
              res.tags = r.p.tags || [];
              remember(en, ko, !!r.g.pass, { tags: r.p.tags, goodTags: r.p.goodTags, score: r.g.score });
              if (r.g.pass) { res.passed = true; return wait(900); }
              if (tries >= SENT_TRIES) return wait(1600);
              /* 모범 문장을 다시 들려준 뒤 재도전 */
              return wait(1200).then(function () {
                if (stopped()) return;
                set('feed', '<span style="color:#7dd3fc">'+T('model')+'</span>');
                return say(en, lang, 0.85);
              }).then(function () { return wait(300); }).then(attempt);
            });
          }
          return attempt();
        })

        /* ─── ④ 되듣고 따라 말하기 (섀도잉) ────────────────────
           근거: 바람직한 어려움(Bjork) — 다시 읽기보다 기억에서 꺼내는 연습.
           낭독 **직후** 즉시 따라 말한다. 이 점수를 서버에 적립해 선순환을 잇는다. */
        .then(function () {
          if (stopped()) return;
          setStep(3);
          set('title', T('t4'));
          set('sub', ko || '');
          set('main', en);
          set('mic', '🔊'); set('feed', '<span style="color:#7dd3fc">'+T('s4')+'</span>'); set('tip', '');
          return say(en, lang, 1)
            .then(function () { if (stopped()) return; return speakOnce(en, lang, { okText: T('okShad') }); })
            .then(function (r) {
              if (!r) return;
              res.shadowScore = r.g.score || 0;
              if (r.g.pass) res.passed = true;
              remember(en, ko, !!r.g.pass, { tags: r.p.tags, goodTags: r.p.goodTags, score: r.g.score });
              return wait(r.g.pass ? 900 : 1600);
            });
        })

        /* ─── 마무리 — 「내가 늘고 있다」는 증거를 한 줄 ─────────
           근거: 자기결정성 이론(Deci & Ryan). 코인 대신 "이 단어 4번 연속 맞혔어요" 같은 증거. */
        .then(function () {
          if (stopped()) return;
          res.score = Math.round(res.sentScore * 0.5 + res.shadowScore * 0.3 + res.wordScore * 0.2);
          var best = Math.max(res.sentScore, res.shadowScore);
          if (best > 0) sendShadow(en, ko, best, lang);       // 서버 적립 — 기기를 바꿔도 남는다
          setStep(4);
          set('title', res.passed ? T('fin1') : T('fin0'));
          set('main', en);
          set('sub', ko || '');
          set('mic', res.passed ? '🌟' : '🌱');
          /* ⚠️ MangoiMemory.note() 는 한국어 문구만 돌려준다(공용 모듈이라 여기서 못 고친다).
             영어 모드에서 한국어가 섞여 나오면 안 되므로, 한국어 모드에서만 쓴다. */
          var note = '';
          try {
            if (localStorage.getItem('mangoi_lang') !== 'en')
              note = (window.MangoiMemory && MangoiMemory.note({ en: en })) || '';
          } catch (_) {}
          set('feed', '<span style="color:#4ade80">'+T('score')+' ' + best + T('pts')+'</span>');
          set('tip', note || (res.passed ? '' : T('again')));
          return wait(1700);
        })
        ['catch'](function () { /* 어떤 이유로 실패해도 게임은 계속된다 */ });
    })();

    return Promise.race([flow, bail]).then(done, done);
  }

  /* ══════════════════════════════════════════════════════════
     공개 API
     ══════════════════════════════════════════════════════════ */
  window.MangoiCycle = {
    run: run,               // 4단 사이클 실행 → Promise<result>
    warmWeak: warmWeak,     // 게임 시작 시 1회 — 서버에서 약점 받아두기
    isWeak: isWeak,         // 이 문장이 서버가 표시한 약점인가
    shouldRun: shouldRun,   // 게이트만 따로 물어볼 때
    pickWords: pickWords,   // 문장에서 핵심 낱말 뽑기
    busy: function () { return _busy; },
    setEvery: function (n) { EVERY_N = Math.max(1, parseInt(n, 10) || 3); }
  };
})();
