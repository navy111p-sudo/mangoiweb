// idx-main-vc.js — 화상수업 부분 (2026-08-23 idx-main.js 에서 분리)
//
//   · 본문은 한 글자도 바꾸지 않았다. 옮기기만 했다.
//   · defer 로 받는다 — 첫 그림을 막지 않는다. 왜 그래도 되는지는 idx-main.js 머리말 참조.
//   ⚠️ 이 파일이 실행되기 «전» 에 vc* 를 부르는 코드를 만들면 안 된다.
//      (파싱 중에 실행되는 자리 = index.html 의 인라인 <script>, defer 아닌 외부 스크립트)
//   ⛔ 로드 순서를 다시 바꾸는 변경은 라이브 장애 전력이 있다 —
//      js/idx-vc-screenmode.js 머리말(2026-07-14 홈 전체 먹통)을 먼저 읽을 것.
function vcEnsureIceServers() {
    const stale = !__vcIceHasTurn || (Date.now() - __vcIceLoadedAt > 4 * 3600 * 1000);
    if (!stale) return Promise.resolve();
    if (!__vcIcePromise) {
        __vcIcePromise = fetchIceServers().finally(() => { __vcIcePromise = null; });
    }
    return Promise.race([__vcIcePromise, new Promise(r => setTimeout(r, 3000))]);
}

window.vcShareTextbook = function(pdfId, url, kind, name, quiet){
  try {
    var shareUrl = url || '';
    if (shareUrl && shareUrl.charAt(0) === '/') shareUrl = location.origin + shareUrl;
    if (vcConn && typeof vcConn.send === 'function') {
      vcConn.send({ type: 'pdf-share', data: { pdfId: pdfId, url: shareUrl, currentPage: 1, kind: kind || '', name: name || '' } });
      // 교사 자신은 이미 교재를 보고 있으므로, 폴링이 재로드하지 않도록 표시 키/URL 을 맞춰둠
      try { var _abs = (shareUrl && shareUrl.charAt(0)==='/') ? location.origin+shareUrl : shareUrl; window._vcShownPdfUrl = _abs; window._vcShownPdfKey = _abs + '|1'; window._vcShownPdfName = name || window._vcShownPdfName || ''; } catch(_){}
      console.log('[vcShareTextbook] ✅ 전송:', shareUrl, kind);
      if (!quiet) { try { if (typeof showToast === 'function') showToast('📤 교재 공유 전송됨 → 학생'); } catch(_){} }
      return true;
    }
    // quiet=입장 자동 공유의 재시도 경로 — WS 가 아직 안 열린 정상 타이밍이므로 경고 토스트 생략
    console.warn('[vcShareTextbook] ❌ vcConn 연결 없음' + (quiet ? ' (자동 공유 재시도 예정)' : ' — 방에 입장했는지 확인'));
    if (!quiet) { try { if (typeof showToast === 'function') showToast('⚠️ 화상수업 연결이 없어 교재 공유 못함(방 재입장 필요)'); } catch(_){} }
    return false;
  } catch(e){ console.warn('[vcShareTextbook] 예외', e); return false; }
};

window.vcApplySharedPdf = function(sUrl, sKind, currentPage, sPid, sName, fromTeacherPush){
  try {
    if (!sUrl) return;
    if (/^blob:/i.test(sUrl)) return;  // 로컬 blob 은 다른 기기에서 열 수 없음
    // 🥭 (2026-07-13) 교사가 교재를 공유 → 세로폰에서 '내용 크게(pip)'로 자동 전환.
    window.__vcPdfShared = true;
    try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}

    /* 🔴 (2026-08-08 마이마이 ⑤) 「교사가 교재를 열었는데 학생은 교재 버튼을 눌러야 보인다」
       [원인] 탭 전환(vcSwitchTab('pdf'))이 이 함수 **한참 아래**에 있어서, 밑의 두 조기반환
              ─ ①「이미 같은 교재/페이지」 ②「같은 교재, 페이지만 다름」 ─ 에 걸리면
              **통째로 건너뛰어졌다.** 학생은 입장할 때 폴링(pdfState)이 이미 그 교재를 받아
              키를 세워 두는 일이 많아, 정작 교사가 교재를 열면 «이미 갖고 있다» 며 아무 일도
              일어나지 않았다 — 화면은 얼굴만 그대로.
       [수정] 교사가 «지금 연» 신호일 때는 조기반환보다 **먼저** 교재를 앞으로 가져온다.
              탭 전환은 idempotent 하고 비용이 없다. 아래 가드의 목적은 «PDF 재로드 방지» 지
              «보여주지 않기» 가 아니었다.
       ⚠️ 폴링에서는 하지 않는다 — 학생이 칠판·게임을 보는 중에 3초마다 교재로 끌려간다. */
    if (fromTeacherPush) {
      try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch(_){}
      try { if (typeof showToast === 'function') showToast('👩‍🏫 선생님이 교재를 열었어요'); } catch(_){}
    }

    if (sUrl.charAt(0) === '/') sUrl = location.origin + sUrl;
    // 교재 이름("[교재] 레슨 / 파일")을 기억 — 화살표가 시퀀스를 서버에서 재구성할 때 책 이름으로 사용
    if (sName) window._vcShownPdfName = sName;
    // 이미 시퀀스를 갖고 있으면 현재 위치도 같이 맞춰둠 (다른 기기가 넘긴 뒤 인덱스 어긋남 방지)
    try { if (typeof pdfSyncSeqIdx === 'function') pdfSyncSeqIdx(sUrl); } catch(_){}
    var pg = currentPage || 1;
    var key = sUrl + '|' + pg;
    if (key === window._vcShownPdfKey) return;  // 이미 같은 교재/페이지 표시 중
    // 같은 교재인데 페이지만 다르면 → 전체 재로드 없이 페이지 이동만(깜빡임 방지)
    if (sUrl === window._vcShownPdfUrl) {
      /* 🔒 (2026-07-29) 방금 내가 넘긴 직후라면 폴링이 끌어가지 못하게 한다.
         [문제] 넘긴 내용이 서버에 아직 반영되지 않았거나 전송이 막힌 경우, 3초 폴링이
                옛 페이지(대개 1페이지)로 되돌려 버렸다. 강사가 "넘겨도 첫 페이지만 보인다"고
                한 증상. 내가 조작 중일 때는 내 화면이 우선이다(5초). */
      if (Date.now() - (window._vcPdfLocalNavAt || 0) < 5000) {
        try { window._pdfSyncShownKey && window._pdfSyncShownKey(); } catch(_){}   // 다른 <script> 블록이라 window 경유
        return;
      }
      window._vcShownPdfKey = key;
      try { if (typeof pdfGoToPage === 'function') pdfGoToPage(pg); else { if (typeof pdfPageNum !== 'undefined') pdfPageNum = pg; if (typeof pdfRender === 'function') pdfRender(); } } catch(_){}
      return;
    }
    var k = sKind || '';
    if (!k) {
      if (/textbook-files|\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(sUrl)) k = 'image';
      else if (/\.pdf(\?|$)/i.test(sUrl)) k = 'pdf';
    }
    window._vcShownPdfKey = key;
    try { if (typeof pdfCurrentId !== 'undefined') pdfCurrentId = sPid || sUrl; } catch(_){}
    try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch(_){}
    try { if (typeof showToast === 'function') showToast('📥 교재 수신 — 여는 중 (' + (k || '자동') + ')'); } catch(_){}
    Promise.resolve(pdfLoad(sUrl, k || undefined)).then(function(){
      window._vcShownPdfUrl = sUrl;  // 현재 교재 URL 기록 (이후 페이지 이동은 재로드 없이)
      try { if (typeof pdfPageNum !== 'undefined') pdfPageNum = currentPage || 1; } catch(_){}
      try { if (typeof pdfRender === 'function') pdfRender(); } catch(_){}
      try { if (typeof showToast === 'function') showToast('✅ 교재 표시됨'); } catch(_){}
    }).catch(function(){
      var alt = (k === 'image') ? 'pdf' : 'image';
      Promise.resolve(pdfLoad(sUrl, alt)).then(function(){
        window._vcShownPdfUrl = sUrl;
        try { if (typeof pdfPageNum !== 'undefined') pdfPageNum = currentPage || 1; } catch(_){}
        try { if (typeof pdfRender === 'function') pdfRender(); } catch(_){}
        try { if (typeof showToast === 'function') showToast('✅ 교재 표시됨(재시도)'); } catch(_){}
      }).catch(function(e2){
        window._vcShownPdfKey = '';  // 실패 시 키 초기화 → 다음 폴링에서 재시도
        try { if (typeof showToast === 'function') showToast('❌ 교재 로드 실패: ' + (e2 && e2.message || e2)); } catch(_){}
      });
    });
  } catch(e){ console.warn('[vcApplySharedPdf]', e); }
};

window.vcStartPdfPoll = function(){
  try {
    // fix (2026-06-02) — 입장할 때마다 '표시 상태'를 초기화. 안 하면 이전 세션의 _vcShownPdfUrl 이 남아
    //   같은 교재가 '이미 표시 중'으로 잘못 판단돼 페이지 이동만 하고 실제 로드를 건너뜀(학생 흰 화면 회귀).
    window._vcShownPdfKey = '';
    window._vcShownPdfUrl = '';
    window._vcShownVideoUrl = '';
    window._vcJoinedRoomId = '';   // ★ (2026-07-20) room-joined 수신 전엔 폴링 미적용 (아래 참조)
    if (window._vcPdfPollTimer) clearInterval(window._vcPdfPollTimer);
    // 입장 직후 즉시 1회 확인(3초 기다리지 않고 바로 교재 표시)
    var _pollOnce = function(){
      try {
        if (!vcRoomId) return;
        // ★ (2026-07-20) WS 입장(room-joined)이 완료되기 전엔 방 미디어 상태를 적용하지 않는다.
        //   서버(DO)가 '첫 입장 시 지난 수업 잔존 pdf/video 상태 정리'를 room-joined 전에 수행하므로,
        //   그 전에 폴링이 먼저 닿으면 이미 지워질 낡은 유튜브/교재가 첫 화면을 한 번 차지할 수 있음.
        if (window._vcJoinedRoomId !== vcRoomId) return;
        // fix (2026-07-13) — /api/room-status 는 보안 잠금(관리자 전용)으로 학생에게 401.
        //   참가자용 공개 미디어 상태 엔드포인트(/api/room-media, PII 없음)로 폴링.
        fetch('/api/room-media/' + encodeURIComponent(vcRoomId), { cache: 'no-store' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if (d && d.pdfState && d.pdfState.url) {
              window.vcApplySharedPdf(d.pdfState.url, d.pdfState.kind, d.pdfState.currentPage, d.pdfState.pdfId, d.pdfState.name);
            }
            // 🎬 공유 중인 동영상도 폴링으로 복구 (WS 메시지를 놓친 학생 자가복구)
            if (d && d.videoState && d.videoState.url) {
              window.vcApplySharedVideo(d.videoState.url);
            }
          }).catch(function(){});
      } catch(_){}
    };
    setTimeout(_pollOnce, 800);
    window._vcPdfPollTimer = setInterval(_pollOnce, 3000);
    console.log('[vcPdfPoll] 시작 — 입장 직후 + 3초마다 방 교재 상태 확인');
  } catch(e){}
};

window.vcStopPdfPoll = function(){
  try { if (window._vcPdfPollTimer) { clearInterval(window._vcPdfPollTimer); window._vcPdfPollTimer = null; } } catch(_){}
};

window.vcApplyContentHints = function (stream) {
    try {
        if (!stream || !stream.getTracks) return;
        stream.getTracks().forEach(function (t) {
            try {
                if (!('contentHint' in t)) return;
                if (t.kind === 'video') { if (!t.contentHint) t.contentHint = 'motion'; }
                else if (t.kind === 'audio') { if (!t.contentHint) t.contentHint = 'speech'; }
            } catch (_) {}
        });
    } catch (_) {}
};

function vcResumeAllVideos() {
    document.querySelectorAll('video').forEach(v => {
        if (v.srcObject && v.paused) {
            const p = v.play();
            if (p && p.catch) p.catch(err => {
                console.warn('[resume] video.play() 실패:', err && err.name);
                // 모바일 무음 자동재생 차단 → 일단 muted 로라도 재생해 검은 화면 방지,
                // 첫 화면 터치 시 원격 음소거 해제(소리 복구)
                try {
                    v.muted = true;
                    const p2 = v.play();
                    if (p2 && p2.catch) p2.catch(()=>{});
                    if (typeof vcArmGestureUnmute === 'function') vcArmGestureUnmute();
                } catch(_) {}
            });
        }
    });
}

async function vcHealLocalMic() {
    try {
        if (!document.body.classList.contains('vc-in-call')) return;
        if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;   // 관찰자는 마이크 없음
        if (!window.vcLocalStream) return;
        const tracks = vcLocalStream.getAudioTracks();
        if (tracks.some(t => t.readyState === 'live')) return;             // 살아있는 트랙 있음 = 정상
        if (!tracks.length) return;                                        // 애초에 마이크가 없던 입장(빈 스트림) — vcToggleMic 경로에 맡김
        const now = Date.now();
        if (now - __vcMicHealAt < 8000) return;                            // 8초 쿨다운(권한 팝업 도배 방지)
        __vcMicHealAt = now;
        console.warn('[mic-heal] 오디오 트랙 전부 ended → 마이크 재획득 시도');
        const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        const saved = (typeof vcSavedMicId === 'function') ? vcSavedMicId() : '';
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: saved ? Object.assign({ deviceId: { ideal: saved } }, base) : base });
        } catch (e1) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = ((typeof vcMicOn === 'undefined' || vcMicOn === null) ? true : !!vcMicOn)
            && !(window.__vcMicLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin');   // 음소거·전체음소거 잠금 존중
        // 죽은 트랙 정리 후 교체
        tracks.forEach(old => { try { old.stop(); } catch(_){} try { vcLocalStream.removeTrack(old); } catch(_){} });
        vcLocalStream.addTrack(newTrack);
        Object.values(vcPeerConnections || {}).forEach(pc => {
            try {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                if (sender) sender.replaceTrack(newTrack).catch(()=>{});
                else pc.addTrack(newTrack, vcLocalStream);
            } catch (e) { console.warn('[mic-heal] sender 교체 실패:', e); }
        });
        // 🔁 (2026-07-24) audio sender 가 아예 없던 피어(권한 없이 입장)는 위 addTrack 만으론
        //   재협상이 일어나지 않아 소리가 계속 안 간다 → 그 피어만 재협상.
        try { window.vcRenegotiateMissing && window.vcRenegotiateMissing('audio'); } catch (_) {}
        console.warn('[mic-heal] ✅ 마이크 자동 복구 완료');
        try { vcAddChatSystem('🎤 마이크가 자동으로 다시 연결됐어요.'); } catch(_) {}
    } catch (e) {
        console.warn('[mic-heal] 재획득 실패(다음 감시 틱에 재시도):', e && e.name);
    }
}

async function vcHealLocalVideo() {
    try {
        if (!document.body.classList.contains('vc-in-call')) { __vcCamMutedTicks = 0; return; }
        if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;          // 관찰자는 카메라 없음
        /* 🖥 (2026-07-30) 화면 공유 중에는 개입 금지 — 지금 보내는 트랙은 '화면'이므로
           카메라가 죽은 것으로 오인해 갈아끼우면 공유가 카메라로 되돌아가 버린다. */
        if (window.__vcScreenSharing) { __vcCamMutedTicks = 0; return; }
        if (!window.vcLocalStream) return;
        if (typeof vcCamOn !== 'undefined' && !vcCamOn) { __vcCamMutedTicks = 0; return; }  // 사용자가 카메라 끔 = 정상
        // 가상배경 켜져 있으면 송출은 합성 캔버스(정상) — 원본 카메라로 갈아끼우면 배경이 깨짐
        if (typeof vcBg !== 'undefined' && vcBg && vcBg.mode && vcBg.mode !== 'off') { __vcCamMutedTicks = 0; return; }
        const tracks = vcLocalStream.getVideoTracks();
        if (!tracks.length) return;                                              // 애초에 카메라 없이 입장
        const live = tracks.find(t => t.readyState === 'live');
        let bad = false;
        if (!live) bad = true;                                                   // 전부 ended = 즉시 복구
        else if (live.muted) { __vcCamMutedTicks++; if (__vcCamMutedTicks >= 3) bad = true; }  // 프레임0 지속
        else { __vcCamMutedTicks = 0; return; }                                  // 정상(프레임 흐름) = 개입 금지
        if (!bad) return;
        const now = Date.now();
        if (now - __vcCamHealAt < 10000) return;                                 // 10초 쿨다운
        __vcCamHealAt = now; __vcCamMutedTicks = 0;
        console.warn('[cam-heal] 송출 영상 트랙 이상(ended/muted) → 카메라 재획득 시도');
        let stream;
        // 📷 (2026-08-06) 사용자가 고른 카메라를 존중한다. 그냥 {video:true} 로 다시 잡으면
        //   자가치유가 돌 때마다 USB 웹캠 → 노트북 내장 카메라로 되돌아간다(사용자 눈엔 '설정이 안 먹음').
        const _pickedCam = (function(){ try { return localStorage.getItem('mangoi_vc_cam_id') || ''; } catch(_){ return ''; } })();
        try { stream = await navigator.mediaDevices.getUserMedia({ video: _pickedCam ? { deviceId: { ideal: _pickedCam } } : true }); }
        catch (e1) { console.warn('[cam-heal] getUserMedia 실패:', e1 && e1.name); return; }
        const newTrack = stream.getVideoTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = (typeof vcCamOn === 'undefined') ? true : !!vcCamOn;   // 카메라 on/off 상태 존중
        // 죽은 트랙 정리 후 교체
        tracks.forEach(old => { try { old.stop(); } catch(_){} try { vcLocalStream.removeTrack(old); } catch(_){} });
        vcLocalStream.addTrack(newTrack);
        // 로컬 미리보기 갱신
        try {
            const lv = document.getElementById('vc-local-video');
            if (lv) { lv.srcObject = vcLocalStream; const p = lv.play(); if (p && p.catch) p.catch(()=>{}); }
        } catch(_){}
        // 모든 피어 sender 교체 (재협상 없이 즉시 복구)
        Object.values(vcPeerConnections || {}).forEach(pc => {
            try {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(newTrack).catch(()=>{});
                else pc.addTrack(newTrack, vcLocalStream);
            } catch (e) { console.warn('[cam-heal] sender 교체 실패:', e); }
        });
        console.warn('[cam-heal] ✅ 카메라 자동 복구 완료');
        try { vcAddChatSystem('📷 카메라가 자동으로 다시 연결됐어요.'); } catch(_){}
    } catch (e) {
        console.warn('[cam-heal] 재획득 실패(다음 틱 재시도):', e && e.name);
    }
}

window.vcShareMyScreen = async function(){
    var en = (typeof getLang === 'function' && getLang() === 'en');
    try {
        /* 🎭 (2026-08-07 Kaye 5번) 칩 노출 판정과 «같은» 정본을 쓴다.
           예전엔 노출은 vcIsTeacherRole 을 OR 로 봤는데 여기는 vcMyRole 정확일치라,
           로비 입장 강사에게는 버튼이 보여도 누르면 "선생님만 쓸 수 있어요"가 떴다. */
        if (!(typeof vcIsStaffNow === 'function' ? vcIsStaffNow()
              : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'))) {
            alert(en ? 'Only teachers can share the screen.' : '화면 공유는 선생님만 사용할 수 있어요.');
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            alert(en ? 'This browser cannot share the screen. Please use Chrome or Edge on a computer.'
                     : '이 브라우저는 화면 공유를 지원하지 않아요. 컴퓨터의 크롬이나 엣지에서 사용해 주세요.');
            return;
        }
        if (window.__vcScreenSharing) { window.vcStopMyScreen(); return; }   // 다시 누르면 중지

        /* 🔊 (2026-08-12 Melca 피드백) audio:true — "유튜브를 공유하면 그림만 가고 소리는 안 간다".
           탭 공유는 «탭 소리 공유» 체크, 전체 화면 공유는 Windows 에서 시스템 소리를 준다.
           강사가 체크를 안 하면 오디오 트랙이 없을 뿐, 영상 공유는 그대로 된다. */
        var ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        var st = ds.getVideoTracks()[0];
        if (!st) return;
        /* 🎯 (2026-08-11) 화면 공유만은 «글자 선명함» 이 먼저다 — 카메라와 정반대.
           'detail' 을 주면 인코더가 부하 시 초당 장수를 먼저 줄이고 해상도를 지킨다.
           (카메라는 'motion' — 얼굴은 멈추면 안 되고, 화면은 글자가 뭉개지면 안 된다) */
        try { if ('contentHint' in st) st.contentHint = 'detail'; } catch (_) {}

        // 지금 보내고 있는 카메라 트랙을 보관(복귀용)
        try {
            var cur = (window.vcLocalStream && vcLocalStream.getVideoTracks()[0]) || null;
            window.__vcCamTrackBackup = cur || null;
        } catch(_){}

        window.__vcScreenSharing = true;
        window.__vcScreenTrack = st;   // 🖥 공유 «이후» 입장한 사람에게도 이 트랙을 준다 (vcCreatePeer)

        /* 🔊 시스템 소리가 있으면 «마이크 + 화면 소리» 를 WebAudio 로 섞어 하나의 오디오 트랙으로.
           마이크 sender 를 통째로 화면 소리로 갈아끼우면 강사 목소리가 사라지므로 반드시 믹스.
           마이크 음소거(track.enabled=false)는 믹스 안에서도 그대로 침묵이 되어 존중된다. */
        try {
            var sysA = ds.getAudioTracks()[0] || null;
            if (sysA) {
                var _AC = window.AudioContext || window.webkitAudioContext;
                var ac = new _AC();
                var dest = ac.createMediaStreamDestination();
                ac.createMediaStreamSource(new MediaStream([sysA])).connect(dest);
                var micT = null;
                try { micT = (window.vcLocalStream && vcLocalStream.getAudioTracks().find(function(t){ return t.readyState === 'live'; })) || null; } catch(_){}
                if (micT) ac.createMediaStreamSource(new MediaStream([micT])).connect(dest);
                var mixed = dest.stream.getAudioTracks()[0];
                window.__vcScreenAudio = { ctx: ac, mixed: mixed, micBackup: micT, sys: sysA };
                Object.values(window.vcPeerConnections || {}).forEach(function(pc){
                    try {
                        var aSender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'audio'; });
                        if (aSender) aSender.replaceTrack(mixed).catch(function(e){ console.warn('[screen-share] 오디오 믹스 교체 실패:', e); });
                    } catch(_){}
                });
                console.log('[screen-share] 시스템 소리 믹스 전송 시작');
            } else {
                window.__vcScreenAudio = null;
                console.log('[screen-share] 시스템 소리 없음(공유 창 선택 시 «소리 공유» 체크 안 함) — 영상만 공유');
            }
        } catch(e){ window.__vcScreenAudio = null; console.warn('[screen-share] 시스템 소리 믹스 실패(영상은 계속):', e); }
        /* 🖥 (2026-08-11 강사 Shas 2번) "공유하면 강사 자신에게만 보이고 학생에게는 안 나타난다"
           [원인 ①] 카메라가 «꺼져 있거나 없는» 강사에게는 보낼 비디오 sender 가 없다.
             그때 예전 코드는 `pc.addTrack(...)` 만 하고 끝냈다. 그런데 이 앱에는
             onnegotiationneeded 핸들러가 없다(1286행 주석) = **재협상을 아무도 안 한다.**
             트랙은 추가됐지만 상대에게는 그 트랙이 있다는 사실조차 전달되지 않는다 → 영영 안 보임.
             내 미리보기는 로컬 스트림을 직접 붙이므로 «나만 보이는» 정확히 그 증상이 된다.
           [원인 ②] `replaceTrack(...).catch(function(){})` 로 실패를 삼켰다. 한 명에게 못 갔는지
             전원에게 못 갔는지 강사는 알 방법이 없었고, 화면엔 «공유 중» 이라고만 떴다.
           [수정] 새 트랙을 추가한 연결은 반드시 offer 를 다시 보낸다(재협상).
             그리고 몇 명에게 실제로 갔는지 세어, 아무에게도 못 갔으면 강사에게 알린다. */
        var _peers = Object.entries(window.vcPeerConnections || {});
        var _ok = 0, _fail = 0, _nego = [];
        _peers.forEach(function(ent){
            var uid = ent[0], pc = ent[1];
            try {
                var sender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'video'; });
                if (sender) {
                    sender.replaceTrack(st).then(function(){ _ok++; })
                        .catch(function(e){ _fail++; console.warn('[screen-share] replaceTrack 실패:', uid, e); });
                } else {
                    pc.addTrack(st, ds);
                    _nego.push([uid, pc]);        // ← 재협상 없이는 상대가 못 받는다
                }
            } catch(e){ _fail++; console.warn('[screen-share] sender 교체 실패:', uid, e); }
        });
        /* 트랙을 «새로» 붙인 연결만 재협상한다. replaceTrack 은 재협상이 필요 없다(그게 장점). */
        _nego.forEach(function(ent){
            var uid = ent[0], pc = ent[1];
            (async function(){
                try {
                    var off = await pc.createOffer();
                    try { off.sdp = vcTuneAudioSdp(off.sdp); } catch(_){}
                    await pc.setLocalDescription(off);
                    vcConn.send({ type: 'offer', data: { targetUserId: uid, sdp: pc.localDescription } });
                    _ok++;
                    console.log('[screen-share] 재협상 offer 전송 →', uid);
                } catch(e){ _fail++; console.warn('[screen-share] 재협상 실패:', uid, e); }
            })();
        });
        /* 결과를 강사에게 말해 준다 — «공유 중» 이라고만 뜨고 학생은 못 보는 상태를 없앤다.
           ✅ (2026-08-12 강사 Shas 2번) 성공했을 때도 말해 준다 — "공유가 되고 있는지 몰라서
           학생에게 «내 화면 보여요?» 라고 물어봐야 했다. 확인 메시지를 띄워 달라." */
        setTimeout(function(){
            try {
                if (!window.__vcScreenSharing) return;
                if (_peers.length === 0) {
                    if (typeof showToast === 'function') showToast(en
                        ? '⚠ Nobody is in the class yet — they will see it when they join.'
                        : '⚠ 아직 수업에 아무도 없어요 — 들어오면 보이게 됩니다.');
                } else if (_ok === 0) {
                    if (typeof showToast === 'function') showToast(en
                        ? '⚠ The screen could not be sent to the student. Please stop and start sharing again.'
                        : '⚠ 학생에게 화면이 전달되지 않았어요. 공유를 멈췄다가 다시 눌러 주세요.');
                } else {
                    if (typeof showToast === 'function') showToast(en
                        ? '✅ Students can now see your shared screen (' + _ok + ')'
                        : '✅ 학생이 지금 선생님의 공유 화면을 보고 있어요 (' + _ok + '명)');
                }
            } catch(_){}
        }, 2500);
        /* 📣 (2026-08-12 Melca) 학생에게도 시작을 알린다 — 예전엔 채팅 안내가 «내 화면 전용»
           (vcAddChatSystem 은 로컬 표시만) 이라 학생은 예고 없이 얼굴 타일이 화면으로 바뀌었다. */
        try { if (vcConn) vcConn.send({ type: 'screen-share-state', data: { on: true } }); } catch(_){}
        // 내 화면 미리보기도 공유 화면으로
        try {
            var lv = document.getElementById('vc-local-video');
            if (lv) { lv.srcObject = ds; var p = lv.play(); if (p && p.catch) p.catch(function(){}); }
        } catch(_){}

        st.onended = function(){ try { window.vcStopMyScreen(); } catch(_){} };   // 브라우저 '공유 중지'
        if (typeof vcRenderScreenShareChip === 'function') vcRenderScreenShareChip();
        try { if (typeof showToast === 'function') showToast(en ? 'Sharing your screen' : '내 화면을 공유하고 있어요'); } catch(_){}
        try { vcAddChatSystem(en ? 'The teacher started sharing the screen.' : '선생님이 화면 공유를 시작했어요.'); } catch(_){}
    } catch (e) {
        window.__vcScreenSharing = false;
        if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return;   // 사용자가 취소 = 정상
        console.warn('[screen-share] 실패:', e);
        alert(en ? 'Could not start screen sharing.' : '화면 공유를 시작할 수 없었어요.');
    }
};

window.vcStopMyScreen = async function(){
    var en = (typeof getLang === 'function' && getLang() === 'en');
    try {
        window.__vcScreenSharing = false;
        window.__vcScreenTrack = null;
        /* 🔊 (2026-08-12 Melca) 시스템 소리 믹스를 마이크 단독으로 되돌린다 */
        try {
            var sa = window.__vcScreenAudio;
            if (sa) {
                var micBack = (sa.micBackup && sa.micBackup.readyState === 'live') ? sa.micBackup
                    : ((window.vcLocalStream && vcLocalStream.getAudioTracks().find(function(t){ return t.readyState === 'live'; })) || null);
                Object.values(window.vcPeerConnections || {}).forEach(function(pc){
                    try {
                        var aSender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'audio'; });
                        if (aSender && micBack) aSender.replaceTrack(micBack).catch(function(){});
                    } catch(_){}
                });
                try { if (sa.sys) sa.sys.stop(); } catch(_){}
                try { if (sa.ctx) sa.ctx.close(); } catch(_){}
                window.__vcScreenAudio = null;
            }
        } catch(_){}
        /* 📣 학생에게도 종료를 알린다 */
        try { if (vcConn) vcConn.send({ type: 'screen-share-state', data: { on: false } }); } catch(_){}
        /* 카메라로 되돌릴 트랙을 3단으로 찾는다 —
           ① 공유 시작 때 보관한 트랙 ② 지금 내 스트림의 카메라 ③ 둘 다 죽었으면 카메라를 새로 획득.
           [왜] 되돌릴 트랙을 못 찾으면 sender 가 '끝난 화면 트랙'을 계속 붙잡아
                학생 화면이 멈춘 그림에 머문다. 자가치유(vcHealLocalVideo)는 내 스트림의 카메라가
                살아 있으면 '정상'으로 보고 넘어가므로 이 경우를 못 고친다. */
        var cam = window.__vcCamTrackBackup;
        if (!cam || cam.readyState !== 'live') {
            try { cam = (window.vcLocalStream && vcLocalStream.getVideoTracks().find(function(t){ return t.readyState === 'live'; })) || null; } catch(_) { cam = null; }
        }
        if (!cam || cam.readyState !== 'live') {
            try {
                var fresh = await navigator.mediaDevices.getUserMedia({ video: true });
                cam = fresh.getVideoTracks()[0] || null;
                if (cam && window.vcLocalStream) {
                    try { vcLocalStream.getVideoTracks().forEach(function(o){ try{ o.stop(); }catch(_){} try{ vcLocalStream.removeTrack(o); }catch(_){} }); } catch(_){}
                    try { vcLocalStream.addTrack(cam); } catch(_){}
                }
            } catch(_) { /* 권한 거부 등 — 아래 자가치유가 다음 틱에 재시도 */ }
        }
        if (cam) { try { cam.enabled = (typeof vcCamOn === 'undefined') ? true : !!vcCamOn; } catch(_){} }
        Object.values(window.vcPeerConnections || {}).forEach(function(pc){
            try {
                var sender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'video'; });
                if (sender && cam && cam.readyState === 'live') sender.replaceTrack(cam).catch(function(){});
                /* 🖥 (2026-08-11) 되돌릴 카메라가 아예 없는 강사(카메라 없음·권한 거부)를 위한 마무리.
                   그냥 두면 sender 가 «끝난 화면 트랙» 을 계속 붙잡아 학생 화면에 마지막 장면이
                   얼어붙은 채로 남는다. null 로 갈아끼우면 깔끔히 비어 «카메라 꺼짐» 으로 보인다. */
                else if (sender && !cam) sender.replaceTrack(null).catch(function(){});
            } catch(_){}
        });
        try {
            var lv = document.getElementById('vc-local-video');
            if (lv && window.vcLocalStream) { lv.srcObject = vcLocalStream; var p = lv.play(); if (p && p.catch) p.catch(function(){}); }
        } catch(_){}
        if (typeof vcRenderScreenShareChip === 'function') vcRenderScreenShareChip();
        try { if (typeof showToast === 'function') showToast(en ? 'Screen sharing stopped' : '화면 공유를 멈췄어요'); } catch(_){}
        try { vcAddChatSystem(en ? 'The teacher stopped sharing the screen.' : '선생님이 화면 공유를 멈췄어요.'); } catch(_){}
        if (typeof vcHealLocalVideo === 'function') setTimeout(function(){ try{ vcHealLocalVideo(); }catch(_){} }, 800);
    } catch(e){ console.warn('[screen-share] 중지 실패:', e); }
};

window.vcRenderScreenShareChip = function(){
    var btn = document.getElementById('vc-screenshare-btn');
    if (!btn) return;
    var isT = false;
    try {
        isT = (typeof _vcBgLockIsStaff === 'function' && _vcBgLockIsStaff())
           || (typeof vcIsTeacherRole === 'function' && vcIsTeacherRole())
           || window.vcMyRole === 'teacher' || window.vcMyRole === 'admin';
    } catch(_) { isT = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'); }
    btn.style.display = isT ? 'inline-flex' : 'none';
    var on = !!window.__vcScreenSharing;
    var en = (typeof _vcBgLockEn === 'function') ? _vcBgLockEn() : false;
    btn.style.background = on ? '#dc2626' : '#0ea5e9';
    /* 🌐 필기 잠금 칩과 같은 이유로 data-ko/data-en 을 함께 남긴다 (언어 전환 시 applyLang 이 복원) */
    var _sKo = on ? '화면 공유 중지' : '내 화면 공유';
    var _sEn = on ? 'Stop sharing'  : 'Share my screen';
    btn.setAttribute('data-ko', _sKo); btn.setAttribute('data-en', _sEn);
    btn.textContent = en ? _sEn : _sKo;
};

async function vcOnAppResume(reason) {
    console.log('[app-resume] 복귀 감지:', reason);
    // 🔴 (2026-07-24 재점검) 가장 먼저 pong 대기상태를 비운다.
    //   화면이 꺼져 있는 동안 setInterval 이 얼어 'ping 보내고 답 기다리는 중' 으로 남아 있으면,
    //   복귀 직후 첫 틱이 살아있는 연결을 끊어버린다(=내가 만든 워치독이 스스로 사고를 냄).
    try { if (vcConn && typeof vcConn.notePongResume === 'function') vcConn.notePongResume(); } catch(_) {}
    try { await requestWakeLock(); } catch(_) {}

    // 1) 로컬 트랙 다시 enable + 상태 확인 (죽은 마이크는 자가치유)
    /* 🔒 (2026-07-28 강사 피드백) 여기서 예전에는 t.enabled = true 를 '무조건' 했다.
       그래서 강사 피드백 두 건이 동시에 생겼다:
         · Kaye 5번 "카메라를 껐는데 다른 탭 갔다 오면 다시 켜진다(버튼은 꺼진 상태)"
           → 이 함수가 visibilitychange 에서 불려 꺼둔 카메라를 되살렸다. vcCamOn 은 false 그대로라
             화면의 버튼만 꺼진 것처럼 보였다.
         · Kaye 10번 "전체 음소거를 눌러도 학생 소리가 들린다"
           → 학생이 탭을 옮겼다 돌아오면 이 줄이 학생 마이크를 되살려 음소거가 풀렸다.
       원래 의도는 '브라우저가 백그라운드에서 죽인 트랙을 되살리기' 이므로,
       사용자가 스스로 끈 상태와 강사의 전체 음소거는 그대로 존중해야 한다.
       (아래 판정은 vcResumeClassSession 의 기존 가드와 같은 방식) */
    if (vcLocalStream) {
        var _micLocked = window.__vcMicLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin';
        var _wantCam = (typeof vcCamOn === 'undefined' || vcCamOn === null) ? true : !!vcCamOn;
        var _wantMic = (typeof vcMicOn === 'undefined' || vcMicOn === null) ? true : !!vcMicOn;
        if (_micLocked) _wantMic = false;                       // 강사가 전체 음소거를 걸어 둔 상태
        vcLocalStream.getTracks().forEach(t => {
            if (t.kind === 'video') t.enabled = _wantCam;
            else if (t.kind === 'audio') t.enabled = _wantMic;
            else t.enabled = true;
            if (t.readyState === 'ended') {
                console.warn('[app-resume] 트랙 ended 상태:', t.kind, t.kind === 'audio' ? '→ 마이크 자가치유 시도' : '');
            }
        });
        try { vcHealLocalMic(); } catch(_) {}   // 🎤 백그라운드에서 죽은 마이크 즉시 복구
        try { vcHealLocalVideo(); } catch(_) {} // 📷 백그라운드에서 죽은/검은 카메라 즉시 복구
    }

    // 2) 모든 비디오 엘리먼트 play() 재호출 (모바일 브라우저가 일시정지한 경우 대응)
    vcResumeAllVideos();

    // 3) WebSocket 끊겨 있으면 자동 재연결 로직이 이미 타이머로 돌지만,
    //    수동으로도 즉시 깨워서 재연결을 앞당김
    try {
        if (vcConn && vcConn.ws && vcConn.ws.readyState !== WebSocket.OPEN && typeof vcConn.reconnectNow === 'function') {
            vcConn.reconnectNow();
        }
    } catch(_) {}

    // 4) 피어 연결 중 disconnected/failed 면 실제 재연결(PC 재생성 + offer 재전송)
    for (const userId of Object.keys(vcPeerConnections)) {
        const pc = vcPeerConnections[userId];
        const s = pc.iceConnectionState;
        if (s === 'disconnected' || s === 'failed') {
            console.log('[app-resume] 피어 재연결:', s, userId);
            try { pc.restartIce(); } catch(_) {}
            vcReconnectPeer(userId);
        }
    }

    // 5) 한 번 더 500ms 뒤에 play 재시도 (iOS Safari가 play() 거부 후 바로 다시 부르면 성공하는 경우 있음)
    setTimeout(vcResumeAllVideos, 500);
}

function vcShowReconnecting(){
    if (!document.body.classList.contains('vc-in-call')) return;  // 수업 중에만
    var el = document.getElementById('vc-reconnect-banner');
    if (el) el.classList.add('show');
}

function vcHideReconnecting(){
    var el = document.getElementById('vc-reconnect-banner');
    if (el) el.classList.remove('show');
}

function vcEvalReconnecting(){
    if (!document.body.classList.contains('vc-in-call')) { vcHideReconnecting(); return; }
    var recovering = false;
    try {
        var ws = vcConn && vcConn.ws;
        if (ws && (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED)) recovering = true;
    } catch(_){}
    try {
        Object.keys(vcPeerConnections).forEach(function(id){
            var s = vcPeerConnections[id] && vcPeerConnections[id].iceConnectionState;
            if (s === 'failed' || s === 'disconnected') recovering = true;
        });
    } catch(_){}
    // __vcPeerGraceWait: 강사(원격 피어) 끊김 재연결 유예 중 — 평가 폴링이 배너를 소유하므로 유지
    if (recovering || window.__vcPeerGraceWait) vcShowReconnecting(); else vcHideReconnecting();
}

async function vcManualReconnect() {
    if (!document.body.classList.contains('vc-in-call')) return;
    const btn = document.getElementById('vc-btn-resync');
    if (btn) { if (btn.dataset.busy === '1') return; btn.dataset.busy = '1'; btn.style.opacity = '0.5'; btn.textContent = '⏳'; }
    const _en = (typeof getLang === 'function' && getLang() === 'en');
    const say = function (msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (_) {} };
    say(_en ? '🔄 Reconnecting…' : '🔄 다시 연결하는 중…');
    try {
        // ① 신호 회선(WebSocket) — 이게 죽어 있으면 아래 어떤 것도 상대에게 닿지 않는다
        let _sock = null;
        try { _sock = vcConn && vcConn.ws; } catch (_) {}
        if (!_sock || _sock.readyState !== 1) {
            console.warn('[vc-resync] 신호 회선이 끊겨 있음 → 회선부터 재연결');
            try { if (vcConn && vcConn.notePongResume) vcConn.notePongResume(); } catch (_) {}
            try { if (vcConn && vcConn.reconnectNow) vcConn.reconnectNow(); } catch (_) {}
            await new Promise(function (r) { setTimeout(r, 1500); });   // room-joined 회신 여유
        }
        // ② 내 카메라·마이크 자가치유
        try { await vcHealLocalVideo(); } catch (_) {}
        try { await vcHealLocalMic(); } catch (_) {}
        // ③ 상대와의 영상 연결 재수립
        const ids = Object.keys(vcPeerConnections || {});
        ids.forEach(function (id) { try { delete __vcReconnectAt[id]; } catch (_) {} });   // 수동 요청은 쿨다운 면제
        ids.forEach(function (id) { try { vcReconnectPeer(id); } catch (_) {} });
        console.warn('[vc-resync] 사용자가 영상 재연결 요청 — 상대', ids.length + '명');

        // ④ 결과 보고 — «했는데 어떻게 됐는지» 를 반드시 말해 준다
        setTimeout(function () {
            let live = 0, total = 0;
            try {
                Object.values(vcPeerConnections || {}).forEach(function (pc) {
                    total++;
                    try { if (pc.getReceivers().some(function (r) { return r.track && r.track.readyState === 'live'; })) live++; } catch (_) {}
                });
            } catch (_) {}
            let ok = false;
            try { ok = !!(vcConn && vcConn.ws && vcConn.ws.readyState === 1); } catch (_) {}
            if (!ok) say(_en ? '⚠ Still offline — check your internet, the class will resume by itself when it is back.'
                             : '⚠ 아직 연결이 안 됐어요 — 인터넷을 확인해 주세요. 회복되면 수업은 저절로 이어집니다.');
            else if (total === 0) say(_en ? '✅ Line restored. Waiting for the other person to join.'
                                         : '✅ 회선이 다시 연결됐어요. 상대가 들어오기를 기다리는 중입니다.');
            else if (live > 0) say(_en ? '✅ Reconnected (' + live + '/' + total + ')' : '✅ 다시 연결됐어요 (' + live + '/' + total + '명)');
            else say(_en ? '⏳ Still connecting to the other person… trying again automatically.'
                         : '⏳ 상대와 연결 중이에요… 자동으로 계속 시도합니다.');
        }, 3500);
    } catch (e) { console.warn('[vc-resync] 실패', e); }
    setTimeout(function () {
        if (btn) { btn.dataset.busy = ''; btn.style.opacity = ''; btn.textContent = '🔄'; }
    }, 2500);
}

window.vcManualReconnect = vcManualReconnect;

function vcReconnectPeer(userId) {
    if (!userId) return;
    if (!document.body.classList.contains('vc-in-call')) return;   // 수업 중일 때만
    const now = Date.now();
    if (__vcReconnectAt[userId] && now - __vcReconnectAt[userId] < 8000) return;  // 8초 쿨다운
    __vcReconnectAt[userId] = now;
    vcShowReconnecting();   // "재연결 중…" 배너 노출

    const old = vcPeerConnections[userId];
    let username = (old && old.__username) || '참가자';
    try {
        const lbl = document.querySelector('#vc-video-' + userId + ' .video-label');
        if (lbl && lbl.textContent) username = lbl.textContent;
    } catch(_) {}

    console.warn('[vc-recover] 피어 재연결 시도:', userId, username);
    try { if (old) old.close(); } catch(_) {}
    delete vcPeerConnections[userId];

    // 재연결은 TURN 자격증명을 새로 받아서 시도 (연결 실패 원인이 STUN-only/만료 자격증명일 수 있음)
    const _iceReady = vcEnsureIceServers().catch(() => {});

    // 두 단말이 동시에 offer 를 보내면 glare → ID 작은 쪽만 즉시 offer
    const iAmOfferer = (vcUserId && userId) ? (String(vcUserId) < String(userId)) : true;
    if (iAmOfferer) {
        _iceReady.then(() => {
            try { vcCreatePeerAndOffer(userId, username); } catch(e) { console.warn('[vc-recover] offer 실패:', e); }
        });
    } else {
        // 상대(작은 ID)가 offer 를 보낼 것 → 4초 대기, 그래도 복구 안 되면 내가 백업 offer
        setTimeout(() => {
            if (!vcPeerConnections[userId] && document.body.classList.contains('vc-in-call')) {
                console.warn('[vc-recover] 상대 offer 미수신 → 백업 offer:', userId);
                try { vcCreatePeerAndOffer(userId, username); } catch(_) {}
            }
        }, 4000);
    }
}

function vcApplyRemoteCamHint(userId) {
    try {
        var box = document.getElementById('vc-video-' + userId);
        if (!box) return;
        var why = (window.vcRemoteCamOff || {})[userId];
        var el = box.querySelector('.vc-camoff-hint');
        if (!why) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.className = 'vc-camoff-hint';
            el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;'
                + 'background:rgba(15,23,42,.82);color:#cbd5e1;font-size:13px;font-weight:700;text-align:center;line-height:1.35;padding:8px;z-index:4;pointer-events:none;';
            if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
            box.appendChild(el);
        }
        var en = miIsEn();
        el.innerHTML = (why === 'aao')
            ? '📶<span>' + (en ? 'Weak connection — audio only for now.<br>The class continues.'
                               : '연결이 약해 지금은 <b>음성만</b> 전송 중이에요.<br>수업은 계속됩니다.') + '</span>'
            : '📷<span>' + (en ? 'Camera is off' : '상대가 카메라를 껐어요') + '</span>';
        // 예전 '영상 준비 중' 안내가 남아 있으면 중복이므로 제거
        var old = box.querySelector('.vc-black-hint'); if (old) old.remove();
    } catch (_) {}
}

window.vcApplyRemoteCamHint = vcApplyRemoteCamHint;

function vcEnsureRemoteAudio() {
    Object.keys(vcPeerConnections).forEach(id => {
        const v = document.querySelector('#vc-video-' + id + ' video');
        if (!v) return;
        const aux = document.getElementById('vc-aud-' + id);
        try {
            v.volume = 1;
            if (aux) {
                // 보조 오디오 경로 가동 중 — 소리는 aux 전담, 비디오는 계속 음소거(이중재생 방지)
                v.muted = true;
                aux.volume = 1; aux.muted = false;
                if (aux.paused) { const ap = aux.play(); if (ap && ap.catch) ap.catch(()=>{}); }
                if (v.paused) { const vp = v.play(); if (vp && vp.catch) vp.catch(()=>{}); }
                return;
            }
            v.muted = false;
            if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(()=>{}); }
        } catch(_) {}
    });
}

function vcUnmuteRemotes() { vcEnsureRemoteAudio(); }

function vcSpawnAuxAudio(id) {
    try {
        if (document.getElementById('vc-aud-' + id)) return;
        const v = document.querySelector('#vc-video-' + id + ' video');
        const stream = v && v.srcObject;
        if (!stream || !stream.getAudioTracks) return;
        const at = stream.getAudioTracks();
        if (!at.length) return;
        const a = document.createElement('audio');
        a.id = 'vc-aud-' + id;
        a.autoplay = true;
        a.setAttribute('playsinline', '');
        a.srcObject = new MediaStream(at);
        a.style.display = 'none';
        try { vcApplySavedSink(a); } catch(e){}   // 🔊 보조 오디오도 고른 스피커로
        document.body.appendChild(a);
        v.muted = true;   // 소리는 aux 전담
        const p = a.play(); if (p && p.catch) p.catch(()=>{});
        console.warn('[vc-audio] 🔀 보조 오디오 경로 가동:', id);
    } catch(e) { console.warn('[vc-audio] aux 실패:', e); }
}

function vcToggleSoundBanner(show) {
    let b = document.getElementById('vc-sound-banner');
    if (!show) { if (b) b.remove(); return; }
    if (b) return;
    if (!document.getElementById('vc-sound-banner-style')) {
        const st = document.createElement('style');
        st.id = 'vc-sound-banner-style';
        st.textContent = '@keyframes vcSndPulse{0%,100%{transform:translateX(-50%) scale(1);}50%{transform:translateX(-50%) scale(1.07);}}';
        document.head.appendChild(st);
    }
    b = document.createElement('button');
    b.id = 'vc-sound-banner';
    b.textContent = '🔊 소리 켜기';
    b.style.cssText = 'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:2147483646;'
        + 'padding:13px 26px;font-size:18px;font-weight:800;background:#f59e0b;color:#1f2937;border:none;'
        + 'border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.5);cursor:pointer;animation:vcSndPulse 1.2s ease-in-out infinite;';
    b.onclick = function() { vcEnsureRemoteAudio(); b.remove(); };
    document.body.appendChild(b);
}

function vcArmGestureUnmute() {
    if (__vcGestureArmed) return; __vcGestureArmed = true;
    const h = () => {
        __vcGestureArmed = false;
        vcUnmuteRemotes();
        ['touchstart','pointerdown','click','keydown'].forEach(e => document.removeEventListener(e, h));
    };
    ['touchstart','pointerdown','click','keydown'].forEach(e => document.addEventListener(e, h, { passive: true }));
}

function vcCleanupAllPeers() {
    console.log('[vc] vcCleanupAllPeers: 기존 PC', Object.keys(vcPeerConnections).length, '개 정리');
    Object.keys(vcPeerConnections).forEach(id => {
        try { vcPeerConnections[id].close(); } catch(_) {}
        const el = document.getElementById(`vc-video-${id}`);
        if (el) el.remove();
    });
    vcPeerConnections = {};
    vcRemoteStreams = {};
    // 🇵🇭 (2026-07-24) 순단으로 남겨 둔 '재연결 중' 유령 타일도 함께 정리
    //   (유령은 id 가 vcghost-* 로 바뀌어 있어 위의 vc-video-* 루프에 안 걸린다)
    try { vcSweepGhostTiles(); } catch(_) {}
}

window.vcMicOn = true;

window.vcCamOn = true;

window.vcOnSaveIdChange = function() {
  const ck = document.getElementById('vc-save-id');
  const al = document.getElementById('vc-auto-login');
  try {
    if (ck && ck.checked) {
      localStorage.setItem(VC_AUTH_KEYS.saveId, '1');
    } else {
      localStorage.removeItem(VC_AUTH_KEYS.saveId);
      localStorage.removeItem(VC_AUTH_KEYS.uid);
      localStorage.removeItem('mangoi_vc_roomcode');
      // 자동로그인은 자동저장이 꺼지면 같이 꺼짐
      localStorage.removeItem(VC_AUTH_KEYS.autoLogin);
      localStorage.removeItem(VC_AUTH_KEYS.pw);
      if (al) al.checked = false;
    }
  } catch {}
};

window.vcOnAutoLoginChange = function() {
  const al = document.getElementById('vc-auto-login');
  const sv = document.getElementById('vc-save-id');
  try {
    if (al && al.checked) {
      localStorage.setItem(VC_AUTH_KEYS.autoLogin, '1');
      // 자동로그인 켜면 아이디 저장도 자동으로 켜짐
      if (sv && !sv.checked) { sv.checked = true; vcOnSaveIdChange(); }
    } else {
      localStorage.removeItem(VC_AUTH_KEYS.autoLogin);
      localStorage.removeItem(VC_AUTH_KEYS.pw);
    }
  } catch {}
};

window.vcJoinPracticeRoom = function (n) {
  try {
    var ri = document.getElementById('vc-roomcode-input');
    if (ri) ri.value = 'demo-' + (n || 1);
    var ni = document.getElementById('vc-name-input');
    if (ni && !ni.value.trim()) {
      var _pu = (window.getCurrentUser ? window.getCurrentUser() : null);
      if (_pu && _pu.name) ni.value = _pu.name;
    }
    if (typeof vcJoinRoom === 'function') vcJoinRoom();
  } catch (e) { console.warn('[practice-room]', e); }
};

window.vcSyncPracticeEntry = function () {
  try {
    var w = document.getElementById('vc-practice-wrap');
    if (!w) return;
    var staff = (typeof vcIsStaffNow === 'function') ? vcIsStaffNow()
              : (typeof vcIsTeacherRole === 'function' ? vcIsTeacherRole() : false);
    w.style.display = staff ? 'block' : 'none';
  } catch (_) {}
};

function vcRestoreCredentials() {
  lobbyInitStarfield();
  try { window.vcSyncPracticeEntry(); } catch (_) {}
  try {
    const saveId    = localStorage.getItem(VC_AUTH_KEYS.saveId) === '1';
    const autoLogin = localStorage.getItem(VC_AUTH_KEYS.autoLogin) === '1';
    const uid       = localStorage.getItem(VC_AUTH_KEYS.uid) || '';
    const pw        = localStorage.getItem(VC_AUTH_KEYS.pw) || '';
    const roomCode  = localStorage.getItem('mangoi_vc_roomcode') || '';

    const idInput   = document.getElementById('vc-name-input');
    const pwInput   = document.getElementById('vc-room-input');
    const roomInput = document.getElementById('vc-roomcode-input');
    const ckSave    = document.getElementById('vc-save-id');
    const ckAuto    = document.getElementById('vc-auto-login');

    if (ckSave) ckSave.checked = saveId;
    if (ckAuto) ckAuto.checked = autoLogin;
    // 저장된 값들을 자동으로 채워주기만 하고 — 자동 입장은 하지 않음 (사용자가 입장 버튼을 눌러야 진입)
    if (saveId && uid && idInput) idInput.value = uid;
    // fix (2026-06-01) — 예전에 저장된 'room-랜덤' 코드는 복원하지 않음(각자 다른 방으로 갈라지는 원인).
    //   사용자가 직접 입력한 코드만 복원. 비어 있으면 공용 수업방(mangoi-class)으로 입장됨.
    // 🆕 방코드 자동복원 제거 — 옛 코드가 몰래 채워져 교사·학생이 서로 다른 방에 들어가던 문제 차단.
    //    비워 두면 모두 공용 수업방(mangoi-class)에서 자동으로 만난다.
    if (roomInput) roomInput.value = '';
    if (autoLogin && pw && pwInput) pwInput.value = pw;
    // ⛔ 자동 입장 제거 — 사용자가 직접 [입장] 버튼을 눌러야만 입장하도록
  } catch (e) { /* localStorage 차단 환경 — 무시 */ }
}

document.addEventListener('DOMContentLoaded', vcRestoreCredentials);

window.vcRoleRemember = function(role){
    try {
        if (!role) return;
        localStorage.setItem('mangoi_user_role', role);
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var uid = (u && (u.uid || u.id)) ? String(u.uid || u.id) : '';
        if (uid) localStorage.setItem('mangoi_user_role_uid', uid);
        else localStorage.removeItem('mangoi_user_role_uid');   // 주인 모름 = 다음 사람이 물려받지 않게
    } catch (_) {}
};

window.vcRoleStored = function(){
    try {
        var v = localStorage.getItem('mangoi_user_role') || '';
        if (!v) return '';
        var owner = localStorage.getItem('mangoi_user_role_uid') || '';
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var uid = (u && (u.uid || u.id)) ? String(u.uid || u.id) : '';
        // 로그인 중인데 주인이 다르면(또는 주인이 안 적혀 있으면) 남의 역할이다 → 버린다
        if (uid && owner !== uid) return '';
        return v;
    } catch (_) { return ''; }
};

async function vcJoinMyClass() {
    var u = (window.getCurrentUser ? window.getCurrentUser() : null);
    var uid = u && u.uid;
    var typed = ((document.getElementById('vc-name-input') || {}).value || '').trim();
    var name = (u && u.name) || typed || '학생';
    var role = (u && u.role) || ((typeof vcIsTeacherRole === 'function' && vcIsTeacherRole()) ? 'teacher' : 'student');
    if (!uid && !typed) { alert('아이디를 입력하거나 로그인 후 이용하세요.'); return; }

    var btn = document.getElementById('vc-join-myclass');
    if (btn) { btn.disabled = true; btn.dataset._t = btn.textContent; btn.textContent = '수업 찾는 중…'; }
    try {
        var qs = 'role=' + encodeURIComponent(role);
        if (uid) qs += '&user_id=' + encodeURIComponent(uid);
        if (typed) qs += '&student_name=' + encodeURIComponent(typed);
        var r = await fetch('/api/class/sessions/today?' + qs, { credentials: 'include' });
        var d = await r.json();
        var sessions = (d && d.sessions) || [];
        var current = d && d.current;
        if (d) window.__vcRelayAlways = !!d.net_relay;
        if (!sessions.length) {
            alert('오늘 예약된 수업이 없어요. 🗓️\n예약이 있는데도 안 보이면 아래 "방 코드 직접 입력"으로 입장해 주세요.');
            return;
        }
        // 교사가 오늘 여러 수업이고 지금 바로 들어갈 것이 애매하면 → 목록에서 선택
        if ((role === 'teacher' || role === 'admin') && sessions.length > 1 && !current) {
            vcShowSessionPicker(sessions, name, role); return;
        }
        var target = current || sessions[0];
        if (target.status === 'early') { vcShowClassGate(target, name, role); return; }
        if (target.status === 'ended') { alert('오늘 수업은 이미 종료되었어요.'); return; }
        vcEnterResolvedRoom(target, name, role);
    } catch (e) {
        console.warn('[vcJoinMyClass] err', e);
        alert('수업 정보를 불러오지 못했어요. 아래 "방 코드 직접 입력"으로 입장해 주세요.');
    } finally {
        if (btn) { btn.disabled = false; if (btn.dataset._t) btn.textContent = btn.dataset._t; }
    }
}

function vcEnterResolvedRoom(session, name, role) {
    if (role === 'teacher' || role === 'admin' || role === 'student') {
        window.vcMyRole = role;
        // 🔒 역할 확정 직후 수업 통제 칩(전체 음소거/집중 모드) 노출 갱신 — 강사/관리자만 보임
        try { setTimeout(function(){ if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender(); }, 300); } catch(_){}
        window.vcRoleRemember(role);   // 🎭 주인(uid)까지 함께 적는다
    }
    var ni = document.getElementById('vc-name-input');
    var ri = document.getElementById('vc-roomcode-input');
    if (ni && name) ni.value = name;
    if (ri) ri.value = session.room_id;          // ← 예약에서 계산된 방 = 반드시 상대와 동일
    window.vcCurrentSession = session;           // 대기실/알림(Phase2)용 메타
    if (typeof vcJoinRoom === 'function') vcJoinRoom();
    try { vcStartWaitingMonitor(session, role); } catch (e) {}
}

function vcShowClassGate(session, name, role) {
    var ov = document.getElementById('vc-class-gate');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'vc-class-gate';
        ov.style.cssText = 'position:fixed;inset:0;z-index:11000;display:flex;align-items:center;justify-content:center;background:rgba(8,12,24,.86);backdrop-filter:blur(6px);font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif';
        document.body.appendChild(ov);
    }
    function fmt(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60); s = s % 60; m = m % 60; return (h > 0 ? h + '시간 ' : '') + m + '분 ' + String(s).padStart(2, '0') + '초'; }
    var startLabel = new Date(session.start_ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    function render() {
        var now = Date.now();
        var toOpen = session.open_at_ts - now;
        if (toOpen <= 0) { clearInterval(ov.__t); ov.remove(); vcEnterResolvedRoom(session, name, role); return; }
        ov.innerHTML = '<div style="max-width:420px;width:90%;background:linear-gradient(160deg,#1e293b,#0f172a);border:1px solid rgba(148,163,184,.25);border-radius:24px;padding:34px 28px;text-align:center;color:#e2e8f0;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)">'
            + '<div style="font-size:44px;margin-bottom:6px">⏰</div>'
            + '<div style="font-size:19px;font-weight:800;margin-bottom:6px">아직 입장 시간이 아니에요</div>'
            + '<div style="font-size:14px;color:#94a3b8;margin-bottom:18px">수업 시작 <b style="color:#fbbf24">' + startLabel + '</b> · 시작 10분 전부터 입장할 수 있어요</div>'
            + '<div style="font-size:13px;color:#cbd5e1;margin-bottom:4px">입장 가능까지</div>'
            + '<div style="font-size:30px;font-weight:900;letter-spacing:-1px;color:#7dd3fc;margin-bottom:22px">' + fmt(toOpen) + '</div>'
            + '<div style="font-size:13px;color:#64748b;margin-bottom:18px">🎓 ' + (session.student_name || '') + ' · 강사 ' + (session.teacher_name || '미배정') + '</div>'
            + '<button id="vc-gate-close" style="background:rgba(148,163,184,.15);color:#e2e8f0;border:none;border-radius:12px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer">닫기</button>'
            + '<div style="font-size:11px;color:#475569;margin-top:14px">입장 시간이 되면 자동으로 연결됩니다</div></div>';
        var c = document.getElementById('vc-gate-close'); if (c) c.onclick = function () { clearInterval(ov.__t); ov.remove(); };
    }
    render(); ov.__t = setInterval(render, 1000);
}

function vcShowSessionPicker(sessions, name, role) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:11000;display:flex;align-items:center;justify-content:center;background:rgba(8,12,24,.86);backdrop-filter:blur(6px);font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif';
    var items = sessions.map(function (s) {
        var t = new Date(s.start_ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        var badge = s.status === 'live' ? '<span style="color:#34d399">● 진행중</span>' : s.status === 'open' ? '<span style="color:#7dd3fc">입장 가능</span>' : s.status === 'ended' ? '<span style="color:#64748b">종료</span>' : '<span style="color:#fbbf24">' + t + ' 예정</span>';
        var dis = s.status === 'ended';
        return '<button class="vc-pick" data-room="' + s.room_id + '" ' + (dis ? 'disabled' : '') + ' style="display:flex;justify-content:space-between;align-items:center;width:100%;background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.2);border-radius:14px;padding:14px 16px;margin-bottom:10px;color:#e2e8f0;cursor:' + (dis ? 'not-allowed' : 'pointer') + ';opacity:' + (dis ? '.5' : '1') + '"><span style="font-weight:700">' + t + ' · ' + (s.student_name || '학생') + '</span><span style="font-size:12px">' + badge + '</span></button>';
    }).join('');
    ov.innerHTML = '<div style="max-width:440px;width:92%;background:linear-gradient(160deg,#1e293b,#0f172a);border:1px solid rgba(148,163,184,.25);border-radius:24px;padding:28px 24px;color:#e2e8f0;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)"><div style="font-size:18px;font-weight:800;margin-bottom:4px">오늘 수업 선택</div><div style="font-size:13px;color:#94a3b8;margin-bottom:18px">입장할 수업을 선택하면 학생과 같은 방으로 연결됩니다</div>' + items + '<button id="vc-pick-close" style="width:100%;background:transparent;color:#64748b;border:none;padding:10px;font-size:13px;cursor:pointer;margin-top:4px">닫기</button></div>';
    document.body.appendChild(ov);
    ov.querySelectorAll('.vc-pick').forEach(function (b) {
        b.onclick = function () {
            var room = b.getAttribute('data-room');
            var s = sessions.find(function (x) { return x.room_id === room; });
            ov.remove();
            if (s) { if (s.status === 'early') vcShowClassGate(s, name, role); else vcEnterResolvedRoom(s, name, role); }
        };
    });
    var c = ov.querySelector('#vc-pick-close'); if (c) c.onclick = function () { ov.remove(); };
}

function vcStopWaitingMonitor() {
    try { if (vcWaitTimer) { clearInterval(vcWaitTimer); vcWaitTimer = null; } } catch (e) {}
    try { if (window.__vcDemoTeacherTimer) { clearTimeout(window.__vcDemoTeacherTimer); window.__vcDemoTeacherTimer = null; } } catch (e) {}
    try { vcRemoveDemoTeacher(); } catch (e) {}
    /* 🪪 (2026-08-12) id 를 vc-wait-toast 로 분리 — 예전엔 vc-wait-card 를 썼는데,
       그 id 는 index.html 의 «교재 여는 중» 정적 카드가 이미 쓰고 있었다.
       ① if(!card) 가 항상 거짓이라 토스트 전용 스타일(fixed·bottom:88px)이 한 번도 안 붙고
          inset:0 짜리 교재 카드가 «기다리는 중…» 판때기로 교재 패널 전면을 덮었고
       ② 여기 remove() 가 교재 대기 카드를 DOM 에서 영구 삭제해 다시는 못 뜨게 했다. */
    var c = document.getElementById('vc-wait-toast'); if (c) c.remove();
}

function vcStartWaitingMonitor(session, myRole) {
    vcStopWaitingMonitor();
    if (!session) return;
    myRole = myRole || window.vcMyRole || 'student';
    if (myRole === 'observer') return;
    var waitingFor = (myRole === 'teacher' || myRole === 'admin') ? 'student' : 'teacher';
    var waitingLabel = waitingFor === 'teacher' ? '선생님' : '학생';
    var startedAt = Date.now();
    var NOSHOW_MS = 5 * 60 * 1000;
    var noShowSent = false;
    var calledTeacher = false;   // 🆕 학생 입장 즉시 담당 선생님 1회 호출
    var isDemo = false;          // 🆕 데모 계정 → 실제 강사 미입장 시 시연용 선생님 자동 등장
    try { isDemo = !!(typeof demoStudents !== 'undefined' && session.student_uid && demoStudents[session.student_uid]) || /[?&]demoteacher=1/.test(location.search) || (localStorage.getItem('mangoi_demo_teacher') === '1'); } catch (e) {}

    if (!document.getElementById('vc-wait-kf')) { var st = document.createElement('style'); st.id = 'vc-wait-kf'; st.textContent = '@keyframes vcPulse{0%,100%{opacity:1}50%{opacity:.35}}'; document.head.appendChild(st); }
    var card = document.getElementById('vc-wait-toast');
    if (!card) {
        card = document.createElement('div');
        card.id = 'vc-wait-toast';
        card.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:9800;background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.3);border-radius:16px;padding:12px 18px;color:#e2e8f0;font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;box-shadow:0 16px 40px -12px rgba(0,0,0,.6);display:flex;align-items:center;gap:12px;max-width:92vw';
        document.body.appendChild(card);
    }
    function counterpartPresent() {
        try {
            var roles = window.vcPeerRoles || {};
            for (var id in roles) {
                var r = roles[id];
                if (waitingFor === 'teacher' && (r === 'teacher' || r === 'admin')) return true;
                if (waitingFor === 'student' && r === 'student') return true;
            }
            var boxes = document.querySelectorAll('[id^="vc-video-"]');
            for (var i = 0; i < boxes.length; i++) {
                if (boxes[i].id === 'vc-local-box') continue;
                var rr = boxes[i].dataset ? boxes[i].dataset.role : '';
                if (waitingFor === 'teacher' && (rr === 'teacher' || rr === 'admin')) return true;
                if (waitingFor === 'student' && rr === 'student') return true;
            }
        } catch (e) {}
        return false;
    }
    function elapsed() { var s = Math.floor((Date.now() - startedAt) / 1000), m = Math.floor(s / 60); s = s % 60; return m + ':' + String(s).padStart(2, '0'); }   // 3:07 — 한/영 공용 표기
    function paint(state) {
        if (!card) return;
        /* 🌐 (2026-08-12) 필리핀 강사도 보는 토스트 — 언어 판정은 반드시 getLang() (CLAUDE.md) */
        var en = false; try { en = (typeof getLang === 'function') && getLang() === 'en'; } catch (e) {}
        var who = waitingFor === 'teacher' ? (en ? 'teacher' : '선생님') : (en ? 'student' : '학생');
        if (state === 'met') {
            var metMsg = en ? ('The ' + who + ' joined! You can start the class.') : (who + '이 입장했어요! 수업을 시작하세요.');
            card.innerHTML = '<span style="font-size:20px">🎉</span><span style="font-size:14px;font-weight:700">' + metMsg + '</span>';
            setTimeout(vcStopWaitingMonitor, 3500);
            return;
        }
        var callLabel = (calledTeacher && waitingFor === 'teacher')
            ? (en ? 'Calling the teacher…' : '선생님을 부르는 중…')
            : (en ? ('Waiting for the ' + who + '…') : (who + '을 기다리는 중…'));
        var sent = (calledTeacher && waitingFor === 'teacher')
            ? '<div style="font-size:11px;color:#34d399;margin-top:2px">📣 ' + (en ? 'Teacher has been called — joining soon' : '선생님을 호출했어요 — 곧 입장하십니다') + '</div>'
            : (noShowSent ? '<div style="font-size:11px;color:#fbbf24;margin-top:2px">📣 ' + (en ? 'We sent them a reminder to join' : '상대에게 입장 알림을 보냈어요') + '</div>' : '');
        card.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:#fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.2);animation:vcPulse 1.4s infinite;flex:0 0 auto"></span>'
            + '<div><div style="font-size:14px;font-weight:700">' + callLabel + ' <span style="color:#94a3b8;font-weight:500">(' + elapsed() + ')</span></div>'
            + '<div style="font-size:11px;color:#94a3b8">' + (en ? 'Disappears when they join' : '입장하면 자동으로 사라져요') + '</div>' + sent + '</div>'
            + '<button onclick="vcStopWaitingMonitor()" style="background:rgba(148,163,184,.15);border:0;color:#cbd5e1;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;flex:0 0 auto">' + (en ? 'Close' : '닫기') + '</button>';
    }
    paint('waiting');
    // 🆕 (A) 학생이 들어오면 담당 선생님 즉시 호출(1회) — 이미 선생님이 있으면 생략
    if (waitingFor === 'teacher' && !calledTeacher && !counterpartPresent()) {
        calledTeacher = true;
        try { vcCallTeacherNow(session); } catch (e) {}
        paint('waiting');
    }
    // 🆕 (C) 데모: 실제 선생님이 안 들어오면 시연용 선생님 자동 등장 (실제 수업엔 영향 없음)
    if (waitingFor === 'teacher' && isDemo) {
        try { if (window.__vcDemoTeacherTimer) clearTimeout(window.__vcDemoTeacherTimer); } catch (e) {}
        window.__vcDemoTeacherTimer = setTimeout(function () {
            if (!document.body.classList.contains('vc-in-call')) return;
            if (counterpartPresent()) return;   // 진짜 선생님이 이미 입장했으면 시연 생략
            try { vcInjectDemoTeacher(session); } catch (e) {}
        }, 5200);
    }
    vcWaitTimer = setInterval(function () {
        if (!document.body.classList.contains('vc-in-call')) { vcStopWaitingMonitor(); return; }
        if (counterpartPresent()) { paint('met'); clearInterval(vcWaitTimer); vcWaitTimer = null; return; }
        if (!noShowSent && (Date.now() - startedAt) >= NOSHOW_MS) { noShowSent = true; vcSendNoShow(session, waitingFor); }
        paint('waiting');
    }, 2000);
}

function vcSendNoShow(session, waitingFor) {
    try {
        var s = (typeof demoStudents !== 'undefined' && session.student_uid) ? demoStudents[session.student_uid] : null;
        fetch('/api/notify/no-show', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: session.room_id,
                schedule_id: session.schedule_id,
                waiting_for: waitingFor,
                student_name: session.student_name,
                teacher_name: session.teacher_name,
                lesson_title: (s && s.lesson_title) || '영어 수업',
                student_uid: session.student_uid,
                teacher_uid: session.teacher_id,
                student_phone: s && s.phone, parent_phone: s && s.parent_phone, teacher_phone: s && s.teacher_phone,
                waited_minutes: 5,
            })
        }).catch(function () {});
    } catch (e) { console.warn('[vcSendNoShow]', e); }
}

function vcCallTeacherNow(session){
    try {
        var s = (typeof demoStudents !== 'undefined' && session.student_uid) ? demoStudents[session.student_uid] : null;
        fetch('/api/notify/no-show', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: session.room_id, schedule_id: session.schedule_id,
                waiting_for: 'teacher', student_name: session.student_name, teacher_name: session.teacher_name,
                lesson_title: (s && s.lesson_title) || '영어 수업',
                student_uid: session.student_uid, teacher_uid: session.teacher_id,
                student_phone: s && s.phone, parent_phone: s && s.parent_phone, teacher_phone: s && s.teacher_phone,
                waited_minutes: 0, reason: 'student_entered'
            })
        }).catch(function(){});
    } catch (e) { console.warn('[vcCallTeacherNow]', e); }
}

function vcInjectDemoTeacher(session){
    if (document.getElementById('vc-video-demoteacher')) return;
    var grid = document.getElementById('vc-video-grid'); if (!grid) return;
    var tname = (session && session.teacher_name) || '원어민 선생님';
    var box = document.createElement('div');
    box.className = 'video-box'; box.id = 'vc-video-demoteacher';
    box.dataset.role = 'teacher'; box.dataset.demo = '1';
    box.innerHTML = '<video autoplay playsinline loop muted></video><span class="video-label">' + escHtml(tname) + ' (시연)</span>';
    var vid = box.querySelector('video');
    vid.src = '/video/callcenter-teacher.mp4';
    vid.play().then(function(){ setTimeout(function(){ try { vid.muted = false; } catch(e){} }, 600); }).catch(function(){});
    // 🧑‍🏫 시연 선생님도 내 타일보다 위 (vcInsertBoxTeacherFirst 는 뒤 스크립트에서 정의 — 런타임엔 존재)
    if (typeof vcInsertBoxTeacherFirst === 'function') vcInsertBoxTeacherFirst(grid, box); else grid.appendChild(box);
    try { vcUpdateGridCount(); } catch (e) {}
    try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch (e) {}
    try { vcRefreshPraiseUI(); } catch (e) {}
    try { vcAddChatSystem('🎉 ' + tname + '이(가) 입장했어요'); } catch (e) {}
}

function vcRemoveDemoTeacher(){
    var b = document.getElementById('vc-video-demoteacher');
    if (b) { b.remove(); try { vcUpdateGridCount(); } catch (e) {} }
}

window.vcReleasePermStream = function () {
    var s = window.__vcPermStream; window.__vcPermStream = null;
    try { if (s && s.getTracks) s.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
};

window.vcTakePermStream = function () {
    var s = window.__vcPermStream;
    if (!s || typeof s.getTracks !== 'function') return null;
    window.__vcPermStream = null;
    try { clearTimeout(window.__vcPermRelT); } catch (_) {}
    var live = false;
    try { live = s.getTracks().some(function (t) { return t.readyState === 'live'; }); } catch (_) {}
    if (!live) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} return null; }
    return s;
};

window.vcEnsureMediaPermission = async function () {
    if (window.__vcPermReady && window.__vcPermStream) return true;
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
        var s = null;
        try { s = await acquireLocalMedia({ video: true, audio: true }); }
        catch (e) {
            if (e && e.name === 'NotAllowedError') throw e;      // 사용자가 거부 → 재요청 안 함
            s = await acquireLocalMedia({ video: false, audio: true });  // 카메라만 막힌 경우 소리라도 확보
        }
        window.vcReleasePermStream();
        window.__vcPermStream = s;
        try { window.__vcPermRelT = setTimeout(window.vcReleasePermStream, 20000); } catch (_) {}
        window.__vcPermReady = true;
        return true;
    } catch (e) {
        console.warn('[vc-perm] 권한 선확보 실패(입장은 계속 진행):', e && e.name);
        return false;
    }
};

window.vcRenegotiateMissing = function (kind) {
    try {
        if (!document.body.classList.contains('vc-in-call')) return 0;
        var n = 0;
        Object.keys(vcPeerConnections || {}).forEach(function (id) {
            var pc = vcPeerConnections[id];
            if (!pc) return;
            var has = false;
            try { has = pc.getSenders().some(function (x) { return x.track && x.track.kind === kind; }); } catch (_) {}
            if (!has) {
                n++;
                console.warn('[vc-reneg] ' + kind + ' sender 없음 → 재협상:', id);
                try { vcReconnectPeer(id); } catch (_) {}
            }
        });
        return n;
    } catch (_) { return 0; }
};

async function vcJoinRoom(skipUI) {
    vcIsObserver = false; // 일반 입장 모드 확인
    window._vcObserverMode = false;   // ★ (2026-07-20) 별도 스크립트(입장 자동 교재 로드)에서 참조용 미러
    vcUsername = document.getElementById('vc-name-input').value.trim();
    if (!vcUsername) { alert('아이디를 입력하세요.'); return; }

    /* 🎭 (2026-08-07 Kaye 피드백 1·2·5번) 역할을 «소켓을 열기 전에» 확정한다.
       [실제 사고] window.vcMyRole 은 마이페이지 입장(vcEnterResolvedRoom)과 관리자 임베드
       (?vc_role=teacher) 두 경로에서만 세팅됐다. 로비에서 그냥 로그인해 들어오면 undefined 로
       남고, 그 상태로 join-room 을 role:'student' 로 보낸다. 그러면 «강사가 서버에 학생으로
       기록»되어 다음이 한꺼번에 조용히 죽는다:
         · 강사 전용 칩(내 화면 공유·학생 필기 잠금·교재 고르기)이 숨은 채로 남고
         · 교재 페이지 넘기기 화살표(vcMyRole 정확일치 게이트)가 먹지 않고
         · 전체 음소거·집중 모드·필기 잠금이 서버 role 검증에서 버려진다.
       Kaye 화면이 공용방(mangoi-class)이었던 것이 바로 이 경로다(방코드 없이 로비 입장).
       ⚠️ 이름 휴리스틱(vcIsTeacherRole)은 «계정 역할이 아예 없을 때»만 쓴다 — 로그인한
          학생을 이름만 보고 강사로 올리면 교재를 반 전체에 넘겨버릴 수 있다. */
    try {
      /* 🎭 (2026-08-08 Ana ①) 예전엔 `vcMyRole` 이 이미 'teacher' 면 **여기를 통째로 건너뛰었다.**
         이 페이지는 SPA 라 로그아웃·계정 전환을 해도 그 전역이 그대로 남는다 → 한 번 강사였던
         창에서는 누가 들어와도 영원히 강사였다. 계정이 «학생» 이라고 말하면 내려야 한다.
         ⚠️ 관리자 임베드(?vc_role=teacher)만은 예외로 지킨다 — 그건 URL 로 명시된 확정 역할이고,
            그 화면에는 계정 세션이 아예 없을 수 있다. */
      if (!window.__vcRoleFromUrl) {
        var _ru = (window.getCurrentUser ? window.getCurrentUser() : null);
        var _rr = (_ru && _ru.role) || '';
        var _hadAccount = !!_rr;                       // 계정이 역할을 «분명히» 말해 줬는가
        // 🔒 주인(uid)이 맞을 때만 돌려준다. 함수가 아직 없으면(스크립트 순서) 저장값을 쓰지 않는다 —
        //    여기서 예외가 나면 바깥 try 가 삼켜 «역할 판정 전체» 가 조용히 사라진다.
        if (!_rr) { _rr = (typeof window.vcRoleStored === 'function') ? window.vcRoleStored() : ''; }
        if (!_rr) { try { _rr = (window.MangoV3 && MangoV3.user && MangoV3.user.role) || ''; } catch (_) {} }
        _rr = String(_rr).toLowerCase();
        /* 역할 표기가 경로마다 다르다 — 마이페이지는 'teacher', 홈 통합로그인 폴백은 'hq_teacher'.
           정확일치로 보면 hq_teacher 강사가 또 학생 취급을 받는다(2026-08-06 같은 함정). */
        /* 🎛 (2026-08-12 사장님·IT담당자) 관리자 콘솔 로그인(mangoi_admin_session)을 역할 판정에 넣는다.
           [실제 사고] IT 담당자가 관리자로 로그인한 브라우저에서 수업에 들어가 장치 도우미로 강사
           장치를 봐 줘야 하는데, 이 사슬이 관리자 세션을 안 봐서 재입장 때마다 «학생» 으로
           떨어졌다 → 🎛·칭찬이 전부 사라지고, 서버도 장치 명령을 거부(role=student).
           [안전선] ① 계정이 «학생» 이라고 분명히 말하면 조용히 올리지 않는다 — 물어본다
           (Ana ①·Melca 6 과 같은 원칙: 명시된 역할을 침묵으로 뒤집지 않는다. 공용 PC 에
           남은 관리자 세션으로 학생이 승격되는 길을 confirm 한 겹으로 막는다).
           ② 관리자 세션이 없으면 이 블록은 아무것도 바꾸지 않는다 = 기존과 100% 동일. */
        var _admUid = '';
        try { _admUid = String((JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {}).uid || '').trim(); } catch (_) {}
        if (/teacher|tutor/.test(_rr)) window.vcMyRole = 'teacher';
        else if (/^admin$|^hq$|^hq_admin$/.test(_rr)) window.vcMyRole = 'admin';
        else if (_rr) {
          window.vcMyRole = 'student';
          if (_admUid) {
            var _admEn = false; try { _admEn = (typeof getLang === 'function' && getLang() === 'en'); } catch (_) {}
            if (confirm(_admEn
                ? 'Admin console login detected (' + _admUid + ').\nEnter this class as STAFF (device helper / praise tools)?\nCancel = enter as student.'
                : '이 브라우저에 관리자 로그인(' + _admUid + ')이 있습니다.\n스태프(장치 도우미·칭찬 도구)로 입장할까요?\n취소 = 학생으로 입장')) {
              window.vcMyRole = 'admin';
            }
          }
        }
        /* 관리자 세션이 있고 계정 역할이 «비어» 있으면 — 물을 것도 없다, 그 사람이 관리자다.
           (이름 휴리스틱보다 훨씬 강한 근거라서 그 앞에 둔다) */
        else if (_admUid) window.vcMyRole = 'admin';
        /* 🚫 이름 휴리스틱(«아이디에 teacher 가 들어있다»)으로 **올리는** 길을 닫는다.
           로그인한 사람에게 쓰면 «Teacher_Kim 이라는 아이디의 학생» 이 반 전체 교재를 넘긴다.
           로그인이 아예 없는 경우(관리자 임베드·데모)에만 예전처럼 백업으로 둔다. */
        else if (!_ru && typeof vcIsTeacherRole === 'function' && vcIsTeacherRole()) window.vcMyRole = 'teacher';
        else window.vcMyRole = 'student';              // 아무 근거도 없으면 «학생» — 모르면 낮은 쪽이 안전하다
        if ((_hadAccount || window.vcMyRole === 'student') && typeof window.vcRoleRemember === 'function') {
          window.vcRoleRemember(window.vcMyRole);
        }
      }
    } catch (_) {}
    // 🎥 (2026-07-24) 권한 팝업을 입장보다 '먼저' 끝낸다 — 미디어 없는 SDP 고착 방지.
    //   모든 입장 경로(수동 입력·?room=·vc_autojoin·오늘 내 수업)가 이 한 곳을 지난다.
    /* 📶 TURN 발급을 여기서 «걸어만» 둔다 — 카메라 권한 팝업·오늘수업 조회와 겹쳐서 진행된다.
       실제 대기(await)는 피어를 만들기 직전 한 곳에서 한다(아래 «TURN 확보» 주석).
       vcEnsureIceServers 는 진행 중 promise 를 공유하므로 두 번 불러도 fetch 는 한 번이다. */
    try { vcEnsureIceServers(); } catch(_) {}
    try { await window.vcEnsureMediaPermission(); } catch (_) {}
    // 비밀번호 (vc-room-input)는 인증용으로 저장만 함 (실 운영 시 백엔드 검증)
    const vcPassword = document.getElementById('vc-room-input').value.trim();
    // 방번호: 새 필드(vc-roomcode-input)
    // fix (2026-06-01) — 비우면 '랜덤 방'이 아니라 '공용 수업방'으로 입장.
    //   기존엔 비우면 room-랜덤6자리가 생성돼 교사·학생이 서로 다른 방에 들어가 못 만났음.
    //   이제 비우면 모두가 같은 방(mangoi-class)으로 모여 서로 보임. (반/수업별로 나누려면 같은 코드를 입력)
    const roomCodeEl = document.getElementById('vc-roomcode-input');
    const VC_DEFAULT_ROOM = 'mangoi-class';
    let vcTypedRoom = roomCodeEl ? roomCodeEl.value.trim() : '';

    // 🧭 (2026-07-22) 학부모 컴플레인 #4 — 학생이 방코드 없이 입장하면 공용방(mangoi-class)에서
    //    혼자 기다리는 문제. 빈칸 + 학생 + 오늘 예약이 있으면 예약 방으로 자동 교정.
    /* 🚪 (2026-08-06 동시접속 진단) 학생은 «절대» 공용방으로 흘려보내지 않는다.
       [실측] 한 방 정원은 10명(MAX_USERS)이고 전 방 공통이다. 50명이 공용방에 몰리면
              10명만 들어가고 40명이 room-full 로 즉시 거절당한다(운영에서 재현 확인).
       [기존 사고] join_open 이 거짓(=시작 10분 전보다 이르거나 끝난 뒤)이면 아래 폴백으로 떨어져
              학생이 «아무 안내도 없이» 공용방에 들어갔다. 경고 배너는 교사에게만 있었다.
              2026-07-28 19:36 KST 공용방 동시 12명 = 이미 정원을 넘긴 기록이 있다.
       [해결] 학생은 ① 입장창이 열렸으면 예약방 ② 아직 이르면 카운트다운 대기화면
              (vcShowClassGate — 이미 만들어져 있었고 이 경로에서 호출만 안 되고 있었다)
              ③ 예약이 없거나 조회 실패면 안내 후 정지. 어느 경우에도 공용방으로 가지 않는다.
       ⚠️ 교사는 지금처럼 공용 연습방을 계속 쓴다(시연·연습). 대신 정원을 따로 낮췄다(video-call-room.ts). */
    if (!vcTypedRoom) {
      var _stopJoin = false;
      try {
        var _ju = (window.getCurrentUser ? window.getCurrentUser() : null);
        var _jrole = (window.vcMyRole || (_ju && _ju.role) || ((typeof vcIsTeacherRole === 'function' && vcIsTeacherRole()) ? 'teacher' : 'student'));
        /* 🔒 (2026-07-28 강사 피드백) "내 방에 다른 선생님이 들어온다" (Shas·Kaye/mangoi_162)
           [원인] 이 자동 교정이 학생일 때만 돌아서, 교사는 방코드가 빈 채로 아래 공용방(mangoi-class)에
                  들어갔다. 로비는 순간만 보여 방코드를 넣을 방법도 사실상 없다 → 교사 전원이 같은 방에 모임.
           [해결] 교사·관리자도 같은 방식으로 '오늘 내 예약 방'으로 교정한다.
           ⚠️ (2026-08-06) 정확일치로 보면 안 된다 — 역할 표기가 경로마다 다르다.
              마이페이지는 'teacher', 홈 통합로그인 폴백은 'hq_teacher' 를 쓴다(tryAdminLoginFallback).
              예전엔 (_jrole==='teacher') 라 hq_teacher 강사가 «학생» 취급을 받았다. */
        var _isT = /teacher|admin/i.test(String(_jrole));
        var _jq = 'role=' + (_isT ? 'teacher' : 'student');
        if (_ju && _ju.uid) _jq += '&user_id=' + encodeURIComponent(_ju.uid);
        if (vcUsername) _jq += '&student_name=' + encodeURIComponent(vcUsername);
        var _jd = await fetch('/api/class/sessions/today?' + _jq, { credentials: 'include' }).then(function (x) { return x.json(); }).catch(function () { return null; });
        var _jss = (_jd && _jd.sessions) || [];
        var _js = _jd && (_jd.current || _jss.filter(function (s) { return s.join_open; })[0]);
        // 게이트 상태를 기억해 둔다 — 조회가 실패한 다음 번에도 «막을지 말지» 를 알아야 한다.
        if (_jd && _jd.student_gate) window.__vcStudentGate = _jd.student_gate;
        if (_jd) window.__vcRelayAlways = !!_jd.net_relay;

        if (_js && _js.room_id && _js.join_open) {
          vcTypedRoom = _js.room_id;
          if (roomCodeEl) roomCodeEl.value = vcTypedRoom;
          console.log('[vc] 빈 방코드 → 오늘 예약 방으로 자동 교정:', vcTypedRoom, '(role=' + _jrole + ')');
        } else if (_isT) {
          /* 오늘 예약이 없는 교사(연습·시연)는 공용방으로 간다 — 이때는 다른 사람이 들어올 수 있음을
             분명히 알려 준다. 예약된 실제 수업은 위에서 각자 방으로 갈리므로 겹치지 않는다. */
          window.__vcSharedRoomNotice = true;
        } else if (_jd && _jd.student_gate !== 'on') {
          /* 🚪 게이트 꺼짐(기본) = 예전과 100% 동일하게 공용방으로 폴백한다.
             ⛔ 지금 켜면 안 되는 이유: class_schedules 663건 중 «실제 학생 예약» 은 6건뿐이다.
                518건은 학생이 없는 강사 시간표 점유(user_id='lms', student_name=NULL), 140건은 시드.
                이 상태로 켜면 대다수 학생이 "예약된 수업이 없어요" 를 만나 입장 자체를 못 한다.
                카페24 수업을 실제 학생 예약으로 옮긴 뒤 wrangler.toml 의
                VC_STUDENT_ROOM_GATE 를 'on' 으로 바꾸면 아래 차단이 살아난다. */
          console.log('[vc] student_gate=off → 예전 폴백 유지(공용방)');
        } else {
          // ── 학생: 공용방 폴백 금지 (게이트 켜짐) ──
          var _early = _jss.filter(function (s) { return s.status === 'early'; })
                           .sort(function (a, b) { return a.start_ts - b.start_ts; })[0];
          if (_early && typeof vcShowClassGate === 'function') {
            // 아직 이르다 → 카운트다운 대기. 시간이 되면 자동으로 «내» 예약방에 들어간다.
            vcShowClassGate(_early, vcUsername || '학생', 'student');
            _stopJoin = true;
          } else if (_jss.length) {
            /* 🌐 한/영을 «둘 다» 보여 준다. 언어 설정 하나로 갈라 두면, 설정이 어긋난 학생이나
               필리핀 매니저가 대신 봐 줄 때 읽지 못한다(사장님 지시: 무조건 한/영 병기). */
            alert('오늘 수업은 이미 끝났어요. ⏹\n그래도 들어가야 한다면 매니저에게 방 번호를 받아 아래에 입력해 주세요.\n\n'
              + "Today's class has already ended.\nIf you still need to join, ask your manager for the room code and enter it below.");
            _stopJoin = true;
          } else {
            alert('오늘 예약된 수업이 없어요. 🗓️\n예약이 있는데도 이렇게 나오면, 매니저에게 방 번호를 받아 아래에 입력해 주세요.\n\n'
              + 'You have no class booked for today.\nIf you believe this is wrong, ask your manager for the room code and enter it below.');
            _stopJoin = true;
          }
        }
      } catch (e) {
        /* 🔴 조회 실패. 게이트가 켜져 있을 때만 학생을 멈춘다.
           예전에는 무조건 «공용방 폴백 유지» 였고, 그게 학생을 남의 방에 밀어 넣던 길이다.
           단 게이트가 꺼진 동안에는 그 예전 동작을 그대로 지켜야 한다(dormant 보장).
           게이트 값은 직전 성공 응답에서 기억해 둔 것을 쓴다 — 지금은 물어볼 수 없으므로. */
        console.warn('[vc] 오늘 수업 조회 실패', e);
        if (window.__vcStudentGate === 'on' && !/teacher|admin/i.test(String(window.vcMyRole || ''))) {
          alert('수업 정보를 불러오지 못했어요. 📶\n잠시 후 다시 시도하거나, 매니저에게 받은 방 번호를 아래에 입력해 주세요.\n\nCould not load your class. Please retry, or enter the room code you were given.');
          _stopJoin = true;
        }
      }
      if (_stopJoin) return;
    }

    // 🗓️ (2026-07-22) 컴플레인 #4 — 지난 날짜가 박힌 링크(class-…-어제) 재사용 시 빈 방 입장 차단.
    //    room_id 에 날짜가 포함되므로 어제 링크로 들어오면 아무도 없는 방에서 기다리게 된다.
    //    오늘 날짜가 아니면 '오늘 내 수업' 자동 해석으로 넘긴다.
    {
      var _staleM = /^class-\d+-(\d{8})$/.exec(vcTypedRoom || '');
      if (_staleM) {
        var _kk = new Date(Date.now() + 9 * 3600 * 1000);
        var _p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var _tymd = '' + _kk.getUTCFullYear() + _p2(_kk.getUTCMonth() + 1) + _p2(_kk.getUTCDate());
        if (_staleM[1] !== _tymd) {
          alert('⚠️ 이 수업 링크는 지난 날짜의 링크예요.\n오늘 예약된 수업으로 다시 연결할게요.');
          if (roomCodeEl) roomCodeEl.value = '';
          if (typeof vcJoinMyClass === 'function') { vcJoinMyClass(); return; }
          return;
        }
      }
    }

    vcRoomId = vcTypedRoom || VC_DEFAULT_ROOM;

    // 🔒 Phase RM 3단계 — 예약제 방(class-*)에 '남의 방'으로 잘못 들어가는 것 차단.
    //   정상 예약자·담당 교사·관리자는 통과, 예약 없음/신원 불명이면 통과(fail-open) → 정상수업 방해 금지.
    if (/^class-\d+-\d{8}$/.test(vcRoomId)) {
      try {
        var _vu = (window.getCurrentUser ? window.getCurrentUser() : null);
        var _vrole = (window.vcMyRole || (_vu && _vu.role) || 'student');
        var _vq = 'room_id=' + encodeURIComponent(vcRoomId) + '&role=' + encodeURIComponent(_vrole);
        if (_vu && _vu.uid) _vq += '&user_id=' + encodeURIComponent(_vu.uid);
        if (vcUsername) _vq += '&student_name=' + encodeURIComponent(vcUsername);
        var _vres = await fetch('/api/class/verify-room?' + _vq, { credentials: 'include' }).then(function (x) { return x.json(); }).catch(function () { return null; });

        /* 🎭 (2026-08-08 강사 피드백 Teacher Ana ① 「먼저 들어온 학생이 강사 역할을 받는다」)
           ─────────────────────────────────────────────────────────────────────────────
           여기까지의 역할 판정은 전부 «이 브라우저가 기억하는 것» 이다. 그 기억이 남의 것이면
           (공용 PC 에 강사가 다녀간 뒤) 학생이 강사로 입장하고, 서버 로스터에도 그렇게 박힌다.
           이 게이트는 이미 예약(class_schedules)을 읽어 «이 사람이 학생인지 교사인지» 를 안다.
           그 답을 여기서 쓴다 — 서버가 «학생» 이라고 확인해 주면 브라우저 기억보다 그쪽이 옳다.

           🔑 «내리는» 데만 쓴다. 올리는 데 쓰면 이름 매칭이 한 번 어긋난 것으로 학생이 강사가 되어
              지금 고치는 사고를 반대 방향으로 다시 만든다(서버도 그래서 teacher 는 null 로 둔다).
           🔑 입장은 막지 않는다 — 이 게이트의 1원칙(수업 방해 금지)은 그대로다. 역할만 바로잡는다.
           ⚠️ 관리자·참관(admin/observer)은 서버가 privileged 로 먼저 빠져 resolved_role 이 없다. */
        try {
          if (_vres && _vres.resolved_role === 'student' &&
              (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin')) {
            console.warn('[vc-role] 서버 확인 결과 이 예약의 «학생» → 강사 주장 취소 (이전 값: ' + window.vcMyRole + ')');
            window.vcMyRole = 'student';
            if (typeof window.vcRoleRemember === 'function') window.vcRoleRemember('student');
            var _dmEn = false;
            try { _dmEn = (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e2) {}
            if (typeof mangoToast === 'function') {
              mangoToast(_dmEn ? 'Joining as a student for this class.' : '이 수업에는 학생으로 입장합니다.');
            }
          }
        } catch (e3) {}
        /* 🌐 (2026-07-28 실사고) 안내 문구를 역할별로 나누고 한/영 병기.
           [문제] 차단 문구가 학생 전제로만 쓰여 있어 "🎓 오늘 내 수업 바로 입장 버튼으로 들어가세요" 라고
                  안내했는데, 그 버튼은 학생 화면에만 있고 강사 화면에는 없다 → 없는 버튼을 찾게 만들었다.
                  게다가 한국어 전용이라 외국인 강사는 브라우저 번역을 켜야 읽을 수 있었다(강사 다수가 외국인). */
        var _vEn = false;
        try { _vEn = (localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en'; } catch (e) {}
        /* role 표기가 경로마다 다르다 — 마이페이지 입장 버튼은 'teacher', 홈 통합로그인 폴백은 'hq_teacher'.
           정확일치로 보면 새 경로에서 강사가 학생용 안내(없는 버튼)를 보게 된다. */
        var _vIsTeacher = /teacher/.test(String(_vrole)) || _vrole === 'admin';
        /* 🔒 (2026-07-28) 담당 지정이 어긋난 강사는 '막지 않고 알리기만' 한다 — 수업 방해 금지 원칙.
           서버가 authorized:'unknown' + reason:'teacher_not_assigned' 로 돌려준다. */
        if (_vres && _vres.reason === 'teacher_not_assigned') {
          alert(_vEn
            ? ('⚠️ This class is booked under ' + (_vres.owner_name || 'another student')
               + ', and you are not listed as its assigned teacher.\nYou can still enter now — the class will not be blocked.\nPlease ask the office to link your account to this booking.')
            : ('⚠️ 이 수업은 ' + (_vres.owner_name || '다른 학생') + '님 예약인데, 담당 강사로 등록돼 있지 않아요.\n'
               + '그래도 지금 바로 입장할 수 있어요 — 수업은 막지 않습니다.\n수업 후 관리자에게 담당 강사 연결을 요청해 주세요.'));
          /* 막지 않고 계속 진행 */
        } else if (_vres && _vres.authorized === false) {
          if (_vIsTeacher) {
            alert(_vEn
              ? ('⚠️ This room belongs to ' + (_vres.owner_name || 'another student') + "'s booked class.\n"
                 + 'Open "🎥 Enter Class" on your My Page, or type the room code you were given.')
              : ('⚠️ 이 방은 ' + (_vres.owner_name || '다른 학생') + '님의 예약 수업이에요.\n'
                 + '마이페이지의 "🎥 수업 입장" 을 누르시거나, 전달받은 방 번호를 직접 입력해 주세요.'));
          } else {
            alert(_vEn
              ? ('⚠️ This room belongs to ' + (_vres.owner_name || 'another student') + "'s booked class.\n"
                 + 'Please use the "🎓 Enter My Class Now" button to join your own class.')
              : ('⚠️ 이 방은 ' + (_vres.owner_name || '다른 학생') + '님의 예약 수업이에요.\n'
                 + '회원님 수업은 "🎓 오늘 내 수업 바로 입장" 버튼으로 들어가 주세요.'));
          }
          return;
        }
      } catch (e) { /* 검증 실패 시 통과(정상 수업 방해 금지) */ }
    }


    // 🔒 자동저장 처리 — 체크 상태에 따라 저장/제거
    try {
      const ckSave = document.getElementById('vc-save-id');
      const ckAuto = document.getElementById('vc-auto-login');
      if (ckSave && ckSave.checked) {
        localStorage.setItem(VC_AUTH_KEYS.saveId, '1');
        localStorage.setItem(VC_AUTH_KEYS.uid, vcUsername);
        // 방번호도 함께 저장 (편의)
        try { localStorage.setItem('mangoi_vc_roomcode', vcRoomId); } catch{}
      }
      if (ckAuto && ckAuto.checked) {
        localStorage.setItem(VC_AUTH_KEYS.autoLogin, '1');
        localStorage.setItem(VC_AUTH_KEYS.pw, vcPassword);
      }
    } catch {}

    showView('view-videocall-call');
    document.body.classList.add('vc-in-call');
    try{ window.vcApplyLiteDefault && window.vcApplyLiteDefault(); }catch(e){}   // ⚡ 수업 입장 = 가벼운 모드 기본
    document.getElementById('vc-room-name').textContent = vcRoomId;
    // 🖥 (2026-07-23) 수업에 들어오면 전체화면 — 설정에서 껐으면 건너뛴다.
    //    브라우저가 사용자 조작 없는 요청을 막으면, 다음 터치 때 한 번 더 시도한다.
    try { window.vcGoFullscreen && window.vcGoFullscreen(); } catch(e){}
    /* 🔒 (2026-07-28) 오늘 예약이 없어 '공용 연습방'으로 들어온 교사에게만 알린다 —
       "내 방에 다른 선생님이 들어왔다"(Shas·Kaye)의 실제 이유가 이것이다.
       ※ 이 블록은 위 전체화면 호출보다 뒤에 둔다 — 하니스가 'vc-in-call 추가 → 전체화면 호출'
         인접(400자)을 검사하므로, 사이에 코드를 넣으면 그 보장이 깨진다. */
    try {
      if (window.__vcSharedRoomNotice) {
        window.__vcSharedRoomNotice = false;
        var _en0 = (typeof getLang === 'function' && getLang() === 'en');
        var _nm = document.getElementById('vc-room-name');
        if (_nm && _nm.parentNode) {
          var _tag = document.createElement('span');
          _tag.textContent = _en0 ? '  (shared practice room - others may join)' : '  (공용 연습방 · 다른 사람도 들어올 수 있어요)';
          _tag.style.cssText = 'font-size:11.5px;font-weight:700;color:#fbbf24;margin-left:6px';
          _nm.parentNode.insertBefore(_tag, _nm.nextSibling);
        }
        setTimeout(function(){
          alert(_en0
            ? 'You have no class booked for today, so you entered the shared practice room.\n\nOther teachers can also enter this room. For a real class, enter from your booked class - then you get your own room.'
            : '오늘 예약된 수업이 없어 공용 연습방으로 들어왔어요.\n\n이 방에는 다른 선생님도 들어올 수 있습니다.\n실제 수업은 예약된 수업으로 입장하시면 선생님만의 방으로 들어갑니다.');
        }, 900);
      }
    } catch(e){}
    try { if (window.mangoiClassEntryNotice) setTimeout(window.mangoiClassEntryNotice, 600); } catch(e){}
    /* 🔒 (2026-08-07) 역할이 정해졌으니 강사 전용 칩을 여기서 «반드시» 한 번 그린다.
       예전엔 vcEnterResolvedRoom·?vc_role= 두 경로에서만 불렀다 = 로비 입장 강사는 영영 못 봤다.
       칩은 정적 HTML 이라 DOM 생성 대기가 필요 없지만, 다른 스크립트가 늦게 로드되는 경우가
       있어 짧은 재시도 2번만 둔다(타이머 상주 없음 = 수업 중 부하 0). */
    try {
      var _chipTick = function(){ try { if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender(); } catch(_){} };
      _chipTick(); setTimeout(_chipTick, 900); setTimeout(_chipTick, 3000);
    } catch(e){}
    requestWakeLock(); // 화면 꺼짐 방지 활성화

    // 📱 모바일에서 가로 모드 자동 시도 (지원 시) — 사용자 제스처 직후라 가능
    try {
      const isMobile = window.matchMedia('(max-width: 920px)').matches;
      if (isMobile && screen.orientation && typeof screen.orientation.lock === 'function') {
        // Fullscreen + Lock 조합 (안 되면 silently 실패)
        const el = document.documentElement;
        const fsP = (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen)
          ? (el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : el.mozRequestFullScreen()))
          : Promise.resolve();
        Promise.resolve(fsP).then(() => {
          try { screen.orientation.lock('landscape').catch(() => {}); } catch(e){}
        }).catch(() => {});
      }
      // 모바일 가로모드일 때 하단 액션 바 + 그립 핸들 표시
      function _vcUpdateBottomBar(){
        const bar = document.getElementById('vc-bottom-actions');
        const grip = document.getElementById('vc-bottom-grip');
        if (!bar) return;
        const isMobile = window.matchMedia('(max-width: 920px)').matches;
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        const active = isMobile && isLandscape && document.body.classList.contains('vc-in-call');
        bar.style.display = active ? 'flex' : 'none';
        if (grip) grip.style.display = active ? 'flex' : 'none';
      }
      _vcUpdateBottomBar();
      window.addEventListener('resize', _vcUpdateBottomBar);
      window.addEventListener('orientationchange', _vcUpdateBottomBar);

      // ════════════════════════════════════════════════
      // 🎬 하단 액션바 — 자동 숨김 + 손가락 스와이프 토글
      //   1) 입장 직후 3초 노출 → 자동 슬라이드 다운
      //   2) 그립 핸들 위로 살짝 밀면 슬라이드 업
      //   3) 액션바 빈 공간 또는 그립 아래로 스와이프 → 다시 슬라이드 다운
      //   4) 액션바 보일 때 8초 동안 조작 없으면 자동 숨김
      // ════════════════════════════════════════════════
      let _vcAutoHideTimer = null;
      window.vcBottomActionsToggle = function(forceShow){
        const bar = document.getElementById('vc-bottom-actions');
        if (!bar) return;
        const shouldShow = (typeof forceShow === 'boolean') ? forceShow : !bar.classList.contains('show');
        bar.classList.toggle('show', shouldShow);
        document.body.classList.toggle('vc-actions-open', shouldShow);
        clearTimeout(_vcAutoHideTimer);
        if (shouldShow) {
          // 8초 동안 아무 조작 없으면 자동 숨김
          _vcAutoHideTimer = setTimeout(() => {
            bar.classList.remove('show');
            document.body.classList.remove('vc-actions-open');
          }, 8000);
        }
      };
      // 액션바 버튼 누르면 자동 숨김 타이머 리셋
      const _barEl = document.getElementById('vc-bottom-actions');
      if (_barEl) {
        _barEl.addEventListener('click', () => {
          if (_barEl.classList.contains('show')) vcBottomActionsToggle(true);
        });
      }
      // 입장 직후 3초만 노출 → 자동 숨김
      setTimeout(() => { vcBottomActionsToggle(true); }, 200);
      setTimeout(() => { vcBottomActionsToggle(false); }, 3500);

      // 🤚 그립 핸들 스와이프 처리
      const _grip = document.getElementById('vc-bottom-grip');
      if (_grip) {
        let gripStartY = 0, gripDeltaY = 0;
        _grip.addEventListener('touchstart', (e) => {
          gripStartY = e.touches[0].clientY;
          gripDeltaY = 0;
        }, { passive: true });
        _grip.addEventListener('touchmove', (e) => {
          gripDeltaY = e.touches[0].clientY - gripStartY;
        }, { passive: true });
        _grip.addEventListener('touchend', () => {
          if (gripDeltaY < -20) vcBottomActionsToggle(true);   // 위로 ↑
          else if (gripDeltaY > 20) vcBottomActionsToggle(false); // 아래로 ↓
          else vcBottomActionsToggle();                          // 짧은 탭 → 토글
        });
      }
      // 액션바를 아래로 스와이프하면 숨김
      if (_barEl) {
        let barStartY = 0;
        _barEl.addEventListener('touchstart', (e) => {
          barStartY = e.touches[0].clientY;
        }, { passive: true });
        _barEl.addEventListener('touchend', (e) => {
          const dy = (e.changedTouches[0]?.clientY || 0) - barStartY;
          if (dy > 30) vcBottomActionsToggle(false);
        });
      }
    } catch(e){}

    // 📱 모바일 가로모드 액션 헬퍼들 (안전한 폴백 — 기존 함수가 있으면 그것을 호출)
    window.vcMobileTabSwitch = window.vcMobileTabSwitch || function(name){
      // 기존 탭 시스템 검색해서 클릭 시뮬레이트
      const map = { whiteboard:'칠판', material:'교재', video:'동영상', pronunciation:'발음연습', game:'학생게임', bg:'배경화면', warmup:'AI 웜업' };
      const ko = map[name] || name;
      const tabs = document.querySelectorAll('.tab-bar > *, .vc-tab, [data-tab]');
      for (const t of tabs) {
        if ((t.textContent || '').includes(ko)) { try { t.click(); } catch(e){} return; }
      }
    };
    window.vcMobileToggleMic = function(){
      // 실제 헤더의 마이크 토글 호출
      if (typeof vcToggleMic === 'function') { try { vcToggleMic(); return; } catch(e){} }
      const btn = document.getElementById('vc-btn-mic') || document.querySelector('[onclick*="vcToggleMic"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileToggleCam = function(){
      if (typeof vcToggleCam === 'function') { try { vcToggleCam(); return; } catch(e){} }
      const btn = document.getElementById('vc-btn-cam') || document.querySelector('[onclick*="vcToggleCam"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileToggleChat = function(){
      if (typeof vcToggleChat === 'function') { try { vcToggleChat(); return; } catch(e){} }
      const btn = document.getElementById('vc-btn-chat') || document.querySelector('[onclick*="vcToggleChat"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileDiagnoseMic = function(){
      if (typeof vcDiagnoseMic === 'function') { try { vcDiagnoseMic(); return; } catch(e){} }
      const btn = document.querySelector('[onclick*="vcDiagnoseMic"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileScreenshot = function(){
      const btn = document.querySelector('[onclick*="screenshot"], [onclick*="capture"], #vc-screenshot-btn');
      if (btn) try { btn.click(); } catch(e){}
      else if (typeof wbSave === 'function') try { wbSave(); } catch(e){}
    };

    // 📤 교재 폴더용 헬퍼들 — 모두 기존 함수에 위임 (안전한 폴백 포함)
    window.vcMobileUploadPDF = function(){
      // PDF 탭으로 먼저 전환한 뒤 file input 클릭
      if (typeof vcSwitchTab === 'function') try { vcSwitchTab('pdf'); } catch(e){}
      setTimeout(() => {
        const el = document.getElementById('pdf-upload');
        if (el) el.click();
        else alert('교재 업로드 버튼을 찾지 못했습니다');
      }, 120);
    };
    window.vcMobileOpenLibrary = function(){
      if (typeof openTextbookLibrary === 'function') try { openTextbookLibrary(); return; } catch(e){}
      const btn = document.querySelector('[onclick*="openTextbookLibrary"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileTabSwitch = function(name){
      // 🎯 집중 모드 — 학생 탭 이탈 차단 (모바일 경로)
      if (window.__vcFocusLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
        try { if (typeof showToast === 'function') showToast((localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en' ? '🎯 Focus mode — follow your teacher' : '🎯 집중 모드예요 — 선생님 화면을 따라가요'); } catch(e){}
        return;
      }
      if (typeof vcSwitchTab === 'function') try { vcSwitchTab(name); } catch(e){}
    };
    window.vcMobilePdfPrev = function(){
      if (typeof pdfPrevPage === 'function') try { pdfPrevPage(); } catch(e){}
    };
    window.vcMobilePdfNext = function(){
      if (typeof pdfNextPage === 'function') try { pdfNextPage(); } catch(e){}
    };
    window.vcMobilePdfZoomIn = function(){
      if (typeof pdfZoomIn === 'function') try { pdfZoomIn(); } catch(e){}
    };
    window.vcMobilePdfZoomOut = function(){
      if (typeof pdfZoomOut === 'function') try { pdfZoomOut(); } catch(e){}
    };
    window.vcMobilePdfZoomReset = function(){
      if (typeof pdfZoomReset === 'function') try { pdfZoomReset(); } catch(e){}
    };
    window.vcMobilePdfTwoPage = function(){
      if (typeof pdfSetPagesPerView === 'function') try { pdfSetPagesPerView(2, null); } catch(e){}
    };
    window.vcMobilePdfClearAnno = function(){
      if (typeof pdfClearAnno === 'function') try { pdfClearAnno(); } catch(e){}
    };
    window.vcMobilePdfStopShare = function(){
      if (typeof pdfStopShare === 'function') try { pdfStopShare(); } catch(e){}
    };

    // 🤚 PDF/칠판 터치 드래그 — 모든 모바일 환경에서 손가락 한 손가락으로 상하/좌우 이동
    (function setupPdfTouchPan(){
      const setup = () => {
        const wrap = document.getElementById('pdf-scroll-wrap');
        if (!wrap || wrap.dataset.touchPanReady === '1') return;
        wrap.dataset.touchPanReady = '1';
        let startX = 0, startY = 0, scrollX = 0, scrollY = 0, dragging = false;
        wrap.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          // 그리기 모드면 패스 (펜으로 그리는 중)
          const annoActive = document.querySelector('.pdf-anno.active');
          if (annoActive) return;
          const t = e.touches[0];
          startX = t.clientX; startY = t.clientY;
          scrollX = wrap.scrollLeft; scrollY = wrap.scrollTop;
          dragging = true;
          wrap.classList.add('dragging');
        }, { passive: true });
        wrap.addEventListener('touchmove', (e) => {
          if (!dragging || e.touches.length !== 1) return;
          const t = e.touches[0];
          wrap.scrollLeft = scrollX - (t.clientX - startX);
          wrap.scrollTop  = scrollY - (t.clientY - startY);
        }, { passive: true });
        const end = () => { dragging = false; wrap.classList.remove('dragging'); };
        wrap.addEventListener('touchend', end);
        wrap.addEventListener('touchcancel', end);

        // 마우스 드래그도 동일하게 지원 (태블릿/노트북 터치패드)
        let mDown = false;
        wrap.addEventListener('mousedown', (e) => {
          const annoActive = document.querySelector('.pdf-anno.active');
          if (annoActive) return;
          mDown = true; startX = e.clientX; startY = e.clientY;
          scrollX = wrap.scrollLeft; scrollY = wrap.scrollTop;
          wrap.classList.add('dragging');
        });
        wrap.addEventListener('mousemove', (e) => {
          if (!mDown) return;
          wrap.scrollLeft = scrollX - (e.clientX - startX);
          wrap.scrollTop  = scrollY - (e.clientY - startY);
        });
        const mEnd = () => { mDown = false; wrap.classList.remove('dragging'); };
        wrap.addEventListener('mouseup', mEnd);
        wrap.addEventListener('mouseleave', mEnd);

        // 좌우 스와이프 → 페이지 넘김 (수평 이동이 크고 스크롤이 가장자리일 때만)
        let swStartX = 0, swStartY = 0, swStartTime = 0;
        wrap.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          swStartX = e.touches[0].clientX;
          swStartY = e.touches[0].clientY;
          swStartTime = Date.now();
        }, { passive: true });
        wrap.addEventListener('touchend', (e) => {
          if (!e.changedTouches.length) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - swStartX;
          const dy = t.clientY - swStartY;
          const dt = Date.now() - swStartTime;
          if (dt > 500) return; // 천천히 드래그한 건 페이지 넘김 아님
          if (Math.abs(dx) < 100 || Math.abs(dx) < Math.abs(dy) * 2) return;
          const atLeftEdge = wrap.scrollLeft <= 1;
          const atRightEdge = wrap.scrollLeft >= (wrap.scrollWidth - wrap.clientWidth - 1);
          if (dx > 100 && atLeftEdge && typeof pdfPrevPage === 'function') {
            try { pdfPrevPage(); } catch(e){}
          } else if (dx < -100 && atRightEdge && typeof pdfNextPage === 'function') {
            try { pdfNextPage(); } catch(e){}
          }
        });
        // ph260: 📏 Pinch-to-zoom + 더블탭 reset
        let pinchStartDist = 0;
        let pinchStartZoom = 1;
        let pinching = false;
        function dist(t1, t2){
          var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
          return Math.sqrt(dx*dx + dy*dy);
        }
        wrap.addEventListener('touchstart', function(e){
          if (e.touches.length === 2) {
            pinching = true;
            pinchStartDist = dist(e.touches[0], e.touches[1]);
            pinchStartZoom = (typeof window.pdfGetZoom === 'function') ? window.pdfGetZoom() : 1;
            dragging = false;
          }
        }, { passive: true });
        wrap.addEventListener('touchmove', function(e){
          if (!pinching || e.touches.length !== 2) return;
          e.preventDefault();
          var d = dist(e.touches[0], e.touches[1]);
          var ratio = d / (pinchStartDist || 1);
          var newZoom = pinchStartZoom * ratio;
          if (newZoom < 0.05) newZoom = 0.05;
          if (newZoom > 5) newZoom = 5;
          if (typeof window._pinchRaf !== 'undefined') cancelAnimationFrame(window._pinchRaf);
          window._pinchRaf = requestAnimationFrame(function(){
            if (typeof window.pdfSetZoom === 'function') window.pdfSetZoom(newZoom);   // 렌더까지 함께
            else if (typeof window.pdfRender === 'function') window.pdfRender();
          });
        }, { passive: false });
        wrap.addEventListener('touchend', function(e){
          if (pinching && e.touches.length < 2) {
            pinching = false;
            console.log('[ph260] pinch end — zoom=' + Math.round(((window.pdfGetZoom && window.pdfGetZoom())||1)*100) + '%');
          }
        });

        // 더블탭 → 100% reset (pinch zoom 후 빠르게 원상복구)
        var lastTap = 0;
        wrap.addEventListener('touchend', function(e){
          if (e.changedTouches.length !== 1) return;
          var now = Date.now();
          if (now - lastTap < 300) {
            // 더블탭 감지
            if (typeof window.pdfSetZoom === 'function') window.pdfSetZoom(1);
            else if (typeof window.pdfRender === 'function') window.pdfRender();
            console.log('[ph260] 더블탭 → zoom 100% reset');
            lastTap = 0;
            e.preventDefault && e.preventDefault();
          } else {
            lastTap = now;
          }
        });

        console.log('[vc] PDF touch pan + swipe + ph260 pinch zoom ready');
      };
      // DOM 이 아직 안 만들어졌을 수 있어 약간 지연
      setTimeout(setup, 300);
      setTimeout(setup, 1500);
      setTimeout(setup, 3000);
    })();
    window.vcMobileToggleMore = function(){
      const m = document.getElementById('vc-more-menu');
      if (m) m.classList.toggle('show');
    };
    // 바깥 클릭 시 더보기 메뉴 닫기
    document.addEventListener('click', (e) => {
      const m = document.getElementById('vc-more-menu');
      if (!m || !m.classList.contains('show')) return;
      if (m.contains(e.target)) return;
      if (e.target.closest('[onclick*="vcMobileToggleMore"]')) return;
      m.classList.remove('show');
    });

    // ════════════════════════════════════════════════════
    // 📂 모바일 가로모드 폴더 시스템 — 5개 큰 폴더 + 펼침 시트
    // ════════════════════════════════════════════════════
    const VC_FOLDERS = {
      write: {
        title: '✏️ 필기도구 (칠판)',
        items: [
          { icon:'✏️', label:'펜', onclick:`vcCanvasTool('pen')` },
          { icon:'🧽', label:'지우개', onclick:`vcCanvasTool('eraser')` },
          { icon:'📏', label:'선', onclick:`vcCanvasTool('line')` },
          { icon:'⬜', label:'사각형', onclick:`vcCanvasTool('rect')` },
          { icon:'⭕', label:'원', onclick:`vcCanvasTool('circle')` },
          { icon:'🔴', label:'빨강', onclick:`vcCanvasColor('#ef4444')` },
          { icon:'🟢', label:'초록', onclick:`vcCanvasColor('#10b981')` },
          { icon:'🔵', label:'파랑', onclick:`vcCanvasColor('#3b82f6')` },
          { icon:'⚫', label:'검정', onclick:`vcCanvasColor('#000000')` },
          { icon:'🟡', label:'노랑', onclick:`vcCanvasColor('#fbbf24')` },
          { icon:'🗑', label:'전체 지우기', onclick:`vcCanvasClear()` },
          { icon:'💾', label:'저장', onclick:`vcCanvasSave()` },
        ],
      },
      material: {
        title: '📄 교재',
        items: [
          { icon:'📤', label:'교재 업로드', onclick:`vcMobileUploadPDF()` },
          { icon:'📚', label:'라이브러리', onclick:`vcMobileOpenLibrary()` },
          { icon:'📄', label:'교재 열기', onclick:`vcMobileTabSwitch('pdf')` },
          { icon:'◀ ', label:'이전 페이지', onclick:`vcMobilePdfPrev()` },
          { icon:'▶ ', label:'다음 페이지', onclick:`vcMobilePdfNext()` },
          { icon:'🔍+', label:'확대', onclick:`vcMobilePdfZoomIn()` },
          { icon:'🔍−', label:'축소', onclick:`vcMobilePdfZoomOut()` },
          { icon:'1:1', label:'원래 크기', onclick:`vcMobilePdfZoomReset()` },
          { icon:'📑', label:'2페이지 보기', onclick:`vcMobilePdfTwoPage()` },
          { icon:'🗑', label:'주석 지우기', onclick:`vcMobilePdfClearAnno()` },
          { icon:'❌', label:'공유 중지', onclick:`vcMobilePdfStopShare()` },
          { icon:'📷', label:'화면 캡처', onclick:`vcMobileScreenshot()` },
        ],
      },
      learn: {
        title: '📚 학습도구',
        items: [
          { icon:'🎬', label:'동영상', onclick:`vcMobileTabSwitch('video')` },
          { icon:'🎲', label:'학생게임', onclick:`vcMobileTabSwitch('game')` },
          { icon:'🎨', label:'배경화면', onclick:`vcMobileTabSwitch('bg')` },
          { icon:'🗣️', label:'AI 웜업', onclick:`vcMobileTabSwitch('warmup')` },
          { icon:'📝', label:'칠판', onclick:`vcMobileTabSwitch('whiteboard')` },
        ],
      },
      // 채팅·음성 폴더 삭제 — 동일 기능이 상단 헤더에 있어 중복

      screen: {
        title: '🖥️ 화면 공유 · 화면 분할',
        items: [
          /* 🖥 (2026-08-07 Kaye 5번) "화면 공유 버튼이 또 사라졌다"
             [실제] 하단 독의 [화면공유] 버튼은 이 시트를 여는데, 시트 안엔 «화면 분할»밖에
                    없었다. 진짜 화면 공유(getDisplayMedia)는 상단 탭바 칩에만 있었고 그 칩은
                    역할 미확정으로 숨어 있었다 → 강사 입장에선 «없어진» 것이 맞다.
             누르는 자리에 진짜 기능을 둔다. 학생이 눌러도 vcShareMyScreen 이 스스로 막는다. */
          { icon:'🖥️', label:'내 컴퓨터 화면 공유 (Share my screen)', onclick:`vcShareMyScreen()` },
          { icon:'🟦', label:'1/4 화면', onclick:`vcScreenSet('quarter')` },
          { icon:'🟦', label:'1/2 화면', onclick:`vcScreenSet('half')` },
          { icon:'🟦', label:'3/4 화면', onclick:`vcScreenSet('threequarter')` },
          /* 👥 (2026-07-30 강사 피드백 Kaye 18번) "줌·보다처럼 참가자 전체 보기를 넣어달라"
         → 이 '전체' 모드가 바로 그 기능이었다(얼굴이 화면 전체를 채움). 라벨이 '전체' 뿐이라
           무엇의 전체인지 알 수 없었고 메뉴에 숨어 있어 못 찾은 것 → 이름을 분명히 한다. */
      { icon:'👥', label:'참가자 전체 보기 (Gallery)', onclick:`vcScreenSet('full')` },
          { icon:'📌', label:'PIP', onclick:`vcScreenSet('pip')` },
          { icon:'👤', label:'솔로', onclick:`vcScreenSet('solo')` },
          /* 📝📖 (2026-07-30 강사 피드백 Jane) "교재나 칠판만 따로 크게 볼 수 없다 — 같이 커져서 집중이 어렵다"
             → 이 두 모드가 바로 '하나만 크게'다(다른 쪽을 숨겨 화면을 통째로 씀). 라벨이 '칠판만'·'교재만'
               뿐이라 '크게 보는 기능'인 줄 몰랐다 → 이름에 '크게'를 넣어 분명히 한다.
             ※ 교재 내용 자체 확대는 Ctrl(⌘)+휠 로 따로 되고, 그때 다른 화면 요소는 커지지 않는다. */
          { icon:'📝', label:'칠판만 크게 (Board only)', onclick:`vcScreenSet('boardonly')` },
          { icon:'📖', label:'교재만 크게 (Book only)', onclick:`vcScreenSet('bookonly')` },
        ],
      },
    };

    window.vcFolderOpen = function(key) {
      const folder = VC_FOLDERS[key];
      if (!folder) return;
      const sheet = document.getElementById('vc-folder-sheet');
      const grid = document.getElementById('vc-folder-grid');
      const title = document.getElementById('vc-folder-title');
      if (!sheet || !grid || !title) return;
      // 토글: 같은 버튼(폴더)이 이미 열려 있으면 다시 누르면 닫힘
      if (sheet.classList.contains('show') && sheet.dataset.folderKey === key) {
        vcFolderClose();
        return;
      }
      sheet.dataset.folderKey = key;
      title.textContent = folder.title;
      grid.innerHTML = folder.items.map(it => `
        <button onclick="${it.onclick};vcFolderClose()">
          <span class="ficon">${it.icon}</span>
          <span>${it.label}</span>
        </button>`).join('');
      sheet.classList.add('show');
    };
    window.vcFolderClose = function() {
      const sheet = document.getElementById('vc-folder-sheet');
      if (sheet) { sheet.classList.remove('show'); sheet.dataset.folderKey = ''; }
    };

    // 폴더 시스템용 헬퍼들 — (2026-06-19) 모바일 칠판 도구가 안 먹던 문제 수정.
    //   기존엔 [onclick*="clear"] 처럼 소문자로 찾아 wbClear()(대문자 C)와 매칭 실패 → 동작 안 함.
    //   이제 전역 함수(wbSetTool/wbClear/wbSave)를 직접 호출하고, 실패 시에만 버튼 클릭으로 폴백.
    window.vcCanvasTool = function(tool){
      // wbSetTool 은 event.target 을 쓰므로 직접 호출 대신 정확한 칠판 버튼을 클릭(이벤트 제공)
      var btn = document.querySelector(`.wb-toolbar button[onclick*="'${tool}'"]`)
             || document.querySelector(`[onclick*="wbSetTool('${tool}')"]`);
      if (btn) { try { btn.click(); return; } catch(e){} }
      try { if (typeof wbSetTool === 'function') wbSetTool(tool); } catch(e){}
    };
    window.vcCanvasColor = function(color){
      const input = document.getElementById('wb-color') || document.querySelector('input[type="color"]');
      if (input) { input.value = color; input.dispatchEvent(new Event('input', {bubbles:true})); }
    };
    window.vcCanvasClear = function(){
      try { if (typeof wbClear === 'function') { wbClear(); return; } } catch(e){}
      const btn = document.querySelector('[onclick*="wbClear"], [onclick*="전체"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcCanvasSave = function(){
      try { if (typeof wbSave === 'function') { wbSave(); return; } } catch(e){}
      const btn = document.querySelector('[onclick*="wbSave"], [onclick*="저장"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    // 🔧 화면 분할 — 모바일 PIP 모드 6종 + 데스크탑 호환
    window.vcScreenSet = function(mode){
      const row = document.querySelector('.vc-main-row');
      if (!row) {
        console.warn('[vcScreenSet] .vc-main-row not found');
        return;
      }
      // 모든 모드 클래스 초기화
      row.classList.remove('video-quarter','video-half','video-threequarter','video-full','video-pip','video-solo','video-facepip');
      // 새 모드 적용
      if (mode === 'quarter')         row.classList.add('video-quarter');
      else if (mode === 'half')       row.classList.add('video-half');
      else if (mode === 'threequarter') row.classList.add('video-threequarter');
      else if (mode === 'full')       row.classList.add('video-full');
      else if (mode === 'pip')        row.classList.add('video-pip');
      else if (mode === 'facepip')    row.classList.add('video-facepip');
      else if (mode === 'solo')       row.classList.add('video-solo');
      // 🙈 (2026-07-14) 얼굴 화면 숨기기 — 솔로 레이아웃 재활용(내 화면만, 송출은 계속)
      else if (mode === 'hidefaces') {
        row.classList.add('video-solo');
        try { if (typeof vcSetContentCollapsed === 'function') vcSetContentCollapsed(false); } catch(e){}
      }
      // 📝/📖 (2026-07-13 항목6) 칠판만·교재만 — 영상 숨김(솔로 레이아웃 재활용) + 해당 탭으로
      else if (mode === 'boardonly' || mode === 'bookonly') {
        row.classList.add('video-solo');
        try { if (typeof vcSetContentCollapsed === 'function') vcSetContentCollapsed(false); } catch(e){}
        if (mode === 'boardonly') { try { vcSwitchTab('whiteboard'); } catch(e){} }
        else { try { vpOpenTextbook(); } catch(e){} }   // 교재 없으면 내부에서 칠판 폴백
      }
      // 칠판/PDF 캔버스 리사이즈
      setTimeout(() => {
        if (typeof wbResize === 'function') try { wbResize(); } catch(e){}
        if (typeof pdfResize === 'function') try { pdfResize(); } catch(e){}
        if (typeof pdfRenderCurrent === 'function') try { pdfRenderCurrent(); } catch(e){}
        // 🖼 (2026-07-14) 화면 모드 전환 직후 일시정지된 원격 영상 즉시 재생 재시도
        //   ("화면 이동하면 영상이 나왔다 안 나왔다" 대책 — 5초 감시를 기다리지 않음)
        if (typeof vcResumeAllVideos === 'function') try { vcResumeAllVideos(); } catch(e){}
      }, 280);
      // 🙉 (2026-08-12 마이마이 ⑩) 얼굴이 사라지는 모드는 hidefaces 만이 아니다 —
      //    솔로·칠판만·교재만도 video-solo 로 얼굴을 통째로 숨긴다. 예전 코드는 이 세 모드에서
      //    복귀 칩까지 꺼 버려서, 되돌리는 길이 «화면분할 시트를 다시 여는 것» 뿐이었다.
      //    얼굴이 안 보이는 모드에서는 칩을 띄우고, 보이는 모드로 바뀌면 숨긴다.
      try {
        const facesGone = (mode === 'hidefaces' || mode === 'solo' || mode === 'boardonly' || mode === 'bookonly');
        if (!facesGone) {
          window.__vcFacesHidden = false;   // 얼굴이 보이는 모드로 바뀌면 숨김 상태 해제
          const chip = document.getElementById('vc-faces-restore');
          if (chip) chip.style.display = 'none';
        } else if (mode !== 'hidefaces' && typeof window.vcFacesEnsureRestoreChip === 'function') {
          // hidefaces 는 vcFacesHide() 가 칩을 직접 띄운다 — 중복 호출 방지
          window.vcFacesEnsureRestoreChip();
        }
      } catch(e){}
      // 사용자 피드백 토스트
      const labels = { quarter:'1/4', half:'1/2', threequarter:'3/4', full:'전체 영상', pip:'📖 교재 크게', facepip:'🧑‍🎓 학생 얼굴 크게', solo:'영상 끔(솔로)', boardonly:'📝 칠판만', bookonly:'📖 교재만', hidefaces:'🙈 얼굴 숨김 (수업은 계속 참여 중)' };
      try {
        const t = document.createElement('div');
        t.textContent = '🖥️ 화면 모드: ' + (labels[mode] || mode);
        t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);color:#fff;padding:8px 16px;border-radius:20px;z-index:9999;font-size:13px;border:1px solid rgba(99,102,241,0.5);';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1800);
      } catch(e){}
      console.log('[vcScreenSet] applied mode:', mode);
    };

    // 🙈/🙉 (2026-07-14 사장님 지시) 얼굴 화면 숨기기·다시 보기
    //   - 내 타일 🙈 버튼 → 얼굴 영역 전체 숨김(video-solo 재활용), 칠판·동영상·학생게임이 전체 차지
    //   - 내 화면에서만 숨김 — 카메라 송출은 계속되므로 상대(교사/학생)는 그대로 봄
    //   - 숨김 동안 우상단 🙉 복귀 칩 표시 → 누르면 이전 화면 모드로 복귀
    window.vcFacesHide = function(){
      const row = document.querySelector('.vc-main-row');
      if (!row) return;
      // 복귀용: 현재 화면 모드 기억
      const modeMap = { 'video-quarter':'quarter', 'video-half':'half', 'video-threequarter':'threequarter', 'video-full':'full', 'video-pip':'pip', 'video-facepip':'facepip' };
      window.__vcFacesPrevMode = null;
      for (const cls in modeMap) {
        if (row.classList.contains(cls)) { window.__vcFacesPrevMode = modeMap[cls]; break; }
      }
      vcScreenSet('hidefaces');
      window.__vcFacesHidden = true;   // 세로폰 자동 레이아웃(공유 재평가 포함)이 되돌리지 못하게 표시
      vcFacesEnsureRestoreChip();
    };
    /* 🙂✕ 복귀 칩 생성·표시 — (2026-08-12 마이마이 ⑩) vcFacesHide 전용이던 것을 분리.
       화면분할의 솔로·칠판만·교재만도 얼굴을 통째로 숨기는데(video-solo 재활용)
       거기엔 복귀 버튼이 하나도 없어서 「비디오가 사라졌는데 되살리는 게 안 보인다」
       신고가 왔다. 얼굴이 사라지는 모든 모드가 이 칩을 공유한다. */
    window.vcFacesEnsureRestoreChip = function(){
      let chip = document.getElementById('vc-faces-restore');
      if (!chip) {
        chip = document.createElement('button');
        chip.id = 'vc-faces-restore';
        chip.type = 'button';
        chip.addEventListener('click', function(){ try { vcFacesShow(); } catch(e){} });
        document.body.appendChild(chip);
      }
      const en = (typeof getLang === 'function') ? (getLang() === 'en')
               : miIsEn();
      chip.innerHTML = '<span class="fr-face">🙂</span><span class="fr-x">✕</span>';
      /* 🌐 툴팁도 언어를 따라오게 두 벌로 남긴다 (얼굴을 숨긴 동안 계속 떠 있는 칩이라 굳으면 눈에 띈다) */
      chip.setAttribute('data-ko-title', '얼굴 화면 꺼짐 — 누르면 다시 보여요');
      chip.setAttribute('data-en-title', 'Faces hidden — tap to show again');
      chip.title = en ? 'Faces hidden — tap to show again' : '얼굴 화면 꺼짐 — 누르면 다시 보여요';
      chip.setAttribute('aria-label', chip.title);
      chip.style.display = 'flex';
    };
    window.vcFacesShow = function(){
      window.__vcFacesHidden = false;
      const chip = document.getElementById('vc-faces-restore');
      if (chip) chip.style.display = 'none';
      const prev = window.__vcFacesPrevMode;
      window.__vcFacesPrevMode = null;
      if (prev) { vcScreenSet(prev); return; }
      // 기억된 모드가 없으면(입장 기본 레이아웃이었으면) solo 클래스만 해제해 원래대로
      const row = document.querySelector('.vc-main-row');
      if (row) row.classList.remove('video-solo');
      setTimeout(() => {
        if (typeof wbResize === 'function') try { wbResize(); } catch(e){}
        if (typeof pdfResize === 'function') try { pdfResize(); } catch(e){}
        if (typeof vcResumeAllVideos === 'function') try { vcResumeAllVideos(); } catch(e){}
      }, 280);
    };

    // ESC 키로 폴더 시트 닫기
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const sheet = document.getElementById('vc-folder-sheet');
        if (sheet && sheet.classList.contains('show')) vcFolderClose();
      }
    });

    // 🔐 Phase RT-3 — 백그라운드에서 JWT 토큰 자동 발급 (실패해도 화상수업은 정상 작동)
    //   - 발급된 토큰은 sessionStorage 에 저장 → 시그널링 연결 시 자동 사용 (RT-4 활성화 시)
    //   - 403(not_invited) 오면 allow_open=true 폴백으로 재시도 (기존 화상수업 호환)
    (async function _rt3_silentJoin() {
      try {
        if (!window._rtTokenStore) window._rtTokenStore = {};
        const body = { user_id: vcUsername, role: 'student', allow_open: true };
        const r = await fetch('/api/rooms/' + encodeURIComponent(vcRoomId) + '/join', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.ok && d.room_token) {
          window._rtTokenStore[vcRoomId] = d.room_token;
          try { sessionStorage.setItem('mangoi_room_token_' + vcRoomId, d.room_token); } catch(e){}
          console.log('[RT-3] room token issued for', vcRoomId, '(role=' + d.role + ', exp=' + d.expires_in + 's)');
        } else {
          console.warn('[RT-3] join skipped:', d && d.error);
        }
      } catch (e) {
        console.warn('[RT-3] join request failed (non-fatal):', e && e.message);
      }
    })();
    // 칠판 캔버스가 보이는 시점에 실제 크기로 리사이즈 (display:none → flex 직후)
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 100);

    /* 📶 TURN 확보 — 위에서 미리 걸어 둔 발급을 여기서 기다린다.
       ⛔ 예전엔 fetchIceServers() 를 무조건 한 번 더 불렀다. 위에서 이미 받아 놓은 자격증명이
          있어도 매 입장마다 HTTP 왕복이 한 번 더 나갔다 — 필리핀 회선에서 그대로 입장 지연이다.
          vcEnsureIceServers 는 «TURN 이 없거나 4시간 지났을 때만» 실제로 받아 오고,
          그 경우에도 3초에서 끊어 수업을 지연시키지 않는다. */
    await vcEnsureIceServers();

    try {
        /* ⚡ 권한 선확보 때 이미 연 카메라가 있으면 그것을 그대로 쓴다(카메라 두 번 열지 않기).
           없거나 이미 죽었으면 예전처럼 새로 연다 — 어느 쪽이든 입장은 계속된다. */
        vcLocalStream = (window.vcTakePermStream && window.vcTakePermStream())
                        || await acquireLocalMedia({ video: true, audio: true });
        document.getElementById('vc-local-video').srcObject = vcLocalStream;
        document.getElementById('vc-local-label').textContent = vcUsername + (miIsEn() ? ' (Me)' : ' (나)');
        attachStreamMonitor(document.getElementById('vc-local-box'), vcLocalStream);
        vcAddDetachButton(document.getElementById('vc-local-box'));
        try { vcRefreshPraiseUI(); } catch(e){}
        vcUpdateGridCount();
        const vCount = vcLocalStream.getVideoTracks().length;
        const aCount = vcLocalStream.getAudioTracks().length;
        console.log('[vc] 미디어 접근 성공: video:', vCount, 'audio:', aCount);
        // 트랙별 누락 표시 + 자동 재시도(카메라가 잠깐 사용중이었던 경우 스스로 복구)
        if (vCount === 0) {
            vcShowLocalPlaceholder('camera-off', '카메라 연결 중… 잠시만요');
            setTimeout(function(){ try { if (typeof vcRetryCamera === 'function') vcRetryCamera(); } catch(e){} }, 1800);
        }
        if (aCount === 0) {
            alert('⚠️ 마이크가 감지되지 않았습니다.\n\n• 우측 하단 [🛠] 진단 버튼을 눌러 자동 복구를 시도해 주세요.\n• 브라우저 주소창의 🎤 아이콘을 확인하세요.\n• OS 사운드 설정 → 입력 장치를 확인하세요.\n• 다른 앱(Zoom, Teams 등)이 마이크를 점유 중이면 종료하세요.');
        } else {
            // 통화 시작 시 자동 레벨 미터 표시 (마이크가 진짜 작동하는지 확인)
            setTimeout(() => { try { startMicLevelMeter(); } catch{} }, 500);
        }
    } catch (err) {
        const msg = describeMediaError(err);
        console.error('[vc] 미디어 접근 실패:', err);
        // 카메라/마이크 없이도 계속 진행 (오디오만 or 빈 스트림)
        try {
            vcLocalStream = await acquireLocalMedia({ video: false, audio: true });
            document.getElementById('vc-local-video').srcObject = vcLocalStream;
            document.getElementById('vc-local-label').textContent = vcUsername + (miIsEn() ? ' (Me)' : ' (나)');
            attachStreamMonitor(document.getElementById('vc-local-box'), vcLocalStream);
            vcAddDetachButton(document.getElementById('vc-local-box'));
            try { vcRefreshPraiseUI(); } catch(e){}
            vcUpdateGridCount();
            console.log('[vc] 오디오만 접근 성공');
            vcShowLocalPlaceholder('camera-fail', msg);
            // 자동 재시도(카메라가 잠깐 다른 앱/탭에 잡혀 있던 경우 스스로 복구)
            setTimeout(function(){ try { if (typeof vcRetryCamera === 'function') vcRetryCamera(); } catch(e){} }, 2000);
        } catch(e2) {
            vcLocalStream = new MediaStream();
            console.warn('[vc] 미디어 완전 실패, 빈 스트림 사용');
            vcShowLocalPlaceholder('all-fail', describeMediaError(e2));
        }
    }

    // 🎙 마이크 선택 드롭다운 채우기 (권한 확보 후 라벨이 보임)
    setTimeout(function(){ try { vcPopulateMicSelect(); } catch(e){} }, 600);

    /* 🔒 (2026-07-21) 새 연결을 열기 전에 기존 연결을 반드시 닫는다.
       두 경로가 겹쳐 vcJoinRoom 이 두 번 불리면 예전엔 앞선 소켓이 닫히지 않고 남아,
       다른 방(기본방 mangoi-class)에 '유령 참가자'로 접속된 채 정원 한 자리를 계속 차지했다.
       입장을 막는 게 아니라 닫기만 하므로 '수업 안 끊김' 원칙에 안전하다. */
    try { if (vcConn && typeof vcConn.close === 'function') vcConn.close(); } catch (_) {}

    vcConn = createWebSocket(
        `/ws/video-call?roomId=${encodeURIComponent(vcRoomId)}`,
        vcHandleMessage,
        (ws) => {
            setStatusDot('vc-status-dot', 'connected');
            // clientId = 이 브라우저 탭의 안정 식별자. 재연결/새로고침/모바일 끊김에도 동일 →
            //   서버가 같은 clientId의 옛 좀비 소켓을 닫아 "교사 화면 중복(유령 타일)"을 막는다.
            ws.send(JSON.stringify({ type: 'join-room', data: { username: vcUsername, role: (window.vcMyRole || 'student'), clientId: vcClientId() } }));
        },
        () => setStatusDot('vc-status-dot', 'disconnected')
    );
    window.vcConn = vcConn;   // fix (2026-06-01) — 라이브러리 교재 공유(selectFromTextbookLibrary)가 window.vcConn 을 쓰므로 노출
    try { window.vcStartPdfPoll && window.vcStartPdfPoll(); } catch(_){}  // fix (2026-06-02) 교재 표시 안전장치
    // 🔧 (2026-07-12) 입장 기본 크기 — 가로(landscape)에서만 3/4 적용. 세로(portrait)는 phero의
    //   'pip(교재 크게)' 기본이 담당한다. 예전엔 여기서 세로에서도 무조건 vcSetVideoSize('threequarter')를
    //   호출해 phero가 붙인 video-pip 위에 video-threequarter 가 겹쳐(조합) '영상 12px 짜리 깨진 화면'이 됐다.
    try { window.__vcAutoHalfDone=false; setTimeout(function(){ try{
      var _isPortrait = window.matchMedia && window.matchMedia('(max-width:920px) and (orientation:portrait)').matches;
      if(!_isPortrait){ var _tb=document.querySelector('.video-size-bar button[onclick*="threequarter"]'); window.vcSetVideoSize && window.vcSetVideoSize('threequarter', _tb); }
    }catch(_){} window.vcApplyDefaultVideoSize && window.vcApplyDefaultVideoSize(); }, 500); } catch(_){}  // 가로:3/4 / 세로:phero pip(교재 크게)
    setStatusDot('vc-status-dot', 'connecting');

    // 🛡 최후의 안전망 — 입장 3초 후에도 비디오 트랙이 없거나 video.videoWidth=0 이면
    //   강제로 placeholder 띄움 (어떤 분기를 타든 검은 화면 절대 보이지 않게)
    setTimeout(() => {
        try {
            const v = document.getElementById('vc-local-video');
            const box = document.getElementById('vc-local-box');
            if (!v || !box) return;
            const hasPlaceholder = !!box.querySelector('.vc-local-placeholder');
            const stream = v.srcObject;
            const tracks = stream && stream.getVideoTracks ? stream.getVideoTracks() : [];
            const trackOK = tracks.length > 0 && tracks[0].readyState === 'live' && tracks[0].enabled;
            const sizeOK  = v.videoWidth > 0 && v.videoHeight > 0;
            if (!hasPlaceholder && (!trackOK || !sizeOK)) {
                console.warn('[vc] 입장 3초 후에도 본인 영상 없음 → placeholder 강제 표시', { trackOK, sizeOK, tracks: tracks.length });
                if (typeof vcShowLocalPlaceholder === 'function') {
                    vcShowLocalPlaceholder(
                        tracks.length === 0 ? 'camera-off' : 'camera-fail',
                        tracks.length === 0 ? '비디오 트랙 0개' : '카메라 트랙은 있지만 영상이 안 들어옴'
                    );
                }
            }
        } catch(e) { console.warn('[vc] 안전망 placeholder 체크 실패:', e); }
    }, 3000);

    // ── 자동 녹화 ──
    // mango-rec.js 내부 폴링(2초 간격)이 vc-in-call 클래스를 감지해
    // 3초 지연 후 startRecording({auto:true})을 자동 호출함.
    // 여기서 중복 호출하면 R2 multipart 세션이 두 번 열리므로 트리거하지 않음.

    // 🎁 Phase P5 — 출석 + 제시간 입장 자동 적립 (학생 본인 로그인 + 화상수업 입장 직후)
    //   ▶ attendance: 무조건 호출 (쿨다운 6h + 일일 1회는 서버에서 자동 차단)
    //   ▶ on_time: 가장 가까운 예정 수업과 현재시각 비교 → 5분 이내면 추가 적립
    setTimeout(() => { try { vcAutoEarnAttendance(); } catch(e) { console.warn('[vc-p5] attendance earn skip:', e); } }, 2500);
    // 💬 (2026-07-24) 채팅 이력 자동 로드 중단 — 기본값 = '기록 없는 빈 채팅'
    //   사장님 지시: 로그아웃→로그인→수업 입장 후 채팅창을 열면 아무것도 안 보여야 한다.
    //   이전엔 입장 1.5초 뒤 vcLoadChatHistory() 가 지난 대화 200개를 끌어와 붙였다
    //   ('─ 이전 채팅 N개 불러옴 ─' 구분선). 상담 내용이 다음 수업에 그대로 남는 문제.
    //   서버 기록 자체는 지우지 않는다(감사/분쟁 대비). 화면에 안 불러올 뿐이다.
    //   되살리려면 콘솔에서 vcLoadChatHistory() 를 직접 호출하면 된다.
    if (window.__vcChatAutoLoadHistory === true) {
        setTimeout(() => { try { vcLoadChatHistory(); } catch(e) { console.warn('[vc-k1] chat load:', e); } }, 1500);
    }
    // 📲 Phase K2 — 수업 시작 알림톡 (학생 본인 + 학부모 + 강사에게)
    setTimeout(() => { try { vcNotifyLessonStarted(); } catch(e) { console.warn('[vc-k2] start notify:', e); } }, 3000);
}

function vcNotifyLessonStarted() {
    if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;  // 관찰자 제외
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!u || !u.uid) return;
    // 학생 본인 전화 (데모는 demoStudents 에서)
    const s = (typeof demoStudents !== 'undefined') ? demoStudents[u.uid] : null;
    if (!s || !s.phone) { console.log('[k2] phone 없음 → 알림 건너뜀'); return; }
    fetch('/api/notify/lesson-started', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            room_id: vcRoomId, student_name: u.name, student_phone: s.phone,
            parent_phone: s.parent_phone, lesson_title: s.lesson_title || '영어 수업',
            teacher_name: s.teacher || '강사', room_url: location.origin + '/?room=' + vcRoomId,
        })
    }).then(r=>r.json()).then(d => {
        if (d.ok) console.log('[k2] 수업 시작 알림 발송:', d.mode);
        else console.log('[k2] 알림 건너뜀:', d.message || d.error);
    }).catch(()=>{});
    // 입장 시각 기록 (종료 시 duration 계산)
    window.__vcStartedAt = Date.now();
    window.__vcInitialChatCount = 0;
}

window.vcNotifyLessonEnded = function() {
    if (!vcRoomId) return;
    if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!u || !u.uid) return;
    const s = (typeof demoStudents !== 'undefined') ? demoStudents[u.uid] : null;
    if (!s) return;
    const durationMin = window.__vcStartedAt ? Math.round((Date.now() - window.__vcStartedAt) / 60000) : 0;
    const msgCount = document.querySelectorAll('#vc-chat-messages .chat-msg').length;
    // 1) 수업 종료 알림 (학생/학부모/강사)
    fetch('/api/notify/lesson-ended', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            room_id: vcRoomId, student_name: u.name,
            student_phone: s.phone, parent_phone: s.parent_phone, teacher_phone: s.teacher_phone,
            lesson_title: s.lesson_title || '영어 수업',
            duration_minutes: durationMin, message_count: msgCount,
        })
    }).catch(()=>{});
    // 2) 채팅 요약 알림 (학생/학부모)
    setTimeout(() => {
        fetch('/api/notify/chat-summary', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: vcRoomId, student_name: u.name,
                student_phone: s.phone, parent_phone: s.parent_phone,
                lesson_title: s.lesson_title || '영어 수업',
            })
        }).catch(()=>{});
    }, 1500);
};

async function vcAutoEarnAttendance() {
    // 🚪 (2026-07-29) 회의방(meet-*)은 수업이 아니다 → 출석 포인트를 적립하지 않는다.
    //    갑자기 잡힌 회의·비상수업이 정규 수업 출석으로 둔갑하면 안 된다.
    if (window.__vcIsMeetingRoom && window.__vcIsMeetingRoom()) { console.log('[vc-p5] 회의방 → 적립 건너뜀'); return; }
    // 학생 로그인 상태에서만 동작 (강사/관찰자/익명 제외)
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!u || !u.uid) { console.log('[vc-p5] 비로그인 → 적립 건너뜀'); return; }
    // 관찰자 모드는 vcIsObserver=true 이므로 건너뜀
    if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;

    // 1) attendance 적립
    let attResult = null;
    try {
        const r = await fetch('/api/points/earn-by-rule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), student_name: u.name, rule_code: 'attendance',
                meta: { room_id: vcRoomId, source: 'vc_entry' }
            })
        });
        attResult = await r.json();
        if (attResult.ok) {
            vcShowEarnToast(`📍 출석 체크 +${attResult.rule?.amount || 10}P`);
        } else if (attResult.error === 'cooldown' || attResult.error === 'daily_cap_reached') {
            // 이미 오늘 출석함 → 조용히 무시
            console.log('[vc-p5] attendance:', attResult.error);
        } else {
            console.warn('[vc-p5] attendance 실패:', attResult);
        }
    } catch (e) {
        console.warn('[vc-p5] attendance fetch err:', e);
    }

    // 2) on_time 검사 — 현재 시각과 가장 가까운 예정 수업 비교
    try {
        const now = Date.now();
        const r = await fetch('/api/admin/class-schedules?user_id=' + encodeURIComponent(u.uid), { credentials: 'include' });
        const d = await r.json();
        const rows = (d && (d.items || d.rows)) || [];
        // 오늘 날짜
        const today = new Date(now);
        const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();
        const todayDow = today.getDay(); // 0=일 ~ 6=토
        let nearestMinDiff = Infinity;
        for (const s of rows) {
            if (s.status === 'cancelled') continue;
            // 시작 시각 후보 결정
            let target = null;
            if (s.scheduled_date) {
                // YYYY-MM-DD
                const [y, m, day] = s.scheduled_date.split('-').map(Number);
                if (y === todayY && (m - 1) === todayM && day === todayD) {
                    const [h, mi] = (s.start_time || '00:00').split(':').map(Number);
                    target = new Date(y, m - 1, day, h, mi, 0).getTime();
                }
            } else if (s.day_of_week != null) {
                // 반복 수업: 오늘이 그 요일이면
                if (Number(s.day_of_week) === todayDow) {
                    const [h, mi] = (s.start_time || '00:00').split(':').map(Number);
                    target = new Date(todayY, todayM, todayD, h, mi, 0).getTime();
                }
            }
            if (target == null) continue;
            const diff = Math.abs(now - target);
            if (diff < nearestMinDiff) nearestMinDiff = diff;
        }
        const FIVE_MIN = 5 * 60 * 1000;
        if (nearestMinDiff <= FIVE_MIN) {
            const r2 = await fetch('/api/points/earn-by-rule', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), student_name: u.name, rule_code: 'on_time',
                    meta: { diff_ms: nearestMinDiff, room_id: vcRoomId }
                })
            });
            const ot = await r2.json();
            if (ot.ok) vcShowEarnToast(`⏱ 제시간 입장 +${ot.rule?.amount || 5}P`);
        }
    } catch (e) {
        console.warn('[vc-p5] on_time check err:', e);
    }

    // 잔액 칩 갱신 (적립 직후 → 강제 갱신)
    if (typeof refreshPointsChip === 'function') refreshPointsChip(true);
}

function vcShowEarnToast(msg) {
    let t = document.getElementById('vc-earn-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'vc-earn-toast';
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-80px);z-index:10500;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;padding:12px 22px;border-radius:99px;font-size:14px;font-weight:800;box-shadow:0 12px 40px -8px rgba(245,158,11,.6),0 0 0 4px rgba(255,255,255,.1);transition:transform .35s cubic-bezier(.34,1.56,.64,1);pointer-events:none;font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;letter-spacing:-.3px;display:flex;align-items:center;gap:8px';
        document.body.appendChild(t);
    } else {
        t.style.transitionDuration = '0s';
        t.style.transform = 'translateX(-50%) translateY(-80px)';
    }
    t.textContent = msg;
    void t.offsetWidth; // reflow
    t.style.transitionDuration = '.35s';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t.__hideT);
    t.__hideT = setTimeout(() => {
        t.style.transform = 'translateX(-50%) translateY(-80px)';
    }, 3000);
}

async function vcJoinAsObserver(roomId) {
    vcIsObserver = true;
    window._vcObserverMode = true;   // ★ 관찰자는 입장 자동 교재 로드/공유 금지 (수신 전용)
    vcUsername = '관찰자';
    vcRoomId = roomId;

    showView('view-videocall-call');
    document.body.classList.add('vc-in-call');
    try{ window.vcApplyLiteDefault && window.vcApplyLiteDefault(); }catch(e){}   // ⚡ 수업 입장 = 가벼운 모드 기본
    document.getElementById('vc-room-name').textContent = roomId + ' (관찰 중)';

    // ICE 서버 설정
    await fetchIceServers();

    // 관찰자는 로컬 미디어 없음 — 빈 스트림
    vcLocalStream = new MediaStream();
    const localBox = document.getElementById('vc-local-box');
    if (localBox) localBox.style.display = 'none'; // 로컬 비디오 숨김

    // 하단 툴바 숨김 (관찰자는 마이크/카메라/채팅 등 불필요)
    const toolbar = document.getElementById('vc-bottom-toolbar');
    if (toolbar) toolbar.style.display = 'none';

    // 관찰자 표시 배너
    const roomHeader = document.getElementById('vc-room-name');
    if (roomHeader) {
        roomHeader.innerHTML = `🔍 <span style="color:#f59e0b">${roomId}</span> 수업 관찰 중`;
    }

    /* 🔒 (2026-07-21) 관찰 입장도 동일 — 기존 연결이 남아 유령이 되지 않도록 먼저 닫는다. */
    try { if (vcConn && typeof vcConn.close === 'function') vcConn.close(); } catch (_) {}

    vcConn = createWebSocket(
        `/ws/video-call?roomId=${encodeURIComponent(vcRoomId)}`,
        vcHandleMessage,
        (ws) => {
            setStatusDot('vc-status-dot', 'connected');
            ws.send(JSON.stringify({ type: 'join-observe', data: { username: '관찰자' } }));
        },
        () => setStatusDot('vc-status-dot', 'disconnected')
    );
    window.vcConn = vcConn;   // fix (2026-06-01) — window.vcConn 노출
    /* 👁 (2026-08-11 SID ③ "고스트가 안 눌리고 로딩도 안 됐다")
       서버가 join-observe 를 버리던 문제는 고쳐졌지만, «실패했을 때 화면이 아무 말도 안 하는» 것은
       그대로였다. 붙지 못해도, 방이 비어 있어도, 화면은 똑같이 «연결 중…» 이라 관리자는
       고장인지 기다리면 되는 건지 알 수 없었다. 결과를 반드시 글자로 말해 준다. */
    try { vcObserverWatch(); } catch(_){}
    try { window.vcStartPdfPoll && window.vcStartPdfPoll(); } catch(_){}  // fix (2026-06-02) 교재 표시 안전장치
    // 🔧 (2026-07-12) 입장 기본 크기 — 가로(landscape)에서만 3/4 적용. 세로(portrait)는 phero의
    //   'pip(교재 크게)' 기본이 담당한다. 예전엔 여기서 세로에서도 무조건 vcSetVideoSize('threequarter')를
    //   호출해 phero가 붙인 video-pip 위에 video-threequarter 가 겹쳐(조합) '영상 12px 짜리 깨진 화면'이 됐다.
    try { window.__vcAutoHalfDone=false; setTimeout(function(){ try{
      var _isPortrait = window.matchMedia && window.matchMedia('(max-width:920px) and (orientation:portrait)').matches;
      if(!_isPortrait){ var _tb=document.querySelector('.video-size-bar button[onclick*="threequarter"]'); window.vcSetVideoSize && window.vcSetVideoSize('threequarter', _tb); }
    }catch(_){} window.vcApplyDefaultVideoSize && window.vcApplyDefaultVideoSize(); }, 500); } catch(_){}  // 가로:3/4 / 세로:phero pip(교재 크게)
    setStatusDot('vc-status-dot', 'connecting');
}

function vcObserverBanner(kind, extra) {
    var old = document.getElementById('vc-observe-note');
    if (old) old.remove();
    if (!kind) return;
    var en = false;
    try { en = (typeof getLang === 'function' && getLang() === 'en'); } catch (_) {}
    var msg = kind === 'empty'
        ? (en ? '👀 Nobody is in this room yet. The screen will appear when someone joins.'
              : '👀 이 방에는 아직 아무도 없습니다. 누군가 들어오면 화면이 나타납니다.')
        /* 👁 (2026-08-12) 세 번째 상태 — «붙기는 했는데 영상이 안 온다» (사장님 실제 증상).
           로스터가 정상이면 예전 판정은 «성공» 이라 화면이 영영 침묵했다. vcObserverMediaWatch 참조. */
        : kind === 'nomedia'
        ? (en ? '⚠ Joined the class, but no participant video is arriving.'
              : '⚠ 수업에는 붙었지만 참가자 영상이 오지 않습니다.')
        /* 🔁 (2026-08-12) 자동 재시도 중 — nomedia 확정 전 12초 동안 뜨는 중간 안내 */
        : kind === 'retry'
        ? (en ? '🔄 No video yet — reconnecting automatically…'
              : '🔄 영상이 아직 안 와서 자동으로 다시 연결하는 중…')
        : (en ? '⚠ Could not join as observer. Please close this tab and press Ghost again.'
              : '⚠ 참관에 연결하지 못했습니다. 이 탭을 닫고 [Ghost] 를 다시 눌러 주세요.');
    var box = document.createElement('div');
    box.id = 'vc-observe-note';
    box.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483000;'
        + 'max-width:min(560px,92vw);padding:12px 18px;border-radius:12px;text-align:center;'
        + 'font-size:13.5px;font-weight:700;line-height:1.55;box-shadow:0 12px 32px -8px rgba(0,0,0,.45);'
        + (kind === 'empty'
            ? 'background:#0c2a4a;border:1px solid #38bdf8;color:#bae6fd'
            : (kind === 'nomedia' || kind === 'retry')
            /* 호박색 — «고장(빨강)» 과 «정상(파랑)» 사이. 붙긴 했으니 빨강은 과하다 */
            ? 'background:#3a2a06;border:1px solid #f59e0b;color:#fde68a'
            : 'background:#3b1111;border:1px solid #f87171;color:#fecaca');
    box.textContent = msg + (extra ? ' (' + extra + ')' : '');
    document.body.appendChild(box);
}

function vcObserverWatch() {
    if (!window._vcObserverMode) return;
    window.__vcObserveSawUsers = false;
    setTimeout(function () {
        try {
            if (!window._vcObserverMode) return;
            if (window.__vcObserveSawUsers) return;          // 붙었다 — 아무 말도 하지 않는다
            var open = false;
            try { open = !!(window.vcConn && vcConn.ws && vcConn.ws.readyState === 1); } catch (_) {}
            vcObserverBanner('fail', open ? 'no reply' : 'not connected');
        } catch (_) {}
    }, 8000);
}

function vcObserverMediaWatch() {
    if (!window._vcObserverMode) return;
    // existing-users 는 재연결 때 다시 온다 — 감시는 한 번만 건다
    if (window.__vcObserveMediaWatching) return;
    window.__vcObserveMediaWatching = true;
    setTimeout(function () {
        try {
            if (!window._vcObserverMode) return;
            if (vcObserverHasLiveVideo()) return;        // 영상이 왔다 — 조용히
            /* 🔁 (2026-08-12 사장님 실측 «ice-stuck x1») 보고만 하지 말고 한 번은 스스로 고쳐 본다.
               참가자들이 쓰는 복구(vcReconnectPeer)와 같은 길인데, 참관자는 ICE 가 'failed' 로
               넘어가기 전(checking 고착)에는 아무도 안 불러 줬다 — 여기서 강제로 부른다.
               재시도는 TURN 릴레이 강제(__vcForceRelay) — 직접 경로가 안 되는 상황이므로. */
            vcObserverBanner('retry', vcObserverStallReason());
            vcObserverRetryStalled();
            setTimeout(function () {
                try {
                    if (!window._vcObserverMode) return;
                    if (vcObserverHasLiveVideo()) return;   // 재시도 성공 — 배너는 vcAddRemoteVideo 가 걷었다
                    vcObserverBanner('nomedia', vcObserverStallReason());
                } catch (_) {}
            }, 12000);
        } catch (_) {}
    }, 10000);
}

function vcObserverStalledPeerIds() {
    var out = [];
    try {
        Object.keys(vcPeerConnections || {}).forEach(function (id) {
            var live = false;
            try {
                var s = (typeof vcRemoteStreams !== 'undefined') && vcRemoteStreams[id];
                if (s && s.getVideoTracks) live = s.getVideoTracks().some(function (t) { return t.readyState === 'live'; });
            } catch (_) {}
            if (!live) out.push(id);
        });
    } catch (_) {}
    return out;
}

function vcObserverRetryStalled() {
    if (window.__vcObserveRetried) return;
    window.__vcObserveRetried = true;
    var ids = vcObserverStalledPeerIds();
    console.warn('[vc-observer] 🔁 영상 미수신 자동 재시도 (relay 강제):', ids.join(', ') || '(피어 없음)');
    ids.forEach(function (id, i) {
        try { (window.__vcForceRelay = window.__vcForceRelay || {})[id] = true; } catch (_) {}
        /* 400ms 간격 — 동시 offer 폭주 방지(existing-users 의 300ms 간격과 같은 이유) */
        setTimeout(function () { try { vcReconnectPeer(id); } catch (_) {} }, i * 400);
    });
}

function vcObserverHasLiveVideo() {
    try {
        var vids = document.querySelectorAll('.video-box video');
        for (var i = 0; i < vids.length; i++) {
            var s = vids[i].srcObject;
            if (!s || !s.getVideoTracks) continue;
            var tr = s.getVideoTracks();
            for (var j = 0; j < tr.length; j++) {
                if (tr[j].readyState === 'live') return true;
            }
        }
    } catch (_) {}
    return false;
}

function vcObserverStallReason() {
    var ids = [];
    try { ids = Object.keys(vcPeerConnections || {}); } catch (_) {}
    if (!ids.length) return 'no-peer';                   // offer 를 아예 못 보냄
    var noAnswer = 0, iceStuck = 0, noTrack = 0, states = [];
    ids.forEach(function (id) {
        var pc = null;
        try { pc = vcPeerConnections[id]; } catch (_) {}
        if (!pc) return;
        var ss = pc.signalingState, ice = pc.iceConnectionState;
        states.push(ss + '/' + ice);
        if (ss === 'have-local-offer') noAnswer++;
        else if (ice === 'connected' || ice === 'completed') noTrack++;
        else iceStuck++;
    });
    var head = noAnswer ? ('no-answer x' + noAnswer)
             : iceStuck ? ('ice-stuck x' + iceStuck)
             : ('no-track x' + noTrack);
    return head + ' · ' + states.join(', ');
}

function vcHandleMessage(msg) {
    switch (msg.type) {
        case 'room-joined': {
            // 🔁 (2026-07-24) 무중단 재연결 판단 — onopen 에서 보류한 '기존 연결 정리'를 여기서 결정한다.
            //   재연결인데 서버가 '같은 userId' 를 돌려줬다 = 정체성 유지 = 살아있는 PeerConnection 을 그대로 둔다.
            //   userId 가 바뀌었다(스위치 off/첫 입장) = 예전처럼 전부 정리한다(안전한 쪽, 기존 동작 그대로).
            const _prevUserId = vcUserId;
            const _wasReconnect = !!window.__vcWasReconnect;
            window.__vcWasReconnect = false;
            if (_wasReconnect && typeof vcCleanupAllPeers === 'function') {
                if (msg.data.userId !== _prevUserId) {
                    console.log('[vc] 재연결 — 정체성 바뀜 → 기존 PeerConnection 정리(기존 동작)');
                    vcCleanupAllPeers();
                } else {
                    console.log('[vc] 재연결 — 정체성 유지 → 살아있는 연결 보존(무중단)');
                }
            }
            vcUserId = msg.data.userId;
            window._vcJoinedRoomId = msg.data.roomId || vcRoomId;   // ★ 이때부터 room-media 폴링 적용 허용
            updateUserCount(msg.data.userCount);
            // 🌟 학생이면 (방·피어ID → 내 계정 uid) 를 서버에 등록 → 선생님이 별 누르면 서버가 내 계정에 확실히 적립.
            try { vcRegisterRosterIdentity(); setTimeout(vcRegisterRosterIdentity, 3000); } catch(e){}
            break;
        }

        case 'existing-users':
            // 기존 사용자 각각에 대해 P2P 연결 시작 (내가 Offer를 보냄)
            console.log('[vc] existing-users:', msg.data.users.length, '명');
            /* 👁 (2026-08-11 SID ③) 참관은 여기서 «붙었다» 가 확정된다 — 서버가 방 사람 목록을 준 순간.
               사람이 0명이면 고장이 아니라 «빈 방» 이다. 그 둘을 화면에서 갈라 준다. */
            if (window._vcObserverMode) {
                window.__vcObserveSawUsers = true;
                try { vcObserverBanner((msg.data.users || []).length ? '' : 'empty'); } catch (_) {}
                /* 👁 (2026-08-12) 사람이 있는데도 영상이 안 오는 칸을 여기서부터 감시한다.
                   빈 방이면 걸지 않는다 — 안 오는 게 정상이고 위에서 이미 그렇게 말했다. */
                if ((msg.data.users || []).length) {
                    try { vcObserverMediaWatch(); } catch (_) {}
                }
            }
            msg.data.users.forEach((user, idx) => {
                try { (window.vcPeerRoles = window.vcPeerRoles || {})[user.userId] = user.role || 'student'; } catch(e){}
                try { vcEnsureParticipantBox(user.userId, user.username); } catch(e){}   // 영상 전이라도 박스 미리 생성
                // 🔁 (2026-07-24) 이미 연결된 상대에게는 offer 를 다시 쏘지 않는다 — 무중단 재연결로 살려 둔
                //   PeerConnection 을 스스로 부수면 이 작업의 목적이 무너진다. (정리된 경우엔 pc 가 없어 정상 offer)
                var _epc = vcPeerConnections[user.userId];
                if (_epc && (_epc.connectionState === 'connected' || _epc.iceConnectionState === 'connected' || _epc.iceConnectionState === 'completed')) {
                    return;
                }
                // 각 사용자에 대해 약간의 지연을 주어 동시 offer 폭주 방지
                setTimeout(() => vcCreatePeerAndOffer(user.userId, user.username), idx * 300);
            });
            try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
            // PDF/이미지 공유 동기화 (늦게 입장한 학생도 현재 교재가 보이게)
            // fix (2026-06-01) — 서버/절대 URL 은 직접 로드 (예전 pdfLoadRemote 는 라이브러리 교재 흰화면 원인)
            if (msg.data.pdfState && msg.data.pdfState.url) {
                // 🥭 늦게 입장했는데 교사가 이미 교재 공유 중 → 세로폰 '내용 크게'로 시작
                window.__vcPdfShared = true;
                try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
                var jUrl = msg.data.pdfState.url;
                var jKind = msg.data.pdfState.kind || '';
                if (!jKind) {
                    if (/textbook-files|\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(jUrl)) jKind = 'image';
                    else if (/\.pdf(\?|$)/i.test(jUrl)) jKind = 'pdf';
                }
                if (/^blob:/i.test(jUrl)) { /* 로컬 blob 은 다른 기기에서 못 엶 — 무시 */ }
                else if (/^https?:\/\//i.test(jUrl) || jUrl.charAt(0) === '/') {
                    pdfCurrentId = jUrl;
                    vcSwitchTab('pdf');
                    Promise.resolve(pdfLoad(jUrl, jKind || undefined)).then(function(){ pdfPageNum = msg.data.pdfState.currentPage || 1; pdfRender(); }).catch(function(e){
                        var alt = (jKind === 'image') ? 'pdf' : 'image';
                        Promise.resolve(pdfLoad(jUrl, alt)).then(function(){ pdfPageNum = msg.data.pdfState.currentPage || 1; pdfRender(); }).catch(function(){});
                    });
                } else {
                    var epdfId = msg.data.pdfState.pdfId || jUrl.replace('/api/video-call/pdf/', '');
                    if (epdfId) pdfLoadRemote(epdfId, msg.data.pdfState.currentPage, jKind);
                }
            }
            break;

        // 📷 (2026-07-24) 상대의 카메라 on/off 통보 — 검은 화면의 '이유' 를 확정해 준다.
        case 'cam-state': {
            const _csId = msg.data && msg.data.userId;
            if (_csId) {
                window.vcRemoteCamOff = window.vcRemoteCamOff || {};
                if (msg.data.camOn) delete window.vcRemoteCamOff[_csId];
                else window.vcRemoteCamOff[_csId] = (msg.data.reason === 'aao') ? 'aao' : 'user';
                try { vcApplyRemoteCamHint(_csId); } catch(_) {}
            }
            break;
        }

        case 'user-joined':
            console.log('[vc] user-joined:', msg.data.userId, msg.data.username);
            // 🇵🇭 (2026-07-24 재점검) 새 참가자가 들어왔다 = 끊겼던 사람이 새 id 로 돌아온 것일 수 있다.
            //   여기서 유령 타일을 먼저 치우지 않으면 아래 vcEnsureParticipantBox 가 박스를 하나 더
            //   만들어, 1:1 수업인데 타일이 3개가 되고(그리드가 세로 3분할로 축소) PIP 주화면이
            //   '정지된 유령' 으로 선택되는 사고가 난다. 영상 도착(vcAddRemoteVideo)까지 기다리면 늦다.
            try { vcSweepGhostTiles(); } catch(e){}
            // 📷 내 카메라가 꺼져 있다면 새로 들어온 사람에게도 알려 준다.
            //   안 알리면 그 사람 화면에서는 '이유 없는 검은 화면' 이 되고 워치독이 재협상을 시도한다.
            try { if (window.vcCamOn === false) vcBroadcastCamState(false, 'user'); } catch(e){}
            try { (window.vcPeerRoles = window.vcPeerRoles || {})[msg.data.userId] = msg.data.role || 'student'; window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
            try { vcEnsureParticipantBox(msg.data.userId, msg.data.username); } catch(e){}   // 영상 전이라도 박스 미리 생성
            updateUserCount(msg.data.userCount);
            vcAddChatSystem(`${msg.data.username} 님이 입장했습니다.`);
            // 새 사용자가 offer를 보내오면 vcHandleOffer에서 PC 생성됨
            // 하지만 안전장치로 5초 후 PC가 없으면 직접 offer 시도
            if (msg.data.userId && !vcPeerConnections[msg.data.userId]) {
                setTimeout(() => {
                    if (!vcPeerConnections[msg.data.userId]) {
                        console.log('[vc] 안전장치: offer 미수신 → 직접 연결 시도:', msg.data.userId);
                        vcCreatePeerAndOffer(msg.data.userId, msg.data.username);
                    }
                }, 3000);
            }
            break;

        case 'user-left':
            updateUserCount(msg.data.userCount);
            // reason: 'left'=의도적 퇴장(나가기 버튼/정상 종료), 'dropped'=네트워크 끊김·재연결 교체.
            //   'dropped'는 같은 사람이 곧 재입장할 가능성이 높으므로 수업 종료로 즉시 오인하면
            //   안 된다(2026-07-13 실사용 신고: 수업 도중 갑자기 수업 종료됨).
            vcRemovePeer(msg.data.userId, msg.data.reason);
            vcAddChatSystem(msg.data.reason === 'dropped'
                ? `${msg.data.username} 님과 연결이 잠시 끊겼습니다. 재연결을 기다리는 중…`
                : `${msg.data.username} 님이 퇴장했습니다.`);
            try { vcRefreshChatTargets(); } catch(e){}   // 🔒 나간 사람이 개별채팅 대상이면 전체로 복귀
            /* 🎛 장치 도우미 대상 학생이 «완전히» 나가면 패널을 닫는다.
               dropped(순단)는 곧 재입장 가능성이 높지만 재입장 시 userId 가 새로 발급돼
               옛 uid 로는 어차피 못 만진다 → 혼란을 남기지 말고 둘 다 닫는 게 정직하다. */
            try { if (window.__vcDevHelp && window.__vcDevHelp.uid === msg.data.userId) vcDevHelpClose(); } catch(e){}
            break;

        // WebRTC 시그널링
        case 'offer':
            vcHandleOffer(msg.data);
            break;
        case 'answer':
            vcHandleAnswer(msg.data);
            break;
        case 'ice-candidate':
            vcHandleIce(msg.data);
            break;

        // 채팅
        case 'chat-message':
            vcReceiveChat(msg.data);
            break;

        // 🌟 실시간 칭찬 포인트 — 브로드캐스트 후 대상 학생 본인만 반응
        case 'point-award':
            if (msg.data && msg.data.targetUserId === vcUserId) {
                vcCelebratePoint(msg.data.awardId, msg.data.fromName);
            }
            break;
        case 'point-award-ack':
            try {
                var _pend = window._vcPendingAwards && window._vcPendingAwards[msg.data.awardId];
                if (_pend) {
                    var _t = _pend.toast;
                    if (msg.data.ok) {
                        // ✅ 이 학생 누적 개수 +1 → 얼굴 버튼 + 로스터 칩 배지 양쪽 갱신
                        window._vcAwardCounts = window._vcAwardCounts || {};
                        window._vcAwardCounts[_pend.targetUserId] = (window._vcAwardCounts[_pend.targetUserId] || 0) + 1;
                        vcSyncAwardUI(_pend.targetUserId);
                        if (_pend.btn) {
                            _pend.btn.classList.add('vc-star-pop');
                            setTimeout(function(){ _pend.btn.classList.remove('vc-star-pop'); }, 460);
                        }
                        vcShowStarToast(_t, '⭐ +1P! (이 학생 누적 ' + window._vcAwardCounts[_pend.targetUserId] + '개)');
                    }
                    else if (msg.data.error === 'cooldown') vcShowStarToast(_t, '잠깐만요, 쿨다운 중');
                    else if (msg.data.error === 'daily_cap_reached') vcShowStarToast(_t, '오늘 한도 도달');
                    else vcShowStarToast(_t, '전달 실패 :(');
                    delete window._vcPendingAwards[msg.data.awardId];
                }
            } catch(e){}
            break;

        // 칠판
        case 'whiteboard-draw':
            wbReceiveDraw(msg.data);
            break;
        case 'whiteboard-clear':
            wbReceiveClear();
            break;
        case 'whiteboard-text':
            wbReceiveText(msg.data);
            break;
        case 'whiteboard-pointer':      // 🔴 칠판 레이저 포인터
            wbReceivePointer(msg.data);
            break;
        case 'whiteboard-shape':
            wbReceiveShape(msg.data);
            break;
        case 'whiteboard-stroke':
            wbReceiveStroke(msg.data);
            break;
        /* 🖍 (2026-08-08 Ana③ · Kes①) 입장 시 서버가 돌려주는 «지금까지의 칠판».
           예전엔 칠판이 «연결돼 있는 동안만» 중계돼, 강사가 학생보다 늦게 들어오면
           학생이 그려 둔 것이 하나도 안 보였다. 교재(pdf-sync)와 같은 취급으로 맞춘다. */
        case 'whiteboard-replay':
            try {
                var _ops = (msg.data && msg.data.ops) || [];
                wbClearOps();
                for (var _i = 0; _i < _ops.length; _i++) {
                    var _o = _ops[_i]; if (!_o || !_o.d) continue;
                    if (_o.t === 'whiteboard-draw')        wbRecord({ k: 'seg',    d: _o.d });
                    else if (_o.t === 'whiteboard-stroke') wbRecord({ k: 'stroke', d: _o.d });
                    else if (_o.t === 'whiteboard-shape')  wbRecord({ k: 'shape',  d: _o.d });
                    else if (_o.t === 'whiteboard-text')   wbRecord({ k: 'text',   d: _o.d });
                }
                // 칠판 탭이 아직 안 열려 있으면 크기가 0 이라 지금 그릴 수 없다 —
                // 기록만 남기고, 탭이 열리는 순간 wbFitCanvas → wbRedrawAll 이 그린다.
                if (typeof wbFitCanvas === 'function') wbFitCanvas();
                wbRedrawAll();
            } catch(e){ console.warn('[wb-replay]', e); }
            break;

        /* 🙋 (2026-08-12 Shas 5-b·5-c) 수업 안 복습퀴즈 잇기 —
           quiz-share: 강사 → 학생 «이 퀴즈를 같이 풀자» (id 만)
           quiz-pick / quiz-done: 학생 → 강사 «지금 이걸 골랐어요 / 제출했어요»
           처리는 전부 idx-x8.js(rqvOnClassMsg)가 한다 — 퀴즈 상태(st)가 거기 있다. */
        case 'quiz-share':
        case 'quiz-pick':
        case 'quiz-done':
            try { if (typeof window.rqvOnClassMsg === 'function') window.rqvOnClassMsg(msg.type, msg.data); } catch(_){}
            break;

        /* 🪞 (2026-08-12 Shas 1번) 학생의 웜업 대화 — 강사 화면에만 비춘다.
           서버는 방 전체에 뿌리므로(다른 학생도 받는다) 여기서 강사만 그린다. */
        case 'warmup-echo':
            try {
                if (window.vcCanControlTextbook && window.vcCanControlTextbook()
                    && typeof window.vcWarmupMirror === 'function') {
                    window.vcWarmupMirror(msg.data && msg.data.who, msg.data && msg.data.text);
                }
            } catch(_){}
            break;

        /* ✋ (2026-07-28 Kaye 9번) 교사의 '학생 필기 잠금' 신호 — 학생 쪽에 잠금 상태를 알린다.
           교사가 새로 들어온 학생에게도 알릴 수 있게, 잠금은 켤 때마다 방송한다. */
        case 'pdf-drawlock':
            try {
                /* 서버는 { on, locked } 를 함께 보낸다 — 한쪽 이름만 보면 조용히 «항상 해제»가 된다 */
                var _dlPrev = !!window.__pdfStudentDrawLock;
                window.__pdfStudentDrawLock = !!(msg.data && (msg.data.on || msg.data.locked));
                if (typeof vcRenderDrawLockChip === 'function') vcRenderDrawLockChip();
                var _dl = (typeof getLang === 'function' && getLang() === 'en');
                /* (2026-08-12 Melca) 입장 시 서버가 «꺼짐» 상태도 내려보내므로(stale 잠금 방지)
                   토스트는 값이 실제로 바뀔 때만 — 안 그러면 입장마다 「다시 필기할 수 있어요」 헛토스트 */
                if (_dlPrev !== window.__pdfStudentDrawLock
                    && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin' && typeof mangoToast === 'function') {
                    mangoToast(window.__pdfStudentDrawLock
                        ? (_dl ? 'The teacher locked drawing.' : '선생님이 필기를 잠갔어요.')
                        : (_dl ? 'You can draw again.' : '이제 다시 필기할 수 있어요.'));
                }
            } catch(e){}
            break;

        // 교재(PDF) 위 실시간 양방향 판서
        case 'pdf-anno-start':
            pdfReceiveAnnoStart(msg.data);
            break;
        case 'pdf-anno-point':
            pdfReceiveAnnoPoint(msg.data);
            break;
        case 'pdf-anno-text':
            pdfReceiveAnnoText(msg.data);
            break;
        case 'pdf-anno-clear':
            pdfReceiveAnnoClear(msg.data);
            break;
        case 'pdf-anno-undo':
            pdfReceiveAnnoUndo(msg.data);
            break;
        case 'pdf-anno-shape':
            pdfReceiveAnnoShape(msg.data);
            break;
        /* ✍️ (2026-08-12 Melca) 늦게 들어온·새로고침한 쪽에 지금까지의 교재 판서를 재생.
           칠판(whiteboard-replay)은 2026-08-08 에 생겼는데 교재 판서만 빠져 있었다 —
           "학생 필기가 강사 화면에 안 보인다" 신고의 한 갈래. 서버가 획 단위로 압축해 보낸다. */
        case 'pdf-anno-replay': {
            try {
                window.__pdfAnnoReplaying = true;   // 재생 중에는 «다른 페이지 필기» 알림을 끈다
                var _parOps = (msg.data && msg.data.ops) || [];
                _parOps.forEach(function(op){
                    try {
                        if (op.t === 'stroke') {
                            var _ps = op.d || {};
                            var _pts = _ps.points || [];
                            if (!_pts.length) return;
                            /* 재접속(스티키)으로 이미 갖고 있는 획은 건너뛴다 — 이중 그리기 방지 */
                            if (_ps.id != null && typeof _pdfRemoteStrokes !== 'undefined' && _pdfRemoteStrokes[_ps.id]) return;
                            var _mine = (pdfAnnotations[_ps.page] || []).some(function(st){ return st && st._id === _ps.id; });
                            if (_ps.id != null && _mine) return;
                            pdfReceiveAnnoStart({ page: _ps.page, tool: _ps.tool, color: _ps.color, size: _ps.size, id: _ps.id, point: _pts[0] });
                            for (var _pi = 1; _pi < _pts.length; _pi++) pdfReceiveAnnoPoint({ id: _ps.id, page: _ps.page, point: _pts[_pi] });
                        }
                        else if (op.t === 'pdf-anno-text')  pdfReceiveAnnoText(op.d);
                        else if (op.t === 'pdf-anno-shape') pdfReceiveAnnoShape(op.d);
                        else if (op.t === 'pdf-anno-clear') pdfReceiveAnnoClear(op.d);
                        else if (op.t === 'pdf-anno-undo')  pdfReceiveAnnoUndo(op.d);
                    } catch(_){}
                });
                console.log('[pdf-anno] 교재 판서 재생:', _parOps.length, '개 op');
            } catch(_){}
            window.__pdfAnnoReplaying = false;
            break;
        }
        case 'pdf-pointer':
            pdfReceivePointer(msg.data);
            break;

        // PDF
        case 'pdf-sync':
        case 'pdf-share': {
            // fix (2026-06-01) — 라이브러리/서버 교재는 받은 url 을 '직접' 로드해야 다른 기기에서 보임.
            //   (예전엔 무조건 /api/video-call/pdf/{pdfId} 로 불러서 라이브러리 교재가 흰 화면이 됐음)
            var sUrl = msg.data.url || '';
            var sPid = msg.data.pdfId || '';
            try { if (typeof showToast === 'function') showToast('📡 교재 신호 수신 (' + msg.type + ')'); } catch(_){}
            console.log('[pdf-share] 수신:', msg.type, 'url=', sUrl, 'pdfId=', sPid, 'kind=', msg.data.kind);
            if (sUrl && /^blob:/i.test(sUrl)) {
                // 로컬(blob) 교재는 상대 기기에서 열 수 없음 — 서버 교재를 써야 함
                console.warn('[pdf-share] 로컬(blob) 교재는 공유 불가:', sUrl);
                if (typeof showToast === 'function') { try { showToast('⚠️ 이 교재는 서버에 없어 화면 공유가 안 됩니다. 관리자 페이지에서 교재를 서버로 업로드해 주세요.'); } catch(_){} }
                break;
            }
            if (sUrl && (/^https?:\/\//i.test(sUrl) || sUrl.charAt(0) === '/')) {
                // 서버/절대 URL — 통합 함수로 직접 로드 (cross-device). 폴링과 동일 경로라 중복 로드 없음.
                // ← 마지막 true = «교사가 지금 연 것». 학생 화면을 교재로 데려온다(위 함수 주석 참고)
                window.vcApplySharedPdf(sUrl, msg.data.kind, msg.data.currentPage, sPid, msg.data.name, true);
                break;
            }
            // 화상수업 업로드 PDF (PDF_STORE) — 서버 엔드포인트로 로드
            var syncPdfId = sPid || (sUrl ? sUrl.replace('/api/video-call/pdf/', '') : null);
            if (syncPdfId) {
                pdfLoadRemote(syncPdfId, msg.data.currentPage, msg.data.kind);
                vcSwitchTab('pdf');
                window.__vcPdfShared = true;   // 🥭 세로폰 '내용 크게' 자동 전환
                try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
            }
            break;
        }
        // 📡 (2026-07-14) 교사 탭 동기화 수신 — 교사가 칠판/동영상/교재 등으로 바꾸면 따라감.
        //   학생만 따라감(교사·관리자가 다른 교사 방송을 받아도 무시 → 서로 덮어쓰기 방지).
        case 'tab-sync': {
            try {
                var _tsTab = msg.data && msg.data.tab;
                if (_tsTab && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
                    // 🧑‍🎓 (2026-08-12 Melca) 강사가 웜업 탭을 열어 주면 «강사 주도 웜업» 허가,
                    //   다른 탭으로 옮기면 허가 종료 (수업 중 학생 단독 웜업 차단의 예외 스위치)
                    window.__vcWarmupTeacherLed = (_tsTab === 'warmup');
                    window._vcTabSyncApplying = true;
                    /* 🔴 (2026-08-10 마이마이) 「교사가 칠판·교재로 옮겨도 학생은 얼굴 화면 그대로」
                       vcSwitchTab 은 .active 클래스만 바꾼다 — 학생이 탭을 두 번 눌러 콘텐츠를
                       «접어» 둔 상태(vc-content-collapsed)면 숨겨진 칸에서만 탭이 바뀌어
                       화면상 아무 일도 일어나지 않았다. 교사가 화면을 바꾸면 반드시 펼친다. */
                    try { if (typeof vcSetContentCollapsed === 'function') vcSetContentCollapsed(false); } catch(_){}
                    try { vcSwitchTab(_tsTab); } finally { window._vcTabSyncApplying = false; }
                    console.log('[tab-sync] 교사 탭 따라감:', _tsTab);
                    try { if (typeof showToast === 'function') showToast('👩‍🏫 선생님이 화면을 바꿨어요'); } catch(_){}
                }
            } catch(_){ window._vcTabSyncApplying = false; }
            break;
        }
        // 📢 귓속말 — 그리기는 /js/idx-whisper.js(defer). 아직 안 왔으면 큐에 담아 둔다.
        case 'admin-whisper':
        case 'admin-whisper-ack': {
            try {
                if (typeof window.vcWhisperOn === 'function') window.vcWhisperOn(msg.type, msg.data);
                else { (window.__vcWhisperQ = window.__vcWhisperQ || []).push([msg.type, msg.data]); }
            } catch(_){}
            break;
        }
        // 🖥 (2026-08-12 Melca) 화면 공유 시작/종료 알림 — 예전엔 학생은 예고 없이
        //   선생님 얼굴 타일이 갑자기 컴퓨터 화면으로 바뀌었다. 토스트 + 타일에 «화면 공유 중» 배지.
        case 'screen-share-state': {
            try {
                var _ssOn = !!(msg.data && msg.data.on);
                var _ssUid = msg.data && msg.data.fromUserId;
                var _ssEn = (typeof getLang === 'function' && getLang() === 'en');
                if (typeof showToast === 'function') showToast(_ssOn
                    ? (_ssEn ? '🖥 The teacher is sharing their screen.' : '🖥 선생님이 화면 공유를 시작했어요.')
                    : (_ssEn ? '🖥 Screen sharing ended.' : '🖥 화면 공유가 끝났어요.'));
                var _ssBox = _ssUid ? document.getElementById('vc-video-' + _ssUid) : null;
                if (_ssBox) {
                    var _ssOld = _ssBox.querySelector('.vc-ss-badge');
                    if (_ssOld) _ssOld.remove();
                    if (_ssOn) {
                        var _ssB = document.createElement('span');
                        _ssB.className = 'vc-ss-badge';
                        _ssB.setAttribute('data-ko', '🖥 화면 공유 중');
                        _ssB.setAttribute('data-en', '🖥 Screen sharing');
                        _ssB.textContent = _ssEn ? '🖥 Screen sharing' : '🖥 화면 공유 중';
                        _ssB.style.cssText = 'position:absolute;top:6px;left:6px;z-index:8;padding:3px 8px;border-radius:999px;background:rgba(14,165,233,.92);color:#fff;font-size:11px;font-weight:800;pointer-events:none';
                        _ssBox.appendChild(_ssB);
                    }
                }
            } catch(_){}
            break;
        }
        // 🔒 (2026-07-20) 강사의 학생 배경 변경 잠금/해제 수신 — 서버(DO)가 강사 role 검증 후 릴레이.
        //   학생/관찰자만 적용, 강사·관리자(공동 진행 등)는 자기 버튼 상태만 동기화.
        case 'bg-lock': {
            try {
                var _bgLk = !!(msg.data && msg.data.locked);
                if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') {
                    window.__vcBgLockOn = _bgLk;
                    if (typeof vcBgLockBtnRender === 'function') vcBgLockBtnRender();
                } else if (typeof vcBgLockApply === 'function') {
                    vcBgLockApply(_bgLk);
                }
            } catch(_){}
            break;
        }
        // 🎤/🎯 (2026-07-21) 전체 음소거·집중 모드 수신 — bg-lock 과 동일 구조(서버가 강사 role 검증 후 릴레이)
        case 'mic-lock': {
            try {
                var _micLk = !!(msg.data && msg.data.locked);
                if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') {
                    window.__vcMicLockOn = _micLk;
                    if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender();
                } else if (typeof vcMicLockApply === 'function') {
                    vcMicLockApply(_micLk);
                }
            } catch(_){}
            break;
        }
        case 'focus-lock': {
            try {
                var _fcLk = !!(msg.data && msg.data.locked);
                if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') {
                    window.__vcFocusLockOn = _fcLk;
                    if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender();
                    /* 다른 강사가 걸었거나 새로고침으로 다시 들어온 경우 — 띠도 함께 맞춘다 */
                    try { window.vcFocusBadge(_fcLk, true); } catch(_){}
                } else if (typeof vcFocusLockApply === 'function') {
                    vcFocusLockApply(_fcLk);
                }
            } catch(_){}
            break;
        }
        /* 🎧 (2026-08-07 강사 건의 1) 강사 → 이 학생: "마이크를 다시 잡아 주세요"
           서버는 방 전체에 뿌리므로 targetUserId 로 나를 골라낸다. 마이크 트랙만 다시 얻는다
           — 화면·연결은 건드리지 않아 수업이 끊기지 않는다. 전체 음소거 중이면 존중해서 건너뛴다. */
        case 'device-fix': {
            try {
                if (!msg.data || msg.data.targetUserId !== vcUserId) break;
                if (window.__vcMicLockedByTeacher) break;      // 강사가 전체 음소거 중 = 의도된 무음
                var _dfEn = (typeof getLang === 'function' && getLang() === 'en');
                try { if (typeof mangoToast === 'function') mangoToast(_dfEn ? '🎧 Checking your microphone…' : '🎧 마이크를 다시 확인하고 있어요…'); } catch(_){}
                Promise.resolve()
                    .then(function(){ return (typeof vcHealLocalMic === 'function') ? vcHealLocalMic() : null; })
                    .then(function(){
                        var t = null, label = '';
                        try { t = window.vcLocalStream && vcLocalStream.getAudioTracks()[0]; } catch(_){}
                        if (t) label = t.label || '';
                        /* 🔐 학생이 «스스로» 마이크를 끈 상태(vcMicOn === false)면 켜지 않는다.
                           고장과 «본인이 끈 것»은 다른 일이고, 남의 마이크를 원격으로 켜는 것은
                           해서는 안 되는 일이다. 대신 그 사실을 강사에게 그대로 알려 준다 —
                           강사가 알고 싶은 것도 결국 «왜 소리가 없는가» 이다. */
                        var selfMuted = (window.vcMicOn === false);
                        if (t && !selfMuted) { try { t.enabled = true; } catch(_){} }
                        try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-report', data: { fromUserId: vcUserId, ok: !!t && !selfMuted, muted: selfMuted, label: String(label).slice(0, 60) } }); } catch(_){}
                    })
                    .catch(function(){
                        try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-report', data: { fromUserId: vcUserId, ok: false, label: '' } }); } catch(_){}
                    });
            } catch(_){}
            break;
        }
        /* 🎧 학생 → 강사: 결과 보고. 강사 화면에 한/영으로 한 줄 알린다. */
        case 'device-report': {
            try {
                if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) break;
                var _drEn = (typeof getLang === 'function' && getLang() === 'en');
                var _drNm = '';
                try {
                    var _drBox = document.getElementById('vc-video-' + (msg.data && msg.data.fromUserId));
                    var _drL = _drBox && _drBox.querySelector('.video-label');
                    _drNm = (_drL && _drL.textContent) ? _drL.textContent.trim() : '';
                } catch(_){}
                var _drOk = !!(msg.data && msg.data.ok);
                var _drMuted = !!(msg.data && msg.data.muted);
                if (typeof showToast === 'function') showToast(
                    _drMuted
                        ? (_drEn ? '🔇 ' + (_drNm || 'Student') + ' turned their microphone off themselves — ask them to turn it back on.'
                                 : '🔇 ' + (_drNm || '학생') + ' 이(가) 스스로 마이크를 껐어요 — 다시 켜 달라고 말해 주세요.')
                    : _drOk
                        ? (_drEn ? '✅ ' + (_drNm || 'Student') + ' — mic picked up again' + (msg.data.label ? ' (' + msg.data.label + ')' : '')
                                 : '✅ ' + (_drNm || '학생') + ' — 마이크를 다시 잡았어요' + (msg.data.label ? ' (' + msg.data.label + ')' : ''))
                        : (_drEn ? '⚠ ' + (_drNm || 'Student') + ' — could not pick up the mic. Ask them to allow microphone permission.'
                                 : '⚠ ' + (_drNm || '학생') + ' — 마이크를 못 잡았어요. 학생에게 마이크 권한 허용을 부탁하세요.'));
            } catch(_){}
            break;
        }
        /* 🎛 (2026-08-10 장치 도우미 — BODA의 원격 장치설정을 웹으로) 강사 → 나: "장치 목록 보내줘"
           목록만 보낸다 — 아무것도 바꾸지 않는다. 몰래 이뤄지지 않도록 학생 화면에 토스트를 띄운다. */
        case 'device-list-req': {
            try {
                if (!msg.data || msg.data.targetUserId !== vcUserId) break;
                var _dlEn = (typeof getLang === 'function' && getLang() === 'en');
                var _dlNow = Date.now();
                if (!window.__vcDevHelpToastAt || _dlNow - window.__vcDevHelpToastAt > 60000) {
                    window.__vcDevHelpToastAt = _dlNow;
                    /* 🎛 (2026-08-12) 도움받는 쪽이 «강사» 일 수도 있다(재택 강사 지원) —
                       강사에게 「선생님이 도와주고 있어요」 는 어색해서 역할에 맞춰 말한다. */
                    var _dlStaff = (typeof vcIsStaffNow === 'function' && vcIsStaffNow());
                    try { if (typeof showToast === 'function') showToast(_dlStaff
                        ? (_dlEn ? '🎛 A staff member is checking your device setup with you.' : '🎛 다른 강사·관리자가 장치 설정을 함께 보고 있어요.')
                        : (_dlEn ? '🎛 Your teacher is helping with your device setup.' : '🎛 선생님이 장치 설정을 도와주고 있어요.')); } catch(_){}
                }
                vcDevHelpSendList();
            } catch(_){}
            break;
        }
        /* 🎛 강사 → 나: "이 장치로 바꿔줘". 이미 검증된 전환 함수(vcSwitchMic/vcSetCamDevice)를 그대로 탄다.
           음소거 해제는 절대 하지 않는다 — 장치를 바꿔도 켬/끔 상태(vcMicOn·강사 잠금)는 그대로 존중. */
        case 'device-set': {
            (async () => {
                try {
                    if (!msg.data || msg.data.targetUserId !== vcUserId) return;
                    var kind = msg.data.kind, devId = msg.data.deviceId;
                    if (!devId || (kind !== 'cam' && kind !== 'mic' && kind !== 'spk')) return;
                    var _dsEn = (typeof getLang === 'function' && getLang() === 'en');
                    var ok = false, reason = '';
                    if (kind === 'cam') {
                        var rc = await window.vcSetCamDevice(devId);
                        if (rc === 'deferred') { ok = true; reason = 'deferred'; }   // 화면 공유 중 → 끝나면 적용
                        else ok = (rc === true);
                    } else if (kind === 'mic') {
                        ok = (await vcSwitchMic(devId)) === true;
                        /* 강사가 전체 음소거 중이면 새 트랙도 무음이어야 한다 — 잠금이 장치 교체로 풀리면 안 됨 */
                        if (window.__vcMicLockedByTeacher) { try { vcLocalStream.getAudioTracks().forEach(function(t){ t.enabled = false; }); } catch(_){} }
                    } else {
                        ok = (await window.vcSetSpkDevice(devId)) === true;
                        if (!ok && !('setSinkId' in HTMLMediaElement.prototype)) reason = 'nosink';
                    }
                    var label = '';
                    try {
                        if (kind === 'cam') label = (vcLocalStream.getVideoTracks()[0] || {}).label || '';
                        else if (kind === 'mic') label = (vcLocalStream.getAudioTracks()[0] || {}).label || '';
                    } catch(_){}
                    /* 목록을 먼저, 결과를 나중에 — 강사 패널에서 최종 상태줄이 «결과»로 남게 하기 위한 순서다 */
                    try { await vcDevHelpSendList(); } catch(_){}
                    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-set-result', data: { fromUserId: vcUserId, kind: kind, ok: ok, reason: reason, label: String(label).slice(0, 60) } }); } catch(_){}
                    if (ok && reason !== 'deferred') {
                        try { if (typeof showToast === 'function') showToast(_dsEn ? '🎛 Your teacher adjusted your device settings.' : '🎛 선생님이 장치 설정을 바꿔 줬어요.'); } catch(_){}
                    }
                } catch(e) { console.warn('[dev-help] set 실패:', e); }
            })();
            break;
        }
        /* 🎛 학생 → 강사: 장치 목록/교체 결과 — 패널이 열려 있으면 갱신 (staff 만) */
        case 'device-list': {
            try {
                if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) break;
                if (typeof vcDevHelpOnList === 'function') vcDevHelpOnList(msg.data || {});
            } catch(_){}
            break;
        }
        case 'device-set-result': {
            try {
                if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) break;
                if (typeof vcDevHelpOnResult === 'function') vcDevHelpOnResult(msg.data || {});
            } catch(_){}
            break;
        }
        case 'pdf-page-change':
            pdfGoToPage(msg.data.currentPage || msg.data.pageNum);
            break;
        case 'pdf-stop-share':
            pdfClearRemote();
            // 🥭 공유 종료 → 세로폰은 다시 '선생님 크게'로 복귀
            window.__vcPdfShared = false;
            // 🥭 (2026-08-06) 공유가 끊기면 화면엔 교재가 없다 → 대기 카드가 다시 나와야 한다.
            //   _vcCurrentPdfUrl 은 '지금 보고 있는 교재'의 유일한 흔적이라 여기서 같이 비운다.
            try { window._vcShownPdfUrl = ''; window._vcShownPdfKey = ''; window._vcCurrentPdfUrl = ''; } catch(_){}
            try { window.vcWaitCardSync && window.vcWaitCardSync(); } catch(_){}
            try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
            break;

        // 📎 상대가 공유한 파일(워드/엑셀/PPT 등) — 다운로드 카드로 표시
        case 'file-share': {
            try {
                if (msg.data && msg.data.url && typeof fileShareNotice === 'function') fileShareNotice(msg.data, false);
                if (typeof showToast === 'function') showToast('📎 파일을 받았어요: ' + ((msg.data && msg.data.name) || ''));
            } catch(_){}
            break;
        }

        // 동영상 공유 — 양쪽 타입 모두 수신 (sender='video-share' 였음)
        // ⚠ 옛 코드는 sender 가 'video-share' 인데 receiver 는 'video-sync' 만 처리해서
        //    참가자 화면에 URL 이 영영 도달하지 못한 버그. 양쪽 다 받아 호환성 보장.
        case 'video-sync':
        case 'video-share': {
            const vUrl = msg.data.url;
            if (vUrl) window.vcApplySharedVideo(vUrl);   // 폴링과 동일 경로 — 중복 로드 없음
            break;
        }
        case 'video-stop-share':
            vpClearRemote();
            break;

        // 관찰자 전용 메시지: 새 참가자가 입장 → 관찰자가 offer 전송
        case 'observer-user-joined':
            if (vcIsObserver && msg.data.userId) {
                console.log('[vc-observer] 새 참가자 감지, offer 전송:', msg.data.userId);
                /* 👁 (2026-08-11) 빈 방이라 띄워 둔 «아직 아무도 없습니다» 를 여기서 걷는다.
                   사람이 들어왔는데 그 안내가 남아 있으면 그게 더 헷갈린다. */
                try { vcObserverBanner(''); } catch (_) {}
                vcCreatePeerAndOffer(msg.data.userId, msg.data.username);
            }
            break;

        // 관찰자 전용 메시지: 참가자 퇴장
        case 'observer-user-left':
            if (vcIsObserver && msg.data.userId) {
                console.log('[vc-observer] 참가자 퇴장:', msg.data.userId);
                vcRemovePeer(msg.data.userId);
            }
            break;
    }
}

async function vcCreatePeerAndOffer(userId, username) {
    try {
        // 이미 연결이 있으면 건너뜀 (중복 방지)
        if (vcPeerConnections[userId]) {
            console.log('[vc-webrtc] createPeerAndOffer: 이미 PC 존재 →', userId, '건너뜀');
            return;
        }
        console.log('[vc-webrtc] createPeerAndOffer →', userId, username);
        try { await vcEnsureIceServers(); } catch(_) {}   // TURN 자격증명 보장(없으면 3초 내 포기)
        const pc = vcCreatePeer(userId, username);
        const offer = await pc.createOffer();
        offer.sdp = vcTuneAudioSdp(offer.sdp);            // 🔊 Opus FEC — 패킷 손실에도 소리 유지
        await pc.setLocalDescription(offer);
        console.log('[vc-webrtc] offer 전송 →', userId, 'SDP type:', offer.type);
        vcConn.send({ type: 'offer', data: { targetUserId: userId, sdp: pc.localDescription } });
    } catch (e) {
        console.error('[vc-webrtc] createPeerAndOffer 에러:', e);
    }
}

function vcApplyLowPower(pc) {
  var isMobile = window.matchMedia('(max-width: 920px)').matches
                 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

  // 1) 코덱 우선순위: H.264 → VP8 (offer 만들기 전에 적용해야 효과)
  try {
    if (window.RTCRtpReceiver && RTCRtpReceiver.getCapabilities) {
      var caps = RTCRtpReceiver.getCapabilities('video');
      if (caps && caps.codecs) {
        var pref = [], rest = [];
        ['video/H264', 'video/VP8'].forEach(function(m){
          caps.codecs.forEach(function(c){ if (c.mimeType.toLowerCase() === m.toLowerCase()) pref.push(c); });
        });
        caps.codecs.forEach(function(c){ if (pref.indexOf(c) < 0) rest.push(c); });
        var ordered = pref.concat(rest);
        pc.getTransceivers().forEach(function(tr){
          if (tr.sender && tr.sender.track && tr.sender.track.kind === 'video' && tr.setCodecPreferences) {
            try { tr.setCodecPreferences(ordered); } catch(_){}
          }
        });
      }
    }
  } catch(e){ console.warn('[lowpower codec]', e); }

  // 2) 송신 비트레이트·fps 상한 (모바일만 강하게)
  try {
    var sender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'video'; });
    if (sender && sender.getParameters) {
      var params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate   = (isMobile ? 500 : 1200) * 1000; // 모바일 500kbps
      params.encodings[0].maxFramerate = isMobile ? 15 : 24;
      /* 🎞 (2026-08-11) 'balanced' → 'maintain-framerate'.
         balanced 는 부하가 걸리면 «초당 장수» 도 함께 깎는다 → 강사가 신고한 "영상이 멈춘다".
         수업은 얼굴·입모양을 보는 일이라 잠깐 흐려지는 편이 멈추는 것보다 낫다. */
      params.degradationPreference = 'maintain-framerate';
      sender.setParameters(params).catch(function(e){ console.warn('[lowpower params]', e); });
    }
  } catch(e){ console.warn('[lowpower bitrate]', e); }

  // 3) 🔊 음성 우선 — 회선이 혼잡해도 영상보다 소리가 먼저 살아남게 (수업은 소리가 생명)
  try {
    var aSender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'audio'; });
    if (aSender && aSender.getParameters) {
      var ap = aSender.getParameters();
      if (!ap.encodings || !ap.encodings.length) ap.encodings = [{}];
      ap.encodings[0].priority = 'high';
      ap.encodings[0].networkPriority = 'high';
      aSender.setParameters(ap).catch(function(){});
    }
  } catch(e){ console.warn('[lowpower audio-prio]', e); }
}

function vcTuneAudioSdp(sdp) {
    try {
        if (!sdp) return sdp;
        const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
        if (!m) return sdp;
        const pt = m[1];
        const fmtpRe = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
        if (fmtpRe.test(sdp)) {
            sdp = sdp.replace(fmtpRe, function(_line, params) {
                let p = params;
                if (!/useinbandfec/.test(p)) p += ';useinbandfec=1';
                if (!/maxaveragebitrate/.test(p)) p += ';maxaveragebitrate=40000';
                if (!/usedtx/.test(p)) p += ';usedtx=1';   // 📶 무음 구간 전송 중단 → 저대역(필리핀) 업로드 절감
                return 'a=fmtp:' + pt + ' ' + p;
            });
        } else {
            sdp = sdp.replace(m[0], m[0] + '\r\na=fmtp:' + pt + ' useinbandfec=1;maxaveragebitrate=40000;usedtx=1');
        }
    } catch (e) { console.warn('[vc-sdp] 오디오 튜닝 실패(원본 사용):', e); }
    return sdp;
}

function vcQualityMode() {
    try { const v = localStorage.getItem(VC_Q_KEY); if (v === 'auto' || v === 'high' || v === 'low') return v; } catch (_) {}
    return 'low';                       // 기본값 = 저화질 (데이터·CPU 절약, 필리핀 회선 고려)
}

function vcQualityCaps() {
    const mobile = window.matchMedia('(max-width: 920px)').matches
                   || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    if (vcQualityMode() === 'low') return { br: (mobile ? 250 : 400) * 1000, fps: 15, scale: 2 };
    return { br: (mobile ? 500 : 1200) * 1000, fps: mobile ? 15 : 24, scale: 1 };
}

window.vcQualityCaps = vcQualityCaps;

window.vcSetQuality = function (mode) {
    if (mode !== 'auto' && mode !== 'high' && mode !== 'low') mode = 'auto';
    try { localStorage.setItem(VC_Q_KEY, mode); } catch (_) {}
    // 연결돼 있는 상대 모두에게 새 상한을 즉시 다시 적용 (단계는 그대로 두고 기준값만 바뀐다)
    try {
        Object.keys(vcPeerConnections || {}).forEach(function (id) {
            const pc = vcPeerConnections[id];
            if (!pc) return;
            if (window.__vcApplyStep) window.__vcApplyStep(pc, pc.__qStep || 0);
        });
    } catch (_) {}
    const c = vcQualityCaps();
    console.log('[vc-quality] 화질 모드 →', mode, Math.round(c.br / 1000) + 'kbps,', c.fps + 'fps, 해상도 1/' + c.scale);
};

window.vcGetQuality = vcQualityMode;

window.vcWantFullscreen = function () {
    try { return localStorage.getItem(VC_FS_KEY) !== '0'; } catch (_) { return true; }
};

window.vcSetFullscreenPref = function (on) { try { localStorage.setItem(VC_FS_KEY, on ? '1' : '0'); } catch (_) {} };

window.vcGoFullscreen = function () {
    if (!window.vcWantFullscreen()) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;                   // iOS 사파리는 문서 전체화면을 지원하지 않는다 — 조용히 넘어감
    try {
        const p = req.call(el);
        if (p && p.catch) p.catch(vcArmFullscreenRetry);
    } catch (_) { vcArmFullscreenRetry(); }
};

function vcArmFullscreenRetry() {
    if (window.__vcFsArmed) return; window.__vcFsArmed = true;
    const h = function () {
        document.removeEventListener('pointerdown', h, true);
        window.__vcFsArmed = false;
        setTimeout(function () { try { window.vcGoFullscreen(); } catch (_) {} }, 0);
    };
    document.addEventListener('pointerdown', h, true);
}

function vcAAOApply() {
    const A = window.__vcAAO; if (!A) return;
    if (typeof vcCamOn === 'undefined') return;
    if (!A.active && A.sev >= 3 && (A.floor || A.sev >= 5) && vcCamOn !== false) {
        A.active = true;
        try { if (window.vcLocalStream) vcLocalStream.getVideoTracks().forEach(function(t){ t.enabled = false; }); } catch (_) {}
        try { if (window.vcBg && vcBg.isProcessing) { vcBg._aaoWas = true; vcBg.isProcessing = false; } } catch (_) {}
        /* 🌐 (2026-08-08 Ness ③ 「카메라가 갑자기 꺼진다」) 강사 다수가 필리핀이다.
           이 안내가 한국어뿐이라, 회선이 나빠 **일부러** 끈 것을 «고장» 으로 신고해 왔다.
           한/영을 함께 적는다 — 라벨만 영어이고 내용이 한국어면 읽을 수 없다(사장님 지시). */
        vcAAONotify('📶 <b>Your internet is weak — sending audio only for a moment.</b> The class continues; video returns automatically.<br>인터넷이 약해 잠시 <b>음성만</b> 전송합니다 — 수업은 계속되고, 회복되면 영상이 자동으로 돌아옵니다.');
        // 상대에게도 알린다. 안 알리면 상대 화면에서 '검은 영상 = 장애' 로 오인해 재협상이 돈다
        // (대역폭 위기 중에 연결을 다시 맺는 것은 최악의 선택이다).
        vcBroadcastCamState(false, 'aao');
        console.warn('[vc-aao] 음성전용 진입 (오디오 손실 지속)');
    } else if (A.active && A.good >= 2) {
        A.active = false; A.sev = 0;
        try { if (vcCamOn !== false && window.vcLocalStream) vcLocalStream.getVideoTracks().forEach(function(t){ t.enabled = true; }); } catch (_) {}
        try { if (window.vcBg && vcBg._aaoWas) { vcBg.isProcessing = true; if (typeof vcBgRenderLoop === 'function') vcBgRenderLoop(); vcBg._aaoWas = false; } } catch (_) {}
        vcAAONotify('📶 <b>Connection recovered — video is back on.</b><br>연결이 회복되어 <b>영상을 다시 켭니다</b>');
        vcBroadcastCamState(vcCamOn !== false, 'aao');   // 사용자가 따로 꺼 둔 상태면 그건 존중
        console.warn('[vc-aao] 영상 복구');
    }
}

function vcAAONotify(html) {
    try {
        let el = document.getElementById('vc-aao-toast');
        if (!el) {
            el = document.createElement('div'); el.id = 'vc-aao-toast';
            el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:99999;max-width:86vw;' +
                'background:rgba(15,23,42,.94);color:#e6edff;border:1px solid rgba(125,211,252,.45);border-radius:12px;' +
                'padding:10px 16px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.5);text-align:center;' +
                'opacity:0;transition:opacity .2s;pointer-events:none';
            document.body.appendChild(el);
        }
        el.innerHTML = html; el.style.opacity = '1';
        if (__vcAAOtoastT) clearTimeout(__vcAAOtoastT);
        __vcAAOtoastT = setTimeout(function () { el.style.opacity = '0'; }, 4000);
    } catch (_) {}
}

function vcQualityAcc(loss, rtt) {
    var Q = window.__vcQ || (window.__vcQ = { s: [], r: [], sentAt: Date.now() });
    if (typeof loss === 'number' && isFinite(loss)) Q.s.push(loss);
    if (typeof rtt === 'number' && isFinite(rtt) && rtt > 0) Q.r.push(rtt);
    if (Date.now() - Q.sentAt < 60000 || !Q.s.length) return;
    try {
        var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var isT = (typeof vcIsTeacherRole === 'function') && vcIsTeacherRole();
        var A = window.__vcAAO || {};
        var body = JSON.stringify({
            room: (vcRoomId || ''),
            uid: (u && u.uid) || '', name: (u && u.name) || '',
            role: isT ? 'teacher' : ((u && u.role) || 'student'),
            avg_loss: +avg(Q.s).toFixed(1), max_loss: +Math.max.apply(null, Q.s).toFixed(1),
            avg_rtt: Math.round(avg(Q.r)), aao: A.active ? 1 : 0, samples: Q.s.length
        });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/vc/quality-log', new Blob([body], { type: 'application/json' }));
        else fetch('/api/vc/quality-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
    window.__vcQ = { s: [], r: [], sentAt: Date.now() };
}

function vcCreatePeer(userId, username) {
    // 기존 PC가 있으면 정리 후 새로 생성
    if (vcPeerConnections[userId]) {
        console.log('[vc-webrtc] 기존 PC 정리:', userId);
        try { vcPeerConnections[userId].close(); } catch(_) {}
        delete vcPeerConnections[userId];
        delete vcPendingCandidates[userId];   // fix (2026-07-05) 재생성 시 오래된 후보 버퍼 폐기
    }

    console.log('[vc-webrtc] createPeer:', userId, username, 'ICE서버:', ICE_SERVERS.iceServers.length, '개');
    // 📶 연결 수립 시간 단축 설정 — 후보 사전수집(pool) + 단일 번들(포트 1개)로 ICE 검사쌍 최소화.
    //   iceCandidatePoolSize: PC 생성 즉시 후보를 미리 모아 offer/answer 후 곧바로 연결 검사 시작.
    // 📶 직접(P2P) 연결에 실패해 재연결하는 경우엔 TURN 릴레이만 강제 → restrictive 망(필리핀 모바일/CGNAT) 복구율↑.
    //   최초/건강한 연결엔 영향 없음(플래그 미설정). 성공 시 해제되어 다음엔 다시 직접부터 시도.
    const _pcCfg = {
        iceServers: ICE_SERVERS.iceServers,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 2
    };
    if (__vcIceHasTurn && (window.__vcRelayAlways || (window.__vcForceRelay && window.__vcForceRelay[userId]))) {
        _pcCfg.iceTransportPolicy = 'relay';
        console.warn('[vc-webrtc] 🔁 relay 강제:', userId);
    }
    const pc = new RTCPeerConnection(_pcCfg);
    vcPeerConnections[userId] = pc;
    pc.__username = username;   // 이동 중 끊김 → 재연결 시 이름 복원용

    if (vcIsObserver) {
        // 관찰자: 미디어 전송 안 함, recvonly transceiver 추가
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        console.log('[vc-webrtc] 관찰자 모드: recvonly transceiver 추가');
    } else if (vcLocalStream) {
        const tracks = vcLocalStream.getTracks();
        console.log('[vc-webrtc] addTrack:', tracks.length, '개 (video:', vcLocalStream.getVideoTracks().length, ', audio:', vcLocalStream.getAudioTracks().length, ')');
        /* 🖥 (2026-08-12 Melca) 화면 공유 «도중» 입장한 사람에게는 카메라 대신 지금 공유 중인
           화면(그리고 소리 믹스)을 준다 — 예전엔 늦게 온 학생만 카메라를 받아
           "들어오면 보이게 됩니다" 안내와 반대로 영영 화면을 못 봤다. */
        tracks.forEach(t => {
            if (t.kind === 'video' && window.__vcScreenSharing
                && window.__vcScreenTrack && window.__vcScreenTrack.readyState === 'live') {
                pc.addTrack(window.__vcScreenTrack, vcLocalStream);
            } else if (t.kind === 'audio' && window.__vcScreenSharing
                && window.__vcScreenAudio && window.__vcScreenAudio.mixed && window.__vcScreenAudio.mixed.readyState === 'live') {
                pc.addTrack(window.__vcScreenAudio.mixed, vcLocalStream);
            } else {
                pc.addTrack(t, vcLocalStream);
            }
        });
        // 🔥 발열 최소화 — 송신 비디오에 효율 코덱(H.264/VP8) 우선 + 비트레이트·fps 상한
        try { vcApplyLowPower(pc); } catch(e) { console.warn('[lowpower]', e); }
    } else {
        console.warn('[vc-webrtc] ⚠ localStream 없음! 상대방에게 미디어가 전송되지 않음');
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('[vc-webrtc] ICE candidate 전송:', userId, event.candidate.type || 'unknown', event.candidate.protocol || '');
            vcConn.send({ type: 'ice-candidate', data: { targetUserId: userId, candidate: event.candidate } });
        } else {
            console.log('[vc-webrtc] ICE gathering 완료:', userId);
        }
    };

    pc.onicegatheringstatechange = () => {
        console.log('[vc-webrtc] ICE gathering(' + userId + '):', pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        console.log('[vc-webrtc] ICE(' + userId + '):', st);
        // 화면에 ICE 상태 표시
        const iceEl = document.getElementById('vc-ice-status');
        if (iceEl) {
            const labels = { 'new':'🔄연결중','checking':'🔍탐색중','connected':'✅연결됨','completed':'✅완료','failed':'❌실패','disconnected':'⚠끊김','closed':'🔒닫힘' };
            iceEl.textContent = 'v2.1 P2P:' + (labels[st] || st);
            iceEl.style.color = (st==='connected'||st==='completed') ? '#4CAF50' : st==='failed' ? '#f44336' : '#ff9800';
        }
        if (st === 'connected' || st === 'completed') {
            console.log('[vc-webrtc] ✅ ICE 연결 성공:', userId);
            try { if (window.__vcForceRelay) delete window.__vcForceRelay[userId]; } catch(_) {}   // 성공 → 다음엔 다시 직접연결부터 시도
        }
        if (st === 'failed') {
            console.warn('[vc-webrtc] ❌ ICE 실패 → 재연결:', userId);
            try { (window.__vcForceRelay || (window.__vcForceRelay = {}))[userId] = true; } catch(_) {}   // 다음 재연결은 TURN 릴레이 강제(직접 실패 → 릴레이가 더 확실)
            try { pc.restartIce(); } catch(_) {}      // 가벼운 시도 먼저
            vcReconnectPeer(userId);                   // 실제 복구(PC 재생성 + offer 재전송)
        }
        if (st === 'disconnected') {
            console.warn('[vc-webrtc] ⚠ ICE 끊김:', userId, '5초 후 재시도');
            try { pc.restartIce(); } catch(_) {}      // 일시적 끊김은 restartIce 로 회복될 수도
            setTimeout(() => {
                if (vcPeerConnections[userId] === pc && pc.iceConnectionState === 'disconnected') {
                    console.warn('[vc-webrtc] ICE 여전히 끊김 → 재연결:', userId);
                    vcReconnectPeer(userId);
                }
            }, 5000);
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('[vc-webrtc] conn(' + userId + '):', pc.connectionState);
        if (pc.connectionState === 'connected') {
            console.log('[vc-webrtc] ✅ P2P 연결 완료!', userId);
        }
        if (pc.connectionState === 'failed') {
            console.error('[vc-webrtc] ❌ P2P 연결 실패:', userId);
            /* 🔧 (2026-07-21) 예전엔 로그만 남기고 복구를 안 했다.
               복구 로직이 전부 iceConnectionState 에만 걸려 있어서, ICE 는 붙었는데
               그 뒤 DTLS 단계에서 깨지는 경우(connectionState=failed, ice 는 connected 유지)
               아무도 손대지 않아 그 학생 화면만 수업 내내 죽어 있었다.
               vcReconnectPeer 는 8초 쿨다운·수업중 가드가 있어 반복 호출에 안전하다. */
            try { pc.restartIce && pc.restartIce(); } catch (_) {}
            try { vcReconnectPeer(userId); } catch (_) {}
        }
    };

    pc.ontrack = (event) => {
        console.log('[vc-webrtc] ★ ontrack!', userId, event.track.kind, 'streams:', event.streams.length);
        // fix (2026-06-01) — ontrack 은 오디오/비디오 트랙마다 따로 호출됨.
        //   브라우저가 묶어준 streams[0] 이 있으면 그걸 쓰고, 없으면 유저별 영속 스트림에 트랙을 누적.
        //   (예전엔 트랙마다 new MediaStream 을 만들어 비디오가 누락 → 원격 화면이 검게 나왔음)
        let stream = event.streams && event.streams[0];
        if (!stream) {
            stream = vcRemoteStreams[userId];
            if (!stream) { stream = new MediaStream(); vcRemoteStreams[userId] = stream; }
            try { if (!stream.getTracks().some(t => t.id === event.track.id)) stream.addTrack(event.track); } catch(_){}
        } else {
            vcRemoteStreams[userId] = stream;
        }
        vcAddRemoteVideo(userId, username, stream);
        /* 🔊 (2026-08-08 마이마이 ④) 「처음 입장하면 학생이 소리가 안 들린다 — 조금 기다리니 들렸다」
           [원인] 오디오 트랙이 도착하는 이 자리에서 «소리 살리기»(vcEnsureRemoteAudio)를
                  **한 번도 부르지 않았다.** 원격 <video> 는 붙자마자 muted/paused 인 채라,
                  3초마다 도는 오디오 워치독이 뒤늦게 살려낼 때까지 몇 초 동안 조용했다.
                  「소리 켜기」 버튼이 안 뜬 것도 같은 이유 — 그건 «정책에 막혔을 때» 뜨는 것이지
                  «아직 아무도 재생을 시도하지 않은» 상태에는 뜨지 않는다.
           [수정] 트랙이 오는 그 순간 바로 살린다. 300ms 뒤 한 번 더 — <video> 에 srcObject 가
                  붙는 타이밍이 기기마다 조금씩 달라, 첫 시도가 빈 엘리먼트를 만날 수 있다.
           ⛔ 자동재생 정책에 막히는 경우까지 여기서 해결되지는 않는다(그건 사용자 터치가 필요).
              그 경로는 기존 워치독·배너가 그대로 담당한다 — 여기서는 «막히지도 않았는데
              그냥 조용했던» 몇 초를 없앤다. */
        if (event.track && event.track.kind === 'audio') {
            try { vcEnsureRemoteAudio(); } catch(_){}
            setTimeout(function(){ try { vcEnsureRemoteAudio(); } catch(_){} }, 300);
        }
        // 트랙이 늦게 도착(예: 비디오)해도 화면 갱신되도록 약간 뒤 한 번 더 시도
        // ⚠️ (2026-07-24) 예전엔 unmute 마다 vcAddRemoteVideo() 전체를 다시 돌렸다. 그런데 상대가
        //   마이크/카메라를 껐다 켤 때마다 unmute 가 뜨므로, 그때마다 타일 재부착·감시루프 재등록·
        //   채팅 대상칩 전체 재생성(innerHTML='')이 일어나 화면이 번쩍였다.
        //   → 이미 영상이 붙어 있으면 재생만 보장하고, 진짜로 비어 있을 때만 전체를 다시 그린다.
        try {
            event.track.onunmute = function(){
                try {
                    // 🔊 (2026-08-08 ④) 상대가 마이크를 껐다 켠 경우도 같은 구멍이었다 — 여기서도 살린다.
                    if (event.track.kind === 'audio') { try { vcEnsureRemoteAudio(); } catch(_){} }
                    var _box = document.getElementById('vc-video-' + userId);
                    var _v = _box && _box.querySelector('video');
                    if (_v && _v.srcObject) { var _p = _v.play(); if (_p && _p.catch) _p.catch(function(){}); return; }
                    vcAddRemoteVideo(userId, username, vcRemoteStreams[userId] || stream);
                } catch(_){}
            };
        } catch(_){}
        // 🆕 교사(원격 참가자) 영상 도착 → 자동 이등분(1/2)
        if (event.track && event.track.kind === 'video' && !window.__vcAutoHalfDone) {
            window.__vcAutoHalfDone = true;
            setTimeout(function(){ try{ var _hb=document.querySelector('.video-size-bar button[onclick*="half"]'); window.vcSetVideoSize && window.vcSetVideoSize('half', _hb); }catch(_){} }, 800);
        }
    };

    return pc;
}

async function vcHandleOffer(data) {
    try {
        const fromId = data.fromUserId;
        const fromName = data.fromUsername || '참가자';
        console.log('[vc-webrtc] offer 수신 from:', fromId, fromName);

        // 글레어(Glare) 처리: 양쪽이 동시에 offer를 보낸 경우
        // → userId가 작은 쪽이 offer를 취소하고 answer로 응답
        const existingPc = vcPeerConnections[fromId];
        if (existingPc && existingPc.signalingState === 'have-local-offer') {
            // 양쪽 다 offer를 보낸 상태 (글레어)
            if (vcUserId < fromId) {
                // 내 ID가 작으면: 내 offer를 취소하고, 상대 offer에 answer
                console.log('[vc-webrtc] 글레어 감지! 내 offer 취소, 상대 offer 수락:', fromId);
                await existingPc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                vcFlushPendingIce(fromId, existingPc);
                const answer = await existingPc.createAnswer();
                answer.sdp = vcTuneAudioSdp(answer.sdp);   // 🔊 Opus FEC
                await existingPc.setLocalDescription(answer);
                vcConn.send({ type: 'answer', data: { targetUserId: fromId, sdp: existingPc.localDescription } });
                return;
            } else {
                // 내 ID가 크면: 상대 offer 무시 (내 offer가 우선)
                console.log('[vc-webrtc] 글레어 감지! 내 offer 유지, 상대 offer 무시:', fromId);
                return;
            }
        }

        // 기존 PC가 있으면 정리
        try { await vcEnsureIceServers(); } catch(_) {}   // TURN 자격증명 보장(없으면 3초 내 포기)
        const pc = vcCreatePeer(fromId, fromName);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        vcFlushPendingIce(fromId, pc);
        const answer = await pc.createAnswer();
        answer.sdp = vcTuneAudioSdp(answer.sdp);          // 🔊 Opus FEC — 패킷 손실에도 소리 유지
        await pc.setLocalDescription(answer);
        console.log('[vc-webrtc] answer 전송 →', fromId, 'SDP type:', answer.type);
        vcConn.send({ type: 'answer', data: { targetUserId: fromId, sdp: pc.localDescription } });
    } catch (e) {
        console.error('[vc-webrtc] handleOffer 에러:', e);
    }
}

async function vcHandleAnswer(data) {
    try {
        console.log('[vc-webrtc] answer 수신 from:', data.fromUserId);
        const pc = vcPeerConnections[data.fromUserId];
        if (pc) {
            if (pc.signalingState !== 'have-local-offer') {
                console.warn('[vc-webrtc] answer 수신 but signalingState:', pc.signalingState, '→ 무시');
                return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            vcFlushPendingIce(data.fromUserId, pc);
            console.log('[vc-webrtc] ✅ answer 적용 완료:', data.fromUserId);
        } else {
            console.warn('[vc-webrtc] answer 수신 but PC 없음:', data.fromUserId);
        }
    } catch (e) {
        console.error('[vc-webrtc] handleAnswer 에러:', e);
    }
}

function vcFlushPendingIce(userId, pc) {
    const q = vcPendingCandidates[userId];
    if (!q || !q.length) return;
    console.log('[vc-webrtc] 버퍼된 ICE 후보 flush:', userId, q.length + '개');
    q.forEach((c) => { pc.addIceCandidate(c).catch((e) => console.warn('[vc-webrtc] flush ICE 실패:', e && e.name)); });
    delete vcPendingCandidates[userId];
}

async function vcHandleIce(data) {
    const pc = vcPeerConnections[data.fromUserId];
    if (!pc || !data.candidate) {
        if (!pc) console.warn('[vc-webrtc] ICE candidate 수신 but PC 없음:', data.fromUserId);
        return;
    }
    // fix (2026-07-05) — remoteDescription 이 아직 없으면 즉시 addIceCandidate 하면 예외로 유실됨.
    //   버퍼에 담아뒀다가 offer/answer 적용 직후 vcFlushPendingIce 로 투입 → 간헐 연결 실패 방지.
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
        (vcPendingCandidates[data.fromUserId] = vcPendingCandidates[data.fromUserId] || []).push(data.candidate);
        return;
    }
    try {
        await pc.addIceCandidate(data.candidate);
    } catch(e) {
        console.warn('[vc-webrtc] ICE candidate 추가 실패:', data.fromUserId, e.message);
    }
}

function vcEnsureParticipantBox(userId, username){
    if (!userId || userId === vcUserId) return null;
    if (userId !== 'demoteacher') { try { vcRemoveDemoTeacher(); } catch (e) {} }   // 🆕 진짜 참가자 입장 → 시연 선생님 제거
    var existing = document.getElementById('vc-video-' + userId);
    if (existing) {
        var lbl0 = existing.querySelector('.video-label'); if (lbl0 && username) lbl0.textContent = username;
        try { existing.dataset.role = (window.vcPeerRoles && window.vcPeerRoles[userId]) || existing.dataset.role || 'student'; } catch(e){}
        return existing;
    }
    var grid = document.getElementById('vc-video-grid'); if (!grid) return null;
    var box = document.createElement('div');
    box.className = 'video-box';
    box.id = 'vc-video-' + userId;
    try { box.dataset.role = (window.vcPeerRoles && window.vcPeerRoles[userId]) || 'student'; } catch(e){}
    box.innerHTML = '<video autoplay playsinline muted></video>' +
        '<span class="video-label">' + escHtml(username || '참가자') + '</span>' +
        '<div class="vc-connecting-hint">📷 연결 중…</div>';
    if (window.vcSoloMode) box.style.display = 'none';
    vcInsertBoxTeacherFirst(grid, box);   // 🧑‍🏫 상대 타일은 항상 내 타일 위
    try { vcUpdateGridCount(); } catch(e){}
    try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
    try { vcRefreshPraiseUI(); } catch(e){}   // 별 버튼/로스터 즉시 반영
    try { vcAddDmButton(box, userId); vcRefreshChatTargets(); } catch(e){}   // 🔒 개별채팅 버튼/칩
    return box;
}

function vcInsertBoxTeacherFirst(grid, box) {
    try {
        const lb = document.getElementById('vc-local-box');
        if (lb && lb.parentNode === grid) { grid.insertBefore(box, lb); return; }
    } catch (_) {}
    grid.appendChild(box);
}

function vcAddRemoteVideo(userId, username, stream) {
    if (userId !== 'demoteacher') { try { vcRemoveDemoTeacher(); } catch (e) {} }   // 🆕 진짜 원격영상 도착 → 시연 선생님 제거
    // 🇵🇭 (2026-07-24) 원격 영상이 들어왔다 = 상대가 (새 userId 로) 돌아왔다
    //   → 순단 때 남겨 둔 '재연결 중' 유령 타일을 즉시 치운다. 안 치우면 타일이 두 개로 보인다.
    try { if (document.querySelector('.video-box[data-vc-ghost="1"]')) vcSweepGhostTiles(); } catch (_) {}
    /* 👁 (2026-08-12) 영상이 늦게라도 도착하면 «영상이 안 온다» 배너를 걷는다.
       10초 감시가 이미 띄운 뒤에 TURN 경유로 붙는 경우가 있다 — 그때 경고가 남아 있으면 거짓말이 된다.
       ⚠️ 이 블록을 위의 vcSweepGhostTiles() «앞» 으로 옮기지 말 것 — vc_chat_blink_drop_harness 가
          「function vcAddRemoteVideo 뒤 400자 안에 vcSweepGhostTiles()」 로 검사한다(실제로 한 번 깨뜨림). */
    try { if (window._vcObserverMode) vcObserverBanner(''); } catch (_) {}
    // 이미 존재하는 비디오가 있으면 스트림만 교체 (미리 만든 placeholder 박스 포함)
    const existing = document.getElementById(`vc-video-${userId}`);
    if (existing) {
        const existingVid = existing.querySelector('video');
        if (existingVid) {
            // fix (2026-06-01) — 같은 스트림이어도 항상 play() 한번 더 호출(늦게 온 비디오 트랙 렌더 보장)
            if (existingVid.srcObject !== stream) existingVid.srcObject = stream;
            existingVid.play().catch(e => console.warn('[vc] 기존 비디오 play 실패:', e && e.name));
            // 🔊 보조 오디오 경로 사용 중이면 새 스트림의 오디오 트랙으로 갱신(재연결 후 무음 방지)
            try {
                const aux0 = document.getElementById('vc-aud-' + userId);
                if (aux0) {
                    const at0 = stream.getAudioTracks ? stream.getAudioTracks() : [];
                    if (at0.length) { aux0.srcObject = new MediaStream(at0); const ap0 = aux0.play(); if (ap0 && ap0.catch) ap0.catch(()=>{}); }
                }
            } catch(_) {}
        }
        var hint0 = existing.querySelector('.vc-connecting-hint'); if (hint0) hint0.remove();   // 영상 도착 → "연결 중" 제거
        try { attachStreamMonitor(existing, stream); } catch(e){}
        try { vcRefreshPraiseUI(); } catch(e){}
        try { vcAddDmButton(existing, userId); vcRefreshChatTargets(); } catch(e){}   // 🔒 개별채팅 버튼/칩
        return;
    }
    const grid = document.getElementById('vc-video-grid');
    const box = document.createElement('div');
    box.className = 'video-box';
    box.id = `vc-video-${userId}`;
    try { box.dataset.role = (window.vcPeerRoles && window.vcPeerRoles[userId]) || 'student'; } catch(e){}
    box.innerHTML = `<video autoplay playsinline muted></video><span class="video-label">${escHtml(username)}</span>`;
    const vid = box.querySelector('video');
    vid.srcObject = stream;
    try { vcApplySavedSink(vid); } catch(e){}   // 🔊 장치 도우미로 고른 스피커를 새 타일도 물려받음
    // fix (2026-06-01) — 메타데이터 로드/트랙 도착 시 재생 재시도(원격 영상 검게 나오던 문제 보강)
    vid.onloadedmetadata = () => { vid.play().catch(()=>{}); };
    // 🧑‍🏫 (2026-07-14 사장님 지시) 상대(교사) 타일은 항상 내 타일보다 '위' — 내 박스 앞에 삽입
    vcInsertBoxTeacherFirst(grid, box);
    vcUpdateGridCount();
    try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
    // fix — 솔로 모드 중 새로 입장한 참가자도 숨겨, "솔로인데 일부만 보이는" 반쪽 상태 방지
    if (window.vcSoloMode) box.style.display = 'none';
    // 모바일 자동재생 정책 대응: muted로 시작 → 재생 후 unmute
    // fix (2026-07-13) — 예전엔 500ms 뒤 '딱 한 번'만 음소거 해제 → 정책이 조용히 막으면 영원히 무음.
    //   재시도 사다리(0.4s/1.2s/2.8s/5s) + volume=1 강제 + unmute가 재생을 멈추면 즉시 play 재시도.
    vid.play().then(() => {
        const tryUnmute = (n) => {
            try {
                vid.volume = 1;
                vid.muted = false;
                if (vid.paused) vid.play().catch(() => {});
            } catch(_) {}
            if (n < 3 && (vid.muted || vid.paused)) setTimeout(() => tryUnmute(n + 1), 800 * (n + 1));
        };
        setTimeout(() => tryUnmute(0), 400);
        console.log('[vc] 원격 비디오 재생 시작:', userId);
    }).catch(e => {
        console.warn('[vc] 원격 비디오 자동재생 실패:', e.message);
        // 자동재생 실패 시 유저 클릭으로 재생하도록 안내
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶ 재생';
        playBtn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;padding:8px 16px;font-size:16px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;';
        playBtn.onclick = () => { vid.muted = false; vid.play(); playBtn.remove(); };
        box.style.position = 'relative';
        box.appendChild(playBtn);
    });
    attachStreamMonitor(box, stream);
    vcAddDetachButton(box);
    try { vcAddStarButton(box, userId); } catch(e){}
    try { vcAddDevBtn(box, userId); } catch(e){}   // 🎛 장치 도우미 (강사 화면에서만 붙음)
    try { vcAddDmButton(box, userId); vcRefreshChatTargets(); } catch(e){}   // 🔒 개별채팅 버튼/칩
}

function vcIsTeacherRole(){
    try {
        var r = '';
        var _u0 = null;
        try { _u0 = (typeof getCurrentUser === 'function') ? getCurrentUser() : null; if (_u0 && _u0.role) r = _u0.role; } catch(e){}
        // 🎭 (2026-08-08 Ana ①) 저장된 역할은 «주인이 맞을 때만» 쓴다 — 공용 PC 에 남은 강사 역할이
        //    다음 학생에게 넘어가던 경로. 자세한 이유는 vcRoleStored 주석 참고.
        if (!r) { try { r = window.vcRoleStored ? window.vcRoleStored() : ''; } catch(e){} }
        if (!r) { try { if (window.MangoV3 && window.MangoV3.user && window.MangoV3.user.role) r = window.MangoV3.user.role; } catch(e){} }
        if (!r) r = window.vcMyRole || '';
        if (r === 'teacher' || r === 'admin') return true;
        /* 🚫 (2026-08-12 Melca 6번 「학생 화면에 자물쇠 아이콘이 보인다」)
           역할이 **이미 정해져 있으면** 이름 추측을 쓰지 않는다.
           이름 휴리스틱은 «아무 정보도 없을 때» 쓰는 마지막 수단인데, 아래 두 경우에
           정해진 답을 덮어써 학생에게 강사 칩(🔒 필기 잠금·🔒 배경 잠금 등)을 보여 줬다.
             ① ?vc_role=student 로 «학생» 이라고 URL 이 명시했는데도 이름에 teacher 가 있어 승격
             ② 서버가 «이 예약의 학생» 이라 판정해 vcMyRole 을 student 로 내렸는데(2627행)
                로그인이 없어 여기서 다시 올라감 — 서버의 결정이 조용히 뒤집혔다
           🔑 «내리는» 쪽으로만 작동하므로 진짜 강사가 못 들어오는 일은 없다.
              역할이 아직 비어 있으면(r === '') 예전처럼 이름으로 백업 판정한다. */
        if (r === 'student' || r === 'observer') return false;
        if (window.__vcRoleFromUrl) return false;
        /* 🚫 이름 휴리스틱은 «로그인이 아예 없을 때» 만. 로그인한 사람에게 쓰면
           아이디에 teacher 가 들어간 학생이 강사 권한을 갖는다(반 전체 교재를 넘길 수 있다). */
        if (_u0) return false;
        // 로그인 없이 자동입장한 경우: 이름에 교사/강사/선생님/teacher 등이 있으면 강사로 간주
        var name = ((typeof vcUsername !== 'undefined' && vcUsername) || '') + '';
        if (/교사|강사|선생님|teacher|tutor/i.test(name)) return true;
    } catch(e){}
    return false;
}

window.vcIsStaffNow = function(){
    try {
        if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') return true;
        return (typeof vcIsTeacherRole === 'function') ? !!vcIsTeacherRole() : false;
    } catch(e){ return false; }
};

window.vcIsStudentNow = function(){
    try {
        if (window.vcIsStaffNow && window.vcIsStaffNow()) return false;
        if (window.vcMyRole === 'student' || window.vcMyRole === 'observer') return true;
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (u && String(u.role || '').toLowerCase() === 'student') return true;
    } catch(e){}
    return false;
};

window.vcWarmupMirror = function(who, text){
  try {
    var box = document.getElementById('vc-warmup-mirror');
    var log = document.getElementById('vc-warmup-mirror-log');
    if (!box || !log) return;
    box.style.display = 'block';
    var row = document.createElement('div');
    row.style.cssText = 'margin-bottom:3px;word-break:break-word';
    var tag = document.createElement('b');
    tag.style.color = (who === 'ai') ? '#fbbf24' : '#7dd3fc';
    tag.textContent = (who === 'ai') ? '🥭 Mango: ' : '🙋 학생: ';
    row.appendChild(tag);
    row.appendChild(document.createTextNode(String(text || '')));   // textContent — HTML 주입 차단
    log.appendChild(row);
    /* 길어지면 앞쪽을 버린다 — 한 수업 내내 쌓이면 강사 화면이 무거워진다 */
    while (log.childNodes.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  } catch(_){}
};

window.vcCanControlTextbook = function(){
    try { return (typeof vcIsStaffNow === 'function') ? !!vcIsStaffNow()
                 : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'); }
    catch(e){ return false; }
};

window.vcTextbookDenied = function(){
    try {
        if (window.__vcTbDenyAt && Date.now() - window.__vcTbDenyAt < 4000) return;
        window.__vcTbDenyAt = Date.now();
        var en = (typeof getLang === 'function' && getLang() === 'en');
        if (typeof mangoToast === 'function') mangoToast(en
            ? 'Only the teacher can change the textbook for the class.'
            : '교재는 선생님만 바꿀 수 있어요.');
    } catch(_){}
};

window.vcRenderTextbookControls = function(){
    try {
        var bar = document.querySelector('#tab-pdf .pdf-controls');
        if (!bar) return;
        var staff = window.vcCanControlTextbook();
        var SEL = ['button[onclick*="triggerUpload"]',
                   'button[onclick*="openTextbookLibrary"]',
                   'button[onclick*="pdfStopShare"]'];
        SEL.forEach(function(sel){
            bar.querySelectorAll(sel).forEach(function(b){
                b.style.display = staff ? '' : 'none';
            });
        });
    } catch(_){}
};

window.vcRenderVideoControls = function(){
    try {
        var bar = document.querySelector('#tab-video .vp-controls');
        if (!bar) return;
        var staff = window.vcCanControlTextbook();
        var SEL = ['#vp-url',
                   'button[onclick*="vpOpenYouTube"]',
                   'button[onclick*="vpLoadUrl"]',
                   '.vp-file-btn',
                   'button[onclick*="vpClear"]'];
        SEL.forEach(function(sel){
            bar.querySelectorAll(sel).forEach(function(b){
                b.style.display = staff ? '' : 'none';
            });
        });
    } catch(_){}
};

function vcBoxIsStudent(box){
    if (!box || !box.id || box.id === 'vc-local-box') return false;
    var uid = box.id.replace('vc-video-', '');
    var role = box.dataset.role || (window.vcPeerRoles && window.vcPeerRoles[uid]) || 'student';
    if (role === 'teacher' || role === 'admin' || role === 'observer') return false;
    var lbl = box.querySelector('.video-label');
    var nm = (lbl && lbl.textContent) ? lbl.textContent : '';
    if (/교사|강사|선생님|teacher|tutor/i.test(nm)) return false;
    return true;
}

function vcSyncStarCount(btn, uid){
    if (!btn) return;
    var c = (window._vcAwardCounts && window._vcAwardCounts[uid]) || 0;
    var el = btn.querySelector('.vsb-count');
    if (el){ el.textContent = c > 0 ? c : ''; el.style.display = c > 0 ? 'inline-flex' : 'none'; }
}

function vcSyncAwardUI(uid){
    var c = (window._vcAwardCounts && window._vcAwardCounts[uid]) || 0;
    var fb = document.querySelector('#vc-video-' + uid + ' .vc-star-btn .vsb-count');
    if (fb){ fb.textContent = c > 0 ? c : ''; fb.style.display = c > 0 ? 'inline-flex' : 'none'; }
    document.querySelectorAll('.vc-roster-chip').forEach(function(ch){
        if (ch.dataset && ch.dataset.uid === uid){
            var rc = ch.querySelector('.vrc-count');
            if (rc){ rc.textContent = c > 0 ? c : ''; rc.style.display = c > 0 ? 'inline-flex' : 'none'; }
        }
    });
}

function vcUpdatePraiseRoster(){
    try {
        var pane = document.getElementById('vc-video-pane');
        var roster = document.getElementById('vc-praise-roster');
        if (!vcIsTeacherRole() || !pane){ if (roster) roster.style.display = 'none'; return; }
        if (!roster){
            roster = document.createElement('div'); roster.id = 'vc-praise-roster';
            roster.innerHTML = '<span class="vpr-title">⭐ 칭찬 주기</span>';
            // 로스터 칩 공용 안내 말풍선
            var rt = document.createElement('span'); rt.className = 'vc-star-toast'; rt.id = 'vc-roster-toast';
            rt.style.left = '8px';
            // ★ 겹침 방지: 영상 그리드 '앞'의 일반 줄로 삽입 — 그리드가 로스터 아래에서 시작
            var grid0 = pane.querySelector('#vc-video-grid');
            if (grid0) pane.insertBefore(roster, grid0); else pane.appendChild(roster);
            pane.appendChild(rt);
        }
        // 과거 오버레이 방식 잔재 정리 + 그리드 앞 위치 보정(그리드가 늦게 생긴 경우)
        var grid = pane.querySelector('#vc-video-grid');
        if (grid && roster.nextElementSibling !== grid && roster.parentNode === pane) {
            try { pane.insertBefore(roster, grid); } catch(e){}
        }
        // 현재 학생(원격) 박스 목록 수집 — 다른 선생님/관찰자는 제외(학생만)
        var boxes = Array.prototype.slice.call(document.querySelectorAll('#vc-video-grid .video-box'))
            .filter(function(b){ return b.id && b.id !== 'vc-local-box' && vcBoxIsStudent(b); });
        if (!boxes.length){ roster.style.display = 'none'; return; }
        roster.style.display = 'flex';
        // 좁은 영상 칸에선 제목을 감춰 한 줄로 유지
        try { roster.classList.toggle('vpr-narrow', pane.getBoundingClientRect().width < 300); } catch(e){}
        // 안내 말풍선은 로스터 줄 '바로 아래'에 표시
        var rt2 = document.getElementById('vc-roster-toast');
        if (rt2){ try { rt2.style.top = (roster.offsetTop + roster.offsetHeight + 4) + 'px'; } catch(e){ rt2.style.top = '48px'; } }
        var wanted = {};
        boxes.forEach(function(box){
            var uid = box.id.replace('vc-video-', '');
            var lbl = box.querySelector('.video-label');
            var nm = (lbl && lbl.textContent ? lbl.textContent : uid).replace(/\s*\(.*\)\s*$/, '').trim() || uid;
            wanted[uid] = nm;
        });
        // 나간 학생 칩 제거
        Array.prototype.slice.call(roster.querySelectorAll('.vc-roster-chip')).forEach(function(ch){
            if (!wanted[ch.dataset.uid]) ch.remove();
        });
        // 추가/갱신
        Object.keys(wanted).forEach(function(uid){
            var chip = null;
            roster.querySelectorAll('.vc-roster-chip').forEach(function(c){ if (c.dataset.uid === uid) chip = c; });
            if (!chip){
                chip = document.createElement('button'); chip.type = 'button'; chip.className = 'vc-roster-chip'; chip.dataset.uid = uid;
                chip.innerHTML = '<span class="vrc-star">⭐</span><span class="vrc-name"></span><span class="vrc-count"></span>';
                chip.title = '이 학생에게 칭찬 포인트 +1';
                chip.addEventListener('click', function(e){
                    e.stopPropagation();
                    var rt = document.getElementById('vc-roster-toast');
                    vcAwardPoint(uid, chip, rt);
                });
                roster.appendChild(chip);
            }
            chip.querySelector('.vrc-name').textContent = wanted[uid];
            vcSyncAwardUI(uid);
        });
    } catch(e){}
}

function vcAddStarButton(box, targetUserId){
    if (!box || !vcIsTeacherRole() || box.querySelector('.vc-star-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'vc-star-btn';
    btn.type = 'button';
    btn.title = '⭐ 칭찬 포인트 주기 — 이 학생이 잘했을 때 누르면 이 학생 바구니에 +1P';
    btn.setAttribute('aria-label', '이 학생에게 칭찬 포인트 주기');
    btn.innerHTML = '<span class="vsb-ic">⭐</span><span class="vsb-lbl">칭찬</span><span class="vsb-count"></span>';
    const toast = document.createElement('span');
    toast.className = 'vc-star-toast';
    box.style.position = box.style.position || 'relative';
    btn.addEventListener('click', (e) => { e.stopPropagation(); vcAwardPoint(targetUserId, btn, toast); });
    box.appendChild(btn);
    box.appendChild(toast);
    vcSyncStarCount(btn, targetUserId);   // 재접속/재렌더 시에도 누적 개수 복원
    try { vcApplyPraiseCompact(); } catch(e){}
}

function vcRefreshPraiseUI(){
    try {
        var teacher = vcIsTeacherRole();
        var localBox = document.getElementById('vc-local-box');
        if (teacher) {
            // 강사 본인 화면엔 바구니 X
            if (localBox) { var lb = localBox.querySelector('.vc-point-basket'); if (lb) lb.remove(); }
            // 학생(원격) 박스마다 별 버튼 — 다른 선생님/관찰자 박스에는 붙이지 않고, 잘못 붙었으면 제거.
            document.querySelectorAll('#vc-video-grid .video-box').forEach(function(box){
                if (box.id === 'vc-local-box') return;
                var uid = (box.id || '').replace('vc-video-', '');
                /* 🎛 장치 도우미 — 별(칭찬)과 달리 «모든 원격 박스» 에 붙는다(2026-08-12 재택 강사 지원).
                   학생 체크 안에 두면 강사 타일은 역할이 늦게 확정될 때 영영 버튼을 못 받는다. */
                if (uid) { try { vcAddDevBtn(box, uid); } catch(e){} }
                if (uid && vcBoxIsStudent(box)) {
                    vcAddStarButton(box, uid);
                } else {
                    var s = box.querySelector('.vc-star-btn'); if (s) s.remove();
                    var t = box.querySelector('.vc-star-toast'); if (t) t.remove();
                    /* 🎛 (2026-08-12) 여기서 .vc-devhelp-btn 을 지우지 말 것.
                       위 vcAddDevBtn 이 «모든 원격 박스» 에 붙이는 게 새 의도(abf53d893 — 강사 타일에도)인데,
                       이 옛 정리줄이 남아 «붙임→즉시 제거» 를 매 스윕 반복 — 강사 타일만 버튼이 영영 없었다
                       (사장님 실측: 학생 타일 🎛 O · 강사 타일 X). 별(칭찬)은 학생 전용이 맞으니 그대로 둔다. */
                }
            });
        } else {
            // 학생: 별 버튼 제거 + 내 박스에 바구니
            document.querySelectorAll('.vc-star-btn, .vc-star-toast').forEach(function(el){ el.remove(); });
            var rr = document.getElementById('vc-praise-roster'); if (rr) rr.style.display = 'none';
            vcEnsurePointBasket();
        }
        // 박스 폭에 따라 컴팩트(아이콘만) 여부 결정 — 좁으면 글자 감춰 겹침 방지
        vcApplyPraiseCompact();
        // 강사 전용 "칭찬 주기" 바 갱신 (영상 레이아웃 무관하게 항상 지급 가능)
        vcUpdatePraiseRoster();
    } catch(e){}
}

function vcApplyPraiseCompact(){
    try {
        document.querySelectorAll('.vc-star-btn, .vc-point-basket').forEach(function(el){
            var box = el.closest('.video-box');
            var w = box ? box.getBoundingClientRect().width : 999;
            el.classList.toggle('vc-star-compact', w > 0 && w < 170);
        });
        document.querySelectorAll('.video-box').forEach(function(box){
            var detach = box.querySelector('.video-detach-btn');
            if (!detach) return;
            var hasPraise = box.querySelector('.vc-star-btn, .vc-point-basket');
            detach.style.display = hasPraise ? 'none' : '';
        });
    } catch(e){}
}

function vcShowStarToast(toast, text){
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 1600);
}

function vcClientId(){
    // 🔧 (2026-07-14) 탭 단위 식별자로 변경 — 예전 'acct:<uid>' 방식은 같은 계정으로
    //   두 기기/두 탭이 같은 방에 들어오면 서버 dedup 이 서로의 소켓을 번갈아 닫아
    //   "화면이 자꾸 튕기는" 무한 킥 루프가 됐다(가족 공용 계정·교사 PC+폰 동시접속 등).
    //   sessionStorage 는 같은 탭의 새로고침·재연결에는 그대로 유지되므로
    //   원래 잡으려던 '유령 타일(좀비 소켓)' dedup 은 계속 동작하고,
    //   다른 탭/다른 기기와는 절대 겹치지 않는다.
    try {
        var k = sessionStorage.getItem('mangoi_vc_client_id');
        if (!k) { k = 'tab:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('mangoi_vc_client_id', k); }
        return k;
    } catch(e){}
    // sessionStorage 불가 환경 폴백 — 페이지 수명 동안만 유지되는 메모리 id (계정 id 는 절대 사용 금지)
    if (!window.__vcMemClientId) window.__vcMemClientId = 'mem:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return window.__vcMemClientId;
}

function vcRegisterRosterIdentity(){
    try {
        if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;   // 👁 참관자는 로스터에 안 올린다(칭찬 적립 대상 아님)
        if (vcIsTeacherRole()) return;                 // 학생만 등록(선생님 X)
        if (!vcUserId || !vcRoomId) return;
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (!u || !u.uid) return;                      // 로그인 안 된 게스트는 등록 불가(적립 대상 계정이 없음)
        fetch('/api/vc/roster', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: vcRoomId, peer_id: vcUserId, account_uid: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), name: u.name || vcUsername || '', role: 'student' })
        }).catch(function(){});
    } catch(e){}
}

function vcAwardPoint(targetUserId, btn, toast){
    if (btn && btn.classList.contains('vc-star-cooldown')) return;
    const awardId = 'pt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
    try { vcConn && vcConn.send({ type: 'point-award', data: { targetUserId, awardId, fromName: vcUsername || '선생님' } }); } catch(e){}
    // 🌟 서버측 확실 적립 — 학생 브라우저 상태와 무관하게, 입장 때 등록된 계정으로 서버가 직접 적립(멱등).
    //   학생-자기적립 경로와 같은 awardId 를 써서 중복 적립되지 않는다(먼저 도착한 쪽만 1점).
    try {
        fetch('/api/points/award-praise', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: vcRoomId, target_peer_id: targetUserId, award_id: awardId, from_name: vcUsername || '선생님' })
        }).catch(function(){});
    } catch(e){}
    if (btn){
        btn.classList.add('vc-star-pop');
        setTimeout(() => btn.classList.remove('vc-star-pop'), 460);
        btn.classList.add('vc-star-cooldown');
        setTimeout(() => btn.classList.remove('vc-star-cooldown'), 1200); // 1.2초(서버 쿨다운 1초와 맞춤) — 연속 지급 원활
    }
    vcShowStarToast(toast, '⭐ 전송 중…');
    window._vcPendingAwards = window._vcPendingAwards || {};
    window._vcPendingAwards[awardId] = { toast: toast, btn: btn, targetUserId: targetUserId };
}

function vcLocalBoxVisible(){
    var box = document.getElementById('vc-local-box');
    if (!box) return false;
    try { return box.offsetWidth > 0 && box.offsetHeight > 0; } catch(e){ return false; }
}

function vcVisibleBasket(){
    var b = document.querySelector('#vc-local-box .vc-point-basket');
    try { if (b && b.getBoundingClientRect().width > 0) return b; } catch(e){}
    var f = document.getElementById('vc-basket-float');
    try { if (f && f.getBoundingClientRect().width > 0) return f; } catch(e){}
    return b || f || null;
}

function vcSyncBasketCounts(){
    try {
        var n = String(window._vcSessionPoints || 0);
        document.querySelectorAll('#vc-local-box .vc-point-basket .vpb-count, #vc-basket-float .vpb-count').forEach(function(c){
            c.textContent = n;
        });
    } catch(e){}
}

function vcEnsurePointBasket(){
    if (vcIsTeacherRole()) return null; // 선생님 화면엔 표시 안 함
    const box = document.getElementById('vc-local-box');
    if (!box) return null;
    let basket = box.querySelector('.vc-point-basket');
    if (basket) return basket;
    box.style.position = box.style.position || 'relative';
    basket = document.createElement('div');
    basket.className = 'vc-point-basket';
    basket.title = '🧺 내 포인트 바구니 — 이번 수업에서 선생님께 받은 칭찬 포인트';
    basket.setAttribute('aria-label', '내 포인트 바구니');
    basket.innerHTML = '<span class="vpb-icon">🧺</span><span class="vpb-count">' + String(window._vcSessionPoints || 0) + '</span>';
    box.appendChild(basket);
    try { vcApplyPraiseCompact(); } catch(e){}
    return basket;
}

function vcSpawnConfetti(box){
    if (!box) return;
    const colors = ['#fbbf24','#f472b6','#60a5fa','#34d399','#a78bfa'];
    const rect = box.getBoundingClientRect();
    for (let i = 0; i < 14; i++){
        const piece = document.createElement('span');
        piece.className = 'vc-confetti-piece';
        piece.textContent = ['⭐','🎉','✨'][i % 3];
        piece.style.left = (rect.left + rect.width * Math.random()) + 'px';
        piece.style.color = colors[i % colors.length];
        piece.style.setProperty('--vc-confetti-drift', (Math.random()*80-40) + 'px');
        piece.style.animationDuration = (0.9 + Math.random()*0.6) + 's';
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 1700);
    }
}

function vcGetSharedAC(){
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try {
        if (!window._gameAC) window._gameAC = new AC();
        if (window._gameAC.state === 'suspended') { try { window._gameAC.resume(); } catch(_){} }
        return window._gameAC;
    } catch(_) { return null; }
}

function vcPlayPointChime(){
    try {
        const ac = vcGetSharedAC(); if (!ac) return;
        const master = ac.createGain();
        master.gain.value = 0.9;                    // 전체를 크게
        master.connect(ac.destination);
        // 딩(도)–동(미)–댕(솔↑) 상승 3화음, 각 음에 옥타브 반짝임 배음
        const notes = [ 659.25, 830.61, 1046.50 ];  // E5 · G#5 · C6 (밝은 장3화음 상승)
        notes.forEach((freq, i) => {
            const t0 = ac.currentTime + i * 0.13;
            // 본음 (삼각파 = 따뜻하고 통통 튐)
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = 'triangle'; o.frequency.value = freq;
            o.connect(g); g.connect(master);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
            o.start(t0); o.stop(t0 + 0.45);
            // 반짝임 배음 (한 옥타브 위, 사인파, 살짝 작게)
            const o2 = ac.createOscillator(), g2 = ac.createGain();
            o2.type = 'sine'; o2.frequency.value = freq * 2;
            o2.connect(g2); g2.connect(master);
            g2.gain.setValueAtTime(0.0001, t0);
            g2.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012);
            g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
            o2.start(t0); o2.stop(t0 + 0.32);
        });
        // 마지막 "댕"에 반짝 셔틀 글리산도(짧게 위로 스윽)
        const tS = ac.currentTime + notes.length * 0.13;
        const sp = ac.createOscillator(), sg = ac.createGain();
        sp.type = 'sine'; sp.connect(sg); sg.connect(master);
        sp.frequency.setValueAtTime(1046, tS);
        sp.frequency.exponentialRampToValueAtTime(2093, tS + 0.18);
        sg.gain.setValueAtTime(0.0001, tS);
        sg.gain.exponentialRampToValueAtTime(0.22, tS + 0.02);
        sg.gain.exponentialRampToValueAtTime(0.0001, tS + 0.3);
        sp.start(tS); sp.stop(tS + 0.32);
    } catch(e){}
}

function vcBigSparkleBurst(box, basket){
    if (!box) return;
    box.style.position = box.style.position || 'relative';
    var br = box.getBoundingClientRect();
    // 바구니 중심(박스 상대 좌표). 바구니 없으면 좌상단 근처.
    var cx = 46, cy = 30;
    if (basket){ var kr = basket.getBoundingClientRect(); cx = (kr.left - br.left) + kr.width/2; cy = (kr.top - br.top) + kr.height/2; }
    // 1) 박스 전체 금빛 번쩍
    var flash = document.createElement('div'); flash.className = 'vc-glow-flash';
    box.appendChild(flash); setTimeout(function(){ flash.remove(); }, 900);
    // 2) 폭발 링(2겹)
    for (var r = 0; r < 2; r++){
        (function(delay){
            setTimeout(function(){
                var ring = document.createElement('div'); ring.className = 'vc-burst-ring';
                ring.style.left = cx + 'px'; ring.style.top = cy + 'px';
                box.appendChild(ring); setTimeout(function(){ ring.remove(); }, 780);
            }, delay);
        })(r * 120);
    }
    // 3) 별가루 방사 (사방)
    var glyphs = ['✨','⭐','🌟','💫'];
    for (var i = 0; i < 14; i++){
        var sp = document.createElement('span'); sp.className = 'vc-sparkle';
        sp.textContent = glyphs[i % glyphs.length];
        var ang = (Math.PI * 2 * i / 14) + Math.random()*0.5;
        var dist = 60 + Math.random()*70;
        sp.style.left = cx + 'px'; sp.style.top = cy + 'px';
        sp.style.setProperty('--dx', Math.cos(ang)*dist + 'px');
        sp.style.setProperty('--dy', Math.sin(ang)*dist + 'px');
        sp.style.setProperty('--dr', (Math.random()*360-180) + 'deg');
        sp.style.fontSize = (18 + Math.random()*16) + 'px';
        box.appendChild(sp);
        (function(el){ setTimeout(function(){ el.remove(); }, 1000); })(sp);
    }
    // 4) 바구니 빛남 + 두근
    if (basket){
        basket.classList.remove('vpb-glow','vpb-bump');
        void basket.offsetWidth;                 // 리플로우로 애니메이션 재시작 보장
        basket.classList.add('vpb-glow','vpb-bump');
        setTimeout(function(){ basket.classList.remove('vpb-glow','vpb-bump'); }, 980);
    }
    // 5) 큰 +1 튀어오름 (바구니 위)
    var fly = document.createElement('span'); fly.className = 'vpb-fly-big'; fly.textContent = '+1';
    fly.style.left = Math.max(6, cx - 14) + 'px'; fly.style.top = (cy - 10) + 'px';
    box.appendChild(fly); setTimeout(function(){ fly.remove(); }, 1100);
}

function vcCelebratePoint(awardId, fromName){
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const basket = vcEnsurePointBasket();
    vcPlayPointChime();
    const localBox = document.getElementById('vc-local-box');
    // 📱 fix (2026-07-13) — 내 박스가 숨겨진 화면(세로폰)에선 박스 기준 연출이 전부 안 보였음.
    //   화면 전체 고정 오버레이에 광채·별가루를 그려 '어느 화면 모드에서든' 반드시 보이게.
    const boxVisible = vcLocalBoxVisible();
    if (boxVisible) {
        vcSpawnConfetti(localBox);
        try { vcBigSparkleBurst(localBox, basket); } catch(e){}
    } else {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:100003;pointer-events:none;';
        document.body.appendChild(ov);
        vcSpawnConfetti(ov);                                   // 화면 전체에 색종이
        // 광채·별가루·+1 은 '보이는 바구니'(떠 있는 미러 포함) 위치 기준으로
        var anchor = null;
        try { anchor = vcVisibleBasket(); if (anchor && !(anchor.getBoundingClientRect().width > 0)) anchor = null; } catch(e){}
        try { vcBigSparkleBurst(ov, anchor); } catch(e){}
        setTimeout(function(){ try { ov.remove(); } catch(e){} }, 1500);
    }
    if (!u || !u.uid) { console.warn('[point-award] 로그인 정보 없음 — 로컬 연출만 표시'); return; }
    fetch('/api/points/earn-by-rule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), student_name: u.name || vcUsername, rule_code: 'teacher_praise_point', meta: { room: vcRoomId, awardId, from: fromName } })
    }).then(r => r.json()).then(d => {
        if (d.ok) {
            window._vcSessionPoints = (window._vcSessionPoints || 0) + (d.rule?.amount || 1);
            vcSyncBasketCounts();   // 박스 안 + 떠 있는 바구니 모두 갱신
        }
        try { vcConn && vcConn.send({ type: 'point-award-ack', data: { awardId, ok: !!d.ok, error: d.error } }); } catch(e){}
        if (typeof refreshPointsChip === 'function') refreshPointsChip(true);
    }).catch(() => {
        try { vcConn && vcConn.send({ type: 'point-award-ack', data: { awardId, ok: false, error: 'network' } }); } catch(e){}
    });
}

function vcAddDetachButton(box) {
    if (!box || box.querySelector('.video-detach-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'video-detach-btn';
    btn.title = '독립 창으로 분리';
    btn.textContent = '⇱';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vcToggleDetach(box, btn);
    });
    box.appendChild(btn);
}

function vcToggleDetach(box, btn) {
    if (box.classList.contains('detached')) {
        // 복귀
        box.classList.remove('detached');
        box.style.left = box.style.top = box.style.width = box.style.height = '';
        const grid = document.getElementById('vc-video-grid');
        if (grid) {
            // 🧑‍🏫 분리창에서 그리드로 복귀할 때도 상대 타일은 내 타일 위로
            if (box.id !== 'vc-local-box' && typeof vcInsertBoxTeacherFirst === 'function') vcInsertBoxTeacherFirst(grid, box);
            else grid.appendChild(box);
        }
        btn.textContent = '⇱';
        btn.title = '독립 창으로 분리';
    } else {
        // 분리 — body 로 이동 후 fixed 위치
        const rect = box.getBoundingClientRect();
        document.body.appendChild(box);
        box.classList.add('detached');
        // 기존 그리드 위치 근처에서 시작
        let left = rect.left, top = rect.top;
        // 화면 밖이면 기본 좌표
        if (left < 0 || top < 0 || left > window.innerWidth - 100) {
            left = window.innerWidth - 320;
            top = 80 + (document.querySelectorAll('.video-box.detached').length - 1) * 30;
        }
        box.style.left = left + 'px';
        box.style.top  = top + 'px';
        btn.textContent = '⇲';
        btn.title = '그리드로 복귀';
        vcMakeDraggable(box);
    }
}

function vcMakeDraggable(box) {
    if (box.__dragBound) return;
    box.__dragBound = true;
    let startX = 0, startY = 0, origL = 0, origT = 0, dragging = false;
    box.addEventListener('pointerdown', (e) => {
        if (!box.classList.contains('detached')) return;
        // 버튼/컨트롤 클릭 시 드래그 제외
        if (e.target.closest('.video-detach-btn')) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        const r = box.getBoundingClientRect();
        origL = r.left; origT = r.top;
        box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const nx = Math.max(0, Math.min(window.innerWidth - 60,  origL + (e.clientX - startX)));
        const ny = Math.max(0, Math.min(window.innerHeight - 40, origT + (e.clientY - startY)));
        box.style.left = nx + 'px';
        box.style.top  = ny + 'px';
    });
    box.addEventListener('pointerup',   () => { dragging = false; });
    box.addEventListener('pointercancel', () => { dragging = false; });
}

window.vcShowLocalPlaceholder = function(kind, errMsg) {
    const box = document.getElementById('vc-local-box');
    if (!box) return;
    const old = box.querySelector('.vc-local-placeholder');
    if (old) old.remove();
    const ph = document.createElement('div');
    ph.className = 'vc-local-placeholder';
    ph.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;padding:14px;text-align:center;z-index:4;border-radius:inherit;gap:8px;font-size:12px;line-height:1.5;';
    const isEn = miIsEn();
    const heads = {
        'camera-off':  isEn ? '📷 Camera is off'           : '📷 카메라가 꺼져 있어요',
        'camera-fail': isEn ? '⚠️ Camera access failed'    : '⚠️ 카메라를 사용할 수 없어요',
        'all-fail':    isEn ? '🚫 No camera or microphone' : '🚫 카메라·마이크 모두 사용 불가'
    };
    const hints = {
        'camera-off':  isEn ? 'Click below to try starting the camera again'                                 : '아래 버튼을 눌러 카메라를 다시 켜보세요',
        'camera-fail': isEn ? 'Check browser permission OR another app (Zoom, Teams) using the camera'       : '브라우저 주소창의 🔒/📷 아이콘에서 권한을 허용하거나, 다른 앱(줌·팀즈)이 카메라를 점유 중인지 확인하세요',
        'all-fail':    isEn ? 'Check device permissions in your OS settings'                                  : '브라우저 권한 또는 OS 설정에서 카메라·마이크 접근 권한을 확인해 주세요'
    };
    const icon = kind === 'camera-off' ? '📷' : kind === 'camera-fail' ? '⚠️' : '🚫';
    ph.innerHTML =
        '<div style="font-size:34px;line-height:1">' + icon + '</div>' +
        '<div style="font-weight:700;font-size:13.5px;color:#fbbf24">' + (heads[kind]||'') + '</div>' +
        '<div style="color:#cbd5e1;max-width:240px">' + (hints[kind]||'') + '</div>' +
        (errMsg ? '<div style="font-size:10.5px;color:#94a3b8;max-width:240px;opacity:0.85">' + errMsg + '</div>' : '') +
        '<button type="button" class="vc-local-retry-btn" style="margin-top:6px;padding:8px 18px;border:0;border-radius:99px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 8px 18px -8px rgba(124,58,237,0.55)">🔄 ' + (isEn?'Retry camera':'카메라 다시 시도') + '</button>';
    box.appendChild(ph);
    const btn = ph.querySelector('.vc-local-retry-btn');
    if (btn) btn.onclick = () => vcRetryCamera();
};

window.vcHideLocalPlaceholder = function() {
    const box = document.getElementById('vc-local-box');
    if (!box) return;
    const ph = box.querySelector('.vc-local-placeholder');
    if (ph) ph.remove();
};

window.vcRetryCamera = async function() {
    const box = document.getElementById('vc-local-box');
    const btn = box && box.querySelector('.vc-local-retry-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 시도 중…'; btn.style.opacity = '0.7'; }
    try {
        // 기존 트랙 정리 (다음 시도에서 권한이 잡히도록)
        if (typeof vcLocalStream !== 'undefined' && vcLocalStream && vcLocalStream.getVideoTracks) {
            vcLocalStream.getVideoTracks().forEach(t => { try { t.stop(); } catch(e){} });
        }
        const newStream = await acquireLocalMedia({ video: true, audio: true });
        const v = document.getElementById('vc-local-video');
        if (v) v.srcObject = newStream;
        vcLocalStream = newStream;
        // 모든 PC sender 의 비디오 트랙 교체 (참가자가 재시도된 영상을 보게)
        const newVid = newStream.getVideoTracks()[0];
        if (newVid && typeof vcPeerConnections === 'object' && vcPeerConnections) {
            Object.values(vcPeerConnections).forEach(pc => {
                try {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) sender.replaceTrack(newVid);
                } catch(e){}
            });
        }
        if (newStream.getVideoTracks().length > 0) {
            vcHideLocalPlaceholder();
            // 🔁 (2026-07-24) 권한 없이 입장했던 피어는 video sender 자체가 없어 위 replaceTrack 이
            //   아무 일도 하지 않는다 → 그런 피어만 재협상해 지금 확보한 카메라를 실제로 흘려보낸다.
            try {
                var _rn = window.vcRenegotiateMissing && window.vcRenegotiateMissing('video');
                if (_rn) console.warn('[vc] 카메라 재시도 → ' + _rn + '개 피어 재협상');
            } catch (_) {}
            console.log('[vc] 카메라 재시도 성공');
        } else {
            vcShowLocalPlaceholder('camera-off', '카메라 트랙이 여전히 없음');
        }
    } catch(e) {
        console.warn('[vc] 카메라 재시도 실패:', e);
        vcShowLocalPlaceholder('camera-fail', (typeof describeMediaError === 'function') ? describeMediaError(e) : (e && e.message || String(e)));
    }
};

function vcSmartFitVideo(v){
  try {
    if (!v || !v.videoWidth || !v.videoHeight) return;
    var box = v.closest('.video-box'); if (!box) return;
    var bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return;
    var vr = v.videoWidth / v.videoHeight, br = bw / bh;
    // 🖼 (2026-07-14 사장님 지시) 세로폰에서 '상대(교사 등) 타일'은 무조건 꽉 채움(cover).
    //   PC 교사의 16:9 영상이 세로 타일에 contain 으로 들어가면 위아래 검은띠로 작게 보였음
    //   ("교사 화면도 학생처럼 꽉차게"). 내 타일(vc-local-box)은 기존 잘림방지 로직 유지.
    try {
      if (box.id !== 'vc-local-box' && matchMedia('(max-width:920px) and (orientation:portrait)').matches) {
        v.style.setProperty('object-fit', 'cover', 'important');
        return;
      }
    } catch(e){}
    // 🩹 fix (2026-07-13) — 가상배경(세그멘테이션) 켜진 내 타일은 무조건 contain.
    //   가상배경 캔버스는 카메라 원본 비율이라, 세로로 긴 미리보기 타일에 cover 로 넣으면
    //   얼굴이 확대돼 아래(턱·목)가 잘림. 여백은 타일 배경 프레임이 채우므로 전체 표시가 우선.
    var vbgOn = (box.id === 'vc-local-box') && (typeof vcBg !== 'undefined') && vcBg && vcBg.mode && vcBg.mode !== 'off';
    // 일반 타일 임계값도 1.6→1.35 로 낮춰 애매한 비율차의 잘림까지 contain 처리
    var mismatch = vbgOn || ((vr < 1) !== (br < 1)) || (Math.max(vr, br) / Math.min(vr, br) > 1.35);
    // inline !important 라야 ph49 의 stylesheet !important(cover 강제)를 이김
    v.style.setProperty('object-fit', mismatch ? 'contain' : 'cover', 'important');
  } catch(e){}
}

function vcInstallSmartFit(v){
  if (!v) return;
  if (!v.__smartFit) {
    v.__smartFit = true;
    v.addEventListener('loadedmetadata', function(){ vcSmartFitVideo(v); });
    v.addEventListener('resize', function(){ vcSmartFitVideo(v); }); // 영상 해상도 변경 시
    // 타일 크기 변경(1/2·전체·PIP 버튼 등)에도 재계산
    try {
      var box = v.closest('.video-box');
      if (box && !box.__smartFitRO && window.ResizeObserver) {
        box.__smartFitRO = new ResizeObserver(function(){ vcSmartFitVideo(v); });
        box.__smartFitRO.observe(box);
      }
    } catch(e){}
  }
  vcSmartFitVideo(v);
}

function vcSmartFitAll(){
  try {
    document.querySelectorAll('.video-box video').forEach(function(v){ vcInstallSmartFit(v); });
  } catch(e){}
}

function vcMarkNoSound(box, on) {
    if (!box) return;
    let b = box.querySelector('.vc-nosound-badge');
    if (!on) { if (b) b.remove(); return; }
    if (b) return;
    try { if (getComputedStyle(box).position === 'static') box.style.position = 'relative'; } catch (_) {}
    const en = (typeof getLang === 'function' && getLang() === 'en');
    const uid = (box.id || '').replace('vc-video-', '');
    /* 강사에게는 «누를 수 있는» 배지로 준다 — 이 한 번의 클릭이 학생 브라우저에서 마이크를
       다시 잡게 한다(건의 1의 "학생 기기 설정을 바꾸고 싶다"에 대한 가장 가벼운 답).
       학생·관찰자에게는 그냥 안내 문구. */
    const staff = (typeof vcIsStaffNow === 'function') ? vcIsStaffNow() : false;
    b = document.createElement(staff && uid ? 'button' : 'div');
    b.className = 'vc-nosound-badge';
    b.textContent = staff && uid
        ? (en ? '🔇 No sound · Tap to fix' : '🔇 소리 없음 · 눌러서 고치기')
        : (en ? '🔇 No sound coming in' : '🔇 소리가 안 들어와요');
    b.title = en
        ? 'Mic is on but nothing is heard. Tapping asks their browser to pick up the microphone again.'
        : '마이크는 켜져 있는데 소리가 없어요. 누르면 학생 브라우저가 마이크를 다시 잡습니다.';
    if (staff && uid) {
        b.type = 'button';
        b.addEventListener('click', function (e) { e.stopPropagation(); vcRequestMicFix(uid, b); });
    }
    box.appendChild(b);
}

window.vcRequestMicFix = function (uid, btn) {
    if (!uid) return;
    const en = (typeof getLang === 'function' && getLang() === 'en');
    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-fix', data: { targetUserId: uid, what: 'mic' } }); } catch (_) {}
    if (btn) { btn.disabled = true; btn.textContent = en ? '🎧 Asking…' : '🎧 요청했어요…'; }
    try { if (typeof showToast === 'function') showToast(en ? '🎧 Asked the student to pick up the mic again' : '🎧 학생에게 마이크를 다시 잡도록 요청했어요'); } catch (_) {}
    /* 답이 없어도 8초 뒤엔 다시 누를 수 있게 되돌린다 — 학생이 오래된 화면이면 답이 안 온다 */
    setTimeout(function () {
        if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = en ? '🔇 No sound · Tap to fix' : '🔇 소리 없음 · 눌러서 고치기'; }
    }, 8000);
};

async function vcDevHelpGather() {
    var out = { cams: [], mics: [], spks: [] };
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return out;
    var list = await navigator.mediaDevices.enumerateDevices();
    var c = 0, m = 0, s = 0;
    list.forEach(function (d) {
        if (!d.deviceId || d.deviceId === 'communications') return;   // 윈도우 가짜 중복 항목 제외 (vc-dock 과 동일)
        var label = String(d.label || '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/i, '').trim().slice(0, 60);
        if (d.kind === 'videoinput'  && out.cams.length < 15) out.cams.push({ id: d.deviceId, label: label || ('Camera '  + (++c)) });
        if (d.kind === 'audioinput'  && out.mics.length < 15) out.mics.push({ id: d.deviceId, label: label || ('Mic '     + (++m)) });
        if (d.kind === 'audiooutput' && out.spks.length < 15) out.spks.push({ id: d.deviceId, label: label || ('Speaker ' + (++s)) });
    });
    return out;
}

async function vcDevHelpSendList() {
    try {
        var devs = await vcDevHelpGather();
        var cur = { cam: '', mic: '', spk: (typeof vcSavedSpkId === 'function' && vcSavedSpkId()) || 'default', camSaved: '', micSaved: '' };
        /* 가상배경·화면공유 중엔 송출 트랙이 캔버스라 deviceId 가 목록에 없는 임의 값이다(vc-dock 주석 참고)
           → 저장된 선택(camSaved/micSaved)을 같이 보내 강사 패널이 폴백으로 쓴다. */
        try { var vt = vcLocalStream && vcLocalStream.getVideoTracks()[0]; if (vt && vt.getSettings) cur.cam = vt.getSettings().deviceId || ''; } catch (_) {}
        try { var at = vcLocalStream && vcLocalStream.getAudioTracks()[0]; if (at && at.getSettings) cur.mic = at.getSettings().deviceId || ''; } catch (_) {}
        try { cur.camSaved = (typeof vcSavedCamId === 'function' && vcSavedCamId()) || ''; } catch (_) {}
        try { cur.micSaved = (typeof vcSavedMicId === 'function' && vcSavedMicId()) || ''; } catch (_) {}
        if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-list', data: {
            fromUserId: vcUserId, devices: devs, current: cur,
            sinkOk: ('setSinkId' in HTMLMediaElement.prototype)
        } });
    } catch (e) { console.warn('[dev-help] 목록 전송 실패:', e); }
}

function vcDevHelpEnsureCss() {
    if (document.getElementById('vc-devhelp-css')) return;
    var st = document.createElement('style');
    st.id = 'vc-devhelp-css';
    st.textContent =
        '.vc-devhelp-btn{position:absolute;top:40px;right:8px;z-index:8;background:rgba(15,23,42,.72);color:#fff;border:1px solid rgba(148,163,184,.35);border-radius:999px;padding:4px 9px;font-size:13px;line-height:1;cursor:pointer;}' +
        '.vc-devhelp-btn:hover{background:rgba(16,185,129,.85);}' +
        '#vc-devhelp-panel{position:fixed;right:16px;bottom:96px;z-index:2600;width:min(320px,calc(100vw - 24px));background:#0f172a;border:1px solid rgba(148,163,184,.35);border-radius:14px;box-shadow:0 18px 50px -12px rgba(0,0,0,.6);color:#e2e8f0;font-size:13px;padding:12px 14px;}' +
        '#vc-devhelp-panel h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:6px;}' +
        /* ⚠ flex 에서 space-between 금지(사이드바 hover 사고) — flex-start + margin-left:auto 로 오른쪽 정렬 */
        '#vc-devhelp-panel .dh-x{margin-left:auto;background:none;border:0;color:#94a3b8;font-size:15px;cursor:pointer;padding:2px 4px;}' +
        '#vc-devhelp-panel .dh-row{display:flex;align-items:center;gap:8px;margin:7px 0;}' +
        '#vc-devhelp-panel .dh-row label{flex:0 0 92px;color:#cbd5e1;font-weight:700;}' +
        '#vc-devhelp-panel .dh-row select{flex:1;min-width:0;background:#1e293b;color:#f1f5f9;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:6px 8px;font-size:12.5px;}' +
        '#vc-devhelp-panel .dh-row select:disabled{opacity:.45;}' +
        '#vc-devhelp-panel .dh-status{margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(148,163,184,.12);color:#cbd5e1;line-height:1.45;min-height:30px;}' +
        '#vc-devhelp-panel .dh-note{margin-top:4px;font-size:11px;color:#94a3b8;}' +
        '#vc-devhelp-panel .dh-refresh{background:rgba(37,99,235,.25);border:1px solid #3b82f6;color:#dbeafe;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;}';
    document.head.appendChild(st);
}

function vcDevHelpTxt(el, ko, en) {
    if (!el) return;
    el.setAttribute('data-ko', ko); el.setAttribute('data-en', en);
    el.textContent = (typeof getLang === 'function' && getLang() === 'en') ? en : ko;
}

function vcDevHelpStatus(ko, en) {
    var p = document.getElementById('vc-devhelp-panel');
    if (p) vcDevHelpTxt(p.querySelector('.dh-status'), ko, en);
}

function vcDevHelpNote(ko, en) {
    var p = document.getElementById('vc-devhelp-panel');
    if (!p) return;
    var el = p.querySelector('.dh-note');
    vcDevHelpTxt(el, ko, en);
    el.style.display = ko ? '' : 'none';
}

function vcDevHelpClose() {
    var p = document.getElementById('vc-devhelp-panel'); if (p) p.remove();
    if (window.__vcDevHelp) clearTimeout(window.__vcDevHelp.timer);
    window.__vcDevHelp = null;
}

window.vcDevHelpClose = vcDevHelpClose;

function vcDevHelpRequest() {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p) return;
    p.querySelectorAll('select').forEach(function (s) { s.disabled = true; s.innerHTML = ''; });
    vcDevHelpStatus('📡 상대 장치 목록을 요청했어요…', '📡 Asking them for their devices…');
    vcDevHelpNote('', '');
    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-list-req', data: { targetUserId: st.uid } }); } catch (_) {}
    clearTimeout(st.timer);
    st.timer = setTimeout(function () {
        vcDevHelpStatus('⚠ 응답이 없어요 — 상대 화면이 예전 버전이거나 연결이 불안정할 수 있어요. 🔄 로 다시 시도하세요.',
                        '⚠ No response — they may be on an older page or have a bad connection. Try 🔄 again.');
    }, 10000);
}

window.vcOpenDevHelp = function (uid, name) {
    if (!uid) return;
    vcDevHelpEnsureCss();
    var p = document.getElementById('vc-devhelp-panel');
    if (!p) {
        p = document.createElement('div');
        p.id = 'vc-devhelp-panel';
        var rows = [
            { k: 'cam', ko: '📷 카메라', en: '📷 Camera' },
            { k: 'mic', ko: '🎙 마이크', en: '🎙 Microphone' },
            { k: 'spk', ko: '🔊 스피커', en: '🔊 Speaker' }
        ].map(function (d) {
            return '<div class="dh-row"><label data-ko="' + d.ko + '" data-en="' + d.en + '">' + d.ko + '</label><select data-kind="' + d.k + '"></select></div>';
        }).join('');
        p.innerHTML = '<h4>🎛 <span class="dh-title"></span><button type="button" class="dh-x" aria-label="close">✕</button></h4>'
            + rows
            + '<div class="dh-status"></div><div class="dh-note" style="display:none"></div>'
            + '<div style="margin-top:8px"><button type="button" class="dh-refresh">🔄 <span data-ko="목록 새로고침" data-en="Refresh list">목록 새로고침</span></button></div>';
        p.querySelector('.dh-x').onclick = vcDevHelpClose;
        p.querySelector('.dh-refresh').onclick = vcDevHelpRequest;
        p.querySelectorAll('select').forEach(function (sel) {
            sel.onchange = function () { vcDevHelpApply(sel.getAttribute('data-kind'), sel.value); };
        });
        document.body.appendChild(p);
        try { if (window.applyI18n) window.applyI18n(p); } catch (_) {}
    }
    window.__vcDevHelp = { uid: uid, name: name || '' };
    vcDevHelpTxt(p.querySelector('.dh-title'), '장치 도우미 — ' + (name || '참가자'), 'Device Helper — ' + (name || 'Participant'));
    vcDevHelpRequest();
};

function vcDevHelpApply(kind, deviceId) {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p || !deviceId) return;
    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-set', data: { targetUserId: st.uid, kind: kind, deviceId: deviceId } }); } catch (_) {}
    p.querySelectorAll('select').forEach(function (s) { s.disabled = true; });
    vcDevHelpStatus('⏳ 적용 중…', '⏳ Applying…');
    clearTimeout(st.timer);
    st.timer = setTimeout(function () {
        p.querySelectorAll('select').forEach(function (s) { s.disabled = false; });
        vcDevHelpStatus('⚠ 결과 응답이 없어요 — 🔄 새로고침으로 상태를 다시 확인해 주세요.', '⚠ No result came back — press 🔄 to re-check.');
    }, 10000);
}

function vcDevHelpOnList(data) {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p || !data || data.fromUserId !== st.uid) return;
    clearTimeout(st.timer);
    var devs = data.devices || {};
    var cur = data.current || {};
    var map = { cam: [devs.cams || [], cur.cam, cur.camSaved], mic: [devs.mics || [], cur.mic, cur.micSaved], spk: [devs.spks || [], cur.spk, ''] };
    p.querySelectorAll('select').forEach(function (sel) {
        var k = sel.getAttribute('data-kind');
        var arr = map[k][0];
        sel.innerHTML = '';
        arr.forEach(function (d) {
            var o = document.createElement('option');
            o.value = d.id; o.textContent = d.label || String(d.id).slice(0, 8);
            sel.appendChild(o);
        });
        /* 지금 쓰는 장치 → 저장된 선택 순서로, 목록에 실제로 있는 첫 후보를 선택(vc-dock 과 같은 규칙) */
        var want = [map[k][1], map[k][2]];
        for (var i = 0; i < want.length; i++) {
            if (!want[i]) continue;
            var hit = false;
            for (var j = 0; j < sel.options.length; j++) if (sel.options[j].value === want[i]) { hit = true; break; }
            if (hit) { sel.value = want[i]; break; }
        }
        sel.disabled = !arr.length || (k === 'spk' && data.sinkOk === false);
    });
    if (data.sinkOk === false) vcDevHelpNote('ℹ 이 기기는 스피커 원격 변경을 지원하지 않아요 (iPhone·iPad 등).', 'ℹ This device cannot switch speakers remotely (iPhone/iPad etc.).');
    vcDevHelpStatus('✅ 목록을 받았어요 — 고르면 상대 기기에 바로 적용돼요.', "✅ Got the list — picking one applies instantly on their device.");
}

function vcDevHelpOnResult(data) {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p || !data || data.fromUserId !== st.uid) return;
    clearTimeout(st.timer);
    p.querySelectorAll('select').forEach(function (s) { s.disabled = false; });
    var lbl = data.label ? ' (' + data.label + ')' : '';
    if (data.ok && data.reason === 'deferred')
        vcDevHelpStatus('🖥 상대가 화면 공유 중 — 공유가 끝나면 새 카메라로 바뀌어요.', '🖥 They are screen-sharing — the new camera applies when it ends.');
    else if (data.ok)
        vcDevHelpStatus('✅ 바꿨어요' + lbl, '✅ Changed' + lbl);
    else if (data.reason === 'nosink')
        vcDevHelpStatus('⚠ 이 기기는 스피커 원격 변경이 안 돼요 (iPhone·iPad 등).', '⚠ This device cannot switch speakers remotely (iPhone/iPad etc.).');
    else
        vcDevHelpStatus('⚠ 실패 — 상대 화면에 원인 안내가 떴어요 (권한 차단·다른 앱 점유 등). 확인을 부탁하세요.',
                        '⚠ Failed — they saw the reason on their screen (permission blocked or another app using it). Ask them to check.');
}

function vcAddDevBtn(box, uid) {
    try {
        if (!box || !uid || uid === 'demoteacher') return;
        if (box.id === 'vc-local-box') return;
        if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) return;
        if (box.querySelector('.vc-devhelp-btn')) return;
        vcDevHelpEnsureCss();
        var en = (typeof getLang === 'function' && getLang() === 'en');
        var btn = document.createElement('button');
        btn.className = 'vc-devhelp-btn';
        btn.type = 'button';
        btn.textContent = '🎛';
        btn.title = en ? "Device helper — see and switch this participant's camera/mic/speaker"
                       : '장치 도우미 — 이 참가자의 카메라·마이크·스피커를 보고 바꿔 줍니다';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var lbl = box.querySelector('.video-label');
            window.vcOpenDevHelp(uid, ((lbl && lbl.textContent) || '').trim());
        });
        box.style.position = box.style.position || 'relative';
        box.appendChild(btn);
    } catch (_) {}
}

function vcMarkPeerReconnecting(box) {
    if (!box) return;
    box.dataset.vcGhost = '1';
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    let ov = box.querySelector('.vc-reconn-hint');
    if (!ov) {
        ov = document.createElement('div');
        ov.className = 'vc-reconn-hint';
        ov.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;'
            + 'background:rgba(15,23,42,.86);color:#93c5fd;font-size:13px;font-weight:700;text-align:center;line-height:1.4;padding:8px;z-index:5;pointer-events:none;';
        box.appendChild(ov);
    }
    const en = miIsEn();
    ov.innerHTML = '🔄<span>' + (en ? 'Reconnecting…<br>(please wait a moment)' : '재연결 중…<br>(잠시만 기다려 주세요)') + '</span>';
    clearTimeout(box.__ghostTimer);
    box.__ghostTimer = setTimeout(function(){
        try { if (box.dataset.vcGhost === '1') { box.remove(); vcUpdateGridCount(); } } catch(_){}
    }, VC_GHOST_TILE_MS);
}

function vcSweepGhostTiles() {
    try {
        document.querySelectorAll('.video-box[data-vc-ghost="1"]').forEach(function(b){
            clearTimeout(b.__ghostTimer); b.remove();
        });
        vcUpdateGridCount();
    } catch(_){}
}

window.vcSweepGhostTiles = vcSweepGhostTiles;

function vcRemovePeer(userId, reason) {
    const pc = vcPeerConnections[userId];
    if (pc) { pc.close(); delete vcPeerConnections[userId]; }
    try { delete vcPendingCandidates[userId]; } catch(_){}  // fix (2026-07-05) 버퍼된 ICE 후보 정리
    try { delete vcRemoteStreams[userId]; } catch(_){}   // fix (2026-06-01) 원격 스트림도 정리
    try { if (window.vcRemoteCamOff) delete window.vcRemoteCamOff[userId]; } catch(_){}  // 📷 카메라 상태 기록도 정리
    const box = document.getElementById(`vc-video-${userId}`);
    // 🇵🇭 스스로 나간 게 아니라 '끊긴' 것이면 타일을 바로 지우지 않는다 (위 주석 참고)
    if (box && reason && reason !== 'left') {
        // 🔴 (2026-07-24 재점검) 접두사를 'vc-video-' 와 겹치지 않게 할 것.
        //   처음엔 'vc-video-ghost-' 로 지었는데, 저장소 곳곳이 id.replace('vc-video-','') 나
        //   [id^="vc-video-"] 로 참가자를 찾는다. 그래서 유령이 '진짜 참가자'로 잡혀
        //   개별채팅 대상칩·칭찬 버튼·고착 워치독·녹화 합성까지 오염됐다.
        box.id = 'vcghost-' + userId;
        vcMarkPeerReconnecting(box);
        try { const aux1 = document.getElementById('vc-aud-' + userId); if (aux1) { aux1.srcObject = null; aux1.remove(); } } catch(_){}
        vcUpdateGridCount();
        return;
    }
    if (box) box.remove();
    // 🔊 보조 오디오 경로도 함께 정리 (남으면 다음 입장 때 옛 스트림 무음 재생)
    try { const aux = document.getElementById('vc-aud-' + userId); if (aux) { aux.srcObject = null; aux.remove(); } } catch(_){}
    vcUpdateGridCount();
}

function vcUpdateGridCount() {
    const grid = document.getElementById('vc-video-grid');
    if (!grid) return;
    // detached(팝아웃) 상태의 박스는 그리드 밖에 있으므로 실제 자식 중 video-box만 카운트
    const n = grid.querySelectorAll(':scope > .video-box').length;
    grid.setAttribute('data-count', String(Math.min(n, 9)));
    try { vcMarkPipPrimary(grid); } catch(e){}
}

function vcMarkPipPrimary(grid){
    grid = grid || document.getElementById('vc-video-grid');
    if (!grid) return;
    const boxes = Array.from(grid.querySelectorAll(':scope > .video-box'));
    const candidates = boxes.filter(b => b.id !== 'vc-local-box');
    const primary = candidates.find(b => (b.dataset && b.dataset.role) === 'teacher') || candidates[0] || null;
    boxes.forEach(b => b.classList.toggle('vc-pip-primary', b === primary));
}

function vcWatchVideoAspect(v){
    if (!v || v.__aspectWatch) return;
    v.__aspectWatch = true;
    var upd = function(){
        var box = v.closest ? v.closest('.video-box') : null;
        if (!box || !v.videoWidth || !v.videoHeight) return;
        box.classList.toggle('vid-portrait', v.videoHeight > v.videoWidth);
    };
    v.addEventListener('loadedmetadata', upd);
    v.addEventListener('resize', upd);   // 트랙 교체·회전 시 해상도 변경 감지
    upd();
}

async function vcLeaveRoom() {
    // 🧹 (2026-07-24 재점검) 남아 있는 '재연결 중' 유령 타일 + 종료 안내 배너 정리.
    //   안 지우면 SPA 로 홈에 갔다가 곧바로 재입장했을 때 지난 수업의 잔재가 새 화면에 남는다.
    try { vcSweepGhostTiles(); } catch(_) {}
    try { vcDevHelpClose(); } catch(_) {}   // 🎛 장치 도우미 패널 — 다음 수업에 남지 않게
    try { const _n = document.getElementById('vc-conn-notice'); if (_n) _n.remove(); } catch(_) {}
    // ── 자동 녹화 중이면 먼저 중지하고 R2 업로드 완료까지 대기 ──
    let vcRecResult = null;
    try {
        if (window.MangoV3 && typeof window.MangoV3.stopRecording === 'function') {
            console.log('[vcLeaveRoom] 녹화 중지 시도 (업로드 완료까지 대기)...');
            vcRecResult = await window.MangoV3.stopRecording();
            console.log('[vcLeaveRoom] 녹화 중지 결과:', vcRecResult);
        }
    } catch (e) {
        console.warn('[vcLeaveRoom] 녹화 중지/업로드 예외:', e);
    }

    // ⭐ 교사 전용 — 수업 종료 직후 AI 코칭 카드(잘한점/개선점 한·영). 학생에겐 안 뜸.
    //    (2026-07-22) 관리자/매니저/경영자에겐 억제 — 관리자 임베드(openLiveClass·mypage 수업입장)가
    //    vc_role=teacher 를 강제하고 이름도 '교사 …'라서 vcIsTeacherRole/이름 휴리스틱으로는 구분 불가.
    //    쿠키 세션 /api/admin/me 의 role 이 권위: teacher 외(hq·staff·franchise·branch·agency)면 카드 없음.
    //    세션이 없거나(401)·네트워크 오류면 기존 교사 판정을 그대로 따른다(실교사 카드 보장).
    try {
        var _fbRole = '';
        // 🎭 (2026-08-08) 저장된 역할은 주인(uid) 확인을 거친 값만 쓴다
        try { _fbRole = (window.vcMyRole || (window.vcRoleStored ? window.vcRoleStored() : '') || '') + ''; } catch(_){}
        var _isTeacher = (typeof vcIsTeacherRole === 'function') ? vcIsTeacherRole()
            : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
        if (_fbRole === 'admin') _isTeacher = false;   // 메인사이트 admin 역할도 코칭 대상 아님
        // 🚪 (2026-07-29) 회의방(meet-*)은 수업이 아니다 → 교사 AI 수업코칭 카드를 띄우지 않는다.
        if (window.__vcIsMeetingRoom && window.__vcIsMeetingRoom()) _isTeacher = false;
        if (_isTeacher && window.MangoTeacherFeedback && vcRoomId) {
            var _recId = (typeof recordingId !== 'undefined' && recordingId) ? recordingId
                : (vcRecResult && vcRecResult.recording_id) || null;
            var _tUid = '';
            try { var _u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null; if (_u) _tUid = _u.uid || _u.id || ''; } catch(_){}
            var _fbOpts = {
                room_id: vcRoomId,
                teacher_name: (typeof vcUsername !== 'undefined' ? vcUsername : ''),
                teacher_uid: _tUid,
                recording_id: _recId,
                lang: 'en'
            };
            // 방 정리를 막지 않도록 비동기로 확인 후 표시
            (async function(){
                try {
                    var _mr = await fetch('/api/admin/me', { credentials: 'include' });
                    if (_mr && _mr.ok) {
                        var _mj = await _mr.json().catch(function(){ return null; });
                        if (_mj && _mj.ok && _mj.role && _mj.role !== 'teacher') {
                            console.log('[teacher-feedback] 관리자 세션(role=' + _mj.role + ') — 코칭 카드 생략');
                            return;
                        }
                    }
                } catch(_){}
                window.MangoTeacherFeedback.show(_fbOpts);
            })();
        }
    } catch (e) { console.warn('[teacher-feedback] hook:', e); }

    Object.keys(vcPeerConnections).forEach(id => {
        vcPeerConnections[id].close();
        const el = document.getElementById(`vc-video-${id}`);
        if (el) el.remove();
    });
    vcPeerConnections = {};
    vcRemoteStreams = {};
    // 의도적 퇴장을 서버에 명시(leave-room) — close 프레임이 유실돼도 다른 참가자에게
    // 'dropped'(60초 유예)가 아닌 'left'(정상 퇴장)로 전달되게 한다.
    if (vcConn) { try { vcConn.send({ type: 'leave-room', data: {} }); } catch(_){} }
    if (vcConn) vcConn.close();
    if (vcLocalStream) {
        vcLocalStream.getTracks().forEach(t => t.stop());
        vcLocalStream = null;
    }
    // Wake Lock 해제 (+ 비디오 루프 폴백, 보조 오디오, 소리 배너도 함께 정리)
    if (wakeLock) { wakeLock.release(); wakeLock = null; console.log('[wakeLock] 해제됨'); }
    try { stopWakeVideoFallback(); } catch(_) {}
    try { document.querySelectorAll('audio[id^="vc-aud-"]').forEach(a => { a.srcObject = null; a.remove(); }); } catch(_) {}
    try { vcToggleSoundBanner(false); } catch(_) {}
    vcConn = null;
    window.vcConn = null;
    try { window.vcStopPdfPoll && window.vcStopPdfPoll(); window._vcShownPdfKey = ''; window._vcShownPdfUrl = ''; } catch(_){}  // fix (2026-06-02) 폴링 중지+표시상태 초기화
    // ── fix v28 (2026-05-27) — ✕ 버튼 → 홈 강제 이동 안전망 ──
    try {
        const cm = document.getElementById('vc-chat-messages');
        if (cm) cm.innerHTML = '';
    } catch(e){ console.warn('[vcLeaveRoom] chat clear:', e); }
    document.body.classList.remove('vc-in-call');
    try { vcHideReconnecting(); } catch(_) {}   // 통화 종료 시 재연결 배너 정리

    // 관찰자 모드 해제 시 UI 복원
    if (vcIsObserver) {
        vcIsObserver = false;
        window._vcObserverMode = false;
        const localBox = document.getElementById('vc-local-box');
        if (localBox) localBox.style.display = '';
        const toolbar = document.getElementById('vc-bottom-toolbar');
        if (toolbar) toolbar.style.display = '';
    }

    // 1차 — SPA view 전환 시도
    try { showView('view-home'); } catch(e){ console.warn('[vcLeaveRoom] showView fail:', e); }

    // 🚀 수업 종료 → 다음 활동(복습퀴즈 추천) 메뉴 — 홈 전환이 정착된 뒤 표시
    //   (교사는 위 AI 코칭 카드가 뜨므로 학생용 흐름 메뉴는 생략)
    var _flowIsTeacher = (typeof vcIsTeacherRole === 'function') ? vcIsTeacherRole()
        : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
    if (!/[?&](room|r)=/.test(location.search) && !_flowIsTeacher) {
        setTimeout(function(){ try { window.MangoFlow && MangoFlow.open('class'); } catch(_){} }, 700);
    }

    // 2차 — 0.4초 뒤에도 홈 화면이 안 보이면 강제로 홈 URL 로 이동
    setTimeout(() => {
        try {
            const stillInCall = document.body.classList.contains('vc-in-call');
            const viewHome = document.getElementById('view-home');
            const homeVisible = !!(viewHome && viewHome.classList.contains('active') && viewHome.offsetParent !== null);
            const hasRoomParam = /[?&](room|r)=/.test(location.search);
            if (stillInCall || !homeVisible || hasRoomParam) {
                console.warn('[vcLeaveRoom] SPA 전환 실패 감지 — 홈으로 강제 이동');
                location.href = '/';
            }
        } catch(e) {
            console.warn('[vcLeaveRoom] 안전망 오류 — 강제 이동:', e);
            try { location.href = '/'; } catch(_){}
        }
    }, 400);
}

async function vcToggleMic() {
    // 🔇 선생님이 전체 음소거를 켠 동안 학생은 마이크를 다시 켤 수 없음
    if (window.__vcMicLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
        try { if (typeof showToast === 'function') showToast((localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en' ? '🔇 Teacher muted everyone' : '🔇 선생님이 전체 음소거를 켰어요'); } catch(_){}
        return;
    }
    if (!vcLocalStream) {
        alert('수업 입장 후에 마이크를 사용할 수 있습니다.');
        return;
    }
    let audioTracks = vcLocalStream.getAudioTracks();

    // 🎤 오디오 트랙이 없으면 재획득 시도
    if (audioTracks.length === 0) {
        console.warn('[mic] 오디오 트랙 없음 — 재획득 시도');
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            const newTrack = audioStream.getAudioTracks()[0];
            if (newTrack) {
                vcLocalStream.addTrack(newTrack);
                audioTracks = [newTrack];
                // 모든 PeerConnection에 오디오 senders 추가/교체
                if (typeof vcPeerConnections === 'object') {
                    Object.values(vcPeerConnections).forEach(pc => {
                        try {
                            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                            if (sender) sender.replaceTrack(newTrack);
                            else pc.addTrack(newTrack, vcLocalStream);
                        } catch (e) { console.warn('[mic] PC 오디오 추가 실패:', e); }
                    });
                }
                console.log('[mic] ✅ 마이크 재획득 완료');
                vcMicOn = true; window.vcMicOn = true; // 처음 켜진 상태로 (독 표시도 함께 맞춤)
            }
        } catch (e) {
            const reason = (e && e.name === 'NotAllowedError') ? '브라우저에서 마이크 권한이 차단되었습니다. 주소창 좌측 자물쇠 아이콘 → 마이크 → 허용으로 변경 후 재시도해 주세요.' :
                          (e && e.name === 'NotFoundError') ? '연결된 마이크 장치를 찾을 수 없습니다. 마이크가 PC에 제대로 연결되어 있는지 확인해 주세요.' :
                          '마이크 접근 실패: ' + (e && e.message || e);
            alert('🎤 ' + reason);
            return;
        }
    }

    // 토글
    vcMicOn = !vcMicOn;
    // ⚠️ (2026-07-24) `let vcMicOn` 은 window 프로퍼티를 만들지 않는다. 그래서 하단 독의 sync()가
    //   보는 window.vcMicOn 이 계속 undefined 였고, 마이크를 꺼도 독 버튼이 빨갛게 변하지 않았다.
    //   → 사용자는 "안 눌렸나?" 하고 계속 다시 누르게 되고, 그때마다 재렌더가 겹쳐 화면이 깜빡였다.
    window.vcMicOn = vcMicOn;
    audioTracks.forEach(t => t.enabled = vcMicOn);
    const btn = document.getElementById('vc-btn-mic');
    if (btn) {
        btn.className = `ctrl-btn ${vcMicOn ? 'on' : 'off'}`;
        btn.textContent = vcMicOn ? '🎤' : '🔇';
    }
    // 레벨 미터 시작/중지
    if (vcMicOn) startMicLevelMeter();
    else stopMicLevelMeter();
}

function vcSavedMicId(){ try { return localStorage.getItem(VC_MIC_PREF_KEY) || ''; } catch(e){ return ''; } }

async function vcPopulateMicSelect() {
    const sel = document.getElementById('vc-mic-select');
    if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'communications');
        let activeId = '';
        try {
            const at = (window.vcLocalStream && vcLocalStream.getAudioTracks) ? vcLocalStream.getAudioTracks()[0] : null;
            if (at && at.getSettings) activeId = at.getSettings().deviceId || '';
        } catch(e){}
        const saved = vcSavedMicId();
        if (!mics.length) { sel.innerHTML = '<option value="">마이크 없음</option>'; return; }
        sel.innerHTML = '';
        mics.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            let label = d.label || ('마이크 ' + (i+1));
            label = label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/i, '').trim();
            opt.textContent = '🎙 ' + label;
            if (d.deviceId === activeId || (!activeId && d.deviceId === saved)) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch (e) { console.warn('[mic-select] 목록 조회 실패:', e); }
}

async function vcSwitchMic(deviceId) {
    if (!deviceId) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) throw new Error('오디오 트랙 없음');
        newTrack.enabled = (typeof vcMicOn === 'undefined') ? true : vcMicOn;
        if (!window.vcLocalStream) vcLocalStream = new MediaStream();
        vcLocalStream.getAudioTracks().forEach(old => { try { old.stop(); } catch(e){} try { vcLocalStream.removeTrack(old); } catch(e){} });
        vcLocalStream.addTrack(newTrack);
        if (typeof vcPeerConnections === 'object' && vcPeerConnections) {
            Object.values(vcPeerConnections).forEach(pc => {
                try {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (sender) sender.replaceTrack(newTrack);
                    else pc.addTrack(newTrack, vcLocalStream);
                } catch(e) { console.warn('[mic-switch] sender 교체 실패:', e); }
            });
        }
        try { localStorage.setItem(VC_MIC_PREF_KEY, deviceId); } catch(e){}
        try { stopMicLevelMeter(); } catch(e){}
        if (typeof vcMicOn === 'undefined' || vcMicOn) { try { startMicLevelMeter(); } catch(e){} }
        await vcPopulateMicSelect();
        console.log('[mic-switch] ✅ 마이크 전환 완료:', newTrack.label);
        return true;    // 🎛 (2026-08-10) 장치 도우미(원격 설정)가 결과를 강사에게 보고할 때 쓴다
    } catch (e) {
        console.error('[mic-switch] 실패:', e);
        const msg = (e && e.name === 'NotAllowedError') ? '브라우저 마이크 권한이 차단되어 있습니다.' :
                    (e && e.name === 'NotFoundError') ? '선택한 마이크를 찾을 수 없습니다.' :
                    '마이크 전환 실패: ' + (e && e.message || e);
        alert('🎙 ' + msg);
        try { await vcPopulateMicSelect(); } catch(e2){}
        return false;
    }
}

window.vcSwitchMic = vcSwitchMic;

window.vcPopulateMicSelect = vcPopulateMicSelect;

function vcSavedCamId(){ try { return localStorage.getItem(VC_CAM_PREF_KEY) || ''; } catch(e){ return ''; } }

window.vcSavedCamId = vcSavedCamId;

window.vcSetMicDevice = function(deviceId){
    if (!deviceId) return;
    return vcSwitchMic(deviceId);
};

window.vcSetCamDevice = async function(deviceId){
    if (!deviceId) return;
    try { localStorage.setItem(VC_CAM_PREF_KEY, deviceId); } catch(e){}
    /* 🖥 화면 공유 중에는 지금 갈아끼우지 않는다 — 지금 송출 중인 트랙은 '화면'이라
       여기서 카메라로 바꾸면 학생 화면에서 공유가 끊긴다. 선택만 저장해 두고 공유가 끝나면 적용된다. */
    if (window.__vcScreenSharing) {
        try { if (typeof showToast === 'function') showToast('📷 화면 공유가 끝나면 새 카메라로 바뀝니다.'); } catch(e){}
        return 'deferred';   // 🎛 장치 도우미: "지금은 못 바꾸고 공유 끝나면 적용" 을 강사에게 그대로 알린다
    }
    const mobile = window.matchMedia('(max-width: 920px)').matches
                   || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const size = mobile
        ? { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 15, max: 20 } }
        : { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 24, max: 30 } };
    let stream = null;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ deviceId: { exact: deviceId } }, size) });
    } catch (e1) {
        /* 해상도 제약이 안 맞는 캠(예: 고정 해상도 USB 캠)은 위 요청이 OverconstrainedError 로 죽는다.
           장치 지정만 남기고 한 번 더 — 여기서 실패해야 진짜 실패다. */
        console.warn('[cam-switch] 제약 완화 재시도:', e1 && e1.name);
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } }); }
        catch (e2) {
            console.error('[cam-switch] 실패:', e2);
            const msg = (e2 && e2.name === 'NotAllowedError') ? '브라우저 카메라 권한이 차단되어 있습니다.'
                      : (e2 && e2.name === 'NotFoundError' || e2 && e2.name === 'OverconstrainedError') ? '선택한 카메라를 찾을 수 없습니다. 케이블을 다시 꽂고 목록을 새로고침해 주세요.'
                      : (e2 && (e2.name === 'NotReadableError' || e2.name === 'TrackStartError')) ? '다른 앱(Zoom·Teams·카메라 앱 등)이 이 카메라를 쓰고 있습니다. 그 앱을 끄고 다시 선택해 주세요.'
                      : '카메라 전환 실패: ' + ((e2 && e2.message) || e2);
            alert('📷 ' + msg);
            return false;
        }
    }
    const newTrack = stream.getVideoTracks()[0];
    if (!newTrack) { alert('📷 선택한 카메라에서 영상 트랙을 얻지 못했습니다.'); return false; }
    newTrack.enabled = (typeof vcCamOn === 'undefined') ? true : !!vcCamOn;   // 카메라 OFF 상태 존중
    if (!vcLocalStream) vcLocalStream = new MediaStream();
    vcLocalStream.getVideoTracks().forEach(old => {
        try { old.stop(); } catch(e){}          // 옛 카메라의 LED·점유를 확실히 반납
        try { vcLocalStream.removeTrack(old); } catch(e){}
    });
    vcLocalStream.addTrack(newTrack);
    // 내 미리보기
    try {
        const lv = document.getElementById('vc-local-video');
        if (lv) { lv.srcObject = vcLocalStream; const p = lv.play(); if (p && p.catch) p.catch(()=>{}); }
    } catch(e){}
    // 모든 피어 sender 교체 — 재협상 없이 상대 화면이 그 자리에서 바뀐다
    Object.values(vcPeerConnections || {}).forEach(pc => {
        try {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(newTrack).catch(()=>{});
            else pc.addTrack(newTrack, vcLocalStream);
        } catch (e) { console.warn('[cam-switch] sender 교체 실패:', e); }
    });
    /* 🎨 가상배경이 켜져 있으면 송출은 합성 캔버스다. 원본 카메라만 바꾸면 캔버스는 죽은 옛 트랙을
       계속 그려 화면이 얼어 버린다 → 같은 모드로 파이프라인을 새 카메라 위에 다시 세운다. */
    try {
        if (typeof vcBg !== 'undefined' && vcBg && vcBg.mode && vcBg.mode !== 'off' && typeof window.vcSetBackground === 'function') {
            const m = vcBg.mode;
            await window.vcSetBackground('off');
            await window.vcSetBackground(m);
        }
    } catch (e) { console.warn('[cam-switch] 가상배경 재적용 실패:', e); }
    try { __vcCamMutedTicks = 0; } catch(e){}   // 자가치유가 교체 직후를 '이상'으로 오인하지 않게
    console.log('[cam-switch] ✅ 카메라 전환 완료:', newTrack.label);
    try { if (typeof showToast === 'function') showToast('📷 ' + (newTrack.label || '카메라') + ' 로 바꿨어요.'); } catch(e){}
    return true;    // 🎛 (2026-08-10) 장치 도우미(원격 설정) 결과 보고용
};

function vcSavedSpkId(){ try { return localStorage.getItem(VC_SPK_PREF_KEY) || ''; } catch(e){ return ''; } }

window.vcSetSpkDevice = async function(deviceId){
    if (!deviceId) return false;
    if (!('setSinkId' in HTMLMediaElement.prototype)) return false;
    try { localStorage.setItem(VC_SPK_PREF_KEY, deviceId); } catch(e){}
    let okAny = false, failAny = false;
    const els = document.querySelectorAll('#vc-video-grid video, audio[id^="vc-aud-"]');
    for (const el of els) {
        if (el.closest && el.closest('#vc-local-box')) continue;   // 내 미리보기는 영구 음소거 — 건드릴 이유 없음
        try { await el.setSinkId(deviceId); okAny = true; }
        catch (e) { failAny = true; console.warn('[spk-switch] setSinkId 실패:', e && e.name); }
    }
    // 타일이 아직 없어도(수업 초반) 저장은 됐고 이후 타일이 물려받으므로 성공으로 친다
    const ok = !failAny || okAny;
    if (ok) console.log('[spk-switch] ✅ 스피커 전환:', deviceId === 'default' ? '기본 장치' : deviceId.slice(0, 8) + '…');
    return ok;
};

function vcApplySavedSink(el){
    try {
        const id = vcSavedSpkId();
        if (!id || !el || typeof el.setSinkId !== 'function') return;
        const p = el.setSinkId(id); if (p && p.catch) p.catch(()=>{});
    } catch(e){}
}

window.vcSetNoiseSuppression = async function(on){
    on = !!on;
    try { localStorage.setItem('mangoi_vc_noise', on ? '1' : '0'); } catch(e){}
    const track = vcLocalStream && vcLocalStream.getAudioTracks ? vcLocalStream.getAudioTracks()[0] : null;
    if (!track) return;
    try {
        await track.applyConstraints({ echoCancellation: true, autoGainControl: true, noiseSuppression: on });
        const s = (track.getSettings && track.getSettings()) || {};
        if (s.noiseSuppression === on) { console.log('[noise] 잡음 제거 →', on); return; }
    } catch (e) { console.warn('[noise] applyConstraints 실패, 재획득으로 적용:', e && e.name); }
    // applyConstraints 를 무시하는 브라우저 대비 — 같은 장치를 새 제약으로 다시 잡아 교체
    try {
        const id = (track.getSettings && track.getSettings().deviceId) || vcSavedMicId();
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: Object.assign({ echoCancellation: true, autoGainControl: true, noiseSuppression: on }, id ? { deviceId: { exact: id } } : {})
        });
        const nt = stream.getAudioTracks()[0];
        if (!nt) return;
        nt.enabled = track.enabled;
        vcLocalStream.getAudioTracks().forEach(old => { try { old.stop(); } catch(e){} try { vcLocalStream.removeTrack(old); } catch(e){} });
        vcLocalStream.addTrack(nt);
        Object.values(vcPeerConnections || {}).forEach(pc => {
            try {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                if (sender) sender.replaceTrack(nt).catch(()=>{});
            } catch(e){}
        });
        console.log('[noise] 재획득으로 적용 →', on);
    } catch (e) { console.warn('[noise] 재획득 실패:', e); }
};

window.vcSetBackgroundBlur = function(on){
    try {
        if (typeof window.vcSetBackground !== 'function') return;
        window.vcSetBackground(on ? 'blur' : 'off');
    } catch (e) { console.warn('[blur]', e); }
};

window.vcDiagnoseMic = async function() {
    let report = '🎤 마이크 진단 보고서\n\n';
    // 1. 권한 상태
    try {
        const perm = await navigator.permissions.query({ name: 'microphone' });
        report += '권한: ' + (perm.state === 'granted' ? '✅ 허용됨' : perm.state === 'denied' ? '❌ 차단됨' : '⏳ 대기중') + '\n';
    } catch { report += '권한: (확인 불가)\n'; }
    // 2. 디바이스 목록
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        report += `\n연결된 마이크: ${mics.length}개\n`;
        mics.forEach((d, i) => report += `  ${i+1}. ${d.label || '(이름 없음)'} ${d.deviceId === 'default' ? '⭐기본' : ''}\n`);
        if (mics.length === 0) {
            report += '❌ 마이크가 시스템에 연결되어 있지 않습니다!\n';
        }
    } catch (e) { report += '디바이스 목록 조회 실패: ' + e.message + '\n'; }
    // 3. 현재 통화 오디오 트랙
    if (vcLocalStream) {
        const at = vcLocalStream.getAudioTracks();
        report += `\n현재 오디오 트랙: ${at.length}개\n`;
        at.forEach((t, i) => report += `  ${i+1}. ${t.label || '(label없음)'} - enabled:${t.enabled} muted:${t.muted} state:${t.readyState}\n`);
    } else {
        report += '\n현재 통화 스트림 없음\n';
    }
    // 4. 자동 복구 시도
    report += '\n[자동 복구 시도]\n';
    try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
        const t = s.getAudioTracks()[0];
        report += '✅ 마이크 재획득 성공: ' + (t.label || '(label없음)') + '\n';
        if (vcLocalStream) {
            // 기존 오디오 트랙 정리
            vcLocalStream.getAudioTracks().forEach(old => { try { old.stop(); } catch{}; vcLocalStream.removeTrack(old); });
            vcLocalStream.addTrack(t);
            // PC sender 교체
            if (typeof vcPeerConnections === 'object') {
                Object.values(vcPeerConnections).forEach(pc => {
                    try {
                        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                        if (sender) sender.replaceTrack(t);
                        else pc.addTrack(t, vcLocalStream);
                    } catch {}
                });
            }
            vcMicOn = true;
            window.vcMicOn = true;   // 🔴 (2026-07-24 재점검) 이걸 빼먹으면 상단 툴바는 초록인데
                                     //   하단 독은 빨간 채로 굳는다(독의 아이콘 캐시가 그 상태를 고착시킴).
            const btn = document.getElementById('vc-btn-mic');
            if (btn) { btn.className = 'ctrl-btn on'; btn.textContent = '🎤'; }
            startMicLevelMeter();
            report += '✅ 통화에 새 마이크 트랙 적용 완료\n';
        } else {
            try { s.getTracks().forEach(x => x.stop()); } catch{}
        }
    } catch (e) {
        report += '❌ 재획득 실패: ' + e.name + ' - ' + e.message + '\n';
        if (e.name === 'NotAllowedError') {
            report += '\n👉 해결 방법:\n';
            report += '1. 주소창 좌측 자물쇠/방패 아이콘 클릭\n';
            report += '2. "마이크" 권한을 [허용]으로 변경\n';
            report += '3. 페이지 새로고침\n';
        } else if (e.name === 'NotFoundError') {
            report += '\n👉 PC에 마이크가 연결되어 있는지 확인하고 다시 시도해 주세요.\n';
        }
    }
    alert(report);
};

function vcBroadcastCamState(camOn, reason) {
    try {
        if (window.vcConn && typeof vcConn.send === 'function') {
            // ⚠️ 서버(video-call-room.ts)는 data 를 손대지 않고 그대로 중계한다.
            //   보내는 쪽이 자기 userId 를 실어 주지 않으면 받는 쪽이 '누가 껐는지' 를 알 수 없다.
            vcConn.send({ type: 'cam-state', data: { userId: vcUserId, camOn: !!camOn, reason: reason || 'user' } });
        }
    } catch (_) {}
}

function vcToggleCam() {
    if (!vcLocalStream) return;
    vcCamOn = !vcCamOn;
    window.vcCamOn = vcCamOn;   // ⚠️ 독 sync() 가 보는 값 — 위 vcToggleMic 주석 참고 (2026-07-24)
    vcLocalStream.getVideoTracks().forEach(t => t.enabled = vcCamOn);
    const btn = document.getElementById('vc-btn-cam');
    btn.className = `ctrl-btn ${vcCamOn ? 'on' : 'off'}`;
    btn.textContent = vcCamOn ? '📷' : '🚫';
    vcBroadcastCamState(vcCamOn, 'user');
}

function vcSwitchTab(tabName, evt) {
    // 🔴 (2026-07-31) 게임 탭을 벗어날 때 게임 iframe 을 실제로 해제한다.
    //   이 함수는 .active 클래스만 토글하므로, 게임을 켠 채 교재/칠판 탭으로 가면 화면에서만
    //   사라지고 iframe 은 DOM 에 그대로 남았다. 3D 게임(탱크대전·3D배틀·P-38)은 WebGL 컨텍스트와
    //   AudioContext 를 잡고 있어 숨겨진 뒤에도 그 자원을 계속 점유한다(게임을 여러 번 바꿨다면 누적).
    //   → 탭을 떠나면 src 를 비우고 제거해 자원을 확실히 반납한다. 게임 탭으로 돌아오면
    //     gameInit()/gameSwitchMode() 가 #game-area 를 다시 그리므로 복구는 기존 경로로 이뤄진다.
    if (tabName !== 'game') {
        try {
            const gf = document.getElementById('game-suite-frame');
            if (gf) {
                try { gf.src = 'about:blank'; } catch (_) {}   // 내부 문서 먼저 정리 → WebGL/오디오 반납
                gf.remove();
                const ga = document.getElementById('game-area');
                if (ga) ga.dataset.needsRestore = '1';          // 돌아왔을 때 다시 그려야 함을 표시
            }
        } catch (_) {}
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`tab-${tabName}`);
    if (panel) panel.classList.add('active');
    // 게임 탭으로 (다시) 들어왔고 위에서 해제한 상태면 현재 모드로 복구
    if (tabName === 'game') {
        try {
            const ga = document.getElementById('game-area');
            if (ga && ga.dataset.needsRestore === '1') {
                delete ga.dataset.needsRestore;
                if (typeof _gameIsClassActive === 'function' && _gameIsClassActive()) {
                    if (typeof _gameRenderBlocked === 'function') _gameRenderBlocked();
                } else if (typeof gameNextRound === 'function') {
                    gameNextRound();
                }
            }
        } catch (_) {}
    }
    // 클릭 이벤트가 있으면 그 버튼을, 없으면 onclick 속성 매칭으로 active 처리
    const e = evt || (typeof event !== 'undefined' ? event : null);
    if (e && e.target && e.target.classList && e.target.classList.contains('tab-btn')) {
        e.target.classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn').forEach(b => {
            if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${tabName}'`)) b.classList.add('active');
        });
    }
    if (tabName === 'whiteboard') wbResize();
    // 🔒 배경 탭 진입 시 잠금 UI 갱신 — 강사는 잠금 버튼 노출, 학생은 잠금 중이면
    //   (얼굴꾸미기 그리드가 이 진입 때 늦게 생성되므로) 타일 비활성화를 재적용
    if (tabName === 'bg') {
        setTimeout(function(){
            try {
                if (typeof vcPerfRender === 'function') vcPerfRender();   // 🎚️ 품질 버튼 상태 반영
                if (typeof vcBgLockBtnRender === 'function') vcBgLockBtnRender();
                var _staff = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
                if (!_staff && window.__vcBgLockedByTeacher && typeof vcBgLockApply === 'function') vcBgLockApply(true);
            } catch(e){}
        }, 0);
    }
    // 🥭 Phase 41 — 게임 탭 진입 시 자동 시작
    if (tabName === 'game' && typeof gameInit === 'function') {
      if (!_gameState.started) gameInit();
    }
    // 🧠 복습퀴즈일 때는 얼굴(비디오) 영역을 숨기고 퀴즈가 화면 전체를 차지하게
    const _mainRow = document.getElementById('vc-main-row');
    if (_mainRow) _mainRow.classList.toggle('content-full', tabName === 'review-quiz');
    // 어떤 화면 크기·레이아웃에서도 확실히 숨기도록 상단 영상 패널에 인라인 강제 적용
    try {
      var _vp = document.getElementById('vc-video-pane');
      if (_vp) {
        if (tabName === 'review-quiz') _vp.style.setProperty('display', 'none', 'important');
        else _vp.style.removeProperty('display');
      }
    } catch(e){}
    // 🧠 복습퀴즈 탭 진입 시 자동 로드 (이 수업 교재/레벨/레슨 매칭)
    if (tabName === 'review-quiz' && typeof rqvOnEnter === 'function') rqvOnEnter();
    // 🗣️ AI 웜업 탭 — 첫 진입 시에만 iframe 로드 (수업방 room id + 오늘 교재/레벨/레슨 연동)
    // 🧑‍🎓 (2026-08-12 Melca 피드백) 수업 중 «학생 단독» 웜업은 게임과 같은 정책으로 차단.
    //   강사가 tab-sync 로 열어 준 «강사 주도 웜업» 은 허용(웜업은 수업 중 강사 도구이기도 하다).
    //   강사가 다른 탭으로 옮기면 허가도 끝난다(tab-sync 수신부가 __vcWarmupTeacherLed 갱신).
    if (tabName === 'warmup' && typeof _warmupStudentBlocked === 'function' && _warmupStudentBlocked()) {
        _warmupRenderBlocked();
    } else if (tabName === 'warmup') {
        if (typeof _warmupClearBlocked === 'function') _warmupClearBlocked();
        const wf = document.getElementById('vc-warmup-frame');
        if (wf && !wf.getAttribute('src')) {
            const wp = new URLSearchParams();
            try { if (vcRoomId) wp.set('room', vcRoomId); } catch(e){}
            try { const bk = window.__mangoiCurrentBookId || window.__mangoiLastVideoBook || ''; if (bk) wp.set('textbook', String(bk)); } catch(e){}
            try { const lv = localStorage.getItem('mangoi_current_level') || ''; if (lv) wp.set('level', lv); } catch(e){}
            try { const ln = parseInt(localStorage.getItem('mangoi_current_lesson')||'0',10); if (ln) wp.set('lesson', String(ln)); } catch(e){}
            const wq = wp.toString();
            wf.src = '/warmup.html' + (wq ? '?' + wq : '');
        }
    }
    // 📡 (2026-07-14) 교사 주도 탭 동기화 — 교사가 탭(칠판/동영상/교재 등)을 바꾸면
    //   학생 화면도 같은 탭으로 따라오게 방송. (예전엔 탭 전환 메시지 자체가 없어서
    //   교재/동영상 '내용 공유' 때만 학생이 따라오고, 맨몸 탭 전환은 학생에게 안 보였음)
    //   _vcTabSyncApplying = 학생이 수신 적용 중일 때 재방송(루프) 방지 플래그.
    try {
        if (!window._vcTabSyncApplying
            && (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin')
            && document.body.classList.contains('vc-in-call')
            && typeof vcConn !== 'undefined' && vcConn) {
            vcConn.send({ type: 'tab-sync', data: { tab: tabName } });
            console.log('[tab-sync] 교사 탭 방송:', tabName);
        }
    } catch(e){}
}

window.vcIsContentCollapsed = function(){
    var pane = document.getElementById('vc-content-pane');
    return !!(pane && pane.classList.contains('vc-content-collapsed'));
};

window.vcSetContentCollapsed = function(collapsed){
    var pane = document.getElementById('vc-content-pane');
    var row = document.getElementById('vc-main-row');
    if (pane) pane.classList.toggle('vc-content-collapsed', collapsed);
    if (row) row.classList.toggle('vc-content-hidden', collapsed);
    // 🔧 (2026-07-16) 수업 화면으로 접을 때(=콘텐츠 숨김)는 복습퀴즈 전체화면이 얼굴(영상) 영역을
    //   숨겨둔 흔적(content-full 클래스 + #vc-video-pane 인라인 display:none)을 반드시 원복한다.
    //   안 하면 콘텐츠(퀴즈)도 숨고 얼굴도 숨어 화면이 하얗게 나온다.
    if (collapsed) {
        if (row) row.classList.remove('content-full');
        try { var _vp = document.getElementById('vc-video-pane'); if (_vp) _vp.style.removeProperty('display'); } catch(e){}
    }
};

window.vcReviewQuizBackToClass = function(){
    var row = document.getElementById('vc-main-row');
    if (row) row.classList.remove('content-full');
    try { var _vp = document.getElementById('vc-video-pane'); if (_vp) _vp.style.removeProperty('display'); } catch(e){}
    var prev = window._vcTabBeforeReviewQuiz;
    if (prev && prev !== 'review-quiz' && document.getElementById('tab-' + prev)) {
        vcSetContentCollapsed(false);
        vcSwitchTab(prev);              // 얼굴 + 이전 콘텐츠(교재 등) 분할로 복귀
    } else {
        vcSetContentCollapsed(true);    // 이전 콘텐츠 없음 → 얼굴 위주 (video-pane 원복은 위에서 보장)
        try { document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); }); } catch(e){}
    }
};

window.vcToggleContentTab = function(tabName){
    // 🎯 집중 모드 — 선생님이 잠근 동안 학생은 탭 변경/접기 불가.
    //   (교사 tab-sync 수신·pdf/video 공유 적용은 vcSwitchTab 직행이라 막히지 않음)
    if (window.__vcFocusLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
        try { if (typeof showToast === 'function') showToast((localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en' ? '🎯 Focus mode — follow your teacher' : '🎯 집중 모드예요 — 선생님 화면을 따라가요'); } catch(_){}
        return;
    }
    // 🔧 (2026-07-16) 복습퀴즈로 들어갈 때, 지금 보고 있던 콘텐츠 탭(교재/칠판 등)을 기억한다.
    //   '← 수업으로' 복귀 시 그 콘텐츠를 얼굴과 함께 되살리기 위함. (콘텐츠가 접혀 있었으면 기억 안 함)
    if (tabName === 'review-quiz') {
        try {
            var _cur = document.querySelector('.tab-panel.active');
            var _curId = _cur && _cur.id ? _cur.id.replace('tab-', '') : '';
            window._vcTabBeforeReviewQuiz = (_curId && _curId !== 'review-quiz' && !vcIsContentCollapsed()) ? _curId : '';
        } catch(e){ window._vcTabBeforeReviewQuiz = ''; }
    }
    var panel = document.getElementById('tab-' + tabName);
    var alreadyShowing = panel && panel.classList.contains('active') && !vcIsContentCollapsed();
    // 📖 (2026-08-20) 교재도 칠판처럼 다시 눌러도 안 접는다
    if (alreadyShowing && tabName !== 'whiteboard' && tabName !== 'pdf') {
        vcSetContentCollapsed(true);
    } else {
        vcSetContentCollapsed(false);
        vcSwitchTab(tabName);
    }
};

function vcIsMobileDevice(){
  if (vcBg._mobile === undefined) {
    vcBg._mobile = window.matchMedia('(max-width: 920px)').matches
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }
  return vcBg._mobile;
}

window.vcPerf = (function(){
  var KEY = 'mangoi_vc_perf';           // {level:int, manual:bool}
  // segEvery : 세그멘테이션 처리 간격(프레임) — 배경 경계는 몸 움직임을 따라가야 해 20Hz 근처 유지
  // faceEvery: 얼굴검출 간격(프레임) — 얼굴은 천천히 움직여 8Hz 로도 충분(매 프레임 보간이 메움)
  var TIERS = [
    { name:'상',   segEvery:3, faceEvery:7,  width:640, fps:20, erosion:4, feather:true  },
    { name:'중',   segEvery:4, faceEvery:8,  width:512, fps:15, erosion:2, feather:true  },
    { name:'하',   segEvery:6, faceEvery:10, width:400, fps:12, erosion:0, feather:false },
    { name:'최하', segEvery:8, faceEvery:12, width:320, fps:10, erosion:0, feather:false }
  ];
  var st = { level:0, manual:false };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw.level === 'number') { st.level = Math.min(TIERS.length-1, Math.max(0, raw.level)); st.manual = !!raw.manual; }
    else if (vcIsMobileDevice()) st.level = 2;      // 휴대폰은 중간부터 시작(첫 인상 보호)
  } catch(e){}
  function save(){ try { localStorage.setItem(KEY, JSON.stringify({level:st.level, manual:st.manual})); } catch(e){} }

  // ── 측정: 우리 작업이 프레임 예산을 얼마나 먹는지 + 루프가 실제 몇 fps 도는지
  var busyMs = 0, frames = 0, winStart = 0, badRun = 0, goodRun = 0, lastChange = 0, deadRun = 0;
  function now(){ return performance.now(); }
  function evaluate(){
    var t = now(), span = t - winStart;
    if (span < 2000) return;
    var ratio = busyMs / span;                 // 0~1, 우리 작업 점유율
    var fps   = frames / (span/1000);
    busyMs = 0; frames = 0; winStart = t;
    api.lastRatio = +ratio.toFixed(2); api.lastFps = Math.round(fps);
    // 치명: 루프가 10fps 미만 → 수업 자체가 위험. 등급과 무관하게 가상배경을 끈다.
    if (fps > 0 && fps < 10) { deadRun++; if (deadRun >= 3) { deadRun = 0; api._rescue(); return; } }
    else deadRun = 0;
    if (st.manual) return;                     // 사람이 직접 고른 등급은 건드리지 않는다
    if (t - lastChange < 6000) return;          // 6초 내 재조정 금지(요동 방지)
    if (ratio > 0.55 || (fps > 0 && fps < 22)) { badRun++; goodRun = 0; }
    else if (ratio < 0.25 && fps > 45)         { goodRun++; badRun = 0; }
    else { badRun = 0; goodRun = 0; }
    if (badRun >= 2 && st.level < TIERS.length-1) { st.level++; badRun = 0; lastChange = t; save(); api._notify('down'); }
    else if (goodRun >= 3 && st.level > 0)       { st.level--; goodRun = 0; lastChange = t; save(); api._notify('up'); }
  }
  var api = {
    tiers: TIERS,
    lastRatio: 0, lastFps: 0,
    get level(){ return st.level; },
    get manual(){ return st.manual; },
    get: function(){ return TIERS[st.level] || TIERS[0]; },
    /** 무거운 블록 앞뒤로 감싸 호출: var s=vcPerf.begin(); ... vcPerf.end(s); */
    begin: function(){ if (!winStart) winStart = now(); return now(); },
    end: function(t0){ busyMs += (now() - t0); },
    /** 루프 1회마다 호출 — 실제 프레임레이트 측정 */
    tick: function(){ if (!winStart) winStart = now(); frames++; evaluate(); },
    /** 강사가 직접 고름(0~3). null 이면 자동으로 복귀 */
    set: function(lv){
      if (lv === null || lv === undefined) {
        // '자동'으로 되돌릴 때는 기기 기본값에서 다시 찾게 한다.
        //   (등급을 그대로 두면 '최하'를 골랐던 강사가 자동으로 바꿔도 계속 최하에 머문다 —
        //    평가는 효과가 돌아갈 때만 일어나므로 스스로 올라오는 데 오래 걸린다)
        st.manual = false;
        st.level = vcIsMobileDevice() ? 2 : 0;
        badRun = 0; goodRun = 0; deadRun = 0;
      }
      else { st.level = Math.min(TIERS.length-1, Math.max(0, lv|0)); st.manual = true; }
      lastChange = now(); save(); api._apply();
      api._toast(st.manual ? ('영상효과 품질: ' + TIERS[st.level].name + ' (직접 선택)')
                           : '영상효과 품질: 자동');
    },
    /** 등급 변경을 실제 파이프라인에 반영 — 캔버스 크기·송출 fps 는 재시작이 필요하다 */
    _apply: function(){
      try { if (typeof vcBgApplyTier === 'function') vcBgApplyTier(); } catch(e){}
      try { if (window.vcFx && typeof window.vcFx._applyTier === 'function') window.vcFx._applyTier(); } catch(e){}
    },
    _notify: function(dir){
      api._apply();
      var t = TIERS[st.level];
      api._toast(dir === 'down'
        ? ('이 컴퓨터에 맞춰 영상효과를 가볍게 조정했어요 (' + t.name + ')')
        : ('여유가 생겨 영상효과 품질을 올렸어요 (' + t.name + ')'));
    },
    /** 치명 상황: 수업을 지키기 위해 가상배경만 끈다(얼굴꾸미기는 남긴다) */
    _rescue: function(){
      try {
        if (typeof vcBg !== 'undefined' && vcBg && vcBg.mode && vcBg.mode !== 'off') {
          if (typeof vcSetBg === 'function') vcSetBg('off');
          else { vcBg.mode = 'off'; vcBg.isProcessing = false; }
          api._toast('컴퓨터가 많이 느려져 가상배경을 잠시 껐어요. 얼굴 꾸미기는 그대로 쓸 수 있어요.');
          return;
        }
      } catch(e){}
      st.level = TIERS.length-1; save(); api._apply();
    },
    _toast: function(msg){
      try {
        if (typeof vcToast === 'function') { vcToast(msg); return; }
        var el = document.getElementById('vc-perf-toast');
        if (!el) {
          el = document.createElement('div'); el.id = 'vc-perf-toast';
          el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:2147483001;'
            + 'background:rgba(15,23,42,.94);color:#e2e8f0;border:1px solid rgba(148,163,184,.35);'
            + 'border-radius:12px;padding:10px 16px;font-size:13px;font-weight:600;max-width:80vw;'
            + 'text-align:center;pointer-events:none;opacity:0;transition:opacity .25s';
          document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        clearTimeout(el._h); el._h = setTimeout(function(){ el.style.opacity = '0'; }, 3800);
      } catch(e){}
    }
  };
  return api;
})();

function vcPerfRender(){
  var wrap = document.getElementById('vc-perf-btns');
  if (!wrap || !window.vcPerf) return;
  var en = (typeof getLang === 'function' && getLang() === 'en');
  var LBL_EN = ['High','Medium','Low','Lowest'];
  var items = [{ lv:null, label: en ? 'Auto' : '자동' }];
  vcPerf.tiers.forEach(function(t, i){ items.push({ lv:i, label: en ? LBL_EN[i] : t.name }); });
  var cur = vcPerf.manual ? vcPerf.level : null;
  wrap.innerHTML = items.map(function(it){
    var on = (it.lv === cur);
    return '<button type="button" onclick="vcPerfPick(' + (it.lv === null ? 'null' : it.lv) + ')" '
      + 'style="border:1px solid ' + (on ? '#fbbf24' : 'rgba(148,163,184,.35)') + ';border-radius:7px;'
      + 'padding:4px 11px;font-size:11.5px;font-weight:700;cursor:pointer;'
      + 'background:' + (on ? 'rgba(251,191,36,.2)' : 'transparent') + ';'
      + 'color:' + (on ? '#fbbf24' : '#94a3b8') + '">' + it.label + '</button>';
  }).join('');
  var hint = document.getElementById('vc-perf-hint');
  if (hint) {
    if (vcPerf.manual) {
      hint.textContent = en ? ('Fixed at "' + LBL_EN[vcPerf.level] + '" on this computer')
                            : ('이 컴퓨터에서 ‘' + vcPerf.tiers[vcPerf.level].name + '’ 로 고정');
    } else {
      hint.textContent = en ? ('Auto (now: ' + LBL_EN[vcPerf.level] + ') — lowers itself when this computer struggles')
                            : ('자동 (현재 ' + vcPerf.tiers[vcPerf.level].name + ') — 버거워지면 알아서 낮춥니다');
    }
  }
}

function vcPerfPick(lv){ try { vcPerf.set(lv); vcPerfRender(); } catch(e){} }

window.vcPerfRender = vcPerfRender; window.vcPerfPick = vcPerfPick;

function vcBgTargetWidth(){
  var w = (window.vcPerf ? vcPerf.get().width : 640);
  return vcIsMobileDevice() ? Math.min(480, w) : w;
}

function vcBgCaptureFps(){
  var f = (window.vcPerf ? vcPerf.get().fps : 20);
  return vcIsMobileDevice() ? Math.min(12, f) : f;
}

function vcBgApplyTier(){
  try {
    if (!vcBg || !vcBg.canvas || !vcBg.hiddenVideo || !vcBg.hiddenVideo.videoWidth) return;
    var vw = vcBg.hiddenVideo.videoWidth, vh = vcBg.hiddenVideo.videoHeight;
    var cw = Math.min(vw, vcBgTargetWidth()), ch = Math.round(cw * vh / vw);
    if (vcBg.canvas.width !== cw) {
      vcBg.canvas.width = cw; vcBg.canvas.height = ch;
      if (vcBg.maskCanvas) { vcBg.maskCanvas.width = cw; vcBg.maskCanvas.height = ch; }
    }
  } catch(e){}
}

function vcLoadBgImage(theme){
  // 이미 로드된 캐시 반환
  if (_vcBgCache[theme] && _vcBgCache[theme].complete && _vcBgCache[theme].naturalWidth > 0) {
    return Promise.resolve(_vcBgCache[theme]);
  }
  const url = VC_BG_IMAGES[theme];
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // canvas 사용을 위해 (동일 origin이라 사실상 무관)
    img.onload = () => { _vcBgCache[theme] = img; resolve(img); };
    img.onerror = (e) => { console.warn('[vc-bg] 이미지 로드 실패:', url, e); resolve(null); };
    img.src = url;
  });
}

function vcGetBgImageSync(theme){
  return _vcBgCache[theme] || null;
}

function vcLoadMediaPipe(){
  if (vcBg.mpLoaded) return Promise.resolve();
  if (vcBg.mpLoading) return vcBg.mpLoading;
  const inject = (base, crossOrigin) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = base + 'selfie_segmentation.js';
    if (crossOrigin) s.crossOrigin = 'anonymous';
    s.onload  = () => { vcBg.mpBase = base; vcBg.mpLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('MediaPipe 로드 실패: ' + base));
    document.head.appendChild(s);
  });
  vcBg.mpLoading = inject(VC_MP_LOCAL, false).catch(() => {
    console.warn('[ph163] 로컬 MediaPipe 실패 → CDN 폴백');
    return inject(VC_MP_CDN, true);
  }).catch(() => {
    throw new Error('MediaPipe 로드 실패. 네트워크 확인 후 다시 시도해 주세요.');
  });
  return vcBg.mpLoading;
}

async function vcInitBgEngine(){
  if (vcBg.segmenter) return;
  if (typeof SelfieSegmentation === 'undefined') throw new Error('MediaPipe 로드 안됨');
  vcBg.segmenter = new SelfieSegmentation({
    // ph163 — 스크립트를 실제로 받아온 곳(vcBg.mpBase)에서 wasm·tflite 도 받는다.
    //   로컬에서 받았으면 로컬, CDN 폴백이었으면 CDN. 둘을 섞으면 버전이 어긋난다.
    locateFile: (f) => (vcBg.mpBase || VC_MP_LOCAL) + f
  });
  // Phase 7m: 가장자리 품질 우선 - modelSelection 0 (general, 256x256, 정밀한 edge)
  //   ↳ 멈춤 방지는 vcBgRenderLoop 의 프레임 throttle (skipNext) 로 해결
  // 🔋 모바일은 경량 landscape 모델(1, 144x256)로 전환해 발열·CPU 절감 → 연결 안정
  vcBg.segmenter.setOptions({ modelSelection: vcIsMobileDevice() ? 1 : 0, selfieMode: false });
  vcBg.segmenter.onResults(vcOnSegResults);
  await vcBg.segmenter.initialize();
  // 합성 캔버스
  if (!vcBg.canvas) {
    vcBg.canvas = document.createElement('canvas');
    vcBg.canvas.width = 1280; vcBg.canvas.height = 720;
    vcBg.ctx = vcBg.canvas.getContext('2d');
  }
  // Phase 7m: 마스크 전용 오프스크린 캔버스 (erosion + feather 처리용)
  if (!vcBg.maskCanvas) {
    vcBg.maskCanvas = document.createElement('canvas');
    vcBg.maskCanvas.width = 1280; vcBg.maskCanvas.height = 720;
    vcBg.maskCtx = vcBg.maskCanvas.getContext('2d');
  }
}

function vcOnSegResults(results){
  const ctx = vcBg.ctx;
  const w = vcBg.canvas.width, h = vcBg.canvas.height;
  const mctx = vcBg.maskCtx;

  // === Step A: 오프스크린에서 마스크 정제 ===
  mctx.save();
  mctx.clearRect(0, 0, w, h);
  // 1) 마스크 원본을 강한 contrast 로 그려서 회색 전이 → 거의 binary
  //    contrast(2.4) 가 alpha 0.3~0.7 의 halo 영역을 0 또는 1 로 강제
  mctx.filter = 'contrast(2.4) brightness(1.08)';
  mctx.drawImage(results.segmentationMask, 0, 0, w, h);
  mctx.filter = 'none';
  // 2) Erosion (마스크 축소) - 같은 마스크를 1px 씩 4방향 shift 한 후 destination-in
  //    겹치는 부분만 살아남아 가장자리가 안쪽으로 1px 잠식됨 → halo 제거
  mctx.globalCompositeOperation = 'destination-in';
  mctx.filter = 'contrast(2.4) brightness(1.08)';
  // 🔋 모바일은 가로 2방향만 erosion (4→2 패스, drawImage 비용 절반) → 발열·끊김 완화
  // (2026-08-01) vcPerf 등급으로 패스 수를 조절 — filter 가 걸린 drawImage 는 프레임당 비용이
  //   가장 큰 항목이라, 낮은 등급에서 4→2→0 으로 줄이는 것이 체감 효과가 크다.
  //   0 패스여도 위의 contrast(2.4) binary 마스크는 그대로라 인물은 정상적으로 잘린다
  //   (머리·어깨 주변 halo 가 조금 남을 뿐 — 멈추는 것보다 낫다).
  var _ero = window.vcPerf ? vcPerf.get().erosion : (vcIsMobileDevice() ? 2 : 4);
  if (_ero >= 2) {
    mctx.drawImage(results.segmentationMask, -1, 0, w, h);
    mctx.drawImage(results.segmentationMask, 1, 0, w, h);
  }
  if (_ero >= 4 && !vcIsMobileDevice()) {
    mctx.drawImage(results.segmentationMask, 0, -1, w, h);
    mctx.drawImage(results.segmentationMask, 0, 1, w, h);
  }
  if (_ero === 0) {
    // 축소 패스를 아예 건너뛸 때는 마스크 자체를 한 번은 그려야 destination-in 이 유효하다
    mctx.drawImage(results.segmentationMask, 0, 0, w, h);
  }
  mctx.filter = 'none';
  mctx.globalCompositeOperation = 'source-over';
  mctx.restore();

  // === Step B: 본 캔버스 합성 ===
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // 1) 정제된 마스크를 약간의 feather 와 함께 그리기 (자연스러운 anti-alias)
  //    (2026-08-01) 낮은 등급에서는 feather 를 끈다 — blur 필터 drawImage 1패스 절약
  var _fea = window.vcPerf ? vcPerf.get().feather : true;
  if (_fea) ctx.filter = 'blur(0.6px)';
  ctx.drawImage(vcBg.maskCanvas, 0, 0, w, h);
  ctx.filter = 'none';

  // 2) 마스크된 영역에 사람 영상 채움 (source-in)
  //    saturate/brightness 미세 보정으로 배경과 톤 조화
  ctx.globalCompositeOperation = 'source-in';
  ctx.filter = 'saturate(1.04) brightness(1.0)';
  ctx.drawImage(results.image, 0, 0, w, h);
  ctx.filter = 'none';

  // 3) 배경 깔기 (destination-over)
  ctx.globalCompositeOperation = 'destination-over';
  if (vcBg.mode === 'blur') {
    ctx.filter = 'blur(14px)';
    ctx.drawImage(results.image, 0, 0, w, h);
    ctx.filter = 'none';
  } else if (vcBg.mode !== 'off') {
    const img = vcGetBgImageSync(vcBg.mode);
    if (img && img.complete && img.naturalWidth > 0) {
      const ir = img.naturalWidth / img.naturalHeight;
      const cr = w / h;
      let sx, sy, sw, sh;
      if (ir > cr) { sh = img.naturalHeight; sw = sh * cr; sx = (img.naturalWidth - sw) / 2; sy = 0; }
      else { sw = img.naturalWidth; sh = sw / cr; sx = 0; sy = (img.naturalHeight - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}

async function vcBgRenderLoop(){
  if (!vcBg.isProcessing) return;
  const v = vcBg.hiddenVideo;
  // Phase 7m: 모델이 무거워진 만큼 3 프레임마다 1번 처리 (CPU 66% 절약 → 멈춤 방지)
  //   ↳ 화상통화에선 20fps 정도면 충분히 자연스러움
  // 🔥 모바일은 발열 절감을 위해 더 드물게 처리 (휴대폰 6프레임당 1회 ≈ 10fps, PC 3프레임당 1회)
  if (vcBg._mobile === undefined) {
    vcBg._mobile = window.matchMedia('(max-width: 920px)').matches
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }
  vcBg.frameTick = (vcBg.frameTick || 0) + 1;
  // (2026-08-01) 고정 3/6 → vcPerf 등급값. 이 루프가 실제 몇 fps 도는지도 여기서 측정한다.
  if (window.vcPerf) vcPerf.tick();
  const _tier = window.vcPerf ? vcPerf.get() : null;
  const _everyN = _tier ? (vcBg._mobile ? Math.max(6, _tier.segEvery) : _tier.segEvery)
                        : (vcBg._mobile ? 6 : 3);
  const shouldProcess = (vcBg.frameTick % _everyN === 0);
  if (shouldProcess && v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0
      && vcBg.segmenter && !vcBg.sending) {
    vcBg.sending = true;
    const _t0 = window.vcPerf ? vcPerf.begin() : 0;   // ⏱ 모델 추론 + 합성(onResults) 시간 측정
    try {
      await vcBg.segmenter.send({ image: v });
      vcBg.frameCount = (vcBg.frameCount || 0) + 1;
    } catch(e) {
      vcBg.errorCount = (vcBg.errorCount || 0) + 1;
      if (vcBg.errorCount < 5) console.warn('[vc-bg] send 실패 (계속 진행):', e && e.message || e);
    } finally {
      if (window.vcPerf) vcPerf.end(_t0);
      vcBg.sending = false;
    }
  }
  vcBg.rafId = requestAnimationFrame(vcBgRenderLoop);
}

async function vcEnsureHiddenVideo(){
  if (!vcBg.hiddenVideo) {
    const hv = document.createElement('video');
    hv.autoplay = true; hv.muted = true; hv.playsInline = true;
    hv.setAttribute('playsinline', '');
    hv.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:320px;height:240px;visibility:hidden;pointer-events:none';
    document.body.appendChild(hv);
    vcBg.hiddenVideo = hv;
  }
  // 항상 최신 vcLocalStream 으로 갱신 (카메라 토글 후에도 안전)
  if (vcBg.hiddenVideo.srcObject !== vcLocalStream) {
    vcBg.hiddenVideo.srcObject = vcLocalStream;
  }
  try { await vcBg.hiddenVideo.play(); } catch(e) {}
  // 비디오 메타데이터 + 첫 프레임 로딩 대기
  if (vcBg.hiddenVideo.videoWidth === 0 || vcBg.hiddenVideo.readyState < 2) {
    await new Promise((resolve) => {
      const ok = () => {
        if (vcBg.hiddenVideo.videoWidth > 0 && vcBg.hiddenVideo.readyState >= 2) {
          vcBg.hiddenVideo.removeEventListener('loadeddata', ok);
          vcBg.hiddenVideo.removeEventListener('canplay', ok);
          resolve();
        }
      };
      vcBg.hiddenVideo.addEventListener('loadeddata', ok);
      vcBg.hiddenVideo.addEventListener('canplay', ok);
      setTimeout(resolve, 2500); // 안전 타임아웃 2.5초
    });
  }
  // 캔버스 사이즈 = 카메라 비율 유지하되 목표 가로폭(PC 640 / 모바일 480)으로 축소
  //   → 720p 그대로 합성/인코딩하던 것 대비 픽셀 수 1/4~1/9 로 줄어 CPU·전력·대역폭 대폭 절감
  if (vcBg.canvas && vcBg.hiddenVideo.videoWidth > 0) {
    const vw = vcBg.hiddenVideo.videoWidth, vh = vcBg.hiddenVideo.videoHeight;
    const target = vcBgTargetWidth();
    const cw = Math.min(vw, target);
    const ch = Math.round(cw * vh / vw);
    vcBg.canvas.width = cw;   vcBg.canvas.height = ch;
    if (vcBg.maskCanvas) { vcBg.maskCanvas.width = cw; vcBg.maskCanvas.height = ch; }
  }
}

function vcSwapVideoTrack(newTrack){
  // 🎭 얼굴 액세서리(vcFx)가 활성화돼 있으면, fx 캔버스가 최종 송신 소스다.
  //   이때 vcBg(가상배경)가 자체적으로 부르는 트랙 교체는 무시 → fx가 sender 를 계속 점유.
  //   (fx 가 vcBg.canvas 를 읽어 합성하므로 배경 변경은 그대로 반영됨)
  if (window.vcFx && window.vcFx.active && !window.__vcFxInternalSwap) return;
  // 가상배경 캔버스 트랙은 카메라 원본보다 인코딩이 무겁다 → 교체 직후 sender 파라미터 재적용
  //   · degradationPreference 'maintain-framerate' : 부하 시 화질·해상도를 먼저 낮춰 끊김(프레임 드랍) 방지 = 실시간성 우선
  //   · maxBitrate / maxFramerate 상한 : 인코더 풀가동 차단 → CPU·전력·대역폭 절감
  const isBgTrack = !!(vcBg.processedStream && newTrack
    && vcBg.processedStream.getVideoTracks()[0] === newTrack);
  const mobile = vcIsMobileDevice();
  // 모든 PeerConnection 의 video sender 교체
  if (typeof vcPeerConnections === 'object' && vcPeerConnections) {
    Object.values(vcPeerConnections).forEach(pc => {
      try {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (!sender) return;
        sender.replaceTrack(newTrack);
        if (sender.getParameters) {
          const params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.encodings[0].maxBitrate   = (mobile ? 500 : 1000) * 1000;
          params.encodings[0].maxFramerate = isBgTrack ? (mobile ? 12 : 20) : (mobile ? 15 : 24);
          /* 🎞 (2026-08-11) 원본 복귀 시에도 프레임 우선으로 통일 — 예전엔 가상배경일 때만
             프레임을 지키고 원본은 'balanced' 라, 배경을 끄는 순간 끊김이 다시 시작됐다. */
          params.degradationPreference = 'maintain-framerate';
          sender.setParameters(params).catch(e => console.warn('[vc-bg] setParameters:', e));
        }
      } catch(e){ console.warn('[vc-bg] replaceTrack 실패:', e); }
    });
  }
}

window.vcBgLockBtnRender = function(){
  var btn = document.getElementById('vc-bg-lock-btn');
  if (!btn) return;
  var staff = _vcBgLockIsStaff() || ((typeof vcIsTeacherRole === 'function') && vcIsTeacherRole());
  btn.style.display = staff ? 'inline-flex' : 'none';
  if (!staff) return;
  var on = !!window.__vcBgLockOn;
  var ko = on ? '🔓 학생 배경 변경 잠금 해제' : '🔒 학생 배경 변경 잠금';
  var en = on ? '🔓 Unlock student backgrounds' : '🔒 Lock student backgrounds';
  btn.setAttribute('data-ko', ko); btn.setAttribute('data-en', en);
  btn.textContent = _vcBgLockEn() ? en : ko;
  btn.style.background = on ? '#dc2626' : '#16a34a';
};

window.vcBgLockToggle = function(){
  window.__vcBgLockOn = !window.__vcBgLockOn;
  window.vcBgLockBtnRender();
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'bg-lock', data: { locked: window.__vcBgLockOn } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__vcBgLockOn
      ? (_vcBgLockEn() ? '🔒 Student background changes locked' : '🔒 학생 배경 변경을 잠갔어요')
      : (_vcBgLockEn() ? '🔓 Student background changes unlocked' : '🔓 학생 배경 변경 잠금을 해제했어요'));
  } catch(_){}
};

window.vcBgLockApply = function(locked){
  locked = !!locked;
  var changed = window.__vcBgLockedByTeacher !== locked;
  window.__vcBgLockedByTeacher = locked;
  document.querySelectorAll('.vc-bg-tile, .vc-fx-tile').forEach(function(b){
    b.disabled = locked;
    b.style.opacity = locked ? '0.4' : '';
    b.style.cursor = locked ? 'not-allowed' : 'pointer';
  });
  var status = document.getElementById('vc-bg-status');
  if (status) status.textContent = locked
    ? (_vcBgLockEn() ? '🔒 Teacher locked background changes' : '🔒 선생님이 배경화면 변경을 잠갔어요')
    : (_vcBgLockEn() ? 'Click any background to apply' : '원하는 배경을 클릭하세요');
  if (changed) { try { if (typeof showToast === 'function') showToast(_vcBgLockMsg(locked)); } catch(_){} }
  // 얼굴꾸미기 진입점(idx-x6.js 의 vcSetFace)도 1회 래핑해 잠금 가드
  if (!window.__vcSetFaceLockWrapped && typeof window.vcSetFace === 'function') {
    var _origSetFace = window.vcSetFace;
    window.vcSetFace = function(){
      if (window.__vcBgLockedByTeacher && !_vcBgLockIsStaff()) {
        try { if (typeof showToast === 'function') showToast(_vcBgLockMsg(true)); } catch(_){}
        return;
      }
      return _origSetFace.apply(this, arguments);
    };
    window.__vcSetFaceLockWrapped = true;
  }
};

window.vcClassLockChipsRender = function(){
  var staff = _vcBgLockIsStaff() || ((typeof vcIsTeacherRole === 'function') && vcIsTeacherRole());
  var en = _vcBgLockEn();
  /* 👥 (2026-08-12 Shas 3번) 「학생 제어」 이름표 — 아래 세 칩이 무엇을 하는 묶음인지 알려 준다.
     칩들과 «똑같은 조건» 으로 켜고 끈다. 따로 두면 학생 화면에 이름표만 남는다. */
  var sctl = document.getElementById('vc-studentctl-label');
  if (sctl) sctl.style.display = staff ? 'inline-flex' : 'none';
  var mic = document.getElementById('vc-miclock-btn');
  if (mic) {
    mic.style.display = staff ? 'inline-flex' : 'none';
    if (staff) {
      var mOn = !!window.__vcMicLockOn;
      var mKo = mOn ? '🔊 전체 음소거 해제' : '🎤 전체 음소거';
      var mEn = mOn ? '🔊 Unmute all' : '🎤 Mute all';
      mic.setAttribute('data-ko', mKo); mic.setAttribute('data-en', mEn);
      mic.textContent = en ? mEn : mKo;
      mic.style.background = mOn ? '#dc2626' : '#16a34a';
    }
  }
  /* 📖 (2026-07-29) 교재 라이브러리 바로가기 — 강사·관리자에게만.
     드롭다운 안에 숨어 있어 "다른 교재를 못 찾겠다"는 제보가 나온 입구를 상단에 노출한다. */
  var lib = document.getElementById('vc-lib-open-btn');
  if (lib) {
    lib.style.display = staff ? 'inline-flex' : 'none';
    if (staff) {
      var lKo = '📖 교재 고르기', lEn = '📖 Choose Textbook';
      lib.setAttribute('data-ko', lKo); lib.setAttribute('data-en', lEn);
      lib.textContent = en ? lEn : lKo;
    }
  }
  /* ✋ (2026-07-28 Kaye 9번) 학생 필기 잠금 버튼도 같은 시점에 함께 갱신 */
  try { if (typeof vcRenderDrawLockChip === 'function') vcRenderDrawLockChip(); } catch(_){}
  /* 🖥 (2026-07-30 Kaye 4번) 내 화면 공유 버튼도 함께 갱신 */
  try { if (typeof vcRenderScreenShareChip === 'function') vcRenderScreenShareChip(); } catch(_){}
  /* 📚 (2026-08-12 Melca 7·8번) 교재도구 바의 강사 전용 버튼도 같은 시점에 함께 —
     역할이 확정되는 모든 경로가 이 함수를 부르므로 여기 한 곳이면 전부 덮인다. */
  try { if (typeof vcRenderTextbookControls === 'function') vcRenderTextbookControls(); } catch(_){}
  /* 🎬 (2026-08-12 Melca) 동영상 툴바의 강사 전용 버튼도 같은 시점에 */
  try { if (typeof vcRenderVideoControls === 'function') vcRenderVideoControls(); } catch(_){}
  var fc = document.getElementById('vc-focuslock-btn');
  if (fc) {
    fc.style.display = staff ? 'inline-flex' : 'none';
    if (staff) {
      var fOn = !!window.__vcFocusLockOn;
      var fKo = fOn ? '🎯 집중 모드 해제' : '🎯 집중 모드';
      var fEn = fOn ? '🎯 End focus mode' : '🎯 Focus mode';
      fc.setAttribute('data-ko', fKo); fc.setAttribute('data-en', fEn);
      fc.textContent = en ? fEn : fKo;
      fc.style.background = fOn ? '#dc2626' : '#16a34a';
    }
  }
};

window.vcMicLockToggle = function(){
  window.__vcMicLockOn = !window.__vcMicLockOn;
  window.vcClassLockChipsRender();
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'mic-lock', data: { locked: window.__vcMicLockOn } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__vcMicLockOn
      ? (_vcBgLockEn() ? '🔇 All students muted' : '🔇 학생 전체 음소거를 켰어요')
      : (_vcBgLockEn() ? '🔊 All students unmuted' : '🔊 전체 음소거를 해제했어요'));
  } catch(_){}
};

window.vcDrawLockToggle = function(){
  window.__pdfStudentDrawLock = !window.__pdfStudentDrawLock;
  try { if (typeof vcRenderDrawLockChip === 'function') vcRenderDrawLockChip(); } catch(_){}
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'pdf-drawlock', data: { on: !!window.__pdfStudentDrawLock } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__pdfStudentDrawLock
      ? (_vcBgLockEn() ? 'Student drawing locked' : '학생 필기를 잠갔어요')
      : (_vcBgLockEn() ? 'Student drawing unlocked' : '학생 필기를 다시 허용했어요'));
  } catch(_){}
};

window.vcRenderDrawLockChip = function(){
  var btn = document.getElementById('vc-drawlock-btn');
  if (!btn) return;
  /* 교사 판정은 옆 칩(전체 음소거)과 같은 방식을 쓴다 — 한쪽만 다르면 한 버튼만 안 보이는 사고가 난다. */
  var isT = false;
  try {
    isT = (typeof _vcBgLockIsStaff === 'function' && _vcBgLockIsStaff())
       || (typeof vcIsTeacherRole === 'function' && vcIsTeacherRole())
       || window.vcMyRole === 'teacher' || window.vcMyRole === 'admin';
  } catch(_) { isT = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'); }
  btn.style.display = isT ? 'inline-flex' : 'none';       // 교사·관리자에게만 보인다
  var on = !!window.__pdfStudentDrawLock;
  var en = (typeof _vcBgLockEn === 'function') ? _vcBgLockEn() : false;
  btn.style.background = on ? '#dc2626' : '#16a34a';
  /* 🌐 라벨을 data-ko/data-en 에도 남긴다 — 언어를 바꾸면 applyLang 이 이 두 벌로 다시 쓴다.
     (없으면 EN 으로 그려진 뒤 KO 로 돌아와도 'Lock drawing' 인 채 굳는다 — 2026-08-08 제보) */
  /* 🌐 (2026-08-10) 라벨을 «상태» 가 아니라 «누르면 일어나는 일» 로 바꾼다.
     초록 「학생 필기 허용」은 상태 표시로 읽혀, 강사들이 기능이 없는 줄 알았다. */
  var _dKo = on ? '🔒 필기 잠김 — 풀기' : '✋ 학생 필기 잠그기';
  var _dEn = on ? '🔒 Locked — unlock' : '✋ Lock student drawing';
  btn.setAttribute('data-ko', _dKo); btn.setAttribute('data-en', _dEn);
  btn.textContent = en ? _dEn : _dKo;
};

window.vcFocusLockToggle = function(){
  window.__vcFocusLockOn = !window.__vcFocusLockOn;
  window.vcClassLockChipsRender();
  /* 🎯 (Shas 4번) 강사 자신에게도 «켜져 있다» 를 계속 보여 준다 — 칩 색만으로는
     눌렀는지 알기 어려워 「아무 변화가 없다」는 제보가 나왔다. */
  try { window.vcFocusBadge(window.__vcFocusLockOn, true); } catch(_){}
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'focus-lock', data: { locked: window.__vcFocusLockOn } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__vcFocusLockOn
      ? (_vcBgLockEn() ? '🎯 Focus mode ON — students follow you' : '🎯 집중 모드 시작 — 학생이 화면을 못 바꿔요')
      : (_vcBgLockEn() ? '🎯 Focus mode OFF' : '🎯 집중 모드를 해제했어요'));
  } catch(_){}
};

window.vcMicLockApply = function(locked){
  locked = !!locked;
  var changed = window.__vcMicLockedByTeacher !== locked;
  window.__vcMicLockedByTeacher = locked;
  try {
    if (locked) {
      if (window.__vcMicPrevOn === undefined) window.__vcMicPrevOn = (window.vcMicOn !== false);
      window.vcMicOn = false;
      if (window.vcLocalStream) vcLocalStream.getAudioTracks().forEach(function(t){ t.enabled = false; });
      try { if (typeof stopMicLevelMeter === 'function') stopMicLevelMeter(); } catch(_){}
      // 🛡 잠금 수신 시점에 아직 스트림이 없던 학생(입장 직후)도 확실히 음소거되도록 상시 집행
      if (!window.__vcMicLockTimer) window.__vcMicLockTimer = setInterval(function(){
        try {
          if (!window.__vcMicLockedByTeacher) { clearInterval(window.__vcMicLockTimer); window.__vcMicLockTimer = null; return; }
          if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') return;
          window.vcMicOn = false;
          if (window.vcLocalStream) vcLocalStream.getAudioTracks().forEach(function(t){ if (t.enabled) t.enabled = false; });
        } catch(_){}
      }, 2000);
    } else if (changed) {
      var prev = (window.__vcMicPrevOn === undefined) ? true : !!window.__vcMicPrevOn;
      window.__vcMicPrevOn = undefined;
      window.vcMicOn = prev;
      if (window.vcLocalStream) vcLocalStream.getAudioTracks().forEach(function(t){ t.enabled = prev; });
      try { if (prev && typeof startMicLevelMeter === 'function') startMicLevelMeter(); } catch(_){}
    }
    // 상단 툴바 마이크 버튼 UI 동기화 (독은 sync 주기가 알아서 반영)
    var on = (window.vcMicOn !== false);
    var btn = document.getElementById('vc-btn-mic');
    if (btn) { btn.className = 'ctrl-btn ' + (on ? 'on' : 'off'); btn.textContent = on ? '🎤' : '🔇'; }
  } catch(_){}
  if (changed) {
    try {
      if (typeof showToast === 'function') showToast(locked
        ? (_vcBgLockEn() ? '🔇 Teacher muted everyone' : '🔇 선생님이 전체 음소거를 켰어요')
        : (_vcBgLockEn() ? '🔊 You can unmute now' : '🔊 이제 마이크를 켤 수 있어요'));
    } catch(_){}
  }
};

window.vcFocusBadge = function(on, forStaff){
  try {
    var old = document.getElementById('vc-focus-badge');
    if (old) old.remove();
    if (!on) return;
    var en = false;
    try { en = (typeof getLang === 'function' && getLang() === 'en'); } catch(_){}
    var box = document.createElement('div');
    box.id = 'vc-focus-badge';
    box.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147482000;'
      + 'pointer-events:none;max-width:min(520px,94vw);padding:7px 16px;border-radius:999px;'
      + 'font-size:12.5px;font-weight:800;line-height:1.4;text-align:center;white-space:nowrap;'
      + 'overflow:hidden;text-overflow:ellipsis;'
      + 'background:rgba(180,83,9,.94);border:1px solid #fbbf24;color:#fef3c7;'
      + 'box-shadow:0 8px 24px -8px rgba(0,0,0,.5)';
    box.textContent = forStaff
      ? (en ? '🎯 Focus mode ON — students cannot switch tabs'
            : '🎯 집중 모드 켜짐 — 학생은 화면을 바꿀 수 없어요')
      : (en ? '🎯 Focus mode — follow your teacher’s screen'
            : '🎯 집중 모드 — 선생님 화면을 따라가요');
    document.body.appendChild(box);
  } catch(_){}
};

window.vcFocusLockApply = function(locked){
  locked = !!locked;
  var changed = window.__vcFocusLockedByTeacher !== locked;
  window.__vcFocusLockedByTeacher = locked;
  /* 띠는 «상태» 다 — changed 와 무관하게 항상 맞춘다.
     늦게 들어온 학생은 서버가 재전송해 주는데, 그때 changed 는 true 지만
     새로고침·재입장으로 값이 같은 채 들어오는 경우도 있어 여기서 한 번 더 맞춘다. */
  try { window.vcFocusBadge(locked, false); } catch(_){}
  if (changed) {
    try {
      if (typeof showToast === 'function') showToast(locked
        ? (_vcBgLockEn() ? '🎯 Focus mode — follow your teacher' : '🎯 집중 모드 시작 — 선생님 화면을 따라가요')
        : (_vcBgLockEn() ? '🎯 Focus mode ended' : '🎯 집중 모드가 끝났어요'));
    } catch(_){}
  }
};

window.vcSetBackground = async function(mode){
  // 🔒 선생님이 잠근 동안 학생은 배경 변경 불가 (타일 disabled 를 우회하는 호출도 차단)
  if (window.__vcBgLockedByTeacher && !_vcBgLockIsStaff()) {
    try { if (typeof showToast === 'function') showToast(_vcBgLockMsg(true)); } catch(_){}
    return;
  }
  // 활성 타일 표시
  document.querySelectorAll('.vc-bg-tile').forEach(t => {
    if (t.getAttribute('data-bg') === mode) {
      t.classList.add('vc-bg-active');
      t.style.borderColor = '#fbbf24';
    } else {
      t.classList.remove('vc-bg-active');
      t.style.borderColor = '#334155';
    }
  });
  const status = document.getElementById('vc-bg-status');
  vcBg.mode = mode;

  // 카메라 트랙 확보
  const camTrack = vcLocalStream && vcLocalStream.getVideoTracks()[0];
  if (!camTrack) {
    if (status) status.textContent = '⚠ 카메라가 꺼져 있어 가상 배경을 적용할 수 없습니다.';
    return;
  }

  // OFF: 원본 카메라로 복귀 + CSS 프레임도 제거
  if (mode === 'off') {
    vcBg.isProcessing = false;
    if (vcBg.rafId) { cancelAnimationFrame(vcBg.rafId); vcBg.rafId = null; }
    const v = document.getElementById('vc-local-video');
    if (v) {
      v.srcObject = vcLocalStream;
      v.style.borderRadius = '';
      v.style.boxShadow = '';
      v.style.filter = '';
      try { vcInstallSmartFit(v); } catch(_){}
    }
    const box = document.getElementById('vc-local-box');
    if (box) {
      box.style.background = '';
      box.style.padding = '';
      box.style.borderRadius = '';
    }
    const camTrk = vcLocalStream && vcLocalStream.getVideoTracks()[0];
    if (camTrk) vcSwapVideoTrack(camTrk);
    if (status) status.textContent = '원본 카메라 사용 중';
    return;
  }

  // ★ Phase 7k: CSS 프레임 즉시 적용 (검정화면 절대 방지)
  //   먼저 비디오 컨테이너에 CSS background 적용 → 사용자가 즉시 시각적 변화 확인
  //   AI 처리는 그 위에 best-effort 로 시도 → 실패해도 CSS 프레임이 보임
  const vcLocalBox = document.getElementById('vc-local-box');
  // fix (2026-07-12) — 모바일 타일은 작아서 12px 프레임이 얼굴 영역을 잡아먹음 → 6px
  const _bgFramePad = vcIsMobileDevice() ? '6px' : '12px';
  if (vcLocalBox && mode !== 'blur' && VC_BG_IMAGES[mode]) {
    vcLocalBox.style.background = "url('" + VC_BG_IMAGES[mode] + "') center/cover";
    vcLocalBox.style.padding = _bgFramePad;
    vcLocalBox.style.borderRadius = '14px';
    // 비디오 자체에 살짝 그림자 + 둥근 테두리로 자연스럽게
    const innerV = document.getElementById('vc-local-video');
    if (innerV) {
      innerV.style.borderRadius = '10px';
      innerV.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
    }
  } else if (vcLocalBox && mode === 'blur') {
    vcLocalBox.style.background = '#1e293b';
    vcLocalBox.style.padding = _bgFramePad;
    vcLocalBox.style.borderRadius = '14px';
    const innerV = document.getElementById('vc-local-video');
    if (innerV) innerV.style.filter = 'blur(0)';
  }
  // vcBg.mode 가 방금 세팅됐으니 스마트핏 즉시 재계산 → 가상배경 타일은 contain 으로 전환(얼굴 잘림 방지)
  try { vcSmartFitVideo(document.getElementById('vc-local-video')); } catch(_){}
  if (status) {
    const names = { blur:'흐림', galaxy:'우주', desert:'사막', underwater:'바닷속', beach:'바닷가', jungle:'정글', fireplace:'벽난로', angkor:'앙코르와트', jurassic:'쥬라식파크' };
    status.textContent = '✅ ' + (names[mode]||mode) + ' 배경 프레임 적용됨 (AI 처리 시도 중…)';
  }

  // 첫 적용: MediaPipe 로드 + 엔진 init + 배경 이미지 + 원본 트랙 보관 (best-effort)
  try {
    await vcLoadMediaPipe();
    await vcInitBgEngine();
    await vcEnsureHiddenVideo();
    if (mode !== 'blur' && VC_BG_IMAGES[mode]) {
      await vcLoadBgImage(mode);
    }
  } catch(e) {
    if (status) status.textContent = '✅ ' + (({blur:'흐림',galaxy:'우주',desert:'사막',underwater:'바닷속',beach:'바닷가',jungle:'정글'})[mode]||mode) + ' 배경 (CSS 프레임 모드 - AI 처리 미사용)';
    console.warn('[vc-bg] MediaPipe 로드 실패, CSS 프레임 모드 유지:', e);
    return;
  }

  // 원본 트랙 보관 (Off 시 복귀용)
  if (!vcBg.originalVideoTrack) vcBg.originalVideoTrack = camTrack;

  // 처리 시작
  vcBg.isProcessing = true;
  if (!vcBg.rafId) vcBgRenderLoop();

  // 첫 프레임 즉시 한 번 그려서 검정 화면 방지 (RAF 첫 콜백 전 대기 시간 동안)
  try {
    await vcBg.segmenter.send({ image: vcBg.hiddenVideo });
  } catch(e) { console.warn('[vc-bg] 초기 프레임 송신 실패:', e); }

  // 캔버스 스트림 생성 → 로컬 비디오에 연결 + sender 교체
  if (!vcBg.processedStream) {
    // 🔋 캡처 fps 상한(PC 20 / 모바일 12) — 실제 처리 fps와 맞춰 같은 프레임 중복 인코딩 방지
    vcBg.processedStream = vcBg.canvas.captureStream(vcBgCaptureFps());
    // 오디오 트랙도 합쳐서 보내야 함 (영상만 바꿈, 오디오는 원본 유지)
    const audioTrack = vcLocalStream.getAudioTracks()[0];
    if (audioTrack) vcBg.processedStream.addTrack(audioTrack);
  }
  const v = document.getElementById('vc-local-video');
  if (v) {
    v.srcObject = vcBg.processedStream;
    // 모바일 자동재생 정책: srcObject 교체 후 play() 필수 (안 하면 정지 프레임)
    v.muted = true; v.setAttribute('playsinline','');
    try { const _p=v.play(); if(_p&&_p.catch) _p.catch(()=>{}); } catch(_){}
    try { vcInstallSmartFit(v); } catch(_){}
  }
  const newVideoTrack = vcBg.processedStream.getVideoTracks()[0];
  if (newVideoTrack) vcSwapVideoTrack(newVideoTrack);

  if (status) {
    const names = { blur:'흐림', galaxy:'우주', desert:'사막', underwater:'바닷속', beach:'바닷가', jungle:'정글', fireplace:'벽난로', angkor:'앙코르와트', jurassic:'쥬라식파크' };
    status.textContent = '✅ ' + (names[mode]||mode) + ' 배경 적용 중 — 모든 참가자에게 보입니다';
  }

  // Phase 7k: 2초 후 AI 처리 잘 되면 메시지 업그레이드, 안되면 CSS 프레임 모드 유지
  vcBg.frameCount = 0;
  vcBg.errorCount = 0;
  setTimeout(() => {
    if (vcBg.mode !== mode) return; // 사용자가 다른 배경으로 바꿈
    const nameMap = {blur:'흐림',galaxy:'우주',desert:'사막',underwater:'바닷속',beach:'바닷가',jungle:'정글'};
    const niceName = nameMap[mode] || mode;
    if ((vcBg.frameCount || 0) > 0) {
      // AI 처리 성공 - 진짜 가상배경
      if (status) status.textContent = '✅ ' + niceName + ' AI 가상배경 적용 중 (모든 참가자에게 보임)';
    } else {
      // AI 실패 - CSS 프레임만 유지 (검정화면 X, 본인+상대 모두 raw 카메라 + 본인 화면 프레임)
      if (status) status.textContent = '✅ ' + niceName + ' 배경 프레임 (본인 화면만 - AI 처리 불가)';
      vcBg.isProcessing = false;
      if (vcBg.rafId) { cancelAnimationFrame(vcBg.rafId); vcBg.rafId = null; }
      // srcObject는 raw 카메라 유지, CSS 프레임만 표시
    }
  }, 2000);
};

function vcSetVideoSize(size, btn) {
    const row = document.getElementById('vc-main-row');
    if (!row) return;
    // 🔧 (2026-07-12) pip/facepip/solo 도 함께 제거 → 사이즈바(vcSetVideoSize)와
    //   화면모드(vcScreenSet: pip/facepip/solo)가 상호배타. 예전엔 pip 를 안 지워서
    //   'video-pip + video-threequarter' 조합이 생겨 세로 레이아웃이 깨졌다.
    row.classList.remove('video-quarter', 'video-half', 'video-threequarter', 'video-full', 'video-free', 'video-pip', 'video-facepip', 'video-solo');
    // 자유 크기 모드에서 빠져나올 때 떠있던 인라인 위치/크기 제거 → 기본 분할 레이아웃 복귀
    try {
        const _vp = document.getElementById('vc-video-pane');
        if (_vp) ['top','left','width','height'].forEach(p => _vp.style.removeProperty(p));
    } catch(_){}
    row.classList.add('video-' + size);
    document.querySelectorAll('.video-size-bar button').forEach(b => {
      // PIP 버튼은 active 토글에서 제외
      if (b.id !== 'vc-pip-btn') b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    // 칠판 캔버스가 보이면 새 폭에 맞춰 크기 조정
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 280);
}

function vcClampNum(v, min, max){ return Math.max(min, Math.min(max, v)); }

function vcApplyFreeBox(box){
    const pane = document.getElementById('vc-video-pane');
    if (!pane) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.round(vcClampNum(box.width, 150, vw * 0.96));
    const h = Math.round(vcClampNum(box.height, 120, vh * 0.90));
    const left = Math.round(vcClampNum(box.left, 0, Math.max(0, vw - w)));
    const top  = Math.round(vcClampNum(box.top, 56, Math.max(56, vh - h)));
    // inline + important 로 적용해 모바일 미디어쿼리의 !important 규칙까지 확실히 덮어씀
    pane.style.setProperty('width',  w + 'px', 'important');
    pane.style.setProperty('height', h + 'px', 'important');
    pane.style.setProperty('left',   left + 'px', 'important');
    pane.style.setProperty('top',    top + 'px', 'important');
}

function vcRestoreFreeBox(){
    let box = { top: 90, left: 12, width: 300, height: 230 };
    try { const s = JSON.parse(localStorage.getItem('vc_free_box') || 'null'); if (s && s.width) box = s; } catch(_){}
    vcApplyFreeBox(box);
}

function vcSaveFreeBox(){
    const pane = document.getElementById('vc-video-pane');
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    try { localStorage.setItem('vc_free_box', JSON.stringify({ top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) })); } catch(_){}
}

function vcEnterFreeFromCurrent(){
    const row = document.getElementById('vc-main-row');
    const pane = document.getElementById('vc-video-pane');
    if (!row || !pane) return;
    const r = pane.getBoundingClientRect();
    row.classList.remove('video-quarter','video-half','video-threequarter','video-full');
    row.classList.add('video-free');
    document.querySelectorAll('.video-size-bar button').forEach(b => { if (b.id !== 'vc-pip-btn') b.classList.remove('active'); });
    const fb = document.getElementById('vc-free-btn'); if (fb) fb.classList.add('active');
    vcApplyFreeBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 280);
}

function vcAttachFreeHandlers(){
    if (_vcFreeBound) return; _vcFreeBound = true;
    const row  = document.getElementById('vc-main-row');
    const pane = document.getElementById('vc-video-pane');
    if (!pane || !row) return;
    const bar  = pane.querySelector('.video-size-bar');
    const grip = document.getElementById('vc-vp-grip');
    let mode = null, sx = 0, sy = 0, sLeft = 0, sTop = 0, sW = 0, sH = 0;

    function start(e, m){
        mode = m; sx = e.clientX; sy = e.clientY;
        const r = pane.getBoundingClientRect();
        sLeft = r.left; sTop = r.top; sW = r.width; sH = r.height;
        e.preventDefault();
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', end);
        document.addEventListener('pointercancel', end);
    }
    function move(e){
        if (!mode) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (mode === 'move')           vcApplyFreeBox({ left: sLeft + dx, top: sTop + dy, width: sW, height: sH });
        else if (mode === 'resize-ne') vcApplyFreeBox({ left: sLeft, top: sTop + dy, width: sW + dx, height: sH - dy }); // 우상단 그립: 위로 끌면 커짐
        else                           vcApplyFreeBox({ left: sLeft, top: sTop, width: sW + dx, height: sH + dy });
        e.preventDefault();
    }
    function end(){
        if (!mode) return;
        mode = null; vcSaveFreeBox();
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        document.removeEventListener('pointercancel', end);
    }

    // 그립(우상단)은 어느 모드에서나 동작 — 자유 모드가 아니면 현재 크기 그대로 자유 모드로 전환 후 리사이즈
    if (grip) grip.addEventListener('pointerdown', e => {
        if (!row.classList.contains('video-free')) vcEnterFreeFromCurrent();
        start(e, 'resize-ne');
    });
    // 제목줄 드래그 이동은 자유 모드일 때만
    if (bar)  bar.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return; // 버튼 클릭은 이동으로 가로채지 않음
        if (!row.classList.contains('video-free')) return;
        start(e, 'move');
    });
    // 브라우저 창 크기가 바뀌면 화면 밖으로 나간 창 보정
    window.addEventListener('resize', () => {
        if (!row.classList.contains('video-free')) return;
        const r = pane.getBoundingClientRect();
        vcApplyFreeBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    });
}

window.vcToggleFreeResize = function(btn){
    const row = document.getElementById('vc-main-row');
    const pane = document.getElementById('vc-video-pane');
    if (!row || !pane) return;
    const turnOn = !row.classList.contains('video-free');
    row.classList.remove('video-quarter', 'video-half', 'video-threequarter', 'video-full', 'video-free');
    document.querySelectorAll('.video-size-bar button').forEach(b => { if (b.id !== 'vc-pip-btn') b.classList.remove('active'); });
    if (turnOn){
        row.classList.add('video-free');
        if (btn) btn.classList.add('active');
        vcRestoreFreeBox();
        vcAttachFreeHandlers();
    } else {
        ['top','left','width','height'].forEach(p => pane.style.removeProperty(p));
        const hb = document.querySelector('.video-size-bar button[onclick*="half"]');
        vcSetVideoSize('half', hb);
    }
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 280);
};

window.vcApplyDefaultVideoSize = function(){
    try {
        var isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
        var isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
        if (!(isMobile && isLandscape)) return;
        var row = document.getElementById('vc-main-row');
        if (!row) return;
        if (row.classList.contains('video-full') || row.classList.contains('video-solo')) return;
        var btn = document.querySelector('.video-size-bar button[onclick*="threequarter"]');
        vcSetVideoSize('threequarter', btn);
    } catch(_){}
};

window.vcSoloMode = false;

window.vcToggleSolo = function(btn){
  window.vcSoloMode = !window.vcSoloMode;
  const grid = document.getElementById('vc-video-grid');
  const localBox = document.getElementById('vc-local-box');
  if (window.vcSoloMode) {
    // 다른 모든 참가자 비디오 숨김 (본인 box 외)
    if (grid) {
      grid.querySelectorAll('.video-box').forEach(box => {
        if (box.id !== 'vc-local-box') box.style.display = 'none';
      });
    }
    // 본인 박스 풀사이즈
    if (localBox) {
      localBox.style.gridColumn = '1 / -1';
      localBox.style.gridRow = '1 / -1';
    }
    if (btn) { btn.style.background = 'rgba(168,85,247,.6)'; btn.style.color = '#fff'; }
  } else {
    if (grid) {
      grid.querySelectorAll('.video-box').forEach(box => { box.style.display = ''; });
    }
    if (localBox) { localBox.style.gridColumn = ''; localBox.style.gridRow = ''; }
    if (btn) { btn.style.background = 'rgba(168,85,247,.25)'; btn.style.color = '#d8b4fe'; }
  }
};

function vcTogglePip(btn) {
  const overlay = document.getElementById('vc-pip-overlay');
  if (!overlay) return;
  _vcPipActive = !_vcPipActive;
  overlay.classList.toggle('show', _vcPipActive);
  if (btn) btn.classList.toggle('active', _vcPipActive);
  else {
    const b = document.getElementById('vc-pip-btn');
    if (b) b.classList.toggle('active', _vcPipActive);
  }
  if (_vcPipActive) {
    vcRestorePipPos();
    vcSyncPipVideos();
    if (_vcPipSyncTimer) clearInterval(_vcPipSyncTimer);
    _vcPipSyncTimer = setInterval(vcSyncPipVideos, 1500);
    vcAttachPipDrag();
  } else {
    if (_vcPipSyncTimer) { clearInterval(_vcPipSyncTimer); _vcPipSyncTimer = null; }
    // 비디오 정리 — srcObject 참조 끊어 메모리 회수
    document.querySelectorAll('#vc-pip-body video').forEach(v => v.srcObject = null);
  }
}

function vcSyncPipVideos() {
  const body = document.getElementById('vc-pip-body');
  if (!body) return;
  try { vcMarkPipPrimary(); } catch(e){}
  let sources = Array.from(document.querySelectorAll('#vc-video-grid .video-box.vc-pip-primary video'));
  if (!sources.length) {
    // 마킹 전 폴백: 내 박스를 제외한 첫 원격 비디오 1개만
    sources = Array.from(document.querySelectorAll('#vc-video-grid video'))
      .filter(v => { const b = v.closest ? v.closest('.video-box') : null; return b && b.id !== 'vc-local-box'; })
      .slice(0, 1);
  }
  if (sources.length === 0) {
    body.innerHTML = '<div class="vc-pip-empty">'
      + (miIsEn()
          ? 'Other participants appear here'
          : '다른 참가자가 들어오면 여기에 표시됩니다')
      + '</div>';
    return;
  }
  // 기존 비디오 box 의 id 모음
  const existing = new Map();
  body.querySelectorAll('.video-box').forEach(b => existing.set(b.dataset.src, b));
  // 새로운 set 만들기
  const liveIds = new Set();
  sources.forEach(srcVideo => {
    const id = srcVideo.id || srcVideo.parentElement?.id || ('v_' + Math.random().toString(36).slice(2,8));
    liveIds.add(id);
    let box = existing.get(id);
    if (!box) {
      box = document.createElement('div');
      box.className = 'video-box';
      box.dataset.src = id;
      const v = document.createElement('video');
      v.autoplay = true; v.playsInline = true; v.muted = srcVideo.muted;
      box.appendChild(v);
      const labelSrc = srcVideo.parentElement?.querySelector('.video-label');
      const lbl = document.createElement('span');
      lbl.className = 'video-label';
      lbl.textContent = labelSrc ? labelSrc.textContent : (srcVideo.id || '참가자');
      box.appendChild(lbl);
      // empty placeholder 제거
      const empty = body.querySelector('.vc-pip-empty');
      if (empty) empty.remove();
      body.appendChild(box);
    }
    // srcObject 동기화 (참조 같으면 무동작)
    const v = box.querySelector('video');
    if (v.srcObject !== srcVideo.srcObject) v.srcObject = srcVideo.srcObject;
  });
  // 사라진 트랙 box 제거
  existing.forEach((box, id) => { if (!liveIds.has(id)) box.remove(); });
  // 모두 사라졌으면 empty
  if (body.children.length === 0) {
    body.innerHTML = '<div class="vc-pip-empty">'
      + (miIsEn()
          ? 'Other participants appear here'
          : '다른 참가자가 들어오면 여기에 표시됩니다')
      + '</div>';
  }
}

function vcAttachPipDrag() {
  const overlay = document.getElementById('vc-pip-overlay');
  const header = document.getElementById('vc-pip-header');
  if (!overlay || !header || header.dataset.dragBound) return;
  header.dataset.dragBound = '1';
  let dragging = false, sx=0, sy=0, ox=0, oy=0;
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const rect = overlay.getBoundingClientRect();
    ox = rect.left; oy = rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const nx = Math.max(8, Math.min(window.innerWidth - 80, ox + (e.clientX - sx)));
    const ny = Math.max(8, Math.min(window.innerHeight - 80, oy + (e.clientY - sy)));
    overlay.style.right = 'auto'; overlay.style.bottom = 'auto';
    overlay.style.left = nx + 'px'; overlay.style.top = ny + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    vcSavePipPos();
  });
  // 리사이즈는 CSS resize:both 가 처리 — ResizeObserver 로 저장만
  if (window.ResizeObserver) {
    new ResizeObserver(() => vcSavePipPos()).observe(overlay);
  }
}

function vcSavePipPos() {
  const overlay = document.getElementById('vc-pip-overlay');
  if (!overlay) return;
  try {
    localStorage.setItem('mangoi_pip_pos', JSON.stringify({
      left: overlay.style.left, top: overlay.style.top,
      width: overlay.style.width, height: overlay.style.height
    }));
  } catch {}
}

function vcRestorePipPos() {
  const overlay = document.getElementById('vc-pip-overlay');
  if (!overlay) return;
  try {
    const raw = localStorage.getItem('mangoi_pip_pos');
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.left)   overlay.style.left   = p.left;
    if (p.top)    overlay.style.top    = p.top;
    if (p.width)  overlay.style.width  = p.width;
    if (p.height) overlay.style.height = p.height;
    if (p.left || p.top) { overlay.style.right = 'auto'; overlay.style.bottom = 'auto'; }
  } catch {}
}

async function vcDownloadCurrentTextbook() {
    var url = window._vcCurrentPdfUrl;
    if (!url) { alert('다운로드할 교재가 없습니다. 먼저 교재를 띄워주세요.'); return; }
    try {
        var resp = await fetch(url);
        var blob = await resp.blob();
        var ext = (window._vcCurrentPdfKind === 'image') ? 'jpg' : (url.split('.').pop().split('?')[0] || 'pdf');
        if (ext.length > 5) ext = (blob.type.indexOf('pdf') >= 0 ? 'pdf' : 'jpg');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '교재_' + Date.now() + '.' + ext;
        document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch(e) {
        // CORS/네트워크 실패 시 새 탭으로 열기 (사용자가 직접 저장)
        try { window.open(url, '_blank'); } catch(_){ alert('다운로드 실패: ' + (e.message||e)); }
    }
}

window.vcDownloadCurrentTextbook = vcDownloadCurrentTextbook;

window.vcApplySharedVideo = function (vUrl) {
    try {
        if (!vUrl || /^blob:/i.test(vUrl)) return;
        // 🥭 (2026-07-13) 교사가 동영상 공유 → 세로폰 '내용 크게(pip)' 자동 전환
        window.__vcVideoSharing = true;
        try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
        if (vUrl === window._vcShownVideoUrl) return;   // 이미 같은 영상 표시 중
        vpLoadUrlRemote(vUrl);
        vcSwitchTab('video');
    } catch (e) { console.warn('[vcApplySharedVideo]', e); }
};

function vcOpenChat() {
    const panel = document.getElementById('vc-chat-panel');
    if (!panel || panel.classList.contains('open')) return;
    panel.classList.add('open');
    chatUnread = 0;
    try { document.getElementById('vc-chat-badge').classList.add('hidden'); } catch(e){}
    try { vcDockChatBadge(0); } catch(e){}                      // 📱 하단 독 배지도 함께 끔
    try { vcRefreshChatTargets(); } catch(e){}   // 🔒 열 때마다 참가자 칩 최신화
}

window.vcOpenChat = vcOpenChat;

function vcToggleChat() {
    const panel = document.getElementById('vc-chat-panel');
    if (!panel) return;
    if (!panel.classList.contains('open')) { vcOpenChat(); return; }
    panel.classList.remove('open');
}

function vcChatAutoOpen() {
    // 🔕 (2026-07-25 사장님 지시) 자동 열림이 교재 위 필기도구 버튼을 가려서 기본 OFF.
    //    채팅은 접힌 채 두고 배지(상단+하단 독)로만 알린다 — 채팅 버튼을 누르면 그때 열린다.
    //    (배지는 이 함수 호출 전에 이미 켜진다.) 다시 자동으로 열려면 window.VC_CHAT_AUTO_OPEN = true.
    if (window.VC_CHAT_AUTO_OPEN !== true) return;
    const body = document.body;
    if (!body || !body.classList.contains('vc-in-call')) return;   // 수업 중이 아니면 무시
    const panel = document.getElementById('vc-chat-panel');
    if (!panel || panel.classList.contains('open')) return;        // 이미 열려 있음

    // ── 열면 오히려 사고가 나는 상황 ──
    let blocked = null;
    // ① 모바일 세로 + '가로로 돌려주세요' 안내가 아직 안 닫힌 상태.
    //    이때 열면 상위 CSS 가 blur + pointer-events:none 을 걸어 '보이는데 눌리지 않는 유령 창'이 된다.
    //    ⚠️ matchMedia('(orientation:portrait)') 를 그대로 쓰면 뷰포트가 0으로 보고되는 상황
    //       (숨겨진 탭·레이아웃 전)에도 '세로'로 판정돼 PC 에서까지 자동열기가 막힌다.
    //       → 실제 크기를 읽어 0 이면 판정하지 않는다.
    const _vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const _vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (_vw > 0 && _vw <= 920 && _vh > _vw && !body.classList.contains('vc-orientation-dismissed')) blocked = 'orientation';
    // ② 교사가 건 집중 모드 — 학생 화면을 마음대로 바꾸지 않는 것이 이 모드의 취지
    else if (window.__vcFocusLockedByTeacher === true) blocked = 'focus-lock';
    // ③ 학생이 게임·미션 플레이 중 — 모바일 세로에서 화면 하단 절반을 덮어 마이크 미션을 망친다
    else if (document.getElementById('game-suite-frame')) blocked = 'game';

    if (blocked) {
        try { vcDockChatBadge(chatUnread, true); } catch(e){}      // 대신 독 버튼에서 강하게 알림
        return;
    }
    vcOpenChat();
}

window.vcChatAutoOpen = vcChatAutoOpen;

function vcSendChat() {
    const input = document.getElementById('vc-chat-input');
    const text = input.value.trim();
    if (!text || !vcConn) return;
    // 🔒 개별(1:1) 채팅 — 대상이 지정돼 있으면 그 사람에게만 전송.
    //   D1 영속 저장·@멘션 알림은 생략(개인 대화가 전체 기록/알림에 노출되지 않게).
    if (window.vcChatTarget && window.vcChatTarget.userId) {
        vcConn.send({ type: 'chat-message', data: { message: text, toUserId: window.vcChatTarget.userId } });
        input.value = '';
        return;
    }
    vcConn.send({ type: 'chat-message', data: { message: text } });
    // 🆕 Phase K1: D1에 영속 저장 (실시간 표시는 vcReceiveChat 에코로)
    try {
        fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: vcRoomId,
                sender_uid: vcUserId,
                sender_name: vcUsername,
                sender_role: (typeof vcIsObserver !== 'undefined' && vcIsObserver) ? 'observer' : 'student',
                message: text,
                // 🔐 학생 참여자 인증(서버가 vc_roster 확인 + sender_uid 위조 방지). 교사/관리자는 쿠키세션으로 통과.
                token: (function(){ try { return localStorage.getItem('mango_token') || ''; } catch(e){ return ''; } })(),
            })
        }).catch(() => {});
    } catch {}
    // 📲 Phase K4: @멘션 자동 푸시 알림톡
    //   "@홍길동" 또는 "@hong" 패턴 감지 → 해당 학생의 카톡으로 알림 발송
    //   조건: demoStudents 에 해당 이름/uid 존재 + 본인은 강사로 판단됨 (관리자 시뮬레이션 또는 강사 로그인)
    try {
        const mentionPattern = /@([A-Za-z0-9가-힣_]+)/g;
        const mentions = [];
        let m;
        while ((m = mentionPattern.exec(text)) !== null) {
            mentions.push(m[1]);
        }
        if (mentions.length > 0) {
            mentions.forEach(name => {
                // demoStudents 에서 이름 또는 uid 매칭
                let student = null;
                if (typeof demoStudents !== 'undefined' && demoStudents) {
                    for (const k in demoStudents) {
                        const s = demoStudents[k];
                        if (k === name || s.name === name || s.uid === name) { student = s; break; }
                    }
                }
                if (!student || !student.phone) return;
                fetch('/api/notify/mention', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mentioned_student_name: student.name,
                        mentioned_phone: student.phone,
                        teacher_name: vcUsername,
                        message_excerpt: text,
                        room_url: location.origin + '/?room=' + vcRoomId,
                    })
                }).then(r=>r.json()).then(d => {
                    if (d.ok) console.log('[k4] 멘션 알림 발송:', name, d.mode);
                }).catch(()=>{});
            });
            // 시각적 피드백 (작은 안내)
            try { vcAddChatSystem('📲 @' + mentions.join(', @') + ' 카톡 알림 발송됨'); } catch{}
        }
    } catch (e) { console.warn('[k4] mention err:', e); }
    input.value = '';
}

function vcReceiveChat(data) {
    const container = document.getElementById('vc-chat-messages');
    const isMine = data.userId === vcUserId;
    const isSystem = data.type === 'system';
    const isDm = !!data.dm;
    const cls = (isSystem ? 'system' : (isMine ? 'mine' : 'other')) + (isDm ? ' dm' : '');
    const time = new Date(data._loadedAt || Date.now()).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});

    let html = `<div class="chat-msg ${cls}">`;
    if (!isSystem && !isMine) html += `<div class="msg-sender">${escHtml(data.username)}</div>`;
    // 🔒 개별 메시지 표시 — 내가 보낸 건 "→ 받는사람", 받은 건 "개별 메시지" 태그
    if (isDm) html += `<div class="msg-dm-tag">🔒 ${isMine ? escHtml(data.toUsername || '개별') + ' 에게만' : '나에게만 (개별)'}</div>`;
    html += `<div class="msg-bubble">${escHtml(data.message)}</div>`;
    html += `<div class="msg-time">${time}</div></div>`;
    container.innerHTML += html;
    container.scrollTop = container.scrollHeight;

    // 🔔 안읽음 표시 + 자동열기 (2026-07-24)
    //   조건 4개는 전부 필요하다. 하나라도 빠지면 아래 사고가 난다:
    //     · isMine    — 서버가 보낸사람에게도 에코하므로, 빼면 내가 칠 때마다 창이 열림
    //     · isSystem  — 입·퇴장 안내도 이 함수를 타므로, 빼면 누가 들어올 때마다 창이 열림
    //     · _loadedAt — 입장 시 과거 200개를 다시 그리므로, 빼면 입장하자마자 창이 열림
    //     · open      — 이미 열려 있으면 배지도 자동열기도 불필요
    if (!isMine && !isSystem && !data._loadedAt && !document.getElementById('vc-chat-panel').classList.contains('open')) {
        chatUnread++;
        const badge = document.getElementById('vc-chat-badge');
        badge.textContent = chatUnread;
        badge.classList.remove('hidden');
        // 📱 상단 배지는 640px 이하에서 숨겨져 있어(모바일) 학생이 채팅 온 걸 알 방법이 없었다 → 하단 독에도 표시
        try { vcDockChatBadge(chatUnread, true); } catch(e){}
        try { vcChatAutoOpen(); } catch(e){}
    }
}

async function vcLoadChatHistory() {
    if (!vcRoomId) return;
    try {
        const r = await fetch('/api/chat/messages?room_id=' + encodeURIComponent(vcRoomId) + '&limit=200' + '&token=' + encodeURIComponent((function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })()));
        const d = await r.json();
        if (!d.ok || !d.rows || !d.rows.length) return;
        const container = document.getElementById('vc-chat-messages');
        if (!container) return;
        // 시스템 로딩 표시
        const banner = document.createElement('div');
        banner.style.cssText = 'text-align:center;font-size:11px;color:#94a3b8;padding:6px;border-bottom:1px dashed rgba(255,255,255,.08);margin-bottom:6px';
        banner.textContent = '─ 이전 채팅 ' + d.rows.length + '개 불러옴 ─';
        container.appendChild(banner);
        for (const m of d.rows) {
            vcReceiveChat({
                userId: m.sender_uid,
                username: m.sender_name || '익명',
                message: m.message,
                type: (m.sender_role === 'system') ? 'system' : 'user',
                _loadedAt: m.sent_at,        // 로드된 메시지 표시
            });
        }
    } catch (e) { console.warn('[vc-chat] history load:', e); }
}

function vcAddChatSystem(message) {
    vcReceiveChat({ type: 'system', message, userId: '_system', username: '시스템' });
}

function vcResetChat() {
    var en = (document.documentElement.lang === 'en');
    if (!confirm(en ? 'Clear the chat shown here?' : '지금 보이는 채팅을 모두 지울까요?')) return;
    try {
        var box = document.getElementById('vc-chat-messages');
        if (box) box.innerHTML = '';
    } catch(e) { console.warn('[vc-chat] reset:', e); }
    // 미읽음 배지도 함께 정리 — 지웠는데 숫자만 남아 있으면 안 지워진 것처럼 보인다
    try {
        var badge = document.getElementById('vc-chat-badge');
        if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
    } catch(e) {}
}

window.vcResetChat = vcResetChat;

window.vcChatTarget = null;   // null = 전체, {userId, username} = 개별

function vcChatParticipants() {
    const out = [];
    document.querySelectorAll('#vc-video-grid > .video-box').forEach(b => {
        if (!b.id || b.id === 'vc-local-box') return;
        const uid = b.id.replace('vc-video-', '');
        if (!uid || uid === 'demoteacher') return;
        const lbl = b.querySelector('.video-label');
        out.push({ userId: uid, username: (lbl && lbl.textContent) || '참가자' });
    });
    return out;
}

function vcSetChatTarget(userId, username) {
    window.vcChatTarget = userId ? { userId, username: username || '참가자' } : null;
    vcRefreshChatTargets();
    // 패널이 닫혀 있으면 열기 (얼굴 💬 버튼으로 지정했을 때)
    try {
        const panel = document.getElementById('vc-chat-panel');
        if (panel && !panel.classList.contains('open') && typeof vcToggleChat === 'function') vcToggleChat();
    } catch(_) {}
    const input = document.getElementById('vc-chat-input');
    if (input) {
        input.placeholder = window.vcChatTarget
            ? ('🔒 ' + window.vcChatTarget.username + ' 에게만 보내기…')
            : (input.getAttribute(miIsEn() ? 'data-en-ph' : 'data-ko-ph') || '메시지 입력...');
        try { input.focus(); } catch(_) {}
    }
}

function vcRefreshChatTargets() {
    const bar = document.getElementById('vc-chat-target-bar');
    if (!bar) return;
    const people = vcChatParticipants();
    // 대상이 방에서 나갔으면 전체로 자동 복귀
    if (window.vcChatTarget && !people.some(p => p.userId === window.vcChatTarget.userId)) {
        window.vcChatTarget = null;
        const input = document.getElementById('vc-chat-input');
        if (input) input.placeholder = input.getAttribute('data-ko-ph') || '메시지 입력...';
    }
    const cur = window.vcChatTarget;
    bar.innerHTML = '';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'chat-target-chip' + (cur ? '' : ' active');
    all.textContent = '👥 전체';
    all.onclick = function(){ vcSetChatTarget(null); };
    bar.appendChild(all);
    people.forEach(p => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'chat-target-chip dm' + ((cur && cur.userId === p.userId) ? ' active' : '');
        c.textContent = '🔒 ' + p.username;
        c.onclick = function(){ vcSetChatTarget(p.userId, p.username); };
        bar.appendChild(c);
    });
}

function vcAddDmButton(box, userId) {
    try {
        if (!box || !userId || userId === 'demoteacher') return;
        if (box.querySelector('.vc-dm-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'vc-dm-btn';
        btn.type = 'button';
        btn.title = '이 참가자에게만 채팅 (개별 채팅)';
        btn.textContent = '💬';
        btn.addEventListener('click', function(e){
            e.stopPropagation();
            const lbl = box.querySelector('.video-label');
            vcSetChatTarget(userId, (lbl && lbl.textContent) || '참가자');
        });
        box.style.position = box.style.position || 'relative';
        box.appendChild(btn);
    } catch(_) {}
}
