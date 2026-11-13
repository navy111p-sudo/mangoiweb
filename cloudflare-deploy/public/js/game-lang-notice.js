/* 🌐 게임 언어(영어/중국어) 전환을 «눈에 보이게» (2026-11-10 사장님 「중국어를 눌러도 바뀌지 않아」)
 *
 *   전환 자체(setGameLang)는 원래 동작했습니다 — 출제 어휘·TTS·게임 iframe 의 glang 이 바뀝니다.
 *   그런데 화면에서 달라지는 것이 버튼 색과 제목 이모지(🎮→🀄)뿐이라 «안 바뀐다» 로 읽혔습니다.
 *   ⟹ ① 전환할 때 안내 토스트 ② 중국어 모드에서 «영어 전용» 게임 카드에 표시.
 *   ⚠️ student-games.html 은 첫 화면 예산이 꽉 차 있어 defer 로 따로 두고 원래 함수를 밖에서 감쌉니다
 *      (이름 setGameLang·hubRenderMenu 가 바뀌면 조용히 헛돕니다).
 *   ⚠️ EN_ONLY 는 glang 을 읽지 않는 게임입니다 — 그 게임이 중국어를 지원하게 되면 여기서 빼세요. */
(function(){
  'use strict';
  var W = window;
  if (typeof W.setGameLang !== 'function' || typeof W.hubRenderMenu !== 'function') return;

  var EN_ONLY = { escape:1, escapezombie:1, escapeschool:1, scenequest:1 };

  function lang(){ try { return GAME_LANG === 'zh' ? 'zh' : 'en'; } catch (e) { return 'en'; } }
  function siteEn(){ try { return String(document.documentElement.getAttribute('lang') || 'ko').indexOf('en') === 0; } catch (e) { return false; } }

  function markCards(){
    var zh = lang() === 'zh';
    var grid = document.getElementById('game-grid'); if (!grid) return;
    [].forEach.call(grid.querySelectorAll('.game-card'), function(c){
      var old = c.querySelector('.lang-only'); if (old) old.remove();
      if (!zh || !EN_ONLY[c.getAttribute('data-mode')]) return;
      var body = c.querySelector('.body'); if (!body) return;
      var n = document.createElement('span');
      n.className = 'lang-only';
      n.setAttribute('data-ko', '🇬🇧 영어로만 플레이돼요 (중국어 준비중)');
      n.setAttribute('data-en', '🇬🇧 English only (Chinese coming soon)');
      n.textContent = siteEn() ? n.getAttribute('data-en') : n.getAttribute('data-ko');
      n.style.cssText = 'display:block;margin-top:6px;font-size:13px;font-weight:700;color:#b45309';
      body.appendChild(n);
    });
  }

  var toastTimer = 0;
  function toast(l){
    var t = document.getElementById('game-lang-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'game-lang-toast';
      t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:99999;max-width:calc(100% - 32px);' +
        'padding:12px 22px;border-radius:14px;background:#1e293b;color:#fff;font-size:16px;font-weight:800;' +
        'box-shadow:0 10px 30px -8px rgba(0,0,0,.5);text-align:center;transition:opacity .25s';
      document.body.appendChild(t);
    }
    var en = siteEn();
    t.textContent = l === 'zh'
      ? (en ? '🇨🇳 Switched to Chinese — games now use Chinese words & sentences' : '🇨🇳 중국어 모드로 바뀌었어요 — 게임이 중국어 단어·문장으로 나와요')
      : (en ? '🇬🇧 Switched to English' : '🇬🇧 영어 모드로 바뀌었어요');
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.style.opacity = '0'; }, 2600);
  }

  var oRender = W.hubRenderMenu;
  W.hubRenderMenu = function(){ var r = oRender.apply(this, arguments); try { markCards(); } catch (e) {} return r; };

  var oSet = W.setGameLang;
  W.setGameLang = function(l){
    var before = lang();
    var r = oSet.apply(this, arguments);
    try { var after = lang(); if (after !== before) toast(after); markCards(); } catch (e) {}
    return r;
  };

  try { markCards(); } catch (e) {}
})();
