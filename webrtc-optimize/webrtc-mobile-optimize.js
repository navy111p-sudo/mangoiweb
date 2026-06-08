/* ════════════════════════════════════════════════════════════════════════
   📱🔥 망고아이 — 모바일 WebRTC 발열(CPU/GPU) 최소화 모듈
   ────────────────────────────────────────────────────────────────────────
   발열의 3대 원인과 이 모듈의 처방:
     1) 카메라 해상도·프레임이 높음        → 낮춰서 캡처 (VGA/HD + 15~20fps)
     2) 인코더가 비싼 코덱을 풀가동         → 효율 좋은 코덱(H.264/VP8) 우선 + 비트레이트 상한
     3) 안 보는데도 계속 영상 처리          → 백그라운드/숨김 시 트랙 끄기
     4) 비디오 렌더링이 GPU를 과하게 사용   → CSS로 합성(compositing) 최적화

   사용법(요약):
     const stream = await getOptimizedStream();          // ① 저부하 카메라
     pc.addTrack(stream.getVideoTracks()[0], stream);
     preferEfficientCodec(transceiver);                  // ② 코덱 우선순위 (offer 만들기 전에)
     await capSendBitrate(pc, { kbps: 500, fps: 15 });   // ② 송신 비트레이트·fps 상한
     enableBackgroundThrottle(stream);                   // ③ 백그라운드 절전
     // ④ CSS 는 맨 아래 가이드 참고
   ════════════════════════════════════════════════════════════════════════ */

/* ┌──────────────────────────────────────────────────────────────────────┐
   │ ① 비디오 해상도·프레임 제한 (getUserMedia Constraints)                  │
   └──────────────────────────────────────────────────────────────────────┘
   · ideal = 권장값, max = 절대 넘지 않을 상한.
   · 모바일은 화면이 작아 VGA(640x480)면 충분히 또렷하고 발열이 확 줄어듭니다.
   · frameRate 를 15~20 으로 낮추면 초당 처리할 프레임이 절반 → CPU 큰 절감.   */
async function getOptimizedStream(opts = {}) {
  const hd = !!opts.hd; // true 면 HD(1280x720), 기본은 VGA(640x480)
  const constraints = {
    audio: {
      echoCancellation: true,   // 에코 제거
      noiseSuppression: true,   // 잡음 제거
      autoGainControl: true,    // 자동 볼륨
    },
    video: {
      facingMode: 'user',                                   // 전면 카메라
      width:  { ideal: hd ? 1280 : 640, max: hd ? 1280 : 1280 },
      height: { ideal: hd ?  720 : 480, max: hd ?  720 :  720 },
      frameRate: { ideal: 15, max: 20 },                    // 🔥 핵심: 30→15fps
    },
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    // 일부 기기는 까다로운 constraints 를 거부 → 더 느슨하게 재시도
    console.warn('[opt] 정밀 constraints 실패, 폴백:', e?.name || e);
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
  }

  // 캡처가 시작된 뒤에도 한 번 더 프레임을 눌러줌(기기가 무시했을 수 있어 보강)
  try {
    const track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      await track.applyConstraints({ frameRate: { ideal: 15, max: 20 } });
    }
  } catch (_) {}

  return stream;
}

/* ┌──────────────────────────────────────────────────────────────────────┐
   │ ② 코덱 우선순위 — H.264 / VP8 우선 (전력 효율 좋은 코덱)                 │
   └──────────────────────────────────────────────────────────────────────┘
   · VP9/AV1 은 화질은 좋지만 인코딩 연산이 무거워 모바일에서 발열·배터리에 불리.
   · H.264·VP8 은 대부분의 폰이 하드웨어 가속을 지원 → 칩이 대신 일해 CPU·발열↓.
   · 반드시 offer/answer 를 만들기 "전에" 호출하세요.                          */
