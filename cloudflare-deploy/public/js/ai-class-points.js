/* 🪙 A.i 선생님 수업 — 끝 창(#endOv)에 «받은 포인트» 한 줄 (2026-11-03 사장님 지시)
   서버 정본: src/ai-class-points.ts (끝까지 마치고 별 1개 이상이면 5P · 하루 1번).
   ⛔ 금액을 화면에서 지어내지 않는다 — 서버 응답(signed·newBalance)만 그린다. 모르면 «확인하지 못했어요».
   ⚠️ 계정은 mangoi_logged_user 의 uid «또는» user_id(로그인 경로마다 모양이 다름 — CLAUDE.md 2장).
   ⚠️ 같은 페이지에서 한 번 받으면(또는 한도면) 다시 묻지 않는다 — «다시 하기» 로 또 끝내도 그 결과를 보여 준다. */
(function () {
  'use strict';
  var last = null;   // 받음·한도 결과만 기억

  function en() { try { return (typeof window.getLang === 'function' ? window.getLang() : '') === 'en'; } catch (e) { return false; } }
  function uid() {
    try {
      var u = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      var id = u && (u.uid || u.user_id || u.id);
      return id ? String(id) : '';
    } catch (e) { return ''; }
  }

  /* 순수 판정 — 서버 응답 → 그릴 문장. 하니스가 그대로 돌린다. */
  function view(d, opt) {
    opt = opt || {};
    if (opt.guest) return { cls: 'info', ko: '🔑 로그인하면 수업을 끝까지 마칠 때 +5P 를 받아요', en: '🔑 Log in to earn +5P for finishing a class' };
    if (opt.pending) return { cls: 'info', ko: '💰 포인트 확인 중…', en: '💰 Checking points…' };
    if (opt.early) return { cls: 'info', ko: '🏁 수업을 끝까지 마치면 +5P 를 받아요', en: '🏁 Finish the whole class to earn +5P' };
    if (opt.noStars) return { cls: 'info', ko: '⭐ 별을 1개 이상 받으면 +5P 를 받아요', en: '⭐ Earn at least 1 star to get +5P' };
    if (!d) return { cls: 'warn', ko: '⚠️ 이번엔 포인트를 확인하지 못했어요', en: "⚠️ Couldn't check points this time" };
    var got = d.ok === true ? Number(typeof d.signed === 'number' ? d.signed : (d.rule && d.rule.amount)) : 0;
    if (d.ok === true && got > 0) {
      var t = '🥭 A.i 선생님 수업 포인트 +' + got + 'P 받았어요!';
      var te = '🥭 You earned +' + got + 'P for finishing the class!';
      if (typeof d.newBalance === 'number') { t += ' (내 포인트 ' + d.newBalance + 'P)'; te += ' (Balance ' + d.newBalance + 'P)'; }
      return { cls: 'earn', ko: t, en: te };
    }
    var e = d.error;
    if (e === 'no_stars') return { cls: 'info', ko: '⭐ 별을 1개 이상 받으면 +5P 를 받아요', en: '⭐ Earn at least 1 star to get +5P' };
    if (e === 'daily_cap_reached') return { cls: 'info', ko: '✅ 오늘 A.i 선생님 수업 포인트는 이미 받았어요 — 내일 또 받아요', en: "✅ You already got today's class points — come back tomorrow" };
    if (e === 'daily_total_cap_reached' || e === 'game_daily_cap_reached') return { cls: 'info', ko: '✅ 오늘 받을 수 있는 포인트를 다 채웠어요 — 내일 또 만나요', en: "✅ You've reached today's point limit — see you tomorrow" };
    if (e === 'auth_required') return { cls: 'warn', ko: '🔑 로그인이 풀렸어요 — 다시 로그인하면 포인트를 받을 수 있어요', en: '🔑 Your login expired — log in again to earn points' };
    return { cls: 'warn', ko: '⚠️ 이번엔 포인트를 확인하지 못했어요', en: "⚠️ Couldn't check points this time" };
  }

  var COLORS = { earn: ['rgba(34,197,94,.16)', '#86efac'], info: ['rgba(56,189,248,.14)', '#bae6fd'], warn: ['rgba(251,191,36,.16)', '#fde68a'] };
  function box() {
    var b = document.getElementById('endPts');
    if (b) return b;
    var stars = document.getElementById('endStars');
    if (!stars || !stars.parentNode) return null;
    b = document.createElement('p');
    b.id = 'endPts';
    b.setAttribute('role', 'status');
    b.style.cssText = 'margin:6px 0 10px;padding:9px 12px;border-radius:10px;font-weight:800;font-size:15px;line-height:1.4;white-space:normal';
    stars.parentNode.insertBefore(b, stars.nextSibling);
    return b;
  }
  function paint(v) {
    var b = box(); if (!b) return;
    var c = COLORS[v.cls] || COLORS.info;
    b.style.background = c[0]; b.style.color = c[1];
    b.textContent = en() ? v.en : v.ko;
  }

  /* 끝 창이 열릴 때 부른다(ai-class.html showEnd). r = { early, stars, targets, lesson }
     ⛔ early(«🚪 끝내기» 로 중간에 멈춤)면 서버에 묻지 않는다 — 규칙은 «끝까지 마치면» 이다. */
  function run(r) {
    r = r || {};
    var u = uid();
    if (!u || /^(guest|anon)/i.test(u)) { paint(view(null, { guest: true })); return; }
    if (last) { paint(view(last)); return; }
    if (r.early) { paint(view(null, { early: true })); return; }   // «끝내기» 로 중간에 멈춤 — 끝까지 한 것이 아니다
    if (!(Number(r.stars) >= 1)) { paint(view(null, { noStars: true })); return; }
    paint(view(null, { pending: true }));
    var tk = ''; try { tk = localStorage.getItem('mango_token') || ''; } catch (e) {}
    var headers = { 'Content-Type': 'application/json' };
    if (tk) headers.Authorization = 'Bearer ' + tk;
    fetch('/api/points/earn-by-rule', {
      method: 'POST', headers: headers,
      body: JSON.stringify({ user_id: u, rule_code: 'ai_class_done', token: tk || undefined,
        meta: { stars: Number(r.stars), targets: Number(r.targets), lesson: String(r.lesson || '') } })
    }).then(function (res) { return res.json(); }).then(function (d) {
      if (d && (d.ok === true || d.error === 'daily_cap_reached' || d.error === 'daily_total_cap_reached')) last = d;
      paint(view(d));
    }).catch(function () { paint(view(null)); });
  }

  window.__mgAiClassPts = { view: view, run: run };
})();
