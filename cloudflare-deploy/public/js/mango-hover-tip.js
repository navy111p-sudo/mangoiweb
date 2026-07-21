/* 💬 mango-hover-tip.js (2026-07-21)
 * 마우스를 버튼에 갖다 대면 그 자리에서 바로 뜻을 보여주는 말풍선 툴팁 — 사장님 요청.
 * [왜] 브라우저 기본 title 툴팁은 1~2초 기다려야 하고 글씨가 작아 잘 안 보임.
 * [동작] title 있는 버튼/셀렉트에 hover 시 즉시(120ms) 진한 말풍선 표시.
 *        title 은 hover 동안만 비워 기본 툴팁과 중복 방지, 벗어나면 원복(다국어 스왑 안전).
 * [범위] 마우스 환경(hover:hover)에서만 동작 — 터치(휴대폰)는 기존 그대로.
 */
(function () {
  'use strict';
  if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) return;

  var tip = null, curEl = null, showTimer = 0;

  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'mango-hover-tip';
    tip.setAttribute('role', 'tooltip');
    tip.style.cssText =
      'position:fixed;z-index:2147483000;max-width:280px;padding:7px 11px;' +
      'background:rgba(15,23,42,.96);color:#f1f5f9;font-size:12.5px;font-weight:600;' +
      'line-height:1.45;border-radius:9px;border:1px solid rgba(148,163,184,.35);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45);pointer-events:none;opacity:0;' +
      'transition:opacity .12s;white-space:pre-line;word-break:keep-all;';
    document.body.appendChild(tip);
    return tip;
  }

  function place(el) {
    var r = el.getBoundingClientRect(), t = ensureTip();
    t.style.left = '0px'; t.style.top = '0px';           // 측정 전 리셋
    var w = t.offsetWidth, h = t.offsetHeight;
    var x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    var y = r.bottom + 8;                                 // 기본: 버튼 아래
    if (y + h > window.innerHeight - 8) y = r.top - h - 8; // 아래 공간 없으면 위
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }

  function show(el, text) {
    var t = ensureTip();
    t.textContent = text;
    place(el);
    t.style.opacity = '1';
  }

  function hide() {
    if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
    if (curEl) {
      // hover 동안 비워 둔 title 원복 (다른 코드가 갱신했으면 건드리지 않음)
      if (curEl.getAttribute('title') === '') curEl.setAttribute('title', curEl.__mtipSaved || '');
      curEl = null;
    }
    if (tip) tip.style.opacity = '0';
  }

  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[title]') : null;
    if (!el || el === curEl) return;
    var text = el.getAttribute('title');
    if (!text) return;
    hide();
    curEl = el;
    el.__mtipSaved = text;
    el.setAttribute('title', '');                        // 기본 툴팁 중복 방지
    showTimer = setTimeout(function () { if (curEl === el) show(el, text); }, 120);
  }, true);

  document.addEventListener('mouseout', function (e) {
    if (!curEl) return;
    var to = e.relatedTarget;
    if (to && (curEl === to || curEl.contains(to))) return;
    hide();
  }, true);

  ['scroll', 'click', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, hide, true);
  });
})();
