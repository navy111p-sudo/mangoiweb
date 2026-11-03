/* 🪙 교재 낱말 쓰기 숙제 — 결과 칸(#cq-result)에 «받은 포인트» 한 줄 (2026-11-03 사장님 지시)
   서버 정본: src/scene-words-points.ts (한 판을 끝까지 마치고 1개 이상 맞히면 5P · 하루 1번).
   ⛔ 금액을 화면에서 지어내지 않는다 — 서버 응답(signed·newBalance)만 그린다. 모르면 «확인하지 못했어요».
   ⛔ «어려웠던 표현 다시 도전» 판(review)은 묻지 않는다 — 규칙은 «숙제 한 판» 이다.
   ⚠️ 언어는 scene-curriculum.js 의 tr() 과 같은 기준(<html lang>)이다.
   ⚠️ 같은 페이지에서 한 번 받으면(또는 한도면) 다시 묻지 않는다 — 또 끝내도 그 결과를 보여 준다. */
(function () {
  'use strict';
  var last = null;   // 받음·한도 결과만 기억

  function en() { return document.documentElement.lang === 'en'; }
  function uid() {
    try {
      var u = localStorage.getItem('mangoi_uid'); if (u) return String(u);
      var raw = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null');
      var id = raw && (raw.uid || raw.user_id || raw.id);
      return id ? String(id) : '';
    } catch (e) { return ''; }
  }

  /* 순수 판정 — 서버 응답 → 그릴 문장. 하니스가 그대로 돌린다. */
  function view(d, opt) {
    opt = opt || {};
    if (opt.guest) return { cls: 'info', ko: '🔑 로그인하면 숙제를 끝까지 마칠 때 +5P 를 받아요', en: '🔑 Log in to earn +5P for finishing your homework' };
    if (opt.pending) return { cls: 'info', ko: '💰 포인트 확인 중…', en: '💰 Checking points…' };
    if (opt.review) return { cls: 'info', ko: '🔁 다시 도전 판은 포인트가 없어요 — 숙제 한 판을 끝까지 하면 하루 한 번 +5P', en: '🔁 Retry rounds give no points — finish a homework round for +5P once a day' };
    if (opt.noCorrect) return { cls: 'info', ko: '✏️ 1개 이상 맞히면 +5P 를 받아요', en: '✏️ Get at least 1 right to earn +5P' };
    if (!d) return { cls: 'warn', ko: '⚠️ 이번엔 포인트를 확인하지 못했어요', en: "⚠️ Couldn't check points this time" };
    var got = d.ok === true ? Number(typeof d.signed === 'number' ? d.signed : (d.rule && d.rule.amount)) : 0;
    if (d.ok === true && got > 0) {
      var t = '🥭 낱말 쓰기 숙제 포인트 +' + got + 'P 받았어요!';
      var te = '🥭 You earned +' + got + 'P for your word homework!';
      if (typeof d.newBalance === 'number') { t += ' (내 포인트 ' + d.newBalance + 'P)'; te += ' (Balance ' + d.newBalance + 'P)'; }
      return { cls: 'earn', ko: t, en: te };
    }
    var e = d.error;
    if (e === 'no_correct') return { cls: 'info', ko: '✏️ 1개 이상 맞히면 +5P 를 받아요', en: '✏️ Get at least 1 right to earn +5P' };
    if (e === 'daily_cap_reached') return { cls: 'info', ko: '✅ 오늘 낱말 쓰기 숙제 포인트는 이미 받았어요 — 내일 또 받아요', en: "✅ You already got today's homework points — come back tomorrow" };
    if (e === 'daily_total_cap_reached' || e === 'game_daily_cap_reached') return { cls: 'info', ko: '✅ 오늘 받을 수 있는 포인트를 다 채웠어요 — 내일 또 만나요', en: "✅ You've reached today's point limit — see you tomorrow" };
    if (e === 'auth_required') return { cls: 'warn', ko: '🔑 로그인이 풀렸어요 — 다시 로그인하면 포인트를 받을 수 있어요', en: '🔑 Your login expired — log in again to earn points' };
    return { cls: 'warn', ko: '⚠️ 이번엔 포인트를 확인하지 못했어요', en: "⚠️ Couldn't check points this time" };
  }

  /* 밝은 화면(#cq-result 는 흰 카드) 위에서 읽히는 색 */
  var COLORS = { earn: ['#dcfce7', '#166534'], info: ['#e0f2fe', '#075985'], warn: ['#fef3c7', '#92400e'] };
  function paint(v) {
    var host = document.getElementById('cq-result'); if (!host) return;
    var b = document.getElementById('cqPts');
    if (!b || b.parentNode !== host) {   // 결과 칸은 끝낼 때마다 replaceChildren 으로 새로 그려진다
      b = document.createElement('p');
      b.id = 'cqPts';
      b.setAttribute('role', 'status');
      b.style.cssText = 'margin:10px 0 4px;padding:9px 12px;border-radius:10px;font-weight:800;font-size:15px;line-height:1.4;white-space:normal';
      host.appendChild(b);
    }
    var c = COLORS[v.cls] || COLORS.info;
    b.style.background = c[0]; b.style.color = c[1];
    b.textContent = en() ? v.en : v.ko;
  }

  /* 결과가 그려질 때 부른다(scene-curriculum.js finish). r = { review, correct, items, book } */
  function run(r) {
    r = r || {};
    if (r.review) { paint(view(null, { review: true })); return; }
    var u = uid();
    if (!u || /^(guest|anon)/i.test(u)) { paint(view(null, { guest: true })); return; }
    if (last) { paint(view(last)); return; }
    if (!(Number(r.correct) >= 1)) { paint(view(null, { noCorrect: true })); return; }
    paint(view(null, { pending: true }));
    var tk = ''; try { tk = localStorage.getItem('mango_token') || ''; } catch (e) {}
    var headers = { 'Content-Type': 'application/json' };
    if (tk) headers.Authorization = 'Bearer ' + tk;
    fetch('/api/points/earn-by-rule', {
      method: 'POST', headers: headers,
      body: JSON.stringify({ user_id: u, rule_code: 'scene_words_done', token: tk || undefined,
        meta: { correct: Number(r.correct), items: Number(r.items), book: String(r.book || '') } })
    }).then(function (res) { return res.json(); }).then(function (d) {
      if (d && (d.ok === true || d.error === 'daily_cap_reached' || d.error === 'daily_total_cap_reached')) last = d;
      paint(view(d));
    }).catch(function () { paint(view(null)); });
  }

  window.__mgSceneWordsPts = { view: view, run: run };
})();
