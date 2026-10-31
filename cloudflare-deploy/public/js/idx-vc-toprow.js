/* idx-vc-toprow.js — 세로 수업화면 «맨 윗줄» 을 한 줄로 합친다 (2026-08-20)
 * ─────────────────────────────────────────────────────────────────────────────
 * [사장님 지시] 「휴대폰 세로에서 위의 표시들이 일자로 맨 위에 나오게 해 줘. 너무 분산되어 산만해」
 *
 * [무엇이 문제였나] 맨 위에 있는 것들이 «서로 다른 세 곳» 에 각자 떠 있었다 —
 *   ・방이름·시계·녹화점  = #mg-unibar (가운데 고정, 높이 26)
 *   ・포인트 바구니       = #vc-basket-float (왼쪽 고정, 높이 32)
 *   ・라이트 / 번개       = .toolbar-right 안 (높이 30·36)
 *   좌표도 높이도 제각각이라 «한 줄» 로 안 보이고, 화면 폭이 바뀌면 또 어긋난다.
 *
 * [어떻게 고쳤나] 좌표를 맞추는 대신 **한 상자에 넣는다.**
 *   통합바 안에 좌/우 칸을 만들고 그 셋을 «자식» 으로 옮긴다. 그러면 flex 가 자리를
 *   잡아 주므로 px 계산이 사라지고, 어떤 폭에서도 한 줄이 유지된다.
 *   ⛔ px 오프셋으로 «맞춰» 두지 말 것 — 그게 지금까지 어긋나 온 방식이다.
 *
 * [원래 자리로 되돌리기] 가로로 돌리거나 수업에서 나가면 **원래 부모에게 돌려준다.**
 *   PC·가로 화면은 지금까지와 똑같이 동작해야 한다.
 *
 * ⚠️ 첫 화면 무게 예산(여유 0) 때문에 반드시 defer 다. blocking 파일로 옮기면 하니스가 FAIL 낸다.
 * ⚠️ 스타일은 document.body 끝에 붙인다 — head 에 붙이면 index.html 의 body <style> 들에게
 *    같은 특정성에서 진다(CLAUDE.md 2장 「JS 로 스타일을 얹었는데 짐」).
 */
