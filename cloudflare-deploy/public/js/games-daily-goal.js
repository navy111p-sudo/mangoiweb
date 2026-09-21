/* ═══════════════════════════════════════════════════════════════════════
 * 🎯 games-daily-goal.js — 게임 허브 맨 위 «오늘 몫» 줄 (2026-09-21)
 *
 * [왜]
 *   사장님: 「게임을 몇 번 하다가 나가요.」 실측이 그 말을 뒷받침한다 —
 *   2026-09-21 D1(game_sessions, 게임만): 학생-일 65일 중 **25일(38.5%)이
 *   «게임을 켰지만 한 문제도 안 푼 날»** 이다. 화면이 「오늘 이만큼」을
 *   말해 주지 않으니 들어와서 둘러보다 나간다.
 *
 * [무엇을 세나 — «판» 이 아니라 «문제»]
 *   판으로 세면 아무것도 안 하고 세 번 들락날락해도 달성이 된다.
 *   서버가 game_sessions.items(그 판에서 실제로 푼 문제 수)를 합쳐 준다.
 *
 * [⛔ 여기서 숫자를 계산하지 않는다]
 *   목표도 진행도도 서버(src/today-plan.ts → /api/student/today)가 정한다.
 *   화면이 따로 세면 「오늘의 A.i 학습」 카드와 답이 갈린다.
 *
 * [⛔ 상주 타이머·MutationObserver 금지]
 *   홈을 통째로 멎게 한 전력이 두 번 있다(2026-07-14 · 2026-08-27).
 *   돌아왔을 때(pageshow·visibilitychange)만 다시 읽는다.
 *
 * ⚠️ 이 파일을 고치면 student-games.html 의 ?v= 를 올린다(asset_version_harness).
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BOX = 'gdg-box';

  function isEn() { try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; } }
  function T(ko, en) { return isEn() ? en : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 🔴 로그인 정본이 적는 모양은 {uid,name,role} — user_id 칸이 없는 경로가 있다.
     한 키만 보면 그 경로로 들어온 학생이 전부 «손님» 으로 떨어진다(CLAUDE.md 2장). */
  function uid() {
    var keys = ['mangoi_logged_user', 'mango_user'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var u = JSON.parse(localStorage.getItem(keys[i]) || 'null');
        if (u && (u.uid || u.user_id || u.id)) return String(u.uid || u.user_id || u.id);
      } catch (e) {}
    }
    return '';
  }
  function tok() { try { return localStorage.getItem('mango_token') || ''; } catch (e) { return ''; } }

  function box() {
    var el = document.getElementById(BOX);
    if (el) return el;
    var panel = document.querySelector('#hub-menu .hub-panel');
    if (!panel) return null;
    el = document.createElement('div');
    el.id = BOX;
    /* 맨 위(코인 줄 앞)에 둔다 — 들어오자마자 «오늘 이만큼» 이 보여야 한다 */
    panel.insertBefore(el, panel.firstChild);
    return el;
  }

  function draw(goal, got) {
    var el = box();
    if (!el) return;
    goal = Math.max(0, Number(goal) || 0);
    got = Math.max(0, Number(got) || 0);
    if (!goal) { el.textContent = ''; return; }           // 목표가 없으면 아무 말도 안 한다
    var pct = Math.min(100, Math.round(got / goal * 100));
    var left = Math.max(0, goal - got);
    var hit = left <= 0;
    var ko = hit ? '🎉 오늘 몫 끝! · 더 해도 좋아요' : got + ' / ' + goal + '문제 · ' + left + '문제 더!';
    var en = hit ? '🎉 Done for today · keep going if you like' : got + ' / ' + goal + ' questions · ' + left + ' to go!';
    /* ⛔ data-ko/data-en 은 «글자만 담은 span» 에만 단다 — 상자에 달면 두 i18n 엔진이
       textContent 를 통째로 갈아끼워 막대가 DOM 에서 사라진다(CLAUDE.md 2장). */
    el.className = 'gdg' + (hit ? ' gdg-hit' : '');
    el.innerHTML =
      '<span class="gdg-t" data-ko="' + esc(ko) + '" data-en="' + esc(en) + '">' + esc(T(ko, en)) + '</span>' +
      '<span class="gdg-bar"><i style="width:' + pct + '%"></i></span>';
  }

  function load() {
    var u = uid();
    if (!u) return;                                        // 비로그인 — 아무것도 그리지 않는다
    fetch('/api/student/today?uid=' + encodeURIComponent(u) + '&token=' + encodeURIComponent(tok()),
          { credentials: 'include' })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        /* «성공이라고 말했는가» 로 판정한다 — 관문이 빠진 404 본문에는 ok 칸이 아예 없어
           `if (d.ok === false)` 는 그냥 통과한다(CLAUDE.md 「새 API 추가」). */
        if (!d || d.ok !== true || !d.plan) return;
        draw(d.plan.gameGoal, d.plan.gameItems);
      })
      .catch(function () {});                              // 못 읽으면 조용히 — 게임을 막지 않는다
  }

  function boot() {
    load();
    /* 게임을 하고 돌아왔을 때만 다시 읽는다 */
    window.addEventListener('pageshow', function (e) { if (e && e.persisted) load(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
    /* 🌐 를 누르면 글자를 다시 그린다. ⚠️ 관리자 화면은 document, 나머지는 window 로 쏜다 —
       한쪽만 들으면 조용히 침묵한다(CLAUDE.md 2장). 중복 호출은 다시 그리기뿐이라 무해하다. */
    var re = function () { load(); };
    window.addEventListener('mangoi:lang-changed', re);
    document.addEventListener('mangoi:lang-changed', re);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
