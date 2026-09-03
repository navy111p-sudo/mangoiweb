/* ═══════════════════════════════════════════════════════════════════════
 * 📅 today-page.js — /today.html 의 화면 코드 (2026-09-03)
 *   · 판정은 서버(/api/student/today → src/today-plan.ts)에 있다. 여기는 그리기만 한다.
 *   · 도구를 열 때 서버 레벨을 웜업·AI 친구 localStorage 키에 «비어 있을 때만» 심는다 —
 *     학생이 이미 고른 값은 덮지 않는다(그 화면들이 자기 키를 정본으로 읽기 때문).
 *   · 돌아왔을 때(pageshow·visibilitychange)만 다시 읽는다. 상주 타이머 없음.
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

  var ICON = { warmup: '🗣️', review: '🧠', friend: '🤖', speech: '🎤', micro: '⚡', vocab: '📖', judgment: '🧭', write: '✍️', games: '🎮' };
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

    $('td-week').innerHTML = p.week.map(function (w) {
      return '<div class="day' + (w.isToday ? ' today' : '') + (w.isClass ? ' cls' : '') + '">' +
        '<div class="d">' + esc(en ? w.en : w.ko) + '</div>' +
        '<div class="ic">' + w.tools.map(function (k) { return ICON[k] || ''; }).join('') + '</div>' +
        '<div class="tag">' + (w.isClass ? '🏫' : (en ? 'home' : '집')) + '</div></div>';
    }).join('');
    $('td-legend').textContent = T(
      '🏫 수업일: 🗣️ 웜업(전) → 🧠 복습퀴즈(후) → ⚡ 단어(집) · 집: 말하기 하나 + 복습 하나 + 요일 특별',
      '🏫 class day: warm-up → review quiz → words at home · home: one speaking + one review + a weekday special');
  }

  load();
  window.addEventListener('pageshow', function (e) { if (e.persisted) load(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && DATA) load(); });
  /* 언어 토글 — 발행처가 화면마다 다르다(document / window). 둘 다 듣는다(CLAUDE.md 2장). */
  window.addEventListener('mangoi:lang-changed', function () { if (DATA) render(); });
  document.addEventListener('mangoi:lang-changed', function () { if (DATA) render(); });
})();
