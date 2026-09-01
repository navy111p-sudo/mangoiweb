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
  /* 태그가 아니라 «클래스» 로 빼야 하는 것 — 색이 뜻을 지고 가는 요소. */
  var KEEP_SEL = '.tp-st-badge';
  var SKIP = { SCRIPT:1, STYLE:1, IFRAME:1, CANVAS:1, VIDEO:1, IMG:1, SVG:1, PATH:1, SELECT:1, OPTION:1, INPUT:1, TEXTAREA:1 };

  // ⚡ (2026-07-27 직원 피드백 "클릭하면 화면이 아주 느리다") 이 함수가 관리자 화면 버벅임의 최대 원인이었다.
  //   [실측] 사이드바 항목 한 번 클릭 → getComputedStyle 19,950회 중 17,585회가 여기(fixWithin)에서 나왔고,
  //          클릭 직후 메인스레드가 396ms 통째로 멈췄다(가만히 둘 때 4초당 366ms → 클릭 후 4초당 807ms).
  //   [원인 두 가지]
  //     ① 접힌 카드 안까지 다 훑었다. 요소 8,883개 중 6,147개(69%)가 접힌 <details> 안 = 화면에 보이지도 않는다.
  //     ② '검사했지만 손댈 필요 없음' 을 기억하지 않았다. __ph104 플래그는 **색을 바꾼 요소에만** 붙어서
  //        (전체 4,553개 중 346개), 나머지 4,200여 개는 실행할 때마다 영원히 getComputedStyle 을 다시 했다.
  //   [수정] ①펼쳐진 곳만 훑고(TreeWalker 가 접힌 details 본문을 통째로 건너뜀 — summary 는 보이므로 검사함)
  //          ②검사한 요소는 결과와 무관하게 세대(GEN) 도장을 찍어 재검사하지 않는다.
  //   ⚠️ 카드를 펼치면 그때 훑어야 하므로 아래 'toggle' 리스너가 반드시 함께 있어야 한다. 지우지 말 것.
  var GEN = 1;   // 테마가 바뀌면 색이 전부 달라지므로 세대를 올려 전체 재검사한다

  function eachVisibleEl(root, cb){
    var w;
    try {
      w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function(el){
          if (SKIP[el.tagName]) return NodeFilter.FILTER_REJECT;
          // 접힌 <details> 의 본문(summary 제외)은 화면에 없다 → 서브트리째 건너뛴다
          var p = el.parentElement;
          if (p && p.tagName === 'DETAILS' && !p.open && el.tagName !== 'SUMMARY') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    } catch(e){
      // TreeWalker 를 못 쓰는 환경 — 예전 방식(전체 훑기)으로 안전 폴백
      var els = root.querySelectorAll('*');
      for (var i=0;i<els.length;i++){ if (!SKIP[els[i].tagName]) cb(els[i]); }
      return;
    }
    var el; while ((el = w.nextNode())) cb(el);
  }

  function fixWithin(root){
    var n = 0;
    eachVisibleEl(root, function(el){
      if (el.__ph104) return;              // 이미 내가 칠한 요소
      if (el.__ph104s === GEN) return;     // 이미 검사해서 '손댈 필요 없음' 으로 판정한 요소
      /* 🟢⏸️🚪 (2026-09-01) 강사 상태 배지 — 색이 곧 «구분 정보» 다(초록/노랑/빨강).
         여기서 darken() 하면 세 상태의 글자가 같은 슬레이트로 수렴한다(실측 rgb(38,76,115)).
         배지는 자기 배경을 함께 들고 다녀 대비가 이미 확보돼 있다. */
      if (el.matches && el.matches(KEEP_SEL)) { el.__ph104s = GEN; return; }
      if (!hasOwnText(el)) { el.__ph104s = GEN; return; }
      var cs = getComputedStyle(el);
      var col = parseColor(cs.color);
      if (!col || bright(col.r, col.g, col.b) < 165) { el.__ph104s = GEN; return; } // 이미 충분히 진함
      var bg = effBg(el);
      if (!bg || bright(bg.r, bg.g, bg.b) < 200) { el.__ph104s = GEN; return; }     // 배경이 밝지 않으면(파란 헤더 등) 그대로 둠
      el.__ph104 = true;
      el.style.setProperty('color', darken(col), 'important');
      n++;
    });
    return n;
  }
  var _busy = false;

  // ⚡ 새로 그려진 곳만 훑기 — MutationObserver 가 알려준 '추가된 노드'를 모아 두고 그 서브트리만 검사한다.
  //   카드 하나가 렌더되면 노드 수십 개가 늘 뿐인데, 예전엔 그때마다 body 전체(8,883개)를 다시 훑었다.
  var _pending = [];            // 이번 회차에 검사할 루트들
  var _fullPass = true;         // true 면 body 전체(최초 1회·테마 전환·카드 펼침)
  var t = null;                 // 디바운스 타이머(아래 toggle·MutationObserver 공용)

  function ph104Run(){
    if (document.documentElement.getAttribute('data-admin-theme') !== 'ivory') { _pending.length = 0; return; }
    if (_busy) return;
    _busy = true;
    _bgCache = new Map();
    try {
      var roots;
      if (_fullPass) {
        // body 전체 스캔 — 카드 밖 JS 동적 버튼(펼치기/음성안내 등)도 커버.
        roots = [document.body];
      } else {
        // 추가된 노드만. 이미 문서에서 떨어져 나간 것·다른 루트에 포함된 것은 버린다.
        roots = [];
        for (var i = 0; i < _pending.length; i++) {
          var r = _pending[i];
          if (!r || r.nodeType !== 1 || !document.contains(r)) continue;
          var dup = false;
          for (var j = 0; j < roots.length; j++) { if (roots[j].contains(r)) { dup = true; break; } }
          if (!dup) roots.push(r);
        }
      }
      _pending.length = 0;
      _fullPass = false;
      var total = 0;
      for (var k = 0; k < roots.length; k++) {
        // 루트 자신도 검사 대상(TreeWalker 는 자손만 준다)
        var rt = roots[k];
        if (rt !== document.body && !SKIP[rt.tagName] && !rt.__ph104 && rt.__ph104s !== GEN) {
          if (hasOwnText(rt)) {
            var rcs = getComputedStyle(rt), rcol = parseColor(rcs.color);
            if (rcol && bright(rcol.r, rcol.g, rcol.b) >= 165) {
              var rbg = effBg(rt);
              if (rbg && bright(rbg.r, rbg.g, rbg.b) >= 200) {
                rt.__ph104 = true; rt.style.setProperty('color', darken(rcol), 'important'); total++;
              } else rt.__ph104s = GEN;
            } else rt.__ph104s = GEN;
          } else rt.__ph104s = GEN;
        }
        total += fixWithin(rt);
      }
      if (total) console.log('[ph104] ivory 가독성 보정: ' + total + '곳');
    } finally { _busy = false; }
  }

  // 전체 재검사 — 테마 전환처럼 '모든 색이 달라진' 경우에만. 세대를 올려 이전 판정을 무효화한다.
  function ph104Full(){ GEN++; _fullPass = true; ph104Run(); }
  window.__ph104Run = ph104Full;   /* 외부(테마 전환 등)에서 부르면 항상 전체 재검사 */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph104Run);
  else ph104Run();
  (window.__admSettleRun ? window.__admSettleRun(ph104Run) : setInterval(ph104Run, 2500));

  // 카드를 펼치면 그 안이 처음으로 화면에 나타난다 → 그 서브트리만 검사.
  //   (위 fixWithin 이 접힌 details 본문을 건너뛰므로 이 리스너가 없으면 펼친 카드가 영영 보정 안 된다)
  document.addEventListener('toggle', function(ev){
    var d = ev.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open) return;
    _pending.push(d);
    clearTimeout(t); t = setTimeout(ph104Run, 120);
  }, true);

  // 테마가 바뀌면 글자·배경색이 전부 달라진다 → 세대 올리고 전체 재검사
  try {
    new MutationObserver(function(){ ph104Full(); })
      .observe(document.documentElement, { attributes:true, attributeFilter:['data-admin-theme'] });
  } catch(e){}

  if (window.MutationObserver){
    new MutationObserver(function(muts){
      var got = false;
      for (var i=0;i<muts.length;i++){
        var an = muts[i].addedNodes;
        for (var j=0;j<an.length;j++){ if (an[j].nodeType === 1) { _pending.push(an[j]); got = true; } }
      }
      if (!got) return;
      if (_pending.length > 400) { _fullPass = true; _pending.length = 0; }  // 폭주 시엔 그냥 전체 1회
      clearTimeout(t); t = setTimeout(ph104Run, 300);
    }).observe(document.body, { childList:true, subtree:true });
  }
  console.log('[ph104] ivory light-text auto-fixer installed');
})();
