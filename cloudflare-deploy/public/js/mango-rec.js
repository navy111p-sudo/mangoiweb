

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
  /* 마지막으로 **rAF 가 돈** 시각 — rAF 정지 감지용(keepAlive 가 이 값을 본다).
     ⚠️ 2026-09-06 부터 «그리기를 건너뛴» 프레임에도 갱신한다 — 이 값의 뜻은 «그렸다» 가
        아니라 «rAF 가 살아 있다» 이다. 안 갱신하면 keepAlive(700ms)가 «멎었다» 로 오판해
        오히려 두 번 그린다. «실제로 그린» 시각은 아래 composeDrawAt 이다. */
  let composeTickAt = 0;
  let composeDrawAt = 0;        // 목표 fps 제한용 — 마지막으로 «캔버스에 그린» 시각
  /* 🪶 녹화 fps. 수업 화면은 «교재 + 얼굴» 이라 움직임이 적어 10fps 로 충분하다.
     해상도를 낮추는 대신 이쪽을 낮춘 이유: 해상도를 내리면 **교재 글자**를 잃는데,
     fps 는 공간 화질을 한 픽셀도 안 건드리면서 CPU 를 선형으로 줄인다.
     ⛔ 올릴 거면 필리핀·중국 강사 회선의 업로드부터 재 볼 것. */
  const REC_FPS = 10;
  const FRAME_MS = 1000 / REC_FPS;
  let composeKeepAlive = null;  // rAF 가 멎었을 때 대신 그리는 타이머
  // 📉 녹화 정체 감시 — 데이터가 사실상 안 쌓이면 선생님께 눈에 보이게 알린다
  let recTotalBytes = 0, stallBytesMark = 0, stallTimer = null, isStalled = false;
  // 정상 녹화는 초당 100KB 안팎. 30초에 300KB(=초당 10KB) 도 못 채우면 «사실상 안 찍히는» 것.
  const STALL_WINDOW_MS = 30000, STALL_MIN_BYTES = 300 * 1024;
  let audioCtx = null;
  let audioDest = null;
  let mixedTrackIds = null;    // 믹서에 이미 연결한 오디오 트랙 id — 재스캔 중복 방지
  let audioRescanTimer = null; // 녹화 중에만 도는 오디오 트랙 재스캔 (stopRecording 이 끈다)
  let recBadge = null;
  let isAutoMode = false;  // 자동 녹화 모드 여부
  /* ⛔ 서버가 «학생 미동의(consent_required)» 로 녹화를 거절한 상태.
     서버는 이걸 일부러 HTTP 200 + ok:false 로 준다(재시도 폭주 방지, api-mango.ts 참고).
     그래서 예외도 안 나고 배지는 그냥 «눌러서 시작» 으로 되돌아갔는데 — 몇 번을 눌러도
     절대 성공할 수 없는 상태라, 강사에게는 「녹화 버튼 고장」 으로 보였다
     (2026-08-27 Teacher Shas 제보 — class-971, 학생이 동의 팝업을 거부한 수업).
     → 이 플래그가 켜지면 배지가 «왜 안 되는지» 를 글자로 말한다. 탭하면 재시도는 그대로
     된다(학생이 뒤늦게 동의하면 그때부터는 성공한다). */
  let consentBlocked = false;

  /* 🎥 (2026-09-08 사장님 「왜 자꾸 동시에 두번씩 녹화가 되는 거지?」)
     서버가 «이 방은 다른 기기가 이미 찍고 있다»(already_recording) 로 거절한 상태.
     consent 와 같은 이유로 HTTP 200 + ok:false 로 온다(재시도 폭주 방지).

     ⚠️ 「가장 수업에 덜 지장있게」(같은 날 지시) — 여기서 «영영 포기» 하면 안 된다.
        상대 기기가 신호 없이 죽으면 그 방 녹화가 통째로 사라진다. 그래서 이 상태는
        **자동으로 다시 시도한다**(startRetryAt). 서버 쪽 «살아있음» 창이 3분이므로
        상대가 죽었으면 늦어도 그 안에 이 기기가 이어받는다. */
  let dupBlocked = false;

  /* ⏱ 다음 «자동» 시작을 시도할 시각. 시작이 실패하면(미동의·중복·서버 오류 무엇이든)
     이 값을 미뤄 두고 그때까지는 3초 폴링이 서버를 두드리지 않는다.
     ⛔ 0 으로 두면 폴링이 3초마다 /api/recordings/start 를 부른다(수업 20분이면 400회).
     ✅ 반대로 «한 번 실패하면 끝» 으로 두지도 않는다 — 학생이 뒤늦게 동의하거나 상대 기기가
        죽었을 때 이 기기가 이어받아야 하기 때문이다. 사람이 배지를 누르면 이 값과 무관하게
        즉시 시도한다. */
  let startRetryAt = 0;
  const START_RETRY_MS = 60 * 1000;

  /* 👁 참관(Ghost) 중에는 녹화하지 않는다 (2026-08-26 사장님 지시)
     ─────────────────────────────────────────────────────────────────────
     참관자는 «투명 유령» 이다 — 서버(video-call-room.ts handleJoinObserve)가 인원수·
     입퇴장 방송 어디에도 안 넣고, 미디어도 한 트랙도 안 보낸다. 그런데 자동녹화는
     «수업 화면에 들어왔는가»(body.vc-in-call)만 보고 돌아서 참관자도 함께 녹화를 켰다.
     실측(2026-08-26 사장님 화면): `class-943` 에 「관찰자」 이름으로 시작된 녹화 두 건이
     30분 넘게 「● 녹화중」 으로 남아 있었다 — 참관자가 창을 닫을 때 종료 신호가 안 가서
     크론이 12시간 뒤에야 정리한다. 같은 수업을 두세 벌 찍는 셈이라 저장 비용도 는다.
     ⚠️ 판정 근거는 vc-observe-guard.js 의 observing() 과 «같은 것» 을 쓴다. 이름(「관찰자」)
        으로 가르지 않는다 — 그건 사람이 바꿀 수 있는 표시일 뿐이다. */
  /* 🇵🇭 (2026-09-02 사장님 지시 「필리핀 선생님의 음성과 화면에 모든 걸 집중」)
     강사 브라우저는 «자동» 녹화를 하지 않는다.

     왜 — 그전에는 수업에 들어온 «모든 사람» 이 각자 녹화했다. D1 실측(최근 2주, class-* 방):
       class-1008 교사 224.5MB/24.3분 + 학생 265MB/27.6분 · class-988 교사 235.2MB/26.0분 + 학생 210MB/22.5분
       class-967 교사 191.9MB/23.1분 + 학생 218.8MB/23.1분 · class-1070 교사 166.7MB/26.7분 + 학생 246.3MB/26.6분
     두 파일은 **내용이 같다**(둘 다 화면 전체를 합성해 찍는다). 그런데 그 한 벌이 강사 노트북에서
       · 1920×1080 @15fps 소프트웨어 VP8 인코딩 · 지정 2.5Mbps (CPU — WebRTC 영상 인코더와 같은 CPU 를 쓴다)
       · 약 200MB/24분 ≈ 1.1Mbps 를 **수업 중에** R2 로 업로드 (5MB 조각 = 36초마다 몰아 쏨)
     를 하고 있었다. 학생에게 보내는 실시간 영상이 최대 1.2Mbps 이니 녹화가 강사 업로드를 거의 두 배로 만든다.
     필리핀 회선에서는 그 5MB 버스트마다 실시간 영상·소리가 뒤로 밀린다.

     ⚠️ «그것 때문이다» 를 직접 재지는 못했다 — 상관이지 증명이 아니다(9/1 저녁 실측 freeze 140~165회).
     ⛔ 막지는 않는다 — 상단 배지를 누르면 강사도 손으로 시작할 수 있다(안전판).
     ⚠️ 그래서 **강사끼리만 있는 방은 자동 녹화가 0개**가 된다(사장님 시험 수업 class-849 등).
        판정이 «모르면 false» 로 떨어지므로(vcIsTeacherRole) 학생은 언제나 찍는다 = 안전한 방향의 실패.
     ⚠️ 정본 vcIsTeacherRole 에는 **이미 이름 휴리스틱이 있다** — 로그인이 아예 없을 때만
        (idx-main.js `if (_u0) return false;` 뒤) 표시이름의 교사/강사/선생님/teacher/tutor 를 본다.
        즉 비로그인으로 들어온 사람의 이름에 그 낱말이 있으면 그 사람은 자동 녹화를 안 한다.
        ⛔ 그 휴리스틱을 «로그인한 사람» 에게까지 넓히지 말 것 — 아이디에 teacher 가 든
           학생의 녹화가 통째로 사라진다(그 파일 주석이 같은 이유로 이미 막아 두었다). */
  function isStaffSkipRecording() {
    try {
      if (window.__mangoRecStaffAuto === true) return false;   // 되돌리는 스위치(콘솔에서 켤 수 있다)
      return (typeof window.vcIsTeacherRole === 'function') ? !!window.vcIsTeacherRole() : false;
    } catch (_) { return false; }                               // 모르면 «찍는다» 쪽으로 실패한다
  }

  function isObserverNow() {
    try {
      if (window._vcObserverMode === true) return true;
      if (typeof vcIsObserver !== 'undefined' && vcIsObserver === true) return true;
      if (document.body && document.body.classList.contains('vc-observer')) return true;
    } catch (_) { /* 아직 선언 전이면 참관이 아니다 */ }
    return false;
  }

  // 🌐 강사 다수가 필리핀이라 이 배지의 모든 문구는 한/영 두 벌을 갖는다.
  function isEn() {
    try { return (typeof window.getLang === 'function' && window.getLang() === 'en'); } catch (e) { return false; }
  }
 
  // R2 multipart 상태
  let r2Key = null;
  let r2UploadId = null;
  let r2Parts = [];
  let r2PartNumber = 0;
  let r2TotalBytes = 0;
  let r2UploadQueue = Promise.resolve();
  let r2InitDone = false;
  // 🔴 2026-08-04: 정상 종료(completeR2Upload)가 이미 complete 를 보냈으면 beforeunload 쪽은
  //   전송을 양보한다. 같은 upload_id 로 complete 가 두 번 도착하면 뒤엣것이 R2 오류 10024
  //   ("The specified multipart upload does not exist")를 받고, 그 실패가 «이미 성공한 행» 을
  //   upload_failed 로 덮어써서 «파일은 멀쩡한데 목록엔 저장 실패» 가 됐다.
  //   (recorder.js 에는 _stopRequested 가 있었는데 이 파일에만 빠져 있었다)
  let r2CompleteSent = false;
  let chunkBuffer = [];
  let chunkBufferSize = 0;
  // 🛟 스냅샷 — «아직 조각이 하나도 안 올라간» 구간의 안전망 (2026-08-25)
  //   R2 는 비마지막 파트가 5MiB 이상이어야 해서, 그 전에는 서버에 아무것도 없다.
  //   ⚠️ 2026-09-02 에 비트레이트를 2.5 → 1.2Mbps 로 내리면서 그 구간이 «~17초 → 약 35초» 로 늘었다
  //      (5MiB ÷ 약 150KB/s). 그래서 SNAP_EVERY_MS 도 30초 → 12초로 함께 줄였다 — 안 줄이면
  //      스냅샷이 9초 한 번뿐이라 최악 손실이 ~7초 → ~22초가 된다.
  //   ⛔ 비트레이트를 다시 바꿀 때는 이 두 상수를 함께 보라(rec_teacher_skip_harness ⑥).
  //   그 사이 탭이 닫히면 abort 가 나가고 영상이 통째로 사라졌다(2026-08-25 실측 6건).
  //   → 그 구간 동안만 «지금까지의 버퍼 전체» 를 통짜 파일로 한 번씩 올려 둔다.
  //   서버는 `<키>.snap` 에 저장하고, multipart 가 끝나면(complete) 지운다.
  let snapNextAt = 0;      // 다음 스냅샷 예정 시각(ms)
  let snapCount = 0;       // 이번 녹화에서 올린 스냅샷 수
  let snapInFlight = false;
  const SNAP_FIRST_MS = 9000;    // 첫 스냅샷 — 파트가 생기기 한참 전
  const SNAP_EVERY_MS = 12000;   // 그 뒤 12초마다 — 첫 파트가 생기기까지 «47초»(2026-09-06 에
                                 // 0.9Mbps 로 내려 35 → 47초)를 네 번 덮는다. 정본은 하니스 ⑦절이
                                 // 비트레이트를 «읽어» 재계산한다 — 여기 숫자는 그 결과를 옮겨 적은 것.
  const SNAP_MAX = 15;
  // 🔴 2026-08-04: R2 는 «마지막 파트를 뺀 나머지 파트가 1바이트도 틀리지 않고 같은 크기»가
  //   아니면 completeMultipartUpload 를 통째로 거부한다(오류 10048). 예전엔 «5MB 넘으면
  //   모아둔 걸 통째로» 올려서 파트 크기가 제각각이었고, 비마지막 파트가 2개 이상 되는
  //   순간(대략 1분 30초·10MB 이상) 마무리가 실패해 녹화가 통으로 사라졌다.
  const PART_SIZE = 5 * 1024 * 1024; // 5MiB — R2 최소 파트 크기이자 «고정» 파트 크기
 
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
    /* 🇵🇭 (2026-09-02 사장님 결정) 1920×1080 → 1280×720, 2.5Mbps → 1.2Mbps.
       픽셀 수가 55% 줄어 소프트웨어 VP8 인코딩 CPU 와 업로드가 함께 내려간다.
       그 CPU·업로드는 WebRTC 실시간 영상과 «같은» 것을 나눠 쓴다 — 특히 필리핀 강사 회선.
       ⚠️ 칸 «폭·높이» 는 width/height 에 비례하지만, 글꼴(13~20px)·탭바 32px·REC 배지(190×32)·
          미니플레이어(240×135)는 **고정 픽셀**이다 — 해상도를 낮추면 그만큼 상대적으로 커진다.
          1280×720 에서는 전부 캔버스 안에 들어가고 겹치지 않는 것을 확인했다(산술).
          ⛔ 더 낮출 거면 그 고정값들부터 다시 재라 — «전부 비례» 가 아니다.
       ⛔ 다시 1080p 로 올릴 거면 강사 쪽 업로드부터 재 보고 올릴 것. */
    composeCanvas.width = 1280;
    composeCanvas.height = 720;
    // 🪶 alpha:false — 이 캔버스는 매 프레임 fillRect 로 전체를 불투명하게 칠하므로
    //    투명 채널이 필요 없다. 합성 비용이 준다(브라우저가 뒤를 섞지 않아도 된다).
    composeCtx = composeCanvas.getContext('2d', { alpha: false });
 
    // 레이아웃 상수: 좌측(비디오) 30%, 우측(콘텐츠) 70%
    const VID_W = Math.floor(composeCanvas.width * 0.3);   // 384px (1280 기준)
    const CONTENT_X = VID_W;
    const CONTENT_W = composeCanvas.width - VID_W;          // 896px
    const H = composeCanvas.height;                          // 720px
 
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
        ctx.font = '18px MangoiHanSC,sans-serif';
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
        ctx.font = '13px MangoiHanSC,-apple-system,"맑은 고딕",sans-serif';
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
        ctx.font = '20px MangoiHanSC,sans-serif';
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
        ctx.font = '20px MangoiHanSC,sans-serif';
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
      ctx.font = '20px MangoiHanSC,sans-serif';
      ctx.fillText('📹 동영상 없음', x + 20, y + 40);
    }
 
    function draw() {
      /* 🪶 (2026-09-05 사장님 지시 «최대한 가볍게») 그리기를 목표 fps 로 제한한다.
         [무엇이 낭비였나] 이 함수는 requestAnimationFrame 으로 도니 **화면 주사율(보통 60fps)**
           로 그리는데, 아래 captureStream 은 그중 일부만 가져간다. 즉 그린 것의 3/4 이상을
           **그리자마자 버리고 있었다.** 그 CPU 는 WebRTC 실시간 영상과 «같은» 것을 나눠 쓴다.
         [왜 rAF 를 그대로 두나] 아래 2026-08-05 실장애 주석 참고 — 탭이 숨으면 rAF 가 멎어
           캔버스가 얼어붙고 녹화가 빈 껍데기가 된다. 그래서 구조(rAF + keepAlive)는 건드리지
           않고 «그릴 차례가 아니면 건너뛰기» 만 넣는다.
         ⚠️ 건너뛸 때도 composeTickAt 을 갱신해야 한다 — 안 그러면 아래 keepAlive(700ms)가
            «rAF 가 멎었다» 로 오판해 오히려 두 번 그린다.
         ℹ️ 백그라운드에서는 keepAlive 가 약 1초에 한 번 부르는데, 그 간격이 FRAME_MS 보다
            훨씬 크므로 이 가드에 걸리지 않는다(= 예전과 같이 계속 그린다). */
      const _now = Date.now();
      if (_now - composeDrawAt < FRAME_MS - 2) {
        composeTickAt = _now;
        if (composeRafId) cancelAnimationFrame(composeRafId);
        composeRafId = requestAnimationFrame(draw);
        return;
      }
      composeDrawAt = _now;

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
      ctx.font = 'bold 15px MangoiHanSC,-apple-system,"맑은 고딕",sans-serif';
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
            ctx.font = '11px MangoiHanSC,sans-serif';
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
      ctx.font = 'bold 14px MangoiHanSC,sans-serif';
      ctx.fillText('● REC ' + mm + ':' + ss + '  👤' + vidCount + '명', composeCanvas.width - 190, 31);
 
      // 🔴 2026-08-05 실장애(id=2022): 93.7분 수업이 R2 에 15MB(5MiB×3조각)만 남았다.
      //   초당 2.8KB — 오디오만 담겨도 초당 16KB 는 나오므로 «거의 아무것도 안 찍힌» 것.
      //   원인: 탭이 백그라운드로 내려가면 브라우저가 requestAnimationFrame 을 **완전히 멈춘다**.
      //   그러면 이 캔버스가 얼어붙고, 얼어붙은 화면은 거의 압축돼 사라져 녹화가 빈 껍데기가 된다.
      //   선생님은 수업 중 다른 창을 볼 수밖에 없으므로 **화면이 안 보여도 계속 그려야 한다.**
      //   → rAF 는 그대로 두되, 멎으면 타이머가 대신 그린다(백그라운드에서 1초로 느려지지만 0 은 아니다).
      composeTickAt = Date.now();
      if (composeRafId) cancelAnimationFrame(composeRafId);
      composeRafId = requestAnimationFrame(draw);
    }
    draw();
    if (composeKeepAlive) clearInterval(composeKeepAlive);
    composeKeepAlive = setInterval(() => {
      if (Date.now() - composeTickAt > 700) {     // rAF 가 멎었다 = 탭이 숨겨졌다
        try { draw(); } catch (_) {}
      }
    }, 500);
    /* 🪶 그리기와 «같은» 값이라 버리는 프레임이 «거의» 없다.
       ⚠️ «없다» 고 단정하지 말 것 — captureStream 의 캡처 시계는 우리 그리기와 위상이 맞지
          않아 같은 화면을 두 번 담거나 한 장을 건너뛸 수 있다(이 환경에서는 못 쟀다). */
    return composeCanvas.captureStream(REC_FPS);
  }
 
  // 트랙 하나를 믹서에 연결 — 이미 연결한 트랙(id 기준)·끝난 트랙은 건너뛴다.
  // 죽은 트랙에 연결된 옛 소스는 무음만 내보내므로 굳이 끊지 않는다(끊을 API 추적이 더 위험).
  function mixTrackIn(item) {
    if (!audioCtx || !audioDest || !item || !item.track) return;
    if (item.track.readyState === 'ended') return;
    if (mixedTrackIds && mixedTrackIds.has(item.track.id)) return;
    try {
      const src = audioCtx.createMediaStreamSource(item.stream);
      src.connect(audioDest);
      if (mixedTrackIds) mixedTrackIds.add(item.track.id);
    } catch (e) { console.warn('오디오 믹스 실패', e); }
  }

  function startAudioMix() {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    audioDest = audioCtx.createMediaStreamDestination();
    mixedTrackIds = new Set();
    collectAudioTracks().forEach(mixTrackIn);
    // 🔴 (2026-08-27 사장님 제보 — «학생 목소리가 안 담겼고, 5분쯤부터는 전부 무음»)
    //   예전엔 여기서 «녹화 시작 순간에 있는 트랙» 만 한 번 연결하고 끝이었다. 그런데
    //   ① 자동녹화는 수업 화면에 들어가는 «순간» 시작된다 — 상대가 아직 안 들어왔으면
    //      (녹화 행의 「참가자 1명」이 그 증거) 상대 목소리는 영영 안 담긴다.
    //   ② 수업 중 끊겼다 재연결되면 WebRTC 피어가 새로 만들어져 «새 오디오 트랙» 이
    //      생기는데, 믹서는 옛(죽은) 트랙만 물고 있어 그 시점부터 무음이 된다.
    //   영상은 collectVideos() 가 매 프레임 DOM 을 다시 읽어 저절로 복구되는데 오디오만
    //   한 번짜리였던 것 — 그래서 «영상만 나오는» 녹화가 됐다.
    //   → 녹화 중에만 3초마다 다시 훑어 «아직 연결 안 된 트랙» 만 이어 붙인다.
    //   ⛔ body class MutationObserver·상주 인터벌로 바꾸지 말 것(CLAUDE.md 2장 — 홈 정지 전력).
    //      이 인터벌은 녹화 동안만 살고 stopRecording 이 끈다.
    if (audioRescanTimer) clearInterval(audioRescanTimer);
    audioRescanTimer = setInterval(() => {
      if (!audioCtx || !audioDest) return;
      // 자동재생 정책에 걸려 컨텍스트가 잠들면 믹스 출력이 통째로 무음이 된다 — 깨운다
      try { if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (_) {}
      try { collectAudioTracks().forEach(mixTrackIn); } catch (_) {}
    }, 3000);
    return audioDest.stream;
  }
 
  /**
   * 🥭 (2026-06-28) REC 배지를 수업 툴바의 EN(언어) 버튼 왼쪽으로 이동(도킹).
   *  - host 셀렉터는 mango-theme.js / mango-class-time.js 와 동일하게
   *    '#view-videocall-call .toolbar-right' 로 정확히 지정 (.toolbar .toolbar-right 가 2개라
   *    첫 번째=signaling 뷰를 잘못 잡던 버그 방지).
   *  - 멱등(idempotent) + 갱신 인터벌에서 매초 재시도 → 툴바가 늦게 생겨도 결국 도킹됨.
   *  - 모바일(<=900px)은 통합 바(mango-topbar-unified)가 따로 처리하므로 도킹하지 않음.
   */
  function recDockBadge() {
    if (!recBadge) return;
    var isMobileMQ = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
    if (isMobileMQ) return;
    if (recBadge.getAttribute('data-docked') === '1' && recBadge.parentNode &&
        recBadge.parentNode.closest && recBadge.parentNode.closest('#view-videocall-call')) return;
    var host = document.querySelector('#view-videocall-call .toolbar-right')
            || document.querySelector('.toolbar-right');
    if (!host) return;
    var enBtn = host.querySelector('[onclick*="toggleLang"]') || host.querySelector('button, a');
    if (enBtn) host.insertBefore(recBadge, enBtn);   // EN 왼쪽
    else host.appendChild(recBadge);
    recBadge.setAttribute('data-docked', '1');
  }

  // ── 📉 녹화 정체 감시 ──────────────────────────────────────────────────────
  //   왜: id=2022 는 93.7분 수업인데 15MB(초당 2.8KB)만 저장됐다. 오디오만 담겨도 초당 16KB 는
  //   나오므로 «사실상 아무것도 안 찍힌» 것인데, 화면에는 REC 타이머가 멀쩡히 돌고 있어
  //   선생님도 학생도 끝날 때까지 몰랐다. 조용히 빈 껍데기가 되는 게 가장 위험하다.
  //   → 30초마다 실제 쌓인 바이트를 보고, 사실상 멎었으면 배지를 빨갛게 바꿔 알린다.
  function startStallWatch() {
    stopStallWatch();
    stallBytesMark = recTotalBytes;
    stallTimer = setInterval(() => {
      const grew = recTotalBytes - stallBytesMark;
      stallBytesMark = recTotalBytes;
      const stalled = grew < STALL_MIN_BYTES;
      if (stalled !== isStalled) {
        isStalled = stalled;
        if (stalled) {
          console.error('[mango-rec] ⚠ 녹화 정체 — 최근 30초 동안', grew, '바이트만 기록됨');
        } else {
          console.log('[mango-rec] 녹화 정상 복구');
        }
        paintStallState();
      }
    }, STALL_WINDOW_MS);
  }
  function stopStallWatch() {
    if (stallTimer) clearInterval(stallTimer);
    stallTimer = null;
    isStalled = false;
  }
  // 배지 툴팁 — 세 가지 상태(꺼짐 / 정체 / 정상)를 한 곳에서 결정한다.
  function recTitle() {
    const en = isEn();
    if (!isRecording && consentBlocked) {
      return en
        ? '⛔ Recording is blocked — the student (or parent) has not agreed to recording. It starts once they accept the consent popup. Tap to retry.'
        : '⛔ 학생(학부모)이 촬영 동의를 하지 않아 녹화할 수 없습니다. 학생이 동의 팝업을 수락하면 시작됩니다 — 눌러서 다시 시도';
    }
    if (!isRecording && dupBlocked) {
      /* ⛔ «누가 찍고 있는지» 는 서버가 주지 않는다(그 이름이 학생 로그인 아이디일 수 있어
            무인증 응답에서 뺐다 — api-mango.ts 의 그 자리 주석 참고). 여기서도 묻지 않는다. */
      return en
        ? 'Another device is already recording this class. Two copies would have the same content'
          + ' and would slow the class down, so this device is waiting. Tap to try again.'
        : '이 수업은 다른 기기에서 이미 녹화하고 있습니다.'
          + ' 두 벌은 내용이 같고 수업만 느려지므로 여기서는 기다립니다 — 눌러서 다시 시도';
    }
    if (!isRecording && isStaffSkipRecording()) {
      return en
        ? 'This device does not auto-record — it would compete with your live video and audio. The class is recorded on the student side. Tap only if you really need a copy from here.'
        : '이 기기는 자동 녹화를 하지 않습니다 — 녹화가 실시간 영상·소리와 같은 회선과 CPU 를 나눠 쓰기 때문입니다. 수업은 학생 기기에서 녹화됩니다. 꼭 여기서도 남겨야 할 때만 눌러 주세요.';
    }
    if (!isRecording) return en ? 'Recording is OFF — tap to start again' : '녹화가 꺼져 있습니다 — 눌러서 다시 시작';
    if (isStalled)    return en ? '⚠ Nothing is being recorded — bring this class window to the front'
                                : '⚠ 녹화가 기록되지 않고 있습니다 — 이 수업 창을 화면 앞으로 두세요';
    return en ? 'Recording — tap to stop' : '자동녹화 중 — 눌러서 정지';
  }

  function paintStallState() {
    if (!recBadge) return;
    recBadge.classList.toggle('mango-rec-stalled', isStalled);
    recBadge.title = recTitle();
    const warn = recBadge.querySelector('.mango-rec-warn');
    if (isStalled && !warn) {
      const w = document.createElement('span');
      w.className = 'mango-rec-warn';
      w.textContent = isEn() ? '⚠ Not recording' : '⚠ 기록 안 됨';
      w.style.cssText = 'margin-left:6px;font-weight:800;white-space:nowrap';
      recBadge.appendChild(w);
    } else if (!isStalled && warn) {
      warn.remove();
    }
  }

  /* 🔴 (2026-08-06) 녹화를 한 번 끄면 «다시 켤 방법이 아무 데도 없었다».
     끄면 hideRecBadge() 가 배지를 DOM 에서 통째로 지웠고, 다시 켤 수 있는
     유일한 버튼(#mango-rec-btn)은 .toolbar-center 안에 있는데 vc-dock.js 가
     그 줄을 display:none 으로 덮는다. 자동녹화도 autoRecStarted 가 true 로
     남아 다시 걸리지 않는다 → 수업을 나갔다 들어오는 것 말고는 길이 없었다.
     ⇒ 배지를 지우지 말고 «꺼짐» 상태로 그 자리에 남긴다. 누르면 다시 시작. */
  function paintRecBadge() {
    if (!recBadge) return;
    const en = isEn();
    recBadge.classList.toggle('mango-rec-off', !isRecording);
    // ⛔ 미동의 차단은 «꺼짐» 의 하위 상태 — mango-rec-off 는 그대로 두고 색·글자만 바꾼다.
    //    사유를 title 에만 두면 폰에서는 영영 안 보인다(툴팁은 마우스 전용) — 본문 글자로 쓴다.
    recBadge.classList.toggle('mango-rec-consent', !isRecording && consentBlocked);
    const timeEl = recBadge.querySelector('.mango-rec-time-text');
    const stopEl = recBadge.querySelector('.mango-rec-stop');
    if (!isRecording) {
      recBadge.classList.remove('mango-rec-expanded');
      /* 🇵🇭 강사 기기는 «일부러» 안 찍는다 — 그 사유를 본문 글자로 말한다.
         ⛔ 여기서 '눌러서 시작' 이라고만 쓰면, 이 PR 이 걷어낸 CPU·업로드 부하를
            화면이 다시 켜라고 «권유» 하는 꼴이 된다(함정 대조 지적).
         ⛔ 「학생이 녹화 중」 이라고 단정하지 않는다 — 이 기기에서 확인할 수 없다.
            말할 수 있는 사실은 «이 기기는 안 찍는다» 와 «왜» 까지다. */
      /* 🎥 «다른 기기가 찍는 중» 도 본문 글자로 말한다 — 툴팁은 폰에서 영영 안 보인다.
            ⛔ 여기서 «눌러서 시작» 이라고만 쓰면 강사가 눌러 두 벌을 다시 만든다. */
      if (timeEl) timeEl.textContent = consentBlocked
        ? (en ? '⛔ No student consent — REC blocked' : '⛔ 녹화불가 · 학생 미동의')
        : dupBlocked
          ? (en ? '⏸ Other device is recording' : '⏸ 다른 기기가 녹화 중')
        : isStaffSkipRecording()
          ? (en ? '📵 REC off · saving bandwidth' : '📵 녹화 안 함 · 회선 보호')
          : (en ? 'REC OFF · Tap to start' : '녹화 꺼짐 · 눌러서 시작');
      if (stopEl) stopEl.textContent = '▶';
    } else {
      if (stopEl) stopEl.textContent = '⏹';
    }
    recBadge.style.pointerEvents = '';
    paintStallState();
  }

  function removeRecBadge() {
    if (recBadge) { recBadge.remove(); recBadge = null; }
  }

  function showRecBadge() {
    ensureRecBadge();
    paintRecBadge();
  }

  function ensureRecBadge() {
    if (recBadge) return;
    recBadge = document.createElement('div');
    recBadge.id = 'mango-rec-badge';
    // 기본(데스크탑) 스타일: CSS 클래스로 위임해 모바일 media query로 축소 가능하게 함
    recBadge.innerHTML = '<span class="mango-rec-dot"></span><span id="mango-rec-time" class="mango-rec-time-text">REC 00:00</span><span class="mango-rec-stop" aria-hidden="true">⏹</span>';
    recBadge.title = recTitle();
    // 클릭(탭): 모바일에서 접혀 있으면 먼저 펼쳐 시간을 보여주고,
    // 펼친 상태(또는 데스크탑)에서 다시 누르면 확인 후 자동녹화를 '중지'한다.
    // 꺼져 있으면 한 번 눌러 곧바로 «다시 시작»한다(되돌아올 길은 여기뿐이다).
    recBadge.addEventListener('click', async () => {
      const isMobile = window.matchMedia('(max-width: 900px)').matches;
      const en = isEn();
      const timeEl = recBadge.querySelector('.mango-rec-time-text');

      // ── 꺼짐 → 켜기 ──────────────────────────────────────────────
      if (!isRecording) {
        if (_recStartInFlight) return;
        startRetryAt = 0;   // 👆 사람이 누른 것은 «지금 하겠다» 는 뜻 — 대기시간을 건너뛴다
        if (timeEl) timeEl.textContent = en ? 'Starting…' : '시작 중…';
        recBadge.style.pointerEvents = 'none';
        try {
          await startRecording({ auto: true });
        } catch (e) {
          console.warn('[mango-rec] 수동 재시작 예외:', e);
          dupBlocked = false;                              // 사유가 통신 오류면 그렇게 보이게 둔다
          startRetryAt = Date.now() + START_RETRY_MS;
        }
        // 실패했으면 다시 «눌러서 시작» 으로 되돌린다 (성공하면 startRecording 이 칠했다)
        if (!isRecording) paintRecBadge();
        return;
      }

      // ── 켜짐 → 끄기 ──────────────────────────────────────────────
      if (isMobile && !recBadge.classList.contains('mango-rec-expanded')) {
        recBadge.classList.add('mango-rec-expanded');
        return;
      }
      const ok = window.confirm(en
        ? 'Stop auto recording?\nWhat has been recorded so far will be saved.\n(You can start it again by tapping the same button.)'
        : '자동녹화를 중지할까요?\n지금까지 녹화된 영상은 저장됩니다.\n(같은 버튼을 다시 누르면 재시작됩니다.)');
      if (!ok) return;
      if (timeEl) timeEl.textContent = en ? 'Saving…' : '저장 중…';
      recBadge.style.pointerEvents = 'none';
      try {
        await stopRecording();
      } catch (e) {
        console.warn('[mango-rec] 수동 중지 예외:', e);
      }
    });
    document.body.appendChild(recBadge);  // 일단 body에 — 이후 recDockBadge()가 툴바로 이동
    recDockBadge();                       // 즉시 1차 도킹 시도 (실패해도 갱신 인터벌이 재시도)

    if (!document.getElementById('mango-rec-style')) {
      const s = document.createElement('style');
      s.id = 'mango-rec-style';
      s.textContent = [
        '@keyframes mango-rec-blink{0%,100%{opacity:1}50%{opacity:0.3}}',
        // 기본(데스크탑) 풀 배지
        '#mango-rec-badge{position:fixed;top:104px;right:16px;background:#dc2626;color:#fff;padding:8px 14px;border-radius:20px;font-weight:600;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(220,38,38,0.4);display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;transition:all 0.2s ease;}',
        // 🥭 툴바에 도킹된 경우: 고정 위치 해제, 인라인 칩으로 EN 왼쪽에 흐르게 (모바일 media query의 !important 무력화)
        '#mango-rec-badge[data-docked]{position:static !important;top:auto !important;right:auto !important;bottom:auto !important;left:auto !important;width:auto !important;height:auto !important;border-radius:20px !important;padding:6px 12px !important;align-self:center;margin-right:8px;box-shadow:none;}',
        '#mango-rec-badge .mango-rec-dot{width:8px;height:8px;background:#fff;border-radius:50%;animation:mango-rec-blink 1s infinite;display:inline-block;}',
        // ⚠ 녹화가 사실상 기록되지 않는 상태 — 배지를 주황으로 바꿔 눈에 띄게 한다
        '#mango-rec-badge.mango-rec-stalled{background:#b45309 !important;box-shadow:0 0 0 3px rgba(245,158,11,.35);}',
        '#mango-rec-badge.mango-rec-stalled .mango-rec-dot{animation:none;background:#fde68a;}',
        // ⏹ 녹화가 꺼진 상태 — «다시 켜는 버튼»으로 그 자리에 남는다(회색+깜빡임 없음)
        '#mango-rec-badge.mango-rec-off{background:#64748b !important;box-shadow:0 2px 8px rgba(0,0,0,.25) !important;}',
        '#mango-rec-badge.mango-rec-off .mango-rec-dot{animation:none;background:#cbd5e1;}',
        '#mango-rec-badge .mango-rec-time-text{display:inline;}',
        '#mango-rec-badge .mango-rec-stop{display:inline;font-size:13px;line-height:1;}',
        // 모바일: 작은 원형 점으로 축소 (시간/정지 숨김), 탭하면 확장
        '@media (max-width: 900px){' +
          // fix (2026-06-02 v2) — 녹화 빨간 원을 상단 우측 ✕ 버튼 바로 옆으로 (헤더 안)
          '#mango-rec-badge{top:calc(env(safe-area-inset-top, 0) + 10px) !important;bottom:auto !important;right:52px !important;padding:0;border-radius:50%;width:30px;height:30px;background:#ef4444 !important;box-shadow:0 2px 8px rgba(0,0,0,0.30);gap:0;opacity:1;display:flex;align-items:center;justify-content:center;}' +
          '#mango-rec-badge .mango-rec-time-text{display:none;}' +
          '#mango-rec-badge .mango-rec-stop{display:none;}' +
          '#mango-rec-badge.mango-rec-expanded{width:auto;height:auto;border-radius:20px;padding:6px 12px;opacity:1;gap:6px;}' +
          '#mango-rec-badge.mango-rec-expanded .mango-rec-time-text{display:inline;font-size:12px;}' +
          '#mango-rec-badge.mango-rec-expanded .mango-rec-stop{display:inline;font-size:13px;}' +
          // ⏹ 꺼짐 상태는 «점»으로 줄이지 않는다 — 점만 보이면 다시 켤 수 있다는 걸 아무도 모른다
          '#mango-rec-badge.mango-rec-off{width:auto !important;height:auto !important;border-radius:20px !important;' +
            'padding:6px 12px !important;gap:6px;background:#64748b !important;}' +
          '#mango-rec-badge.mango-rec-off .mango-rec-time-text{display:inline !important;font-size:12px;}' +
          '#mango-rec-badge.mango-rec-off .mango-rec-stop{display:inline !important;font-size:13px;}' +
          // 툴바 REC 버튼도 모바일에서는 컴팩트
          '#mango-rec-btn{padding:4px 8px !important;font-size:14px !important;min-width:auto !important;}' +
        '}',
        // ⛔ «학생 미동의로 차단» — 꺼짐(회색)과 구별되는 진한 빨강.
        //    ⚠️ 반드시 시트 맨 끝: .mango-rec-off 의 background !important(위 + 모바일 미디어쿼리)와
        //    특정성이 겹치므로 «뒤에 온 것» 이어야 이긴다. 이중 클래스로 특정성도 한 칸 올려 둔다.
        '#mango-rec-badge.mango-rec-off.mango-rec-consent{background:#991b1b !important;box-shadow:0 0 0 3px rgba(220,38,38,.25) !important;}',
        '#mango-rec-badge.mango-rec-off.mango-rec-consent .mango-rec-dot{animation:none;background:#fecaca;}'
      ].join('\n');
      document.head.appendChild(s);
    }
    setInterval(() => {
      if (!recBadge) return;
      // 수업 밖에서는 흔적을 남기지 않는다 (꺼짐 배지가 홈 화면까지 따라오면 안 됨)
      if (!isRecording && !document.body.classList.contains('vc-in-call')) { removeRecBadge(); return; }
      recDockBadge();   // 매초 재시도(멱등) — 툴바가 늦게 생겨도 결국 EN 왼쪽 도킹
      if (!isRecording) return;
      const t = document.getElementById('mango-rec-time');
      if (t) {
        const e = Math.floor((Date.now() - startedAt) / 1000);
        t.textContent = 'REC ' + String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0');
      }
    }, 1000);
  }
 
  // ── R2 multipart 업로드 함수들 ──
 
  // 버퍼가 PART_SIZE 이상이면 «정확히 PART_SIZE 바이트»만 잘라 올리고 나머지는 이월한다.
  // (MediaRecorder 청크 크기가 들쭉날쭉해도 파트 크기는 항상 동일 — R2 오류 10048 방지)
  function bufferChunk(blob) {
    if (!r2InitDone) return;
    chunkBuffer.push(blob);
    chunkBufferSize += blob.size;
    while (chunkBufferSize >= PART_SIZE) {
      const merged = new Blob(chunkBuffer, { type: 'video/webm' });
      const part = merged.slice(0, PART_SIZE);
      const rest = merged.slice(PART_SIZE);
      chunkBuffer = rest.size > 0 ? [rest] : [];
      chunkBufferSize = rest.size;
      enqueuePart(part);
    }
  }

  // 🛟 스냅샷 보내기 — 조각이 아직 하나도 안 올라간 동안에만.
  //   ⚠️ 버퍼를 비우지 않는다. 이건 «사본» 이고, 정본은 여전히 multipart 다.
  function maybeSnapshot() {
    if (!r2InitDone || !r2Key) return;
    if (r2PartNumber > 0) return;          // 조각이 하나라도 올라갔으면 안전망이 필요 없다
    if (snapInFlight || snapCount >= SNAP_MAX) return;
    if (chunkBufferSize <= 0) return;
    const now = Date.now();
    if (!snapNextAt) snapNextAt = (startedAt || now) + SNAP_FIRST_MS;
    if (now < snapNextAt) return;
    snapInFlight = true;
    snapNextAt = now + SNAP_EVERY_MS;
    const body = new Blob(chunkBuffer, { type: 'video/webm' });
    const key = r2Key;
    fetch('/api/recordings/upload/snapshot?key=' + encodeURIComponent(key),
          { method: 'PUT', body: body })
      .then(function (res) {
        if (res.ok) {
          snapCount += 1;
          console.log('[mango-rec] 스냅샷 저장:', snapCount, (body.size / 1048576).toFixed(2) + 'MB');
        } else {
          console.warn('[mango-rec] 스냅샷 실패:', res.status);
        }
      })
      .catch(function (err) { console.warn('[mango-rec] 스냅샷 에러:', err); })
      .then(function () { snapInFlight = false; });
  }

  // 남은 버퍼를 마지막 파트로 (마지막 파트만 PART_SIZE 미만 허용)
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
                  '&part=' + pn +
                  '&rid=' + encodeURIComponent(recordingId);   // 서버 파트 장부용
      // 파트 하나가 유실되면 구멍 난 채로 이어붙여져 영상이 깨진다 — 일시 오류는 재시도
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url, { method: 'PUT', body: blob });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          r2Parts.push({ partNumber: pn, etag: data.etag });
          console.log('[mango-rec] R2 파트 업로드:', pn, (blob.size / 1048576).toFixed(1) + 'MB', '누적:', (r2TotalBytes / 1048576).toFixed(1) + 'MB');
          return;
        } catch (err) {
          console.error('[mango-rec] 파트 업로드 실패:', pn, '시도', attempt, err);
          if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
      console.error('[mango-rec] 파트 최종 유실:', pn);
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
      r2CompleteSent = true;   // beforeunload 쪽 중복 전송 차단
      /* 🔁 (2026-09-02) 한 번 더 물어본다.
         서버는 complete 가 실패해도 head() 로 실물을 확인해 «있으면 성공» 으로 자가복구한다
         (recordings-r2.ts 2026-08-04 주석). 그런데 multipart 완료 직후 잠깐 안 보이는 구간이
         있어서 서버 안의 300ms 재시도로 못 덮는 경우가 있다 — 그때 클라이언트가 한 번만 더
         물어보면 그 자리에서 «완료» 로 돌아온다.
         ⚠️ 서버는 이 재요청에 안전하다: 이미 completed 면 (a) 가드가 그대로 성공을 돌려주고,
            upload_failed 면 일부러 통과시켜 자가복구를 노린다.
         ⛔ 무한 재시도는 하지 않는다 — 이 경로는 수업이 끝날 때마다 도는 자리다. */
      const sendComplete = async () => {
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
        return res;
      };
      let res = null;
      try {
        res = await sendComplete();
        console.log('[mango-rec] R2 complete:', res);
      } catch (err) {
        console.error('[mango-rec] R2 complete 에러:', err);
      }
      /* ⏱ 이 재시도는 «수업 나가기» 를 그만큼 늦춘다 — stopRecording() 의 Promise 를
         vcLeaveRoom() 이 기다린다(idx-main.js). 그래서 ① 서버 안 재시도(300ms)를 덮을 만큼만
         짧게 잡고(900ms) ② 페이지가 이미 숨겨졌으면(탭 닫힘·앱 전환) 건너뛴다 —
         그 경우는 beforeunload 비콘 경로가 맡는다. */
      if ((!res || !res.ok) && document.visibilityState !== 'hidden') {
        await new Promise(r => setTimeout(r, 900));
        try {
          res = await sendComplete();
          console.log('[mango-rec] R2 complete 재시도:', res);
        } catch (err2) {
          console.error('[mango-rec] R2 complete 재시도 에러:', err2);
          return false;
        }
      }
      return !!(res && res.ok);
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
    r2CompleteSent = false;   // 새 녹화에서는 다시 beforeunload 안전망이 살아나야 한다
    chunkBuffer = [];
    chunkBufferSize = 0;
    snapNextAt = 0;
    snapCount = 0;
    snapInFlight = false;
  }
 
  function onBeforeUnload() {
    if (!r2Key || !r2UploadId || !recordingId) return;
    if (r2CompleteSent) return;   // 정상 종료가 이미 complete 를 보냈다 — 두 번 보내면 10048/10024
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
      // 조각이 하나도 없다 = 아직 5MiB 를 못 채운 «짧은 녹화».
      // ⛔ 예전엔 이 abort 로 녹화가 통째로 사라졌다. 지금은 서버가 abort 를 받으면
      //    `<키>.snap` 스냅샷을 진짜 키로 되살린다(recordings-r2.ts promoteSnapshot).
      //    그러니 abort 는 그대로 보내야 한다 — 이게 «되살려라» 신호를 겸한다.
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
    // 👁 참관자는 녹화하지 않는다 — 버튼·자동·그 밖의 어떤 경로든 여기를 지난다
    if (isObserverNow()) {
      console.log('[mango-rec] 참관 중 — 녹화하지 않습니다');
      if (!auto) {
        try { alert(isEn() ? '👁 Observing — recording is off while you observe.'
                           : '👁 참관 중에는 녹화하지 않습니다.'); } catch (_) {}
      }
      return;
    }
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
      consentBlocked = (startRes?.error === 'consent_required');
      /* 🎥 «다른 기기가 이미 찍고 있다» — 실패가 아니라 «정상적으로 양보한» 상태다.
         그래서 경고창을 띄우지 않는다(강사가 손으로 눌렀을 때도 조용히 사유만 배지에 남긴다). */
      dupBlocked = (startRes?.error === 'already_recording');
      // ⏱ 어떤 사유든 곧바로 다시 두드리지 않는다. 다만 «영영 포기» 도 아니다(위 주석 참고).
      startRetryAt = Date.now() + START_RETRY_MS;
      if (!auto && dupBlocked) {
        console.log('[mango-rec] 다른 기기가 이미 녹화 중 — 시작하지 않습니다');
      } else if (!auto) {
        alert(consentBlocked
          ? (isEn()
              ? '⛔ Recording is blocked: the student (or parent) has not agreed to recording.\nIt will work once they accept the consent popup on their screen.'
              : '⛔ 학생(학부모)이 촬영 동의를 하지 않아 녹화를 시작할 수 없습니다.\n학생 화면의 동의 팝업을 수락하면 녹화할 수 있습니다.')
          : '녹화 시작 실패');
      }
      console.warn('[mango-rec] 녹화 시작 실패:', startRes);
      return;
    }
    consentBlocked = false;
    dupBlocked = false; startRetryAt = 0;
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
    recTotalBytes = 0;
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
    mediaRecorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 900_000 });
    /* 🪶 (2026-09-05) 1.2Mbps → 0.9Mbps. fps 를 15 → 10 으로 낮췄으므로 **프레임당** 비트는
       오히려 늘어(80kb → 90kb) 정지 화면(교재) 화질은 유지된다. 업로드만 25% 준다.
       ⚠️ 오디오는 건드리지 않는다(기본값) — 소리는 수업의 핵심이다.
       ⚠️ 첫 5MiB 파트가 생기기까지가 길어진다 — 영상만 세면 35초 → **47초**(오디오까지 세면
          실제로는 31초 → 41초). 하니스 ⑦절은 «영상만» 으로 보수적으로 재므로 47초가 정본이다.
          스냅샷 창(9초 + 12초 × 14 = **177초**까지, SNAP_MAX 15장)이 충분히 덮는다.
       ⛔ 여기를 더 내릴 거면 SNAP_EVERY_MS 도 함께 보라 — 그 구간이 스냅샷 2회 밑으로 내려가면
          탭이 일찍 닫힌 수업이 통째로 사라진다(⑦절이 FAIL 낸다). */
 
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recTotalBytes += e.data.size;
        recordedChunks.push(e.data);
        // R2에도 버퍼링
        bufferChunk(e.data);
        // 🛟 조각이 아직 하나도 안 올라간 구간이면 스냅샷 한 장.
        //   ⚠️ bufferChunk 안에서 부르지 말 것 — rec_multipart_uniform_harness 가 그 함수만
        //      떼어내 실제로 돌리기 때문에 «파트 크기 균일» 검사가 통째로 깨진다.
        maybeSnapshot();
      }
    };
    startStallWatch();
 
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
          size_bytes: blob.size,
          // 🔴 2026-08-26: 이 한 줄이 없어서 서버가 «업로드가 됐는지» 를 알 방법이 없었고,
          //   클라우드에 아무것도 없는 녹화까지 「완료」로 적혔다. 서버는 이 값과 별개로
          //   실물(head)도 확인하지만, create 부터 실패해 키조차 없는 경우는 이것만이 단서다.
          r2_success: !!r2Success
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
    if (composeKeepAlive) clearInterval(composeKeepAlive);
    composeKeepAlive = null;
    stopStallWatch();
    if (audioRescanTimer) clearInterval(audioRescanTimer);
    audioRescanTimer = null;
    mixedTrackIds = null;
    if (audioCtx) try { audioCtx.close(); } catch (_) {}
    audioCtx = null;
    audioDest = null;
    composeCanvas = null;
    composeCtx = null;
    paintRecBadge();   // 지우지 않는다 — «꺼짐(눌러서 시작)» 으로 그 자리에 남긴다
    updateRecButton();
    try {
      const conn = (typeof vcConn !== 'undefined' ? vcConn : null);
      if (conn && conn.readyState === 1) {
        conn.send(JSON.stringify({
          type: 'chat-message',
          /* 🔴 (2026-08-07 Kaye 3번) "실수로 녹화를 껐을 때 다시 켜는 버튼이 따로 있나요?"
             있다 — 상단의 회색 «녹화 꺼짐 · 눌러서 시작» 배지가 바로 그 버튼이다(2026-08-06 신설).
             그런데 그걸 아는 방법이 없었다. 끈 순간 그 자리에서 한/영으로 알려 준다. */
          data: { username: '시스템', message: '⏹ 녹화가 종료되었습니다. 다시 녹화하려면 상단의 「녹화 꺼짐 · 눌러서 시작」 버튼을 누르세요.'
                                             + ' / Recording stopped. To record again, tap the grey “REC OFF · Tap to start” badge at the top.' }
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
 
      /* 🧪 (2026-08-07) 연습·데모 방(demo-N)은 «수업이 아니다» — 자동녹화하지 않는다.
         신입 교육·연습을 R2 에 쌓으면 저장 비용만 늘고 녹화 목록이 실제 수업으로 오염된다.
         진짜 필요하면 상단 배지를 눌러 손으로 시작할 수 있다(막지는 않는다). */
      var _isDemoRoom = false;
      try { _isDemoRoom = /^demo-\d+$/i.test(String(typeof vcRoomId !== 'undefined' ? vcRoomId : '')); } catch (_) {}
      // 수업 뷰에 있고, 아직 녹화 안 했으면 자동 시작
      var _observing = isObserverNow();   // 👁 참관 중이면 자동녹화도, «켜는 배지» 도 없다
      var _staffSkip = isStaffSkipRecording();
      /* ⏱ startRetryAt — 앞선 시도가 실패했으면 그 시각까지 기다린다(위 선언부 주석).
         ⛔ 이 조건을 빼면 3초 폴링이 서버 /api/recordings/start 를 계속 두드린다. */
      if (inCall && !_isDemoRoom && !_observing && !_staffSkip && !isRecording && !autoRecStarted && !autoRecPending
          && Date.now() >= startRetryAt) {
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
              /* 🎥 (2026-09-08 함정 대조) 예외(429 속도제한·통신 오류)로 끝나면 startRecording 이
                 startRetryAt 을 못 건다 → 3초 폴링이 그대로 다시 두드린다. 여기서 대신 건다.
                 ⛔ dupBlocked 는 함께 푼다 — 실제 사유가 통신 오류인데 배지가 계속
                    「다른 기기가 녹화 중」이라고 말하면 그건 거짓말이다. */
              dupBlocked = false;
              startRetryAt = Date.now() + START_RETRY_MS;
            }
            /* 🎥 (2026-09-08) 서버가 «미동의»·«다른 기기가 녹화 중» 으로 거절하면 startRecording 은
               예외를 던지지 않고 조용히 돌아온다. 그때 autoRecStarted 가 true 로 남으면 이 기기는
               **그 수업 내내 다시 시도하지 않는다** — 상대 기기가 죽어도 이어받지 못한다.
               ⟹ 시작하지 못했으면 되돌린다. 폭주는 startRetryAt(60초)가 막는다. */
            if (!isRecording) autoRecStarted = false;
          }
        }, 3000);
      }

      // 🔴 녹화가 꺼져 있는 동안에도 «다시 켜는 버튼»은 항상 보여야 한다.
      //   (수동 중지 후 · 자동 시작이 실패한 뒤 둘 다 해당 — 예전엔 어느 쪽도 버튼이 없었다)
      if (inCall && !_observing && !isRecording && !autoRecPending && !_recStartInFlight) showRecBadge();
    }

    // 수업에서 나갔으면 자동녹화 플래그 리셋
    if (!inCall && autoRecStarted) {
      autoRecStarted = false;
    }
    // 미동의 차단도 방을 나가면 푼다 — 다음 수업(다른 학생)까지 끌고 가면 멀쩡한 방에 ⛔ 가 뜬다
    if (!inCall && consentBlocked) consentBlocked = false;
    // 🎥 «다른 기기가 녹화 중» 도 같은 이유로 방을 나가면 푼다(다음 수업까지 끌고 가면 안 된다)
    if (!inCall && (dupBlocked || startRetryAt)) { dupBlocked = false; startRetryAt = 0; }
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
// end mango-rec.js
