// ═══════════════════════════════════════════════════════════════════════
// adm-light-surfaces.js — 관리자 화면 '너무 진한' 패널 자동 완화 (2026-07-22 사장님 지시)
//
//   배경: 관리자 테마가 어두운색 → 밝은 슬레이트로 바뀌었지만, 카드 '속'의 패널들은
//   옛 다크 테마 시절의 인라인 색(#0f172a·#1e293b·#0c1a3a …)이 그대로 남아 있다.
//   소스에만 332곳이고, 그중 다수는 JS 가 렌더링 시점에 문자열로 만들어 붙이므로
//   CSS 선택자로는 전부 잡히지 않는다. → 실제 계산된 색을 읽어 밝게 바꾼다.
//
//   동작
//     1) 카드 본문 안에서 '어두운 배경'(상대휘도 < 0.16)을 찾아 같은 색상(hue)의
//        아주 밝은 색으로 교체. 테두리도 함께 연하게.
//     2) 그 결과 '밝은 배경 위 밝은 글자'가 된 곳만 골라 글자색을 진하게 되돌린다.
//        (파랑은 파랑, 빨강은 빨강 — hue 유지. 대비 4.5:1 이상 확보)
//     3) 색깔 버튼(파란 배경 + 흰 글자)처럼 배경이 여전히 어두운/진한 곳은 건드리지 않는다.
//
//   제외: 모달 배경막·웰컴 슬라이드·AI 비서 FAB·상단바·차트(canvas/svg) — 일부러 진한 것들
// ═══════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // 🔧 문제 생겼을 때 원인 분리용 — /admin.html?nolight=1 로 열면 이 보정을 끈다
  try { if (location.search.indexOf('nolight=1') >= 0) { console.log('[light-surfaces] 비활성(nolight=1)'); return; } } catch (e) {}

  var SKIP_SEL = [
    '#aw-overlay', '#aw-stage', '#aw-stage *',          // 웰컴 온보딩 슬라이드(자체 디자인)
    '#mi-ops-av-back', '#mi-ops-fab', '#mi-ops-fab-btn', '#mi-ops-fab-label',
    '#mi-ops-av-wrap', '#mi-ops-av-wrap *',
    '.top-header', '.top-header *',                     // 상단바(짙은 남색 그라데이션 = 디자인)
    '#ph85-sidebar', '#ph85-sidebar *',                 // 사이드바(별도 톤)
    '#mgWorldClock', '#mgWorldClock *',
    'canvas', 'svg', 'svg *', 'video', 'iframe'
  ].join(',');

  var DONE = 'data-lightened';
  var AA = 4.5;   // 목표 대비 (WCAG AA 본문 기준). 예전 4.0 은 '읽히긴 하나 흐린' 글자를 그냥 통과시켰다.

  // ── 색 유틸 ──────────────────────────────────────────────
  function parse(c) {
    if (!c) return null;
    var m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(function (v) { return parseFloat(v); });
    if (p.length < 3 || p.some(isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function toHsl(c) {
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0, s = 0, l = (mx + mn) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }
  function hsl(h, s, l) { return 'hsl(' + Math.round(h) + ',' + Math.round(s * 100) + '%,' + Math.round(l * 100) + '%)'; }

  // ── 1) 어두운 배경 → 밝게 ────────────────────────────────
  // 화면 전체를 덮는 position:fixed 요소 = 모달 뒤 어두운 막(스크림). 일부러 진한 것이므로 건드리지 않는다.
  //   (모달 '안'의 패널은 전체를 덮지 않으므로 지금까지처럼 계속 보정된다)
  function isScrim(el, cs) {
    if (cs.position !== 'fixed') return false;
    var r = el.getBoundingClientRect();
    return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
  }

  function lightenSurface(el) {
    var cs = getComputedStyle(el);
    var changed = false;
    if (isScrim(el, cs)) return false;

    var bg = parse(cs.backgroundColor);
    if (bg && bg.a > 0.35 && lum(bg) < 0.16) {
      var h = toHsl(bg);
      // 남색 계열은 아주 옅은 하늘빛, 회색 계열은 옅은 회색
      el.style.setProperty('background-color', hsl(h.h, Math.min(h.s, 0.42), 0.965), 'important');
      changed = true;
    }

    var bi = cs.backgroundImage;
    if (bi && bi !== 'none' && bi.indexOf('url(') < 0) {
      var cols = bi.match(/rgba?\([^)]+\)/g);
      if (cols && cols.length) {
        var ls = cols.map(function (s) { var p = parse(s); return p ? lum(p) : 1; });
        if (Math.max.apply(null, ls) < 0.16) {
          var out = bi.replace(/rgba?\([^)]+\)/g, function (s) {
            var p = parse(s); if (!p) return s;
            var hh = toHsl(p);
            return hsl(hh.h, Math.min(hh.s, 0.42), 0.965 - (lum(p) < 0.05 ? 0.02 : 0));
          });
          el.style.setProperty('background-image', out, 'important');
          changed = true;
        }
      }
    }

    if (changed) {
      var bc = parse(cs.borderTopColor);
      if (bc && bc.a > 0.2 && lum(bc) < 0.35) {
        var hb = toHsl(bc);
        el.style.setProperty('border-color', hsl(hb.h, Math.min(hb.s, 0.35), 0.86), 'important');
      }
      var sh = cs.boxShadow;
      if (sh && sh !== 'none' && /rgb/.test(sh)) el.style.setProperty('box-shadow', '0 1px 3px rgba(15,23,42,0.06)', 'important');
    }
    return changed;
  }

  // ── 눈에 실제로 보이는 배경색 = 반투명 레이어를 흰 바탕부터 차례로 합성 ──
  //   ⚠️ 반투명(rgba .15 등)을 불투명처럼 다루면 '연한 하늘색'을 '진한 파랑'으로 오판해
  //      정작 안 보이는 글자를 그냥 지나친다. 반드시 합성해서 판단할 것.
  function over(fg, bg) {
    var a = fg.a;
    return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
  }
  function effectiveBg(el) {
    var layers = [], n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && cs.backgroundImage.indexOf('url(') < 0) {
        var cols = cs.backgroundImage.match(/rgba?\([^)]+\)/g);
        if (cols && cols.length) { var p = parse(cols[0]); if (p && p.a > 0.02) layers.push(p); }
      }
      var c = parse(cs.backgroundColor);
      if (c && c.a > 0.02) { layers.push(c); if (c.a > 0.98) break; }
      n = n.parentElement;
    }
    var base = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }

  // ── 2) 밝은 배경 위 밝은 글자 → 진하게 ───────────────────
  function fixText(el) {
    if (!el.firstChild) return;
    var hasText = false;
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) { hasText = true; break; }
    }
    if (!hasText) return;

    if (el.hasAttribute('data-ls-text')) return;   // 한 번만 — 여러 번 겹치면 글자·배경이 같이 어두워진다

    var cs = getComputedStyle(el);
    var fg = parse(cs.color);
    if (!fg || fg.a < 0.3) return;
    var bg = effectiveBg(el);
    if (fg.a < 1) fg = over(fg, bg);
    if (contrast(fg, bg) >= AA) return;       // 이미 잘 보이면 그대로

    var bl = lum(bg), fl = lum(fg);
    if (bl >= 0.5) {
      // 밝은 배경 + 안 보이는 글자 → 색상(hue)은 유지한 채 대비 4.5 가 될 때까지 한 톤씩 진하게.
      //   ⚠️ 예전에는 고정 밝기(0.32)를 썼는데, 노랑·금색은 원래 밝은 색이라
      //      그 값으로도 대비가 4 를 못 넘고 색만 겨자색이 됐다(rgb(147,121,16)).
      //      그래서 ①금/노랑(38~75°)은 테마 앰버(#b45309≈30°) 쪽으로 당기고
      //           ②대비가 찰 때까지 반복해서 낮춘다.
      var h = toHsl(fg);
      var hue = h.h, sat = Math.min(Math.max(h.s, 0.15), 0.85);
      if (h.s > 0.2 && hue >= 38 && hue <= 75) { hue = 30; sat = Math.max(sat, 0.8); }
      var L = (h.s < 0.12) ? 0.30 : 0.36, pick = hsl(hue, sat, L);
      for (var t = 0; t < 12; t++) {
        pick = hsl(hue, sat, L);
        if (contrast(hslToRgb(hue, sat, L), bg) >= AA) break;
        L -= 0.03;
        if (L < 0.08) { pick = hsl(hue, sat, 0.08); break; }
      }
      el.style.setProperty('color', pick, 'important');
      claim(el);
    } else if (bl > 0.14) {
      // 중간 밝기 색버튼(주황·연두 등) → 글자는 흰색으로 통일하고, 대비 4:1 될 때까지 배경을 한 톤씩 진하게.
      //   (다른 '가독성' 스크립트가 흰 글자를 진한 회색으로 바꿔 놓은 버튼이 있어 색을 여기서 확정한다)
      var white = { r: 255, g: 255, b: 255, a: 1 };
      var hb = toHsl(bg), l = hb.l, cand = null;
      for (var i = 0; i < 10 && l > 0.10; i++) {
        l -= 0.04;
        cand = hsl(hb.h, Math.max(hb.s, 0.45), l);
        if (contrast(white, hslToRgb(hb.h, Math.max(hb.s, 0.45), l)) >= AA) break;
      }
      if (cand) {
        el.style.setProperty('background-color', cand, 'important');
        el.style.setProperty('background-image', 'none', 'important');
        el.style.setProperty('color', '#ffffff', 'important');
        claim(el);
      }
    }
  }

  // 다른 '가독성 페인터'(adm-s12=ph104, adm-s13=ivory)와 서로 덮어쓰지 않도록 소유권 표시.
  //   두 스크립트 모두 자기 플래그가 있으면 그 요소를 건너뛴다. 이걸 안 하면
  //   [내가 흰 글자로] ↔ [ph104 가 진한 회색으로] 를 번갈아 칠해 버튼 글자가 안 보인다.
  function claim(el) {
    el.setAttribute('data-ls-text', '1');
    try { el.__ph104 = true; el.__ivTx = true; el.__ivTxC = true; } catch (e) {}
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function hue(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return { r: hue(p, q, h + 1 / 3) * 255, g: hue(p, q, h) * 255, b: hue(p, q, h - 1 / 3) * 255, a: 1 };
  }

  // ── 실행 ────────────────────────────────────────────────
  //   2026-07-23 — 카드 '밖'(대시보드 최상단 알림 패널 등)에도 다크 시절 색이 남아 있어
  //   `.admin-layout` 전체로 넓혔다. 예외는 위 SKIP_SEL + 전체화면 스크림(isScrim)이 막는다.
  function scope() {
    var list = [];
    //   'body' = /admin/ 하위페이지용(.admin-layout 이 없다). SKIP_SEL + isScrim 이 예외를 막는다.
    ['.admin-layout', 'body', '.menu-body', '.table-card', '.admin-layout .card', '#main-content'].forEach(function (s) {
      try { Array.prototype.push.apply(list, document.querySelectorAll(s)); } catch (e) {}
    });
    return list;
  }

  //   ⚡ 성능: 1.3MB 화면이라 요소가 9,000개가 넘는다. 한 번 본 요소는 __lsDone 으로 건너뛰고,
  //      아직 안 펼쳐져 크기가 0 인 요소는 표시를 남기지 않아 나중(펼칠 때) 다시 처리되게 한다.
  //      문서 순서로 도는 덕에 부모(배경)가 먼저 정리된 뒤 자식(글자)을 판단하게 된다.
  function run() {
    var roots = scope();
    if (!roots.length) return;
    for (var k = 0; k < roots.length; k++) {
      var root = roots[k];
      if (root.closest && root.closest(SKIP_SEL)) continue;
      var els = root.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.__lsDone) continue;
        if (el.closest && el.closest(SKIP_SEL)) { el.__lsDone = true; continue; }
        var r = el.getBoundingClientRect();
        // 크기 0 = 아직 안 펼쳐진 카드 안 → 지금 손대지 않고 표시도 남기지 않는다
        if (r.width < 8 || r.height < 6) continue;
        lightenSurface(el);
        fixText(el);
        el.__lsDone = true;
        el.setAttribute(DONE, '1');
      }
    }
  }

  var timer = null, lastMs = 0;
  function schedule(delay) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      var t0 = (window.performance && performance.now) ? performance.now() : 0;
      try { run(); } catch (e) { console.warn('[light-surfaces]', e); }
      if (t0) { lastMs = Math.round(performance.now() - t0); window.__lsLastMs = lastMs; }
    }, delay || 200);
  }

  function start() {
    schedule(60);
    // 다른 페인터(ph104·ivory)의 settle 패스 뒤에 한 번 더 — 마지막에 칠하는 쪽이 이긴다.
    // (schedule 은 타이머가 하나뿐이라 덮어써지므로 별도 setTimeout 으로 건다)
    setTimeout(function () { try { run(); } catch (e) {} }, 1400);
    // 카드를 펼치거나(details toggle) JS 가 패널을 새로 그릴 때마다 다시 적용
    document.addEventListener('toggle', function (ev) {
      if (ev.target && ev.target.tagName === 'DETAILS' && ev.target.open) schedule(120);
    }, true);
    // 숨어 있던 영역(탭·아코디언)이 클릭으로 열리면 그때 처음 크기가 생긴다 → 한 번 더 훑기
    document.addEventListener('click', function () { schedule(320); }, true);
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(250); return; }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    document.addEventListener('mangoi:lang-changed', function () { schedule(300); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