function preferEfficientCodec(transceiver, order = ['video/H264', 'video/VP8']) {
  // 이 브라우저가 setCodecPreferences 를 지원하지 않으면 조용히 통과
  if (!transceiver || typeof transceiver.setCodecPreferences !== 'function') return false;
  if (!window.RTCRtpReceiver || !RTCRtpReceiver.getCapabilities) return false;

  const caps = RTCRtpReceiver.getCapabilities('video');
  if (!caps || !caps.codecs) return false;

  const wanted = [];
  // 원하는 코덱을 우선순위대로 먼저 담고
  order.forEach((mime) => {
    caps.codecs.forEach((c) => {
      if (c.mimeType.toLowerCase() === mime.toLowerCase()) wanted.push(c);
    });
  });
  // 나머지 코덱(rtx, red 등 + 그 외)을 뒤에 붙임 — 빠지면 연결이 깨질 수 있음
  caps.codecs.forEach((c) => { if (!wanted.includes(c)) wanted.push(c); });

  try {
    transceiver.setCodecPreferences(wanted);
    return true;
  } catch (e) {
    console.warn('[opt] setCodecPreferences 실패:', e);
    return false;
  }
}

/* ┌──────────────────────────────────────────────────────────────────────┐
   │ ②-b 송신 비트레이트·프레임·해상도 상한 (RTCRtpSender.setParameters)      │
   └──────────────────────────────────────────────────────────────────────┘
   · 발열의 진짜 주범은 "인코더". 비트레이트와 fps 상한을 직접 걸어 인코더를 쉬게 함.
   · degradationPreference 로 "프레임 줄이기"를 우선 → 움직임 적은 수업에 적합·시원함.  */
async function capSendBitrate(pc, { kbps = 500, fps = 15, scaleDown = 1 } = {}) {
  const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
  if (!sender || !sender.getParameters) return;

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];

  params.encodings[0].maxBitrate = kbps * 1000;   // 예: 500kbps 상한
  params.encodings[0].maxFramerate = fps;          // 예: 15fps 상한
  params.encodings[0].scaleResolutionDownBy = scaleDown; // 2 로 주면 해상도 1/2 (더 시원)

  // 'maintain-framerate'=화질↓ 유지, 'maintain-resolution'=fps↓ 유지, 'balanced'=절충
  params.degradationPreference = 'balanced';

  try { await sender.setParameters(params); }
  catch (e) { console.warn('[opt] setParameters 실패:', e); }
}

/* ┌──────────────────────────────────────────────────────────────────────┐
   │ ③ 백그라운드·숨김 시 비디오 트랙 끄기 (CPU 절약)                          │
   └──────────────────────────────────────────────────────────────────────┘
   · track.enabled = false 로 두면 카메라 인코딩이 멈춰 CPU·발열이 크게 줄어듭니다.
   · (track.stop() 과 달리 enabled=false 는 다시 켜기가 즉시 가능 → 수업 중 안전)
   · 화면을 다시 보면 자동으로 켜집니다. 오디오는 끊기지 않게 그대로 둡니다.        */
function enableBackgroundThrottle(stream, opts = {}) {
  const keepAudio = opts.keepAudio !== false; // 기본: 소리는 유지
  const videoTracks = () => stream.getVideoTracks();

  function setVideo(on) {
    videoTracks().forEach((t) => { t.enabled = on; });
    if (!keepAudio) stream.getAudioTracks().forEach((t) => { t.enabled = on; });
  }

  // 탭 전환·화면 끄기·앱 백그라운드 → 영상 정지 / 돌아오면 재개
  document.addEventListener('visibilitychange', () => {
    setVideo(document.visibilityState === 'visible');
  });
  // 일부 모바일은 visibility 대신 pagehide/pageshow 만 옴
  window.addEventListener('pagehide', () => setVideo(false));
  window.addEventListener('pageshow', () => setVideo(true));
  // 창 포커스 잃음(다른 앱) 보강
  window.addEventListener('blur',  () => { if (document.hidden) setVideo(false); });
  window.addEventListener('focus', () => setVideo(true));

  return { pause: () => setVideo(false), resume: () => setVideo(true) };
}

/* ┌──────────────────────────────────────────────────────────────────────┐
   │ ③-b 화면에 "안 보이는" 원격 영상의 <video> 렌더링 멈추기                  │
   └──────────────────────────────────────────────────────────────────────┘
   · 스크롤로 화면 밖에 있거나 display:none 인 영상은 디코딩/그리기를 멈춰 GPU 절약.
   · IntersectionObserver 로 보일 때만 play(), 안 보이면 pause().                */
