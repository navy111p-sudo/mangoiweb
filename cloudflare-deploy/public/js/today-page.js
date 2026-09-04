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

  var DATA = null;
  function show(id) { ['td-login', 'td-status', 'td-main'].forEach(function (x) { $(x).hidden = (x !== id); }); }
  function status(msg, err) { show('td-status'); var t = $('td-status-t'); t.textContent = msg; t.className = 'note' + (err ? ' err' : ''); }

  function load() {
    var u = user();
    if (!u || !u.uid) { show('td-login'); return; }
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

  var SLOT = { before: ['수업 전', 'Before class'], after: ['수업 후', 'After class'], home: ['집에서', 'At home'], first: ['먼저', 'First'] };

  function render() {
    var d = DATA, p = d.plan, en = isEn();
    seedLevel(p);
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
    chips.push('<span class="chip streak">🔥 ' + T('연속 ' + d.ai_streak + '일', d.ai_streak + '-day streak') + '</span>');
    chips.push('<span class="chip pts">⭐ ' + T('오늘 +' + d.points_today + 'P', '+' + d.points_today + 'P today') + '</span>');
    $('td-chips').innerHTML = chips.join('');

    var n = p.steps.length, dn = p.doneCount;
    $('td-prog').style.width = (n ? Math.round(dn / n * 100) : 0) + '%';
    $('td-prog-t').textContent = (n && dn >= n)
      ? T('오늘 계획을 다 했어요! 🎉', 'All done for today! 🎉')
      : T(dn + '/' + n + ' 완료 · 약 ' + p.totalMinutes + '분', 'Done ' + dn + '/' + n + ' · about ' + p.totalMinutes + ' min');
    $('td-h-steps').textContent = T('오늘 할 일', 'Today');

    $('td-steps').innerHTML = p.steps.map(function (s, i) {
      var sl = SLOT[s.slot] || SLOT.home;
      return '<div class="card step' + (s.done ? ' done' : '') + '">' +
        '<div class="no">' + (s.done ? '✓' : (i + 1)) + '</div>' +
        (s.done ? '<div class="ok">' + T('완료', 'Done') + '</div>' : '') +
        '<span class="slot ' + esc(s.slot) + '">' + esc(en ? sl[1] : sl[0]) + '</span>' +
        '<p class="name">' + esc(s.icon) + ' ' + esc(en ? s.en : s.ko) + '</p>' +
        '<p class="why">' + esc(en ? s.whyEn : s.whyKo) + '</p>' +
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
      '파란 칸이 학원 수업이 있는 날 · 초록 칸은 집에서 하는 날이에요. 분 수는 그날 AI 도구에 드는 시간이에요.',
      'Blue = class day at the academy · green = at home. Minutes are the AI tools planned for that day.');
  }

  load();
  window.addEventListener('pageshow', function (e) { if (e.persisted) load(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && DATA) load(); });
  /* 언어 토글 — 발행처가 화면마다 다르다(document / window). 둘 다 듣는다(CLAUDE.md 2장). */
  window.addEventListener('mangoi:lang-changed', function () { if (DATA) render(); });
  document.addEventListener('mangoi:lang-changed', function () { if (DATA) render(); });
})();
