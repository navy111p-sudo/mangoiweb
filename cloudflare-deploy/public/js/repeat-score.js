/* ═══════════════════════════════════════════════════════════════════════
   🎤 repeat-score.js — «따라 말해 보기» 채점 (2026-10-18, 개선안 1순위 ④)
   웜업(warmup.html)·AI 친구하기(ai-friend.html) 교정 카드의 「🎤 따라 말해 보기」 뒤에
   학생이 말한 문장을 목표 문장과 낱말 단위로 맞춰 «몇 개 맞았는지» 를 보여 준다.

   [왜] 예전에는 마이크를 열어 주기만 하고 아무 판정도 없었다 — 따라 말했는지·틀렸는지를
        학생도 선생님도 몰랐다(«되말해 주기만 하면 흘려 듣는다» 를 반만 고친 상태).
   ⛔ AI 로 채점하지 않는다 — 결정론(낱말 맞춰 보기, LCS). 같은 말에 늘 같은 점수.
   ⛔ 지어내지 않는다 — 들은 말이 비었거나 목표와 겹치는 낱말이 «하나도» 없으면 카드를 안 그린다
      (그건 따라 말한 것이 아니라 다른 말을 보낸 것일 수 있다).
   ⚠️ 음성인식이 받아 적은 글자로 재는 것이라 «발음 점수» 가 아니다 — 화면 문구도 «낱말» 이라고만 말한다.
   🌐 한/영: data-ko/data-en 은 «글자만 담은 span» 에만 단다(CLAUDE.md — 버튼째 달면 내용이 갈아끼워진다).
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var NUM = { '0':'zero','1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine',
    '10':'ten','11':'eleven','12':'twelve','13':'thirteen','14':'fourteen','15':'fifteen','16':'sixteen',
    '17':'seventeen','18':'eighteen','19':'nineteen','20':'twenty' };
  var CJK = /[㐀-鿿豈-﫿]/;

  /** 낱말 목록 — 영어는 소문자·기호 제거(아포스트로피도 떼어 I'm=im), 숫자는 낱말로. 중국어는 글자 하나씩. */
  function tokens(s){
    s = String(s == null ? '' : s);
    if (CJK.test(s)) {
      var out = [];
      for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (CJK.test(c)) out.push(c); }
      return out;
    }
    return s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/).filter(Boolean).map(function(w){ return NUM[w] || w; });
  }

  /** 목표 낱말마다 «들었는가» 를 LCS 로 맞춘다. 들은 말이 비면 null. */
  function score(target, said){
    var a = tokens(target), b = tokens(said);
    if (!a.length || !b.length) return null;
    var n = a.length, m = b.length, i, j;
    var dp = [];
    for (i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var hit = new Array(n).fill(false);
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { hit[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    var hits = hit.filter(Boolean).length;
    var raw = String(target).trim().split(/\s+/);   // 화면에는 원래 낱말(대문자·기호)을 그린다
    var words = CJK.test(target) ? a.slice() : (raw.length === n ? raw : a.slice());
    return { total: n, hits: hits, ratio: hits / n, extra: m - hits,
             marks: words.map(function(w, k){ return { w: w, ok: hit[k] }; }) };
  }

  /** 등급 — 0.9 이상 완벽 · 0.6 이상 거의 · 그 아래 다시 */
  function grade(r){ return r >= 0.9 ? 'great' : r >= 0.6 ? 'close' : 'again'; }

  var STYLE_ID = 'rep-score-style';
  function ensureStyle(){
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style'); st.id = STYLE_ID;
    st.textContent =
      '.rep-card{align-self:flex-end;max-width:88%;margin:4px 0;padding:10px 12px;border-radius:14px;' +
      'background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.45);display:flex;flex-direction:column;gap:6px;font-size:14px;line-height:1.5}' +
      '.rep-card .rep-title{font-weight:800}' +
      '.rep-card .rep-words{display:flex;flex-wrap:wrap;gap:4px 6px}' +
      '.rep-card .rep-w{padding:1px 6px;border-radius:7px;font-weight:700}' +
      '.rep-card .rep-w.ok{background:rgba(34,197,94,.22)}' +
      '.rep-card .rep-w.miss{background:rgba(245,158,11,.22);text-decoration:underline dotted}' +
      '.rep-card .rep-note{font-size:12.5px;opacity:.85}' +
      '.rep-card .rep-btn{align-self:flex-start;font-family:inherit;cursor:pointer;border-radius:999px;padding:5px 12px;' +
      'border:1px solid rgba(16,185,129,.6);background:transparent;color:inherit;font-weight:700}';
    (document.head || document.documentElement).appendChild(st);
  }
  function isEn(){ try { return typeof window.getLang === 'function' && window.getLang() === 'en'; } catch(e){ return false; } }
  function label(el, ko, en){ el.setAttribute('data-ko', ko); el.setAttribute('data-en', en); el.textContent = isEn() ? en : ko; }

  /** 채점 카드를 만든다. 그릴 것이 없으면 null(호출자는 아무것도 안 붙인다). */
  function render(target, said, onRetry){
    var s = score(target, said);
    if (!s || s.hits === 0) return null;
    ensureStyle();
    var old = document.querySelectorAll('.rep-card');
    for (var i = 0; i < old.length; i++) old[i].remove();
    var g = grade(s.ratio);
    var card = document.createElement('div'); card.className = 'rep-card'; card.setAttribute('data-grade', g);
    var t = document.createElement('div'); t.className = 'rep-title';
    var head = g === 'great' ? ['🌟 완벽해요! ', '🌟 Perfect! '] : g === 'close' ? ['👍 거의 다 됐어요! ', '👍 Almost there! '] : ['🔁 한 번 더 해 볼까요? ', '🔁 Let\'s try once more! '];
    label(t, head[0] + s.hits + '/' + s.total + ' 낱말', head[1] + s.hits + '/' + s.total + ' words');
    card.appendChild(t);
    var ws = document.createElement('div'); ws.className = 'rep-words';
    s.marks.forEach(function(mk){
      var w = document.createElement('span'); w.className = 'rep-w ' + (mk.ok ? 'ok' : 'miss');
      w.textContent = mk.w; ws.appendChild(w);
    });
    card.appendChild(ws);
    if (s.hits < s.total) {
      var nt = document.createElement('div'); nt.className = 'rep-note';
      label(nt, '밑줄 낱말을 못 들었어요 — 천천히 또박또박 말해 보세요.', 'I didn\'t hear the underlined words — say them slowly and clearly.');
      card.appendChild(nt);
    }
    if (g !== 'great' && typeof onRetry === 'function') {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'rep-btn';
      var bl = document.createElement('span'); label(bl, '🎤 다시 따라 말하기', '🎤 Try again');
      b.appendChild(bl);
      b.onclick = function(){ try { onRetry(b); } catch(e){} };
      card.appendChild(b);
    }
    return card;
  }

  window.MangoRepeatScore = { tokens: tokens, score: score, grade: grade, render: render };
})();
