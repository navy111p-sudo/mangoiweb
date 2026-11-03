/* 🪙 게임 허브 결과 화면 — «이번 판에 받은 것» 을 사실대로 (2026-11-03 사장님 지시)
 *
 *   ⚠️ 허브 안 게임(벽돌·빈칸·풍선·짝맞추기 등)은 망고 포인트(1P=1원)를 «주지 않습니다».
 *      주는 것은 💰 코인(게임 상점용 · 이 기기에만 쌓임)뿐입니다. 실제 망고 포인트를 주는 게임은
 *      «망고 구조선의 대항해» 하나이고, 그 화면은 자기 결과에 이미 «이번 판 받은 포인트» 를 보여 줍니다.
 *      ⟹ 여기서는 ① 이번 판 💰 코인 ② «오늘 게임으로 받은 망고 포인트»(서버가 센 값) 를 보여 주고,
 *         ⛔ 이 판에서 망고 포인트를 받은 것처럼 지어내지 않습니다.
 *   ⚠️ student-games.html 은 첫 화면 예산이 꽉 차 있어(blocking 317KB = 상한) 이 파일을 defer 로 따로 둡니다.
 *      그래서 원래 함수를 «밖에서 감쌉니다» — 그 이름(gameInit·_addCoins·_gameShowResult·_gameOver)이
 *      바뀌면 조용히 헛돕니다(하니스 game_hub_points_harness 가 이름을 못 박습니다).
 *   ⛔ 받은 금액을 저장하지 않습니다(잔액은 바뀌므로). 서버 조회 실패 = «확인하지 못했어요»(0 으로 지어내지 않음). */
(function(){
  'use strict';
  var W = window;
  if (typeof W._gameShowResult !== 'function' || typeof W._gameOver !== 'function' ||
      typeof W.gameInit !== 'function' || typeof W._addCoins !== 'function') return;

  var round = 0;
  var oInit = W.gameInit, oAdd = W._addCoins, oShow = W._gameShowResult, oOver = W._gameOver;

  function playing(){ try { return !!(_gameState && _gameState.started); } catch (e) { return false; } }

  W.gameInit = function(){ round = 0; return oInit.apply(this, arguments); };
  W._addCoins = function(n){
    try { var k = Number(n); if (k > 0 && playing()) round += k; } catch (e) {}
    return oAdd.apply(this, arguments);
  };

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function en(){ try { return String(document.documentElement.getAttribute('lang') || 'ko').indexOf('en') === 0; } catch (e) { return false; } }
  function span(ko, enTxt){ return '<span data-ko="' + esc(ko) + '" data-en="' + esc(enTxt) + '">' + esc(en() ? enTxt : ko) + '</span>'; }

  function uidNow(){ try { return (W.MangoiGameVocab && W.MangoiGameVocab.getUserId()) || ''; } catch (e) { return ''; } }

  /* 서버 답 → 망고 포인트 줄(순수 함수 — 하니스가 실제로 돌립니다).
     d: /api/student/today 응답 · guest: 로그인 안 함 · failed: 못 물어봄 */
  function mangoLine(d, guest, failed){
    if (guest) return { cls:'muted', ko:'🔑 로그인하면 «망고 구조선» 게임에서 망고 포인트를 받을 수 있어요', en:'🔑 Log in to earn Mangoi points in «Mango Rescue Voyage»' };
    if (failed || !d || d.ok !== true || d.points_by_tool == null) return { cls:'warn', ko:'⚠️ 오늘 받은 망고 포인트를 확인하지 못했어요', en:"⚠️ Couldn't check today's Mangoi points" };
    var g = Number(d.points_by_tool.games || 0);
    if (!(g > 0)) g = 0;
    if (g > 0) return { cls:'ok', ko:'🥭 오늘 게임으로 받은 망고 포인트 +' + g + 'P', en:"🥭 Mangoi points from games today +" + g + 'P' };
    return { cls:'muted', ko:'🥭 오늘 게임으로 받은 망고 포인트는 아직 없어요 — «망고 구조선» 에서 문장을 완성하면 받아요', en:'🥭 No Mangoi points from games yet today — finish sentences in «Mango Rescue Voyage» to earn them' };
  }

  function coinLine(n){
    return n > 0
      ? { ko:'💰 이번 판 코인 +' + n + ' (게임 상점용이에요 · 망고 포인트와 달라요)', en:'💰 Coins this round +' + n + ' (for the game shop — not Mangoi points)' }
      : { ko:'💰 이번 판에 받은 코인은 없어요', en:'💰 No coins this round' };
  }

  function boxHtml(n){
    var c = coinLine(n);
    return '<div id="hub-pts" style="margin:14px auto 0;max-width:460px;text-align:left;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.55">'
      + '<div style="color:#fbbf24;font-weight:800">' + span(c.ko, c.en) + '</div>'
      + '<div id="hub-pts-mango" style="color:#cbd5e1;margin-top:4px">' + span('🥭 오늘 받은 망고 포인트 확인 중…', "🥭 Checking today's Mangoi points…") + '</div>'
      + '</div>';
  }

  var seq = 0;
  function attach(){
    var area = document.getElementById('game-area'); if (!area) return;
    var box = area.firstElementChild; if (!box) return;
    var old = document.getElementById('hub-pts'); if (old && old.parentNode) old.parentNode.removeChild(old);
    var holder = document.createElement('div');
    holder.innerHTML = boxHtml(round);
    var node = holder.firstChild;
    /* 버튼 줄 «앞» 에 — 결과 숫자 바로 아래, 버튼보다 위 */
    var btn = box.querySelector('button'), row = btn && btn.parentNode !== box ? btn.parentNode : btn;
    if (row && row.parentNode === box) box.insertBefore(node, row); else box.appendChild(node);
    var my = ++seq;
    var uid = uidNow();
    function paint(L){
      if (my !== seq) return;
      var el = document.getElementById('hub-pts-mango'); if (!el) return;
      el.style.color = L.cls === 'ok' ? '#fbbf24' : (L.cls === 'warn' ? '#fca5a5' : '#cbd5e1');
      if (L.cls === 'ok') el.style.fontWeight = '800';
      el.innerHTML = span(L.ko, L.en);
    }
    if (!uid || /^guest/i.test(uid)) { paint(mangoLine(null, true, false)); return; }
    var tok = ''; try { tok = localStorage.getItem('mango_token') || ''; } catch (e) {}
    try {
      fetch('/api/student/today?uid=' + encodeURIComponent(uid) + '&token=' + encodeURIComponent(tok), { credentials:'include' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){ paint(mangoLine(d, false, !d)); })
        .catch(function(){ paint(mangoLine(null, false, true)); });
    } catch (e) { paint(mangoLine(null, false, true)); }
  }

  W._gameShowResult = function(){ var r = oShow.apply(this, arguments); try { attach(); } catch (e) {} return r; };
  W._gameOver = function(){ var r = oOver.apply(this, arguments); try { attach(); } catch (e) {} return r; };
  W.__mgHubPts = { mangoLine: mangoLine, coinLine: coinLine, round: function(){ return round; } };
})();