(function () {
  'use strict';

  var MQ = null;
  try { MQ = window.matchMedia('(max-width:920px) and (orientation:portrait)'); } catch (e) {}

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.id = 'vc-toprow-style';
    /* ⚠️ 선택자를 «body.vc-in-call.mg-uni-on.mg-uni-one» 로 쓴다 —
       index.html 에 있는 «body.vc-in-call.mg-uni-on #…»(특정성 1,2,1) 규칙들이
       !important 로 높이·폭을 못 박아 두었기 때문에, 그보다 한 단계 높아야 이긴다.
       실제로 밟았다: 통합바 폭이 계속 285px 에 머물고 라이트 높이가 24px 로 안 줄었다. */
    var K = 'body.vc-in-call.mg-uni-on.mg-uni-one ';
    s.textContent = [
      /* 한 줄 모드: 통합바를 좌우로 펴고, 안에 [바구니] [방정보] [라이트·번개] 를 담는다 */
      K + '#mg-unibar{left:8px !important;right:8px !important;transform:none !important;',
      '  max-width:none !important;width:auto !important;gap:6px !important;padding:5px 8px !important;}',
      K + '#mg-unibar .uni-slot-l,' + K + '#mg-unibar .uni-slot-r{display:flex;align-items:center;gap:5px;flex:0 0 auto;}',
      K + '#mg-unibar .uni-info{flex:1 1 auto;justify-content:center;min-width:0;}',
      /* 담긴 것들은 «떠 있는 것» 을 그만두고 줄의 일부가 된다. 높이 24px 로 통일 = 일자. */
      K + '#vc-basket-float{position:static !important;top:auto !important;left:auto !important;',
      '  height:24px !important;padding:0 9px 0 6px !important;font-size:12.5px !important;',
      '  box-shadow:none !important;border-radius:999px !important;}',
      K + '#vc-basket-float .vpb-icon{font-size:14px !important;}',
      K + '#mango-theme-toggle{position:static !important;top:auto !important;right:auto !important;',
      '  height:24px !important;width:auto !important;min-width:0 !important;padding:0 7px !important;',
      '  font-size:11px !important;border-radius:999px !important;}',
      K + '#vc-btn-lite{height:24px !important;width:26px !important;min-width:0 !important;',
      '  padding:0 !important;font-size:12px !important;border-radius:999px !important;}',
      /* 🔴 상단바 자리를 «비워 둔다» — 라이트·번개가 통합바 안으로 옮겨 가면 .toolbar 가
         내용이 없어 15px 로 쪼그라들고, 그러면 본문(영상)이 위로 올라와 통합바가 다시
         «영상 위» 에 얹힌다. 실측으로 밟았다(본문 시작 51px → 15px). 높이를 못 박아 막는다. */
      K + '.toolbar{min-height:56px !important;}',
      /* 아주 좁은 폰: 방 이름이 먼저 줄고(ellipsis 가 이미 있다) 칩은 유지된다 */
      '@media (max-width:360px){' + K + '#mg-unibar{gap:4px !important;padding:5px 6px !important;}',
      '  ' + K + '#vc-basket-float{padding:0 7px 0 5px !important;}}'
    ].join('\n');
    document.body.appendChild(s);   // ⚠️ head 가 아니라 body — 위 주석 참고
  }

  // 원래 부모/자리를 기억해 둔다(되돌릴 때 정확히 그 자리로).
  function remember(el) {
    if (!el || el.__toprowHome) return;
    el.__toprowHome = el.parentNode;
    el.__toprowNext = el.nextSibling;
  }
  function restore(el) {
    if (!el || !el.__toprowHome) return;
    try {
      if (el.__toprowNext && el.__toprowNext.parentNode === el.__toprowHome) {
        el.__toprowHome.insertBefore(el, el.__toprowNext);
      } else {
        el.__toprowHome.appendChild(el);
      }
    } catch (e) {}
    el.__toprowHome = null; el.__toprowNext = null;
  }

  function slots(bar) {
    var L = bar.querySelector('.uni-slot-l');
    var R = bar.querySelector('.uni-slot-r');
    if (!L) { L = document.createElement('span'); L.className = 'uni-slot-l'; bar.insertBefore(L, bar.firstChild); }
    if (!R) { R = document.createElement('span'); R.className = 'uni-slot-r'; bar.appendChild(R); }
    return [L, R];
  }

  function pick() {
    return {
      basket: document.getElementById('vc-basket-float'),
      theme:  document.getElementById('mango-theme-toggle'),
      lite:   document.getElementById('vc-btn-lite')
    };
  }

  function apply() {
    var bar = document.getElementById('mg-unibar');
    var on = !!(bar && MQ && MQ.matches &&
                document.body.classList.contains('vc-in-call') &&
                bar.classList.contains('show'));
    var p = pick();

    if (!on) {
      if (document.body.classList.contains('mg-uni-one')) {
        document.body.classList.remove('mg-uni-one');
        restore(p.basket); restore(p.theme); restore(p.lite);
      }
      return;
    }

    injectStyle();
    var sl = slots(bar), L = sl[0], R = sl[1];
    /* 순서를 못 박는다: 왼쪽 = 바구니 / 오른쪽 = 라이트 → 번개.
       ⚠️ 이미 그 칸에 들어 있으면 다시 옮기지 않는다 — 매번 appendChild 하면
          그때마다 노드가 문서에서 빠졌다 들어가 깜빡이고, 버튼 눌린 상태도 끊긴다. */
    if (p.basket && p.basket.parentNode !== L) { remember(p.basket); L.appendChild(p.basket); }
    if (p.theme  && p.theme.parentNode  !== R) { remember(p.theme);  R.appendChild(p.theme); }
    if (p.lite   && p.lite.parentNode   !== R) { remember(p.lite);   R.appendChild(p.lite); }
    document.body.classList.add('mg-uni-one');
  }

  function boot() {
    /* 통합바는 수업에 들어간 뒤에 만들어지고, 라이트 버튼도 mango-theme.js 가 나중에 만든다.
       ⛔ body class 를 지켜보는 MutationObserver 는 쓰지 않는다 — 이 저장소에는 body class 를
          자주 다시 쓰는 코드가 있어 콜백이 쉴 새 없이 돌았다(실제로 밟아 브라우저가 멎었다).
       ✅ 대신 «수업 화면으로 전환하는 순간»(showView)에 짧게 확인하고, 화면 회전에도 반응한다. */
    var t = null;
    function watch() {
      if (t) return;
      var n = 0;
      t = setInterval(function () { n++; apply(); if (n > 30) { clearInterval(t); t = null; } }, 1000);
    }
    try {
      var orig = window.showView;
      if (typeof orig === 'function' && !orig.__toprowWrapped) {
        window.showView = function (id) {
          var r = orig.apply(this, arguments);
          if (id === 'view-videocall-call') watch();
          setTimeout(apply, 200);
          return r;
        };
        window.showView.__toprowWrapped = true;
      }
    } catch (e) {}
    try {
      if (MQ && MQ.addEventListener) MQ.addEventListener('change', function () { setTimeout(apply, 250); });
      else if (MQ && MQ.addListener) MQ.addListener(function () { setTimeout(apply, 250); });
    } catch (e) {}
    window.addEventListener('orientationchange', function () { setTimeout(apply, 400); });
    if (document.body.classList.contains('vc-in-call')) watch();
    apply();
    window.vcTopRowApply = apply;   // 진단용
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
