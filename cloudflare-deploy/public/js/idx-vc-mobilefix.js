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
 *   ⑦ 얼굴 꾸미기 모델이 안 올 때 이유를 말해 준다(구글 서버가 중국에서 막혀 있다).
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
     얼굴인식 모델을 storage.googleapis.com 과 cdn.jsdelivr.net 에서 그때 받아 온다
     (js/idx-x6.js). 둘 다 중국 본토에서 닿지 않는다 → 모델이 영영 안 오고
     화면은 「얼굴인식 모델 로딩 중…」에서 멈춘다. 실패해도 작은 회색 글씨 한 줄뿐이라
     «고장» 으로 읽힌다.
     ✅ 여기서는 «왜 안 되는지» 를 말해 주는 데까지만 한다.
        진짜 해결은 그 파일들을 우리 서버로 복사하는 것인데(가상 배경은 2026-07-23 에
        이미 그렇게 옮겼다 — /vendor/mediapipe/), wasm 까지 합쳐 약 15MB 라
        저장소에 넣을지는 사람이 결정할 일이다.
  ══════════════════════════════════════════════════════════════ */
  var _setFace = window.vcSetFace;
  if (typeof _setFace === 'function') {
    window.vcSetFace = function (mode) {
      var r;
      try { r = _setFace.apply(this, arguments); } catch (e) { r = null; }
      if (mode && mode !== 'off') armFxWatch();
      return r;
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
      if (Date.now() - t0 < 12000) return;
      clearInterval(_fxTimer);
      var el = document.getElementById('vc-fx-status');
      var en = false;
      try { en = (typeof window.getLang === 'function' && window.getLang() === 'en'); } catch (e) {}
      var msg = en
        ? '⚠ Could not download the face model — some networks block it (e.g. mainland China).'
        : '⚠ 얼굴인식 파일을 받지 못했어요 — 일부 지역(중국 등)에서는 막혀 있어요.';
      if (isZh()) msg = '⚠ 无法下载人脸识别模型 — 中国大陆网络已屏蔽该服务，此功能暂时无法使用。';
      if (el) el.textContent = msg;
      toast(msg);
    }, 1000);
  }

  /* ── 화면 상태에 따라 확대 버튼 보이기/숨기기 ──────────────────
     ⛔ body 의 class 를 MutationObserver 로 지켜보지 않는다 — 이 저장소에는 body class 를
        자주 다시 쓰는 코드가 여럿이라 콜백이 쉴 새 없이 돌아 화면이 멎은 전력이 있다
        (CLAUDE.md 함정표 · 2026-07-14 라이브 장애). 대신 vcSwitchTab 을 감싸고,
        수업에 들어간 순간부터 «끝이 있는» 확인만 한다. */
  var _switchTab = window.vcSwitchTab;
  if (typeof _switchTab === 'function') {
    window.vcSwitchTab = function () {
      var r = _switchTab.apply(this, arguments);
      try { ensureZoomBtns(); zoomBtnsSync(); } catch (e) {}
      return r;
    };
  }
  var _join = window.vcJoinRoom;
  if (typeof _join === 'function') {
    window.vcJoinRoom = function () {
      var r = _join.apply(this, arguments);
      var n = 0;
      var iv = setInterval(function () {
        try { ensureZoomBtns(); zoomBtnsSync(); } catch (e) {}
        if (++n >= 12) clearInterval(iv);      // 6초까지만 — 상주 타이머를 남기지 않는다
      }, 500);
      return r;
    };
  }
  window.addEventListener('orientationchange', function () { setTimeout(zoomBtnsSync, 500); });
  window.addEventListener('resize', function () { setTimeout(zoomBtnsSync, 300); });

  try { console.log('[mobilefix] 교재 배율 ' + window._pdfDPR + '배 · 핀치 유지 · 확대버튼 · 배경탭 · 중국어 안내 준비됨'); } catch (e) {}
})();
