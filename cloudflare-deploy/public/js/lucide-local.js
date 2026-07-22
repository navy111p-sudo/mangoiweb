/* ════════════════════════════════════════════════════════════════════
      망고아이 — lucide 아이콘 로컬 대체 (ph161, 2026-07-23)
   
      원래: <script src="https://unpkg.com/lucide@latest"></script>
      문제 두 가지 —
        1) 실제로 쓰는 아이콘이 6종인데 1,500종짜리 라이브러리를 통째로 받았다.
        2) 버전이 @latest 로 고정돼 있지 않았다. 상류에서 breaking change 가
           나오면 teacher-training.html 이 예고 없이 깨진다. 성능보다 이쪽이 더 위험했다.
   
      지금: 쓰는 6종의 path 만 담았다. 외부 요청 0건, 버전 고정 불필요.
      기존 마크업(<i data-lucide="...">)과 lucide.createIcons() 호출을 그대로 쓴다.
   
      아이콘 추가하려면 ICONS 에 한 줄 넣으면 된다. 출처는 lucide-static v1.25.0 (ISC).
      ⚠️ 이 파일을 고치면 이 파일을 읽는 HTML 의 ?v= 를 올릴 것.
   ════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  var ICONS = {
    "download": "<path d=\"M12 15V3\" /><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><path d=\"m7 10 5 5 5-5\" />",
    "edit-3": "<path d=\"M13 21h8\" /><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" />",
    "file-text": "<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\" /><path d=\"M14 2v5a1 1 0 0 0 1 1h5\" /><path d=\"M10 9H8\" /><path d=\"M16 13H8\" /><path d=\"M16 17H8\" />",
    "layout-grid": "<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\" /><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\" /><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\" /><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\" />",
    "printer": "<path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\" /><path d=\"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6\" /><rect x=\"6\" y=\"14\" width=\"12\" height=\"8\" rx=\"1\" />",
    "sheet": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /><line x1=\"3\" x2=\"21\" y1=\"9\" y2=\"9\" /><line x1=\"3\" x2=\"21\" y1=\"15\" y2=\"15\" /><line x1=\"9\" x2=\"9\" y1=\"9\" y2=\"21\" /><line x1=\"15\" x2=\"15\" y1=\"9\" y2=\"21\" />"
  };

  var ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
              'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  function createIcons() {
    var nodes = document.querySelectorAll("[data-lucide]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], name = el.getAttribute("data-lucide");
      var body = ICONS[name];
      if (!body) { console.warn("[lucide-local] 없는 아이콘:", name); continue; }
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.innerHTML = body;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", (el.getAttribute("class") || "") + " lucide lucide-" + name);
      el.parentNode.replaceChild(svg, el);
    }
  }

  global.lucide = global.lucide || {};
  global.lucide.createIcons = createIcons;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", createIcons);
  else createIcons();
})(window);
