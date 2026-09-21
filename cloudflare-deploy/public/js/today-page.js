/* ═══════════════════════════════════════════════════════════════════════
 * 📅 today-page.js — /today.html 의 화면 코드 (2026-09-03)
 *   · 판정은 서버(/api/student/today → src/today-plan.ts)에 있다. 여기는 그리기만 한다.
 *   · 도구를 열 때 서버 레벨을 웜업·AI 친구 localStorage 키에 «비어 있을 때만» 심는다 —
 *     학생이 이미 고른 값은 덮지 않는다(그 화면들이 자기 키를 정본으로 읽기 때문).
 *   · 돌아왔을 때(pageshow·visibilitychange)만 다시 읽는다. 상주 타이머 없음.
 *   · 주간표는 «리듬 띠» 다(2026-09-04 사장님 결정) — 파랑 = 학원 수업일, 초록 = 집,
 *     오늘 칸만 아래에 펼쳐 도구 이름을 글자로 적는다. ⛔ 이모지 묶음 + 범례로 되돌리지 말 것.
 *   · 이 파일을 고치면 today.html 의 ?v= 를 올린다(asset_version_harness).
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function isEn() { try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; } }
  function T(ko, en) { return isEn() ? en : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 학생 로그인 판독 — judgment.html 의 resolveUser 와 같은 순서(정본 키는 mangoi_logged_user) */
  function user() {
    try {
      var u = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      if (u && (u.uid || u.user_id || u.id)) return { uid: u.uid || u.user_id || u.id, name: u.name || '' };
    } catch (e) {}
    return null;
  }
  function tok() { try { return localStorage.getItem('mango_token') || ''; } catch (e) { return ''; } }

  /* ═══ 🍯 맛보기 — 로그인 없이 «하루쯤» 둘러보기 (2026-09-05 사장님 지시) ═══
     처음 온 사람이 로그인 벽만 보고 나가던 것을 막는다. 서버가 개인정보가 없는
     «보기용» 계획(?sample=1)을 주고, 화면은 그것을 «맛보기» 라고 말한다.
     ⚠️ 창은 «처음 연 시각» 부터 잰다 — 기기 하나에 한 번뿐이라 계속 되살아나지 않는다.
     ⛔ localStorage 가 막힌 곳(사생활 보호 창)에서는 «창을 못 연다» 가 아니라 «맛보기를
        보여준다» 로 실패한다. 못 보여주면 고치려던 그 벽이 그대로다. */
  var SAMPLE_KEY = 'mangoi_today_sample_from';
  var SAMPLE_MS = 24 * 60 * 60 * 1000;
  function sampleOpen() {
    var now = Date.now();
    try {
      var v = Number(localStorage.getItem(SAMPLE_KEY) || 0);
      if (!v) { localStorage.setItem(SAMPLE_KEY, String(now)); return true; }
      return (now - v) < SAMPLE_MS;
    } catch (e) { return true; }   // 저장을 못 하는 기기 — 막지 않는다
  }

  var DATA = null;
  function show(id) { ['td-login', 'td-status', 'td-main'].forEach(function (x) { $(x).hidden = (x !== id); }); }
  function status(msg, err) { show('td-status'); var t = $('td-status-t'); t.textContent = msg; t.className = 'note' + (err ? ' err' : ''); }

  function load() {
    var u = user();
    if (!u || !u.uid) {
      if (!sampleOpen()) { show('td-login'); return; }   // 하루가 지났으면 로그인 안내로
      if (!DATA) status(T('맛보기 화면을 읽는 중…', 'Loading the sample…'));
      fetch('/api/student/today?sample=1')
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d && d.ok === true && d.plan) { DATA = d; render(); return; }
          show('td-login');   // 맛보기를 못 읽으면 원래 화면으로 — 빈 화면보다 낫다
        })
        .catch(function () { show('td-login'); });
      return;
    }
    if (!DATA) status(T('오늘 계획을 읽는 중…', 'Loading today\'s plan…'));
    fetch('/api/student/today?uid=' + encodeURIComponent(u.uid) + '&token=' + encodeURIComponent(tok()), { credentials: 'include' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.__http = r.status; return d; }); })
      .then(function (d) {
        /* «성공이라고 말했는가» 로 판정한다 — 관문이 빠진 404 본문에는 ok 칸이 없다(CLAUDE.md 「새 API 추가」) */
        if (d && d.ok === true && d.plan) { DATA = d; render(); return; }
        if (d.__http === 401) { show('td-login'); return; }
        if (d.__http === 404) { status(T('계정을 찾지 못했어요. 학원에 문의해 주세요.', 'Account not found — please contact your academy.'), true); return; }
        status(T('지금은 계획을 읽지 못했어요. 잠시 뒤 다시 열어 주세요.', 'Could not load the plan. Please try again shortly.'), true);
      })
      .catch(function () { status(T('연결이 끊겼어요. 인터넷을 확인해 주세요.', 'Connection failed. Check your internet.'), true); });
  }

  /* 서버 레벨 → 도구 키. 비어 있을 때만. (웜업 1~8 · AI 친구 S1~S8 = 같은 눈금) */
  function seedLevel(p) {
    var lk = p && p.levelKeys;
    if (!lk) return;
    try { if (lk.warmup && !localStorage.getItem('mangoi_warmup_level')) localStorage.setItem('mangoi_warmup_level', lk.warmup); } catch (e) {}
    try { if (lk.aifriend && !localStorage.getItem('mangoi_aifriend_level')) localStorage.setItem('mangoi_aifriend_level', lk.aifriend); } catch (e) {}
  }
  function goUrl(s, i, n) {
    var u = s.url;
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'from=today&step=' + (i + 1) + '&total=' + n;
  }

  /* 🎬 (2026-09-05 사장님 지시) 처음 온 사람에게만 안내 영상 한 줄.
     · «처음» 의 판정은 서버가 준 사실 하나 — 아직 레벨이 없다(band 가 비었다).
       레벨테스트를 보면 저절로 사라진다. 따로 «며칠째» 를 세지 않는다.
     · 닫으면 다시 안 뜬다(localStorage). ⛔ 그 값을 못 읽어도 «안 뜨는» 쪽으로 실패하지 않는다 —
       못 읽으면 그냥 보여 준다(안내를 잃는 것보다 한 번 더 보이는 편이 낫다).
     ⛔ 여기서 영상을 붙이지 않는다 — 24.4MB 다. 누르면 /promo.html 이 열리고 거기서 받는다.
     ⚠️ 대본이 「선생님은…」 으로 말한다(대상 = 원장·강사). 그래서 «함께 보세요» 라고 적는다 —
        학생이 3분을 듣다가 자기 이야기가 아니라는 걸 알고 나가지 않게. */
  /* 🪤 값 하나에 두 뜻을 담지 말 것 — 처음엔 «'1' = 닫음, 숫자 = 연 횟수» 로 썼는데
     첫 번째로 세는 순간 그 값이 '1' 이라 «닫았다» 로 읽혀 한 번만 뜨고 그쳤다.
     (브라우저 검사가 [true,false,false,false] 로 잡았다 — 문자열로는 안 보인다.)
     ⟹ 닫음은 숫자가 아닌 표시로 못 박는다. */
  var INTRO_KEY = 'mangoi_today_intro_v1';   // 'closed' = 사람이 닫음 · 그 밖에는 «연 횟수»
  var INTRO_MAX_OPENS = 3;
  function introState() {
    try { var v = localStorage.getItem(INTRO_KEY); return { dismissed: v === 'closed', opens: Number(v) || 0 }; }
    catch (e) { return { dismissed: false, opens: 0 }; }   // 못 읽으면 «보여 주는» 쪽으로 실패
  }
  function renderIntro(p) {
    var box = $('td-intro');
    if (!box) return;
    var st = introState();
    /* 🔴 «처음 온 사람» 을 무엇으로 가리나 — 2026-09-05 D1 실측이 답을 바꿨다.
       처음에는 «아직 레벨이 없다»(p.band) 하나로 했는데, `students_erp.level` 은
       **29,481명 중 1명**만 채워져 있다(CLAUDE.md 2장 「나이·학년으로 자동 분류」와 같은 사정).
       ⟹ 그 조건은 사실상 «로그인한 학생 전원» 이라 «처음» 을 하나도 못 거른다.
       그래서 실제로 거르는 것은 **이 화면을 연 횟수**(기기별)다 — 처음 3번만 보여 준다.
       ⛔ p.band 를 빼지는 않는다: 레벨이 채워지기 시작하면 «레벨 있는 사람» 은 그날부터
          바로 안 보게 되는 것이 맞다. 지금은 아무것도 안 거를 뿐이다. */
    var show = !st.dismissed && st.opens < INTRO_MAX_OPENS && !p.band;
    box.hidden = !show;
    if (!show) { box.innerHTML = ''; return; }
    try { localStorage.setItem(INTRO_KEY, String(st.opens + 1)); } catch (e) {}
    /* 📌 (2026-09-05) 학생 화면이므로 «학생·학부모용 30초 판» 을 가리킨다.
       ⛔ 3분 48초 판(?v=ai-tools)으로 되돌리지 말 것 — 그 대본은 선생님께 하는 말이다. */
    box.innerHTML =
      '<a href="/promo.html?v=ai-tools-short" target="_blank" rel="noopener">'
      + '<span class="t">' + esc(T('▶ 망고아이 AI 학습, 30초에 보기', '▶ MangoI AI learning — in 30 seconds')) + '</span>'
      + '<span class="s">' + esc(T('무엇을 언제 하면 되는지 한 번에 알 수 있어요.',
                                   'See what to do and when — all in one go.')) + '</span>'
      + '</a>'
      + '<button type="button" class="x" aria-label="' + esc(T('닫기', 'Close')) + '">✕</button>';
    box.querySelector('.x').addEventListener('click', function () {
      try { localStorage.setItem(INTRO_KEY, 'closed'); } catch (e) {}
      box.hidden = true; box.innerHTML = '';
    });
  }

  var SLOT = { before: ['수업 전', 'Before class'], after: ['수업 후', 'After class'], home: ['집에서', 'At home'], first: ['먼저', 'First'] };

  /* ── 🎯 오늘의 몫 한 줄 (2026-09-21) ─────────────────────────────────────────
   왜: 2026-09-21 D1 실측 — 게임 한 판 중앙값 40초(1,127판 중 57%가 1분 미만),
       발음은 하루 중앙값 1문장인데 화면이 내건 목표는 100문장이었다. 「언제까지
       해야 끝나는지 몰라 몇 번 하다 나간다」(사장님). 이 줄이 그 답이다.
   ⛔ 숫자를 여기 적지 않는다 — goal·단위는 서버(today-plan.ts 의 TOOL_GOALS)가 준다.
      화면에 다시 적으면 두 곳이 어긋나는 날 화면이 조용히 거짓말한다.
   ⛔ 채움을 인라인 <span> 으로 두지 않는다 — 인라인 요소는 width·height 를 무시해서
      «색도 폭도 코드엔 있는데 화면이 텅 비는» 사고가 난다(CLAUDE.md 2장). CSS 에서
      display:block 을 못 박았고, 0 일 때도 min-width 로 «측정 안 됨» 과 구분한다.
   ⛔ 글자 줄은 <p>(블록)로 둔다 — flex 로 감싸면 짧은 문장이 낱글자로 쪼개진다. */
