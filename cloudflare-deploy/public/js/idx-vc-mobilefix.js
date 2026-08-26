/* idx-vc-mobilefix.js — 휴대폰 수업 화면 수리 묶음 (2026-08-25)
 *
 * 왜 별도 파일인가
 *   index.html 의 첫 화면 blocking 예산은 실측 여유가 **104바이트**다
 *   (1,599,895B / 상한 1,599,999B — first_paint_budget_harness).
 *   그래서 새 코드는 idx-main.js 에 한 줄도 못 넣는다. defer 로 내려서
 *   첫 그림에는 0바이트를 더하고, 수업이 시작된 뒤에만 일한다.
 *
 * 무엇을 고치나 (2026-08-25 사장님·강선생님 제보)
 *   ① 교재를 화면 배율(devicePixelRatio)만큼 촘촘히 그린다 — 「글자가 깨져서 안 보인다」
 *      사장님 확인: 「원본은 흐리지 않았다」 → 범인은 «화면에서 줄이는 단계» 로 확정.
 *   ② 사진 교재를 여러 번에 나눠 줄인다 — 브라우저 기본 축소는 8배 이상에서 획을 지운다.
 *   ③ 핀치로 확대한 배율이 손을 떼는 순간 100% 로 되돌아가던 것을 막는다.
 *   ④ 폰에 확대·축소 버튼이 하나도 없던 것 — 교재 위에 띄운다.
 *   ⑤ 「배경화면」 탭을 두 번 누르면 본문이 통째로 접히던 것 — 교재·칠판과 같게.
 *   ⑥ 막아 세우는 안내에 중국어를 함께 적는다(화면 언어는 KO/EN 뿐이라 강사가 못 읽었다).
 *   ⑦ 얼굴 꾸미기(가면) 파일을 우리 서버(/vendor/mediapipe-face/)에서 쓴다 —
 *      지금까지 구글·jsdelivr 에서 받아 와 중국에서 통째로 막혀 있었다.
 *
 * ⚠️ idx-main.js 의 전역을 «덮어쓰는» 방식이다. 그쪽 함수 이름이 바뀌면 여기도 같이 고칠 것.
 *    원본이 없으면 조용히 건너뛴다(아래 typeof 검사) — 이 파일 때문에 수업이 멈추지는 않는다.
 * ⚠️ 내용을 바꾸면 index.html 태그의 ?v= 를 반드시 올린다(asset_version_harness 가 막는다).
 */
