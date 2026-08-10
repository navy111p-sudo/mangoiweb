// idx-vc-seg-lessonchange.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  'use strict';

  function ph49PatchSeg(){
    try {
      if (typeof window.vcOnSegResults !== 'function' && typeof vcOnSegResults !== 'function') return;
      window.vcOnSegResults = function(results){
        try {
          if (typeof vcBg === 'undefined' || !vcBg.canvas) return;
          var ctx = vcBg.ctx;
          var w = vcBg.canvas.width, h = vcBg.canvas.height;
          var mctx = vcBg.maskCtx;
          var _mobile = (typeof vcIsMobileDevice === 'function') ? vcIsMobileDevice() : false;
          // === Step A: 마스크 정제 — 번짐(후광) 제거 ===
          mctx.save();
          mctx.clearRect(0, 0, w, h);
          // 1) 강한 contrast 로 회색 전이(alpha 0.2~0.8 halo) 를 0/1 로 강제 → binary 마스크
          mctx.filter = 'contrast(3.2) brightness(1.0)';
          mctx.drawImage(results.segmentationMask, 0, 0, w, h);
          mctx.filter = 'none';
          // 2) Erosion(마스크 축소): 마스크를 상하좌우로 shift 후 destination-in →
          //    겹치는 안쪽만 남아 외곽이 1~2px 잠식됨 → 배경 불빛 fringe(번짐) 제거
          mctx.globalCompositeOperation = 'destination-in';
          mctx.filter = 'contrast(3.2)';
          mctx.drawImage(results.segmentationMask, -1, 0, w, h);
          mctx.drawImage(results.segmentationMask, 1, 0, w, h);
          if (!_mobile) {
            mctx.drawImage(results.segmentationMask, 0, -1, w, h);
            mctx.drawImage(results.segmentationMask, 0, 1, w, h);
            mctx.drawImage(results.segmentationMask, -2, 0, w, h);
            mctx.drawImage(results.segmentationMask, 2, 0, w, h);
          }
          mctx.filter = 'none';
          mctx.globalCompositeOperation = 'source-over';
          mctx.restore();
          ctx.save();
          ctx.clearRect(0, 0, w, h);
          // 최소 feather(0.5px) 로만 anti-alias → 경계 또렷, 번짐 없음
          ctx.filter = 'blur(0.5px)';
          ctx.drawImage(vcBg.maskCanvas, 0, 0, w, h);
          ctx.filter = 'none';
          ctx.globalCompositeOperation = 'source-in';
          ctx.drawImage(results.image, 0, 0, w, h);
          ctx.globalCompositeOperation = 'destination-over';
          if (vcBg.mode === 'blur') {
            ctx.filter = 'blur(12px)';
            ctx.drawImage(results.image, 0, 0, w, h);
            ctx.filter = 'none';
          } else if (vcBg.mode !== 'off') {
            var img = (typeof vcGetBgImageSync === 'function') ? vcGetBgImageSync(vcBg.mode) : null;
            if (img && img.complete && img.naturalWidth > 0) {
              var ir = img.naturalWidth / img.naturalHeight;
              var cr = w / h;
              var sx, sy, sw, sh;
              if (ir > cr) { sh = img.naturalHeight; sw = sh * cr; sx = (img.naturalWidth - sw) / 2; sy = 0; }
              else { sw = img.naturalWidth; sh = sw / cr; sx = 0; sy = (img.naturalHeight - sh) / 2; }
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
            } else {
              ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
            }
          }
          ctx.restore();
        } catch (e) { console.warn('[ph49-seg]', e); }
      };
      try {
        if (typeof vcBg !== 'undefined' && vcBg.segmenter && typeof vcBg.segmenter.onResults === 'function') {
          vcBg.segmenter.onResults(window.vcOnSegResults);
        }
      } catch(e){}
      console.log('[ph49] segmentation softened');
    } catch(e) { console.warn('[ph49] seg patch fail', e); }
  }

  function ph49AttachTouchDrag(handleEl, moveEl){
    if (!handleEl || !moveEl || handleEl.dataset.ph49Touch === '1') return;
    handleEl.dataset.ph49Touch = '1';
    var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    function onStart(e){
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
      var t = (e.touches && e.touches[0]) || e;
      dragging = true; moved = false;
      sx = t.clientX; sy = t.clientY;
      var rect = moveEl.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      try { e.preventDefault(); } catch(_) {}
    }
    function onMove(e){
      if (!dragging) return;
      var t = (e.touches && e.touches[0]) || e;
      var dx = t.clientX - sx, dy = t.clientY - sy;
      if (!moved && (Math.abs(dx) + Math.abs(dy)) < 5) return;
      moved = true;
      moveEl.style.right = 'auto'; moveEl.style.bottom = 'auto';
      moveEl.style.position = 'fixed';
      var rect = moveEl.getBoundingClientRect();
      var nx = Math.max(4, Math.min(window.innerWidth - rect.width - 4, ox + dx));
      var ny = Math.max(4, Math.min(window.innerHeight - rect.height - 4, oy + dy));
      moveEl.style.left = nx + 'px';
      moveEl.style.top  = ny + 'px';
      try { e.preventDefault(); } catch(_) {}
    }
    function onEnd(){
      if (!dragging) return;
      dragging = false;
      if (!moved) return;
      try {
        localStorage.setItem('ph49_'+moveEl.id+'_pos', JSON.stringify({left:moveEl.style.left, top:moveEl.style.top}));
      } catch(_){}
    }
    handleEl.addEventListener('touchstart', onStart, {passive:false});
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend', onEnd);
    handleEl.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  }

  function ph49RestorePos(el){
    if (!el || !el.id) return;
    try {
      var raw = localStorage.getItem('ph49_'+el.id+'_pos');
      if (!raw) return;
      var p = JSON.parse(raw);
      if (p.left) el.style.left = p.left;
      if (p.top)  el.style.top  = p.top;
      if (p.left || p.top) {
        el.style.right = 'auto'; el.style.bottom = 'auto';
        el.style.position = 'fixed';
      }
    } catch(_){}
  }

  function ph49AddWhiteboardToggle(){
    // 교재도구(.pdf-controls)·필기도구(.pdf-anno-bar)는 상단 탭바의 칩(mango-tool-chip)이 제어.
    //  → 인라인 토글을 넣지 않고, 기본 '접힘(드롭다운 숨김)' 상태로 시작.
    // 🔧 (2026-06-27 FIX) 깜빡임 근본 원인 차단:
    //   이 함수는 body class 가 바뀔 때마다(MutationObserver) 반복 호출된다.
    //   매번 ph49-collapsed 를 다시 붙이면, 칩으로 펼쳐둔 드롭다운이 강제로 접혔다가
    //   dock.js 폴링이 다시 펴는 일이 반복 → 끊임없는 깜빡임.
    //   → '최초 1회'만 기본 접힘을 적용하고, 이후 열림/접힘 상태는 칩(dock.js)에 일임한다.
    document.querySelectorAll('.pdf-controls, .pdf-anno-bar').forEach(function(bar){
      if (bar.dataset.ph49Init) return;      // 이미 초기화된 바는 절대 건드리지 않음
      bar.dataset.ph49Init = '1';
      bar.classList.add('ph49-collapsed');   // 최초 1회만 기본 접힘
    });
    // 🔧 (2026-07-05) 칠판 전용 도구바(.wb-toolbar) 인라인 토글 제거 — 필기도구 칩과
    //   내용이 중복돼 화면만 좁아진다는 피드백. .wb-toolbar 자체를 CSS 로 숨김(mg-hide-wb-toolbar).
  }

  function ph49AddFaceToggle(){
    return;  // fix (2026-06-02) — 사용자 요청: FACE OFF 버튼 완전 제거
    var localBox = document.getElementById('vc-local-box');
    var videoPane = document.getElementById('vc-video-pane');
    var mainRow = document.getElementById('vc-main-row');
    if (!localBox || !videoPane || !mainRow) return;
    if (videoPane.querySelector('.ph49-face-toggle')) return;
    var toggle = document.createElement('button');
    toggle.className = 'ph49-face-toggle';
    toggle.type = 'button';
    toggle.title = 'Toggle face';
    toggle.innerHTML = 'FACE OFF';
    toggle.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      mainRow.classList.toggle('ph49-face-hidden');
      ph49UpdateFaceRestore();
    });
    videoPane.appendChild(toggle);
    var restore = document.createElement('button');
    restore.className = 'ph49-face-restore';
    restore.type = 'button';
    restore.title = 'Show face';
    restore.textContent = 'F';
    restore.style.display = 'none';
    restore.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      mainRow.classList.remove('ph49-face-hidden');
      ph49UpdateFaceRestore();
    });
    videoPane.appendChild(restore);
    var firstVideo = localBox.querySelector('video');
    if (firstVideo && !firstVideo.dataset.ph49Tap) {
      firstVideo.dataset.ph49Tap = '1';
      var lastTap = 0;
      firstVideo.addEventListener('click', function(){
        var now = Date.now();
        if (now - lastTap < 400) {
          mainRow.classList.toggle('ph49-face-hidden');
          ph49UpdateFaceRestore();
        }
        lastTap = now;
      });
    }
  }
  function ph49UpdateFaceRestore(){
    var restore = document.querySelector('.ph49-face-restore');
    var mainRow = document.getElementById('vc-main-row');
    if (!restore || !mainRow) return;
    restore.style.display = mainRow.classList.contains('ph49-face-hidden') ? 'flex' : 'none';
    var toggle = document.querySelector('.ph49-face-toggle');
    if (toggle) toggle.style.display = mainRow.classList.contains('ph49-face-hidden') ? 'none' : '';
  }

  function ph49KakaoInit(){
    var fab = document.getElementById('ph49-kakao-fab');
    if (!fab) return;
    fab.classList.add('ph49-kakao-show-label');
    setTimeout(function(){ fab.classList.remove('ph49-kakao-show-label'); }, 2500);
    if (window.matchMedia('(max-width: 720px)').matches) {
      setTimeout(function(){
        fab.classList.add('ph49-kakao-show-label');
        setTimeout(function(){ fab.classList.remove('ph49-kakao-show-label'); }, 2000);
      }, 8000);
    }
  }

  function ph49EnhanceCalendar(){
    var modal = document.querySelector('.lc-modal');
    if (!modal || modal.dataset.ph49Cal === '1') return;
    var grid = modal.querySelector('#cal-grid-wrap');
    if (!grid) return;
    modal.dataset.ph49Cal = '1';

    if (window.matchMedia('(max-width: 900px)').matches) {
      modal.querySelectorAll('.lc-info').forEach(function(info){
        info.classList.add('ph49-cal-collapsed');
        info.style.cursor = 'pointer';
        info.addEventListener('click', function(){
          info.classList.toggle('ph49-cal-collapsed');
        });
      });
    }

    if (!grid.querySelector('.ph49-cal-nav')) {
      var nav = document.createElement('div');
      nav.className = 'ph49-cal-nav';
      nav.innerHTML =
        '<button type="button" data-act="prev" data-ko="◀ 이전주" data-en="◀ Prev">◀ 이전주</button>' +
        '<button type="button" data-act="today" class="ph49-secondary" data-ko="오늘" data-en="Today">오늘</button>' +
        '<button type="button" data-act="next" data-ko="다음주 ▶" data-en="Next ▶">다음주 ▶</button>' +
        '<button type="button" data-act="up" class="ph49-secondary" title="up">▲</button>' +
        '<button type="button" data-act="down" class="ph49-secondary" title="down">▼</button>' +
        '<span class="ph49-cal-week-label" data-ko="캘린더 - 버튼으로 이동" data-en="Calendar - Use buttons">캘린더 - 버튼으로 이동</span>';
      grid.insertBefore(nav, grid.firstChild);
      var scroller = grid.querySelector('div:nth-child(2)');
      if (!scroller) {
        var gridBody = grid.querySelector('[id$="grid-body"]');
        scroller = gridBody && gridBody.parentElement ? gridBody.parentElement : null;
      }
      nav.addEventListener('click', function(e){
        var b = e.target.closest('button'); if (!b) return;
        var act = b.dataset.act;
        if (!scroller) return;
        var w = scroller.clientWidth || 320;
        if (act === 'prev')       scroller.scrollBy({ left: -w * 0.9, behavior: 'smooth' });
        else if (act === 'next')  scroller.scrollBy({ left:  w * 0.9, behavior: 'smooth' });
        else if (act === 'today') scroller.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
        else if (act === 'up')    scroller.scrollBy({ top: -200, behavior: 'smooth' });
        else if (act === 'down')  scroller.scrollBy({ top:  200, behavior: 'smooth' });
      });
    }

    if (!modal.querySelector('.ph49-cal-manual')) {
      var manual = document.createElement('div');
      manual.className = 'ph49-cal-manual';
      var today = new Date();
      var ymd = today.toISOString().slice(0,10);
      manual.innerHTML =
        '<input type="date" id="ph49-cal-date" value="' + ymd + '" min="' + ymd + '">' +
        '<input type="time" id="ph49-cal-time" value="14:00" step="600">' +
        '<button type="button" class="ph49-confirm" id="ph49-cal-apply" data-ko="✓ 이 시간으로 변경" data-en="✓ Set this time">✓ 이 시간으로 변경</button>';
      grid.parentNode.appendChild(manual);
      manual.querySelector('#ph49-cal-apply').addEventListener('click', function(){
        var d = manual.querySelector('#ph49-cal-date').value;
        var t = manual.querySelector('#ph49-cal-time').value;
        if (!d || !t) { alert('날짜와 시간을 모두 선택해주세요.'); return; }
        try {
          if (window.lcPicker) {
            window.lcPicker.pickedDate = d;
            window.lcPicker.pickedHour = t;
          }
          var confirmBtn = modal.querySelector('[onclick*="lcConfirm"], [onclick*="confirmChange"], .lc-confirm');
          if (confirmBtn) { confirmBtn.click(); return; }
          alert('새 시간: ' + d + ' ' + t + '\n캘린더의 ✅ 확정 버튼을 눌러주세요.');
        } catch(e) {
          console.warn('[ph49 cal manual]', e);
          alert('새 시간: ' + d + ' ' + t);
        }
      });
    }
  }

  function ph49Init(){
    ph49PatchSeg();
    setTimeout(ph49PatchSeg, 1500);
    setTimeout(ph49PatchSeg, 4000);

    function attachPipDrag(){
      var pip = document.getElementById('vc-pip-overlay');
      var pipHeader = document.getElementById('vc-pip-header');
      if (pip && pipHeader) {
        ph49AttachTouchDrag(pipHeader, pip);
        ph49RestorePos(pip);
      }
    }
    attachPipDrag();
    setTimeout(attachPipDrag, 1500);

    function rewireToolbars(){
      ph49AddWhiteboardToggle();
      ph49AddFaceToggle();
    }
    rewireToolbars();
    setTimeout(rewireToolbars, 1500);
    document.addEventListener('click', function(e){
      var t = e.target.closest('.tab-btn');
      if (t) setTimeout(rewireToolbars, 200);
    });
    var bodyObs = new MutationObserver(function(){
      if (document.body.classList.contains('vc-in-call')) rewireToolbars();
    });
    bodyObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    ph49KakaoInit();

    var calObs = new MutationObserver(function(){
      if (document.querySelector('.lc-modal:not([data-ph49-cal="1"])')) {
        ph49EnhanceCalendar();
      }
    });
    calObs.observe(document.body, { childList: true, subtree: true });
    var origOpen = window.openLessonChangeModal;
    if (typeof origOpen === 'function') {
      window.openLessonChangeModal = function(){
        var r = origOpen.apply(this, arguments);
        setTimeout(ph49EnhanceCalendar, 250);
        setTimeout(ph49EnhanceCalendar, 800);
        return r;
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ph49Init);
  } else {
    ph49Init();
  }
})();