function goalRow(s, sample, en) {
  var g = (s.goal == null) ? null : Number(s.goal);
  var c = Number(s.count) || 0;
  /* 맛보기 화면은 «남의 기록이 없는» 화면이다. 거기서 「0 / 5문장」은 사실이지만
     «너는 아무것도 안 했다» 로 읽힌다 — 연속일·포인트 칩을 뺀 것과 같은 이유다.
     그래서 목표만 말하고 진행은 그리지 않는다. */
  if (sample) {
    if (!g) return '';
    return '<p class="goal-t muted">' + T('오늘 몫 ' + g + unitKo(s, g), "Today's goal: " + g + ' ' + unitEn(s, g)) + '</p>';
  }
  /* 목표가 없는 도구(games) — 개수만 말하고 «몇 개 남았다» 는 말하지 않는다.
     지금 셀 수 있는 «판» 은 중앙값 40초라, 목표로 삼으면 들락날락도 «달성» 이 된다. */
  if (!g) {
    if (c <= 0) return '';
    return '<p class="goal-t muted">' + T('오늘 ' + c + unitKo(s, c) + ' 했어요',
                                          'You did ' + c + ' ' + unitEn(s, c) + ' today') + '</p>';
  }
  var hit = c >= g;
  var pct = Math.max(0, Math.min(100, Math.round(c / g * 100)));
  var left = Math.max(0, g - c);
  var txt = hit
    ? T('오늘 몫 끝! 🎉 ' + c + unitKo(s, c), "Today's goal done! 🎉 " + c + ' ' + unitEn(s, c))
    : T(c + ' / ' + g + unitKo(s, g) + ' · ' + left + unitKo(s, left) + ' 더!',
        c + ' / ' + g + ' ' + unitEn(s, g) + ' · ' + left + ' to go');
  return '<p class="goal-t' + (hit ? ' hit' : '') + '">' + esc(txt) + '</p>' +
         '<span class="gtrack"><span class="gfill' + (hit ? ' hit' : '') + '" style="width:' + pct + '%"></span></span>';
}
/* 단위는 서버가 준다. 영어만 복수 s 를 붙인다(한국어는 그대로). */
function unitKo(s, n) { return String(s.unitKo || '번'); }
function unitEn(s, n) { var u = String(s.unitEn || 'time'); return (n === 1) ? u : (u + 's'); }