(function () {
  'use strict';

  /* 브라우저가 중국어인가 — 화면 언어 설정(KO/EN)과 별개로 판단한다.
     설정은 두 가지뿐이고 기본이 한국어라, 「중국어를 고르면 보여준다」로는 영영 안 보인다.
     그래서 «한 줄 덧붙이기» 로만 쓴다 — 기존 한국어·영어 문구는 그대로 둔다. */
  function isZh() {
    try { return (String(navigator.language || '') + String((navigator.languages || [])[0] || ''))
      .toLowerCase().indexOf('zh') >= 0; } catch (e) { return false; }
  }
  function zhLine(msg, zh) { return isZh() ? (msg + '\n' + zh) : msg; }
  function toast(msg) {
    try { if (typeof window.mangoToast === 'function') return window.mangoToast(msg); } catch (e) {}
    try { if (typeof window._pdfToast === 'function') return window._pdfToast(msg); } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════════
     ① 교재를 화면 배율만큼 촘촘히 그린다
     ──────────────────────────────────────────────────────────────
     캔버스는 «몇 개의 점으로 그릴지» 를 따로 정해 줘야 한다. 안 정하면 CSS 픽셀을
     그대로 쓴다. 요즘 폰은 CSS 1칸을 실제 점 3개로 표시하므로, 화면이 쓸 수 있는
     점의 1/3 만 그려 놓고 3배로 늘려 보여주던 셈이다 — 획이 가는 한글이 여기서 사라진다.
     ⚠️ 3배(점 9배)는 구형 폰이 버겁다. 2배로 상한을 둔다 — 실측상 읽히는 데는 충분하다.
     ⚠️ 이 값은 idx-main.js 의 _pdfRenderInner 가 scale 에 곱한다(그쪽 한 줄이 짝).
        여기서만 바꾸면 캔버스만 커지고 그림은 왼쪽 위에 작게 남는다.
  ══════════════════════════════════════════════════════════════ */
  function calcDPR() {
    var r = window.devicePixelRatio || 1;
    if (!isFinite(r) || r < 1) r = 1;
    return Math.min(r, 2);
  }
  window._pdfDPR = calcDPR();

  function smooth(cx) {
    try {
      cx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in cx) cx.imageSmoothingQuality = 'high';
    } catch (e) {}
    return cx;
  }

  /* 캔버스의 «점 개수» 는 배율만큼 늘리고, «보이는 크기» 는 원래대로 고정한다.
     ⚠️ style 을 반드시 함께 적어야 한다 — 안 적으면 캔버스가 배율만큼 커져 교재가 화면을 넘는다.
     ℹ️ 필기 겹칩 캔버스(pdf-anno)는 idx-main.js 의 pdfSyncAnnoCanvas 가
        pdfCanvas.style.width 를 그대로 베껴 가므로 여기만 정하면 같이 맞는다. */
  window._pdfFitCanvas = function (canvas, w, h) {
    var W = Math.max(1, Math.floor(w)), H = Math.max(1, Math.floor(h));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    else { try { canvas.getContext('2d').clearRect(0, 0, W, H); } catch (e) {} }
    var R = window._pdfDPR || 1;
    canvas.style.width = (W / R) + 'px';
    canvas.style.height = (H / R) + 'px';
    try { smooth(canvas.getContext('2d')); } catch (e) {}
  };

  /* 펜 굵기·글자 크기는 «캔버스 점» 단위다. 점을 2배로 늘렸으니 그대로 두면
     필기가 절반 굵기로 가늘어진다. 그리는 순간에 배율만큼 키운다.
     ℹ️ 좌표는 0~1 로 정규화돼 있고 입력도 getBoundingClientRect 기준이라 손댈 것이 없다. */
  var _drawStroke = window.pdfDrawStroke;
  if (typeof _drawStroke === 'function') {
    window.pdfDrawStroke = function (ctx, w, h, s) {
      var R = window._pdfDPR || 1;
      if (R !== 1 && s && (s.size || s.fontSize)) {
        var t = {}; for (var k in s) t[k] = s[k];
        if (t.size) t.size = t.size * R;
        if (t.fontSize) t.fontSize = t.fontSize * R;
        s = t;
      }
      return _drawStroke(ctx, w, h, s);
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ② 사진 교재를 «여러 번에 나눠» 줄인다
     ──────────────────────────────────────────────────────────────
     drawImage 로 3000px 사진을 380px 에 한 번에 그리면, 브라우저는 8칸에 한 점씩
     골라 쓴다 — 획이 규칙적으로 사라져 «깨진» 것처럼 보인다(모아레).
     절반씩 줄여 내려가면 매 단계가 2배 축소라 획이 뭉개지지 않고 남는다.
  ══════════════════════════════════════════════════════════════ */
  function drawDownscaled(ctx, img, sw, sh, dw, dh) {
    smooth(ctx);
    if (!(sw > dw * 2) || dw < 1 || dh < 1) { ctx.drawImage(img, 0, 0, dw, dh); return; }
    var src = img, cw = sw, ch = sh, guard = 0;
    while (cw > dw * 2 && guard++ < 8) {
      var nw = Math.max(Math.round(dw), Math.round(cw / 2));
      var nh = Math.max(Math.round(dh), Math.round(ch / 2));
      var c = document.createElement('canvas');
      c.width = nw; c.height = nh;
      smooth(c.getContext('2d')).drawImage(src, 0, 0, cw, ch, 0, 0, nw, nh);
      src = c; cw = nw; ch = nh;
    }
    ctx.drawImage(src, 0, 0, cw, ch, 0, 0, dw, dh);
  }

  if (typeof window.pdfBuildImageDoc === 'function') {
    window.pdfBuildImageDoc = function (url) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
          resolve({
            numPages: 1,
            _isImage: true,
            getPage: function () {
              return Promise.resolve({
                getViewport: function (o) { return { width: W * o.scale, height: H * o.scale }; },
                render: function (o) {
                  return { promise: new Promise(function (res) {
                    try { drawDownscaled(o.canvasContext, img, W, H, o.viewport.width, o.viewport.height); }
                    catch (e) { try { o.canvasContext.drawImage(img, 0, 0, o.viewport.width, o.viewport.height); } catch (e2) {} }
                    res();
                  }) };
                }
              });
            }
          });
        };
        img.onerror = function () { reject(new Error('이미지 로드 실패: ' + url)); };
        img.src = url;
      });
    };
  }

  /* 화면을 돌리거나 창을 옮기면 배율이 바뀔 수 있다(외부 모니터 등) → 다시 그린다 */
  var _dprT = null;
  function onDprMaybeChanged() {
    var n = calcDPR();
    if (n === window._pdfDPR) return;
    window._pdfDPR = n;
    clearTimeout(_dprT);
    _dprT = setTimeout(function () { try { window.pdfRender && window.pdfRender(); } catch (e) {} }, 150);
  }
  window.addEventListener('resize', onDprMaybeChanged);
  window.addEventListener('orientationchange', function () { setTimeout(onDprMaybeChanged, 400); });

  /* ══════════════════════════════════════════════════════════════
     ③ 핀치 확대가 손을 떼는 순간 100% 로 되돌아가던 것
     ──────────────────────────────────────────────────────────────
     교재 영역에는 «핀치 확대» 와 «더블탭 → 100% 되돌리기» 가 각각 따로 붙어 있다.
     더블탭 판정은 「손가락 하나가 떨어진 일이 300ms 안에 두 번」만 본다.
     그런데 핀치를 놓으면 손가락이 둘 떨어지므로 그 둘이 «더블탭» 으로 세인다
     → 벌리는 동안엔 커졌다가 떼는 순간 원래대로 튕겨 돌아간다.
     ⚠️ 두 손가락이 «정확히 같은 순간» 떨어지면 신호가 하나로 묶여(changedTouches 2)
        빠져나가므로 «가끔은 되는» 것처럼 보였다. 재현이 들쭉날쭉했던 이유다.
     ✅ 여기서는 그 처리를 지우지 않는다(진짜 더블탭은 그대로 살아 있어야 한다).
        «방금 핀치가 끝났다» 는 사실만 캡처 단계에서 기록해 두고, 그 직후의
        pdfSetZoom(1) 한 번만 무시한다.
     ⚠️ 캡처 단계여야 한다 — 교재 상자에 붙은 원래 처리보다 먼저 돌아야 한다.
  ══════════════════════════════════════════════════════════════ */
  var _maxTouches = 0, _pinchEndAt = 0;
  document.addEventListener('touchstart', function (e) {
    try { if (e.touches && e.touches.length > _maxTouches) _maxTouches = e.touches.length; } catch (_) {}
  }, true);
  document.addEventListener('touchend', function (e) {
    try {
      if (e.touches && e.touches.length === 0) {
        if (_maxTouches >= 2) _pinchEndAt = Date.now();
        _maxTouches = 0;
      }
    } catch (_) {}
  }, true);

  var _setZoom = window.pdfSetZoom;
  if (typeof _setZoom === 'function') {
    window.pdfSetZoom = function (z) {
      if (Number(z) === 1 && (Date.now() - _pinchEndAt) < 500) {
        return (typeof window.pdfGetZoom === 'function') ? window.pdfGetZoom() : 1;
      }
      return _setZoom.apply(this, arguments);
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ④ 폰에 확대·축소 버튼이 하나도 없던 것
     ──────────────────────────────────────────────────────────────
     원래 있던 확대 버튼들은 1024px 이하에서 전부 display:none 이고(index.html),
     나머지는 「교재도구」 칩을 펼쳐야 나오는데 그 칩 줄은 좁은 폰에서 화면 밖으로 밀린다.
     = 손가락이 유일한 길인데 그 길이 ③ 때문에 막혀 있었다. 손가락을 고치더라도
       누를 수 있는 버튼은 남겨 둔다(손가락이 또 어긋나도 쓸 길이 있게).
     ⛔ 아래 버튼은 «교재 탭 + 수업 중 + 좁은 화면» 일 때만 나온다. PC 는 원래 버튼을 쓴다.
  ══════════════════════════════════════════════════════════════ */
  var CSS =
    '#mgz-zoom{position:absolute;right:8px;bottom:96px;z-index:40;display:none;' +
      'flex-direction:column;gap:6px;pointer-events:auto}' +
    'body.vc-in-call #tab-pdf{position:relative}' +
    '#mgz-zoom button{width:40px;height:40px;border:none;border-radius:50%;' +
      'background:rgba(15,23,42,.72);color:#fff;font-size:19px;font-weight:800;line-height:1;' +
      'cursor:pointer;-webkit-tap-highlight-color:transparent;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.35);backdrop-filter:blur(6px);' +
      'display:flex;align-items:center;justify-content:center;overflow:hidden}' +
    '#mgz-zoom button:active{background:rgba(37,99,235,.85)}' +
    '#mgz-zoom .mgz-pct{height:26px;width:40px;border-radius:13px;font-size:11px;font-weight:700;' +
      'background:rgba(15,23,42,.72);color:#fbbf24;display:flex;align-items:center;' +
      'justify-content:center;font-variant-numeric:tabular-nums;overflow:hidden}' +
    '@media (min-width:1025px){#mgz-zoom{display:none !important}}';

  function injectCss() {
    if (document.getElementById('mgz-zoom-css')) return;
    var st = document.createElement('style');
    st.id = 'mgz-zoom-css';
    st.textContent = CSS;
    document.body.appendChild(st);   // body 끝 — 이 저장소의 화면 CSS 는 body 안에서 링크된다
  }

  /* ⚠️ 아이콘 버튼에 data-ko/data-en 을 달면 i18n 엔진이 textContent 를 «문장으로» 갈아끼워
     동그란 버튼 안에 글자가 쏟아진다(CLAUDE.md 함정표 — 홈 오프닝 소리 버튼).
     설명은 반드시 data-ko-title / data-ko-aria 로 단다. */
  function makeBtn(label, koT, enT, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('data-ko-title', koT); b.setAttribute('data-en-title', enT);
    b.setAttribute('data-ko-aria', koT); b.setAttribute('data-en-aria', enT);
    b.title = koT; b.setAttribute('aria-label', koT);
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
    return b;
  }

  var pctEl = null;
  function syncPct() {
    if (!pctEl) return;
    var z = 1;
    try { z = (typeof window.pdfGetZoom === 'function') ? window.pdfGetZoom() : 1; } catch (e) {}
    pctEl.textContent = Math.round(z * 100) + '%';
  }
  function bump(d) {
    try {
      var z = (typeof window.pdfGetZoom === 'function') ? window.pdfGetZoom() : 1;
      if (typeof window.pdfSetZoom === 'function') window.pdfSetZoom(z + d);
    } catch (e) {}
    syncPct();
  }

  function ensureZoomBtns() {
    var panel = document.getElementById('tab-pdf');
    if (!panel || document.getElementById('mgz-zoom')) return;
    injectCss();
    var wrap = document.createElement('div');
    wrap.id = 'mgz-zoom';
    wrap.appendChild(makeBtn('＋', '교재 크게', 'Zoom in', function () { bump(0.2); }));
    pctEl = document.createElement('div');
    pctEl.className = 'mgz-pct';
    pctEl.textContent = '100%';
    wrap.appendChild(pctEl);
    wrap.appendChild(makeBtn('－', '교재 작게', 'Zoom out', function () { bump(-0.2); }));
    wrap.appendChild(makeBtn('↺', '원래 크기로', 'Reset zoom', function () {
      _pinchEndAt = 0;                       // 버튼으로 부른 되돌리기는 ③ 의 차단 대상이 아니다
      try { if (typeof window.pdfSetZoom === 'function') window.pdfSetZoom(1); } catch (e) {}
      syncPct();
    }));
    panel.appendChild(wrap);
    syncPct();
  }

  function zoomBtnsSync() {
    try {
      var wrap = document.getElementById('mgz-zoom');
      if (!wrap) return;
      var onPdf = !!document.querySelector('#tab-pdf.active');
      var inCall = document.body.classList.contains('vc-in-call');
      var narrow = false;
      try { narrow = window.matchMedia('(max-width:1024px)').matches; } catch (e) {}
      wrap.style.display = (onPdf && inCall && narrow) ? 'flex' : 'none';
      if (wrap.style.display === 'flex') syncPct();
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════════
     ⑤ 「배경화면」 탭을 두 번 누르면 본문이 통째로 접히던 것
     ──────────────────────────────────────────────────────────────
     같은 탭을 다시 누르면 본문 영역을 접는 규칙인데, 접히면 그 안의 교재 도구줄
     (교재 업로드·라이브러리)도 함께 사라지고 «다시 펴는 버튼» 이 화면에 없다.
     교재(2026-08-20)와 칠판(2026-07-15)은 같은 신고로 이미 예외가 됐다 — 배경화면만 남아 있었다.
  ══════════════════════════════════════════════════════════════ */
  var _toggleTab = window.vcToggleContentTab;
  if (typeof _toggleTab === 'function') {
    window.vcToggleContentTab = function (name) {
      if (name === 'bg') {
        var p = document.getElementById('tab-bg');
        var collapsed = false;
        try { collapsed = !!(window.vcIsContentCollapsed && window.vcIsContentCollapsed()); } catch (e) {}
        if (p && p.classList.contains('active') && !collapsed) {
          try { window.closePheroMenu && window.closePheroMenu(); } catch (e) {}
          return;                            // 다시 눌러도 접지 않는다
        }
      }
      return _toggleTab.apply(this, arguments);
    };
  }

  /* ══════════════════════════════════════════════════════════════
     ⑥ 막아 세우는 안내에 중국어를 함께 적는다
     ──────────────────────────────────────────────────────────────
     이 화면의 언어는 KO/EN 두 가지뿐이다(js/mango-i18n.js — 「중국어·일본어·베트남어 제외」).
     그래서 중국인 강사에게는 «왜 안 되는지» 가 읽을 수 없는 글자로 뜬다.
     화면 전체를 옮기는 일이 아니라, «사람을 멈춰 세우는 문구» 에만 한 줄을 덧붙인다.
  ══════════════════════════════════════════════════════════════ */
  window.vcTextbookDenied = function () {
    try {
      if (window.__vcTbDenyAt && Date.now() - window.__vcTbDenyAt < 4000) return;
      window.__vcTbDenyAt = Date.now();
      var en = false;
      try { en = (typeof window.getLang === 'function' && window.getLang() === 'en'); } catch (e) {}
      var m = en ? 'Only the teacher can change the textbook for the class.'
                 : '교재는 선생님만 바꿀 수 있어요.';
      toast(zhLine(m, '只有老师可以更换班级的教材。'));
    } catch (_) {}
  };

  /* 아이폰 사진(.heic)은 브라우저가 그리지 못한다 — 형식을 열어 줘 봐야 흰 화면이 된다.
     고르는 순간에 «왜 안 되는지» 를 말해 준다(고르기 자체를 막지는 않는다 —
     원래 처리가 「파일 공유」로 돌려 주는 길이 살아 있어야 하기 때문). */
  document.addEventListener('change', function (e) {
    try {
      var el = e.target;
      if (!el || el.id !== 'pdf-upload' || !el.files || !el.files.length) return;
      var bad = Array.prototype.filter.call(el.files, function (f) {
        return /\.(heic|heif)$/i.test(String(f.name || ''));
      });
      if (!bad.length) return;
      toast(zhLine('사진 형식(HEIC)은 교재로 열 수 없어요 — JPG 로 바꿔서 올려 주세요.',
                   'HEIC 格式无法作为教材打开，请转换为 JPG 后再上传。'));
    } catch (_) {}
  }, true);

  /* ══════════════════════════════════════════════════════════════
     ⑦ 얼굴 꾸미기(가면·모자)가 눌러도 아무 일이 없던 것
     ──────────────────────────────────────────────────────────────
     [원인] 얼굴인식 파일을 «클릭한 그 순간에» 바깥에서 받아 온다(js/idx-x6.js) —
       · 실행 파일  cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35
       · 모델       storage.googleapis.com/mediapipe-models/…/face_landmarker.task
       둘 다 중국 본토에서 닿지 않는다 → 모델이 영영 안 오고 「로딩 중…」에서 멈춘다.
     [고침] 두 파일을 우리 서버에 두고(/vendor/mediapipe-face/, 15MB) 그것부터 쓴다.
       가상 배경이 2026-07-23 에 이미 같은 길을 갔다(/vendor/mediapipe/ · idx-main.js).
       덤으로 필리핀 회선도 빨라진다 — 수업 중에 바깥 도메인 두 곳을 새로 여는 일이 없어진다.

     ⚠️ **왜 idx-x6.js 를 직접 안 고쳤나** — 그 파일은 blocking 이라 한 글자만 더해도
        첫 화면 예산(여유 73바이트)을 넘긴다. 대신 그 파일이 «이미 받아 둔 것» 을 담아 두는
        칸(vcFx._vision · vcFx._fileset)에 우리 것을 미리 넣어 둔다. 그러면 그쪽 코드의
        `vcFx._vision || (await import(CDN))` 이 앞쪽에서 끝나 CDN 을 아예 안 부른다.
     ⚠️ 그 칸 이름이 바뀌면 이 미리넣기는 조용히 헛돈다(= CDN 으로 되돌아가 오늘과 같아진다).
        그래서 face_model_local_harness 가 그 두 칸과 모델 주소의 «모양» 을 못 박아 둔다.
     ⚠️ SIMD 를 못 쓰는 옛 기기는 nosimd 판 wasm(10MB 더)을 찾는데 그건 안 올렸다.
        그런 기기에서는 미리넣기를 아예 하지 않고 원래대로 CDN 에 맡긴다.
  ══════════════════════════════════════════════════════════════ */
  var FACE_LOCAL = '/vendor/mediapipe-face';

  /* WebAssembly SIMD 를 쓸 수 있는가 — MediaPipe 가 wasm 파일 이름을 이걸로 가른다
     (…/vision_wasm_internal.wasm ↔ …/vision_wasm_nosimd_internal.wasm).
     우리는 SIMD 판만 올렸으므로, 못 쓰는 기기에는 손대지 않는다. */
  function hasSimd() {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0,
        1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    } catch (e) { return false; }
  }

  var _primed = null;
  function primeFaceModel() {
    if (_primed) return _primed;
    _primed = (async function () {
      var fx = window.vcFx;
      if (!fx) return false;
      if (fx._vision || fx._fileset) return false;   // 이미 받아 둔 것이 있으면 건드리지 않는다
      if (!hasSimd()) return false;                  // 옛 기기 → 원래대로 CDN
      var mod = await import(FACE_LOCAL + '/vision_bundle.mjs');
      var fileset = await mod.FilesetResolver.forVisionTasks(FACE_LOCAL + '/wasm');
      /* 모델 주소는 idx-x6.js 안에 박혀 있어 밖에서 못 고친다 →
         createFromOptions 를 한 겹 감싸 그 자리에서 우리 것으로 바꿔 넣는다.
         나머지 옵션(델리게이트·민감도 등)은 그대로 넘긴다. */
      fx._vision = {
        FilesetResolver: mod.FilesetResolver,
        FaceLandmarker: {
          createFromOptions: function (fs, opts) {
            var o = {}, k;
            for (k in opts) o[k] = opts[k];
            o.baseOptions = {};
            for (k in (opts && opts.baseOptions) || {}) o.baseOptions[k] = opts.baseOptions[k];
            o.baseOptions.modelAssetPath = FACE_LOCAL + '/face_landmarker.task';
            return mod.FaceLandmarker.createFromOptions(fs, o);
          }
        }
      };
      fx._fileset = fileset;
      try { console.log('[mobilefix] 얼굴인식 파일을 우리 서버에서 씁니다 — ' + FACE_LOCAL); } catch (e) {}
      return true;
    })().catch(function (e) {
      /* 실패하면 «손대지 않은 상태» 로 되돌린다 — idx-x6.js 가 원래대로 CDN 에서 받는다.
         즉 최악의 경우도 오늘과 같고, 이 파일 때문에 더 나빠지지는 않는다. */
      try { if (window.vcFx) { window.vcFx._vision = null; window.vcFx._fileset = null; } } catch (_) {}
      try { console.warn('[mobilefix] 로컬 얼굴인식 파일 사용 실패 → CDN 으로', e && e.message); } catch (_) {}
      return false;
    });
    return _primed;
  }

  var _setFace = window.vcSetFace;
  if (typeof _setFace === 'function') {
    window.vcSetFace = async function (mode) {
      if (mode && mode !== 'off') {
        try { await primeFaceModel(); } catch (e) {}   // 우리 서버 파일을 먼저 물려 준다
        armFxWatch();
      }
      try { return await _setFace.apply(this, arguments); } catch (e) { return null; }
    };
  }
  var _fxTimer = null;
  function armFxWatch() {
    clearInterval(_fxTimer);
    var t0 = Date.now();
    _fxTimer = setInterval(function () {
      var on = false;
      try { on = !!(window.vcFx && window.vcFx.active); } catch (e) {}
      if (on) { clearInterval(_fxTimer); return; }
      if (Date.now() - t0 < 15000) return;
      clearInterval(_fxTimer);
      var el = document.getElementById('vc-fx-status');
      var en = false;
      try { en = (typeof window.getLang === 'function' && window.getLang() === 'en'); } catch (e) {}
      var msg = en
        ? '⚠ Could not load the face model. Please try once more.'
        : '⚠ 얼굴인식 파일을 불러오지 못했어요. 한 번만 다시 눌러 주세요.';
      if (isZh()) msg = '⚠ 无法加载人脸识别模型，请再点一次试试。';
      if (el) el.textContent = msg;
      toast(msg);
    }, 1000);
  }

  /* ══════════════════════════════════════════════════════════════
     ⑧ 「교사 화면이 작고 학생 화면이 크다」
     ──────────────────────────────────────────────────────────────
     [무엇이 문제였나] 타일(칸) 크기는 원래 같다. 작아 보이는 것은 칸 «안에서»
       교사 얼굴만 검은 띠에 둘러싸여 있기 때문이다.
       영상을 칸에 맞추는 정본(vcSmartFitVideo · js/idx-main.js)은 «영상과 칸의 방향이
       다르거나 비율 차가 1.35배를 넘으면» 잘리지 않게 contain(전체 보이기)으로 바꾼다.
       2026-07-14 에 「교사 화면도 학생처럼 꽉 차게」 지시로 예외를 넣었는데
       그 예외에 **「세로폰일 때만」** 이라는 조건이 붙어 있었다.
       → PC·태블릿처럼 얼굴 칸이 «세로로 긴» 배치에서는 예외가 안 걸려,
         교사의 가로(16:9) 웹캠이 위아래 검은 띠로 작아진다.

     [실측 2026-08-26 · 칸 안에서 얼굴 그림이 차지하는 비율]
       PC·태블릿 1280x800 : 교사 28.2%(contain) / 학생 42.3%  ← 사장님 신고와 일치
       폰 가로   844x390  : 교사  100%(cover)  / 학생 26.5%
       폰 세로   390x844  : 둘 다 100%                        ← 2026-07-14 예외가 걸린다

     [고침] 예외의 조건을 «화면 폭» 이 아니라 **«보내온 영상이 가로인가»** 로 바꾼다.
       · 교사가 PC 웹캠(가로)이면 어느 기기에서도 꽉 찬다.
       · 교사가 휴대폰 세로로 들어오면 원래 로직 그대로 — 얼굴이 잘리지 않는다.
     ⛔ 화면 공유는 제외한다 — 가로 영상이지만 꽉 채우면 **공유한 화면의 좌우가 잘려 나간다.**
        판별은 그 타일에 붙는 «화면 공유 중» 배지(.vc-ss-badge). 서버(DO)가 fromUserId 를
        실어 주므로(src/video-call-room.ts:422) 어느 타일인지 확실하다.
     ℹ️ 내 타일(#vc-local-box)은 건드리지 않는다 — 가상배경이 켜지면 contain 이어야
        턱·목이 안 잘린다(2026-07-13 결정). 신고도 «상대 화면» 에 대한 것이었다.
     ⚠️ 맞바꾼 것: 세로로 아주 긴 칸에서는 가로 영상의 좌우가 많이 잘린다.
        얼굴은 대개 화면 가운데에 있어 괜찮지만, 옆으로 비켜 앉으면 잘릴 수 있다.
        그때는 화면분할 버튼으로 얼굴 칸을 넓히면 된다.
  ══════════════════════════════════════════════════════════════ */
  function isScreenShareTile(box) {
    try { return !!(box && box.querySelector('.vc-ss-badge')); } catch (e) { return false; }
  }

  var _smartFit = window.vcSmartFitVideo;
  if (typeof _smartFit === 'function') {
    window.vcSmartFitVideo = function (v) {
      try {
        var box = (v && v.closest) ? v.closest('.video-box') : null;
        /* 🖥 화면 공유는 «무조건» 전체 보이기. 잘리면 공유한 화면의 좌우가 사라진다.
           ⚠️ 원래 로직에는 「세로폰에서 상대 타일은 무조건 cover」(2026-07-14) 가 있어서
              그냥 넘기면 세로폰에서 공유 화면이 잘렸다(2026-08-26 실측 100% cover).
              그 지시는 «얼굴» 을 꽉 채우라는 것이었지 공유 화면 얘기가 아니다. */
        if (box && isScreenShareTile(box)) {
          v.style.setProperty('object-fit', 'contain', 'important');
          return;
        }
        if (v && v.videoWidth && v.videoHeight && v.videoWidth >= v.videoHeight
            && box && box.id !== 'vc-local-box') {
          v.style.setProperty('object-fit', 'cover', 'important');
          return;
        }
      } catch (e) {}
      return _smartFit.apply(this, arguments);
    };
  }

  /* 화면 공유가 시작·중지되면 배지가 붙고 떨어진다 → 그 타일만 다시 맞춘다.
     ⛔ body 의 class 를 지켜보지 않는다(그건 홈 전체를 멎게 한 전력이 있다).
        영상 그리드 하나만, 배지가 오갈 때만 본다 — 같은 자리에 이미 형제 감시가 있다
        (idx-main.js 의 grid.__aspectMO). */
  (function watchScreenShareBadge() {
    function arm() {
      var grid = document.getElementById('vc-video-grid');
      if (!grid || grid.__ssFitMO) return;
      grid.__ssFitMO = new MutationObserver(function (recs) {
        var touched = false;
        for (var i = 0; i < recs.length; i++) {
          var all = [].concat([].slice.call(recs[i].addedNodes), [].slice.call(recs[i].removedNodes));
          for (var j = 0; j < all.length; j++) {
            var n = all[j];
            if (n && n.classList && n.classList.contains('vc-ss-badge')) { touched = true; break; }
          }
          if (touched) break;
        }
        if (!touched) return;
        try {
          grid.querySelectorAll('.video-box video').forEach(function (v) { window.vcSmartFitVideo(v); });
        } catch (e) {}
      });
      grid.__ssFitMO.observe(grid, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
    setTimeout(arm, 1500);          // 그리드가 늦게 생기는 경로 대비 (끝이 있는 재시도)
  })();

  /* ══════════════════════════════════════════════════════════════
     ⑨ 1:1 수업에서 «상대(교사) 얼굴» 을 내 얼굴보다 크게
     ──────────────────────────────────────────────────────────────
     [지시] 사장님 2026-08-26 「교사를 학생보다 더 크게도 해줘」.

     [먼저 재 봤다 — 화면마다 «구조 자체» 가 다르다]  칸 크기 실측(1:1, video-half)
       PC 1280x800 : 상대 341x687 / 나 210x158 → 이미 상대가 7.15배
                     ⚠️ 여기는 그리드가 아니다 — css/vc-refresh.css 가
                        «상대 전체화면 + 내 타일은 오른아래 작은 PIP» 로 그린다.
       폰 가로     : 295x139 / 295x139 → 정확히 1배   ← 그리드(세로로 쌓임)
       폰 세로     : 187x345 / 187x345 → 정확히 1배   ← 그리드(좌우로 갈림)
     → 그래서 고침이 «두 종류» 다: 폰은 fr 비중, PC 는 «누가 PIP 인가» 맞바꾸기.

     ⚠️ 그 두 곳은 2026-07-14 지시로 «정확히 반반» 이 못 박혀 있던 자리다
        (index.html 3272·3392·3412 — 「겹침·축소·가림 절대 금지」).
        2026-08-26 사장님 지시로 그 결정을 바꾼다. 되돌리려면 이 절만 지우면 된다.

     [무엇을 크게 하나] **«교사» 타일이다 — 누가 보든 교사가 크다.**
       · 학생 화면 → 상대(교사)가 큼
       · 교사 화면 → **자기 자신**이 큼 (2026-08-26 사장님 추가 지시)
     ⚠️ 처음엔 «상대» 기준으로 만들었다가 바로 이 지시로 바꿨다. 그때 근거로 삼은
        「자기 얼굴이 화면을 지배하면 안 된다」는 우리 짐작이었고, 사장님 판단은 달랐다.
     ℹ️ 순서(order)는 건드리지 않는다 — 내 타일은 그대로 맨 뒤에 있고 «크기» 만 바뀐다.
        그래서 교사 화면에서는 둘째 칸이 커진다(1fr 1.6fr).
     ℹ️ 1:1(data-count="2") 일 때만. 3명 이상은 주인공이 정해지지 않는다.
  ══════════════════════════════════════════════════════════════ */
  var BIG  = '1.6fr 1fr';          // 첫 칸(상대)이 큼      — 학생 화면
  var BIGME = '1fr 1.6fr';         // 둘째 칸(내 타일)이 큼 — 교사 화면(내 타일은 order:96 로 맨 뒤)
  var PORT = '@media (max-width:920px) and (orientation:portrait){';
  var LAND = '@media (max-width:1024px) and (orientation:landscape),(max-height:600px) and (orientation:landscape){';
  /* 원래 규칙(index.html 3272·3392)이 (3,2,0)·(3,3,0) 이라 [data-count] 로 한 칸 더 얹어 이긴다.
     교사용 줄은 body 에 클래스가 하나 더 붙어 자동으로 더 세다. */
  var SEL_P  = 'body.vc-in-call#{ME} #vc-main-row.video-half #vc-video-grid#vc-video-grid[data-count="2"]';
  var SEL_L  = 'body.vc-in-call#{ME} #vc-main-row:not(.video-solo):not(.video-full) #vc-video-grid#vc-video-grid[data-count="2"]';
  function sel(t, me) { return t.replace('#{ME}', me ? '.mg-teacher-self:not(.vc-observer)' : ':not(.mg-teacher-self)'); }

  var HERO_CSS =
    /* 폰 세로 — 위쪽 얼굴 띠가 «좌우» 로 갈린다 → 가로 비중 */
    PORT +
      sel(SEL_P, false) + '{grid-template-columns:' + BIG + ' !important}' +
      sel(SEL_P, true)  + '{grid-template-columns:' + BIGME + ' !important}' +
    '}' +
    /* 폰 가로 — 오른쪽 얼굴 컬럼이 «위아래» 로 쌓인다 → 세로 비중 */
    LAND +
      sel(SEL_L, false) + '{grid-template-rows:' + BIG + ' !important;grid-auto-rows:1fr !important}' +
      sel(SEL_L, true)  + '{grid-template-rows:' + BIGME + ' !important;grid-auto-rows:1fr !important}' +
    '}' +
    /* PC·태블릿(≥1024px) — 여기는 그리드가 아니다.
       css/vc-refresh.css 가 1:1 을 «상대 전체화면 + 내 타일은 오른아래 작은 PIP(24%·최대 210px)» 로 그린다
       (display:block + 둘 다 position:absolute). 그래서 타일 크기를 정하는 것은 fr 비율이 아니라
       «누가 PIP 인가» 하나다. 교사 화면에서는 그 둘을 맞바꿈 — 내가 전체화면, 상대가 PIP.
       ⚠️ 폭 만 바꿔서는 안 된다 — 높이도 aspect-ratio·inset 으로 정해진다(실측: 상대 211x687 / 나 210x158).
       ⚠️ (min-width:1024px) 으로 묶어 둔다 — 이 줄이 폰까지 닿으면 위 fr 규칙과 겹쳐 두 번 줄어든다
       (실측으로 밟음: 1.6배가 아니라 2.58배가 됐다). 이겨야 할 상대는 vc-refresh.css(2,2,1) 가 아니라
       index.html vc-teacher-first 의 (3,5,1) 이다 — id 를 다섯 개로 만들어(5,3,1) 이긴다.
       (id 개수를 먼저 비교하므로 클래스가 적어도 이긴다. 처음엔 (3,3,1) 로 만들어 «내 타일이
        전체화면인데 폭만 62%» 라는 어정쩡한 상태를 실측으로 밟았다.) */
    '@media (min-width:1024px){' +
      /* 내 타일 → 전체화면 */
      'body.vc-in-call.mg-teacher-self:not(.vc-observer) #vc-main-row#vc-main-row #vc-video-grid#vc-video-grid[data-count="2"] #vc-local-box{' +
        'position:absolute !important;inset:0 !important;width:100% !important;height:100% !important;' +
        'max-width:none !important;aspect-ratio:auto !important;border-radius:0 !important;' +
        'box-shadow:none !important;z-index:1 !important;margin-left:0 !important;opacity:1 !important}' +
      /* 상대 → 오른아래 PIP (학생 화면에서 내 타일이 받던 «그 크기» 그대로)
         ℹ️ 62% 는 vc-refresh.css 의 24% 가 아니라 index.html vc-teacher-first 의 값이다 —
            그 규칙이 (2,5,1) 로 더 세서 학생 화면 PIP 는 실제로 62%(상한 210px)로 그려진다.
            24% 를 그대로 베끼면 PIP 가 82px 로 나와 학생 화면과 짝이 안 맞는다(실측). */
      'body.vc-in-call.mg-teacher-self:not(.vc-observer) #vc-main-row#vc-main-row #vc-video-grid#vc-video-grid[data-count="2"] .video-box:not(#vc-local-box){' +
        'position:absolute !important;inset:auto 14px 14px auto !important;' +
        'width:62% !important;max-width:210px !important;height:auto !important;aspect-ratio:4/3 !important;' +
        'border-radius:14px !important;overflow:hidden !important;z-index:40 !important;' +
        'box-shadow:0 0 0 2px rgba(251,191,36,.6),0 10px 26px rgba(0,0,0,.5) !important}' +
    '}';

  /* ⑨-3 «이 방의 교사가 누구인가» — 상대 타일에 교사가 있으면 내가 무엇이든 상대가 주인공이다.
     ──────────────────────────────────────────────────────────────
     [사고] 2026-08-26 사장님 신고 「학생 수업 입장인데 내가 크고 교사가 작다」.
       원인은 CSS 가 아니라 «역할» 이었다. jeong 은 홈 통합 로그인에서 관리자 폴백으로 들어가
       학생 세션(mangoi_logged_user)이 없다 → 입장 역할 판정이 계정 역할을 못 찾고
       관리자 세션 하나만 보고 admin 으로 떨어진다(idx-main.js «else if (_admUid)» 줄).
       그러면 아래 ⑨ 의 「교사 화면에서는 자기 자신이 크게」가 그대로 걸려 얼굴이 맞바뀐다.
     ⚠️ 그 오판을 서버가 되돌려 주지 못한다 — /api/class/verify-room 은 role=admin 이면
        «privileged» 로 즉시 통과시키고 resolved_role 을 주지 않는다(api-mango.ts).
        그래서 idx-main.js 의 «이 예약의 학생이면 역할을 내린다» 교정이 admin 에서만 안 돈다
        → 한 번 admin 으로 잡히면 수업 내내 뒤집힌 채로 간다(실측 10분).
     [고침] 판정을 «내가 스태프인가» 에서 «상대 중에 교사가 있는가» 로 옮긴다.
       교사가 상대편에 있으면 내가 admin 이든 teacher 든 상대가 크다. 사장님·매니저가
       학생 자리로 들어가도, 강사가 다른 강사 수업을 참관 삼아 들어가도 「교사가 크다」가 지켜진다.
     ⛔ 역할 판정 정본(vcIsStaffNow)이나 idx-main.js 를 고쳐서 풀지 않는다 —
        그 값은 화면공유·교재 넘김·장치 도우미까지 걸린 «권한» 이고, 여기서 필요한 것은
        «화면에서 누가 주인공인가» 뿐이다. 권한은 그대로 두고 크기만 바로잡는다.
     ℹ️ 상대 타일의 역할이 아직 안 왔으면 기본값이 'student' 라(idx-main.js) 진짜 교사 화면은
        예전처럼 즉시 자기 자신이 커진다. 늦게 도착하면 vcApplySpotlight 를 감싸 다시 본다. */
  function mgBoxIsTeacher(b) {
    try {
      /* 판정 정본은 idx-main.js 의 vcBoxIsStudent — 역할 + 이름 휴리스틱을 이미 함께 본다.
         ⚠️ 그 이름이 바뀌면 조용히 헛돌므로 아래에 같은 뜻의 대비책을 둔다(하니스가 둘 다 본다). */
      if (typeof window.vcBoxIsStudent === 'function') return !window.vcBoxIsStudent(b);
      var uid = String(b.id || '').replace('vc-video-', '');
      var role = (b.dataset && b.dataset.role) || (window.vcPeerRoles && window.vcPeerRoles[uid]) || 'student';
      if (role === 'teacher' || role === 'admin' || role === 'observer') return true;
      var lbl = b.querySelector('.video-label');
      return /교사|강사|선생님|teacher|tutor/i.test((lbl && lbl.textContent) || '');
    } catch (e) { return false; }
  }
  function mgRemoteTeacherPresent() {
    try {
      var grid = document.getElementById('vc-video-grid');
      if (!grid) return false;
      var bs = grid.querySelectorAll('.video-box');
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        if (!b.id || b.id === 'vc-local-box') continue;
        if (b.dataset && b.dataset.demo === '1') continue;   // 시연용 선생님 타일은 사람이 아니다
        if (mgBoxIsTeacher(b)) return true;
      }
    } catch (e) {}
    return false;
  }

  /* 내가 교사·관리자인가 — 역할은 입장 뒤에 정해지므로 «끝이 있는» 확인으로 몇 번 다시 본다.
     ⛔ body class 를 MutationObserver 로 지켜보지 않는다(홈 전체를 멎게 한 전력이 있다).
     ⛔ 있을 때만 지우고 없을 때만 더한다 — 무조건 classList 를 쓰면 class 속성이 다시 쓰여
        남의 감시자를 깨운다(2026-07-14 라이브 장애와 같은 뿌리). */
  function syncTeacherSelf() {
    try {
      var staff = false;
      try {
        staff = (typeof window.vcIsStaffNow === 'function') ? !!window.vcIsStaffNow()
              : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
      } catch (e) {}
      /* ⛔ 참관(Ghost)은 제외한다. 참관자는 vcMyRole='admin' 이라 위 판정이 true 인데,
         참관자의 #vc-local-box 는 영상이 없는 «빈 타일» 이고 지워지지도 않는다
         (index.html 에 정적으로 있다). 방에 한 명뿐일 때 data-count="2" 가 되어
         «빈 내 타일이 전체화면 + 진짜 참가자가 210px PIP» 가 된다 — 2026-08-26 실측으로 밟음.
         ⚠️ 선택자에도 :not(.vc-observer) 를 함께 걸어 뒀다. 그 클래스를 붙이는
         js/vc-observe-guard.js 와 이 파일의 실행 순서에 기대지 않기 위해서다. */
      var observing = document.body.classList.contains('vc-observer');
      /* 🧑‍🏫 상대편에 교사가 있으면 주인공은 그쪽이다 — 위 ⑨-3 참고 */
      var want = staff && !observing && !mgRemoteTeacherPresent()
              && document.body.classList.contains('vc-in-call');
      var has = document.body.classList.contains('mg-teacher-self');
      if (want && !has) document.body.classList.add('mg-teacher-self');
      else if (!want && has) document.body.classList.remove('mg-teacher-self');
    } catch (e) {}
  }
  window.mgSyncTeacherSelf = syncTeacherSelf;   // 검사·콘솔에서 부를 수 있게
  window.mgRemoteTeacherPresent = mgRemoteTeacherPresent;

  /* 교사가 «나중에» 들어오거나 역할이 늦게 도착하는 경우 — 그때 다시 본다.
     vcApplySpotlight 는 ① 타일을 만들 때 ② 로스터에서 역할이 올 때 불린다(idx-main.js).
     ⛔ 상주 setInterval·body class 감시를 두지 않는다(둘 다 이 저장소에서 사고를 낸 방식).
     ℹ️ vc-spotlight.js 는 이 파일보다 «먼저» 오는 defer 라(index.html 15092 대 16367)
        여기서 감싸면 원본이 안전하게 잡힌다. */
  var _spot = window.vcApplySpotlight;
  if (typeof _spot === 'function') {
    window.vcApplySpotlight = function () {
      var r = _spot.apply(this, arguments);
      try { syncTeacherSelf(); } catch (e) {}
      return r;
    };
  }

  (function injectHeroCss() {
    function put() {
      if (document.getElementById('mg-hero-css')) return;
      if (!document.body) return;
      var st = document.createElement('style');
      st.id = 'mg-hero-css';
      st.textContent = HERO_CSS;
      document.body.appendChild(st);   // 이 저장소의 화면 CSS 는 body 안에서 링크된다 — 뒤에 와야 이긴다
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put);
    else put();
  })();

  /* ── 화면 상태에 따라 확대 버튼 보이기/숨기기 ──────────────────
     ⛔ body 의 class 를 MutationObserver 로 지켜보지 않는다 — 이 저장소에는 body class 를
        자주 다시 쓰는 코드가 여럿이라 콜백이 쉴 새 없이 돌아 화면이 멎은 전력이 있다
        (CLAUDE.md 함정표 · 2026-07-14 라이브 장애). 대신 vcSwitchTab 을 감싸고,
        수업에 들어간 순간부터 «끝이 있는» 확인만 한다. */
  var _switchTab = window.vcSwitchTab;
  if (typeof _switchTab === 'function') {
    window.vcSwitchTab = function () {
      var r = _switchTab.apply(this, arguments);
      try { ensureZoomBtns(); zoomBtnsSync(); syncTeacherSelf(); } catch (e) {}
      return r;
    };
  }
  var _join = window.vcJoinRoom;
  if (typeof _join === 'function') {
    window.vcJoinRoom = function () {
      var r = _join.apply(this, arguments);
      var n = 0;
      var iv = setInterval(function () {
        try { ensureZoomBtns(); zoomBtnsSync(); syncTeacherSelf(); } catch (e) {}
        if (++n >= 12) clearInterval(iv);      // 6초까지만 — 상주 타이머를 남기지 않는다
      }, 500);
      return r;
    };
  }
  window.addEventListener('orientationchange', function () { setTimeout(zoomBtnsSync, 500); });
  window.addEventListener('resize', function () { setTimeout(zoomBtnsSync, 300); });

  try { console.log('[mobilefix] 교재 배율 ' + window._pdfDPR + '배 · 핀치 유지 · 확대버튼 · 배경탭 · 중국어 안내 준비됨'); } catch (e) {}
})();
