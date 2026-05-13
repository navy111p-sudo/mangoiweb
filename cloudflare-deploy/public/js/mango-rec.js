

/**
 * mango-rec.js v2 — 화상 수업 녹화 (교사 클라이언트 사이드)
 *  - canvas로 모든 영상 타일을 합성 + WebAudio로 모든 오디오 믹스
 *  - MediaRecorder(webm/vp8+opus)로 녹화
 *  - R2 multipart 스트리밍 업로드 (5MB 버퍼링)
 *  - 녹화 시작/종료 시 D1에 메타데이터 저장
 *  - 로컬 다운로드도 동시에 수행
 *  - 미동의 참가자가 있으면 빨간 경고 표시
 */
(function () {
  if (!window.MangoV3) return console.warn('mango.js 먼저 로드되어야 합니다');
  const M = window.MangoV3;
 
  let isRecording = false;
  let _recStartInFlight = false; // 녹화 초기화(DB insert + R2 create) 진행 중 가드
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingId = null;
  let startedAt = 0;
  let composeCanvas = null;
  let composeCtx = null;
  let composeRafId = null;
  let audioCtx = null;
  let audioDest = null;
  let recBadge = null;
  let isAutoMode = false;  // 자동 녹화 모드 여부
 
  // R2 multipart 상태
  let r2Key = null;
  let r2UploadId = null;
  let r2Parts = [];
  let r2PartNumber = 0;
  let r2TotalBytes = 0;
  let r2UploadQueue = Promise.resolve();
  let r2InitDone = false;
  let chunkBuffer = [];
  let chunkBufferSize = 0;
  const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB
 
  function getRoomMembers() {
    const myId = (typeof vcUserId !== 'undefined' ? vcUserId : 'me');
    const myName = (typeof vcUsername !== 'undefined' ? vcUsername : '교사');
    const peers = (typeof vcPeerConnections !== 'undefined' ? vcPeerConnections : {}) || {};
    const ids = [myId, ...Object.keys(peers)];
    const names = { [myId]: myName };
    Object.keys(peers).forEach(uid => {
      const labelEl = document.getElementById(`vc-label-${uid}`);
      names[uid] = labelEl ? labelEl.textContent.replace(/\s*\(.*\)$/, '') : uid;
    });
    return { ids, names };
  }
 
  // 원격 참가자용 숨겨진 비디오 요소 캐시 (WebRTC 스트림 직접 렌더링용)
  const _peerVideoCache = {};
 
  function collectVideos() {
    const els = [];
    const capturedPeerIds = new Set();
 
    // ─── 방법 1: DOM에서 모든 video 요소 수집 ───
    // 1-a) 내 비디오
    const local = document.getElementById('vc-local-video');
    if (local) {
      const localLabel = document.getElementById('vc-local-label');
      els.push({ el: local, label: localLabel ? localLabel.textContent : '나' });
    }
 
    // 1-b) 화면에 보이는 모든 원격 참가자 video-box
    const grid = document.getElementById('vc-video-grid');
    if (grid) {
      grid.querySelectorAll('.video-box').forEach(box => {
        // 내 비디오 박스는 이미 위에서 처리
        if (box.id === 'vc-local-box') return;
        const v = box.querySelector('video');
        if (!v) return;
        const label = box.querySelector('.video-label');
        els.push({ el: v, label: label ? label.textContent : '참가자' });
        // 이 userId는 이미 DOM에서 캡처됨
        const peerId = box.id.replace('vc-video-', '');
        if (peerId) capturedPeerIds.add(peerId);
      });
    }
 
    // 분리(detached)된 플로팅 비디오
    document.querySelectorAll('.video-box.detached').forEach(box => {
      if (box.id === 'vc-local-box') return;
      const v = box.querySelector('video');
      if (!v) return;
      const label = box.querySelector('.video-label');
      const peerId = box.id.replace('vc-video-', '');
      if (peerId && !capturedPeerIds.has(peerId)) {
        els.push({ el: v, label: label ? label.textContent : '참가자' });
        capturedPeerIds.add(peerId);
      }
    });
 
    // ─── 방법 2: WebRTC 연결에서 직접 스트림 가져오기 ───
    // DOM에서 못 찾은 참가자가 있으면 PeerConnection에서 직접 비디오 트랙을 꺼내서
    // 숨겨진 <video>에 연결해서 캡처
    const peers = (typeof vcPeerConnections !== 'undefined' ? vcPeerConnections : null);
    if (peers) {
      Object.keys(peers).forEach(peerId => {
        if (capturedPeerIds.has(peerId)) return; // 이미 DOM에서 캡처됨
 
        const pc = peers[peerId];
        if (!pc || pc.connectionState === 'closed') return;
 
        // PeerConnection에서 비디오 트랙 추출
        const videoTracks = [];
        try {
          pc.getReceivers().forEach(r => {
            if (r.track && r.track.kind === 'video' && r.track.readyState === 'live') {
              videoTracks.push(r.track);
            }
          });
        } catch (e) {}
 
        if (videoTracks.length === 0) return;
 
        // 숨겨진 video 요소 생성/재사용
        if (!_peerVideoCache[peerId]) {
          const hiddenVideo = document.createElement('video');
          hiddenVideo.autoplay = true;
          hiddenVideo.playsInline = true;
          hiddenVideo.muted = true;
          hiddenVideo.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
          document.body.appendChild(hiddenVideo);
          _peerVideoCache[peerId] = hiddenVideo;
        }
        const cachedVideo = _peerVideoCache[peerId];
        const stream = new MediaStream(videoTracks);
        if (cachedVideo.srcObject !== stream) {
          cachedVideo.srcObject = stream;
          cachedVideo.play().catch(() => {});
        }
 
        // 이름 찾기: DOM에서 라벨 요소 검색
        let peerName = '참가자';
        const labelEl = document.getElementById('vc-label-' + peerId);
        if (labelEl) peerName = labelEl.textContent;
        else {
          const box = document.getElementById('vc-video-' + peerId);
          if (box) {
            const l = box.querySelector('.video-label');
            if (l) peerName = l.textContent;
          }
        }
 
        els.push({ el: cachedVideo, label: peerName });
        capturedPeerIds.add(peerId);
      });
    }
 
    // 디버그: 참가자 수 로그 (10초에 한 번)
    if (!collectVideos._lastLog || Date.now() - collectVideos._lastLog > 10000) {
      console.log('[mango-rec] 캡처 참가자:', els.length, '명', els.map(e => e.label).join(', '));
      collectVideos._lastLog = Date.now();
    }
 
    return els;
  }
 
  function collectAudioTracks() {
    const tracks = [];
    // 1) 내 마이크
    if (typeof vcLocalStream !== 'undefined' && vcLocalStream) {
      vcLocalStream.getAudioTracks().forEach(t => tracks.push({ stream: vcLocalStream, track: t }));
    }
    // 2) 모든 원격 참가자 (교사+학생)의 오디오
    const peers = (typeof vcPeerConnections !== 'undefined' ? vcPeerConnections : {}) || {};
    Object.values(peers).forEach(pc => {
      pc.getReceivers().forEach(r => {
        if (r.track && r.track.kind === 'audio') {
          tracks.push({ stream: new MediaStream([r.track]), track: r.track });
        }
      });
    });
    // 3) 동영상 탭에서 재생 중인 영상의 오디오
    ['vp-stage', 'vp-floating-body'].forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        const videoEl = container.querySelector('video');
        if (videoEl && videoEl.captureStream) {
          try {
            const vStream = videoEl.captureStream();
            vStream.getAudioTracks().forEach(t => tracks.push({ stream: vStream, track: t }));
          } catch (e) { /* cross-origin 등 무시 */ }
        }
      }
    });
    return tracks;
  }
 
  function startCanvasCompose() {
    composeCanvas = document.createElement('canvas');
    composeCanvas.width = 1920;
    composeCanvas.height = 1080;
    composeCtx = composeCanvas.getContext('2d');
 
    // 레이아웃 상수: 좌측(비디오) 30%, 우측(콘텐츠) 70%
    const VID_W = Math.floor(composeCanvas.width * 0.3);   // 576px
    const CONTENT_X = VID_W;
    const CONTENT_W = composeCanvas.width - VID_W;          // 1344px
    const H = composeCanvas.height;                          // 1080px
 
    function getActiveTab() {
      // 현재 활성 탭 판별
      const panels = ['whiteboard', 'pdf', 'video'];
      for (const name of panels) {
        const panel = document.getElementById('tab-' + name);
        if (panel && (panel.classList.contains('active') || panel.style.display === 'flex')) return name;
      }
      return 'whiteboard';
    }
 
    function drawVideos(ctx, x, y, w, h) {
      const videos = collectVideos();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, y, w, h);
      if (videos.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = '18px sans-serif';
        ctx.fillText('참가자 대기 중...', x + 16, y + 40);
        return;
      }
      // 세로 스택: 각 참가자를 위아래로 배치
      const tileH = Math.floor(h / videos.length);
      videos.forEach((v, i) => {
        const ty = y + i * tileH;
        try {
          // 비디오 비율 유지하며 영역에 맞춤 (cover)
          const vw = v.el.videoWidth || w;
          const vh = v.el.videoHeight || tileH;
          const scale = Math.max(w / vw, tileH / vh);
          const sw = vw * scale;
          const sh = vh * scale;
          const sx = x + (w - sw) / 2;
          const sy = ty + (tileH - sh) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, ty, w, tileH);
          ctx.clip();
          ctx.drawImage(v.el, sx, sy, sw, sh);
          ctx.restore();
        } catch (e) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(x, ty, w, tileH);
        }
        // 이름 라벨
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, ty + tileH - 26, w, 26);
        ctx.fillStyle = '#fff';
        ctx.font = '13px -apple-system,"맑은 고딕",sans-serif';
        ctx.fillText(v.label, x + 6, ty + tileH - 8);
        // 구분선
        if (i < videos.length - 1) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, ty + tileH - 1, w, 2);
        }
      });
    }
 
    function drawWhiteboard(ctx, x, y, w, h) {
      const wbCanvas = document.getElementById('wb-canvas');
      if (wbCanvas && wbCanvas.width > 0 && wbCanvas.height > 0) {
        // 흰색 배경 + 칠판 내용 비율 맞춰 그리기
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, y, w, h);
        const scale = Math.min(w / wbCanvas.width, h / wbCanvas.height);
        const dw = wbCanvas.width * scale;
        const dh = wbCanvas.height * scale;
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        try { ctx.drawImage(wbCanvas, dx, dy, dw, dh); } catch (e) {}
      } else {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '20px sans-serif';
        ctx.fillText('🖊 칠판', x + 20, y + 40);
      }
    }
 
    function drawPdf(ctx, x, y, w, h) {
      const pdfCanvas = document.getElementById('pdf-canvas');
      const annoCanvas = document.getElementById('pdf-anno');
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(x, y, w, h);
      if (pdfCanvas && pdfCanvas.width > 0 && pdfCanvas.height > 0) {
        // PDF 원본 + 주석 레이어를 합성
        const scale = Math.min(w / pdfCanvas.width, h / pdfCanvas.height);
        const dw = pdfCanvas.width * scale;
        const dh = pdfCanvas.height * scale;
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        try { ctx.drawImage(pdfCanvas, dx, dy, dw, dh); } catch (e) {}
        // 주석 오버레이
        if (annoCanvas && annoCanvas.width > 0 && annoCanvas.height > 0) {
          try { ctx.drawImage(annoCanvas, dx, dy, dw, dh); } catch (e) {}
        }
        // 2페이지 보기인 경우
        const pdfCanvas2 = document.getElementById('pdf-canvas-2');
        const annoCanvas2 = document.getElementById('pdf-anno-2');
        const wrap2 = document.getElementById('pdf-page-wrap-2');
        if (wrap2 && wrap2.style.display !== 'none' && pdfCanvas2 && pdfCanvas2.width > 0) {
          // 두 페이지를 좌우로 배치
          const scale2 = Math.min((w / 2) / pdfCanvas.width, h / pdfCanvas.height);
          const dw2 = pdfCanvas.width * scale2;
          const dh2 = pdfCanvas.height * scale2;
          // 왼쪽 페이지
          const dx1 = x + (w / 2 - dw2) / 2;
          const dy1 = y + (h - dh2) / 2;
          ctx.fillRect(x, y, w, h); // 배경 초기화
          try { ctx.drawImage(pdfCanvas, dx1, dy1, dw2, dh2); } catch (e) {}
          if (annoCanvas) try { ctx.drawImage(annoCanvas, dx1, dy1, dw2, dh2); } catch (e) {}
          // 오른쪽 페이지
          const dx2r = x + w / 2 + (w / 2 - dw2) / 2;
          try { ctx.drawImage(pdfCanvas2, dx2r, dy1, dw2, dh2); } catch (e) {}
          if (annoCanvas2) try { ctx.drawImage(annoCanvas2, dx2r, dy1, dw2, dh2); } catch (e) {}
        }
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '20px sans-serif';
        ctx.fillText('📄 PDF 없음', x + 20, y + 40);
      }
    }
 
    function drawVideo(ctx, x, y, w, h) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, y, w, h);
      // 동영상 탭의 video/iframe 캡처 시도
      const stage = document.getElementById('vp-stage');
      if (stage) {
        const videoEl = stage.querySelector('video');
        if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
          const scale = Math.min(w / videoEl.videoWidth, h / videoEl.videoHeight);
          const dw = videoEl.videoWidth * scale;
          const dh = videoEl.videoHeight * scale;
          const dx = x + (w - dw) / 2;
          const dy = y + (h - dh) / 2;
          try { ctx.drawImage(videoEl, dx, dy, dw, dh); } catch (e) {}
          return;
        }
      }
      // 플로팅 미니 플레이어 체크
      const floating = document.getElementById('vp-floating');
      if (floating && floating.style.display !== 'none') {
        const fVideo = floating.querySelector('video');
        if (fVideo && fVideo.readyState >= 2 && fVideo.videoWidth > 0) {
          const scale = Math.min(w / fVideo.videoWidth, h / fVideo.videoHeight);
          const dw = fVideo.videoWidth * scale;
          const dh = fVideo.videoHeight * scale;
          const dx = x + (w - dw) / 2;
          const dy = y + (h - dh) / 2;
          try { ctx.drawImage(fVideo, dx, dy, dw, dh); } catch (e) {}
          return;
        }
      }
      ctx.fillStyle = '#475569';
      ctx.font = '20px sans-serif';
      ctx.fillText('📹 동영상 없음', x + 20, y + 40);
    }
 
    function draw() {
      const ctx = composeCtx;
      // 배경
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, composeCanvas.width, H);
 
      // 좌측: 참가자 비디오
      drawVideos(ctx, 0, 0, VID_W, H);
 
      // 구분선
      ctx.fillStyle = '#334155';
      ctx.fillRect(VID_W, 0, 2, H);
 
      // 우측: 활성 탭 콘텐츠
      const tab = getActiveTab();
      // 탭 이름 표시
      const tabLabels = { whiteboard: '🖊 칠판', pdf: '📄 PDF/교재', video: '📹 동영상' };
      const TAB_BAR_H = 32;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(CONTENT_X + 2, 0, CONTENT_W - 2, TAB_BAR_H);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 15px -apple-system,"맑은 고딕",sans-serif';
      ctx.fillText(tabLabels[tab] || tab, CONTENT_X + 14, 22);
 
      // 탭 내용
      const contentY = TAB_BAR_H;
      const contentH = H - TAB_BAR_H;
      switch (tab) {
        case 'whiteboard': drawWhiteboard(ctx, CONTENT_X + 2, contentY, CONTENT_W - 2, contentH); break;
        case 'pdf':        drawPdf(ctx, CONTENT_X + 2, contentY, CONTENT_W - 2, contentH); break;
        case 'video':      drawVideo(ctx, CONTENT_X + 2, contentY, CONTENT_W - 2, contentH); break;
      }
 
      // 플로팅 미니 동영상이 칠판/PDF 위에 떠 있는 경우에도 캡처
      if (tab !== 'video') {
        const floating = document.getElementById('vp-floating');
        if (floating && floating.style.display !== 'none') {
          const fVideo = floating.querySelector('video');
          if (fVideo && fVideo.readyState >= 2 && fVideo.videoWidth > 0) {
            // 우측 하단에 미니 동영상 오버레이 (200x112)
            const mw = 240, mh = 135;
            const mx = composeCanvas.width - mw - 10;
            const my = H - mh - 10;
            ctx.fillStyle = '#000';
            ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
            try { ctx.drawImage(fVideo, mx, my, mw, mh); } catch (e) {}
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(mx, my, 60, 18);
            ctx.fillStyle = '#fff';
            ctx.font = '11px sans-serif';
            ctx.fillText('📹 동영상', mx + 4, my + 13);
          }
        }
      }
 
      // REC 타임코드 + 참가자 수
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const vidCount = collectVideos().length;
      ctx.fillStyle = 'rgba(220,38,38,0.9)';
      ctx.fillRect(composeCanvas.width - 200, 10, 190, 32);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('● REC ' + mm + ':' + ss + '  👤' + vidCount + '명', composeCanvas.width - 190, 31);
 
      composeRafId = requestAnimationFrame(draw);
    }
    draw();
    return composeCanvas.captureStream(15);
  }
 
  function startAudioMix() {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    audioDest = audioCtx.createMediaStreamDestination();
    collectAudioTracks().forEach(({ stream }) => {
      try {
        const src = audioCtx.createMediaStreamSource(stream);
        src.connect(audioDest);
      } catch (e) { console.warn('오디오 믹스 실패', e); }
    });
    return audioDest.stream;
  }
 
  function showRecBadge() {
    if (recBadge) return;
    recBadge = document.createElement('div');
    recBadge.id = 'mango-rec-badge';
    // 기본(데스크탑) 스타일: CSS 클래스로 위임해 모바일 media query로 축소 가능하게 함
    recBadge.innerHTML = '<span class="mango-rec-dot"></span><span id="mango-rec-time" class="mango-rec-time-text">REC 00:00</span>';
    // 모바일 최소화 시 클릭하면 펼쳤다 접었다 하는 토글
    recBadge.addEventListener('click', () => {
      recBadge.classList.toggle('mango-rec-expanded');
    });
    document.body.appendChild(recBadge);
 
    if (!document.getElementById('mango-rec-style')) {
      const s = document.createElement('style');
      s.id = 'mango-rec-style';
      s.textContent = [
        '@keyframes mango-rec-blink{0%,100%{opacity:1}50%{opacity:0.3}}',
        // 기본(데스크탑) 풀 배지
        '#mango-rec-badge{position:fixed;top:60px;right:16px;background:#dc2626;color:#fff;padding:8px 14px;border-radius:20px;font-weight:600;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(220,38,38,0.4);display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;transition:all 0.2s ease;}',
        '#mango-rec-badge .mango-rec-dot{width:8px;height:8px;background:#fff;border-radius:50%;animation:mango-rec-blink 1s infinite;display:inline-block;}',
        '#mango-rec-badge .mango-rec-time-text{display:inline;}',
        // 모바일: 작은 원형 점으로 축소 (시간 텍스트 숨김), 탭하면 확장
        '@media (max-width: 900px){' +
          '#mango-rec-badge{top:auto;bottom:calc(env(safe-area-inset-bottom, 0) + 70px);right:8px;padding:6px;border-radius:50%;width:22px;height:22px;box-shadow:0 2px 6px rgba(220,38,38,0.5);gap:0;opacity:0.75;}' +
          '#mango-rec-badge .mango-rec-time-text{display:none;}' +
          '#mango-rec-badge.mango-rec-expanded{width:auto;height:auto;border-radius:20px;padding:6px 12px;opacity:1;gap:6px;}' +
          '#mango-rec-badge.mango-rec-expanded .mango-rec-time-text{display:inline;font-size:12px;}' +
          // 툴바 REC 버튼도 모바일에서는 컴팩트
          '#mango-rec-btn{padding:4px 8px !important;font-size:14px !important;min-width:auto !important;}' +
        '}'
      ].join('\n');
      document.head.appendChild(s);
    }
    setInterval(() => {
      if (!isRecording) return;
      const t = document.getElementById('mango-rec-time');
      if (t) {
        const e = Math.floor((Date.now() - startedAt) / 1000);
        t.textContent = 'REC ' + String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0');
      }
    }, 1000);
  }
  function hideRecBadge() {
    if (recBadge) { recBadge.remove(); recBadge = null; }
  }
 
  // ── R2 multipart 업로드 함수들 ──
 
  function bufferChunk(blob) {
    if (!r2InitDone) return;
    chunkBuffer.push(blob);
    chunkBufferSize += blob.size;
    if (chunkBufferSize >= MIN_PART_SIZE) {
      flushBuffer();
    }
  }
 
  function flushBuffer() {
    if (chunkBuffer.length === 0) return;
    const combined = new Blob(chunkBuffer, { type: 'video/webm' });
    chunkBuffer = [];
    chunkBufferSize = 0;
    enqueuePart(combined);
  }
 
  function enqueuePart(blob) {
    if (!r2InitDone || !r2Key || !r2UploadId) return;
    r2PartNumber += 1;
    const pn = r2PartNumber;
    r2TotalBytes += blob.size;
 
    r2UploadQueue = r2UploadQueue.then(async () => {
      const url = '/api/recordings/upload/part?key=' + encodeURIComponent(r2Key) +
                  '&upload_id=' + encodeURIComponent(r2UploadId) +
                  '&part=' + pn;
      try {
        const res = await fetch(url, { method: 'PUT', body: blob });
        if (!res.ok) {
          console.error('[mango-rec] 파트 업로드 실패:', pn, res.status);
          return;
        }
        const data = await res.json();
        r2Parts.push({ partNumber: pn, etag: data.etag });
        console.log('[mango-rec] R2 파트 업로드:', pn, (blob.size / 1048576).toFixed(1) + 'MB', '누적:', (r2TotalBytes / 1048576).toFixed(1) + 'MB');
      } catch (err) {
        console.error('[mango-rec] 파트 업로드 에러:', pn, err);
      }
    });
  }
 
  async function completeR2Upload(duration) {
    // 남은 버퍼 flush
    if (chunkBuffer.length > 0) {
      const lastBlob = new Blob(chunkBuffer, { type: 'video/webm' });
      chunkBuffer = [];
      chunkBufferSize = 0;
      enqueuePart(lastBlob);
    }
 
    // 큐 대기
    try { await r2UploadQueue; } catch (e) { console.warn('[mango-rec] R2 큐 에러:', e); }
 
    if (r2Parts.length > 0 && r2Key && r2UploadId) {
      r2Parts.sort((a, b) => a.partNumber - b.partNumber);
      try {
        const res = await fetch('/api/recordings/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recording_id: recordingId,
            key: r2Key,
            upload_id: r2UploadId,
            parts: r2Parts,
            duration_ms: duration,
            size_bytes: r2TotalBytes
          })
        }).then(r => r.json());
        console.log('[mango-rec] R2 complete:', res);
        return res.ok;
      } catch (err) {
        console.error('[mango-rec] R2 complete 에러:', err);
        return false;
      }
    }
    return false;
  }
 
  function resetR2State() {
    r2Key = null;
    r2UploadId = null;
    r2Parts = [];
    r2PartNumber = 0;
    r2TotalBytes = 0;
    r2UploadQueue = Promise.resolve();
    r2InitDone = false;
    chunkBuffer = [];
    chunkBufferSize = 0;
  }
 
  function onBeforeUnload() {
    if (!r2Key || !r2UploadId || !recordingId) return;
    if (r2Parts.length > 0) {
      try {
        r2Parts.sort((a, b) => a.partNumber - b.partNumber);
        navigator.sendBeacon('/api/recordings/upload/complete',
          new Blob([JSON.stringify({
            recording_id: recordingId,
            key: r2Key,
            upload_id: r2UploadId,
            parts: r2Parts,
            duration_ms: Date.now() - startedAt,
            size_bytes: r2TotalBytes
          })], { type: 'application/json' })
        );
      } catch (e) {
        try {
          navigator.sendBeacon('/api/recordings/upload/abort',
            new Blob([JSON.stringify({ recording_id: recordingId, key: r2Key, upload_id: r2UploadId })], { type: 'application/json' })
          );
        } catch (_) {}
      }
    } else {
      try {
        navigator.sendBeacon('/api/recordings/upload/abort',
          new Blob([JSON.stringify({ recording_id: recordingId, key: r2Key, upload_id: r2UploadId })], { type: 'application/json' })
        );
      } catch (_) {}
    }
  }
 
  // ── 녹화 시작/종료 ──
 
  // auto: true면 자동 녹화 (팝업/alert 없이 진행)
  async function startRecording(opts) {
    const auto = opts && opts.auto;
    // 재진입 방지: isRecording은 MediaRecorder.start() 이후에야 true가 되므로,
    // 그 사이(DB INSERT/R2 create 대기 중)에 두 번째 호출이 들어오면 중복 DB 행이 생김.
    // _recStartInFlight 를 시작 시점에 즉시 세팅해 race를 차단한다.
    if (isRecording || _recStartInFlight) {
      console.log('[mango-rec] 녹화 시작 요청 무시 (이미 진행 중)', { isRecording, inFlight: _recStartInFlight });
      return;
    }
    _recStartInFlight = true;
    try {
    const { ids, names } = getRoomMembers();
    if (ids.length < 1) {
      if (!auto) alert('참가자가 없습니다.');
      return;
    }
 
    // DB 메타 생성
    const startRes = await M.api('/api/recordings/start', {
      room_id: (typeof vcRoomId !== 'undefined' ? vcRoomId : ''),
      teacher_id: M.getUserId(),
      teacher_name: (typeof vcUsername !== 'undefined' ? vcUsername : ''),
      participant_ids: ids,
      participant_names: ids.map(id => names[id])
    });
 
    if (!startRes?.ok) {
      if (!auto) alert('녹화 시작 실패');
      console.warn('[mango-rec] 녹화 시작 실패:', startRes);
      return;
    }
    // 자동 녹화 시 동의 팝업 건너뜀 (수업 녹화는 필수이므로)
    if (!auto) {
      const nonConsented = startRes.non_consented || [];
      const myId = M.getUserId();
      const realNonConsented = nonConsented.filter(id => id !== myId);
      if (realNonConsented.length > 0) {
        const nonNames = realNonConsented.map(id => names[id] || id).join(', ');
        const proceed = confirm(`⚠️ 다음 참가자가 녹화에 동의하지 않았습니다:\n\n${nonNames}\n\n그래도 녹화를 시작하시겠습니까?\n(법적 책임은 교사에게 있습니다)`);
        if (!proceed) {
          await M.api('/api/recordings/stop', { recording_id: startRes.recording_id, duration_ms: 0, size_bytes: 0 });
          return;
        }
      }
    }
 
    recordingId = startRes.recording_id;
    startedAt = Date.now();
    recordedChunks = [];
    isAutoMode = !!auto;
 
    // R2 multipart 업로드 시작
    resetR2State();
    try {
      const createRes = await fetch('/api/recordings/upload/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_id: recordingId,
          room_id: (typeof vcRoomId !== 'undefined' ? vcRoomId : '')
        })
      }).then(r => r.json());
 
      if (createRes.ok) {
        r2Key = createRes.key;
        r2UploadId = createRes.upload_id;
        r2InitDone = true;
        console.log('[mango-rec] R2 multipart 시작:', { key: r2Key, uploadId: r2UploadId });
      } else {
        console.warn('[mango-rec] R2 multipart 생성 실패 (로컬만 녹화):', createRes);
      }
    } catch (err) {
      console.warn('[mango-rec] R2 multipart 생성 에러 (로컬만 녹화):', err);
    }
 
    // 참가자에게 녹화 알림
    try {
      const conn = (typeof vcConn !== 'undefined' ? vcConn : null);
      if (conn && conn.readyState === 1) {
        conn.send(JSON.stringify({
          type: 'chat-message',
          data: { username: '시스템', message: '🔴 녹화가 시작되었습니다. (동의: ' + startRes.consented_count + '/' + startRes.total_participants + '명)' }
        }));
      }
    } catch (_) {}
 
    const videoStream = startCanvasCompose();
    const audioStream = startAudioMix();
    const combined = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioStream.getAudioTracks()
    ]);
 
    let mime = 'video/webm;codecs=vp8,opus';
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
    mediaRecorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
 
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
        // R2에도 버퍼링
        bufferChunk(e.data);
      }
    };
 
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const duration = Date.now() - startedAt;
 
      // R2 업로드 완료
      let r2Success = false;
      if (r2InitDone) {
        try {
          r2Success = await completeR2Upload(duration);
        } catch (e) {
          console.error('[mango-rec] R2 업로드 완료 에러:', e);
        }
      }
 
      // 자동 모드에서는 로컬 다운로드 안 함 (R2에만 저장)
      // 수동 모드에서는 로컬 다운로드도 함께 수행
      if (!isAutoMode) {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `mango_rec_${(typeof vcRoomId !== 'undefined' ? vcRoomId : 'room')}_${new Date(startedAt).toISOString().slice(0,19).replace(/[:T]/g,'-')}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(downloadUrl);
      }
 
      // DB 메타데이터 종료 기록
      try {
        await M.api('/api/recordings/stop', {
          recording_id: recordingId,
          duration_ms: duration,
          size_bytes: blob.size
        });
      } catch (e) { console.warn('[mango-rec] DB stop 에러:', e); }
 
      console.log('[mango-rec] 녹화 완료:', { duration, size: blob.size, r2Success, auto: isAutoMode });
      if (!isAutoMode) {
        const r2Msg = r2Success ? '\n☁️ 클라우드 저장 완료' : '\n⚠️ 클라우드 저장 실패 (로컬 파일은 다운로드됨)';
        alert('녹화 완료\n용량: ' + (blob.size / (1024 * 1024)).toFixed(1) + 'MB\n시간: ' + Math.round(duration / 1000) + '초' + r2Msg);
      }
 
      // 상태 초기화
      resetR2State();
      window.removeEventListener('beforeunload', onBeforeUnload);
 
      // stopRecording() 호출자의 await를 resolve
      if (typeof _stopResolver === 'function') {
        const r = _stopResolver;
        _stopResolver = null;
        try { r({ success: true, r2Success, duration, size: blob.size }); } catch (_) {}
      }
    };
 
    mediaRecorder.start(5000); // 5초 간격 (R2 업로드와 동기화)
    isRecording = true;
    showRecBadge();
    updateRecButton();
    window.addEventListener('beforeunload', onBeforeUnload);
    } finally {
      // 성공/실패와 무관하게 in-flight 플래그 해제 — 다음 시도가 가능해야 함
      _recStartInFlight = false;
    }
  }
 
  // stopRecording()이 R2 업로드 완료까지 기다리도록 Promise 기반으로 구현
  let _stopResolver = null;
 
  function stopRecording() {
    if (!isRecording) return Promise.resolve({ success: false, reason: 'not-recording' });
    isRecording = false;
    if (composeRafId) cancelAnimationFrame(composeRafId);
    if (audioCtx) try { audioCtx.close(); } catch (_) {}
    audioCtx = null;
    audioDest = null;
    composeCanvas = null;
    composeCtx = null;
    hideRecBadge();
    updateRecButton();
    try {
      const conn = (typeof vcConn !== 'undefined' ? vcConn : null);
      if (conn && conn.readyState === 1) {
        conn.send(JSON.stringify({
          type: 'chat-message',
          data: { username: '시스템', message: '⏹ 녹화가 종료되었습니다.' }
        }));
      }
    } catch (_) {}
 
    // MediaRecorder.stop()을 호출하고 onstop 이벤트 → R2 complete 완료까지 await
    return new Promise((resolve) => {
      _stopResolver = resolve;
      try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          // 안전 타임아웃: onstop이 15초 내에 resolve 안되면 강제 진행
          setTimeout(() => {
            if (_stopResolver === resolve) {
              console.warn('[mango-rec] stopRecording 타임아웃 — 강제 resolve');
              _stopResolver = null;
              resolve({ success: false, reason: 'timeout' });
            }
          }, 15000);
        } else {
          resolve({ success: false, reason: 'inactive' });
        }
      } catch (e) {
        console.warn('[mango-rec] stop 예외:', e);
        _stopResolver = null;
        resolve({ success: false, reason: 'exception', error: String(e) });
      }
    });
  }
 
  function updateRecButton() {
    const btn = document.getElementById('mango-rec-btn');
    if (!btn) return;
    btn.textContent = isRecording ? '⏹' : '🔴';
    btn.title = isRecording ? '녹화 중지' : '녹화 시작';
    btn.style.background = isRecording ? '#dc2626' : '';
    btn.style.color = isRecording ? '#fff' : '';
  }
 
  function injectRecButton() {
    const toolbar = document.querySelector('#view-videocall-call .toolbar-center');
    if (!toolbar || toolbar.querySelector('#mango-rec-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'mango-rec-btn';
    btn.className = 'ctrl-btn on';
    btn.title = '녹화 시작';
    btn.textContent = '🔴';
    btn.onclick = () => { isRecording ? stopRecording() : startRecording(); };
    toolbar.appendChild(btn);
  }
 
  const origInjectToolbar = M._injectExtra || (() => {});
  M._injectRec = injectRecButton;
 
  // ── 자동 녹화 ──
  // 수업 화면이 활성화되면 자동으로 녹화 시작, 나가면 자동 종료
  let autoRecStarted = false;   // 이번 세션에서 자동녹화가 시작됐는지
  let autoRecPending = false;   // 녹화 시작 대기 중(딜레이)
 
  setInterval(() => {
    const view = document.getElementById('view-videocall-call');
    const inCall = document.body.classList.contains('vc-in-call');
 
    if (view && view.style.display !== 'none') {
      injectRecButton();
 
      // 수업 뷰에 있고, 아직 녹화 안 했으면 자동 시작
      if (inCall && !isRecording && !autoRecStarted && !autoRecPending) {
        autoRecPending = true;
        // 미디어 스트림 안정화를 위해 3초 대기 후 시작
        setTimeout(async () => {
          autoRecPending = false;
          // 중복 트리거 방지: autoRecStarted 도 함께 체크하고, startRecording 호출 '이전에'
          // 즉시 true 로 세팅해서 2초 간격 폴링이 한 번 더 트리거되지 않도록 막는다.
          if (!isRecording && !autoRecStarted && document.body.classList.contains('vc-in-call')) {
            autoRecStarted = true;
            console.log('[mango-rec] 자동 녹화 시작');
            try {
              await startRecording({ auto: true });
            } catch (e) {
              console.warn('[mango-rec] 자동 녹화 시작 실패:', e);
              autoRecStarted = false; // 실패 시엔 다음 폴링 때 재시도 가능하게 되돌림
            }
          }
        }, 3000);
      }
    }
 
    // 수업에서 나갔으면 자동녹화 플래그 리셋
    if (!inCall && autoRecStarted) {
      autoRecStarted = false;
    }
  }, 2000);
 
  // vcLeaveRoom 후킹 — 나가기 버튼 클릭 시 자동으로 녹화 종료
  function hookVcLeave() {
    if (typeof window.vcLeaveRoom !== 'function') return false;
    if (window._vcLeaveHooked) return true;
    const origLeave = window.vcLeaveRoom;
    window.vcLeaveRoom = async function () {
      // 녹화 중이면 먼저 종료하고 R2 업로드 완료까지 대기
      if (isRecording) {
        console.log('[mango-rec] 수업 종료 → 녹화 자동 중지 (업로드 완료 대기)');
        try {
          const result = await stopRecording();
          console.log('[mango-rec] 녹화 종료 결과:', result);
        } catch (e) {
          console.warn('[mango-rec] 녹화 종료 중 예외:', e);
        }
      }
      return origLeave.apply(this, arguments);
    };
    window._vcLeaveHooked = true;
    return true;
  }
 
  // vcLeaveRoom이 아직 정의 안 됐을 수 있으므로 주기적으로 후킹 시도
  const hookInterval = setInterval(() => {
    if (hookVcLeave()) clearInterval(hookInterval);
  }, 1000);
 
  // beforeunload — 탭/브라우저 닫을 때도 녹화 종료 처리
  window.addEventListener('beforeunload', () => {
    if (isRecording) {
      onBeforeUnload();
    }
  });
 
  M.startRecording = startRecording;
  M.stopRecording = stopRecording;
})();