function render() {
    var d = DATA, p = d.plan, en = isEn();
    /* ⛔ 맛보기 레벨(보기용)을 기기에 심지 않는다 — 그 값은 이 사람의 레벨이 아니고,
       한 번 심으면 «비어 있을 때만» 규칙 때문에 나중에 진짜 레벨이 와도 안 덮인다. */
    if (!d.sample) seedLevel(p);
    var sb = $('td-sample');
    if (sb) sb.hidden = !d.sample;
    show('td-main');
    var name = d.name || '';
    $('td-hello').textContent = name ? T(name + ' 님, 오늘도 조금만 해요', 'Hi ' + name + ' — a little today') : T('오늘도 조금만 해요', 'A little today');
    var sub = '';
    if (p.mode === 'unassigned') sub = T('아직 레벨이 없어요. 레벨테스트를 먼저 보면 모든 도구가 내 수준에 맞춰져요.', 'No level yet — take the level test first and every tool adapts to you.');
    else if (p.mode === 'class') sub = p.cls ? T('오늘 ' + p.cls.start + ' 수업이 있어요. 수업 앞뒤 10분이 제일 잘 남아요.', 'Class at ' + p.cls.start + ' today. The 10 minutes before and after stick best.') : '';
    else sub = T('오늘은 수업이 없는 날. 15분이면 충분해요.', 'No class today — 15 minutes is enough.');
    $('td-sub').textContent = sub;

    var chips = [];
    chips.push('<span class="chip mode">' + (p.mode === 'class' ? '🏫 ' + T('수업일', 'Class day') : (p.mode === 'home' ? '🏠 ' + T('집에서', 'At home') : '🎯 ' + T('레벨부터', 'Level first'))) + '</span>');
    if (p.band) chips.push('<span class="chip">' + esc(en ? p.bandEn : p.bandKo) + (p.cefr ? ' · ' + esc(p.cefr) : '') + '</span>');
    if (p.textbook) chips.push('<span class="chip">📚 ' + esc(p.textbook) + '</span>');
    /* ⛔ 맛보기에서는 연속일·포인트 칩을 그리지 않는다 — 값이 0 인 것은 사실이지만,
       그 화면에서는 «너는 아무것도 안 했다» 로 읽힌다(맛보기는 남의 기록이 없는 화면이다). */
    if (!d.sample) {
      chips.push('<span class="chip streak">🔥 ' + T('연속 ' + d.ai_streak + '일', d.ai_streak + '-day streak') + '</span>');
      chips.push('<span class="chip pts">⭐ ' + T('오늘 +' + d.points_today + 'P', '+' + d.points_today + 'P today') + '</span>');
    }
    $('td-chips').innerHTML = chips.join('');

  
  var n = p.steps.length, dn = p.doneCount;
    $('td-prog').style.width = (n ? Math.round(dn / n * 100) : 0) + '%';
    $('td-prog-t').textContent = (n && dn >= n)
      ? T('오늘 계획을 다 했어요! 🎉', 'All done for today! 🎉')
      : T(dn + '/' + n + ' 완료 · 약 ' + p.totalMinutes + '분', 'Done ' + dn + '/' + n + ' · about ' + p.totalMinutes + ' min');
    $('td-h-steps').textContent = T('오늘 할 일', 'Today');
    renderIntro(p);

    $('td-steps').innerHTML = p.steps.map(function (s, i) {
      var sl = SLOT[s.slot] || SLOT.home;
      return '<div class="card step' + (s.done ? ' done' : '') + '">' +
        '<div class="no">' + (s.done ? '✓' : (i + 1)) + '</div>' +
        (s.done ? '<div class="ok">' + T('완료', 'Done') + '</div>' : '') +
        '<span class="slot ' + esc(s.slot) + '">' + esc(en ? sl[1] : sl[0]) + '</span>' +
        '<p class="name">' + esc(s.icon) + ' ' + esc(en ? s.en : s.ko) + '</p>' +
        '<p class="why">' + esc(en ? s.whyEn : s.whyKo) + '</p>' +
        goalRow(s, !!d.sample, en) +
        '<a class="go" href="' + esc(goUrl(s, i, n)) + '">' + (s.done ? T('한 번 더', 'Once more') : T('시작 ▶', 'Start ▶')) + '</a>' +
        ' <span class="min">' + T('약 ' + s.minutes + '분', '~' + s.minutes + ' min') + '</span>' +
      '</div>';
    }).join('');

    /* ── 이번 주 «리듬 띠» — 파랑 = 학원 수업일, 초록 = 집. 색이 곧 범례다.
       ⛔ 이모지 묶음으로 되돌리지 말 것(2026-09-04 사장님 결정). 무슨 도구인지는 바로 아래
          «오늘» 상자와 위 「오늘 할 일」 카드가 말한다. */
    var W = p.week || [];
    $('td-week').innerHTML = W.map(function (w) {
      var v = w.isClass
        ? ('<span class="ic">🏫</span>' + esc(w.start || ''))
        : (w.minutes ? T(w.minutes + '분', w.minutes + 'm') : '');
      return '<div class="day' + (w.isToday ? ' today' : '') + (w.isClass ? ' cls' : '') + '">' +
        '<div class="d">' + esc(en ? w.en : w.ko) + '</div>' +
        '<div class="v">' + v + '</div></div>';
    }).join('');

    /* 오늘 칸만 «펼쳐» 무슨 도구를 하는지 글자로 — 띠만 두면 «오늘» 이 흐려진다.
       목록은 위 「오늘 할 일」과 같은 p.steps 를 쓴다(두 벌로 적으면 반드시 어긋난다). */
    var tdw = null;
    for (var wi = 0; wi < W.length; wi++) if (W[wi].isToday) { tdw = W[wi]; break; }
    var box = $('td-week-today');
    if (tdw && p.steps.length) {
      box.hidden = false;
      box.innerHTML = '<div class="t">' + esc(en ? tdw.en : tdw.ko) + T('요일 · 오늘', ' · today') + '</div>' +
        '<ol>' + p.steps.map(function (s) {
          return '<li>' + esc(s.icon) + ' ' + esc(en ? s.en : s.ko) +
                 ' <span class="m">— ' + T(s.minutes + '분', s.minutes + ' min') + (s.done ? ' ✓' : '') + '</span></li>';
        }).join('') + '</ol>';
    } else { box.hidden = true; box.innerHTML = ''; }

    /* 요약 — 주간표에서 그대로 센다(지어낸 값이 아니다). 🔥 연속일은 위 카드 칩에 이미 있어 넣지 않는다 */
    var nCls = 0, totMin = 0;
    for (var wj = 0; wj < W.length; wj++) { if (W[wj].isClass) nCls++; totMin += (W[wj].minutes || 0); }
    $('td-week-sum').innerHTML =
      '<span class="chip">🏫 ' + T('수업 ' + nCls + '회', nCls + ' classes') + '</span>' +
      '<span class="chip">🤖 ' + T('AI 약 ' + totMin + '분', '~' + totMin + ' min AI') + '</span>';

    $('td-legend').textContent = T(
      '파란 칸이 학원 수업이 있는 날 · 초록 칸은 집에서 하는 날이에요. 분 수는 그날 하기로 한 AI 학습 시간이에요.',
      'Blue = class day at the academy · green = at home. Minutes are the AI practice planned for that day.');
  }

  load();
  window.addEventListener('pageshow', function (e) { if (e.persisted) load(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && DATA) load(); });
  /* 언어 토글 — 발행처가 화면마다 다르다(document / window). 둘 다 듣는다(CLAUDE.md 2장). */
  window.addEventListener('mangoi:lang-changed', function () { if (DATA) render(); });
  document.addEventListener('mangoi:lang-changed', function () { if (DATA) render(); });
})();
