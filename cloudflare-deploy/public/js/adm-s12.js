// ═══════════════════════════════════════════════════════════════
// adm-s12.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  // ph104: 🎨 아이보리(밝은) 테마 가독성 자동 보정 — ph103 의 대칭.
  //  "글자색이 밝음 + 실제 배경(조상 배경·그라데이션 평균 합성)도 밝음" 인 요소만 글자를 진하게.
  //  색 계열은 유지(연파랑→진파랑, 연호박→진갈색)해서 의미색이 사라지지 않게 한다.
  //  배경이 어두운 요소(파란 헤더 위 흰 글자 등)는 건드리지 않으므로 다크 디자인 회귀 없음.
  //  JS 동적 생성 콘텐츠(평가서 폼 등)도 주기 스캔 + MutationObserver 로 커버.
  function bright(r,g,b){ return (r*299 + g*587 + b*114) / 1000; } // 체감 밝기 0~255
  function parseColor(s){
    var m = s && s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r:+m[1], g:+m[2], b:+m[3], a: m[4] === undefined ? 1 : parseFloat(m[4]) };
  }
  function gradAvg(bi){ // 그라데이션 문자열의 색 스톱 평균 (url() 이미지는 null → 판단 불가로 skip)
    if (bi.indexOf('url(') !== -1) return null;
    var ms = bi.match(/rgba?\([^)]*\)/g);
    if (!ms) return null;
    var r=0,g=0,b=0,n=0;
    for (var i=0;i<ms.length;i++){ var p=parseColor(ms[i]); if(p && p.a>0.2){ r+=p.r; g+=p.g; b+=p.b; n++; } }
    return n ? { r:r/n, g:g/n, b:b/n } : null;
  }
  var _bgCache = null; // 런 단위 노드별 배경 캐시 — O(N·depth) → O(N)
  function effBg(node){ // 조상으로 올라가며 실제로 보이는 배경색 추정
    if (!node || node === document.documentElement) return { r:255, g:250, b:240 }; // 페이지(ivory) 바탕
    var hit = _bgCache.get(node);
    if (hit !== undefined) return hit;
    var res;
    var cs = getComputedStyle(node);
    var bi = cs.backgroundImage;
    if (bi && bi !== 'none') res = gradAvg(bi); // 이미지면 null(불명) → 건드리지 않음
    else {
      var c = parseColor(cs.backgroundColor);
      res = (c && c.a >= 0.5) ? c : effBg(node.parentElement);
    }
    _bgCache.set(node, res);
    return res;
  }
  function darken(c){ // 색상(hue)·채도 유지, 명도만 어둡게
    var r=c.r/255, g=c.g/255, b=c.b/255;
    var mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, h=0, s=0, d=mx-mn;
    if (d){
      s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
      h = mx===r ? ((g-b)/d + (g<b?6:0)) : mx===g ? ((b-r)/d + 2) : ((r-g)/d + 4);
      h /= 6;
    }
    if (s < 0.15) return 'rgb(31,41,55)'; // 회색 계열 → slate-800
    l = 0.30; s = Math.min(1, s + 0.1);
    function f(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
    var q = l < 0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q;
    return 'rgb(' + Math.round(f(p,q,h+1/3)*255) + ',' + Math.round(f(p,q,h)*255) + ',' + Math.round(f(p,q,h-1/3)*255) + ')';
  }
  function hasOwnText(el){
    for (var n=el.firstChild; n; n=n.nextSibling){ if (n.nodeType===3 && n.nodeValue.trim()) return true; }
    return false;
  }
  var SKIP = { SCRIPT:1, STYLE:1, IFRAME:1, CANVAS:1, VIDEO:1, IMG:1, SVG:1, PATH:1, SELECT:1, OPTION:1, INPUT:1, TEXTAREA:1 };
  function fixWithin(root){
    var els = root.querySelectorAll('*'), n = 0;
    for (var i=0;i<els.length;i++){
      var el = els[i];
      if (el.__ph104 || SKIP[el.tagName]) continue;
      if (!hasOwnText(el)) continue;
      var cs = getComputedStyle(el);
      var col = parseColor(cs.color);
      if (!col || bright(col.r, col.g, col.b) < 165) continue; // 이미 충분히 진함
      var bg = effBg(el);
      if (!bg || bright(bg.r, bg.g, bg.b) < 200) continue;     // 배경이 밝지 않으면(파란 헤더 등) 그대로 둠
      el.__ph104 = true;
      el.style.setProperty('color', darken(col), 'important');
      n++;
    }
    return n;
  }
  var _busy = false;
  function ph104Run(){
    if (document.documentElement.getAttribute('data-admin-theme') !== 'ivory') return;
    if (_busy) return;
    _busy = true;
    _bgCache = new Map();
    try {
      // body 전체 스캔 — 카드 밖 JS 동적 버튼(펼치기/음성안내 등)도 커버. __ph104 플래그로 재작업 없음.
      var total = fixWithin(document.body);
      if (total) console.log('[ph104] ivory 가독성 보정: ' + total + '곳');
    } finally { _busy = false; }
  }
  window.__ph104Run = ph104Run;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph104Run);
  else ph104Run();
  (window.__admSettleRun ? window.__admSettleRun(ph104Run) : setInterval(ph104Run, 2500));
  if (window.MutationObserver){
    var t = null;
    new MutationObserver(function(){ clearTimeout(t); t = setTimeout(ph104Run, 300); })
      .observe(document.body, { childList:true, subtree:true });
  }
  console.log('[ph104] ivory light-text auto-fixer installed');
})();
