/* 🪙 A.i 말하기(웜업) — «끝내고 요약 보기» 창에 «받은 포인트» 한 줄 (2026-11-03 사장님 지시)
   서버 정본: src/warmup-points.ts (한 대화에서 직접 3번 이상 말하면 5P · 하루 1번).
   ⛔ 금액·횟수를 화면에서 지어내지 않는다 — 서버 응답(awarded·have)만 그린다. 모르면 «확인하지 못했어요».
   ⛔ warmup-guide.js 를 고치지 않는다 — #wgFinish 클릭(터치 바도 같은 버튼을 누름)에 리스너를 «더» 단다.
   ⚠️ 같은 대화(SESSION_ID)에서 한 번 받으면 다시 묻지 않는다(창을 다시 열어도 그 결과를 그대로 보여 준다). */
(function () {
  'use strict';
  var NEED = 3;
  var pending = {};
  var done = {};   // session_id → 마지막 결과(성공·한도만 기억)

  function en() { try { return (typeof window.getLang === 'function' ? window.getLang() : '') === 'en'; } catch (e) { return false; } }
  function uid() {
    try { if (typeof window.getLoginId === 'function') return String(window.getLoginId() || ''); } catch (e) {}
    return '';
  }

  /* 순수 판정 — 서버 응답 → 그릴 문장. 하니스가 그대로 돌린다. */
  function view(d, opt) {
    opt = opt || {};
    if (opt.guest) return { cls: 'info', ko: '🔑 로그인하면 3번 이상 말할 때 +5P 를 받아요', en: '🔑 Log in to earn +5P for speaking 3 or more times' };
    if (opt.pending) return { cls: 'info', ko: '💰 포인트 확인 중…', en: '💰 Checking points…' };
    if (!d) return { cls: 'warn', ko: '⚠️ 포인트를 확인하지 못했어요 — 잠시 뒤 다시 «끝내고 요약 보기» 를 눌러 주세요', en: "⚠️ Couldn't check points — press «Finish» again in a moment" };
    /* 서버 earn-by-rule 응답: { ok, signed(실제로 더한 값), newBalance, rule:{amount} } */
    var got = d.ok === true ? Number(typeof d.signed === 'number' ? d.signed : (d.rule && d.rule.amount)) : 0;
    if (d.ok === true && got > 0) {
      var t = '🥭 A.i 말하기 포인트 +' + got + 'P 받았어요!';
      var te = '🥭 You earned +' + got + 'P for speaking practice!';
      if (typeof d.newBalance === 'number') { t += ' (내 포인트 ' + d.newBalance + 'P)'; te += ' (Balance ' + d.newBalance + 'P)'; }
      return { cls: 'earn', ko: t, en: te };
    }
    var e = d.error;
    if (e === 'not_enough_turns') {
      var h = typeof d.have === 'number' ? d.have : 0, n = typeof d.need === 'number' ? d.need : NEED;
      return { cls: 'info', ko: '🗣️ 지금 ' + h + '번 말했어요 — ' + n + '번 이상 말하고 끝내면 +5P 를 받아요', en: '🗣️ You spoke ' + h + ' time(s) — speak ' + n + '+ times, then finish, to earn +5P' };
    }
    if (e === 'daily_cap_reached') return { cls: 'info', ko: '✅ 오늘 A.i 말하기 포인트는 이미 받았어요 — 내일 또 받아요', en: "✅ You already got today's speaking points — come back tomorrow" };
    if (e === 'daily_total_cap_reached' || e === 'game_daily_cap_reached') return { cls: 'info', ko: '✅ 오늘 받을 수 있는 포인트를 다 채웠어요 — 내일 또 만나요', en: "✅ You've reached today's point limit — see you tomorrow" };
    if (e === 'auth_required') return { cls: 'warn', ko: '🔑 로그인이 풀렸어요 — 다시 로그인하면 포인트를 받을 수 있어요', en: '🔑 Your login expired — log in again to earn points' };
    return { cls: 'warn', ko: '⚠️ 포인트를 확인하지 못했어요 — 잠시 뒤 다시 «끝내고 요약 보기» 를 눌러 주세요', en: "⚠️ Couldn't check points — press «Finish» again in a moment" };
  }

  function box() {
    var b = document.getElementById('wgPts');
    if (b) return b;
    var notice = document.getElementById('wgSummaryNotice');
    if (!notice || !notice.parentNode) return null;
    b = document.createElement('p');
    b.id = 'wgPts';
    b.setAttribute('role', 'status');
    b.style.cssText = 'margin:8px 0;padding:9px 12px;border-radius:10px;font-weight:800;font-size:15px;line-height:1.4;white-space:normal';
    notice.parentNode.insertBefore(b, notice.nextSibling);
    return b;
  }
  var COLORS = { earn: ['rgba(34,197,94,.16)', '#86efac'], info: ['rgba(56,189,248,.14)', '#bae6fd'], warn: ['rgba(251,191,36,.16)', '#fde68a'] };
  function paint(v) {
    var b = box(); if (!b) return;
    var c = COLORS[v.cls] || COLORS.info;
    b.style.background = c[0]; b.style.color = c[1];
    b.textContent = en() ? v.en : v.ko;
  }

  function run() {
    var sid = String(window.SESSION_ID || '');
    var u = uid();
    if (!u || /^guest/i.test(u)) { paint(view(null, { guest: true })); return; }
    if (done[sid]) { paint(view(done[sid])); return Promise.resolve(done[sid]); }
    if (pending[sid]) return pending[sid];
    paint(view(null, { pending: true }));
    var tk = ''; try { tk = localStorage.getItem('mango_token') || ''; } catch (e) {}
    var headers = { 'Content-Type': 'application/json' };
    if (tk) headers.Authorization = 'Bearer ' + tk;
    return pending[sid] = fetch('/api/points/earn-by-rule', {
      method: 'POST', headers: headers,
      body: JSON.stringify({ user_id: u, rule_code: 'warmup_talk', token: tk || undefined, meta: { session_id: sid } })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && (d.ok === true || d.error === 'daily_cap_reached' || d.error === 'daily_total_cap_reached')) done[sid] = d;
      delete pending[sid];
      paint(view(d)); return d;
    }).catch(function () { delete pending[sid]; paint(view(null)); return null; });
  }

  function arm() {
    var btn = document.getElementById('wgFinish');
    if (!btn || btn.__wgPts) return;
    btn.__wgPts = 1;
    btn.addEventListener('click', function () { try { run(); } catch (e) {} });
  }
  window.__mgWarmupPts = { view: view, run: run };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
})();