function throttleOffscreenVideos(selector = 'video') {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting) { v.play && v.play().catch(() => {}); }
      else                   { v.pause && v.pause(); }
    });
  }, { threshold: 0.01 });

  document.querySelectorAll(selector).forEach((v) => io.observe(v));
  return io; // 새 영상 추가 시 io.observe(newVideo) 로 등록
}

/* ════════════════════════════════════════════════════════════════════════
   ④ 렌더링(GPU) 최적화 — CSS 가이드  (아래 내용을 .css 파일/스타일에 넣으세요)
   ────────────────────────────────────────────────────────────────────────

   video {
     object-fit: cover;            ┃ 비율 계산을 단순화 (레이아웃 비용↓)
     transform: translateZ(0);     ┃ 비디오를 별도 GPU 레이어로 → 합성만, 재페인트 안 함
     will-change: transform;       ┃ 브라우저에 "이 요소 곧 움직임" 힌트 → 미리 레이어화
     backface-visibility: hidden;  ┃ 뒷면 렌더 제거 (모바일 깜빡임·부하↓)
     contain: layout paint;        ┃ 이 박스 안 변화가 바깥 레이아웃을 안 건드리게 격리
   }

   ⚠️ 발열을 키우는 것들 — 비디오에는 피하세요:
     · box-shadow, filter:blur(), backdrop-filter  → 매 프레임 GPU 재계산 = 뜨거움
     · border-radius 큰 값 + 그림자 동시 사용        → 합성 비용 급증
     · 비디오 위에 반투명 애니메이션 오버레이를 계속 돌리기

   ✅ will-change 는 "움직이는 요소에만" 쓰세요. 모든 요소에 남발하면
      오히려 레이어가 많아져 메모리·발열이 늘어납니다. 안 움직이면 빼세요.
   ════════════════════════════════════════════════════════════════════════ */

// (선택) CSS 를 자바스크립트로 즉시 주입하고 싶을 때 사용
function injectVideoRenderCSS() {
  if (document.getElementById('webrtc-opt-css')) return;
  const css = `
    .vc-video, #vc-video-grid video, .video-box video {
      object-fit: cover;
      transform: translateZ(0);
      will-change: transform;
      backface-visibility: hidden;
      contain: layout paint;
    }
    /* 비디오에는 그림자·블러 금지 (발열 주범) */
    .video-box, .vc-video { box-shadow: none !important; filter: none !important; }
  `;
  const el = document.createElement('style');
  el.id = 'webrtc-opt-css';
  el.textContent = css;
  document.head.appendChild(el);
}

/* ════════════════════════════════════════════════════════════════════════
   🚀 올인원 헬퍼 — 통화 시작 시 이거 하나만 호출하면 ①~④ 모두 적용
   ════════════════════════════════════════════════════════════════════════ */
async function startLowPowerCall(pc, { hd = false, kbps = 500, fps = 15 } = {}) {
  injectVideoRenderCSS();                               // ④ 렌더 최적화 CSS

  const stream = await getOptimizedStream({ hd });      // ① 저부하 카메라
  const videoTrack = stream.getVideoTracks()[0];

  // 트랜시버 추가 + ② 코덱 우선순위 (offer 전에!)
  const transceiver = pc.addTransceiver(videoTrack, { direction: 'sendrecv', streams: [stream] });
  preferEfficientCodec(transceiver);                    // ② H.264/VP8 우선
  stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));

  await capSendBitrate(pc, { kbps, fps });              // ② 비트레이트·fps 상한
  enableBackgroundThrottle(stream);                     // ③ 백그라운드 절전
  setTimeout(() => throttleOffscreenVideos('video'), 500); // ③-b 화면 밖 영상 정지

  return stream;
}

/* 모듈 export (필요 시) */
if (typeof window !== 'undefined') {
  window.MangoiRTCOpt = {
    getOptimizedStream,
    preferEfficientCodec,
    capSendBitrate,
    enableBackgroundThrottle,
    throttleOffscreenVideos,
    injectVideoRenderCSS,
    startLowPowerCall,
  };
}
