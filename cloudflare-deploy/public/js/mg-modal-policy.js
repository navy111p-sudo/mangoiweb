/* ═══════════════════════════════════════════════════════════════════════════
   mg-modal-policy.js — 팝업(모달) 닫힘 정책 한 곳 (2026-08-07, QA 2차 #4)

   지적: "'결제하기' 등 팝업에서 ✕ 가 아니라 바깥을 눌러도 그냥 닫힌다.
          결제 진행 중 실수로 바깥을 누르면 처음부터 다시 해야 한다."

   정책: 팝업은 ✕(닫기) 버튼으로만 닫는다. 배경(오버레이) 클릭으로는 닫지 않는다.

   ⚠️ 다만 «닫을 수단이 하나도 없는 팝업»까지 막으면 사용자가 갇힌다.
      그래서 이 파일은 무조건 막지 않고, **닫기 컨트롤이 실제로 있는지 확인한 뒤에만** 막는다.
      (오버레이 안에 ✕·닫기·Close·[aria-label=닫기]·.*close* 중 하나라도 보이면 = 닫을 수 있음)

   쓰는 법 — 기존 코드
       ov.addEventListener('click', e => { if (e.target === ov) close(); });
     를 이렇게 바꾼다
       ov.addEventListener('click', e => { if (e.target === ov && mgBackdropOK(ov)) close(); });

   ⚠️ 호출부는 반드시 아래 «폴백 있는» 형태로 쓸 것.
        function mgBackdropOK(el){ return window.mgBackdropClosable ? window.mgBackdropClosable(el) : true; }
      `window.mgBackdropClosable && window.mgBackdropClosable(el)` 로 쓰면, 이 파일이 로드되지
      않았을 때 조건이 항상 falsy 가 되어 «배경으로도 ✕ 로도 안 닫히는» 갇힘이 생길 수 있다.
      스크립트 하나 못 받았다고 사용자를 가두면 안 된다 — 못 받으면 예전 동작(배경 닫힘)이 맞다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // 닫기 버튼으로 인정하는 표시들. 라벨은 한/영 둘 다(강사 다수가 필리핀 — 영문 UI 사용).
  var CLOSE_TEXT = /^(?:\s*(?:✕|✖|×|X|x|❌|닫기|닫다|취소|Close|CLOSE|close|Cancel)\s*)$/;

  function looksLikeCloseControl(el) {
    if (!el) return false;
    try {
      // 화면에 실제로 보이는 것만 인정 (display:none 인 ✕ 는 닫을 수단이 아니다)
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
      var cls = String(el.className || '');
      if (/(^|[-_\s])close([-_\s]|$)/i.test(cls)) return true;
      var aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      if (CLOSE_TEXT.test(aria.trim())) return true;
      var oc = el.getAttribute('onclick') || '';
      if (/close|remove\(\)|display\s*=\s*['"]none/i.test(oc)) return true;
      var txt = (el.textContent || '').trim();
      if (txt.length <= 6 && CLOSE_TEXT.test(txt)) return true;
    } catch (_) {}
    return false;
  }

  /**
   * 이 오버레이는 «배경 클릭으로 닫아도 되는가?»
   *   false = 정책상 막는다(닫기 버튼이 따로 있으므로)
   *   true  = 닫을 수단이 없어 보이므로 예외적으로 허용(사용자를 가두지 않는다)
   */
  window.mgBackdropClosable = function (overlayEl) {
    try {
      if (!overlayEl || !overlayEl.querySelectorAll) return true;
      // 명시적 예외: data-mg-backdrop="close" 를 단 팝업은 기존대로 배경 클릭 허용
      if (overlayEl.getAttribute && overlayEl.getAttribute('data-mg-backdrop') === 'close') return true;
      var cands = overlayEl.querySelectorAll('button,a,[role="button"],[aria-label],[onclick]');
      for (var i = 0; i < cands.length; i++) {
        if (looksLikeCloseControl(cands[i])) return false;   // 닫기 버튼 있음 → 배경 클릭 차단
      }
      return true;                                            // 닫기 버튼 없음 → 갇히지 않게 허용
    } catch (_) { return true; }
  };

  /**
   * 여러 단계를 거치는 팝업(결제 등)에서 ESC 로 닫을 때 한 번 물어본다.
   * @returns {boolean} true = 닫아도 된다
   */
  window.mgConfirmDiscard = function (message) {
    var ko = true;
    try { ko = (window.getLang ? window.getLang() : (document.documentElement.lang || 'ko')) !== 'en'; } catch (_) {}
    return window.confirm(message || (ko
      ? '입력하신 내용이 사라집니다. 정말 닫으시겠습니까?'
      : 'Your entries will be lost. Close anyway?'));
  };
})();
